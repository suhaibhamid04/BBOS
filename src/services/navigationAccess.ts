import type { RolePermissions } from '../types';

/**
 * Derives UX/navigation visibility from role permissions. This is not an
 * authorization boundary; every API operation must still enforce server-side
 * policy.
 */
export function getRoleNavigationVisibility(permissions: RolePermissions) {
  const accommodation =
    permissions.canManageAccommodation ||
    permissions.canManageNegotiatedRates ||
    permissions.canManageReservations;
  const transport = permissions.canManageOperations || permissions.canManageReservations;
  const activities = permissions.canManageOperations || permissions.canManageReservations;

  return {
    // Preserve the existing seven-role navigation until its authorization is
    // redesigned; only the new, intentionally fail-closed role is excluded.
    crm: permissions.role !== 'Reservations',
    sales: permissions.role !== 'Reservations',
    tripsAndBookings: permissions.canManageTrips || permissions.canManageBookings,
    bookings: permissions.canManageBookings,
    accommodation,
    transport,
    activities,
    inventory: accommodation || transport || activities,
    operations: permissions.canManageOperations,
  };
}
