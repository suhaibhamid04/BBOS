import { authenticatedMutationHeaders, authenticatedReadHeaders } from '../auth/authenticatedApi';
import type {
  RecordSupplierPaymentInput,
  SupplierPayable,
  SupplierPayableOperationalView,
  SupplierPayableSummary,
  SupplierPaymentRecord,
} from '../../types/supplierPayable';

interface ApiErrorBody {
  error?: string;
  code?: string;
}

async function responseJson<T>(response: Response): Promise<T> {
  const payload = await response.json() as T & ApiErrorBody;
  if (!response.ok) throw new Error(payload.error || payload.code || 'Supplier payable request failed.');
  return payload;
}

export async function listSupplierPayables(employeeId: string): Promise<{
  obligations: Array<SupplierPayable | SupplierPayableOperationalView>;
  summaries?: SupplierPayableSummary[];
}> {
  const response = await fetch('/api/supplier-payables', {
    headers: await authenticatedReadHeaders(employeeId),
  });
  return responseJson(response);
}

export async function getSupplierPayable(
  bookingId: string,
  obligationId: string,
  employeeId: string,
): Promise<SupplierPayable> {
  const response = await fetch(
    `/api/supplier-payables/bookings/${encodeURIComponent(bookingId)}/${encodeURIComponent(obligationId)}`,
    { headers: await authenticatedReadHeaders(employeeId) },
  );
  const payload = await responseJson<{ data: SupplierPayable }>(response);
  return payload.data;
}

export async function recordSupplierPayment(
  bookingId: string,
  obligationId: string,
  input: RecordSupplierPaymentInput,
  employeeId: string,
): Promise<{ payment: SupplierPaymentRecord; obligation: SupplierPayable }> {
  const response = await fetch(
    `/api/supplier-payables/bookings/${encodeURIComponent(bookingId)}/${encodeURIComponent(obligationId)}/payments`,
    {
      method: 'POST',
      headers: await authenticatedMutationHeaders(employeeId),
      body: JSON.stringify(input),
    },
  );
  return responseJson(response);
}

export async function verifySupplierPayment(
  payable: SupplierPayable,
  paymentId: string,
  employeeId: string,
): Promise<{ payment: SupplierPaymentRecord; obligation: SupplierPayable }> {
  const response = await fetch(
    `/api/supplier-payables/bookings/${encodeURIComponent(payable.bookingId)}/${encodeURIComponent(payable.obligationId)}/payments/${encodeURIComponent(paymentId)}/verify`,
    { method: 'POST', headers: await authenticatedMutationHeaders(employeeId), body: '{}' },
  );
  return responseJson(response);
}

export async function rejectSupplierPayment(
  payable: SupplierPayable,
  paymentId: string,
  rejectionReason: string,
  employeeId: string,
): Promise<{ payment: SupplierPaymentRecord; obligation: SupplierPayable }> {
  const response = await fetch(
    `/api/supplier-payables/bookings/${encodeURIComponent(payable.bookingId)}/${encodeURIComponent(payable.obligationId)}/payments/${encodeURIComponent(paymentId)}/reject`,
    {
      method: 'POST',
      headers: await authenticatedMutationHeaders(employeeId),
      body: JSON.stringify({ rejectionReason }),
    },
  );
  return responseJson(response);
}

export async function voidSupplierPayment(
  payable: SupplierPayable,
  paymentId: string,
  voidReason: string,
  employeeId: string,
): Promise<{ payment: SupplierPaymentRecord; obligation: SupplierPayable }> {
  const response = await fetch(
    `/api/supplier-payables/bookings/${encodeURIComponent(payable.bookingId)}/${encodeURIComponent(payable.obligationId)}/payments/${encodeURIComponent(paymentId)}/void`,
    {
      method: 'POST',
      headers: await authenticatedMutationHeaders(employeeId),
      body: JSON.stringify({ voidReason }),
    },
  );
  return responseJson(response);
}
