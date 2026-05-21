import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';

let db: FirebaseFirestore.Firestore;

try {
  // Try to load the client config to get project details
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    
    // Initialize admin SDK using application default credentials (works in cloud run)
    const app = initializeApp({
      credential: applicationDefault(),
      projectId: config.projectId
    });
    
    // Initialize firestore with the specific database ID if present
    db = getFirestore(app);
    if (config.firestoreDatabaseId) {
      db.settings({ databaseId: config.firestoreDatabaseId });
    }
    console.log('Firebase Admin initialized successfully');
  } else {
    console.error('Firebase config not found');
  }
} catch (e) {
  console.error('Error initializing Firebase Admin:', e);
}

export { db };
