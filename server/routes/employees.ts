import { Router, type Request, type Response } from 'express';
import { requireRole } from '../middleware/auth.js';
import {
  EmployeeManagementError,
  EmployeeManagementService,
  type EmployeeManagementActor,
} from '../services/employeeManagementService.js';

export const employeesRouter = Router();
const employeeManagementService = new EmployeeManagementService();
const employeeAdminRoles = ['Founder', 'Admin'] as const;

function actorFromRequest(req: Request): EmployeeManagementActor {
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

function handleEmployeeError(error: unknown, res: Response, context: string) {
  if (error instanceof EmployeeManagementError) {
    return res.status(error.statusCode).json({
      error: error.message,
      code: error.code,
      ...(error.details ? { details: error.details } : {}),
    });
  }
  console.error(`API Error in ${context}:`, error);
  return res.status(500).json({ error: 'Internal Server Error', code: 'EMPLOYEE_MANAGEMENT_FAILED' });
}

employeesRouter.get(
  '/',
  requireRole([...employeeAdminRoles]),
  async (req: Request, res: Response) => {
    try {
      const result = await employeeManagementService.listEmployees(actorFromRequest(req));
      return res.status(200).json({ success: true, data: result.employees, teams: result.teams });
    } catch (error) {
      return handleEmployeeError(error, res, 'GET /employees');
    }
  },
);

employeesRouter.get(
  '/:employeeId',
  requireRole([...employeeAdminRoles]),
  async (req: Request, res: Response) => {
    try {
      const employee = await employeeManagementService.getEmployee(
        req.params.employeeId,
        actorFromRequest(req),
      );
      return res.status(200).json({ success: true, data: employee });
    } catch (error) {
      return handleEmployeeError(error, res, 'GET /employees/:employeeId');
    }
  },
);

employeesRouter.post(
  '/',
  requireRole([...employeeAdminRoles]),
  async (req: Request, res: Response) => {
    try {
      const employee = await employeeManagementService.createEmployee(req.body, actorFromRequest(req));
      return res.status(201).json({ success: true, data: employee });
    } catch (error) {
      return handleEmployeeError(error, res, 'POST /employees');
    }
  },
);

employeesRouter.patch(
  '/:employeeId',
  requireRole([...employeeAdminRoles]),
  async (req: Request, res: Response) => {
    try {
      const employee = await employeeManagementService.updateEmployee(
        req.params.employeeId,
        req.body,
        actorFromRequest(req),
      );
      return res.status(200).json({ success: true, data: employee });
    } catch (error) {
      return handleEmployeeError(error, res, 'PATCH /employees/:employeeId');
    }
  },
);
