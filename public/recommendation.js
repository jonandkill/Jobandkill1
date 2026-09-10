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

export function renderRecommendations(target, {profile = {}, universities = [], outcomeSchools = [], onSave, onProfileChange} = {}) {
  const local = {...profile,scale:profile.scale||'9'};
  const converted = {};
  let records = [], request = 0, selectedSchool = '', schoolPage = 1, groupPage = 1;
  const totalSchools = rankSchoolCandidates(universities,outcomeSchools,{}).length;
  const regions = [...new Set(universities.map(u=>u.region).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ko'));
  const types = [...new Set(universities.map(u=>u.institutionType).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ko'));
  if(local.preferredType&&!types.includes(local.preferredType))local.preferredType='';
  if(local.preferredRegion&&!regions.includes(local.preferredRegion))local.preferredRegion='';
  target.innerHTML = `<p class="eyebrow">내 성적으로 대학 찾기</p><h1>학교부터 고르고, 내 성적과 비교해요</h1><p>대학을 먼저 둘러보고 관심 학과의 최근 입결을 확인하세요. 세부 성적은 선택이며 입력하면 평균 계산과 더 세밀한 진단에 활용할 수 있어요.</p><form id="recommend-profile" class="panel" novalidate><div class="fields"><div><label for="recommend-average">전체 평균 내신 · 선택</label><input id="recommend-average" type="number" inputmode="decimal" step="0.01" min="1" max="${esc(local.scale)}" placeholder="예: 2.3" value="${esc(local.average||'')}"><p class="hint">예: 2.3등급. 소수점 둘째 자리까지 입력할 수 있어요.</p></div><div><label for="recommend-scale">등급 체계</label><select id="recommend-scale"><option value="9" ${String(local.scale)!=='5'?'selected':''}>9등급제</option><option value="5" ${String(local.scale)==='5'?'selected':''}>5등급제</option></select></div></div><div id="recommend-grade-input"></div><button class="primary" type="submit">내 정보 적용</button><p id="recommend-error" role="alert"></p></form><p class="notice">추천 탐색 순서는 희망 지역·학교 유형과 수집된 입결 연수에 따른 것입니다. 과거 데이터는 현재 전형과 다르거나 오류가 있을 수 있어 합격을 보장하지 않습니다. 전체 평균을 대학별 환산등급으로 간주하거나, 70% 컷을 개인 합격확률로 바꾸지 않습니다.</p><section aria-label="학교 검색"><div class="filters"><div><label for="recommend-school-query">학교 이름 검색</label><input id="recommend-school-query" type="search" placeholder="예: 울산대학교, 서울"></div><div><label for="recommend-region">희망 지역</label><select id="recommend-region"><option value="">전국</option>${regions.map(region=>`<option value="${esc(region)}" ${local.preferredRegion===region?'selected':''}>${esc(region)}</option>`).join('')}</select></div><div><label for="recommend-type">학교 유형</label><select id="recommend-type"><option value="">전체 대학</option>${types.map(type=>`<option value="${esc(type)}" ${local.preferredType===type?'selected':''}>${esc(type)}</option>`).join('')}</select></div></div><p class="hint">현재 탐색 대상은 전국 ${totalSchools}개 캠퍼스입니다. 입결이 없는 학교도 목록에서 확인할 수 있습니다.</p><button type="button" id="recommend-reset">지역·검색 해제 · 전국 학교 보기</button></section><div id="recommend-output" aria-live="polite"></div>`;
  const $ = id => target.querySelector('#'+id);
  const ownedOutput = $('recommend-output');
  const stillActive = () => target.isConnected && $('recommend-output') === ownedOutput;
  const grades = renderGradeInput($('recommend-grade-input'),local,(patch,meta)=>{
    Object.assign(local,patch);
    if(meta.averageApplied){$('recommend-average').value=patch.average;if(selectedSchool)drawGroups();else drawSchools();}
    onProfileChange?.({...local});
  });
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
    ownedOutput.innerHTML=`<section class="recommend-detail"><button type="button" id="recommend-back-schools">← 학교 목록으로</button><h2 tabindex="-1">${esc(university.displayName||university.name)} · 학과별 입결</h2><p>${esc(university.campus||'본교')} · ${esc(university.region)} · 내 평균 ${parseGrade(local.average,local.scale)===null?'미입력':esc(local.average)+'등급'}</p><div class="actions"><a class="button" href="#university/${esc(selectedSchool)}">대학 상세 안내</a><a class="button" href="#majors/${esc(selectedSchool)}">학과 전체 안내</a><a class="button" href="#history/${esc(selectedSchool)}">전체 연도별 입결</a>${onSave?`<button type="button" data-save-school="${esc(selectedSchool)}">+ 이 대학 담기</button>`:''}</div><label for="recommend-major">이 대학의 관심 학과·전형 검색</label><input id="recommend-major" type="search" placeholder="예: 간호, 학생부교과"><div id="recommend-major-output"></div></section>`;
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
    $('recommend-major-output').innerHTML=`<h3 id="recommend-groups-heading" tabindex="-1">${groups.length}개 학과·전형 · ${page.page} / ${page.totalPages}페이지</h3>${formulas.length?`<details class="panel"><summary>대학 산식으로 계산한 환산등급 추가 · 선택</summary><p>전체 평균과 대학 환산등급은 다를 수 있어요. 아래 과거 산식으로 계산한 경우에만 연도별 차이를 산출합니다.</p>${formulas.map((f,i)=>`<form data-formula="${esc(f.formulaKey)}"><h4>${esc(f.formulaLabel||f.formulaKey)}</h4><label for="converted-${i}">대학 산식으로 계산한 환산등급</label><input id="converted-${i}" name="grade" type="number" inputmode="decimal" step="0.01" min="1" max="${esc(f.scale)}" placeholder="예: 2.3" required value="${esc(converted[f.formulaKey]?.grade||'')}"><label><input name="confirmed" type="checkbox" required ${converted[f.formulaKey]?.confirmed?'checked':''}> 전체 평균을 그대로 옮긴 것이 아니라 위 산식으로 계산했습니다.</label><button type="submit">과거 분포와 비교</button></form>`).join('')}</details>`:''}${groups.length?page.items.map(g=>`<article class="panel"><p class="eyebrow">${esc(university?.name||g.universityName)}</p><h3>${esc(g.program)} · ${esc(g.track)}</h3><p>${esc(g.reason)}</p>${g.distance!==null?`<p><strong>과거 범위와 거리 ${g.distance.toFixed(2)}등급</strong> · 70% 기준 ${g.range.min}~${g.range.max}등급</p>`:''}<div class="compare"><table><caption>${esc(university?.name||g.universityName)} ${esc(g.program)} · 공식 발표 성적</caption><thead><tr><th>학년도</th><th>평균</th><th>70% 기준</th><th>내 환산등급 차이</th><th>내 전체 평균 · 별도 기준</th></tr></thead><tbody>${g.rows.map(r=>{const difference=g.differences.find(d=>d.academicYear===r.academicYear);const unit=['5','9'].includes(String(r.scale))?'등급':'점';return `<tr><th>${esc(r.academicYear)}</th><td>${r.gradeMean==null?'미확보':esc(r.gradeMean)+unit}</td><td>${r.grade70==null?'미확보':esc(r.grade70)+unit}</td><td>${difference?(difference.difference>0?'+':'')+difference.difference.toFixed(2)+'등급':'동일 산식 확인 필요'}</td><td>${parseGrade(local.average,local.scale)===null?'미입력':esc(local.average)+'등급'}<br><small>대학 환산등급 아님</small></td></tr>`;}).join('')}</tbody></table></div><p class="hint">전체 평균은 참고로 나란히 표시합니다. 반영 과목·이수단위·집계 대상이 다르면 직접 비교할 수 없습니다. 70% 기준은 합격확률 70%가 아닙니다.</p>${[...new Set(g.rows.map(r=>r.comparabilityNote).filter(Boolean))].map(note=>`<p class="notice">${esc(note)}</p>`).join('')}<p>${g.rows.map(r=>/^https:\/\//.test(r.sourceUrl||'')?`<a href="${esc(r.sourceUrl)}" target="_blank" rel="noopener noreferrer">${esc(r.academicYear)} 공식 출처</a>`:'').join(' · ')}</p></article>`).join(''):'<div class="empty"><h3>이 조건의 입결 자료는 아직 수집하지 못했어요</h3><p>이 학교가 없거나 지원할 수 없다는 뜻은 아닙니다. 위 대학 상세·학과 안내를 이용하거나 검색어를 바꿔 보세요.</p></div>'}${groups.length?pageControls(page.page,page.totalPages,'recommend-groups','학과 입결'):''}`;
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
    if($('recommend-average').validity.badInput||(value!==''&&parseGrade(value,scale)===null)||result.errors.length){$('recommend-error').textContent=result.errors[0]||`평균 내신은 1~${scale} 사이의 소수점 둘째 자리까지 입력하세요. 예: 2.3`;return;}
    local.average=value;local.scale=scale;Object.assign(local,grades.getValue());onProfileChange?.({...local});$('recommend-error').textContent='내 정보에 적용했어요.';
    if(selectedSchool){drawGroups();}else{drawSchools();}
  };
  $('recommend-scale').onchange=()=>{const scale=$('recommend-scale').value;local.scale=scale;$('recommend-average').max=scale;grades.setScale(scale);$('recommend-error').textContent='등급 체계가 바뀌었어요. 기존 성적이 선택한 체계에 맞는지 확인한 뒤 적용해 주세요. 5등급제와 9등급제를 자동 환산하지 않습니다.';};
  drawSchools();
}
