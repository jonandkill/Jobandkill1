import { validateNaverDataLabRequest } from "./validation";
import type {
  NaverDataLabConfig,
  NaverDataLabResult,
  NaverDataLabTrendRequest,
  TrendDataset,
} from "./types";

const NAVER_DATALAB_ENDPOINT = "https://openapi.naver.com/v1/datalab/search";

type NaverApiResponse = {
  startDate?: string;
  endDate?: string;
  timeUnit?: TrendDataset["timeUnit"];
  results?: Array<{
    title?: string;
    keywords?: string[];
    data?: Array<{ period?: string; ratio?: number }>;
  }>;
};

function getProcessEnv(): Record<string, string | undefined> {
  const runtime = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  };
  return runtime.process?.env ?? {};
}

/** Reads only server environment variables; callers can inject config in tests. */
export function getNaverDataLabConfig(overrides: NaverDataLabConfig = {}): NaverDataLabConfig {
  const env = getProcessEnv();
  return {
    clientId: overrides.clientId ?? env.NAVER_DATALAB_CLIENT_ID,
    clientSecret: overrides.clientSecret ?? env.NAVER_DATALAB_CLIENT_SECRET,
    endpoint: overrides.endpoint ?? NAVER_DATALAB_ENDPOINT,
    fetchImpl: overrides.fetchImpl ?? globalThis.fetch,
  };
}

export function getNaverDataLabState(config: NaverDataLabConfig = {}): "configured" | "unconfigured" {
  const resolved = getNaverDataLabConfig(config);
  return resolved.clientId && resolved.clientSecret ? "configured" : "unconfigured";
}

function toApiPayload(request: NaverDataLabTrendRequest): Record<string, unknown> {
  return {
    startDate: request.startDate,
    endDate: request.endDate,
    timeUnit: request.timeUnit,
    keywordGroups: request.keywordGroups.map((group) => ({
      groupName: group.groupName.trim(),
      keywords: group.keywords.map((keyword) => keyword.trim()),
    })),
    ...(request.device ? { device: request.device } : {}),
    ...(request.ages?.length ? { ages: request.ages } : {}),
    ...(request.gender ? { gender: request.gender } : {}),
  };
}

function toDataset(raw: NaverApiResponse, request: NaverDataLabTrendRequest): TrendDataset {
  return {
    source: "naver-datalab",
    startDate: raw.startDate ?? request.startDate,
    endDate: raw.endDate ?? request.endDate,
    timeUnit: raw.timeUnit ?? request.timeUnit,
    series: (raw.results ?? []).map((result, index) => ({
      groupName: result.title ?? request.keywordGroups[index]?.groupName ?? `Group ${index + 1}`,
      keywords: result.keywords ?? request.keywordGroups[index]?.keywords ?? [],
      data: (result.data ?? []).map((point) => ({
        period: point.period ?? "",
        ratio: typeof point.ratio === "number" ? point.ratio : null,
      })),
    })),
  };
}

async function responseMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { errorMessage?: string; message?: string };
    return body.errorMessage || body.message || `Naver DataLab returned HTTP ${response.status}.`;
  } catch {
    return `Naver DataLab returned HTTP ${response.status}.`;
  }
}

/**
 * Queries Naver Search Trend DataLab. It never exposes credentials and returns
 * a state object for expected integration failures.
 */
export async function fetchNaverDataLabTrends(
  request: NaverDataLabTrendRequest,
  config: NaverDataLabConfig = {},
): Promise<NaverDataLabResult> {
  const issues = validateNaverDataLabRequest(request);
  if (issues.length) {
    return { status: "invalid-request", message: "Naver DataLab request is invalid.", issues };
  }

  const resolved = getNaverDataLabConfig(config);
  if (!resolved.clientId || !resolved.clientSecret) {
    return {
      status: "unconfigured",
      message: "Set NAVER_DATALAB_CLIENT_ID and NAVER_DATALAB_CLIENT_SECRET in the server environment to enable Naver DataLab.",
    };
  }
  if (!resolved.fetchImpl) {
    return { status: "request-failed", message: "No server fetch implementation is available." };
  }

  try {
    const response = await resolved.fetchImpl(resolved.endpoint ?? NAVER_DATALAB_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Naver-Client-Id": resolved.clientId,
        "X-Naver-Client-Secret": resolved.clientSecret,
      },
      body: JSON.stringify(toApiPayload(request)),
    });
    if (!response.ok) {
      return { status: "request-failed", message: await responseMessage(response), httpStatus: response.status };
    }
    const raw = (await response.json()) as NaverApiResponse;
    return { status: "ok", data: toDataset(raw, request) };
  } catch {
    return {
      status: "request-failed",
      message: "Naver DataLab could not be reached. Check the server network and API configuration.",
    };
  }
}
