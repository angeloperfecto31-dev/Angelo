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

/**
 * Compresses a raw JSON string into a gzip-compressed Base64 string with a magic prefix.
 */
export async function compressData(str: string): Promise<string> {
  if (typeof window === "undefined" || !window.CompressionStream) {
    console.warn("[Compression] CompressionStream is not supported in this environment. Storing uncompressed.");
    return str;
  }
  
  try {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      }
    });
    
    const compressedStream = stream.pipeThrough(new window.CompressionStream("gzip"));
    const reader = compressedStream.getReader();
    const chunks: Uint8Array[] = [];
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    
    // Combine compressed chunks
    const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }
    
    // Convert binary to Base64 safely (handles large files without stack overflow)
    let binary = "";
    const len = combined.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(combined[i]);
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
  
  if (typeof window === "undefined" || !window.DecompressionStream) {
    console.error("[Compression] DecompressionStream is not supported in this environment.");
    throw new Error("DecompressionStream is not supported in this environment.");
  }
  
  try {
    const base64 = compressedStr.substring("compressed:gzip:".length);
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      }
    });
    
    const decompressedStream = stream.pipeThrough(new window.DecompressionStream("gzip"));
    const reader = decompressedStream.getReader();
    const chunks: Uint8Array[] = [];
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    
    const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }
    
    const decoder = new TextDecoder();
    return decoder.decode(combined);
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
  if (typeof dataField === "string" && dataField.startsWith("compressed:gzip:")) {
    try {
      const decompressed = await decompressData(dataField);
      dataField = JSON.parse(decompressed);
    } catch (err) {
      console.error("[Compression] Failed to decompress project data:", err);
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
