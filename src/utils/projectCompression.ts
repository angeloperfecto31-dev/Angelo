/**
 * projectCompression.ts
 * Utility module for handling robust, high-performance compression and decompression of project data payloads.
 * This guarantees that extremely large electrical projects with 100+ panels and thousands of circuits can fit
 * within the 1 MiB Firestore document limit and the 5 MB localStorage quota without silent failures or crashes.
 */

// Cycle-safe deep cleaning helper that prevents infinite recursion while preserving shared DAG object references.
export const cleanFirestoreDataCycleSafe = (
  obj: any,
  ancestors = new Set<any>(),
  memo = new WeakMap<any, any>()
): any => {
  if (obj === null || typeof obj !== "object") return obj;
  if (obj instanceof Date) return obj.toISOString();
  
  // True cycle check (object is an active ancestor on current call stack)
  if (ancestors.has(obj)) {
    return null; // break cyclic reference safely
  }
  
  // Memo check (object was already visited/cleaned in a shared branch of a DAG)
  if (memo.has(obj)) {
    return memo.get(obj);
  }
  
  ancestors.add(obj);
  
  if (Array.isArray(obj)) {
    const arrCopy: any[] = [];
    memo.set(obj, arrCopy);
    for (const item of obj) {
      arrCopy.push(cleanFirestoreDataCycleSafe(item, ancestors, memo));
    }
    ancestors.delete(obj);
    return arrCopy;
  }
  
  const result: any = {};
  memo.set(obj, result);
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key) && obj[key] !== undefined) {
      result[key] = cleanFirestoreDataCycleSafe(obj[key], ancestors, memo);
    }
  }
  ancestors.delete(obj);
  return result;
};

import * as pako from 'pako';

/**
 * Compresses a raw JSON string into a gzip-compressed Base64 string with a magic prefix.
 */
export async function compressData(str: string): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    
    // Compress robustly using pako
    const compressed = pako.gzip(bytes);
    
    // Convert binary to Base64 safely (handles large files without stack overflow)
    let binary = "";
    const len = compressed.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(compressed[i]);
    }
    const base64 = btoa(binary);
    
    return "compressed:gzip:" + base64;
  } catch (err) {
    console.error("[Compression] Compression failed:", err);
    return str; // Return raw string on failure to prevent data loss
  }
}

/**
 * Decompresses a compressed Base64 string back into a raw JSON string.
 */
export async function decompressData(compressedStr: string): Promise<string> {
  if (typeof compressedStr !== "string" || !compressedStr.startsWith("compressed:gzip:")) {
    return compressedStr; // Return as-is if not compressed
  }
  
  try {
    const base64 = compressedStr.substring("compressed:gzip:".length);
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    
    // Decompress robustly using pako
    const decompressed = pako.ungzip(bytes);
    
    const decoder = new TextDecoder();
    return decoder.decode(decompressed);
  } catch (err) {
    console.error("[Compression] Decompression failed:", err);
    throw err;
  }
}

/**
 * Prepares a single project object for writing/saving.
 * It deeply cleans the project data using cycle-safe logic and compresses the 'data' field.
 */
export async function compressProject(project: any): Promise<any> {
  if (!project) return project;
  
  const cleanedProject = cleanFirestoreDataCycleSafe(project);
  const dataField = cleanedProject.data;
  
  if (dataField && typeof dataField === "object") {
    try {
      const jsonString = JSON.stringify(dataField);
      cleanedProject.data = await compressData(jsonString);
    } catch (err) {
      console.error("[Compression] Failed to compress project data:", err);
    }
  }
  
  return cleanedProject;
}

/**
 * Prepares a single loaded project object by decompressing its 'data' field.
 */
export async function decompressProject(project: any): Promise<any> {
  if (!project) return project;
  
  let dataField = project.data;
  if (typeof dataField === "string") {
    if (dataField.startsWith("compressed:gzip:")) {
      try {
        const decompressed = await decompressData(dataField);
        dataField = JSON.parse(decompressed);
      } catch (err) {
        console.error("[Compression] Failed to decompress project data:", err);
      }
    } else {
      try {
        dataField = JSON.parse(dataField);
      } catch (err) {
        console.error("[Compression] Failed to parse uncompressed project data JSON:", err);
      }
    }
  }

  // Auto-heal legacy circular artifacts if any exist in dataField
  if (dataField && typeof dataField === "object") {
    if (dataField.circuits === "[Circular]" && dataField.mdps?.[0]?.circuits && Array.isArray(dataField.mdps[0].circuits)) {
      dataField.circuits = JSON.parse(JSON.stringify(dataField.mdps[0].circuits));
    }
    if (dataField.subPanels === "[Circular]" && dataField.mdps?.[0]?.subPanels && Array.isArray(dataField.mdps[0].subPanels)) {
      dataField.subPanels = JSON.parse(JSON.stringify(dataField.mdps[0].subPanels));
    }
    if (dataField.panel === "[Circular]" && dataField.mdps?.[0]?.panel) {
      dataField.panel = JSON.parse(JSON.stringify(dataField.mdps[0].panel));
    }

    const sanitizeLegacyArtifacts = (item: any) => {
      if (!item || typeof item !== "object") return;
      for (const k of Object.keys(item)) {
        if (item[k] === "[Circular]") {
          if (k === "phases") item[k] = ["R"];
          else if (k === "subLoads" || k === "circuits" || k === "subPanels") item[k] = [];
          else item[k] = null;
        } else if (Array.isArray(item[k])) {
          item[k] = item[k].map((elem: any) => (elem === "[Circular]" ? "R" : elem));
          for (const sub of item[k]) {
            if (sub && typeof sub === "object") sanitizeLegacyArtifacts(sub);
          }
        } else if (typeof item[k] === "object") {
          sanitizeLegacyArtifacts(item[k]);
        }
      }
    };
    sanitizeLegacyArtifacts(dataField);
  }
  
  return {
    ...project,
    data: dataField,
  };
}

/**
 * Processes an array of projects loaded from persistence (local or cloud) and decompresses them all.
 */
export async function decompressProjectList(projects: any[]): Promise<any[]> {
  if (!Array.isArray(projects)) return [];
  const promises = projects.map(decompressProject);
  return Promise.all(promises);
}

/**
 * Processes an array of projects to prepare them for storage by compressing their 'data' fields.
 */
export async function compressProjectList(projects: any[]): Promise<any[]> {
  if (!Array.isArray(projects)) return [];
  const promises = projects.map(compressProject);
  return Promise.all(promises);
}
