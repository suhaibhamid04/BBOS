import { describe, it, expect } from 'bun:test';
import { Quote } from '../../src/types/index';
import {
  QuoteValidationService,
  DefaultInventoryDataProvider,
} from '../../src/services/quoteValidation/index';
import {
  DEMO_ACCOMMODATION_PROPERTIES,
  DEMO_ROOM_CATEGORIES,
  DEMO_RATE_PERIODS,
} from '../../src/services/accommodationDemoData';
import {
  DEMO_VEHICLE_CATEGORIES,
  DEMO_TRANSPORT_RATE_PERIODS,
} from '../../src/services/transportDemoData';
import {
  DEMO_ACTIVITY_MASTERS,
  DEMO_ACTIVITY_RATE_PERIODS,
} from '../../src/services/activityDemoData';

describe('BBOS Phase 2B-5 Stage 3 — Pre-Conversion Quote Validation Engine', () => {
  const service = new QuoteValidationService();

  const createBaseQuote = (overrides?: Partial<Quote>): Quote => ({
    id: 'quote-test-01',
    leadId: 'lead-test-01',
    customerId: 'cust-test-01',
    customerName: 'Rohit Sharma',
    destination: 'Kashmir',
    travelerCount: 2,
    totalAmount: 55000,
    discountAmount: 0,
    finalAmount: 55000,
    status: 'ACCEPTED',
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

  // =========================================================================
  // 1. VALID QUOTE -> AVAILABLE
  // =========================================================================
  it('1. Valid quote with all available services returns AVAILABLE', async () => {
    const quote = createBaseQuote();
    const res = await service.validateQuote(quote, { currentDate: '2026-09-15' });

    expect(res.isValid).toBe(true);
    expect(res.canConvert).toBe(true);
    expect(res.overallOutcome).toBe('AVAILABLE');
    expect(res.totalServices).toBe(3);
    expect(res.availableServices).toBe(3);
    expect(res.unavailableServices).toBe(0);
    expect(res.errors.length).toBe(0);
    expect(res.authoritativeTotalSupplierCost).toBe(12800); // 8000 + 4000 + 800
  });

  // =========================================================================
  // 2. VALID QUOTE -> NEEDS_CONFIRMATION
  // =========================================================================
  it('2. Valid quote with a service requiring confirmation returns NEEDS_CONFIRMATION', async () => {
    const customProps = DEMO_ACCOMMODATION_PROPERTIES.map(p =>
      p.id === 'accom-sgr-kareemresidency'
        ? { ...p, availabilityStatus: 'REQUESTED' as const }
        : p
    );
    const customProvider = new DefaultInventoryDataProvider({ properties: customProps });
    const customService = new QuoteValidationService(customProvider);

    const quote = createBaseQuote();
    const res = await customService.validateQuote(quote, { currentDate: '2026-09-15' });

    expect(res.isValid).toBe(true);
    expect(res.canConvert).toBe(true);
    expect(res.overallOutcome).toBe('NEEDS_CONFIRMATION');
    expect(res.needsConfirmationServices).toBe(1);
    expect(res.availableServices).toBe(2);
  });

  // =========================================================================
  // 3. VALID QUOTE -> ON_REQUEST
  // =========================================================================
  it('3. Valid quote with an ON_REQUEST service returns ON_REQUEST', async () => {
    const customProps = DEMO_ACCOMMODATION_PROPERTIES.map(p =>
      p.id === 'accom-sgr-kareemresidency'
        ? { ...p, availabilityStatus: 'ON_HOLD' as const }
        : p
    );
    const customProvider = new DefaultInventoryDataProvider({ properties: customProps });
    const customService = new QuoteValidationService(customProvider);

    const quote = createBaseQuote();
    const res = await customService.validateQuote(quote, { currentDate: '2026-09-15' });

    expect(res.isValid).toBe(true);
    expect(res.canConvert).toBe(true);
    expect(res.overallOutcome).toBe('ON_REQUEST');
    expect(res.onRequestServices).toBe(1);
  });

  // =========================================================================
  // 4. EXPIRED QUOTE
  // =========================================================================
  it('4. Expired quote returns RATE_CHANGED / cannot convert', async () => {
    const quote = createBaseQuote({ validUntil: '2026-09-01' });
    const res = await service.validateQuote(quote, { currentDate: '2026-09-15' });

    expect(res.canConvert).toBe(false);
    expect(res.overallOutcome).toBe('RATE_CHANGED');
    expect(res.errors.some(e => e.includes('validity expired'))).toBe(true);
  });

  // =========================================================================
  // 5. EXPIRED RATE PERIOD
  // =========================================================================
  it('5. Quoted date outside rate period validity returns RATE_CHANGED', async () => {
    // September rate period used for November travel
    const quote = createBaseQuote({
      hotels: [
        {
          id: 'q-hotel-1',
          hotelName: 'Hotel Kareem Residency',
          propertyId: 'accom-sgr-kareemresidency',
          roomCategoryId: 'rc-accom-sgr-kareemresidency',
          ratePeriodId: 'rp-accom-sgr-kareemresidency-sep', // Valid only in Sep 2026
          roomType: 'Deluxe Room',
          mealPlan: 'MAP',
          checkInDate: '2026-11-15', // November travel date
          nights: 2,
          roomsCount: 1,
          adultsCount: 2,
          quotedRate: 3500,
          supplierCost: 7000,
        },
      ],
      transports: [],
      activities: [],
    });

    const res = await service.validateQuote(quote, { currentDate: '2026-09-15' });
    expect(res.canConvert).toBe(false);
    expect(res.overallOutcome).toBe('RATE_CHANGED');
    expect(res.rateChangedServices).toBe(1);
    expect(res.discrepancies.length).toBeGreaterThan(0);
    expect(res.discrepancies[0].reason).toContain('outside rate validity window');
  });

  // =========================================================================
  // 6. INACTIVE RATE PERIOD
  // =========================================================================
  it('6. Inactive or archived rate period returns RATE_CHANGED', async () => {
    const customRates = DEMO_RATE_PERIODS.map(r =>
      r.id === 'rp-accom-sgr-kareemresidency-oct'
        ? { ...r, status: 'ARCHIVED' as const }
        : r
    );
    const customProvider = new DefaultInventoryDataProvider({ ratePeriods: customRates });
    const customService = new QuoteValidationService(customProvider);

    const quote = createBaseQuote();
    const res = await customService.validateQuote(quote, { currentDate: '2026-09-15' });

    expect(res.canConvert).toBe(false);
    expect(res.overallOutcome).toBe('RATE_CHANGED');
    expect(res.discrepancies[0].reason).toContain('ARCHIVED');
  });

  // =========================================================================
  // 7. RATE CHANGED AFTER QUOTE
  // =========================================================================
  it('7. Rate altered in inventory returns RATE_CHANGED with exact discrepancy', async () => {
    // Quote has quotedRate 3500, but master rate for October is 4000
    const quote = createBaseQuote({
      hotels: [
        {
          id: 'q-hotel-1',
          hotelName: 'Hotel Kareem Residency',
          propertyId: 'accom-sgr-kareemresidency',
          roomCategoryId: 'rc-accom-sgr-kareemresidency',
          ratePeriodId: 'rp-accom-sgr-kareemresidency-oct', // Master rate is 4000
          roomType: 'Deluxe Room',
          mealPlan: 'MAP',
          checkInDate: '2026-10-15',
          nights: 2,
          roomsCount: 1,
          adultsCount: 2,
          quotedRate: 3500, // Discrepancy!
          supplierCost: 7000,
        },
      ],
      transports: [],
      activities: [],
    });

    const res = await service.validateQuote(quote, { currentDate: '2026-09-15' });

    expect(res.canConvert).toBe(false);
    expect(res.overallOutcome).toBe('RATE_CHANGED');
    expect(res.discrepancies.length).toBe(1);
    expect(res.discrepancies[0].quotedRate).toBe(3500);
    expect(res.discrepancies[0].currentRate).toBe(4000);
    expect(res.discrepancies[0].reason).toContain('differs from authoritative rate');
  });

  // =========================================================================
  // 8. MISSING RATE REFERENCE
  // =========================================================================
  it('8. Service with non-existent ratePeriodId returns MISSING_RATE_CONFIGURATION', async () => {
    const quote = createBaseQuote({
      hotels: [
        {
          id: 'q-hotel-1',
          hotelName: 'Hotel Kareem Residency',
          propertyId: 'accom-sgr-kareemresidency',
          roomCategoryId: 'rc-accom-sgr-kareemresidency',
          ratePeriodId: 'rp-non-existent-999',
          roomType: 'Deluxe Room',
          mealPlan: 'MAP',
          checkInDate: '2026-10-15',
          nights: 2,
          roomsCount: 1,
          adultsCount: 2,
        },
      ],
      transports: [],
      activities: [],
    });

    const res = await service.validateQuote(quote, { currentDate: '2026-09-15' });
    expect(res.canConvert).toBe(false);
    expect(res.overallOutcome).toBe('MISSING_RATE_CONFIGURATION');
    expect(res.missingRateServices).toBe(1);
  });

  // =========================================================================
  // 9. MISSING SUPPLIER COST (ZERO-COST PROTECTION)
  // =========================================================================
  it('9. Zero supplier cost without FOC fails with MISSING_RATE_CONFIGURATION', async () => {
    const customRates = DEMO_RATE_PERIODS.map(r =>
      r.id === 'rp-accom-sgr-kareemresidency-oct'
        ? { ...r, baseRate: 0 } // Zero cost bug/error
        : r
    );
    const customProvider = new DefaultInventoryDataProvider({ ratePeriods: customRates });
    const customService = new QuoteValidationService(customProvider);

    const quote = createBaseQuote();
    const res = await customService.validateQuote(quote, { currentDate: '2026-09-15' });

    expect(res.canConvert).toBe(false);
    expect(res.overallOutcome).toBe('MISSING_RATE_CONFIGURATION');
    expect(res.errors.some(e => e.includes('zero or negative cost without FOC'))).toBe(true);
  });

  // =========================================================================
  // 10. EXPLICIT FOC SERVICE
  // =========================================================================
  it('10. Explicit FOC service passes zero-cost validation successfully', async () => {
    const quote = createBaseQuote({
      activities: [
        {
          id: 'q-act-foc',
          name: 'Complimentary Sunset Shikara Ride',
          activityMasterId: 'act_shikara_ride',
          activityRatePeriodId: 'arp_shikara_standard',
          serviceDate: '2026-10-16',
          pax: 2,
          rate: 0,
          supplierCost: 0,
          isFoc: true,
          focReason: 'Complimentary honeymoon inclusion',
        },
      ],
    });

    const res = await service.validateQuote(quote, { currentDate: '2026-09-15' });
    const focAct = res.services.find(s => s.serviceId === 'q-act-foc');

    expect(focAct).toBeDefined();
    expect(focAct?.isFoc).toBe(true);
    expect(focAct?.authoritativeSupplierCost).toBe(0);
    expect(focAct?.outcome).toBe('AVAILABLE');
  });

  // =========================================================================
  // 11. ACCOMMODATION BLACKOUT
  // =========================================================================
  it('11. Accommodation blackout returns SERVICE_UNAVAILABLE', async () => {
    const customProps = DEMO_ACCOMMODATION_PROPERTIES.map(p =>
      p.id === 'accom-sgr-kareemresidency'
        ? { ...p, internalNotes: 'Blackout: 2026-10-15 to 2026-10-18 for private VIP delegation' }
        : p
    );
    const customProvider = new DefaultInventoryDataProvider({ properties: customProps });
    const customService = new QuoteValidationService(customProvider);

    const quote = createBaseQuote();
    const res = await customService.validateQuote(quote, { currentDate: '2026-09-15' });

    expect(res.canConvert).toBe(false);
    expect(res.overallOutcome).toBe('SERVICE_UNAVAILABLE');
    expect(res.errors.some(e => e.includes('blacked out'))).toBe(true);
  });

  // =========================================================================
  // 12. TRANSPORT UNAVAILABLE
  // =========================================================================
  it('12. Transport with UNAVAILABLE rate period status returns SERVICE_UNAVAILABLE', async () => {
    const customTransRates = DEMO_TRANSPORT_RATE_PERIODS.map(r =>
      r.id === 'trp_innova_kashmir_season'
        ? { ...r, availabilityStatus: 'UNAVAILABLE' as const }
        : r
    );
    const customProvider = new DefaultInventoryDataProvider({ transportRatePeriods: customTransRates });
    const customService = new QuoteValidationService(customProvider);

    const quote = createBaseQuote();
    const res = await customService.validateQuote(quote, { currentDate: '2026-09-15' });

    expect(res.canConvert).toBe(false);
    expect(res.overallOutcome).toBe('SERVICE_UNAVAILABLE');
    expect(res.unavailableServices).toBe(1);
  });

  // =========================================================================
  // 13. ACTIVITY UNAVAILABLE (OPERATING DAYS MISMATCH)
  // =========================================================================
  it('13. Activity booked on a non-operating day returns SERVICE_UNAVAILABLE', async () => {
    const customActivities = DEMO_ACTIVITY_MASTERS.map(a =>
      a.id === 'act_shikara_ride'
        ? { ...a, operatingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] } // Closed on weekends
        : a
    );
    const customProvider = new DefaultInventoryDataProvider({ activityMasters: customActivities });
    const customService = new QuoteValidationService(customProvider);

    // 2026-10-18 is Sunday
    const quote = createBaseQuote({
      activities: [
        {
          id: 'q-act-1',
          name: 'Private Shikara Ride on Dal Lake',
          activityMasterId: 'act_shikara_ride',
          activityRatePeriodId: 'arp_shikara_standard',
          serviceDate: '2026-10-18', // Sunday!
          pax: 2,
          rate: 2000,
          quotedRate: 800,
          supplierCost: 800,
        },
      ],
    });

    const res = await customService.validateQuote(quote, { currentDate: '2026-09-15' });
    expect(res.canConvert).toBe(false);
    expect(res.overallOutcome).toBe('SERVICE_UNAVAILABLE');
    expect(res.errors.some(e => e.includes('does not operate on Sun'))).toBe(true);
  });

  // =========================================================================
  // 14. INVALID ROOM/RATE COMBINATION
  // =========================================================================
  it('14. Rate period belonging to a different room category returns mismatch error', async () => {
    // Pass Limewood rate for Kareem Residency room category
    const quote = createBaseQuote({
      hotels: [
        {
          id: 'q-hotel-1',
          hotelName: 'Hotel Kareem Residency',
          propertyId: 'accom-sgr-kareemresidency',
          roomCategoryId: 'rc-accom-sgr-kareemresidency',
          ratePeriodId: 'rate-sgr-limewood', // Mismatch!
          roomType: 'Deluxe Room',
          mealPlan: 'MAP',
          checkInDate: '2026-10-15',
          nights: 2,
          roomsCount: 1,
          adultsCount: 2,
        },
      ],
      transports: [],
      activities: [],
    });

    const res = await service.validateQuote(quote, { currentDate: '2026-09-15' });
    expect(res.canConvert).toBe(false);
    expect(res.rateChangedServices).toBe(1);
    expect(res.errors.some(e => e.includes('does not match quoted room category'))).toBe(true);
  });

  // =========================================================================
  // 15. INVALID TRANSPORT ROUTE/VEHICLE COMBINATION
  // =========================================================================
  it('15. Transport rate period with vehicle category mismatch returns error', async () => {
    // Quote has vc_sedan, but rate is for Innova
    const quote = createBaseQuote({
      hotels: [],
      transports: [
        {
          id: 'q-trans-1',
          vehicleType: 'Sedan AC',
          vehicleCategoryId: 'vc_sedan',
          ratePeriodId: 'trp_innova_kashmir_season', // Mismatch!
          route: 'Srinagar Airport Transfer',
          serviceDate: '2026-10-15',
          days: 1,
          passengerCount: 2,
          rate: 2500,
        },
      ],
      activities: [],
    });

    const res = await service.validateQuote(quote, { currentDate: '2026-09-15' });
    expect(res.canConvert).toBe(false);
    expect(res.overallOutcome).toBe('SERVICE_UNAVAILABLE');
    expect(res.errors.some(e => e.includes('does not match quoted vehicle'))).toBe(true);
  });

  // =========================================================================
  // 16. INVALID ACTIVITY PRICING CONFIGURATION (PARTICIPANT OVERFLOW)
  // =========================================================================
  it('16. Activity participant count exceeding maxParticipants returns SERVICE_UNAVAILABLE', async () => {
    // maxParticipants for act_shikara_ride is 4
    const quote = createBaseQuote({
      hotels: [],
      transports: [],
      activities: [
        {
          id: 'q-act-overflow',
          name: 'Private Shikara Ride on Dal Lake',
          activityMasterId: 'act_shikara_ride',
          activityRatePeriodId: 'arp_shikara_standard',
          serviceDate: '2026-10-16',
          pax: 10, // Exceeds maxParticipants = 4
          rate: 5000,
        },
      ],
    });

    const res = await service.validateQuote(quote, { currentDate: '2026-09-15' });
    expect(res.canConvert).toBe(false);
    expect(res.overallOutcome).toBe('SERVICE_UNAVAILABLE');
    expect(res.errors.some(e => e.includes('exceeds maximum capacity'))).toBe(true);
  });

  // =========================================================================
  // 17. MULTIPLE SERVICES WHERE ONE FAILS
  // =========================================================================
  it('17. Multiple services where one is UNAVAILABLE blocks conversion', async () => {
    const customTransRates = DEMO_TRANSPORT_RATE_PERIODS.map(r =>
      r.id === 'trp_innova_kashmir_season'
        ? { ...r, availabilityStatus: 'UNAVAILABLE' as const }
        : r
    );
    const customProvider = new DefaultInventoryDataProvider({ transportRatePeriods: customTransRates });
    const customService = new QuoteValidationService(customProvider);

    // Hotel and Activity are Available, but Transport is Unavailable
    const quote = createBaseQuote();
    const res = await customService.validateQuote(quote, { currentDate: '2026-09-15' });

    expect(res.canConvert).toBe(false);
    expect(res.overallOutcome).toBe('SERVICE_UNAVAILABLE');
    expect(res.availableServices).toBe(2);
    expect(res.unavailableServices).toBe(1);
  });

  // =========================================================================
  // 18. MULTIPLE SERVICES WITH MIXED AVAILABILITY (AVAILABLE + NEEDS_CONFIRMATION)
  // =========================================================================
  it('18. Mixed available and confirmation-needed services returns NEEDS_CONFIRMATION', async () => {
    const customProps = DEMO_ACCOMMODATION_PROPERTIES.map(p =>
      p.id === 'accom-sgr-kareemresidency'
        ? { ...p, availabilityStatus: 'REQUESTED' as const }
        : p
    );
    const customProvider = new DefaultInventoryDataProvider({ properties: customProps });
    const customService = new QuoteValidationService(customProvider);

    const quote = createBaseQuote();
    const res = await customService.validateQuote(quote, { currentDate: '2026-09-15' });

    expect(res.canConvert).toBe(true);
    expect(res.overallOutcome).toBe('NEEDS_CONFIRMATION');
    expect(res.needsConfirmationServices).toBe(1);
    expect(res.availableServices).toBe(2);
  });

  // =========================================================================
  // 19. SALES-SAFE VALIDATION RESPONSE
  // =========================================================================
  it('19. Sales Executive response strictly strips supplier costs and margins', async () => {
    const quote = createBaseQuote();
    const res = await service.validateQuote(quote, {
      currentDate: '2026-09-15',
      userRole: 'Sales Executive',
    });

    expect(res.overallOutcome).toBe('AVAILABLE');
    expect(res.canConvert).toBe(true);
    expect(res.totalSellingPrice).toBe(55000);

    // Critical Invariant: Protected fields are completely undefined for Sales Executive
    expect(res.authoritativeTotalSupplierCost).toBeUndefined();
    expect(res.quotedTotalSupplierCost).toBeUndefined();
    expect(res.estimatedGrossProfit).toBeUndefined();
    expect(res.estimatedGrossMargin).toBeUndefined();

    for (const serviceItem of res.services) {
      expect(serviceItem.authoritativeSupplierCost).toBeUndefined();
      expect(serviceItem.quotedSupplierCost).toBeUndefined();
    }
  });

  it('19b. Reservations response keeps supplier costs but strips package profit and margin', async () => {
    const quote = createBaseQuote();
    const res = await service.validateQuote(quote, {
      currentDate: '2026-09-15',
      userRole: 'Reservations',
    });

    expect(res.authoritativeTotalSupplierCost).toBe(12800);
    expect(res.quotedTotalSupplierCost).toBeDefined();
    expect(res.services.every(item => item.authoritativeSupplierCost !== undefined)).toBe(true);
    expect(res.estimatedGrossProfit).toBeUndefined();
    expect(res.estimatedGrossMargin).toBeUndefined();
  });

  it('19c. Operations response receives neither supplier costs nor profit metrics', async () => {
    const quote = createBaseQuote();
    const res = await service.validateQuote(quote, {
      currentDate: '2026-09-15',
      userRole: 'Operations',
    });

    expect(res.authoritativeTotalSupplierCost).toBeUndefined();
    expect(res.quotedTotalSupplierCost).toBeUndefined();
    expect(res.estimatedGrossProfit).toBeUndefined();
    expect(res.estimatedGrossMargin).toBeUndefined();
  });

  // =========================================================================
  // 20. PROTECTED SUPPLIER COST NEVER RETURNED TO SALES IN DISCREPANCIES
  // =========================================================================
  it('20. Sales Executive never receives supplier buy rates even during rate discrepancies', async () => {
    const quote = createBaseQuote({
      hotels: [
        {
          id: 'q-hotel-1',
          hotelName: 'Hotel Kareem Residency',
          propertyId: 'accom-sgr-kareemresidency',
          roomCategoryId: 'rc-accom-sgr-kareemresidency',
          ratePeriodId: 'rp-accom-sgr-kareemresidency-oct', // Master rate is 4000
          roomType: 'Deluxe Room',
          mealPlan: 'MAP',
          checkInDate: '2026-10-15',
          nights: 2,
          roomsCount: 1,
          adultsCount: 2,
          quotedRate: 3500, // Discrepancy
          supplierCost: 7000,
        },
      ],
      transports: [],
      activities: [],
    });

    const res = await service.validateQuote(quote, {
      currentDate: '2026-09-15',
      userRole: 'Sales Executive',
    });

    expect(res.overallOutcome).toBe('RATE_CHANGED');
    expect(res.discrepancies.length).toBe(1);

    // Protected buy rates MUST be masked
    expect(res.discrepancies[0].quotedRate).toBeUndefined();
    expect(res.discrepancies[0].currentRate).toBeUndefined();
    expect(res.discrepancies[0].reason).toContain('Rate has changed in master inventory');

    // Founder / Admin retains full diagnostic numbers
    const founderRes = await service.validateQuote(quote, {
      currentDate: '2026-09-15',
      userRole: 'Founder',
    });

    expect(founderRes.discrepancies[0].quotedRate).toBe(3500);
    expect(founderRes.discrepancies[0].currentRate).toBe(4000);
    expect(founderRes.authoritativeTotalSupplierCost).toBe(8000);
  });

  // =========================================================================
  // 21. DETERMINISTIC AND ZERO MUTATION GUARANTEE
  // =========================================================================
  it('21. Validation is deterministic and does not mutate quote or provider data', async () => {
    const quote = createBaseQuote();
    const originalQuoteString = JSON.stringify(quote);

    const res1 = await service.validateQuote(quote, { currentDate: '2026-09-15' });
    const res2 = await service.validateQuote(quote, { currentDate: '2026-09-15' });

    // Deterministic results
    expect(res1.overallOutcome).toBe(res2.overallOutcome);
    expect(res1.authoritativeTotalSupplierCost).toBe(res2.authoritativeTotalSupplierCost);

    // Zero mutation
    expect(JSON.stringify(quote)).toBe(originalQuoteString);
  });
});
