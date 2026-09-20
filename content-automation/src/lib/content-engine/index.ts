/**
 * Evidence-first content domain service.
 *
 * It deliberately has no persistence, external AI, publishing call, or secret
 * dependency. Route handlers and workers can persist `snapshot()` using the
 * host application's repository without changing these domain rules.
 */

export const ContentStatus = {
  CANDIDATE: "candidate",
  EVIDENCE_READY: "evidence_ready",
  DRAFT: "draft",
  REVIEW_REQUIRED: "review_required",
  APPROVED: "approved",
  PUBLISH_READY: "publish_ready",
  PUBLISHED: "published",
  PERFORMANCE_COLLECTED: "performance_collected",
  IMPROVEMENT: "improvement",
} as const;

export type ContentStatus = (typeof ContentStatus)[keyof typeof ContentStatus];

export const Channel = {
  BLOG: "blog",
  CARD_NEWS: "card_news",
  THREADS: "threads",
  SHORTS: "shorts",
  NEWSLETTER: "newsletter",
  Q_AND_A: "q_and_a",
} as const;

export type Channel = (typeof Channel)[keyof typeof Channel];

export type Evidence = {
  id: string;
  claim: string;
  sourceUrl: string;
  verifiedAt: string;
  supportsClaimIds: string[];
  applicablePeriod?: string | null;
  sourceType?: "official" | "approved_internal_material" | "approved_case" | "unknown";
};

export type NextAction = { label: string; url: string; offerId?: string };

export type Candidate = {
  id: string;
  keyword: string;
  searchIntent: string;
  customerQuestion: string;
  nextAction: NextAction;
  title?: string;
  coreAnswer?: string;
  coreClaimIds?: string[];
  reasoning?: string;
  reasoningClaimIds?: string[];
  steps?: string[];
  stepClaimIds?: string[];
  caution?: string;
  faq?: string;
  notesForReviewer?: string[];
  trendEvidenceState?: "ready" | "missing" | "unavailable";
};

export type DraftSection = { key: string; heading: string; body: string; claimIds: string[] };
export type ContentBrief = {
  id: string;
  candidateId: string;
  keyword: string;
  customerQuestion: string;
  searchIntent: string;
  selectedEvidenceIds: string[];
  evidence: Evidence[];
  titleOptions: string[];
  sections: DraftSection[];
  outline: Array<Pick<DraftSection, "key" | "heading">>;
  nextAction: NextAction;
  notesForReviewer: string[];
  createdAt: string;
};

export type DraftClaim = {
  id: string;
  text: string;
  requiredEvidence: boolean;
  evidenceIds: string[];
};

export type ContentDraft = {
  id: string;
  briefId: string;
  title: string;
  sections: DraftSection[];
  body: string;
  claims: DraftClaim[];
  evidenceIds: string[];
  nextAction: NextAction;
  generation: { provider: "deterministic-template"; version: "1"; usesExternalAi: false };
  createdAt: string;
};

export type QualityIssue = {
  severity: "block" | "warning";
  code: string;
  message: string;
  claimId?: string;
  claim?: string;
  evidenceId?: string;
};

export type QualityCheck = {
  passed: boolean;
  blockingCount: number;
  warningCount: number;
  issues: QualityIssue[];
  checkedAt: string;
};

export type ContentVersion = {
  version: number;
  draft: ContentDraft;
  createdAt: string;
  createdBy: string;
  changeNote: string;
  approval: { actor: string; note: string; at: string; approvedVersion: number } | null;
  quality: QualityCheck;
};

export type ContentRecord = {
  id: string;
  candidate: Candidate;
  brief: ContentBrief;
  status: ContentStatus;
  currentVersion: number;
  versions: ContentVersion[];
  history: Array<Record<string, unknown>>;
};

export type ContentEngineSnapshot = { evidence: Evidence[]; records: ContentRecord[] };

const REVIEW_GATE_STATUSES = new Set<ContentStatus>([
  ContentStatus.REVIEW_REQUIRED,
  ContentStatus.APPROVED,
  ContentStatus.PUBLISH_READY,
]);

const BLOCKING_PATTERNS = [
  { code: "UNSUPPORTED_PASS_RATE", pattern: /(?:합격률|취업률)\s*\d+(?:\.\d+)?\s*%/u, message: "합격·취업률 수치는 근거가 필요합니다." },
  { code: "UNSUPPORTED_WEIGHT", pattern: /(?:평가\s*)?(?:가중치|비중)\s*(?:는|이|:)?\s*\d+(?:\.\d+)?\s*%/u, message: "평가 가중치·비중은 공식 근거가 필요합니다." },
  { code: "UNSUPPORTED_SEARCH_VOLUME", pattern: /(?:검색량|월간\s*검색)\s*(?:은|이|:)?\s*\d[\d,]*\s*(?:건|회)?/u, message: "검색량은 출처·조건·수집일을 남겨야 합니다." },
  { code: "UNSUPPORTED_HIRING_SCHEDULE", pattern: /\d{4}\s*년\s*\d{1,2}\s*월\s*(?:채용|공고|면접|접수)/u, message: "채용·전형 일정은 공식 원문과 적용 연도를 연결해야 합니다." },
] as const;

const DATE_OR_NUMBER_PATTERN = /(?:\d{4}[./-]\d{1,2}[./-]\d{1,2}|\d{1,2}\s*월\s*\d{1,2}\s*일|\d+(?:\.\d+)?\s*%|\d[\d,]*\s*(?:명|건|회|원))/u;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function nowIso(clock?: () => Date): string {
  return (clock?.() ?? new Date()).toISOString();
}

function normalizeText(value: unknown): string {
  return String(value ?? "").replace(/\s+/gu, " ").trim();
}

function slugify(value: string): string {
  const slug = normalizeText(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  return slug || "content";
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values.filter((value): value is T => Boolean(value)))];
}

function isValidUrl(value: unknown): value is string {
  try {
    const url = new URL(String(value));
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function requireEvidenceShape(evidence: Evidence): void {
  assert(normalizeText(evidence?.id), "근거에는 id가 필요합니다.");
  assert(normalizeText(evidence.claim), `근거 ${evidence.id}에는 claim이 필요합니다.`);
  assert(isValidUrl(evidence.sourceUrl), `근거 ${evidence.id}의 sourceUrl은 http(s) URL이어야 합니다.`);
  assert(normalizeText(evidence.verifiedAt), `근거 ${evidence.id}에는 verifiedAt이 필요합니다.`);
  assert(Array.isArray(evidence.supportsClaimIds), `근거 ${evidence.id}에는 supportsClaimIds 배열이 필요합니다.`);
}

function validateCandidate(candidate: Candidate): void {
  assert(normalizeText(candidate?.id), "후보에는 id가 필요합니다.");
  assert(normalizeText(candidate.keyword), "후보에는 keyword가 필요합니다.");
  assert(normalizeText(candidate.searchIntent), "후보에는 searchIntent가 필요합니다.");
  assert(normalizeText(candidate.customerQuestion), "후보에는 customerQuestion이 필요합니다.");
  assert(normalizeText(candidate.nextAction?.label), "후보에는 실제 다음 행동(nextAction.label)이 필요합니다.");
  assert(isValidUrl(candidate.nextAction?.url), "후보 nextAction.url은 http(s) URL이어야 합니다.");
}

function defaultSections(candidate: Candidate, evidence: Evidence[]): DraftSection[] {
  const firstFact = evidence[0]?.claim ?? "확인된 자료를 먼저 살펴보세요.";
  const steps = candidate.steps?.length
    ? candidate.steps
    : ["현재 상황을 한 문장으로 정리합니다.", "지원 직무에 필요한 행동으로 연결합니다.", "제출 전 사실과 표현을 점검합니다."];

  return [
    { key: "answer", heading: "먼저 답하면", body: candidate.coreAnswer ?? firstFact, claimIds: candidate.coreClaimIds ?? [] },
    { key: "why", heading: "왜 이 순서가 필요한가", body: candidate.reasoning ?? "검색한 질문에 먼저 답한 뒤, 실제 적용 방법을 제시해야 합니다.", claimIds: candidate.reasoningClaimIds ?? [] },
    { key: "steps", heading: "바로 적용하는 순서", body: steps.map((step, index) => `${index + 1}. ${step}`).join("\n"), claimIds: candidate.stepClaimIds ?? [] },
    { key: "caution", heading: "주의할 점", body: candidate.caution ?? "근거가 없는 일정·수치·후기·합격 사례는 넣지 않습니다.", claimIds: [] },
    { key: "faq", heading: "자주 묻는 질문", body: candidate.faq ?? `Q. ${candidate.customerQuestion}\nA. 내 상황에 맞는 자료와 경험을 먼저 정리한 뒤 적용하세요.`, claimIds: [] },
  ];
}

function versionBody(brief: ContentBrief): string {
  return brief.sections.map((section) => `## ${section.heading}\n\n${section.body}`).join("\n\n");
}

function issue(severity: QualityIssue["severity"], code: string, message: string, details: Omit<QualityIssue, "severity" | "code" | "message"> = {}): QualityIssue {
  return { severity, code, message, ...details };
}

function referencedEvidenceIds(claims: DraftClaim[]): string[] {
  return unique(claims.flatMap((claim) => claim.evidenceIds ?? []));
}

/** Create a writing brief that makes all source material and review gaps visible. */
export function createContentBrief(candidate: Candidate, evidence: Evidence[] = [], options: { id?: string; evidenceIds?: string[]; createdAt?: string } = {}): ContentBrief {
  validateCandidate(candidate);
  evidence.forEach(requireEvidenceShape);
  const selectedEvidenceIds = unique(options.evidenceIds ?? evidence.map((item) => item.id));
  const selectedEvidence = evidence.filter((item) => selectedEvidenceIds.includes(item.id));
  const sections = defaultSections(candidate, selectedEvidence);
  const titleOptions = unique([
    candidate.title ?? "",
    `${normalizeText(candidate.keyword)}: ${normalizeText(candidate.customerQuestion)}`,
    `${normalizeText(candidate.keyword)}를 준비할 때 먼저 확인할 ${candidate.coreAnswer ? "핵심" : "사항"}`,
  ]).slice(0, 3);

  return {
    id: options.id ?? `brief_${slugify(candidate.id)}`,
    candidateId: candidate.id,
    keyword: candidate.keyword,
    customerQuestion: candidate.customerQuestion,
    searchIntent: candidate.searchIntent,
    selectedEvidenceIds,
    evidence: clone(selectedEvidence),
    titleOptions,
    sections,
    outline: sections.map(({ key, heading }) => ({ key, heading })),
    nextAction: clone(candidate.nextAction),
    notesForReviewer: unique([
      ...(candidate.notesForReviewer ?? []),
      selectedEvidence.length ? "" : "연결된 근거가 없습니다. 핵심 사실을 추가한 뒤 검토해야 합니다.",
      candidate.trendEvidenceState === "missing" ? "추세 자료가 미수집 상태입니다. 수요 수치로 표현하지 않습니다." : "",
    ]),
    createdAt: options.createdAt ?? new Date().toISOString(),
  };
}

/** Safe fallback when no AI provider has been deliberately configured. */
export function createDeterministicDraft(brief: ContentBrief, options: Partial<Pick<ContentDraft, "id" | "title" | "body" | "claims" | "evidenceIds" | "createdAt">> = {}): ContentDraft {
  assert(brief?.id, "brief가 필요합니다.");
  const claims = options.claims ?? brief.sections
    .filter((section) => section.claimIds.length)
    .flatMap((section) => section.claimIds.map((id): DraftClaim => ({
      id,
      text: section.body,
      requiredEvidence: true,
      evidenceIds: brief.evidence.filter((source) => source.supportsClaimIds.includes(id)).map((source) => source.id),
    })));
  return {
    id: options.id ?? `draft_${slugify(brief.id)}`,
    briefId: brief.id,
    title: options.title ?? brief.titleOptions[0] ?? brief.keyword,
    sections: clone(brief.sections),
    body: options.body ?? versionBody(brief),
    claims: clone(claims),
    evidenceIds: unique(options.evidenceIds ?? [...brief.selectedEvidenceIds, ...referencedEvidenceIds(claims)]),
    nextAction: clone(brief.nextAction),
    generation: { provider: "deterministic-template", version: "1", usesExternalAi: false },
    createdAt: options.createdAt ?? new Date().toISOString(),
  };
}

/** Block the approval of unsupported claims, invented facts, or invalid CTAs. */
export function runQualityChecks(draft: ContentDraft, evidence: Evidence[] = [], options: { checkedAt?: string } = {}): QualityCheck {
  assert(draft?.title, "검수할 원고 제목이 필요합니다.");
  const issues: QualityIssue[] = [];
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));
  const attachedIds = new Set(draft.evidenceIds ?? []);
  const body = `${draft.title}\n${draft.body ?? ""}`;

  for (const claim of draft.claims ?? []) {
    if (!normalizeText(claim.id)) {
      issues.push(issue("block", "CLAIM_ID_MISSING", "주장 id가 없습니다."));
      continue;
    }
    if (!claim.requiredEvidence) continue;
    if (!claim.evidenceIds?.length) {
      issues.push(issue("block", "CLAIM_WITHOUT_EVIDENCE", "근거가 필요한 주장에 연결된 근거가 없습니다.", { claimId: claim.id, claim: claim.text }));
      continue;
    }
    for (const evidenceId of claim.evidenceIds) {
      const source = evidenceById.get(evidenceId);
      if (!source) issues.push(issue("block", "EVIDENCE_NOT_FOUND", "연결된 근거를 찾을 수 없습니다.", { claimId: claim.id, evidenceId }));
      else if (!attachedIds.has(evidenceId)) issues.push(issue("block", "EVIDENCE_NOT_ATTACHED", "주장 근거가 원고에 첨부되지 않았습니다.", { claimId: claim.id, evidenceId }));
      else if (!source.supportsClaimIds.includes(claim.id)) issues.push(issue("block", "EVIDENCE_DOES_NOT_SUPPORT_CLAIM", "근거가 이 주장을 지원하도록 등록되지 않았습니다.", { claimId: claim.id, evidenceId }));
    }
  }

  for (const evidenceId of attachedIds) {
    const source = evidenceById.get(evidenceId);
    if (!source) issues.push(issue("block", "ATTACHED_EVIDENCE_NOT_FOUND", "첨부 근거를 찾을 수 없습니다.", { evidenceId }));
    else if (!isValidUrl(source.sourceUrl) || !normalizeText(source.verifiedAt)) issues.push(issue("block", "EVIDENCE_METADATA_INCOMPLETE", "근거에는 원문 URL과 확인일이 필요합니다.", { evidenceId }));
  }

  for (const rule of BLOCKING_PATTERNS) {
    if (!rule.pattern.test(body)) continue;
    const hasSourceBackedClaim = (draft.claims ?? []).some((claim) => claim.evidenceIds.some((id) => evidenceById.has(id)) && normalizeText(claim.text).length > 0);
    if (!hasSourceBackedClaim) issues.push(issue("block", rule.code, rule.message));
  }
  if (DATE_OR_NUMBER_PATTERN.test(body) && !(draft.claims ?? []).length) {
    issues.push(issue("warning", "UNTRACKED_FACTUAL_TOKEN", "날짜·숫자가 있으나 주장·근거 연결이 없습니다. 사실 여부를 검토하세요."));
  }
  if (!normalizeText(draft.nextAction?.label) || !isValidUrl(draft.nextAction?.url)) issues.push(issue("block", "INVALID_NEXT_ACTION", "실제 운영 중인 다음 행동의 문구와 URL이 필요합니다."));
  if (/(?:합격 보장|무조건 합격|100%\s*합격)/u.test(body)) issues.push(issue("block", "GUARANTEED_OUTCOME", "합격을 보장하는 표현은 사용할 수 없습니다."));
  if (!normalizeText(draft.body)) issues.push(issue("block", "EMPTY_BODY", "원고 본문이 비어 있습니다."));

  const blockingCount = issues.filter((item) => item.severity === "block").length;
  return { passed: blockingCount === 0, blockingCount, warningCount: issues.filter((item) => item.severity === "warning").length, issues, checkedAt: options.checkedAt ?? new Date().toISOString() };
}

export class ContentEngine {
  private readonly clock: () => Date;
  private readonly idFactory: (prefix: string) => string;
  private readonly evidence = new Map<string, Evidence>();
  private readonly records = new Map<string, ContentRecord>();

  constructor(options: { clock?: () => Date; idFactory?: (prefix: string) => string } = {}) {
    this.clock = options.clock ?? (() => new Date());
    this.idFactory = options.idFactory ?? ((prefix) => `${prefix}_${crypto.randomUUID()}`);
  }

  addEvidence(evidence: Evidence): Evidence {
    requireEvidenceShape(evidence);
    this.evidence.set(evidence.id, clone(evidence));
    return clone(evidence);
  }

  listEvidence(ids?: string[]): Evidence[] {
    const filter = ids ? new Set(ids) : undefined;
    return [...this.evidence.values()].filter((source) => !filter || filter.has(source.id)).map(clone);
  }

  createRecord(candidate: Candidate, brief: ContentBrief, draft: ContentDraft): ContentRecord {
    validateCandidate(candidate);
    assert(brief?.candidateId === candidate.id, "brief와 후보가 일치하지 않습니다.");
    assert(draft?.briefId === brief.id, "draft와 brief가 일치하지 않습니다.");
    const createdAt = nowIso(this.clock);
    const record: ContentRecord = {
      id: this.idFactory("content"), candidate: clone(candidate), brief: clone(brief), status: ContentStatus.REVIEW_REQUIRED, currentVersion: 1,
      versions: [{ version: 1, draft: clone(draft), createdAt, createdBy: "system", changeNote: "최초 초안", approval: null, quality: runQualityChecks(draft, this.listEvidence(draft.evidenceIds), { checkedAt: createdAt }) }],
      history: [{ at: createdAt, type: "draft_created", version: 1 }],
    };
    this.records.set(record.id, record);
    return clone(record);
  }

  saveDraft(recordId: string, draft: ContentDraft, options: { actor?: string; changeNote?: string } = {}): ContentRecord {
    const record = this.record(recordId);
    assert(draft?.briefId === record.brief.id, "이 콘텐츠의 brief를 기준으로 한 원고만 저장할 수 있습니다.");
    const oldVersion = this.currentVersion(record);
    const version = record.currentVersion + 1;
    const createdAt = nowIso(this.clock);
    record.currentVersion = version;
    record.status = ContentStatus.REVIEW_REQUIRED;
    record.versions.push({ version, draft: clone(draft), createdAt, createdBy: options.actor ?? "editor", changeNote: options.changeNote ?? "원고 수정", approval: null, quality: runQualityChecks(draft, this.listEvidence(draft.evidenceIds), { checkedAt: createdAt }) });
    record.history.push({ at: createdAt, type: "draft_revised", fromVersion: oldVersion.version, version, actor: options.actor ?? "editor", changeNote: options.changeNote ?? "원고 수정" });
    return clone(record);
  }

  requestChanges(recordId: string, request: { actor?: string; reason: string }): ContentRecord {
    assert(normalizeText(request.reason), "수정 요청 사유가 필요합니다.");
    const record = this.record(recordId);
    assert(REVIEW_GATE_STATUSES.has(record.status), "검토 가능한 콘텐츠 상태가 아닙니다.");
    record.status = ContentStatus.REVIEW_REQUIRED;
    record.history.push({ at: nowIso(this.clock), type: "changes_requested", version: record.currentVersion, actor: request.actor ?? "reviewer", reason: request.reason });
    return clone(record);
  }

  approve(recordId: string, approval: { actor: string; note?: string }): ContentRecord {
    assert(normalizeText(approval.actor), "승인자 이름이 필요합니다.");
    const record = this.record(recordId);
    const version = this.currentVersion(record);
    const quality = runQualityChecks(version.draft, this.listEvidence(version.draft.evidenceIds), { checkedAt: nowIso(this.clock) });
    assert(quality.passed, `승인할 수 없습니다: ${quality.issues.filter((item) => item.severity === "block").map((item) => item.code).join(", ")}`);
    const at = nowIso(this.clock);
    version.quality = quality;
    version.approval = { actor: approval.actor, note: approval.note ?? "", at, approvedVersion: version.version };
    record.status = ContentStatus.APPROVED;
    record.history.push({ at, type: "approved", version: version.version, actor: approval.actor, note: approval.note ?? "" });
    return clone(record);
  }

  markPublishReady(recordId: string, channels: Channel[]): ContentRecord {
    const record = this.record(recordId);
    assert(record.status === ContentStatus.APPROVED, "승인된 현재 버전만 발행 준비할 수 있습니다.");
    assert(channels.length > 0, "발행 준비할 채널을 하나 이상 선택해야 합니다.");
    record.status = ContentStatus.PUBLISH_READY;
    record.history.push({ at: nowIso(this.clock), type: "publish_ready", version: record.currentVersion, channels: [...channels] });
    return clone(record);
  }

  getRecord(recordId: string): ContentRecord { return clone(this.record(recordId)); }

  getApprovedVersion(recordId: string): ContentVersion {
    const version = this.currentVersion(this.record(recordId));
    assert(version.approval?.approvedVersion === version.version, "현재 원고 버전이 승인되지 않았습니다.");
    return clone(version);
  }

  generateChannelPack(recordId: string, channels: Channel[] = Object.values(Channel)): ChannelPack {
    const record = this.record(recordId);
    const version = this.getApprovedVersion(recordId);
    return generateChannelPack({ contentId: record.id, version: version.version, draft: version.draft, evidence: this.listEvidence(version.draft.evidenceIds), channels, generatedAt: nowIso(this.clock) });
  }

  snapshot(): ContentEngineSnapshot { return { evidence: this.listEvidence(), records: [...this.records.values()].map(clone) }; }

  static fromSnapshot(snapshot: ContentEngineSnapshot, options: { clock?: () => Date; idFactory?: (prefix: string) => string } = {}): ContentEngine {
    const engine = new ContentEngine(options);
    snapshot.evidence.forEach((source) => engine.addEvidence(source));
    snapshot.records.forEach((record) => engine.records.set(record.id, clone(record)));
    return engine;
  }

  private record(id: string): ContentRecord { const record = this.records.get(id); assert(record, `콘텐츠를 찾을 수 없습니다: ${id}`); return record; }
  private currentVersion(record: ContentRecord): ContentVersion { const version = record.versions.find((item) => item.version === record.currentVersion); assert(version, "현재 원고 버전을 찾을 수 없습니다."); return version; }
}

export type ChannelPack = {
  id: string;
  source: { contentId: string; approvedVersion: number };
  generation: { provider: "deterministic-template"; version: "1"; usesExternalAi: false };
  generatedAt: string;
  assets: Partial<Record<"blog" | "cardNews" | "threads" | "shorts" | "newsletter" | "qAndA", unknown>>;
};

function section(draft: ContentDraft, key: string, fallback = ""): string { return normalizeText(draft.sections.find((item) => item.key === key)?.body ?? fallback); }
function sentences(value: string): string[] { return normalizeText(value).split(/(?<=[.!?])\s+/u).filter(Boolean); }
function citations(evidence: Evidence[]): string[] { return evidence.map((source, index) => `${index + 1}. ${source.claim} — ${source.sourceUrl} (확인일 ${source.verifiedAt})`); }

/** Produce per-channel writing assets only from an already approved version. */
export function generateChannelPack(input: { contentId: string; version: number; draft: ContentDraft; evidence?: Evidence[]; channels?: Channel[]; generatedAt?: string }): ChannelPack {
  const { contentId, version, draft, evidence = [], channels = Object.values(Channel), generatedAt = new Date().toISOString() } = input;
  assert(contentId, "contentId가 필요합니다.");
  assert(Number.isInteger(version) && version > 0, "승인된 version이 필요합니다.");
  assert(draft?.title && draft?.body, "승인된 draft가 필요합니다.");
  unique(channels).forEach((channel) => assert(Object.values(Channel).includes(channel), `지원하지 않는 채널입니다: ${channel}`));
  const answer = section(draft, "answer", draft.body);
  const why = section(draft, "why");
  const steps = section(draft, "steps");
  const caution = section(draft, "caution");
  const action = draft.nextAction;
  const sourceNotes = citations(evidence);
  const assets: ChannelPack["assets"] = {};

  if (channels.includes(Channel.BLOG)) assets.blog = { title: draft.title, body: `${draft.body}\n\n## 다음 행동\n\n[${action.label}](${action.url})${sourceNotes.length ? `\n\n## 근거\n\n${sourceNotes.join("\n")}` : ""}`, citations: sourceNotes };
  if (channels.includes(Channel.CARD_NEWS)) assets.cardNews = { caption: `${draft.title}\n\n${answer}\n\n${action.label}: ${action.url}`, slides: [
    { order: 1, role: "hook", text: draft.title }, { order: 2, role: "answer", text: answer },
    { order: 3, role: "reason", text: why || "왜 이 질문을 먼저 정리해야 하는지 확인합니다." }, { order: 4, role: "steps", text: steps || "내 상황에 맞는 행동을 순서대로 적용합니다." },
    { order: 5, role: "caution_and_cta", text: `${caution || "사실이 확인되지 않은 표현은 사용하지 않습니다."}\n\n${action.label}` },
  ] };
  if (channels.includes(Channel.THREADS)) assets.threads = { posts: [
    `${draft.title}\n\n${answer}`, why || "좋은 답변은 내 경험을 지원 직무에서 필요한 행동으로 연결하는 데서 시작합니다.",
    steps || "1. 경험을 정리합니다.\n2. 필요한 행동과 연결합니다.\n3. 사실을 점검합니다.", `${caution || "근거 없는 일정·수치·후기는 넣지 않습니다."}\n\n${action.label}: ${action.url}`,
  ] };
  if (channels.includes(Channel.SHORTS)) assets.shorts = { durationTargetSeconds: 35, script: [
    { order: 1, seconds: "0-4", type: "hook", line: `${draft.title} 때문에 막힌다면, 이 순서부터 바꿔보세요.` },
    { order: 2, seconds: "4-10", type: "common_mistake", line: `흔한 실수는 ${sentences(caution)[0] || "검색한 질문에 바로 답하지 않고 설명부터 길게 시작하는 것"}입니다.` },
    { order: 3, seconds: "10-25", type: "correction", line: `${answer}\n${steps}` }, { order: 4, seconds: "25-32", type: "why", line: why || "이렇게 하면 경험과 직무의 연결이 더 분명해집니다." },
    { order: 5, seconds: "32-35", type: "cta", line: `${action.label}은 프로필 또는 안내 링크에서 확인하세요.` },
  ], captions: [draft.title, answer, action.label] };
  if (channels.includes(Channel.NEWSLETTER)) assets.newsletter = { subject: `[잡앤킬 실전 팁] ${draft.title}`, preview: sentences(answer)[0] ?? draft.title, body: `${draft.title}\n\n${answer}\n\n${why}\n\n${steps}\n\n${caution}\n\n${action.label}: ${action.url}`, requiresRecipientConsent: true };
  if (channels.includes(Channel.Q_AND_A)) assets.qAndA = { question: draft.title, answer: [answer, steps, caution].filter(Boolean).join("\n\n"), relatedAction: clone(action), sourceContent: { contentId, version } };
  return { id: `pack_${contentId}_v${version}`, source: { contentId, approvedVersion: version }, generation: { provider: "deterministic-template", version: "1", usesExternalAi: false }, generatedAt, assets };
}
