/* Studio UX enhancements: collapsible settings, custom logos, and proposal portfolio. */
(function(){
  const LEGAL_PREFIX=/^(?:\(주\)|㈜|주식회사|유한회사|사단법인|재단법인|법무법인|의료법인|학교법인)\s*/;
  const originalLogoSvg=logoSvg;
  const originalSettings=settings;
  const originalRender=render;
  const originalOpenHome=openHome;

  defaults.customLogoData=defaults.customLogoData||'';
  defaults.customLogoName=defaults.customLogoName||'';
  defaults.logoSource=defaults.logoSource||'recipe';
  defaults.expandedSettings=defaults.expandedSettings||['company-logo','brand'];
  state.customLogoData=state.customLogoData||'';
  state.customLogoName=state.customLogoName||'';
  state.logoSource=state.logoSource||'recipe';
  state.expandedSettings=Array.isArray(state.expandedSettings)?state.expandedSettings:['company-logo','brand'];

  function shortBrandName(){
    const cleaned=String(state.brand||'브랜드').trim().replace(LEGAL_PREFIX,'').replace(/\s+/g,'');
    return cleaned.slice(0,2)||'BR';
  }

  function uploadedLogoSvg(){
    const href=String(state.customLogoData||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;');
    return `<svg class="logo-svg custom-logo-svg" viewBox="0 0 620 240" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="업로드한 ${esc(state.customLogoName||'회사 로고')}"><image href="${href}" x="35" y="25" width="550" height="190" preserveAspectRatio="xMidYMid meet"/></svg>`;
  }

  logoSvg=function(id=state.recipe){
    if(state.logoSource==='upload'&&state.customLogoData)return uploadedLogoSvg();
    return originalLogoSvg(id).replace(/(<text x="115" y="139"[^>]*>)([^<]*)(<\/text>)/,`$1${esc(shortBrandName())}$3`);
  };

  function companyLogoSection(){
    const has=Boolean(state.customLogoData);
    return `<div class="section company-logo-section"><div class="section-title"><h3>회사 로고 넣기</h3><span class="source-status">${has?'업로드 완료':'선택 사항'}</span></div><p class="helper">기존 회사 로고가 있으면 추천 로고 대신 명함과 작업판에 적용합니다.</p><div class="logo-source-toggle" role="group" aria-label="사용할 로고"><button class="${state.logoSource!=='upload'?'active':''}" data-logo-source="recipe">추천 로고</button><button class="${state.logoSource==='upload'?'active':''}" data-logo-source="upload" ${has?'':'disabled'}>내 회사 로고</button></div><label class="logo-upload" for="companyLogoInput"><strong>${has?'다른 로고로 교체':'회사 로고 파일 선택'}</strong><small>PNG·JPG·WEBP·SVG · 최대 700KB</small><input id="companyLogoInput" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml"></label>${has?`<div class="uploaded-logo-row"><img src="${state.customLogoData}" alt="업로드한 회사 로고 미리보기"><div><strong>${esc(state.customLogoName)}</strong><small>명함 앞·뒤와 로고 작업판에 적용 가능</small></div><button id="removeCompanyLogo" class="btn small">삭제</button></div>`:''}<p class="upload-error" id="logoUploadError" role="alert"></p></div>`;
  }

  settings=function(){return companyLogoSection()+originalSettings()};

  const GROUP_KEYS=['company-logo','brand','color','layout','print','export'];
  function sectionKey(section,index){
    const title=section.querySelector('h3')?.textContent||'';
    if(title.includes('회사 로고'))return'company-logo';
    if(title.includes('브랜드 문구'))return'brand';
    if(title.includes('색상'))return'color';
    if(title.includes('배치'))return'layout';
    if(title.includes('인쇄'))return'print';
    if(title.includes('내보내기'))return'export';
    return GROUP_KEYS[index]||`section-${index}`;
  }

  function rememberOpen(details,key){
    details.addEventListener('toggle',()=>{
      const set=new Set(state.expandedSettings||[]);
      details.open?set.add(key):set.delete(key);
      state.expandedSettings=[...set];
      localStorage.setItem('brand-recipe-v2',JSON.stringify(state));
    });
  }

  function enhanceSettings(){
    const wrap=document.querySelector('#settings .settings');
    if(!wrap||wrap.dataset.enhanced)return;
    wrap.dataset.enhanced='true';
    const toolbar=document.createElement('div');
    toolbar.className='settings-quickbar';
    toolbar.innerHTML=`<button class="btn small" id="toggleSettingsGroups">세부 내용 모두 펼치기</button><label><span>바로가기</span><select id="settingsJump"><option value="">메뉴 선택</option><option value="company-logo">회사 로고</option><option value="brand">문구</option><option value="color">색상</option><option value="layout">배치·크기</option>${state.view==='card'?'<option value="print">명함 정보·인쇄</option>':''}<option value="export">저장·내보내기</option></select></label>`;
    wrap.prepend(toolbar);
    [...wrap.querySelectorAll(':scope > .section')].forEach((section,index)=>{
      const key=sectionKey(section,index),details=document.createElement('details'),summary=document.createElement('summary');
      details.className='settings-group';details.dataset.settingsKey=key;
      details.open=(state.expandedSettings||[]).includes(key);
      const heading=section.querySelector('h3')?.textContent||'세부 설정';
      summary.innerHTML=`<strong>${heading}</strong><span>펼치기</span>`;
      section.parentNode.insertBefore(details,section);details.append(summary,section);rememberOpen(details,key);
    });
    document.querySelector('#toggleSettingsGroups').onclick=()=>{
      const groups=[...wrap.querySelectorAll('.settings-group')],openAll=groups.some(x=>!x.open);
      groups.forEach(x=>x.open=openAll);
      state.expandedSettings=openAll?groups.map(x=>x.dataset.settingsKey):[];
      document.querySelector('#toggleSettingsGroups').textContent=openAll?'세부 내용 모두 접기':'세부 내용 모두 펼치기';
    };
    document.querySelector('#settingsJump').onchange=e=>{
      const target=wrap.querySelector(`[data-settings-key="${e.target.value}"]`);
      if(!target)return;target.open=true;setTimeout(()=>target.scrollIntoView({behavior:'smooth',block:'start'}),30);
    };
  }

  function keepSettingsOpen(){if(matchMedia('(max-width:760px)').matches)document.querySelector('#settings')?.classList.add('open')}

  function readCompanyLogo(file){
    const error=document.querySelector('#logoUploadError');
    if(!file)return;
    if(!['image/png','image/jpeg','image/webp','image/svg+xml'].includes(file.type)){error.textContent='PNG, JPG, WEBP 또는 SVG 파일만 사용할 수 있습니다.';return}
    if(file.size>700*1024){error.textContent='파일이 700KB를 넘습니다. 로고 파일을 최적화한 뒤 다시 선택해 주세요.';return}
    const reader=new FileReader();
    reader.onerror=()=>error.textContent='파일을 읽지 못했습니다. 다른 파일을 선택해 주세요.';
    reader.onload=()=>{state.customLogoData=String(reader.result);state.customLogoName=file.name;state.logoSource='upload';save(false);render();keepSettingsOpen();toast('회사 로고를 적용했습니다')};
    reader.readAsDataURL(file);
  }

  function saveAsProposal(){
    const items=projectList(),base=state.brand||'브랜드',count=items.filter(x=>(x.title||'').startsWith(base+' 시안')).length+1,now=new Date().toISOString();
    const snapshot=cleanSnapshot();snapshot.projectId=null;
    items.unshift({id:'proposal-'+Date.now().toString(36),title:`${base} 시안 ${count}`,updatedAt:now,view:state.view,palette:state.palette,recipe:state.recipe,cardRecipe:state.cardRecipe,snapshot});
    try{writeProjects(items.slice(0,40));toast(`시안 ${count}을 별도로 저장했습니다`)}catch(e){toast('저장 공간이 부족합니다. 큰 로고 파일을 줄여 주세요')}
  }

  function reportItem(item,index){
    const backup=state;
    state={...defaults,...structuredClone(item.snapshot),showGuides:false,expandedSettings:[],started:true,offsets:{...defaults.offsets,...item.snapshot.offsets},locked:{...defaults.locked,...item.snapshot.locked}};
    const logo=logoSvg(),cards=businessCardMarkup(),p=palette(state.palette),style=state.style||'professional';
    state=backup;
    const date=new Date(item.updatedAt).toLocaleString('ko-KR',{year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'});
    return `<article class="portfolio-item"><header><div><span>DESIGN ${String(index+1).padStart(2,'0')}</span><h2>${esc(item.title)}</h2></div><dl><div><dt>업종</dt><dd>${esc(item.snapshot.industry||'-')}</dd></div><div><dt>인상</dt><dd>${esc(style)}</dd></div><div><dt>저장</dt><dd>${date}</dd></div></dl></header><section class="portfolio-logo"><h3>로고</h3><div>${logo}</div></section><section class="portfolio-cards"><h3>명함 앞·뒤</h3>${cards}</section><footer><i style="background:${p.colors[0]}"></i><i style="background:${p.colors[1]}"></i><i style="background:${p.colors[2]}"></i><i style="background:${p.colors[3]}"></i><span>${esc(p.name)}</span><button class="btn small" data-edit-report="${item.id}">이 시안 편집</button></footer></article>`;
  }

  function openPortfolioReport(){
    const items=projectList(),backup=state,app=document.querySelector('#app');
    const body=items.map(reportItem).join('');state=backup;
    app.innerHTML=`<main class="portfolio-shell"><header class="portfolio-top"><div><small>JOB&amp;KILL BRAND RECIPE STUDIO</small><h1>저장 시안 포트폴리오</h1><p>${items.length}개 시안을 로고와 양면 명함 기준으로 한 번에 비교합니다.</p></div><div><button class="btn" id="portfolioHome">홈으로</button><button class="btn primary" id="portfolioPrint">인쇄·PDF 저장</button></div></header>${items.length?`<section class="portfolio-list">${body}</section>`:`<section class="portfolio-empty"><h2>저장된 시안이 없습니다.</h2><p>편집기에서 ‘시안으로 별도 저장’을 누르면 비교 보고서에 추가됩니다.</p><button class="btn primary" id="portfolioEmptyBack">편집기로 돌아가기</button></section>`}</main>`;
    document.querySelector('#portfolioHome').onclick=openHome;
    document.querySelector('#portfolioPrint').onclick=()=>window.print();
    document.querySelector('#portfolioEmptyBack')?.addEventListener('click',()=>render());
    document.querySelectorAll('[data-edit-report]').forEach(b=>b.onclick=()=>restoreProject(b.dataset.editReport));
  }
  window.openPortfolioReport=openPortfolioReport;

  function injectActions(){
    const actions=document.querySelector('.top-actions');
    if(actions&&!document.querySelector('#saveProposal'))actions.insertAdjacentHTML('afterbegin','<button class="btn ghost small hide-tablet" id="openPortfolio">시안 모아보기</button><button class="btn ghost small hide-tablet" id="saveProposal">시안 별도 저장</button>');
    document.querySelector('#saveProposal')?.addEventListener('click',saveAsProposal);
    document.querySelector('#openPortfolio')?.addEventListener('click',openPortfolioReport);
    const exportSection=document.querySelector('[data-settings-key="export"] .section');
    if(exportSection&&!document.querySelector('#settingsPortfolioActions'))exportSection.insertAdjacentHTML('beforeend','<div class="portfolio-actions" id="settingsPortfolioActions"><button class="btn" id="settingsSaveProposal">시안으로 별도 저장</button><button class="btn" id="settingsOpenPortfolio">저장 시안 모아보기</button></div>');
    document.querySelector('#settingsSaveProposal')?.addEventListener('click',saveAsProposal);
    document.querySelector('#settingsOpenPortfolio')?.addEventListener('click',openPortfolioReport);
  }

  function bindEnhancements(){
    enhanceSettings();injectActions();
    document.querySelectorAll('[data-logo-source]').forEach(b=>b.onclick=()=>{if(b.dataset.logoSource==='upload'&&!state.customLogoData)return;state.logoSource=b.dataset.logoSource;save(false);render();keepSettingsOpen()});
    document.querySelector('#companyLogoInput')?.addEventListener('change',e=>readCompanyLogo(e.target.files?.[0]));
    document.querySelector('#removeCompanyLogo')?.addEventListener('click',()=>{state.customLogoData='';state.customLogoName='';state.logoSource='recipe';save(false);render();keepSettingsOpen();toast('업로드한 회사 로고를 삭제했습니다')});
  }

  render=function(){originalRender();bindEnhancements()};
  openHome=function(){originalOpenHome();injectHomePortfolio()};
  function injectHomePortfolio(){
    const head=document.querySelector('.saved-head');
    if(head&&!document.querySelector('#homePortfolio')){const b=document.createElement('button');b.id='homePortfolio';b.className='btn';b.textContent='저장 시안 포트폴리오';b.onclick=openPortfolioReport;head.append(b)}
  }
  if(document.querySelector('.home-shell'))injectHomePortfolio();else bindEnhancements();
})();
