import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/auth.js';
import { getAdminDb } from '../firebaseAdmin.js';
import { APP_CONFIG } from '../../src/config.js';
import { DEMO_TRIPS } from '../../src/services/demoData.js';
import { assertAuthorizedResource, ResourceAuthorizationError } from '../authorization/assertAuthorizedResource.js';
import { tripResourceContext } from '../authorization/resourceContext.js';
import { buildResourceDto } from '../authorization/resourceDto.js';
import { authorizeResource, resolveQueryScope } from '../authorization/policyEngine.js';
import {
  applyFirestoreQueryScope,
  assertRawListScope,
  assertReturnedRecordsAuthorized,
  parseScopedListOptions,
  scopeInMemoryRecords,
  ScopedListError,
} from '../authorization/scopedList.js';

// Accommodation
import { DEMO_ACCOMMODATION_PROPERTIES, DEMO_ROOM_CATEGORIES, DEMO_RATE_PERIODS } from '../../src/services/accommodationDemoData.js';
import { calculateStayTotal } from '../../src/services/accommodationEngine.js';
import { AccommodationProperty, RatePeriod, RoomCategory } from '../../src/types/accommodation.js';

// Transport
import { DEMO_TRANSPORT_RATE_PERIODS, DEMO_TRANSPORT_SUPPLEMENTS } from '../../src/services/transportDemoData.js';
import { calculateTransportCost } from '../../src/services/transportEngine.js';

// Activity
import { DEMO_ACTIVITY_RATE_PERIODS } from '../../src/services/activityDemoData.js';
import { calculateActivityCost } from '../../src/services/activityEngine.js';

import { ItineraryItem } from '../../src/types/index.js';
import { TripDomainError, TripService } from '../services/tripService.js';

export const tripsRouter = Router();
const tripService = new TripService();

function actorFromRequest(req: Request) {
  const currentUser = req.user!;
  return {
    firebaseUid: currentUser.firebaseUid,
    employeeId: currentUser.employeeId,
    name: currentUser.name,
    email: currentUser.email,
    role: currentUser.role,
    active: currentUser.active,
    salesTeamId: currentUser.salesTeamId,
    isDemo: currentUser.isDemo,
  };
}

function sendTripMutationError(res: Response, error: unknown, operation: string) {
  if (error instanceof TripDomainError) {
    return res.status(error.statusCode).json({
      error: error.message,
      code: error.code,
      ...(error.details !== undefined ? { details: error.details } : {}),
    });
  }
  if (error instanceof ResourceAuthorizationError) {
    return res.status(error.statusCode).json({ error: error.message, code: error.code });
  }
  console.error(`API Error in ${operation}:`, error);
  return res.status(500).json({ error: `Failed to ${operation}` });
}

tripsRouter.post('/calculate-costs', async (req: Request, res: Response) => {
  try {
    const { tripId, items: clientItems } = req.body;

    if (!tripId || typeof tripId !== 'string') {
      return res.status(400).json({ error: 'Trip ID is required' });
    }

    const currentUser = req.user!;
    let storedTrip: Record<string, any> | undefined;

    if (APP_CONFIG.DEMO_MODE) {
      storedTrip = DEMO_TRIPS.find(trip => trip.id === tripId) as unknown as Record<string, any> | undefined;
    } else {
      const snapshot = await getAdminDb().collection('trips').doc(tripId).get();
      if (snapshot.exists) storedTrip = { ...snapshot.data(), id: snapshot.id };
    }

    if (!storedTrip) {
      return res.status(404).json({ error: 'Trip not found', code: 'TRIP_NOT_FOUND' });
    }

    // P0 boundary: stored ownership/team/state is authoritative. No inventory
    // calculation or Admin-SDK mutation occurs before this decision succeeds.
    const authorization = assertAuthorizedResource(
      currentUser,
      'TRIP',
      'UPDATE_COMMERCIAL',
      tripResourceContext(storedTrip),
    );

    let items: ItineraryItem[];
    if (APP_CONFIG.DEMO_MODE) {
      if (!Array.isArray(clientItems)) {
        return res.status(400).json({ error: 'Trip items must be an array', code: 'INVALID_TRIP_ITEMS' });
      }
      items = clientItems as ItineraryItem[];
    } else {
      // D2B: persisted itinerary days, not client input, are the only source
      // for a production supplier-cost calculation.
      const days = await getAdminDb().collection('itinerary_days').where('tripId', '==', tripId).get();
      items = days.docs.flatMap(day => {
        const value = day.data().items;
        return Array.isArray(value) ? value as ItineraryItem[] : [];
      });
    }

    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'Trip items must be an array', code: 'INVALID_TRIP_ITEMS' });
    }

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

    const authoritativeSellingPrice = storedTrip.totalSellingPrice;
    if (typeof authoritativeSellingPrice === 'number' && authoritativeSellingPrice > 0) {
      grossProfit = authoritativeSellingPrice - totalTripCost;
      grossMargin = Number(((grossProfit / authoritativeSellingPrice) * 100).toFixed(1));
    }

    // Persist securely to Firestore bypassing client rules
    if (!APP_CONFIG.DEMO_MODE) {
      const db = getAdminDb();
      await db.collection('trips').doc(tripId).update({
        totalSupplierCost: totalTripCost,
        grossProfit,
        grossMargin,
        costingStatus: 'CALCULATED',
        updatedAt: new Date().toISOString()
      });
    }

    // Return the response.
    const responseData = {
      totalSupplierCost: totalTripCost,
      grossProfit,
      grossMargin,
      costingStatus: 'CALCULATED',
    };

    return res.json({
      success: true,
      data: buildResourceDto(currentUser, 'TRIP', responseData, authorization)
    });

  } catch (error: any) {
    if (error instanceof ResourceAuthorizationError) {
      return res.status(error.statusCode).json({ error: error.message, code: error.code });
    }
    console.error('API Error in /trips/calculate-costs:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

const commercialTripMutationRoles = ['Founder', 'Admin', 'Sales Manager', 'Sales Executive'] as const;

tripsRouter.post(
  '/:tripId/itinerary-days',
  requireRole([...commercialTripMutationRoles]),
  async (req: Request, res: Response) => {
    try {
      const actor = actorFromRequest(req);
      const result = await tripService.createItineraryDay(req.params.tripId, req.body, actor);
      const authorization = assertAuthorizedResource(actor, 'TRIP', 'READ_DETAIL', tripResourceContext(result.trip));
      return res.status(201).json({
        success: true,
        data: buildResourceDto(actor, 'TRIP', result, authorization),
      });
    } catch (error) {
      return sendTripMutationError(res, error, 'create itinerary day');
    }
  },
);

tripsRouter.patch(
  '/itinerary-days/:dayId',
  requireRole([...commercialTripMutationRoles]),
  async (req: Request, res: Response) => {
    try {
      const actor = actorFromRequest(req);
      const result = await tripService.updateItineraryDay(req.params.dayId, req.body, actor);
      const authorization = assertAuthorizedResource(actor, 'TRIP', 'READ_DETAIL', tripResourceContext(result.trip));
      return res.status(200).json({ success: true, data: buildResourceDto(actor, 'TRIP', result, authorization) });
    } catch (error) {
      return sendTripMutationError(res, error, 'update itinerary day');
    }
  },
);

tripsRouter.delete(
  '/itinerary-days/:dayId',
  requireRole([...commercialTripMutationRoles]),
  async (req: Request, res: Response) => {
    try {
      const actor = actorFromRequest(req);
      const result = await tripService.deleteItineraryDay(req.params.dayId, actor);
      const authorization = assertAuthorizedResource(actor, 'TRIP', 'READ_DETAIL', tripResourceContext(result.trip));
      return res.status(200).json({ success: true, data: buildResourceDto(actor, 'TRIP', result, authorization) });
    } catch (error) {
      return sendTripMutationError(res, error, 'delete itinerary day');
    }
  },
);

tripsRouter.post(
  '/itinerary-days/:dayId/items',
  requireRole([...commercialTripMutationRoles]),
  async (req: Request, res: Response) => {
    try {
      const actor = actorFromRequest(req);
      const result = await tripService.addItineraryItem(req.params.dayId, req.body, actor);
      const authorization = assertAuthorizedResource(actor, 'TRIP', 'READ_DETAIL', tripResourceContext(result.trip));
      return res.status(201).json({ success: true, data: buildResourceDto(actor, 'TRIP', result, authorization) });
    } catch (error) {
      return sendTripMutationError(res, error, 'create itinerary item');
    }
  },
);

tripsRouter.delete(
  '/itinerary-days/:dayId/items/:itemId',
  requireRole([...commercialTripMutationRoles]),
  async (req: Request, res: Response) => {
    try {
      const actor = actorFromRequest(req);
      const result = await tripService.deleteItineraryItem(req.params.dayId, req.params.itemId, actor);
      const authorization = assertAuthorizedResource(actor, 'TRIP', 'READ_DETAIL', tripResourceContext(result.trip));
      return res.status(200).json({ success: true, data: buildResourceDto(actor, 'TRIP', result, authorization) });
    } catch (error) {
      return sendTripMutationError(res, error, 'delete itinerary item');
    }
  },
);

tripsRouter.post(
  '/',
  requireRole([...commercialTripMutationRoles]),
  async (req: Request, res: Response) => {
    try {
      const actor = actorFromRequest(req);
      const trip = await tripService.createTrip(req.body, actor);
      const authorization = assertAuthorizedResource(
        actor, 'TRIP', 'READ_DETAIL', tripResourceContext(trip),
      );
      return res.status(201).json({
        success: true,
        data: buildResourceDto(actor, 'TRIP', trip, authorization),
      });
    } catch (error) {
      return sendTripMutationError(res, error, 'create Trip');
    }
  },
);

tripsRouter.patch(
  '/:id',
  requireRole([...commercialTripMutationRoles]),
  async (req: Request, res: Response) => {
    try {
      const actor = actorFromRequest(req);
      const trip = await tripService.updateTrip(req.params.id, req.body, actor);
      const authorization = assertAuthorizedResource(
        actor, 'TRIP', 'READ_DETAIL', tripResourceContext(trip),
      );
      return res.status(200).json({
        success: true,
        data: buildResourceDto(actor, 'TRIP', trip, authorization),
      });
    } catch (error) {
      return sendTripMutationError(res, error, 'update Trip');
    }
  },
);

tripsRouter.delete(
  '/:id',
  requireRole([...commercialTripMutationRoles]),
  async (req: Request, res: Response) => {
    try {
      await tripService.deleteTrip(req.params.id, actorFromRequest(req));
      return res.status(204).send();
    } catch (error) {
      return sendTripMutationError(res, error, 'delete Trip');
    }
  },
);

tripsRouter.get('/', requireRole(['Founder', 'Admin', 'Accounts', 'Operations', 'Reservations', 'Sales Manager', 'Sales Executive']), async (req: Request, res: Response) => {
  try {
    const principal = req.user!;
    const descriptor = assertRawListScope(resolveQueryScope(principal, 'TRIP', 'READ_DETAIL'));
    const options = parseScopedListOptions(req.query as Record<string, unknown>);
    let trips: Record<string, any>[];
    let hasMore = false;

    if (APP_CONFIG.DEMO_MODE) {
      const scoped = scopeInMemoryRecords<(typeof DEMO_TRIPS)[number]>(
        principal, 'TRIP', 'READ_DETAIL', DEMO_TRIPS, tripResourceContext,
      );
      const cursorIndex = options.cursor ? scoped.findIndex(trip => trip.id === options.cursor) : -1;
      if (options.cursor && cursorIndex < 0) {
        throw new ScopedListError(400, 'INVALID_CURSOR', 'The trip cursor is invalid for this scope.');
      }
      const start = cursorIndex >= 0 ? cursorIndex + 1 : 0;
      trips = scoped.slice(start, start + options.limit + 1) as unknown as Record<string, any>[];
    } else {
      const db = getAdminDb();
      let query: any = applyFirestoreQueryScope(db.collection('trips') as any, descriptor)
        .orderBy('createdAt', 'desc');

      if (options.cursor) {
        const cursorSnapshot = await db.collection('trips').doc(options.cursor).get();
        if (!cursorSnapshot.exists) {
          throw new ScopedListError(400, 'INVALID_CURSOR', 'The trip cursor is invalid.');
        }
        const cursorRecord = { ...cursorSnapshot.data(), id: cursorSnapshot.id };
        assertAuthorizedResource(principal, 'TRIP', 'READ_DETAIL', tripResourceContext(cursorRecord));
        query = query.startAfter(cursorSnapshot);
      }

      const snapshot = await query.limit(options.limit + 1).get();
      trips = snapshot.docs.map((doc: any) => ({ ...doc.data(), id: doc.id }));
      assertReturnedRecordsAuthorized(principal, 'TRIP', 'READ_DETAIL', trips, tripResourceContext);
    }

    hasMore = trips.length > options.limit;
    const page = hasMore ? trips.slice(0, options.limit) : trips;
    const data = page.map(trip => {
      const normalized = { ...trip };
      if ('totalCost' in normalized && normalized.totalSupplierCost === undefined) {
        normalized.totalSupplierCost = normalized.totalCost;
        delete normalized.totalCost;
      }
      const authorization = authorizeResource(principal, 'TRIP', 'READ_DETAIL', tripResourceContext(normalized));
      return buildResourceDto(principal, 'TRIP', normalized, authorization);
    });

    return res.json({
      success: true,
      data,
      nextCursor: hasMore && page.length ? page[page.length - 1].id : null,
      hasMore,
    });
  } catch (error) {
    if (error instanceof ResourceAuthorizationError) {
      return res.status(error.statusCode).json({ error: error.message, code: error.code });
    }
    if (error instanceof ScopedListError) {
      return res.status(error.statusCode).json({ error: error.message, code: error.code });
    }
    console.error('API Error in GET /trips:', error);
    return res.status(500).json({ error: 'Failed to fetch trips' });
  }
});

/**
 * Representative Stage C integration. Unlike the legacy list endpoint, this
 * detail path authorizes the concrete trip before applying its response DTO.
 */
tripsRouter.get(
  '/:id',
  requireRole(['Founder', 'Admin', 'Accounts', 'Sales Manager', 'Sales Executive', 'Reservations', 'Operations']),
  async (req: Request, res: Response) => {
    try {
      const tripId = req.params.id;
      let trip: Record<string, any> | undefined;

      if (APP_CONFIG.DEMO_MODE) {
        trip = DEMO_TRIPS.find(candidate => candidate.id === tripId) as unknown as Record<string, any> | undefined;
      } else {
        const snapshot = await getAdminDb().collection('trips').doc(tripId).get();
        if (snapshot.exists) trip = { ...snapshot.data(), id: snapshot.id };
      }

      if (!trip) return res.status(404).json({ error: 'Trip not found', code: 'TRIP_NOT_FOUND' });

      const normalizedTrip = { ...trip };
      if ('totalCost' in normalizedTrip && normalizedTrip.totalSupplierCost === undefined) {
        normalizedTrip.totalSupplierCost = normalizedTrip.totalCost;
        delete normalizedTrip.totalCost;
      }

      const principal = req.user!;
      const authorization = assertAuthorizedResource(
        principal,
        'TRIP',
        'READ_DETAIL',
        tripResourceContext(normalizedTrip),
      );

      return res.status(200).json({
        success: true,
        data: buildResourceDto(principal, 'TRIP', normalizedTrip, authorization),
      });
    } catch (error) {
      if (error instanceof ResourceAuthorizationError) {
        return res.status(error.statusCode).json({ error: error.message, code: error.code });
      }
      console.error('API Error in GET /trips/:id:', error);
      return res.status(500).json({ error: 'Failed to fetch trip' });
    }
  },
);
