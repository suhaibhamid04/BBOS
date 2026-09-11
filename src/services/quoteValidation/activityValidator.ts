import { QuoteActivityItem } from '../../types';
import {
  ServiceValidationResult,
  ValidationOutcome,
} from '../../types/quoteValidation';
import { InventoryDataProvider } from './inventoryProvider';
import { calculateActivityCost } from '../activityEngine';

export class ActivityQuoteValidator {
  constructor(private inventoryProvider: InventoryDataProvider) {}

  async validate(
    item: QuoteActivityItem,
    index: number,
    quoteTravelStartDate?: string
  ): Promise<ServiceValidationResult> {
    const serviceId = item.id || `act-${index + 1}`;
    const serviceName = item.name || `Activity #${index + 1}`;
    const errors: string[] = [];
    const warnings: string[] = [];

    const activityMasterId = item.activityMasterId || item.activityId;
    if (!activityMasterId) {
      return {
        serviceType: 'ACTIVITY',
        serviceId,
        serviceName,
        outcome: 'MISSING_RATE_CONFIGURATION',
        isValid: false,
        canProceedToBooking: false,
        rateVerified: false,
        availabilityStatus: 'UNAVAILABLE',
        errors: ['Missing activity master reference (activityMasterId)'],
        warnings,
      };
    }

    const activity = await this.inventoryProvider.getActivityMaster(activityMasterId);
    if (!activity) {
      return {
        serviceType: 'ACTIVITY',
        serviceId,
        serviceName,
        outcome: 'SERVICE_UNAVAILABLE',
        isValid: false,
        canProceedToBooking: false,
        rateVerified: false,
        availabilityStatus: 'UNAVAILABLE',
        errors: [`Activity master "${activityMasterId}" not found in master inventory`],
        warnings,
      };
    }

    if (!activity.active) {
      return {
        serviceType: 'ACTIVITY',
        serviceId,
        serviceName: activity.name,
        outcome: 'SERVICE_UNAVAILABLE',
        isValid: false,
        canProceedToBooking: false,
        rateVerified: false,
        availabilityStatus: 'UNAVAILABLE',
        errors: [`Activity "${activity.name}" is marked inactive`],
        warnings,
      };
    }

    const serviceDate = item.serviceDate || quoteTravelStartDate;
    if (!serviceDate) {
      errors.push('Service date is required for activity validation');
    }

    // Operating days validation
    if (serviceDate && activity.operatingDays && activity.operatingDays.length > 0) {
      const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const dateObj = new Date(serviceDate);
      const dayName = daysOfWeek[dateObj.getUTCDay()];

      if (!activity.operatingDays.includes(dayName)) {
        return {
          serviceType: 'ACTIVITY',
          serviceId,
          serviceName: activity.name,
          outcome: 'SERVICE_UNAVAILABLE',
          isValid: false,
          canProceedToBooking: false,
          rateVerified: false,
          availabilityStatus: 'UNAVAILABLE',
          errors: [`Activity "${activity.name}" does not operate on ${dayName} (operating days: ${activity.operatingDays.join(', ')})`],
          warnings,
        };
      }
    }

    // Participant constraints validation
    const pax = item.pax || 1;
    if (pax <= 0) {
      errors.push('Participant count must be greater than 0');
    }

    if (activity.minParticipants && pax < activity.minParticipants) {
      return {
        serviceType: 'ACTIVITY',
        serviceId,
        serviceName: activity.name,
        outcome: 'SERVICE_UNAVAILABLE',
        isValid: false,
        canProceedToBooking: false,
        rateVerified: false,
        availabilityStatus: 'UNAVAILABLE',
        errors: [`Participant count (${pax}) is below minimum requirement (${activity.minParticipants}) for "${activity.name}"`],
        warnings,
      };
    }

    if (activity.maxParticipants && pax > activity.maxParticipants) {
      return {
        serviceType: 'ACTIVITY',
        serviceId,
        serviceName: activity.name,
        outcome: 'SERVICE_UNAVAILABLE',
        isValid: false,
        canProceedToBooking: false,
        rateVerified: false,
        availabilityStatus: 'UNAVAILABLE',
        errors: [`Participant count (${pax}) exceeds maximum capacity (${activity.maxParticipants}) for "${activity.name}"`],
        warnings,
      };
    }

    // Rate period validation
    const ratePeriodId = item.activityRatePeriodId;
    if (!ratePeriodId) {
      return {
        serviceType: 'ACTIVITY',
        serviceId,
        serviceName: activity.name,
        outcome: 'MISSING_RATE_CONFIGURATION',
        isValid: false,
        canProceedToBooking: false,
        rateVerified: false,
        availabilityStatus: 'UNAVAILABLE',
        errors: ['No authoritative rate period referenced on quoted activity item'],
        warnings,
      };
    }

    const ratePeriod = await this.inventoryProvider.getActivityRatePeriod(ratePeriodId);
    if (!ratePeriod) {
      return {
        serviceType: 'ACTIVITY',
        serviceId,
        serviceName: activity.name,
        outcome: 'MISSING_RATE_CONFIGURATION',
        isValid: false,
        canProceedToBooking: false,
        rateVerified: false,
        ratePeriodId,
        availabilityStatus: 'UNAVAILABLE',
        errors: [`Referenced activity rate period "${ratePeriodId}" not found in inventory`],
        warnings,
      };
    }

    if (ratePeriod.status !== 'ACTIVE') {
      return {
        serviceType: 'ACTIVITY',
        serviceId,
        serviceName: activity.name,
        outcome: 'RATE_CHANGED',
        isValid: false,
        canProceedToBooking: false,
        rateVerified: false,
        ratePeriodId,
        discrepancy: {
          serviceType: 'ACTIVITY',
          serviceId,
          serviceName: activity.name,
          ratePeriodId,
          quotedRate: item.quotedRate || item.supplierCost,
          currentRate: undefined,
          currency: ratePeriod.currency || 'INR',
          reason: `Referenced activity rate period is ${ratePeriod.status}`,
        },
        availabilityStatus: 'UNAVAILABLE',
        errors: [`Activity rate period "${ratePeriodId}" is ${ratePeriod.status}`],
        warnings,
      };
    }

    // Check date coverage
    if (serviceDate) {
      const serviceTime = new Date(serviceDate).getTime();
      const fromTime = new Date(ratePeriod.validFrom).getTime();
      const toTime = ratePeriod.validTo ? new Date(ratePeriod.validTo).getTime() : null;

      if (serviceTime < fromTime || (toTime !== null && serviceTime > toTime)) {
        return {
          serviceType: 'ACTIVITY',
          serviceId,
          serviceName: activity.name,
          outcome: 'RATE_CHANGED',
          isValid: false,
          canProceedToBooking: false,
          rateVerified: false,
          ratePeriodId,
          discrepancy: {
            serviceType: 'ACTIVITY',
            serviceId,
            serviceName: activity.name,
            ratePeriodId,
            quotedRate: item.quotedRate || item.supplierCost,
            currentRate: undefined,
            currency: ratePeriod.currency || 'INR',
            reason: `Quoted date ${serviceDate} is outside rate validity window (${ratePeriod.validFrom} to ${ratePeriod.validTo || 'open-ended'})`,
          },
          availabilityStatus: 'UNAVAILABLE',
          errors: [`Service date ${serviceDate} is not covered by activity rate period "${ratePeriodId}"`],
          warnings,
        };
      }
    }

    // Check activity linkage
    if (ratePeriod.activityId !== activity.id) {
      return {
        serviceType: 'ACTIVITY',
        serviceId,
        serviceName: activity.name,
        outcome: 'SERVICE_UNAVAILABLE',
        isValid: false,
        canProceedToBooking: false,
        rateVerified: false,
        ratePeriodId,
        discrepancy: {
          serviceType: 'ACTIVITY',
          serviceId,
          serviceName: activity.name,
          ratePeriodId,
          quotedRate: item.quotedRate,
          currentRate: undefined,
          currency: ratePeriod.currency || 'INR',
          reason: `Rate period is for activity "${ratePeriod.activityId}", but quote references "${activity.id}"`,
        },
        availabilityStatus: 'UNAVAILABLE',
        errors: ['Activity rate period activityId does not match quoted activity'],
        warnings,
      };
    }

    // Calculate authoritative cost
    const calculation = calculateActivityCost({
      ratePeriod,
      params: {
        adults: pax,
      },
    });

    // Availability check for explicit UNAVAILABLE status
    if (ratePeriod.availabilityStatus === 'UNAVAILABLE') {
      return {
        serviceType: 'ACTIVITY',
        serviceId,
        serviceName: activity.name,
        outcome: 'SERVICE_UNAVAILABLE',
        isValid: false,
        canProceedToBooking: false,
        rateVerified: true,
        ratePeriodId,
        availabilityStatus: 'UNAVAILABLE',
        errors: [`Activity "${activity.name}" is currently UNAVAILABLE`],
        warnings,
      };
    }

    const authoritativeSupplierCost = calculation.totalAmount;

    // Zero-cost check
    if (item.isFoc) {
      return {
        serviceType: 'ACTIVITY',
        serviceId,
        serviceName: activity.name,
        outcome: 'AVAILABLE',
        isValid: true,
        canProceedToBooking: true,
        rateVerified: true,
        ratePeriodId,
        authoritativeSupplierCost: 0,
        quotedSupplierCost: 0,
        isFoc: true,
        focReason: item.focReason || 'Complimentary inclusion',
        availabilityStatus: 'AVAILABLE',
        lineItemSnapshot: {
          serviceId,
          serviceType: 'ACTIVITY',
          supplierId: activity.supplierId || activity.id,
          supplierName: activity.name,
          inventoryMasterId: activity.id,
          ratePeriodId,
          rateContractType: 'STANDARD',
          frozenSupplierUnitRate: 0,
          units: pax,
          frozenSupplementsCost: 0,
          frozenTotalSupplierCost: 0,
          taxTreatment: ratePeriod.taxTreatment || 'INCLUSIVE',
          taxAmount: 0,
          rateVerifiedAt: new Date().toISOString(),
        },
        errors: [],
        warnings,
      };
    }

    if (authoritativeSupplierCost <= 0) {
      return {
        serviceType: 'ACTIVITY',
        serviceId,
        serviceName: activity.name,
        outcome: 'MISSING_RATE_CONFIGURATION',
        isValid: false,
        canProceedToBooking: false,
        rateVerified: false,
        ratePeriodId,
        availabilityStatus: 'UNAVAILABLE',
        errors: ['Authoritative activity rate resolved to zero or negative cost without FOC declaration'],
        warnings,
      };
    }

    // Rate integrity check
    if (item.quotedRate !== undefined && item.quotedRate !== authoritativeSupplierCost) {
      return {
        serviceType: 'ACTIVITY',
        serviceId,
        serviceName: activity.name,
        outcome: 'RATE_CHANGED',
        isValid: false,
        canProceedToBooking: false,
        rateVerified: false,
        ratePeriodId,
        authoritativeSupplierCost,
        quotedSupplierCost: item.supplierCost,
        discrepancy: {
          serviceType: 'ACTIVITY',
          serviceId,
          serviceName: activity.name,
          ratePeriodId,
          quotedRate: item.quotedRate,
          currentRate: authoritativeSupplierCost,
          currency: ratePeriod.currency || 'INR',
          reason: `Quoted activity rate (₹${item.quotedRate}) differs from authoritative rate (₹${authoritativeSupplierCost})`,
        },
        availabilityStatus: 'AVAILABLE',
        errors: [`Rate discrepancy detected for activity "${activity.name}"`],
        warnings,
      };
    }

    // Availability status
    let availabilityStatus: 'AVAILABLE' | 'NEEDS_CONFIRMATION' | 'ON_REQUEST' | 'UNAVAILABLE' = 'AVAILABLE';
    let outcome: ValidationOutcome = 'AVAILABLE';

    if (ratePeriod.availabilityStatus === 'NEEDS_CONFIRMATION' || ratePeriod.confirmationStatus === 'NEEDS_CONFIRMATION') {
      availabilityStatus = 'NEEDS_CONFIRMATION';
      outcome = 'NEEDS_CONFIRMATION';
      warnings.push(`Activity "${activity.name}" requires supplier confirmation`);
    } else if (ratePeriod.availabilityStatus === 'ON_REQUEST') {
      availabilityStatus = 'ON_REQUEST';
      outcome = 'ON_REQUEST';
      warnings.push(`Activity "${activity.name}" is ON_REQUEST`);
    }

    const isValid = errors.length === 0;
    const canProceedToBooking = isValid;

    return {
      serviceType: 'ACTIVITY',
      serviceId,
      serviceName: activity.name,
      outcome,
      isValid,
      canProceedToBooking,
      rateVerified: true,
      ratePeriodId,
      authoritativeSupplierCost,
      quotedSupplierCost: item.supplierCost,
      lineItemSnapshot: {
        serviceId,
        serviceType: 'ACTIVITY',
        supplierId: activity.supplierId || activity.id,
        supplierName: activity.name,
        inventoryMasterId: activity.id,
        ratePeriodId,
        rateContractType: 'STANDARD',
        frozenSupplierUnitRate: pax > 0 ? authoritativeSupplierCost / pax : authoritativeSupplierCost,
        units: pax,
        frozenSupplementsCost: 0,
        frozenTotalSupplierCost: authoritativeSupplierCost,
        taxTreatment: ratePeriod.taxTreatment || 'INCLUSIVE',
        taxAmount: 0,
        rateVerifiedAt: new Date().toISOString(),
      },
      availabilityStatus,
      errors,
      warnings,
    };
  }
}
