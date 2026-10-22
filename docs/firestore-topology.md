# Canonical Firebase environment topology

BBOS has three explicit runtime profiles. There is no project or database fallback.

| Profile | Project | Database | Browser/Admin behavior |
|---|---|---|---|
| Development | Explicit nonproduction project, currently `universal-arcana-hfjbn` | Explicit approved named database | Local server allowed; live production project rejected |
| Test | Isolated test project ID | Explicit `(default)` emulator database | Firestore/Auth emulators required; live access rejected |
| Production | `booking-bridge-bbos-prod` | Explicit `(default)` | Requires production process/build profile and complete browser config |

## Required configuration

The server reads `BBOS_ENVIRONMENT`, `FIREBASE_PROJECT_ID`, and `BBOS_FIRESTORE_DATABASE_ID`. The browser reads the corresponding `VITE_BBOS_ENVIRONMENT`, `VITE_FIREBASE_PROJECT_ID`, and `VITE_BBOS_FIRESTORE_DATABASE_ID` values. The exact literal `(default)` is preserved.

The browser also requires the public Web App identifiers `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_APP_ID`, and `VITE_FIREBASE_AUTH_DOMAIN`. Optional storage, sender, and measurement identifiers are listed in `.env.example`. Firebase Admin credentials remain server-only and outside the repository.

`firebase-applet-config.json` is a legacy local artifact and is no longer imported by browser or server source. Local production and development values belong in separate untracked environment configuration, not in source imports.

## Fail-closed controls

- Production must target `booking-bridge-bbos-prod` and `(default)` explicitly.
- Development rejects the production project.
- Tests require the Firebase emulator environment and reject live projects.
- Browser and Admin normalize the same explicit project/database pair.
- Missing, invalid, conflicting, or whitespace-padded identifiers stop initialization with an actionable error.
- Unit tests preload an isolated project ID before application modules load, so a developer `.env` cannot direct them to live Firebase.

An approved local production diagnostic requires all four matching flags:

```text
BBOS_LOCAL_PRODUCTION_DIAGNOSTIC=true
BBOS_READ_ONLY_DIAGNOSTIC=true
VITE_BBOS_LOCAL_PRODUCTION_DIAGNOSTIC=true
VITE_BBOS_READ_ONLY_DIAGNOSTIC=true
```

The server denies every non-GET/HEAD/OPTIONS API request in that mode. This mode is for deliberate inspection only and is not a development profile.

## Rules and index targeting

Rules and indexes remain tied to an explicit reviewed Firebase CLI configuration. Generate a reviewable config only with matching confirmation arguments:

```powershell
$env:FIREBASE_PROJECT_ID='<approved-project-id>'
$env:BBOS_FIRESTORE_DATABASE_ID='<approved-database-id-or-(default)>'
bun run firestore:deploy-config -- --confirm-project $env:FIREBASE_PROJECT_ID --confirm-database $env:BBOS_FIRESTORE_DATABASE_ID
```

Generation does not authorize deployment. No deployment or production data operation is part of this sprint.

## Identity boundary

Firebase Authentication establishes a UID. `/api/auth/me` authoritatively resolves that UID to exactly one active `employees` record and returns the canonical BBOS `employeeId`, role, and organizational scope. Inactive, unmapped, ambiguous, and unknown-role identities fail closed. Client role switching is available only in explicit demo mode.
