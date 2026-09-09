/* Selected homepage direction 3: guided conversion flow. */
const openHomeBeforeV3=openHome;
openHome=function(){
  save(false);
  const items=projectList(),app=document.querySelector('#app');
  app.innerHTML=`<main class="v3-home">
    <header class="v3-nav">
      <button class="v3-brand" id="v3Continue" aria-label="현재 디자인으로 이동"><span>JOB<span>&</span>KILL</span><small>BRAND RECIPE STUDIO</small></button>
      <nav aria-label="홈페이지 주요 메뉴"><a href="#v3Process">제작 순서</a><a href="#v3Features">제공 기능</a><a href="#v3Projects">내 작업</a></nav>
      <button class="v3-primary" id="v3StartTop">1단계 시작 <b>→</b></button>
    </header>
    <section class="v3-hero">
      <div class="v3-copy">
        <span class="v3-kicker">AI 호출 없이 시작하는 브랜드 제작</span>
        <h1>고르는 순간,<br>내 브랜드가<br><em>바로 바뀝니다.</em></h1>
        <p>회사명과 업종을 입력하면 업태별 로고 76개가 달라집니다. 추천받고, 직접 고르고, 터치로 옮긴 뒤 로고와 양면 명함을 내려받으세요.</p>
        <div class="v3-actions"><button class="v3-primary large" id="v3StartHero">회사와 업종 입력하기 <b>→</b></button><button class="v3-secondary" id="v3Resume">현재 작업 계속</button></div>
        <div class="v3-proof" id="v3Features"><div><b>1,596</b><span>산업군별 고유 로고</span></div><div><b>289</b><span>앞·뒤 명함 레시피</span></div><div><b>0회</b><span>제작 과정 AI 호출</span></div></div>
      </div>
      <div class="v3-process" id="v3Process" aria-label="브랜드 제작 4단계">
        <div class="v3-process-head"><span>완성까지 4단계</span><small>약 3분이면 첫 시안을 볼 수 있습니다</small></div>
        <button class="v3-step active" data-v3-start><span>01</span><div><strong>회사와 업종 입력</strong><small>21개 산업군과 세부 업태를 선택합니다.</small></div><b>지금 시작 →</b></button>
        <button class="v3-step" data-v3-start><span>02</span><div><strong>인상과 상징 선택</strong><small>간결함·친근함·전문성과 선호 상징을 정합니다.</small></div><b>추천 설정</b></button>
        <button class="v3-step" id="v3Edit"><span>03</span><div><strong>로고와 명함 직접 수정</strong><small>색상·문구·크기·위치를 자유롭게 바꿉니다.</small></div><b>자유 편집</b></button>
        <button class="v3-step" id="v3GoProjects"><span>04</span><div><strong>저장하고 내려받기</strong><small>SVG·PNG·인쇄 PDF로 저장하고 다시 불러옵니다.</small></div><b>${items.length}개 저장</b></button>
        <div class="v3-mini-preview"><div class="v3-mini-top"><i></i><i></i><i></i><span>브랜드 편집 작업판</span></div><div class="v3-mini-body"><div class="v3-mini-list"><i class="on"></i><i></i><i></i><i></i></div><div class="v3-mini-canvas"><span>R</span><b>브랜드 이름</b><small>업종에 맞는 로고가 적용됩니다</small></div></div></div>
      </div>
    </section>
    <section class="v3-how">
      <div><span>01</span><strong>업태가 바뀌면 로고도 바뀝니다</strong><p>제조업은 공장·로봇·기계, 부동산업은 건물·주거·도로처럼 산업군별 상징을 다르게 제공합니다.</p></div>
      <div><span>02</span><strong>추천 후에도 전부 수정합니다</strong><p>추천 결과를 그대로 쓸 필요 없이 색상·문구·배치·크기를 직접 선택하고 드래그할 수 있습니다.</p></div>
      <div><span>03</span><strong>AI는 마지막 마감에서만</strong><p>기본 추천과 편집은 저장된 레시피로 작동합니다. 비용이 생기는 AI 기능은 사용자가 최종 단계에서만 선택합니다.</p></div>
    </section>
    <section class="v3-projects" id="v3Projects">
      <div class="v3-section-head"><div><span>MY BRAND WORKSPACE</span><h2>저장한 작업</h2><p>이 브라우저에 저장한 로고와 명함을 이어서 편집할 수 있습니다.</p></div><button class="v3-secondary" id="v3NewProject">새 프로젝트</button></div>
      ${items.length?`<div class="saved-grid">${items.map(projectCardMarkup).join('')}</div>`:`<div class="v3-empty"><strong>아직 저장한 작업이 없습니다.</strong><p>첫 디자인을 만들고 ‘내 작업에 저장’을 누르면 여기에 표시됩니다.</p><button class="v3-primary" id="v3EmptyStart">첫 디자인 만들기 →</button></div>`}
    </section>
    <footer class="v3-footer"><div><strong>JOB&KILL BRAND RECIPE STUDIO</strong><span>업종에서 시작해 로고와 명함까지</span></div><button id="v3FooterStart">무료로 시작하기 →</button></footer>
  </main>`;
  const start=()=>newProjectFromHome(),resume=()=>render();
  ['v3StartTop','v3StartHero','v3NewProject','v3EmptyStart','v3FooterStart'].forEach(id=>document.querySelector('#'+id)?.addEventListener('click',start));
  document.querySelectorAll('[data-v3-start]').forEach(b=>b.onclick=start);
  ['v3Continue','v3Resume','v3Edit'].forEach(id=>document.querySelector('#'+id)?.addEventListener('click',resume));
  document.querySelector('#v3GoProjects')?.addEventListener('click',()=>document.querySelector('#v3Projects')?.scrollIntoView({behavior:'smooth'}));
  document.querySelectorAll('[data-open-project]').forEach(b=>b.onclick=()=>restoreProject(b.dataset.openProject));
  document.querySelectorAll('[data-copy-project]').forEach(b=>b.onclick=()=>duplicateProject(b.dataset.copyProject));
  document.querySelectorAll('[data-delete-project]').forEach(b=>b.onclick=()=>removeProject(b.dataset.deleteProject));
};
openProjects=openHome;
function installV3HomeLinks(){
  const bind=(id,fn)=>{const el=document.querySelector('#'+id);if(el)el.onclick=fn};
  bind('goHome',openHome);bind('myProjects',openHome);bind('mobileHome',openHome);
}
const renderBeforeHomeV3=render;
render=function(){renderBeforeHomeV3();installV3HomeLinks()};
installV3HomeLinks();
