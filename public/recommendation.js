import { groupOutcomeSeries } from './outcomes.js';
import { parseGrade, gradeSubjects, renderGradeInput } from './grade-input.js';
export { parseGrade } from './grade-input.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function validateSubjectGrades(values = {}, scale = '9') {
  return gradeSubjects.every(([key]) => values[key] === undefined || values[key] === '' || parseGrade(values[key],scale) !== null);
}

// Orders material to inspect, never estimates an individual's admission probability.
export function buildRecommendations(records, profile = {}, converted = {}) {
  return groupOutcomeSeries(records).map(group => {
    const latest = Math.max(...group.rows.map(r => Number(r.academicYear)));
    const rows = group.rows.filter(r => Number(r.academicYear) >= latest - 4);
    const years = new Set(rows.map(r => Number(r.academicYear)));
    const first = rows[0];
    const identity = r => JSON.stringify([r.metric,String(r.scale),r.formulaKey]);
    const comparable = years.size >= 3 && years.size === rows.length && rows.every(r => r.formulaKey && Number.isFinite(r.grade70) && r.grade70 >= 1 && r.grade70 <= Number(r.scale)) && new Set(rows.map(identity)).size === 1;
    const scaleMatches = String(first.scale) === String(profile.scale);
    const input = converted[first.formulaKey];
    const grade = input?.confirmed ? parseGrade(input.grade, input.scale) : null;
    const canCompare = comparable && scaleMatches && grade !== null && String(input.scale) === String(first.scale);
    const range = comparable ? {min: Math.min(...rows.map(r=>r.grade70)), max: Math.max(...rows.map(r=>r.grade70))} : null;
    const distance = canCompare ? Math.round(Math.max(range.min-grade, grade-range.max, 0)*100)/100 : null;
    return {...group,rows,comparable,scaleMatches,range,distance,personalProbability:null,
      differences:canCompare?rows.map(r=>({academicYear:r.academicYear,difference:Math.round((grade-r.grade70)*100)/100})):[],
      reason:!scaleMatches?'5등급제와 9등급제 성적은 자동 환산하지 않습니다.':!comparable?'3개년 이상 동일 산식·집계 대상이 확인되지 않아 성적 거리 계산을 보류합니다.':!canCompare?'대학 산식으로 계산한 환산등급을 입력하면 과거 성적과 차이를 볼 수 있습니다.':'같은 산식의 과거 70% 기준 범위와 내 환산등급의 거리입니다. 합격 우선순위가 아닙니다.'};
  }).sort((a,b)=>(a.distance===null)-(b.distance===null)||(a.distance??0)-(b.distance??0)||b.rows.length-a.rows.length||a.program.localeCompare(b.program,'ko'));
}

export function rankSchoolCandidates(universities, summaries, profile = {}) {
  const byId = new Map(summaries.map(s=>[s.universityId,s]));
  return universities.filter(u=>!['0000431','0002659','0000548'].includes(u.id))
    .filter(u=>!profile.preferredRegion||u.region===profile.preferredRegion)
    .filter(u=>!profile.preferredType||u.institutionType===profile.preferredType)
    .map(u=>({...u,outcomeSummary:byId.get(u.id)}))
    .sort((a,b)=>(b.outcomeSummary?.years?.length||0)-(a.outcomeSummary?.years?.length||0)||String(a.displayName||a.name).localeCompare(String(b.displayName||b.name),'ko'));
}

export function paginateItems(items, requestedPage = 1, pageSize = 12) {
  const size = Math.max(1,Math.floor(Number(pageSize))||12);
  const totalPages = Math.max(1,Math.ceil(items.length/size));
  const page = Math.max(1,Math.min(totalPages,Math.floor(Number(requestedPage))||1));
  return {items:items.slice((page-1)*size,page*size),page,totalPages,total:items.length};
}

export function filterSchoolCandidates(universities, summaries, profile = {}, query = '') {
  const text = String(query).replace(/\s/g,'').toLocaleLowerCase('ko');
  return rankSchoolCandidates(universities,summaries,profile).filter(u=>!text||[u.name,u.displayName,u.campus,u.region,...(u.aliases||[])].join(' ').replace(/\s/g,'').toLocaleLowerCase('ko').includes(text));
}

// A valid overall grade can be applied before optional subject inputs are complete.
// Incomplete details remain an editable draft and never produce a calculated grade.
export function applyRecommendationProfile(profile, {average = '', scale = '9', badInput = false, gradePatch = {}, gradeErrors = []} = {}) {
  const value = String(average).trim();
  if (!['5','9'].includes(String(scale)) || badInput || (value !== '' && parseGrade(value,scale) === null)) {
    return {error:`평균 내신은 1~${scale} 사이의 소수점 둘째 자리까지 입력하세요. 예: 2.3`, profile:null};
  }
  const detailsPending = gradeErrors.length > 0;
  const next = {...profile,...gradePatch,average:value,scale:String(scale),
    averageSource:profile.averageSource === 'entered_subjects' && value === String(profile.average) && !detailsPending ? 'entered_subjects' : 'manual',
    gradeDetailsStatus:detailsPending ? 'needs_review' : 'ready'};
  if(detailsPending){next.calculatedAverage=null;next.calculatedAverageMethod=null;}
  return {profile:next,error:null,detailsPending};
}

export function gradeReferenceSummary(groups, profile) {
  return {
    average:parseGrade(profile.average,profile.scale),scale:String(profile.scale),
    sameScaleGroups:groups.filter(group=>group.scaleMatches).length,
    verifiedSeries:groups.filter(group=>group.scaleMatches&&group.comparable).length,
    calculatedGroups:groups.filter(group=>group.distance!==null).length
  };
}

export function renderRecommendations(target, {profile = {}, universities = [], outcomeSchools = [], onSave, onProfileChange} = {}) {
  const local = {...profile,scale:profile.scale||'9'};
  const converted = {};
  let records = [], request = 0, selectedSchool = '', schoolPage = 1, groupPage = 1;
  const totalSchools = rankSchoolCandidates(universities,outcomeSchools,{}).length;
  const regions = [...new Set(universities.map(u=>u.region).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ko'));
  const types = [...new Set(universities.map(u=>u.institutionType).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ko'));
  if(local.preferredType&&!types.includes(local.preferredType))local.preferredType='';
  if(local.preferredRegion&&!regions.includes(local.preferredRegion))local.preferredRegion='';
  target.innerHTML = `<p class="eyebrow">내 성적으로 대학 찾기</p><h1>학교부터 고르고, 내 성적과 비교해요</h1><p>대학을 먼저 둘러보고 관심 학과의 최근 입결을 확인하세요. 세부 성적은 선택이며 입력하면 평균 계산과 더 세밀한 진단에 활용할 수 있어요.</p><form id="recommend-profile" class="panel" novalidate><div class="fields"><div><label for="recommend-average">전체 평균 내신 · 선택</label><input id="recommend-average" type="number" inputmode="decimal" step="0.01" min="1" max="${esc(local.scale)}" placeholder="예: 2.3" value="${esc(local.average||'')}"><p class="hint">예: 2.3등급. 소수점 둘째 자리까지 입력할 수 있어요.</p></div><div><label for="recommend-scale">등급 체계</label><select id="recommend-scale"><option value="9" ${String(local.scale)!=='5'?'selected':''}>9등급제</option><option value="5" ${String(local.scale)==='5'?'selected':''}>5등급제</option></select></div></div><div id="recommend-grade-input"></div><button class="primary" type="submit" id="recommend-apply" aria-controls="recommend-output">내 정보 적용</button><p id="recommend-error" class="error" role="alert"></p><div id="recommend-status" class="notice" role="status" aria-live="polite" aria-atomic="true" tabindex="-1" hidden></div></form><section id="candidate-ranking" class="panel candidate-ranking" aria-labelledby="candidate-ranking-title"><div class="section-head"><div><p class="eyebrow">성적 기준 후보 순위</p><h2 id="candidate-ranking-title">같은 산식의 입결로 1·2·3순위를 비교해요</h2></div></div><p>전체 평균은 탐색의 시작점입니다. 대학별 반영 산식으로 계산한 환산등급을 입력하면, 동일 등급체계·동일 산식·최근 3~5개년 공식 입결을 비교해 성적 기준 후보를 보여드려요.</p><form id="candidate-ranking-form" novalidate><div class="fields"><div><label for="candidate-converted-grade">대학 산식 환산등급</label><input id="candidate-converted-grade" type="number" inputmode="decimal" step="0.01" min="1" max="\${esc(local.scale)}" placeholder="예: 대학 산식으로 계산한 2.30" required><p class="hint">전체 평균을 그대로 옮기지 마세요. 선택한 대학 산식으로 계산한 값만 입력합니다.</p></div><div><label for="candidate-formula">비교 산식</label><select id="candidate-formula" disabled><option value="">공식 산식 목록을 불러오는 중…</option></select><p class="hint">동일 산식으로 확인된 전형만 비교 대상에 포함합니다.</p></div></div><button class="primary" type="submit" id="candidate-ranking-submit" disabled>성적 기준 후보 보기</button><p id="candidate-ranking-status" class="hint" role="status" aria-live="polite">공식 비교 산식을 확인하고 있어요.</p></form><div id="candidate-ranking-results" aria-live="polite"></div><p class="notice">1·2·3순위는 과거 공식 입결과의 성적 기준 비교 순위입니다. 합격 예측·합격 보장·개인 합격확률이 아니며, 수능최저·서류·면접·모집요강 변경은 별도로 확인해야 합니다.</p></section><section aria-label="학교 검색"><div class="filters"><div><label for="recommend-school-query">학교 이름 검색</label><input id="recommend-school-query" type="search" placeholder="예: 울산대학교, 서울"></div><div><label for="recommend-region">희망 지역</label><select id="recommend-region"><option value="">전국</option>${regions.map(region=>`<option value="${esc(region)}" ${local.preferredRegion===region?'selected':''}>${esc(region)}</option>`).join('')}</select></div><div><label for="recommend-type">학교 유형</label><select id="recommend-type"><option value="">전체 대학</option>${types.map(type=>`<option value="${esc(type)}" ${local.preferredType===type?'selected':''}>${esc(type)}</option>`).join('')}</select></div></div><p class="hint">현재 탐색 대상은 전국 ${totalSchools}개 캠퍼스입니다. 입결이 없는 학교도 목록에서 확인할 수 있습니다.</p><button type="button" id="recommend-reset">지역·검색 해제 · 전국 학교 보기</button></section><div id="recommend-output" aria-live="polite"></div>`;
  const $ = id => target.querySelector('#'+id);
  const ownedOutput = $('recommend-output');
  const stillActive = () => target.isConnected && $('recommend-output') === ownedOutput;
  let appliedAverage = String(local.average || ''), appliedScale = String(local.scale);
  const grades = renderGradeInput($('recommend-grade-input'),local,(patch,meta)=>{
    Object.assign(local,patch);
    if(meta.averageApplied){
      $('recommend-average').value=patch.average;
      local.scale=$('recommend-scale').value;
      $('recommend-error').textContent='';
      showAppliedStatus(appliedAverage,appliedScale,[]);
      refreshGradeResults();
    }
    onProfileChange?.({...local});
  },{initiallyOpen:false});
  function gradeLabel(average,scale){return `${average === '' ? '평균 미입력' : average+'등급'} · ${scale}등급제`;}
  function showAppliedStatus(previousAverage,previousScale,detailErrors){
    const changed=String(local.average)!==previousAverage||String(local.scale)!==previousScale;
    const message=changed?`${gradeLabel(previousAverage,previousScale)} → ${gradeLabel(local.average,local.scale)}`:gradeLabel(local.average,local.scale);
    $('recommend-status').innerHTML=`<strong>✓ ${esc(message)} 적용 완료</strong><p>학교 목록과 학과별 입결 비교표에 반영했어요. 평균만으로 합격 순위를 정하지 않으므로 학교 순서는 그대로일 수 있어요.</p>${detailErrors.length?`<p>선택 세부 성적은 아직 계산에 사용하지 않았어요. ${esc(detailErrors[0])}</p><button type="button" id="recommend-fix-details">세부 성적 오류 수정하기</button>`:''}`;
    $('recommend-status').hidden=false;
    if($('recommend-fix-details'))$('recommend-fix-details').onclick=()=>grades.open({focus:true});
    $('recommend-apply').textContent='내 정보 적용';
    appliedAverage=String(local.average);appliedScale=String(local.scale);
  }
  let candidateRequest = 0;
  function candidateRelationText(candidate) {
    const sign = candidate.differenceFromMedian > 0 ? '+' : '';
    return \`최근 70% 기준 중앙값과 \${sign}\${Number(candidate.differenceFromMedian).toFixed(2)}등급 차이 · \${esc(candidate.relation)}\`;
  }
  function candidateCards(candidates = []) {
    if (!candidates.length) return '<div class="empty"><h3>순위를 계산할 수 있는 동일 비교 자료가 없어요</h3><p>이 대학에 지원할 수 없다는 뜻은 아닙니다. 다른 공식 산식을 선택하거나 대학·학과 상세에서 입결과 모집요강을 확인해 주세요.</p></div>';
    return \`<div class="candidate-rank-grid">\${candidates.map((candidate, index) => \`<article class="card candidate-rank-card"><span class="tag">\${index + 1}순위 성적 비교 후보</span><h3>\${esc(candidate.universityName)}</h3><p class="candidate-program">\${esc(candidate.program)} · \${esc(candidate.track)}</p><dl class="facts"><div><dt>내 환산등급</dt><dd>\${Number(candidate.studentGrade).toFixed(2)}등급</dd></div><div><dt>최근 \${candidate.dataYears}개년 70% 기준</dt><dd>\${Number(candidate.grade70Range.min).toFixed(2)}~\${Number(candidate.grade70Range.max).toFixed(2)}등급</dd></div><div><dt>비교 산식</dt><dd>\${esc(candidate.formulaLabel)}</dd></div><div><dt>비교 연도</dt><dd>\${candidate.years.map(esc).join(' · ')}</dd></div></dl><p class="hint">\${candidateRelationText(candidate)}</p><p class="candidate-reason"><strong>순위 근거</strong> 같은 산식·등급체계에서 과거 기준 범위와의 거리, 중앙값과의 차이, 확인 연수를 차례로 비교했습니다.</p><div class="actions"><button type="button" class="primary" data-candidate-school="\${esc(candidate.universityId)}">학과·입결 자세히</button>\${candidate.sourceUrls?.[0] ? \`<a class="button" href="\${esc(candidate.sourceUrls[0])}" target="_blank" rel="noopener noreferrer">공식 출처</a>\` : ''}</div></article>\`).join('')}</div>\`;
  }
  async function loadCandidateFormulas() {
    const version = ++candidateRequest;
    const formula = $('candidate-formula'), status = $('candidate-ranking-status'), submit = $('candidate-ranking-submit');
    formula.disabled = true; submit.disabled = true;
    formula.innerHTML = '<option value="">공식 산식 목록을 불러오는 중…</option>';
    status.textContent = '공식 입결 자료에서 같은 산식으로 비교 가능한 전형을 확인하고 있어요.';
    try {
      const response = await fetch('/api/outcome-candidates?scale=' + encodeURIComponent($('recommend-scale').value));
      if (!response.ok) throw Error('candidate_formula_fetch');
      const data = await response.json();
      if (version !== candidateRequest || !stillActive()) return;
      formula.innerHTML = '<option value="">비교할 대학 산식을 선택하세요</option>' + (data.formulas || []).map(item => \`<option value="\${esc(item.key)}">\${esc(item.label)} · 비교 가능 전형 \${esc(item.series)}개</option>\`).join('');
      formula.disabled = !(data.formulas || []).length;
      submit.disabled = !(data.formulas || []).length;
      status.textContent = (data.formulas || []).length ? '전체 평균과 다른 대학 산식은 자동 환산하지 않습니다. 산식으로 계산한 값을 입력해 주세요.' : '현재 등급체계에서 최근 3개년 이상 같은 산식으로 비교 가능한 공식 자료를 찾지 못했습니다.';
    } catch {
      if (version !== candidateRequest || !stillActive()) return;
      formula.innerHTML = '<option value="">비교 산식을 불러오지 못했습니다</option>';
      status.textContent = '성적 기준 후보 자료 연결에 실패했습니다. 잠시 후 다시 시도해 주세요.';
    }
  }
  async function requestCandidateRanking(event) {
    event.preventDefault();
    const grade = parseGrade($('candidate-converted-grade').value, $('recommend-scale').value);
    const formulaKey = $('candidate-formula').value;
    const status = $('candidate-ranking-status'), results = $('candidate-ranking-results');
    if (grade === null) { status.textContent = \`환산등급은 1~\${$('recommend-scale').value} 사이의 소수점 둘째 자리까지 입력하세요.\`; $('candidate-converted-grade').focus(); return; }
    if (!formulaKey) { status.textContent = '비교할 대학 산식을 먼저 선택하세요.'; $('candidate-formula').focus(); return; }
    const version = ++candidateRequest;
    status.textContent = '동일 산식·동일 전형의 최근 입결을 비교하고 있어요.';
    results.innerHTML = '';
    try {
      const query = new URLSearchParams({ scale: $('recommend-scale').value, grade: String(grade), formulaKey });
      const response = await fetch('/api/outcome-candidates?' + query.toString());
      if (!response.ok) throw Error('candidate_ranking_fetch');
      const data = await response.json();
      if (version !== candidateRequest || !stillActive()) return;
      status.textContent = data.message || '';
      results.innerHTML = candidateCards(data.candidates || []);
      results.querySelectorAll('[data-candidate-school]').forEach(button => button.onclick = () => openSchool(button.dataset.candidateSchool));
    } catch {
      if (version !== candidateRequest || !stillActive()) return;
      status.textContent = '후보 순위를 불러오지 못했습니다. 입력값은 유지되며 다시 시도할 수 있어요.';
    }
  }
  $('candidate-ranking-form').onsubmit = requestCandidateRanking;
  loadCandidateFormulas();

  function refreshGradeResults(){
    if(selectedSchool){
      const summary=$('recommend-selected-summary');
      if(summary)summary.textContent=schoolSummary();
      drawGroups();
    }else drawSchools();
  }
  function showPendingStatus(){
    $('recommend-average').removeAttribute('aria-invalid');
    $('recommend-error').textContent='';
    $('recommend-status').hidden=false;
    $('recommend-status').textContent=`입력값을 수정했어요. ‘변경 성적 적용’을 누르면 ${gradeLabel($('recommend-average').value,$('recommend-scale').value)}을 비교표에 반영합니다. 현재 적용값: ${gradeLabel(appliedAverage,appliedScale)}.`;
    $('recommend-apply').textContent='변경 성적 적용';
  }
  function schoolSummary(){
    const university=universities.find(u=>u.id===selectedSchool);
    return `${university?.campus||'본교'} · ${university?.region||''} · 내 평균 ${parseGrade(local.average,local.scale)===null?'미입력':local.average+'등급'} · ${local.scale}등급제`;
  }
  function pageControls(current,total,prefix,label) {
    return `<div class="pagination" role="group" aria-label="${label} 페이지"><button type="button" id="${prefix}-prev" ${current<=1?'disabled':''}>이전</button><span>${current} / ${total}페이지</span><button type="button" id="${prefix}-next" ${current>=total?'disabled':''}>다음</button></div>`;
  }
  function focusOutput() {
    const heading=ownedOutput.querySelector('[tabindex="-1"]');
    if(heading){heading.focus({preventScroll:true});heading.scrollIntoView({block:'start'});}
  }
  function drawSchools(moveFocus=false) {
    if(!stillActive())return;
    const candidates=filterSchoolCandidates(universities,outcomeSchools,local,$('recommend-school-query').value);
    const paged=paginateItems(candidates,schoolPage,12);schoolPage=paged.page;
    ownedOutput.innerHTML=`<div class="section-head school-result-summary"><div><h2 tabindex="-1">학교 ${candidates.length}곳을 찾았어요</h2><p>${esc(local.preferredRegion||'전국')} · ${esc(local.preferredType||'전체 대학')}${parseGrade(local.average,local.scale)!==null?' · 내 평균 '+esc(local.average)+'등급':''}</p></div></div><p class="hint">학교 이름을 확인한 다음 ‘학과·입결 비교’를 누르세요. 수집 자료가 많은 학교부터 표시하며 합격 추천 순위는 아닙니다.</p>${candidates.length?`<div class="cards">${paged.items.map(u=>`<article class="card school-candidate"><span class="tag">${u.outcomeSummary?.years?.length||0}개년 입결 ${u.outcomeSummary?.years?.length?'제공':'수집 중'}</span><h3>${esc(u.displayName||u.name)}</h3><p>${esc(u.campus||'본교')} · ${esc(u.region)} · ${esc(u.institutionType)}</p><dl class="facts"><div><dt>수집 입결</dt><dd>${u.outcomeSummary?.count||0}건</dd></div><div><dt>자료 연도</dt><dd>${u.outcomeSummary?.years?.length?esc(u.outcomeSummary.years.join(' · ')):'아직 미수집'}</dd></div></dl><div class="actions"><button class="primary" type="button" data-open-school="${esc(u.id)}">학과·입결 비교</button><a class="button" href="#university/${esc(u.id)}">대학 상세</a>${onSave?`<button type="button" data-save-school="${esc(u.id)}" aria-label="${esc(u.name)} 후보 담기">+ 후보</button>`:''}</div></article>`).join('')}</div>${pageControls(paged.page,paged.totalPages,'recommend-schools','학교 목록')}`:'<div class="empty"><h3>검색 조건에 맞는 학교가 없어요</h3><p>지원 가능한 학교가 없다는 뜻은 아닙니다. 검색어를 줄이거나 위 ‘전국 학교 보기’를 누르세요.</p></div>'}`;
    ownedOutput.querySelectorAll('[data-open-school]').forEach(button=>button.onclick=()=>openSchool(button.dataset.openSchool));
    bindSaveButtons();
    if($('recommend-schools-prev'))$('recommend-schools-prev').onclick=()=>{schoolPage--;drawSchools(true);};
    if($('recommend-schools-next'))$('recommend-schools-next').onclick=()=>{schoolPage++;drawSchools(true);};
    if(moveFocus)focusOutput();
  }
  function bindSaveButtons() {
    ownedOutput.querySelectorAll('[data-save-school]').forEach(button=>button.onclick=()=>{onSave?.(button.dataset.saveSchool);button.textContent='✓ 후보에 담았어요';button.setAttribute('aria-pressed','true');});
  }
  function drawSchoolShell() {
    const university=universities.find(u=>u.id===selectedSchool);
    if(!university){backToSchools();return;}
    ownedOutput.innerHTML=`<section class="recommend-detail"><button type="button" id="recommend-back-schools">← 학교 목록으로</button><h2 tabindex="-1">${esc(university.displayName||university.name)} · 학과별 입결</h2><p id="recommend-selected-summary">${esc(schoolSummary())}</p><div class="actions"><a class="button" href="#university/${esc(selectedSchool)}">대학 상세 안내</a><a class="button" href="#majors/${esc(selectedSchool)}">학과 전체 안내</a><a class="button" href="#history/${esc(selectedSchool)}">전체 연도별 입결</a>${onSave?`<button type="button" data-save-school="${esc(selectedSchool)}">+ 이 대학 담기</button>`:''}</div><label for="recommend-major">이 대학의 관심 학과·전형 검색</label><input id="recommend-major" type="search" placeholder="예: 간호, 학생부교과"><div id="recommend-major-output"></div></section>`;
    $('recommend-back-schools').onclick=backToSchools;
    $('recommend-major').oninput=()=>{groupPage=1;drawGroups();};
    bindSaveButtons();
  }
  function drawGroups(moveFocus=false) {
    if(!stillActive()||!$('recommend-major-output'))return;
    const query=$('recommend-major').value.trim().toLowerCase();
    const groups=buildRecommendations(records,local,converted).filter(g=>`${g.program} ${g.track}`.toLowerCase().includes(query));
    const page=paginateItems(groups,groupPage,5);groupPage=page.page;
    const formulas=[...new Map(groups.filter(g=>g.comparable&&g.scaleMatches).map(g=>[g.rows[0].formulaKey,g.rows[0]])).values()];
    const university=universities.find(u=>u.id===selectedSchool);
    const reference=gradeReferenceSummary(groups,local);
    $('recommend-major-output').innerHTML=`<h3 id="recommend-groups-heading" tabindex="-1">${groups.length}개 학과·전형 · ${page.page} / ${page.totalPages}페이지</h3><div class="notice"><strong>현재 적용: ${reference.average===null?'평균 미입력':esc(local.average)+'등급'} · ${esc(reference.scale)}등급제</strong><p>같은 등급 체계의 자료 ${reference.sameScaleGroups}개 학과·전형 · 3개년 이상 비교 조건 확인 ${reference.verifiedSeries}개 · 대학 환산등급 차이 계산 ${reference.calculatedGroups}개</p><p>입력 평균은 표의 마지막 열에 표시합니다. 학교별 반영 과목·산식이 확인되기 전에는 합격 가능성이나 성적 차이를 계산하지 않아요.</p></div>${formulas.length?`<details class="panel"><summary>대학 산식으로 계산한 환산등급 추가 · 선택</summary><p>전체 평균과 대학 환산등급은 다를 수 있어요. 아래 과거 산식으로 계산한 경우에만 연도별 차이를 산출합니다.</p>${formulas.map((f,i)=>`<form data-formula="${esc(f.formulaKey)}"><h4>${esc(f.formulaLabel||f.formulaKey)}</h4><label for="converted-${i}">대학 산식으로 계산한 환산등급</label><input id="converted-${i}" name="grade" type="number" inputmode="decimal" step="0.01" min="1" max="${esc(f.scale)}" placeholder="예: 2.3" required value="${esc(converted[f.formulaKey]?.grade||'')}"><label><input name="confirmed" type="checkbox" required ${converted[f.formulaKey]?.confirmed?'checked':''}> 전체 평균을 그대로 옮긴 것이 아니라 위 산식으로 계산했습니다.</label><button type="submit">과거 분포와 비교</button></form>`).join('')}</details>`:''}${groups.length?page.items.map(g=>`<article class="panel"><p class="eyebrow">${esc(university?.name||g.universityName)}</p><h3>${esc(g.program)} · ${esc(g.track)}</h3><p>${esc(g.reason)}</p>${g.range&&g.scaleMatches?`<p><strong>최근 ${g.rows.length}개년 공식 70% 기준: ${g.range.min.toFixed(2)}~${g.range.max.toFixed(2)}등급</strong><br>내 입력 평균 ${parseGrade(local.average,local.scale)===null?'미입력':esc(local.average)+'등급'}은 별도 기준의 참고값입니다.</p>`:''}${g.distance!==null?`<p><strong>과거 범위와 거리 ${g.distance.toFixed(2)}등급</strong> · 70% 기준 ${g.range.min}~${g.range.max}등급</p>`:''}<div class="compare"><table><caption>${esc(university?.name||g.universityName)} ${esc(g.program)} · 공식 발표 성적</caption><thead><tr><th>학년도</th><th>평균</th><th>70% 기준</th><th>내 환산등급 차이</th><th>내 입력 평균 · 별도 기준</th></tr></thead><tbody>${g.rows.map(r=>{const difference=g.differences.find(d=>d.academicYear===r.academicYear);const unit=['5','9'].includes(String(r.scale))?'등급':'점';return `<tr><th>${esc(r.academicYear)}</th><td>${r.gradeMean==null?'미확보':esc(r.gradeMean)+unit}</td><td>${r.grade70==null?'미확보':esc(r.grade70)+unit}</td><td>${difference?(difference.difference>0?'+':'')+difference.difference.toFixed(2)+'등급':'동일 산식 확인 필요'}</td><td>${parseGrade(local.average,local.scale)===null?'미입력':esc(local.average)+'등급'}<br><small>대학 환산등급 아님</small></td></tr>`;}).join('')}</tbody></table></div><p class="hint">전체 평균은 참고로 나란히 표시합니다. 반영 과목·이수단위·집계 대상이 다르면 직접 비교할 수 없습니다. 70% 기준은 합격확률 70%가 아닙니다.</p>${[...new Set(g.rows.map(r=>r.comparabilityNote).filter(Boolean))].map(note=>`<p class="notice">${esc(note)}</p>`).join('')}<p>${g.rows.map(r=>/^https:\/\//.test(r.sourceUrl||'')?`<a href="${esc(r.sourceUrl)}" target="_blank" rel="noopener noreferrer">${esc(r.academicYear)} 공식 출처</a>`:'').join(' · ')}</p></article>`).join(''):'<div class="empty"><h3>이 조건의 입결 자료는 아직 수집하지 못했어요</h3><p>이 학교가 없거나 지원할 수 없다는 뜻은 아닙니다. 위 대학 상세·학과 안내를 이용하거나 검색어를 바꿔 보세요.</p></div>'}${groups.length?pageControls(page.page,page.totalPages,'recommend-groups','학과 입결'):''}`;
    target.querySelectorAll('[data-formula]').forEach(form=>form.onsubmit=event=>{event.preventDefault();const key=form.dataset.formula;const formula=formulas.find(f=>f.formulaKey===key);const grade=parseGrade(form.elements.grade.value,formula.scale);if(grade===null||!form.elements.confirmed.checked)return;converted[key]={grade,scale:formula.scale,confirmed:true};drawGroups();});
    if($('recommend-groups-prev'))$('recommend-groups-prev').onclick=()=>{groupPage--;drawGroups(true);};
    if($('recommend-groups-next'))$('recommend-groups-next').onclick=()=>{groupPage++;drawGroups(true);};
    if(moveFocus){$('recommend-groups-heading').focus({preventScroll:true});$('recommend-groups-heading').scrollIntoView({block:'start'});}
  }
  function backToSchools(){request++;selectedSchool='';records=[];drawSchools(true);}
  async function openSchool(id) {
    if(!stillActive()||!universities.some(u=>u.id===id))return;
    selectedSchool=id;groupPage=1;records=[];
    const version=++request;drawSchoolShell();focusOutput();
    if(!outcomeSchools.some(school=>school.universityId===id)){drawGroups();return;}
    $('recommend-major-output').textContent='이 대학의 공식 입결 자료를 불러오고 있어요…';
    try {
      const response=await fetch('/api/outcomes?universityId='+encodeURIComponent(id));
      if(!response.ok)throw Error('fetch');const data=await response.json();if(!Array.isArray(data))throw Error('schema');
      if(version!==request||!stillActive())return;records=data;drawGroups();
    }catch{if(version!==request||!stillActive())return;$('recommend-major-output').innerHTML='<p>입결 연결에 실패했습니다. 학교 안내와 입력값은 유지됩니다.</p><button type="button" id="recommend-retry">다시 불러오기</button>';$('recommend-retry').onclick=()=>openSchool(id);}
  }
  function applyFilters(){local.preferredRegion=$('recommend-region').value;local.preferredType=$('recommend-type').value;request++;selectedSchool='';schoolPage=1;records=[];drawSchools();}
  $('recommend-reset').onclick=()=>{$('recommend-region').value='';$('recommend-type').value='';$('recommend-school-query').value='';applyFilters();onProfileChange?.({...local});focusOutput();};
  for(const id of ['recommend-region','recommend-type','recommend-school-query'])$(id).oninput=applyFilters;
  $('recommend-profile').onsubmit=event=>{
    event.preventDefault();const scale=$('recommend-scale').value;const value=$('recommend-average').value;const result=grades.validate();
    const update=applyRecommendationProfile(local,{average:value,scale,badInput:$('recommend-average').validity.badInput,gradePatch:grades.getValue(),gradeErrors:result.errors});
    if(update.error){$('recommend-error').textContent=update.error;$('recommend-average').setAttribute('aria-invalid','true');$('recommend-average').focus();return;}
    Object.assign(local,update.profile);
    $('recommend-average').value=local.average;
    onProfileChange?.({...local});
    $('recommend-error').textContent='';
    showAppliedStatus(appliedAverage,appliedScale,result.errors);
    refreshGradeResults();
    $('recommend-status').focus({preventScroll:true});
    $('recommend-status').scrollIntoView({block:'center',behavior:'auto'});
  };
  $('recommend-average').oninput=()=>{local.averageSource='manual';showPendingStatus();};
  $('recommend-scale').onchange=()=>{const scale=$('recommend-scale').value;$('recommend-average').max=scale;$('candidate-converted-grade').max=scale;$('candidate-converted-grade').value='';$('candidate-ranking-results').innerHTML='';grades.setScale(scale);showPendingStatus();loadCandidateFormulas();$('recommend-error').textContent='등급 체계가 바뀌었어요. 기존 성적이 선택한 체계에 맞는지 확인한 뒤 적용해 주세요. 5등급제와 9등급제를 자동 환산하지 않습니다.';};
  drawSchools();
}
