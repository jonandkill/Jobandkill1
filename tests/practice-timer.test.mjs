import test from 'node:test';
import assert from 'node:assert/strict';
import { createTimer, startTimer, pauseTimer, remainingSeconds, formatRemaining } from '../public/practice-timer.js';

test('running timer survives a reload or inactive tab using its absolute deadline', () => {
  const started = startTimer(createTimer(100), 1000);
  const restored = JSON.parse(JSON.stringify(started));
  assert.equal(remainingSeconds(restored, 61000), 5940);
  assert.equal(remainingSeconds(restored, 6101000), 0);
});

test('pause preserves time and resume uses remaining duration', () => {
  const paused = pauseTimer(startTimer(createTimer(1), 1000), 11000);
  assert.equal(remainingSeconds(paused, 90000), 50);
  assert.equal(remainingSeconds(startTimer(paused, 100000), 110000), 40);
});

test('custom duration validates bounds and expiration never goes negative', () => {
  assert.throws(() => createTimer('invalid'));
  assert.throws(() => createTimer(0));
  assert.equal(pauseTimer(startTimer(createTimer(1), 1000), 62000).status, 'finished');
  assert.equal(formatRemaining(6000), '100:00');
});
