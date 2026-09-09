import { UserRole } from '../../src/types/index.js';

const RESTRICTED_FINANCIAL_KEYS = [
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
  'commercialDiscount',
];

const MARGIN_FINANCIAL_KEYS = [
  'grossProfit',
  'grossMargin',
  'profit',
];

/**
 * Strips confidential supplier cost, profit, and internal margin data based on UserRole.
 * - Founder, Admin, Accounts: Full financial visibility.
 * - Sales Manager: Can view selling price and gross margin, but supplier base costs are restricted.
 * - Sales Executive, Operations, Marketing, or Customer: Base costs, supplier disbursements, and margin analytics are completely redacted.
 */
export function sanitizeFinancialData<T>(data: T, userRole: UserRole): T {
  if (!data || typeof data !== 'object') {
    return data;
  }

  // Full financial access
  if (userRole === 'Founder' || userRole === 'Admin' || userRole === 'Accounts') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeFinancialData(item, userRole)) as unknown as T;
  }

  const sanitized: Record<string, any> = {};

  for (const [key, value] of Object.entries(data as Record<string, any>)) {
    // 1. Supplier base cost keys are stripped for all non-executive / non-accounting roles
    if (RESTRICTED_FINANCIAL_KEYS.includes(key)) {
      continue;
    }

    // 2. Margin/profit keys are allowed for Sales Manager, but stripped for Sales Executive, Ops, Marketing
    if (MARGIN_FINANCIAL_KEYS.includes(key) && userRole !== 'Sales Manager') {
      continue;
    }

    if (value && typeof value === 'object') {
      sanitized[key] = sanitizeFinancialData(value, userRole);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized as T;
}
