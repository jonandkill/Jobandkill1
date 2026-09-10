import { groupOutcomeSeries } from './outcomes.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const subjects = [['korean','국어'],['english','영어'],['math','수학'],['social','사회'],['science','과학']];
export function validateSubjectGrades(values = {}, scale = '9') {
  return subjects.every(([key]) => values[key] === undefined || values[key] === '' || parseGrade(values[key],scale) !== null);
}
export function parseGrade(value, scale = '9') {
  if (!['5','9'].includes(String(scale)) || value === null || value === undefined || String(value).trim() === '') return null;
  if (!/^\d+(?:\.\d{1,2})?$/.test(String(value).trim())) return null;
  const grade = Number(value);
  return grade >= 1 && grade <= Number(scale) ? grade : null;
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

export function renderRecommendations(target, {profile = {}, universities = [], outcomeSchools = [], onSave, onProfileChange} = {}) {
  const local = {...profile};
  const converted = {};
  let records = [], request = 0;
  target.innerHTML = `<p class="eyebrow">내 정보로 입결 탐색</p><h1>내 성적과 과거 입결을 함께 확인해요</h1><p>전체 평균 내신부터 시작하세요. 세부 성적은 선택이며, 대학의 실제 반영 산식이 확인된 경우 더 세밀하게 비교할 수 있습니다.</p><form id="recommend-profile" class="panel"><div class="fields"><div><label for="recommend-average">전체 평균 내신 · 선택</label><input id="recommend-average" type="number" inputmode="decimal" step="0.01" min="1" max="${esc(local.scale||9)}" placeholder="예: 2.3" value="${esc(local.average||'')}"><p class="hint">2.3등급처럼 소수점 둘째 자리까지 입력할 수 있어요.</p></div><div><label for="recommend-scale">등급 체계</label><select id="recommend-scale"><option value="9" ${String(local.scale)!=='5'?'selected':''}>9등급제</option><option value="5" ${String(local.scale)==='5'?'selected':''}>5등급제</option></select></div></div><button type="submit">내 정보 적용</button><p id="recommend-error" role="alert"></p></form><p class="notice">추천 탐색 순서는 희망 지역·학교 유형과 수집된 입결 연수에 따른 것입니다. 전체 평균 내신을 대학별 환산등급으로 간주하지 않습니다. 과거 데이터는 현재 전형과 다르거나 오류가 있을 수 있으며, 합격을 보장하거나 개인 합격확률을 뜻하지 않습니다.</p><div class="filters"><div><label for="recommend-school">대학 · 과거 입결 자료가 많은 순</label><select id="recommend-school"></select></div><div><label for="recommend-major">관심 학과·전형 · 선택</label><input id="recommend-major" type="search" placeholder="예: 간호, 학생부교과"></div></div><div id="recommend-output" aria-live="polite"></div>`;
  const $ = id => target.querySelector('#'+id);
  const ownedOutput = $('recommend-output');
  const stillActive = () => target.isConnected && $('recommend-output') === ownedOutput;
  $('recommend-profile').querySelector('button').insertAdjacentHTML('beforebegin', `<details><summary>교과별 평균 등급 추가 · 선택</summary><p>내 교과별 강점과 준비 상태를 저장합니다. 아래 평균만으로 상위 10과목이나 이수단위 가중 등급을 정확하게 계산할 수는 없습니다.</p><div class="fields">${subjects.map(([key,label])=>`<div><label for="recommend-subject-${key}">${label} 평균 등급</label><input id="recommend-subject-${key}" data-subject="${key}" type="number" inputmode="decimal" min="1" max="${esc(local.scale||9)}" step="0.01" placeholder="예: 2.3" value="${esc(local.subjectGrades?.[key]||'')}"></div>`).join('')}</div><p class="hint">입력 후 ‘내 정보 적용’을 누르면 이 브라우저의 내 정보에 저장됩니다. 대학별 산식이 검증되고 학기별 과목 등급·이수단위 등 필요한 성적이 갖춰져야 환산 비교가 가능합니다. 현재 교과별 평균은 자동 순위 계산에 사용하지 않습니다.</p></details>`);
  function schools() {
    const candidates = rankSchoolCandidates(universities,outcomeSchools,local);
    $('recommend-school').innerHTML = candidates.map(u=>`<option value="${esc(u.id)}">${esc(u.displayName||u.name)} · ${u.outcomeSummary?.years?.length||0}개년 자료</option>`).join('');
  }
  function draw() {
    if (!stillActive()) return;
    const query = $('recommend-major').value.trim().toLowerCase();
    const groups = buildRecommendations(records,local,converted).filter(g=>`${g.program} ${g.track}`.toLowerCase().includes(query));
    const schoolId = $('recommend-school').value;
    const formulas = [...new Map(groups.filter(g=>g.comparable&&g.scaleMatches).map(g=>[g.rows[0].formulaKey,g.rows[0]])).values()];
    $('recommend-output').innerHTML = `<p>${local.average?`내 전체 평균 ${esc(local.average)}등급 · `:''}${esc(local.scale||9)}등급제 · ${groups.length}개 모집단위·전형</p><p><a class="button" href="#university/${esc(schoolId)}">대학 상세 안내</a> <a class="button" href="#history/${esc(schoolId)}">전체 연도별 입결</a> ${onSave?'<button id="recommend-save">이 대학 담기</button>':''}</p>${formulas.map((f,i)=>`<details class="panel"><summary>세부 비교 · ${esc(f.formulaLabel||f.formulaKey)}</summary><form data-formula="${esc(f.formulaKey)}"><p>해당 과거 산식으로 직접 계산한 등급만 입력하세요. 현재 지원 학년도의 산식과 같다는 뜻은 아닙니다.</p><label for="converted-${i}">대학 산식으로 계산한 환산등급</label><input id="converted-${i}" name="grade" type="number" inputmode="decimal" step="0.01" min="1" max="${esc(f.scale)}" placeholder="예: 2.3" required value="${esc(converted[f.formulaKey]?.grade||'')}"><label><input name="confirmed" type="checkbox" required ${converted[f.formulaKey]?.confirmed?'checked':''}> 전체 평균을 그대로 옮긴 것이 아니라 위 산식으로 계산했습니다.</label><button>과거 분포와 비교</button></form></details>`).join('')}<p class="hint">환산등급 입력 시 같은 산식의 과거 70% 기준 범위에 가까운 순으로 표시합니다. 범위 안의 후보끼리는 우열을 매기지 않습니다. 전형 신설·학과 개편·수능최저 변화는 별도로 확인하세요.</p>${groups.length?groups.map(g=>`<article class="panel"><h2>${esc(g.program)} · ${esc(g.track)}</h2><p>${esc(g.reason)}</p>${g.distance!==null?`<p><strong>과거 범위와 거리 ${g.distance.toFixed(2)}등급</strong> · 70% 기준 ${g.range.min}~${g.range.max}</p>`:''}<div class="compare"><table><caption>공식 발표 성적 · 소수점 값 그대로 표시</caption><thead><tr><th>학년도</th><th>평균</th><th>70% 기준</th><th>내 환산등급 차이</th></tr></thead><tbody>${g.rows.map(r=>{const d=g.differences.find(d=>d.academicYear===r.academicYear);return `<tr><th>${esc(r.academicYear)}</th><td>${esc(r.gradeMean??'미확보')}</td><td>${esc(r.grade70??'미확보')}</td><td>${d?(d.difference>0?'+':'')+d.difference.toFixed(2):'비교 보류'}</td></tr>`;}).join('')}</tbody></table></div><p class="hint">차이의 양수는 내 등급 숫자가 더 크다는 뜻입니다. 70% 기준은 합격확률 70%가 아닙니다.</p>${[...new Set(g.rows.map(r=>r.comparabilityNote).filter(Boolean))].map(note=>`<p class="notice">${esc(note)}</p>`).join('')}<p>${g.rows.map(r=>/^https:\/\//.test(r.sourceUrl||'')?`<a href="${esc(r.sourceUrl)}" target="_blank" rel="noopener noreferrer">${esc(r.academicYear)} 공식 출처</a>`:'').join(' · ')}</p></article>`).join(''):'<p class="empty">현재 조건의 입결 자료를 확보하지 못했습니다. 불합격 판정이 아닙니다. 대학 상세 안내를 확인하거나 다른 대학·학과를 선택해 주세요.</p>'}`;
    ownedOutput.querySelectorAll('table').forEach(table=>{
      table.querySelector('thead tr').insertAdjacentHTML('beforeend','<th>내 전체 평균 · 별도 기준</th>');
      table.querySelectorAll('tbody tr').forEach(row=>row.insertAdjacentHTML('beforeend',`<td>${parseGrade(local.average,local.scale)===null?'미입력':esc(local.average)+'등급 ('+esc(local.scale)+'등급제)'}<br><small>대학 환산등급 아님</small></td>`));
      table.insertAdjacentHTML('afterend','<p class="hint">내 전체 평균은 참고용으로 나란히 표시합니다. 반영 과목·이수단위·등급 체계가 다를 수 있어 대학 발표 성적과 직접 빼거나 합격 유불리를 판단하지 않습니다.</p>');
    });
    if ($('recommend-save')) $('recommend-save').onclick=()=>{const button=$('recommend-save');onSave(schoolId);if(button.isConnected)button.textContent='관심 대학에 담았어요';};
    target.querySelectorAll('[data-formula]').forEach(form=>form.onsubmit=e=>{
      e.preventDefault();const key=form.dataset.formula;const f=formulas.find(f=>f.formulaKey===key);
      const grade=parseGrade(form.elements.grade.value,f.scale);if(grade===null||!form.elements.confirmed.checked)return;
      converted[key]={grade,scale:f.scale,confirmed:true};draw();
    });
  }
  async function populate() {
    if(!stillActive())return;
    const version=++request;records=[];
    $('recommend-output').textContent='공식 입결 자료를 불러오고 있어요…';
    const id=$('recommend-school').value;
    if(!id){draw();return;}
    try {
      const response=await fetch('/api/outcomes?universityId='+encodeURIComponent(id));
      if(!response.ok)throw Error('fetch');const data=await response.json();if(!Array.isArray(data))throw Error('schema');
      if(version!==request||!stillActive())return;records=data;draw();
    }catch{if(version!==request||!stillActive())return;$('recommend-output').innerHTML='<p>입결 연결에 실패했습니다. 입력값은 유지됩니다.</p><button id="recommend-retry">다시 불러오기</button>';$('recommend-retry').onclick=populate;}
  }
  $('recommend-profile').onsubmit=e=>{e.preventDefault();const scale=$('recommend-scale').value,value=$('recommend-average').value;const subjectGrades=Object.fromEntries(subjects.map(([key])=>[key,$('recommend-subject-'+key).value]));if((value!==''&&parseGrade(value,scale)===null)||!validateSubjectGrades(subjectGrades,scale)){$('recommend-error').textContent='등급 체계에 맞게 1~'+scale+' 사이를 입력하세요. 예: 2.3';return;}local.average=value;local.scale=scale;local.subjectGrades=subjectGrades;local.subjectGradesScale=scale;$('recommend-error').textContent='내 정보에 적용했어요.';onProfileChange?.({...local});draw();};
  $('recommend-scale').onchange=()=>{const scale=$('recommend-scale').value;$('recommend-average').max=scale;target.querySelectorAll('[data-subject]').forEach(input=>input.max=scale);};
  $('recommend-school').onchange=populate;$('recommend-major').oninput=draw;schools();populate();
}
