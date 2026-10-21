import { z } from 'zod';
import { asActor } from './database';
import type { Owner } from './auth';

export const analyticsFilterSchema = z.object({
  campaignId: z.string().uuid({ message: 'campaignId harus berupa UUID yang valid.' }).optional().nullable(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal from harus YYYY-MM-DD.').optional().nullable(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal to harus YYYY-MM-DD.').optional().nullable(),
}).optional().default({});

export type AnalyticsFilter = z.infer<typeof analyticsFilterSchema>;

export type CampaignDailyRow = {
  campaign_id: string;
  report_date: string;
  report_timezone: string;
  currency: string;
  attribution_spec_key: string;
  impressions: string | number | null;
  link_clicks: string | number | null;
  reach: string | number | null;
  spend: string | number | null;
  platform_leads: string | number | null;
  platform_purchases: string | number | null;
  source_updated_at: Date;
  link_ctr_percent: string | number | null;
  cpm: string | number | null;
  link_cpc: string | number | null;
  platform_cpl: string | number | null;
};

export async function getCampaignDaily(owner: Owner, filters?: unknown): Promise<CampaignDailyRow[]> {
  const parsed = analyticsFilterSchema.parse(filters);
  const campaignId = parsed.campaignId ?? null;
  const from = parsed.from ?? null;
  const to = parsed.to ?? null;

  return asActor(owner.id, async (tx) => tx<CampaignDailyRow[]>`
    select * from app.campaign_daily
    where (${campaignId}::uuid is null or campaign_id = ${campaignId}::uuid)
      and (${from}::date is null or report_date >= ${from}::date)
      and (${to}::date is null or report_date <= ${to}::date)
    order by report_date desc
    limit 365
  `);
}

export type CreativeDailyRow = {
  campaign_id: string;
  creative_id: string;
  report_date: string;
  report_timezone: string;
  currency: string;
  attribution_spec_key: string;
  impressions: string | number | null;
  link_clicks: string | number | null;
  spend: string | number | null;
  platform_leads: string | number | null;
  platform_purchases: string | number | null;
  source_updated_at: Date;
};

export async function getCreativeDaily(owner: Owner, filters?: unknown): Promise<CreativeDailyRow[]> {
  const parsed = analyticsFilterSchema.parse(filters);
  const campaignId = parsed.campaignId ?? null;
  const from = parsed.from ?? null;
  const to = parsed.to ?? null;

  return asActor(owner.id, async (tx) => tx<CreativeDailyRow[]>`
    select * from app.creative_daily
    where (${campaignId}::uuid is null or campaign_id = ${campaignId}::uuid)
      and (${from}::date is null or report_date >= ${from}::date)
      and (${to}::date is null or report_date <= ${to}::date)
    order by report_date desc
    limit 365
  `);
}

export type CreativeMappingCoverageRow = {
  campaign_id: string;
  report_date: string;
  currency: string;
  attribution_spec_key: string;
  ad_reporting_rows: string | number;
  mapped_rows: string | number;
  ambiguous_rows: string | number;
  unknown_rows: string | number;
};

export async function getCreativeCoverage(owner: Owner, campaignId?: string | null): Promise<CreativeMappingCoverageRow[]> {
  const validCampaignId = campaignId ? z.string().uuid({ message: 'campaignId harus berupa UUID yang valid.' }).parse(campaignId) : null;

  return asActor(owner.id, async (tx) => tx<CreativeMappingCoverageRow[]>`
    select * from app.creative_mapping_coverage
    where (${validCampaignId}::uuid is null or campaign_id = ${validCampaignId}::uuid)
    order by report_date desc limit 365
  `);
}

export type BusinessImpactDailyRow = {
  campaign_id: string | null;
  currency: string;
  report_date: string;
  confirmed_purchases: string | number;
  confirmed_refunds: string | number;
  unknown_amount_count: string | number;
  recorded_net_revenue: string | number | null;
  verified_new_customers: string | number | null;
};

export async function getBusinessImpact(owner: Owner, filters?: unknown): Promise<BusinessImpactDailyRow[]> {
  const parsed = analyticsFilterSchema.parse(filters);
  const campaignId = parsed.campaignId ?? null;
  const from = parsed.from ?? null;
  const to = parsed.to ?? null;

  return asActor(owner.id, async (tx) => tx<BusinessImpactDailyRow[]>`
    select * from app.business_impact_daily
    where (${campaignId}::uuid is null or campaign_id = ${campaignId}::uuid)
      and (${from}::date is null or report_date >= ${from}::date)
      and (${to}::date is null or report_date <= ${to}::date)
    order by report_date desc limit 365
  `);
}

export type OverviewStats = {
  total_campaigns: number;
  active_campaigns: number;
  total_leads: number;
  confirmed_conversions: number;
  total_revenue: number;
  connected_integrations: number;
  open_insights: number;
  totalCampaigns: number;
  activeCampaigns: number;
  totalLeads: number;
  confirmedConversions: number;
  totalRevenue: number;
  connectedIntegrations: number;
  openInsights: number;
};

export async function getOverviewStats(owner: Owner): Promise<OverviewStats> {
  return asActor(owner.id, async (tx) => {
    const [row] = await tx`
      select
        (select count(*) from app.campaigns) as total_campaigns,
        (select count(*) from app.campaigns where upper(effective_status) = 'ACTIVE') as active_campaigns,
        (select count(*) from app.leads) as total_leads,
        (select count(*) from app.conversions where status = 'confirmed') as confirmed_conversions,
        (select coalesce(sum(amount), 0) from app.conversions where status = 'confirmed' and kind = 'purchase') as total_revenue,
        (select count(*) from app.integrations where status = 'connected') as connected_integrations,
        (select count(*) from app.insights where review_status = 'open') as open_insights
    `;

    const totalCampaigns = Number(row?.total_campaigns ?? 0);
    const activeCampaigns = Number(row?.active_campaigns ?? 0);
    const totalLeads = Number(row?.total_leads ?? 0);
    const confirmedConversions = Number(row?.confirmed_conversions ?? 0);
    const totalRevenue = Number(row?.total_revenue ?? 0);
    const connectedIntegrations = Number(row?.connected_integrations ?? 0);
    const openInsights = Number(row?.open_insights ?? 0);

    return {
      total_campaigns: totalCampaigns,
      active_campaigns: activeCampaigns,
      total_leads: totalLeads,
      confirmed_conversions: confirmedConversions,
      total_revenue: totalRevenue,
      connected_integrations: connectedIntegrations,
      open_insights: openInsights,
      totalCampaigns,
      activeCampaigns,
      totalLeads,
      confirmedConversions,
      totalRevenue,
      connectedIntegrations,
      openInsights,
    };
  });
}
