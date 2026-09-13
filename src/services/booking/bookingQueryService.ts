import { PaymentActor } from '../payment/paymentService';
import { APP_CONFIG } from '../../config';
import { BookingListFilter, BookingListResponse, BookingDetailResponse, BookingPaymentSummary } from '../../types/bookingApi';
import { BookingQueryProvider, InMemoryBookingQueryProvider, FirestoreBookingQueryProvider } from './bookingQueryProvider';
import { Booking } from '../../types/booking';
import { PaymentStorageProvider, FirestorePaymentStorageProvider, InMemoryPaymentStorageProvider } from '../payment/paymentStorageProvider';

export class BookingQueryError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'BookingQueryError';
  }
}

export class BookingQueryService {
  private queryProvider: BookingQueryProvider;
  private paymentProvider: PaymentStorageProvider;

  constructor(queryProvider?: BookingQueryProvider, paymentProvider?: PaymentStorageProvider) {
    this.queryProvider = queryProvider || (APP_CONFIG.DEMO_MODE ? new InMemoryBookingQueryProvider() : new FirestoreBookingQueryProvider());
    this.paymentProvider = paymentProvider || (APP_CONFIG.DEMO_MODE ? new InMemoryPaymentStorageProvider() : new FirestorePaymentStorageProvider());
  }

  /**
   * Translates the actor's role into Firestore query filters (where clauses)
   * to ensure they only fetch bookings they are assigned to or authorized for.
   */
  private getRoleFilters(actor: PaymentActor): any[] {
    if (actor.role === 'Marketing') {
      throw new BookingQueryError(403, 'FORBIDDEN', 'Marketing role has no access to bookings.');
    }

    if (['Founder', 'Admin', 'Accounts'].includes(actor.role)) {
      return []; // Enterprise-wide
    }

    if (actor.role === 'Operations') {
      return [{ field: 'assignedOperationsEmployeeId', op: '==', value: actor.id }];
    }

    if (actor.role === 'Sales Executive') {
      return [{ field: 'assignedSalesEmployeeId', op: '==', value: actor.id }];
    }

    if (actor.role === 'Sales Manager') {
      return [
        { 
          type: 'OR', 
          conditions: [
            { field: 'assignedSalesManagerId', op: '==', value: actor.id },
            { field: 'assignedSalesEmployeeId', op: '==', value: actor.id }
          ]
        }
      ];
    }

    throw new BookingQueryError(403, 'FORBIDDEN', `Role ${actor.role} is not authorized.`);
  }

  /**
   * Verifies if an actor is authorized to read a specific booking.
   * Mirrors `assertBookingPaymentAccess` but strictly for READ access.
   */
  private assertBookingReadAccess(actor: PaymentActor, booking: Booking): void {
    if (actor.role === 'Marketing') {
      throw new BookingQueryError(403, 'FORBIDDEN', 'Marketing role has no access to bookings.');
    }

    if (['Founder', 'Admin', 'Accounts'].includes(actor.role)) {
      return;
    }

    if (actor.role === 'Operations') {
      if (booking.assignedOperationsEmployeeId !== actor.id) {
        throw new BookingQueryError(403, 'FORBIDDEN', 'Operations user is not assigned to this booking.');
      }
      return;
    }

    if (actor.role === 'Sales Executive') {
      if (booking.assignedSalesEmployeeId !== actor.id) {
        throw new BookingQueryError(403, 'FORBIDDEN', 'Sales Executive is not authorized to access this unassigned booking.');
      }
      return;
    }

    if (actor.role === 'Sales Manager') {
      const isManagerAuthorized = Boolean(
        (booking.assignedSalesManagerId && booking.assignedSalesManagerId === actor.id) ||
        (booking.assignedSalesEmployeeId && booking.assignedSalesEmployeeId === actor.id)
      );
      if (!isManagerAuthorized) {
        throw new BookingQueryError(403, 'FORBIDDEN', 'Sales Manager is not authorized to access this booking.');
      }
      return;
    }

    throw new BookingQueryError(403, 'FORBIDDEN', `Role ${actor.role} is not authorized.`);
  }

  /**
   * GET /api/bookings
   */
  async listBookings(filter: BookingListFilter, actor: PaymentActor): Promise<BookingListResponse> {
    const roleFilters = this.getRoleFilters(actor);
    
    // Server-side limits to prevent abuse
    if (filter.limit && (filter.limit > 100 || filter.limit < 1)) {
      filter.limit = 20;
    }

    // 1. Cursor Security: Bind cursor to query context (filters + actor scope)
    const filterContext = JSON.stringify({
      status: filter.status || null,
      paymentStatus: filter.paymentStatus || null,
      query: filter.query || null,
      role: actor.role,
      actorId: actor.id
    });

    let rawCursorId: string | undefined = undefined;
    if (filter.cursor) {
      try {
        const decodedStr = Buffer.from(filter.cursor, 'base64').toString('utf-8');
        const decoded = JSON.parse(decodedStr);
        if (decoded.context !== filterContext) {
          throw new BookingQueryError(400, 'INVALID_CURSOR', 'Cursor is invalid or used in a different query context.');
        }
        rawCursorId = decoded.id;
      } catch (e: any) {
        if (e instanceof BookingQueryError) throw e;
        throw new BookingQueryError(400, 'INVALID_CURSOR', 'Malformed cursor.');
      }
    }

    const safeFilter = { ...filter, cursor: rawCursorId };

    const results = await this.queryProvider.listBookings(safeFilter, roleFilters);

    // Final safety check to ensure provider didn't leak unauthorized bookings
    for (const b of results.data) {
      this.assertBookingReadAccess(actor, b);
    }

    // Encode nextCursor
    if (results.nextCursor) {
      const nextObj = {
        id: results.nextCursor,
        context: filterContext
      };
      results.nextCursor = Buffer.from(JSON.stringify(nextObj)).toString('base64');
    }

    return results;
  }

  /**
   * GET /api/bookings/:id
   */
  async getBookingDetail(bookingId: string, actor: PaymentActor): Promise<BookingDetailResponse> {
    if (!bookingId) {
      throw new BookingQueryError(400, 'BAD_REQUEST', 'Booking ID is required.');
    }

    const data = await this.queryProvider.getBookingWithServices(bookingId);
    if (!data) {
      throw new BookingQueryError(404, 'BOOKING_NOT_FOUND', `Booking with ID "${bookingId}" not found.`);
    }

    // IDOR Protection
    this.assertBookingReadAccess(actor, data.booking);

    // Payment Summary (Role-Safe)
    // The top-level Booking already contains amountReceived, amountPending, paymentStatus.
    // This is safe to return as a summary. Detailed payments are fetched from Stage 5 routes.
    let paymentSummary: BookingPaymentSummary | null = null;
    
    // We only expose totalSellingPrice to roles that are allowed to see it.
    // Operations role typically does not need totalSellingPrice.
    let isAllowedSellingPrice = !['Operations', 'Marketing'].includes(actor.role);
    
    paymentSummary = {
      paymentStatus: data.booking.paymentStatus || 'UNPAID',
      amountReceived: data.booking.amountReceived || 0,
      amountPending: data.booking.amountPending || 0,
      totalSellingPrice: isAllowedSellingPrice ? data.booking.totalSellingPrice : undefined,
    };

    // Sanitize Booking itself (remove totalSellingPrice if Operations)
    const sanitizedBooking = { ...data.booking };
    if (!isAllowedSellingPrice) {
      delete sanitizedBooking.totalSellingPrice;
    }

    return {
      booking: sanitizedBooking,
      accommodations: data.accommodations,
      transports: data.transports,
      activities: data.activities,
      paymentSummary,
    };
  }
}
