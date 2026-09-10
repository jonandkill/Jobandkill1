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
export function evaluateEssay(answer, question = {}) {
  const text = normalise(answer), definitions = question.criteria || [];
  const base = { kind: 'evidence_feedback', score: null, scoreLabel: '서술 논리·대학 점수는 자동 확정하지 않음', criteria: [], nextActions: [], warnings: [] };
  if (!text) return { ...base, status: 'not_attempted', summary: '답안을 작성하면 기준답안과 관련 근거 표현을 비교합니다.' };
  const sentences = readableSentences(text), words = text.split(/[\s,;|]+/).filter(Boolean), uniqueRatio = words.length ? new Set(words).size / words.length : 1;
  const repetition = words.length >= 12 && uniqueRatio < 0.35;
  const referenceMatch = question.sampleAnswer && text.replace(/\s/g, '') === normalise(question.sampleAnswer).replace(/\s/g, '');
  const observations = definitions.map((criterion, index) => {
    const groups = criterion.conceptGroups || [], relations = criterion.relations || [];
    const matches = sentences.filter(sentence => sentenceLike(sentence) && groups.length && groups.every(group => group.some(word => contains(sentence, word))) && (!relations.length || relations.some(word => contains(sentence, word))));
    const concerning = sentences.find(sentence => (criterion.contradictionPatterns || []).some(pattern => { try { return new RegExp(pattern, 'iu').test(sentence); } catch { return false; } }));
    const status = repetition ? 'needs_review' : concerning ? 'needs_review' : matches.length ? 'observed' : 'not_observed';
    const evidence = concerning || (repetition ? '' : matches[0]) || '';
    return { id: criterion.id || `criterion-${index + 1}`, label: criterion.label, status, evidence: evidence.slice(0, 360),
      referenceEvidence: criterion.referenceEvidence || '',
      feedback: concerning ? `기준과 충돌할 수 있는 표현이 있습니다. ${criterion.guidance || ''} 반대 관점을 소개한 문장일 수도 있으므로 문맥을 대조하세요.` : status === 'observed' ? `관련 근거 표현을 찾았습니다. ${criterion.guidance || ''} 표현의 존재만으로 타당성을 확정하지 않습니다.` : criterion.guidance || '이 기준을 설명하는 문장과 근거를 추가해 보세요.' };
  });
  const warnings = ['문장에 나타난 근거 표현을 기준답안과 연결한 연습 피드백입니다. 새로운 논증, 반어·부정, 동의어, 수학 증명의 타당성은 자동으로 확정하지 않습니다.'];
  if (repetition) warnings.push('동일한 단어가 많이 반복되어 근거 표현 판정을 보류했습니다. 키워드를 나열하지 말고 조건과 결론을 연결해 작성하세요.');
  if (referenceMatch) warnings.push('기준답안과 문구가 동일합니다. 답안의 독립적인 작성 능력을 확인하려면 기준답안을 닫고 자신의 설명으로 다시 작성하세요.');
  if (question.minChars && text.length < question.minChars) warnings.push(`권장 최소 ${question.minChars}자보다 ${question.minChars - text.length}자 적습니다. 분량 자체는 정답 점수가 아닙니다.`);
  if (question.maxChars && text.length > question.maxChars) warnings.push(`권장 최대 ${question.maxChars}자를 ${text.length - question.maxChars}자 초과했습니다. 중복 문장을 줄여 보세요.`);
  if (text.length > 400 && !/\n\s*\n/.test(text)) warnings.push('주장·근거·반론의 전환 지점을 문단으로 나누면 읽기 쉽습니다.');
  const observed = observations.filter(c => c.status === 'observed').length;
  const nextActions = observations.filter(c => c.status !== 'observed').slice(0, 3).map(c => c.feedback);
  if (!nextActions.length) nextActions.push('기준답안과 결론이 달라도 근거가 성립하는지 확인하고, 가장 강한 반론에 답하는 문장을 보완하세요.');
  return { ...base, status: repetition ? 'needs_review' : referenceMatch ? 'reference_match' : 'reviewed', criteria: observations, observedCount: observed, totalCriteria: definitions.length, warnings, nextActions,
    summary: definitions.length ? `${definitions.length}개 기준 중 ${observed}개에서 관련 근거 표현을 찾았습니다. 아래 인용문을 기준답안과 대조하세요.` : '연결된 기준답안이 없어 문장 형식만 점검했습니다. 공식 해설 또는 자체 출제 문항을 선택하면 기준별 피드백을 받을 수 있습니다.' };
}
