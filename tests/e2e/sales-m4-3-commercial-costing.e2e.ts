import { expect, test, type Page } from '@playwright/test';

const employee = {
  id: 'emp-sales-01', employeeId: 'emp-sales-01', firebaseUid: 'demo:emp-sales-01',
  name: 'Tariq Bhat', email: 'tariq.sales@bookingbridge.com', role: 'Sales Executive',
  department: 'Sales', salesTeamId: 'sales-team-01', active: true,
};

const manager = {
  id: 'emp-manager-01', employeeId: 'emp-manager-01', firebaseUid: 'demo:emp-manager-01',
  name: 'Kashmir Sales Manager', email: 'manager@bookingbridge.com', role: 'Sales Manager',
  department: 'Sales', salesTeamId: 'sales-team-01', active: true,
};

const trip = {
  id: 'trip-m4-3', customerId: 'customer-m4-3', leadId: 'lead-m4-3', title: 'Kashmir Complete Package',
  destination: 'Kashmir', startDate: '2026-10-12', endDate: '2026-10-17', travelerCount: 3,
  adults: 2, children: 1, childAges: [8], tripType: 'Family', status: 'DRAFT', currency: 'INR',
  totalSupplierCost: 61_000, totalSellingPrice: 72_000, grossProfit: 11_000, grossMargin: 15.3,
  pricingMode: 'SELLING_PRICE', pricingInput: 72_000, costingStatus: 'CALCULATED',
  costingRevision: 4, costingCalculatedRevision: 4, assignedSalesEmployeeId: employee.employeeId,
  salesTeamId: employee.salesTeamId, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', isDemo: true,
  supplierCostBreakdown: {
    accommodation: { total: 42_000, items: [{ label: 'Srinagar hotel', amount: 18_000 }, { label: 'Pahalgam hotel', amount: 16_000 }, { label: 'Gulmarg hotel', amount: 8_000 }] },
    transport: { total: 12_000, items: [{ label: 'Sedan × 6 days', amount: 12_000 }] },
    activities: { total: 4_500, items: [{ label: 'Shikara Ride', amount: 1_200 }, { label: 'Rafting', amount: 3_300 }] },
    other: { total: 2_500, items: [{ label: 'Local guide', amount: 2_500 }] }, total: 61_000,
  },
};

async function openPackage(page: Page, tripOverride: Record<string, unknown> = {}) {
  await page.addInitScript(({ employee, trip, tripOverride }) => {
    if (sessionStorage.getItem('m4-3-seeded')) {
      localStorage.setItem('booking_bridge_active_user', JSON.stringify(employee));
      return;
    }
    sessionStorage.setItem('m4-3-seeded', 'true');
    localStorage.clear();
    localStorage.setItem('booking_bridge_active_user', JSON.stringify(employee));
    localStorage.setItem('bb_customers', JSON.stringify([{ id: 'customer-m4-3', name: 'M4.3 Guest', phone: '+919876543210', email: 'm43@example.com', city: 'Delhi', customerType: 'B2C', preferences: [], notes: '', totalBookings: 0, lifetimeValue: 0, createdAt: trip.createdAt, updatedAt: trip.updatedAt, isDemo: true }]));
    localStorage.setItem('bb_trips', JSON.stringify([{ ...trip, ...tripOverride }]));
    localStorage.setItem('bb_itinerary_days', JSON.stringify([{ id: 'day-m4-3', tripId: trip.id, dayNumber: 1, date: trip.startDate, title: 'Arrival', description: '', location: 'Srinagar', items: [] }]));
  }, { employee, trip, tripOverride });
  await page.goto('/');
  await page.locator('#nav-item-trips').click();
  await page.getByRole('button', { name: /Open Builder/ }).first().click();
  await expect(page.locator('#trip-builder-active')).toBeVisible();
}

test('Scenario A-D: complete category summary and all three authoritative pricing modes persist', async ({ page }) => {
  await openPackage(page);
  await expect(page.getByTestId('package-cost-total')).toContainText('61,000');
  await expect(page.getByText('Sedan × 6 days')).toBeVisible();
  await expect(page.getByText('Local guide')).toBeVisible();
  await expect(page.getByTestId('commercial-profit')).toContainText('11,000');
  await expect(page.getByTestId('commercial-margin')).toHaveText('15.3%');

  await page.getByTestId('pricing-input').fill('72000');
  await page.getByTestId('save-package-pricing').click();
  await expect(page.getByTestId('commercial-selling-price')).toContainText('72,000');

  await page.getByTestId('pricing-mode').selectOption('TARGET_PROFIT');
  await page.getByTestId('pricing-input').fill('8000');
  await page.getByTestId('save-package-pricing').click();
  await expect(page.getByTestId('commercial-selling-price')).toContainText('69,000');
  await expect(page.getByTestId('commercial-profit')).toContainText('8,000');

  await page.getByTestId('pricing-mode').selectOption('TARGET_MARGIN');
  await page.getByTestId('pricing-input').fill('15');
  await page.getByTestId('save-package-pricing').click();
  await expect(page.getByTestId('commercial-selling-price')).toContainText('71,765');
  await page.reload();
  await page.locator('#nav-item-trips').click();
  await page.getByRole('button', { name: /Open Builder/ }).first().click();
  await expect(page.getByTestId('pricing-mode')).toHaveValue('TARGET_MARGIN');
  await expect(page.getByTestId('commercial-selling-price')).toContainText('71,765');
});

test('Scenario E: stale supplier inputs preserve selling intent and hide profit/margin authority', async ({ page }) => {
  await openPackage(page, { costingStatus: 'PENDING', costingRevision: 5, costingCalculatedRevision: 4 });
  await expect(page.getByTestId('trip-supplier-cost')).toContainText('Needs update');
  await expect(page.getByTestId('commercial-selling-price')).toContainText('72,000');
  await expect(page.getByTestId('commercial-profit')).toHaveText('—');
  await expect(page.getByTestId('commercial-margin')).toHaveText('—');
  await expect(page.getByTestId('create-quote-from-trip')).toBeDisabled();
});

test('Scenario F: configured low-margin review is visible and blocks Quote safety', async ({ page }) => {
  await openPackage(page, { commercialApproval: { required: true, state: 'REVIEW_REQUIRED', thresholdPercent: 20, assessedAt: '2026-10-09T00:00:00Z' } });
  await expect(page.getByTestId('low-margin-review-required')).toBeVisible();
});

test('Scenario G: Sales Manager reviews exact economics and can approve or reject', async ({ page }) => {
  let state: 'REVIEW_REQUIRED' | 'APPROVED' | 'REJECTED' = 'REVIEW_REQUIRED';
  const decisions: Array<Record<string, unknown>> = [];
  const item = () => ({
    id: 'QUOTE_APPROVAL:quote-m4-3', type: 'QUOTE_APPROVAL', sourceEntityType: 'QUOTE',
    sourceEntityId: 'quote-m4-3', quoteId: 'quote-m4-3', quoteReference: 'Quote quote-m4-3',
    title: 'Quote approval · M4.3 Guest', summary: 'Kashmir · 3 travellers',
    requestedByEmployeeId: employee.employeeId, requestedAt: '2026-10-09T00:00:00Z',
    currency: 'INR', priority: 'MEDIUM', status: state,
    requiredApproverRoles: ['Founder', 'Admin', 'Sales Manager'], sourceVersion: '1:2026-10-09T00:00:00Z',
    actionable: state === 'REVIEW_REQUIRED', route: { section: 'quotes', entityId: 'quote-m4-3' },
    context: {
      tripId: trip.id, customerName: 'M4.3 Guest', salespersonName: employee.name,
      supplierCost: 61_000, sellingPrice: 64_000, profit: 3_000, marginPercent: 4.7,
      thresholdPercent: 15, salesNote: 'Strategic customer request',
      ...(state !== 'REVIEW_REQUIRED' ? { decidedByName: manager.name } : {}),
    },
  });
  await page.route('**/api/approvals**', async route => {
    const request = route.request();
    if (request.method() === 'PATCH') {
      const body = request.postDataJSON();
      decisions.push(body);
      state = body.decision;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { approval: { state } } }) });
      return;
    }
    const current = item();
    const pending = state === 'REVIEW_REQUIRED' ? [current] : [];
    const response = {
      awaitingMyDecision: pending, submittedByMe: [],
      recentlyDecided: state === 'REVIEW_REQUIRED' ? [] : [current],
      summary: { pendingCount: pending.length, highPriorityCount: 0, ...(pending.length ? { oldestPendingAt: current.requestedAt } : {}) },
    };
    const data = request.url().endsWith('/summary') ? response.summary : response;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
  });
  await page.addInitScript(manager => {
    localStorage.clear();
    localStorage.setItem('booking_bridge_active_user', JSON.stringify(manager));
  }, manager);
  await page.goto('/');
  await page.locator('#nav-item-approvals').click();
  const card = page.getByTestId('approval-item-QUOTE_APPROVAL:quote-m4-3').first();
  await expect(card).toContainText('Supplier cost: ₹61,000');
  await expect(card).toContainText('Selling price: ₹64,000');
  await expect(card).toContainText('Margin: 4.7%');
  await expect(card).toContainText('Required threshold: 15%');

  await card.getByTestId('approve-approval').click();
  await page.getByTestId('approval-decision-note').fill('Approved for this commercial snapshot.');
  await page.getByTestId('confirm-approval-decision').click();
  await expect(page.getByText('APPROVED', { exact: true }).first()).toBeVisible();
  expect(decisions[0]).toMatchObject({ decision: 'APPROVED', expectedUpdatedAt: '1:2026-10-09T00:00:00Z', decisionNote: 'Approved for this commercial snapshot.' });

  state = 'REVIEW_REQUIRED';
  await page.getByRole('button', { name: 'Refresh' }).click();
  const refreshedCard = page.getByTestId('approval-item-QUOTE_APPROVAL:quote-m4-3').first();
  await refreshedCard.getByTestId('reject-approval').click();
  await page.getByTestId('approval-decision-note').fill('Increase the package margin.');
  await page.getByTestId('confirm-approval-decision').click();
  await expect(page.getByText('REJECTED', { exact: true }).first()).toBeVisible();
  expect(decisions[1]).toMatchObject({ decision: 'REJECTED', decisionNote: 'Increase the package margin.' });
});

