import {
  SolarDesignConfig,
  PVModule,
  SolarInverter,
  SolarBattery,
  BatteryConfig,
  SolarBOMItem,
  CableRunConfig,
  SolarCalculationResults,
  SolarDesignOverrides,
  SolarEquipmentAutoValues,
  SolarEquipmentEffectiveValues,
  SolarAcSystem,
} from "../types/solar";
import { PanelConfig, Circuit } from "../types";
import { computePanelScheduleValues } from "./computeEngine";

// ==========================================
// 1. STANDARD PV MODULE LIBRARY (TIER 1)
// ==========================================
export const DEFAULT_PV_MODULES: PVModule[] = [
  // ==================== JINKO SOLAR ====================
  {
    id: "jinko-tiger-neo-620",
    manufacturer: "Jinko Solar",
    model: "Tiger Neo N-type 78HL4-(V) 620W",
    ratedPowerWp: 620,
    voc: 55.62,
    vmp: 46.54,
    isc: 14.15,
    imp: 13.32,
    maxSystemVoltage: 1500,
    efficiencyPercent: 22.18,
    tempCoeffVoc: -0.25,
    tempCoeffIsc: 0.045,
    tempCoeffPmax: -0.30,
    lengthMm: 2465,
    widthMm: 1134,
    thicknessMm: 35,
    weightKg: 30.6,
  },
  {
    id: "jinko-tiger-neo-585",
    manufacturer: "Jinko Solar",
    model: "Tiger Neo N-type 72HL4-(V) 585W",
    ratedPowerWp: 585,
    voc: 51.32,
    vmp: 42.74,
    isc: 14.47,
    imp: 13.69,
    maxSystemVoltage: 1500,
    efficiencyPercent: 22.65,
    tempCoeffVoc: -0.25,
    tempCoeffIsc: 0.045,
    tempCoeffPmax: -0.29,
    lengthMm: 2278,
    widthMm: 1134,
    thicknessMm: 35,
    weightKg: 28.0,
  },
  {
    id: "jinko-tiger-neo-575",
    manufacturer: "Jinko Solar",
    model: "Tiger Neo N-type 72HL4-(V) 575W",
    ratedPowerWp: 575,
    voc: 51.02,
    vmp: 42.44,
    isc: 14.31,
    imp: 13.55,
    maxSystemVoltage: 1500,
    efficiencyPercent: 22.26,
    tempCoeffVoc: -0.25,
    tempCoeffIsc: 0.045,
    tempCoeffPmax: -0.29,
    lengthMm: 2278,
    widthMm: 1134,
    thicknessMm: 35,
    weightKg: 28.0,
  },
  {
    id: "jinko-tiger-neo-440-res",
    manufacturer: "Jinko Solar",
    model: "Tiger Neo N-type 54HL4R-(V) 440W (Residential)",
    ratedPowerWp: 440,
    voc: 39.38,
    vmp: 32.81,
    isc: 13.86,
    imp: 13.41,
    maxSystemVoltage: 1500,
    efficiencyPercent: 22.02,
    tempCoeffVoc: -0.25,
    tempCoeffIsc: 0.045,
    tempCoeffPmax: -0.29,
    lengthMm: 1762,
    widthMm: 1134,
    thicknessMm: 30,
    weightKg: 21.0,
  },
  {
    id: "jinko-tiger-pro-545",
    manufacturer: "Jinko Solar",
    model: "Tiger Pro 72HC 545W Mono-PERC",
    ratedPowerWp: 545,
    voc: 49.62,
    vmp: 40.95,
    isc: 13.94,
    imp: 13.31,
    maxSystemVoltage: 1500,
    efficiencyPercent: 21.13,
    tempCoeffVoc: -0.28,
    tempCoeffIsc: 0.048,
    tempCoeffPmax: -0.35,
    lengthMm: 2274,
    widthMm: 1134,
    thicknessMm: 35,
    weightKg: 28.9,
  },

  // ==================== LONGI SOLAR ====================
  {
    id: "longi-himo6-585",
    manufacturer: "Longi Solar",
    model: "Hi-MO 6 Explorer LR5-72HTH 585W",
    ratedPowerWp: 585,
    voc: 52.06,
    vmp: 44.06,
    isc: 14.36,
    imp: 13.28,
    maxSystemVoltage: 1500,
    efficiencyPercent: 22.6,
    tempCoeffVoc: -0.23,
    tempCoeffIsc: 0.05,
    tempCoeffPmax: -0.29,
    lengthMm: 2278,
    widthMm: 1134,
    thicknessMm: 35,
    weightKg: 27.5,
  },
  {
    id: "longi-himo6-635",
    manufacturer: "Longi Solar",
    model: "Hi-MO 6 Scientist LR5-72HTD 635W",
    ratedPowerWp: 635,
    voc: 52.88,
    vmp: 44.82,
    isc: 14.98,
    imp: 14.17,
    maxSystemVoltage: 1500,
    efficiencyPercent: 23.0,
    tempCoeffVoc: -0.23,
    tempCoeffIsc: 0.05,
    tempCoeffPmax: -0.29,
    lengthMm: 2382,
    widthMm: 1134,
    thicknessMm: 30,
    weightKg: 33.5,
  },
  {
    id: "longi-himo7-600",
    manufacturer: "Longi Solar",
    model: "Hi-MO 7 LR7-72HGD 600W Bifacial HPDC",
    ratedPowerWp: 600,
    voc: 51.56,
    vmp: 43.43,
    isc: 14.81,
    imp: 13.82,
    maxSystemVoltage: 1500,
    efficiencyPercent: 23.2,
    tempCoeffVoc: -0.23,
    tempCoeffIsc: 0.045,
    tempCoeffPmax: -0.28,
    lengthMm: 2382,
    widthMm: 1134,
    thicknessMm: 30,
    weightKg: 33.5,
  },
  {
    id: "longi-himo5-550",
    manufacturer: "Longi Solar",
    model: "Hi-MO 5 LR5-72HPH 550W Mono-PERC",
    ratedPowerWp: 550,
    voc: 49.95,
    vmp: 41.95,
    isc: 13.98,
    imp: 13.12,
    maxSystemVoltage: 1500,
    efficiencyPercent: 21.3,
    tempCoeffVoc: -0.27,
    tempCoeffIsc: 0.05,
    tempCoeffPmax: -0.35,
    lengthMm: 2278,
    widthMm: 1134,
    thicknessMm: 35,
    weightKg: 27.5,
  },
  {
    id: "longi-himox6-435-res",
    manufacturer: "Longi Solar",
    model: "Hi-MO X6 Explorer LR5-54HTH 435W (Residential)",
    ratedPowerWp: 435,
    voc: 39.53,
    vmp: 33.04,
    isc: 14.08,
    imp: 13.17,
    maxSystemVoltage: 1500,
    efficiencyPercent: 22.3,
    tempCoeffVoc: -0.23,
    tempCoeffIsc: 0.05,
    tempCoeffPmax: -0.29,
    lengthMm: 1722,
    widthMm: 1134,
    thicknessMm: 30,
    weightKg: 20.8,
  },

  // ==================== TRINA SOLAR ====================
  {
    id: "trina-vertex-550",
    manufacturer: "Trina Solar",
    model: "Vertex TSM-DE19 550W",
    ratedPowerWp: 550,
    voc: 37.9,
    vmp: 31.6,
    isc: 18.52,
    imp: 17.40,
    maxSystemVoltage: 1500,
    efficiencyPercent: 21.0,
    tempCoeffVoc: -0.25,
    tempCoeffIsc: 0.04,
    tempCoeffPmax: -0.34,
    lengthMm: 2384,
    widthMm: 1096,
    thicknessMm: 35,
    weightKg: 28.6,
  },
  {
    id: "trina-vertex-s-440",
    manufacturer: "Trina Solar",
    model: "Vertex S+ TSM-NEG9R.28 440W (Residential)",
    ratedPowerWp: 440,
    voc: 52.2,
    vmp: 44.0,
    isc: 10.67,
    imp: 10.01,
    maxSystemVoltage: 1500,
    efficiencyPercent: 22.0,
    tempCoeffVoc: -0.24,
    tempCoeffIsc: 0.04,
    tempCoeffPmax: -0.30,
    lengthMm: 1762,
    widthMm: 1134,
    thicknessMm: 30,
    weightKg: 21.0,
  },
  {
    id: "trina-vertex-s-450",
    manufacturer: "Trina Solar",
    model: "Vertex S+ TSM-NEG9RC.27 450W (Residential)",
    ratedPowerWp: 450,
    voc: 52.9,
    vmp: 44.6,
    isc: 10.74,
    imp: 10.09,
    maxSystemVoltage: 1500,
    efficiencyPercent: 22.5,
    tempCoeffVoc: -0.24,
    tempCoeffIsc: 0.04,
    tempCoeffPmax: -0.30,
    lengthMm: 1762,
    widthMm: 1134,
    thicknessMm: 30,
    weightKg: 21.0,
  },
  {
    id: "trina-vertex-660",
    manufacturer: "Trina Solar",
    model: "Vertex TSM-DEG21C.20 660W Bifacial",
    ratedPowerWp: 660,
    voc: 45.7,
    vmp: 38.3,
    isc: 18.57,
    imp: 17.24,
    maxSystemVoltage: 1500,
    efficiencyPercent: 21.2,
    tempCoeffVoc: -0.25,
    tempCoeffIsc: 0.04,
    tempCoeffPmax: -0.34,
    lengthMm: 2384,
    widthMm: 1303,
    thicknessMm: 35,
    weightKg: 33.7,
  },
  {
    id: "trina-vertex-n-700",
    manufacturer: "Trina Solar",
    model: "Vertex N TSM-NEG21C.20 700W (High-Power Utility)",
    ratedPowerWp: 700,
    voc: 47.9,
    vmp: 40.5,
    isc: 18.42,
    imp: 17.29,
    maxSystemVoltage: 1500,
    efficiencyPercent: 22.5,
    tempCoeffVoc: -0.24,
    tempCoeffIsc: 0.04,
    tempCoeffPmax: -0.29,
    lengthMm: 2384,
    widthMm: 1303,
    thicknessMm: 33,
    weightKg: 38.3,
  },

  // ==================== CANADIAN SOLAR ====================
  {
    id: "canadian-solar-hiku7-660",
    manufacturer: "Canadian Solar",
    model: "HiKu7 CS7N-660MS 660W",
    ratedPowerWp: 660,
    voc: 45.0,
    vmp: 38.3,
    isc: 18.55,
    imp: 17.24,
    maxSystemVoltage: 1500,
    efficiencyPercent: 21.2,
    tempCoeffVoc: -0.26,
    tempCoeffIsc: 0.05,
    tempCoeffPmax: -0.34,
    lengthMm: 2384,
    widthMm: 1303,
    thicknessMm: 35,
    weightKg: 34.4,
  },
  {
    id: "canadian-solar-bihiku7-670",
    manufacturer: "Canadian Solar",
    model: "BiHiKu7 CS7N-670TB-AG 670W Bifacial TOPCon",
    ratedPowerWp: 670,
    voc: 45.4,
    vmp: 38.6,
    isc: 18.66,
    imp: 17.36,
    maxSystemVoltage: 1500,
    efficiencyPercent: 21.6,
    tempCoeffVoc: -0.25,
    tempCoeffIsc: 0.04,
    tempCoeffPmax: -0.30,
    lengthMm: 2384,
    widthMm: 1303,
    thicknessMm: 33,
    weightKg: 37.8,
  },
  {
    id: "canadian-solar-tophiku6-580",
    manufacturer: "Canadian Solar",
    model: "TOPHiKu6 CS6W-580T 580W TOPCon",
    ratedPowerWp: 580,
    voc: 52.0,
    vmp: 43.6,
    isc: 14.09,
    imp: 13.31,
    maxSystemVoltage: 1500,
    efficiencyPercent: 22.5,
    tempCoeffVoc: -0.25,
    tempCoeffIsc: 0.04,
    tempCoeffPmax: -0.29,
    lengthMm: 2278,
    widthMm: 1134,
    thicknessMm: 30,
    weightKg: 27.6,
  },
  {
    id: "canadian-solar-hiku6-550",
    manufacturer: "Canadian Solar",
    model: "HiKu6 CS6W-550MS 550W Mono-PERC",
    ratedPowerWp: 550,
    voc: 49.6,
    vmp: 41.7,
    isc: 14.00,
    imp: 13.20,
    maxSystemVoltage: 1500,
    efficiencyPercent: 21.3,
    tempCoeffVoc: -0.26,
    tempCoeffIsc: 0.05,
    tempCoeffPmax: -0.34,
    lengthMm: 2278,
    widthMm: 1134,
    thicknessMm: 35,
    weightKg: 27.6,
  },
  {
    id: "canadian-solar-tophiku6-440-res",
    manufacturer: "Canadian Solar",
    model: "TOPHiKu6 CS6R-440T 440W (Residential)",
    ratedPowerWp: 440,
    voc: 39.4,
    vmp: 32.8,
    isc: 14.01,
    imp: 13.42,
    maxSystemVoltage: 1500,
    efficiencyPercent: 22.5,
    tempCoeffVoc: -0.25,
    tempCoeffIsc: 0.04,
    tempCoeffPmax: -0.29,
    lengthMm: 1722,
    widthMm: 1134,
    thicknessMm: 30,
    weightKg: 21.3,
  },

  // ==================== JA SOLAR ====================
  {
    id: "ja-solar-deepblue4-575",
    manufacturer: "JA Solar",
    model: "DeepBlue 4.0 Pro JAM72D42-575/LB 575W N-type",
    ratedPowerWp: 575,
    voc: 51.10,
    vmp: 42.60,
    isc: 14.30,
    imp: 13.50,
    maxSystemVoltage: 1500,
    efficiencyPercent: 22.3,
    tempCoeffVoc: -0.26,
    tempCoeffIsc: 0.046,
    tempCoeffPmax: -0.30,
    lengthMm: 2278,
    widthMm: 1134,
    thicknessMm: 30,
    weightKg: 31.8,
  },
  {
    id: "ja-solar-deepblue4-630",
    manufacturer: "JA Solar",
    model: "DeepBlue 4.0 Pro JAM72D42-630/LB 630W N-type",
    ratedPowerWp: 630,
    voc: 52.40,
    vmp: 43.80,
    isc: 15.15,
    imp: 14.39,
    maxSystemVoltage: 1500,
    efficiencyPercent: 22.6,
    tempCoeffVoc: -0.26,
    tempCoeffIsc: 0.046,
    tempCoeffPmax: -0.30,
    lengthMm: 2465,
    widthMm: 1134,
    thicknessMm: 35,
    weightKg: 34.6,
  },
  {
    id: "ja-solar-deepblue3-545",
    manufacturer: "JA Solar",
    model: "DeepBlue 3.0 JAM72S30-545/MR 545W Mono-PERC",
    ratedPowerWp: 545,
    voc: 49.75,
    vmp: 41.80,
    isc: 13.93,
    imp: 13.04,
    maxSystemVoltage: 1500,
    efficiencyPercent: 21.1,
    tempCoeffVoc: -0.275,
    tempCoeffIsc: 0.045,
    tempCoeffPmax: -0.35,
    lengthMm: 2279,
    widthMm: 1134,
    thicknessMm: 35,
    weightKg: 28.6,
  },
  {
    id: "ja-solar-deepblue4-440-res",
    manufacturer: "JA Solar",
    model: "DeepBlue 4.0 Pro JAM54D40-440/LB 440W (Residential)",
    ratedPowerWp: 440,
    voc: 39.20,
    vmp: 32.70,
    isc: 14.28,
    imp: 13.46,
    maxSystemVoltage: 1500,
    efficiencyPercent: 22.0,
    tempCoeffVoc: -0.26,
    tempCoeffIsc: 0.046,
    tempCoeffPmax: -0.30,
    lengthMm: 1762,
    widthMm: 1134,
    thicknessMm: 30,
    weightKg: 22.0,
  },

  // ==================== RISEN ENERGY ====================
  {
    id: "risen-titan-550",
    manufacturer: "Risen Energy",
    model: "Titan RSM144-9-550M 550W Mono-PERC",
    ratedPowerWp: 550,
    voc: 49.80,
    vmp: 41.90,
    isc: 13.98,
    imp: 13.13,
    maxSystemVoltage: 1500,
    efficiencyPercent: 21.3,
    tempCoeffVoc: -0.25,
    tempCoeffIsc: 0.04,
    tempCoeffPmax: -0.34,
    lengthMm: 2279,
    widthMm: 1134,
    thicknessMm: 35,
    weightKg: 27.5,
  },
  {
    id: "risen-hyperion-hjt-700",
    manufacturer: "Risen Energy",
    model: "Hyper-ion HJT RSM132-8-700BHDG 700W HJT",
    ratedPowerWp: 700,
    voc: 49.56,
    vmp: 41.68,
    isc: 17.65,
    imp: 16.80,
    maxSystemVoltage: 1500,
    efficiencyPercent: 22.5,
    tempCoeffVoc: -0.22,
    tempCoeffIsc: 0.045,
    tempCoeffPmax: -0.26,
    lengthMm: 2384,
    widthMm: 1303,
    thicknessMm: 33,
    weightKg: 38.5,
  },

  // ==================== TONGWEI (TW SOLAR) ====================
  {
    id: "tw-solar-twmnd-585",
    manufacturer: "Tongwei Solar",
    model: "TWMND-72HD585 585W TOPCon Bifacial",
    ratedPowerWp: 585,
    voc: 51.24,
    vmp: 43.14,
    isc: 14.34,
    imp: 13.57,
    maxSystemVoltage: 1500,
    efficiencyPercent: 22.6,
    tempCoeffVoc: -0.25,
    tempCoeffIsc: 0.045,
    tempCoeffPmax: -0.30,
    lengthMm: 2278,
    widthMm: 1134,
    thicknessMm: 30,
    weightKg: 32.0,
  },
  {
    id: "tw-solar-twmnh-670",
    manufacturer: "Tongwei Solar",
    model: "TWMNH-66HD670 670W G12 TOPCon",
    ratedPowerWp: 670,
    voc: 46.10,
    vmp: 38.40,
    isc: 18.52,
    imp: 17.45,
    maxSystemVoltage: 1500,
    efficiencyPercent: 21.6,
    tempCoeffVoc: -0.25,
    tempCoeffIsc: 0.045,
    tempCoeffPmax: -0.30,
    lengthMm: 2384,
    widthMm: 1303,
    thicknessMm: 33,
    weightKg: 38.0,
  },

  // ==================== ASTRONERGY (CHINT) ====================
  {
    id: "astronergy-astro-n5-580",
    manufacturer: "Astronergy",
    model: "ASTRO N5 CHSM72N(DG)/F-BH 580W TOPCon",
    ratedPowerWp: 580,
    voc: 51.35,
    vmp: 42.71,
    isc: 14.37,
    imp: 13.58,
    maxSystemVoltage: 1500,
    efficiencyPercent: 22.5,
    tempCoeffVoc: -0.25,
    tempCoeffIsc: 0.043,
    tempCoeffPmax: -0.29,
    lengthMm: 2278,
    widthMm: 1134,
    thicknessMm: 32,
    weightKg: 32.1,
  },

  // ==================== HANWHA QCELLS ====================
  {
    id: "qcells-qpeak-duo-585",
    manufacturer: "Hanwha Qcells",
    model: "Q.PEAK DUO XL-G11.3/BFG 585W",
    ratedPowerWp: 585,
    voc: 53.62,
    vmp: 45.18,
    isc: 13.88,
    imp: 12.95,
    maxSystemVoltage: 1500,
    efficiencyPercent: 21.7,
    tempCoeffVoc: -0.25,
    tempCoeffIsc: 0.04,
    tempCoeffPmax: -0.34,
    lengthMm: 2416,
    widthMm: 1134,
    thicknessMm: 35,
    weightKg: 30.7,
  },
  {
    id: "qcells-qpeak-duo-405-res",
    manufacturer: "Hanwha Qcells",
    model: "Q.PEAK DUO BLK ML-G10+ 405W (Residential)",
    ratedPowerWp: 405,
    voc: 45.30,
    vmp: 37.95,
    isc: 10.95,
    imp: 10.67,
    maxSystemVoltage: 1000,
    efficiencyPercent: 20.6,
    tempCoeffVoc: -0.27,
    tempCoeffIsc: 0.04,
    tempCoeffPmax: -0.35,
    lengthMm: 1879,
    widthMm: 1045,
    thicknessMm: 32,
    weightKg: 22.0,
  },

  // ==================== MAXEON / SUNPOWER ====================
  {
    id: "maxeon-6-ac-430-res",
    manufacturer: "Maxeon / SunPower",
    model: "Maxeon 6 AC 430W Premium IBC",
    ratedPowerWp: 430,
    voc: 75.6,
    vmp: 63.8,
    isc: 6.94,
    imp: 6.74,
    maxSystemVoltage: 1000,
    efficiencyPercent: 22.2,
    tempCoeffVoc: -0.23,
    tempCoeffIsc: 0.05,
    tempCoeffPmax: -0.29,
    lengthMm: 1872,
    widthMm: 1032,
    thicknessMm: 40,
    weightKg: 21.8,
  },
  {
    id: "maxeon-3-400-res",
    manufacturer: "Maxeon / SunPower",
    model: "Maxeon 3 400W High-Efficiency IBC",
    ratedPowerWp: 400,
    voc: 75.6,
    vmp: 65.8,
    isc: 6.58,
    imp: 6.08,
    maxSystemVoltage: 1000,
    efficiencyPercent: 22.6,
    tempCoeffVoc: -0.23,
    tempCoeffIsc: 0.05,
    tempCoeffPmax: -0.29,
    lengthMm: 1690,
    widthMm: 1046,
    thicknessMm: 40,
    weightKg: 19.0,
  },

  // ==================== REC SOLAR ====================
  {
    id: "rec-alpha-pure-r-430-res",
    manufacturer: "REC Solar",
    model: "Alpha Pure-R REC430AA 430W HJT",
    ratedPowerWp: 430,
    voc: 59.7,
    vmp: 50.5,
    isc: 8.89,
    imp: 8.52,
    maxSystemVoltage: 1000,
    efficiencyPercent: 22.2,
    tempCoeffVoc: -0.24,
    tempCoeffIsc: 0.04,
    tempCoeffPmax: -0.26,
    lengthMm: 1730,
    widthMm: 1118,
    thicknessMm: 30,
    weightKg: 21.5,
  },

  // ==================== HYUNDAI SOLAR ====================
  {
    id: "hyundai-hie-s400vg-res",
    manufacturer: "Hyundai Solar",
    model: "HiE-S400VG 400W Shingled",
    ratedPowerWp: 400,
    voc: 46.4,
    vmp: 38.6,
    isc: 10.97,
    imp: 10.36,
    maxSystemVoltage: 1500,
    efficiencyPercent: 20.7,
    tempCoeffVoc: -0.27,
    tempCoeffIsc: 0.04,
    tempCoeffPmax: -0.34,
    lengthMm: 1719,
    widthMm: 1140,
    thicknessMm: 35,
    weightKg: 22.0,
  },

  // ==================== SERAPHIM ====================
  {
    id: "seraphim-blade-550",
    manufacturer: "Seraphim",
    model: "Blade S4 SRP-550-BMA-BG 550W",
    ratedPowerWp: 550,
    voc: 49.80,
    vmp: 41.95,
    isc: 14.01,
    imp: 13.12,
    maxSystemVoltage: 1500,
    efficiencyPercent: 21.3,
    tempCoeffVoc: -0.28,
    tempCoeffIsc: 0.05,
    tempCoeffPmax: -0.35,
    lengthMm: 2278,
    widthMm: 1134,
    thicknessMm: 30,
    weightKg: 27.5,
  },
];

// ==========================================
// 2. STANDARD INVERTER LIBRARY
// ==========================================
export const DEFAULT_INVERTERS: SolarInverter[] = [
  // ==================== HUAWEI FUSIONSOLAR ====================
  // Residential 1PH (230V)
  {
    id: "huawei-sun2000-2ktl-l1",
    manufacturer: "Huawei",
    model: "SUN2000-2KTL-L1 (1PH 230V)",
    ratedAcPowerKw: 2.0,
    maxDcInputPowerKw: 3.0,
    maxDcVoltage: 600,
    mpptVoltageRangeMin: 90,
    mpptVoltageRangeMax: 560,
    numMppts: 2,
    maxInputCurrentPerMppt: 12.5,
    maxIscPerMppt: 18.0,
    ratedAcCurrent: 8.7,
    maxAcCurrent: 10.0,
    acVoltage: 230,
    phase: "1PH",
    frequencyHz: 60,
    efficiencyPercent: 98.2,
    ipRating: "IP65",
  },
  {
    id: "huawei-sun2000-3ktl-l1",
    manufacturer: "Huawei",
    model: "SUN2000-3KTL-L1 (1PH 230V)",
    ratedAcPowerKw: 3.0,
    maxDcInputPowerKw: 4.5,
    maxDcVoltage: 600,
    mpptVoltageRangeMin: 90,
    mpptVoltageRangeMax: 560,
    numMppts: 2,
    maxInputCurrentPerMppt: 12.5,
    maxIscPerMppt: 18.0,
    ratedAcCurrent: 13.0,
    maxAcCurrent: 15.0,
    acVoltage: 230,
    phase: "1PH",
    frequencyHz: 60,
    efficiencyPercent: 98.3,
    ipRating: "IP65",
  },
  {
    id: "huawei-sun2000-5ktl-l1",
    manufacturer: "Huawei",
    model: "SUN2000-5KTL-L1 (1PH 230V)",
    ratedAcPowerKw: 5.0,
    maxDcInputPowerKw: 7.5,
    maxDcVoltage: 600,
    mpptVoltageRangeMin: 90,
    mpptVoltageRangeMax: 560,
    numMppts: 2,
    maxInputCurrentPerMppt: 12.5,
    maxIscPerMppt: 18.0,
    ratedAcCurrent: 21.7,
    maxAcCurrent: 25.0,
    acVoltage: 230,
    phase: "1PH",
    frequencyHz: 60,
    efficiencyPercent: 98.4,
    ipRating: "IP65",
  },
  {
    id: "huawei-sun2000-6ktl-l1",
    manufacturer: "Huawei",
    model: "SUN2000-6KTL-L1 (1PH 230V)",
    ratedAcPowerKw: 6.0,
    maxDcInputPowerKw: 9.0,
    maxDcVoltage: 600,
    mpptVoltageRangeMin: 90,
    mpptVoltageRangeMax: 560,
    numMppts: 2,
    maxInputCurrentPerMppt: 12.5,
    maxIscPerMppt: 18.0,
    ratedAcCurrent: 26.1,
    maxAcCurrent: 27.3,
    acVoltage: 230,
    phase: "1PH",
    frequencyHz: 60,
    efficiencyPercent: 98.4,
    ipRating: "IP65",
  },

  // Residential & Light C&I 3PH (400V)
  {
    id: "huawei-sun2000-5ktl-m1",
    manufacturer: "Huawei",
    model: "SUN2000-5KTL-M1 (3PH 400V)",
    ratedAcPowerKw: 5.0,
    maxDcInputPowerKw: 7.5,
    maxDcVoltage: 1100,
    mpptVoltageRangeMin: 140,
    mpptVoltageRangeMax: 980,
    numMppts: 2,
    maxInputCurrentPerMppt: 13.5,
    maxIscPerMppt: 19.5,
    ratedAcCurrent: 7.2,
    maxAcCurrent: 8.5,
    acVoltage: 400,
    phase: "3PH",
    frequencyHz: 60,
    efficiencyPercent: 98.4,
    ipRating: "IP65",
  },
  {
    id: "huawei-sun2000-10ktl-m1",
    manufacturer: "Huawei",
    model: "SUN2000-10KTL-M1 (3PH 400V)",
    ratedAcPowerKw: 10.0,
    maxDcInputPowerKw: 15.0,
    maxDcVoltage: 1100,
    mpptVoltageRangeMin: 140,
    mpptVoltageRangeMax: 980,
    numMppts: 2,
    maxInputCurrentPerMppt: 13.5,
    maxIscPerMppt: 19.5,
    ratedAcCurrent: 14.5,
    maxAcCurrent: 16.9,
    acVoltage: 400,
    phase: "3PH",
    frequencyHz: 60,
    efficiencyPercent: 98.6,
    ipRating: "IP65",
  },
  {
    id: "huawei-sun2000-12ktl-m2",
    manufacturer: "Huawei",
    model: "SUN2000-12KTL-M2 (3PH 400V)",
    ratedAcPowerKw: 12.0,
    maxDcInputPowerKw: 18.0,
    maxDcVoltage: 1080,
    mpptVoltageRangeMin: 160,
    mpptVoltageRangeMax: 950,
    numMppts: 2,
    maxInputCurrentPerMppt: 22.0,
    maxIscPerMppt: 30.0,
    ratedAcCurrent: 17.3,
    maxAcCurrent: 20.0,
    acVoltage: 400,
    phase: "3PH",
    frequencyHz: 60,
    efficiencyPercent: 98.5,
    ipRating: "IP65",
  },
  {
    id: "huawei-sun2000-15ktl-m2",
    manufacturer: "Huawei",
    model: "SUN2000-15KTL-M2 (3PH 400V)",
    ratedAcPowerKw: 15.0,
    maxDcInputPowerKw: 22.5,
    maxDcVoltage: 1080,
    mpptVoltageRangeMin: 160,
    mpptVoltageRangeMax: 950,
    numMppts: 2,
    maxInputCurrentPerMppt: 22.0,
    maxIscPerMppt: 30.0,
    ratedAcCurrent: 21.7,
    maxAcCurrent: 25.2,
    acVoltage: 400,
    phase: "3PH",
    frequencyHz: 60,
    efficiencyPercent: 98.65,
    ipRating: "IP65",
  },
  {
    id: "huawei-sun2000-20ktl-m2",
    manufacturer: "Huawei",
    model: "SUN2000-20KTL-M2 (3PH 400V)",
    ratedAcPowerKw: 20.0,
    maxDcInputPowerKw: 30.0,
    maxDcVoltage: 1080,
    mpptVoltageRangeMin: 160,
    mpptVoltageRangeMax: 950,
    numMppts: 2,
    maxInputCurrentPerMppt: 22.0,
    maxIscPerMppt: 30.0,
    ratedAcCurrent: 28.9,
    maxAcCurrent: 33.5,
    acVoltage: 400,
    phase: "3PH",
    frequencyHz: 60,
    efficiencyPercent: 98.65,
    ipRating: "IP65",
  },

  // Commercial & Industrial (C&I) 3PH (400V)
  {
    id: "huawei-sun2000-30ktl-m3",
    manufacturer: "Huawei",
    model: "SUN2000-30KTL-M3 (3PH 400V)",
    ratedAcPowerKw: 30.0,
    maxDcInputPowerKw: 45.0,
    maxDcVoltage: 1100,
    mpptVoltageRangeMin: 200,
    mpptVoltageRangeMax: 1000,
    numMppts: 4,
    maxInputCurrentPerMppt: 30.0,
    maxIscPerMppt: 40.0,
    ratedAcCurrent: 43.3,
    maxAcCurrent: 47.9,
    acVoltage: 400,
    phase: "3PH",
    frequencyHz: 60,
    efficiencyPercent: 98.7,
    ipRating: "IP66",
  },
  {
    id: "huawei-sun2000-40ktl-m3",
    manufacturer: "Huawei",
    model: "SUN2000-40KTL-M3 (3PH 400V)",
    ratedAcPowerKw: 40.0,
    maxDcInputPowerKw: 60.0,
    maxDcVoltage: 1100,
    mpptVoltageRangeMin: 200,
    mpptVoltageRangeMax: 1000,
    numMppts: 4,
    maxInputCurrentPerMppt: 30.0,
    maxIscPerMppt: 40.0,
    ratedAcCurrent: 57.8,
    maxAcCurrent: 63.8,
    acVoltage: 400,
    phase: "3PH",
    frequencyHz: 60,
    efficiencyPercent: 98.7,
    ipRating: "IP66",
  },
  {
    id: "huawei-sun2000-50ktl-m3",
    manufacturer: "Huawei",
    model: "SUN2000-50KTL-M3 (3PH 400V)",
    ratedAcPowerKw: 50.0,
    maxDcInputPowerKw: 75.0,
    maxDcVoltage: 1100,
    mpptVoltageRangeMin: 200,
    mpptVoltageRangeMax: 1000,
    numMppts: 4,
    maxInputCurrentPerMppt: 30.0,
    maxIscPerMppt: 40.0,
    ratedAcCurrent: 72.2,
    maxAcCurrent: 79.7,
    acVoltage: 400,
    phase: "3PH",
    frequencyHz: 60,
    efficiencyPercent: 98.5,
    ipRating: "IP66",
  },
  {
    id: "huawei-sun2000-100ktl-m2",
    manufacturer: "Huawei",
    model: "SUN2000-100KTL-M2 (3PH 400V)",
    ratedAcPowerKw: 100.0,
    maxDcInputPowerKw: 150.0,
    maxDcVoltage: 1100,
    mpptVoltageRangeMin: 200,
    mpptVoltageRangeMax: 1000,
    numMppts: 10,
    maxInputCurrentPerMppt: 30.0,
    maxIscPerMppt: 40.0,
    ratedAcCurrent: 144.4,
    maxAcCurrent: 160.4,
    acVoltage: 400,
    phase: "3PH",
    frequencyHz: 60,
    efficiencyPercent: 98.8,
    ipRating: "IP66",
  },
  {
    id: "huawei-sun2000-115ktl-m2",
    manufacturer: "Huawei",
    model: "SUN2000-115KTL-M2 (3PH 400V)",
    ratedAcPowerKw: 115.0,
    maxDcInputPowerKw: 172.5,
    maxDcVoltage: 1100,
    mpptVoltageRangeMin: 200,
    mpptVoltageRangeMax: 1000,
    numMppts: 10,
    maxInputCurrentPerMppt: 30.0,
    maxIscPerMppt: 40.0,
    ratedAcCurrent: 166.0,
    maxAcCurrent: 182.0,
    acVoltage: 400,
    phase: "3PH",
    frequencyHz: 60,
    efficiencyPercent: 98.8,
    ipRating: "IP66",
  },
  {
    id: "huawei-sun2000-330ktl-h1",
    manufacturer: "Huawei",
    model: "SUN2000-330KTL-H1 Utility (3PH 800V)",
    ratedAcPowerKw: 330.0,
    maxDcInputPowerKw: 495.0,
    maxDcVoltage: 1500,
    mpptVoltageRangeMin: 500,
    mpptVoltageRangeMax: 1500,
    numMppts: 6,
    maxInputCurrentPerMppt: 65.0,
    maxIscPerMppt: 115.0,
    ratedAcCurrent: 238.2,
    maxAcCurrent: 264.7,
    acVoltage: 800,
    phase: "3PH",
    frequencyHz: 60,
    efficiencyPercent: 99.0,
    ipRating: "IP66",
  },

  // ==================== SUNGROW ====================
  // Residential 1PH
  {
    id: "sungrow-sg3-0rs",
    manufacturer: "Sungrow",
    model: "SG3.0RS (1PH 230V)",
    ratedAcPowerKw: 3.0,
    maxDcInputPowerKw: 4.5,
    maxDcVoltage: 600,
    mpptVoltageRangeMin: 40,
    mpptVoltageRangeMax: 560,
    numMppts: 2,
    maxInputCurrentPerMppt: 16.0,
    maxIscPerMppt: 20.0,
    ratedAcCurrent: 13.1,
    maxAcCurrent: 14.0,
    acVoltage: 230,
    phase: "1PH",
    frequencyHz: 60,
    efficiencyPercent: 97.9,
    ipRating: "IP65",
  },
  {
    id: "sungrow-sg5-0rs",
    manufacturer: "Sungrow",
    model: "SG5.0RS (1PH 230V)",
    ratedAcPowerKw: 5.0,
    maxDcInputPowerKw: 7.5,
    maxDcVoltage: 600,
    mpptVoltageRangeMin: 40,
    mpptVoltageRangeMax: 560,
    numMppts: 2,
    maxInputCurrentPerMppt: 16.0,
    maxIscPerMppt: 20.0,
    ratedAcCurrent: 21.7,
    maxAcCurrent: 22.8,
    acVoltage: 230,
    phase: "1PH",
    frequencyHz: 60,
    efficiencyPercent: 98.2,
    ipRating: "IP65",
  },
  {
    id: "sungrow-sh5-0rs-hybrid",
    manufacturer: "Sungrow",
    model: "SH5.0RS Single-Phase Hybrid (1PH 230V)",
    ratedAcPowerKw: 5.0,
    maxDcInputPowerKw: 7.5,
    maxDcVoltage: 600,
    mpptVoltageRangeMin: 40,
    mpptVoltageRangeMax: 560,
    numMppts: 2,
    maxInputCurrentPerMppt: 16.0,
    maxIscPerMppt: 20.0,
    ratedAcCurrent: 21.7,
    maxAcCurrent: 22.8,
    acVoltage: 230,
    phase: "1PH",
    frequencyHz: 60,
    efficiencyPercent: 97.7,
    ipRating: "IP65",
  },

  // Commercial 3PH
  {
    id: "sungrow-sg10rt",
    manufacturer: "Sungrow",
    model: "SG10RT (3PH 400V)",
    ratedAcPowerKw: 10.0,
    maxDcInputPowerKw: 15.0,
    maxDcVoltage: 1100,
    mpptVoltageRangeMin: 160,
    mpptVoltageRangeMax: 1000,
    numMppts: 2,
    maxInputCurrentPerMppt: 25.0,
    maxIscPerMppt: 32.0,
    ratedAcCurrent: 14.5,
    maxAcCurrent: 16.0,
    acVoltage: 400,
    phase: "3PH",
    frequencyHz: 60,
    efficiencyPercent: 98.5,
    ipRating: "IP65",
  },
  {
    id: "sungrow-sg15rt",
    manufacturer: "Sungrow",
    model: "SG15RT (3PH 400V)",
    ratedAcPowerKw: 15.0,
    maxDcInputPowerKw: 22.5,
    maxDcVoltage: 1100,
    mpptVoltageRangeMin: 160,
    mpptVoltageRangeMax: 1000,
    numMppts: 2,
    maxInputCurrentPerMppt: 25.0,
    maxIscPerMppt: 32.0,
    ratedAcCurrent: 21.7,
    maxAcCurrent: 23.9,
    acVoltage: 400,
    phase: "3PH",
    frequencyHz: 60,
    efficiencyPercent: 98.5,
    ipRating: "IP65",
  },
  {
    id: "sungrow-sg20rt",
    manufacturer: "Sungrow",
    model: "SG20RT (3PH 400V)",
    ratedAcPowerKw: 20.0,
    maxDcInputPowerKw: 30.0,
    maxDcVoltage: 1100,
    mpptVoltageRangeMin: 160,
    mpptVoltageRangeMax: 1000,
    numMppts: 2,
    maxInputCurrentPerMppt: 25.0,
    maxIscPerMppt: 32.0,
    ratedAcCurrent: 29.0,
    maxAcCurrent: 31.9,
    acVoltage: 400,
    phase: "3PH",
    frequencyHz: 60,
    efficiencyPercent: 98.5,
    ipRating: "IP65",
  },
  {
    id: "sungrow-sg33cx",
    manufacturer: "Sungrow",
    model: "SG33CX Multi-MPPT (3PH 400V)",
    ratedAcPowerKw: 33.0,
    maxDcInputPowerKw: 50.0,
    maxDcVoltage: 1100,
    mpptVoltageRangeMin: 200,
    mpptVoltageRangeMax: 1000,
    numMppts: 3,
    maxInputCurrentPerMppt: 26.0,
    maxIscPerMppt: 40.0,
    ratedAcCurrent: 47.6,
    maxAcCurrent: 50.0,
    acVoltage: 400,
    phase: "3PH",
    frequencyHz: 60,
    efficiencyPercent: 98.6,
    ipRating: "IP66",
  },
  {
    id: "sungrow-sg50cx-p2",
    manufacturer: "Sungrow",
    model: "SG50CX-P2 Multi-MPPT (3PH 400V)",
    ratedAcPowerKw: 50.0,
    maxDcInputPowerKw: 75.0,
    maxDcVoltage: 1100,
    mpptVoltageRangeMin: 200,
    mpptVoltageRangeMax: 1000,
    numMppts: 4,
    maxInputCurrentPerMppt: 30.0,
    maxIscPerMppt: 45.0,
    ratedAcCurrent: 72.2,
    maxAcCurrent: 79.4,
    acVoltage: 400,
    phase: "3PH",
    frequencyHz: 60,
    efficiencyPercent: 98.6,
    ipRating: "IP66",
  },
  {
    id: "sungrow-sg110cx",
    manufacturer: "Sungrow",
    model: "SG110CX Multi-MPPT (3PH 400V)",
    ratedAcPowerKw: 110.0,
    maxDcInputPowerKw: 165.0,
    maxDcVoltage: 1100,
    mpptVoltageRangeMin: 200,
    mpptVoltageRangeMax: 1000,
    numMppts: 9,
    maxInputCurrentPerMppt: 26.0,
    maxIscPerMppt: 40.0,
    ratedAcCurrent: 158.8,
    maxAcCurrent: 174.6,
    acVoltage: 400,
    phase: "3PH",
    frequencyHz: 60,
    efficiencyPercent: 98.7,
    ipRating: "IP66",
  },
  {
    id: "sungrow-sg125hx",
    manufacturer: "Sungrow",
    model: "SG125HX Multi-MPPT (3PH 400V)",
    ratedAcPowerKw: 125.0,
    maxDcInputPowerKw: 187.5,
    maxDcVoltage: 1100,
    mpptVoltageRangeMin: 200,
    mpptVoltageRangeMax: 1000,
    numMppts: 12,
    maxInputCurrentPerMppt: 30.0,
    maxIscPerMppt: 45.0,
    ratedAcCurrent: 180.4,
    maxAcCurrent: 198.5,
    acVoltage: 400,
    phase: "3PH",
    frequencyHz: 60,
    efficiencyPercent: 98.8,
    ipRating: "IP66",
  },
  {
    id: "sungrow-sh10rt-hybrid",
    manufacturer: "Sungrow",
    model: "SH10RT 3-Phase Hybrid (3PH 400V)",
    ratedAcPowerKw: 10.0,
    maxDcInputPowerKw: 15.0,
    maxDcVoltage: 1000,
    mpptVoltageRangeMin: 200,
    mpptVoltageRangeMax: 950,
    numMppts: 2,
    maxInputCurrentPerMppt: 12.5,
    maxIscPerMppt: 16.0,
    ratedAcCurrent: 14.5,
    maxAcCurrent: 16.5,
    acVoltage: 400,
    phase: "3PH",
    frequencyHz: 60,
    efficiencyPercent: 98.4,
    ipRating: "IP65",
  },
  {
    id: "sungrow-sh25t-hybrid",
    manufacturer: "Sungrow",
    model: "SH25T Commercial Hybrid (3PH 400V)",
    ratedAcPowerKw: 25.0,
    maxDcInputPowerKw: 37.5,
    maxDcVoltage: 1000,
    mpptVoltageRangeMin: 200,
    mpptVoltageRangeMax: 950,
    numMppts: 3,
    maxInputCurrentPerMppt: 30.0,
    maxIscPerMppt: 45.0,
    ratedAcCurrent: 36.3,
    maxAcCurrent: 39.9,
    acVoltage: 400,
    phase: "3PH",
    frequencyHz: 60,
    efficiencyPercent: 98.5,
    ipRating: "IP65",
  },
  // Philippine 230V 3-Phase Delta Specific Model
  {
    id: "sungrow-sg33cx-230v-delta",
    manufacturer: "Sungrow",
    model: "SG33CX-230V (3PH 230V Delta Philippine Grid)",
    ratedAcPowerKw: 33.0,
    maxDcInputPowerKw: 50.0,
    maxDcVoltage: 1100,
    mpptVoltageRangeMin: 200,
    mpptVoltageRangeMax: 1000,
    numMppts: 3,
    maxInputCurrentPerMppt: 26.0,
    maxIscPerMppt: 40.0,
    ratedAcCurrent: 82.8,
    maxAcCurrent: 91.1,
    acVoltage: 230,
    phase: "3PH",
    frequencyHz: 60,
    efficiencyPercent: 98.3,
    ipRating: "IP66",
  },

  // ==================== DEYE ====================
  // Hybrid Single-Phase (48V Low-Voltage Battery)
  {
    id: "deye-sun-3k-sg04",
    manufacturer: "Deye",
    model: "SUN-3K-SG04LP1-EU Hybrid (1PH 230V)",
    ratedAcPowerKw: 3.0,
    maxDcInputPowerKw: 4.5,
    maxDcVoltage: 500,
    mpptVoltageRangeMin: 125,
    mpptVoltageRangeMax: 425,
    numMppts: 1,
    maxInputCurrentPerMppt: 13.0,
    maxIscPerMppt: 17.0,
    ratedAcCurrent: 13.0,
    maxAcCurrent: 15.0,
    acVoltage: 230,
    phase: "1PH",
    frequencyHz: 60,
    efficiencyPercent: 97.6,
    ipRating: "IP65",
  },
  {
    id: "deye-sun-5k-sg01",
    manufacturer: "Deye",
    model: "SUN-5K-SG01LP1-EU Hybrid (1PH 230V)",
    ratedAcPowerKw: 5.0,
    maxDcInputPowerKw: 6.5,
    maxDcVoltage: 500,
    mpptVoltageRangeMin: 125,
    mpptVoltageRangeMax: 425,
    numMppts: 2,
    maxInputCurrentPerMppt: 13.0,
    maxIscPerMppt: 17.0,
    ratedAcCurrent: 21.7,
    maxAcCurrent: 25.0,
    acVoltage: 230,
    phase: "1PH",
    frequencyHz: 60,
    efficiencyPercent: 97.6,
    ipRating: "IP65",
  },
  {
    id: "deye-sun-8k-sg01",
    manufacturer: "Deye",
    model: "SUN-8K-SG01LP1-EU Hybrid (1PH 230V)",
    ratedAcPowerKw: 8.0,
    maxDcInputPowerKw: 10.4,
    maxDcVoltage: 500,
    mpptVoltageRangeMin: 125,
    mpptVoltageRangeMax: 425,
    numMppts: 2,
    maxInputCurrentPerMppt: 22.0,
    maxIscPerMppt: 28.0,
    ratedAcCurrent: 34.8,
    maxAcCurrent: 38.3,
    acVoltage: 230,
    phase: "1PH",
    frequencyHz: 60,
    efficiencyPercent: 97.6,
    ipRating: "IP65",
  },

  // Hybrid Three-Phase (High-Voltage Battery)
  {
    id: "deye-sun-10k-sg04",
    manufacturer: "Deye",
    model: "SUN-10K-SG04LP3-EU Hybrid (3PH 400V)",
    ratedAcPowerKw: 10.0,
    maxDcInputPowerKw: 13.0,
    maxDcVoltage: 800,
    mpptVoltageRangeMin: 200,
    mpptVoltageRangeMax: 650,
    numMppts: 2,
    maxInputCurrentPerMppt: 26.0,
    maxIscPerMppt: 34.0,
    ratedAcCurrent: 14.5,
    maxAcCurrent: 16.7,
    acVoltage: 400,
    phase: "3PH",
    frequencyHz: 60,
    efficiencyPercent: 97.6,
    ipRating: "IP65",
  },
  {
    id: "deye-sun-12k-sg04",
    manufacturer: "Deye",
    model: "SUN-12K-SG04LP3-EU Hybrid (3PH 400V)",
    ratedAcPowerKw: 12.0,
    maxDcInputPowerKw: 15.6,
    maxDcVoltage: 800,
    mpptVoltageRangeMin: 200,
    mpptVoltageRangeMax: 650,
    numMppts: 2,
    maxInputCurrentPerMppt: 26.0,
    maxIscPerMppt: 34.0,
    ratedAcCurrent: 17.4,
    maxAcCurrent: 20.0,
    acVoltage: 400,
    phase: "3PH",
    frequencyHz: 60,
    efficiencyPercent: 97.6,
    ipRating: "IP65",
  },
  {
    id: "deye-sun-20k-sg01hp3",
    manufacturer: "Deye",
    model: "SUN-20K-SG01HP3-EU Hybrid (3PH 400V)",
    ratedAcPowerKw: 20.0,
    maxDcInputPowerKw: 26.0,
    maxDcVoltage: 1000,
    mpptVoltageRangeMin: 200,
    mpptVoltageRangeMax: 850,
    numMppts: 2,
    maxInputCurrentPerMppt: 26.0,
    maxIscPerMppt: 39.0,
    ratedAcCurrent: 29.0,
    maxAcCurrent: 33.3,
    acVoltage: 400,
    phase: "3PH",
    frequencyHz: 60,
    efficiencyPercent: 97.6,
    ipRating: "IP65",
  },
  {
    id: "deye-sun-50k-sg01hp3",
    manufacturer: "Deye",
    model: "SUN-50K-SG01HP3-EU Commercial Hybrid (3PH 400V)",
    ratedAcPowerKw: 50.0,
    maxDcInputPowerKw: 65.0,
    maxDcVoltage: 1000,
    mpptVoltageRangeMin: 200,
    mpptVoltageRangeMax: 850,
    numMppts: 4,
    maxInputCurrentPerMppt: 36.0,
    maxIscPerMppt: 55.0,
    ratedAcCurrent: 72.2,
    maxAcCurrent: 83.3,
    acVoltage: 400,
    phase: "3PH",
    frequencyHz: 60,
    efficiencyPercent: 97.6,
    ipRating: "IP65",
  },

  // Grid-Tied Commercial String
  {
    id: "deye-sun-80k-g03",
    manufacturer: "Deye",
    model: "SUN-80K-G03 Commercial String (3PH 400V)",
    ratedAcPowerKw: 80.0,
    maxDcInputPowerKw: 120.0,
    maxDcVoltage: 1100,
    mpptVoltageRangeMin: 200,
    mpptVoltageRangeMax: 1000,
    numMppts: 4,
    maxInputCurrentPerMppt: 40.0,
    maxIscPerMppt: 60.0,
    ratedAcCurrent: 115.5,
    maxAcCurrent: 127.0,
    acVoltage: 400,
    phase: "3PH",
    frequencyHz: 60,
    efficiencyPercent: 98.7,
    ipRating: "IP65",
  },
  {
    id: "deye-sun-110k-g03",
    manufacturer: "Deye",
    model: "SUN-110K-G03 Commercial String (3PH 400V)",
    ratedAcPowerKw: 110.0,
    maxDcInputPowerKw: 165.0,
    maxDcVoltage: 1100,
    mpptVoltageRangeMin: 200,
    mpptVoltageRangeMax: 1000,
    numMppts: 6,
    maxInputCurrentPerMppt: 40.0,
    maxIscPerMppt: 60.0,
    ratedAcCurrent: 158.8,
    maxAcCurrent: 174.6,
    acVoltage: 400,
    phase: "3PH",
    frequencyHz: 60,
    efficiencyPercent: 98.7,
    ipRating: "IP65",
  },

  // ==================== SMA SOLAR TECHNOLOGY ====================
  {
    id: "sma-sunny-boy-3-0",
    manufacturer: "SMA",
    model: "Sunny Boy 3.0-1AV-41 (1PH 230V)",
    ratedAcPowerKw: 3.0,
    maxDcInputPowerKw: 4.5,
    maxDcVoltage: 600,
    mpptVoltageRangeMin: 110,
    mpptVoltageRangeMax: 500,
    numMppts: 2,
    maxInputCurrentPerMppt: 15.0,
    maxIscPerMppt: 20.0,
    ratedAcCurrent: 13.0,
    maxAcCurrent: 16.0,
    acVoltage: 230,
    phase: "1PH",
    frequencyHz: 60,
    efficiencyPercent: 97.0,
    ipRating: "IP65",
  },
  {
    id: "sma-sunny-boy-5-0",
    manufacturer: "SMA",
    model: "Sunny Boy 5.0-1AV-41 (1PH 230V)",
    ratedAcPowerKw: 5.0,
    maxDcInputPowerKw: 7.5,
    maxDcVoltage: 600,
    mpptVoltageRangeMin: 175,
    mpptVoltageRangeMax: 500,
    numMppts: 2,
    maxInputCurrentPerMppt: 15.0,
    maxIscPerMppt: 20.0,
    ratedAcCurrent: 21.7,
    maxAcCurrent: 22.0,
    acVoltage: 230,
    phase: "1PH",
    frequencyHz: 60,
    efficiencyPercent: 97.0,
    ipRating: "IP65",
  },
  {
    id: "sma-sunny-tripower-10-0",
    manufacturer: "SMA",
    model: "Sunny Tripower 10.0 STP10.0-3AV-40 (3PH 400V)",
    ratedAcPowerKw: 10.0,
    maxDcInputPowerKw: 15.0,
    maxDcVoltage: 1000,
    mpptVoltageRangeMin: 320,
    mpptVoltageRangeMax: 800,
    numMppts: 2,
    maxInputCurrentPerMppt: 20.0,
    maxIscPerMppt: 30.0,
    ratedAcCurrent: 14.5,
    maxAcCurrent: 16.0,
    acVoltage: 400,
    phase: "3PH",
    frequencyHz: 60,
    efficiencyPercent: 98.3,
    ipRating: "IP65",
  },
  {
    id: "sma-sunny-tripower-core1-50",
    manufacturer: "SMA",
    model: "Sunny Tripower CORE1 STP 50-41 (3PH 400V)",
    ratedAcPowerKw: 50.0,
    maxDcInputPowerKw: 75.0,
    maxDcVoltage: 1000,
    mpptVoltageRangeMin: 500,
    mpptVoltageRangeMax: 800,
    numMppts: 6,
    maxInputCurrentPerMppt: 20.0,
    maxIscPerMppt: 30.0,
    ratedAcCurrent: 72.2,
    maxAcCurrent: 72.5,
    acVoltage: 400,
    phase: "3PH",
    frequencyHz: 60,
    efficiencyPercent: 98.1,
    ipRating: "IP65",
  },
  {
    id: "sma-sunny-tripower-core2-110",
    manufacturer: "SMA",
    model: "Sunny Tripower CORE2 STP 110-60 (3PH 400V, 12 MPPTs)",
    ratedAcPowerKw: 110.0,
    maxDcInputPowerKw: 165.0,
    maxDcVoltage: 1100,
    mpptVoltageRangeMin: 500,
    mpptVoltageRangeMax: 980,
    numMppts: 12,
    maxInputCurrentPerMppt: 26.0,
    maxIscPerMppt: 40.0,
    ratedAcCurrent: 158.8,
    maxAcCurrent: 167.0,
    acVoltage: 400,
    phase: "3PH",
    frequencyHz: 60,
    efficiencyPercent: 98.6,
    ipRating: "IP66",
  },

  // ==================== FRONIUS ====================
  {
    id: "fronius-primo-gen24-5-0",
    manufacturer: "Fronius",
    model: "Primo GEN24 5.0 Plus Hybrid (1PH 230V)",
    ratedAcPowerKw: 5.0,
    maxDcInputPowerKw: 7.5,
    maxDcVoltage: 600,
    mpptVoltageRangeMin: 65,
    mpptVoltageRangeMax: 530,
    numMppts: 2,
    maxInputCurrentPerMppt: 22.0,
    maxIscPerMppt: 33.0,
    ratedAcCurrent: 21.7,
    maxAcCurrent: 22.7,
    acVoltage: 230,
    phase: "1PH",
    frequencyHz: 60,
    efficiencyPercent: 97.6,
    ipRating: "IP66",
  },
  {
    id: "fronius-symo-gen24-10-0",
    manufacturer: "Fronius",
    model: "Symo GEN24 10.0 Plus Hybrid (3PH 400V)",
    ratedAcPowerKw: 10.0,
    maxDcInputPowerKw: 15.0,
    maxDcVoltage: 1000,
    mpptVoltageRangeMin: 174,
    mpptVoltageRangeMax: 800,
    numMppts: 2,
    maxInputCurrentPerMppt: 25.0,
    maxIscPerMppt: 37.5,
    ratedAcCurrent: 14.5,
    maxAcCurrent: 16.4,
    acVoltage: 400,
    phase: "3PH",
    frequencyHz: 60,
    efficiencyPercent: 98.2,
    ipRating: "IP66",
  },
  {
    id: "fronius-symo-20-0-3-m",
    manufacturer: "Fronius",
    model: "Symo 20.0-3-M (3PH 400V)",
    ratedAcPowerKw: 20.0,
    maxDcInputPowerKw: 30.0,
    maxDcVoltage: 1000,
    mpptVoltageRangeMin: 420,
    mpptVoltageRangeMax: 800,
    numMppts: 2,
    maxInputCurrentPerMppt: 33.0,
    maxIscPerMppt: 49.5,
    ratedAcCurrent: 28.9,
    maxAcCurrent: 31.9,
    acVoltage: 400,
    phase: "3PH",
    frequencyHz: 60,
    efficiencyPercent: 98.1,
    ipRating: "IP66",
  },
  {
    id: "fronius-tauro-50-3-d",
    manufacturer: "Fronius",
    model: "Tauro 50-3-D Commercial (3PH 400V)",
    ratedAcPowerKw: 50.0,
    maxDcInputPowerKw: 75.0,
    maxDcVoltage: 1000,
    mpptVoltageRangeMin: 400,
    mpptVoltageRangeMax: 870,
    numMppts: 3,
    maxInputCurrentPerMppt: 36.0,
    maxIscPerMppt: 54.0,
    ratedAcCurrent: 72.2,
    maxAcCurrent: 76.0,
    acVoltage: 400,
    phase: "3PH",
    frequencyHz: 60,
    efficiencyPercent: 98.5,
    ipRating: "IP65",
  },
  {
    id: "fronius-tauro-max-100-3-d",
    manufacturer: "Fronius",
    model: "Tauro MAX 100-3-D High-Power C&I (3PH 400V)",
    ratedAcPowerKw: 100.0,
    maxDcInputPowerKw: 150.0,
    maxDcVoltage: 1000,
    mpptVoltageRangeMin: 580,
    mpptVoltageRangeMax: 930,
    numMppts: 3,
    maxInputCurrentPerMppt: 60.0,
    maxIscPerMppt: 90.0,
    ratedAcCurrent: 144.4,
    maxAcCurrent: 152.0,
    acVoltage: 400,
    phase: "3PH",
    frequencyHz: 60,
    efficiencyPercent: 98.6,
    ipRating: "IP65",
  },

  // ==================== GOODWE ====================
  {
    id: "goodwe-dns-gw5000d-ns",
    manufacturer: "GoodWe",
    model: "DNS G3 GW5000D-NS (1PH 230V)",
    ratedAcPowerKw: 5.0,
    maxDcInputPowerKw: 7.5,
    maxDcVoltage: 600,
    mpptVoltageRangeMin: 80,
    mpptVoltageRangeMax: 550,
    numMppts: 2,
    maxInputCurrentPerMppt: 16.0,
    maxIscPerMppt: 22.0,
    ratedAcCurrent: 21.7,
    maxAcCurrent: 22.8,
    acVoltage: 230,
    phase: "1PH",
    frequencyHz: 60,
    efficiencyPercent: 98.4,
    ipRating: "IP65",
  },
  {
    id: "goodwe-sdt-gw10k-dt",
    manufacturer: "GoodWe",
    model: "SDT G2 GW10K-DT (3PH 400V)",
    ratedAcPowerKw: 10.0,
    maxDcInputPowerKw: 15.0,
    maxDcVoltage: 1000,
    mpptVoltageRangeMin: 180,
    mpptVoltageRangeMax: 850,
    numMppts: 2,
    maxInputCurrentPerMppt: 16.0,
    maxIscPerMppt: 22.0,
    ratedAcCurrent: 14.5,
    maxAcCurrent: 16.5,
    acVoltage: 400,
    phase: "3PH",
    frequencyHz: 60,
    efficiencyPercent: 98.3,
    ipRating: "IP65",
  },
  {
    id: "goodwe-smt-gw36k-mt",
    manufacturer: "GoodWe",
    model: "SMT Series GW36K-MT (3PH 400V)",
    ratedAcPowerKw: 36.0,
    maxDcInputPowerKw: 54.0,
    maxDcVoltage: 1100,
    mpptVoltageRangeMin: 200,
    mpptVoltageRangeMax: 950,
    numMppts: 3,
    maxInputCurrentPerMppt: 32.0,
    maxIscPerMppt: 44.0,
    ratedAcCurrent: 52.0,
    maxAcCurrent: 57.0,
    acVoltage: 400,
    phase: "3PH",
    frequencyHz: 60,
    efficiencyPercent: 98.7,
    ipRating: "IP65",
  },
  {
    id: "goodwe-smt-gw50kn-mt",
    manufacturer: "GoodWe",
    model: "SMT Series GW50KN-MT (3PH 400V)",
    ratedAcPowerKw: 50.0,
    maxDcInputPowerKw: 75.0,
    maxDcVoltage: 1100,
    mpptVoltageRangeMin: 200,
    mpptVoltageRangeMax: 950,
    numMppts: 5,
    maxInputCurrentPerMppt: 30.0,
    maxIscPerMppt: 42.0,
    ratedAcCurrent: 72.2,
    maxAcCurrent: 80.0,
    acVoltage: 400,
    phase: "3PH",
    frequencyHz: 60,
    efficiencyPercent: 98.7,
    ipRating: "IP65",
  },
  {
    id: "goodwe-ht-gw100k-ht",
    manufacturer: "GoodWe",
    model: "HT Series GW100K-HT (3PH 400V, 10 MPPTs)",
    ratedAcPowerKw: 100.0,
    maxDcInputPowerKw: 150.0,
    maxDcVoltage: 1100,
    mpptVoltageRangeMin: 200,
    mpptVoltageRangeMax: 1000,
    numMppts: 10,
    maxInputCurrentPerMppt: 30.0,
    maxIscPerMppt: 42.0,
    ratedAcCurrent: 144.4,
    maxAcCurrent: 160.0,
    acVoltage: 400,
    phase: "3PH",
    frequencyHz: 60,
    efficiencyPercent: 98.6,
    ipRating: "IP66",
  },
  {
    id: "goodwe-ht-gw120k-ht",
    manufacturer: "GoodWe",
    model: "HT Series GW120K-HT (3PH 400V, 12 MPPTs)",
    ratedAcPowerKw: 120.0,
    maxDcInputPowerKw: 180.0,
    maxDcVoltage: 1100,
    mpptVoltageRangeMin: 200,
    mpptVoltageRangeMax: 1000,
    numMppts: 12,
    maxInputCurrentPerMppt: 30.0,
    maxIscPerMppt: 42.0,
    ratedAcCurrent: 173.2,
    maxAcCurrent: 191.0,
    acVoltage: 400,
    phase: "3PH",
    frequencyHz: 60,
    efficiencyPercent: 98.6,
    ipRating: "IP66",
  },
  {
    id: "goodwe-es-gw5048d-es-hybrid",
    manufacturer: "GoodWe",
    model: "ES G2 GW5048D-ES Hybrid (1PH 230V)",
    ratedAcPowerKw: 5.0,
    maxDcInputPowerKw: 7.0,
    maxDcVoltage: 600,
    mpptVoltageRangeMin: 90,
    mpptVoltageRangeMax: 520,
    numMppts: 2,
    maxInputCurrentPerMppt: 16.0,
    maxIscPerMppt: 22.0,
    ratedAcCurrent: 21.7,
    maxAcCurrent: 22.8,
    acVoltage: 230,
    phase: "1PH",
    frequencyHz: 60,
    efficiencyPercent: 97.6,
    ipRating: "IP65",
  },
  // Philippine 230V 3-Phase Delta Model
  {
    id: "goodwe-gw30k-mt-230v-delta",
    manufacturer: "GoodWe",
    model: "GW30K-MT-230V (3PH 230V Delta Philippine Grid)",
    ratedAcPowerKw: 30.0,
    maxDcInputPowerKw: 45.0,
    maxDcVoltage: 1100,
    mpptVoltageRangeMin: 200,
    mpptVoltageRangeMax: 950,
    numMppts: 3,
    maxInputCurrentPerMppt: 32.0,
    maxIscPerMppt: 44.0,
    ratedAcCurrent: 75.3,
    maxAcCurrent: 82.8,
    acVoltage: 230,
    phase: "3PH",
    frequencyHz: 60,
    efficiencyPercent: 98.4,
    ipRating: "IP65",
  },

  // ==================== SOLIS (GINLONG) ====================
  {
    id: "solis-s5-gr1p5k",
    manufacturer: "Solis",
    model: "S5-GR1P5K (1PH 230V)",
    ratedAcPowerKw: 5.0,
    maxDcInputPowerKw: 7.5,
    maxDcVoltage: 600,
    mpptVoltageRangeMin: 90,
    mpptVoltageRangeMax: 520,
    numMppts: 2,
    maxInputCurrentPerMppt: 14.0,
    maxIscPerMppt: 22.0,
    ratedAcCurrent: 21.7,
    maxAcCurrent: 25.0,
    acVoltage: 230,
    phase: "1PH",
    frequencyHz: 60,
    efficiencyPercent: 97.7,
    ipRating: "IP65",
  },
  {
    id: "solis-s5-gr3p10k",
    manufacturer: "Solis",
    model: "S5-GR3P10K (3PH 400V)",
    ratedAcPowerKw: 10.0,
    maxDcInputPowerKw: 15.0,
    maxDcVoltage: 1100,
    mpptVoltageRangeMin: 180,
    mpptVoltageRangeMax: 1000,
    numMppts: 2,
    maxInputCurrentPerMppt: 16.0,
    maxIscPerMppt: 24.0,
    ratedAcCurrent: 14.5,
    maxAcCurrent: 16.7,
    acVoltage: 400,
    phase: "3PH",
    frequencyHz: 60,
    efficiencyPercent: 98.5,
    ipRating: "IP66",
  },
  {
    id: "solis-s5-gc30k",
    manufacturer: "Solis",
    model: "S5-GC30K Commercial (3PH 400V)",
    ratedAcPowerKw: 30.0,
    maxDcInputPowerKw: 45.0,
    maxDcVoltage: 1100,
    mpptVoltageRangeMin: 200,
    mpptVoltageRangeMax: 1000,
    numMppts: 3,
    maxInputCurrentPerMppt: 32.0,
    maxIscPerMppt: 48.0,
    ratedAcCurrent: 43.3,
    maxAcCurrent: 47.9,
    acVoltage: 400,
    phase: "3PH",
    frequencyHz: 60,
    efficiencyPercent: 98.7,
    ipRating: "IP66",
  },
  {
    id: "solis-s5-gc50k",
    manufacturer: "Solis",
    model: "S5-GC50K Commercial (3PH 400V)",
    ratedAcPowerKw: 50.0,
    maxDcInputPowerKw: 75.0,
    maxDcVoltage: 1100,
    mpptVoltageRangeMin: 200,
    mpptVoltageRangeMax: 1000,
    numMppts: 5,
    maxInputCurrentPerMppt: 32.0,
    maxIscPerMppt: 48.0,
    ratedAcCurrent: 72.2,
    maxAcCurrent: 79.8,
    acVoltage: 400,
    phase: "3PH",
    frequencyHz: 60,
    efficiencyPercent: 98.7,
    ipRating: "IP66",
  },
  {
    id: "solis-s5-gc110k",
    manufacturer: "Solis",
    model: "S5-GC110K Multi-MPPT (3PH 400V, 10 MPPTs)",
    ratedAcPowerKw: 110.0,
    maxDcInputPowerKw: 165.0,
    maxDcVoltage: 1100,
    mpptVoltageRangeMin: 200,
    mpptVoltageRangeMax: 1000,
    numMppts: 10,
    maxInputCurrentPerMppt: 32.0,
    maxIscPerMppt: 48.0,
    ratedAcCurrent: 158.8,
    maxAcCurrent: 175.0,
    acVoltage: 400,
    phase: "3PH",
    frequencyHz: 60,
    efficiencyPercent: 98.7,
    ipRating: "IP66",
  },
  {
    id: "solis-s6-eh1p5k-hybrid",
    manufacturer: "Solis",
    model: "S6-EH1P5K-L-PRO Hybrid (1PH 230V)",
    ratedAcPowerKw: 5.0,
    maxDcInputPowerKw: 8.0,
    maxDcVoltage: 600,
    mpptVoltageRangeMin: 90,
    mpptVoltageRangeMax: 520,
    numMppts: 2,
    maxInputCurrentPerMppt: 16.0,
    maxIscPerMppt: 24.0,
    ratedAcCurrent: 21.7,
    maxAcCurrent: 23.0,
    acVoltage: 230,
    phase: "1PH",
    frequencyHz: 60,
    efficiencyPercent: 97.5,
    ipRating: "IP66",
  },
  // Philippine 230V 3-Phase Delta Model
  {
    id: "solis-3p25k-lv-230v-delta",
    manufacturer: "Solis",
    model: "S5-GC25K-LV-230V (3PH 230V Delta Philippine Grid)",
    ratedAcPowerKw: 25.0,
    maxDcInputPowerKw: 37.5,
    maxDcVoltage: 1100,
    mpptVoltageRangeMin: 200,
    mpptVoltageRangeMax: 1000,
    numMppts: 3,
    maxInputCurrentPerMppt: 32.0,
    maxIscPerMppt: 48.0,
    ratedAcCurrent: 62.8,
    maxAcCurrent: 69.1,
    acVoltage: 230,
    phase: "3PH",
    frequencyHz: 60,
    efficiencyPercent: 98.3,
    ipRating: "IP66",
  },

  // ==================== GROWATT ====================
  {
    id: "growatt-min-5000tl-x",
    manufacturer: "Growatt",
    model: "MIN 5000TL-X (1PH 230V)",
    ratedAcPowerKw: 5.0,
    maxDcInputPowerKw: 7.0,
    maxDcVoltage: 550,
    mpptVoltageRangeMin: 80,
    mpptVoltageRangeMax: 500,
    numMppts: 2,
    maxInputCurrentPerMppt: 13.5,
    maxIscPerMppt: 16.9,
    ratedAcCurrent: 21.7,
    maxAcCurrent: 22.7,
    acVoltage: 230,
    phase: "1PH",
    frequencyHz: 60,
    efficiencyPercent: 98.4,
    ipRating: "IP65",
  },
  {
    id: "growatt-mod-10ktl3-x",
    manufacturer: "Growatt",
    model: "MOD 10KTL3-X (3PH 400V)",
    ratedAcPowerKw: 10.0,
    maxDcInputPowerKw: 15.0,
    maxDcVoltage: 1100,
    mpptVoltageRangeMin: 140,
    mpptVoltageRangeMax: 1000,
    numMppts: 2,
    maxInputCurrentPerMppt: 13.0,
    maxIscPerMppt: 16.0,
    ratedAcCurrent: 14.5,
    maxAcCurrent: 16.7,
    acVoltage: 400,
    phase: "3PH",
    frequencyHz: 60,
    efficiencyPercent: 98.6,
    ipRating: "IP66",
  },
  {
    id: "growatt-mid-20ktl3-x",
    manufacturer: "Growatt",
    model: "MID 20KTL3-X (3PH 400V)",
    ratedAcPowerKw: 20.0,
    maxDcInputPowerKw: 30.0,
    maxDcVoltage: 1100,
    mpptVoltageRangeMin: 200,
    mpptVoltageRangeMax: 1000,
    numMppts: 2,
    maxInputCurrentPerMppt: 26.0,
    maxIscPerMppt: 32.0,
    ratedAcCurrent: 28.9,
    maxAcCurrent: 31.9,
    acVoltage: 400,
    phase: "3PH",
    frequencyHz: 60,
    efficiencyPercent: 98.7,
    ipRating: "IP66",
  },
  {
    id: "growatt-mid-33ktl3-x",
    manufacturer: "Growatt",
    model: "MID 33KTL3-X (3PH 400V)",
    ratedAcPowerKw: 33.0,
    maxDcInputPowerKw: 49.5,
    maxDcVoltage: 1100,
    mpptVoltageRangeMin: 200,
    mpptVoltageRangeMax: 1000,
    numMppts: 3,
    maxInputCurrentPerMppt: 26.0,
    maxIscPerMppt: 32.0,
    ratedAcCurrent: 47.6,
    maxAcCurrent: 50.0,
    acVoltage: 400,
    phase: "3PH",
    frequencyHz: 60,
    efficiencyPercent: 98.7,
    ipRating: "IP66",
  },
  {
    id: "growatt-max-50ktl3-x-lv",
    manufacturer: "Growatt",
    model: "MAX 50KTL3-X LV Commercial (3PH 400V)",
    ratedAcPowerKw: 50.0,
    maxDcInputPowerKw: 75.0,
    maxDcVoltage: 1100,
    mpptVoltageRangeMin: 200,
    mpptVoltageRangeMax: 1000,
    numMppts: 5,
    maxInputCurrentPerMppt: 32.0,
    maxIscPerMppt: 40.0,
    ratedAcCurrent: 72.2,
    maxAcCurrent: 80.5,
    acVoltage: 400,
    phase: "3PH",
    frequencyHz: 60,
    efficiencyPercent: 98.7,
    ipRating: "IP66",
  },
  {
    id: "growatt-max-100ktl3-x-lv",
    manufacturer: "Growatt",
    model: "MAX 100KTL3-X LV (3PH 400V, 10 MPPTs)",
    ratedAcPowerKw: 100.0,
    maxDcInputPowerKw: 150.0,
    maxDcVoltage: 1100,
    mpptVoltageRangeMin: 200,
    mpptVoltageRangeMax: 1000,
    numMppts: 10,
    maxInputCurrentPerMppt: 32.0,
    maxIscPerMppt: 40.0,
    ratedAcCurrent: 144.4,
    maxAcCurrent: 161.0,
    acVoltage: 400,
    phase: "3PH",
    frequencyHz: 60,
    efficiencyPercent: 98.8,
    ipRating: "IP66",
  },
  {
    id: "growatt-max-125ktl3-x-lv",
    manufacturer: "Growatt",
    model: "MAX 125KTL3-X LV (3PH 400V, 10 MPPTs)",
    ratedAcPowerKw: 125.0,
    maxDcInputPowerKw: 187.5,
    maxDcVoltage: 1100,
    mpptVoltageRangeMin: 200,
    mpptVoltageRangeMax: 1000,
    numMppts: 10,
    maxInputCurrentPerMppt: 32.0,
    maxIscPerMppt: 40.0,
    ratedAcCurrent: 180.4,
    maxAcCurrent: 200.0,
    acVoltage: 400,
    phase: "3PH",
    frequencyHz: 60,
    efficiencyPercent: 98.8,
    ipRating: "IP66",
  },
  {
    id: "growatt-sph5000-hybrid",
    manufacturer: "Growatt",
    model: "SPH5000 Storage Hybrid (1PH 230V)",
    ratedAcPowerKw: 5.0,
    maxDcInputPowerKw: 7.5,
    maxDcVoltage: 550,
    mpptVoltageRangeMin: 120,
    mpptVoltageRangeMax: 550,
    numMppts: 2,
    maxInputCurrentPerMppt: 13.5,
    maxIscPerMppt: 16.9,
    ratedAcCurrent: 21.7,
    maxAcCurrent: 22.7,
    acVoltage: 230,
    phase: "1PH",
    frequencyHz: 60,
    efficiencyPercent: 97.7,
    ipRating: "IP65",
  },

  // ==================== ENPHASE MICROINVERTERS ====================
  {
    id: "enphase-iq8-plus",
    manufacturer: "Enphase",
    model: "IQ8+ Microinverter (1PH 230V)",
    ratedAcPowerKw: 0.30,
    maxDcInputPowerKw: 0.44,
    maxDcVoltage: 60,
    mpptVoltageRangeMin: 27,
    mpptVoltageRangeMax: 45,
    numMppts: 1,
    maxInputCurrentPerMppt: 12.0,
    maxIscPerMppt: 15.0,
    ratedAcCurrent: 1.30,
    maxAcCurrent: 1.35,
    acVoltage: 230,
    phase: "1PH",
    frequencyHz: 60,
    efficiencyPercent: 97.3,
    ipRating: "IP67",
  },
  {
    id: "enphase-iq8-m",
    manufacturer: "Enphase",
    model: "IQ8M Microinverter (1PH 230V)",
    ratedAcPowerKw: 0.33,
    maxDcInputPowerKw: 0.48,
    maxDcVoltage: 60,
    mpptVoltageRangeMin: 28,
    mpptVoltageRangeMax: 45,
    numMppts: 1,
    maxInputCurrentPerMppt: 12.0,
    maxIscPerMppt: 15.0,
    ratedAcCurrent: 1.43,
    maxAcCurrent: 1.48,
    acVoltage: 230,
    phase: "1PH",
    frequencyHz: 60,
    efficiencyPercent: 97.4,
    ipRating: "IP67",
  },
  {
    id: "enphase-iq8-a",
    manufacturer: "Enphase",
    model: "IQ8A Microinverter (1PH 230V)",
    ratedAcPowerKw: 0.366,
    maxDcInputPowerKw: 0.54,
    maxDcVoltage: 60,
    mpptVoltageRangeMin: 30,
    mpptVoltageRangeMax: 45,
    numMppts: 1,
    maxInputCurrentPerMppt: 14.0,
    maxIscPerMppt: 18.0,
    ratedAcCurrent: 1.59,
    maxAcCurrent: 1.65,
    acVoltage: 230,
    phase: "1PH",
    frequencyHz: 60,
    efficiencyPercent: 97.5,
    ipRating: "IP67",
  },
  {
    id: "enphase-iq8-h",
    manufacturer: "Enphase",
    model: "IQ8H Microinverter (1PH 230V)",
    ratedAcPowerKw: 0.384,
    maxDcInputPowerKw: 0.55,
    maxDcVoltage: 60,
    mpptVoltageRangeMin: 32,
    mpptVoltageRangeMax: 45,
    numMppts: 1,
    maxInputCurrentPerMppt: 14.0,
    maxIscPerMppt: 18.0,
    ratedAcCurrent: 1.67,
    maxAcCurrent: 1.74,
    acVoltage: 230,
    phase: "1PH",
    frequencyHz: 60,
    efficiencyPercent: 97.5,
    ipRating: "IP67",
  },

  // ==================== SOLAREDGE ====================
  {
    id: "solaredge-se5000h",
    manufacturer: "SolarEdge",
    model: "HD-Wave SE5000H (1PH 230V)",
    ratedAcPowerKw: 5.0,
    maxDcInputPowerKw: 7.75,
    maxDcVoltage: 480,
    mpptVoltageRangeMin: 380,
    mpptVoltageRangeMax: 480,
    numMppts: 1,
    maxInputCurrentPerMppt: 13.5,
    maxIscPerMppt: 16.5,
    ratedAcCurrent: 21.7,
    maxAcCurrent: 23.0,
    acVoltage: 230,
    phase: "1PH",
    frequencyHz: 60,
    efficiencyPercent: 99.2,
    ipRating: "IP65",
  },
  {
    id: "solaredge-se10k",
    manufacturer: "SolarEdge",
    model: "SE10K Three Phase (3PH 400V)",
    ratedAcPowerKw: 10.0,
    maxDcInputPowerKw: 15.0,
    maxDcVoltage: 900,
    mpptVoltageRangeMin: 750,
    mpptVoltageRangeMax: 900,
    numMppts: 2,
    maxInputCurrentPerMppt: 14.5,
    maxIscPerMppt: 18.5,
    ratedAcCurrent: 14.5,
    maxAcCurrent: 16.0,
    acVoltage: 400,
    phase: "3PH",
    frequencyHz: 60,
    efficiencyPercent: 98.3,
    ipRating: "IP65",
  },
  {
    id: "solaredge-se33-3k",
    manufacturer: "SolarEdge",
    model: "SE33.3K Three Phase (3PH 400V)",
    ratedAcPowerKw: 33.3,
    maxDcInputPowerKw: 50.0,
    maxDcVoltage: 1000,
    mpptVoltageRangeMin: 750,
    mpptVoltageRangeMax: 1000,
    numMppts: 3,
    maxInputCurrentPerMppt: 40.0,
    maxIscPerMppt: 50.0,
    ratedAcCurrent: 48.3,
    maxAcCurrent: 50.5,
    acVoltage: 400,
    phase: "3PH",
    frequencyHz: 60,
    efficiencyPercent: 98.3,
    ipRating: "IP65",
  },
  {
    id: "solaredge-se100k",
    manufacturer: "SolarEdge",
    model: "SE100K Synergy Three Phase (3PH 400V)",
    ratedAcPowerKw: 100.0,
    maxDcInputPowerKw: 150.0,
    maxDcVoltage: 1000,
    mpptVoltageRangeMin: 750,
    mpptVoltageRangeMax: 1000,
    numMppts: 3,
    maxInputCurrentPerMppt: 120.0,
    maxIscPerMppt: 150.0,
    ratedAcCurrent: 144.4,
    maxAcCurrent: 152.0,
    acVoltage: 400,
    phase: "3PH",
    frequencyHz: 60,
    efficiencyPercent: 98.3,
    ipRating: "IP65",
  },
];

// ==========================================
// 3. STANDARD BATTERY LIBRARY
// ==========================================
export const DEFAULT_BATTERIES: SolarBattery[] = [
  // ==================== PYLONTECH ====================
  {
    id: "pylontech-us5000",
    manufacturer: "Pylontech",
    model: "US5000 Lithium Iron Phosphate (LFP)",
    voltageV: 48,
    capacityAh: 100,
    energyKwh: 4.8,
    dodPercent: 95,
    efficiencyPercent: 95,
    chemistry: "LiFePO4",
    voltageType: "low_voltage",
    formFactor: "rack_mount",
    maxDischargeCurrentA: 100,
    cycleLife: 6000,
  },
  {
    id: "pylontech-us3000c",
    manufacturer: "Pylontech",
    model: "US3000C LiFePO4 Module",
    voltageV: 48,
    capacityAh: 74,
    energyKwh: 3.55,
    dodPercent: 95,
    efficiencyPercent: 95,
    chemistry: "LiFePO4",
    voltageType: "low_voltage",
    formFactor: "rack_mount",
    maxDischargeCurrentA: 74,
    cycleLife: 6000,
  },
  {
    id: "pylontech-us2000c",
    manufacturer: "Pylontech",
    model: "US2000C LiFePO4 Module",
    voltageV: 48,
    capacityAh: 50,
    energyKwh: 2.4,
    dodPercent: 95,
    efficiencyPercent: 95,
    chemistry: "LiFePO4",
    voltageType: "low_voltage",
    formFactor: "rack_mount",
    maxDischargeCurrentA: 50,
    cycleLife: 6000,
  },
  {
    id: "pylontech-up5000",
    manufacturer: "Pylontech",
    model: "UP5000 4.8kWh Telecommunications & Energy Storage",
    voltageV: 48,
    capacityAh: 100,
    energyKwh: 4.8,
    dodPercent: 95,
    efficiencyPercent: 95,
    chemistry: "LiFePO4",
    voltageType: "low_voltage",
    formFactor: "rack_mount",
    maxDischargeCurrentA: 100,
    cycleLife: 4500,
  },
  {
    id: "pylontech-force-l2",
    manufacturer: "Pylontech",
    model: "Force-L2 Modular Low Voltage System (7.1 kWh)",
    voltageV: 48,
    capacityAh: 148,
    energyKwh: 7.1,
    dodPercent: 90,
    efficiencyPercent: 95,
    chemistry: "LiFePO4",
    voltageType: "low_voltage",
    formFactor: "stackable",
    maxDischargeCurrentA: 100,
    cycleLife: 6000,
  },
  {
    id: "pylontech-force-h2",
    manufacturer: "Pylontech",
    model: "Force-H2 High Voltage ESS (7.1 kWh)",
    voltageV: 192,
    capacityAh: 37,
    energyKwh: 7.1,
    dodPercent: 95,
    efficiencyPercent: 96,
    chemistry: "LiFePO4",
    voltageType: "high_voltage",
    formFactor: "stackable",
    maxDischargeCurrentA: 40,
    cycleLife: 6000,
  },
  {
    id: "pylontech-force-h1",
    manufacturer: "Pylontech",
    model: "Force-H1 High Voltage ESS (10.65 kWh)",
    voltageV: 288,
    capacityAh: 37,
    energyKwh: 10.65,
    dodPercent: 95,
    efficiencyPercent: 96,
    chemistry: "LiFePO4",
    voltageType: "high_voltage",
    formFactor: "stackable",
    maxDischargeCurrentA: 40,
    cycleLife: 6000,
  },
  {
    id: "pylontech-powercube-x1",
    manufacturer: "Pylontech",
    model: "Powercube-X1 Commercial HV ESS (14.2 kWh)",
    voltageV: 288,
    capacityAh: 50,
    energyKwh: 14.2,
    dodPercent: 90,
    efficiencyPercent: 96,
    chemistry: "LiFePO4",
    voltageType: "high_voltage",
    formFactor: "rack_mount",
    maxDischargeCurrentA: 50,
    cycleLife: 6000,
  },
  {
    id: "pylontech-powercube-h2",
    manufacturer: "Pylontech",
    model: "Powercube-H2 High Voltage ESS Rack (21.3 kWh)",
    voltageV: 432,
    capacityAh: 50,
    energyKwh: 21.3,
    dodPercent: 90,
    efficiencyPercent: 96,
    chemistry: "LiFePO4",
    voltageType: "high_voltage",
    formFactor: "rack_mount",
    maxDischargeCurrentA: 50,
    cycleLife: 6000,
  },

  // ==================== HUAWEI ====================
  {
    id: "huawei-luna2000-5-e0",
    manufacturer: "Huawei",
    model: "LUNA2000-5-E0 Smart String Battery",
    voltageV: 360,
    capacityAh: 13.8,
    energyKwh: 5.0,
    dodPercent: 100,
    efficiencyPercent: 97,
    chemistry: "LiFePO4",
    voltageType: "high_voltage",
    formFactor: "stackable",
    maxDischargeCurrentA: 15,
    cycleLife: 6000,
  },
  {
    id: "huawei-luna2000-10-s0",
    manufacturer: "Huawei",
    model: "LUNA2000-10-S0 (10 kWh System)",
    voltageV: 360,
    capacityAh: 27.8,
    energyKwh: 10.0,
    dodPercent: 100,
    efficiencyPercent: 97,
    chemistry: "LiFePO4",
    voltageType: "high_voltage",
    formFactor: "stackable",
    maxDischargeCurrentA: 25,
    cycleLife: 6000,
  },
  {
    id: "huawei-luna2000-15-s0",
    manufacturer: "Huawei",
    model: "LUNA2000-15-S0 (15 kWh System)",
    voltageV: 360,
    capacityAh: 41.7,
    energyKwh: 15.0,
    dodPercent: 100,
    efficiencyPercent: 97,
    chemistry: "LiFePO4",
    voltageType: "high_voltage",
    formFactor: "stackable",
    maxDischargeCurrentA: 30,
    cycleLife: 6000,
  },
  {
    id: "huawei-luna2000-7-e1",
    manufacturer: "Huawei",
    model: "LUNA2000-7-E1 Smart String ESS Module (6.9 kWh)",
    voltageV: 600,
    capacityAh: 11.5,
    energyKwh: 6.9,
    dodPercent: 100,
    efficiencyPercent: 98,
    chemistry: "LiFePO4",
    voltageType: "high_voltage",
    formFactor: "stackable",
    maxDischargeCurrentA: 17,
    cycleLife: 8000,
  },
  {
    id: "huawei-luna2000-14-s1",
    manufacturer: "Huawei",
    model: "LUNA2000-14-S1 Smart String ESS (13.8 kWh)",
    voltageV: 600,
    capacityAh: 23.0,
    energyKwh: 13.8,
    dodPercent: 100,
    efficiencyPercent: 98,
    chemistry: "LiFePO4",
    voltageType: "high_voltage",
    formFactor: "stackable",
    maxDischargeCurrentA: 34,
    cycleLife: 8000,
  },
  {
    id: "huawei-luna2000-21-s1",
    manufacturer: "Huawei",
    model: "LUNA2000-21-S1 Smart String ESS (20.7 kWh)",
    voltageV: 600,
    capacityAh: 34.5,
    energyKwh: 20.7,
    dodPercent: 100,
    efficiencyPercent: 98,
    chemistry: "LiFePO4",
    voltageType: "high_voltage",
    formFactor: "stackable",
    maxDischargeCurrentA: 50,
    cycleLife: 8000,
  },
  {
    id: "huawei-luna2000-200kwh",
    manufacturer: "Huawei",
    model: "LUNA2000-200KWH-2H1 Smart String C&I ESS (200 kWh)",
    voltageV: 800,
    capacityAh: 250,
    energyKwh: 200.0,
    dodPercent: 100,
    efficiencyPercent: 98.5,
    chemistry: "LiFePO4",
    voltageType: "commercial_bess",
    formFactor: "containerized",
    maxDischargeCurrentA: 250,
    cycleLife: 8000,
  },

  // ==================== DEYE ====================
  {
    id: "deye-bos-g-module",
    manufacturer: "Deye",
    model: "BOS-G High Voltage LiFePO4",
    voltageV: 51.2,
    capacityAh: 100,
    energyKwh: 5.12,
    dodPercent: 90,
    efficiencyPercent: 95,
    chemistry: "LiFePO4",
    voltageType: "high_voltage",
    formFactor: "rack_mount",
    maxDischargeCurrentA: 100,
    cycleLife: 6000,
  },
  {
    id: "deye-rw-m6.1",
    manufacturer: "Deye",
    model: "RW-M6.1 Wall-Mounted LiFePO4 (6.14 kWh)",
    voltageV: 51.2,
    capacityAh: 120,
    energyKwh: 6.14,
    dodPercent: 90,
    efficiencyPercent: 95,
    chemistry: "LiFePO4",
    voltageType: "low_voltage",
    formFactor: "wall_mount",
    maxDischargeCurrentA: 100,
    cycleLife: 6000,
  },
  {
    id: "deye-se-g5.1-pro",
    manufacturer: "Deye",
    model: "SE-G5.1 Pro 19-inch Rack-Mount (5.12 kWh)",
    voltageV: 51.2,
    capacityAh: 100,
    energyKwh: 5.12,
    dodPercent: 90,
    efficiencyPercent: 95,
    chemistry: "LiFePO4",
    voltageType: "low_voltage",
    formFactor: "rack_mount",
    maxDischargeCurrentA: 100,
    cycleLife: 6000,
  },
  {
    id: "deye-bos-g-40kwh",
    manufacturer: "Deye",
    model: "BOS-G High Voltage Battery Rack (40.96 kWh)",
    voltageV: 409.6,
    capacityAh: 100,
    energyKwh: 40.96,
    dodPercent: 90,
    efficiencyPercent: 96,
    chemistry: "LiFePO4",
    voltageType: "high_voltage",
    formFactor: "rack_mount",
    maxDischargeCurrentA: 100,
    cycleLife: 6000,
  },
  {
    id: "deye-bos-g-61kwh",
    manufacturer: "Deye",
    model: "BOS-G High Voltage Battery Rack (61.44 kWh)",
    voltageV: 614.4,
    capacityAh: 100,
    energyKwh: 61.44,
    dodPercent: 90,
    efficiencyPercent: 96,
    chemistry: "LiFePO4",
    voltageType: "high_voltage",
    formFactor: "rack_mount",
    maxDischargeCurrentA: 100,
    cycleLife: 6000,
  },
  {
    id: "deye-gb-s-8kwh",
    manufacturer: "Deye",
    model: "GB-S All-In-One High Voltage ESS (8.18 kWh)",
    voltageV: 160,
    capacityAh: 51,
    energyKwh: 8.18,
    dodPercent: 90,
    efficiencyPercent: 96,
    chemistry: "LiFePO4",
    voltageType: "high_voltage",
    formFactor: "all_in_one",
    maxDischargeCurrentA: 40,
    cycleLife: 6000,
  },
  {
    id: "deye-bos-gm-100kwh",
    manufacturer: "Deye",
    model: "BOS-GM C&I Commercial BESS (100 kWh)",
    voltageV: 512,
    capacityAh: 200,
    energyKwh: 102.4,
    dodPercent: 90,
    efficiencyPercent: 96.5,
    chemistry: "LiFePO4",
    voltageType: "commercial_bess",
    formFactor: "containerized",
    maxDischargeCurrentA: 200,
    cycleLife: 6000,
  },

  // ==================== BYD ====================
  {
    id: "byd-lvs-4.0",
    manufacturer: "BYD",
    model: "Battery-Box Premium LVS 4.0",
    voltageV: 51.2,
    capacityAh: 78,
    energyKwh: 4.0,
    dodPercent: 90,
    efficiencyPercent: 95,
    chemistry: "LiFePO4",
    voltageType: "low_voltage",
    formFactor: "stackable",
    maxDischargeCurrentA: 65,
    cycleLife: 6000,
  },
  {
    id: "byd-lvs-8.0",
    manufacturer: "BYD",
    model: "Battery-Box Premium LVS 8.0",
    voltageV: 51.2,
    capacityAh: 156,
    energyKwh: 8.0,
    dodPercent: 90,
    efficiencyPercent: 95,
    chemistry: "LiFePO4",
    voltageType: "low_voltage",
    formFactor: "stackable",
    maxDischargeCurrentA: 130,
    cycleLife: 6000,
  },
  {
    id: "byd-lvs-12.0",
    manufacturer: "BYD",
    model: "Battery-Box Premium LVS 12.0",
    voltageV: 51.2,
    capacityAh: 234,
    energyKwh: 12.0,
    dodPercent: 90,
    efficiencyPercent: 95,
    chemistry: "LiFePO4",
    voltageType: "low_voltage",
    formFactor: "stackable",
    maxDischargeCurrentA: 195,
    cycleLife: 6000,
  },
  {
    id: "byd-lvs-16.0",
    manufacturer: "BYD",
    model: "Battery-Box Premium LVS 16.0",
    voltageV: 51.2,
    capacityAh: 312,
    energyKwh: 16.0,
    dodPercent: 90,
    efficiencyPercent: 95,
    chemistry: "LiFePO4",
    voltageType: "low_voltage",
    formFactor: "stackable",
    maxDischargeCurrentA: 250,
    cycleLife: 6000,
  },
  {
    id: "byd-lvs-24.0",
    manufacturer: "BYD",
    model: "Battery-Box Premium LVS 24.0",
    voltageV: 51.2,
    capacityAh: 468,
    energyKwh: 24.0,
    dodPercent: 90,
    efficiencyPercent: 95,
    chemistry: "LiFePO4",
    voltageType: "low_voltage",
    formFactor: "stackable",
    maxDischargeCurrentA: 250,
    cycleLife: 6000,
  },
  {
    id: "byd-hvs-5.1",
    manufacturer: "BYD",
    model: "Battery-Box Premium HVS 5.1 High Voltage",
    voltageV: 204.8,
    capacityAh: 25,
    energyKwh: 5.12,
    dodPercent: 96,
    efficiencyPercent: 96.5,
    chemistry: "LiFePO4",
    voltageType: "high_voltage",
    formFactor: "stackable",
    maxDischargeCurrentA: 25,
    cycleLife: 6000,
  },
  {
    id: "byd-hvs-7.7",
    manufacturer: "BYD",
    model: "Battery-Box Premium HVS 7.7 High Voltage",
    voltageV: 307.2,
    capacityAh: 25,
    energyKwh: 7.68,
    dodPercent: 96,
    efficiencyPercent: 96.5,
    chemistry: "LiFePO4",
    voltageType: "high_voltage",
    formFactor: "stackable",
    maxDischargeCurrentA: 25,
    cycleLife: 6000,
  },
  {
    id: "byd-hvs-10.2",
    manufacturer: "BYD",
    model: "Battery-Box Premium HVS 10.2 High Voltage",
    voltageV: 409.6,
    capacityAh: 25,
    energyKwh: 10.24,
    dodPercent: 96,
    efficiencyPercent: 96.5,
    chemistry: "LiFePO4",
    voltageType: "high_voltage",
    formFactor: "stackable",
    maxDischargeCurrentA: 25,
    cycleLife: 6000,
  },
  {
    id: "byd-hvm-11.0",
    manufacturer: "BYD",
    model: "Battery-Box Premium HVM 11.0 High Voltage",
    voltageV: 204.8,
    capacityAh: 54,
    energyKwh: 11.04,
    dodPercent: 96,
    efficiencyPercent: 96.5,
    chemistry: "LiFePO4",
    voltageType: "high_voltage",
    formFactor: "stackable",
    maxDischargeCurrentA: 50,
    cycleLife: 6000,
  },
  {
    id: "byd-hvm-16.6",
    manufacturer: "BYD",
    model: "Battery-Box Premium HVM 16.6 High Voltage",
    voltageV: 307.2,
    capacityAh: 54,
    energyKwh: 16.56,
    dodPercent: 96,
    efficiencyPercent: 96.5,
    chemistry: "LiFePO4",
    voltageType: "high_voltage",
    formFactor: "stackable",
    maxDischargeCurrentA: 50,
    cycleLife: 6000,
  },
  {
    id: "byd-hvm-22.1",
    manufacturer: "BYD",
    model: "Battery-Box Premium HVM 22.1 High Voltage",
    voltageV: 409.6,
    capacityAh: 54,
    energyKwh: 22.08,
    dodPercent: 96,
    efficiencyPercent: 96.5,
    chemistry: "LiFePO4",
    voltageType: "high_voltage",
    formFactor: "stackable",
    maxDischargeCurrentA: 50,
    cycleLife: 6000,
  },
  {
    id: "byd-mc-cube-100",
    manufacturer: "BYD",
    model: "MC Cube C&I Blade BESS (100 kWh)",
    voltageV: 800,
    capacityAh: 125,
    energyKwh: 100.0,
    dodPercent: 95,
    efficiencyPercent: 98,
    chemistry: "LiFePO4",
    voltageType: "commercial_bess",
    formFactor: "containerized",
    maxDischargeCurrentA: 125,
    cycleLife: 8000,
  },

  // ==================== TESLA ====================
  {
    id: "tesla-powerwall-2",
    manufacturer: "Tesla",
    model: "Powerwall 2 AC Integrated (13.5 kWh)",
    voltageV: 50,
    capacityAh: 270,
    energyKwh: 13.5,
    dodPercent: 100,
    efficiencyPercent: 90,
    chemistry: "NMC",
    voltageType: "low_voltage",
    formFactor: "wall_mount",
    maxDischargeCurrentA: 100,
    cycleLife: 5000,
  },
  {
    id: "tesla-powerwall-3",
    manufacturer: "Tesla",
    model: "Powerwall 3 with 11.5kW Solar Inverter (13.5 kWh)",
    voltageV: 50,
    capacityAh: 270,
    energyKwh: 13.5,
    dodPercent: 100,
    efficiencyPercent: 97.5,
    chemistry: "LiFePO4",
    voltageType: "low_voltage",
    formFactor: "wall_mount",
    maxDischargeCurrentA: 120,
    cycleLife: 6000,
  },
  {
    id: "tesla-powerpack-2",
    manufacturer: "Tesla",
    model: "Powerpack 2 Commercial BESS (210 kWh)",
    voltageV: 400,
    capacityAh: 525,
    energyKwh: 210.0,
    dodPercent: 100,
    efficiencyPercent: 92,
    chemistry: "NMC",
    voltageType: "commercial_bess",
    formFactor: "containerized",
    maxDischargeCurrentA: 300,
    cycleLife: 5000,
  },
  {
    id: "tesla-megapack-2xl",
    manufacturer: "Tesla",
    model: "Megapack 2XL Utility-Scale BESS (3900 kWh)",
    voltageV: 480,
    capacityAh: 8125,
    energyKwh: 3900.0,
    dodPercent: 100,
    efficiencyPercent: 93.5,
    chemistry: "LiFePO4",
    voltageType: "commercial_bess",
    formFactor: "containerized",
    maxDischargeCurrentA: 2000,
    cycleLife: 6000,
  },

  // ==================== SUNGROW ====================
  {
    id: "sungrow-sbr096",
    manufacturer: "Sungrow",
    model: "SBR096 High Voltage LiFePO4 (9.6 kWh)",
    voltageV: 192,
    capacityAh: 50,
    energyKwh: 9.6,
    dodPercent: 100,
    efficiencyPercent: 97,
    chemistry: "LiFePO4",
    voltageType: "high_voltage",
    formFactor: "stackable",
    maxDischargeCurrentA: 30,
    cycleLife: 6000,
  },
  {
    id: "sungrow-sbr128",
    manufacturer: "Sungrow",
    model: "SBR128 High Voltage LiFePO4 (12.8 kWh)",
    voltageV: 256,
    capacityAh: 50,
    energyKwh: 12.8,
    dodPercent: 100,
    efficiencyPercent: 97,
    chemistry: "LiFePO4",
    voltageType: "high_voltage",
    formFactor: "stackable",
    maxDischargeCurrentA: 30,
    cycleLife: 6000,
  },
  {
    id: "sungrow-sbr160",
    manufacturer: "Sungrow",
    model: "SBR160 High Voltage LiFePO4 (16.0 kWh)",
    voltageV: 320,
    capacityAh: 50,
    energyKwh: 16.0,
    dodPercent: 100,
    efficiencyPercent: 97,
    chemistry: "LiFePO4",
    voltageType: "high_voltage",
    formFactor: "stackable",
    maxDischargeCurrentA: 30,
    cycleLife: 6000,
  },
  {
    id: "sungrow-sbr192",
    manufacturer: "Sungrow",
    model: "SBR192 High Voltage LiFePO4 (19.2 kWh)",
    voltageV: 384,
    capacityAh: 50,
    energyKwh: 19.2,
    dodPercent: 100,
    efficiencyPercent: 97,
    chemistry: "LiFePO4",
    voltageType: "high_voltage",
    formFactor: "stackable",
    maxDischargeCurrentA: 30,
    cycleLife: 6000,
  },
  {
    id: "sungrow-sbr256",
    manufacturer: "Sungrow",
    model: "SBR256 High Voltage LiFePO4 (25.6 kWh)",
    voltageV: 512,
    capacityAh: 50,
    energyKwh: 25.6,
    dodPercent: 100,
    efficiencyPercent: 97,
    chemistry: "LiFePO4",
    voltageType: "high_voltage",
    formFactor: "stackable",
    maxDischargeCurrentA: 30,
    cycleLife: 6000,
  },
  {
    id: "sungrow-powerstack-500",
    manufacturer: "Sungrow",
    model: "PowerStack ST500KWh Liquid-Cooled C&I ESS (500 kWh)",
    voltageV: 850,
    capacityAh: 588,
    energyKwh: 500.0,
    dodPercent: 100,
    efficiencyPercent: 98,
    chemistry: "LiFePO4",
    voltageType: "commercial_bess",
    formFactor: "containerized",
    maxDischargeCurrentA: 600,
    cycleLife: 8000,
  },

  // ==================== GROWATT ====================
  {
    id: "growatt-ark-2.5l",
    manufacturer: "Growatt",
    model: "ARK 2.5L Low Voltage LiFePO4 Module (2.56 kWh)",
    voltageV: 51.2,
    capacityAh: 50,
    energyKwh: 2.56,
    dodPercent: 90,
    efficiencyPercent: 95,
    chemistry: "LiFePO4",
    voltageType: "low_voltage",
    formFactor: "stackable",
    maxDischargeCurrentA: 25,
    cycleLife: 6000,
  },
  {
    id: "growatt-ark-5.1l",
    manufacturer: "Growatt",
    model: "ARK 5.1L Low Voltage LiFePO4 Module (5.12 kWh)",
    voltageV: 51.2,
    capacityAh: 100,
    energyKwh: 5.12,
    dodPercent: 90,
    efficiencyPercent: 95,
    chemistry: "LiFePO4",
    voltageType: "low_voltage",
    formFactor: "stackable",
    maxDischargeCurrentA: 50,
    cycleLife: 6000,
  },
  {
    id: "growatt-ark-10.2h",
    manufacturer: "Growatt",
    model: "ARK 10.2H High Voltage ESS Stack (10.24 kWh)",
    voltageV: 204.8,
    capacityAh: 50,
    energyKwh: 10.24,
    dodPercent: 90,
    efficiencyPercent: 96,
    chemistry: "LiFePO4",
    voltageType: "high_voltage",
    formFactor: "stackable",
    maxDischargeCurrentA: 25,
    cycleLife: 6000,
  },
  {
    id: "growatt-axe-5.0l",
    manufacturer: "Growatt",
    model: "AXE 5.0L Modular LiFePO4 (5.0 kWh)",
    voltageV: 51.2,
    capacityAh: 100,
    energyKwh: 5.0,
    dodPercent: 90,
    efficiencyPercent: 95,
    chemistry: "LiFePO4",
    voltageType: "low_voltage",
    formFactor: "stackable",
    maxDischargeCurrentA: 60,
    cycleLife: 6000,
  },
  {
    id: "growatt-apx-5.0p",
    manufacturer: "Growatt",
    model: "APX 5.0P High Voltage Cobalt-Free LFP (5.0 kWh)",
    voltageV: 650,
    capacityAh: 7.7,
    energyKwh: 5.0,
    dodPercent: 100,
    efficiencyPercent: 97,
    chemistry: "LiFePO4",
    voltageType: "high_voltage",
    formFactor: "stackable",
    maxDischargeCurrentA: 10,
    cycleLife: 8000,
  },
  {
    id: "growatt-apx-15.0p",
    manufacturer: "Growatt",
    model: "APX 15.0P High Voltage ESS Stack (15.0 kWh)",
    voltageV: 650,
    capacityAh: 23.0,
    energyKwh: 15.0,
    dodPercent: 100,
    efficiencyPercent: 97,
    chemistry: "LiFePO4",
    voltageType: "high_voltage",
    formFactor: "stackable",
    maxDischargeCurrentA: 30,
    cycleLife: 8000,
  },

  // ==================== ENPHASE ====================
  {
    id: "enphase-iq-5p",
    manufacturer: "Enphase",
    model: "IQ Battery 5P with Integrated Microinverters (5.0 kWh)",
    voltageV: 76.8,
    capacityAh: 65,
    energyKwh: 5.0,
    dodPercent: 100,
    efficiencyPercent: 96,
    chemistry: "LiFePO4",
    voltageType: "low_voltage",
    formFactor: "wall_mount",
    maxDischargeCurrentA: 40,
    cycleLife: 6000,
  },
  {
    id: "enphase-iq-10t",
    manufacturer: "Enphase",
    model: "IQ Battery 10T Modular ESS (10.5 kWh)",
    voltageV: 67.2,
    capacityAh: 156,
    energyKwh: 10.5,
    dodPercent: 100,
    efficiencyPercent: 96,
    chemistry: "LiFePO4",
    voltageType: "low_voltage",
    formFactor: "wall_mount",
    maxDischargeCurrentA: 48,
    cycleLife: 6000,
  },
  {
    id: "enphase-iq-3t",
    manufacturer: "Enphase",
    model: "IQ Battery 3T Compact ESS (3.5 kWh)",
    voltageV: 67.2,
    capacityAh: 52,
    energyKwh: 3.5,
    dodPercent: 100,
    efficiencyPercent: 96,
    chemistry: "LiFePO4",
    voltageType: "low_voltage",
    formFactor: "wall_mount",
    maxDischargeCurrentA: 16,
    cycleLife: 6000,
  },

  // ==================== GOODWE ====================
  {
    id: "goodwe-lynx-u-5.4",
    manufacturer: "GoodWe",
    model: "Lynx Home U Series LV LFP (5.4 kWh)",
    voltageV: 51.2,
    capacityAh: 105,
    energyKwh: 5.4,
    dodPercent: 90,
    efficiencyPercent: 95,
    chemistry: "LiFePO4",
    voltageType: "low_voltage",
    formFactor: "wall_mount",
    maxDischargeCurrentA: 100,
    cycleLife: 6000,
  },
  {
    id: "goodwe-lynx-f-6.6",
    manufacturer: "GoodWe",
    model: "Lynx Home F PLUS+ High Voltage (6.6 kWh)",
    voltageV: 204.8,
    capacityAh: 32,
    energyKwh: 6.6,
    dodPercent: 100,
    efficiencyPercent: 96.5,
    chemistry: "LiFePO4",
    voltageType: "high_voltage",
    formFactor: "stackable",
    maxDischargeCurrentA: 25,
    cycleLife: 6000,
  },
  {
    id: "goodwe-lynx-f-9.8",
    manufacturer: "GoodWe",
    model: "Lynx Home F PLUS+ High Voltage (9.8 kWh)",
    voltageV: 307.2,
    capacityAh: 32,
    energyKwh: 9.8,
    dodPercent: 100,
    efficiencyPercent: 96.5,
    chemistry: "LiFePO4",
    voltageType: "high_voltage",
    formFactor: "stackable",
    maxDischargeCurrentA: 25,
    cycleLife: 6000,
  },
  {
    id: "goodwe-lynx-f-16.4",
    manufacturer: "GoodWe",
    model: "Lynx Home F PLUS+ High Voltage (16.4 kWh)",
    voltageV: 512,
    capacityAh: 32,
    energyKwh: 16.4,
    dodPercent: 100,
    efficiencyPercent: 96.5,
    chemistry: "LiFePO4",
    voltageType: "high_voltage",
    formFactor: "stackable",
    maxDischargeCurrentA: 25,
    cycleLife: 6000,
  },
  {
    id: "goodwe-lynx-c-60kwh",
    manufacturer: "GoodWe",
    model: "Lynx C Series Commercial BESS Cabinet (60 kWh)",
    voltageV: 576,
    capacityAh: 104,
    energyKwh: 60.0,
    dodPercent: 95,
    efficiencyPercent: 97.5,
    chemistry: "LiFePO4",
    voltageType: "commercial_bess",
    formFactor: "containerized",
    maxDischargeCurrentA: 100,
    cycleLife: 6000,
  },

  // ==================== FORTRESS POWER & SOL-ARK ====================
  {
    id: "fortress-evault-max",
    manufacturer: "Fortress Power",
    model: "eVault Max Heavy-Duty C&I LiFePO4 (18.5 kWh)",
    voltageV: 51.2,
    capacityAh: 360,
    energyKwh: 18.5,
    dodPercent: 95,
    efficiencyPercent: 98,
    chemistry: "LiFePO4",
    voltageType: "low_voltage",
    formFactor: "floor_standing",
    maxDischargeCurrentA: 200,
    cycleLife: 8000,
  },
  {
    id: "fortress-eflex-5.4",
    manufacturer: "Fortress Power",
    model: "eFlex 5.4 Server Rack LiFePO4 (5.4 kWh)",
    voltageV: 51.2,
    capacityAh: 105,
    energyKwh: 5.4,
    dodPercent: 95,
    efficiencyPercent: 98,
    chemistry: "LiFePO4",
    voltageType: "low_voltage",
    formFactor: "rack_mount",
    maxDischargeCurrentA: 100,
    cycleLife: 8000,
  },
  {
    id: "sol-ark-limitless-15k",
    manufacturer: "Sol-Ark",
    model: "Limitless 15K Wall-Mount LFP (15.0 kWh)",
    voltageV: 51.2,
    capacityAh: 292,
    energyKwh: 15.0,
    dodPercent: 95,
    efficiencyPercent: 97,
    chemistry: "LiFePO4",
    voltageType: "low_voltage",
    formFactor: "wall_mount",
    maxDischargeCurrentA: 200,
    cycleLife: 6000,
  },
  {
    id: "sol-ark-wallmount-10k",
    manufacturer: "Sol-Ark",
    model: "Wall-Mount 10K LFP (10.24 kWh)",
    voltageV: 51.2,
    capacityAh: 200,
    energyKwh: 10.24,
    dodPercent: 95,
    efficiencyPercent: 97,
    chemistry: "LiFePO4",
    voltageType: "low_voltage",
    formFactor: "wall_mount",
    maxDischargeCurrentA: 150,
    cycleLife: 6000,
  },

  // ==================== FELICITY SOLAR & DYNESS & NARADA ====================
  {
    id: "felicity-lpba48200",
    manufacturer: "Felicity Solar",
    model: "LPBA48200 Wall-Mounted LiFePO4 (10.0 kWh)",
    voltageV: 51.2,
    capacityAh: 200,
    energyKwh: 10.0,
    dodPercent: 90,
    efficiencyPercent: 95,
    chemistry: "LiFePO4",
    voltageType: "low_voltage",
    formFactor: "wall_mount",
    maxDischargeCurrentA: 120,
    cycleLife: 6000,
  },
  {
    id: "felicity-lpba48100",
    manufacturer: "Felicity Solar",
    model: "LPBA48100 Wall-Mounted LiFePO4 (5.0 kWh)",
    voltageV: 51.2,
    capacityAh: 100,
    energyKwh: 5.0,
    dodPercent: 90,
    efficiencyPercent: 95,
    chemistry: "LiFePO4",
    voltageType: "low_voltage",
    formFactor: "wall_mount",
    maxDischargeCurrentA: 80,
    cycleLife: 6000,
  },
  {
    id: "felicity-fla48300",
    manufacturer: "Felicity Solar",
    model: "FLA48300 Floor-Standing LiFePO4 (15.0 kWh)",
    voltageV: 51.2,
    capacityAh: 300,
    energyKwh: 15.0,
    dodPercent: 90,
    efficiencyPercent: 95,
    chemistry: "LiFePO4",
    voltageType: "low_voltage",
    formFactor: "floor_standing",
    maxDischargeCurrentA: 150,
    cycleLife: 6000,
  },
  {
    id: "dyness-bx51100",
    manufacturer: "Dyness",
    model: "BX51100 19-inch Rack LiFePO4 (5.12 kWh)",
    voltageV: 51.2,
    capacityAh: 100,
    energyKwh: 5.12,
    dodPercent: 90,
    efficiencyPercent: 95,
    chemistry: "LiFePO4",
    voltageType: "low_voltage",
    formFactor: "rack_mount",
    maxDischargeCurrentA: 75,
    cycleLife: 6000,
  },
  {
    id: "dyness-powerbox-f",
    manufacturer: "Dyness",
    model: "Powerbox F Wall/Floor LiFePO4 (10.24 kWh)",
    voltageV: 51.2,
    capacityAh: 200,
    energyKwh: 10.24,
    dodPercent: 90,
    efficiencyPercent: 95,
    chemistry: "LiFePO4",
    voltageType: "low_voltage",
    formFactor: "wall_mount",
    maxDischargeCurrentA: 100,
    cycleLife: 6000,
  },
  {
    id: "dyness-tower-t10",
    manufacturer: "Dyness",
    model: "Tower T10 High Voltage Stack (10.66 kWh)",
    voltageV: 284,
    capacityAh: 37.5,
    energyKwh: 10.66,
    dodPercent: 95,
    efficiencyPercent: 96,
    chemistry: "LiFePO4",
    voltageType: "high_voltage",
    formFactor: "stackable",
    maxDischargeCurrentA: 35,
    cycleLife: 6000,
  },
  {
    id: "narada-48npfc100",
    manufacturer: "Narada",
    model: "48NPFC100 Telecom & Microgrid LiFePO4 (4.8 kWh)",
    voltageV: 48,
    capacityAh: 100,
    energyKwh: 4.8,
    dodPercent: 90,
    efficiencyPercent: 95,
    chemistry: "LiFePO4",
    voltageType: "low_voltage",
    formFactor: "rack_mount",
    maxDischargeCurrentA: 100,
    cycleLife: 5000,
  },
  {
    id: "narada-48npfc200",
    manufacturer: "Narada",
    model: "48NPFC200 Telecom & Microgrid LiFePO4 (9.6 kWh)",
    voltageV: 48,
    capacityAh: 200,
    energyKwh: 9.6,
    dodPercent: 90,
    efficiencyPercent: 95,
    chemistry: "LiFePO4",
    voltageType: "low_voltage",
    formFactor: "rack_mount",
    maxDischargeCurrentA: 150,
    cycleLife: 5000,
  },

  // ==================== LG ENERGY SOLUTION ====================
  {
    id: "lg-resu-10h-prime",
    manufacturer: "LG Energy Solution",
    model: "RESU 10H Prime High Voltage (9.6 kWh)",
    voltageV: 400,
    capacityAh: 24,
    energyKwh: 9.6,
    dodPercent: 90,
    efficiencyPercent: 95,
    chemistry: "NMC",
    voltageType: "high_voltage",
    formFactor: "wall_mount",
    maxDischargeCurrentA: 20,
    cycleLife: 4000,
  },
  {
    id: "lg-resu-16h-prime",
    manufacturer: "LG Energy Solution",
    model: "RESU 16H Prime High Voltage (16.0 kWh)",
    voltageV: 400,
    capacityAh: 40,
    energyKwh: 16.0,
    dodPercent: 90,
    efficiencyPercent: 95,
    chemistry: "NMC",
    voltageType: "high_voltage",
    formFactor: "wall_mount",
    maxDischargeCurrentA: 25,
    cycleLife: 4000,
  },
  {
    id: "lg-resu-6.5",
    manufacturer: "LG Energy Solution",
    model: "RESU 6.5 Low Voltage Li-ion (6.5 kWh)",
    voltageV: 48,
    capacityAh: 126,
    energyKwh: 6.5,
    dodPercent: 90,
    efficiencyPercent: 95,
    chemistry: "NMC",
    voltageType: "low_voltage",
    formFactor: "wall_mount",
    maxDischargeCurrentA: 90,
    cycleLife: 4000,
  },

  // ==================== CATL ====================
  {
    id: "catl-enerone-372",
    manufacturer: "CATL",
    model: "EnerOne C&I Liquid-Cooled BESS (372.7 kWh)",
    voltageV: 896,
    capacityAh: 416,
    energyKwh: 372.7,
    dodPercent: 100,
    efficiencyPercent: 98.5,
    chemistry: "LiFePO4",
    voltageType: "commercial_bess",
    formFactor: "containerized",
    maxDischargeCurrentA: 500,
    cycleLife: 8000,
  },
];

// ==========================================
// 4. RESIDENTIAL PRESETS
// ==========================================
export interface SolarPreset {
  name: string;
  targetKwp: number;
  moduleId: string;
  inverterId: string;
  modulesPerString: number;
  strings: number;
  inverterQty: number;
  systemType: "on-grid" | "off-grid" | "hybrid";
  phase: "1PH" | "3PH";
  voltage: number;
}

export const RESIDENTIAL_PRESETS: Record<string, SolarPreset> = {
  "3kw": {
    name: "3 kWp Starter Residential",
    targetKwp: 3.08,
    moduleId: "trina-vertex-s-440",
    inverterId: "huawei-sun2000-5ktl-l1",
    modulesPerString: 7,
    strings: 1,
    inverterQty: 1,
    systemType: "on-grid",
    phase: "1PH",
    voltage: 230,
  },
  "5kw": {
    name: "5 kWp Standard Residential",
    targetKwp: 5.28,
    moduleId: "trina-vertex-s-440",
    inverterId: "huawei-sun2000-5ktl-l1",
    modulesPerString: 6,
    strings: 2,
    inverterQty: 1,
    systemType: "on-grid",
    phase: "1PH",
    voltage: 230,
  },
  "8kw": {
    name: "8 kWp Premium Residential",
    targetKwp: 8.19,
    moduleId: "longi-himo6-585",
    inverterId: "huawei-sun2000-10ktl-m1",
    modulesPerString: 7,
    strings: 2,
    inverterQty: 1,
    systemType: "on-grid",
    phase: "1PH",
    voltage: 230,
  },
  "10kw": {
    name: "10 kWp High-Demand Residential",
    targetKwp: 10.45,
    moduleId: "trina-vertex-550",
    inverterId: "huawei-sun2000-10ktl-m1",
    modulesPerString: 9,
    strings: 2,
    inverterQty: 1,
    systemType: "on-grid",
    phase: "3PH",
    voltage: 400,
  },
  "15kw": {
    name: "15 kWp Luxury Estate",
    targetKwp: 15.4,
    moduleId: "trina-vertex-550",
    inverterId: "huawei-sun2000-10ktl-m1",
    modulesPerString: 14,
    strings: 2,
    inverterQty: 1,
    systemType: "on-grid",
    phase: "3PH",
    voltage: 400,
  },
};

// ==========================================
// 5. DEFAULT SOLAR DESIGN CONFIGURATION
// ==========================================
export const DEFAULT_SOLAR_CONFIG: SolarDesignConfig = {
  projectName: "Solar PV Project",
  projectLocation: "Metro Manila, Philippines",
  clientName: "Client",
  designerName: "Professional Electrical Engineer",
  projectType: "commercial",
  systemType: "on-grid",
  sizingMethod: "load_demand",
  targetCapacityKwp: 500.0,
  availableRoofAreaM2: 3500,
  roofType: "gi_sheet",
  mountingType: "tilted_rack",
  selectedMdpId: "",

  utilityVoltage: 230,
  utilityPhase: "1PH",
  utilityFrequency: 60,
  serviceCapacityAmps: 100,

  minOperatingTempC: 18,
  maxOperatingTempC: 65,
  peakSunHours: 4.5,

  selectedModuleId: "auto",
  autoModuleSelection: true,
  customModules: [],
  modulesPerString: 18,
  numberOfStrings: 44,
  totalModules: 792,
  manualModuleOverride: false,

  selectedInverterId: "auto",
  autoInverterSelection: true,
  customInverters: [],
  inverterQuantity: 5,
  stringsPerInverter: 9,
  mpptsUsedPerInverter: 9,

  battery: {
    enabled: false,
    manufacturer: "Pylontech",
    model: "US5000 4.8kWh LFP",
    voltageV: 48,
    capacityAh: 100,
    energyKwh: 4.8,
    dodPercent: 90,
    efficiencyPercent: 95,
    backupHours: 4,
    requiredBackupLoadKw: 25,
    units: 8,
    unitsInSeries: 1,
    unitsInParallel: 8,
    batteryBankVoltage: 48,
    totalEnergyKwh: 38.4,
    usableEnergyKwh: 34.56,
  },

  dcProtection: {
    combinerBoxRequired: true,
    combinerBoxModel: "IP65 1000V DC Combiner Box",
    combinerBoxInputs: 4,
    fuseRatingAmps: 25,
    fuseVoltageVolts: 1000,
    fusePoles: 2,
    fuseKaic: 20,
    isolatorRatingAmps: 32,
    isolatorVoltageVolts: 1000,
    isolatorPoles: 2,
    isolatorKaic: 10,
    spdType: "Type II DC SPD",
    spdUcVolts: 1000,
    spdInKa: 20,
    spdImaxKa: 40,
    egcSizeMm2: 8.0,
    egcMaterial: "Cu",
    egcInsulation: "THW/Bare",
  },

  acProtection: {
    breakerType: "MCCB",
    atAmps: 200,
    afAmps: 225,
    poles: 3,
    kaic: 35,
    voltage: 400,
    spdType: "Type II AC SPD 275V/440V",
    spdRatingVolts: 440,
    isolatorRatingAmps: 200,
    isolatorPoles: 3,
    isManualOverride: false,
  },

  cabling: {
    dcCable: {
      conductorSizeMm2: 6.0,
      material: "Cu",
      insulation: "PV1-F / H1Z2Z2-K Solar Cable",
      conduitType: "EMT",
      conduitSizeMm: 32,
      lengthM: 35,
      sets: 1,
      tempCorrectionFactor: 0.88,
      conduitFillFactor: 0.8,
      allowableAmpacity: 55,
      designCurrent: 14.17,
      voltageDropVolts: 8.2,
      voltageDropPercent: 1.02,
    },
    acCable: {
      conductorSizeMm2: 95.0,
      material: "Cu",
      insulation: "THHN / THWN-2 90°C",
      conduitType: "PVC",
      conduitSizeMm: 75,
      lengthM: 40,
      sets: 1,
      tempCorrectionFactor: 0.91,
      conduitFillFactor: 1.0,
      allowableAmpacity: 230,
      designCurrent: 160.4,
      voltageDropVolts: 3.5,
      voltageDropPercent: 0.88,
    },
    dcMaxDropPercent: 1.5,
    acMaxDropPercent: 1.5,
  },

  transformer: {
    enabled: false,
    primaryVoltage: 13800,
    secondaryVoltage: 400,
    kvaRating: 750,
    phase: "3PH",
    frequencyHz: 60,
    impedancePercent: 5.75,
    primaryCurrentAmps: 31.4,
    secondaryCurrentAmps: 1082.5,
    primaryBreakerAmps: 40,
    secondaryBreakerAmps: 1200,
  },

  netMetering: {
    enabled: true,
    utilityProvider: "Meralco",
    serviceVoltage: 400,
    servicePhase: "3PH",
    exportLimitation: "none",
    exportLimitPercent: 100,
    interconnectionType: "load_side",
    smartMeterModel: "Bi-directional Net Meter Class 0.5s",
  },

  bomItems: [],
};

// ==========================================
// 6. ENGINEERING CALCULATION ENGINE
// ==========================================

export type { SolarCalculationResults };

/**
 * Standard copper wire resistance at 75°C per PEC 2017 Chapter 9 Table 8
 * (Ohms per km)
 */
export const WIRE_RESISTANCE_75C: Record<number, number> = {
  2.0: 10.4,
  3.5: 5.95,
  5.5: 3.78,
  6.0: 3.47,
  8.0: 2.60,
  10.0: 2.08,
  14.0: 1.48,
  22.0: 0.94,
  30.0: 0.69,
  38.0: 0.54,
  50.0: 0.41,
  60.0: 0.35,
  80.0: 0.26,
  100.0: 0.21,
  125.0: 0.17,
  150.0: 0.14,
  200.0: 0.11,
  250.0: 0.09,
};

/**
 * Standard Copper Wire Ampacity (75°C / 90°C THHN) per PEC 2017 Table 3.10.2.6
 */
export const WIRE_AMPACITY_COPPER_90C: Record<number, number> = {
  2.0: 25,
  3.5: 35,
  5.5: 50,
  6.0: 55,
  8.0: 65,
  10.0: 75,
  14.0: 95,
  22.0: 130,
  30.0: 150,
  38.0: 175,
  50.0: 215,
  60.0: 240,
  80.0: 280,
  100.0: 320,
  125.0: 355,
  150.0: 395,
  200.0: 455,
  250.0: 515,
};

export const STANDARD_BREAKER_RATINGS = [
  15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 125, 150, 175, 200, 225, 250,
  300, 350, 400, 500, 600, 800, 1000, 1200, 1600, 2000, 2500,
];

export function getNextStandardBreaker(minAmp: number): number {
  for (const rating of STANDARD_BREAKER_RATINGS) {
    if (rating >= minAmp) return rating;
  }
  return Math.ceil(minAmp / 100) * 100;
}

/**
 * Standard Equipment Grounding Conductor (EGC) per PEC 2017 Table 2.50.6.13 (Copper)
 */
export function getStandardEgcSize(breakerAmps: number): number {
  if (breakerAmps <= 15) return 2.0;
  if (breakerAmps <= 20) return 3.5;
  if (breakerAmps <= 60) return 5.5;
  if (breakerAmps <= 100) return 8.0;
  if (breakerAmps <= 200) return 14.0;
  if (breakerAmps <= 300) return 22.0;
  if (breakerAmps <= 400) return 30.0;
  if (breakerAmps <= 500) return 50.0;
  if (breakerAmps <= 600) return 50.0;
  if (breakerAmps <= 800) return 60.0;
  if (breakerAmps <= 1000) return 80.0;
  if (breakerAmps <= 1200) return 100.0;
  return 125.0;
}

/**
 * Standard Trade Conduit Size (mm) per PEC Chapter 9 40% Fill
 */
export function getStandardConduitSize(wireSizeMm2: number, numWires: number = 3): number {
  if (numWires <= 2) {
    if (wireSizeMm2 <= 6.0) return 20;
    if (wireSizeMm2 <= 16.0) return 25;
    if (wireSizeMm2 <= 35.0) return 32;
    return 40;
  }
  // 3 or 4 wires in conduit
  if (wireSizeMm2 <= 5.5) return 20;
  if (wireSizeMm2 <= 8.0) return 25;
  if (wireSizeMm2 <= 14.0) return 25;
  if (wireSizeMm2 <= 22.0) return 32;
  if (wireSizeMm2 <= 30.0) return 32;
  if (wireSizeMm2 <= 38.0) return 40;
  if (wireSizeMm2 <= 50.0) return 50;
  if (wireSizeMm2 <= 60.0) return 50;
  if (wireSizeMm2 <= 80.0) return 65;
  if (wireSizeMm2 <= 95.0) return 65;
  if (wireSizeMm2 <= 125.0) return 80;
  if (wireSizeMm2 <= 150.0) return 90;
  if (wireSizeMm2 <= 200.0) return 100;
  return 100;
}

/**
 * Automatic DC Solar Cable Sizer
 */
export function autoSizeDcCable(
  stringImp: number,
  stringVmp: number,
  lengthM: number,
  maxVdPercent: number = 1.5,
  tempDerate: number = 0.88
): { conductorSizeMm2: number; ampacity: number; vdVolts: number; vdPercent: number } {
  const dcSizes = [4.0, 6.0, 10.0, 16.0];
  const requiredAmps = stringImp * 1.56; // PEC 6.90.8 continuous duty factor

  for (const size of dcSizes) {
    const r = WIRE_RESISTANCE_75C[size] || 3.47;
    const baseAmp = WIRE_AMPACITY_COPPER_90C[size] || 55;
    const deratedAmp = baseAmp * tempDerate;
    const vdVolts = (2 * stringImp * lengthM * (r / 1000));
    const vdPercent = stringVmp > 0 ? (vdVolts / stringVmp) * 100 : 0;

    if (deratedAmp >= requiredAmps && vdPercent <= maxVdPercent) {
      return {
        conductorSizeMm2: size,
        ampacity: Number(deratedAmp.toFixed(1)),
        vdVolts: Number(vdVolts.toFixed(2)),
        vdPercent: Number(vdPercent.toFixed(2)),
      };
    }
  }

  // Fallback to standard 6.0 mm²
  const defaultSize = 6.0;
  const r = WIRE_RESISTANCE_75C[defaultSize] || 3.47;
  const vdVolts = (2 * stringImp * lengthM * (r / 1000));
  return {
    conductorSizeMm2: defaultSize,
    ampacity: Number(((WIRE_AMPACITY_COPPER_90C[defaultSize] || 55) * tempDerate).toFixed(1)),
    vdVolts: Number(vdVolts.toFixed(2)),
    vdPercent: stringVmp > 0 ? Number(((vdVolts / stringVmp) * 100).toFixed(2)) : 0,
  };
}

/**
 * Automatic AC Inverter Output Cable Sizer
 */
export function autoSizeAcCable(
  singleInvMaxAcCurrent: number,
  invAcV: number,
  is3Phase: boolean,
  lengthM: number,
  maxVdPercent: number = 1.5,
  tempDerate: number = 0.91
): { conductorSizeMm2: number; ampacity: number; vdVolts: number; vdPercent: number } {
  const acSizes = [3.5, 5.5, 8.0, 14.0, 22.0, 30.0, 38.0, 50.0, 60.0, 80.0, 95.0, 125.0, 150.0, 200.0, 250.0];
  const requiredAmps = singleInvMaxAcCurrent * 1.25; // 125% continuous duty PEC 6.90.8
  const factor = is3Phase ? Math.sqrt(3) : 2;

  for (const size of acSizes) {
    const r = WIRE_RESISTANCE_75C[size] || 0.21;
    const baseAmp = WIRE_AMPACITY_COPPER_90C[size] || 230;
    const deratedAmp = baseAmp * tempDerate;
    const vdVolts = (factor * singleInvMaxAcCurrent * lengthM * (r / 1000));
    const vdPercent = invAcV > 0 ? (vdVolts / invAcV) * 100 : 0;

    if (deratedAmp >= requiredAmps && vdPercent <= maxVdPercent) {
      return {
        conductorSizeMm2: size,
        ampacity: Number(deratedAmp.toFixed(1)),
        vdVolts: Number(vdVolts.toFixed(2)),
        vdPercent: Number(vdPercent.toFixed(2)),
      };
    }
  }

  // Fallback to 95 mm² or largest
  const defaultSize = singleInvMaxAcCurrent > 100 ? 95.0 : 14.0;
  const r = WIRE_RESISTANCE_75C[defaultSize] || 0.21;
  const vdVolts = (factor * singleInvMaxAcCurrent * lengthM * (r / 1000));
  return {
    conductorSizeMm2: defaultSize,
    ampacity: Number(((WIRE_AMPACITY_COPPER_90C[defaultSize] || 230) * tempDerate).toFixed(1)),
    vdVolts: Number(vdVolts.toFixed(2)),
    vdPercent: invAcV > 0 ? Number(((vdVolts / invAcV) * 100).toFixed(2)) : 0,
  };
}

/**
 * Automatic Isolation / Step-up Transformer Sizer
 */
export function autoSizeTransformer(
  totalAcKw: number,
  secV: number = 230,
  priV: number = 400,
  is3Phase: boolean = true
): { kva: number; primaryBreaker: number; secondaryBreaker: number } {
  const standardKvas = [15, 25, 30, 45, 50, 75, 112.5, 150, 225, 300, 500, 750, 1000, 1500, 2000];
  const requiredKva = totalAcKw / 0.85;

  let selectedKva = standardKvas[0];
  for (const k of standardKvas) {
    if (k >= requiredKva) {
      selectedKva = k;
      break;
    }
  }

  // Primary & Secondary Protection (125% rating per PEC 4.50)
  // I = S / (sqrt(3) x V) for three-phase, I = S / V for single-phase
  const phaseFactor = is3Phase ? Math.sqrt(3) : 1;
  const priCurrent = (selectedKva * 1000) / (priV * phaseFactor);
  const secCurrent = (selectedKva * 1000) / (secV * phaseFactor);
  const primaryBreaker = getNextStandardBreaker(priCurrent * 1.25);
  const secondaryBreaker = getNextStandardBreaker(secCurrent * 1.25);

  return {
    kva: selectedKva,
    primaryBreaker,
    secondaryBreaker,
  };
}

/**
 * Describes how the inverters connect to the utility service and the resulting line current.
 *
 * - 1PH service (Philippine 230V 2-wire): currents add on the one circuit.
 * - 3PH 3W (230V delta): three-phase inverters are 3-wire; single-phase inverters connect
 *   line-to-line and are spread A-B, B-C, C-A. With n_ab and n_ca inverters on the pairs that
 *   share line A, I_A = I x sqrt(n_ab^2 + n_ca^2 + n_ab x n_ca) (phasors 120 deg apart).
 * - 3PH 4W (400/230V wye): three-phase inverters are 4-wire (3 phases + neutral); single-phase
 *   inverters connect line-to-neutral and are spread A, B, C, so a line carries its own inverters.
 */
export function computeAcSystem(
  config: SolarDesignConfig,
  inverter: SolarInverter,
  inverterQuantity: number,
  singleInvMaxAcCurrent: number
): SolarAcSystem {
  const utilityIs3Phase = !(config.utilityPhase === "1PH" || config.utilityPhase === "1-Phase");
  const utilityV = config.utilityVoltage || 230;
  const service: SolarAcSystem["service"] = !utilityIs3Phase ? "1PH-2W" : utilityV >= 380 ? "3PH-4W" : "3PH-3W";
  const serviceLabel =
    service === "1PH-2W" ? `1PH 2W ${utilityV}V` : service === "3PH-4W" ? `3PH 4W ${utilityV}/${Math.round(utilityV / Math.sqrt(3))}V` : `3PH 3W ${utilityV}V`;
  const inverterIs3Phase = inverter.phase === "3PH";
  const invV = inverter.acVoltage || (inverterIs3Phase ? 400 : 230);
  const n = Math.max(1, inverterQuantity);

  let inverterConnection: SolarAcSystem["inverterConnection"];
  let phaseDistribution: Array<[string, number]> | null = null;
  let lineCurrent: number;
  if (inverterIs3Phase) {
    inverterConnection = invV >= 380 ? "3PH-4W" : "3PH-3W";
    lineCurrent = n * singleInvMaxAcCurrent;
  } else if (service === "1PH-2W") {
    inverterConnection = "1PH";
    lineCurrent = n * singleInvMaxAcCurrent;
  } else {
    // Spread single-phase inverters evenly over the three phases (or phase pairs)
    const counts = [0, 1, 2].map((i) => Math.floor(n / 3) + (i < n % 3 ? 1 : 0));
    if (service === "3PH-4W") {
      inverterConnection = "1PH-LN";
      phaseDistribution = [["A", counts[0]], ["B", counts[1]], ["C", counts[2]]];
      lineCurrent = Math.max(...counts) * singleInvMaxAcCurrent;
    } else {
      inverterConnection = "1PH-LL";
      phaseDistribution = [["A-B", counts[0]], ["B-C", counts[1]], ["C-A", counts[2]]];
      const [ab, bc, ca] = counts;
      const line = (p: number, q: number) => Math.sqrt(p * p + q * q + p * q);
      lineCurrent = Math.max(line(ab, ca), line(bc, ab), line(ca, bc)) * singleInvMaxAcCurrent;
    }
  }

  const hasNeutral = inverterConnection === "3PH-4W" || inverterConnection === "1PH-LN";
  const phaseConductors = inverterIs3Phase ? 3 : hasNeutral ? 1 : 2;
  const currentCarryingConductors = phaseConductors + (hasNeutral ? 1 : 0);
  const inverterConnectionLabel = {
    "1PH": `1PH ${invV}V`,
    "1PH-LN": `1PH ${invV}V L-N`,
    "1PH-LL": `1PH ${invV}V L-L`,
    "3PH-3W": `3PH 3W ${invV}V`,
    "3PH-4W": `3PH 4W ${invV}V`,
  }[inverterConnection];

  return {
    service,
    serviceLabel,
    inverterIs3Phase,
    inverterConnection,
    inverterConnectionLabel,
    currentCarryingConductors,
    phaseConductors,
    hasNeutral,
    phaseDistribution,
    interconnectionLineCurrent: Number(lineCurrent.toFixed(1)),
    mainDisconnectPoles: utilityIs3Phase ? 3 : 2,
  };
}

/**
 * Automatically determines and selects the optimal PV Module Model based on
 * project classification (Residential vs Commercial), required target capacity (kWp),
 * roof structure type, and inverter DC voltage window constraints.
 */
export function determineRecommendedModule(
  config: SolarDesignConfig,
  targetKwp: number,
  allModules: PVModule[] = DEFAULT_PV_MODULES,
  inverter?: SolarInverter
): PVModule {
  const isResidential =
    config.projectType === "residential" ||
    targetKwp <= 15.0;
  const isTileRoof = config.roofType === "tile_roof";
  const isGroundMountOrCarport =
    config.roofType === "ground_mount" || config.roofType === "carport_canopy";

  // 1. Residential & Small Rooftop Systems (<= 15 kWp or residential project type or tile roof)
  // Requires compact, lightweight (<= 21.5 kg, ~1.76m) 54-cell/108-half-cell modules for roof structural safety & 500V-600V inverter MPPT match
  if (isResidential || isTileRoof) {
    const resPreferredIds = [
      "longi-himox6-435-res",
      "jinko-tiger-neo-440-res",
      "trina-vertex-s-440",
      "canadian-solar-tophiku6-440-res",
      "ja-solar-deepblue4-440-res",
      "trina-vertex-s-450",
    ];
    for (const id of resPreferredIds) {
      const found = allModules.find((m) => m.id === id);
      if (found) return found;
    }
    const anyRes = allModules.find((m) => m.ratedPowerWp <= 460);
    if (anyRes) return anyRes;
  }

  // 2. Large Industrial / Ground-Mount / Utility-scale (> 80 kWp or ground-mount/carport)
  // Requires high-power density 600W - 635W+ bifacial/monofacial 72/78-cell modules
  if (targetKwp > 80.0 || isGroundMountOrCarport) {
    if (isGroundMountOrCarport) {
      const bifacialPreferred = [
        "longi-himo7-600",
        "canadian-solar-bihiku7-670",
        "longi-himo6-635",
        "jinko-tiger-neo-620",
      ];
      for (const id of bifacialPreferred) {
        const found = allModules.find((m) => m.id === id);
        if (found) return found;
      }
    }

    const largeCniPreferred = [
      "longi-himo6-635",
      "jinko-tiger-neo-620",
      "longi-himo7-600",
      "ja-solar-deepblue4-630",
      "tw-solar-twmnh-670",
    ];
    for (const id of largeCniPreferred) {
      const found = allModules.find((m) => m.id === id);
      if (found) return found;
    }
  }

  // 3. Medium Commercial & Industrial Rooftop (15 kWp - 80 kWp)
  // Optimal: 575W - 585W N-Type TopCon 72-cell standard (2.27m, 28kg) for 1000V C&I inverters
  const midCniPreferred = [
    "jinko-tiger-neo-585",
    "longi-himo6-585",
    "canadian-solar-tophiku6-580",
    "ja-solar-deepblue4-575",
    "jinko-tiger-neo-575",
    "trina-vertex-550",
  ];
  for (const id of midCniPreferred) {
    const found = allModules.find((m) => m.id === id);
    if (found) return found;
  }

  return allModules.find((m) => m.id === "longi-himo6-635") || allModules[0];
}

/**
 * Automatically determines and selects the optimal Solar Inverter Model based on:
 * - Required / needed target capacity (targetKwp) and AC generation requirement (~1.15 to 1.25 DC/AC ratio)
 * - Utility grid phase: 1PH (230V residential) vs 3PH (400V standard C&I or 230V Delta Philippine grid)
 * - Utility nominal voltage (230V vs 400V) and step-up transformer configuration
 * - System type: On-Grid vs Hybrid / Storage (BESS) vs Off-Grid
 * - Project classification: Residential vs Commercial / Industrial
 */
export function determineRecommendedInverter(
  config: SolarDesignConfig,
  targetKwp: number,
  allInverters: SolarInverter[] = DEFAULT_INVERTERS,
  module?: PVModule
): SolarInverter {
  const is1Phase = config.utilityPhase === "1PH" || config.utilityPhase === "1-Phase";
  const is3Phase = !is1Phase;
  const volt = config.utilityVoltage || 230;
  const is3Phase230V = is3Phase && volt <= 240;
  const isHybridOrStorage = config.systemType === "hybrid" || Boolean(config.battery?.enabled);
  const isOffGrid = config.systemType === "off-grid";

  // Target AC kW needed (nominal ~1.20 DC/AC ratio)
  const targetAcKw = targetKwp / 1.20;

  // 1. Single-Phase Utility Grid (1PH 230V - typically residential or small commercial)
  if (is1Phase) {
    const singlePhaseInverters = allInverters.filter((i) => i.phase === "1PH");

    // Hybrid / Off-Grid with Battery Storage
    if (isHybridOrStorage || isOffGrid) {
      if (targetAcKw <= 3.5) {
        return (
          singlePhaseInverters.find((i) => i.id === "deye-sun-3k-sg04") ||
          singlePhaseInverters.find((i) => i.id === "sungrow-sh5-0rs-hybrid") ||
          singlePhaseInverters[0] ||
          allInverters[0]
        );
      }
      if (targetAcKw <= 6.0) {
        return (
          singlePhaseInverters.find((i) => i.id === "sungrow-sh5-0rs-hybrid") ||
          singlePhaseInverters.find((i) => i.id === "deye-sun-5k-sg01") ||
          singlePhaseInverters.find((i) => i.id === "fronius-primo-gen24-5-0") ||
          singlePhaseInverters[0] ||
          allInverters[0]
        );
      }
      return (
        singlePhaseInverters.find((i) => i.id === "deye-sun-8k-sg01") ||
        singlePhaseInverters.find((i) => i.id === "sungrow-sh5-0rs-hybrid") ||
        singlePhaseInverters[0] ||
        allInverters[0]
      );
    }

    // Standard Grid-Tie On-Grid Single Phase
    if (targetAcKw <= 2.5) {
      return (
        singlePhaseInverters.find((i) => i.id === "huawei-sun2000-2ktl-l1") ||
        singlePhaseInverters.find((i) => i.id === "sungrow-sg3-0rs") ||
        singlePhaseInverters[0] ||
        allInverters[0]
      );
    }
    if (targetAcKw <= 3.8) {
      return (
        singlePhaseInverters.find((i) => i.id === "huawei-sun2000-3ktl-l1") ||
        singlePhaseInverters.find((i) => i.id === "sungrow-sg3-0rs") ||
        singlePhaseInverters[0] ||
        allInverters[0]
      );
    }
    if (targetAcKw <= 5.5) {
      return (
        singlePhaseInverters.find((i) => i.id === "huawei-sun2000-5ktl-l1") ||
        singlePhaseInverters.find((i) => i.id === "sungrow-sg5-0rs") ||
        singlePhaseInverters[0] ||
        allInverters[0]
      );
    }
    // 6kW to 10kW 1PH
    return (
      singlePhaseInverters.find((i) => i.id === "huawei-sun2000-6ktl-l1") ||
      singlePhaseInverters.find((i) => i.id === "deye-sun-8k-sg01") ||
      singlePhaseInverters.find((i) => i.id === "sungrow-sg5-0rs") ||
      singlePhaseInverters[0] ||
      allInverters[0]
    );
  }

  // 2. Three-Phase Utility Grid (3PH)
  // Check Philippine 230V 3PH Delta vs 400V 3PH Wye
  if (is3Phase230V && !config.transformer?.enabled) {
    const delta3PhInverters = allInverters.filter(
      (i) => i.phase === "3PH" && i.acVoltage <= 240
    );
    if (delta3PhInverters.length > 0) {
      const sungrowDelta = delta3PhInverters.find((i) => i.id === "sungrow-sg33cx-230v-delta");
      if (sungrowDelta) return sungrowDelta;
      return delta3PhInverters[0];
    }
  }

  // 3. Three-Phase 400V (Standard C&I) or with step-up transformer
  const threePhaseInverters = allInverters.filter(
    (i) => i.phase === "3PH" && i.acVoltage >= 380
  );

  // Hybrid / Storage 3-Phase
  if (isHybridOrStorage || isOffGrid) {
    if (targetAcKw <= 12) {
      return (
        threePhaseInverters.find((i) => i.id === "sungrow-sh10rt-hybrid") ||
        threePhaseInverters.find((i) => i.id === "deye-sun-10k-sg04") ||
        threePhaseInverters.find((i) => i.id === "fronius-symo-gen24-10-0") ||
        threePhaseInverters[0] ||
        allInverters[0]
      );
    }
    if (targetAcKw <= 30) {
      return (
        threePhaseInverters.find((i) => i.id === "sungrow-sh25t-hybrid") ||
        threePhaseInverters.find((i) => i.id === "deye-sun-20k-sg01hp3") ||
        threePhaseInverters[0] ||
        allInverters[0]
      );
    }
    return (
      threePhaseInverters.find((i) => i.id === "deye-sun-50k-sg01hp3") ||
      threePhaseInverters.find((i) => i.id === "sungrow-sh25t-hybrid") ||
      threePhaseInverters[0] ||
      allInverters[0]
    );
  }

  // Standard On-Grid 3-Phase Commercial & Industrial
  // Small C&I (<= 12 kWp, ~10 kW AC)
  if (targetAcKw <= 11) {
    return (
      threePhaseInverters.find((i) => i.id === "huawei-sun2000-10ktl-m1") ||
      threePhaseInverters.find((i) => i.id === "sungrow-sg10rt") ||
      threePhaseInverters[0] ||
      allInverters[0]
    );
  }

  // 12 kW to 18 kWp (~12-15 kW AC)
  if (targetAcKw <= 16) {
    return (
      threePhaseInverters.find((i) => i.id === "huawei-sun2000-15ktl-m2") ||
      threePhaseInverters.find((i) => i.id === "sungrow-sg15rt") ||
      threePhaseInverters[0] ||
      allInverters[0]
    );
  }

  // 18 kW to 25 kWp (~20 kW AC)
  if (targetAcKw <= 24) {
    return (
      threePhaseInverters.find((i) => i.id === "huawei-sun2000-20ktl-m2") ||
      threePhaseInverters.find((i) => i.id === "sungrow-sg20rt") ||
      threePhaseInverters[0] ||
      allInverters[0]
    );
  }

  // 26 kW to 40 kWp (~30 kW AC)
  if (targetAcKw <= 38) {
    return (
      threePhaseInverters.find((i) => i.id === "huawei-sun2000-30ktl-m3") ||
      threePhaseInverters.find((i) => i.id === "sungrow-sg33cx") ||
      threePhaseInverters[0] ||
      allInverters[0]
    );
  }

  // 40 kW to 70 kWp (~50 kW AC)
  if (targetAcKw <= 65) {
    return (
      threePhaseInverters.find((i) => i.id === "huawei-sun2000-50ktl-m3") ||
      threePhaseInverters.find((i) => i.id === "sungrow-sg50cx-p2") ||
      threePhaseInverters[0] ||
      allInverters[0]
    );
  }

  // 70 kW to 250 kWp (Standard 100kW or 110kW C&I tier)
  if (targetAcKw <= 250) {
    return (
      threePhaseInverters.find((i) => i.id === "huawei-sun2000-100ktl-m2") ||
      threePhaseInverters.find((i) => i.id === "sungrow-sg110cx") ||
      threePhaseInverters.find((i) => i.id === "huawei-sun2000-115ktl-m2") ||
      threePhaseInverters[0] ||
      allInverters[0]
    );
  }

  // > 250 kWp to utility scale (Modular 100kW/115kW/125kW or 330kW utility)
  if (targetAcKw > 800) {
    const utility330 = threePhaseInverters.find((i) => i.id === "huawei-sun2000-330ktl-h1");
    if (utility330) return utility330;
  }

  return (
    threePhaseInverters.find((i) => i.id === "huawei-sun2000-100ktl-m2") ||
    threePhaseInverters.find((i) => i.id === "sungrow-sg125hx") ||
    threePhaseInverters.find((i) => i.id === "huawei-sun2000-115ktl-m2") ||
    threePhaseInverters[0] ||
    allInverters[0]
  );
}

/**
 * Main Centralized Calculation Engine for Solar PV Design
 * Automatically sizes all solar equipment, validates against PEC 2017 & safety standards,
 * and seamlessly supports user-editable manual overrides with instant "Reset to Auto".
 */
export function computeSolarDesign(
  config: SolarDesignConfig,
  panel?: PanelConfig,
  circuits?: Circuit[],
  subPanels?: any[]
): SolarCalculationResults {
  const overrides = config.overrides || {};

  // 1. Load Schedule Integration & Target Capacity Calculation
  let connectedLoadKw = 0;
  let maxDemandKw = 0;
  if (panel && circuits && circuits.length > 0) {
    const pValues = computePanelScheduleValues(panel, circuits, { availableSubPanels: subPanels || [] });
    connectedLoadKw = (pValues.totalVA || 0) / 1000;
    const factor = panel.system.includes("3PH") ? Math.sqrt(3) : 1;
    const secV = panel.voltage || 230;
    const maxDemandI = pValues.mainCurrent?.baseAmp || (pValues.mainCurrent?.designAmp ? pValues.mainCurrent.designAmp / 1.25 : 0);
    maxDemandKw = (maxDemandI * secV * factor) / 1000;
    if (maxDemandKw <= 0) maxDemandKw = connectedLoadKw * 0.8;
  } else {
    connectedLoadKw = (config.serviceCapacityAmps * config.utilityVoltage * (config.utilityPhase === "3PH" ? Math.sqrt(3) : 1)) / 1000;
    maxDemandKw = connectedLoadKw * 0.8;
  }

  // Recommended solar capacity (70-90% of daytime peak demand)
  const recommendedSolarKw = Math.max(3.0, Number((maxDemandKw * 0.85).toFixed(1)));

  // Target Solar Capacity in W
  const targetKwp =
    config.sizingMethod === "load_demand"
      ? recommendedSolarKw
      : config.targetCapacityKwp;
  const targetW = targetKwp * 1000;

  // 2. Resolve Active Inverter & Inverter Characteristics (Automatic based on required / needed vs Manual)
  const allInverters = [...DEFAULT_INVERTERS, ...(config.customInverters || [])];
  const recommendedInverter = determineRecommendedInverter(config, targetKwp, allInverters);

  const isInverterAuto =
    !config.selectedInverterId ||
    config.selectedInverterId === "auto" ||
    Boolean(config.autoInverterSelection);

  const selectedInverter = isInverterAuto
    ? recommendedInverter
    : allInverters.find((i) => i.id === config.selectedInverterId) || recommendedInverter;

  // 3. Resolve PV Module Model (Automatic based on required / needed vs Manual)
  const allModules = [...DEFAULT_PV_MODULES, ...(config.customModules || [])];
  const recommendedModule = determineRecommendedModule(config, targetKwp, allModules, selectedInverter);

  const isModuleAuto =
    !config.selectedModuleId ||
    config.selectedModuleId === "auto" ||
    Boolean(config.autoModuleSelection);

  const selectedModule = isModuleAuto
    ? recommendedModule
    : allModules.find((m) => m.id === config.selectedModuleId) || recommendedModule;

  // 4. Temperature Correction Factors (PEC 2017 Art 6.90.7)
  const tMin = config.minOperatingTempC ?? 18;
  const tMax = config.maxOperatingTempC ?? 65;

  const vocCold = Number(
    (selectedModule.voc * (1 + (tMin - 25) * (selectedModule.tempCoeffVoc / 100))).toFixed(2)
  );
  const vmpHot = Number(
    (selectedModule.vmp * (1 + (tMax - 25) * (selectedModule.tempCoeffPmax / 100))).toFixed(2)
  );
  const iscHot = Number(
    (selectedModule.isc * (1 + (tMax - 25) * (selectedModule.tempCoeffIsc / 100))).toFixed(2)
  );
  const imp = selectedModule.imp;

  // 4. Automatic Equipment Sizing: Modules Per String
  // Upper limit by Voc: Max modules where String Voc_cold <= Inverter Max DC Voltage (with 5% buffer)
  const maxModulesByVoc = Math.floor((selectedInverter.maxDcVoltage * 0.95) / Math.max(1, vocCold));
  // Lower limit by Vmp: Min modules where String Vmp_hot >= Inverter MPPT Min Voltage (with 10% buffer)
  const minModulesByVmp = Math.ceil((selectedInverter.mpptVoltageRangeMin * 1.1) / Math.max(1, vmpHot));
  // Nominal target MPPT voltage sweet spot (~620V - 700V for 1000V/1100V systems)
  const targetNominalMpptV = Math.min(selectedInverter.maxDcVoltage * 0.65, selectedInverter.mpptVoltageRangeMax * 0.85);
  const targetSweetSpotModules = Math.round(targetNominalMpptV / Math.max(1, selectedModule.vmp));
  const autoModulesPerString = Math.max(
    minModulesByVmp,
    Math.min(maxModulesByVoc, Math.max(8, Math.min(24, targetSweetSpotModules)))
  );

  // Effective Modules Per String
  const effectiveModulesPerString =
    overrides.modulesPerString !== undefined && overrides.modulesPerString > 0
      ? overrides.modulesPerString
      : autoModulesPerString;

  // 5. Automatic Equipment Sizing: Number of Strings & Total Modules
  const moduleWp = selectedModule.ratedPowerWp || 635;
  const rawCalculatedModules = Math.max(1, Math.ceil(targetW / moduleWp));
  const autoNumberOfStrings = Math.max(1, Math.round(rawCalculatedModules / effectiveModulesPerString));

  const effectiveNumberOfStrings =
    overrides.numberOfStrings !== undefined && overrides.numberOfStrings > 0
      ? overrides.numberOfStrings
      : autoNumberOfStrings;

  const autoTotalModules = effectiveModulesPerString * effectiveNumberOfStrings;
  // Handle manual module override backward compatibility
  const effectiveTotalModules =
    overrides.totalModules !== undefined && overrides.totalModules > 0
      ? overrides.totalModules
      : config.manualModuleOverride && config.totalModules > 0
      ? config.totalModules
      : autoTotalModules;

  const totalDcCapacityW = effectiveTotalModules * moduleWp;
  const totalDcCapacityKwp = Number((totalDcCapacityW / 1000).toFixed(2));

  // Area requirement (m²) = Total Modules × (L × W) + 20% walkway factor
  const singleModuleAreaM2 = ((selectedModule.lengthMm || 2278) * (selectedModule.widthMm || 1134)) / 1_000_000;
  const areaRequiredM2 = Number((effectiveTotalModules * singleModuleAreaM2 * 1.2).toFixed(1));

  // String Electrical Output
  const stringVoc = Number((effectiveModulesPerString * vocCold).toFixed(1));
  const stringVmp = Number((effectiveModulesPerString * vmpHot).toFixed(1));
  const stringIsc = iscHot;
  const stringImp = imp;
  const totalDcCurrent = Number((effectiveNumberOfStrings * imp).toFixed(1));

  // 6. Automatic Equipment Sizing: Inverter Quantity
  // Target ideal DC/AC ratio ~ 1.20
  const idealAcCapacityKw = totalDcCapacityKwp / 1.20;
  const autoInverterQuantity = Math.max(1, Math.round(idealAcCapacityKw / selectedInverter.ratedAcPowerKw));

  const effectiveInverterQuantity =
    overrides.inverterQuantity !== undefined && overrides.inverterQuantity > 0
      ? overrides.inverterQuantity
      : autoInverterQuantity;

  const totalInverterAcKw = Number((effectiveInverterQuantity * selectedInverter.ratedAcPowerKw).toFixed(1));
  const dcAcRatio = totalInverterAcKw > 0 ? Number((totalDcCapacityKwp / totalInverterAcKw).toFixed(2)) : 1.0;

  // Inverter AC output currents
  const is3PhaseInv = selectedInverter.phase === "3PH";
  const invAcV = selectedInverter.acVoltage || (is3PhaseInv ? 400 : 230);
  const invFactor = is3PhaseInv ? Math.sqrt(3) : 1;
  const singleInvRatedAcCurrent = (selectedInverter.ratedAcPowerKw * 1000) / (invAcV * invFactor);
  const singleInvMaxAcCurrent = selectedInverter.maxAcCurrent || singleInvRatedAcCurrent * 1.1;
  const totalSystemAcCurrent = Number((effectiveInverterQuantity * singleInvMaxAcCurrent).toFixed(1));

  // 7. Automatic Equipment Sizing: DC Protection & Combiner
  // DC Fuse: min 1.56 × String Isc (PEC 6.90.8 / 6.90.9)
  const minFuseAmps = stringIsc * 1.56;
  const autoDcFuseRatingAmps = getNextStandardBreaker(minFuseAmps);
  const effectiveDcFuseRatingAmps =
    overrides.dcFuseRatingAmps !== undefined && overrides.dcFuseRatingAmps > 0
      ? overrides.dcFuseRatingAmps
      : autoDcFuseRatingAmps;

  // DC Isolator: min 1.56 × String Isc
  const autoDcIsolatorRatingAmps = getNextStandardBreaker(stringIsc * 1.56);
  const effectiveDcIsolatorRatingAmps =
    overrides.dcIsolatorRatingAmps !== undefined && overrides.dcIsolatorRatingAmps > 0
      ? overrides.dcIsolatorRatingAmps
      : autoDcIsolatorRatingAmps;

  // DC SPD: Min continuous operating voltage Uc >= 1.2 × String Voc
  const autoDcSpdUcVolts = Math.ceil(stringVoc * 1.2);
  const effectiveDcSpdUcVolts =
    overrides.dcSpdUcVolts !== undefined && overrides.dcSpdUcVolts > 0
      ? overrides.dcSpdUcVolts
      : autoDcSpdUcVolts;

  // DC Equipment Grounding Conductor (EGC)
  const autoDcEgcSizeMm2 = Math.max(5.5, getStandardEgcSize(effectiveDcFuseRatingAmps));
  const effectiveDcEgcSizeMm2 =
    overrides.dcEgcSizeMm2 !== undefined && overrides.dcEgcSizeMm2 > 0
      ? overrides.dcEgcSizeMm2
      : autoDcEgcSizeMm2;

  // 8. Automatic Equipment Sizing: DC Cable & Conduit
  const dcLength = config.cabling.dcCable.lengthM || 35;
  const dcTempFactor = config.cabling.dcCable.tempCorrectionFactor || 0.88;
  const dcMaxDrop = config.cabling.dcMaxDropPercent || 1.5;

  const autoDcCableResult = autoSizeDcCable(stringImp, stringVmp, dcLength, dcMaxDrop, dcTempFactor);
  const effectiveDcCableSizeMm2 =
    overrides.dcCableSizeMm2 !== undefined && overrides.dcCableSizeMm2 > 0
      ? overrides.dcCableSizeMm2
      : autoDcCableResult.conductorSizeMm2;

  const autoDcConduitSizeMm = getStandardConduitSize(effectiveDcCableSizeMm2, 2);
  const effectiveDcConduitSizeMm =
    overrides.dcConduitSizeMm !== undefined && overrides.dcConduitSizeMm > 0
      ? overrides.dcConduitSizeMm
      : autoDcConduitSizeMm;

  // DC Cable effective performance
  const dcR = WIRE_RESISTANCE_75C[effectiveDcCableSizeMm2] || 3.47;
  const dcCableAmpacity = Number(((WIRE_AMPACITY_COPPER_90C[effectiveDcCableSizeMm2] || 55) * dcTempFactor).toFixed(1));
  const dcVoltageDropV = Number((2 * stringImp * dcLength * (dcR / 1000)).toFixed(2));
  const dcVoltageDropPercent = stringVmp > 0 ? Number(((dcVoltageDropV / stringVmp) * 100).toFixed(2)) : 0;

  // 9. Automatic Equipment Sizing: AC Protection
  // Breaker continuous rating: 125% of Inverter Maximum AC Current (PEC 6.90.8)
  const minAcBreakerAmps = singleInvMaxAcCurrent * 1.25;
  const autoAcBreakerAtAmps = getNextStandardBreaker(minAcBreakerAmps);
  const effectiveAcBreakerAtAmps =
    overrides.acBreakerAtAmps !== undefined && overrides.acBreakerAtAmps > 0
      ? overrides.acBreakerAtAmps
      : config.acProtection.isManualOverride && config.acProtection.atAmps
      ? config.acProtection.atAmps
      : autoAcBreakerAtAmps;

  const autoAcBreakerAfAmps = Math.max(
    effectiveAcBreakerAtAmps,
    effectiveAcBreakerAtAmps > 225 ? 400 : effectiveAcBreakerAtAmps > 100 ? 225 : 100
  );
  const effectiveAcBreakerAfAmps =
    overrides.acBreakerAfAmps !== undefined && overrides.acBreakerAfAmps > 0
      ? overrides.acBreakerAfAmps
      : autoAcBreakerAfAmps;

  const autoAcBreakerPoles = is3PhaseInv ? 3 : 2;
  const effectiveAcBreakerPoles =
    overrides.acBreakerPoles !== undefined && overrides.acBreakerPoles > 0
      ? overrides.acBreakerPoles
      : autoAcBreakerPoles;

  const autoAcIsolatorRatingAmps = getNextStandardBreaker(singleInvMaxAcCurrent * 1.25);
  const effectiveAcIsolatorRatingAmps =
    overrides.acIsolatorRatingAmps !== undefined && overrides.acIsolatorRatingAmps > 0
      ? overrides.acIsolatorRatingAmps
      : autoAcIsolatorRatingAmps;

  const autoAcKaic = config.projectType === "commercial" ? 35 : 18;
  const effectiveAcKaic =
    overrides.acKaic !== undefined && overrides.acKaic > 0
      ? overrides.acKaic
      : autoAcKaic;

  // AC system (single-phase vs three-phase) and the highest line current at the interconnection
  const acSystem = computeAcSystem(config, selectedInverter, effectiveInverterQuantity, singleInvMaxAcCurrent);

  // Main Solar Disconnect at MDP (aggregating all inverters): 125% of the highest line current
  const acMainDisconnectAmps = getNextStandardBreaker(acSystem.interconnectionLineCurrent * 1.25);

  // 10. Automatic Equipment Sizing: AC Cable, Conduit & EGC
  const acLength = config.cabling.acCable.lengthM || 40;
  const acTempFactor = config.cabling.acCable.tempCorrectionFactor || 0.91;
  const acMaxDrop = config.cabling.acMaxDropPercent || 1.5;

  const autoAcCableResult = autoSizeAcCable(singleInvMaxAcCurrent, invAcV, is3PhaseInv, acLength, acMaxDrop, acTempFactor);
  const effectiveAcCableSizeMm2 =
    overrides.acCableSizeMm2 !== undefined && overrides.acCableSizeMm2 > 0
      ? overrides.acCableSizeMm2
      : autoAcCableResult.conductorSizeMm2;

  const autoAcConduitSizeMm = getStandardConduitSize(effectiveAcCableSizeMm2, acSystem.currentCarryingConductors + 1);
  const effectiveAcConduitSizeMm =
    overrides.acConduitSizeMm !== undefined && overrides.acConduitSizeMm > 0
      ? overrides.acConduitSizeMm
      : autoAcConduitSizeMm;

  const autoAcEgcSizeMm2 = getStandardEgcSize(effectiveAcBreakerAtAmps);
  const effectiveAcEgcSizeMm2 =
    overrides.acEgcSizeMm2 !== undefined && overrides.acEgcSizeMm2 > 0
      ? overrides.acEgcSizeMm2
      : autoAcEgcSizeMm2;

  // AC Cable effective performance
  const acR = WIRE_RESISTANCE_75C[effectiveAcCableSizeMm2] || 0.21;
  const acCableAmpacity = Number(((WIRE_AMPACITY_COPPER_90C[effectiveAcCableSizeMm2] || 230) * acTempFactor).toFixed(1));
  const acMultiplier = is3PhaseInv ? Math.sqrt(3) : 2;
  const acVoltageDropV = Number(((acMultiplier * singleInvMaxAcCurrent * acLength * (acR / 1000))).toFixed(2));
  const acVoltageDropPercent = invAcV > 0 ? Number(((acVoltageDropV / invAcV) * 100).toFixed(2)) : 0;

  // 11. Automatic Equipment Sizing: Transformer (if required)
  const autoTransformerResult = autoSizeTransformer(
    totalInverterAcKw,
    config.utilityVoltage || 230,
    invAcV,
    acSystem.service !== "1PH-2W"
  );
  const effectiveTransformerKva =
    overrides.transformerKva !== undefined && overrides.transformerKva > 0
      ? overrides.transformerKva
      : autoTransformerResult.kva;
  const effectiveTransformerPrimaryBreaker =
    overrides.transformerPrimaryBreaker !== undefined && overrides.transformerPrimaryBreaker > 0
      ? overrides.transformerPrimaryBreaker
      : autoTransformerResult.primaryBreaker;
  const effectiveTransformerSecondaryBreaker =
    overrides.transformerSecondaryBreaker !== undefined && overrides.transformerSecondaryBreaker > 0
      ? overrides.transformerSecondaryBreaker
      : autoTransformerResult.secondaryBreaker;

  // 12. Battery Sizing (Off-Grid / Hybrid)
  const batt = config.battery;
  const backupLoadKw = batt.requiredBackupLoadKw || 25;
  const backupHours = batt.backupHours || 4;
  const dod = (batt.dodPercent || 90) / 100;
  const battEff = (batt.efficiencyPercent || 95) / 100;
  const batteryEnergyKwhRequired = Number(((backupLoadKw * backupHours) / (dod * battEff)).toFixed(1));
  const battUnitKwh = batt.energyKwh || 4.8;
  const batteryUnitsCalculated = Math.max(1, Math.ceil(batteryEnergyKwhRequired / battUnitKwh));

  const effectiveBatteryUnits =
    overrides.batteryUnits !== undefined && overrides.batteryUnits > 0
      ? overrides.batteryUnits
      : batt.units || batteryUnitsCalculated;

  const totalBattKwh = effectiveBatteryUnits * battUnitKwh;
  const batteryUsableEnergyKwh = Number((totalBattKwh * dod * battEff).toFixed(1));
  const batteryCapacityAhRequired = Number(((batteryEnergyKwhRequired * 1000) / (batt.voltageV || 48)).toFixed(0));
  const batteryBackupHoursActual = backupLoadKw > 0 ? Number((batteryUsableEnergyKwh / backupLoadKw).toFixed(1)) : 0;

  // 13. Net Grid Demand Integration
  const estimatedSolarPeakGenerationKw = Number((totalInverterAcKw * 0.95).toFixed(1));
  const netRemainingGridDemandKw = Number(Math.max(0, maxDemandKw - estimatedSolarPeakGenerationKw).toFixed(1));

  // 14. Assembly of Auto vs Overridden Tracking Maps
  const autoValues: SolarEquipmentAutoValues = {
    modulesPerString: autoModulesPerString,
    numberOfStrings: autoNumberOfStrings,
    totalModules: autoTotalModules,
    inverterQuantity: autoInverterQuantity,
    dcFuseRatingAmps: autoDcFuseRatingAmps,
    dcIsolatorRatingAmps: autoDcIsolatorRatingAmps,
    dcSpdUcVolts: autoDcSpdUcVolts,
    dcEgcSizeMm2: autoDcEgcSizeMm2,
    dcCableSizeMm2: autoDcCableResult.conductorSizeMm2,
    dcConduitSizeMm: autoDcConduitSizeMm,
    acBreakerAtAmps: autoAcBreakerAtAmps,
    acBreakerAfAmps: autoAcBreakerAfAmps,
    acBreakerPoles: autoAcBreakerPoles,
    acIsolatorRatingAmps: autoAcIsolatorRatingAmps,
    acKaic: autoAcKaic,
    acCableSizeMm2: autoAcCableResult.conductorSizeMm2,
    acConduitSizeMm: autoAcConduitSizeMm,
    acEgcSizeMm2: autoAcEgcSizeMm2,
    transformerKva: autoTransformerResult.kva,
    transformerPrimaryBreaker: autoTransformerResult.primaryBreaker,
    transformerSecondaryBreaker: autoTransformerResult.secondaryBreaker,
    batteryUnits: batteryUnitsCalculated,
  };

  const effective: SolarEquipmentEffectiveValues = {
    modulesPerString: effectiveModulesPerString,
    numberOfStrings: effectiveNumberOfStrings,
    totalModules: effectiveTotalModules,
    inverterQuantity: effectiveInverterQuantity,
    dcFuseRatingAmps: effectiveDcFuseRatingAmps,
    dcIsolatorRatingAmps: effectiveDcIsolatorRatingAmps,
    dcSpdUcVolts: effectiveDcSpdUcVolts,
    dcEgcSizeMm2: effectiveDcEgcSizeMm2,
    dcCableSizeMm2: effectiveDcCableSizeMm2,
    dcConduitSizeMm: effectiveDcConduitSizeMm,
    acBreakerAtAmps: effectiveAcBreakerAtAmps,
    acBreakerAfAmps: effectiveAcBreakerAfAmps,
    acBreakerPoles: effectiveAcBreakerPoles,
    acIsolatorRatingAmps: effectiveAcIsolatorRatingAmps,
    acKaic: effectiveAcKaic,
    acCableSizeMm2: effectiveAcCableSizeMm2,
    acConduitSizeMm: effectiveAcConduitSizeMm,
    acEgcSizeMm2: effectiveAcEgcSizeMm2,
    transformerKva: effectiveTransformerKva,
    transformerPrimaryBreaker: effectiveTransformerPrimaryBreaker,
    transformerSecondaryBreaker: effectiveTransformerSecondaryBreaker,
    batteryUnits: effectiveBatteryUnits,
  };

  const isOverridden: Record<keyof SolarDesignOverrides, boolean> = {
    modulesPerString: overrides.modulesPerString !== undefined,
    numberOfStrings: overrides.numberOfStrings !== undefined,
    totalModules: overrides.totalModules !== undefined || Boolean(config.manualModuleOverride && config.totalModules > 0),
    inverterQuantity: overrides.inverterQuantity !== undefined,
    dcFuseRatingAmps: overrides.dcFuseRatingAmps !== undefined,
    dcIsolatorRatingAmps: overrides.dcIsolatorRatingAmps !== undefined,
    dcSpdUcVolts: overrides.dcSpdUcVolts !== undefined,
    dcEgcSizeMm2: overrides.dcEgcSizeMm2 !== undefined,
    dcCableSizeMm2: overrides.dcCableSizeMm2 !== undefined,
    dcConduitSizeMm: overrides.dcConduitSizeMm !== undefined,
    acBreakerAtAmps: overrides.acBreakerAtAmps !== undefined || Boolean(config.acProtection.isManualOverride && config.acProtection.atAmps),
    acBreakerAfAmps: overrides.acBreakerAfAmps !== undefined,
    acBreakerPoles: overrides.acBreakerPoles !== undefined,
    acIsolatorRatingAmps: overrides.acIsolatorRatingAmps !== undefined,
    acKaic: overrides.acKaic !== undefined,
    acCableSizeMm2: overrides.acCableSizeMm2 !== undefined,
    acConduitSizeMm: overrides.acConduitSizeMm !== undefined,
    acEgcSizeMm2: overrides.acEgcSizeMm2 !== undefined,
    transformerKva: overrides.transformerKva !== undefined,
    transformerPrimaryBreaker: overrides.transformerPrimaryBreaker !== undefined,
    transformerSecondaryBreaker: overrides.transformerSecondaryBreaker !== undefined,
    batteryUnits: overrides.batteryUnits !== undefined,
  };

  const overrideCount = Object.values(isOverridden).filter(Boolean).length;

  // 15. Engineering Validations & Warnings (Running against EFFECTIVE values)
  const warnings: string[] = [];
  const fieldWarnings: Partial<Record<keyof SolarDesignOverrides, string>> = {};

  // Check 1: String Voc vs Inverter Max DC Voltage (PEC 6.90.7)
  const vocWithinMaxDcVoltage = stringVoc <= selectedInverter.maxDcVoltage;
  if (!vocWithinMaxDcVoltage) {
    const msg = `CRITICAL: String Voc (${stringVoc}V at cold ${tMin}°C) exceeds Inverter Max DC Voltage (${selectedInverter.maxDcVoltage}V)! Reduce modules per string.`;
    warnings.push(msg);
    fieldWarnings.modulesPerString = `Voc (${stringVoc}V) > Inverter Max DC (${selectedInverter.maxDcVoltage}V)`;
  }

  // Check 2: String Vmp within Inverter MPPT operating range
  const vmpWithinMpptRange =
    stringVmp >= selectedInverter.mpptVoltageRangeMin &&
    stringVmp <= selectedInverter.mpptVoltageRangeMax;
  if (!vmpWithinMpptRange) {
    const msg = `WARNING: String Vmp (${stringVmp}V at ${tMax}°C) is outside MPPT operating range (${selectedInverter.mpptVoltageRangeMin}V - ${selectedInverter.mpptVoltageRangeMax}V).`;
    warnings.push(msg);
    if (!fieldWarnings.modulesPerString) {
      fieldWarnings.modulesPerString = `Vmp (${stringVmp}V) outside MPPT window (${selectedInverter.mpptVoltageRangeMin}V-${selectedInverter.mpptVoltageRangeMax}V)`;
    }
  }

  // Check 3: String Imp vs MPPT Max Input Current
  const stringsPerMppt = Math.max(1, Math.ceil(effectiveNumberOfStrings / (effectiveInverterQuantity * selectedInverter.numMppts)));
  const currentPerMppt = stringImp * stringsPerMppt;
  const stringCurrentWithinMpptMax = currentPerMppt <= selectedInverter.maxInputCurrentPerMppt * 1.1;
  if (!stringCurrentWithinMpptMax) {
    const msg = `WARNING: DC Current per MPPT (${currentPerMppt.toFixed(1)}A) exceeds inverter max rating (${selectedInverter.maxInputCurrentPerMppt}A). Current clipping will occur.`;
    warnings.push(msg);
    fieldWarnings.numberOfStrings = `DC Current per MPPT (${currentPerMppt.toFixed(1)}A) exceeds inverter max (${selectedInverter.maxInputCurrentPerMppt}A)`;
  }

  // Check 4: String count vs total inverter capacity
  const maxStringsSupported = effectiveInverterQuantity * selectedInverter.numMppts * 2;
  const stringsWithinInverterCapacity = effectiveNumberOfStrings <= maxStringsSupported;
  if (!stringsWithinInverterCapacity) {
    const msg = `WARNING: Number of strings (${effectiveNumberOfStrings}) exceeds total inverter MPPT input capacity (${maxStringsSupported} max strings). Add more inverters.`;
    warnings.push(msg);
    fieldWarnings.inverterQuantity = `Need more inverters: strings (${effectiveNumberOfStrings}) > capacity (${maxStringsSupported})`;
  }

  // Check 5: DC/AC Ratio
  const dcAcRatioValid = dcAcRatio >= 0.85 && dcAcRatio <= 1.45;
  if (dcAcRatio > 1.45) {
    const msg = `NOTICE: High DC/AC Ratio (${dcAcRatio}). Consider adding inverter capacity to avoid peak clipping.`;
    warnings.push(msg);
    fieldWarnings.inverterQuantity = `High DC/AC Ratio (${dcAcRatio}) - Add inverters to prevent clipping`;
  } else if (dcAcRatio < 0.85) {
    const msg = `NOTICE: Low DC/AC Ratio (${dcAcRatio}). Inverter capacity may be underutilized.`;
    warnings.push(msg);
  }

  // Check 6: Voltage Drop Limits (PEC recommends ≤ 1.5% for DC, ≤ 1.5% for AC)
  const dcVoltageDropValid = dcVoltageDropPercent <= dcMaxDrop;
  if (!dcVoltageDropValid) {
    const msg = `WARNING: DC Voltage Drop (${dcVoltageDropPercent}%) exceeds limit of ${dcMaxDrop}%. Increase DC cable size or shorten run.`;
    warnings.push(msg);
    fieldWarnings.dcCableSizeMm2 = `Excessive DC voltage drop (${dcVoltageDropPercent}% > ${dcMaxDrop}%)`;
  }

  const acVoltageDropValid = acVoltageDropPercent <= acMaxDrop;
  if (!acVoltageDropValid) {
    const msg = `WARNING: AC Voltage Drop (${acVoltageDropPercent}%) exceeds limit of ${acMaxDrop}%. Increase AC cable size or shorten run.`;
    warnings.push(msg);
    fieldWarnings.acCableSizeMm2 = `Excessive AC voltage drop (${acVoltageDropPercent}% > ${acMaxDrop}%)`;
  }

  // Check 7: Cable Ampacity Checks (PEC continuous rating 1.56x for DC, 1.25x for AC)
  const dcCableAmpacityValid = dcCableAmpacity >= stringIsc * 1.56;
  if (!dcCableAmpacityValid) {
    const msg = `CRITICAL: DC cable ampacity (${dcCableAmpacity.toFixed(1)}A) is less than required 1.56 × Isc (${(stringIsc * 1.56).toFixed(1)}A).`;
    warnings.push(msg);
    fieldWarnings.dcCableSizeMm2 = `Undersized DC Cable: Ampacity (${dcCableAmpacity.toFixed(1)}A) < required (${(stringIsc * 1.56).toFixed(1)}A)`;
  }

  const acCableAmpacityValid = acCableAmpacity >= singleInvMaxAcCurrent * 1.25;
  if (!acCableAmpacityValid) {
    const msg = `CRITICAL: AC cable ampacity (${acCableAmpacity.toFixed(1)}A) is less than required 1.25 × Iac (${(singleInvMaxAcCurrent * 1.25).toFixed(1)}A).`;
    warnings.push(msg);
    fieldWarnings.acCableSizeMm2 = `Undersized AC Cable: Ampacity (${acCableAmpacity.toFixed(1)}A) < required (${(singleInvMaxAcCurrent * 1.25).toFixed(1)}A)`;
  }

  // Check 8: AC Breaker
  const acBreakerAdequate = effectiveAcBreakerAtAmps >= singleInvMaxAcCurrent * 1.25;
  if (!acBreakerAdequate) {
    const msg = `WARNING: Selected AC breaker (${effectiveAcBreakerAtAmps}A AT) is below recommended 125% continuous duty (${(singleInvMaxAcCurrent * 1.25).toFixed(1)}A).`;
    warnings.push(msg);
    fieldWarnings.acBreakerAtAmps = `Breaker (${effectiveAcBreakerAtAmps}A) < 125% continuous duty (${(singleInvMaxAcCurrent * 1.25).toFixed(1)}A)`;
  }

  // Check 9: Battery Capacity (if enabled)
  const batteryCapacityAdequate = !config.battery.enabled || (totalBattKwh >= batteryEnergyKwhRequired * 0.95);
  if (config.battery.enabled && !batteryCapacityAdequate) {
    const msg = `WARNING: Battery bank capacity (${totalBattKwh.toFixed(1)} kWh) is below required ${batteryEnergyKwhRequired.toFixed(1)} kWh for ${backupHours}h backup.`;
    warnings.push(msg);
    fieldWarnings.batteryUnits = `Battery capacity (${totalBattKwh.toFixed(1)}kWh) < required (${batteryEnergyKwhRequired.toFixed(1)}kWh)`;
  }

  // Check 10: Conduit sizing check
  const conduitFillValid =
    effectiveAcConduitSizeMm >= autoAcConduitSizeMm && effectiveDcConduitSizeMm >= autoDcConduitSizeMm;
  if (!conduitFillValid) {
    if (effectiveAcConduitSizeMm < autoAcConduitSizeMm) {
      warnings.push(`WARNING: AC Conduit size (${effectiveAcConduitSizeMm}mm) is smaller than recommended minimum (${autoAcConduitSizeMm}mm) per 40% fill rule.`);
      fieldWarnings.acConduitSizeMm = `Conduit size (${effectiveAcConduitSizeMm}mm) exceeds 40% fill (min ${autoAcConduitSizeMm}mm)`;
    }
    if (effectiveDcConduitSizeMm < autoDcConduitSizeMm) {
      warnings.push(`WARNING: DC Conduit size (${effectiveDcConduitSizeMm}mm) is smaller than recommended minimum (${autoDcConduitSizeMm}mm).`);
      fieldWarnings.dcConduitSizeMm = `DC conduit undersized (min ${autoDcConduitSizeMm}mm)`;
    }
  }

  // Check 11: Inverter phase / voltage vs utility service
  const utilityV = config.utilityVoltage || 230;
  let phaseCompatible = true;
  if (acSystem.inverterIs3Phase && acSystem.service === "1PH-2W") {
    phaseCompatible = false;
    warnings.push(`ERROR: Three-phase inverter (${selectedInverter.model}) cannot connect to a single-phase ${utilityV}V service. Select a single-phase inverter or change the service to three-phase.`);
  } else if (acSystem.inverterIs3Phase && Math.abs(invAcV - utilityV) > 0.1 * utilityV && !config.transformer?.enabled) {
    phaseCompatible = false;
    warnings.push(`WARNING: Inverter AC voltage (${invAcV}V) does not match the ${utilityV}V three-phase service. Enable the transformer or select a ${utilityV}V inverter.`);
  } else if (!acSystem.inverterIs3Phase && acSystem.service === "3PH-4W" && Math.abs(invAcV - utilityV / Math.sqrt(3)) > 0.1 * (utilityV / Math.sqrt(3)) && !config.transformer?.enabled) {
    phaseCompatible = false;
    warnings.push(`WARNING: Single-phase inverter (${invAcV}V) does not match the ${Math.round(utilityV / Math.sqrt(3))}V line-to-neutral voltage of the ${utilityV}V service.`);
  } else if (!acSystem.inverterIs3Phase && acSystem.service !== "3PH-4W" && Math.abs(invAcV - utilityV) > 0.1 * utilityV && !config.transformer?.enabled) {
    phaseCompatible = false;
    warnings.push(`WARNING: Single-phase inverter (${invAcV}V) does not match the ${utilityV}V service.`);
  }

  // Solar back-feed device at the panel (120% busbar rule)
  const interconnectionBackfeedSource: SolarCalculationResults["interconnectionBackfeedSource"] = config.transformer?.enabled
    ? "transformer-secondary"
    : effectiveInverterQuantity > 1
      ? "solar-main-disconnect"
      : "inverter-breaker";
  const interconnectionBackfeedAmps =
    interconnectionBackfeedSource === "transformer-secondary"
      ? effectiveTransformerSecondaryBreaker
      : interconnectionBackfeedSource === "solar-main-disconnect"
        ? acMainDisconnectAmps
        : effectiveAcBreakerAtAmps;

  const validations = {
    vocWithinMaxDcVoltage,
    vmpWithinMpptRange,
    stringCurrentWithinMpptMax,
    stringsWithinInverterCapacity,
    dcAcRatioValid,
    dcVoltageDropValid,
    acVoltageDropValid,
    dcCableAmpacityValid,
    acCableAmpacityValid,
    acBreakerAdequate,
    batteryCapacityAdequate,
    conduitFillValid,
    phaseCompatible,
  };

  const validationValues = Object.values(validations);
  const passCount = validationValues.filter(Boolean).length;
  const totalChecks = validationValues.length;

  const results: SolarCalculationResults = {
    selectedModule,
    isModuleAuto,
    recommendedModule,
    calculatedModules: rawCalculatedModules,
    totalModules: effectiveTotalModules,
    totalDcCapacityW,
    totalDcCapacityKwp,
    areaRequiredM2,

    modulesPerString: effectiveModulesPerString,
    numberOfStrings: effectiveNumberOfStrings,

    vocCold,
    vmpHot,
    iscHot,
    imp,
    stringVoc,
    stringVmp,
    stringIsc,
    stringImp,
    totalDcCurrent,

    selectedInverter,
    isInverterAuto,
    recommendedInverter,
    inverterQuantity: effectiveInverterQuantity,
    totalInverterAcKw,
    dcAcRatio,
    inverterRatedAcCurrent: Number(singleInvRatedAcCurrent.toFixed(1)),
    inverterMaxAcCurrent: Number(singleInvMaxAcCurrent.toFixed(1)),
    totalSystemAcCurrent,

    acSystem,
    interconnectionBackfeedAmps,
    interconnectionBackfeedSource,

    batteryEnergyKwhRequired,
    batteryCapacityAhRequired,
    batteryUnitsCalculated,
    batteryUsableEnergyKwh,
    batteryBackupHoursActual,

    dcFuseRecommendedAmps: effectiveDcFuseRatingAmps,
    dcIsolatorRecommendedAmps: effectiveDcIsolatorRatingAmps,
    dcSpdUcMinVolts: effectiveDcSpdUcVolts,
    acBreakerRecommendedAmps: effectiveAcBreakerAtAmps,
    acBreakerAfRecommended: effectiveAcBreakerAfAmps,
    acMainDisconnectAmps,

    dcCableAmpacity,
    dcVoltageDropV,
    dcVoltageDropPercent,
    acCableAmpacity,
    acVoltageDropV,
    acVoltageDropPercent,

    connectedLoadKw: Number(connectedLoadKw.toFixed(1)),
    maxDemandKw: Number(maxDemandKw.toFixed(1)),
    recommendedSolarKw,
    estimatedSolarPeakGenerationKw,
    netRemainingGridDemandKw,

    autoValues,
    effective,
    isOverridden,
    overrideCount,

    validations,
    warnings,
    fieldWarnings,
    passCount,
    totalChecks,
  };

  results.bomItems =
    config.bomItems && config.bomItems.length > 0
      ? config.bomItems
      : generateSolarBOM(config, results);

  return results;
}

// ==========================================
// 7. AUTOMATED SOLAR BOM GENERATOR
// ==========================================
export function generateSolarBOM(
  config: SolarDesignConfig,
  calc: SolarCalculationResults
): SolarBOMItem[] {
  const items: SolarBOMItem[] = [];
  const eff = calc.effective;

  // 1. PV Modules
  items.push({
    id: "bom-pv-modules",
    category: "PV Equipment",
    itemDescription: `Monocrystalline N-Type Solar PV Module ${calc.selectedModule.ratedPowerWp}Wp`,
    manufacturer: calc.selectedModule.manufacturer,
    model: calc.selectedModule.model,
    quantity: eff.totalModules,
    unit: "pcs",
    unitCostPhp: Math.round(calc.selectedModule.ratedPowerWp * 14.5), // approx 14.5 PHP/Wp
    markupPercent: 15,
    totalCostPhp: 0,
  });

  // 2. Solar Inverters
  const invTypeLabel =
    config.systemType === "hybrid"
      ? "Hybrid Storage (BESS)"
      : config.systemType === "off-grid"
      ? "Off-Grid Islanding"
      : "Grid-Tied On-Grid";

  items.push({
    id: "bom-inverters",
    category: "PV Equipment",
    itemDescription: `${invTypeLabel} Solar Inverter ${calc.selectedInverter.ratedAcPowerKw}kW ${calc.selectedInverter.phase} ${calc.selectedInverter.acVoltage}V`,
    manufacturer: calc.selectedInverter.manufacturer,
    model: calc.selectedInverter.model,
    quantity: eff.inverterQuantity,
    unit: "sets",
    unitCostPhp: Math.round(calc.selectedInverter.ratedAcPowerKw * 5200), // approx 5,200 PHP/kW
    markupPercent: 15,
    totalCostPhp: 0,
  });

  // 3. Battery Storage (if enabled)
  if (config.battery.enabled) {
    const battUnits = eff.batteryUnits;
    items.push({
      id: "bom-battery",
      category: "PV Equipment",
      itemDescription: `Lithium Iron Phosphate (LiFePO4) Battery Module ${config.battery.energyKwh}kWh ${config.battery.voltageV}V`,
      manufacturer: config.battery.manufacturer,
      model: config.battery.model,
      quantity: battUnits,
      unit: "units",
      unitCostPhp: Math.round(config.battery.energyKwh * 24000), // ~24,000 PHP per kWh LFP
      markupPercent: 15,
      totalCostPhp: 0,
    });
  }

  // 4. Mounting Structure
  const mountingDesc =
    config.roofType === "gi_sheet"
      ? "Aluminum Rail & L-Foot Mounting System for Corrugated / GI Roof"
      : config.roofType === "concrete_slab"
      ? "Ballasted / Tilted Triangular Aluminum Rack for Concrete Flat Roof"
      : "Ground-Mount Galvanized Steel / Aluminum High-Strength Framing";

  items.push({
    id: "bom-mounting",
    category: "Mounting & Structure",
    itemDescription: mountingDesc,
    manufacturer: "Tier-1 Mounting",
    model: "SolarRail AL6005-T5",
    quantity: eff.totalModules,
    unit: "sets",
    unitCostPhp: 1250,
    markupPercent: 15,
    totalCostPhp: 0,
  });

  // 5. DC Combiner Box & Protection
  if (config.dcProtection.combinerBoxRequired) {
    const combinerBoxes = Math.max(1, Math.ceil(eff.numberOfStrings / 4));
    items.push({
      id: "bom-dc-combiner",
      category: "DC Equipment",
      itemDescription: `DC Combiner Box IP65 with Fuses, Isolator, and Type II SPD (1000V DC)`,
      manufacturer: "Chint / Suntree",
      model: "SCB-4IN-1OUT 1000V",
      quantity: combinerBoxes,
      unit: "sets",
      unitCostPhp: 8500,
      markupPercent: 15,
      totalCostPhp: 0,
    });
  }

  // 6. DC Fuses
  items.push({
    id: "bom-dc-fuses",
    category: "DC Equipment",
    itemDescription: `1000V DC Photovoltaic Fuse Link & Holder ${eff.dcFuseRatingAmps}A 10x38mm`,
    manufacturer: "Eaton Bussmann / Suntree",
    model: "PV-10M 1000VDC",
    quantity: eff.numberOfStrings * 2, // Positive & Negative poles
    unit: "pcs",
    unitCostPhp: 380,
    markupPercent: 15,
    totalCostPhp: 0,
  });

  // 7. DC Isolator / Disconnect
  items.push({
    id: "bom-dc-isolator",
    category: "DC Equipment",
    itemDescription: `Rotary DC Disconnect Switch ${eff.dcIsolatorRatingAmps}A 1000V 4-Pole IP66`,
    manufacturer: "Socomed / Suntree",
    model: "SISO-32 1000V",
    quantity: Math.max(1, eff.inverterQuantity * 2),
    unit: "sets",
    unitCostPhp: 3200,
    markupPercent: 15,
    totalCostPhp: 0,
  });

  // 8. DC SPD
  items.push({
    id: "bom-dc-spd",
    category: "DC Equipment",
    itemDescription: `Photovoltaic DC Surge Protective Device (SPD) Type 2 Uc=${eff.dcSpdUcVolts}V`,
    manufacturer: "OBO Bettermann / Suntree",
    model: "V20-C 1000V DC",
    quantity: Math.max(1, eff.inverterQuantity),
    unit: "sets",
    unitCostPhp: 2800,
    markupPercent: 15,
    totalCostPhp: 0,
  });

  // 9. MC4 Connectors
  items.push({
    id: "bom-mc4",
    category: "DC Equipment",
    itemDescription: `MC4 Solar Connectors Male/Female Pairs IP68 1500V DC`,
    manufacturer: "Staubli / Genuine",
    model: "MC4-Evo2",
    quantity: eff.numberOfStrings * 4 + 10,
    unit: "pairs",
    unitCostPhp: 110,
    markupPercent: 15,
    totalCostPhp: 0,
  });

  // 10. DC Solar Cable
  const totalDcMeters = eff.numberOfStrings * (config.cabling.dcCable.lengthM || 35) * 2;
  items.push({
    id: "bom-dc-cable",
    category: "Wiring & Conduit",
    itemDescription: `${eff.dcCableSizeMm2} mm² PV1-F / H1Z2Z2-K UV Double-Insulated Solar Cable`,
    manufacturer: "KBE / Lapp / Phelps Dodge",
    model: `H1Z2Z2-K 1x${eff.dcCableSizeMm2}mm²`,
    quantity: Math.round(totalDcMeters),
    unit: "meters",
    unitCostPhp: 75,
    markupPercent: 15,
    totalCostPhp: 0,
  });

  // 11. AC Breakers for Inverters
  items.push({
    id: "bom-ac-breakers",
    category: "AC Equipment",
    itemDescription: `AC Circuit Breaker ${config.acProtection.breakerType} ${eff.acBreakerAtAmps}A AT / ${eff.acBreakerAfAmps}AF ${eff.acBreakerPoles}P ${eff.acKaic}kAIC`,
    manufacturer: "Schneider Electric / ABB / LS",
    model: "Compact NSX / XT2",
    quantity: eff.inverterQuantity,
    unit: "sets",
    unitCostPhp: eff.acBreakerAtAmps > 100 ? 12500 : 3500,
    markupPercent: 15,
    totalCostPhp: 0,
  });

  // 12. Solar Distribution Panel
  items.push({
    id: "bom-solar-panel",
    category: "AC Equipment",
    itemDescription: `Solar AC Combiner / Distribution Panelboard NEMA 3R/4X with Busbars & Main Breaker`,
    manufacturer: "Custom Electrical Panelboard",
    model: "SDP-400V",
    quantity: 1,
    unit: "lot",
    unitCostPhp: eff.inverterQuantity > 1 ? 45000 : 15000,
    markupPercent: 15,
    totalCostPhp: 0,
  });

  // 13. AC Main Feeder Cable
  const acMeters = (config.cabling.acCable.lengthM || 40) * (calc.acSystem?.currentCarryingConductors ?? (calc.selectedInverter.phase === "3PH" ? 4 : 2));
  items.push({
    id: "bom-ac-cable",
    category: "Wiring & Conduit",
    itemDescription: `${eff.acCableSizeMm2} mm² Cu ${config.cabling.acCable.insulation} Power Cable in ${eff.acConduitSizeMm}mm Conduit`,
    manufacturer: "Phelps Dodge / Columbia",
    model: "THHN/THWN-2 90°C",
    quantity: Math.round(acMeters),
    unit: "meters",
    unitCostPhp: Math.round(eff.acCableSizeMm2 * 11.5),
    markupPercent: 15,
    totalCostPhp: 0,
  });

  // 14. Conduits & Fittings
  items.push({
    id: "bom-conduits",
    category: "Wiring & Conduit",
    itemDescription: `Conduits (${eff.acConduitSizeMm}mm & ${eff.dcConduitSizeMm}mm), EMT/PVC Pipes, Couplings, Clamps, and Fittings`,
    manufacturer: "Neltex / Maruichi",
    model: "Heavy Duty EMT/PVC",
    quantity: 1,
    unit: "lot",
    unitCostPhp: Math.round(calc.totalDcCapacityKwp * 800),
    markupPercent: 15,
    totalCostPhp: 0,
  });

  // 15. Grounding System
  items.push({
    id: "bom-grounding",
    category: "Safety & Accessories",
    itemDescription: `Grounding Electrode System: Copper-Clad Ground Rods, ${eff.acEgcSizeMm2} mm² Bare Copper Ground Wire, & Clamps`,
    manufacturer: "Erico / Kumwell",
    model: "5/8\" x 10ft Copper Clad",
    quantity: 1,
    unit: "lot",
    unitCostPhp: 18500,
    markupPercent: 15,
    totalCostPhp: 0,
  });

  // 16. Warning Signs & Labels
  items.push({
    id: "bom-labels",
    category: "Safety & Accessories",
    itemDescription: `PEC Article 6.90 Mandatory Photovoltaic Hazard Warning Labels & Placards (UV-Resistant)`,
    manufacturer: "Engraved Acrylic",
    model: "Solar Warning Kit",
    quantity: 1,
    unit: "lot",
    unitCostPhp: 4500,
    markupPercent: 15,
    totalCostPhp: 0,
  });

  // Calculate totals with markup
  return items.map((item) => {
    const unitPriceWithMarkup = item.unitCostPhp * (1 + item.markupPercent / 100);
    return {
      ...item,
      totalCostPhp: Math.round(item.quantity * unitPriceWithMarkup),
    };
  });
}
