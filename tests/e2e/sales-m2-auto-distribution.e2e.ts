import { expect, test, type APIRequestContext } from '@playwright/test';

const admin = {
  id: 'emp-admin-01', employeeId: 'emp-admin-01', firebaseUid: 'demo:emp-admin-01',
  name: 'Nasir Wani', email: 'nasir.admin@bookingbridge.com', role: 'Admin',
  department: 'Operations & IT', active: true, createdAt: '2025-01-05T00:00:00Z',
};

const founder = {
  id: 'emp-founder-01', employeeId: 'emp-founder-01', firebaseUid: 'demo:emp-founder-01',
  name: 'Suhaib Hamid', email: 'suhaib@bookingbridge.com', role: 'Founder',
  department: 'Leadership', active: true, createdAt: '2025-01-01T00:00:00Z',
};

const salesExecutive = {
  id: 'emp-sales-01', employeeId: 'emp-sales-01', firebaseUid: 'demo:emp-sales-01',
  name: 'Tariq Bhat', email: 'tariq.sales@bookingbridge.com', role: 'Sales Executive',
  department: 'Sales', salesTeamId: 'sales-team-01', active: true, createdAt: '2025-02-01T00:00:00Z',
};

async function createLeadFromUi(page: import('@playwright/test').Page, name: string, phone: string) {
  await page.locator('#nav-item-leads').click();
  await page.locator('#create-lead-trigger').click();
  await page.locator('#lead-customer-name').fill(name);
  await page.locator('#lead-customer-phone').fill(phone);
  await page.locator('#lead-destination-select').selectOption('Kashmir');
  const responsePromise = page.waitForResponse(response => response.url().endsWith('/api/leads') && response.request().method() === 'POST');
  await page.locator('#submit-create-lead-btn').click();
  const response = await responsePromise;
  const body = await response.json();
  expect(response.status(), JSON.stringify(body)).toBe(201);
  await expect(page.locator('#create-lead-modal')).toHaveCount(0);
  const row = page.locator('tr', { hasText: name }).first();
  await expect(row).toBeVisible();
  return { row, lead: body.data as { id: string; assignmentStatus: string; assignedEmployeeId?: string; assignedEmployeeName?: string } };
}

async function verifyLeadAfterReload(page: import('@playwright/test').Page, name: string) {
  await page.reload();
  await page.locator('#nav-item-leads').click();
  const row = page.locator('tr', { hasText: name }).first();
  await expect(row).toBeVisible();
  await row.locator('button[id^="open-lead-btn-"]').click();
  await expect(page.locator('#lead-detail-drawer')).toContainText(name);
}

async function createIncoming(request: APIRequestContext, suffix: string, overrides: Record<string, unknown> = {}) {
  const phoneSuffix = suffix.replace(/\D/g, '').slice(-4).padStart(4, '0');
  const response = await request.post('/api/leads', {
    headers: { 'X-Demo-User-Id': 'emp-admin-01' },
    data: {
      creationRequestId: `m2-incoming-${suffix}`,
      customerName: `M2 Incoming ${suffix}`,
      customerPhone: `987651${phoneSuffix}`,
      destination: 'Kashmir', sourceId: 'META_FACEBOOK_ADS',
      ...overrides,
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()).data as { id: string; customerId: string; assignedEmployeeId?: string; assignmentReason: string };
}

test('M2 distributes deterministically, skips exclusions, preserves repeat ownership, and exposes history', async ({ page, request }) => {
  test.setTimeout(60_000);
  const runId = Date.now().toString();
  await page.addInitScript(employee => {
    localStorage.setItem('booking_bridge_active_user', JSON.stringify(employee));
  }, founder);
  await page.goto('/');
  await page.locator('#nav-item-lead-distribution').click();
  await expect(page.locator('#lead-distribution-settings')).toBeVisible();

  for (const testId of ['distribution-enabled', 'include-sales-executives', 'include-sales-managers', 'prefer-previous-salesperson']) {
    if (!(await page.getByTestId(testId).isChecked())) await page.getByTestId(testId).check();
  }
  for (const employeeId of ['emp-sales-01', 'emp-sales-02', 'emp-mgr-01']) {
    const exclusion = page.getByTestId(`exclude-${employeeId}`);
    if (await exclusion.isChecked()) await exclusion.uncheck();
  }
  await page.getByTestId('save-distribution-settings').click();
  await expect(page.getByTestId('round-robin-state')).toContainText('emp-sales-01 → emp-sales-02 → emp-mgr-01');
  const configuredOverview = await (await request.get('/api/leads/distribution/overview', { headers: { 'X-Demo-User-Id': 'emp-admin-01' } })).json();
  const order = configuredOverview.data.roundRobinOrder as string[];
  let expectedLast = configuredOverview.data.state.lastAssignedEmployeeId as string | undefined;
  const nextEligible = (excluded: string[] = []) => {
    const lastIndex = order.indexOf(expectedLast || '');
    for (let offset = 1; offset <= order.length; offset += 1) {
      const candidate = order[(Math.max(lastIndex, -1) + offset) % order.length];
      if (!excluded.includes(candidate)) {
        expectedLast = candidate;
        return candidate;
      }
    }
    throw new Error('The test configuration has no eligible Sales employee.');
  };

  const leads = [];
  for (const suffix of ['101', '102', '103', '104']) leads.push(await createIncoming(request, `${runId}-${suffix}`));
  expect(leads.map(lead => lead.assignedEmployeeId)).toEqual([nextEligible(), nextEligible(), nextEligible(), nextEligible()]);

  await page.getByTestId('exclude-emp-sales-02').check();
  await page.getByTestId('save-distribution-settings').click();
  await page.reload();
  await page.locator('#nav-item-lead-distribution').click();
  await expect(page.getByTestId('exclude-emp-sales-02')).toBeChecked();
  await expect(page.getByTestId('distribution-team')).toContainText('Kashmir Sales Team');
  const skipped = await createIncoming(request, `${runId}-105`);
  expect(skipped.assignedEmployeeId).toBe(nextEligible(['emp-sales-02']));

  const previous = await createIncoming(request, `${runId}-106`, { assignedEmployeeId: 'emp-mgr-01', sourceId: 'DIRECT_CALL' });
  const repeat = await createIncoming(request, `${runId}-107`, { customerId: previous.customerId, sourceId: 'REPEAT_CUSTOMER' });
  expect(repeat.assignedEmployeeId).toBe('emp-mgr-01');
  expect(repeat.assignmentReason).toBe('PREVIOUS_SALESPERSON');

  const stateBeforeFallback = await (await request.get('/api/leads/distribution/overview', { headers: { 'X-Demo-User-Id': 'emp-admin-01' } })).json();
  await page.getByTestId('exclude-emp-mgr-01').check();
  await page.getByTestId('save-distribution-settings').click();
  const fallback = await createIncoming(request, `${runId}-108`, { customerId: previous.customerId, sourceId: 'REPEAT_CUSTOMER' });
  expect(fallback.assignedEmployeeId).toBe('emp-sales-01');
  expect(fallback.assignmentReason).toBe('ROUND_ROBIN');

  const manual = await request.post('/api/leads', {
    headers: { 'X-Demo-User-Id': 'emp-sales-01' },
    data: { creationRequestId: `m2-manual-executive-${runId}-109`, customerName: 'M2 Manual Executive', customerPhone: '9876510109', destination: 'Kashmir', sourceId: 'DIRECT_CALL' },
  });
  expect(manual.ok()).toBe(true);
  expect((await manual.json()).data).toMatchObject({ assignedEmployeeId: 'emp-sales-01', assignmentReason: 'MANUAL_CREATOR' });
  const stateAfterManual = await (await request.get('/api/leads/distribution/overview', { headers: { 'X-Demo-User-Id': 'emp-admin-01' } })).json();
  expect(stateAfterManual.data.state.sequence).toBe(stateBeforeFallback.data.state.sequence + 1);

  const historyResponse = await request.get(`/api/leads/${repeat.id}/assignment-history`, { headers: { 'X-Demo-User-Id': 'emp-admin-01' } });
  expect(historyResponse.ok()).toBe(true);
  expect(await historyResponse.json()).toMatchObject({ data: [{ actorEmployeeId: 'SYSTEM', reason: 'PREVIOUS_SALESPERSON', ruleId: 'repeat-customer' }] });

  await page.locator('#nav-item-leads').click();
  await page.locator('#create-lead-trigger').click();
  const uiLeadName = `M2 UI Assignment History ${runId}`;
  await page.getByTestId('lead-source').selectOption('WEBSITE');
  await page.locator('#lead-customer-name').fill(uiLeadName);
  await page.locator('#lead-customer-phone').fill('9876510110');
  await page.locator('#lead-destination-select').selectOption('Kashmir');
  await page.locator('#submit-create-lead-btn').click();
  await expect(page.locator('#create-lead-modal')).toHaveCount(0);
  await page.reload();
  await page.locator('#nav-item-leads').click();
  const row = page.locator('tr', { hasText: uiLeadName });
  await expect(row).toBeVisible();
  await row.locator('button[id^="open-lead-btn-"]').click();
  await expect(page.getByTestId('lead-assignment-panel')).toContainText('Kashmir round robin');
  await expect(page.getByTestId('assignment-history')).toContainText('SYSTEM');
});

test('M2 settings rejects a stale HTML API response and Retry recovers without hanging', async ({ page }) => {
  await page.addInitScript(employee => {
    localStorage.setItem('booking_bridge_active_user', JSON.stringify(employee));
  }, founder);
  let returnStaleShell = true;
  await page.route('**/api/leads/distribution/overview', async route => {
    if (returnStaleShell) {
      await route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Stale Vite shell</title>' });
      return;
    }
    await route.continue();
  });

  await page.goto('/');
  await page.locator('#nav-item-lead-distribution').click();
  await expect(page.getByTestId('lead-distribution-loading')).toHaveCount(0);
  await expect(page.locator('#lead-distribution-error')).toContainText('NON_JSON_API_RESPONSE');
  await expect(page.locator('#lead-distribution-error')).toContainText('HTTP 200');
  await expect(page.locator('#lead-distribution-error')).toContainText('Restart the current BBOS dev server');

  returnStaleShell = false;
  await page.getByTestId('retry-lead-distribution').click();
  await expect(page.locator('#lead-distribution-settings')).toBeVisible();
  await expect(page.getByTestId('distribution-enabled')).toBeVisible();
  await expect(page.getByTestId('distribution-team')).toContainText('Kashmir Sales Team');
  await expect(page.getByTestId('round-robin-state')).toBeVisible();
});

test('M2 Lead save remains render-safe for manual and assignment-required outcomes', async ({ browser, request }) => {
  test.setTimeout(60_000);
  const founderHeaders = { 'X-Demo-User-Id': 'emp-founder-01' };
  const overviewResponse = await request.get('/api/leads/distribution/overview', { headers: founderHeaders });
  expect(overviewResponse.ok(), await overviewResponse.text()).toBe(true);
  const original = (await overviewResponse.json()).data.configuration;

  const pageErrors: string[] = [];
  const executiveContext = await browser.newContext();
  const executivePage = await executiveContext.newPage();
  executivePage.on('pageerror', error => pageErrors.push(error.message));
  await executivePage.addInitScript(employee => {
    localStorage.setItem('booking_bridge_active_user', JSON.stringify(employee));
  }, salesExecutive);

  const founderContext = await browser.newContext();
  const founderPage = await founderContext.newPage();
  founderPage.on('pageerror', error => pageErrors.push(error.message));
  await founderPage.addInitScript(employee => {
    localStorage.setItem('booking_bridge_active_user', JSON.stringify(employee));
  }, founder);

  try {
    const suffix = String(Date.now()).slice(-6);
    await executivePage.goto('/');
    const manualName = `M2 Manual Save ${suffix}`;
    const manual = await createLeadFromUi(executivePage, manualName, `98762${suffix.slice(-5)}`);
    expect(manual.lead).toMatchObject({ assignmentStatus: 'ASSIGNED', assignedEmployeeId: 'emp-sales-01', assignedEmployeeName: 'Tariq Bhat' });
    await verifyLeadAfterReload(executivePage, manualName);
    await expect(executivePage.getByTestId('assignment-reason')).toContainText('Kept with creator');

    const disableEligibleResponse = await request.patch('/api/leads/distribution/config', {
      headers: founderHeaders,
      data: {
        enabled: true, salesTeamId: original.salesTeamId,
        includeSalesExecutives: true, includeSalesManagers: true,
        previousSalespersonPreference: true,
        excludedEmployeeIds: ['emp-sales-01', 'emp-sales-02', 'emp-mgr-01'],
      },
    });
    expect(disableEligibleResponse.ok(), await disableEligibleResponse.text()).toBe(true);

    await founderPage.goto('/');
    const unassignedName = `M2 Assignment Required ${suffix}`;
    const unassigned = await createLeadFromUi(founderPage, unassignedName, `98763${suffix.slice(-5)}`);
    expect(unassigned.lead).toMatchObject({ assignmentStatus: 'ASSIGNMENT_REQUIRED' });
    expect(unassigned.lead.assignedEmployeeId).toBeUndefined();
    expect(unassigned.lead.assignedEmployeeName).toBeUndefined();
    await expect(unassigned.row).toContainText('Assignment required');
    await verifyLeadAfterReload(founderPage, unassignedName);
    await expect(founderPage.getByTestId('assignment-required-warning')).toBeVisible();
    await founderPage.locator('#close-lead-drawer-btn').click();
    await founderPage.locator('#view-kanban-mode').click();
    await expect(founderPage.locator(`#kanban-card-${unassigned.lead.id}`)).toContainText('Assignment');

    expect(pageErrors.filter(message => message !== 'WebSocket closed without opened.')).toEqual([]);
  } finally {
    await request.patch('/api/leads/distribution/config', {
      headers: founderHeaders,
      data: {
        enabled: original.enabled, salesTeamId: original.salesTeamId,
        includeSalesExecutives: original.includeSalesExecutives,
        includeSalesManagers: original.includeSalesManagers,
        previousSalespersonPreference: original.previousSalespersonPreference,
        excludedEmployeeIds: original.excludedEmployeeIds,
      },
    });
    await executiveContext.close();
    await founderContext.close();
  }
});
