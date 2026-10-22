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
  return {
    apiKey,
    appId,
    authDomain,
    projectId,
    storageBucket: environment.VITE_FIREBASE_STORAGE_BUCKET?.trim() || undefined,
    messagingSenderId: environment.VITE_FIREBASE_MESSAGING_SENDER_ID?.trim() || undefined,
    measurementId: environment.VITE_FIREBASE_MEASUREMENT_ID?.trim() || undefined,
  };
}
