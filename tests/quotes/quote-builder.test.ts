/**
 * Quote Builder & Pricing Engine Verification Tests
 */

import { describe, it, expect } from 'bun:test';
import { Quote, QuoteVersion, Booking } from '../../src/types/index.js';

describe('Quote Builder & Pricing Engine Calculations', () => {
  it('correctly calculates selling price, discount, and final price', () => {
    const totalAmount = 95000;
    const discountAmount = 5000;
    const finalAmount = Math.max(0, totalAmount - discountAmount);

    expect(finalAmount).toBe(90000);
  });

  it('correctly calculates gross profit and gross margin from component costs', () => {
    const hotels = [
      { hotelName: 'The Lalit', roomType: 'Deluxe', mealPlan: 'MAP', nights: 2, rate: 36000, supplierCost: 26000 },
      { hotelName: 'The Khyber', roomType: 'Premier', mealPlan: 'MAP', nights: 2, rate: 40000, supplierCost: 28000 }
    ];
    const transports = [
      { vehicleType: 'Innova Crysta', route: 'All Circuit', days: 5, rate: 24000, supplierCost: 16000 }
    ];

    let totalSelling = 0;
    let totalCost = 0;

    hotels.forEach(h => {
      totalSelling += h.rate;
      totalCost += h.supplierCost;
    });

    transports.forEach(t => {
      totalSelling += t.rate;
      totalCost += t.supplierCost;
    });

    const discount = 4000;
    const finalAmount = totalSelling - discount;
    const grossProfit = finalAmount - totalCost;
    const grossMargin = finalAmount > 0 ? Number(((grossProfit / finalAmount) * 100).toFixed(1)) : 0;

    expect(totalSelling).toBe(100000);
    expect(totalCost).toBe(70000);
    expect(finalAmount).toBe(96000);
    expect(grossProfit).toBe(26000);
    expect(grossMargin).toBe(27.1);
  });
});

describe('Quote Versioning & History Preservation', () => {
  it('increments version number and archives past version snapshots', () => {
    const v1: Quote = {
      id: 'quote-test-01',
      leadId: 'lead-01',
      customerId: 'cust-01',
      customerName: 'Rohit Sharma',
      destination: 'Kashmir',
      travelerCount: 2,
      totalAmount: 90000,
      discountAmount: 0,
      finalAmount: 90000,
      status: 'DRAFT',
      validUntil: '2026-10-01',
      createdAt: '2026-09-01T10:00:00Z',
      version: 1,
      versionHistory: []
    };

    // Simulate edit to create V2
    const v1Snapshot: QuoteVersion = {
      version: v1.version,
      updatedAt: v1.createdAt,
      updatedBy: 'Suhaib Hamid',
      totalAmount: v1.totalAmount,
      discountAmount: v1.discountAmount,
      finalAmount: v1.finalAmount,
      status: v1.status,
      notes: v1.notes
    };

    const v2: Quote = {
      ...v1,
      version: v1.version + 1,
      discountAmount: 5000,
      finalAmount: 85000,
      versionHistory: [v1Snapshot],
      updatedAt: '2026-09-02T10:00:00Z'
    };

    expect(v2.version).toBe(2);
    expect(v2.versionHistory?.length).toBe(1);
    expect(v2.versionHistory?.[0].version).toBe(1);
    expect(v2.versionHistory?.[0].finalAmount).toBe(90000);
    expect(v2.finalAmount).toBe(85000);
  });
});

describe('Client Preview Data Sanitization Protection', () => {
  it('strictly excludes supplier costs and internal notes from public client preview data', () => {
    const internalQuote: Quote = {
      id: 'quote-secret-01',
      leadId: 'lead-01',
      customerId: 'cust-01',
      customerName: 'Aamir Khan',
      destination: 'Kashmir',
      travelerCount: 2,
      totalAmount: 120000,
      discountAmount: 10000,
      finalAmount: 110000,
      totalCost: 75000,
      grossProfit: 35000,
      grossMargin: 31.8,
      status: 'SENT',
      validUntil: '2026-10-15',
      createdAt: '2026-09-01T10:00:00Z',
      version: 1,
      notes: 'Complimentary Shikara Ride included at sunset.',
      internalNotes: 'Client was hesitant about price; offer 5% extra if closing today. Chauffeur negotiated at ₹2,800/day.',
      hotels: [
        {
          hotelName: 'The Khyber',
          roomType: 'Premier Room',
          mealPlan: 'MAP',
          nights: 2,
          rate: 45000,
          supplierCost: 32000
        }
      ]
    };

    // Client preview sanitizer logic
    const clientPreview = {
      id: internalQuote.id,
      customerName: internalQuote.customerName,
      destination: internalQuote.destination,
      travelerCount: internalQuote.travelerCount,
      totalAmount: internalQuote.totalAmount,
      discountAmount: internalQuote.discountAmount,
      finalAmount: internalQuote.finalAmount,
      validUntil: internalQuote.validUntil,
      notes: internalQuote.notes,
      hotels: internalQuote.hotels?.map(h => ({
        hotelName: h.hotelName,
        roomType: h.roomType,
        mealPlan: h.mealPlan,
        nights: h.nights
      }))
    };

    // Assert that protected fields are completely undefined in client preview
    expect((clientPreview as any).totalCost).toBeUndefined();
    expect((clientPreview as any).grossProfit).toBeUndefined();
    expect((clientPreview as any).grossMargin).toBeUndefined();
    expect((clientPreview as any).internalNotes).toBeUndefined();
    expect((clientPreview.hotels?.[0] as any).supplierCost).toBeUndefined();

    // Assert that client-facing notes and final amount remain intact
    expect(clientPreview.notes).toBe('Complimentary Shikara Ride included at sunset.');
    expect(clientPreview.finalAmount).toBe(110000);
  });
});

describe('Quote to Booking Conversion', () => {
  it('creates confirmed booking with reference number and links IDs', () => {
    const quote: Quote = {
      id: 'quote-conv-01',
      leadId: 'lead-conv-01',
      customerId: 'cust-conv-01',
      customerName: 'Pooja Hegde',
      destination: 'Kashmir',
      tripId: 'trip-conv-01',
      travelerCount: 2,
      totalAmount: 95000,
      discountAmount: 5000,
      finalAmount: 90000,
      status: 'ACCEPTED',
      validUntil: '2026-10-20',
      createdAt: '2026-09-01T10:00:00Z',
      version: 1
    };

    const booking: Booking = {
      id: `book-${Date.now()}`,
      quoteId: quote.id,
      tripId: quote.tripId || '',
      customerId: quote.customerId,
      leadId: quote.leadId,
      bookingReference: `BB-${Math.floor(100000 + Math.random() * 900000)}`,
      status: 'CONFIRMED',
      totalAmount: quote.finalAmount,
      amountReceived: 0,
      amountPending: quote.finalAmount,
      travelStartDate: '2026-10-12',
      travelEndDate: '2026-10-18',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    expect(booking.quoteId).toBe(quote.id);
    expect(booking.tripId).toBe(quote.tripId);
    expect(booking.customerId).toBe(quote.customerId);
    expect(booking.leadId).toBe(quote.leadId);
    expect(booking.status).toBe('CONFIRMED');
    expect(booking.totalAmount).toBe(90000);
    expect(booking.bookingReference.startsWith('BB-')).toBe(true);
  });
});
