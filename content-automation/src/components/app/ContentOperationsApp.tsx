"use client";

import { useState } from "react";
import {
  ContentApprovalDetail,
  type ApprovalEvidence,
  type CitedClaim,
  type ContentVersion,
  type PublicationPreview,
} from "@/components/approval/ContentApprovalDetail";
import { OperationsDashboard } from "@/components/dashboard/OperationsDashboard";
import styles from "./ContentOperationsApp.module.css";

const evidence: ApprovalEvidence[] = [
  { id: "ev-google", source: "Google Search Central", title: "Google Trends 활용 가이드", url: "https://developers.google.com/search/docs/monitor-debug/trends-start", checkedAt: "2026-09-20", reliability: "official" },
  { id: "ev-naver", source: "네이버 Developers", title: "통합 검색어 트렌드 API", url: "https://developers.naver.com/docs/serviceapi/datalab/search/search.md", checkedAt: "2026-09-20", reliability: "official" },
  { id: "ev-ops", source: "잡앤킬 승인 자료", title: "AI 면접 답변 시간 점검표", checkedAt: "2026-09-20", reliability: "primary" },
];

const claims: CitedClaim[] = [
  { id: "claim-1", text: "짧은 답변은 외운 문장을 줄이는 일이 아니라, 결론과 근거를 먼저 말하는 순서를 만드는 일입니다.", evidenceIds: ["ev-ops"], status: "verified" },
  { id: "claim-2", text: "검색 추세는 답변 주제와 발행 시점의 우선순위를 정하는 자료이며, 특정 검색 순위를 보장하지 않습니다.", evidenceIds: ["ev-google", "ev-naver"], status: "verified" },
  { id: "claim-3", text: "연관 질문은 자주 묻는 질문과 다음 콘텐츠 후보에 반영하되, 무관한 단어를 나열하지 않습니다.", evidenceIds: ["ev-google"], status: "verified" },
];

const versions: ContentVersion[] = [
  { id: "version-3", label: "검토본 3", createdAt: "2026-09-20 18:20", author: "잡앤킬 콘텐츠 운영", changeSummary: "답변 예시와 공식 근거 연결을 보완했습니다.", isCurrent: true },
  { id: "version-2", label: "초안 2", createdAt: "2026-09-20 17:40", author: "잡앤킬 콘텐츠 운영", changeSummary: "검색 의도와 질문 흐름을 정리했습니다." },
];

const publicationPreviews: PublicationPreview[] = [
  { channel: "blog", label: "블로그", status: "ready", content: "AI 면접 답변이 길어지는 이유는 말할 내용이 많아서가 아닙니다. 결론·근거·경험을 어떤 순서로 꺼내야 하는지 정하지 않았기 때문입니다." },
  { channel: "card_news", label: "카드뉴스", status: "ready", content: "한 장면에 한 메시지만: 답변이 길어질 때는 ‘결론 한 문장 → 경험 한 장면 → 직무 연결 한 문장’으로 줄여 보세요." },
  { channel: "threads", label: "Threads", status: "ready", content: "AI 면접에서 말이 길어지는 사람은 대개 생각이 없는 게 아니라, 말의 출구가 너무 많습니다. 먼저 결론을 한 줄로 고정해야 합니다." },
  { channel: "shorts", label: "쇼츠", status: "ready", content: "‘저는 책임감이 강합니다’라고 말하면 20초를 쓰게 됩니다. ‘납기 하루 전 오류를 발견해 체크표를 다시 만들었습니다’처럼 장면부터 말해 보세요." },
  { channel: "newsletter", label: "뉴스레터", status: "draft", content: "이번 주 연습: 내 경험 하나를 45초 답변으로 바꾸는 세 문장 구조를 확인해 보세요." },
  { channel: "qa", label: "짧은 문답", status: "ready", content: "Q. 답변 시간이 계속 넘쳐요. A. 경험을 하나만 고르고, 결론 문장을 맨 앞에 놓으세요." },
];

export function ContentOperationsApp() {
  const [section, setSection] = useState<"operations" | "approval" | "connections">("operations");
  const [notice, setNotice] = useState("데모 화면입니다. 실제 계정·게시 권한은 아직 연결되지 않았습니다.");

  return (
    <main className={styles.app}>
      <header className={styles.topbar}>
        <a className={styles.brand} href="#operations" aria-label="JOB&KILL 콘텐츠 운영 첫 화면"><span>JOB&KILL</span><strong>콘텐츠 운영</strong></a>
        <nav aria-label="운영 메뉴">
          <button type="button" className={section === "operations" ? styles.activeNav : undefined} onClick={() => setSection("operations")}>오늘의 운영</button>
          <button type="button" className={section === "approval" ? styles.activeNav : undefined} onClick={() => setSection("approval")}>검토·승인</button>
          <button type="button" className={section === "connections" ? styles.activeNav : undefined} onClick={() => setSection("connections")}>연결 설정</button>
        </nav>
        <span className={styles.status}>검토 중심 운영</span>
      </header>
      <div className={styles.notice} role="status">{notice}</div>
      {section === "operations" ? <section id="operations" aria-label="오늘의 콘텐츠 운영"><OperationsDashboard /></section> : null}
      {section === "approval" ? (
        <section className={styles.approvalPage} aria-label="콘텐츠 검토와 승인">
          <ContentApprovalDetail
            title="AI 면접 답변이 길어질 때, 경험을 45초 안에 설명하는 법"
            topic="AI 면접 · 답변 연습"
            brief="검색자의 핵심 질문에 먼저 답하고, 실제 연습표와 연결하는 발행 준비 원고입니다."
            qualityScore={92}
            evidence={evidence}
            claims={claims}
            versions={versions}
            publicationPreviews={publicationPreviews}
            initialProfessorNote="경험 예시는 실제 상담 사례와 구분해 설명용 예시로 표기해 주세요."
            onApprove={({ versionId }) => setNotice((versionId ?? "현재") + " 버전을 승인 대기로 표시했습니다. 실제 발행은 외부 채널 확인 후 진행됩니다.")}
            onReturn={({ versionId }) => setNotice((versionId ?? "현재") + " 버전을 수정 요청으로 돌렸습니다. 교수님 메모는 작업 기록에 남길 수 있습니다.")}
          />
        </section>
      ) : null}
      {section === "connections" ? (
        <section className={styles.connections} aria-labelledby="connections-title">
          <p className={styles.eyebrow}>외부 데이터와 게시 채널</p>
          <h1 id="connections-title">연결 전에는 완료로 표시하지 않습니다.</h1>
          <p>네이버 데이터랩은 서버 환경변수 연결을 지원하고, Google Trends는 공식 CSV 가져오기 방식으로 시작합니다. 네이버 블로그·기존 콘텐츠 자동화·영상 스튜디오는 승인 원고와 근거 목록을 전달하는 공통 형식으로 연결 준비 상태입니다.</p>
          <ul>
            <li><strong>네이버 데이터랩</strong><span>인증정보 미입력 · 서버에서만 처리</span></li>
            <li><strong>Google Trends</strong><span>공식 내보내기 CSV 가져오기 필요</span></li>
            <li><strong>네이버 블로그 통계</strong><span>미연결 · 게시물별 검색 노출 지표는 측정하지 않음</span></li>
            <li><strong>기존 콘텐츠·영상 시스템</strong><span>연결 준비 · 실제 게시 권한 미설정</span></li>
          </ul>
        </section>
      ) : null}
    </main>
  );
}
