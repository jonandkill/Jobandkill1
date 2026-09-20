"use client";

import { useMemo, useState } from "react";
import styles from "./OperationsDashboard.module.css";

export type ApprovalState = "검토 대기" | "수정 요청" | "승인 완료";

export interface TodayTask {
  id: string;
  time: string;
  title: string;
  detail: string;
  owner: string;
  status: "우선" | "진행 중" | "예정";
}

export interface KeywordCandidate {
  id: string;
  phrase: string;
  intent: "정보 탐색" | "비교·후기" | "상담·신청";
  opportunity: number;
  note: string;
}

export interface TrendSignal {
  id: string;
  keyword: string;
  score: number;
  direction: "상승" | "유지" | "주의";
  source: string;
  observedAt: string;
  status: "데모 데이터" | "연동됨" | "갱신 필요" | "연동 필요";
}

export interface ApprovalItem {
  id: string;
  title: string;
  channel: string;
  category: string;
  updatedAt: string;
  state: ApprovalState;
}

export interface FunnelStep {
  label: string;
  value: number;
  help: string;
}

export interface UpdateRecommendation {
  id: string;
  priority: "높음" | "보통" | "낮음";
  title: string;
  evidence: string;
  action: string;
}

export interface OperationsDashboardProps {
  tasks?: TodayTask[];
  keywords?: KeywordCandidate[];
  trends?: TrendSignal[];
  approvals?: ApprovalItem[];
  funnel?: FunnelStep[];
  recommendations?: UpdateRecommendation[];
  onOpenContent?: (id: string) => void;
  onOpenRecommendation?: (id: string) => void;
}

const initialTasks: TodayTask[] = [
  {
    id: "task-1",
    time: "09:30",
    title: "이번 주 키워드 3개 선정",
    detail: "수요·상담 연결 가능성·공식 채용 일정을 함께 확인합니다.",
    owner: "콘텐츠 기획",
    status: "우선",
  },
  {
    id: "task-2",
    time: "13:00",
    title: "블로그 초안 2건 검토",
    detail: "현대차 생산직 면접, 공기업 면접 답변 구조",
    owner: "승인함",
    status: "진행 중",
  },
  {
    id: "task-3",
    time: "17:00",
    title: "지난 주 글 성과 점검",
    detail: "노출은 높고 클릭이 낮은 글부터 개선합니다.",
    owner: "성과 분석",
    status: "예정",
  },
];

const initialKeywords: KeywordCandidate[] = [
  {
    id: "keyword-1",
    phrase: "현대자동차 생산직 면접",
    intent: "상담·신청",
    opportunity: 91,
    note: "모의면접·전자책으로 연결하기 좋음",
  },
  {
    id: "keyword-2",
    phrase: "공기업 면접 답변 예시",
    intent: "정보 탐색",
    opportunity: 84,
    note: "실전 답변 구조 콘텐츠에 적합",
  },
  {
    id: "keyword-3",
    phrase: "AI 면접 게임 연습",
    intent: "비교·후기",
    opportunity: 78,
    note: "연습 자료와 코칭 안내를 함께 제시",
  },
];

const initialTrends: TrendSignal[] = [
  {
    id: "trend-1",
    keyword: "현대자동차 생산직 면접",
    score: 82,
    direction: "상승",
    source: "Google Trends · 네이버 데이터랩",
    observedAt: "2026. 09. 20.",
    status: "데모 데이터",
  },
  {
    id: "trend-2",
    keyword: "공기업 면접",
    score: 74,
    direction: "유지",
    source: "네이버 데이터랩",
    observedAt: "2026. 09. 20.",
    status: "연동 필요",
  },
  {
    id: "trend-3",
    keyword: "AI 면접 준비",
    score: 68,
    direction: "주의",
    source: "Google Trends",
    observedAt: "2026. 09. 13.",
    status: "갱신 필요",
  },
];

const initialApprovals: ApprovalItem[] = [
  {
    id: "approval-1",
    title: "현대차 생산직 면접, 지원동기에서 놓치기 쉬운 한 가지",
    channel: "네이버 블로그",
    category: "신규 발행",
    updatedAt: "오늘 10:20",
    state: "검토 대기",
  },
  {
    id: "approval-2",
    title: "공기업 면접 답변은 경험을 이렇게 직무와 연결합니다",
    channel: "스레드 · 카드뉴스",
    category: "재활용",
    updatedAt: "오늘 09:40",
    state: "수정 요청",
  },
  {
    id: "approval-3",
    title: "AI 면접 게임별 연습 방법",
    channel: "유튜브 쇼츠",
    category: "재발행",
    updatedAt: "어제 18:10",
    state: "검토 대기",
  },
];

const initialFunnel: FunnelStep[] = [
  { label: "방문", value: 1420, help: "콘텐츠를 읽은 방문" },
  { label: "상담 신청", value: 96, help: "상담 신청서 제출" },
  { label: "상담 완료", value: 47, help: "실제 상담까지 완료" },
  { label: "결제 확인", value: 18, help: "환불 제외 결제" },
];

const initialRecommendations: UpdateRecommendation[] = [
  {
    id: "recommendation-1",
    priority: "높음",
    title: "노출 대비 클릭이 낮은 글의 제목·첫 문단을 고치세요",
    evidence: "노출 1,240회 · 클릭률 1.3% (데모 값)",
    action: "검색자가 가장 궁금해할 질문을 제목 앞부분에 넣고, 3줄 안에 답을 제시합니다.",
  },
  {
    id: "recommendation-2",
    priority: "보통",
    title: "‘공기업 면접’ 글에 연습 자료 연결을 추가하세요",
    evidence: "상담 신청 전환 2.1% (데모 값)",
    action: "답변 예시 다음에 무료 질문지와 맞춤 코칭 안내를 한 번만 자연스럽게 연결합니다.",
  },
  {
    id: "recommendation-3",
    priority: "낮음",
    title: "AI 면접 연습 글의 공식 정보 날짜를 갱신하세요",
    evidence: "마지막 검토 47일 전 (데모 값)",
    action: "서비스 제공사의 안내와 지원 기업의 채용 공고를 다시 확인한 뒤 변경 사항을 표시합니다.",
  },
];

const statusClass = (status: TodayTask["status"]) => {
  if (status === "우선") return styles.urgent;
  if (status === "진행 중") return styles.active;
  return styles.planned;
};

const priorityClass = (priority: UpdateRecommendation["priority"]) => {
  if (priority === "높음") return styles.priorityHigh;
  if (priority === "보통") return styles.priorityMedium;
  return styles.priorityLow;
};

const trendClass = (direction: TrendSignal["direction"]) => {
  if (direction === "상승") return styles.up;
  if (direction === "주의") return styles.caution;
  return styles.steady;
};

export function OperationsDashboard({
  tasks = initialTasks,
  keywords = initialKeywords,
  trends = initialTrends,
  approvals: suppliedApprovals = initialApprovals,
  funnel = initialFunnel,
  recommendations = initialRecommendations,
  onOpenContent,
  onOpenRecommendation,
}: OperationsDashboardProps) {
  const [approvals, setApprovals] = useState(suppliedApprovals);
  const [notice, setNotice] = useState("");
  const maxFunnelValue = useMemo(() => Math.max(...funnel.map((step) => step.value), 1), [funnel]);
  const waitingApprovals = approvals.filter((item) => item.state !== "승인 완료").length;

  const changeApproval = (id: string, state: ApprovalState) => {
    setApprovals((items) => items.map((item) => (item.id === id ? { ...item, state } : item)));
    setNotice(
      state === "승인 완료"
        ? "승인 상태를 화면에 반영했습니다. 실제 발행은 연결된 발행 단계에서 진행됩니다."
        : "수정 요청 상태를 화면에 반영했습니다."
    );
  };

  return (
    <main className={styles.dashboard} aria-labelledby="dashboard-title">
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>JOB&KILL CONTENT OS</p>
          <h1 id="dashboard-title">오늘, 검색 수요를 상담 성과로 연결하세요.</h1>
          <p className={styles.heroCopy}>
            키워드 선정부터 검토·발행·성과 개선까지 한 화면에서 우선순위를 확인합니다.
          </p>
        </div>
        <div className={styles.heroMeta}>
          <span className={styles.demoBadge}>예시 운영 화면</span>
          <p>데이터 연동 전에는 모든 수치가 데모 값으로 표시됩니다.</p>
        </div>
      </section>

      {notice ? (
        <p className={styles.notice} role="status" aria-live="polite">
          {notice}
        </p>
      ) : null}

      <section className={styles.summaryGrid} aria-label="오늘의 핵심 현황">
        <article className={styles.summaryCard}>
          <span>오늘 할 일</span>
          <strong>{tasks.length}건</strong>
          <p>우선순위부터 처리하면 됩니다.</p>
        </article>
        <article className={styles.summaryCard}>
          <span>검토·승인 대기</span>
          <strong>{waitingApprovals}건</strong>
          <p>콘텐츠를 열어 사실·경험·표현을 확인하세요.</p>
        </article>
        <article className={styles.summaryCard}>
          <span>이번 주 추천 주제</span>
          <strong>{keywords.length}개</strong>
          <p>검색 수요와 상품 연결 가능성을 함께 봅니다.</p>
        </article>
      </section>

      <div className={styles.primaryGrid}>
        <section className={styles.panel} aria-labelledby="today-work-title">
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.sectionLabel}>OPERATIONS</p>
              <h2 id="today-work-title">오늘의 작업</h2>
            </div>
            <span className={styles.dateLabel}>2026. 09. 20.</span>
          </div>
          <ol className={styles.taskList}>
            {tasks.map((task) => (
              <li className={styles.taskRow} key={task.id}>
                <time>{task.time}</time>
                <div className={styles.taskContent}>
                  <h3>{task.title}</h3>
                  <p>{task.detail}</p>
                  <span className={styles.owner}>{task.owner}</span>
                </div>
                <span className={`${styles.statePill} ${statusClass(task.status)}`}>{task.status}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className={styles.panel} aria-labelledby="keywords-title">
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.sectionLabel}>TOPIC OPPORTUNITY</p>
              <h2 id="keywords-title">키워드 후보</h2>
            </div>
            <span className={styles.helper}>선정 전 검토용</span>
          </div>
          <ul className={styles.keywordList}>
            {keywords.map((keyword) => (
              <li key={keyword.id}>
                <div className={styles.keywordTopline}>
                  <strong>{keyword.phrase}</strong>
                  <span className={styles.score}>{keyword.opportunity}</span>
                </div>
                <div className={styles.meter} aria-label={`기회 점수 ${keyword.opportunity}점`}>
                  <span style={{ width: `${keyword.opportunity}%` }} />
                </div>
                <div className={styles.keywordFoot}>
                  <span>{keyword.intent}</span>
                  <p>{keyword.note}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className={styles.panel} aria-labelledby="trend-title">
        <div className={styles.panelHeader}>
          <div>
            <p className={styles.sectionLabel}>SEARCH SIGNAL</p>
            <h2 id="trend-title">트렌드 신호</h2>
          </div>
          <p className={styles.dataNote}>점수는 각 데이터 원천의 상대 지표를 그대로 합산하지 않습니다.</p>
        </div>
        <div className={styles.trendGrid}>
          {trends.map((trend) => (
            <article className={styles.trendCard} key={trend.id}>
              <div className={styles.trendTitleRow}>
                <h3>{trend.keyword}</h3>
                <span className={`${styles.direction} ${trendClass(trend.direction)}`}>{trend.direction}</span>
              </div>
              <div className={styles.trendScoreRow}>
                <strong>{trend.score}</strong>
                <span>/ 100</span>
              </div>
              <dl className={styles.sourceMeta}>
                <div>
                  <dt>자료 원천</dt>
                  <dd>{trend.source}</dd>
                </div>
                <div>
                  <dt>관찰일</dt>
                  <dd>{trend.observedAt}</dd>
                </div>
              </dl>
              <span className={styles.dataState}>{trend.status}</span>
            </article>
          ))}
        </div>
      </section>

      <div className={styles.secondaryGrid}>
        <section className={styles.panel} aria-labelledby="approval-title">
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.sectionLabel}>REVIEW BEFORE PUBLISH</p>
              <h2 id="approval-title">승인함</h2>
            </div>
            <span className={styles.countBadge}>{waitingApprovals}건 남음</span>
          </div>
          <ul className={styles.approvalList}>
            {approvals.map((item) => (
              <li className={styles.approvalItem} key={item.id}>
                <div className={styles.approvalInfo}>
                  <span className={styles.channel}>{item.channel} · {item.category}</span>
                  <h3>{item.title}</h3>
                  <p>{item.updatedAt} · <span>{item.state}</span></p>
                </div>
                <div className={styles.approvalActions}>
                  <button type="button" className={styles.textButton} onClick={() => onOpenContent?.(item.id)}>
                    열기
                  </button>
                  {item.state !== "승인 완료" ? (
                    <>
                      <button type="button" className={styles.textButton} onClick={() => changeApproval(item.id, "수정 요청")}>
                        수정
                      </button>
                      <button type="button" className={styles.approveButton} onClick={() => changeApproval(item.id, "승인 완료")}>
                        승인
                      </button>
                    </>
                  ) : (
                    <span className={styles.approvedLabel}>승인됨</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.panel} aria-labelledby="funnel-title">
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.sectionLabel}>BUSINESS OUTCOME</p>
              <h2 id="funnel-title">성과 흐름</h2>
            </div>
            <span className={styles.helper}>데모 값</span>
          </div>
          <ol className={styles.funnelList}>
            {funnel.map((step, index) => {
              const previous = funnel[index - 1];
              const rate = previous ? Math.round((step.value / previous.value) * 1000) / 10 : null;
              return (
                <li key={step.label}>
                  <div className={styles.funnelLabelRow}>
                    <div>
                      <strong>{step.label}</strong>
                      <span>{step.help}</span>
                    </div>
                    <div className={styles.funnelNumber}>
                      <strong>{step.value.toLocaleString("ko-KR")}</strong>
                      {rate !== null ? <span>이전 단계 대비 {rate}%</span> : null}
                    </div>
                  </div>
                  <div className={styles.funnelTrack} aria-label={`${step.label} ${step.value.toLocaleString("ko-KR")}`}>
                    <span style={{ width: `${Math.max((step.value / maxFunnelValue) * 100, 7)}%` }} />
                  </div>
                </li>
              );
            })}
          </ol>
          <p className={styles.funnelCaption}>실제 값은 검색·예약·결제 데이터 연결 후 확정합니다.</p>
        </section>
      </div>

      <section className={styles.panel} aria-labelledby="recommendation-title">
        <div className={styles.panelHeader}>
          <div>
            <p className={styles.sectionLabel}>NEXT BEST ACTION</p>
            <h2 id="recommendation-title">업데이트 추천</h2>
          </div>
          <span className={styles.helper}>성과가 낮은 지점부터</span>
        </div>
        <ul className={styles.recommendationList}>
          {recommendations.map((recommendation) => (
            <li key={recommendation.id}>
              <span className={`${styles.priorityPill} ${priorityClass(recommendation.priority)}`}>{recommendation.priority}</span>
              <div>
                <h3>{recommendation.title}</h3>
                <p className={styles.evidence}>{recommendation.evidence}</p>
                <p>{recommendation.action}</p>
              </div>
              <button type="button" className={styles.recommendationButton} onClick={() => onOpenRecommendation?.(recommendation.id)}>
                개선안 보기
              </button>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
