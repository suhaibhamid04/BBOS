import { isUserRole, UserRole } from '../../src/types/index.js';
import type { AuthorizationDecision } from '../authorization/policyTypes.js';

import { SUPPLIER_COST_FIELDS as SUPPLIER_COST_KEYS, PROFIT_MARGIN_FIELDS as PROFIT_MARGIN_KEYS } from '../authorization/financialFields.js';

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

function financialVisibility(userRole: string | null | undefined, authorization?: AuthorizationDecision): Exclude<FinancialVisibility, 'SCOPED_SALES'> {
  const role = isUserRole(userRole) ? userRole : undefined;
  const visibility = role ? ROLE_FINANCIAL_VISIBILITY[role] : 'REDACTED';
  if (visibility !== 'SCOPED_SALES') return visibility;
  return authorization?.allowed === true && authorization.code === 'ALLOWED' &&
    ((role === 'Sales Executive' && authorization.scope === 'OWN') ||
     (role === 'Sales Manager' && authorization.scope === 'TEAM')) ? 'FULL' : 'REDACTED';
}

/** Cost calculators contain amounts under generic keys such as totalAmount,
 * displayAmount and breakdown. Project operational metadata explicitly instead
 * of treating these responses like customer-facing commercial records. */
export function projectSupplierCalculation<T extends Record<string, unknown>>(
  data: T, userRole: string | null | undefined, authorization?: AuthorizationDecision,
): Partial<T> {
  if (financialVisibility(userRole, authorization) !== 'REDACTED') {
    return sanitizeFinancialData(data, userRole, authorization);
  }
  const safeFields = new Set([
    'available', 'error', 'reason', 'needsConfirmation', 'availabilityStatus',
    'propertyId', 'propertyName', 'roomCategoryId', 'roomCategoryName', 'mealPlan', 'nights',
    'taxIncluded', 'taxDescription', 'missingRateDates',
  ]);
  return Object.fromEntries(Object.entries(data).filter(([key]) => safeFields.has(key))) as Partial<T>;
}

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
  const visibility = financialVisibility(recognizedRole, resourceAuthorization);

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
