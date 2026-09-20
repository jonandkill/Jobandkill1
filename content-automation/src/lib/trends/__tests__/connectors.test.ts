import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchNaverDataLabTrends,
  getGoogleTrendsCsvFallback,
  getNaverDataLabState,
  importGoogleTrendsCsv,
  validateNaverDataLabRequest,
} from "../index";

const validRequest = {
  startDate: "2026-01-01",
  endDate: "2026-01-31",
  timeUnit: "month" as const,
  keywordGroups: [{ groupName: "면접", keywords: ["면접 준비"] }],
};

test("Naver DataLab reports missing server credentials without calling the network", async () => {
  const result = await fetchNaverDataLabTrends(validRequest, { clientId: "", clientSecret: "" });
  assert.equal(result.status, "unconfigured");
  assert.equal(getNaverDataLabState({ clientId: "", clientSecret: "" }), "unconfigured");
});

test("Naver DataLab validates dates and group limits before a request", () => {
  const issues = validateNaverDataLabRequest({ ...validRequest, startDate: "2026-02-30", keywordGroups: [] });
  assert.equal(issues.length >= 2, true);
});

test("Naver DataLab maps a successful API response to connector types", async () => {
  const result = await fetchNaverDataLabTrends(validRequest, {
    clientId: "public-id",
    clientSecret: "private-secret",
    fetchImpl: async () => new Response(JSON.stringify({
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      timeUnit: "month",
      results: [{ title: "면접", keywords: ["면접 준비"], data: [{ period: "2026-01-01", ratio: 42.5 }] }],
    }), { status: 200 }),
  });
  assert.equal(result.status, "ok");
  if (result.status === "ok") assert.equal(result.data.series[0].data[0].ratio, 42.5);
});

test("Google Trends CSV supports metadata lines and relative <1 values", () => {
  const result = importGoogleTrendsCsv({
    csv: "Category: All categories\nMonth,\"면접 준비: (대한민국)\"\n2026-01,100\n2026-02,<1\n",
    keywords: ["면접 준비"],
  });
  assert.equal(result.status, "ok");
  if (result.status === "ok") {
    assert.equal(result.data.timeUnit, "month");
    assert.deepEqual(result.data.series[0].data[1], { period: "2026-02", ratio: 0.5 });
  }
  assert.equal(getGoogleTrendsCsvFallback().status, "manual-csv-required");
});
