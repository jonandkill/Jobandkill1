import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluateEssay, evaluateNumericAnswer, parseNumericExpression } from '../public/essay-evaluator.js';

const bank = JSON.parse(readFileSync(new URL('../data/essay-standards.json', import.meta.url)));
const question = id => bank.questions.find(q => q.id === id);

test('empty answer is not treated as an attempted or zero-scored essay', () => {
  const result = evaluateEssay('  \n ', question('original-education-equity'));
  assert.equal(result.status, 'not_attempted');
  assert.equal(result.score, null);
  assert.deepEqual(result.criteria, []);
});

test('keyword listing is not evidence of a valid argument', () => {
  const result = evaluateEssay('동일 같은 필요 접근 평등 공정 출발 예산 600 대여 낙인 비공개 신청 공개 절차 과제 참여 평가 개선 확인', question('original-education-equity'));
  assert.equal(result.observedCount, 0);
  assert.equal(result.score, null);
});

test('repeated criterion words cannot earn an essay correctness score', () => {
  const result = evaluateEssay('같은 필요 평등 때문에 좋다. '.repeat(20), question('original-education-equity'));
  assert.equal(result.status, 'needs_review');
  assert.equal(result.observedCount, 0);
  assert.equal(result.score, null);
});

test('relevant evidence is quoted but remains distinct from semantic grading', () => {
  const answer = '같은 금액을 제공하면 형식적인 평등을 지킬 수 있지만 필요에 따른 지원은 접근 기회를 넓힐 수 있다.';
  const result = evaluateEssay(answer, question('original-education-equity'));
  assert.ok(result.criteria.some(c => c.status === 'observed' && c.evidence === answer));
  assert.equal(result.score, null);
  assert.ok(result.nextActions.length);
});

test('a known contradictory causal claim is sent for review instead of scored correct', () => {
  const result = evaluateEssay('관찰된 5점 차이는 전부 인과 효과이다.', question('original-science-causality'));
  const causal = result.criteria.find(c => c.label === '인과 단정 제한');
  assert.equal(causal.status, 'needs_review');
  assert.match(causal.feedback, /문맥/);
  assert.equal(result.score, null);
});

test('copying the reference does not certify independent writing ability', () => {
  const q = question('original-privacy-mobility');
  const result = evaluateEssay(q.sampleAnswer, q);
  assert.equal(result.status, 'reference_match');
  assert.equal(result.score, null);
  assert.ok(result.warnings.some(x => x.includes('독립적인')));
});

test('numeric parser handles fractions and arithmetic with standard precedence', () => {
  assert.equal(parseNumericExpression('５／２'), 2.5);
  assert.equal(parseNumericExpression('-2^2'), -4);
  assert.equal(parseNumericExpression('(-2)^2'), 4);
  assert.equal(parseNumericExpression('2^-3'), 0.125);
  assert.equal(parseNumericExpression('3 + 4 * 2'), 11);
  assert.equal(parseNumericExpression('√(9)'), 3);
});

test('numeric parser rejects code, multiple guesses, undefined and nonfinite values', () => {
  for (const value of ['1/0', 'sqrt(-1)', '2 또는 3', '2,3', 'x=2', 'alert(1)', 'Math.random()', '1;2', '9^999', '((3)']) {
    assert.equal(parseNumericExpression(value), null, value);
  }
});

test('official final-value points cannot become the full proof score', () => {
  const q = question('kw26-natural1-set');
  const result = evaluateNumericAnswer('600+2', q);
  assert.equal(result.status, 'correct');
  assert.equal(result.earned, 2);
  assert.equal(result.max, 2);
  assert.equal(result.proofPointsUnassessed, 8);
  assert.equal(result.scope, 'final_value_only');
  assert.equal(evaluateNumericAnswer('602 또는 601', q).status, 'invalid');
  assert.equal(evaluateNumericAnswer('601', q).status, 'incorrect');
  assert.equal(evaluateNumericAnswer('', q).status, 'not_attempted');
});

test('official finite answers include a valid equivalent fraction and blank standards abstain', () => {
  assert.equal(evaluateNumericAnswer('10/4', question('kw26-natural1-maxoverlap')).status, 'correct');
  assert.equal(evaluateNumericAnswer('30', question('koreatech26-mock-log2')).status, 'correct');
  assert.equal(evaluateNumericAnswer('30', question('original-media-numbers')).status, 'unavailable');
});

test('authored questions are never mislabeled as university past papers or official exam durations', () => {
  const authored = bank.questions.filter(q => q.origin === 'authored');
  assert.equal(authored.length, 24);
  for (const q of authored) {
    assert.equal(q.officialPastPaper, false, q.id);
    assert.equal(q.durationVerified, false, q.id);
    assert.equal(q.universityName, '자체 출제 연습');
    assert.ok(q.prompt.length > 30 && q.sampleAnswer.length > 60, q.id);
    assert.ok(q.criteria.length >= 2, q.id);
    assert.ok(evaluateEssay(q.sampleAnswer, q).observedCount > 0, q.id);
  }
  const mock = question('koreatech26-mock-log2');
  assert.equal(mock.officialPastPaper, false);
  assert.equal(mock.sourceKind, 'official_mock');
  assert.equal(mock.durationSource.scope, 'historical_mock_total');
});

test('authored numerical answers independently match their stated mathematical problems', () => {
  const expected = {
    quadratic: Math.max(...Array.from({length: 801}, (_, i) => { const x = i / 100; return -2*x*x + 16*x - 5; })),
    conditional: (0.5 * 0.75) / (0.5 * 0.75 + 0.5 * 0.25),
    sequence: Array.from({length:7}, (_, i) => 2 ** (i + 1)).reduce((a,b)=>a+b,0),
    derivative: 3*1*1-6*1,
    area: 2*2 - 2**3/3,
    vector: 1*3 + 2*(-1),
    logarithm: 5,
    binomial: 6 * 0.5**4,
    'line-distance': Math.abs(3*1+4*2-6)/Math.hypot(3,4),
    expectation: 0*.5+10*.25+20*.25-5,
    limit: 2+2,
    combination: 5*4/2
  };
  for (const [id, value] of Object.entries(expected)) assert.ok(Math.abs(question(`original-math-${id}`).numericAnswer.expected - value) < 1e-9, id);
  assert.equal((5-1)*(5-3), 8);
});
