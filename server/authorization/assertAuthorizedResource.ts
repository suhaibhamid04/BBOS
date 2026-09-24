import type {
  AuthorizationAction,
  AuthorizationDecision,
  AuthorizationPrincipal,
  AuthorizationResource,
  ResourceContext,
} from './policyTypes.js';
import { authorizeResource } from './policyEngine.js';

export class ResourceAuthorizationError extends Error {
  readonly statusCode = 403;
  readonly code = 'RESOURCE_ACCESS_DENIED';

  constructor(readonly decision: AuthorizationDecision) {
    super('Forbidden: You are not authorized to access this resource.');
    this.name = 'ResourceAuthorizationError';
  }
}

export function assertAuthorizedResource(
  principal: AuthorizationPrincipal,
  resource: AuthorizationResource,
  action: AuthorizationAction,
  context: ResourceContext,
): AuthorizationDecision {
  const result = authorizeResource(principal, resource, action, context);
  if (!result.allowed) throw new ResourceAuthorizationError(result);
  return result;
}
