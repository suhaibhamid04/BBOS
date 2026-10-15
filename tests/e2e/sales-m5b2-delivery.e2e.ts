import { expect, test } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const employee = {
  id: 'emp-sales-01', employeeId: 'emp-sales-01', firebaseUid: 'demo:emp-sales-01',
  name: 'Tariq Bhat', email: 'tariq.sales@bookingbridge.com', role: 'Sales Executive',
  department: 'Sales', salesTeamId: 'sales-team-01', active: true, createdAt: '2025-01-10T00:00:00Z',
};

const trip = {
  id: 'trip-m5b2', customerId: 'customer-m5b2', leadId: 'lead-m5b2', title: 'Kashmir Delivery',
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
    { type: 'HOTEL', title: `${label} Kashmir Hotel`, propertyName: `${label} Kashmir Hotel`, roomCategoryName: 'Deluxe Room', mealPlan: 'MAP' },
    { type: 'TRANSPORT', title: 'Private transfer', vehicleName: 'Private Sedan' },
    { type: 'ACTIVITY', title: 'Shikara Ride', activityName: 'Shikara Ride', inclusionStatus: 'INCLUDED' },
    { type: 'ACTIVITY', title: 'Gondola Ride', activityName: 'Gondola Ride', inclusionStatus: 'OPTIONAL' },
  ] }],
  packageSellingPrice: price, currency: 'INR', inclusions: ['Hotel accommodation', 'Private transfers', 'Shikara Ride'],
  exclusions: ['Flights', 'Personal expenses'], termsAndConditions: 'Subject to availability and cancellation terms.',
  generatedAt: '2026-10-01T00:00:00.000Z',
});

const quote = (label: string, order: number, price: number, recommended = false) => ({
  id: `quote-${label.toLowerCase()}`, optionId: `quote-${label.toLowerCase()}`, quoteGroupId: 'group-m5b2',
  optionLabel: label, customerTitle: 'Your Kashmir Holiday', optionOrder: order, isRecommended: recommended,
  optionStatus: 'READY', optionSnapshotCreatedAt: '2026-10-01T00:00:00.000Z',
  leadId: 'lead-m5b2', customerId: 'customer-m5b2', customerName: 'Ayesha Khan', destination: 'Kashmir', tripId: trip.id,
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
    localStorage.clear();
    localStorage.setItem('bb_customers', JSON.stringify([{ id: 'customer-m5b2', name: 'Ayesha Khan', phone: '+91 98765 43210', email: 'ayesha@example.com', city: 'Delhi', segment: 'B2C' }]));
    localStorage.setItem('bb_leads', JSON.stringify([{ id: 'lead-m5b2', customerId: 'customer-m5b2', customerName: 'Ayesha Khan', destination: 'Kashmir', assignedEmployeeId: employee.employeeId, salesTeamId: employee.salesTeamId }]));
    localStorage.setItem('bb_trips', JSON.stringify([trip]));
    localStorage.setItem('bb_itinerary_days', JSON.stringify([{ id: 'day-m5b2', tripId: trip.id, dayNumber: 1, date: trip.startDate, title: 'Arrival in Srinagar', items: [], customerContent: { status: 'CURRENT' } }]));
    localStorage.setItem('bb_quotes', JSON.stringify(quotes));
    localStorage.setItem('bb_customer_shares', '[]');
    localStorage.setItem('booking_bridge_active_user', JSON.stringify(employee));
  }, { employee, trip, quotes: [quote('Value', 1, 62_000), quote('Recommended', 2, 72_000, true), quote('Premium', 3, 86_000)] });
  await page.goto('/');
  await page.locator('#nav-item-quotes').click();
  await page.getByTestId('open-quote-quote-recommended').click();
  await expect(page.getByTestId('customer-delivery-panel')).toBeVisible();
});

async function createShare(page: import('@playwright/test').Page) {
  await page.getByTestId('create-customer-share').click();
  await expect(page.getByTestId('customer-share-ready')).toBeVisible();
  return page.getByLabel('Customer share URL').inputValue();
}

async function downloadPdfText(page: import('@playwright/test').Page, saveAs?: string) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('download-share-pdf').click(),
  ]);
  if (saveAs) {
    await mkdir(path.dirname(saveAs), { recursive: true });
    await download.saveAs(saveAs);
    return (await readFile(saveAs)).toString('latin1');
  }
  const downloadPath = await download.path();
  if (!downloadPath) throw new Error('Downloaded PDF path unavailable.');
  return (await readFile(downloadPath)).toString('latin1');
}

test('downloads the frozen PDF and prepares safe editable WhatsApp/email delivery', async ({ page }) => {
  const shareUrl = await createShare(page);
  await expect(page.getByTestId('selected-delivery-version')).toContainText('Current Quote V1');
  const qaPdf = path.resolve('tmp/pdfs/m5b2-customer-delivery-qa.pdf');
  const pdfText = await downloadPdfText(page, qaPdf);
  for (const expected of ['BOOKING BRIDGE', 'PACKAGE OPTIONS', 'RECOMMENDED', 'INR 72,000', 'Arrival in Srinagar', 'Shikara Ride', 'Optional experiences']) {
    expect(pdfText).toContain(expected);
  }
  for (const forbidden of ['supplierCost', 'grossProfit', 'grossMargin', 'approval', employee.employeeId]) expect(pdfText).not.toContain(forbidden);

  await page.getByTestId('prepare-whatsapp').click();
  await expect(page.getByTestId('delivery-draft-modal')).toBeVisible();
  await expect(page.getByTestId('delivery-recipient')).toHaveValue('919876543210');
  await expect(page.getByTestId('delivery-message')).toContainText('Hi Ayesha');
  await expect(page.getByTestId('delivery-message')).toContainText(shareUrl);
  await expect(page.getByTestId('delivery-message')).not.toContainText('supplier');
  await page.getByLabel('Close delivery draft').click();

  await page.getByTestId('prepare-email').click();
  await expect(page.getByTestId('delivery-recipient')).toHaveValue('ayesha@example.com');
  await expect(page.getByTestId('delivery-subject')).toHaveValue('Kashmir Package Options for Ayesha - Booking Bridge');
  await expect(page.getByTestId('delivery-message')).toContainText(shareUrl);
  await expect(page.getByTestId('launch-delivery')).toHaveAttribute('href', /^mailto:/);
  await page.getByLabel('Close delivery draft').click();
  await expect(page.getByTestId('customer-delivery-panel')).toContainText('WhatsApp 1 · Email 1');
});

test('keeps V1/V2 delivery isolated and blocks digital delivery after revocation at mobile width', async ({ page }) => {
  const v1Url = await createShare(page);
  await page.getByTestId('quote-selling-price').fill('76000');
  await page.getByTestId('save-quote').click();
  await expect(page.getByTestId('quote-final-price')).toContainText('76,000');
  const v2Url = await createShare(page);
  expect(v2Url).not.toBe(v1Url);

  const v2Text = await downloadPdfText(page);
  expect(v2Text).toContain('INR 76,000');
  await page.getByTestId('delivery-share-version').selectOption({ label: 'Historical Quote V1 - ACTIVE' });
  const v1Text = await downloadPdfText(page);
  expect(v1Text).toContain('INR 72,000');
  expect(v1Text).not.toContain('INR 76,000');
  await page.getByTestId('prepare-whatsapp').click();
  await expect(page.getByTestId('delivery-message')).toContainText(v1Url);
  await page.getByLabel('Close delivery draft').click();
  await page.getByTestId('prepare-email').click();
  await expect(page.getByTestId('delivery-message')).toContainText(v1Url);
  await expect(page.getByTestId('delivery-message')).not.toContainText(v2Url);
  await page.getByLabel('Close delivery draft').click();

  await page.getByTestId('delivery-share-version').selectOption({ label: 'Current Quote V2 - ACTIVE' });
  await page.getByTestId('customer-share-ready').getByRole('button', { name: 'Revoke Link' }).click();
  await expect(page.getByTestId('selected-delivery-version')).toContainText('REVOKED');
  await expect(page.getByTestId('prepare-whatsapp')).toBeDisabled();
  await expect(page.getByTestId('prepare-email')).toBeDisabled();
  await expect(page.getByTestId('download-share-pdf')).toBeEnabled();
  await expect(page.getByTestId('delivery-fresh-link-required')).toBeVisible();

  await page.setViewportSize({ width: 768, height: 900 });
  await expect(page.getByTestId('customer-delivery-panel')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
