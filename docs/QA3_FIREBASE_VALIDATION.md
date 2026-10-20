# QA3 Firebase validation

The QA3 target is isolated to the synthetic Firebase project ID `bbos-qa3-local`.
It must not be pointed at a production project.
Its Firestore topology is explicitly `(default)` because the installed emulator
does not support multiple databases.

## Prerequisites

- Java 21 or newer on `PATH` for the Firestore Emulator.
- Dependencies installed with `bun install`.

## Commands

- Auth-only production token validation: `bun run test:auth-emulator`
- Full Auth + Firestore browser workflow: `bun run test:e2e:firebase`
- Existing explicit-demo browser suite: `bun run test:e2e`

The full target starts Auth and Firestore emulators, starts BBOS with demo mode
disabled, and runs only `tests/e2e/firebase-sales-flow.e2e.ts`.

## Index deployment

Generate a reviewed database-specific Firebase config before any approved deploy:

`bun run firestore:deploy-config -- --confirm-project <project-id> --confirm-database <database-id>`

The generator requires matching `FIREBASE_PROJECT_ID` and
`BBOS_FIRESTORE_DATABASE_ID`. Use the resulting config with an explicit
`--project`; deploy rules/indexes only after review and successful emulator tests.
See [the topology guide](firestore-topology.md). No deploy is part of local QA.

## Legacy Lead team backfill

Dry run is the default:

`$env:FIREBASE_PROJECT_ID='<project-id>'; $env:BBOS_FIRESTORE_DATABASE_ID='<database-id>'; bun run migrate:leads:team`

Mutation requires both flags and an exact project confirmation:

`$env:FIREBASE_PROJECT_ID='<project-id>'; $env:BBOS_FIRESTORE_DATABASE_ID='<database-id>'; bun run migrate:leads:team --apply --confirm-project <project-id> --confirm-database <database-id>`

The utility skips missing, ambiguous, inactive, non-Sales, and teamless employee
records. Apply mode rechecks each Lead transactionally and writes an audit event.
