import { getAdminDb } from '../../../server/firebaseAdmin';
import type { QueryConstraint } from '../../../server/authorization/policyTypes';
import { Booking, BookingAccommodation, BookingTransport, BookingActivity, FinancialSnapshot } from '../../types/booking';
import { BookingListFilter, BookingListResponse } from '../../types/bookingApi';

export interface BookingWithServices {
  booking: Booking;
  accommodations: BookingAccommodation[];
  transports: BookingTransport[];
  activities: BookingActivity[];
  financialSnapshot: FinancialSnapshot | null;
}

export interface BookingQueryProvider {
  listBookings(filter: BookingListFilter, scopeConstraints: QueryConstraint[]): Promise<BookingListResponse>;
  getBooking(bookingId: string): Promise<Booking | null>;
  getBookingWithServices(bookingId: string): Promise<BookingWithServices | null>;
}

export class InMemoryBookingQueryProvider implements BookingQueryProvider {
  private collections: Map<string, Map<string, any>> = new Map();

  constructor(initialData?: {
    bookings?: Booking[];
    accommodations?: BookingAccommodation[];
    transports?: BookingTransport[];
    activities?: BookingActivity[];
    financialSnapshots?: FinancialSnapshot[];
  }) {
    if (initialData?.bookings) {
      for (const b of initialData.bookings) {
        this.rawSet('bookings', b.id, b);
      }
    }
    if (initialData?.accommodations) {
      for (const a of initialData.accommodations) {
        this.rawSet('booking_accommodations', a.id, a);
      }
    }
    if (initialData?.transports) {
      for (const t of initialData.transports) {
        this.rawSet('booking_transports', t.id, t);
      }
    }
    if (initialData?.activities) {
      for (const a of initialData.activities) {
        this.rawSet('booking_activities', a.id, a);
      }
    }
    if (initialData?.financialSnapshots) {
      for (const snapshot of initialData.financialSnapshots) {
        this.rawSet(`bookings/${snapshot.bookingId}/financial_snapshot`, snapshot.id, snapshot);
      }
    }
  }

  private getCollection(collection: string): Map<string, any> {
    let col = this.collections.get(collection);
    if (!col) {
      col = new Map();
      this.collections.set(collection, col);
    }
    return col;
  }

  rawSet(collection: string, id: string, data: any): void {
    const col = this.getCollection(collection);
    col.set(id, JSON.parse(JSON.stringify(data)));
  }

  async listBookings(filter: BookingListFilter, scopeConstraints: QueryConstraint[]): Promise<BookingListResponse> {
    const col = this.getCollection('bookings');
    let results = Array.from(col.values()) as Booking[];

    // 1. Apply the centralized policy constraints before user filters.
    results = results.filter((booking: any) => scopeConstraints.every(constraint => {
      const value = booking[constraint.field];
      return constraint.operator === '=='
        ? value === constraint.value
        : Array.isArray(constraint.value) && constraint.value.includes(value);
    }));

    // 2. Apply explicit filters
    if (filter.status) {
      results = results.filter(b => b.status === filter.status);
    }
    if (filter.paymentStatus) {
      results = results.filter(b => b.paymentStatus === filter.paymentStatus);
    }
    if (filter.query) {
      results = results.filter(b => b.bookingReference === filter.query);
    }

    // 3. Sort deterministic (createdAt DESC)
    results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // 4. Cursor Pagination
    let startIndex = 0;
    if (filter.cursor) {
      const cursorIndex = results.findIndex(b => b.id === filter.cursor);
      if (cursorIndex !== -1) {
        startIndex = cursorIndex + 1;
      }
    }

    const limit = filter.limit || 20;
    const paginated = results.slice(startIndex, startIndex + limit + 1);
    const hasMore = paginated.length > limit;
    const page = hasMore ? paginated.slice(0, limit) : paginated;
    const nextCursor = hasMore ? page[page.length - 1].id : null;

    return {
      data: page,
      nextCursor,
      hasMore,
    };
  }

  async getBooking(bookingId: string): Promise<Booking | null> {
    const booking = this.getCollection('bookings').get(bookingId);
    return booking ? JSON.parse(JSON.stringify(booking)) : null;
  }

  async getBookingWithServices(bookingId: string): Promise<BookingWithServices | null> {
    const booking = this.getCollection('bookings').get(bookingId);
    if (!booking) return null;

    const accommodations = Array.from(this.getCollection('booking_accommodations').values()).filter(a => a.bookingId === bookingId) as BookingAccommodation[];
    const transports = Array.from(this.getCollection('booking_transports').values()).filter(t => t.bookingId === bookingId) as BookingTransport[];
    const activities = Array.from(this.getCollection('booking_activities').values()).filter(a => a.bookingId === bookingId) as BookingActivity[];
    const snapshots = Array.from(this.getCollection(`bookings/${bookingId}/financial_snapshot`).values()) as FinancialSnapshot[];
    snapshots.sort((a, b) => b.snapshotVersion - a.snapshotVersion);

    return {
      booking: JSON.parse(JSON.stringify(booking)),
      accommodations: JSON.parse(JSON.stringify(accommodations)),
      transports: JSON.parse(JSON.stringify(transports)),
      activities: JSON.parse(JSON.stringify(activities)),
      financialSnapshot: snapshots[0] ? JSON.parse(JSON.stringify(snapshots[0])) : null,
    };
  }
}

export class FirestoreBookingQueryProvider implements BookingQueryProvider {
  async listBookings(filter: BookingListFilter, scopeConstraints: QueryConstraint[]): Promise<BookingListResponse> {
    const db = getAdminDb();
    let query: any = db.collection('bookings');

    // Apply centralized policy scope before any database read.
    for (const constraint of scopeConstraints) {
      query = query.where(constraint.field, constraint.operator, constraint.value);
    }

    // Apply explicit filters
    if (filter.status) {
      query = query.where('status', '==', filter.status);
    }
    if (filter.paymentStatus) {
      query = query.where('paymentStatus', '==', filter.paymentStatus);
    }

    // NOTE: Firestore doesn't support full-text search easily.
    // If a query is provided, we can do a simple == on bookingReference for now, 
    // or rely on a dedicated search field. For Stage 1, we will fall back to exact match on bookingReference
    // if 'query' is provided, as specified by Correction 2.
    if (filter.query) {
      // Assuming user types the exact reference like "BK-1001"
      query = query.where('bookingReference', '==', filter.query);
    }

    // Order by createdAt DESC
    query = query.orderBy('createdAt', 'desc');

    const limit = filter.limit || 20;
    query = query.limit(limit + 1);

    if (filter.cursor) {
      const cursorDoc = await db.collection('bookings').doc(filter.cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    const snap = await query.get();
    const rows = snap.docs.map((doc: any) => ({ ...doc.data(), id: doc.id }) as Booking);
    
    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? data[data.length - 1].id : null;

    return {
      data,
      nextCursor,
      hasMore,
    };
  }

  async getBooking(bookingId: string): Promise<Booking | null> {
    const document = await getAdminDb().collection('bookings').doc(bookingId).get();
    return document.exists ? ({ ...document.data(), id: document.id } as Booking) : null;
  }

  async getBookingWithServices(bookingId: string): Promise<BookingWithServices | null> {
    const db = getAdminDb();
    const bookingDoc = await db.collection('bookings').doc(bookingId).get();
    if (!bookingDoc.exists) return null;

    const booking = { ...bookingDoc.data(), id: bookingDoc.id } as Booking;

    const [accSnap, transSnap, actSnap, financialSnap] = await Promise.all([
      db.collection('booking_accommodations').where('bookingId', '==', bookingId).get(),
      db.collection('booking_transports').where('bookingId', '==', bookingId).get(),
      db.collection('booking_activities').where('bookingId', '==', bookingId).get(),
      db.collection('bookings').doc(bookingId).collection('financial_snapshot')
        .orderBy('snapshotVersion', 'desc').limit(1).get(),
    ]);

    return {
      booking,
      accommodations: accSnap.docs.map((d: any) => ({ ...d.data(), id: d.id }) as BookingAccommodation),
      transports: transSnap.docs.map((d: any) => ({ ...d.data(), id: d.id }) as BookingTransport),
      activities: actSnap.docs.map((d: any) => ({ ...d.data(), id: d.id }) as BookingActivity),
      financialSnapshot: financialSnap.empty
        ? null
        : ({ ...financialSnap.docs[0].data(), id: financialSnap.docs[0].id } as FinancialSnapshot),
    };
  }
}
