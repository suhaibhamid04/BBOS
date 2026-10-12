import { expect, test, type Page } from '@playwright/test';

const employee = {
  id: 'emp-sales-01', employeeId: 'emp-sales-01', firebaseUid: 'demo:emp-sales-01',
  name: 'Tariq Bhat', email: 'tariq.sales@bookingbridge.com', role: 'Sales Executive',
  department: 'Sales', salesTeamId: 'sales-team-01', active: true, createdAt: '2025-01-10T00:00:00Z',
};

function fixtures(id: string, adults: number, childAges: number[]) {
  const customer = {
    id: `customer-${id}`, name: `Occupancy ${id}`, phone: '+919876543210', email: `${id}@example.com`,
    city: 'Delhi', customerType: 'B2C', preferences: [], notes: '', totalBookings: 0, lifetimeValue: 0,
    createdAt: '2026-09-29T00:00:00.000Z', updatedAt: '2026-09-29T00:00:00.000Z', isDemo: true,
  };
  const lead = {
    id: `lead-${id}`, customerId: customer.id, customerName: customer.name, customerPhone: customer.phone,
    customerEmail: customer.email, sourceId: 'WEBSITE', source: 'Website', sourcePlatform: 'Website',
    createdSourceType: 'WEBSITE', tags: [], destination: 'Kashmir', travelStartDate: '2026-10-12',
    travelEndDate: '2026-10-14', nights: 2, travelerCount: adults + childAges.length, adults,
    children: childAges.length, childAges, tripType: 'Family', budget: 150_000, status: 'IN_PROGRESS',
    leadScore: 80, assignedEmployeeId: employee.employeeId, assignedEmployeeName: employee.name,
    priority: 'HOT', notes: 'M4.1A occupancy acceptance', createdAt: '2026-09-29T00:00:00.000Z',
    updatedAt: '2026-09-29T00:00:00.000Z', isDemo: true,
  };
  return { customer, lead };
}

async function buildPackage(page: Page, id: string, adults: number, childAges: number[]) {
  const { customer, lead } = fixtures(id, adults, childAges);
  await page.addInitScript(({ employee, customer, lead }) => {
    if (sessionStorage.getItem('m4-1a-seeded')) {
      localStorage.setItem('booking_bridge_active_user', JSON.stringify(employee));
      return;
    }
    sessionStorage.setItem('m4-1a-seeded', 'true');
    localStorage.clear();
    localStorage.setItem('booking_bridge_active_user', JSON.stringify(employee));
    localStorage.setItem('bb_customers', JSON.stringify([customer]));
    localStorage.setItem('bb_leads', JSON.stringify([lead]));
    localStorage.setItem('bb_trips', '[]');
    localStorage.setItem('bb_itinerary_days', '[]');
  }, { employee, customer, lead });
  await page.goto('/');
  await page.locator('#nav-item-leads').click();
  await page.locator(`#open-lead-btn-${lead.id}`).click();
  await page.locator('#tab-lead-quotes').click();
  await page.getByTestId('lead-build-package').click();
  await expect(page.locator('#trip-builder-active')).toBeVisible();
  await page.getByTestId('add-trip-hotel').click();
  await expect(page.getByTestId('hotel-inventory-picker')).toBeVisible();
}

test('Scenario A: 4 adults receive a 2 + 2 room suggestion and cost without a capacity error', async ({ page }) => {
  await buildPackage(page, 'four-adults', 4, []);
  await expect(page.getByTestId('rooms-suggested')).toHaveText('Rooms suggested: 2');
  await expect(page.getByTestId('room-1-adults')).toHaveValue('2');
  await expect(page.getByTestId('room-2-adults')).toHaveValue('2');
  await expect(page.getByTestId('confirm-trip-hotel')).toBeEnabled();
  await page.getByTestId('confirm-trip-hotel').click();
  await page.getByTestId('calculate-trip-costs').click();
  await expect(page.getByTestId('trip-costing-status')).toHaveText('Costs current');
  await expect(page.getByText(/capacity/i)).toHaveCount(0);
  await expect(page.getByText('[Protected by RBAC]')).toHaveCount(0);
  await expect(page.getByText('[Restricted]')).toHaveCount(0);
});

test('Scenario B: saved child ages are inherited and explained in plain language', async ({ page }) => {
  await buildPackage(page, 'two-children', 2, [4, 9]);
  await expect(page.getByTestId('hotel-trip-context')).toContainText('ages 4, 9');
  await expect(page.getByText('Child age 4 — included without bed charge').first()).toBeVisible();
  await expect(page.getByText('Child age 9 — child bed/supplement applies').first()).toBeVisible();
  await expect(page.getByTestId('hotel-inventory-picker')).not.toContainText('CWB');
  await expect(page.getByTestId('hotel-inventory-picker')).not.toContainText('CNB');
});

test('Scenario C: 5 adults and child age 8 can adjust and persist a valid 3-room distribution', async ({ page }) => {
  await buildPackage(page, 'five-plus-child', 5, [8]);
  await expect(page.getByTestId('rooms-suggested')).toHaveText('Rooms suggested: 3');
  await expect(page.getByTestId('room-3-adults')).toHaveValue('1');
  await expect(page.getByTestId('room-3-allocation')).toContainText('Child age 8');
  await page.getByTestId('room-1-adults').fill('1');
  await page.getByTestId('room-3-adults').fill('2');
  await expect(page.getByTestId('confirm-trip-hotel')).toBeEnabled();
  await page.getByTestId('confirm-trip-hotel').click();
  await page.reload();
  await page.locator('#nav-item-trips').click();
  await page.getByRole('button', { name: /Open Builder/ }).first().click();
  await page.locator('[data-testid^="edit-trip-item-"]').first().click();
  await expect(page.getByTestId('trip-hotel-rooms')).toHaveValue('3');
  await expect(page.getByTestId('room-1-adults')).toHaveValue('1');
  await expect(page.getByTestId('room-3-adults')).toHaveValue('2');
  await expect(page.getByTestId('room-3-allocation')).toContainText('Child age 8');
});

test('Scenario D: 6 adults receive and can save a 3-room allocation', async ({ page }) => {
  await buildPackage(page, 'six-adults', 6, []);
  await expect(page.getByTestId('rooms-suggested')).toHaveText('Rooms suggested: 3');
  await expect(page.getByTestId('room-1-adults')).toHaveValue('2');
  await expect(page.getByTestId('room-2-adults')).toHaveValue('2');
  await expect(page.getByTestId('room-3-adults')).toHaveValue('2');
  await page.getByTestId('confirm-trip-hotel').click();
  await expect(page.getByTestId('trip-costing-status')).toHaveText('Needs update');
});

test('Scenario E: category rules control three-adult guidance in the Sales picker', async ({ page }) => {
  await buildPackage(page, 'three-adults', 3, []);
  await page.getByTestId('trip-hotel-property').selectOption('accom-sgr-kareemresidency');
  await expect(page.getByTestId('trip-hotel-room')).toHaveValue('rc-accom-sgr-kareemresidency');
  await expect(page.getByTestId('rooms-suggested')).toHaveText('Rooms suggested: 1');
  await expect(page.getByTestId('room-1-allocation')).toContainText('Standard occupancy: 2 adults');
  await expect(page.getByTestId('room-1-allocation')).toContainText('1 extra bed allowed');
  await expect(page.getByTestId('confirm-trip-hotel')).toBeEnabled();

  await page.getByTestId('trip-hotel-room').selectOption('rc-accom-sgr-kareemresidency-deluxe');
  await expect(page.getByTestId('rooms-suggested')).toHaveText('Rooms suggested: 2');
  await page.getByTestId('trip-hotel-rooms').fill('1');
  await expect(page.getByText(/add another room or choose a larger category/i)).toBeVisible();
  await expect(page.getByTestId('confirm-trip-hotel')).toHaveCount(0);
});

test('Scenario F: two categories in one hotel stay persist independently', async ({ page }) => {
  await buildPackage(page, 'mixed-categories', 4, []);
  await page.getByTestId('trip-hotel-property').selectOption('accom-sgr-kareemresidency');
  await expect(page.getByTestId('room-1-category')).toHaveValue('rc-accom-sgr-kareemresidency');
  await page.getByTestId('room-2-category').selectOption('rc-accom-sgr-kareemresidency-deluxe');
  await expect(page.getByTestId('confirm-trip-hotel')).toBeEnabled();
  await page.getByTestId('confirm-trip-hotel').click();
  await page.reload();
  await page.locator('#nav-item-trips').click();
  await page.getByRole('button', { name: /Open Builder/ }).first().click();
  await page.locator('[data-testid^="edit-trip-item-"]').first().click();
  await expect(page.getByTestId('room-1-category')).toHaveValue('rc-accom-sgr-kareemresidency');
  await expect(page.getByTestId('room-2-category')).toHaveValue('rc-accom-sgr-kareemresidency-deluxe');
});
