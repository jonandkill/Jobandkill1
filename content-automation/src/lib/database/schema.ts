import type {
  ApprovalStatus,
  ContentStatus,
  PublicationStatus,
} from './types';

export const CONTENT_AUTOMATION_SCHEMA_VERSION = 1;

/**
 * Application-level workflow rules. Database constraints protect references and
 * values; services must use this map before making a status change.
 */
export const CONTENT_STATUS_TRANSITIONS: Readonly<Record<ContentStatus, readonly ContentStatus[]>> = {
  candidate: ['researching', 'archived'],
  researching: ['drafting', 'candidate', 'archived'],
  drafting: ['review_required', 'researching', 'archived'],
  review_required: ['approved', 'drafting', 'archived'],
  approved: ['scheduled', 'drafting', 'archived'],
  scheduled: ['published', 'approved', 'archived'],
  published: ['measuring', 'improvement_required', 'archived'],
  measuring: ['improvement_required', 'published', 'archived'],
  improvement_required: ['drafting', 'archived'],
  archived: [],
};

export const APPROVAL_STATUS_TRANSITIONS: Readonly<Record<ApprovalStatus, readonly ApprovalStatus[]>> = {
  pending: ['approved', 'changes_requested', 'rejected', 'superseded'],
  approved: ['superseded'],
  changes_requested: ['superseded'],
  rejected: ['superseded'],
  superseded: [],
};

export const PUBLICATION_STATUS_TRANSITIONS: Readonly<Record<PublicationStatus, readonly PublicationStatus[]>> = {
  draft_package: ['awaiting_manual_publish', 'scheduled', 'cancelled'],
  awaiting_manual_publish: ['publishing', 'published', 'failed', 'cancelled'],
  scheduled: ['publishing', 'cancelled', 'failed'],
  publishing: ['published', 'verification_required', 'failed'],
  published: ['verification_required'],
  verification_required: ['published', 'failed'],
  failed: ['awaiting_manual_publish', 'scheduled', 'cancelled'],
  cancelled: [],
};

export function isAllowedTransition<T extends string>(
  transitions: Readonly<Record<T, readonly T[]>>,
  from: T,
  to: T,
): boolean {
  return transitions[from].includes(to);
}

export const DATA_INTEGRITY_RULES = {
  relativeTrendIndexesAreNotSearchVolume: true,
  incompleteObservationsMustRetainTheirState: true,
  approvalIsBoundToAnExactContentVersion: true,
  oneVersionCanHaveOnePublicationPerChannel: true,
  manualPublicationNeedsExternalVerification: true,
  conversionsRecordCompletedEventsInsteadOfButtonClicks: true,
  secretValuesMustNeverBePersistedInJobLogs: true,
} as const;
