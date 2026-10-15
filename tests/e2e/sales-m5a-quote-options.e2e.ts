import { expect, test } from '@playwright/test';

const employee = {
  id: 'emp-sales-01', employeeId: 'emp-sales-01', firebaseUid: 'demo:emp-sales-01',
  name: 'Tariq Bhat', email: 'tariq.sales@bookingbridge.com', role: 'Sales Executive',
  department: 'Sales', salesTeamId: 'sales-team-01', active: true, createdAt: '2025-01-10T00:00:00Z',
};

const trip = {
  id: 'trip-m5a', customerId: 'customer-m5a', leadId: 'lead-m5a', title: 'Kashmir Package Options',
  destination: 'Kashmir', startDate: '2026-10-15', endDate: '2026-10-20', travelerCount: 2,
  adults: 2, children: 0, tripType: 'LEISURE', currency: 'INR', status: 'ITINERARY_READY',
  costingStatus: 'CALCULATED', costingRevision: 1, costingCalculatedRevision: 1,
  totalSupplierCost: 50_000, totalSellingPrice: 62_000, grossProfit: 12_000, grossMargin: 19.4,
  assignedSalesEmployeeId: 'emp-sales-01', salesTeamId: 'sales-team-01',
  createdAt: '2026-09-29T09:00:00.000Z', updatedAt: '2026-09-29T09:00:00.000Z', isDemo: true,
};

const itineraryDays = [{
  id: 'day-m5a-1', tripId: trip.id, dayNumber: 1, date: '2026-10-15', title: 'Arrival in Srinagar',
  location: 'Srinagar', description: 'Airport welcome, hotel check-in and an included Shikara Ride.', notes: '',
  customerContent: { style: 'DETAILED', status: 'CURRENT', sourceFingerprint: 'm5a-current', updatedAt: trip.updatedAt, updatedByEmployeeId: 'emp-sales-01' },
  items: [
    { id: 'hotel-m5a', dayId: 'day-m5a-1', tripId: trip.id, type: 'HOTEL', title: 'Kashmir Deluxe Hotel', description: 'Five-night stay.', supplierCost: 32_000, metadata: { propertyId: 'hotel-deluxe', propertyName: 'Kashmir Deluxe Hotel', roomCategoryId: 'room-deluxe', roomCategoryName: 'Deluxe Room', rateId: 'rate-deluxe', mealPlan: 'MAP', checkInDate: '2026-10-15', checkOutDate: '2026-10-20', nights: 5, rooms: 1, adults: 2, children: 0 } },
    { id: 'transport-m5a', dayId: 'day-m5a-1', tripId: trip.id, type: 'TRANSPORT', title: 'Private Sedan', description: 'Private transfers and sightseeing.', supplierCost: 15_000, metadata: { vehicleCategoryId: 'sedan', vehicleName: 'Private Sedan', rateId: 'rate-sedan', routeName: 'Kashmir Circuit', startDate: '2026-10-15', vehicleDays: 6, vehicleCount: 1, chargeableDays: 6 } },
    { id: 'activity-m5a', dayId: 'day-m5a-1', tripId: trip.id, type: 'ACTIVITY', title: 'Shikara Ride', description: 'Included lake experience.', supplierCost: 3_000, metadata: { activityId: 'shikara', activityName: 'Shikara Ride', rateId: 'rate-shikara', date: '2026-10-15', tickets: 2, inclusionStatus: 'INCLUDED' } },
    { id: 'optional-m5a', dayId: 'day-m5a-1', tripId: trip.id, type: 'ACTIVITY', title: 'Gondola Ride', description: 'Available at additional cost.', supplierCost: 0, metadata: { activityId: 'gondola', activityName: 'Gondola Ride', rateId: 'rate-gondola', date: '2026-10-17', tickets: 2, inclusionStatus: 'OPTIONAL' } },
  ],
}];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ employee, trip, itineraryDays }) => {
    if (!sessionStorage.getItem('m5a-seeded')) {
      localStorage.clear();
      sessionStorage.setItem('m5a-seeded', 'true');
      localStorage.setItem('bb_customers', JSON.stringify([{ id: 'customer-m5a', name: 'Ayesha Khan', phone: '+919999999999', email: 'ayesha@example.com', city: 'Delhi', segment: 'B2C' }]));
      localStorage.setItem('bb_leads', JSON.stringify([{ id: 'lead-m5a', customerId: 'customer-m5a', customerName: 'Ayesha Khan', destination: 'Kashmir', assignedEmployeeId: 'emp-sales-01', salesTeamId: 'sales-team-01' }]));
      localStorage.setItem('bb_trips', JSON.stringify([trip]));
      localStorage.setItem('bb_itinerary_days', JSON.stringify(itineraryDays));
      localStorage.setItem('bb_quotes', '[]');
      localStorage.setItem('bb_bookings', '[]');
    }
    localStorage.setItem('booking_bridge_active_user', JSON.stringify(employee));
  }, { employee, trip, itineraryDays });
  await page.goto('/');
});

test('Sales creates three isolated options, recommends one, compares details and converts it', async ({ page }) => {
  await page.locator('#nav-item-quotes').click();
  await page.getByTestId('new-trip-quote').click();
  await page.getByTestId('quote-trip-select').selectOption(trip.id);
  await page.getByTestId('create-trip-quote').click();
  await expect(page.getByTestId('quote-option-strip')).toContainText('Value');

  await page.getByTestId('duplicate-quote-option').click();
  await page.getByTestId('duplicate-option-label').fill('Recommended');
  await page.getByTestId('duplicate-option-price').fill('72000');
  await page.getByTestId('confirm-duplicate-option').click();
  await page.getByTestId('recommend-quote-option').click();
  await expect(page.getByTestId('quote-option-strip')).toContainText('Recommended');

  await page.getByTestId('duplicate-quote-option').click();
  await page.getByTestId('duplicate-option-label').fill('Premium');
  await page.getByTestId('duplicate-option-price').fill('86000');
  await page.getByTestId('confirm-duplicate-option').click();
  await expect(page.getByTestId('quote-option-strip')).toContainText('Premium');

  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('bb_quotes') || '[]').length)).toBe(3);
  await page.evaluate(() => {
    const trips = JSON.parse(localStorage.getItem('bb_trips') || '[]');
    trips[0] = { ...trips[0], totalSupplierCost: 65_000, totalSellingPrice: 86_000, grossProfit: 21_000, grossMargin: 24.4, costingRevision: 2, costingCalculatedRevision: 2, updatedAt: '2026-10-01T00:00:00.000Z' };
    localStorage.setItem('bb_trips', JSON.stringify(trips));
    const days = JSON.parse(localStorage.getItem('bb_itinerary_days') || '[]');
    days[0].items = days[0].items.map((item: any) => item.type === 'HOTEL'
      ? { ...item, title: 'Premium Palace', metadata: { ...item.metadata, propertyId: 'hotel-premium', propertyName: 'Premium Palace', roomCategoryId: 'room-premium', roomCategoryName: 'Premium Suite', rateId: 'rate-premium' } }
      : item.type === 'TRANSPORT'
        ? { ...item, title: 'Private Innova Crysta', metadata: { ...item.metadata, vehicleCategoryId: 'innova-crysta', vehicleName: 'Private Innova Crysta', rateId: 'rate-innova-crysta' } }
        : item);
    localStorage.setItem('bb_itinerary_days', JSON.stringify(days));
  });
  await page.reload();
  await page.locator('#nav-item-quotes').click();
  await page.getByTestId('quote-option-strip').getByRole('button', { name: /^Premium/ }).click();
  await page.getByTestId('refresh-quote-option').click();
  await expect(page.getByTestId('quote-hotel-service')).toContainText('Premium Palace');
  await expect(page.getByTestId('quote-transport-service')).toContainText('Private Innova Crysta');

  await page.getByTestId('open-option-comparison').click();
  const comparison = page.getByTestId('quote-comparison-preview');
  await expect(comparison).toBeVisible();
  await expect(comparison.getByTestId('recommended-option-badge')).toHaveCount(1);
  await expect(comparison.getByTestId('customer-option-price')).toHaveText([/62,000/, /72,000/, /86,000/]);
  await expect(comparison).toContainText('Optional experiences');
  await expect(comparison).not.toContainText('Supplier cost');
  await expect(comparison).not.toContainText('Profit');
  await expect(comparison).not.toContainText('Margin');
  await expect(comparison.locator('article').filter({ hasText: 'Value' })).toContainText('Kashmir Deluxe Hotel');
  await expect(comparison.locator('article').filter({ hasText: 'Value' })).toContainText('Private Sedan');
  await expect(comparison.locator('article').filter({ hasText: 'Premium' })).toContainText('Premium Palace');
  await expect(comparison.locator('article').filter({ hasText: 'Premium' })).toContainText('Private Innova Crysta');

  await page.getByLabel('Close comparison').click();
  await page.getByRole('button', { name: 'Move Premium left' }).click();
  await page.getByRole('button', { name: 'Move Premium left' }).click();
  await page.getByTestId('open-option-comparison').click();
  await expect(comparison.locator('article').first()).toContainText('Premium');

  const recommendedCard = comparison.locator('article').filter({ hasText: 'Recommended' });
  await recommendedCard.getByRole('button', { name: /View complete package/ }).click();
  const detail = page.getByTestId('customer-package-preview');
  await expect(detail).toContainText('Arrival in Srinagar');
  await expect(detail).toContainText('Kashmir Deluxe Hotel');
  await expect(detail).toContainText('Private Sedan');
  await expect(detail).toContainText('Shikara Ride');
  await expect(detail).toContainText('Gondola Ride');
  await expect(detail).toContainText('72,000');
  await expect(detail).toContainText('Inventory-linked itinerary services');
  await expect(detail).toContainText('Personal expenses');
  await expect(detail).toContainText('Services remain subject to availability until booking confirmation.');
  await expect(detail).not.toContainText('Supplier cost');

  await Promise.all([page.waitForEvent('download'), page.getByTestId('share-customer-package').click()]);
  await page.getByLabel('Close customer package').click();
  await page.getByTestId('convert-quote').click();
  await expect(page.getByTestId('quote-option-strip')).toContainText('ACCEPTED');
  await expect(page.getByTestId('convert-quote')).toHaveCount(0);
  const bookingResult = await page.evaluate(() => {
    const booking = JSON.parse(localStorage.getItem('bb_bookings') || '[]')[0];
    const quotes = JSON.parse(localStorage.getItem('bb_quotes') || '[]');
    const recommended = quotes.find((quote: any) => quote.optionLabel === 'Recommended');
    const accommodations = JSON.parse(localStorage.getItem('bb_booking_accommodations') || '[]');
    const transports = JSON.parse(localStorage.getItem('bb_booking_transports') || '[]');
    return { booking, recommended, accommodations, transports };
  });
  expect(bookingResult.booking.quoteOptionId).toBe(bookingResult.recommended.optionId);
  expect(bookingResult.booking.totalSellingPrice).toBe(72_000);
  expect(bookingResult.booking.customerPackageSnapshot.packageSellingPrice).toBe(72_000);
  expect(bookingResult.accommodations[0].propertyName).toBe('Kashmir Deluxe Hotel');
  expect(bookingResult.transports[0].vehicleCategoryName).toBe('Private Sedan');
});

test('customer comparison remains usable at a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Toggle navigation' }).click();
  await page.locator('#nav-item-quotes').click();
  await page.getByTestId('new-trip-quote').click();
  await page.getByTestId('quote-trip-select').selectOption(trip.id);
  await page.getByTestId('create-trip-quote').click();
  await page.getByTestId('duplicate-quote-option').click();
  await page.getByTestId('duplicate-option-label').fill('Premium');
  await page.getByTestId('confirm-duplicate-option').click();
  await page.getByTestId('open-option-comparison').click();
  await expect(page.getByTestId('quote-comparison-preview')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Choose the package that suits you best' })).toBeVisible();
  await expect(page.getByRole('button', { name: /View complete package/ }).first()).toBeVisible();
});
