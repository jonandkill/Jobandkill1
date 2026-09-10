import test from 'node:test';
import assert from 'node:assert/strict';
import {interviewFeedback, extractResumeEvidence, buildPracticeQuestions, validateResumeFile, findOfficialInterviewSchool,resumeFileError,extractResumeFile} from '../public/interview-view.js';

test('blank answer has no evidence, followups or synthetic score',()=>{
  const r=interviewFeedback('   \n');
  assert.equal(r.filled,0);assert.equal(r.text,'');assert.equal(r.followups.length,0);
  assert.equal('score' in r,false);assert.equal('probability' in r,false);
});
test('single freeform answer preserves sentences and identifies actual expressions',()=>{
  const text='고2 동아리 실험에서 측정값이 달랐습니다. 제가 조건을 비교하고 변수를 통제했습니다. 측정 기록을 비교하니 편차가 줄었습니다. 전공에서 이 한계를 보완하는 방법을 배우고 싶습니다.';
  const r=interviewFeedback(text,{major:'화학과'});
  assert.equal(r.text,text);assert.equal(r.filled,5);
  for(const item of r.items)assert.ok(text.includes(item.evidence));
  assert.ok(r.followups.some(q=>q.includes('화학과')));
  assert.equal('score' in r,false);
});
test('generic praise gets concrete revisions rather than a completion score',()=>{
  const r=interviewFeedback('열심히 하겠습니다. 훌륭한 사람이 되고 싶습니다.');
  assert.equal(r.filled,0);assert.ok(r.priority.length>0);
  assert.ok(r.priority[0].includes('어떤 과제'));
});
test('group claims without personal role are prioritized for revision',()=>{
  const r=interviewFeedback('우리 팀원들은 함께 과제를 완성했습니다.');
  assert.ok(r.priority[0].includes('팀 중심'));
});
test('resume questions are grounded in actual provided sentences and clearly practice',()=>{
  const original='저는 과학 동아리에서 물의 오염도를 비교하는 실험을 했습니다. 그 과정에서 측정 기록이 일관되지 않아 절차를 수정했습니다.';
  const evidence=extractResumeEvidence(original);
  const questions=buildPracticeQuestions({school:'울산대학교',major:'화학과',evidence});
  const own=questions.filter(q=>q.id.startsWith('resume-'));
  assert.ok(own.length>=1);
  for(const q of own){assert.ok(original.includes(q.evidence));assert.ok(q.kind.includes('실제 기출 아님'));}
  assert.ok(questions[0].text.includes('울산대학교 화학과'));
});
test('unknown school has no invented official format or curriculum facts',()=>{
  const qs=buildPracticeQuestions({school:'자료가 없는 대학',major:'아직 모름'});
  assert.equal(qs.some(q=>q.id==='target-official'),false);
  assert.ok(qs.find(q=>q.id==='target-curriculum').text.includes('직접 확인한 과목'));
});
test('resume upload rejects unsupported types and files over the local limit',()=>{
  assert.ok(validateResumeFile({name:'자료.docx',size:10}));
  assert.ok(validateResumeFile({name:'자료.pdf',size:10*1024*1024+1}));
  assert.equal(validateResumeFile({name:'자료.PDF',size:1024}),'');
  assert.equal(validateResumeFile({name:'자료.txt',size:1024}),'');
});
test('main campus interview rules are not assigned to another campus',()=>{
  const schools=[{name:'연세대학교',formats:[{duration:'확인된 본교 값'}]}];
  assert.ok(findOfficialInterviewSchool({name:'연세대학교',campus:'본교'},schools));
  assert.equal(findOfficialInterviewSchool({name:'연세대학교(미래)',campus:'분교'},schools),undefined);
  assert.equal(findOfficialInterviewSchool({name:'연세대학교',campus:'분교'},schools),undefined);
});
test('official practice question names its exact verified track and scope',()=>{
  const questions=buildPracticeQuestions({school:'서울대학교',major:'간호학과',formats:[{track:'일반전형',scope:'간호대학',method:'공식 자료에 확인된 방법'}]});
  const question=questions.find(q=>q.id==='target-official');
  assert.ok(question.text.includes('일반전형 전형(간호대학)'));
  assert.ok(questions.find(q=>q.id==='target-domain').kind.includes('실제 기출'));
});
test('feedback chooses strong category evidence instead of repeating a record-keeper role sentence',()=>{
  const answer='저는 과학 동아리에서 기록 담당을 맡았습니다. 처음에는 측정값이 달라 비교하기 어려웠습니다. 저는 측정 위치와 시간을 통일하고 세 번 반복해 평균을 기록하도록 제안했습니다. 팀원들과 결과를 비교하면서 측정 조건을 맞추는 중요성을 배웠습니다. 간호학에서도 관찰 기록의 정확성을 지키고 싶습니다.';
  const items=Object.fromEntries(interviewFeedback(answer).items.map(item=>[item.key,item]));
  assert.ok(items.role.evidence.includes('기록 담당'));
  assert.ok(items.situation.evidence.includes('어려웠습니다'));
  assert.ok(items.action.evidence.includes('제안했습니다'));
  assert.ok(items.learning.evidence.includes('배웠습니다'));
  assert.equal(items.result.detected,false);
});
test('the noun record alone does not establish action or outcome',()=>{
  const items=Object.fromEntries(interviewFeedback('저는 기록 담당을 맡았습니다.').items.map(item=>[item.key,item]));
  assert.equal(items.action.detected,false);assert.equal(items.result.detected,false);
});
test('file access failure provides a recoverable cause without repeating document text',()=>{
  const message=resumeFileError({name:'NotReadableError',message:'sensitive filename and private content'});
  assert.ok(message.includes('접근 권한'));
  assert.ok(message.includes('다시 선택'));
  assert.equal(message.includes('sensitive'),false);
});
test('real PDF.js 6 extracts a PDF and releases its loading task without losing the text',async()=>{
  const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
  const expected='I compared measurement records and proposed a repeatable procedure for our science project.';
  const stream='BT /F1 12 Tf 40 700 Td ('+expected+') Tj ET';
  const objects=[
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Length '+stream.length+' >>\nstream\n'+stream+'\nendstream'
  ];
  let pdf='%PDF-1.4\n';const offsets=[0];
  for(const [i,body] of objects.entries()){offsets.push(Buffer.byteLength(pdf));pdf+=(i+1)+' 0 obj\n'+body+'\nendobj\n';}
  const xref=Buffer.byteLength(pdf);
  pdf+='xref\n0 6\n0000000000 65535 f \n'+offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF';
  let released=false;
  const runtime={getDocument(options){
    const task=pdfjs.getDocument({...options,standardFontDataUrl:new URL('../node_modules/pdfjs-dist/standard_fonts/',import.meta.url).pathname});
    const destroy=task.destroy.bind(task);task.destroy=async()=>{await destroy();released=true;};return task;
  }};
  const result=await extractResumeFile(new File([pdf],'sample.pdf',{type:'application/pdf'}),runtime);
  assert.ok(result.includes(expected));assert.equal(released,true);
});
