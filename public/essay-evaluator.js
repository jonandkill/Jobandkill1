/** Local practice feedback. Text evidence is not a semantic correctness score. */
const normalise = value => String(value ?? '').normalize('NFKC').trim();
const readableSentences = answer => answer.split(/(?<=[.!?。！？])\s*|\n+/u).map(x => x.trim()).filter(Boolean);
const contains = (text, word) => text.toLocaleLowerCase('ko').includes(word.toLocaleLowerCase('ko'));
const sentenceLike = text => text.length >= 18 && /(?:다[.!?。]?\s*$|니다|때문|므로|따라서|반면|그러나|하면|지만|이어야|이다|있다|없다|=|⇒|→)/u.test(text);

/** Supports finite arithmetic only; never evaluates JavaScript or arbitrary code. */
export function parseNumericExpression(input) {
  const source = normalise(input).replace(/[−–]/g, '-').replace(/[×·]/g, '*').replace(/÷/g, '/').replace(/\s/g, '');
  if (!source || source.length > 120 || !/^[\d.+\-*/^()sqrt√]+$/i.test(source)) return null;
  const tokens = source.match(/sqrt|√|(?:\d+(?:\.\d*)?|\.\d+)|[()+\-*/^]/gi) || [];
  if (tokens.join('').toLowerCase() !== source.toLowerCase() || tokens.length > 80) return null;
  let at = 0, depth = 0;
  const guard = value => { if (!Number.isFinite(value) || Math.abs(value) > 1e100) throw Error('range'); return value; };
  function primary() {
    if (++depth > 20) throw Error('depth');
    const token = tokens[at++]; let value;
    if (token === '(') { value = sum(); if (tokens[at++] !== ')') throw Error('parentheses'); }
    else if (/^(sqrt|√)$/i.test(token || '')) { value = Math.sqrt(primary()); }
    else if (/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(token || '')) value = Number(token);
    else throw Error('number');
    depth--; return guard(value);
  }
  function power() { let value = primary(); if (tokens[at] === '^') { at++; value = Math.pow(value, unary()); } return guard(value); }
  function unary() { if (tokens[at] === '+') { at++; return unary(); } if (tokens[at] === '-') { at++; return -unary(); } return power(); }
  function product() { let value = unary(); while (tokens[at] === '*' || tokens[at] === '/') { const op = tokens[at++], next = unary(); value = op === '*' ? value * next : value / next; guard(value); } return value; }
  function sum() { let value = product(); while (tokens[at] === '+' || tokens[at] === '-') { const op = tokens[at++], next = product(); value = op === '+' ? value + next : value - next; guard(value); } return value; }
  try { const value = sum(); return at === tokens.length ? guard(value) : null; } catch { return null; }
}

export function evaluateNumericAnswer(finalAnswer, question = {}) {
  const standard = question.numericAnswer;
  const base = { scope: 'final_value_only', earned: null, max: standard?.points ?? null, expected: standard?.display ?? null, proofPointsUnassessed: standard?.proofPointsUnassessed ?? null };
  if (!standard || !Number.isFinite(standard.expected)) return { ...base, status: 'unavailable', feedback: '이 문항에는 검증한 수치 정답 기준이 없습니다. 풀이 근거 피드백을 확인하세요.' };
  if (!normalise(finalAnswer)) return { ...base, status: 'not_attempted', feedback: '최종 수치 답을 입력하면 기준값과 비교합니다. 풀이 문장 속 숫자를 임의로 정답으로 취급하지 않습니다.' };
  const value = parseNumericExpression(finalAnswer);
  if (value === null) return { ...base, status: 'invalid', feedback: '최종 답 하나를 숫자·분수·계산식으로 입력하세요. 예: 2.5, 5/2, sqrt(2). 여러 후보, 등호, 단위는 제외합니다.' };
  const tolerance = Number.isFinite(standard.tolerance) ? Math.max(0, standard.tolerance) : 1e-9;
  const correct = Math.abs(value - standard.expected) <= tolerance;
  return { ...base, status: correct ? 'correct' : 'incorrect', actual: value, earned: correct ? standard.points ?? null : 0,
    feedback: correct ? `최종 수치가 ${standard.sourceKind === 'official' ? '공식 해설' : '자체 출제 기준'}의 값과 일치합니다. 이 결과는 풀이의 논리와 전체 문항 점수를 판정하지 않습니다.` : `최종 수치가 기준값 ${standard.display ?? standard.expected}과 다릅니다. 조건 누락, 부호, 계산 과정을 순서대로 확인하세요.` };
}

/** Criterion status means an observable expression was found, not that it is true. */
function defaultCriteria(question = {}) {
  const subject = String(question.subject || '');
  const numeric = /(수리|수학|자연|과학|통계|공학)/u.test(subject);
  return numeric ? [
    { id: 'generic-conditions', label: '조건·풀이 단계', conceptGroups: [['조건', '가정', '범위', '주어진'], ['식', '풀이', '계산', '증명']], referenceEvidence: '주어진 조건을 기호·식·풀이 단계로 옮김', guidance: '주어진 조건과 사용한 식을 먼저 쓰고, 중간 계산을 생략하지 마세요.' },
    { id: 'generic-evidence', label: '근거와 중간결과', conceptGroups: [['따라서', '이므로', '계산', '=', '증명'], ['결과', '값', '구하면', '얻는다']], referenceEvidence: '각 단계의 이유와 중간결과가 연결됨', guidance: '식만 나열하지 말고 왜 그 식을 쓰는지 한 문장으로 설명하세요.' },
    { id: 'generic-conclusion', label: '결론·검산', conceptGroups: [['결론', '답', '따라서', '구한다'], ['확인', '검산', '조건', '범위']], referenceEvidence: '최종 답과 조건·단위의 일치 여부 확인', guidance: '최종값을 문제의 조건·단위와 대조하고 검산 결과를 덧붙이세요.' },
    { id: 'generic-clarity', label: '표현의 정확성', conceptGroups: [['정의', '기호', '의미', '설명'], ['명확', '정확', '근거', '논리']], referenceEvidence: '기호와 용어를 혼동하지 않고 논리를 읽을 수 있게 제시', guidance: '기호를 정의하고 한 문장에 한 단계만 담아 읽는 사람이 따라오게 하세요.' }
  ] : [
    { id: 'generic-demand', label: '문제 요구 대응', conceptGroups: [['비교', '분석', '설명', '제시', '논하'], ['조건', '자료', '제시문', '문항', '근거']], referenceEvidence: '문항의 동사와 조건을 빠짐없이 답함', guidance: '문제의 동사(비교·분석·평가·제시)를 체크리스트로 바꾸고 답안 문단마다 대응시키세요.' },
    { id: 'generic-evidence', label: '제시문·자료 근거', conceptGroups: [['제시문', '자료', '표', '그래프', '수치', '근거'], ['사례', '조건', '내용', '인용', '자료']], referenceEvidence: '주장을 제시문·자료의 내용과 연결함', guidance: '주장 뒤에 자료의 핵심 내용과 그것이 주장을 뒷받침하는 이유를 함께 쓰세요.' },
    { id: 'generic-logic', label: '주장·근거·결론 연결', conceptGroups: [['주장', '입장', '판단', '나는'], ['이유', '때문', '따라서', '그러나', '반면', '결론']], referenceEvidence: '주장과 근거 사이의 비교 기준과 결론이 연결됨', guidance: '주장→근거→해석→결론 순서로 문단을 정리하고 연결어를 의도적으로 사용하세요.' },
    { id: 'generic-counter', label: '반론·한계·검증', conceptGroups: [['반론', '반대', '우려', '한계', '위험'], ['대안', '보완', '검증', '평가', '확인']], referenceEvidence: '반대 관점이나 한계를 인정하고 보완 방법을 제시함', guidance: '가장 강한 반론 하나를 공정하게 소개한 뒤 조건·검증 방법으로 답하세요.' }
  ];
}

function findEvidence(criterion, sentences, text) {
  const groups = criterion.conceptGroups || [];
  const groupHits = groups.map(group => group.filter(word => contains(text, word)));
  const hitCount = groupHits.filter(hit => hit.length).length;
  const sentenceMatch = groups.length ? sentences.find(sentence => groups.every(group => group.some(word => contains(sentence, word)))) : null;
  const relations = criterion.relations || [];
  const relationHit = !relations.length || relations.some(word => contains(text, word));
  const concerning = sentences.find(sentence => (criterion.contradictionPatterns || []).some(pattern => { try { return new RegExp(pattern, 'iu').test(sentence); } catch { return false; } }));
  let ratio = groups.length ? hitCount / groups.length : (sentences.length ? 0.5 : 0);
  if (sentenceMatch) ratio = Math.max(ratio, 0.9);
  if (!relationHit) ratio *= 0.75;
  if (concerning) ratio = Math.min(ratio, 0.3);
  const score = Math.max(0, Math.min(1, ratio));
  const status = concerning ? 'needs_review' : score >= 0.8 ? 'observed' : score >= 0.4 ? 'partial' : 'not_observed';
  const missingConcepts = groups.filter((_, index) => !groupHits[index].length).map(group => group.slice(0, 3).join('·'));
  return { score, status, concerning, evidence: (concerning || sentenceMatch || sentences.find(sentence => sentenceLike(sentence) && sentence.length > 20) || '').slice(0, 360), missingConcepts };
}

function structureChecks(text, sentences) {
  const paragraphsCount = text.split(/\n\s*\n/).filter(Boolean).length;
  const checks = [
    { label: '문제의 요구어를 직접 답함', ok: sentences.length >= 2 && /(?:비교|분석|평가|제시|설명|논하|선택|제안|구하|증명)/u.test(text) },
    { label: '근거·자료·조건을 사용함', ok: /(?:제시문|자료|근거|조건|수치|표|그래프|사례|식|계산|증명)/u.test(text) },
    { label: '주장과 결론을 연결함', ok: /(?:따라서|그러므로|이므로|때문에|반면|그러나|결론|선택하겠다|제안한다|구한다)/u.test(text) },
    { label: '반론·한계 또는 검증을 다룸', ok: /(?:반론|반대|우려|한계|위험|검증|평가|확인|보완|조건)/u.test(text) },
    { label: '문단을 나누어 읽기 쉽게 씀', ok: paragraphsCount >= 2 || sentences.length <= 4 }
  ];
  return checks;
}

/** Local, deterministic coaching rubric. It observes answer evidence; it never certifies truth or an official university score. */
export function evaluateEssay(answer, question = {}) {
  const text = normalise(answer), definitions = (question.criteria && question.criteria.length) ? question.criteria : defaultCriteria(question);
  const base = { kind: 'evidence_feedback', score: null, scoreLabel: '학습용 기준 점수 · 공식 대학 점수 아님', criteria: [], nextActions: [], warnings: [] };
  if (!text) return { ...base, status: 'not_attempted', summary: '답안을 작성하면 기준답안·채점 요소와 내 문장의 근거를 비교합니다.' };
  const sentences = readableSentences(text), words = text.split(/[\s,;|]+/).filter(Boolean), uniqueRatio = words.length ? new Set(words).size / words.length : 1;
  const repetition = words.length >= 12 && uniqueRatio < 0.35;
  const referenceMatch = question.sampleAnswer && text.replace(/\s/g, '') === normalise(question.sampleAnswer).replace(/\s/g, '');
  const pointsPerCriterion = 100 / definitions.length;
  const observations = definitions.map((criterion, index) => {
    const evidence = findEvidence(criterion, sentences, text);
    const earnedPoints = Math.round(evidence.score * pointsPerCriterion);
    const feedback = evidence.concerning
      ? `기준과 충돌할 수 있는 표현이 있습니다. ${criterion.guidance || ''} 반대 관점을 소개한 문장일 수도 있으므로 원문 해설과 문맥을 대조하세요.`
      : evidence.status === 'observed'
        ? `핵심 요소가 답안에 드러납니다. 이제 ${criterion.guidance || '근거의 정확성과 조건을 다시 확인하세요'}`
        : evidence.status === 'partial'
          ? `일부 요소만 확인됩니다. ${criterion.guidance || '빠진 조건과 근거를 한 문장씩 보완하세요'}`
          : (criterion.guidance || '이 기준을 설명하는 문장과 근거를 추가해 보세요.');
    return {
      id: criterion.id || `criterion-${index + 1}`,
      label: criterion.label || `평가 기준 ${index + 1}`,
      status: repetition && evidence.status === 'observed' ? 'needs_review' : evidence.status,
      evidence: evidence.evidence,
      referenceEvidence: criterion.referenceEvidence || '',
      missingConcepts: evidence.missingConcepts,
      earnedPoints,
      maxPoints: Math.round(pointsPerCriterion),
      feedback
    };
  });
  const checks = structureChecks(text, sentences);
  const structureEarned = checks.filter(item => item.ok).length;
  const criterionScore = observations.reduce((sum, item) => sum + item.earnedPoints, 0);
  const structureBonus = Math.round((structureEarned / checks.length) * 10);
  const score = Math.max(0, Math.min(100, Math.round(criterionScore * 0.9 + structureBonus)));
  const warnings = ['키워드·문장 구조를 확인하는 로컬 규칙 기반 학습 피드백입니다. 새로운 논증의 타당성, 반어·부정, 동의어, 수학 증명의 정답 여부는 자동 확정하지 않습니다.'];
  if (repetition) warnings.push('동일한 단어가 많이 반복되어 일부 기준의 점수를 보류했습니다. 키워드를 나열하지 말고 조건과 결론을 연결하세요.');
  if (referenceMatch) warnings.push('기준답안과 문구가 동일합니다. 기준답안을 닫고 자신의 설명으로 다시 작성해 독립적인 풀이를 확인하세요.');
  if (question.minChars && text.length < question.minChars) warnings.push(`권장 최소 ${question.minChars}자보다 ${question.minChars - text.length}자 적습니다. 분량 자체는 정답 점수가 아닙니다.`);
  if (question.maxChars && text.length > question.maxChars) warnings.push(`권장 최대 ${question.maxChars}자를 ${text.length - question.maxChars}자 초과했습니다. 중복 문장을 줄여 보세요.`);
  if (text.length > 400 && !/\n\s*\n/.test(text)) warnings.push('주장·근거·반론의 전환 지점을 문단으로 나누면 읽기 쉽습니다.');
  const observed = observations.filter(c => c.status === 'observed').length;
  const nextActions = observations.filter(c => c.status !== 'observed').slice(0, 3).map(c => c.feedback);
  if (!nextActions.length) {
    nextActions.push('기준의 핵심 요소는 드러납니다. 점수를 더 높이려면 가장 강한 근거의 출처·조건과 반론에 대한 검증 방법을 한 문장씩 구체화하세요.');
  }
  return {
    ...base,
    status: repetition ? 'needs_review' : referenceMatch ? 'reference_match' : 'reviewed',
    score,
    scoreLabel: '학습용 기준 점수 · 공식 대학 점수 아님',
    scoreBreakdown: { earned: score, max: 100, criterionEarned: criterionScore, criterionMax: 100, structureEarned, structureMax: checks.length, structureBonus, note: '기준 요소 90% + 답안 구조 점검 10%로 계산한 연습용 지표입니다.' },
    criteria: observations,
    structureChecks: checks,
    observedCount: observed,
    totalCriteria: definitions.length,
    warnings,
    nextActions,
    summary: `학습용 기준 ${score}/100점입니다. ${definitions.length}개 평가 기준 중 ${observed}개에서 핵심 근거 표현이 충분히 확인됐습니다. 점수는 공식 대학 채점 결과나 합격 가능성이 아닙니다.`
  };
}
