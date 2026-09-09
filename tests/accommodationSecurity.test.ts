import { expect, test, describe } from 'bun:test';
import { canAccessRateData, canAccessNegotiatedRates, sanitizePropertyForRole } from '../src/services/accommodationEngine';
import { AccommodationProperty, UserRole } from '../src/types';

// Mock auth roles for testing
const MOCK_FOUNDER = { id: 'u1', role: 'Founder' as UserRole, name: 'User' };
const MOCK_SALES = { id: 'u2', role: 'Sales Executive' as UserRole, name: 'User' };
const MOCK_OPS = { id: 'u3', role: 'Operations' as UserRole, name: 'User' };
const MOCK_MARKETING = { id: 'u4', role: 'Marketing' as UserRole, name: 'User' };
const MOCK_ACCOUNTS = { id: 'u5', role: 'Accounts' as UserRole, name: 'User' };

describe('Accommodation Security & Role Enforcement', () => {

  test('Sales Executive cannot access raw supplier rates', () => {
    expect(canAccessRateData(MOCK_SALES.role)).toBe(false);
  });

  test('Marketing cannot access raw supplier rates', () => {
    expect(canAccessRateData(MOCK_MARKETING.role)).toBe(false);
  });

  test('Operations can access raw supplier rates', () => {
    expect(canAccessRateData(MOCK_OPS.role)).toBe(true);
  });

  test('Founder can access raw supplier rates', () => {
    expect(canAccessRateData(MOCK_FOUNDER.role)).toBe(true);
  });

  test('Only Founder/Admin/Accounts can access negotiated rates', () => {
    expect(canAccessNegotiatedRates(MOCK_FOUNDER.role)).toBe(true);
    expect(canAccessNegotiatedRates(MOCK_SALES.role)).toBe(false);
    expect(canAccessNegotiatedRates(MOCK_OPS.role)).toBe(false); // Ops cannot view negotiated rates per our requirements
    expect(canAccessNegotiatedRates(MOCK_ACCOUNTS.role)).toBe(true);
  });

  test('Server strictly sanitizes property internal notes for Sales', () => {
    const mockProp: AccommodationProperty = {
      id: 'p1',
      name: 'Test Hotel',
      propertyType: 'HOTEL',
      city: 'Srinagar',
      location: 'Dal Lake',
      description: 'Public desc',
      amenities: [],
      status: 'ACTIVE',
      currency: 'INR',
      internalNotes: 'TOP SECRET CONTRACT DETAILS'
    };

    const sanitized = sanitizePropertyForRole(mockProp, MOCK_SALES.role);
    expect(sanitized.internalNotes).toBeUndefined();
    expect(sanitized.name).toBe('Test Hotel');
  });

  test('Server preserves internal notes for Operations', () => {
    const mockProp: AccommodationProperty = {
      id: 'p1',
      name: 'Test Hotel',
      propertyType: 'HOTEL',
      city: 'Srinagar',
      location: 'Dal Lake',
      description: 'Public desc',
      amenities: [],
      status: 'ACTIVE',
      currency: 'INR',
      internalNotes: 'TOP SECRET CONTRACT DETAILS'
    };

    const preserved = sanitizePropertyForRole(mockProp, MOCK_OPS.role);
    expect(preserved.internalNotes).toBe('TOP SECRET CONTRACT DETAILS');
  });
});
