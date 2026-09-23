import { Quote, UserRole } from '../../types';
import {
  QuoteValidationResult,
  ServiceValidationResult,
  ValidationOutcome,
  RateDiscrepancy,
  QuoteValidationMode,
} from '../../types/quoteValidation';
import {
  InventoryDataProvider,
  DefaultInventoryDataProvider,
} from './inventoryProvider';
import { AccommodationQuoteValidator } from './accommodationValidator';
import { TransportQuoteValidator } from './transportValidator';
import { ActivityQuoteValidator } from './activityValidator';

export interface QuoteValidationOptions {
  currentDate?: string;
  userRole?: UserRole;
  inventoryProvider?: InventoryDataProvider;
  mode?: QuoteValidationMode;
}

export class QuoteValidationService {
  private inventoryProvider: InventoryDataProvider;
  private accommodationValidator: AccommodationQuoteValidator;
  private transportValidator: TransportQuoteValidator;
  private activityValidator: ActivityQuoteValidator;

  constructor(inventoryProvider?: InventoryDataProvider) {
    this.inventoryProvider = inventoryProvider || new DefaultInventoryDataProvider();
    this.accommodationValidator = new AccommodationQuoteValidator(this.inventoryProvider);
    this.transportValidator = new TransportQuoteValidator(this.inventoryProvider);
    this.activityValidator = new ActivityQuoteValidator(this.inventoryProvider);
  }

  /**
   * Validates a quote before conversion to booking.
   * Deterministic and side-effect free: DOES NOT mutate quote, rates, or bookings.
   */
  async validateQuote(
    quote: Quote,
    options?: QuoteValidationOptions
  ): Promise<QuoteValidationResult> {
    const currentDate = options?.currentDate || new Date().toISOString().split('T')[0];
    const userRole = options?.userRole;
    const mode = options?.mode || 'STANDARD';

    const errors: string[] = [];
    const warnings: string[] = [];
    const discrepancies: RateDiscrepancy[] = [];
    const validatedServices: ServiceValidationResult[] = [];

    // 1. Quote existence check
    if (!quote || !quote.id) {
      return this.buildInvalidResult('unknown', 1, ['Quote object is invalid or undefined'], userRole);
    }

    // 2. Quote status check
    if (mode === 'CONVERSION') {
      if (quote.status === 'DRAFT') {
        errors.push('Draft quote cannot be converted to a booking');
      } else if (quote.status === 'REJECTED') {
        errors.push('Quote was rejected and cannot be converted to a booking');
      } else if (quote.status === 'EXPIRED') {
        errors.push('Quote has expired status');
      } else if (quote.status === 'PENDING_APPROVAL') {
        errors.push('Quote pending approval cannot be converted to a booking');
      }
      // Note: In CONVERSION mode, quote does NOT need to be ACCEPTED yet,
      // as atomic conversion will change it to ACCEPTED upon commit.
    } else {
      if (quote.status === 'REJECTED') {
        errors.push('Quote was rejected and cannot be converted to a booking');
      } else if (quote.status === 'EXPIRED') {
        errors.push('Quote has expired status');
      }
    }

    // 3. Expiration check
    let quoteIsExpired = false;
    if (quote.validUntil) {
      if (quote.validUntil < currentDate) {
        quoteIsExpired = true;
        errors.push(`Quote validity expired on ${quote.validUntil} (current date: ${currentDate})`);
      }
    } else {
      warnings.push('Quote has no validUntil date specified');
    }

    // 4. Quote version check
    if (!quote.version || quote.version < 1) {
      errors.push('Quote has invalid version number');
    }

    // 5. Customer & trip linkage
    if (!quote.customerId) {
      errors.push('Quote is missing associated customerId');
    }

    // 6. Validate each service
    const quoteStartDate = quote.hotels?.[0]?.checkInDate || currentDate;

    // A. Accommodations
    if (quote.hotels && quote.hotels.length > 0) {
      for (let i = 0; i < quote.hotels.length; i++) {
        const hotelItem = quote.hotels[i];
        const res = await this.accommodationValidator.validate(hotelItem, i, quoteStartDate);
        validatedServices.push(res);
        if (res.discrepancy) discrepancies.push(res.discrepancy);
        errors.push(...res.errors);
        warnings.push(...res.warnings);
      }
    }

    // B. Transports
    if (quote.transports && quote.transports.length > 0) {
      for (let i = 0; i < quote.transports.length; i++) {
        const transItem = quote.transports[i];
        const res = await this.transportValidator.validate(transItem, i, quoteStartDate);
        validatedServices.push(res);
        if (res.discrepancy) discrepancies.push(res.discrepancy);
        errors.push(...res.errors);
        warnings.push(...res.warnings);
      }
    }

    // C. Activities
    if (quote.activities && quote.activities.length > 0) {
      for (let i = 0; i < quote.activities.length; i++) {
        const actItem = quote.activities[i];
        const res = await this.activityValidator.validate(actItem, i, quoteStartDate);
        validatedServices.push(res);
        if (res.discrepancy) discrepancies.push(res.discrepancy);
        errors.push(...res.errors);
        warnings.push(...res.warnings);
      }
    }

    // 7. Ensure at least one service exists
    const totalServices = validatedServices.length;
    if (totalServices === 0) {
      errors.push('Quote contains no bookable services (hotels, transports, or activities)');
    }

    // 8. Aggregate service counts
    let availableServices = 0;
    let needsConfirmationServices = 0;
    let onRequestServices = 0;
    let unavailableServices = 0;
    let rateChangedServices = 0;
    let missingRateServices = 0;

    let authoritativeTotalSupplierCost = 0;
    let quotedTotalSupplierCost = 0;

    for (const s of validatedServices) {
      if (s.authoritativeSupplierCost !== undefined) {
        authoritativeTotalSupplierCost += s.authoritativeSupplierCost;
      }
      if (s.quotedSupplierCost !== undefined) {
        quotedTotalSupplierCost += s.quotedSupplierCost;
      }

      switch (s.outcome) {
        case 'AVAILABLE':
          availableServices++;
          break;
        case 'NEEDS_CONFIRMATION':
          needsConfirmationServices++;
          break;
        case 'ON_REQUEST':
          onRequestServices++;
          break;
        case 'SERVICE_UNAVAILABLE':
          unavailableServices++;
          break;
        case 'RATE_CHANGED':
        case 'REQUIRES_REPRICING':
          rateChangedServices++;
          break;
        case 'MISSING_RATE_CONFIGURATION':
          missingRateServices++;
          break;
      }
    }

    // 9. Determine overall outcome
    let overallOutcome: ValidationOutcome = 'AVAILABLE';
    let canConvert = false;

    if (totalServices === 0) {
      overallOutcome = 'MISSING_RATE_CONFIGURATION';
      canConvert = false;
    } else if (unavailableServices > 0) {
      overallOutcome = 'SERVICE_UNAVAILABLE';
      canConvert = false;
    } else if (quoteIsExpired) {
      overallOutcome = 'RATE_CHANGED';
      canConvert = false;
    } else if (rateChangedServices > 0) {
      overallOutcome = 'RATE_CHANGED';
      canConvert = false;
    } else if (missingRateServices > 0) {
      overallOutcome = 'MISSING_RATE_CONFIGURATION';
      canConvert = false;
    } else if (errors.length > 0) {
      overallOutcome = 'SERVICE_UNAVAILABLE';
      canConvert = false;
    } else if (onRequestServices > 0) {
      overallOutcome = 'ON_REQUEST';
      canConvert = true;
    } else if (needsConfirmationServices > 0) {
      overallOutcome = 'NEEDS_CONFIRMATION';
      canConvert = true;
    } else if (availableServices === totalServices) {
      overallOutcome = 'AVAILABLE';
      canConvert = true;
    }

    const totalSellingPrice = quote.finalAmount || quote.totalAmount || 0;
    const estimatedGrossProfit = totalSellingPrice - authoritativeTotalSupplierCost;
    const estimatedGrossMargin = totalSellingPrice > 0
      ? Number(((estimatedGrossProfit / totalSellingPrice) * 100).toFixed(1))
      : 0;

    const rawResult: QuoteValidationResult = {
      quoteId: quote.id,
      quoteVersion: quote.version || 1,
      overallOutcome,
      isValid: errors.length === 0,
      canConvert,
      totalServices,
      availableServices,
      needsConfirmationServices,
      onRequestServices,
      unavailableServices,
      rateChangedServices,
      missingRateServices,
      authoritativeTotalSupplierCost,
      quotedTotalSupplierCost: quote.totalSupplierCost || quotedTotalSupplierCost,
      totalSellingPrice,
      estimatedGrossProfit,
      estimatedGrossMargin,
      services: validatedServices,
      discrepancies,
      errors: Array.from(new Set(errors)),
      warnings: Array.from(new Set(warnings)),
      validatedAt: new Date().toISOString(),
    };

    if (userRole) {
      return this.sanitizeValidationResultForRole(rawResult, userRole);
    }

    return rawResult;
  }

  /**
   * Separates supplier-rate diagnostics from package profitability. Reservations
   * can use supplier costs for booking work but cannot see profit or margin.
   */
  sanitizeValidationResultForRole(
    result: QuoteValidationResult,
    role: UserRole
  ): QuoteValidationResult {
    const isLeadershipOrAccounts = role === 'Founder' || role === 'Admin' || role === 'Accounts';
    const isSalesManager = role === 'Sales Manager';
    const isReservations = role === 'Reservations';

    if (isLeadershipOrAccounts) {
      // Full diagnostic view
      return result;
    }

    // Deep clone to avoid mutating in-place
    const sanitized: QuoteValidationResult = JSON.parse(JSON.stringify(result));

    if (isReservations) {
      delete sanitized.estimatedGrossProfit;
      delete sanitized.estimatedGrossMargin;
      return sanitized;
    }

    if (isSalesManager) {
      // Sales Manager can see gross margin and profit, but raw supplier costs are stripped
      delete sanitized.authoritativeTotalSupplierCost;
      delete sanitized.quotedTotalSupplierCost;

      sanitized.services = sanitized.services.map(s => {
        const copy = { ...s };
        delete copy.authoritativeSupplierCost;
        delete copy.quotedSupplierCost;
        delete copy.lineItemSnapshot;
        if (copy.discrepancy) {
          copy.discrepancy = {
            ...copy.discrepancy,
            quotedRate: undefined,
            currentRate: undefined,
          };
        }
        return copy;
      });

      sanitized.discrepancies = sanitized.discrepancies.map(d => ({
        ...d,
        quotedRate: undefined,
        currentRate: undefined,
      }));

      return sanitized;
    }

    // Sales Executive, Marketing, Operations:
    // Strip ALL supplier costs, gross profit, and gross margin
    delete sanitized.authoritativeTotalSupplierCost;
    delete sanitized.quotedTotalSupplierCost;
    delete sanitized.estimatedGrossProfit;
    delete sanitized.estimatedGrossMargin;

    sanitized.services = sanitized.services.map(s => {
      const copy = { ...s };
      delete copy.authoritativeSupplierCost;
      delete copy.quotedSupplierCost;
      delete copy.lineItemSnapshot;
      if (copy.discrepancy) {
        copy.discrepancy = {
          ...copy.discrepancy,
          quotedRate: undefined,
          currentRate: undefined,
          reason: 'Rate has changed in master inventory and requires repricing.',
        };
      }
      return copy;
    });

    sanitized.discrepancies = sanitized.discrepancies.map(d => ({
      ...d,
      quotedRate: undefined,
      currentRate: undefined,
      reason: 'Rate has changed in master inventory and requires repricing.',
    }));

    return sanitized;
  }

  private buildInvalidResult(
    quoteId: string,
    quoteVersion: number,
    errors: string[],
    userRole?: UserRole
  ): QuoteValidationResult {
    const res: QuoteValidationResult = {
      quoteId,
      quoteVersion,
      overallOutcome: 'SERVICE_UNAVAILABLE',
      isValid: false,
      canConvert: false,
      totalServices: 0,
      availableServices: 0,
      needsConfirmationServices: 0,
      onRequestServices: 0,
      unavailableServices: 0,
      rateChangedServices: 0,
      missingRateServices: 0,
      totalSellingPrice: 0,
      services: [],
      discrepancies: [],
      errors,
      warnings: [],
      validatedAt: new Date().toISOString(),
    };

    return userRole ? this.sanitizeValidationResultForRole(res, userRole) : res;
  }
}
