export type SolarProjectType = "residential" | "commercial";
export type SolarSystemType = "on-grid" | "off-grid" | "hybrid";
export type RoofType = "gi_sheet" | "concrete_slab" | "tile_roof" | "ground_mount" | "carport_canopy";
export type MountingType = "flush_mount" | "tilted_rack" | "ballasted" | "ground_structure" | "bipv";

export interface PVModule {
  id: string;
  manufacturer: string;
  model: string;
  ratedPowerWp: number;
  voc: number;
  vmp: number;
  isc: number;
  imp: number;
  maxSystemVoltage: number;
  efficiencyPercent: number;
  tempCoeffVoc: number;   // %/°C (typically -0.28 to -0.32)
  tempCoeffIsc: number;   // %/°C (typically +0.04 to +0.05)
  tempCoeffPmax: number;  // %/°C (typically -0.34 to -0.38)
  lengthMm: number;
  widthMm: number;
  thicknessMm: number;
  weightKg: number;
  isCustom?: boolean;
}

export interface SolarInverter {
  id: string;
  manufacturer: string;
  model: string;
  ratedAcPowerKw: number;
  maxDcInputPowerKw: number;
  maxDcVoltage: number;
  mpptVoltageRangeMin: number;
  mpptVoltageRangeMax: number;
  numMppts: number;
  maxInputCurrentPerMppt: number;
  maxIscPerMppt: number;
  ratedAcCurrent: number;
  maxAcCurrent: number;
  acVoltage: number;
  phase: "1PH" | "3PH";
  frequencyHz: number;
  efficiencyPercent: number;
  ipRating: string;
  isCustom?: boolean;
}

export interface SolarBattery {
  id?: string;
  manufacturer: string;
  model: string;
  voltageV: number;
  capacityAh: number;
  energyKwh: number;
  dodPercent: number;
  efficiencyPercent: number;
  chemistry?: string; // e.g. "LiFePO4", "NMC", "LFP"
  voltageType?: "low_voltage" | "high_voltage" | "commercial_bess";
  maxDischargeCurrentA?: number;
  cycleLife?: number;
  formFactor?: "rack_mount" | "wall_mount" | "stackable" | "all_in_one" | "containerized" | "floor_standing";
  isCustom?: boolean;
}

export interface BatteryConfig {
  enabled: boolean;
  manufacturer: string;
  model: string;
  voltageV: number;
  capacityAh: number;
  energyKwh: number;
  dodPercent: number;
  efficiencyPercent: number;
  backupHours: number;
  requiredBackupLoadKw: number;
  units: number;
  unitsInSeries: number;
  unitsInParallel: number;
  batteryBankVoltage: number;
  totalEnergyKwh: number;
  usableEnergyKwh: number;
  chemistry?: string;
  voltageType?: "low_voltage" | "high_voltage" | "commercial_bess";
  /** Continuous discharge current per unit (A), from the battery datasheet */
  maxDischargeCurrentA?: number;
}

export interface DCProtectionConfig {
  combinerBoxRequired: boolean;
  combinerBoxModel: string;
  combinerBoxInputs: number;
  fuseRatingAmps: number;
  fuseVoltageVolts: number;
  fusePoles: number;
  fuseKaic: number;
  isolatorRatingAmps: number;
  isolatorVoltageVolts: number;
  isolatorPoles: number;
  isolatorKaic: number;
  spdType: string;
  spdUcVolts: number;
  spdInKa: number;
  spdImaxKa: number;
  egcSizeMm2: number;
  egcMaterial: "Cu" | "Al";
  egcInsulation: string;
}

export interface ACProtectionConfig {
  breakerType: "MCB" | "MCCB" | "ACB" | "RCBO";
  atAmps: number;
  afAmps: number;
  poles: number;
  kaic: number;
  voltage: number;
  spdType: string;
  spdRatingVolts: number;
  isolatorRatingAmps: number;
  isolatorPoles: number;
  isManualOverride?: boolean;
}

export interface CableRunConfig {
  conductorSizeMm2: number;
  material: "Cu" | "Al";
  insulation: string;
  conduitType: "PVC" | "RSC" | "EMT" | "Cable Tray" | "Direct Burial";
  conduitSizeMm: number;
  lengthM: number;
  sets: number;
  tempCorrectionFactor: number;
  conduitFillFactor: number;
  allowableAmpacity: number;
  designCurrent: number;
  voltageDropVolts: number;
  voltageDropPercent: number;
}

export interface SolarCablingConfig {
  dcCable: CableRunConfig;
  acCable: CableRunConfig;
  dcMaxDropPercent: number;
  acMaxDropPercent: number;
}

export interface TransformerIntegrationConfig {
  enabled: boolean;
  primaryVoltage: number;
  secondaryVoltage: number;
  kvaRating: number;
  phase: "1PH" | "3PH";
  frequencyHz: number;
  impedancePercent: number;
  primaryCurrentAmps: number;
  secondaryCurrentAmps: number;
  primaryBreakerAmps: number;
  secondaryBreakerAmps: number;
}

export interface NetMeteringConfig {
  enabled: boolean;
  utilityProvider: string;
  serviceVoltage: number;
  servicePhase: "1PH" | "3PH";
  exportLimitation: "none" | "zero_export" | "limited";
  exportLimitPercent: number;
  interconnectionType: "load_side" | "supply_side";
  smartMeterModel: string;
}

export interface SolarBOMItem {
  id: string;
  category: "PV Equipment" | "DC Equipment" | "AC Equipment" | "Wiring & Conduit" | "Mounting & Structure" | "Safety & Accessories" | "Services & Labor" | "General" | string;
  itemDescription: string;
  manufacturer: string;
  model: string;
  quantity: number;
  unit: string;
  unitCostPhp: number;
  markupPercent: number;
  totalCostPhp: number;
  /** How the quantity follows from the design */
  basis?: string;
  /** "auto": generated from the design; "custom": added by the user */
  source?: "auto" | "custom";
  /** Fields of a generated line the user changed (kept when the design changes) */
  overrides?: Partial<Record<"itemDescription" | "manufacturer" | "model" | "quantity" | "unitCostPhp" | "markupPercent", boolean>>;
  /** A generated line the user removed */
  excluded?: boolean;
}

export interface SolarSLDPosition {
  x: number;
  y: number;
}

/**
 * User-editable manual overrides for solar equipment sizing and parameters.
 * When a field is undefined, the centralized calculation engine automatically sizes it.
 * When defined by the user, the override is strictly honored and marked as [Manual Override],
 * while engineering safety validations are continuously evaluated.
 */
export interface SolarDesignOverrides {
  // Array & Stringing
  modulesPerString?: number;
  numberOfStrings?: number;
  totalModules?: number;

  // Inverter
  inverterQuantity?: number;

  // DC Protection & Combiner
  dcFuseRatingAmps?: number;
  dcIsolatorRatingAmps?: number;
  dcSpdUcVolts?: number;
  dcEgcSizeMm2?: number;

  // AC Protection
  acBreakerAtAmps?: number;
  acBreakerAfAmps?: number;
  acBreakerPoles?: number;
  acIsolatorRatingAmps?: number;
  acKaic?: number;

  // Cabling & Conduits
  dcCableSizeMm2?: number;
  dcConduitSizeMm?: number;
  acCableSizeMm2?: number;
  acConduitSizeMm?: number;
  acEgcSizeMm2?: number;

  // Transformer (if enabled or commercial)
  transformerKva?: number;
  transformerPrimaryBreaker?: number;
  transformerSecondaryBreaker?: number;

  // Battery (if hybrid or off-grid)
  batteryUnits?: number;
}

/**
 * Pure auto-calculated baseline equipment values derived from engineering standards
 */
export interface SolarEquipmentAutoValues {
  modulesPerString: number;
  numberOfStrings: number;
  totalModules: number;
  inverterQuantity: number;
  dcFuseRatingAmps: number;
  dcIsolatorRatingAmps: number;
  dcSpdUcVolts: number;
  dcEgcSizeMm2: number;
  dcCableSizeMm2: number;
  dcConduitSizeMm: number;
  acBreakerAtAmps: number;
  acBreakerAfAmps: number;
  acBreakerPoles: number;
  acIsolatorRatingAmps: number;
  acKaic: number;
  acCableSizeMm2: number;
  acConduitSizeMm: number;
  acEgcSizeMm2: number;
  transformerKva: number;
  transformerPrimaryBreaker: number;
  transformerSecondaryBreaker: number;
  batteryUnits: number;
}

/**
 * Effective equipment values currently active in the design (auto or overridden)
 */
export interface SolarEquipmentEffectiveValues extends SolarEquipmentAutoValues {}

/** How the inverters connect to the utility service (single-phase vs three-phase). */
export interface SolarAcSystem {
  /** Utility service: 1PH 2W, 3PH 3W (230V delta) or 3PH 4W (400/230V wye) */
  service: "1PH-2W" | "3PH-3W" | "3PH-4W";
  serviceLabel: string;
  inverterIs3Phase: boolean;
  /** Inverter output: 1PH, 1PH L-N (on wye), 1PH L-L (on delta), 3PH 3W or 3PH 4W */
  inverterConnection: "1PH" | "1PH-LN" | "1PH-LL" | "3PH-3W" | "3PH-4W";
  inverterConnectionLabel: string;
  /** Current-carrying conductors per inverter output circuit (phases + neutral) */
  currentCarryingConductors: number;
  phaseConductors: number;
  hasNeutral: boolean;
  /** Single-phase inverters spread over the phases of a 3PH service, e.g. [["A-B",1],["B-C",1],["C-A",1]] */
  phaseDistribution: Array<[string, number]> | null;
  /** Highest line current at the interconnection (A), all inverters at max AC current */
  interconnectionLineCurrent: number;
  /** Poles of the solar main disconnect / back-feed device at the panel */
  mainDisconnectPoles: number;
}

export interface SolarCalculationResults {
  // Array & Module
  selectedModule: PVModule;
  isModuleAuto?: boolean;
  recommendedModule?: PVModule;
  calculatedModules: number;
  totalModules: number;
  totalDcCapacityW: number;
  totalDcCapacityKwp: number;
  areaRequiredM2: number;

  // String Configuration (Effective)
  modulesPerString: number;
  numberOfStrings: number;

  // Temperature corrected string values
  vocCold: number;
  vmpHot: number;
  iscHot: number;
  imp: number;
  stringVoc: number;
  stringVmp: number;
  stringIsc: number;
  stringImp: number;
  totalDcCurrent: number;

  // Inverter
  selectedInverter: SolarInverter;
  isInverterAuto?: boolean;
  recommendedInverter?: SolarInverter;
  inverterQuantity: number;
  totalInverterAcKw: number;
  dcAcRatio: number;
  inverterRatedAcCurrent: number;
  inverterMaxAcCurrent: number;
  totalSystemAcCurrent: number;

  // AC system (single-phase vs three-phase) and interconnection
  acSystem: SolarAcSystem;
  /** Solar back-feed device at the panel used for the 120% busbar rule */
  interconnectionBackfeedAmps: number;
  interconnectionBackfeedSource: "inverter-breaker" | "solar-main-disconnect" | "transformer-secondary";

  // Battery (if enabled)
  batteryEnergyKwhRequired: number;
  batteryCapacityAhRequired: number;
  batteryUnitsCalculated: number;
  batteryUsableEnergyKwh: number;
  batteryBackupHoursActual: number;
  /** Units needed for the backup energy alone */
  batteryUnitsForEnergy: number;
  /** Parallel strings needed so the bank delivers the inverter battery current */
  batteryParallelForCurrent: number;
  batteryUnitsInSeries: number;
  batteryUnitsInParallel: number;
  batteryBankVoltage: number;
  batteryTotalEnergyKwh: number;
  /** Battery-side DC current at full inverter power */
  batteryMaxDcCurrentA: number;
  batteryBreakerAmps: number;
  batteryCableSizeMm2: number;
  /** Parallel conductor runs per pole (large banks) */
  batteryCableRuns: number;
  batteryEgcSizeMm2: number;

  // Protection Recommended / Effective
  dcFuseRecommendedAmps: number;
  dcIsolatorRecommendedAmps: number;
  dcSpdUcMinVolts: number;
  acBreakerRecommendedAmps: number;
  acBreakerAfRecommended: number;
  acMainDisconnectAmps: number;

  // Cables & Drops
  dcCableAmpacity: number;
  dcVoltageDropV: number;
  dcVoltageDropPercent: number;
  acCableAmpacity: number;
  acVoltageDropV: number;
  acVoltageDropPercent: number;

  // Load schedule integration
  connectedLoadKw: number;
  maxDemandKw: number;
  recommendedSolarKw: number;
  estimatedSolarPeakGenerationKw: number;
  netRemainingGridDemandKw: number;

  // Centralized Automatic vs Override State
  autoValues: SolarEquipmentAutoValues;
  effective: SolarEquipmentEffectiveValues;
  isOverridden: Record<keyof SolarDesignOverrides, boolean>;
  overrideCount: number;

  // Validation Flags & In-line Warning Map
  validations: {
    vocWithinMaxDcVoltage: boolean;
    vmpWithinMpptRange: boolean;
    stringCurrentWithinMpptMax: boolean;
    stringsWithinInverterCapacity: boolean;
    dcAcRatioValid: boolean;
    dcVoltageDropValid: boolean;
    acVoltageDropValid: boolean;
    dcCableAmpacityValid: boolean;
    acCableAmpacityValid: boolean;
    acBreakerAdequate: boolean;
    batteryCapacityAdequate: boolean;
    conduitFillValid: boolean;
    phaseCompatible: boolean;
  };
  warnings: string[];
  fieldWarnings: Partial<Record<keyof SolarDesignOverrides, string>>;
  passCount: number;
  totalChecks: number;
  bomItems?: SolarBOMItem[];
}

export interface SolarDesignConfig {
  // 1. Project Setup
  projectName: string;
  projectLocation: string;
  clientName: string;
  designerName: string;
  projectType: SolarProjectType;
  systemType: SolarSystemType;
  sizingMethod: "target_capacity" | "load_demand";
  targetCapacityKwp: number;
  availableRoofAreaM2: number;
  roofType: RoofType;
  mountingType: MountingType;
  selectedMdpId: string; // Synced with ElectricalPH MDP

  // 2. Utility & Service info
  utilityVoltage: number;
  utilityPhase: "1PH" | "3PH" | "1-Phase" | "3-Phase";
  utilityFrequency: number;
  serviceCapacityAmps: number;

  // 3. Environmental & Temp inputs
  minOperatingTempC: number;
  maxOperatingTempC: number;
  peakSunHours: number;

  // 4. PV Module & Array
  selectedModuleId: string;
  autoModuleSelection?: boolean;
  customModules: PVModule[];
  modulesPerString: number;
  numberOfStrings: number;
  totalModules: number;
  manualModuleOverride?: boolean;

  // 5. Inverter
  selectedInverterId: string;
  autoInverterSelection?: boolean;
  customInverters: SolarInverter[];
  inverterQuantity: number;
  stringsPerInverter: number;
  mpptsUsedPerInverter: number;

  // 6. Battery System
  battery: BatteryConfig;
  customBatteries?: SolarBattery[];

  // 7. Protection & Sizing
  dcProtection: DCProtectionConfig;
  acProtection: ACProtectionConfig;
  cabling: SolarCablingConfig;

  // 8. Transformer & Net Metering
  transformer: TransformerIntegrationConfig;
  netMetering: NetMeteringConfig;

  // 9. BOM & SLD Layout overrides
  bomItems: SolarBOMItem[];
  sldPositions?: Record<string, SolarSLDPosition>;

  // 10. Manual Overrides Engine (User customizable parameters with auto-revert)
  overrides?: SolarDesignOverrides;

  // 11. Roof Plan (satellite capture, roof outlines and module layout)
  roofPlan?: RoofPlanConfig;

  // 11. Metadata
  lastCalculated?: string;
  notes?: string;

  // 12. Solar Quotation & Contractor Proposal
  quotation?: SolarQuotationConfig;
}

export interface SolarQuotationItem {
  id: string;
  category: string;
  itemDescription: string;
  manufacturer: string;
  model: string;
  quantity: number;
  unit: string;
  unitCostPhp: number;
  markupPercent: number;
  sellingPricePhp: number;
  laborCostPhp?: number;
  discountPhp?: number;
  totalCostPhp: number; // Subtotal = quantity * sellingPricePhp + (laborCostPhp || 0) - (discountPhp || 0)
}

export type PricingDisplayMode = "detailed" | "summary" | "lumpsum";
export type ProposalSubmissionMode = "client" | "contractor";

export interface SolarQuotationScopeItem {
  id: string;
  title: string;
  description: string;
  included: boolean;
}

export interface SolarQuotationConfig {
  // Identification & Tracking
  quotationNumber: string; // e.g. "EP-SOLAR-2026-001"
  revision: string;        // e.g. "Rev. 00"
  quotationDate: string;   // ISO string e.g. "2026-09-30"
  validUntilDate: string;  // e.g. "2026-10-30"

  // Client Information
  clientName: string;
  clientCompany?: string;
  clientAddress?: string;
  contactPerson?: string;
  contactPhone?: string;
  contactEmail?: string;

  // Contractor / Prepared By Information
  preparedBy: string;
  preparedByTitle?: string;
  preparedByCompany: string;
  preparedByPhone?: string;
  preparedByEmail?: string;
  preparedByAddress?: string;
  checkedBy?: string;
  checkedByTitle?: string;

  // Commercial & Execution Terms
  paymentTerms: string;
  projectDuration: string;
  warrantyTerms: string;
  inclusions: string[];
  exclusions: string[];
  termsAndConditions: string[];
  generalNotes?: string;

  // Scope of Work
  scopeOfWork: SolarQuotationScopeItem[];

  // Itemized Pricing
  items: SolarQuotationItem[];
  pricingDisplayMode: PricingDisplayMode; // "detailed" | "summary" | "lumpsum"
  submissionMode: ProposalSubmissionMode; // "client" | "contractor"

  // Direct Cost Adjustments & Taxes
  engineeringDesignFeePhp: number;
  installationLaborCostPhp: number;
  testingCommissioningCostPhp: number;
  permittingUtilityFeePhp: number;
  mobilizationDeliveryPhp: number;
  otherChargesPhp: number;
  discountPhp: number;
  taxRatePercent: number; // e.g. 12 for 12% VAT
  applyTax: boolean;

  // History & Revision Logs
  history?: Array<{
    revision: string;
    date: string;
    totalAmountPhp: number;
    savedBy?: string;
    notes?: string;
  }>;
}


// =============================================================================
// ROOF PLAN
// Geometry is stored in pixels of the captured image (x right, y down, origin at the top-left
// corner of the image), so the overlay always lines up with the imagery. Real sizes come from
// the image scale: metres per pixel = Web Mercator ground resolution x scaleFactor (calibration).
// =============================================================================

export interface RoofPlanCapture {
  /** "satellite": Esri World Imagery capture; "manual": blank drawing grid with a set scale */
  kind: "satellite" | "manual";
  /** Image centre (satellite) */
  lat?: number;
  lng?: number;
  /** Map zoom level of the capture (satellite) */
  zoom?: number;
  /** Size of the captured image in pixels */
  widthPx: number;
  heightPx: number;
  /** Metres per pixel before calibration (manual mode sets it directly) */
  baseMetersPerPx: number;
  address?: string;
  capturedAt?: string;
}

export interface RoofPlanFace {
  id: string;
  name: string;
  /** Outline vertices in image pixels */
  points: Array<[number, number]>;
  /** Direction of the module rows on the drawing (degrees, 0 = east / right, clockwise) */
  rowAngleDeg: number;
  /** Compass direction the roof slope faces (degrees from north), for the drawings and notes */
  facingAzimuthDeg: number;
  tiltDeg: number;
  /** Edge clearance kept free of modules (m) */
  setbackM: number;
  orientation: "portrait" | "landscape";
  /** Gap between modules in a row (m) and between rows (m) */
  moduleGapM: number;
  rowGapM: number;
  /** "fill": as many modules as fit; "strings": whole strings as equal, centred blocks */
  arrangement?: "fill" | "strings";
}

export interface RoofPlanModule {
  id: string;
  faceId: string;
  /** Module centre in image pixels */
  x: number;
  y: number;
  /** Rotation of the module's long side from the drawing x-axis (degrees, clockwise) */
  rotDeg: number;
}

export interface RoofPlanConfig {
  capture?: RoofPlanCapture;
  /** Measured / satellite length ratio from a calibration edge (1 = satellite scale) */
  scaleFactor: number;
  calibration?: { faceId: string; edgeIndex: number; measuredM: number };
  faces: RoofPlanFace[];
  modules: RoofPlanModule[];
  /** Actual module length / width (mm) used on the plan; unset = the selected module's datasheet */
  moduleLengthMm?: number;
  moduleWidthMm?: number;
}
