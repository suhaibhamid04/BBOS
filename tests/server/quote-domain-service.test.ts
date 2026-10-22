import { beforeEach, describe, expect, it } from 'bun:test';
import { InMemoryConversionStorageProvider } from '../../src/services/conversion/conversionStorageProvider';
import { QuoteService, type QuoteMutationActor } from '../../server/services/quoteService';
import { QuoteConversionService } from '../../server/services/quoteConversionService';
import { DefaultInventoryDataProvider } from '../../src/services/quoteValidation/inventoryProvider';
import { authorizeResource } from '../../server/authorization/policyEngine';
import { quoteResourceContext } from '../../server/authorization/resourceContext';
import { buildQuoteConversionDto, buildQuoteDto } from '../../server/authorization/quoteDto';
import { LowMarginQuoteApprovalService } from '../../server/services/approvalInboxService';
import { BOOKING_BRIDGE_POLICY_VERSION, STANDARD_CUSTOMER_POLICY_PRESET } from '../../src/policies/bookingBridgePolicy';

describe('Stage D1 server-authoritative Quote mutations', () => {
  let storage: InMemoryConversionStorageProvider;
  let service: QuoteService;

  const executive: QuoteMutationActor = {
    firebaseUid: 'firebase-sales-01',
    employeeId: 'emp-sales-01',
    role: 'Sales Executive',
    active: true,
    salesTeamId: 'sales-team-01',
    name: 'Executive One',
  };

  const manager: QuoteMutationActor = {
    firebaseUid: 'firebase-manager-01',
    employeeId: 'emp-manager-01',
    role: 'Sales Manager',
    active: true,
    salesTeamId: 'sales-team-01',
    name: 'Manager One',
  };

  const baseTrip = {
    id: 'trip-01',
    customerId: 'customer-01',
    leadId: 'lead-01',
    assignedSalesEmployeeId: executive.employeeId,
    salesTeamId: 'sales-team-01',
    status: 'DRAFT',
    costingStatus: 'CALCULATED',
    costingRevision: 0,
    costingCalculatedRevision: 0,
    totalSupplierCost: 40_000,
    totalSellingPrice: 80_000,
    updatedAt: '2026-09-20T10:00:00.000Z',
  };

  const createInput = () => ({
    leadId: 'lead-01',
    customerId: 'customer-01',
    customerName: 'Test Customer',
    destination: 'Kashmir',
    tripId: 'trip-01',
    travelerCount: 2,
    totalAmount: 100_000,
    discountAmount: 5_000,
    validUntil: '2026-10-31',
    hotels: [],
    transports: [],
    activities: [],
  });

  beforeEach(() => {
    storage = new InMemoryConversionStorageProvider({ trips: [baseTrip] });
    storage.rawSet('customers', 'customer-01', { id: 'customer-01', name: 'Test Customer' });
    storage.rawSet('leads', 'lead-01', {
      id: 'lead-01',
      customerId: 'customer-01',
      assignedEmployeeId: executive.employeeId,
    });
    storage.rawSet('employees', 'employee-document-not-business-id', {
      id: 'employee-document-not-business-id',
      employeeId: executive.employeeId,
      role: executive.role,
      active: true,
      name: executive.name,
      salesTeamId: executive.salesTeamId,
    });
    storage.rawSet('itinerary_days', 'day-trip-01', {
      id: 'day-trip-01', tripId: 'trip-01', dayNumber: 1, date: '2026-10-15',
      items: [{
        id: 'trip-hotel-01', type: 'HOTEL', title: 'Hotel Kareem Residency', description: 'Primary stay',
        metadata: {
          inventoryType: 'ACCOMMODATION', propertyId: 'accom-sgr-kareemresidency',
          propertyName: 'Hotel Kareem Residency', roomCategoryId: 'rc-accom-sgr-kareemresidency',
          roomCategoryName: 'Deluxe Room', rateId: 'rp-accom-sgr-kareemresidency-oct',
          mealPlan: 'MAP', checkInDate: '2026-10-15', checkOutDate: '2026-10-17',
          nights: 2, rooms: 1, adults: 2, children: 0,
        },
      }, {
        id: 'trip-transport-01', type: 'TRANSPORT', title: 'Innova Crysta AC', description: 'Airport and sightseeing',
        metadata: {
          inventoryType: 'TRANSPORT', vehicleCategoryId: 'vc_innova_crysta', vehicleName: 'Innova Crysta AC',
          rateId: 'trp_innova_kashmir_season', serviceType: 'MULTI_DAY_JOURNEY', pricingUnit: 'PER_DAY',
          routeName: 'Srinagar Airport Transfer', startDate: '2026-10-15', vehicleDays: 2,
        },
      }, {
        id: 'trip-activity-01', type: 'ACTIVITY', title: 'Private Shikara Ride', description: 'Dal Lake experience',
        metadata: {
          inventoryType: 'ACTIVITY', activityId: 'act_shikara_ride', activityName: 'Private Shikara Ride on Dal Lake',
          rateId: 'arp_shikara_standard', pricingModel: 'PER_PERSON', date: '2026-10-16', adults: 2, children: 0,
        },
      }],
    });
    storage.rawSet('accommodation_properties', 'backup-property', { id: 'backup-property', name: 'Backup Palace', status: 'ACTIVE' });
    storage.rawSet('room_categories', 'backup-room', { id: 'backup-room', propertyId: 'backup-property', name: 'Lake Room', active: true });
    storage.rawSet('rate_periods', 'backup-rate', {
      id: 'backup-rate', propertyId: 'backup-property', roomCategoryId: 'backup-room', mealPlan: 'MAP',
      validFrom: '2026-10-01', validTo: '2026-10-31', status: 'ACTIVE', baseRate: 4500,
    });
    service = new QuoteService(storage);
  });

  it('assigns canonical owner/team and calculates financials from authoritative Trip cost', async () => {
    const quote = await service.createQuote(createInput(), executive);

    expect(quote.salesEmployeeId).toBe(executive.employeeId);
    expect(quote.salesEmployeeId).not.toBe(executive.firebaseUid);
    expect(quote.salesTeamId).toBe('sales-team-01');
    expect(quote.status).toBe('DRAFT');
    expect(quote.totalSupplierCost).toBe(40_000);
    expect(quote.finalAmount).toBe(80_000);
    expect(quote.grossProfit).toBe(40_000);
    expect(quote.grossMargin).toBe(50);
    expect(quote.supplierCostSource).toMatchObject({ type: 'TRIP', sourceId: 'trip-01' });
    expect(quote.hotels?.[0]).toMatchObject({
      sourceTripItemId: 'trip-hotel-01',
      propertyId: 'accom-sgr-kareemresidency',
      ratePeriodId: 'rp-accom-sgr-kareemresidency-oct',
    });
    expect(storage.rawGet('quotes', quote.id)).toBeDefined();

    const audit = storage.getAllAuditLogs()[0];
    expect(audit.action).toBe('QUOTE_CREATED');
    expect(audit.actorId).toBe(executive.employeeId);
  });

  it('freezes category economics and preserves the prior Quote version after Trip repricing', async () => {
    const firstBreakdown = {
      accommodation: { total: 28_000, items: [{ label: 'Srinagar hotel', amount: 28_000 }] },
      transport: { total: 10_000, items: [{ label: 'Vehicle', amount: 10_000 }] },
      activities: { total: 2_000, items: [{ label: 'Shikara', amount: 2_000 }] },
      other: { total: 0, items: [] }, total: 40_000,
    };
    storage.rawUpdate('trips', 'trip-01', {
      totalSellingPrice: 80_000, pricingMode: 'SELLING_PRICE', pricingInput: 80_000,
      supplierCostBreakdown: firstBreakdown,
    });
    const quote = await service.createQuote(createInput(), executive);
    expect(quote.supplierCostBreakdown).toEqual(firstBreakdown);

    const secondBreakdown = {
      accommodation: { total: 33_000, items: [{ label: 'Srinagar hotel', amount: 33_000 }] },
      transport: { total: 10_000, items: [{ label: 'Vehicle', amount: 10_000 }] },
      activities: { total: 2_000, items: [{ label: 'Shikara', amount: 2_000 }] },
      other: { total: 0, items: [] }, total: 45_000,
    };
    storage.rawUpdate('trips', 'trip-01', {
      totalSupplierCost: 45_000, totalSellingPrice: 90_000, grossProfit: 45_000, grossMargin: 50,
      supplierCostBreakdown: secondBreakdown, costingRevision: 1, costingCalculatedRevision: 1,
    });
    const revised = await service.updateQuote(quote.id, { notes: 'Current package economics' }, executive);
    expect(revised).toMatchObject({ totalSupplierCost: 45_000, finalAmount: 90_000, grossProfit: 45_000 });
    expect(revised.supplierCostBreakdown).toEqual(secondBreakdown);
    expect(revised.versionHistory?.[0].supplierCostBreakdown).toEqual(firstBreakdown);
    expect(revised.versionHistory?.[0].finalAmount).toBe(80_000);
  });

  it('copies configured low-margin review state and blocks unsafe sharing', async () => {
    storage.rawUpdate('trips', 'trip-01', {
      grossProfit: 40_000, grossMargin: 50,
      commercialApproval: { required: true, state: 'REVIEW_REQUIRED', thresholdPercent: 60, assessedAt: '2026-10-09T00:00:00Z' },
    });
    const quote = await service.createQuote(createInput(), executive);
    expect(quote).toMatchObject({ requiresLowMarginApproval: true, approval: { required: true, state: 'REVIEW_REQUIRED' } });
    await expect(service.shareQuote(quote.id, { channel: 'DOCUMENT', expectedVersion: 1 }, executive))
      .rejects.toMatchObject({ statusCode: 409, code: 'COMMERCIAL_APPROVAL_REQUIRED' });
    expect(storage.rawGet('quotes', quote.id)).toMatchObject({ status: 'DRAFT', version: 1 });

    const approved = await new LowMarginQuoteApprovalService(storage).decideQuote(quote.id, {
      decision: 'APPROVED', expectedUpdatedAt: `${quote.version}:${quote.updatedAt}`,
    }, manager);
    const shared = await service.shareQuote(quote.id, { channel: 'DOCUMENT', expectedVersion: approved.version }, executive);
    expect(shared.quote).toMatchObject({ status: 'SENT', approval: { state: 'APPROVED' } });
  });

  it('returns the existing Trip Quote when creation is retried', async () => {
    const first = await service.createQuote(createInput(), executive);
    const retried = await service.createQuote({ ...createInput(), totalAmount: 999_999 }, executive);

    expect(retried.id).toBe(first.id);
    expect(retried.totalAmount).toBe(first.totalAmount);
    expect(storage.getAllAuditLogs().filter(log => log.action === 'QUOTE_CREATED')).toHaveLength(1);
  });

  it('derives all primary services, validates backups, versions revisions, and converts without financial leakage', async () => {
    const options = await service.getBackupAccommodationOptions('trip-01', 'trip-hotel-01', executive);
    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({ propertyId: 'backup-property', ratePeriodId: 'backup-rate' });

    const quote = await service.createQuote({
      ...createInput(),
      hotels: [{ hotelName: 'Forged Hotel', roomType: 'Forged', mealPlan: 'EP', nights: 99 }],
      transports: [{ vehicleType: 'Forged Vehicle', route: 'Forged', days: 99, rate: 1 }],
      activities: [{ name: 'Forged Activity', pax: 99, rate: 1 }],
      backupAccommodations: [{
        sourceTripItemId: 'trip-hotel-01', propertyId: 'backup-property', roomCategoryId: 'backup-room',
        ratePeriodId: 'backup-rate', mealPlan: 'MAP',
      }],
    }, executive);
    expect(quote.hotels?.[0].hotelName).toBe('Hotel Kareem Residency');
    expect(quote.transports?.[0].vehicleCategoryId).toBe('vc_innova_crysta');
    expect(quote.activities?.[0].activityMasterId).toBe('act_shikara_ride');
    expect(quote.backupAccommodations?.[0]).toMatchObject({ propertyName: 'Backup Palace', roomCategoryName: 'Lake Room' });

    const revised = await service.updateQuote(quote.id, { totalAmount: 110_000, discountAmount: 5_000 }, executive);
    expect(revised.version).toBe(2);
    expect(revised.versionHistory?.[0].hotels?.[0].sourceTripItemId).toBe('trip-hotel-01');
    const sent = await service.updateQuote(quote.id, { status: 'SENT' }, executive);
    const conversion = await new QuoteConversionService(storage, new DefaultInventoryDataProvider())
      .convertQuoteToBooking(sent.id, executive, { currentDate: '2026-09-29' });
    expect(conversion.accommodations[0].sourceQuoteServiceId).toBe('trip-hotel-01');
    expect(conversion.transports[0].sourceQuoteServiceId).toBe('trip-transport-01');
    expect(conversion.activities[0].sourceQuoteServiceId).toBe('trip-activity-01');
    expect((conversion.booking as any).totalSupplierCost).toBeUndefined();
    expect((conversion.booking as any).grossProfit).toBeUndefined();
  });

  it('freezes M4.2 package transport economics and keeps optional activities out of Booking fulfillment', async () => {
    const day = storage.rawGet('itinerary_days', 'day-trip-01')!;
    storage.rawSet('itinerary_days', 'day-trip-01', {
      ...day,
      items: day.items.map((item: any) => item.type === 'TRANSPORT' ? {
        ...item, supplierCost: 18_000,
        metadata: {
          ...item.metadata, vehicleCount: 2, chargeableDays: 2,
          serviceDays: [{ dayNumber: 1, date: '2026-10-15', serviceType: 'AIRPORT_TRANSFER', chargeableTransportDay: true }, { dayNumber: 2, date: '2026-10-16', serviceType: 'DAY_TRIP', chargeableTransportDay: true }],
          costSource: 'PACKAGE_RATE_OVERRIDE', contractedTotalSupplierCost: 20_000,
          packageSupplierRate: { entryMode: 'PER_VEHICLE_DAY', amount: 4_500, taxTreatment: 'NET', enteredByEmployeeId: executive.employeeId, enteredAt: '2026-09-20T09:00:00.000Z', originalContractedTotal: 20_000 },
        },
      } : item.type === 'ACTIVITY' ? {
        ...item, supplierCost: 0,
        metadata: { ...item.metadata, inclusionStatus: 'OPTIONAL' },
      } : item),
    });
    const quote = await service.createQuote(createInput(), executive);
    expect(quote.transports?.[0]).toMatchObject({ vehicleCount: 2, chargeableDays: 2, costSource: 'PACKAGE_RATE_OVERRIDE', originalContractedTotal: 20_000 });
    expect(quote.transports?.[0].packageSupplierRate).toMatchObject({ amount: 4_500, enteredByEmployeeId: executive.employeeId });
    expect(quote.activities?.[0]).toMatchObject({ inclusionStatus: 'OPTIONAL', supplierCost: 0 });

    const sent = await service.updateQuote(quote.id, { status: 'SENT' }, executive);
    const conversion = await new QuoteConversionService(storage, new DefaultInventoryDataProvider())
      .convertQuoteToBooking(sent.id, executive, { currentDate: '2026-09-29' });
    expect(conversion.transports[0]).toMatchObject({ vehicleCount: 2, chargeableDays: 2 });
    expect(conversion.activities).toHaveLength(0);
    const financial = storage.rawList(`bookings/${conversion.booking.id}/financial_snapshot`).find(value => value.bookingId === conversion.booking.id);
    expect(financial?.lineItems.find((value: any) => value.serviceId === 'trip-transport-01')).toMatchObject({
      rateContractType: 'PACKAGE', frozenTotalSupplierCost: 18_000,
      packageSupplierRate: { amount: 4_500, enteredByEmployeeId: executive.employeeId },
    });
  });

  it('derives Sales ownership from the Lead when a Manager or Admin creates the Quote', async () => {
    const managerQuote = await service.createQuote(createInput(), manager);
    expect(managerQuote.salesEmployeeId).toBe(executive.employeeId);
    expect(managerQuote.salesTeamId).toBe(executive.salesTeamId);
    expect(managerQuote.createdByEmployeeId).toBe(manager.employeeId);

    const admin: QuoteMutationActor = {
      firebaseUid: 'firebase-admin-01',
      employeeId: 'emp-admin-01',
      role: 'Admin',
      active: true,
      name: 'Admin User',
    };
    storage.rawSet('trips', 'trip-admin', { ...baseTrip, id: 'trip-admin', leadId: 'lead-admin' });
    storage.rawSet('leads', 'lead-admin', {
      id: 'lead-admin', customerId: 'customer-01', assignedEmployeeId: executive.employeeId,
    });
    storage.rawSet('itinerary_days', 'day-trip-admin', {
      ...storage.rawGet('itinerary_days', 'day-trip-01'), id: 'day-trip-admin', tripId: 'trip-admin',
    });
    const adminQuote = await service.createQuote({ ...createInput(), tripId: 'trip-admin', leadId: 'lead-admin' }, admin);
    expect(adminQuote.salesEmployeeId).toBe(executive.employeeId);
    expect(adminQuote.salesTeamId).toBe(executive.salesTeamId);
    expect(adminQuote.createdByEmployeeId).toBe(admin.employeeId);
  });

  it('rejects client-controlled owner, team, status, supplier cost, profit, and margin fields for options', async () => {
    const attacks = [
      { salesEmployeeId: 'emp-other' },
      { salesTeamId: 'team-other' },
      { status: 'SENT' },
      { totalSupplierCost: 1 },
      { grossProfit: 999_999 },
      { grossMargin: 99 },
      { hotels: [{ supplierCost: 1 }] },
      { hotels: [{ quotedRate: 1 }] },
    ];

    for (const attack of attacks) {
      await expect(service.createQuote({ ...createInput(), optionLabel: 'Value', ...attack }, executive))
        .rejects.toMatchObject({ statusCode: 400 });
    }
    expect(storage.rawGet('quotes', 'quote-01')).toBeNull();
    expect(storage.getAllAuditLogs()).toHaveLength(0);
  });

  it('rejects negative, NaN, infinite, over-discounted, and loss-making proposals', async () => {
    for (const input of [
      { totalAmount: -1 },
      { totalAmount: Number.NaN },
      { totalAmount: Number.POSITIVE_INFINITY },
      { totalAmount: 100, discountAmount: 101 },
      { totalAmount: 30_000, discountAmount: 0 },
      { validUntil: 'not-a-date' },
      { validUntil: '2026-02-30' },
    ]) {
      await expect(service.createQuote({ ...createInput(), ...input }, executive)).rejects.toBeDefined();
    }
    expect(storage.getAllAuditLogs()).toHaveLength(0);
  });

  it('validates authoritative customer, lead, Trip, and package linkage', async () => {
    await expect(service.createQuote({ ...createInput(), customerId: 'customer-other' }, executive))
      .rejects.toMatchObject({ statusCode: 400, code: 'CUSTOMER_NOT_FOUND' });
    await expect(service.createQuote({ ...createInput(), leadId: 'lead-other' }, executive))
      .rejects.toMatchObject({ statusCode: 400, code: 'LEAD_NOT_FOUND' });
    await expect(service.createQuote({ ...createInput(), packageId: 'package-missing' }, executive))
      .rejects.toMatchObject({ statusCode: 400, code: 'PACKAGE_NOT_FOUND' });
    expect(storage.getAllAuditLogs()).toHaveLength(0);
  });

  it('fails closed when a Sales actor links a Quote to a Lead outside their scope', async () => {
    storage.rawSet('leads', 'lead-other', {
      id: 'lead-other',
      customerId: 'customer-01',
      assignedEmployeeId: 'emp-sales-02',
    });
    storage.rawSet('employees', 'emp-sales-02', {
      id: 'emp-sales-02',
      employeeId: 'emp-sales-02',
      role: 'Sales Executive',
      active: true,
      name: 'Executive Two',
      salesTeamId: 'sales-team-02',
    });

    const input = { ...createInput(), leadId: 'lead-other' };
    delete (input as any).tripId;
    await expect(service.createQuote(input, executive))
      .rejects.toMatchObject({ statusCode: 403, code: 'LINKED_LEAD_ACCESS_DENIED' });

    const otherTeamManager: QuoteMutationActor = {
      ...manager,
      firebaseUid: 'firebase-manager-02',
      employeeId: 'emp-manager-02',
      salesTeamId: 'sales-team-02',
      name: 'Manager Two',
    };
    await expect(service.createQuote({ ...input, leadId: 'lead-01' }, otherTeamManager))
      .rejects.toMatchObject({ statusCode: 403, code: 'LINKED_LEAD_ACCESS_DENIED' });

    expect(storage.getAllAuditLogs()).toHaveLength(0);
  });

  it('archives every prior commercial revision and retains authoritative Trip economics', async () => {
    const quote = await service.createQuote(createInput(), executive);
    const updated = await service.updateQuote(quote.id, {
      totalAmount: 120_000,
      discountAmount: 0,
      status: 'SENT',
    }, executive);

    expect(updated.version).toBe(2);
    expect(updated.versionHistory).toHaveLength(1);
    expect(updated.versionHistory?.[0].version).toBe(1);
    expect(updated.versionHistory?.[0].updatedBy).toBe(executive.employeeId);
    expect(updated.totalSupplierCost).toBe(40_000);
    expect(updated.finalAmount).toBe(80_000);
    expect(updated.grossProfit).toBe(40_000);
    expect(updated.grossMargin).toBe(50);
    expect(updated.status).toBe('SENT');
  });

  it('enforces Executive OWN and Manager TEAM mutation scopes with zero unauthorized writes', async () => {
    const quote = await service.createQuote(createInput(), executive);
    const otherExecutive: QuoteMutationActor = {
      ...executive,
      firebaseUid: 'firebase-sales-02',
      employeeId: 'emp-sales-02',
      name: 'Executive Two',
    };

    await expect(service.updateQuote(quote.id, { notes: 'forged' }, otherExecutive))
      .rejects.toMatchObject({ statusCode: 403, code: 'RESOURCE_ACCESS_DENIED' });
    expect(storage.rawGet('quotes', quote.id).notes).toBeUndefined();

    const managerUpdate = await service.updateQuote(quote.id, { notes: 'team-approved edit' }, manager);
    expect(managerUpdate.notes).toBe('team-approved edit');
    expect(managerUpdate.versionHistory?.[0].updatedBy).toBe(executive.employeeId);

    const otherManager: QuoteMutationActor = {
      ...manager,
      employeeId: 'emp-manager-02',
      firebaseUid: 'firebase-manager-02',
      salesTeamId: 'sales-team-02',
    };
    const versionBeforeDenial = storage.rawGet('quotes', quote.id).version;
    await expect(service.updateQuote(quote.id, { notes: 'cross-team edit' }, otherManager))
      .rejects.toMatchObject({ statusCode: 403, code: 'RESOURCE_ACCESS_DENIED' });
    expect(storage.rawGet('quotes', quote.id).version).toBe(versionBeforeDenial);
  });

  it('allows Accounts to read through policy but denies commercial mutation', async () => {
    const quote = await service.createQuote(createInput(), executive);
    const accounts: QuoteMutationActor = {
      firebaseUid: 'firebase-accounts-01',
      employeeId: 'emp-accounts-01',
      role: 'Accounts',
      active: true,
      name: 'Accounts User',
    };
    const readDecision = authorizeResource(accounts, 'QUOTE', 'READ_DETAIL', quoteResourceContext(quote));
    expect(readDecision.allowed).toBe(true);
    expect(buildQuoteDto(quote, readDecision).totalSupplierCost).toBe(40_000);

    await expect(service.updateQuote(quote.id, { notes: 'not allowed' }, accounts))
      .rejects.toMatchObject({ statusCode: 403, code: 'RESOURCE_ACCESS_DENIED' });
  });

  it('denies Operations, Marketing, and Reservations commercial Quote mutation', async () => {
    const quote = await service.createQuote(createInput(), executive);
    for (const role of ['Operations', 'Marketing', 'Reservations'] as const) {
      const actor: QuoteMutationActor = {
        firebaseUid: `firebase-${role}`,
        employeeId: `employee-${role}`,
        role,
        active: true,
        name: role,
      };
      await expect(service.updateQuote(quote.id, { notes: `${role} edit` }, actor))
        .rejects.toMatchObject({ statusCode: 403, code: 'RESOURCE_ACCESS_DENIED' });
    }
    expect(storage.rawGet('quotes', quote.id).notes).toBeUndefined();
  });

  it('validates status transitions and fails TEAM actions when team metadata is missing', async () => {
    const quote = await service.createQuote(createInput(), executive);
    await expect(service.updateQuote(quote.id, { status: 'NOT_A_STATUS' } as any, executive))
      .rejects.toMatchObject({ statusCode: 400, code: 'INVALID_QUOTE_STATUS' });

    const missingTeamManager: QuoteMutationActor = { ...manager };
    delete missingTeamManager.salesTeamId;
    await expect(service.updateQuote(quote.id, { notes: 'missing team' }, missingTeamManager))
      .rejects.toMatchObject({ statusCode: 403, code: 'RESOURCE_ACCESS_DENIED' });
    expect(storage.rawGet('quotes', quote.id).version).toBe(1);
  });

  it('fails closed when owner/team metadata is missing and strips unknown Firestore fields from DTOs', async () => {
    const quote = await service.createQuote(createInput(), executive);
    const { salesEmployeeId: _removedOwner, ...missingOwner } = quote;
    storage.rawSet('quotes', quote.id, { ...missingOwner, secretInternalFlag: 'do-not-leak' });

    await expect(service.updateQuote(quote.id, { notes: 'attempt' }, executive))
      .rejects.toMatchObject({ statusCode: 403 });

    const complete = { ...quote, secretInternalFlag: 'do-not-leak' };
    const decision = authorizeResource(executive, 'QUOTE', 'READ_DETAIL', quoteResourceContext(complete));
    const dto = buildQuoteDto(complete, decision);
    expect(dto.secretInternalFlag).toBeUndefined();
    expect(dto.totalSupplierCost).toBe(40_000);
  });

  it('keeps uncosted preliminary Quotes in DRAFT and blocks commercial progression', async () => {
    const preliminary = { ...createInput() };
    delete (preliminary as any).tripId;
    const quote = await service.createQuote(preliminary, executive);
    expect(quote.totalSupplierCost).toBeUndefined();
    expect(quote.grossProfit).toBeUndefined();

    await expect(service.updateQuote(quote.id, { status: 'SENT' }, executive))
      .rejects.toMatchObject({ statusCode: 422, code: 'QUOTE_FINANCIALS_INCOMPLETE' });
    expect(storage.rawGet('quotes', quote.id).status).toBe('DRAFT');
  });

  it('builds a strict customer-safe package and transactionally records QUOTE_SHARED', async () => {
    const quote = await service.createQuote({
      ...createInput(),
      internalNotes: 'Never show this note',
      inclusions: ['Hotels', 'Transfers'],
      exclusions: ['Personal expenses'],
      termsAndConditions: 'Subject to availability.',
    }, executive);

    const preview = await service.getCustomerPackage(quote.id, executive);
    expect(preview).toMatchObject({
      customerName: 'Test Customer', destination: 'Your destination', packageSellingPrice: 80_000,
      hotels: [{ hotelName: 'Hotel Kareem Residency', roomCategoryName: 'Deluxe Room', mealPlan: 'MAP' }],
      transports: [{ vehicleName: 'Innova Crysta AC' }], activities: [{ activityName: 'Private Shikara Ride on Dal Lake' }],
    });
    const serialized = JSON.stringify(preview);
    for (const forbidden of ['totalSupplierCost', 'grossProfit', 'grossMargin', 'supplierId', 'rateId', 'internalNotes', 'supplierCost']) {
      expect(serialized).not.toContain(forbidden);
    }

    const result = await service.shareQuote(quote.id, { channel: 'DOCUMENT', expectedVersion: 1 }, executive);
    expect(result.quote).toMatchObject({
      status: 'SENT', version: 2, sharedByEmployeeId: executive.employeeId, shareChannel: 'DOCUMENT',
    });
    expect(result.quote.sharedAt).toBeTruthy();
    expect(storage.rawGet('quotes', quote.id).status).toBe('SENT');
    expect(storage.getAllAuditLogs().at(-1)).toMatchObject({ action: 'QUOTE_SHARED', actorId: executive.employeeId });
  });

  it('applies the versioned standard customer policy while supporting a frozen booking-specific payment schedule', async () => {
    const standard = await service.createQuote({ ...createInput(), optionLabel: 'Standard Policy' }, executive);
    expect(standard).toMatchObject({
      policyVersion: BOOKING_BRIDGE_POLICY_VERSION,
      termsAndConditions: STANDARD_CUSTOMER_POLICY_PRESET.termsAndConditions,
      inclusions: [...STANDARD_CUSTOMER_POLICY_PRESET.inclusions],
      exclusions: [...STANDARD_CUSTOMER_POLICY_PRESET.exclusions],
      paymentSchedule: [{ percentage: 50, timing: 'AT_BOOKING' }, { percentage: 50, timing: 'BEFORE_DEPARTURE' }],
    });
    expect(standard.customerPackageSnapshot).toMatchObject({
      policyVersion: BOOKING_BRIDGE_POLICY_VERSION,
      paymentSchedule: [{ percentage: 50 }, { percentage: 50 }],
    });

    const custom = await service.updateOption(standard.id, {
      paymentSchedule: [
        { percentage: 30, timing: 'AT_BOOKING', label: '30% at booking' },
        { percentage: 70, timing: 'CUSTOM', label: '70% fourteen days before departure' },
      ],
    }, executive);
    expect(custom.customerPackageSnapshot?.paymentSchedule).toEqual([
      { percentage: 30, timing: 'AT_BOOKING', label: '30% at booking' },
      { percentage: 70, timing: 'CUSTOM', label: '70% fourteen days before departure' },
    ]);
    expect(custom.versionHistory.at(-1)?.paymentSchedule).toEqual(standard.paymentSchedule);
    await expect(service.updateOption(custom.id, {
      paymentSchedule: [{ percentage: 40, timing: 'AT_BOOKING', label: 'Invalid incomplete schedule' }],
    }, executive)).rejects.toMatchObject({ code: 'INVALID_PAYMENT_SCHEDULE' });
  });

  it('rejects stale or unauthorized package sharing without mutating Quote state', async () => {
    const quote = await service.createQuote(createInput(), executive);
    const anotherExecutive: QuoteMutationActor = {
      ...executive, firebaseUid: 'firebase-other', employeeId: 'emp-other', salesTeamId: 'sales-team-02', name: 'Other Executive',
    };
    await expect(service.shareQuote(quote.id, { channel: 'DOCUMENT', expectedVersion: 1 }, anotherExecutive))
      .rejects.toMatchObject({ statusCode: 403, code: 'RESOURCE_ACCESS_DENIED' });
    await expect(service.shareQuote(quote.id, { channel: 'DOCUMENT', expectedVersion: 99 }, executive))
      .rejects.toMatchObject({ statusCode: 409, code: 'QUOTE_VERSION_CONFLICT' });
    expect(storage.rawGet('quotes', quote.id)).toMatchObject({ status: 'DRAFT', version: 1 });
    expect(storage.getAllAuditLogs().filter(log => log.action === 'QUOTE_SHARED')).toHaveLength(0);
  });

  it('keeps a shared Quote immutable while blocking new Quote work until current package costs are refreshed', async () => {
    const draft = await service.createQuote(createInput(), executive);
    const shared = await service.shareQuote(draft.id, { channel: 'DOCUMENT', expectedVersion: draft.version }, executive);
    const historicalPackage = await service.getCustomerPackage(draft.id, executive);
    storage.rawUpdate('trips', 'trip-01', {
      costingStatus: 'PENDING',
      costingRevision: 1,
      packageReview: {
        required: true, reason: 'LEAD_COMMERCIAL_DETAILS_CHANGED',
        changes: [{ field: 'adults', before: 2, after: 4 }],
        markedAt: '2026-09-21T00:00:00.000Z', markedByEmployeeId: executive.employeeId,
      },
    });
    const before = storage.rawGet('quotes', draft.id);

    await expect(service.createQuote(createInput(), executive))
      .rejects.toMatchObject({ statusCode: 409, code: 'TRIP_COSTING_PENDING' });
    await expect(service.updateQuote(draft.id, { notes: 'new revision' }, executive))
      .rejects.toMatchObject({ statusCode: 409, code: 'TRIP_COSTING_PENDING' });
    await expect(service.shareQuote(draft.id, { channel: 'DOCUMENT', expectedVersion: shared.quote.version }, executive))
      .rejects.toMatchObject({ statusCode: 409, code: 'TRIP_COSTING_PENDING' });
    expect(await service.getCustomerPackage(draft.id, executive)).toEqual(historicalPackage);
    expect(storage.rawGet('quotes', draft.id)).toEqual(before);

    storage.rawUpdate('trips', 'trip-01', {
      costingStatus: 'CALCULATED',
      costingCalculatedRevision: 1,
      totalSupplierCost: 60_000,
      packageReview: { required: false },
    });
    const revised = await service.updateQuote(draft.id, { notes: 'costs reviewed' }, executive);
    expect(revised).toMatchObject({ version: 3, notes: 'costs reviewed' });
    expect(revised).toMatchObject({ totalSupplierCost: 60_000 });
    expect(revised.supplierCostSource).toMatchObject({ costingRevision: 1 });
  });

  it('allows stale-itinerary preview but blocks final share until review, preserving historical snapshots', async () => {
    const quote = await service.createQuote(createInput(), executive);
    storage.rawUpdate('itinerary_days', 'day-trip-01', {
      customerContent: {
        style: 'DETAILED', status: 'REVIEW_NEEDED', sourceFingerprint: 'v1-old',
        updatedAt: '2026-09-21T00:00:00.000Z', updatedByEmployeeId: executive.employeeId,
      },
    });
    const preview = await service.getCustomerPackage(quote.id, executive);
    expect(preview.itinerary).toHaveLength(1);
    await expect(service.shareQuote(quote.id, { channel: 'DOCUMENT', expectedVersion: quote.version }, executive))
      .rejects.toMatchObject({ statusCode: 409, code: 'ITINERARY_REVIEW_REQUIRED' });
    expect(storage.rawGet('quotes', quote.id)).toMatchObject({ status: 'DRAFT', version: 1 });

    storage.rawUpdate('itinerary_days', 'day-trip-01', {
      customerContent: {
        style: 'DETAILED', status: 'CURRENT', sourceFingerprint: 'v1-current',
        updatedAt: '2026-09-21T01:00:00.000Z', updatedByEmployeeId: executive.employeeId,
      },
    });
    const shared = await service.shareQuote(quote.id, { channel: 'DOCUMENT', expectedVersion: quote.version }, executive);
    const frozen = shared.customerPackage;
    storage.rawUpdate('itinerary_days', 'day-trip-01', { title: 'Later changed title', customerContent: { status: 'REVIEW_NEEDED' } });
    expect(await service.getCustomerPackage(quote.id, executive)).toEqual(frozen);
  });

  it('uses explicit conversion DTO allowlists and never passes supplier snapshots through', () => {
    const dto = buildQuoteConversionDto({
      success: true,
      quoteStatus: 'ACCEPTED',
      message: 'converted',
      financialSnapshot: { totalSupplierCost: 1 },
      booking: {
        id: 'booking-01',
        bookingReference: 'BB-100001',
        totalSellingPrice: 100_000,
        totalSupplierCost: 1,
        grossProfit: 99_999,
        secretInternalFlag: true,
        confirmationProgress: { totalServices: 1, secretInternalFlag: true },
      },
      accommodations: [{ id: 'stay-01', supplierCost: 1, confirmationStatus: 'CONFIRMED' }],
      transports: [],
      activities: [],
    });
    expect(dto.financialSnapshot).toBeUndefined();
    expect(dto.booking.totalSupplierCost).toBeUndefined();
    expect(dto.booking.grossProfit).toBeUndefined();
    expect(dto.booking.secretInternalFlag).toBeUndefined();
    expect(dto.booking.confirmationProgress.secretInternalFlag).toBeUndefined();
    expect(dto.accommodations[0].supplierCost).toBeUndefined();
  });

  it('creates, duplicates, edits, orders and recommends isolated frozen Quote options', async () => {
    const value = await service.createQuote({ ...createInput(), optionLabel: 'Value', customerTitle: 'Kashmir Escape' }, executive);
    expect(value).toMatchObject({ optionLabel: 'Value', optionOrder: 1, isRecommended: true, optionStatus: 'READY' });
    expect(value.customerPackageSnapshot?.hotels[0].hotelName).toBe('Hotel Kareem Residency');

    const recommended = await service.duplicateOption(value.id, { label: 'Recommended', totalAmount: 90_000 }, executive);
    const premium = await service.duplicateOption(recommended.id, { label: 'Premium', totalAmount: 100_000 }, executive);
    const sharedValue = await service.shareQuote(value.id, { channel: 'DOCUMENT', expectedVersion: value.version }, executive);
    const historicalValuePackage = JSON.parse(JSON.stringify(sharedValue.customerPackage));
    const valueBefore = JSON.parse(JSON.stringify(storage.rawGet('quotes', value.id)));
    const changed = await service.updateOption(recommended.id, {
      label: 'Best Value', totalAmount: 95_000,
      inclusions: ['Premium hotel', 'Private Innova'], exclusions: ['Airfare'],
    }, executive);
    expect(changed).toMatchObject({ optionLabel: 'Best Value', finalAmount: 95_000, grossProfit: 55_000 });
    expect(changed.customerPackageSnapshot).toMatchObject({ packageSellingPrice: 95_000, inclusions: ['Premium hotel', 'Private Innova'] });
    expect(storage.rawGet('quotes', value.id)).toEqual(valueBefore);
    expect(await service.getCustomerPackage(value.id, executive)).toEqual(historicalValuePackage);

    const liveDay = storage.rawGet('itinerary_days', 'day-trip-01');
    storage.rawUpdate('itinerary_days', 'day-trip-01', {
      ...liveDay,
      items: liveDay.items.map((item: any) => item.type === 'HOTEL'
        ? { ...item, metadata: { ...item.metadata, propertyId: 'premium-hotel', propertyName: 'Premium Palace', roomCategoryId: 'premium-room', roomCategoryName: 'Premium Suite', rateId: 'premium-rate' } }
        : item.type === 'TRANSPORT'
          ? { ...item, metadata: { ...item.metadata, vehicleCategoryId: 'vc-premium', vehicleName: 'Innova Crysta Premium', rateId: 'premium-transport-rate' } }
          : item),
    });
    storage.rawUpdate('trips', 'trip-01', { costingRevision: 1, costingCalculatedRevision: 1, updatedAt: '2026-09-21T00:00:00.000Z' });
    const refreshedPremium = await service.refreshOptionFromTrip(premium.id, executive);
    expect(refreshedPremium.hotels?.[0].hotelName).toBe('Premium Palace');
    expect(refreshedPremium.transports?.[0].vehicleType).toBe('Innova Crysta Premium');
    expect(storage.rawGet('quotes', value.id).hotels[0].hotelName).toBe('Hotel Kareem Residency');
    expect(storage.rawGet('quotes', recommended.id).hotels[0].hotelName).toBe('Hotel Kareem Residency');

    await service.recommendOption(recommended.id, executive);
    expect(storage.rawGet('quotes', value.id).isRecommended).toBe(false);
    expect(storage.rawGet('quotes', recommended.id).isRecommended).toBe(true);
    expect(storage.rawGet('quotes', premium.id).isRecommended).toBe(false);
    const reordered = await service.reorderOptions(value.quoteGroupId!, {
      optionIds: [premium.optionId, recommended.optionId, value.optionId],
    }, executive);
    expect(reordered.map(option => option.optionLabel)).toEqual(['Premium', 'Best Value', 'Value']);

    const comparison = await service.getOptionComparison(value.quoteGroupId!, executive);
    expect(comparison.options).toHaveLength(3);
    expect(comparison.options.filter(option => option.recommended).map(option => option.label)).toEqual(['Best Value']);
    const customerJson = JSON.stringify(comparison);
    expect(customerJson).not.toContain('totalSupplierCost');
    expect(customerJson).not.toContain('grossProfit');
    expect(customerJson).not.toContain('approval');
    expect(customerJson).not.toContain('supplierCostSource');
  });

  it('keeps option snapshots frozen after Trip changes and converts only the accepted option', async () => {
    const value = await service.createQuote({ ...createInput(), optionLabel: 'Value' }, executive);
    const selected = await service.duplicateOption(value.id, { label: 'Recommended', totalAmount: 92_000 }, executive);
    const originalSnapshot = JSON.parse(JSON.stringify(selected.customerPackageSnapshot));
    expect(originalSnapshot).toMatchObject({
      policyVersion: BOOKING_BRIDGE_POLICY_VERSION,
      paymentSchedule: [{ percentage: 50, timing: 'AT_BOOKING' }, { percentage: 50, timing: 'BEFORE_DEPARTURE' }],
    });
    storage.rawUpdate('trips', 'trip-01', {
      totalSupplierCost: 70_000, totalSellingPrice: 120_000,
      costingRevision: 2, costingCalculatedRevision: 2,
    });
    storage.rawUpdate('itinerary_days', 'day-trip-01', { title: 'Changed live itinerary' });
    expect(await service.getCustomerPackage(selected.id, executive)).toEqual(originalSnapshot);

    const shared = await service.shareQuote(selected.id, { channel: 'DOCUMENT', expectedVersion: selected.version }, executive);
    const conversion = await new QuoteConversionService(storage, new DefaultInventoryDataProvider())
      .convertQuoteToBooking(shared.quote.id, executive, { currentDate: '2026-10-01' });
    expect(conversion.booking).toMatchObject({
      quoteId: selected.id,
      quoteOptionId: selected.optionId,
      quoteGroupId: selected.quoteGroupId,
      totalSellingPrice: 92_000,
    });
    expect(conversion.booking.customerPackageSnapshot).toEqual(originalSnapshot);
    expect(conversion.accommodations[0]).toMatchObject({ propertyName: 'Hotel Kareem Residency', roomCategoryName: 'Deluxe Room' });
    const financial = storage.rawList(`bookings/${conversion.booking.id}/financial_snapshot`)
      .find(value => value.bookingId === conversion.booking.id);
    expect(financial).toMatchObject({ totalSupplierCost: 40_000, totalSellingPrice: 92_000 });
    expect(storage.rawGet('quotes', selected.id)).toMatchObject({ optionStatus: 'ACCEPTED', convertedBookingId: conversion.booking.id });
    expect(storage.rawGet('quotes', value.id)).toMatchObject({ optionStatus: 'SUPERSEDED' });
    await expect(service.shareQuote(value.id, { channel: 'DOCUMENT', expectedVersion: value.version }, executive))
      .rejects.toMatchObject({ statusCode: 409, code: 'QUOTE_SHARE_WORKFLOW_DENIED' });
    storage.rawUpdate('quotes', value.id, { optionStatus: 'READY' });
    const losingShared = await service.shareQuote(value.id, { channel: 'DOCUMENT', expectedVersion: value.version }, executive);
    await expect(new QuoteConversionService(storage, new DefaultInventoryDataProvider())
      .convertQuoteToBooking(losingShared.quote.id, executive, { currentDate: '2026-10-01' }))
      .rejects.toMatchObject({ statusCode: 409, code: 'QUOTE_GROUP_ALREADY_ACCEPTED' });
  });

  it('requires current costing and reviewed itinerary before freezing a new option', async () => {
    storage.rawUpdate('itinerary_days', 'day-trip-01', { customerContent: { status: 'REVIEW_NEEDED' } });
    await expect(service.createQuote({ ...createInput(), optionLabel: 'Value' }, executive))
      .rejects.toMatchObject({ statusCode: 409, code: 'ITINERARY_REVIEW_REQUIRED' });
    expect(storage.rawList('quotes')).toHaveLength(0);

    storage.rawUpdate('itinerary_days', 'day-trip-01', { customerContent: { status: 'CURRENT' } });
    storage.rawUpdate('trips', 'trip-01', { costingStatus: 'STALE', costingRevision: 1, costingCalculatedRevision: 0 });
    await expect(service.createQuote({ ...createInput(), optionLabel: 'Value' }, executive))
      .rejects.toMatchObject({ statusCode: 409, code: 'TRIP_COSTING_PENDING' });
    expect(storage.rawList('quotes')).toHaveLength(0);
  });

  it('requires current low-margin approval before freezing a new option', async () => {
    storage.rawUpdate('trips', 'trip-01', {
      commercialApproval: {
        required: true,
        state: 'REVIEW_REQUIRED',
        thresholdPercent: 60,
        assessedAt: '2026-10-09T00:00:00.000Z',
      },
    });

    await expect(service.createQuote({ ...createInput(), optionLabel: 'Value' }, executive))
      .rejects.toMatchObject({ statusCode: 409, code: 'COMMERCIAL_APPROVAL_REQUIRED' });
    expect(storage.rawList('quotes')).toHaveLength(0);
    expect(storage.getAllAuditLogs()).toHaveLength(0);
  });
});
