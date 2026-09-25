import type {
  AccommodationProperty,
  NegotiatedRate,
  RatePeriod,
  RateSupplement,
  RoomCategory,
} from '../../src/types/accommodation.js';
import type {
  TransportRatePeriod,
  TransportRoute,
  TransportSupplement,
  VehicleCategory,
} from '../../src/types/transport.js';
import type { ActivityMaster, ActivityRatePeriod } from '../../src/types/activity.js';
import type { InventoryDataProvider } from '../../src/services/quoteValidation/inventoryProvider.js';
import { getAdminDb } from '../firebaseAdmin.js';

/** Production inventory authority for Quote validation and conversion. */
export class FirestoreInventoryDataProvider implements InventoryDataProvider {
  private async getById<T>(collectionName: string, id: string): Promise<T | null> {
    if (!id) return null;
    const snapshot = await getAdminDb().collection(collectionName).doc(id).get();
    return snapshot.exists ? ({ id: snapshot.id, ...snapshot.data() } as T) : null;
  }

  getAccommodationProperty(id: string) { return this.getById<AccommodationProperty>('accommodation_properties', id); }
  getRoomCategory(id: string) { return this.getById<RoomCategory>('room_categories', id); }
  getRatePeriod(id: string) { return this.getById<RatePeriod>('rate_periods', id); }
  getNegotiatedRate(id: string) { return this.getById<NegotiatedRate>('negotiated_rates', id); }
  getVehicleCategory(id: string) { return this.getById<VehicleCategory>('vehicle_categories', id); }
  getTransportRoute(id: string) { return this.getById<TransportRoute>('transport_routes', id); }
  getTransportRatePeriod(id: string) { return this.getById<TransportRatePeriod>('transport_rate_periods', id); }
  getActivityMaster(id: string) { return this.getById<ActivityMaster>('activity_masters', id); }
  getActivityRatePeriod(id: string) { return this.getById<ActivityRatePeriod>('activity_rate_periods', id); }

  async getRateSupplements(ratePeriodId: string): Promise<RateSupplement[]> {
    const snapshot = await getAdminDb().collection('rate_supplements')
      .where('ratePeriodId', '==', ratePeriodId).get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RateSupplement));
  }

  async getTransportSupplements(ratePeriodId: string): Promise<TransportSupplement[]> {
    const snapshot = await getAdminDb().collection('transport_supplements')
      .where('ratePeriodId', '==', ratePeriodId).get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TransportSupplement));
  }
}
