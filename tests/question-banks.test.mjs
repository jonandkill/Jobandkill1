import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const official = JSON.parse(fs.readFileSync(new URL('../data/official-question-bank.json', import.meta.url)));
const authored = JSON.parse(fs.readFileSync(new URL('../data/authored-question-bank.json', import.meta.url)));

test('official bank contains question-page indexes with source and page provenance', () => {
  assert.ok(official.questions.length >= 100);
  assert.ok(official.resources.length >= 20);
  for (const q of official.questions.slice(0, 20)) {
    assert.equal(q.sourceKind, 'official_past');
    assert.equal(q.officialPastPaper, true);
    assert.match(q.sourceUrl, /^https:\/\//);
    assert.ok(Number.isInteger(q.questionPage) && q.questionPage > 0);
    assert.equal(q.requiresSource, true);
    assert.match(q.contentStatus, /original_pdf/);
  }
  assert.ok(official.questions.every(q => q.departmentMappingStatus !== 'verified_department_specific'));
});

test('authored practice bank has checked reference answers and never predicts exam probability', () => {
  assert.equal(authored.questions.length, 100);
  assert.ok(authored.questions.every(q => q.sourceKind === 'original_practice' && q.officialPastPaper === false));
  assert.ok(authored.questions.every(q => q.sampleAnswer && q.solutionSteps?.length && q.criteria?.length));
  assert.match(authored.notice, /출제확률 7%를 의미하지 않으며/);
  assert.ok(authored.questions.every(q => !('probability' in q) && !('admissionProbability' in q)));
});
