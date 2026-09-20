/**
 * Stable cross-product boundary for the existing Naver content automation
 * project and jobkill-video-studio. This app does not assume either project
 * is installed or authenticated in this workspace.
 */
export type IntegrationPayload = {
  topicId: string;
  approvedContentVersionId: string;
  sourceEvidenceIds: string[];
  offerId?: string;
  targetChannels: Array<"blog" | "threads" | "shorts" | "card_news" | "newsletter" | "qa">;
};

export type IntegrationStatus = "not_configured" | "ready" | "failed";

export type IntegrationTarget = {
  id: "naver-content-automation" | "jobkill-video-studio";
  label: string;
  status: IntegrationStatus;
  acceptedPayload: "IntegrationPayload";
};

export const integrationTargets: IntegrationTarget[] = [
  {
    id: "naver-content-automation",
    label: "기존 네이버 콘텐츠 자동화",
    status: "not_configured",
    acceptedPayload: "IntegrationPayload",
  },
  {
    id: "jobkill-video-studio",
    label: "JOB&KILL 영상 스튜디오",
    status: "not_configured",
    acceptedPayload: "IntegrationPayload",
  },
];
