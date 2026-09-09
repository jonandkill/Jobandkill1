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
for(const file of ['cards.js','app.js','projects.js','recommendation.js']){
  let source=fs.readFileSync(path.join(root,'dist',file),'utf8');
  if(file==='app.js')source=source.replace(/render\(\);\s*$/,'');
  vm.runInContext(source,context,{filename:file});
}

const report=vm.runInContext(`(()=>{
 const styles=Object.keys(styleProfiles),failures=[],rows=[];
 for(const industry of industries)for(const style of styles){
  state.industry=industry;state.style=style;state.recommendMode=true;state.palette=recommendedPalette();
  const top=sorted().slice(0,12),top6=top.slice(0,6),top3=top.slice(0,3);
  const unique=a=>new Set(a).size;
  const checks={ids:unique(top.map(x=>x.id))===12,icons6:unique(top6.map(x=>x.icon))===6,icons12:unique(top.map(x=>x.icon))>=6,layouts:unique(top.map(x=>x.layout))>=3,tones:unique(top.map(x=>x.tone))>=2,top3:unique(top3.map(x=>x.icon))===3,svgs:unique(top.map(x=>logoSvg(x.id)))===12};
  for(const [name,ok] of Object.entries(checks))if(!ok)failures.push({industry,style,name,top:top.map(x=>x.id)});
  const cards=sortedCards().slice(0,12);
  if(unique(cards.slice(0,6).map(x=>x.front))!==6)failures.push({industry,style,name:'cardFronts6'});
  rows.push({industry,style,first:top[0].id,icon:top[0].icon,layout:top[0].layout,tone:top[0].tone,palette:state.palette,card:cards[0].id});
 }
 state.recommendMode=false;
 if(new Set(sorted().slice(0,10).map(x=>x.icon)).size!==10)failures.push({name:'directLogoOrderNotDiverse'});
 if(new Set(sortedCards().slice(0,12).map(x=>x.front)).size!==12)failures.push({name:'directCardOrderNotDiverse'});
 if(new Set(sortedCards().map(x=>x.id)).size!==289)failures.push({name:'directCardOrderLostRecipes'});
 const chosen=recipes[47].id;state.recipe=chosen;render=()=>{};toast=()=>{};applyRecommendationChange('style','bold');
 if(state.recipe!==chosen)failures.push({name:'directSelectionWasOverwritten'});
 return {combinations:rows.length,failures,rows};
})()`,context);

if(report.failures.length){
  console.error(JSON.stringify(report.failures,null,2));
  process.exit(1);
}
console.log(`PASS ${report.combinations}/105 industry-style recommendation combinations`);
console.log('PASS logo top-12 diversity, top-6 icon diversity, layout/tone diversity, SVG uniqueness');
console.log('PASS card top-6 front-layout diversity, direct-list diversity, and direct-selection preservation');
