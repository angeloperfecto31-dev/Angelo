import { PanelConfig, Circuit, ShortCircuitParams, VoltageDropCalculation, LoadType } from "../types";
import { computePanelScheduleValues } from "./computeEngine";

export interface BomItem {
  id: string;
  category: "Conductors" | "Grounding" | "Conduits" | "Breakers" | "Switches" | "Distribution Equipment" | "Boxes" | "Lighting" | "Devices" | "Protection" | "Equipment" | "Accessories";
  name: string;
  description: string;
  brand: string;
  specification: string;
  quantity: number;
  unit: string;
  unitCost: number;
  laborCostPerUnit: number;
  remarks: string;
  isLocked: boolean;
  source: string;
  rating?: string;
}

// Wire pricing lookup
const getWirePricePerMeter = (sizeStr: string): number => {
  const cleanStr = sizeStr.replace(/[^\d.]/g, "");
  const num = parseFloat(cleanStr);
  if (isNaN(num)) return 22;
  if (num <= 2.0) return 22;
  if (num <= 3.5) return 32;
  if (num <= 5.5) return 48;
  if (num <= 8.0) return 75;
  if (num <= 14.0) return 135;
  if (num <= 22.0) return 210;
  if (num <= 30.0) return 290;
  if (num <= 38.0) return 360;
  if (num <= 50.0) return 470;
  if (num <= 80.0) return 750;
  if (num <= 100.0) return 950;
  if (num <= 125.0) return 1200;
  if (num <= 150.0) return 1450;
  if (num <= 200.0) return 1950;
  if (num <= 250.0) return 2450;
  return num * 10;
};

// Conduit pricing lookup
const getConduitPricePerMeter = (sizeStr: string, type: string): number => {
  const cleanStr = sizeStr.replace(/[^\d.]/g, "");
  const sizeNum = parseInt(cleanStr, 10) || 20;
  let basePrice = 45;
  if (sizeNum <= 20) basePrice = 45;
  else if (sizeNum <= 25) basePrice = 60;
  else if (sizeNum <= 32) basePrice = 90;
  else if (sizeNum <= 40) basePrice = 130;
  else if (sizeNum <= 50) basePrice = 190;
  else if (sizeNum <= 63) basePrice = 280;
  else if (sizeNum <= 75) basePrice = 380;
  else if (sizeNum <= 90) basePrice = 490;
  else if (sizeNum <= 110) basePrice = 650;
  else basePrice = sizeNum * 6;

  // Metal conduits EMT, IMC, RSC multiplier
  if (type === "EMT") return basePrice * 2.2;
  if (type === "IMC") return basePrice * 3.5;
  if (type === "RSC") return basePrice * 4.8;
  return basePrice; // PVC
};

// Copper Lug price lookup based on wire size
const getLugPrice = (sizeStr: string): number => {
  const cleanStr = sizeStr.replace(/[^\d.]/g, "");
  const sizeNum = parseFloat(cleanStr);
  if (isNaN(sizeNum)) return 25;
  if (sizeNum <= 3.5) return 25;
  if (sizeNum <= 8.0) return 35;
  if (sizeNum <= 14.0) return 55;
  if (sizeNum <= 22.0) return 75;
  if (sizeNum <= 38.0) return 95;
  if (sizeNum <= 50.0) return 140;
  if (sizeNum <= 80.0) return 220;
  if (sizeNum <= 100.0) return 280;
  if (sizeNum <= 150.0) return 380;
  return 480;
};

// Sizing Equipment Grounding Conductor (EGC) based on Overcurrent Protective Device (OCPD) - PEC Table 2.50.6.13
const getEgcSizeStr = (breakerRating: number): string => {
  if (breakerRating <= 15) return "2.0";
  if (breakerRating <= 20) return "2.0";
  if (breakerRating <= 30) return "3.5";
  if (breakerRating <= 40) return "3.5";
  if (breakerRating <= 60) return "5.5";
  if (breakerRating <= 100) return "8.0";
  if (breakerRating <= 200) return "14.0";
  if (breakerRating <= 400) return "22.0";
  if (breakerRating <= 600) return "30.0";
  if (breakerRating <= 800) return "50.0";
  if (breakerRating <= 1200) return "80.0";
  return "100.0";
};

// Sizing minimum conduit diameter (mm) based on conductor count and total area (simplified, complying with PEC Chapter 9, Table 1)
const getMinimumConduitSize = (conductorSizeStr: string, conductorCount: number): string => {
  const cleanStr = conductorSizeStr.replace(/[^\d.]/g, "");
  const sizeNum = parseFloat(cleanStr) || 2.0;
  if (sizeNum <= 5.5) return "20";
  if (sizeNum <= 14.0) {
    if (conductorCount <= 3) return "25";
    return "32";
  }
  if (sizeNum <= 30.0) {
    if (conductorCount <= 3) return "32";
    return "40";
  }
  if (sizeNum <= 50.0) {
    if (conductorCount <= 3) return "40";
    return "50";
  }
  if (sizeNum <= 100.0) {
    if (conductorCount <= 3) return "63";
    return "75";
  }
  return "90";
};

export const runBomQuantityTakeoff = (
  panel: PanelConfig,
  circuits: Circuit[],
  subPanels: { id: string; panel: PanelConfig; circuits: Circuit[] }[],
  vdCalculations: VoltageDropCalculation[],
  iscParams: ShortCircuitParams,
  settings: {
    wasteConductors: number;
    wasteConduits: number;
    wasteAccessories: number;
    preferredBrandConductors: string;
    preferredBrandConduits: string;
    preferredBrandBreakers: string;
    preferredBrandAccessories: string;
  },
  illumParams?: any,
  mainSource?: any
): { items: BomItem[]; logs: string[] } => {
  const logs: string[] = [];
  const generatedItems: BomItem[] = [];
  const timestamp = new Date().toLocaleTimeString();

  const wasteConductorsFactor = 1 + (settings.wasteConductors || 10) / 100;
  const wasteConduitsFactor = 1 + (settings.wasteConduits || 8) / 100;
  const wasteAccessoriesFactor = 1 + (settings.wasteAccessories || 5) / 100;

  const formatInsulationLabel = (ins: string) => {
    if (!ins || ins.toUpperCase() === "THHN") return "THHN/THWN-2";
    return ins;
  };
  const mdpInsulationLabel = formatInsulationLabel(panel.insulationType || "THHN");

  // Helper to safely push / consolidate items
  const addItem = (item: Omit<BomItem, "id" | "isLocked">) => {
    const existing = generatedItems.find(
      gi => gi.name === item.name &&
            gi.source === item.source &&
            gi.category === item.category &&
            gi.brand === item.brand
    );

    if (existing) {
      existing.quantity += item.quantity;
    } else {
      generatedItems.push({
        ...item,
        id: `gen-engine-${Math.random().toString(36).substr(2, 9)}`,
        isLocked: false
      });
    }
  };

  // Helper to extract lengths from vdCalculations
  const getCircuitLength = (circuitId: string): number => {
    const vd = vdCalculations.find(v => v.source === circuitId);
    return vd && vd.length ? vd.length : 30; // 30m default branch
  };

  const getFeederLength = (panelId: string): number => {
    const vd = vdCalculations.find(v => v.source === panelId);
    return vd && vd.length ? vd.length : 50; // 50m default feeder
  };

  logs.push(`[${timestamp}] Initiated PEC-compliant BOM Takeoff Rules Engine.`);

  const is3Phase = panel.system.includes("3PH");
  const mdpValues = computePanelScheduleValues(panel, circuits);
  const totalMdpConnectedVA = mdpValues.totalVA;

  // Calculate total connected and demand load for MDP and all sub-panels combined
  let totalConnectedLoadVA = totalMdpConnectedVA;
  let totalDemandVA = mdpValues.mainCurrent.baseAmp * panel.voltage * (is3Phase ? Math.sqrt(3) : 1);

  subPanels.forEach(sp => {
    const spValues = computePanelScheduleValues(sp.panel, sp.circuits);
    totalConnectedLoadVA += spValues.totalVA;
    const spIs3Ph = sp.panel.system.includes("3PH");
    totalDemandVA += spValues.mainCurrent.baseAmp * sp.panel.voltage * (spIs3Ph ? Math.sqrt(3) : 1);
  });

  const totalDemandKVA = totalDemandVA / 1000;

  // 1. DYNAMIC MAIN STEP-DOWN TRANSFORMER SIZING ENGINE (PEC Article 4.50)
  // Transformer sized at a minimum of 125% of the continuous demand load.
  const reqTransformerKVA = totalDemandKVA * 1.25;
  const standardTransformerSizes = [15, 30, 45, 75, 112.5, 150, 225, 300, 500, 750, 1000, 1500, 2000, 2500];
  const transformerSizeKVA = standardTransformerSizes.find(size => size >= reqTransformerKVA) || 15;

  const isTransformerNeeded = panel.projectType === "Commercial" ||
                             panel.projectType === "Industrial" ||
                             reqTransformerKVA > 45 ||
                             (iscParams && iscParams.transformerKVA > 0);

  if (isTransformerNeeded) {
    const transCostMap: Record<number, number> = {
      15: 110000, 30: 155000, 45: 210000, 75: 310000, 112.5: 395000,
      150: 480000, 225: 620000, 300: 780000, 500: 1150000, 750: 1650000,
      1000: 2100000, 1500: 2950000, 2000: 3800000, 2500: 4800000
    };
    const transCost = transCostMap[transformerSizeKVA] || (transformerSizeKVA * 2000);

    addItem({
      category: "Distribution Equipment",
      name: `Three-Phase Step-Down Distribution Transformer, ${transformerSizeKVA} kVA`,
      description: `Primary: ${iscParams?.primaryVoltage || 13800}V, Secondary: ${panel.voltage || 230}V, ${panel.transformerConnection || "Dyn11"} connection, Dry-Type self-cooled`,
      brand: "ABB",
      specification: `Impedance %Z: ${iscParams?.transformerZ || 4.5}%, Copper winding, compliant with PEC Article 4.50`,
      quantity: 1,
      unit: "pcs",
      unitCost: transCost,
      laborCostPerUnit: transCost * 0.08,
      remarks: `Primary distribution step-down transformer (Required: ${reqTransformerKVA.toFixed(1)} kVA)`,
      source: "Substation Feed"
    });

    // Vibration spring pads
    addItem({
      category: "Accessories",
      name: `Vibration Isolation Springs, Heavy Duty`,
      description: `Seismic rated spring vibration isolator designed for transformer cabinet footing`,
      brand: settings.preferredBrandAccessories,
      specification: `Double deflection neoprene & spring, load capacity 500kg each`,
      quantity: 4,
      unit: "pcs",
      unitCost: 4500,
      laborCostPerUnit: 1200,
      remarks: `Transformer base isolation`,
      source: "Substation Feed"
    });

    // Flexible metal conduit joint
    addItem({
      category: "Accessories",
      name: `Liquidtight Flexible Metal Conduit (LFMC), 50mm Ø`,
      description: `Flexible vibration-dampening conduit interface from transformer to rigid raceway`,
      brand: settings.preferredBrandConduits,
      specification: `PVC jacketed galvanized steel core, temperature rated 90°C`,
      quantity: 5,
      unit: "meters",
      unitCost: 350,
      laborCostPerUnit: 150,
      remarks: `Conduit vibration isolation joints`,
      source: "Substation Feed"
    });
  }

  // 2. DYNAMIC STANDBY GENERATOR SIZING ENGINE (PEC Article 7.01)
  // Generator sized based on total demand load, 20% expansion headroom, and starting surge if motor load is present.
  const hasGeneratorBackUp = panel.transferSwitchType && panel.transferSwitchType !== "None";
  if (hasGeneratorBackUp) {
    let motorStartingSurgeVA = 0;
    const checkMotor = (c: Circuit) => {
      if (c.loadType === "M" || c.description.toLowerCase().includes("motor") || c.description.toLowerCase().includes("pump") || c.description.toLowerCase().includes("ac")) {
        const surge = (c.loadVA || 1000) * 2; // 3x run load (continuous run + 2x surge)
        if (surge > motorStartingSurgeVA) motorStartingSurgeVA = surge;
      }
    };

    circuits.forEach(checkMotor);
    subPanels.forEach(sp => sp.circuits.forEach(checkMotor));

    const reqGenKVA = (totalDemandKVA + (motorStartingSurgeVA / 1000)) * 1.20;
    const reqGenKW = reqGenKVA * 0.8; // 0.8 Power Factor

    const standardGenKWList = [10, 15, 20, 30, 45, 60, 75, 100, 125, 150, 200, 250, 300, 400, 500, 600, 750, 1000];
    const genKWSize = standardGenKWList.find(size => size >= reqGenKW) || 15;

    const genCostMap: Record<number, number> = {
      10: 150000, 15: 195000, 20: 240000, 30: 310000, 45: 420000,
      60: 510000, 75: 590000, 100: 720000, 125: 860000, 150: 980000,
      200: 1250000, 250: 1550000, 300: 1850000, 400: 2350000, 500: 2950000,
      600: 3400000, 750: 4100000, 1000: 5500000
    };
    const genCost = genCostMap[genKWSize] || (genKWSize * 8000);

    addItem({
      category: "Equipment",
      name: `Standby Diesel Generator Set, ${genKWSize} kW`,
      description: `Standby emergency generator, 230V/400V, ${is3Phase ? "3-Phase, 4-Wire" : "1-Phase, 2-Wire"}, 60Hz, liquid-cooled`,
      brand: "Cummins",
      specification: `Soundproof weatherproof canopy, electronic governor, digital auto-start controller, compliant with PEC Article 7.0`,
      quantity: 1,
      unit: "pcs",
      unitCost: genCost,
      laborCostPerUnit: genCost * 0.10,
      remarks: `Emergency standby power backup (Required capacity: ${reqGenKW.toFixed(1)} kW)`,
      source: "Emergency Standby Feed"
    });

    // Starter battery
    addItem({
      category: "Accessories",
      name: `Lead-Acid Cranking Battery, 12V 100AH`,
      description: `High cold-cranking-amps (CCA) engine starting battery, maintenance free`,
      brand: "GS Yuasa",
      specification: `Vibration resistant casing, heavy duty terminal design`,
      quantity: is3Phase && genKWSize > 150 ? 2 : 1, // 24V starting system for big generator
      unit: "pcs",
      unitCost: 6500,
      laborCostPerUnit: 500,
      remarks: `Generator starting battery`,
      source: "Emergency Standby Feed"
    });

    // Muffler
    addItem({
      category: "Accessories",
      name: `Residential Grade Exhaust Silencer`,
      description: `Engine exhaust noise attenuator for sound canopy compliance`,
      brand: "Cummins",
      specification: `Stainless steel construction, 30-35 dBA residential attenuation`,
      quantity: 1,
      unit: "pcs",
      unitCost: 18500,
      laborCostPerUnit: 3500,
      remarks: `Exhaust noise dampening`,
      source: "Emergency Standby Feed"
    });

    // Transfer switch sizing (ATS / MTS)
    const atsAmp = Math.ceil(mdpValues.mainCurrent.baseAmp * 1.25);
    addItem({
      category: "Distribution Equipment",
      name: `${panel.transferSwitchType} Panel, ${atsAmp}A, ${is3Phase ? "3P" : "2P"}`,
      description: `${panel.transferSwitchType === "ATS" ? "Automatic" : "Manual"} transfer switch panel for emergency power source switching`,
      brand: settings.preferredBrandBreakers,
      specification: `Sized for ${atsAmp}A continuous current rating, mechanical & electrical interlocks, compliant with PEC Article 7.01`,
      quantity: 1,
      unit: "pcs",
      unitCost: panel.transferSwitchType === "ATS" ? 45000 : 15000,
      laborCostPerUnit: panel.transferSwitchType === "ATS" ? 8500 : 3500,
      remarks: `${panel.transferSwitchType} emergency power transfer switch panel`,
      source: "Service Entrance"
    });
  }

  // 3. MAIN SERVICE ENTRANCE & PANELBOARD TAKEOFF (PEC Article 2.30)
  const mdpId = panel.designation || "Main Distribution Panel";
  const mBreakerAmp = panel.mainBreakerAT || 100;
  const mPoles = is3Phase ? 3 : 2;
  const mBreakerCost = mBreakerAmp > 100 ? 5800 : 18500;

  addItem({
    category: "Breakers",
    name: `Main Circuit Breaker MCCB, ${mBreakerAmp}AT/${panel.mainBreakerAF || 100}AF, ${mPoles}P`,
    description: `Main service protection circuit breaker with ${panel.icRating || "10"} kAIC interrupting rating`,
    brand: settings.preferredBrandBreakers,
    specification: `Molded Case Circuit Breaker (MCCB), compliant with PEC Article 2.40`,
    quantity: 1,
    unit: "pcs",
    unitCost: mBreakerCost,
    laborCostPerUnit: mBreakerCost * 0.15,
    remarks: "Main Service Entrance Protection",
    source: `Panel [${mdpId}] Main`
  });

  // Panel enclosure
  addItem({
    category: "Distribution Equipment",
    name: `Main Panelboard Cabinet Enclosure, ${circuits.length}-Branches`,
    description: `NEMA 1 panelboard box with locking door and color-coded interior busbars`,
    brand: settings.preferredBrandBreakers,
    specification: `Surface or flush mounted steel enclosure, powder coated, rated for system voltage`,
    quantity: 1,
    unit: "pcs",
    unitCost: 12000,
    laborCostPerUnit: 2500,
    remarks: "MDP main panel enclosure box",
    source: `Panel [${mdpId}] Main`
  });

  // Service entrance wires
  const computedMDP = computePanelScheduleValues(panel, circuits);
  const mdpFeeder = computedMDP.mainFeeder;
  const fLength = getFeederLength(mdpId);
  const fPhaseSize = mdpFeeder.wire.size.toString() || "30";
  const fPhaseCount = is3Phase ? 3 : 2;
  const fPhaseMeters = fLength * fPhaseCount * wasteConductorsFactor;
  const fPhaseCost = getWirePricePerMeter(fPhaseSize);

  addItem({
    category: "Conductors",
    name: `Feeder Conductor, Copper ${mdpInsulationLabel}, ${fPhaseSize} mm²`,
    description: "Primary service entrance power phase conductor wires",
    brand: settings.preferredBrandConductors,
    specification: "99.9% pure annealed copper, lead-free PVC/Nylon jacket, 90°C thermal rated",
    quantity: Math.ceil(fPhaseMeters),
    unit: "meters",
    unitCost: fPhaseCost,
    laborCostPerUnit: fPhaseCost * 0.25,
    remarks: `Service Feeder Phases (${fPhaseCount} x ${fLength}m)`,
    source: `Panel [${mdpId}] Feeder`
  });

  // Neutral wire
  const fNeutralSize = fPhaseSize;
  const fNeutralMeters = fLength * 1 * wasteConductorsFactor;
  const fNeutralCost = getWirePricePerMeter(fNeutralSize);
  addItem({
    category: "Conductors",
    name: `Neutral Conductor, Copper ${mdpInsulationLabel}, ${fNeutralSize} mm²`,
    description: "Service entrance feeder system neutral conductor wire",
    brand: settings.preferredBrandConductors,
    specification: "Lead-free PVC/Nylon jacket white insulation, 90°C thermal rated",
    quantity: Math.ceil(fNeutralMeters),
    unit: "meters",
    unitCost: fNeutralCost,
    laborCostPerUnit: fNeutralCost * 0.25,
    remarks: `Service Feeder Neutral (1 x ${fLength}m)`,
    source: `Panel [${mdpId}] Feeder`
  });

  // Service grounding wire (Grounding Electrode Conductor - GEC, PEC Table 2.50.3.17)
  const fGecSize = mdpFeeder.groundSize || "8.0";
  const fGecMeters = fLength * 1 * wasteConductorsFactor;
  const fGecCost = getWirePricePerMeter(fGecSize);
  addItem({
    category: "Grounding",
    name: `Grounding Conductor GEC, Copper ${mdpInsulationLabel}, ${fGecSize} mm²`,
    description: "System Grounding Electrode Conductor to primary ground rod grid",
    brand: settings.preferredBrandConductors,
    specification: "Lead-free PVC/Nylon jacket green insulation, 90°C rated",
    quantity: Math.ceil(fGecMeters),
    unit: "meters",
    unitCost: fGecCost,
    laborCostPerUnit: fGecCost * 0.25,
    remarks: `Service Feeder Grounding (1 x ${fLength}m)`,
    source: `Panel [${mdpId}] Feeder`
  });

  // Service entrance conduit
  const fWireRuns = mdpFeeder.wire.runs || 1;
  const fConduitType = mdpFeeder.conduitType || "PVC";
  const fConduitSize = mdpFeeder.conduitSize || "50";
  const fConduitMeters = fLength * wasteConduitsFactor * fWireRuns;
  const fConduitCost = getConduitPricePerMeter(fConduitSize, fConduitType);
  addItem({
    category: "Conduits",
    name: `Feeder Raceway Conduit, ${fConduitType}, ${fConduitSize}mm Ø`,
    description: "Heavy duty primary feeder conduit protection piping",
    brand: settings.preferredBrandConduits,
    specification: `${fConduitType} Conduit, standard thick-wall utility grade`,
    quantity: Math.ceil(fConduitMeters),
    unit: "meters",
    unitCost: fConduitCost,
    laborCostPerUnit: fConduitCost * 0.35,
    remarks: `Service Feeder Raceway (${fLength}m x ${fWireRuns} runs)`,
    source: `Panel [${mdpId}] Feeder`
  });

  // Feeder accessories
  const totalFeederConductors = fPhaseCount + 2; // Phase + Neutral + Ground
  const fCouplingCount = Math.ceil(fLength / 3) * wasteAccessoriesFactor * fWireRuns;
  const fStrapsCount = Math.ceil(fLength / 1.5) * wasteAccessoriesFactor * fWireRuns;
  const fLugCount = totalFeederConductors * 2; // Lug on each end of conductor

  addItem({
    category: "Accessories",
    name: `Conduit Coupling, ${fConduitSize}mm Ø`,
    description: `Raceway conduit pipe connection sleeve coupling matching ${fConduitSize}mm`,
    brand: settings.preferredBrandAccessories,
    specification: `Thick-wall standard coupling matching ${fConduitType} pipeline`,
    quantity: Math.ceil(fCouplingCount),
    unit: "pcs",
    unitCost: fConduitType === "PVC" ? 35 : 120,
    laborCostPerUnit: 15,
    remarks: `Couplings for ${fConduitSize}mm feeder raceway (${fWireRuns} runs)`,
    source: `Panel [${mdpId}] Feeder Accessories`
  });

  addItem({
    category: "Accessories",
    name: `Conduit Locknut with Adapter/Connector, ${fConduitSize}mm Ø`,
    description: `Conduit fitting connectors with locking nuts for box termination knockout lock`,
    brand: settings.preferredBrandAccessories,
    specification: `Locknut, adapter, and protective throat collar connector assembly`,
    quantity: 2 * fWireRuns,
    unit: "sets",
    unitCost: fConduitType === "PVC" ? 45 : 180,
    laborCostPerUnit: 25,
    remarks: `Box termination adapters for feeder conduit (${fWireRuns} runs)`,
    source: `Panel [${mdpId}] Feeder Accessories`
  });

  if (fConduitType === "IMC" || fConduitType === "RSC") {
    addItem({
      category: "Accessories",
      name: `Insulated Grounding Bushing, ${fConduitSize}mm Ø`,
      description: `Threaded metallic grounding bushing for metal raceway termination wire shielding, compliant with PEC 3.0.1.4`,
      brand: settings.preferredBrandAccessories,
      specification: `Malleable iron housing, plastic insulated throat liner, grounded lug`,
      quantity: 2,
      unit: "pcs",
      unitCost: 160,
      laborCostPerUnit: 40,
      remarks: "Feeder conduit metallic wire containment protection shield",
      source: `Panel [${mdpId}] Feeder Accessories`
    });
  }

  addItem({
    category: "Accessories",
    name: `Conduit Support Strap, Heavy Duty, ${fConduitSize}mm Ø`,
    description: `Heavy duty pipe support mounting clamps for securing feeder pipeline structure`,
    brand: settings.preferredBrandAccessories,
    specification: `Galvanized steel two-hole support strap, corrosion resistant`,
    quantity: Math.ceil(fStrapsCount),
    unit: "pcs",
    unitCost: 28,
    laborCostPerUnit: 15,
    remarks: `Support brackets spaced 1.5m along feeder raceway`,
    source: `Panel [${mdpId}] Feeder Accessories`
  });

  addItem({
    category: "Accessories",
    name: `Solderless Copper Compression Lug, ${fPhaseSize} mm²`,
    description: `Heavy duty copper cable termination crimping terminals matching phase size`,
    brand: settings.preferredBrandAccessories,
    specification: `One-hole seamless copper compression lug, electro-tin plated`,
    quantity: fLugCount,
    unit: "pcs",
    unitCost: getLugPrice(fPhaseSize),
    laborCostPerUnit: 45,
    remarks: `Cable lugs for feeder connections (Phases, Neutral, Ground)`,
    source: `Panel [${mdpId}] Feeder Accessories`
  });

  addItem({
    category: "Accessories",
    name: `Color-Coded Heat Shrink Tubing Set, Heavy Duty`,
    description: `Color-coded heat shrink sleeves for conductor phase identification (Red, Yellow, Blue, White, Green)`,
    brand: settings.preferredBrandAccessories,
    specification: `Cross-linked polyolefin sleeves, 3:1 shrink ratio, flame retardant`,
    quantity: fLugCount,
    unit: "pcs",
    unitCost: 75,
    laborCostPerUnit: 20,
    remarks: `Conductor endpoint color coding sleeves`,
    source: `Panel [${mdpId}] Feeder Accessories`
  });


  // 4. GLOBAL ILLUMINATION MODULE COUPLING (Wiring Devices & LED Fixtures)
  let totalProjectLightingFixturesCount = 0;
  if (illumParams && Array.isArray(illumParams.savedRooms)) {
    illumParams.savedRooms.forEach((r: any) => {
      totalProjectLightingFixturesCount += r.fixturesCount || 0;
    });
  }

  if (totalProjectLightingFixturesCount > 0) {
    addItem({
      category: "Lighting",
      name: `LED Recessed Downlight Luminaire, 9W`,
      description: `Premium circular recessed ceiling LED downlight fixture, daylight (6500K), aluminum body`,
      brand: "Philips",
      specification: `Sized from Illumination Layout module, 230V, PF 0.90, lifetime 30,000 hrs`,
      quantity: totalProjectLightingFixturesCount,
      unit: "pcs",
      unitCost: 450,
      laborCostPerUnit: 85,
      remarks: "Sized automatically from Illumination Layout (total across all rooms)",
      source: "Illumination Layout Module"
    });

    addItem({
      category: "Boxes",
      name: `Junction Box, Octagonal Metal`,
      description: `Steel octagonal junction box housings for fixture terminal junction boxes`,
      brand: "Kotatsu",
      specification: "Galvanized 4-inch octagonal utility box, 1/2\" and 3/4\" knockouts",
      quantity: totalProjectLightingFixturesCount,
      unit: "pcs",
      unitCost: 65,
      laborCostPerUnit: 25,
      remarks: "Fixture junction endpoint housings",
      source: "Illumination Layout Module"
    });

    // Switches based on fixture count (approx 1 gang per 8 fixtures)
    const switchCount = Math.ceil(totalProjectLightingFixturesCount / 8) || 2;
    addItem({
      category: "Switches",
      name: `Flush Wall Switch, 1-Gang, Wide Series`,
      description: `Modern flush wall switch, 10A, 250V AC, quiet rocker design`,
      brand: "Panasonic",
      specification: `Single gang wall plate and mounting frame, compliant with PEC Article 4.04`,
      quantity: switchCount,
      unit: "pcs",
      unitCost: 125,
      laborCostPerUnit: 35,
      remarks: "Lighting loop switch controls",
      source: "Illumination Layout Module"
    });

    addItem({
      category: "Boxes",
      name: `Utility Box, Rectangular Metal, 2"x4"`,
      description: "Steel rectangular flush utility wall box for switches mounting",
      brand: "Kotatsu",
      specification: "Galvanized utility box with multiple knockouts",
      quantity: switchCount,
      unit: "pcs",
      unitCost: 45,
      laborCostPerUnit: 20,
      remarks: "Utility wall box backing",
      source: "Illumination Layout Module"
    });
  }


  // 5. BRANCH CIRCUITS TAKE-OFF ENGINE (MDP + SUBPANELS)
  const processPanelCircuits = (p: PanelConfig, panelCircuits: Circuit[], panelId: string) => {
    logs.push(`[${timestamp}] Rules Engine: Sizing branch materials for Panelboard: ${panelId}`);
    const pInsulationLabel = formatInsulationLabel(p.insulationType || "THHN");

    panelCircuits.forEach(c => {
      // Breakers
      addItem({
        category: "Breakers",
        name: `Circuit Breaker MCB, ${c.mcbAT || 20}AT/${c.mcbAF || 50}AF, ${c.mcbP || 2}P`,
        description: `Branch circuit protection thermal-magnetic circuit breaker, ${c.mcbKAIC || "10"} kAIC`,
        brand: settings.preferredBrandBreakers,
        specification: `Molded Miniature Circuit Breaker (MCB), compliant with PEC Article 2.40`,
        quantity: 1,
        unit: "pcs",
        unitCost: c.mcbAF && c.mcbAF > 50 ? 2800 : 1250,
        laborCostPerUnit: 250,
        remarks: `Circuit ${c.circuitNo} Protection`,
        source: `Panel [${panelId}] Circuit ${c.circuitNo}`
      });

      // Conductors (Phase wires)
      const bLength = getCircuitLength(c.id);
      const bPhaseSize = c.wireSizeOverride || c.calculatedWireSize || c.wireSize || "2.0";
      const bPoles = c.mcbP || 2;
      const bPhaseMeters = bLength * bPoles * wasteConductorsFactor;
      const bPhaseCost = getWirePricePerMeter(bPhaseSize);

      addItem({
        category: "Conductors",
        name: `Copper Conductor ${pInsulationLabel}, ${bPhaseSize} mm²`,
        description: "Branch circuit phase power wire cables",
        brand: settings.preferredBrandConductors,
        specification: "Annealed copper wire, lead-free PVC/Nylon jacket insulation, 90°C thermal rated",
        quantity: Math.ceil(bPhaseMeters),
        unit: "meters",
        unitCost: bPhaseCost,
        laborCostPerUnit: bPhaseCost * 0.30,
        remarks: `Circuit ${c.circuitNo} Phase Wires (${bPoles} x ${bLength}m)`,
        source: `Panel [${panelId}] Circuit ${c.circuitNo}`
      });

      // Grounding conductor (EGC) - sized according to PEC Table 2.50.6.13
      const bEgcSize = getEgcSizeStr(c.mcbAT || 20);
      const bEgcMeters = bLength * 1 * wasteConductorsFactor;
      const bEgcCost = getWirePricePerMeter(bEgcSize);

      addItem({
        category: "Grounding",
        name: `Equipment Grounding Conductor EGC, Copper ${pInsulationLabel}, ${bEgcSize} mm²`,
        description: "Branch circuit equipment ground safety green wire cable",
        brand: settings.preferredBrandConductors,
        specification: "Solid or stranded annealed copper, green jacket, compliant with PEC Sec 2.50.6.13",
        quantity: Math.ceil(bEgcMeters),
        unit: "meters",
        unitCost: bEgcCost,
        laborCostPerUnit: bEgcCost * 0.30,
        remarks: `Circuit ${c.circuitNo} Ground Wire (1 x ${bLength}m)`,
        source: `Panel [${panelId}] Circuit ${c.circuitNo}`
      });

      // Conduit
      const bWireSets = c.wireSets || 1;
      const bConduitType = c.conduitTypeOverride || c.conduitType || "PVC";
      const bConduitSize = c.conduitSizeOverride || c.conduitSize || getMinimumConduitSize(bPhaseSize, bPoles);
      const bConduitMeters = bLength * wasteConduitsFactor * bWireSets;
      const bConduitCost = getConduitPricePerMeter(bConduitSize, bConduitType);

      addItem({
        category: "Conduits",
        name: `Raceway Conduit pipeline, ${bConduitType}, ${bConduitSize}mm Ø`,
        description: "Branch circuit pipeline conduit raceway protection sleeve",
        brand: settings.preferredBrandConduits,
        specification: `${bConduitType} Conduit, standard thick-wall utility grade`,
        quantity: Math.ceil(bConduitMeters),
        unit: "meters",
        unitCost: bConduitCost,
        laborCostPerUnit: bConduitCost * 0.35,
        remarks: `Circuit ${c.circuitNo} Raceway Conduit (${bLength}m x ${bWireSets} runs)`,
        source: `Panel [${panelId}] Circuit ${c.circuitNo}`
      });

      // Conduit Accessories
      const bCouplingCount = Math.ceil(bLength / 3) * wasteAccessoriesFactor * bWireSets;
      const bStrapsCount = Math.ceil(bLength / 1.5) * wasteAccessoriesFactor * bWireSets;
      const totalBranchConductors = bPoles + 1; // Phases + Ground
      const bLugCount = totalBranchConductors * 2;

      addItem({
        category: "Accessories",
        name: `Conduit Coupling, ${bConduitSize}mm Ø`,
        description: `Sleeve connection coupling matching ${bConduitSize}mm piping`,
        brand: settings.preferredBrandAccessories,
        specification: `Sleeve pipe joint standard matching ${bConduitType}`,
        quantity: Math.ceil(bCouplingCount),
        unit: "pcs",
        unitCost: bConduitType === "PVC" ? 12 : 38,
        laborCostPerUnit: 8,
        remarks: `Couplings for circuit ${c.circuitNo} conduit`,
        source: `Panel [${panelId}] Circuit ${c.circuitNo}`
      });

      addItem({
        category: "Accessories",
        name: `Conduit Locknut with Adapter/Connector, ${bConduitSize}mm Ø`,
        description: `Knockout adapter connector with locking ring matching ${bConduitSize}mm`,
        brand: settings.preferredBrandAccessories,
        specification: "Connector fitting, locknut ring, and throat adapter assembly",
        quantity: 2 * bWireSets,
        unit: "sets",
        unitCost: bConduitType === "PVC" ? 18 : 65,
        laborCostPerUnit: 15,
        remarks: `Adapters for circuit ${c.circuitNo} conduit endpoints`,
        source: `Panel [${panelId}] Circuit ${c.circuitNo}`
      });

      if (bConduitType === "IMC" || bConduitType === "RSC") {
        addItem({
          category: "Accessories",
          name: `Insulated Grounding Bushing, ${bConduitSize}mm Ø`,
          description: `Threaded metal conduit protective bushing for wire shielding, compliant with PEC 3.0.1.4`,
          brand: settings.preferredBrandAccessories,
          specification: "Galvanized zinc body, high temperature plastic liner throat",
          quantity: 2 * bWireSets,
          unit: "pcs",
          unitCost: 85,
          laborCostPerUnit: 25,
          remarks: `Insulated bushings for metal conduit endpoints`,
          source: `Panel [${panelId}] Circuit ${c.circuitNo}`
        });
      }

      addItem({
        category: "Accessories",
        name: `Conduit Support Strap, ${bConduitSize}mm Ø`,
        description: `Pipe mounting wall support clips for securing pipeline structure`,
        brand: settings.preferredBrandAccessories,
        specification: "Steel support strap clamps, zinc plated for corrosion resistance",
        quantity: Math.ceil(bStrapsCount),
        unit: "pcs",
        unitCost: 10,
        laborCostPerUnit: 5,
        remarks: `Support straps spaced 1.5m along conduit`,
        source: `Panel [${panelId}] Circuit ${c.circuitNo}`
      });

      addItem({
        category: "Accessories",
        name: `Solderless Copper Compression Lug, ${bPhaseSize} mm²`,
        description: `Copper terminal lugs for branch cable terminations matching Phase size`,
        brand: settings.preferredBrandAccessories,
        specification: "Seamless copper compression lugs, electro-tin plated",
        quantity: bLugCount,
        unit: "pcs",
        unitCost: getLugPrice(bPhaseSize),
        laborCostPerUnit: 20,
        remarks: `Conductor compression terminations`,
        source: `Panel [${panelId}] Circuit ${c.circuitNo}`
      });

      addItem({
        category: "Accessories",
        name: `Color-Coded Heat Shrink Tubing, ${bPhaseSize} mm²`,
        description: "Heat shrink sleeves for phase conductor coloring & endpoint insulation",
        brand: settings.preferredBrandAccessories,
        specification: "Cross-linked polyolefin, 3:1 shrink ratio, flame retardant",
        quantity: bLugCount,
        unit: "pcs",
        unitCost: 15,
        laborCostPerUnit: 5,
        remarks: "Tubing insulation for lugs",
        source: `Panel [${panelId}] Circuit ${c.circuitNo}`
      });

      // Wiring Devices & Fixtures (fallback when global illumination count is zero or for specific circuits)
      if (c.loadType === "L") {
        if (totalProjectLightingFixturesCount === 0) {
          const fixturesQty = Math.ceil(c.loadVA / 50) || 1;
          addItem({
            category: "Lighting",
            name: `LED Recessed Downlight Luminaire, 9W`,
            description: "Circular recessed ceiling LED downlight fixture, daylight (6500K)",
            brand: "Philips",
            specification: "230V rating, daylight color spectrum, high lumen output",
            quantity: fixturesQty,
            unit: "pcs",
            unitCost: 450,
            laborCostPerUnit: 85,
            remarks: `LED lighting fixtures for loop circuit ${c.circuitNo}`,
            source: `Panel [${panelId}] Circuit ${c.circuitNo}`
          });

          addItem({
            category: "Boxes",
            name: "Junction Box, Octagonal Metal",
            description: "Steel octagonal junction box housing for branch light fixture joints",
            brand: "Kotatsu",
            specification: "Galvanized 4-inch octagonal utility box",
            quantity: fixturesQty,
            unit: "pcs",
            unitCost: 65,
            laborCostPerUnit: 25,
            remarks: `Fixture junction box housings`,
            source: `Panel [${panelId}] Circuit ${c.circuitNo}`
          });

          const branchSwCount = Math.ceil(fixturesQty / 8) || 1;
          addItem({
            category: "Switches",
            name: "Flush Wall Switch, 1-Gang, Wide Series",
            description: "Flush wall switch, 10A, rocker quiet series",
            brand: "Panasonic",
            specification: "Modern rocker switch with flush single faceplate",
            quantity: branchSwCount,
            unit: "pcs",
            unitCost: 125,
            laborCostPerUnit: 35,
            remarks: `Control wall switches for circuit ${c.circuitNo}`,
            source: `Panel [${panelId}] Circuit ${c.circuitNo}`
          });

          addItem({
            category: "Boxes",
            name: "Utility Box, Rectangular Metal, 2\"x4\"",
            description: "Steel rectangular flush utility wall box backing for wall switches",
            brand: "Kotatsu",
            specification: "Galvanized rectangular mounting box",
            quantity: branchSwCount,
            unit: "pcs",
            unitCost: 45,
            laborCostPerUnit: 20,
            remarks: `Utility box wall backing for switch ${c.circuitNo}`,
            source: `Panel [${panelId}] Circuit ${c.circuitNo}`
          });
        }
      } else if (c.loadType === LoadType.CONVENIENCE_OUTLET) {
        const outletQty = Math.ceil(c.loadVA / 180) || 1;
        addItem({
          category: "Devices",
          name: "Duplex Convenience Outlet with Ground, Wide Series",
          description: "Flush wall duplex convenience receptacle outlet with grounding terminal, 16A, 250V AC",
          brand: "Panasonic",
          specification: "Flat-pin ground series plate and frame, compliant with PEC Article 4.06",
          quantity: outletQty,
          unit: "pcs",
          unitCost: 180,
          laborCostPerUnit: 45,
          remarks: `Convenience receptacles for circuit ${c.circuitNo}`,
          source: `Panel [${panelId}] Circuit ${c.circuitNo}`
        });

        addItem({
          category: "Boxes",
          name: "Utility Box, Rectangular Metal, 2\"x4\"",
          description: "Steel rectangular flush wall backing box housing for receptacles",
          brand: "Kotatsu",
          specification: "Galvanized steel wall utility box",
          quantity: outletQty,
          unit: "pcs",
          unitCost: 45,
          laborCostPerUnit: 20,
          remarks: `Utility box wall backing for receptacle ${c.circuitNo}`,
          source: `Panel [${panelId}] Circuit ${c.circuitNo}`
        });
      }
    });
  };

  // Process MDP
  processPanelCircuits(panel, circuits, mdpId);

  // Process Subpanels
  subPanels.forEach(sp => {
    const spId = sp.panel.designation || `Sub-Panel ${sp.id}`;
    const spMainAmp = sp.panel.mainBreakerAT || 60;
    const spPoles = sp.panel.system.includes("3PH") ? 3 : 2;
    const spBreakerCost = spMainAmp > 100 ? 5800 : 1250;

    // Subpanel Main Breaker
    addItem({
      category: "Breakers",
      name: `Main Panelboard Breaker MCB, ${spMainAmp}AT/${sp.panel.mainBreakerAF || 50}AF, ${spPoles}P`,
      description: `Subpanel main protection miniature circuit breaker, ${sp.panel.icRating || "10"} kAIC`,
      brand: settings.preferredBrandBreakers,
      specification: `Miniature Circuit Breaker (MCB) assembly, compliant with PEC Sec 2.40`,
      quantity: 1,
      unit: "pcs",
      unitCost: spBreakerCost,
      laborCostPerUnit: 250,
      remarks: `Main Overcurrent Protection for subpanel ${spId}`,
      source: `Panel [${spId}] Main`
    });

    // Subpanel Enclosure Box Cabinet
    addItem({
      category: "Distribution Equipment",
      name: `Subpanel Cabinet Enclosure, ${sp.circuits.length}-Branches`,
      description: "Sub-distribution panelboard metal cabinet with locking door cover",
      brand: settings.preferredBrandBreakers,
      specification: "Powder coated NEMA 1 surface or flush wall cabinet",
      quantity: 1,
      unit: "pcs",
      unitCost: 7500,
      laborCostPerUnit: 1800,
      remarks: "Subpanel cabinet housing",
      source: `Panel [${spId}] Main`
    });

    // Subpanel Feeder conductors
    const spInsulationLabel = formatInsulationLabel(sp.panel.insulationType || "THHN");
    const computedSP = computePanelScheduleValues(sp.panel, sp.circuits);
    const spFeeder = computedSP.mainFeeder;
    const sfLength = getFeederLength(sp.id);
    const sfPhaseSize = spFeeder.wire.size.toString() || "8.0";
    const sfPhaseCount = sp.panel.system.includes("3PH") ? 3 : 2;
    const sfPhaseMeters = sfLength * sfPhaseCount * wasteConductorsFactor;
    const sfPhaseCost = getWirePricePerMeter(sfPhaseSize);

    addItem({
      category: "Conductors",
      name: `Subpanel Feeder Conductor, Copper ${spInsulationLabel}, ${sfPhaseSize} mm²`,
      description: "Distribution subpanel power feeder phase wires",
      brand: settings.preferredBrandConductors,
      specification: "annealed copper stranded cable, PVC/Nylon lead-free jacket, 90°C thermal rated",
      quantity: Math.ceil(sfPhaseMeters),
      unit: "meters",
      unitCost: sfPhaseCost,
      laborCostPerUnit: sfPhaseCost * 0.25,
      remarks: `Subpanel Feeder Phases (${sfPhaseCount} x ${sfLength}m)`,
      source: `Panel [${spId}] Feeder`
    });

    // Neutral wire
    const sfNeutralSize = sfPhaseSize;
    const sfNeutralMeters = sfLength * 1 * wasteConductorsFactor;
    const sfNeutralCost = getWirePricePerMeter(sfNeutralSize);
    addItem({
      category: "Conductors",
      name: `Subpanel Neutral Conductor, Copper ${spInsulationLabel}, ${sfNeutralSize} mm²`,
      description: "Distribution subpanel neutral wire cable",
      brand: settings.preferredBrandConductors,
      specification: "annealed copperstranded wire, lead-free white jacket, 90°C rated",
      quantity: Math.ceil(sfNeutralMeters),
      unit: "meters",
      unitCost: sfNeutralCost,
      laborCostPerUnit: sfNeutralCost * 0.25,
      remarks: `Subpanel Feeder Neutral (1 x ${sfLength}m)`,
      source: `Panel [${spId}] Feeder`
    });

    // Equipment Grounding conductor (EGC) for subpanel
    const sfEgcSize = spFeeder.groundSize || "5.5";
    const sfEgcMeters = sfLength * 1 * wasteConductorsFactor;
    const sfEgcCost = getWirePricePerMeter(sfEgcSize);
    addItem({
      category: "Grounding",
      name: `Subpanel Ground Conductor EGC, Copper ${spInsulationLabel}, ${sfEgcSize} mm²`,
      description: "Distribution subpanel equipment ground safety green wire cable",
      brand: settings.preferredBrandConductors,
      specification: "Solid copper, green lead-free insulation jacket, compliant with PEC Table 2.50.6.13",
      quantity: Math.ceil(sfEgcMeters),
      unit: "meters",
      unitCost: sfEgcCost,
      laborCostPerUnit: sfEgcCost * 0.25,
      remarks: `Subpanel Feeder Ground (1 x ${sfLength}m)`,
      source: `Panel [${spId}] Feeder`
    });

    // Subpanel feeder conduit
    const sfConduitType = spFeeder.conduitType || "PVC";
    const sfConduitSize = spFeeder.conduitSize || "32";
    const sfConduitMeters = sfLength * wasteConduitsFactor;
    const sfConduitCost = getConduitPricePerMeter(sfConduitSize, sfConduitType);
    addItem({
      category: "Conduits",
      name: `Subpanel Feeder Conduit, ${sfConduitType}, ${sfConduitSize}mm Ø`,
      description: "Sub-distribution subpanel feeder conduit protection piping",
      brand: settings.preferredBrandConduits,
      specification: `${sfConduitType} Conduit, standard thick-wall utility grade`,
      quantity: Math.ceil(sfConduitMeters),
      unit: "meters",
      unitCost: sfConduitCost,
      laborCostPerUnit: sfConduitCost * 0.35,
      remarks: `Subpanel Feeder Raceway (${sfLength}m)`,
      source: `Panel [${spId}] Feeder`
    });

    // Feeder conduit accessories
    const sfCouplingCount = Math.ceil(sfLength / 3) * wasteAccessoriesFactor;
    const sfStrapsCount = Math.ceil(sfLength / 1.5) * wasteAccessoriesFactor;
    const totalSfConductors = sfPhaseCount + 2; // Phase + Neutral + Ground
    const sfLugCount = totalSfConductors * 2;

    addItem({
      category: "Accessories",
      name: `Conduit Coupling, ${sfConduitSize}mm Ø`,
      description: `Sleeve pipe coupling connection sleeve matching ${sfConduitSize}mm`,
      brand: settings.preferredBrandAccessories,
      specification: `pipe joint connector standard matching ${sfConduitType}`,
      quantity: Math.ceil(sfCouplingCount),
      unit: "pcs",
      unitCost: sfConduitType === "PVC" ? 18 : 55,
      laborCostPerUnit: 10,
      remarks: `Couplings for ${sfConduitSize}mm subpanel feeder`,
      source: `Panel [${spId}] Feeder`
    });

    addItem({
      category: "Accessories",
      name: `Conduit Locknut with Adapter/Connector, ${sfConduitSize}mm Ø`,
      description: `Adapter fitting fitting locking adapters for box termination lockouts`,
      brand: settings.preferredBrandAccessories,
      specification: "Knockout conduit connector terminal assembly with locknut sleeve",
      quantity: 2,
      unit: "sets",
      unitCost: sfConduitType === "PVC" ? 25 : 95,
      laborCostPerUnit: 20,
      remarks: `Box termination adapters for subpanel feeder conduit`,
      source: `Panel [${spId}] Feeder`
    });

    if (sfConduitType === "IMC" || sfConduitType === "RSC") {
      addItem({
        category: "Accessories",
        name: `Insulated Grounding Bushing, ${sfConduitSize}mm Ø`,
        description: `Threaded metal grounding bushing for metal raceway termination, compliant with PEC 3.0.1.4`,
        brand: settings.preferredBrandAccessories,
        specification: "Galvanized steel throat, plastic insulation ring liner",
        quantity: 2,
        unit: "pcs",
        unitCost: 110,
        laborCostPerUnit: 30,
        remarks: `Metallic bushing terminal safety joints`,
        source: `Panel [${spId}] Feeder`
      });
    }

    addItem({
      category: "Accessories",
      name: `Conduit Support Strap, ${sfConduitSize}mm Ø`,
      description: "Pipe support mounting clamps for securing pipeline structure",
      brand: settings.preferredBrandAccessories,
      specification: "Steel strap clamps, zinc plated for corrosion resistance",
      quantity: Math.ceil(sfStrapsCount),
      unit: "pcs",
      unitCost: 15,
      laborCostPerUnit: 8,
      remarks: `Support straps spaced 1.5m along subpanel feeder`,
      source: `Panel [${spId}] Feeder`
    });

    addItem({
      category: "Accessories",
      name: `Solderless Copper Compression Lug, ${sfPhaseSize} mm²`,
      description: "Copper terminal lugs for subpanel cable terminations matching Phase size",
      brand: settings.preferredBrandAccessories,
      specification: "Seamless copper compression lugs, electro-tin plated",
      quantity: sfLugCount,
      unit: "pcs",
      unitCost: getLugPrice(sfPhaseSize),
      laborCostPerUnit: 30,
      remarks: `Cable lugs for subpanel feeder connections`,
      source: `Panel [${spId}] Feeder`
    });

    addItem({
      category: "Accessories",
      name: `Color-Coded Heat Shrink Tubing, ${sfPhaseSize} mm²`,
      description: "Heat shrink sleeves for subpanel conductor phase identification",
      brand: settings.preferredBrandAccessories,
      specification: "Cross-linked polyolefin, 3:1 shrink ratio, flame retardant",
      quantity: sfLugCount,
      unit: "pcs",
      unitCost: 25,
      laborCostPerUnit: 10,
      remarks: `Phase insulation coloring sleeves`,
      source: `Panel [${spId}] Feeder`
    });

    // Process Subpanel Circuits
    processPanelCircuits(sp.panel, sp.circuits, spId);
  });

  logs.push(`[${timestamp}] Rules Engine: Successfully calculated ${generatedItems.length} takeoff line items.`);

  return { items: generatedItems, logs };
};
