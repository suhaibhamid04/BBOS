import { Booking, BookingAccommodation, BookingTransport, BookingActivity, BookingStatus, PaymentStatus } from './booking';

export interface BookingListFilter {
  status?: BookingStatus;
  paymentStatus?: PaymentStatus;
  query?: string; // Search by bookingReference or customerName
  cursor?: string;
  limit?: number;
}

export interface BookingListResponse {
  data: Booking[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface BookingPaymentSummary {
  paymentStatus: PaymentStatus;
  amountReceived: number;
  amountPending: number;
  totalSellingPrice: number | undefined;
}

export interface BookingDetailResponse {
  booking: Booking;
  accommodations: BookingAccommodation[];
  transports: BookingTransport[];
  activities: BookingActivity[];
  paymentSummary: BookingPaymentSummary | null;
}
