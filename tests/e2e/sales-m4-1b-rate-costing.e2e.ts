import { expect, test, type Page } from '@playwright/test';

const employee = {
  id: 'emp-sales-01', employeeId: 'emp-sales-01', firebaseUid: 'demo:emp-sales-01',
  name: 'Tariq Bhat', email: 'tariq.sales@bookingbridge.com', role: 'Sales Executive',
  department: 'Sales', salesTeamId: 'sales-team-01', active: true, createdAt: '2025-01-10T00:00:00Z',
};

function records(id: string, startDate = '2026-10-12', adults = 2, item?: Record<string, unknown>) {
  const tripId = `trip-rate-${id}`;
  const dayId = `day-rate-${id}`;
  const trip = {
    id: tripId, customerId: `customer-${id}`, leadId: `lead-${id}`, title: `Rate test ${id}`,
    destination: 'Kashmir', startDate, endDate: startDate, travelerCount: adults, adults, children: 0,
    childAges: [], tripType: 'Family', currency: 'INR', status: 'DRAFT', totalSupplierCost: 0,
    totalSellingPrice: 100_000, grossProfit: 0, grossMargin: 0, costingStatus: 'PENDING',
    assignedSalesEmployeeId: employee.employeeId, salesTeamId: employee.salesTeamId,
    createdAt: '2026-09-20T00:00:00.000Z', updatedAt: '2026-09-20T00:00:00.000Z', isDemo: true,
  };
  const day = { id: dayId, tripId, dayNumber: 1, date: startDate, title: 'Stay', location: 'Srinagar', description: 'Hotel stay', items: item ? [item] : [] };
  return { trip, day };
}

function hotelItem(id: string, checkInDate: string, nights: number, packageRate?: { entryMode: 'PER_ROOM_NIGHT' | 'TOTAL_STAY'; amount: number }) {
  return {
    id: `hotel-${id}`, dayId: `day-rate-${id}`, tripId: `trip-rate-${id}`, type: 'HOTEL',
    title: 'Hotel Kareem Residency — Premium Deluxe — MAP', description: `${nights} nights · 1 room`,
    referenceId: 'accom-sgr-kareemresidency', inventoryId: 'accom-sgr-kareemresidency',
    metadata: {
      inventoryType: 'ACCOMMODATION', propertyId: 'accom-sgr-kareemresidency', propertyName: 'Hotel Kareem Residency',
      roomCategoryId: 'rc-accom-sgr-kareemresidency', roomCategoryName: 'Premium Deluxe',
      rateId: checkInDate < '2026-10-01' ? 'rp-accom-sgr-kareemresidency-sep' : 'rp-accom-sgr-kareemresidency-oct',
      mealPlan: 'MAP', checkInDate, checkOutDate: '2026-10-05', nights, rooms: 1, adults: 2, children: 0,
      childrenWithBed: 0, childrenWithoutBed: 0, needsConfirmation: false, taxDescription: 'Tax Included',
      roomAllocations: [{ roomIndex: 1, roomCategoryId: 'rc-accom-sgr-kareemresidency', adults: 2, children: 0, childAges: [] }],
      ...(packageRate ? { costSource: 'PACKAGE_RATE_OVERRIDE', packageSupplierRate: { ...packageRate, taxTreatment: 'NET', supplierQuoteReference: 'Phone call', enteredByEmployeeId: employee.employeeId, enteredAt: '2026-10-01T00:00:00.000Z' } } : {}),
    },
  };
}

async function openBuilder(page: Page, id: string, startDate = '2026-10-12', adults = 2, item?: Record<string, unknown>) {
  const { trip, day } = records(id, startDate, adults, item);
  await page.addInitScript(({ employee, trip, day }) => {
    const seedKey = `m4-1b-seeded-${trip.id}`;
    if (sessionStorage.getItem(seedKey)) {
      localStorage.setItem('booking_bridge_active_user', JSON.stringify(employee));
      return;
    }
    sessionStorage.setItem(seedKey, 'true');
    localStorage.clear();
    localStorage.setItem('booking_bridge_active_user', JSON.stringify(employee));
    localStorage.setItem('bb_trips', JSON.stringify([trip]));
    localStorage.setItem('bb_itinerary_days', JSON.stringify([day]));
  }, { employee, trip, day });
  await page.goto('/');
  await page.locator('#nav-item-trips').click();
  await page.getByRole('button', { name: /Open Builder/ }).first().click();
  await expect(page.locator('#trip-builder-active')).toBeVisible();
  if (item) await page.locator('[data-testid^="edit-trip-item-"]').first().click();
  else await page.getByTestId('add-trip-hotel').click();
  await expect(page.getByTestId('hotel-inventory-picker')).toBeVisible();
}

test('Scenario A — contracted supplier amount is visible and costed', async ({ page }) => {
  await openBuilder(page, 'contracted');
  await page.getByTestId('trip-hotel-property').selectOption('accom-sgr-kareemresidency');
  await expect(page.getByTestId('hotel-supplier-cost')).toHaveText('₹4,000');
  await expect(page.getByTestId('contracted-rate-total')).toHaveText('₹4,000');
});

test('Scenario B — package override persists and leaves contracted amount unchanged', async ({ page }) => {
  await openBuilder(page, 'override');
  await page.getByTestId('trip-hotel-property').selectOption('accom-sgr-kareemresidency');
  await page.getByTestId('use-package-per-night').click();
  await page.getByTestId('package-rate-amount').fill('3800');
  await expect(page.getByTestId('package-rate-tax-treatment')).toHaveValue('NET');
  await page.getByTestId('package-rate-reference').fill('WhatsApp — Riyaz');
  await expect(page.getByTestId('package-supplier-rate')).toContainText('master hotel rate will not be changed');
  await expect(page.getByTestId('hotel-supplier-cost')).toHaveText('₹3,800');
  await expect(page.getByTestId('contracted-rate-total')).toHaveText('₹4,000');
  await page.getByTestId('confirm-trip-hotel').click();
  await expect(page.locator('[data-testid^="edit-trip-item-"]').first()).toBeVisible();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('bb_itinerary_days') || '[]')[0]?.items?.length || 0)).toBe(1);
  await page.reload();
  await page.locator('#nav-item-trips').click();
  await page.getByRole('button', { name: /Open Builder/ }).first().click();
  await page.locator('[data-testid^="edit-trip-item-"]').first().click();
  await expect(page.getByTestId('package-rate-amount')).toHaveValue('3800');
  await expect(page.getByTestId('package-rate-tax-treatment')).toHaveValue('NET');
  await expect(page.getByTestId('contracted-rate-total')).toHaveText('₹4,000');
});

test('Scenario C — missing contract accepts a manual package supplier quote', async ({ page }) => {
  await openBuilder(page, 'manual', '2025-10-12');
  await expect(page.getByText(/No contracted rate is available/i)).toBeVisible();
  await page.getByTestId('use-package-total').click();
  await page.getByTestId('package-rate-amount').fill('9250');
  await expect(page.getByTestId('hotel-supplier-cost')).toHaveText('₹9,250');
  await expect(page.getByTestId('confirm-trip-hotel')).toBeVisible();
});

test('Scenario D — seasonal boundary displays both periods and exact total', async ({ page }) => {
  await openBuilder(page, 'boundary', '2026-09-28', 2, hotelItem('boundary', '2026-09-28', 7));
  await expect(page.getByTestId('rate-boundary-breakdown')).toContainText('₹3,500');
  await expect(page.getByTestId('rate-boundary-breakdown')).toContainText('₹4,000');
  await expect(page.getByTestId('hotel-supplier-cost')).toHaveText('₹26,500');
});

test('Scenario E — changing hotel clears its package-only rate', async ({ page }) => {
  await openBuilder(page, 'replacement', '2026-10-12', 2, hotelItem('replacement', '2026-10-12', 1, { entryMode: 'PER_ROOM_NIGHT', amount: 3_800 }));
  await expect(page.getByTestId('package-rate-amount')).toHaveValue('3800');
  await page.getByTestId('trip-hotel-property').selectOption('accom-sgr-regal');
  await expect(page.getByTestId('package-rate-amount')).toHaveCount(0);
  await expect(page.getByTestId('hotel-supplier-cost')).toHaveText('₹2,800');
});

test('Scenario F — mixed categories are independently combined', async ({ page }) => {
  await openBuilder(page, 'mixed', '2026-10-12', 4);
  await page.getByTestId('trip-hotel-property').selectOption('accom-sgr-kareemresidency');
  await page.getByTestId('room-2-category').selectOption('rc-accom-sgr-kareemresidency-deluxe');
  await expect(page.getByTestId('hotel-supplier-cost')).toHaveText('₹7,200');
  await expect(page.getByTestId('use-package-per-night')).toBeDisabled();
});
