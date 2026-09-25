import { isUserRole, UserRole } from '../../src/types/index.js';
import type { AuthorizationDecision } from '../authorization/policyTypes.js';

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

type FinancialVisibility = 'FULL' | 'SUPPLIER_ONLY' | 'SCOPED_SALES' | 'REDACTED';

// Defense-in-depth for legacy endpoints. Stage C detail endpoints use the
// resource-aware DTO policy after authorization instead of this coarse matrix.
const ROLE_FINANCIAL_VISIBILITY: Record<UserRole, FinancialVisibility> = {
  Founder: 'FULL',
  Admin: 'FULL',
  Accounts: 'FULL',
  'Sales Manager': 'SCOPED_SALES',
  'Sales Executive': 'SCOPED_SALES',
  Reservations: 'SUPPLIER_ONLY',
  Operations: 'REDACTED',
  Marketing: 'REDACTED',
};

/**
 * Strips confidential supplier cost, profit, and internal margin data based on UserRole.
 * - Founder, Admin, Accounts: Full financial visibility.
 * - Reservations: Can view supplier costs/rates, but profit/margin analytics are redacted.
 * - Sales Manager TEAM and Sales Executive OWN: full financial visibility only
 *   when an allowed Stage C resource decision is supplied.
 * - Unscoped Sales, Operations, and Marketing: financial data is redacted.
 * - Customer (fallback): Everything redacted.
 */
export function sanitizeFinancialData<T>(
  data: T,
  userRole: UserRole | string | null | undefined,
  resourceAuthorization?: AuthorizationDecision,
): T {
  if (!data || typeof data !== 'object') {
    return data;
  }

  // Runtime data can originate from employee documents. TypeScript cannot
  // guarantee that a stored role is recognized, so unknown roles must receive
  // the most restrictive response rather than falling through to full access.
  const recognizedRole = isUserRole(userRole) ? userRole : undefined;
  const configuredVisibility = recognizedRole ? ROLE_FINANCIAL_VISIBILITY[recognizedRole] : 'REDACTED';
  const visibility: Exclude<FinancialVisibility, 'SCOPED_SALES'> = configuredVisibility === 'SCOPED_SALES'
    ? resourceAuthorization?.allowed === true &&
      resourceAuthorization.code === 'ALLOWED' &&
      ((recognizedRole === 'Sales Executive' && resourceAuthorization.scope === 'OWN') ||
       (recognizedRole === 'Sales Manager' && resourceAuthorization.scope === 'TEAM'))
      ? 'FULL'
      : 'REDACTED'
    : configuredVisibility;

  if (data instanceof Date) {
    return new Date(data.getTime()) as unknown as T;
  }

  // Full financial access
  if (visibility === 'FULL') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeFinancialData(item, recognizedRole, resourceAuthorization)) as unknown as T;
  }

  const sanitized: Record<string, any> = {};

  for (const [key, value] of Object.entries(data as Record<string, any>)) {
    // 1. Supplier costs use an explicit allowlist so new/unknown roles fail closed.
    if (SUPPLIER_COST_KEYS.includes(key) &&
        visibility !== 'SUPPLIER_ONLY') {
      continue;
    }

    // 2. Profit/margin uses a separate allowlist; Reservations is excluded.
    if (PROFIT_MARGIN_KEYS.includes(key) &&
        (visibility === 'REDACTED' || visibility === 'SUPPLIER_ONLY')) {
      continue;
    }

    if (value && typeof value === 'object') {
      sanitized[key] = sanitizeFinancialData(value, recognizedRole, resourceAuthorization);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized as T;
}
