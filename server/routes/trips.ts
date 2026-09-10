import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/auth.js';
import { getAdminDb } from '../firebaseAdmin.js';
import { DEMO_ACCOMMODATION_PROPERTIES, DEMO_ROOM_CATEGORIES, DEMO_RATE_PERIODS } from '../../src/services/accommodationDemoData.js';
import { calculateStayTotal, buildRoleGatedResult } from '../../src/services/accommodationEngine.js';
import { AccommodationProperty, RatePeriod, RoomCategory } from '../../src/types/accommodation.js';
import { ItineraryItem } from '../../src/types/index.js';

export const tripsRouter = Router();

tripsRouter.post('/calculate-costs', async (req: Request, res: Response) => {
  try {
    const { tripId, items, totalSellingPrice } = req.body;

    if (!tripId) {
      return res.status(400).json({ error: 'Trip ID is required' });
    }

    const currentUser = req.user!;
    let totalTripCost = 0;

    // We process each item, calculate its true cost independently of what the client sends
    for (const item of items as ItineraryItem[]) {
      if (item.type === 'HOTEL' && item.metadata) {
        const { propertyId, roomCategoryId, checkInDate, nights, adults, children, childrenWithBed, childrenWithoutBed, mealPlan } = item.metadata;

        if (!propertyId || !checkInDate || !nights) continue;

        // Find the rate period (In production, this would query Firestore. For demo, we use the local data)
        const ratePeriodsForRoom = DEMO_RATE_PERIODS.filter(rp => rp.propertyId === propertyId && rp.roomCategoryId === roomCategoryId);
        const targetDate = new Date(checkInDate);
        
        let activeRate: RatePeriod | null = null;
        for (const rp of ratePeriodsForRoom) {
          const from = new Date(rp.validFrom);
          const to = rp.validTo ? new Date(rp.validTo) : new Date('2099-12-31');
          if (targetDate >= from && targetDate <= to) {
            activeRate = rp;
            break;
          }
        }

        if (activeRate) {
          const roomCategory = DEMO_ROOM_CATEGORIES.find(rc => rc.id === roomCategoryId);
          if (roomCategory) {
             const stayCalc = calculateStayTotal(
               roomCategory,
               DEMO_RATE_PERIODS,
               propertyId,
               checkInDate,
               nights,
               adults || 2,
               children || 0,
               childrenWithBed || 0,
               childrenWithoutBed || 0,
               mealPlan
             );
             if (stayCalc.available && stayCalc.totalAmount) {
               totalTripCost += stayCalc.totalAmount;
             }
          }
        }
      } else {
         // For transports, activities, we would resolve authoritative cost here.
         // For this phase, we'll assume they aren't fully modelled in the engine yet or have 0 cost
         // or we fallback to the requested supplierCost if it's safe (which it's not, but out of scope for accommodation phase)
      }
    }

    // Calculate profit/margin
    let grossProfit: number | null = null;
    let grossMargin: number | null = null;

    if (typeof totalSellingPrice === 'number' && totalSellingPrice > 0) {
      grossProfit = totalSellingPrice - totalTripCost;
      grossMargin = Number(((grossProfit / totalSellingPrice) * 100).toFixed(1));
    }

    // Persist securely to Firestore bypassing client rules
    try {
      const db = getAdminDb();
      await db.collection('trips').doc(tripId).update({
        totalCost: totalTripCost,
        grossProfit,
        grossMargin,
        updatedAt: new Date().toISOString()
      });
    } catch (dbErr) {
      // If running locally without credentials in Demo Mode, this naturally skips writing to Firestore.
      console.warn('Could not write to Admin DB (expected in DEMO_MODE without credentials)', (dbErr as Error).message);
    }

    // Return the response. Sales Executive cannot see the financial metrics.
    if (currentUser.role === 'Sales Executive') {
      return res.json({
        success: true,
        message: 'Costs recalculated securely.'
      });
    }

    return res.json({
      success: true,
      data: {
        totalCost: totalTripCost,
        grossProfit,
        grossMargin
      }
    });

  } catch (error: any) {
    console.error('API Error in /trips/calculate-costs:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});
