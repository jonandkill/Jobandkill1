import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.resolve(process.argv[2] || path.join(root,'..','output','JOBKILL_susi_design_preview.html'));
const read=filename=>readFile(path.join(root,filename),'utf8');
const asset=async(filename,mime)=>'data:'+mime+';base64,'+(await readFile(path.join(root,'public',filename))).toString('base64');
const registry=JSON.parse(await read('data/universities.json'));
const supplements=JSON.parse(await read('data/supplemental-universities.json'));
const closed=new Set(['0000431','0002659','0000548']);
const schools=[...registry.universities,...supplements.universities.filter(u=>!registry.universities.some(x=>x.id===u.id))].filter(u=>!closed.has(u.id)).map(({id,name,displayName,region,institutionType,campus,aliases})=>({id,name,displayName,region,institutionType,campus,aliases}));
let css=(await Promise.all(['styles.css','writing.css','design.css'].map(file=>read('public/'+file)))).join('\n');
for(const weight of ['Light','Medium','Bold']){
  const filename='assets/fonts/GmarketSans'+weight+'.woff';
  css=css.replace('./'+filename,await asset(filename,'font/woff'));
}
const icons=(await read('public/ui-icons.js')).replace('export const icon','const icon');
let home=(await read('public/home-view.js')).replace(/^import[^\n]*\n/,'').replace(/^export /gm,'');
for(const scene of ['counseling','campus','study']) {
  const filename='assets/admissions-hero-'+scene+'.webp';
  home=home.replaceAll('./'+filename,await asset(filename,'image/webp'));
}
const production='https://jobnkill-susi-planner.onrender.com/';
const previewCss=`.design-review-note{padding:10px 20px;background:#fff4ee;text-align:center;color:#85462c;font:12px/1.7 'Gmarket Sans',sans-serif}.design-review-note b{font-weight:500}.design-review-dialog{border:1px solid #e5ddea;border-radius:18px;padding:28px;max-width:620px;width:calc(100% - 32px);max-height:80dvh;color:#28252e;box-sizing:border-box}.design-review-dialog::backdrop{background:#28252e55}.design-review-dialog h2{font-size:19px;margin:0 0 10px}.design-review-dialog p{font-size:12px;line-height:1.8;color:#726979}.design-review-dialog>button{float:right;border:0;background:#f2eef9;padding:8px 12px;border-radius:8px;min-height:44px}.design-review-results{display:grid;gap:10px;margin-top:20px}.design-review-results a{padding:14px;border:1px solid #eee6f0;border-radius:10px;text-decoration:none;font-size:13px}.design-review-results small{display:block;color:#74687e;font-size:11px;margin-top:7px}@media(max-width:650px){.design-review-note{font-size:10px;padding:8px 16px}}`;
const reviewScript=`
const schools=${JSON.stringify(schools)};
const production=${JSON.stringify(production)};
const externalRoute=route=>production+route;
const dialog=document.querySelector('#design-search');
function searchPreview({query='',region=''}) {
  const found=schools.filter(u=>(!query||[u.name,u.displayName,u.region,u.campus,...(u.aliases||[])].some(value=>String(value||'').toLocaleLowerCase().includes(query.toLocaleLowerCase())))&&(!region||u.region===region));
  document.querySelector('#design-search-title').textContent=query||region ? '대학 검색 결과' : '대학 목록 미리보기';
  document.querySelector('#design-search-description').textContent=found.length+'개 대학·캠퍼스가 검색되었습니다. 대학명은 현재 운영 사이트의 상세 화면으로 연결됩니다.';
  document.querySelector('#design-search-results').innerHTML=found.length?found.slice(0,30).map(u=>'<a href="'+escape(externalRoute('#university/'+u.id))+'" target="_blank" rel="noopener">'+escape(u.displayName||u.name)+'<small>'+escape(u.region)+' · '+escape(u.institutionType)+'</small></a>').join(''):'<p>검색 결과가 없습니다. 다른 대학명이나 지역을 선택해 보세요.</p>';
  dialog.showModal();
}
renderHome(document.querySelector('#app'),{},()=>window.open(externalRoute('#recommend'),'_blank','noopener'),{universityCount:schools.length,regions:[...new Set(schools.map(u=>u.region))].sort(),onSearch:searchPreview});
document.querySelectorAll('a[href^="#"]').forEach(link=>{
  const route=link.getAttribute('href');
  if(link.hasAttribute('data-home-browse'))return;
  if(link.hasAttribute('data-nav-browse')) {link.addEventListener('click',event=>{event.preventDefault();searchPreview({});closeMenu();});return;}
  if(route==='#home'){link.setAttribute('href','#');link.addEventListener('click',()=>closeMenu());return;}
  if(route==='#app')return;
  link.setAttribute('href',externalRoute(route));link.target='_blank';link.rel='noopener';
});
document.querySelector('.top-nav-home').setAttribute('aria-current','page');
document.querySelector('.bottom-nav a').setAttribute('aria-current','page');
const toggle=document.querySelector('#mobile-menu-toggle');
function closeMenu(){document.querySelector('.site-header').classList.remove('is-menu-open');toggle.setAttribute('aria-expanded','false');document.querySelectorAll('.nav-menu').forEach(e=>e.open=false);}
toggle.onclick=()=>{const open=toggle.getAttribute('aria-expanded')!=='true';toggle.setAttribute('aria-expanded',String(open));document.querySelector('.site-header').classList.toggle('is-menu-open',open);};
document.addEventListener('keydown',event=>{if(event.key==='Escape')closeMenu();});
document.querySelector('#design-search-close').onclick=()=>dialog.close();
dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();}});
`;
let html=await read('public/index.html');
html=html.replace(/<link rel="stylesheet"[^>]*>\s*/g,'').replace(/<link rel="icon"[^>]*>/,'<link rel="icon" href="'+await asset('assets/favicon.svg','image/svg+xml')+'" type="image/svg+xml">');
html=html.replace('</head>','<style>'+css+'\n'+previewCss+'</style></head>');
html=html.replace('<body data-page="home">','<body data-page="home"><div class="design-review-note"><b>홈페이지 디자인 검토본</b> · 대학 검색과 메뉴를 확인해 보세요. 상세 기능 버튼은 현재 운영 사이트로 연결됩니다.</div>');
html=html.replace(/<script type="module"[^>]*><\/script>/,'<dialog id="design-search" class="design-review-dialog" aria-labelledby="design-search-title"><button id="design-search-close" type="button" aria-label="검색 결과 닫기">닫기</button><h2 id="design-search-title">대학 검색</h2><p id="design-search-description"></p><div id="design-search-results" class="design-review-results"></div></dialog><script>'+icons+'\n'+home+'\n'+reviewScript+'</script>');
// Preserve the bundled font license in this standalone visual review artifact.
const license=await read('public/assets/fonts/GmarketSans-LICENSE.txt');
html=html.replace('</body>','<!-- '+license.replace(/--/g,'—')+' --></body>');
await mkdir(path.dirname(output),{recursive:true});
await writeFile(output,html);
console.log(JSON.stringify({output,activeUniversities:schools.length,embeddedAssets:true}));
