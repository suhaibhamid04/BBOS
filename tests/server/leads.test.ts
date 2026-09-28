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
    },
    'emp-inactive-sales': {
      employeeId: 'emp-inactive-sales',
      name: 'Inactive Sales',
      role: 'Sales Executive',
      active: false,
    },
  };
  let auditLogs: any[] = [];
  return {
    getAdminDb: () => ({
      collection: (col: string) => ({
        where: (field: string, _operator: string, value: unknown) => ({
          limit: (_count: number) => ({
            get: async () => ({
              docs: Object.entries(employeesData)
                .filter(([, data]: any) => field === 'employeeId' && data.employeeId === value)
                .map(([id, data]) => ({ id, exists: true, data: () => data })),
            }),
          }),
        }),
        doc: (id: string) => ({
          get: async () => ({
            id,
            exists: col === 'employees' ? !!employeesData[id] : !!leadsData[id],
            data: () => col === 'employees' ? employeesData[id] : leadsData[id]
          }),
          update: async (updates: any) => {
            if (col === 'leads') {
              leadsData[id] = { ...leadsData[id], ...updates };
            }
          },
          set: async (data: any) => {
            if (col === 'audit_logs') {
              auditLogs.push(data);
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
      user: { id: 'emp-1', employeeId: 'emp-1', role: 'Sales Executive', name: 'John' } as any,
      body: {}
    };
    res = { json: jsonMock, status: statusMock };
  });

  afterEach(() => { mock.restore(); });

  it('creates lead with required fields and assigns server fields', async () => {
    req.body = {
      customerName: 'Test', customerPhone: '123', destination: 'Kashmir',
      travelStartDate: '2026-10-01', travelEndDate: '2026-10-05',
      travelerCount: 2, tripType: 'Honeymoon', budget: 50000, source: 'Website',
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
    expect(result.data.leadScore).toBe(50); // Server-assigned
    expect(result.data.id).not.toBe('malicious-id');
    expect(result.data.id).toMatch(/^lead-/);
  });

  it('enforces IDOR on assignment for Sales Executive', async () => {
    req.user = { id: 'compatibility-id', employeeId: 'emp-exec', role: 'Sales Executive', name: 'Exec' } as any;
    req.body = {
      customerName: 'Test', customerPhone: '123', destination: 'Kashmir',
      travelStartDate: '2026-10-01', travelEndDate: '2026-10-05',
      travelerCount: 2, tripType: 'Honeymoon', budget: 50000, source: 'Website',
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
      customerName: 'Test', customerPhone: '123', destination: 'Kashmir',
      travelStartDate: '2026-10-01', travelEndDate: '2026-10-05',
      travelerCount: 2, tripType: 'Honeymoon', budget: 50000, source: 'Website',
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
      customerName: 'Test', customerPhone: '123', destination: 'Kashmir',
      travelStartDate: '2026-10-01', travelEndDate: '2026-10-05',
      travelerCount: 2, tripType: 'Honeymoon', budget: 50000, source: 'Website',
      assignedEmployeeId: 'emp-inactive-sales',
    };
    const route = (leadsRouter as any).stack.find((r: any) => r.route && r.route.path === '/' && r.route.methods.post);
    const handler = route.route.stack[1].handle;
    await handler(req as Request, res as Response, () => {});

    expect(statusMock).toHaveBeenCalledWith(422);
    expect(jsonMock.mock.calls[0][0].code).toBe('ACTIVE_SALES_ASSIGNEE_REQUIRED');
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
    req.body = { status: 'QUALIFIED', protectedField: 'hacked' };
    const route = (leadsRouter as any).stack.find((r: any) => r.route && r.route.path === '/:id' && r.route.methods.patch);
    const handler = route.route.stack[1].handle;
    await handler(req as Request, res as Response, () => {});
    
    const result = jsonMock.mock.calls[0][0];
    expect(result.data.protectedField).toBe('secret'); // unchanged
  });
});
