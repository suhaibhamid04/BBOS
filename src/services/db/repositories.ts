import { db } from '../../lib/firebase';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where, orderBy, DocumentData } from 'firebase/firestore';
import { APP_CONFIG } from '../../config';

// Generic repository pattern
export class FirestoreRepository<T extends { id: string }> {
  collectionName: string;

  constructor(collectionName: string) {
    this.collectionName = collectionName;
  }

  async getById(id: string): Promise<T | null> {
    if (APP_CONFIG.DEMO_MODE) return null;
    const docRef = doc(db, this.collectionName, id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data() as T;
    }
    return null;
  }

  async getAll(): Promise<T[]> {
    if (APP_CONFIG.DEMO_MODE) return [];
    const q = query(collection(db, this.collectionName));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => doc.data() as T);
  }

  async create(item: T): Promise<void> {
    if (APP_CONFIG.DEMO_MODE) return;
    const docRef = doc(db, this.collectionName, item.id);
    await setDoc(docRef, item);
  }

  async update(id: string, item: Partial<T>): Promise<void> {
    if (APP_CONFIG.DEMO_MODE) return;
    const docRef = doc(db, this.collectionName, id);
    await updateDoc(docRef, item as DocumentData);
  }

  async delete(id: string): Promise<void> {
    if (APP_CONFIG.DEMO_MODE) return;
    const docRef = doc(db, this.collectionName, id);
    await deleteDoc(docRef);
  }
}

// Instantiate repositories
export const EmployeeRepo = new FirestoreRepository<any>('employees');
export const CustomerRepo = new FirestoreRepository<any>('customers');
export const CompanyRepo = new FirestoreRepository<any>('companies');
export const LeadRepo = new FirestoreRepository<any>('leads');
export const ConversationRepo = new FirestoreRepository<any>('conversations');
export const MessageRepo = new FirestoreRepository<any>('messages');
export const TaskRepo = new FirestoreRepository<any>('tasks');
export const BookingRepo = new FirestoreRepository<any>('bookings');
export const TripRepo = new FirestoreRepository<any>('trips');
export const ItineraryDayRepo = new FirestoreRepository<any>('itinerary_days');
export const HotelRepo = new FirestoreRepository<any>('hotels');
export const HotelRoomRepo = new FirestoreRepository<any>('hotel_rooms');
export const HotelBookingRepo = new FirestoreRepository<any>('hotel_bookings');
export const TransportRepo = new FirestoreRepository<any>('transports');
export const DriverRepo = new FirestoreRepository<any>('drivers');
export const ActivityRepo = new FirestoreRepository<any>('activities');
export const ActivityBookingRepo = new FirestoreRepository<any>('activity_bookings');
export const SupplierRepo = new FirestoreRepository<any>('suppliers');
export const VoucherRepo = new FirestoreRepository<any>('vouchers');
export const PackageRepo = new FirestoreRepository<any>('packages');
export const AuditLogRepo = new FirestoreRepository<any>('audit_logs');
export const AiRecommendationRepo = new FirestoreRepository<any>('ai_recommendations');
export const AiActionRepo = new FirestoreRepository<any>('ai_actions');
export const ApprovalRepo = new FirestoreRepository<any>('approvals');

// Accommodation & Rate Management
export const AccommodationPropertyRepo = new FirestoreRepository<any>('accommodation_properties');
export const RoomCategoryRepo = new FirestoreRepository<any>('room_categories');
export const RatePeriodRepo = new FirestoreRepository<any>('rate_periods');
export const RateSupplementRepo = new FirestoreRepository<any>('rate_supplements');
export const NegotiatedRateRepo = new FirestoreRepository<any>('negotiated_rates');
export const PropertyPhotoRepo = new FirestoreRepository<any>('property_photos');
export const RateHistoryRepo = new FirestoreRepository<any>('rate_history');

// Phase 2B-4: Transport & Activity Master Data & Rates
export const VehicleCategoryRepo = new FirestoreRepository<any>('vehicle_categories');
export const DestinationRepo = new FirestoreRepository<any>('destinations');
export const TransportRouteRepo = new FirestoreRepository<any>('transport_routes');
export const TransportRatePeriodRepo = new FirestoreRepository<any>('transport_rate_periods');
export const TransportSupplementRepo = new FirestoreRepository<any>('transport_supplements');
export const NegotiatedTransportRateRepo = new FirestoreRepository<any>('negotiated_transport_rates');
export const ActivityMasterRepo = new FirestoreRepository<any>('activity_masters');
export const ActivityRatePeriodRepo = new FirestoreRepository<any>('activity_rate_periods');
export const NegotiatedActivityRateRepo = new FirestoreRepository<any>('negotiated_activity_rates');
export const TransportRateHistoryRepo = new FirestoreRepository<any>('transport_rate_history');
export const ActivityRateHistoryRepo = new FirestoreRepository<any>('activity_rate_history');
