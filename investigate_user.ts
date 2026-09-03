import { db } from "./src/server/firebaseAdmin";

async function run() {
  if (!db) {
    console.error("No Firestore Admin DB instance");
    process.exit(1);
  }

  console.log("=== 1. Searching for user with email daninehashim1@gmail.com ===");
  const usersSnapshot = await db.collection("users").get();
  console.log(`Total users in DB: ${usersSnapshot.size}`);

  let targetUsers: any[] = [];
  usersSnapshot.forEach(doc => {
    const data = doc.data();
    if (data.email && data.email.toLowerCase().includes("daninehashim1")) {
      targetUsers.push({ id: doc.id, ...data });
    }
  });

  console.log("Matched users:", JSON.stringify(targetUsers, null, 2));

  // If no user found by email match, check all users email list
  if (targetUsers.length === 0) {
    console.log("No exact match. Printing all user emails in DB:");
    usersSnapshot.forEach(doc => {
      const d = doc.data();
      console.log(`User ID: ${doc.id}, Email: ${d.email}, Name: ${d.displayName || d.name}`);
    });
  }

  for (const u of targetUsers) {
    console.log(`\n=== Projects for user ${u.id} (${u.email}) ===`);
    const projectsSnap = await db.collection("users").doc(u.id).collection("projects").get();
    console.log(`Total projects found: ${projectsSnap.size}`);
    projectsSnap.forEach(pDoc => {
      const pData = pDoc.data();
      console.log(`Project ID: ${pDoc.id}`);
      console.log(`  Name: ${pData.name}`);
      console.log(`  LastModified: ${new Date(pData.lastModified).toISOString()}`);
      console.log(`  OwnerId: ${pData.ownerId}`);
      console.log(`  Data type: ${typeof pData.data}`);
      if (typeof pData.data === "string") {
        console.log(`  Data string length: ${pData.data.length}`);
      } else if (typeof pData.data === "object") {
        console.log(`  Data keys: ${Object.keys(pData.data || {}).join(", ")}`);
      }
    });

    // Check subcollections under this user
    const subcols = await db.collection("users").doc(u.id).listCollections();
    console.log(`User ${u.id} subcollections:`, subcols.map(c => c.id));
  }

  console.log("\n=== Checking root collections in DB ===");
  const rootCols = await db.listCollections();
  console.log("Root collections:", rootCols.map(c => c.id));

  // Check admin_backups
  if (rootCols.some(c => c.id === "admin_backups")) {
    console.log("\n=== Checking admin_backups ===");
    const backupsSnap = await db.collection("admin_backups").get();
    console.log(`Total backups found: ${backupsSnap.size}`);
    backupsSnap.forEach(bDoc => {
      const bData = bDoc.data();
      console.log(`Backup ID: ${bDoc.id}, Type: ${bData.backupType}, CreatedAt: ${bData.createdAt}, FileName: ${bData.fileName}, Size: ${bData.fileSize}, userCount: ${bData.userCount}`);
    });
  }

  // Check admin_activity_logs
  if (rootCols.some(c => c.id === "admin_activity_logs")) {
    console.log("\n=== Checking admin_activity_logs ===");
    const logsSnap = await db.collection("admin_activity_logs").orderBy("timestamp", "desc").limit(20).get();
    console.log(`Recent admin activity logs (${logsSnap.size}):`);
    logsSnap.forEach(lDoc => {
      console.log(lDoc.id, JSON.stringify(lDoc.data()));
    });
  }

  // Check collection group 'projects' across entire firestore!
  console.log("\n=== Checking collectionGroup('projects') across all users ===");
  const allProjectsSnap = await db.collectionGroup("projects").get();
  console.log(`Total projects in collectionGroup('projects'): ${allProjectsSnap.size}`);
  allProjectsSnap.forEach(pDoc => {
    const pData = pDoc.data();
    console.log(`Path: ${pDoc.ref.path} | Name: ${pData.name} | OwnerId: ${pData.ownerId} | LastModified: ${pData.lastModified}`);
  });

  process.exit(0);
}

run().catch(err => {
  console.error("Error in investigation script:", err);
  process.exit(1);
});
