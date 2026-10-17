import { afterAll, beforeAll, describe, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

const host = process.env.FIRESTORE_EMULATOR_HOST;
// Never clear or seed a remote database. This suite only targets a synthetic
// project through an explicitly configured loopback emulator.
if (host && !/^(127\.0\.0\.1|localhost):\d+$/.test(host)) throw new Error('Rules tests require a loopback Firestore emulator.');

describe.skipIf(!host)('executable Firestore rule security regressions', () => {
  let environment: RulesTestEnvironment;
  beforeAll(async () => {
    const [hostname, port] = host!.split(':');
    environment = await initializeTestEnvironment({ projectId: 'demo-bbos-audit-rules',
      firestore: { host: hostname, port: Number(port), rules: readFileSync('firestore.rules', 'utf8') } });
    await environment.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      for (const [uid, role, active] of [['ops', 'Operations', true], ['admin', 'Admin', true], ['inactive', 'Operations', false]] as const) {
        await setDoc(doc(db, 'employees', uid), { id: `emp-${uid}`, employeeId: `emp-${uid}`, firebaseUid: uid, role, active });
      }
      await setDoc(doc(db, 'employees', 'mismatched'), { role: 'Admin', active: true, firebaseUid: 'someone-else' });
      await setDoc(doc(db, 'conversations', 'conversation'), { text: 'Customer message' });
      for (const collection of ['trips', 'itinerary_days', 'booking_accommodations', 'booking_transports', 'booking_activities']) {
        await setDoc(doc(db, collection, 'record'), { supplierCost: 12345, confirmationStatus: 'PENDING' });
      }
    });
  });
  afterAll(async () => { await environment?.cleanup(); });
  it('denies absent, inactive and mismatched employee identities on legacy collections', async () => {
    for (const uid of ['unmapped', 'inactive', 'mismatched']) {
      await assertFails(getDoc(doc(environment.authenticatedContext(uid).firestore(), 'conversations', 'conversation')));
    }
    await assertFails(getDoc(doc(environment.unauthenticatedContext().firestore(), 'conversations', 'conversation')));
    await assertSucceeds(getDoc(doc(environment.authenticatedContext('ops').firestore(), 'conversations', 'conversation')));
  });
  it('denies direct modern financial reads and supplier-confirmation writes for all client roles', async () => {
    for (const uid of ['ops', 'admin']) {
      const db = environment.authenticatedContext(uid).firestore();
      for (const collection of ['trips', 'itinerary_days', 'booking_accommodations', 'booking_transports', 'booking_activities']) {
        await assertFails(getDoc(doc(db, collection, 'record')));
        await assertFails(updateDoc(doc(db, collection, 'record'), { confirmationStatus: 'CONFIRMED' }));
      }
      await assertFails(setDoc(doc(db, 'vouchers', `forged-${uid}`), { bookingId: 'another-booking' }));
    }
  });
  it('does not allow the conversation write grant to override admin-only deletion', async () => {
    await assertFails(deleteDoc(doc(environment.authenticatedContext('ops').firestore(), 'conversations', 'conversation')));
    await assertSucceeds(deleteDoc(doc(environment.authenticatedContext('admin').firestore(), 'conversations', 'conversation')));
  });
  it('binds legacy audit actor identity and reserves authoritative workflow events for the server', async () => {
    const db = environment.authenticatedContext('ops').firestore();
    const record = { entityType: 'TASK', actorId: 'emp-ops', action: 'TASK_UPDATED' };
    await assertSucceeds(setDoc(doc(db, 'audit_logs', 'valid'), record));
    await assertFails(setDoc(doc(db, 'audit_logs', 'spoof'), { ...record, actorId: 'emp-admin' }));
    for (const action of ['BOOKING_CANCELLED', 'BOOKING_DISPATCHED_TO_OPERATIONS', 'VOUCHERS_GENERATED']) {
      await assertFails(setDoc(doc(db, 'audit_logs', action), { ...record, action }));
    }
  });
});
