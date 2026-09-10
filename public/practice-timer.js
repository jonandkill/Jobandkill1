/** Remaining seconds are derived from the persisted deadline, never from tick counts. */
export function remainingSeconds(timer, now = Date.now()) {
  if (!timer) return 0;
  if (timer.status === 'running') return Math.max(0, Math.ceil((Number(timer.deadline) - now) / 1000));
  return Math.max(0, Math.round(Number(timer.remainingSeconds) || 0));
}

export function createTimer(minutes) {
  const durationSeconds = Math.round(Number(minutes) * 60);
  if (!Number.isFinite(durationSeconds) || durationSeconds < 60 || durationSeconds > 360 * 60) throw new Error('1분에서 360분 사이로 입력해 주세요.');
  return { status: 'idle', durationSeconds, remainingSeconds: durationSeconds, deadline: null };
}

export function startTimer(timer, now = Date.now()) {
  const remaining = remainingSeconds(timer, now);
  if (remaining === 0) return { ...timer, status: 'finished', remainingSeconds: 0, deadline: null };
  return { ...timer, status: 'running', remainingSeconds: remaining, deadline: now + remaining * 1000, startedAt: timer.startedAt || now };
}

export function pauseTimer(timer, now = Date.now()) {
  const remaining = remainingSeconds(timer, now);
  return { ...timer, status: remaining ? 'paused' : 'finished', remainingSeconds: remaining, deadline: null };
}

export function formatRemaining(seconds) {
  const value = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}
