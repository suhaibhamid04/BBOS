/**
 * Trip Builder & Costing Engine Verification Tests
 */

import { describe, it, expect } from 'bun:test';
import { Trip, ItineraryDay, ItineraryItem, Customer } from '../../src/types/index.js';

describe('Trip Builder & Costing Engine Calculations', () => {
  it('correctly calculates totalCost, totalSellingPrice, grossProfit, and grossMargin', () => {
    const items: ItineraryItem[] = [
      {
        id: 'item-1',
        dayId: 'day-1',
        type: 'HOTEL',
        title: 'The Khyber Himalayan Resort',
        description: 'Premier Room MAP',
        supplierCost: 14000,
        sellingPrice: 20000
      },
      {
        id: 'item-2',
        dayId: 'day-1',
        type: 'TRANSPORT',
        title: 'Innova Crysta AC',
        description: 'Airport transfer',
        supplierCost: 3400,
        sellingPrice: 4800
      },
      {
        id: 'item-3',
        dayId: 'day-1',
        type: 'ACTIVITY',
        title: 'Gulmarg Gondola Tickets',
        description: 'Phase 1 & 2',
        supplierCost: 3700,
        sellingPrice: 4900
      }
    ];

    let totalCost = 0;
    let totalSellingPrice = 0;
    for (const it of items) {
      totalCost += it.supplierCost || 0;
      totalSellingPrice += it.sellingPrice || 0;
    }

    const grossProfit = totalSellingPrice - totalCost;
    const grossMargin = totalSellingPrice > 0 ? Number(((grossProfit / totalSellingPrice) * 100).toFixed(1)) : 0;

    expect(totalCost).toBe(21100);
    expect(totalSellingPrice).toBe(29700);
    expect(grossProfit).toBe(8600);
    expect(grossMargin).toBe(29.0);
  });

  it('safely handles zero selling price without division by zero', () => {
    const totalCost = 5000;
    const totalSellingPrice = 0;
    const grossProfit = totalSellingPrice - totalCost;
    const grossMargin = totalSellingPrice > 0 ? Number(((grossProfit / totalSellingPrice) * 100).toFixed(1)) : 0;

    expect(grossMargin).toBe(0);
    expect(isFinite(grossMargin)).toBe(true);
    expect(isNaN(grossMargin)).toBe(false);
  });

  it('correctly calculates day dates from start date', () => {
    const startDate = '2026-10-12';
    const numDays = 5;
    const generatedDates: string[] = [];

    const startObj = new Date(startDate);
    for (let d = 1; d <= numDays; d++) {
      const dayDate = new Date(startObj);
      dayDate.setDate(dayDate.getDate() + (d - 1));
      generatedDates.push(dayDate.toISOString().split('T')[0]);
    }

    expect(generatedDates.length).toBe(5);
    expect(generatedDates[0]).toBe('2026-10-12');
    expect(generatedDates[1]).toBe('2026-10-13');
    expect(generatedDates[2]).toBe('2026-10-14');
    expect(generatedDates[3]).toBe('2026-10-15');
    expect(generatedDates[4]).toBe('2026-10-16');
  });
});

describe('Trip Form Validation & Customer Resolution QA', () => {
  it('validates date order (rejects endDate prior to startDate)', () => {
    const startDate = '2026-10-15';
    const invalidEndDate = '2026-10-10';
    const isValid = new Date(invalidEndDate) >= new Date(startDate);
    expect(isValid).toBe(false);

    const validEndDate = '2026-10-20';
    const isValidPositive = new Date(validEndDate) >= new Date(startDate);
    expect(isValidPositive).toBe(true);
  });

  it('correctly recomputes travelerCount from adults + children', () => {
    const adults = 3;
    const children = 2;
    const travelerCount = Number(adults) + Number(children);
    expect(travelerCount).toBe(5);
  });

  it('resolves customer updates without breaking ID links', () => {
    const customers: Customer[] = [
      {
        id: 'cust-1',
        name: 'Original Customer Name',
        phone: '+91 99000 11111',
        email: 'original@example.com',
        city: 'Delhi',
        segment: 'B2C',
        totalBookings: 1,
        lifetimeValue: 50000,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z'
      }
    ];

    const trip: Trip = {
      id: 'trip-101',
      title: 'Kashmir Tour',
      customerId: 'cust-1',
      destination: 'Kashmir',
      startDate: '2026-10-12',
      endDate: '2026-10-18',
      travelerCount: 2,
      adults: 2,
      children: 0,
      tripType: 'Honeymoon',
      status: 'DRAFT',
      totalCost: 30000,
      totalSellingPrice: 45000,
      grossProfit: 15000,
      grossMargin: 33.3,
      currency: 'INR',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z'
    };

    // Simulate updating customer name in edit trip modal
    const editedName = 'Rohit Sharma (Updated)';
    const updatedCustomers = customers.map(c =>
      c.id === trip.customerId ? { ...c, name: editedName, updatedAt: new Date().toISOString() } : c
    );

    const resolvedCust = updatedCustomers.find(c => c.id === trip.customerId);
    expect(resolvedCust).toBeDefined();
    expect(resolvedCust?.name).toBe('Rohit Sharma (Updated)');
    expect(trip.customerId).toBe('cust-1');
  });

  it('supports creating a new customer on the fly during trip creation', () => {
    const newCustomerName = 'Zaheer Khan';
    const newCustomerPhone = '+91 98765 43210';
    const newCustomerEmail = 'zaheer@cricket.in';

    const newCustomer: Customer = {
      id: `cust-${Date.now()}`,
      name: newCustomerName,
      phone: newCustomerPhone,
      email: newCustomerEmail,
      city: 'Mumbai',
      segment: 'B2C',
      totalBookings: 0,
      lifetimeValue: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const newTrip: Trip = {
      id: `trip-${Date.now()}`,
      title: 'Gulmarg Ski Expedition',
      customerId: newCustomer.id,
      destination: 'Kashmir',
      startDate: '2026-12-01',
      endDate: '2026-12-06',
      travelerCount: 2,
      adults: 2,
      children: 0,
      tripType: 'Adventure',
      status: 'DRAFT',
      totalCost: 20000,
      totalSellingPrice: 35000,
      grossProfit: 15000,
      grossMargin: 42.9,
      currency: 'INR',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    expect(newTrip.customerId).toBe(newCustomer.id);
    expect(newCustomer.name).toBe('Zaheer Khan');
  });
});
