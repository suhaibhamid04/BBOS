import { expect, test, type Page } from '@playwright/test';

const employee = {
  id: 'emp-sales-01', employeeId: 'emp-sales-01', firebaseUid: 'demo:emp-sales-01',
  name: 'Tariq Bhat', email: 'tariq.sales@bookingbridge.com', role: 'Sales Executive',
  department: 'Sales', salesTeamId: 'sales-team-01', active: true, createdAt: '2025-01-10T00:00:00Z',
};

function hotelItem(id: string, options: {
  propertyId?: string;
  propertyName?: string;
  roomCategoryId?: string;
  roomCategoryName?: string;
  rateId?: string;
  checkInDate?: string;
  nights?: number;
  rooms?: number;
  adults?: number;
  supplierCost?: number;
} = {}) {
  const propertyId = options.propertyId || 'accom-sgr-kareemresidency';
  const roomCategoryId = options.roomCategoryId || 'rc-accom-sgr-kareemresidency';
  const checkInDate = options.checkInDate || '2026-10-12';
  const nights = options.nights || 1;
  const rooms = options.rooms || 1;
  const adults = options.adults || 2;
  const allocations = Array.from({ length: rooms }, (_, index) => ({
    roomIndex: index + 1,
    roomCategoryId,
    adults: Math.floor(adults / rooms) + (index < adults % rooms ? 1 : 0),
    children: 0,
    childAges: [],
  }));
  return {
    id: `hotel-${id}`, dayId: `day-${id}`, tripId: `trip-${id}`, type: 'HOTEL',
    title: `${options.propertyName || 'Hotel Kareem Residency'} - ${options.roomCategoryName || 'Premium Deluxe'} - MAP`,
    description: `${nights} nights - ${rooms} rooms`,
    referenceId: propertyId, inventoryId: propertyId, supplierCost: options.supplierCost ?? 4_000 * rooms * nights,
    metadata: {
      inventoryType: 'ACCOMMODATION', propertyId, propertyName: options.propertyName || 'Hotel Kareem Residency',
      roomCategoryId, roomCategoryName: options.roomCategoryName || 'Premium Deluxe',
      rateId: options.rateId || 'rp-accom-sgr-kareemresidency-oct', mealPlan: 'MAP', checkInDate,
      checkOutDate: '2026-10-13', nights, rooms, adults, children: 0, childrenWithBed: 0,
      childrenWithoutBed: 0, needsConfirmation: false, taxDescription: 'Tax Included', roomAllocations: allocations,
    },
  };
}

function seedRecords(id: string, options: {
  item?: ReturnType<typeof hotelItem>;
  adults?: number;
  costingStatus?: 'PENDING' | 'CALCULATED';
  costingRevision?: number;
  costingCalculatedRevision?: number;
  totalSupplierCost?: number;
  quotes?: Record<string, unknown>[];
} = {}) {
  const adults = options.adults || 2;
  const item = options.item || hotelItem(id, { adults });
  const costingStatus = options.costingStatus || 'CALCULATED';
  const costingRevision = options.costingRevision ?? 0;
  const trip = {
    id: `trip-${id}`, customerId: `customer-${id}`, leadId: `lead-${id}`, title: `Freshness ${id}`,
    destination: 'Kashmir', startDate: item.metadata.checkInDate, endDate: item.metadata.checkOutDate,
    travelerCount: adults, adults, children: 0, childAges: [], tripType: 'Family', currency: 'INR', status: 'DRAFT',
    totalSupplierCost: options.totalSupplierCost ?? item.supplierCost, totalSellingPrice: 100_000,
    grossProfit: 100_000 - (options.totalSupplierCost ?? item.supplierCost), grossMargin: 96,
    costingStatus, costingRevision,
    ...(options.costingCalculatedRevision !== undefined
      ? { costingCalculatedRevision: options.costingCalculatedRevision }
      : costingStatus === 'CALCULATED' ? { costingCalculatedRevision: costingRevision } : {}),
    assignedSalesEmployeeId: employee.employeeId, salesTeamId: employee.salesTeamId,
    createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', isDemo: true,
  };
  const day = {
    id: `day-${id}`, tripId: trip.id, dayNumber: 1, date: trip.startDate,
    title: 'Hotel stay', location: 'Srinagar', description: 'Hotel stay', items: [item],
  };
  const customer = {
    id: trip.customerId, name: `Guest ${id}`, phone: '9999999999', email: `${id}@example.com`,
    type: 'INDIVIDUAL', totalBookings: 0, lifetimeValue: 0,
    createdAt: trip.createdAt, updatedAt: trip.updatedAt,
  };
  return { trip, day, customer, quotes: options.quotes || [] };
}

async function seedAndOpenBuilder(page: Page, id: string, records = seedRecords(id)) {
  await page.addInitScript(({ employee, records }) => {
    const marker = `m4-1c-${records.trip.id}`;
    if (!sessionStorage.getItem(marker)) {
      sessionStorage.setItem(marker, 'true');
      localStorage.clear();
      localStorage.setItem('bb_trips', JSON.stringify([records.trip]));
      localStorage.setItem('bb_itinerary_days', JSON.stringify([records.day]));
      localStorage.setItem('bb_customers', JSON.stringify([records.customer]));
      localStorage.setItem('bb_quotes', JSON.stringify(records.quotes));
    }
    localStorage.setItem('booking_bridge_active_user', JSON.stringify(employee));
  }, { employee, records });
  await page.goto('/');
  await page.locator('#nav-item-trips').click();
  await page.getByRole('button', { name: /Open Builder/ }).first().click();
  await expect(page.locator('#trip-builder-active')).toBeVisible();
}

async function editHotel(page: Page) {
  await page.locator('[data-testid^="edit-trip-item-"]').first().click();
  await expect(page.getByTestId('hotel-inventory-picker')).toBeVisible();
}

test('Scenario A - hotel replacement invalidates, survives reload, and recalculates before Quote creation', async ({ page }) => {
  await seedAndOpenBuilder(page, 'hotel-change');
  await editHotel(page);
  await page.getByTestId('trip-hotel-property').selectOption('accom-sgr-regal');
  await expect(page.getByTestId('trip-hotel-room')).not.toHaveValue('');
  await page.getByTestId('confirm-trip-hotel').click();

  await expect(page.getByTestId('costing-freshness-banner')).toBeVisible();
  await expect(page.getByTestId('trip-supplier-cost')).toContainText('Needs update');
  await expect(page.getByTestId('trip-gross-profit')).toHaveText('—');
  await expect(page.getByTestId('trip-gross-margin')).toHaveText('—');
  await expect(page.getByTestId('create-quote-from-trip')).toBeDisabled();

  await page.reload();
  await page.locator('#nav-item-trips').click();
  await page.getByRole('button', { name: /Open Builder/ }).first().click();
  await expect(page.getByTestId('costing-freshness-banner')).toBeVisible();
  await page.getByTestId('update-costs-banner').click();
  await expect(page.getByTestId('costing-freshness-banner')).toHaveCount(0);
  await expect(page.getByTestId('trip-costing-status')).toHaveText('Costs current');
  await expect(page.getByTestId('trip-supplier-cost')).toContainText('2,800');
  await expect(page.getByTestId('create-quote-from-trip')).toBeEnabled();
});

test('Scenario B - package supplier-rate change masks stale profit and recomputes it', async ({ page }) => {
  await seedAndOpenBuilder(page, 'rate-change');
  await editHotel(page);
  await page.getByTestId('use-package-per-night').click();
  await page.getByTestId('package-rate-amount').fill('3800');
  await page.getByTestId('confirm-trip-hotel').click();

  await expect(page.getByTestId('trip-gross-profit')).toHaveText('—');
  await expect(page.getByTestId('trip-gross-margin')).toHaveText('—');
  await page.getByTestId('update-costs-banner').click();
  await expect(page.getByTestId('trip-supplier-cost')).toContainText('3,800');
  await expect(page.getByTestId('trip-gross-profit')).toContainText('96,200');
  await expect(page.getByTestId('trip-gross-margin')).toHaveText('96.2%');
});

test('Scenario C - room count change remains stale after reload until authoritative update', async ({ page }) => {
  const item = hotelItem('room-change', { adults: 6, rooms: 2, supplierCost: 8_000 });
  const records = seedRecords('room-change', { item, adults: 6, totalSupplierCost: 8_000 });
  await seedAndOpenBuilder(page, 'room-change', records);
  await editHotel(page);
  await page.getByTestId('trip-hotel-rooms').fill('3');
  await page.getByTestId('confirm-trip-hotel').click();
  await expect(page.getByTestId('costing-freshness-banner')).toBeVisible();

  await page.reload();
  await page.locator('#nav-item-trips').click();
  await page.getByRole('button', { name: /Open Builder/ }).first().click();
  await expect(page.getByTestId('costing-freshness-banner')).toBeVisible();
  await page.getByTestId('update-costs-banner').click();
  await expect(page.getByTestId('trip-supplier-cost')).toContainText('12,000');
});

test('Scenario D - stale current package preserves shared V1 and permits a fresh revision only after recalculation', async ({ page }) => {
  const item = hotelItem('history', {
    propertyId: 'accom-sgr-regal', propertyName: 'Hotel Regal Palace',
    roomCategoryId: 'rc-accom-sgr-regal', roomCategoryName: 'Deluxe Room',
    rateId: 'rate-sgr-regal', supplierCost: 4_000,
  });
  const snapshot = {
    brand: { name: 'Booking Bridge', tagline: 'Travel, thoughtfully arranged', email: 'sales@bookingbridge.com', phone: '+91 99999 99999' },
    packageReference: 'Q-HISTORY', customerName: 'Guest history', destination: 'Kashmir', travelerCount: 2,
    hotels: [{ hotelName: 'Hotel Kareem Residency', roomCategoryName: 'Premium Deluxe', mealPlan: 'MAP', nights: 1, rooms: 1 }],
    transports: [], activities: [], itinerary: [], packageSellingPrice: 100_000, currency: 'INR',
    inclusions: ['Hotel'], exclusions: [], termsAndConditions: 'Historical V1', generatedAt: '2026-10-01T00:00:00.000Z',
  };
  const quote = {
    id: 'quote-history', leadId: 'lead-history', customerId: 'customer-history', customerName: 'Guest history',
    destination: 'Kashmir', tripId: 'trip-history', travelerCount: 2, adults: 2, children: 0,
    totalAmount: 100_000, discountAmount: 0, finalAmount: 100_000, totalSupplierCost: 4_000,
    grossProfit: 96_000, grossMargin: 96, status: 'SENT', salesEmployeeId: employee.employeeId,
    salesEmployeeName: employee.name, salesTeamId: employee.salesTeamId, version: 2,
    supplierCostSource: { type: 'TRIP', sourceId: 'trip-history', asOf: '2026-10-01T00:00:00.000Z', costingRevision: 0 },
    sharedAt: '2026-10-01T00:00:00.000Z', sharedByEmployeeId: employee.employeeId, shareChannel: 'DOCUMENT',
    customerPackageSnapshot: snapshot, hotels: [], transports: [], activities: [], backupAccommodations: [],
    versionHistory: [{ version: 1, updatedAt: '2026-10-01T00:00:00.000Z', updatedBy: employee.employeeId, totalAmount: 100_000, discountAmount: 0, finalAmount: 100_000, status: 'DRAFT' }],
    validUntil: '2026-10-31', createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', isDemo: true,
  };
  const records = seedRecords('history', {
    item, costingStatus: 'PENDING', costingRevision: 1, totalSupplierCost: 4_000, quotes: [quote],
  });
  await seedAndOpenBuilder(page, 'history', records);
  await expect(page.getByTestId('create-quote-from-trip')).toHaveText(/Open Quote/);
  await page.getByTestId('create-quote-from-trip').click();
  await expect(page.getByTestId('quote-costing-warning')).toBeVisible();
  await expect(page.getByTestId('quote-profit')).toContainText('96,000');
  await expect(page.getByTestId('save-quote')).toBeDisabled();

  await page.getByTestId('open-customer-package').click();
  await expect(page.getByText('Historical V1')).toBeVisible();
  await expect(page.getByText(/Customer-safe document.*Q-HISTORY/)).toBeVisible();
  await page.getByLabel('Close customer package').click();
  await page.getByTestId('quote-update-costs').click();
  await expect(page.getByTestId('quote-costing-warning')).toHaveCount(0);
  await page.getByTestId('save-quote').click();
  await expect(page.getByTestId('quote-version')).toHaveText('V3');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('bb_quotes') || '[]')[0]);
  expect(stored.versionHistory[0].version).toBe(1);
  expect(stored.versionHistory[1].customerPackageSnapshot.hotels[0].hotelName).toBe('Hotel Kareem Residency');
  expect(stored.totalSupplierCost).toBe(2_800);
});

test('Scenario E - unavailable pricing keeps PENDING and succeeds after manual supplier pricing retry', async ({ page }) => {
  const item = hotelItem('retry', { checkInDate: '2025-10-12', rateId: 'rp-accom-sgr-kareemresidency-oct' });
  const records = seedRecords('retry', { item, costingStatus: 'PENDING', costingRevision: 1 });
  await seedAndOpenBuilder(page, 'retry', records);
  await page.getByTestId('update-costs-banner').click();
  await expect(page.getByText(/unavailable for these dates/i)).toBeVisible();
  await expect(page.getByTestId('costing-freshness-banner')).toBeVisible();

  await editHotel(page);
  await expect(page.getByText(/selected contracted rate does not match/i)).toBeVisible();
  await page.getByTestId('use-package-total').click();
  await page.getByTestId('package-rate-amount').fill('9250');
  await page.getByTestId('confirm-trip-hotel').click();
  await page.getByTestId('update-costs-banner').click();
  await expect(page.getByTestId('costing-freshness-banner')).toHaveCount(0);
  await expect(page.getByTestId('trip-supplier-cost')).toContainText('9,250');
});
