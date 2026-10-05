import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const executive = {
  id: 'emp-sales-01', employeeId: 'emp-sales-01', firebaseUid: 'demo:emp-sales-01',
  name: 'Tariq Bhat', email: 'tariq.sales@bookingbridge.com', role: 'Sales Executive',
  department: 'Sales', salesTeamId: 'sales-team-01', managerEmployeeId: 'emp-mgr-01', active: true,
};

const anotherExecutive = {
  id: 'emp-sales-02', employeeId: 'emp-sales-02', firebaseUid: 'demo:emp-sales-02',
  name: 'Ayesha Zargar', email: 'ayesha.sales@bookingbridge.com', role: 'Sales Executive',
  department: 'Sales', salesTeamId: 'sales-team-01', managerEmployeeId: 'emp-mgr-01', active: true,
};

const executiveHeaders = { 'X-Demo-User-Id': executive.employeeId };
const managerHeaders = { 'X-Demo-User-Id': 'emp-mgr-01' };

type ApiLead = { id: string; updatedAt: string; status: string; nextFollowUpAt?: string | null };

async function createLead(request: APIRequestContext, suffix: string, name: string): Promise<ApiLead> {
  const response = await request.post('/api/leads', {
    headers: executiveHeaders,
    data: {
      creationRequestId: `m3-${suffix}`,
      customerName: name,
      customerPhone: `98764${suffix.replace(/\D/g, '').slice(-5).padStart(5, '0')}`,
      destination: 'Kashmir', sourceId: 'DIRECT_CALL', adults: 2, children: 0,
      travelStartDate: '2026-12-10', nights: 5,
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()).data as ApiLead;
}

async function localDateTimeInput(page: Page, timestamp: number): Promise<string> {
  return page.evaluate(value => {
    const date = new Date(value);
    const two = (part: number) => String(part).padStart(2, '0');
    return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}T${two(date.getHours())}:${two(date.getMinutes())}`;
  }, timestamp);
}

async function laterToday(page: Page): Promise<number> {
  return page.evaluate(() => {
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 0, 0);
    return endOfToday.getTime();
  });
}

async function openQueue(page: Page) {
  await page.locator('#nav-item-sales-workspace').click();
  await expect(page.getByRole('heading', { name: 'My Sales Queue' })).toBeVisible();
  await expect(page.getByTestId('sales-queue-group-overdue')).toBeVisible();
  await expect(page.getByTestId('sales-queue-group-today')).toBeVisible();
  await expect(page.getByTestId('sales-queue-group-needs-attention')).toBeVisible();
  await expect(page.getByTestId('sales-queue-group-upcoming')).toBeVisible();
}

async function recordFromQueue(page: Page, lead: ApiLead, outcome: 'no-answer' | 'callback-requested' | 'interested' | 'negotiating' | 'not-interested', when?: number) {
  const responsePromise = page.waitForResponse(response => response.url().includes(`/api/leads/${lead.id}/interaction`) && response.request().method() === 'POST');
  await page.getByTestId(`queue-${outcome}-${lead.id}`).click();
  if (when !== undefined) await page.getByTestId('interaction-next-follow-up').fill(await localDateTimeInput(page, when));
  await page.getByTestId('save-lead-interaction').click();
  const response = await responsePromise;
  const body = await response.json();
  expect(response.ok(), JSON.stringify(body)).toBe(true);
  return body.data as ApiLead;
}

test('M3 Sales queue persists interactions, moves urgency, reassigns naturally, and excludes closed Leads', async ({ page, request }) => {
  test.setTimeout(90_000);
  const runId = String(Date.now());
  const primaryName = `M3 Queue ${runId}`;
  let primary = await createLead(request, `${runId}-1`, primaryName);
  const dropLead = await createLead(request, `${runId}-2`, `M3 Drop ${runId}`);
  let convertedLead = await createLead(request, `${runId}-3`, `M3 Convert ${runId}`);
  let duplicateLead = await createLead(request, `${runId}-4`, `M3 Duplicate ${runId}`);

  await page.addInitScript(employee => {
    if (!localStorage.getItem('booking_bridge_active_user')) localStorage.setItem('booking_bridge_active_user', JSON.stringify(employee));
  }, executive);
  await page.goto('/');
  await openQueue(page);

  const needsAttention = page.getByTestId('sales-queue-group-needs-attention');
  await expect(needsAttention.getByText(primaryName, { exact: true })).toBeVisible();

  primary = await recordFromQueue(page, primary, 'no-answer', await laterToday(page));
  await expect(page.getByTestId('sales-queue-group-today').getByText(primaryName, { exact: true })).toBeVisible();

  await page.reload();
  await openQueue(page);
  const todayCard = page.getByTestId(`sales-queue-lead-${primary.id}`);
  await expect(todayCard).toContainText('No Answer');
  await expect(todayCard.getByTestId(`queue-next-${primary.id}`)).not.toContainText('Not scheduled');

  primary = await recordFromQueue(page, primary, 'callback-requested', Date.now() + 30 * 60 * 60_000);
  await expect(page.getByTestId('sales-queue-group-upcoming').getByText(primaryName, { exact: true })).toBeVisible();

  const overdueResponse = await request.post(`/api/leads/${primary.id}/interaction`, {
    headers: managerHeaders,
    data: { outcome: 'CALLBACK_REQUESTED', expectedUpdatedAt: primary.updatedAt, idempotencyKey: `m3-overdue-${runId}`, nextFollowUpAt: new Date(Date.now() - 60 * 60_000).toISOString() },
  });
  expect(overdueResponse.ok(), await overdueResponse.text()).toBe(true);
  primary = (await overdueResponse.json()).data;
  await page.reload();
  await openQueue(page);
  await expect(page.getByTestId('sales-queue-group-overdue').getByText(primaryName, { exact: true })).toBeVisible();

  primary = await recordFromQueue(page, primary, 'interested', Date.now() + 30 * 60 * 60_000);
  await expect(page.getByTestId('sales-queue-group-overdue').getByText(primaryName, { exact: true })).toHaveCount(0);
  await expect(page.getByTestId('sales-queue-group-upcoming').getByText(primaryName, { exact: true })).toBeVisible();

  const reassign = await request.patch(`/api/leads/${primary.id}/assignment`, {
    headers: managerHeaders,
    data: { targetEmployeeId: anotherExecutive.employeeId, expectedUpdatedAt: primary.updatedAt, note: 'M3 queue ownership test' },
  });
  expect(reassign.ok(), await reassign.text()).toBe(true);
  await page.reload();
  await openQueue(page);
  await expect(page.getByText(primaryName, { exact: true })).toHaveCount(0);
  await page.evaluate(employee => localStorage.setItem('booking_bridge_active_user', JSON.stringify(employee)), anotherExecutive);
  await page.reload();
  await openQueue(page);
  await expect(page.getByTestId('sales-queue-group-upcoming').getByText(primaryName, { exact: true })).toBeVisible();
  await page.getByText(primaryName, { exact: true }).click();
  await expect(page.getByTestId('lead-next-action-widget')).toContainText('Interested');
  await expect(page.getByTestId('next-follow-up-value')).not.toContainText('Needs scheduling');

  await page.evaluate(employee => localStorage.setItem('booking_bridge_active_user', JSON.stringify(employee)), executive);
  await page.reload();
  await openQueue(page);
  await recordFromQueue(page, dropLead, 'not-interested');
  await expect(page.getByText(`M3 Drop ${runId}`, { exact: true })).toHaveCount(0);

  const convertedOverdue = await request.post(`/api/leads/${convertedLead.id}/interaction`, {
    headers: executiveHeaders,
    data: { outcome: 'NO_ANSWER', expectedUpdatedAt: convertedLead.updatedAt, idempotencyKey: `m3-convert-overdue-${runId}`, nextFollowUpAt: new Date(Date.now() - 60_000).toISOString() },
  });
  expect(convertedOverdue.ok(), await convertedOverdue.text()).toBe(true);
  convertedLead = (await convertedOverdue.json()).data;
  const closeResponse = await request.patch(`/api/leads/${convertedLead.id}`, {
    headers: executiveHeaders,
    data: { expectedUpdatedAt: convertedLead.updatedAt, status: 'CONVERTED' },
  });
  expect(closeResponse.ok(), await closeResponse.text()).toBe(true);
  expect((await closeResponse.json()).data).toMatchObject({ status: 'CONVERTED', nextFollowUpAt: null });

  const duplicateRequest = {
    outcome: 'NO_ANSWER', expectedUpdatedAt: duplicateLead.updatedAt,
    idempotencyKey: `m3-deduplicate-${runId}`, nextFollowUpAt: new Date(Date.now() + 60 * 60_000).toISOString(),
  };
  const first = await request.post(`/api/leads/${duplicateLead.id}/interaction`, { headers: executiveHeaders, data: duplicateRequest });
  const second = await request.post(`/api/leads/${duplicateLead.id}/interaction`, { headers: executiveHeaders, data: duplicateRequest });
  expect(first.status()).toBe(201);
  expect(second.status()).toBe(200);
  const firstBody = await first.json();
  const secondBody = await second.json();
  expect(secondBody).toMatchObject({ idempotent: true, eventId: firstBody.eventId });
  duplicateLead = secondBody.data;
  expect(duplicateLead.status).toBe('CONTACTED');

  await page.reload();
  await openQueue(page);
  await expect(page.getByText(`M3 Convert ${runId}`, { exact: true })).toHaveCount(0);
});

test('M3 Open Lead resolves canonical detail from every queue state and survives direct refresh', async ({ page, request }) => {
  test.setTimeout(60_000);
  const runId = String(Date.now());
  const needsName = `M3 Detail New ${runId}`;
  const todayName = `M3 Detail Today ${runId}`;
  const overdueName = `M3 Detail Overdue ${runId}`;
  const needsLead = await createLead(request, `${runId}-detail-1`, needsName);
  let todayLead = await createLead(request, `${runId}-detail-2`, todayName);
  let overdueLead = await createLead(request, `${runId}-detail-3`, overdueName);

  const todayResponse = await request.post(`/api/leads/${todayLead.id}/interaction`, {
    headers: executiveHeaders,
    data: { outcome: 'CALLBACK_REQUESTED', expectedUpdatedAt: todayLead.updatedAt, idempotencyKey: `m3-detail-today-${runId}`, nextFollowUpAt: new Date(Date.now() + 15 * 60_000).toISOString() },
  });
  expect(todayResponse.ok(), await todayResponse.text()).toBe(true);
  todayLead = (await todayResponse.json()).data;

  const overdueResponse = await request.post(`/api/leads/${overdueLead.id}/interaction`, {
    headers: executiveHeaders,
    data: { outcome: 'NO_ANSWER', expectedUpdatedAt: overdueLead.updatedAt, idempotencyKey: `m3-detail-overdue-${runId}`, nextFollowUpAt: new Date(Date.now() - 60 * 60_000).toISOString() },
  });
  expect(overdueResponse.ok(), await overdueResponse.text()).toBe(true);
  overdueLead = (await overdueResponse.json()).data;

  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  await page.addInitScript(employee => {
    localStorage.setItem('booking_bridge_active_user', JSON.stringify(employee));
    localStorage.setItem('bb_leads', '[]');
  }, executive);
  await page.goto('/');
  await openQueue(page);

  const openLead = async (leadId: string, customerName: string) => {
    const card = page.getByTestId(`sales-queue-lead-${leadId}`);
    await expect(card).toContainText(customerName);
    await card.getByRole('button', { name: 'Open Lead', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`view=lead-detail.*id=${encodeURIComponent(leadId)}`));
    await expect(page.getByRole('heading', { name: customerName, exact: true })).toBeVisible();
    await expect(page.getByTestId('lead-next-action-widget')).toBeVisible();
  };

  await openLead(needsLead.id, needsName);
  await expect(page.getByTestId('next-follow-up-value')).toContainText('Needs scheduling');
  await page.reload();
  await expect(page.getByRole('heading', { name: needsName, exact: true })).toBeVisible();
  await expect(page.getByTestId('next-follow-up-value')).toContainText('Needs scheduling');
  await page.getByTestId('back-to-sales-queue').click();
  await expect(page).toHaveURL(/view=sales-workspace/);

  await openLead(todayLead.id, todayName);
  await expect(page.getByTestId('lead-next-action-widget')).toContainText('Callback / Reschedule');
  await expect(page.getByTestId('next-follow-up-value')).not.toContainText('Overdue');
  await page.getByTestId('back-to-sales-queue').click();

  await openLead(overdueLead.id, overdueName);
  await expect(page.getByTestId('lead-next-action-widget')).toContainText('No Answer');
  await expect(page.getByTestId('next-follow-up-value')).toContainText('Overdue');
  await page.getByTestId('back-to-sales-queue').click();

  await expect(page.getByTestId('quote-aging-demo-lead-01')).toContainText('Quote sent');
  await openLead('demo-lead-01', 'Rohit Sharma');
  await expect(page.getByTestId('lead-next-action-widget')).toBeVisible();
  await page.getByTestId('back-to-sales-queue').click();
  await openLead(overdueLead.id, overdueName);

  expect(pageErrors.filter(message => message !== 'WebSocket closed without opened.')).toEqual([]);
  expect(consoleErrors.filter(message => !message.includes('WebSocket') && !message.includes('[vite] failed to connect'))).toEqual([]);
});
