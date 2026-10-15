import { expect, test } from '@playwright/test';

const employee = {
  id: 'emp-sales-01', employeeId: 'emp-sales-01', firebaseUid: 'demo:emp-sales-01',
  name: 'Tariq Bhat', email: 'tariq.sales@bookingbridge.com', role: 'Sales Executive',
  department: 'Sales', salesTeamId: 'sales-team-01', active: true, createdAt: '2025-01-10T00:00:00Z',
};

const trip = {
  id: 'trip-m5b1', customerId: 'customer-m5b1', leadId: 'lead-m5b1', title: 'Kashmir Customer Share',
  destination: 'Kashmir', startDate: '2026-10-15', endDate: '2026-10-20', travelerCount: 2,
  adults: 2, children: 0, tripType: 'LEISURE', currency: 'INR', status: 'ITINERARY_READY',
  costingStatus: 'CALCULATED', costingRevision: 1, costingCalculatedRevision: 1,
  totalSupplierCost: 50_000, totalSellingPrice: 72_000, grossProfit: 22_000, grossMargin: 30.6,
  assignedSalesEmployeeId: employee.employeeId, salesTeamId: employee.salesTeamId,
  createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', isDemo: true,
};

const packageFor = (label: string, price: number) => ({
  brand: { name: 'Booking Bridge', tagline: 'Travel, thoughtfully arranged', email: 'travel@bookingbridge.com', phone: '+91 99999 00000' },
  packageReference: `quote-${label.toLowerCase()}`, customerName: 'Ayesha Khan', destination: 'Kashmir',
  travelStartDate: '2026-10-15', travelEndDate: '2026-10-20', travelerCount: 2,
  hotels: [{ hotelName: `${label} Kashmir Hotel`, roomCategoryName: label === 'Premium' ? 'Premium Suite' : 'Deluxe Room', mealPlan: 'MAP', checkInDate: '2026-10-15', checkOutDate: '2026-10-20', nights: 5, rooms: 1 }],
  transports: [{ vehicleName: label === 'Premium' ? 'Private Innova' : 'Private Sedan', route: 'Kashmir Circuit', days: 6, passengerCount: 2 }],
  activities: [{ activityName: 'Shikara Ride', participantCount: 2, inclusionStatus: 'INCLUDED' }, { activityName: 'Gondola Ride', participantCount: 2, inclusionStatus: 'OPTIONAL' }],
  itinerary: [{ dayNumber: 1, date: '2026-10-15', title: 'Arrival in Srinagar', description: 'Airport welcome and hotel check-in.', location: 'Srinagar', items: [
    { type: 'HOTEL', title: `${label} Kashmir Hotel`, propertyName: `${label} Kashmir Hotel`, roomCategoryName: label === 'Premium' ? 'Premium Suite' : 'Deluxe Room', mealPlan: 'MAP' },
    { type: 'TRANSPORT', title: label === 'Premium' ? 'Private Innova' : 'Private Sedan', vehicleName: label === 'Premium' ? 'Private Innova' : 'Private Sedan' },
    { type: 'ACTIVITY', title: 'Shikara Ride', activityName: 'Shikara Ride', inclusionStatus: 'INCLUDED' },
    { type: 'ACTIVITY', title: 'Gondola Ride', activityName: 'Gondola Ride', inclusionStatus: 'OPTIONAL' },
  ] }],
  packageSellingPrice: price, currency: 'INR', inclusions: ['Hotel accommodation', 'Private transfers', 'Shikara Ride'],
  exclusions: ['Flights', 'Personal expenses'], termsAndConditions: 'Subject to availability and cancellation terms.',
  generatedAt: '2026-10-01T00:00:00.000Z',
});

const quote = (label: string, order: number, price: number, recommended = false) => ({
  id: `quote-${label.toLowerCase()}`, optionId: `quote-${label.toLowerCase()}`, quoteGroupId: 'group-m5b1',
  optionLabel: label, customerTitle: 'Your Kashmir Holiday', optionOrder: order, isRecommended: recommended,
  optionStatus: 'READY', optionSnapshotCreatedAt: '2026-10-01T00:00:00.000Z',
  leadId: 'lead-m5b1', customerId: 'customer-m5b1', customerName: 'Ayesha Khan', destination: 'Kashmir', tripId: trip.id,
  travelerCount: 2, adults: 2, children: 0, durationDays: 6, durationNights: 5,
  totalAmount: price, discountAmount: 0, finalAmount: price, totalSupplierCost: 50_000,
  grossProfit: price - 50_000, grossMargin: Number((((price - 50_000) / price) * 100).toFixed(1)),
  supplierCostSource: { type: 'TRIP', sourceId: trip.id, asOf: trip.updatedAt, costingRevision: 1 },
  approval: { required: false, state: 'NOT_REQUIRED' }, status: 'DRAFT', validUntil: '2026-10-31',
  inclusions: ['Hotel accommodation', 'Private transfers', 'Shikara Ride'], exclusions: ['Flights', 'Personal expenses'],
  termsAndConditions: 'Subject to availability and cancellation terms.',
  salesEmployeeId: employee.employeeId, salesEmployeeName: employee.name, salesTeamId: employee.salesTeamId,
  createdByEmployeeId: employee.employeeId, updatedByEmployeeId: employee.employeeId,
  createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
  customerPackageSnapshot: packageFor(label, price), version: 1, versionHistory: [], isDemo: true,
});

test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.addInitScript(({ employee, trip, quotes }) => {
    if (!localStorage.getItem('m5b1-seeded')) {
      localStorage.clear();
      localStorage.setItem('m5b1-seeded', 'true');
      localStorage.setItem('bb_customers', JSON.stringify([{ id: 'customer-m5b1', name: 'Ayesha Khan', phone: '+919999999999', email: 'ayesha@example.com', city: 'Delhi', segment: 'B2C' }]));
      localStorage.setItem('bb_leads', JSON.stringify([{ id: 'lead-m5b1', customerId: 'customer-m5b1', customerName: 'Ayesha Khan', destination: 'Kashmir', assignedEmployeeId: employee.employeeId, salesTeamId: employee.salesTeamId }]));
      localStorage.setItem('bb_trips', JSON.stringify([trip]));
      localStorage.setItem('bb_itinerary_days', JSON.stringify([{ id: 'day-m5b1', tripId: trip.id, dayNumber: 1, date: trip.startDate, title: 'Arrival in Srinagar', items: [], customerContent: { status: 'CURRENT' } }]));
      localStorage.setItem('bb_quotes', JSON.stringify(quotes));
      localStorage.setItem('bb_customer_shares', '[]');
    }
    localStorage.setItem('booking_bridge_active_user', JSON.stringify(employee));
  }, { employee, trip, quotes: [quote('Value', 1, 62_000), quote('Recommended', 2, 72_000, true), quote('Premium', 3, 86_000)] });
  await page.goto('/');
});

async function openQuoteGroup(page: import('@playwright/test').Page) {
  await page.locator('#nav-item-quotes').click();
  await page.getByTestId('open-quote-quote-recommended').click();
  await expect(page.getByTestId('customer-share-panel')).toBeVisible();
}

test('creates, previews, tracks, versions and revokes a secure customer Quote Group link', async ({ page }) => {
  await openQuoteGroup(page);
  await page.getByTestId('create-customer-share').click();
  const ready = page.getByTestId('customer-share-ready');
  await expect(ready).toBeVisible();
  const firstUrl = await page.getByLabel('Customer share URL').inputValue();
  expect(new URL(firstUrl).pathname).toMatch(/^\/quote\/share\/[A-Za-z0-9_-]{43}$/);
  await page.getByTestId('copy-customer-share').click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(firstUrl);

  const firstPublic = await Promise.all([
    page.waitForEvent('popup'),
    page.getByTestId('open-customer-share').click(),
  ]).then(([popup]) => popup);
  await expect(firstPublic.getByTestId('customer-share-page')).toBeVisible();
  await expect(firstPublic.getByText('Booking Bridge', { exact: true }).first()).toBeVisible();
  await expect(firstPublic.getByText(/Prepared for Ayesha/)).toBeVisible();
  await expect(firstPublic.getByText('Ayesha', { exact: true })).toBeVisible();
  await expect(firstPublic.locator('article[data-testid^="public-option-option-"]')).toHaveCount(3);
  await expect(firstPublic.getByTestId('public-recommended-badge')).toHaveCount(1);
  await expect(firstPublic.getByTestId('public-option-price')).toHaveText([/62,000/, /72,000/, /86,000/]);
  const detail = firstPublic.getByTestId('public-package-detail');
  await expect(detail).toContainText('Arrival in Srinagar');
  await expect(detail).toContainText('Recommended Kashmir Hotel');
  await expect(detail).toContainText('Private Sedan');
  await expect(detail).toContainText('Shikara Ride');
  await expect(detail).toContainText('Gondola Ride');
  await expect(detail).toContainText('Hotel accommodation');
  await expect(detail).toContainText('Personal expenses');
  await expect(detail).toContainText('cancellation terms');
  await expect(firstPublic.getByPlaceholder('Employee email')).toHaveCount(0);
  for (const forbidden of ['Supplier cost', 'Profit', 'Margin', 'supplier-secret', 'REVIEW_REQUIRED', 'APPROVAL_PENDING']) {
    await expect(firstPublic.locator('body')).not.toContainText(forbidden);
  }
  await firstPublic.close();

  await page.getByTestId('refresh-share-history').click();
  await expect(page.getByTestId('customer-share-history')).toContainText('Viewed 1 time');

  await page.getByTestId('quote-selling-price').fill('76000');
  await page.getByTestId('save-quote').click();
  await expect(page.getByTestId('quote-final-price')).toContainText('76,000');
  await page.getByTestId('create-customer-share').click();
  const secondUrl = await page.getByLabel('Customer share URL').inputValue();
  expect(secondUrl).not.toBe(firstUrl);
  const secondPublic = await page.context().newPage();
  await secondPublic.goto(secondUrl);
  await expect(secondPublic.locator('[data-testid="public-option-option-2"]')).toContainText('76,000');
  await secondPublic.goto(firstUrl);
  await expect(secondPublic.locator('[data-testid="public-option-option-2"]')).toContainText('72,000');
  await secondPublic.close();

  await page.getByTestId('customer-share-ready').getByRole('button', { name: 'Revoke Link' }).click();
  const revokedPage = await page.context().newPage();
  await revokedPage.goto(secondUrl);
  await expect(revokedPage.getByTestId('customer-share-error')).toContainText('no longer available');
  await revokedPage.close();
  await expect(page.getByTestId('customer-share-history')).toContainText('REVOKED');
});

test('shows a safe expiry state and remains readable at mobile width', async ({ page }) => {
  await openQuoteGroup(page);
  await page.getByTestId('customer-share-expiry').selectOption('7');
  await page.getByTestId('create-customer-share').click();
  const url = await page.getByLabel('Customer share URL').inputValue();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(url);
  await expect(page.getByTestId('customer-share-page')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.evaluate(() => {
    const records = JSON.parse(localStorage.getItem('bb_customer_shares') || '[]');
    records[0].expiresAt = '2020-01-01T00:00:00.000Z';
    localStorage.setItem('bb_customer_shares', JSON.stringify(records));
  });
  await page.reload();
  await expect(page.getByTestId('customer-share-error')).toContainText('expired');
  await expect(page.locator('body')).not.toContainText('supplier cost');
});
