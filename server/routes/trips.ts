import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/auth.js';
import { getAdminDb } from '../firebaseAdmin.js';
import { APP_CONFIG } from '../../src/config.js';

// Accommodation
import { DEMO_ACCOMMODATION_PROPERTIES, DEMO_ROOM_CATEGORIES, DEMO_RATE_PERIODS } from '../../src/services/accommodationDemoData.js';
import { calculateStayTotal, buildRoleGatedResult } from '../../src/services/accommodationEngine.js';
import { AccommodationProperty, RatePeriod, RoomCategory } from '../../src/types/accommodation.js';
import { sanitizeFinancialData } from '../middleware/financialGuard.js';

// Transport
import { DEMO_TRANSPORT_RATE_PERIODS, DEMO_TRANSPORT_SUPPLEMENTS } from '../../src/services/transportDemoData.js';
import { calculateTransportCost } from '../../src/services/transportEngine.js';

// Activity
import { DEMO_ACTIVITY_RATE_PERIODS } from '../../src/services/activityDemoData.js';
import { calculateActivityCost } from '../../src/services/activityEngine.js';

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

        // Find the rate period (Query Firestore in production)
        let ratePeriodsForRoom: RatePeriod[] = [];
        let roomCategories: RoomCategory[] = [];
        let allRatePeriods: RatePeriod[] = [];
        
        if (APP_CONFIG.DEMO_MODE) {
          ratePeriodsForRoom = DEMO_RATE_PERIODS.filter(rp => rp.propertyId === propertyId && rp.roomCategoryId === roomCategoryId);
          roomCategories = DEMO_ROOM_CATEGORIES;
          allRatePeriods = DEMO_RATE_PERIODS;
        } else {
          const db = getAdminDb();
          const qs = await db.collection('rate_periods').where('propertyId', '==', propertyId).where('roomCategoryId', '==', roomCategoryId).get();
          ratePeriodsForRoom = qs.docs.map(d => d.data() as RatePeriod);
          
          const rcSnap = await db.collection('room_categories').get();
          roomCategories = rcSnap.docs.map(d => d.data() as RoomCategory);
          
          const allRpSnap = await db.collection('rate_periods').where('propertyId', '==', propertyId).get();
          allRatePeriods = allRpSnap.docs.map(d => d.data() as RatePeriod);
        }

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

        if (!activeRate) {
          throw new Error(`Missing active rate for room category ${roomCategoryId} on ${checkInDate}`);
        }

        const roomCategory = roomCategories.find(rc => rc.id === roomCategoryId);
        if (roomCategory) {
           const stayCalc = calculateStayTotal(
             roomCategory,
             allRatePeriods,
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
           } else {
             throw new Error(`Stay is unavailable for room category ${roomCategoryId}`);
           }
        } else {
          throw new Error(`Room category ${roomCategoryId} not found`);
        }
      } else if (item.type === 'TRANSPORT' && item.metadata) {
        // Phase 2B-4: Calculate Transport Cost
        const { vehicleCategoryId, startDate, vehicleDays, nightHalts, serviceType } = item.metadata;

        if (!vehicleCategoryId || !startDate || !vehicleDays) continue;

        // In production, query Firestore transport_rate_periods where vehicleCategoryId matches.
        let ratePeriods = [];
        let transportSupplements = [];
        if (APP_CONFIG.DEMO_MODE) {
          ratePeriods = DEMO_TRANSPORT_RATE_PERIODS.filter(rp => rp.vehicleCategoryId === vehicleCategoryId);
          transportSupplements = DEMO_TRANSPORT_SUPPLEMENTS;
        } else {
          const db = getAdminDb();
          const qs = await db.collection('transport_rate_periods').where('vehicleCategoryId', '==', vehicleCategoryId).get();
          ratePeriods = qs.docs.map(d => d.data() as any);
          
          const suppSnap = await db.collection('transport_supplements').get();
          transportSupplements = suppSnap.docs.map(d => d.data() as any);
        }

        const targetDate = new Date(startDate);

        let activeRate = null;
        for (const rp of ratePeriods) {
          const from = new Date(rp.validFrom);
          const to = rp.validTo ? new Date(rp.validTo) : new Date('2099-12-31');
          if (targetDate >= from && targetDate <= to) {
            activeRate = rp;
            break;
          }
        }

        if (!activeRate) {
          throw new Error(`Missing active transport rate for category ${vehicleCategoryId} on ${startDate}`);
        }

        const transportCalc = calculateTransportCost({
          ratePeriod: activeRate,
          supplements: transportSupplements,
          serviceParams: {
            vehicleDays,
            nightHalts: nightHalts || 0
          }
        });

        if (transportCalc.available && transportCalc.totalAmount) {
           totalTripCost += transportCalc.totalAmount;
        } else {
           throw new Error(`Transport is unavailable for category ${vehicleCategoryId}`);
        }

      } else if (item.type === 'ACTIVITY' && item.metadata) {
         // Phase 2B-4: Calculate Activity Cost
         const { activityId, date, adults, children } = item.metadata;

         if (!activityId || !date) continue;

         // In production, query Firestore activity_rate_periods where activityId matches.
         let ratePeriods = [];
         if (APP_CONFIG.DEMO_MODE) {
           ratePeriods = DEMO_ACTIVITY_RATE_PERIODS.filter(rp => rp.activityId === activityId);
         } else {
           const db = getAdminDb();
           const qs = await db.collection('activity_rate_periods').where('activityId', '==', activityId).get();
           ratePeriods = qs.docs.map(d => d.data() as any);
         }

         const targetDate = new Date(date);

         let activeRate = null;
         for (const rp of ratePeriods) {
           const from = new Date(rp.validFrom);
           const to = rp.validTo ? new Date(rp.validTo) : new Date('2099-12-31');
           if (targetDate >= from && targetDate <= to) {
             activeRate = rp;
             break;
           }
         }

         if (!activeRate) {
           throw new Error(`Missing active activity rate for ${activityId} on ${date}`);
         }

         const activityCalc = calculateActivityCost({
           ratePeriod: activeRate,
           params: { adults, children }
         });

         if (activityCalc.available && activityCalc.totalAmount) {
           totalTripCost += activityCalc.totalAmount;
         } else {
           throw new Error(`Activity is unavailable for ${activityId}`);
         }
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
        totalSupplierCost: totalTripCost,
        grossProfit,
        grossMargin,
        updatedAt: new Date().toISOString()
      });
    } catch (dbErr) {
      // If running locally without credentials in Demo Mode, this naturally skips writing to Firestore.
      console.warn('Could not write to Admin DB (expected in DEMO_MODE without credentials)', (dbErr as Error).message);
    }

    // Return the response.
    const responseData = {
      totalSupplierCost: totalTripCost,
      grossProfit,
      grossMargin
    };

    return res.json({
      success: true,
      data: sanitizeFinancialData(responseData, currentUser.role)
    });

  } catch (error: any) {
    console.error('API Error in /trips/calculate-costs:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

tripsRouter.get('/', requireRole(['Founder', 'Admin', 'Accounts', 'Operations', 'Sales Manager', 'Sales Executive']), async (req: Request, res: Response) => {
  try {
    let trips = [];
    if (APP_CONFIG.DEMO_MODE) {
      // In a real app we'd import DEMO_TRIPS, but since it's not easily available here, we'll return empty 
      // array or rely on the frontend's DEMO_MODE fallback.
      // Wait, DataContext.tsx uses localStorage or DEMO_TRIPS directly. So if it calls the API, it's NOT DEMO_MODE.
    }
    
    const db = getAdminDb();
    const snapshot = await db.collection('trips').get();
    trips = snapshot.docs.map(doc => {
      const data = doc.data();
      if ('totalCost' in data) {
        data.totalSupplierCost = data.totalCost;
        delete data.totalCost;
      }
      return { id: doc.id, ...data };
    });

    // For Sales Executives, filter to assigned trips? The firestore rules did not filter trips by assignee, so we return all.
    
    res.json({
      success: true,
      data: sanitizeFinancialData(trips, req.user!.role)
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch trips' });
  }
});
