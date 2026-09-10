import {buildWritingDraft, reviewWritingDraft} from './writing-engine.js';

const STORAGE_KEY = 'jobnkill-writing-v1';
const FIELD_KEYS = ['experience', 'action', 'result', 'learning'];
const LABELS = ['경험 떠올리기', '내 행동 정리', '결과와 배운 점', '작성문 확인'];
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clean = (value, limit = 16000) => typeof value === 'string' ? value.slice(0, limit) : '';
const emptyState = () => ({experience:'', action:'', result:'', learning:'', draft:'', sourceSignature:'', edited:false, step:0, started:false, consent:false, review:null, warnings:[], mode:'original', schoolId:'', school:'', major:''});
let session = null;
let mountNumber = 0;

function restoreState() {
  if (session) return session;
  session = emptyState();
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved?.version === 1 && saved.consent === true) {
      for (const key of FIELD_KEYS) session[key] = clean(saved[key], 4000);
      session.draft = clean(saved.draft);
      session.sourceSignature = clean(saved.sourceSignature, 17000);
      session.schoolId = clean(saved.schoolId, 200);
      session.school = clean(saved.school, 200);
      session.major = clean(saved.major, 200);
      session.edited = saved.edited === true;
      session.mode = saved.mode === 'polished' ? 'polished' : 'original';
      session.step = Number.isInteger(saved.step) ? Math.max(0, Math.min(3, saved.step)) : 0;
      session.started = true;
      session.consent = true;
    }
  } catch { /* An unavailable or malformed store must not stop the editor. */ }
  return session;
}

export function getSavedWritingTarget() {
  const saved = restoreState();
  return saved.consent ? {schoolId:saved.schoolId, school:saved.school, major:saved.major} : null;
}

/** In-page editor. Call destroy() before replacing its root; drafts remain in module memory. */
export function mountWriting(root, {getContext = () => ({}), onUseDraft = () => {}, initiallyOpen = false} = {}) {
  if (!root) throw new TypeError('작성 화면을 표시할 위치가 없습니다.');
  const state = restoreState();
  const prefix = 'writing-' + (++mountNumber);
  let destroyed = false;
  let busy = false;
  let savedSuccessfully = false;
  let context = {schoolId:state.schoolId, school:state.school, major:state.major};
  let statusMessage = '';
  const $ = selector => root.querySelector(selector);
  const signature = () => JSON.stringify(FIELD_KEYS.map(key => state[key]));
  const hasContent = () => !!(state.draft.trim() || FIELD_KEYS.some(key => state[key].trim()));
  const original = () => FIELD_KEYS.map(key => state[key].trim()).filter(Boolean).join('\n\n');
  const contextLabel = () => [context.school, context.major].filter(Boolean).join(' · ') || '대학·학과를 선택하면 작성문에도 함께 연결돼요.';

  function latestContext() {
    try { setContext(getContext() || {}); } catch { /* Keep the last valid selection. */ }
    return context;
  }
  function announce(message, error = false) {
    statusMessage = message;
    const node = $('[data-writing-status]');
    if (node) { if (node.textContent !== message) node.textContent = message; node.classList.toggle('writing-error', error); }
  }
  function persist({silent = false} = {}) {
    if (!state.consent) { savedSuccessfully = false; return; }
    try {
      const {review, warnings, ...value} = state;
      localStorage.setItem(STORAGE_KEY, JSON.stringify({...value, version:1, consent:true}));
      savedSuccessfully = true;
      if (!silent) announce('이 기기에 저장했어요. 같은 브라우저에서 이어 쓸 수 있어요.');
    } catch {
      savedSuccessfully = false;
      announce('기기에 저장하지 못했어요. 현재 글은 화면에 유지됩니다. 작성문 확인에서 TXT로 내려받아 주세요.', true);
    }
  }
  function setContext(next = {}) {
    const incoming = {schoolId:clean(next.schoolId, 200), school:clean(next.school, 200), major:clean(next.major, 200)};
    if (incoming.schoolId !== context.schoolId || incoming.school !== context.school || incoming.major !== context.major) {
      state.review = null;
      const feedback = $('[data-writing-feedback]');
      if (feedback?.textContent) feedback.innerHTML = '<p class="writing-note">대학·학과 선택이 바뀌었어요. 작성문은 유지했으며 보완점 확인을 다시 누르면 현재 선택을 반영해요.</p>';
    }
    context = incoming;
    state.schoolId = context.schoolId;
    state.school = context.school;
    state.major = context.major;
    const node = $('[data-writing-context]');
    if (node) node.textContent = contextLabel();
    if (state.consent) persist({silent:true});
  }
  function focusStage() {
    const heading = $('[data-writing-stage-title]');
    heading?.focus({preventScroll:true});
    heading?.scrollIntoView({block:'start', behavior:'auto'});
  }
  function renderFeedback() {
    if (!state.review) return '';
    const review = state.review;
    return '<section class="writing-feedback" aria-labelledby="'+prefix+'-feedback-heading"><h4 id="'+prefix+'-feedback-heading">내 문장에서 찾은 보완점</h4><p class="writing-note">표현과 구성에 관한 피드백이에요. 경험의 진위나 대학의 평가 결과를 판단하는 점수는 아닙니다.</p>'+
      (review.priority?.length ? '<div class="writing-priority"><strong>먼저 보완할 부분</strong><ul>'+review.priority.slice(0,3).map(item => '<li>'+esc(item)+'</li>').join('')+'</ul></div>' : '')+
      '<div class="writing-feedback-items">'+(review.items || []).map(item => '<article><h5>'+esc(item.label)+'</h5>'+(item.evidence ? '<blockquote>'+esc(item.evidence)+'</blockquote>' : '')+'<p>'+esc(item.feedback)+'</p></article>').join('')+'</div></section>';
  }
  function field(key, label, hint, placeholder) {
    return '<label for="'+prefix+'-'+key+'">'+label+'</label><p id="'+prefix+'-'+key+'-help" class="writing-note">'+hint+'</p><textarea id="'+prefix+'-'+key+'" data-writing-field="'+key+'" rows="6" maxlength="4000" aria-describedby="'+prefix+'-'+key+'-help" placeholder="'+esc(placeholder)+'">'+esc(state[key])+'</textarea>';
  }
  function stageBody() {
    if (state.step === 0) return '<p class="writing-step-kicker">01 · 실제 있었던 경험</p><h3 tabindex="-1" data-writing-stage-title>어떤 경험을 이야기하고 싶나요?</h3>'+field('experience','활동과 당시 상황','수업·탐구·동아리 등에서 기억나는 경험 하나를 골라, 무엇이 어려웠는지 적어 보세요.','예: 과학 동아리에서 같은 실험을 반복했는데 조마다 결과가 달랐습니다.');
    if (state.step === 1) return '<p class="writing-step-kicker">02 · 내가 선택한 방법</p><h3 tabindex="-1" data-writing-stage-title>그때 직접 무엇을 했나요?</h3>'+field('action','내가 맡은 일과 행동','팀이 함께 한 일 중 본인이 결정하고 실행한 부분을 구분하고, 그 방법을 택한 이유를 적어 보세요.','예: 저는 측정 조건을 비교하고, 차이를 확인하기 위해 실험 기록 양식을 통일하자고 제안했습니다.');
    if (state.step === 2) return '<p class="writing-step-kicker">03 · 확인한 변화와 배움</p><h3 tabindex="-1" data-writing-stage-title>무엇이 달라졌고, 무엇을 배웠나요?</h3>'+field('result','결과와 확인 근거','숫자가 없어도 괜찮아요. 관찰한 변화나 받은 피드백, 아직 해결하지 못한 점을 적어도 좋아요.','예: 기록을 비교하면서 조건이 달랐던 실험을 찾아 다시 측정할 수 있었습니다.')+field('learning','배운 점과 이어갈 학습 (선택)','생각이 바뀐 부분이나 지원 학과에서 더 알아보고 싶은 내용을 덧붙여 보세요.','예: 결과를 해석하기 전에 측정 조건부터 확인해야 한다는 점을 배웠습니다.');
    const changed = state.sourceSignature && state.sourceSignature !== signature();
    return '<p class="writing-step-kicker">04 · 내 말로 마무리</p><h3 tabindex="-1" data-writing-stage-title>작성문을 확인하고 면접 연습으로 이어가요</h3><p class="writing-note">입력한 문장을 모았어요. 직접 고치거나 문장 흐름을 다듬은 뒤, 사용할 글을 확인해 주세요.</p>'+
      (changed ? '<p class="writing-change-note">이전 단계의 입력이 바뀌었어요. 지금 편집한 글은 유지했으며, 아래 버튼을 누르면 바뀐 입력으로 다시 만들 수 있어요.</p>' : '')+
      '<div class="writing-secondary-actions"><button type="button" data-writing-action="original">입력 문장 그대로 모으기</button><button type="button" data-writing-action="polish">문장 흐름 다듬기</button></div>'+
      (state.warnings.length ? '<ul class="writing-note">'+state.warnings.map(w => '<li>'+esc(w)+'</li>').join('')+'</ul>' : '')+
      '<label for="'+prefix+'-draft">작성문 · 자유롭게 편집할 수 있어요</label><textarea id="'+prefix+'-draft" data-writing-field="draft" rows="12" maxlength="16000" aria-describedby="'+prefix+'-count">'+esc(state.draft)+'</textarea><p id="'+prefix+'-count" class="writing-counter" data-writing-count>공백 포함 '+[...state.draft].length.toLocaleString('ko-KR')+'자</p>'+
      '<div class="writing-secondary-actions"><button type="button" data-writing-action="review">이 글의 보완점 확인</button><button type="button" data-writing-action="download">TXT로 내려받기</button></div><div data-writing-feedback>'+renderFeedback()+'</div>';
  }
  function render() {
    if (destroyed) return;
    if (!state.started) {
      root.innerHTML = '<section class="writing-entry" aria-labelledby="'+prefix+'-title"><div><p class="writing-step-kicker">글 작성부터 질문 연습까지</p><h3 id="'+prefix+'-title">면접용 경험 정리</h3><p>경험을 짧게 정리하고, 내 글에서 면접 질문을 만들어 보세요.</p><p class="writing-context" data-writing-context>'+esc(contextLabel())+'</p></div><button type="button" class="primary" data-writing-action="open">'+(hasContent() ? '이어서 작성하기' : '경험 정리 시작')+'</button></section>';
      return;
    }
    root.innerHTML = '<section class="writing-editor" aria-label="면접용 경험 작성"><header class="writing-header"><div><p class="writing-step-kicker">면접용 경험 정리</p><p class="writing-context" data-writing-context>'+esc(contextLabel())+'</p></div><button class="writing-collapse" type="button" data-writing-action="collapse">접어두기</button></header>'+
      '<div class="writing-progress"><div><strong>'+(state.step+1)+' / 4단계</strong><span>'+(state.step === 3 ? '작성 완료 · 확인하고 연습해요' : '입력 단계 '+(3-state.step)+'개 남았어요')+'</span></div><progress max="4" value="'+(state.step+1)+'" aria-label="작성 단계 '+(state.step+1)+' / 4">'+(state.step+1)+'/4</progress><ol aria-label="작성 순서">'+LABELS.map((label,index) => '<li'+(index === state.step ? ' aria-current="step"' : '')+'>'+esc(label)+'</li>').join('')+'</ol></div>'+
      '<div class="writing-stage">'+stageBody()+'</div><p class="writing-status" data-writing-status role="status" aria-live="polite">'+esc(statusMessage)+'</p>'+
      '<footer class="writing-footer"><div class="writing-step-actions">'+(state.step ? '<button type="button" data-writing-action="previous">이전</button>' : '<span></span>')+'<button type="button" class="primary" data-writing-action="'+(state.step === 3 ? 'use' : 'next')+'">'+(state.step === 3 ? '이 글로 면접 질문 만들기' : state.step === 2 ? '작성문 확인' : '다음')+'</button></div><label class="writing-persist"><input type="checkbox" data-writing-persist'+(state.consent ? ' checked' : '')+'> 이 기기에 작성 내용 저장하기</label><p class="writing-note writing-storage-note">'+(state.consent ? '같은 브라우저에서 이어 쓸 수 있어요. 공용 기기에서는 저장을 해제해 주세요.' : '저장하지 않으면 사이트 메뉴를 이동할 때만 유지돼요. 새로고침하거나 창을 닫기 전에는 TXT로 내려받아 주세요.')+'</p><button type="button" class="writing-clear" data-writing-action="clear">작성 내용 모두 지우기</button></footer></section>';
  }
  function generate(mode, confirmReplace = true) {
    if (confirmReplace && state.draft.trim() && (state.edited || state.sourceSignature !== signature())) {
      if (!window.confirm('편집한 작성문을 현재 입력으로 다시 만들까요? 지금 작성문을 보관하려면 취소한 뒤 TXT로 내려받아 주세요.')) return false;
    }
    try {
      const result = buildWritingDraft(Object.fromEntries(FIELD_KEYS.map(key => [key, state[key]])));
      state.draft = mode === 'polished' ? result.text : (result.originalText || original());
      state.warnings = Array.isArray(result.warnings) ? result.warnings.map(String) : [];
      state.mode = mode;
      state.sourceSignature = signature();
      state.edited = false;
      state.review = null;
      persist({silent:true});
      return true;
    } catch (error) {
      announce(error?.message || '작성문을 만들지 못했어요. 입력 내용은 유지했으니 다시 확인해 주세요.', true);
      return false;
    }
  }
  function download() {
    if (!state.draft.trim()) { announce('내려받을 작성문을 먼저 입력해 주세요.', true); return; }
    try {
      const blob = new Blob(['\uFEFF'+state.draft], {type:'text/plain;charset=utf-8'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = '잡앤킬_면접경험_작성문.txt';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      announce('TXT 내려받기를 요청했어요. 기기의 다운로드 목록에서 확인해 주세요.');
    } catch { announce('내려받기를 시작하지 못했어요. 작성문을 선택해 복사하거나 다시 시도해 주세요.', true); }
  }
  async function onClick(event) {
    const button = event.target.closest('[data-writing-action]');
    if (!button || !root.contains(button) || destroyed || busy) return;
    const action = button.dataset.writingAction;
    latestContext();
    if (action === 'open') { state.started = true; render(); focusStage(); return; }
    if (action === 'collapse') { state.started = false; render(); $('[data-writing-action="open"]')?.focus(); return; }
    if (action === 'previous') { state.step = Math.max(0, state.step-1); statusMessage=''; persist({silent:true}); render(); focusStage(); return; }
    if (action === 'next') {
      const key = FIELD_KEYS[state.step];
      if (!state[key].trim()) {
        announce(state.step === 0 ? '이야기할 경험을 한 문장부터 적어 주세요.' : state.step === 1 ? '본인이 직접 한 행동을 적어 주세요.' : '관찰한 결과나 아직 해결하지 못한 점을 적어 주세요.', true);
        $('[data-writing-field="'+key+'"]')?.focus(); return;
      }
      if (state.step === 2 && !state.draft.trim() && !generate('original', false)) return;
      state.step = Math.min(3, state.step+1); statusMessage=''; persist({silent:true}); render(); focusStage(); return;
    }
    if (action === 'original' || action === 'polish') {
      if (generate(action === 'polish' ? 'polished' : 'original')) { statusMessage=action === 'polish' ? '입력한 내용을 바탕으로 문장 흐름을 다듬었어요. 표현과 사실을 확인해 주세요.' : '입력 문장을 그대로 모았어요. 작성문을 직접 편집할 수 있어요.'; render(); $('[data-writing-field="draft"]')?.focus(); }
      return;
    }
    if (action === 'review') {
      if (state.draft.trim().length < 20) { announce('보완점을 확인하려면 작성문을 20자 이상 입력해 주세요.', true); return; }
      try {
        state.review = reviewWritingDraft(state.draft, latestContext());
        $('[data-writing-feedback]').innerHTML = renderFeedback();
        announce('내 문장을 근거로 보완점을 정리했어요. 먼저 보완할 부분부터 확인해 주세요.');
        $('[data-writing-feedback]')?.scrollIntoView({block:'start',behavior:'auto'});
      } catch (error) { announce(error?.message || '피드백을 만들지 못했어요. 글은 유지되니 다시 시도해 주세요.', true); }
      return;
    }
    if (action === 'download') { download(); return; }
    if (action === 'use') {
      if (state.draft.trim().length < 20) { announce('질문으로 연습할 경험을 20자 이상 입력해 주세요.', true); $('[data-writing-field="draft"]')?.focus(); return; }
      busy = true; button.disabled = true;
      try { await onUseDraft({text:state.draft.trim(), ...latestContext()}); if (!destroyed) announce('확인한 글을 면접 질문에 반영했어요. 아래에서 질문을 선택하고 답변해 보세요.'); }
      catch (error) { if (!destroyed) announce(clean(error?.message, 500) || '면접 질문에 연결하지 못했어요. 작성문은 유지했으니 다시 시도해 주세요.', true); }
      finally { busy = false; if (!destroyed && button.isConnected) button.disabled = false; }
      return;
    }
    if (action === 'clear') {
      if (hasContent() && !window.confirm('이 화면의 경험 입력과 작성문을 모두 지울까요? 이 기기에 저장한 작성 내용도 삭제됩니다. 필요한 글은 먼저 TXT로 내려받아 주세요.')) return;
      try { localStorage.removeItem(STORAGE_KEY); }
      catch {
        if (state.consent) { announce('기기에 저장한 내용을 삭제하지 못했어요. 현재 글은 유지했습니다. 브라우저 저장 권한을 확인한 뒤 다시 시도해 주세요.', true); return; }
      }
      Object.assign(state, emptyState(), context, {started:true});
      savedSuccessfully=false; statusMessage='작성 내용을 지웠어요. 새로운 경험부터 시작할 수 있어요.'; render(); focusStage();
    }
  }
  function onInput(event) {
    const key = event.target.dataset?.writingField;
    if (!key || ![...FIELD_KEYS,'draft'].includes(key)) return;
    state[key] = event.target.value;
    if (key === 'draft') {
      state.edited=true; state.review=null;
      const count=$('[data-writing-count]');
      if (count) count.textContent='공백 포함 '+[...state.draft].length.toLocaleString('ko-KR')+'자';
      const feedback=$('[data-writing-feedback]');
      if (feedback?.textContent) feedback.innerHTML='<p class="writing-note">글이 바뀌었어요. 보완점 확인을 다시 눌러 현재 글에 대한 피드백을 받아 보세요.</p>';
    }
    persist();
  }
  function onChange(event) {
    if (!event.target.matches('[data-writing-persist]')) return;
    const consent=event.target.checked;
    if (!consent) {
      try { localStorage.removeItem(STORAGE_KEY); }
      catch { event.target.checked=true; announce('기기에 저장한 내용을 삭제하지 못했어요. 글은 유지했으니 브라우저 저장 권한을 확인해 주세요.', true); return; }
    }
    state.consent=consent; savedSuccessfully=false;
    if (consent) persist();
    else announce('기기에 저장한 내용을 삭제했어요. 현재 글은 이 페이지 안에서 계속 편집할 수 있어요.');
    const note=$('.writing-storage-note');
    if (note) note.textContent=consent ? '같은 브라우저에서 이어 쓸 수 있어요. 공용 기기에서는 저장을 해제해 주세요.' : '저장하지 않으면 사이트 메뉴를 이동할 때만 유지돼요. 새로고침하거나 창을 닫기 전에는 TXT로 내려받아 주세요.';
  }
  function beforeUnload(event) {
    if (hasContent() && (!state.consent || !savedSuccessfully)) { event.preventDefault(); event.returnValue=''; }
  }
  root.addEventListener('click', onClick);
  root.addEventListener('input', onInput);
  root.addEventListener('change', onChange);
  window.addEventListener('beforeunload', beforeUnload);
  latestContext();
  if (initiallyOpen) state.started=true;
  render();
  return {
    setContext,
    open() { if (destroyed) return; latestContext(); state.started=true; render(); focusStage(); },
    destroy() { if (destroyed) return; destroyed=true; root.removeEventListener('click',onClick); root.removeEventListener('input',onInput); root.removeEventListener('change',onChange); window.removeEventListener('beforeunload',beforeUnload); }
  };
}
