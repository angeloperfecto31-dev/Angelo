export type Phase = 'R' | 'Y' | 'B';

export enum LoadType {
  LIGHTING = 'L',
  CONVENIENCE_OUTLET = 'S',
  AIR_CON = 'AC',
  MOTOR = 'M',
  POWER = 'P',
  SPARE = 'SP',
  SPACE = 'SPACE',
  SUB_PANEL = 'SUB',
  SUB_SUB_PANEL = 'SUBSUB'
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
  wireSets?: number; // Optional number of cable sets
  phases: Phase[];
  is3PhaseMarker?: boolean;
  loadA: number;
  mcbAT: number;
  mcbATOverride?: number;
  mcbAF: number;
  mcbP: number | string;
  mcbPOverride?: string;
  mcbKAIC: number;
  kaicOverride?: number;
  mcbKAICCalculated?: number;
  mcbType: MCBType;
  wireSize: string; // mm² (final size)
  wireType: string;
  wireTypeOverride?: string; // User-selected wire type override
  calculatedWireType?: string; // System recommended wire type
  wireSizeOverride?: string; // User-selected wire size override
  calculatedWireSize?: string; // System recommended wire size
  calculatedWireSets?: number; // System recommended number of wire sets
  groundSize: string; // mm² (final size)
  groundSizeOverride?: string; // User-selected ground size override
  calculatedGroundSize?: string; // System recommended ground size
  conduitSize: string; // mm (final size)
  conduitSizeOverride?: string; // User-selected conduit size override
  calculatedConduitSize?: string; // System recommended conduit size
  minimumConduitSize?: string; // Minimum PEC-compliant conduit size
  recommendedConduitSize?: string; // Recommended conduit size for easier wire pulling
  conduitType: string;
  conduitTypeOverride?: string;
  loadType: LoadType;
  quantity: number;
  wattage: number;
  vaPerUnit?: number;
  linkedSubPanelId?: string;
  subPanelReflectionMode?: 'max_demand' | 'phase_loads';
  reflectedDemandVA?: number;
  reflectedDemandAmps?: number;
  reflectedPhaseLoads?: {
    R: number;
    Y: number;
    B: number;
    ThreePhase: number;
  };
  reflectedPhaseAmps?: {
    R: number;
    Y: number;
    B: number;
    ThreePhase: number;
  };
  pf?: number;
  subLoads?: SubLoad[];
  motorHP?: string;
  motorFLC?: number;
  manualMotorFLC?: number;
  isLocked?: boolean;
}

export interface PanelConfig {
  project: string;
  projectType?: 'Residential' | 'Commercial' | 'Industrial' | string;
  owner?: string;
  location: string;
  voltageSystem?: string; // alias or derived for main system
  utilityProvider?: string;
  designStandard?: string;
  engineer?: string;
  date?: string;
  designation: string;
  type: string;
  system: string;
  connectionType?: 'Line-to-Line' | 'Line-to-Neutral';
  transformerConnection?: string;
  mounting: string;
  enclosure: string;
  mainBreakerAT: number;
  mainBreakerAF: number;
  icRating: string;
  voltage: number;
  frequency: number;
  conductorMaterial?: 'Copper' | 'Aluminum';
  insulationType?: string;
  temperatureRating?: 60 | 75 | 90;
  mainConduitType?: string;
  mainOverrides?: {
    isOverrideEnabled: boolean;
    wireSize?: number;
    wireRuns?: number;
    groundSize?: string;
    conduitSize?: string;
    conduitType?: string;
    breakerAT?: number;
    breakerAF?: number;
    breakerType?: string;
    poles?: number | string;
    kaic?: number;
  };
  transferSwitchType?: 'None' | 'ATS' | 'MTS';
  transferSwitchRating?: number;
  transferSwitchPoles?: number;
  transferSwitchPhases?: number;
  transferSwitchWires?: number;
  transferSwitchFrame?: string;
  transferSwitchSCCR?: string;
  transferSwitchManufacturer?: string;
  transferSwitchModel?: string;
  transferSwitchRemarks?: string;
  transferSwitchIsCustomRating?: boolean;
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
  isFeederRunsCustomized?: boolean;
  isFeederSizeCustomized?: boolean;
  connectionType?: 'Series' | 'Parallel';
  phaseTypeOverrideEnabled?: boolean;
  phaseTypeOverride?: '1PH' | '3PH';
  parallelTransformersCount?: number;
  parallelTransformersZMatch?: boolean;
  parallelTransformerskVAMatch?: boolean;
  parallelTransformersVoltageMatch?: boolean;
  parallelTransformersPhaseMatch?: boolean;
  parallelTransformersFreqMatch?: boolean;
  parallelTransformersVectorMatch?: boolean;
  parallelTransformersRating?: number;
  parallelTransformersZ?: number;
  parallelFeedersCount?: number;
  parallelFeedersSizeMatch?: boolean;
  parallelFeedersLengthMatch?: boolean;
  parallelFeedersMaterialMatch?: boolean;
  parallelFeedersInsulationMatch?: boolean;
  parallelFeedersCustomSizes?: string[];
  parallelFeedersCustomLengths?: number[];
  parallelFeedersCustomMaterials?: string[];
  parallelFeedersCustomInsulations?: string[];
}

export interface VoltageDropCalculation {
  id: string;
  source: string;
  name: string;
  loadA: number;
  length: number; // meters
  wireSize: string; // mm²
  wireSets?: number;
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
  efficacy?: number; // lm/W
  cct?: number | string; // Kelvin or CCT string
  cri?: number; // CRI e.g. 80, 90
  mountingType?: string; // Recessed, Surface-mounted, Suspended, Pendant, Track, etc.
  beamAngle?: number; // degrees
  utilizationFactor?: number; // CU e.g. 0.60
  manufacturerReference?: string;
  isCustom?: boolean; // dynamic user fixtures
  isFavorite?: boolean; // favorited status
  inputVoltage?: string; // e.g., '220-240V AC'
  mountingHeight?: number; // default mounting height
  ipRating?: string; // IP Rating, e.g. IP65
  dimensions?: string; // dimensions, e.g. 600x600x12 mm
  typicalApplication?: string; // typical application description
  lifespan?: string; // average lifespan, e.g. 50,000 hrs
  dimmable?: string; // dimming compatibility info
}

export interface SavedLightingDetail {
  id: string;
  roomName: string;
  roomType?: string;
  targetLux: number;
  area: number;
  roomWidth?: number;
  roomLength?: number;
  ceilingHeight?: number;
  workingPlaneHeight?: number;
  mountingHeight?: number;
  ceilingReflectance?: number;
  wallReflectance?: number;
  floorReflectance?: number;
  coefficientOfUtilization?: number;
  maintenanceFactor?: number;
  fixtureId?: string;
  fixtureLightType?: string;
  fixturesCount: number;
  totalLumens: number;
  totalWattage: number;
  circuitNo?: number; // optionally link to circuit
  fixtureWattage?: number;
  fixtureLumens?: number;
  activeFixtures?: ActiveFixtureSelection[];
  customPositions?: PlacedFixtureDragPosition[];
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
  roomName?: string;
  roomType?: string;
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
  ceilingReflectance?: number;
  wallReflectance?: number;
  floorReflectance?: number;
  electricityRate?: number;
  operatingHoursDaily?: number;
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
  isManualQuantity?: boolean;
  manualQuantity?: number;
}

export interface FloorPlanImage {
  id: string;
  name: string;
  data: string;
}

