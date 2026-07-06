import { collection, getDocs, setDoc, doc, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from "../firebase";

export interface ThreePhaseFLCEntry {
  id: string; // Document ID, usually we can use hp or random string. We will use clean generated IDs, but let's make them persistent.
  hp: string;
  v115: number | null;
  v200: number | null;
  v208: number | null;
  v230: number | null;
  v400: number | null;
  v460: number | null;
  v575: number | null;
  v2300: number | null;
}

export const INITIAL_THREE_PHASE_FLC_DATA: ThreePhaseFLCEntry[] = [
  { id: "hp_0_5", hp: "1/2", v115: 4.4, v200: 2.5, v208: 2.4, v230: 2.2, v400: 1.3, v460: 1.1, v575: 0.9, v2300: null },
  { id: "hp_0_75", hp: "3/4", v115: 6.4, v200: 3.7, v208: 3.5, v230: 3.2, v400: 1.8, v460: 1.6, v575: 1.3, v2300: null },
  { id: "hp_1", hp: "1", v115: 8.4, v200: 4.8, v208: 4.6, v230: 4.2, v400: 2.3, v460: 2.1, v575: 1.7, v2300: null },
  { id: "hp_1_5", hp: "1 1/2", v115: 12.0, v200: 6.9, v208: 6.6, v230: 6.0, v400: 3.3, v460: 3.0, v575: 2.4, v2300: null },
  { id: "hp_2", hp: "2", v115: 13.6, v200: 7.8, v208: 7.5, v230: 6.8, v400: 4.3, v460: 3.4, v575: 2.7, v2300: null },
  { id: "hp_3", hp: "3", v115: 19.2, v200: 11.0, v208: 10.6, v230: 9.6, v400: 6.1, v460: 4.8, v575: 3.9, v2300: null },
  { id: "hp_5", hp: "5", v115: 30.4, v200: 17.5, v208: 16.7, v230: 15.2, v400: 9.7, v460: 7.6, v575: 6.1, v2300: null },
  { id: "hp_7_5", hp: "7 1/2", v115: 44.0, v200: 25.3, v208: 24.2, v230: 22.0, v400: 14.0, v460: 11.0, v575: 9.0, v2300: null },
  { id: "hp_10", hp: "10", v115: 56.0, v200: 32.2, v208: 30.8, v230: 28.0, v400: 18.0, v460: 14.0, v575: 11.0, v2300: null },
  { id: "hp_15", hp: "15", v115: 84.0, v200: 48.3, v208: 46.2, v230: 42.0, v400: 27.0, v460: 21.0, v575: 17.0, v2300: null },
  { id: "hp_20", hp: "20", v115: 108.0, v200: 62.1, v208: 59.4, v230: 54.0, v400: 34.0, v460: 27.0, v575: 22.0, v2300: null },
  { id: "hp_25", hp: "25", v115: 136.0, v200: 78.2, v208: 74.8, v230: 68.0, v400: 44.0, v460: 34.0, v575: 27.0, v2300: null },
  { id: "hp_30", hp: "30", v115: 160.0, v200: 92.0, v208: 88.0, v230: 80.0, v400: 51.0, v460: 40.0, v575: 32.0, v2300: null },
  { id: "hp_40", hp: "40", v115: 208.0, v200: 120.0, v208: 114.0, v230: 104.0, v400: 66.0, v460: 52.0, v575: 41.0, v2300: null },
  { id: "hp_50", hp: "50", v115: 260.0, v200: 150.0, v208: 143.0, v230: 130.0, v400: 83.0, v460: 65.0, v575: 52.0, v2300: null },
  { id: "hp_60", hp: "60", v115: null, v200: 177.0, v208: 169.0, v230: 154.0, v400: 103.0, v460: 77.0, v575: 62.0, v2300: 16.0 },
  { id: "hp_75", hp: "75", v115: null, v200: 221.0, v208: 211.0, v230: 192.0, v400: 128.0, v460: 96.0, v575: 77.0, v2300: 20.0 },
  { id: "hp_100", hp: "100", v115: null, v200: 285.0, v208: 273.0, v230: 248.0, v400: 165.0, v460: 124.0, v575: 99.0, v2300: 26.0 },
  { id: "hp_125", hp: "125", v115: null, v200: 359.0, v208: 343.0, v230: 312.0, v400: 208.0, v460: 156.0, v575: 125.0, v2300: 31.0 },
  { id: "hp_150", hp: "150", v115: null, v200: 414.0, v208: 396.0, v230: 360.0, v400: 240.0, v460: 180.0, v575: 144.0, v2300: 37.0 },
  { id: "hp_200", hp: "200", v115: null, v200: 552.0, v208: 528.0, v230: 480.0, v400: 320.0, v460: 240.0, v575: 192.0, v2300: 49.0 },
  { id: "hp_250", hp: "250", v115: null, v200: null, v208: null, v230: 604.0, v400: 403.0, v460: 302.0, v575: 242.0, v2300: 60.0 },
  { id: "hp_300", hp: "300", v115: null, v200: null, v208: null, v230: 722.0, v400: 482.0, v460: 361.0, v575: 289.0, v2300: 72.0 },
  { id: "hp_350", hp: "350", v115: null, v200: null, v208: null, v230: 828.0, v400: 560.0, v460: 414.0, v575: 336.0, v2300: 83.0 },
  { id: "hp_400", hp: "400", v115: null, v200: null, v208: null, v230: 954.0, v400: 636.0, v460: 477.0, v575: 382.0, v2300: 95.0 },
  { id: "hp_450", hp: "450", v115: null, v200: null, v208: null, v230: 1030.0, v400: null, v460: 515.0, v575: 412.0, v2300: 103.0 },
  { id: "hp_500", hp: "500", v115: null, v200: null, v208: null, v230: 1180.0, v400: 786.0, v460: 590.0, v575: 472.0, v2300: 118.0 }
];

export const SINGLE_PHASE_FLC_TABLE: Record<string, number> = {
  "1/6": 2.2,
  "1/4": 2.9,
  "1/3": 3.6,
  "1/2": 4.9,
  "3/4": 6.9,
  "1": 8.0,
  "1 1/2": 10.0,
  "1.5": 10.0,
  "2": 12.0,
  "2.5": 15.0,
  "2 1/2": 15.0,
  "3": 17.0,
  "4": 22.0,
  "4.0": 22.0,
  "5": 28.0,
  "7 1/2": 40.0,
  "7.5": 40.0,
  "10": 50.0
};

// Maps any system voltage to the corresponding table column
export function getThreePhaseFLCColumn(voltage: number): keyof Omit<ThreePhaseFLCEntry, "id" | "hp"> {
  if (voltage >= 110 && voltage <= 120) return "v115";
  if (voltage >= 190 && voltage <= 204) return "v200";
  if (voltage >= 205 && voltage <= 220) return "v208";
  if (voltage >= 221 && voltage <= 240) return "v230";
  if (voltage >= 380 && voltage <= 415) return "v400";
  if (voltage >= 440 && voltage <= 480) return "v460";
  if (voltage >= 550 && voltage <= 600) return "v575";
  if (voltage >= 2200 && voltage <= 2450) return "v2300";

  // Fallback to absolute closest match
  const mappings: { col: keyof Omit<ThreePhaseFLCEntry, "id" | "hp">; val: number }[] = [
    { col: "v115", val: 115 },
    { col: "v200", val: 200 },
    { col: "v208", val: 208 },
    { col: "v230", val: 230 },
    { col: "v400", val: 400 },
    { col: "v460", val: 460 },
    { col: "v575", val: 575 },
    { col: "v2300", val: 2300 }
  ];

  let closest = mappings[3]; // default 230V
  let minDist = Math.abs(voltage - closest.val);
  for (const item of mappings) {
    const dist = Math.abs(voltage - item.val);
    if (dist < minDist) {
      minDist = dist;
      closest = item;
    }
  }
  return closest.col;
}

// Global cached in-memory three-phase FLC data table that stays updated.
// We fall back to initial data immediately so that there is never blank rows during fetches.
let cachedThreePhaseFLCData: ThreePhaseFLCEntry[] = [...INITIAL_THREE_PHASE_FLC_DATA];

export function getCachedThreePhaseFLCList(): ThreePhaseFLCEntry[] {
  return cachedThreePhaseFLCData;
}

export function updateCachedThreePhaseFLCList(newList: ThreePhaseFLCEntry[]) {
  cachedThreePhaseFLCData = newList;
}

// Fetches the entire three-phase table from Firestore.
// If empty, automatically seeds with INITIAL_THREE_PHASE_FLC_DATA.
export async function getThreePhaseFLCDatabaseList(): Promise<ThreePhaseFLCEntry[]> {
  try {
    const colRef = collection(db, "motor_flc_library");
    const snapshot = await Promise.race([
      getDocs(colRef),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Firestore connection timeout")), 3000)
      )
    ]);
    if (snapshot.empty) {
      // Need to seed
      await seedThreePhaseFLCBackup();
      cachedThreePhaseFLCData = [...INITIAL_THREE_PHASE_FLC_DATA];
      return cachedThreePhaseFLCData;
    }

    const fetched: ThreePhaseFLCEntry[] = [];
    snapshot.forEach((snap) => {
      const data = snap.data();
      fetched.push({
        id: snap.id,
        hp: data.hp || "",
        v115: data.v115 !== undefined ? data.v115 : null,
        v200: data.v200 !== undefined ? data.v200 : null,
        v208: data.v208 !== undefined ? data.v208 : null,
        v230: data.v230 !== undefined ? data.v230 : null,
        v400: data.v400 !== undefined ? data.v400 : null,
        v460: data.v460 !== undefined ? data.v460 : null,
        v575: data.v575 !== undefined ? data.v575 : null,
        v2300: data.v2300 !== undefined ? data.v2300 : null
      });
    });

    // Sort by numerical horsepower
    fetched.sort((a, b) => {
      return parseHpToNumber(a.hp) - parseHpToNumber(b.hp);
    });

    cachedThreePhaseFLCData = fetched;
    return fetched;
  } catch (err) {
    console.warn("Using offline fallback cache for Three Phase FLC library:", err instanceof Error ? err.message : err);
    return cachedThreePhaseFLCData;
  }
}

// Parses fractional and standard string horsepowers into decimals for sorting.
export function parseHpToNumber(hpStr: string): number {
  if (!hpStr) return 0;
  const cleaned = hpStr.trim().replace(/\s+/g, " ");

  // Handle fractional cases like "1/2", "3/4"
  if (cleaned.includes("/")) {
    if (cleaned.includes(" ")) {
      const parts = cleaned.split(" ");
      const whole = parseFloat(parts[0]) || 0;
      const fracParts = parts[1].split("/");
      const num = parseFloat(fracParts[0]) || 0;
      const den = parseFloat(fracParts[1]) || 1;
      return whole + num / den;
    } else {
      const fracParts = cleaned.split("/");
      const num = parseFloat(fracParts[0]) || 0;
      const den = parseFloat(fracParts[1]) || 1;
      return num / den;
    }
  }
  return parseFloat(cleaned) || 0;
}

// Seeds the Firestore database backup with static values.
export async function seedThreePhaseFLCBackup(): Promise<void> {
  const colRef = collection(db, "motor_flc_library");
  for (const entry of INITIAL_THREE_PHASE_FLC_DATA) {
    const docRef = doc(colRef, entry.id);
    await setDoc(docRef, {
      hp: entry.hp,
      v115: entry.v115,
      v200: entry.v200,
      v208: entry.v208,
      v230: entry.v230,
      v400: entry.v400,
      v460: entry.v460,
      v575: entry.v575,
      v2300: entry.v2300
    });
  }
}

// Add or edit a specific FLC Entry document in Firestore.
export async function saveThreePhaseFLCEntry(entry: ThreePhaseFLCEntry): Promise<void> {
  const colRef = collection(db, "motor_flc_library");
  const docRef = doc(colRef, entry.id);
  await setDoc(docRef, {
    hp: entry.hp,
    v115: entry.v115,
    v200: entry.v200,
    v208: entry.v208,
    v230: entry.v230,
    v400: entry.v400,
    v460: entry.v460,
    v575: entry.v575,
    v2300: entry.v2300
  });

  // Hot update in-memory cache
  const idx = cachedThreePhaseFLCData.findIndex((c) => c.id === entry.id);
  if (idx !== -1) {
    cachedThreePhaseFLCData[idx] = entry;
  } else {
    cachedThreePhaseFLCData.push(entry);
  }
  cachedThreePhaseFLCData.sort((a, b) => parseHpToNumber(a.hp) - parseHpToNumber(b.hp));
}

// Delete a specific entry.
export async function deleteThreePhaseFLCEntry(entryId: string): Promise<void> {
  const docRef = doc(db, "motor_flc_library", entryId);
  await deleteDoc(docRef);

  // Hot remove from in-memory cache
  cachedThreePhaseFLCData = cachedThreePhaseFLCData.filter((c) => c.id !== entryId);
}

// Returns the final FLC current value based on HP, system Voltage, and Phase selection.
export function getMotorFLC(hp: string, systemVoltage: number, isThreePhase: boolean): number {
  if (!hp) return 0;

  if (isThreePhase) {
    const colName = getThreePhaseFLCColumn(systemVoltage);
    // Find in memory cache first
    const cleanHp = hp.trim().replace(/\s+/g, " ");
    const match = cachedThreePhaseFLCData.find((e) => e.hp.trim() === cleanHp) 
                  || INITIAL_THREE_PHASE_FLC_DATA.find((e) => e.hp.trim() === cleanHp);

    if (match) {
      const flcVal = match[colName];
      if (flcVal !== null && flcVal !== undefined) {
        return flcVal;
      }
    }

    // Secondary flexible search for matching decimal horsepower
    const targetDec = parseHpToNumber(hp);
    const closestMatch = [...cachedThreePhaseFLCData].sort((a, b) => {
      return Math.abs(parseHpToNumber(a.hp) - targetDec) - Math.abs(parseHpToNumber(b.hp) - targetDec);
    })[0];

    if (closestMatch) {
      const flcVal = closestMatch[colName];
      if (flcVal !== null && flcVal !== undefined) {
        return flcVal;
      }
    }

    return 0;
  } else {
    // Single Phase
    const cleanHp = hp.trim().replace(/\s+/g, " ");
    if (SINGLE_PHASE_FLC_TABLE[cleanHp] !== undefined) {
      return SINGLE_PHASE_FLC_TABLE[cleanHp];
    }
    // decimal lookup fallback
    const targetDec = parseHpToNumber(hp);
    let closestKey = "1/2";
    let minDiff = Infinity;
    for (const k of Object.keys(SINGLE_PHASE_FLC_TABLE)) {
      const diff = Math.abs(parseHpToNumber(k) - targetDec);
      if (diff < minDiff) {
        minDiff = diff;
        closestKey = k;
      }
    }
    return SINGLE_PHASE_FLC_TABLE[closestKey] || 0;
  }
}
