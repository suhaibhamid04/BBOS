import { randomUUID } from 'node:crypto';
import type { DocumentData } from 'firebase-admin/firestore';
import { authorizeResource } from '../authorization/policyEngine.js';
import { bookingResourceContext } from '../authorization/resourceContext.js';
import type { AuthorizationPrincipal } from '../authorization/policyTypes.js';
import { getAdminDb } from '../firebaseAdmin.js';
import type { AuditLog, UserRole } from '../../src/types/index.js';
import type { Booking } from '../../src/types/booking.js';

type UnknownRecord = Record<string, unknown>;

export interface ReservationsAssignmentActor extends AuthorizationPrincipal {
  name: string;
  role: UserRole | string;
}

export interface ReservationsEmployee {
  employeeId: string;
  name: string;
  role: string;
  active: boolean;
}

export interface ReservationsAssignmentInput {
  employeeId: string;
  expectedUpdatedAt: string;
  reason?: string;
}

export interface ReservationsAssignmentCommit {
  bookingId: string;
  reservationsEmployeeId: string;
  expectedUpdatedAt: string;
  updates: Partial<Booking>;
  auditLog: AuditLog;
}

export interface ReservationsAssignmentStorage {
  getBooking(bookingId: string): Promise<Booking | null>;
  resolveEmployees(employeeId: string): Promise<ReservationsEmployee[]>;
  listActiveReservationsEmployees(): Promise<ReservationsEmployee[]>;
  commitAssignment(commit: ReservationsAssignmentCommit): Promise<void>;
}

export class ReservationsAssignmentError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ReservationsAssignmentError';
  }
}

function parseInput(value: unknown): ReservationsAssignmentInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ReservationsAssignmentError(400, 'INVALID_ASSIGNMENT_PAYLOAD', 'Assignment payload must be an object.');
  }
  const input = value as UnknownRecord;
  const knownFields = new Set(['employeeId', 'expectedUpdatedAt', 'reason']);
  for (const field of Object.keys(input)) {
    if (!knownFields.has(field)) {
      throw new ReservationsAssignmentError(400, 'UNKNOWN_ASSIGNMENT_FIELD', `Unknown assignment field: ${field}.`);
    }
  }
  const employeeId = typeof input.employeeId === 'string' ? input.employeeId.trim() : '';
  const expectedUpdatedAt = typeof input.expectedUpdatedAt === 'string' ? input.expectedUpdatedAt.trim() : '';
  const reason = typeof input.reason === 'string' ? input.reason.trim() : undefined;
  if (!employeeId || employeeId.length > 64) {
    throw new ReservationsAssignmentError(400, 'INVALID_EMPLOYEE_ID', 'A stable BBOS employeeId is required.');
  }
  if (!expectedUpdatedAt || expectedUpdatedAt.length > 64) {
    throw new ReservationsAssignmentError(400, 'EXPECTED_VERSION_REQUIRED', 'The current Booking updatedAt value is required.');
  }
  if (reason && reason.length > 500) {
    throw new ReservationsAssignmentError(400, 'INVALID_ASSIGNMENT_REASON', 'Assignment reason must not exceed 500 characters.');
  }
  return { employeeId, expectedUpdatedAt, ...(reason ? { reason } : {}) };
}

function canonicalEmployee(documentId: string, data: UnknownRecord): ReservationsEmployee {
  const employeeId = typeof data.employeeId === 'string' && data.employeeId.trim()
    ? data.employeeId.trim()
    : typeof data.id === 'string' && data.id.trim()
      ? data.id.trim()
      : documentId;
  return {
    employeeId,
    name: typeof data.name === 'string' && data.name.trim() ? data.name.trim() : employeeId,
    role: typeof data.role === 'string' ? data.role : '',
    active: data.active === true,
  };
}

function assertAdministrativeActor(actor: ReservationsAssignmentActor): void {
  const decision = authorizeResource(
    actor,
    'BOOKING',
    'ASSIGN_RESERVATIONS',
    { status: 'PENDING_PAYMENT' },
  );
  if (!decision.allowed) {
    throw new ReservationsAssignmentError(403, decision.code, decision.reason);
  }
}

export class ReservationsAssignmentService {
  constructor(
    private readonly storage: ReservationsAssignmentStorage = new FirestoreReservationsAssignmentStorage(),
    private readonly now: () => Date = () => new Date(),
  ) {}

  async listEligibleEmployees(actor: ReservationsAssignmentActor): Promise<ReservationsEmployee[]> {
    assertAdministrativeActor(actor);
    return this.storage.listActiveReservationsEmployees();
  }

  async assign(
    bookingId: string,
    input: unknown,
    actor: ReservationsAssignmentActor,
  ): Promise<{
    bookingId: string;
    assignedReservationsEmployeeId: string;
    updatedAt: string;
    isIdempotent?: boolean;
  }> {
    const request = parseInput(input);
    const booking = await this.storage.getBooking(bookingId);
    if (!booking) {
      throw new ReservationsAssignmentError(404, 'BOOKING_NOT_FOUND', 'Booking not found.');
    }
    const decision = authorizeResource(
      actor,
      'BOOKING',
      'ASSIGN_RESERVATIONS',
      bookingResourceContext(booking),
    );
    if (!decision.allowed) {
      const status = decision.code === 'WORKFLOW_STATE_DENIED' ? 422 : 403;
      throw new ReservationsAssignmentError(status, decision.code, decision.reason);
    }
    if (booking.updatedAt !== request.expectedUpdatedAt) {
      throw new ReservationsAssignmentError(409, 'RESERVATIONS_ASSIGNMENT_CONFLICT', 'Booking assignment changed; reload and retry.');
    }

    const matches = await this.storage.resolveEmployees(request.employeeId);
    if (matches.length === 0) {
      throw new ReservationsAssignmentError(422, 'RESERVATIONS_EMPLOYEE_NOT_FOUND', 'The employee does not exist.');
    }
    if (matches.length !== 1 || matches[0].employeeId !== request.employeeId) {
      throw new ReservationsAssignmentError(409, 'RESERVATIONS_EMPLOYEE_AMBIGUOUS', 'The employeeId does not resolve uniquely.');
    }
    const employee = matches[0];
    if (!employee.active) {
      throw new ReservationsAssignmentError(422, 'RESERVATIONS_EMPLOYEE_INACTIVE', 'Inactive employees cannot receive new assignments.');
    }
    if (employee.role !== 'Reservations') {
      throw new ReservationsAssignmentError(422, 'RESERVATIONS_ROLE_REQUIRED', 'Only an active Reservations employee may be assigned.');
    }
    if (booking.assignedReservationsEmployeeId === employee.employeeId) {
      return {
        bookingId,
        assignedReservationsEmployeeId: employee.employeeId,
        updatedAt: booking.updatedAt,
        isIdempotent: true,
      };
    }

    const now = this.now().toISOString();
    const action = booking.assignedReservationsEmployeeId
      ? 'RESERVATIONS_REASSIGNED'
      : 'RESERVATIONS_ASSIGNED';
    const auditLog: AuditLog = {
      id: `audit-reservations-assignment-${randomUUID()}`,
      timestamp: now,
      actorType: 'HUMAN',
      actorId: actor.employeeId,
      actorName: `${actor.name} (${actor.role})`,
      action,
      entityType: 'BOOKING',
      entityId: booking.id,
      before: { assignedReservationsEmployeeId: booking.assignedReservationsEmployeeId || null },
      after: { assignedReservationsEmployeeId: employee.employeeId },
      reason: request.reason || `${action === 'RESERVATIONS_ASSIGNED' ? 'Assigned' : 'Reassigned'} to ${employee.name}.`,
    };
    await this.storage.commitAssignment({
      bookingId: booking.id,
      reservationsEmployeeId: employee.employeeId,
      expectedUpdatedAt: request.expectedUpdatedAt,
      updates: { assignedReservationsEmployeeId: employee.employeeId, updatedAt: now },
      auditLog,
    });
    return { bookingId, assignedReservationsEmployeeId: employee.employeeId, updatedAt: now };
  }
}

export class InMemoryReservationsAssignmentStorage implements ReservationsAssignmentStorage {
  private readonly bookings = new Map<string, Booking>();
  private readonly employees: Array<ReservationsEmployee & { documentId: string }>;
  private readonly audits: AuditLog[] = [];
  private mutationCount = 0;

  constructor(initial?: { bookings?: Booking[]; employees?: Array<ReservationsEmployee & { documentId?: string }> }) {
    for (const booking of initial?.bookings || []) this.bookings.set(booking.id, structuredClone(booking));
    this.employees = (initial?.employees || []).map((employee, index) => ({
      ...structuredClone(employee),
      documentId: employee.documentId || `employee-${index}`,
    }));
  }

  async getBooking(bookingId: string) {
    const booking = this.bookings.get(bookingId);
    return booking ? structuredClone(booking) : null;
  }

  async resolveEmployees(employeeId: string): Promise<ReservationsEmployee[]> {
    return this.employees
      .filter(employee => employee.employeeId === employeeId)
      .map(({ documentId: _documentId, ...employee }) => structuredClone(employee));
  }

  async listActiveReservationsEmployees() {
    const counts = new Map<string, number>();
    for (const employee of this.employees) counts.set(employee.employeeId, (counts.get(employee.employeeId) || 0) + 1);
    return this.employees
      .filter(employee => employee.active && employee.role === 'Reservations' && counts.get(employee.employeeId) === 1)
      .map(({ documentId: _documentId, ...employee }) => structuredClone(employee))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  async commitAssignment(commit: ReservationsAssignmentCommit) {
    const booking = this.bookings.get(commit.bookingId);
    const matches = this.employees.filter(employee => employee.employeeId === commit.reservationsEmployeeId);
    if (matches.length !== 1 || !matches[0].active || matches[0].role !== 'Reservations') {
      throw new ReservationsAssignmentError(409, 'RESERVATIONS_EMPLOYEE_CHANGED', 'The selected employee is no longer eligible for assignment.');
    }
    if (
      !booking ||
      booking.updatedAt !== commit.expectedUpdatedAt ||
      !['PENDING_PAYMENT', 'CONFIRMED'].includes(booking.status)
    ) {
      throw new ReservationsAssignmentError(409, 'RESERVATIONS_ASSIGNMENT_CONFLICT', 'Booking assignment changed; reload and retry.');
    }
    this.bookings.set(commit.bookingId, { ...booking, ...structuredClone(commit.updates) });
    this.audits.push(structuredClone(commit.auditLog));
    this.mutationCount += 2;
  }

  getBookingSync(bookingId: string) { return this.bookings.get(bookingId); }
  getAudits() { return structuredClone(this.audits); }
  getMutationCount() { return this.mutationCount; }
}

export class FirestoreReservationsAssignmentStorage implements ReservationsAssignmentStorage {
  private db() { return getAdminDb(); }

  async getBooking(bookingId: string) {
    const document = await this.db().collection('bookings').doc(bookingId).get();
    return document.exists ? { ...document.data(), id: document.id } as Booking : null;
  }

  async resolveEmployees(employeeId: string): Promise<ReservationsEmployee[]> {
    const db = this.db();
    const [matches, legacy] = await Promise.all([
      db.collection('employees').where('employeeId', '==', employeeId).limit(2).get(),
      db.collection('employees').doc(employeeId).get(),
    ]);
    const candidates = new Map<string, FirebaseFirestore.DocumentSnapshot>();
    for (const document of matches.docs) candidates.set(document.id, document);
    if (legacy.exists) candidates.set(legacy.id, legacy);
    return [...candidates.values()].map(document => canonicalEmployee(document.id, document.data() || {}));
  }

  async listActiveReservationsEmployees(): Promise<ReservationsEmployee[]> {
    const snapshot = await this.db().collection('employees').where('role', '==', 'Reservations').get();
    const groups = new Map<string, ReservationsEmployee[]>();
    for (const document of snapshot.docs) {
      const employee = canonicalEmployee(document.id, document.data() || {});
      const group = groups.get(employee.employeeId) || [];
      group.push(employee);
      groups.set(employee.employeeId, group);
    }
    return [...groups.values()]
      .filter(group => group.length === 1 && group[0].active)
      .map(group => group[0])
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  async commitAssignment(commit: ReservationsAssignmentCommit): Promise<void> {
    const db = this.db();
    const bookingRef = db.collection('bookings').doc(commit.bookingId);
    const auditRef = db.collection('audit_logs').doc(commit.auditLog.id);
    await db.runTransaction(async transaction => {
      const employeeQuery = db.collection('employees')
        .where('employeeId', '==', commit.reservationsEmployeeId)
        .limit(2);
      const employeeMatches = await transaction.get(employeeQuery);
      const legacyEmployee = await transaction.get(db.collection('employees').doc(commit.reservationsEmployeeId));
      const candidates = new Map<string, FirebaseFirestore.DocumentSnapshot>();
      for (const document of employeeMatches.docs) candidates.set(document.id, document);
      if (legacyEmployee.exists) candidates.set(legacyEmployee.id, legacyEmployee);
      if (candidates.size !== 1) {
        throw new ReservationsAssignmentError(409, 'RESERVATIONS_EMPLOYEE_CHANGED', 'The selected employee no longer resolves uniquely.');
      }
      const employeeDocument = [...candidates.values()][0];
      const employee = canonicalEmployee(employeeDocument.id, employeeDocument.data() || {});
      if (
        employee.employeeId !== commit.reservationsEmployeeId ||
        !employee.active ||
        employee.role !== 'Reservations'
      ) {
        throw new ReservationsAssignmentError(409, 'RESERVATIONS_EMPLOYEE_CHANGED', 'The selected employee is no longer eligible for assignment.');
      }
      const booking = await transaction.get(bookingRef);
      const bookingData = booking.data();
      if (
        !booking.exists ||
        bookingData?.updatedAt !== commit.expectedUpdatedAt ||
        !['PENDING_PAYMENT', 'CONFIRMED'].includes(bookingData?.status)
      ) {
        throw new ReservationsAssignmentError(409, 'RESERVATIONS_ASSIGNMENT_CONFLICT', 'Booking assignment changed; reload and retry.');
      }
      transaction.update(bookingRef, commit.updates as DocumentData);
      transaction.set(auditRef, commit.auditLog);
    });
  }
}
