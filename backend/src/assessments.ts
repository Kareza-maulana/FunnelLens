import { z } from 'zod';
import { asActor } from './database';
import type { Owner } from './auth';
import { ApiError } from './auth';

export const createAssessmentSchema = z.object({
  leadId: z.string().uuid({ message: 'leadId harus berupa UUID yang valid.' }),
  dimension: z.enum(['audience_level', 'funnel_stage'], { message: 'dimension harus audience_level atau funnel_stage.' }),
  audienceLevel: z.enum(['cold', 'warm', 'hot', 'unknown'], { message: 'audienceLevel harus cold, warm, hot, atau unknown.' }).optional().nullable(),
  stageKey: z.string().trim().min(1, 'stageKey tidak boleh kosong.').optional().nullable(),
  strategyId: z.string().uuid({ message: 'strategyId harus berupa UUID yang valid.' }),
  evidenceEventId: z.string().uuid({ message: 'evidenceEventId harus berupa UUID yang valid.' }),
  conversionId: z.string().uuid({ message: 'conversionId harus berupa UUID yang valid.' }).optional().nullable(),
  reason: z.string().trim().min(1, 'Alasan penilaian harus diisi.'),
  supersedesId: z.string().uuid({ message: 'supersedesId harus berupa UUID yang valid.' }).optional().nullable(),
  overrideUntil: z.string().datetime({ message: 'overrideUntil harus berupa format datetime ISO yang valid.' }).optional().nullable(),
}).superRefine((data, ctx) => {
  if (data.dimension === 'audience_level') {
    if (!data.audienceLevel) {
      ctx.addIssue({
        code: 'custom',
        path: ['audienceLevel'],
        message: 'audienceLevel wajib diisi jika dimension adalah audience_level.',
      });
    }
    if (data.stageKey) {
      ctx.addIssue({
        code: 'custom',
        path: ['stageKey'],
        message: 'stageKey harus null jika dimension adalah audience_level.',
      });
    }
  } else if (data.dimension === 'funnel_stage') {
    if (!data.stageKey) {
      ctx.addIssue({
        code: 'custom',
        path: ['stageKey'],
        message: 'stageKey wajib diisi jika dimension adalah funnel_stage.',
      });
    }
    if (data.audienceLevel) {
      ctx.addIssue({
        code: 'custom',
        path: ['audienceLevel'],
        message: 'audienceLevel harus null jika dimension adalah funnel_stage.',
      });
    }
  }
});

export type CreateAssessmentInput = z.infer<typeof createAssessmentSchema>;

export async function createAssessment(owner: Owner, input: unknown): Promise<{ id: string; assessedAt: Date }> {
  const parsed = createAssessmentSchema.parse(input);
  const audienceLevel = parsed.dimension === 'audience_level' ? (parsed.audienceLevel ?? null) : null;
  const stageKey = parsed.dimension === 'funnel_stage' ? (parsed.stageKey ?? null) : null;
  const conversionId = parsed.conversionId ?? null;
  const supersedesId = parsed.supersedesId ?? null;
  const overrideUntil = parsed.overrideUntil ?? null;

  return asActor(owner.id, async (tx) => {
    try {
      const [row] = await tx<{ id: string; assessed_at: Date }[]>`
        insert into app.lead_assessments(
          lead_id, dimension, audience_level, stage_key, strategy_id, rule_version, method,
          agent_run_id, evidence_event_id, evidence_refs, conversion_id, reason, reviewer_id,
          assessed_at, supersedes_id, override_until
        ) values (
          ${parsed.leadId}::uuid,
          ${parsed.dimension},
          ${audienceLevel},
          ${stageKey},
          ${parsed.strategyId}::uuid,
          (select rule_version from app.strategy_plans where id = ${parsed.strategyId}::uuid),
          'manual',
          null,
          ${parsed.evidenceEventId}::uuid,
          '[]'::jsonb,
          ${conversionId}::uuid,
          ${parsed.reason},
          ${owner.id}::uuid,
          now(),
          ${supersedesId}::uuid,
          ${overrideUntil}::timestamptz
        ) returning id, assessed_at
      `;

      if (!row) {
        throw new ApiError(500, 'Gagal menyimpan penilaian lead.');
      }

      return { id: row.id, assessedAt: row.assessed_at };
    } catch (error: any) {
      if (error instanceof ApiError) throw error;
      if (error?.code === '23514') {
        throw new ApiError(400, `Validasi penilaian gagal: ${error.message}`);
      }
      if (error?.code === '23503') {
        throw new ApiError(404, `Data relasi tidak ditemukan: ${error.detail || error.message}`);
      }
      if (error?.code === '23502') {
        throw new ApiError(404, 'Strategy plan tidak ditemukan atau belum memiliki rule_version.');
      }
      throw error;
    }
  });
}

export const funnelDistributionInputSchema = z.object({
  strategyId: z.string().uuid({ message: 'strategyId harus berupa UUID yang valid.' }),
  campaignId: z.string().uuid({ message: 'campaignId harus berupa UUID yang valid.' }).optional().nullable(),
  asOf: z.string().datetime({ message: 'asOf harus berupa format datetime ISO yang valid.' }).optional().nullable(),
  cohortFrom: z.string().datetime({ message: 'cohortFrom harus berupa format datetime ISO yang valid.' }).optional().nullable(),
});

export type FunnelDistributionInput = z.infer<typeof funnelDistributionInputSchema>;

export type FunnelDistributionRow = {
  dimension: string;
  bucket: string;
  population_unit: string;
  audience_count: string | number;
  denominator: string | number | null;
  proportion: string | number | null;
};

export async function getFunnelDistribution(owner: Owner, input: unknown): Promise<FunnelDistributionRow[]> {
  const parsed = funnelDistributionInputSchema.parse(input);
  const campaignId = parsed.campaignId ?? null;
  const asOf = parsed.asOf ?? null;
  const cohortFrom = parsed.cohortFrom ?? null;

  return asActor(owner.id, async (tx) => {
    const rows = await tx<FunnelDistributionRow[]>`
      select * from app.funnel_distribution(
        ${parsed.strategyId}::uuid,
        ${campaignId}::uuid,
        coalesce(${asOf}::timestamptz, now()),
        ${cohortFrom}::timestamptz
      )
    `;

    return rows;
  });
}

export async function getLeadDirectory(owner: Owner): Promise<unknown[]> {
  return asActor(owner.id, async (tx) => tx`
    select * from app.lead_directory order by first_received_at desc limit 500
  `);
}

export async function getLatestStrategy(owner: Owner): Promise<{ id: string; version: number } | null> {
  return asActor(owner.id, async (tx) => {
    const [row] = await tx<{ id: string; version: number }[]>`
      select id, version from app.strategy_plans order by version desc limit 1
    `;

    return row ?? null;
  });
}
