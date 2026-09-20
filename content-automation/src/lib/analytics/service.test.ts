import assert from "node:assert/strict";
import test from "node:test";

import { demoAnalyticsInput } from "./seed";
import {
  buildAnalyticsDashboard,
  buildAttributionCredits,
  classifyExperiment,
  generateImprovementRecommendations,
} from "./service";
import type { PerformanceEvent } from "./types";

test("dashboard keeps searches, funnel completions, refunds, and unassigned payments distinct", () => {
  const dashboard = buildAnalyticsDashboard(demoAnalyticsInput);
  const ai = dashboard.byContent.find((content) => content.contentId === "ai-interview-answer-practice");

  assert.equal(dashboard.overall.impressions.value, 3090);
  assert.equal(dashboard.overall.clicks.value, 76);
  assert.equal(dashboard.overall.funnel.sessions, 108);
  assert.equal(dashboard.overall.funnel.confirmedPayments, 2);
  assert.equal(dashboard.overall.funnel.netRevenue, 900000);
  assert.equal(dashboard.unassigned.confirmedPayments, 1);
  assert.equal(ai?.funnel.applicationRate.value, 1 / 40);
});

test("attribution uses chronological touchpoints rather than the import order", () => {
  const events: PerformanceEvent[] = [
    {
      id: "payment",
      eventType: "payment_confirmed",
      occurredAt: "2026-09-10T12:00:00.000Z",
      subjectKey: "visitor-1",
      amount: 600000,
    },
    {
      id: "first-session",
      eventType: "session",
      occurredAt: "2026-09-09T10:00:00.000Z",
      subjectKey: "visitor-1",
      contentId: "first-content",
    },
    {
      id: "last-session",
      eventType: "session",
      occurredAt: "2026-09-10T11:00:00.000Z",
      subjectKey: "visitor-1",
      contentId: "last-content",
    },
  ];

  const lastTouch = buildAttributionCredits(events, "last_touch");
  const linear = buildAttributionCredits(events, "linear");

  assert.deepEqual(lastTouch.map((credit) => credit.contentId), ["last-content"]);
  assert.equal(lastTouch[0]?.attributedAmount, 600000);
  assert.equal(linear.length, 2);
  assert.ok(linear.every((credit) => credit.credit === 0.5 && credit.attributedAmount === 300000));
});

test("recommendations make disconnected data and weak paths visible instead of inventing a result", () => {
  const dashboard = buildAnalyticsDashboard(demoAnalyticsInput);
  const recommendations = generateImprovementRecommendations(dashboard, {
    contentUpdatedAt: { "ai-interview-answer-practice": "2026-01-01T00:00:00.000Z" },
    now: "2026-09-20T00:00:00.000Z",
  });

  assert.ok(recommendations.some((item) => item.id === "connector:naver_blog"));
  assert.ok(recommendations.some((item) => item.id === "application:ai-interview-answer-practice"));
  assert.ok(recommendations.some((item) => item.id === "stale:ai-interview-answer-practice"));
});

test("experiment classification preserves an insufficient-data state", () => {
  const improvement = classifyExperiment({
    id: "headline-test",
    name: "제목 비교",
    hypothesis: "검색 질문을 제목에 넣으면 클릭률이 개선된다.",
    primaryMetric: "ctr",
    baseline: { impressions: 500, clicks: 10 },
    variant: { impressions: 500, clicks: 15 },
    startedAt: "2026-09-01T00:00:00.000Z",
  });
  const insufficient = classifyExperiment({
    id: "short-test",
    name: "짧은 비교",
    hypothesis: "실험 표본을 더 모은다.",
    primaryMetric: "application_rate",
    baseline: { sessions: 4, applications: 1 },
    variant: { sessions: 4, applications: 2 },
    startedAt: "2026-09-01T00:00:00.000Z",
  });

  assert.equal(improvement.classification, "improvement_observed");
  assert.equal(insufficient.classification, "insufficient_data");
});
