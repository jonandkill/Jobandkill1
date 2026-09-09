import { compareOutcomes, observedAdmissionRate } from './outcomes.js';
const escapeText = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number = value => value == null ? '확인값 없음' : escapeText(value);

export function renderHistory(target, summaries = [], universities = [], selectedUniversity = '') {
  let records = [], requestVersion = 0;
  const schools = [...new Set(summaries.map(r => r.universityId))].sort();
  const schoolLabel = id => universities.find(u=>u.id===id)?.displayName || summaries.find(r=>r.universityId===id)?.universityName || id;
  if (selectedUniversity && !schools.includes(selectedUniversity)) {
    target.innerHTML='<h1>'+escapeText(schoolLabel(selectedUniversity))+' 입결</h1><p>이 대학의 비교 가능한 입결 자료는 아직 확보되지 않았습니다.</p><a class="button" href="#history">수집된 대학 입결 보기</a><a class="button" href="#university/'+escapeText(selectedUniversity)+'">대학 안내로 돌아가기</a>';
    return;
  }
  target.innerHTML = `<p class="eyebrow">공식 입결 비교</p><h1>같은 전형의 변화를 확인하세요</h1><p>실제 발표된 결과를 연도별로 비교합니다. 등록자의 성적 분포는 개인의 합격확률과 다릅니다.</p><div class="filters"><div><label for="history-school">대학</label><select id="history-school">${schools.map(s=>`<option value="${escapeText(s)}" ${s===selectedUniversity?"selected":""}>${escapeText(schoolLabel(s))}</option>`).join('')}</select></div><div><label for="history-program">모집단위·전형</label><select id="history-program"></select></div></div><div id="history-results" aria-live="polite"></div>`;
  const school = document.getElementById('history-school');
  const program = document.getElementById('history-program');
  async function populate() {
    const version = ++requestVersion;
    program.innerHTML=''; records=[];
    const output = document.getElementById('history-results');
    output.textContent='대학의 공식 입결을 불러오고 있어요…';
    if (!school.value) { output.textContent='확인된 입결 자료가 없습니다.'; return; }
    try {
      const response = await fetch('/api/outcomes?universityId='+encodeURIComponent(school.value));
      if (!response.ok) throw Error('fetch_failed');
      const data = await response.json();
      if (version !== requestVersion || !school.isConnected) return;
      if (!Array.isArray(data)) throw Error('invalid_data');
      records=data;
    } catch {
      if (version !== requestVersion || !school.isConnected) return;
      output.innerHTML='<p>입결을 불러오지 못했어요.</p><button id="history-retry">다시 불러오기</button>';
      document.getElementById('history-retry').onclick=populate;
      return;
    }
    const keys = [...new Set(records.filter(r=>r.universityId===school.value).map(r=>JSON.stringify([r.program,r.track])))];
    program.innerHTML=keys.map(k=>`<option value="${escapeText(k)}">${JSON.parse(k).map(escapeText).join(' · ')}</option>`).join('');
    draw();
  }
  function draw() {
    const selected = program.value ? JSON.parse(program.value) : [];
    const rows = records.filter(r=>r.universityId===school.value && r.program===selected[0] && r.track===selected[1]).sort((a,b)=>b.academicYear-a.academicYear);
    const comparison = compareOutcomes(rows);
    document.getElementById('history-results').innerHTML = rows.length ? `<section class="panel"><h2>${escapeText(selected.join(' · '))}</h2><p>${new Set(rows.map(r=>r.academicYear)).size}개년 발표 자료 · 누락값은 추정하지 않습니다.</p><div class="compare"><table><thead><tr><th>결과 학년도</th><th>모집인원</th><th>지원자</th><th>경쟁률</th><th>평균 등급</th><th>50% 기준</th><th>70% 기준</th></tr></thead><tbody>${rows.map(r=>`<tr><th>${number(r.academicYear)}</th><td>${number(r.quota)}</td><td>${number(r.applicants)}</td><td>${number(r.competitionRatio)}</td><td>${number(r.gradeMean)}</td><td>${number(r.grade50)}</td><td>${number(r.grade70)}</td></tr>`).join('')}</tbody></table></div><p>${comparison.grade70Range?`동일 산출 기준 70% 등급 범위: ${number(comparison.grade70Range.min)} ~ ${number(comparison.grade70Range.max)}`:comparison.reasons.map(escapeText).join(" ")}</p>${rows.map(r=>{const rate=observedAdmissionRate(r);return rate?`<p>${r.academicYear}학년도 실제 합격 통보 비율: ${rate.percent.toFixed(1)}% (${rate.numerator}/${rate.denominator}) · 개인 확률 아님</p>`:""}).join("")}<p class="notice">모집인원 ÷ 지원자 수는 개인 합격률이 아닙니다. 논술 성적·수능최저 충족·충원 결과와 지원자별 합격/불합격 자료 없이 개인 확률을 산출하지 않습니다.</p>${rows.map(r=>`<div class="program"><h3>${number(r.academicYear)}학년도 자료 기준</h3><p>${escapeText(r.metricLabel||({final_registered_grade:'최종등록자 교과 성적',enrolled_student_grade:'입학자 교과 성적'})[r.metric]||'대학 발표 성적 지표')} · ${escapeText(r.formulaLabel||"성적 반영방식 대조 전")}</p><p>${escapeText(r.comparabilityNote||'연도별 성적 반영방식과 모집단위 변경 여부를 확인해야 합니다.')}</p><a href="${/^https:\/\//.test(r.sourceUrl||'')?escapeText(r.sourceUrl):'#'}" target="_blank" rel="noopener noreferrer">${escapeText(r.sourceTitle||'대학 공식 발표')}</a></div>`).join('')}</section>` : '<div class="empty">확인된 입결 자료가 없습니다. 데이터 확보 상태를 확인해 주세요.</div>';
    if (new Set(rows.map(r=>r.metric)).size > 1) {
      document.getElementById('history-results').insertAdjacentHTML('afterbegin','<p class="notice">연도에 따라 최종등록자·입학자 등 성적 집계 대상이 다릅니다. 아래 연도별 자료 기준을 확인하세요. 같은 모집단위 이름이어도 동일한 성적 분포로 합치지 않습니다.</p>');
    }
    const reversedPercentiles = rows.filter(r=>Number.isFinite(r.grade50) && Number.isFinite(r.grade70) && r.grade50 > r.grade70);
    if (reversedPercentiles.length) {
      document.getElementById('history-results').insertAdjacentHTML('afterbegin','<p class="notice">'+reversedPercentiles.map(r=>escapeText(r.academicYear)+'학년도').join(', ')+'는 50% 기준의 등급 숫자가 70% 기준보다 큽니다. 원문 값을 그대로 표시했으며, 대학의 환산점수 정렬 기준과 학생부등급 산출 기준을 함께 확인해야 합니다. 숫자를 자동으로 바꾸거나 합격확률로 해석하지 않습니다.</p>');
    }
    if (comparison.comparable && comparison.grade70Range) {
      document.getElementById('history-results').insertAdjacentHTML('beforeend', '<form id="grade-comparison" class="panel"><h2>내 환산 내신과 비교하기 · 선택</h2><p>'+escapeText(rows[0].formulaLabel||'해당 대학의 성적 산출 기준')+'</p><label for="converted-grade">위 기준으로 산출한 내신 등급</label><input id="converted-grade" type="number" min="1" max="'+escapeText(rows[0].scale)+'" step="0.01" required><p class="hint">전체 평균 내신을 그대로 넣으면 다른 기준의 성적을 비교할 수 있습니다. 위 산출 기준으로 계산한 값을 입력해 주세요.</p><button class="primary">과거 입결과 차이 보기</button><div id="grade-differences" aria-live="polite"></div></form>');
      document.getElementById('grade-comparison').onsubmit=event=>{
        event.preventDefault();
        const grade=Number(document.getElementById('converted-grade').value);
        const result=compareOutcomes(rows,{grade,scale:rows[0].scale,formulaKey:rows[0].formulaKey});
        document.getElementById('grade-differences').innerHTML=result.differences.map(d=>'<p>'+d.academicYear+'학년도 70% 기준과의 등급 차이: '+(d.difference>0?'+':'')+d.difference.toFixed(2)+'</p>').join('')+'<p class="hint">양수는 내 등급 숫자가 더 크다는 뜻입니다. 이 차이는 과거 성적 기준과의 비교이며 개인 합격률을 뜻하지 않습니다.</p>';
      };
    }
  }
  school.onchange=populate;program.onchange=draw;populate();
}
