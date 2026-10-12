export interface CostingFreshnessRecord {
  costingStatus?: string;
  costingRevision?: number;
  costingCalculatedRevision?: number;
  packageReview?: { required?: boolean };
}

/**
 * Legacy calculated Trips did not persist revision counters. They remain
 * readable as calculated. Once a Trip has a costingRevision, only a result
 * calculated for that exact revision is current.
 */
export function isTripCostingFresh(trip: CostingFreshnessRecord | null | undefined): boolean {
  if (!trip || trip.packageReview?.required === true || trip.costingStatus !== 'CALCULATED') return false;
  if (trip.costingRevision === undefined) return true;
  return trip.costingCalculatedRevision !== undefined
    && Number(trip.costingCalculatedRevision) === Number(trip.costingRevision);
}
