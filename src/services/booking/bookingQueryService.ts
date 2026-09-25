import { APP_CONFIG } from '../../config';
import type { Booking } from '../../types/booking';
import type { BookingListFilter, BookingListResponse, BookingDetailResponse } from '../../types/bookingApi';
import {
  BookingQueryProvider,
  InMemoryBookingQueryProvider,
  FirestoreBookingQueryProvider,
} from './bookingQueryProvider';
import type { AuthorizationPrincipal, QueryConstraint } from '../../../server/authorization/policyTypes';
import { authorizeResource, resolveQueryScope } from '../../../server/authorization/policyEngine';
import { bookingResourceContext } from '../../../server/authorization/resourceContext';
import { buildBookingDetailDto, buildBookingListDto } from '../../../server/authorization/bookingDto';

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

function assertAuthorizedBooking(actor: AuthorizationPrincipal, booking: Booking) {
  const decision = authorizeResource(actor, 'BOOKING', 'READ_DETAIL', bookingResourceContext(booking));
  if (!decision.allowed) {
    throw new BookingQueryError(403, decision.code, decision.reason);
  }
  return decision;
}

function validateFilter(filter: BookingListFilter): void {
  const activeFilters = [filter.status, filter.paymentStatus, filter.query].filter(Boolean);
  if (activeFilters.length > 1) {
    throw new BookingQueryError(
      400,
      'INVALID_FILTER',
      'Only one of status, paymentStatus, or query may be used per Booking list request.',
    );
  }
}

function effectiveConstraints(
  policyConstraints: readonly QueryConstraint[],
  filter: BookingListFilter,
): QueryConstraint[] {
  if (!filter.status) return [...policyConstraints];

  const policyStatus = policyConstraints.find(constraint => constraint.field === 'status');
  if (!policyStatus) return [...policyConstraints];

  const allowed = policyStatus.operator === 'in' && Array.isArray(policyStatus.value)
    ? policyStatus.value.includes(filter.status)
    : policyStatus.value === filter.status;
  if (!allowed) {
    throw new BookingQueryError(
      403,
      'WORKFLOW_STATE_DENIED',
      'The requested Booking state is outside the authorized workflow scope.',
    );
  }

  // Avoid combining an `in` and equality filter on the same Firestore field.
  return policyConstraints.filter(constraint => constraint.field !== 'status');
}

export class BookingQueryService {
  private queryProvider: BookingQueryProvider;

  constructor(queryProvider?: BookingQueryProvider) {
    this.queryProvider = queryProvider || (
      APP_CONFIG.DEMO_MODE ? new InMemoryBookingQueryProvider() : new FirestoreBookingQueryProvider()
    );
  }

  /** GET /api/bookings */
  async listBookings(filter: BookingListFilter, actor: AuthorizationPrincipal): Promise<BookingListResponse> {
    validateFilter(filter);
    const descriptor = resolveQueryScope(actor, 'BOOKING', 'READ_DETAIL');
    if (descriptor.scope === 'NONE' || descriptor.scope === 'AGGREGATE') {
      throw new BookingQueryError(403, 'FORBIDDEN', descriptor.deniedReason || 'Raw Booking access is denied.');
    }

    const limit = Number.isInteger(filter.limit) && (filter.limit as number) >= 1 && (filter.limit as number) <= 100
      ? filter.limit
      : 20;
    const normalizedFilter: BookingListFilter = { ...filter, limit };
    const constraints = effectiveConstraints(descriptor.constraints, normalizedFilter);
    const cursorContext = JSON.stringify({
      status: normalizedFilter.status || null,
      paymentStatus: normalizedFilter.paymentStatus || null,
      query: normalizedFilter.query || null,
      role: actor.role,
      employeeId: actor.employeeId,
      salesTeamId: actor.salesTeamId || null,
      constraints,
    });

    let cursorId: string | undefined;
    if (normalizedFilter.cursor) {
      try {
        const decoded = JSON.parse(Buffer.from(normalizedFilter.cursor, 'base64').toString('utf-8'));
        if (decoded.context !== cursorContext || typeof decoded.id !== 'string' || !decoded.id) {
          throw new BookingQueryError(400, 'INVALID_CURSOR', 'Cursor is invalid or used in a different query context.');
        }
        cursorId = decoded.id;
      } catch (error) {
        if (error instanceof BookingQueryError) throw error;
        throw new BookingQueryError(400, 'INVALID_CURSOR', 'Malformed cursor.');
      }

      const cursorBooking = await this.queryProvider.getBooking(cursorId);
      if (!cursorBooking) throw new BookingQueryError(400, 'INVALID_CURSOR', 'The Booking cursor does not exist.');
      assertAuthorizedBooking(actor, cursorBooking);
      if (
        (normalizedFilter.status && cursorBooking.status !== normalizedFilter.status) ||
        (normalizedFilter.paymentStatus && cursorBooking.paymentStatus !== normalizedFilter.paymentStatus) ||
        (normalizedFilter.query && cursorBooking.bookingReference !== normalizedFilter.query)
      ) {
        throw new BookingQueryError(400, 'INVALID_CURSOR', 'The Booking cursor is outside the requested filter.');
      }
    }

    const results = await this.queryProvider.listBookings(
      { ...normalizedFilter, cursor: cursorId },
      constraints,
    );

    const data = results.data.map(rawBooking => {
      const booking = rawBooking as Booking;
      const authorization = assertAuthorizedBooking(actor, booking);
      return buildBookingListDto(actor, booking, authorization);
    });
    const nextCursor = results.nextCursor
      ? Buffer.from(JSON.stringify({ id: results.nextCursor, context: cursorContext })).toString('base64')
      : null;

    return { data, nextCursor, hasMore: results.hasMore };
  }

  /** GET /api/bookings/:id */
  async getBookingDetail(bookingId: string, actor: AuthorizationPrincipal): Promise<BookingDetailResponse> {
    if (!bookingId) throw new BookingQueryError(400, 'BAD_REQUEST', 'Booking ID is required.');

    // Authorize the root Booking before loading related service records or the
    // restricted financial snapshot. Re-authorization below also fails closed
    // if scope metadata changes between the two reads.
    const rootBooking = await this.queryProvider.getBooking(bookingId);
    if (!rootBooking) {
      throw new BookingQueryError(404, 'BOOKING_NOT_FOUND', `Booking with ID "${bookingId}" not found.`);
    }
    assertAuthorizedBooking(actor, rootBooking);

    const data = await this.queryProvider.getBookingWithServices(bookingId);
    if (!data) {
      throw new BookingQueryError(404, 'BOOKING_NOT_FOUND', `Booking with ID "${bookingId}" not found.`);
    }

    const authorization = assertAuthorizedBooking(actor, data.booking);
    return buildBookingDetailDto(actor, data, authorization);
  }
}
