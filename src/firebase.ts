import { initializeApp } from 'firebase/app';
import { initializeAuth, inMemoryPersistence, browserLocalPersistence, indexedDBLocalPersistence, browserPopupRedirectResolver } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true
}, firebaseConfig.firestoreDatabaseId);

// Initialize Firebase Auth with explicit persistence to prevent iframe blocking errors in previews
export const auth = initializeAuth(app, {
  persistence: [indexedDBLocalPersistence, browserLocalPersistence, inMemoryPersistence],
  popupRedirectResolver: browserPopupRedirectResolver
});
