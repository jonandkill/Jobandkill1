import { renderDocument } from './document-reader.js';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safe=v=>/^https:\/\//i.test(v||'')?esc(v):'#';
const kind=p=>p.auditLinkKind||(p.resourceType==='archive'||p.resourceType==='archive_listing'?'listing':p.documentUrl?'direct_file':'document_page');
const type=p=>p.auditResourceKind||(p.resourceType==='archive'?'archive':/모의/.test(p.category)?'mock':/가이드/.test(p.category)?'guide':'past_paper');
const names={past_paper:'기출 관련 자료',mock:'모의논술',guide:'논술 가이드',archive:'자료실'};
const links={direct_file:'공식 파일 연결',document_page:'개별 게시글 연결',listing:'자료실 목록 연결'};
export function renderEssayArchive(target,catalog){
 const roster=catalog.essayUniversities?.universities||[],papers=catalog.exams||[];
 target.innerHTML=`<p class="eyebrow">대학별 논술 준비</p><h1>논술 기출과 해설을 찾아보세요</h1><p>기출·모의논술·가이드를 구분하고 대학과 학년도를 선택하세요.</p><p class="notice">논술 조사 대상 ${roster.length}개교 · 파일 연결 ${papers.filter(p=>kind(p)==='direct_file').length}건 · 게시글 ${papers.filter(p=>kind(p)==='document_page').length}건 · 목록 연결 ${papers.filter(p=>kind(p)==='listing').length}건. 자료 건수는 문항 수가 아니며, 모든 연도의 문제 본문을 확보했다는 뜻이 아닙니다.</p><div class="filters"><div><label for="essay-school">대학·캠퍼스</label><select id="essay-school"><option value="">전체 대학</option>${roster.map((r,i)=>`<option value="${i}">${esc(r.name)} · ${esc(Array.isArray(r.campusScope)?r.campusScope.join(', '):r.campusScope)}</option>`).join('')}</select></div><div><label for="essay-year">자료 학년도</label><select id="essay-year"><option value="">전체 연도</option>${[...new Set(papers.map(p=>p.academicYear).filter(Boolean))].sort((a,b)=>b-a).map(y=>`<option>${y}</option>`).join('')}</select></div><div><label for="essay-type">자료 종류</label><select id="essay-type"><option value="">전체 종류</option>${Object.entries(names).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></div></div><div id="essay-results" aria-live="polite" tabindex="-1"></div><a class="button" href="#prepare/essay">문제 선택하고 논술 풀기 →</a>`;
 const school=target.querySelector('#essay-school'),year=target.querySelector('#essay-year'),category=target.querySelector('#essay-type'),output=target.querySelector('#essay-results');let page=0,drawVersion=0,readers=[];
 function draw(move=false){
  const version=++drawVersion;readers.forEach(reader=>reader.destroy());readers=[];
  const selected=school.value===''?null:roster[Number(school.value)],ids=selected?.universityIds||[];
  const rows=papers.filter(p=>(!selected||ids.includes(p.universityId)||p.universityName===selected.name)&&(!year.value||String(p.academicYear)===year.value)&&(!category.value||type(p)===category.value));
  output.innerHTML=(selected?`<section class="panel"><h2>${esc(selected.name)}</h2><p>자료별 연도와 계열은 원문에서 확인하세요.</p><a class="button" href="${safe(selected.archiveUrl)}" target="_blank" rel="noopener noreferrer">공식 자료실에서 더 찾기</a></section>`:'')+`<p>${rows.length}건 중 ${rows.length?page*24+1:0}–${Math.min((page+1)*24,rows.length)}건 표시</p><div class="cards">`+rows.slice(page*24,(page+1)*24).map(p=>`<article class="card essay-document-card"><span class="tag">${p.academicYear?esc(p.academicYear)+'학년도':'연도별 목록'} · ${esc(names[type(p)])}</span><h2>${esc(p.title)}</h2><p>${esc(p.universityName)} · ${esc(p.campus)}</p><p><strong>${esc(links[kind(p)])}</strong></p><p class="hint">${kind(p)==='listing'?'개별 문제 파일이 아닙니다. 자료실에서 해당 연도·계열을 찾아야 합니다.':p.bodyVerificationStatus==='verified'?'본문 검수 기록이 있는 자료입니다.':'전체 문제 본문 검수는 완료되지 않았습니다.'}</p>${p.linkCheck?.status==='access_unconfirmed'?'<p class="hint">최근 검사에서 열람을 확인하지 못했습니다. 공식 경로에서 확인해 주세요.</p>':''}<p>${esc(p.accessNote)}</p>${p.documentInspection?.questionMarkerPages?.length?'<p class="hint">PDF에서 문제 관련 표기를 자동 확인했습니다. 전체 문항 검수 완료는 아닙니다.</p>':''}${(p.observedAttachments||[]).map(a=>`<a class="button" href="${safe(a.url)}" target="_blank" rel="noopener noreferrer">${esc(a.title||'공식 첨부파일')} ↗</a>`).join('')}<a class="button" href="${safe(p.sourceUrl)}" target="_blank" rel="noopener noreferrer">${kind(p)==='listing'?'공식 자료실 열기':'공식 게시글·출처 열기'}</a>${p.documentUrl?`<a class="button primary" href="${safe(p.documentUrl)}" target="_blank" rel="noopener noreferrer">공식 자료 파일 열기</a>${p.linkCheck?.isPdf?`<details data-pdf-id="${esc(p.id)}"><summary>이 페이지에서 PDF 본문 읽기</summary><div data-pdf-reader></div></details>`:'<p class="hint">이 자료의 사이트 내 미리보기는 아직 연결되지 않았습니다. 위 공식 파일 열기로 원문을 확인할 수 있습니다.</p>'}`:''}</article>`).join('')+'</div>'+(!rows.length?'<div class="empty"><h2>선택한 조건의 자료를 아직 확보하지 못했어요</h2><p>미공개라는 뜻은 아닙니다. 조건을 바꾸거나 공식 자료실을 확인하세요.</p></div>':'')+`<div class="pagination" aria-label="논술 자료 페이지"><button id="essay-prev" ${page===0?'disabled':''}>← 이전</button><span>${rows.length?page+1:0} / ${Math.ceil(rows.length/24)} 페이지</span><button id="essay-next" ${(page+1)*24>=rows.length?'disabled':''}>다음 →</button></div>`;
  output.querySelectorAll('[data-pdf-id]').forEach(details=>{
   let requested=false;
   details.ontoggle=async()=>{
    if(!details.open||requested)return;
    const paper=rows.find(p=>p.id===details.dataset.pdfId);if(!paper)return;
    requested=true;
    const reader=await renderDocument(details.querySelector('[data-pdf-reader]'),{resourceId:paper.id,title:paper.title,originalUrl:paper.documentUrl});
    if(version!==drawVersion||!details.isConnected)reader.destroy();else readers.push(reader);
   };
  });
  const prev=target.querySelector('#essay-prev'),next=target.querySelector('#essay-next');if(prev)prev.onclick=()=>{page--;draw(true)};if(next)next.onclick=()=>{page++;draw(true)};if(move){output.focus({preventScroll:true});output.scrollIntoView({block:'start',behavior:'auto'})}
 }
 for(const control of [school,year,category])control.onchange=()=>{page=0;draw()};draw();
}
