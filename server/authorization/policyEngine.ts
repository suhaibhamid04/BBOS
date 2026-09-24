import { isUserRole, type UserRole } from '../../src/types/index.js';
import {
  AUTHORIZATION_ACTIONS,
  AUTHORIZATION_RESOURCES,
  type AuthorizationAction,
  type AuthorizationDecision,
  type AuthorizationPrincipal,
  type AuthorizationResource,
  type AuthorizationScope,
  type QueryConstraint,
  type QueryScopeDescriptor,
  type ResourceContext,
} from './policyTypes.js';

const SUPPORTED_ACTIONS: Record<AuthorizationResource, readonly AuthorizationAction[]> = {
  TRIP: ['READ_DETAIL', 'UPDATE_COMMERCIAL', 'READ_FINANCIALS', 'READ_OPERATIONAL'],
  QUOTE: ['READ_DETAIL', 'UPDATE_COMMERCIAL', 'CONVERT_TO_BOOKING', 'READ_FINANCIALS'],
  BOOKING: [
    'READ_DETAIL',
    'READ_FINANCIALS',
    'READ_OPERATIONAL',
    'UPDATE_RESERVATIONS',
    'UPDATE_OPERATIONAL',
  ],
  INVENTORY: ['READ_INVENTORY'],
  ATTRIBUTION_REPORT: ['READ_AGGREGATE'],
};

const COMMERCIAL_RESOURCES: readonly AuthorizationResource[] = ['TRIP', 'QUOTE', 'BOOKING'];
const PRE_CONFIRMATION_STATES: Record<'TRIP' | 'QUOTE', readonly string[]> = {
  TRIP: ['DRAFT', 'ITINERARY_READY', 'QUOTE_READY', 'QUOTE_SENT'],
  QUOTE: ['DRAFT', 'PENDING_APPROVAL', 'SENT', 'VIEWED'],
};
const CONVERTIBLE_QUOTE_STATES = ['SENT', 'VIEWED', 'ACCEPTED'] as const;
const RESERVATIONS_READ_STATES: Record<'TRIP' | 'BOOKING', readonly string[]> = {
  TRIP: ['BOOKED', 'IN_OPERATIONS', 'COMPLETED'],
  BOOKING: ['CONFIRMED', 'IN_OPERATIONS', 'TRAVELLING', 'COMPLETED'],
};
const OPERATIONS_READ_STATES: Record<'TRIP' | 'BOOKING', readonly string[]> = {
  TRIP: ['BOOKED', 'IN_OPERATIONS', 'COMPLETED'],
  BOOKING: ['CONFIRMED', 'IN_OPERATIONS', 'TRAVELLING', 'COMPLETED'],
};

function decision(
  allowed: boolean,
  scope: AuthorizationScope,
  code: AuthorizationDecision['code'],
  reason: string,
): AuthorizationDecision {
  return { allowed, scope, code, reason };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function validatePrincipal(principal: AuthorizationPrincipal): AuthorizationDecision | null {
  if (!principal || principal.active !== true || !isNonEmptyString(principal.employeeId)) {
    return decision(false, 'NONE', 'INVALID_PRINCIPAL', 'An active employee identity is required.');
  }
  if (!isUserRole(principal.role)) {
    return decision(false, 'NONE', 'UNKNOWN_ROLE', 'The employee role is not recognized.');
  }
  if (principal.salesTeamId !== undefined && !isNonEmptyString(principal.salesTeamId)) {
    return decision(false, 'NONE', 'INVALID_PRINCIPAL', 'The employee sales team identifier is malformed.');
  }
  return null;
}

function validateContext(context: ResourceContext): AuthorizationDecision | null {
  if (!context || typeof context !== 'object' || Array.isArray(context)) {
    return decision(false, 'NONE', 'MALFORMED_CONTEXT', 'Resource context must be an object.');
  }

  const stringFields: (keyof ResourceContext)[] = [
    'resourceId',
    'ownerEmployeeId',
    'salesTeamId',
    'assignedReservationsEmployeeId',
    'assignedOperationsEmployeeId',
    'departmentId',
    'status',
  ];
  for (const field of stringFields) {
    const value = context[field];
    if (value !== undefined && !isNonEmptyString(value)) {
      return decision(false, 'NONE', 'MALFORMED_CONTEXT', `Resource context field ${field} is malformed.`);
    }
  }

  if (context.approval !== undefined) {
    if (
      !context.approval ||
      typeof context.approval !== 'object' ||
      typeof context.approval.required !== 'boolean' ||
      (context.approval.state !== undefined && !isNonEmptyString(context.approval.state))
    ) {
      return decision(false, 'NONE', 'MALFORMED_CONTEXT', 'Approval context is malformed.');
    }
  }

  return null;
}

function roleScope(
  role: UserRole,
  resource: AuthorizationResource,
  action: AuthorizationAction,
): AuthorizationScope {
  if (!SUPPORTED_ACTIONS[resource].includes(action)) return 'NONE';
  if (role === 'Founder' || role === 'Admin') return 'ALL';

  if (role === 'Marketing') {
    return resource === 'ATTRIBUTION_REPORT' && action === 'READ_AGGREGATE' ? 'AGGREGATE' : 'NONE';
  }

  if (role === 'Accounts') {
    return COMMERCIAL_RESOURCES.includes(resource) &&
      (action === 'READ_DETAIL' || action === 'READ_FINANCIALS')
      ? 'ALL'
      : 'NONE';
  }

  if (role === 'Sales Executive') {
    return COMMERCIAL_RESOURCES.includes(resource) &&
      ['READ_DETAIL', 'READ_FINANCIALS', 'UPDATE_COMMERCIAL', 'CONVERT_TO_BOOKING'].includes(action)
      ? 'OWN'
      : 'NONE';
  }

  if (role === 'Sales Manager') {
    return COMMERCIAL_RESOURCES.includes(resource) &&
      ['READ_DETAIL', 'READ_FINANCIALS', 'UPDATE_COMMERCIAL', 'CONVERT_TO_BOOKING'].includes(action)
      ? 'TEAM'
      : 'NONE';
  }

  if (role === 'Reservations') {
    if (resource === 'INVENTORY' && action === 'READ_INVENTORY') return 'ALL';
    if (
      (resource === 'TRIP' || resource === 'BOOKING') &&
      (action === 'READ_DETAIL' || action === 'UPDATE_RESERVATIONS')
    ) {
      return 'ASSIGNED';
    }
    return 'NONE';
  }

  if (role === 'Operations') {
    if (
      (resource === 'TRIP' || resource === 'BOOKING') &&
      (action === 'READ_DETAIL' || action === 'READ_OPERATIONAL' || action === 'UPDATE_OPERATIONAL')
    ) {
      return 'ASSIGNED';
    }
    return 'NONE';
  }

  return 'NONE';
}

function workflowDecision(
  principal: AuthorizationPrincipal,
  resource: AuthorizationResource,
  action: AuthorizationAction,
  context: ResourceContext,
  scope: AuthorizationScope,
): AuthorizationDecision | null {
  const requireState = (allowedStates: readonly string[]): AuthorizationDecision | null => {
    if (!context.status || !allowedStates.includes(context.status)) {
      return decision(
        false,
        scope,
        'WORKFLOW_STATE_DENIED',
        `Action ${action} is not permitted in the current or missing workflow state.`,
      );
    }
    return null;
  };

  if (action === 'UPDATE_COMMERCIAL') {
    if (resource !== 'TRIP' && resource !== 'QUOTE') {
      return decision(false, scope, 'WORKFLOW_STATE_DENIED', 'Commercial editing is unsupported for this resource.');
    }
    return requireState(PRE_CONFIRMATION_STATES[resource]);
  }

  if (action === 'CONVERT_TO_BOOKING') return requireState(CONVERTIBLE_QUOTE_STATES);

  if (principal.role === 'Reservations' && (resource === 'TRIP' || resource === 'BOOKING')) {
    if (action === 'UPDATE_RESERVATIONS') return requireState(['CONFIRMED', 'IN_OPERATIONS']);
    if (action === 'READ_DETAIL') return requireState(RESERVATIONS_READ_STATES[resource]);
  }

  if (principal.role === 'Operations' && (resource === 'TRIP' || resource === 'BOOKING')) {
    if (action === 'UPDATE_OPERATIONAL') return requireState(['IN_OPERATIONS', 'TRAVELLING']);
    if (action === 'READ_DETAIL' || action === 'READ_OPERATIONAL') {
      return requireState(OPERATIONS_READ_STATES[resource]);
    }
  }

  return null;
}

function scopeDecision(
  principal: AuthorizationPrincipal,
  scope: AuthorizationScope,
  context: ResourceContext,
): AuthorizationDecision | null {
  if (scope === 'ALL' || scope === 'AGGREGATE') return null;

  if (scope === 'OWN') {
    if (!context.ownerEmployeeId) {
      return decision(false, scope, 'MISSING_SCOPE_METADATA', 'Resource owner metadata is required.');
    }
    if (context.ownerEmployeeId !== principal.employeeId) {
      return decision(false, scope, 'SCOPE_MISMATCH', 'The employee does not own this resource.');
    }
    return null;
  }

  if (scope === 'TEAM') {
    if (!principal.salesTeamId || !context.salesTeamId) {
      return decision(false, scope, 'MISSING_SCOPE_METADATA', 'Both employee and resource sales team metadata are required.');
    }
    if (principal.salesTeamId !== context.salesTeamId) {
      return decision(false, scope, 'SCOPE_MISMATCH', 'The resource belongs to another sales team.');
    }
    return null;
  }

  if (scope === 'ASSIGNED') {
    const assignment = principal.role === 'Reservations'
      ? context.assignedReservationsEmployeeId
      : principal.role === 'Operations'
        ? context.assignedOperationsEmployeeId
        : undefined;
    if (!assignment) {
      return decision(false, scope, 'MISSING_SCOPE_METADATA', 'Required resource assignment metadata is missing.');
    }
    if (assignment !== principal.employeeId) {
      return decision(false, scope, 'SCOPE_MISMATCH', 'The employee is not assigned to this resource.');
    }
    return null;
  }

  if (scope === 'DEPARTMENT') {
    if (!principal.department || !context.departmentId) {
      return decision(false, scope, 'MISSING_SCOPE_METADATA', 'Department metadata is required.');
    }
    if (principal.department !== context.departmentId) {
      return decision(false, scope, 'SCOPE_MISMATCH', 'The resource belongs to another department.');
    }
    return null;
  }

  return decision(false, 'NONE', 'ROLE_DENIED', 'The role has no applicable authorization scope.');
}

export function authorizeResource(
  principal: AuthorizationPrincipal,
  resource: AuthorizationResource,
  action: AuthorizationAction,
  context: ResourceContext,
): AuthorizationDecision {
  const invalidPrincipal = validatePrincipal(principal);
  if (invalidPrincipal) return invalidPrincipal;

  if (
    !(AUTHORIZATION_RESOURCES as readonly string[]).includes(resource) ||
    !(AUTHORIZATION_ACTIONS as readonly string[]).includes(action) ||
    !SUPPORTED_ACTIONS[resource]?.includes(action)
  ) {
    return decision(false, 'NONE', 'UNSUPPORTED_POLICY', 'No policy exists for this resource and action.');
  }

  const invalidContext = validateContext(context);
  if (invalidContext) return invalidContext;

  const scope = roleScope(principal.role as UserRole, resource, action);
  if (scope === 'NONE') {
    return decision(false, 'NONE', 'ROLE_DENIED', 'The role is not permitted to perform this action.');
  }

  const scoped = scopeDecision(principal, scope, context);
  if (scoped) return scoped;

  const workflow = workflowDecision(principal, resource, action, context, scope);
  if (workflow) return workflow;

  const approvalAwareActions: readonly AuthorizationAction[] = [
    'UPDATE_COMMERCIAL',
    'CONVERT_TO_BOOKING',
    'UPDATE_RESERVATIONS',
    'UPDATE_OPERATIONAL',
  ];
  if (
    approvalAwareActions.includes(action) &&
    context.approval?.required === true &&
    context.approval.state !== 'APPROVED'
  ) {
    return decision(false, scope, 'APPROVAL_REQUIRED', 'The required approval has not been granted.');
  }

  return decision(true, scope, 'ALLOWED', 'Authorized by BBOS resource policy.');
}

const QUERY_FIELDS: Record<AuthorizationResource, Partial<Record<Exclude<AuthorizationScope, 'ALL' | 'AGGREGATE' | 'NONE'>, string>>> = {
  TRIP: {
    OWN: 'assignedSalesEmployeeId',
    TEAM: 'salesTeamId',
    ASSIGNED: 'assignedReservationsEmployeeId',
    DEPARTMENT: 'departmentId',
  },
  QUOTE: { OWN: 'salesEmployeeId', TEAM: 'salesTeamId', DEPARTMENT: 'departmentId' },
  BOOKING: {
    OWN: 'assignedSalesEmployeeId',
    TEAM: 'salesTeamId',
    ASSIGNED: 'assignedReservationsEmployeeId',
    DEPARTMENT: 'departmentId',
  },
  INVENTORY: { DEPARTMENT: 'departmentId' },
  ATTRIBUTION_REPORT: { DEPARTMENT: 'departmentId' },
};

function assignmentQueryField(resource: AuthorizationResource, role: string): string | undefined {
  if (role === 'Operations' && (resource === 'TRIP' || resource === 'BOOKING')) {
    return 'assignedOperationsEmployeeId';
  }
  return QUERY_FIELDS[resource].ASSIGNED;
}

function queryStateConstraint(
  principal: AuthorizationPrincipal,
  resource: AuthorizationResource,
  action: AuthorizationAction,
): QueryConstraint | undefined {
  if (principal.role === 'Reservations' && action === 'READ_DETAIL' && (resource === 'TRIP' || resource === 'BOOKING')) {
    return { field: 'status', operator: 'in', value: [...RESERVATIONS_READ_STATES[resource]] };
  }
  if (
    principal.role === 'Operations' &&
    (action === 'READ_DETAIL' || action === 'READ_OPERATIONAL') &&
    (resource === 'TRIP' || resource === 'BOOKING')
  ) {
    return { field: 'status', operator: 'in', value: [...OPERATIONS_READ_STATES[resource]] };
  }
  return undefined;
}

/**
 * Resolves the Firestore-facing portion of policy without loading records.
 * Stage D can translate these structured constraints into actual queries.
 */
export function resolveQueryScope(
  principal: AuthorizationPrincipal,
  resource: AuthorizationResource,
  action: AuthorizationAction,
): QueryScopeDescriptor {
  const invalid = validatePrincipal(principal);
  if (invalid || !SUPPORTED_ACTIONS[resource]?.includes(action)) {
    return {
      resource,
      action,
      scope: 'NONE',
      constraints: [],
      aggregateOnly: false,
      deniedReason: invalid?.reason || 'No query policy exists for this resource and action.',
    };
  }

  const scope = roleScope(principal.role as UserRole, resource, action);
  const constraints: QueryConstraint[] = [];
  let field: string | undefined;
  let value: string | undefined;

  if (scope === 'OWN') {
    field = QUERY_FIELDS[resource].OWN;
    value = principal.employeeId;
  } else if (scope === 'TEAM') {
    field = QUERY_FIELDS[resource].TEAM;
    value = principal.salesTeamId;
  } else if (scope === 'ASSIGNED') {
    field = assignmentQueryField(resource, principal.role);
    value = principal.employeeId;
  } else if (scope === 'DEPARTMENT') {
    field = QUERY_FIELDS[resource].DEPARTMENT;
    value = principal.department;
  }

  if (!['ALL', 'AGGREGATE', 'NONE'].includes(scope) && (!field || !value)) {
    return {
      resource,
      action,
      scope: 'NONE',
      constraints: [],
      aggregateOnly: false,
      deniedReason: `Required ${scope} query metadata is missing.`,
    };
  }

  if (field && value) constraints.push({ field, operator: '==', value });
  const statusConstraint = queryStateConstraint(principal, resource, action);
  if (statusConstraint) constraints.push(statusConstraint);

  return {
    resource,
    action,
    scope,
    constraints,
    aggregateOnly: scope === 'AGGREGATE',
    ...(scope === 'NONE' ? { deniedReason: 'The role has no query scope for this action.' } : {}),
  };
}
