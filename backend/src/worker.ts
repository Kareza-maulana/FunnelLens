import { sql, asConfiguredOwner } from './database';
import { config } from './config';
import { getIntegrationToken, createMetaCampaign, createMetaAdSet, createMetaAd, updateMetaCampaignStatus } from './meta-ads';
import { syncCampaignMetrics, syncCampaignStructure, syncCampaignStatus } from './sync';
import { createAgentRun, startRun, completeRun, failRun, recordStep } from './agent';
import { generateExternalInsight } from './ai';

export async function completeJob(
  tx: any,
  jobId: string,
  recordsRead?: number,
  recordsWritten?: number
): Promise<void> {
  await tx`
    update app.jobs
    set status = 'succeeded',
        lease_owner = null,
        lease_until = null,
        finished_at = clock_timestamp(),
        records_read = coalesce(${recordsRead ?? null}, records_read),
        records_written = coalesce(${recordsWritten ?? null}, records_written),
        updated_at = clock_timestamp()
    where id = ${jobId}
  `;
}

export async function failJob(
  tx: any,
  job: { id: string; kind: string; attempt: number; max_attempts: number },
  errorCode: string,
  errorSummary: string
): Promise<void> {
  const isExecute = job.kind === 'execute';
  let nextStatus: string;
  if (isExecute) {
    nextStatus = 'needs_reconciliation';
  } else if (job.attempt >= job.max_attempts) {
    nextStatus = 'dead';
  } else {
    nextStatus = 'retry';
  }

  const backoffSeconds = Math.max(1, (job.attempt || 1) * 30);

  await tx`
    update app.jobs
    set status = ${nextStatus},
        lease_owner = null,
        lease_until = null,
        error_code = ${errorCode.slice(0, 100)},
        error_summary = ${errorSummary.slice(0, 1000)},
        run_after = clock_timestamp() + make_interval(secs => ${backoffSeconds}),
        updated_at = clock_timestamp()
    where id = ${job.id}
  `;
}

export async function handleExecuteJob(tx: any, job: any, actorId: string): Promise<void> {
  // 1. Ambil data action_request, campaign, dan draft
  const [req] = await tx`
    select r.id as request_id, r.campaign_id, r.draft_id, r.status, r.baseline_control_version, r.payload,
           c.integration_id, c.external_ad_account_id, c.name as campaign_name, c.objective as campaign_objective,
           c.currency, c.report_timezone, c.control_version,
           d.configuration
    from app.action_requests r
    join app.campaigns c on c.id = r.campaign_id
    join app.campaign_drafts d on d.id = r.draft_id
    where r.id = ${job.action_request_id}
  `;

  if (!req) {
    throw new Error(`Action request ${job.action_request_id} tidak ditemukan.`);
  }

  // 2. Siapkan Agent Run untuk eksekusi
  let runId = job.agent_run_id;
  if (!runId) {
    const run = await createAgentRun(tx, {
      purpose: 'execution',
      mode: 'deterministic',
      campaign_id: req.campaign_id,
      workflow_version: 'v1',
      output_schema_version: 'v1',
      idempotency_key: `execute:${job.id}:${job.attempt}`,
      input_refs: { action_request_id: job.action_request_id, draft_id: req.draft_id },
    });
    runId = run.id;
    await tx`update app.jobs set agent_run_id = ${runId} where id = ${job.id}`;
    await startRun(tx, runId);
  }

  const token = await getIntegrationToken(req.integration_id);
  const draftConfig = req.configuration as Record<string, any>;
  let checkpoint = (job.checkpoint as Record<string, any>) || {};
  checkpoint.external_ids = checkpoint.external_ids || {};
  checkpoint.external_ids.ad_sets = checkpoint.external_ids.ad_sets || {};
  checkpoint.external_ids.ads = checkpoint.external_ids.ads || {};

  // 3. Step 1: Buat Meta Campaign
  let metaCampaignId = checkpoint.external_ids.campaign;
  if (!metaCampaignId) {
    const step1 = await recordStep(tx, {
      agent_run_id: runId,
      job_id: job.id,
      sequence: 1,
      step_key: 'create_meta_campaign',
      kind: 'tool',
      is_write: true,
      tool_name: 'meta_graph_api',
      tool_version: 'v1',
      input_ref: `campaign_draft:${req.draft_id}`,
      status: 'running',
    });

    try {
      const metaCamp = await createMetaCampaign(token, req.external_ad_account_id, {
        name: draftConfig.name || req.campaign_name,
        objective: draftConfig.objective || req.campaign_objective,
        status: draftConfig.desired_status || 'PAUSED',
        special_ad_categories: [],
      });
      metaCampaignId = metaCamp.id;
      checkpoint = {
        ...checkpoint,
        external_ids: { ...checkpoint.external_ids, campaign: metaCampaignId },
      };
      await tx`update app.jobs set checkpoint = ${tx.json(checkpoint)} where id = ${job.id}`;
      await step1.succeed(tx, {
        external_object_id: metaCampaignId,
        result_refs: { campaign_id: metaCampaignId },
      });
    } catch (err: any) {
      await step1.fail(tx, err?.message || String(err));
      throw err;
    }
  }

  // 4. Step 2: Buat Meta Ad Sets
  const adSetsConfig = draftConfig.ad_sets || [];
  const metaAdSetIds: Record<string, string> = { ...checkpoint.external_ids.ad_sets };

  const step2 = await recordStep(tx, {
    agent_run_id: runId,
    job_id: job.id,
    sequence: 2,
    step_key: 'create_meta_ad_sets',
    kind: 'tool',
    is_write: true,
    tool_name: 'meta_graph_api',
    tool_version: 'v1',
    status: 'running',
  });

  try {
    for (const adSet of adSetsConfig) {
      const key = adSet.key || adSet.name;
      if (metaAdSetIds[key]) continue;

      const promotedObject: Record<string, unknown> = {};
      if (draftConfig.selected_page_id) {
        promotedObject.page_id = draftConfig.selected_page_id;
      }

      let dailyBudget: number | undefined;
      let lifetimeBudget: number | undefined;
      if (draftConfig.budget?.scope === 'ad_set' && adSet.budget) {
        if (adSet.budget.cadence === 'daily') dailyBudget = Math.round(adSet.budget.amount * 100);
        else lifetimeBudget = Math.round(adSet.budget.amount * 100);
      } else if (draftConfig.budget?.scope === 'campaign') {
        if (draftConfig.budget.cadence === 'daily') dailyBudget = Math.round(draftConfig.budget.amount * 100);
        else lifetimeBudget = Math.round(draftConfig.budget.amount * 100);
      }

      const createdAdSet = await createMetaAdSet(token, req.external_ad_account_id, {
        name: adSet.name,
        campaign_id: metaCampaignId,
        status: 'PAUSED',
        optimization_goal: draftConfig.objective === 'OUTCOME_LEADS' ? 'LEAD_GENERATION' : (draftConfig.objective === 'OUTCOME_ENGAGEMENT' ? 'POST_ENGAGEMENT' : 'LINK_CLICKS'),
        billing_event: 'IMPRESSIONS',
        bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
        daily_budget: dailyBudget,
        lifetime_budget: lifetimeBudget,
        targeting: adSet.targeting || {},
        start_time: draftConfig.starts_at,
        end_time: draftConfig.ends_at,
        promoted_object: Object.keys(promotedObject).length > 0 ? promotedObject : undefined,
      });

      metaAdSetIds[key] = createdAdSet.id;
      checkpoint = {
        ...checkpoint,
        external_ids: { ...checkpoint.external_ids, ad_sets: metaAdSetIds },
      };
      await tx`update app.jobs set checkpoint = ${tx.json(checkpoint)} where id = ${job.id}`;
    }

    await step2.succeed(tx, {
      result_refs: { ad_set_ids: metaAdSetIds },
    });
  } catch (err: any) {
    await step2.fail(tx, err?.message || String(err));
    throw err;
  }

  // 5. Step 3: Buat Meta Ads
  const metaAdIds: Record<string, string> = { ...checkpoint.external_ids.ads };

  const step3 = await recordStep(tx, {
    agent_run_id: runId,
    job_id: job.id,
    sequence: 3,
    step_key: 'create_meta_ads',
    kind: 'tool',
    is_write: true,
    tool_name: 'meta_graph_api',
    tool_version: 'v1',
    status: 'running',
  });

  try {
    for (const adSet of adSetsConfig) {
      const adSetKey = adSet.key || adSet.name;
      const metaAdSetId = metaAdSetIds[adSetKey];
      if (!metaAdSetId) continue;

      for (const creativeId of adSet.creative_ids || []) {
        const adKey = `${adSetKey}:${creativeId}`;
        if (metaAdIds[adKey]) continue;

        const frozenCreative = draftConfig.creatives?.find((c: any) => c.id === creativeId);
        const headline = frozenCreative?.content?.headline || draftConfig.name;
        const primaryText = frozenCreative?.content?.primary_text || '';
        const route = draftConfig.routes?.find((r: any) => r.type === adSet.route_type) || draftConfig.routes?.[0];
        const linkUrl = route?.type === 'landing_page' ? route.url : (route?.destination ? `https://wa.me/${String(route.destination).replace(/\D/g, '')}` : 'https://funnellens.local');

        const creativePayload: Record<string, unknown> = {
          name: `${adSet.name} - Creative`,
          object_story_spec: {
            page_id: draftConfig.selected_page_id,
            link_data: {
              message: primaryText,
              name: headline,
              link: linkUrl,
              call_to_action: {
                type: route?.type === 'whatsapp' ? 'WHATSAPP_MESSAGE' : 'LEARN_MORE',
              },
            },
          },
        };

        const createdAd = await createMetaAd(token, req.external_ad_account_id, {
          name: `${adSet.name} - Ad`,
          adset_id: metaAdSetId,
          creative: creativePayload,
          status: 'PAUSED',
        });

        metaAdIds[adKey] = createdAd.id;
        checkpoint = {
          ...checkpoint,
          external_ids: { ...checkpoint.external_ids, ads: metaAdIds },
        };
        await tx`update app.jobs set checkpoint = ${tx.json(checkpoint)} where id = ${job.id}`;
      }
    }

    await step3.succeed(tx, {
      result_refs: { ad_ids: metaAdIds },
    });
  } catch (err: any) {
    await step3.fail(tx, err?.message || String(err));
    throw err;
  }

  // 6. Sinkronisasi status lokal ke database
  // Perbarui app.campaigns: external_id, applied_draft_id, effective_status, control_version
  await tx`
    update app.campaigns
    set external_id = ${metaCampaignId},
        effective_status = ${draftConfig.desired_status || 'paused'},
        applied_draft_id = ${req.draft_id},
        control_version = ${req.control_version + 1},
        last_synced_at = clock_timestamp()
    where id = ${req.campaign_id}
  `;

  // Simpan / update app.ad_sets dan app.ads lokal
  for (const adSet of adSetsConfig) {
    const adSetKey = adSet.key || adSet.name;
    const metaAdSetId = metaAdSetIds[adSetKey];
    if (!metaAdSetId) continue;

    let budgetMode: 'campaign' | 'daily' | 'lifetime' = 'campaign';
    let budgetAmount: number | null = null;
    if (draftConfig.budget?.scope === 'ad_set' && adSet.budget) {
      budgetMode = adSet.budget.cadence === 'daily' ? 'daily' : 'lifetime';
      budgetAmount = Number(adSet.budget.amount);
    }

    const [savedAdSet] = await tx`
      insert into app.ad_sets (
        campaign_id,
        external_id,
        name,
        planned_segment,
        budget_mode,
        budget_amount,
        targeting,
        effective_status,
        last_synced_at
      ) values (
        ${req.campaign_id},
        ${metaAdSetId},
        ${adSet.name},
        'cold',
        ${budgetMode},
        ${budgetAmount},
        ${tx.json(adSet.targeting || {})},
        ${draftConfig.desired_status || 'paused'},
        clock_timestamp()
      )
      on conflict (campaign_id, external_id) do update set
        name = excluded.name,
        targeting = excluded.targeting,
        effective_status = excluded.effective_status,
        last_synced_at = clock_timestamp(),
        updated_at = clock_timestamp()
      returning id
    `;

    for (const creativeId of adSet.creative_ids || []) {
      const adKey = `${adSetKey}:${creativeId}`;
      const metaAdId = metaAdIds[adKey];
      if (!metaAdId) continue;

      await tx`
        insert into app.ads (
          campaign_id,
          ad_set_id,
          creative_id,
          external_id,
          name,
          effective_status,
          valid_from
        ) values (
          ${req.campaign_id},
          ${savedAdSet.id},
          ${creativeId},
          ${metaAdId},
          ${adSet.name + ' - Ad'},
          ${draftConfig.desired_status || 'paused'},
          clock_timestamp()
        )
        on conflict (campaign_id, external_id, valid_from) do update set
          name = excluded.name,
          effective_status = excluded.effective_status
      `;
    }
  }

  // 7. Selesaikan Agent Run
  await completeRun(tx, runId, {
    external_ids: checkpoint.external_ids,
  });
}

export async function handleSyncJob(tx: any, job: any, actorId: string): Promise<void> {
  const campaignId = job.input?.campaignId || job.input?.campaign_id;
  let campaigns: Array<{ id: string; external_id: string; integration_id: string; report_timezone: string; currency: string }>;

  if (campaignId) {
    campaigns = await tx`
      select id, external_id, integration_id, report_timezone, currency
      from app.campaigns
      where id = ${campaignId} and external_id is not null
    `;
  } else if (job.integration_id) {
    campaigns = await tx`
      select id, external_id, integration_id, report_timezone, currency
      from app.campaigns
      where integration_id = ${job.integration_id} and external_id is not null
    `;
  } else {
    campaigns = await tx`
      select id, external_id, integration_id, report_timezone, currency
      from app.campaigns
      where external_id is not null
    `;
  }

  let totalMetrics = 0;
  for (const camp of campaigns) {
    const rowsWritten = await syncCampaignMetrics(
      camp.integration_id,
      camp.id,
      camp.external_id,
      job.id,
      camp.report_timezone,
      camp.currency
    );
    totalMetrics += rowsWritten;
    await syncCampaignStructure(camp.integration_id, camp.id, camp.external_id);
    await syncCampaignStatus(camp.integration_id, camp.id, camp.external_id);
  }

  await tx`
    update app.jobs
    set records_written = ${totalMetrics}
    where id = ${job.id}
  `;
}

export async function handleIngestJob(tx: any, job: any, actorId: string): Promise<void> {
  console.log(`[Worker] Menjalankan ingest job: ${job.id}`);
  // Ingest job minimal: log dan berhasil
}

export async function handleAnalyzeJob(tx: any, job: any, actorId: string): Promise<void> {
  console.log(`[Worker] Menjalankan analyze job: ${job.id}`);
  const inputData = job.input?.data ?? job.input ?? {};
  try {
    const insight = await generateExternalInsight(inputData);
    await tx`
      update app.jobs
      set checkpoint = ${tx.json({ insight })},
          records_written = 1
      where id = ${job.id}
    `;
  } catch (error) {
    console.warn('[Worker] Analisis AI eksternal dilewati atau gagal:', error instanceof Error ? error.message : String(error));
  }
}

async function generateChunkEmbedding(
  content: string,
  dimensions: number,
  modelName?: string,
  provider?: string
): Promise<number[]> {
  // 1. Coba Ollama jika tersedia
  if (config.OLLAMA_BASE_URL) {
    try {
      const response = await fetch(`${config.OLLAMA_BASE_URL}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelName || config.LOCAL_AI_MODEL,
          prompt: content,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (response.ok) {
        const data = (await response.json()) as { embedding?: number[] };
        if (Array.isArray(data.embedding) && data.embedding.length === dimensions) {
          return data.embedding;
        }
      }
    } catch {
      // lanjut ke fallback
    }
  }

  // 2. Coba External AI jika tersedia
  if (config.EXTERNAL_AI_BASE_URL && config.EXTERNAL_AI_API_KEY) {
    try {
      const response = await fetch(`${config.EXTERNAL_AI_BASE_URL.replace(/\/$/, '')}/embeddings`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.EXTERNAL_AI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: modelName || 'text-embedding-3-small',
          input: content,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (response.ok) {
        const data = (await response.json()) as { data?: Array<{ embedding?: number[] }> };
        const emb = data.data?.[0]?.embedding;
        if (Array.isArray(emb) && emb.length === dimensions) {
          return emb;
        }
      }
    } catch {
      // lanjut ke fallback
    }
  }

  // 3. Fallback deterministik berbasis hash untuk dev/offline mode
  const vec: number[] = new Array(dimensions).fill(0);
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    hash = (hash << 5) - hash + content.charCodeAt(i);
    hash |= 0;
  }
  for (let i = 0; i < dimensions; i++) {
    const val = Math.sin(hash + i);
    vec[i] = val === 0 ? 0.001 : Number(val.toFixed(6));
  }
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0)) || 1;
  return vec.map((v) => Number((v / norm).toFixed(6)));
}

export async function handleEmbedJob(tx: any, job: any, actorId: string): Promise<void> {
  console.log(`[Worker] Menjalankan embed job: ${job.id}`);
  const docId = job.input?.document_id || job.input?.documentId;

  let chunks: Array<{
    id: string;
    document_id: string;
    content: string;
    chunk_index: number;
    embedding_profile_id: string;
    dimensions: number;
    model: string;
    provider: string;
  }>;

  if (docId) {
    chunks = await tx`
      select c.id, c.document_id, c.content, c.chunk_index, c.embedding_profile_id,
             p.dimensions, p.model, p.provider
      from app.knowledge_chunks c
      join app.embedding_profiles p on p.id = c.embedding_profile_id
      where c.document_id = ${docId} and c.status = 'pending'
      order by c.chunk_index
    `;
  } else {
    chunks = await tx`
      select c.id, c.document_id, c.content, c.chunk_index, c.embedding_profile_id,
             p.dimensions, p.model, p.provider
      from app.knowledge_chunks c
      join app.embedding_profiles p on p.id = c.embedding_profile_id
      where c.status = 'pending'
      order by c.created_at
      limit 50
    `;
  }

  let embeddedCount = 0;
  for (const chunk of chunks) {
    const vector = await generateChunkEmbedding(chunk.content, chunk.dimensions, chunk.model, chunk.provider);
    const vectorLiteral = `[${vector.join(',')}]`;

    await tx`
      update app.knowledge_chunks
      set embedding = ${vectorLiteral}::public.vector,
          status = 'ready'
      where id = ${chunk.id}
    `;
    embeddedCount++;
  }

  await tx`
    update app.jobs
    set records_written = ${embeddedCount}
    where id = ${job.id}
  `;
}

export async function pollAndProcess(workerName: string): Promise<boolean> {
  let claimedJob: any = null;

  // 1. Klaim satu job dari antrean yang siap diproses
  await asConfiguredOwner(async (tx) => {
    const [row] = await tx`select * from app.claim_job(${workerName})`;
    claimedJob = row ?? null;
  });

  if (!claimedJob) {
    return false;
  }

  // 2. Proses job sesuai jenisnya
  try {
    await asConfiguredOwner(async (tx, actorId) => {
      switch (claimedJob.kind) {
        case 'execute':
          await handleExecuteJob(tx, claimedJob, actorId);
          break;
        case 'sync':
          await handleSyncJob(tx, claimedJob, actorId);
          break;
        case 'ingest':
          await handleIngestJob(tx, claimedJob, actorId);
          break;
        case 'analyze':
          await handleAnalyzeJob(tx, claimedJob, actorId);
          break;
        case 'embed':
          await handleEmbedJob(tx, claimedJob, actorId);
          break;
        default:
          throw new Error(`Jenis job tidak dikenali: ${claimedJob.kind}`);
      }
      await completeJob(tx, claimedJob.id);
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[Worker ${workerName}] Job ${claimedJob.id} (${claimedJob.kind}) gagal:`, errorMsg);
    try {
      await asConfiguredOwner(async (tx) => {
        await failJob(tx, claimedJob, 'handler_error', errorMsg);
      });
    } catch (failErr) {
      console.error(`[Worker ${workerName}] Gagal menyimpan kegagalan job ${claimedJob.id}:`, failErr);
    }
  }

  return true;
}

let isPolling = false;

export function startWorker(workerName?: string): () => void {
  const name = workerName || `api-worker-${process.pid}`;
  console.log(`[Worker] Memulai background worker: ${name}`);

  const pollInterval = setInterval(async () => {
    if (isPolling) return;
    isPolling = true;
    try {
      await pollAndProcess(name);
    } catch (err) {
      console.error('[Worker] Kesalahan pada poll loop:', err);
    } finally {
      isPolling = false;
    }
  }, 5000);

  const reapInterval = setInterval(async () => {
    try {
      await asConfiguredOwner(async (tx) => {
        const [res] = await tx`select app.reap_expired_jobs() as reaped`;
        if (res?.reaped > 0) {
          console.log(`[Worker] Mereap ${res.reaped} expired job.`);
        }
      });
    } catch (err) {
      console.error('[Worker] Kesalahan saat reap expired jobs:', err);
    }
  }, 60000);

  return () => {
    console.log(`[Worker] Menghentikan background worker: ${name}`);
    clearInterval(pollInterval);
    clearInterval(reapInterval);
  };
}
