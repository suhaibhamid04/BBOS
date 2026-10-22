export const BOOKING_BRIDGE_POLICY_VERSION = 'BBOS-POLICY-2026-10-21-V1';

export interface PaymentScheduleMilestone {
  percentage: number;
  timing: 'AT_BOOKING' | 'BEFORE_DEPARTURE' | 'CUSTOM';
  label: string;
  dueDate?: string;
}

export const STANDARD_PAYMENT_SCHEDULE: readonly PaymentScheduleMilestone[] = Object.freeze([
  Object.freeze({ percentage: 50, timing: 'AT_BOOKING', label: '50% at booking' }),
  Object.freeze({ percentage: 50, timing: 'BEFORE_DEPARTURE', label: 'Remaining balance before departure' }),
]);

export const STANDARD_TERMS_AND_CONDITIONS = [
  'Payment: 50% of the confirmed package selling price is due at booking. The remaining balance is due before departure, unless a booking-specific schedule is stated in this quotation.',
  'Cancellation: more than 30 days before departure — 10% of the confirmed package selling price; 17–30 days — 50%; 7–16 days — 100%; fewer than 7 days — 100%; no-show — 100%.',
  'The applicable cancellation charge is the higher of the standard percentage charge and verified net supplier exposure, capped at the confirmed package selling price. Verified supplier recoveries reduce net supplier exposure.',
  'Any approved refund is calculated from verified customer payments after the applicable cancellation charge and previous paid refunds. Exceptional deductions require Founder/Admin approval and a recorded reason.',
  'All services remain subject to availability until confirmation. The inclusions, exclusions, payment schedule, and policy version frozen into the confirmed quotation govern that booking.',
].join('\n');

export const STANDARD_INCLUSIONS = Object.freeze([
  'Accommodation, transport, activities, meals, and services expressly listed in the confirmed itinerary',
  'Booking Bridge booking coordination and supplier confirmation support',
  'Taxes and charges only where expressly stated as included',
]);

export const STANDARD_EXCLUSIONS = Object.freeze([
  'Flights, visas, travel insurance, and permits unless expressly listed as included',
  'Personal expenses, tips, optional activities, and services not listed in the confirmed itinerary',
  'Costs caused by customer-requested changes or events outside the confirmed package',
]);

export const CANONICAL_FINANCIAL_POLICY = Object.freeze({
  id: 'current',
  documentPath: 'financial_policies/current',
  version: BOOKING_BRIDGE_POLICY_VERSION,
  cancellationBasis: 'CONFIRMED_PACKAGE_SELLING_PRICE',
  supplierExposureMethod: 'MAX_NOT_ADDITIVE',
  maximumCancellationChargePercent: 100,
  substitutionSupplierCostIncreasePercent: 5,
  cancellationBands: Object.freeze([
    Object.freeze({ minimumDaysBeforeDeparture: 31, percentage: 10 }),
    Object.freeze({ minimumDaysBeforeDeparture: 17, maximumDaysBeforeDeparture: 30, percentage: 50 }),
    Object.freeze({ maximumDaysBeforeDeparture: 16, percentage: 100 }),
  ]),
  noShowPercentage: 100,
  partialRefundCommissionAction: 'NO_AUTOMATIC_REVERSAL',
  fullCancellationCommissionAction: 'FULL_REVERSAL',
});

export const STANDARD_CUSTOMER_POLICY_PRESET = Object.freeze({
  version: BOOKING_BRIDGE_POLICY_VERSION,
  termsAndConditions: STANDARD_TERMS_AND_CONDITIONS,
  inclusions: STANDARD_INCLUSIONS,
  exclusions: STANDARD_EXCLUSIONS,
  paymentSchedule: STANDARD_PAYMENT_SCHEDULE,
});

export function cancellationPercentage(daysBeforeDeparture: number, noShow = false): number {
  if (noShow) return CANONICAL_FINANCIAL_POLICY.noShowPercentage;
  if (daysBeforeDeparture > 30) return 10;
  if (daysBeforeDeparture >= 17) return 50;
  return 100;
}
