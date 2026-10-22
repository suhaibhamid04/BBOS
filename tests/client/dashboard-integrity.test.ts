import { describe, expect, it } from 'bun:test';
import { calculateDashboardMetrics } from '../../src/services/dashboardMetrics';
import { assertDemoControlsAllowed } from '../../src/services/demoModeGuard';

const lead = (id: string, status: string) => ({ id, status, destination: 'Kashmir' }) as any;
const quote = (id: string, status: string, finalAmount = 0) => ({ id, status, finalAmount }) as any;
const booking = (id: string, status: string, amountReceived: number) => ({ id, status, amountReceived }) as any;

describe('production dashboard integrity', () => {
  it('renders truthful zero values for an empty successfully loaded production-style dataset', () => {
    const result = calculateDashboardMetrics({ leads: [], quotes: [], bookings: [], role: 'Founder' });
    expect(result.verifiedCustomerPayments).toEqual({ status: 'available', value: 0 });
    expect(result.newLeads.value).toBe(0);
    expect(result.conversionRate.value).toBe(0);
    expect(result.activeQuotes.value).toBe(0);
    expect(result.activeBookings.value).toBe(0);
  });

  it('calculates exact authorized totals without sample fallbacks', () => {
    const result = calculateDashboardMetrics({
      leads: [lead('l1', 'NEW'), lead('l2', 'CONVERTED'), lead('l3', 'NEGOTIATION')],
      quotes: [quote('q1', 'DRAFT', 100), quote('q2', 'ACCEPTED', 200), quote('q3', 'VIEWED', 300)],
      bookings: [booking('b1', 'CONFIRMED', 125000), booking('b2', 'COMPLETED', 25000)],
      role: 'Founder',
    });
    expect(result.verifiedCustomerPayments.value).toBe(150000);
    expect(result.newLeads.value).toBe(1);
    expect(result.conversionRate.value).toBe(33.3);
    expect(result.activeQuotes.value).toBe(2);
    expect(result.activeBookings.value).toBe(1);
  });

  it('keeps an API failure distinct from a valid zero', () => {
    const result = calculateDashboardMetrics({ leads: [], quotes: [], bookings: [], role: 'Founder', errors: { leads: '503', bookings: 'timeout' } });
    expect(result.newLeads.status).toBe('unavailable');
    expect(result.conversionRate.status).toBe('unavailable');
    expect(result.verifiedCustomerPayments.status).toBe('unavailable');
    expect(result.newLeads.value).toBeUndefined();
  });

  it('does not disclose financial totals to a forbidden role', () => {
    const result = calculateDashboardMetrics({ leads: [], quotes: [], bookings: [booking('b1', 'CONFIRMED', 999999)], role: 'Operations' });
    expect(result.verifiedCustomerPayments).toMatchObject({ status: 'forbidden' });
    expect(result.verifiedCustomerPayments.value).toBeUndefined();
  });

  it('denies fixture injection outside explicit demo mode', () => {
    expect(() => assertDemoControlsAllowed(false)).toThrow('disabled outside explicit demo mode');
    expect(() => assertDemoControlsAllowed(true)).not.toThrow();
  });
});
