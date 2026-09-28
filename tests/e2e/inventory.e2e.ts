import { expect, test } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test('hotel, rooms and contracted rate survive edit and reload', async ({ page }) => {
  const suffix = Date.now();
  const originalName = `UX Hotel ${suffix}`;
  const editedName = `${originalName} Grand`;
  await page.goto('/');
  await page.locator('#nav-item-accommodation').click();
  await expect(page.getByTestId('accommodation-inventory')).toBeVisible();

  await page.getByTestId('add-property').click();
  await page.getByTestId('property-name').fill(originalName);
  await page.getByTestId('property-city').fill('Srinagar');
  await page.getByTestId('property-location').fill('Dal Lake');
  await page.getByTestId('save-property').click();
  await page.getByTestId(`property-${originalName}`).click();

  for (const room of ['Deluxe Room', 'Premium Suite']) {
    await page.getByTestId('add-room').click();
    await page.getByTestId('room-name').fill(`${room} ${suffix}`);
    await page.getByTestId('save-room').click();
    await expect(page.getByTestId(`room-${room} ${suffix}`)).toBeVisible();
  }

  await page.getByTestId('add-accommodation-rate').click();
  await page.getByTestId('rate-meal-plan').selectOption('MAP');
  await page.getByTestId('rate-base').fill('8750');
  await page.getByTestId('rate-from').fill('2028-01-01');
  await page.getByTestId('rate-to').fill('2028-03-31');
  await page.getByTestId('save-accommodation-rate').click();
  await expect(page.getByText('INR 8,750')).toBeVisible();

  await page.locator('[data-testid^="edit-accommodation-rate-"]').click();
  await page.getByTestId('rate-base').fill('9100');
  await page.getByTestId('save-accommodation-rate').click();
  await expect(page.getByText('INR 9,100')).toBeVisible();

  await page.getByTestId('edit-property').click();
  await page.getByTestId('property-name').fill(editedName);
  await page.getByTestId('save-property').click();
  await expect(page.getByTestId(`property-${editedName}`)).toBeVisible();

  await page.reload();
  await page.locator('#nav-item-accommodation').click();
  await page.getByTestId(`property-${editedName}`).click();
  await expect(page.getByTestId(`room-Deluxe Room ${suffix}`)).toBeVisible();
  await expect(page.getByTestId(`room-Premium Suite ${suffix}`)).toBeVisible();
  await expect(page.getByText('INR 9,100')).toBeVisible();
});

test('transport vehicles, supplier and per-day rate survive reload', async ({ page }) => {
  const suffix = Date.now();
  const supplier = `UX Transport ${suffix}`;
  const sedan = `Sedan ${suffix}`;
  const innova = `Innova ${suffix}`;
  const edited = `${sedan} Plus`;
  await page.goto('/');
  await page.locator('#nav-item-transport').click();
  await expect(page.getByRole('heading', { name: 'Transport Inventory' }).last()).toBeVisible();

  await page.getByTestId('transport-tab-suppliers').click();
  await page.getByTestId('add-transport-supplier').click();
  await page.getByTestId('transport-supplier-name').fill(supplier);
  await page.getByTestId('save-transport-supplier').click();
  await expect(page.getByText(supplier, { exact: true })).toBeVisible();

  await page.getByTestId('transport-tab-vehicles').click();
  for (const name of [sedan, innova]) {
    await page.getByTestId('add-vehicle').click();
    await page.getByTestId('vehicle-name').fill(name);
    await page.getByLabel('Display name').fill(name);
    await page.getByTestId('save-vehicle').click();
    await expect(page.getByText(name, { exact: true })).toBeVisible();
  }
  await page.getByLabel(`Edit ${sedan}`).click();
  await page.getByTestId('vehicle-name').fill(edited);
  await page.getByLabel('Display name').fill(edited);
  await page.getByTestId('save-vehicle').click();

  await page.getByTestId('transport-tab-rates').click();
  await page.getByTestId('add-transport-rate').click();
  await page.getByTestId('transport-rate-vehicle').selectOption({ label: innova });
  await page.getByLabel('Supplier').selectOption({ label: supplier });
  await page.getByTestId('transport-base-rate').fill('6600');
  await page.getByLabel('Valid from').fill('2028-04-01');
  await page.getByLabel('Valid to').fill('2028-09-30');
  await page.getByTestId('save-transport-rate').click();
  await expect(page.getByText(/₹6,600 PER DAY/)).toBeVisible();

  await page.locator('[data-testid^="edit-transport-rate-"]').last().click();
  await page.getByTestId('transport-base-rate').fill('6900');
  await page.getByTestId('save-transport-rate').click();
  await expect(page.getByText(/₹6,900 PER DAY/)).toBeVisible();

  await page.reload();
  await page.locator('#nav-item-transport').click();
  await expect(page.getByText(edited, { exact: true })).toBeVisible();
  await expect(page.getByText(innova, { exact: true })).toBeVisible();
  await page.getByTestId('transport-tab-rates').click();
  await expect(page.getByText(/₹6,900 PER DAY/)).toBeVisible();
});

test('activity provider, activity and flexible rate survive reload', async ({ page }) => {
  const suffix = Date.now();
  const provider = `UX Activity Provider ${suffix}`;
  const activity = `Rafting ${suffix}`;
  const edited = `${activity} Premium`;
  await page.goto('/');
  await page.locator('#nav-item-activities').click();
  await expect(page.getByRole('heading', { name: 'Activity Inventory' }).last()).toBeVisible();

  await page.getByTestId('activity-tab-providers').click();
  await page.getByTestId('add-activity-provider').click();
  await page.getByTestId('activity-provider-name').fill(provider);
  await page.getByTestId('save-activity-provider').click();

  await page.getByTestId('activity-tab-activities').click();
  await page.getByTestId('add-activity').click();
  await page.getByTestId('activity-name').fill(activity);
  await page.getByLabel('Destination identifier').fill('pahalgam');
  await page.getByLabel('Provider').selectOption({ label: provider });
  await page.getByLabel('Internal description').fill('Guided rafting experience');
  await page.getByTestId('save-activity').click();
  await page.getByLabel(`Edit ${activity}`).click();
  await page.getByTestId('activity-name').fill(edited);
  await page.getByTestId('save-activity').click();

  await page.getByTestId('activity-tab-rates').click();
  await page.getByTestId('add-activity-rate').click();
  await page.getByTestId('activity-rate-activity').selectOption({ label: edited });
  await page.getByTestId('activity-rate-provider').selectOption({ label: provider });
  await page.getByTestId('activity-rate-amount').fill('2400');
  await page.getByLabel('Valid from').fill('2028-05-01');
  await page.getByLabel('Valid to').fill('2028-10-31');
  await page.getByTestId('save-activity-rate').click();
  await expect(page.getByText(/adult: ₹2,400/)).toBeVisible();

  await page.locator('[data-testid^="edit-activity-rate-"]').last().click();
  await page.getByTestId('activity-rate-amount').fill('2600');
  await page.getByTestId('save-activity-rate').click();
  await expect(page.getByText(/adult: ₹2,600/)).toBeVisible();

  await page.reload();
  await page.locator('#nav-item-activities').click();
  await expect(page.getByText(edited, { exact: true })).toBeVisible();
  await page.getByTestId('activity-tab-rates').click();
  await expect(page.getByText(/adult: ₹2,600/)).toBeVisible();
});
