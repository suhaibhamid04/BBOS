import {
  AccommodationProperty,
  RoomCategory,
  RatePeriod,
  RateSupplement,
  NegotiatedRate,
} from '../../types/accommodation';
import {
  VehicleCategory,
  TransportRoute,
  TransportRatePeriod,
  TransportSupplement,
} from '../../types/transport';
import {
  ActivityMaster,
  ActivityRatePeriod,
} from '../../types/activity';

import {
  DEMO_ACCOMMODATION_PROPERTIES,
  DEMO_ROOM_CATEGORIES,
  DEMO_RATE_PERIODS,
} from '../accommodationDemoData';
import {
  DEMO_VEHICLE_CATEGORIES,
  DEMO_TRANSPORT_ROUTES,
  DEMO_TRANSPORT_RATE_PERIODS,
  DEMO_TRANSPORT_SUPPLEMENTS,
} from '../transportDemoData';
import {
  DEMO_ACTIVITY_MASTERS,
  DEMO_ACTIVITY_RATE_PERIODS,
} from '../activityDemoData';

export interface InventoryDataProvider {
  // Accommodation
  getAccommodationProperty(id: string): Promise<AccommodationProperty | null> | AccommodationProperty | null;
  getRoomCategory(id: string): Promise<RoomCategory | null> | RoomCategory | null;
  getRatePeriod(id: string): Promise<RatePeriod | null> | RatePeriod | null;
  getNegotiatedRate(id: string): Promise<NegotiatedRate | null> | NegotiatedRate | null;
  getRateSupplements(ratePeriodId: string): Promise<RateSupplement[]> | RateSupplement[];

  // Transport
  getVehicleCategory(id: string): Promise<VehicleCategory | null> | VehicleCategory | null;
  getTransportRoute(id: string): Promise<TransportRoute | null> | TransportRoute | null;
  getTransportRatePeriod(id: string): Promise<TransportRatePeriod | null> | TransportRatePeriod | null;
  getTransportSupplements(ratePeriodId: string): Promise<TransportSupplement[]> | TransportSupplement[];

  // Activity
  getActivityMaster(id: string): Promise<ActivityMaster | null> | ActivityMaster | null;
  getActivityRatePeriod(id: string): Promise<ActivityRatePeriod | null> | ActivityRatePeriod | null;
}

export interface InventoryOverrides {
  properties?: AccommodationProperty[];
  roomCategories?: RoomCategory[];
  ratePeriods?: RatePeriod[];
  rateSupplements?: RateSupplement[];
  negotiatedRates?: NegotiatedRate[];

  vehicleCategories?: VehicleCategory[];
  transportRoutes?: TransportRoute[];
  transportRatePeriods?: TransportRatePeriod[];
  transportSupplements?: TransportSupplement[];

  activityMasters?: ActivityMaster[];
  activityRatePeriods?: ActivityRatePeriod[];
}

export class DefaultInventoryDataProvider implements InventoryDataProvider {
  private properties: AccommodationProperty[];
  private roomCategories: RoomCategory[];
  private ratePeriods: RatePeriod[];
  private rateSupplements: RateSupplement[];
  private negotiatedRates: NegotiatedRate[];

  private vehicleCategories: VehicleCategory[];
  private transportRoutes: TransportRoute[];
  private transportRatePeriods: TransportRatePeriod[];
  private transportSupplements: TransportSupplement[];

  private activityMasters: ActivityMaster[];
  private activityRatePeriods: ActivityRatePeriod[];

  constructor(overrides?: InventoryOverrides) {
    this.properties = overrides?.properties || DEMO_ACCOMMODATION_PROPERTIES.map(p =>
      p.id === 'accom-sgr-kareemresidency' ? { ...p, availabilityStatus: 'AVAILABLE' as const } : p
    );
    this.roomCategories = overrides?.roomCategories || DEMO_ROOM_CATEGORIES;
    this.ratePeriods = overrides?.ratePeriods || DEMO_RATE_PERIODS.map(r =>
      r.id === 'rp-accom-sgr-kareemresidency-oct' ? { ...r, confirmationStatus: 'CONFIRMED' as const } : r
    );
    this.rateSupplements = overrides?.rateSupplements || DEMO_RATE_PERIODS.flatMap(r => r.supplements || []);
    this.negotiatedRates = overrides?.negotiatedRates || [];

    this.vehicleCategories = overrides?.vehicleCategories || DEMO_VEHICLE_CATEGORIES;
    this.transportRoutes = overrides?.transportRoutes || DEMO_TRANSPORT_ROUTES;
    this.transportRatePeriods = overrides?.transportRatePeriods || DEMO_TRANSPORT_RATE_PERIODS;
    this.transportSupplements = overrides?.transportSupplements || DEMO_TRANSPORT_SUPPLEMENTS;

    this.activityMasters = overrides?.activityMasters || DEMO_ACTIVITY_MASTERS;
    this.activityRatePeriods = overrides?.activityRatePeriods || DEMO_ACTIVITY_RATE_PERIODS;
  }

  getAccommodationProperty(id: string): AccommodationProperty | null {
    return this.properties.find(p => p.id === id) || null;
  }

  getRoomCategory(id: string): RoomCategory | null {
    return this.roomCategories.find(rc => rc.id === id) || null;
  }

  getRatePeriod(id: string): RatePeriod | null {
    return this.ratePeriods.find(rp => rp.id === id) || null;
  }

  getNegotiatedRate(id: string): NegotiatedRate | null {
    return this.negotiatedRates.find(nr => nr.id === id) || null;
  }

  getRateSupplements(ratePeriodId: string): RateSupplement[] {
    return this.rateSupplements.filter(rs => rs.ratePeriodId === ratePeriodId);
  }

  getVehicleCategory(id: string): VehicleCategory | null {
    return this.vehicleCategories.find(vc => vc.id === id) || null;
  }

  getTransportRoute(id: string): TransportRoute | null {
    return this.transportRoutes.find(tr => tr.id === id) || null;
  }

  getTransportRatePeriod(id: string): TransportRatePeriod | null {
    return this.transportRatePeriods.find(trp => trp.id === id) || null;
  }

  getTransportSupplements(ratePeriodId: string): TransportSupplement[] {
    return this.transportSupplements.filter(ts => ts.ratePeriodId === ratePeriodId);
  }

  getActivityMaster(id: string): ActivityMaster | null {
    return this.activityMasters.find(am => am.id === id) || null;
  }

  getActivityRatePeriod(id: string): ActivityRatePeriod | null {
    return this.activityRatePeriods.find(arp => arp.id === id) || null;
  }
}
