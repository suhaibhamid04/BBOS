import { QuoteHotelItem } from '../../types';
import {
  ServiceValidationResult,
  ValidationOutcome,
} from '../../types/quoteValidation';
import { InventoryDataProvider } from './inventoryProvider';

export class AccommodationQuoteValidator {
  constructor(private inventoryProvider: InventoryDataProvider) {}

  async validate(
    item: QuoteHotelItem,
    index: number,
    quoteTravelStartDate?: string
  ): Promise<ServiceValidationResult> {
    const serviceId = item.id || `acc-${index + 1}`;
    const serviceName = item.hotelName || `Hotel #${index + 1}`;
    const errors: string[] = [];
    const warnings: string[] = [];

    const propertyId = item.propertyId || item.hotelId;
    if (!propertyId) {
      return {
        serviceType: 'ACCOMMODATION',
        serviceId,
        serviceName,
        outcome: 'MISSING_RATE_CONFIGURATION',
        isValid: false,
        canProceedToBooking: false,
        rateVerified: false,
        availabilityStatus: 'UNAVAILABLE',
        errors: ['Missing property reference (propertyId or hotelId)'],
        warnings,
      };
    }

    const property = await this.inventoryProvider.getAccommodationProperty(propertyId);
    if (!property) {
      return {
        serviceType: 'ACCOMMODATION',
        serviceId,
        serviceName,
        outcome: 'SERVICE_UNAVAILABLE',
        isValid: false,
        canProceedToBooking: false,
        rateVerified: false,
        availabilityStatus: 'UNAVAILABLE',
        errors: [`Accommodation property "${propertyId}" not found in master inventory`],
        warnings,
      };
    }

    if (property.status !== 'ACTIVE') {
      return {
        serviceType: 'ACCOMMODATION',
        serviceId,
        serviceName: property.name || serviceName,
        outcome: 'SERVICE_UNAVAILABLE',
        isValid: false,
        canProceedToBooking: false,
        rateVerified: false,
        availabilityStatus: 'UNAVAILABLE',
        errors: [`Property "${property.name}" is marked as INACTIVE in inventory`],
        warnings,
      };
    }

    // Check room category
    let roomCategory = null;
    if (item.roomCategoryId) {
      roomCategory = await this.inventoryProvider.getRoomCategory(item.roomCategoryId);
      if (!roomCategory) {
        errors.push(`Room category "${item.roomCategoryId}" not found`);
      } else if (!roomCategory.active) {
        return {
          serviceType: 'ACCOMMODATION',
          serviceId,
          serviceName: property.name,
          outcome: 'SERVICE_UNAVAILABLE',
          isValid: false,
          canProceedToBooking: false,
          rateVerified: false,
          availabilityStatus: 'UNAVAILABLE',
          errors: [`Room category "${roomCategory.name}" is marked inactive`],
          warnings,
        };
      } else if (roomCategory.propertyId !== property.id) {
        return {
          serviceType: 'ACCOMMODATION',
          serviceId,
          serviceName: property.name,
          outcome: 'SERVICE_UNAVAILABLE',
          isValid: false,
          canProceedToBooking: false,
          rateVerified: false,
          availabilityStatus: 'UNAVAILABLE',
          errors: [`Room category "${roomCategory.name}" does not belong to property "${property.name}"`],
          warnings,
        };
      }
    }

    // Check service dates
    const checkInDate = item.checkInDate || quoteTravelStartDate;
    if (!checkInDate) {
      errors.push('Check-in date is required for accommodation validation');
    }

    const nights = item.nights || 1;
    if (nights <= 0) {
      errors.push('Number of nights must be greater than 0');
    }
    const roomsCount = item.roomsCount || 1;

    // Check Blackouts in property internal notes or metadata
    if (checkInDate && property.internalNotes && property.internalNotes.toLowerCase().includes('blackout')) {
      // E.g., notes mention blackout for particular dates
      if (property.internalNotes.includes(checkInDate)) {
        return {
          serviceType: 'ACCOMMODATION',
          serviceId,
          serviceName: property.name,
          outcome: 'SERVICE_UNAVAILABLE',
          isValid: false,
          canProceedToBooking: false,
          rateVerified: false,
          availabilityStatus: 'UNAVAILABLE',
          errors: [`Property "${property.name}" is blacked out on check-in date ${checkInDate}`],
          warnings,
        };
      }
    }

    // Rate period validation
    const ratePeriodId = item.ratePeriodId || item.negotiatedRateId;
    if (!ratePeriodId) {
      return {
        serviceType: 'ACCOMMODATION',
        serviceId,
        serviceName: property.name,
        outcome: 'MISSING_RATE_CONFIGURATION',
        isValid: false,
        canProceedToBooking: false,
        rateVerified: false,
        availabilityStatus: 'UNAVAILABLE',
        errors: ['No authoritative rate period referenced on quoted accommodation item'],
        warnings,
      };
    }

    // Check standard or negotiated rate
    const standardRate = await this.inventoryProvider.getRatePeriod(ratePeriodId);
    const negotiatedRate = !standardRate ? await this.inventoryProvider.getNegotiatedRate(ratePeriodId) : null;
    const rateDoc = standardRate || negotiatedRate;

    if (!rateDoc) {
      return {
        serviceType: 'ACCOMMODATION',
        serviceId,
        serviceName: property.name,
        outcome: 'MISSING_RATE_CONFIGURATION',
        isValid: false,
        canProceedToBooking: false,
        rateVerified: false,
        ratePeriodId,
        availabilityStatus: 'UNAVAILABLE',
        errors: [`Referenced rate period "${ratePeriodId}" not found in inventory`],
        warnings,
      };
    }

    const rateCurrency = ('currency' in rateDoc && (rateDoc as any).currency) ? (rateDoc as any).currency : 'INR';

    // Check active status
    if (rateDoc.status !== 'ACTIVE') {
      return {
        serviceType: 'ACCOMMODATION',
        serviceId,
        serviceName: property.name,
        outcome: 'RATE_CHANGED',
        isValid: false,
        canProceedToBooking: false,
        rateVerified: false,
        ratePeriodId,
        discrepancy: {
          serviceType: 'ACCOMMODATION',
          serviceId,
          serviceName: property.name,
          ratePeriodId,
          quotedRate: item.quotedRate || item.supplierCost,
          currentRate: undefined,
          currency: rateCurrency,
          reason: `Referenced rate period is ${rateDoc.status}`,
        },
        availabilityStatus: 'UNAVAILABLE',
        errors: [`Rate period "${ratePeriodId}" is ${rateDoc.status}`],
        warnings,
      };
    }

    // Check date coverage
    if (checkInDate) {
      const checkInTime = new Date(checkInDate).getTime();
      const fromTime = new Date(rateDoc.validFrom).getTime();
      const toTime = rateDoc.validTo ? new Date(rateDoc.validTo).getTime() : null;

      if (checkInTime < fromTime || (toTime !== null && checkInTime > toTime)) {
        return {
          serviceType: 'ACCOMMODATION',
          serviceId,
          serviceName: property.name,
          outcome: 'RATE_CHANGED',
          isValid: false,
          canProceedToBooking: false,
          rateVerified: false,
          ratePeriodId,
          discrepancy: {
            serviceType: 'ACCOMMODATION',
            serviceId,
            serviceName: property.name,
            ratePeriodId,
            quotedRate: item.quotedRate || item.supplierCost,
            currentRate: undefined,
            currency: rateCurrency,
            reason: `Quoted date ${checkInDate} is outside rate validity window (${rateDoc.validFrom} to ${rateDoc.validTo || 'open-ended'})`,
          },
          availabilityStatus: 'UNAVAILABLE',
          errors: [`Service check-in date ${checkInDate} is not covered by rate period "${ratePeriodId}"`],
          warnings,
        };
      }
    }

    // Check room category linkage
    if (roomCategory && rateDoc.roomCategoryId !== roomCategory.id) {
      return {
        serviceType: 'ACCOMMODATION',
        serviceId,
        serviceName: property.name,
        outcome: 'RATE_CHANGED',
        isValid: false,
        canProceedToBooking: false,
        rateVerified: false,
        ratePeriodId,
        discrepancy: {
          serviceType: 'ACCOMMODATION',
          serviceId,
          serviceName: property.name,
          ratePeriodId,
          quotedRate: item.quotedRate,
          currentRate: undefined,
          currency: rateCurrency,
          reason: `Rate period is for room category "${rateDoc.roomCategoryId}", but quote references "${roomCategory.id}"`,
        },
        availabilityStatus: 'UNAVAILABLE',
        errors: ['Rate period room category does not match quoted room category'],
        warnings,
      };
    }

    // Rate calculation
    const baseUnitRate = 'negotiatedBaseRate' in rateDoc ? rateDoc.negotiatedBaseRate : rateDoc.baseRate;
    const authoritativeSupplierCost = baseUnitRate * nights * roomsCount;

    // Zero cost protection
    if (item.isFoc) {
      // Valid FOC
      return {
        serviceType: 'ACCOMMODATION',
        serviceId,
        serviceName: property.name,
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
          serviceType: 'ACCOMMODATION',
          supplierId: property.supplierId || property.id,
          supplierName: property.name,
          inventoryMasterId: property.id,
          ratePeriodId,
          rateContractType: (rateDoc?.contractType as any) || 'STANDARD',
          frozenSupplierUnitRate: 0,
          units: nights * roomsCount,
          frozenSupplementsCost: 0,
          frozenTotalSupplierCost: 0,
          taxTreatment: rateDoc?.taxTreatment || 'INCLUSIVE',
          taxAmount: 0,
          rateVerifiedAt: new Date().toISOString(),
        },
        errors: [],
        warnings,
      };
    }

    if (baseUnitRate <= 0 || authoritativeSupplierCost <= 0) {
      return {
        serviceType: 'ACCOMMODATION',
        serviceId,
        serviceName: property.name,
        outcome: 'MISSING_RATE_CONFIGURATION',
        isValid: false,
        canProceedToBooking: false,
        rateVerified: false,
        ratePeriodId,
        availabilityStatus: 'UNAVAILABLE',
        errors: ['Authoritative rate calculation resolved to zero or negative cost without FOC declaration'],
        warnings,
      };
    }

    // Rate integrity check (Compare quoted vs authoritative)
    if (item.quotedRate !== undefined && item.quotedRate !== baseUnitRate) {
      return {
        serviceType: 'ACCOMMODATION',
        serviceId,
        serviceName: property.name,
        outcome: 'RATE_CHANGED',
        isValid: false,
        canProceedToBooking: false,
        rateVerified: false,
        ratePeriodId,
        authoritativeSupplierCost,
        quotedSupplierCost: item.supplierCost,
        discrepancy: {
          serviceType: 'ACCOMMODATION',
          serviceId,
          serviceName: property.name,
          ratePeriodId,
          quotedRate: item.quotedRate,
          currentRate: baseUnitRate,
          currency: rateCurrency,
          reason: `Quoted unit rate (₹${item.quotedRate}) differs from authoritative rate (₹${baseUnitRate})`,
        },
        availabilityStatus: property.availabilityStatus === 'NOT_AVAILABLE' ? 'UNAVAILABLE' : 'AVAILABLE',
        errors: [`Rate discrepancy detected for property "${property.name}"`],
        warnings,
      };
    }

    // Availability evaluation
    let availabilityStatus: 'AVAILABLE' | 'NEEDS_CONFIRMATION' | 'ON_REQUEST' | 'UNAVAILABLE' = 'AVAILABLE';
    let outcome: ValidationOutcome = 'AVAILABLE';

    if (property.availabilityStatus === 'NOT_AVAILABLE') {
      availabilityStatus = 'UNAVAILABLE';
      outcome = 'SERVICE_UNAVAILABLE';
      errors.push(`Property "${property.name}" is currently NOT_AVAILABLE`);
    } else if (property.availabilityStatus === 'ON_HOLD') {
      availabilityStatus = 'ON_REQUEST';
      outcome = 'ON_REQUEST';
      warnings.push(`Property "${property.name}" inventory is ON_REQUEST`);
    } else if (property.availabilityStatus === 'REQUESTED' || rateDoc.confirmationStatus === 'NEEDS_CONFIRMATION') {
      availabilityStatus = 'NEEDS_CONFIRMATION';
      outcome = 'NEEDS_CONFIRMATION';
      warnings.push(`Property "${property.name}" requires supplier confirmation`);
    }

    const isValid = errors.length === 0;
    const canProceedToBooking = isValid && availabilityStatus !== 'UNAVAILABLE';

    return {
      serviceType: 'ACCOMMODATION',
      serviceId,
      serviceName: property.name,
      outcome,
      isValid,
      canProceedToBooking,
      rateVerified: true,
      ratePeriodId,
      authoritativeSupplierCost,
      quotedSupplierCost: item.supplierCost,
      lineItemSnapshot: {
        serviceId,
        serviceType: 'ACCOMMODATION',
        supplierId: property.supplierId || property.id,
        supplierName: property.name,
        inventoryMasterId: property.id,
        ratePeriodId,
        rateContractType: (rateDoc?.contractType as any) || 'STANDARD',
        frozenSupplierUnitRate: baseUnitRate,
        units: nights * roomsCount,
        frozenSupplementsCost: 0,
        frozenTotalSupplierCost: authoritativeSupplierCost,
        taxTreatment: rateDoc?.taxTreatment || 'INCLUSIVE',
        taxAmount: 0,
        rateVerifiedAt: new Date().toISOString(),
      },
      availabilityStatus,
      errors,
      warnings,
    };
  }
}
