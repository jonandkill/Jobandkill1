export type AnalyticsConnectorId =
  | "google_search_console"
  | "naver_blog"
  | "naver_datalab"
  | "manual";

/**
 * A connector must always tell the operator whether a number is live,
 * unavailable, or has become stale.  A missing number is never treated as 0.
 */
export type ConnectorStatus = "connected" | "unconfigured" | "error" | "stale";

export interface ConnectorHealth {
  connector: AnalyticsConnectorId;
  status: ConnectorStatus;
  label: string;
  detail: string;
  lastSuccessfulAt?: string;
  lastAttemptedAt?: string;
}

export type PerformanceEventType =
  | "session"
  | "application"
  | "consultation_completed"
  | "payment_confirmed"
  | "refund_confirmed";

/**
 * Raw activity received from an analytics, form, booking, or payment adapter.
 * `contentId` and `subjectKey` are optional because offline calls and walk-ins
 * can be recorded without falsely assigning credit to a piece of content.
 */
export interface PerformanceEvent {
  id: string;
  eventType: PerformanceEventType;
  occurredAt: string;
  contentId?: string;
  /** A privacy-safe key such as a hashed visitor, lead, or customer key. */
  subjectKey?: string;
  /** Stable source record key used to safely de-duplicate imported activity. */
  entityKey?: string;
  amount?: number;
  currency?: string;
  source?: AnalyticsConnectorId | "booking" | "payment" | "import";
}

/** Search impressions and clicks are represented separately from sessions. */
export interface SearchObservation {
  id: string;
  contentId: string;
  observedOn: string;
  connector: AnalyticsConnectorId;
  impressions?: number | null;
  clicks?: number | null;
}

export type AttributionModel = "first_touch" | "last_touch" | "linear";

export interface AttributionCredit {
  conversionEventId: string;
  conversionType: Extract<
    PerformanceEventType,
    "application" | "consultation_completed" | "payment_confirmed" | "refund_confirmed"
  >;
  conversionAt: string;
  contentId: string;
  model: AttributionModel;
  credit: number;
  attributedAmount: number;
}

export type MetricAvailability =
  | "available"
  | "not_configured"
  | "not_available"
  | "insufficient_data";

export interface MetricValue {
  value: number | null;
  availability: MetricAvailability;
  denominator?: number;
}

export interface FunnelMetrics {
  sessions: number;
  applications: number;
  consultations: number;
  confirmedPayments: number;
  refunds: number;
  grossRevenue: number;
  refundAmount: number;
  netRevenue: number;
  applicationRate: MetricValue;
  consultationRate: MetricValue;
  paymentRate: MetricValue;
  refundRate: MetricValue;
}

export interface ContentPerformanceMetrics {
  contentId: string;
  impressions: MetricValue;
  clicks: MetricValue;
  ctr: MetricValue;
  funnel: FunnelMetrics;
  attribution: {
    applications: number;
    consultations: number;
    confirmedPayments: number;
    refunds: number;
    attributedRevenue: number;
    attributedRefundAmount: number;
  };
}

export interface AnalyticsDashboard {
  generatedAt: string;
  period: { start: string; end: string };
  connectorHealth: ConnectorHealth[];
  overall: ContentPerformanceMetrics;
  byContent: ContentPerformanceMetrics[];
  unassigned: FunnelMetrics;
}

export interface ImprovementThresholds {
  minImpressionsForCtrReview: number;
  lowCtr: number;
  minSessionsForConversionReview: number;
  lowApplicationRate: number;
  lowConsultationRate: number;
  lowPaymentRate: number;
  staleAfterDays: number;
}

export type ImprovementRecommendationKind =
  | "connect_data"
  | "improve_search_snippet"
  | "strengthen_content_to_offer_path"
  | "reduce_application_friction"
  | "review_offer_fit"
  | "refresh_stale_content";

export interface ImprovementRecommendation {
  id: string;
  contentId?: string;
  kind: ImprovementRecommendationKind;
  priority: "high" | "medium" | "low";
  score: number;
  title: string;
  reason: string;
  proposedAction: string;
  evidence: Array<{ metric: string; value: number | string | null; note?: string }>;
}

export type ExperimentPrimaryMetric =
  | "ctr"
  | "application_rate"
  | "consultation_rate"
  | "payment_rate"
  | "net_revenue";

export interface ExperimentArmMetrics {
  impressions?: number;
  clicks?: number;
  sessions?: number;
  applications?: number;
  consultations?: number;
  confirmedPayments?: number;
  netRevenue?: number;
}

export interface ExperimentInput {
  id: string;
  name: string;
  hypothesis: string;
  primaryMetric: ExperimentPrimaryMetric;
  baseline: ExperimentArmMetrics;
  variant: ExperimentArmMetrics;
  startedAt: string;
  endedAt?: string;
  /** Defaults to 100 exposures for rate metrics and 10 sessions for revenue. */
  minimumSampleSize?: number;
  /** Practical minimum relative movement, e.g. 0.1 means 10%. */
  practicalDifference?: number;
}

export type ExperimentClassification =
  | "improvement_observed"
  | "decline_observed"
  | "difference_unclear"
  | "insufficient_data";

export interface ExperimentResult {
  experimentId: string;
  classification: ExperimentClassification;
  primaryMetric: ExperimentPrimaryMetric;
  baselineValue: number | null;
  variantValue: number | null;
  absoluteDelta: number | null;
  relativeDelta: number | null;
  baselineSample: number;
  variantSample: number;
  explanation: string;
  caution: string;
}

export interface AnalyticsInput {
  period: { start: string; end: string };
  connectorHealth: ConnectorHealth[];
  searchObservations: SearchObservation[];
  events: PerformanceEvent[];
  attributionModel?: AttributionModel;
}
