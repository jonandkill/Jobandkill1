import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateArticle, prepareRequest, DurableBudgetLedger } from '../generation.mjs';
import { createStudioServer } from '../scripts/api-server.mjs';
import { buildArticle } from '../core.mjs';

const keyword = '요구르트';
const article = { title: `${keyword} 고르는 방법`, introduction: `${keyword}의 영양표시를 읽는 방법을 정리한다.`, sections: Array.from({ length: 3 }, (_,i) => ({ heading: `영양표시 ${i}`, body: '제품마다 영양성분과 원재료가 다를 수 있으므로 포장지에 표시된 성분을 살펴본다. 특정 식품의 효과를 모든 사람에게 동일하게 적용할 수는 없다. '.repeat(2) })), conclusion: '개인 상황에 맞게 선택한다.', warnings: ['실시간 근거 검증 없음'], imagePrompt: 'Plain yogurt in a bowl' };
const response = { status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(article) }] }] };
const ledger = { reserve: async amount => ({ attempts: 1, reservedKrw: amount }) };
const options = { apiKey: 'mock-not-a-key', ledger, now: '2026-09-10' };
test('keyword body and default image are real separate API requests; no live calls', async () => {
  const calls = [];
  const result = await generateArticle({ primaryKeyword: keyword }, { ...options, fetchImpl: async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return { ok: true, json: async () => url.endsWith('/responses') ? response : { data: [{ b64_json: 'YWJj' }] } }; } });
  assert.equal(calls.length, 2); assert.equal(calls[0].body.max_output_tokens, 2500); assert.equal(calls[1].body.quality, 'low'); assert.match(result.articleInput.draft, /영양표시/); assert.match(result.image.dataUrl, /^data:image\/png/);
  assert.ok(buildArticle(result.articleInput).sections.length >= 3);
});
test('image unchecked never calls image API', async () => {
  let count = 0;
  const result = await generateArticle({ primaryKeyword: keyword, generateImages: false }, { ...options, fetchImpl: async () => { count++; return { ok: true, json: async () => response }; } });
  assert.equal(count, 1); assert.equal(result.image, undefined);
});
test('missing credentials or ledger never calls provider', async () => {
  const fetchImpl = () => { throw new Error('must not call'); };
  await assert.rejects(generateArticle({ primaryKeyword: keyword }, { fetchImpl }), { code: 'NOT_CONFIGURED' });
  await assert.rejects(generateArticle({ primaryKeyword: keyword }, { apiKey: 'mock', fetchImpl }), { code: 'NO_BUDGET_LEDGER' });
});
test('oversize, punctuation and nonstring keyword rejected', () => {
  for (const primaryKeyword of ['%%%%', {}, '', 'a'.repeat(121)]) assert.throws(() => prepareRequest({ primaryKeyword }), { code: 'INVALID_KEYWORD' });
  assert.throws(() => prepareRequest({ primaryKeyword: keyword, draft: '가'.repeat(5000) }), { code: 'INPUT_TOO_LONG' });
  assert.ok(prepareRequest({ primaryKeyword: keyword }).reserveKrw < 30);
});
test('empty or unrelated response is not disguised as successful template', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ output: [] }) });
  await assert.rejects(generateArticle({ primaryKeyword: keyword, generateImages: false }, { ...options, fetchImpl }), { code: 'INVALID_JSON' });
});
test('provider failure retains reservation and never retries', async () => {
  let calls = 0; let reserves = 0;
  await assert.rejects(generateArticle({ primaryKeyword: keyword }, { ...options, ledger: { reserve: async () => { reserves++; } }, fetchImpl: async () => { calls++; return { ok: false, status: 429 }; } }), { code: 'PROVIDER_ERROR' });
  assert.equal(calls, 1); assert.equal(reserves, 1);
});
test('image failure retains complete text and explicit error', async () => {
  const result = await generateArticle({ primaryKeyword: keyword }, { ...options, fetchImpl: async url => url.endsWith('/responses') ? { ok: true, json: async () => response } : { ok: false, status: 403 } });
  assert.ok(result.articleInput.draft.length > 500); assert.ok(result.imageError); assert.equal(result.image, undefined);
});
test('image model retirement blocks spend before reservation', async () => {
  await assert.rejects(generateArticle({ primaryKeyword: keyword }, { ...options, now: '2026-12-01', fetchImpl: () => { throw Error('must not call'); } }), { code: 'IMAGE_MODEL_RETIRED' });
});
test('durable ledger serializes reservations and survives restart; attempt101 blocked', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'studio-budget-test-')); const path = join(directory, 'ledger.json');
  try {
    const budget = new DurableBudgetLedger(path);
    await Promise.all(Array.from({ length: 100 }, () => budget.reserve(29)));
    const state = JSON.parse(await readFile(path, 'utf8')); assert.equal(state.attempts, 100); assert.equal(state.reservedKrw, 2900);
    await assert.rejects(new DurableBudgetLedger(path).reserve(1), { code: 'BUDGET_EXHAUSTED' });
  } finally { await rm(directory, { recursive: true }); }
});
test('server refuses unauthenticated paid endpoint and hides server files', async () => {
  let calls = 0;
  const server = createStudioServer({ apiKey: 'mock', accessToken: 'x'.repeat(32), ledger, generate: async () => { calls++; return { ok: true }; } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${url}/api/generate`, { method: 'POST' })).status, 401);
    assert.equal((await fetch(`${url}/generation.mjs`)).status, 404);
    const result = await fetch(`${url}/api/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${'x'.repeat(32)}` }, body: JSON.stringify({ primaryKeyword: keyword }) });
    assert.equal(result.status, 200); assert.equal(calls, 1);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
