export type CustomerPackageServiceType = 'HOTEL' | 'TRANSPORT' | 'ACTIVITY' | 'OTHER';

export interface CustomerPackageItineraryItem {
  type: CustomerPackageServiceType;
  title: string;
  description?: string;
  propertyName?: string;
  roomCategoryName?: string;
  mealPlan?: string;
  checkInDate?: string;
  checkOutDate?: string;
  rooms?: number;
  vehicleName?: string;
  routeName?: string;
  serviceDate?: string;
  activityName?: string;
}

export interface CustomerPackageDay {
  dayNumber: number;
  date: string;
  title: string;
  location?: string;
  items: CustomerPackageItineraryItem[];
}

export interface CustomerPackageDocument {
  brand: {
    name: 'Booking Bridge';
    tagline: 'Travel, thoughtfully arranged';
    email: string;
    phone: string;
  };
  packageReference: string;
  customerName: string;
  destination: string;
  travelStartDate?: string;
  travelEndDate?: string;
  travelerCount: number;
  hotels: Array<{
    hotelName: string;
    roomCategoryName: string;
    mealPlan: string;
    checkInDate?: string;
    checkOutDate?: string;
    nights: number;
    rooms: number;
  }>;
  transports: Array<{
    vehicleName: string;
    route: string;
    serviceDate?: string;
    days: number;
    passengerCount: number;
  }>;
  activities: Array<{
    activityName: string;
    serviceDate?: string;
    participantCount: number;
  }>;
  itinerary: CustomerPackageDay[];
  packageSellingPrice: number;
  currency: string;
  inclusions: string[];
  exclusions: string[];
  termsAndConditions?: string;
  generatedAt: string;
}

export type QuoteShareChannel = 'DOCUMENT' | 'EMAIL' | 'WHATSAPP';

export interface QuoteShareResult {
  quote: import('./index').Quote;
  customerPackage: CustomerPackageDocument;
}
