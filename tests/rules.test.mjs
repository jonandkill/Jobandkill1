import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { evaluateProgram } from "../public/rules.js";

const seed = JSON.parse(await readFile(new URL("../data/seed.json", import.meta.url), "utf8"));
const program = (id) => seed.programs.find((item) => item.id === id);
const base = { k: "3", m: "4", e: "2", h: "3", t1: "2", t2: "4", t1Type: "social", t2Type: "social" };

test("한양대 의예과 제외 예시의 상위 3개 등급합을 계산한다", () => {
  const outcome = evaluateProgram(program("hy-essay-general"), base);
  assert.equal(outcome.status, "pass");
  assert.match(outcome.calculation, /등급합 7/);
});

test("한양대 의예과에는 탐구 평균과 더 엄격한 기준을 적용한다", () => {
  const outcome = evaluateProgram(program("hy-essay-medicine"), base);
  assert.equal(outcome.status, "fail");
  assert.match(outcome.calculation, /탐구 평균 3/);
});

test("연세대 2027 논술은 수능 점수 미입력 상태에서도 최저 미적용을 표시한다", () => {
  const outcome = evaluateProgram(program("yonsei-essay-all"), {});
  assert.equal(outcome.status, "no-min");
});

test("성균관대 자연계 필수 수학을 등급합에 포함한다", () => {
  const input = { k: "1", m: "4", e: "1", h: "2", t1: "1", t2: "1", t1Type: "science", t2Type: "science" };
  const outcome = evaluateProgram(program("skku-essay-math-natural-6"), input);
  assert.equal(outcome.status, "pass");
  assert.match(outcome.calculation, /등급합 6/);
});

test("서강대는 등급합과 한국사 기준을 함께 확인한다", () => {
  const outcome = evaluateProgram(program("sogang-essay-general"), { ...base, h: "5" });
  assert.equal(outcome.status, "fail");
  assert.match(outcome.calculation, /한국사 5등급/);
});

test("직업탐구는 현재 자동판정 범위 밖으로 처리한다", () => {
  const outcome = evaluateProgram(program("hy-essay-general"), { ...base, t1Type: "vocational" });
  assert.equal(outcome.status, "fail");
  assert.equal(outcome.label, "판정 범위 밖");
});
