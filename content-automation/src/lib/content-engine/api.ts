/** Framework-neutral facade for route handlers and workers. No HTTP or database coupling. */
import { Channel, ContentEngine, type Candidate, type ContentBrief, type ContentDraft, type Evidence, createContentBrief, createDeterministicDraft, runQualityChecks } from "./index";

export function createContentEngineApi(engine = new ContentEngine()) {
  return {
    addEvidence: ({ evidence }: { evidence: Evidence }) => ({ evidence: engine.addEvidence(evidence) }),
    createBrief: ({ candidate, evidenceIds, options }: { candidate: Candidate; evidenceIds?: string[]; options?: { id?: string; createdAt?: string } }) => ({ brief: createContentBrief(candidate, engine.listEvidence(evidenceIds), { ...options, evidenceIds }) }),
    createDraft: ({ brief, options }: { brief: ContentBrief; options?: Partial<Pick<ContentDraft, "id" | "title" | "body" | "claims" | "evidenceIds" | "createdAt">> }) => ({ draft: createDeterministicDraft(brief, options) }),
    createContent: ({ candidate, brief, draft }: { candidate: Candidate; brief: ContentBrief; draft: ContentDraft }) => ({ content: engine.createRecord(candidate, brief, draft) }),
    qualityCheck: ({ draft }: { draft: ContentDraft }) => ({ quality: runQualityChecks(draft, engine.listEvidence(draft.evidenceIds)) }),
    reviseContent: ({ contentId, draft, actor, changeNote }: { contentId: string; draft: ContentDraft; actor?: string; changeNote?: string }) => ({ content: engine.saveDraft(contentId, draft, { actor, changeNote }) }),
    requestChanges: ({ contentId, actor, reason }: { contentId: string; actor?: string; reason: string }) => ({ content: engine.requestChanges(contentId, { actor, reason }) }),
    approveContent: ({ contentId, actor, note }: { contentId: string; actor: string; note?: string }) => ({ content: engine.approve(contentId, { actor, note }) }),
    createChannelPack: ({ contentId, channels = Object.values(Channel) }: { contentId: string; channels?: Channel[] }) => ({ pack: engine.generateChannelPack(contentId, channels) }),
    markPublishReady: ({ contentId, channels }: { contentId: string; channels: Channel[] }) => ({ content: engine.markPublishReady(contentId, channels) }),
    getContent: ({ contentId }: { contentId: string }) => ({ content: engine.getRecord(contentId) }),
  };
}
