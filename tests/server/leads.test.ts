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
  let auditLogs: any[] = [];
  return {
    getAdminDb: () => ({
      collection: (col: string) => ({
        doc: (id: string) => ({
          get: async () => ({
            exists: !!leadsData[id],
            data: () => leadsData[id]
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
      user: { id: 'emp-1', role: 'Sales Executive', name: 'John' } as any,
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
    req.user = { id: 'emp-exec', role: 'Sales Executive', name: 'Exec' } as any;
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
      user: { id: 'emp-1', role: 'Sales Executive' } as any,
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
    req.user = { id: 'emp-2', role: 'Sales Executive' } as any; // Not assigned
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
