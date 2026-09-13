import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { UserRole } from '../../src/types/index.js';
import { APP_CONFIG } from '../../src/config.js';

export interface AuthenticatedUser {
  id: string;
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  isDemo?: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

// Read Firebase config for API key if needed
let firebaseApiKey = '';
try {
  const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw);
    firebaseApiKey = parsed.apiKey || '';
  }
} catch (e) {
  console.warn('[AUTH] Could not load firebase-applet-config.json:', e);
}

// Preset fallback users for development / DEMO_MODE
const PRESET_MOCK_USERS: Record<string, AuthenticatedUser> = {
  'emp-founder-01': {
    id: 'emp-founder-01',
    uid: 'emp-founder-01',
    name: 'Suhaib Hamid',
    email: 'suhaib@bookingbridge.com',
    role: 'Founder',
    isDemo: true,
  },
  'emp-admin-01': {
    id: 'emp-admin-01',
    uid: 'emp-admin-01',
    name: 'Nasir Wani',
    email: 'nasir.admin@bookingbridge.com',
    role: 'Admin',
    isDemo: true,
  },
  'emp-mgr-01': {
    id: 'emp-mgr-01',
    uid: 'emp-mgr-01',
    name: 'Sameer Mir',
    email: 'sameer.sales@bookingbridge.com',
    role: 'Sales Manager',
    isDemo: true,
  },
  'emp-sales-01': {
    id: 'emp-sales-01',
    uid: 'emp-sales-01',
    name: 'Tariq Bhat',
    email: 'tariq.sales@bookingbridge.com',
    role: 'Sales Executive',
    isDemo: true,
  },
  'emp-mkt-01': {
    id: 'emp-mkt-01',
    uid: 'emp-mkt-01',
    name: 'Irfan Dar',
    email: 'irfan.mkt@bookingbridge.com',
    role: 'Marketing',
    isDemo: true,
  },
  'emp-ops-01': {
    id: 'emp-ops-01',
    uid: 'emp-ops-01',
    name: 'Bilal Ahmad Shah',
    email: 'bilal.ops@bookingbridge.com',
    role: 'Operations',
    isDemo: true,
  },
  'emp-acc-01': {
    id: 'emp-acc-01',
    uid: 'emp-acc-01',
    name: 'Farooq Lone',
    email: 'farooq.accounts@bookingbridge.com',
    role: 'Accounts',
    isDemo: true,
  },
};

/**
 * Verify Firebase ID Token using Google Identity Toolkit REST API
 */
async function verifyFirebaseToken(idToken: string): Promise<{ uid: string; email: string; displayName?: string } | null> {
  if (!firebaseApiKey) return null;
  try {
    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
    if (!res.ok) {
      return null;
    }
    const data = await res.json();
    if (data.users && data.users.length > 0) {
      const u = data.users[0];
      return {
        uid: u.localId,
        email: u.email,
        displayName: u.displayName,
      };
    }
    return null;
  } catch (err) {
    console.warn('[AUTH] Error verifying Firebase token via REST API:', err);
    return null;
  }
}

/**
 * Authentication Middleware:
 * Resolves user identity from Firebase Auth Bearer token, or X-Demo-User-Id in development/demo mode.
 */
export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const demoUserId = req.headers['x-demo-user-id'] as string | undefined;

  // 1. If Bearer token provided, attempt real token verification
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    if (token && token !== 'demo-token') {
      const verified = await verifyFirebaseToken(token);
      if (verified) {
        req.user = {
          id: verified.uid,
          uid: verified.uid,
          name: verified.displayName || verified.email.split('@')[0],
          email: verified.email,
          role: 'Sales Executive', // Default fallback; elevated via verified profile in production
          isDemo: false,
        };
        return next();
      }
    }
  }

  // 2. Demo Mode / Development Header resolution
  if (APP_CONFIG.DEMO_MODE && demoUserId && PRESET_MOCK_USERS[demoUserId]) {
    req.user = PRESET_MOCK_USERS[demoUserId];
    return next();
  }

  // 3. Fallback for DEMO_MODE local development when no explicit header provided
  if (APP_CONFIG.DEMO_MODE) {
    req.user = PRESET_MOCK_USERS['emp-founder-01'];
    return next();
  }

  // 4. Deny unauthenticated requests in production
  return res.status(401).json({ error: 'Unauthorized: Valid Firebase authentication token required.' });
}

/**
 * Guard middleware enforcing required roles
 */
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
