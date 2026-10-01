import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { initializeApp, deleteApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';

const projectId = 'bbos-qa3-local';
const password = 'Qa3-Password-123!';
const identities = {
  admin: { uid: 'firebase-qa3-admin', employeeId: 'employee-qa3-admin', email: 'admin@qa3.test', role: 'Admin', name: 'QA3 Admin' },
  sales: { uid: 'firebase-qa3-sales-a', employeeId: 'employee-qa3-sales-a', email: 'sales-a@qa3.test', role: 'Sales Executive', name: 'QA3 Sales A', salesTeamId: 'qa3-team-a' },
  otherSales: { uid: 'firebase-qa3-sales-b', employeeId: 'employee-qa3-sales-b', email: 'sales-b@qa3.test', role: 'Sales Executive', name: 'QA3 Sales B', salesTeamId: 'qa3-team-b' },
  manager: { uid: 'firebase-qa3-manager-a', employeeId: 'employee-qa3-manager-a', email: 'manager-a@qa3.test', role: 'Sales Manager', name: 'QA3 Manager A', salesTeamId: 'qa3-team-a' },
  otherManager: { uid: 'firebase-qa3-manager-b', employeeId: 'employee-qa3-manager-b', email: 'manager-b@qa3.test', role: 'Sales Manager', name: 'QA3 Manager B', salesTeamId: 'qa3-team-b' },
} as const;

let adminApp: App;
let db: Firestore;
let rulesEnvironment: RulesTestEnvironment;
let tokens: Record<keyof typeof identities, string>;
let inventory: Record<string, string>;

async function signIn(email: string) {
  const response = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=qa3-local', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const payload = await response.json() as { idToken?: string; error?: unknown };
  if (!response.ok || !payload.idToken) throw new Error(`QA3 sign-in failed: ${JSON.stringify(payload.error)}`);
  return payload.idToken;
}

async function apiPost(request: APIRequestContext, path: string, token: string, data: unknown) {
  const response = await request.post(path, { headers: { Authorization: `Bearer ${token}` }, data });
  const payload = await response.json();
  expect(response.ok(), `${path}: ${JSON.stringify(payload)}`).toBe(true);
  return payload.data;
}

async function seedAuthoritativeInventory(request: APIRequestContext, token: string) {
  const hotelSupplier = await apiPost(request, '/api/accommodation/suppliers', token, { name: 'QA3 Hotel Supplier', city: 'Srinagar', active: true });
  const property = await apiPost(request, '/api/accommodation/properties', token, { name: 'QA3 Lake Hotel', propertyType: 'HOTEL', location: 'Dal Lake', city: 'Srinagar', supplierId: hotelSupplier.id, status: 'ACTIVE' });
  const room = await apiPost(request, '/api/accommodation/rooms', token, { propertyId: property.id, name: 'QA3 Deluxe Room', maxAdults: 2, maxChildren: 1, active: true });
  const hotelRate = await apiPost(request, '/api/accommodation/rates', token, { propertyId: property.id, roomCategoryId: room.id, mealPlan: 'MAP', validFrom: '2026-10-01', validTo: '2026-10-31', baseRate: 8750, status: 'ACTIVE' });

  const transportSupplier = await apiPost(request, '/api/transport/suppliers', token, { name: 'QA3 Transport Supplier', city: 'Srinagar', active: true });
  const vehicle = await apiPost(request, '/api/transport/vehicle-categories', token, { name: 'QA3 SUV', displayName: 'QA3 SUV', category: 'SUV', seatingCapacity: 6, passengerCapacity: 5, active: true });
  await apiPost(request, '/api/transport/vehicle-categories', token, { name: 'QA3 Sedan', displayName: 'QA3 Sedan', category: 'SEDAN', seatingCapacity: 5, passengerCapacity: 4, active: true });
  const transportRate = await apiPost(request, '/api/transport/rates', token, { vehicleCategoryId: vehicle.id, supplierId: transportSupplier.id, serviceType: 'MULTI_DAY_JOURNEY', pricingUnit: 'PER_DAY', baseRate: 6600, validFrom: '2026-10-01', validTo: '2026-10-31', status: 'ACTIVE' });

  const activitySupplier = await apiPost(request, '/api/activities/providers', token, { name: 'QA3 Activity Supplier', city: 'Gulmarg', active: true });
  const activity = await apiPost(request, '/api/activities/masters', token, { name: 'QA3 Gondola', category: 'GONDOLA_CABLE_CAR', destinationId: 'gulmarg', supplierId: activitySupplier.id, description: 'QA3 valid activity', active: true });
  const activityRate = await apiPost(request, '/api/activities/rates', token, { activityId: activity.id, supplierId: activitySupplier.id, pricingModel: 'PER_PERSON', pricingComponents: { adult: 2400, child: 1600 }, validFrom: '2026-10-01', validTo: '2026-10-31', status: 'ACTIVE' });
  const noRateActivity = await apiPost(request, '/api/activities/masters', token, { name: 'QA3 No Rate Activity', category: 'LOCAL_EXPERIENCE', destinationId: 'srinagar', supplierId: activitySupplier.id, description: 'Intentional missing-rate case', active: true });

  return { propertyId: property.id, roomId: room.id, hotelRateId: hotelRate.id, vehicleId: vehicle.id, transportRateId: transportRate.id, activityId: activity.id, activityRateId: activityRate.id, noRateActivityId: noRateActivity.id };
}

async function loginInBrowser(page: Page, email: string) {
  await page.goto('/');
  await page.getByPlaceholder('Employee email').fill(email);
  await page.getByPlaceholder('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('#nav-item-leads')).toBeVisible();
}

test.beforeAll(async ({ request }) => {
  await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' });
  await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${projectId}/accounts`, { method: 'DELETE' });
  adminApp = initializeApp({ projectId }, `qa3-${Date.now()}`);
  db = getFirestore(adminApp);
  const auth = getAuth(adminApp);
  for (const identity of Object.values(identities)) {
    await auth.createUser({ uid: identity.uid, email: identity.email, password, displayName: identity.name });
    await db.collection('employees').doc(identity.employeeId).set({
      employeeId: identity.employeeId,
      firebaseUid: identity.uid,
      email: identity.email,
      name: identity.name,
      role: identity.role,
      active: true,
      ...('salesTeamId' in identity ? { salesTeamId: identity.salesTeamId } : {}),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }
  tokens = Object.fromEntries(await Promise.all(Object.entries(identities).map(async ([key, identity]) => [key, await signIn(identity.email)]))) as Record<keyof typeof identities, string>;
  inventory = await seedAuthoritativeInventory(request, tokens.admin);
  rulesEnvironment = await initializeTestEnvironment({
    projectId,
    firestore: { host: '127.0.0.1', port: 8080, rules: readFileSync('firestore.rules', 'utf8') },
  });
});

test.afterAll(async () => {
  await rulesEnvironment?.cleanup();
  if (adminApp) await deleteApp(adminApp);
});

test('normal Firebase identity persists the complete Sales workflow and enforces scopes/rules', async ({ page, request }) => {
  await loginInBrowser(page, identities.sales.email);
  await page.locator('#nav-item-leads').click();
  await page.locator('#create-lead-trigger').click();
  await page.locator('#lead-customer-name').fill('QA3 Firebase Customer');
  await page.locator('#lead-customer-phone').fill('+919876500003');
  await page.locator('#submit-create-lead-btn').click();
  await expect(page.getByText('QA3 Firebase Customer', { exact: true })).toBeVisible();

  const leadSnapshot = await db.collection('leads').where('customerName', '==', 'QA3 Firebase Customer').limit(2).get();
  expect(leadSnapshot.size).toBe(1);
  const lead = { id: leadSnapshot.docs[0].id, ...leadSnapshot.docs[0].data() } as Record<string, any>;
  expect(lead).toMatchObject({ assignedEmployeeId: identities.sales.employeeId, salesTeamId: identities.sales.salesTeamId });
  expect(lead.assignedEmployeeId).not.toBe(identities.sales.uid);
  expect((await db.collection('customers').doc(lead.customerId).get()).exists).toBe(true);
  const leadAudits = await db.collection('audit_logs').where('entityId', '==', lead.id).get();
  expect(leadAudits.docs.filter((item) => item.data().action === 'LEAD_CREATED')).toHaveLength(1);

  await page.reload();
  await page.locator('#nav-item-leads').click();
  await expect(page.getByText('QA3 Firebase Customer', { exact: true })).toBeVisible();

  for (const [key, expected] of [['sales', true], ['otherSales', false], ['manager', true], ['otherManager', false], ['admin', true]] as const) {
    const response = await request.get('/api/leads', { headers: { Authorization: `Bearer ${tokens[key]}` } });
    expect(response.ok()).toBe(true);
    const payload = await response.json();
    expect(payload.data.some((item: any) => item.id === lead.id)).toBe(expected);
  }

  await page.locator(`#open-lead-btn-${lead.id}`).click();
  await page.locator('#tab-lead-quotes').click();
  await page.getByTestId('lead-build-package').click();
  await expect(page.locator('#trip-builder-active')).toBeVisible();

  await page.getByTestId('add-trip-hotel').click();
  await expect(page.getByTestId('trip-hotel-property')).toContainText('QA3 Lake Hotel');
  await page.getByTestId('trip-hotel-property').selectOption(inventory.propertyId);
  await page.getByTestId('trip-hotel-room').selectOption(inventory.roomId);
  await page.getByTestId('trip-hotel-meal-plan').selectOption('MAP');
  await expect(page.getByTestId('confirm-trip-hotel')).toBeEnabled();
  await page.getByTestId('confirm-trip-hotel').click();
  await expect(page.getByTestId('hotel-inventory-picker')).toBeHidden();

  await page.getByTestId('add-trip-transport').click();
  await expect(page.getByTestId('trip-transport-vehicle')).toContainText('QA3 SUV');
  await expect(page.getByTestId('trip-transport-vehicle').locator('option')).toHaveCount(2);
  await page.getByTestId('trip-transport-vehicle').selectOption(inventory.vehicleId);
  await expect(page.getByTestId('confirm-trip-transport')).toBeEnabled();
  await page.getByTestId('confirm-trip-transport').click();
  await expect(page.getByTestId('transport-inventory-picker')).toBeHidden();

  await page.getByTestId('add-trip-activity').click();
  await page.getByTestId('trip-activity-master').selectOption(inventory.noRateActivityId);
  await expect(page.getByText('Rate Unavailable')).toBeVisible();
  await expect(page.getByText(/No active rate found/)).toBeVisible();
  await page.getByTestId('trip-activity-master').selectOption(inventory.activityId);
  await expect(page.getByTestId('confirm-trip-activity')).toBeEnabled();
  await page.getByTestId('confirm-trip-activity').click();
  await expect(page.getByTestId('activity-inventory-picker')).toBeHidden();

  const tripSnapshot = await db.collection('trips').where('leadId', '==', lead.id).limit(2).get();
  expect(tripSnapshot.size).toBe(1);
  const tripId = tripSnapshot.docs[0].id;
  expect(tripSnapshot.docs[0].data()).toMatchObject({ assignedSalesEmployeeId: identities.sales.employeeId, salesTeamId: identities.sales.salesTeamId, customerId: lead.customerId });
  const daysBeforeReload = await db.collection('itinerary_days').where('tripId', '==', tripId).get();
  expect(JSON.stringify(daysBeforeReload.docs.map((item) => item.data()))).toContain(inventory.hotelRateId);
  expect(JSON.stringify(daysBeforeReload.docs.map((item) => item.data()))).toContain(inventory.transportRateId);
  expect(JSON.stringify(daysBeforeReload.docs.map((item) => item.data()))).toContain(inventory.activityRateId);

  await page.reload();
  await page.locator('#nav-item-trips').click();
  await page.getByRole('button', { name: /Open Builder/ }).first().click();
  await expect(page.getByText(/QA3 Lake Hotel/)).toBeVisible();
  await expect(page.getByText(/QA3 SUV/)).toBeVisible();
  await expect(page.getByText(/QA3 Gondola/)).toBeVisible();
  await page.getByTestId('calculate-trip-costs').click();
  await expect(page.getByTestId('trip-costing-status')).toHaveText('CALCULATED');
  const costedTrip = (await db.collection('trips').doc(tripId).get()).data()!;
  expect(costedTrip.costingStatus).toBe('CALCULATED');
  expect(costedTrip.totalSupplierCost).toBeGreaterThan(0);

  await page.getByTestId('create-quote-from-trip').click();
  await expect(page.locator('#quote-builder-editor')).toBeVisible();
  await expect(page.getByTestId('quote-hotel-service')).toContainText('QA3 Lake Hotel');
  await expect(page.getByTestId('quote-transport-service')).toContainText('QA3 SUV');
  await expect(page.getByTestId('quote-activity-service')).toContainText('QA3 Gondola');
  const quoteSnapshot = await db.collection('quotes').where('tripId', '==', tripId).limit(2).get();
  expect(quoteSnapshot.size).toBe(1);
  expect(quoteSnapshot.docs[0].data().totalSupplierCost).toBe(costedTrip.totalSupplierCost);

  const attacker = rulesEnvironment.authenticatedContext(identities.sales.uid).firestore();
  await expect(setDoc(doc(attacker, 'leads', 'forged-lead'), { assignedEmployeeId: identities.sales.employeeId })).rejects.toThrow();
  await expect(setDoc(doc(attacker, 'leads', lead.id), {
    assignedEmployeeId: identities.otherSales.employeeId,
    salesTeamId: identities.otherSales.salesTeamId,
  }, { merge: true })).rejects.toThrow();
  await expect(setDoc(doc(attacker, 'accommodation_properties', 'forged-property'), { status: 'ACTIVE' })).rejects.toThrow();
  await expect(setDoc(doc(attacker, 'trips', tripId), { status: 'CONFIRMED', totalSupplierCost: 1 }, { merge: true })).rejects.toThrow();
});
