import { STANDARD_CB_RATINGS } from "../constants";

// PEC 2017 Table 3.10.2.6(B)(16) - Centralized Ampacity Database
// Allowable Ampacities of Insulated Conductors Rated Up to and Including 2,000 Volts, 60°C Through 90°C,
// Based on Ambient Temperature of 30°C, Not More Than Three Current-Carrying Conductors in Raceway, Cable, or Earth.

export interface ConductorAmpacityRow {
  size: number; // mm²
  copper: {
    60: number; // 60°C column
    75: number; // 75°C column
    90: number; // 90°C column
  };
  aluminum: {
    60: number | null; // 60°C column
    75: number | null; // 75°C column
    90: number | null; // 90°C column
  };
}

// Full PEC 2017 Table 3.10.2.6(B)(16) data
export const PEC_AMPACITY_TABLE: ConductorAmpacityRow[] = [
  { size: 2.0, copper: { 60: 15, 75: 20, 90: 25 }, aluminum: { 60: null, 75: null, 90: null } },
  { size: 3.5, copper: { 60: 20, 75: 25, 90: 30 }, aluminum: { 60: 15, 75: 20, 90: 25 } },
  { size: 5.5, copper: { 60: 30, 75: 35, 90: 40 }, aluminum: { 60: 25, 75: 30, 90: 35 } },
  { size: 8.0, copper: { 60: 40, 75: 50, 90: 55 }, aluminum: { 60: 30, 75: 40, 90: 45 } },
  { size: 14,   copper: { 60: 55, 75: 65, 90: 75 }, aluminum: { 60: 40, 75: 50, 90: 65 } },
  { size: 22,   copper: { 60: 70, 75: 85, 90: 95 }, aluminum: { 60: 55, 75: 65, 90: 80 } },
  { size: 30,   copper: { 60: 85, 75: 100, 90: 115 }, aluminum: { 60: 65, 75: 80, 90: 90 } },
  { size: 38,   copper: { 60: 100, 75: 115, 90: 130 }, aluminum: { 60: 75, 75: 90, 90: 105 } },
  { size: 50,   copper: { 60: 115, 75: 140, 90: 150 }, aluminum: { 60: 90, 75: 110, 90: 125 } },
  { size: 60,   copper: { 60: 130, 75: 155, 90: 170 }, aluminum: { 60: 100, 75: 120, 90: 135 } },
  { size: 80,   copper: { 60: 155, 75: 190, 90: 205 }, aluminum: { 60: 120, 75: 145, 90: 165 } },
  { size: 100,  copper: { 60: 185, 75: 220, 90: 240 }, aluminum: { 60: 140, 75: 170, 90: 190 } },
  { size: 125,  copper: { 60: 210, 75: 255, 90: 285 }, aluminum: { 60: 165, 75: 200, 90: 225 } },
  { size: 150,  copper: { 60: 240, 75: 285, 90: 320 }, aluminum: { 60: 190, 75: 230, 90: 255 } },
  { size: 175,  copper: { 60: 260, 75: 305, 90: 345 }, aluminum: { 60: 205, 75: 245, 90: 275 } },
  { size: 200,  copper: { 60: 275, 75: 325, 90: 360 }, aluminum: { 60: 220, 75: 265, 90: 300 } },
  { size: 250,  copper: { 60: 315, 75: 375, 90: 425 }, aluminum: { 60: 255, 75: 305, 90: 345 } },
  { size: 325,  copper: { 60: 370, 75: 435, 90: 490 }, aluminum: { 60: 300, 75: 355, 90: 405 } },
  { size: 375,  copper: { 60: 395, 75: 470, 90: 530 }, aluminum: { 60: 315, 75: 380, 90: 430 } },
  { size: 400,  copper: { 60: 400, 75: 480, 90: 535 }, aluminum: { 60: 320, 75: 385, 90: 440 } },
  { size: 500,  copper: { 60: 445, 75: 530, 90: 595 }, aluminum: { 60: 365, 75: 435, 90: 485 } }
];

export interface InsulationTypeMap {
  [key: string]: 60 | 75 | 90;
}

// Insulation type mapping to temperature columns
export const INSULATION_TEMPERATURE_MAP: InsulationTypeMap = {
  'TW': 60,
  'UF': 60,
  'RHW': 75,
  'THHW': 75,
  'THW': 75,
  'THWN': 75,
  'XHHW': 75,
  'USE': 75,
  'ZW': 75,
  'TBS': 90,
  'SA': 90,
  'SIS': 90,
  'FEP': 90,
  'FEPB': 90,
  'MI': 90,
  'RHH': 90,
  'RHW-2': 90,
  'THHN': 90,
  'THHW-2': 90,
  'THW-2': 90,
  'THWN-2': 90,
  'USE-2': 90,
  'XHH': 90,
  'XHHW-2': 90,
  'ZW-2': 90
};

/**
 * Gets the standard temperature rating for a recognized insulation type.
 * Defaults to 90°C if unknown.
 */
export const getTemperatureForInsulation = (insulation: string): 60 | 75 | 90 => {
  const norm = insulation.trim().toUpperCase();
  return INSULATION_TEMPERATURE_MAP[norm] ?? 90;
};

/**
 * Get ampacity for a specific wire size, material, and temperature/insulation rating.
 */
export const getConductorAmpacity = (
  sizeNum: number,
  material: 'Copper' | 'Aluminum',
  tempRating: 60 | 75 | 90
): number => {
  const row = PEC_AMPACITY_TABLE.find(r => Math.abs(r.size - sizeNum) < 0.01);
  if (!row) return 0;

  if (material === 'Copper') {
    return row.copper[tempRating];
  } else {
    // Standard aluminum ampacities - handle 2.0 mm² restrictions
    const amp = row.aluminum[tempRating];
    return amp !== null ? amp : 0;
  }
};

/**
 * Centralized sizing algorithm based on calculated load current, overcurrent breaker rating (AT),
 * conductor material, and insulation temp column.
 */
export const sizeConductor = (
  cbRating: number,
  designAmpacity: number,
  material: 'Copper' | 'Aluminum' = 'Copper',
  insulation: string = 'THHN',
  customTemp?: 60 | 75 | 90,
  isMotor?: boolean,
  isMultioutlet?: boolean
): { size: number; ampacity: number; runs: number } => {
  const tempRating = customTemp || getTemperatureForInsulation(insulation);

  const isAmpacityAcceptable = (amp: number, runs: number = 1): boolean => {
    const totalAmp = amp * runs;
    if (totalAmp < designAmpacity) return false;
    if (isMotor) return true; // Motor overload protects the wire
    if (isMultioutlet) return totalAmp >= cbRating; // Must be fully protected
    if (cbRating > 800) return totalAmp >= cbRating; // Next size up rule doesn't apply above 800A
    
    if (totalAmp >= cbRating) return true;

    // Under PEC, next-size-up is ONLY allowed if the conductor's ampacity does not correspond to a standard overcurrent device rating
    if (STANDARD_CB_RATINGS.includes(totalAmp)) return false;

    const nextBreaker = STANDARD_CB_RATINGS.find(r => r > totalAmp);
    return nextBreaker !== undefined && nextBreaker >= cbRating;
  };

  // Determine minimum allowable size to enforce PEC small conductor rules and safety
  let minSize = 2.0;
  if (!isMotor) {
    if (material === 'Copper') {
      if (cbRating > 30) {
        minSize = 8.0; // 5.5 mm² copper is limited to 30A overcurrent protection
      } else if (cbRating > 20) {
        minSize = 5.5; // 3.5 mm² copper is limited to 20A overcurrent protection
      } else if (cbRating > 15) {
        minSize = 3.5; // 2.0 mm² copper is limited to 15A overcurrent protection
      } else {
        minSize = 2.0;
      }
    } else { // Aluminum
      if (cbRating > 25) {
        minSize = 8.0; // 5.5 mm² aluminum is limited to 25A overcurrent protection
      } else if (cbRating > 15) {
        minSize = 5.5; // 3.5 mm² aluminum is limited to 15A overcurrent protection
      } else {
        minSize = 3.5;
      }
    }
  } else {
    minSize = material === 'Copper' ? 2.0 : 3.5;
  }

  // Handle paralleling for large breakers per PEC Article 3.10.1.10 (50 mm² or larger required)
  if (cbRating > 250) {
    let runs = 2;
    if (cbRating > 500) runs = 3;
    if (cbRating > 800) runs = 4;
    if (cbRating > 1200) runs = Math.ceil(designAmpacity / 300); // Dynamic scaling

    const row = PEC_AMPACITY_TABLE.find(r => {
      if (r.size < 50) return false;
      if (r.size < minSize) return false;
      const singleAmp = material === 'Copper' ? r.copper[tempRating] : r.aluminum[tempRating];
      return singleAmp !== null && isAmpacityAcceptable(singleAmp, runs);
    }) || PEC_AMPACITY_TABLE[PEC_AMPACITY_TABLE.length - 1];

    const singleAmp = (material === 'Copper' ? row.copper[tempRating] : row.aluminum[tempRating]) || 0;
    return { size: row.size, ampacity: singleAmp * runs, runs };
  }

  // Standard single run
  const row = PEC_AMPACITY_TABLE.find(r => {
    if (r.size < minSize) return false;
    const singleAmp = material === 'Copper' ? r.copper[tempRating] : r.aluminum[tempRating];
    return singleAmp !== null && isAmpacityAcceptable(singleAmp);
  }) || PEC_AMPACITY_TABLE.find(r => r.size >= minSize) || PEC_AMPACITY_TABLE[PEC_AMPACITY_TABLE.length - 1];

  const singleAmp = (material === 'Copper' ? row.copper[tempRating] : row.aluminum[tempRating]) || 0;
  return { size: row.size, ampacity: singleAmp, runs: 1 };
};
