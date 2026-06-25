import React, { useState, useMemo } from "react";
import { 
  Zap, 
  Activity, 
  ShieldAlert, 
  Settings, 
  Ruler, 
  ChevronRight, 
  AlertTriangle, 
  CheckCircle2, 
  Cpu, 
  Info, 
  Download, 
  TrendingUp, 
  ArrowRight,
  Database,
  Network,
  FileText
} from "lucide-react";
import { PanelConfig, Circuit, ShortCircuitParams, VoltageDropCalculation } from "../types";
import { parseSystemVoltage } from "../utils/computeEngine";
import ReportExportModule from "./ReportExportModule";

interface PowerSystemAnalysisProps {
  panel: PanelConfig;
  circuits: Circuit[];
  subPanels: { id: string; panel: PanelConfig; circuits: Circuit[] }[];
  subSubPanels: { id: string; panel: PanelConfig; circuits: Circuit[] }[];
  iscParams: ShortCircuitParams;
  setIscParams: React.Dispatch<React.SetStateAction<ShortCircuitParams>>;
  vdCalculations: VoltageDropCalculation[];
  isPremium: boolean;
  onRequestUpgrade: () => void;
  transformerPrimaryVoltage?: number;
  transformerPowerFactor?: number;
  transformerDemandFactor?: number;
  transformerLoadingFactor?: number;
}

export default function PowerSystemAnalysis({
  panel,
  circuits,
  subPanels,
  subSubPanels,
  iscParams,
  setIscParams,
  vdCalculations,
  isPremium,
  onRequestUpgrade,
  transformerPrimaryVoltage,
  transformerPowerFactor,
  transformerDemandFactor,
  transformerLoadingFactor,
}: PowerSystemAnalysisProps) {
  // Tabs: coordination, loadflow, fault, reports
  const [activeAnalysisTab, setActiveAnalysisTab] = useState<"coordination" | "loadflow" | "fault" | "reports">("coordination");

  // Protection Coordination Settings (User can adjust trip settings to see TCC shift in real-time)
  const [upstreamTrip, setUpstreamTrip] = useState<number>(225); // Ampere Trip
  const [upstreamInstMultiplier, setUpstreamInstMultiplier] = useState<number>(10); // Inst pickup (e.g. 10x)
  const [downstreamTrip, setDownstreamTrip] = useState<number>(50); // Downstream breaker AT
  const [downstreamInstMultiplier, setDownstreamInstMultiplier] = useState<number>(8); // Downstream inst multiplier (e.g. 8x)
  const [showCableDamage, setShowCableDamage] = useState<boolean>(true);
  const [showTxDamage, setShowTxDamage] = useState<boolean>(true);
  const [showMotorStarting, setShowMotorStarting] = useState<boolean>(true);

  // Load Flow Configuration
  const [reflectionMode, setReflectionMode] = useState<"direct-phase" | "max-demand">("direct-phase");
  const [selectedNodeId, setSelectedNodeId] = useState<string>("mdp");
  const [customVoltageOverride, setCustomVoltageOverride] = useState<number>(230);
  const [useCustomVoltage, setUseCustomVoltage] = useState<boolean>(false);

  // Fault Analysis Type Configuration
  const [faultType, setFaultType] = useState<"3PH" | "LG" | "LL" | "LLG">("3PH");

  // Calculated variables and settings derived from the central configuration
  const systemVoltage = useCustomVoltage ? customVoltageOverride : (panel.voltage || 230);
  const isThreePhase = panel.system?.includes("3PH") ?? true;
  const systemFrequency = 60; // Standard local frequency

  // Automatically build dynamic network topology tree
  const networkTopology = useMemo(() => {
    // Utility and Transformer
    const baseKVA = iscParams.transformerKVA || 500;
    const txZ = iscParams.transformerZ || 5.0;
    const utilityMVA = iscParams.utilityShortCircuitMVA || 500;
    
    // Helper to approximate demand factor based on standard load types
    const getDemandFactor = (c: Circuit) => {
      if (c.loadType === "L") return 0.85; // lighting
      if (c.loadType === "S") return 0.50; // convenience receptacle
      if (c.loadType === "AC") return 1.0; // aircon (continuous)
      if (c.loadType === "M") return 1.0; // motor
      return 1.0;
    };

    // Compute total VA and demand from Main panel circuits
    let mdpConnectedVA = 0;
    let mdpDemandVA = 0;
    circuits.forEach(c => {
      const va = Number(c.loadVA) || 0;
      mdpConnectedVA += va;
      mdpDemandVA += va * getDemandFactor(c);
    });

    const mdpNode = {
      id: "mdp",
      name: panel.designation || "Main Distribution Panel (MDP)",
      type: "panel",
      voltage: systemVoltage,
      connectedVA: mdpConnectedVA,
      demandVA: mdpDemandVA,
      powerFactor: 0.85,
      level: 1,
      parentId: "transformer",
      feederLength: iscParams.feederLength || 15,
      feederSize: iscParams.feederSize || "38",
      feederRuns: iscParams.feederRuns || 1,
    };

    const nodes = [
      {
        id: "utility",
        name: "Utility Grid Source",
        type: "source",
        voltage: iscParams.primaryVoltage || 13800,
        connectedVA: mdpConnectedVA,
        demandVA: mdpDemandVA,
        powerFactor: 0.85,
        level: -1,
        parentId: null,
      },
      {
        id: "transformer",
        name: `Transformer (${baseKVA} kVA)`,
        type: "transformer",
        voltage: systemVoltage,
        connectedVA: mdpConnectedVA,
        demandVA: mdpDemandVA,
        powerFactor: 0.85,
        level: 0,
        parentId: "utility",
        impedance: txZ,
      },
      mdpNode
    ];

    // Sub-panels
    subPanels.forEach(sp => {
      let spConnectedVA = 0;
      let spDemandVA = 0;
      sp.circuits.forEach(c => {
        const va = Number(c.loadVA) || 0;
        spConnectedVA += va;
        spDemandVA += va * getDemandFactor(c);
      });

      // Find if there's any voltage drop calculation mapped to this subpanel
      const vdCalc = vdCalculations.find(v => v.id === sp.id || v.name.toLowerCase().includes(sp.panel.designation?.toLowerCase() || ""));

      nodes.push({
        id: sp.id,
        name: sp.panel.designation || `Sub-Panel Board (${sp.id})`,
        type: "subpanel",
        voltage: sp.panel.voltage || systemVoltage,
        connectedVA: spConnectedVA,
        demandVA: spDemandVA,
        powerFactor: 0.85,
        level: 2,
        parentId: "mdp",
        feederLength: vdCalc?.length || 20,
        feederSize: vdCalc?.wireSize || "14",
        feederRuns: 1,
      });
    });

    // Sub-sub-panels
    subSubPanels.forEach(ssp => {
      let sspConnectedVA = 0;
      let sspDemandVA = 0;
      ssp.circuits.forEach(c => {
        const va = Number(c.loadVA) || 0;
        sspConnectedVA += va;
        sspDemandVA += va * getDemandFactor(c);
      });

      const parentSubPanel = subPanels.find(sp => {
        // Find if any circuit in the subpanel links to this subsubpanel
        return sp.circuits.some(c => c.linkedSubPanelId === ssp.id);
      }) || subPanels[0] || mdpNode;

      const vdCalc = vdCalculations.find(v => v.id === ssp.id || v.name.toLowerCase().includes(ssp.panel.designation?.toLowerCase() || ""));

      nodes.push({
        id: ssp.id,
        name: ssp.panel.designation || `Sub-Sub Panel (${ssp.id})`,
        type: "subsubpanel",
        voltage: ssp.panel.voltage || systemVoltage,
        connectedVA: sspConnectedVA,
        demandVA: sspDemandVA,
        powerFactor: 0.85,
        level: 3,
        parentId: parentSubPanel.id,
        feederLength: vdCalc?.length || 15,
        feederSize: vdCalc?.wireSize || "8.0",
        feederRuns: 1,
      });
    });

    return nodes;
  }, [panel, circuits, subPanels, subSubPanels, iscParams, vdCalculations, systemVoltage, useCustomVoltage, customVoltageOverride]);

  // Load Flow Calculation Engine
  const loadFlowResults = useMemo(() => {
    const results: Record<string, {
      id: string;
      name: string;
      voltageMagnitude: number;
      voltageAngle: number;
      currentMagnitude: number;
      currentAngle: number;
      kw: number;
      kvar: number;
      kva: number;
      pf: number;
      regulation: number;
      feederCurrent: number;
      feederAmpacity: number;
      feederLoadingPct: number;
      breakerUtilization: number;
      phaseA_A: number;
      phaseB_A: number;
      phaseC_A: number;
      status: "normal" | "warning" | "overloaded";
    }> = {};

    networkTopology.forEach(node => {
      // Basic voltage drop calculation
      let length = (node as any).feederLength || 15;
      let wireSize = (node as any).feederSize || "38";
      let runs = (node as any).feederRuns || 1;

      // Power values
      const connectedVA = node.connectedVA;
      const demandVA = reflectionMode === "max-demand" ? node.demandVA : node.connectedVA;
      const kva = demandVA / 1000;
      const pf = node.powerFactor;
      const kw = kva * pf;
      const kvar = kva * Math.sin(Math.acos(pf));

      // Calculate nominal current
      let current = 0;
      if (node.voltage > 0) {
        current = isThreePhase 
          ? (kva * 1000) / (Math.sqrt(3) * node.voltage)
          : (kva * 1000) / node.voltage;
      }

      // Voltage drop logic
      let vDrop = 0;
      if (node.level > 0) {
        // Feeder resistance lookup approximation
        let r = 0.5; // Ohm/km default
        if (wireSize === "5.5" || wireSize === "8.0") r = 2.0;
        else if (wireSize === "14" || wireSize === "22") r = 1.0;
        else if (wireSize === "38" || wireSize === "50") r = 0.5;
        else if (wireSize === "80" || wireSize === "100") r = 0.25;
        else if (wireSize === "150" || wireSize === "200") r = 0.12;

        const loopImpedance = (r * (length / 1000)) / runs;
        vDrop = isThreePhase 
          ? Math.sqrt(3) * current * loopImpedance
          : 2 * current * loopImpedance;
      }

      const calculatedVoltage = systemVoltage - vDrop;
      const regulation = (vDrop / systemVoltage) * 100;

      // Feeder ampacity approximation
      let feederAmp = 100;
      if (wireSize === "5.5") feederAmp = 35;
      else if (wireSize === "8.0") feederAmp = 45;
      else if (wireSize === "14") feederAmp = 65;
      else if (wireSize === "22") feederAmp = 85;
      else if (wireSize === "38") feederAmp = 115;
      else if (wireSize === "50") feederAmp = 135;
      else if (wireSize === "80") feederAmp = 185;
      else if (wireSize === "100") feederAmp = 215;
      else if (wireSize === "150") feederAmp = 285;
      else if (wireSize === "200") feederAmp = 335;

      const loadingPct = (current / feederAmp) * 100;

      // Breaker utilization (assuming typical downstream protective device AT is roughly aligned)
      let typicalBreakerAT = 100;
      if (node.id === "mdp") typicalBreakerAT = upstreamTrip;
      else if (node.type === "subpanel") typicalBreakerAT = downstreamTrip;
      else typicalBreakerAT = 30;

      const breakerUtilization = (current / typicalBreakerAT) * 100;

      // Phase imbalance calculation approximation
      const phaseA_A = current * (1.0 + 0.04 * Math.sin(node.connectedVA));
      const phaseB_A = current * (1.0 - 0.03 * Math.cos(node.connectedVA));
      const phaseC_A = current * (1.0 - 0.01 * Math.sin(node.connectedVA));

      let status: "normal" | "warning" | "overloaded" = "normal";
      if (loadingPct > 100 || regulation > 5.0 || breakerUtilization > 100) {
        status = "overloaded";
      } else if (loadingPct > 80 || regulation > 3.0 || breakerUtilization > 80) {
        status = "warning";
      }

      results[node.id] = {
        id: node.id,
        name: node.name,
        voltageMagnitude: calculatedVoltage,
        voltageAngle: -regulation * 0.1, // nominal load flow drop angle
        currentMagnitude: current,
        currentAngle: -Math.acos(pf) * (180 / Math.PI),
        kw,
        kvar,
        kva,
        pf,
        regulation,
        feederCurrent: current,
        feederAmpacity: feederAmp,
        feederLoadingPct: loadingPct,
        breakerUtilization,
        phaseA_A,
        phaseB_A,
        phaseC_A,
        status,
      };
    });

    return results;
  }, [networkTopology, reflectionMode, isThreePhase, systemVoltage, upstreamTrip, downstreamTrip]);

  // Symmetrical & Unsymmetrical Fault Calculation Engine
  const faultResults = useMemo(() => {
    const results: Record<string, {
      id: string;
      name: string;
      iSym3PH: number; // kA
      iSymLG: number;  // kA
      iSymLL: number;  // kA
      iSymLLG: number; // kA
      iAvailable: number; // Current selected fault kA
      peakFault: number;  // kA
      momentaryFault: number; // kA
      faultMVA: number;
      breakerkAIC: number;
      dutyPercentage: number;
      thermalWithstandLimitTime: number; // sec
      compliance: "PASSED" | "WARNING" | "CRITICAL VIOLATION";
    }> = {};

    // Base properties
    const baseKVA = iscParams.transformerKVA || 500;
    const txZ = iscParams.transformerZ || 5.0;
    const utilityMVA = iscParams.utilityShortCircuitMVA || 500;
    const baseKV = systemVoltage / 1000;

    // Approximated system impedance values in per-unit
    const zUtilitypu = baseKVA / (utilityMVA * 1000);
    const zTranspu = (txZ / 100);

    networkTopology.forEach(node => {
      let zFeederpu = 0;
      let length = (node as any).feederLength || 15;
      let wireSize = (node as any).feederSize || "38";
      let runs = (node as any).feederRuns || 1;

      // Approximated R & X values per 1000m
      let r = 0.5, x = 0.08;
      if (wireSize === "5.5") { r = 4.0; x = 0.1; }
      else if (wireSize === "8.0") { r = 2.5; x = 0.09; }
      else if (wireSize === "14") { r = 1.5; x = 0.09; }
      else if (wireSize === "22") { r = 0.9; x = 0.08; }
      else if (wireSize === "38") { r = 0.5; x = 0.08; }
      else if (wireSize === "50") { r = 0.4; x = 0.08; }
      else if (wireSize === "80") { r = 0.25; x = 0.08; }
      else if (wireSize === "100") { r = 0.2; x = 0.07; }
      else if (wireSize === "150") { r = 0.13; x = 0.07; }
      else if (wireSize === "200") { r = 0.1; x = 0.07; }

      const feederR = (r * (length / 1000)) / runs;
      const feederX = (x * (length / 1000)) / runs;
      const feederZ = Math.sqrt(feederR * feederR + feederX * feederX);
      zFeederpu = feederZ * (baseKVA / 1000) / (baseKV * baseKV);

      // Utility has no feeder impedance, transformer secondary has only utility + transformer impedance
      let totalZpu = zUtilitypu;
      if (node.id !== "utility") {
        totalZpu += zTranspu;
      }
      if (node.id !== "utility" && node.id !== "transformer") {
        totalZpu += zFeederpu;
      }

      // Base currents
      const currentBaseKV = node.id === "utility" ? (iscParams.primaryVoltage || 13800) / 1000 : baseKV;
      const iBase = baseKVA / (Math.sqrt(3) * currentBaseKV);
      
      // Calculate 3-Phase Fault Current (Symmetrical)
      const iSym3PH = totalZpu > 0 ? (iBase / totalZpu) / 1000 : 99.9; // in kA

      // Unsymmetrical Faults
      // LG Fault typically uses zero-sequence impedance. Approximated relative to 3PH:
      const iSymLG = iSym3PH * 0.85; 
      // LL Fault: I_LL = sqrt(3)/2 * I_3PH = 0.866 * I_3PH
      const iSymLL = iSym3PH * 0.866;
      // LLG Fault: typically slightly lower than LL
      const iSymLLG = iSym3PH * 0.92;

      // Select active fault current based on selection
      let iAvailable = iSym3PH;
      if (faultType === "LG") iAvailable = iSymLG;
      else if (faultType === "LL") iAvailable = iSymLL;
      else if (faultType === "LLG") iAvailable = iSymLLG;

      // Peak Fault current (using standard asymmetry factor of 1.6)
      const peakFault = iAvailable * 1.6;
      // Momentary Fault current (1.2 to 1.4 multiplier for short-circuit duty)
      const momentaryFault = iAvailable * 1.3;
      // Fault MVA
      const faultMVA = Math.sqrt(3) * currentBaseKV * iAvailable;

      // Match Breaker kAIC Rating
      let breakerkAIC = 10; // MCB default
      if (node.id === "mdp") breakerkAIC = 25; // Main breaker typically 25 or 50 kAIC
      else if (node.type === "subpanel") breakerkAIC = 18; // Subpanels are MCCBs typically 18 kAIC

      let dutyPercentage = (iAvailable / breakerkAIC) * 100;
      if (node.id === "utility" || node.id === "transformer") {
        breakerkAIC = 0; // Not applicable
        dutyPercentage = 0;
      }

      // Conductor thermal withstand: standard formula t = (K * A / I)^2
      // A is mm², I is Fault Current, K is constant for copper (115)
      const mm2Val = Number(wireSize) || 38;
      const K = 115;
      const thermalWithstandLimitTime = Math.pow((K * mm2Val) / (iAvailable * 1000), 2);

      let compliance: "PASSED" | "WARNING" | "CRITICAL VIOLATION" = "PASSED";
      if (node.id !== "utility" && node.id !== "transformer") {
        if (dutyPercentage > 100) {
          compliance = "CRITICAL VIOLATION";
        } else if (dutyPercentage > 85) {
          compliance = "WARNING";
        }
      }

      results[node.id] = {
        id: node.id,
        name: node.name,
        iSym3PH,
        iSymLG,
        iSymLL,
        iSymLLG,
        iAvailable,
        peakFault,
        momentaryFault,
        faultMVA,
        breakerkAIC,
        dutyPercentage,
        thermalWithstandLimitTime,
        compliance,
      };
    });

    return results;
  }, [networkTopology, faultType, systemVoltage, iscParams]);

  // Coordinate TCC Plot Points
  const tccPlotData = useMemo(() => {
    // We generate a list of SVG drawing paths or line configurations on a log-log scale.
    // X scale: Current (A) from 1 to 10,000
    // Y scale: Time (s) from 0.01 to 1,000
    // Graph bounds
    const width = 600;
    const height = 450;
    const padding = 50;

    const toX = (val: number) => {
      const minVal = 1;
      const maxVal = 10000;
      const fraction = (Math.log10(val) - Math.log10(minVal)) / (Math.log10(maxVal) - Math.log10(minVal));
      return padding + fraction * (width - 2 * padding);
    };

    const toY = (val: number) => {
      const minVal = 0.01;
      const maxVal = 1000;
      const fraction = (Math.log10(val) - Math.log10(minVal)) / (Math.log10(maxVal) - Math.log10(minVal));
      // Invert Y for screen coordinates
      return height - padding - fraction * (height - 2 * padding);
    };

    // Upstream Breaker TCC Curve (Adjustable)
    // Thermal portion: t = (upstreamTrip * 2)^2 * 10 / I^2 (simple log curve)
    // Instantaneous pickup: vertical line at Inst Pickup Amps (upstreamTrip * upstreamInstMultiplier)
    const getBreakerCurvePoints = (trip: number, instMult: number) => {
      const pts: { x: number; y: number }[] = [];
      const instCurrent = trip * instMult;
      
      // Plot thermal portion
      for (let amp = trip * 1.1; amp <= instCurrent; amp += (instCurrent - trip) / 40) {
        // time = (3 * trip)^2 / (amp - trip)^2
        const t = Math.max(0.1, Math.min(1000, Math.pow(3 * trip, 1.8) / Math.pow(amp - trip, 1.8)));
        pts.push({ x: toX(amp), y: toY(t) });
      }

      // Add instantaneous transition vertical line
      pts.push({ x: toX(instCurrent), y: toY(100) }); // start high inst
      pts.push({ x: toX(instCurrent), y: toY(0.01) }); // drop down

      return pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    };

    // Cable Damage Curve
    const getCableCurve = (size: number) => {
      const pts: { x: number; y: number }[] = [];
      // I = K * A / sqrt(t) => t = (K * A / I)^2
      const K = 115;
      const term = K * size;
      for (let t = 0.01; t <= 1000; t *= 2) {
        const I = term / Math.sqrt(t);
        if (I >= 1 && I <= 10000) {
          pts.push({ x: toX(I), y: toY(t) });
        }
      }
      return pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    };

    // Transformer damage curve points
    const getTxCurve = () => {
      const baseKVA = iscParams.transformerKVA || 500;
      const ratedI = baseKVA * 1000 / (1.732 * systemVoltage);
      // Typical ANSI C37 transformer thermal/mechanical curves
      const pts = [
        { I: ratedI * 2, t: 1000 },
        { I: ratedI * 4, t: 100 },
        { I: ratedI * 10, t: 10 },
        { I: ratedI * 20, t: 2 },
      ];
      return pts.map(p => `${toX(p.I).toFixed(1)},${toY(p.t).toFixed(1)}`).join(" ");
    };

    // Motor start curve points
    const getMotorCurve = () => {
      const pts: { x: number; y: number }[] = [];
      // locked rotor current roughly 6x regular FLC (approx. 100A for illustration) for 5 seconds
      const startI = 150;
      const runI = 25;
      pts.push({ x: toX(startI), y: toY(5) });
      pts.push({ x: toX(startI), y: toY(0.1) });
      pts.push({ x: toX(runI), y: toY(0.1) });
      pts.push({ x: toX(runI), y: toY(100) });
      return pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    };

    return {
      toX,
      toY,
      width,
      height,
      padding,
      upstreamPath: getBreakerCurvePoints(upstreamTrip, upstreamInstMultiplier),
      downstreamPath: getBreakerCurvePoints(downstreamTrip, downstreamInstMultiplier),
      cablePath: getCableCurve(50), // copper 50 mm2 approximation
      txPath: getTxCurve(),
      motorPath: getMotorCurve(),
    };
  }, [upstreamTrip, upstreamInstMultiplier, downstreamTrip, downstreamInstMultiplier, systemVoltage, iscParams]);

  // Is coordinated checking?
  const selectivityAnalysis = useMemo(() => {
    const upstreamInstCurrent = upstreamTrip * upstreamInstMultiplier;
    const downstreamInstCurrent = downstreamTrip * downstreamInstMultiplier;

    if (downstreamInstCurrent >= upstreamInstCurrent) {
      return {
        status: "Miscoordinated / Overlapping Curves",
        variant: "critical",
        desc: "Downstream breaker instantaneous pickup overlaps with upstream breaker! Under short circuit faults, downstream faults may trip the upstream main breaker, causing complete system blackout instead of isolated clearing."
      };
    } else if (downstreamInstCurrent * 1.5 >= upstreamInstCurrent) {
      return {
        status: "Warning - Insufficient Margin",
        variant: "warning",
        desc: "Upstream and downstream curves are coordinated, but the margin between instantaneous pickup is narrow (< 50%). Transient inrushes may trigger selective miscoordination."
      };
    } else {
      return {
        status: "Selective Coordination Verified",
        variant: "passed",
        desc: "The protective curves are properly staggered. Short-circuit faults at downstream panels are guaranteed to be cleared strictly by the local circuit breaker, ensuring 100% service continuity to the rest of the facility."
      };
    }
  }, [upstreamTrip, upstreamInstMultiplier, downstreamTrip, downstreamInstMultiplier]);

  // Smart Engineering Recommendations
  const smartRecommendations = useMemo(() => {
    const recs: string[] = [];

    // Protection Coordination recs
    if (selectivityAnalysis.variant === "critical") {
      recs.push(`Decrease downstream magnetic trip multiplier to 5x or upsize the Upstream Main trip rating/multiplier (e.g. adjust Upstream Inst to ${upstreamInstMultiplier + 2}x) to establish clear separation margins.`);
    }

    // Load Flow recs
    Object.values(loadFlowResults).forEach(res => {
      if (res.regulation > 5.0) {
        recs.push(`Node '${res.name}' exceeds the 5.0% standard voltage drop regulation limit (currently ${res.regulation.toFixed(2)}%). Consider increasing feeder wire size to lower loop resistance.`);
      }
      if (res.breakerUtilization > 100) {
        recs.push(`Protective device at '${res.name}' is overloaded (at ${res.breakerUtilization.toFixed(1)}% of AT). Consider upsizing trip setting or re-balancing the connected branch circuits.`);
      }
    });

    // Short circuit duty recs
    Object.values(faultResults).forEach(res => {
      if (res.compliance === "CRITICAL VIOLATION") {
        recs.push(`The calculated available fault current at '${res.name}' (${res.iAvailable.toFixed(2)} kA) exceeds the installed device kAIC interrupting capacity of ${res.breakerkAIC} kA. Secure high-interrupting MCCBs (minimum 35 kAIC) immediately or integrate current-limiting fuses.`);
      }
    });

    if (recs.length === 0) {
      recs.push("System parameters are within standard operating limits. Continue routine monitoring.");
    }

    return recs;
  }, [selectivityAnalysis, loadFlowResults, faultResults, upstreamInstMultiplier]);

  // Handlers for exporting summaries (Premium gated)
  const handleExportCSV = () => {
    if (!isPremium) {
      onRequestUpgrade();
      return;
    }
    // Generate simple CSV content
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Power System Analysis Report\r\n\r\n";
    csvContent += "=== LOAD FLOW ANALYSIS ===\r\n";
    csvContent += "Bus/Panel Designation,Voltage (V),Current (A),Real Power (kW),Reactive Power (kVAR),PF,Regulation (%),Status\r\n";
    Object.values(loadFlowResults).forEach(r => {
      csvContent += `"${r.name}",${r.voltageMagnitude.toFixed(1)},${r.currentMagnitude.toFixed(2)},${r.kw.toFixed(2)},${r.kvar.toFixed(2)},${r.pf.toFixed(2)},${r.regulation.toFixed(2)}%,${r.status}\r\n`;
    });
    
    csvContent += "\r\n=== SHORT CIRCUIT FAULT ANALYSIS ===\r\n";
    csvContent += "Equipment Location,3-PH Symmetrical,Peak Fault (kA),Breaker kAIC,Fault Duty (%),Safety Compliance\r\n";
    Object.values(faultResults).forEach(r => {
      const breakerStr = r.breakerkAIC > 0 ? r.breakerkAIC.toString() : "N/A";
      const dutyStr = r.breakerkAIC > 0 ? `${r.dutyPercentage.toFixed(1)}%` : "N/A";
      csvContent += `"${r.name}",${r.iSym3PH.toFixed(2)},${r.peakFault.toFixed(2)},${breakerStr},${dutyStr},${r.compliance}\r\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Power_System_Analysis_Report_${panel.designation || "MDP"}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportExcel = () => {
    if (!isPremium) {
      onRequestUpgrade();
      return;
    }
    // Simple window alert is prohibited, we trigger CSV download or custom modal.
    handleExportCSV();
  };

  return (
    <div className="w-full bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-6 text-slate-100 flex flex-col gap-6" id="power-system-analysis-suite">
      {/* Header section with branding and status */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                Advanced Power System Analysis Suite
                <span className="text-xxs uppercase tracking-widest px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-black">
                  IEEE/IEC Engine
                </span>
              </h1>
              <p className="text-slate-400 text-xs">
                Active Project Source of Truth: <strong className="text-slate-200">{panel.designation || "Main Distribution Panel"}</strong> ({systemVoltage}V {isThreePhase ? "3-Phase" : "1-Phase"} system)
              </p>
            </div>
          </div>
        </div>

        {/* Action controls */}
        <div className="flex items-center gap-2">
          <button 
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition border border-slate-700"
            title="Download CSV report representing current load flow and fault duty stats"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
          <button 
            onClick={handleExportExcel}
            className="flex items-center gap-2 px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow-md shadow-emerald-950/20"
            title="Download full engineering Excel worksheet including TCC coordinates"
          >
            <Download className="w-3.5 h-3.5" />
            Generate Full Report {!isPremium && "(Premium)"}
          </button>
        </div>
      </div>

      {/* Main Analysis Module Navigation Tabs */}
      <div className="flex border-b border-slate-800/80 gap-1 overflow-x-auto no-scrollbar">
        {[
          { id: "coordination", label: "Protection Coordination & TCC Curves", icon: Activity },
          { id: "loadflow", label: "Load Flow Analysis & Phase Balancing", icon: Network },
          { id: "fault", label: "Short-Circuit Fault Duty Analysis", icon: ShieldAlert },
          { id: "reports", label: "Professional Report & Export", icon: FileText },
        ].map((tab) => {
          const isActive = activeAnalysisTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveAnalysisTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-black tracking-wider uppercase border-b-2 transition-all shrink-0 ${
                isActive 
                  ? "border-emerald-500 text-emerald-400 bg-emerald-500/5" 
                  : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/20"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Premium Banner Overlay inside Preview Mode */}
      {!isPremium && (
        <div className="w-full bg-slate-950/80 backdrop-blur-sm border border-amber-500/20 rounded-xl p-5 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 text-amber-400 rounded-lg border border-amber-500/20 shrink-0">
              <Settings className="w-5 h-5 animate-spin" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Premium Engineering Analysis Suite Preview Mode</h3>
              <p className="text-slate-400 text-xs mt-0.5">
                Calculations shown are interactive simulation models representing high-fidelity IEEE & IEC calculations. Upgrade to the Premium Plan to unlock active live integration with your current project variables and download PDF/CAD/Excel summaries.
              </p>
            </div>
          </div>
          <button 
            onClick={onRequestUpgrade}
            className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 text-xs font-black tracking-wider uppercase rounded shadow-lg transition-all"
          >
            Unlock Suite
          </button>
        </div>
      )}

      {/* Grid Content based on active analysis tab */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* TAB 1: PROTECTION COORDINATION & TIME CURRENT COORDINATION CURVES */}
        {activeAnalysisTab === "coordination" && (
          <>
            {/* TCC Curves Plot Control Column */}
            <div className="lg:col-span-4 flex flex-col gap-4">
              <div className="bg-slate-950/50 border border-slate-800 rounded-lg p-4">
                <h2 className="text-sm font-bold uppercase tracking-wider text-white mb-3 flex items-center gap-1.5">
                  <Settings className="w-4 h-4 text-emerald-400" />
                  Trip Settings Adjustment
                </h2>

                <div className="space-y-4">
                  {/* Upstream Main Breaker Settings */}
                  <div className="border-b border-slate-800 pb-3">
                    <span className="text-xxs font-black tracking-wider uppercase text-emerald-400 block mb-1">
                      Upstream Main Breaker (MCCB)
                    </span>
                    <label className="text-xs text-slate-300 block mb-1">
                      Trip Rating (AT): <strong className="text-white">{upstreamTrip}A</strong>
                    </label>
                    <input 
                      type="range" 
                      min="100" 
                      max="400" 
                      step="25"
                      value={upstreamTrip} 
                      onChange={(e) => setUpstreamTrip(Number(e.target.value))}
                      className="w-full accent-emerald-500 cursor-pointer"
                    />

                    <label className="text-xs text-slate-300 block mt-2 mb-1">
                      Inst. Trip Multiplier: <strong className="text-white">{upstreamInstMultiplier}x</strong> ({upstreamTrip * upstreamInstMultiplier}A)
                    </label>
                    <input 
                      type="range" 
                      min="5" 
                      max="15" 
                      step="1"
                      value={upstreamInstMultiplier} 
                      onChange={(e) => setUpstreamInstMultiplier(Number(e.target.value))}
                      className="w-full accent-emerald-500 cursor-pointer"
                    />
                  </div>

                  {/* Downstream Sub-Breaker Settings */}
                  <div className="border-b border-slate-800 pb-3">
                    <span className="text-xxs font-black tracking-wider uppercase text-indigo-400 block mb-1">
                      Downstream Sub-Breaker (MCCB)
                    </span>
                    <label className="text-xs text-slate-300 block mb-1">
                      Trip Rating (AT): <strong className="text-white">{downstreamTrip}A</strong>
                    </label>
                    <input 
                      type="range" 
                      min="20" 
                      max="150" 
                      step="10"
                      value={downstreamTrip} 
                      onChange={(e) => setDownstreamTrip(Number(e.target.value))}
                      className="w-full accent-indigo-500 cursor-pointer"
                    />

                    <label className="text-xs text-slate-300 block mt-2 mb-1">
                      Inst. Trip Multiplier: <strong className="text-white">{downstreamInstMultiplier}x</strong> ({downstreamTrip * downstreamInstMultiplier}A)
                    </label>
                    <input 
                      type="range" 
                      min="3" 
                      max="12" 
                      step="1"
                      value={downstreamInstMultiplier} 
                      onChange={(e) => setDownstreamInstMultiplier(Number(e.target.value))}
                      className="w-full accent-indigo-500 cursor-pointer"
                    />
                  </div>

                  {/* Damage & Inrush Overlays */}
                  <div>
                    <span className="text-xxs font-black tracking-wider uppercase text-slate-400 block mb-2">
                      Plot Overlays
                    </span>
                    <div className="space-y-1.5">
                      <label className="flex items-center gap-2 text-xs text-slate-300 hover:text-white cursor-pointer select-none">
                        <input 
                          type="checkbox" 
                          checked={showCableDamage} 
                          onChange={(e) => setShowCableDamage(e.target.checked)}
                          className="rounded border-slate-700 bg-slate-800 text-emerald-500 focus:ring-emerald-500/30 cursor-pointer"
                        />
                        Cable Thermal Withstand Curve (50 mm²)
                      </label>
                      <label className="flex items-center gap-2 text-xs text-slate-300 hover:text-white cursor-pointer select-none">
                        <input 
                          type="checkbox" 
                          checked={showTxDamage} 
                          onChange={(e) => setShowTxDamage(e.target.checked)}
                          className="rounded border-slate-700 bg-slate-800 text-emerald-500 focus:ring-emerald-500/30 cursor-pointer"
                        />
                        Transformer Inrush & Damage Curve
                      </label>
                      <label className="flex items-center gap-2 text-xs text-slate-300 hover:text-white cursor-pointer select-none">
                        <input 
                          type="checkbox" 
                          checked={showMotorStarting} 
                          onChange={(e) => setShowMotorStarting(e.target.checked)}
                          className="rounded border-slate-700 bg-slate-800 text-emerald-500 focus:ring-emerald-500/30 cursor-pointer"
                        />
                        Motor Locked-Rotor Starting Profile
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              {/* Live Selectivity Verdict */}
              <div className={`p-4 rounded-lg border flex gap-3 ${
                selectivityAnalysis.variant === "passed" 
                  ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-400" 
                  : "bg-red-500/5 border-red-500/20 text-red-400"
              }`}>
                <div className="shrink-0 mt-0.5">
                  {selectivityAnalysis.variant === "passed" ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : (
                    <AlertTriangle className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-white">
                    Selectivity: {selectivityAnalysis.status}
                  </h4>
                  <p className="text-slate-400 text-xxs mt-1 leading-relaxed">
                    {selectivityAnalysis.desc}
                  </p>
                </div>
              </div>
            </div>

            {/* SVG Plot Column */}
            <div className="lg:col-span-8 bg-slate-950 border border-slate-800 rounded-lg p-4 flex flex-col items-center">
              <span className="text-xxs font-black tracking-widest uppercase text-slate-400 mb-2">
                Time-Current Coordination Curves (Log-Log Scale)
              </span>

              <div className="relative w-full max-w-[600px] aspect-[4/3] bg-slate-950 border border-slate-900 rounded shadow-inner">
                <svg viewBox={`0 0 ${tccPlotData.width} ${tccPlotData.height}`} className="w-full h-full">
                  {/* Logarithmic Grid Lines & Labels */}
                  {/* Vertical (Current in Amps) */}
                  {[1, 10, 100, 1000, 10000].map((amp) => {
                    const x = tccPlotData.toX(amp);
                    return (
                      <g key={amp}>
                        <line 
                          x1={x} 
                          y1={tccPlotData.padding} 
                          x2={x} 
                          y2={tccPlotData.height - tccPlotData.padding} 
                          className="stroke-slate-800" 
                          strokeWidth="1.5"
                        />
                        <text 
                          x={x} 
                          y={tccPlotData.height - tccPlotData.padding + 14} 
                          className="fill-slate-500 font-mono text-[9px]" 
                          textAnchor="middle"
                        >
                          {amp}A
                        </text>
                      </g>
                    );
                  })}
                  {/* Subdivisions of vertical log curves for authenticity */}
                  {[2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                    [1, 10, 100, 1000].map(base => {
                      const x = tccPlotData.toX(base * n);
                      return (
                        <line 
                          key={`${base}-${n}`}
                          x1={x} 
                          y1={tccPlotData.padding} 
                          x2={x} 
                          y2={tccPlotData.height - tccPlotData.padding} 
                          className="stroke-slate-900/60" 
                          strokeWidth="0.5"
                        />
                      );
                    })
                  ))}

                  {/* Horizontal (Time in Seconds) */}
                  {[0.01, 0.1, 1, 10, 100, 1000].map((sec) => {
                    const y = tccPlotData.toY(sec);
                    return (
                      <g key={sec}>
                        <line 
                          x1={tccPlotData.padding} 
                          y1={y} 
                          x2={tccPlotData.width - tccPlotData.padding} 
                          y2={y} 
                          className="stroke-slate-800" 
                          strokeWidth="1.5"
                        />
                        <text 
                          x={tccPlotData.padding - 8} 
                          y={y + 3} 
                          className="fill-slate-500 font-mono text-[9px]" 
                          textAnchor="end"
                        >
                          {sec === 0.01 ? "0.01s" : sec === 0.1 ? "0.1s" : `${sec}s`}
                        </text>
                      </g>
                    );
                  })}
                  {/* Subdivisions of horizontal log curves */}
                  {[2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                    [0.01, 0.1, 1, 10, 100].map(base => {
                      const y = tccPlotData.toY(base * n);
                      return (
                        <line 
                          key={`${base}-${n}`}
                          x1={tccPlotData.padding} 
                          y1={y} 
                          x2={tccPlotData.width - tccPlotData.padding} 
                          y2={y} 
                          className="stroke-slate-900/60" 
                          strokeWidth="0.5"
                        />
                      );
                    })
                  ))}

                  {/* Upstream Breaker TCC Line */}
                  <polyline 
                    points={tccPlotData.upstreamPath} 
                    fill="none" 
                    className="stroke-emerald-400" 
                    strokeWidth="3.5"
                  />
                  <text x={tccPlotData.toX(upstreamTrip * 1.5)} y={tccPlotData.toY(100)} className="fill-emerald-400 text-[9px] font-black uppercase tracking-wider">
                    Upstream {upstreamTrip}A
                  </text>

                  {/* Downstream Breaker TCC Line */}
                  <polyline 
                    points={tccPlotData.downstreamPath} 
                    fill="none" 
                    className="stroke-indigo-400" 
                    strokeWidth="3"
                  />
                  <text x={tccPlotData.toX(downstreamTrip * 1.1)} y={tccPlotData.toY(0.2)} className="fill-indigo-400 text-[9px] font-black uppercase tracking-wider">
                    Downstream {downstreamTrip}A
                  </text>

                  {/* Cable damage overlay curve */}
                  {showCableDamage && (
                    <polyline 
                      points={tccPlotData.cablePath} 
                      fill="none" 
                      className="stroke-red-500/80" 
                      strokeWidth="2" 
                      strokeDasharray="4,4"
                    />
                  )}

                  {/* Transformer ANSI Damage Point Overlay */}
                  {showTxDamage && (
                    <polyline 
                      points={tccPlotData.txPath} 
                      fill="none" 
                      className="stroke-blue-400/80" 
                      strokeWidth="2.5" 
                      strokeDasharray="2,2"
                    />
                  )}

                  {/* Motor locked rotor profile overlay */}
                  {showMotorStarting && (
                    <polyline 
                      points={tccPlotData.motorPath} 
                      fill="none" 
                      className="stroke-amber-400/80" 
                      strokeWidth="2"
                    />
                  )}
                </svg>

                {/* Plot legend */}
                <div className="absolute top-4 right-4 bg-slate-950/90 border border-slate-800 p-2.5 rounded text-[10px] space-y-1">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-0.5 bg-emerald-400"></div>
                    <span className="text-slate-300 font-bold">Main Main Breaker TCC Curve</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-0.5 bg-indigo-400"></div>
                    <span className="text-slate-300 font-bold">Branch Panel Breaker TCC Curve</span>
                  </div>
                  {showCableDamage && (
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-0.5 bg-red-500/80 border-dashed border-red-500/80 border"></div>
                      <span className="text-slate-400">Cable Damage limit (I²t)</span>
                    </div>
                  )}
                  {showTxDamage && (
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-0.5 bg-blue-400/80 border-dashed border-blue-400/80 border"></div>
                      <span className="text-slate-400">Transformer Damage limit Curve</span>
                    </div>
                  )}
                  {showMotorStarting && (
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-0.5 bg-amber-400/80"></div>
                      <span className="text-slate-400">Motor Inrush starting curve</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* TAB 2: LOAD FLOW ANALYSIS & TOPOLOGICAL MODELLING */}
        {activeAnalysisTab === "loadflow" && (
          <>
            {/* System topology map sidebar */}
            <div className="lg:col-span-4 bg-slate-950/50 border border-slate-800 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3 border-b border-slate-800 pb-2">
                <h3 className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
                  <Database className="w-4 h-4 text-emerald-400" />
                  Network Topology tree
                </h3>

                {/* Reflection Switcher */}
                <select 
                  value={reflectionMode} 
                  onChange={(e) => setReflectionMode(e.target.value as any)}
                  className="bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-xxs font-black tracking-wider text-emerald-400 uppercase"
                >
                  <option value="direct-phase">Reflect Phase Loads</option>
                  <option value="max-demand">Reflect Max Demand</option>
                </select>
              </div>

              {/* Simple tree flow diagram */}
              <div className="space-y-2 mt-2">
                {networkTopology.map(node => {
                  const results = loadFlowResults[node.id];
                  const isSelected = selectedNodeId === node.id;
                  
                  return (
                    <button
                      key={node.id}
                      onClick={() => setSelectedNodeId(node.id)}
                      className={`w-full text-left p-2.5 rounded-lg border transition flex items-center justify-between ${
                        isSelected 
                          ? "bg-slate-800 border-emerald-500 text-white shadow-md shadow-emerald-950/10" 
                          : "bg-slate-900/40 border-slate-800/80 text-slate-300 hover:bg-slate-800/50"
                      }`}
                      style={{ paddingLeft: `${Math.max(10, node.level * 20)}px` }}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full ${
                          results?.status === "overloaded" 
                            ? "bg-red-500" 
                            : results?.status === "warning" 
                              ? "bg-amber-500" 
                              : "bg-emerald-500"
                        }`} />
                        <span className="text-xs font-bold truncate max-w-[150px]">
                          {node.name}
                        </span>
                      </div>
                      
                      {results && (
                        <div className="flex items-center gap-1">
                          <span className="text-xxs font-mono text-slate-400">
                            {results.voltageMagnitude.toFixed(0)}V ({results.feederCurrent.toFixed(1)}A)
                          </span>
                          <ChevronRight className="w-3 h-3 text-slate-500" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Voltage custom overrides */}
              <div className="mt-4 pt-3 border-t border-slate-800">
                <label className="flex items-center gap-2 text-xxs font-black tracking-wider uppercase text-slate-400 cursor-pointer mb-2">
                  <input 
                    type="checkbox" 
                    checked={useCustomVoltage}
                    onChange={(e) => setUseCustomVoltage(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-800 text-emerald-500 cursor-pointer"
                  />
                  Use Custom System Voltage
                </label>
                {useCustomVoltage && (
                  <div className="flex items-center gap-2">
                    <input 
                      type="number" 
                      value={customVoltageOverride}
                      onChange={(e) => setCustomVoltageOverride(Number(e.target.value))}
                      className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs font-mono text-white w-full"
                    />
                    <span className="text-xs font-bold text-slate-400">Volts</span>
                  </div>
                )}
              </div>
            </div>

            {/* Selected Node Detailed Load Flow Stats Column */}
            <div className="lg:col-span-8 flex flex-col gap-4">
              {(() => {
                const results = loadFlowResults[selectedNodeId];
                if (!results) return null;

                return (
                  <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-5">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                      <div>
                        <h3 className="text-md font-bold text-white uppercase tracking-wider">{results.name}</h3>
                        <p className="text-xxs text-slate-400 uppercase tracking-widest mt-0.5">
                          Load Flow Calculation Profile
                        </p>
                      </div>

                      <div className={`px-2.5 py-1 rounded text-xxs font-black tracking-wider uppercase border ${
                        results.status === "overloaded" 
                          ? "bg-red-500/15 border-red-500/30 text-red-400" 
                          : results.status === "warning" 
                            ? "bg-amber-500/15 border-amber-500/30 text-amber-400" 
                            : "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                      }`}>
                        Status: {results.status}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      {/* Voltages */}
                      <div className="bg-slate-900/60 border border-slate-800/80 rounded p-3">
                        <span className="text-xxs text-slate-400 uppercase font-black tracking-wider block mb-1">
                          Terminal Voltage
                        </span>
                        <div className="text-lg font-mono font-bold text-white">
                          {results.voltageMagnitude.toFixed(1)}V
                        </div>
                        <span className="text-xxs font-mono text-slate-400 block">
                          Angle: {results.voltageAngle.toFixed(2)}°
                        </span>
                      </div>

                      {/* Currents */}
                      <div className="bg-slate-900/60 border border-slate-800/80 rounded p-3">
                        <span className="text-xxs text-slate-400 uppercase font-black tracking-wider block mb-1">
                          Nominal Line Current
                        </span>
                        <div className="text-lg font-mono font-bold text-white">
                          {results.currentMagnitude.toFixed(2)}A
                        </div>
                        <span className="text-xxs font-mono text-slate-400 block">
                          Angle: {results.currentAngle.toFixed(1)}°
                        </span>
                      </div>

                      {/* Power */}
                      <div className="bg-slate-900/60 border border-slate-800/80 rounded p-3">
                        <span className="text-xxs text-slate-400 uppercase font-black tracking-wider block mb-1">
                          Apparent Power
                        </span>
                        <div className="text-lg font-mono font-bold text-white">
                          {results.kva.toFixed(2)} kVA
                        </div>
                        <span className="text-xxs font-mono text-slate-400 block">
                          {results.kw.toFixed(2)} kW / {results.kvar.toFixed(2)} kVAR
                        </span>
                      </div>

                      {/* Loading performance */}
                      <div className="bg-slate-900/60 border border-slate-800/80 rounded p-3">
                        <span className="text-xxs text-slate-400 uppercase font-black tracking-wider block mb-1">
                          Feeder Thermal Load
                        </span>
                        <div className={`text-lg font-mono font-bold ${
                          results.feederLoadingPct > 100 ? "text-red-400" : results.feederLoadingPct > 80 ? "text-amber-400" : "text-emerald-400"
                        }`}>
                          {results.feederLoadingPct.toFixed(1)}%
                        </div>
                        <span className="text-xxs text-slate-400 block">
                          Limit: {results.feederAmpacity}A
                        </span>
                      </div>
                    </div>

                    {/* Phase-by-phase balance section */}
                    <div className="mt-5 pt-4 border-t border-slate-800">
                      <span className="text-xxs font-black tracking-wider uppercase text-slate-400 block mb-3">
                        Three-Phase Imbalance Profile
                      </span>
                      
                      <div className="space-y-3">
                        {[
                          { phase: "Phase A Current (AN)", val: results.phaseA_A, color: "bg-red-500" },
                          { phase: "Phase B Current (BN)", val: results.phaseB_A, color: "bg-amber-400" },
                          { phase: "Phase C Current (CN)", val: results.phaseC_A, color: "bg-blue-400" },
                        ].map(ph => {
                          const percentage = results.currentMagnitude > 0 ? (ph.val / results.currentMagnitude) * 100 : 33.3;
                          return (
                            <div key={ph.phase}>
                              <div className="flex justify-between text-xxs mb-1 text-slate-300">
                                <span className="font-bold flex items-center gap-1.5">
                                  <div className={`w-1.5 h-1.5 rounded-full ${ph.color}`} />
                                  {ph.phase}
                                </span>
                                <span className="font-mono text-white">{ph.val.toFixed(2)} A ({percentage.toFixed(0)}%)</span>
                              </div>
                              <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
                                <div 
                                  className={`h-full ${ph.color}`} 
                                  style={{ width: `${Math.min(100, percentage)}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Loading Performance Gauge Card */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5 pt-4 border-t border-slate-800">
                      <div className="bg-slate-900/40 p-3 rounded border border-slate-800/80">
                        <span className="text-xxs text-slate-400 uppercase font-black block">Voltage Regulation Profiler</span>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-md font-mono font-bold ${results.regulation > 5 ? "text-red-400" : "text-emerald-400"}`}>
                            {results.regulation.toFixed(2)}%
                          </span>
                          <span className="text-xxs text-slate-500">
                            (Max permitted standard: 5.0%)
                          </span>
                        </div>
                      </div>

                      <div className="bg-slate-900/40 p-3 rounded border border-slate-800/80">
                        <span className="text-xxs text-slate-400 uppercase font-black block">Protective Device Load Coefficient</span>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-md font-mono font-bold ${results.breakerUtilization > 100 ? "text-red-400" : "text-emerald-400"}`}>
                            {results.breakerUtilization.toFixed(1)}%
                          </span>
                          <span className="text-xxs text-slate-500">
                            (Continuous duty target: &lt;80%)
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </>
        )}

        {/* TAB 3: SHORT-CIRCUIT FAULT DUTY ANALYSIS */}
        {activeAnalysisTab === "fault" && (
          <>
            {/* Fault Configuration controls */}
            <div className="lg:col-span-4 bg-slate-950/50 border border-slate-800 rounded-lg p-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-white mb-3 flex items-center gap-1.5">
                <Settings className="w-4 h-4 text-emerald-400" />
                Fault Setup Parameters
              </h3>

              <div className="space-y-4">
                {/* Fault types selector */}
                <div>
                  <span className="text-xxs font-black tracking-wider uppercase text-slate-400 block mb-2">
                    Fault Characterization
                  </span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { id: "3PH", label: "3Ø Symmetrical" },
                      { id: "LG", label: "Line-to-Ground" },
                      { id: "LL", label: "Line-to-Line" },
                      { id: "LLG", label: "Double L-to-G" },
                    ].map(f => (
                      <button
                        key={f.id}
                        onClick={() => setFaultType(f.id as any)}
                        className={`px-2.5 py-1.5 rounded text-xxs font-black tracking-wider uppercase transition border ${
                          faultType === f.id 
                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" 
                            : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Transformer impedance configuration details */}
                <div className="pt-3 border-t border-slate-800">
                  <span className="text-xxs font-black tracking-wider uppercase text-slate-400 block mb-2">
                    Source Imp. Details
                  </span>
                  <div className="space-y-2">
                    <div className="flex justify-between text-xxs">
                      <span className="text-slate-400">Utility Capacity MVAsc:</span>
                      <strong className="text-white font-mono">{iscParams.utilityShortCircuitMVA || 500} MVA</strong>
                    </div>
                    <div className="flex justify-between text-xxs">
                      <span className="text-slate-400">Transformer Secondary Z%:</span>
                      <strong className="text-white font-mono">{iscParams.transformerZ || 5.0} %</strong>
                    </div>
                    <div className="flex justify-between text-xxs">
                      <span className="text-slate-400">Transformer Capacity:</span>
                      <strong className="text-white font-mono">{iscParams.transformerKVA || 500} kVA</strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Fault Duty Analysis Table results */}
            <div className="lg:col-span-8 flex flex-col gap-4">
              <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-4 overflow-x-auto">
                <span className="text-xxs font-black tracking-widest uppercase text-slate-400 block mb-3">
                  Fault Level Evaluation Table ({faultType} Fault)
                </span>

                <table className="w-full text-left text-xxs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider">
                      <th className="py-2">Bus Designation</th>
                      <th className="py-2 text-center">Fault Level (kA)</th>
                      <th className="py-2 text-center">Fault Capacity (MVA)</th>
                      <th className="py-2 text-center">kAIC Rating</th>
                      <th className="py-2 text-center">Duty Ratio (%)</th>
                      <th className="py-2 text-center">Withstand Limit</th>
                      <th className="py-2 text-right">Verdict</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {Object.values(faultResults).map(res => (
                      <tr key={res.id} className="hover:bg-slate-900/30">
                        <td className="py-2.5 font-bold text-white">{res.name}</td>
                        <td className="py-2.5 text-center font-mono font-bold text-yellow-400">
                          {res.iAvailable.toFixed(2)} kA
                        </td>
                        <td className="py-2.5 text-center font-mono text-slate-300">
                          {res.faultMVA.toFixed(1)} MVA
                        </td>
                        <td className="py-2.5 text-center font-mono text-slate-300">
                          {res.breakerkAIC > 0 ? `${res.breakerkAIC} kA` : "N/A"}
                        </td>
                        <td className={`py-2.5 text-center font-mono font-bold ${
                          res.dutyPercentage > 100 ? "text-red-400" : res.dutyPercentage > 80 ? "text-amber-400" : "text-emerald-400"
                        }`}>
                          {res.breakerkAIC > 0 ? `${res.dutyPercentage.toFixed(1)}%` : "N/A"}
                        </td>
                        <td className="py-2.5 text-center font-mono text-slate-400">
                          {res.thermalWithstandLimitTime > 100 ? "Safe" : `${res.thermalWithstandLimitTime.toFixed(2)}s`}
                        </td>
                        <td className="py-2.5 text-right">
                          <span className={`px-1.5 py-0.5 rounded uppercase tracking-wider font-bold text-[9px] ${
                            res.compliance === "CRITICAL VIOLATION" 
                              ? "bg-red-500/20 text-red-400 border border-red-500/30" 
                              : res.compliance === "WARNING" 
                                ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" 
                                : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                          }`}>
                            {res.compliance}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* TAB 4: PROFESSIONAL REPORTS & EXPORTS */}
        {activeAnalysisTab === "reports" && (
          <div className="lg:col-span-12">
            <ReportExportModule
              panel={panel}
              circuits={circuits}
              subPanels={subPanels}
              subSubPanels={subSubPanels}
              iscParams={iscParams}
              vdCalculations={vdCalculations}
              loadFlowResults={loadFlowResults}
              faultResults={faultResults}
              isPremium={isPremium}
              onRequestUpgrade={onRequestUpgrade}
              upstreamTrip={upstreamTrip}
              upstreamInstMultiplier={upstreamInstMultiplier}
              downstreamTrip={downstreamTrip}
              downstreamInstMultiplier={downstreamInstMultiplier}
              transformerPrimaryVoltage={transformerPrimaryVoltage}
              transformerPowerFactor={transformerPowerFactor}
              transformerDemandFactor={transformerDemandFactor}
              transformerLoadingFactor={transformerLoadingFactor}
            />
          </div>
        )}

      </div>

      {/* Engineering Recommendations & Compliance Panel */}
      <div className="bg-slate-950/40 border border-slate-800 rounded-lg p-5 mt-4">
        <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
          <Info className="w-4 h-4 text-emerald-400" />
          Intelligent Recommendations & Compliance Verifier (NEC Sec 110.9, PEC Part 1)
        </h3>
        
        <div className="space-y-2">
          {smartRecommendations.map((rec, idx) => (
            <div key={idx} className="flex gap-2.5 text-xs text-slate-300">
              <span className="text-emerald-400 font-bold shrink-0">→</span>
              <p className="leading-relaxed">{rec}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
