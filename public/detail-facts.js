const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl = value => /^https?:\/\//i.test(value||'') ? esc(value) : '';
const preparationGuide = [
  ['지원자격', '졸업연도·학교 유형·추천 여부·지역 이수 조건이 지원하려는 전형에 맞는지 확인하세요.'],
  ['평가방법', '교과·서류·논술·면접의 반영비율과 단계별 선발 배수를 확인하세요.'],
  ['성적 반영', '반영 학기·교과·이수단위·진로선택과목과 졸업생 반영 범위를 확인하세요.'],
  ['수능최저', '영역별 등급합뿐 아니라 필수 응시영역·탐구 과목 수·한국사 조건을 확인하세요.'],
  ['모집인원', '현재 지원 학년도·캠퍼스·모집단위·전형의 인원을 확인하세요. 입학정원이나 과거 모집인원과 다릅니다.'],
  ['일정', '원서접수·서류 제출·논술/면접·발표·등록의 날짜와 마감 시각을 따로 확인하세요.'],
  ['제출서류', '온라인 제공 동의 여부와 지원자 유형에 따른 추가 서류·제출 방법을 확인하세요.'],
  ['과거 입결', '등록자 성적인지 확인하고, 연도별 성적 산출 방식이나 전형이 바뀌었는지 함께 살펴보세요.']
];
export function detailFacts(detail) {
  if (!detail) return '';
  const contact=detail.contact||{}, rows=detail.competitionTop10||[];
  const documents=(detail.officialDocuments||[]).map(d=>{
    const href=safeUrl(d.url);
    const title=esc(d.academicYear?d.academicYear+'학년도':'학년도 미확인')+' '+esc(d.title);
    return '<div class="program">'+(href?'<a class="button text" target="_blank" rel="noopener noreferrer" href="'+href+'">'+title+' ↗</a>':'<p>'+title+'</p>')+'<p class="hint">'+(d.downloadVerified?'파일 접근 확인 · 전체 전형 내용 검수와는 별도':'공식 자료 경로 확인 · 파일 열람 및 본문 검수 미완료')+'</p></div>';
  }).join('');
  const guide='<details><summary>모집요강에서 꼭 확인할 8가지</summary><p class="hint">다음은 공통 확인 방법입니다. 이 대학의 확정된 지원 조건은 위에 표시된 해당 학년도 전형 안내와 원문을 확인하세요.</p><dl class="facts">'+preparationGuide.map(([label,text])=>'<dt>'+label+'</dt><dd>'+text+'</dd>').join('')+'</dl></details>';
  const documentsHtml='<section class="panel"><h2>공식 모집요강·공개 자료</h2><p class="hint">자료의 학년도와 수시·정시 구분을 확인하세요. 이곳의 파일 링크 수는 전형 상세정보의 수집 완료 수가 아닙니다.</p>'+(documents||'<p>연결 가능한 모집요강 파일을 아직 확보하지 못했습니다.</p>')+guide+'</section>';
  return `${documentsHtml}${contact.phone?`<section class="panel"><h2>입학 문의와 위치</h2><p>${esc(contact.address)}</p><p>입학 문의: ${esc(contact.phone)}</p></section>`:''}${rows.length?`<section class="panel"><h2>공식 발표 모집단위 현황</h2><p>아래 자료는 대학이 공개한 일부 모집단위입니다. 전체 학과 목록과 다릅니다.</p><div class="compare"><table><thead><tr><th>결과 학년도</th><th>모집단위</th><th>전형</th><th>모집</th><th>지원</th><th>경쟁률</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.academicYear)} ${esc(r.period)}</td><th>${esc(r.department)}</th><td>${esc(r.track)}</td><td>${esc(r.quota)}</td><td>${esc(r.applicants)}</td><td>${esc(r.competitionRate)}</td></tr>`).join('')}</tbody></table></div><p class="hint">지원자 수와 경쟁률은 당시 모집 현황이며 개인의 합격률을 뜻하지 않습니다.</p></section>`:''}`;
}
