import { config } from './config';
import { revealSecret } from './pii';
import { sql } from './database';

export async function getIntegrationToken(integrationId: string): Promise<string> {
  const [row] = await sql`
    select ciphertext from private.integration_secrets
    where integration_id = ${integrationId}
  `;
  if (!row?.ciphertext) {
    throw new Error(`Token integrasi tidak ditemukan untuk ID: ${integrationId}`);
  }
  const decrypted = revealSecret(row.ciphertext as Buffer);
  const parsed = JSON.parse(decrypted) as { accessToken?: string };
  if (!parsed.accessToken) {
    throw new Error('Field accessToken tidak ditemukan dalam data rahasia integrasi.');
  }
  return parsed.accessToken;
}

export function graphUrl(path: string): string {
  if (!config.META_API_VERSION) {
    throw new Error('META_API_VERSION belum disetel.');
  }
  const cleanPath = path.replace(/^\/+/, '');
  return `https://graph.facebook.com/${config.META_API_VERSION}/${cleanPath}`;
}

export async function graphPost<T = any>(
  path: string,
  token: string,
  data: Record<string, unknown>
): Promise<T> {
  const url = graphUrl(path);
  const formData = new URLSearchParams();
  formData.set('access_token', token);

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'object') {
      formData.set(key, JSON.stringify(value));
    } else {
      formData.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: formData.toString(),
    signal: AbortSignal.timeout(30_000),
  });

  const body = (await response.json().catch(() => ({}))) as any;
  if (!response.ok || body.error) {
    const message = body.error?.message || body.error?.error_user_msg || response.statusText || 'Unknown Meta error';
    throw new Error(`Meta Graph API POST gagal (${response.status}): ${message}`);
  }
  return body as T;
}

export async function graphGet<T = any>(
  path: string,
  token: string,
  params?: Record<string, unknown>
): Promise<T> {
  const url = new URL(graphUrl(path));
  url.searchParams.set('access_token', token);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;
      if (typeof value === 'object') {
        url.searchParams.set(key, JSON.stringify(value));
      } else {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(30_000),
  });

  const body = (await response.json().catch(() => ({}))) as any;
  if (!response.ok || body.error) {
    const message = body.error?.message || body.error?.error_user_msg || response.statusText || 'Unknown Meta error';
    throw new Error(`Meta Graph API GET gagal (${response.status}): ${message}`);
  }
  return body as T;
}

function normalizeAccountId(accountId: string): string {
  return accountId.startsWith('act_') ? accountId : `act_${accountId}`;
}

export async function createMetaCampaign(
  token: string,
  accountId: string,
  params: {
    name: string;
    objective: string;
    status?: string;
    special_ad_categories?: string[];
    [key: string]: unknown;
  }
): Promise<{ id: string }> {
  const actId = normalizeAccountId(accountId);
  const metaStatus = params.status?.toLowerCase() === 'active' ? 'ACTIVE' : 'PAUSED';
  const payload: Record<string, unknown> = {
    name: params.name,
    objective: params.objective,
    status: metaStatus,
    special_ad_categories: params.special_ad_categories ?? [],
  };

  const response = await graphPost<{ id: string }>(`${actId}/campaigns`, token, payload);
  return { id: String(response.id) };
}

export async function createMetaAdSet(
  token: string,
  targetId: string,
  params: {
    name: string;
    campaign_id?: string;
    optimization_goal?: string;
    billing_event?: string;
    bid_strategy?: string;
    daily_budget?: number;
    lifetime_budget?: number;
    targeting: Record<string, unknown>;
    start_time?: string;
    end_time?: string;
    status?: string;
    promoted_object?: Record<string, unknown>;
    account_id?: string;
    [key: string]: unknown;
  }
): Promise<{ id: string }> {
  const metaStatus = params.status?.toLowerCase() === 'active' ? 'ACTIVE' : 'PAUSED';

  let actId: string;
  let campaignId: string;

  if (params.campaign_id) {
    actId = normalizeAccountId(params.account_id || targetId);
    campaignId = params.campaign_id;
  } else if (params.account_id) {
    actId = normalizeAccountId(params.account_id);
    campaignId = targetId;
  } else if (targetId.startsWith('act_')) {
    actId = normalizeAccountId(targetId);
    campaignId = String(params.campaign_id || '');
  } else {
    actId = normalizeAccountId(targetId);
    campaignId = String(params.campaign_id || targetId);
  }

  const payload: Record<string, unknown> = {
    name: params.name,
    campaign_id: campaignId,
    status: metaStatus,
    targeting: params.targeting,
  };

  if (params.optimization_goal) payload.optimization_goal = params.optimization_goal;
  if (params.billing_event) payload.billing_event = params.billing_event;
  if (params.bid_strategy) payload.bid_strategy = params.bid_strategy;
  if (params.daily_budget !== undefined) payload.daily_budget = params.daily_budget;
  if (params.lifetime_budget !== undefined) payload.lifetime_budget = params.lifetime_budget;
  if (params.start_time) payload.start_time = params.start_time;
  if (params.end_time) payload.end_time = params.end_time;
  if (params.promoted_object) payload.promoted_object = params.promoted_object;

  const response = await graphPost<{ id: string }>(`${actId}/adsets`, token, payload);
  return { id: String(response.id) };
}

export async function createMetaAd(
  token: string,
  accountId: string,
  params: {
    name: string;
    adset_id: string;
    creative: Record<string, unknown>;
    status?: string;
    [key: string]: unknown;
  }
): Promise<{ id: string }> {
  const actId = normalizeAccountId(accountId);
  const metaStatus = params.status?.toLowerCase() === 'active' ? 'ACTIVE' : 'PAUSED';
  const payload: Record<string, unknown> = {
    name: params.name,
    adset_id: params.adset_id,
    creative: params.creative,
    status: metaStatus,
  };

  const response = await graphPost<{ id: string }>(`${actId}/ads`, token, payload);
  return { id: String(response.id) };
}

export async function updateMetaCampaignStatus(
  token: string,
  campaignExternalId: string,
  status: 'PAUSED' | 'ACTIVE'
): Promise<{ success: boolean }> {
  const response = await graphPost<{ success?: boolean; id?: string }>(
    campaignExternalId,
    token,
    { status }
  );
  return { success: response.success !== false };
}

export async function fetchCampaignInsights(
  token: string,
  objectId: string,
  params: {
    time_range?: { since: string; until: string } | string;
    date_preset?: string;
    level?: 'campaign' | 'adset' | 'ad';
    fields?: string | string[];
    limit?: number;
    time_increment?: number | string;
    [key: string]: unknown;
  }
): Promise<{ data: Array<Record<string, unknown>>; paging?: unknown }> {
  const queryParams: Record<string, unknown> = {};
  if (params.time_range) queryParams.time_range = params.time_range;
  if (params.date_preset) queryParams.date_preset = params.date_preset;
  if (params.level) queryParams.level = params.level;
  if (params.limit !== undefined) queryParams.limit = params.limit;
  if (params.time_increment !== undefined) queryParams.time_increment = params.time_increment;
  if (params.fields) {
    queryParams.fields = Array.isArray(params.fields) ? params.fields.join(',') : params.fields;
  }

  return await graphGet<{ data: Array<Record<string, unknown>>; paging?: unknown }>(
    `${objectId}/insights`,
    token,
    queryParams
  );
}

export async function fetchAdAccounts(
  token: string,
  params?: {
    fields?: string | string[];
    limit?: number;
    [key: string]: unknown;
  }
): Promise<{ data: Array<Record<string, unknown>>; paging?: unknown }> {
  const queryParams: Record<string, unknown> = {};
  if (params?.limit !== undefined) queryParams.limit = params.limit;
  if (params?.fields) {
    queryParams.fields = Array.isArray(params.fields) ? params.fields.join(',') : params.fields;
  }

  return await graphGet<{ data: Array<Record<string, unknown>>; paging?: unknown }>(
    'me/adaccounts',
    token,
    queryParams
  );
}

export async function sendConversionEvent(
  token: string,
  pixelId: string,
  events: Array<{
    event_name: string;
    event_time: number;
    action_source: string;
    user_data: Record<string, unknown>;
    custom_data?: Record<string, unknown>;
    event_id?: string;
    [key: string]: unknown;
  }>
): Promise<{ events_received: number }> {
  const response = await graphPost<{ events_received?: number }>(
    `${pixelId}/events`,
    token,
    { data: events }
  );
  return { events_received: response.events_received ?? events.length };
}
