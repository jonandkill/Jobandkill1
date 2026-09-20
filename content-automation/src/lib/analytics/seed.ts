import type { AnalyticsInput, ConnectorHealth, PerformanceEvent, SearchObservation } from "./types";

/**
 * Explicitly mocked, privacy-safe records for local development and UI review.
 * They must not be presented as a connected account's live performance.
 */
export const demoConnectorHealth: ConnectorHealth[] = [
  {
    connector: "google_search_console",
    status: "connected",
    label: "Google Search Console",
    detail: "데모 수집값입니다. 실제 속성 연결 전에는 운영 수치로 사용하지 않습니다.",
    lastSuccessfulAt: "2026-09-20T01:10:00.000Z",
  },
  {
    connector: "naver_blog",
    status: "unconfigured",
    label: "네이버 블로그 통계",
    detail: "연결되지 않았습니다. 게시물별 검색 노출과 클릭률은 측정할 수 없습니다.",
  },
  {
    connector: "naver_datalab",
    status: "connected",
    label: "네이버 데이터랩",
    detail: "주제 추세용 연결입니다. 블로그 게시물의 검색 노출을 대신 측정하지 않습니다.",
    lastSuccessfulAt: "2026-09-20T00:40:00.000Z",
  },
  {
    connector: "manual",
    status: "connected",
    label: "상담·결제 확인 기록",
    detail: "데모 수기 입력 기록입니다. 결제 버튼 클릭과 확인 결제는 구분합니다.",
    lastSuccessfulAt: "2026-09-20T01:15:00.000Z",
  },
];

export const demoSearchObservations: SearchObservation[] = [
  {
    id: "search-ai-01",
    contentId: "ai-interview-answer-practice",
    observedOn: "2026-09-16T00:00:00.000Z",
    connector: "google_search_console",
    impressions: 1240,
    clicks: 16,
  },
  {
    id: "search-ai-02",
    contentId: "ai-interview-answer-practice",
    observedOn: "2026-09-17T00:00:00.000Z",
    connector: "google_search_console",
    impressions: 980,
    clicks: 11,
  },
  {
    id: "search-production-01",
    contentId: "production-interview-motivation",
    observedOn: "2026-09-16T00:00:00.000Z",
    connector: "google_search_console",
    impressions: 870,
    clicks: 49,
  },
];

export const demoPerformanceEvents: PerformanceEvent[] = [
  ...Array.from({ length: 40 }, (_, index) => ({
    id: `ai-session-${index + 1}`,
    eventType: "session" as const,
    occurredAt: `2026-09-${String(8 + (index % 10)).padStart(2, "0")}T03:00:00.000Z`,
    contentId: "ai-interview-answer-practice",
    subjectKey: `ai-visitor-${index + 1}`,
    source: "google_search_console" as const,
  })),
  {
    id: "ai-application-01",
    eventType: "application",
    occurredAt: "2026-09-18T04:00:00.000Z",
    contentId: "ai-interview-answer-practice",
    subjectKey: "ai-visitor-1",
    entityKey: "application-ai-001",
    source: "manual",
  },
  ...Array.from({ length: 48 }, (_, index) => ({
    id: `production-session-${index + 1}`,
    eventType: "session" as const,
    occurredAt: `2026-09-${String(8 + (index % 10)).padStart(2, "0")}T05:00:00.000Z`,
    contentId: "production-interview-motivation",
    subjectKey: `production-visitor-${index + 1}`,
    source: "google_search_console" as const,
  })),
  ...Array.from({ length: 5 }, (_, index) => ({
    id: `production-application-${index + 1}`,
    eventType: "application" as const,
    occurredAt: `2026-09-${String(17 + index).padStart(2, "0")}T05:30:00.000Z`,
    contentId: "production-interview-motivation",
    subjectKey: `production-visitor-${index + 1}`,
    entityKey: `application-production-${index + 1}`,
    source: "manual" as const,
  })),
  {
    id: "production-consultation-01",
    eventType: "consultation_completed",
    occurredAt: "2026-09-20T06:00:00.000Z",
    contentId: "production-interview-motivation",
    subjectKey: "production-visitor-1",
    entityKey: "consultation-production-001",
    source: "booking",
  },
  ...Array.from({ length: 20 }, (_, index) => ({
    id: `ulsan-session-${index + 1}`,
    eventType: "session" as const,
    occurredAt: `2026-09-${String(10 + (index % 9)).padStart(2, "0")}T07:00:00.000Z`,
    contentId: "ulsan-interview-consulting",
    subjectKey: `ulsan-visitor-${index + 1}`,
    source: "manual" as const,
  })),
  ...Array.from({ length: 2 }, (_, index) => ({
    id: `ulsan-application-${index + 1}`,
    eventType: "application" as const,
    occurredAt: `2026-09-${String(16 + index).padStart(2, "0")}T07:30:00.000Z`,
    contentId: "ulsan-interview-consulting",
    subjectKey: `ulsan-visitor-${index + 1}`,
    entityKey: `application-ulsan-${index + 1}`,
    source: "manual" as const,
  })),
  ...Array.from({ length: 2 }, (_, index) => ({
    id: `ulsan-consultation-${index + 1}`,
    eventType: "consultation_completed" as const,
    occurredAt: `2026-09-${String(18 + index).padStart(2, "0")}T08:00:00.000Z`,
    contentId: "ulsan-interview-consulting",
    subjectKey: `ulsan-visitor-${index + 1}`,
    entityKey: `consultation-ulsan-${index + 1}`,
    source: "booking" as const,
  })),
  {
    id: "ulsan-payment-01",
    eventType: "payment_confirmed",
    occurredAt: "2026-09-20T08:30:00.000Z",
    contentId: "ulsan-interview-consulting",
    subjectKey: "ulsan-visitor-1",
    entityKey: "payment-ulsan-001",
    amount: 600000,
    currency: "KRW",
    source: "payment",
  },
  {
    id: "offline-payment-unassigned",
    eventType: "payment_confirmed",
    occurredAt: "2026-09-20T09:00:00.000Z",
    entityKey: "payment-offline-001",
    amount: 300000,
    currency: "KRW",
    source: "payment",
  },
];

export const demoAnalyticsInput: AnalyticsInput = {
  period: {
    start: "2026-09-01T00:00:00.000Z",
    end: "2026-09-30T23:59:59.999Z",
  },
  connectorHealth: demoConnectorHealth,
  searchObservations: demoSearchObservations,
  events: demoPerformanceEvents,
  attributionModel: "last_touch",
};
