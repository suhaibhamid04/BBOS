import { isUserRole } from '../../src/types/index.js';
import type {
  AuthorizationDecision,
  AuthorizationPrincipal,
  AuthorizationResource,
} from './policyTypes.js';

const SUPPLIER_KEYS = new Set([
  'supplierCost', 'internalCost', 'supplierPayment', 'supplierNotes', 'internalNotes',
  'negotiatedRate', 'negotiatedBaseRate', 'standardBaseRate', 'supplierContractDiscount',
  'internalSupplierNotes', 'baseRate', 'supplierCostPerNight', 'frozenSupplierUnitRate',
  'frozenSupplementsCost', 'frozenTotalSupplierCost', 'accommodationSupplierCost',
  'transportSupplierCost', 'activitySupplierCost', 'otherSupplierCosts',
  'authoritativeSupplierCost', 'quotedSupplierCost', 'authoritativeTotalSupplierCost',
  'quotedTotalSupplierCost', 'supplementCost', 'baseSupplierCost',
  'additionalChargesTotal', 'totalSupplierCost',
]);

const PROFIT_KEYS = new Set([
  'grossProfit', 'grossMargin', 'profit', 'commercialDiscount',
  'estimatedGrossProfit', 'estimatedGrossMargin',
]);

const COMMERCIAL_AMOUNT_KEYS = new Set([
  'totalSellingPrice', 'totalAmount', 'finalAmount', 'discountAmount',
  'amountReceived', 'amountPending', 'overpaidAmount', 'paymentSummary',
]);

type Visibility = 'FULL' | 'SUPPLIER_WITHOUT_PROFIT' | 'OPERATIONAL_ONLY' | 'NONE';

function visibilityFor(principal: AuthorizationPrincipal, resource: AuthorizationResource): Visibility {
  if (!isUserRole(principal.role)) return 'NONE';
  if (principal.role === 'Founder' || principal.role === 'Admin' || principal.role === 'Accounts') return 'FULL';
  if (principal.role === 'Sales Executive' || principal.role === 'Sales Manager') return 'FULL';
  if (principal.role === 'Reservations' && (resource === 'TRIP' || resource === 'BOOKING' || resource === 'INVENTORY')) {
    return 'SUPPLIER_WITHOUT_PROFIT';
  }
  if (principal.role === 'Operations') return 'OPERATIONAL_ONLY';
  return 'NONE';
}

function projectValue(value: unknown, visibility: Visibility, seen: WeakMap<object, unknown>): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return new Date(value.getTime());
  if (seen.has(value)) return seen.get(value);

  if (Array.isArray(value)) {
    const output: unknown[] = [];
    seen.set(value, output);
    for (const item of value) output.push(projectValue(item, visibility, seen));
    return output;
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return value;

  const output: Record<string, unknown> = {};
  seen.set(value, output);
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (visibility === 'NONE') {
      if (SUPPLIER_KEYS.has(key) || PROFIT_KEYS.has(key) || COMMERCIAL_AMOUNT_KEYS.has(key)) continue;
    } else if (visibility === 'SUPPLIER_WITHOUT_PROFIT') {
      if (PROFIT_KEYS.has(key)) continue;
    } else if (visibility === 'OPERATIONAL_ONLY') {
      if (SUPPLIER_KEYS.has(key) || PROFIT_KEYS.has(key) || COMMERCIAL_AMOUNT_KEYS.has(key)) continue;
    }
    output[key] = projectValue(nested, visibility, seen);
  }
  return output;
}

/**
 * Field projection is intentionally separate from the authorization decision.
 * Callers must provide an allowed decision from the centralized policy engine.
 */
export function buildResourceDto<T>(
  principal: AuthorizationPrincipal,
  resource: AuthorizationResource,
  data: T,
  authorization: AuthorizationDecision,
): T {
  if (!authorization.allowed || authorization.code !== 'ALLOWED') {
    throw new Error('Cannot build a resource DTO for a denied authorization decision.');
  }
  return projectValue(data, visibilityFor(principal, resource), new WeakMap()) as T;
}
