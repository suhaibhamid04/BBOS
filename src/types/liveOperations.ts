export const OPERATIONAL_ISSUE_CATEGORIES = [
  'HOTEL', 'TRANSPORT', 'ACTIVITY', 'GUEST_REQUEST', 'DELAY',
  'SERVICE_QUALITY', 'MEDICAL_OR_EMERGENCY', 'OTHER',
] as const;
export type OperationalIssueCategory = (typeof OPERATIONAL_ISSUE_CATEGORIES)[number];

export const OPERATIONAL_ISSUE_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type OperationalIssuePriority = (typeof OPERATIONAL_ISSUE_PRIORITIES)[number];
export type OperationalIssueStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
export type OperationalServiceType = 'ACCOMMODATION' | 'TRANSPORT' | 'ACTIVITY';

export interface OperationalServiceLink {
  type: OperationalServiceType;
  serviceId: string;
}

export interface OperationalIssue {
  id: string;
  bookingId: string;
  category: OperationalIssueCategory;
  title: string;
  description: string;
  priority: OperationalIssuePriority;
  status: OperationalIssueStatus;
  reportedAt: string;
  reportedByEmployeeId: string;
  assignedEmployeeId?: string;
  resolutionNotes?: string;
  resolvedAt?: string;
  resolvedByEmployeeId?: string;
  hasFinancialImpact: boolean;
  linkedService?: OperationalServiceLink;
  createdAt: string;
  updatedAt: string;
}

export type OperationalChangeType =
  | 'SUPPLIER'
  | 'HOTEL_OR_PROPERTY'
  | 'ROOM_OR_CATEGORY'
  | 'SERVICE_QUANTITY'
  | 'SERVICE_SCOPE'
  | 'COMMERCIAL_COST';

export interface OperationalChangeRequest {
  id: string;
  bookingId: string;
  changeType: OperationalChangeType;
  description: string;
  linkedService?: OperationalServiceLink;
  status: 'REQUIRES_COMMERCIAL_APPROVAL';
  requestedByEmployeeId: string;
  requestedAt: string;
  createdAt: string;
  updatedAt: string;
}

export const EMERGENCY_SPEND_CATEGORIES = [
  'REPLACEMENT_TRANSPORT', 'MEDICAL_LOGISTICS', 'ADDITIONAL_TRANSFER',
  'GUEST_ASSISTANCE', 'OTHER',
] as const;
export type EmergencySpendCategory = (typeof EMERGENCY_SPEND_CATEGORIES)[number];
export type EmergencySpendStatus = 'REQUESTED' | 'APPROVED' | 'REJECTED';

export interface EmergencySpendRequest {
  id: string;
  bookingId: string;
  amountMinor: number;
  currency: string;
  purpose: string;
  category: EmergencySpendCategory;
  reason: string;
  requestedByEmployeeId: string;
  requestedAt: string;
  status: EmergencySpendStatus;
  approvedByEmployeeId?: string;
  approvedAt?: string;
  rejectedByEmployeeId?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  receiptReference?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOperationalIssueInput {
  category: OperationalIssueCategory;
  title: string;
  description: string;
  priority: OperationalIssuePriority;
  hasFinancialImpact: boolean;
  linkedService?: OperationalServiceLink;
}

export interface UpdateOperationalIssueInput {
  title?: string;
  description?: string;
  priority?: OperationalIssuePriority;
  status?: OperationalIssueStatus;
  resolutionNotes?: string;
  hasFinancialImpact?: boolean;
  expectedUpdatedAt: string;
}

export interface CreateEmergencySpendInput {
  amountMinor: number;
  currency: string;
  purpose: string;
  category: EmergencySpendCategory;
  reason: string;
  receiptReference?: string;
}
