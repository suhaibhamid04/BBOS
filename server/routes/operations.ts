import { Router, type Request, type Response } from 'express';
import { requireRole } from '../middleware/auth.js';
import {
  OperationsControlRoomError,
  OperationsControlRoomService,
  type OperationsActor,
} from '../services/operationsControlRoomService.js';
import {
  LiveOperationsError,
  LiveOperationsService,
  type LiveOperationsActor,
} from '../services/liveOperationsService.js';
import { APP_CONFIG } from '../../src/config.js';
import { demoOperationsStorage } from '../services/demoBookingWorkflow.js';

export const operationsRouter = Router();
const controlRoomService = new OperationsControlRoomService(
  APP_CONFIG.DEMO_MODE ? demoOperationsStorage : undefined,
);
const liveOperationsService = new LiveOperationsService();

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
  if (error instanceof OperationsControlRoomError || error instanceof LiveOperationsError) {
    return res.status(error.statusCode).json({
      error: error.message,
      code: error.code,
      ...(error instanceof OperationsControlRoomError && error.details ? { details: error.details } : {}),
    });
  }
  console.error(`API Error in ${context}:`, error);
  return res.status(500).json({ error: 'Internal Server Error', code: 'OPERATIONS_CONTROL_ROOM_FAILED' });
}

const liveActorFromRequest = (req: Request): LiveOperationsActor => actorFromRequest(req);

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

operationsRouter.post(
  '/bookings/:bookingId/issues',
  requireRole(['Founder', 'Admin', 'Operations']),
  async (req: Request, res: Response) => {
    try {
      const data = await liveOperationsService.createIssue(req.params.bookingId, req.body, liveActorFromRequest(req));
      return res.status(201).json({ success: true, data });
    } catch (error) {
      return handleOperationsError(error, res, 'POST /operations/bookings/:bookingId/issues');
    }
  },
);

operationsRouter.patch(
  '/bookings/:bookingId/issues/:issueId',
  requireRole(['Founder', 'Admin', 'Operations']),
  async (req: Request, res: Response) => {
    try {
      const data = await liveOperationsService.updateIssue(
        req.params.bookingId,
        req.params.issueId,
        req.body,
        liveActorFromRequest(req),
      );
      return res.status(200).json({ success: true, data });
    } catch (error) {
      return handleOperationsError(error, res, 'PATCH /operations/bookings/:bookingId/issues/:issueId');
    }
  },
);

operationsRouter.post(
  '/bookings/:bookingId/change-requests',
  requireRole(['Founder', 'Admin', 'Operations']),
  async (req: Request, res: Response) => {
    try {
      const data = await liveOperationsService.createChangeRequest(req.params.bookingId, req.body, liveActorFromRequest(req));
      return res.status(201).json({ success: true, data });
    } catch (error) {
      return handleOperationsError(error, res, 'POST /operations/bookings/:bookingId/change-requests');
    }
  },
);

operationsRouter.post(
  '/bookings/:bookingId/spend-requests',
  requireRole(['Founder', 'Admin', 'Operations']),
  async (req: Request, res: Response) => {
    try {
      const data = await liveOperationsService.requestSpend(req.params.bookingId, req.body, liveActorFromRequest(req));
      return res.status(201).json({ success: true, data });
    } catch (error) {
      return handleOperationsError(error, res, 'POST /operations/bookings/:bookingId/spend-requests');
    }
  },
);

operationsRouter.get(
  '/spend-requests',
  requireRole(['Founder', 'Admin', 'Accounts', 'Operations']),
  async (req: Request, res: Response) => {
    try {
      const data = await liveOperationsService.listSpendRequests(liveActorFromRequest(req));
      return res.status(200).json({ success: true, data });
    } catch (error) {
      return handleOperationsError(error, res, 'GET /operations/spend-requests');
    }
  },
);

operationsRouter.patch(
  '/spend-requests/:requestId/decision',
  requireRole(['Founder', 'Admin', 'Accounts']),
  async (req: Request, res: Response) => {
    try {
      const data = await liveOperationsService.decideSpend(req.params.requestId, req.body, liveActorFromRequest(req));
      return res.status(200).json({ success: true, data });
    } catch (error) {
      return handleOperationsError(error, res, 'PATCH /operations/spend-requests/:requestId/decision');
    }
  },
);
