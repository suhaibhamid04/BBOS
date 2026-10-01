import { randomUUID } from 'node:crypto';
import { getAdminDb } from '../server/firebaseAdmin.js';

type UnknownRecord = Record<string, unknown>;

const applyMode = process.argv.includes('--apply');
const confirmIndex = process.argv.indexOf('--confirm-project');
const confirmedProject = confirmIndex >= 0 ? process.argv[confirmIndex + 1] : undefined;
const configuredProject = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT;

if (applyMode && (!configuredProject || confirmedProject !== configuredProject)) {
  throw new Error('Apply mode requires --confirm-project matching FIREBASE_PROJECT_ID or GCLOUD_PROJECT.');
}

const db = getAdminDb();
const report = {
  mode: applyMode ? 'APPLY' : 'DRY_RUN',
  projectId: configuredProject || 'application-default-project',
  scanned: 0,
  alreadyAttributed: 0,
  eligible: 0,
  applied: 0,
  skippedMissingOwner: 0,
  skippedMissingEmployee: 0,
  skippedAmbiguousEmployee: 0,
  skippedInactiveOrInvalidEmployee: 0,
  skippedMissingTeam: 0,
  candidates: [] as Array<{ leadId: string; ownerEmployeeId: string; salesTeamId: string }>,
};

async function resolveEmployee(ownerEmployeeId: string) {
  const employees = db.collection('employees');
  const [canonical, legacy] = await Promise.all([
    employees.where('employeeId', '==', ownerEmployeeId).limit(2).get(),
    employees.doc(ownerEmployeeId).get(),
  ]);
  const matches = new Map<string, FirebaseFirestore.DocumentSnapshot>();
  canonical.docs.forEach((document) => matches.set(document.id, document));
  if (legacy.exists) matches.set(legacy.id, legacy);
  if (matches.size === 0) return { outcome: 'MISSING' as const };
  if (matches.size !== 1) return { outcome: 'AMBIGUOUS' as const };
  const document = [...matches.values()][0];
  const employee = (document.data() || {}) as UnknownRecord;
  const canonicalEmployeeId = typeof employee.employeeId === 'string' && employee.employeeId.trim()
    ? employee.employeeId.trim()
    : document.id;
  if (canonicalEmployeeId !== ownerEmployeeId || employee.active !== true || !['Sales Executive', 'Sales Manager'].includes(String(employee.role))) {
    return { outcome: 'INVALID' as const };
  }
  const team = typeof employee.salesTeamId === 'string' && employee.salesTeamId.trim()
    ? employee.salesTeamId.trim()
    : typeof employee.teamId === 'string' && employee.teamId.trim()
      ? employee.teamId.trim()
      : '';
  if (!team) return { outcome: 'MISSING_TEAM' as const };
  return { outcome: 'FOUND' as const, salesTeamId: team };
}

const leads = await db.collection('leads').get();
for (const document of leads.docs) {
  report.scanned += 1;
  const lead = (document.data() || {}) as UnknownRecord;
  if (typeof lead.salesTeamId === 'string' && lead.salesTeamId.trim()) {
    report.alreadyAttributed += 1;
    continue;
  }
  const ownerEmployeeId = typeof lead.assignedEmployeeId === 'string' ? lead.assignedEmployeeId.trim() : '';
  if (!ownerEmployeeId) {
    report.skippedMissingOwner += 1;
    continue;
  }
  const resolution = await resolveEmployee(ownerEmployeeId);
  if (resolution.outcome === 'MISSING') { report.skippedMissingEmployee += 1; continue; }
  if (resolution.outcome === 'AMBIGUOUS') { report.skippedAmbiguousEmployee += 1; continue; }
  if (resolution.outcome === 'INVALID') { report.skippedInactiveOrInvalidEmployee += 1; continue; }
  if (resolution.outcome === 'MISSING_TEAM') { report.skippedMissingTeam += 1; continue; }

  report.eligible += 1;
  report.candidates.push({ leadId: document.id, ownerEmployeeId, salesTeamId: resolution.salesTeamId });
  if (!applyMode) continue;

  const applied = await db.runTransaction(async (transaction) => {
    const latest = await transaction.get(document.ref);
    const latestData = (latest.data() || {}) as UnknownRecord;
    if (!latest.exists || (typeof latestData.salesTeamId === 'string' && latestData.salesTeamId.trim())) return false;
    const timestamp = new Date().toISOString();
    transaction.update(document.ref, {
      salesTeamId: resolution.salesTeamId,
      updatedAt: timestamp,
      updatedByEmployeeId: 'migration:lead-sales-team-backfill',
    });
    const auditId = `audit-${randomUUID()}`;
    transaction.create(db.collection('audit_logs').doc(auditId), {
      id: auditId,
      action: 'LEAD_TEAM_BACKFILLED',
      entityType: 'LEAD',
      entityId: document.id,
      actor: { id: 'migration:lead-sales-team-backfill', name: 'Lead team backfill', role: 'SYSTEM' },
      before: { salesTeamId: latestData.salesTeamId ?? null, assignedEmployeeId: ownerEmployeeId },
      after: { salesTeamId: resolution.salesTeamId, assignedEmployeeId: ownerEmployeeId },
      summary: 'Backfilled Lead team from authoritative employee ownership.',
      timestamp,
    });
    return true;
  });
  if (applied) report.applied += 1;
}

console.log(JSON.stringify(report, null, 2));
