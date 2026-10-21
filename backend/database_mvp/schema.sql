-- GENERATED: tools/package_schema.py. Fresh database only. Prefer tools/migrate.py.

BEGIN;

SELECT pg_advisory_xact_lock(hashtextextended('funnellens:mvp:migrations',0));

CREATE TABLE public.funnellens_mvp_migrations (name text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now());

-- Migration: 001_tables.sql

-- PostgreSQL 16+. One business per database; no tenant/workspace.
CREATE SCHEMA app;
REVOKE ALL ON SCHEMA app FROM PUBLIC;

CREATE TABLE app.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_subject text NOT NULL UNIQUE,
  display_name text NOT NULL,
  is_owner boolean NOT NULL DEFAULT false,
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX single_active_owner ON app.users(is_owner) WHERE is_owner AND disabled_at IS NULL;

CREATE TABLE app.business_profile (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id=1),
  name text NOT NULL,
  industry text,
  description text,
  target_market jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(target_market)='object'),
  currency text NOT NULL DEFAULT 'IDR' CHECK (currency ~ '^[A-Z]{3}$'),
  timezone text NOT NULL DEFAULT 'Asia/Jakarta',
  selected_brand jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(selected_brand)='object'),
  brand_options jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(brand_options)='array'),
  onboarding_draft jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(onboarding_draft)='object'),
  onboarding_step smallint NOT NULL DEFAULT 1 CHECK (onboarding_step BETWEEN 1 AND 6),
  completed_at timestamptz,
  revision integer NOT NULL DEFAULT 1 CHECK (revision>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sku text UNIQUE,
  price numeric(20,6) NOT NULL CHECK (price>=0),
  currency text NOT NULL DEFAULT 'IDR' CHECK (currency ~ '^[A-Z]{3}$'),
  verified_benefits jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(verified_benefits)='array'),
  media jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(media)='array'),
  active boolean NOT NULL DEFAULT true,
  revision integer NOT NULL DEFAULT 1 CHECK (revision>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app.integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('meta','whatsapp','landing_page')),
  connector_kind text NOT NULL CHECK (connector_kind IN ('oauth','mcp','webhook','manual')),
  external_connection_id text NOT NULL,
  status text NOT NULL DEFAULT 'disconnected' CHECK (status IN ('disconnected','connected','expired','error')),
  credential_secret_ref text,
  scopes text[] NOT NULL DEFAULT '{}',
  capabilities jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(capabilities)='object'),
  verified_assets jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(verified_assets)='array'),
  sync_cursors jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(sync_cursors)='object'),
  token_expires_at timestamptz,
  verified_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider,external_connection_id)
);

CREATE TABLE app.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL REFERENCES app.integrations(id),
  external_ad_account_id text NOT NULL,
  external_id text,
  name text NOT NULL,
  objective text NOT NULL,
  planned_funnel_role text,
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  report_timezone text NOT NULL,
  desired_status text NOT NULL DEFAULT 'draft' CHECK (desired_status IN ('draft','paused','active','archived')),
  effective_status text NOT NULL DEFAULT 'draft',
  control_version integer NOT NULL DEFAULT 1 CHECK (control_version>0),
  current_draft_id uuid,
  applied_draft_id uuid,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(integration_id,external_ad_account_id,external_id)
);

CREATE TABLE app.agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose text NOT NULL CHECK (purpose IN ('branding','planning','metrics','creative','audience','funnel','execution','knowledge')),
  mode text NOT NULL CHECK (mode IN ('deterministic','llm','mixed')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed','cancelled')),
  campaign_id uuid REFERENCES app.campaigns(id),
  lead_id uuid,
  creative_id uuid,
  workflow_version text NOT NULL,
  prompt_version text,
  output_schema_version text NOT NULL,
  calculator_version text,
  rule_version text,
  provider text,
  model text,
  input_refs jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(input_refs)='object'),
  input_hash text,
  output jsonb,
  window_start timestamptz,
  window_end timestamptz,
  data_as_of timestamptz NOT NULL DEFAULT now(),
  coverage numeric(7,6) CHECK (coverage BETWEEN 0 AND 1),
  input_tokens bigint CHECK (input_tokens>=0),
  output_tokens bigint CHECK (output_tokens>=0),
  cost numeric(20,6) CHECK (cost>=0),
  cost_currency text CHECK (cost_currency ~ '^[A-Z]{3}$'),
  idempotency_key text NOT NULL UNIQUE,
  started_at timestamptz,
  finished_at timestamptz,
  error_code text,
  error_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((window_start IS NULL AND window_end IS NULL) OR (window_start IS NOT NULL AND window_end>window_start)),
  CHECK (mode='deterministic' OR (provider IS NOT NULL AND model IS NOT NULL AND prompt_version IS NOT NULL))
);

CREATE TABLE app.strategy_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version integer NOT NULL UNIQUE CHECK (version>0),
  objective text NOT NULL,
  total_budget numeric(20,6) NOT NULL CHECK (total_budget>=0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL CHECK (ends_at>starts_at),
  input_snapshot jsonb NOT NULL CHECK (jsonb_typeof(input_snapshot)='object'),
  input_hash text NOT NULL,
  funnel jsonb NOT NULL CHECK (jsonb_typeof(funnel)='array' AND jsonb_array_length(funnel)>0),
  stage_targets jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(stage_targets)='array'),
  rules jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(rules)='object'),
  rule_version text NOT NULL,
  assumptions jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(assumptions)='array'),
  agent_run_id uuid REFERENCES app.agent_runs(id),
  confirmed_by uuid NOT NULL REFERENCES app.users(id),
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app.creatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creative_key uuid NOT NULL DEFAULT gen_random_uuid(),
  version integer NOT NULL DEFAULT 1 CHECK (version>0),
  external_id text,
  name text NOT NULL,
  format text NOT NULL CHECK (format IN ('image','video','carousel','text')),
  angle text,
  headline text,
  primary_text text,
  media jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(media)='array'),
  source text NOT NULL CHECK (source IN ('manual','imported','ai')),
  based_on_id uuid REFERENCES app.creatives(id),
  agent_run_id uuid REFERENCES app.agent_runs(id),
  created_by uuid REFERENCES app.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(creative_key,version)
);

CREATE TABLE app.campaign_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES app.campaigns(id),
  version integer NOT NULL CHECK (version>0),
  strategy_id uuid NOT NULL REFERENCES app.strategy_plans(id),
  configuration jsonb NOT NULL CHECK (jsonb_typeof(configuration)='object'),
  schema_version integer NOT NULL DEFAULT 1 CHECK (schema_version=1),
  payload_hash text NOT NULL,
  budget_amount numeric(20,6) NOT NULL CHECK (budget_amount>=0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL CHECK (ends_at>starts_at),
  created_by uuid REFERENCES app.users(id),
  agent_run_id uuid REFERENCES app.agent_runs(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(campaign_id,version),
  UNIQUE(campaign_id,id)
);
ALTER TABLE app.campaigns ADD FOREIGN KEY(id,current_draft_id) REFERENCES app.campaign_drafts(campaign_id,id);
ALTER TABLE app.campaigns ADD FOREIGN KEY(id,applied_draft_id) REFERENCES app.campaign_drafts(campaign_id,id);

CREATE TABLE app.ad_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES app.campaigns(id),
  external_id text,
  name text NOT NULL,
  planned_segment text NOT NULL DEFAULT 'cold' CHECK (planned_segment IN ('cold','warm','hot','unknown')),
  budget_mode text NOT NULL CHECK (budget_mode IN ('campaign','daily','lifetime')),
  budget_amount numeric(20,6) CHECK (budget_amount>=0),
  targeting jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(targeting)='object'),
  effective_status text NOT NULL DEFAULT 'draft',
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(campaign_id,external_id),
  UNIQUE(campaign_id,id),
  CHECK ((budget_mode='campaign' AND budget_amount IS NULL) OR (budget_mode<>'campaign' AND budget_amount IS NOT NULL))
);

CREATE TABLE app.ads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES app.campaigns(id),
  ad_set_id uuid NOT NULL,
  creative_id uuid NOT NULL REFERENCES app.creatives(id),
  external_id text NOT NULL,
  name text NOT NULL,
  effective_status text NOT NULL DEFAULT 'draft',
  valid_from timestamptz NOT NULL,
  valid_to timestamptz CHECK (valid_to>valid_from),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(campaign_id,ad_set_id) REFERENCES app.ad_sets(campaign_id,id),
  UNIQUE(campaign_id,external_id,valid_from),
  UNIQUE(campaign_id,ad_set_id,id)
);

CREATE TABLE app.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ciphertext bytea,
  phone_ciphertext bytea,
  phone_hmac text UNIQUE,
  phone_hint text,
  email_ciphertext bytea,
  email_hmac text UNIQUE,
  key_version text NOT NULL,
  identity_source text NOT NULL,
  channel_verified_at timestamptz,
  erased_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((phone_ciphertext IS NULL)=(phone_hmac IS NULL)),
  CHECK ((email_ciphertext IS NULL)=(email_hmac IS NULL))
);

CREATE TABLE app.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES app.contacts(id),
  campaign_id uuid REFERENCES app.campaigns(id),
  primary_source text NOT NULL CHECK (primary_source IN ('whatsapp','landing_page','unknown')),
  first_received_at timestamptz NOT NULL,
  quality_status text NOT NULL DEFAULT 'unreviewed' CHECK (quality_status IN ('unreviewed','qualified','unqualified')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,contact_id)
);
CREATE UNIQUE INDEX one_lead_per_campaign_contact ON app.leads(campaign_id,contact_id) WHERE campaign_id IS NOT NULL;
ALTER TABLE app.agent_runs ADD FOREIGN KEY(lead_id) REFERENCES app.leads(id);
ALTER TABLE app.agent_runs ADD FOREIGN KEY(creative_id) REFERENCES app.creatives(id);

CREATE TABLE app.lead_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid REFERENCES app.integrations(id),
  source_namespace text NOT NULL,
  source_event_id text NOT NULL,
  event_kind text NOT NULL CHECK (event_kind IN ('touchpoint','message','message_status','form_submission','manual_note','purchase_signal')),
  contract_version integer NOT NULL DEFAULT 1 CHECK (contract_version>0),
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  lead_id uuid REFERENCES app.leads(id),
  contact_id uuid REFERENCES app.contacts(id),
  campaign_id uuid REFERENCES app.campaigns(id),
  linkage_status text NOT NULL DEFAULT 'unknown' CHECK (linkage_status IN ('unknown','verified','unverified')),
  channel text NOT NULL CHECK (channel IN ('whatsapp','landing_page','manual','meta')),
  thread_ref text,
  message_ref text,
  payload_ciphertext bytea,
  payload_ref text,
  properties jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(properties)='object'),
  consent_basis text,
  actor_id uuid REFERENCES app.users(id),
  purge_after timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT(integration_id,source_namespace,source_event_id),
  CHECK (NOT (payload_ciphertext IS NOT NULL AND payload_ref IS NOT NULL)),
  CHECK (linkage_status<>'verified' OR lead_id IS NOT NULL)
);

CREATE TABLE app.conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_event_id uuid NOT NULL UNIQUE REFERENCES app.lead_events(id),
  lead_id uuid REFERENCES app.leads(id),
  campaign_id uuid REFERENCES app.campaigns(id),
  source_system text NOT NULL,
  external_order_id text,
  kind text NOT NULL CHECK (kind IN ('purchase','refund')),
  parent_conversion_id uuid REFERENCES app.conversions(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','void')),
  amount numeric(20,6) CHECK (amount>=0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  occurred_at timestamptz NOT NULL,
  confirmed_at timestamptz,
  confirmation_method text CHECK (confirmation_method IN ('manual','provider_verified')),
  confirmed_by uuid REFERENCES app.users(id),
  is_new_customer boolean,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_system,external_order_id,kind),
  CHECK ((kind='refund')=(parent_conversion_id IS NOT NULL)),
  CHECK (status<>'confirmed' OR (confirmed_at IS NOT NULL AND confirmation_method IS NOT NULL))
);

CREATE TABLE app.lead_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES app.leads(id),
  dimension text NOT NULL CHECK (dimension IN ('audience_level','funnel_stage')),
  audience_level text CHECK (audience_level IN ('cold','warm','hot','unknown')),
  stage_key text,
  strategy_id uuid NOT NULL REFERENCES app.strategy_plans(id),
  rule_version text NOT NULL,
  method text NOT NULL CHECK (method IN ('rule','ai','manual')),
  agent_run_id uuid REFERENCES app.agent_runs(id),
  evidence_event_id uuid NOT NULL REFERENCES app.lead_events(id),
  evidence_refs jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(evidence_refs)='array'),
  conversion_id uuid REFERENCES app.conversions(id),
  reason text NOT NULL CHECK (length(trim(reason))>0),
  reviewer_id uuid REFERENCES app.users(id),
  assessed_at timestamptz NOT NULL DEFAULT now(),
  supersedes_id uuid UNIQUE REFERENCES app.lead_assessments(id),
  override_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((dimension='audience_level' AND audience_level IS NOT NULL AND stage_key IS NULL) OR
         (dimension='funnel_stage' AND stage_key IS NOT NULL AND audience_level IS NULL)),
  CHECK (method<>'manual' OR reviewer_id IS NOT NULL),
  CHECK (method<>'ai' OR agent_run_id IS NOT NULL),
  CHECK (override_until IS NULL OR (method='manual' AND override_until>assessed_at))
);

CREATE TABLE app.insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('analysis','recommendation')),
  area text NOT NULL CHECK (area IN ('overview','campaign','creative','audience','funnel','strategy','business')),
  campaign_id uuid REFERENCES app.campaigns(id),
  creative_id uuid REFERENCES app.creatives(id),
  parent_insight_id uuid REFERENCES app.insights(id),
  agent_run_id uuid NOT NULL REFERENCES app.agent_runs(id),
  title text NOT NULL,
  observation text NOT NULL,
  interpretation_type text NOT NULL CHECK (interpretation_type IN ('observation','hypothesis','estimate')),
  interpretation text,
  implication text,
  priority smallint NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
  evidence jsonb NOT NULL CHECK (jsonb_typeof(evidence)='array' AND jsonb_array_length(evidence)>0),
  limitations jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(limitations)='array'),
  proposal jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(proposal)='object'),
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL CHECK (window_end>window_start),
  data_as_of timestamptz NOT NULL,
  coverage numeric(7,6) CHECK (coverage BETWEEN 0 AND 1),
  review_status text NOT NULL DEFAULT 'open' CHECK (review_status IN ('open','accepted','dismissed')),
  reviewed_by uuid REFERENCES app.users(id),
  reviewed_at timestamptz,
  review_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (kind<>'recommendation' OR parent_insight_id IS NOT NULL),
  CHECK (review_status='open' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND length(trim(review_reason))>0))
);

CREATE TABLE app.action_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES app.campaigns(id),
  draft_id uuid NOT NULL,
  action_type text NOT NULL CHECK (action_type IN ('create_campaign','update_campaign','pause_campaign','resume_campaign')),
  origin text NOT NULL CHECK (origin IN ('manual','ai')),
  recommendation_id uuid REFERENCES app.insights(id),
  baseline_control_version integer NOT NULL CHECK (baseline_control_version>0),
  payload jsonb NOT NULL,
  payload_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','revoked')),
  requested_by uuid NOT NULL REFERENCES app.users(id),
  expires_at timestamptz NOT NULL,
  decided_by uuid REFERENCES app.users(id),
  decided_at timestamptz,
  approved_hash text,
  decision_reason text,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(campaign_id,draft_id) REFERENCES app.campaign_drafts(campaign_id,id),
  CHECK (expires_at>created_at),
  CHECK ((status='pending' AND decided_by IS NULL AND decided_at IS NULL AND approved_hash IS NULL AND revoked_at IS NULL) OR
    (status='approved' AND decided_by IS NOT NULL AND decided_at IS NOT NULL AND approved_hash IS NOT NULL AND approved_hash=payload_hash AND revoked_at IS NULL) OR
    (status='rejected' AND decided_by IS NOT NULL AND decided_at IS NOT NULL AND approved_hash IS NULL AND revoked_at IS NULL) OR
    (status='revoked' AND revoked_at IS NOT NULL))
);

CREATE TABLE app.jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('sync','ingest','analyze','execute','embed')),
  integration_id uuid REFERENCES app.integrations(id),
  action_request_id uuid UNIQUE REFERENCES app.action_requests(id),
  agent_run_id uuid REFERENCES app.agent_runs(id),
  dedupe_key text NOT NULL UNIQUE,
  input_ref text,
  input_hash text,
  input jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(input)='object'),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','retry','dead','needs_reconciliation','cancelled')),
  attempt integer NOT NULL DEFAULT 0 CHECK (attempt>=0),
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts>0),
  run_after timestamptz NOT NULL DEFAULT now(),
  lease_owner text,
  lease_until timestamptz,
  checkpoint jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(checkpoint)='object'),
  records_read bigint CHECK (records_read>=0),
  records_written bigint CHECK (records_written>=0),
  source_watermark timestamptz,
  error_code text,
  error_summary text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind='execute')=(action_request_id IS NOT NULL)),
  CHECK (kind NOT IN ('sync','ingest') OR integration_id IS NOT NULL),
  CHECK (status<>'running' OR (lease_owner IS NOT NULL AND lease_until IS NOT NULL))
);

CREATE TABLE app.agent_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_run_id uuid NOT NULL REFERENCES app.agent_runs(id),
  job_id uuid REFERENCES app.jobs(id),
  sequence integer NOT NULL CHECK (sequence>0),
  step_key text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('retrieve','sql','llm','vision','tool','validate')),
  is_write boolean NOT NULL DEFAULT false CHECK (NOT is_write OR kind='tool'),
  attempt integer NOT NULL DEFAULT 1 CHECK (attempt>0),
  tool_name text NOT NULL,
  tool_version text NOT NULL,
  input_hash text,
  input_ref text,
  result_refs jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(result_refs)='object'),
  provider_idempotency_key text,
  external_object_id text,
  provider_request_id text,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','succeeded','failed','needs_reconciliation')),
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  finished_at timestamptz,
  error_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(agent_run_id,step_key,attempt),
  UNIQUE(agent_run_id,sequence)
);

CREATE TABLE app.ad_metrics_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES app.campaigns(id),
  ad_set_id uuid,
  ad_id uuid,
  external_entity_id text NOT NULL,
  grain text NOT NULL CHECK (grain IN ('campaign','ad_set','ad')),
  creative_mapping_status text NOT NULL DEFAULT 'not_applicable' CHECK (creative_mapping_status IN ('not_applicable','verified','unknown','ambiguous')),
  report_date date NOT NULL,
  report_timezone text NOT NULL,
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  breakdown_key text NOT NULL DEFAULT 'all',
  attribution_spec_key text NOT NULL,
  impressions bigint CHECK (impressions>=0),
  link_clicks bigint CHECK (link_clicks>=0),
  reach bigint CHECK (reach>=0),
  spend numeric(20,6) CHECK (spend>=0),
  platform_leads bigint CHECK (platform_leads>=0),
  platform_purchases bigint CHECK (platform_purchases>=0),
  source_updated_at timestamptz NOT NULL,
  ingest_job_id uuid NOT NULL REFERENCES app.jobs(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(campaign_id,ad_set_id) REFERENCES app.ad_sets(campaign_id,id),
  FOREIGN KEY(campaign_id,ad_set_id,ad_id) REFERENCES app.ads(campaign_id,ad_set_id,id),
  UNIQUE(campaign_id,grain,external_entity_id,report_date,report_timezone,currency,breakdown_key,attribution_spec_key),
  CHECK ((grain='campaign' AND ad_set_id IS NULL AND ad_id IS NULL AND creative_mapping_status='not_applicable') OR
    (grain='ad_set' AND ad_set_id IS NOT NULL AND ad_id IS NULL AND creative_mapping_status='not_applicable') OR
    (grain='ad' AND ad_set_id IS NOT NULL AND
      ((creative_mapping_status='verified' AND ad_id IS NOT NULL) OR (creative_mapping_status IN ('unknown','ambiguous') AND ad_id IS NULL))))
);

CREATE TABLE app.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES app.users(id),
  database_actor text NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  correlation_id uuid,
  before_hash text,
  after_hash text,
  metadata jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(metadata)='object'),
  created_at timestamptz NOT NULL DEFAULT now()
);


INSERT INTO public.funnellens_mvp_migrations(name,sha256) VALUES('001_tables.sql','0a1c4c6191bd33130c03f4008158fa4367f8f48b427442e5db499f707e465cd6');

-- Migration: 002_integrity.sql

CREATE FUNCTION app.json_hash(value jsonb) RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
RETURN encode(sha256(convert_to(value::text,'UTF8')),'hex');

CREATE FUNCTION app.actor_id() RETURNS uuid LANGUAGE sql STABLE
RETURN nullif(current_setting('app.actor_id',true),'')::uuid;

CREATE FUNCTION app.require_owner() RETURNS uuid LANGUAGE plpgsql STABLE
SET search_path=pg_catalog,app AS $$
DECLARE actor uuid := app.actor_id();
BEGIN
  IF NOT EXISTS(SELECT 1 FROM app.users WHERE id=actor AND is_owner AND disabled_at IS NULL) THEN
    RAISE EXCEPTION 'Authenticated active owner required' USING ERRCODE='42501';
  END IF;
  RETURN actor;
END $$;

CREATE FUNCTION app.reject_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Immutable history: create a new version' USING ERRCODE='23514'; END $$;

CREATE FUNCTION app.touch_row() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at=clock_timestamp();
  IF TG_TABLE_NAME IN ('business_profile','products') THEN NEW.revision=OLD.revision+1; END IF;
  RETURN NEW;
END $$;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['business_profile','products','integrations','campaigns','ad_sets','contacts','leads','jobs','ad_metrics_daily'] LOOP
    EXECUTE format('CREATE TRIGGER touch_row BEFORE UPDATE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.touch_row()',t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['strategy_plans','creatives','campaign_drafts','lead_events','lead_assessments','audit_log'] LOOP
    EXECUTE format('CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.reject_mutation()',t);
  END LOOP;
END $$;

CREATE FUNCTION app.check_timezone() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE z text;
BEGIN
  IF TG_TABLE_NAME='business_profile' THEN z=NEW.timezone; ELSE z=NEW.report_timezone; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=z) THEN
    RAISE EXCEPTION 'Unknown IANA/report timezone: %',z USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER timezone_check BEFORE INSERT OR UPDATE ON app.business_profile FOR EACH ROW EXECUTE FUNCTION app.check_timezone();
CREATE TRIGGER timezone_check BEFORE INSERT OR UPDATE ON app.campaigns FOR EACH ROW EXECUTE FUNCTION app.check_timezone();
CREATE TRIGGER timezone_check BEFORE INSERT OR UPDATE ON app.ad_metrics_daily FOR EACH ROW EXECUTE FUNCTION app.check_timezone();

CREATE FUNCTION app.prepare_plan() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
DECLARE n integer; keys integer; ranks integer; actions integer; allocation numeric; invalid boolean;
BEGIN
  IF NEW.confirmed_by IS DISTINCT FROM app.require_owner() THEN RAISE EXCEPTION 'Plan confirmer mismatch' USING ERRCODE='42501'; END IF;
  SELECT count(*),count(DISTINCT s.key),count(DISTINCT s.rank),count(*) FILTER (WHERE s.is_action),
    coalesce(bool_or(s.key IS NULL OR s.key='' OR s.key='unknown' OR s.label IS NULL OR s.rank IS NULL OR s.rank<0 OR s.is_action IS NULL),false)
    INTO n,keys,ranks,actions,invalid
  FROM jsonb_to_recordset(NEW.funnel) s(key text,label text,rank integer,is_action boolean);
  IF invalid OR n<>keys OR n<>ranks OR actions<>1 OR n>20 THEN
    RAISE EXCEPTION 'Funnel needs unique stage keys/ranks and exactly one Action stage' USING ERRCODE='23514';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.stage_targets) t
    WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.funnel) s WHERE s->>'key'=t->>'stage_key')
      OR NOT(t ? 'allocation_amount') OR (t->>'allocation_amount')::numeric<0) THEN
    RAISE EXCEPTION 'Invalid stage target' USING ERRCODE='23514'; END IF;
  IF (SELECT count(*)<>count(DISTINCT t->>'stage_key') FROM jsonb_array_elements(NEW.stage_targets) t) THEN
    RAISE EXCEPTION 'Duplicate stage target' USING ERRCODE='23514'; END IF;
  SELECT coalesce(sum((t->>'allocation_amount')::numeric),0) INTO allocation FROM jsonb_array_elements(NEW.stage_targets) t;
  IF allocation>NEW.total_budget THEN RAISE EXCEPTION 'Stage allocations exceed plan budget' USING ERRCODE='23514'; END IF;
  NEW.input_hash=app.json_hash(NEW.input_snapshot);
  NEW.confirmed_at=clock_timestamp();
  RETURN NEW;
END $$;
CREATE TRIGGER prepare_plan BEFORE INSERT ON app.strategy_plans FOR EACH ROW EXECUTE FUNCTION app.prepare_plan();

CREATE FUNCTION app.creative_content(c app.creatives) RETURNS jsonb LANGUAGE sql STABLE
RETURN jsonb_build_object('format',c.format,'angle',c.angle,'headline',c.headline,'primary_text',c.primary_text,'media',c.media);

CREATE FUNCTION app.prepare_draft() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
DECLARE cfg jsonb:=NEW.configuration; c app.campaigns; item jsonb; cr app.creatives; cnt integer; scopes text; cadence text; amount numeric;
BEGIN
  SELECT * INTO STRICT c FROM app.campaigns WHERE id=NEW.campaign_id;
  IF cfg->>'contract_version' IS DISTINCT FROM '1'
    OR cfg->>'external_ad_account_id' IS DISTINCT FROM c.external_ad_account_id
    OR cfg->>'objective' IS DISTINCT FROM c.objective OR cfg->>'name' IS DISTINCT FROM c.name
    OR cfg#>>'{budget,currency}' IS DISTINCT FROM NEW.currency
    OR NEW.currency IS DISTINCT FROM c.currency
    OR (cfg#>>'{budget,amount}')::numeric IS DISTINCT FROM NEW.budget_amount
    OR (cfg->>'starts_at')::timestamptz IS DISTINCT FROM NEW.starts_at
    OR (cfg->>'ends_at')::timestamptz IS DISTINCT FROM NEW.ends_at
    OR cfg->>'desired_status' IS NULL OR cfg->>'desired_status' NOT IN ('active','paused')
  THEN RAISE EXCEPTION 'Draft configuration/account/budget/schedule mismatch' USING ERRCODE='23514'; END IF;
  scopes=cfg#>>'{budget,scope}'; cadence=cfg#>>'{budget,cadence}';
  IF scopes IS NULL OR scopes NOT IN ('campaign','ad_set') OR cadence IS NULL OR cadence NOT IN ('daily','lifetime') THEN
    RAISE EXCEPTION 'Explicit budget scope/cadence required' USING ERRCODE='23514'; END IF;
  IF jsonb_typeof(cfg->'routes') IS DISTINCT FROM 'array' OR jsonb_array_length(cfg->'routes') NOT BETWEEN 1 AND 2 THEN
    RAISE EXCEPTION 'One or two WA/LP routes required' USING ERRCODE='23514'; END IF;
  SELECT count(DISTINCT v->>'type') INTO cnt FROM jsonb_array_elements(cfg->'routes') v;
  IF cnt<>jsonb_array_length(cfg->'routes') THEN RAISE EXCEPTION 'Duplicate route' USING ERRCODE='23514'; END IF;
  FOR item IN SELECT * FROM jsonb_array_elements(cfg->'routes') LOOP
    IF item->>'type' IS NULL OR item->>'type' NOT IN ('whatsapp','landing_page') OR coalesce(item->>'tracking_key','')='' THEN
      RAISE EXCEPTION 'Invalid route type/tracking key' USING ERRCODE='23514'; END IF;
    IF item->>'type'='whatsapp' AND coalesce(item->>'destination','')='' THEN
      RAISE EXCEPTION 'WhatsApp destination required' USING ERRCODE='23514'; END IF;
    IF item->>'type'='landing_page' AND (coalesce(item->>'url','') !~ '^https://' OR coalesce((item->>'form_contract_version')::integer,0)<1) THEN
      RAISE EXCEPTION 'HTTPS landing URL and form contract required' USING ERRCODE='23514'; END IF;
  END LOOP;
  IF jsonb_typeof(cfg->'creatives') IS DISTINCT FROM 'array' OR jsonb_array_length(cfg->'creatives')<1 THEN
    RAISE EXCEPTION 'Frozen creative content required' USING ERRCODE='23514'; END IF;
  FOR item IN SELECT * FROM jsonb_array_elements(cfg->'creatives') LOOP
    SELECT * INTO STRICT cr FROM app.creatives WHERE id=(item->>'id')::uuid;
    IF item->'content' IS DISTINCT FROM app.creative_content(cr) OR item->>'content_hash' IS DISTINCT FROM app.json_hash(app.creative_content(cr)) THEN
      RAISE EXCEPTION 'Creative content/hash mismatch' USING ERRCODE='23514'; END IF;
  END LOOP;
  IF jsonb_typeof(cfg->'ad_sets') IS DISTINCT FROM 'array' OR jsonb_array_length(cfg->'ad_sets')<1 THEN
    RAISE EXCEPTION 'At least one planned ad set required' USING ERRCODE='23514'; END IF;
  amount=0;
  FOR item IN SELECT * FROM jsonb_array_elements(cfg->'ad_sets') LOOP
    IF coalesce(item->>'key','')='' OR coalesce(item->>'name','')='' OR jsonb_typeof(item->'targeting') IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Ad set key/name/targeting required' USING ERRCODE='23514'; END IF;
    IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(cfg->'routes') r WHERE r->>'type'=item->>'route_type')
      OR jsonb_typeof(item->'creative_ids') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Ad set must choose a configured route and frozen creative IDs' USING ERRCODE='23514'; END IF;
    IF jsonb_array_length(item->'creative_ids')<1 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(item->'creative_ids') cid
      WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(cfg->'creatives') v WHERE v->>'id'=cid)) THEN
      RAISE EXCEPTION 'Ad set references missing creative' USING ERRCODE='23514'; END IF;
    IF scopes='ad_set' THEN
      IF item#>>'{budget,cadence}' IS DISTINCT FROM cadence OR coalesce((item#>>'{budget,amount}')::numeric,-1)<0 THEN
        RAISE EXCEPTION 'Ad set budget cadence/amount invalid' USING ERRCODE='23514'; END IF;
      amount=amount+(item#>>'{budget,amount}')::numeric;
    ELSIF item ? 'budget' THEN RAISE EXCEPTION 'Campaign budget cannot mix ad set budgets' USING ERRCODE='23514'; END IF;
  END LOOP;
  IF (SELECT count(*)<>count(DISTINCT x->>'key') FROM jsonb_array_elements(cfg->'ad_sets') x) OR (scopes='ad_set' AND amount<>NEW.budget_amount) THEN
    RAISE EXCEPTION 'Duplicate ad set key or budget sum mismatch' USING ERRCODE='23514'; END IF;
  NEW.payload_hash=app.json_hash(cfg);
  RETURN NEW;
END $$;
CREATE TRIGGER prepare_draft BEFORE INSERT ON app.campaign_drafts FOR EACH ROW EXECUTE FUNCTION app.prepare_draft();

CREATE FUNCTION app.guard_campaign() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.integration_id,NEW.external_ad_account_id,NEW.currency,NEW.report_timezone) IS DISTINCT FROM
     (OLD.integration_id,OLD.external_ad_account_id,OLD.currency,OLD.report_timezone) THEN
    RAISE EXCEPTION 'Campaign account/currency/timezone identity is immutable' USING ERRCODE='23514'; END IF;
  IF OLD.external_id IS NOT NULL AND NEW.external_id IS DISTINCT FROM OLD.external_id THEN
    RAISE EXCEPTION 'Assigned external campaign ID is immutable' USING ERRCODE='23514'; END IF;
  IF NEW.control_version<OLD.control_version OR NEW.control_version>OLD.control_version+1 THEN
    RAISE EXCEPTION 'Control version must stay or increment once' USING ERRCODE='23514'; END IF;
  IF (NEW.name,NEW.objective,NEW.desired_status,NEW.applied_draft_id) IS DISTINCT FROM (OLD.name,OLD.objective,OLD.desired_status,OLD.applied_draft_id) THEN
    NEW.control_version=OLD.control_version+1;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_campaign BEFORE UPDATE ON app.campaigns FOR EACH ROW EXECUTE FUNCTION app.guard_campaign();

CREATE FUNCTION app.guard_ad_mapping() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
BEGIN
  PERFORM 1 FROM app.campaigns WHERE id=NEW.campaign_id FOR UPDATE;
  IF TG_OP='UPDATE' AND ((NEW.campaign_id,NEW.ad_set_id,NEW.creative_id,NEW.external_id,NEW.valid_from) IS DISTINCT FROM
     (OLD.campaign_id,OLD.ad_set_id,OLD.creative_id,OLD.external_id,OLD.valid_from)
     OR (NEW.valid_to IS DISTINCT FROM OLD.valid_to AND OLD.valid_to IS NOT NULL)) THEN
    RAISE EXCEPTION 'Do not rewrite historical ad mapping; close interval and create a new row' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM app.ads a WHERE a.campaign_id=NEW.campaign_id AND a.external_id=NEW.external_id AND a.id<>NEW.id
    AND tstzrange(a.valid_from,a.valid_to,'[)') && tstzrange(NEW.valid_from,NEW.valid_to,'[)')) THEN
    RAISE EXCEPTION 'Overlapping ad mapping intervals' USING ERRCODE='23514'; END IF;
  IF NEW.valid_to IS NOT NULL AND EXISTS(SELECT 1 FROM app.ad_metrics_daily f WHERE f.ad_id=NEW.id
    AND ((f.report_date+1)::timestamp AT TIME ZONE f.report_timezone)>NEW.valid_to) THEN
    RAISE EXCEPTION 'Mark affected daily facts ambiguous before closing mapping mid-day' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_ad_mapping BEFORE INSERT OR UPDATE ON app.ads FOR EACH ROW EXECUTE FUNCTION app.guard_ad_mapping();
CREATE TRIGGER keep_ad_history BEFORE DELETE ON app.ads FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();

CREATE FUNCTION app.validate_metric() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
DECLARE c app.campaigns; a app.ads; expected text; j app.jobs;
BEGIN
  SELECT * INTO STRICT c FROM app.campaigns WHERE id=NEW.campaign_id;
  IF NEW.report_timezone<>c.report_timezone OR NEW.currency<>c.currency THEN RAISE EXCEPTION 'Metric reporting context mismatch' USING ERRCODE='23514'; END IF;
  SELECT * INTO STRICT j FROM app.jobs WHERE id=NEW.ingest_job_id;
  IF j.kind<>'sync' OR j.integration_id IS DISTINCT FROM c.integration_id THEN RAISE EXCEPTION 'Metric requires matching integration sync job' USING ERRCODE='23514'; END IF;
  IF NEW.grain='campaign' THEN expected=c.external_id;
  ELSIF NEW.grain='ad_set' THEN SELECT external_id INTO expected FROM app.ad_sets WHERE id=NEW.ad_set_id;
  ELSIF NEW.ad_id IS NOT NULL THEN
    SELECT * INTO STRICT a FROM app.ads WHERE id=NEW.ad_id FOR SHARE;
    expected=a.external_id;
    IF a.valid_from>(NEW.report_date::timestamp AT TIME ZONE NEW.report_timezone)
      OR (a.valid_to IS NOT NULL AND a.valid_to<((NEW.report_date+1)::timestamp AT TIME ZONE NEW.report_timezone)) THEN
      RAISE EXCEPTION 'Creative mapping does not cover full reporting day' USING ERRCODE='23514'; END IF;
  END IF;
  IF (NEW.grain<>'ad' OR NEW.ad_id IS NOT NULL) AND expected IS DISTINCT FROM NEW.external_entity_id THEN
    RAISE EXCEPTION 'External metric entity mismatch' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' THEN
    IF (NEW.campaign_id,NEW.ad_set_id,NEW.external_entity_id,NEW.grain,NEW.report_date,NEW.report_timezone,NEW.currency,NEW.breakdown_key,NEW.attribution_spec_key)
      IS DISTINCT FROM (OLD.campaign_id,OLD.ad_set_id,OLD.external_entity_id,OLD.grain,OLD.report_date,OLD.report_timezone,OLD.currency,OLD.breakdown_key,OLD.attribution_spec_key)
      OR NEW.source_updated_at<OLD.source_updated_at THEN RAISE EXCEPTION 'Metric identity is stable; stale overwrite rejected' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER validate_metric BEFORE INSERT OR UPDATE ON app.ad_metrics_daily FOR EACH ROW EXECUTE FUNCTION app.validate_metric();

CREATE FUNCTION app.validate_event() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
DECLARE l app.leads;
BEGIN
  IF NEW.lead_id IS NOT NULL THEN
    SELECT * INTO STRICT l FROM app.leads WHERE id=NEW.lead_id;
    IF NEW.contact_id IS DISTINCT FROM l.contact_id OR (NEW.campaign_id IS NOT NULL AND NEW.campaign_id IS DISTINCT FROM l.campaign_id) THEN
      RAISE EXCEPTION 'Event contact/campaign must match lead' USING ERRCODE='23514'; END IF;
  END IF;
  IF NEW.event_kind='manual_note' AND NEW.actor_id IS DISTINCT FROM app.require_owner() THEN
    RAISE EXCEPTION 'Manual note actor mismatch' USING ERRCODE='42501'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER validate_event BEFORE INSERT ON app.lead_events FOR EACH ROW EXECUTE FUNCTION app.validate_event();

CREATE FUNCTION app.validate_conversion() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
DECLARE e app.lead_events; p app.conversions;
BEGIN
  SELECT * INTO STRICT e FROM app.lead_events WHERE id=NEW.source_event_id;
  IF NEW.lead_id IS DISTINCT FROM e.lead_id OR NEW.campaign_id IS DISTINCT FROM e.campaign_id
    OR (NEW.campaign_id IS NOT NULL AND e.linkage_status<>'verified') THEN RAISE EXCEPTION 'Conversion linkage must follow verified source event' USING ERRCODE='23514'; END IF;
  IF NEW.status='confirmed' THEN
    IF e.event_kind<>'purchase_signal' THEN RAISE EXCEPTION 'Closing needs a purchase signal' USING ERRCODE='23514'; END IF;
    IF NEW.confirmation_method='manual' AND NEW.confirmed_by IS DISTINCT FROM app.require_owner() THEN
      RAISE EXCEPTION 'Closing confirmer mismatch' USING ERRCODE='42501'; END IF;
  END IF;
  IF NEW.parent_conversion_id IS NOT NULL THEN
    SELECT * INTO STRICT p FROM app.conversions WHERE id=NEW.parent_conversion_id;
    IF p.kind<>'purchase' OR p.status<>'confirmed' OR p.currency<>NEW.currency OR p.lead_id IS DISTINCT FROM NEW.lead_id OR p.campaign_id IS DISTINCT FROM NEW.campaign_id THEN
      RAISE EXCEPTION 'Refund parent mismatch' USING ERRCODE='23514'; END IF;
  END IF;
  IF TG_OP='UPDATE' AND (OLD.status='confirmed' OR NEW.source_event_id<>OLD.source_event_id) THEN
    RAISE EXCEPTION 'Confirmed conversion is immutable; record refund/correction separately' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER validate_conversion BEFORE INSERT OR UPDATE ON app.conversions FOR EACH ROW EXECUTE FUNCTION app.validate_conversion();

CREATE FUNCTION app.validate_assessment() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
DECLARE e app.lead_events; p app.strategy_plans; olda app.lead_assessments; is_action boolean;
BEGIN
  SELECT * INTO STRICT e FROM app.lead_events WHERE id=NEW.evidence_event_id;
  SELECT * INTO STRICT p FROM app.strategy_plans WHERE id=NEW.strategy_id;
  IF e.lead_id IS DISTINCT FROM NEW.lead_id OR e.occurred_at>NEW.assessed_at OR NEW.assessed_at>clock_timestamp()
    OR NEW.rule_version<>p.rule_version THEN RAISE EXCEPTION 'Assessment evidence/time/rule mismatch' USING ERRCODE='23514'; END IF;
  IF NEW.method='manual' AND NEW.reviewer_id IS DISTINCT FROM app.require_owner() THEN
    RAISE EXCEPTION 'Manual assessment reviewer mismatch' USING ERRCODE='42501'; END IF;
  IF NEW.supersedes_id IS NOT NULL THEN
    SELECT * INTO STRICT olda FROM app.lead_assessments WHERE id=NEW.supersedes_id;
    IF (olda.lead_id,olda.dimension,olda.strategy_id) IS DISTINCT FROM (NEW.lead_id,NEW.dimension,NEW.strategy_id)
      OR olda.assessed_at>NEW.assessed_at THEN RAISE EXCEPTION 'Invalid supersession' USING ERRCODE='23514'; END IF;
  END IF;
  IF NEW.dimension='funnel_stage' AND NEW.stage_key<>'unknown' THEN
    SELECT (s->>'is_action')::boolean INTO is_action FROM jsonb_array_elements(p.funnel) s WHERE s->>'key'=NEW.stage_key;
    IF is_action IS NULL THEN RAISE EXCEPTION 'Stage not in strategy funnel' USING ERRCODE='23514'; END IF;
    IF is_action AND NOT EXISTS(SELECT 1 FROM app.conversions c WHERE c.id=NEW.conversion_id AND c.status='confirmed'
      AND c.kind='purchase' AND c.lead_id=NEW.lead_id AND c.source_event_id=NEW.evidence_event_id AND c.confirmed_at<=NEW.assessed_at) THEN
      RAISE EXCEPTION 'Action requires confirmed purchase evidence' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER validate_assessment BEFORE INSERT ON app.lead_assessments FOR EACH ROW EXECUTE FUNCTION app.validate_assessment();

CREATE INDEX metrics_campaign_day ON app.ad_metrics_daily(campaign_id,report_date,grain);
CREATE INDEX metrics_mapping_day ON app.ad_metrics_daily(ad_id,report_date) WHERE ad_id IS NOT NULL;
CREATE INDEX ads_creative ON app.ads(creative_id,campaign_id);
CREATE INDEX events_lead_time ON app.lead_events(lead_id,occurred_at DESC);
CREATE INDEX events_thread ON app.lead_events(integration_id,thread_ref,occurred_at) WHERE thread_ref IS NOT NULL;
CREATE INDEX assessments_as_of ON app.lead_assessments(lead_id,strategy_id,dimension,assessed_at DESC);
CREATE INDEX leads_cohort ON app.leads(campaign_id,first_received_at,primary_source);
CREATE INDEX jobs_runnable ON app.jobs(run_after,created_at) WHERE status IN ('queued','retry');
CREATE INDEX audit_entity_time ON app.audit_log(entity_type,entity_id,created_at DESC);
CREATE INDEX insights_area_time ON app.insights(area,campaign_id,created_at DESC);


INSERT INTO public.funnellens_mvp_migrations(name,sha256) VALUES('002_integrity.sql','7984e09640b0e137c30af132c3e041a24543d1321bbddd708da143cae005af8f');

-- Migration: 003_workflows.sql

CREATE FUNCTION app.assert_action(request_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,app AS $$
DECLARE r app.action_requests; c app.campaigns; i app.integrations; route jsonb;
BEGIN
  SELECT * INTO STRICT r FROM app.action_requests WHERE id=request_id FOR UPDATE;
  SELECT * INTO STRICT c FROM app.campaigns WHERE id=r.campaign_id FOR UPDATE;
  SELECT * INTO STRICT i FROM app.integrations WHERE id=c.integration_id;
  IF (r.action_type='create_campaign' AND c.external_id IS NOT NULL AND NOT EXISTS(
      SELECT 1 FROM app.jobs j WHERE j.action_request_id=r.id AND j.status IN ('running','needs_reconciliation')
        AND j.checkpoint#>>'{external_ids,campaign}'=c.external_id)) OR (r.action_type<>'create_campaign' AND c.external_id IS NULL) THEN
    RAISE EXCEPTION 'Create needs a new campaign; update/pause/resume needs an existing campaign' USING ERRCODE='23514'; END IF;
  IF r.status<>'approved' OR r.approved_hash IS DISTINCT FROM r.payload_hash OR r.expires_at<=clock_timestamp()
    OR r.revoked_at IS NOT NULL OR c.current_draft_id IS DISTINCT FROM r.draft_id OR c.control_version<>r.baseline_control_version
    OR r.payload->>'objective' IS DISTINCT FROM c.objective OR r.payload->>'name' IS DISTINCT FROM c.name
    OR NOT EXISTS(SELECT 1 FROM app.users WHERE id=r.decided_by AND is_owner AND disabled_at IS NULL) THEN
    RAISE EXCEPTION 'Missing, expired, revoked, disabled-owner or stale exact approval' USING ERRCODE='23514'; END IF;
  IF i.status<>'connected' OR i.verified_at IS NULL OR (i.token_expires_at IS NOT NULL AND i.token_expires_at<=clock_timestamp())
    OR i.capabilities->'campaign_write' IS DISTINCT FROM 'true'::jsonb
    OR NOT(i.verified_assets @> jsonb_build_array(jsonb_build_object('type','ad_account','id',c.external_ad_account_id))) THEN
    RAISE EXCEPTION 'Connected writable and verified ad account required' USING ERRCODE='23514'; END IF;
  FOR route IN SELECT * FROM jsonb_array_elements(r.payload->'routes') LOOP
    IF route->>'type'='whatsapp' AND NOT(i.verified_assets @> jsonb_build_array(jsonb_build_object('type','whatsapp_phone','id',route->>'destination'))) THEN
      RAISE EXCEPTION 'WhatsApp asset not verified on connection' USING ERRCODE='23514'; END IF;
  END LOOP;
END $$;

CREATE FUNCTION app.guard_request() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
DECLARE d app.campaign_drafts; c app.campaigns; actor uuid;
BEGIN
  actor=app.require_owner();
  IF TG_OP='INSERT' THEN
    SELECT * INTO STRICT d FROM app.campaign_drafts WHERE id=NEW.draft_id;
    SELECT * INTO STRICT c FROM app.campaigns WHERE id=NEW.campaign_id FOR UPDATE;
    IF NEW.status<>'pending' OR NEW.requested_by IS DISTINCT FROM actor OR NEW.payload IS DISTINCT FROM d.configuration
      OR NEW.campaign_id<>d.campaign_id OR NEW.baseline_control_version<>c.control_version OR c.current_draft_id IS DISTINCT FROM d.id
      OR d.configuration->>'objective' IS DISTINCT FROM c.objective OR d.configuration->>'name' IS DISTINCT FROM c.name
      OR NEW.expires_at<=clock_timestamp() THEN
      RAISE EXCEPTION 'Request must reference exact current draft and authenticated owner' USING ERRCODE='23514'; END IF;
    IF (NEW.action_type='create_campaign' AND c.external_id IS NOT NULL) OR (NEW.action_type<>'create_campaign' AND c.external_id IS NULL)
      OR (NEW.action_type='pause_campaign' AND NEW.payload->>'desired_status' IS DISTINCT FROM 'paused')
      OR (NEW.action_type='resume_campaign' AND NEW.payload->>'desired_status' IS DISTINCT FROM 'active') THEN
      RAISE EXCEPTION 'Action type conflicts with platform identity or reviewed desired status' USING ERRCODE='23514'; END IF;
    NEW.payload_hash=app.json_hash(NEW.payload);
  ELSE
    IF (to_jsonb(NEW)-ARRAY['status','decided_by','decided_at','approved_hash','decision_reason','revoked_at']) IS DISTINCT FROM
       (to_jsonb(OLD)-ARRAY['status','decided_by','decided_at','approved_hash','decision_reason','revoked_at']) THEN
      RAISE EXCEPTION 'Request payload and identity are immutable' USING ERRCODE='23514'; END IF;
    IF OLD.status='pending' AND NEW.status IN ('approved','rejected') THEN
      IF NEW.decided_by IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Decision actor mismatch' USING ERRCODE='42501'; END IF;
      NEW.decided_at=clock_timestamp();
      NEW.approved_hash=CASE WHEN NEW.status='approved' THEN OLD.payload_hash ELSE NULL END;
      IF NEW.status='approved' THEN
        SELECT * INTO STRICT c FROM app.campaigns WHERE id=NEW.campaign_id FOR UPDATE;
        IF NEW.expires_at<=clock_timestamp() OR c.current_draft_id IS DISTINCT FROM NEW.draft_id OR c.control_version<>NEW.baseline_control_version THEN
          RAISE EXCEPTION 'Stale draft/baseline or expired request' USING ERRCODE='23514'; END IF;
      END IF;
    ELSIF OLD.status IN ('pending','approved') AND NEW.status='revoked' THEN
      IF (NEW.decided_by,NEW.decided_at,NEW.approved_hash) IS DISTINCT FROM (OLD.decided_by,OLD.decided_at,OLD.approved_hash) THEN
        RAISE EXCEPTION 'Revocation cannot rewrite original decision' USING ERRCODE='23514'; END IF;
      NEW.revoked_at=clock_timestamp();
    ELSE RAISE EXCEPTION 'Decision is terminal; create a new request' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_request BEFORE INSERT OR UPDATE ON app.action_requests FOR EACH ROW EXECUTE FUNCTION app.guard_request();
CREATE TRIGGER request_no_delete BEFORE DELETE ON app.action_requests FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();

CREATE FUNCTION app.create_action(p_draft uuid,p_action text,p_origin text DEFAULT 'manual',p_expiry interval DEFAULT interval '24 hours')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE d app.campaign_drafts; c app.campaigns; result uuid; actor uuid:=app.require_owner();
BEGIN
  IF p_expiry<=interval '0' THEN RAISE EXCEPTION 'Positive approval expiry required' USING ERRCODE='23514'; END IF;
  SELECT * INTO STRICT d FROM app.campaign_drafts WHERE id=p_draft;
  SELECT * INTO STRICT c FROM app.campaigns WHERE id=d.campaign_id FOR UPDATE;
  INSERT INTO app.action_requests(campaign_id,draft_id,action_type,origin,baseline_control_version,payload,payload_hash,requested_by,expires_at)
    VALUES(c.id,d.id,p_action,p_origin,c.control_version,d.configuration,d.payload_hash,actor,clock_timestamp()+p_expiry) RETURNING id INTO result;
  RETURN result;
END $$;

CREATE FUNCTION app.decide_action(p_request uuid,p_decision text,p_reason text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE actor uuid:=app.require_owner();
BEGIN
  IF p_decision NOT IN ('approved','rejected') THEN RAISE EXCEPTION 'Use approved/rejected' USING ERRCODE='23514'; END IF;
  UPDATE app.action_requests SET status=p_decision,decided_by=actor,decision_reason=p_reason WHERE id=p_request;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found' USING ERRCODE='P0002'; END IF;
END $$;

CREATE FUNCTION app.revoke_action(p_request uuid,p_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,app AS $$
BEGIN
  PERFORM app.require_owner();
  IF coalesce(trim(p_reason),'')='' THEN RAISE EXCEPTION 'Revocation reason required' USING ERRCODE='23514'; END IF;
  UPDATE app.action_requests SET status='revoked',decision_reason=p_reason WHERE id=p_request;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found' USING ERRCODE='P0002'; END IF;
END $$;

CREATE FUNCTION app.guard_job() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
BEGIN
  IF TG_OP='INSERT' AND (NEW.status<>'queued' OR NEW.attempt<>0 OR NEW.lease_owner IS NOT NULL OR NEW.lease_until IS NOT NULL) THEN
    RAISE EXCEPTION 'Jobs start queued without lease' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' THEN
    IF (NEW.kind,NEW.integration_id,NEW.action_request_id,NEW.dedupe_key,NEW.input_ref,NEW.input_hash,NEW.input) IS DISTINCT FROM
       (OLD.kind,OLD.integration_id,OLD.action_request_id,OLD.dedupe_key,OLD.input_ref,OLD.input_hash,OLD.input)
       OR (OLD.agent_run_id IS NOT NULL AND NEW.agent_run_id IS DISTINCT FROM OLD.agent_run_id) THEN
      RAISE EXCEPTION 'Job identity/input immutable on retry' USING ERRCODE='23514'; END IF;
    IF OLD.status IN ('succeeded','dead','cancelled') AND (to_jsonb(NEW)-'updated_at') IS DISTINCT FROM (to_jsonb(OLD)-'updated_at') THEN
      RAISE EXCEPTION 'Terminal job cannot be rewritten' USING ERRCODE='23514'; END IF;
    IF NEW.status<>OLD.status AND NOT (
      (OLD.status IN ('queued','retry') AND NEW.status IN ('running','cancelled')) OR
      (OLD.status='running' AND NEW.status IN ('succeeded','retry','dead','needs_reconciliation','cancelled')) OR
      (OLD.status='needs_reconciliation' AND NEW.status IN ('queued','succeeded','cancelled','dead'))
    ) THEN RAISE EXCEPTION 'Invalid job state transition' USING ERRCODE='23514'; END IF;
    IF OLD.status='running' AND NEW.status='retry' AND NEW.kind='execute' THEN
      RAISE EXCEPTION 'Ambiguous execution requires reconciliation before retry' USING ERRCODE='23514'; END IF;
    IF NEW.status='running' AND OLD.status<>'running' AND (NEW.attempt<>OLD.attempt+1 OR NEW.attempt>NEW.max_attempts OR NEW.lease_until<=clock_timestamp()) THEN
      RAISE EXCEPTION 'Invalid job attempt/lease' USING ERRCODE='23514'; END IF;
    IF NEW.status<>'running' AND (NEW.lease_owner IS NOT NULL OR NEW.lease_until IS NOT NULL) THEN
      RAISE EXCEPTION 'Non-running jobs must release lease' USING ERRCODE='23514'; END IF;
  END IF;
  IF NEW.kind='execute' AND (TG_OP='INSERT' OR (NEW.status IN ('queued','running') AND NEW.status IS DISTINCT FROM OLD.status)) THEN
    PERFORM app.assert_action(NEW.action_request_id);
  END IF;
  IF NEW.kind='execute' AND NEW.dedupe_key IS DISTINCT FROM 'action:'||NEW.action_request_id::text THEN
    RAISE EXCEPTION 'Stable action dedupe key required' USING ERRCODE='23514'; END IF;
  IF NEW.kind='execute' AND NEW.agent_run_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM app.agent_runs a JOIN app.action_requests r ON r.id=NEW.action_request_id
    WHERE a.id=NEW.agent_run_id AND a.purpose='execution' AND a.campaign_id=r.campaign_id) THEN
    RAISE EXCEPTION 'Execution run must match request campaign' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_job BEFORE INSERT OR UPDATE ON app.jobs FOR EACH ROW EXECUTE FUNCTION app.guard_job();
CREATE TRIGGER keep_job_history BEFORE DELETE ON app.jobs FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();

CREATE FUNCTION app.enqueue_action(p_request uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,app AS $$
DECLARE result uuid;
BEGIN
  PERFORM app.require_owner();
  SELECT id INTO result FROM app.jobs WHERE action_request_id=p_request;
  IF result IS NOT NULL THEN RETURN result; END IF;
  PERFORM app.assert_action(p_request);
  INSERT INTO app.jobs(kind,action_request_id,dedupe_key) VALUES('execute',p_request,'action:'||p_request::text)
    ON CONFLICT(action_request_id) DO NOTHING RETURNING id INTO result;
  IF result IS NULL THEN SELECT id INTO result FROM app.jobs WHERE action_request_id=p_request; END IF;
  RETURN result;
END $$;

CREATE FUNCTION app.enqueue_read_job(p_kind text,p_key text,p_integration uuid DEFAULT NULL,p_input jsonb DEFAULT '{}')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE result uuid;
BEGIN
  PERFORM app.require_owner();
  IF p_kind NOT IN ('sync','analyze','embed') THEN RAISE EXCEPTION 'Unsupported owner job kind' USING ERRCODE='23514'; END IF;
  INSERT INTO app.jobs(kind,integration_id,dedupe_key,input) VALUES(p_kind,p_integration,p_key,p_input)
    ON CONFLICT(dedupe_key) DO NOTHING RETURNING id INTO result;
  IF result IS NULL THEN
    SELECT id INTO result FROM app.jobs WHERE dedupe_key=p_key AND kind=p_kind AND integration_id IS NOT DISTINCT FROM p_integration AND input=p_input;
    IF result IS NULL THEN RAISE EXCEPTION 'Dedupe key already bound to different input' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN result;
END $$;

CREATE FUNCTION app.claim_job(p_worker text,p_kinds text[] DEFAULT ARRAY['execute','ingest','sync','analyze','embed'],p_lease interval DEFAULT interval '2 minutes')
RETURNS SETOF app.jobs LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
DECLARE chosen uuid;
BEGIN
  IF coalesce(trim(p_worker),'')='' OR p_lease<=interval '0' OR p_lease>interval '30 minutes' THEN
    RAISE EXCEPTION 'Worker and bounded positive lease required' USING ERRCODE='23514'; END IF;
  SELECT j.id INTO chosen FROM app.jobs j WHERE j.status IN ('queued','retry') AND j.run_after<=clock_timestamp()
    AND j.attempt<j.max_attempts AND j.kind=ANY(p_kinds)
    ORDER BY array_position(p_kinds,j.kind),j.run_after,j.created_at,j.id FOR UPDATE SKIP LOCKED LIMIT 1;
  IF chosen IS NOT NULL THEN
    RETURN QUERY UPDATE app.jobs SET status='running',attempt=attempt+1,lease_owner=p_worker,
      lease_until=clock_timestamp()+p_lease,started_at=coalesce(started_at,clock_timestamp()) WHERE id=chosen RETURNING *;
  END IF;
END $$;

CREATE FUNCTION app.reap_expired_jobs() RETURNS integer LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
DECLARE n integer;
BEGIN
  UPDATE app.jobs SET status=CASE WHEN kind='execute' THEN 'needs_reconciliation' WHEN attempt>=max_attempts THEN 'dead' ELSE 'retry' END,
    lease_owner=NULL,lease_until=NULL,error_code='lease_expired',run_after=clock_timestamp()
    WHERE status='running' AND lease_until<clock_timestamp();
  GET DIAGNOSTICS n=ROW_COUNT;
  RETURN n;
END $$;

CREATE FUNCTION app.guard_step() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
DECLARE j app.jobs;
BEGIN
  IF TG_OP='INSERT' AND NEW.status<>'running' THEN RAISE EXCEPTION 'Step starts running' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' THEN
    IF (NEW.agent_run_id,NEW.job_id,NEW.sequence,NEW.step_key,NEW.kind,NEW.is_write,NEW.attempt,NEW.tool_name,NEW.tool_version,NEW.input_hash,NEW.input_ref,NEW.provider_idempotency_key)
      IS DISTINCT FROM (OLD.agent_run_id,OLD.job_id,OLD.sequence,OLD.step_key,OLD.kind,OLD.is_write,OLD.attempt,OLD.tool_name,OLD.tool_version,OLD.input_hash,OLD.input_ref,OLD.provider_idempotency_key)
      OR (OLD.external_object_id IS NOT NULL AND NEW.external_object_id IS DISTINCT FROM OLD.external_object_id) THEN
      RAISE EXCEPTION 'Step identity/checkpoint cannot be replaced' USING ERRCODE='23514'; END IF;
    IF OLD.status IN ('succeeded','failed') THEN RAISE EXCEPTION 'Terminal step is immutable; use next attempt' USING ERRCODE='23514'; END IF;
  END IF;
  IF NEW.is_write AND NEW.status='running' THEN
    SELECT * INTO STRICT j FROM app.jobs WHERE id=NEW.job_id;
    IF j.kind<>'execute' OR j.status<>'running' OR j.lease_until<=clock_timestamp() OR j.agent_run_id IS DISTINCT FROM NEW.agent_run_id THEN
      RAISE EXCEPTION 'Write step needs matching live execution job/lease/run' USING ERRCODE='23514'; END IF;
    PERFORM app.assert_action(j.action_request_id);
    IF TG_OP='INSERT' THEN NEW.provider_idempotency_key='action:'||j.action_request_id::text||':'||NEW.step_key; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_step BEFORE INSERT OR UPDATE ON app.agent_steps FOR EACH ROW EXECUTE FUNCTION app.guard_step();
CREATE TRIGGER keep_step_history BEFORE DELETE ON app.agent_steps FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();

CREATE FUNCTION app.guard_run() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' AND NEW.status<>'queued' THEN RAISE EXCEPTION 'Run starts queued' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' THEN
    IF (NEW.purpose,NEW.mode,NEW.campaign_id,NEW.lead_id,NEW.creative_id,NEW.workflow_version,NEW.prompt_version,NEW.output_schema_version,NEW.calculator_version,NEW.rule_version,NEW.provider,NEW.model,NEW.input_refs,NEW.input_hash,NEW.window_start,NEW.window_end,NEW.data_as_of,NEW.idempotency_key)
      IS DISTINCT FROM (OLD.purpose,OLD.mode,OLD.campaign_id,OLD.lead_id,OLD.creative_id,OLD.workflow_version,OLD.prompt_version,OLD.output_schema_version,OLD.calculator_version,OLD.rule_version,OLD.provider,OLD.model,OLD.input_refs,OLD.input_hash,OLD.window_start,OLD.window_end,OLD.data_as_of,OLD.idempotency_key) THEN
      RAISE EXCEPTION 'Run input/version identity immutable' USING ERRCODE='23514'; END IF;
    IF OLD.status IN ('succeeded','cancelled') THEN RAISE EXCEPTION 'Terminal run immutable' USING ERRCODE='23514'; END IF;
    IF NEW.status<>OLD.status AND NOT ((OLD.status IN ('queued','failed') AND NEW.status IN ('running','cancelled')) OR
      (OLD.status='running' AND NEW.status IN ('succeeded','failed','cancelled'))) THEN
      RAISE EXCEPTION 'Invalid run transition' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_run BEFORE INSERT OR UPDATE ON app.agent_runs FOR EACH ROW EXECUTE FUNCTION app.guard_run();

CREATE FUNCTION app.guard_insight() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.review_status<>'open' OR NOT EXISTS(SELECT 1 FROM app.agent_runs WHERE id=NEW.agent_run_id AND status='succeeded') THEN
      RAISE EXCEPTION 'Publish insight from completed run with open review status' USING ERRCODE='23514'; END IF;
    IF NEW.parent_insight_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app.insights WHERE id=NEW.parent_insight_id AND kind='analysis') THEN
      RAISE EXCEPTION 'Recommendation parent must be analysis' USING ERRCODE='23514'; END IF;
  ELSE
    IF (to_jsonb(NEW)-ARRAY['review_status','reviewed_by','reviewed_at','review_reason']) IS DISTINCT FROM
       (to_jsonb(OLD)-ARRAY['review_status','reviewed_by','reviewed_at','review_reason']) THEN
      RAISE EXCEPTION 'Published insight content immutable' USING ERRCODE='23514'; END IF;
    IF NEW.reviewed_by IS DISTINCT FROM app.require_owner() THEN RAISE EXCEPTION 'Insight reviewer mismatch' USING ERRCODE='42501'; END IF;
    NEW.reviewed_at=clock_timestamp();
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_insight BEFORE INSERT OR UPDATE ON app.insights FOR EACH ROW EXECUTE FUNCTION app.guard_insight();

CREATE FUNCTION app.confirm_purchase(p_event uuid,p_amount numeric,p_currency text,p_order_id text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE e app.lead_events; result uuid; actor uuid:=app.require_owner();
BEGIN
  SELECT * INTO STRICT e FROM app.lead_events WHERE id=p_event;
  INSERT INTO app.conversions(source_event_id,lead_id,campaign_id,source_system,external_order_id,kind,status,amount,currency,occurred_at,confirmed_at,confirmation_method,confirmed_by)
    VALUES(e.id,e.lead_id,e.campaign_id,'manual',p_order_id,'purchase','confirmed',p_amount,p_currency,e.occurred_at,clock_timestamp(),'manual',actor)
    RETURNING id INTO result;
  RETURN result;
END $$;

CREATE FUNCTION app.audit_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE old_hash text; new_hash text;
BEGIN
  IF TG_OP<>'INSERT' THEN old_hash=app.json_hash(to_jsonb(OLD)); END IF;
  IF TG_OP<>'DELETE' THEN new_hash=app.json_hash(to_jsonb(NEW)); END IF;
  INSERT INTO app.audit_log(actor_id,database_actor,action,entity_type,entity_id,before_hash,after_hash,metadata)
    VALUES(app.actor_id(),coalesce(nullif(current_setting('role',true),'none'),session_user),lower(TG_OP),TG_TABLE_NAME,
      CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END,old_hash,new_hash,
      jsonb_build_object('status',CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD)->>'status' ELSE to_jsonb(NEW)->>'status' END));
  RETURN NULL;
END $$;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['campaigns','campaign_drafts','strategy_plans','action_requests','jobs','agent_steps','lead_assessments','conversions','insights'] LOOP
    EXECUTE format('CREATE TRIGGER audit_change AFTER INSERT OR UPDATE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.audit_change()',t);
  END LOOP;
END $$;


INSERT INTO public.funnellens_mvp_migrations(name,sha256) VALUES('003_workflows.sql','1c89a4c253d331a9da427aad49be34ca6daf15e72ec0405a785597b87ea5c288');

-- Migration: 004_read_models.sql

CREATE FUNCTION app.lead_state_as_of(p_strategy uuid,p_as_of timestamptz DEFAULT now())
RETURNS TABLE(lead_id uuid,contact_id uuid,campaign_id uuid,primary_source text,first_received_at timestamptz,audience_level text,stage_key text)
LANGUAGE sql STABLE SET search_path=pg_catalog,app AS $$
  WITH candidates AS MATERIALIZED (
    SELECT a.*,coalesce((s.value->>'rank')::integer,-1) AS stage_rank
    FROM app.lead_assessments a
    JOIN app.strategy_plans p ON p.id=a.strategy_id
    LEFT JOIN LATERAL jsonb_array_elements(p.funnel) s(value) ON s.value->>'key'=a.stage_key
    WHERE a.strategy_id=p_strategy AND a.assessed_at<=p_as_of
      AND (a.method<>'manual' OR a.override_until IS NULL OR a.override_until>p_as_of)
      AND NOT EXISTS(SELECT 1 FROM app.lead_assessments newer WHERE newer.supersedes_id=a.id AND newer.assessed_at<=p_as_of)
  )
  SELECT l.id,l.contact_id,l.campaign_id,l.primary_source,l.first_received_at,
    coalesce(level.audience_level,'unknown'),coalesce(stage.stage_key,'unknown')
  FROM app.leads l
  LEFT JOIN LATERAL (
    SELECT a.audience_level FROM candidates a WHERE a.lead_id=l.id AND a.dimension='audience_level'
    ORDER BY (a.method='manual') DESC,a.assessed_at DESC,a.created_at DESC,a.id DESC LIMIT 1
  ) level ON true
  LEFT JOIN LATERAL (
    SELECT a.stage_key FROM candidates a WHERE a.lead_id=l.id AND a.dimension='funnel_stage'
    ORDER BY (a.method='manual') DESC,CASE WHEN a.method='manual' THEN a.assessed_at END DESC,
      a.stage_rank DESC,a.assessed_at DESC,a.created_at DESC,a.id DESC LIMIT 1
  ) stage ON true
  WHERE l.first_received_at<=p_as_of;
$$;

CREATE FUNCTION app.funnel_distribution(p_strategy uuid,p_campaign uuid DEFAULT NULL,p_as_of timestamptz DEFAULT now(),p_cohort_from timestamptz DEFAULT NULL)
RETURNS TABLE(dimension text,bucket text,population_unit text,audience_count bigint,denominator bigint,proportion numeric)
LANGUAGE sql STABLE SET search_path=pg_catalog,app AS $$
  WITH population AS MATERIALIZED (
    SELECT * FROM app.lead_state_as_of(p_strategy,p_as_of) s
    WHERE (p_campaign IS NULL OR s.campaign_id=p_campaign) AND (p_cohort_from IS NULL OR s.first_received_at>=p_cohort_from)
  ), buckets AS (
    SELECT 'funnel_stage'::text AS dimension,s->>'key' AS bucket FROM app.strategy_plans p,jsonb_array_elements(p.funnel) s WHERE p.id=p_strategy
    UNION ALL SELECT 'funnel_stage','unknown'
    UNION ALL SELECT 'audience_level',v FROM unnest(ARRAY['cold','warm','hot','unknown']) v
  ), counts AS (
    SELECT 'funnel_stage'::text AS dimension,stage_key AS bucket,count(*) AS n FROM population GROUP BY stage_key
    UNION ALL SELECT 'audience_level',audience_level,count(*) FROM population GROUP BY audience_level
  )
  SELECT b.dimension,b.bucket,'identified_leads'::text,coalesce(c.n,0),d.n,coalesce(c.n,0)::numeric/nullif(d.n,0)
  FROM buckets b CROSS JOIN (SELECT count(*) AS n FROM population) d
  LEFT JOIN counts c USING(dimension,bucket);
$$;

CREATE VIEW app.lead_directory AS
  SELECT s.*,c.phone_hint,c.identity_source,c.channel_verified_at,l.quality_status
  FROM app.lead_state_as_of((SELECT id FROM app.strategy_plans ORDER BY version DESC LIMIT 1),now()) s
  JOIN app.contacts c ON c.id=s.contact_id JOIN app.leads l ON l.id=s.lead_id;

CREATE VIEW app.campaign_daily AS
  SELECT campaign_id,report_date,report_timezone,currency,attribution_spec_key,
    impressions,link_clicks,reach,spend,platform_leads,platform_purchases,source_updated_at,
    100.0*link_clicks/nullif(impressions,0) AS link_ctr_percent,
    1000.0*spend/nullif(impressions,0) AS cpm,
    spend/nullif(link_clicks,0) AS link_cpc,
    spend/nullif(platform_leads,0) AS platform_cpl
  FROM app.ad_metrics_daily WHERE grain='campaign' AND breakdown_key='all';

CREATE VIEW app.creative_daily AS
  SELECT f.campaign_id,a.creative_id,f.report_date,f.report_timezone,f.currency,f.attribution_spec_key,
    CASE WHEN count(*) FILTER(WHERE f.impressions IS NULL)>0 THEN NULL ELSE sum(f.impressions) END AS impressions,
    CASE WHEN count(*) FILTER(WHERE f.link_clicks IS NULL)>0 THEN NULL ELSE sum(f.link_clicks) END AS link_clicks,
    CASE WHEN count(*) FILTER(WHERE f.spend IS NULL)>0 THEN NULL ELSE sum(f.spend) END AS spend,
    CASE WHEN count(*) FILTER(WHERE f.platform_leads IS NULL)>0 THEN NULL ELSE sum(f.platform_leads) END AS platform_leads,
    CASE WHEN count(*) FILTER(WHERE f.platform_purchases IS NULL)>0 THEN NULL ELSE sum(f.platform_purchases) END AS platform_purchases,
    max(f.source_updated_at) AS source_updated_at
  FROM app.ad_metrics_daily f JOIN app.ads a ON a.id=f.ad_id
  WHERE f.grain='ad' AND f.creative_mapping_status='verified' AND f.breakdown_key='all'
  GROUP BY f.campaign_id,a.creative_id,f.report_date,f.report_timezone,f.currency,f.attribution_spec_key;

CREATE VIEW app.creative_mapping_coverage AS
  SELECT campaign_id,report_date,currency,attribution_spec_key,count(*) AS ad_reporting_rows,
    count(*) FILTER(WHERE creative_mapping_status='verified') AS mapped_rows,
    count(*) FILTER(WHERE creative_mapping_status='ambiguous') AS ambiguous_rows,
    count(*) FILTER(WHERE creative_mapping_status='unknown') AS unknown_rows
  FROM app.ad_metrics_daily WHERE grain='ad' AND breakdown_key='all'
  GROUP BY campaign_id,report_date,currency,attribution_spec_key;

CREATE VIEW app.business_impact_daily AS
  SELECT c.campaign_id,c.currency,(c.occurred_at AT TIME ZONE coalesce(p.report_timezone,(SELECT timezone FROM app.business_profile),'UTC'))::date AS report_date,
    count(*) FILTER(WHERE c.kind='purchase') AS confirmed_purchases,
    count(*) FILTER(WHERE c.kind='refund') AS confirmed_refunds,
    count(*) FILTER(WHERE c.amount IS NULL) AS unknown_amount_count,
    CASE WHEN count(*) FILTER(WHERE c.amount IS NULL)>0 THEN NULL ELSE sum(CASE WHEN c.kind='refund' THEN -c.amount ELSE c.amount END) END AS recorded_net_revenue,
    CASE WHEN count(*) FILTER(WHERE c.kind='purchase' AND c.is_new_customer IS NULL)>0 THEN NULL ELSE count(*) FILTER(WHERE c.kind='purchase' AND c.is_new_customer) END AS verified_new_customers
  FROM app.conversions c LEFT JOIN app.campaigns p ON p.id=c.campaign_id WHERE c.status='confirmed'
  GROUP BY c.campaign_id,c.currency,report_date;


INSERT INTO public.funnellens_mvp_migrations(name,sha256) VALUES('004_read_models.sql','f6a192cc234fea04fc6392e45e8b31629c3e821c0c79ecf5eac593835f52a46a');

-- Migration: 005_rag.sql

-- Install extension binaries on the PostgreSQL SERVER before this migration.
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='vector' AND n.nspname='public') THEN
    RAISE EXCEPTION 'This package expects vector installed in public; review/search-path adaptation for another extension schema';
  END IF;
END $$;

CREATE TABLE app.embedding_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  model text NOT NULL,
  model_revision text NOT NULL,
  dimensions integer NOT NULL CHECK (dimensions BETWEEN 1 AND 16000),
  distance_metric text NOT NULL DEFAULT 'cosine' CHECK (distance_metric='cosine'),
  preprocessing_version text NOT NULL,
  normalized boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider,model,model_revision,dimensions,preprocessing_version)
);
CREATE UNIQUE INDEX one_active_embedding_profile ON app.embedding_profiles(is_active) WHERE is_active;

CREATE TABLE app.knowledge_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key text NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('guide','business_fact','brand','rubric','creative_guide')),
  source_ref text NOT NULL,
  title text NOT NULL,
  version integer NOT NULL CHECK (version>0),
  content_hash text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  locator jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(locator)='object'),
  extraction_version text NOT NULL,
  chunking_version text NOT NULL,
  expected_chunks integer NOT NULL CHECK (expected_chunks>0),
  approval_status text NOT NULL DEFAULT 'draft' CHECK (approval_status IN ('draft','approved','rejected')),
  approved_by uuid REFERENCES app.users(id),
  approved_at timestamptz,
  ingest_status text NOT NULL DEFAULT 'processing' CHECK (ingest_status IN ('processing','ready','failed')),
  effective_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  retired_at timestamptz,
  error_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_key,version),
  CHECK (approval_status<>'approved' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
  CHECK (published_at IS NULL OR (approval_status='approved' AND ingest_status='ready')),
  CHECK (retired_at IS NULL OR (published_at IS NOT NULL AND retired_at>=published_at))
);
CREATE UNIQUE INDEX one_published_document_version ON app.knowledge_documents(source_key) WHERE published_at IS NOT NULL AND retired_at IS NULL;

CREATE TABLE app.knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES app.knowledge_documents(id),
  chunk_index integer NOT NULL CHECK (chunk_index>=0),
  content text NOT NULL CHECK (length(trim(content))>0),
  content_hash text NOT NULL,
  locator jsonb NOT NULL CHECK (jsonb_typeof(locator)='object'),
  embedding_profile_id uuid NOT NULL REFERENCES app.embedding_profiles(id),
  embedding public.vector,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ready','failed')),
  token_estimate integer CHECK (token_estimate>=0),
  error_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(document_id,chunk_index,embedding_profile_id),
  CHECK ((status='ready')=(embedding IS NOT NULL))
);
CREATE INDEX chunks_profile_doc ON app.knowledge_chunks(embedding_profile_id,document_id) WHERE status='ready';
ALTER TABLE app.agent_steps ADD COLUMN retrieval_profile_id uuid REFERENCES app.embedding_profiles(id);

CREATE FUNCTION app.guard_profile() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
BEGIN
  IF TG_OP='INSERT' AND NEW.is_active THEN RAISE EXCEPTION 'Insert inactive profile then activate explicitly' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND (to_jsonb(NEW)-'is_active') IS DISTINCT FROM (to_jsonb(OLD)-'is_active') THEN
    RAISE EXCEPTION 'Embedding profile immutable; create another profile and re-embed' USING ERRCODE='23514'; END IF;
  IF NEW.is_active AND EXISTS(SELECT 1 FROM app.knowledge_documents d WHERE d.published_at IS NOT NULL AND (d.retired_at IS NULL OR d.retired_at>clock_timestamp())
    AND (SELECT count(*) FROM app.knowledge_chunks c WHERE c.document_id=d.id AND c.embedding_profile_id=NEW.id AND c.status='ready')<>d.expected_chunks) THEN
    RAISE EXCEPTION 'Active profile must cover complete published corpus' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_profile BEFORE INSERT OR UPDATE ON app.embedding_profiles FOR EACH ROW EXECUTE FUNCTION app.guard_profile();

CREATE FUNCTION app.guard_document() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
BEGIN
  IF TG_OP='INSERT' AND (NEW.approval_status<>'draft' OR NEW.published_at IS NOT NULL OR NEW.retired_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Document starts unapproved/unpublished' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' THEN
    IF (to_jsonb(NEW)-ARRAY['approval_status','approved_by','approved_at','ingest_status','published_at','retired_at','error_summary']) IS DISTINCT FROM
       (to_jsonb(OLD)-ARRAY['approval_status','approved_by','approved_at','ingest_status','published_at','retired_at','error_summary']) THEN
      RAISE EXCEPTION 'Document source/version immutable' USING ERRCODE='23514'; END IF;
    IF NEW.approval_status IS DISTINCT FROM OLD.approval_status THEN
      IF OLD.approval_status<>'draft' OR NEW.approval_status NOT IN ('approved','rejected') OR NEW.approved_by IS DISTINCT FROM app.require_owner() THEN
        RAISE EXCEPTION 'Owner approves/rejects draft once' USING ERRCODE='23514'; END IF;
      NEW.approved_at=clock_timestamp();
    ELSIF (NEW.approved_by,NEW.approved_at) IS DISTINCT FROM (OLD.approved_by,OLD.approved_at) THEN
      RAISE EXCEPTION 'Document approval immutable' USING ERRCODE='23514';
    END IF;
    IF OLD.published_at IS NOT NULL AND NEW.published_at IS DISTINCT FROM OLD.published_at THEN
      RAISE EXCEPTION 'Publication time immutable' USING ERRCODE='23514'; END IF;
    IF OLD.retired_at IS NOT NULL AND NEW.retired_at IS DISTINCT FROM OLD.retired_at THEN
      RAISE EXCEPTION 'Retirement is one-way' USING ERRCODE='23514'; END IF;
    IF OLD.published_at IS NULL AND NEW.published_at IS NOT NULL THEN
      IF NEW.effective_at>clock_timestamp() OR NOT EXISTS(SELECT 1 FROM app.knowledge_chunks c WHERE c.document_id=NEW.id AND c.status='ready'
        GROUP BY c.embedding_profile_id HAVING count(*)=NEW.expected_chunks)
        OR EXISTS(SELECT 1 FROM app.embedding_profiles p WHERE p.is_active AND
          (SELECT count(*) FROM app.knowledge_chunks c WHERE c.document_id=NEW.id AND c.embedding_profile_id=p.id AND c.status='ready')<>NEW.expected_chunks) THEN
        RAISE EXCEPTION 'Publication requires complete embeddings and effective source, including active profile' USING ERRCODE='23514'; END IF;
      NEW.published_at=clock_timestamp();
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_document BEFORE INSERT OR UPDATE ON app.knowledge_documents FOR EACH ROW EXECUTE FUNCTION app.guard_document();

CREATE FUNCTION app.guard_chunk() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,app,public AS $$
DECLARE d app.knowledge_documents; p app.embedding_profiles;
BEGIN
  SELECT * INTO STRICT d FROM app.knowledge_documents WHERE id=NEW.document_id;
  SELECT * INTO STRICT p FROM app.embedding_profiles WHERE id=NEW.embedding_profile_id;
  IF NEW.chunk_index>=d.expected_chunks THEN RAISE EXCEPTION 'Chunk index outside expected range' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND (OLD.status='ready' OR
    (to_jsonb(NEW)-ARRAY['embedding','status','error_summary']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['embedding','status','error_summary'])) THEN
    RAISE EXCEPTION 'Chunk content/profile immutable; ready embedding immutable' USING ERRCODE='23514'; END IF;
  IF NEW.status='ready' AND (d.approval_status<>'approved' OR public.vector_dims(NEW.embedding)<>p.dimensions OR public.vector_norm(NEW.embedding)=0) THEN
    RAISE EXCEPTION 'Embedding requires approved source, matching dimensions and nonzero vector' USING ERRCODE='23514'; END IF;
  NEW.content_hash=app.json_hash(to_jsonb(NEW.content));
  RETURN NEW;
END $$;
CREATE TRIGGER guard_chunk BEFORE INSERT OR UPDATE ON app.knowledge_chunks FOR EACH ROW EXECUTE FUNCTION app.guard_chunk();
CREATE TRIGGER keep_chunk_history BEFORE DELETE ON app.knowledge_chunks FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
CREATE TRIGGER keep_document_history BEFORE DELETE ON app.knowledge_documents FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
CREATE TRIGGER keep_profile_history BEFORE DELETE ON app.embedding_profiles FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();

CREATE FUNCTION app.approve_document(p_document uuid,p_approve boolean DEFAULT true) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,app AS $$
BEGIN
  UPDATE app.knowledge_documents SET approval_status=CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,approved_by=app.require_owner() WHERE id=p_document;
  IF NOT FOUND THEN RAISE EXCEPTION 'Document not found' USING ERRCODE='P0002'; END IF;
END $$;

CREATE FUNCTION app.publish_document(p_document uuid,p_profile uuid) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
DECLARE d app.knowledge_documents;
BEGIN
  SELECT * INTO STRICT d FROM app.knowledge_documents WHERE id=p_document FOR UPDATE;
  PERFORM pg_advisory_xact_lock(hashtextextended('kb:'||d.source_key,0));
  IF d.approval_status<>'approved' OR d.published_at IS NOT NULL OR d.retired_at IS NOT NULL OR d.effective_at>clock_timestamp()
    OR (SELECT count(*) FROM app.knowledge_chunks WHERE document_id=d.id AND embedding_profile_id=p_profile AND status='ready')<>d.expected_chunks THEN
    RAISE EXCEPTION 'Publish only a complete approved version for chosen profile' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM app.knowledge_documents WHERE source_key=d.source_key AND version>=d.version AND published_at IS NOT NULL AND retired_at IS NULL) THEN
    RAISE EXCEPTION 'New publication must advance source version' USING ERRCODE='23514'; END IF;
  UPDATE app.knowledge_documents SET retired_at=clock_timestamp() WHERE source_key=d.source_key AND published_at IS NOT NULL AND retired_at IS NULL;
  UPDATE app.knowledge_documents SET ingest_status='ready',published_at=clock_timestamp() WHERE id=d.id;
END $$;

CREATE FUNCTION app.activate_embedding_profile(p_profile uuid) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('kb:active_profile',0));
  IF NOT EXISTS(SELECT 1 FROM app.embedding_profiles WHERE id=p_profile) THEN RAISE EXCEPTION 'Profile not found' USING ERRCODE='P0002'; END IF;
  IF EXISTS(SELECT 1 FROM app.knowledge_documents d WHERE d.published_at IS NOT NULL AND d.retired_at IS NULL
    AND (SELECT count(*) FROM app.knowledge_chunks c WHERE c.document_id=d.id AND c.embedding_profile_id=p_profile AND c.status='ready')<>d.expected_chunks) THEN
    RAISE EXCEPTION 'Re-embed all published sources before switching profiles' USING ERRCODE='23514'; END IF;
  UPDATE app.embedding_profiles SET is_active=false WHERE is_active;
  UPDATE app.embedding_profiles SET is_active=true WHERE id=p_profile;
END $$;

CREATE FUNCTION app.search_knowledge(p_profile uuid,p_query public.vector,p_limit integer DEFAULT 5,p_as_of timestamptz DEFAULT now())
RETURNS TABLE(chunk_id uuid,document_id uuid,title text,document_version integer,locator jsonb,content text,cosine_distance double precision)
LANGUAGE plpgsql STABLE SET search_path=pg_catalog,app,public AS $$
DECLARE p app.embedding_profiles;
BEGIN
  SELECT * INTO STRICT p FROM app.embedding_profiles WHERE id=p_profile AND is_active;
  IF p_query IS NULL OR public.vector_dims(p_query)<>p.dimensions OR public.vector_norm(p_query)=0 OR p_limit NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'Query vector/profile/dimensions or top-k invalid' USING ERRCODE='23514'; END IF;
  RETURN QUERY WITH eligible AS MATERIALIZED (
    SELECT c.id,d.id AS doc_id,d.title,d.version,c.locator,c.content,c.embedding
    FROM app.knowledge_chunks c JOIN app.knowledge_documents d ON d.id=c.document_id
    WHERE c.embedding_profile_id=p_profile AND c.status='ready' AND d.approval_status='approved'
      AND d.published_at<=p_as_of AND d.effective_at<=p_as_of AND (d.retired_at IS NULL OR d.retired_at>p_as_of)
  ) SELECT e.id,e.doc_id,e.title,e.version,e.locator,e.content,e.embedding OPERATOR(public.<=>) p_query
    FROM eligible e ORDER BY e.embedding OPERATOR(public.<=>) p_query,e.id LIMIT p_limit;
END $$;

CREATE FUNCTION app.validate_retrieval_step() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
DECLARE ref jsonb;
BEGIN
  IF NEW.kind='retrieve' AND NEW.status='succeeded' THEN
    IF NEW.retrieval_profile_id IS NULL OR jsonb_typeof(NEW.result_refs->'chunks') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Retrieval profile and chunk list required, even for zero hits' USING ERRCODE='23514'; END IF;
    FOR ref IN SELECT * FROM jsonb_array_elements(NEW.result_refs->'chunks') LOOP
      IF NOT EXISTS(SELECT 1 FROM app.knowledge_chunks c JOIN app.knowledge_documents d ON d.id=c.document_id
        WHERE c.id=(ref->>'chunk_id')::uuid AND c.embedding_profile_id=NEW.retrieval_profile_id AND c.status='ready'
          AND d.approval_status='approved' AND d.published_at<=NEW.started_at AND d.effective_at<=NEW.started_at
          AND (d.retired_at IS NULL OR d.retired_at>NEW.started_at)) THEN
        RAISE EXCEPTION 'Retrieval evidence source/profile mismatch' USING ERRCODE='23514'; END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER validate_retrieval_step BEFORE INSERT OR UPDATE ON app.agent_steps FOR EACH ROW EXECUTE FUNCTION app.validate_retrieval_step();
CREATE TRIGGER audit_kb_change AFTER INSERT OR UPDATE ON app.knowledge_documents FOR EACH ROW EXECUTE FUNCTION app.audit_change();


INSERT INTO public.funnellens_mvp_migrations(name,sha256) VALUES('005_rag.sql','a572f02d79e881df4e17d9db9104b1652e76bf2ce9e98da6b9e1a23abc2346be');

-- Migration: 006_access.sql

-- Two database capability groups, not workspace/user roles. Run with CREATEROLE,
-- or ask the DBA to pre-create these NOLOGIN groups before applying migrations.
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='fl_mvp_api') THEN CREATE ROLE fl_mvp_api NOLOGIN; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='fl_mvp_worker') THEN CREATE ROLE fl_mvp_worker NOLOGIN; END IF;
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA app FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA app REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
GRANT USAGE ON SCHEMA app TO fl_mvp_api,fl_mvp_worker;
GRANT SELECT ON ALL TABLES IN SCHEMA app TO fl_mvp_api,fl_mvp_worker;

GRANT INSERT,UPDATE ON app.business_profile,app.products,app.contacts,app.leads TO fl_mvp_api;
GRANT INSERT ON app.campaigns,app.creatives,app.campaign_drafts,app.strategy_plans,app.lead_events,app.lead_assessments TO fl_mvp_api;
GRANT UPDATE(name,objective,desired_status,current_draft_id) ON app.campaigns TO fl_mvp_api;
GRANT UPDATE(review_status,reviewed_by,review_reason) ON app.insights TO fl_mvp_api;

GRANT INSERT,UPDATE ON app.integrations,app.campaigns,app.ad_sets,app.ads,app.ad_metrics_daily,app.contacts,app.leads,app.conversions,app.agent_runs,app.agent_steps,app.jobs TO fl_mvp_worker;
GRANT INSERT ON app.creatives,app.campaign_drafts,app.lead_events,app.lead_assessments,app.insights TO fl_mvp_worker;

GRANT EXECUTE ON FUNCTION app.json_hash(jsonb),app.actor_id(),app.require_owner(),app.creative_content(app.creatives),app.assert_action(uuid),
  app.lead_state_as_of(uuid,timestamptz),app.funnel_distribution(uuid,uuid,timestamptz,timestamptz) TO fl_mvp_api,fl_mvp_worker;
GRANT EXECUTE ON FUNCTION app.create_action(uuid,text,text,interval),app.decide_action(uuid,text,text),app.revoke_action(uuid,text),
  app.enqueue_action(uuid),app.enqueue_read_job(text,text,uuid,jsonb),app.confirm_purchase(uuid,numeric,text,text) TO fl_mvp_api;
GRANT EXECUTE ON FUNCTION app.claim_job(text,text[],interval),app.reap_expired_jobs() TO fl_mvp_worker;

-- Also usable after a deliberate core-only install (migration 005 omitted).
DO $$ BEGIN
  IF to_regclass('app.knowledge_documents') IS NOT NULL THEN
    GRANT INSERT ON app.knowledge_documents TO fl_mvp_api,fl_mvp_worker;
    GRANT INSERT ON app.embedding_profiles,app.knowledge_chunks TO fl_mvp_worker;
    GRANT UPDATE(is_active) ON app.embedding_profiles TO fl_mvp_worker;
    GRANT UPDATE(embedding,status,error_summary) ON app.knowledge_chunks TO fl_mvp_worker;
    GRANT UPDATE(ingest_status,published_at,retired_at,error_summary) ON app.knowledge_documents TO fl_mvp_worker;
    GRANT EXECUTE ON FUNCTION app.approve_document(uuid,boolean) TO fl_mvp_api;
    GRANT EXECUTE ON FUNCTION app.publish_document(uuid,uuid),app.activate_embedding_profile(uuid) TO fl_mvp_worker;
    GRANT EXECUTE ON FUNCTION app.search_knowledge(uuid,public.vector,integer,timestamptz) TO fl_mvp_api,fl_mvp_worker;
  END IF;
END $$;


INSERT INTO public.funnellens_mvp_migrations(name,sha256) VALUES('006_access.sql','4a27fcd48f1d0d6622b04a946939d47fd6fa6e375e023e67ca6cd7a3de444fc8');

REVOKE ALL ON public.funnellens_mvp_migrations FROM PUBLIC;

COMMIT;

