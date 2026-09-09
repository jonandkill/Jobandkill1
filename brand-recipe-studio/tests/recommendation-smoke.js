const fs=require('fs');
const vm=require('vm');
const path=require('path');

const root=path.resolve(__dirname,'..');
const storage=new Map();
const nullElement={
  innerHTML:'',classList:{add(){},remove(){},toggle(){}},style:{},
  addEventListener(){},insertAdjacentHTML(){},querySelector(){return null},querySelectorAll(){return[]}
};
const context={
  console,structuredClone,Blob,URL,setTimeout,clearTimeout,confirm:()=>false,
  localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
  window:{addEventListener(){}},
  document:{querySelector:s=>s==='#app'?nullElement:null,querySelectorAll:()=>[],createElement:()=>({...nullElement,click(){}})},
  SVGElement:function(){},Image:function(){}
};
vm.createContext(context);
for(const file of ['cards.js','app.js','motifs.js','projects.js','recommendation.js','industry-collections.js']){
  let source=fs.readFileSync(path.join(root,'dist',file),'utf8');
  if(file==='app.js'||file==='recommendation.js'||file==='industry-collections.js')source=source.replace(/render\(\);\s*$/,'');
  vm.runInContext(source,context,{filename:file});
}

if(!fs.readFileSync(path.join(root,'dist','recommendation.js'),'utf8').trim().endsWith('render();')){
 console.error('추천 모듈 로드 직후 초기 화면을 다시 그리지 않음');
 process.exit(1);
}

const report=vm.runInContext(`(()=>{
 const styles=Object.keys(styleProfiles),failures=[],rows=[];
 const required=['water','car','wrench','road','mountain','bird','lion','elephant','dog','cat','pine','oak','orchid','cactus','conveyor','robot','hazard','barrel','turbine'];
 if(symbols.length<70||recipes.length<1000)failures.push({name:'motifLibraryTooSmall',symbols:symbols.length,recipes:recipes.length});
 for(const motif of required)if(!symbols.some(x=>x[0]===motif))failures.push({name:'missingMotif',motif});
 for(const industry of industries){
  state.industry=industry;state.recommendMode=false;
  const industrySet=sorted(),industrySvgs=industrySet.map(x=>logoSvg(x.id));
  if(industrySet.length!==76)failures.push({industry,name:'industryRecipeCount',count:industrySet.length});
  if(new Set(industrySet.map(x=>x.id)).size!==76)failures.push({industry,name:'duplicateIndustryRecipeId'});
  if(new Set(industrySvgs).size!==76)failures.push({industry,name:'duplicateIndustrySvg',unique:new Set(industrySvgs).size});
  if(industrySet.some(x=>x.industry!==industry))failures.push({industry,name:'crossIndustryLeak'});
  const styleIcons=[];
  for(const style of styles){
  state.industry=industry;state.style=style;state.recommendMode=true;state.palette=recommendedPalette();
  const top=sorted().slice(0,12),top6=top.slice(0,6),top3=top.slice(0,3);
  const unique=a=>new Set(a).size;
  const checks={ids:unique(top.map(x=>x.id))===12,icons6:unique(top6.map(x=>x.icon))===6,icons12:unique(top.map(x=>x.icon))>=6,layouts:unique(top.map(x=>x.layout))>=3,tones:unique(top.map(x=>x.tone))>=2,top3:unique(top3.map(x=>x.icon))===3,svgs:unique(top.map(x=>logoSvg(x.id)))===12};
  for(const [name,ok] of Object.entries(checks))if(!ok)failures.push({industry,style,name,top:top.map(x=>x.id)});
  const cards=sortedCards().slice(0,12);
  if(unique(cards.slice(0,6).map(x=>x.front))!==6)failures.push({industry,style,name:'cardFronts6'});
  rows.push({industry,style,first:top[0].id,icon:top[0].icon,layout:top[0].layout,tone:top[0].tone,palette:state.palette,card:cards[0].id});
  styleIcons.push(top[0].icon);
  }
  if(new Set(styleIcons).size!==5)failures.push({industry,name:'fiveStylesReuseTopMotif',styleIcons});
 }
 state.recommendMode=false;
 if(new Set(sorted().slice(0,10).map(x=>x.icon)).size!==10)failures.push({name:'directLogoOrderNotDiverse'});
 if(new Set(sortedCards().slice(0,12).map(x=>x.front)).size!==12)failures.push({name:'directCardOrderNotDiverse'});
 if(new Set(sortedCards().map(x=>x.id)).size!==289)failures.push({name:'directCardOrderLostRecipes'});
 if([...industryRecipeMap.values()].flat().length!==1596)failures.push({name:'totalIndustryRecipeCount'});
 state.industry='제조업';state.style='professional';state.recommendMode=true;state.subtype='산업용 로봇';state.product='협동 로봇 자동화';state.preferredSymbol='로봇';state.excludedSymbol='톱니';state.brandGoal='혁신·기술';state.positioning='고급·전문형';state.medium='웹사이트·앱';state.audience='기업 고객(B2B)';
 const contextual=sorted();
 if(contextual[0].primaryIcon!=='robot'&&contextual[0].accentIcon!=='robot')failures.push({name:'preferredContextNotApplied',top:contextual[0]});
 if(contextual.slice(0,6).some(x=>x.primaryIcon==='gear'))failures.push({name:'excludedContextStillRanked',top:contextual.slice(0,6).map(x=>x.id)});
 state.recommendMode=false;
 const chosen=sorted()[47].id;state.recipe=chosen;render=()=>{};toast=()=>{};applyRecommendationChange('style','bold');
 if(state.recipe!==chosen)failures.push({name:'directSelectionWasOverwritten'});
 return {combinations:rows.length,failures,rows,symbolCount:symbols.length,recipeCount:recipes.length};
})()`,context);

if(report.failures.length){
  console.error(JSON.stringify(report.failures,null,2));
  process.exit(1);
}
console.log(`PASS ${report.combinations}/105 industry-style recommendation combinations`);
console.log(`PASS ${report.symbolCount} motif families and ${report.recipeCount} recipes, including required life/animal/transport/tool motifs`);
console.log('PASS 21 industries × 76 unique SVG recipes = 1,596 industry-specific recipes');
console.log('PASS five style buttons select five distinct lead motifs in every industry');
console.log('PASS logo top-12 diversity, top-6 icon diversity, layout/tone diversity, SVG uniqueness');
console.log('PASS card top-6 front-layout diversity, direct-list diversity, and direct-selection preservation');
