import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';
import { leadsRouter } from '../../server/routes/leads';
import { Request, Response } from 'express';
import { getAdminDb } from '../../server/firebaseAdmin';

mock.module('../../server/firebaseAdmin.ts', () => {
  let leadsData: any = {
    'lead-1': {
      id: 'lead-1',
      status: 'NEW',
      assignedEmployeeId: 'emp-1',
      salesTeamId: 'sales-team-1',
      createdAt: '2026-01-01',
      protectedField: 'secret'
    }
  };
  const employeesData: any = {
    'legacy-active-sales-doc': {
      employeeId: 'emp-active-sales',
      name: 'Active Sales',
      role: 'Sales Executive',
      active: true,
      salesTeamId: 'sales-team-1',
    },
    'emp-inactive-sales': {
      employeeId: 'emp-inactive-sales',
      name: 'Inactive Sales',
      role: 'Sales Executive',
      active: false,
    },
    'emp-other-team': {
      employeeId: 'emp-other-team',
      name: 'Other Team Sales',
      role: 'Sales Executive',
      active: true,
      salesTeamId: 'sales-team-2',
    },
    'manager-1': {
      employeeId: 'manager-1',
      name: 'Sales Manager One',
      role: 'Sales Manager',
      active: true,
      salesTeamId: 'sales-team-1',
    },
  };
  let auditLogs: any[] = [];
  let customersData: Record<string, any> = {};
  const rejectUndefinedFirestoreValues = (value: unknown, path = 'data'): void => {
    if (value === undefined) throw new Error(`Firestore rejected undefined at ${path}`);
    if (Array.isArray(value)) {
      value.forEach((item, index) => rejectUndefinedFirestoreValues(item, `${path}[${index}]`));
      return;
    }
    if (value && typeof value === 'object') {
      Object.entries(value).forEach(([key, item]) => rejectUndefinedFirestoreValues(item, `${path}.${key}`));
    }
  };
  const leadDocs = (field?: string, value?: unknown) => Object.entries(leadsData)
    .filter(([, data]: any) => !field || data[field] === value)
    .map(([id, data]) => ({ id, exists: true, data: () => data }));
  const customerDocs = (field?: string, value?: unknown) => Object.entries(customersData)
    .filter(([, data]: any) => !field || data[field] === value)
    .map(([id, data]) => ({ id, exists: true, data: () => data }));
  const leadQuery = (field?: string, value?: unknown) => ({
    orderBy: () => ({ limit: () => ({ get: async () => ({ docs: leadDocs(field, value) }) }) }),
    limit: () => ({ get: async () => ({ docs: leadDocs(field, value) }) }),
  });
  return {
    getAdminDb: () => ({
      runTransaction: async (operation: (transaction: any) => Promise<void>) => {
        const pending: Array<() => void> = [];
        await operation({
          create: (reference: any, data: any) => {
            rejectUndefinedFirestoreValues(data);
            pending.push(() => reference.set(data));
          },
          update: (reference: any, data: any) => {
            rejectUndefinedFirestoreValues(data);
            pending.push(() => reference.update(data));
          },
        });
        pending.forEach((commit) => commit());
      },
      collection: (col: string) => ({
        orderBy: () => ({ limit: () => ({ get: async () => ({ docs: leadDocs() }) }) }),
        where: (field: string, _operator: string, value: unknown) => ({
          ...leadQuery(field, value),
          limit: (_count: number) => ({
            get: async () => ({
              docs: col === 'employees'
                ? Object.entries(employeesData)
                  .filter(([, data]: any) => field === 'employeeId' && data.employeeId === value)
                  .map(([id, data]) => ({ id, exists: true, data: () => data }))
                : col === 'customers' ? customerDocs(field, value) : leadDocs(field, value),
            }),
          }),
        }),
        doc: (id: string) => ({
          get: async () => ({
            id,
            exists: col === 'employees' ? !!employeesData[id] : col === 'customers' ? !!customersData[id] : !!leadsData[id],
            data: () => col === 'employees' ? employeesData[id] : col === 'customers' ? customersData[id] : leadsData[id]
          }),
          update: async (updates: any) => {
            if (col === 'leads') {
              leadsData[id] = { ...leadsData[id], ...updates };
            }
          },
          set: async (data: any) => {
            if (col === 'leads') {
              leadsData[id] = data;
            }
            if (col === 'audit_logs') {
              auditLogs.push(data);
            }
            if (col === 'customers') {
              customersData[id] = data;
            }
          }
        })
      })
    })
  };
});

describe('POST /api/leads', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let jsonMock: any;
  let statusMock: any;

  beforeEach(() => {
    jsonMock = mock((data: any) => data);
    statusMock = mock((code: number) => ({ json: jsonMock }));
    req = {
      user: { id: 'emp-1', employeeId: 'emp-1', role: 'Sales Executive', name: 'John', salesTeamId: 'sales-team-1' } as any,
      body: {}
    };
    res = { json: jsonMock, status: statusMock };
  });

  afterEach(() => { mock.restore(); });

  it('creates lead with required fields and assigns server fields', async () => {
    req.body = {
      customerName: 'Test', customerPhone: '9876543210', destination: 'Kashmir',
      travelStartDate: '2026-10-01', travelEndDate: '2026-10-05',
      adults: 2, children: 0, childAges: [], tripType: 'Honeymoon', budget: 50000, sourceId: 'WEBSITE',
      leadScore: 999, // Should be ignored
      id: 'malicious-id' // Should be ignored
    };
    const route = (leadsRouter as any).stack.find((r: any) => r.route && r.route.path === '/' && r.route.methods.post);
    const handler = route.route.stack[1].handle;
    await handler(req as Request, res as Response, () => {});
    
    expect(jsonMock).toHaveBeenCalled();
    const result = jsonMock.mock.calls[0][0];
    expect(result.success).toBe(true);
    expect(result.data.customerName).toBe('Test');
    expect(result.data.leadScore).toBeUndefined();
    expect(result.data.id).not.toBe('malicious-id');
    expect(result.data.id).toMatch(/^lead-/);
    expect(result.data.salesTeamId).toBe('sales-team-1');
  });

  it('persists a Lead when optional customerEmail is omitted without writing undefined Firestore values', async () => {
    req.body = {
      customerName: 'No Email Customer', customerPhone: '9876543211', destination: 'Kashmir',
      travelStartDate: '2026-10-01', travelEndDate: '2026-10-05',
      adults: 2, children: 0, childAges: [], tripType: 'Honeymoon', budget: 50000, sourceId: 'WEBSITE',
    };
    const route = (leadsRouter as any).stack.find((entry: any) => entry.route?.path === '/' && entry.route.methods.post);
    await route.route.stack[1].handle(req as Request, res as Response, () => {});

    expect(statusMock).not.toHaveBeenCalledWith(500);
    expect(jsonMock.mock.calls[0][0]).toMatchObject({ success: true });
    expect(jsonMock.mock.calls[0][0].data.customerEmail).toBeUndefined();
  });

  it('enforces IDOR on assignment for Sales Executive', async () => {
    req.user = { id: 'compatibility-id', employeeId: 'emp-exec', role: 'Sales Executive', name: 'Exec', salesTeamId: 'sales-team-1' } as any;
    req.body = {
      customerName: 'Test', customerPhone: '9876543212', destination: 'Kashmir',
      travelStartDate: '2026-10-01', travelEndDate: '2026-10-05',
      adults: 2, children: 0, childAges: [], tripType: 'Honeymoon', budget: 50000, sourceId: 'WEBSITE',
      assignedEmployeeId: 'emp-manager' // Try to assign to someone else
    };
    const route = (leadsRouter as any).stack.find((r: any) => r.route && r.route.path === '/' && r.route.methods.post);
    const handler = route.route.stack[1].handle;
    await handler(req as Request, res as Response, () => {});
    
    expect(jsonMock).toHaveBeenCalled();
    const result = jsonMock.mock.calls[0][0];
    // Sales Executive assignment is overridden to themselves
    expect(result.data.assignedEmployeeId).toBe('emp-exec');
  });

  it('rejects if missing required fields', async () => {
    req.body = { customerName: 'Test' }; // Missing destination, budget, etc.
    const route = (leadsRouter as any).stack.find((r: any) => r.route && r.route.path === '/' && r.route.methods.post);
    const handler = route.route.stack[1].handle;
    await handler(req as Request, res as Response, () => {});
    
    expect(statusMock).toHaveBeenCalledWith(400);
  });

  it('allows assignment only to a canonical active Sales employee', async () => {
    req.user = { id: 'legacy-admin', employeeId: 'emp-admin-01', role: 'Admin', name: 'Admin' } as any;
    req.body = {
      customerName: 'Test', customerPhone: '9876543213', destination: 'Kashmir',
      travelStartDate: '2026-10-01', travelEndDate: '2026-10-05',
      adults: 2, children: 0, childAges: [], tripType: 'Honeymoon', budget: 50000, sourceId: 'WEBSITE',
      assignedEmployeeId: 'emp-active-sales', assignedEmployeeName: 'Forged Name',
    };
    const route = (leadsRouter as any).stack.find((r: any) => r.route && r.route.path === '/' && r.route.methods.post);
    const handler = route.route.stack[1].handle;
    await handler(req as Request, res as Response, () => {});

    const result = jsonMock.mock.calls[0][0];
    expect(result.data.assignedEmployeeId).toBe('emp-active-sales');
    expect(result.data.assignedEmployeeName).toBe('Active Sales');
  });

  it('rejects a new assignment to an inactive employee', async () => {
    req.user = { id: 'legacy-admin', employeeId: 'emp-admin-01', role: 'Admin', name: 'Admin' } as any;
    req.body = {
      customerName: 'Test', customerPhone: '9876543214', destination: 'Kashmir',
      travelStartDate: '2026-10-01', travelEndDate: '2026-10-05',
      adults: 2, children: 0, childAges: [], tripType: 'Honeymoon', budget: 50000, sourceId: 'WEBSITE',
      assignedEmployeeId: 'emp-inactive-sales',
    };
    const route = (leadsRouter as any).stack.find((r: any) => r.route && r.route.path === '/' && r.route.methods.post);
    const handler = route.route.stack[1].handle;
    await handler(req as Request, res as Response, () => {});

    expect(statusMock).toHaveBeenCalledWith(422);
    expect(jsonMock.mock.calls[0][0].code).toBe('ACTIVE_SALES_ASSIGNEE_REQUIRED');
  });

  it('prevents a Sales Manager from assigning a Lead outside their team', async () => {
    req.user = { employeeId: 'manager-1', role: 'Sales Manager', name: 'Manager', salesTeamId: 'sales-team-1' } as any;
    req.body = {
      customerName: 'Test', customerPhone: '9876543215', destination: 'Kashmir',
      travelStartDate: '2026-10-01', travelEndDate: '2026-10-05',
      adults: 2, children: 0, childAges: [], tripType: 'Honeymoon', budget: 50000, sourceId: 'WEBSITE',
      assignedEmployeeId: 'emp-other-team',
    };
    const route = (leadsRouter as any).stack.find((r: any) => r.route?.path === '/' && r.route.methods.post);
    await route.route.stack[1].handle(req as Request, res as Response, () => {});
    expect(statusMock).toHaveBeenCalledWith(403);
    expect(jsonMock.mock.calls[0][0].code).toBe('LEAD_TEAM_SCOPE_DENIED');
  });

  it('allows a Sales Manager to create within TEAM scope and derives canonical team metadata', async () => {
    req.user = { employeeId: 'manager-1', role: 'Sales Manager', name: 'Manager', salesTeamId: 'sales-team-1' } as any;
    req.body = {
      customerName: 'Team Lead', customerPhone: '9876543216', destination: 'Jammu', sourceId: 'DIRECT_CALL',
      assignedEmployeeId: 'emp-active-sales', creationRequestId: 'manager-team-create-001',
    };
    const route = (leadsRouter as any).stack.find((entry: any) => entry.route?.path === '/' && entry.route.methods.post);
    await route.route.stack[1].handle(req as Request, res as Response, () => {});
    expect(jsonMock.mock.calls[0][0].data).toMatchObject({
      assignedEmployeeId: 'emp-active-sales', assignedEmployeeName: 'Active Sales', salesTeamId: 'sales-team-1',
    });
  });

  it('allows Founder to assign an eligible Sales employee without trusting forged team/name', async () => {
    req.user = { employeeId: 'founder-1', role: 'Founder', name: 'Founder' } as any;
    req.body = {
      customerName: 'Founder Lead', customerPhone: '9876543217', destination: 'Himachal', sourceId: 'REFERRAL',
      assignedEmployeeId: 'emp-active-sales', assignedEmployeeName: 'Forged', salesTeamId: 'forged-team',
      creationRequestId: 'founder-assignment-001',
    };
    const route = (leadsRouter as any).stack.find((entry: any) => entry.route?.path === '/' && entry.route.methods.post);
    await route.route.stack[1].handle(req as Request, res as Response, () => {});
    expect(jsonMock.mock.calls[0][0].data).toMatchObject({
      assignedEmployeeId: 'emp-active-sales', assignedEmployeeName: 'Active Sales', salesTeamId: 'sales-team-1',
    });
  });

  it('accepts the true minimum enquiry without inventing dates, budget, or pax', async () => {
    req.body = {
      customerName: 'Minimum Enquiry', customerEmail: 'minimum@example.com', destination: 'General',
      sourceId: 'DIRECT_CALL', creationRequestId: 'minimum-enquiry-001',
    };
    const route = (leadsRouter as any).stack.find((entry: any) => entry.route?.path === '/' && entry.route.methods.post);
    await route.route.stack[1].handle(req as Request, res as Response, () => {});
    const lead = jsonMock.mock.calls[0][0].data;
    expect(lead.status).toBe('NEW');
    expect(lead.priority).toBe('NORMAL');
    expect(lead.travelStartDate).toBeUndefined();
    expect(lead.budget).toBeUndefined();
    expect(lead.adults).toBeUndefined();
    expect(lead.createdSourceType).toBe('MANUAL');
  });

  it('preserves one authoritative age for every child', async () => {
    req.body = {
      customerName: 'Family Enquiry', customerPhone: '9876543220', destination: 'Kerala', sourceId: 'REFERRAL',
      adults: 2, children: 2, childAges: [4, 9], creationRequestId: 'family-enquiry-001',
    };
    const route = (leadsRouter as any).stack.find((entry: any) => entry.route?.path === '/' && entry.route.methods.post);
    await route.route.stack[1].handle(req as Request, res as Response, () => {});
    expect(jsonMock.mock.calls[0][0].data).toMatchObject({ adults: 2, children: 2, childAges: [4, 9], travelerCount: 4 });

    jsonMock.mockClear(); statusMock.mockClear();
    req.body = { ...req.body, creationRequestId: 'family-enquiry-002', childAges: [4] };
    await route.route.stack[1].handle(req as Request, res as Response, () => {});
    expect(statusMock).toHaveBeenCalledWith(400);
    expect(jsonMock.mock.calls[0][0].code).toBe('CHILD_AGES_REQUIRED');
  });

  it('requires explicit customer linkage and permits multiple Leads for one Customer', async () => {
    const route = (leadsRouter as any).stack.find((entry: any) => entry.route?.path === '/' && entry.route.methods.post);
    req.body = {
      customerName: 'Repeat Traveller', customerPhone: '+91 98765 43221', destination: 'Goa', sourceId: 'DIRECT_CALL',
      creationRequestId: 'repeat-customer-001',
    };
    await route.route.stack[1].handle(req as Request, res as Response, () => {});
    const first = jsonMock.mock.calls[0][0].data;

    jsonMock.mockClear(); statusMock.mockClear();
    req.body = {
      customerId: first.customerId, customerName: 'Forged Customer Snapshot', customerPhone: '9999999999',
      destination: 'Ladakh', sourceId: 'REPEAT_CUSTOMER', creationRequestId: 'repeat-customer-002',
    };
    await route.route.stack[1].handle(req as Request, res as Response, () => {});
    const second = jsonMock.mock.calls[0][0].data;
    expect(second.customerId).toBe(first.customerId);
    expect(second.id).not.toBe(first.id);
    expect(second.customerName).toBe('Repeat Traveller');
    expect(second.customerPhone).toBe('+91 98765 43221');
  });

  it('is idempotent for a repeated creationRequestId', async () => {
    const route = (leadsRouter as any).stack.find((entry: any) => entry.route?.path === '/' && entry.route.methods.post);
    req.body = {
      customerName: 'Double Submit', customerPhone: '9876543222', destination: 'Kashmir', sourceId: 'WHATSAPP',
      creationRequestId: 'double-submit-001',
    };
    await route.route.stack[1].handle(req as Request, res as Response, () => {});
    const first = jsonMock.mock.calls[0][0].data;

    jsonMock.mockClear(); statusMock.mockClear();
    await route.route.stack[1].handle(req as Request, res as Response, () => {});
    expect(statusMock).toHaveBeenCalledWith(200);
    expect(jsonMock.mock.calls[0][0]).toMatchObject({ success: true, idempotent: true });
    expect(jsonMock.mock.calls[0][0].data.id).toBe(first.id);
  });
});

describe('GET /api/leads', () => {
  const getHandler = () => {
    const route = (leadsRouter as any).stack.find((entry: any) => entry.route?.path === '/' && entry.route.methods.get);
    return route.route.stack[1].handle;
  };

  it('returns only OWN Leads for a Sales Executive using canonical employeeId', async () => {
    const json = mock((value: any) => value);
    const status = mock((_code: number) => ({ json }));
    const req = {
      user: { id: 'compatibility-id', employeeId: 'emp-1', role: 'Sales Executive', salesTeamId: 'sales-team-1' },
    } as any;
    await getHandler()(req, { json, status } as any, () => {});
    const result = json.mock.calls[0][0];
    expect(result.success).toBe(true);
    expect(result.data.every((lead: any) => lead.assignedEmployeeId === 'emp-1')).toBe(true);
  });

  it('returns only TEAM Leads for a Sales Manager and fails closed without team metadata', async () => {
    const json = mock((value: any) => value);
    const status = mock((_code: number) => ({ json }));
    await getHandler()({ user: { employeeId: 'manager-1', role: 'Sales Manager', salesTeamId: 'sales-team-1' } } as any, { json, status } as any, () => {});
    expect(json.mock.calls[0][0].data.every((lead: any) => lead.salesTeamId === 'sales-team-1')).toBe(true);

    json.mockClear();
    await getHandler()({ user: { employeeId: 'manager-1', role: 'Sales Manager' } } as any, { json, status } as any, () => {});
    expect(status).toHaveBeenCalledWith(403);
    expect(json.mock.calls[0][0].code).toBe('MISSING_TEAM_METADATA');
  });
});

describe('GET /api/leads/customer-matches', () => {
  it('matches authoritative Customers by normalized phone without silently linking them', async () => {
    const json = mock((value: any) => value);
    const status = mock((_code: number) => ({ json }));
    const postRoute = (leadsRouter as any).stack.find((entry: any) => entry.route?.path === '/' && entry.route.methods.post);
    const actor = { employeeId: 'emp-1', role: 'Sales Executive', name: 'John', salesTeamId: 'sales-team-1' };
    await postRoute.route.stack[1].handle({
      user: actor,
      body: { customerName: 'Normalized Match', customerPhone: '+91 98765-43333', destination: 'General', sourceId: 'DIRECT_CALL', creationRequestId: 'customer-match-001' },
    } as any, { json, status } as any, () => {});
    const created = json.mock.calls[0][0].data;

    json.mockClear(); status.mockClear();
    const matchRoute = (leadsRouter as any).stack.find((entry: any) => entry.route?.path === '/customer-matches' && entry.route.methods.get);
    await matchRoute.route.stack[1].handle({ user: actor, query: { phone: '919876543333' } } as any, { json, status } as any, () => {});
    const result = json.mock.calls[0][0];
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({ id: created.customerId, name: 'Normalized Match' });
    expect(result.data[0].normalizedPhone).toBeUndefined();
  });
});

describe('PATCH /api/leads/:id', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let jsonMock: any;
  let statusMock: any;

  beforeEach(() => {
    jsonMock = mock((data: any) => data);
    statusMock = mock((code: number) => ({ json: jsonMock }));
    req = {
      params: { id: 'lead-1' },
      user: { id: 'emp-1', employeeId: 'emp-1', role: 'Sales Executive' } as any,
      body: {}
    };
    res = { json: jsonMock, status: statusMock };
  });

  afterEach(() => { mock.restore(); });

  it('updates allowed fields and logs audit event', async () => {
    req.body = { status: 'CONTACTED' };
    const route = (leadsRouter as any).stack.find((r: any) => r.route && r.route.path === '/:id' && r.route.methods.patch);
    const handler = route.route.stack[1].handle;
    await handler(req as Request, res as Response, () => {});
    
    expect(jsonMock).toHaveBeenCalled();
    const result = jsonMock.mock.calls[0][0];
    expect(result.success).toBe(true);
    expect(result.data.status).toBe('CONTACTED');
  });

  it('blocks IDOR for Sales Executive', async () => {
    req.user = { id: 'compatibility-id', employeeId: 'emp-2', role: 'Sales Executive' } as any; // Not assigned
    req.body = { status: 'CONTACTED' };
    const route = (leadsRouter as any).stack.find((r: any) => r.route && r.route.path === '/:id' && r.route.methods.patch);
    const handler = route.route.stack[1].handle;
    await handler(req as Request, res as Response, () => {});
    
    expect(statusMock).toHaveBeenCalledWith(403);
  });

  it('strips protected fields', async () => {
    req.body = { status: 'IN_PROGRESS', protectedField: 'hacked' };
    const route = (leadsRouter as any).stack.find((r: any) => r.route && r.route.path === '/:id' && r.route.methods.patch);
    const handler = route.route.stack[1].handle;
    await handler(req as Request, res as Response, () => {});
    
    const result = jsonMock.mock.calls[0][0];
    expect(result.data.protectedField).toBe('secret'); // unchanged
  });

  it('rejects non-canonical stages and requires a controlled drop reason', async () => {
    const route = (leadsRouter as any).stack.find((entry: any) => entry.route?.path === '/:id' && entry.route.methods.patch);
    req.body = { status: 'QUALIFIED' };
    await route.route.stack[1].handle(req as Request, res as Response, () => {});
    expect(statusMock).toHaveBeenCalledWith(400);
    expect(jsonMock.mock.calls[0][0].code).toBe('INVALID_LEAD_STAGE');

    jsonMock.mockClear(); statusMock.mockClear();
    req.body = { status: 'DROPPED' };
    await route.route.stack[1].handle(req as Request, res as Response, () => {});
    expect(statusMock).toHaveBeenCalledWith(400);
    expect(jsonMock.mock.calls[0][0].code).toBe('DROP_REASON_REQUIRED');

    jsonMock.mockClear(); statusMock.mockClear();
    req.body = { status: 'DROPPED', dropReason: 'BUDGET_MISMATCH' };
    await route.route.stack[1].handle(req as Request, res as Response, () => {});
    expect(jsonMock.mock.calls[0][0].data).toMatchObject({ status: 'DROPPED', dropReason: 'BUDGET_MISMATCH' });
  });

  it('rejects client-forged ownership and team metadata', async () => {
    req.body = { salesTeamId: 'forged-team', assignedEmployeeName: 'Forged Owner', updatedByEmployeeId: 'forged-actor' };
    const route = (leadsRouter as any).stack.find((entry: any) => entry.route?.path === '/:id' && entry.route.methods.patch);
    await route.route.stack[1].handle(req as Request, res as Response, () => {});
    expect(statusMock).toHaveBeenCalledWith(400);
    expect(jsonMock.mock.calls[0][0].code).toBe('PROTECTED_LEAD_FIELD');
  });
});
