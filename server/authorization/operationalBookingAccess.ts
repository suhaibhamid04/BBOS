import type { Booking } from '../../src/types/booking.js';
import type { AuthorizationPrincipal } from './policyTypes.js';
import { authorizeResource } from './policyEngine.js';
import { bookingResourceContext } from './resourceContext.js';

/** Role admission is separate from assignment; both must hold before any read or write. */
export function canAccessOperationalBooking(
  actor: AuthorizationPrincipal,
  booking: Booking,
  action: 'DISPATCH_OPERATIONS' | 'GENERATE_VOUCHERS',
): boolean {
  if (!['Founder', 'Admin', 'Operations'].includes(actor.role)) return false;
  // Transition validation remains in the service and returns its established
  // workflow error after principal and assignment authorization succeeds.
  return authorizeResource(actor, 'BOOKING', action, bookingResourceContext(booking)).allowed;
}
