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

function coachingGuide(question = {}) {
  const natural = !/(수리|수학|자연|과학|통계|공학)/u.test(String(question.subject || ''));
  const steps = natural
    ? ['문항의 요구 동사(비교·분석·평가·제시)를 체크리스트로 바꾸기', '제시문·자료에서 핵심 근거를 골라 주장과 연결하기', '비교 기준과 조건을 밝힌 뒤 나의 결론을 한 문장으로 제시하기', '가장 강한 반론·한계를 인정하고 보완 또는 검증 방법 쓰기', '문단별로 주장→근거→해석→결론이 이어지는지 마지막에 점검하기']
    : ['주어진 조건과 기호를 먼저 정의하기', '식을 세운 이유와 중간 계산을 한 단계씩 적기', '중간 결과가 다음 식으로 어떻게 이어지는지 설명하기', '최종값의 범위·단위·조건을 검산하기', '식만 나열하지 말고 결론과 근거를 문장으로 마무리하기'];
  return `<section class="practice-coaching"><h3>점수를 높이는 풀이 공식</h3><p class="hint">${natural ? '인문·사회형 답안' : '수리·자연형 답안'}에 공통으로 적용해 보세요.</p><ol>${steps.map(step => `<li>${esc(step)}</li>`).join('')}</ol><p><strong>오늘의 꿀팁</strong> ${natural ? '제시문 내용을 그대로 옮기지 말고 “이 근거가 왜 내 판단을 뒷받침하는가”를 바로 이어 쓰면 논리 점검이 쉬워집니다.' : '답만 맞혀도 풀이 근거가 없으면 점수를 잃을 수 있습니다. 조건→식→중간값→검산을 줄마다 남겨 보세요.'}</p><p class="hint">${question.sourceKind === 'official_past' ? '공식 기출은 아래 PDF의 해설·채점기준 쪽을 최우선으로 대조하세요.' : '자체 제작 문항의 기준답안은 하나의 예시이며, 다른 논리적 답을 배제하지 않습니다.'}</p></section>`;
}


function sourceBackedCriteria(subject = '') {
  const natural = /(수리|수학|자연|과학|통계|공학)/u.test(String(subject || ''));
  return natural ? [
    { id:'source-conditions', label:'조건·풀이 단계', conceptGroups:[['조건','가정','범위','주어진'],['식','풀이','계산','증명']], referenceEvidence:'주어진 조건을 기호·식·풀이 단계로 옮김', guidance:'주어진 조건과 사용한 식을 먼저 쓰고 중간 계산을 생략하지 마세요.', basis:'기존 공개 자연계열 문항의 풀이·증명 요구를 공통 요소로 정리함' },
    { id:'source-evidence', label:'근거와 중간결과', conceptGroups:[['따라서','이므로','계산','=','증명'],['결과','값','구하면','얻는다']], referenceEvidence:'각 단계의 이유와 중간결과가 연결됨', guidance:'식만 나열하지 말고 왜 그 식을 쓰는지 한 문장으로 설명하세요.', basis:'기존 공개 해설에서 조건→식→중간결과 연결을 확인함' },
    { id:'source-conclusion', label:'결론·검산', conceptGroups:[['결론','답','따라서','구한다'],['확인','검산','조건','범위']], referenceEvidence:'최종 답과 조건·단위의 일치 여부 확인', guidance:'최종값을 문제의 조건·단위와 대조하고 검산 결과를 덧붙이세요.', basis:'공식 해설의 최종값·조건 대조를 학습 기준으로 사용함' },
    { id:'source-clarity', label:'표현의 정확성', conceptGroups:[['정의','기호','의미','설명'],['명확','정확','근거','논리']], referenceEvidence:'기호와 용어를 혼동하지 않고 논리를 읽을 수 있게 제시', guidance:'기호를 정의하고 한 문장에 한 단계만 담아 읽는 사람이 따라오게 하세요.', basis:'공개 풀이의 기호 정의와 서술 설명을 공통 요소로 정리함' }
  ] : [
    { id:'source-demand', label:'문제 요구 대응', conceptGroups:[['비교','분석','설명','제시','논하'],['조건','자료','제시문','문항','근거']], referenceEvidence:'문항의 동사와 조건을 빠짐없이 답함', guidance:'문제의 동사(비교·분석·평가·제시)를 체크리스트로 바꾸고 답안 문단마다 대응시키세요.', basis:'기존 공개 인문·사회 문항의 요구 동사를 공통 요소로 정리함' },
    { id:'source-evidence', label:'제시문·자료 근거', conceptGroups:[['제시문','자료','표','그래프','수치','근거'],['사례','조건','내용','인용','자료']], referenceEvidence:'주장을 제시문·자료의 내용과 연결함', guidance:'주장 뒤에 자료의 핵심 내용과 그것이 주장을 뒷받침하는 이유를 함께 쓰세요.', basis:'기존 해설의 제시문·자료 근거 연결을 학습 기준으로 사용함' },
    { id:'source-logic', label:'주장·근거·결론 연결', conceptGroups:[['주장','입장','판단','나는'],['이유','때문','따라서','그러나','반면','결론']], referenceEvidence:'주장과 근거 사이의 비교 기준과 결론이 연결됨', guidance:'주장→근거→해석→결론 순서로 문단을 정리하고 연결어를 의도적으로 사용하세요.', basis:'기존 기준답안의 주장→근거→해석 구조를 공통 요소로 정리함' },
    { id:'source-counter', label:'반론·한계·검증', conceptGroups:[['반론','반대','우려','한계','위험'],['대안','보완','검증','평가','확인']], referenceEvidence:'반대 관점이나 한계를 인정하고 보완 방법을 제시함', guidance:'가장 강한 반론 하나를 공정하게 소개한 뒤 조건·검증 방법으로 답하세요.', basis:'기존 자체 100문항의 반론·한계·검증 요소를 학습 기준으로 사용함' }
  ];
}

function makeGapPracticeQuestion(entry = {}, index = 0, authoredQuestions = [], schoolResources = []) {
  const base = authoredQuestions[index % Math.max(1, authoredQuestions.length)] || {};
  const subject = base.subject || '통합';
  const school = entry.name || '선택 대학';
  const sourceUrl = entry.rosterSourceUrl || entry.archiveUrl || '';
  const knownTime = schoolResources.find(item => item.durationVerified && Number(item.examDurationMinutes) > 0);
  const ownMinutes = Number(base.practiceDurationMinutes) || 30;
  return {
    id: 'school-gap-' + (entry.universityId || entry.id || index),
    title: school + ' · 공식 원문 미확보 자체 연습',
    universityName: school,
    universityId: entry.universityId || (entry.universityIds || [])[0] || '',
    year: entry.academicYear || 2027,
    subject,
    relatedMajors: Array.isArray(base.relatedMajors) ? base.relatedMajors : [],
    topics: Array.isArray(base.topics) ? base.topics : ['근거','비교','논리'],
    origin: 'school_gap_practice',
    sourceKind: 'generated_school_practice',
    officialPastPaper: false,
    prompt: base.prompt || '공식 논술 원문이 아직 연결되지 않은 학교를 위한 통합 연습입니다. 하나의 사회·정책 쟁점을 선택해 두 관점을 비교하고, 근거와 한계가 드러나는 대안을 제시하세요.',
    passages: Array.isArray(base.passages) ? base.passages : [],
    sampleAnswer: base.sampleAnswer || '',
    referenceAnswerLabel: '잡앤킬 자체 기준 예시답안 · 대학 공식 정답 아님',
    criteria: sourceBackedCriteria(subject),
    solutionSteps: Array.isArray(base.solutionSteps) && base.solutionSteps.length ? base.solutionSteps : [
      '문항의 요구 동사와 조건을 먼저 표시합니다.',
      '근거가 되는 자료·사례를 두 개 이상 골라 주장과 연결합니다.',
      '반대 관점이나 한계를 인정한 뒤 보완·검증 방법을 제시합니다.',
      '결론을 한 문장으로 정리하고 기준답안은 참고용으로만 비교합니다.'
    ],
    nextTasks: [
      '답안에서 문제의 요구 동사에 대응하는 문장을 표시하세요.',
      '결론 뒤에 근거와 판단 이유를 한 문장씩 덧붙이세요.',
      '반론 또는 한계와 검증 방법을 다음 답안에 추가하세요.'
    ],
    practiceDurationMinutes: ownMinutes,
    durationVerified: false,
    durationNote: knownTime ? String(knownTime.year || '해당') + '학년도 공식 자료에서 시험 전체 ' + knownTime.examDurationMinutes + '분이 확인됐습니다. 이 자체 제작 1문항은 ' + ownMinutes + '분 자유 연습이며 해당 대학의 실제 문제·시간을 재현하지 않습니다.' : '이 학교의 공식 시험 전체 시간을 연결된 자료에서 확인하지 못했습니다. 자체 제작 1문항 ' + ownMinutes + '분 자유 연습이며 대학 시험시간이 아닙니다.',
    difficulty: base.difficulty || '중',
    contentStatus: 'school_source_gap_practice',
    answerStatus: 'own_reference_answer',
    feedbackStatus: 'source_backed_own_practice',
    sourceEvidence: {
      status: 'official_original_not_found',
      sourceTitle: '2027학년도 공식 모집요강·전형 안내 경로',
      sourceUrl,
      reason: '대학 공식 논술 원문·해설을 아직 확보하지 못해 실제 기출로 표시하지 않았습니다.',
      basis: '잡앤킬 자체 100문항과 공개 논술 해설에서 반복 확인한 조건·근거·논리·한계 기준을 재사용한 자체 연습입니다.'
    },
    generatedFrom: 'authored-question-bank'
  };
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
  const catalogQuestions = [...(bank.questions || []), ...readyQuestions];
  const resourceFor = q => resources.find(r => r.id === q.sourceId);
  const schoolFor = q => q.universityName || resourceFor(q)?.universityName || '자체 제작 연습';
  const subjectFor = q => q.subject || resourceFor(q)?.subject || '통합';
  const subjectMatches = (selected, actual) => {
    if (!selected) return true;
    const value = String(actual || '').trim();
    if (!value || /자료 내|계열별 확인|계열에서 선택|계열별 확인|통합|학교 공통/u.test(value)) return true;
    return value === selected || value.split(/[·,/]/u).map(token => token.trim()).includes(selected);
  };
  // 공식 PDF에 문제 쪽수는 확인됐지만 문항 객체가 아직 연결되지 않은 자료도
  // 반드시 연습 목록에서 접근할 수 있도록 페이지 단위의 원문 확인 항목을 만든다.
  const generatedQuestions = resources.flatMap(resource => {
    const pages = Array.isArray(resource.questionPages) ? resource.questionPages.filter(page => Number.isFinite(Number(page))) : [];
    if (!pages.length) return [];
    const linked = catalogQuestions.filter(question => question.sourceId === resource.id);
    const linkedPages = new Set(linked.map(question => Number(question.questionPage)).filter(Number.isFinite));
    // 연결된 문항이 전혀 없으면 모든 문제 쪽을, 일부만 연결됐으면 빠진 쪽만 보완한다.
    // 연결 문항에 쪽수 정보가 없는 자료는 이미 본문이 연결된 것으로 보고 중복 생성하지 않는다.
    const fallbackPages = linked.length && !linkedPages.size ? [] : pages.filter(page => !linkedPages.has(Number(page)));
    return fallbackPages.map((page, index) => ({
      id: `resource-${resource.id}-page-${page}-${index + 1}`,
      sourceId: resource.id,
      universityId: resource.universityId,
      universityName: resource.universityName,
      year: resource.year,
      subject: resource.subject || '자료 내 계열별 확인',
      title: `${resource.year || ''} ${resource.universityName || '대학'} 논술 원문 ${page}쪽`.trim(),
      questionPage: Number(page),
      promptSummary: `공식 PDF ${page}쪽에서 문제 본문을 확인하고 문항의 요구사항을 답안에 옮겨 적으세요.`,
      prompt: '',
      solutionPages: Array.isArray(resource.rubricCandidatePages) ? resource.rubricCandidatePages : [],
      sourceKind: 'official_past',
      officialPastPaper: true,
      requiresSource: true,
      contentStatus: 'question_page_fallback',
      answerStatus: 'official_solution_not_indexed',
      verification: 'resource_question_page_fallback',
      feedbackStatus: 'question_page_available_manual_solution_review',
      rubricComplete: false,
      criteria: sourceBackedCriteria(resource.subject),
      solutionSteps: /(수리|수학|자연|과학|통계|공학)/u.test(String(resource.subject || '')) ? [
        '공식 PDF의 문제 쪽에서 주어진 조건과 기호를 옮겨 적습니다.',
        '사용할 식·정리와 그 이유를 한 단계씩 설명합니다.',
        '중간 결과를 연결해 최종값을 구하고 범위·단위를 검산합니다.',
        'PDF 해설·채점기준 쪽과 풀이의 누락 단계를 대조합니다.'
      ] : [
        '공식 PDF의 문제 쪽에서 요구 동사와 답안 조건을 표시합니다.',
        '제시문·자료에서 핵심 근거를 골라 주장과 연결합니다.',
        '비교 기준과 반론·한계를 포함해 답안을 구성합니다.',
        'PDF 해설·채점기준 쪽과 근거·논리·조건의 누락을 대조합니다.'
      ],
      nextTasks: [
        '문항의 요구 동사에 대응하는 문장을 답안에 표시하세요.',
        '공식 해설 쪽에서 빠진 조건·근거·검산 단계를 확인하세요.',
        '다음 답안에는 이번에 빠진 요소를 한 문장 이상 보완하세요.'
      ],
      sourceEvidence: {
        status: 'official_question_page_verified',
        sourceTitle: resource.title,
        sourceUrl: resource.url,
        page: Number(page),
        reason: '공식 PDF에서 문제 시작 쪽을 확인했지만 문항 본문·해설 연결이 완전하지 않아 원문을 직접 읽도록 안내합니다.',
        basis: '공개 문제·해설의 공통 요구요소와 기존 잡앤킬 기준 루브릭을 적용한 학습용 연습입니다.'
      },
      practiceBasis: '공식 PDF 문제 쪽수 + 기존 공개 문항·해설 공통 기준',
      durationVerified: !!resource.durationVerified,
      examDurationMinutes: resource.examDurationMinutes,
      durationNote: resource.durationNote
    }));
  });
  const indexedSchoolNames = new Set([...catalogQuestions, ...generatedQuestions].map(schoolFor));
  const gapQuestions = (roster.universities || [])
    .filter(entry => entry.name && !indexedSchoolNames.has(entry.name))
    .map((entry, index) => makeGapPracticeQuestion(entry, index, authored.questions || [], resources.filter(resource => resource.universityName === entry.name)));
  const combined = new Map();
  catalogQuestions.forEach(q => combined.set(q.id, { ...combined.get(q.id), ...q }));
  generatedQuestions.forEach(q => combined.set(q.id, { ...combined.get(q.id), ...q }));
  gapQuestions.forEach(q => combined.set(q.id, { ...combined.get(q.id), ...q }));
  const questions = [...combined.values()];
  const questionRows = questions;
  const schoolNames = [...new Set([...(roster.universities || []).map(r => r.name), ...resources.map(r => r.universityName), ...questionRows.map(schoolFor)])].sort((a, b) => a.localeCompare(b, 'ko'));
  let saved;
  try { saved = JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch { saved = {}; }
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) saved = {};
  let active, activeQuestion, reader, clock, openVersion = 0, page = 0;
  const own = document.createElement('div');
  own.className = 'practice-workspace';
  root.replaceChildren(own);
  own.innerHTML = `<p class="eyebrow">문제 선택 → 시간 설정 → 답안 작성 → 피드백</p><h1>문제를 읽고, 직접 풀어보세요</h1><p>문제와 풀이 기준을 함께 제공합니다. 대학 기출과 자체 제작 연습은 구분해 표시합니다.</p><div class="filters"><div><label for="practice-mode">자료 선택</label><select id="practice-mode"><option value="questions">바로 풀 수 있는 문항</option><option value="resources">대학 공식 PDF 자료</option></select></div><div><label for="practice-school">학교</label><select id="practice-school"><option value="">전체 학교</option>${schoolNames.map(name => `<option>${esc(name)}</option>`).join('')}</select></div><div><label for="practice-subject">계열</label><select id="practice-subject"><option value="">전체 계열</option>${[...new Set([...resources.map(r => r.subject), ...questionRows.map(subjectFor)].filter(Boolean))].sort().map(name => `<option>${esc(name)}</option>`).join('')}</select></div><div><label for="practice-hard"><input type="checkbox" id="practice-hard"> 어려운 문제·자료만</label></div></div><p class="hint">공식 PDF ${resources.length}건 · 원문에서 색인한 공식 문제 위치 ${official.questions?.length || 0}건 · 연결되지 않은 문제 쪽 자동 보완 ${generatedQuestions.length}건(본문은 PDF에서 확인) · 공식 원문 미확보 학교의 근거 표시 자체 연습 ${gapQuestions.length}건 · 자체 제작 기준 풀이 ${authored.questions?.length || 0}건 · 기존 연결 문항 ${standards.questions?.length || 0}건이 있습니다. 자료실 링크만 있는 항목은 공식 문제 확보 수에 포함하지 않습니다.</p><section id="practice-school-guide" class="essay-prep-guide" aria-live="polite" hidden></section><section id="practice-list" class="practice-library-list" tabindex="-1"></section><section id="practice-editor" class="panel" hidden></section>`;
  const mode = own.querySelector('#practice-mode'), school = own.querySelector('#practice-school'), subject = own.querySelector('#practice-subject'), hard = own.querySelector('#practice-hard'), list = own.querySelector('#practice-list'), editor = own.querySelector('#practice-editor'), guide = own.querySelector('#practice-school-guide');
  const alive = () => own.isConnected;
  function persist() { try { localStorage.setItem(storageKey, JSON.stringify(saved)); return true; } catch { return false; } }
  function keyFor(q) { return q.sourceId || `authored:${q.id}`; }
  function isHard(id, questionId) { return !!(questionId ? saved[id]?.drafts?.[questionId]?.hard : saved[id]?.hard || Object.values(saved[id]?.drafts || {}).some(d => d.hard)); }

  function updateSchoolGuide() {
    const entry = (roster.universities || []).find(row => row.name === school.value);
    if (!entry) { guide.hidden = true; guide.innerHTML = ''; return; }
    const scoped = questionRows.filter(q => schoolFor(q) === entry.name);
    const pdfs = resources.filter(resource => resource.universityName === entry.name);
    const indexed = scoped.filter(q => q.sourceKind === 'official_past' && q.contentStatus !== 'question_page_fallback');
    const pageOnly = scoped.filter(q => q.contentStatus === 'question_page_fallback');
    const mocks = scoped.filter(q => q.sourceKind === 'official_mock');
    const ownPractice = scoped.filter(q => q.sourceKind === 'generated_school_practice');
    const verifiedTime = [...scoped, ...pdfs].find(item => item.durationVerified && Number(item.examDurationMinutes) > 0);
    const first = indexed[0] || mocks[0] || pageOnly[0] || scoped.find(q => q.sourceId) || ownPractice[0] || scoped[0];
    const sourceUrl = /^https:\/\//i.test(entry.rosterSourceUrl || '') ? entry.rosterSourceUrl : /^https:\/\//i.test(entry.archiveUrl || '') ? entry.archiveUrl : '';
    const evidence = indexed.length ? '공식 문제 위치·요구사항 색인 ' + indexed.length + '건' :
      pageOnly.length ? '공식 PDF에서 문제 시작 쪽 확인 ' + pageOnly.length + '건 · 본문은 PDF에서 읽기' :
      mocks.length ? '공식 모의논술 연결 ' + mocks.length + '건 · 본시험 기출과 구분' :
      ownPractice.length ? '공식 기출 원문 미확보 · 근거 표시 자체 연습' : '연습 문항 연결 확인 필요';
    const action = indexed.length ? '공식 PDF 문항으로 연습' :
      pageOnly.length ? '공식 PDF 문제 쪽에서 시작' :
      mocks.length ? '공식 모의논술로 연습' : ownPractice.length ? '자체 연습 시작 · 기출 아님' : '연습 문항 보기';
    const lesson = indexed.length || pageOnly.length || mocks.length
      ? '확인된 공식 PDF의 응시 계열 문항에서 요구조건을 표시하고, 제시문·풀이·해설의 누락을 대조하세요.'
      : '대학 기출로 오해하지 않도록 자체 연습으로 답안 구조를 점검하고, 공식 원문 공개 여부를 다시 확인하세요.';
    const timeText = verifiedTime
      ? esc(verifiedTime.year || '해당') + '학년도 자료에서 ' + esc(verifiedTime.examDurationMinutes) + '분 확인 · 지원 연도는 재확인'
      : '공식 시험시간 미확인 · 연습실의 자유 연습시간은 실제 고사시간이 아닙니다.';
    guide.hidden = false;
    guide.innerHTML = '<div class="essay-prep-head"><div><p class="eyebrow">선택 대학 논술 준비</p><h2>' + esc(entry.name) + ', 지금 이렇게 준비하세요</h2><p>확인된 자료의 범위에 맞춰 바로 시작할 수 있습니다. 지원 학과·계열에 따라 시험지가 다를 수 있습니다.</p></div><span class="tag">' + esc(entry.academicYear || '지원 연도') + '학년도 안내 경로 확인</span></div>' +
      '<div class="essay-prep-facts"><p><strong>문항 확보</strong><span>' + esc(evidence) + '</span></p><p><strong>시험시간</strong><span>' + timeText + '</span></p><p><strong>공식 PDF</strong><span>' + pdfs.length + '건 연결 · 자료 연도와 응시 계열 확인 필요</span></p></div>' +
      '<h3>지금 할 일</h3><ol><li>' + esc(entry.academicYear || 2027) + '학년도 최종 모집요강에서 지원 학과의 논술 실시·시험 계열·수능최저·고사일을 확인하세요.</li><li>' + esc(lesson) + '</li><li>연습 답안을 저장하고 근거·논리·검산 중 빠진 요소를 확인해 다시 작성하세요.</li></ol>' +
      '<div class="essay-prep-actions">' + (first ? '<button type="button" class="primary" data-prep-start>' + esc(action) + ' →</button>' : '') +
      (pdfs.length ? '<button type="button" data-prep-pdf>이 대학 공식 PDF 보기</button>' : '') +
      (sourceUrl ? '<a class="button" href="' + esc(sourceUrl) + '" target="_blank" rel="noopener noreferrer">대학 공식 전형 안내 ↗</a>' : '') + '</div>' +
      '<p class="hint">이 안내는 확보된 자료를 바탕으로 한 준비 순서이며, 올해 모집요강의 시험시간·유형·지원자격을 자동 확정하지 않습니다. 자체 연습 점수는 대학 점수가 아닙니다.</p>';
    guide.querySelector('[data-prep-start]')?.addEventListener('click', () => {
      mode.value = 'questions'; subject.value = ''; hard.checked = false; page = 0; drawList();
      open(keyFor(first), first.id);
    });
    guide.querySelector('[data-prep-pdf]')?.addEventListener('click', () => {
      mode.value = 'resources'; subject.value = ''; hard.checked = false; page = 0; drawList(true);
    });
  }
  function drawList(move = false) {
    const isQuestions = mode.value === 'questions';
    const rows = (isQuestions ? questionRows : resources).filter(item => {
      const name = isQuestions ? schoolFor(item) : item.universityName, field = isQuestions ? subjectFor(item) : item.subject;
      return (!school.value || name === school.value) && subjectMatches(subject.value, field) && (!hard.checked || isHard(isQuestions ? keyFor(item) : item.id, isQuestions ? item.id : null));
    });
    const pages = Math.ceil(rows.length / 9);
    page = Math.min(page, Math.max(0, pages - 1));
    list.innerHTML = `<p><strong>${rows.length}개 ${isQuestions ? '연습 문항' : '공식 PDF 자료'}</strong></p><div class="cards">${rows.slice(page * 9, page * 9 + 9).map(item => {
      const id = isQuestions ? keyFor(item) : item.id, qid = isQuestions ? item.id : '';
      const status = isQuestions ? (item.contentStatus === 'question_page_fallback' ? '공식 기출 · 문제 쪽 자동 연결 · 원문 PDF에서 본문 확인' : item.sourceKind === 'official_past' ? '공식 기출 · 원문 PDF 쪽과 요구사항 색인' : item.sourceKind === 'official_mock' ? '공식 모의논술 · 본시험 기출과 구분' : item.sourceKind === 'generated_school_practice' ? '공식 원문 미확보 · 근거 표시 자체 연습' : item.sourceId ? '공식 자료 연결 문항 · 근거와 풀이 점검' : '자체 제작 연습 · 대학 실제 기출이 아님') : '원문 PDF 읽기 · 문항별 확보 범위 확인';
      const resourceQuestionCount = !isQuestions ? questionRows.filter(question => question.sourceId === item.id).length : 0;
      const subjectLabel = !isQuestions && /자료 내|계열별 확인/u.test(String(item.subject || '')) ? '계열은 PDF 문항별 확인' : (isQuestions ? subjectFor(item) : item.subject);
      return `<article class="card"><span class="tag">${esc(isQuestions ? schoolFor(item) : item.universityName)}${item.year ? ` · ${esc(item.year)}` : ''}</span><h2>${esc(item.title)}</h2><p>${esc(subjectLabel)}</p><p class="hint">${status}</p>${resourceQuestionCount ? `<p class="hint">${resourceQuestionCount}개 문제 쪽을 원문 PDF에서 바로 확인할 수 있습니다.</p>` : ''}${isQuestions && item.sourceEvidence?.basis ? `<p class='hint'><strong>근거:</strong> ${esc(item.sourceEvidence.basis)}</p>` : ''}${isQuestions && item.promptSummary ? `<p>${esc(item.promptSummary)}</p>` : ''}<button class="primary" data-open="${esc(id)}" data-question="${esc(qid)}">${isQuestions ? '이 문제 풀기' : 'PDF 읽고 문제 선택'}</button><button data-hard="${esc(id)}" data-question="${esc(qid)}" aria-pressed="${isHard(id, qid)}">${isHard(id, qid) ? '★ 어려운 항목 해제' : '☆ 어려운 항목 담기'}</button></article>`;
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
      const evidence = q?.sourceEvidence;
      const evidenceMarkup = evidence ? '<section class="practice-evidence"><h4>이 연습문제의 근거</h4><p><strong>' + esc(evidence.status === 'official_question_page_verified' ? '공식 PDF 문제 쪽 확인' : evidence.status === 'official_original_not_found' ? '공식 원문 미확보' : '자체 기준 자료') + '</strong> · ' + esc(evidence.reason || '') + '</p><p class="hint">' + esc(evidence.basis || '') + '</p>' + (evidence.page ? '<p class="hint">확인 쪽수: ' + esc(evidence.page) + '쪽</p>' : '') + (evidence.sourceUrl && /^https?:\/\//i.test(String(evidence.sourceUrl)) ? '<a class="button" target="_blank" rel="noopener noreferrer" href="' + esc(evidence.sourceUrl) + '">' + esc(evidence.sourceTitle || '근거 원문 열기') + '</a>' : '') + '</section>' : '';
      answer.value = draft?.answer ?? (saved[id].questionId === qkey() ? saved[id].answer || '' : '');
      questionBody.innerHTML = q ? `<h3>${esc(q.title)}</h3><p class="tag">${q.sourceKind === 'official_past' ? '공식 기출 · 원문 PDF에서 문항 위치와 요구사항을 색인함' : q.sourceKind === 'generated_school_practice' ? '공식 원문 미확보 · 근거 표시 자체 연습' : q.sourceId ? q.sourceKind === 'official_mock' ? '공식 모의논술 문항' : '공식 자료 연결 문항' : '자체 제작 연습 문항'}</p>${evidenceMarkup}${prompt ? paragraphs(prompt) : '<p>이 문항은 아래 공식 PDF에서 읽을 수 있습니다. 문제 쪽수와 채점 기준 쪽수를 구분해 확인하세요.</p>'}${q.sourceKind === 'official_past' ? '<p class="hint">전체 제시문과 문제 본문은 원문 PDF에서 확인합니다. 아래 버튼으로 같은 문항 쪽을 열어 읽고, 해설 쪽이 있으면 함께 비교하세요.</p>' : ''}${(Array.isArray(q.passages) ? q.passages : []).map(p => typeof p === 'string' ? `<blockquote>${paragraphs(p)}</blockquote>` : `<blockquote>${p.title || p.label ? `<strong>${esc(p.title || p.label)}</strong>` : ''}${paragraphs(p.text || p.content)}</blockquote>`).join('')}${q.questionPage && active.url ? `<button data-question-page>${q.sourceKind === 'official_past' ? '공식 PDF 문제 쪽 열기' : q.referenceKind === 'rubric_page' ? '평가 기준' : '문제'} ${Number(q.questionPage)}쪽 읽기</button>` : ''}${q.solutionPages?.length && active.url ? `<p class="hint">해설·채점 기준 쪽: ${esc(q.solutionPages.join(', '))}쪽(원문 PDF에서 확인)</p>` : ''}${q.scoringNote ? `<p class="hint">${esc(q.scoringNote)}</p>` : ''}${q.sampleAnswer ? `<details><summary>풀이 기준·참고 답안 보기</summary><p class="hint">${q.sourceId ? '출처에 기반한 비교 기준입니다. 정답 수치 자동 비교와 서술형 풀이 점검은 구분됩니다.' : '자체 제작한 참고 답안입니다. 이 표현과 일치해야 정답이라는 뜻은 아닙니다.'}</p>${paragraphs(q.sampleAnswer)}</details>` : ''}` : '<h3>PDF 문항 자유 기록</h3><p>읽고 있는 PDF의 문항 번호와 답안을 기록하세요. 개별 정답 기준이 연결되지 않은 문항은 답안 구조 점검만 제공합니다.</p>';
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
      const scoreMarkup = evaluation.score != null ? '<section class="practice-score-card"><div class="score-card-head"><strong>학습용 기준 점수 '+esc(evaluation.score)+'/100</strong><span>'+esc(evaluation.scoreLabel||'공식 대학 점수 아님')+'</span></div><div class="score-meter" role="progressbar" aria-label="학습용 기준 점수" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+esc(evaluation.score)+'"><i style="width:'+Math.max(0,Math.min(100,Number(evaluation.score)||0))+'%"></i></div><p class="hint">'+esc(evaluation.scoreBreakdown?.note||'기준 요소와 답안 구조를 확인한 연습용 지표입니다.')+'</p></section>' : '';
      const structureMarkup = evaluation.structureChecks?.length ? '<section class="practice-structure"><h4>답안 구조 점검</h4><ul>'+evaluation.structureChecks.map(check => '<li class="'+(check.ok?'is-ok':'is-missing')+'"><span aria-hidden="true">'+(check.ok?'✓':'!')+'</span>'+esc(check.label)+(check.ok?' · 확인됨':' · 보완 필요')+'</li>').join('')+'</ul></section>' : '';
      const criterionMarkup = (evaluation.criteria||[]).map(c => '<article class="rubric-result '+esc(c.status||'')+'"><div class="rubric-head"><h4>'+esc(c.label)+'</h4><strong>'+esc(c.earnedPoints==null?'확인 중':c.earnedPoints)+' / '+esc(c.maxPoints||25)+'점</strong></div>'+(c.referenceEvidence?'<p><strong>정답에 가까워지는 기준</strong> '+esc(c.referenceEvidence)+'</p>':'')+(c.evidence?'<blockquote><strong>내 답안에서 확인한 부분</strong><br>'+esc(Array.isArray(c.evidence)?c.evidence.join(' · '):c.evidence)+'</blockquote>':'')+(c.missingConcepts?.length?'<p class="hint"><strong>아직 드러나지 않은 요소</strong> '+esc(c.missingConcepts.join(' · '))+'</p>':'')+'<p>'+esc(c.feedback||'')+'</p></article>').join('');
      const nextMarkup = evaluation.nextActions?.length ? '<h4>다음 답안에서 바꿀 것</h4><ol>'+evaluation.nextActions.map(s => '<li>'+esc(s)+'</li>').join('')+'</ol>' : '';
      const warningMarkup = evaluation.warnings?.length ? '<p class="hint">'+evaluation.warnings.map(esc).join(' ')+'</p>' : '';
      result.innerHTML='<h3>답안 평가와 다음 수정</h3>'+scoreMarkup+(numeric?numericFeedback(numeric,activeQuestion):'')+'<p>'+esc(evaluation.summary||'답안의 근거와 구성 요소를 확인했습니다.')+'</p>'+structureMarkup+criterionMarkup+nextMarkup+coachingGuide(activeQuestion||{})+solutionGuide+warningMarkup+'<p class="hint">서술형 피드백은 학습을 돕는 기준 비교입니다. 대학의 실제 채점 결과나 합격 가능성을 산출하지 않습니다.</p><button id="practice-revise">답안 고쳐 쓰기</button>';
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
    if (mode.value === 'questions' && school.value && !questionRows.some(q => schoolFor(q) === school.value) && resources.some(r => r.universityName === school.value)) mode.value = 'resources';
    subject.value = ''; page = 0; drawList(); updateSchoolGuide();
  };
  const previous = saved._session;
  if (previous) {
    mode.value = previous.mode === 'resources' ? 'resources' : 'questions';
    if ([...school.options].some(o => o.value === previous.school)) school.value = previous.school;
    if ([...subject.options].some(o => o.value === previous.subject)) subject.value = previous.subject;
  }
  const routeSchool = (() => {
    const encoded = location.hash.slice(1).match(/^prepare\/essay\/(.+)$/)?.[1] || '';
    try { return decodeURIComponent(encoded); } catch { return ''; }
  })();
  if (routeSchool && [...school.options].some(option => option.value === routeSchool)) {
    school.value = routeSchool; subject.value = ''; mode.value = 'questions';
  }
  drawList(); updateSchoolGuide();
  if (previous?.id && (!routeSchool || previous.school === routeSchool)) open(previous.id, previous.questionId);
}
