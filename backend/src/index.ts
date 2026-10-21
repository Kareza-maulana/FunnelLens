import { Elysia } from 'elysia';
import { cors } from '@elysia/cors';
import { timingSafeEqual } from 'node:crypto';
import { config } from './config';
import { asConfiguredOwner, closeDatabase, sql } from './database';
import { ApiError, authenticateOwner } from './auth';
import { classifyLead, generateBrandOptions, generateExternalInsight } from './ai';
import { maskPii, protectPii, revealPii } from './pii';
import { clearWorkspace, loadWorkspace, saveWorkspace, workspaceSchema } from './workspace';
import { createMetaOAuthUrl, completeMetaOAuth, getIntegrations, setLandingPageIntegration, verifyOpenWa } from './integrations';
import { startOpenWaMonitor } from './health-monitor';
import { createCampaignApproval, decideCampaignAction, listCampaigns } from './campaigns';
import { confirmPurchase, listConversions } from './conversions';
import { createAssessment, getFunnelDistribution, getLeadDirectory, getLatestStrategy } from './assessments';
import { getCampaignDaily, getCreativeDaily, getCreativeCoverage, getBusinessImpact, getOverviewStats } from './analytics';
import { eraseContact } from './erasure';
import { generateCampaignInsight, listInsights, reviewInsight } from './insights-api';
import {
  createEmbeddingProfile,
  activateEmbeddingProfile,
  listEmbeddingProfiles,
  createDocument,
  approveDocument,
  rejectDocument,
  publishDocument,
  listDocuments,
  getDocumentChunks,
  enqueueEmbedJob,
  searchKnowledge,
} from './knowledge';
import { startWorker } from './worker';
import { z } from 'zod';

const app = new Elysia()
  .use(cors({ origin: (request) => {
    const origin = request.headers.get('origin');
    const allowed = [config.CORS_ORIGIN, ...config.TRACKER_ALLOWED_ORIGINS.split(',').map((value) => value.trim()).filter(Boolean)];
    return origin ? allowed.includes(origin) : false;
  }, credentials: false }))
  .onError(({ error, set }) => {
    if (error instanceof ApiError) {
      set.status = error.status;
      return { error: error.message };
    }
    if (error instanceof z.ZodError) {
      set.status = 400;
      return { error: 'Data tidak valid.', issues: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })) };
    }
    console.error('API request failed:', error instanceof Error ? error.message : String(error));
    set.status = 500;
    return { error: 'Terjadi kesalahan pada server.' };
  })
  .get('/health', () => ({ status: 'ok' }))
  .get('/ready', async ({ set }) => {
    try {
      await sql`select 1`;
      return { status: 'ready', checks: { database: 'ok' } };
    } catch {
      set.status = 503;
      return { status: 'not_ready', checks: { database: 'unavailable' } };
    }
  })
  .get('/funnellens-tracker.js', async ({ set }) => {
    set.headers['content-type'] = 'text/javascript; charset=utf-8';
    set.headers['cache-control'] = 'public, max-age=300';
    return await Bun.file(new URL('../public/funnellens-tracker.js', import.meta.url)).text();
  })
  .derive(async ({ request }) => {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/') || url.pathname.startsWith('/api/webhooks/') || url.pathname === '/api/tracking/event' || url.pathname === '/api/public/leads' || url.pathname === '/api/integrations/meta/callback') return { owner: null };
    return { owner: await authenticateOwner(request.headers.get('authorization') ?? undefined) };
  })
  .get('/api/auth/me', ({ owner, set }) => {
    if (!owner) { set.status = 401; return { error: 'Login diperlukan.' }; }
    return { user: { id: owner.authSubject, displayName: owner.displayName }, role: 'owner' };
  })
  .get('/api/integrations', async ({ owner }) => ({ integrations: await getIntegrations(owner!) }))
  .get('/api/campaigns', async ({ owner }) => ({ campaigns: await listCampaigns(owner!) }))
  .get('/api/leads', async ({ owner }) => ({ leads: await asConfiguredOwner(async (tx) => {
    const rows = await tx`
      select l.id,l.primary_source,l.first_received_at,l.quality_status,c.name_ciphertext,c.phone_hint,
        e.properties->>'intent' as intent,e.properties->>'stage' as stage
      from app.leads l join app.contacts c on c.id=l.contact_id
      left join lateral (select properties from app.lead_events where lead_id=l.id order by occurred_at desc limit 1) e on true
      order by l.first_received_at desc limit 200
    `;
    return rows.map((row: { id: string; primary_source: string; first_received_at: Date; quality_status: string; name_ciphertext: Buffer | null; phone_hint: string | null; intent: string | null; stage: string | null }) => ({
      id: row.id, source: row.primary_source, firstReceivedAt: row.first_received_at, qualityStatus: row.quality_status,
      nameMasked: row.name_ciphertext ? `${revealPii(row.name_ciphertext).slice(0, 1)}•••` : 'Lead', phoneHint: row.phone_hint ? `••••${row.phone_hint}` : '',
      intent: row.intent ?? 'unknown', stage: row.stage ?? 'unknown', signal: row.primary_source === 'whatsapp' ? 'Pesan tersimpan terenkripsi' : 'Permintaan form tersimpan terenkripsi',
    }));
  }) }))
  .post('/api/campaigns', async ({ owner, body }) => createCampaignApproval(owner!, body))
  .post('/api/campaign-actions/:id/decision', async ({ owner, params, body }) => {
    const input = z.object({ decision: z.enum(['approved', 'rejected']), reason: z.string().max(1000).default(''), autoEnqueue: z.boolean().default(true) }).parse(body);
    return decideCampaignAction(owner!, z.string().uuid().parse(params.id), input.decision, input.reason, input.autoEnqueue);
  })
  .post('/api/integrations/meta/oauth-url', ({ owner }) => createMetaOAuthUrl(owner!))
  .put('/api/integrations/landing-page', async ({ owner, body }) => {
    const input = z.object({ enabled: z.boolean() }).parse(body);
    return setLandingPageIntegration(owner!, input.enabled);
  })
  .post('/api/integrations/whatsapp/check', async ({ owner }) => verifyOpenWa(owner!))
  .get('/api/integrations/meta/callback', async ({ query, set }) => {
    if (query.error) throw new ApiError(400, `Meta OAuth dibatalkan: ${String(query.error_description ?? query.error)}`);
    const code = String(query.code ?? ''), state = String(query.state ?? '');
    if (!code || !state) throw new ApiError(400, 'Meta OAuth tidak mengirim code/state.');
    await completeMetaOAuth(code, state);
    set.status = 302;
    set.headers.location = `${config.FRONTEND_ORIGIN}/#/app/integrations?connected=meta`;
    return '';
  })
  .get('/api/workspace', async ({ owner }) => ({ workspace: await loadWorkspace(owner!) }))
  .put('/api/workspace', async ({ owner, body }) => {
    const workspace = workspaceSchema.parse(body);
    const result = await saveWorkspace(owner!, workspace);
    return { ok: true, ...result };
  })
  .delete('/api/workspace', async ({ owner }) => clearWorkspace(owner!))
  .post('/api/ai/classify', async ({ owner, body }) => {
    if (!owner) throw new ApiError(401, 'Login diperlukan.');
    const input = z.object({ text: z.string().min(1).max(6000) }).parse(body);
    return classifyLead(input.text);
  })
  .post('/api/ai/insights', async ({ owner, body }) => {
    if (!owner) throw new ApiError(401, 'Login diperlukan.');
    const input = z.object({ data: z.record(z.string(), z.unknown()) }).parse(body);
    return { insight: await generateExternalInsight(input.data) };
  })
  .post('/api/ai/brand-options', async ({ owner, body }) => {
    if (!owner) throw new ApiError(401, 'Login diperlukan.');
    const input = z.object({ business: z.record(z.string(), z.unknown()), preference: z.string().max(500).default(''), emphasis: z.string().max(500).default(''), round: z.number().int().min(0).max(50).default(0) }).parse(body);
    return { options: await generateBrandOptions(input) };
  })
  // Conversions
  .post('/api/conversions/confirm', async ({ owner, body }) => confirmPurchase(owner!, body))
  .get('/api/conversions', async ({ owner, query }) => ({ conversions: await listConversions(owner!, query) }))
  // Lead Assessments & Funnel
  .post('/api/assessments', async ({ owner, body }) => createAssessment(owner!, body))
  .get('/api/funnel/distribution', async ({ owner, query }) => ({ distribution: await getFunnelDistribution(owner!, query) }))
  .get('/api/funnel/directory', async ({ owner }) => ({ directory: await getLeadDirectory(owner!) }))
  .get('/api/strategy/latest', async ({ owner }) => ({ strategy: await getLatestStrategy(owner!) }))
  // Analytics Views
  .get('/api/analytics/overview', async ({ owner }) => ({ overview: await getOverviewStats(owner!) }))
  .get('/api/analytics/campaign-daily', async ({ owner, query }) => ({ daily: await getCampaignDaily(owner!, query) }))
  .get('/api/analytics/creative-daily', async ({ owner, query }) => ({ creativeDaily: await getCreativeDaily(owner!, query) }))
  .get('/api/analytics/creative-coverage', async ({ owner, query }) => ({ coverage: await getCreativeCoverage(owner!, query.campaignId) }))
  .get('/api/analytics/business-impact', async ({ owner, query }) => ({ impact: await getBusinessImpact(owner!, query) }))
  // GDPR / PII Erasure
  .post('/api/contacts/:id/erase', async ({ owner, params }) => eraseContact(owner!, params.id))
  // Insights API
  .post('/api/insights/generate', async ({ owner, body }) => generateCampaignInsight(owner!, body))
  .get('/api/insights', async ({ owner, query }) => ({ insights: await listInsights(owner!, query) }))
  .post('/api/insights/:id/review', async ({ owner, params, body }) => {
    const input = z.object({ status: z.enum(['accepted', 'dismissed']), reason: z.string().min(1).max(1000) }).parse(body);
    return reviewInsight(owner!, params.id, input.status, input.reason);
  })
  // RAG / Knowledge Base
  .post('/api/knowledge/profiles', async ({ owner, body }) => createEmbeddingProfile(owner!, body))
  .post('/api/knowledge/profiles/:id/activate', async ({ owner, params }) => activateEmbeddingProfile(owner!, params.id))
  .get('/api/knowledge/profiles', async ({ owner }) => ({ profiles: await listEmbeddingProfiles(owner!) }))
  .post('/api/knowledge/documents', async ({ owner, body }) => createDocument(owner!, body))
  .post('/api/knowledge/documents/:id/approve', async ({ owner, params }) => approveDocument(owner!, params.id))
  .post('/api/knowledge/documents/:id/reject', async ({ owner, params }) => rejectDocument(owner!, params.id))
  .post('/api/knowledge/documents/:id/publish', async ({ owner, params, body }) => {
    const input = z.object({ profileId: z.string().uuid() }).parse(body);
    return publishDocument(owner!, params.id, input.profileId);
  })
  .get('/api/knowledge/documents', async ({ owner }) => ({ documents: await listDocuments(owner!) }))
  .get('/api/knowledge/documents/:id/chunks', async ({ owner, params }) => ({ chunks: await getDocumentChunks(owner!, params.id) }))
  .post('/api/knowledge/documents/:id/embed', async ({ owner, params, body }) => {
    const input = z.object({ profileId: z.string().uuid() }).parse(body);
    return enqueueEmbedJob(owner!, params.id, input.profileId);
  })
  .post('/api/knowledge/search', async ({ owner, body }) => ({ results: await searchKnowledge(owner!, body) }))
  // Public Form & Tracking
  .post('/api/public/leads', async ({ request, body }) => {
    const input = z.object({ eventId: z.string().uuid(), name: z.string().trim().min(1).max(200), phone: z.string().trim().min(9).max(32), needs: z.string().trim().max(3000).default(''), sourceUrl: z.string().url().max(2048), consentContactFollowup: z.literal(true) }).parse(body);
    const sourceOrigin = request.headers.get('origin');
    const allowedOrigins = [config.CORS_ORIGIN, ...config.TRACKER_ALLOWED_ORIGINS.split(',').map((value) => value.trim()).filter(Boolean)];
    if (!sourceOrigin || !allowedOrigins.includes(sourceOrigin)) throw new ApiError(403, 'Origin form belum diizinkan.');
    const normalizedPhone = input.phone.replace(/[^+\d]/g, '');
    if (normalizedPhone.replace(/\D/g, '').length < 9) throw new ApiError(400, 'Nomor telepon tidak valid.');
    const name = protectPii(input.name), phone = protectPii(normalizedPhone), payload = protectPii(input.needs);
    return asConfiguredOwner(async (tx) => {
      const [integration] = await tx`select id from app.integrations where provider='landing_page' and status='connected' order by updated_at desc limit 1`;
      if (!integration) throw new ApiError(409, 'Penerimaan lead landing page belum diaktifkan owner.');
      const [contact] = await tx`
        insert into app.contacts(name_ciphertext,phone_ciphertext,phone_hmac,phone_hint,key_version,identity_source)
        values (${name.ciphertext},${phone.ciphertext},${phone.hmac},${normalizedPhone.slice(-4)},'v1','landing_page')
        on conflict (phone_hmac) do update set name_ciphertext=excluded.name_ciphertext,phone_ciphertext=excluded.phone_ciphertext,phone_hint=excluded.phone_hint,erased_at=null,updated_at=now()
        returning id
      `;
      const [lead] = await tx`
        insert into app.leads(contact_id,primary_source,first_received_at) values (${contact.id},'landing_page',now()) returning id
      `;
      const [event] = await tx`
        insert into app.lead_events(integration_id,source_namespace,source_event_id,event_kind,occurred_at,lead_id,contact_id,linkage_status,channel,payload_ciphertext,properties,consent_basis)
        values (${integration.id},'funnellens_public_form',${input.eventId},'form_submission',now(),${lead.id},${contact.id},'unknown','landing_page',${payload.ciphertext},
          ${tx.json({ sourceOrigin: new URL(input.sourceUrl).origin, pagePath: new URL(input.sourceUrl).pathname, needsMasked: maskPii(input.needs), contactFollowupOptIn: true })},'explicit_form_consent')
        on conflict do nothing returning id
      `;
      if (!event) throw new ApiError(409, 'Form ini sudah pernah dikirim.');
      return { ok: true, leadId: lead.id };
    });
  })
  .post('/api/tracking/event', async ({ request, body }) => {
    const input = z.object({ eventId: z.string().min(1).max(200), event: z.enum(['page_view', 'cta_click', 'form_start', 'form_submission']), occurredAt: z.string().datetime(), pageUrl: z.string().url().max(2048), campaignRef: z.string().max(200).optional(), consentBasis: z.string().min(1).max(300), properties: z.record(z.string(), z.union([z.string().max(500), z.number(), z.boolean()])).default({}) }).parse(body);
    const sourceOrigin = request.headers.get('origin');
    const allowedOrigins = [config.CORS_ORIGIN, ...config.TRACKER_ALLOWED_ORIGINS.split(',').map((value) => value.trim()).filter(Boolean)];
    if (!sourceOrigin || !allowedOrigins.includes(sourceOrigin)) throw new ApiError(403, 'Origin tracking belum diizinkan.');
    await asConfiguredOwner(async (tx) => {
    const [integration] = await tx`select id from app.integrations where provider='landing_page' and status='connected' order by updated_at desc limit 1`;
    if (!integration) throw new ApiError(409, 'Tracking landing page belum diaktifkan owner.');
    await tx`
      insert into app.lead_events(integration_id,source_namespace,source_event_id,event_kind,occurred_at,channel,properties,consent_basis)
      values (${integration.id},'funnellens_tracker',${input.eventId},'touchpoint',${input.occurredAt},'landing_page',${sql.json({ event: input.event, pageUrl: new URL(input.pageUrl).origin + new URL(input.pageUrl).pathname, campaignRef: input.campaignRef ?? null, ...input.properties })},${input.consentBasis})
      on conflict do nothing
    `;
    });
    return { ok: true };
  })
  .post('/api/webhooks/openwa', async ({ request, body }) => {
    const supplied = request.headers.get('x-webhook-secret') ?? '';
    const expected = config.OPENWA_WEBHOOK_SECRET;
    const left = Buffer.from(supplied), right = Buffer.from(expected);
    if (!expected || left.length !== right.length || !timingSafeEqual(left, right)) throw new ApiError(401, 'Webhook signature tidak valid.');
    const envelope = body as any;
    const message = envelope?.payload?.message ?? envelope?.message ?? envelope;
    if (message?.fromMe || message?.isGroupMsg || String(message?.from ?? '').endsWith('@g.us')) return { accepted: false, reason: 'non-customer-message' };
    const chatId = String(message?.from ?? message?.author ?? '');
    const phoneValue = chatId.replace(/@c\.us$/, '').replace(/\D/g, '');
    const messageId = String(message?.id?._serialized ?? message?.id ?? envelope?.id ?? '');
    const textValue = String(message?.body ?? message?.content ?? '');
    const rawTimestamp = message?.timestamp ?? envelope?.ts ?? Date.now();
    const occurredAt = new Date(typeof rawTimestamp === 'number' ? (rawTimestamp < 10_000_000_000 ? rawTimestamp * 1000 : rawTimestamp) : rawTimestamp).toISOString();
    const input = z.object({ messageId: z.string().min(1).max(240), phone: z.string().min(7).max(32), name: z.string().max(200).optional(), text: z.string().min(1).max(6000), occurredAt: z.string().datetime(), campaignId: z.string().uuid().optional() }).parse({ messageId, phone: phoneValue, name: message?.notifyName ?? message?.sender?.pushname, text: textValue, occurredAt, campaignId: message?.campaignId });
    let classification;
    try { classification = await classifyLead(input.text); }
    catch (error) { console.warn('Local AI unavailable; storing an unclassified, PII-masked event:', error instanceof Error ? error.message : 'unknown error'); classification = { intent: 'unknown' as const, stage: 'unknown' as const, summary: '', maskedText: maskPii(input.text) }; }
    const phone = protectPii(input.phone.replace(/[^+\d]/g, ''));
    const name = input.name ? protectPii(input.name) : null;
    const payload = protectPii(input.text);
    const result = await asConfiguredOwner(async (tx) => {
      const [integration] = await tx`select id from app.integrations where provider='whatsapp' and status='connected' order by verified_at desc limit 1`;
      const [contact] = await tx`
        insert into app.contacts(name_ciphertext,phone_ciphertext,phone_hmac,phone_hint,key_version,identity_source,channel_verified_at)
        values (${name?.ciphertext ?? null},${phone.ciphertext},${phone.hmac},${input.phone.slice(-4)},'v1','whatsapp',now())
        on conflict (phone_hmac) do update set updated_at=now()
        returning id
      `;
      let leadId: string | null = null;
      if (input.campaignId) {
        const [lead] = await tx`
          insert into app.leads(contact_id,campaign_id,primary_source,first_received_at)
          values (${contact.id},${input.campaignId},'whatsapp',${input.occurredAt})
          on conflict (campaign_id,contact_id) where campaign_id is not null do update set updated_at=now()
          returning id
        `;
        leadId = lead.id;
      }
      const [event] = await tx`
        insert into app.lead_events(integration_id,source_namespace,source_event_id,event_kind,occurred_at,lead_id,contact_id,campaign_id,linkage_status,channel,payload_ciphertext,properties,consent_basis)
        values (${integration?.id ?? null},'openwa',${input.messageId},'message',${input.occurredAt},${leadId},${contact.id},${input.campaignId ?? null},${leadId ? 'verified' : 'unknown'},'whatsapp',${payload.ciphertext},${tx.json({ intent: classification.intent, stage: classification.stage, summary: classification.summary, maskedText: classification.maskedText, direction: 'inbound', optInToMarketing: false })},'incoming_message')
        on conflict do nothing returning id
      `;
      return { accepted: !!event, eventId: event?.id ?? null, leadId, classification };
    });
    if (result.accepted && config.OPENWA_AUTO_REPLY_TEXT && config.OPENWA_BASE_URL && config.OPENWA_API_TOKEN) {
      const reply = await fetch(`${config.OPENWA_BASE_URL}/api/messages/sendText`, {
        method: 'POST', headers: { 'X-API-Key': config.OPENWA_API_TOKEN, 'content-type': 'application/json' },
        body: JSON.stringify({ to: chatId, content: config.OPENWA_AUTO_REPLY_TEXT, options: {} }), signal: AbortSignal.timeout(15_000),
      });
      if (!reply.ok) console.error('OpenWA auto reply failed:', reply.status);
    }
    return result;
  })
  .listen({ hostname: config.HOST, port: config.PORT });

console.log(`FunnelLens API listening on ${app.server?.hostname}:${app.server?.port}`);
const stopMonitor = startOpenWaMonitor();
const stopWorker = startWorker();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    stopMonitor();
    stopWorker();
    await closeDatabase();
    app.stop();
    process.exit(0);
  });
}
