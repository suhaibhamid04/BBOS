import { Router, type Request, type Response } from 'express';
import { requireRole } from '../middleware/auth.js';
import {
  OperationsControlRoomError,
  OperationsControlRoomService,
  type OperationsActor,
} from '../services/operationsControlRoomService.js';

export const operationsRouter = Router();
const controlRoomService = new OperationsControlRoomService();

function actorFromRequest(req: Request): OperationsActor {
  const actor = req.user!;
  return {
    firebaseUid: actor.firebaseUid,
    employeeId: actor.employeeId,
    role: actor.role,
    active: actor.active,
    name: actor.name,
    ...(actor.salesTeamId ? { salesTeamId: actor.salesTeamId } : {}),
    ...(actor.managerEmployeeId ? { managerEmployeeId: actor.managerEmployeeId } : {}),
    ...(actor.department ? { department: actor.department } : {}),
  };
}

function handleOperationsError(error: unknown, res: Response, context: string) {
  if (error instanceof OperationsControlRoomError) {
    return res.status(error.statusCode).json({
      error: error.message,
      code: error.code,
      ...(error.details ? { details: error.details } : {}),
    });
  }
  console.error(`API Error in ${context}:`, error);
  return res.status(500).json({ error: 'Internal Server Error', code: 'OPERATIONS_CONTROL_ROOM_FAILED' });
}

operationsRouter.get(
  '/control-room',
  requireRole(['Founder', 'Admin', 'Operations']),
  async (req: Request, res: Response) => {
    try {
      const data = await controlRoomService.getControlRoom(actorFromRequest(req));
      return res.status(200).json({ success: true, data });
    } catch (error) {
      return handleOperationsError(error, res, 'GET /operations/control-room');
    }
  },
);

operationsRouter.patch(
  '/bookings/:bookingId/assignment',
  requireRole(['Founder', 'Admin']),
  async (req: Request, res: Response) => {
    try {
      const data = await controlRoomService.assignOperations(
        req.params.bookingId,
        req.body,
        actorFromRequest(req),
      );
      return res.status(200).json({ success: true, data });
    } catch (error) {
      return handleOperationsError(error, res, 'PATCH /operations/bookings/:bookingId/assignment');
    }
  },
);
