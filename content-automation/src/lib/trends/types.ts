/**
 * Server-side contracts shared by the trend data connectors.
 * Connector results deliberately carry a state instead of throwing for normal
 * operational conditions such as missing credentials or an invalid CSV file.
 */

export type TrendTimeUnit = "date" | "week" | "month";

export interface TrendKeywordGroup {
  groupName: string;
  keywords: string[];
}

export interface NaverDataLabTrendRequest {
  startDate: string;
  endDate: string;
  timeUnit: TrendTimeUnit;
  keywordGroups: TrendKeywordGroup[];
  device?: "pc" | "mo";
  ages?: string[];
  gender?: "m" | "f";
}

export interface TrendPoint {
  period: string;
  ratio: number | null;
}

export interface TrendSeries {
  groupName: string;
  keywords: string[];
  data: TrendPoint[];
}

export interface TrendDataset {
  source: "naver-datalab" | "google-trends-csv";
  startDate?: string;
  endDate?: string;
  timeUnit?: TrendTimeUnit;
  series: TrendSeries[];
}

export interface ConnectorUnavailable {
  status: "unconfigured";
  message: string;
}

export interface ConnectorInvalidRequest {
  status: "invalid-request";
  message: string;
  issues: string[];
}

export interface ConnectorFailure {
  status: "request-failed";
  message: string;
  httpStatus?: number;
}

export interface ConnectorSuccess {
  status: "ok";
  data: TrendDataset;
}

export type NaverDataLabResult =
  | ConnectorUnavailable
  | ConnectorInvalidRequest
  | ConnectorFailure
  | ConnectorSuccess;

export interface NaverDataLabConfig {
  clientId?: string;
  clientSecret?: string;
  endpoint?: string;
  fetchImpl?: typeof fetch;
}

export interface GoogleTrendsCsvImportRequest {
  csv: string;
  keywords?: string[];
}

export interface GoogleTrendsCsvSuccess {
  status: "ok";
  data: TrendDataset;
}

export interface GoogleTrendsCsvInvalid {
  status: "invalid-csv";
  message: string;
  issues: string[];
}

export type GoogleTrendsCsvResult = GoogleTrendsCsvSuccess | GoogleTrendsCsvInvalid;

export interface GoogleTrendsCsvFallback {
  status: "manual-csv-required";
  message: string;
  importFormat: "google-trends-csv";
}
