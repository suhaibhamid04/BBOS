import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';
import { accommodationRouter } from '../../server/routes/accommodation';
import { Request, Response } from 'express';
import { getAdminDb } from '../../server/firebaseAdmin';

mock.module('../../server/firebaseAdmin.ts', () => {
  let accData: any = {
    'accom-1': {
      id: 'accom-1',
      name: 'Old Name',
      financialSecret: 'secret'
    }
  };
  let auditLogs: any[] = [];
  return {
    getAdminDb: () => ({
      collection: (col: string) => ({
        doc: (id: string) => ({
          get: async () => ({
            exists: !!accData[id],
            data: () => accData[id]
          }),
          update: async (updates: any) => {
            if (col === 'accommodation_properties') {
              accData[id] = { ...accData[id], ...updates };
            }
          },
          set: async (data: any) => {
            if (col === 'accommodation_properties') {
              accData[data.id] = data;
            } else if (col === 'audit_logs') {
              auditLogs.push(data);
            }
          }
        })
      })
    })
  };
});

describe('POST /api/accommodation/properties', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let jsonMock: any;
  let statusMock: any;

  beforeEach(() => {
    jsonMock = mock((data: any) => data);
    statusMock = mock((code: number) => ({ json: jsonMock }));
    req = {
      user: { id: 'emp-1', role: 'Operations' } as any,
      body: {}
    };
    res = { json: jsonMock, status: statusMock };
  });

  afterEach(() => { mock.restore(); });

  it('creates property and strips financial fields', async () => {
    req.body = { name: 'New Hotel', financialSecret: 'hacked' };
    
    // Find POST route handler
    const route = (accommodationRouter as any).stack.find((r: any) => r.route && r.route.path === '/properties' && r.route.methods.post);
    const handler = route.route.stack[1].handle;
    
    await handler(req as Request, res as Response, () => {});
    
    expect(jsonMock).toHaveBeenCalled();
    const result = jsonMock.mock.calls[0][0];
    expect(result.success).toBe(true);
    expect(result.data.name).toBe('New Hotel');
    expect(result.data.financialSecret).toBeUndefined();
  });
});

describe('PATCH /api/accommodation/properties/:id', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let jsonMock: any;
  let statusMock: any;

  beforeEach(() => {
    jsonMock = mock((data: any) => data);
    statusMock = mock((code: number) => ({ json: jsonMock }));
    req = {
      params: { id: 'accom-1' },
      user: { id: 'emp-1', role: 'Operations' } as any,
      body: {}
    };
    res = { json: jsonMock, status: statusMock };
  });

  afterEach(() => { mock.restore(); });

  it('updates allowed fields', async () => {
    req.body = { name: 'Updated Name' };
    
    // Find PATCH route handler
    const route = (accommodationRouter as any).stack.find((r: any) => r.route && r.route.path === '/properties/:id' && r.route.methods.patch);
    const handler = route.route.stack[1].handle;
    
    await handler(req as Request, res as Response, () => {});
    
    expect(jsonMock).toHaveBeenCalled();
    const result = jsonMock.mock.calls[0][0];
    expect(result.success).toBe(true);
    expect(result.data.name).toBe('Updated Name');
  });
});
