"use client";

import { useId, useMemo, useState } from "react";

import styles from "./ContentApprovalDetail.module.css";

export type ApprovalEvidence = {
  id: string;
  source: string;
  title: string;
  url?: string;
  publishedAt?: string;
  checkedAt?: string;
  reliability: "official" | "primary" | "reference" | "needs_review";
};

export type CitedClaim = {
  id: string;
  text: string;
  evidenceIds: string[];
  status: "verified" | "partially_verified" | "needs_review" | "unverified";
  note?: string;
};

export type ContentVersion = {
  id: string;
  label: string;
  createdAt: string;
  author: string;
  changeSummary: string;
  isCurrent?: boolean;
};

export type PublicationPreview = {
  channel: "blog" | "card_news" | "threads" | "shorts" | "newsletter" | "qa";
  label: string;
  content: string;
  status?: "ready" | "draft" | "blocked";
};

export type ContentApprovalDetailProps = {
  title: string;
  topic?: string;
  brief?: string;
  qualityScore?: number;
  evidence?: ApprovalEvidence[];
  claims?: CitedClaim[];
  versions?: ContentVersion[];
  publicationPreviews?: PublicationPreview[];
  initialProfessorNote?: string;
  onApprove?: (payload: { professorNote: string; versionId?: string }) => void | Promise<void>;
  onReturn?: (payload: { professorNote: string; versionId?: string }) => void | Promise<void>;
};

const statusLabel = {
  verified: "검증됨",
  partially_verified: "일부 확인",
  needs_review: "검토 필요",
  unverified: "근거 부족",
} as const;

const sourceLabel = {
  official: "공식 자료",
  primary: "원문·1차 자료",
  reference: "참고 자료",
  needs_review: "재확인 필요",
} as const;

const previewLabel = {
  ready: "발행 준비",
  draft: "초안",
  blocked: "보류",
} as const;

function countByStatus(claims: CitedClaim[]) {
  return claims.reduce(
    (result, claim) => {
      result[claim.status] += 1;
      return result;
    },
    { verified: 0, partially_verified: 0, needs_review: 0, unverified: 0 },
  );
}

export function ContentApprovalDetail({
  title,
  topic,
  brief,
  qualityScore,
  evidence = [],
  claims = [],
  versions = [],
  publicationPreviews = [],
  initialProfessorNote = "",
  onApprove,
  onReturn,
}: ContentApprovalDetailProps) {
  const noteId = useId();
  const [professorNote, setProfessorNote] = useState(initialProfessorNote);
  const [selectedVersionId, setSelectedVersionId] = useState(
    versions.find((version) => version.isCurrent)?.id ?? versions[0]?.id,
  );
  const [selectedChannel, setSelectedChannel] = useState(publicationPreviews[0]?.channel);
  const [actionState, setActionState] = useState<"idle" | "approving" | "returning" | "approved" | "returned">("idle");

  const counts = useMemo(() => countByStatus(claims), [claims]);
  const selectedPreview = publicationPreviews.find((preview) => preview.channel === selectedChannel);
  const selectedVersion = versions.find((version) => version.id === selectedVersionId);
  const allClaimsVerified = claims.length > 0 && counts.verified === claims.length;
  const reviewNeeded = counts.needs_review + counts.unverified;

  async function handleAction(action: "approve" | "return") {
    setActionState(action === "approve" ? "approving" : "returning");
    const payload = { professorNote: professorNote.trim(), versionId: selectedVersionId };

    try {
      if (action === "approve") {
        await onApprove?.(payload);
        setActionState("approved");
      } else {
        await onReturn?.(payload);
        setActionState("returned");
      }
    } catch {
      setActionState("idle");
    }
  }

  return (
    <section className={styles.detail} aria-labelledby="content-approval-title">
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>{topic ?? "콘텐츠 검토"}</p>
          <h2 id="content-approval-title">{title}</h2>
          {brief ? <p className={styles.brief}>{brief}</p> : null}
        </div>
        <div className={styles.headerMeta} aria-label="콘텐츠 검토 요약">
          {typeof qualityScore === "number" ? (
            <span className={styles.score}><strong>{qualityScore}</strong><span>/ 100</span> 품질 점검</span>
          ) : null}
          <span className={`${styles.readiness} ${reviewNeeded > 0 ? styles.review : styles.ready}`}>
            {reviewNeeded > 0 ? `확인 필요 ${reviewNeeded}건` : "발행 전 확인 완료"}
          </span>
        </div>
      </header>

      <div className={styles.workspace}>
        <div className={styles.mainColumn}>
          <section className={styles.panel} aria-labelledby="claims-heading">
            <div className={styles.panelHeading}>
              <div>
                <p className={styles.sectionKicker}>근거를 연결한 핵심 문장</p>
                <h3 id="claims-heading">인용·사실 확인</h3>
              </div>
              <span className={`${styles.factSummary} ${allClaimsVerified ? styles.verified : styles.pending}`}>
                {allClaimsVerified ? "모든 문장 확인" : `확인 완료 ${counts.verified}/${claims.length}`}
              </span>
            </div>

            {claims.length ? (
              <ol className={styles.claims}>
                {claims.map((claim) => (
                  <li className={styles.claim} key={claim.id}>
                    <div className={styles.claimText}>
                      <span className={`${styles.claimStatus} ${styles[claim.status]}`}>{statusLabel[claim.status]}</span>
                      <p>{claim.text}</p>
                      {claim.note ? <small>{claim.note}</small> : null}
                    </div>
                    <div className={styles.citations} aria-label="문장 근거">
                      {claim.evidenceIds.map((evidenceId) => {
                        const item = evidence.find((source) => source.id === evidenceId);
                        return item ? (
                          <a key={evidenceId} href={item.url ?? "#evidence"} target={item.url ? "_blank" : undefined} rel={item.url ? "noreferrer" : undefined}>
                            {item.source}
                          </a>
                        ) : (
                          <span key={evidenceId} className={styles.missingCitation}>근거 연결 필요</span>
                        );
                      })}
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className={styles.empty}>등록된 핵심 문장이 없습니다. 초안 생성 후 근거와 함께 이곳에서 검토합니다.</p>
            )}
          </section>

          <section className={styles.panel} aria-labelledby="publication-heading">
            <div className={styles.panelHeading}>
              <div>
                <p className={styles.sectionKicker}>원문에서 자동 확장</p>
                <h3 id="publication-heading">발행 묶음 미리보기</h3>
              </div>
              <span className={styles.channelCount}>{publicationPreviews.length}개 채널</span>
            </div>

            {publicationPreviews.length ? (
              <>
                <div className={styles.tabs} role="tablist" aria-label="발행 채널 선택">
                  {publicationPreviews.map((preview) => (
                    <button
                      className={preview.channel === selectedChannel ? styles.activeTab : undefined}
                      type="button"
                      key={preview.channel}
                      role="tab"
                      aria-selected={preview.channel === selectedChannel}
                      onClick={() => setSelectedChannel(preview.channel)}
                    >
                      {preview.label}
                    </button>
                  ))}
                </div>
                {selectedPreview ? (
                  <article className={styles.preview} role="tabpanel" aria-label={`${selectedPreview.label} 미리보기`}>
                    <div className={styles.previewTopline}>
                      <span>{selectedPreview.label}</span>
                      <span className={`${styles.previewState} ${styles[selectedPreview.status ?? "draft"]}`}>{previewLabel[selectedPreview.status ?? "draft"]}</span>
                    </div>
                    <p>{selectedPreview.content}</p>
                  </article>
                ) : null}
              </>
            ) : (
              <p className={styles.empty}>승인할 원문이 확정되면 블로그, 카드뉴스, 스레드, 쇼츠, 뉴스레터, 짧은 문답을 함께 생성합니다.</p>
            )}
          </section>
        </div>

        <aside className={styles.sideColumn} aria-label="검토 보조 정보">
          <section className={styles.panel} id="evidence">
            <div className={styles.panelHeading}>
              <div>
                <p className={styles.sectionKicker}>출처와 확인 시점</p>
                <h3>근거 자료</h3>
              </div>
              <span className={styles.evidenceCount}>{evidence.length}</span>
            </div>
            {evidence.length ? (
              <ul className={styles.evidenceList}>
                {evidence.map((item) => (
                  <li key={item.id}>
                    <span className={`${styles.sourceType} ${styles[item.reliability]}`}>{sourceLabel[item.reliability]}</span>
                    {item.url ? <a href={item.url} target="_blank" rel="noreferrer">{item.title}</a> : <strong>{item.title}</strong>}
                    <p>{item.source}{item.publishedAt ? ` · ${item.publishedAt}` : ""}</p>
                    {item.checkedAt ? <small>확인: {item.checkedAt}</small> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.empty}>등록된 근거 자료가 없습니다.</p>
            )}
          </section>

          <section className={styles.panel} aria-labelledby="history-heading">
            <div className={styles.panelHeading}>
              <div>
                <p className={styles.sectionKicker}>수정 이력</p>
                <h3 id="history-heading">버전 선택</h3>
              </div>
            </div>
            {versions.length ? (
              <ol className={styles.versions}>
                {versions.map((version) => (
                  <li key={version.id}>
                    <button
                      className={version.id === selectedVersionId ? styles.selectedVersion : undefined}
                      type="button"
                      aria-pressed={version.id === selectedVersionId}
                      onClick={() => setSelectedVersionId(version.id)}
                    >
                      <span>{version.label}{version.isCurrent ? " · 현재" : ""}</span>
                      <small>{version.createdAt} · {version.author}</small>
                      <em>{version.changeSummary}</em>
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <p className={styles.empty}>아직 저장된 수정 이력이 없습니다.</p>
            )}
          </section>

          <section className={styles.actionPanel} aria-labelledby="approval-heading">
            <p className={styles.sectionKicker}>교수님 검토 의견</p>
            <h3 id="approval-heading">승인 또는 보완 요청</h3>
            <label htmlFor={noteId}>수정 지시 또는 발행 메모</label>
            <textarea
              id={noteId}
              value={professorNote}
              onChange={(event) => setProfessorNote(event.target.value)}
              placeholder="예: 지원자의 실제 사례를 첫 문단에 넣고, 공식 공고 링크를 최신 자료로 교체해 주세요."
              rows={5}
            />
            {selectedVersion ? <p className={styles.selectedVersionText}>선택한 버전: {selectedVersion.label}</p> : null}
            <div className={styles.actions}>
              <button
                className={styles.returnButton}
                type="button"
                disabled={actionState === "approving" || actionState === "returning"}
                onClick={() => handleAction("return")}
              >
                {actionState === "returning" ? "보완 요청 중…" : "보완 요청"}
              </button>
              <button
                className={styles.approveButton}
                type="button"
                disabled={actionState === "approving" || actionState === "returning" || claims.some((claim) => claim.status === "unverified")}
                onClick={() => handleAction("approve")}
              >
                {actionState === "approving" ? "승인 처리 중…" : "승인하고 발행 묶음 확정"}
              </button>
            </div>
            {claims.some((claim) => claim.status === "unverified") ? <p className={styles.actionHelp}>근거 부족 문장을 확인하거나 제외해야 승인이 가능합니다.</p> : null}
            <p className={styles.liveStatus} aria-live="polite">
              {actionState === "approved" ? "승인되었습니다. 발행 묶음을 확정할 수 있습니다." : null}
              {actionState === "returned" ? "보완 요청이 저장되었습니다." : null}
            </p>
          </section>
        </aside>
      </div>
    </section>
  );
}
