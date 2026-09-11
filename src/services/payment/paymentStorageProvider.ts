import { Booking } from '../../types/booking';
import { PaymentRecord } from '../../types/payment';
import { AuditLog } from '../../types';
import { getAdminDb } from '../../../server/firebaseAdmin';

export interface PaymentTransaction {
  getBooking(bookingId: string): Promise<Booking | null>;
  getPayment(paymentId: string): Promise<PaymentRecord | null>;
  getPaymentsForBooking(bookingId: string): Promise<PaymentRecord[]>;
  setPayment(paymentId: string, data: PaymentRecord): void;
  updateBooking(bookingId: string, data: Partial<Booking>): void;
  updatePayment(paymentId: string, data: Partial<PaymentRecord>): void;
  setAuditLog(auditLogId: string, auditLog: AuditLog): void;
}

export interface PaymentStorageProvider {
  getBooking(bookingId: string): Promise<Booking | null>;
  getPayment(paymentId: string): Promise<PaymentRecord | null>;
  getPaymentsForBooking(bookingId: string): Promise<PaymentRecord[]>;
  savePayment(payment: PaymentRecord): Promise<void>;
  updateBooking(bookingId: string, data: Partial<Booking>): Promise<void>;
  logAuditEvent(auditLog: AuditLog): Promise<void>;
  runTransaction<T>(updateFunction: (transaction: PaymentTransaction) => Promise<T>): Promise<T>;
}

/**
 * In-Memory Storage Provider for fast, isolated, deterministic unit & regression testing.
 * Implements transaction queuing to guarantee serializable isolation under concurrent requests.
 */
export class InMemoryPaymentStorageProvider implements PaymentStorageProvider {
  private bookings: Map<string, Booking> = new Map();
  private payments: Map<string, PaymentRecord> = new Map();
  private auditLogs: Map<string, AuditLog> = new Map();
  private txLock: Promise<void> = Promise.resolve();

  constructor(initialData?: {
    bookings?: Booking[];
    payments?: PaymentRecord[];
    auditLogs?: AuditLog[];
  }) {
    if (initialData?.bookings) {
      for (const b of initialData.bookings) {
        this.bookings.set(b.id, JSON.parse(JSON.stringify(b)));
      }
    }
    if (initialData?.payments) {
      for (const p of initialData.payments) {
        this.payments.set(p.id, JSON.parse(JSON.stringify(p)));
      }
    }
    if (initialData?.auditLogs) {
      for (const a of initialData.auditLogs) {
        this.auditLogs.set(a.id, JSON.parse(JSON.stringify(a)));
      }
    }
  }

  async getBooking(bookingId: string): Promise<Booking | null> {
    const b = this.bookings.get(bookingId);
    return b ? JSON.parse(JSON.stringify(b)) : null;
  }

  async getPayment(paymentId: string): Promise<PaymentRecord | null> {
    const p = this.payments.get(paymentId);
    return p ? JSON.parse(JSON.stringify(p)) : null;
  }

  async getPaymentsForBooking(bookingId: string): Promise<PaymentRecord[]> {
    const list: PaymentRecord[] = [];
    for (const p of this.payments.values()) {
      if (p.bookingId === bookingId) {
        list.push(JSON.parse(JSON.stringify(p)));
      }
    }
    return list;
  }

  async savePayment(payment: PaymentRecord): Promise<void> {
    this.payments.set(payment.id, JSON.parse(JSON.stringify(payment)));
  }

  async updateBooking(bookingId: string, data: Partial<Booking>): Promise<void> {
    const existing = this.bookings.get(bookingId);
    if (existing) {
      this.bookings.set(bookingId, { ...existing, ...JSON.parse(JSON.stringify(data)) });
    }
  }

  async logAuditEvent(auditLog: AuditLog): Promise<void> {
    this.auditLogs.set(auditLog.id, JSON.parse(JSON.stringify(auditLog)));
  }

  getAllAuditLogs(): AuditLog[] {
    return Array.from(this.auditLogs.values());
  }

  getAllPayments(): PaymentRecord[] {
    return Array.from(this.payments.values());
  }

  async runTransaction<T>(updateFunction: (transaction: PaymentTransaction) => Promise<T>): Promise<T> {
    // Acquire transactional mutex lock to ensure serialization under concurrent requests
    let releaseLock: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    const currentLock = this.txLock;
    this.txLock = this.txLock.then(() => lockPromise);

    await currentLock;

    try {
      // Snapshot state for atomic rollback on failure
      const bookingsSnapshot = new Map(Array.from(this.bookings.entries()).map(([k, v]) => [k, JSON.parse(JSON.stringify(v))]));
      const paymentsSnapshot = new Map(Array.from(this.payments.entries()).map(([k, v]) => [k, JSON.parse(JSON.stringify(v))]));

      const stagedBookingUpdates = new Map<string, Partial<Booking>>();
      const stagedPaymentSets = new Map<string, PaymentRecord>();
      const stagedPaymentUpdates = new Map<string, Partial<PaymentRecord>>();
      const stagedAuditLogs = new Map<string, AuditLog>();

      const tx: PaymentTransaction = {
        getBooking: async (bId: string) => {
          const b = stagedBookingUpdates.has(bId)
            ? { ...bookingsSnapshot.get(bId)!, ...stagedBookingUpdates.get(bId)! }
            : bookingsSnapshot.get(bId);
          return b ? JSON.parse(JSON.stringify(b)) : null;
        },
        getPayment: async (pId: string) => {
          if (stagedPaymentSets.has(pId)) {
            return JSON.parse(JSON.stringify(stagedPaymentSets.get(pId)!));
          }
          const p = stagedPaymentUpdates.has(pId)
            ? { ...paymentsSnapshot.get(pId)!, ...stagedPaymentUpdates.get(pId)! }
            : paymentsSnapshot.get(pId);
          return p ? JSON.parse(JSON.stringify(p)) : null;
        },
        getPaymentsForBooking: async (bId: string) => {
          const list: PaymentRecord[] = [];
          for (const [pId, p] of paymentsSnapshot.entries()) {
            if (stagedPaymentSets.has(pId)) {
              const setP = stagedPaymentSets.get(pId)!;
              if (setP.bookingId === bId) list.push(JSON.parse(JSON.stringify(setP)));
              continue;
            }
            const effective = stagedPaymentUpdates.has(pId)
              ? { ...p, ...stagedPaymentUpdates.get(pId)! }
              : p;
            if (effective.bookingId === bId) {
              list.push(JSON.parse(JSON.stringify(effective)));
            }
          }
          for (const [pId, setP] of stagedPaymentSets.entries()) {
            if (!paymentsSnapshot.has(pId) && setP.bookingId === bId) {
              list.push(JSON.parse(JSON.stringify(setP)));
            }
          }
          return list;
        },
        setPayment: (pId: string, data: PaymentRecord) => {
          stagedPaymentSets.set(pId, JSON.parse(JSON.stringify(data)));
        },
        updateBooking: (bId: string, data: Partial<Booking>) => {
          const current = stagedBookingUpdates.get(bId) || {};
          stagedBookingUpdates.set(bId, { ...current, ...JSON.parse(JSON.stringify(data)) });
        },
        updatePayment: (pId: string, data: Partial<PaymentRecord>) => {
          const current = stagedPaymentUpdates.get(pId) || {};
          stagedPaymentUpdates.set(pId, { ...current, ...JSON.parse(JSON.stringify(data)) });
        },
        setAuditLog: (aId: string, aLog: AuditLog) => {
          stagedAuditLogs.set(aId, JSON.parse(JSON.stringify(aLog)));
        },
      };

      const result = await updateFunction(tx);

      // Commit all staged mutations atomically
      for (const [bId, data] of stagedBookingUpdates.entries()) {
        const current = this.bookings.get(bId);
        if (current) {
          this.bookings.set(bId, { ...current, ...data });
        }
      }
      for (const [pId, p] of stagedPaymentSets.entries()) {
        this.payments.set(pId, p);
      }
      for (const [pId, data] of stagedPaymentUpdates.entries()) {
        const current = this.payments.get(pId);
        if (current) {
          this.payments.set(pId, { ...current, ...data });
        }
      }
      for (const [aId, aLog] of stagedAuditLogs.entries()) {
        this.auditLogs.set(aId, aLog);
      }
      return result;
    } finally {
      releaseLock!();
    }
  }
}

/**
 * Production Firestore Admin SDK Storage Provider.
 */
export class FirestorePaymentStorageProvider implements PaymentStorageProvider {
  async getBooking(bookingId: string): Promise<Booking | null> {
    const db = getAdminDb();
    const snap = await db.collection('bookings').doc(bookingId).get();
    return snap.exists ? (snap.data() as Booking) : null;
  }

  async getPayment(paymentId: string): Promise<PaymentRecord | null> {
    const db = getAdminDb();
    const snap = await db.collection('payments').doc(paymentId).get();
    return snap.exists ? (snap.data() as PaymentRecord) : null;
  }

  async getPaymentsForBooking(bookingId: string): Promise<PaymentRecord[]> {
    const db = getAdminDb();
    const snap = await db.collection('payments').where('bookingId', '==', bookingId).get();
    return snap.docs.map((d) => d.data() as PaymentRecord);
  }

  async savePayment(payment: PaymentRecord): Promise<void> {
    const db = getAdminDb();
    await db.collection('payments').doc(payment.id).set(payment);
  }

  async updateBooking(bookingId: string, data: Partial<Booking>): Promise<void> {
    const db = getAdminDb();
    await db.collection('bookings').doc(bookingId).update(data);
  }

  async logAuditEvent(auditLog: AuditLog): Promise<void> {
    const db = getAdminDb();
    await db.collection('audit_logs').doc(auditLog.id).set(auditLog);
  }

  async runTransaction<T>(updateFunction: (transaction: PaymentTransaction) => Promise<T>): Promise<T> {
    const db = getAdminDb();
    return db.runTransaction(async (firestoreTx) => {
      const txWrapper: PaymentTransaction = {
        getBooking: async (bId: string) => {
          const snap = await firestoreTx.get(db.collection('bookings').doc(bId));
          return snap.exists ? (snap.data() as Booking) : null;
        },
        getPayment: async (pId: string) => {
          const snap = await firestoreTx.get(db.collection('payments').doc(pId));
          return snap.exists ? (snap.data() as PaymentRecord) : null;
        },
        getPaymentsForBooking: async (bId: string) => {
          const snap = await db.collection('payments').where('bookingId', '==', bId).get();
          return snap.docs.map((d) => d.data() as PaymentRecord);
        },
        setPayment: (pId: string, data: PaymentRecord) => {
          firestoreTx.set(db.collection('payments').doc(pId), data);
        },
        updateBooking: (bId: string, data: Partial<Booking>) => {
          firestoreTx.update(db.collection('bookings').doc(bId), data);
        },
        updatePayment: (pId: string, data: Partial<PaymentRecord>) => {
          firestoreTx.update(db.collection('payments').doc(pId), data);
        },
        setAuditLog: (aId: string, aLog: AuditLog) => {
          firestoreTx.set(db.collection('audit_logs').doc(aId), aLog);
        },
      };
      return updateFunction(txWrapper);
    });
  }
}
