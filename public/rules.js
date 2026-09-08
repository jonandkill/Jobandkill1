function validGrade(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 9 ? number : null;
}

function fmt(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}

function top(values, count) {
  return [...values].sort((a, b) => a - b).slice(0, count);
}

function result(status, label, calculation, passed = null) {
  return { status, label, calculation, passed };
}

export function evaluateProgram(program, input) {
  if (!program.calculationReady || program.ruleCode === "REFERENCE_ONLY") {
    return result("reference", "상담자 확인", "정성평가·추천 자격 또는 세부 산출식을 함께 확인해야 하는 전형입니다.");
  }

  if (program.ruleCode === "NO_CSAT_MIN") {
    return result("no-min", "수능최저 없음", "2027학년도 공식 모집요강에서 수능최저학력기준 미적용을 확인했습니다.", true);
  }

  const k = validGrade(input.k);
  const m = validGrade(input.m);
  const e = validGrade(input.e);
  const h = validGrade(input.h);
  const t1 = validGrade(input.t1);
  const t2 = validGrade(input.t2);
  if ([k, m, e, h, t1, t2].some((value) => value === null)) {
    return result("missing", "추가 입력 필요", "국어·수학·영어·한국사·탐구 2과목 등급을 입력하면 판정합니다.");
  }

  if ([input.t1Type, input.t2Type].includes("vocational")) {
    return result("fail", "판정 범위 밖", "현재 검수된 규칙은 사회탐구 또는 과학탐구 응시자를 대상으로 합니다.", false);
  }

  const bestInquiry = Math.min(t1, t2);
  const inquiryAverage = (t1 + t2) / 2;
  const scienceGrades = [
    input.t1Type === "science" ? t1 : null,
    input.t2Type === "science" ? t2 : null
  ].filter((value) => value !== null);
  const skkuInquiry = scienceGrades.length
    ? Math.min(inquiryAverage, ...scienceGrades)
    : inquiryAverage;

  if (program.ruleCode === "HY_TOP3_7") {
    const selected = top([k, m, e, bestInquiry], 3);
    const sum = selected.reduce((total, value) => total + value, 0);
    return sum <= 7
      ? result("pass", "입력 기준 충족", `상위 3개 영역 등급합 ${fmt(sum)}로 기준 7 이내입니다.`, true)
      : result("fail", "입력 기준 미충족", `상위 3개 영역 등급합 ${fmt(sum)}로 기준 7을 초과합니다.`, false);
  }

  if (program.ruleCode === "HY_MED_TOP3_4") {
    const selected = top([k, m, e, inquiryAverage], 3);
    const sum = selected.reduce((total, value) => total + value, 0);
    return sum <= 4
      ? result("pass", "입력 기준 충족", `탐구 평균 ${fmt(inquiryAverage)}, 상위 3개 영역 등급합 ${fmt(sum)}로 기준 4 이내입니다.`, true)
      : result("fail", "입력 기준 미충족", `탐구 평균 ${fmt(inquiryAverage)}, 상위 3개 영역 등급합 ${fmt(sum)}로 기준 4를 초과합니다.`, false);
  }

  if (["SKKU_TOP3_6", "SKKU_TOP3_5"].includes(program.ruleCode)) {
    const limit = program.ruleCode.endsWith("_6") ? 6 : 5;
    const selected = top([k, m, e, skkuInquiry], 3);
    const sum = selected.reduce((total, value) => total + value, 0);
    return sum <= limit
      ? result("pass", "입력 기준 충족", `반영 탐구 ${fmt(skkuInquiry)}, 상위 3개 영역 등급합 ${fmt(sum)}로 기준 ${limit} 이내입니다.`, true)
      : result("fail", "입력 기준 미충족", `반영 탐구 ${fmt(skkuInquiry)}, 상위 3개 영역 등급합 ${fmt(sum)}로 기준 ${limit}을 초과합니다.`, false);
  }

  if (["SKKU_TOP3_6_MATH", "SKKU_TOP3_5_MATH"].includes(program.ruleCode)) {
    const limit = program.ruleCode.includes("_6_") ? 6 : 5;
    const otherTwo = top([k, e, skkuInquiry], 2);
    const sum = m + otherTwo.reduce((total, value) => total + value, 0);
    return sum <= limit
      ? result("pass", "입력 기준 충족", `수학을 포함한 상위 3개 영역 등급합 ${fmt(sum)}로 기준 ${limit} 이내입니다.`, true)
      : result("fail", "입력 기준 미충족", `수학을 포함한 상위 3개 영역 등급합 ${fmt(sum)}로 기준 ${limit}을 초과합니다.`, false);
  }

  if (program.ruleCode === "SKKU_ALL4_5") {
    const sum = k + m + e + skkuInquiry;
    return sum <= 5
      ? result("pass", "입력 기준 충족", `4개 영역 등급합 ${fmt(sum)}로 기준 5 이내입니다.`, true)
      : result("fail", "입력 기준 미충족", `4개 영역 등급합 ${fmt(sum)}로 기준 5를 초과합니다.`, false);
  }

  if (program.ruleCode === "SOGANG_TOP3_7_H4") {
    const selected = top([k, m, e, bestInquiry], 3);
    const sum = selected.reduce((total, value) => total + value, 0);
    const passed = sum <= 7 && h <= 4;
    return passed
      ? result("pass", "입력 기준 충족", `상위 3개 영역 등급합 ${fmt(sum)}, 한국사 ${h}등급으로 두 조건을 충족합니다.`, true)
      : result("fail", "입력 기준 미충족", `상위 3개 영역 등급합 ${fmt(sum)}(기준 7), 한국사 ${h}등급(기준 4)을 확인하세요.`, false);
  }

  return result("reference", "상담자 확인", "이 전형의 자동판정 규칙은 아직 공개하지 않았습니다.");
}
