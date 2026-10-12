import {
  TransportRatePeriod,
  TransportSupplement,
  TransportCostCalculation
} from '../types/transport';
import { UserRole } from '../types';

export interface TransportCalculationRequest {
  ratePeriod: TransportRatePeriod;
  supplements: TransportSupplement[];
  serviceParams: {
    vehicleDays?: number;
    vehicleCount?: number;
    chargeableDays?: number;
    nightHalts?: number;
    distanceKm?: number;
    hours?: number;
    occurrences?: number; // for per-transfer
  };
}

export function calculateTransportCost(
  request: TransportCalculationRequest
): TransportCostCalculation {
  const { ratePeriod, supplements, serviceParams } = request;
  const vehicleCount = Math.max(1, Math.floor(serviceParams.vehicleCount || 1));
  const chargeableDays = Math.max(1, Math.floor(serviceParams.chargeableDays || serviceParams.vehicleDays || 1));

  if (ratePeriod.availabilityStatus === 'UNAVAILABLE') {
    return {
      available: false,
      totalAmount: 0,
      breakdown: {
        baseVehicleCost: 0,
        includedCharges: [],
        additionalChargesTotal: 0,
        additionalChargesDetails: []
      }
    };
  }

  let baseCost = 0;
  
  // 1. Base Cost Calculation
  switch (ratePeriod.pricingUnit) {
    case 'PER_DAY':
      baseCost = ratePeriod.baseRate * chargeableDays * vehicleCount;
      break;
    case 'PER_TRIP':
    case 'PER_ROUTE':
    case 'FIXED_MULTI_DAY':
    case 'PER_JOURNEY':
      baseCost = ratePeriod.baseRate * vehicleCount; // Fixed per vehicle/group regardless of days
      break;
    case 'PER_TRANSFER':
      baseCost = ratePeriod.baseRate * (serviceParams.occurrences || 1) * vehicleCount;
      break;
    case 'PER_KM':
      baseCost = ratePeriod.baseRate * (serviceParams.distanceKm || 0) * vehicleCount;
      break;
    case 'PER_HOUR':
      baseCost = ratePeriod.baseRate * (serviceParams.hours || 1) * vehicleCount;
      break;
    case 'CUSTOM':
      baseCost = ratePeriod.baseRate * vehicleCount;
      break;
  }

  const includedCharges: string[] = [];
  let additionalChargesTotal = 0;
  const additionalChargesDetails: { name: string; amount: number }[] = [];

  // 2. Evaluate Inclusions and Supplements
  const checkInclusion = (
    key: keyof typeof ratePeriod.inclusions,
    supplementType: string,
    label: string,
    count: number = 1
  ) => {
    const status = ratePeriod.inclusions[key];
    if (status === 'INCLUDED') {
      includedCharges.push(label);
    } else if (status === 'EXCLUDED' || status === 'ADDITIONAL') {
      // Look for a supplement to cover this charge
      const supplement = supplements.find(s => s.type === supplementType);
      if (supplement) {
        let supplementCost = 0;
        if (supplement.unit === 'per_day') supplementCost = supplement.amount * chargeableDays * vehicleCount;
        else if (supplement.unit === 'per_night') supplementCost = supplement.amount * (serviceParams.nightHalts || 0) * vehicleCount;
        else if (supplement.unit === 'per_occurrence') supplementCost = supplement.amount * (serviceParams.occurrences || 1) * vehicleCount;
        else supplementCost = supplement.amount * vehicleCount; // flat per vehicle/group

        if (supplementCost > 0) {
          additionalChargesTotal += supplementCost;
          additionalChargesDetails.push({ name: supplement.name, amount: supplementCost });
        }
      } else {
        // We have an EXCLUDED/ADDITIONAL requirement but no supplement defined to price it.
        // In a real system, you might flag this as needing manual entry, or it just means zero for now.
        additionalChargesDetails.push({ name: `Missing supplement rate for ${label}`, amount: 0 });
      }
    }
  };

  checkInclusion('driverAllowance', 'DRIVER_ALLOWANCE', 'Driver Allowance');
  checkInclusion('nightHalt', 'NIGHT_HALT', 'Night Halt', serviceParams.nightHalts);
  checkInclusion('toll', 'TOLL', 'Toll');
  checkInclusion('parking', 'PARKING', 'Parking');
  checkInclusion('permits', 'PERMIT', 'Permits');

  // 3. Tax Handling (Simplified for now - can be expanded like Accommodation)
  // If Tax is EXCLUDED, we would add the tax percentage here.

  const totalAmount = baseCost + additionalChargesTotal;

  return {
    available: true,
    totalAmount,
    breakdown: {
      baseVehicleCost: baseCost,
      includedCharges,
      additionalChargesTotal,
      additionalChargesDetails
    }
  };
}

/**
 * Strips restricted financial data from the transport engine result
 * based on the user's role. Ensures Sales Executives do not see supplier costs.
 */
export function buildRoleGatedTransportResult(
  result: TransportCostCalculation,
  userRole: UserRole
): Partial<TransportCostCalculation> {
  // Safe base object
  const safeResult: Partial<TransportCostCalculation> = {
    available: result.available,
  };

  const canSeeSupplierCost: boolean = ['Founder', 'Admin', 'Accounts', 'Reservations'].includes(userRole);

  if (canSeeSupplierCost) {
    safeResult.totalAmount = result.totalAmount;
    safeResult.breakdown = result.breakdown;
  } else {
    // Hide financial details
    safeResult.totalAmount = undefined;
    safeResult.breakdown = undefined;
  }

  return safeResult;
}
