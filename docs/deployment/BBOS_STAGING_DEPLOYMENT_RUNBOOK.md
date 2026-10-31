# BBOS isolated staging deployment runbook

This runbook is for `booking-bridge-bbos-stage` only. It describes future
manual actions; none of these cloud commands were run while preparing the
repository.

## Fixed staging topology

| Resource | Staging value |
| --- | --- |
| Firebase/GCP project | `booking-bridge-bbos-stage` |
| Hosting site | `booking-bridge-bbos-stage` |
| Browser origin | `https://booking-bridge-bbos-stage.web.app` |
| Firestore database | `(default)` |
| Storage bucket | `booking-bridge-bbos-stage.firebasestorage.app` |
| Cloud Run service | `bbos-staging-backend` |
| Cloud Run and Artifact Registry region | `asia-south2` |
| Artifact Registry repository | `bbos-staging-backend` |
| Runtime service account | `bbos-staging-backend@booking-bridge-bbos-stage.iam.gserviceaccount.com` |

## Release prerequisites

In Google Cloud Console, select `booking-bridge-bbos-stage` explicitly and
verify the following before any build or deployment:

1. Billing is enabled and the Cloud Build, Cloud Run, Artifact Registry,
   Firestore, and Firebase Authentication APIs are available.
2. The runtime service account has `roles/datastore.user` and
   `roles/firebaseauth.viewer` in this project. Retain the existing bucket-only
   `roles/storage.objectUser` grant; do not broaden it while media storage is
   unavailable.
3. The Cloud Build service account can write only to the
   `bbos-staging-backend` Artifact Registry repository.
4. Email/Password authentication is enabled, the staging web app exists, and
   its exact public Web App values are available.
5. Each tester has a staging Firebase Auth user and exactly one active BBOS
   `employees` record linked by `firebaseUid`. A valid Firebase user without
   that record is intentionally denied.
6. Firestore and Storage browser rules remain deny-all. Do not deploy rules or
   indexes as part of the Hosting release.

## Public frontend build values

The following values are required for a real staging browser build:

```text
BBOS_DISABLE_VITE_ENV_FILES=true
BBOS_ENVIRONMENT=staging
FIREBASE_PROJECT_ID=booking-bridge-bbos-stage
BBOS_FIRESTORE_DATABASE_ID=(default)
VITE_BBOS_ENVIRONMENT=staging
VITE_FIREBASE_PROJECT_ID=booking-bridge-bbos-stage
VITE_BBOS_FIRESTORE_DATABASE_ID=(default)
VITE_FIREBASE_API_KEY=<STAGING_WEB_API_KEY>
VITE_FIREBASE_APP_ID=<STAGING_WEB_APP_ID>
VITE_FIREBASE_AUTH_DOMAIN=booking-bridge-bbos-stage.firebaseapp.com
VITE_FIREBASE_STORAGE_BUCKET=booking-bridge-bbos-stage.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=<STAGING_PROJECT_NUMBER>
VITE_FIREBASE_MEASUREMENT_ID=<OPTIONAL_STAGING_MEASUREMENT_ID>
VITE_BBOS_DEMO_MODE=false
VITE_FIREBASE_EMULATOR=false
```

These Firebase Web App fields are public identifiers embedded in the browser
bundle. They are not Firebase Admin credentials. Never provide an Admin key,
service-account JSON, Meta secret, or AI key as a `VITE_*` variable.

For a local PowerShell release build, set the values only in the current
session and run:

```powershell
$env:BBOS_DISABLE_VITE_ENV_FILES = 'true'
$env:BBOS_ENVIRONMENT = 'staging'
$env:FIREBASE_PROJECT_ID = 'booking-bridge-bbos-stage'
$env:BBOS_FIRESTORE_DATABASE_ID = '(default)'
$env:VITE_BBOS_ENVIRONMENT = 'staging'
$env:VITE_FIREBASE_PROJECT_ID = 'booking-bridge-bbos-stage'
$env:VITE_BBOS_FIRESTORE_DATABASE_ID = '(default)'
$env:VITE_FIREBASE_API_KEY = '<STAGING_WEB_API_KEY>'
$env:VITE_FIREBASE_APP_ID = '<STAGING_WEB_APP_ID>'
$env:VITE_FIREBASE_AUTH_DOMAIN = 'booking-bridge-bbos-stage.firebaseapp.com'
$env:VITE_FIREBASE_STORAGE_BUCKET = 'booking-bridge-bbos-stage.firebasestorage.app'
$env:VITE_FIREBASE_MESSAGING_SENDER_ID = '<STAGING_PROJECT_NUMBER>'
$env:VITE_FIREBASE_MEASUREMENT_ID = '<OPTIONAL_STAGING_MEASUREMENT_ID>'
$env:VITE_BBOS_DEMO_MODE = 'false'
$env:VITE_FIREBASE_EMULATOR = 'false'
bun --no-env-file run build
```

`BBOS_DISABLE_VITE_ENV_FILES=true` ensures Vite does not load `.env`,
`.env.local`, or `.env.staging`. The build must fail if the explicit values are
missing or point to another Firebase project.

## Build the staging container in Cloud Build

Choose a unique immutable image tag, then run from Cloud Shell in the staging
project. Replace only the angle-bracket values:

```bash
gcloud builds submit . \
  --project=booking-bridge-bbos-stage \
  --region=asia-south2 \
  --config=cloudbuild.staging.yaml \
  --substitutions=_IMAGE_TAG=<UNIQUE_IMMUTABLE_TAG>,_VITE_FIREBASE_API_KEY=<STAGING_WEB_API_KEY>,_VITE_FIREBASE_APP_ID=<STAGING_WEB_APP_ID>,_VITE_FIREBASE_MESSAGING_SENDER_ID=<STAGING_PROJECT_NUMBER>,_VITE_FIREBASE_MEASUREMENT_ID=<OPTIONAL_STAGING_MEASUREMENT_ID>
```

The Docker build context is allowlisted. It excludes all env files, Firebase
configuration, credentials, logs, tests, documentation, local artifacts, and
Git metadata. The final image installs production packages from `bun.lock`,
runs as the image's `bun` user, and contains no server source map.

## Deploy the staging Cloud Run service

After reviewing the Cloud Build result and exact image digest, deploy that
immutable tag from Cloud Shell:

```bash
gcloud run deploy bbos-staging-backend \
  --project=booking-bridge-bbos-stage \
  --region=asia-south2 \
  --image=asia-south2-docker.pkg.dev/booking-bridge-bbos-stage/bbos-staging-backend/bbos-api:<UNIQUE_IMMUTABLE_TAG> \
  --service-account=bbos-staging-backend@booking-bridge-bbos-stage.iam.gserviceaccount.com \
  --execution-environment=gen2 \
  --port=8080 \
  --cpu=1 \
  --memory=512Mi \
  --concurrency=40 \
  --min=0 \
  --max=2 \
  --timeout=60s \
  --cpu-throttling \
  --no-session-affinity \
  --ingress=all \
  --allow-unauthenticated \
  --set-env-vars='NODE_ENV=production,BBOS_ENVIRONMENT=staging,FIREBASE_PROJECT_ID=booking-bridge-bbos-stage,GCLOUD_PROJECT=booking-bridge-bbos-stage,BBOS_FIRESTORE_DATABASE_ID=(default),BBOS_DEMO_MODE=false,APP_URL=https://booking-bridge-bbos-stage.web.app'
```

Do not set `BBOS_MEDIA_STORAGE_MODE=local`. The server now rejects local media
storage in staging and every `NODE_ENV=production` process. Do not attach
service-account keys; Cloud Run supplies Application Default Credentials for
the configured runtime identity.

The service needs unauthenticated Cloud Run invocation because the application
has a public customer-share route and a Meta webhook, and because Firebase end
user ID tokens are verified by Express rather than Cloud Run IAM. This exposes
the `run.app` endpoint at the network layer. It does not make privileged BBOS
routes anonymous: every non-public API route still verifies a non-revoked
Firebase ID token, resolves one active employee, and applies role and resource
authorization. Keep `max=2`, monitor request volume, and do not treat CORS as an
authorization control.

## Deploy only the staging Hosting site

Deploy Cloud Run first. After the real frontend build succeeds, inspect `dist`
and run this exact targeted command:

```powershell
firebase deploy --config firebase.staging.json --project booking-bridge-bbos-stage --only hosting
```

The Hosting configuration routes `/api/**` to `bbos-staging-backend` in
`asia-south2` before the SPA fallback. It excludes `dist/server.js` and
`dist/server.js.map`. Do not omit `--only hosting`; the same configuration file
also names Firestore rules and indexes for separate, deliberate operations.

## Staging smoke checks

1. Load `https://booking-bridge-bbos-stage.web.app` and confirm the UI identifies
   the Staging environment.
2. Confirm an anonymous request to `/api/auth/me` returns `401`.
3. Sign in with a staging tester and confirm `/api/auth/me` returns only that
   tester's linked, active BBOS employee identity.
4. Confirm a valid customer-share token returns only the frozen public DTO and
   that an invalid token does not expose internal IDs or economics.
5. Leave Meta credentials unset unless an isolated staging Meta application is
   separately approved. An unsigned webhook POST must return `401`.
6. Confirm Marketing media metadata can be listed by an authorized user but an
   upload request returns the storage-not-configured response. Do not accept
   media uploads until a durable private Cloud Storage adapter is implemented.
7. Review Cloud Run logs for the startup topology: project
   `booking-bridge-bbos-stage`, database `(default)`, runtime `staging`, and
   emulator `false`.

## Cost controls

`min=0` with request-based CPU allocation allows the service to scale to zero;
`max=2` limits runaway instance count. Charges can still come from requests,
build minutes, Artifact Registry storage, Hosting transfer, logs, Firestore,
and Storage. The INR 500 budget alert is a notification rather than a hard cap.
Review billing daily during the first staging week and remove obsolete images.
The Hosting rewrite intentionally omits `pinTag` to avoid accumulating Cloud Run
revision tags for independent frontend releases.

## Current launch blocker

M1B binary media upload, preview persistence, and processing are not staging
ready. Metadata uses Firestore, but the production-mode object adapter is
deliberately unavailable. Implement and verify a private Cloud Storage adapter
with scoped object names and durable reads before enabling those workflows.
