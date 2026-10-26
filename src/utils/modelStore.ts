/**
 * Storage of imported 3D model files. Project documents only hold the model's metadata (Firestore
 * documents are limited to 1 MB), so the files themselves are kept:
 *  - in this browser (IndexedDB), keyed by a SHA-256 of the files, for instant reloads; and
 *  - in Firebase Storage under models/{uid}/{hash}/, so the project reopens on other devices.
 * The cloud copy is optional: when Storage is not enabled or the upload is refused, the model stays
 * on this device and the user is told so.
 */
import { app, auth } from "../firebase";

export interface StoredModelFile {
  name: string;
  type: string;
  data: ArrayBuffer;
}

const DB_NAME = "electricalph-models";
const STORE = "files";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB unavailable"));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** SHA-256 of all files (names and contents), as hex */
export async function hashModelFiles(files: File[]): Promise<string> {
  const parts: Uint8Array[] = [];
  const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name));
  for (const f of sorted) {
    parts.push(new TextEncoder().encode(f.name.toLowerCase() + ":" + f.size + ";"));
    parts.push(new Uint8Array(await f.arrayBuffer()));
  }
  const total = parts.reduce((s, p) => s + p.length, 0);
  const all = new Uint8Array(total);
  let o = 0;
  parts.forEach((p) => { all.set(p, o); o += p.length; });
  const digest = await crypto.subtle.digest("SHA-256", all);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 40);
}

export async function saveModelLocal(hash: string, files: File[]): Promise<boolean> {
  try {
    const stored: StoredModelFile[] = [];
    for (const f of files) stored.push({ name: f.name, type: f.type, data: await f.arrayBuffer() });
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(stored, hash);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return true;
  } catch (err) {
    console.warn("Model cache (IndexedDB) failed:", err);
    return false;
  }
}

export async function loadModelLocal(hash: string): Promise<File[] | null> {
  try {
    const db = await openDb();
    const stored = await new Promise<StoredModelFile[] | undefined>((resolve, reject) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get(hash);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (!stored || !stored.length) return null;
    return stored.map((s) => new File([s.data], s.name, { type: s.type }));
  } catch {
    return null;
  }
}

/** Upload to Firebase Storage; returns the storage paths, or null with the reason */
export async function uploadModelCloud(hash: string, files: File[]): Promise<{ paths: string[] } | { error: string }> {
  const uid = auth.currentUser?.uid;
  if (!uid) return { error: "Not signed in, so the model is saved on this device only." };
  try {
    const { getStorage, ref, uploadBytes } = await import("firebase/storage");
    const storage = getStorage(app);
    const paths: string[] = [];
    for (const f of files) {
      const path = `models/${uid}/${hash}/${f.name}`;
      await uploadBytes(ref(storage, path), f, { contentType: f.type || "application/octet-stream" });
      paths.push(path);
    }
    return { paths };
  } catch (err: any) {
    console.warn("Model upload failed:", err);
    const code = err?.code || "";
    const reason = code.includes("unauthorized") || code.includes("permission")
      ? "cloud storage refused the upload (Storage rules not deployed?)"
      : code.includes("bucket") || code.includes("project-not-found")
        ? "Firebase Storage is not enabled for this project"
        : err?.message || "upload failed";
    return { error: `Cloud copy not saved (${reason}). The model is saved on this device only.` };
  }
}

export async function downloadModelCloud(paths: string[]): Promise<File[] | null> {
  try {
    const { getStorage, ref, getBlob } = await import("firebase/storage");
    const storage = getStorage(app);
    const files: File[] = [];
    for (const p of paths) {
      const blob = await getBlob(ref(storage, p));
      files.push(new File([blob], p.split("/").pop() || "model", { type: blob.type }));
    }
    return files;
  } catch (err) {
    console.warn("Model download failed:", err);
    return null;
  }
}
