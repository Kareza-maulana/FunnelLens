import { getIntegrationToken, fetchCampaignInsights, updateMetaCampaignStatus, graphGet } from './meta-ads';
import { sql, asConfiguredOwner } from './database';
import { config } from './config';

function extractActionValue(
  actions: Array<{ action_type?: string; value?: string | number }> | undefined,
  type: string
): number {
  if (!Array.isArray(actions)) return 0;
  const found = actions.find((item) => item.action_type === type);
  return found ? Math.round(Number(found.value) || 0) : 0;
}

export async function syncCampaignMetrics(
  integrationId: string,
  campaignId: string,
  externalCampaignId: string,
  jobId: string,
  reportTimezone: string,
  currency: string
): Promise<number> {
  const token = await getIntegrationToken(integrationId);

  const untilDate = new Date();
  const sinceDate = new Date();
  sinceDate.setDate(untilDate.getDate() - 7);

  const timeRange = {
    since: sinceDate.toISOString().slice(0, 10),
    until: untilDate.toISOString().slice(0, 10),
  };

  const fields = [
    'impressions',
    'inline_link_clicks',
    'clicks',
    'reach',
    'spend',
    'actions',
    'date_start',
    'date_stop',
  ];

  let rowsWritten = 0;

  // 1. Ambil insight level campaign
  const campaignInsights = await fetchCampaignInsights(token, externalCampaignId, {
    time_range: timeRange,
    level: 'campaign',
    fields: [...fields, 'campaign_id'],
    time_increment: 1,
    limit: 100,
  });

  for (const row of campaignInsights.data ?? []) {
    const reportDate = String(row.date_start);
    const impressions = Math.round(Number(row.impressions) || 0);
    const linkClicks = Math.round(Number(row.inline_link_clicks ?? row.clicks) || 0);
    const reach = Math.round(Number(row.reach) || 0);
    const spend = Number(row.spend) || 0;
    const platformLeads = extractActionValue(row.actions as any, 'lead');
    const platformPurchases = extractActionValue(row.actions as any, 'purchase');

    await sql`
      insert into app.ad_metrics_daily (
        campaign_id,
        ad_set_id,
        ad_id,
        external_entity_id,
        grain,
        creative_mapping_status,
        report_date,
        report_timezone,
        currency,
        breakdown_key,
        attribution_spec_key,
        impressions,
        link_clicks,
        reach,
        spend,
        platform_leads,
        platform_purchases,
        source_updated_at,
        ingest_job_id
      ) values (
        ${campaignId},
        null,
        null,
        ${externalCampaignId},
        'campaign',
        'not_applicable',
        ${reportDate},
        ${reportTimezone},
        ${currency},
        'all',
        'default',
        ${impressions},
        ${linkClicks},
        ${reach},
        ${spend},
        ${platformLeads},
        ${platformPurchases},
        clock_timestamp(),
        ${jobId}
      )
      on conflict (campaign_id, grain, external_entity_id, report_date, report_timezone, currency, breakdown_key, attribution_spec_key)
      do update set
        impressions = excluded.impressions,
        link_clicks = excluded.link_clicks,
        reach = excluded.reach,
        spend = excluded.spend,
        platform_leads = excluded.platform_leads,
        platform_purchases = excluded.platform_purchases,
        source_updated_at = clock_timestamp(),
        ingest_job_id = excluded.ingest_job_id,
        updated_at = clock_timestamp()
    `;
    rowsWritten++;
  }

  // Pre-load mapping local ad_sets
  const localAdSets = await sql`
    select id, external_id from app.ad_sets
    where campaign_id = ${campaignId} and external_id is not null
  `;
  const adSetMap = new Map<string, string>();
  for (const adSet of localAdSets) {
    adSetMap.set(adSet.external_id, adSet.id);
  }

  // 2. Ambil insight level adset
  const adsetInsights = await fetchCampaignInsights(token, externalCampaignId, {
    time_range: timeRange,
    level: 'adset',
    fields: [...fields, 'adset_id'],
    time_increment: 1,
    limit: 200,
  });

  for (const row of adsetInsights.data ?? []) {
    const externalAdSetId = String(row.adset_id);
    const localAdSetId = adSetMap.get(externalAdSetId);
    if (!localAdSetId) continue;

    const reportDate = String(row.date_start);
    const impressions = Math.round(Number(row.impressions) || 0);
    const linkClicks = Math.round(Number(row.inline_link_clicks ?? row.clicks) || 0);
    const reach = Math.round(Number(row.reach) || 0);
    const spend = Number(row.spend) || 0;
    const platformLeads = extractActionValue(row.actions as any, 'lead');
    const platformPurchases = extractActionValue(row.actions as any, 'purchase');

    await sql`
      insert into app.ad_metrics_daily (
        campaign_id,
        ad_set_id,
        ad_id,
        external_entity_id,
        grain,
        creative_mapping_status,
        report_date,
        report_timezone,
        currency,
        breakdown_key,
        attribution_spec_key,
        impressions,
        link_clicks,
        reach,
        spend,
        platform_leads,
        platform_purchases,
        source_updated_at,
        ingest_job_id
      ) values (
        ${campaignId},
        ${localAdSetId},
        null,
        ${externalAdSetId},
        'ad_set',
        'not_applicable',
        ${reportDate},
        ${reportTimezone},
        ${currency},
        'all',
        'default',
        ${impressions},
        ${linkClicks},
        ${reach},
        ${spend},
        ${platformLeads},
        ${platformPurchases},
        clock_timestamp(),
        ${jobId}
      )
      on conflict (campaign_id, grain, external_entity_id, report_date, report_timezone, currency, breakdown_key, attribution_spec_key)
      do update set
        impressions = excluded.impressions,
        link_clicks = excluded.link_clicks,
        reach = excluded.reach,
        spend = excluded.spend,
        platform_leads = excluded.platform_leads,
        platform_purchases = excluded.platform_purchases,
        source_updated_at = clock_timestamp(),
        ingest_job_id = excluded.ingest_job_id,
        updated_at = clock_timestamp()
    `;
    rowsWritten++;
  }

  // Pre-load mapping local ads
  const localAds = await sql`
    select id, external_id, ad_set_id, valid_from, valid_to
    from app.ads
    where campaign_id = ${campaignId} and external_id is not null
  `;
  const adMap = new Map<string, { id: string; ad_set_id: string; valid_from: Date; valid_to: Date | null }>();
  for (const ad of localAds) {
    adMap.set(ad.external_id, {
      id: ad.id,
      ad_set_id: ad.ad_set_id,
      valid_from: new Date(ad.valid_from),
      valid_to: ad.valid_to ? new Date(ad.valid_to) : null,
    });
  }

  // 3. Ambil insight level ad
  const adInsights = await fetchCampaignInsights(token, externalCampaignId, {
    time_range: timeRange,
    level: 'ad',
    fields: [...fields, 'ad_id', 'adset_id'],
    time_increment: 1,
    limit: 500,
  });

  for (const row of adInsights.data ?? []) {
    const externalAdId = String(row.ad_id);
    const externalAdSetId = String(row.adset_id);
    const localAdSetId = adSetMap.get(externalAdSetId) || (localAds.find((a) => a.external_id === externalAdId)?.ad_set_id ?? null);
    if (!localAdSetId) continue;

    const reportDate = String(row.date_start);
    const impressions = Math.round(Number(row.impressions) || 0);
    const linkClicks = Math.round(Number(row.inline_link_clicks ?? row.clicks) || 0);
    const reach = Math.round(Number(row.reach) || 0);
    const spend = Number(row.spend) || 0;
    const platformLeads = extractActionValue(row.actions as any, 'lead');
    const platformPurchases = extractActionValue(row.actions as any, 'purchase');

    // Cek apakah ada mapping ad lokal yang memvalidasi periode hari laporan ini
    const localAd = adMap.get(externalAdId);
    let mappingStatus: 'verified' | 'unknown' = 'unknown';
    let localAdId: string | null = null;

    if (localAd) {
      // Tanggal mulai dan selesai hari laporan
      const startOfDay = new Date(`${reportDate}T00:00:00Z`);
      const endOfDay = new Date(`${reportDate}T23:59:59.999Z`);
      if (localAd.valid_from <= startOfDay && (!localAd.valid_to || localAd.valid_to >= endOfDay)) {
        mappingStatus = 'verified';
        localAdId = localAd.id;
      }
    }

    await sql`
      insert into app.ad_metrics_daily (
        campaign_id,
        ad_set_id,
        ad_id,
        external_entity_id,
        grain,
        creative_mapping_status,
        report_date,
        report_timezone,
        currency,
        breakdown_key,
        attribution_spec_key,
        impressions,
        link_clicks,
        reach,
        spend,
        platform_leads,
        platform_purchases,
        source_updated_at,
        ingest_job_id
      ) values (
        ${campaignId},
        ${localAdSetId},
        ${localAdId},
        ${externalAdId},
        'ad',
        ${mappingStatus},
        ${reportDate},
        ${reportTimezone},
        ${currency},
        'all',
        'default',
        ${impressions},
        ${linkClicks},
        ${reach},
        ${spend},
        ${platformLeads},
        ${platformPurchases},
        clock_timestamp(),
        ${jobId}
      )
      on conflict (campaign_id, grain, external_entity_id, report_date, report_timezone, currency, breakdown_key, attribution_spec_key)
      do update set
        impressions = excluded.impressions,
        link_clicks = excluded.link_clicks,
        reach = excluded.reach,
        spend = excluded.spend,
        platform_leads = excluded.platform_leads,
        platform_purchases = excluded.platform_purchases,
        source_updated_at = clock_timestamp(),
        ingest_job_id = excluded.ingest_job_id,
        updated_at = clock_timestamp()
    `;
    rowsWritten++;
  }

  // Perbarui timestamp last_synced_at pada campaign
  await sql`
    update app.campaigns
    set last_synced_at = clock_timestamp()
    where id = ${campaignId}
  `;

  return rowsWritten;
}

export async function syncCampaignStructure(
  integrationId: string,
  campaignId: string,
  externalCampaignId: string
): Promise<{ adSetsCount: number; adsCount: number }> {
  const token = await getIntegrationToken(integrationId);

  // 1. Ambil struktur ad sets dari Meta
  const adSetsResponse = await graphGet<{ data: Array<Record<string, unknown>> }>(
    `${externalCampaignId}/adsets`,
    token,
    {
      fields: 'id,name,status,targeting,daily_budget,lifetime_budget',
      limit: 100,
    }
  );

  const adSets = adSetsResponse.data ?? [];
  let adsCount = 0;

  for (const adSet of adSets) {
    const externalAdSetId = String(adSet.id);
    const adSetName = String(adSet.name || 'Ad Set');
    const status = String(adSet.status || 'draft').toLowerCase();
    const targeting = (adSet.targeting as Record<string, unknown>) ?? {};

    let budgetMode: 'campaign' | 'daily' | 'lifetime' = 'campaign';
    let budgetAmount: number | null = null;

    if (adSet.daily_budget !== undefined && adSet.daily_budget !== null) {
      budgetMode = 'daily';
      budgetAmount = Number(adSet.daily_budget) / 100;
    } else if (adSet.lifetime_budget !== undefined && adSet.lifetime_budget !== null) {
      budgetMode = 'lifetime';
      budgetAmount = Number(adSet.lifetime_budget) / 100;
    }

    const [savedAdSet] = await sql`
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
        ${campaignId},
        ${externalAdSetId},
        ${adSetName},
        'cold',
        ${budgetMode},
        ${budgetAmount},
        ${sql.json(targeting as any)},
        ${status},
        clock_timestamp()
      )
      on conflict (campaign_id, external_id) do update set
        name = excluded.name,
        budget_mode = excluded.budget_mode,
        budget_amount = excluded.budget_amount,
        targeting = excluded.targeting,
        effective_status = excluded.effective_status,
        last_synced_at = clock_timestamp(),
        updated_at = clock_timestamp()
      returning id
    `;

    const localAdSetId = savedAdSet.id;

    // 2. Ambil iklan untuk setiap ad set
    const adsResponse = await graphGet<{ data: Array<Record<string, unknown>> }>(
      `${externalAdSetId}/ads`,
      token,
      {
        fields: 'id,name,status,creative',
        limit: 100,
      }
    );

    const ads = adsResponse.data ?? [];
    for (const ad of ads) {
      const externalAdId = String(ad.id);
      const adName = String(ad.name || 'Ad');
      const adStatus = String(ad.status || 'draft').toLowerCase();
      const metaCreative = ad.creative as { id?: string } | undefined;

      // Cek apakah row app.ads sudah ada
      const [existingAd] = await sql`
        select id from app.ads
        where campaign_id = ${campaignId} and external_id = ${externalAdId} and valid_to is null
        limit 1
      `;

      if (existingAd) {
        await sql`
          update app.ads
          set name = ${adName},
              effective_status = ${adStatus}
          where id = ${existingAd.id}
        `;
      } else {
        // Cari creative lokal atau buat placeholder creative
        let creativeId: string | null = null;
        if (metaCreative?.id) {
          const [foundCreative] = await sql`
            select id from app.creatives
            where external_id = ${metaCreative.id}
            limit 1
          `;
          creativeId = foundCreative?.id ?? null;
        }

        if (!creativeId) {
          const [newCreative] = await sql`
            insert into app.creatives (
              name,
              format,
              headline,
              source,
              external_id
            ) values (
              ${adName + ' Creative'},
              'text',
              ${adName},
              'imported',
              ${metaCreative?.id ?? null}
            )
            returning id
          `;
          creativeId = newCreative.id;
        }

        await sql`
          insert into app.ads (
            campaign_id,
            ad_set_id,
            creative_id,
            external_id,
            name,
            effective_status,
            valid_from
          ) values (
            ${campaignId},
            ${localAdSetId},
            ${creativeId},
            ${externalAdId},
            ${adName},
            ${adStatus},
            clock_timestamp()
          )
        `;
      }
      adsCount++;
    }
  }

  return { adSetsCount: adSets.length, adsCount };
}

export async function syncCampaignStatus(
  integrationId: string,
  campaignId: string,
  externalCampaignId: string
): Promise<string> {
  const token = await getIntegrationToken(integrationId);
  const response = await graphGet<{ status?: string; effective_status?: string }>(
    externalCampaignId,
    token,
    { fields: 'status,effective_status' }
  );

  const effectiveStatus = (response.effective_status || response.status || 'PAUSED').toLowerCase();

  await sql`
    update app.campaigns
    set effective_status = ${effectiveStatus},
        last_synced_at = clock_timestamp()
    where id = ${campaignId}
  `;

  return effectiveStatus;
}
