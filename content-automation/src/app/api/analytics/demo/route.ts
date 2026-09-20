import { buildAnalyticsDashboard, demoAnalyticsInput } from "@/lib/analytics";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    mode: "demo",
    message: "데모 데이터입니다. 연결된 실제 검색·상담·결제 자료가 아닙니다.",
    dashboard: buildAnalyticsDashboard(demoAnalyticsInput),
  });
}
