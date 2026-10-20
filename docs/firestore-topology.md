# Canonical Firestore topology

## Configuration model

BBOS uses two non-secret identifiers as its canonical Firebase topology:

- `FIREBASE_PROJECT_ID`: the Firebase project used by Auth and Firestore.
- `BBOS_FIRESTORE_DATABASE_ID`: the exact Firestore database ID. The literal `(default)` means the default database; a named database is supplied by its exact ID.

Vite injects these same variables into the browser build. The Admin SDK, startup validation, deployment-config generator, emulator fixtures, and migration utility consume the same normalized database representation. A missing production value is an error; production never converts missing configuration into `(default)`.

## Current source behavior

The browser and Admin SDK both call their database-aware `getFirestore` overload with the normalized database ID. Production browser initialization and server startup require explicit project and database values. The server logs only project ID, database ID, runtime mode, and emulator state. These are identifiers, not credentials.

Local development and tests may use an explicit `(default)` fallback. The checked-in QA emulator configuration also declares `(default)`. The installed Firebase Emulator Suite reports that multiple Firestore databases are unsupported, so named-database behavior is covered by configuration parity tests while persistence tests use the isolated default emulator database.

Firebase Auth initialization remains unchanged in authority: a verified Firebase UID must resolve to exactly one active employee in the configured database, and the canonical BBOS `employeeId` remains distinct from the UID.

## Production setup requirement

The repository does not establish whether the named database previously embedded in the browser config or the project's default database contains the authoritative production dataset. Set neither production target by inference. The required decision state is:

`PRODUCTION_DATABASE_SELECTION_REQUIRES_APPROVAL`

After an approved inspection identifies the authoritative dataset, set both variables in the runtime and build environment. `FIREBASE_PROJECT_ID` must match the checked-in Firebase web-app project. Do not commit credentials or environment-specific database values.

## Rules and index targeting

Firebase CLI supports an explicit `firestore.database` entry. Generate a reviewable config from the approved environment:

```powershell
$env:FIREBASE_PROJECT_ID='<approved-project-id>'
$env:BBOS_FIRESTORE_DATABASE_ID='<approved-database-id-or-(default)>'
bun run firestore:deploy-config -- --confirm-project $env:FIREBASE_PROJECT_ID --confirm-database $env:BBOS_FIRESTORE_DATABASE_ID
```

The command prints a configuration containing the exact database plus `firestore.rules` and `firestore.indexes.json`. Save and review it before any separately approved Firebase CLI command. This sprint does not deploy rules or indexes.

## Validation procedure

1. Confirm production startup rejects missing, invalid, or mismatched identifiers.
2. Confirm startup logs the approved project/database pair without credentials.
3. In an isolated nonproduction project, seed a unique record in the approved database using Admin SDK.
4. Confirm the authenticated API resolves the record and the browser uses the same compiled topology.
5. Verify active, inactive, and unmapped Firebase identities; include a UID distinct from `employeeId`.
6. Run unit, type, build, browser, rules, and full Firebase emulator suites.
7. Review generated rules/index configuration and Firebase CLI project arguments together.
8. Record document counts and sampled identifiers before and after any approved release.

## Production inventory and migration hard stop

No production inspection, copy, delete, rename, rules deployment, index deployment, or migration is authorized by this document. An approved process must complete these steps:

1. Inventory all Firestore databases in the project.
2. Record collection and document counts for both default and named candidates.
3. Sample non-sensitive key identifiers, including employees, Leads, Trips, Quotes, and Bookings.
4. Determine the authoritative dataset with business and operational owners.
5. Create and verify an export/backup for every affected database.
6. Define an idempotent copy or migration strategy only if consolidation is required.
7. Define validation checks for identity, ownership, financial snapshots, references, rules, and indexes.
8. Define rollback triggers and the exact restore/config-reversion procedure.
9. Approve a maintenance window, write freeze, communications, and accountable operators.
10. Perform post-migration counts, sampled record checks, API/browser acceptance, monitoring, and sign-off.

## Rollback plan template

Record the approved source and target database IDs, export locations, configuration version, deployment commit, responsible operator, start/end times, validation results, and rollback threshold. Rollback restores the reviewed configuration and data export, reruns rules/index targeting checks, restarts the service, and repeats identity plus domain acceptance. Never fall back automatically to another database after an error.
