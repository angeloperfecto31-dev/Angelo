import { initializeApp } from 'firebase/app';
import { getAuth, initializeAuth, inMemoryPersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Robustly initialize Firebase Auth to handle sandboxed/iframe environments.
// getAuth(app) is the standard and recommended way, but it can throw DOMExceptions
// (like SecurityError) when localStorage/indexedDB access is blocked in an iframe sandbox.
// In such cases, we catch the error and fallback to initializeAuth with inMemoryPersistence.
let authInstance;
try {
  authInstance = getAuth(app);
} catch (error) {
  console.warn("getAuth failed, falling back to initializeAuth with inMemoryPersistence:", error);
  try {
    authInstance = initializeAuth(app, {
      persistence: inMemoryPersistence
    });
  } catch (fallbackError) {
    console.error("Failed to initialize fallback Auth:", fallbackError);
    authInstance = getAuth(app); // Final fallback attempt
  }
}

export const auth = authInstance;


