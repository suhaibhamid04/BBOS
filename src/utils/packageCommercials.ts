import type {
  PackageCommercialApproval,
  PackagePricingMode,
  PackageSupplierCostBreakdown,
  PackageSupplierCostCategory,
  QuoteCommercialApproval,
} from '../types';

export const MAX_PACKAGE_AMOUNT = 100_000_000;

export interface PackageCostEntry {
  category: PackageSupplierCostCategory;
  label: string;
  amount: number;
}

export interface PackageEconomics {
  pricingMode: PackagePricingMode;
  pricingInput: number;
  totalSupplierCost: number;
  totalSellingPrice: number;
  grossProfit: number;
  grossMargin: number;
}

export interface ApprovalCommercialRecord {
  totalSupplierCost?: number;
  totalSellingPrice?: number;
  finalAmount?: number;
  grossProfit?: number;
  grossMargin?: number;
  supplierCostSource?: { costingRevision?: number };
}

/** Approval is an authorization grant only for the exact reviewed economics. */
export function isLowMarginApprovalCurrent(
  approval: QuoteCommercialApproval | PackageCommercialApproval | undefined,
  commercial: ApprovalCommercialRecord,
): boolean {
  if (approval?.required !== true || approval.state !== 'APPROVED' || !approval.currentDecision) return false;
  const reviewed = approval.currentDecision;
  const sellingPrice = commercial.finalAmount ?? commercial.totalSellingPrice;
  return reviewed.totalSupplierCost === commercial.totalSupplierCost
    && reviewed.totalSellingPrice === sellingPrice
    && reviewed.grossProfit === commercial.grossProfit
    && reviewed.grossMargin === commercial.grossMargin
    && (reviewed.costingRevision === undefined
      || reviewed.costingRevision === commercial.supplierCostSource?.costingRevision);
}

export function assessLowMarginPolicy(
  grossMargin: number,
  thresholdPercent: number | undefined,
  assessedAt: string,
): PackageCommercialApproval {
  if (thresholdPercent === undefined) {
    return { required: false, state: 'NOT_REQUIRED', assessedAt };
  }
  if (!Number.isFinite(thresholdPercent) || thresholdPercent < 0 || thresholdPercent >= 100) {
    throw new Error('Configured low-margin threshold must be between 0 and less than 100%.');
  }
  const required = grossMargin < thresholdPercent;
  return {
    required,
    state: required ? 'REVIEW_REQUIRED' : 'NOT_REQUIRED',
    thresholdPercent,
    assessedAt,
  };
}

export function emptyPackageSupplierCostBreakdown(): PackageSupplierCostBreakdown {
  return {
    accommodation: { total: 0, items: [] },
    transport: { total: 0, items: [] },
    activities: { total: 0, items: [] },
    other: { total: 0, items: [] },
    total: 0,
  };
}

export function buildPackageSupplierCostBreakdown(entries: PackageCostEntry[]): PackageSupplierCostBreakdown {
  const result = emptyPackageSupplierCostBreakdown();
  const keys = {
    ACCOMMODATION: 'accommodation',
    TRANSPORT: 'transport',
    ACTIVITIES: 'activities',
    OTHER: 'other',
  } as const;
  for (const entry of entries) {
    if (!Number.isFinite(entry.amount) || entry.amount < 0) {
      throw new Error('Supplier-cost breakdown contains an invalid amount.');
    }
    const key = keys[entry.category];
    const amount = Number(entry.amount);
    result[key].items.push({ label: entry.label.trim() || 'Package service', amount });
    result[key].total += amount;
    result.total += amount;
  }
  return result;
}

export function calculatePackageEconomics(
  totalSupplierCost: number,
  pricingMode: PackagePricingMode,
  pricingInput: number,
): PackageEconomics {
  if (!Number.isFinite(totalSupplierCost) || totalSupplierCost < 0 || totalSupplierCost > MAX_PACKAGE_AMOUNT) {
    throw new Error('Supplier cost must be a finite, non-negative package amount.');
  }
  if (!Number.isFinite(pricingInput) || pricingInput < 0 || pricingInput > MAX_PACKAGE_AMOUNT) {
    throw new Error('Pricing input must be a finite, non-negative package amount.');
  }

  let totalSellingPrice: number;
  if (pricingMode === 'TARGET_MARGIN') {
    if (pricingInput >= 100) throw new Error('Target margin must be less than 100%.');
    totalSellingPrice = Math.round(totalSupplierCost / (1 - pricingInput / 100));
  } else if (pricingMode === 'TARGET_PROFIT') {
    totalSellingPrice = Math.round(totalSupplierCost + pricingInput);
  } else {
    totalSellingPrice = pricingInput;
  }
  if (!Number.isFinite(totalSellingPrice) || totalSellingPrice < 0 || totalSellingPrice > MAX_PACKAGE_AMOUNT) {
    throw new Error('Derived selling price is outside the supported package range.');
  }
  const grossProfit = totalSellingPrice - totalSupplierCost;
  const grossMargin = totalSellingPrice > 0
    ? Number(((grossProfit / totalSellingPrice) * 100).toFixed(1))
    : 0;
  return { pricingMode, pricingInput, totalSupplierCost, totalSellingPrice, grossProfit, grossMargin };
}

