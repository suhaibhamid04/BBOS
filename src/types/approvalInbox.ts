import type { UserRole } from './index';

export const APPROVAL_INBOX_ITEM_TYPES = [
  'EMERGENCY_SPEND',
  'SUPPLIER_RATE_DISCREPANCY',
  'OPERATIONAL_COMMERCIAL_CHANGE',
  'QUOTE_APPROVAL',
] as const;

export type ApprovalInboxItemType = (typeof APPROVAL_INBOX_ITEM_TYPES)[number];
export type ApprovalInboxStatus = 'PENDING' | 'REVIEW_REQUIRED' | 'APPROVED' | 'REJECTED';
export type ApprovalInboxPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface ApprovalInboxRoute {
  section: 'operations-dashboard' | 'bookings' | 'quotes';
  entityId?: string;
}

/**
 * Role-safe projection of an authoritative domain exception. This model is
 * never persisted and never becomes the source of approval state.
 */
export interface ApprovalInboxItem {
  id: string;
  type: ApprovalInboxItemType;
  sourceEntityType: string;
  sourceEntityId: string;
  bookingId?: string;
  bookingReference?: string;
  quoteId?: string;
  quoteReference?: string;
  title: string;
  summary: string;
  requestedByEmployeeId: string;
  requestedAt: string;
  amountMinor?: number;
  currency?: string;
  priority: ApprovalInboxPriority;
  status: ApprovalInboxStatus;
  requiredApproverRoles: UserRole[];
  sourceVersion: string;
  actionable: boolean;
  route: ApprovalInboxRoute;
  context?: {
    customerName?: string;
    serviceId?: string;
    serviceType?: string;
    supplierId?: string;
    propertyName?: string;
    frozenSupplierUnitRate?: number;
    confirmedSupplierUnitRate?: number;
    difference?: number;
    reason?: string;
    changeType?: string;
  };
}

export interface ApprovalInboxSummary {
  pendingCount: number;
  oldestPendingAt?: string;
  highPriorityCount: number;
}

export interface ApprovalInboxResponse {
  awaitingMyDecision: ApprovalInboxItem[];
  submittedByMe: ApprovalInboxItem[];
  recentlyDecided: ApprovalInboxItem[];
  allPending?: ApprovalInboxItem[];
  summary: ApprovalInboxSummary;
}

export interface ApprovalInboxDecisionInput {
  decision: 'APPROVED' | 'REJECTED';
  expectedUpdatedAt: string;
  rejectionReason?: string;
}
