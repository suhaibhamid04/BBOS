import {
  Booking,
  BookingAccommodation,
  BookingTransport,
  BookingActivity,
  BookingStatus,
  FinancialSnapshot,
  PaymentStatus,
} from './booking';

export interface BookingListFilter {
  status?: BookingStatus;
  paymentStatus?: PaymentStatus;
  query?: string; // Search by bookingReference or customerName
  cursor?: string;
  limit?: number;
}

export interface BookingListResponse {
  data: BookingListItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

/** Explicit server projection. Fields vary by the authorized role. */
export type BookingListItem = Pick<
  Booking,
  'id' | 'bookingReference' | 'tripId' | 'customerId' | 'status' |
  'travelStartDate' | 'travelEndDate' | 'createdAt' | 'updatedAt'
> & Partial<Omit<Booking, 'id' | 'bookingReference' | 'tripId' | 'customerId' | 'status' |
  'travelStartDate' | 'travelEndDate' | 'createdAt' | 'updatedAt'>>;

export interface BookingPaymentSummary {
  paymentStatus: PaymentStatus;
  amountReceived: number;
  amountPending: number;
  totalSellingPrice: number | undefined;
}

export interface BookingDetailResponse {
  booking: BookingListItem;
  accommodations: Partial<BookingAccommodation>[];
  transports: Partial<BookingTransport>[];
  activities: Partial<BookingActivity>[];
  paymentSummary: BookingPaymentSummary | null;
  financialSnapshot?: Partial<FinancialSnapshot> | null;
}
