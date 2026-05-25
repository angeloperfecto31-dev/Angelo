import { initializeApp } from 'firebase/app';
import { initializeAuth, inMemoryPersistence, browserPopupRedirectResolver } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Use initializeAuth to explicitly set persistence during creation.
// This prevents getAuth from automatically choosing browserLocalPersistence,
// which triggers DOMExceptions in sandboxed / iframe environments, leading to auth/internal-error.
// We also add browserPopupRedirectResolver to avoid auth/argument-error when using signInWithPopup.
export const auth = initializeAuth(app, {
  persistence: inMemoryPersistence,
  popupRedirectResolver: browserPopupRedirectResolver
});

