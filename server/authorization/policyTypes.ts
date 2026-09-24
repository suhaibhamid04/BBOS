import type { UserRole } from '../../src/types/index.js';

export const AUTHORIZATION_RESOURCES = [
  'TRIP',
  'QUOTE',
  'BOOKING',
  'INVENTORY',
  'ATTRIBUTION_REPORT',
] as const;

export type AuthorizationResource = (typeof AUTHORIZATION_RESOURCES)[number];

export const AUTHORIZATION_ACTIONS = [
  'READ_DETAIL',
  'UPDATE_COMMERCIAL',
  'CONVERT_TO_BOOKING',
  'READ_FINANCIALS',
  'READ_INVENTORY',
  'READ_OPERATIONAL',
  'UPDATE_RESERVATIONS',
  'UPDATE_OPERATIONAL',
  'READ_AGGREGATE',
] as const;

export type AuthorizationAction = (typeof AUTHORIZATION_ACTIONS)[number];

export type AuthorizationScope =
  | 'ALL'
  | 'TEAM'
  | 'OWN'
  | 'ASSIGNED'
  | 'DEPARTMENT'
  | 'AGGREGATE'
  | 'NONE';

/**
 * Server-side principal used by business authorization. `employeeId` is the
 * ownership identity; Firebase UID is never compared with business records.
 * `role` remains a string at this boundary so corrupt stored roles fail closed
 * at runtime rather than being hidden by TypeScript.
 */
export interface AuthorizationPrincipal {
  firebaseUid?: string;
  employeeId: string;
  role: UserRole | string;
  active: boolean;
  salesTeamId?: string;
  managerEmployeeId?: string;
  department?: string;
}

export interface ApprovalContext {
  required: boolean;
  state?: string;
}

/** Canonical context normalized from resource-specific Firestore fields. */
export interface ResourceContext {
  resourceId?: string;
  ownerEmployeeId?: string;
  salesTeamId?: string;
  assignedReservationsEmployeeId?: string;
  assignedOperationsEmployeeId?: string;
  departmentId?: string;
  status?: string;
  approval?: ApprovalContext;
}

export type AuthorizationDecisionCode =
  | 'ALLOWED'
  | 'INVALID_PRINCIPAL'
  | 'UNKNOWN_ROLE'
  | 'UNSUPPORTED_POLICY'
  | 'MALFORMED_CONTEXT'
  | 'MISSING_SCOPE_METADATA'
  | 'SCOPE_MISMATCH'
  | 'WORKFLOW_STATE_DENIED'
  | 'APPROVAL_REQUIRED'
  | 'ROLE_DENIED';

export interface AuthorizationDecision {
  allowed: boolean;
  scope: AuthorizationScope;
  code: AuthorizationDecisionCode;
  reason: string;
}

export interface QueryConstraint {
  field: string;
  operator: '==' | 'in';
  value: string | string[];
}

export interface QueryScopeDescriptor {
  resource: AuthorizationResource;
  action: AuthorizationAction;
  scope: AuthorizationScope;
  constraints: QueryConstraint[];
  aggregateOnly: boolean;
  deniedReason?: string;
}
