const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const gradeSubjects = [['korean','국어'],['english','영어'],['math','수학'],['social','사회'],['science','과학']];

export function parseGrade(value, scale = '9') {
  if (!['5','9'].includes(String(scale)) || value === null || value === undefined || String(value).trim() === '') return null;
  if (!/^\d+(?:\.\d{1,2})?$/.test(String(value).trim())) return null;
  const grade = Number(value);
  return grade >= 1 && grade <= Number(scale) ? grade : null;
}

export function calculateGradeAverage(entries = [], scale = '9') {
  const used = entries.map((entry, index) => ({...entry, index})).filter(entry => String(entry.grade ?? '').trim() !== '' || String(entry.units ?? '').trim() !== '');
  const errors = [];
  if (!['5','9'].includes(String(scale))) errors.push('등급 체계를 선택해 주세요.');
  for (const row of used) {
    if (parseGrade(row.grade, scale) === null) errors.push(`${row.index + 1}번째 과목 등급은 1~${scale} 사이의 소수점 둘째 자리까지 입력해 주세요.`);
    const units = String(row.units ?? '').trim();
    if (units && (!/^\d+(?:\.\d{1,2})?$/.test(units) || Number(units) <= 0 || Number(units) > 999)) errors.push(`${row.index + 1}번째 이수단위·학점은 0보다 크고 999 이하인 수로 입력해 주세요.`);
  }
  const withUnits = used.filter(row => String(row.units ?? '').trim() !== '').length;
  if (withUnits > 0 && withUnits < used.length) errors.push('이수단위·학점을 일부만 입력했어요. 등급을 적은 모든 과목의 단위를 채우거나, 단위를 모두 비우면 평균을 계산할 수 있어요.');
  if (errors.length || !used.length) return {average:null, exactAverage:null, method:null, count:used.length, totalUnits:null, errors};
  const weighted = withUnits === used.length;
  const denominator = weighted ? used.reduce((sum,row) => sum + Number(row.units), 0) : used.length;
  const exactAverage = used.reduce((sum,row) => sum + Number(row.grade) * (weighted ? Number(row.units) : 1), 0) / denominator;
  return {average:Math.round((exactAverage + Number.EPSILON) * 100) / 100, exactAverage, method:weighted?'weighted':'simple', count:used.length, totalUnits:weighted?denominator:null, errors};
}

export function initialGradeEntries(profile = {}) {
  if (Array.isArray(profile.gradeEntries) && profile.gradeEntries.length) return profile.gradeEntries.map(row => ({subject:String(row.subject ?? ''), grade:String(row.grade ?? ''), units:String(row.units ?? '')}));
  return gradeSubjects.map(([key,subject]) => ({subject, grade:String(profile.subjectGrades?.[key] ?? ''), units:''}));
}

export function validateGradeEntries(entries, scale, enteredScale = scale) {
  const result=calculateGradeAverage(entries,scale);
  if(result.count && String(scale)!==String(enteredScale))return {...result,average:null,exactAverage:null,method:null,errors:[`저장된 세부 성적은 ${enteredScale}등급제입니다. ${scale}등급제 성적을 새로 입력하거나 아래 확인 항목을 선택해 주세요.`,...result.errors]};
  return result;
}

// Emits a profile patch. The overall average changes only when the learner applies it.
export function renderGradeInput(root, profile = {}, onChange = () => {}, options = {}) {
  let scale = String(profile.scale || '9');
  let entries = initialGradeEntries(profile);
  let enteredScale = String(profile.gradeEntriesScale || profile.subjectGradesScale || scale);
  let open = options.initiallyOpen ?? entries.some(row => row.grade || row.units);
  let calculation = validateGradeEntries(entries,scale,enteredScale);
  root.innerHTML = `<section class="grade-input" aria-label="선택 세부 성적"><div class="section-head"><div><h3>세부 성적 입력 · 선택</h3><p class="hint">과목별 성적을 넣으면 평균도 계산해 드려요. 나중에 입력해도 됩니다.</p></div><button type="button" data-grade-toggle aria-expanded="${open}">${open?'입력란 접기':'세부 성적 입력하기'}</button></div><div data-grade-body ${open?'':'hidden'}><p>국어 2.3등급, 수학 1.8등급처럼 입력하세요. 학기별 과목을 따로 적으려면 ‘과목 추가’를 누르세요.</p><p class="hint">이수단위·학점을 모두 입력하면 가중평균, 모두 비우면 단순평균입니다. 일부 과목만 넣었다면 해당 과목들만의 평균이며 전체 학생부 평균과 다를 수 있어요.</p><div data-grade-rows></div><button type="button" data-grade-add>+ 과목 추가</button><div class="notice" data-grade-calculation role="status" aria-live="polite"></div><button class="primary" type="button" data-grade-apply>계산한 평균을 내신에 적용</button><p class="hint">세부 성적을 추가하면 더 세밀한 진단에 활용할 수 있어요. 대학별 반영 교과·학기·이수단위와 산식까지 확인된 경우에만 대학 환산등급을 계산합니다.</p></div></section>`;
  const $ = selector => root.querySelector(selector);
  $('[data-grade-rows]').insertAdjacentHTML('beforebegin','<div class="notice warn" data-grade-scale-confirm-wrap hidden><p>5등급제와 9등급제 성적은 자동 환산하지 않습니다.</p><label><input type="checkbox" data-grade-scale-confirm>현재 입력값이 위에서 선택한 등급 체계의 성적임을 확인했습니다.</label></div>');
  function drawRows() {
    $('[data-grade-rows]').innerHTML = entries.map((row,i)=>`<fieldset class="grade-entry panel"><legend>${i+1}번째 과목</legend><div class="fields"><div><label for="grade-subject-${i}">과목·학기</label><input id="grade-subject-${i}" data-grade-field="subject" data-grade-row="${i}" value="${esc(row.subject)}" placeholder="예: 고1 1학기 국어"></div><div><label for="grade-number-${i}">과목 등급</label><input id="grade-number-${i}" data-grade-field="grade" data-grade-row="${i}" type="number" inputmode="decimal" step="0.01" min="1" max="${esc(scale)}" value="${esc(row.grade)}" placeholder="예: 2.3"></div><div><label for="grade-units-${i}">이수단위·학점 · 선택</label><input id="grade-units-${i}" data-grade-field="units" data-grade-row="${i}" type="number" inputmode="decimal" step="0.01" min="0.01" max="999" value="${esc(row.units)}" placeholder="예: 3"></div></div><button type="button" data-grade-remove="${i}" aria-label="${esc(row.subject||String(i+1)+'번째 과목')} 성적 삭제">이 과목 삭제</button></fieldset>`).join('');
    root.querySelectorAll('[data-grade-field]').forEach(input=>input.oninput=()=>{
      entries[Number(input.dataset.gradeRow)][input.dataset.gradeField]=input.value;
      update();
    });
    root.querySelectorAll('[data-grade-remove]').forEach(button=>button.onclick=()=>{entries.splice(Number(button.dataset.gradeRemove),1);drawRows();update();});
  }
  function patch() {
    return {gradeEntries:entries.map(row=>({...row})),gradeEntriesScale:enteredScale,calculatedAverage:calculation.average,calculatedAverageMethod:calculation.method};
  }
  function validate() {
    const result=validateGradeEntries(entries,scale,enteredScale);
    if([...root.querySelectorAll('[data-grade-field]')].some(input=>input.validity.badInput))return {...result,average:null,exactAverage:null,method:null,errors:[...result.errors,'등급과 이수단위에는 숫자를 완성해서 입력해 주세요.']};
    return result;
  }
  function update(notify=true) {
    calculation=validate();
    $('[data-grade-scale-confirm-wrap]').hidden=!(calculation.count&&enteredScale!==scale);
    $('[data-grade-calculation]').innerHTML=calculation.errors.length?`<p>${calculation.errors.map(esc).join('<br>')}</p>`:calculation.average===null?'<p>등급을 한 과목 이상 입력하면 평균이 표시됩니다.</p>':`<p><strong>입력한 ${calculation.count}과목의 ${calculation.method==='weighted'?'이수단위·학점 가중평균':'단순평균'} ${calculation.average.toFixed(2)}등급</strong></p><p class="hint">${calculation.method==='weighted'?`등급 × 이수단위·학점 합계 ÷ 전체 ${calculation.totalUnits}단위·학점`:'입력한 등급의 합계 ÷ 입력 과목 수'} · 소수점 셋째 자리에서 반올림</p>`;
    $('[data-grade-apply]').disabled=calculation.average===null;
    if(notify)onChange(patch(),{averageApplied:false,calculation,errors:calculation.errors});
  }
  $('[data-grade-toggle]').onclick=()=>{open=!open;$('[data-grade-body]').hidden=!open;$('[data-grade-toggle]').setAttribute('aria-expanded',String(open));$('[data-grade-toggle]').textContent=open?'입력란 접기':'세부 성적 입력하기';};
  $('[data-grade-add]').onclick=()=>{entries.push({subject:'',grade:'',units:''});drawRows();update();root.querySelector(`[data-grade-row="${entries.length-1}"][data-grade-field="subject"]`).focus();};
  $('[data-grade-scale-confirm]').onchange=()=>{if($('[data-grade-scale-confirm]').checked){enteredScale=scale;update();}};
  $('[data-grade-apply]').onclick=()=>{update(false);if(calculation.average===null)return;onChange({...patch(),average:calculation.average.toFixed(2),averageSource:'entered_subjects'},{averageApplied:true,calculation,errors:[]});$('[data-grade-calculation]').insertAdjacentHTML('beforeend','<p>평균 내신에 적용했어요. 입력한 과목 범위를 확인해 주세요.</p>');};
  drawRows();update(false);
  return {getValue:()=>patch(),validate,setScale:value=>{scale=String(value);if(!entries.some(row=>row.grade||row.units))enteredScale=scale;$('[data-grade-scale-confirm]').checked=false;root.querySelectorAll('[data-grade-field="grade"]').forEach(input=>input.max=scale);update();}};
}
