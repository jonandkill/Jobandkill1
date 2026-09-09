import {readFile, writeFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {groupOutcomeSeries,compareOutcomes} from '../public/outcomes.js';
const read=async name=>{
  try { return JSON.parse(await readFile(new URL('../data/'+name,import.meta.url),'utf8')); }
  catch(error) { if(name!=='outcomes.json'||error.code!=='ENOENT')throw error; return JSON.parse(gunzipSync(await readFile(new URL('../data/outcomes.json.gz',import.meta.url))).toString('utf8')); }
};
const [coverage,exams,outcomes,roster]=await Promise.all(['coverage.json','exams.json','outcomes.json','essay-universities.json'].map(read));
const extra=await read('extra-details.json');
const series=groupOutcomeSeries(outcomes);
for(const row of coverage.universities){
  const papers=exams.filter(e=>e.universityId===row.universityId);
  const results=outcomes.filter(e=>e.universityId===row.universityId);
  row.examRecordCount=papers.length;
  row.outcomeRecordCount=results.length;
  row.outcomeYears=[...new Set(results.map(r=>r.academicYear))].sort();
  const departments=extra.universities.find(u=>u.universityId===row.universityId)?.departmentCatalog;
  row.departmentCountCollected=departments?.items?.length||0;
  row.departmentCatalogComplete=!!departments?.complete;
  if(row.departmentCountCollected)row.partialDetailFields=[...new Set([...row.partialDetailFields,'departments'])];
  if(papers.length) row.partialDetailFields=[...new Set([...row.partialDetailFields,'essayPastPapers'])];
  if(results.length) row.partialDetailFields=[...new Set([...row.partialDetailFields,'pastOutcomes'])];
}
delete coverage.totals.verifiedOutcomeSeries;
Object.assign(coverage.totals,{
  examUniversities:roster.universities.length,
  examRecords:exams.filter(e=>e.auditLinkKind?e.auditLinkKind!=='listing':!['archive','archive_listing'].includes(e.resourceType)).length,
  archiveEntries:exams.filter(e=>e.auditLinkKind?e.auditLinkKind==='listing':['archive','archive_listing'].includes(e.resourceType)).length,
  outcomeUniversities:new Set(outcomes.map(o=>o.universityId)).size,
  outcomeRecords:outcomes.length,
  departmentCatalogsComplete:extra.universities.filter(u=>u.departmentCatalog?.complete).length,
  departmentRows:extra.universities.reduce((n,u)=>n+(u.departmentCatalog?.items?.length||0),0),
  observedThreeYearSeries:series.filter(s=>new Set(s.rows.map(r=>r.academicYear)).size>=3).length,
  formulaComparableThreeYearSeries:series.filter(s=>new Set(s.rows.map(r=>r.academicYear)).size>=3&&compareOutcomes(s.rows).comparable).length
});
await writeFile(new URL('../data/coverage.json',import.meta.url),JSON.stringify(coverage,null,2)+'\n');
console.log(coverage.totals);
