import { isUserRole, UserRole } from '../../src/types/index.js';

const SUPPLIER_COST_KEYS = [
  'supplierCost',
  'internalCost',
  'supplierPayment',
  'supplierNotes',
  'internalNotes',
  'negotiatedRate',
  'negotiatedBaseRate',
  'standardBaseRate',
  'standardRateId',
  'supplierContractDiscount',
  'internalSupplierNotes',
  'baseRate',
  'supplierCostPerNight',
  'frozenTotalSupplierCost',
  'accommodationSupplierCost',
  'transportSupplierCost',
  'activitySupplierCost',
  'otherSupplierCosts',
  'authoritativeSupplierCost',
  'quotedSupplierCost',
  'authoritativeTotalSupplierCost',
  'quotedTotalSupplierCost',
  'supplementCost',
  'baseSupplierCost',
  'additionalChargesTotal',
  'totalSupplierCost'
];

const PROFIT_MARGIN_KEYS = [
  'grossProfit',
  'grossMargin',
  'profit',
  'commercialDiscount',
  'estimatedGrossProfit',
  'estimatedGrossMargin'
];

const FULL_FINANCIAL_ROLES: readonly UserRole[] = ['Founder', 'Admin', 'Accounts'];
const SUPPLIER_COST_ROLES: readonly UserRole[] = [
  ...FULL_FINANCIAL_ROLES,
  'Reservations',
];
const PROFIT_MARGIN_ROLES: readonly UserRole[] = [
  ...FULL_FINANCIAL_ROLES,
  'Sales Manager',
];

/**
 * Strips confidential supplier cost, profit, and internal margin data based on UserRole.
 * - Founder, Admin, Accounts: Full financial visibility.
 * - Reservations: Can view supplier costs/rates, but profit/margin analytics are redacted.
 * - Sales Manager: Can view selling price and gross margin, but supplier base costs are restricted.
 * - Sales Executive, Operations, Marketing: Base costs, supplier disbursements, and margin analytics are redacted.
 * - Customer (fallback): Everything redacted.
 */
export function sanitizeFinancialData<T>(data: T, userRole: UserRole | string | null | undefined): T {
  if (!data || typeof data !== 'object') {
    return data;
  }

  // Runtime data can originate from employee documents. TypeScript cannot
  // guarantee that a stored role is recognized, so unknown roles must receive
  // the most restrictive response rather than falling through to full access.
  const recognizedRole = isUserRole(userRole) ? userRole : undefined;

  if (data instanceof Date) {
    return new Date(data.getTime()) as unknown as T;
  }

  // Full financial access
  if (recognizedRole && FULL_FINANCIAL_ROLES.includes(recognizedRole)) {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeFinancialData(item, recognizedRole)) as unknown as T;
  }

  const sanitized: Record<string, any> = {};

  for (const [key, value] of Object.entries(data as Record<string, any>)) {
    // 1. Supplier costs use an explicit allowlist so new/unknown roles fail closed.
    if (SUPPLIER_COST_KEYS.includes(key) &&
        (!recognizedRole || !SUPPLIER_COST_ROLES.includes(recognizedRole))) {
      continue;
    }

    // 2. Profit/margin uses a separate allowlist; Reservations is excluded.
    if (PROFIT_MARGIN_KEYS.includes(key) &&
        (!recognizedRole || !PROFIT_MARGIN_ROLES.includes(recognizedRole))) {
      continue;
    }

    if (value && typeof value === 'object') {
      sanitized[key] = sanitizeFinancialData(value, recognizedRole);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized as T;
}
