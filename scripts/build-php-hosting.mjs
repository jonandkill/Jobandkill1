import {readFile,writeFile,mkdir,cp,readdir} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.resolve(process.argv[2] || path.join(root,'..','output','jobnkill-php8-review'));
const json=async filename=>JSON.parse(await readFile(path.join(root,'data',filename),'utf8'));
const writeJson=async(filename,data)=>{const target=path.join(output,'private_app','data',filename);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,JSON.stringify(data));};
await mkdir(output,{recursive:true});
await cp(path.join(root,'hosting','php8'),output,{recursive:true});
await cp(path.join(root,'public'),path.join(output,'public_html'),{recursive:true});
await mkdir(path.join(output,'private_app','storage','documents'),{recursive:true});

const publicRoot=path.join(output,'public_html');
// Hash routing keeps relative API URLs valid under / or a hosting subdirectory.
for(const file of await readdir(publicRoot)) {
  if(!file.endsWith('.js'))continue;
  const target=path.join(publicRoot,file);
  const content=await readFile(target,'utf8');
  await writeFile(target,content.replace(/(["'`])\/(api|data|vendor)\//g,'$1./$2/'));
}
const pdfSource=path.join(root,'node_modules','pdfjs-dist');
const pdfDest=path.join(publicRoot,'vendor','pdfjs');
await mkdir(pdfDest,{recursive:true});
for(const name of ['pdf','pdf.worker'])await cp(path.join(pdfSource,'build',name+'.min.mjs'),path.join(pdfDest,name+'.mjs'));
for(const part of ['cmaps','standard_fonts','wasm','iccs'])await cp(path.join(pdfSource,part),path.join(pdfDest,part),{recursive:true});
await cp(path.join(pdfSource,'LICENSE'),path.join(pdfDest,'LICENSE'));

const [seed,registry,supplemental,details,exams,coverage,essayUniversities,extraDetails,practice,official]=await Promise.all(['seed.json','universities.json','supplemental-universities.json','details.json','exams.json','coverage.json','essay-universities.json','extra-details.json','practice-questions.json','official-question-bank.json'].map(json));
let outcomes;
try {outcomes=await json('outcomes.json');}
catch(error){if(error.code!=='ENOENT')throw error;outcomes=JSON.parse(gunzipSync(await readFile(path.join(root,'data','outcomes.json.gz'))));}
const universities=[...registry.universities,...supplemental.universities.filter(u=>!registry.universities.some(b=>b.id===u.id))];
const grouped=new Map();for(const row of outcomes){if(!grouped.has(row.universityId))grouped.set(row.universityId,[]);grouped.get(row.universityId).push(row);}
const outcomeSchools=[...grouped].map(([id,rows])=>({universityId:id,universityName:rows[0].universityName,count:rows.length,years:[...new Set(rows.map(r=>r.academicYear))].sort()}));
const catalog={metadata:{...seed.metadata,registry:{...registry.metadata,totalWithSupplements:universities.length,supplementalCount:supplemental.universities.length}},sources:seed.sources,programs:seed.programs,universities,details,exams,coverage,outcomeSchools,essayUniversities,storage:'verified-file'};
await writeJson('catalog.json',catalog);
await writeJson('health.json',{ok:true,academicYear:seed.metadata.academicYear,universities:universities.length,generalUniversities:universities.filter(u=>u.institutionType==='일반대학').length,colleges:universities.filter(u=>u.institutionType==='전문대학').length,detailUniversities:details.length,outcomeRecords:outcomes.length,outcomeUniversities:outcomeSchools.length,essayUniversities:essayUniversities.universities.length,examResources:exams.length,release:'design-review-20261002',sources:seed.sources.length,programs:seed.programs.length,calculationReady:seed.programs.filter(p=>p.calculationReady).length,verifiedAt:seed.metadata.verifiedAt,databaseError:null});
for(const [id,rows]of grouped)await writeJson('outcomes/'+id+'.json',rows);
await writeJson('supplemental-ids.json',supplemental.universities.map(u=>u.id));
await writeJson('exams.json',exams);
for(const file of ['essay-rubrics.json','practice-questions.json','interviews.json','essay-standards.json','education-registry.json','essay-universities.json','official-question-bank.json','authored-question-bank.json'])await writeJson(file,await json(file));

const departmentSearch=[];
for(const university of extraDetails.universities){
  await writeJson('departments/'+university.universityId+'.json',university);
  if(['0000431','0002659','0000548'].includes(university.universityId))continue;
  const school=registry.universities.find(u=>u.id===university.universityId);
  for(const d of university.departmentCatalog?.items||[])departmentSearch.push({...d,universityId:university.universityId,universityName:school?.displayName||school?.name,searchUniversityName:school?.name,academicYear:university.departmentCatalog.academicYear,sourceUrl:d.officialInfoUrl||university.departmentCatalog.sourceUrl});
}
await writeJson('department-search.json',departmentSearch);
await writeJson('document-map.json',Object.fromEntries([...exams.filter(p=>p.documentUrl&&p.linkCheck?.isPdf).map(p=>({id:p.id,url:p.documentUrl,title:p.title})),...(practice.resources||[]),...(official.resources||[])].filter(r=>/^https:\/\//.test(r.url||'')).map(r=>[r.id,r])));

// Use the same reviewed Node comparison functions to build portable, small datasets.
const server=await readFile(path.join(root,'server.mjs'),'utf8');
const start=server.indexOf('const REFERENCE_FORMULA_KEY');
const end=server.indexOf("app.get('/api/outcome-candidates'",start);
if(start<0||end<0)throw Error('comparison_export_boundary_missing');
const engine=Function('outcomes',server.slice(start,end)+'\nreturn {outcomeCandidateGroups,recentComparableRows,availableOutcomeFormulas,REFERENCE_FORMULA_KEY,REFERENCE_FORMULA_LABEL};')(outcomes);
for(const scale of ['5','9']){
  const formulas=engine.availableOutcomeFormulas(scale),groups={};
  for(const formula of formulas){
    const reference=formula.key===engine.REFERENCE_FORMULA_KEY;
    const series=engine.outcomeCandidateGroups(scale,formula.key).map(rows=>engine.recentComparableRows(rows,scale,formula.key)).filter(s=>s.sameSeries);
    const items=series.map(({recent})=>{
      const first=recent[0];const cutoffs=recent.map(r=>Number(r.grade70)).sort((a,b)=>a-b);
      return {universityId:first.universityId,universityName:first.universityName,program:first.program,track:first.track,formulaLabel:reference?engine.REFERENCE_FORMULA_LABEL:first.formulaLabel,formulaVerified:!reference,comparisonMode:reference?'published_grade_reference':'verified_formula',metric:first.metric,scale,years:recent.map(r=>Number(r.academicYear)),grade70Range:{min:cutoffs[0],max:cutoffs.at(-1)},referenceMedian:cutoffs[Math.floor(cutoffs.length/2)],sourceUrls:[...new Set(recent.map(r=>r.sourceUrl).filter(url=>/^https:\/\//.test(url)))],dataYears:recent.length};
    }).sort((a,b)=>a.universityName.localeCompare(b.universityName,'ko')||a.program.localeCompare(b.program,'ko')).map((item,index)=>({...item,_nameOrder:index}));
    groups[formula.key]={universityCount:new Set(items.map(i=>i.universityId)).size,items};
  }
  await writeJson('comparison-'+scale+'.json',{formulas,groups});
}
const commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const modifiedSource=execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim().length>0;
await writeFile(path.join(output,'build-manifest.json'),JSON.stringify({build:'design-review-20261002',generatedAt:new Date().toISOString(),sourceCommit:commit,phpMinimum:'8.0',database:'MariaDB 10.x',universityRecords:universities.length,activeUniversities:universities.filter(u=>!['0000431','0002659','0000548'].includes(u.id)).length,outcomeRecords:outcomes.length,departmentSearchRows:departmentSearch.length,modifiedSource},null,2));
console.log(JSON.stringify({output,universities:universities.length,outcomeRecords:outcomes.length,departmentSearchRows:departmentSearch.length,comparisonScales:['5','9']}));
