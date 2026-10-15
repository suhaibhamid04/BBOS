import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const executive = {
  id: 'emp-sales-01', employeeId: 'emp-sales-01', firebaseUid: 'demo:emp-sales-01', name: 'Tariq Bhat',
  email: 'tariq.sales@bookingbridge.com', role: 'Sales Executive', department: 'Sales', salesTeamId: 'sales-team-01',
  managerEmployeeId: 'emp-mgr-01', active: true,
};
const founder = {
  id: 'emp-founder-01', employeeId: 'emp-founder-01', firebaseUid: 'demo:emp-founder-01', name: 'Suhaib Hamid',
  email: 'suhaib@bookingbridge.com', role: 'Founder', department: 'Leadership', active: true,
};
const executiveHeaders = { 'X-Demo-User-Id': executive.employeeId };
const founderHeaders = { 'X-Demo-User-Id': founder.employeeId };

async function createLead(request: APIRequestContext, suffix: string) {
  const phone = `98765${suffix.replace(/\D/g, '').slice(-5).padStart(5, '0')}`;
  const response = await request.post('/api/leads', { headers: executiveHeaders, data: {
    creationRequestId: `m6b-${suffix}`, customerName: `M6B Customer ${suffix}`, customerPhone: phone,
    customerEmail: `m6b-${suffix}@example.com`, destination: 'Kashmir', sourceId: 'WHATSAPP', adults: 2, children: 0,
  } });
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()).data as Record<string, any>;
}

async function seedBrowser(page: Page, lead: Record<string, any>, employee = executive) {
  await page.addInitScript(({ lead, employee }) => {
    if (!localStorage.getItem('booking_bridge_active_user')) localStorage.setItem('booking_bridge_active_user', JSON.stringify(employee));
    localStorage.setItem('bb_leads', JSON.stringify([lead]));
    localStorage.setItem('bb_customers', JSON.stringify([{ id: lead.customerId, name: lead.customerName, phone: lead.customerPhone, email: lead.customerEmail, city: 'Delhi', customerType: 'B2C', preferences: [], notes: '', totalBookings: 0, lifetimeValue: 0, createdAt: lead.createdAt, updatedAt: lead.updatedAt }]));
  }, { lead, employee });
}

async function seedPackage(page: Page, lead: Record<string, any>) {
  const now = new Date().toISOString();
  const trip = {
    id: `trip-${lead.id}`, customerId: lead.customerId, leadId: lead.id, title: 'Kashmir M6B Package', destination: 'Kashmir',
    startDate: '2026-12-10', endDate: '2026-12-15', travelerCount: 2, adults: 2, children: 0, tripType: 'LEISURE', currency: 'INR',
    status: 'ITINERARY_READY', costingStatus: 'CALCULATED', costingRevision: 1, costingCalculatedRevision: 1,
    totalSupplierCost: 50000, totalSellingPrice: 72000, grossProfit: 22000, grossMargin: 30.6,
    assignedSalesEmployeeId: executive.employeeId, salesTeamId: executive.salesTeamId, createdAt: now, updatedAt: now, isDemo: true,
  };
  const customerPackageSnapshot = {
    brand: { name: 'Booking Bridge', tagline: 'Travel, thoughtfully arranged', email: 'travel@bookingbridge.com', phone: '+91 99999 00000' },
    packageReference: `quote-${lead.id}`, customerName: lead.customerName, destination: 'Kashmir', travelStartDate: '2026-12-10', travelEndDate: '2026-12-15',
    travelerCount: 2, hotels: [], transports: [], activities: [], itinerary: [], packageSellingPrice: 72000, currency: 'INR', inclusions: ['Hotel'], exclusions: ['Flights'], generatedAt: now,
  };
  const quote = {
    id: `quote-${lead.id}`, optionId: `quote-${lead.id}`, quoteGroupId: `group-${lead.id}`, optionLabel: 'Recommended', customerTitle: 'Kashmir Holiday', optionOrder: 1,
    isRecommended: true, optionStatus: 'READY', optionSnapshotCreatedAt: now, leadId: lead.id, customerId: lead.customerId, customerName: lead.customerName,
    customerPhone: lead.customerPhone, customerEmail: lead.customerEmail, destination: 'Kashmir', tripId: trip.id, travelerCount: 2, adults: 2, children: 0,
    durationDays: 6, durationNights: 5, totalAmount: 72000, discountAmount: 0, finalAmount: 72000, totalSupplierCost: 50000, grossProfit: 22000, grossMargin: 30.6,
    supplierCostSource: { type: 'TRIP', sourceId: trip.id, asOf: now, costingRevision: 1 }, approval: { required: false, state: 'NOT_REQUIRED' }, status: 'DRAFT',
    validUntil: '2026-12-31', salesEmployeeId: executive.employeeId, salesEmployeeName: executive.name, salesTeamId: executive.salesTeamId,
    createdByEmployeeId: executive.employeeId, updatedByEmployeeId: executive.employeeId, createdAt: now, updatedAt: now, customerPackageSnapshot, version: 1, versionHistory: [], isDemo: true,
  };
  await page.addInitScript(({ trip, quote }) => {
    localStorage.setItem('bb_trips', JSON.stringify([trip]));
    localStorage.setItem('bb_itinerary_days', JSON.stringify([{ id: `day-${trip.id}`, tripId: trip.id, dayNumber: 1, date: trip.startDate, title: 'Arrival', items: [], customerContent: { status: 'CURRENT' } }]));
    localStorage.setItem('bb_quotes', JSON.stringify([quote]));
    localStorage.setItem('bb_customer_shares', '[]');
    localStorage.setItem('bb_audit_logs', '[]');
  }, { trip, quote });
}

async function openConversation(page: Page, leadId: string) {
  await page.goto(`/?view=lead-detail&id=${encodeURIComponent(leadId)}`);
  await page.getByRole('button', { name: 'Conversation', exact: true }).click();
  await expect(page.getByTestId('lead-conversation-tab')).toBeVisible();
  await expect(page.getByTestId('whatsapp-composer')).toBeVisible();
}

async function simulate(request: APIRequestContext, data: Record<string, unknown>) {
  const response = await request.post('/api/leads/whatsapp/demo/events', { headers: founderHeaders, data });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}

test('M6B sends, advances status, receives, retries, resolves unmatched and enforces Lead scope', async ({ page, request }) => {
  test.setTimeout(120_000);
  const suffix = String(Date.now());
  const lead = await createLead(request, suffix);
  await seedBrowser(page, lead);
  await openConversation(page, lead.id);
  await expect(page.getByTestId('whatsapp-recipient')).toContainText(lead.customerPhone);
  await expect(page.getByText('Demo provider simulation', { exact: true })).toBeVisible();

  await page.getByTestId('whatsapp-message-body').fill('Your Kashmir package is ready: https://bbos.example/api/public/quote-shares/secure-test-token');
  await page.getByTestId('send-whatsapp').click();
  const outbound = page.getByTestId('conversation-entry').filter({ hasText: 'Your Kashmir package is ready' });
  await expect(outbound).toContainText('Sent');
  const timeline = await request.get(`/api/leads/${lead.id}/conversation`, { headers: executiveHeaders });
  const sentEntry = ((await timeline.json()).data.entries as Record<string, any>[]).find(entry => entry.body?.includes('secure-test-token'))!;
  expect(sentEntry.externalMessageId).toBeTruthy();

  await simulate(request, { kind: 'MESSAGE_STATUS', externalMessageId: sentEntry.externalMessageId, status: 'DELIVERED' });
  await simulate(request, { kind: 'MESSAGE_STATUS', externalMessageId: sentEntry.externalMessageId, status: 'READ' });
  await simulate(request, { kind: 'MESSAGE_STATUS', externalMessageId: sentEntry.externalMessageId, status: 'SENT' });
  await page.reload();
  await page.getByRole('button', { name: 'Conversation', exact: true }).click();
  await expect(page.getByTestId('conversation-entry').filter({ hasText: 'secure-test-token' })).toContainText('Read');

  await simulate(request, {
    kind: 'INBOUND_MESSAGE', externalMessageId: `wamid.demo.reply.${suffix}`, senderPhone: lead.customerPhone,
    senderName: lead.customerName, body: 'Can we change the Gulmarg hotel?',
  });
  await page.reload();
  await page.getByRole('button', { name: 'Conversation', exact: true }).click();
  const inbound = page.getByTestId('conversation-entry').filter({ hasText: 'Can we change the Gulmarg hotel?' });
  await expect(inbound).toContainText('Provider confirmed');
  await expect(inbound).not.toContainText('Manually logged');

  await simulate(request, { kind: 'FAIL_NEXT_SEND' });
  await page.getByTestId('whatsapp-message-body').fill('This attempt will remain visible if it fails.');
  await page.getByTestId('send-whatsapp').click();
  const failed = page.getByTestId('conversation-entry').filter({ hasText: 'This attempt will remain visible' });
  await expect(failed).toContainText('Failed to send');
  await failed.getByTestId('retry-whatsapp').click();
  await expect(page.getByTestId('conversation-entry').filter({ hasText: 'This attempt will remain visible' })).toHaveCount(2);
  await expect(page.getByTestId('conversation-entry').filter({ hasText: 'This attempt will remain visible' }).filter({ hasText: 'Sent' })).toBeVisible();

  const denied = await request.post(`/api/leads/${lead.id}/whatsapp/messages`, {
    headers: { 'X-Demo-User-Id': 'emp-sales-02' },
    data: { idempotencyKey: `denied-${suffix}`, messageType: 'TEXT', body: 'Forged other-owner message.' },
  });
  expect(denied.status()).toBe(403);

  const unknownPhone = `9198${suffix.slice(-8)}`;
  await simulate(request, { kind: 'INBOUND_MESSAGE', externalMessageId: `wamid.demo.unknown.${suffix}`, senderPhone: unknownPhone, body: 'Hi, I need a Kashmir package' });
  await page.evaluate(user => localStorage.setItem('booking_bridge_active_user', JSON.stringify(user)), founder);
  await page.reload();
  await page.getByRole('button', { name: 'Conversation', exact: true }).click();
  const unmatched = page.getByTestId('unmatched-whatsapp').filter({ hasText: 'Hi, I need a Kashmir package' });
  await expect(unmatched).toBeVisible();
  await unmatched.getByTestId('link-unmatched-to-lead').click();
  await expect(page.getByTestId('conversation-entry').filter({ hasText: 'Hi, I need a Kashmir package' })).toContainText('Provider confirmed');
});
test('M6B sends an existing secure customer-share link through the real composer path', async ({ page, request }) => {
  test.setTimeout(90_000);
  const suffix = `${Date.now()}-share`;
  const lead = await createLead(request, suffix);
  await seedBrowser(page, lead);
  await seedPackage(page, lead);
  await page.goto('/');
  await page.locator('#nav-item-quotes').click();
  await page.getByTestId(`open-quote-quote-${lead.id}`).click();
  await page.getByTestId('create-customer-share').click();
  const secureUrl = await page.getByLabel('Customer share URL').inputValue();
  expect(secureUrl).toContain('/quote/share/');
  await page.getByTestId('prepare-whatsapp').click();
  await page.getByTestId('send-whatsapp-through-bbos').click();
  await expect(page.getByText('Package link accepted by WhatsApp', { exact: false })).toBeVisible();
  await openConversation(page, lead.id);
  const message = page.getByTestId('conversation-entry').filter({ hasText: secureUrl });
  await expect(message).toContainText('Sent');
  await expect(message).toContainText('Demo simulation');
});
