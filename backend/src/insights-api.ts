import { z } from 'zod';
import { asActor, sql } from './database';
import type { Owner } from './auth';
import { ApiError } from './auth';
import { createAgentRun, startRun, completeRun, failRun, recordStep, succeedStep, failStep } from './agent';
import { generateExternalInsight } from './ai';
import { maskPii } from './pii';
import { config } from './config';

export const insightAreaSchema = z.enum([
  'overview',
  'campaign',
  'creative',
  'audience',
  'funnel',
  'strategy',
  'business',
]);

export type InsightArea = z.infer<typeof insightAreaSchema>;

export const generateCampaignInsightInputSchema = z.object({
  campaignId: z.string().uuid('ID campaign harus berupa UUID valid.'),
  area: insightAreaSchema,
});

export type GenerateCampaignInsightInput = z.infer<typeof generateCampaignInsightInputSchema>;

export const listInsightsFiltersSchema = z.object({
  area: insightAreaSchema.optional(),
  campaignId: z.string().uuid('ID campaign harus berupa UUID valid.').optional(),
  reviewStatus: z.enum(['open', 'accepted', 'dismissed']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type ListInsightsFilters = {
  area?: InsightArea;
  campaignId?: string;
  reviewStatus?: 'open' | 'accepted' | 'dismissed';
  limit?: number;
};

export const reviewInsightInputSchema = z.object({
  insightId: z.string().uuid('ID insight harus berupa UUID valid.'),
  status: z.enum(['accepted', 'dismissed']),
  reason: z.string().trim().min(1, 'Alasan review tidak boleh kosong.').max(1000),
});

export type ReviewInsightInput = z.infer<typeof reviewInsightInputSchema>;

export async function generateCampaignInsight(owner: Owner, inputValue: unknown) {
  const input = generateCampaignInsightInputSchema.parse(inputValue);

  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - 30 * 24 * 60 * 60 * 1000);

  // 1-4. Gather campaign data and initialize agent run & step
  const { campaign, metrics, funnelDistribution, leadCounts, conversions, run, step } = await asActor(
    owner.id,
    async (tx) => {
      const [campaignRow] = await tx`
        select id, name, objective, currency, report_timezone, desired_status, effective_status
        from app.campaigns
        where id = ${input.campaignId}
      `;
      if (!campaignRow) {
        throw new ApiError(404, 'Campaign tidak ditemukan.');
      }

      const metricsRows = await tx`
        select report_date, impressions, link_clicks, reach, spend, platform_leads, platform_purchases,
               link_ctr_percent, cpm, link_cpc, platform_cpl
        from app.campaign_daily
        where campaign_id = ${input.campaignId}
          and report_date >= ${windowStart.toISOString().slice(0, 10)}
        order by report_date desc
      `;

      const [draftStrategy] = await tx`
        select strategy_id
        from app.campaign_drafts
        where campaign_id = ${input.campaignId}
        order by version desc
        limit 1
      `;

      let strategyId = draftStrategy?.strategy_id as string | undefined;
      if (!strategyId) {
        const [latestPlan] = await tx`
          select id from app.strategy_plans order by version desc limit 1
        `;
        strategyId = latestPlan?.id as string | undefined;
      }

      let funnelRows: Array<Record<string, unknown>> = [];
      if (strategyId) {
        funnelRows = await tx`
          select dimension, bucket, population_unit, audience_count, denominator, proportion
          from app.funnel_distribution(${strategyId}, ${input.campaignId})
        `;
      }

      const leadCountRows = await tx`
        select primary_source, count(*)::int as count
        from app.leads
        where campaign_id = ${input.campaignId}
        group by primary_source
      `;

      const conversionRows = await tx`
        select kind, status, count(*)::int as count, coalesce(sum(amount), 0)::numeric as total_amount
        from app.conversions
        where campaign_id = ${input.campaignId}
        group by kind, status
      `;

      const createdRun = await createAgentRun(tx, {
        purpose: 'metrics',
        mode: 'llm',
        campaignId: input.campaignId,
        workflowVersion: 'v1',
        promptVersion: 'v1',
        outputSchemaVersion: 'v1',
        provider: config.EXTERNAL_AI_MODEL ? 'external-ai' : 'default',
        model: config.EXTERNAL_AI_MODEL || 'external-ai-model',
        windowStart: windowStart.toISOString(),
        windowEnd: windowEnd.toISOString(),
        inputRefs: {
          area: input.area,
          campaignId: input.campaignId,
          metricsRowCount: metricsRows.length,
          strategyId: strategyId ?? null,
        },
      });

      await startRun(tx, createdRun.id);

      const createdStep = await recordStep(tx, {
        agent_run_id: createdRun.id,
        sequence: 1,
        step_key: 'metrics-insight-analysis',
        kind: 'llm',
        tool_name: 'external-ai',
        tool_version: 'v1',
      });

      return {
        campaign: campaignRow,
        metrics: metricsRows,
        funnelDistribution: funnelRows,
        leadCounts: leadCountRows,
        conversions: conversionRows,
        run: createdRun,
        step: createdStep,
      };
    },
  );

  // 5. Call generateExternalInsight() with gathered data
  const promptPayload = {
    campaign: {
      id: campaign.id,
      name: maskPii(String(campaign.name ?? '')),
      objective: campaign.objective,
      currency: campaign.currency,
      reportTimezone: campaign.report_timezone,
      status: campaign.effective_status,
    },
    area: input.area,
    window: {
      start: windowStart.toISOString().slice(0, 10),
      end: windowEnd.toISOString().slice(0, 10),
    },
    metricsSummary: {
      totalDays: metrics.length,
      recentMetrics: metrics.slice(0, 14),
    },
    funnelDistribution,
    leadCounts,
    conversions,
  };

  let aiResponse: any;
  try {
    aiResponse = await generateExternalInsight(promptPayload);
  } catch (error) {
    const errorSummary = error instanceof Error ? error.message : String(error);
    await asActor(owner.id, async (failTx) => {
      try {
        await failStep(failTx, step.id, `External AI call failed: ${errorSummary}`);
        await failRun(failTx, run.id, 'external_ai_error', errorSummary);
      } catch (logErr) {
        console.error('Gagal mencatat kegagalan agent run:', logErr);
      }
    });
    throw new ApiError(502, `Gagal memanggil AI untuk insight: ${errorSummary}`);
  }

  // 6-8. Complete run & step, parse AI response, insert insight(s) in app.insights, and return
  try {
    return await asActor(owner.id, async (saveTx) => {
      // NOTE: guard_insight trigger requires agent run to have status 'succeeded' before insight insertion.
      await succeedStep(saveTx, step.id, { result_refs: { status: 'insight_generated' } });
      await completeRun(saveTx, run.id, aiResponse);

      const rawItems: Array<Record<string, unknown>> = Array.isArray(aiResponse)
        ? aiResponse
        : Array.isArray(aiResponse?.insights)
          ? aiResponse.insights
          : [aiResponse && typeof aiResponse === 'object' ? aiResponse : {}];

      const insightItems = rawItems.length > 0 ? rawItems : [{}];
      const createdInsights = [];

      for (const item of insightItems) {
        const title = typeof item.title === 'string' && item.title.trim().length > 0
          ? item.title.trim().slice(0, 300)
          : `Analisis Metrik Campaign (${input.area})`;

        const observation = typeof item.observation === 'string' && item.observation.trim().length > 0
          ? item.observation.trim()
          : `Evaluasi performa campaign berdasarkan metrik ${metrics.length} hari terakhir.`;

        const interpretation = typeof item.interpretation === 'string' && item.interpretation.trim().length > 0
          ? item.interpretation.trim()
          : (typeof item.hypothesis === 'string' && item.hypothesis.trim().length > 0 ? item.hypothesis.trim() : null);

        const implication = typeof item.implication === 'string' && item.implication.trim().length > 0
          ? item.implication.trim()
          : (typeof item.recommendation === 'string' && item.recommendation.trim().length > 0 ? item.recommendation.trim() : null);

        const rawPriority = Number(item.priority);
        const priority = Number.isInteger(rawPriority) && rawPriority >= 1 && rawPriority <= 5
          ? rawPriority
          : 3;

        let evidence = Array.isArray(item.evidence) && item.evidence.length > 0
          ? item.evidence
          : null;

        if (!evidence) {
          evidence = [
            {
              type: 'metric',
              source: 'campaign_daily',
              description: metrics.length > 0
                ? `Terdapat ${metrics.length} baris data metrik campaign dalam 30 hari terakhir.`
                : 'Metrik campaign dievaluasi untuk periode 30 hari.',
            },
          ];
        }

        let limitations = Array.isArray(item.limitations) && item.limitations.length > 0
          ? item.limitations
          : [
              'Korelasi metrik tidak menjamin hubungan kausalitas langsung.',
              'Data bersumber dari metrik internal yang tercatat pada window analisis.',
            ];

        const [created] = await saveTx`
          insert into app.insights(
            kind, area, campaign_id, agent_run_id, title, observation,
            interpretation_type, interpretation, implication, priority,
            evidence, limitations, proposal,
            window_start, window_end, data_as_of, coverage
          ) values (
            'analysis',
            ${input.area},
            ${input.campaignId},
            ${run.id},
            ${title},
            ${observation},
            'hypothesis',
            ${interpretation},
            ${implication},
            ${priority},
            ${saveTx.json(evidence)},
            ${saveTx.json(limitations)},
            '{}'::jsonb,
            ${windowStart},
            ${windowEnd},
            now(),
            null
          )
          returning id, title, observation, priority, created_at
        `;

        createdInsights.push(created);
      }

      return createdInsights;
    });
  } catch (saveError) {
    if (saveError instanceof ApiError) throw saveError;
    const errorSummary = saveError instanceof Error ? saveError.message : String(saveError);
    await asActor(owner.id, async (failTx) => {
      try {
        await failStep(failTx, step.id, `Failed to persist insights: ${errorSummary}`);
        await failRun(failTx, run.id, 'insight_persist_error', errorSummary);
      } catch (logErr) {
        console.error('Gagal mencatat kegagalan persist insight:', logErr);
      }
    });
    throw new ApiError(500, `Gagal menyimpan insight: ${errorSummary}`);
  }
}

export async function listInsights(owner: Owner, filtersInput?: ListInsightsFilters) {
  const filters = listInsightsFiltersSchema.parse(filtersInput ?? {});
  const area = filters.area ?? null;
  const campaignId = filters.campaignId ?? null;
  const reviewStatus = filters.reviewStatus ?? null;
  const limit = filters.limit;

  return asActor(owner.id, async (tx) => {
    return tx`
      select i.id, i.kind, i.area, i.campaign_id, i.title, i.observation,
        i.interpretation_type, i.interpretation, i.implication, i.priority,
        i.evidence, i.limitations, i.proposal,
        i.window_start, i.window_end, i.data_as_of, i.coverage,
        i.review_status, i.reviewed_by, i.reviewed_at, i.review_reason, i.created_at
      from app.insights i
      where (${area}::text is null or i.area = ${area})
        and (${campaignId}::uuid is null or i.campaign_id = ${campaignId})
        and (${reviewStatus}::text is null or i.review_status = ${reviewStatus})
      order by i.created_at desc limit ${limit}
    `;
  });
}

export async function reviewInsight(
  owner: Owner,
  insightId: string,
  status: 'accepted' | 'dismissed',
  reason: string,
) {
  const input = reviewInsightInputSchema.parse({ insightId, status, reason });

  return asActor(owner.id, async (tx) => {
    const [row] = await tx`
      update app.insights
      set review_status = ${input.status},
          reviewed_by = ${owner.id},
          review_reason = ${input.reason}
      where id = ${input.insightId}
      returning id, review_status
    `;

    if (!row) {
      throw new ApiError(404, 'Insight tidak ditemukan.');
    }

    return { id: row.id, reviewStatus: row.review_status };
  });
}
