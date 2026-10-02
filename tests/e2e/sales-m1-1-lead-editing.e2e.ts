import { expect, test } from '@playwright/test';

const salesEmployee = {
  id: 'emp-sales-01', employeeId: 'emp-sales-01', firebaseUid: 'demo:emp-sales-01',
  name: 'Tariq Bhat', email: 'tariq.sales@bookingbridge.com', role: 'Sales Executive',
  department: 'Sales', salesTeamId: 'sales-team-01', managerEmployeeId: 'emp-mgr-01',
  active: true, createdAt: '2025-01-10T00:00:00Z',
};

test('M1.1 edits Lead, preserves services, reconciles stale package, and keeps contact edits noncommercial', async ({ page }) => {
  test.setTimeout(60_000);
  const customerName = 'M1.1 Kashmir Family';
  await page.addInitScript((employee) => {
    if (!sessionStorage.getItem('m1-1-seeded')) {
      localStorage.clear();
      sessionStorage.setItem('m1-1-seeded', 'true');
    }
    localStorage.setItem('booking_bridge_active_user', JSON.stringify(employee));
  }, salesEmployee);

  await page.goto('/');
  await page.locator('#nav-item-leads').click();
  await page.locator('#create-lead-trigger').click();
  await page.locator('#lead-customer-name').fill(customerName);
  await page.locator('#lead-customer-phone').fill('9876543911');
  await page.locator('#lead-destination-select').selectOption('Kashmir');
  await page.locator('#lead-start-date').fill('2026-10-15');
  await page.locator('#lead-nights').fill('5');
  await page.locator('#lead-adults').fill('2');
  await page.locator('#lead-children').fill('1');
  await page.getByTestId('lead-child-age-0').fill('8');
  await page.getByTestId('save-build-package').click();

  await expect(page.locator('#trip-builder-active')).toBeVisible();
  await page.getByTestId('add-trip-transport').click();
  await expect(page.getByTestId('transport-inventory-picker')).toBeVisible();
  await page.getByTestId('confirm-trip-transport').click();
  const selectedService = page.locator('[data-testid^="edit-trip-item-"]').first();
  await expect(selectedService).toBeVisible();
  await page.getByTestId('calculate-trip-costs').click();
  await expect(page.getByTestId('trip-costing-status')).toHaveText('CALCULATED');

  await page.getByTestId('return-to-lead').click();
  await page.getByTestId('edit-lead').click();
  await expect(page.locator('#lead-adults')).toHaveValue('2');
  await expect(page.getByTestId('lead-child-age-0')).toHaveValue('8');
  await page.locator('#lead-adults').fill('4');
  await page.locator('#lead-start-date').fill('2026-10-17');
  await page.locator('#lead-nights').fill('6');
  await page.getByTestId('save-lead-edit').click();
  await page.getByRole('button', { name: 'Quotes', exact: true }).last().click();
  await expect(page.getByTestId('lead-package-review-warning')).toBeVisible();

  await page.reload();
  await page.locator('#nav-item-leads').click();
  const row = page.locator('tr', { hasText: customerName });
  await row.locator('button[id^="open-lead-btn-"]').click();
  await expect(page.getByTestId('lead-detail-child-ages')).toContainText('4 adults');
  await page.locator('#tab-lead-quotes').click();
  await page.getByTestId('lead-build-package').click();

  await expect(page.getByTestId('package-review-warning')).toBeVisible();
  await expect(page.getByTestId('trip-costing-status')).toHaveText('PENDING');
  await expect(page.locator('[data-testid^="edit-trip-item-"]').first()).toBeVisible();
  await expect(page.getByTestId('calculate-trip-costs')).toBeDisabled();
  await page.getByTestId('apply-latest-lead').click();
  await expect(page.getByTestId('package-review-warning')).toHaveCount(0);
  await expect(page.locator('#trip-builder-active')).toContainText('4 Adults + 1 Kids');
  await page.getByTestId('calculate-trip-costs').click();
  await expect(page.getByTestId('trip-costing-status')).toHaveText('CALCULATED');
  await expect(page.locator('[data-testid^="edit-trip-item-"]').first()).toBeVisible();

  await page.getByTestId('return-to-lead').click();
  await page.getByTestId('edit-lead').click();
  await page.locator('#lead-customer-phone').fill('9876543999');
  await page.locator('#lead-notes-input').fill('Phone correction and note only.');
  await page.getByTestId('save-lead-edit').click();
  await page.getByRole('button', { name: 'Quotes', exact: true }).last().click();
  await expect(page.getByTestId('lead-package-review-warning')).toHaveCount(0);
  await page.getByRole('button', { name: /Resume Package|Build Package/ }).first().click();
  await expect(page.getByTestId('package-review-warning')).toHaveCount(0);
  await expect(page.getByTestId('trip-costing-status')).toHaveText('CALCULATED');
  await expect(page.locator('[data-testid^="edit-trip-item-"]').first()).toBeVisible();
});
