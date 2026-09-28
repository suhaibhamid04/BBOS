import { describe, expect, it, mock } from 'bun:test';
import type { NextFunction, Request, Response } from 'express';
import { accommodationRouter } from '../../server/routes/accommodation';

function response() {
  let statusCode = 200;
  const value: Partial<Response> = {};
  value.status = mock((status: number) => { statusCode = status; return value as Response; }) as any;
  value.json = mock(() => value as Response) as any;
  return { value: value as Response, status: () => statusCode };
}

describe('UX1 accommodation mutation route authority', () => {
  const createGuard = (accommodationRouter as any).stack.find(
    (layer: any) => layer.route?.path === '/properties' && layer.route.methods.post,
  ).route.stack[0].handle;

  it('allows Founder/Admin through the property mutation guard', () => {
    for (const role of ['Founder', 'Admin']) {
      const next = mock(() => undefined) as unknown as NextFunction;
      createGuard({ user: { role } } as Request, response().value, next);
      expect(next).toHaveBeenCalledTimes(1);
    }
  });

  it('denies Operations and Reservations before a property write handler runs', () => {
    for (const role of ['Operations', 'Reservations']) {
      const result = response();
      const next = mock(() => undefined) as unknown as NextFunction;
      createGuard({ user: { role } } as Request, result.value, next);
      expect(next).not.toHaveBeenCalled();
      expect(result.status()).toBe(403);
    }
  });
});
