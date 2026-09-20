import { importGoogleTrendsCsv, type GoogleTrendsCsvImportRequest } from "@/lib/trends";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ status: "invalid-csv", message: "JSON 요청 본문이 필요합니다." }, { status: 400 });
  }

  const result = importGoogleTrendsCsv(body as GoogleTrendsCsvImportRequest);
  return Response.json(result, { status: result.status === "ok" ? 200 : 400 });
}
