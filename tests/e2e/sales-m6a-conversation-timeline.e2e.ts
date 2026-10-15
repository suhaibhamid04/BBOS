import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const executive = {
  id: 'emp-sales-01', employeeId: 'emp-sales-01', firebaseUid: 'demo:emp-sales-01',
  name: 'Tariq Bhat', email: 'tariq.sales@bookingbridge.com', role: 'Sales Executive',
  department: 'Sales', salesTeamId: 'sales-team-01', managerEmployeeId: 'emp-mgr-01', active: true,
};
const headers = { 'X-Demo-User-Id': executive.employeeId };

async function createLead(request: APIRequestContext, suffix: string) {
  const response = await request.post('/api/leads', { headers, data: {
    creationRequestId: `m6a-${suffix}`, customerName: `M6A Customer ${suffix}`, customerPhone: '9876543210',
    customerEmail: 'm6a@example.com', destination: 'Kashmir', sourceId: 'DIRECT_CALL', adults: 2,
    children: 0, travelStartDate: '2026-12-10', nights: 5,
  } });
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()).data as Record<string, any>;
}

function packageSnapshot(customerName: string) {
  return {
    brand: { name: 'Booking Bridge', tagline: 'Travel, thoughtfully arranged', email: 'travel@bookingbridge.com', phone: '+91 99999 00000' },
    packageReference: 'quote-m6a', customerName, destination: 'Kashmir', travelStartDate: '2026-12-10', travelEndDate: '2026-12-15',
    travelerCount: 2, hotels: [{ hotelName: 'Gulmarg View', roomCategoryName: 'Deluxe', mealPlan: 'MAP', nights: 5, rooms: 1 }],
    transports: [], activities: [], itinerary: [], packageSellingPrice: 72000, currency: 'INR', inclusions: ['Hotel'], exclusions: ['Flights'],
    termsAndConditions: 'Subject to availability.', generatedAt: new Date().toISOString(),
  };
}

async function seedBrowser(page: Page, lead: Record<string, any>) {
  const now = new Date().toISOString();
  const trip = {
    id: `trip-${lead.id}`, customerId: lead.customerId, leadId: lead.id, title: 'Kashmir M6A Package', destination: 'Kashmir',
    startDate: '2026-12-10', endDate: '2026-12-15', travelerCount: 2, adults: 2, children: 0, tripType: 'LEISURE', currency: 'INR',
    status: 'ITINERARY_READY', costingStatus: 'CALCULATED', costingRevision: 1, costingCalculatedRevision: 1,
    totalSupplierCost: 50000, totalSellingPrice: 72000, grossProfit: 22000, grossMargin: 30.6,
    assignedSalesEmployeeId: executive.employeeId, salesTeamId: executive.salesTeamId, createdAt: now, updatedAt: now, isDemo: true,
  };
  const quote = {
    id: `quote-${lead.id}`, optionId: `quote-${lead.id}`, quoteGroupId: `group-${lead.id}`, optionLabel: 'Recommended', customerTitle: 'Kashmir Holiday',
    optionOrder: 1, isRecommended: true, optionStatus: 'READY', optionSnapshotCreatedAt: now,
    leadId: lead.id, customerId: lead.customerId, customerName: lead.customerName, customerPhone: lead.customerPhone,
    customerEmail: lead.customerEmail, destination: 'Kashmir', tripId: trip.id, travelerCount: 2, adults: 2, children: 0,
    durationDays: 6, durationNights: 5, totalAmount: 72000, discountAmount: 0, finalAmount: 72000,
    totalSupplierCost: 50000, grossProfit: 22000, grossMargin: 30.6,
    supplierCostSource: { type: 'TRIP', sourceId: trip.id, asOf: now, costingRevision: 1 },
    approval: { required: false, state: 'NOT_REQUIRED' }, status: 'DRAFT', validUntil: '2026-12-31',
    salesEmployeeId: executive.employeeId, salesEmployeeName: executive.name, salesTeamId: executive.salesTeamId,
    createdByEmployeeId: executive.employeeId, updatedByEmployeeId: executive.employeeId, createdAt: now, updatedAt: now,
    customerPackageSnapshot: packageSnapshot(lead.customerName), version: 1, versionHistory: [], isDemo: true,
  };
  await page.addInitScript(({ employee, lead, trip, quote }) => {
    if (sessionStorage.getItem('m6a-browser-seeded') === lead.id) return;
    localStorage.clear();
    localStorage.setItem('booking_bridge_active_user', JSON.stringify(employee));
    localStorage.setItem('bb_leads', JSON.stringify([lead]));
    localStorage.setItem('bb_customers', JSON.stringify([{ id: lead.customerId, name: lead.customerName, phone: lead.customerPhone, email: lead.customerEmail, city: 'Delhi', customerType: 'B2C', preferences: [], notes: '', totalBookings: 0, lifetimeValue: 0, createdAt: lead.createdAt, updatedAt: lead.updatedAt }]));
    localStorage.setItem('bb_trips', JSON.stringify([trip]));
    localStorage.setItem('bb_itinerary_days', JSON.stringify([{ id: `day-${trip.id}`, tripId: trip.id, dayNumber: 1, date: trip.startDate, title: 'Arrival', items: [], customerContent: { status: 'CURRENT' } }]));
    localStorage.setItem('bb_quotes', JSON.stringify([quote]));
    localStorage.setItem('bb_customer_shares', '[]');
    localStorage.setItem('bb_audit_logs', '[]');
    sessionStorage.setItem('m6a-browser-seeded', lead.id);
  }, { employee: executive, lead, trip, quote });
}

async function openConversation(page: Page, leadId: string) {
  await page.goto(`/?view=lead-detail&id=${encodeURIComponent(leadId)}`);
  await page.getByRole('button', { name: 'Conversation', exact: true }).click();
  await expect(page.getByTestId('lead-conversation-tab')).toBeVisible();
}

test('M6A unifies Sales interaction, Quote/share history, internal notes and manual contact truthfully', async ({ page, request }) => {
  test.setTimeout(90_000);
  const suffix = String(Date.now());
  let lead = await createLead(request, suffix);
  const interaction = await request.post(`/api/leads/${lead.id}/interaction`, { headers, data: {
    outcome: 'CALLBACK_REQUESTED', expectedUpdatedAt: lead.updatedAt, idempotencyKey: `m6a-followup-${suffix}`,
    note: 'Customer asked for a revised package.', nextFollowUpAt: new Date(Date.now() + 86_400_000).toISOString(),
  } });
  expect(interaction.ok(), await interaction.text()).toBe(true);
  lead = (await interaction.json()).data;
  await seedBrowser(page, lead);
  await page.goto('/');
  await page.locator('#nav-item-quotes').click();
  await page.getByTestId(`open-quote-quote-${lead.id}`).click();
  await page.getByTestId('create-customer-share').click();
  const shareUrl = await page.getByLabel('Customer share URL').inputValue();
  await page.getByTestId('prepare-whatsapp').click();
  await expect(page.getByTestId('delivery-draft-modal')).toBeVisible();
  await page.getByLabel('Close delivery draft').click();
  await page.waitForTimeout(100);
  await page.goto(shareUrl);
  await expect(page.getByTestId('customer-share-page')).toBeVisible();

  await openConversation(page, lead.id);
  await expect(page.getByText('Callback requested', { exact: true })).toBeVisible();
  await expect(page.getByText('Follow-up scheduled', { exact: false })).toBeVisible();
  await expect(page.getByText('Quote V1 created', { exact: true })).toBeVisible();
  await expect(page.getByText('Customer package V1 shared', { exact: true })).toBeVisible();
  await expect(page.getByText('Package link viewed', { exact: true })).toBeVisible();
  await expect(page.getByText('WhatsApp package message prepared', { exact: true })).toBeVisible();
  await expect(page.getByText(/Message sent/i)).toHaveCount(0);

  await page.getByTestId('add-internal-note').click();
  await page.getByTestId('conversation-entry-body').fill('Customer prefers hotel close to Gulmarg Gondola.');
  await page.getByTestId('save-conversation-entry').click();
  const noteCard = page.getByTestId('conversation-entry').filter({ hasText: 'Customer prefers hotel close to Gulmarg Gondola.' });
  await expect(noteCard).toContainText('Internal only');

  await page.getByTestId('log-customer-contact').click();
  await page.getByTestId('contact-channel').selectOption('WHATSAPP');
  await page.getByTestId('contact-direction').selectOption('INBOUND');
  await page.getByTestId('conversation-entry-body').fill('Customer wants Premium hotel');
  await page.getByTestId('save-conversation-entry').click();
  const manualCard = page.getByTestId('conversation-entry').filter({ hasText: 'Customer wants Premium hotel' });
  await expect(manualCard).toContainText('Manually logged');
  await expect(manualCard).toContainText('WhatsApp · Manual log');

  await page.reload();
  await page.getByRole('button', { name: 'Conversation', exact: true }).click();
  await expect(page.getByText('Customer prefers hotel close to Gulmarg Gondola.')).toBeVisible();
  await expect(page.getByText('Customer wants Premium hotel')).toBeVisible();
  await expect(page.getByText('WhatsApp package message prepared', { exact: true })).toBeVisible();
  const text = await page.getByTestId('lead-conversation-tab').innerText();
  expect(text).not.toMatch(/supplier cost|gross profit|gross margin/i);
});

test('M6A paginates and rejects another Sales Executive', async ({ page, request }) => {
  test.setTimeout(90_000);
  const suffix = `${Date.now()}-page`;
  const lead = await createLead(request, suffix);
  for (let index = 0; index < 35; index += 1) {
    const response = await request.post(`/api/leads/${lead.id}/conversation/entries`, { headers, data: {
      kind: 'INTERNAL_NOTE', body: `Pagination note ${index}`, idempotencyKey: `m6a-page-${suffix}-${index}`,
    } });
    expect(response.ok(), await response.text()).toBe(true);
  }
  const denied = await request.get(`/api/leads/${lead.id}/conversation`, { headers: { 'X-Demo-User-Id': 'emp-sales-02' } });
  expect(denied.status()).toBe(403);

  await seedBrowser(page, lead);
  await openConversation(page, lead.id);
  await expect(page.getByTestId('conversation-entry')).toHaveCount(30);
  await page.getByTestId('load-earlier-conversation').click();
  await expect(page.getByText('Pagination note 0', { exact: true })).toBeVisible();
  await expect(page.getByTestId('conversation-entry')).toHaveCount(36);
  await expect(page.getByTestId('load-earlier-conversation')).toHaveCount(0);
});
