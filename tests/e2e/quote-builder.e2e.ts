import { expect, test } from '@playwright/test';

const employee = {
  id: 'emp-sales-01', employeeId: 'emp-sales-01', firebaseUid: 'demo:emp-sales-01',
  name: 'Tariq Bhat', email: 'tariq.sales@bookingbridge.com', role: 'Sales Executive',
  department: 'Sales', salesTeamId: 'sales-team-01', active: true, createdAt: '2025-01-10T00:00:00Z',
};

const trip = {
  id: 'trip-ux3', customerId: 'customer-ux3', leadId: 'lead-ux3', title: 'Authoritative Kashmir Escape',
  destination: 'Kashmir', startDate: '2026-10-15', endDate: '2026-10-17', travelerCount: 2,
  adults: 2, children: 0, tripType: 'LEISURE', currency: 'INR', status: 'ITINERARY_READY',
  costingStatus: 'CALCULATED', totalSupplierCost: 20_000, totalSellingPrice: 80_000,
  grossProfit: 60_000, grossMargin: 75, assignedSalesEmployeeId: 'emp-sales-01', salesTeamId: 'sales-team-01',
  createdAt: '2026-09-29T09:00:00.000Z', updatedAt: '2026-09-29T09:00:00.000Z', isDemo: true,
};

const day = {
  id: 'day-ux3', tripId: trip.id, dayNumber: 1, date: '2026-10-15', title: 'Arrival and Srinagar',
  location: 'Srinagar', description: '', notes: '', items: [
    { id: 'hotel-ux3', dayId: 'day-ux3', type: 'HOTEL', title: 'Regal Palace — Deluxe Room — MAP', description: 'Lake-facing room', metadata: {
      inventoryType: 'ACCOMMODATION', propertyId: 'property-primary', propertyName: 'Regal Palace',
      roomCategoryId: 'room-primary', roomCategoryName: 'Deluxe Room', rateId: 'rate-primary',
      mealPlan: 'MAP', checkInDate: '2026-10-15', checkOutDate: '2026-10-17', nights: 2,
      rooms: 1, adults: 2, children: 0, childrenWithBed: 0, childrenWithoutBed: 0,
    } },
    { id: 'transport-ux3', dayId: 'day-ux3', type: 'TRANSPORT', title: 'Toyota Innova Crysta', description: 'Airport and sightseeing circuit', metadata: {
      inventoryType: 'TRANSPORT', vehicleCategoryId: 'vehicle-primary', vehicleName: 'Toyota Innova Crysta (AC)',
      rateId: 'transport-rate-primary', serviceType: 'MULTI_DAY_JOURNEY', pricingUnit: 'PER_DAY',
      routeName: 'Srinagar–Gulmarg circuit', startDate: '2026-10-15', vehicleDays: 3,
    } },
    { id: 'activity-ux3', dayId: 'day-ux3', type: 'ACTIVITY', title: 'Gulmarg Gondola Phase 1', description: 'Mountain cable-car experience', metadata: {
      inventoryType: 'ACTIVITY', activityId: 'activity-primary', activityName: 'Gulmarg Gondola Phase 1',
      rateId: 'activity-rate-primary', pricingModel: 'PER_PERSON', date: '2026-10-16', adults: 2, children: 0,
    } },
  ],
};

test('Trip-backed Quote persists services, backups, pricing, versions, and converts safely', async ({ page }) => {
  await page.addInitScript(({ employee, trip, day }) => {
    if (!sessionStorage.getItem('ux3-seeded')) {
      localStorage.clear();
      sessionStorage.setItem('ux3-seeded', 'true');
      localStorage.setItem('bb_customers', JSON.stringify([{ id: 'customer-ux3', name: 'Ayesha Khan', phone: '+919999999999', email: 'ayesha@example.com', city: 'Delhi', segment: 'B2C' }]));
      localStorage.setItem('bb_leads', JSON.stringify([{ id: 'lead-ux3', customerId: 'customer-ux3', customerName: 'Ayesha Khan', destination: 'Kashmir', assignedEmployeeId: 'emp-sales-01' }]));
      localStorage.setItem('bb_trips', JSON.stringify([trip]));
      localStorage.setItem('bb_itinerary_days', JSON.stringify([day]));
      localStorage.setItem('bb_quotes', '[]');
      localStorage.setItem('bb_bookings', '[]');
      localStorage.setItem('bb_accommodation_properties', JSON.stringify([
        { id: 'property-primary', name: 'Regal Palace', status: 'ACTIVE' },
        { id: 'property-backup', name: 'Lakeview Retreat', status: 'ACTIVE' },
      ]));
      localStorage.setItem('bb_room_categories', JSON.stringify([
        { id: 'room-primary', propertyId: 'property-primary', name: 'Deluxe Room', active: true },
        { id: 'room-backup', propertyId: 'property-backup', name: 'Premium Lake Room', active: true },
      ]));
      localStorage.setItem('bb_rate_periods', JSON.stringify([
        { id: 'rate-primary', propertyId: 'property-primary', roomCategoryId: 'room-primary', mealPlan: 'MAP', validFrom: '2026-10-01', validTo: '2026-10-31', status: 'ACTIVE', baseRate: 5000 },
        { id: 'rate-backup', propertyId: 'property-backup', roomCategoryId: 'room-backup', mealPlan: 'MAP', validFrom: '2026-10-01', validTo: '2026-10-31', status: 'ACTIVE', baseRate: 5500 },
      ]));
    }
    localStorage.setItem('booking_bridge_active_user', JSON.stringify(employee));
  }, { employee, trip, day });

  await page.goto('/');
  await page.locator('#nav-item-quotes').click();
  await page.getByTestId('new-trip-quote').click();
  await page.getByTestId('quote-trip-select').selectOption('trip-ux3');
  await page.getByTestId('new-quote-selling-price').fill('100000');
  await page.getByTestId('new-quote-discount').fill('5000');
  await page.getByTestId('create-trip-quote').click();

  await expect(page.getByTestId('quote-hotel-service')).toContainText('Regal Palace');
  await expect(page.getByTestId('quote-transport-service')).toContainText('Toyota Innova Crysta');
  await expect(page.getByTestId('quote-activity-service')).toContainText('Gulmarg Gondola Phase 1');
  await expect(page.getByTestId('quote-final-price')).toHaveText('₹95,000');
  await expect(page.getByTestId('quote-profit')).toHaveText('₹75,000');
  await expect(page.getByTestId('quote-margin')).toHaveText('78.9%');

  await page.getByTestId('load-backups-hotel-ux3').click();
  await page.getByTestId('backup-option-rate-backup').check();
  await expect(page.getByTestId('selected-backup-hotel')).toContainText('Lakeview Retreat');
  await page.getByTestId('save-quote').click();
  await expect(page.getByTestId('quote-version')).toHaveText('V2');

  await page.reload();
  await page.locator('#nav-item-quotes').click();
  await expect(page.getByTestId('quote-hotel-service')).toContainText('Regal Palace');
  await expect(page.getByTestId('selected-backup-hotel')).toContainText('Lakeview Retreat');
  await expect(page.getByTestId('quote-selling-price')).toHaveValue('100000');
  await expect(page.getByTestId('quote-discount')).toHaveValue('5000');
  await expect(page.getByTestId('quote-version')).toHaveText('V2');

  await page.getByTestId('quote-selling-price').fill('110000');
  await page.getByTestId('save-quote').click();
  await expect(page.getByTestId('quote-version')).toHaveText('V3');
  await page.getByRole('button', { name: /History/ }).click();
  await expect(page.getByTestId('quote-history-version')).toHaveCount(2);
  await page.getByTestId('close-quote-history').click();

  await page.getByTestId('open-customer-package').click();
  const customerPackage = page.getByTestId('customer-package-preview');
  await expect(customerPackage).toContainText('Ayesha Khan');
  await expect(customerPackage).toContainText('Regal Palace');
  await expect(customerPackage).toContainText('Toyota Innova Crysta');
  await expect(customerPackage).toContainText('Gulmarg Gondola Phase 1');
  await expect(customerPackage).not.toContainText('Supplier cost');
  await expect(customerPackage).not.toContainText('Profit');
  await expect(customerPackage).not.toContainText('Margin');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('share-customer-package').click(),
  ]);
  expect(download.suggestedFilename()).toContain('customer-package.html');
  await page.getByLabel('Close customer package').click();
  await expect(page.getByTestId('quote-version')).toHaveText('V4');
  await expect(page.getByTestId('quote-share-status')).toContainText('DOCUMENT');

  await page.reload();
  await page.locator('#nav-item-quotes').click();
  await expect(page.getByTestId('quote-share-status')).toContainText('DOCUMENT');
  await page.getByTestId('convert-quote').click();

  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('bb_bookings') || '[]').length)).toBe(1);
  const result = await page.evaluate(() => ({
    booking: JSON.parse(localStorage.getItem('bb_bookings') || '[]')[0],
    accommodations: JSON.parse(localStorage.getItem('bb_booking_accommodations') || '[]'),
    transports: JSON.parse(localStorage.getItem('bb_booking_transports') || '[]'),
    activities: JSON.parse(localStorage.getItem('bb_booking_activities') || '[]'),
  }));
  expect(result.booking.totalSupplierCost).toBeUndefined();
  expect(result.booking.grossProfit).toBeUndefined();
  expect(result.booking.grossMargin).toBeUndefined();
  expect(result.accommodations[0].sourceQuoteServiceId).toBe('hotel-ux3');
  expect(result.transports[0].sourceQuoteServiceId).toBe('transport-ux3');
  expect(result.activities[0].sourceQuoteServiceId).toBe('activity-ux3');
});
