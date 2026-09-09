const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function detailFacts(detail) {
  if (!detail) return '';
  const contact=detail.contact||{}, rows=detail.competitionTop10||[];
  const documents=(detail.officialDocuments||[]).map(d=>'<p><a target="_blank" rel="noopener noreferrer" href="'+(/^https?:\/\//.test(d.url||'')?esc(d.url):'#')+'">'+esc(d.academicYear)+' '+esc(d.title)+'</a></p>').join('');
  const documentsHtml=documents?'<section class="panel"><h2>공식 모집요강·공개 자료</h2><p class="hint">대학정보 페이지에서 확인한 원문 다운로드 경로입니다. 문서 본문 검수 상태와 구분합니다.</p>'+documents+'</section>':'';
  return `${documentsHtml}${contact.phone?`<section class="panel"><h2>입학 문의와 위치</h2><p>${esc(contact.address)}</p><p>입학 문의: ${esc(contact.phone)}</p></section>`:''}${rows.length?`<section class="panel"><h2>공식 발표 모집단위 현황</h2><p>아래 자료는 대학이 공개한 일부 모집단위입니다. 전체 학과 목록과 다릅니다.</p><div class="compare"><table><thead><tr><th>결과 학년도</th><th>모집단위</th><th>전형</th><th>모집</th><th>지원</th><th>경쟁률</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.academicYear)} ${esc(r.period)}</td><th>${esc(r.department)}</th><td>${esc(r.track)}</td><td>${esc(r.quota)}</td><td>${esc(r.applicants)}</td><td>${esc(r.competitionRate)}</td></tr>`).join('')}</tbody></table></div><p class="hint">지원자 수와 경쟁률은 당시 모집 현황이며 개인의 합격률을 뜻하지 않습니다.</p></section>`:''}`;
}
