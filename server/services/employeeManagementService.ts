import { randomUUID } from 'node:crypto';
import type { DocumentData } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '../firebaseAdmin.js';
import {
  isUserRole,
  type AuditLog,
  type EmployeeAccessSummary,
  type ManagedEmployee,
  type SalesTeam,
  type UserRole,
} from '../../src/types/index.js';
import type { AuthorizationPrincipal } from '../authorization/policyTypes.js';

type UnknownRecord = Record<string, unknown>;

export interface EmployeeManagementActor extends AuthorizationPrincipal {
  name: string;
}

export interface CreateEmployeeInput {
  employeeId: string;
  name: string;
  email: string;
  firebaseUid?: string | null;
  role: UserRole | string;
  active: boolean;
  salesTeamId?: string | null;
  managerEmployeeId?: string | null;
  department?: string | null;
  designation?: string | null;
  phone?: string | null;
  joiningDate?: string | null;
  reason?: string;
}

export type UpdateEmployeeInput = Partial<Omit<CreateEmployeeInput, 'employeeId'>> & {
  employeeId?: never;
};

export interface StoredEmployeeCandidate {
  documentId: string;
  data: UnknownRecord;
}

export interface StoredSalesTeam {
  documentId: string;
  data: UnknownRecord;
}

export interface EmployeeManagementTransaction {
  listEmployees(): Promise<StoredEmployeeCandidate[]>;
  listSalesTeams(): Promise<StoredSalesTeam[]>;
  setEmployee(documentId: string, data: UnknownRecord): void;
  setAuditLog(auditId: string, audit: AuditLog): void;
}

export interface EmployeeManagementStore {
  listEmployees(): Promise<StoredEmployeeCandidate[]>;
  listSalesTeams(): Promise<StoredSalesTeam[]>;
  runTransaction<T>(operation: (transaction: EmployeeManagementTransaction) => Promise<T>): Promise<T>;
}

export interface LoginIdentityDirectory {
  validateFirebaseUid(firebaseUid: string): Promise<void>;
}

export class EmployeeManagementError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'EmployeeManagementError';
  }
}

export class FirebaseLoginIdentityDirectory implements LoginIdentityDirectory {
  async validateFirebaseUid(firebaseUid: string): Promise<void> {
    try {
      const firebaseUser = await getAdminAuth().getUser(firebaseUid);
      if (firebaseUser.disabled) {
        throw new EmployeeManagementError(
          422,
          'FIREBASE_IDENTITY_DISABLED',
          'The linked Firebase login is disabled.',
        );
      }
    } catch (error) {
      if (error instanceof EmployeeManagementError) throw error;
      throw new EmployeeManagementError(
        422,
        'FIREBASE_IDENTITY_INVALID',
        'The Firebase UID does not resolve to an enabled Firebase Auth user.',
      );
    }
  }
}

export class FirestoreEmployeeManagementStore implements EmployeeManagementStore {
  async listEmployees(): Promise<StoredEmployeeCandidate[]> {
    const snapshot = await getAdminDb().collection('employees').get();
    return snapshot.docs.map((document) => ({
      documentId: document.id,
      data: (document.data() || {}) as UnknownRecord,
    }));
  }

  async listSalesTeams(): Promise<StoredSalesTeam[]> {
    const snapshot = await getAdminDb().collection('sales_teams').get();
    return snapshot.docs.map((document) => ({
      documentId: document.id,
      data: (document.data() || {}) as UnknownRecord,
    }));
  }

  async runTransaction<T>(operation: (transaction: EmployeeManagementTransaction) => Promise<T>): Promise<T> {
    const db = getAdminDb();
    return db.runTransaction(async (firestoreTransaction) => {
      const transaction: EmployeeManagementTransaction = {
        listEmployees: async () => {
          const snapshot = await firestoreTransaction.get(db.collection('employees'));
          return snapshot.docs.map((document) => ({
            documentId: document.id,
            data: (document.data() || {}) as UnknownRecord,
          }));
        },
        listSalesTeams: async () => {
          const snapshot = await firestoreTransaction.get(db.collection('sales_teams'));
          return snapshot.docs.map((document) => ({
            documentId: document.id,
            data: (document.data() || {}) as UnknownRecord,
          }));
        },
        setEmployee: (documentId, data) => {
          firestoreTransaction.set(db.collection('employees').doc(documentId), data as DocumentData);
        },
        setAuditLog: (auditId, audit) => {
          firestoreTransaction.set(db.collection('audit_logs').doc(auditId), audit);
        },
      };
      return operation(transaction);
    });
  }
}

const SERVER_FIELDS = new Set([
  'id',
  'createdAt',
  'updatedAt',
  'createdByEmployeeId',
  'updatedByEmployeeId',
  'accessSummary',
  'reassignmentRequired',
  'reassignmentNote',
]);

const MUTABLE_FIELDS = new Set([
  'name',
  'email',
  'firebaseUid',
  'role',
  'active',
  'salesTeamId',
  'managerEmployeeId',
  'department',
  'designation',
  'phone',
  'joiningDate',
  'reason',
]);

function asRecord(value: unknown): UnknownRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new EmployeeManagementError(400, 'INVALID_EMPLOYEE_PAYLOAD', 'Employee payload must be an object.');
  }
  return value as UnknownRecord;
}

function requiredString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
    throw new EmployeeManagementError(
      400,
      'INVALID_EMPLOYEE_FIELD',
      `${field} must be a non-empty string of at most ${maxLength} characters.`,
    );
  }
  return value.trim();
}

function optionalString(value: unknown, field: string, maxLength: number): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
    throw new EmployeeManagementError(
      400,
      'INVALID_EMPLOYEE_FIELD',
      `${field} must be a string of at most ${maxLength} characters.`,
    );
  }
  return value.trim();
}

function optionalIsoDate(value: unknown, field: string): string | undefined {
  const normalized = optionalString(value, field, 10);
  if (normalized === undefined) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new EmployeeManagementError(400, 'INVALID_EMPLOYEE_FIELD', `${field} must use YYYY-MM-DD format.`);
  }
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) {
    throw new EmployeeManagementError(400, 'INVALID_EMPLOYEE_FIELD', `${field} must be a valid calendar date.`);
  }
  return normalized;
}

function normalizeEmail(value: unknown): string {
  const email = requiredString(value, 'email', 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new EmployeeManagementError(400, 'INVALID_EMPLOYEE_EMAIL', 'A valid work email address is required.');
  }
  return email;
}

function canonicalEmployeeId(candidate: StoredEmployeeCandidate): string | undefined {
  const value = candidate.data.employeeId ?? candidate.data.id ?? candidate.documentId;
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function storedString(data: UnknownRecord, field: string): string | undefined {
  const value = data[field];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function assertActor(actor: EmployeeManagementActor): void {
  if (
    !actor ||
    actor.active !== true ||
    !actor.employeeId ||
    (actor.role !== 'Founder' && actor.role !== 'Admin')
  ) {
    throw new EmployeeManagementError(403, 'EMPLOYEE_ADMIN_FORBIDDEN', 'Founder or Admin access is required.');
  }
}

function ensureOnlyKnownFields(payload: UnknownRecord, creating: boolean): void {
  const permitted = creating ? new Set([...MUTABLE_FIELDS, 'employeeId']) : MUTABLE_FIELDS;
  for (const field of Object.keys(payload)) {
    if (SERVER_FIELDS.has(field) || (!creating && field === 'employeeId')) {
      throw new EmployeeManagementError(
        400,
        field === 'employeeId' ? 'EMPLOYEE_ID_IMMUTABLE' : 'SERVER_FIELD_FORBIDDEN',
        field === 'employeeId'
          ? 'Stable employeeId cannot be changed after creation.'
          : `${field} is server-controlled.`,
      );
    }
    if (!permitted.has(field)) {
      throw new EmployeeManagementError(400, 'UNKNOWN_EMPLOYEE_FIELD', `Unknown employee field: ${field}.`);
    }
  }
}

function normalizeTeam(team: StoredSalesTeam): SalesTeam | null {
  const id = storedString(team.data, 'id') || team.documentId;
  const name = storedString(team.data, 'name');
  const managerEmployeeId = storedString(team.data, 'managerEmployeeId');
  if (!id || !name || !managerEmployeeId || typeof team.data.active !== 'boolean') return null;
  return {
    id,
    name,
    managerEmployeeId,
    active: team.data.active,
    ...(storedString(team.data, 'createdAt') ? { createdAt: storedString(team.data, 'createdAt') } : {}),
    ...(storedString(team.data, 'updatedAt') ? { updatedAt: storedString(team.data, 'updatedAt') } : {}),
  };
}

function accessSummary(role: UserRole): EmployeeAccessSummary {
  switch (role) {
    case 'Founder':
      return { scope: 'Broad administrative access', details: ['Company-wide business access', 'Employee and access management'] };
    case 'Admin':
      return { scope: 'Broad administrative access', details: ['Company-wide operational access', 'Employee and access management'] };
    case 'Accounts':
      return { scope: 'Financial access', details: ['Company-wide authorized financial and business reads', 'Customer payment verification'] };
    case 'Sales Manager':
      return { scope: 'TEAM Sales scope', details: ['Commercial access for the assigned sales team', 'No cross-team authority'] };
    case 'Sales Executive':
      return { scope: 'OWN Sales scope', details: ['Commercial access to owned records', "No access to another Executive's records"] };
    case 'Reservations':
      return { scope: 'ASSIGNED Reservations scope', details: ['Supplier coordination for assigned Bookings', 'No company-wide commercial access'] };
    case 'Operations':
      return { scope: 'ASSIGNED Operations scope', details: ['Operational access to assigned Bookings', 'No unrestricted commercial financial access'] };
    case 'Marketing':
      return { scope: 'Marketing scope', details: ['Marketing tools and aggregate attribution', 'No raw Trip, Quote, or Booking access'] };
  }
}

function managedFieldsFromStored(candidate: StoredEmployeeCandidate): ManagedEmployee | null {
  const employeeId = canonicalEmployeeId(candidate);
  const role = candidate.data.role;
  const name = storedString(candidate.data, 'name');
  const email = storedString(candidate.data, 'email');
  const createdAt = storedString(candidate.data, 'createdAt');
  const updatedAt = storedString(candidate.data, 'updatedAt');
  const createdByEmployeeId = storedString(candidate.data, 'createdByEmployeeId');
  const updatedByEmployeeId = storedString(candidate.data, 'updatedByEmployeeId');
  if (
    !employeeId ||
    !isUserRole(role) ||
    !name ||
    !email ||
    typeof candidate.data.active !== 'boolean'
  ) {
    return null;
  }
  const active = candidate.data.active;
  return {
    employeeId,
    name,
    email,
    role,
    active,
    ...(storedString(candidate.data, 'firebaseUid') ? { firebaseUid: storedString(candidate.data, 'firebaseUid') } : {}),
    ...(storedString(candidate.data, 'salesTeamId') || storedString(candidate.data, 'teamId')
      ? { salesTeamId: storedString(candidate.data, 'salesTeamId') || storedString(candidate.data, 'teamId') }
      : {}),
    ...(storedString(candidate.data, 'managerEmployeeId') ? { managerEmployeeId: storedString(candidate.data, 'managerEmployeeId') } : {}),
    ...(storedString(candidate.data, 'department') ? { department: storedString(candidate.data, 'department') } : {}),
    ...(storedString(candidate.data, 'designation') ? { designation: storedString(candidate.data, 'designation') } : {}),
    ...(storedString(candidate.data, 'phone') ? { phone: storedString(candidate.data, 'phone') } : {}),
    ...(storedString(candidate.data, 'joiningDate') ? { joiningDate: storedString(candidate.data, 'joiningDate') } : {}),
    createdAt: createdAt || '',
    updatedAt: updatedAt || '',
    createdByEmployeeId: createdByEmployeeId || '',
    updatedByEmployeeId: updatedByEmployeeId || '',
    accessSummary: accessSummary(role),
    reassignmentRequired: !active,
    ...(!active ? { reassignmentNote: 'Existing assignments remain unchanged and require manual reassignment.' } : {}),
  };
}

function persistedEmployee(employee: ManagedEmployee, existing?: UnknownRecord): UnknownRecord {
  const data: UnknownRecord = {
    ...(existing || {}),
    employeeId: employee.employeeId,
    name: employee.name,
    email: employee.email,
    role: employee.role,
    active: employee.active,
    createdAt: employee.createdAt,
    updatedAt: employee.updatedAt,
    createdByEmployeeId: employee.createdByEmployeeId,
    updatedByEmployeeId: employee.updatedByEmployeeId,
  };
  delete data.teamId;
  for (const field of [
    'firebaseUid',
    'salesTeamId',
    'managerEmployeeId',
    'department',
    'designation',
    'phone',
    'joiningDate',
  ] as const) {
    const value = employee[field];
    if (value) data[field] = value;
    else delete data[field];
  }
  return data;
}

function baseEmployeeFromCreate(payload: UnknownRecord, actor: EmployeeManagementActor, now: string): ManagedEmployee {
  const employeeId = requiredString(payload.employeeId, 'employeeId', 64);
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{2,63}$/.test(employeeId)) {
    throw new EmployeeManagementError(
      400,
      'INVALID_EMPLOYEE_ID',
      'employeeId must be 3-64 letters, numbers, hyphens, or underscores.',
    );
  }
  if (!isUserRole(payload.role)) {
    throw new EmployeeManagementError(400, 'INVALID_EMPLOYEE_ROLE', 'Employee role must be a canonical BBOS role.');
  }
  if (typeof payload.active !== 'boolean') {
    throw new EmployeeManagementError(400, 'INVALID_EMPLOYEE_FIELD', 'active must be a boolean.');
  }
  return {
    employeeId,
    name: requiredString(payload.name, 'name', 120),
    email: normalizeEmail(payload.email),
    role: payload.role,
    active: payload.active,
    ...(optionalString(payload.firebaseUid, 'firebaseUid', 128) ? { firebaseUid: optionalString(payload.firebaseUid, 'firebaseUid', 128) } : {}),
    ...(optionalString(payload.salesTeamId, 'salesTeamId', 64) ? { salesTeamId: optionalString(payload.salesTeamId, 'salesTeamId', 64) } : {}),
    ...(optionalString(payload.managerEmployeeId, 'managerEmployeeId', 64) ? { managerEmployeeId: optionalString(payload.managerEmployeeId, 'managerEmployeeId', 64) } : {}),
    ...(optionalString(payload.department, 'department', 120) ? { department: optionalString(payload.department, 'department', 120) } : {}),
    ...(optionalString(payload.designation, 'designation', 120) ? { designation: optionalString(payload.designation, 'designation', 120) } : {}),
    ...(optionalString(payload.phone, 'phone', 30) ? { phone: optionalString(payload.phone, 'phone', 30) } : {}),
    ...(optionalIsoDate(payload.joiningDate, 'joiningDate') ? { joiningDate: optionalIsoDate(payload.joiningDate, 'joiningDate') } : {}),
    createdAt: now,
    updatedAt: now,
    createdByEmployeeId: actor.employeeId,
    updatedByEmployeeId: actor.employeeId,
    accessSummary: accessSummary(payload.role),
    reassignmentRequired: !payload.active,
    ...(!payload.active ? { reassignmentNote: 'Existing assignments remain unchanged and require manual reassignment.' } : {}),
  };
}

function mergeEmployeeUpdate(
  current: ManagedEmployee,
  payload: UnknownRecord,
  actor: EmployeeManagementActor,
  now: string,
): ManagedEmployee {
  const role = payload.role === undefined ? current.role : payload.role;
  if (!isUserRole(role)) {
    throw new EmployeeManagementError(400, 'INVALID_EMPLOYEE_ROLE', 'Employee role must be a canonical BBOS role.');
  }
  const active = payload.active === undefined ? current.active : payload.active;
  if (typeof active !== 'boolean') {
    throw new EmployeeManagementError(400, 'INVALID_EMPLOYEE_FIELD', 'active must be a boolean.');
  }
  const next: ManagedEmployee = {
    ...current,
    name: payload.name === undefined ? current.name : requiredString(payload.name, 'name', 120),
    email: payload.email === undefined ? current.email : normalizeEmail(payload.email),
    role,
    active,
    updatedAt: now,
    updatedByEmployeeId: actor.employeeId,
    accessSummary: accessSummary(role),
    reassignmentRequired: !active,
  };
  const optionalFields: Array<[keyof ManagedEmployee, string, number]> = [
    ['firebaseUid', 'firebaseUid', 128],
    ['salesTeamId', 'salesTeamId', 64],
    ['managerEmployeeId', 'managerEmployeeId', 64],
    ['department', 'department', 120],
    ['designation', 'designation', 120],
    ['phone', 'phone', 30],
  ];
  for (const [key, field, maxLength] of optionalFields) {
    if (payload[field] !== undefined) {
      const value = optionalString(payload[field], field, maxLength);
      if (value) (next as unknown as UnknownRecord)[key] = value;
      else delete (next as unknown as UnknownRecord)[key];
    }
  }
  if (payload.joiningDate !== undefined) {
    const value = optionalIsoDate(payload.joiningDate, 'joiningDate');
    if (value) next.joiningDate = value;
    else delete next.joiningDate;
  }
  if (!active) next.reassignmentNote = 'Existing assignments remain unchanged and require manual reassignment.';
  else delete next.reassignmentNote;
  return next;
}

function assertUniqueIdentity(
  employee: ManagedEmployee,
  employees: StoredEmployeeCandidate[],
  targetDocumentId?: string,
): void {
  for (const candidate of employees) {
    if (candidate.documentId === targetDocumentId) continue;
    const candidateEmployeeId = canonicalEmployeeId(candidate);
    if (candidateEmployeeId === employee.employeeId) {
      throw new EmployeeManagementError(409, 'EMPLOYEE_ID_EXISTS', 'employeeId is already in use.');
    }
    const candidateEmail = storedString(candidate.data, 'email')?.toLowerCase();
    if (candidateEmail === employee.email.toLowerCase()) {
      throw new EmployeeManagementError(409, 'EMPLOYEE_EMAIL_EXISTS', 'Work email is already in use.');
    }
    const candidateFirebaseUid = storedString(candidate.data, 'firebaseUid');
    if (employee.firebaseUid && candidateFirebaseUid === employee.firebaseUid) {
      throw new EmployeeManagementError(409, 'FIREBASE_UID_EXISTS', 'Firebase UID is already linked to another employee.');
    }
  }
}

function assertOrganization(
  employee: ManagedEmployee,
  employees: StoredEmployeeCandidate[],
  teams: SalesTeam[],
): void {
  const isSalesRole = employee.role === 'Sales Executive' || employee.role === 'Sales Manager';
  if (!isSalesRole) {
    if (employee.salesTeamId || employee.managerEmployeeId) {
      throw new EmployeeManagementError(
        422,
        'INVALID_ORGANIZATION_RELATIONSHIP',
        'Only Sales roles may have salesTeamId or managerEmployeeId.',
      );
    }
    return;
  }

  if (!employee.salesTeamId) {
    throw new EmployeeManagementError(422, 'SALES_TEAM_REQUIRED', 'Sales roles require an active sales team.');
  }
  const team = teams.find((candidate) => candidate.id === employee.salesTeamId);
  if (!team || !team.active) {
    throw new EmployeeManagementError(422, 'SALES_TEAM_INVALID', 'The selected sales team does not exist or is inactive.');
  }

  if (employee.role === 'Sales Manager') {
    if (employee.managerEmployeeId) {
      throw new EmployeeManagementError(
        422,
        'INVALID_ORGANIZATION_RELATIONSHIP',
        'Sales Managers cannot be assigned through managerEmployeeId.',
      );
    }
    if (team.managerEmployeeId !== employee.employeeId) {
      throw new EmployeeManagementError(
        422,
        'SALES_TEAM_MANAGER_MISMATCH',
        'The Sales Manager must match the team managerEmployeeId.',
      );
    }
    return;
  }

  if (!employee.managerEmployeeId) {
    throw new EmployeeManagementError(422, 'MANAGER_REQUIRED', 'Sales Executives require an active Sales Manager.');
  }
  if (employee.managerEmployeeId === employee.employeeId) {
    throw new EmployeeManagementError(422, 'SELF_MANAGER_FORBIDDEN', 'An employee cannot manage themselves.');
  }
  const managerCandidate = employees.find((candidate) => canonicalEmployeeId(candidate) === employee.managerEmployeeId);
  const managerTeam = managerCandidate
    ? storedString(managerCandidate.data, 'salesTeamId') || storedString(managerCandidate.data, 'teamId')
    : undefined;
  if (
    !managerCandidate ||
    managerCandidate.data.active !== true ||
    managerCandidate.data.role !== 'Sales Manager' ||
    managerTeam !== employee.salesTeamId ||
    team.managerEmployeeId !== employee.managerEmployeeId
  ) {
    throw new EmployeeManagementError(
      422,
      'MANAGER_INVALID',
      'The manager must be the active Sales Manager for the selected team.',
    );
  }
}

function auditEvent(
  action: string,
  actor: EmployeeManagementActor,
  targetEmployeeId: string,
  before: ManagedEmployee | null,
  after: ManagedEmployee,
  timestamp: string,
  reason?: string,
): AuditLog {
  return {
    id: `audit-employee-${randomUUID()}`,
    timestamp,
    actorType: 'HUMAN',
    actorId: actor.employeeId,
    actorName: actor.name,
    action,
    entityType: 'EMPLOYEE',
    entityId: targetEmployeeId,
    before: before ? { ...before } : null,
    after: { ...after },
    ...(reason ? { reason } : {}),
  };
}

function changedActions(before: ManagedEmployee, after: ManagedEmployee): string[] {
  const actions: string[] = [];
  if (before.role !== after.role) actions.push('EMPLOYEE_ROLE_CHANGED');
  if (before.salesTeamId !== after.salesTeamId) actions.push('EMPLOYEE_TEAM_CHANGED');
  if (before.managerEmployeeId !== after.managerEmployeeId) actions.push('EMPLOYEE_MANAGER_CHANGED');
  if (before.active !== after.active) actions.push(after.active ? 'EMPLOYEE_ACTIVATED' : 'EMPLOYEE_DEACTIVATED');
  const profileChanged = [
    'name', 'email', 'firebaseUid', 'department', 'designation', 'phone', 'joiningDate',
  ].some((field) => before[field as keyof ManagedEmployee] !== after[field as keyof ManagedEmployee]);
  if (profileChanged) actions.push('EMPLOYEE_PROFILE_UPDATED');
  return actions;
}

function assertLastFounderProtected(before: ManagedEmployee, after: ManagedEmployee, employees: StoredEmployeeCandidate[]): void {
  if (before.role !== 'Founder' || before.active !== true) return;
  if (after.role === 'Founder' && after.active === true) return;
  const activeFounders = employees.filter((candidate) =>
    canonicalEmployeeId(candidate) !== before.employeeId &&
    candidate.data.role === 'Founder' &&
    candidate.data.active === true
  );
  if (activeFounders.length === 0) {
    throw new EmployeeManagementError(
      409,
      'LAST_ACTIVE_FOUNDER',
      'The last active Founder cannot be deactivated or assigned another role.',
    );
  }
}

function assertManagerChangeSafe(before: ManagedEmployee, after: ManagedEmployee, employees: StoredEmployeeCandidate[]): void {
  if (before.role !== 'Sales Manager' || before.active !== true || after.active === false) return;
  if (after.role === 'Sales Manager' && after.salesTeamId === before.salesTeamId) return;
  const activeReports = employees.filter((candidate) =>
    candidate.data.active === true && storedString(candidate.data, 'managerEmployeeId') === before.employeeId
  );
  if (activeReports.length > 0) {
    throw new EmployeeManagementError(
      409,
      'ACTIVE_REPORTS_REQUIRE_REASSIGNMENT',
      "Reassign active Sales Executives before changing this manager's role or team.",
      { employeeIds: activeReports.map((candidate) => canonicalEmployeeId(candidate)).filter(Boolean) },
    );
  }
}

export class EmployeeManagementService {
  constructor(
    private readonly store: EmployeeManagementStore = new FirestoreEmployeeManagementStore(),
    private readonly loginDirectory: LoginIdentityDirectory = new FirebaseLoginIdentityDirectory(),
  ) {}

  async listEmployees(actor: EmployeeManagementActor): Promise<{ employees: ManagedEmployee[]; teams: SalesTeam[] }> {
    assertActor(actor);
    const [storedEmployees, storedTeams] = await Promise.all([
      this.store.listEmployees(),
      this.store.listSalesTeams(),
    ]);
    const employees = storedEmployees
      .map(managedFieldsFromStored)
      .filter((employee): employee is ManagedEmployee => Boolean(employee))
      .sort((left, right) => left.name.localeCompare(right.name));
    const teams = storedTeams
      .map(normalizeTeam)
      .filter((team): team is SalesTeam => Boolean(team))
      .sort((left, right) => left.name.localeCompare(right.name));
    return { employees, teams };
  }

  async getEmployee(employeeId: string, actor: EmployeeManagementActor): Promise<ManagedEmployee> {
    assertActor(actor);
    const normalizedId = requiredString(employeeId, 'employeeId', 64);
    const employees = await this.store.listEmployees();
    const matches = employees.filter((candidate) => canonicalEmployeeId(candidate) === normalizedId);
    if (matches.length !== 1) {
      throw new EmployeeManagementError(
        matches.length === 0 ? 404 : 409,
        matches.length === 0 ? 'EMPLOYEE_NOT_FOUND' : 'EMPLOYEE_ID_AMBIGUOUS',
        matches.length === 0 ? 'Employee not found.' : 'Stable employeeId resolves to multiple employee records.',
      );
    }
    const employee = managedFieldsFromStored(matches[0]);
    if (!employee) {
      throw new EmployeeManagementError(422, 'EMPLOYEE_RECORD_INVALID', 'Employee record is malformed.');
    }
    return employee;
  }

  async createEmployee(input: unknown, actor: EmployeeManagementActor): Promise<ManagedEmployee> {
    assertActor(actor);
    const payload = asRecord(input);
    ensureOnlyKnownFields(payload, true);
    const now = new Date().toISOString();
    const employee = baseEmployeeFromCreate(payload, actor, now);
    const reason = optionalString(payload.reason, 'reason', 500);
    if (employee.firebaseUid) await this.loginDirectory.validateFirebaseUid(employee.firebaseUid);

    return this.store.runTransaction(async (transaction) => {
      const employees = await transaction.listEmployees();
      const teams = (await transaction.listSalesTeams())
        .map(normalizeTeam)
        .filter((team): team is SalesTeam => Boolean(team));
      assertUniqueIdentity(employee, employees);
      assertOrganization(employee, employees, teams);

      const stored = persistedEmployee(employee);
      transaction.setEmployee(employee.employeeId, stored);
      const audit = auditEvent('EMPLOYEE_CREATED', actor, employee.employeeId, null, employee, now, reason);
      transaction.setAuditLog(audit.id, audit);
      return employee;
    });
  }

  async updateEmployee(
    employeeId: string,
    input: unknown,
    actor: EmployeeManagementActor,
  ): Promise<ManagedEmployee> {
    assertActor(actor);
    const normalizedId = requiredString(employeeId, 'employeeId', 64);
    const payload = asRecord(input);
    ensureOnlyKnownFields(payload, false);
    const reason = optionalString(payload.reason, 'reason', 500);
    const now = new Date().toISOString();

    const requestedFirebaseUid = payload.firebaseUid === undefined
      ? undefined
      : optionalString(payload.firebaseUid, 'firebaseUid', 128);
    if (requestedFirebaseUid) await this.loginDirectory.validateFirebaseUid(requestedFirebaseUid);

    return this.store.runTransaction(async (transaction) => {
      const employees = await transaction.listEmployees();
      const teams = (await transaction.listSalesTeams())
        .map(normalizeTeam)
        .filter((team): team is SalesTeam => Boolean(team));
      const matches = employees.filter((candidate) => canonicalEmployeeId(candidate) === normalizedId);
      if (matches.length !== 1) {
        throw new EmployeeManagementError(
          matches.length === 0 ? 404 : 409,
          matches.length === 0 ? 'EMPLOYEE_NOT_FOUND' : 'EMPLOYEE_ID_AMBIGUOUS',
          matches.length === 0 ? 'Employee not found.' : 'Stable employeeId resolves to multiple employee records.',
        );
      }
      const current = managedFieldsFromStored(matches[0]);
      if (!current) {
        throw new EmployeeManagementError(422, 'EMPLOYEE_RECORD_INVALID', 'Employee record is malformed.');
      }
      const next = mergeEmployeeUpdate(current, payload, actor, now);
      assertUniqueIdentity(next, employees, matches[0].documentId);
      assertLastFounderProtected(current, next, employees);
      assertManagerChangeSafe(current, next, employees);
      if (next.active) assertOrganization(next, employees, teams);

      const actions = changedActions(current, next);
      if (actions.length === 0) {
        throw new EmployeeManagementError(400, 'NO_EMPLOYEE_CHANGES', 'No employee fields changed.');
      }

      transaction.setEmployee(matches[0].documentId, persistedEmployee(next, matches[0].data));
      for (const action of actions) {
        const audit = auditEvent(action, actor, next.employeeId, current, next, now, reason);
        transaction.setAuditLog(audit.id, audit);
      }
      return next;
    });
  }
}

export class InMemoryEmployeeManagementStore implements EmployeeManagementStore {
  private employees = new Map<string, UnknownRecord>();
  private teams = new Map<string, UnknownRecord>();
  private audits = new Map<string, AuditLog>();

  constructor(initial?: { employees?: StoredEmployeeCandidate[]; teams?: StoredSalesTeam[] }) {
    for (const employee of initial?.employees || []) this.employees.set(employee.documentId, structuredClone(employee.data));
    for (const team of initial?.teams || []) this.teams.set(team.documentId, structuredClone(team.data));
  }

  async listEmployees(): Promise<StoredEmployeeCandidate[]> {
    return [...this.employees.entries()].map(([documentId, data]) => ({ documentId, data: structuredClone(data) }));
  }

  async listSalesTeams(): Promise<StoredSalesTeam[]> {
    return [...this.teams.entries()].map(([documentId, data]) => ({ documentId, data: structuredClone(data) }));
  }

  async runTransaction<T>(operation: (transaction: EmployeeManagementTransaction) => Promise<T>): Promise<T> {
    const employeeSnapshot = new Map([...this.employees].map(([key, value]) => [key, structuredClone(value)]));
    const teamSnapshot = new Map([...this.teams].map(([key, value]) => [key, structuredClone(value)]));
    const stagedEmployees = new Map<string, UnknownRecord>();
    const stagedAudits = new Map<string, AuditLog>();
    const transaction: EmployeeManagementTransaction = {
      listEmployees: async () => [...employeeSnapshot.entries()].map(([documentId, data]) => ({
        documentId,
        data: structuredClone(data),
      })),
      listSalesTeams: async () => [...teamSnapshot.entries()].map(([documentId, data]) => ({
        documentId,
        data: structuredClone(data),
      })),
      setEmployee: (documentId, data) => stagedEmployees.set(documentId, structuredClone(data)),
      setAuditLog: (auditId, audit) => stagedAudits.set(auditId, structuredClone(audit)),
    };
    const result = await operation(transaction);
    for (const [key, value] of stagedEmployees) this.employees.set(key, value);
    for (const [key, value] of stagedAudits) this.audits.set(key, value);
    return result;
  }

  getAuditLogs(): AuditLog[] {
    return [...this.audits.values()].map((audit) => structuredClone(audit));
  }

  getRawEmployee(documentId: string): UnknownRecord | undefined {
    const employee = this.employees.get(documentId);
    return employee ? structuredClone(employee) : undefined;
  }
}
