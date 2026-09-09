import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/auth.js';
import {
  calculateStayTotal,
  buildRoleGatedResult,
  canAccessRateData,
  canAccessNegotiatedRates,
  sanitizePropertyForRole
} from '../../src/services/accommodationEngine.js';
import { DEMO_RATE_PERIODS, DEMO_ACCOMMODATION_PROPERTIES, DEMO_ROOM_CATEGORIES } from '../../src/services/accommodationDemoData.js';
import { APP_CONFIG } from '../../src/config.js';

// We import the Firestore repos dynamically or directly to fetch rate data if not in DEMO mode.
// For now, if DEMO_MODE, we use demo data.
import {
  AccommodationPropertyRepo,
  RoomCategoryRepo,
  RatePeriodRepo,
  NegotiatedRateRepo
} from '../../src/services/db/repositories.js';

export const accommodationRouter = Router();

// ============================================================================
// PUBLIC INVENTORY (Authenticated only, no pricing)
// ============================================================================

accommodationRouter.get('/properties', async (req: Request, res: Response) => {
  try {
    let properties = [];
    if (APP_CONFIG.DEMO_MODE) {
      properties = DEMO_ACCOMMODATION_PROPERTIES;
    } else {
      properties = await AccommodationPropertyRepo.getAll();
    }
    
    // Sanitize properties (strip internalNotes for Sales/Marketing)
    const sanitized = properties.map(p => sanitizePropertyForRole(p, req.user!.role));
    res.json({ success: true, data: sanitized });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch properties' });
  }
});

accommodationRouter.get('/properties/:id', async (req: Request, res: Response) => {
  try {
    let property = null;
    if (APP_CONFIG.DEMO_MODE) {
      property = DEMO_ACCOMMODATION_PROPERTIES.find(p => p.id === req.params.id);
    } else {
      property = await AccommodationPropertyRepo.getById(req.params.id);
    }

    if (!property) return res.status(404).json({ error: 'Property not found' });
    
    res.json({ success: true, data: sanitizePropertyForRole(property, req.user!.role) });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch property' });
  }
});

accommodationRouter.get('/properties/:id/rooms', async (req: Request, res: Response) => {
  try {
    let rooms = [];
    if (APP_CONFIG.DEMO_MODE) {
      rooms = DEMO_ROOM_CATEGORIES.filter(r => r.propertyId === req.params.id);
    } else {
      const allRooms = await RoomCategoryRepo.getAll();
      rooms = allRooms.filter(r => r.propertyId === req.params.id);
    }
    res.json({ success: true, data: rooms });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch rooms' });
  }
});

// ============================================================================
// RATE CALCULATION ENGINE (Sales-safe response)
// ============================================================================

accommodationRouter.post('/calculate-rate', async (req: Request, res: Response) => {
  try {
    const {
      propertyId,
      roomCategoryId,
      checkInDate,
      nights,
      mealPlan,
      adults,
      children,
      childrenWithBed,
      childrenWithoutBed,
      useNegotiatedRate,
      negotiatedRateId
    } = req.body;

    const userRole = req.user!.role;

    // 1. Fetch Room Category
    let roomCategory = null;
    let propertyName = 'Unknown Property';
    let roomCategoryName = 'Unknown Room';

    if (APP_CONFIG.DEMO_MODE) {
      const prop = DEMO_ACCOMMODATION_PROPERTIES.find(p => p.id === propertyId);
      propertyName = prop ? prop.name : propertyName;
      roomCategory = DEMO_ROOM_CATEGORIES.find(r => r.id === roomCategoryId);
      roomCategoryName = roomCategory ? roomCategory.name : roomCategoryName;
    } else {
      const prop = await AccommodationPropertyRepo.getById(propertyId);
      if (prop) propertyName = prop.name;
      roomCategory = await RoomCategoryRepo.getById(roomCategoryId);
      if (roomCategory) roomCategoryName = roomCategory.name;
    }

    if (!roomCategory) {
      return res.status(404).json({ error: 'Room category not found' });
    }

    // 2. Fetch Rates (Server has Admin-level data access here)
    let standardRates = [];
    let negotiatedRates = [];
    
    if (APP_CONFIG.DEMO_MODE) {
      standardRates = DEMO_RATE_PERIODS.filter(r => r.propertyId === propertyId && r.roomCategoryId === roomCategoryId);
      negotiatedRates = []; // Add demo negotiated rates later if needed
    } else {
      const allRates = await RatePeriodRepo.getAll();
      standardRates = allRates.filter(r => r.propertyId === propertyId && r.roomCategoryId === roomCategoryId);
      
      const allNegRates = await NegotiatedRateRepo.getAll();
      negotiatedRates = allNegRates.filter(r => r.propertyId === propertyId && r.roomCategoryId === roomCategoryId);
    }

    // 3. Process Calculation
    let appliedStandardRate = null;
    let appliedNegotiatedRate = null;

    let stayCalc = calculateStayTotal(
      roomCategory,
      standardRates,
      propertyId,
      checkInDate,
      nights,
      adults,
      children,
      childrenWithBed,
      childrenWithoutBed,
      mealPlan
    );

    if (stayCalc.available && stayCalc.ratePeriodId) {
      appliedStandardRate = standardRates.find(r => r.id === stayCalc.ratePeriodId) || null;
    }

    // If a negotiated rate was requested AND user is authorized
    if (useNegotiatedRate && negotiatedRateId && canAccessNegotiatedRates(userRole)) {
      const negRate = negotiatedRates.find(nr => nr.id === negotiatedRateId);
      if (negRate) {
        // Build a mock RatePeriod from the NegotiatedRate for the engine
        const mockRatePeriod: any = {
          ...negRate,
          baseRate: negRate.negotiatedBaseRate,
          contractType: 'STANDARD' // Fake it for the calculator
        };
        
        // Re-calculate using the negotiated rate
        const negStayCalc = calculateStayTotal(
          roomCategory,
          [mockRatePeriod],
          propertyId,
          checkInDate,
          nights,
          adults,
          children,
          childrenWithBed,
          childrenWithoutBed,
          mealPlan
        );
        
        if (negStayCalc.available) {
          stayCalc = negStayCalc;
          appliedNegotiatedRate = negRate;
        }
      }
    }

    // 4. Role-Gated Sanitize (The Core Security Guarantee)
    const result = buildRoleGatedResult(
      stayCalc,
      appliedStandardRate,
      appliedNegotiatedRate,
      propertyName,
      roomCategoryName,
      userRole
    );

    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('API Error in /accommodation/calculate-rate:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

// ============================================================================
// PROTECTED RATE MANAGEMENT
// ============================================================================

accommodationRouter.get('/properties/:id/rates', 
  requireRole(['Founder', 'Admin', 'Accounts', 'Operations']),
  async (req: Request, res: Response) => {
    try {
      let rates = [];
      if (APP_CONFIG.DEMO_MODE) {
        rates = DEMO_RATE_PERIODS.filter(r => r.propertyId === req.params.id);
      } else {
        const allRates = await RatePeriodRepo.getAll();
        rates = allRates.filter(r => r.propertyId === req.params.id);
      }
      res.json({ success: true, data: rates });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to fetch rates' });
    }
});

accommodationRouter.get('/properties/:id/negotiated-rates', 
  requireRole(['Founder', 'Admin', 'Accounts']),
  async (req: Request, res: Response) => {
    try {
      let rates = [];
      if (APP_CONFIG.DEMO_MODE) {
        rates = []; 
      } else {
        const allRates = await NegotiatedRateRepo.getAll();
        rates = allRates.filter(r => r.propertyId === req.params.id);
      }
      res.json({ success: true, data: rates });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to fetch negotiated rates' });
    }
});
