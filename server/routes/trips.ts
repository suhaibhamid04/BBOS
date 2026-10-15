import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/auth.js';
import { getAdminDb } from '../firebaseAdmin.js';
import { APP_CONFIG } from '../../src/config.js';
import { DEMO_ITINERARIES, DEMO_TRIPS } from '../../src/services/demoData.js';
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
import {
  calculateMixedAllocatedStayTotal,
  calculateStayTotal,
  distributeGuestsAcrossRooms,
} from '../../src/services/accommodationEngine.js';
import { AccommodationProperty, RatePeriod, RoomCategory } from '../../src/types/accommodation.js';
import type { RoomAllocation } from '../../src/types/accommodation.js';

// Transport
import { DEMO_TRANSPORT_RATE_PERIODS, DEMO_TRANSPORT_SUPPLEMENTS } from '../../src/services/transportDemoData.js';
import { calculateTransportCost } from '../../src/services/transportEngine.js';

// Activity
import { DEMO_ACTIVITY_RATE_PERIODS } from '../../src/services/activityDemoData.js';
import { calculateActivityCost } from '../../src/services/activityEngine.js';

import { ItineraryDay, ItineraryItem, type PackageSupplierCostCategory } from '../../src/types/index.js';
import { TripDomainError, TripService } from '../services/tripService.js';
import {
  assessLowMarginPolicy,
  buildPackageSupplierCostBreakdown,
  calculatePackageEconomics,
  type PackageCostEntry,
} from '../../src/utils/packageCommercials.js';

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

function packageTransportCost(metadata: Record<string, any>): number | undefined {
  const rate = metadata.packageSupplierRate;
  if (!rate || typeof rate.amount !== 'number' || !Number.isFinite(rate.amount) || rate.amount < 0) return undefined;
  if (rate.entryMode === 'TOTAL_SERVICE') return rate.amount;
  if (rate.entryMode === 'PER_VEHICLE_DAY') {
    return rate.amount * Math.max(1, Number(metadata.vehicleCount || 1)) * Math.max(1, Number(metadata.chargeableDays || metadata.vehicleDays || 1));
  }
  return undefined;
}

function packageActivityCost(metadata: Record<string, any>): number | undefined {
  const rate = metadata.packageSupplierRate;
  if (!rate || typeof rate.amount !== 'number' || !Number.isFinite(rate.amount) || rate.amount < 0) return undefined;
  switch (rate.entryMode) {
    case 'PER_PERSON': return rate.amount * Math.max(0, Number(metadata.adults || 0)) + Number(rate.childAmount ?? rate.amount) * Math.max(0, Number(metadata.children || 0));
    case 'PER_CHILD': return rate.amount * Math.max(0, Number(metadata.children || 0));
    case 'PER_GROUP': return rate.amount * Math.max(1, Number(metadata.groups || 1));
    case 'PER_UNIT': return rate.amount * Math.max(1, Number(metadata.units || metadata.tickets || 1));
    case 'FLAT_TOTAL':
    case 'TOTAL_SERVICE': return rate.amount;
    default: return undefined;
  }
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
    const calculationRevision = Number(storedTrip.costingRevision || 0);

    // P0 boundary: stored ownership/team/state is authoritative. No inventory
    // calculation or Admin-SDK mutation occurs before this decision succeeds.
    const authorization = assertAuthorizedResource(
      currentUser,
      'TRIP',
      'UPDATE_COMMERCIAL',
      tripResourceContext(storedTrip),
    );
    if (storedTrip.packageReview?.required === true) {
      return res.status(409).json({
        error: 'Apply the latest Lead travel details before recalculating this package.',
        code: 'PACKAGE_REVIEW_REQUIRED',
      });
    }

    let items: ItineraryItem[];
    let persistedDays: Array<{ id: string; items: ItineraryItem[] }> = [];
    if (APP_CONFIG.DEMO_MODE) {
      if (!Array.isArray(clientItems)) {
        return res.status(400).json({ error: 'Trip items must be an array', code: 'INVALID_TRIP_ITEMS' });
      }
      items = clientItems as ItineraryItem[];
    } else {
      // D2B: persisted itinerary days, not client input, are the only source
      // for a production supplier-cost calculation.
      const days = await getAdminDb().collection('itinerary_days').where('tripId', '==', tripId).get();
      persistedDays = days.docs.map(day => ({ id: day.id, items: Array.isArray(day.data().items) ? day.data().items as ItineraryItem[] : [] }));
      items = persistedDays.flatMap(day => {
        return day.items;
      });
    }

    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'Trip items must be an array', code: 'INVALID_TRIP_ITEMS' });
    }

    let totalTripCost = 0;
    const itemSupplierCosts: Record<string, number> = {};
    const costEntries: PackageCostEntry[] = [];
    const recordCost = (item: ItineraryItem, amount: number, category: PackageSupplierCostCategory) => {
      totalTripCost += amount;
      itemSupplierCosts[item.id] = amount;
      costEntries.push({ category, label: item.title || 'Package service', amount });
    };

    // We process each item, calculate its true cost independently of what the client sends
    for (const item of items as ItineraryItem[]) {
      if (item.type === 'HOTEL' && item.metadata) {
        const { propertyId, roomCategoryId, rateId, checkInDate, nights, rooms = 1, adults, children, childrenWithBed, childrenWithoutBed, mealPlan } = item.metadata;

        if (!propertyId || !roomCategoryId || !checkInDate || !nights) {
          if (Number.isFinite(item.supplierCost) && Number(item.supplierCost) >= 0) { recordCost(item, Number(item.supplierCost), 'ACCOMMODATION'); continue; }
          throw new Error('Accommodation item is missing authoritative inventory linkage.');
        }

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
          if ((!rateId || rp.id === rateId) && rp.status === 'ACTIVE' && (!mealPlan || rp.mealPlan === mealPlan) && targetDate >= from && targetDate <= to) {
            activeRate = rp;
            break;
          }
        }

        const storedChildAges = Array.isArray(storedTrip.childAges) ? storedTrip.childAges.map(Number) : [];
        const hasCompleteAges = Number(storedTrip.children || 0) === storedChildAges.length;
        if (!activeRate && !Array.isArray(item.metadata.roomAllocations) && !hasCompleteAges) {
          throw new Error(`Missing active rate for room category ${roomCategoryId} on ${checkInDate}`);
        }

        const roomCategory = roomCategories.find(rc => rc.id === roomCategoryId);
        if (roomCategory) {
           let stayCalc;
           if (Array.isArray(item.metadata.roomAllocations) || hasCompleteAges) {
             let allocations: RoomAllocation[];
             try {
               allocations = Array.isArray(item.metadata.roomAllocations)
                 ? item.metadata.roomAllocations as RoomAllocation[]
                 : distributeGuestsAcrossRooms(roomCategoryId, Number(storedTrip.adults || 0), storedChildAges, Number(rooms || 1));
             } catch (distributionError) {
               throw new TripDomainError(422, 'INVALID_ROOM_DISTRIBUTION', distributionError instanceof Error ? distributionError.message : 'Room distribution is invalid.');
             }
             stayCalc = calculateMixedAllocatedStayTotal(
               roomCategories.filter(category => category.propertyId === propertyId), allRatePeriods, propertyId, checkInDate, nights, allocations,
               { adults: Number(storedTrip.adults || 0), children: Number(storedTrip.children || 0), childAges: storedChildAges },
               mealPlan,
               item.metadata.packageSupplierRate,
             );
           } else {
             // Compatibility for historical items that already stored explicit supplier
             // charging buckets. No child age is invented; new items cannot use this path.
             if (Number(storedTrip.children || 0) > 0 && Number(childrenWithBed || 0) + Number(childrenWithoutBed || 0) !== Number(storedTrip.children || 0)) {
               throw new TripDomainError(422, 'CHILD_AGES_REQUIRED', 'Child ages are required for accurate hotel costing. Return to the Lead or Trip and add every child age.');
             }
             const roomTotal = Math.max(1, Number(rooms || 1));
             let legacyTotal = 0;
             for (let roomIndex = 0; roomIndex < roomTotal; roomIndex += 1) {
               const split = (total: number) => Math.floor(total / roomTotal) + (roomIndex < total % roomTotal ? 1 : 0);
               const roomStay = calculateStayTotal(
                 roomCategory, [activeRate!], propertyId, checkInDate, nights,
                 split(Number(adults || storedTrip.adults || 0)),
                 split(Number(children || storedTrip.children || 0)),
                 split(Number(childrenWithBed || 0)), split(Number(childrenWithoutBed || 0)), mealPlan,
               );
               if (!roomStay.available || !Number.isFinite(roomStay.totalAmount)) {
                 throw new TripDomainError(422, 'INVALID_ROOM_DISTRIBUTION', `Room ${roomIndex + 1}: ${roomStay.reason || 'The saved occupancy is invalid.'}`);
               }
               legacyTotal += roomStay.totalAmount || 0;
             }
             stayCalc = { available: true, totalAmount: legacyTotal } as ReturnType<typeof calculateStayTotal>;
           }
           if (stayCalc.available && Number.isFinite(stayCalc.totalAmount)) {
             const itemCost = stayCalc.totalAmount || 0;
             recordCost(item, itemCost, 'ACCOMMODATION');
           } else {
             throw new TripDomainError(422, 'INVALID_ROOM_DISTRIBUTION', stayCalc.reason || `Stay is unavailable for room category ${roomCategoryId}`);
           }
        } else {
          throw new Error(`Room category ${roomCategoryId} not found`);
        }
      } else if (item.type === 'TRANSPORT' && item.metadata) {
        // Phase 2B-4: Calculate Transport Cost
        const { vehicleCategoryId, rateId, startDate, vehicleDays, vehicleCount, chargeableDays, nightHalts, serviceType, occurrences, distanceKm, hours } = item.metadata;

        if (!vehicleCategoryId || !startDate || !vehicleDays || !serviceType) {
          if (Number.isFinite(item.supplierCost) && Number(item.supplierCost) >= 0) { recordCost(item, Number(item.supplierCost), 'TRANSPORT'); continue; }
          throw new Error('Transport item is missing authoritative inventory linkage.');
        }

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
          if ((!rateId || rp.id === rateId) && rp.status === 'ACTIVE' && rp.serviceType === serviceType && targetDate >= from && targetDate <= to) {
            activeRate = rp;
            break;
          }
        }

        const packageCost = packageTransportCost(item.metadata);
        if (!activeRate && packageCost === undefined) {
          throw new Error(`Missing active transport rate for category ${vehicleCategoryId} on ${startDate}`);
        }

        const transportCalc = activeRate ? calculateTransportCost({
          ratePeriod: activeRate,
          supplements: transportSupplements,
          serviceParams: {
            vehicleDays,
            vehicleCount: vehicleCount || 1,
            chargeableDays: chargeableDays || vehicleDays,
            nightHalts: nightHalts || 0,
            occurrences: occurrences || 1,
            distanceKm: distanceKm || 0,
            hours: hours || 0,
          }
        }) : null;

        const transportTotal = packageCost ?? transportCalc?.totalAmount;
        if ((packageCost !== undefined || transportCalc?.available) && Number.isFinite(transportTotal)) {
           recordCost(item, Number(transportTotal), 'TRANSPORT');
        } else {
           throw new Error(`Transport is unavailable for category ${vehicleCategoryId}`);
        }

      } else if (item.type === 'ACTIVITY' && item.metadata) {
         // Phase 2B-4: Calculate Activity Cost
         const { activityId, rateId, date, adults, children, infants, vehicles, groups, tickets, hours, days, sessions, units, inclusionStatus } = item.metadata;

         if (!activityId || !date) {
           if (Number.isFinite(item.supplierCost) && Number(item.supplierCost) >= 0) { recordCost(item, Number(item.supplierCost), 'ACTIVITIES'); continue; }
           throw new Error('Activity item is missing authoritative inventory linkage.');
         }

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
           if ((!rateId || rp.id === rateId) && rp.status === 'ACTIVE' && targetDate >= from && targetDate <= to) {
             activeRate = rp;
             break;
           }
         }

         const packageCost = packageActivityCost(item.metadata);
         if (!activeRate && packageCost === undefined) {
           throw new Error(`Missing active activity rate for ${activityId} on ${date}`);
         }

         const activityCalc = activeRate ? calculateActivityCost({
           ratePeriod: activeRate,
           params: { adults, children, infants, vehicles, groups, tickets, hours, days, sessions, units }
         }) : null;

         const includedTotal = inclusionStatus === 'OPTIONAL' || inclusionStatus === 'NOT_INCLUDED'
           ? 0
           : (packageCost ?? activityCalc?.totalAmount);
         if ((packageCost !== undefined || activityCalc?.available) && Number.isFinite(includedTotal)) {
           recordCost(item, Number(includedTotal), 'ACTIVITIES');
         } else {
           throw new Error(`Activity is unavailable for ${activityId}`);
         }
      } else {
        const metadata = item.metadata as Record<string, any> | undefined;
        const inclusionStatus = metadata?.inclusionStatus;
        const isIncluded = inclusionStatus !== 'OPTIONAL' && inclusionStatus !== 'NOT_INCLUDED';
        const hasServerCostSource = typeof metadata?.costSource === 'string' && metadata.costSource !== 'PENDING';
        if (isIncluded && hasServerCostSource && Number.isFinite(item.supplierCost) && Number(item.supplierCost) >= 0) {
          recordCost(item, Number(item.supplierCost), 'OTHER');
        }
      }
    }

    const calculatedAt = new Date().toISOString();
    const supplierCostBreakdown = buildPackageSupplierCostBreakdown(costEntries);
    const pricingMode = storedTrip.pricingMode || 'SELLING_PRICE';
    const pricingInput = storedTrip.pricingInput ?? storedTrip.totalSellingPrice ?? 0;
    let economics;
    try {
      economics = calculatePackageEconomics(totalTripCost, pricingMode, pricingInput);
    } catch (error) {
      throw new TripDomainError(422, 'INVALID_PRICING_INPUT', error instanceof Error ? error.message : 'Package pricing is invalid.');
    }
    let configuredThreshold: number | undefined = APP_CONFIG.LOW_MARGIN_THRESHOLD_PERCENT;
    if (!APP_CONFIG.DEMO_MODE) {
      const settingsSnapshot = await getAdminDb().collection('commercial_settings').doc('package-pricing').get();
      const settingValue = settingsSnapshot.data()?.lowMarginThresholdPercent;
      if (typeof settingValue === 'number') configuredThreshold = settingValue;
    }
    const commercialApproval = assessLowMarginPolicy(economics.grossMargin, configuredThreshold, calculatedAt);

    // Commit the result only if the commercial inputs are still the same
    // revision that was loaded before calculation. This prevents an older,
    // slower calculation from marking a newer package current.
    if (!APP_CONFIG.DEMO_MODE) {
      const db = getAdminDb();
      await db.runTransaction(async transaction => {
        const tripRef = db.collection('trips').doc(tripId);
        const currentSnapshot = await transaction.get(tripRef);
        if (!currentSnapshot.exists) {
          throw new TripDomainError(404, 'TRIP_NOT_FOUND', 'Trip not found.');
        }
        const currentTrip = currentSnapshot.data() || {};
        if (Number(currentTrip.costingRevision || 0) !== calculationRevision) {
          throw new TripDomainError(
            409,
            'COSTING_INPUT_CHANGED',
            'Package details changed while costs were updating. Review the latest package and update costs again.',
          );
        }
        for (const day of persistedDays) {
          transaction.update(db.collection('itinerary_days').doc(day.id), {
            items: day.items.map(item => itemSupplierCosts[item.id] === undefined ? item : { ...item, supplierCost: itemSupplierCosts[item.id] }),
          });
        }
        transaction.update(tripRef, {
          totalSupplierCost: totalTripCost,
          supplierCostBreakdown,
          totalSellingPrice: economics.totalSellingPrice,
          pricingMode: economics.pricingMode,
          pricingInput: economics.pricingInput,
          grossProfit: economics.grossProfit,
          grossMargin: economics.grossMargin,
          commercialApproval,
          costingStatus: 'CALCULATED',
          costingCalculatedRevision: calculationRevision,
          updatedAt: calculatedAt,
          updatedByEmployeeId: currentUser.employeeId,
        });
        const auditRef = db.collection('audit_logs').doc(`audit-costing-${tripId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
        transaction.set(auditRef, {
          id: auditRef.id,
          timestamp: calculatedAt,
          actorType: 'HUMAN',
          actorId: currentUser.employeeId,
          actorName: `${currentUser.name} (${currentUser.role})`,
          action: 'COSTING_RECALCULATED',
          entityType: 'TRIP',
          entityId: tripId,
          before: {
            costingStatus: currentTrip.costingStatus,
            costingRevision: currentTrip.costingRevision || 0,
            totalSupplierCost: currentTrip.totalSupplierCost,
          },
          after: {
            costingStatus: 'CALCULATED',
            costingRevision: calculationRevision,
            totalSupplierCost: totalTripCost,
            grossProfit: economics.grossProfit,
            grossMargin: economics.grossMargin,
          },
          reason: 'Authoritative package costs recalculated from current commercial inputs.',
        });
      });
    }

    // Return the response.
    const responseData = {
      totalSupplierCost: totalTripCost,
      supplierCostBreakdown,
      totalSellingPrice: economics.totalSellingPrice,
      pricingMode: economics.pricingMode,
      pricingInput: economics.pricingInput,
      grossProfit: economics.grossProfit,
      grossMargin: economics.grossMargin,
      commercialApproval,
      costingStatus: 'CALCULATED',
      costingRevision: calculationRevision,
      costingCalculatedRevision: calculationRevision,
      updatedAt: calculatedAt,
      itemSupplierCosts,
    };

    return res.json({
      success: true,
      data: buildResourceDto(currentUser, 'TRIP', responseData, authorization)
    });

  } catch (error: any) {
    if (error instanceof TripDomainError) {
      return res.status(error.statusCode).json({ error: error.message, code: error.code, ...(error.details !== undefined ? { details: error.details } : {}) });
    }
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

tripsRouter.post(
  '/itinerary-days/:dayId/compose-customer-content',
  requireRole([...commercialTripMutationRoles]),
  async (req: Request, res: Response) => {
    try {
      const actor = actorFromRequest(req);
      const result = await tripService.composeItineraryDayCustomerContent(req.params.dayId, req.body, actor);
      const authorization = assertAuthorizedResource(actor, 'TRIP', 'READ_DETAIL', tripResourceContext(result.trip));
      return res.status(200).json({ success: true, data: buildResourceDto(actor, 'TRIP', result, authorization) });
    } catch (error) {
      return sendTripMutationError(res, error, 'compose customer itinerary content');
    }
  },
);

tripsRouter.post(
  '/itinerary-days/:dayId/review-customer-content',
  requireRole([...commercialTripMutationRoles]),
  async (req: Request, res: Response) => {
    try {
      const actor = actorFromRequest(req);
      const result = await tripService.reviewItineraryDayCustomerContent(req.params.dayId, actor);
      const authorization = assertAuthorizedResource(actor, 'TRIP', 'READ_DETAIL', tripResourceContext(result.trip));
      return res.status(200).json({ success: true, data: buildResourceDto(actor, 'TRIP', result, authorization) });
    } catch (error) {
      return sendTripMutationError(res, error, 'review customer itinerary content');
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

tripsRouter.patch(
  '/itinerary-days/:dayId/items/:itemId',
  requireRole([...commercialTripMutationRoles]),
  async (req: Request, res: Response) => {
    try {
      const actor = actorFromRequest(req);
      const result = await tripService.updateItineraryItem(req.params.dayId, req.params.itemId, req.body, actor);
      const authorization = assertAuthorizedResource(actor, 'TRIP', 'READ_DETAIL', tripResourceContext(result.trip));
      return res.status(200).json({ success: true, data: buildResourceDto(actor, 'TRIP', result, authorization) });
    } catch (error) {
      return sendTripMutationError(res, error, 'update itinerary item');
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

tripsRouter.get(
  '/:tripId/itinerary-days',
  requireRole(['Founder', 'Admin', 'Accounts', 'Sales Manager', 'Sales Executive', 'Reservations', 'Operations']),
  async (req: Request, res: Response) => {
    try {
      const principal = req.user!; const tripId = req.params.tripId;
      let trip: Record<string, any> | undefined; let days: ItineraryDay[] = [];
      if (APP_CONFIG.DEMO_MODE) {
        trip = DEMO_TRIPS.find(candidate => candidate.id === tripId) as unknown as Record<string, any> | undefined;
        days = DEMO_ITINERARIES.filter(day => day.tripId === tripId);
      } else {
        const db = getAdminDb(); const tripSnapshot = await db.collection('trips').doc(tripId).get();
        if (tripSnapshot.exists) trip = { ...tripSnapshot.data(), id: tripSnapshot.id };
        if (trip) {
          const snapshot = await db.collection('itinerary_days').where('tripId', '==', tripId).orderBy('dayNumber', 'asc').limit(60).get();
          days = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as ItineraryDay));
        }
      }
      if (!trip) return res.status(404).json({ error: 'Trip not found', code: 'TRIP_NOT_FOUND' });
      const authorization = assertAuthorizedResource(principal, 'TRIP', 'READ_DETAIL', tripResourceContext(trip));
      return res.json({ success: true, data: buildResourceDto(principal, 'TRIP', { days }, authorization) });
    } catch (error) {
      return sendTripMutationError(res, error, 'read Trip itinerary');
    }
  },
);

tripsRouter.post(
  '/from-lead/:leadId',
  requireRole([...commercialTripMutationRoles]),
  async (req: Request, res: Response) => {
    try {
      const actor = actorFromRequest(req);
      const result = await tripService.createOrResumeLeadTrip(req.params.leadId, actor);
      const authorization = assertAuthorizedResource(
        actor, 'TRIP', 'READ_DETAIL', tripResourceContext(result.trip),
      );
      return res.status(result.resumed ? 200 : 201).json({
        success: true,
        data: buildResourceDto(actor, 'TRIP', result, authorization),
      });
    } catch (error) {
      return sendTripMutationError(res, error, 'create or resume Lead Trip');
    }
  },
);

tripsRouter.post(
  '/:id/reconcile-lead',
  requireRole([...commercialTripMutationRoles]),
  async (req: Request, res: Response) => {
    try {
      const actor = actorFromRequest(req);
      const trip = await tripService.reconcileLeadChanges(req.params.id, actor);
      const authorization = assertAuthorizedResource(actor, 'TRIP', 'READ_DETAIL', tripResourceContext(trip));
      return res.status(200).json({ success: true, data: buildResourceDto(actor, 'TRIP', trip, authorization) });
    } catch (error) {
      return sendTripMutationError(res, error, 'reconcile Trip with Lead');
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
