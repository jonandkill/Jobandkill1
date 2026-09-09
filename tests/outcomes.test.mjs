import test from 'node:test';
import assert from 'node:assert/strict';
import {compareOutcomes,observedAdmissionRate,groupOutcomeSeries} from '../public/outcomes.js';
import {readFileSync,existsSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
const canonical = new URL('../data/outcomes.json',import.meta.url);
const data = JSON.parse(existsSync(canonical) ? readFileSync(canonical) : gunzipSync(readFileSync(new URL('../data/outcomes.json.gz',import.meta.url))));
test('quota and waitlist do not imply actual admission rate',()=>{
 assert.equal(observedAdmissionRate({applicants:100,quota:10,waitlistLast:30}),null);
 assert.equal(observedAdmissionRate({applicants:100,admitted:20}),null);
 assert.equal(observedAdmissionRate({applicants:100,admitted:20,admissionCountVerified:true,applicantCountVerified:true}).percent,20);
});
test('same-track historical series does not make personal probability',()=>{
 const series=groupOutcomeSeries(data).find(s=>s.rows.length>=3);
 assert.ok(series);
 const result=compareOutcomes(series.rows,{grade:3,scale:'9',formulaKey:'overall'});
 assert.equal(result.personalProbability,null);
 assert.deepEqual(result.differences,[]);
 assert.ok(result.grade70Range);
});
test('changed scales and tracks cannot be pooled',()=>{
 const row=data[0];
 assert.equal(compareOutcomes([row,{...row,academicYear:2027,scale:'5'}]).comparable,false);
 assert.equal(compareOutcomes([row,{...row,academicYear:2027,track:'다른전형'}]).comparable,false);
});
test('historical data retain source and valid grade ranges',()=>{
 assert.equal(new Set(data.map(r=>r.id)).size,data.length);
 assert.ok(data.every(r=>r.sourceUrl.startsWith('https://') && r.academicYear>=2022 && r.academicYear<=2026 && (r.grade70===null || r.grade70>=1 && r.grade70<=9)));
});
