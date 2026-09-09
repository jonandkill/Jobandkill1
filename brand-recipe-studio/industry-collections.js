/* 21 industry collections × 76 genuinely distinct symbol recipes.
   Each recipe owns a unique SVG symbol composition; layout/color are secondary. */
const INDUSTRY_RECIPE_COUNT=76;
const industryRecipeMap=new Map(),industryIconMap=new Map();
const iconBeforeIndustryCollections=icon;
const layoutLabels=Object.fromEntries(layouts),toneLabels=Object.fromEntries(tones);
const industryLayouts=layouts.filter(x=>x[0]!=='wordmark');
const industrySubtypeNames={
 '농업·임업·어업':['재배·농장','종자·육묘','임업·산림','조경·수목','수자원·양식','어업·수산','친환경 농업','화훼·원예'],
 '광업':['채석·골재','광산 안전','원료 운반','선광·정제','굴착·가공','광산 설비','광산 도로','자원 개발'],
 '제조업':['종합 제조','자동화·컨베이어','기계·부품','산업용 로봇','안전 장비','정비·공구','화학·원료','에너지 설비'],
 '전기·가스·에너지':['전력·배전','태양광','수력','해양·파력','플랜트','신재생','설비 유지','클라우드 에너지'],
 '수도·환경':['상하수도','수처리','환경 보전','산림 환경','대기 환경','해양 환경','자원 순환','기후·에너지'],
 '건설업':['종합 건설','현장 안전','시공·공구','건축물','토목·교량','도로·포장','설비 공사','구조·설계'],
 '도소매업':['패션·잡화','온라인 유통','매장·상가','자동차 판매','브랜드 유통','생활용품','화훼 유통','식음료 판매'],
 '운수·창고':['자동차 운송','화물·물류','철도','항공','해운','도로 서비스','물류센터','운송 설비'],
 '숙박·음식점':['카페·음료','외식·식당','호텔·숙박','베이커리·디저트','펜션·주거','웰니스 서비스','복합상업시설','반려동물 동반'],
 '정보통신업':['반도체·하드웨어','소프트웨어','클라우드','보안','글로벌 플랫폼','데이터','통신','인공지능'],
 '금융·보험':['자산관리','핀테크','보험','은행','보안금융','대출·중개','투자분석','글로벌 금융'],
 '부동산업':['주거·중개','상업용 부동산','분양·열쇠','도시·교통','토지·전원','조경·단지','자산관리','개발·시행'],
 '전문·과학·기술':['기초과학','바이오·실험','반도체 연구','소프트웨어 개발','엔지니어링','우주·항공 연구','디지털 기술','전문 컨설팅'],
 '사업지원 서비스':['기업 협력','경영 분석','운영 대행','시설 관리','인재 연결','고객 지원','교육 지원','인증·행정'],
 '공공행정':['중앙·지방행정','안전·치안','공공시설','국제행정','시민협력','교통행정','공공인프라','정책기획'],
 '교육 서비스':['학원·교육','대학·학교','문해·출판','연구·학습','진로·성장','아동교육','창의교육','평생교육'],
 '보건·사회복지':['병원·의료','진단·검진','돌봄·복지','건강관리','안전·보호','자연치유','재활·수치료','지역복지'],
 '예술·스포츠·여가':['사진·영상','음악·공연','피트니스','관광·여행','아웃도어','문화예술','창작·디자인','레저·휴양'],
 '협회·수리·개인 서비스':['협회·단체','수리·정비','생활 서비스','복지·상담','반려견 서비스','반려묘 서비스','중개·연결','설비 서비스'],
 '가구 내 고용':['가사 서비스','돌봄 서비스','반려견 돌봄','반려묘 돌봄','정원 관리','생활 장식','생활 안전','식생활 지원'],
 '국제·외국기관':['국제기구','항공 교류','해외 물류','외교·공공','국제협력','국제 리더십','글로벌 네트워크','국제개발']
};
const audienceOptions=['기업 고객(B2B)','개인 고객(B2C)','공공기관(B2G)','지역 주민','전문가·회원'];
const brandGoalOptions=['신뢰·안정','혁신·기술','친근·생활','프리미엄','역동·도전','자연·지속가능'];
const positionOptions=['합리적·대중적','균형형','고급·전문형'];
const mediumOptions=['명함·인쇄물','웹사이트·앱','간판·차량','제품·패키지','SNS·영상'];
const contextKeywordMotifs={자동차:'car',차량:'car',공장:'factory',생산:'conveyor',자동화:'robot',로봇:'robot',안전:'helmet',위험:'hazard',화학:'barrel',원료:'barrel',에너지:'turbine',정비:'wrench',공구:'wrench',렌치:'wrench',톱니:'gear',기계:'gear',건설:'crane',건축:'building',도로:'road',물류:'truck',운송:'truck',교육:'book',학교:'graduation',의료:'medical',병원:'stethoscope',금융:'chart',보험:'shield',부동산:'home',주택:'home',환경:'leaf',나뭇잎:'leaf',물:'water',산림:'tree',나무:'tree',반려견:'dog',강아지:'dog',반려묘:'cat',고양이:'cat',소프트웨어:'code',데이터:'chip',과학:'atom',꽃:'flower',태양:'sun',새:'bird',독수리:'eagle',사자:'lion',코끼리:'elephant'};
function currentSubtypeIndex(){const names=industrySubtypeNames[state.industry]||[];const i=names.indexOf(state.subtype);return i<0?0:i}
function motifsFromText(text){return [...new Set(Object.entries(contextKeywordMotifs).filter(([word])=>String(text||'').includes(word)).map(([,motif])=>motif))]}
function contextSignalIcons(){return motifsFromText(`${state.brand||''} ${state.description||''} ${state.product||''} ${state.subtype||''} ${state.preferredSymbol||''}`)}
function excludedSignalIcons(){return motifsFromText(state.excludedSymbol||'')}
function ensureContextDefaults(){
 const defaults={product:'',subtype:'',audience:audienceOptions[0],brandGoal:brandGoalOptions[0],positioning:positionOptions[1],medium:mediumOptions[0],region:'',preferredSymbol:'',excludedSymbol:''};
 for(const [key,value] of Object.entries(defaults))if(state[key]===undefined)state[key]=value;
}
function contextPalette(){
 const byGoal={'신뢰·안정':'deep-trust','혁신·기술':'ink-cobalt','친근·생활':'navy-mint','프리미엄':'burgundy-cream','역동·도전':'royal-orange','자연·지속가능':'green-fill'};
 return byGoal[state.brandGoal]||recommendedPalette();
}

function frameForComposite(variant,c1,c2,t){
 const fill=t==='line'?'none':`${c2}18`,w=t==='solid'?6:4;
 return [
  '',
  `<circle cx="45" cy="45" r="39" fill="${fill}" stroke="${c1}" stroke-width="${w}"/>`,
  `<rect x="7" y="7" width="76" height="76" rx="18" fill="${fill}" stroke="${c1}" stroke-width="${w}"/>`,
  `<path d="M45 5l35 20v40L45 85 10 65V25z" fill="${fill}" stroke="${c1}" stroke-width="${w}"/>`,
  `<path d="M10 45a35 35 0 0170 0" fill="none" stroke="${c2}" stroke-width="${w}"/><path d="M18 68h54" stroke="${c1}" stroke-width="${w}"/>`,
  `<path d="M14 73V17h62v56" fill="none" stroke="${c1}" stroke-width="${w}"/><circle cx="70" cy="20" r="7" fill="${c2}"/>`
 ][variant%6];
}
function compositeIcon(meta,c1,c2,t){
 const v=meta.variant,core=iconBeforeIndustryCollections(meta.core,c1,c2,t)||'',accent=meta.accent?(iconBeforeIndustryCollections(meta.accent,c2,c1,'line')||''):'';
 const positions=[['translate(12 12) scale(.72)','translate(57 5) scale(.29)'],['translate(5 18) scale(.67)','translate(57 48) scale(.32)'],['translate(18 5) scale(.66)','translate(2 52) scale(.34)'],['translate(22 20) scale(.58)','translate(3 3) scale(.38)'],['translate(7 7) scale(.62)','translate(51 51) scale(.37)'],['translate(18 18) scale(.61)','translate(53 3) scale(.34)']][v%6];
 const divider=v%3===0?`<path d="M13 76L76 13" stroke="${c2}" stroke-width="3" opacity=".7"/>`:v%3===1?`<circle cx="45" cy="45" r="5" fill="${c2}"/>`:`<path d="M14 45h62" stroke="${c2}" stroke-width="3" opacity=".65"/>`;
 const identity=Array.from({length:7},(_,i)=>(meta.serial+1)&(1<<i)?`<circle cx="${17+i*9}" cy="84" r="2.4" fill="${i%2?c2:c1}"/>`:'').join('');
 return `${frameForComposite(v,c1,c2,t)}<g transform="${positions[0]}">${core}</g>${meta.accent?`<g transform="${positions[1]}">${accent}</g>`:''}${divider}${identity}`;
}
icon=function(id,c1,c2,t='clean'){const meta=industryIconMap.get(id);return meta?compositeIcon(meta,c1,c2,t):iconBeforeIndustryCollections(id,c1,c2,t)};

for(const [industryIndex,industry] of industries.entries()){
 const profile=industryProfiles[industry],motifs=profile.icons.slice(0,8),collection=[];
 const add=(core,accent,variant,label)=>{
  const n=collection.length,id=`industry_${industryIndex+1}_${n+1}`,layout=industryLayouts[n%industryLayouts.length][0],tone=tones[Math.floor(n/industryLayouts.length)%tones.length][0];
  industryIconMap.set(id,{core,accent,variant,industry,serial:n});
  const coreName=symbols.find(x=>x[0]===core)?.[1]||core,accentName=accent?(symbols.find(x=>x[0]===accent)?.[1]||accent):'';
  const recipe={id:`ir${industryIndex+1}_${n+1}`,name:label||`${coreName}·${accentName} 심볼`,tag:`${industry} · ${layoutLabels[layout]} · ${toneLabels[tone]}`,icon:id,layout,tone,industry,primaryIcon:core,accentIcon:accent||core,si:n,li:n%industryLayouts.length,ti:Math.floor(n/industryLayouts.length)%tones.length};
  collection.push(recipe);recipes.push(recipe);
 };
 motifs.forEach((core,i)=>add(core,null,i,`${symbols.find(x=>x[0]===core)?.[1]||core} 단독 심볼`));
 motifs.forEach((core,i)=>motifs.forEach((accent,j)=>add(core,accent,8+i*8+j)));
 motifs.slice(0,4).forEach((core,i)=>add(core,motifs[(i+4)%8],72+i,`${symbols.find(x=>x[0]===core)?.[1]||core} 엠블럼`));
 industryRecipeMap.set(industry,collection);
}
function activeIndustryRecipes(){return industryRecipeMap.get(state.industry)||industryRecipeMap.get(industries[0])}

const baseScoreBeforeIndustryCollections=baseRecipeScore;
baseRecipeScore=function(r){
 if(!r.industry)return baseScoreBeforeIndustryCollections(r);
 const ip=activeIndustryProfile(),sp=activeStyleProfile(),styleIndex=activeStyleIndex(),primary=ip.icons[(currentSubtypeIndex()+styleIndex)%ip.icons.length],signals=contextSignalIcons(),excluded=excludedSignalIcons();let total=30;
 total+=r.primaryIcon===primary?260:weighted(ip.icons,r.primaryIcon,[92,80,68,56,44,32,20,12]);
 total+=weighted(ip.icons,r.accentIcon,[38,32,27,22,17,12,8,4]);
 total+=signals.includes(r.primaryIcon)?150:0;total+=signals.includes(r.accentIcon)?70:0;
 if(excluded.includes(r.primaryIcon))total-=900;if(excluded.includes(r.accentIcon))total-=420;
 total+=weighted(sp.layouts,r.layout,[34,22,12]);total+=weighted(sp.tones,r.tone,[24,12]);
 if(state.audience==='기업 고객(B2B)')total+=r.layout==='horizontal'?24:0;
 if(state.audience==='개인 고객(B2C)')total+=r.layout==='stacked'||r.layout==='badge'?18:0;
 if(state.audience==='공공기관(B2G)')total+=r.tone==='clean'?16:0;
 if(state.brandGoal==='신뢰·안정')total+=(r.layout==='horizontal'?24:0)+(r.tone==='clean'?18:0);
 if(state.brandGoal==='혁신·기술')total+=(r.layout==='monogram'?24:0)+(r.tone==='line'?16:0);
 if(state.brandGoal==='친근·생활')total+=(r.layout==='stacked'||r.layout==='badge'?22:0)+(r.tone==='clean'?10:0);
 if(state.brandGoal==='프리미엄')total+=(r.layout==='horizontal'||r.layout==='monogram'?22:0)+(r.tone==='line'?18:0);
 if(state.brandGoal==='역동·도전')total+=(r.layout==='badge'?24:0)+(r.tone==='solid'?20:0);
 if(state.brandGoal==='자연·지속가능')total+=(r.layout==='stacked'?20:0)+(r.tone==='clean'?14:0);
 if(state.positioning==='합리적·대중적')total+=r.tone==='solid'?15:0;
 if(state.positioning==='고급·전문형')total+=(r.tone==='line'?16:0)+(r.layout==='horizontal'?12:0);
 if(state.medium==='명함·인쇄물')total+=(r.layout==='horizontal'?17:0)+(r.tone==='line'?9:0);
 if(state.medium==='웹사이트·앱')total+=(r.layout==='monogram'?18:0)+(r.tone==='clean'?9:0);
 if(state.medium==='간판·차량')total+=(r.layout==='badge'?18:0)+(r.tone==='solid'?16:0);
 if(state.medium==='제품·패키지')total+=r.layout==='stacked'||r.layout==='badge'?16:0;
 if(state.medium==='SNS·영상')total+=(r.layout==='monogram'?16:0)+(r.tone==='solid'?10:0);
 if(state.brand.length>9)total+=r.layout==='horizontal'?14:0;
 return total;
};
score=baseRecipeScore;
sorted=function(){const pool=activeIndustryRecipes();return state.recommendMode?diversityRerank(pool).slice(0,12):pool};
reason=function(){const r=recipes.find(x=>x.id===state.recipe)||sorted()[0],core=symbols.find(x=>x[0]===r.primaryIcon)?.[1]||r.primaryIcon,accent=symbols.find(x=>x[0]===r.accentIcon)?.[1]||r.accentIcon,detail=[state.subtype,state.audience,state.brandGoal,state.medium].filter(Boolean).join(' · ');return `${state.industry} 전용 76개 중 ‘${core}·${accent}’ 상징을 추천했습니다. 반영 조건: ${detail}.`};

applyRecommendationChange=function(kind,value){
 if(kind==='industry')state.industry=value;else state.style=value;
 if(!state.locked.color&&state.recommendMode)state.palette=recommendedPalette();
 if(kind==='industry'||state.recommendMode)state.recipe=sorted()[0].id;
 if(state.recommendMode)state.cardRecipe=sortedCards()[0].id;
 limit=state.recommendMode?12:Math.min(limit,24);render();
 toast(`${kind==='industry'?'산업군':'인상'}에 맞춰 전용 로고 목록과 작업판을 변경했습니다`);
};

function bindAppendedRecipes(root){
 root.querySelectorAll('[data-recipe]').forEach(b=>b.onclick=()=>{state.recipe=b.dataset.recipe;render()});
 root.querySelectorAll('[data-card-recipe]').forEach(b=>b.onclick=()=>{state.cardRecipe=b.dataset.cardRecipe;render()});
}
function installStableMoreButton(){
 const old=document.querySelector('#moreRecipes');if(!old)return;
 const button=old.cloneNode(true);old.replaceWith(button);
 button.onclick=()=>{
  const collection=state.view==='card'?sortedCards():sorted(),start=limit,next=Math.min(collection.length,start+24),list=document.querySelector('.recipe-list');
  list.insertAdjacentHTML('beforeend',collection.slice(start,next).map((x,i)=>state.view==='card'?cardTile(x,start+i):card(x,start+i)).join(''));
  limit=next;bindAppendedRecipes(list);
  if(next>=collection.length)button.remove();else button.textContent=`더 보기 · ${collection.length-next}개`;
  toast(`${next-start}개를 추가했습니다 · ${next}/${collection.length}`);
 };
}
function applyIndustryCollectionLabels(){
 const countLine=document.querySelector('.topbar .brand span');if(countLine)countLine.textContent='산업군별 고유 로고 76개 · 전체 1,596개 · 양면 명함 289개';
 const mobile=document.querySelector('#mobileRecipes');if(mobile)mobile.innerHTML=`<b>▦</b>${state.view==='card'?'289 명함':'76 업태 로고'}`;
 const notice=document.querySelector('.notice');if(notice)notice.textContent='산업군을 선택하면 해당 업태 전용 로고 76개가 제공됩니다.';
 installStableMoreButton();
 injectDesktopContext();
}
function optionMarkup(items,value){return items.map(x=>`<option ${value===x?'selected':''}>${x}</option>`).join('')}
function contextFieldsMarkup(prefix){
 ensureContextDefaults();const names=industrySubtypeNames[state.industry]||[];if(!names.includes(state.subtype))state.subtype=names[0];if(!audienceOptions.includes(state.audience))state.audience=audienceOptions[0];
 return `<div class="context-control" id="${prefix}Context"><div class="context-heading"><strong>추천 컨텍스트</strong><small>입력할수록 76개 순서가 정교해집니다</small></div><label for="${prefix}Subtype">세부 업태</label><select id="${prefix}Subtype">${optionMarkup(names,state.subtype)}</select><label for="${prefix}Product">핵심 상품·서비스</label><input id="${prefix}Product" value="${esc(state.product)}" placeholder="예: 자동차 전장부품"><label for="${prefix}Audience">주요 고객</label><select id="${prefix}Audience">${optionMarkup(audienceOptions,state.audience)}</select><details class="advanced-context"><summary>고급 조건 6개 더 입력</summary><div class="advanced-context-grid"><label for="${prefix}BrandGoal">브랜드 목표</label><select id="${prefix}BrandGoal">${optionMarkup(brandGoalOptions,state.brandGoal)}</select><label for="${prefix}Positioning">시장 포지션</label><select id="${prefix}Positioning">${optionMarkup(positionOptions,state.positioning)}</select><label for="${prefix}Medium">주 사용처</label><select id="${prefix}Medium">${optionMarkup(mediumOptions,state.medium)}</select><label for="${prefix}Region">활동 지역</label><input id="${prefix}Region" value="${esc(state.region)}" placeholder="예: 부산·영남권 / 전국"><label for="${prefix}PreferredSymbol">선호 상징</label><input id="${prefix}PreferredSymbol" value="${esc(state.preferredSymbol)}" placeholder="예: 로봇, 나무, 물"><label for="${prefix}ExcludedSymbol">제외 상징</label><input id="${prefix}ExcludedSymbol" value="${esc(state.excludedSymbol)}" placeholder="예: 톱니, 방패"></div></details><button class="btn small context-apply" id="${prefix}ApplyContext">9개 조건으로 추천 다시 받기</button></div>`
}
function bindContextFields(prefix,after){
 const root=document.querySelector(`#${prefix}Context`);if(!root)return;
 const bind=(suffix,key,event='change')=>{const el=root.querySelector(`#${prefix}${suffix}`);if(el)el[`on${event}`]=e=>state[key]=e.target.value};
 bind('Subtype','subtype');bind('Product','product','input');bind('Audience','audience');bind('BrandGoal','brandGoal');bind('Positioning','positioning');bind('Medium','medium');bind('Region','region','input');bind('PreferredSymbol','preferredSymbol','input');bind('ExcludedSymbol','excludedSymbol','input');
 root.querySelector(`#${prefix}ApplyContext`).onclick=()=>{state.recommendMode=true;if(!state.locked.color)state.palette=contextPalette();state.recipe=sorted()[0].id;state.cardRecipe=sortedCards()[0].id;limit=12;render();toast('9개 브랜드 컨텍스트를 추천 순서·색상·구도에 반영했습니다');if(after)setTimeout(openMobileRecipeSheet,0)};
}
function injectDesktopContext(){const industryControl=document.querySelector('.filters .industry-control');if(industryControl&&!document.querySelector('#studioContext')){industryControl.insertAdjacentHTML('afterend',contextFieldsMarkup('studio'));bindContextFields('studio',false)}const setupIndustry=document.querySelector('#setupIndustry');if(setupIndustry&&!document.querySelector('#setupContext')){setupIndustry.closest('.field').insertAdjacentHTML('afterend',contextFieldsMarkup('setup'));bindContextFields('setup',false)}}
const openMobileBeforeIndustryContext=openMobileRecipeSheet;
openMobileRecipeSheet=function(){openMobileBeforeIndustryContext();const industryControl=document.querySelector('#mobileRecipeSheet .industry-control');if(industryControl&&!document.querySelector('#mobileContext')){industryControl.insertAdjacentHTML('afterend',contextFieldsMarkup('mobile'));bindContextFields('mobile',true)}};
const renderBeforeIndustryCollections=render;
render=function(){renderBeforeIndustryCollections();applyIndustryCollectionLabels()};
if(!activeIndustryRecipes().some(r=>r.id===state.recipe))state.recipe=sorted()[0].id;
render();
