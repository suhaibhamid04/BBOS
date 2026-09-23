import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/auth.js';
import { calculateActivityCost, buildRoleGatedActivityResult } from '../../src/services/activityEngine.js';
import { DEMO_ACTIVITY_RATE_PERIODS } from '../../src/services/activityDemoData.js';
import { APP_CONFIG } from '../../src/config.js';
import { sanitizeFinancialData } from '../middleware/financialGuard.js';

export const activitiesRouter = Router();

activitiesRouter.post('/calculate-rate', async (req: Request, res: Response) => {
  try {
    const {
      activityId,
      date,
      adults,
      children,
      infants,
      vehicles,
      groups,
      tickets,
      hours,
      days,
      sessions
    } = req.body;

    const userRole = req.user!.role;

    if (!activityId || !date) {
      return res.status(400).json({ error: 'activityId and date are required' });
    }

    let ratePeriods = [];

    if (APP_CONFIG.DEMO_MODE) {
      ratePeriods = DEMO_ACTIVITY_RATE_PERIODS;
    } else {
      // Fetch from DB in production
      ratePeriods = []; // await ActivityRatePeriodRepo.getAll();
    }

    const ratesForActivity = ratePeriods.filter(rp => rp.activityId === activityId);
    const targetDate = new Date(date);
    
    let activeRate = null;
    for (const rp of ratesForActivity) {
      const from = new Date(rp.validFrom);
      const to = rp.validTo ? new Date(rp.validTo) : new Date('2099-12-31');
      if (targetDate >= from && targetDate <= to) {
        activeRate = rp;
        break;
      }
    }

    if (!activeRate) {
      return res.json({
        success: true,
        data: {
          available: false,
          error: 'No active rate found for the specified activity and date.'
        }
      });
    }

    const calculationResult = calculateActivityCost({
      ratePeriod: activeRate,
      params: { adults, children, infants, vehicles, groups, tickets, hours, days, sessions }
    });

    const safeResult = buildRoleGatedActivityResult(calculationResult, userRole);
    
    res.json({
      success: true,
      data: sanitizeFinancialData({
        ...safeResult,
        supplierCost: safeResult.totalAmount, // This will be undefined for Sales Execs
        pricingModel: activeRate.pricingModel,
        needsConfirmation: activeRate.availabilityStatus === 'NEEDS_CONFIRMATION' || activeRate.availabilityStatus === 'ON_REQUEST',
        taxDescription: 'GST INCLUDED'
      }, userRole)
    });

  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to calculate activity rate' });
  }
});
