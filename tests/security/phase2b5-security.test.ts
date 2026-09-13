import { describe, it, expect } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import {
  Booking,
  BookingAccommodation,
  BookingTransport,
  BookingActivity,
  FinancialSnapshot,
  LineItemCostSnapshot,
  PaymentRecord,
  BookingStatus,
  PaymentStatus,
  PaymentRecordStatus,
} from '../../src/types/index';

describe('Phase 2B-5 Security & Architecture Verification', () => {
  // Read firestore.rules for AST / syntactic rules verification
  const rulesPath = path.resolve(__dirname, '../../firestore.rules');
  const firestoreRules = fs.readFileSync(rulesPath, 'utf8');

  describe('1. Invariant: Financial Snapshot Access & Mutation Security', () => {
    it('Sales Executive and Operations CANNOT read financial_snapshot in firestore.rules', () => {
      // Must contain match block for financial_snapshot under bookings
      const snapshotMatch = firestoreRules.match(/match\s+\/financial_snapshot\/\{snapshotId\}\s*\{([\s\S]*?)\}/);
      expect(snapshotMatch).not.toBeNull();
      const snapshotRules = snapshotMatch![1];

      // Read must only allow Founder, Admin, Accounts
      expect(snapshotRules).toContain('allow read: if isFounder() || isAdmin() || isAccounts();');
      expect(snapshotRules).not.toContain('isSalesExecutive');
      expect(snapshotRules).not.toContain('isOperations');
    });

    it('Clients (including Founder, Admin, Accounts) CANNOT create, update, or delete financial_snapshot', () => {
      const snapshotMatch = firestoreRules.match(/match\s+\/financial_snapshot\/\{snapshotId\}\s*\{([\s\S]*?)\}/);
      expect(snapshotMatch).not.toBeNull();
      const snapshotRules = snapshotMatch![1];

      // Must strictly deny client writes
      expect(snapshotRules).toContain('allow create, update, delete: if false;');
    });

    it('FinancialSnapshot model strictly retains frozen supplier rates and audit metadata', () => {
      const lineItem: LineItemCostSnapshot = {
        serviceId: 'acc-01',
        serviceType: 'ACCOMMODATION',
        supplierId: 'sup-hotel-01',
        supplierName: 'The Grand Cedar',
        inventoryMasterId: 'prop-01',
        ratePeriodId: 'rp-01',
        rateContractType: 'STANDARD',
        frozenSupplierUnitRate: 4500,
        units: 3,
        frozenSupplementsCost: 1000,
        frozenTotalSupplierCost: 14500,
        taxTreatment: 'NET',
        taxAmount: 0,
        rateVerifiedAt: '2026-09-11T10:00:00Z',
      };

      const snapshot: FinancialSnapshot = {
        id: 'snap-01',
        bookingId: 'bk-01',
        snapshotVersion: 1,
        quoteId: 'q-01',
        quoteVersion: 1,
        currency: 'INR',
        totalSellingPrice: 25000,
        totalSupplierCost: 14500,
        accommodationSupplierCost: 14500,
        transportSupplierCost: 0,
        activitySupplierCost: 0,
        otherSupplierCosts: 0,
        grossProfit: 10500,
        grossMargin: 42.0,
        lineItems: [lineItem],
        rateValidationFingerprint: 'sha256-canonical-hash-proof',
        createdAt: '2026-09-11T10:00:00Z',
        createdBy: 'system-conversion-engine',
      };

      expect(snapshot.snapshotVersion).toBe(1);
      expect(snapshot.grossProfit).toBe(10500);
      expect(snapshot.lineItems[0].frozenTotalSupplierCost).toBe(14500);
    });
  });

  describe('2. Invariant: Top-Level Booking Commercial Purity & Field Protection', () => {
    it('Booking document model contains ZERO supplier-cost or profitability fields', () => {
      const booking: Booking = {
        id: 'bk-test-01',
        bookingReference: 'BK-1001',
        tripId: 'trip-01',
        customerId: 'cust-01',
        status: 'PENDING_PAYMENT',
        paymentStatus: 'UNPAID',
        totalSellingPrice: 75000,
        amountReceived: 0,
        amountPending: 75000,
        travelStartDate: '2026-10-01',
        travelEndDate: '2026-10-07',
        schemaVersion: '2B-5',
        createdAt: '2026-09-11T10:00:00Z',
        updatedAt: '2026-09-11T10:00:00Z',
      };

      // Forbidden cost and margin properties
      const forbiddenProperties = [
        'totalSupplierCost',
        'grossProfit',
        'grossMargin',
        'hotelCost',
        'transportCost',
        'activityCost',
        'supplierBuyRate',
        'negotiatedSupplierRate',
        'internalCost',
      ];

      for (const prop of forbiddenProperties) {
        expect((booking as any)[prop]).toBeUndefined();
      }

      // Permitted financial properties
      expect(booking.totalSellingPrice).toBe(75000);
      expect(booking.amountReceived).toBe(0);
      expect(booking.amountPending).toBe(75000);
      expect(booking.paymentStatus).toBe('UNPAID');
    });

    it('Clients cannot directly modify protected financial aggregates on bookings', () => {
      const bookingMatch = firestoreRules.match(/match\s+\/bookings\/\{bookingId\}\s*\{([\s\S]*?)(match\s+\/financial_snapshot|$)/);
      expect(bookingMatch).not.toBeNull();
      const bookingRules = bookingMatch![1];

      // Verify affectedKeys prevents direct manipulation
      expect(bookingRules).toContain('totalSellingPrice');
      expect(bookingRules).toContain('amountReceived');
      expect(bookingRules).toContain('amountPending');
      expect(bookingRules).toContain('paymentStatus');
      expect(bookingRules).toContain('confirmationProgress');
      expect(bookingRules).toContain('schemaVersion');
    });
  });

  describe('3. Invariant: Modern Service Documents Contain Zero Supplier Buy-Cost Fields', () => {
    it('BookingAccommodation contains NO supplier rate or buy-cost fields', () => {
      const accommodation: BookingAccommodation = {
        id: 'acc-service-01',
        bookingId: 'bk-01',
        tripId: 'trip-01',
        customerId: 'cust-01',
        propertyId: 'prop-kareem',
        propertyName: 'Hotel Kareem Residency',
        roomCategoryId: 'rc-deluxe',
        roomCategoryName: 'Deluxe Room',
        mealPlan: 'MAP',
        checkInDate: '2026-10-01',
        checkOutDate: '2026-10-04',
        nightsCount: 3,
        roomsCount: 1,
        adultsCount: 2,
        childrenCount: 0,
        supplierId: 'sup-hotel-01',
        confirmationStatus: 'REQUESTED',
        schemaVersion: '2B-5',
        createdAt: '2026-09-11T10:00:00Z',
        updatedAt: '2026-09-11T10:00:00Z',
      };

      expect((accommodation as any).supplierCost).toBeUndefined();
      expect((accommodation as any).supplierBuyRate).toBeUndefined();
      expect((accommodation as any).negotiatedRate).toBeUndefined();
      expect((accommodation as any).grossProfit).toBeUndefined();
      expect((accommodation as any).grossMargin).toBeUndefined();
    });

    it('BookingTransport contains NO supplier rate or buy-cost fields', () => {
      const transport: BookingTransport = {
        id: 'trans-service-01',
        bookingId: 'bk-01',
        tripId: 'trip-01',
        customerId: 'cust-01',
        vehicleCategoryId: 'vc-innova',
        vehicleCategoryName: 'Innova Crysta AC',
        routeName: 'Srinagar to Gulmarg',
        serviceDate: '2026-10-02',
        daysCount: 1,
        pickupLocation: 'Srinagar Hotel',
        dropoffLocation: 'Gulmarg Hotel',
        passengerCount: 2,
        supplierId: 'sup-trans-01',
        confirmationStatus: 'REQUESTED',
        schemaVersion: '2B-5',
        createdAt: '2026-09-11T10:00:00Z',
        updatedAt: '2026-09-11T10:00:00Z',
      };

      expect((transport as any).supplierCost).toBeUndefined();
      expect((transport as any).supplierBuyRate).toBeUndefined();
      expect((transport as any).grossProfit).toBeUndefined();
    });

    it('BookingActivity contains NO supplier rate or buy-cost fields', () => {
      const activity: BookingActivity = {
        id: 'act-service-01',
        bookingId: 'bk-01',
        tripId: 'trip-01',
        customerId: 'cust-01',
        activityMasterId: 'act-gondola',
        activityName: 'Gulmarg Gondola Phase 1 & 2',
        destinationId: 'dest-gulmarg',
        destinationName: 'Gulmarg',
        serviceDate: '2026-10-03',
        participantCount: 2,
        supplierId: 'sup-jk-cablecar',
        confirmationStatus: 'REQUESTED',
        schemaVersion: '2B-5',
        createdAt: '2026-09-11T10:00:00Z',
        updatedAt: '2026-09-11T10:00:00Z',
      };

      expect((activity as any).supplierCost).toBeUndefined();
      expect((activity as any).supplierBuyRate).toBeUndefined();
      expect((activity as any).grossProfit).toBeUndefined();
    });
  });

  describe('4. Invariant: Field-Level Mutation Ownership on Modern Services', () => {
    it('Accommodation: Sales Executive can only modify guestNames and specialRequests', () => {
      const accMatch = firestoreRules.match(/match\s+\/booking_accommodations\/\{docId\}\s*\{([\s\S]*?)\}/);
      expect(accMatch).not.toBeNull();
      const accRules = accMatch![1];

      expect(accRules).toContain("isSalesExecutive() && request.resource.data.diff(resource.data).affectedKeys().hasOnly([\n          'guestNames', 'specialRequests'\n        ])");
      expect(accRules).toContain('isOperations()');
      expect(accRules).toContain('nightsCount');
    });

    it('Transport: Sales Executive can only modify passengerCount and specialRequests', () => {
      const transMatch = firestoreRules.match(/match\s+\/booking_transports\/\{docId\}\s*\{([\s\S]*?)\}/);
      expect(transMatch).not.toBeNull();
      const transRules = transMatch![1];

      expect(transRules).toContain("isSalesExecutive() && request.resource.data.diff(resource.data).affectedKeys().hasOnly([\n          'passengerCount', 'specialRequests'\n        ])");
      expect(transRules).toContain('isOperations()');
      expect(transRules).toContain('vehicleCategoryId');
    });

    it('Activity: Sales Executive can only modify participantCount, leadGuestName, and specialRequests', () => {
      const actMatch = firestoreRules.match(/match\s+\/booking_activities\/\{docId\}\s*\{([\s\S]*?)\}/);
      expect(actMatch).not.toBeNull();
      const actRules = actMatch![1];

      expect(actRules).toContain("isSalesExecutive() && request.resource.data.diff(resource.data).affectedKeys().hasOnly([\n          'participantCount', 'leadGuestName', 'specialRequests'\n        ])");
      expect(actRules).toContain('isOperations()');
      expect(actRules).toContain('activityMasterId');
    });
  });

  describe('5. Invariant: Payment Verification Security & Role Boundaries', () => {
    it('Payment creation requires RECORDED status and verifiedBy == null', () => {
      const paymentMatch = firestoreRules.match(/match\s+\/payments\/\{paymentId\}\s*\{([\s\S]*?)\}/);
      expect(paymentMatch).not.toBeNull();
      const paymentRules = paymentMatch![1];

      expect(paymentRules).toContain("request.resource.data.status == 'RECORDED'");
      expect(paymentRules).toContain("request.resource.data.verifiedBy == null");
    });

    it('Sales role CANNOT verify payments in firestore.rules', () => {
      const paymentMatch = firestoreRules.match(/match\s+\/payments\/\{paymentId\}\s*\{([\s\S]*?)\}/);
      expect(paymentMatch).not.toBeNull();
      const paymentRules = paymentMatch![1];

      // allow update must require isAccounts() || isAdmin()
      expect(paymentRules).toContain("allow update: if (isAccounts() || isAdmin())");
      expect(paymentRules).not.toContain("allow update: if isSalesManager()");
      expect(paymentRules).not.toContain("allow update: if isSalesExecutive()");
    });

    it('PaymentRecord model separates recording from verification metadata', () => {
      const payment: PaymentRecord = {
        id: 'pay-01',
        bookingId: 'bk-01',
        customerId: 'cust-01',
        amount: 25000,
        paymentDate: '2026-09-11',
        paymentMethod: 'UPI',
        referenceNumber: 'UPI-REF-992102',
        paymentType: 'ADVANCE',
        notes: '30% advance deposit',
        recordedBy: 'emp-sales-01',
        status: 'RECORDED',
        createdAt: '2026-09-11T10:00:00Z',
        updatedAt: '2026-09-11T10:00:00Z',
      };

      expect(payment.status).toBe('RECORDED');
      expect(payment.verifiedBy).toBeUndefined();

      // Verified by accounts
      const verifiedPayment: PaymentRecord = {
        ...payment,
        status: 'VERIFIED',
        verifiedBy: 'emp-accounts-01',
        verifiedByName: 'Accounts Lead',
        verifiedAt: '2026-09-11T11:00:00Z',
      };

      expect(verifiedPayment.status).toBe('VERIFIED');
      expect(verifiedPayment.verifiedBy).toBe('emp-accounts-01');
    });
  });

  describe('6. Invariant: Legacy Collections Preserved as Read-Only Historical Freeze', () => {
    it('hotel_bookings, transports, and activity_bookings deny all create, update, delete', () => {
      const hotelBookingsMatch = firestoreRules.match(/match\s+\/hotel_bookings\/\{bookingId\}\s*\{([\s\S]*?)\}/);
      expect(hotelBookingsMatch).not.toBeNull();
      expect(hotelBookingsMatch![1]).toContain('allow create, update, delete: if false;');

      const transportsMatch = firestoreRules.match(/match\s+\/transports\/\{transportId\}\s*\{([\s\S]*?)\}/);
      expect(transportsMatch).not.toBeNull();
      expect(transportsMatch![1]).toContain('allow create, update, delete: if false;');

      const activityBookingsMatch = firestoreRules.match(/match\s+\/activity_bookings\/\{bookingId\}\s*\{([\s\S]*?)\}/);
      expect(activityBookingsMatch).not.toBeNull();
      expect(activityBookingsMatch![1]).toContain('allow create, update, delete: if false;');
    });
  });

  describe('7. Invariant: Quote Conversions Collection Security (Immutable Server-Only Markers)', () => {
    it('quote_conversions read is restricted to Founder, Admin, Accounts ONLY', () => {
      const convMatch = firestoreRules.match(/match\s+\/quote_conversions\/\{conversionId\}\s*\{([\s\S]*?)\}/);
      expect(convMatch).not.toBeNull();
      const convRules = convMatch![1];

      // Read must only allow Founder, Admin, Accounts
      expect(convRules).toContain('allow read: if isFounder() || isAdmin() || isAccounts();');
      // Sales, Ops, Marketing must NOT appear in read rules
      expect(convRules).not.toContain('isSalesExecutive');
      expect(convRules).not.toContain('isSalesManager');
      expect(convRules).not.toContain('isOperations');
      expect(convRules).not.toContain('isMarketing');
    });

    it('Clients (ALL roles) CANNOT create, update, or delete quote_conversions', () => {
      const convMatch = firestoreRules.match(/match\s+\/quote_conversions\/\{conversionId\}\s*\{([\s\S]*?)\}/);
      expect(convMatch).not.toBeNull();
      const convRules = convMatch![1];

      // Must strictly deny all client mutations
      expect(convRules).toContain('allow create, update, delete: if false;');
    });
  });
});
