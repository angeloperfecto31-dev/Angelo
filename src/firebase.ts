import { initializeApp } from 'firebase/app';
import { initializeAuth, inMemoryPersistence, browserLocalPersistence, indexedDBLocalPersistence, browserPopupRedirectResolver } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = initializeFirestore(app, {
  // Use high-performance WebSockets by default and auto-detect if long polling is needed.
  // This avoids exhausting the browser's 6-connection limit per domain under HTTP/1.1
  // when multiple snapshot listeners are active.
  experimentalForceLongPolling: false,
  experimentalAutoDetectLongPolling: true
}, firebaseConfig.firestoreDatabaseId);

// Initialize Firebase Auth with explicit persistence to prevent iframe blocking errors in previews
export const auth = initializeAuth(app, {
  persistence: [indexedDBLocalPersistence, browserLocalPersistence, inMemoryPersistence],
  popupRedirectResolver: browserPopupRedirectResolver
});
