import { getAdminDb } from '../../../server/firebaseAdmin';
import { Booking, BookingAccommodation, BookingTransport, BookingActivity } from '../../types/booking';
import { BookingListFilter, BookingListResponse } from '../../types/bookingApi';

export interface BookingWithServices {
  booking: Booking;
  accommodations: BookingAccommodation[];
  transports: BookingTransport[];
  activities: BookingActivity[];
}

export type RoleFilter = 
  | { field: string; op: '==' | 'in'; value: any }
  | { type: 'OR'; conditions: { field: string; op: '==' | 'in'; value: any }[] };

export interface BookingQueryProvider {
  listBookings(filter: BookingListFilter, roleFilters: RoleFilter[]): Promise<BookingListResponse>;
  getBookingWithServices(bookingId: string): Promise<BookingWithServices | null>;
}

export class InMemoryBookingQueryProvider implements BookingQueryProvider {
  private collections: Map<string, Map<string, any>> = new Map();

  constructor(initialData?: {
    bookings?: Booking[];
    accommodations?: BookingAccommodation[];
    transports?: BookingTransport[];
    activities?: BookingActivity[];
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

  async listBookings(filter: BookingListFilter, roleFilters: RoleFilter[]): Promise<BookingListResponse> {
    const col = this.getCollection('bookings');
    let results = Array.from(col.values()) as Booking[];

    // 1. Apply role filters
    if (roleFilters.length > 0) {
      results = results.filter((b: any) => {
        for (const rf of roleFilters) {
          if ('type' in rf && rf.type === 'OR') {
            const orMatched = rf.conditions.some(cond => {
              const bVal = b[cond.field];
              if (cond.op === '==') return bVal === cond.value;
              if (cond.op === 'in') return cond.value.includes(bVal);
              return false;
            });
            if (!orMatched) return false;
          } else if ('field' in rf) {
            const bVal = b[rf.field];
            if (rf.op === '==') {
              if (bVal !== rf.value) return false;
            } else if (rf.op === 'in') {
              if (!rf.value.includes(bVal)) return false;
            }
          }
        }
        return true;
      });
    }

    // 2. Apply explicit filters
    if (filter.status) {
      results = results.filter(b => b.status === filter.status);
    }
    if (filter.paymentStatus) {
      results = results.filter(b => b.paymentStatus === filter.paymentStatus);
    }
    if (filter.query) {
      const q = filter.query.toLowerCase();
      results = results.filter(b => 
        b.bookingReference.toLowerCase().includes(q) || 
        (b.customerName && b.customerName.toLowerCase().includes(q))
      );
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
    const paginated = results.slice(startIndex, startIndex + limit);
    const hasMore = startIndex + limit < results.length;
    const nextCursor = hasMore ? paginated[paginated.length - 1].id : null;

    return {
      data: paginated,
      nextCursor,
      hasMore,
    };
  }

  async getBookingWithServices(bookingId: string): Promise<BookingWithServices | null> {
    const booking = this.getCollection('bookings').get(bookingId);
    if (!booking) return null;

    const accommodations = Array.from(this.getCollection('booking_accommodations').values()).filter(a => a.bookingId === bookingId) as BookingAccommodation[];
    const transports = Array.from(this.getCollection('booking_transports').values()).filter(t => t.bookingId === bookingId) as BookingTransport[];
    const activities = Array.from(this.getCollection('booking_activities').values()).filter(a => a.bookingId === bookingId) as BookingActivity[];

    return {
      booking: JSON.parse(JSON.stringify(booking)),
      accommodations: JSON.parse(JSON.stringify(accommodations)),
      transports: JSON.parse(JSON.stringify(transports)),
      activities: JSON.parse(JSON.stringify(activities)),
    };
  }
}

import { Filter } from 'firebase-admin/firestore';

export class FirestoreBookingQueryProvider implements BookingQueryProvider {
  async listBookings(filter: BookingListFilter, roleFilters: RoleFilter[]): Promise<BookingListResponse> {
    const db = getAdminDb();
    let query: any = db.collection('bookings');

    // Apply role filters
    for (const rf of roleFilters) {
      if ('type' in rf && rf.type === 'OR') {
        const filters = rf.conditions.map(cond => 
          cond.op === '==' 
            ? Filter.where(cond.field, '==', cond.value)
            : Filter.where(cond.field, 'in', cond.value)
        );
        query = query.where(Filter.or(...filters));
      } else if ('field' in rf) {
        query = query.where(rf.field, rf.op, rf.value);
      }
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
    query = query.limit(limit);

    if (filter.cursor) {
      const cursorDoc = await db.collection('bookings').doc(filter.cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    const snap = await query.get();
    const data = snap.docs.map((doc: any) => doc.data() as Booking);
    
    const hasMore = data.length === limit;
    const nextCursor = hasMore ? data[data.length - 1].id : null;

    return {
      data,
      nextCursor,
      hasMore,
    };
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
      accommodations: accSnap.docs.map((d: any) => d.data() as BookingAccommodation),
      transports: transSnap.docs.map((d: any) => d.data() as BookingTransport),
      activities: actSnap.docs.map((d: any) => d.data() as BookingActivity),
    };
  }
}
