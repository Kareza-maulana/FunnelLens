import { z } from 'zod';
import { asActor } from './database';
import type { Owner } from './auth';
import { ApiError } from './auth';

const campaignInput = z.object({
  campaign: z.object({
    name: z.string().trim().min(1).max(200), objective: z.enum(['Leads', 'Engagement', 'Traffic']),
    destination: z.enum(['wa', 'lp', 'both']), phone: z.string().max(32).default(''),
    lpUrl: z.union([z.literal(''), z.string().url()]).default(''), lpMode: z.enum(['template', 'existing']).default('template'),
    budget: z.coerce.number().min(10_000).max(1_000_000_000), start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    ageMin: z.coerce.number().int().min(18).max(65), ageMax: z.coerce.number().int().min(18).max(65), location: z.string().trim().min(1).max(300),
    creative: z.string().trim().min(1).max(6000), headline: z.string().trim().min(1).max(300), angle: z.string().max(500).default(''),
  }), accountId: z.string().min(1).max(100), pageId: z.string().min(1).max(100), whatsappPhoneId: z.string().max(100).default(''),
}).superRefine((data, ctx) => {
  if (new Date(`${data.campaign.end}T00:00:00Z`) < new Date(`${data.campaign.start}T00:00:00Z`)) {
    ctx.addIssue({ code: 'custom', path: ['campaign', 'end'], message: 'Tanggal akhir harus sama dengan atau setelah tanggal mulai.' });
  }
  if (Number.isNaN(Date.parse(`${data.campaign.start}T00:00:00Z`)) || Number.isNaN(Date.parse(`${data.campaign.end}T00:00:00Z`))) {
    ctx.addIssue({ code: 'custom', path: ['campaign', 'start'], message: 'Tanggal campaign tidak valid.' });
  }
  if (data.campaign.ageMin > data.campaign.ageMax) ctx.addIssue({ code: 'custom', path: ['campaign', 'ageMax'], message: 'Rentang usia tidak valid.' });
  if (data.campaign.destination !== 'lp' && !/^\+?[\d\s-]{9,18}$/.test(data.campaign.phone)) {
    ctx.addIssue({ code: 'custom', path: ['campaign', 'phone'], message: 'Nomor WhatsApp tidak valid.' });
  }
  if (data.campaign.destination !== 'wa' && (data.campaign.lpMode !== 'existing' || !data.campaign.lpUrl.startsWith('https://'))) {
    ctx.addIssue({ code: 'custom', path: ['campaign', 'lpUrl'], message: 'Campaign LP memerlukan URL HTTPS yang sudah live; template demo belum dipublikasikan.' });
  }
});

const objectiveMap = { Leads: 'OUTCOME_LEADS', Engagement: 'OUTCOME_ENGAGEMENT', Traffic: 'OUTCOME_TRAFFIC' } as const;
const isoStart = (date: string) => new Date(`${date}T00:00:00.000Z`);
const isoEndExclusive = (date: string) => new Date(new Date(`${date}T00:00:00.000Z`).getTime() + 86_400_000);

export async function createCampaignApproval(owner: Owner, inputValue: unknown) {
  const input = campaignInput.parse(inputValue);
  return asActor(owner.id, async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtextextended(${owner.id},0))`;
    const [integration] = await tx`select id,capabilities,verified_assets from app.integrations where provider='meta' and status='connected' order by verified_at desc limit 1`;
    if (!integration) throw new ApiError(409, 'Hubungkan Meta sebelum membuat draft campaign.');
    const capabilities = integration.capabilities as { adAccounts?: Array<Record<string, unknown>>; pages?: Array<Record<string, unknown>>; whatsappPhones?: Array<Record<string, unknown>>; campaign_write?: boolean };
    const account = capabilities.adAccounts?.find((item) => item.id === input.accountId);
    const page = capabilities.pages?.find((item) => item.id === input.pageId);
    if (!account || !page) throw new ApiError(403, 'Akun iklan atau halaman tidak termasuk aset OAuth owner.');
    if (capabilities.campaign_write !== true) throw new ApiError(409, 'Meta belum memberikan izin ads_management. Sambungkan OAuth dengan izin campaign write yang disetujui Meta.');
    if (!(integration.verified_assets as Array<{ type?: string; id?: string }>).some((item) => item.type === 'ad_account' && item.id === input.accountId)) throw new ApiError(409, 'Ad account belum diverifikasi untuk penulisan campaign.');
    if (input.campaign.destination !== 'lp' && !(integration.verified_assets as Array<{ type?: string; id?: string }>).some((item) => item.type === 'whatsapp_phone' && item.id === input.whatsappPhoneId)) throw new ApiError(409, 'Pilih nomor WhatsApp Business yang diverifikasi Meta pada langkah koneksi.');
    const currency = String(account.currency || 'IDR').toUpperCase();
    const timezone = String(account.timezone_name || 'Asia/Jakarta');
    if (!/^[A-Z]{3}$/.test(currency)) throw new ApiError(409, 'Mata uang ad account tidak valid.');
    if (currency !== 'IDR') throw new ApiError(409, 'Input budget onboarding saat ini dalam IDR; pilih ad account bermata uang IDR.');

    const c = input.campaign;
    const [campaign] = await tx`
      insert into app.campaigns(integration_id,external_ad_account_id,name,objective,planned_funnel_role,currency,report_timezone,desired_status,effective_status)
      values (${integration.id},${input.accountId},${c.name},${objectiveMap[c.objective]},'cold_prospecting',${currency},${timezone},'paused','draft')
      returning id
    `;
    const [plan] = await tx`
      insert into app.strategy_plans(version,objective,total_budget,currency,starts_at,ends_at,input_snapshot,funnel,stage_targets,rules,rule_version,assumptions,confirmed_by)
      values ((select coalesce(max(version),0)+1 from app.strategy_plans),${objectiveMap[c.objective]},${c.budget},${currency},${isoStart(c.start)},${isoEndExclusive(c.end)},
        ${tx.json({ campaignName: c.name, location: c.location, ageMin: c.ageMin, ageMax: c.ageMax, destination: c.destination })},
        '[{"key":"cold","label":"Cold prospecting","rank":0,"is_action":false},{"key":"warm","label":"Warm consideration","rank":1,"is_action":false},{"key":"hot","label":"Hot intent","rank":2,"is_action":false},{"key":"action","label":"Lead action","rank":3,"is_action":true}]'::jsonb,
        '[]'::jsonb,'{}'::jsonb,'funnellens-v1','[]'::jsonb,${owner.id}) returning id
    `;
    const creativeContent = { format: 'text', angle: c.angle || null, headline: c.headline, primary_text: c.creative, media: [] };
    const [creative] = await tx`
      insert into app.creatives(name,format,angle,headline,primary_text,media,source,created_by)
      values (${c.name},'text',${c.angle || null},${c.headline},${c.creative},'[]'::jsonb,'manual',${owner.id}) returning id
    `;
    const routes = [
      ...(c.destination !== 'lp' ? [{ type: 'whatsapp', tracking_key: 'wa-primary', destination: input.whatsappPhoneId }] : []),
      ...(c.destination !== 'wa' ? [{ type: 'landing_page', tracking_key: 'lp-primary', url: c.lpUrl, form_contract_version: 1 }] : []),
    ];
    const configuration = {
      contract_version: '1', external_ad_account_id: input.accountId, objective: objectiveMap[c.objective], name: c.name,
      budget: { scope: 'campaign', cadence: 'lifetime', amount: c.budget, currency }, starts_at: isoStart(c.start).toISOString(),
      ends_at: isoEndExclusive(c.end).toISOString(), desired_status: 'paused',
      routes, creatives: [{ id: creative.id, content: creativeContent, content_hash: '' }],
      ad_sets: [{ key: 'cold-prospecting', name: `${c.name} · Cold`, targeting: { geo_locations: { cities: [], location_text: c.location }, age_min: c.ageMin, age_max: c.ageMax }, route_type: routes[0].type, creative_ids: [creative.id] }],
      selected_page_id: input.pageId,
    };
    const [{ hash }] = await tx`select app.json_hash(${tx.json(creativeContent)}) as hash`;
    configuration.creatives[0].content_hash = hash;
    const [draft] = await tx`
      insert into app.campaign_drafts(campaign_id,version,strategy_id,configuration,schema_version,payload_hash,budget_amount,currency,starts_at,ends_at,created_by)
      values (${campaign.id},1,${plan.id},${tx.json(configuration)},1,'',${c.budget},${currency},${isoStart(c.start)},${isoEndExclusive(c.end)},${owner.id}) returning id
    `;
    await tx`update app.campaigns set current_draft_id=${draft.id} where id=${campaign.id}`;
    const [request] = await tx`select app.create_action(${draft.id},'create_campaign','manual',interval '24 hours') as id`;
    return { campaignId: campaign.id, draftId: draft.id, actionRequestId: request.id, status: 'pending' };
  });
}

export async function listCampaigns(owner: Owner) {
  return asActor(owner.id, async (tx) => tx`
    select c.id,c.name,c.objective,c.currency,c.report_timezone,c.desired_status,c.effective_status,c.created_at,
      d.id as draft_id,r.id as action_request_id,r.status as approval_status
    from app.campaigns c left join app.campaign_drafts d on d.id=c.current_draft_id
    left join lateral (select id,status from app.action_requests where campaign_id=c.id order by created_at desc limit 1) r on true
    order by c.created_at desc
  `);
}

export async function decideCampaignAction(owner: Owner, requestId: string, decision: 'approved' | 'rejected', reason: string, autoEnqueue = true) {
  return asActor(owner.id, async (tx) => {
    const [request] = await tx`select id,campaign_id,status from app.action_requests where id=${requestId} for update`;
    if (!request) throw new ApiError(404, 'Permintaan approval tidak ditemukan.');
    await tx`select app.decide_action(${requestId},${decision},${reason || null})`;
    let jobId: string | null = null;
    if (decision === 'approved' && autoEnqueue) {
      const [enqueued] = await tx`select app.enqueue_action(${requestId}) as id`;
      jobId = enqueued?.id ?? null;
    }
    return { id: request.id, campaignId: request.campaign_id, status: decision, execution: jobId ? 'queued' : 'not_queued', jobId };
  });
}

