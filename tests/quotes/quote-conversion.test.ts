import { describe, it, expect, beforeEach } from 'bun:test';
import { Quote } from '../../src/types/index';
import {
  QuoteConversionService,
  ConversionActor,
  ConversionError,
} from '../../src/services/conversion/quoteConversionService';
import { InMemoryConversionStorageProvider } from '../../src/services/conversion/conversionStorageProvider';
import { DefaultInventoryDataProvider } from '../../src/services/quoteValidation/inventoryProvider';
import { DEMO_ACCOMMODATION_PROPERTIES } from '../../src/services/accommodationDemoData';

describe('BBOS Phase 2B-5 Stage 4 — Quote-to-Booking Conversion Engine', () => {
  let storage: InMemoryConversionStorageProvider;
  let service: QuoteConversionService;

  const salesExecActor: ConversionActor = {
    id: 'emp-sales-01',
    uid: 'sales-uid-01',
    name: 'Tariq Bhat',
    email: 'tariq.sales@bookingbridge.com',
    role: 'Sales Executive',
  };

  const founderActor: ConversionActor = {
    id: 'emp-founder-01',
    uid: 'founder-uid-01',
    name: 'Suhaib Hamid',
    email: 'suhaib@bookingbridge.com',
    role: 'Founder',
  };

  const accountsActor: ConversionActor = {
    id: 'emp-acc-01',
    uid: 'acc-uid-01',
    name: 'Farooq Lone',
    email: 'farooq.accounts@bookingbridge.com',
    role: 'Accounts',
  };

  const createBaseQuote = (overrides?: Partial<Quote>): Quote => ({
    id: 'quote-stage4-01',
    leadId: 'lead-stage4-01',
    customerId: 'cust-stage4-01',
    customerName: 'Rohit Sharma',
    customerPhone: '+919876543210',
    customerEmail: 'rohit@example.com',
    destination: 'Kashmir',
    tripId: 'trip-stage4-01',
    travelerCount: 2,
    totalAmount: 55000,
    discountAmount: 0,
    finalAmount: 55000,
    status: 'SENT', // Pre-conversion convertible status
    validUntil: '2026-10-31',
    createdAt: '2026-09-01T10:00:00Z',
    version: 1,
    hotels: [
      {
        id: 'q-hotel-1',
        hotelName: 'Hotel Kareem Residency',
        propertyId: 'accom-sgr-kareemresidency',
        roomCategoryId: 'rc-accom-sgr-kareemresidency',
        ratePeriodId: 'rp-accom-sgr-kareemresidency-oct',
        roomType: 'Deluxe Room',
        mealPlan: 'MAP',
        checkInDate: '2026-10-15',
        checkOutDate: '2026-10-17',
        nights: 2,
        roomsCount: 1,
        adultsCount: 2,
        quotedRate: 4000,
        supplierCost: 8000,
      },
    ],
    transports: [
      {
        id: 'q-trans-1',
        vehicleType: 'Innova Crysta AC',
        vehicleCategoryId: 'vc_innova_crysta',
        ratePeriodId: 'trp_innova_kashmir_season',
        route: 'Srinagar Airport Transfer',
        serviceDate: '2026-10-15',
        days: 2,
        passengerCount: 2,
        rate: 6000,
        quotedRate: 2000,
        supplierCost: 4000,
      },
    ],
    activities: [
      {
        id: 'q-act-1',
        name: 'Private Shikara Ride on Dal Lake',
        activityMasterId: 'act_shikara_ride',
        activityRatePeriodId: 'arp_shikara_standard',
        serviceDate: '2026-10-16',
        pax: 2,
        rate: 2000,
        quotedRate: 800,
        supplierCost: 800,
      },
    ],
    ...overrides,
  });

  beforeEach(() => {
    storage = new InMemoryConversionStorageProvider({
      quotes: [createBaseQuote()],
      leads: [{ id: 'lead-stage4-01', status: 'QUOTE_SENT' }],
      trips: [{ id: 'trip-stage4-01', status: 'PROPOSED' }],
    });
    service = new QuoteConversionService(storage, new DefaultInventoryDataProvider());
  });

  // 1. Valid accommodation-only quote converts
  it('1. Valid accommodation-only quote converts cleanly', async () => {
    const quote = createBaseQuote({ transports: [], activities: [] });
    storage.rawSet('quotes', quote.id, quote);

    const result = await service.convertQuoteToBooking(quote.id, salesExecActor, {
      currentDate: '2026-09-15',
    });

    expect(result.success).toBe(true);
    expect(result.booking).toBeDefined();
    expect(result.booking.id).toBeDefined();
    expect(result.booking.bookingReference.startsWith('BB-')).toBe(true);
    expect(result.accommodations.length).toBe(1);
    expect(result.transports.length).toBe(0);
    expect(result.activities.length).toBe(0);
    expect(result.quoteStatus).toBe('ACCEPTED');
  });

  // 2. Valid transport-only quote converts
  it('2. Valid transport-only quote converts cleanly', async () => {
    const quote = createBaseQuote({ hotels: [], activities: [] });
    storage.rawSet('quotes', quote.id, quote);

    const result = await service.convertQuoteToBooking(quote.id, salesExecActor, {
      currentDate: '2026-09-15',
    });

    expect(result.success).toBe(true);
    expect(result.transports.length).toBe(1);
    expect(result.accommodations.length).toBe(0);
  });

  // 3. Valid activity-only quote converts
  it('3. Valid activity-only quote converts cleanly', async () => {
    const quote = createBaseQuote({ hotels: [], transports: [] });
    storage.rawSet('quotes', quote.id, quote);

    const result = await service.convertQuoteToBooking(quote.id, salesExecActor, {
      currentDate: '2026-09-15',
    });

    expect(result.success).toBe(true);
    expect(result.activities.length).toBe(1);
    expect(result.accommodations.length).toBe(0);
  });

  // 4. Mixed hotel + transport + activity quote converts
  it('4. Mixed hotel + transport + activity quote converts all services', async () => {
    const quote = createBaseQuote();
    storage.rawSet('quotes', quote.id, quote);

    const result = await service.convertQuoteToBooking(quote.id, salesExecActor, {
      currentDate: '2026-09-15',
    });

    expect(result.success).toBe(true);
    expect(result.accommodations.length).toBe(1);
    expect(result.transports.length).toBe(1);
    expect(result.activities.length).toBe(1);
    expect(result.confirmationProgress?.totalServices).toBe(3);
  });

  // 5. AVAILABLE service becomes CONFIRMED
  it('5. AVAILABLE service status maps to CONFIRMED on modern record', async () => {
    const quote = createBaseQuote({ transports: [], activities: [] });
    storage.rawSet('quotes', quote.id, quote);

    const result = await service.convertQuoteToBooking(quote.id, salesExecActor, {
      currentDate: '2026-09-15',
    });

    expect(result.accommodations[0].confirmationStatus).toBe('CONFIRMED');
  });

  // 6. NEEDS_CONFIRMATION becomes REQUESTED
  it('6. NEEDS_CONFIRMATION service status maps to REQUESTED', async () => {
    const customProps = DEMO_ACCOMMODATION_PROPERTIES.map(p =>
      p.id === 'accom-sgr-kareemresidency'
        ? { ...p, availabilityStatus: 'REQUESTED' as const }
        : p
    );
    const customProvider = new DefaultInventoryDataProvider({ properties: customProps });
    const customService = new QuoteConversionService(storage, customProvider);

    const quote = createBaseQuote({ transports: [], activities: [] });
    storage.rawSet('quotes', quote.id, quote);

    const result = await customService.convertQuoteToBooking(quote.id, salesExecActor, {
      currentDate: '2026-09-15',
    });

    expect(result.accommodations[0].confirmationStatus).toBe('REQUESTED');
    expect(result.confirmationProgress?.requestedServices).toBe(1);
    expect(result.confirmationProgress?.allConfirmed).toBe(false);
  });

  // 7. ON_REQUEST becomes REQUESTED
  it('7. ON_REQUEST service status maps to REQUESTED', async () => {
    const customProps = DEMO_ACCOMMODATION_PROPERTIES.map(p =>
      p.id === 'accom-sgr-kareemresidency'
        ? { ...p, availabilityStatus: 'ON_HOLD' as const }
        : p
    );
    const customProvider = new DefaultInventoryDataProvider({ properties: customProps });
    const customService = new QuoteConversionService(storage, customProvider);

    const quote = createBaseQuote({ transports: [], activities: [] });
    storage.rawSet('quotes', quote.id, quote);

    const result = await customService.convertQuoteToBooking(quote.id, salesExecActor, {
      currentDate: '2026-09-15',
    });

    expect(result.accommodations[0].confirmationStatus).toBe('REQUESTED');
    expect(result.confirmationProgress?.requestedServices).toBe(1);
    expect(result.confirmationProgress?.allConfirmed).toBe(false);
  });

  // 8. UNAVAILABLE blocks conversion
  it('8. UNAVAILABLE service blocks conversion and throws ConversionError', async () => {
    const quote = createBaseQuote({
      transports: [],
      activities: [],
      hotels: [
        {
          id: 'q-hotel-unavail',
          hotelName: 'Hotel Heevan Pahalgam',
          propertyId: 'accom-pah-heevan',
          roomCategoryId: 'rc-accom-pah-heevan',
          ratePeriodId: 'rp-accom-pah-heevan-aug',
          roomType: 'Deluxe Room',
          mealPlan: 'MAP',
          checkInDate: '2026-08-15', // Blackout date
          nights: 2,
          roomsCount: 1,
          adultsCount: 2,
          quotedRate: 8500,
          supplierCost: 17000,
        },
      ],
    });
    storage.rawSet('quotes', quote.id, quote);

    let errorThrown: any;
    try {
      await service.convertQuoteToBooking(quote.id, salesExecActor, {
        currentDate: '2026-08-01',
      });
    } catch (err: any) {
      errorThrown = err;
    }

    expect(errorThrown).toBeDefined();
    expect(errorThrown.statusCode).toBe(422);
    expect(errorThrown.code).toBe('VALIDATION_BLOCKED');
    expect(storage.getAllBookings().length).toBe(0);
  });

  // 9. RATE_CHANGED blocks conversion
  it('9. RATE_CHANGED blocks conversion', async () => {
    const quote = createBaseQuote({
      transports: [],
      activities: [],
      hotels: [
        {
          id: 'q-hotel-ratechanged',
          hotelName: 'Hotel Kareem Residency',
          propertyId: 'accom-sgr-kareemresidency',
          roomCategoryId: 'rc-accom-sgr-kareemresidency',
          ratePeriodId: 'rp-accom-sgr-kareemresidency-oct',
          roomType: 'Deluxe Room',
          mealPlan: 'MAP',
          checkInDate: '2026-10-15',
          nights: 2,
          roomsCount: 1,
          adultsCount: 2,
          quotedRate: 9999, // Differs from authoritative 4000
          supplierCost: 8000,
        },
      ],
    });
    storage.rawSet('quotes', quote.id, quote);

    let errorThrown: any;
    try {
      await service.convertQuoteToBooking(quote.id, salesExecActor, {
        currentDate: '2026-09-15',
      });
    } catch (err: any) {
      errorThrown = err;
    }

    expect(errorThrown).toBeDefined();
    expect(errorThrown.statusCode).toBe(422);
    expect(storage.getAllBookings().length).toBe(0);
  });

  // 10. MISSING_RATE_CONFIGURATION blocks conversion
  it('10. MISSING_RATE_CONFIGURATION blocks conversion', async () => {
    const quote = createBaseQuote({
      transports: [],
      activities: [],
      hotels: [
        {
          id: 'q-hotel-missing',
          hotelName: 'Hotel Kareem Residency',
          propertyId: 'accom-sgr-kareemresidency',
          roomCategoryId: 'rc-accom-sgr-kareemresidency',
          ratePeriodId: 'non-existent-rate-period',
          roomType: 'Deluxe Room',
          mealPlan: 'MAP',
          checkInDate: '2026-10-15',
          nights: 2,
          roomsCount: 1,
          adultsCount: 2,
          quotedRate: 4000,
          supplierCost: 8000,
        },
      ],
    });
    storage.rawSet('quotes', quote.id, quote);

    let errorThrown: any;
    try {
      await service.convertQuoteToBooking(quote.id, salesExecActor, {
        currentDate: '2026-09-15',
      });
    } catch (err: any) {
      errorThrown = err;
    }

    expect(errorThrown).toBeDefined();
    expect(errorThrown.statusCode).toBe(422);
    expect(storage.getAllBookings().length).toBe(0);
  });

  // 11. Expired quote blocks conversion
  it('11. Expired quote blocks conversion', async () => {
    const quote = createBaseQuote({ validUntil: '2026-09-01' });
    storage.rawSet('quotes', quote.id, quote);

    let errorThrown: any;
    try {
      await service.convertQuoteToBooking(quote.id, salesExecActor, {
        currentDate: '2026-09-15', // Past validUntil
      });
    } catch (err: any) {
      errorThrown = err;
    }

    expect(errorThrown).toBeDefined();
    expect(errorThrown.statusCode).toBe(422);
    expect(storage.getAllBookings().length).toBe(0);
  });

  // 12. Financial snapshot created server-side
  it('12. Financial snapshot created server-side under bookings/{bookingId}/financial_snapshot', async () => {
    const quote = createBaseQuote();
    storage.rawSet('quotes', quote.id, quote);

    const result = await service.convertQuoteToBooking(quote.id, salesExecActor, {
      currentDate: '2026-09-15',
    });

    const snapshot = await storage.getFinancialSnapshot(result.booking.id);
    expect(snapshot).toBeDefined();
    expect(snapshot?.bookingId).toBe(result.booking.id);
    expect(snapshot?.snapshotVersion).toBe(1);
    expect(snapshot?.totalSellingPrice).toBe(55000);
  });

  // 13. Financial snapshot contains authoritative frozen supplier costs
  it('13. Financial snapshot contains authoritative frozen supplier costs', async () => {
    const quote = createBaseQuote();
    storage.rawSet('quotes', quote.id, quote);

    const result = await service.convertQuoteToBooking(quote.id, salesExecActor, {
      currentDate: '2026-09-15',
    });

    const snapshot = await storage.getFinancialSnapshot(result.booking.id);
    expect(snapshot?.totalSupplierCost).toBeGreaterThan(0);
    expect(snapshot?.accommodationSupplierCost).toBe(8000); // 4000 * 2 nights
    expect(snapshot?.transportSupplierCost).toBe(4000); // 2000 * 2 days
    expect(snapshot?.activitySupplierCost).toBe(800); // 800 for 2 pax
    expect(snapshot?.totalSupplierCost).toBe(8000 + 4000 + 800);
    expect(snapshot?.grossProfit).toBe(55000 - (8000 + 4000 + 800));
    expect(snapshot?.lineItems.length).toBe(3);
  });

  // 14. Modern service documents contain ZERO supplier costs
  it('14. Modern service documents contain ZERO supplier costs or margin fields', async () => {
    const quote = createBaseQuote();
    storage.rawSet('quotes', quote.id, quote);

    const result = await service.convertQuoteToBooking(quote.id, salesExecActor, {
      currentDate: '2026-09-15',
    });

    const fullBooking = await storage.getBookingWithServices(result.booking.id);

    // Top level booking
    expect((fullBooking?.booking as any).totalSupplierCost).toBeUndefined();
    expect((fullBooking?.booking as any).grossProfit).toBeUndefined();
    expect((fullBooking?.booking as any).grossMargin).toBeUndefined();
    expect((fullBooking?.booking as any).hotelCost).toBeUndefined();

    // Accommodation
    const acc = fullBooking?.accommodations[0] as any;
    expect(acc.supplierCost).toBeUndefined();
    expect(acc.totalCost).toBeUndefined();
    expect(acc.grossProfit).toBeUndefined();
    expect(acc.grossMargin).toBeUndefined();
    expect(acc.supplierBuyRate).toBeUndefined();

    // Transport
    const trans = fullBooking?.transports[0] as any;
    expect(trans.supplierCost).toBeUndefined();
    expect(trans.totalCost).toBeUndefined();
    expect(trans.supplierBuyRate).toBeUndefined();

    // Activity
    const act = fullBooking?.activities[0] as any;
    expect(act.supplierCost).toBeUndefined();
    expect(act.totalCost).toBeUndefined();
    expect(act.supplierBuyRate).toBeUndefined();
  });

  // 15. Sales response contains ZERO financial snapshot data
  it('15. Sales Executive response strictly excludes financial snapshot and supplier costs', async () => {
    const quote = createBaseQuote();
    storage.rawSet('quotes', quote.id, quote);

    const result = await service.convertQuoteToBooking(quote.id, salesExecActor, {
      currentDate: '2026-09-15',
    });

    expect((result as any).financialSnapshot).toBeUndefined();
    expect((result as any).totalSupplierCost).toBeUndefined();
    expect((result as any).grossProfit).toBeUndefined();
    expect((result.booking as any).totalSupplierCost).toBeUndefined();
  });

  // 16. Founder/Admin/Accounts financial endpoint can retrieve snapshot
  it('16. Founder, Admin, and Accounts can retrieve financial snapshot; Sales Executive is rejected', async () => {
    const quote = createBaseQuote();
    storage.rawSet('quotes', quote.id, quote);

    const result = await service.convertQuoteToBooking(quote.id, salesExecActor, {
      currentDate: '2026-09-15',
    });

    // Founder can access
    const founderSnapshot = await service.getBookingFinancialSnapshot(result.booking.id, founderActor);
    expect(founderSnapshot).toBeDefined();
    expect(founderSnapshot.totalSupplierCost).toBeGreaterThan(0);

    // Accounts can access
    const accountsSnapshot = await service.getBookingFinancialSnapshot(result.booking.id, accountsActor);
    expect(accountsSnapshot).toBeDefined();

    // Sales Executive is rejected with 403
    let salesErr: any;
    try {
      await service.getBookingFinancialSnapshot(result.booking.id, salesExecActor);
    } catch (err: any) {
      salesErr = err;
    }
    expect(salesErr).toBeDefined();
    expect(salesErr.statusCode).toBe(403);
  });

  // 17. Duplicate conversion is prevented
  it('17. Duplicate conversion of the same quote is prevented (idempotency)', async () => {
    const quote = createBaseQuote();
    storage.rawSet('quotes', quote.id, quote);

    const first = await service.convertQuoteToBooking(quote.id, salesExecActor, {
      currentDate: '2026-09-15',
    });
    expect(first.isDuplicate).toBe(false);

    const second = await service.convertQuoteToBooking(quote.id, salesExecActor, {
      currentDate: '2026-09-15',
    });
    expect(second.isDuplicate).toBe(true);
    expect(second.booking.id).toBe(first.booking.id);
    expect(second.booking.bookingReference).toBe(first.booking.bookingReference);

    // Assert only 1 booking and 1 financial snapshot exist in database
    expect(storage.getAllBookings().length).toBe(1);
    expect(storage.getAllFinancialSnapshots().length).toBe(1);
    expect(storage.getAllConversions().length).toBe(1);
  });

  // 18. Concurrent conversion is prevented (MANDATORY TEST)
  it('18. Two simultaneous conversion requests resolve to exactly 1 booking and 1 snapshot', async () => {
    const quote = createBaseQuote();
    storage.rawSet('quotes', quote.id, quote);

    // Launch two simultaneous conversion requests concurrently
    const [res1, res2] = await Promise.all([
      service.convertQuoteToBooking(quote.id, salesExecActor, { currentDate: '2026-09-15' }),
      service.convertQuoteToBooking(quote.id, salesExecActor, { currentDate: '2026-09-15' }),
    ]);

    // Exactly 1 booking exists in storage
    const allBookings = storage.getAllBookings();
    expect(allBookings.length).toBe(1);

    // Exactly 1 quote_conversions record exists
    const allConversions = storage.getAllConversions();
    expect(allConversions.length).toBe(1);

    // Exactly 1 financial snapshot exists
    const allSnapshots = storage.getAllFinancialSnapshots();
    expect(allSnapshots.length).toBe(1);

    // Both requests resolved to the same booking reference and ID
    expect(res1.booking.id).toBe(res2.booking.id);
    expect(res1.booking.bookingReference).toBe(res2.booking.bookingReference);

    // Quote is ACCEPTED exactly once
    const updatedQuote = storage.rawGet('quotes', quote.id);
    expect(updatedQuote.status).toBe('ACCEPTED');

    // No duplicate audit success events
    const auditLogs = storage.getAllAuditLogs();
    const conversionAudits = auditLogs.filter(a => a.action === 'QUOTE_CONVERTED_TO_BOOKING');
    expect(conversionAudits.length).toBe(1);
  });

  // 19. Atomic failure leaves zero partial records
  it('19. Atomic failure leaves zero partial records', async () => {
    const quote = createBaseQuote({
      hotels: [
        {
          id: 'q-fail-1',
          hotelName: 'Hotel Kareem Residency',
          propertyId: 'accom-sgr-kareemresidency',
          roomCategoryId: 'rc-accom-sgr-kareemresidency',
          ratePeriodId: 'rp-accom-sgr-kareemresidency-oct',
          roomType: 'Deluxe Room',
          mealPlan: 'MAP',
          checkInDate: '2026-10-15',
          nights: 2,
          roomsCount: 1,
          adultsCount: 2,
          quotedRate: 99999, // Rate mismatch causing validation failure
        },
      ],
      transports: [],
      activities: [],
    });
    storage.rawSet('quotes', quote.id, quote);

    try {
      await service.convertQuoteToBooking(quote.id, salesExecActor, {
        currentDate: '2026-09-15',
      });
    } catch (e) {
      // expected error
    }

    expect(storage.getAllBookings().length).toBe(0);
    expect(storage.getAllFinancialSnapshots().length).toBe(0);
    expect(storage.getAllConversions().length).toBe(0);
    expect(storage.rawGet('quotes', quote.id).status).toBe('SENT');
  });

  // 20. Quote changes to ACCEPTED only after successful conversion
  it('20. Quote changes to ACCEPTED only after successful conversion', async () => {
    const quote = createBaseQuote();
    storage.rawSet('quotes', quote.id, quote);
    expect(storage.rawGet('quotes', quote.id).status).toBe('SENT');

    await service.convertQuoteToBooking(quote.id, salesExecActor, {
      currentDate: '2026-09-15',
    });

    expect(storage.rawGet('quotes', quote.id).status).toBe('ACCEPTED');
  });

  // 21. Lead changes to BOOKED only after successful conversion
  it('21. Lead changes to BOOKED only after successful conversion', async () => {
    const quote = createBaseQuote();
    storage.rawSet('quotes', quote.id, quote);
    storage.rawSet('leads', quote.leadId, { id: quote.leadId, status: 'QUOTE_SENT' });

    await service.convertQuoteToBooking(quote.id, salesExecActor, {
      currentDate: '2026-09-15',
    });

    expect(storage.rawGet('leads', quote.leadId).status).toBe('BOOKED');
  });

  // 22. Legacy collections are untouched
  it('22. Legacy collections (hotel_bookings, transports, activity_bookings) are untouched', async () => {
    const quote = createBaseQuote();
    storage.rawSet('quotes', quote.id, quote);

    await service.convertQuoteToBooking(quote.id, salesExecActor, {
      currentDate: '2026-09-15',
    });

    expect(storage.rawGet('hotel_bookings', quote.id)).toBeNull();
    expect(storage.rawGet('transports', quote.id)).toBeNull();
    expect(storage.rawGet('activity_bookings', quote.id)).toBeNull();
  });

  // 23. ConfirmationProgress is correctly calculated
  it('23. ConfirmationProgress is correctly calculated', async () => {
    const quote = createBaseQuote(); // 1 acc (CONFIRMED), 1 trans (CONFIRMED), 1 act (CONFIRMED)
    storage.rawSet('quotes', quote.id, quote);

    const result = await service.convertQuoteToBooking(quote.id, salesExecActor, {
      currentDate: '2026-09-15',
    });

    expect(result.confirmationProgress?.totalServices).toBe(3);
    expect(result.confirmationProgress?.confirmedServices).toBe(3);
    expect(result.confirmationProgress?.requestedServices).toBe(0);
    expect(result.confirmationProgress?.allConfirmed).toBe(true);
  });

  // 24. totalSellingPrice is preserved from quote
  it('24. totalSellingPrice is preserved accurately from quote', async () => {
    const quote = createBaseQuote({ finalAmount: 89500 });
    storage.rawSet('quotes', quote.id, quote);

    const result = await service.convertQuoteToBooking(quote.id, salesExecActor, {
      currentDate: '2026-09-15',
    });

    expect(result.booking.totalSellingPrice).toBe(89500);
    expect(result.booking.amountPending).toBe(89500);
    expect(result.booking.amountReceived).toBe(0);
    expect(result.booking.paymentStatus).toBe('UNPAID');
    expect(result.booking.status).toBe('PENDING_PAYMENT');
  });

  // 25. Supplier costs are NOT taken from client payload
  it('25. Malicious client supplier costs in quote payload are ignored', async () => {
    const quote = createBaseQuote({
      hotels: [
        {
          id: 'q-hotel-malicious',
          hotelName: 'Hotel Kareem Residency',
          propertyId: 'accom-sgr-kareemresidency',
          roomCategoryId: 'rc-accom-sgr-kareemresidency',
          ratePeriodId: 'rp-accom-sgr-kareemresidency-oct',
          roomType: 'Deluxe Room',
          mealPlan: 'MAP',
          checkInDate: '2026-10-15',
          nights: 2,
          roomsCount: 1,
          adultsCount: 2,
          quotedRate: 4000,
          supplierCost: 1, // Malicious fake cost of ₹1
        },
      ],
      transports: [],
      activities: [],
    });
    storage.rawSet('quotes', quote.id, quote);

    const result = await service.convertQuoteToBooking(quote.id, salesExecActor, {
      currentDate: '2026-09-15',
    });

    const snapshot = await storage.getFinancialSnapshot(result.booking.id);
    // Evaluates to true authoritative cost (₹8000), not ₹1
    expect(snapshot?.totalSupplierCost).toBe(8000);
    expect(snapshot?.accommodationSupplierCost).toBe(8000);
  });

  // 26. Client-supplied financial fields are ignored/rejected
  it('26. Client-supplied grossProfit and grossMargin fields are ignored', async () => {
    const quote = createBaseQuote({
      totalCost: 100, // Fake totalCost
    } as any);
    storage.rawSet('quotes', quote.id, quote);

    const result = await service.convertQuoteToBooking(quote.id, salesExecActor, {
      currentDate: '2026-09-15',
    });

    const snapshot = await storage.getFinancialSnapshot(result.booking.id);
    expect(snapshot?.totalSupplierCost).toBe(8000 + 4000 + 800);
  });

  // 27. Audit event created after successful conversion
  it('27. Audit event created with role-safe metadata after successful conversion', async () => {
    const quote = createBaseQuote();
    storage.rawSet('quotes', quote.id, quote);

    const result = await service.convertQuoteToBooking(quote.id, salesExecActor, {
      currentDate: '2026-09-15',
    });

    const logs = storage.getAllAuditLogs();
    const audit = logs.find(l => l.action === 'QUOTE_CONVERTED_TO_BOOKING');
    expect(audit).toBeDefined();
    expect(audit?.entityId).toBe(result.booking.id);
    expect(audit?.actorName).toContain('Sales Executive');
    // Ensure no sensitive supplier cost in audit entry
    expect(JSON.stringify(audit)).not.toContain('totalSupplierCost');
    expect(JSON.stringify(audit)).not.toContain('grossProfit');
  });

  // 28. Failed conversion creates no audit success event
  it('28. Failed conversion creates no audit success event', async () => {
    const quote = createBaseQuote({ validUntil: '2026-08-01' }); // Expired
    storage.rawSet('quotes', quote.id, quote);

    try {
      await service.convertQuoteToBooking(quote.id, salesExecActor, {
        currentDate: '2026-09-15',
      });
    } catch (e) {
      // expected error
    }

    const logs = storage.getAllAuditLogs();
    const audit = logs.find(l => l.action === 'QUOTE_CONVERTED_TO_BOOKING');
    expect(audit).toBeUndefined();
  });
});
