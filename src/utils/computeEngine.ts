import { PanelConfig, Circuit, LoadType } from '../types';
import { WIRE_AMPACITY_TABLE, STANDARD_CB_RATINGS } from '../constants';

// Conductor cross-sectional area (including THHN/THWN insulation overlay) for PEC Chapter 9 conduit fill sizing
const THHN_WIRE_AREAS: Record<number, number> = {
  2.0: 8.5,
  3.5: 11.5,
  5.5: 17.5,
  8.0: 28.3,
  14: 50.3,
  22: 85.0,
  30: 115.0,
  38: 140.0,
  50: 180.0,
  60: 220.0,
  80: 290.0,
  100: 350.0,
  125: 450.0,
  150: 530.0,
  175: 620.0,
  200: 710.0,
  250: 880.0,
  325: 1150.0,
  400: 1380.0,
  500: 1700.0,
};

const CONDUIT_FILL_TABLE = [
  { size: '15mm', limit: 78 },
  { size: '20mm', limit: 137 },
  { size: '25mm', limit: 220 },
  { size: '32mm', limit: 380 },
  { size: '40mm', limit: 518 },
  { size: '50mm', limit: 855 },
  { size: '65mm', limit: 1220 },
  { size: '80mm', limit: 1880 },
  { size: '90mm', limit: 2500 },
  { size: '100mm', limit: 3240 }
];

export const getWireForBreakerLocal = (cbRating: number, designAmpacity: number) => {
  const requiredAmpacity = Math.max(designAmpacity, cbRating);
  
  if (cbRating <= 30) {
    let minSize = 2.0;
    if (cbRating > 15 && cbRating <= 20) minSize = 3.5;
    else if (cbRating > 20 && cbRating <= 30) minSize = 5.5;
    
    const wire = WIRE_AMPACITY_TABLE.find(w => w.ampacity >= requiredAmpacity && w.size >= minSize) || WIRE_AMPACITY_TABLE[0];
    return { size: wire.size, ampacity: wire.ampacity, runs: 1 };
  }

  if (cbRating > 250) {
    let runs = 2;
    if (cbRating > 500) runs = 3;
    if (cbRating > 800) runs = 4;
    
    const targetAmpacityPerRun = requiredAmpacity / runs;
    const wire = WIRE_AMPACITY_TABLE.find(w => w.size >= 50 && w.ampacity >= targetAmpacityPerRun) 
                 || WIRE_AMPACITY_TABLE[WIRE_AMPACITY_TABLE.length - 1];
    
    return { size: wire.size, ampacity: wire.ampacity * runs, runs };
  }

  const wire = WIRE_AMPACITY_TABLE.find(w => w.ampacity >= requiredAmpacity) || WIRE_AMPACITY_TABLE[WIRE_AMPACITY_TABLE.length - 1];
  return { size: wire.size, ampacity: wire.ampacity, runs: 1 };
};

export const formatWireSizeLocal = (size: number): string =>
  size <= 8 ? size.toFixed(1) : size.toString();

export const getGroundWireForWireSizeLocal = (wireSize: number, cbRating: number): string => {
  let egcSize = 2.0;
  if (cbRating <= 15) egcSize = 2.0;
  else if (cbRating <= 20) egcSize = 3.5;
  else if (cbRating <= 30) egcSize = 5.5;
  else if (cbRating <= 60) egcSize = 8.0;
  else if (cbRating <= 100) egcSize = 14;
  else if (cbRating <= 200) egcSize = 22;
  else if (cbRating <= 300) egcSize = 30;
  else if (cbRating <= 400) egcSize = 38;
  else if (cbRating <= 600) egcSize = 50;
  else if (cbRating <= 800) egcSize = 60;
  else if (cbRating <= 1000) egcSize = 80;
  else if (cbRating <= 1200) egcSize = 100;
  else egcSize = 125;

  const actualSize = Math.min(egcSize, wireSize);
  return formatWireSizeLocal(actualSize);
};

export const getConduitSizeForWiresLocal = (wireSize: number, groundSizeString: string, poles: number, systemName: string): string => {
  let activePhaseCount = poles === 1 ? 2 : poles;
  if (poles === 3 && systemName.includes('4W')) {
    activePhaseCount = 4;
  }
  
  const phaseArea = THHN_WIRE_AREAS[wireSize] || (wireSize * 2.5);
  const groundSize = parseFloat(groundSizeString) || 2.0;
  const groundArea = THHN_WIRE_AREAS[groundSize] || (groundSize * 2.5);
  
  const totalArea = (phaseArea * activePhaseCount) + groundArea;
  const conduit = CONDUIT_FILL_TABLE.find(c => c.limit >= totalArea) || CONDUIT_FILL_TABLE[CONDUIT_FILL_TABLE.length - 1];
  return conduit.size;
};

export const computePanelScheduleValues = (p: PanelConfig, c: Circuit[]) => {
  const systemVoltage = p.system === '400V/230V, 3PH, 4W' ? 400 : 230;
  const totalVA = c.reduce((sum, curr) => sum + curr.loadVA, 0);

  let lightingReceptacleVA = 0;
  let motorVAs: number[] = [];

  const phaseLoads = { R: 0, Y: 0, B: 0 };
  const phaseVAs = { R: 0, Y: 0, B: 0 };
  const motorPhaseVAs = { R: 0, Y: 0, B: 0 };

  const getCircuitActiveLines = (phases: string[], connectionType: string | undefined): string[] => {
    if (phases.length === 3) {
      return ['R', 'Y', 'B'];
    }
    if (phases.length === 1) {
      const ph = phases[0];
      if (connectionType === 'Line-to-Line') {
        if (ph === 'R') return ['R', 'Y'];
        if (ph === 'Y') return ['Y', 'B'];
        if (ph === 'B') return ['B', 'R'];
      }
      return [ph];
    }
    return phases;
  };

  c.forEach((cir) => {
    if (cir.loadType === LoadType.SPACE || cir.loadType === LoadType.SPARE) return;
    
    const isMotor = cir.loadType === LoadType.AIR_CON || cir.loadType === LoadType.MOTOR;
    const activeLines = getCircuitActiveLines(cir.phases || [], p.connectionType);
    
    const perPhaseVA = cir.loadVA / (activeLines.length || 1);

    activeLines.forEach((ph) => {
      phaseLoads[ph as keyof typeof phaseLoads] += perPhaseVA;

      if (ph === "R") {
        phaseVAs.R += perPhaseVA;
        if (isMotor) motorPhaseVAs.R += perPhaseVA;
      }
      if (ph === "Y") {
        phaseVAs.Y += perPhaseVA;
        if (isMotor) motorPhaseVAs.Y += perPhaseVA;
      }
      if (ph === "B") {
        phaseVAs.B += perPhaseVA;
        if (isMotor) motorPhaseVAs.B += perPhaseVA;
      }
    });

    if (isMotor) {
      motorVAs.push(cir.loadVA);
    } else {
      lightingReceptacleVA += cir.loadVA;
    }
  });

  let lightingReceptacleDemand = lightingReceptacleVA;
  if (lightingReceptacleVA > 120000) {
    lightingReceptacleDemand =
      3000 * 1.0 +
      (120000 - 3000) * 0.35 +
      (lightingReceptacleVA - 120000) * 0.25;
  } else if (lightingReceptacleVA > 3000) {
    lightingReceptacleDemand = 3000 * 1.0 + (lightingReceptacleVA - 3000) * 0.35;
  }

  const largestMotor = motorVAs.length > 0 ? Math.max(...motorVAs) : 0;

  const phaseBaseCurrents = { R: 0, Y: 0, B: 0 };
  const phaseDesignCurrents = { R: 0, Y: 0, B: 0 };

  c.forEach((cir) => {
    if (cir.loadType === LoadType.SPACE || cir.loadType === LoadType.SPARE) return;

    const activeLines = getCircuitActiveLines(cir.phases || [], p.connectionType);
    const is3Phase = cir.phases && cir.phases.length === 3;
    let cirV = cir.voltage || (p.system === '400V/230V, 3PH, 4W' ? (is3Phase ? 400 : (p.connectionType === 'Line-to-Line' ? 400 : 230)) : 230);
    
    if (cir.loadType === LoadType.SUB_PANEL) {
      cirV = cir.voltage || cirV;
    }

    const loadI = is3Phase ? cir.loadVA / (cirV * 1.732) : cir.loadVA / cirV;
    const isContinuous = cir.loadType === LoadType.LIGHTING || cir.loadType === LoadType.AIR_CON || cir.loadType === LoadType.MOTOR;
    const designI = isContinuous ? loadI * 1.25 : loadI;

    if (is3Phase) {
      phaseBaseCurrents.R += loadI;
      phaseBaseCurrents.Y += loadI;
      phaseBaseCurrents.B += loadI;

      phaseDesignCurrents.R += designI;
      phaseDesignCurrents.Y += designI;
      phaseDesignCurrents.B += designI;
    } else {
      activeLines.forEach((ph) => {
        phaseBaseCurrents[ph as keyof typeof phaseBaseCurrents] += loadI;
        phaseDesignCurrents[ph as keyof typeof phaseDesignCurrents] += designI;
      });
    }
  });

  const motorCircuits = c.filter((cir) => cir.loadType === LoadType.MOTOR || cir.loadType === LoadType.AIR_CON);
  if (motorCircuits.length > 0) {
    let largestMotorCir = motorCircuits[0];
    motorCircuits.forEach((mc) => {
      const mcV = mc.voltage || (p.system === '400V/230V, 3PH, 4W' ? (mc.phases.length === 3 ? 400 : (p.connectionType === 'Line-to-Line' ? 400 : 230)) : 230);
      const largestV = largestMotorCir.voltage || (p.system === '400V/230V, 3PH, 4W' ? (largestMotorCir.phases.length === 3 ? 400 : (p.connectionType === 'Line-to-Line' ? 400 : 230)) : 230);
      
      const mcI = mc.phases.length === 3 ? mc.loadVA / (mcV * 1.732) : mc.loadVA / mcV;
      const largestI = largestMotorCir.phases.length === 3 ? largestMotorCir.loadVA / (largestV * 1.732) : largestMotorCir.loadVA / largestV;

      if (mcI > largestI) {
        largestMotorCir = mc;
      }
    });

    const isLargest3Phase = largestMotorCir.phases.length === 3;
    const largestMotorV = largestMotorCir.voltage || (p.system === '400V/230V, 3PH, 4W' ? (isLargest3Phase ? 400 : (p.connectionType === 'Line-to-Line' ? 400 : 230)) : 230);
    const largestMotorI = isLargest3Phase ? largestMotorCir.loadVA / (largestMotorV * 1.732) : largestMotorCir.loadVA / largestMotorV;

    const extraI = largestMotorI * 0.25;
    const activeLines = getCircuitActiveLines(largestMotorCir.phases || [], p.connectionType);
    activeLines.forEach((ph) => {
      phaseDesignCurrents[ph as keyof typeof phaseDesignCurrents] += extraI;
    });
  }

  if (lightingReceptacleVA > 0 && lightingReceptacleDemand < lightingReceptacleVA) {
    const demandReductionI = (lightingReceptacleVA - lightingReceptacleDemand) / (systemVoltage * (p.system.includes("3PH") ? 1.732 : 1));
    Object.keys(phaseDesignCurrents).forEach((ph) => {
      phaseDesignCurrents[ph as keyof typeof phaseDesignCurrents] = Math.max(
        phaseBaseCurrents[ph as keyof typeof phaseBaseCurrents],
        phaseDesignCurrents[ph as keyof typeof phaseDesignCurrents] - demandReductionI
      );
    });
  }

  let maxBaseAmp = 0;
  let maxDesignAmp = 0;

  if (p.system.includes("3PH")) {
    const localPhaseAmps = { R: 0, Y: 0, B: 0, threePhase: 0 };
    c.forEach((cir) => {
      if (cir.loadType === LoadType.SPACE || cir.loadType === LoadType.SPARE) return;
      
      const is3Phase = cir.phases && cir.phases.length === 3;
      let cirV = cir.voltage || (p.system === "400V/230V, 3PH, 4W" ? (is3Phase ? 400 : (p.connectionType === "Line-to-Line" ? 400 : 230)) : 230);
      if (cir.loadType === LoadType.SUB_PANEL) {
        cirV = cir.voltage || cirV;
      }
      const loadI = is3Phase ? cir.loadVA / (cirV * 1.732) : cir.loadVA / cirV;

      if (is3Phase) {
        localPhaseAmps.threePhase += loadI;
      } else {
        if (cir.phases.includes("R")) localPhaseAmps.R += loadI;
        if (cir.phases.includes("Y")) localPhaseAmps.Y += loadI;
        if (cir.phases.includes("B")) localPhaseAmps.B += loadI;
      }
    });

    const motorCircuits = c.filter(cir => cir.loadType === LoadType.MOTOR || cir.loadType === LoadType.AIR_CON);
    let HML = 0;
    motorCircuits.forEach((cir) => {
      const is3Phase = cir.phases && cir.phases.length === 3;
      let cirV = cir.voltage || (p.system === "400V/230V, 3PH, 4W" ? (is3Phase ? 400 : (p.connectionType === "Line-to-Line" ? 400 : 230)) : 230);
      const loadI = is3Phase ? cir.loadVA / (cirV * 1.732) : cir.loadVA / cirV;
      if (loadI > HML) {
        HML = loadI;
      }
    });

    const totalAmpere = Math.max(localPhaseAmps.R, localPhaseAmps.Y, localPhaseAmps.B);
    const maxDemandCurrent = (totalAmpere * 1.732) * 0.80 + localPhaseAmps.threePhase + (0.25 * HML);
    
    maxBaseAmp = maxDemandCurrent;
    maxDesignAmp = maxDemandCurrent;
  } else {
    const totalConnectedVA = c.reduce((sum, curr) => curr.loadType === LoadType.SPACE || curr.loadType === LoadType.SPARE ? sum : sum + curr.loadVA, 0);
    const motorCircuits = c.filter(cir => cir.loadType === LoadType.MOTOR || cir.loadType === LoadType.AIR_CON);
    let HML = 0;
    motorCircuits.forEach(cir => {
      const loadI = cir.loadA || (cir.loadVA / (cir.voltage || 230));
      if (loadI > HML) {
        HML = loadI;
      }
    });
    const maxDemandCurrent = (totalConnectedVA / 230) * 0.80 + (0.25 * HML);
    
    maxBaseAmp = maxDemandCurrent;
    maxDesignAmp = maxDemandCurrent;
  }

  const mainCurrent = { designAmp: maxDesignAmp, baseAmp: maxBaseAmp };

  // Calculate Main Feeder
  const designAmp = mainCurrent.designAmp;
  const maxBranchAT = Math.max(0, ...c.map((cir) => cir.mcbAT));
  const calculatedCb = STANDARD_CB_RATINGS.find((r) => r >= Math.max(designAmp, mainCurrent.baseAmp)) || 100;
  const cb = Math.max(
    calculatedCb,
    STANDARD_CB_RATINGS.find((r) => r >= maxBranchAT) || calculatedCb,
    30,
  );

  const poles = p.system.includes("3PH") ? 3 : 2;
  const wire = getWireForBreakerLocal(cb, designAmp);
  const groundSize = getGroundWireForWireSizeLocal(wire.size, cb);
  const conduitSize = getConduitSizeForWiresLocal(wire.size, groundSize, poles, p.system);

  const branchTypeCounts = c.reduce(
    (acc, cir) => {
      acc[cir.mcbType] = (acc[cir.mcbType] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  const sortedBranchTypes = Object.entries(branchTypeCounts).sort(
    (a, b) => Number(b[1]) - Number(a[1]),
  );
  const predominantBranchType = sortedBranchTypes[0]?.[0] || "MCB";
  let type = predominantBranchType;
  if (
    cb > 100 &&
    (type === "Plug-in" || type === "Bolt-on" || type === "MCB")
  ) {
    type = "MCCB";
  }
  const kaic = cb > 100 ? 18 : 10;
  const cbAF =
    cb <= 50
      ? 50
      : cb <= 100
        ? 100
        : cb <= 225
          ? 225
          : cb <= 400
            ? 400
            : 600;

  const maxPhaseLoad = Math.max(phaseLoads.R, phaseLoads.Y, phaseLoads.B);
  const phaseImbalance =
    maxPhaseLoad > 0
      ? (1 - Math.min(phaseLoads.R, phaseLoads.Y, phaseLoads.B) / maxPhaseLoad) *
        100
      : 0;

  const phaseAmps = { R: 0, Y: 0, B: 0, threePhase: 0 };
  c.forEach((cir) => {
    if (cir.phases.length === 3) {
      phaseAmps.threePhase += cir.loadA;
    } else {
      if (cir.phases.includes("R")) phaseAmps.R += cir.loadA;
      if (cir.phases.includes("Y")) phaseAmps.Y += cir.loadA;
      if (cir.phases.includes("B")) phaseAmps.B += cir.loadA;
    }
  });

  return {
    totalVA,
    phaseLoads,
    maxPhaseLoad,
    phaseImbalance,
    phaseAmps,
    mainCurrent,
    lightingReceptacleDemand,
    totalMotorDemandVA: motorVAs.reduce((a, b) => a + b, 0) + largestMotor * 0.25,
    lightingReceptacleVA,
    motorVAs,
    largestMotor,
    effectiveTotalBaseVA: p.system.includes("3PH") ? Math.max(phaseVAs.R, phaseVAs.Y, phaseVAs.B) * 3 : (lightingReceptacleVA + motorVAs.reduce((a, b) => a + b, 0)),
    mainFeeder: {
      wire,
      groundSize,
      cb,
      conduitSize,
      poles,
      type,
      kaic,
      af: cbAF,
    },
  };
};
