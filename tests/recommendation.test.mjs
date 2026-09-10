import test from 'node:test';
import assert from 'node:assert/strict';
import {parseGrade,buildRecommendations,rankSchoolCandidates,validateSubjectGrades,filterSchoolCandidates,paginateItems,applyRecommendationProfile,gradeReferenceSummary} from '../public/recommendation.js';
test('optional subjects preserve blank values and enforce selected scale',()=>{assert.equal(validateSubjectGrades({korean:'2.3',math:''},'5'),true);assert.equal(validateSubjectGrades({science:'6.1'},'5'),false);assert.equal(validateSubjectGrades({science:'6.1'},'9'),true);});
const rows=[2022,2023,2024].map((academicYear,i)=>({universityId:'0000001',program:'학과',track:'교과',academicYear,metric:'registered',scale:'9',formulaKey:'verified-formula',grade70:3+i/10}));
test('decimal grade preserves precision, rejects blank and scale overflow',()=>{assert.equal(parseGrade('2.3','9'),2.3);assert.equal(parseGrade('2.35','5'),2.35);for(const x of ['',null,'2.345','abc','0','5.1'])assert.equal(parseGrade(x,'5'),null);});
test('overall average alone never produces a score difference or personal probability',()=>{const r=buildRecommendations(rows,{average:'2.3',scale:'9'})[0];assert.equal(r.comparable,true);assert.equal(r.distance,null);assert.deepEqual(r.differences,[]);assert.equal(r.personalProbability,null);});
test('confirmed exact-formula converted decimal produces descriptive differences',()=>{const r=buildRecommendations(rows,{scale:'9'},{'verified-formula':{grade:'2.3',scale:'9',confirmed:true}})[0];assert.equal(r.distance,0.7);assert.equal(r.differences[0].difference,-0.7);});
test('different scales, mixed formulas, metrics or duplicate years block comparison',()=>{const converted={'verified-formula':{grade:'2.3',scale:'9',confirmed:true}};assert.equal(buildRecommendations(rows,{scale:'5'},converted)[0].distance,null);for(const mutation of [{formulaKey:null},{formulaKey:'changed'},{metric:'other'},{academicYear:2022}]){const r=buildRecommendations(rows.map((r,i)=>i===2?{...r,...mutation}:r),{scale:'9'},converted)[0];assert.equal(r.comparable,false);assert.equal(r.distance,null);}});
test('two years or missing grade cannot be ranked as a three-year series',()=>{assert.equal(buildRecommendations(rows.slice(0,2),{scale:'9'})[0].comparable,false);assert.equal(buildRecommendations(rows.map((r,i)=>i===1?{...r,grade70:null}:r),{scale:'9'})[0].comparable,false);});
test('school exploration respects region and sorts by published years not grades',()=>{const schools=[{id:'1',region:'울산',type:'일반대학',name:'가'},{id:'2',region:'울산',type:'일반대학',name:'나'},{id:'3',region:'서울',type:'일반대학',name:'다'}];const summaries=[{universityId:'2',years:[2022,2023,2024]}];assert.deepEqual(rankSchoolCandidates(schools,summaries,{preferredRegion:'울산',average:2.3}).map(s=>s.id),['2','1']);});
test('nationwide reset includes schools without outcomes and special-law campuses',()=>{
  const schools=[{id:'1',name:'울산대학교',region:'울산',institutionType:'일반대학'},{id:'special-kaist',name:'KAIST',region:'대전',institutionType:'일반대학'},{id:'2',name:'울산과학대학교',region:'울산',institutionType:'전문대학'},{id:'0000431',name:'서해대학',region:'전북'}];
  assert.equal(filterSchoolCandidates(schools,[],{}).length,3);
  assert.deepEqual(filterSchoolCandidates(schools,[],{preferredRegion:'울산',preferredType:'전문대학'}).map(s=>s.id),['2']);
  assert.equal(filterSchoolCandidates(schools,[],{},'kaist')[0].id,'special-kaist');
  assert.equal(filterSchoolCandidates(schools,[],{},'울산 대학교')[0].id,'1');
});
test('school and major pagination bounds preserve every result without huge first-page tables',()=>{
  const records=Array.from({length:33},(_,i)=>i);
  assert.deepEqual(paginateItems(records,1,5),{items:[0,1,2,3,4],page:1,totalPages:7,total:33});
  assert.deepEqual(paginateItems(records,99,5).items,[30,31,32]);
  assert.equal(paginateItems(records,-2,12).page,1);
  assert.deepEqual(paginateItems([],5,12),{items:[],page:1,totalPages:1,total:0});
});
test('special-law school type and Korean aliases remain discoverable without outcomes',()=>{
  const schools=[{id:'special-kaist',name:'한국과학기술원',displayName:'한국과학기술원(KAIST)',aliases:['KAIST','카이스트'],institutionType:'특수법대학',region:'대전'},{id:'general',name:'일반대학교',institutionType:'일반대학',region:'대전'}];
  assert.deepEqual(filterSchoolCandidates(schools,[],{preferredType:'특수법대학'},'카이스트').map(s=>s.id),['special-kaist']);
  assert.deepEqual(filterSchoolCandidates(schools,[],{preferredType:'일반대학'},'카이스트'),[]);
});

test('reapplying a decimal overall grade replaces the old grade without carrying calculated-source attribution',()=>{
  const original={average:'2.30',scale:'9',averageSource:'entered_subjects',preferredRegion:'울산'};
  const applied=applyRecommendationProfile(original,{average:'3.6',scale:'9',gradePatch:{calculatedAverage:2.3}});
  assert.equal(applied.profile.average,'3.6');
  assert.equal(applied.profile.averageSource,'manual');
  assert.equal(applied.profile.preferredRegion,'울산');
  assert.equal(original.average,'2.30');
  assert.equal(applied.error,null);
});

test('incomplete optional details do not block a valid overall grade and are excluded from calculation',()=>{
  const draft=[{subject:'수학',grade:'2.3',units:'3'},{subject:'영어',grade:'2.9',units:''}];
  const applied=applyRecommendationProfile({average:'2.3',scale:'9'}, {
    average:'3.60',scale:'9',gradePatch:{gradeEntries:draft,gradeEntriesScale:'9',calculatedAverage:2.6,calculatedAverageMethod:'simple'},
    gradeErrors:['이수단위·학점을 일부만 입력했어요.']
  });
  assert.equal(applied.profile.average,'3.60');
  assert.equal(applied.detailsPending,true);
  assert.equal(applied.profile.gradeDetailsStatus,'needs_review');
  assert.equal(applied.profile.calculatedAverage,null);
  assert.equal(applied.profile.calculatedAverageMethod,null);
  assert.deepEqual(applied.profile.gradeEntries,draft,'keep optional entries editable instead of discarding them');
});

test('overall grade validation and grade-scale segregation still hold when optional detail drafts are present',()=>{
  for(const average of ['5.1','2.333','abc','0']){
    const applied=applyRecommendationProfile({average:'3.6',scale:'9'}, {average,scale:'5',gradeErrors:['optional input incomplete']});
    assert.equal(applied.profile,null);assert.match(applied.error,/1~5/);
  }
  assert.equal(applyRecommendationProfile({}, {average:'',badInput:true}).profile,null);
  const applied=applyRecommendationProfile({average:'3.6',scale:'9'}, {
    average:'3.2',scale:'5',gradePatch:{gradeEntries:[{grade:'3.6'}],gradeEntriesScale:'9'},gradeErrors:['저장된 세부 성적은 9등급제입니다.']
  });
  assert.equal(applied.profile.scale,'5');
  assert.equal(applied.profile.gradeEntriesScale,'9');
  assert.equal(applied.profile.calculatedAverage,null);
  assert.equal(buildRecommendations(rows,applied.profile)[0].distance,null);
});

test('clearing the overall grade remains a valid browsing choice',()=>{
  const applied=applyRecommendationProfile({average:'3.6',scale:'9'}, {average:'',scale:'9'});
  assert.equal(applied.profile.average,'');assert.equal(applied.error,null);
});

test('result reference summary reflects a revised grade while separating same-scale data from calculated comparisons',()=>{
  const profile={average:'3.6',scale:'9'};
  assert.deepEqual(gradeReferenceSummary(buildRecommendations(rows,profile),profile),{
    average:3.6,scale:'9',sameScaleGroups:1,verifiedSeries:1,calculatedGroups:0
  });
  const differentScale={average:'2.3',scale:'5'};
  assert.deepEqual(gradeReferenceSummary(buildRecommendations(rows,differentScale),differentScale),{
    average:2.3,scale:'5',sameScaleGroups:0,verifiedSeries:0,calculatedGroups:0
  });
});
