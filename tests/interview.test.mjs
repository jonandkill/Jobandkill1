import test from 'node:test';
import assert from 'node:assert/strict';
import {interviewFeedback} from '../public/interview-view.js';

test('blank and whitespace answers do not count as completed or receive a score',()=>{
  const r=interviewFeedback({situation:'   ',action:'\n'});
  assert.equal(r.filled,0);
  assert.equal(r.text,'');
  assert.equal(r.followups.length,0);
  assert.equal('score' in r,false);
});
test('feedback preserves authored text and counts only written structural sections',()=>{
  const r=interviewFeedback({situation:'실험 실패',action:'변수를 통제했습니다.'});
  assert.equal(r.filled,2);
  assert.equal(r.text,'실험 실패\n\n변수를 통제했습니다.');
  assert.deepEqual(r.items.filter(x=>!x.filled).map(x=>x.key),['role','result','learning']);
  assert.equal(r.followups.length,1);
});
test('five written fields mean completion only, never admission probability',()=>{
  const r=interviewFeedback({situation:'상황',role:'역할',action:'행동',result:'결과',learning:'배움'});
  assert.equal(r.filled,5);
  assert.equal('probability' in r,false);
  assert.equal(r.followups.length,3);
});
