import { expect, test } from '@playwright/test';

const employee = {
  id: 'emp-sales-01', employeeId: 'emp-sales-01', firebaseUid: 'demo:emp-sales-01',
  name: 'Tariq Bhat', email: 'tariq.sales@bookingbridge.com', role: 'Sales Executive',
  department: 'Sales', salesTeamId: 'sales-team-01', active: true, createdAt: '2025-01-10T00:00:00Z',
};

const trip = {
  id: 'trip-m44', customerId: 'customer-m44', leadId: 'lead-m44', title: 'Detailed Kashmir Journey',
  destination: 'Kashmir', startDate: '2026-10-15', endDate: '2026-10-20', travelerCount: 2,
  adults: 2, children: 0, tripType: 'LEISURE', currency: 'INR', status: 'ITINERARY_READY',
  costingStatus: 'CALCULATED', costingRevision: 1, costingCalculatedRevision: 1,
  totalSupplierCost: 30_000, totalSellingPrice: 65_000, grossProfit: 35_000, grossMargin: 53.8,
  assignedSalesEmployeeId: 'emp-sales-01', salesTeamId: 'sales-team-01',
  createdAt: '2026-09-29T09:00:00.000Z', updatedAt: '2026-09-29T09:00:00.000Z', isDemo: true,
};

const content = (dayNumber: number) => ({
  style: 'DETAILED', status: 'CURRENT', sourceFingerprint: `v1-seeded-${dayNumber}`,
  updatedAt: '2026-09-29T09:00:00.000Z', updatedByEmployeeId: 'emp-sales-01',
});

const itineraryDays = [
  {
    id: 'day-m44-1', tripId: trip.id, dayNumber: 1, date: '2026-10-15',
    title: 'Arrival in Srinagar', location: 'Srinagar', description: 'A warm arrival in Srinagar followed by a relaxed evening on Nigeen Lake.', notes: '',
    customerContent: content(1),
    items: [
      { id: 'hotel-m44', dayId: 'day-m44-1', tripId: trip.id, type: 'HOTEL', title: 'Nigeen Houseboat — Cedar Suite — MAP', description: 'A quiet lake stay.', supplierCost: 12_000, metadata: { propertyId: 'property-houseboat', propertyName: 'Nigeen Houseboat', roomCategoryId: 'room-cedar', roomCategoryName: 'Cedar Suite', rateId: 'rate-houseboat-map', mealPlan: 'MAP', checkInDate: '2026-10-15', checkOutDate: '2026-10-16', nights: 1, rooms: 1, adults: 2, children: 0, supplierId: 'supplier-secret' } },
      { id: 'transport-m44', dayId: 'day-m44-1', tripId: trip.id, type: 'TRANSPORT', title: 'Private airport transfer', description: 'Airport pickup.', supplierCost: 3_000, metadata: { vehicleCategoryId: 'vehicle-innova', rateId: 'rate-innova', vehicleName: 'Innova Crysta', serviceType: 'AIRPORT_PICKUP', routeName: 'Srinagar Airport → Nigeen Lake', startDate: '2026-10-15' } },
      { id: 'activity-m44', dayId: 'day-m44-1', tripId: trip.id, type: 'ACTIVITY', title: 'Shikara Ride', description: 'A gentle lake cruise.', supplierCost: 1_000, metadata: { activityId: 'activity-shikara', rateId: 'rate-shikara', activityName: 'Shikara Ride', date: '2026-10-15', inclusionStatus: 'INCLUDED' } },
    ],
  },
  {
    id: 'day-m44-2', tripId: trip.id, dayNumber: 2, date: '2026-10-16',
    title: 'Gulmarg Meadows & Mountain Views', location: 'Gulmarg', description: 'Travel into Gulmarg for broad meadows, pine-covered slopes and mountain scenery.', notes: '', customerContent: content(2),
    items: [
      { id: 'transport-m44-2', dayId: 'day-m44-2', tripId: trip.id, type: 'TRANSPORT', title: 'Private Gulmarg excursion', description: 'Return sightseeing transfer.', metadata: { vehicleCategoryId: 'vehicle-innova', rateId: 'rate-innova', vehicleName: 'Innova Crysta', routeName: 'Srinagar → Gulmarg → Srinagar', startDate: '2026-10-16' } },
      { id: 'activity-m44-2', dayId: 'day-m44-2', tripId: trip.id, type: 'ACTIVITY', title: 'Gulmarg Gondola', description: 'Available subject to weather and ticket availability.', metadata: { activityId: 'activity-gondola', rateId: 'rate-gondola', activityName: 'Gulmarg Gondola', date: '2026-10-16', inclusionStatus: 'OPTIONAL' } },
    ],
  },
  {
    id: 'day-m44-3', tripId: trip.id, dayNumber: 3, date: '2026-10-17',
    title: 'Sonamarg — Meadows of Gold', location: 'Sonamarg', description: 'A scenic day excursion through the Sindh valley to Sonamarg.', notes: '', customerContent: content(3),
    items: [{ id: 'transport-m44-3', dayId: 'day-m44-3', tripId: trip.id, type: 'TRANSPORT', title: 'Private Sonamarg excursion', description: 'Return transfer.', metadata: { vehicleCategoryId: 'vehicle-innova', rateId: 'rate-innova', vehicleName: 'Innova Crysta', routeName: 'Srinagar → Sonamarg → Srinagar', startDate: '2026-10-17' } }],
  },
  {
    id: 'day-m44-4', tripId: trip.id, dayNumber: 4, date: '2026-10-18',
    title: 'Srinagar to Pahalgam', location: 'Pahalgam', description: 'Travel south to Pahalgam and settle in beside the Lidder valley.', notes: '', customerContent: content(4),
    items: [
      { id: 'transport-m44-4', dayId: 'day-m44-4', tripId: trip.id, type: 'TRANSPORT', title: 'Private Pahalgam transfer', description: 'Intercity transfer.', metadata: { vehicleCategoryId: 'vehicle-innova', rateId: 'rate-innova', vehicleName: 'Innova Crysta', routeName: 'Srinagar → Pahalgam', startDate: '2026-10-18' } },
      { id: 'hotel-m44-4', dayId: 'day-m44-4', tripId: trip.id, type: 'HOTEL', title: 'Pahalgam Retreat — Valley Room — CP', description: 'An overnight valley stay.', metadata: { propertyId: 'property-pahalgam', propertyName: 'Pahalgam Retreat', roomCategoryId: 'room-valley', roomCategoryName: 'Valley Room', rateId: 'rate-pahalgam-cp', mealPlan: 'CP', checkInDate: '2026-10-18', checkOutDate: '2026-10-19', nights: 1, rooms: 1, adults: 2, children: 0 } },
    ],
  },
  {
    id: 'day-m44-5', tripId: trip.id, dayNumber: 5, date: '2026-10-19',
    title: 'Pahalgam to Srinagar', location: 'Srinagar', description: 'Return to Srinagar for a relaxed final evening in the city.', notes: '', customerContent: content(5),
    items: [{ id: 'transport-m44-5', dayId: 'day-m44-5', tripId: trip.id, type: 'TRANSPORT', title: 'Private Srinagar transfer', description: 'Return transfer.', metadata: { vehicleCategoryId: 'vehicle-innova', rateId: 'rate-innova', vehicleName: 'Innova Crysta', routeName: 'Pahalgam → Srinagar', startDate: '2026-10-19' } }],
  },
  {
    id: 'day-m44-6', tripId: trip.id, dayNumber: 6, date: '2026-10-20',
    title: 'Departure from Srinagar', location: 'Srinagar', description: 'A timely transfer to Srinagar Airport for the onward flight.', notes: '', customerContent: content(6),
    items: [{ id: 'transport-m44-6', dayId: 'day-m44-6', tripId: trip.id, type: 'TRANSPORT', title: 'Private airport drop', description: 'Departure transfer.', metadata: { vehicleCategoryId: 'vehicle-innova', rateId: 'rate-innova', vehicleName: 'Innova Crysta', serviceType: 'AIRPORT_DROP', routeName: 'Srinagar → Srinagar Airport', startDate: '2026-10-20' } }],
  },
];

async function openTrip(page: import('@playwright/test').Page) {
  await page.locator('#nav-item-trips').click();
  await page.getByRole('button', { name: /Open Builder/ }).first().click();
  await expect(page.getByTestId('itinerary-customer-description')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ employee, trip, itineraryDays }) => {
    if (!sessionStorage.getItem('m44-seeded')) {
      localStorage.clear();
      sessionStorage.setItem('m44-seeded', 'true');
      localStorage.setItem('bb_customers', JSON.stringify([{ id: 'customer-m44', name: 'Ayesha Khan', phone: '+919999999999', email: 'ayesha@example.com', city: 'Delhi', segment: 'B2C' }]));
      localStorage.setItem('bb_leads', JSON.stringify([{ id: 'lead-m44', customerId: 'customer-m44', customerName: 'Ayesha Khan', destination: 'Kashmir', assignedEmployeeId: 'emp-sales-01', salesTeamId: 'sales-team-01' }]));
      localStorage.setItem('bb_trips', JSON.stringify([trip]));
      localStorage.setItem('bb_itinerary_days', JSON.stringify(itineraryDays));
      localStorage.setItem('bb_quotes', '[]');
    }
    localStorage.setItem('booking_bridge_active_user', JSON.stringify(employee));
  }, { employee, trip, itineraryDays });
  await page.goto('/');
});

test('Sales edits six-day customer copy without changing costing, then reviews service-driven staleness', async ({ page }) => {
  await openTrip(page);
  await expect(page.getByTestId('trip-costing-status')).toHaveText('Costs current');
  await expect(page.getByText('Nigeen Houseboat — Cedar Suite — MAP')).toBeVisible();

  const expectedTitles = itineraryDays.map(day => day.title);
  for (let index = 0; index < expectedTitles.length; index += 1) {
    await page.getByTestId(`itinerary-day-${index + 1}`).click();
    await expect(page.getByTestId('itinerary-customer-title')).toHaveValue(expectedTitles[index]);
  }
  await page.getByTestId('itinerary-day-1').click();

  page.once('dialog', dialog => dialog.accept());
  await page.getByTestId('rebuild-itinerary-content').click();
  await expect(page.getByTestId('itinerary-customer-description')).toContainText('Shikara Ride');
  await expect(page.getByTestId('itinerary-customer-description')).toContainText('Breakfast and Dinner');

  await page.getByTestId('itinerary-customer-title').fill('A Warm Welcome to Srinagar');
  await page.getByTestId('itinerary-customer-description').fill('Meet your driver, settle into the houseboat, and enjoy the included Shikara Ride. Breakfast and Dinner are included under MAP.');
  await page.getByTestId('save-itinerary-content').click();
  await expect(page.getByText('Customer itinerary copy saved.')).toBeVisible();
  await expect(page.getByTestId('trip-costing-status')).toHaveText('Costs current');
  await expect(page.getByTestId('itinerary-review-warning')).toHaveCount(0);

  await page.getByRole('button', { name: 'Custom Note' }).click();
  await page.getByPlaceholder('e.g. Mughal Gardens Walk (Nishat & Shalimar)').fill('Mughal Gardens Walk');
  await page.getByPlaceholder('Provide details or instructions for guest / driver...').fill('Nishat and Shalimar gardens visit.');
  await page.getByRole('button', { name: 'Save Item' }).click();
  await expect(page.getByTestId('itinerary-review-warning')).toBeVisible();
  await expect(page.getByTestId('itinerary-customer-title')).toHaveValue('A Warm Welcome to Srinagar');
  await expect(page.getByText('Nigeen Houseboat — Cedar Suite — MAP')).toBeVisible();
  await expect(page.getByTestId('trip-costing-status')).toHaveText('Needs update');

  await page.getByTestId('mark-itinerary-reviewed').click();
  await expect(page.getByTestId('itinerary-review-warning')).toHaveCount(0);
  await expect(page.getByTestId('trip-costing-status')).toHaveText('Needs update');

  await page.reload();
  await openTrip(page);
  await expect(page.getByTestId('itinerary-customer-title')).toHaveValue('A Warm Welcome to Srinagar');
  await expect(page.getByText('Mughal Gardens Walk')).toBeVisible();
  await expect(page.getByTestId('itinerary-review-warning')).toHaveCount(0);
});

test('customer preview keeps inclusion semantics safe and freezes the shared six-day itinerary', async ({ page }) => {
  await page.locator('#nav-item-quotes').click();
  await page.getByTestId('new-trip-quote').click();
  await page.getByTestId('quote-trip-select').selectOption(trip.id);
  await page.getByTestId('create-trip-quote').click();
  await page.getByTestId('open-customer-package').click();

  let preview = page.getByTestId('customer-package-preview');
  await expect(preview).toBeVisible();
  const headings = await preview.getByTestId('customer-package-day-title').allTextContents();
  expect(headings).toEqual(itineraryDays.map(day => `Day ${day.dayNumber}: ${day.title}`));
  const included = preview.getByTestId('customer-package-activity').filter({ hasText: 'Shikara Ride' });
  const optional = preview.getByTestId('customer-package-activity').filter({ hasText: 'Gulmarg Gondola' });
  await expect(included).not.toContainText('Optional add-on');
  await expect(optional).toContainText('Optional add-on');
  await expect(preview).toContainText('Meals: Breakfast, Dinner');
  await expect(preview).toContainText('Route: Srinagar → Pahalgam');
  await expect(preview).not.toContainText('supplier-secret');
  await expect(preview).not.toContainText('Supplier cost');
  await expect(preview).not.toContainText('Profit');
  await expect(preview).not.toContainText('Margin');

  await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('share-customer-package').click(),
  ]);
  await page.getByLabel('Close customer package').click();

  await openTrip(page);
  await page.getByTestId('itinerary-day-2').click();
  await page.getByTestId('itinerary-customer-title').fill('Live Gulmarg Copy Updated');
  await page.getByTestId('save-itinerary-content').click();
  await expect(page.getByText('Customer itinerary copy saved.')).toBeVisible();

  await page.locator('#nav-item-quotes').click();
  await page.getByTestId('open-customer-package').click();
  preview = page.getByTestId('customer-package-preview');
  await expect(preview).toBeVisible();
  await expect(preview).toContainText('Day 2: Gulmarg Meadows & Mountain Views');
  await expect(preview).not.toContainText('Live Gulmarg Copy Updated');
});
