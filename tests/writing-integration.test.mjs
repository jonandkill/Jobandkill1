import test from 'node:test';
import assert from 'node:assert/strict';
import {buildWritingDraft, reviewWritingDraft} from '../public/writing-engine.js';
import {extractResumeEvidence, buildPracticeQuestions, interviewFeedback} from '../public/interview-view.js';

// Event-level harness for storage/lifecycle contracts; actual DOM and mobile
// presentation are checked separately in the operational browser.
function editorHarness() {
  const storage = new Map(), windowListeners = new Map();
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis,'window');
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  Object.defineProperty(globalThis,'window',{configurable:true,value:{
    confirm:()=>true,
    addEventListener:(name,handler)=>windowListeners.set(name,handler),
    removeEventListener:(name,handler)=>{if(windowListeners.get(name)===handler)windowListeners.delete(name);}
  }});
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{
    getItem:key=>storage.get(key)??null,
    setItem:(key,value)=>storage.set(key,value),
    removeItem:key=>storage.delete(key)
  }});
  const leaf = {focus(){},scrollIntoView(){},classList:{toggle(){}},textContent:'',innerHTML:''};
  const handlers = new Map();
  const root = {innerHTML:'',querySelector:()=>leaf,contains:()=>true,
    addEventListener:(name,handler)=>handlers.set(name,handler),
    removeEventListener:(name,handler)=>{if(handlers.get(name)===handler)handlers.delete(name);}
  };
  return {root,storage,windowListeners,
    input:(key,value)=>handlers.get('input')({target:{dataset:{writingField:key},value}}),
    consent:checked=>handlers.get('change')({target:{checked,matches:()=>true}}),
    async click(action){const button={dataset:{writingAction:action},isConnected:true};await handlers.get('click')({target:{closest:()=>button}});},
    close(){for(const [name,descriptor] of [['window',previousWindow],['localStorage',previousStorage]]){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}}
  };
}

test('reviewed writing enters interview as exact evidence with school and major context', () => {
  const draft = buildWritingDraft({
    experience:'과학 동아리에서 같은 물 시료를 측정했지만 측정값이 달랐습니다.',
    action:'저는 측정 위치와 시간을 비교하고 기록하는 역할을 맡았습니다.',
    result:'조건을 통일한 뒤 측정값의 차이가 줄었습니다.',
    learning:'측정 조건과 기록을 함께 확인하는 중요성을 배웠습니다.'
  });
  const edited = draft.text + '\n간호학과에서 관찰 기록의 정확성을 더 배우고 싶습니다.';
  const context = {school:'울산대학교',major:'간호학과'};
  const review = reviewWritingDraft(edited, context);
  const questions = buildPracticeQuestions({...context,evidence:extractResumeEvidence(edited)});
  assert.ok(review.items.some(item => item.feedback.includes('울산대학교 간호학과')));
  assert.ok(questions.find(question => question.id === 'target-motivation').text.includes('울산대학교 간호학과'));
  const sourceQuestions = questions.filter(question => question.id.startsWith('resume-'));
  assert.ok(sourceQuestions.length > 0);
  for (const question of sourceQuestions) {
    assert.ok(edited.includes(question.evidence), 'questions must quote the reviewed version');
    assert.ok(question.text.includes(question.evidence));
    assert.match(question.kind, /실제 기출 아님/);
  }
  assert.equal('score' in review, false);
  assert.equal('probability' in interviewFeedback(edited,context), false);
});

test('replacement source cannot reuse an earlier draft as interview evidence', () => {
  const first = buildWritingDraft({experience:'과학 동아리에서 측정값이 서로 달라 원인을 비교하는 탐구를 했습니다.'});
  const revised = buildWritingDraft({experience:'봉사 활동에서 안내문을 이해하기 어려워하는 참여자와 대화했습니다.'});
  const firstEvidence = extractResumeEvidence(first.text);
  const questions = buildPracticeQuestions({evidence:extractResumeEvidence(revised.text)});
  for (const question of questions.filter(question => question.id.startsWith('resume-'))) {
    assert.ok(revised.text.includes(question.evidence));
    assert.equal(firstEvidence.some(entry => entry.text === question.evidence), false);
  }
});

test('incomplete actual experience produces practice without invented achievements or interview facts', () => {
  const input = '저는 동아리에서 물의 오염도를 조사했지만 아직 결과를 확인하지 못했습니다.';
  const draft = buildWritingDraft({experience:input});
  const questions = buildPracticeQuestions({school:'선택 대학',major:'선택 학과',evidence:extractResumeEvidence(draft.text)});
  assert.equal(draft.parts.some(part => part.key === 'result'), false);
  assert.equal(questions.some(question => question.id === 'target-official'), false);
  assert.ok(questions.filter(question => question.id.startsWith('resume-')).every(question => draft.text.includes(question.evidence)));
  assert.equal('admissionProbability' in reviewWritingDraft(draft.text), false);
});

test('editor preserves the revised version between steps and hands off only on explicit use', async () => {
  const h=editorHarness();
  try {
    const {mountWriting}=await import('../public/writing-view.js?qa=review-handoff');
    const received=[];
    const editor=mountWriting(h.root,{initiallyOpen:true,getContext:()=>({schoolId:'0000200',school:'울산대학교',major:'간호학과'}),onUseDraft:draft=>received.push(draft)});
    h.input('experience','과학 동아리에서 같은 물 시료를 측정했지만 값이 달랐습니다.');await h.click('next');
    h.input('action','저는 측정 조건을 비교하고 기록하는 역할을 맡았습니다.');await h.click('next');
    h.input('result','조건을 통일하고 다시 실험하니 차이가 줄었습니다.');await h.click('next');
    const revised='제가 직접 측정 위치를 통일하고 세 번 반복해 기록하자고 제안했습니다. 간호학과에서 관찰의 정확성을 더 배우고 싶습니다.';
    h.input('draft',revised);
    await h.click('previous');h.input('learning','관찰 조건을 확인하는 중요성을 배웠습니다.');await h.click('next');
    assert.equal(received.length,0,'editing and navigating must not transfer the source');
    await h.click('use');
    assert.equal(received.length,1);
    assert.equal(received[0].text,revised);
    assert.equal(received[0].schoolId,'0000200');
    assert.equal(received[0].school,'울산대학교');
    assert.equal(received[0].major,'간호학과');
    assert.equal(h.storage.size,0,'unsaved private text stays out of browser storage');
    editor.destroy();assert.equal(h.windowListeners.size,0);
  } finally {h.close();}
});

test('device storage requires explicit selection and disabling it retains the live draft only', async () => {
  const h=editorHarness();
  try {
    const {mountWriting}=await import('../public/writing-view.js?qa=storage-consent');
    const editor=mountWriting(h.root,{initiallyOpen:true,getContext:()=>({school:'울산대학교',major:'화학과'})});
    const text='실험에서 같은 시료의 측정값이 달라 조건을 비교하고 확인했습니다.';
    h.input('experience',text);assert.equal(h.storage.size,0);
    h.consent(true);
    const saved=JSON.parse(h.storage.get('jobnkill-writing-v1'));
    assert.equal(saved.experience,text);assert.equal(saved.school,'울산대학교');assert.equal(saved.major,'화학과');
    h.consent(false);assert.equal(h.storage.size,0);
    h.consent(true);assert.equal(JSON.parse(h.storage.get('jobnkill-writing-v1')).experience,text,'unchecking device storage must preserve active editing');
    editor.destroy();assert.equal(h.windowListeners.size,0);
  } finally {h.close();}
});

test('saved writing can restore a campus identifier and manual major before mounting the interview', async () => {
  const h=editorHarness();
  try {
    h.storage.set('jobnkill-writing-v1',JSON.stringify({version:1,consent:true,schoolId:'special-unist',school:'울산과학기술원',major:'직접 입력한 관심 분야',experience:'보관한 개인 경험은 목표 복원 API의 반환값에 포함하지 않습니다.'}));
    const {getSavedWritingTarget}=await import('../public/writing-view.js?qa=restore-target');
    assert.deepEqual(getSavedWritingTarget(),{schoolId:'special-unist',school:'울산과학기술원',major:'직접 입력한 관심 분야'});
    assert.equal('experience' in getSavedWritingTarget(),false);
  } finally {h.close();}
});
