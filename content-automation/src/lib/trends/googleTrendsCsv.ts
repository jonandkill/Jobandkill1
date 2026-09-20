import type {
  GoogleTrendsCsvFallback,
  GoogleTrendsCsvImportRequest,
  GoogleTrendsCsvResult,
  TrendDataset,
  TrendPoint,
} from "./types";

/** A deliberate fallback: Google Trends data is imported from a user-exported CSV. */
export function getGoogleTrendsCsvFallback(): GoogleTrendsCsvFallback {
  return {
    status: "manual-csv-required",
    message: "Export CSV from Google Trends and import it here. No Google account credentials are stored or requested.",
    importFormat: "google-trends-csv",
  };
}

function parseCsv(raw: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < raw.length; index += 1) {
    const character = raw[index];
    if (character === '"') {
      if (quoted && raw[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(field.trim());
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && raw[index + 1] === "\n") index += 1;
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function looksLikeTimelineHeader(value: string): boolean {
  return ["day", "week", "month", "date", "time", "일", "주", "월", "날짜", "시간"].includes(value.trim().toLowerCase());
}

function parseRatio(value: string): number | null {
  const normalized = value.trim().replace(/,/g, "");
  if (!normalized || normalized === "<1") return normalized === "<1" ? 0.5 : null;
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

function inferTimeUnit(header: string): TrendDataset["timeUnit"] | undefined {
  const normalized = header.trim().toLowerCase();
  if (normalized === "day" || normalized === "일") return "date";
  if (normalized === "week" || normalized === "주") return "week";
  if (normalized === "month" || normalized === "월") return "month";
  return undefined;
}

function periodBounds(series: TrendPoint[]): Pick<TrendDataset, "startDate" | "endDate"> {
  const periods = series.map((point) => point.period).filter(Boolean);
  return { startDate: periods[0], endDate: periods.at(-1) };
}

/**
 * Parses a CSV exported from Google Trends. Values are relative interest scores
 * from that export, not absolute search volume.
 */
export function importGoogleTrendsCsv(request: GoogleTrendsCsvImportRequest): GoogleTrendsCsvResult {
  if (typeof request.csv !== "string" || !request.csv.trim()) {
    return { status: "invalid-csv", message: "A non-empty Google Trends CSV is required.", issues: ["csv is empty."] };
  }

  const rows = parseCsv(request.csv.replace(/^\uFEFF/, ""));
  const headerIndex = rows.findIndex((row) => row.length >= 2 && looksLikeTimelineHeader(row[0] ?? ""));
  if (headerIndex < 0) {
    return {
      status: "invalid-csv",
      message: "The CSV does not contain a Google Trends timeline header.",
      issues: ["Expected a Day, Week, Month, Date, Time, 일, 주, 월, 날짜, or 시간 first column."],
    };
  }

  const header = rows[headerIndex];
  const dataRows = rows.slice(headerIndex + 1).filter((row) => row[0]);
  if (!dataRows.length) {
    return { status: "invalid-csv", message: "The CSV contains no timeline rows.", issues: ["No rows follow the timeline header."] };
  }

  const series = header.slice(1).map((label, columnIndex) => {
    const data = dataRows.map((row) => ({ period: row[0], ratio: parseRatio(row[columnIndex + 1] ?? "") }));
    return {
      groupName: request.keywords?.[columnIndex]?.trim() || label || `Keyword ${columnIndex + 1}`,
      keywords: [request.keywords?.[columnIndex]?.trim() || label || `Keyword ${columnIndex + 1}`],
      data,
    };
  });

  if (!series.length) {
    return { status: "invalid-csv", message: "The CSV has no keyword columns.", issues: ["At least one column after the timeline column is required."] };
  }

  const bounds = periodBounds(series[0].data);
  return {
    status: "ok",
    data: {
      source: "google-trends-csv",
      timeUnit: inferTimeUnit(header[0]),
      ...bounds,
      series,
    },
  };
}
