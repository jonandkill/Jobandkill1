// Historical observations are descriptive statistics, never an individual's admission probability.
export function observedAdmissionRate(row) {
  const { applicants, admitted, admissionCountVerified, applicantCountVerified } = row;
  if (!admissionCountVerified || !applicantCountVerified || !Number.isInteger(applicants) || applicants <= 0 || !Number.isInteger(admitted) || admitted < 0 || admitted > applicants) return null;
  return { percent: admitted / applicants * 100, numerator: admitted, denominator: applicants, label: '해당 연도 지원자 중 실제 합격 통보를 받은 비율', personalProbability: false };
}

export function groupOutcomeSeries(records) {
  const groups = new Map();
  for (const row of records) {
    const key = [row.universityId, row.program, row.track].join('|');
    if (!groups.has(key)) groups.set(key, { key, universityId: row.universityId, universityName: row.universityName, program: row.program, track: row.track, rows: [] });
    groups.get(key).rows.push(row);
  }
  return [...groups.values()].map(group => ({ ...group, rows: group.rows.sort((a,b) => a.academicYear-b.academicYear) }));
}

export function compareOutcomes(records, student = {}) {
  const rows = [...records].sort((a,b) => a.academicYear-b.academicYear);
  const identity = r => [r.universityId,r.program,r.track,r.metric,r.scale,r.formulaKey].join('|');
  const comparable = rows.length > 1 && new Set(rows.map(identity)).size === 1 && rows.every(r => r.formulaKey);
  const valid = rows.filter(r => Number.isFinite(r.grade70));
  const reasons = [];
  if (!comparable) reasons.push('대학·모집단위·전형·성적 산출 방식이 같은 자료끼리 비교해야 합니다.');
  const validGrade = Number.isFinite(student.grade) && student.grade >= 1 && student.grade <= Number(student.scale);
  const canCompareGrade = comparable && validGrade && String(student.scale) === String(rows[0]?.scale) && student.formulaKey === rows[0]?.formulaKey;
  if (Number.isFinite(student.grade) && !canCompareGrade) reasons.push('전체 평균 내신은 대학별 반영 성적과 다를 수 있습니다. 같은 산출 방식의 성적을 입력해야 차이를 계산합니다.');
  return {
    rows, comparable, years: [...new Set(rows.map(r=>r.academicYear))],
    grade70Range: comparable && valid.length ? { min:Math.min(...valid.map(r=>r.grade70)), max:Math.max(...valid.map(r=>r.grade70)) } : null,
    differences: canCompareGrade ? valid.map(r=>({academicYear:r.academicYear, difference:Math.round((student.grade-r.grade70)*100)/100})) : [],
    reasons, notes:[...new Set(rows.map(r=>r.comparabilityNote).filter(Boolean))],
    personalProbability:null,
    explanation:'70% 컷은 대학이 공시한 등록자 등 집단의 성적 지표입니다. 각 연도의 집계 대상을 확인하세요. 합격확률 70%를 뜻하지 않으며, 모집인원÷지원인원이나 예비번호로 개인 합격률을 계산하지 않습니다.'
  };
}
