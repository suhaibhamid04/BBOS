import type { PaymentMethod, PaymentRecordStatus } from './payment';

export type SupplierServiceType = 'ACCOMMODATION' | 'TRANSPORT' | 'ACTIVITY' | 'OTHER';
export type SupplierPaymentType = 'ADVANCE' | 'PARTIAL' | 'FINAL_SETTLEMENT';
export type SupplierSettlementStatus =
  | 'UNPAID'
  | 'PARTIALLY_PAID'
  | 'SETTLED'
  | 'OVERPAID'
  | 'PENDING_APPROVAL';

export interface SupplierPaymentRecord {
  id: string;
  obligationId: string;
  bookingId: string;
  bookingReference: string;
  sourceSnapshotId: string;
  sourceServiceId: string;
  bookingServiceId: string;
  supplierId: string;
  supplierName: string;
  serviceType: SupplierServiceType;
  amountMinor: number;
  currency: string;
  paymentDate: string;
  paymentMethod: PaymentMethod;
  referenceNumber: string;
  paymentType: SupplierPaymentType;
  notes?: string;
  status: PaymentRecordStatus;
  recordedByEmployeeId: string;
  recordedByName: string;
  recordedAt: string;
  verifiedByEmployeeId?: string;
  verifiedByName?: string;
  verifiedAt?: string;
  rejectedByEmployeeId?: string;
  rejectedByName?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  voidedByEmployeeId?: string;
  voidedByName?: string;
  voidedAt?: string;
  voidReason?: string;
  idempotencyKey?: string;
  createdAt: string;
  updatedAt: string;
  schemaVersion: 'D4B-1';
}

export interface SupplierRateDiscrepancySummary {
  frozenSupplierUnitRateMinor: number;
  confirmedSupplierUnitRateMinor: number;
  differenceMinor: number;
  reason: string;
  recordedAt: string;
  recordedByEmployeeId: string;
  approvalStatus: 'REQUIRED';
}

export interface SupplierPayable {
  obligationId: string;
  bookingId: string;
  bookingReference: string;
  sourceSnapshotId: string;
  sourceSnapshotVersion: number;
  sourceServiceId: string;
  bookingServiceId?: string;
  supplierId: string;
  supplierName: string;
  serviceType: SupplierServiceType;
  serviceName: string;
  serviceStartDate?: string;
  serviceEndDate?: string;
  settlementPeriod?: string;
  dueDate?: string;
  currency: string;
  frozenLiabilityMinor: number;
  verifiedPaidMinor: number;
  outstandingMinor: number;
  overpaidMinor: number;
  settlementStatus: SupplierSettlementStatus;
  confirmationStatus?: string;
  requiresCommercialApproval: boolean;
  rateDiscrepancy?: SupplierRateDiscrepancySummary;
  sourceIntegrityStatus: 'READY' | 'MISSING_SERVICE_LINK';
  canRecordPayment: boolean;
  payments?: SupplierPaymentRecord[];
}

export interface SupplierPayableOperationalView {
  obligationId: string;
  bookingId: string;
  bookingReference: string;
  bookingServiceId?: string;
  supplierId: string;
  supplierName: string;
  serviceType: SupplierServiceType;
  serviceName: string;
  serviceStartDate?: string;
  serviceEndDate?: string;
  dueDate?: string;
  settlementStatus: SupplierSettlementStatus;
  confirmationStatus?: string;
  requiresCommercialApproval: boolean;
  sourceIntegrityStatus: 'READY' | 'MISSING_SERVICE_LINK';
}

export interface SupplierPayableSummary {
  currency: string;
  totalFrozenLiabilityMinor: number;
  totalVerifiedPaidMinor: number;
  totalOutstandingMinor: number;
  totalOverpaidMinor: number;
  overdueCount: number;
  partiallyPaidCount: number;
  disputedCount: number;
  obligationCount: number;
}

export interface SupplierPayablesResponse {
  obligations: Array<SupplierPayable | SupplierPayableOperationalView>;
  summaries?: SupplierPayableSummary[];
}

export interface RecordSupplierPaymentInput {
  amount: number;
  paymentDate: string;
  paymentMethod: PaymentMethod;
  referenceNumber: string;
  paymentType: SupplierPaymentType;
  notes?: string;
  idempotencyKey?: string;
}
