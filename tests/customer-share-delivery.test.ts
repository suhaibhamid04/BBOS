import { describe, expect, test } from 'bun:test';
import {
  buildCustomerDeliveryPreparation,
  normalizeDeliveryEmail,
  normalizeWhatsAppPhone,
} from '../src/services/quote/customerShareDelivery';
import type { CustomerSharePublicView } from '../src/types';

const snapshot = (optionCount: number): CustomerSharePublicView => ({
  brand: { name: 'Booking Bridge', tagline: 'Travel, thoughtfully arranged', email: 'travel@bookingbridge.com', phone: '+91 99999 00000' },
  title: 'Kashmir Holiday', preparedFor: 'Aamir', destination: 'Kashmir', travelerCount: 2,
  options: Array.from({ length: optionCount }, (_, index) => ({
    key: `option-${index + 1}`, label: `Option ${index + 1}`, order: index + 1, recommended: index === 0,
    packageSellingPrice: 72_000, currency: 'INR', travelerCount: 2,
    hotelHighlights: [], transportHighlights: [], includedActivityHighlights: [], optionalActivityHighlights: [],
    validUntil: '2026-10-31',
    package: {
      brand: { name: 'Booking Bridge', tagline: 'Travel, thoughtfully arranged', email: 'travel@bookingbridge.com', phone: '+91 99999 00000' },
      packageReference: `option-${index + 1}`, customerName: 'Aamir', destination: 'Kashmir', travelerCount: 2,
      hotels: [], transports: [], activities: [], itinerary: [], packageSellingPrice: 72_000, currency: 'INR',
      inclusions: [], exclusions: [], generatedAt: '2026-10-01T00:00:00.000Z',
    },
  })),
  frozenAt: '2026-10-01T00:00:00.000Z',
});

describe('M5B.2 delivery preparation helpers', () => {
  test('normalizes valid phones and provides an invalid/missing-phone fallback', () => {
    expect(normalizeWhatsAppPhone('+91 98765 43210')).toBe('919876543210');
    expect(normalizeWhatsAppPhone('9876543210')).toBe('919876543210');
    expect(normalizeWhatsAppPhone('12')).toBeUndefined();
    const prepared = buildCustomerDeliveryPreparation({
      shareId: 'share-1', quoteGroupId: 'group-1', version: 1, channel: 'WHATSAPP', snapshot: snapshot(1),
      customerLink: 'https://bbos.example/quote/share/token', customerPhone: 'bad', preparedAt: '2026-10-01T00:00:00.000Z',
    });
    expect(prepared.recipientAvailable).toBe(false);
    expect(prepared.body).toContain('holiday package.');
    expect(prepared.body).not.toContain('package options');
  });

  test('normalizes email, uses plural option wording, and exposes no internal economics', () => {
    expect(normalizeDeliveryEmail(' AAMIR@EXAMPLE.COM ')).toBe('aamir@example.com');
    expect(normalizeDeliveryEmail('missing-at-sign')).toBeUndefined();
    const prepared = buildCustomerDeliveryPreparation({
      shareId: 'share-1', quoteGroupId: 'group-1', version: 1, channel: 'EMAIL', snapshot: snapshot(3),
      customerLink: 'https://bbos.example/quote/share/token', customerEmail: 'aamir@example.com', preparedAt: '2026-10-01T00:00:00.000Z',
    });
    expect(prepared.subject).toBe('Kashmir Package Options for Aamir - Booking Bridge');
    expect(prepared.body).toContain('package options');
    for (const forbidden of ['supplier cost', 'profit', 'margin', 'approval']) expect(prepared.body.toLowerCase()).not.toContain(forbidden);

    const missingEmail = buildCustomerDeliveryPreparation({
      shareId: 'share-1', quoteGroupId: 'group-1', version: 1, channel: 'EMAIL', snapshot: snapshot(3),
      customerLink: 'https://bbos.example/quote/share/token', customerEmail: 'missing-at-sign', preparedAt: '2026-10-01T00:00:00.000Z',
    });
    expect(missingEmail.recipientAvailable).toBe(false);
    expect(missingEmail.recipient).toBeUndefined();
    expect(missingEmail.subject).toBe('Kashmir Package Options for Aamir - Booking Bridge');
  });
});
