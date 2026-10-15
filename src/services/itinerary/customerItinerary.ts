import type { ItineraryDay, ItineraryItem } from '../../types';

type UnknownRecord = Record<string, any>;

export interface CustomerItineraryFacts {
  route?: string;
  placesCovered: string[];
  overnightLocation?: string;
  accommodation: string[];
  transportServices: string[];
  includedActivities: string[];
  optionalActivities: string[];
  notIncludedActivities: string[];
  meals: string[];
}

export interface ComposedCustomerItineraryDay {
  title: string;
  description: string;
  facts: CustomerItineraryFacts;
  sourceFingerprint: string;
}

const clean = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

const unique = (values: Array<string | undefined>): string[] =>
  [...new Set(values.filter((value): value is string => Boolean(value)))];

const metadataOf = (item: ItineraryItem): UnknownRecord =>
  item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata)
    ? item.metadata
    : {};

function routeForDay(day: ItineraryDay, transports: ItineraryItem[]): string | undefined {
  for (const item of transports) {
    const metadata = metadataOf(item);
    const serviceDay = Array.isArray(metadata.serviceDays)
      ? metadata.serviceDays.find((candidate: UnknownRecord) =>
          Number(candidate?.dayNumber) === Number(day.dayNumber) || candidate?.date === day.date)
      : undefined;
    const serviceRoute = clean(serviceDay?.route);
    if (serviceRoute) return serviceRoute;
    const routeName = clean(metadata.routeName);
    if (routeName) return routeName;
    const pickup = clean(metadata.pickupLocation ?? metadata.pickup);
    const dropoff = clean(metadata.dropoffLocation ?? metadata.dropoff);
    if (pickup && dropoff) return `${pickup} to ${dropoff}`;
  }
  return undefined;
}

function mealsForPlan(plan: unknown): string[] {
  switch (clean(plan)?.toUpperCase()) {
    case 'CP': return ['Breakfast'];
    case 'MAP': return ['Breakfast', 'Dinner'];
    case 'AP': return ['Breakfast', 'Lunch', 'Dinner'];
    default: return [];
  }
}

export function deriveCustomerItineraryFacts(day: ItineraryDay): CustomerItineraryFacts {
  const items = Array.isArray(day.items) ? day.items : [];
  const hotels = items.filter(item => item.type === 'HOTEL');
  const transports = items.filter(item => item.type === 'TRANSPORT' || item.type === 'TRANSFER');
  const activities = items.filter(item => item.type === 'ACTIVITY' || item.type === 'SIGHTSEEING');
  const route = routeForDay(day, transports);

  const placesFromTransport = transports.flatMap(item => {
    const metadata = metadataOf(item);
    const serviceDays = Array.isArray(metadata.serviceDays) ? metadata.serviceDays : [];
    return serviceDays
      .filter((candidate: UnknownRecord) => Number(candidate?.dayNumber) === Number(day.dayNumber) || candidate?.date === day.date)
      .flatMap((candidate: UnknownRecord) => Array.isArray(candidate.places) ? candidate.places.map(clean) : []);
  });
  const placesFromActivities = activities.map(item => clean(metadataOf(item).destinationName));
  const accommodation = hotels.map(item => {
    const metadata = metadataOf(item);
    const property = clean(metadata.propertyName) || clean(item.title) || 'Accommodation';
    const room = clean(metadata.roomCategoryName);
    return room ? `${property} — ${room}` : property;
  });
  const overnightLocation = hotels.length
    ? clean(metadataOf(hotels[0]).destinationName) || clean(day.location)
    : undefined;
  const activityName = (item: ItineraryItem) => clean(metadataOf(item).activityName) || clean(item.title) || 'Activity';
  const includedActivities = activities
    .filter(item => (clean(metadataOf(item).inclusionStatus) || 'INCLUDED') === 'INCLUDED')
    .map(activityName);
  const optionalActivities = activities
    .filter(item => clean(metadataOf(item).inclusionStatus) === 'OPTIONAL')
    .map(activityName);
  const notIncludedActivities = activities
    .filter(item => clean(metadataOf(item).inclusionStatus) === 'NOT_INCLUDED')
    .map(activityName);
  const transportServices = transports.map(item => clean(metadataOf(item).vehicleName) || clean(item.title) || 'Transport');
  const meals = unique(hotels.flatMap(item => mealsForPlan(metadataOf(item).mealPlan)));

  return {
    ...(route ? { route } : {}),
    placesCovered: unique([clean(day.location), ...placesFromTransport, ...placesFromActivities]),
    ...(overnightLocation ? { overnightLocation } : {}),
    accommodation: unique(accommodation),
    transportServices: unique(transportServices),
    includedActivities: unique(includedActivities),
    optionalActivities: unique(optionalActivities),
    notIncludedActivities: unique(notIncludedActivities),
    meals,
  };
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value ?? null;
  return Object.fromEntries(Object.keys(value as UnknownRecord).sort().map(key => [key, stableValue((value as UnknownRecord)[key])]));
}

function hash(value: unknown): string {
  const input = JSON.stringify(stableValue(value));
  let result = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    result ^= input.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return `v1-${(result >>> 0).toString(16).padStart(8, '0')}`;
}

/** Financial/rate provenance is deliberately excluded from narrative freshness. */
export function itineraryContentFingerprint(day: ItineraryDay): string {
  return hash({ dayNumber: day.dayNumber, date: day.date, location: day.location, facts: deriveCustomerItineraryFacts(day) });
}

function naturalRoute(route: string): string {
  return route.replace(/\s*(?:→|->)\s*/g, ' to ').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}

export function composeDetailedCustomerItinerary(day: ItineraryDay): ComposedCustomerItineraryDay {
  const facts = deriveCustomerItineraryFacts(day);
  const route = facts.route ? naturalRoute(facts.route) : undefined;
  const activityLead = facts.includedActivities[0];
  const serviceTypes = (day.items || []).map(item => clean(metadataOf(item).serviceType)).filter(Boolean) as string[];
  const isArrival = serviceTypes.some(value => value.includes('AIRPORT_PICKUP')) || /airport.*(?:to|→)/i.test(route || '');
  const isDeparture = serviceTypes.some(value => value.includes('AIRPORT_DROP')) || /(?:to|→).*airport/i.test(route || '');

  let title = `Day ${day.dayNumber} in ${clean(day.location) || 'Kashmir'}`;
  if (isArrival) title = `Arrival in ${clean(day.location)?.replace(/\s*\([^)]*\)\s*/g, '') || 'Kashmir'}`;
  else if (isDeparture) title = `Departure from ${clean(day.location)?.replace(/\s*Airport.*/i, '') || 'Kashmir'}`;
  else if (route) title = route;
  else if (activityLead) title = `${clean(day.location) || 'Kashmir'} — ${activityLead}`;

  const sentences: string[] = [];
  if (isArrival && route) sentences.push(`Welcome to Kashmir. On arrival, your planned transfer follows ${route}.`);
  else if (isDeparture && route) sentences.push(`After your stay, travel along ${route} for your onward departure.`);
  else if (route) sentences.push(`Travel along ${route}, with the day arranged around your confirmed route and services.`);
  else sentences.push(`Enjoy a thoughtfully paced day in ${clean(day.location) || 'Kashmir'} with the services shown in your package.`);
  if (facts.includedActivities.length) sentences.push(`Included today: ${facts.includedActivities.join(', ')}.`);
  if (facts.optionalActivities.length) sentences.push(`Optional experiences available at an additional charge: ${facts.optionalActivities.join(', ')}.`);
  if (facts.notIncludedActivities.length) sentences.push(`Not included in the package price: ${facts.notIncludedActivities.join(', ')}.`);
  if (facts.accommodation.length) sentences.push(`Your stay is arranged at ${facts.accommodation.join(', ')}.`);
  if (facts.meals.length) sentences.push(`${facts.meals.join(' and ')} ${facts.meals.length === 1 ? 'is' : 'are'} included as per the selected meal plan.`);

  return { title, description: sentences.join(' '), facts, sourceFingerprint: itineraryContentFingerprint(day) };
}

export function customerRelevantItemValue(item: ItineraryItem): unknown {
  const metadata = metadataOf(item);
  const allowedMetadata = item.type === 'HOTEL'
    ? ['propertyId', 'propertyName', 'roomCategoryId', 'roomCategoryName', 'mealPlan', 'checkInDate', 'checkOutDate', 'nights', 'rooms']
    : item.type === 'TRANSPORT' || item.type === 'TRANSFER'
      ? ['vehicleCategoryId', 'vehicleName', 'serviceType', 'routeId', 'routeName', 'startDate', 'serviceDays']
      : item.type === 'ACTIVITY' || item.type === 'SIGHTSEEING'
        ? ['activityId', 'activityName', 'date', 'duration', 'inclusionStatus', 'destinationName']
        : [];
  return stableValue({
    type: item.type,
    title: item.title,
    description: item.description,
    startTime: item.startTime,
    endTime: item.endTime,
    metadata: Object.fromEntries(allowedMetadata.map(key => [key, metadata[key]])),
  });
}

export function itineraryItemAffectsCustomerContent(before: ItineraryItem, after: ItineraryItem): boolean {
  return JSON.stringify(customerRelevantItemValue(before)) !== JSON.stringify(customerRelevantItemValue(after));
}

export function validateItineraryDayOrder(days: ItineraryDay[]): void {
  const ordered = [...days].sort((left, right) => left.dayNumber - right.dayNumber || left.date.localeCompare(right.date));
  const seen = new Set<number>();
  let previousDate = '';
  for (const day of ordered) {
    if (!Number.isInteger(day.dayNumber) || day.dayNumber < 1 || seen.has(day.dayNumber)) {
      throw new Error('Itinerary day numbers must be unique positive integers.');
    }
    if (previousDate && day.date < previousDate) throw new Error('Itinerary dates must follow day-number order.');
    seen.add(day.dayNumber);
    previousDate = day.date;
  }
}
