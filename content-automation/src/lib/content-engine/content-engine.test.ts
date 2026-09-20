import assert from "node:assert/strict";
import test from "node:test";
import { Channel, ContentEngine, createContentBrief, createDeterministicDraft, runQualityChecks, type Candidate, type Evidence } from "./index";
import { createContentEngineApi } from "./api";

const candidate: Candidate = {
  id: "ai-interview-answer-practice",
  keyword: "AI 면접 답변 연습",
  searchIntent: "정보 탐색",
  customerQuestion: "AI 면접 답변이 길어질 때 어떻게 연습할까?",
  title: "AI 면접 답변이 길어질 때, 먼저 줄여야 할 한 가지",
  coreAnswer: "답변의 결론을 먼저 말하고, 경험은 한 가지 행동만 남겨 설명합니다.",
  coreClaimIds: ["answer-order"],
  reasoning: "질문에 먼저 답하면 듣는 사람이 답변의 방향을 빠르게 이해할 수 있습니다.",
  reasoningClaimIds: ["answer-order"],
  steps: ["질문의 핵심을 한 문장으로 정리합니다.", "내 행동을 한 가지 고릅니다.", "45초 안에 소리 내어 연습합니다."],
  nextAction: { label: "AI 면접 답변 점검표 보기", url: "https://www.jobandkill.com/ai-interview-checklist" },
};

const evidence: Evidence = {
  id: "jobkill-answer-order-guide",
  claim: "잡앤킬 승인 답변 점검표는 결론을 먼저 말하고 행동을 한 가지로 좁히는 연습 순서를 안내한다.",
  sourceUrl: "https://www.jobandkill.com/resources/answer-order-guide",
  verifiedAt: "2026-09-20",
  applicablePeriod: "2026년 운영 자료",
  sourceType: "approved_internal_material",
  supportsClaimIds: ["answer-order"],
};

test("근거-초안-승인-6종 채널 묶음을 외부 AI 없이 생성한다", () => {
  const engine = new ContentEngine({ idFactory: () => "content_1", clock: () => new Date("2026-09-20T12:00:00.000Z") });
  engine.addEvidence(evidence);
  const brief = createContentBrief(candidate, engine.listEvidence());
  const draft = createDeterministicDraft(brief);
  const content = engine.createRecord(candidate, brief, draft);

  assert.equal(content.status, "review_required");
  assert.equal(engine.approve(content.id, { actor: "정대웅", note: "실제 자료 확인" }).status, "approved");
  const pack = engine.generateChannelPack(content.id, Object.values(Channel));

  assert.equal(pack.source.approvedVersion, 1);
  assert.equal(pack.generation.usesExternalAi, false);
  assert.ok("blog" in pack.assets && "shorts" in pack.assets && "qAndA" in pack.assets);
});

test("근거 없는 합격률은 승인 차단되고, 수정본은 새 승인이 필요하다", () => {
  const engine = new ContentEngine({ idFactory: () => "content_2" });
  engine.addEvidence(evidence);
  const brief = createContentBrief(candidate, engine.listEvidence());
  const unsafe = createDeterministicDraft(brief, {
    body: "AI 면접 합격률 99%를 보장합니다.",
    claims: [{ id: "unsupported-rate", text: "AI 면접 합격률 99%", requiredEvidence: true, evidenceIds: [] }],
  });
  assert.equal(runQualityChecks(unsafe, engine.listEvidence()).passed, false);
  const content = engine.createRecord(candidate, brief, unsafe);
  assert.throws(() => engine.approve(content.id, { actor: "정대웅" }), /승인할 수 없습니다/);

  const revised = engine.saveDraft(content.id, createDeterministicDraft(brief), { actor: "정대웅", changeNote: "근거 없는 보장 문구 제거" });
  assert.equal(revised.currentVersion, 2);
  assert.throws(() => engine.generateChannelPack(content.id), /승인되지 않았습니다/);
  assert.equal(engine.approve(content.id, { actor: "정대웅" }).versions.at(-1)?.approval?.approvedVersion, 2);
});

test("프레임워크 중립 facade를 route handler가 바로 사용할 수 있다", () => {
  const api = createContentEngineApi(new ContentEngine({ idFactory: () => "content_3" }));
  api.addEvidence({ evidence });
  const { brief } = api.createBrief({ candidate });
  const { draft } = api.createDraft({ brief });
  const { content } = api.createContent({ candidate, brief, draft });
  api.approveContent({ contentId: content.id, actor: "정대웅" });
  const { pack } = api.createChannelPack({ contentId: content.id, channels: [Channel.BLOG, Channel.SHORTS] });
  assert.deepEqual(Object.keys(pack.assets).sort(), ["blog", "shorts"]);
});
