import { initializeApp } from 'firebase/app';
import { initializeFirestore, collection, getDocs, doc, getDoc } from 'firebase/firestore';
import fs from 'fs';

const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf-8'));
const app = initializeApp(config);
const db = initializeFirestore(app, {}, config.firestoreDatabaseId);

async function main() {
  console.log("Fetching users from Firestore...");
  const usersCol = collection(db, 'users');
  const userSnapshot = await getDocs(usersCol);
  console.log(`Found ${userSnapshot.size} users.`);

  let danineUser: any = null;
  const allUserSummaries: any[] = [];

  userSnapshot.forEach(docSnap => {
    const data = docSnap.data();
    const summary = {
      id: docSnap.id,
      email: data.email,
      name: data.displayName || data.name,
      plan: data.plan,
      isActive: data.isActive,
      paymentStatus: data.paymentStatus,
      createdAt: data.createdAt
    };
    allUserSummaries.push(summary);
    if (data.email && data.email.toLowerCase().includes('daninehashim1')) {
      danineUser = { id: docSnap.id, ...data };
    }
  });

  console.log("\n=== ALL USERS IN DB ===");
  console.log(JSON.stringify(allUserSummaries, null, 2));

  if (!danineUser) {
    console.log("\nNo user with email containing daninehashim1 found!");
  } else {
    console.log("\n=== DANINE USER RECORD ===");
    console.log(JSON.stringify(danineUser, null, 2));

    console.log("\n=== PROJECTS UNDER DANINE'S UID (" + danineUser.id + ") ===");
    const projectsCol = collection(db, 'users', danineUser.id, 'projects');
    const projectsSnap = await getDocs(projectsCol);
    console.log(`Found ${projectsSnap.size} projects under this user.`);
    projectsSnap.forEach(pDoc => {
      const pData = pDoc.data();
      console.log(`- Project ID: ${pDoc.id}`);
      console.log(`  Name: ${pData.name}`);
      console.log(`  OwnerId: ${pData.ownerId}`);
      console.log(`  LastModified: ${pData.lastModified} (${new Date(pData.lastModified).toISOString()})`);
      console.log(`  Data type: ${typeof pData.data}`);
      if (typeof pData.data === 'string') {
        console.log(`  Data length: ${pData.data.length}, starts with: ${pData.data.substring(0, 30)}`);
      } else if (pData.data && typeof pData.data === 'object') {
        console.log(`  Data keys: ${Object.keys(pData.data).join(', ')}`);
        if (pData.data.panel) {
          console.log(`  Panel project: ${pData.data.panel.project}, type: ${pData.data.panel.projectType}`);
        }
      }
    });
  }

  // Let's also check ALL other users' projects to see if any project has danine's name or is orphaned
  console.log("\n=== SCANNING ALL PROJECTS ACROSS ALL USERS ===");
  for (const u of allUserSummaries) {
    try {
      const uProjectsSnap = await getDocs(collection(db, 'users', u.id, 'projects'));
      if (uProjectsSnap.size > 0) {
        console.log(`User ${u.email} (${u.id}) has ${uProjectsSnap.size} projects:`);
        uProjectsSnap.forEach(pDoc => {
          const p = pDoc.data();
          console.log(`  * Proj ID: ${pDoc.id} | Name: "${p.name}" | OwnerId: ${p.ownerId} | LastModified: ${p.lastModified ? new Date(p.lastModified).toISOString() : 'none'}`);
        });
      }
    } catch (e: any) {
      console.error(`Error reading projects for ${u.id}:`, e.message);
    }
  }

  // Check admin_backups
  try {
    const backupsSnap = await getDocs(collection(db, 'admin_backups'));
    console.log(`\n=== ADMIN BACKUPS (${backupsSnap.size}) ===`);
    backupsSnap.forEach(bDoc => {
      const b = bDoc.data();
      console.log(`- Backup ID: ${bDoc.id}, Date: ${b.createdAt}, File: ${b.fileName}, UserCount: ${b.userCount}`);
    });
  } catch (e: any) {
    console.error("Error reading admin_backups:", e.message);
  }

  // Check admin_activity_logs
  try {
    const logsSnap = await getDocs(collection(db, 'admin_activity_logs'));
    console.log(`\n=== ADMIN ACTIVITY LOGS (${logsSnap.size}) ===`);
    logsSnap.forEach(lDoc => {
      const l = lDoc.data();
      console.log(`- Log: ${l.action} | Admin: ${l.adminEmail} | Time: ${l.timestamp} | Details: ${l.details || ''}`);
    });
  } catch (e: any) {
    console.error("Error reading admin_activity_logs:", e.message);
  }

  process.exit(0);
}

main().catch(err => {
  console.error("Main error:", err);
  process.exit(1);
});
