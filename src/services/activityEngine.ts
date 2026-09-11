import {
  ActivityRatePeriod,
  ActivityCostCalculation
} from '../types/activity';
import { UserRole } from '../types';

export interface ActivityCalculationRequest {
  ratePeriod: ActivityRatePeriod;
  params: {
    adults?: number;
    children?: number;
    infants?: number;
    vehicles?: number;
    groups?: number;
    tickets?: number;
    hours?: number;
    days?: number;
    sessions?: number;
  };
}

export function calculateActivityCost(
  request: ActivityCalculationRequest
): ActivityCostCalculation {
  const { ratePeriod, params } = request;

  if (ratePeriod.availabilityStatus === 'UNAVAILABLE') {
    return {
      available: false,
      totalAmount: 0,
      breakdown: {
        baseCost: 0,
        details: []
      }
    };
  }

  const { pricingModel, pricingComponents } = ratePeriod;
  let baseCost = 0;
  const details: { name: string; amount: number; count: number }[] = [];

  const addDetail = (name: string, rate: number, count: number) => {
    if (count > 0 && rate > 0) {
      const amount = rate * count;
      baseCost += amount;
      details.push({ name, amount, count });
    }
  };

  switch (pricingModel) {
    case 'PER_PERSON':
      // Assumes 'adult' or generic 'person' rate
      const personRate = pricingComponents['person'] || pricingComponents['adult'] || 0;
      const totalPeople = (params.adults || 0) + (params.children || 0);
      addDetail('Per Person', personRate, totalPeople);
      break;

    case 'PER_ADULT_CHILD':
      addDetail('Adult', pricingComponents['adult'] || 0, params.adults || 0);
      addDetail('Child', pricingComponents['child'] || 0, params.children || 0);
      break;

    case 'PER_COUPLE':
      // Assume pairs of adults
      const couples = Math.floor((params.adults || 0) / 2);
      addDetail('Couple', pricingComponents['couple'] || 0, couples);
      break;

    case 'PER_VEHICLE':
      addDetail('Vehicle', pricingComponents['vehicle'] || 0, params.vehicles || 1);
      break;

    case 'PER_GROUP':
      // For groups, determine which tier based on total pax. 
      // Example keys: '1-6_pax', '7-10_pax'
      // This logic requires parsing the keys or we just take a flat 'group' if provided
      // For now, if there's a 'group' component, use it.
      addDetail('Group', pricingComponents['group'] || 0, params.groups || 1);
      break;

    case 'PER_TICKET':
      addDetail('Ticket', pricingComponents['ticket'] || 0, params.tickets || 1);
      break;

    case 'PER_HOUR':
      addDetail('Hour', pricingComponents['hour'] || 0, params.hours || 1);
      break;

    case 'PER_DAY':
      addDetail('Day', pricingComponents['day'] || 0, params.days || 1);
      break;

    case 'PER_SESSION':
      addDetail('Session', pricingComponents['session'] || 0, params.sessions || 1);
      break;

    case 'FIXED':
    case 'CUSTOM':
      addDetail('Fixed/Custom', pricingComponents['fixed'] || pricingComponents['custom'] || 0, 1);
      break;
  }

  // Note: Tax handling would go here, similar to accommodations

  return {
    available: true,
    totalAmount: baseCost,
    breakdown: {
      baseCost,
      details
    }
  };
}

/**
 * Strips restricted financial data from the activity engine result
 * based on the user's role. Ensures Sales Executives do not see supplier costs.
 */
export function buildRoleGatedActivityResult(
  result: ActivityCostCalculation,
  userRole: UserRole
): Partial<ActivityCostCalculation> {
  const safeResult: Partial<ActivityCostCalculation> = {
    available: result.available,
  };

  const canSeeSupplierCost = ['FOUNDER', 'ADMIN', 'ACCOUNTS', 'OPERATIONS'].includes(userRole);

  if (canSeeSupplierCost) {
    safeResult.totalAmount = result.totalAmount;
    safeResult.breakdown = result.breakdown;
  } else {
    safeResult.totalAmount = undefined;
    safeResult.breakdown = undefined;
  }

  return safeResult;
}
