export const SAFETY_BOUNDARY = Object.freeze({
  browserAutomation: false,
  simulatedTyping: false,
  automaticPublishing: false,
  botDetectionEvasion: false,
  credentialStorage: false,
  explicitHumanCopyRequired: true,
});

export const POST_STATUSES = Object.freeze({
  draft: "작성 중",
  review: "검수 대기",
  approved: "발행 승인",
  published: "게시 완료",
});

const HEADING_PATTERN = /^(?:#{1,3}\s+|(?:\d{1,2}[.)]|[①-⑳])\s*|(?:핵심|정리|요약|체크|결론|FAQ|자주 묻는 질문)\s*[:：])/u;
const BULLET_PATTERN = /^(?:[-*•]|\d+[.)]|[①-⑳])\s+/u;
const RISKY_CLAIM_PATTERN = /(무조건|100\s*%|완벽하게|반드시 합격|수익을? 보장|절대 손해|업계\s*1위|최고의|유일한)/giu;

export function normalizeText(value = "") {
  return String(value)
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\u00a0]+/g, " ")
    .replace(/[ ]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function parseKeywords(primary = "", secondary = "") {
  const values = [primary, ...String(secondary).split(/[,\n]/u)]
    .map((value) => value.trim().replace(/^#+/u, ""))
    .filter(Boolean);

  return [...new Set(values.map((value) => value.toLocaleLowerCase("ko-KR")))]
    .map((lower) => values.find((value) => value.toLocaleLowerCase("ko-KR") === lower));
}

export function parseSources(value = "") {
  return normalizeText(value)
    .split("\n")
    .map((line) => line.replace(/^[-*•]\s*/u, "").trim())
    .filter(Boolean)
    .map((line, index) => {
      const url = line.match(/https?:\/\/[^\s)\]]+/iu)?.[0] ?? "";
      return {
        id: `source-${index + 1}`,
        label: line,
        url,
      };
    });
}

export function segmentDraft(value = "") {
  const normalized = normalizeText(value);
  if (!normalized) return { intro: "", sections: [] };

  const paragraphs = normalized.split(/\n\s*\n/u).map((part) => part.trim()).filter(Boolean);
  const introParts = [];
  const sections = [];
  let active = null;

  for (const paragraph of paragraphs) {
    const lines = paragraph.split("\n").map((line) => line.trim()).filter(Boolean);
    const first = lines[0] ?? "";
    const looksLikeHeading = lines.length === 1 && HEADING_PATTERN.test(first);

    if (looksLikeHeading) {
      active = {
        heading: cleanHeading(first),
        paragraphs: [],
      };
      sections.push(active);
      continue;
    }

    if (active) active.paragraphs.push(paragraph);
    else introParts.push(paragraph);
  }

  if (sections.length === 0) {
    const intro = paragraphs.shift() ?? "";
    const grouped = [];
    for (let index = 0; index < paragraphs.length; index += 2) {
      grouped.push({
        heading: `핵심 내용 ${Math.floor(index / 2) + 1}`,
        paragraphs: paragraphs.slice(index, index + 2),
      });
    }
    return { intro, sections: grouped };
  }

  return {
    intro: introParts.join("\n\n"),
    sections,
  };
}

function cleanHeading(value) {
  return value
    .replace(/^#{1,3}\s+/u, "")
    .replace(/^(?:\d{1,2}[.)]|[①-⑳])\s*/u, "")
    .trim();
}

function createTitle({ title, topic, primaryKeyword }) {
  const explicit = normalizeText(title);
  if (explicit) return explicit.split("\n")[0];

  const safeTopic = normalizeText(topic).split("\n")[0];
  const safeKeyword = normalizeText(primaryKeyword).split("\n")[0];
  if (safeTopic && safeKeyword && !safeTopic.includes(safeKeyword)) {
    return `${safeKeyword}｜${safeTopic}`;
  }
  return safeTopic || safeKeyword || "제목을 입력하세요";
}

function uniqueStrings(values) {
  const seen = new Set();
  return values.filter((value) => {
    const normalized = normalizeText(value).toLocaleLowerCase("ko-KR");
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

export function generateTitleCandidates(input = {}) {
  const explicit = normalizeText(input.title).split("\n")[0];
  const topic = normalizeText(input.topic).split("\n")[0];
  const keyword = normalizeText(input.primaryKeyword).split("\n")[0];
  const audience = normalizeText(input.audience).split("\n")[0];
  const combined = topic && keyword && !topic.includes(keyword) ? `${keyword}｜${topic}` : topic || keyword;

  return uniqueStrings([
    explicit,
    combined,
    topic && keyword ? `${topic}｜${keyword} 핵심 정리` : "",
    keyword && audience ? `${keyword}：${audience}가 확인할 내용` : "",
    combined ? `${combined} 핵심 체크리스트` : "",
    combined ? `${combined} 확인 가이드` : "",
  ]).slice(0, 3);
}

function createMetaDescription(intro, sections) {
  const candidate = normalizeText(intro) || normalizeText(sections.flatMap((section) => section.paragraphs).join(" "));
  if (!candidate) return "";
  return candidate.length > 150 ? `${candidate.slice(0, 147).trim()}…` : candidate;
}

export function buildArticle(input = {}) {
  const title = createTitle(input);
  const { intro, sections } = segmentDraft(input.draft);
  const sources = parseSources(input.sources);
  const tags = parseKeywords(input.primaryKeyword, input.secondaryKeywords);
  const cta = normalizeText(input.cta);
  const category = normalizeText(input.category);
  const audience = normalizeText(input.audience);
  const author = normalizeText(input.author);
  const metaDescription = createMetaDescription(intro, sections);

  const bodyParts = [];
  if (intro) bodyParts.push(intro);
  if (sections.length) {
    bodyParts.push(`## 이 글에서 확인할 내용\n${sections.map((section, index) => `${index + 1}. ${section.heading}`).join("\n")}`);
  }
  for (const section of sections) {
    bodyParts.push(`## ${section.heading}`);
    if (section.paragraphs.length) bodyParts.push(section.paragraphs.join("\n\n"));
  }
  if (cta) bodyParts.push(`## 다음 행동\n${cta}`);
  if (sources.length) bodyParts.push(`## 참고자료\n${sources.map((source) => `- ${source.label}`).join("\n")}`);

  const body = bodyParts.join("\n\n").trim();
  const tagLine = tags.map((tag) => `#${tag.replace(/\s+/gu, "")}`).join(" ");
  const fullText = [title, body, tagLine].filter(Boolean).join("\n\n");

  return {
    title,
    topic: normalizeText(input.topic),
    category,
    audience,
    author,
    primaryKeyword: normalizeText(input.primaryKeyword),
    secondaryKeywords: parseKeywords("", input.secondaryKeywords),
    intro,
    sections,
    sources,
    cta,
    tags,
    tagLine,
    metaDescription,
    body,
    fullText,
    createdAt: new Date().toISOString(),
    contentPolicy: { ...SAFETY_BOUNDARY },
  };
}

export function createTableOfContents(article) {
  return article.sections.map((section, index) => ({
    index: index + 1,
    label: section.heading,
    anchor: `section-${index + 1}`,
  }));
}

export function createImagePlan(article, requestedCount = 4) {
  const count = Math.min(10, Math.max(1, Number(requestedCount) || 4));
  const topic = article.primaryKeyword || article.topic || article.title;
  const plans = [
    {
      id: "image-hero",
      order: 1,
      placement: "제목 아래",
      purpose: "대표 이미지",
      section: article.title,
      altText: `${topic} 관련 대표 이미지`,
      brief: `${article.title}의 주제를 한눈에 이해하도록 돕는 정보 중심 이미지. 이미지 안에는 글자, 로고, 확인되지 않은 수치나 인물을 넣지 않는다.`,
    },
  ];

  const fallbackSections = article.sections.length
    ? article.sections
    : [{ heading: "핵심 내용", paragraphs: [article.intro] }];

  for (let index = 1; index < count; index += 1) {
    const section = fallbackSections[(index - 1) % fallbackSections.length];
    plans.push({
      id: `image-${index + 1}`,
      order: index + 1,
      placement: `‘${section.heading}’ 소제목 뒤`,
      purpose: "본문 보조 이미지",
      section: section.heading,
      altText: `${topic} - ${section.heading} 설명 이미지`,
      brief: `‘${section.heading}’ 내용을 시각적으로 보조하는 사실 기반 도식 또는 현장 이미지. 원문에 없는 통계, 상표, 인물, 결과를 추가하지 않는다.`,
    });
  }

  return plans;
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  const source = haystack.toLocaleLowerCase("ko-KR");
  const target = needle.toLocaleLowerCase("ko-KR");
  let count = 0;
  let position = 0;
  while ((position = source.indexOf(target, position)) !== -1) {
    count += 1;
    position += target.length || 1;
  }
  return count;
}

function extractDuplicateSentences(text) {
  const sentences = normalizeText(text)
    .split(/(?<=[.!?。！？])\s+|\n+/u)
    .map((sentence) => sentence.replace(/\s+/gu, " ").trim())
    .filter((sentence) => sentence.length >= 22 && !BULLET_PATTERN.test(sentence));
  const seen = new Map();
  for (const sentence of sentences) {
    const key = sentence.toLocaleLowerCase("ko-KR");
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return [...seen.entries()].filter(([, count]) => count > 1).map(([sentence]) => sentence);
}

export function auditArticle(article, options = {}) {
  const targetLength = Number(options.targetLength) || 1500;
  const textLength = article.body.replace(/\s+/gu, "").length;
  const keywordCount = countOccurrences(article.fullText, article.primaryKeyword);
  const riskyClaims = [...new Set(article.fullText.match(RISKY_CLAIM_PATTERN) ?? [])];
  const longParagraphs = normalizeText(article.body)
    .split(/\n\s*\n/u)
    .filter((paragraph) => !paragraph.startsWith("## ") && paragraph.length > 420);
  const duplicateSentences = extractDuplicateSentences(article.body);
  const checks = [
    {
      id: "title",
      label: "제목 길이",
      status: article.title.length >= 12 && article.title.length <= 48 ? "pass" : "warn",
      detail: `${article.title.length}자 · 내부 권장 범위 12~48자`,
    },
    {
      id: "length",
      label: "본문 분량",
      status: textLength >= Math.round(targetLength * 0.75) ? "pass" : "warn",
      detail: `공백 제외 ${textLength.toLocaleString("ko-KR")}자 · 목표 ${targetLength.toLocaleString("ko-KR")}자`,
    },
    {
      id: "keyword",
      label: "대표 키워드",
      status: !article.primaryKeyword || (keywordCount >= 1 && keywordCount <= Math.max(6, Math.ceil(textLength / 500))) ? "pass" : "warn",
      detail: article.primaryKeyword ? `${keywordCount}회 사용 · 반복보다 문맥 적합성을 우선` : "대표 키워드가 비어 있음",
    },
    {
      id: "sections",
      label: "소제목 구조",
      status: article.sections.length >= 2 ? "pass" : "warn",
      detail: `${article.sections.length}개 소제목`,
    },
    {
      id: "sources",
      label: "근거 자료",
      status: article.sources.length > 0 ? "pass" : "warn",
      detail: article.sources.length ? `${article.sources.length}개 출처 기록` : "사실·수치가 있다면 공식 출처를 추가해야 함",
    },
    {
      id: "claims",
      label: "과장·보장 표현",
      status: riskyClaims.length === 0 ? "pass" : "warn",
      detail: riskyClaims.length ? `재검토: ${riskyClaims.join(", ")}` : "탐지된 고위험 표현 없음",
    },
    {
      id: "paragraphs",
      label: "모바일 문단",
      status: longParagraphs.length === 0 ? "pass" : "warn",
      detail: longParagraphs.length ? `420자를 넘는 문단 ${longParagraphs.length}개` : "긴 문단 없음",
    },
    {
      id: "duplicates",
      label: "문장 중복",
      status: duplicateSentences.length === 0 ? "pass" : "warn",
      detail: duplicateSentences.length ? `중복 의심 문장 ${duplicateSentences.length}개` : "긴 문장의 반복 없음",
    },
  ];

  const passed = checks.filter((check) => check.status === "pass").length;
  return {
    score: Math.round((passed / checks.length) * 100),
    checks,
    riskyClaims,
    longParagraphs,
    duplicateSentences,
    metrics: {
      textLength,
      keywordCount,
      sourceCount: article.sources.length,
      sectionCount: article.sections.length,
    },
  };
}

export function articleToMarkdown(article) {
  return [
    `# ${article.title}`,
    article.metaDescription ? `> ${article.metaDescription}` : "",
    article.body,
    article.tagLine,
  ].filter(Boolean).join("\n\n");
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function paragraphToHtml(paragraph) {
  const lines = paragraph.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length && lines.every((line) => BULLET_PATTERN.test(line))) {
    return `<ul>${lines.map((line) => `<li>${escapeHtml(line.replace(BULLET_PATTERN, ""))}</li>`).join("")}</ul>`;
  }
  return `<p>${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`;
}

export function articleToRichHtml(article) {
  const toc = createTableOfContents(article);
  const sections = article.sections.map((section, index) => [
    `<h2 id="${toc[index].anchor}">${escapeHtml(section.heading)}</h2>`,
    ...section.paragraphs.map(paragraphToHtml),
  ].join(""));

  return [
    `<article data-source="jobandkill-naver-blog-studio">`,
    `<h1>${escapeHtml(article.title)}</h1>`,
    article.intro ? paragraphToHtml(article.intro) : "",
    toc.length ? `<h2>이 글에서 확인할 내용</h2><ol>${toc.map((item) => `<li>${escapeHtml(item.label)}</li>`).join("")}</ol>` : "",
    ...sections,
    article.cta ? `<h2>다음 행동</h2>${paragraphToHtml(article.cta)}` : "",
    article.sources.length ? `<h2>참고자료</h2><ol>${article.sources.map((source) => `<li>${escapeHtml(source.label)}</li>`).join("")}</ol>` : "",
    article.tagLine ? `<p>${escapeHtml(article.tagLine)}</p>` : "",
    `</article>`,
  ].filter(Boolean).join("");
}

export function createPublishPackage(article, input = {}) {
  const images = createImagePlan(article, input.imageCount);
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    title: article.title,
    metaDescription: article.metaDescription,
    plainText: article.fullText,
    markdown: articleToMarkdown(article),
    richHtml: articleToRichHtml(article),
    tags: article.tags,
    sources: article.sources,
    tableOfContents: createTableOfContents(article),
    images,
    finalAction: "사용자가 네이버 편집기에서 내용과 공개 범위를 확인한 뒤 직접 발행",
    contentPolicy: { ...SAFETY_BOUNDARY },
  };
}

export function createQueueRecord(article, input = {}, now = new Date()) {
  const scheduledAt = normalizeText(input.scheduledAt);
  return {
    id: input.id || `post-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    title: article.title,
    topic: article.topic,
    status: POST_STATUSES[input.status] ? input.status : "review",
    scheduledAt,
    createdAt: input.createdAt || now.toISOString(),
    updatedAt: now.toISOString(),
    package: createPublishPackage(article, input),
  };
}

export function createCopyBlocks(article) {
  const sectionBlocks = article.sections.map((section, index) => ({
    id: `section-${index + 1}`,
    type: "section",
    label: section.heading,
    text: [`${section.heading}`, section.paragraphs.join("\n\n")].filter(Boolean).join("\n\n"),
  }));

  return [
    { id: "title", type: "title", label: "제목", shortcut: "Alt+1", text: article.title },
    { id: "intro", type: "intro", label: "도입부", shortcut: "Alt+2", text: article.intro },
    ...sectionBlocks,
    { id: "body", type: "body", label: "본문 전체", shortcut: "Alt+4", text: article.body },
    { id: "tags", type: "tags", label: "태그", shortcut: "Alt+5", text: article.tagLine },
    { id: "sources", type: "sources", label: "참고자료", shortcut: "Alt+6", text: article.sources.map((source) => source.label).join("\n") },
  ].filter((block) => block.text);
}
