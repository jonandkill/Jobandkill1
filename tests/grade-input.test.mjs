import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateGradeAverage,initialGradeEntries,validateGradeEntries} from '../public/grade-input.js';

test('decimal grades calculate a simple mean when every unit is omitted',()=>{
  const result=calculateGradeAverage([{grade:'2.3',units:''},{grade:'1.8',units:''},{grade:'',units:''}],'9');
  assert.equal(result.average,2.05);assert.equal(result.method,'simple');assert.equal(result.count,2);assert.equal(result.totalUnits,null);
});

test('fully entered units weight each grade and only round the final average',()=>{
  const result=calculateGradeAverage([{grade:'2.3',units:'3'},{grade:'1.8',units:'5'}],'9');
  assert.equal(result.average,1.99);assert.ok(Math.abs(result.exactAverage-1.9875)<1e-12);assert.equal(result.method,'weighted');assert.equal(result.totalUnits,8);
});

test('partly entered units cannot silently become a simple or weighted mean',()=>{
  const result=calculateGradeAverage([{grade:'2.3',units:'3'},{grade:'1.8',units:''}],'9');
  assert.equal(result.average,null);assert.match(result.errors.join(' '),/일부만/);
});

test('invalid scale, invalid grades, missing grade with units and nonpositive units block averaging',()=>{
  for(const entries of [[{grade:'5.1',units:''}],[{grade:'0',units:''}],[{grade:'2.333',units:''}],[{grade:'',units:'3'}],[{grade:'2.3',units:'0'}],[{grade:'2.3',units:'-1'}],[{grade:'2.3',units:'1e2'}]]){
    const result=calculateGradeAverage(entries,'5');assert.equal(result.average,null);assert.ok(result.errors.length);
  }
  assert.equal(calculateGradeAverage([{grade:'2.3'}],'7').average,null);
  assert.equal(calculateGradeAverage([],'9').average,null);
});

test('stored detailed grades retain their scale and cannot be reinterpreted after a scale change',()=>{
  const entries=[{grade:'2.3',units:''}];
  assert.equal(validateGradeEntries(entries,'5','9').average,null);
  assert.match(validateGradeEntries(entries,'5','9').errors[0],/9등급제/);
  assert.equal(validateGradeEntries(entries,'9','9').average,2.3);
});

test('old subject averages migrate without inventing units; course entries take precedence',()=>{
  const migrated=initialGradeEntries({subjectGrades:{korean:'2.3',math:'1.8'}});
  assert.equal(migrated.find(r=>r.subject==='국어').grade,'2.3');assert.ok(migrated.every(r=>r.units===''));
  assert.deepEqual(initialGradeEntries({gradeEntries:[{subject:'고1 수학',grade:2.2,units:3}],subjectGrades:{math:'1'}}),[{subject:'고1 수학',grade:'2.2',units:'3'}]);
});
