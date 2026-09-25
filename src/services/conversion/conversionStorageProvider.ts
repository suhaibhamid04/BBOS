import { Booking, BookingAccommodation, BookingTransport, BookingActivity, FinancialSnapshot } from '../../types/booking';
import { AuditLog } from '../../types';
import { getAdminDb } from '../../../server/firebaseAdmin';

export interface BookingWithServices {
  booking: Booking;
  accommodations: BookingAccommodation[];
  transports: BookingTransport[];
  activities: BookingActivity[];
}

export interface ConversionTransaction {
  get(collectionName: string, docId: string): Promise<any | null>;
  findByField(collectionName: string, field: string, value: unknown, limit?: number): Promise<any[]>;
  set(collectionName: string, docId: string, data: any): void;
  update(collectionName: string, docId: string, data: any): void;
  delete(collectionName: string, docId: string): void;
}

export interface ConversionStorageProvider {
  runTransaction<T>(updateFunction: (transaction: ConversionTransaction) => Promise<T>): Promise<T>;
  getBookingWithServices(bookingId: string): Promise<BookingWithServices | null>;
  getFinancialSnapshot(bookingId: string): Promise<FinancialSnapshot | null>;
  logAuditEvent(auditLog: AuditLog): Promise<void>;
  getQuote(quoteId: string): Promise<any | null>;
}

/**
 * In-Memory storage provider with realistic transactional concurrency
 * and conflict retry semantics for testing and isolated verification.
 */
export class InMemoryConversionStorageProvider implements ConversionStorageProvider {
  private collections: Map<string, Map<string, any>> = new Map();
  private docVersions: Map<string, number> = new Map();
  private globalVersion: number = 0;

  constructor(initialData?: {
    quotes?: any[];
    leads?: any[];
    trips?: any[];
    bookings?: Booking[];
    conversions?: any[];
  }) {
    if (initialData?.quotes) {
      for (const q of initialData.quotes) {
        this.rawSet('quotes', q.id, q);
      }
    }
    if (initialData?.leads) {
      for (const l of initialData.leads) {
        this.rawSet('leads', l.id, l);
      }
    }
    if (initialData?.trips) {
      for (const t of initialData.trips) {
        this.rawSet('trips', t.id, t);
      }
    }
    if (initialData?.bookings) {
      for (const b of initialData.bookings) {
        this.rawSet('bookings', b.id, b);
      }
    }
    if (initialData?.conversions) {
      for (const c of initialData.conversions) {
        this.rawSet('quote_conversions', c.id, c);
      }
    }
  }

  private getKey(collection: string, id: string): string {
    return `${collection}::${id}`;
  }

  private getCollection(collection: string): Map<string, any> {
    let col = this.collections.get(collection);
    if (!col) {
      col = new Map();
      this.collections.set(collection, col);
    }
    return col;
  }

  rawGet(collection: string, id: string): any | null {
    const col = this.getCollection(collection);
    const data = col.get(id);
    return data ? JSON.parse(JSON.stringify(data)) : null;
  }

  rawSet(collection: string, id: string, data: any): void {
    const col = this.getCollection(collection);
    col.set(id, JSON.parse(JSON.stringify(data)));
    this.globalVersion++;
    this.docVersions.set(this.getKey(collection, id), this.globalVersion);
  }

  rawUpdate(collection: string, id: string, updates: any): void {
    const col = this.getCollection(collection);
    const existing = col.get(id) || {};
    col.set(id, { ...JSON.parse(JSON.stringify(existing)), ...JSON.parse(JSON.stringify(updates)) });
    this.globalVersion++;
    this.docVersions.set(this.getKey(collection, id), this.globalVersion);
  }

  async getQuote(quoteId: string): Promise<any | null> {
    return this.rawGet('quotes', quoteId);
  }

  async runTransaction<T>(updateFunction: (transaction: ConversionTransaction) => Promise<T>): Promise<T> {
    const maxRetries = 5;
    let attempts = 0;

    while (attempts < maxRetries) {
      attempts++;
      const readVersions = new Map<string, number>();
      const stagedSets = new Map<string, { collection: string; id: string; data: any }>();
      const stagedUpdates = new Map<string, { collection: string; id: string; data: any }>();
      const stagedDeletes = new Map<string, { collection: string; id: string }>();

      const txn: ConversionTransaction = {
        get: async (collectionName: string, docId: string) => {
          // Yield to event loop to simulate async I/O and allow concurrent transactions to overlap
          await new Promise(r => setTimeout(r, 2));

          const key = this.getKey(collectionName, docId);
          // If already staged in this transaction, return staged copy
          if (stagedSets.has(key)) {
            return JSON.parse(JSON.stringify(stagedSets.get(key)!.data));
          }
          if (stagedUpdates.has(key)) {
            const base = this.rawGet(collectionName, docId) || {};
            return { ...base, ...stagedUpdates.get(key)!.data };
          }
          if (stagedDeletes.has(key)) return null;

          const currentVer = this.docVersions.get(key) || 0;
          readVersions.set(key, currentVer);
          return this.rawGet(collectionName, docId);
        },

        findByField: async (collectionName: string, field: string, value: unknown, limit = 2) => {
          await new Promise(r => setTimeout(r, 2));
          const matches: any[] = [];
          for (const [docId, storedValue] of this.getCollection(collectionName).entries()) {
            if (storedValue?.[field] !== value) continue;
            const key = this.getKey(collectionName, docId);
            readVersions.set(key, this.docVersions.get(key) || 0);
            matches.push(JSON.parse(JSON.stringify(storedValue)));
            if (matches.length >= limit) break;
          }
          return matches;
        },

        set: (collectionName: string, docId: string, data: any) => {
          const key = this.getKey(collectionName, docId);
          stagedSets.set(key, { collection: collectionName, id: docId, data: JSON.parse(JSON.stringify(data)) });
        },

        update: (collectionName: string, docId: string, data: any) => {
          const key = this.getKey(collectionName, docId);
          stagedUpdates.set(key, { collection: collectionName, id: docId, data: JSON.parse(JSON.stringify(data)) });
        },

        delete: (collectionName: string, docId: string) => {
          const key = this.getKey(collectionName, docId);
          stagedDeletes.set(key, { collection: collectionName, id: docId });
        },
      };

      try {
        const result = await updateFunction(txn);

        // Commit phase: verify that none of the read versions have changed
        let conflict = false;
        for (const [key, ver] of readVersions.entries()) {
          const currentVer = this.docVersions.get(key) || 0;
          if (currentVer !== ver) {
            conflict = true;
            break;
          }
        }

        if (conflict) {
          // Retry transaction from scratch
          await new Promise(r => setTimeout(r, Math.random() * 10 + 5));
          continue;
        }

        // Apply writes atomically
        for (const item of stagedSets.values()) {
          this.rawSet(item.collection, item.id, item.data);
        }
        for (const item of stagedUpdates.values()) {
          this.rawUpdate(item.collection, item.id, item.data);
        }
        for (const item of stagedDeletes.values()) {
          const collection = this.getCollection(item.collection);
          collection.delete(item.id);
          this.globalVersion++;
          this.docVersions.set(this.getKey(item.collection, item.id), this.globalVersion);
        }

        return result;
      } catch (err) {
        // If error thrown from inside transaction, no staged writes are applied
        throw err;
      }
    }

    throw new Error('Transaction failed after maximum conflict retries');
  }

  async getBookingWithServices(bookingId: string): Promise<BookingWithServices | null> {
    const booking = this.rawGet('bookings', bookingId);
    if (!booking) return null;

    const accommodations: BookingAccommodation[] = [];
    const accCol = this.getCollection('booking_accommodations');
    for (const doc of accCol.values()) {
      if (doc.bookingId === bookingId) accommodations.push(doc);
    }

    const transports: BookingTransport[] = [];
    const transCol = this.getCollection('booking_transports');
    for (const doc of transCol.values()) {
      if (doc.bookingId === bookingId) transports.push(doc);
    }

    const activities: BookingActivity[] = [];
    const actCol = this.getCollection('booking_activities');
    for (const doc of actCol.values()) {
      if (doc.bookingId === bookingId) activities.push(doc);
    }

    return {
      booking,
      accommodations,
      transports,
      activities,
    };
  }

  async getFinancialSnapshot(bookingId: string): Promise<FinancialSnapshot | null> {
    const colKey = `bookings/${bookingId}/financial_snapshot`;
    const col = this.getCollection(colKey);
    const snaps = Array.from(col.values());
    return snaps.length > 0 ? snaps[0] : null;
  }

  async logAuditEvent(auditLog: AuditLog): Promise<void> {
    this.rawSet('audit_logs', auditLog.id, auditLog);
  }

  getAllAuditLogs(): AuditLog[] {
    const col = this.getCollection('audit_logs');
    return Array.from(col.values());
  }

  getAllBookings(): Booking[] {
    const col = this.getCollection('bookings');
    return Array.from(col.values());
  }

  getAllConversions(): any[] {
    const col = this.getCollection('quote_conversions');
    return Array.from(col.values());
  }

  getAllFinancialSnapshots(): FinancialSnapshot[] {
    const snapshots: FinancialSnapshot[] = [];
    for (const [colName, map] of this.collections.entries()) {
      if (colName.includes('financial_snapshot')) {
        for (const snap of map.values()) {
          snapshots.push(snap);
        }
      }
    }
    return snapshots;
  }
}

/**
 * Production Firestore Admin SDK Storage Provider
 */
export class FirestoreConversionStorageProvider implements ConversionStorageProvider {
  async getQuote(quoteId: string): Promise<any | null> {
    const db = getAdminDb();
    const snap = await db.collection('quotes').doc(quoteId).get();
    return snap.exists ? { ...snap.data(), id: snap.id } : null;
  }

  async runTransaction<T>(updateFunction: (transaction: ConversionTransaction) => Promise<T>): Promise<T> {
    const db = getAdminDb();
    return db.runTransaction(async (firestoreTx) => {
      const txnWrapper: ConversionTransaction = {
        async get(collectionName: string, docId: string) {
          const docRef = collectionName.includes('/')
            ? db.doc(`${collectionName}/${docId}`)
            : db.collection(collectionName).doc(docId);
          const snap = await firestoreTx.get(docRef);
          return snap.exists ? { ...snap.data(), id: snap.id } : null;
        },
        async findByField(collectionName: string, field: string, value: unknown, limit = 2) {
          const query = db.collection(collectionName).where(field, '==', value).limit(limit);
          const snapshot = await firestoreTx.get(query);
          return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
        },
        set(collectionName: string, docId: string, data: any) {
          const docRef = collectionName.includes('/')
            ? db.doc(`${collectionName}/${docId}`)
            : db.collection(collectionName).doc(docId);
          firestoreTx.set(docRef, data);
        },
        update(collectionName: string, docId: string, data: any) {
          const docRef = collectionName.includes('/')
            ? db.doc(`${collectionName}/${docId}`)
            : db.collection(collectionName).doc(docId);
          firestoreTx.update(docRef, data);
        },
        delete(collectionName: string, docId: string) {
          const docRef = collectionName.includes('/')
            ? db.doc(`${collectionName}/${docId}`)
            : db.collection(collectionName).doc(docId);
          firestoreTx.delete(docRef);
        },
      };
      return updateFunction(txnWrapper);
    });
  }

  async getBookingWithServices(bookingId: string): Promise<BookingWithServices | null> {
    const db = getAdminDb();
    const bookingDoc = await db.collection('bookings').doc(bookingId).get();
    if (!bookingDoc.exists) return null;

    const booking = bookingDoc.data() as Booking;

    const [accSnap, transSnap, actSnap] = await Promise.all([
      db.collection('booking_accommodations').where('bookingId', '==', bookingId).get(),
      db.collection('booking_transports').where('bookingId', '==', bookingId).get(),
      db.collection('booking_activities').where('bookingId', '==', bookingId).get(),
    ]);

    return {
      booking,
      accommodations: accSnap.docs.map(d => d.data() as BookingAccommodation),
      transports: transSnap.docs.map(d => d.data() as BookingTransport),
      activities: actSnap.docs.map(d => d.data() as BookingActivity),
    };
  }

  async getFinancialSnapshot(bookingId: string): Promise<FinancialSnapshot | null> {
    const db = getAdminDb();
    const snap = await db.collection('bookings').doc(bookingId).collection('financial_snapshot').limit(1).get();
    if (snap.empty) return null;
    return snap.docs[0].data() as FinancialSnapshot;
  }

  async logAuditEvent(auditLog: AuditLog): Promise<void> {
    const db = getAdminDb();
    await db.collection('audit_logs').doc(auditLog.id).set(auditLog);
  }
}
