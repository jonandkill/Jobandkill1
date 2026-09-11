import { renderDocument } from './document-reader.js';
import { createTimer, startTimer, pauseTimer, remainingSeconds, formatRemaining } from './practice-timer.js';
import { evaluateEssay, evaluateNumericAnswer } from './essay-evaluator.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const paragraphs = value => String(value ?? '').split(/\n\s*\n/).filter(Boolean).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
const storageKey = 'susi-practice-v1';
function numericFeedback(result, question) {
  const official = question.numericAnswer.sourceKind === 'official';
  const points = Number.isFinite(result.earned) && Number.isFinite(result.max);
  return `<div class="notice"><strong>${esc(result.feedback || result.status)}</strong>${points ? official ? `<p>최종 수치 배점 ${result.earned} / ${result.max}점</p><p>이 소문항의 전체 ${question.numericAnswer.totalQuestionPoints}점 중 풀이·증명 ${question.numericAnswer.proofPointsUnassessed}점은 아직 평가하지 않았습니다.</p>` : '<p>자체 연습의 최종값 1항목을 비교했습니다. 대학 배점으로 환산하지 않습니다.</p>' : ''}<p class="hint">${esc(question.numericAnswer.scoreNote || '')}</p></div>`;
}

export async function renderPractice(root) {
  root.innerHTML = '<h1>논술 연습실</h1><p role="status">문항과 공식 자료를 불러오고 있어요.</p>';
  const token = root.firstElementChild;
  let bank, standards, roster, official, authored;
  try {
    const responses = await Promise.all([fetch('/data/practice-questions.json'), fetch('/data/essay-standards.json'), fetch('/data/essay-universities.json'), fetch('/data/official-question-bank.json'), fetch('/data/authored-question-bank.json')]);
    if (responses.some(r => !r.ok)) throw new Error('load');
    [bank, standards, roster, official, authored] = await Promise.all(responses.map(r => r.json()));
  } catch {
    if (root.firstElementChild !== token) return;
    root.innerHTML = '<h1>논술 연습실</h1><p role="alert">문항을 불러오지 못했습니다. 답안은 이 브라우저에 남아 있습니다.</p><button id="practice-retry">다시 불러오기</button><a class="button" href="#prepare/exams">공식 자료실 열기</a>';
    root.querySelector('#practice-retry').onclick = () => renderPractice(root);
    return;
  }
  if (!root.isConnected || root.firstElementChild !== token) return;
  const resourceMap = new Map([...(bank.resources || []), ...(official.resources || [])].map(item => [item.id, item]));
  const resources = [...resourceMap.values()];
  const readyQuestions = [...(standards.questions || []), ...(official.questions || []), ...(authored.questions || [])].sort((a, b) => Number(!!b.sourceId) - Number(!!a.sourceId));
  const combined = new Map((bank.questions || []).map(q => [q.id, q]));
  readyQuestions.forEach(q => combined.set(q.id, { ...combined.get(q.id), ...q }));
  const questions = [...combined.values()];
  const resourceFor = q => resources.find(r => r.id === q.sourceId);
  const schoolFor = q => q.universityName || resourceFor(q)?.universityName || '자체 제작 연습';
  const subjectFor = q => q.subject || resourceFor(q)?.subject || '통합';
  const schoolNames = [...new Set([...(roster.universities || []).map(r => r.name), ...resources.map(r => r.universityName), ...readyQuestions.map(schoolFor)])].sort((a, b) => a.localeCompare(b, 'ko'));
  let saved;
  try { saved = JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch { saved = {}; }
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) saved = {};
  let active, activeQuestion, reader, clock, openVersion = 0, page = 0;
  const own = document.createElement('div');
  own.className = 'practice-workspace';
  root.replaceChildren(own);
  own.innerHTML = `<p class="eyebrow">문제 선택 → 시간 설정 → 답안 작성 → 피드백</p><h1>문제를 읽고, 직접 풀어보세요</h1><p>문제와 풀이 기준을 함께 제공합니다. 대학 기출과 자체 제작 연습은 구분해 표시합니다.</p><div class="filters"><div><label for="practice-mode">자료 선택</label><select id="practice-mode"><option value="questions">바로 풀 수 있는 문항</option><option value="resources">대학 공식 PDF 자료</option></select></div><div><label for="practice-school">학교</label><select id="practice-school"><option value="">전체 학교</option>${schoolNames.map(name => `<option>${esc(name)}</option>`).join('')}</select></div><div><label for="practice-subject">계열</label><select id="practice-subject"><option value="">전체 계열</option>${[...new Set([...resources.map(r => r.subject), ...readyQuestions.map(subjectFor)].filter(Boolean))].sort().map(name => `<option>${esc(name)}</option>`).join('')}</select></div><div><label for="practice-hard"><input type="checkbox" id="practice-hard"> 어려운 문제·자료만</label></div></div><p class="hint">공식 PDF ${resources.length}건 · 원문에서 색인한 공식 문제 위치 ${official.questions?.length || 0}건 · 자체 제작 기준 풀이 ${authored.questions?.length || 0}건 · 기존 연결 문항 ${standards.questions?.length || 0}건이 있습니다. 자료실 링크만 있는 항목은 문제 확보 수에 포함하지 않습니다.</p><section id="practice-list" class="practice-library-list" tabindex="-1"></section><section id="practice-editor" class="panel" hidden></section>`;
  const mode = own.querySelector('#practice-mode'), school = own.querySelector('#practice-school'), subject = own.querySelector('#practice-subject'), hard = own.querySelector('#practice-hard'), list = own.querySelector('#practice-list'), editor = own.querySelector('#practice-editor');
  const alive = () => own.isConnected;
  function persist() { try { localStorage.setItem(storageKey, JSON.stringify(saved)); return true; } catch { return false; } }
  function keyFor(q) { return q.sourceId || `authored:${q.id}`; }
  function isHard(id, questionId) { return !!(questionId ? saved[id]?.drafts?.[questionId]?.hard : saved[id]?.hard || Object.values(saved[id]?.drafts || {}).some(d => d.hard)); }
  function drawList(move = false) {
    const isQuestions = mode.value === 'questions';
    const rows = (isQuestions ? readyQuestions : resources).filter(item => {
      const name = isQuestions ? schoolFor(item) : item.universityName, field = isQuestions ? subjectFor(item) : item.subject;
      return (!school.value || name === school.value) && (!subject.value || field === subject.value) && (!hard.checked || isHard(isQuestions ? keyFor(item) : item.id, isQuestions ? item.id : null));
    });
    const pages = Math.ceil(rows.length / 9);
    page = Math.min(page, Math.max(0, pages - 1));
    list.innerHTML = `<p><strong>${rows.length}개 ${isQuestions ? '연습 문항' : '공식 PDF 자료'}</strong></p><div class="cards">${rows.slice(page * 9, page * 9 + 9).map(item => {
      const id = isQuestions ? keyFor(item) : item.id, qid = isQuestions ? item.id : '';
      const status = isQuestions ? (item.sourceKind === 'official_past' ? '공식 기출 · 원문 PDF 쪽과 요구사항 색인' : item.sourceKind === 'official_mock' ? '공식 모의논술 · 본시험 기출과 구분' : item.sourceId ? '공식 자료 연결 문항 · 근거와 풀이 점검' : '자체 제작 연습 · 대학 실제 기출이 아님') : '원문 PDF 읽기 · 문항별 확보 범위 확인';
      return `<article class="card"><span class="tag">${esc(isQuestions ? schoolFor(item) : item.universityName)}${item.year ? ` · ${esc(item.year)}` : ''}</span><h2>${esc(item.title)}</h2><p>${esc(isQuestions ? subjectFor(item) : item.subject)}</p><p class="hint">${status}</p>${isQuestions && item.promptSummary ? `<p>${esc(item.promptSummary)}</p>` : ''}<button class="primary" data-open="${esc(id)}" data-question="${esc(qid)}">${isQuestions ? '이 문제 풀기' : 'PDF 읽고 문제 선택'}</button><button data-hard="${esc(id)}" data-question="${esc(qid)}" aria-pressed="${isHard(id, qid)}">${isHard(id, qid) ? '★ 어려운 항목 해제' : '☆ 어려운 항목 담기'}</button></article>`;
    }).join('')}</div>${rows.length ? '' : '<p class="empty">선택한 조건의 문항이 없습니다. 학교·계열 조건을 바꾸거나 대학 공식 PDF 자료를 선택해 주세요.</p>'}<div class="pagination" aria-label="논술 연습 목록 페이지"><button data-page-prev ${page === 0 ? 'disabled' : ''}>← 이전</button><span>${rows.length ? page + 1 : 0} / ${pages} 페이지</span><button data-page-next ${page + 1 >= pages ? 'disabled' : ''}>다음 →</button></div>`;
    list.querySelectorAll('[data-open]').forEach(b => b.onclick = () => open(b.dataset.open, b.dataset.question));
    list.querySelectorAll('[data-hard]').forEach(b => b.onclick = () => {
      const id = b.dataset.hard, qid = b.dataset.question;
      saved[id] ||= {};
      if (qid) { saved[id].drafts ||= {}; saved[id].drafts[qid] = { ...saved[id].drafts[qid], hard: !isHard(id, qid) }; }
      else saved[id].hard = !saved[id].hard;
      const ok = persist(); drawList();
      if (!ok) list.insertAdjacentHTML('afterbegin', '<p role="alert">이 브라우저의 저장 공간이 부족해 보관하지 못했습니다.</p>');
    });
    list.querySelector('[data-page-prev]').onclick = () => { page--; drawList(true); };
    list.querySelector('[data-page-next]').onclick = () => { page++; drawList(true); };
    if (!rows.length && school.value) {
      const entry = (roster.universities || []).find(r => r.name === school.value);
      if (entry && /^https:\/\//.test(entry.archiveUrl || '')) list.querySelector('.empty')?.insertAdjacentHTML('beforeend', `<br><a class="button" href="${esc(entry.archiveUrl)}" target="_blank" rel="noopener">${esc(entry.name)} 공식 자료 확인 ↗</a>`);
    }
    if (move) { list.focus({ preventScroll: true }); list.scrollIntoView({ block: 'start' }); }
  }
  async function open(id, requestedQuestionId = '') {
    const version = ++openVersion;
    clearInterval(clock);
    const previousReader = reader; reader = null;
    try { Promise.resolve(previousReader?.destroy?.()).catch(() => undefined); } catch { /* Cleanup failure must not prevent the next question from opening. */ }
    const authored = questions.find(q => `authored:${q.id}` === id);
    active = resources.find(r => r.id === id) || (authored ? { id, title: authored.title, universityName: schoolFor(authored), subject: subjectFor(authored) } : null);
    if (!active) return;
    saved[id] ||= {};
    const qs = questions.filter(q => q.sourceId === id || `authored:${q.id}` === id);
    activeQuestion = qs.find(q => q.id === (requestedQuestionId || saved[id].questionId)) || qs.find(q => q.prompt || q.promptText) || qs[0] || null;
    editor.hidden = false;
    editor.innerHTML = `<p class="practice-progress">1 문제 확인 · 2 시간 설정 · 3 답안 작성 · 4 피드백</p><h2 tabindex="-1">${esc(active.title)}</h2><label for="practice-question">연습 문항</label><select id="practice-question">${qs.map(q => `<option value="${esc(q.id)}">${esc(q.title)}</option>`).join('')}<option value="">PDF에서 선택한 문항 자유 기록</option></select><div id="practice-question-body" class="practice-question-body"></div>${active.url ? '<details id="practice-document" open><summary>공식 PDF 본문 읽기</summary><div id="practice-pdf"></div></details>' : ''}<section class="practice-timer" aria-labelledby="practice-timer-title"><h3 id="practice-timer-title">시험시간 연습</h3><p id="practice-duration-note"></p><label for="practice-minutes">제한 시간(분)</label><input type="number" id="practice-minutes" min="1" max="360" step="1"><p id="practice-clock" style="font-size:2rem;font-variant-numeric:tabular-nums"><strong>00:00</strong></p><div class="actions"><button id="practice-start" class="primary">시간 시작</button><button id="practice-pause" disabled>일시정지</button><button id="practice-reset">시간 다시 설정</button></div><p id="practice-timer-status" role="status"></p><p class="hint">시작 버튼을 누르면 시간이 흐릅니다. 페이지를 닫아도 진행 중인 시간은 계속 계산됩니다. 일시정지는 연습용이며, 시간이 끝나도 답안은 삭제되지 않습니다.</p></section><section class="practice-answer-area"><label for="practice-answer">내 답안</label><textarea id="practice-answer" rows="12" placeholder="질문에 대한 답과 근거, 풀이 과정을 자유롭게 작성해 주세요."></textarea><div id="practice-numeric"></div><p id="practice-count"></p><div class="actions"><button id="practice-feedback" class="primary">답안 평가·피드백 보기</button><button id="practice-question-hard">☆ 어려운 문제 담기</button></div><p id="practice-save" role="status"></p></section><section id="practice-result" class="practice-feedback" aria-live="polite"></section>`;
    const select = editor.querySelector('#practice-question'), answer = editor.querySelector('#practice-answer'), questionBody = editor.querySelector('#practice-question-body'), result = editor.querySelector('#practice-result');
    select.value = activeQuestion?.id || '';
    const qkey = () => activeQuestion?.id || '';
    function storeDraft() {
      saved[id].drafts ||= {};
      saved[id].drafts[qkey()] = { ...saved[id].drafts[qkey()], answer: answer.value, finalAnswer: editor.querySelector('#practice-final-answer')?.value || '', updatedAt: new Date().toISOString() };
      saved[id].questionId = qkey();
      saved._session = { id, questionId: qkey(), mode: mode.value, school: school.value, subject: subject.value };
      editor.querySelector('#practice-save').textContent = persist() ? '답안을 이 브라우저에 저장했습니다.' : '저장 공간이 부족합니다. 답안을 따로 복사해 주세요.';
      editor.querySelector('#practice-count').textContent = `공백 포함 ${[...answer.value].length}자`;
    }
    function showQuestion() {
      const q = activeQuestion, draft = saved[id].drafts?.[qkey()], prompt = q?.prompt || q?.promptText || q?.promptSummary;
      answer.value = draft?.answer ?? (saved[id].questionId === qkey() ? saved[id].answer || '' : '');
      questionBody.innerHTML = q ? `<h3>${esc(q.title)}</h3><p class="tag">${q.sourceKind === 'official_past' ? '공식 기출 · 원문 PDF에서 문항 위치와 요구사항을 색인함' : q.sourceId ? q.sourceKind === 'official_mock' ? '공식 모의논술 문항' : '공식 자료 연결 문항' : '자체 제작 연습 문항'}</p>${prompt ? paragraphs(prompt) : '<p>이 문항은 아래 공식 PDF에서 읽을 수 있습니다. 문제 쪽수와 채점 기준 쪽수를 구분해 확인하세요.</p>'}${q.sourceKind === 'official_past' ? '<p class="hint">전체 제시문과 문제 본문은 원문 PDF에서 확인합니다. 아래 버튼으로 같은 문항 쪽을 열어 읽고, 해설 쪽이 있으면 함께 비교하세요.</p>' : ''}${(Array.isArray(q.passages) ? q.passages : []).map(p => typeof p === 'string' ? `<blockquote>${paragraphs(p)}</blockquote>` : `<blockquote>${p.title || p.label ? `<strong>${esc(p.title || p.label)}</strong>` : ''}${paragraphs(p.text || p.content)}</blockquote>`).join('')}${q.questionPage && active.url ? `<button data-question-page>${q.sourceKind === 'official_past' ? '공식 PDF 문제 쪽 열기' : q.referenceKind === 'rubric_page' ? '평가 기준' : '문제'} ${Number(q.questionPage)}쪽 읽기</button>` : ''}${q.solutionPages?.length && active.url ? `<p class="hint">해설·채점 기준 쪽: ${esc(q.solutionPages.join(', '))}쪽(원문 PDF에서 확인)</p>` : ''}${q.scoringNote ? `<p class="hint">${esc(q.scoringNote)}</p>` : ''}${q.sampleAnswer ? `<details><summary>풀이 기준·참고 답안 보기</summary><p class="hint">${q.sourceId ? '출처에 기반한 비교 기준입니다. 정답 수치 자동 비교와 서술형 풀이 점검은 구분됩니다.' : '자체 제작한 참고 답안입니다. 이 표현과 일치해야 정답이라는 뜻은 아닙니다.'}</p>${paragraphs(q.sampleAnswer)}</details>` : ''}` : '<h3>PDF 문항 자유 기록</h3><p>읽고 있는 PDF의 문항 번호와 답안을 기록하세요. 개별 정답 기준이 연결되지 않은 문항은 답안 구조 점검만 제공합니다.</p>';
      editor.querySelector('#practice-numeric').innerHTML = q?.numericAnswer ? '<label for="practice-final-answer">최종 수치 답안</label><input id="practice-final-answer" type="text" placeholder="예: 602 또는 1/2"><p class="hint">계산 결과를 비교합니다. 서술·증명 과정 배점과 구분합니다.</p>' : '';
      const finalInput = editor.querySelector('#practice-final-answer');
      if (finalInput) { finalInput.value = draft?.finalAnswer || ''; finalInput.oninput = storeDraft; }
      questionBody.querySelector('[data-question-page]')?.addEventListener('click', () => { const details = editor.querySelector('#practice-document'); if (details) details.open = true; reader?.goTo(q.questionPage); details?.scrollIntoView({ block: 'start' }); });
      editor.querySelector('#practice-question-hard').textContent = isHard(id, qkey()) ? '★ 어려운 문제 해제' : '☆ 어려운 문제 담기';
      result.innerHTML = ''; storeDraft(); setupDuration();
      if (q?.questionPage) reader?.goTo(q.questionPage);
    }
    function setupDuration() {
      const q = activeQuestion, durationSource = q?.durationVerified ? q : active;
      const verified = !!durationSource?.durationVerified && Number(durationSource.examDurationMinutes) > 0;
      const minutes = verified ? Number(durationSource.examDurationMinutes) : Number(q?.practiceDurationMinutes) || 60;
      if (!saved[id].timer || saved[id].timer.status === 'idle') {
        saved[id].timer = createTimer(minutes);
        saved[id].timerInfo = { verified, note: verified ? `${durationSource.sourceKind === 'official_mock' ? '공식 모의논술' : '해당 연도 공식 시험'} 전체 시간 ${minutes}분. ${durationSource.durationNote || '문항 하나의 권장시간과는 다릅니다.'}` : `자유 연습 ${minutes}분입니다. ${q?.durationNote || '이 문항의 실제 시험시간은 확인되지 않아 공식 시간으로 표시하지 않습니다.'}` };
        persist();
      }
      editor.querySelector('#practice-minutes').value = saved[id].timer.durationSeconds / 60;
      editor.querySelector('#practice-duration-note').textContent = saved[id].timerInfo?.note || '이전에 저장한 연습 시간입니다.';
      refreshClock();
    }
    function refreshClock() {
      if (!alive() || version !== openVersion) { clearInterval(clock); return; }
      const timer = saved[id].timer;
      if (!timer) return;
      const remaining = remainingSeconds(timer);
      if (timer.status === 'running' && remaining === 0) { saved[id].timer = pauseTimer(timer); persist(); editor.querySelector('#practice-timer-status').textContent = '설정한 시간이 끝났습니다. 현재 답안을 저장하고 피드백을 확인해 보세요.'; }
      const status = saved[id].timer.status;
      editor.querySelector('#practice-clock strong').textContent = formatRemaining(remaining);
      editor.querySelector('#practice-start').textContent = status === 'paused' ? '시간 이어하기' : '시간 시작';
      editor.querySelector('#practice-start').disabled = status === 'running' || status === 'finished';
      editor.querySelector('#practice-pause').disabled = status !== 'running';
      editor.querySelector('#practice-minutes').disabled = status === 'running';
    }
    answer.oninput = storeDraft;
    select.onchange = () => { storeDraft(); activeQuestion = qs.find(q => q.id === select.value) || null; showQuestion(); };
    editor.querySelector('#practice-start').onclick = () => {
      const minutesInput = editor.querySelector('#practice-minutes');
      try {
        if (saved[id].timer.status === 'idle' && Number(minutesInput.value) * 60 !== saved[id].timer.durationSeconds) {
          saved[id].timer = createTimer(minutesInput.value); saved[id].timerInfo = { verified: false, note: `직접 설정한 자유 연습 ${minutesInput.value}분입니다.` };
          editor.querySelector('#practice-duration-note').textContent = saved[id].timerInfo.note;
        }
        saved[id].timer = startTimer(saved[id].timer); persist(); refreshClock(); editor.querySelector('#practice-timer-status').textContent = '시간 측정을 시작했습니다.';
      } catch (e) { editor.querySelector('#practice-timer-status').textContent = e.message; }
    };
    editor.querySelector('#practice-pause').onclick = () => { saved[id].timer = pauseTimer(saved[id].timer); persist(); refreshClock(); editor.querySelector('#practice-timer-status').textContent = '연습 시간을 일시정지했습니다.'; };
    editor.querySelector('#practice-reset').onclick = () => {
      try {
        saved[id].timer = createTimer(editor.querySelector('#practice-minutes').value);
        const durationSource = activeQuestion?.durationVerified ? activeQuestion : active;
        const verified = durationSource?.durationVerified && Number(durationSource.examDurationMinutes) === saved[id].timer.durationSeconds / 60;
        saved[id].timerInfo = { verified, note: verified ? `${durationSource.sourceKind === 'official_mock' ? '공식 모의논술' : '해당 연도 공식 시험'} 전체 시간 ${durationSource.examDurationMinutes}분. ${durationSource.durationNote || ''}` : `직접 설정한 자유 연습 ${saved[id].timer.durationSeconds / 60}분입니다.` };
        persist(); editor.querySelector('#practice-duration-note').textContent = saved[id].timerInfo.note; refreshClock(); editor.querySelector('#practice-timer-status').textContent = '시간만 다시 설정했습니다. 작성한 답안은 유지됩니다.';
      } catch (e) { editor.querySelector('#practice-timer-status').textContent = e.message; }
    };
    editor.querySelector('#practice-question-hard').onclick = () => { storeDraft(); saved[id].drafts[qkey()].hard = !isHard(id, qkey()); persist(); editor.querySelector('#practice-question-hard').textContent = isHard(id, qkey()) ? '★ 어려운 문제 해제' : '☆ 어려운 문제 담기'; drawList(); };
    editor.querySelector('#practice-feedback').onclick = () => {
      storeDraft();
      const text = answer.value.trim();
      if (!text && !editor.querySelector('#practice-final-answer')?.value.trim()) { result.innerHTML = '<p role="alert">먼저 풀이 과정이나 답안을 작성해 주세요.</p>'; answer.focus(); return; }
      const evaluation = evaluateEssay(text, activeQuestion || { criteria: [] });
      const numeric = activeQuestion?.numericAnswer ? evaluateNumericAnswer(editor.querySelector('#practice-final-answer')?.value || '', activeQuestion) : null;
      const solutionSteps = Array.isArray(activeQuestion?.solutionSteps) ? activeQuestion.solutionSteps : [];
      const nextTasks = Array.isArray(activeQuestion?.nextTasks) ? activeQuestion.nextTasks : [];
      const solutionGuide = (solutionSteps.length || nextTasks.length || activeQuestion?.sampleAnswer) ? `<section class="practice-solution-guide"><h3>풀이 순서·예시답안·다음 할 일</h3>${solutionSteps.length ? `<h4>풀이 순서</h4><ol>${solutionSteps.map(step => `<li>${esc(step)}</li>`).join('')}</ol>` : ''}${activeQuestion?.sampleAnswer ? `<details><summary>예시답안 확인</summary><p>${esc(activeQuestion.sampleAnswer)}</p></details>` : ''}${nextTasks.length ? `<h4>다음 연습에서 할 일</h4><ul>${nextTasks.map(task => `<li>${esc(task)}</li>`).join('')}</ul>` : ''}<p class="hint">${activeQuestion?.sourceKind === 'official_past' ? '공식 해설이 있는 경우 원문을 최우선으로 확인하세요.' : '자체 제작 학습 기준입니다. 대학의 실제 채점 기준·정답을 대신하지 않습니다.'}</p></section>` : '';
      result.innerHTML = `<h3>답안 평가와 다음 수정</h3>${numeric ? numericFeedback(numeric, activeQuestion) : ''}<p>${esc(evaluation.summary || '답안의 근거와 구성 요소를 확인했습니다.')}</p>${(evaluation.criteria || []).map(c => `<article><h4>${esc(c.label)}</h4>${c.referenceEvidence ? `<p><strong>비교할 기준</strong> ${esc(c.referenceEvidence)}</p>` : ''}${c.evidence ? `<blockquote><strong>내 답안에서 확인한 부분</strong><br>${esc(Array.isArray(c.evidence) ? c.evidence.join(' · ') : c.evidence)}</blockquote>` : ''}<p>${esc(c.feedback || '')}</p></article>`).join('')}${evaluation.nextActions?.length ? `<h4>다음 답안에서 바꿀 것</h4><ol>${evaluation.nextActions.map(s => `<li>${esc(s)}</li>`).join('')}</ol>` : ''}${solutionGuide}${evaluation.warnings?.length ? `<p class="hint">${evaluation.warnings.map(esc).join(' ')}</p>` : ''}<p class="hint">서술형 피드백은 학습을 돕는 기준 비교입니다. 대학의 실제 채점 결과나 합격 가능성을 산출하지 않습니다.</p><button id="practice-revise">답안 고쳐 쓰기</button>`;
      result.querySelector('#practice-revise').onclick = () => answer.focus(); result.scrollIntoView({ block: 'start', behavior: 'smooth' });
    };
    showQuestion(); clock = setInterval(refreshClock, 500);
    editor.querySelector('h2').focus({ preventScroll: true }); editor.scrollIntoView({ block: 'start', behavior: 'smooth' });
    if (active.url) {
      const control = await renderDocument(editor.querySelector('#practice-pdf'), { resourceId: id, title: active.title, originalUrl: active.url, initialPage: activeQuestion?.questionPage || 1 });
      if (!alive() || version !== openVersion) control.destroy(); else { reader = control; if (activeQuestion?.questionPage) reader.goTo(activeQuestion.questionPage); }
    }
  }
  [mode, school, subject, hard].forEach(control => control.onchange = () => { page = 0; drawList(); });
  school.onchange = () => {
    if (mode.value === 'questions' && school.value && !readyQuestions.some(q => schoolFor(q) === school.value) && resources.some(r => r.universityName === school.value)) mode.value = 'resources';
    subject.value = ''; page = 0; drawList();
  };
  const previous = saved._session;
  if (previous) {
    mode.value = previous.mode === 'resources' ? 'resources' : 'questions';
    if ([...school.options].some(o => o.value === previous.school)) school.value = previous.school;
    if ([...subject.options].some(o => o.value === previous.subject)) subject.value = previous.subject;
  }
  drawList();
  if (previous?.id) open(previous.id, previous.questionId);
}
