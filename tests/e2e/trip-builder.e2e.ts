import { expect, test } from '@playwright/test';

const salesEmployee = {
  id: 'emp-sales-01', employeeId: 'emp-sales-01', firebaseUid: 'demo:emp-sales-01',
  name: 'Tariq Bhat', email: 'tariq.sales@bookingbridge.com', phone: '+91 94190 00004',
  role: 'Sales Executive', department: 'Sales & Inbound', salesTeamId: 'sales-team-01',
  managerEmployeeId: 'emp-mgr-01', active: true, createdAt: '2025-01-10T00:00:00Z',
};

async function openDemoTrip(page: import('@playwright/test').Page) {
  await page.locator('#nav-item-trips').click();
  await expect(page.getByRole('heading', { name: 'Trip Builder', level: 2 })).toBeVisible();
  await page.getByRole('button', { name: /Open Builder/ }).first().click();
  await expect(page.getByText('Accommodation / Stays')).toBeVisible();
}

test('Sales builds, reloads, costs, and replaces a hotel using authoritative inventory IDs', async ({ page }) => {
  const cpRateId = 'rp-accom-sgr-kareemresidency-cp';
  await page.addInitScript((employee) => {
    if (!sessionStorage.getItem('ux2-trip-builder-seeded')) {
      localStorage.clear();
      sessionStorage.setItem('ux2-trip-builder-seeded', 'true');
    }
    localStorage.setItem('booking_bridge_active_user', JSON.stringify(employee));
  }, salesEmployee);
  await page.goto('/');
  await openDemoTrip(page);

  await page.getByTestId('add-trip-hotel').click();
  await expect(page.getByTestId('hotel-inventory-picker')).toBeVisible();
  await expect(page.getByTestId('confirm-trip-hotel')).toBeEnabled();
  const roomLabel = await page.getByTestId('trip-hotel-room').locator('option:checked').textContent();
  await page.getByTestId('confirm-trip-hotel').click();
  await expect(page.locator('p').filter({ hasText: /^Regal Palace —/ })).toBeVisible();

  await page.getByTestId('add-trip-transport').click();
  await expect(page.getByTestId('transport-inventory-picker')).toBeVisible();
  await expect(page.getByTestId('confirm-trip-transport')).toBeEnabled();
  await page.getByTestId('confirm-trip-transport').click();
  await expect(page.locator('p').filter({ hasText: /^Toyota Innova Crysta \(AC\)/ })).toBeVisible();

  await page.getByTestId('add-trip-activity').click();
  await expect(page.getByTestId('activity-inventory-picker')).toBeVisible();
  await expect(page.getByTestId('confirm-trip-activity')).toBeEnabled();
  await page.getByTestId('confirm-trip-activity').click();
  await expect(page.locator('p').filter({ hasText: /^Gulmarg Gondola Phase 1 —/ })).toBeVisible();
  await expect(page.getByTestId('trip-costing-status')).toHaveText('PENDING');

  await page.reload();
  await openDemoTrip(page);
  await expect(page.locator('p').filter({ hasText: /^Regal Palace —/ })).toBeVisible();
  await expect(page.locator('p').filter({ hasText: /^Toyota Innova Crysta \(AC\)/ })).toBeVisible();
  await expect(page.locator('p').filter({ hasText: /^Gulmarg Gondola Phase 1 —/ })).toBeVisible();

  await page.getByTestId('calculate-trip-costs').click();
  await expect(page.getByTestId('trip-costing-status')).toHaveText('CALCULATED');
  await expect(page.getByText(/Authoritative inventory costing completed/)).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const trips = JSON.parse(localStorage.getItem('bb_trips') || '[]') as Array<{ id: string; totalSupplierCost?: number }>;
    return trips.find((trip) => trip.id === 'trip-demo-01')?.totalSupplierCost || 0;
  })).toBeGreaterThan(0);

  const hotelEdit = page.locator('[data-testid^="edit-trip-item-"]').first();
  await hotelEdit.click();
  await expect(page.getByTestId('trip-hotel-property')).toHaveValue(/.+/);
  await expect(page.getByTestId('trip-hotel-room')).toHaveValue(/.+/);
  await expect(page.getByTestId('trip-hotel-meal-plan')).toHaveValue('MAP');
  await expect(page.getByTestId('trip-hotel-room').locator('option:checked')).toHaveText(roomLabel || '');
  await page.getByTestId('trip-hotel-property').selectOption('accom-sgr-kareemresidency');
  await expect(page.getByTestId('trip-hotel-room')).toHaveValue('rc-accom-sgr-kareemresidency');
  await page.getByTestId('trip-hotel-meal-plan').selectOption('CP');
  await expect(page.getByTestId('trip-hotel-rate')).toHaveValue(cpRateId);
  await page.getByTestId('trip-hotel-rooms').fill('2');
  await page.getByTestId('confirm-trip-hotel').click();
  await expect(page.getByTestId('trip-costing-status')).toHaveText('PENDING');
  await expect(page.locator('p').filter({ hasText: /^Kareem Residency/ })).toContainText('Premium Deluxe');
  await expect(page.locator('p').filter({ hasText: /^Regal Palace —/ })).toHaveCount(0);

  await page.reload();
  await openDemoTrip(page);
  await expect(page.locator('p').filter({ hasText: /^Kareem Residency/ })).toContainText('Premium Deluxe');
  await expect(page.locator('[data-testid^="edit-trip-item-"]')).toHaveCount(3);
  await page.getByTestId('calculate-trip-costs').click();
  await expect(page.getByTestId('trip-costing-status')).toHaveText('CALCULATED');
});
