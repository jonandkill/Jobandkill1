import type {
  AnalyticsDashboard,
  AnalyticsInput,
  AttributionCredit,
  AttributionModel,
  ConnectorHealth,
  ExperimentArmMetrics,
  ExperimentInput,
  ExperimentPrimaryMetric,
  ExperimentResult,
  FunnelMetrics,
  ImprovementRecommendation,
  ImprovementThresholds,
  MetricAvailability,
  MetricValue,
  PerformanceEvent,
  PerformanceEventType,
  SearchObservation,
} from "./types";

const DEFAULT_THRESHOLDS: ImprovementThresholds = {
  minImpressionsForCtrReview: 100,
  lowCtr: 0.02,
  minSessionsForConversionReview: 30,
  lowApplicationRate: 0.03,
  lowConsultationRate: 0.4,
  lowPaymentRate: 0.3,
  staleAfterDays: 180,
};

const SEARCH_PERFORMANCE_CONNECTORS = new Set([
  "google_search_console",
  "naver_blog",
]);

const CONVERSION_TYPES = new Set<PerformanceEventType>([
  "application",
  "consultation_completed",
  "payment_confirmed",
  "refund_confirmed",
]);

function finite(value: number | undefined | null): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function eventKey(event: PerformanceEvent): string {
  return `${event.eventType}:${event.entityKey ?? event.id}`;
}

function uniqueEvents(events: PerformanceEvent[]): PerformanceEvent[] {
  const seen = new Set<string>();
  return events.filter((event) => {
    const key = eventKey(event);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dateInPeriod(value: string, start: string, end: string): boolean {
  const timestamp = Date.parse(value);
  const startAt = Date.parse(start);
  const endAt = Date.parse(end);
  return (
    Number.isFinite(timestamp) &&
    Number.isFinite(startAt) &&
    Number.isFinite(endAt) &&
    timestamp >= startAt &&
    timestamp <= endAt
  );
}

function rate(numerator: number, denominator: number): MetricValue {
  if (denominator <= 0) {
    return { value: null, availability: "insufficient_data", denominator };
  }
  return { value: numerator / denominator, availability: "available", denominator };
}

function countEvents(events: PerformanceEvent[], eventType: PerformanceEventType): number {
  return events.filter((event) => event.eventType === eventType).length;
}

function eventAmount(events: PerformanceEvent[], eventType: PerformanceEventType): number {
  return events
    .filter((event) => event.eventType === eventType)
    .reduce((total, event) => total + (finite(event.amount) ?? 0), 0);
}

function aggregateFunnel(events: PerformanceEvent[]): FunnelMetrics {
  const sessions = countEvents(events, "session");
  const applications = countEvents(events, "application");
  const consultations = countEvents(events, "consultation_completed");
  const confirmedPayments = countEvents(events, "payment_confirmed");
  const refunds = countEvents(events, "refund_confirmed");
  const grossRevenue = eventAmount(events, "payment_confirmed");
  const refundAmount = eventAmount(events, "refund_confirmed");

  return {
    sessions,
    applications,
    consultations,
    confirmedPayments,
    refunds,
    grossRevenue,
    refundAmount,
    netRevenue: grossRevenue - refundAmount,
    applicationRate: rate(applications, sessions),
    consultationRate: rate(consultations, applications),
    paymentRate: rate(confirmedPayments, consultations),
    refundRate: rate(refunds, confirmedPayments),
  };
}

function searchAvailability(
  observations: SearchObservation[],
  health: ConnectorHealth[],
): MetricAvailability {
  if (observations.length > 0) return "available";

  const relevant = health.filter((item) => SEARCH_PERFORMANCE_CONNECTORS.has(item.connector));
  if (relevant.length > 0 && relevant.every((item) => item.status === "unconfigured")) {
    return "not_configured";
  }
  return "not_available";
}

function aggregateSearch(
  observations: SearchObservation[],
  health: ConnectorHealth[],
): { impressions: MetricValue; clicks: MetricValue; ctr: MetricValue } {
  const availability = searchAvailability(observations, health);
  const impressionValues = observations
    .map((item) => finite(item.impressions))
    .filter((value): value is number => value !== null);
  const clickValues = observations
    .map((item) => finite(item.clicks))
    .filter((value): value is number => value !== null);

  const impressions =
    impressionValues.length > 0
      ? { value: impressionValues.reduce((total, value) => total + value, 0), availability: "available" as const }
      : { value: null, availability };
  const clicks =
    clickValues.length > 0
      ? { value: clickValues.reduce((total, value) => total + value, 0), availability: "available" as const }
      : { value: null, availability };

  if (impressions.value === null || clicks.value === null) {
    return {
      impressions,
      clicks,
      ctr: { value: null, availability: impressions.availability === "not_configured" ? "not_configured" : "not_available" },
    };
  }
  if (impressions.value <= 0) {
    return {
      impressions,
      clicks,
      ctr: { value: null, availability: "insufficient_data", denominator: impressions.value },
    };
  }

  return { impressions, clicks, ctr: rate(clicks.value, impressions.value) };
}

/**
 * Assigns a conversion only to touchpoints backed by an explicit `contentId`.
 * Events that do not carry a privacy-safe subject key are never guessed from a
 * similar name, date, or amount.
 */
export function buildAttributionCredits(
  events: PerformanceEvent[],
  model: AttributionModel = "last_touch",
): AttributionCredit[] {
  const unique = uniqueEvents(events);
  const credits: AttributionCredit[] = [];

  for (const conversion of unique.filter((event) => CONVERSION_TYPES.has(event.eventType))) {
    const conversionType = conversion.eventType as AttributionCredit["conversionType"];
    const conversionAt = Date.parse(conversion.occurredAt);
    if (!Number.isFinite(conversionAt)) continue;

    const touchpoints: Array<{ contentId: string; occurredAt: number }> = [];
    if (conversion.subjectKey) {
      for (const touchpoint of unique) {
        const occurredAt = Date.parse(touchpoint.occurredAt);
        if (
          touchpoint.subjectKey === conversion.subjectKey &&
          touchpoint.contentId &&
          Number.isFinite(occurredAt) &&
          occurredAt <= conversionAt
        ) {
          touchpoints.push({ contentId: touchpoint.contentId, occurredAt });
        }
      }
    }
    if (touchpoints.length === 0 && conversion.contentId) {
      touchpoints.push({ contentId: conversion.contentId, occurredAt: conversionAt });
    }
    if (touchpoints.length === 0) continue;

    touchpoints.sort((left, right) => left.occurredAt - right.occurredAt);
    const orderedContentIds = [...new Set(touchpoints.map((touchpoint) => touchpoint.contentId))];
    const chosen =
      model === "first_touch"
        ? [orderedContentIds[0]]
        : model === "last_touch"
          ? [orderedContentIds[orderedContentIds.length - 1]]
          : orderedContentIds;
    const credit = 1 / chosen.length;
    const amount = finite(conversion.amount) ?? 0;

    for (const contentId of chosen) {
      credits.push({
        conversionEventId: conversion.id,
        conversionType,
        conversionAt: conversion.occurredAt,
        contentId,
        model,
        credit,
        attributedAmount: amount * credit,
      });
    }
  }

  return credits;
}

function attributionForContent(credits: AttributionCredit[], contentId?: string) {
  const relevant = contentId ? credits.filter((credit) => credit.contentId === contentId) : credits;
  const total = (conversionType: AttributionCredit["conversionType"]) =>
    relevant
      .filter((credit) => credit.conversionType === conversionType)
      .reduce((sum, credit) => sum + credit.credit, 0);
  const amount = (conversionType: AttributionCredit["conversionType"]) =>
    relevant
      .filter((credit) => credit.conversionType === conversionType)
      .reduce((sum, credit) => sum + credit.attributedAmount, 0);

  return {
    applications: total("application"),
    consultations: total("consultation_completed"),
    confirmedPayments: total("payment_confirmed"),
    refunds: total("refund_confirmed"),
    attributedRevenue: amount("payment_confirmed"),
    attributedRefundAmount: amount("refund_confirmed"),
  };
}

function contentMetrics(
  contentId: string,
  observations: SearchObservation[],
  events: PerformanceEvent[],
  health: ConnectorHealth[],
  credits: AttributionCredit[],
) {
  const search = aggregateSearch(observations, health);
  return {
    contentId,
    ...search,
    funnel: aggregateFunnel(events),
    attribution: attributionForContent(credits, contentId === "__overall__" ? undefined : contentId),
  };
}

export function buildAnalyticsDashboard(input: AnalyticsInput): AnalyticsDashboard {
  const events = uniqueEvents(
    input.events.filter((event) => dateInPeriod(event.occurredAt, input.period.start, input.period.end)),
  );
  const observations = input.searchObservations.filter((observation) =>
    dateInPeriod(observation.observedOn, input.period.start, input.period.end),
  );
  const credits = buildAttributionCredits(events, input.attributionModel);
  const contentIds = new Set<string>();
  observations.forEach((item) => contentIds.add(item.contentId));
  events.forEach((item) => item.contentId && contentIds.add(item.contentId));
  credits.forEach((item) => contentIds.add(item.contentId));

  return {
    generatedAt: new Date().toISOString(),
    period: input.period,
    connectorHealth: input.connectorHealth,
    overall: contentMetrics("__overall__", observations, events, input.connectorHealth, credits),
    byContent: [...contentIds]
      .sort((left, right) => left.localeCompare(right))
      .map((contentId) =>
        contentMetrics(
          contentId,
          observations.filter((item) => item.contentId === contentId),
          events.filter((item) => item.contentId === contentId),
          input.connectorHealth,
          credits,
        ),
      ),
    unassigned: aggregateFunnel(events.filter((event) => !event.contentId)),
  };
}

export function generateImprovementRecommendations(
  dashboard: AnalyticsDashboard,
  options: {
    thresholds?: Partial<ImprovementThresholds>;
    contentUpdatedAt?: Record<string, string | undefined>;
    now?: string;
  } = {},
): ImprovementRecommendation[] {
  const thresholds = { ...DEFAULT_THRESHOLDS, ...options.thresholds };
  const recommendations: ImprovementRecommendation[] = [];

  for (const connector of dashboard.connectorHealth) {
    if (connector.status === "unconfigured" || connector.status === "error") {
      recommendations.push({
        id: `connector:${connector.connector}`,
        kind: "connect_data",
        priority: "high",
        score: connector.status === "error" ? 98 : 90,
        title: `${connector.label} ${connector.status === "error" ? "연결 오류 확인" : "연결 설정 필요"}`,
        reason: connector.detail,
        proposedAction: "연결 설정에서 인증 상태를 확인한 뒤, 성공한 수집 시각과 수집 범위를 확인합니다.",
        evidence: [
          { metric: "연결 상태", value: connector.status },
          { metric: "마지막 성공", value: connector.lastSuccessfulAt ?? "없음" },
        ],
      });
    }
  }

  const now = Date.parse(options.now ?? dashboard.generatedAt);
  for (const content of dashboard.byContent) {
    const { funnel } = content;
    if (
      content.impressions.value !== null &&
      content.ctr.value !== null &&
      content.impressions.value >= thresholds.minImpressionsForCtrReview &&
      content.ctr.value < thresholds.lowCtr
    ) {
      recommendations.push({
        id: `ctr:${content.contentId}`,
        contentId: content.contentId,
        kind: "improve_search_snippet",
        priority: "high",
        score: 80 + Math.min(15, Math.round(content.impressions.value / 1000)),
        title: "노출 대비 클릭이 낮아 제목과 도입부 점검",
        reason: "검색 노출은 충분하지만 클릭률이 내부 점검 기준보다 낮습니다.",
        proposedAction: "제목이 검색 질문에 직접 답하는지, 도입 첫 문단이 제목의 약속을 바로 이행하는지 검토합니다.",
        evidence: [
          { metric: "검색 노출", value: content.impressions.value },
          { metric: "검색 클릭률", value: content.ctr.value, note: `기준 ${thresholds.lowCtr}` },
        ],
      });
    }

    if (
      funnel.sessions >= thresholds.minSessionsForConversionReview &&
      funnel.applicationRate.value !== null &&
      funnel.applicationRate.value < thresholds.lowApplicationRate
    ) {
      recommendations.push({
        id: `application:${content.contentId}`,
        contentId: content.contentId,
        kind: "strengthen_content_to_offer_path",
        priority: "high",
        score: 88,
        title: "유입 대비 신청 경로 보강",
        reason: "방문 세션은 있으나 상담·자료 신청 완료 비율이 낮습니다.",
        proposedAction: "글의 해결 내용과 맞는 대표 행동 하나를 정하고, 신청 전 필요한 정보와 얻는 결과를 짧게 명시합니다.",
        evidence: [
          { metric: "세션", value: funnel.sessions },
          { metric: "신청률", value: funnel.applicationRate.value, note: `기준 ${thresholds.lowApplicationRate}` },
        ],
      });
    }

    if (
      funnel.applications > 0 &&
      funnel.consultationRate.value !== null &&
      funnel.consultationRate.value < thresholds.lowConsultationRate
    ) {
      recommendations.push({
        id: `consultation:${content.contentId}`,
        contentId: content.contentId,
        kind: "reduce_application_friction",
        priority: "medium",
        score: 66,
        title: "신청 후 상담 완료 과정 점검",
        reason: "신청은 발생하지만 실제 상담 완료 전환이 낮습니다.",
        proposedAction: "예약 가능 시간, 자동 안내, 연락 시점, 중복·미응답 처리 기록을 먼저 점검합니다.",
        evidence: [
          { metric: "신청 완료", value: funnel.applications },
          { metric: "상담 완료율", value: funnel.consultationRate.value, note: `기준 ${thresholds.lowConsultationRate}` },
        ],
      });
    }

    if (
      funnel.consultations > 0 &&
      funnel.paymentRate.value !== null &&
      funnel.paymentRate.value < thresholds.lowPaymentRate
    ) {
      recommendations.push({
        id: `payment:${content.contentId}`,
        contentId: content.contentId,
        kind: "review_offer_fit",
        priority: "medium",
        score: 58,
        title: "상담과 상품 제안의 적합성 확인",
        reason: "상담 완료 기록은 있으나 확인 결제로 이어지는 비율이 낮습니다.",
        proposedAction: "상담 메모를 익명화해 고객의 문제·상품 범위·가격·일정의 불일치를 먼저 분류합니다.",
        evidence: [
          { metric: "상담 완료", value: funnel.consultations },
          { metric: "결제 전환율", value: funnel.paymentRate.value, note: `기준 ${thresholds.lowPaymentRate}` },
        ],
      });
    }

    const updatedAt = options.contentUpdatedAt?.[content.contentId];
    const updatedTimestamp = updatedAt ? Date.parse(updatedAt) : Number.NaN;
    if (Number.isFinite(now) && Number.isFinite(updatedTimestamp)) {
      const daysSinceUpdate = Math.floor((now - updatedTimestamp) / 86_400_000);
      if (daysSinceUpdate >= thresholds.staleAfterDays) {
        recommendations.push({
          id: `stale:${content.contentId}`,
          contentId: content.contentId,
          kind: "refresh_stale_content",
          priority: "low",
          score: 35 + Math.min(20, Math.floor(daysSinceUpdate / 30)),
          title: "오래된 콘텐츠의 공식 정보 갱신 확인",
          reason: "내용이 마지막으로 갱신된 지 내부 기준 기간이 지났습니다.",
          proposedAction: "일정·가격·기업 정보처럼 변동 가능성이 큰 주장부터 원문과 확인일을 다시 점검합니다.",
          evidence: [
            { metric: "마지막 갱신 이후 일수", value: daysSinceUpdate },
            { metric: "갱신 기준 일수", value: thresholds.staleAfterDays },
          ],
        });
      }
    }
  }

  return recommendations.sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
}

function experimentMetric(arm: ExperimentArmMetrics, metric: ExperimentPrimaryMetric): number | null {
  switch (metric) {
    case "ctr":
      return arm.impressions && arm.impressions > 0 && arm.clicks !== undefined
        ? arm.clicks / arm.impressions
        : null;
    case "application_rate":
      return arm.sessions && arm.sessions > 0 && arm.applications !== undefined
        ? arm.applications / arm.sessions
        : null;
    case "consultation_rate":
      return arm.applications && arm.applications > 0 && arm.consultations !== undefined
        ? arm.consultations / arm.applications
        : null;
    case "payment_rate":
      return arm.consultations && arm.consultations > 0 && arm.confirmedPayments !== undefined
        ? arm.confirmedPayments / arm.consultations
        : null;
    case "net_revenue":
      return finite(arm.netRevenue);
  }
}

function experimentSample(arm: ExperimentArmMetrics, metric: ExperimentPrimaryMetric): number {
  switch (metric) {
    case "ctr":
      return finite(arm.impressions) ?? 0;
    case "application_rate":
      return finite(arm.sessions) ?? 0;
    case "consultation_rate":
      return finite(arm.applications) ?? 0;
    case "payment_rate":
      return finite(arm.consultations) ?? 0;
    case "net_revenue":
      return finite(arm.sessions) ?? 0;
  }
}

/**
 * Classifies observed results using a declared practical threshold.  It does
 * not present a before/after movement as causal or statistically significant.
 */
export function classifyExperiment(input: ExperimentInput): ExperimentResult {
  const baselineValue = experimentMetric(input.baseline, input.primaryMetric);
  const variantValue = experimentMetric(input.variant, input.primaryMetric);
  const baselineSample = experimentSample(input.baseline, input.primaryMetric);
  const variantSample = experimentSample(input.variant, input.primaryMetric);
  const minimumSampleSize = input.minimumSampleSize ?? (input.primaryMetric === "net_revenue" ? 10 : 100);
  const practicalDifference = input.practicalDifference ?? 0.1;

  if (
    baselineValue === null ||
    variantValue === null ||
    baselineSample < minimumSampleSize ||
    variantSample < minimumSampleSize
  ) {
    return {
      experimentId: input.id,
      classification: "insufficient_data",
      primaryMetric: input.primaryMetric,
      baselineValue,
      variantValue,
      absoluteDelta: baselineValue !== null && variantValue !== null ? variantValue - baselineValue : null,
      relativeDelta: null,
      baselineSample,
      variantSample,
      explanation: "지정한 비교 지표 또는 최소 표본을 아직 확보하지 못했습니다.",
      caution: "판단 보류 상태이며, 기간·채널·변경 내용을 유지한 채 추가 관측이 필요합니다.",
    };
  }

  const absoluteDelta = variantValue - baselineValue;
  const relativeDelta = baselineValue === 0 ? null : absoluteDelta / Math.abs(baselineValue);
  let classification: ExperimentResult["classification"] = "difference_unclear";
  if (relativeDelta === null) {
    if (variantValue > baselineValue) classification = "improvement_observed";
    if (variantValue < baselineValue) classification = "decline_observed";
  } else if (relativeDelta >= practicalDifference) {
    classification = "improvement_observed";
  } else if (relativeDelta <= -practicalDifference) {
    classification = "decline_observed";
  }

  const explanation =
    classification === "improvement_observed"
      ? "변형안에서 내부 실무 기준 이상의 개선 관측값이 확인되었습니다."
      : classification === "decline_observed"
        ? "변형안에서 내부 실무 기준 이상의 악화 관측값이 확인되었습니다."
        : "내부 실무 기준을 넘는 차이는 뚜렷하지 않습니다.";

  return {
    experimentId: input.id,
    classification,
    primaryMetric: input.primaryMetric,
    baselineValue,
    variantValue,
    absoluteDelta,
    relativeDelta,
    baselineSample,
    variantSample,
    explanation,
    caution:
      "분류는 표본·기간·동시 변경 요인을 통제한 인과 추정이 아닙니다. 공고, 광고, 계절성, 채널 구성 변화를 함께 기록해야 합니다.",
  };
}

export { DEFAULT_THRESHOLDS };
