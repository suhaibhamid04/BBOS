import type { Booking, Lead, Quote, UserRole } from '../types';

export type DashboardDomain = 'leads' | 'quotes' | 'bookings';
export type DashboardLoadErrors = Partial<Record<DashboardDomain, string>>;

export interface DashboardMetric<T> {
  status: 'available' | 'unavailable' | 'forbidden';
  value?: T;
  reason?: string;
}

export interface DashboardMetrics {
  verifiedCustomerPayments: DashboardMetric<number>;
  newLeads: DashboardMetric<number>;
  conversionRate: DashboardMetric<number>;
  activeQuotes: DashboardMetric<number>;
  activeBookings: DashboardMetric<number>;
}

const financialRoles = new Set<UserRole>(['Founder', 'Admin', 'Accounts', 'Sales Manager']);

function unavailable<T>(reason: string): DashboardMetric<T> {
  return { status: 'unavailable', reason };
}

function available<T>(value: T): DashboardMetric<T> {
  return { status: 'available', value };
}

export function calculateDashboardMetrics(input: {
  leads: Lead[];
  quotes: Quote[];
  bookings: Booking[];
  role: UserRole;
  errors?: DashboardLoadErrors;
}): DashboardMetrics {
  const { leads, quotes, bookings, role, errors = {} } = input;
  const leadError = errors.leads;
  const quoteError = errors.quotes;
  const bookingError = errors.bookings;
  const converted = leads.filter(lead => lead.status === 'CONVERTED').length;

  const verifiedCustomerPayments: DashboardMetric<number> = !financialRoles.has(role)
    ? { status: 'forbidden', reason: 'Financial summary is restricted for this role.' }
    : bookingError
      ? unavailable(`Booking payment data could not be loaded: ${bookingError}`)
      : available(bookings.reduce((sum, booking) => sum + (Number(booking.amountReceived) || 0), 0));

  return {
    verifiedCustomerPayments,
    newLeads: leadError
      ? unavailable(`Lead data could not be loaded: ${leadError}`)
      : available(leads.filter(lead => lead.status === 'NEW').length),
    conversionRate: leadError
      ? unavailable(`Lead data could not be loaded: ${leadError}`)
      : available(leads.length === 0 ? 0 : Number(((converted / leads.length) * 100).toFixed(1))),
    activeQuotes: quoteError
      ? unavailable(`Quote data could not be loaded: ${quoteError}`)
      : available(quotes.filter(quote => ['DRAFT', 'PENDING_APPROVAL', 'SENT', 'VIEWED'].includes(quote.status)).length),
    activeBookings: bookingError
      ? unavailable(`Booking data could not be loaded: ${bookingError}`)
      : available(bookings.filter(booking => !['CANCELLED', 'COMPLETED'].includes(booking.status)).length),
  };
}

export function formatMetric<T>(metric: DashboardMetric<T>, formatter: (value: T) => string): string {
  return metric.status === 'available' ? formatter(metric.value as T) : 'Unavailable';
}
