import { initializeApp } from 'firebase/app';
import { browserLocalPersistence, connectAuthEmulator, indexedDBLocalPersistence, initializeAuth } from 'firebase/auth';
import { connectFirestoreEmulator, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';

// `npm run dev:emu` runs against local emulators with a throwaway demo project.
const useEmulators = import.meta.env.VITE_USE_EMULATORS === '1';

const config = useEmulators
  ? { apiKey: 'demo-key', authDomain: 'localhost', projectId: 'demo-logbook', appId: 'demo-app' }
  : {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
    };

export const firebaseConfigured = Boolean(config.apiKey && config.projectId);

// Placeholders keep the SDK from throwing at import time; App shows setup
// instructions when the real config is missing.
export const app = initializeApp({
  ...config,
  apiKey: config.apiKey || 'not-configured',
  projectId: config.projectId || 'not-configured',
});

// The signed-in user is persisted locally, so after one online sign-in the app
// opens and works offline indefinitely.
export const auth = initializeAuth(app, {
  persistence: [indexedDBLocalPersistence, browserLocalPersistence],
});

// All reads and writes hit IndexedDB first; the network only reconciles.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});

if (useEmulators) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}
