import type { FirebaseOptions } from 'firebase/app';

export interface FirebaseWebEnvironment {
  VITE_FIREBASE_EMULATOR?: string;
  VITE_FIREBASE_API_KEY?: string;
  VITE_FIREBASE_APP_ID?: string;
  VITE_FIREBASE_AUTH_DOMAIN?: string;
  VITE_FIREBASE_STORAGE_BUCKET?: string;
  VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  VITE_FIREBASE_MEASUREMENT_ID?: string;
}

function validateProjectBoundHost(value: string, projectId: string, field: string): string {
  const hostname = value.trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(hostname) || hostname.includes('..')) {
    throw new Error(`${field} must be a hostname without a scheme, path, port, or credentials.`);
  }
  const knownSuffix = ['.firebaseapp.com', '.web.app'].find(suffix => hostname.endsWith(suffix));
  if (knownSuffix && hostname !== `${projectId}${knownSuffix}`) {
    throw new Error(`${field} belongs to a different Firebase project than ${projectId}.`);
  }
  return hostname;
}

function validateStorageBucket(value: string | undefined, projectId: string): string | undefined {
  const bucket = value?.trim();
  if (!bucket) return undefined;
  if (!/^[a-z0-9][a-z0-9._-]*[a-z0-9]$/.test(bucket)) {
    throw new Error('VITE_FIREBASE_STORAGE_BUCKET is invalid.');
  }
  if (bucket.endsWith('.appspot.com') && bucket !== `${projectId}.appspot.com`) {
    throw new Error(`VITE_FIREBASE_STORAGE_BUCKET belongs to a different Firebase project than ${projectId}.`);
  }
  if (bucket.endsWith('.firebasestorage.app') && bucket !== `${projectId}.firebasestorage.app`) {
    throw new Error(`VITE_FIREBASE_STORAGE_BUCKET belongs to a different Firebase project than ${projectId}.`);
  }
  return bucket;
}

function validateAppIdentity(appId: string, senderId: string | undefined): void {
  const normalizedSenderId = senderId?.trim();
  if (normalizedSenderId && !/^\d+$/.test(normalizedSenderId)) {
    throw new Error('VITE_FIREBASE_MESSAGING_SENDER_ID must be numeric.');
  }
  // Firebase App IDs are opaque. If an ID exposes the conventional numeric
  // project number, compare only that value and accept other formats.
  const exposedProjectNumber = /^1:(\d+):/.exec(appId)?.[1];
  if (exposedProjectNumber && normalizedSenderId && exposedProjectNumber !== normalizedSenderId) {
    throw new Error('VITE_FIREBASE_APP_ID and VITE_FIREBASE_MESSAGING_SENDER_ID identify different Firebase projects.');
  }
}

export function loadFirebaseWebConfig(environment: FirebaseWebEnvironment, projectId: string): FirebaseOptions {
  if (environment.VITE_FIREBASE_EMULATOR === 'true') {
    return {
      apiKey: environment.VITE_FIREBASE_API_KEY || 'bbos-emulator-only',
      appId: environment.VITE_FIREBASE_APP_ID || '1:000000000000:web:bbos-emulator-only',
      authDomain: `${projectId}.firebaseapp.com`,
      projectId,
    };
  }
  const apiKey = environment.VITE_FIREBASE_API_KEY?.trim();
  const appId = environment.VITE_FIREBASE_APP_ID?.trim();
  const authDomain = environment.VITE_FIREBASE_AUTH_DOMAIN?.trim();
  if (!apiKey || !appId || !authDomain) {
    throw new Error('Firebase browser configuration is incomplete. Set VITE_FIREBASE_API_KEY, VITE_FIREBASE_APP_ID, and VITE_FIREBASE_AUTH_DOMAIN for the selected environment.');
  }
  const messagingSenderId = environment.VITE_FIREBASE_MESSAGING_SENDER_ID?.trim() || undefined;
  validateAppIdentity(appId, messagingSenderId);
  return {
    apiKey,
    appId,
    authDomain: validateProjectBoundHost(authDomain, projectId, 'VITE_FIREBASE_AUTH_DOMAIN'),
    projectId,
    storageBucket: validateStorageBucket(environment.VITE_FIREBASE_STORAGE_BUCKET, projectId),
    messagingSenderId,
    measurementId: environment.VITE_FIREBASE_MEASUREMENT_ID?.trim() || undefined,
  };
}
