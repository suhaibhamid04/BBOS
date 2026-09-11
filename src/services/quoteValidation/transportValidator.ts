import { QuoteTransportItem } from '../../types';
import {
  ServiceValidationResult,
  ValidationOutcome,
} from '../../types/quoteValidation';
import { InventoryDataProvider } from './inventoryProvider';
import { calculateTransportCost } from '../transportEngine';

export class TransportQuoteValidator {
  constructor(private inventoryProvider: InventoryDataProvider) {}

  async validate(
    item: QuoteTransportItem,
    index: number,
    quoteTravelStartDate?: string
  ): Promise<ServiceValidationResult> {
    const serviceId = item.id || `trans-${index + 1}`;
    const serviceName = item.vehicleType || `Transport #${index + 1}`;
    const errors: string[] = [];
    const warnings: string[] = [];

    const vehicleCategoryId = item.vehicleCategoryId;
    if (!vehicleCategoryId) {
      return {
        serviceType: 'TRANSPORT',
        serviceId,
        serviceName,
        outcome: 'MISSING_RATE_CONFIGURATION',
        isValid: false,
        canProceedToBooking: false,
        rateVerified: false,
        availabilityStatus: 'UNAVAILABLE',
        errors: ['Missing vehicle category reference (vehicleCategoryId)'],
        warnings,
      };
    }

    const vehicle = await this.inventoryProvider.getVehicleCategory(vehicleCategoryId);
    if (!vehicle) {
      return {
        serviceType: 'TRANSPORT',
        serviceId,
        serviceName,
        outcome: 'SERVICE_UNAVAILABLE',
        isValid: false,
        canProceedToBooking: false,
        rateVerified: false,
        availabilityStatus: 'UNAVAILABLE',
        errors: [`Vehicle category "${vehicleCategoryId}" not found in master inventory`],
        warnings,
      };
    }

    if (!vehicle.active) {
      return {
        serviceType: 'TRANSPORT',
        serviceId,
        serviceName: vehicle.displayName || vehicle.name,
        outcome: 'SERVICE_UNAVAILABLE',
        isValid: false,
        canProceedToBooking: false,
        rateVerified: false,
        availabilityStatus: 'UNAVAILABLE',
        errors: [`Vehicle category "${vehicle.displayName || vehicle.name}" is inactive`],
        warnings,
      };
    }

    // Check passenger capacity
    const passengerCount = item.passengerCount || 1;
    if (passengerCount > vehicle.passengerCapacity) {
      return {
        serviceType: 'TRANSPORT',
        serviceId,
        serviceName: vehicle.displayName || vehicle.name,
        outcome: 'SERVICE_UNAVAILABLE',
        isValid: false,
        canProceedToBooking: false,
        rateVerified: false,
        availabilityStatus: 'UNAVAILABLE',
        errors: [`Passenger count (${passengerCount}) exceeds vehicle passenger capacity (${vehicle.passengerCapacity})`],
        warnings,
      };
    }

    // Check route if provided
    let route = null;
    if (item.transportRouteId) {
      route = await this.inventoryProvider.getTransportRoute(item.transportRouteId);
      if (!route) {
        errors.push(`Transport route "${item.transportRouteId}" not found`);
      } else if (!route.active) {
        return {
          serviceType: 'TRANSPORT',
          serviceId,
          serviceName: vehicle.displayName || vehicle.name,
          outcome: 'SERVICE_UNAVAILABLE',
          isValid: false,
          canProceedToBooking: false,
          rateVerified: false,
          availabilityStatus: 'UNAVAILABLE',
          errors: [`Transport route "${route.name}" is marked inactive`],
          warnings,
        };
      }
    }

    // Service dates
    const serviceDate = item.serviceDate || quoteTravelStartDate;
    if (!serviceDate) {
      errors.push('Service date is required for transport validation');
    }

    const days = item.days || 1;
    if (days <= 0) {
      errors.push('Transport duration days must be greater than 0');
    }

    // Rate period validation
    const ratePeriodId = item.ratePeriodId;
    if (!ratePeriodId) {
      return {
        serviceType: 'TRANSPORT',
        serviceId,
        serviceName: vehicle.displayName || vehicle.name,
        outcome: 'MISSING_RATE_CONFIGURATION',
        isValid: false,
        canProceedToBooking: false,
        rateVerified: false,
        availabilityStatus: 'UNAVAILABLE',
        errors: ['No authoritative rate period referenced on quoted transport item'],
        warnings,
      };
    }

    const ratePeriod = await this.inventoryProvider.getTransportRatePeriod(ratePeriodId);
    if (!ratePeriod) {
      return {
        serviceType: 'TRANSPORT',
        serviceId,
        serviceName: vehicle.displayName || vehicle.name,
        outcome: 'MISSING_RATE_CONFIGURATION',
        isValid: false,
        canProceedToBooking: false,
        rateVerified: false,
        ratePeriodId,
        availabilityStatus: 'UNAVAILABLE',
        errors: [`Referenced transport rate period "${ratePeriodId}" not found in inventory`],
        warnings,
      };
    }

    if (ratePeriod.status !== 'ACTIVE') {
      return {
        serviceType: 'TRANSPORT',
        serviceId,
        serviceName: vehicle.displayName || vehicle.name,
        outcome: 'RATE_CHANGED',
        isValid: false,
        canProceedToBooking: false,
        rateVerified: false,
        ratePeriodId,
        discrepancy: {
          serviceType: 'TRANSPORT',
          serviceId,
          serviceName: vehicle.displayName || vehicle.name,
          ratePeriodId,
          quotedRate: item.quotedRate || item.supplierCost,
          currentRate: undefined,
          currency: ratePeriod.currency || 'INR',
          reason: `Referenced transport rate period is ${ratePeriod.status}`,
        },
        availabilityStatus: 'UNAVAILABLE',
        errors: [`Transport rate period "${ratePeriodId}" is ${ratePeriod.status}`],
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
          serviceType: 'TRANSPORT',
          serviceId,
          serviceName: vehicle.displayName || vehicle.name,
          outcome: 'RATE_CHANGED',
          isValid: false,
          canProceedToBooking: false,
          rateVerified: false,
          ratePeriodId,
          discrepancy: {
            serviceType: 'TRANSPORT',
            serviceId,
            serviceName: vehicle.displayName || vehicle.name,
            ratePeriodId,
            quotedRate: item.quotedRate || item.supplierCost,
            currentRate: undefined,
            currency: ratePeriod.currency || 'INR',
            reason: `Quoted date ${serviceDate} is outside rate validity window (${ratePeriod.validFrom} to ${ratePeriod.validTo || 'open-ended'})`,
          },
          availabilityStatus: 'UNAVAILABLE',
          errors: [`Service date ${serviceDate} is not covered by transport rate period "${ratePeriodId}"`],
          warnings,
        };
      }
    }

    // Check vehicle category linkage
    if (ratePeriod.vehicleCategoryId !== vehicle.id) {
      return {
        serviceType: 'TRANSPORT',
        serviceId,
        serviceName: vehicle.displayName || vehicle.name,
        outcome: 'SERVICE_UNAVAILABLE',
        isValid: false,
        canProceedToBooking: false,
        rateVerified: false,
        ratePeriodId,
        discrepancy: {
          serviceType: 'TRANSPORT',
          serviceId,
          serviceName: vehicle.displayName || vehicle.name,
          ratePeriodId,
          quotedRate: item.quotedRate,
          currentRate: undefined,
          currency: ratePeriod.currency || 'INR',
          reason: `Rate period is for vehicle category "${ratePeriod.vehicleCategoryId}", but quote references "${vehicle.id}"`,
        },
        availabilityStatus: 'UNAVAILABLE',
        errors: ['Transport rate period vehicle category does not match quoted vehicle'],
        warnings,
      };
    }

    // Supplements
    const supplements = await this.inventoryProvider.getTransportSupplements(ratePeriod.id);
    const calculation = calculateTransportCost({
      ratePeriod,
      supplements,
      serviceParams: {
        vehicleDays: days,
      },
    });

    // Availability check for explicit UNAVAILABLE status
    if (ratePeriod.availabilityStatus === 'UNAVAILABLE') {
      return {
        serviceType: 'TRANSPORT',
        serviceId,
        serviceName: vehicle.displayName || vehicle.name,
        outcome: 'SERVICE_UNAVAILABLE',
        isValid: false,
        canProceedToBooking: false,
        rateVerified: true,
        ratePeriodId,
        availabilityStatus: 'UNAVAILABLE',
        errors: [`Transport service "${vehicle.displayName || vehicle.name}" is currently UNAVAILABLE`],
        warnings,
      };
    }

    const authoritativeSupplierCost = calculation.totalAmount;

    // Zero-cost check
    if (item.isFoc) {
      return {
        serviceType: 'TRANSPORT',
        serviceId,
        serviceName: vehicle.displayName || vehicle.name,
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
          serviceType: 'TRANSPORT',
          supplierId: ratePeriod.supplierId || vehicle.id,
          supplierName: vehicle.displayName || vehicle.name,
          inventoryMasterId: vehicle.id,
          ratePeriodId,
          rateContractType: 'STANDARD',
          frozenSupplierUnitRate: 0,
          units: days,
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

    if (ratePeriod.baseRate <= 0 || authoritativeSupplierCost <= 0) {
      return {
        serviceType: 'TRANSPORT',
        serviceId,
        serviceName: vehicle.displayName || vehicle.name,
        outcome: 'MISSING_RATE_CONFIGURATION',
        isValid: false,
        canProceedToBooking: false,
        rateVerified: false,
        ratePeriodId,
        availabilityStatus: 'UNAVAILABLE',
        errors: ['Authoritative transport rate resolved to zero or negative cost without FOC declaration'],
        warnings,
      };
    }

    // Rate integrity check
    if (item.quotedRate !== undefined && item.quotedRate !== ratePeriod.baseRate) {
      return {
        serviceType: 'TRANSPORT',
        serviceId,
        serviceName: vehicle.displayName || vehicle.name,
        outcome: 'RATE_CHANGED',
        isValid: false,
        canProceedToBooking: false,
        rateVerified: false,
        ratePeriodId,
        authoritativeSupplierCost,
        quotedSupplierCost: item.supplierCost,
        discrepancy: {
          serviceType: 'TRANSPORT',
          serviceId,
          serviceName: vehicle.displayName || vehicle.name,
          ratePeriodId,
          quotedRate: item.quotedRate,
          currentRate: ratePeriod.baseRate,
          currency: ratePeriod.currency || 'INR',
          reason: `Quoted transport unit rate (₹${item.quotedRate}) differs from authoritative rate (₹${ratePeriod.baseRate})`,
        },
        availabilityStatus: 'AVAILABLE',
        errors: [`Rate discrepancy detected for transport "${vehicle.displayName || vehicle.name}"`],
        warnings,
      };
    }

    // Availability status
    let availabilityStatus: 'AVAILABLE' | 'NEEDS_CONFIRMATION' | 'ON_REQUEST' | 'UNAVAILABLE' = 'AVAILABLE';
    let outcome: ValidationOutcome = 'AVAILABLE';

    if (ratePeriod.availabilityStatus === 'NEEDS_CONFIRMATION' || ratePeriod.confirmationStatus === 'NEEDS_CONFIRMATION') {
      availabilityStatus = 'NEEDS_CONFIRMATION';
      outcome = 'NEEDS_CONFIRMATION';
      warnings.push(`Transport service "${vehicle.displayName || vehicle.name}" requires supplier confirmation`);
    } else if (ratePeriod.availabilityStatus === 'ON_REQUEST') {
      availabilityStatus = 'ON_REQUEST';
      outcome = 'ON_REQUEST';
      warnings.push(`Transport service "${vehicle.displayName || vehicle.name}" is ON_REQUEST`);
    }

    const isValid = errors.length === 0;
    const canProceedToBooking = isValid;

    return {
      serviceType: 'TRANSPORT',
      serviceId,
      serviceName: vehicle.displayName || vehicle.name,
      outcome,
      isValid,
      canProceedToBooking,
      rateVerified: true,
      ratePeriodId,
      authoritativeSupplierCost,
      quotedSupplierCost: item.supplierCost,
      lineItemSnapshot: {
        serviceId,
        serviceType: 'TRANSPORT',
        supplierId: ratePeriod.supplierId || vehicle.id,
        supplierName: vehicle.displayName || vehicle.name,
        inventoryMasterId: vehicle.id,
        ratePeriodId,
        rateContractType: 'STANDARD',
        frozenSupplierUnitRate: ratePeriod.baseRate,
        units: days,
        frozenSupplementsCost: calculation.breakdown?.additionalChargesTotal || 0,
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
