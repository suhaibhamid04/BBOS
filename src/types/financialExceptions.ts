import type { UserRole } from './index';

export type AmendmentStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'APPLIED'
  | 'CANCELLED';

export interface CommercialServiceSnapshot {
  serviceType: 'ACCOMMODATION' | 'TRANSPORT' | 'ACTIVITY' | 'OTHER';
  serviceId: string;
  inventoryMasterId: string;
  supplierId: string;
  categoryId?: string;
  label: string;
  supplierCost: number;
}

export interface CommercialExceptionSnapshot {
  currency: string;
  supplierCost: number;
  sellingPrice: number;
  profit: number;
  margin: number;
  travelStartDate: string;
  travelEndDate: string;
  guestCount: number;
  selectedServices: CommercialServiceSnapshot[];
}

export interface CommercialSnapshotDelta {
  supplierCost: number;
  sellingPrice: number;
  profit: number;
  margin: number;
  guestCount: number;
  travelStartDateChanged: boolean;
  travelEndDateChanged: boolean;
  changedServiceIds: string[];
}

export interface AmendmentServiceChange {
  serviceType: CommercialServiceSnapshot['serviceType'];
  serviceId: string;
  replacementServiceId?: string;
  customerFacingLabel?: string;
}

export interface BookingAmendment {
  id: string;
  bookingId: string;
  version: number;
  baseAppliedVersion: number;
  status: AmendmentStatus;
  reason: string;
  before: CommercialExceptionSnapshot;
  proposed: CommercialExceptionSnapshot;
  approved?: CommercialExceptionSnapshot;
  delta: CommercialSnapshotDelta;
  serviceChanges: AmendmentServiceChange[];
  proposedByEmployeeId: string;
  proposedByRole: UserRole;
  proposedAt: string;
  approvedByEmployeeId?: string;
  approvedAt?: string;
  rejectedByEmployeeId?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  appliedByEmployeeId?: string;
  appliedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type SubstitutionStatus = 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'APPLIED' | 'CANCELLED';

export interface SupplierSubstitution {
  id: string;
  bookingId: string;
  amendmentId?: string;
  serviceType: 'ACCOMMODATION' | 'TRANSPORT' | 'ACTIVITY';
  serviceId: string;
  original: CommercialServiceSnapshot;
  replacement: CommercialServiceSnapshot;
  originalMealPlan?: string;
  replacementMealPlan?: string;
  sameCategory: boolean;
  sameCommercialRange: boolean;
  sameServiceType: boolean;
  equivalentCategory: boolean;
  mealPlanSameOrBetter: boolean;
  occupancyEquivalent: boolean;
  inclusionsPreserved: boolean;
  costIncreasePercent: number;
  commercialTolerancePercent: number;
  materialReasons: string[];
  requiresCommercialAmendment: boolean;
  material: boolean;
  customerEconomicsChanged: boolean;
  frozenSupplierCost: number;
  replacementSupplierCost: number;
  supplierCostDifference: number;
  requiresAdminApproval: boolean;
  status: SubstitutionStatus;
  reason: string;
  proposedByEmployeeId: string;
  proposedAt: string;
  approvedByEmployeeId?: string;
  approvedAt?: string;
  rejectedByEmployeeId?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  appliedByEmployeeId?: string;
  appliedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type RefundStatus =
  | 'DRAFT'
  | 'CALCULATED'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'PROCESSING'
  | 'PAID'
  | 'CANCELLED';

export interface RefundDeduction {
  type: 'SUPPLIER_CANCELLATION_CHARGE' | 'NON_REFUNDABLE_SUPPLIER_PAYMENT' | 'BOOKING_BRIDGE_POLICY' | 'MANUAL_ADDITIONAL_DEDUCTION';
  amount: number;
  sourceReference: string;
  reason: string;
}

export interface RefundCalculation {
  confirmedPackageSellingPrice: number;
  cancellationDate: string;
  daysBeforeDeparture: number;
  cancellationType: 'STANDARD' | 'NO_SHOW';
  cancellationPercentage: number;
  standardCancellationCharge: number;
  verifiedPaymentsReceived: number;
  grossRefundableBasis: number;
  supplierCancellationCharges: number;
  nonRefundableSupplierPayments: number;
  recoverableSupplierAmounts: number;
  supplierDeductions: number;
  netSupplierExposure: number;
  applicableCancellationCharge: number;
  bookingBridgeDeductions: number;
  manualAdditionalDeduction: number;
  alreadyRefundedAmount: number;
  suggestedRefundAmount: number;
  policyCode: string;
}

export interface RefundRequest {
  id: string;
  bookingId: string;
  customerId: string;
  currency: string;
  status: RefundStatus;
  reason: string;
  calculation: RefundCalculation;
  deductions: RefundDeduction[];
  requestedAmount: number;
  approvedRefundAmount?: number;
  actualRefundedAmount: number;
  requestedByEmployeeId: string;
  requestedAt: string;
  approvedByEmployeeId?: string;
  approvedAt?: string;
  rejectedByEmployeeId?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  processedByEmployeeId?: string;
  processedAt?: string;
  refundMethod?: string;
  refundReference?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RefundLedgerEntry {
  id: string;
  refundId: string;
  bookingId: string;
  customerId: string;
  currency: string;
  verifiedPaymentsReceived: number;
  grossRefundableBasis: number;
  confirmedPackageSellingPrice: number;
  standardCancellationCharge: number;
  netSupplierExposure: number;
  applicableCancellationCharge: number;
  manualAdditionalDeduction: number;
  supplierDeductions: number;
  bookingBridgeDeductions: number;
  approvedRefundAmount: number;
  actualRefundedAmount: number;
  refundMethod: string;
  refundReference: string;
  requestedByEmployeeId: string;
  approvedByEmployeeId: string;
  processedByEmployeeId: string;
  reason: string;
  paidAt: string;
}

export type CommissionEntryType = 'EARNED' | 'REVERSAL' | 'ADJUSTMENT' | 'SETTLED';

export interface CommissionLedgerEntry {
  id: string;
  bookingId: string;
  employeeId: string;
  type: CommissionEntryType;
  amount: number;
  currency: string;
  originalEntryId?: string;
  refundId?: string;
  cancellationReference?: string;
  bookingStatus: string;
  reason: string;
  actorEmployeeId: string;
  createdAt: string;
  settlementReference?: string;
  idempotencyKey: string;
  policyCode?: string;
}

export interface CommissionSummary {
  employeeId: string;
  earned: number;
  reversed: number;
  adjusted: number;
  payable: number;
  settled: number;
  outstanding: number;
  entries: CommissionLedgerEntry[];
}
