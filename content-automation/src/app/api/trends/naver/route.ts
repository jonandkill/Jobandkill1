import { fetchNaverDataLabTrends, type NaverDataLabTrendRequest } from "@/lib/trends";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ status: "invalid-request", message: "JSON 요청 본문이 필요합니다." }, { status: 400 });
  }

  const result = await fetchNaverDataLabTrends(body as NaverDataLabTrendRequest);
  const status =
    result.status === "ok" || result.status === "unconfigured" ? 200 :
      result.status === "invalid-request" ? 400 : 502;

  return Response.json(result, { status });
}
