import type { AccommodationProperty, RatePeriod, RoomCategory } from '../../types/accommodation';
import type { ActivityMaster, ActivityRatePeriod } from '../../types/activity';
import type { Supplier } from '../../types';
import type { TransportRatePeriod, VehicleCategory } from '../../types/transport';
import { authenticatedMutationHeaders, authenticatedReadHeaders } from '../auth/authenticatedApi';

async function request<T>(url: string, employeeId: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? await authenticatedReadHeaders(employeeId) : await authenticatedMutationHeaders(employeeId),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload?.error === 'string' ? payload.error : `Request failed (${response.status})`);
  return payload.data as T;
}

export const inventoryApi = {
  properties: (employeeId: string) => request<AccommodationProperty[]>('/api/accommodation/properties', employeeId),
  createProperty: (value: Partial<AccommodationProperty>, employeeId: string) => request<AccommodationProperty>('/api/accommodation/properties', employeeId, 'POST', value),
  updateProperty: (id: string, value: Partial<AccommodationProperty>, employeeId: string) => request<AccommodationProperty>(`/api/accommodation/properties/${encodeURIComponent(id)}`, employeeId, 'PATCH', value),
  rooms: (propertyId: string, employeeId: string) => request<RoomCategory[]>(`/api/accommodation/properties/${encodeURIComponent(propertyId)}/rooms`, employeeId),
  allRooms: (employeeId: string) => request<RoomCategory[]>('/api/accommodation/rooms', employeeId),
  createRoom: (value: Partial<RoomCategory>, employeeId: string) => request<RoomCategory>('/api/accommodation/rooms', employeeId, 'POST', value),
  updateRoom: (id: string, value: Partial<RoomCategory>, employeeId: string) => request<RoomCategory>(`/api/accommodation/rooms/${encodeURIComponent(id)}`, employeeId, 'PATCH', value),
  accommodationRates: (propertyId: string, employeeId: string) => request<RatePeriod[]>(`/api/accommodation/properties/${encodeURIComponent(propertyId)}/rates`, employeeId),
  allAccommodationRates: (employeeId: string) => request<RatePeriod[]>('/api/accommodation/rates', employeeId),
  createAccommodationRate: (value: Partial<RatePeriod>, employeeId: string) => request<RatePeriod>('/api/accommodation/rates', employeeId, 'POST', value),
  updateAccommodationRate: (id: string, value: Partial<RatePeriod>, employeeId: string) => request<RatePeriod>(`/api/accommodation/rates/${encodeURIComponent(id)}`, employeeId, 'PATCH', value),
  accommodationSuppliers: (employeeId: string) => request<Supplier[]>('/api/accommodation/suppliers', employeeId),
  createAccommodationSupplier: (value: Partial<Supplier>, employeeId: string) => request<Supplier>('/api/accommodation/suppliers', employeeId, 'POST', value),

  vehicles: (employeeId: string) => request<VehicleCategory[]>('/api/transport/vehicle-categories', employeeId),
  createVehicle: (value: Partial<VehicleCategory>, employeeId: string) => request<VehicleCategory>('/api/transport/vehicle-categories', employeeId, 'POST', value),
  updateVehicle: (id: string, value: Partial<VehicleCategory>, employeeId: string) => request<VehicleCategory>(`/api/transport/vehicle-categories/${encodeURIComponent(id)}`, employeeId, 'PATCH', value),
  transportRates: (employeeId: string) => request<TransportRatePeriod[]>('/api/transport/rates', employeeId),
  createTransportRate: (value: Partial<TransportRatePeriod>, employeeId: string) => request<TransportRatePeriod>('/api/transport/rates', employeeId, 'POST', value),
  updateTransportRate: (id: string, value: Partial<TransportRatePeriod>, employeeId: string) => request<TransportRatePeriod>(`/api/transport/rates/${encodeURIComponent(id)}`, employeeId, 'PATCH', value),
  transportSuppliers: (employeeId: string) => request<Supplier[]>('/api/transport/suppliers', employeeId),
  createTransportSupplier: (value: Partial<Supplier>, employeeId: string) => request<Supplier>('/api/transport/suppliers', employeeId, 'POST', value),
  updateTransportSupplier: (id: string, value: Partial<Supplier>, employeeId: string) => request<Supplier>(`/api/transport/suppliers/${encodeURIComponent(id)}`, employeeId, 'PATCH', value),

  activities: (employeeId: string) => request<ActivityMaster[]>('/api/activities/masters', employeeId),
  createActivity: (value: Partial<ActivityMaster>, employeeId: string) => request<ActivityMaster>('/api/activities/masters', employeeId, 'POST', value),
  updateActivity: (id: string, value: Partial<ActivityMaster>, employeeId: string) => request<ActivityMaster>(`/api/activities/masters/${encodeURIComponent(id)}`, employeeId, 'PATCH', value),
  activityRates: (employeeId: string) => request<ActivityRatePeriod[]>('/api/activities/rates', employeeId),
  createActivityRate: (value: Partial<ActivityRatePeriod>, employeeId: string) => request<ActivityRatePeriod>('/api/activities/rates', employeeId, 'POST', value),
  updateActivityRate: (id: string, value: Partial<ActivityRatePeriod>, employeeId: string) => request<ActivityRatePeriod>(`/api/activities/rates/${encodeURIComponent(id)}`, employeeId, 'PATCH', value),
  activityProviders: (employeeId: string) => request<Supplier[]>('/api/activities/providers', employeeId),
  createActivityProvider: (value: Partial<Supplier>, employeeId: string) => request<Supplier>('/api/activities/providers', employeeId, 'POST', value),
  updateActivityProvider: (id: string, value: Partial<Supplier>, employeeId: string) => request<Supplier>(`/api/activities/providers/${encodeURIComponent(id)}`, employeeId, 'PATCH', value),
};
