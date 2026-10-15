import { beforeEach, describe, expect, it } from 'bun:test';
import { InMemoryConversionStorageProvider } from '../../src/services/conversion/conversionStorageProvider';
import { QuoteService, type QuoteMutationActor } from '../../server/services/quoteService';
import type { CustomerPackageDocument, Quote } from '../../src/types';

describe('M5B.1 secure customer shares', () => {
  let storage: InMemoryConversionStorageProvider;
  let service: QuoteService;

  const executive: QuoteMutationActor = {
    firebaseUid: 'firebase-sales-01', employeeId: 'emp-sales-01', role: 'Sales Executive',
    active: true, salesTeamId: 'sales-team-01', name: 'Aamir Khan',
  };
  const manager: QuoteMutationActor = {
    firebaseUid: 'firebase-manager-01', employeeId: 'emp-manager-01', role: 'Sales Manager',
    active: true, salesTeamId: 'sales-team-01', name: 'Sana Manager',
  };
  const otherExecutive: QuoteMutationActor = {
    firebaseUid: 'firebase-sales-02', employeeId: 'emp-sales-02', role: 'Sales Executive',
    active: true, salesTeamId: 'sales-team-01', name: 'Other Executive',
  };
  const otherTeamManager: QuoteMutationActor = {
    firebaseUid: 'firebase-manager-02', employeeId: 'emp-manager-02', role: 'Sales Manager',
    active: true, salesTeamId: 'sales-team-02', name: 'Other Team Manager',
  };

  function customerPackage(label: string, price: number): CustomerPackageDocument {
    return {
      brand: { name: 'Booking Bridge', tagline: 'Travel, thoughtfully arranged', email: 'travel@bookingbridge.com', phone: '+91 99999 00000' },
      packageReference: `quote-${label.toLowerCase()}`,
      customerName: 'Ayesha Khan', destination: 'Kashmir', travelStartDate: '2026-10-15', travelEndDate: '2026-10-20',
      travelerCount: 2,
      hotels: [{ hotelName: `${label} Hotel`, roomCategoryName: `${label} Room`, mealPlan: 'MAP', checkInDate: '2026-10-15', checkOutDate: '2026-10-20', nights: 5, rooms: 1 }],
      transports: [{ vehicleName: label === 'Premium' ? 'Private Innova' : 'Private Sedan', route: 'Kashmir Circuit', days: 6, passengerCount: 2 }],
      activities: [
        { activityName: 'Shikara Ride', participantCount: 2, inclusionStatus: 'INCLUDED' },
        { activityName: 'Gondola Ride', participantCount: 2, inclusionStatus: 'OPTIONAL' },
      ],
      itinerary: [{
        dayNumber: 1, date: '2026-10-15', title: 'Arrival in Srinagar', description: 'Airport welcome and hotel check-in.',
        location: 'Srinagar', items: [
          { type: 'HOTEL', title: `${label} Hotel`, propertyName: `${label} Hotel`, roomCategoryName: `${label} Room`, mealPlan: 'MAP' },
          { type: 'TRANSPORT', title: 'Private transfer', vehicleName: 'Private Sedan' },
          { type: 'ACTIVITY', title: 'Shikara Ride', activityName: 'Shikara Ride', inclusionStatus: 'INCLUDED' },
          { type: 'ACTIVITY', title: 'Gondola Ride', activityName: 'Gondola Ride', inclusionStatus: 'OPTIONAL' },
        ],
      }],
      packageSellingPrice: price, currency: 'INR', inclusions: ['Hotel', 'Private transfers', 'Shikara Ride'],
      exclusions: ['Flights', 'Personal expenses'], termsAndConditions: 'Subject to availability and cancellation terms.',
      generatedAt: '2026-10-01T00:00:00.000Z',
    };
  }

  function option(label: string, order: number, price: number, recommended = false): Quote {
    const id = `quote-${label.toLowerCase()}`;
    const snapshot = customerPackage(label, price) as any;
    snapshot.supplierCost = 1;
    snapshot.hotels[0].supplierId = 'supplier-secret';
    snapshot.itinerary[0].items[0].packageSupplierRate = { amount: 1 };
    return {
      id, optionId: id, quoteGroupId: 'group-kashmir', optionLabel: label, customerTitle: 'Your Kashmir Holiday',
      optionOrder: order, isRecommended: recommended, optionStatus: 'READY', optionSnapshotCreatedAt: '2026-10-01T00:00:00.000Z',
      leadId: 'lead-01', customerId: 'customer-01', customerName: 'Ayesha Khan', customerPhone: '+919999999999', customerEmail: 'ayesha@example.com',
      destination: 'Kashmir', tripId: 'trip-01', travelerCount: 2, adults: 2, children: 0, durationDays: 6, durationNights: 5,
      totalAmount: price, discountAmount: 0, finalAmount: price, totalSupplierCost: 50_000,
      grossProfit: price - 50_000, grossMargin: Number((((price - 50_000) / price) * 100).toFixed(1)),
      supplierCostSource: { type: 'TRIP', sourceId: 'trip-01', asOf: '2026-10-01T00:00:00.000Z', costingRevision: 1 },
      supplierCostBreakdown: { accommodation: { total: 35_000, items: [] }, transport: { total: 12_000, items: [] }, activities: { total: 3_000, items: [] }, other: { total: 0, items: [] }, total: 50_000 },
      approval: { required: false, state: 'NOT_REQUIRED' }, requiresLowMarginApproval: false,
      status: 'DRAFT', validUntil: '2026-10-31', createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
      salesEmployeeId: executive.employeeId, salesEmployeeName: executive.name, salesTeamId: executive.salesTeamId,
      createdByEmployeeId: executive.employeeId, updatedByEmployeeId: executive.employeeId,
      customerPackageSnapshot: snapshot, version: 1, versionHistory: [],
    };
  }

  beforeEach(() => {
    storage = new InMemoryConversionStorageProvider({
      trips: [{
        id: 'trip-01', assignedSalesEmployeeId: executive.employeeId, salesTeamId: executive.salesTeamId,
        costingStatus: 'CALCULATED', costingRevision: 1, costingCalculatedRevision: 1,
        totalSupplierCost: 50_000, totalSellingPrice: 72_000, updatedAt: '2026-10-01T00:00:00.000Z',
      }],
      quotes: [option('Value', 1, 62_000), option('Recommended', 2, 72_000, true), option('Premium', 3, 86_000)],
    });
    storage.rawSet('itinerary_days', 'day-01', {
      id: 'day-01', tripId: 'trip-01', dayNumber: 1,
      customerContent: { status: 'CURRENT', updatedAt: '2026-10-01T00:00:00.000Z' },
    });
    service = new QuoteService(storage);
  });

  it('generates a server-owned high-entropy token, stores only its hash, and records safe history/audit', async () => {
    const result = await service.createCustomerShare('group-kashmir', { expiresInDays: 14 }, executive);
    const token = result.publicPath.split('/').at(-1)!;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(token).not.toContain('group-kashmir');
    expect(token).not.toContain('quote-');
    expect(result.share).toMatchObject({ quoteGroupId: 'group-kashmir', version: 1, status: 'ACTIVE', createdByName: executive.name, viewCount: 0 });
    const stored = storage.rawList('customer_shares')[0];
    expect(stored.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(stored)).not.toContain(token);
    expect(storage.rawList('quotes').every(quote => quote.optionStatus === 'SHARED')).toBe(true);
    const audit = storage.getAllAuditLogs().find(entry => entry.action === 'CUSTOMER_SHARE_CREATED');
    expect(audit).toMatchObject({ actorId: executive.employeeId, entityType: 'CUSTOMER_SHARE' });
    expect(JSON.stringify(audit)).not.toContain(token);
  });

  it('returns only the dedicated customer projection and rejects invalid/direct-ID tokens', async () => {
    const result = await service.createCustomerShare('group-kashmir', { expiresInDays: null }, executive);
    const token = result.publicPath.split('/').at(-1)!;
    const publicView = await service.openCustomerShare(token);
    expect(publicView).toMatchObject({ preparedFor: 'Ayesha', destination: 'Kashmir' });
    expect(publicView.options).toHaveLength(3);
    expect(publicView.options.filter(item => item.recommended)).toHaveLength(1);
    const serialized = JSON.stringify(publicView);
    for (const forbidden of [
      'supplierCost', 'supplierCostBreakdown', 'supplierId', 'packageSupplierRate', 'grossProfit', 'grossMargin',
      'approval', 'employeeId', 'customerId', 'quoteId', 'optionId', 'customerPhone', 'customerEmail', 'audit',
    ]) expect(serialized).not.toContain(forbidden);
    await expect(service.openCustomerShare('quote-recommended'))
      .rejects.toMatchObject({ statusCode: 404, code: 'CUSTOMER_SHARE_NOT_FOUND' });
    await expect(service.openCustomerShare('A'.repeat(43)))
      .rejects.toMatchObject({ statusCode: 404, code: 'CUSTOMER_SHARE_NOT_FOUND' });
  });

  it('tracks simple opens, revokes immediately, expires safely, and retains Quote history', async () => {
    const first = await service.createCustomerShare('group-kashmir', { expiresInDays: 7 }, executive);
    const token = first.publicPath.split('/').at(-1)!;
    await service.openCustomerShare(token);
    await service.openCustomerShare(token);
    expect((await service.listCustomerShares('group-kashmir', executive))[0]).toMatchObject({ viewCount: 2 });
    expect((await service.listCustomerShares('group-kashmir', executive))[0].firstViewedAt).toBeTruthy();
    const revoked = await service.revokeCustomerShare(first.share.shareId, executive);
    expect(revoked.status).toBe('REVOKED');
    await expect(service.openCustomerShare(token)).rejects.toMatchObject({ statusCode: 410, code: 'CUSTOMER_SHARE_REVOKED' });
    expect(storage.rawList('quotes')).toHaveLength(3);

    const second = await service.createCustomerShare('group-kashmir', { expiresInDays: 7 }, manager);
    const secondToken = second.publicPath.split('/').at(-1)!;
    storage.rawUpdate('customer_shares', second.share.shareId, { expiresAt: '2020-01-01T00:00:00.000Z' });
    await expect(service.openCustomerShare(secondToken)).rejects.toMatchObject({ statusCode: 410, code: 'CUSTOMER_SHARE_EXPIRED' });
  });

  it('keeps V1 immutable after live changes and creates a distinct V2 snapshot explicitly', async () => {
    const first = await service.createCustomerShare('group-kashmir', { expiresInDays: null }, executive);
    const firstToken = first.publicPath.split('/').at(-1)!;
    const v1 = await service.openCustomerShare(firstToken);

    storage.rawUpdate('trips', 'trip-01', { totalSupplierCost: 60_000, totalSellingPrice: 90_000, costingRevision: 2, costingCalculatedRevision: 2 });
    for (const quote of storage.rawList('quotes')) {
      const snapshot = customerPackage(quote.optionLabel, quote.optionLabel === 'Recommended' ? 90_000 : quote.finalAmount);
      snapshot.hotels[0].hotelName = `${quote.optionLabel} V2 Palace`;
      storage.rawUpdate('quotes', quote.id, {
        finalAmount: snapshot.packageSellingPrice, totalAmount: snapshot.packageSellingPrice, totalSupplierCost: 60_000,
        supplierCostSource: { type: 'TRIP', sourceId: 'trip-01', asOf: '2026-10-02T00:00:00.000Z', costingRevision: 2 },
        customerPackageSnapshot: snapshot, optionStatus: 'READY', status: 'DRAFT',
      });
    }
    expect(await service.openCustomerShare(firstToken)).toEqual(v1);
    const second = await service.createCustomerShare('group-kashmir', { expiresInDays: null }, executive);
    const v2 = await service.openCustomerShare(second.publicPath.split('/').at(-1)!);
    expect(v2.options.find(item => item.label === 'Recommended')?.packageSellingPrice).toBe(90_000);
    expect(v2.options.find(item => item.label === 'Recommended')?.package.hotels[0].hotelName).toBe('Recommended V2 Palace');
    expect((await service.openCustomerShare(firstToken)).options.find(item => item.label === 'Recommended')?.packageSellingPrice).toBe(72_000);
  });

  it('enforces OWN/TEAM scope, rejects client tokens, and fails new shares closed on readiness', async () => {
    await expect(service.createCustomerShare('group-kashmir', { expiresInDays: 14 }, otherExecutive))
      .rejects.toMatchObject({ statusCode: 403, code: 'RESOURCE_ACCESS_DENIED' });
    await expect(service.createCustomerShare('group-kashmir', { expiresInDays: 14, token: 'forged' }, executive))
      .rejects.toMatchObject({ statusCode: 400, code: 'UNSUPPORTED_SHARE_FIELD' });
    expect(storage.rawList('customer_shares')).toHaveLength(0);

    storage.rawUpdate('trips', 'trip-01', { costingStatus: 'PENDING' });
    await expect(service.createCustomerShare('group-kashmir', {}, executive))
      .rejects.toMatchObject({ statusCode: 409, code: 'TRIP_COSTING_PENDING' });
    storage.rawUpdate('trips', 'trip-01', { costingStatus: 'CALCULATED' });
    storage.rawUpdate('itinerary_days', 'day-01', { customerContent: { status: 'REVIEW_NEEDED' } });
    await expect(service.createCustomerShare('group-kashmir', {}, executive))
      .rejects.toMatchObject({ statusCode: 409, code: 'ITINERARY_REVIEW_REQUIRED' });
    storage.rawUpdate('itinerary_days', 'day-01', { customerContent: { status: 'CURRENT' } });
    storage.rawUpdate('quotes', 'quote-recommended', { approval: { required: true, state: 'REVIEW_REQUIRED', thresholdPercent: 40 } });
    await expect(service.createCustomerShare('group-kashmir', {}, executive))
      .rejects.toMatchObject({ statusCode: 409, code: 'COMMERCIAL_APPROVAL_REQUIRED' });
    expect(storage.rawList('customer_shares')).toHaveLength(0);

    storage.rawUpdate('quotes', 'quote-recommended', { approval: { required: false, state: 'NOT_REQUIRED' } });
    const managerCreated = await service.createCustomerShare('group-kashmir', {}, manager);
    await expect(service.revokeCustomerShare(managerCreated.share.shareId, otherExecutive))
      .rejects.toMatchObject({ statusCode: 403, code: 'RESOURCE_ACCESS_DENIED' });
    expect(storage.rawGet('customer_shares', managerCreated.share.shareId).status).toBe('ACTIVE');
  });

  it('generates a customer-safe PDF from the frozen version and audits canonical employeeId', async () => {
    const created = await service.createCustomerShare('group-kashmir', { expiresInDays: 14 }, executive);
    const pdf = await service.generateCustomerSharePdf(created.share.shareId, executive);
    const text = new TextDecoder().decode(pdf.bytes);
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf.filename).toBe('Booking-Bridge-Kashmir-Package-Ayesha-2026.pdf');
    for (const expected of [
      'BOOKING BRIDGE', 'PACKAGE OPTIONS', 'RECOMMENDED', 'INR 72,000',
      'DAY-BY-DAY ITINERARY', 'Arrival in Srinagar', 'Recommended Hotel',
      'Private Sedan', 'Shikara Ride', 'Optional experiences', 'Personal expenses',
      'Terms and cancellation',
    ]) expect(text).toContain(expected);
    for (const forbidden of [
      'supplierCost', 'supplier-secret', 'packageSupplierRate', 'grossProfit',
      'grossMargin', 'approval', executive.employeeId,
    ]) expect(text).not.toContain(forbidden);
    expect(pdf.share.pdfGeneratedCount).toBe(1);
    const audit = storage.getAllAuditLogs().find(entry => entry.action === 'QUOTE_PDF_GENERATED');
    expect(audit).toMatchObject({ actorId: executive.employeeId, entityType: 'CUSTOMER_SHARE' });
    expect(JSON.stringify(audit)).not.toContain(created.publicPath.split('/').at(-1)!);
  });

  it('prepares accurate WhatsApp/email delivery without claiming send and rejects stale or mismatched links', async () => {
    const first = await service.createCustomerShare('group-kashmir', { expiresInDays: 14 }, executive);
    const firstToken = first.publicPath.split('/').at(-1)!;
    const whatsApp = await service.prepareCustomerShareDelivery(first.share.shareId, {
      channel: 'WHATSAPP', token: firstToken,
    }, 'https://bbos.example', executive);
    expect(whatsApp).toMatchObject({
      channel: 'WHATSAPP', version: 1, recipient: '919999999999', recipientAvailable: true,
      customerLink: `https://bbos.example${first.publicPath}`,
    });
    expect(whatsApp.body).toContain('Hi Ayesha');
    expect(whatsApp.body).toContain('holiday package options');
    expect(whatsApp.body).not.toContain('supplier');
    expect(whatsApp.body).not.toContain('profit');

    const email = await service.prepareCustomerShareDelivery(first.share.shareId, {
      channel: 'EMAIL', token: firstToken,
    }, 'https://bbos.example', manager);
    expect(email).toMatchObject({
      channel: 'EMAIL', recipient: 'ayesha@example.com', recipientAvailable: true,
      subject: 'Kashmir Package Options for Ayesha - Booking Bridge',
    });
    expect(email.body).toContain(`https://bbos.example${first.publicPath}`);
    expect(storage.getAllAuditLogs().some(entry => entry.action === 'WHATSAPP_SHARE_PREPARED')).toBe(true);
    expect(storage.getAllAuditLogs().some(entry => entry.action === 'EMAIL_SHARE_PREPARED')).toBe(true);
    expect(storage.getAllAuditLogs().some(entry => ['WHATSAPP_SENT', 'EMAIL_SENT'].includes(entry.action))).toBe(false);

    const second = await service.createCustomerShare('group-kashmir', { expiresInDays: 14 }, executive);
    const secondToken = second.publicPath.split('/').at(-1)!;
    await expect(service.prepareCustomerShareDelivery(first.share.shareId, {
      channel: 'EMAIL', token: secondToken,
    }, 'https://bbos.example', executive)).rejects.toMatchObject({ statusCode: 409, code: 'ACTIVE_CUSTOMER_LINK_REQUIRED' });
    await expect(service.prepareCustomerShareDelivery(first.share.shareId, {
      channel: 'EMAIL', token: firstToken,
    }, 'https://bbos.example', otherExecutive)).rejects.toMatchObject({ statusCode: 403, code: 'RESOURCE_ACCESS_DENIED' });
    await expect(service.prepareCustomerShareDelivery(first.share.shareId, {
      channel: 'WHATSAPP', token: firstToken,
    }, 'https://bbos.example', otherTeamManager)).rejects.toMatchObject({ statusCode: 403, code: 'RESOURCE_ACCESS_DENIED' });
    await service.revokeCustomerShare(first.share.shareId, executive);
    await expect(service.prepareCustomerShareDelivery(first.share.shareId, {
      channel: 'WHATSAPP', token: firstToken,
    }, 'https://bbos.example', executive)).rejects.toMatchObject({ statusCode: 409, code: 'ACTIVE_CUSTOMER_LINK_REQUIRED' });

    storage.rawUpdate('customer_shares', second.share.shareId, { expiresAt: '2020-01-01T00:00:00.000Z' });
    await expect(service.prepareCustomerShareDelivery(second.share.shareId, {
      channel: 'EMAIL', token: secondToken,
    }, 'https://bbos.example', executive)).rejects.toMatchObject({ statusCode: 409, code: 'ACTIVE_CUSTOMER_LINK_REQUIRED' });
    expect(secondToken).not.toBe(firstToken);
  });
});
