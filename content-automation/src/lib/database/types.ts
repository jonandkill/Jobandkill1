/**
 * Application-facing types for the PostgreSQL schema in
 * database/migrations/001_content_automation_core.sql.
 *
 * Secrets deliberately have no type in this module. Store connection secrets in
 * a server-side secret manager and expose only a masked connection health state.
 */

export type UUID = string;
export type ISODate = string;
export type ISODateTime = string;
export type JsonObject = Record<string, unknown>;

export const KEYWORD_INTENTS = [
  'information',
  'comparison',
  'review',
  'purchase',
  'local_visit',
  'unknown',
] as const;
export type KeywordIntent = (typeof KEYWORD_INTENTS)[number];

export const CANDIDATE_SOURCES = [
  'manual',
  'naver_datalab',
  'google_trends',
  'search_console',
  'customer_question',
  'ai_suggestion',
  'import',
] as const;
export type CandidateSource = (typeof CANDIDATE_SOURCES)[number];

export const CANDIDATE_STATUSES = [
  'draft',
  'researching',
  'ready_for_review',
  'approved',
  'deferred',
  'rejected',
  'archived',
] as const;
export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];

export const TREND_PROVIDERS = [
  'naver_datalab',
  'google_trends',
  'google_search_console',
  'naver_searchad',
  'manual_import',
  'other',
] as const;
export type TrendProvider = (typeof TREND_PROVIDERS)[number];

export const TREND_SCALES = [
  'relative_index',
  'absolute_count',
  'rank',
  'percentage',
  'unknown',
] as const;
export type TrendScale = (typeof TREND_SCALES)[number];

export const OBSERVATION_STATES = [
  'available',
  'no_data',
  'low_volume',
  'source_unavailable',
  'connection_error',
  'invalid_request',
  'not_collected',
] as const;
export type ObservationState = (typeof OBSERVATION_STATES)[number];

export const EVIDENCE_SOURCE_TYPES = [
  'official',
  'first_party',
  'approved_case',
  'research',
  'news',
  'manual_note',
  'other',
] as const;
export type EvidenceSourceType = (typeof EVIDENCE_SOURCE_TYPES)[number];

export const EVIDENCE_USE_STATUSES = [
  'approved',
  'review_required',
  'expired',
  'superseded',
  'not_for_publication',
] as const;
export type EvidenceUseStatus = (typeof EVIDENCE_USE_STATUSES)[number];

export const CONTENT_STATUSES = [
  'candidate',
  'researching',
  'drafting',
  'review_required',
  'approved',
  'scheduled',
  'published',
  'measuring',
  'improvement_required',
  'archived',
] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export const CHANNEL_TYPES = [
  'naver_blog',
  'website',
  'instagram',
  'threads',
  'youtube_shorts',
  'newsletter',
  'q_and_a',
  'other',
] as const;
export type ChannelType = (typeof CHANNEL_TYPES)[number];

export const APPROVAL_STATUSES = [
  'pending',
  'approved',
  'changes_requested',
  'rejected',
  'superseded',
] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const PUBLICATION_STATUSES = [
  'draft_package',
  'awaiting_manual_publish',
  'scheduled',
  'publishing',
  'published',
  'verification_required',
  'failed',
  'cancelled',
] as const;
export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];

export const PERFORMANCE_METRICS = [
  'impressions',
  'clicks',
  'sessions',
  'ctr',
  'average_position',
  'views',
  'engagements',
  'cta_clicks',
  'lead_completions',
  'consultations_completed',
  'confirmed_revenue',
  'refund_amount',
  'review_minutes',
  'generation_cost',
] as const;
export type PerformanceMetric = (typeof PERFORMANCE_METRICS)[number];

export const CONVERSION_TYPES = [
  'lead_completed',
  'consultation_booked',
  'consultation_completed',
  'payment_confirmed',
  'refund_confirmed',
  'other',
] as const;
export type ConversionType = (typeof CONVERSION_TYPES)[number];

export const CONVERSION_STATUSES = [
  'pending',
  'confirmed',
  'cancelled',
  'refunded',
  'attribution_unknown',
] as const;
export type ConversionStatus = (typeof CONVERSION_STATUSES)[number];

export const EXPERIMENT_STATUSES = [
  'draft',
  'running',
  'paused',
  'completed',
  'inconclusive',
  'cancelled',
] as const;
export type ExperimentStatus = (typeof EXPERIMENT_STATUSES)[number];

export const JOB_STATUSES = [
  'queued',
  'running',
  'succeeded',
  'retry_scheduled',
  'failed',
  'cancelled',
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export interface Business {
  id: UUID;
  name: string;
  slug: string;
  timezone: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  archivedAt: ISODateTime | null;
}

export interface BusinessSettings {
  id: UUID;
  businessId: UUID;
  specialties: string[];
  targetAudiences: string[];
  serviceRegions: string[];
  brandTone: JsonObject;
  excludedTopics: string[];
  publishingRules: JsonObject;
  conversionRules: JsonObject;
  updatedBy: string | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface Offer {
  id: UUID;
  businessId: UUID;
  name: string;
  description: string | null;
  priceAmount: string;
  currency: string;
  durationDescription: string | null;
  capacity: number | null;
  availabilityStatus: 'draft' | 'available' | 'sold_out' | 'paused' | 'retired';
  applicationUrl: string | null;
  termsCheckedAt: ISODateTime | null;
  startsAt: ISODateTime | null;
  endsAt: ISODateTime | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  retiredAt: ISODateTime | null;
}

export interface KeywordCandidate {
  id: UUID;
  businessId: UUID;
  phrase: string;
  normalizedPhrase: string;
  keywordGroup: string | null;
  intent: KeywordIntent;
  source: CandidateSource;
  status: CandidateStatus;
  scoreTotal: string | null;
  scoreConfidence: string;
  scoreComponents: JsonObject;
  sourceDetails: JsonObject;
  rationale: string | null;
  dataCompleteness: string;
  createdBy: string | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  archivedAt: ISODateTime | null;
}

export interface TrendObservation {
  id: UUID;
  businessId: UUID;
  keywordCandidateId: UUID | null;
  provider: TrendProvider;
  metric: string;
  scale: TrendScale;
  state: ObservationState;
  periodStart: ISODate;
  periodEnd: ISODate;
  granularity: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'event';
  observedValue: string | null;
  dimensions: JsonObject;
  querySignature: string;
  collectedAt: ISODateTime;
  sourceUpdatedAt: ISODateTime | null;
  missingReason: string | null;
  rawReference: string | null;
}

export interface EvidenceRecord {
  id: UUID;
  businessId: UUID;
  sourceType: EvidenceSourceType;
  useStatus: EvidenceUseStatus;
  claimSummary: string;
  sourceTitle: string | null;
  canonicalUrl: string | null;
  publisherName: string | null;
  excerpt: string | null;
  applicableFrom: ISODate | null;
  applicableUntil: ISODate | null;
  verifiedAt: ISODateTime | null;
  expiresAt: ISODateTime | null;
  sourcePublishedAt: ISODateTime | null;
  sourceSnapshotUri: string | null;
  metadata: JsonObject;
  createdBy: string | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface ContentItem {
  id: UUID;
  businessId: UUID;
  keywordCandidateId: UUID | null;
  primaryOfferId: UUID | null;
  title: string;
  contentType: string;
  status: ContentStatus;
  primaryActionLabel: string | null;
  primaryActionUrl: string | null;
  currentVersionId: UUID | null;
  plannedPublishAt: ISODateTime | null;
  publishedAt: ISODateTime | null;
  createdBy: string | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  archivedAt: ISODateTime | null;
}

export interface ContentVersion {
  id: UUID;
  contentId: UUID;
  versionNumber: number;
  title: string;
  bodyMarkdown: string;
  structuredContent: JsonObject;
  generationSource: 'manual' | 'ai_assisted' | 'imported';
  changeSummary: string | null;
  qualityFlags: unknown[];
  createdBy: string | null;
  createdAt: ISODateTime;
}

export interface ApprovalDecision {
  id: UUID;
  contentVersionId: UUID;
  channel: ChannelType | null;
  status: ApprovalStatus;
  reviewerId: string | null;
  feedback: string | null;
  decidedAt: ISODateTime | null;
  createdAt: ISODateTime;
}

export interface PublicationRecord {
  id: UUID;
  businessId: UUID;
  contentItemId: UUID;
  contentVersionId: UUID;
  channel: ChannelType;
  status: PublicationStatus;
  scheduledAt: ISODateTime | null;
  publishedAt: ISODateTime | null;
  verifiedAt: ISODateTime | null;
  externalPostId: string | null;
  publishedUrl: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  packageUri: string | null;
  resultDetails: JsonObject;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface PerformanceObservation {
  id: UUID;
  businessId: UUID;
  contentItemId: UUID | null;
  publicationId: UUID | null;
  provider: string;
  metric: PerformanceMetric;
  observedDate: ISODate;
  value: string | null;
  state: ObservationState;
  dimensions: JsonObject;
  missingReason: string | null;
  collectedAt: ISODateTime;
}

export interface ConversionEvent {
  id: UUID;
  businessId: UUID;
  contentItemId: UUID | null;
  publicationId: UUID | null;
  offerId: UUID | null;
  conversionType: ConversionType;
  status: ConversionStatus;
  occurredAt: ISODateTime;
  subjectReference: string | null;
  transactionReference: string | null;
  amount: string | null;
  currency: string;
  attributionMethod: string;
  utm: JsonObject;
  metadata: JsonObject;
}

export interface Experiment {
  id: UUID;
  businessId: UUID;
  name: string;
  hypothesis: string;
  status: ExperimentStatus;
  primaryMetric: PerformanceMetric | null;
  observationStartsAt: ISODateTime | null;
  observationEndsAt: ISODateTime | null;
  conclusion: string | null;
  confoundingEvents: unknown[];
  createdBy: string | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface ExperimentVariant {
  id: UUID;
  experimentId: UUID;
  contentItemId: UUID | null;
  contentVersionId: UUID | null;
  label: string;
  isControl: boolean;
  changes: JsonObject;
  createdAt: ISODateTime;
}

export interface JobLog {
  id: UUID;
  businessId: UUID | null;
  jobType: string;
  status: JobStatus;
  idempotencyKey: string | null;
  relatedEntityType: string | null;
  relatedEntityId: UUID | null;
  attempt: number;
  maxAttempts: number;
  queuedAt: ISODateTime;
  startedAt: ISODateTime | null;
  finishedAt: ISODateTime | null;
  nextRetryAt: ISODateTime | null;
  errorCode: string | null;
  errorMessage: string | null;
  requestSummary: JsonObject;
  resultSummary: JsonObject;
  costAmount: string | null;
  costCurrency: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}
