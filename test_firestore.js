import { initializeApp } from 'firebase/app';
import { initializeFirestore, collection, getDocs } from 'firebase/firestore';
import fs from 'fs';
const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf-8'));
const app = initializeApp(config);
const db = initializeFirestore(app, {}, config.firestoreDatabaseId);

async function main() {
  try {
    await getDocs(collection(db, 'users'));
    console.log("Success reading from users in", config.firestoreDatabaseId);
  } catch (err) {
    console.error("Error:", err.message);
  }
  process.exit(0);
}
main();
