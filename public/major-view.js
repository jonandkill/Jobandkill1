const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderMajors(target,universityId='') {
  target.innerHTML='<p class="eyebrow">공식 학과 정보</p><h1>배우고 싶은 분야를 찾아보세요</h1><form id="major-form" class="filters"><div><label for="major-query">학과·계열·대학 검색</label><input id="major-query" placeholder="예: 간호, 기계, 경영" maxlength="100"></div><button class="primary">학과 찾기</button></form><div id="major-results" aria-live="polite"></div>';
  const form=document.getElementById('major-form'), output=document.getElementById('major-results');
  let version=0, query='';
  async function search(offset=0) {
    const request=++version;
    output.textContent='공식 학과 정보를 불러오고 있어요…';
    try {
      const response=await fetch(universityId?'/api/departments?universityId='+encodeURIComponent(universityId):'/api/departments?query='+encodeURIComponent(query)+'&offset='+offset);
      if(!response.ok)throw Error();
      const data=await response.json();
      if(request!==version||!output.isConnected)return;
      const items=universityId?(data?.departmentCatalog?.items||[]):data.items;
      const count=universityId?data?.departmentCatalog?.loadedCount:data.total;
      output.innerHTML='<p>확인된 학과 '+items.length+'개 표시 · '+(count==null?'전체 수 확인 중':'공식 목록 '+esc(count)+'개')+'</p>'+(universityId?'<p class="hint">'+esc(data?.departmentCatalog?.academicYear||'')+'학년도 학과 목록 · '+(data?.departmentCatalog?.complete?'공식 목록 전체 수집':'일부 목록 수집')+'</p>':'')+'<div class="cards">'+items.map(d=>'<article class="card"><h2>'+esc(d.name)+'</h2><p>'+esc(d.universityName||'')+' · '+esc(d.category)+'</p><p class="hint">'+esc(d.academicYear||data?.departmentCatalog?.academicYear||'기준 학년도 미확인')+'학년도 학과 목록</p><p>학교 공개 정원: '+(d.quota==null?'확인값 없음':esc(d.quota))+'</p><p class="hint">정원의 별도 기준연도가 확인되지 않은 경우 당해 수시 모집인원으로 해석하지 마세요.</p><a class="button" href="#university/'+esc(d.universityId||universityId)+'">대학 안내 보기</a>'+(/^https?:\/\//i.test(d.officialInfoUrl||d.sourceUrl||data?.departmentCatalog?.sourceUrl||'')?'<a class="button" href="'+esc(d.officialInfoUrl||d.sourceUrl||data.departmentCatalog.sourceUrl)+'" target="_blank" rel="noopener noreferrer">공식 학과 정보</a>':'')+'</article>').join('')+'</div>'+(!items.length?'<div class="empty">조건에 맞는 수집 학과가 없습니다. 검색어를 줄이거나 대학 안내를 확인해 주세요.</div>':'')+(!universityId&&data.nextOffset!=null?'<button id="major-next" class="more">다음 학과 보기</button>':'')+(!universityId&&offset>0?'<button id="major-prev" class="more">이전 학과 보기</button>':'');
      if(universityId&&data?.departmentCatalog?.sourceRowsLoaded!=null)output.insertAdjacentHTML('afterbegin','<p class="hint">원문 '+esc(data.departmentCatalog.sourceRowsLoaded)+' / '+esc(data.departmentCatalog.totalDeclared)+'행 수집. 같은 학과의 중복 행은 합쳐서 표시하고 서로 다른 수치는 확정하지 않습니다.</p>');
      if(document.getElementById('major-next'))document.getElementById('major-next').onclick=()=>search(data.nextOffset);
      if(document.getElementById('major-prev'))document.getElementById('major-prev').onclick=()=>search(Math.max(0,offset-50));
    } catch {
      if(request!==version||!output.isConnected)return;
      output.innerHTML='<p>학과 정보를 불러오지 못했습니다.</p><button id="major-retry">다시 시도</button>';
      document.getElementById('major-retry').onclick=()=>search(offset);
    }
  }
  if(universityId)form.hidden=true;
  form.onsubmit=e=>{e.preventDefault();query=document.getElementById('major-query').value.trim();search();};
  search();
}
