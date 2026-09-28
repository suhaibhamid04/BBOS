import type { BookingStatus } from './booking';
import type { EmergencySpendRequest, OperationalChangeRequest, OperationalIssue } from './liveOperations';

export type OperationalReadiness = 'READY' | 'ATTENTION_REQUIRED' | 'NOT_READY';
export type OperationalItemType =
  | 'ARRIVAL'
  | 'DEPARTURE'
  | 'HOTEL_CHECK_IN'
  | 'HOTEL_CHECK_OUT'
  | 'TRANSPORT'
  | 'ACTIVITY';

export interface OperationalItemDetails {
  propertyName?: string;
  roomCategoryName?: string;
  mealPlan?: string;
  guestNames?: string[];
  confirmationReference?: string;
  transporterName?: string;
  transporterPhone?: string;
  driverName?: string;
  driverPhone?: string;
  vehicleRegistrationNumber?: string;
  vehicleCategoryName?: string;
  pickupLocation?: string;
  dropoffLocation?: string;
  providerName?: string;
  providerPhone?: string;
  assignedGuideName?: string;
  assignedGuidePhone?: string;
  participantCount?: number;
  destinationName?: string;
  operationalNotes?: string;
  specialRequests?: string;
}

export interface OperationalItem {
  id: string;
  type: OperationalItemType;
  title: string;
  date: string;
  time?: string;
  bookingId: string;
  bookingReference: string;
  bookingStatus: BookingStatus;
  customerId: string;
  customerName?: string;
  customerPhone?: string;
  serviceId?: string;
  serviceStatus: string;
  assignedOperationsEmployeeId?: string;
  commercialClearance: 'CLEARED' | 'NOT_CLEARED';
  readiness: OperationalReadiness;
  details: OperationalItemDetails;
}

export type OperationalAttentionCode =
  | 'OPERATIONS_ASSIGNMENT_MISSING'
  | 'BOOKING_NOT_OPERATIONALLY_READY'
  | 'SERVICE_UNCONFIRMED'
  | 'HOTEL_CONFIRMATION_PENDING'
  | 'DRIVER_DETAILS_MISSING'
  | 'VEHICLE_DETAILS_MISSING'
  | 'REQUIRED_SERVICE_DATA_MISSING'
  | 'HIGH_PRIORITY_GUEST_ISSUE'
  | 'EMERGENCY_SPEND_APPROVAL_REQUIRED'
  | 'COMMERCIAL_CHANGE_FOLLOW_UP_REQUIRED';

export interface OperationalAttentionItem {
  id: string;
  code: OperationalAttentionCode;
  severity: 'HIGH' | 'MEDIUM';
  message: string;
  bookingId: string;
  bookingReference: string;
  customerName?: string;
  serviceId?: string;
  serviceType?: 'ACCOMMODATION' | 'TRANSPORT' | 'ACTIVITY';
  date?: string;
  assignedOperationsEmployeeId?: string;
  relatedRecordId?: string;
}

export interface OperationsControlRoomResponse {
  asOf: string;
  horizonEnd: string;
  today: OperationalItem[];
  upcoming: OperationalItem[];
  attentionRequired: OperationalAttentionItem[];
  openIssues: OperationalIssue[];
  pendingSpendRequests: EmergencySpendRequest[];
  commercialChangeRequests: OperationalChangeRequest[];
  summary: {
    todayCount: number;
    upcomingCount: number;
    attentionCount: number;
    readyCount: number;
    openIssueCount: number;
    pendingSpendCount: number;
    commercialFollowUpCount: number;
  };
}

export interface OperationsAssignmentInput {
  operationsEmployeeId: string;
  reason?: string;
}
