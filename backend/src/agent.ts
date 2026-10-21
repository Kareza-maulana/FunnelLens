import { randomUUID } from 'node:crypto';
import { sql } from './database';

export interface CreateAgentRunInput {
  purpose: 'branding' | 'planning' | 'metrics' | 'creative' | 'audience' | 'funnel' | 'execution' | 'knowledge';
  mode?: 'deterministic' | 'llm' | 'mixed';
  campaign_id?: string | null;
  campaignId?: string | null;
  lead_id?: string | null;
  leadId?: string | null;
  creative_id?: string | null;
  creativeId?: string | null;
  workflow_version?: string;
  workflowVersion?: string;
  prompt_version?: string | null;
  promptVersion?: string | null;
  output_schema_version?: string;
  outputSchemaVersion?: string;
  calculator_version?: string | null;
  rule_version?: string | null;
  provider?: string | null;
  model?: string | null;
  input_refs?: Record<string, unknown>;
  inputRefs?: Record<string, unknown>;
  input_hash?: string | null;
  idempotency_key?: string;
  window_start?: Date | string | null;
  windowStart?: Date | string | null;
  window_end?: Date | string | null;
  windowEnd?: Date | string | null;
}

export async function createAgentRun(
  tx: any,
  input: CreateAgentRunInput
): Promise<{ id: string }> {
  const mode = input.mode ?? 'deterministic';
  const workflowVersion = input.workflowVersion ?? input.workflow_version ?? 'v1';
  const outputSchemaVersion = input.outputSchemaVersion ?? input.output_schema_version ?? 'v1';
  const idempotencyKey = input.idempotency_key ?? `run-${randomUUID()}`;
  const inputRefs = input.inputRefs ?? input.input_refs ?? {};
  const campaignId = input.campaignId ?? input.campaign_id ?? null;
  const leadId = input.leadId ?? input.lead_id ?? null;
  const creativeId = input.creativeId ?? input.creative_id ?? null;
  const promptVersion = input.promptVersion ?? input.prompt_version ?? null;
  const windowStart = input.windowStart ?? input.window_start ?? null;
  const windowEnd = input.windowEnd ?? input.window_end ?? null;

  const [row] = await tx`
    insert into app.agent_runs (
      purpose,
      mode,
      status,
      campaign_id,
      lead_id,
      creative_id,
      workflow_version,
      prompt_version,
      output_schema_version,
      calculator_version,
      rule_version,
      provider,
      model,
      input_refs,
      input_hash,
      idempotency_key,
      window_start,
      window_end
    ) values (
      ${input.purpose},
      ${mode},
      'queued',
      ${campaignId},
      ${leadId},
      ${creativeId},
      ${workflowVersion},
      ${promptVersion},
      ${outputSchemaVersion},
      ${input.calculator_version ?? null},
      ${input.rule_version ?? null},
      ${input.provider ?? null},
      ${input.model ?? null},
      ${tx.json(inputRefs)},
      ${input.input_hash ?? null},
      ${idempotencyKey},
      ${windowStart},
      ${windowEnd}
    )
    returning id
  `;

  return { id: row.id };
}

export async function startRun(tx: any, runId: string): Promise<void> {
  await tx`
    update app.agent_runs
    set status = 'running',
        started_at = clock_timestamp()
    where id = ${runId}
  `;
}

export async function completeRun(
  tx: any,
  runId: string,
  output?: Record<string, unknown>
): Promise<void> {
  await tx`
    update app.agent_runs
    set status = 'succeeded',
        output = ${tx.json(output ?? {})},
        finished_at = clock_timestamp()
    where id = ${runId}
  `;
}

export async function failRun(
  tx: any,
  runId: string,
  errorCode?: string,
  errorSummary?: string
): Promise<void> {
  await tx`
    update app.agent_runs
    set status = 'failed',
        error_code = ${errorCode ?? 'run_failed'},
        error_summary = ${errorSummary?.slice(0, 1000) ?? null},
        finished_at = clock_timestamp()
    where id = ${runId}
  `;
}

export interface RecordStepInput {
  agent_run_id?: string;
  agentRunId?: string;
  job_id?: string | null;
  sequence: number;
  step_key: string;
  kind?: 'retrieve' | 'sql' | 'llm' | 'vision' | 'tool' | 'validate';
  is_write?: boolean;
  attempt?: number;
  tool_name: string;
  tool_version: string;
  input_hash?: string | null;
  input_ref?: string | null;
  result_refs?: Record<string, unknown>;
  external_object_id?: string | null;
  status?: 'running' | 'succeeded' | 'failed' | 'needs_reconciliation';
  error_summary?: string | null;
}

export interface StepHandle {
  id: string;
  succeed: (
    tx: any,
    details?: { external_object_id?: string; result_refs?: Record<string, unknown> }
  ) => Promise<void>;
  fail: (tx: any, errorSummary: string) => Promise<void>;
}

export async function succeedStep(
  tx: any,
  stepId: string,
  details?: { external_object_id?: string; result_refs?: Record<string, unknown> }
): Promise<void> {
  await tx`
    update app.agent_steps
    set status = 'succeeded',
        external_object_id = coalesce(${details?.external_object_id ?? null}, external_object_id),
        result_refs = ${tx.json(details?.result_refs ?? {})},
        finished_at = clock_timestamp()
    where id = ${stepId}
  `;
}

export async function failStep(
  tx: any,
  stepId: string,
  errorSummary: string
): Promise<void> {
  await tx`
    update app.agent_steps
    set status = 'failed',
        error_summary = ${errorSummary.slice(0, 1000)},
        finished_at = clock_timestamp()
    where id = ${stepId}
  `;
}

export async function recordStep(
  tx: any,
  input: RecordStepInput
): Promise<StepHandle> {
  const kind = input.kind ?? 'tool';
  const isWrite = input.is_write ?? false;
  const attempt = input.attempt ?? 1;
  const runId = input.agentRunId ?? input.agent_run_id;
  if (!runId) throw new Error('agent_run_id is required');

  // Trigger guard_step mengharuskan step baru berstatus 'running' saat INSERT
  const [row] = await tx`
    insert into app.agent_steps (
      agent_run_id,
      job_id,
      sequence,
      step_key,
      kind,
      is_write,
      attempt,
      tool_name,
      tool_version,
      input_hash,
      input_ref,
      result_refs,
      status,
      started_at
    ) values (
      ${runId},
      ${input.job_id ?? null},
      ${input.sequence},
      ${input.step_key},
      ${kind},
      ${isWrite},
      ${attempt},
      ${input.tool_name},
      ${input.tool_version},
      ${input.input_hash ?? null},
      ${input.input_ref ?? null},
      ${tx.json(input.result_refs ?? {})},
      'running',
      clock_timestamp()
    )
    returning id
  `;

  const stepId = row.id as string;

  const succeed = async (
    t: any,
    details?: { external_object_id?: string; result_refs?: Record<string, unknown> }
  ) => succeedStep(t, stepId, details);

  const fail = async (t: any, errorSummary: string) => failStep(t, stepId, errorSummary);

  if (input.status === 'succeeded') {
    await succeed(tx, {
      external_object_id: input.external_object_id ?? undefined,
      result_refs: input.result_refs,
    });
  } else if (input.status === 'failed') {
    await fail(tx, input.error_summary ?? 'Step failed');
  }

  return { id: stepId, succeed, fail };
}
