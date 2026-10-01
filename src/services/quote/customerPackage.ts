import type { CustomerPackageDocument, CustomerPackageItineraryItem } from '../../types/customerPackage';
import type { ItineraryDay, Quote, Trip } from '../../types';

type UnknownRecord = Record<string, any>;

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

const number = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

function projectItineraryItem(value: unknown): CustomerPackageItineraryItem | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as UnknownRecord;
  const metadata = item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata)
    ? item.metadata as UnknownRecord
    : {};
  const sourceType = text(item.type);
  const type = sourceType === 'HOTEL' || sourceType === 'TRANSPORT' || sourceType === 'ACTIVITY'
    ? sourceType
    : 'OTHER';
  const title = text(item.title);
  if (!title) return null;
  if (type === 'HOTEL') {
    return {
      type, title, ...(text(item.description) ? { description: text(item.description) } : {}),
      ...(text(metadata.propertyName) ? { propertyName: text(metadata.propertyName) } : {}),
      ...(text(metadata.roomCategoryName) ? { roomCategoryName: text(metadata.roomCategoryName) } : {}),
      ...(text(metadata.mealPlan) ? { mealPlan: text(metadata.mealPlan) } : {}),
      ...(text(metadata.checkInDate) ? { checkInDate: text(metadata.checkInDate) } : {}),
      ...(text(metadata.checkOutDate) ? { checkOutDate: text(metadata.checkOutDate) } : {}),
      ...(number(metadata.rooms) > 0 ? { rooms: number(metadata.rooms) } : {}),
    };
  }
  if (type === 'TRANSPORT') {
    return {
      type, title, ...(text(item.description) ? { description: text(item.description) } : {}),
      ...(text(metadata.vehicleName) ? { vehicleName: text(metadata.vehicleName) } : {}),
      ...(text(metadata.routeName) ? { routeName: text(metadata.routeName) } : {}),
      ...(text(metadata.startDate) ? { serviceDate: text(metadata.startDate) } : {}),
    };
  }
  if (type === 'ACTIVITY') {
    return {
      type, title, ...(text(item.description) ? { description: text(item.description) } : {}),
      ...(text(metadata.activityName) ? { activityName: text(metadata.activityName) } : {}),
      ...(text(metadata.date) ? { serviceDate: text(metadata.date) } : {}),
    };
  }
  return { type, title, ...(text(item.description) ? { description: text(item.description) } : {}) };
}

/** Strict customer projection. Unknown, financial, supplier, and internal fields are ignored. */
export function buildCustomerPackageProjection(
  quote: Quote | UnknownRecord,
  itineraryDays: ItineraryDay[] | UnknownRecord[],
  trip?: Trip | UnknownRecord | null,
  generatedAt = new Date().toISOString(),
): CustomerPackageDocument {
  const hotels = Array.isArray(quote.hotels) ? quote.hotels.map((item: UnknownRecord) => ({
    hotelName: text(item.hotelName) || 'Hotel',
    roomCategoryName: text(item.roomType) || 'Room category',
    mealPlan: text(item.mealPlan) || 'As specified',
    ...(text(item.checkInDate) ? { checkInDate: text(item.checkInDate) } : {}),
    ...(text(item.checkOutDate) ? { checkOutDate: text(item.checkOutDate) } : {}),
    nights: number(item.nights),
    rooms: number(item.roomsCount ?? item.rooms, 1),
  })) : [];
  const transports = Array.isArray(quote.transports) ? quote.transports.map((item: UnknownRecord) => ({
    vehicleName: text(item.vehicleType) || 'Transport',
    route: text(item.route) || 'As per itinerary',
    ...(text(item.serviceDate) ? { serviceDate: text(item.serviceDate) } : {}),
    days: number(item.days, 1),
    passengerCount: number(item.passengerCount, number(quote.travelerCount, 1)),
  })) : [];
  const activities = Array.isArray(quote.activities) ? quote.activities.map((item: UnknownRecord) => ({
    activityName: text(item.activityName) || text(item.name) || 'Activity',
    ...(text(item.serviceDate ?? item.date) ? { serviceDate: text(item.serviceDate ?? item.date) } : {}),
    participantCount: number(item.pax, number(quote.travelerCount, 1)),
  })) : [];
  const itinerary = itineraryDays
    .map((day: UnknownRecord) => ({
      dayNumber: number(day.dayNumber),
      date: text(day.date) || '',
      title: text(day.title) || `Day ${number(day.dayNumber)}`,
      ...(text(day.location) ? { location: text(day.location) } : {}),
      items: (Array.isArray(day.items) ? day.items : []).map(projectItineraryItem).filter(Boolean) as CustomerPackageItineraryItem[],
    }))
    .sort((left, right) => left.dayNumber - right.dayNumber);

  return {
    brand: {
      name: 'Booking Bridge',
      tagline: 'Travel, thoughtfully arranged',
      email: 'travel@bookingbridge.com',
      phone: '+91 70060 00000',
    },
    packageReference: text(quote.id) || 'BBOS-PACKAGE',
    customerName: text(quote.customerName) || 'Guest',
    destination: text(quote.destination) || 'Your destination',
    ...(text(trip?.startDate) ? { travelStartDate: text(trip?.startDate) } : {}),
    ...(text(trip?.endDate) ? { travelEndDate: text(trip?.endDate) } : {}),
    travelerCount: number(quote.travelerCount, 1),
    hotels,
    transports,
    activities,
    itinerary,
    packageSellingPrice: number(quote.finalAmount),
    currency: text(trip?.currency) || 'INR',
    inclusions: Array.isArray(quote.inclusions) ? quote.inclusions.filter((item): item is string => typeof item === 'string') : [],
    exclusions: Array.isArray(quote.exclusions) ? quote.exclusions.filter((item): item is string => typeof item === 'string') : [],
    ...(text(quote.termsAndConditions) ? { termsAndConditions: text(quote.termsAndConditions) } : {}),
    generatedAt,
  };
}
