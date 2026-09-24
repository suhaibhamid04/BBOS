import type { ResourceContext } from './policyTypes.js';

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as UnknownRecord;
}

function copyIfPresent(
  target: Record<string, unknown>,
  targetKey: string,
  source: UnknownRecord,
  sourceKey: string,
): void {
  if (Object.prototype.hasOwnProperty.call(source, sourceKey)) {
    target[targetKey] = source[sourceKey];
  }
}

function commonContext(resource: UnknownRecord): Record<string, unknown> {
  const context: Record<string, unknown> = {};
  copyIfPresent(context, 'resourceId', resource, 'id');
  copyIfPresent(context, 'salesTeamId', resource, 'salesTeamId');
  copyIfPresent(context, 'assignedReservationsEmployeeId', resource, 'assignedReservationsEmployeeId');
  copyIfPresent(context, 'assignedOperationsEmployeeId', resource, 'assignedOperationsEmployeeId');
  copyIfPresent(context, 'departmentId', resource, 'departmentId');
  copyIfPresent(context, 'status', resource, 'status');
  copyIfPresent(context, 'approval', resource, 'approval');
  return context;
}

export function tripResourceContext(value: unknown): ResourceContext {
  const resource = asRecord(value);
  const context = commonContext(resource);
  copyIfPresent(context, 'ownerEmployeeId', resource, 'assignedSalesEmployeeId');
  return context as ResourceContext;
}

export function quoteResourceContext(value: unknown): ResourceContext {
  const resource = asRecord(value);
  const context = commonContext(resource);
  copyIfPresent(context, 'ownerEmployeeId', resource, 'salesEmployeeId');
  return context as ResourceContext;
}

export function bookingResourceContext(value: unknown): ResourceContext {
  const resource = asRecord(value);
  const context = commonContext(resource);
  copyIfPresent(context, 'ownerEmployeeId', resource, 'assignedSalesEmployeeId');
  return context as ResourceContext;
}
