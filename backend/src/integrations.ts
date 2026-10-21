import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { asConfiguredOwner, sql, asActor } from './database';
import { config } from './config';
import { ApiError, type Owner } from './auth';
import { protectSecret } from './pii';

type MetaState = { ownerSubject: string; expiresAt: number; nonce: string };
function stateMac(value: string) {
  return createHmac('sha256', Buffer.from(config.CREDENTIAL_ENCRYPTION_KEY, 'base64url')).update(value).digest('base64url');
}
function signState(state: MetaState) {
  const payload = Buffer.from(JSON.stringify(state)).toString('base64url');
  return `${payload}.${stateMac(payload)}`;
}
function verifyState(value: string): MetaState {
  const [payload, signature] = value.split('.');
  if (!payload || !signature) throw new ApiError(400, 'OAuth state tidak valid.');
  const expected = Buffer.from(stateMac(payload)); const supplied = Buffer.from(signature);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) throw new ApiError(400, 'OAuth state tidak valid.');
  const state = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as MetaState;
  if (state.expiresAt < Date.now()) throw new ApiError(400, 'Sesi OAuth sudah kedaluwarsa.');
  return state;
}

function graphUrl(path: string) {
  if (!config.META_API_VERSION) throw new ApiError(503, 'META_API_VERSION belum disetel.');
  return `https://graph.facebook.com/${config.META_API_VERSION}/${path.replace(/^\//, '')}`;
}

export async function getIntegrations(owner: Owner) {
  return asActor(owner.id, async (tx) => tx`
    select id,provider,status,scopes,capabilities,verified_assets,verified_at,last_synced_at,token_expires_at
    from app.integrations order by provider,created_at
  `);
}

export async function setLandingPageIntegration(owner: Owner, enabled: boolean) {
  return asActor(owner.id, async (tx) => {
    const [row] = await tx`
      insert into app.integrations(provider,connector_kind,external_connection_id,status,scopes,capabilities,verified_assets,verified_at)
      values ('landing_page','manual','funnellens-tracker',${enabled ? 'connected' : 'disconnected'},'{}'::text[],${tx.json({ endpoint: '/api/tracking/event', contractVersion: 1 })},'[]'::jsonb,${enabled ? new Date() : null})
      on conflict (provider,external_connection_id) do update set status=excluded.status,verified_at=excluded.verified_at,capabilities=excluded.capabilities,updated_at=now()
      returning id,status
    `;
    return row;
  });
}

export async function verifyOpenWa(owner: Owner) {
  if (!config.OPENWA_BASE_URL || !config.OPENWA_API_TOKEN) throw new ApiError(503, 'OpenWA gateway belum dikonfigurasi.');
  const response = await fetch(`${config.OPENWA_BASE_URL}/health`, { headers: { 'X-API-Key': config.OPENWA_API_TOKEN }, signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new ApiError(502, `OpenWA gateway merespons HTTP ${response.status}.`);
  const health = await response.json() as { connected?: boolean; session?: { ready?: boolean; sessionId?: string } };
  if (!health.connected || !health.session?.ready) throw new ApiError(409, 'Sesi WhatsApp belum siap. Pair QR pada http://127.0.0.1:8000/dashboard/ lalu coba lagi.');
  const externalId = health.session.sessionId || 'funnellens';
  return asActor(owner.id, async (tx) => {
    const [row] = await tx`
      insert into app.integrations(provider,connector_kind,external_connection_id,status,scopes,capabilities,verified_assets,verified_at)
      values ('whatsapp','webhook',${externalId},'connected',${tx.array(['message.received'])},${tx.json({ gateway: config.OPENWA_BASE_URL, sessionReady: true })},'[]'::jsonb,now())
      on conflict (provider,external_connection_id) do update set status='connected',capabilities=excluded.capabilities,verified_at=now(),updated_at=now()
      returning id,status,verified_at
    `;
    return row;
  });
}

export function createMetaOAuthUrl(owner: Owner) {
  if (!config.META_APP_ID || !config.META_APP_SECRET || !config.META_API_VERSION) throw new ApiError(503, 'Konfigurasi Meta App belum lengkap.');
  const state = signState({ ownerSubject: owner.authSubject, expiresAt: Date.now() + 8 * 60_000, nonce: randomBytes(18).toString('base64url') });
  const url = new URL(`https://www.facebook.com/${config.META_API_VERSION}/dialog/oauth`);
  url.search = new URLSearchParams({ client_id: config.META_APP_ID, redirect_uri: config.META_REDIRECT_URI, state, response_type: 'code', scope: 'ads_read,ads_management,business_management,pages_show_list,whatsapp_business_management' }).toString();
  return { url: url.toString() };
}

async function graphJson(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  const value = await response.json() as { error?: { message?: string } };
  if (!response.ok) throw new ApiError(502, `Meta Graph API gagal: ${value.error?.message ?? response.statusText}`);
  return value;
}

export async function completeMetaOAuth(code: string, rawState: string) {
  const state = verifyState(rawState);
  if (state.ownerSubject !== config.OWNER_AUTH_SUBJECT) throw new ApiError(403, 'OAuth tidak dibuat oleh owner yang aktif.');
  const tokenUrl = new URL(graphUrl('oauth/access_token'));
  tokenUrl.search = new URLSearchParams({ client_id: config.META_APP_ID, client_secret: config.META_APP_SECRET, redirect_uri: config.META_REDIRECT_URI, code }).toString();
  const shortToken = await graphJson(tokenUrl.toString()) as { access_token: string; expires_in?: number };
  const longUrl = new URL(graphUrl('oauth/access_token'));
  longUrl.search = new URLSearchParams({ grant_type: 'fb_exchange_token', client_id: config.META_APP_ID, client_secret: config.META_APP_SECRET, fb_exchange_token: shortToken.access_token }).toString();
  const token = await graphJson(longUrl.toString()) as { access_token: string; expires_in?: number };
  const tokenExpiry = token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null;
  const me = await graphJson(`${graphUrl('me')}?fields=id,name&access_token=${encodeURIComponent(token.access_token)}`) as { id: string; name?: string };
  const permissions = await graphJson(`${graphUrl('me/permissions')}?access_token=${encodeURIComponent(token.access_token)}`) as { data?: Array<{ permission?: string; status?: string }> };
  const accounts = await graphJson(`${graphUrl('me/adaccounts')}?fields=id,account_id,name,currency,timezone_name&limit=100&access_token=${encodeURIComponent(token.access_token)}`) as { data?: unknown[]; paging?: unknown };
  const pages = await graphJson(`${graphUrl('me/accounts')}?fields=id,name&limit=100&access_token=${encodeURIComponent(token.access_token)}`) as { data?: unknown[] };
  let businesses: { data?: Array<{ id: string; name?: string }> } = {};
  try { businesses = await graphJson(`${graphUrl('me/businesses')}?fields=id,name&limit=100&access_token=${encodeURIComponent(token.access_token)}`) as typeof businesses; }
  catch { /* Ad account and Page access can still connect without business inventory permission. */ }
  const whatsappPhones: Array<{ id: string; display_phone_number?: string; verified_name?: string }> = [];
  for (const business of businesses.data ?? []) {
    let whatsAppAccounts: { data?: Array<{ id: string }> };
    try { whatsAppAccounts = await graphJson(`${graphUrl(`${business.id}/owned_whatsapp_business_accounts`)}?fields=id,name&limit=100&access_token=${encodeURIComponent(token.access_token)}`) as { data?: Array<{ id: string }> }; }
    catch { continue; }
    for (const account of whatsAppAccounts.data ?? []) {
      try {
        const phones = await graphJson(`${graphUrl(`${account.id}/phone_numbers`)}?fields=id,display_phone_number,verified_name&limit=100&access_token=${encodeURIComponent(token.access_token)}`) as { data?: typeof whatsappPhones };
        whatsappPhones.push(...(phones.data ?? []));
      } catch { /* Meta login remains useful for ad account/page access without a WhatsApp Business asset. */ }
    }
  }
  if (state.ownerSubject !== config.OWNER_AUTH_SUBJECT) throw new ApiError(403, 'Owner OAuth tidak cocok dengan konfigurasi aktif.');
  return asConfiguredOwner(async (tx) => {
    const [integration] = await tx`
      insert into app.integrations(provider,connector_kind,external_connection_id,status,scopes,capabilities,verified_assets,token_expires_at,verified_at)
      values ('meta','oauth',${me.id},'connected',${tx.array((permissions.data ?? []).filter((item) => item.status === 'granted').map((item) => item.permission ?? '').filter(Boolean))},${tx.json({ accountName: me.name ?? '', adAccounts: accounts.data ?? [], pages: pages.data ?? [], whatsappPhones, campaign_write: (permissions.data ?? []).some((item) => item.permission === 'ads_management' && item.status === 'granted') })},${tx.json([
        ...(accounts.data ?? []).map((item: any) => ({ type: 'ad_account', id: String(item.id) })),
        ...(pages.data ?? []).map((item: any) => ({ type: 'page', id: String(item.id) })),
        ...whatsappPhones.map((item) => ({ type: 'whatsapp_phone', id: item.id })),
      ])},${tokenExpiry},now())
      on conflict (provider,external_connection_id) do update set status='connected',scopes=excluded.scopes,capabilities=excluded.capabilities,verified_assets=excluded.verified_assets,token_expires_at=excluded.token_expires_at,verified_at=now(),updated_at=now()
      returning id
    `;
    const encrypted = protectSecret(JSON.stringify({ accessToken: token.access_token, expiresAt: tokenExpiry?.toISOString() ?? null }));
    const [secret] = await tx`
      insert into private.integration_secrets(integration_id,ciphertext)
      values (${integration.id},${encrypted})
      on conflict (integration_id) do update set ciphertext=excluded.ciphertext,updated_at=now()
      returning id
    `;
    await tx`update app.integrations set credential_secret_ref=${secret.id} where id=${integration.id}`;
    return { connected: true, accountName: me.name ?? '', adAccounts: accounts.data ?? [], pages: pages.data ?? [] };
  });
}
