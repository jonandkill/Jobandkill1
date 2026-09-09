import test from "node:test";
import assert from "node:assert/strict";
import {
  POST_STATUSES,
  SAFETY_BOUNDARY,
  articleToMarkdown,
  articleToRichHtml,
  auditArticle,
  buildArticle,
  createKeywordDraft,
  createCopyBlocks,
  createImagePlan,
  createPublishPackage,
  createQueueRecord,
  createTableOfContents,
  generateTitleCandidates,
  inferBlogCategory,
  parseKeywords,
  parseSources,
  segmentDraft,
} from "../core.mjs";

const input = {
  topic: "공공기관 면접 준비",
  primaryKeyword: "공공기관 면접",
  secondaryKeywords: "NCS, 직무면접, NCS",
  title: "공공기관 면접에서 답변 근거를 정리하는 방법",
  category: "취업·면접",
  audience: "공공기관 취업준비생",
  author: "정대웅 교수",
  draft: `첫 문단은 지원자의 실제 경험과 공고 원문을 함께 확인해야 한다는 설명이다.

# 공고 원문을 먼저 확인한다

지원 직무의 수행 내용과 필요 역량을 공식 직무기술서에서 확인한다.

# 경험의 근거를 분리한다

개인 행동과 팀 성과를 구분해 답변한다.`,
  sources: "NCS 국가직무능력표준 https://www.ncs.go.kr\n기관 채용공고 원문",
  cta: "지원 기관의 최신 공고 원문을 다시 확인하세요.",
};

test("safety boundary disables browser manipulation and evasion", () => {
  assert.equal(SAFETY_BOUNDARY.browserAutomation, false);
  assert.equal(SAFETY_BOUNDARY.simulatedTyping, false);
  assert.equal(SAFETY_BOUNDARY.automaticPublishing, false);
  assert.equal(SAFETY_BOUNDARY.botDetectionEvasion, false);
  assert.equal(SAFETY_BOUNDARY.credentialStorage, false);
  assert.equal(SAFETY_BOUNDARY.explicitHumanCopyRequired, true);
});

test("keywords are deduplicated without inventing terms", () => {
  assert.deepEqual(parseKeywords(input.primaryKeyword, input.secondaryKeywords), ["공공기관 면접", "NCS", "직무면접"]);
});

test("sources retain labels and extract only supplied URLs", () => {
  const sources = parseSources(input.sources);
  assert.equal(sources.length, 2);
  assert.equal(sources[0].url, "https://www.ncs.go.kr");
  assert.equal(sources[1].url, "");
});

test("draft segmentation preserves supplied paragraphs", () => {
  const segmented = segmentDraft(input.draft);
  assert.equal(segmented.sections.length, 2);
  assert.equal(segmented.sections[0].heading, "공고 원문을 먼저 확인한다");
  assert.match(segmented.intro, /실제 경험/);
  assert.match(segmented.sections[1].paragraphs[0], /개인 행동/);
});

test("article output contains source text and human-publishing boundary", () => {
  const article = buildArticle(input);
  assert.equal(article.title, input.title);
  assert.match(article.fullText, /지원 직무의 수행 내용/);
  assert.match(article.fullText, /NCS 국가직무능력표준/);
  assert.equal(article.contentPolicy.automaticPublishing, false);
  assert.equal(article.contentPolicy.botDetectionEvasion, false);
});

test("audit warns about unsupported promotional guarantees", () => {
  const article = buildArticle({ ...input, draft: `${input.draft}\n\n무조건 100% 합격을 보장합니다.` });
  const audit = auditArticle(article, { targetLength: 100 });
  const claimCheck = audit.checks.find((check) => check.id === "claims");
  assert.equal(claimCheck.status, "warn");
  assert.ok(audit.riskyClaims.length >= 2);
});

test("copy blocks require an explicit block choice", () => {
  const article = buildArticle(input);
  const blocks = createCopyBlocks(article);
  assert.ok(blocks.find((block) => block.id === "title"));
  assert.ok(blocks.find((block) => block.type === "section"));
  assert.ok(blocks.find((block) => block.id === "body"));
});

test("markdown export is complete and readable", () => {
  const markdown = articleToMarkdown(buildArticle(input));
  assert.match(markdown, /^# 공공기관 면접에서/u);
  assert.match(markdown, /## 이 글에서 확인할 내용/u);
  assert.match(markdown, /## 참고자료/u);
  assert.match(markdown, /#공공기관면접/u);
});

test("title candidates only combine supplied editorial fields", () => {
  const candidates = generateTitleCandidates(input);
  assert.equal(candidates.length, 3);
  assert.equal(candidates[0], input.title);
  assert.ok(candidates.every((candidate) => candidate.includes(input.topic) || candidate.includes(input.primaryKeyword) || candidate === input.title));
  assert.equal(candidates.some((candidate) => /1위|100%|보장/u.test(candidate)), false);
});

test("table of contents follows source section order", () => {
  const toc = createTableOfContents(buildArticle(input));
  assert.deepEqual(toc.map((item) => item.label), ["공고 원문을 먼저 확인한다", "경험의 근거를 분리한다"]);
  assert.deepEqual(toc.map((item) => item.anchor), ["section-1", "section-2"]);
});

test("image plan respects count and creates descriptive alt text", () => {
  const plans = createImagePlan(buildArticle(input), 4);
  assert.equal(plans.length, 4);
  assert.equal(plans[0].placement, "제목 아래");
  assert.ok(plans.every((plan) => plan.altText.includes(input.primaryKeyword)));
  assert.ok(plans.every((plan) => !/확정|보장|100%/u.test(plan.brief)));
});

test("rich copy output preserves headings and escapes supplied markup", () => {
  const article = buildArticle({
    ...input,
    title: "<script>alert(1)</script> 공공기관 면접",
    draft: `${input.draft}\n\n<script>위험한 태그</script>`,
  });
  const richHtml = articleToRichHtml(article);
  assert.match(richHtml, /<h2>이 글에서 확인할 내용<\/h2>/u);
  assert.match(richHtml, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/u);
  assert.equal(richHtml.includes("<script>"), false);
});

test("publish package records a human-only final action", () => {
  const publishPackage = createPublishPackage(buildArticle(input), { imageCount: "4" });
  assert.equal(publishPackage.images.length, 4);
  assert.equal(publishPackage.contentPolicy.automaticPublishing, false);
  assert.equal(publishPackage.contentPolicy.botDetectionEvasion, false);
  assert.match(publishPackage.finalAction, /사용자.*직접 발행/u);
});

test("queue records start in review unless an allowed status is supplied", () => {
  const now = new Date("2026-09-04T12:00:00.000Z");
  const record = createQueueRecord(buildArticle(input), { scheduledAt: "2026-09-05T09:00", imageCount: "2" }, now);
  assert.equal(record.status, "review");
  assert.equal(POST_STATUSES[record.status], "검수 대기");
  assert.equal(record.scheduledAt, "2026-09-05T09:00");
  assert.equal(record.package.images.length, 2);
});

test("keyword-only input generates a complete employment article", () => {
  const generated = createKeywordDraft({
    primaryKeyword: "울산면접학원",
    targetLength: "1800",
  });
  const article = buildArticle(generated);

  assert.equal(generated.generatedFromKeyword, true);
  assert.equal(generated.category, "취업·면접");
  assert.match(generated.topic, /울산면접학원/u);
  assert.ok(article.body.length >= 1400);
  assert.ok(article.sections.length >= 6);
  assert.equal(article.generationMode, "keyword");
  assert.match(article.fullText, /근거와 출처를 관리한다/u);
  assert.match(article.fullText, /게시 전 마지막으로 확인한다/u);
  assert.equal(/100% 합격|업계 1위|무조건 합격/u.test(article.fullText), false);
});

test("keyword generation preserves supplied notes and verified source labels", () => {
  const note = "현대자동차 면접을 준비하는 취업준비생에게 실전 답변 구성법을 안내한다.";
  const generated = createKeywordDraft({
    primaryKeyword: "현대자동차 면접",
    draft: note,
    sources: "현대자동차 채용공고 https://talent.hyundai.com",
    targetLength: "1800",
  });
  const article = buildArticle(generated);

  assert.match(article.fullText, new RegExp(note, "u"));
  assert.match(article.fullText, /입력 자료에서 확인한 핵심/u);
  assert.match(article.fullText, /현대자동차 채용공고/u);
});

test("category inference covers specialist and general keywords", () => {
  assert.equal(inferBlogCategory({ primaryKeyword: "신축 아파트 청약" }), "부동산·분양");
  assert.equal(inferBlogCategory({ primaryKeyword: "학술 논문 분석" }), "연구·논문");
  assert.equal(inferBlogCategory({ primaryKeyword: "여행 준비물" }), "일반 정보");
  assert.equal(inferBlogCategory({ primaryKeyword: "논문", category: "교육·강의" }), "교육·강의");
});

test("empty keyword does not fabricate a draft", () => {
  const generated = createKeywordDraft({ primaryKeyword: "   " });
  assert.equal(generated.generatedFromKeyword, false);
  assert.equal(generated.draft, "");
});
