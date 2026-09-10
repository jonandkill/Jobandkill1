import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { calculateGradeAverage, validateGradeEntries } from '../public/grade-input.js';
import { buildRecommendations, rankSchoolCandidates } from '../public/recommendation.js';
import { createTimer, startTimer, pauseTimer, remainingSeconds } from '../public/practice-timer.js';
import { evaluateNumericAnswer } from '../public/essay-evaluator.js';

const readJson = path => readFile(new URL(path, import.meta.url), 'utf8').then(JSON.parse);

test('selected decimal grades yield a weighted average but never become a university-formula prediction', () => {
  const calculated = calculateGradeAverage([{grade:'2.3',units:'3'},{grade:'1.7',units:'1'},{grade:'',units:''}], '9');
  assert.equal(calculated.average, 2.15);
  assert.equal(calculated.count, 2);
  const records = [2022, 2023, 2024].map(academicYear => ({
    universityId:'0000001',program:'간호학과',track:'학생부교과',academicYear,
    metric:'registered',scale:'9',formulaKey:'verified-school-formula',grade70:2.4
  }));
  const result = buildRecommendations(records, {scale:'9',average:calculated.average})[0];
  assert.equal(result.distance, null);
  assert.equal(result.personalProbability, null);
  assert.equal(validateGradeEntries([{grade:'2.3',units:'3'}],'5','9').average, null);
});

test('restoring a timer uses the original deadline and preserves pause time without adding minutes', () => {
  const timer = startTimer(createTimer(100), 1000);
  const restored = JSON.parse(JSON.stringify(timer));
  assert.equal(remainingSeconds(restored, 901000), 5100);
  const paused = pauseTimer(restored, 901000);
  assert.equal(remainingSeconds(paused, 1801000), 5100);
  const resumed = startTimer(paused, 1801000);
  assert.equal(remainingSeconds(resumed, 6901000), 0);
});

test('equivalent arithmetic receives only declared final-value points while invalid expressions never pass', () => {
  const question = {numericAnswer:{expected:2.5,display:'5/2',points:3,proofPointsUnassessed:7,sourceKind:'authored'}};
  for (const value of ['2.5','5/2','(4+1)/2']) {
    const result = evaluateNumericAnswer(value, question);
    assert.equal(result.earned, 3);
    assert.equal(result.proofPointsUnassessed, 7);
    assert.equal(result.scope, 'final_value_only');
  }
  assert.equal(evaluateNumericAnswer('5/0',question).earned, null);
  assert.equal(evaluateNumericAnswer('2.5 또는 3',question).earned, null);
  assert.equal(evaluateNumericAnswer('3',question).earned, 0);
});

test('education registry retains source coverage without fabricating admission eligibility or duplicate IDs', async () => {
  const source = await readJson('../data/education-registry.json');
  assert.equal(source.metadata.sourceTotalRows, source.metadata.undergraduateRows + source.metadata.excludedGraduateRows);
  assert.equal(source.institutions.length, source.metadata.undergraduateRows);
  assert.equal(new Set(source.institutions.map(item => item.id)).size, source.institutions.length);
  for (const row of source.institutions) {
    assert.notEqual(row.sourceRecord.UNIV_SE_NM, '대학원');
    assert.equal(row.eligibilityImported, false);
    assert.equal(row.currentAdmissionsStatus, 'not_verified');
  }
});

test('supplemental official schools remain discoverable with no outcomes and never reuse Adiga IDs', async () => {
  const registry = await readJson('../data/universities.json');
  const supplemental = await readJson('../data/supplemental-universities.json');
  const combined = [...registry.universities, ...supplemental.universities];
  assert.equal(new Set(combined.map(item => item.id)).size, combined.length);
  for (const school of supplemental.universities) {
    assert.match(school.id, /^special-/);
    assert.match(school.sourceUrl, /^https:\/\//);
    assert.equal(school.admissionsVerified, false);
    assert.equal(school.admissionCapacity, null);
  }
  const ulsan = rankSchoolCandidates(combined, [], {preferredRegion:'울산'});
  assert.ok(ulsan.some(school => school.id === 'special-unist'));
  assert.ok(ulsan.some(school => school.name === '울산대학교'));
});
