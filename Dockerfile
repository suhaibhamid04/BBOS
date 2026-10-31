# syntax=docker/dockerfile:1

# Keep the Cloud Run runtime aligned with the repository's verified Bun version.
FROM oven/bun:1.4.0-slim AS base
WORKDIR /app

FROM base AS build-dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM base AS production-dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM build-dependencies AS build
COPY . .

# These values are public Firebase Web App identifiers embedded in the browser
# bundle. They are deliberately supplied as build arguments; server secrets and
# Application Default Credentials must only be configured on Cloud Run.
ARG VITE_BBOS_ENVIRONMENT
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_BBOS_FIRESTORE_DATABASE_ID
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_APP_ID
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_STORAGE_BUCKET
ARG VITE_FIREBASE_MESSAGING_SENDER_ID
ARG VITE_FIREBASE_MEASUREMENT_ID=""

ENV VITE_BBOS_ENVIRONMENT=${VITE_BBOS_ENVIRONMENT} \
    VITE_FIREBASE_PROJECT_ID=${VITE_FIREBASE_PROJECT_ID} \
    VITE_BBOS_FIRESTORE_DATABASE_ID=${VITE_BBOS_FIRESTORE_DATABASE_ID} \
    VITE_FIREBASE_API_KEY=${VITE_FIREBASE_API_KEY} \
    VITE_FIREBASE_APP_ID=${VITE_FIREBASE_APP_ID} \
    VITE_FIREBASE_AUTH_DOMAIN=${VITE_FIREBASE_AUTH_DOMAIN} \
    VITE_FIREBASE_STORAGE_BUCKET=${VITE_FIREBASE_STORAGE_BUCKET} \
    VITE_FIREBASE_MESSAGING_SENDER_ID=${VITE_FIREBASE_MESSAGING_SENDER_ID} \
    VITE_FIREBASE_MEASUREMENT_ID=${VITE_FIREBASE_MEASUREMENT_ID} \
    BBOS_DISABLE_VITE_ENV_FILES=true \
    VITE_BBOS_DEMO_MODE=false \
    VITE_FIREBASE_EMULATOR=false \
    VITE_BBOS_LOCAL_PRODUCTION_DIAGNOSTIC=false \
    VITE_BBOS_READ_ONLY_DIAGNOSTIC=false

# This image definition is staging-specific and fails before compilation if a
# caller tries to build it with another project's public Firebase identifiers.
RUN test "$VITE_BBOS_ENVIRONMENT" = "staging" \
    && test "$VITE_FIREBASE_PROJECT_ID" = "booking-bridge-bbos-stage" \
    && test "$VITE_BBOS_FIRESTORE_DATABASE_ID" = "(default)" \
    && test "$VITE_FIREBASE_AUTH_DOMAIN" = "booking-bridge-bbos-stage.firebaseapp.com" \
    && test "$VITE_FIREBASE_STORAGE_BUCKET" = "booking-bridge-bbos-stage.firebasestorage.app" \
    && test -n "$VITE_FIREBASE_API_KEY" \
    && test -n "$VITE_FIREBASE_APP_ID" \
    && test -n "$VITE_FIREBASE_MESSAGING_SENDER_ID"

RUN bun run build \
    && rm -f dist/server.js.map

FROM base AS runtime
ENV NODE_ENV=production \
    PORT=8080

COPY --from=production-dependencies --chown=bun:bun /app/node_modules ./node_modules
COPY --chown=bun:bun package.json ./package.json
# The existing production server uses dist/index.html and dist/assets as a
# direct-URL fallback. Firebase Hosting remains the primary frontend origin.
COPY --from=build --chown=bun:bun /app/dist ./dist

USER bun
EXPOSE 8080
CMD ["bun", "dist/server.js"]
