import React, { useState, useMemo, useEffect } from 'react';
import { ShieldAlert, Activity, GitBranch, Circle, Calculator, Link, Download } from 'lucide-react';
import { ShortCircuitParams, Circuit, PanelConfig, LoadType, VoltageDropCalculation } from '../types';
import { WIRE_AMPACITY_TABLE, STANDARD_CB_RATINGS, INITIAL_SHORT_CIRCUIT_PARAMS, WIRE_IMPEDANCE_TABLE } from '../constants';
import { exportToCAD } from '../utils/exportDxf';
import ImpedanceSLD from './ImpedanceSLD';
import { computePanelScheduleValues, parseSystemVoltage, calculatePanelFault, isIdleSpareOrSpace, calculateEquivalentFeederImpedance, getBreakerFrameSize } from '../utils/computeEngine';
import { R20_AL, R20_CU, cmag, cx, faultLevels, peakFactor, sourceImpedance } from '../utils/faultMath';

export interface ShortCircuitCalcProps {
  panel?: PanelConfig;
  circuits?: Circuit[];
  subPanels?: { id: string, panel: PanelConfig, circuits: Circuit[] }[];
  subSubPanels?: { id: string, panel: PanelConfig, circuits: Circuit[] }[];
  params: ShortCircuitParams;
  setParams: React.Dispatch<React.SetStateAction<ShortCircuitParams>>;
  source: string;
  setSource: React.Dispatch<React.SetStateAction<string>>;
  isPremium?: boolean;
  onRequestUpgrade?: () => void;
  setPanel?: (val: React.SetStateAction<PanelConfig>) => void;
  /** Feeder lengths for the impedance diagram */
  vdCalculations?: VoltageDropCalculation[];
}

export const detectPhaseType = (system: string | undefined): '1PH' | '3PH' => {
  if (!system) return '1PH';
  const s = system.toLowerCase();
  if (s.includes('3ph') || s.includes('3ø') || s.includes('three-phase') || s.includes('three phase')) {
    return '3PH';
  }
  return '1PH';
};

export const getMappedSystemForPhase = (currentSystem: string, targetPhase: '1PH' | '3PH'): string => {
  if (!currentSystem) return targetPhase === '1PH' ? '230V, 1PH, 2W' : '230V, 3PH, 3W';
  if (targetPhase === '1PH') {
    if (currentSystem.includes('120V')) {
      return '120V, 1PH, 2W';
    }
    if (currentSystem.includes('230V') || currentSystem.includes('220V') || currentSystem.includes('240V')) {
      return '230V, 1PH, 2W';
    }
    return '230V, 1PH, 2W';
  } else {
    if (currentSystem.includes('230V')) {
      return '230V, 3PH, 3W';
    } else if (currentSystem.includes('400V')) {
      return '400V/230V, 3PH, 4W';
    } else if (currentSystem.includes('480V')) {
      return '480V, 3PH, 3W';
    } else if (currentSystem.includes('380V')) {
      return '380V/220V, 3PH, 4W';
    }
    return '230V, 3PH, 3W';
  }
};

export const getRunsBySystem = (system?: string): number => {
  if (!system) return 1;
  try {
    const parsed = parseSystemVoltage(system);
    return parsed.wireCount;
  } catch (e) {
    return 1;
  }
};

export default function ShortCircuitCalc({ panel, circuits, subPanels, subSubPanels, params, setParams, source, setSource, isPremium = true, onRequestUpgrade, setPanel, vdCalculations }: ShortCircuitCalcProps) {

  const selectedPhaseType = useMemo(() => {
    return params.phaseTypeOverrideEnabled 
      ? (params.phaseTypeOverride || '3PH') 
      : detectPhaseType(panel?.system);
  }, [params.phaseTypeOverrideEnabled, params.phaseTypeOverride, panel?.system]);

  const { motorLoadVA, nonMotorLoadVA } = useMemo(() => {
    let mVA = 0;
    let nmVA = 0;
    
    // Add main panel circuits
    if (circuits && circuits.length > 0) {
      circuits.forEach(c => {
        const isMotorOrAC = c.loadType === LoadType.MOTOR || c.loadType === LoadType.AIR_CON;
        if (isMotorOrAC) {
          mVA += c.loadVA || 0;
        } else {
          nmVA += c.loadVA || 0;
        }
      });
    }

    // Add all sub-panels circuits
    if (subPanels && subPanels.length > 0) {
      subPanels.forEach(sp => {
        if (sp.circuits && sp.circuits.length > 0) {
          sp.circuits.forEach(c => {
            const isMotorOrAC = c.loadType === LoadType.MOTOR || c.loadType === LoadType.AIR_CON;
            if (isMotorOrAC) {
              mVA += c.loadVA || 0;
            } else {
              nmVA += c.loadVA || 0;
            }
          });
        }
      });
    }

    // Add all sub-sub-panels circuits
    if (subSubPanels && subSubPanels.length > 0) {
      subSubPanels.forEach(ssp => {
        if (ssp.circuits && ssp.circuits.length > 0) {
          ssp.circuits.forEach(c => {
            const isMotorOrAC = c.loadType === LoadType.MOTOR || c.loadType === LoadType.AIR_CON;
            if (isMotorOrAC) {
              mVA += c.loadVA || 0;
            } else {
              nmVA += c.loadVA || 0;
            }
          });
        }
      });
    }

    return { motorLoadVA: mVA, nonMotorLoadVA: nmVA };
  }, [circuits, subPanels, subSubPanels]);



  const allSubPanels = useMemo(() => {
    const list = [...(subPanels || [])];
    if (subSubPanels && subSubPanels.length > 0) {
      list.push(...subSubPanels);
    }
    return list;
  }, [subPanels, subSubPanels]);

  const panelSchedule = useMemo(() => {
    if (!panel || !circuits) return null;
    return computePanelScheduleValues(panel, circuits, {
      availableSubPanels: allSubPanels,
    });
  }, [panel, circuits, allSubPanels]);

  const calculation = useMemo(() => {
    const is3Phase = selectedPhaseType === '3PH';
    const factor = is3Phase ? 1.732 : 2.0;

    // Determine connection phase factors based on Philippine Electrical Code (PEC) Practices
    let connectionMultiplier = 1.0; // Default symmetrical 3-phase fault
    let groundFaultFactor = 1.0;
    
    if (params.transformerConnection?.includes('Open') || false) {
      // Open Delta (V-V) or Open Wye-Open Delta: Total fault capability is reduced 
      // typically to 86.6% (0.866) of an equivalent closed 3-phase bank.
      connectionMultiplier = 0.866; 
    } 
    
    // Check if the secondary is a Wye connection, which can permit high Line-to-Neutral ground fault currents
    if (params.transformerConnection === 'Wye (Star) Connection' || 
        params.transformerConnection === 'Delta-Wye (Δ-Y)' || 
        params.transformerConnection === 'Wye-Wye (Y-Y)' ||
        params.transformerConnection === 'Open Wye-Open Delta') {
      // Solidly grounded wye systems can have ground faults up to 125% of 3-Phase fault.
      groundFaultFactor = 1.25; 
    }

    // 1. Utility Isc
    const baseKVA = params.transformerKVA || 500;
    const baseKV = (params.transformerVoltage || 230) / 1000;
    const zUtilitypu = baseKVA / ((params.utilityShortCircuitMVA || 500) * 1000);
    
    // Demand load from Load Schedule
    const systemVoltage = params.transformerVoltage || panel?.voltage || 230;
    const demandAmp = panelSchedule?.mainCurrent?.baseAmp || panelSchedule?.mainCurrent?.designAmp || 0;
    const demandLoadKVA = demandAmp > 0 
      ? (demandAmp * systemVoltage * (is3Phase ? 1.732 : 1)) / 1000 
      : ((panelSchedule?.totalVA ? panelSchedule.totalVA / 1000 : baseKVA) * 0.8);

    // 2. Transformer Impedance & Parallel Support
    let zTranspu = (params.transformerZ || 5) / 100 / connectionMultiplier;
    let totalTransformerKVA = baseKVA;
    let transformer1Share = 100;
    let transformer2Share = 0;
    const ptCount = params.parallelTransformersCount || 1;
    let isBalanced = true;

    const transformerDetails: Array<{
      id: number;
      name: string;
      ratingKVA: number;
      zPercent: number;
      sharePercent: number;
      operatingKVA: number;
      operatingAmp: number;
      loadingPercent: number;
      isOverloaded: boolean;
    }> = [];

    if (ptCount > 1) {
      const ptZMatch = params.parallelTransformersZMatch !== false;
      const ptkVAMatch = params.parallelTransformerskVAMatch !== false;

      if (ptZMatch && ptkVAMatch) {
        zTranspu = zTranspu / ptCount;
        totalTransformerKVA = baseKVA * ptCount;
        const equalShare = 100 / ptCount;
        transformer1Share = equalShare;
        transformer2Share = equalShare;
        isBalanced = true;

        for (let i = 1; i <= ptCount; i++) {
          const opKVA = (demandLoadKVA * equalShare) / 100;
          const opAmp = demandAmp > 0 
            ? demandAmp / ptCount 
            : (opKVA * 1000) / (factor * systemVoltage);
          transformerDetails.push({
            id: i,
            name: `Transformer ${i}`,
            ratingKVA: baseKVA,
            zPercent: params.transformerZ || 5,
            sharePercent: equalShare,
            operatingKVA: opKVA,
            operatingAmp: opAmp,
            loadingPercent: baseKVA > 0 ? (opKVA / baseKVA) * 100 : 0,
            isOverloaded: opKVA > baseKVA * 1.005,
          });
        }
      } else {
        const z1pu = zTranspu;
        const t2Rating = params.parallelTransformersRating || 100;
        const t2Z = params.parallelTransformersZ || 5;
        const z2pu = ((t2Z / 100) / connectionMultiplier) * (baseKVA / t2Rating);
        
        const y1 = 1 / z1pu;
        const y2 = (ptCount - 1) / z2pu;
        zTranspu = 1 / (y1 + y2);
        totalTransformerKVA = baseKVA + (ptCount - 1) * t2Rating;

        const s1_z1 = baseKVA / (params.transformerZ || 5);
        const s2_z2 = t2Rating / t2Z;
        const totalAdmittance = s1_z1 + (ptCount - 1) * s2_z2;
        
        transformer1Share = totalAdmittance > 0 ? (s1_z1 / totalAdmittance) * 100 : (100 / ptCount);
        transformer2Share = totalAdmittance > 0 ? (s2_z2 / totalAdmittance) * 100 : (100 / ptCount);
        isBalanced = Math.abs(transformer1Share - transformer2Share) < 0.1;

        const opKVA1 = (demandLoadKVA * transformer1Share) / 100;
        const opAmp1 = (opKVA1 * 1000) / (factor * systemVoltage);
        transformerDetails.push({
          id: 1,
          name: `Transformer 1`,
          ratingKVA: baseKVA,
          zPercent: params.transformerZ || 5,
          sharePercent: transformer1Share,
          operatingKVA: opKVA1,
          operatingAmp: opAmp1,
          loadingPercent: baseKVA > 0 ? (opKVA1 / baseKVA) * 100 : 0,
          isOverloaded: opKVA1 > baseKVA * 1.005,
        });

        for (let i = 2; i <= ptCount; i++) {
          const opKVA = (demandLoadKVA * transformer2Share) / 100;
          const opAmp = (opKVA * 1000) / (factor * systemVoltage);
          transformerDetails.push({
            id: i,
            name: `Transformer ${i}`,
            ratingKVA: t2Rating,
            zPercent: t2Z,
            sharePercent: transformer2Share,
            operatingKVA: opKVA,
            operatingAmp: opAmp,
            loadingPercent: t2Rating > 0 ? (opKVA / t2Rating) * 100 : 0,
            isOverloaded: opKVA > t2Rating * 1.005,
          });
        }
      }
    } else {
      const opKVA = demandLoadKVA;
      const opAmp = demandAmp > 0 ? demandAmp : (opKVA * 1000) / (factor * systemVoltage);
      transformerDetails.push({
        id: 1,
        name: `Transformer 1`,
        ratingKVA: baseKVA,
        zPercent: params.transformerZ || 5,
        sharePercent: 100,
        operatingKVA: opKVA,
        operatingAmp: opAmp,
        loadingPercent: baseKVA > 0 ? (opKVA / baseKVA) * 100 : 0,
        isOverloaded: opKVA > baseKVA * 1.005,
      });
    }

    // 3. Feeder Impedance Estimate (Series vs Parallel)
    const runs = params.feederRuns || 1;
    const condType = params.conductorType || 'Copper';
    const connType = params.connectionType || 'Series';

    const eqFeeder = calculateEquivalentFeederImpedance(
      params.feederLength || 10,
      params.feederSize || '30',
      runs,
      condType,
      connType,
      params.parallelFeedersSizeMatch !== false,
      params.parallelFeedersLengthMatch !== false,
      params.parallelFeedersMaterialMatch !== false,
      params.parallelFeedersCustomSizes,
      params.parallelFeedersCustomLengths,
      params.parallelFeedersCustomMaterials,
    );

    const feederR = eqFeeder.r;
    const feederX = eqFeeder.x;

    // Shared short-circuit method (complex impedances, see utils/faultMath.ts): the same values as the
    // Load Schedule, the Power Analysis Suite and the Single Line Impedance Diagram
    const vSec = params.transformerVoltage || panel?.voltage || 230;
    const src = sourceImpedance(params, vSec, is3Phase);
    const zFeederOhm = cx(eqFeeder.r * (condType === 'Aluminum' ? R20_AL : R20_CU), eqFeeder.x);
    const atTerminals = faultLevels(src);
    const atPoint = faultLevels(src, zFeederOhm, { groundReturn: is3Phase });
    const zUtilitypuC = cmag(src.zUtility) / src.zBase;
    const zTranspuC = cmag(src.zTransformer) / src.zBase;
    const zFeederpu = (cmag(zFeederOhm) * (is3Phase ? 1 : 2)) / src.zBase;
    const totalZpu = cmag(atPoint.z1) / src.zBase;

    // FLA based on combined capacity
    const iFullLoad = (totalTransformerKVA * 1000) / ((is3Phase ? Math.sqrt(3) : 1) * vSec);

    const iscMainBreaker = atTerminals.i3ph;
    const iscFaultPoint = atPoint.i3ph;

    const motorContribution = motorLoadVA > 0 ? (motorLoadVA / ((is3Phase ? Math.sqrt(3) : 1) * vSec)) * 4 : 0;
    const multiplier = 1 / totalZpu;

    // Fault 1 (HV side or Primary Service Entrance) - Always uses 1.732 since the HV utility primary grid is 3-phase
    const fault1Isc = ((params.utilityShortCircuitMVA || 500) * 1000000) / (1.732 * (params.primaryVoltage || 34500));

    // Validations & Safety Warnings
    const warnings: string[] = [];

    // Phase Type & Equipment Compatibility Checks
    if (!is3Phase) {
      if (panel?.system?.includes("3PH")) {
        warnings.push("CRITICAL: Distribution Panel is configured for Three-Phase (3Ø) but calculation is running as Single-Phase (1Ø). Please update the system voltage in the Load Schedule.");
      }
      if (params.transformerConnection && !params.transformerConnection.includes("Single-Phase") && !params.transformerConnection.includes("Open")) {
        warnings.push("WARNING: Selected transformer connection is typically three-phase. For single-phase installations, a Single-Phase Transformer or Open Delta connection is recommended.");
      }
      if (params.feederRuns === 3) {
        warnings.push("WARNING: Feeder configuration has 3 runs/conductors, which is unusual for a standard Single-Phase (1Ø) system.");
      }
    } else {
      if (panel?.system && (panel.system.includes("1PH") || panel.system.includes("1Ø"))) {
        warnings.push("CRITICAL: Distribution Panel is configured for Single-Phase (1Ø) but calculation is running as Three-Phase (3Ø). Please update the system voltage in the Load Schedule.");
      }
      if (params.transformerConnection && params.transformerConnection.includes("Single-Phase")) {
        warnings.push("CRITICAL: Single-Phase Transformer connection cannot be used for a Three-Phase (3Ø) system.");
      }
    }

    if (ptCount > 1) {
      if (params.parallelTransformersVoltageMatch === false) {
        warnings.push("CRITICAL: Secondary voltage mismatch detected. Paralleling is prohibited due to risk of destructive circulating currents.");
      }
      if (params.parallelTransformersPhaseMatch === false) {
        warnings.push("CRITICAL: Different phase configurations. Paralleling will cause a catastrophic phase-to-phase short circuit.");
      }
      if (params.parallelTransformersFreqMatch === false) {
        warnings.push("CRITICAL: Different operating frequencies cannot be paralleled.");
      }
      if (params.parallelTransformersVectorMatch === false) {
        warnings.push("WARNING: Vector group mismatch. This will result in high circulating currents through neutral/ground.");
      }
      // Overloaded transformer check based on actual Load Schedule demand load
      if (demandLoadKVA > totalTransformerKVA * 1.005) {
        warnings.push(`WARNING: Total connected demand load (${demandLoadKVA.toFixed(1)} kVA) exceeds combined parallel transformer bank capacity (${totalTransformerKVA.toFixed(1)} kVA).`);
      }

      transformerDetails.forEach((tx) => {
        if (tx.isOverloaded) {
          const reason = isBalanced 
            ? "exceeds rated capacity" 
            : "due to mismatched impedances causing unequal load distribution";
          warnings.push(`WARNING: ${tx.name} is overloaded (${tx.loadingPercent.toFixed(0)}% of rating, ${tx.operatingKVA.toFixed(1)} kVA / ${tx.ratingKVA} kVA) ${reason}.`);
        }
      });
    }

    if (runs > 1 && connType === 'Parallel') {
      if (params.parallelFeedersSizeMatch === false) {
        warnings.push("WARNING: Unequal parallel conductor sizes detected. Smaller cables may carry excessive current, leading to overheating.");
      }
      if (params.parallelFeedersLengthMatch === false) {
        warnings.push("WARNING: Unequal lengths in parallel conductors will cause impedance mismatch, leading to unequal current distribution.");
      }
      if (params.parallelFeedersMaterialMatch === false) {
        warnings.push("WARNING: Mixed Copper/Aluminum conductors in parallel. Standard engineering codes prohibit this due to differing resistance coefficients.");
      }
    }

    return {
      fla: iFullLoad.toFixed(2),
      iFullLoad: iFullLoad.toFixed(2),
      iscMainBreaker: iscMainBreaker.toFixed(2),
      iscSecondary: iscFaultPoint.toFixed(2),
      motorContribution: motorContribution.toFixed(2),
      totalFaultM: (iscFaultPoint + motorContribution).toFixed(2),
      feederR: feederR.toFixed(4),
      feederX: feederX.toFixed(4),
      zFeederpu: zFeederpu.toFixed(5),
      zUtilitypu: zUtilitypuC.toFixed(5),
      zTranspu: zTranspuC.toFixed(5),
      // Fault types at the fault point (bolted, without motor contribution), A
      iscLL: atPoint.iLL,
      iscLG: atPoint.iLG,
      iscLLG: atPoint.iLLG,
      iscLLGEarth: atPoint.iLLGEarth,
      xrPoint: atPoint.xr,
      iscPeak: peakFactor(atPoint.xr) * Math.SQRT2 * (iscFaultPoint + motorContribution),
      multiplier: multiplier.toFixed(2),
      iscFault1: fault1Isc.toFixed(2),
      iscFault2: iscMainBreaker.toFixed(2),
      iscFault3: (iscFaultPoint + motorContribution).toFixed(2),
      connectionMultiplier: connectionMultiplier.toFixed(3),
      groundFaultFactor: groundFaultFactor.toFixed(2),
      totalTransformerKVA,
      transformer1Share,
      transformer2Share,
      transformerDetails,
      isBalanced,
      demandLoadKVA,
      eqFeeder,
      warnings
    };
  }, [params, motorLoadVA, panel, selectedPhaseType, panelSchedule]);

  const kaicValidationData = useMemo(() => {
    const list: Array<{
      id: string;
      location: string;
      type: string;
      faultCurrentA: number;
      selectedKAIC: number;
      status: "PASS" | "FAIL";
      recommendation: string;
    }> = [];
    const seenIds = new Set<string>();

    const pushUnique = (item: {
      id: string;
      location: string;
      type: string;
      faultCurrentA: number;
      selectedKAIC: number;
      status: "PASS" | "FAIL";
      recommendation: string;
    }) => {
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        list.push(item);
      }
    };

    if (!panel) return list;

    const standardKAICRatings = [5, 10, 14, 18, 22, 25, 30, 35, 42, 50, 65, 85, 100];

    // 1. MDP Main Breaker
    const mdpFaultA = parseFloat(calculation.iscFault2) || 10000;
    const mdpKAICSelected = parseFloat(panel.icRating) || 10;
    const mdpFaultKA = mdpFaultA / 1000;
    const mdpPass = mdpKAICSelected >= mdpFaultKA;
    const recMdp = standardKAICRatings.find(k => k >= mdpFaultKA) || 100;

    pushUnique({
      id: "mdp-main",
      location: panel.designation || "Main Distribution Panel (MDP) Main Breaker",
      type: "Main Protective Device",
      faultCurrentA: mdpFaultA,
      selectedKAIC: mdpKAICSelected,
      status: mdpPass ? "PASS" : "FAIL",
      recommendation: mdpPass 
        ? "Breaker is adequately sized for maximum short-circuit duty." 
        : `INSUFFICIENT kAIC: Upgrade main breaker rating to at least ${recMdp} kAIC immediately.`,
    });

    // 2. MDP Branch Protective Devices
    if (circuits && circuits.length > 0) {
      circuits.forEach(c => {
        if (isIdleSpareOrSpace(c)) return;
        const branchFaultA = parseFloat(calculation.iscFault3) || 10000;
        const branchFaultKA = branchFaultA / 1000;
        const branchKAICSelected = c.mcbKAIC || 10;
        const bPass = branchKAICSelected >= branchFaultKA;
        const recB = standardKAICRatings.find(k => k >= branchFaultKA) || 100;

        pushUnique({
          id: `mdp-branch-${c.circuitNo}`,
          location: `${panel.designation || "MDP"} - Circuit ${c.circuitNo} (${c.description})`,
          type: "Branch Circuit Breaker",
          faultCurrentA: branchFaultA,
          selectedKAIC: branchKAICSelected,
          status: bPass ? "PASS" : "FAIL",
          recommendation: bPass
            ? "Circuit breaker is adequate."
            : `Recommend MCCB upgrade to at least ${recB} kAIC.`,
        });
      });
    }

    // 3. Subpanels
    if (subPanels && subPanels.length > 0) {
      subPanels.forEach(sp => {
        let spFaultA = 10000;
        let parentConn = circuits?.find(c => c.linkedSubPanelId === sp.id);
        if (!parentConn && subPanels) {
          parentConn = subPanels.flatMap(otherSp => otherSp.circuits).find(c => c.linkedSubPanelId === sp.id);
        }

        if (parentConn) {
          const feederLen = params.feederLength || 10;
          const feederSize = parentConn.wireSize || "14";
          const feederRuns = parentConn.quantity || 1;
          const motorVA = sp.circuits.reduce((acc, curr) => 
            (curr.loadType as any === LoadType.MOTOR || curr.loadType as any === LoadType.AIR_CON) ? acc + (curr.loadVA || 0) : acc, 0
          );
          spFaultA = calculatePanelFault(
            sp.panel,
            params,
            feederLen,
            feederSize,
            feederRuns,
            motorVA
          );
        } else {
          spFaultA = calculatePanelFault(sp.panel, params, undefined, undefined, undefined, 0);
        }

        const spFaultKA = spFaultA / 1000;
        const spKAICSelected = parseFloat(sp.panel.icRating) || 10;
        const spPass = spKAICSelected >= spFaultKA;
        const recSp = standardKAICRatings.find(k => k >= spFaultKA) || 100;

        pushUnique({
          id: `sp-${sp.id}-main`,
          location: `${sp.panel.designation || `Subpanel ${sp.id}`} Main Breaker`,
          type: "Subpanel Main Device",
          faultCurrentA: spFaultA,
          selectedKAIC: spKAICSelected,
          status: spPass ? "PASS" : "FAIL",
          recommendation: spPass
            ? "Main breaker is adequate for short-circuit duty."
            : `INSUFFICIENT kAIC: Upgrade to minimum ${recSp} kAIC protection.`,
        });

        // Subpanel branch circuits
        sp.circuits.forEach(c => {
          if (isIdleSpareOrSpace(c)) return;
          const branchFaultKA = spFaultKA;
          const branchKAICSelected = c.mcbKAIC || 10;
          const bPass = branchKAICSelected >= branchFaultKA;
          const recB = standardKAICRatings.find(k => k >= branchFaultKA) || 100;

          pushUnique({
            id: `sp-${sp.id}-branch-${c.circuitNo}`,
            location: `${sp.panel.designation || `Subpanel ${sp.id}`} - Circuit ${c.circuitNo} (${c.description})`,
            type: "Branch Circuit Breaker",
            faultCurrentA: spFaultA,
            selectedKAIC: branchKAICSelected,
            status: bPass ? "PASS" : "FAIL",
            recommendation: bPass
              ? "Circuit breaker is adequate."
              : `Recommend upgrade to ${recB} kAIC.`,
          });
        });
      });
    }

    // 4. Sub-subpanels
    if (subSubPanels && subSubPanels.length > 0) {
      subSubPanels.forEach(ssp => {
        let sspFaultA = 8000;
        let parentConn = subPanels?.flatMap(sp => sp.circuits).find(c => c.linkedSubPanelId === ssp.id);
        if (parentConn) {
          const feederLen = params.feederLength || 10;
          const feederSize = parentConn.wireSize || "14";
          const feederRuns = parentConn.quantity || 1;
          const motorVA = ssp.circuits.reduce((acc, curr) => 
            (curr.loadType as any === LoadType.MOTOR || curr.loadType as any === LoadType.AIR_CON) ? acc + (curr.loadVA || 0) : acc, 0
          );
          sspFaultA = calculatePanelFault(
            ssp.panel,
            params,
            feederLen,
            feederSize,
            feederRuns,
            motorVA
          );
        } else {
          sspFaultA = calculatePanelFault(ssp.panel, params, undefined, undefined, undefined, 0);
        }

        const sspFaultKA = sspFaultA / 1000;
        const sspKAICSelected = parseFloat(ssp.panel.icRating) || 10;
        const sspPass = sspKAICSelected >= sspFaultKA;
        const recSsp = standardKAICRatings.find(k => k >= sspFaultKA) || 100;

        pushUnique({
          id: `ssp-${ssp.id}-main`,
          location: `${ssp.panel.designation || `Sub-Subpanel ${ssp.id}`} Main Breaker`,
          type: "Sub-Subpanel Main Device",
          faultCurrentA: sspFaultA,
          selectedKAIC: sspKAICSelected,
          status: sspPass ? "PASS" : "FAIL",
          recommendation: sspPass
            ? "Main breaker is adequate."
            : `INSUFFICIENT kAIC: Upgrade to minimum ${recSsp} kAIC.`,
        });

        ssp.circuits.forEach(c => {
          if (isIdleSpareOrSpace(c)) return;
          const branchFaultKA = sspFaultKA;
          const branchKAICSelected = c.mcbKAIC || 10;
          const bPass = branchKAICSelected >= branchFaultKA;
          const recB = standardKAICRatings.find(k => k >= branchFaultKA) || 100;

          pushUnique({
            id: `ssp-${ssp.id}-branch-${c.circuitNo}`,
            location: `${ssp.panel.designation || `Sub-Subpanel ${ssp.id}`} - Circuit ${c.circuitNo} (${c.description})`,
            type: "Branch Circuit Breaker",
            faultCurrentA: sspFaultA,
            selectedKAIC: branchKAICSelected,
            status: bPass ? "PASS" : "FAIL",
            recommendation: bPass
              ? "Circuit breaker is adequate."
              : `Recommend upgrade to ${recB} kAIC.`,
          });
        });
      });
    }

    return list;
  }, [panel, circuits, subPanels, subSubPanels, params, calculation]);

  const totalDevicesCount = kaicValidationData.length;
  const passedDevicesCount = kaicValidationData.filter(d => d.status === "PASS").length;
  const failedDevicesCount = kaicValidationData.filter(d => d.status === "FAIL").length;

  const handleCustomSizeChange = (index: number, val: string) => {
    const sizes = [...(params.parallelFeedersCustomSizes || [])];
    sizes[index] = val;
    setParams({ ...params, parallelFeedersCustomSizes: sizes });
  };
  const handleCustomLengthChange = (index: number, val: number) => {
    const lengths = [...(params.parallelFeedersCustomLengths || [])];
    lengths[index] = val;
    setParams({ ...params, parallelFeedersCustomLengths: lengths });
  };
  const handleCustomMaterialChange = (index: number, val: 'Copper' | 'Aluminum') => {
    const mats = [...(params.parallelFeedersCustomMaterials || [])];
    mats[index] = val;
    setParams({ ...params, parallelFeedersCustomMaterials: mats });
  };

  return (
    <div className="w-full max-w-full space-y-6">
      <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 overflow-hidden no-print">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-red-600 dark:text-red-400" />
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 font-sans">Calculation Parameters</h2>
          </div>
          {/* Connection Type Config */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setParams({ ...params, connectionType: 'Series' })}
              className={`px-3 py-1.5 rounded-lg text-xxs font-black tracking-wider uppercase transition-all ${
                (params.connectionType || 'Series') === 'Series'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm font-black'
                  : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 font-semibold'
              }`}
            >
              Series Connection
            </button>
            <button
              onClick={() => setParams({ ...params, connectionType: 'Parallel' })}
              className={`px-3 py-1.5 rounded-lg text-xxs font-black tracking-wider uppercase transition-all ${
                params.connectionType === 'Parallel'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm font-black'
                  : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 font-semibold'
              }`}
            >
              Parallel Connection
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          {circuits && panel && (
            <div className="space-y-1.5 p-4 bg-red-50/50 dark:bg-red-950/25 rounded-xl border border-red-100 dark:border-red-900/40">
              <label className="text-xs font-bold text-red-600 dark:text-red-400 uppercase flex items-center gap-1"><Link className="w-3 h-3" /> Connect to Load Schedule</label>
              <select 
                value={source} 
                onChange={e => {
                  const val = e.target.value;
                  setSource(val);
                  if (val === 'custom') {
                    setParams(INITIAL_SHORT_CIRCUIT_PARAMS);
                  } else if (val === 'auto') {
                    setParams(p => ({
                      ...p,
                      isFeederRunsCustomized: false,
                      isFeederSizeCustomized: false
                    }));
                  }
                }} 
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-red-200 dark:border-red-900 rounded-lg text-sm text-red-900 dark:text-red-200 font-medium font-sans mt-2 shadow-sm focus:outline-none"
              >
                <option value="custom" className="dark:bg-slate-900 dark:text-slate-100">Custom Parameters (Disconnected)</option>
                <option value="auto" className="dark:bg-slate-900 dark:text-slate-100">Auto-Size from {panel.designation} connected load ({(circuits.reduce((sum, c) => sum + c.loadVA, 0) / 1000).toFixed(2)} kVA)</option>
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase">Utility MVAsc</label>
                  <input type="number" value={params.utilityShortCircuitMVA} onChange={e => setParams({...params, utilityShortCircuitMVA: parseFloat(e.target.value)})} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-950 dark:text-slate-100 transition-all focus:ring-2 focus:ring-red-500 outline-none" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase">Pri Voltage (V)</label>
                  <input type="number" value={params.primaryVoltage} onChange={e => setParams({...params, primaryVoltage: parseFloat(e.target.value)})} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100 transition-all focus:ring-2 focus:ring-red-500 outline-none" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase">Sec Voltage (V)</label>
                  <input readOnly={source === 'auto'} type="number" value={params.transformerVoltage} onChange={e => setParams({...params, transformerVoltage: parseFloat(e.target.value)})} className={`w-full px-3 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-sm transition-all outline-none ${source === 'auto' ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 cursor-not-allowed' : 'bg-slate-50 dark:bg-slate-800 text-slate-950 dark:text-slate-100 focus:ring-2 focus:ring-red-500'}`} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase">Connection</label>
                  <select disabled={source === 'auto'} value={
                    params.transformerConnection === 'Delta-Wye' ? 'Delta-Wye (Δ-Y)' :
                    params.transformerConnection === 'Wye (Star)' ? 'Wye (Star) Connection' :
                    params.transformerConnection === 'Delta' ? 'Delta Connection' :
                    params.transformerConnection === 'Wye-Wye' ? 'Wye-Wye (Y-Y)' :
                    params.transformerConnection
                  } onChange={e => setParams({...params, transformerConnection: e.target.value})} className={`w-full px-3 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-sm transition-all outline-none ${source === 'auto' ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 cursor-not-allowed' : 'bg-slate-50 dark:bg-slate-800 text-slate-950 dark:text-slate-100 focus:ring-2 focus:ring-red-500'}`}>
                     <option value="Wye (Star) Connection" className="dark:bg-slate-900 dark:text-slate-100">Wye (Star) Connection</option>
                     <option value="Delta Connection" className="dark:bg-slate-900 dark:text-slate-100">Delta Connection</option>
                     <option value="Delta-Wye (Δ-Y)" className="dark:bg-slate-900 dark:text-slate-100">Delta-Wye (Δ-Y)</option>
                     <option value="Wye-Delta (Y-Δ)" className="dark:bg-slate-900 dark:text-slate-100">Wye-Delta (Y-Δ)</option>
                     <option value="Delta-Delta (Δ-Δ)" className="dark:bg-slate-900 dark:text-slate-100">Delta-Delta (Δ-Δ)</option>
                     <option value="Wye-Wye (Y-Y)" className="dark:bg-slate-900 dark:text-slate-100">Wye-Wye (Y-Y)</option>
                     <option value="Open Delta (V-V)" className="dark:bg-slate-900 dark:text-slate-100">Open Delta (V-V)</option>
                     <option value="Open Wye-Open Delta" className="dark:bg-slate-900 dark:text-slate-100">Open Wye-Open Delta</option>
                     <option value="Single-Phase Transformer" className="dark:bg-slate-900 dark:text-slate-100">Single-Phase Transformer</option>
                  </select>
                </div>
                
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase">Trans (kVA)</label>
                  <input readOnly={source === 'auto'} type="number" value={params.transformerKVA} onChange={e => setParams({...params, transformerKVA: parseFloat(e.target.value)})} className={`w-full px-3 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-sm transition-all outline-none ${source === 'auto' ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 cursor-not-allowed' : 'bg-slate-50 dark:bg-slate-800 text-slate-950 dark:text-slate-100 focus:ring-2 focus:ring-red-500'}`} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase">Trans (%Z)</label>
                  <input type="number" value={params.transformerZ} onChange={e => setParams({...params, transformerZ: parseFloat(e.target.value)})} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100 transition-all focus:ring-2 focus:ring-red-500 outline-none" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase">Length (m)</label>
                  <input type="number" value={params.feederLength} onChange={e => setParams({...params, feederLength: parseFloat(e.target.value)})} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100 transition-all focus:ring-2 focus:ring-red-500 outline-none" />
                </div>
                <div className="space-y-1.5 flex gap-2">
                  <div className="flex-1">
                     <label className="text-xs font-bold text-slate-400 uppercase">Size(mm²)</label>
                     <select value={params.feederSize} onChange={e => setParams({...params, feederSize: e.target.value, isFeederSizeCustomized: true})} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100 transition-all focus:ring-2 focus:ring-red-500 outline-none">
                        {['2.0', '3.5', '5.5', '8.0', '14', '22', '30', '38', '50', '60', '80', '100', '125', '150', '200', '250', '325', '400', '500'].map(s => <option key={s} value={s} className="dark:bg-slate-900 dark:text-slate-100">{s}</option>)}
                     </select>
                  </div>
                  <div className="flex-1">
                     <label className="text-xs font-bold text-slate-400 uppercase">Type</label>
                     <select value={params.conductorType} onChange={e => setParams({...params, conductorType: e.target.value as 'Copper' | 'Aluminum'})} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100 transition-all focus:ring-2 focus:ring-red-500 outline-none">
                        <option value="Copper" className="dark:bg-slate-900 dark:text-slate-100">Copper</option>
                        <option value="Aluminum" className="dark:bg-slate-900 dark:text-slate-100">Aluminum</option>
                     </select>
                  </div>
                  <div className="w-28">
                     <label className="text-xs font-bold text-slate-400 uppercase">Runs</label>
                     <select
                        value={params.feederRuns || 1}
                        onChange={e => setParams({...params, feederRuns: Number(e.target.value), isFeederRunsCustomized: true})}
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100 transition-all focus:ring-2 focus:ring-red-500 outline-none cursor-pointer"
                     >
                        {[1, 2, 3, 4, 5, 6, 7, 8].map((r) => (
                           <option key={r} value={r} className="dark:bg-slate-900 dark:text-slate-100">
                              {r > 1 ? `${r} Sets of` : "1 Set of"}
                           </option>
                        ))}
                     </select>
                  </div>
                </div>

                {/* Phase Type and Selection Field */}
                <div className="col-span-1 md:col-span-4 bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl border border-slate-100 dark:border-slate-800/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                        Phase Type Selection
                      </span>
                      {selectedPhaseType === '3PH' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-sky-500/10 text-sky-500 dark:text-sky-400 border border-sky-500/20 shadow-xs">
                          <span className="w-1.5 h-1.5 rounded-full bg-sky-500"></span>
                          Three-Phase (3Ø) Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 border border-emerald-500/20 shadow-xs">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          Single-Phase (1Ø) Active
                        </span>
                      )}
                    </div>
                    <p className="text-xxs text-slate-400 dark:text-slate-500">
                      Synchronized with the Load Flow, Voltage Drop, Single Line Diagram, and Protection Coordination modules.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-500 dark:text-slate-400 font-bold uppercase select-none">
                      <input
                        type="checkbox"
                        checked={!!params.phaseTypeOverrideEnabled}
                        onChange={e => {
                          const checked = e.target.checked;
                          const defaultPhase = panel?.system ? detectPhaseType(panel.system) : '3PH';
                          setParams({
                            ...params,
                            phaseTypeOverrideEnabled: checked,
                            phaseTypeOverride: checked ? defaultPhase : undefined
                          });
                        }}
                        className="w-4 h-4 text-red-600 rounded focus:ring-red-500 border-slate-300 dark:border-slate-700 cursor-pointer"
                      />
                      <span>Manual Override</span>
                    </label>

                    <div className="w-48">
                      <select
                        disabled={!params.phaseTypeOverrideEnabled}
                        value={selectedPhaseType}
                        onChange={e => {
                          const newPhase = e.target.value as '1PH' | '3PH';
                          setParams({ ...params, phaseTypeOverride: newPhase });
                          
                          // Automatic bi-directional synchronization with connected modules (like Load Schedule)
                          if (panel && setPanel) {
                            const updatedSystem = getMappedSystemForPhase(panel.system, newPhase);
                            setPanel(prev => ({
                              ...prev,
                              system: updatedSystem
                            }));
                          }
                        }}
                        className={`w-full px-3 py-1.5 border rounded-lg text-xs font-bold transition-all outline-none ${
                          !params.phaseTypeOverrideEnabled 
                            ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700 cursor-not-allowed' 
                            : 'bg-white dark:bg-slate-800 text-slate-950 dark:text-slate-100 border-red-200 dark:border-red-900 focus:ring-2 focus:ring-red-500 focus:border-red-500 cursor-pointer'
                        }`}
                      >
                        <option value="1PH">Single-Phase (1Ø)</option>
                        <option value="3PH">Three-Phase (3Ø)</option>
                      </select>
                    </div>
                  </div>
                </div>
          </div>

          {/* ADVANCED PARALLEL CONFIGURATION SECTION */}
          {((params.connectionType === 'Parallel') || (params.feederRuns && params.feederRuns > 1)) && (
            <div className="border-t border-slate-100 dark:border-slate-800 pt-6 space-y-6">
              <h4 className="text-xxs font-black tracking-widest text-slate-400 uppercase">
                Parallel Configuration & Compatibility Verification
              </h4>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 1. Parallel Transformers Panel */}
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/40 border border-slate-150 dark:border-slate-800/80 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Operating Parallel Transformers
                    </span>
                    <select
                      value={params.parallelTransformersCount || 1}
                      onChange={e => setParams({ ...params, parallelTransformersCount: parseInt(e.target.value) })}
                      className="px-2 py-1 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded shadow-sm font-semibold text-slate-800 dark:text-slate-200 outline-none"
                    >
                      <option value="1">1 (Single Transformer)</option>
                      <option value="2">2 (Operating in Parallel)</option>
                      <option value="3">3 (Operating in Parallel)</option>
                      <option value="4">4 (Operating in Parallel)</option>
                    </select>
                  </div>

                  {(params.parallelTransformersCount || 1) > 1 && (
                    <div className="space-y-4 animate-fade-in text-xs">
                      {/* Matching toggle */}
                      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/40 pb-2">
                        <span className="text-slate-500 font-medium">Match Transformer 1 Impedance & kVA</span>
                        <input
                          type="checkbox"
                          checked={params.parallelTransformersZMatch !== false && params.parallelTransformerskVAMatch !== false}
                          onChange={e => setParams({
                            ...params,
                            parallelTransformersZMatch: e.target.checked,
                            parallelTransformerskVAMatch: e.target.checked
                          })}
                          className="w-4 h-4 text-red-600 border-slate-250 rounded focus:ring-red-500"
                        />
                      </div>

                      {/* Custom inputs if not matching */}
                      {!(params.parallelTransformersZMatch !== false && params.parallelTransformerskVAMatch !== false) && (
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase">Tx 2+ Rating (kVA)</label>
                            <input
                              type="number"
                              value={params.parallelTransformersRating || 100}
                              onChange={e => setParams({ ...params, parallelTransformersRating: parseFloat(e.target.value) })}
                              className="w-full px-2 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-xs outline-none"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase">Tx 2+ Impedance (%Z)</label>
                            <input
                              type="number"
                              value={params.parallelTransformersZ || 5}
                              onChange={e => setParams({ ...params, parallelTransformersZ: parseFloat(e.target.value) })}
                              className="w-full px-2 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-xs outline-none"
                            />
                          </div>
                        </div>
                      )}

                      {/* Compatibility Checkboxes (Toggle to false to trigger violations!) */}
                      <div className="space-y-2 border-t border-slate-100 dark:border-slate-800 pt-3">
                        <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                          Compatibility Guardrails
                        </span>
                        <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 dark:text-slate-400">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={params.parallelTransformersVoltageMatch !== false}
                              onChange={e => setParams({ ...params, parallelTransformersVoltageMatch: e.target.checked })}
                              className="w-3.5 h-3.5 text-red-600"
                            />
                            <span>Identical Voltages</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={params.parallelTransformersPhaseMatch !== false}
                              onChange={e => setParams({ ...params, parallelTransformersPhaseMatch: e.target.checked })}
                              className="w-3.5 h-3.5 text-red-600"
                            />
                            <span>Phase Angle Match</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={params.parallelTransformersFreqMatch !== false}
                              onChange={e => setParams({ ...params, parallelTransformersFreqMatch: e.target.checked })}
                              className="w-3.5 h-3.5 text-red-600"
                            />
                            <span>Same Frequency</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={params.parallelTransformersVectorMatch !== false}
                              onChange={e => setParams({ ...params, parallelTransformersVectorMatch: e.target.checked })}
                              className="w-3.5 h-3.5 text-red-600"
                            />
                            <span>Vector Group Match</span>
                          </label>
                        </div>
                      </div>

                      {/* Load sharing read-out */}
                      <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 text-amber-900 dark:text-amber-200 shadow-xs space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-extrabold text-xs tracking-tight">
                            Transformer Load Distribution:
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setParams({
                                ...params,
                                parallelTransformersZMatch: true,
                                parallelTransformerskVAMatch: true,
                                parallelTransformersRating: params.transformerKVA,
                                parallelTransformersZ: params.transformerZ,
                                parallelTransformersVoltageMatch: true,
                                parallelTransformersPhaseMatch: true,
                                parallelTransformersFreqMatch: true,
                                parallelTransformersVectorMatch: true,
                              });
                            }}
                            className="px-2 py-0.5 text-[10px] font-bold bg-amber-200/80 hover:bg-amber-300 dark:bg-amber-900/60 dark:hover:bg-amber-800 text-amber-950 dark:text-amber-100 rounded border border-amber-300 dark:border-amber-700 transition-colors cursor-pointer"
                            title="Balance all parallel units equally based on Load Schedule calculated rating"
                          >
                            Auto-Balance (Equal Share)
                          </button>
                        </div>

                        <div className="space-y-1.5 divide-y divide-amber-200/50 dark:divide-amber-900/40 pt-1">
                          {calculation.transformerDetails && calculation.transformerDetails.length > 0 ? (
                            calculation.transformerDetails.map((tx) => (
                              <div key={tx.id} className="pt-1.5 first:pt-0 font-mono text-[11px] flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-slate-800 dark:text-slate-200">
                                    {tx.name} ({tx.ratingKVA} kVA):
                                  </span>
                                  <span className="text-[10px] text-amber-700 dark:text-amber-400 font-sans">
                                    [{tx.operatingKVA.toFixed(1)} kVA / {tx.operatingAmp.toFixed(1)} A]
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="font-black text-amber-950 dark:text-amber-100">
                                    {tx.sharePercent.toFixed(1)}% share
                                  </span>
                                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-sans font-bold ${
                                    tx.isOverloaded 
                                      ? "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300"
                                      : "bg-emerald-100/80 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                                  }`}>
                                    {tx.loadingPercent.toFixed(0)}% load
                                  </span>
                                </div>
                              </div>
                            ))
                          ) : (
                            <>
                              <div className="font-mono text-xxs flex justify-between">
                                <span>Transformer 1 ({params.transformerKVA} kVA):</span>
                                <span className="font-bold">{calculation.transformer1Share?.toFixed(1)}% share</span>
                              </div>
                              <div className="font-mono text-xxs flex justify-between mt-1">
                                <span>Transformer 2+ ({params.parallelTransformersCount || 1 > 1 ? (params.parallelTransformersCount || 1) - 1 : 0}x {params.parallelTransformersRating || 100} kVA):</span>
                                <span className="font-bold">{calculation.transformer2Share?.toFixed(1)}% share each</span>
                              </div>
                            </>
                          )}
                        </div>

                        <div className="pt-1.5 border-t border-amber-200/60 dark:border-amber-900/40 text-[10px] text-amber-800/90 dark:text-amber-300 flex items-center justify-between">
                          <span>
                            Total Bank: <strong>{calculation.totalTransformerKVA} kVA</strong> | Schedule Demand: <strong>{calculation.demandLoadKVA?.toFixed(1)} kVA</strong>
                          </span>
                          <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                            {calculation.isBalanced ? "✓ Perfectly Balanced" : "⚠ Unequal Load Sharing"}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. Parallel Feeders Panel */}
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/40 border border-slate-150 dark:border-slate-800/80 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/40 pb-2">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Parallel Feeder Conductor Details
                    </span>
                    <span className="text-xxs font-black bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400 px-1.5 py-0.5 rounded uppercase">
                      {params.feederRuns || 1} Runs in Parallel
                    </span>
                  </div>

                  {parseInt(params.feederRuns?.toString() || '1') > 1 && (
                    <div className="space-y-4 text-xs">
                      {/* Feeder matches checkboxes */}
                      <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 dark:text-slate-400">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={params.parallelFeedersSizeMatch !== false}
                            onChange={e => setParams({ ...params, parallelFeedersSizeMatch: e.target.checked })}
                            className="w-3.5 h-3.5 text-red-600"
                          />
                          <span>Match Cable Sizes</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={params.parallelFeedersLengthMatch !== false}
                            onChange={e => setParams({ ...params, parallelFeedersLengthMatch: e.target.checked })}
                            className="w-3.5 h-3.5 text-red-600"
                          />
                          <span>Match Cable Lengths</span>
                        </label>
                      </div>

                      {/* Mismatched Cable Editor */}
                      {((params.parallelFeedersSizeMatch === false) || (params.parallelFeedersLengthMatch === false)) && (
                        <div className="space-y-2 border-t border-slate-100 dark:border-slate-800 pt-3">
                          <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                            Unequal Conductor Sizing Editor (Set Per Run)
                          </span>
                          <div className="max-h-36 overflow-y-auto space-y-2.5 pr-1">
                            {Array.from({ length: Math.min(params.feederRuns || 1, 4) }).map((_, rIdx) => {
                              const size = (params.parallelFeedersCustomSizes?.[rIdx]) || params.feederSize || '30';
                              const len = (params.parallelFeedersCustomLengths?.[rIdx]) || params.feederLength || 10;
                              const share = calculation.eqFeeder?.paths?.[rIdx]?.share || (1 / (params.feederRuns || 1));

                              return (
                                <div key={rIdx} className="flex items-center gap-3 bg-white dark:bg-slate-900 p-2 rounded border border-slate-150 dark:border-slate-800">
                                  <span className="font-bold text-slate-500 font-mono text-[10px]"># {rIdx + 1}</span>
                                  {params.parallelFeedersSizeMatch === false && (
                                    <div className="flex-1">
                                      <select
                                        value={size}
                                        onChange={e => handleCustomSizeChange(rIdx, e.target.value)}
                                        className="w-full px-1.5 py-0.5 text-xxs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded font-mono outline-none"
                                      >
                                        {['2.0', '3.5', '5.5', '8.0', '14', '22', '30', '38', '50', '60', '80', '100', '125', '150', '200', '250', '325', '400', '500'].map(s => (
                                          <option key={s} value={s}>{s} mm²</option>
                                        ))}
                                      </select>
                                    </div>
                                  )}
                                  {params.parallelFeedersLengthMatch === false && (
                                    <div className="w-16">
                                      <input
                                        type="number"
                                        value={len}
                                        onChange={e => handleCustomLengthChange(rIdx, parseFloat(e.target.value) || 10)}
                                        className="w-full px-1.5 py-0.5 text-xxs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded font-mono text-center outline-none"
                                      />
                                    </div>
                                  )}
                                  <div className="text-[10px] font-mono text-slate-500 font-bold ml-auto shrink-0 bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">
                                    {(share * 100).toFixed(1)}% Current Share
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Fast calculations summary */}
                      <div className="p-2 bg-emerald-50/50 dark:bg-emerald-950/10 border border-emerald-100 dark:border-emerald-900/30 rounded text-[11px] text-emerald-800 dark:text-emerald-300">
                        <span className="font-bold block mb-0.5">Equivalent Parallel Impedance:</span>
                        <div className="font-mono text-xxs flex justify-between">
                          <span>Resistance (R):</span>
                          <span>{calculation.eqFeeder?.r?.toFixed(5)} Ω</span>
                        </div>
                        <div className="font-mono text-xxs flex justify-between">
                          <span>Reactance (X):</span>
                          <span>{calculation.eqFeeder?.x?.toFixed(5)} Ω</span>
                        </div>
                        <div className="font-mono text-xxs flex justify-between font-bold border-t border-emerald-200/40 dark:border-emerald-900/40 mt-1 pt-1">
                          <span>Total Impedance (Z):</span>
                          <span>{calculation.eqFeeder?.z?.toFixed(5)} Ω</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* DYNAMIC SAFETY WARNING BANNER */}
          {calculation.warnings && calculation.warnings.length > 0 && (
            <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 rounded-xl p-4 space-y-2 animate-fade-in">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-black tracking-widest text-red-600 uppercase block">
                  PEC Electrical Violations & Safety Advisories ({calculation.warnings.length})
                </span>
                {(params.parallelTransformersCount || 1) > 1 && calculation.warnings.some(w => w.toLowerCase().includes("transformer") || w.toLowerCase().includes("impedance")) && (
                  <button
                    type="button"
                    onClick={() => {
                      setParams({
                        ...params,
                        parallelTransformersZMatch: true,
                        parallelTransformerskVAMatch: true,
                        parallelTransformersRating: params.transformerKVA,
                        parallelTransformersZ: params.transformerZ,
                        parallelTransformersVoltageMatch: true,
                        parallelTransformersPhaseMatch: true,
                        parallelTransformersFreqMatch: true,
                        parallelTransformersVectorMatch: true,
                      });
                    }}
                    className="px-2 py-0.5 text-[10px] font-bold bg-red-100 hover:bg-red-200 text-red-800 dark:bg-red-900/60 dark:hover:bg-red-800 dark:text-red-200 rounded border border-red-300 dark:border-red-700 transition-colors cursor-pointer"
                  >
                    Auto-Balance Transformer Bank
                  </button>
                )}
              </div>
              <ul className="list-disc list-inside space-y-1 text-xs text-red-700 dark:text-red-400 font-medium leading-relaxed">
                {calculation.warnings.map((w, idx) => (
                  <li key={idx}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      <section className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden panel-container print:rounded-none">
        <div className="relative p-8 flex flex-col md:flex-row md:items-center md:justify-between border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-red-600"></div>
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-black uppercase tracking-wider bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400">
                <ShieldAlert className="w-3.5 h-3.5 animate-pulse" /> Point-To-Point Fault Analysis
              </span>
              {params.phaseTypeOverrideEnabled ? (
                params.phaseTypeOverride === '3PH' ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-sky-500/10 text-sky-500 dark:text-sky-400 border border-sky-500/20 shadow-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-500"></span>
                    Three-Phase (3Ø)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 border border-emerald-500/20 shadow-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    Single-Phase (1Ø)
                  </span>
                )
              ) : (
                detectPhaseType(panel?.system) === '3PH' ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-sky-500/10 text-sky-500 dark:text-sky-400 border border-sky-500/20 shadow-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-500"></span>
                    Three-Phase (3Ø)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 border border-emerald-500/20 shadow-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    Single-Phase (1Ø)
                  </span>
                )
              )}
            </div>
            <h3 className="text-xl font-extrabold text-slate-900 dark:text-white uppercase tracking-tight font-sans">Short Circuit Calculation Report</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">PEC 2017 Requirement Section 1.10.1.24 — Electrical Safety Conformity</p>
          </div>
          <div className="mt-4 md:mt-0 flex flex-wrap items-center gap-4 justify-center md:justify-end">
            <button
              onClick={() => {
                if (!isPremium) {
                  if (onRequestUpgrade) onRequestUpgrade();
                  return;
                }
                if (panel && circuits) {
                  exportToCAD(panel, circuits, subPanels || [], params, 'SHORT_CIRCUIT');
                } else {
                  alert("Please ensure panels and circuits are fully loaded before exporting.");
                }
              }}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md cursor-pointer border ${
                isPremium
                  ? 'bg-sky-600 hover:bg-sky-500 hover:text-white dark:bg-sky-700 dark:hover:bg-sky-600 text-white border-sky-500 hover:shadow-sky-500/10'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700 hover:bg-slate-200 hover:text-slate-600'
              }`}
              title={isPremium ? "Download editable DWG/DXF AutoCAD drawing block compliant with professional engineering standards" : "Export AutoCad is available on the Premium Plan"}
            >
              <Download className="w-4 h-4" />
              <span>{isPremium ? "Export AutoCAD Drawing" : "Export AutoCAD (Premium)"}</span>
            </button>
            <div className="px-4 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-xl shadow-xs text-center md:text-right">
              <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase block tracking-wider">Audit Stamp</span>
              <span className="text-xs font-black text-slate-700 dark:text-slate-300 font-mono tracking-tight">STATUS: LOCAL PEC VERIFIED</span>
            </div>
          </div>
        </div>

        <div className="p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 w-full">
          {/* Input Data Summary Column */}
          <div className="lg:col-span-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
              <div className="p-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                <Calculator className="w-4 h-4" />
              </div>
              <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Input Parameter Profile</h4>
            </div>

            <div className="bg-slate-50/40 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-800/80 p-5 rounded-2xl space-y-3.5">
              <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-100 dark:border-slate-800/60">
                <span className="text-slate-500 dark:text-slate-400 font-medium">Transformer Rating:</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white text-right">
                  {params.parallelTransformersCount && params.parallelTransformersCount > 1
                    ? `${params.parallelTransformersCount}x ${params.transformerKVA} kVA (${calculation.totalTransformerKVA} kVA Total)`
                    : `${params.transformerKVA} kVA`}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-100 dark:border-slate-800/60">
                <span className="text-slate-500 dark:text-slate-400 font-medium">Secondary Bus Voltage:</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white text-right">{params.transformerVoltage} V</span>
              </div>
              <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-100 dark:border-slate-800/60">
                <span className="text-slate-500 dark:text-slate-400 font-medium font-sans">Transformer %Z:</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white text-right">{params.transformerZ} %</span>
              </div>
              <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-100 dark:border-slate-800/60">
                <span className="text-slate-500 dark:text-slate-400 font-medium">Utility Fault Level:</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white text-right">{params.utilityShortCircuitMVA} MVAsc</span>
              </div>
              <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-100 dark:border-slate-800/60">
                <span className="text-slate-500 dark:text-slate-400 font-medium font-sans">Primary Voltage (HV):</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white text-right">{params.primaryVoltage} V</span>
              </div>
              <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-100 dark:border-slate-800/60">
                <span className="text-slate-500 dark:text-slate-400 font-medium">Feeder Conductor:</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white text-right">
                  {params.feederRuns && params.feederRuns > 1 ? `${params.feederRuns} Sets - ` : ''}
                  {panel?.system?.includes("3PH") ? (panel?.system?.includes("4W") ? "4x " : "3x ") : "2x "}
                  {params.feederSize}mm² {params.conductorType || "Copper"}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500 dark:text-slate-400 font-medium">Feeder Bus Length:</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white text-right">{params.feederLength} m</span>
              </div>
            </div>
          </div>

          {/* Calculated Results Block */}
          <div className="lg:col-span-7 space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
              <div className="p-1 rounded bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400">
                <GitBranch className="w-4 h-4" />
              </div>
              <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Sequence Calculations</h4>
            </div>

            <div className="relative overflow-hidden bg-slate-900 dark:bg-slate-950 rounded-2xl p-6 text-white border border-slate-800 shadow-md">
              <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 gap-6">
                
                {/* Full Load Current Block */}
                <div className="bg-slate-800/40 border border-slate-700/50 p-4 rounded-xl space-y-2">
                  <span className="text-[9px] font-extrabold uppercase text-slate-400 tracking-widest block font-sans">Full Load FLA Current</span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-mono font-bold text-sky-400 tracking-tight">{calculation.iFullLoad}</span>
                    <span className="text-xs font-bold text-slate-300">AMPS</span>
                  </div>
                  <p className="text-[10px] text-slate-400 font-sans leading-normal">Nominal secondary transformer current under continuous maximum rating.</p>
                </div>

                {/* Total Fault Current Block */}
                <div className="bg-red-950/20 border border-red-900/30 p-4 rounded-xl space-y-2 relative">
                  <div className="absolute right-3 top-3 w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
                  <span className="text-[9px] font-extrabold uppercase text-red-400 tracking-widest block font-sans font-mono">Total Fault Current (Isc)</span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-mono font-black text-rose-500 tracking-tight">{calculation.iscSecondary}</span>
                    <span className="text-xs font-bold text-rose-400">AMPS</span>
                  </div>
                  <p className="text-[10px] text-slate-400 font-sans leading-normal">Symmetrical point-to-point fault current available at secondary board terminal.</p>
                </div>

                {/* Impedance factors Block info */}
                <div className="sm:col-span-2 pt-4 border-t border-slate-800 grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider block font-sans">Z-Utility Reference (pu)</span>
                    <span className="text-xs font-mono font-semibold text-slate-200 block">{calculation.zUtilitypu}</span>
                    <p className="text-[9px] text-slate-500 leading-normal">Equivalent primary infinite bus impedance normalized to system base kVA.</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider block font-sans font-mono">Z-Trans (pu)</span>
                    <span className="text-xs font-mono font-semibold text-slate-200 block">{calculation.zTranspu}</span>
                    <p className="text-[9px] text-slate-500 leading-normal">Internal magnetic leakage impedance of transformer windings.</p>
                  </div>
                </div>

              </div>

              {/* Watermark background icon */}
              <div className="absolute right-[-40px] bottom-[-40px] opacity-[0.03] select-none pointer-events-none">
                <ShieldAlert className="w-72 h-72 text-white" />
              </div>

            </div>

            {/* PEC Compliant Fault Type Analyses */}
            <div className="bg-slate-50 dark:bg-slate-850/40 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                <div className="flex items-center gap-2">
                  <Calculator className="w-4 h-4 text-indigo-500" />
                  <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">PEC Fault Type Analyses</h4>
                </div>
                <span className="text-[10px] font-black tracking-widest text-indigo-500 bg-indigo-500/10 px-2 py-0.5 rounded uppercase">
                  {((params.phaseTypeOverrideEnabled ? params.phaseTypeOverride : detectPhaseType(panel?.system)) === '3PH') ? 'Three-Phase (3Ø)' : 'Single-Phase (1Ø)'}
                </span>
              </div>

              {((params.phaseTypeOverrideEnabled ? params.phaseTypeOverride : detectPhaseType(panel?.system)) === '3PH') ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Three-Phase Symmetrical Fault */}
                  <div className="bg-white dark:bg-slate-800/40 p-3 rounded-xl border border-slate-100 dark:border-slate-800 space-y-1">
                    <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider block">3Ø Symmetrical Fault (I_3ph)</span>
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm font-mono font-bold text-slate-900 dark:text-white">{calculation.totalFaultM} A</span>
                      <span className="text-[10px] text-slate-400 font-mono">1.0 x I_sc</span>
                    </div>
                    <div className="text-[9.5px] text-slate-400 leading-snug">
                      Formula: I_3ph = I_base / Z_pu
                    </div>
                  </div>

                  {/* Line-to-Line Fault */}
                  <div className="bg-white dark:bg-slate-800/40 p-3 rounded-xl border border-slate-100 dark:border-slate-800 space-y-1">
                    <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Line-to-Line Fault (I_LL)</span>
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm font-mono font-bold text-indigo-600 dark:text-indigo-400">{calculation.iscLL.toLocaleString(undefined, { maximumFractionDigits: 1 })} A</span>
                      <span className="text-[10px] text-slate-400 font-mono">bolted</span>
                    </div>
                    <div className="text-[9.5px] text-slate-400 leading-snug">
                      I_LL = √3/2 · E / |Z1| (Z2 = Z1)
                    </div>
                  </div>

                  {/* Double Line-to-Ground Fault */}
                  <div className="bg-white dark:bg-slate-800/40 p-3 rounded-xl border border-slate-100 dark:border-slate-800 space-y-1">
                    <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Double Line-to-Ground (I_2LG)</span>
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm font-mono font-bold text-amber-600 dark:text-amber-400">{Number.isFinite(calculation.iscLLG) ? `${calculation.iscLLG.toLocaleString(undefined, { maximumFractionDigits: 1 })} A` : 'n/a'}</span>
                      <span className="text-[10px] text-slate-400 font-mono">{Number.isFinite(calculation.iscLLGEarth) ? `earth ${calculation.iscLLGEarth.toLocaleString(undefined, { maximumFractionDigits: 0 })} A` : ''}</span>
                    </div>
                    <div className="text-[9.5px] text-slate-400 leading-snug">
                      Symmetrical components: I1 = E / (Z1 + Z2‖Z0)
                    </div>
                  </div>

                  {/* Single Line-to-Ground Fault */}
                  <div className="bg-white dark:bg-slate-800/40 p-3 rounded-xl border border-slate-100 dark:border-slate-800 space-y-1">
                    <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Single Line-to-Ground (I_SLG)</span>
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm font-mono font-bold text-emerald-600 dark:text-emerald-400">{Number.isFinite(calculation.iscLG) ? `${calculation.iscLG.toLocaleString(undefined, { maximumFractionDigits: 1 })} A` : 'n/a'}</span>
                      <span className="text-[10px] text-slate-400 font-mono">X/R {calculation.xrPoint.toFixed(1)}</span>
                    </div>
                    <div className="text-[9.5px] text-slate-400 leading-snug">
                      I_SLG = 3E / |2·Z1 + Z0| (Z0: Dyn transformer + phase and neutral return)
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Line-to-Line Fault */}
                  <div className="bg-white dark:bg-slate-800/40 p-3 rounded-xl border border-slate-100 dark:border-slate-800 space-y-1">
                    <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Line-to-Line Loop Fault (I_LL)</span>
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm font-mono font-bold text-emerald-600 dark:text-emerald-400">{calculation.totalFaultM} A</span>
                      <span className="text-[10px] text-slate-400 font-mono">Active (3-wire)</span>
                    </div>
                    <div className="text-[9.5px] text-slate-400 leading-snug">
                      I = V / |Z_utility + Z_T + 2·Z_feeder| (loop)
                    </div>
                  </div>

                  {/* Line-to-Neutral Fault */}
                  <div className="bg-white dark:bg-slate-800/40 p-3 rounded-xl border border-slate-100 dark:border-slate-800 space-y-1">
                    <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Line-to-Neutral Fault (3-wire 1Ø)</span>
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm font-mono font-bold text-amber-600 dark:text-amber-400">Not evaluated</span>
                    </div>
                    <div className="text-[9.5px] text-slate-400 leading-snug">
                      Needs the transformer half-winding (centre-tap) impedance, which the project does not provide.
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Single Line Impedance Diagram (generated from the project, see utils/impedanceSld.ts) */}
      <section className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm panel-container print:mt-12 relative border border-slate-200 dark:border-slate-800 p-4 sm:p-6">
        {panel ? (
          <ImpedanceSLD panel={panel} circuits={circuits || []} subPanels={allSubPanels} iscParams={params} vdCalculations={vdCalculations} isPremium={isPremium} onRequestUpgrade={onRequestUpgrade} />
        ) : (
          <p className="text-xs text-slate-500">Load a panel in the Load Schedule to generate the diagram.</p>
        )}
      </section>

      {/* KAIC PROTECTION VALIDATION DASHBOARD */}
      <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b border-slate-100 dark:border-slate-800 pb-5">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-rose-50 dark:bg-rose-950/20 rounded-lg">
              <ShieldAlert className="w-5 h-5 text-rose-600 dark:text-rose-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 font-sans">KAIC Protection Validation Dashboard</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Automatic auditing of protective devices against terminal short-circuit currents (PEC Section 1.10.1.9 Compliance)</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <span className="text-xxs font-black tracking-widest uppercase px-2 py-1 rounded bg-slate-100 dark:bg-slate-850 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800">
              PHILIPPINE ELECTRICAL CODE
            </span>
          </div>
        </div>

        {/* KPI COUNTERS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-slate-50 dark:bg-slate-950/40 border border-slate-150 dark:border-slate-800/80 rounded-xl p-4">
            <span className="text-[10px] font-black tracking-widest text-slate-400 uppercase block mb-1">Total Devices Audited</span>
            <span className="text-2xl font-black text-slate-800 dark:text-slate-100 font-mono">{totalDevicesCount}</span>
            <span className="text-xxs text-slate-400 block mt-1">Main & branch circuit breakers</span>
          </div>
          <div className="bg-emerald-50/40 dark:bg-emerald-950/10 border border-emerald-100 dark:border-emerald-900/30 rounded-xl p-4">
            <span className="text-[10px] font-black tracking-widest text-emerald-500 uppercase block mb-1">Compliant Devices</span>
            <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono">{passedDevicesCount}</span>
            <span className="text-xxs text-emerald-500/80 block mt-1">Sufficient interrupting capability</span>
          </div>
          <div className={`rounded-xl p-4 border transition ${
            failedDevicesCount > 0 
              ? "bg-rose-50/60 dark:bg-rose-950/15 border-rose-200 dark:border-rose-900/40" 
              : "bg-slate-50 dark:bg-slate-950/40 border-slate-150 dark:border-slate-800/80"
          }`}>
            <span className={`text-[10px] font-black tracking-widest uppercase block mb-1 ${failedDevicesCount > 0 ? "text-rose-500" : "text-slate-400"}`}>
              Critical Violations
            </span>
            <span className={`text-2xl font-black font-mono ${failedDevicesCount > 0 ? "text-rose-600 dark:text-rose-400" : "text-slate-400"}`}>
              {failedDevicesCount}
            </span>
            <span className={`text-xxs block mt-1 ${failedDevicesCount > 0 ? "text-rose-500/80 font-semibold" : "text-slate-400"}`}>
              {failedDevicesCount > 0 ? "Upgrade required immediately" : "Zero safety risks detected"}
            </span>
          </div>
        </div>

        {/* VALIDATION DETAILS TABLE */}
        <div className="overflow-x-auto border border-slate-150 dark:border-slate-800 rounded-xl">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-950/50 border-b border-slate-150 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-4">Protective Device Location</th>
                <th className="py-3 px-4">Classification</th>
                <th className="py-3 px-4 text-center">Available Symmetrical Fault</th>
                <th className="py-3 px-4 text-center">Installed Rating</th>
                <th className="py-3 px-4 text-center">Safety Status</th>
                <th className="py-3 px-4 pl-6">Sizing Recommendation / Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-slate-700 dark:text-slate-300">
              {kaicValidationData.map((d, dIdx) => {
                const isFail = d.status === "FAIL";
                return (
                  <tr key={`kaic-${d.id}-${dIdx}`} className="hover:bg-slate-50/50 dark:hover:bg-slate-850/20 transition-all duration-150">
                    <td className="py-3.5 px-4 font-semibold text-slate-900 dark:text-slate-100">{d.location}</td>
                    <td className="py-3.5 px-4 text-slate-500 dark:text-slate-400 font-mono text-[10px]">{d.type}</td>
                    <td className="py-3.5 px-4 text-center font-mono font-bold text-amber-600 dark:text-amber-400">
                      {(d.faultCurrentA / 1000).toFixed(2)} kA <span className="text-[10px] text-slate-400 font-normal">({d.faultCurrentA.toFixed(0)} A)</span>
                    </td>
                    <td className="py-3.5 px-4 text-center font-mono font-bold text-slate-800 dark:text-slate-200">{d.selectedKAIC} kAIC</td>
                    <td className="py-3.5 px-4 text-center">
                      {isFail ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black tracking-wider uppercase bg-rose-50 text-rose-700 border border-rose-200/50 dark:bg-rose-950/20 dark:text-rose-400 dark:border-rose-900/40">
                          🔴 FAIL
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black tracking-wider uppercase bg-emerald-50 text-emerald-700 border border-emerald-200/30 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/30">
                          🟢 PASS
                        </span>
                      )}
                    </td>
                    <td className={`py-3.5 px-4 pl-6 font-medium ${isFail ? "text-rose-600 dark:text-rose-400 font-semibold" : "text-slate-500 dark:text-slate-400"}`}>
                      {d.recommendation}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ASSUMPTIONS BOX */}
        <div className="mt-5 p-4 bg-slate-50 dark:bg-slate-950/30 border border-slate-150 dark:border-slate-800 rounded-xl">
          <h4 className="text-xxs font-black tracking-widest text-slate-400 uppercase mb-2">Calculation Assumptions & Engineering References</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
            <div>
              <p className="font-semibold text-slate-700 dark:text-slate-300 mb-0.5">Commercial kAIC Classes:</p>
              <p>Standard molded case circuit breaker (MCCB) ratings: 10, 14, 18, 22, 25, 30, 35, 42, 50, 65, 85, 100 kAIC.</p>
            </div>
            <div>
              <p className="font-semibold text-slate-700 dark:text-slate-300 mb-0.5">Calculation Standards:</p>
              <p>Ohmic impedances are compiled using IEEE 141 Red Book standards at 75°C conductor temperatures with copper wire base factors.</p>
            </div>
            <div>
              <p className="font-semibold text-slate-700 dark:text-slate-300 mb-0.5">Real-time Recalculations:</p>
              <p>Fault current values and device protection statuses are automatically recomputed when secondary voltages, transformer impedance, parallel runs, or panel structures change.</p>
            </div>
          </div>
        </div>
      </section>



      {/* Calculations & Formulas Section (Only visible during PDF export / print) */}
      <section className="hidden print-show mt-12 bg-white rounded-2xl border-2 border-slate-800 p-8">
        <div className="flex items-center gap-2 mb-6">
          <Calculator className="w-5 h-5 text-red-600" />
          <h2 className="text-lg font-bold text-slate-800 uppercase tracking-widest">Calculations & Formulas</h2>
        </div>
        
        <div className="space-y-6 text-sm text-slate-700">
          <div>
            <h3 className="font-bold text-slate-900 mb-2">1. Base Current (FLA) Calculation</h3>
            <p className="mb-2">The Full Load Ampere (FLA) is calculated based on the transformer rating (kVA). Assuming {selectedPhaseType === '3PH' ? '3-Phase' : 'Single-Phase'} system parameters in accordance with PEC.</p>
            <div className="bg-slate-50 p-4 rounded-lg font-mono text-xs border border-slate-200">
              {selectedPhaseType === '3PH' 
                ? "FLA = (kVA × 1000) / (Voltage × √3)" 
                : "FLA = (kVA × 1000) / (Voltage × 2)"}
            </div>
            <p className="mt-2 text-red-600 font-bold">Calculated FLA: {calculation.fla} Amperes</p>
          </div>

          <div>
            <h3 className="font-bold text-slate-900 mb-2">2. Impedance Multiplier (M)</h3>
            <p className="mb-2">The Multiplier determines the relationship between the Full Load Current and the Short Circuit Current, considering the Utility Fault level (MVA) and Transformer Impedance (%Z).</p>
            {calculation.connectionMultiplier !== "1.000" && (
              <p className="mb-2 text-indigo-700 bg-indigo-50 p-2 rounded border border-indigo-100">
                <strong>PEC Connection Factor Applied:</strong> As an Open configuration is selected, the equivalent 3-phase symmetrical fault duty is reduced by a factor of <strong>{calculation.connectionMultiplier}</strong> compared to a closed delta bank of identical individual base ratings.
              </p>
            )}
            <div className="bg-slate-50 p-4 rounded-lg font-mono text-xs border border-slate-200 flex flex-col gap-2">
              <span>{`Step A: Z_trans_pu = (%Z / 100) / ConnectionFactor(${calculation.connectionMultiplier})`}</span>
              <span>{`Step B: Z_utility_pu = Transformer kVA / (Utility MVA × 1000)`}</span>
              <span>{`Combined Multiplier (M) = 1 / (Z_trans_pu + Z_utility_pu)`}</span>
            </div>
            <p className="mt-2 text-red-600 font-bold">Calculated Multiplier (M): {calculation.multiplier}</p>
          </div>

          <div>
            <h3 className="font-bold text-slate-900 mb-2">3. Secondary Short Circuit Current (Isc)</h3>
            <p className="mb-2">The maximum available fault current at the fault point sets the interrupting rating of the protective devices. Impedances are added as complex quantities (R + jX) from the utility through the transformer and feeder.</p>
            {Number.isFinite(calculation.iscLG) && (
              <p className="mb-2 text-amber-700 bg-amber-50 p-2 rounded border border-amber-100">
                <strong>Grounded wye secondary:</strong> the line-to-ground fault is {Math.round(calculation.iscLG).toLocaleString()} A ({(calculation.iscLG / parseFloat(calculation.iscSecondary)).toFixed(2)} × the 3-phase fault), from 3E / |2·Z1 + Z0|.
              </p>
            )}
            <div className="bg-slate-50 p-4 rounded-lg font-mono text-xs border border-slate-200 flex flex-col gap-2">
              <span>{`Isc (symmetrical) = E / |Z_utility + Z_transformer + Z_feeder|`}</span>
              <span>{`ip (peak) = κ · √2 · Isc, κ = 1.02 + 0.98 · e^(−3R/X) (IEC 60909)`}</span>
            </div>
            <div className="mt-2 text-red-600 font-bold flex flex-col gap-1">
              <span>Symmetrical short-circuit current (with motors): {calculation.totalFaultM} A</span>
              <span>Peak: {Math.round(calculation.iscPeak).toLocaleString()} A at X/R {calculation.xrPoint.toFixed(1)}</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
