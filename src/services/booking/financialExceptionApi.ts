import { authenticatedMutationHeaders, authenticatedReadHeaders } from '../auth/authenticatedApi';
import type {
  BookingAmendment,
  CommissionLedgerEntry,
  RefundLedgerEntry,
  RefundRequest,
  SupplierSubstitution,
} from '../../types/financialExceptions';

export interface FinancialExceptionOverview {
  bookingId: string;
  amendments: BookingAmendment[];
  substitutions: SupplierSubstitution[];
  refunds: RefundRequest[];
  refundLedger: RefundLedgerEntry[];
  commissions: CommissionLedgerEntry[];
  auditTimeline: Array<Record<string, unknown>>;
}

async function responseData<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || body.code || 'Financial workflow request failed.');
  return body.data as T;
}

async function mutate<T>(path: string, body: unknown, employeeId: string): Promise<T> {
  return responseData<T>(await fetch(`/api/financial-exceptions${path}`, {
    method: 'POST',
    headers: await authenticatedMutationHeaders(employeeId),
    body: JSON.stringify(body),
  }));
}

export async function getFinancialExceptionOverview(bookingId: string, employeeId: string) {
  return responseData<FinancialExceptionOverview>(await fetch(
    `/api/financial-exceptions/bookings/${encodeURIComponent(bookingId)}`,
    { headers: await authenticatedReadHeaders(employeeId) },
  ));
}

export const proposeAmendment = (bookingId: string, body: unknown, employeeId: string) =>
  mutate<BookingAmendment>(`/bookings/${encodeURIComponent(bookingId)}/amendments`, body, employeeId);

export const decideAmendment = (id: string, body: unknown, employeeId: string) =>
  mutate<BookingAmendment>(`/amendments/${encodeURIComponent(id)}/decision`, body, employeeId);

export const applyAmendment = (id: string, employeeId: string) =>
  mutate(`/amendments/${encodeURIComponent(id)}/apply`, {}, employeeId);

export const proposeSubstitution = (bookingId: string, body: unknown, employeeId: string) =>
  mutate<SupplierSubstitution>(`/bookings/${encodeURIComponent(bookingId)}/substitutions`, body, employeeId);

export const decideSubstitution = (id: string, body: unknown, employeeId: string) =>
  mutate<SupplierSubstitution>(`/substitutions/${encodeURIComponent(id)}/decision`, body, employeeId);

export const applySubstitution = (id: string, employeeId: string) =>
  mutate(`/substitutions/${encodeURIComponent(id)}/apply`, {}, employeeId);

export const calculateRefund = (bookingId: string, body: unknown, employeeId: string) =>
  mutate<RefundRequest>(`/bookings/${encodeURIComponent(bookingId)}/refunds/calculate`, body, employeeId);

export const submitRefund = (id: string, employeeId: string) =>
  mutate<RefundRequest>(`/refunds/${encodeURIComponent(id)}/submit`, {}, employeeId);

export const decideRefund = (id: string, body: unknown, employeeId: string) =>
  mutate<RefundRequest>(`/refunds/${encodeURIComponent(id)}/decision`, body, employeeId);

export const markRefundPaid = (id: string, body: unknown, employeeId: string) =>
  mutate(`/refunds/${encodeURIComponent(id)}/pay`, body, employeeId);

export const adjustCommission = (bookingId: string, body: unknown, employeeId: string) =>
  mutate<CommissionLedgerEntry>(`/bookings/${encodeURIComponent(bookingId)}/commissions/adjust`, body, employeeId);

export const settleCommission = (employeeIdToSettle: string, body: unknown, employeeId: string) =>
  mutate(`/commissions/${encodeURIComponent(employeeIdToSettle)}/settlements`, body, employeeId);
