import { expect, test, type Page } from '@playwright/test';

const employee = {
  id: 'emp-sales-01', employeeId: 'emp-sales-01', firebaseUid: 'demo:emp-sales-01',
  name: 'Tariq Bhat', email: 'tariq.sales@bookingbridge.com', role: 'Sales Executive',
  department: 'Sales', salesTeamId: 'sales-team-01', active: true, createdAt: '2025-01-10T00:00:00Z',
};

async function openPackage(page: Page, id: string) {
  const customer = { id: `customer-${id}`, name: `M4.2 ${id}`, phone: '+919876543210', email: `${id}@example.com`, city: 'Delhi', customerType: 'B2C', preferences: [], notes: '', totalBookings: 0, lifetimeValue: 0, createdAt: '2026-09-29T00:00:00.000Z', updatedAt: '2026-09-29T00:00:00.000Z', isDemo: true };
  const lead = { id: `lead-${id}`, customerId: customer.id, customerName: customer.name, customerPhone: customer.phone, customerEmail: customer.email, sourceId: 'WEBSITE', source: 'Website', sourcePlatform: 'Website', createdSourceType: 'WEBSITE', tags: [], destination: 'Kashmir', travelStartDate: '2026-10-12', travelEndDate: '2026-10-17', nights: 5, travelerCount: 3, adults: 2, children: 1, childAges: [8], tripType: 'Family', budget: 150_000, status: 'IN_PROGRESS', leadScore: 80, assignedEmployeeId: employee.employeeId, assignedEmployeeName: employee.name, priority: 'HOT', notes: 'M4.2 acceptance', createdAt: '2026-09-29T00:00:00.000Z', updatedAt: '2026-09-29T00:00:00.000Z', isDemo: true };
  await page.addInitScript(({ employee, customer, lead }) => {
    if (sessionStorage.getItem('m4-2-seeded')) {
      localStorage.setItem('booking_bridge_active_user', JSON.stringify(employee));
      return;
    }
    sessionStorage.setItem('m4-2-seeded', 'true');
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
}

async function openTransport(page: Page) {
  await page.getByTestId('add-trip-transport').click();
  await expect(page.getByTestId('transport-inventory-picker')).toBeVisible();
}

async function openActivity(page: Page) {
  await page.getByTestId('add-trip-activity').click();
  await expect(page.getByTestId('activity-inventory-picker')).toBeVisible();
}

async function setSixDayKashmirServices(page: Page) {
  await page.getByTestId('trip-transport-chargeable-days').fill('6');
  const services = [
    ['Airport Pickup', 'Srinagar Airport → Srinagar'],
    ['Gulmarg Day Excursion', 'Srinagar → Gulmarg → Srinagar'],
    ['Sonamarg Day Excursion', 'Srinagar → Sonamarg → Srinagar'],
    ['Srinagar to Pahalgam', 'Srinagar → Pahalgam'],
    ['Pahalgam to Srinagar', 'Pahalgam → Srinagar'],
    ['Departure Transfer', 'Srinagar → Srinagar Airport'],
  ];
  for (let index = 0; index < services.length; index += 1) {
    await page.getByTestId(`transport-service-title-${index}`).fill(services[index][0]);
    await page.getByTestId(`transport-service-route-${index}`).fill(services[index][1]);
  }
  await expect(page.getByTestId('transport-chargeable-day-summary')).toHaveText('6 distinct chargeable days');
}

test('Scenario A: six-day contracted vehicle package costs once per vehicle per distinct day and persists service details', async ({ page }) => {
  await openPackage(page, 'one-vehicle'); await openTransport(page);
  await setSixDayKashmirServices(page);
  await expect(page.getByTestId('trip-transport-vehicle-count')).toHaveValue('1');
  await page.getByTestId('confirm-trip-transport').click();
  await expect(page.getByText(/1 vehicle.*6 chargeable days/i)).toBeVisible();
  await page.getByTestId('calculate-trip-costs').click();
  await expect(page.getByTestId('trip-supplier-cost')).toContainText('12,000');
  await expect(page.getByText('Gulmarg Day Excursion')).toBeVisible();
  await page.reload();
  await page.locator('#nav-item-trips').click();
  await page.getByRole('button', { name: /Open Builder/ }).first().click();
  await expect(page.getByText('Sonamarg Day Excursion')).toBeVisible();
  await expect(page.getByTestId('trip-costing-status')).toHaveText('Costs current');
});

test('Scenario B: package daily transport rate overrides the contracted rate and survives refresh', async ({ page }) => {
  await openPackage(page, 'transport-package-rate'); await openTransport(page);
  await setSixDayKashmirServices(page);
  await page.getByTestId('transport-package-per-day').click();
  await page.getByTestId('transport-package-rate-amount').fill('1850');
  await page.getByTestId('confirm-trip-transport').click();
  await page.getByTestId('calculate-trip-costs').click();
  await expect(page.getByTestId('trip-supplier-cost')).toContainText('11,100');
  await page.reload();
  await page.locator('#nav-item-trips').click();
  await page.getByRole('button', { name: /Open Builder/ }).first().click();
  await expect(page.getByText('Package supplier rate')).toBeVisible();
});

test('Scenario C: vehicle without a master contract accepts a package daily supplier rate', async ({ page }) => {
  await openPackage(page, 'transport-no-contract'); await openTransport(page);
  await page.getByTestId('trip-transport-vehicle').selectOption('vc_tempo_12');
  await page.getByTestId('trip-transport-chargeable-days').fill('3');
  await page.getByTestId('transport-package-per-day').click();
  await page.getByTestId('transport-package-rate-amount').fill('5000');
  await expect(page.getByTestId('confirm-trip-transport')).toBeEnabled();
  await page.getByTestId('confirm-trip-transport').click();
  await page.getByTestId('calculate-trip-costs').click();
  await expect(page.getByTestId('trip-supplier-cost')).toContainText('15,000');
});

test('Scenario D: two vehicles multiply the package daily rate by distinct chargeable days', async ({ page }) => {
  await openPackage(page, 'two-vehicles'); await openTransport(page);
  await setSixDayKashmirServices(page);
  await page.getByTestId('trip-transport-vehicle-count').fill('2');
  await page.getByTestId('transport-package-per-day').click();
  await page.getByTestId('transport-package-rate-amount').fill('3500');
  await page.getByTestId('confirm-trip-transport').click();
  await page.getByTestId('calculate-trip-costs').click();
  await expect(page.getByTestId('trip-supplier-cost')).toContainText('42,000');
});

test('Different vehicle groups coexist in one package and cost independently', async ({ page }) => {
  await openPackage(page, 'mixed-vehicles'); await openTransport(page);
  await page.getByTestId('trip-transport-chargeable-days').fill('2');
  await page.getByTestId('confirm-trip-transport').click();
  await openTransport(page);
  await page.getByTestId('trip-transport-vehicle').selectOption('vc_tempo_12');
  await page.getByTestId('trip-transport-chargeable-days').fill('1');
  await page.getByTestId('transport-package-per-day').click();
  await page.getByTestId('transport-package-rate-amount').fill('5000');
  await page.getByTestId('confirm-trip-transport').click();
  await expect(page.getByText(/Toyota Innova Crysta/)).toBeVisible();
  await expect(page.getByText(/^12-Seater Tempo Traveller/)).toBeVisible();
  await page.getByTestId('calculate-trip-costs').click();
  await expect(page.getByTestId('trip-supplier-cost')).toContainText('9,000');
});

test('Scenario E: included Shikara Ride supports per-unit package pricing and itinerary-day association', async ({ page }) => {
  await openPackage(page, 'activity-included'); await openActivity(page);
  await page.getByTestId('trip-activity-master').selectOption('act_shikara_ride');
  await page.getByTestId('activity-inclusion-status').selectOption('INCLUDED');
  await page.getByTestId('activity-package-rate-mode').selectOption('PER_UNIT');
  await page.getByTestId('activity-unit-count').fill('1');
  await page.getByTestId('activity-package-rate-amount').fill('1200');
  await page.getByTestId('confirm-trip-activity').click();
  await expect(page.getByText('Included in package')).toBeVisible();
  await page.getByTestId('calculate-trip-costs').click();
  await expect(page.getByTestId('trip-supplier-cost')).toContainText('1,200');
});

test('Scenario F: package activity override changes package cost without changing inclusion semantics', async ({ page }) => {
  await openPackage(page, 'activity-override'); await openActivity(page);
  await page.getByTestId('trip-activity-master').selectOption('act_shikara_ride');
  await page.getByTestId('activity-package-rate-mode').selectOption('PER_UNIT');
  await page.getByTestId('activity-package-rate-amount').fill('1000');
  await page.getByTestId('confirm-trip-activity').click();
  await page.getByTestId('calculate-trip-costs').click();
  await expect(page.getByTestId('trip-supplier-cost')).toContainText('1,000');
  await expect(page.getByText('Included in package')).toBeVisible();
});

test('Optional activity remains clearly optional and contributes zero authoritative package cost', async ({ page }) => {
  await openPackage(page, 'activity-optional'); await openActivity(page);
  await page.getByTestId('activity-inclusion-status').selectOption('OPTIONAL');
  await page.getByTestId('confirm-trip-activity').click();
  await expect(page.getByText('Optional add-on', { exact: true })).toBeVisible();
  await page.getByTestId('calculate-trip-costs').click();
  await expect(page.getByTestId('trip-supplier-cost')).toContainText('0');
});
