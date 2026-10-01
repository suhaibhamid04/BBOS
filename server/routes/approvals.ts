import { Router, type Request, type Response } from 'express';
import { requireRole } from '../middleware/auth.js';
import {
  ApprovalInboxError,
  InMemoryApprovalInboxStorage,
  ApprovalInboxService,
  type ApprovalInboxActor,
} from '../services/approvalInboxService.js';
import { LiveOperationsError } from '../services/liveOperationsService.js';
import { APP_CONFIG } from '../../src/config.js';

export const approvalsRouter = Router();
const approvalInboxService = new ApprovalInboxService(
  APP_CONFIG.DEMO_MODE
    ? new InMemoryApprovalInboxStorage({
        bookings: [],
        emergencySpends: [],
        supplierRateDiscrepancies: [],
        operationalChanges: [],
        quotes: [],
      })
    : undefined,
);

const INBOX_ROLES = [
  'Founder', 'Admin', 'Accounts', 'Sales Manager', 'Sales Executive', 'Reservations', 'Operations',
] as const;

function actorFromRequest(req: Request): ApprovalInboxActor {
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

function handleError(error: unknown, res: Response, context: string) {
  if (error instanceof ApprovalInboxError || error instanceof LiveOperationsError) {
    return res.status(error.statusCode).json({ error: error.message, code: error.code });
  }
  console.error(`API Error in ${context}:`, error);
  return res.status(500).json({ error: 'Internal Server Error', code: 'APPROVAL_INBOX_FAILED' });
}

approvalsRouter.get(
  '/',
  requireRole([...INBOX_ROLES]),
  async (req: Request, res: Response) => {
    try {
      const data = await approvalInboxService.getInbox(actorFromRequest(req));
      return res.status(200).json({ success: true, data });
    } catch (error) {
      return handleError(error, res, 'GET /approvals');
    }
  },
);

approvalsRouter.get(
  '/summary',
  requireRole([...INBOX_ROLES]),
  async (req: Request, res: Response) => {
    try {
      const data = await approvalInboxService.getInbox(actorFromRequest(req));
      return res.status(200).json({ success: true, data: data.summary });
    } catch (error) {
      return handleError(error, res, 'GET /approvals/summary');
    }
  },
);

approvalsRouter.patch(
  '/:itemId/decision',
  requireRole(['Founder', 'Admin', 'Accounts']),
  async (req: Request, res: Response) => {
    try {
      const data = await approvalInboxService.decide(req.params.itemId, req.body, actorFromRequest(req));
      return res.status(200).json({ success: true, data });
    } catch (error) {
      return handleError(error, res, 'PATCH /approvals/:itemId/decision');
    }
  },
);
