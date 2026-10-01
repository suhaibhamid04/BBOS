import { expect, test } from '@playwright/test';

const salesEmployee = {
  id: 'emp-sales-01', employeeId: 'emp-sales-01', firebaseUid: 'demo:emp-sales-01',
  name: 'Tariq Bhat', email: 'tariq.sales@bookingbridge.com', role: 'Sales Executive',
  department: 'Sales', salesTeamId: 'sales-team-01', managerEmployeeId: 'emp-mgr-01',
  active: true, createdAt: '2025-01-10T00:00:00Z',
};

test('Lead form persists through the authenticated API and remains visible after reload', async ({ page, request }) => {
  await page.addInitScript((employee) => {
    if (!sessionStorage.getItem('qa2-lead-seeded')) {
      localStorage.clear();
      sessionStorage.setItem('qa2-lead-seeded', 'true');
    }
    localStorage.setItem('booking_bridge_active_user', JSON.stringify(employee));
  }, salesEmployee);

  await page.goto('/');
  await page.locator('#nav-item-leads').click();
  await page.locator('#create-lead-trigger').click();
  await page.locator('#lead-customer-name').fill('QA2 Persisted Lead');
  await page.locator('#lead-customer-phone').fill('+919876500002');
  await page.locator('#lead-assignee-select').selectOption(salesEmployee.employeeId);
  await page.locator('#submit-create-lead-btn').click();

  await expect(page.getByText('QA2 Persisted Lead', { exact: true })).toBeVisible();

  const response = await request.get('/api/leads', {
    headers: { 'X-Demo-User-Id': salesEmployee.employeeId },
  });
  expect(response.ok()).toBe(true);
  const payload = await response.json();
  const persisted = payload.data.find((lead: any) => lead.customerName === 'QA2 Persisted Lead');
  expect(persisted).toMatchObject({
    assignedEmployeeId: salesEmployee.employeeId,
    salesTeamId: salesEmployee.salesTeamId,
    isDemo: true,
  });
  expect(persisted.id).toMatch(/^lead-/);

  await page.reload();
  await page.locator('#nav-item-leads').click();
  await expect(page.getByText('QA2 Persisted Lead', { exact: true })).toBeVisible();
});
