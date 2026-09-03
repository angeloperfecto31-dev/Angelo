const TOKEN = 'eyJhbGciOiJSUzI1NiIsImtpZCI6ImFhMmNiOTcyNTIzMzc3ZWRlMjE2MzQwYmNkNTg4MTA0MTQxZTYxY2MiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL3NlY3VyZXRva2VuLmdvb2dsZS5jb20vZ2VuLWxhbmctY2xpZW50LTA5MjI1MzY4NjYiLCJhdWQiOiJnZW4tbGFuZy1jbGllbnQtMDkyMjUzNjg2NiIsImF1dGhfdGltZSI6MTc4ODQxMDgwNywidXNlcl9pZCI6InpyeW1EcjkxTk1TMWdiUnR5UE1nbTA3WnFqSTMiLCJzdWIiOiJ6cnltRHI5MU5NUzFnYlJ0eVBNZ20wN1pxakkzIiwiaWF0IjoxNzg4NDEwODA3LCJleHAiOjE3ODg0MTQ0MDcsImVtYWlsIjoidGVzdF9kaWFnX2FkbWluQGdtYWlsLmNvbSIsImVtYWlsX3ZlcmlmaWVkIjpmYWxzZSwiZmlyZWJhc2UiOnsiaWRlbnRpdGllcyI6eyJlbWFpbCI6WyJ0ZXN0X2RpYWdfYWRtaW5AZ21haWwuY29tIl19LCJzaWduX2luX3Byb3ZpZGVyIjoicGFzc3dvcmQifX0.Sre8dpha8BcfYAn0s3tKZ-3_KyayKGedD92QEBYYAVDO0ko9XVfGPn5gzdXJIB5GwrJ7hOkFECHolN3FqUyF9Ar99Ny112M5vE3OBIo307EnHSrDVDmvQ0pnqjDom78yFV5KAJp6Rbja4He9-nZIdpSeXU8K4JIN3YtL0J_jbW4MDz3RK7AioWVHUC9iObHOdMZ2MwTzpcqB0VtzYrciQEQm5o15SmvER4j5JhU2nQTVFfPZwG_LGVk2xZjv52BTGdpqU9JJndTOc_5v134qhXNdGASN5_K_sbE-9y29vRR5LR1jktC34ro2L9ypiP7PAkUba0VhobMX58Mv6eYzKg';
const BASE_URL = 'https://firestore.googleapis.com/v1/projects/gen-lang-client-0922536866/databases/ai-studio-13d3120e-e17b-4db1-a8bd-aada239852cf/documents';

function parseValue(val) {
  if (!val) return null;
  if ('stringValue' in val) return val.stringValue;
  if ('booleanValue' in val) return val.booleanValue;
  if ('integerValue' in val) return parseInt(val.integerValue, 10);
  if ('doubleValue' in val) return parseFloat(val.doubleValue);
  if ('nullValue' in val) return null;
  if ('timestampValue' in val) return val.timestampValue;
  if ('mapValue' in val) {
    const res = {};
    for (const [k, v] of Object.entries(val.mapValue.fields || {})) {
      res[k] = parseValue(v);
    }
    return res;
  }
  if ('arrayValue' in val) {
    return (val.arrayValue.values || []).map(parseValue);
  }
  return val;
}

function parseFields(fields) {
  const obj = {};
  for (const [k, v] of Object.entries(fields || {})) {
    obj[k] = parseValue(v);
  }
  return obj;
}

async function runQuery(collectionId, parent = '') {
  const url = `${BASE_URL}${parent ? '/' + parent : ''}:runQuery`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + TOKEN,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: collectionId }]
      }
    })
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Query ${collectionId} failed (${res.status}): ${txt}`);
  }
  const items = await res.json();
  const results = [];
  for (const item of items) {
    if (item.document) {
      const docPath = item.document.name.replace(`${BASE_URL}/`, '');
      const id = docPath.split('/').pop();
      results.push({
        id,
        path: docPath,
        data: parseFields(item.document.fields),
        createTime: item.document.createTime,
        updateTime: item.document.updateTime
      });
    }
  }
  return results;
}

async function main() {
  console.log('Querying all users...');
  const users = await runQuery('users');
  console.log(`Found ${users.length} users in database.`);

  const danineMatches = users.filter(u => 
    (u.data.email && u.data.email.toLowerCase().includes('danine')) ||
    (u.data.displayName && u.data.displayName.toLowerCase().includes('danine')) ||
    (u.data.name && u.data.name.toLowerCase().includes('danine'))
  );

  console.log(`\n=== MATCHING USERS FOR "danine" (${danineMatches.length}) ===`);
  for (const u of danineMatches) {
    console.log(JSON.stringify(u, null, 2));
  }

  // Also print all user emails to see if there are other accounts or typos
  console.log('\n=== ALL USER EMAILS ===');
  for (const u of users) {
    console.log(`- UID: ${u.id} | Email: ${u.data.email} | Name: ${u.data.displayName || u.data.name} | Created: ${u.createTime}`);
  }

  // For each matching user, query their projects
  for (const u of danineMatches) {
    console.log(`\n=== CHECKING PROJECTS FOR USER ${u.data.email} (${u.id}) ===`);
    try {
      const projects = await runQuery('projects', `users/${u.id}`);
      console.log(`Found ${projects.length} projects under users/${u.id}/projects:`);
      for (const p of projects) {
        console.log(`  - Project ID: ${p.id}`);
        console.log(`    Name: "${p.data.name}"`);
        console.log(`    OwnerId: "${p.data.ownerId}"`);
        console.log(`    LastModified: ${p.data.lastModified} (${new Date(p.data.lastModified).toISOString()})`);
        console.log(`    CreateTime: ${p.createTime}`);
        console.log(`    UpdateTime: ${p.updateTime}`);
        console.log(`    Data keys:`, Object.keys(p.data.data || {}));
      }
    } catch (e) {
      console.error(`Error querying projects for ${u.id}:`, e.message);
    }
  }

  // Also query ALL projects subcollections across ALL users to see if any project has danine's name or is anywhere else
  console.log('\n=== CHECKING ALL PROJECTS ACROSS ALL USERS ===');
  for (const u of users) {
    try {
      const projects = await runQuery('projects', `users/${u.id}`);
      if (projects.length > 0) {
        console.log(`User ${u.data.email} (${u.id}) has ${projects.length} projects:`);
        for (const p of projects) {
          console.log(`    * [${p.id}] "${p.data.name}" (ownerId: ${p.data.ownerId}, lastMod: ${p.data.lastModified ? new Date(p.data.lastModified).toISOString() : 'none'})`);
        }
      }
    } catch (e) {
      // ignore
    }
  }

  // Check admin_backups
  console.log('\n=== CHECKING ADMIN BACKUPS ===');
  try {
    const backups = await runQuery('admin_backups');
    console.log(`Found ${backups.length} admin backups.`);
    for (const b of backups) {
      console.log(`- Backup: ${b.id} | File: ${b.data.fileName} | Users: ${b.data.userCount} | Created: ${b.data.createdAt} | By: ${b.data.createdBy}`);
    }
  } catch (e) {
    console.error('Error querying admin_backups:', e.message);
  }

  // Check admin_activity_logs
  console.log('\n=== CHECKING ADMIN ACTIVITY LOGS ===');
  try {
    const logs = await runQuery('admin_activity_logs');
    console.log(`Found ${logs.length} admin activity logs.`);
    for (const l of logs) {
      console.log(`- Log: ${l.data.action} | Admin: ${l.data.adminEmail} | Time: ${l.data.timestamp} | Details: ${l.data.details || ''}`);
    }
  } catch (e) {
    console.error('Error querying admin_activity_logs:', e.message);
  }
}

main().catch(console.error);
