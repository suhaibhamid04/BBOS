import { expect, test, type Page } from '@playwright/test';

const BOOKING_ID = 'booking-qa1-01';
const BOOKING_REFERENCE = 'BBOS-QA1-001';
const ACCOMMODATION_ID = 'booking-accommodation-qa1';

const personas = {
  admin: {
    id: 'emp-admin-01', employeeId: 'emp-admin-01', firebaseUid: 'demo:emp-admin-01',
    name: 'Nasir Wani', email: 'nasir.admin@bookingbridge.com', role: 'Admin',
    department: 'Operations & IT', active: true, createdAt: '2025-01-05T00:00:00Z',
  },
  sales: {
    id: 'emp-sales-01', employeeId: 'emp-sales-01', firebaseUid: 'demo:emp-sales-01',
    name: 'Tariq Bhat', email: 'tariq.sales@bookingbridge.com', role: 'Sales Executive',
    department: 'Sales & Inbound', salesTeamId: 'sales-team-01', managerEmployeeId: 'emp-mgr-01',
    active: true, createdAt: '2025-02-01T00:00:00Z',
  },
  accounts: {
    id: 'emp-acc-01', employeeId: 'emp-acc-01', firebaseUid: 'demo:emp-acc-01',
    name: 'Farooq Lone', email: 'farooq.accounts@bookingbridge.com', role: 'Accounts',
    department: 'Finance & Compliance', active: true, createdAt: '2025-03-01T00:00:00Z',
  },
  reservations: {
    id: 'emp-res-01', employeeId: 'emp-res-01', firebaseUid: 'demo:emp-res-01',
    name: 'Zoya Qadri', email: 'zoya.reservations@bookingbridge.com', role: 'Reservations',
    department: 'Reservations & Supplier Relations', active: true, createdAt: '2025-02-18T00:00:00Z',
  },
  otherReservations: {
    id: 'emp-res-02', employeeId: 'emp-res-02', firebaseUid: 'demo:emp-res-02',
    name: 'Meher Khan', email: 'meher.reservations@bookingbridge.com', role: 'Reservations',
    department: 'Reservations & Supplier Relations', active: true, createdAt: '2025-03-05T00:00:00Z',
  },
  operations: {
    id: 'emp-ops-01', employeeId: 'emp-ops-01', firebaseUid: 'demo:emp-ops-01',
    name: 'Bilal Ahmad Shah', email: 'bilal.ops@bookingbridge.com', role: 'Operations',
    department: 'Ground Fleet & Stays Logistics', active: true, createdAt: '2025-02-25T00:00:00Z',
  },
} as const;

type Persona = (typeof personas)[keyof typeof personas];

function authHeaders(employeeId: string) {
  return { 'Content-Type': 'application/json', 'X-Demo-User-Id': employeeId };
}

async function switchPersona(page: Page, persona: Persona) {
  await page.evaluate((nextPersona) => {
    localStorage.setItem('booking_bridge_active_user', JSON.stringify(nextPersona));
  }, persona);
  await page.reload();
  await expect(page.locator('#app-sidebar')).toContainText(persona.role);
}

test('Booking crosses payment, Reservations, Operations, and supplier-payable workflows with authoritative roles', async ({ page, request }) => {
  await page.addInitScript((sales) => {
    if (!localStorage.getItem('booking_bridge_active_user')) {
      localStorage.setItem('booking_bridge_active_user', JSON.stringify(sales));
    }
  }, personas.sales);
  await page.goto('/');

  // The deterministic fixture is a production-shaped output of Quote conversion.
  // UX4 independently exercises Inventory -> Lead -> Trip -> Costing -> Quote -> Booking.
  const initialResponse = await request.get(`/api/bookings/${BOOKING_ID}`, {
    headers: authHeaders(personas.sales.employeeId),
  });
  expect(initialResponse.ok()).toBeTruthy();
  const initial = (await initialResponse.json()).data;
  expect(initial.booking).toMatchObject({
    id: BOOKING_ID,
    bookingReference: BOOKING_REFERENCE,
    leadId: 'lead-qa1-01',
    tripId: 'trip-qa1-01',
    quoteId: 'quote-qa1-01',
    assignedSalesEmployeeId: personas.sales.employeeId,
    salesTeamId: 'sales-team-01',
    status: 'PENDING_PAYMENT',
  });
  expect(initial.booking).not.toHaveProperty('assignedReservationsEmployeeId');
  for (const protectedField of ['totalSupplierCost', 'grossProfit', 'grossMargin', 'supplierCost']) {
    expect(initial.booking).not.toHaveProperty(protectedField);
  }
  expect(initial.accommodations).toHaveLength(1);
  expect(initial.transports).toHaveLength(1);
  expect(initial.activities).toHaveLength(1);

  // Sales records a real customer-payment claim. It is not authoritative until verified.
  const recordPayment = await request.post(`/api/bookings/${BOOKING_ID}/payments`, {
    headers: authHeaders(personas.sales.employeeId),
    data: {
      amount: 9_000,
      currency: 'INR',
      paymentDate: new Date().toISOString().slice(0, 10),
      paymentMethod: 'UPI',
      referenceNumber: 'QA1-CUSTOMER-ADVANCE',
      paymentType: 'ADVANCE',
      idempotencyKey: 'qa1-customer-advance-v1',
    },
  });
  expect(recordPayment.status()).toBe(201);
  const recordedPayment = (await recordPayment.json()).data;
  expect(recordedPayment.status).toBe('RECORDED');

  const beforeVerification = await request.get(`/api/bookings/${BOOKING_ID}`, {
    headers: authHeaders(personas.sales.employeeId),
  });
  expect((await beforeVerification.json()).data.booking).toMatchObject({
    status: 'PENDING_PAYMENT', amountReceived: 0, paymentStatus: 'UNPAID',
  });

  const salesVerification = await request.post(
    `/api/bookings/${BOOKING_ID}/payments/${recordedPayment.id}/verify`,
    { headers: authHeaders(personas.sales.employeeId), data: {} },
  );
  expect(salesVerification.status()).toBe(403);

  const verifyPayment = await request.post(
    `/api/bookings/${BOOKING_ID}/payments/${recordedPayment.id}/verify`,
    { headers: authHeaders(personas.accounts.employeeId), data: {} },
  );
  expect(verifyPayment.ok()).toBeTruthy();
  const verified = await verifyPayment.json();
  expect(verified.payment.status).toBe('VERIFIED');
  expect(verified.booking).toMatchObject({
    status: 'CONFIRMED', paymentStatus: 'PARTIALLY_PAID', amountReceived: 9_000, amountPending: 21_000,
  });

  // An unassigned Booking is invisible to every Reservations employee.
  const unassignedReservationsDetail = await request.get(`/api/bookings/${BOOKING_ID}`, {
    headers: authHeaders(personas.reservations.employeeId),
  });
  expect(unassignedReservationsDetail.status()).toBe(403);

  // Admin performs the real production-shaped Reservations handoff through the Booking UI.
  await switchPersona(page, personas.admin);
  await page.locator('#nav-item-bookings').click();
  await expect(page.getByTestId('reservations-assignment-attention')).toBeVisible();
  await page.getByTestId(`booking-view-${BOOKING_ID}`).click();
  await page.getByTestId('reservations-assignee-select').selectOption(personas.reservations.employeeId);
  await page.getByTestId('assign-reservations-button').click();
  await expect(page.getByTestId('reservations-assignment-panel')).toContainText(personas.reservations.employeeId);

  const assignedBooking = await request.get(`/api/bookings/${BOOKING_ID}`, {
    headers: authHeaders(personas.admin.employeeId),
  });
  expect((await assignedBooking.json()).data.booking.assignedReservationsEmployeeId)
    .toBe(personas.reservations.employeeId);
  const otherReservationsDetail = await request.get(`/api/bookings/${BOOKING_ID}`, {
    headers: authHeaders(personas.otherReservations.employeeId),
  });
  expect(otherReservationsDetail.status()).toBe(403);

  // The assigned employee now has a reachable Booking workspace and a payment-redacted DTO.
  await switchPersona(page, personas.reservations);
  await expect(page.locator('#nav-item-bookings')).toBeVisible();
  await page.locator('#nav-item-bookings').click();
  await expect(page.getByTestId(`booking-row-${BOOKING_ID}`)).toBeVisible();
  await page.getByTestId(`booking-view-${BOOKING_ID}`).click();
  await expect(page.getByTestId('booking-detail')).toContainText(BOOKING_REFERENCE);
  await expect(page.getByTestId('booking-detail')).not.toContainText('Payment Summary');
  await expect(page.getByTestId(`booking-accommodation-${ACCOMMODATION_ID}`)).toContainText('QA Lake Hotel');
  await page.getByTestId(`booking-accommodation-${ACCOMMODATION_ID}`).locator('button').click();
  await page.getByTestId(`accommodation-confirmation-reference-${ACCOMMODATION_ID}`).fill('QA1-HOTEL-CNF-001');
  await page.locator(`#confirm-acc-${ACCOMMODATION_ID}`).click();
  await expect(page.getByTestId(`booking-accommodation-${ACCOMMODATION_ID}`)).toContainText('CONFIRMED');

  const reservationsDetail = await request.get(`/api/bookings/${BOOKING_ID}`, {
    headers: authHeaders(personas.reservations.employeeId),
  });
  const reservationsDto = (await reservationsDetail.json()).data;
  expect(reservationsDto.paymentSummary).toBeNull();
  expect(reservationsDto.booking).not.toHaveProperty('amountReceived');
  expect(reservationsDto.accommodations[0]).toMatchObject({
    confirmationStatus: 'CONFIRMED', supplierConfirmationCode: 'QA1-HOTEL-CNF-001',
  });

  const reservationsPayableMutation = await request.post(
    '/api/supplier-payables/bookings/forbidden/forbidden/payments',
    { headers: authHeaders(personas.reservations.employeeId), data: {} },
  );
  expect(reservationsPayableMutation.status()).toBe(403);

  // Operations sees nothing until an Admin assigns the canonical employeeId.
  const unassignedOperationsList = await request.get('/api/bookings', {
    headers: authHeaders(personas.operations.employeeId),
  });
  expect((await unassignedOperationsList.json()).data).toEqual([]);
  const unassignedOperationsDetail = await request.get(`/api/bookings/${BOOKING_ID}`, {
    headers: authHeaders(personas.operations.employeeId),
  });
  expect(unassignedOperationsDetail.status()).toBe(403);

  await switchPersona(page, personas.admin);
  await expect(page.locator('#nav-item-operations-dashboard')).toBeVisible();
  const assignOperations = await request.patch(`/api/operations/bookings/${BOOKING_ID}/assignment`, {
    headers: authHeaders(personas.admin.employeeId),
    data: { operationsEmployeeId: personas.operations.employeeId, reason: 'QA1 lifecycle assignment' },
  });
  expect(assignOperations.ok()).toBeTruthy();

  const dispatch = await request.post(`/api/bookings/${BOOKING_ID}/dispatch`, {
    headers: authHeaders(personas.admin.employeeId), data: {},
  });
  expect(dispatch.ok()).toBeTruthy();
  expect((await dispatch.json()).booking.status).toBe('IN_OPERATIONS');

  await switchPersona(page, personas.operations);
  await expect(page.locator('#nav-item-operations-dashboard')).toBeVisible();
  await page.locator('#nav-item-operations-dashboard').click();
  await expect(page.locator('#operations-dashboard')).toContainText(BOOKING_REFERENCE);
  await expect(page.locator('#operations-dashboard')).toContainText('QA Lake Hotel');
  await expect(page.locator('#operations-dashboard')).toContainText('Srinagar Airport to QA Lake Hotel');
  await expect(page.locator('#operations-dashboard')).toContainText('Private Shikara Ride');
  await expect(page.locator('#operations-dashboard')).not.toContainText('Gross Profit');
  await expect(page.locator('#operations-dashboard')).not.toContainText('Supplier Cost');
  await expect(page.locator('#operations-dashboard')).not.toContainText('Amount Received');

  const operationsDetail = await request.get(`/api/bookings/${BOOKING_ID}`, {
    headers: authHeaders(personas.operations.employeeId),
  });
  const operationsDto = (await operationsDetail.json()).data;
  expect(operationsDto.paymentSummary).toBeNull();
  expect(operationsDto.financialSnapshot).toBeUndefined();
  expect(operationsDto.booking).not.toHaveProperty('amountReceived');

  const salesPayableMutation = await request.post(
    '/api/supplier-payables/bookings/forbidden/forbidden/payments',
    { headers: authHeaders(personas.sales.employeeId), data: {} },
  );
  expect(salesPayableMutation.status()).toBe(403);
  const accountsCommercialMutation = await request.patch('/api/quotes/quote-qa1-01', {
    headers: authHeaders(personas.accounts.employeeId), data: { status: 'SENT' },
  });
  expect(accountsCommercialMutation.status()).toBe(403);

  // Admin records a supplier advance; Accounts independently verifies it.
  await switchPersona(page, personas.admin);
  await page.locator('#nav-item-supplier-payables').click();
  const hotelPayableRow = page.locator('tr').filter({ hasText: 'QA Lake Hotel Supplier' });
  await expect(hotelPayableRow).toContainText(BOOKING_REFERENCE);
  await expect(hotelPayableRow).toContainText('UNPAID');
  await hotelPayableRow.locator('button').click();
  await page.getByLabel('Amount').fill('5000');
  await page.getByLabel('Transaction reference').fill('QA1-SUPPLIER-ADVANCE');
  await page.getByRole('button', { name: 'Record payment' }).click();
  await expect(page.getByText('Supplier payment recorded and awaiting verification.')).toBeVisible();
  await expect(page.getByText('QA1-SUPPLIER-ADVANCE')).toBeVisible();

  const payableList = await request.get('/api/supplier-payables', {
    headers: authHeaders(personas.accounts.employeeId),
  });
  const obligations = (await payableList.json()).obligations as Array<any>;
  const hotelObligation = obligations.find(item => item.bookingId === BOOKING_ID && item.serviceType === 'ACCOMMODATION');
  expect(hotelObligation).toMatchObject({
    supplierName: 'QA Lake Hotel Supplier', frozenLiabilityMinor: 1_200_000,
    outstandingMinor: 1_200_000, settlementStatus: 'UNPAID',
  });

  const payableDetail = await request.get(
    `/api/supplier-payables/bookings/${BOOKING_ID}/${hotelObligation.obligationId}`,
    { headers: authHeaders(personas.accounts.employeeId) },
  );
  const recordedSupplierPayment = (await payableDetail.json()).data.payments[0];
  expect(recordedSupplierPayment.status).toBe('RECORDED');

  await switchPersona(page, personas.accounts);
  await expect(page.locator('#nav-item-supplier-payables')).toBeVisible();
  await page.locator('#nav-item-supplier-payables').click();
  const accountsPayableRow = page.locator('tr').filter({ hasText: 'QA Lake Hotel Supplier' });
  await accountsPayableRow.locator('button').click();
  await page.getByTitle('Verify').click();
  await expect(page.getByText('Supplier payment verify action completed.')).toBeVisible();

  const verifiedPayable = await request.get(
    `/api/supplier-payables/bookings/${BOOKING_ID}/${hotelObligation.obligationId}`,
    { headers: authHeaders(personas.accounts.employeeId) },
  );
  const finalPayable = (await verifiedPayable.json()).data;
  expect(finalPayable).toMatchObject({
    frozenLiabilityMinor: 1_200_000,
    verifiedPaidMinor: 500_000,
    outstandingMinor: 700_000,
    settlementStatus: 'PARTIALLY_PAID',
  });
  expect(finalPayable.payments[0].status).toBe('VERIFIED');
});
