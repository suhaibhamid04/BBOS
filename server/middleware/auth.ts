import { Request, Response, NextFunction } from 'express';
import {
  AuthenticatedEmployeeIdentity,
  UserRole,
} from '../../src/types/index.js';
import { APP_CONFIG } from '../../src/config.js';
import { getAdminAuth } from '../firebaseAdmin.js';
import {
  EmployeeIdentityError,
  resolveActiveEmployeeIdentity,
  VerifiedFirebaseIdentity,
} from '../services/employeeIdentityService.js';

export interface AuthenticatedUser extends AuthenticatedEmployeeIdentity {
  /** Compatibility alias. Business records continue to use the BBOS employeeId. */
  id: string;
  /**
   * Legacy business-identity alias. Existing domain services use this for
   * audit actor IDs, so it must remain the stable BBOS employeeId.
   * Firebase identity is available only through the explicit `firebaseUid`.
   */
  uid: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

function buildAuthenticatedUser(identity: AuthenticatedEmployeeIdentity): AuthenticatedUser {
  return {
    ...identity,
    id: identity.employeeId,
    uid: identity.employeeId,
  };
}

export function toPublicAuthenticatedUser(user: AuthenticatedUser): AuthenticatedEmployeeIdentity {
  return {
    firebaseUid: user.firebaseUid,
    employeeId: user.employeeId,
    role: user.role,
    name: user.name,
    email: user.email,
    active: true,
    ...(user.salesTeamId ? { salesTeamId: user.salesTeamId } : {}),
    ...(user.managerEmployeeId ? { managerEmployeeId: user.managerEmployeeId } : {}),
    ...(user.phone ? { phone: user.phone } : {}),
    ...(user.department ? { department: user.department } : {}),
    ...(user.createdAt ? { createdAt: user.createdAt } : {}),
    ...(user.lastLogin ? { lastLogin: user.lastLogin } : {}),
    ...(user.isDemo ? { isDemo: true } : {}),
  };
}

// Demo identities are unreachable unless explicit demo mode is enabled and the
// process is not running as production. Production identity resolution never
// assumes that Firebase UID and BBOS employeeId are the same identifier.
const PRESET_MOCK_USERS: Record<string, AuthenticatedUser> = {
  'emp-founder-01': {
    id: 'emp-founder-01', uid: 'emp-founder-01', firebaseUid: 'emp-founder-01', employeeId: 'emp-founder-01',
    name: 'Suhaib Hamid', email: 'suhaib@bookingbridge.com', role: 'Founder', active: true, isDemo: true,
  },
  'emp-admin-01': {
    id: 'emp-admin-01', uid: 'emp-admin-01', firebaseUid: 'emp-admin-01', employeeId: 'emp-admin-01',
    name: 'Nasir Wani', email: 'nasir.admin@bookingbridge.com', role: 'Admin', active: true, isDemo: true,
  },
  'emp-mgr-01': {
    id: 'emp-mgr-01', uid: 'emp-mgr-01', firebaseUid: 'emp-mgr-01', employeeId: 'emp-mgr-01',
    name: 'Sameer Mir', email: 'sameer.sales@bookingbridge.com', role: 'Sales Manager', active: true,
    salesTeamId: 'sales-team-01', isDemo: true,
  },
  'emp-sales-01': {
    id: 'emp-sales-01', uid: 'emp-sales-01', firebaseUid: 'emp-sales-01', employeeId: 'emp-sales-01',
    name: 'Tariq Bhat', email: 'tariq.sales@bookingbridge.com', role: 'Sales Executive', active: true,
    salesTeamId: 'sales-team-01', managerEmployeeId: 'emp-mgr-01', isDemo: true,
  },
  'emp-res-01': {
    id: 'emp-res-01', uid: 'emp-res-01', firebaseUid: 'emp-res-01', employeeId: 'emp-res-01',
    name: 'Zoya Qadri', email: 'zoya.reservations@bookingbridge.com', role: 'Reservations', active: true, isDemo: true,
  },
  'emp-mkt-01': {
    id: 'emp-mkt-01', uid: 'emp-mkt-01', firebaseUid: 'emp-mkt-01', employeeId: 'emp-mkt-01',
    name: 'Irfan Dar', email: 'irfan.mkt@bookingbridge.com', role: 'Marketing', active: true, isDemo: true,
  },
  'emp-ops-01': {
    id: 'emp-ops-01', uid: 'emp-ops-01', firebaseUid: 'emp-ops-01', employeeId: 'emp-ops-01',
    name: 'Bilal Ahmad Shah', email: 'bilal.ops@bookingbridge.com', role: 'Operations', active: true, isDemo: true,
  },
  'emp-acc-01': {
    id: 'emp-acc-01', uid: 'emp-acc-01', firebaseUid: 'emp-acc-01', employeeId: 'emp-acc-01',
    name: 'Farooq Lone', email: 'farooq.accounts@bookingbridge.com', role: 'Accounts', active: true, isDemo: true,
  },
};

async function verifyFirebaseToken(idToken: string): Promise<VerifiedFirebaseIdentity> {
  // checkRevoked=true rejects revoked sessions and disabled Firebase users in
  // addition to the Admin SDK's signature, project, audience and expiry checks.
  const decoded = await getAdminAuth().verifyIdToken(idToken, true);
  return {
    firebaseUid: decoded.uid,
    email: decoded.email,
    name: decoded.name,
  };
}

export interface AuthenticationDependencies {
  verifyFirebaseToken: (idToken: string) => Promise<VerifiedFirebaseIdentity>;
  resolveEmployee: (identity: VerifiedFirebaseIdentity) => Promise<AuthenticatedEmployeeIdentity>;
  demoMode: boolean;
  nodeEnv: string | undefined;
}

export function createAuthenticate(overrides: Partial<AuthenticationDependencies> = {}) {
  const dependencies: AuthenticationDependencies = {
    verifyFirebaseToken,
    resolveEmployee: (identity) => resolveActiveEmployeeIdentity(identity),
    demoMode: APP_CONFIG.DEMO_MODE,
    nodeEnv: process.env.NODE_ENV,
    ...overrides,
  };

  return async function authenticateRequest(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    const demoUserId = req.headers['x-demo-user-id'] as string | undefined;
    const demoAllowed = dependencies.demoMode && dependencies.nodeEnv !== 'production';

    if (authHeader !== undefined) {
      if (!authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: Bearer authentication token required.', code: 'AUTH_TOKEN_INVALID' });
      }

      const token = authHeader.substring(7).trim();
      if (!token) {
        return res.status(401).json({ error: 'Unauthorized: Firebase authentication token is empty.', code: 'AUTH_TOKEN_INVALID' });
      }

      if (token === 'demo-token') {
        if (!demoAllowed) {
          return res.status(401).json({ error: 'Unauthorized: Demo authentication is disabled.', code: 'AUTH_TOKEN_INVALID' });
        }
      } else {
        let firebaseIdentity: VerifiedFirebaseIdentity;
        try {
          firebaseIdentity = await dependencies.verifyFirebaseToken(token);
        } catch (error) {
          console.warn('[AUTH] Firebase token verification failed:', error);
          return res.status(401).json({
            error: 'Unauthorized: Firebase authentication token is invalid, expired, revoked, or disabled.',
            code: 'AUTH_TOKEN_INVALID',
          });
        }

        try {
          const employeeIdentity = await dependencies.resolveEmployee(firebaseIdentity);
          req.user = buildAuthenticatedUser(employeeIdentity);
          return next();
        } catch (error) {
          if (error instanceof EmployeeIdentityError) {
            return res.status(403).json({ error: error.message, code: error.code });
          }

          console.error('[AUTH] Employee identity resolution failed:', error);
          return res.status(503).json({
            error: 'Authentication service is temporarily unavailable.',
            code: 'IDENTITY_SERVICE_UNAVAILABLE',
          });
        }
      }
    }

    if (demoAllowed && demoUserId && PRESET_MOCK_USERS[demoUserId]) {
      req.user = PRESET_MOCK_USERS[demoUserId];
      return next();
    }

    if (demoAllowed) {
      req.user = PRESET_MOCK_USERS['emp-founder-01'];
      return next();
    }

    return res.status(401).json({
      error: 'Unauthorized: Valid Firebase authentication token required.',
      code: 'AUTHENTICATION_REQUIRED',
    });
  };
}

export const authenticate = createAuthenticate();

/** Guard middleware enforcing coarse role membership. */
export function requireRole(allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized: Authentication required.' });
    }

    if (req.user.role === 'Founder' || allowedRoles.includes(req.user.role)) {
      return next();
    }

    return res.status(403).json({
      error: `Access Denied: Role "${req.user.role}" does not have permission for this resource. Required: ${allowedRoles.join(', ')}`,
    });
  };
}
