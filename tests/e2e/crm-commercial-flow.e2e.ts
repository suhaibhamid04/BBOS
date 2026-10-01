import { expect, test } from '@playwright/test';

const employee = {
  id: 'emp-sales-01', employeeId: 'emp-sales-01', firebaseUid: 'demo:emp-sales-01',
  name: 'Tariq Bhat', email: 'tariq.sales@bookingbridge.com', role: 'Sales Executive',
  department: 'Sales', salesTeamId: 'sales-team-01', active: true, createdAt: '2025-01-10T00:00:00Z',
};

const customer = {
  id: 'customer-ux4', name: 'Zoya Mir', phone: '+919876543210', email: 'zoya@example.com',
  city: 'Delhi', customerType: 'B2C', preferences: ['Lake-facing room'], notes: '',
  totalBookings: 0, lifetimeValue: 0, createdAt: '2026-09-29T00:00:00.000Z',
  updatedAt: '2026-09-29T00:00:00.000Z', isDemo: true,
};

const lead = {
  id: 'lead-ux4', customerId: customer.id, customerName: customer.name,
  customerPhone: customer.phone, customerEmail: customer.email, sourceId: 'WEBSITE', source: 'Website',
  sourcePlatform: 'Website', createdSourceType: 'WEBSITE', tags: [], destination: 'Kashmir', travelStartDate: '2026-10-12',
  travelEndDate: '2026-10-14', nights: 2, travelerCount: 2, adults: 2, children: 0, childAges: [], tripType: 'Honeymoon', budget: 120_000,
  hotelPreference: 'Lake-facing room', transportPreference: 'Private SUV', status: 'IN_PROGRESS',
  leadScore: 82, assignedEmployeeId: employee.employeeId, assignedEmployeeName: employee.name,
  priority: 'HOT', lastContactAt: '2026-09-29T00:00:00.000Z',
  nextFollowUpAt: '2026-09-30T00:00:00.000Z', notes: 'Anniversary trip; quiet stays preferred.',
  createdAt: '2026-09-29T00:00:00.000Z', updatedAt: '2026-09-29T00:00:00.000Z', isDemo: true,
};

test('CRM Lead follows the real inventory Trip, costing, Quote, and Booking flow without duplicates', async ({ page }) => {
  await page.addInitScript(({ employee, customer, lead }) => {
    if (!sessionStorage.getItem('ux4-seeded')) {
      localStorage.clear();
      sessionStorage.setItem('ux4-seeded', 'true');
      localStorage.setItem('bb_customers', JSON.stringify([customer]));
      localStorage.setItem('bb_leads', JSON.stringify([lead]));
      localStorage.setItem('bb_trips', '[]');
      localStorage.setItem('bb_itinerary_days', '[]');
      localStorage.setItem('bb_quotes', '[]');
      localStorage.setItem('bb_bookings', '[]');
    }
    localStorage.setItem('booking_bridge_active_user', JSON.stringify(employee));
  }, { employee, customer, lead });

  await page.goto('/');
  await page.locator('#nav-item-leads').click();
  await page.locator('#open-lead-btn-lead-ux4').click();
  await expect(page.locator('#lead-detail-drawer')).toBeVisible();
  await page.locator('#tab-lead-quotes').click();
  await page.getByTestId('lead-build-package').click();

  await expect(page.locator('#trip-builder-active')).toBeVisible();
  await expect(page.getByTestId('commercial-workflow')).toContainText('Lead → Build Package');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('bb_trips') || '[]').length)).toBe(1);

  await page.getByTestId('add-trip-hotel').click();
  await page.getByTestId('confirm-trip-hotel').click();
  await page.getByTestId('add-trip-transport').click();
  await page.getByTestId('confirm-trip-transport').click();
  await page.getByTestId('add-trip-activity').click();
  await page.getByTestId('confirm-trip-activity').click();
  await expect(page.getByTestId('trip-costing-status')).toHaveText('PENDING');

  await page.getByTestId('calculate-trip-costs').click();
  await expect(page.getByTestId('trip-costing-status')).toHaveText('CALCULATED');
  await page.getByTestId('create-quote-from-trip').click();

  await expect(page.locator('#quote-builder-editor')).toBeVisible();
  await expect(page.getByTestId('quote-hotel-service')).toBeVisible();
  await expect(page.getByTestId('quote-transport-service')).toBeVisible();
  await expect(page.getByTestId('quote-activity-service')).toBeVisible();
  await page.getByTestId('quote-selling-price').fill('135000');
  await page.getByTestId('save-quote').click();

  await page.getByTestId('quote-return-to-lead').click();
  await page.getByRole('main').getByRole('button', { name: 'Quotes', exact: true }).click();
  await expect(page.getByTestId('lead-linked-trip')).toHaveCount(1);
  await expect(page.getByTestId('lead-linked-quote')).toHaveCount(1);
  await page.getByRole('button', { name: /Open in Quote Builder/ }).click();
  await expect(page.getByTestId('quote-selling-price')).toHaveValue('135000');

  await page.getByTestId('quote-return-to-lead').click();
  await page.locator('#btn-build-trip-from-lead').click();
  await expect(page.getByTestId('create-quote-from-trip')).toHaveText(/Open Quote/);
  await page.getByTestId('create-quote-from-trip').click();
  await expect.poll(() => page.evaluate(() => ({
    trips: JSON.parse(localStorage.getItem('bb_trips') || '[]').length,
    quotes: JSON.parse(localStorage.getItem('bb_quotes') || '[]').length,
  }))).toEqual({ trips: 1, quotes: 1 });

  await page.getByTestId('quote-status').selectOption('SENT');
  await page.getByTestId('save-quote').click();
  await page.getByTestId('convert-quote').click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('bb_bookings') || '[]').length)).toBe(1);

  const persisted = await page.evaluate(() => ({
    trips: JSON.parse(localStorage.getItem('bb_trips') || '[]'),
    quotes: JSON.parse(localStorage.getItem('bb_quotes') || '[]'),
  }));
  expect(persisted.trips[0].leadId).toBe('lead-ux4');
  expect(persisted.quotes[0].leadId).toBe('lead-ux4');
  expect(persisted.quotes[0].tripId).toBe(persisted.trips[0].id);
  expect(JSON.stringify(persisted)).not.toContain('Signature Tour');
});
