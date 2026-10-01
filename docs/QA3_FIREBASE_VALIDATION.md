# QA3 Firebase validation

The QA3 target is isolated to the synthetic Firebase project ID `bbos-qa3-local`.
It must not be pointed at a production project.

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

After staging review, deploy the repository index definition explicitly:

`firebase deploy --only firestore:indexes --project <staging-or-production-project-id>`

Deploy rules separately only after rules tests and environment review:

`firebase deploy --only firestore:rules --project <staging-or-production-project-id>`

## Legacy Lead team backfill

Dry run is the default:

`$env:FIREBASE_PROJECT_ID='<project-id>'; bun run migrate:leads:team`

Mutation requires both flags and an exact project confirmation:

`$env:FIREBASE_PROJECT_ID='<project-id>'; bun run migrate:leads:team --apply --confirm-project <project-id>`

The utility skips missing, ambiguous, inactive, non-Sales, and teamless employee
records. Apply mode rechecks each Lead transactionally and writes an audit event.
