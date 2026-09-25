import { Quote, UserRole, AuditLog } from '../../types';
import {
  Booking,
  BookingAccommodation,
  BookingTransport,
  BookingActivity,
  FinancialSnapshot,
  LineItemCostSnapshot,
  ConfirmationProgress,
  BookingComponentStatus,
} from '../../types/booking';
import { MealPlanType } from '../../types/accommodation';
import { QuoteValidationService } from '../quoteValidation/quoteValidationService';
import { InventoryDataProvider, DefaultInventoryDataProvider } from '../quoteValidation/inventoryProvider';
import {
  ConversionStorageProvider,
  ConversionTransaction,
  InMemoryConversionStorageProvider,
  FirestoreConversionStorageProvider,
} from './conversionStorageProvider';
import { authorizeResource } from '../../../server/authorization/policyEngine.js';
import { quoteResourceContext } from '../../../server/authorization/resourceContext.js';

export interface ConversionActor {
  /** Legacy compatibility alias; never use for ownership authorization. */
  id: string;
  /** Stable BBOS business identity used for ownership and audit records. */
  employeeId: string;
  uid?: string;
  name: string;
  email?: string;
  role: UserRole;
  active: boolean;
  salesTeamId?: string;
  firebaseUid?: string;
  isDemo?: boolean;
}

export interface QuoteConversionResult {
  success: boolean;
  isDuplicate?: boolean;
  booking: Booking;
  accommodations: BookingAccommodation[];
  transports: BookingTransport[];
  activities: BookingActivity[];
  confirmationProgress?: ConfirmationProgress;
  quoteStatus: 'ACCEPTED';
  message: string;
}

export interface FinancialSnapshotActor {
  employeeId: string;
  role: UserRole;
}

export class ConversionError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'ConversionError';
  }
}

export function generateBookingReference(): string {
  return `BB-${Math.floor(100000 + Math.random() * 900000)}`;
}

export function generateValidationFingerprint(quote: Quote, validationResult: any): string {
  const serviceCount = validationResult.totalServices || 0;
  const costSum = validationResult.authoritativeTotalSupplierCost || 0;
  const price = quote.finalAmount || quote.totalAmount || 0;
  return `FP-Q${quote.id}-V${quote.version || 1}-SVC${serviceCount}-C${costSum}-P${price}`;
}

export interface QuoteConversionOptions {
  currentDate?: string;
}

export class QuoteConversionService {
  private validationService: QuoteValidationService;
  private inventoryProvider: InventoryDataProvider;
  private storageProvider: ConversionStorageProvider;

  constructor(
    storageProvider?: ConversionStorageProvider,
    inventoryProvider?: InventoryDataProvider,
    validationService?: QuoteValidationService
  ) {
    this.inventoryProvider = inventoryProvider || new DefaultInventoryDataProvider();
    this.validationService = validationService || new QuoteValidationService(this.inventoryProvider);
    this.storageProvider = storageProvider || new FirestoreConversionStorageProvider();
  }

  /**
   * Authoritative server-side quote-to-booking conversion pipeline.
   * Gated by Stage 3 Validation and executes inside an atomic Firestore transaction.
   */
  async convertQuoteToBooking(
    quoteId: string,
    actor: ConversionActor,
    options?: QuoteConversionOptions
  ): Promise<QuoteConversionResult> {
    const currentDate = options?.currentDate || new Date().toISOString().split('T')[0];

    if (!actor || typeof actor.employeeId !== 'string' || actor.employeeId.trim() === '') {
      throw new ConversionError(403, 'INVALID_ACTOR_IDENTITY', 'A stable BBOS employee identity is required.');
    }
    if (actor.active !== true) {
      throw new ConversionError(403, 'INVALID_ACTOR_IDENTITY', 'An active BBOS employee identity is required.');
    }

    // 1. Mandatory Role Check (Sales Executive, Sales Manager, Admin, Founder)
    const allowedRoles: UserRole[] = ['Founder', 'Admin', 'Sales Manager', 'Sales Executive'];
    if (!allowedRoles.includes(actor.role)) {
      throw new ConversionError(403, 'FORBIDDEN', `Role ${actor.role} is not authorized to convert quotes.`);
    }

    if (!quoteId) {
      throw new ConversionError(400, 'BAD_REQUEST', 'Quote ID is required.');
    }

    // 2. Pre-transaction Quote Resolution & Stage 3 Gate
    const quote: Quote | null = await this.storageProvider.getQuote(quoteId);
    if (!quote) {
      throw new ConversionError(404, 'QUOTE_NOT_FOUND', `Quote with ID "${quoteId}" not found.`);
    }

    this.assertConversionAuthorization(quote, actor);
    this.assertAttributionMetadata(quote);
    this.assertConversionWorkflow(quote, currentDate);

    // Ignore/reject any client-supplied supplier cost or financial aggregates
    // The server exclusively evaluates authoritative inventory data.
    const validationResult = await this.validationService.validateQuote(quote, {
      mode: 'CONVERSION',
      currentDate,
      inventoryProvider: this.inventoryProvider,
    });

    if (!validationResult.canConvert) {
      throw new ConversionError(
        422,
        'VALIDATION_BLOCKED',
        `Quote cannot be converted. Outcome: ${validationResult.overallOutcome}`,
        {
          overallOutcome: validationResult.overallOutcome,
          errors: validationResult.errors,
          discrepancies: validationResult.discrepancies,
        }
      );
    }

    const quoteVersion = quote.version || 1;
    const conversionKey = `${quote.id}_v${quoteVersion}`;
    const now = new Date().toISOString();

    // 3. Execute Transaction
    // Required transaction order:
    // - read quote
    // - read quote_conversions/{quoteId}_v{version}
    // - if conversion exists, return existing booking safely
    // - re-check quote version/status/conversion eligibility
    // - revalidate authoritative assumptions
    // - create conversion marker
    // - create booking
    // - create modern service records
    // - create restricted financial snapshot
    // - update quote to ACCEPTED
    // - update lead to BOOKED if applicable
    // - update trip to BOOKED if applicable
    // - commit atomically
    const txnResult = await this.storageProvider.runTransaction(async (txn) => {
      // Step A: Read quote
      const freshQuote: Quote | null = await txn.get('quotes', quoteId);
      if (!freshQuote) {
        throw new ConversionError(404, 'QUOTE_NOT_FOUND', `Quote ${quoteId} does not exist.`);
      }

      // Re-authorize the transaction snapshot so no authorization-relevant
      // state can change between the initial read and the atomic write.
      this.assertConversionAuthorization(freshQuote, actor);
      this.assertAttributionMetadata(freshQuote);

      // Step B: Read quote_conversions/{quoteId}_v{version}
      const existingConversion = await txn.get('quote_conversions', conversionKey);
      if (existingConversion && existingConversion.bookingId) {
        // Idempotency: Return existing booking safely
        const existingBooking = await txn.get('bookings', existingConversion.bookingId);
        return {
          isDuplicate: true,
          bookingId: existingConversion.bookingId,
          booking: existingBooking,
        };
      }

      if (
        freshQuote.version !== quote.version ||
        freshQuote.updatedAt !== quote.updatedAt ||
        freshQuote.salesEmployeeId !== quote.salesEmployeeId ||
        freshQuote.salesTeamId !== quote.salesTeamId
      ) {
        throw new ConversionError(409, 'QUOTE_CHANGED', 'Quote changed during conversion. Reload and try again.');
      }

      // Step C: Re-check quote version/status/conversion eligibility
      if (freshQuote.status === 'ACCEPTED' && (freshQuote as any).convertedBookingId) {
        // Quote was already accepted into a booking
        const existingBooking = await txn.get('bookings', (freshQuote as any).convertedBookingId);
        return {
          isDuplicate: true,
          bookingId: (freshQuote as any).convertedBookingId,
          booking: existingBooking,
        };
      }
      this.assertConversionWorkflow(freshQuote, currentDate);
      await this.assertTripCostingCompleteForConversion(txn, freshQuote);

      // Step D: Revalidate all authoritative assumptions
      // Step E: Prepare identifiers and models
      const bookingId = `book-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const bookingReference = generateBookingReference();
      const snapshotId = `fsnap-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

      // Build modern service records
      const createdAccommodations: BookingAccommodation[] = [];
      const createdTransports: BookingTransport[] = [];
      const createdActivities: BookingActivity[] = [];

      // Accommodations
      if (freshQuote.hotels && freshQuote.hotels.length > 0) {
        for (let i = 0; i < freshQuote.hotels.length; i++) {
          const item = freshQuote.hotels[i];
          const serviceId = item.id || `acc-${i + 1}`;
          const valService = validationResult.services.find(
            s => s.serviceType === 'ACCOMMODATION' && s.serviceId === serviceId
          );

          const status: BookingComponentStatus =
            valService?.outcome === 'AVAILABLE' ? 'CONFIRMED' : 'REQUESTED';

          const bacc: BookingAccommodation = {
            id: `bacc-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 6)}`,
            bookingId,
            tripId: freshQuote.tripId || '',
            customerId: freshQuote.customerId,
            sourceQuoteServiceId: serviceId,
            propertyId: item.propertyId || item.hotelId || '',
            propertyName: item.hotelName || '',
            roomCategoryId: item.roomCategoryId || '',
            roomCategoryName: item.roomType || '',
            mealPlan: (item.mealPlan as MealPlanType) || 'EP',
            checkInDate: item.checkInDate,
            checkOutDate: item.checkOutDate,
            nightsCount: item.nights || 1,
            roomsCount: item.roomsCount || item.rooms || 1,
            adultsCount: item.adultsCount || 2,
            childrenCount: item.childrenCount || 0,
            guestNames: item.guestNames || [],
            specialRequests: item.specialRequests,
            supplierId: valService?.lineItemSnapshot?.supplierId || item.propertyId || 'supplier-acc-default',
            confirmationStatus: status,
            voucherStatus: 'PENDING',
            schemaVersion: '2B-5',
            createdAt: now,
            updatedAt: now,
            isDemo: freshQuote.isDemo,
          };

          createdAccommodations.push(bacc);
          txn.set('booking_accommodations', bacc.id, bacc);
        }
      }

      // Transports
      if (freshQuote.transports && freshQuote.transports.length > 0) {
        for (let i = 0; i < freshQuote.transports.length; i++) {
          const item = freshQuote.transports[i];
          const serviceId = item.id || `trans-${i + 1}`;
          const valService = validationResult.services.find(
            s => s.serviceType === 'TRANSPORT' && s.serviceId === serviceId
          );

          const status: BookingComponentStatus =
            valService?.outcome === 'AVAILABLE' ? 'CONFIRMED' : 'REQUESTED';

          const btrans: BookingTransport = {
            id: `btrans-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 6)}`,
            bookingId,
            tripId: freshQuote.tripId || '',
            customerId: freshQuote.customerId,
            vehicleCategoryId: item.vehicleCategoryId || item.vehicleType || '',
            vehicleCategoryName: item.vehicleType || 'Vehicle',
            routeId: item.transportRouteId,
            routeName: item.route || 'General Route',
            serviceDate: item.serviceDate || freshQuote.hotels?.[0]?.checkInDate || currentDate,
            daysCount: item.days || 1,
            pickupLocation: item.pickupLocation || 'Airport / Hotel',
            dropoffLocation: item.dropoffLocation || 'Hotel / Airport',
            passengerCount: item.passengerCount || 2,
            specialRequests: item.specialRequests,
            supplierId: valService?.lineItemSnapshot?.supplierId || item.vehicleCategoryId || 'supplier-trans-default',
            confirmationStatus: status,
            voucherStatus: 'PENDING',
            schemaVersion: '2B-5',
            createdAt: now,
            updatedAt: now,
            isDemo: freshQuote.isDemo,
          };

          createdTransports.push(btrans);
          txn.set('booking_transports', btrans.id, btrans);
        }
      }

      // Activities
      if (freshQuote.activities && freshQuote.activities.length > 0) {
        for (let i = 0; i < freshQuote.activities.length; i++) {
          const item = freshQuote.activities[i];
          const serviceId = item.id || `act-${i + 1}`;
          const valService = validationResult.services.find(
            s => s.serviceType === 'ACTIVITY' && s.serviceId === serviceId
          );

          const status: BookingComponentStatus =
            valService?.outcome === 'AVAILABLE' ? 'CONFIRMED' : 'REQUESTED';

          const bact: BookingActivity = {
            id: `bact-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 6)}`,
            bookingId,
            tripId: freshQuote.tripId || '',
            customerId: freshQuote.customerId,
            activityMasterId: item.activityMasterId || item.activityId || '',
            activityName: item.activityName || 'Activity',
            destinationId: item.destinationId || 'kashmir',
            destinationName: item.destinationName || 'Kashmir',
            serviceDate: item.date || item.serviceDate || freshQuote.hotels?.[0]?.checkInDate || currentDate,
            participantCount: item.pax || 2,
            specialRequests: item.specialRequests,
            supplierId: valService?.lineItemSnapshot?.supplierId || item.activityMasterId || 'supplier-act-default',
            confirmationStatus: status,
            voucherStatus: 'PENDING',
            schemaVersion: '2B-5',
            createdAt: now,
            updatedAt: now,
            isDemo: freshQuote.isDemo,
          };

          createdActivities.push(bact);
          txn.set('booking_activities', bact.id, bact);
        }
      }

      // Calculate ConfirmationProgress
      const allComponents = [...createdAccommodations, ...createdTransports, ...createdActivities];
      const totalServices = allComponents.length;
      const confirmedServices = allComponents.filter(c => c.confirmationStatus === 'CONFIRMED').length;
      const requestedServices = allComponents.filter(c => c.confirmationStatus === 'REQUESTED').length;
      const confirmationProgress: ConfirmationProgress = {
        totalServices,
        confirmedServices,
        requestedServices,
        cancelledServices: 0,
        allConfirmed: totalServices > 0 && confirmedServices === totalServices,
      };

      // Travel dates
      const travelStartDate =
        freshQuote.hotels?.[0]?.checkInDate ||
        createdTransports[0]?.serviceDate ||
        createdActivities[0]?.serviceDate ||
        currentDate;

      const travelEndDate =
        freshQuote.hotels?.[freshQuote.hotels.length - 1]?.checkOutDate ||
        createdTransports[createdTransports.length - 1]?.endDate ||
        createdTransports[createdTransports.length - 1]?.serviceDate ||
        travelStartDate;

      const totalSellingPrice = freshQuote.finalAmount ?? freshQuote.totalAmount ?? 0;

      // Step F: Create conversion marker inside transaction
      txn.set('quote_conversions', conversionKey, {
        id: conversionKey,
        quoteId: freshQuote.id,
        quoteVersion,
        bookingId,
        bookingReference,
        convertedBy: actor.employeeId,
        convertedAt: now,
      });

      // Step G: Create top-level Booking document
      // INVARIANT: ZERO supplier costs or margin fields!
      const booking: Booking = {
        id: bookingId,
        bookingReference,
        tripId: freshQuote.tripId || '',
        customerId: freshQuote.customerId,
        customerName: freshQuote.customerName,
        customerPhone: freshQuote.customerPhone,
        customerEmail: freshQuote.customerEmail,
        leadId: freshQuote.leadId,
        quoteId: freshQuote.id,
        quoteVersion,
        status: 'PENDING_PAYMENT',
        paymentStatus: 'UNPAID',
        totalSellingPrice,
        totalAmount: totalSellingPrice,
        amountReceived: 0,
        amountPending: totalSellingPrice,
        confirmationProgress,
        travelStartDate,
        travelEndDate,
        assignedSalesEmployeeId: freshQuote.salesEmployeeId!,
        salesTeamId: freshQuote.salesTeamId!,
        schemaVersion: '2B-5',
        createdAt: now,
        updatedAt: now,
        isDemo: freshQuote.isDemo,
      };

      txn.set('bookings', booking.id, booking);

      // Step H: Create restricted financial snapshot
      const lineItems: LineItemCostSnapshot[] = [];
      let accommodationSupplierCost = 0;
      let transportSupplierCost = 0;
      let activitySupplierCost = 0;

      for (const s of validationResult.services) {
        if (s.lineItemSnapshot) {
          lineItems.push(s.lineItemSnapshot);
          if (s.serviceType === 'ACCOMMODATION') {
            accommodationSupplierCost += s.lineItemSnapshot.frozenTotalSupplierCost;
          } else if (s.serviceType === 'TRANSPORT') {
            transportSupplierCost += s.lineItemSnapshot.frozenTotalSupplierCost;
          } else if (s.serviceType === 'ACTIVITY') {
            activitySupplierCost += s.lineItemSnapshot.frozenTotalSupplierCost;
          }
        }
      }

      const totalSupplierCost = accommodationSupplierCost + transportSupplierCost + activitySupplierCost;
      const grossProfit = totalSellingPrice - totalSupplierCost;
      const grossMargin =
        totalSellingPrice > 0 ? Number(((grossProfit / totalSellingPrice) * 100).toFixed(1)) : 0;

      const financialSnapshot: FinancialSnapshot = {
        id: snapshotId,
        bookingId,
        snapshotVersion: 1,
        quoteId: freshQuote.id,
        quoteVersion,
        currency: 'INR',
        totalSellingPrice,
        totalSupplierCost,
        accommodationSupplierCost,
        transportSupplierCost,
        activitySupplierCost,
        otherSupplierCosts: 0,
        grossProfit,
        grossMargin,
        lineItems,
        rateValidationFingerprint: generateValidationFingerprint(freshQuote, validationResult),
        createdAt: now,
        createdBy: actor.employeeId,
      };

      txn.set(`bookings/${bookingId}/financial_snapshot`, snapshotId, financialSnapshot);

      // Step I: Update quote to ACCEPTED
      txn.update('quotes', freshQuote.id, {
        status: 'ACCEPTED',
        convertedBookingId: booking.id,
        updatedAt: now,
      });

      // Step J: Update lead to BOOKED if applicable
      if (freshQuote.leadId) {
        txn.update('leads', freshQuote.leadId, {
          status: 'BOOKED',
          convertedBookingId: booking.id,
          updatedAt: now,
        });
      }

      // Step K: Update trip to BOOKED if applicable
      if (freshQuote.tripId) {
        txn.update('trips', freshQuote.tripId, {
          status: 'BOOKED',
          convertedBookingId: booking.id,
          updatedAt: now,
        });
      }

      // Keep the security audit in the same transaction as the conversion so a
      // successful conversion can never be committed without its audit record.
      const auditLog: AuditLog = {
        id: `audit-quote-conversion-${conversionKey}`,
        timestamp: now,
        actorType: 'HUMAN',
        actorId: actor.employeeId,
        actorName: `${actor.name} (${actor.role})`,
        action: 'QUOTE_CONVERTED_TO_BOOKING',
        entityType: 'BOOKING',
        entityId: booking.id,
        before: { quoteStatus: freshQuote.status },
        after: {
          quoteStatus: 'ACCEPTED',
          bookingId: booking.id,
          bookingReference: booking.bookingReference,
          quoteId: freshQuote.id,
          quoteVersion,
          totalSellingPrice: booking.totalSellingPrice,
          serviceCounts: {
            total: booking.confirmationProgress?.totalServices,
            confirmed: booking.confirmationProgress?.confirmedServices,
            requested: booking.confirmationProgress?.requestedServices,
          },
          conversionResult: 'SUCCESS',
        },
        reason: `Quote ${freshQuote.id} v${quoteVersion} converted to booking ${booking.bookingReference}`,
      };

      txn.set('audit_logs', auditLog.id, auditLog);

      return {
        isDuplicate: false,
        bookingId,
        booking,
        accommodations: createdAccommodations,
        transports: createdTransports,
        activities: createdActivities,
        financialSnapshot,
      };
    });

    // 4. Handle Result Post-Transaction
    if (txnResult.isDuplicate) {
      // Fetch full details of the existing booking
      const existing = await this.storageProvider.getBookingWithServices(txnResult.bookingId);
      if (!existing) {
        throw new ConversionError(500, 'LOOKUP_FAILED', 'Existing converted booking could not be retrieved.');
      }

      return {
        success: true,
        isDuplicate: true,
        booking: existing.booking,
        accommodations: existing.accommodations,
        transports: existing.transports,
        activities: existing.activities,
        confirmationProgress: existing.booking.confirmationProgress,
        quoteStatus: 'ACCEPTED',
        message: `Quote ${quoteId} was already converted into booking ${existing.booking.bookingReference}.`,
      };
    }

    // 5. Role-Safe Response
    // Strictly ZERO financial snapshot data or supplier buy costs in the conversion response!
    return {
      success: true,
      isDuplicate: false,
      booking: txnResult.booking,
      accommodations: txnResult.accommodations,
      transports: txnResult.transports,
      activities: txnResult.activities,
      confirmationProgress: txnResult.booking.confirmationProgress,
      quoteStatus: 'ACCEPTED',
      message: `Quote ${quoteId} successfully converted into booking ${txnResult.booking.bookingReference}.`,
    };
  }

  /**
   * D2B guard for Trip-priced Quotes. A pending or subsequently changed
   * itinerary cannot be converted using a stale supplier-cost snapshot.
   * Legacy Quotes without a Trip cost source retain their existing conversion
   * semantics until an explicit migration is approved.
   */
  private async assertTripCostingCompleteForConversion(txn: ConversionTransaction, quote: Quote): Promise<void> {
    if (!quote.tripId || quote.supplierCostSource?.type !== 'TRIP') return;
    const trip = await txn.get('trips', quote.tripId);
    if (
      !trip || trip.costingStatus !== 'CALCULATED' ||
      trip.updatedAt !== quote.supplierCostSource.asOf
    ) {
      throw new ConversionError(
        422,
        'TRIP_COSTING_INCOMPLETE',
        'The linked Trip itinerary has pending or stale supplier costing. Recalculate the Trip and refresh the Quote before conversion.',
      );
    }
  }

  private assertConversionAuthorization(quote: Quote, actor: ConversionActor): void {
    const decision = authorizeResource(actor, 'QUOTE', 'CONVERT_TO_BOOKING', quoteResourceContext(quote));
    if (!decision.allowed) {
      throw new ConversionError(
        403,
        'RESOURCE_ACCESS_DENIED',
        'Forbidden: You are not authorized to convert this Quote.',
        decision,
      );
    }
  }

  private assertConversionWorkflow(quote: Quote, currentDate: string): void {
    if (!(['SENT', 'VIEWED', 'ACCEPTED'] as string[]).includes(quote.status)) {
      throw new ConversionError(
        422,
        'INVALID_QUOTE_STATUS',
        `Quote status ${quote.status || 'UNKNOWN'} cannot be converted to a booking.`,
      );
    }
    if (quote.validUntil && quote.validUntil < currentDate) {
      throw new ConversionError(422, 'QUOTE_EXPIRED', `Quote validity expired on ${quote.validUntil}.`);
    }
  }

  private assertAttributionMetadata(quote: Quote): void {
    if (!quote.salesEmployeeId) {
      throw new ConversionError(422, 'MISSING_QUOTE_OWNER', 'Quote owner metadata is required before conversion.');
    }
    if (!quote.salesTeamId) {
      throw new ConversionError(422, 'MISSING_QUOTE_TEAM', 'Quote sales-team metadata is required before conversion.');
    }
  }

  /**
   * Dedicated financial diagnostic retrieval endpoint for authorized roles.
   * Founder, Admin, and Accounts ONLY.
   */
  async getBookingFinancialSnapshot(
    bookingId: string,
    actor: FinancialSnapshotActor
  ): Promise<FinancialSnapshot> {
    const authorizedRoles: UserRole[] = ['Founder', 'Admin', 'Accounts'];
    if (!authorizedRoles.includes(actor.role)) {
      throw new ConversionError(
        403,
        'FORBIDDEN',
        `Role ${actor.role} is not authorized to access financial snapshot data.`
      );
    }

    const snapshot = await this.storageProvider.getFinancialSnapshot(bookingId);
    if (!snapshot) {
      throw new ConversionError(404, 'SNAPSHOT_NOT_FOUND', `Financial snapshot for booking ${bookingId} not found.`);
    }

    return snapshot;
  }
}
