import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/auth.js';
import { calculateTransportCost, buildRoleGatedTransportResult } from '../../src/services/transportEngine.js';
import { DEMO_TRANSPORT_RATE_PERIODS, DEMO_TRANSPORT_SUPPLEMENTS } from '../../src/services/transportDemoData.js';
import { APP_CONFIG } from '../../src/config.js';

export const transportRouter = Router();

transportRouter.post('/calculate-rate', async (req: Request, res: Response) => {
  try {
    const {
      vehicleCategoryId,
      startDate,
      serviceType,
      vehicleDays,
      nightHalts,
      occurrences,
      distanceKm,
      hours
    } = req.body;

    const userRole = req.user!.role;

    if (!vehicleCategoryId || !startDate || !serviceType) {
      return res.status(400).json({ error: 'vehicleCategoryId, startDate, and serviceType are required' });
    }

    let ratePeriods = [];
    let supplements = [];

    if (APP_CONFIG.DEMO_MODE) {
      ratePeriods = DEMO_TRANSPORT_RATE_PERIODS;
      supplements = DEMO_TRANSPORT_SUPPLEMENTS;
    } else {
      // Fetch from DB in production
      ratePeriods = []; // await TransportRatePeriodRepo.getAll();
      supplements = []; // await TransportSupplementRepo.getAll();
    }

    const ratesForCategory = ratePeriods.filter(
      rp => rp.vehicleCategoryId === vehicleCategoryId && rp.serviceType === serviceType
    );
    const targetDate = new Date(startDate);
    
    let activeRate = null;
    for (const rp of ratesForCategory) {
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
          error: 'No active rate found for the specified category, service type, and date.'
        }
      });
    }

    const calculationResult = calculateTransportCost({
      ratePeriod: activeRate,
      supplements,
      serviceParams: {
        vehicleDays: vehicleDays || 1,
        nightHalts: nightHalts || 0,
        occurrences: occurrences || 1,
        distanceKm: distanceKm || 0,
        hours: hours || 0
      }
    });

    const safeResult = buildRoleGatedTransportResult(calculationResult, userRole);
    
    res.json({
      success: true,
      data: {
        ...safeResult,
        baseSupplierCost: safeResult.breakdown?.baseVehicleCost,
        supplementCost: safeResult.breakdown?.additionalChargesTotal,
        supplierCost: safeResult.totalAmount, // This will be undefined for Sales Execs
        availabilityStatus: activeRate.availabilityStatus,
        needsConfirmation: activeRate.availabilityStatus === 'NEEDS_CONFIRMATION' || activeRate.availabilityStatus === 'ON_REQUEST',
        taxDescription: 'GST INCLUDED'
      }
    });

  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to calculate transport rate' });
  }
});
