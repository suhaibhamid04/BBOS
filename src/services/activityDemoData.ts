import {
  ActivityMaster,
  ActivityRatePeriod
} from '../types';

export const DEMO_ACTIVITY_MASTERS: ActivityMaster[] = [
  {
    id: 'act_gondola_ph1',
    name: 'Gulmarg Gondola Phase 1',
    category: 'GONDOLA_CABLE_CAR',
    destinationId: 'dest_gulmarg',
    supplierId: 'sup_gondola_1',
    description: 'Breathtaking cable car ride from Gulmarg resort to Kongdoori Valley.',
    customerDescription: 'Experience one of the highest cable cars in the world. Phase 1 takes you to Kongdoori Valley.',
    duration: '2-3 hours',
    operatingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    operatingSessions: ['09:00', '11:00', '13:00', '15:00'],
    requiresGuide: false,
    requiresPermit: false,
    inclusions: ['Return ticket for Phase 1'],
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDemo: true
  },
  {
    id: 'act_shikara_ride',
    name: 'Private Shikara Ride on Dal Lake',
    category: 'SIGHTSEEING',
    destinationId: 'dest_srinagar',
    supplierId: 'sup_shikara_1',
    description: 'Peaceful boat ride exploring the floating markets and gardens of Dal Lake.',
    duration: '1 hour',
    maxParticipants: 4,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDemo: true
  },
  {
    id: 'act_aru_betaab',
    name: 'Aru & Betaab Valley Union Jeep Tour',
    category: 'EXCURSION',
    destinationId: 'dest_pahalgam',
    supplierId: 'sup_union_pahalgam',
    description: 'Local union jeep tour to the picturesque Aru Valley, Betaab Valley, and Chandanwari.',
    duration: 'Half day',
    maxParticipants: 7,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDemo: true
  }
];

export const DEMO_ACTIVITY_RATE_PERIODS: ActivityRatePeriod[] = [
  {
    id: 'arp_gondola_ph1_standard',
    activityId: 'act_gondola_ph1',
    supplierId: 'sup_gondola_1',
    pricingModel: 'PER_PERSON',
    pricingComponents: {
      adult: 810,
      child: 810 // Same rate for children usually
    },
    currency: 'INR',
    validFrom: '2026-01-01T00:00:00Z',
    validTo: null,
    availabilityStatus: 'AVAILABLE',
    taxTreatment: 'INCLUSIVE',
    confirmationStatus: 'CONFIRMED',
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDemo: true
  },
  {
    id: 'arp_shikara_standard',
    activityId: 'act_shikara_ride',
    supplierId: 'sup_shikara_1',
    pricingModel: 'PER_VEHICLE',
    pricingComponents: {
      vehicle: 800,
      capacity: 4
    },
    currency: 'INR',
    validFrom: '2026-04-01T00:00:00Z',
    validTo: '2026-10-31T23:59:59Z',
    availabilityStatus: 'AVAILABLE',
    taxTreatment: 'INCLUSIVE',
    confirmationStatus: 'CONFIRMED',
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDemo: true
  },
  {
    id: 'arp_aru_betaab_standard',
    activityId: 'act_aru_betaab',
    supplierId: 'sup_union_pahalgam',
    pricingModel: 'PER_VEHICLE',
    pricingComponents: {
      vehicle: 2400,
      capacity: 7
    },
    currency: 'INR',
    validFrom: '2026-01-01T00:00:00Z',
    validTo: null,
    availabilityStatus: 'AVAILABLE',
    taxTreatment: 'INCLUSIVE',
    confirmationStatus: 'CONFIRMED',
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDemo: true
  }
];
