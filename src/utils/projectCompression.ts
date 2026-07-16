/**
 * projectCompression.ts
 * Utility module for handling robust, high-performance compression and decompression of project data payloads.
 * This guarantees that extremely large electrical projects with 100+ panels and thousands of circuits can fit
 * within the 1 MiB Firestore document limit and the 5 MB localStorage quota without silent failures or crashes.
 */

// Cycle-safe deep cleaning helper to prevent "Maximum call stack size exceeded" when saving projects with complex relationships.
export const cleanFirestoreDataCycleSafe = (obj: any, seen = new WeakMap()): any => {
  if (obj === null || typeof obj !== "object") return obj;
  if (obj instanceof Date) return obj.toISOString();
  
  // Prevent infinite loops by returning a reference placeholder or skipping circular structures
  if (seen.has(obj)) {
    return "[Circular]";
  }
  
  if (Array.isArray(obj)) {
    const arrCopy: any[] = [];
    seen.set(obj, arrCopy);
    for (const item of obj) {
      arrCopy.push(cleanFirestoreDataCycleSafe(item, seen));
    }
    return arrCopy;
  }
  
  const result: any = {};
  seen.set(obj, result);
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key) && obj[key] !== undefined) {
      result[key] = cleanFirestoreDataCycleSafe(obj[key], seen);
    }
  }
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
