import { authorizeResource } from './policyEngine.js';
import { ResourceAuthorizationError } from './assertAuthorizedResource.js';
import type {
  AuthorizationAction,
  AuthorizationPrincipal,
  AuthorizationResource,
  QueryScopeDescriptor,
  ResourceContext,
} from './policyTypes.js';

export interface ScopedListOptions {
  limit: number;
  cursor?: string;
}

export interface ScopedListResult<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export class ScopedListError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ScopedListError';
  }
}

export function parseScopedListOptions(query: Record<string, unknown>): ScopedListOptions {
  const rawLimit = query.limit;
  const parsed = typeof rawLimit === 'string' ? Number.parseInt(rawLimit, 10) : 20;
  const limit = Number.isFinite(parsed) && parsed >= 1 && parsed <= 100 ? parsed : 20;
  const cursor = typeof query.cursor === 'string' && query.cursor.trim() ? query.cursor.trim() : undefined;
  return { limit, ...(cursor ? { cursor } : {}) };
}

export function assertRawListScope(descriptor: QueryScopeDescriptor): QueryScopeDescriptor {
  if (descriptor.scope === 'NONE' || descriptor.scope === 'AGGREGATE') {
    throw new ResourceAuthorizationError({
      allowed: false,
      scope: descriptor.scope,
      code: 'ROLE_DENIED',
      reason: descriptor.deniedReason || 'Raw resource listing is not authorized.',
    });
  }
  return descriptor;
}

/** Applies Stage C query constraints before Firestore performs the read. */
export function applyFirestoreQueryScope<TQuery extends {
  where(field: string, operator: string, value: unknown): TQuery;
}>(query: TQuery, descriptor: QueryScopeDescriptor): TQuery {
  assertRawListScope(descriptor);
  let scoped = query;
  for (const constraint of descriptor.constraints) {
    scoped = scoped.where(constraint.field, constraint.operator, constraint.value);
  }
  return scoped;
}

/**
 * Post-query assertion. This is defense-in-depth, not an in-memory substitute
 * for a scoped Firestore query: one unexpected record fails the whole request.
 */
export function assertReturnedRecordsAuthorized<T>(
  principal: AuthorizationPrincipal,
  resource: AuthorizationResource,
  action: AuthorizationAction,
  records: readonly T[],
  contextFor: (record: T) => ResourceContext,
): void {
  for (const record of records) {
    const result = authorizeResource(principal, resource, action, contextFor(record));
    if (!result.allowed) throw new ResourceAuthorizationError(result);
  }
}

/** Used only for explicit demo/in-memory data, never for production Firestore reads. */
export function scopeInMemoryRecords<T>(
  principal: AuthorizationPrincipal,
  resource: AuthorizationResource,
  action: AuthorizationAction,
  records: readonly T[],
  contextFor: (record: T) => ResourceContext,
): T[] {
  return records.filter(record => authorizeResource(principal, resource, action, contextFor(record)).allowed);
}
