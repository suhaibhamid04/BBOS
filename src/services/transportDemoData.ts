import {
  VehicleCategory,
  Destination,
  TransportRoute,
  TransportRatePeriod,
  TransportSupplement
} from '../types';

export const DEMO_VEHICLE_CATEGORIES: VehicleCategory[] = [
  {
    id: 'vc_innova_crysta',
    name: 'Innova Crysta AC',
    displayName: 'Toyota Innova Crysta (AC)',
    category: 'MUV',
    seatingCapacity: 7,
    passengerCapacity: 6,
    luggageCapacity: '4 large bags',
    operationalRegions: ['Kashmir', 'Jammu', 'Ladakh'],
    features: ['AC', 'Heater', 'Comfortable Seating'],
    active: true,
    sortOrder: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDemo: true
  },
  {
    id: 'vc_sedan',
    name: 'Sedan AC',
    displayName: 'Sedan (Etios/Dzire)',
    category: 'SEDAN',
    seatingCapacity: 5,
    passengerCapacity: 4,
    luggageCapacity: '2 large bags',
    operationalRegions: ['Kashmir', 'Jammu'],
    features: ['AC', 'Heater'],
    active: true,
    sortOrder: 2,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDemo: true
  },
  {
    id: 'vc_tempo_12',
    name: 'Tempo Traveller 12 Seater',
    displayName: '12-Seater Tempo Traveller',
    category: 'TEMPO_TRAVELLER',
    seatingCapacity: 13,
    passengerCapacity: 12,
    luggageCapacity: '10 large bags',
    operationalRegions: ['Kashmir', 'Ladakh'],
    features: ['AC', 'Pushback Seats'],
    active: true,
    sortOrder: 3,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDemo: true
  }
];

export const DEMO_DESTINATIONS: Destination[] = [
  {
    id: 'dest_srinagar',
    name: 'Srinagar',
    region: 'Kashmir',
    state: 'Jammu & Kashmir',
    category: 'CITY',
    altitude: 1585,
    active: true,
    sortOrder: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDemo: true
  },
  {
    id: 'dest_gulmarg',
    name: 'Gulmarg',
    region: 'Kashmir',
    state: 'Jammu & Kashmir',
    category: 'HILL_STATION',
    altitude: 2650,
    active: true,
    sortOrder: 2,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDemo: true
  },
  {
    id: 'dest_pahalgam',
    name: 'Pahalgam',
    region: 'Kashmir',
    state: 'Jammu & Kashmir',
    category: 'VALLEY',
    altitude: 2740,
    active: true,
    sortOrder: 3,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDemo: true
  }
];

export const DEMO_TRANSPORT_ROUTES: TransportRoute[] = [
  {
    id: 'route_sgr_glg_sgr',
    name: 'Srinagar → Gulmarg → Srinagar',
    origin: 'dest_srinagar',
    destination: 'dest_srinagar',
    waypoints: ['dest_gulmarg'],
    routeType: 'DAY_TRIP',
    estimatedDistanceKm: 100,
    estimatedDurationHours: 4,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDemo: true
  },
  {
    id: 'route_sgr_airport_transfer',
    name: 'Srinagar Airport Transfer',
    origin: 'dest_srinagar',
    destination: 'dest_srinagar',
    routeType: 'ONE_WAY',
    estimatedDistanceKm: 15,
    estimatedDurationHours: 1,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDemo: true
  }
];

export const DEMO_TRANSPORT_RATE_PERIODS: TransportRatePeriod[] = [
  {
    id: 'trp_innova_kashmir_season',
    vehicleCategoryId: 'vc_innova_crysta',
    supplierId: 'sup_trans_1',
    serviceType: 'MULTI_DAY_JOURNEY',
    pricingUnit: 'PER_DAY',
    baseRate: 2000,
    currency: 'INR',
    validFrom: '2026-04-01T00:00:00Z',
    validTo: '2026-10-31T23:59:59Z',
    seasonLabel: 'Peak Season',
    inclusions: {
      vehicle: 'INCLUDED',
      driver: 'INCLUDED',
      fuel: 'INCLUDED',
      toll: 'INCLUDED',
      parking: 'INCLUDED',
      tax: 'INCLUDED',
      driverAllowance: 'INCLUDED',
      nightHalt: 'INCLUDED',
      permits: 'INCLUDED'
    },
    availabilityStatus: 'AVAILABLE',
    taxTreatment: 'INCLUSIVE',
    confirmationStatus: 'CONFIRMED',
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDemo: true
  }
];

export const DEMO_TRANSPORT_SUPPLEMENTS: TransportSupplement[] = [
  {
    id: 'ts_night_halt_1',
    ratePeriodId: 'trp_innova_kashmir_season',
    type: 'NIGHT_HALT',
    name: 'Driver Night Halt (Ladakh)',
    amount: 500,
    unit: 'per_night',
    isDemo: true
  }
];
