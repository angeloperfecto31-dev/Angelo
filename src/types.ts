export type Phase = 'R' | 'Y' | 'B';

export enum LoadType {
  LIGHTING = 'L',
  CONVENIENCE_OUTLET = 'S',
  AIR_CON = 'AC',
  MOTOR = 'M',
  POWER = 'P',
  SPARE = 'SP',
  SPACE = 'SPACE',
  SUB_PANEL = 'SUB'
}

export enum MCBType {
  PLUG_IN = 'Plug-in',
  BOLT_ON = 'Bolt-on',
  MCB = 'MCB',
  MCCB = 'MCCB',
  ACB = 'ACB',
  VCB = 'VCB',
  SF6 = 'SF6',
  RCCB_ELCB = 'RCCB/ELCB',
  RCBO = 'RCBO',
  MPCB = 'MPCB'
}

export interface SubLoad {
  id: string;
  description: string;
  quantity: number;
  wattage: number;
}

export interface Circuit {
  id: string;
  circuitNo: number;
  description: string;
  loadVA: number; // Changed from loadKVA to loadVA
  voltage: number;
  phases: Phase[];
  loadA: number;
  mcbAT: number;
  mcbAF: number;
  mcbP: number;
  mcbKAIC: number;
  mcbType: MCBType;
  wireSize: string; // mm²
  wireType: string;
  groundSize: string; // mm²
  conduitSize: string; // mm
  conduitType: string;
  loadType: LoadType;
  quantity: number;
  wattage: number;
  vaPerUnit?: number;
  linkedSubPanelId?: string;
  pf?: number;
  subLoads?: SubLoad[];
}

export interface PanelConfig {
  project: string;
  location: string;
  designation: string;
  type: string;
  system: '230V, 1PH, 2W' | '230V, 3PH, 3W' | '400V, 3PH, 3W' | '440V, 3PH, 3W' | '480V, 3PH, 3W' | '400V/230V, 3PH, 4W' | '440V/230V, 3PH, 4W' | '480V/230V, 3PH, 4W';
  connectionType?: 'Line-to-Line' | 'Line-to-Neutral';
  transformerConnection?: string;
  mounting: string;
  enclosure: string;
  mainBreakerAT: number;
  mainBreakerAF: number;
  icRating: string;
  voltage: number;
  frequency: number;
  mainOverrides?: {
    isOverrideEnabled: boolean;
    wireSize?: number;
    wireRuns?: number;
    groundSize?: string;
    conduitSize?: string;
    breakerAT?: number;
    breakerAF?: number;
    breakerType?: string;
    poles?: number;
    kaic?: number;
  };
}

export interface ShortCircuitParams {
  transformerKVA: number;
  transformerZ: number; // percentage
  transformerVoltage: number;
  primaryVoltage: number;
  transformerConnection: string;
  utilityShortCircuitMVA: number;
  feederLength: number; // meters
  feederSize: string; // mm²
  feederRuns: number;
  conductorType: 'Copper' | 'Aluminum';
}

export interface VoltageDropCalculation {
  id: string;
  source: string;
  name: string;
  loadA: number;
  length: number; // meters
  wireSize: string; // mm²
  voltage: number;
  systemType: '1PH' | '3PH';
}

export interface LightFixture {
  id: string;
  category: string;
  lightType: string;
  wattageRange: string;
  lumensRange: string;
  brands: string;
  wattage: number;
  lumens: number;
  description?: string;
  modelNumber?: string;
  manufacturer?: string;
}

export interface SavedLightingDetail {
  id: string;
  roomName: string;
  targetLux: number;
  area: number;
  fixtureId?: string;
  fixtureLightType?: string;
  fixturesCount: number;
  totalLumens: number;
  totalWattage: number;
  circuitNo?: number; // optionally link to circuit
  fixtureWattage?: number;
  fixtureLumens?: number;
}

export interface ActiveFixtureSelection {
  id: string;
  fixtureId: string;
  lightType: string;
  wattage: number;
  lumens: number;
  quantity: number;
  isCustom?: boolean;
  brands?: string;
  fixtureShape: 'rectangular' | 'square' | 'circular' | 'linear';
  fixtureWidth: number;
  fixtureLength: number;
  fixtureDiameter: number;
  fixtureThickness: number;
  fixtureBeamAngle: number;
  fixtureDistributionType: 'conical' | 'oblong' | 'omni' | 'linear';
}

export interface PlacedFixtureDragPosition {
  id: string;
  fixtureId: string;
  lightType: string;
  x: number; // 0 to roomWidth
  z: number; // 0 to roomLength
  rotationDegrees?: number; // 0 to 360
  lumens: number;
  wattage: number;
  activeFixtureId?: string;
}

export interface IlluminationParams {
  inputMode: 'dimensions' | 'area';
  roomWidth: number;
  roomLength: number;
  userArea: number;
  ceilingHeight: number;
  workingPlaneHeight: number;
  mountingHeight?: number; // Optional since it can be derived, or explicit
  targetLux: number;
  targetRoomName?: string;
  selectedFixtureId?: string;
  lumensPerFixture: number;
  coefficientOfUtilization: number;
  maintenanceFactor: number;
  savedRooms?: SavedLightingDetail[];
  isCustomFixture?: boolean;
  customLightType?: string;
  customLumens?: number;
  customWattage?: number;
  fixtureShape?: 'rectangular' | 'square' | 'circular' | 'linear';
  fixtureWidth?: number;
  fixtureLength?: number;
  fixtureDiameter?: number;
  fixtureThickness?: number;
  fixtureBeamAngle?: number;
  fixtureDistributionType?: 'conical' | 'oblong' | 'omni' | 'linear';
  activeFixtures?: ActiveFixtureSelection[];
  customPositions?: PlacedFixtureDragPosition[];
}

export interface FloorPlanImage {
  id: string;
  name: string;
  data: string;
}

