import type { NaverDataLabTrendRequest } from "./types";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isIsoCalendarDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Validates only documented request limits and never attempts to infer a keyword. */
export function validateNaverDataLabRequest(request: NaverDataLabTrendRequest): string[] {
  const issues: string[] = [];

  if (!isIsoCalendarDate(request.startDate)) {
    issues.push("startDate must be a valid YYYY-MM-DD date.");
  }
  if (!isIsoCalendarDate(request.endDate)) {
    issues.push("endDate must be a valid YYYY-MM-DD date.");
  }
  if (isIsoCalendarDate(request.startDate) && isIsoCalendarDate(request.endDate) && request.startDate > request.endDate) {
    issues.push("startDate must be on or before endDate.");
  }
  if (!["date", "week", "month"].includes(request.timeUnit)) {
    issues.push("timeUnit must be date, week, or month.");
  }
  if (!Array.isArray(request.keywordGroups) || request.keywordGroups.length < 1 || request.keywordGroups.length > 5) {
    issues.push("keywordGroups must contain between 1 and 5 groups.");
  }

  for (const [index, group] of request.keywordGroups.entries()) {
    if (!group || typeof group.groupName !== "string" || !group.groupName.trim()) {
      issues.push(`keywordGroups[${index}].groupName is required.`);
    }
    if (!Array.isArray(group?.keywords) || group.keywords.length < 1 || group.keywords.length > 20) {
      issues.push(`keywordGroups[${index}].keywords must contain between 1 and 20 keywords.`);
      continue;
    }
    for (const keyword of group.keywords) {
      if (typeof keyword !== "string" || !keyword.trim()) {
        issues.push(`keywordGroups[${index}] contains an empty keyword.`);
      }
    }
  }

  if (request.device && request.device !== "pc" && request.device !== "mo") {
    issues.push("device must be pc or mo when supplied.");
  }
  if (request.gender && request.gender !== "m" && request.gender !== "f") {
    issues.push("gender must be m or f when supplied.");
  }
  if (request.ages && (!Array.isArray(request.ages) || request.ages.some((age) => !/^([1-9]|1[01])$/.test(age)))) {
    issues.push("ages must contain Naver DataLab age codes 1 through 11.");
  }

  return issues;
}
