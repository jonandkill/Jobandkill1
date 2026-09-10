import test from 'node:test';
import assert from 'node:assert/strict';
import { createPdfLifecycle } from '../public/document-reader.js';

test('PDF.js 6 loading task is released even if completed render cancellation throws', async () => {
  const lifecycle = createPdfLifecycle();
  let releases = 0;
  lifecycle.setLoadingTask({ destroy: async () => { releases++; } });
  lifecycle.setRenderTask({ cancel: () => { throw new Error('finished renderer'); } });
  await lifecycle.destroy();
  assert.equal(releases, 1);
  await lifecycle.destroy();
  assert.equal(releases, 1, 'repeated navigation cleanup is idempotent');
});

test('worker cleanup rejection is handled and does not block subsequent UI work', async () => {
  const lifecycle = createPdfLifecycle();
  lifecycle.setLoadingTask({ destroy: () => Promise.reject(new Error('worker already closed')) });
  await assert.doesNotReject(lifecycle.destroy());
  let openedNextQuestion = false;
  await lifecycle.destroy();
  openedNextQuestion = true;
  assert.equal(openedNextQuestion, true);
});

test('late tasks after disposal are released instead of starting stale rendering', async () => {
  const lifecycle = createPdfLifecycle();
  await lifecycle.destroy();
  let cancelled = 0, released = 0;
  lifecycle.setRenderTask({ cancel: () => { cancelled++; } });
  lifecycle.setLoadingTask({ destroy: async () => { released++; } });
  await Promise.resolve();
  assert.equal(cancelled, 1);
  assert.equal(released, 1);
});
