import type {
  CustomerPackageDocument,
  CustomerSharePublicOption,
  CustomerSharePublicView,
  Quote,
} from '../../types';

function firstName(value: string): string {
  return value.trim().split(/\s+/)[0] || 'Guest';
}

/**
 * Re-project even the already-safe package snapshot. This explicit allowlist
 * prevents future internal fields added to that snapshot from reaching a
 * public token response accidentally.
 */
export function projectPackageForPublic(
  source: CustomerPackageDocument,
  customerName: string,
  reference: string,
): CustomerPackageDocument {
  return {
    brand: {
      name: 'Booking Bridge',
      tagline: 'Travel, thoughtfully arranged',
      email: source.brand.email,
      phone: source.brand.phone,
    },
    packageReference: reference,
    customerName,
    destination: source.destination,
    ...(source.travelStartDate ? { travelStartDate: source.travelStartDate } : {}),
    ...(source.travelEndDate ? { travelEndDate: source.travelEndDate } : {}),
    travelerCount: source.travelerCount,
    hotels: source.hotels.map(hotel => ({
      hotelName: hotel.hotelName,
      roomCategoryName: hotel.roomCategoryName,
      mealPlan: hotel.mealPlan,
      ...(hotel.checkInDate ? { checkInDate: hotel.checkInDate } : {}),
      ...(hotel.checkOutDate ? { checkOutDate: hotel.checkOutDate } : {}),
      nights: hotel.nights,
      rooms: hotel.rooms,
    })),
    transports: source.transports.map(transport => ({
      vehicleName: transport.vehicleName,
      route: transport.route,
      ...(transport.serviceDate ? { serviceDate: transport.serviceDate } : {}),
      days: transport.days,
      passengerCount: transport.passengerCount,
      ...(transport.vehicleCount !== undefined ? { vehicleCount: transport.vehicleCount } : {}),
      ...(transport.serviceDays ? { serviceDays: transport.serviceDays.map(day => ({ ...day })) } : {}),
    })),
    activities: source.activities.map(activity => ({
      activityName: activity.activityName,
      ...(activity.serviceDate ? { serviceDate: activity.serviceDate } : {}),
      participantCount: activity.participantCount,
      ...(activity.inclusionStatus ? { inclusionStatus: activity.inclusionStatus } : {}),
    })),
    itinerary: source.itinerary.map(day => ({
      dayNumber: day.dayNumber,
      date: day.date,
      title: day.title,
      ...(day.description ? { description: day.description } : {}),
      ...(day.location ? { location: day.location } : {}),
      ...(day.route ? { route: day.route } : {}),
      ...(day.placesCovered ? { placesCovered: [...day.placesCovered] } : {}),
      ...(day.overnightLocation ? { overnightLocation: day.overnightLocation } : {}),
      ...(day.meals ? { meals: [...day.meals] } : {}),
      items: day.items.map(item => ({
        type: item.type,
        title: item.title,
        ...(item.description ? { description: item.description } : {}),
        ...(item.propertyName ? { propertyName: item.propertyName } : {}),
        ...(item.roomCategoryName ? { roomCategoryName: item.roomCategoryName } : {}),
        ...(item.mealPlan ? { mealPlan: item.mealPlan } : {}),
        ...(item.checkInDate ? { checkInDate: item.checkInDate } : {}),
        ...(item.checkOutDate ? { checkOutDate: item.checkOutDate } : {}),
        ...(item.rooms !== undefined ? { rooms: item.rooms } : {}),
        ...(item.vehicleName ? { vehicleName: item.vehicleName } : {}),
        ...(item.routeName ? { routeName: item.routeName } : {}),
        ...(item.serviceDate ? { serviceDate: item.serviceDate } : {}),
        ...(item.activityName ? { activityName: item.activityName } : {}),
        ...(item.inclusionStatus ? { inclusionStatus: item.inclusionStatus } : {}),
      })),
    })),
    packageSellingPrice: source.packageSellingPrice,
    currency: source.currency,
    inclusions: [...source.inclusions],
    exclusions: [...source.exclusions],
    ...(source.termsAndConditions ? { termsAndConditions: source.termsAndConditions } : {}),
    generatedAt: source.generatedAt,
  };
}

export function buildCustomerSharePublicView(quotes: Quote[], frozenAt: string): CustomerSharePublicView {
  const ordered = quotes
    .filter(quote => quote.optionId && quote.customerPackageSnapshot)
    .sort((left, right) => (left.optionOrder || 0) - (right.optionOrder || 0));
  if (!ordered.length) throw new Error('The Quote Group has no frozen customer options.');

  const preparedFor = firstName(ordered[0].customerName || ordered[0].customerPackageSnapshot!.customerName);
  const options: CustomerSharePublicOption[] = ordered.map((quote, index) => {
    const source = quote.customerPackageSnapshot!;
    const order = quote.optionOrder || index + 1;
    const label = quote.optionLabel || `Option ${order}`;
    const customerPackage = projectPackageForPublic(source, preparedFor, `Package option ${order}`);
    return {
      key: `option-${order}`,
      label,
      ...(quote.customerTitle ? { customerTitle: quote.customerTitle } : {}),
      order,
      recommended: quote.isRecommended === true,
      packageSellingPrice: customerPackage.packageSellingPrice,
      currency: customerPackage.currency,
      travelerCount: customerPackage.travelerCount,
      ...(quote.durationDays ? { durationDays: quote.durationDays } : {}),
      ...(quote.durationNights ? { durationNights: quote.durationNights } : {}),
      hotelHighlights: customerPackage.hotels.map(hotel => `${hotel.hotelName} — ${hotel.roomCategoryName}${hotel.mealPlan ? ` · ${hotel.mealPlan}` : ''}`),
      transportHighlights: customerPackage.transports.map(transport => transport.vehicleName),
      includedActivityHighlights: customerPackage.activities
        .filter(activity => activity.inclusionStatus !== 'OPTIONAL' && activity.inclusionStatus !== 'NOT_INCLUDED')
        .map(activity => activity.activityName),
      optionalActivityHighlights: customerPackage.activities
        .filter(activity => activity.inclusionStatus === 'OPTIONAL')
        .map(activity => activity.activityName),
      validUntil: quote.validUntil,
      package: customerPackage,
    };
  });
  const firstPackage = options[0].package;
  return {
    brand: firstPackage.brand,
    title: ordered[0].customerTitle || `${ordered[0].destination || firstPackage.destination} Holiday`,
    preparedFor,
    destination: String(ordered[0].destination || firstPackage.destination),
    ...(firstPackage.travelStartDate ? { travelStartDate: firstPackage.travelStartDate } : {}),
    ...(firstPackage.travelEndDate ? { travelEndDate: firstPackage.travelEndDate } : {}),
    travelerCount: firstPackage.travelerCount,
    options,
    frozenAt,
  };
}
