import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {buildWritingDraft,reviewWritingDraft,WRITING_LIMITS} from '../public/writing-engine.js';

test('vendored engine is the exact original Jobnkill writer source',async()=>{
  const bytes=await readFile(new URL('../public/vendor/jobnkill/narrative-engine.mjs',import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),'4a266482207608d6894d7762311b7662be7685b28afc9ed0143f2339578c72c4');
});

test('entered evidence is organized without invented activity or scores',()=>{
  const input={experience:'고2 과학 동아리에서 같은 물의 측정값이 달랐습니다.',action:'저는 측정 위치를 통일하고 3번 비교했음',result:'측정값의 차이가 2.3에서 1.8로 줄었습니다.',learning:'반복 측정의 중요성을 배웠습니다.'};
  const result=buildWritingDraft(input);
  assert.equal(result.parts.length,4);
  assert.equal(result.originalText,Object.values(input).join('\n\n'));
  assert.ok(result.text.includes('3번 비교했습니다.'));
  assert.ok(result.text.includes('2.3에서 1.8'));
  assert.equal(result.parts[1].changed,true);
  assert.equal(result.source,'jobnkill-narrative-engine');
  assert.equal('score' in result,false);
  assert.equal('probability' in result,false);
});

test('missing action, outcome and learning stay absent even when cues suggest them',()=>{
  const experience='과학 동아리 과제에서 방법을 몰라 시간을 투자했습니다.';
  const result=buildWritingDraft({experience});
  assert.equal(result.text,experience);
  assert.equal(result.parts.length,1);
  assert.equal(result.text.includes('업무'),false);
  assert.equal(result.text.includes('배웠습니다'),false);
});

test('original employment rewrite heuristics cannot insert actions or delete details',()=>{
  const original='커리큘럼 피드백 반영은 하지 않았고 관찰만 했습니다.';
  const result=buildWritingDraft({action:original,learning:'시간 투자'});
  assert.equal(result.parts[0].text,original);
  assert.equal(result.parts[0].preserved,true);
  assert.equal(result.parts[1].text,'시간 투자');
  assert.equal(result.parts[1].preserved,true);
  assert.equal(result.warnings.length,2);
  assert.equal(result.text.includes('개발·운영하며'),false);
  assert.equal(result.text.includes('배웠습니다'),false);
});

test('long original evidence is not truncated by the original engine limits',()=>{
  const experience='가'.repeat(15995)+'기록끝문장';
  const result=buildWritingDraft({experience});
  assert.equal(result.text,experience);
  assert.equal(result.text.length,WRITING_LIMITS.maximum);
  assert.ok(result.text.endsWith('기록끝문장'));
  assert.equal(result.parts[0].preserved,true);
});

test('input boundaries fail explicitly and safely',()=>{
  assert.throws(()=>buildWritingDraft({experience:'너무 짧아요.'}),error=>error.code==='MIN_LENGTH');
  assert.throws(()=>buildWritingDraft({experience:'가'.repeat(16001)}),error=>error.code==='MAX_LENGTH');
  assert.throws(()=>buildWritingDraft({experience:123}),error=>error.code==='INVALID_INPUT');
  assert.throws(()=>buildWritingDraft(null),error=>error.code==='INVALID_INPUT');
  assert.throws(()=>reviewWritingDraft('가'.repeat(16001)),error=>error.code==='MAX_LENGTH');
});

test('review quotes only entered sentences and prioritizes missing personal contribution',()=>{
  const text='우리 팀원들은 함께 실험 과제를 완성했습니다. 그 결과 발표에서 피드백을 받았습니다.';
  const result=reviewWritingDraft(text,{school:'울산대학교',major:'화학과'});
  for(const item of result.items)if(item.evidence)assert.ok(text.includes(item.evidence));
  assert.ok(result.priority[0].includes('내가 직접'));
  assert.ok(result.items.at(-1).feedback.includes('울산대학교 화학과'));
  assert.equal('score' in result,false);
  assert.equal('probability' in result,false);
  assert.equal(reviewWritingDraft('').items.some(item=>item.evidence),false);
});

test('input remains literal and decimal facts are not stripped or reconstructed',()=>{
  const experience='실험 기록에 <측정값> 2.3과 1.8을 적어 두었습니다.';
  const result=buildWritingDraft({experience});
  assert.ok(result.text.includes('<측정값> 2.3과 1.8'));
  assert.equal(result.parts[0].original,experience);
  assert.equal(result.characterCount,[...result.text].length);
});


test('action feedback quotes a performed action instead of a situation mentioning an experiment',()=>{
  const report=reviewWritingDraft('과학 동아리에서 같은 실험을 반복했는데 조마다 결과가 달랐습니다. 저는 측정 조건을 비교하고 실험 기록 양식을 통일하자고 제안했습니다.');
  assert.equal(report.items.find(item=>item.label==='행동과 선택 이유').evidence,'저는 측정 조건을 비교하고 실험 기록 양식을 통일하자고 제안했습니다.');
});
