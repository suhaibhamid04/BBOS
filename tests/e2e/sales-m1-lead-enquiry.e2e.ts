import { expect, test } from '@playwright/test';

const salesEmployee = {
  id: 'emp-sales-01', employeeId: 'emp-sales-01', firebaseUid: 'demo:emp-sales-01',
  name: 'Tariq Bhat', email: 'tariq.sales@bookingbridge.com', role: 'Sales Executive',
  department: 'Sales', salesTeamId: 'sales-team-01', managerEmployeeId: 'emp-mgr-01',
  active: true, createdAt: '2025-01-10T00:00:00Z',
};

async function fillStructuredLead(page: import('@playwright/test').Page, name: string, phone: string) {
  await page.locator('#create-lead-trigger').click();
  await page.getByTestId('lead-source').selectOption('META_FACEBOOK_ADS');
  await page.locator('#lead-customer-name').fill(name);
  await page.locator('#lead-customer-phone').fill(phone);
  await page.locator('#lead-destination-select').selectOption('Kashmir');
  await page.locator('#lead-start-date').fill('2026-11-12');
  await page.locator('#lead-nights').fill('5');
  await page.locator('#lead-adults').fill('2');
  await page.locator('#lead-children').fill('2');
  await page.getByTestId('lead-child-age-0').fill('4');
  await page.getByTestId('lead-child-age-1').fill('9');
  await page.locator('#lead-hotel-preference').fill('Lake-facing 4-star hotel');
  await page.locator('#lead-notes-input').fill('Family celebration; quiet rooms preferred.');
}

test('Sales M1 persists a structured enquiry and prefills the real package without duplicate Leads', async ({ page }) => {
  await page.addInitScript((employee) => {
    if (!sessionStorage.getItem('sales-m1-seeded')) {
      localStorage.clear();
      sessionStorage.setItem('sales-m1-seeded', 'true');
      localStorage.setItem('bb_leads', '[]');
      localStorage.setItem('bb_customers', '[]');
      localStorage.setItem('bb_trips', '[]');
      localStorage.setItem('bb_itinerary_days', '[]');
    }
    localStorage.setItem('booking_bridge_active_user', JSON.stringify(employee));
  }, salesEmployee);

  await page.goto('/');
  await page.locator('#nav-item-leads').click();
  await fillStructuredLead(page, 'M1 Family Traveller', '9876543901');
  await page.locator('#submit-create-lead-btn').click();
  await expect(page.getByText('M1 Family Traveller', { exact: true })).toBeVisible();

  await page.reload();
  await page.locator('#nav-item-leads').click();
  const leadRow = page.locator('tr', { hasText: 'M1 Family Traveller' });
  await expect(leadRow).toBeVisible();
  await leadRow.locator('button[id^="open-lead-btn-"]').click();
  await expect(page.locator('#lead-detail-drawer')).toBeVisible();
  await expect(page.getByTestId('lead-detail-child-ages')).toContainText('2 adults');
  await expect(page.getByTestId('lead-detail-child-ages')).toContainText('ages 4, 9');
  await expect(page.getByTestId('lead-detail-preferences')).toContainText('Meta/Facebook Ads');
  await expect(page.getByTestId('lead-detail-preferences')).toContainText('Lake-facing 4-star hotel');
  await page.locator('#tab-lead-notes').click();
  await expect(page.locator('#lead-detail-drawer')).toContainText('Family celebration; quiet rooms preferred.');

  await page.locator('#tab-lead-quotes').click();
  await page.getByTestId('lead-build-package').click();
  await expect(page.locator('#trip-builder-active')).toBeVisible();
  await expect(page.locator('#trip-builder-active')).toContainText('M1 Family Traveller');
  await expect(page.locator('#trip-builder-active')).toContainText('12 Nov 2026');
  await expect(page.locator('#trip-builder-active')).toContainText('2 Adults + 2 Kids');
  await expect(page.getByTestId('trip-lead-prefill')).toContainText('Child ages: 4, 9');
  await expect(page.getByTestId('trip-lead-prefill')).toContainText('Hotel: Lake-facing 4-star hotel');

  await page.locator('#nav-item-leads').click();
  await fillStructuredLead(page, 'M1 Idempotent Traveller', '9876543902');
  await page.getByTestId('save-build-package').evaluate((element: HTMLButtonElement) => {
    element.click();
    element.click();
  });
  await expect(page.locator('#trip-builder-active')).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const leads = JSON.parse(localStorage.getItem('bb_leads') || '[]') as Array<{ customerName: string }>;
    return leads.filter(lead => lead.customerName === 'M1 Idempotent Traveller').length;
  })).toBe(1);
});
