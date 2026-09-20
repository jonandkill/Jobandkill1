-- Job&Kill trend-based content automation: PostgreSQL core data model.
-- This migration stores only opaque identifiers for people and transactions.
-- Do not place API keys, access tokens, raw contact details, or payment secrets here.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE keyword_intent AS ENUM ('information', 'comparison', 'review', 'purchase', 'local_visit', 'unknown');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE candidate_source AS ENUM ('manual', 'naver_datalab', 'google_trends', 'search_console', 'customer_question', 'ai_suggestion', 'import');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE candidate_status AS ENUM ('draft', 'researching', 'ready_for_review', 'approved', 'deferred', 'rejected', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE trend_provider AS ENUM ('naver_datalab', 'google_trends', 'google_search_console', 'naver_searchad', 'manual_import', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE trend_scale AS ENUM ('relative_index', 'absolute_count', 'rank', 'percentage', 'unknown');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE observation_state AS ENUM ('available', 'no_data', 'low_volume', 'source_unavailable', 'connection_error', 'invalid_request', 'not_collected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE evidence_source_type AS ENUM ('official', 'first_party', 'approved_case', 'research', 'news', 'manual_note', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE evidence_use_status AS ENUM ('approved', 'review_required', 'expired', 'superseded', 'not_for_publication');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE content_status AS ENUM ('candidate', 'researching', 'drafting', 'review_required', 'approved', 'scheduled', 'published', 'measuring', 'improvement_required', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE channel_type AS ENUM ('naver_blog', 'website', 'instagram', 'threads', 'youtube_shorts', 'newsletter', 'q_and_a', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'changes_requested', 'rejected', 'superseded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE publication_status AS ENUM ('draft_package', 'awaiting_manual_publish', 'scheduled', 'publishing', 'published', 'verification_required', 'failed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE performance_metric AS ENUM ('impressions', 'clicks', 'sessions', 'ctr', 'average_position', 'views', 'engagements', 'cta_clicks', 'lead_completions', 'consultations_completed', 'confirmed_revenue', 'refund_amount', 'review_minutes', 'generation_cost');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE conversion_type AS ENUM ('lead_completed', 'consultation_booked', 'consultation_completed', 'payment_confirmed', 'refund_confirmed', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE conversion_status AS ENUM ('pending', 'confirmed', 'cancelled', 'refunded', 'attribution_unknown');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE experiment_status AS ENUM ('draft', 'running', 'paused', 'completed', 'inconclusive', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE job_status AS ENUM ('queued', 'running', 'succeeded', 'retry_scheduled', 'failed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  timezone TEXT NOT NULL DEFAULT 'Asia/Seoul',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS business_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL UNIQUE REFERENCES businesses(id) ON DELETE CASCADE,
  specialties TEXT[] NOT NULL DEFAULT '{}',
  target_audiences TEXT[] NOT NULL DEFAULT '{}',
  service_regions TEXT[] NOT NULL DEFAULT '{}',
  brand_tone JSONB NOT NULL DEFAULT '{}'::jsonb,
  excluded_topics TEXT[] NOT NULL DEFAULT '{}',
  publishing_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  conversion_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price_amount NUMERIC(14, 2) NOT NULL CHECK (price_amount >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'KRW',
  duration_description TEXT,
  capacity INTEGER CHECK (capacity IS NULL OR capacity >= 0),
  availability_status TEXT NOT NULL DEFAULT 'draft' CHECK (availability_status IN ('draft', 'available', 'sold_out', 'paused', 'retired')),
  application_url TEXT,
  terms_checked_at TIMESTAMPTZ,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  retired_at TIMESTAMPTZ,
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at >= starts_at)
);

CREATE TABLE IF NOT EXISTS keyword_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  phrase TEXT NOT NULL,
  normalized_phrase TEXT NOT NULL,
  keyword_group TEXT,
  intent keyword_intent NOT NULL DEFAULT 'unknown',
  source candidate_source NOT NULL,
  status candidate_status NOT NULL DEFAULT 'draft',
  score_total NUMERIC(5, 2) CHECK (score_total IS NULL OR (score_total >= 0 AND score_total <= 100)),
  score_confidence NUMERIC(4, 3) NOT NULL DEFAULT 0 CHECK (score_confidence >= 0 AND score_confidence <= 1),
  score_components JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  rationale TEXT,
  data_completeness NUMERIC(4, 3) NOT NULL DEFAULT 0 CHECK (data_completeness >= 0 AND data_completeness <= 1),
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ,
  UNIQUE (business_id, normalized_phrase)
);

CREATE TABLE IF NOT EXISTS trend_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  keyword_candidate_id UUID REFERENCES keyword_candidates(id) ON DELETE SET NULL,
  provider trend_provider NOT NULL,
  metric TEXT NOT NULL,
  scale trend_scale NOT NULL DEFAULT 'unknown',
  state observation_state NOT NULL DEFAULT 'available',
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  granularity TEXT NOT NULL CHECK (granularity IN ('daily', 'weekly', 'monthly', 'yearly', 'event')),
  observed_value NUMERIC(18, 6),
  dimensions JSONB NOT NULL DEFAULT '{}'::jsonb,
  query_signature TEXT NOT NULL,
  collected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_updated_at TIMESTAMPTZ,
  missing_reason TEXT,
  raw_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start),
  CHECK ((state = 'available' AND observed_value IS NOT NULL) OR state <> 'available')
);

CREATE TABLE IF NOT EXISTS evidence_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  source_type evidence_source_type NOT NULL,
  use_status evidence_use_status NOT NULL DEFAULT 'review_required',
  claim_summary TEXT NOT NULL,
  source_title TEXT,
  canonical_url TEXT,
  publisher_name TEXT,
  excerpt TEXT,
  applicable_from DATE,
  applicable_until DATE,
  verified_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  source_published_at TIMESTAMPTZ,
  source_snapshot_uri TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (applicable_until IS NULL OR applicable_from IS NULL OR applicable_until >= applicable_from)
);

CREATE TABLE IF NOT EXISTS content_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  keyword_candidate_id UUID REFERENCES keyword_candidates(id) ON DELETE SET NULL,
  primary_offer_id UUID REFERENCES offers(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'article',
  status content_status NOT NULL DEFAULT 'candidate',
  primary_action_label TEXT,
  primary_action_url TEXT,
  current_version_id UUID,
  planned_publish_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS content_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  title TEXT NOT NULL,
  body_markdown TEXT NOT NULL,
  structured_content JSONB NOT NULL DEFAULT '{}'::jsonb,
  generation_source TEXT NOT NULL DEFAULT 'manual' CHECK (generation_source IN ('manual', 'ai_assisted', 'imported')),
  change_summary TEXT,
  quality_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (content_id, version_number)
);

ALTER TABLE content_items
  ADD CONSTRAINT content_items_current_version_fk
  FOREIGN KEY (current_version_id) REFERENCES content_versions(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS content_evidence_links (
  content_version_id UUID NOT NULL REFERENCES content_versions(id) ON DELETE CASCADE,
  evidence_id UUID NOT NULL REFERENCES evidence_records(id) ON DELETE RESTRICT,
  usage_note TEXT,
  is_core_claim BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (content_version_id, evidence_id)
);

CREATE TABLE IF NOT EXISTS approval_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_version_id UUID NOT NULL REFERENCES content_versions(id) ON DELETE CASCADE,
  channel channel_type,
  status approval_status NOT NULL DEFAULT 'pending',
  reviewer_id TEXT,
  feedback TEXT,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((status = 'pending' AND decided_at IS NULL) OR (status <> 'pending' AND decided_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS publication_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  content_item_id UUID NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  content_version_id UUID NOT NULL REFERENCES content_versions(id) ON DELETE RESTRICT,
  channel channel_type NOT NULL,
  status publication_status NOT NULL DEFAULT 'draft_package',
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  external_post_id TEXT,
  published_url TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  package_uri TEXT,
  result_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((status <> 'published' AND status <> 'verification_required') OR published_at IS NOT NULL),
  UNIQUE (content_version_id, channel)
);

CREATE TABLE IF NOT EXISTS performance_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  content_item_id UUID REFERENCES content_items(id) ON DELETE CASCADE,
  publication_id UUID REFERENCES publication_records(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  metric performance_metric NOT NULL,
  observed_date DATE NOT NULL,
  value NUMERIC(20, 6),
  state observation_state NOT NULL DEFAULT 'available',
  dimensions JSONB NOT NULL DEFAULT '{}'::jsonb,
  missing_reason TEXT,
  collected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (content_item_id IS NOT NULL OR publication_id IS NOT NULL),
  CHECK ((state = 'available' AND value IS NOT NULL) OR state <> 'available')
);

CREATE TABLE IF NOT EXISTS conversion_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  content_item_id UUID REFERENCES content_items(id) ON DELETE SET NULL,
  publication_id UUID REFERENCES publication_records(id) ON DELETE SET NULL,
  offer_id UUID REFERENCES offers(id) ON DELETE SET NULL,
  conversion_type conversion_type NOT NULL,
  status conversion_status NOT NULL DEFAULT 'pending',
  occurred_at TIMESTAMPTZ NOT NULL,
  subject_reference TEXT,
  transaction_reference TEXT,
  amount NUMERIC(14, 2),
  currency CHAR(3) NOT NULL DEFAULT 'KRW',
  attribution_method TEXT NOT NULL DEFAULT 'unknown',
  utm JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (amount IS NULL OR amount >= 0)
);

CREATE TABLE IF NOT EXISTS experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  hypothesis TEXT NOT NULL,
  status experiment_status NOT NULL DEFAULT 'draft',
  primary_metric performance_metric,
  observation_starts_at TIMESTAMPTZ,
  observation_ends_at TIMESTAMPTZ,
  conclusion TEXT,
  confounding_events JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (observation_ends_at IS NULL OR observation_starts_at IS NULL OR observation_ends_at >= observation_starts_at)
);

CREATE TABLE IF NOT EXISTS experiment_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id UUID NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  content_item_id UUID REFERENCES content_items(id) ON DELETE SET NULL,
  content_version_id UUID REFERENCES content_versions(id) ON DELETE SET NULL,
  label TEXT NOT NULL,
  is_control BOOLEAN NOT NULL DEFAULT false,
  changes JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (experiment_id, label)
);

CREATE UNIQUE INDEX IF NOT EXISTS experiment_variants_one_control
  ON experiment_variants (experiment_id)
  WHERE is_control;

CREATE TABLE IF NOT EXISTS job_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL,
  status job_status NOT NULL DEFAULT 'queued',
  idempotency_key TEXT,
  related_entity_type TEXT,
  related_entity_id UUID,
  attempt INTEGER NOT NULL DEFAULT 0 CHECK (attempt >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
  queued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ,
  error_code TEXT,
  error_message TEXT,
  request_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  cost_amount NUMERIC(14, 6) CHECK (cost_amount IS NULL OR cost_amount >= 0),
  cost_currency CHAR(3) NOT NULL DEFAULT 'KRW',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((status = 'running' AND started_at IS NOT NULL) OR status <> 'running'),
  CHECK ((status IN ('succeeded', 'failed', 'cancelled') AND finished_at IS NOT NULL) OR status NOT IN ('succeeded', 'failed', 'cancelled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS job_logs_idempotency_key_unique
  ON job_logs (business_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS offers_business_availability_idx ON offers (business_id, availability_status, starts_at);
CREATE INDEX IF NOT EXISTS keyword_candidates_review_idx ON keyword_candidates (business_id, status, score_total DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS trend_observations_lookup_idx ON trend_observations (business_id, keyword_candidate_id, provider, metric, period_start, period_end);
CREATE INDEX IF NOT EXISTS evidence_records_active_idx ON evidence_records (business_id, use_status, expires_at);
CREATE INDEX IF NOT EXISTS content_items_work_queue_idx ON content_items (business_id, status, planned_publish_at);
CREATE INDEX IF NOT EXISTS content_versions_content_idx ON content_versions (content_id, version_number DESC);
CREATE INDEX IF NOT EXISTS approval_decisions_pending_idx ON approval_decisions (status, content_version_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS publication_records_queue_idx ON publication_records (business_id, status, scheduled_at);
CREATE INDEX IF NOT EXISTS performance_observations_content_idx ON performance_observations (business_id, content_item_id, observed_date, metric);
CREATE INDEX IF NOT EXISTS conversion_events_content_idx ON conversion_events (business_id, content_item_id, occurred_at, conversion_type);
CREATE INDEX IF NOT EXISTS conversion_events_offer_idx ON conversion_events (business_id, offer_id, occurred_at, status);
CREATE INDEX IF NOT EXISTS experiments_status_idx ON experiments (business_id, status, observation_starts_at);
CREATE INDEX IF NOT EXISTS job_logs_queue_idx ON job_logs (status, next_retry_at, queued_at);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS businesses_set_updated_at ON businesses;
CREATE TRIGGER businesses_set_updated_at BEFORE UPDATE ON businesses FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS business_settings_set_updated_at ON business_settings;
CREATE TRIGGER business_settings_set_updated_at BEFORE UPDATE ON business_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS offers_set_updated_at ON offers;
CREATE TRIGGER offers_set_updated_at BEFORE UPDATE ON offers FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS keyword_candidates_set_updated_at ON keyword_candidates;
CREATE TRIGGER keyword_candidates_set_updated_at BEFORE UPDATE ON keyword_candidates FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS evidence_records_set_updated_at ON evidence_records;
CREATE TRIGGER evidence_records_set_updated_at BEFORE UPDATE ON evidence_records FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS content_items_set_updated_at ON content_items;
CREATE TRIGGER content_items_set_updated_at BEFORE UPDATE ON content_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS publication_records_set_updated_at ON publication_records;
CREATE TRIGGER publication_records_set_updated_at BEFORE UPDATE ON publication_records FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS conversion_events_set_updated_at ON conversion_events;
CREATE TRIGGER conversion_events_set_updated_at BEFORE UPDATE ON conversion_events FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS experiments_set_updated_at ON experiments;
CREATE TRIGGER experiments_set_updated_at BEFORE UPDATE ON experiments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS job_logs_set_updated_at ON job_logs;
CREATE TRIGGER job_logs_set_updated_at BEFORE UPDATE ON job_logs FOR EACH ROW EXECUTE FUNCTION set_updated_at();
