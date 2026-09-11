import {mountWriting,getSavedWritingTarget} from './writing-view.js';
import {buildWritingInterviewQuestions} from './writing-engine.js';
let interviewSession = null;
const materialAnswerSets = new Map();
export function cleanupInterview(root) {
  root?._interviewCleanup?.();
  if(root){root._interviewCleanup=null;root._interviewGeneration=null;}
}
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl = value => /^https:\/\//i.test(String(value || '')) ? value : '';
const inactive = new Set(['0000431', '0002659', '0000548']);
const legacyFields = ['situation', 'role', 'action', 'result', 'learning'];
const rules = [
  {key:'situation', label:'상황과 문제', pattern:/학년|수업|동아리|프로젝트|활동|실험|과제|당시|문제|갈등|봉사|탐구/, prompt:'언제, 어떤 과제에서 무엇이 어려웠는지 한 문장으로 좁혀 보세요.'},
  {key:'role', label:'내가 맡은 역할', pattern:/저는|제가|나는|내가|맡[았은아]|담당|역할|책임|주도/, prompt:'팀 전체가 한 일과 내가 책임진 일을 나누고, “제가 맡은 일은 …입니다”를 덧붙여 보세요.'},
  {key:'action', label:'선택과 행동', pattern:/분석|비교|측정|기록|검증|통제|조사|설계|제안|실행|수정|계획|설득|정리|연습|질문|관찰|확인/, prompt:'직접 한 행동을 순서대로 쓰고, 다른 방법 대신 그 방법을 선택한 이유를 덧붙여 보세요.'},
  {key:'result', label:'결과와 확인 근거', pattern:/결과|변화|줄[었인]|늘[었린]|향상|완성|개선|피드백|성공|실패|기록|측정|보고서|\d\s*(?:명|회|번|점|%|분|시간|개)/, prompt:'전후에 무엇이 달라졌는지 적고, 확인 가능한 기록·관찰·피드백으로 뒷받침해 보세요. 없는 수치를 만들 필요는 없습니다.'},
  {key:'learning', label:'배운 점과 전공 연결', pattern:/배[웠운우]|깨[달닫]|알게|한계|보완|앞으로|전공|학과|진학|배우고|공부하|학습/, prompt:'이 경험으로 바뀐 생각 한 가지와 지원 학과에서 이어서 배우고 싶은 내용을 연결해 보세요.'}
];

export function splitSentences(text = '') {
  return String(text).replace(/\r/g, '').split(/(?<=[.!?。！？])\s+|\n+/).map(x => x.trim()).filter(Boolean);
}

function relevantEvidence(key, sentences) {
  const actionVerb=/(?:분석|비교|측정|기록|검증|통제|조사|설계|제안|실행|수정|설득|정리|연습|관찰|확인|통일|반복)(?:했|하|해|한|하여|하고|하도록|해보|해 보)/;
  const rolePhrase=/담당|역할|책임|맡[았은아]/;
  const cues={
    situation:[[/어렵|어려|달라|달랐|문제|갈등|실패|부족|처음|당시|오류|불일치/,6],[/학년|수업|동아리|프로젝트|활동|실험|과제|봉사|탐구/,2]],
    role:[[rolePhrase,6],[/저는|제가|나는|내가/,1],[/(?:저는|제가|나는|내가).*(?:분석|비교|조사|설계|실행|제안|통제)/,3]],
    action:[[actionVerb,5],[/제안했|선택했|통일하|수정했|통제했/,3],[/먼저|다음|반복|위해|때문|저는|제가|내가/,1]],
    result:[[/줄었|늘었|향상되|향상됐|높아졌|낮아졌|개선되|개선됐|완성했|성공했|실패했|달라졌|도달했|피드백을 받|평가를 받|확인할 수 있었/,6],[/전후|이전보다|이후에는|그 결과|그결과|변화가/,3],[/\d\s*(?:명|회|번|점|%|분|시간|개)/,1]],
    learning:[[/배웠|배운|깨달|알게 되|알게되|중요성을|한계를/,6],[/앞으로|전공|학과|진학|배우고|공부하|학습|지키고 싶/,3]]
  };
  const minimum={situation:2,role:2,action:5,result:3,learning:3};
  return sentences.map((sentence,index)=>{
    let relevance=(cues[key]||[]).reduce((sum,[pattern,weight])=>sum+(pattern.test(sentence)?weight:0),0);
    if(key!=='role'&&rolePhrase.test(sentence)&&!actionVerb.test(sentence)&&!/(문제|어려|갈등|줄었|배웠|깨달)/.test(sentence))relevance=0;
    if(key==='action'&&/배웠|배운|깨달|중요성을/.test(sentence))relevance-=4;
    if(key==='result'&&/배웠|배운|깨달|싶습니다|계획입니다/.test(sentence))relevance=0;
    return {sentence,index,relevance};
  }).filter(row=>row.relevance>=minimum[key]).sort((a,b)=>b.relevance-a.relevance||a.index-b.index)[0]?.sentence;
}

// A marker is an expression to discuss, not proof of ability or factual accuracy.
export function interviewFeedback(value = '', context = {}) {
  const text = typeof value === 'string' ? value.trim() : legacyFields.map(k => String(value[k] || '').trim()).filter(Boolean).join('\n\n');
  const sentences = splitSentences(text);
  const items = rules.map(rule => {
    const sentence = relevantEvidence(rule.key,sentences);
    return {key:rule.key, label:rule.label, detected:!!sentence, filled:!!sentence, evidence:sentence || '', feedback:sentence ? '이 문장을 근거로 설명할 수 있어요. ' + rule.prompt : rule.prompt};
  });
  const followups = [];
  const action = items.find(x => x.key === 'action');
  const result = items.find(x => x.key === 'result');
  if (action.detected) followups.push('“' + action.evidence.slice(0, 100) + '”에서 본인이 선택한 방법의 이유와 다른 방법의 한계는 무엇인가요?');
  if (result.detected) followups.push('“' + result.evidence.slice(0, 100) + '”를 뒷받침할 관찰·기록이 있나요? 팀의 기여와 내 기여를 구분해 설명해 보세요.');
  if (text) followups.push((context.major || '지원 전공') + '에서 이 경험을 어떤 학습으로 이어가고 싶나요?');
  const priority = items.filter(x => !x.detected).map(x => x.feedback);
  if (text && !/(때문|위해|그래서|따라서|판단|이유|선택)/.test(text)) priority.push('행동의 이유가 명확한지 살펴보세요. “이 방법을 선택한 이유는 …” 뒤에 판단 기준을 써 보세요.');
  if (text && /우리|팀원|함께/.test(text) && !/제가|저는|내가|나는/.test(text)) priority.unshift('답변이 팀 중심으로 읽힐 수 있어요. 같은 경험에서 내가 결정하고 실행한 부분을 별도로 설명해 보세요.');
  if (text && !priority.length) priority.push('첫 문장이 질문에 직접 답하는지 확인한 뒤, 가장 중요한 행동 하나와 그 근거를 중심으로 줄여 보세요.', '제시한 결과를 확인할 기록과, 다시 한다면 바꿀 점을 추가 질문에 대비해 준비하세요.');
  return {text, items, filled:items.filter(x => x.detected).length, characters:[...text].length, followups, priority:priority.slice(0,3)};
}

export function extractResumeEvidence(text = '') {
  return splitSentences(String(text).slice(0, 30000)).filter(s => s.length >= 12).map((s, index) => ({
    text:s.slice(0, 350), index,
    weight:(/활동|프로젝트|탐구|실험|봉사|협업|연구|동아리|수업/.test(s) ? 3 : 0) + (/맡|담당|분석|비교|개선|배웠|배운|지원|전공/.test(s) ? 2 : 0)
  })).sort((a,b) => b.weight-a.weight || a.index-b.index).slice(0, 6);
}

export function buildPracticeQuestions({school = '', major = '', evidence = [], formats = [], basics = []} = {}) {
  const target = [school, major].filter(Boolean).join(' ') || '지원 대학·학과';
  const result = [
    {id:'target-motivation', category:'대학·학과 지원동기', text:target + '에 지원하려는 이유를 자신의 경험과 연결해서 설명해 주세요.', kind:'학교·학과 맞춤 연습 질문 · 실제 기출 아님'},
    {id:'target-curriculum', category:'교육과정과 학습계획', text:target + '의 공식 교육과정에서 직접 확인한 과목 한 가지와, 그 과목을 배우기 위해 준비한 경험을 설명해 주세요.', kind:'교육과정 확인용 연습 질문 · 특정 과목을 임의로 가정하지 않음'},
    ...basics.map(q => ({...q}))
  ];
  const domains = [
    [/간호|의학|의예|치의|약학|보건/, '보건·의료 상황 판단', '환자 또는 대상자의 선택과 안전이 충돌하는 상황을 가정해 보세요. 무엇을 먼저 확인하고 어떤 기준으로 판단하겠습니까?'],
    [/기계|전기|전자|컴퓨터|소프트웨어|공학|정보통신|인공지능/, '공학적 문제 해결', '실험이나 프로그램의 결과가 예상과 다를 때, 원인을 좁히기 위한 확인 순서와 검증 방법을 설명해 주세요.'],
    [/화학|생명|물리|수학|통계|과학/, '탐구와 근거', '관심 있는 과학·수학 개념을 한 가지 고르고, 그 개념을 사용한 탐구의 가정과 한계를 설명해 주세요.'],
    [/경영|경제|회계|무역|금융/, '경영·경제 판단', '한정된 예산으로 두 대안 중 하나를 선택해야 한다면 어떤 자료를 비교하겠습니까? 선택의 장점과 포기하는 부분도 설명해 주세요.'],
    [/교육|사범|유아/, '교육 상황 판단', '같은 내용을 이해하는 속도가 다른 학습자가 함께 있을 때, 수업 참여를 돕기 위한 방법과 확인 기준을 설명해 주세요.'],
    [/디자인|미술|음악|예술|체육|스포츠/, '실기·창작의 선택', '직접 연습하거나 만든 결과물에서 가장 중요한 선택 한 가지와, 다른 사람의 피드백을 반영해 바꾼 부분을 설명해 주세요.'],
    [/사회|심리|복지|행정|정치|법학/, '사회 현상과 관점', '관심 있는 사회 현상을 한 가지 고르고, 서로 다른 관점 두 가지와 판단에 필요한 근거를 설명해 주세요.'],
    [/국어|국문|영어|영문|언어|역사|철학|인문/, '해석과 논거', '관심 있는 글이나 역사적 사례를 하나 고르고, 자신의 해석과 다른 해석을 비교해 그 근거를 설명해 주세요.']
  ];
  const domain = domains.find(([pattern])=>pattern.test(major));
  if(domain)result.push({id:'target-domain',category:domain[1],text:major+' 연습: '+domain[2],kind:'학과명에서 선택한 분야별 자체 연습 질문 · 실제 기출·교육과정 검증값 아님'});
  if (formats.length) result.push({id:'target-official', category:'선택 전형 평가방법 대비', text:'선택한 '+formats[0].track+' 전형('+formats[0].scope+')의 공식 안내 “' + String(formats[0].method).slice(0, 180) + '”에 대비해, 본인의 경험 중 해당 역량을 설명할 수 있는 사례와 확인 근거를 말해 주세요.', kind:'확인된 평가방법 기반 연습 질문 · 선택한 전형·모집단위 범위에 한함'});
  evidence.forEach((entry, i) => result.push({id:'resume-'+i, category:'내 자료 기반 질문 '+(i+1), evidence:entry.text, text:'자료에 “'+entry.text+'”라고 적었습니다. 이 경험에서 본인이 직접 한 일, 그렇게 한 이유, 결과를 확인한 근거를 설명해 주세요.', kind:'직접 작성하거나 가져온 문장 기반 연습 질문 · 실제 기출 아님'}));
  return result;
}

export function validateResumeFile(file) {
  if (!file || !/\.(pdf|txt)$/i.test(file.name || '')) return 'PDF 또는 TXT 파일을 선택해 주세요. 다른 형식은 텍스트를 복사해 붙여넣을 수 있어요.';
  if (file.size > 10 * 1024 * 1024) return '10MB 이하 파일을 선택해 주세요.';
  return '';
}

export function resumeFileError(error = {}) {
  if(['NotReadableError','NotFoundError','SecurityError'].includes(error.name))return '선택한 파일을 브라우저에서 읽을 수 없어요. 파일이 이동·삭제되었거나 접근 권한이 제한되었을 수 있습니다. 기기에 저장한 파일을 다시 선택하거나 내용을 붙여넣어 주세요.';
  if(error.name==='PasswordException')return '암호가 설정된 PDF는 읽을 수 없어요. 암호를 해제한 사본을 선택하거나 필요한 내용을 붙여넣어 주세요.';
  return /10MB|50쪽|추출하지|PDF 또는/.test(error.message||'')?error.message:'파일을 읽지 못했어요. 파일 형식·암호·스캔 여부를 확인하거나 필요한 문장을 붙여넣어 주세요.';
}

export async function extractResumeFile(file, runtime = null) {
  const error = validateResumeFile(file); if (error) throw new Error(error);
  if (/\.txt$/i.test(file.name)) return (await file.text()).slice(0,30000);
  const pdfjs = runtime || await import('/vendor/pdfjs/pdf.mjs');
  if(!runtime)pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.mjs';
  const loadingTask = pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,cMapUrl:'/vendor/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'/vendor/pdfjs/standard_fonts/',wasmUrl:'/vendor/pdfjs/wasm/'});
  try {
    const doc = await loadingTask.promise;
    if (doc.numPages > 50) throw new Error('50쪽 이하 파일을 선택하거나 필요한 부분을 붙여넣어 주세요.');
    let text = '';
    for (let page = 1; page <= doc.numPages && text.length < 30000; page++) {
      const content = await (await doc.getPage(page)).getTextContent();
      text += content.items.map(item => item.str + (item.hasEOL ? '\n' : ' ')).join('')+'\n';
    }
    if (text.trim().length < 30) throw new Error('글자를 추출하지 못했어요. 스캔 PDF는 필요한 문장을 직접 붙여넣어 주세요.');
    return text.slice(0,30000);
  } finally { await loadingTask.destroy(); }
}

export function findOfficialInterviewSchool(university, schools = []) {
  // Campus identifiers are part of the university identity. Never borrow main-campus rules.
  if (!university) return undefined;
  const normalize = value => String(value || '').replace(/\s+/g, '').trim();
  return schools.find(s => normalize(s.name) === normalize(university.name) && (!university.campus || (s.campus || '본교') === university.campus));
}
function link(url,label) { return safeUrl(url) ? '<a class="button" target="_blank" rel="noopener noreferrer" href="'+esc(url)+'">'+esc(label)+'</a>' : ''; }

export async function renderInterview(root, options = {}) {
  cleanupInterview(root);
  const generation = Symbol(); root._interviewGeneration = generation;
  const active = () => root._interviewGeneration === generation && !!root.querySelector('#iv-loading, #iv-answer');
  root.innerHTML = '<p class="eyebrow">면접 준비실</p><h1>한 번의 답변에서, 다음 개선점을 찾아요</h1><p id="iv-loading" role="status">학교와 면접 자료를 불러오고 있어요…</p>';
  const results = await Promise.allSettled([
    fetch('/data/interviews.json').then(r => {if(!r.ok)throw Error();return r.json();}),
    fetch('/api/catalog',{cache:'no-cache'}).then(r => {if(!r.ok)throw Error();return r.json();}),
    fetch('/api/integrations').then(r => {if(!r.ok)throw Error();return r.json();})
  ]);
  if (!active()) return;
  if (results[0].status !== 'fulfilled') {
    root.innerHTML = '<h1>면접 준비실</h1><p>면접 자료를 불러오지 못했습니다. 저장을 선택한 답변은 이 브라우저에 남아 있어요.</p><button id="iv-retry">다시 시도</button>';
    root.querySelector('#iv-retry').onclick = () => renderInterview(root); return;
  }
  const data = results[0].value;
  const catalog = results[1].status === 'fulfilled' ? results[1].value : null;
  const integration = results[2].status === 'fulfilled' ? results[2].value : null;
  const schools = (catalog?.universities || data.schools.map((s,i) => ({id:'official-'+i,name:s.name}))).filter(s => !inactive.has(s.id)).sort((a,b) => a.name.localeCompare(b.name,'ko'));
  let state = {school:'', major:'', majorManual:'', format:'', question:'target-motivation', answers:{}, custom:''};
  if(interviewSession)state={...state,...interviewSession.state};
  else try { state = {...state, ...JSON.parse(localStorage.getItem('jobnkill-interview-v2') || '{}')}; } catch {}
  if(!interviewSession && !state.school){
    const target=getSavedWritingTarget();
    const match=target?.schoolId?schools.find(s=>s.id===target.schoolId):null;
    if(match){state.school=match.id;state.major=target.major || '';}
  }
  if(!state.answers || typeof state.answers!=='object')state.answers={};
  let appliedMaterial = interviewSession?.appliedMaterial || '';
  let resumeEvidence = interviewSession?.evidence || [], questions = [], loadVersion = 0, uploadVersion = 0, writing;
  root.innerHTML = (options.compose ? '<p class="eyebrow">자기소개서 작성실</p><h1>문항에 답할 자기소개서를 완성해요</h1><p>문항·경험·행동·근거를 차례로 정리하고, 완성한 글로 면접 질문까지 이어서 연습해요.</p>' : '<p class="eyebrow">면접 준비실</p><h1>질문을 읽고, 내 말로 답해 보세요</h1><p>대학·학과를 고르고 경험을 정리한 뒤, 내 글로 질문을 만들어 면접까지 연습해요.</p>')+'<nav class="actions" aria-label="준비 메뉴"><a class="button" href="#find">대학 찾기</a><a class="button" href="#prepare/exams">논술 기출</a><a class="button" href="#prepare/essay">논술 연습</a></nav>'+
    '<section class="panel"><h2>1. 지원 대학·학과</h2><div class="fields"><div><label for="iv-school">대학 선택</label><select id="iv-school"><option value="">대학 선택 전 · 공통 연습</option>'+schools.map(s => '<option value="'+esc(s.id)+'">'+esc(s.displayName || s.name)+'</option>').join('')+'</select></div><div><label for="iv-major">학과 선택</label><select id="iv-major"><option value="">대학을 선택하면 학과가 나와요</option></select></div></div><p id="iv-school-status" class="hint" role="status">'+schools.length+'개 대학 선택 가능 · 공식 면접 방식은 '+data.schools.length+'개 대학의 일부 전형 확인'+(!catalog?' · 전국 목록 연결 실패로 확인된 대학만 표시':'')+'</p><details><summary>학교별 면접시간·방법·기출 확인</summary><div id="iv-info"></div></details></section>'+
    '<section id="iv-writer" class="panel"></section><section class="panel"><h2>2. 나에게 맞는 질문</h2><details id="iv-material"><summary>자기소개서·활동 자료로 질문 만들기 (선택)</summary><p>자기소개서, 활동 기록, 면접 준비 메모에서 본인이 작성한 문장을 바탕으로 추가 질문을 만들어요. 대학에 자기소개서를 제출해야 한다는 뜻은 아닙니다.</p><label for="iv-upload">PDF·TXT 가져오기 · 최대 10MB, PDF 50쪽</label><input type="file" id="iv-upload" accept=".pdf,.txt,application/pdf,text/plain"><p id="iv-upload-status" role="status"></p><label for="iv-resume">추출된 내용을 확인하거나 직접 붙여넣기</label><textarea id="iv-resume" rows="6" maxlength="30000" placeholder="질문으로 연습하고 싶은 실제 경험이나 활동 기록을 붙여넣어 주세요."></textarea><p class="hint">파일은 기기에서 읽으며 서버나 외부 AI로 전송하지 않아요. 첨부 원문은 브라우저 저장소에도 저장하지 않습니다.</p><div class="actions"><button type="button" id="iv-make-questions">이 내용으로 질문 만들기</button><button type="button" id="iv-remove-material">가져온 자료 지우기</button></div><p id="iv-material-status" role="status"></p></details><label for="iv-question">연습 질문 선택</label><select id="iv-question"></select><div id="iv-question-text" class="notice"></div><label for="iv-custom" id="iv-custom-label" hidden>직접 연습할 질문</label><textarea id="iv-custom" rows="3" maxlength="2000" hidden></textarea></section>'+
    '<section class="panel"><h2>3. 답변 작성</h2><form id="iv-form"><label for="iv-answer">내 답변</label><textarea id="iv-answer" rows="9" maxlength="10000" placeholder="항목을 나누지 않고 면접에서 말하듯 답해 주세요. 피드백에서 상황·역할·행동·근거·전공 연결을 함께 살펴볼게요." aria-describedby="iv-answer-help"></textarea><p id="iv-answer-help" class="hint">실제 경험과 생각을 자유롭게 작성하세요. 짧게 시작하고 피드백을 보고 보완해도 좋아요.</p><p id="iv-progress" role="status"></p><label><input type="checkbox" id="iv-persist"> 이 기기에 답변 저장하기 (공용 기기에서는 해제)</label><p class="hint">내 글로 만든 질문과 답변은 저장 옵션과 관계없이 새로고침하거나 닫으면 사라집니다. 이 탭에서는 최근 사용한 글 5개까지 답변을 이어볼 수 있어요.</p><div class="actions"><button type="submit" class="primary">답변 피드백 받기</button><button type="button" id="iv-clear">현재 답변 지우기</button></div><p id="iv-save-status" role="status"></p></form></section><section id="iv-feedback" aria-live="polite"></section>';
  const $ = selector => root.querySelector(selector);
  $('#iv-school').value = schools.some(s=>s.id===state.school) ? state.school : '';
  $('#iv-persist').checked = !!state.persist;
  const selectedSchool = () => schools.find(s => s.id === $('#iv-school').value);
  const selectedOfficial = () => findOfficialInterviewSchool(selectedSchool(),data.schools);
  $('#iv-major').parentElement.insertAdjacentHTML('afterend','<div><label for="iv-format">확인된 면접 전형 (선택)</label><select id="iv-format"><option value="">전형 미선택 · 공통 연습</option></select></div>');
  $('#iv-major').parentElement.insertAdjacentHTML('beforeend','<label for="iv-major-manual">희망학과 직접 입력 (선택)</label><input id="iv-major-manual" maxlength="80" placeholder="예: 인공지능학과" aria-describedby="iv-major-manual-note"><p id="iv-major-manual-note" class="hint">목록에 없으면 직접 적어 주세요. 직접 입력한 학과를 우선 사용하며, 대학에서 확인한 학과·전형 정보로 간주하지 않습니다. 목록에서 다시 선택하면 직접 입력값이 지워집니다.</p><p id="iv-major-applied" class="hint" role="status"></p>');
  $('#iv-major-manual').value=typeof state.majorManual==='string'?state.majorManual:'';
  const selectedMajor = () => $('#iv-major-manual').value.trim() || $('#iv-major').value;
  const questionKey = () => [$('#iv-school').value, ($('#iv-major-manual').value.trim()?'직접입력:':'')+selectedMajor(), $('#iv-format').value, $('#iv-question').value].join('|');
  const progress = () => { $('#iv-progress').textContent = [...$('#iv-answer').value].length+'자 · 답변 후 보완할 부분을 확인할 수 있어요'; };
  function persist() {
    state.school = $('#iv-school').value; state.major = $('#iv-major').value; state.majorManual = $('#iv-major-manual').value.trim(); state.format = $('#iv-format').value; state.question = $('#iv-question').value; state.custom = $('#iv-custom').value; state.persist = $('#iv-persist').checked;
    state.answers[questionKey()] = $('#iv-answer').value;
    try {
      const saved = {...state, question:state.question.startsWith('resume-')?'target-motivation':state.question, answers:Object.fromEntries(Object.entries(state.answers).filter(([k])=>!k.split('|').at(-1).startsWith('resume-')))};
      if (state.persist) { localStorage.setItem('jobnkill-interview-v2',JSON.stringify(saved)); $('#iv-save-status').textContent='일반 연습 답변을 이 기기에 저장했어요.'; }
      else { localStorage.removeItem('jobnkill-interview-v2'); $('#iv-save-status').textContent='이 탭에서 이동하는 동안 유지해요. 새로고침하거나 닫기 전에 필요한 답변을 복사해 주세요.'; }
    } catch { $('#iv-save-status').textContent='기기 저장 공간을 사용할 수 없어요. 답변을 따로 복사해 주세요.'; }
    progress();
  }
  function changeQuestion() {
    const q = questions.find(q=>q.id===$('#iv-question').value);
    $('#iv-custom').hidden = $('#iv-custom-label').hidden = $('#iv-question').value !== 'custom';
    $('#iv-custom').value = state.custom || '';
    $('#iv-question-text').innerHTML = q ? '<strong>'+esc(q.text)+'</strong><p class="hint">'+esc(q.kind)+'</p>' : '직접 입력한 질문으로 연습합니다. 출처를 확인하지 않은 질문은 기출로 표시하지 않습니다.';
    $('#iv-answer').value = state.answers[questionKey()] || '';
    $('#iv-feedback').innerHTML = ''; progress();
  }
  function updateQuestions() {
    writing?.setContext({schoolId:selectedSchool()?.id || '',school:selectedSchool()?.name || '',major:selectedMajor()});
    const old = $('#iv-question').value || state.question;
    const format=selectedOfficial()?.formats?.[Number($('#iv-format').value)];
    const manual=!!$('#iv-major-manual').value.trim();
    $('#iv-format').disabled=manual;
    $('#iv-major-applied').textContent=selectedMajor()?(manual?'직접 입력 학과: ':'수집 목록에서 선택: ')+selectedMajor()+(manual?' · 분야별 연습 질문에만 사용하며 공식 전형 질문과 연결하지 않아요.':''):'';
    questions = buildPracticeQuestions({school:selectedSchool()?.name, major:selectedMajor(), evidence:resumeEvidence, formats:!manual&&$('#iv-format').value!==''&&format?[format]:[], basics:data.practiceQuestions});
    if (appliedMaterial) {
      const native = buildWritingInterviewQuestions(appliedMaterial,{school:selectedSchool()?.name,major:selectedMajor()});
      questions.push(...native.map(q=>({id:q.id,category:'작성문 기반 '+q.number+' · '+q.category,text:q.question,kind:'잡앤킬 자기소개서 기반 자체 연습 · 실제 기출 아님',evidence:q.evidence,guide:q.guide})));
    }
    $('#iv-question').innerHTML = questions.map(q=>'<option value="'+esc(q.id)+'">'+esc(q.category)+'</option>').join('')+'<option value="custom">직접 질문 입력</option>';
    $('#iv-question').value = old === 'custom' || questions.some(q=>q.id===old) ? old : questions[0].id;
    changeQuestion();
  }
  const selectedReviewGuide = () => {
    const university = selectedSchool();
    if (!university || !Array.isArray(data.reviewGuides)) return undefined;
    const normalize = value => String(value || '').replace(/\s+/g, '').replace(/대학교/g, '대').replace(/글로컬|GLOCAL/gi, '글로컬').replace(/\[[^\]]+\]/g, '');
    const target = normalize(university.name || university.displayName);
    return data.reviewGuides.find(guide => {
      const name = normalize(guide.name);
      return name === target || name.includes(target) || target.includes(name);
    });
  };
  function renderReviewGuide(guide) {
    if (!guide) return '<section class="interview-review-guide"><h3>자료집 후기 확인</h3><p>선택한 대학은 이번에 불러온 울산교육청 2026 면접 후기 자료집에서 대학별 사례를 확인하지 못했습니다. 확인되지 않은 질문·면접시간·위원 수를 임의로 만들지 않고, 아래 공통 연습 질문만 제공합니다.</p></section>';
    const source = data.reviewSource || {};
    const topics = Array.isArray(guide.topics) ? guide.topics : [];
    const cards = topics.map(topic => {
      const item = guide.answerGuides && guide.answerGuides[topic];
      if (!item) return '';
      return '<article class="review-topic"><h4>' + esc(topic) + '</h4><p class="hint">자료집 사례에서 확인한 질문 주제(원문 문항·공식 채점기준 아님)</p><p>' + esc(item.question) + '</p><div class="review-example"><strong>답변 설계 예시</strong><p>' + esc(item.example) + '</p></div><p class="hint">내 활동의 실제 행동·근거로 바꾸어 말하고, 확인하지 못한 사실이나 수치는 만들지 마세요.</p></article>';
    }).join('');
    return '<section class="interview-review-guide"><div class="review-source"><span class="tag">2026 후기 자료집 기반</span><strong>' + esc(guide.name) + ' 사례 주제</strong><span class="hint">' + esc(guide.source) + ' · ' + esc(guide.sourcePages) + '</span></div><p>울산교육청 자료집에 수록된 수험생 회고를 질문 주제 중심으로 정리했습니다. 아래 문장은 자료집 원문 답안이 아니라 잡앤킬이 작성한 연습용 답변 설계 예시입니다.</p><div class="review-topic-list">' + cards + '</div><div class="review-method"><h4>답변 순서</h4><ol><li>질문에 대한 결론을 한 문장으로 먼저 말합니다.</li><li>학생부·활동에서 내가 직접 한 행동과 선택 이유를 붙입니다.</li><li>결과를 관찰·기록·피드백으로 확인하고 한계를 밝힙니다.</li><li>지원 학과에서 이어서 배우고 싶은 내용으로 마무리합니다.</li></ol></div><p class="hint">자료집은 수험생 회고를 모은 참고자료라 실제 면접의 모든 질문·시간·위원 수를 보장하지 않습니다. 공식 시간·위원 수는 위 모집요강 카드에서 확인된 값만 표시하며, 최종 안내는 해당 연도 모집요강을 확인하세요.</p>' + (source.url ? link(source.url, '울산진로진학지원센터 출처') : '') + '</section>';
  }
  function showOfficial() {
    const s = selectedOfficial();
    const guide = selectedReviewGuide();
    if(!s && !guide) {
      $('#iv-info').innerHTML='<p>선택한 대학의 공식 면접 시간·위원 수·기출 본문과 이번 자료집 대학별 사례를 아직 확인하지 못했어요. 확인되지 않은 정보를 임의로 만들지 않고 공통 질문과 내 자료 기반 질문으로 연습할 수 있습니다.</p>'+(selectedSchool()?'<a class="button" href="#university/'+esc(selectedSchool().id)+'">선택 대학 상세 안내</a>':'');
      return;
    }
    let html = '';
    if(s) {
      html='<p>'+esc(s.academicYear)+'학년도 · 확인일 '+esc(data.verifiedAt)+'</p><div class="cards">'+s.formats.map(f=>'<article class="card"><h3>'+esc(f.track)+' · '+esc(f.scope)+'</h3><dl><dt>면접시간</dt><dd>'+esc(f.duration)+'</dd><dt>준비시간</dt><dd>'+esc(f.preparation)+'</dd><dt>면접위원</dt><dd>'+esc(f.panel)+'</dd><dt>평가방법</dt><dd>'+esc(f.method)+'</dd></dl><p class="hint">'+esc(f.pages)+'</p></article>').join('')+'</div>'+link(s.sourceUrl,'공식 모집요강 열기')+'<h3>면접 기출</h3>'+(s.pastPapers?.length?s.pastPapers.map(p=>'<p>'+link(p.url,p.year+'학년도 '+p.title)+'<br><span class="hint">'+esc(p.status)+'</span></p>').join(''):'<p>공식 기출 본문 미확보</p>')+'<h3>면접 후기</h3><p>검증된 개인 후기 '+(s.reviews?.length||0)+'건. 기출·후기가 없는 경우 임의로 만들지 않습니다.</p>';
    }
    html += renderReviewGuide(guide);
    $('#iv-info').innerHTML=html+'<p class="hint">면접 방식은 표시한 학년도·전형·모집단위 범위에 한정됩니다. 최종 모집요강과 수정 공지를 확인하세요.</p>';
  }
  async function changeSchool(initial = false) {
    const version = ++loadVersion;
    const desired = initial ? state.major : '';
    if(!initial)$('#iv-major-manual').value='';
    showOfficial();
    const formats=selectedOfficial()?.formats||[];
    $('#iv-format').innerHTML='<option value="">'+(formats.length?'전형 미선택 · 공통 연습':'확인된 면접 전형 없음')+'</option>'+formats.map((f,i)=>'<option value="'+i+'">'+esc(f.track+' · '+f.scope)+'</option>').join('');
    $('#iv-format').value=initial && formats[Number(state.format)] && state.format!==''?state.format:'';
    $('#iv-major').innerHTML='<option value="">학과 불러오는 중…</option>'; $('#iv-major').disabled=true; updateQuestions();
    let departments=[];
    if(/^\d{7}$/.test($('#iv-school').value)) {
      try {const r=await fetch('/api/departments?universityId='+encodeURIComponent($('#iv-school').value));if(!r.ok)throw Error();const d=await r.json();departments=d?.departmentCatalog?.items || [];} catch {}
    }
    if(!active() || version!==loadVersion)return;
    $('#iv-major').innerHTML='<option value="">'+(departments.length?'학과 선택 (선택사항)':'학과 미선택 · 공통 질문으로 연습')+'</option>'+[...new Set(departments.map(d=>d.name))].sort((a,b)=>a.localeCompare(b,'ko')).map(name=>'<option value="'+esc(name)+'">'+esc(name)+'</option>').join('');
    $('#iv-major').disabled=false; $('#iv-major').value=departments.some(d=>d.name===desired)?desired:'';if(initial && desired && !$('#iv-major').value && !$('#iv-major-manual').value)$('#iv-major-manual').value=desired;updateQuestions();
  }
  $('#iv-school').onchange=()=>changeSchool();
  $('#iv-major').onchange=()=>{$('#iv-major-manual').value='';updateQuestions();};
  $('#iv-major-manual').oninput=()=>{if($('#iv-major-manual').value.trim())$('#iv-format').value='';updateQuestions();};
  $('#iv-format').onchange=updateQuestions;
  $('#iv-question').onchange=changeQuestion;
  $('#iv-answer').oninput=persist; $('#iv-custom').oninput=persist; $('#iv-persist').onchange=persist;
  $('#iv-upload').onchange=async()=>{
    const file=$('#iv-upload').files[0];if(!file)return;const version=++uploadVersion;
    $('#iv-upload-status').textContent='기기에서 문서를 읽고 있어요…';$('#iv-make-questions').disabled=true;
    try {const text=await extractResumeFile(file);if(!active()||version!==uploadVersion)return;$('#iv-resume').value=text;$('#iv-upload-status').textContent='문장을 추출했어요. 내용을 확인한 뒤 “이 내용으로 질문 만들기”를 눌러 주세요.';}
    catch(error){if(active()&&version===uploadVersion)$('#iv-upload-status').textContent=resumeFileError(error);}
    finally {if(active()&&version===uploadVersion)$('#iv-make-questions').disabled=false;}
  };
  $('#iv-make-questions').onclick=()=>{
    const nextMaterial=$('#iv-resume').value;
    if(appliedMaterial!==nextMaterial){
      if(appliedMaterial)materialAnswerSets.set(appliedMaterial,Object.fromEntries(Object.entries(state.answers).filter(([k])=>k.split('|').at(-1).startsWith('resume-'))));
      while(materialAnswerSets.size>5)materialAnswerSets.delete(materialAnswerSets.keys().next().value);
      state.answers={...Object.fromEntries(Object.entries(state.answers).filter(([k])=>!k.split('|').at(-1).startsWith('resume-'))),...(materialAnswerSets.get(nextMaterial)||{})};
    }
    appliedMaterial=nextMaterial;
    resumeEvidence=extractResumeEvidence(nextMaterial);updateQuestions();
    $('#iv-material-status').textContent=resumeEvidence.length?'내 문장을 근거로 '+resumeEvidence.length+'개 연습 질문을 만들었어요. 질문 선택 목록에서 확인하세요.':'질문으로 사용할 문장을 찾지 못했어요. 활동·행동·배운 점이 담긴 문장을 조금 더 작성해 주세요.';
    if(resumeEvidence.length){$('#iv-question').value='resume-0';changeQuestion();$('#iv-question').focus();}
  };
  $('#iv-remove-material').onclick=()=>{uploadVersion++;appliedMaterial='';materialAnswerSets.clear();resumeEvidence=[];$('#iv-resume').value='';$('#iv-upload').value='';$('#iv-upload-status').textContent='';$('#iv-make-questions').disabled=false;state.answers=Object.fromEntries(Object.entries(state.answers).filter(([k])=>!k.split('|').at(-1).startsWith('resume-')));updateQuestions();$('#iv-material-status').textContent='가져온 원문과 자료 기반 질문·답변을 지웠어요.';};
  $('#iv-resume').value=interviewSession?.material || '';
  $('#iv-material').open=!!interviewSession?.material;
  writing=mountWriting($('#iv-writer'),{
    getContext:()=>({schoolId:selectedSchool()?.id || '',school:selectedSchool()?.name || '',major:selectedMajor()}),
    initiallyOpen:!!options.compose,
    onUseDraft:({text})=>{
      if(!extractResumeEvidence(text).length)throw new Error('질문으로 사용할 경험 문장을 찾지 못했어요. 활동과 직접 한 일이 드러나는 문장으로 보완해 주세요.');
      uploadVersion++;$('#iv-upload').value='';$('#iv-upload-status').textContent='';$('#iv-make-questions').disabled=false;
      $('#iv-resume').value=text;
      $('#iv-material').open=true;
      $('#iv-make-questions').click();
      $('#iv-question-text').scrollIntoView({block:'center'});
    }
  });
  const writer=integration?.resumeWriter;
  if(safeUrl(writer?.url))$('#iv-material').insertAdjacentHTML('beforeend','<details><summary>기존 자기소개서 서비스 보관함</summary>'+link(writer.url,'기존 서비스 열기')+'<p class="hint">기존 회원 보관함은 별도 창에서 확인합니다. 이 화면의 글이 자동 전송되지는 않아요.</p></details>');
  root._interviewCleanup=()=>{
    if(!$('#iv-answer'))return;
    state.school=$('#iv-school').value;state.major=$('#iv-major').value;state.majorManual=$('#iv-major-manual').value.trim();state.format=$('#iv-format').value;state.question=$('#iv-question').value;state.custom=$('#iv-custom').value;
    interviewSession={state,evidence:resumeEvidence,material:$('#iv-resume').value,appliedMaterial};
    writing.destroy();uploadVersion++;loadVersion++;
  };
  $('#iv-clear').onclick=()=>{$('#iv-answer').value='';persist();$('#iv-feedback').innerHTML='';$('#iv-answer').focus();};
  $('#iv-form').onsubmit=event=>{
    event.preventDefault();persist();const result=interviewFeedback($('#iv-answer').value,{major:selectedMajor()});const out=$('#iv-feedback');
    if(!result.text){out.innerHTML='<p>내 답변을 먼저 작성해 주세요.</p>';$('#iv-answer').focus();return;}
    out.innerHTML='<section class="panel"><p class="eyebrow">답변 → 피드백 → 다시 답변</p><h2>먼저 이 부분부터 보완해 보세요</h2><ol>'+result.priority.map(p=>'<li>'+esc(p)+'</li>').join('')+'</ol><h3>내 답변에서 확인한 표현</h3><p class="hint">문장 표현을 찾는 기본 검사입니다. 표현이 있다는 것만으로 역량이나 사실성이 입증되는 것은 아닙니다.</p>'+result.items.map(item=>'<article class="program"><h4>'+esc(item.label)+' · '+(item.detected?'관련 표현 발견':'보완할 표현 확인')+'</h4>'+(item.evidence?'<blockquote>'+esc(item.evidence)+'</blockquote>':'')+'<p>'+esc(item.feedback)+'</p></article>').join('')+'<h3>잡앤킬 관점으로 더 깊게 답하기</h3><ul><li><strong>전문성:</strong> 직접 해 본 탐구·실습과 책·수업으로 익힌 지식을 구분하고, 근거를 설명하세요.</li><li><strong>성향:</strong> “성실하다” 같은 평가보다 선택 상황에서 드러난 태도·가치와 행동을 말하세요.</li><li><strong>전공·진로관:</strong> 이 경험이 왜 해당 전공의 학습과 향후 역할에 연결되는지 자신의 말로 설명하세요.</li></ul><h3>이어질 수 있는 추가 질문</h3><ul>'+result.followups.map(q=>'<li>'+esc(q)+'</li>').join('')+'</ul><button class="primary" id="iv-revise">피드백을 보고 답변 수정하기</button><p class="hint">이 피드백은 입력 문장에 적용한 자체 연습 규칙입니다. 사실·전공 지식의 정확성이나 합격가능성을 판정하는 평가 점수는 제공하지 않습니다.</p></section>';
    $('#iv-revise').onclick=()=>{$('#iv-answer').focus();$('#iv-answer').scrollIntoView({block:'center',behavior:'auto'});};out.tabIndex=-1;out.focus();out.scrollIntoView({block:'start'});
  };
  await changeSchool(true);
}
