import { getAdminDb } from '../firebaseAdmin.js';
import {
  AuthenticatedEmployeeIdentity,
  isUserRole,
} from '../../src/types/index.js';

export interface VerifiedFirebaseIdentity {
  firebaseUid: string;
  email?: string;
  name?: string;
}

export interface EmployeeIdentityCandidate {
  documentId: string;
  data: Record<string, unknown>;
}

export interface EmployeeIdentityStore {
  findByFirebaseUid(firebaseUid: string): Promise<EmployeeIdentityCandidate[]>;
}

export class EmployeeIdentityError extends Error {
  constructor(
    public code:
      | 'EMPLOYEE_NOT_FOUND'
      | 'EMPLOYEE_IDENTITY_AMBIGUOUS'
      | 'EMPLOYEE_INACTIVE'
      | 'EMPLOYEE_ROLE_INVALID'
      | 'EMPLOYEE_ID_INVALID',
    message: string,
  ) {
    super(message);
    this.name = 'EmployeeIdentityError';
  }
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

/**
 * Migration-compatible employee lookup.
 *
 * Supported layouts:
 * 1. Preferred: an employee document with a `firebaseUid` field. The document
 *    ID may be the stable BBOS employeeId.
 * 2. Legacy: employees/{firebaseUid}. The stable employeeId is taken from
 *    `employeeId`, then `id`, and only falls back to the document ID.
 *
 * Results are de-duplicated by document ID. More than one matching document is
 * rejected instead of guessing which employee owns the Firebase identity.
 */
export class FirestoreEmployeeIdentityStore implements EmployeeIdentityStore {
  async findByFirebaseUid(firebaseUid: string): Promise<EmployeeIdentityCandidate[]> {
    const db = getAdminDb();
    const employees = db.collection('employees');

    const [documentMatch, linkedMatches] = await Promise.all([
      employees.doc(firebaseUid).get(),
      employees.where('firebaseUid', '==', firebaseUid).limit(2).get(),
    ]);

    const candidates = new Map<string, EmployeeIdentityCandidate>();

    if (documentMatch.exists) {
      const data = (documentMatch.data() || {}) as Record<string, unknown>;
      const explicitlyLinkedUid = nonEmptyString(data.firebaseUid);
      if (!explicitlyLinkedUid || explicitlyLinkedUid === firebaseUid) {
        candidates.set(documentMatch.id, { documentId: documentMatch.id, data });
      }
    }

    for (const document of linkedMatches.docs) {
      candidates.set(document.id, {
        documentId: document.id,
        data: (document.data() || {}) as Record<string, unknown>,
      });
    }

    return [...candidates.values()];
  }
}

export async function resolveActiveEmployeeIdentity(
  firebaseIdentity: VerifiedFirebaseIdentity,
  store: EmployeeIdentityStore = new FirestoreEmployeeIdentityStore(),
): Promise<AuthenticatedEmployeeIdentity> {
  const candidates = await store.findByFirebaseUid(firebaseIdentity.firebaseUid);

  if (candidates.length === 0) {
    throw new EmployeeIdentityError(
      'EMPLOYEE_NOT_FOUND',
      'Firebase account is not linked to a BBOS employee record.',
    );
  }

  if (candidates.length !== 1) {
    throw new EmployeeIdentityError(
      'EMPLOYEE_IDENTITY_AMBIGUOUS',
      'Firebase account is linked to multiple BBOS employee records.',
    );
  }

  const candidate = candidates[0];
  const employee = candidate.data;

  if (employee.active !== true) {
    throw new EmployeeIdentityError(
      'EMPLOYEE_INACTIVE',
      'BBOS employee account is inactive.',
    );
  }

  if (!isUserRole(employee.role)) {
    throw new EmployeeIdentityError(
      'EMPLOYEE_ROLE_INVALID',
      'BBOS employee record contains an unknown role.',
    );
  }

  const employeeId =
    nonEmptyString(employee.employeeId) ||
    nonEmptyString(employee.id) ||
    nonEmptyString(candidate.documentId);

  if (!employeeId) {
    throw new EmployeeIdentityError(
      'EMPLOYEE_ID_INVALID',
      'BBOS employee record does not contain a stable employee identifier.',
    );
  }

  const name =
    nonEmptyString(employee.name) ||
    firebaseIdentity.name ||
    firebaseIdentity.email?.split('@')[0] ||
    employeeId;
  const email = nonEmptyString(employee.email) || firebaseIdentity.email || '';
  // `teamId` is accepted only as a migration-compatible legacy source. New
  // employee records and all authenticated principals use `salesTeamId`.
  const salesTeamId = nonEmptyString(employee.salesTeamId) || nonEmptyString(employee.teamId);
  const managerEmployeeId = nonEmptyString(employee.managerEmployeeId);

  return {
    firebaseUid: firebaseIdentity.firebaseUid,
    employeeId,
    role: employee.role,
    name,
    email,
    active: true,
    ...(salesTeamId ? { salesTeamId } : {}),
    ...(managerEmployeeId ? { managerEmployeeId } : {}),
    ...(nonEmptyString(employee.phone) ? { phone: nonEmptyString(employee.phone) } : {}),
    ...(nonEmptyString(employee.department) ? { department: nonEmptyString(employee.department) } : {}),
    ...(nonEmptyString(employee.createdAt) ? { createdAt: nonEmptyString(employee.createdAt) } : {}),
    ...(nonEmptyString(employee.lastLogin) ? { lastLogin: nonEmptyString(employee.lastLogin) } : {}),
  };
}
