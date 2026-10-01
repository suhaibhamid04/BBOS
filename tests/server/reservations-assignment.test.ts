import { describe, expect, it } from 'bun:test';
import { authorizeResource } from '../../server/authorization/policyEngine';
import { bookingResourceContext } from '../../server/authorization/resourceContext';
import {
  InMemoryReservationsAssignmentStorage,
  ReservationsAssignmentService,
  type ReservationsAssignmentActor,
  type ReservationsEmployee,
} from '../../server/services/reservationsAssignmentService';
import type { UserRole } from '../../src/types';
import type { Booking, BookingStatus } from '../../src/types/booking';

const UPDATED_AT = '2026-09-30T10:00:00.000Z';
const ASSIGNED_AT = '2026-09-30T11:00:00.000Z';

function actor(role: UserRole, employeeId = `actor-${role.toLowerCase().replaceAll(' ', '-')}`): ReservationsAssignmentActor {
  return {
    firebaseUid: `firebase-${employeeId}`,
    employeeId,
    role,
    active: true,
    name: `${role} Actor`,
  };
}

function booking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 'booking-reservations-assignment',
    bookingReference: 'BBOS-RA-001',
    tripId: 'trip-1',
    customerId: 'customer-1',
    status: 'CONFIRMED',
    amountReceived: 1_000,
    amountPending: 9_000,
    travelStartDate: '2026-10-10',
    travelEndDate: '2026-10-12',
    assignedSalesEmployeeId: 'sales-1',
    salesTeamId: 'team-1',
    createdAt: UPDATED_AT,
    updatedAt: UPDATED_AT,
    ...overrides,
  };
}

const activeReservations: ReservationsEmployee & { documentId: string } = {
  documentId: 'employee-reservations-1',
  employeeId: 'reservations-1',
  name: 'Reservations One',
  role: 'Reservations',
  active: true,
};

const secondReservations: ReservationsEmployee & { documentId: string } = {
  documentId: 'employee-reservations-2',
  employeeId: 'reservations-2',
  name: 'Reservations Two',
  role: 'Reservations',
  active: true,
};

function setup(
  bookingOverrides: Partial<Booking> = {},
  employees: Array<ReservationsEmployee & { documentId?: string }> = [activeReservations, secondReservations],
) {
  const storage = new InMemoryReservationsAssignmentStorage({
    bookings: [booking(bookingOverrides)],
    employees,
  });
  return {
    storage,
    service: new ReservationsAssignmentService(storage, () => new Date(ASSIGNED_AT)),
  };
}

const assignment = (employeeId = activeReservations.employeeId, expectedUpdatedAt = UPDATED_AT) => ({
  employeeId,
  expectedUpdatedAt,
  reason: 'Reservations handoff test',
});

describe('QA1.1 Reservations assignment', () => {
  it('allows Founder and Admin to assign an active Reservations employee', async () => {
    for (const role of ['Founder', 'Admin'] as const) {
      const { storage, service } = setup();
      const result = await service.assign(booking().id, assignment(), actor(role));
      expect(result).toMatchObject({ assignedReservationsEmployeeId: 'reservations-1', updatedAt: ASSIGNED_AT });
      expect(storage.getBookingSync(booking().id)?.assignedReservationsEmployeeId).toBe('reservations-1');
    }
  });

  it('lists only unique, active Reservations employees', async () => {
    const inactive = { ...secondReservations, documentId: 'inactive', employeeId: 'inactive-reservations', active: false };
    const wrongRole = { ...secondReservations, documentId: 'sales', employeeId: 'sales-2', role: 'Sales Executive' };
    const duplicate = { ...activeReservations, documentId: 'duplicate' };
    const { service } = setup({}, [activeReservations, inactive, wrongRole, duplicate]);
    expect(await service.listEligibleEmployees(actor('Admin'))).toEqual([]);
  });

  it('rejects inactive, wrong-role, missing, ambiguous, and Firebase-UID-shaped targets', async () => {
    const inactive = { ...activeReservations, documentId: 'inactive', employeeId: 'inactive-reservations', active: false };
    const wrongRole = { ...activeReservations, documentId: 'sales', employeeId: 'sales-1', role: 'Sales Executive' };
    const duplicate = { ...activeReservations, documentId: 'duplicate' };
    for (const scenario of [
      { employees: [inactive], employeeId: inactive.employeeId, code: 'RESERVATIONS_EMPLOYEE_INACTIVE' },
      { employees: [wrongRole], employeeId: wrongRole.employeeId, code: 'RESERVATIONS_ROLE_REQUIRED' },
      { employees: [activeReservations], employeeId: 'missing', code: 'RESERVATIONS_EMPLOYEE_NOT_FOUND' },
      { employees: [activeReservations, duplicate], employeeId: activeReservations.employeeId, code: 'RESERVATIONS_EMPLOYEE_AMBIGUOUS' },
      { employees: [activeReservations], employeeId: 'firebase-reservations-1', code: 'RESERVATIONS_EMPLOYEE_NOT_FOUND' },
    ]) {
      const { storage, service } = setup({}, scenario.employees);
      await expect(service.assign(booking().id, assignment(scenario.employeeId), actor('Admin')))
        .rejects.toMatchObject({ code: scenario.code });
      expect(storage.getMutationCount()).toBe(0);
    }
  });

  it('denies Reservations self-assignment and every non-administrative role', async () => {
    for (const role of ['Reservations', 'Sales Manager', 'Sales Executive', 'Accounts', 'Operations', 'Marketing'] as const) {
      const { storage, service } = setup();
      const employeeId = role === 'Reservations' ? activeReservations.employeeId : undefined;
      await expect(service.assign(booking().id, assignment(), actor(role, employeeId)))
        .rejects.toMatchObject({ statusCode: 403 });
      expect(storage.getMutationCount()).toBe(0);
    }
  });

  it('reassignment revokes the previous ASSIGNED scope and grants the new employee', async () => {
    const { storage, service } = setup({ assignedReservationsEmployeeId: activeReservations.employeeId });
    await service.assign(booking().id, assignment(secondReservations.employeeId), actor('Admin'));
    const updated = storage.getBookingSync(booking().id)!;
    const previousDecision = authorizeResource(
      actor('Reservations', activeReservations.employeeId),
      'BOOKING',
      'READ_DETAIL',
      bookingResourceContext(updated),
    );
    const nextDecision = authorizeResource(
      actor('Reservations', secondReservations.employeeId),
      'BOOKING',
      'READ_DETAIL',
      bookingResourceContext(updated),
    );
    expect(previousDecision.allowed).toBe(false);
    expect(nextDecision.allowed).toBe(true);
    expect(storage.getAudits()[0].action).toBe('RESERVATIONS_REASSIGNED');
  });

  it('records canonical actor and old/new assignment in the same successful commit', async () => {
    const { storage, service } = setup();
    const admin = { ...actor('Admin', 'canonical-admin'), id: 'compat-admin', uid: 'firebase-admin' };
    await service.assign(booking().id, assignment(), admin as ReservationsAssignmentActor);
    expect(storage.getMutationCount()).toBe(2);
    expect(storage.getAudits()).toHaveLength(1);
    expect(storage.getAudits()[0]).toMatchObject({
      actorId: 'canonical-admin',
      action: 'RESERVATIONS_ASSIGNED',
      before: { assignedReservationsEmployeeId: null },
      after: { assignedReservationsEmployeeId: 'reservations-1' },
    });
  });

  it('rejects stale concurrent writes with zero assignment or audit mutations', async () => {
    const { storage, service } = setup();
    await expect(service.assign(booking().id, assignment(activeReservations.employeeId, 'stale-version'), actor('Admin')))
      .rejects.toMatchObject({ statusCode: 409, code: 'RESERVATIONS_ASSIGNMENT_CONFLICT' });
    expect(storage.getBookingSync(booking().id)?.assignedReservationsEmployeeId).toBeUndefined();
    expect(storage.getAudits()).toEqual([]);
    expect(storage.getMutationCount()).toBe(0);
  });

  it('permits pre-operations states and rejects historical/operational states', async () => {
    for (const status of ['PENDING_PAYMENT', 'CONFIRMED'] as BookingStatus[]) {
      const { service } = setup({ status });
      await expect(service.assign(booking().id, assignment(), actor('Founder'))).resolves.toBeDefined();
    }
    for (const status of ['IN_OPERATIONS', 'TRAVELLING', 'COMPLETED', 'CANCELLED'] as BookingStatus[]) {
      const { storage, service } = setup({ status });
      await expect(service.assign(booking().id, assignment(), actor('Founder')))
        .rejects.toMatchObject({ statusCode: 422, code: 'WORKFLOW_STATE_DENIED' });
      expect(storage.getMutationCount()).toBe(0);
    }
  });

  it('rejects client-supplied identity aliases and unknown fields', async () => {
    const { service } = setup();
    await expect(service.assign(booking().id, {
      ...assignment(),
      firebaseUid: 'firebase-reservations-1',
    }, actor('Admin'))).rejects.toMatchObject({ code: 'UNKNOWN_ASSIGNMENT_FIELD' });
  });
});
