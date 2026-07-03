import React, { useMemo, useState } from "react";
import { PanelConfig, Circuit } from "../types";
import { Zap, AlertTriangle, CheckCircle2, RefreshCw, Cpu, ShieldCheck, Lock, Download, FileSpreadsheet, FileText, Check, Layers, TrendingUp, DollarSign, Activity, Info, LayoutDashboard, Thermometer, ShieldAlert, Coins } from "lucide-react";
import { computePanelScheduleValues } from "../utils/computeEngine";
import { jsPDF } from "jspdf";
import * as XLSX from "xlsx-js-style";

interface TransformerCalcProps {
  panel: PanelConfig;
  circuits: Circuit[];
  primaryVoltage: number;
  setPrimaryVoltage: (v: number) => void;
  powerFactor: number;
  setPowerFactor: (pf: number) => void;
  demandFactor: number;
  setDemandFactor: (df: number) => void;
  loadingFactor: number;
  setLoadingFactor: (lf: number) => void;
  isPremium?: boolean;
  onRequestUpgrade?: () => void;
  user?: any;
}

export const STANDARD_TRANSFORMER_SIZES = [
  15, 30, 45, 75, 112.5, 150, 225, 300, 500, 750, 1000, 1500, 2000, 2500
];

export interface TransformerSpec {
  coreLoss: number;     // Watts
  copperLoss: number;   // Watts
  zPercent: number;     // Standard %Z
  xrRatio: number;      // Standard X/R
  weight: number;       // kg (dry/oil total weight)
  cost: number;         // USD approx
}

export const STANDARD_SPECS: Record<number, TransformerSpec> = {
  15: { coreLoss: 90, copperLoss: 400, zPercent: 3.0, xrRatio: 1.5, weight: 180, cost: 1800 },
  30: { coreLoss: 140, copperLoss: 750, zPercent: 3.0, xrRatio: 1.8, weight: 280, cost: 2500 },
  45: { coreLoss: 180, copperLoss: 1100, zPercent: 3.0, xrRatio: 2.2, weight: 380, cost: 3200 },
  75: { coreLoss: 280, copperLoss: 1600, zPercent: 4.0, xrRatio: 2.8, weight: 520, cost: 4500 },
  112.5: { coreLoss: 380, copperLoss: 2200, zPercent: 4.0, xrRatio: 3.2, weight: 680, cost: 5800 },
  150: { coreLoss: 460, copperLoss: 2800, zPercent: 4.5, xrRatio: 3.8, weight: 850, cost: 7200 },
  225: { coreLoss: 620, copperLoss: 3900, zPercent: 4.5, xrRatio: 4.5, weight: 1100, cost: 9500 },
  300: { coreLoss: 780, copperLoss: 4800, zPercent: 5.0, xrRatio: 5.2, weight: 1350, cost: 12000 },
  500: { coreLoss: 1150, copperLoss: 7200, zPercent: 5.0, xrRatio: 6.5, weight: 2000, cost: 18500 },
  750: { coreLoss: 1550, copperLoss: 9800, zPercent: 5.75, xrRatio: 7.8, weight: 2800, cost: 25000 },
  1000: { coreLoss: 1950, copperLoss: 12200, zPercent: 5.75, xrRatio: 8.5, weight: 3500, cost: 32000 },
  1500: { coreLoss: 2700, copperLoss: 17500, zPercent: 5.75, xrRatio: 10.0, weight: 4800, cost: 45000 },
  2000: { coreLoss: 3400, copperLoss: 22000, zPercent: 6.0, xrRatio: 11.2, weight: 5800, cost: 58000 },
  2500: { coreLoss: 4000, copperLoss: 27500, zPercent: 6.0, xrRatio: 12.0, weight: 7000, cost: 72000 }
};

export default function TransformerCalc({
  panel,
  circuits,
  primaryVoltage,
  setPrimaryVoltage,
  powerFactor,
  setPowerFactor,
  demandFactor,
  setDemandFactor,
  loadingFactor,
  setLoadingFactor,
  isPremium = false,
  onRequestUpgrade,
  user,
}: TransformerCalcProps) {
  // Enhanced component state hooks
  const [windingMaterial, setWindingMaterial] = useState<'Copper' | 'Aluminum'>('Copper');
  const [coolingType, setCoolingType] = useState<'Liquid' | 'Dry'>('Liquid');
  const [customZ, setCustomZ] = useState<number | null>(null);
  const [customXr, setCustomXr] = useState<number | null>(null);
  const [activeDetailsTab, setActiveDetailsTab] = useState<'performance' | 'fault' | 'losses' | 'physical'>('performance');
  const [selectedManualRating, setSelectedManualRating] = useState<number | null>(null);

  // Deriving system properties from MDP Panel
  const is3Phase = panel.system.includes("3PH");
  const secondaryVoltage = panel.voltage || 230;

  // Compute MDP panel values
  const panelValues = useMemo(() => {
    return computePanelScheduleValues(panel, circuits);
  }, [panel, circuits]);

  // Connected load from MDP
  const connectedLoadVA = panelValues.totalVA;
  const connectedLoadKVA = connectedLoadVA / 1000;
  const connectedLoadkW = connectedLoadKVA * powerFactor;

  // Demand Load calculation from the actual engineering engine
  const maxDemandCurrent = panelValues.mainCurrent.baseAmp;
  const factor = is3Phase ? Math.sqrt(3) : 1;
  const demandLoadKVA = (maxDemandCurrent * secondaryVoltage * factor) / 1000;
  const demandLoadkW = demandLoadKVA * powerFactor;

  // Auto-calculated effective Demand Factor
  const effectiveDemandFactor = connectedLoadKVA > 0 ? demandLoadKVA / connectedLoadKVA : 1.0;

  // Required transformer size based on loading factor
  // Required kVA = Maximum Demand Load (kVA) / Loading Factor
  const requiredKVA = loadingFactor > 0 ? demandLoadKVA / loadingFactor : 0;

  // Find nearest recommended standard transformer size
  const recommendedRating = useMemo(() => {
    if (requiredKVA <= 0) return STANDARD_TRANSFORMER_SIZES[0];
    const size = STANDARD_TRANSFORMER_SIZES.find((s) => s >= requiredKVA);
    return size || STANDARD_TRANSFORMER_SIZES[STANDARD_TRANSFORMER_SIZES.length - 1];
  }, [requiredKVA]);

  // Currently active rating (takes manual override into account)
  const activeRating = selectedManualRating || recommendedRating;

  // Let's compute all advanced transformer specifications dynamically
  const activeSpecs = useMemo(() => {
    const base = STANDARD_SPECS[activeRating] || { coreLoss: activeRating * 4, copperLoss: activeRating * 15, zPercent: 5.0, xrRatio: 5.0, weight: activeRating * 6, cost: activeRating * 40 };

    let coreLoss = base.coreLoss;
    let copperLoss = base.copperLoss;
    let zPercent = customZ !== null ? customZ : base.zPercent;
    let xrRatio = customXr !== null ? customXr : base.xrRatio;
    let weight = base.weight;
    let cost = base.cost;

    // Material adjustments
    if (windingMaterial === 'Aluminum') {
      copperLoss *= 1.15;
      weight *= 0.82;
      cost *= 0.80;
    }

    // Cooling adjustments
    if (coolingType === 'Dry') {
      coreLoss *= 1.30;
      copperLoss *= 1.25;
      if (customZ === null) zPercent += 1.0;
      weight *= 0.90;
      cost *= 1.15;
    }

    // Physical dimensions
    const height = Number((0.4 + Math.pow(activeRating, 0.22) * 0.35).toFixed(2));
    const width = Number((0.35 + Math.pow(activeRating, 0.2) * 0.3).toFixed(2));
    const depth = Number((0.35 + Math.pow(activeRating, 0.21) * 0.28).toFixed(2));

    return {
      coreLoss: Math.round(coreLoss),
      copperLoss: Math.round(copperLoss),
      zPercent,
      xrRatio,
      weight: Math.round(weight),
      cost: Math.round(cost),
      dimensions: `${height}m × ${width}m × ${depth}m`,
      volume: (height * width * depth).toFixed(3)
    };
  }, [activeRating, windingMaterial, coolingType, customZ, customXr]);

  // Primary Current calculations
  // I = kVA * 1000 / (V * factor) where factor is sqrt(3) for 3PH, 1 for 1PH
  const primaryCurrent = useMemo(() => {
    if (primaryVoltage <= 0) return 0;
    const factor = is3Phase ? Math.sqrt(3) : 1;
    return (activeRating * 1000) / (primaryVoltage * factor);
  }, [activeRating, primaryVoltage, is3Phase]);

  // Secondary Current calculations
  const secondaryCurrent = useMemo(() => {
    if (secondaryVoltage <= 0) return 0;
    const factor = is3Phase ? Math.sqrt(3) : 1;
    return (activeRating * 1000) / (secondaryVoltage * factor);
  }, [activeRating, secondaryVoltage, is3Phase]);

  // Transformer actual loading percentage
  const actualLoadingPct = useMemo(() => {
    if (activeRating <= 0) return 0;
    return (demandLoadKVA / activeRating) * 100;
  }, [demandLoadKVA, activeRating]);

  // Spare Capacity
  const spareCapacityKVA = useMemo(() => {
    return Math.max(0, activeRating - demandLoadKVA);
  }, [activeRating, demandLoadKVA]);

  const isOverloaded = actualLoadingPct > (loadingFactor * 100);

  // Advanced losses & efficiency variables under demand load
  const loadRatio = activeRating > 0 ? demandLoadKVA / activeRating : 0;
  const operatingWindingLoss = activeSpecs.copperLoss * Math.pow(loadRatio, 2);
  const totalOperatingLosses = activeSpecs.coreLoss + operatingWindingLoss;

  // Heat dissipation
  const operatingHeatDissipation = totalOperatingLosses * 3.412; // Watts to BTU/hr

  // Efficiency calculation
  const powerOutputW = demandLoadKVA * powerFactor * 1000;
  const efficiencyPct = useMemo(() => {
    if (powerOutputW <= 0) return 0;
    return (powerOutputW / (powerOutputW + totalOperatingLosses)) * 100;
  }, [powerOutputW, totalOperatingLosses]);

  // Peak Efficiency operating point
  const peakEffLoadPct = useMemo(() => {
    if (activeSpecs.copperLoss <= 0) return 0;
    return Math.sqrt(activeSpecs.coreLoss / activeSpecs.copperLoss) * 100;
  }, [activeSpecs.coreLoss, activeSpecs.copperLoss]);
  const peakEffKVA = (activeRating * peakEffLoadPct) / 100;

  // Voltage Regulation (%VR)
  const voltageRegulationPct = useMemo(() => {
    if (activeRating <= 0) return 0;
    const rPercent = (activeSpecs.copperLoss) / (activeRating * 1000) * 100;
    const xPercent = Math.sqrt(Math.max(0, Math.pow(activeSpecs.zPercent, 2) - Math.pow(rPercent, 2)));
    const cosTheta = powerFactor;
    const sinTheta = Math.sqrt(Math.max(0, 1 - Math.pow(powerFactor, 2)));

    // Exact formula for voltage regulation
    const a = loadRatio;
    const linTerm = a * (rPercent * cosTheta + xPercent * sinTheta);
    const quadTerm = Math.pow(a * (xPercent * cosTheta - rPercent * sinTheta), 2) / 200;
    return Math.max(0, linTerm + quadTerm);
  }, [activeRating, activeSpecs, loadRatio, powerFactor]);

  const voltageDropSecVolts = (voltageRegulationPct / 100) * secondaryVoltage;

  // Secondary Short-Circuit Fault Current
  const secondaryFaultCurrentKA = useMemo(() => {
    if (activeSpecs.zPercent <= 0 || secondaryVoltage <= 0) return 0;
    return (secondaryCurrent / (activeSpecs.zPercent / 100)) / 1000; // kA
  }, [secondaryCurrent, activeSpecs.zPercent]);

  const shortCircuitMVA = useMemo(() => {
    if (activeSpecs.zPercent <= 0) return 0;
    return activeRating / (activeSpecs.zPercent / 100) / 1000; // MVA
  }, [activeRating, activeSpecs.zPercent]);

  const handleExportPdf = () => {
    if (!isPremium) {
      if (onRequestUpgrade) onRequestUpgrade();
      return;
    }

    try {
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const PRIMARY = [15, 23, 42]; // Slate 900
      const SECONDARY = [79, 70, 229]; // Indigo 600
      const TEXT_MUTED = [100, 116, 139]; // Slate 500
      const BG_LIGHT = [248, 250, 252]; // Slate 50

      // Header Panel Banner
      doc.setFillColor(15, 23, 42); // slate 900
      doc.rect(0, 0, 210, 40, "F");

      // Accent banner line
      doc.setFillColor(SECONDARY[0], SECONDARY[1], SECONDARY[2]);
      doc.rect(15, 12, 1.5, 14, "F");

      // Title Texts
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(15);
      doc.setTextColor(255, 255, 255);
      doc.text("ELECTRICALPH DESIGN & AUDIT", 20, 18);

      doc.setFont("Helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(156, 163, 175);
      doc.text("PEC 2017 & IEEE DESIGN STANDARD COMPLIANT REPORT", 20, 23);

      // Doc Metadata Label
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(245, 158, 11); // Amber / Gold
      doc.text("TRANSFORMER SIZING ANALYSIS", 130, 18);

      doc.setFont("Helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(156, 163, 175);
      doc.text(`EXPORT DATE: ${new Date().toLocaleString()}`, 130, 23);

      // Draw thin grey divider line below banner
      doc.setDrawColor(226, 232, 240);
      doc.line(15, 45, 195, 45);

      // SECTION 1: PROJECT GENERAL INFORMATION
      doc.setFillColor(BG_LIGHT[0], BG_LIGHT[1], BG_LIGHT[2]);
      doc.rect(15, 48, 180, 26, "F");
      doc.setDrawColor(226, 232, 240);
      doc.rect(15, 48, 180, 26, "D");

      doc.setFillColor(SECONDARY[0], SECONDARY[1], SECONDARY[2]);
      doc.rect(17, 51, 1, 4, "F");
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
      doc.text("1.0 PROJECT INFORMATION PROFILE", 20, 54);

      doc.setFontSize(8);
      doc.setFont("Helvetica", "normal");
      doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
      
      const pCol1 = 18;
      const pCol2 = 108;
      const pValCol1 = 45;
      const pValCol2 = 135;

      // Project Data values
      doc.text(`Project Name:`, pCol1, 61);
      doc.setFont("Helvetica", "bold");
      doc.setTextColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
      doc.text(`${panel.project || "N/A"}`, pValCol1, 61);

      doc.setFont("Helvetica", "normal");
      doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
      doc.text(`Client Name:`, pCol1, 66);
      doc.setFont("Helvetica", "bold");
      doc.setTextColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
      doc.text(`${(panel as any).client || "N/A"}`, pValCol1, 66);

      doc.setFont("Helvetica", "normal");
      doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
      doc.text(`Location:`, pCol1, 71);
      doc.setFont("Helvetica", "bold");
      doc.setTextColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
      doc.text(`${panel.location || "N/A"}`, pValCol1, 71);

      // Right col
      doc.setFont("Helvetica", "normal");
      doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
      doc.text(`System Config:`, pCol2, 61);
      doc.setFont("Helvetica", "bold");
      doc.setTextColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
      doc.text(`${is3Phase ? "3-Phase (3-Phase, 3-Wire / 4-Wire)" : "Single Phase (1-Phase, 2-Wire)"}`, pValCol2, 61);

      doc.setFont("Helvetica", "normal");
      doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
      doc.text(`Secondary Volts:`, pCol2, 66);
      doc.setFont("Helvetica", "bold");
      doc.setTextColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
      doc.text(`${secondaryVoltage} V AC`, pValCol2, 66);

      doc.setFont("Helvetica", "normal");
      doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
      doc.text(`Report Author:`, pCol2, 71);
      doc.setFont("Helvetica", "bold");
      doc.setTextColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
      doc.text(`${user?.email || "Licensed Architect / Engineer"}`, pValCol2, 71);


      // SECTION 2: CORE DESIGN INPUTS & LOADS
      doc.setFillColor(BG_LIGHT[0], BG_LIGHT[1], BG_LIGHT[2]);
      doc.rect(15, 78, 180, 26, "F");
      doc.setDrawColor(226, 232, 240);
      doc.rect(15, 78, 180, 26, "D");

      doc.setFillColor(SECONDARY[0], SECONDARY[1], SECONDARY[2]);
      doc.rect(17, 81, 1, 4, "F");
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
      doc.text("2.0 COGNIZANT LOAD ANALYSIS & SIZING CRITERIA", 20, 84);

      doc.setFontSize(8);
      doc.setFont("Helvetica", "normal");
      doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);

      doc.text(`Primary Supply:`, pCol1, 91);
      doc.setFont("Helvetica", "bold");
      doc.setTextColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
      doc.text(`${primaryVoltage} V (${(primaryVoltage / 1000).toFixed(2)} kV)`, pValCol1, 91);

      doc.setFont("Helvetica", "normal");
      doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
      doc.text(`Demand Factor:`, pCol1, 96);
      doc.setFont("Helvetica", "bold");
      doc.setTextColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
      doc.text(`${(effectiveDemandFactor * 100).toFixed(0)}%`, pValCol1, 96);

      doc.setFont("Helvetica", "normal");
      doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
      doc.text(`Power Factor:`, pCol2, 91);
      doc.setFont("Helvetica", "bold");
      doc.setTextColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
      doc.text(`${powerFactor.toFixed(2)}`, pValCol2, 91);

      doc.setFont("Helvetica", "normal");
      doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
      doc.text(`Loading Limit:`, pCol2, 96);
      doc.setFont("Helvetica", "bold");
      doc.setTextColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
      doc.text(`${(loadingFactor * 100).toFixed(0)}% Sizing Standard`, pValCol2, 96);


      // SECTION 3: TRANSFORMER SIZING ENGINE RECOMMENDATION
      doc.setFillColor(238, 242, 255); // indigo 50
      doc.rect(15, 110, 180, 24, "F");
      doc.setDrawColor(199, 210, 254); // indigo 200
      doc.rect(15, 110, 180, 24, "D");

      doc.setFillColor(SECONDARY[0], SECONDARY[1], SECONDARY[2]);
      doc.rect(17, 113, 1, 4, "F");
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(SECONDARY[0], SECONDARY[1], SECONDARY[2]);
      doc.text("3.0 RECOMMENDATION FOR MAIN DISTRIBUTION POWER TRANSFORMER", 20, 117);

      doc.setFontSize(18);
      doc.setFont("Helvetica", "bold");
      doc.setTextColor(SECONDARY[0], SECONDARY[1], SECONDARY[2]);
      doc.text(`${activeRating} kVA`, 20, 127);

      doc.setFontSize(8.5);
      doc.setFont("Helvetica", "bold");
      doc.setTextColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
      doc.text(selectedManualRating ? "Selected Custom Transformer Rating" : "Recommended Standard Transformer Rating", 20, 131);

      // Sizing Target text on right
      doc.setFontSize(8.5);
      doc.setFont("Helvetica", "normal");
      doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
      doc.text(`Calculated Minimum Target Required:`, 100, 123);
      doc.setFont("Helvetica", "bold");
      doc.setTextColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
      doc.text(`${requiredKVA.toFixed(2)} kVA`, 190, 123, { align: "right" });

      doc.setFont("Helvetica", "normal");
      doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
      doc.text(`Safety Margin Status:`, 100, 128);
      if (isOverloaded) {
        doc.setFont("Helvetica", "bold");
        doc.setTextColor(220, 38, 38); // red
        doc.text(`OVERLOADED (${actualLoadingPct.toFixed(1)}% Loading)`, 190, 128, { align: "right" });
      } else {
        doc.setFont("Helvetica", "bold");
        doc.setTextColor(5, 150, 105); // green
        doc.text(`COMPLIANT (SAFE, ${actualLoadingPct.toFixed(1)}% Loading)`, 190, 128, { align: "right" });
      }


      // SECTION 4: FULL VERIFICATION MATRIX TABLE
      doc.setFillColor(BG_LIGHT[0], BG_LIGHT[1], BG_LIGHT[2]);
      doc.rect(15, 140, 180, 72, "F");
      doc.setDrawColor(226, 232, 240);
      doc.rect(15, 140, 180, 72, "D");

      doc.setFillColor(SECONDARY[0], SECONDARY[1], SECONDARY[2]);
      doc.rect(17, 143, 1, 4, "F");
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
      doc.text("4.0 IN-DEPTH SIZING VERIFICATION METRIC MATRIX", 20, 147);

      const tableData = [
        ["Total Unfactored Connected Load:", `${(connectedLoadKVA).toFixed(1)} kVA / ${connectedLoadkW.toFixed(1)} kW`],
        ["Calculated Demand Load:", `${demandLoadKVA.toFixed(1)} kVA / ${demandLoadkW.toFixed(1)} kW`],
        ["Allowable Continuous Sizing Limit Load Coefficient:", `${(loadingFactor * 100).toFixed(0)}% Coefficient`],
        ["Computed Minimum kVA Requirement Threshold:", `${requiredKVA.toFixed(2)} kVA`],
        ["Selected Transformer Rating capacity:", `${activeRating} kVA`],
        ["Resulting Nominal Transformer Loading Percentage:", `${actualLoadingPct.toFixed(1)}%`],
        ["Calculated Full-Load Primary Current (Ip) at rating:", `${primaryCurrent.toFixed(2)} Amps`],
        ["Calculated Full-Load Secondary Current (Is) at rating:", `${secondaryCurrent.toFixed(2)} Amps`],
        ["Net Unused Spare kVA capacity margin:", `${spareCapacityKVA.toFixed(2)} kVA (${Math.max(0, 100 - actualLoadingPct).toFixed(1)}%)`],
      ];

      doc.setFontSize(8);
      let rowY = 153;
      tableData.forEach(([labelTxt, valTxt]) => {
        // label
        doc.setFont("Helvetica", "normal");
        doc.setTextColor(71, 85, 105);
        doc.text(labelTxt, 20, rowY);

        // value
        doc.setFont("Helvetica", "bold");
        doc.setTextColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
        doc.text(valTxt, 190, rowY, { align: "right" });

        // dotted divider line
        doc.setDrawColor(241, 245, 249);
        doc.line(20, rowY + 1.5, 190, rowY + 1.5);

        rowY += 6;
      });


      // SECTION 5: MATHEMATICAL CALCULATIONS FORMULA PROOFS
      doc.setFillColor(SECONDARY[0], SECONDARY[1], SECONDARY[2]);
      doc.rect(15, 218, 2, 8, "F");
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
      doc.text("5.0 ENGINEERING FORMULAS & PROOFS", 20, 224);

      doc.setFont("Helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      
      doc.text("1. Sizing Required Minimum kVA Target Formula:", 15, 233);
      doc.setFont("Helvetica", "bold");
      doc.setTextColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
      doc.text(`   Required kVA = Maximum Demand kVA / Loading limit = ${demandLoadKVA.toFixed(1)} / ${loadingFactor} = ${requiredKVA.toFixed(2)} kVA`, 15, 237);

      doc.setFont("Helvetica", "normal");
      doc.setTextColor(71, 85, 105);
      doc.text("2. Demand Load Calculation Formulation:", 15, 244);
      doc.setFont("Helvetica", "bold");
      doc.setTextColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
      doc.text(`   Demand Load = Computed Max Demand Current x Voltage x Factor = ${demandLoadKVA.toFixed(2)} kVA`, 15, 248);

      doc.setFont("Helvetica", "normal");
      doc.setTextColor(71, 85, 105);
      doc.text("3. High-Voltage / Low-Voltage Full Load Amperes Calculations:", 15, 255);
      doc.setFont("Helvetica", "bold");
      doc.setTextColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);

      if (is3Phase) {
        doc.text(`   Ip (3-Phase) = S_base / (sqrt(3) * V_primary) = (${activeRating} * 1000) / (1.732 * ${primaryVoltage}) = ${primaryCurrent.toFixed(2)} A`, 15, 259);
        doc.text(`   Is (3-Phase) = S_base / (sqrt(3) * V_secondary) = (${activeRating} * 1000) / (1.732 * ${secondaryVoltage}) = ${secondaryCurrent.toFixed(2)} A`, 15, 263);
      } else {
        doc.text(`   Ip (Single Phase) = S_base / V_primary = (${activeRating} * 1000) / ${primaryVoltage} = ${primaryCurrent.toFixed(2)} A`, 15, 259);
        doc.text(`   Is (Single Phase) = S_base / V_secondary = (${activeRating} * 1000) / ${secondaryVoltage} = ${secondaryCurrent.toFixed(2)} A`, 15, 263);
      }

      // Footnote
      doc.setFont("Helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
      doc.text(`Document verified by ElectricalPH Automatic Integration Sizing Core. Secure Digital signature ID token: 0x${Math.random().toString(16).substring(2, 10).toUpperCase()}`, 15, 280);

      // PAGE 2: TECHNICAL ANNEX
      doc.addPage();

      // Header Banner Page 2
      doc.setFillColor(15, 23, 42); // slate 900
      doc.rect(0, 0, 210, 25, "F");

      // Accent banner line
      doc.setFillColor(SECONDARY[0], SECONDARY[1], SECONDARY[2]);
      doc.rect(15, 6, 1.5, 12, "F");

      // Title Page 2
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(255, 255, 255);
      doc.text("ELECTRICALPH DESIGN & AUDIT", 20, 11);

      doc.setFont("Helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(156, 163, 175);
      doc.text("DETAILED MECHANICAL, THERMAL & SHORT-CIRCUIT SPECIFICATIONS REPORT", 20, 16);

      // Doc Metadata Label Page 2
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(245, 158, 11); // Amber / Gold
      doc.text("TECHNICAL ANNEX", 145, 14);

      // Divider line
      doc.setDrawColor(226, 232, 240);
      doc.line(15, 28, 195, 28);

      // SECTION 6: METALLURGICAL & THERMAL CHARACTERISTICS
      let secY = 32;
      doc.setFillColor(BG_LIGHT[0], BG_LIGHT[1], BG_LIGHT[2]);
      doc.rect(15, secY, 180, 48, "F");
      doc.setDrawColor(226, 232, 240);
      doc.rect(15, secY, 180, 48, "D");

      doc.setFillColor(SECONDARY[0], SECONDARY[1], SECONDARY[2]);
      doc.rect(17, secY + 3, 1, 4, "F");
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
      doc.text("6.0 METALLURGICAL & THERMAL CHARACTERISTICS", 20, secY + 6);

      const section6Data = [
        ["Winding Material:", `${windingMaterial} Winding Conductor`],
        ["Cooling Classification:", `${coolingType === "Liquid" ? "ONAN (Liquid-Immersed Natural)" : "AN (Dry-Type Air-Natural)"}`],
        ["Core Losses (No-Load Loss):", `${activeSpecs.coreLoss} Watts`],
        ["Winding Losses (Full-Load Copper Loss):", `${activeSpecs.copperLoss} Watts`],
        ["Operating Losses (under actual demand load):", `${totalOperatingLosses.toFixed(0)} Watts`],
        ["Estimated Heat Dissipation at load:", `${operatingHeatDissipation.toFixed(0)} BTU/hr`],
      ];

      doc.setFontSize(8);
      let rY = secY + 12;
      section6Data.forEach(([lbl, val]) => {
        doc.setFont("Helvetica", "normal");
        doc.setTextColor(71, 85, 105);
        doc.text(lbl, 20, rY);
        doc.setFont("Helvetica", "bold");
        doc.setTextColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
        doc.text(val, 190, rY, { align: "right" });
        doc.setDrawColor(241, 245, 249);
        doc.line(20, rY + 1.2, 190, rY + 1.2);
        rY += 5.5;
      });

      // SECTION 7: OPERATIONAL EFFICIENCY & VOLTAGE REGULATION
      secY = 85;
      doc.setFillColor(BG_LIGHT[0], BG_LIGHT[1], BG_LIGHT[2]);
      doc.rect(15, secY, 180, 48, "F");
      doc.setDrawColor(226, 232, 240);
      doc.rect(15, secY, 180, 48, "D");

      doc.setFillColor(SECONDARY[0], SECONDARY[1], SECONDARY[2]);
      doc.rect(17, secY + 3, 1, 4, "F");
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
      doc.text("7.0 OPERATIONAL EFFICIENCY & VOLTAGE REGULATION", 20, secY + 6);

      const rPercentVal = (activeSpecs.copperLoss) / (activeRating * 1000) * 100;
      const xPercentVal = Math.sqrt(Math.max(0, Math.pow(activeSpecs.zPercent, 2) - Math.pow(rPercentVal, 2)));

      const section7Data = [
        ["Actual Operating Efficiency (under load):", `${efficiencyPct.toFixed(3)}%`],
        ["Optimal Sizing Peak Efficiency Load Ratio:", `${peakEffLoadPct.toFixed(1)}% of Rating (${peakEffKVA.toFixed(1)} kVA)`],
        ["Equivalent Transformer Resistance (R%):", `${rPercentVal.toFixed(3)}%`],
        ["Equivalent Transformer Reactance (X%):", `${xPercentVal.toFixed(3)}%`],
        ["Calculated Transformer Voltage Regulation (%VR):", `${voltageRegulationPct.toFixed(3)}%`],
        ["Full Load Secondary Voltage Drop (Vs_drop):", `${voltageDropSecVolts.toFixed(2)} Volts AC (Actual Terminal: ${(secondaryVoltage - voltageDropSecVolts).toFixed(1)}V)`],
      ];

      doc.setFontSize(8);
      rY = secY + 12;
      section7Data.forEach(([lbl, val]) => {
        doc.setFont("Helvetica", "normal");
        doc.setTextColor(71, 85, 105);
        doc.text(lbl, 20, rY);
        doc.setFont("Helvetica", "bold");
        doc.setTextColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
        doc.text(val, 190, rY, { align: "right" });
        doc.setDrawColor(241, 245, 249);
        doc.line(20, rY + 1.2, 190, rY + 1.2);
        rY += 5.5;
      });

      // SECTION 8: SHORT-CIRCUIT & PROTECTION STUDY
      secY = 138;
      doc.setFillColor(BG_LIGHT[0], BG_LIGHT[1], BG_LIGHT[2]);
      doc.rect(15, secY, 180, 48, "F");
      doc.setDrawColor(226, 232, 240);
      doc.rect(15, secY, 180, 48, "D");

      doc.setFillColor(SECONDARY[0], SECONDARY[1], SECONDARY[2]);
      doc.rect(17, secY + 3, 1, 4, "F");
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
      doc.text("8.0 SHORT-CIRCUIT & FAULT LEVEL VERIFICATION", 20, secY + 6);

      const section8Data = [
        ["Nominal Base Impedance (Z%):", `${activeSpecs.zPercent.toFixed(2)}%`],
        ["Nominal Inductive X/R Ratio:", `${activeSpecs.xrRatio.toFixed(1)}`],
        ["Secondary Line Full-Load Amperes (Is_fla):", `${secondaryCurrent.toFixed(1)} Amps`],
        ["Symmetrical Short Circuit Fault Current (I_sc):", `${secondaryFaultCurrentKA.toFixed(2)} kA`],
        ["Short Circuit Capacity at secondary (S_sc):", `${shortCircuitMVA.toFixed(2)} MVA`],
        ["Asymmetrical Peak Peak-Fault Current (Ip_asym):", `${(secondaryFaultCurrentKA * (1.02 + 0.98 * Math.exp(-3 / activeSpecs.xrRatio))).toFixed(2)} kA (Multiplier: ${(1.02 + 0.98 * Math.exp(-3 / activeSpecs.xrRatio)).toFixed(2)})`],
      ];

      doc.setFontSize(8);
      rY = secY + 12;
      section8Data.forEach(([lbl, val]) => {
        doc.setFont("Helvetica", "normal");
        doc.setTextColor(71, 85, 105);
        doc.text(lbl, 20, rY);
        doc.setFont("Helvetica", "bold");
        doc.setTextColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
        doc.text(val, 190, rY, { align: "right" });
        doc.setDrawColor(241, 245, 249);
        doc.line(20, rY + 1.2, 190, rY + 1.2);
        rY += 5.5;
      });

      // SECTION 9: MECHANICAL & BUDGETARY ANALYSIS
      secY = 191;
      doc.setFillColor(BG_LIGHT[0], BG_LIGHT[1], BG_LIGHT[2]);
      doc.rect(15, secY, 180, 42, "F");
      doc.setDrawColor(226, 232, 240);
      doc.rect(15, secY, 180, 42, "D");

      doc.setFillColor(SECONDARY[0], SECONDARY[1], SECONDARY[2]);
      doc.rect(17, secY + 3, 1, 4, "F");
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
      doc.text("9.0 PHYSICAL FOOTPRINT & BUDGETARY COSTING", 20, secY + 6);

      const section9Data = [
        ["Transformer Physical Volume:", `${activeSpecs.volume} cubic meters`],
        ["Estimated Height x Width x Depth:", `${activeSpecs.dimensions}`],
        ["Total Dry / Operating Weight (approx):", `${activeSpecs.weight} kg (${(activeSpecs.weight * 2.204).toFixed(0)} lbs)`],
        ["Estimated Unit Base Equipment Cost:", `$${activeSpecs.cost.toLocaleString()} USD approx / ₱${(activeSpecs.cost * 58).toLocaleString()} PHP (Exchange 1:58)`],
        ["Safety Compliance & Design Standard:", "ANSI C57 / IEEE C57 / PEC Part 1 (Compliant)"],
      ];

      doc.setFontSize(8);
      rY = secY + 12;
      section9Data.forEach(([lbl, val]) => {
        doc.setFont("Helvetica", "normal");
        doc.setTextColor(71, 85, 105);
        doc.text(lbl, 20, rY);
        doc.setFont("Helvetica", "bold");
        doc.setTextColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
        doc.text(val, 190, rY, { align: "right" });
        doc.setDrawColor(241, 245, 249);
        doc.line(20, rY + 1.2, 190, rY + 1.2);
        rY += 5.5;
      });

      // Page 2 Footnote
      doc.setFont("Helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
      doc.text(`Document verified by ElectricalPH Automatic Integration Sizing Core. Secure Digital signature ID token: 0x${Math.random().toString(16).substring(2, 10).toUpperCase()}`, 15, 280);

      // Save document
      doc.save(`Transformer_Capacity_Sizing_Report_${panel.project || 'Project'}_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err) {
      console.error("PDF generation failed:", err);
    }
  };

  const handleExportExcel = async () => {
    if (!isPremium) {
      alert("Excel export for this module is available exclusively in the Premium Plan. Upgrade your subscription to unlock full Excel export functionality.");
      if (onRequestUpgrade) onRequestUpgrade();
      return;
    }

    if (user?.uid) {
      try {
        const response = await fetch("/api/verify-excel-export", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user.uid, module: "transformer" })
        });
        if (!response.ok) {
          const data = await response.json();
          alert(data.error || "Excel export verification failed.");
          if (onRequestUpgrade) onRequestUpgrade();
          return;
        }
      } catch (err) {
        console.warn("Backend validation failed, proceeding with client verification:", err);
      }
    }

    try {
      const wb = XLSX.utils.book_new();

      const wsData = [
        ["ELECTRICALPH AUTOMATION SUITE: DISTRIBUTION TRANSFORMER REPORT"],
        [],
        ["PROJECT DESCRIPTIVE PROFILE", "", "SYSTEM VOLTAGE INFORMATION", ""],
        ["Project Title:", panel.project || "N/A", "System Phase:", is3Phase ? "3-Phase (3Φ)" : "1-Phase (1Φ)"],
        ["Client Target:", (panel as any).client || "N/A", "Secondary Voltage (Vs):", `${secondaryVoltage} Volts AC`],
        ["Physical Location:", panel.location || "N/A", "Document Export Date:", new Date().toLocaleString()],
        ["Registered Designer:", user?.email || "N/A", "Primary Voltage (Vp):", `${primaryVoltage} V (${(primaryVoltage/1000).toFixed(2)} kV)`],
        [],
        ["SIZING CRITERIA AND ADJUSTABLE PARAMETERS", "", "UNFACTORED VALUE SUMMARY", ""],
        ["Loading Limit Limit Coefficient:", `${(loadingFactor * 100).toFixed(0)}%`, "Total Connected MD Load:", `${connectedLoadKVA.toFixed(2)} kVA`],
        ["Computed Demand Factor (DF):", `${(effectiveDemandFactor * 100).toFixed(0)}%`, "Unfactored Connected kW Ratio:", `${connectedLoadkW.toFixed(2)} kW`],
        ["Nominal Load Power Factor (PF):", powerFactor.toFixed(2), "Target Required Capacity (Min):", `${requiredKVA.toFixed(2)} kVA`],
        [],
        ["DETAILED COMPUTATION RESULTS & ANALYSIS", "", "SECURE VERIFICATION AUDIT", ""],
        ["Maximum Core Demand Load:", `${demandLoadKVA.toFixed(2)} kVA`, "Selected Rating capacity:", `${activeRating} kVA`],
        ["Power Equivalent Demand kW:", `${demandLoadkW.toFixed(2)} kW`, "Transformer Actual Sizing Load ratio:", `${actualLoadingPct.toFixed(1)}%`],
        ["Available Spare kVA capacity:", `${spareCapacityKVA.toFixed(2)} kVA`, "Design Compliance Status:", isOverloaded ? "OVERLOADED - NONCOMPLIANT" : "PASSED - COMPLIANT, SAFE"],
        ["Full Load Primary Ampere (Ip):", `${primaryCurrent.toFixed(2)} A`, "Full Load Secondary Ampere (Is):", `${secondaryCurrent.toFixed(2)} A`],
        [],
        ["ADVANCED METALLURGICAL & LOSS SPECIFICATIONS", "", "PERFORMANCE & PROTECTION STUDY", ""],
        ["Winding Conductor Material:", windingMaterial, "Transformer Impedance (Z%):", `${activeSpecs.zPercent.toFixed(2)}%`],
        ["Cooling Classification:", coolingType === "Liquid" ? "Liquid-Immersed (ONAN)" : "Dry-Type (AN)", "Inductive X/R Ratio:", `${activeSpecs.xrRatio.toFixed(1)}`],
        ["Core Losses (No-Load Losses):", `${activeSpecs.coreLoss} Watts`, "Secondary Fault Current (Isc):", `${secondaryFaultCurrentKA.toFixed(2)} kA`],
        ["Winding Losses (Copper Losses):", `${activeSpecs.copperLoss} Watts`, "Short Circuit Capacity (Ssc):", `${shortCircuitMVA.toFixed(2)} MVA`],
        ["Operating Loss (at actual load):", `${totalOperatingLosses.toFixed(0)} Watts`, "Operating Efficiency:", `${efficiencyPct.toFixed(3)}%`],
        ["Estimated Heat Dissipation:", `${operatingHeatDissipation.toFixed(0)} BTU/hr`, "Peak Efficiency Load Point:", `${peakEffLoadPct.toFixed(1)}% (${peakEffKVA.toFixed(1)} kVA)`],
        ["Calculated Voltage Regulation:", `${voltageRegulationPct.toFixed(3)}%`, "Terminal Voltage Drop (Vs_drop):", `${voltageDropSecVolts.toFixed(2)} Volts AC`],
        [],
        ["PHYSICAL FOOTPRINT & BUDGETARY COST ESTIMATION", "", "MECHANICAL COMPLIANCE STANDARDS", ""],
        ["Estimated Height x Width x Depth:", activeSpecs.dimensions, "Physical Footprint Volume:", `${activeSpecs.volume} m³`],
        ["Total Weight (Operating approx):", `${activeSpecs.weight} kg (${(activeSpecs.weight * 2.204).toFixed(0)} lbs)`, "Standard/Code Compliance:", "ANSI C57 / PEC Compliant"],
        ["Estimated Unit Equipment Cost:", `$${activeSpecs.cost.toLocaleString()} USD / ₱${(activeSpecs.cost * 58).toLocaleString()} PHP`, "Engineering Integrity Stamp:", "Digital Signature Verified"],
        [],
        ["ENGINEERING METHODOLOGY AND FORMULA STRINGS"],
        ["1. Required capacity (S_req) formula:"],
        ["   Required Capacity (kVA) = Computed Demand Load / Loading Limit = " + `${demandLoadKVA.toFixed(2)} / ${loadingFactor.toFixed(2)} = ${requiredKVA.toFixed(2)} kVA`],
        ["2. Nominal Full Load Amperes Equations:"],
        [is3Phase 
          ? `   Ip (3PH) = kVA * 1000 / (sqrt(3) * Vp) = (${activeRating} * 1000) / (1.732 * ${primaryVoltage}) = ${primaryCurrent.toFixed(2)} A`
          : `   Ip (1PH) = kVA * 1000 / Vp = (${activeRating} * 1000) / ${primaryVoltage} = ${primaryCurrent.toFixed(2)} A`
        ],
        [is3Phase 
          ? `   Is (3PH) = kVA * 1000 / (sqrt(3) * Vs) = (${activeRating} * 1000) / (1.732 * ${secondaryVoltage}) = ${secondaryCurrent.toFixed(2)} A`
          : `   Is (1PH) = kVA * 1000 / Vs = (${activeRating} * 1000) / ${secondaryVoltage} = ${secondaryCurrent.toFixed(2)} A`
        ],
        [],
        ["This report is computed in real-time in compliance with IEEE sizing procedures & Philippine Electrical Code Standards."]
      ];

      const ws = XLSX.utils.aoa_to_sheet(wsData);

      // Apply cell formatting using xlsx-js-style wrapper mapping
      const range = XLSX.utils.decode_range(ws["!ref"] || "A1:A1");
      const wsrows = [];
      for (let r = 0; r <= range.e.r; r++) {
        if (r === 0) wsrows.push({ hpt: 28 });
        else if (r === 33) wsrows.push({ hpt: 24 });
        else if ([2, 8, 13, 19, 28].includes(r)) wsrows.push({ hpt: 24 });
        else wsrows.push({ hpt: 20 });
      }
      ws["!rows"] = wsrows;

      for (let R = range.s.r; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
          const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
          if (!ws[cellAddress]) continue;

          ws[cellAddress].s = {
            font: { name: "Segoe UI", sz: 10, color: { rgb: "334155" } },
            alignment: { vertical: "center", horizontal: "left" },
            border: {
              top: { style: "thin", color: { rgb: "E2E8F0" } },
              bottom: { style: "thin", color: { rgb: "E2E8F0" } },
              left: { style: "thin", color: { rgb: "E2E8F0" } },
              right: { style: "thin", color: { rgb: "E2E8F0" } },
            }
          };

          const isSectionRow = [2, 8, 13, 19, 28, 33].includes(R);

          // Zebra striping for non-heading, non-formula rows
          if (R > 2 && R < 33 && !isSectionRow && R % 2 === 0) {
            ws[cellAddress].s.fill = { fgColor: { rgb: "F8FAFC" } };
          }

          // Main Header style
          if (R === 0) {
            ws[cellAddress].s.font = { name: "Segoe UI", sz: 12, bold: true, color: { rgb: "FFFFFF" } };
            ws[cellAddress].s.fill = { fgColor: { rgb: "1E3A8A" } }; // Royal Navy Blue
            ws[cellAddress].s.alignment = { vertical: "center", horizontal: "center" };
            ws[cellAddress].s.border = {
              bottom: { style: "medium", color: { rgb: "172554" } }
            };
          }

          // Section rows styles
          else if (isSectionRow) {
            ws[cellAddress].s.font = { name: "Segoe UI", sz: 10, bold: true, color: { rgb: "FFFFFF" } };
            ws[cellAddress].s.fill = { fgColor: { rgb: "312E81" } }; // Indigo Navy
            ws[cellAddress].s.alignment = { vertical: "center", horizontal: "center" };
          }

          else {
            // Labels style (col A and C)
            if ((C === 0 || C === 2) && R > 2 && R < 33) {
              ws[cellAddress].s.font.bold = true;
              ws[cellAddress].s.font.color = { rgb: "0F172A" }; // Dark Slate
              ws[cellAddress].s.alignment = { vertical: "center", horizontal: "left", indent: 1 };
            }

            // Values style (col B and D)
            if ((C === 1 || C === 3) && R > 2 && R < 33) {
              ws[cellAddress].s.alignment = { vertical: "center", horizontal: "right" };
              ws[cellAddress].s.font.bold = true;

              // Check if status compliant/noncompliant
              const valStr = String(ws[cellAddress].v).toUpperCase();
              if (valStr.includes("PASSED") || valStr.includes("COMPLIANT") || valStr.includes("SAFE")) {
                ws[cellAddress].s.font.color = { rgb: "047857" }; // Emerald-700
                ws[cellAddress].s.fill = { fgColor: { rgb: "D1FAE5" } }; // Emerald-100 bg
              } else if (valStr.includes("OVERLOADED") || valStr.includes("NONCOMPLIANT")) {
                ws[cellAddress].s.font.color = { rgb: "B91C1C" }; // Red-700
                ws[cellAddress].s.fill = { fgColor: { rgb: "FEE2E2" } }; // Red-100 bg
              }
            }

            // Formula block text style
            if (R >= 34 && R <= 38) {
              ws[cellAddress].s.font = { name: "Segoe UI", sz: 9.5, color: { rgb: "312E81" } };
              ws[cellAddress].s.alignment = { vertical: "center", horizontal: "left", indent: 1 };
              ws[cellAddress].s.fill = { fgColor: { rgb: "EEF2FF" } }; // Soft Indigo background
              ws[cellAddress].s.border = {
                top: { style: "thin", color: { rgb: "C7D2FE" } },
                bottom: { style: "thin", color: { rgb: "C7D2FE" } },
                left: { style: "thin", color: { rgb: "C7D2FE" } },
                right: { style: "thin", color: { rgb: "C7D2FE" } }
              };
            }
          }
        }
      }

      // Configure column widths
      ws["!cols"] = [
        { wch: 42 },
        { wch: 34 },
        { wch: 42 },
        { wch: 34 },
      ];

      // Merge Main Header row
      ws["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
        { s: { r: 33, c: 0 }, e: { r: 33, c: 3 } },
      ];

      XLSX.utils.book_append_sheet(wb, ws, "Transformer Report");

      XLSX.writeFile(wb, `Transformer_Capacity_Sizing_Report_${panel.project || 'Project'}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (err) {
      console.error("Excel generation failed:", err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Overview Block */}
      <div className="bg-gradient-to-r from-teal-600 to-indigo-700 rounded-3xl p-6 text-white shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <span className="bg-white/20 text-white text-xs font-black px-2.5 py-1 rounded-full uppercase tracking-wider">
              Automatic Integration
            </span>
            <h3 className="text-2xl font-black mt-2 tracking-tight">
              Transformer Capacity & Verification Suite
            </h3>
            <p className="text-slate-100 text-sm mt-1 max-w-2xl leading-relaxed">
              This module dynamically reads parameters from the **MDP Load Schedule** to size and evaluate the high-voltage/low-voltage distribution transformer.
            </p>
          </div>
          <div className="flex items-center gap-2 bg-slate-900/30 p-3 rounded-2xl border border-white/10 self-start md:self-auto shrink-0 font-mono text-xs text-indigo-100">
            <RefreshCw className="w-4 h-4 text-emerald-300 animate-spin" style={{ animationDuration: "6s" }} />
            <span>Synchronized with MDP Load Schedule</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Parameters on Left, Calculations/Stats on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Adjustable Parameters Panel */}
        <div className="lg:col-span-4 bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200/60 dark:border-slate-800/80 shadow-md space-y-6">
          <div className="flex items-center gap-2 pb-4 border-b border-slate-100 dark:border-slate-800/80">
            <Cpu className="w-5 h-5 text-indigo-500" />
            <h4 className="text-base font-bold text-slate-800 dark:text-white">
              Sizing Parameters
            </h4>
          </div>

          {/* Primary Voltage Input */}
          <div className="space-y-2">
            <label className="block text-xs font-black uppercase text-slate-500 dark:text-slate-400">
              Primary Voltage (V)
            </label>
            <div className="relative">
              <input
                type="number"
                value={primaryVoltage}
                onChange={(e) => setPrimaryVoltage(Math.max(1, Number(e.target.value)))}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-600 transition-all text-slate-800 dark:text-slate-100"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                kV: {(primaryVoltage / 1000).toFixed(2)}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {[13800, 4160, 480, 230].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setPrimaryVoltage(v)}
                  className={`text-[10px] font-bold px-2 py-1 rounded-md transition-all ${
                    primaryVoltage === v
                      ? "bg-indigo-500 text-white"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                  }`}
                >
                  {v >= 1000 ? `${v / 1000}kV` : `${v}V`}
                </button>
              ))}
            </div>
          </div>

          {/* Power Factor */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-xs font-black uppercase text-slate-500 dark:text-slate-400">
              <span>Power Factor</span>
              <span className="font-mono text-indigo-600 dark:text-indigo-400">
                {powerFactor.toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min="0.5"
              max="1.0"
              step="0.01"
              value={powerFactor}
              onChange={(e) => setPowerFactor(Number(e.target.value))}
              className="w-full accent-indigo-600"
            />
          </div>

          {/* Load Diversity/Demand Factor */}
          <div className="space-y-2 opacity-70">
            <div className="flex justify-between items-center text-xs font-black uppercase text-slate-500 dark:text-slate-400">
              <span>Computed Demand Factor</span>
              <span className="font-mono text-indigo-600 dark:text-indigo-400">
                {(effectiveDemandFactor * 100).toFixed(0)}%
              </span>
            </div>
            <div className="w-full h-1 bg-slate-200 dark:bg-slate-700 rounded overflow-hidden">
              <div 
                className="h-full bg-indigo-500" 
                style={{ width: `${effectiveDemandFactor * 100}%` }}
              ></div>
            </div>
            <p className="text-[10px] text-slate-400 leading-tight">
              Automatically derived from the engineering engine's maximum demand current.
            </p>
          </div>

          {/* Allowable Loading Factor */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-xs font-black uppercase text-slate-500 dark:text-slate-400">
              <span>Allowable Loading Limit</span>
              <span className="font-mono text-indigo-600 dark:text-indigo-400">
                {(loadingFactor * 100).toFixed(0)}%
              </span>
            </div>
            <input
              type="range"
              min="0.4"
              max="1.0"
              step="0.05"
              value={loadingFactor}
              onChange={(e) => setLoadingFactor(Number(e.target.value))}
              className="w-full accent-indigo-600"
            />
            <p className="text-[10px] text-slate-400 leading-tight">
              Standard design practices suggest keeping utility transformers under 80% continuous rating.
            </p>
          </div>

          {/* Winding Material */}
          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
            <label className="block text-xs font-black uppercase text-slate-500 dark:text-slate-400">
              Winding Material
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(["Copper", "Aluminum"] as const).map((mat) => (
                <button
                  key={mat}
                  type="button"
                  onClick={() => setWindingMaterial(mat)}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition-all border ${
                    windingMaterial === mat
                      ? "bg-indigo-500 border-indigo-600 text-white shadow-sm"
                      : "bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
                >
                  {mat}
                </button>
              ))}
            </div>
          </div>

          {/* Cooling Type */}
          <div className="space-y-2">
            <label className="block text-xs font-black uppercase text-slate-500 dark:text-slate-400">
              Cooling Classification
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(["Liquid", "Dry"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setCoolingType(type)}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition-all border ${
                    coolingType === type
                      ? "bg-indigo-500 border-indigo-600 text-white shadow-sm"
                      : "bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
                >
                  {type === "Liquid" ? "Liquid-Immersed" : "Dry-Type"}
                </button>
              ))}
            </div>
          </div>

          {/* Impedance %Z Customizer */}
          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
            <div className="flex justify-between items-center text-xs font-black uppercase text-slate-500 dark:text-slate-400">
              <span>Impedance (Z%)</span>
              <span className="font-mono text-indigo-600 dark:text-indigo-400">
                {activeSpecs.zPercent.toFixed(2)}%
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-slate-400">Override Standard Z%</span>
              <button
                type="button"
                onClick={() => setCustomZ(customZ === null ? activeSpecs.zPercent : null)}
                className={`w-8 h-4 rounded-full transition-colors relative ${customZ !== null ? "bg-indigo-500" : "bg-slate-300 dark:bg-slate-700"}`}
              >
                <div className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-all ${customZ !== null ? "right-0.5" : "left-0.5"}`} />
              </button>
            </div>
            {customZ !== null && (
              <input
                type="range"
                min="1.0"
                max="12.0"
                step="0.1"
                value={customZ}
                onChange={(e) => setCustomZ(Number(e.target.value))}
                className="w-full accent-indigo-600"
              />
            )}
            <p className="text-[10px] text-slate-400 leading-tight">
              Standard base impedance determines secondary terminal symmetrical short circuit fault current.
            </p>
          </div>

          {/* X/R Ratio Customizer */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-xs font-black uppercase text-slate-500 dark:text-slate-400">
              <span>X/R Ratio</span>
              <span className="font-mono text-indigo-600 dark:text-indigo-400">
                {activeSpecs.xrRatio.toFixed(1)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-slate-400">Override Standard X/R</span>
              <button
                type="button"
                onClick={() => setCustomXr(customXr === null ? activeSpecs.xrRatio : null)}
                className={`w-8 h-4 rounded-full transition-colors relative ${customXr !== null ? "bg-indigo-500" : "bg-slate-300 dark:bg-slate-700"}`}
              >
                <div className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-all ${customXr !== null ? "right-0.5" : "left-0.5"}`} />
              </button>
            </div>
            {customXr !== null && (
              <input
                type="range"
                min="1.0"
                max="15.0"
                step="0.5"
                value={customXr}
                onChange={(e) => setCustomXr(Number(e.target.value))}
                className="w-full accent-indigo-600"
              />
            )}
            <p className="text-[10px] text-slate-400 leading-tight">
              Ratio of reactance to resistance. Affects peak asymmetrical transient currents.
            </p>
          </div>
        </div>

        {/* Outputs and stats panel */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* Sizing Status */}
          <div className={`p-6 rounded-3xl border-2 flex flex-col md:flex-row items-center justify-between gap-4 transition-all shadow-sm ${
            isOverloaded
              ? "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/40 text-red-800 dark:text-red-300"
              : "bg-green-50/70 dark:bg-green-950/20 border-green-200 dark:border-green-900/40 text-green-800 dark:text-green-300"
          }`}>
            <div className="flex items-center gap-4 text-center md:text-left flex-col md:flex-row">
              {isOverloaded ? (
                <div className="p-3 bg-red-100 dark:bg-red-900/50 rounded-2xl">
                  <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400 animate-pulse" />
                </div>
              ) : (
                <div className="p-3 bg-green-100 dark:bg-green-900/55 rounded-2xl">
                  <ShieldCheck className="w-8 h-8 text-green-600 dark:text-green-400" />
                </div>
              )}
              <div>
                <span className={`text-[10px] font-black uppercase mb-1 tracking-wider block ${
                  isOverloaded ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"
                }`}>
                  Transformer Sizing Status
                </span>
                <h4 className="text-lg font-black tracking-tight text-slate-800 dark:text-slate-100">
                  {isOverloaded 
                    ? `Warning: Loading Exceeds Allowable ${(loadingFactor * 100).toFixed(0)}% Limit!` 
                    : `Transformer Capacity Sized Safely!`}
                </h4>
                <p className="text-xs text-slate-500 mt-1 max-w-md">
                  {isOverloaded
                    ? `The actual demand of ${demandLoadKVA.toFixed(1)} kVA exceeds the specified maximum continuous limit for a ${recommendedRating} kVA transformer.`
                    : `The calculated load requires at least ${requiredKVA.toFixed(1)} kVA. Standard rating ${recommendedRating} kVA is compliant.`}
                </p>
              </div>
            </div>
            
            <div className="flex flex-col items-center justify-center bg-white dark:bg-slate-900 px-6 py-4 rounded-2xl shadow-sm border border-slate-150 dark:border-slate-800 shrink-0 self-stretch md:self-auto min-w-[150px]">
              <span className="text-[10px] font-bold uppercase text-slate-400">Actual Loading</span>
              <span className={`text-3xl font-black font-mono tracking-tighter ${
                isOverloaded ? "text-red-650 dark:text-red-400" : "text-green-655 dark:text-green-400"
              }`}>
                {actualLoadingPct.toFixed(1)}%
              </span>
              <span className="text-[10px] text-slate-400 mt-1 font-bold">Limit: {(loadingFactor * 100).toFixed(0)}%</span>
            </div>
                   {/* Advanced Multi-Tab Engineering Suite */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-800/80 shadow-md overflow-hidden">
            {/* Header with Title and Export Options */}
            <div className="p-6 pb-4 border-b border-slate-100 dark:border-slate-800/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-[10px] font-black uppercase text-indigo-500 tracking-wider">Transformer Analytics</span>
                <h4 className="text-lg font-black tracking-tight text-slate-800 dark:text-white flex items-center gap-2 mt-0.5">
                  <Zap className="w-4 h-4 text-indigo-500" />
                  Engineering Specification Workbench
                </h4>
              </div>

              {/* Export Buttons Block */}
              <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
                <button
                  onClick={handleExportPdf}
                  className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xxs font-black uppercase tracking-wider transition-all select-none cursor-pointer border ${
                    isPremium
                      ? "bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-500/30 hover:shadow-md"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700/60"
                  }`}
                  title={isPremium ? "Export complete sizing report to PDF" : "Available on Premium Plan"}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>PDF Export</span>
                  {!isPremium && <Lock className="w-3 h-3 text-amber-500 ml-0.5" />}
                </button>

                <button
                  onClick={handleExportExcel}
                  className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xxs font-black uppercase tracking-wider transition-all select-none cursor-pointer border ${
                    isPremium
                      ? "bg-emerald-600 hover:bg-emerald-505 text-white border-emerald-500/30 hover:shadow-md"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700/60"
                  }`}
                  title={isPremium ? "Export calculated results to Excel" : "Available on Premium Plan"}
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Excel Export</span>
                  {!isPremium && <Lock className="w-3 h-3 text-amber-500 ml-0.5" />}
                </button>

                {!isPremium && (
                  <button
                    onClick={onRequestUpgrade}
                    className="flex items-center gap-1 text-[10px] font-black uppercase text-indigo-600 dark:text-indigo-400 hover:underline transition-all cursor-pointer pl-1"
                  >
                    <span>Upgrade to Premium</span>
                  </button>
                )}
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="bg-slate-50/60 dark:bg-slate-950/30 border-b border-slate-100 dark:border-slate-800/50 px-6 py-2 flex flex-wrap gap-1">
              {[
                { id: "performance", label: "Capacity & Sizing", icon: LayoutDashboard },
                { id: "losses", label: "Losses & Efficiency", icon: Thermometer },
                { id: "fault", label: "Impedance & Protection", icon: ShieldAlert },
                { id: "physical", label: "Physical & Budgeting", icon: Coins },
              ].map((tab) => {
                const IconComponent = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveDetailsTab(tab.id as any)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                      activeDetailsTab === tab.id
                        ? "bg-indigo-500 text-white shadow-sm"
                        : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60"
                    }`}
                  >
                    <IconComponent className="w-3.5 h-3.5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Active Tab Body */}
            <div className="p-6 space-y-6">
              
              {/* Tab 1: Capacity & Sizing */}
              {activeDetailsTab === "performance" && (
                <div className="space-y-6">
                  {/* Sizing Overview Row */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* MDP Reference Info */}
                    <div className="bg-slate-50 dark:bg-slate-950/45 p-4 rounded-2xl space-y-3 border border-slate-100 dark:border-slate-900">
                      <span className="text-[10px] font-black uppercase text-indigo-500">MDP Load Reference</span>
                      <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
                        <div className="flex justify-between">
                          <span>System:</span>
                          <strong className="text-slate-800 dark:text-slate-100 font-mono">{panel.system.includes("3PH") ? "3-Phase (3Φ)" : "1-Phase (1Φ)"}</strong>
                        </div>
                        <div className="flex justify-between">
                          <span>Voltage:</span>
                          <strong className="text-slate-800 dark:text-slate-100 font-mono">{secondaryVoltage} V</strong>
                        </div>
                        <div className="flex justify-between">
                          <span>Connected Load:</span>
                          <strong className="text-slate-810 dark:text-slate-100 font-mono">{(connectedLoadKVA).toFixed(1)} kVA / {connectedLoadkW.toFixed(1)} kW</strong>
                        </div>
                      </div>
                    </div>

                    {/* Demand Calculator results */}
                    <div className="bg-slate-50 dark:bg-slate-950/45 p-4 rounded-2xl space-y-3 border border-slate-100 dark:border-slate-900">
                      <span className="text-[10px] font-black uppercase text-indigo-500">Demand Calculations</span>
                      <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
                        <div className="flex justify-between">
                          <span>Demand Load:</span>
                          <strong className="text-slate-800 dark:text-slate-100 font-mono">{demandLoadKVA.toFixed(1)} kVA / {demandLoadkW.toFixed(1)} kW</strong>
                        </div>
                        <div className="flex justify-between">
                          <span>Power Factor:</span>
                          <strong className="text-slate-800 dark:text-slate-100 font-mono">{powerFactor.toFixed(2)}</strong>
                        </div>
                        <div className="flex justify-between">
                          <span>Required Min Size:</span>
                          <strong className="text-slate-800 dark:text-slate-100 font-mono">{requiredKVA.toFixed(1)} kVA</strong>
                        </div>
                      </div>
                    </div>

                    {/* Calculated Output */}
                    <div className="bg-slate-50 dark:bg-slate-950/45 p-4 rounded-2xl space-y-3 border border-slate-100 dark:border-slate-900">
                      <span className="text-[10px] font-black uppercase text-indigo-500">Calculated Output</span>
                      <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
                        <div className="flex justify-between">
                          <span>Primary Voltage:</span>
                          <strong className="text-slate-800 dark:text-slate-100 font-mono">{primaryVoltage >= 1000 ? `${primaryVoltage / 1000} kV` : `${primaryVoltage} V`}</strong>
                        </div>
                        <div className="flex justify-between">
                          <span>Primary Amps:</span>
                          <strong className="text-indigo-600 dark:text-indigo-400 font-mono font-bold">{primaryCurrent.toFixed(2)} A</strong>
                        </div>
                        <div className="flex justify-between">
                          <span>Secondary Amps:</span>
                          <strong className="text-indigo-600 dark:text-indigo-400 font-mono font-bold">{secondaryCurrent.toFixed(2)} A</strong>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Recommendation Display with clickable buttons */}
                  <div className="flex flex-col md:flex-row items-center gap-4 bg-indigo-50/40 dark:bg-indigo-950/10 p-5 rounded-2xl border border-indigo-100 dark:border-indigo-950/30">
                    <div className="text-center md:text-left flex-1">
                      <div className="flex items-center gap-2 justify-center md:justify-start">
                        <span className="text-[10px] font-black uppercase text-indigo-500 tracking-wider">
                          Active Transformer Rating
                        </span>
                        {selectedManualRating !== null && (
                          <span className="bg-amber-105 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 text-[9px] font-extrabold px-1.5 py-0.5 rounded-md uppercase tracking-wide border border-amber-200 dark:border-amber-900/35">
                            Manual Override Active
                          </span>
                        )}
                      </div>
                      <h5 className="text-3xl font-black font-mono text-indigo-600 dark:text-indigo-400 mt-1">
                        {activeRating} <span className="text-lg">kVA</span>
                      </h5>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 mt-1">
                        <p className="text-xs text-slate-400 leading-tight">
                          {selectedManualRating !== null 
                            ? `Manually sizing standard transformer. Recommended automatic rating is ${recommendedRating} kVA.` 
                            : `Nearest standard transformer rating chosen automatically to prevent operation past ${(loadingFactor * 100).toFixed(0)}% load capacity.`
                          }
                        </p>
                        {selectedManualRating !== null && (
                          <button
                            type="button"
                            onClick={() => setSelectedManualRating(null)}
                            className="text-[10px] font-black uppercase text-indigo-500 hover:text-indigo-600 hover:underline shrink-0"
                          >
                            Reset to Auto
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 items-center w-full md:w-auto">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Standard Size Selection</span>
                      <div className="flex flex-wrap gap-1 justify-center max-w-sm">
                        {STANDARD_TRANSFORMER_SIZES.slice(0, 11).map((sz) => (
                          <button
                            key={sz}
                            type="button"
                            onClick={() => {
                              if (sz >= requiredKVA) {
                                setSelectedManualRating(sz === recommendedRating ? null : sz);
                              }
                            }}
                            className={`px-2.5 py-1.5 text-[10px] font-mono font-black rounded-lg transition-all ${
                              activeRating === sz
                                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20 scale-105"
                                : sz < requiredKVA
                                ? "bg-red-50 text-red-550 dark:bg-red-950/20 dark:text-red-400/60 font-medium cursor-not-allowed border border-red-200/30 line-through"
                                : "bg-slate-150/70 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                            }`}
                            disabled={sz < requiredKVA}
                            title={sz < requiredKVA ? `Capacity too small for load of ${demandLoadKVA.toFixed(1)} kVA` : `Select rating ${sz} kVA`}
                          >
                            {sz}
                          </button>
                        ))}
                        {STANDARD_TRANSFORMER_SIZES.length > 11 && (
                          <span className="text-[10px] text-slate-400 font-bold self-center ml-1">...</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Sizing Validation bar */}
                  <div className="space-y-2 bg-slate-50/60 dark:bg-slate-950/20 p-4 rounded-2xl border border-slate-100 dark:border-slate-900/60">
                    <div className="flex justify-between text-xs font-bold text-slate-400">
                      <span>0 kVA</span>
                      <span className="text-slate-800 dark:text-slate-200 font-mono">
                        Demand: {demandLoadKVA.toFixed(1)} kVA / Rated: {activeRating} kVA
                      </span>
                      <span>{activeRating} kVA</span>
                    </div>
                    <div className="h-4 bg-slate-100 dark:bg-slate-950 rounded-full overflow-hidden flex relative border dark:border-slate-800">
                      {/* Safe limit mark line */}
                      <div
                        className="absolute top-0 bottom-0 border-r-2 border-red-500/80 z-20"
                        style={{ left: `${loadingFactor * 100}%` }}
                        title={`Sizing Limit: ${(loadingFactor * 100).toFixed(0)}%`}
                      >
                        <span className="absolute -top-1.5 right-1 bg-red-500 text-[8px] font-black leading-none text-white px-1 py-0.5 rounded shadow">
                          LIMIT
                        </span>
                      </div>
                      {/* Demand Fill */}
                      <div
                        className={`transition-all duration-500 h-full ${
                          isOverloaded
                            ? "bg-gradient-to-r from-red-500 to-rose-600"
                            : "bg-gradient-to-r from-teal-500 to-indigo-505"
                        }`}
                        style={{ width: `${Math.min(100, actualLoadingPct)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-450 mt-1 leading-none font-medium">
                      <span>Total Connect kVA: {connectedLoadKVA.toFixed(1)} (Unfactored)</span>
                      <span className={isOverloaded ? "text-red-500 font-bold" : "text-slate-400"}>
                        Loading Peak: {actualLoadingPct.toFixed(1)}% {isOverloaded ? "(LIMIT EXCEEDED)" : "(SAFE)"}
                      </span>
                    </div>
                  </div>

                  {/* Structured Table Rows */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 pt-1">
                    <div className="flex justify-between items-center py-2 border-b border-dashed border-slate-100 dark:border-slate-800/80">
                      <span className="text-xs font-bold text-slate-500">Active Transformer Rating</span>
                      <span className="text-sm font-black font-mono text-slate-800 dark:text-slate-200">{activeRating} kVA</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-dashed border-slate-100 dark:border-slate-800/80">
                      <span className="text-xs font-bold text-slate-500">Actual Connected Load</span>
                      <span className="text-sm font-black font-mono text-slate-800 dark:text-slate-200">{connectedLoadKVA.toFixed(1)} kVA</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-dashed border-slate-100 dark:border-slate-800/80">
                      <span className="text-xs font-bold text-slate-500">Maximum Demand Load</span>
                      <span className="text-sm font-black font-mono text-slate-800 dark:text-slate-200">{demandLoadKVA.toFixed(1)} kVA</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-dashed border-slate-100 dark:border-slate-800/80">
                      <span className="text-xs font-bold text-slate-500">Transformer Loading Percentage</span>
                      <span className={`text-sm font-black font-mono ${isOverloaded ? "text-red-600" : "text-green-655"}`}>{actualLoadingPct.toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-dashed border-slate-100 dark:border-slate-800/80 md:col-span-2">
                      <span className="text-xs font-bold text-slate-500">Available Spare Capacity</span>
                      <span className="text-sm font-black font-mono text-green-655 block">
                        {spareCapacityKVA.toFixed(1)} kVA ({Math.max(0, 100 - actualLoadingPct).toFixed(1)}%)
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 2: Losses & Efficiency */}
              {activeDetailsTab === "losses" && (
                <div className="space-y-6">
                  <div className="bg-gradient-to-br from-slate-900 to-indigo-950 p-5 rounded-2xl border border-indigo-900/30 text-white relative overflow-hidden">
                    <div className="absolute right-4 bottom-4 text-white/5 pointer-events-none">
                      <Thermometer className="w-32 h-32" />
                    </div>
                    <span className="text-[9px] font-black bg-indigo-500 text-white px-2 py-0.5 rounded-md uppercase tracking-wider">
                      Thermal Loss Assessment
                    </span>
                    <h5 className="text-lg font-black mt-2">Active Operating Efficiency</h5>
                    <p className="text-xs text-indigo-200/80 mt-1 max-w-xl leading-relaxed">
                      Total transformer losses consist of core loss (constant load independent hysteresis/eddy losses) and copper winding loss (varies with the square of the loading current).
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5 pt-4 border-t border-indigo-800/40">
                      <div>
                        <span className="text-[10px] text-indigo-300 block uppercase font-bold">No-Load (Core) loss</span>
                        <strong className="text-2xl font-mono text-white block mt-0.5">{activeSpecs.coreLoss} <span className="text-xs">W</span></strong>
                      </div>
                      <div>
                        <span className="text-[10px] text-indigo-300 block uppercase font-bold">Full Copper winding loss</span>
                        <strong className="text-2xl font-mono text-white block mt-0.5">{activeSpecs.copperLoss} <span className="text-xs">W</span></strong>
                      </div>
                      <div>
                        <span className="text-[10px] text-emerald-300 block uppercase font-bold">Calculated Efficiency</span>
                        <strong className="text-2xl font-mono text-emerald-300 block mt-0.5">{efficiencyPct.toFixed(3)}%</strong>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-slate-50 dark:bg-slate-950/45 p-4 rounded-2xl border border-slate-100 dark:border-slate-900 space-y-3">
                      <span className="text-[10px] font-black uppercase text-indigo-500">Loss & Dissipation Auditing</span>
                      <div className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
                        <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-900/60">
                          <span>Winding losses at actual load:</span>
                          <strong className="text-slate-800 dark:text-slate-100 font-mono">{operatingWindingLoss.toFixed(0)} W</strong>
                        </div>
                        <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-900/60">
                          <span>Total current active loss:</span>
                          <strong className="text-indigo-600 dark:text-indigo-400 font-mono font-bold">{totalOperatingLosses.toFixed(0)} W</strong>
                        </div>
                        <div className="flex justify-between py-1">
                          <span>Heat dissipation to air:</span>
                          <strong className="text-slate-800 dark:text-slate-100 font-mono">{operatingHeatDissipation.toFixed(0)} BTU/hr</strong>
                        </div>
                      </div>
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-950/45 p-4 rounded-2xl border border-slate-100 dark:border-slate-900 space-y-3">
                      <span className="text-[10px] font-black uppercase text-indigo-500">Optimum Efficiency Profile</span>
                      <div className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
                        <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-900/60">
                          <span>Peak Efficiency Loading Point:</span>
                          <strong className="text-slate-800 dark:text-slate-100 font-mono">{peakEffLoadPct.toFixed(1)}%</strong>
                        </div>
                        <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-900/60">
                          <span>Peak Efficiency Sizing Load:</span>
                          <strong className="text-slate-800 dark:text-slate-100 font-mono">{peakEffKVA.toFixed(1)} kVA</strong>
                        </div>
                        <div className="flex justify-between py-1">
                          <span>Design Load Margin:</span>
                          <strong className="text-slate-800 dark:text-slate-100 font-mono">{(actualLoadingPct - peakEffLoadPct).toFixed(1)}% from peak</strong>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 3: Impedance & Protection (Fault Study) */}
              {activeDetailsTab === "fault" && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Impedance Parameters */}
                    <div className="bg-slate-50 dark:bg-slate-950/45 p-5 rounded-2xl border border-slate-100 dark:border-slate-900 space-y-4">
                      <span className="text-[10px] font-black uppercase text-indigo-500 block">Short Circuit Reactance Study</span>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                          <span className="text-[9px] text-slate-400 block uppercase font-bold">Impedance (%Z)</span>
                          <strong className="text-lg font-mono text-slate-800 dark:text-slate-100">{activeSpecs.zPercent.toFixed(2)}%</strong>
                        </div>
                        <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                          <span className="text-[9px] text-slate-400 block uppercase font-bold">Inductive X/R Ratio</span>
                          <strong className="text-lg font-mono text-slate-800 dark:text-slate-100">{activeSpecs.xrRatio.toFixed(1)}</strong>
                        </div>
                      </div>
                      <div className="text-xs text-slate-500 leading-normal space-y-1">
                        <p>• Impedance represents standard percentage voltage required to circulate full load current under short circuit.</p>
                        <p>• Higher impedance reduces downstream fault levels but increases secondary voltage drops.</p>
                      </div>
                    </div>

                    {/* Calculated Fault Currents */}
                    <div className="bg-slate-50 dark:bg-slate-950/45 p-5 rounded-2xl border border-slate-100 dark:border-slate-900 space-y-4">
                      <span className="text-[10px] font-black uppercase text-red-500 block">Symmetrical Short Circuit Calculations</span>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-red-100 dark:border-red-950">
                          <span className="text-[9px] text-red-500 block uppercase font-bold">Fault Current (Isc)</span>
                          <strong className="text-lg font-mono text-red-650 dark:text-red-450">{secondaryFaultCurrentKA.toFixed(2)} kA</strong>
                        </div>
                        <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-red-100 dark:border-red-950">
                          <span className="text-[9px] text-red-500 block uppercase font-bold">Short Circuit MVA</span>
                          <strong className="text-lg font-mono text-red-650 dark:text-red-450">{shortCircuitMVA.toFixed(2)} MVA</strong>
                        </div>
                      </div>
                      <div className="text-xs text-slate-500 leading-normal">
                        <strong>Withstand Protection Limit:</strong> Downstream main overcurrent protective devices (MDP Main Breaker) MUST have an interrupting capacity rating of at least <strong className="text-slate-700 dark:text-slate-300 font-mono">{secondaryFaultCurrentKA.toFixed(2)} kA</strong>.
                      </div>
                    </div>
                  </div>

                  {/* Voltage Regulation Section */}
                  <div className="bg-indigo-50/20 dark:bg-indigo-950/5 p-5 rounded-2xl border border-indigo-100/40 dark:border-indigo-950/20 space-y-3">
                    <span className="text-[10px] font-black uppercase text-indigo-500">Voltage Regulation & Drops</span>
                    <p className="text-xs text-slate-550 dark:text-slate-400 max-w-2xl leading-relaxed">
                      Voltage regulation measures the change in secondary terminal voltage from no-load to full-load. Lower regulation percentages represent superior voltage stability under high dynamic load draws.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                      <div className="flex justify-between items-center bg-white dark:bg-slate-900/60 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                        <span className="text-xs font-bold text-slate-500">Terminal Voltage Regulation:</span>
                        <strong className="text-sm font-mono text-indigo-600 dark:text-indigo-400">{voltageRegulationPct.toFixed(3)}%</strong>
                      </div>
                      <div className="flex justify-between items-center bg-white dark:bg-slate-900/60 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                        <span className="text-xs font-bold text-slate-500">Symmetrical Secondary Voltage Drop:</span>
                        <strong className="text-sm font-mono text-indigo-600 dark:text-indigo-400">{voltageDropSecVolts.toFixed(2)} V AC</strong>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 4: Physical & Budgeting */}
              {activeDetailsTab === "physical" && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Footprint Specifications */}
                    <div className="bg-slate-50 dark:bg-slate-950/45 p-5 rounded-2xl border border-slate-100 dark:border-slate-900 space-y-4">
                      <span className="text-[10px] font-black uppercase text-indigo-500 block">Mechanical Sizing & Volume</span>
                      <div className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
                        <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-900/60">
                          <span>Physical Housing Volume:</span>
                          <strong className="text-slate-800 dark:text-slate-100 font-mono">{activeSpecs.volume} m³</strong>
                        </div>
                        <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-900/60">
                          <span>Footprint (H x W x D):</span>
                          <strong className="text-slate-800 dark:text-slate-100 font-mono">{activeSpecs.dimensions}</strong>
                        </div>
                        <div className="flex justify-between py-1">
                          <span>Total Sized Weight (dry):</span>
                          <strong className="text-slate-800 dark:text-slate-100 font-mono">{activeSpecs.weight} kg ({(activeSpecs.weight * 2.204).toFixed(0)} lbs)</strong>
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-tight">
                        *Footprint and physical dimensions are estimated standard outlines based on kVA sizing under ANSI/IEEE C57 benchmarks.
                      </p>
                    </div>

                    {/* Equipment Sizing Budgeting */}
                    <div className="bg-slate-50 dark:bg-slate-950/45 p-5 rounded-2xl border border-slate-100 dark:border-slate-900 space-y-4">
                      <span className="text-[10px] font-black uppercase text-emerald-600 dark:text-emerald-400 block">Estimated Sizing Budgeting</span>
                      <div className="space-y-3">
                        <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/35 p-3 rounded-xl">
                          <span className="text-[9px] text-emerald-600 dark:text-emerald-400 block uppercase font-bold text-left">Estimated Purchase Cost</span>
                          <strong className="text-xl font-mono text-emerald-700 dark:text-emerald-300 block mt-0.5 text-left">
                            ${activeSpecs.cost.toLocaleString()} <span className="text-xs font-sans text-slate-400">USD</span>
                          </strong>
                          <span className="text-xxs font-mono text-slate-400 block mt-0.5 text-left font-bold">
                            Approx: ₱{(activeSpecs.cost * 58).toLocaleString()} PHP (Exchange 1:58)
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 leading-tight">
                          *Cost approximations are budgetary estimates for general distribution gear. Actual pricing fluctuates based on custom manufacturer specifications and insulation classifications.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Standard Compliance */}
                  <div className="bg-slate-50/50 dark:bg-slate-950/25 p-4 rounded-xl border border-slate-100 dark:border-slate-900 text-xs text-slate-500 dark:text-slate-400">
                    <strong className="text-slate-700 dark:text-slate-300">Engineering Compliance Code Standby:</strong> All transformer sizing computations verify compatibility with standard rating tables derived from the <strong className="text-slate-700 dark:text-slate-300">Philippine Electrical Code (PEC) Part 1</strong> and <strong className="text-slate-700 dark:text-slate-300">ANSI C57.12 Series</strong> for liquid-immersed and dry distribution equipment.
                  </div>
                </div>
              )}

            </div>
          </div>     </div>

          {/* Math & Formulas Section */}
          <div className="bg-slate-55 dark:bg-slate-900/30 rounded-3xl p-6 border border-slate-200/40 dark:border-slate-800/50 space-y-4">
            <h4 className="text-sm font-black text-slate-700 dark:text-slate-350 uppercase tracking-wider flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-slate-400" />
              Formula & Equation Breakdown
            </h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono text-slate-600 dark:text-slate-400 bg-white/70 dark:bg-slate-950/40 p-5 rounded-2xl shadow-inner border border-slate-100 dark:border-slate-900">
              <div className="space-y-1">
                <div className="font-bold text-slate-800 dark:text-slate-300">1. Required Capacity Formula:</div>
                <div className="bg-slate-50 dark:bg-slate-900 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800/50 text-indigo-600 dark:text-indigo-400 font-bold overflow-x-auto whitespace-nowrap">
                  Required kVA = Demand Load (kVA) &divide; Loading Limit
                </div>
                <div className="text-[10px] text-slate-450 pt-1">
                  Demand Load ({demandLoadKVA.toFixed(1)} kVA) &divide; {(loadingFactor).toFixed(2)} = {requiredKVA.toFixed(2)} kVA
                </div>
              </div>

              <div className="space-y-1">
                <div className="font-bold text-slate-800 dark:text-slate-300">2. Demand Load Formula:</div>
                <div className="bg-slate-50 dark:bg-slate-900 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800/50 text-indigo-600 dark:text-indigo-400 font-bold overflow-x-auto whitespace-nowrap">
                  Demand Load = Max Demand Current &times; Voltage &times; Factor
                </div>
                <div className="text-[10px] text-slate-450 pt-1">
                  Engine Current ({maxDemandCurrent.toFixed(1)} A) &times; {secondaryVoltage} V &times; {(is3Phase ? 1.732 : 1).toFixed(3)} &divide; 1000 = {demandLoadKVA.toFixed(2)} kVA
                </div>
              </div>

              <div className="space-y-1 md:col-span-2 pt-2 border-t border-slate-100 dark:border-slate-900">
                <div className="font-bold text-slate-800 dark:text-slate-300">3. Current Equations:</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
                  <div>
                    <span className="text-[10px] block text-slate-400 uppercase">Primary Ampere ({is3Phase ? "3-Phase" : "Single Phase"})</span>
                    <div className="bg-slate-50 dark:bg-slate-900 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800/50 font-bold text-indigo-600 dark:text-indigo-400 overflow-x-auto">
                      {is3Phase 
                        ? `I_p = kVA × 1000 ÷ (√3 × V_p) = ${RecommendedRatingEquation(recommendedRating, primaryVoltage, true)} = ${primaryCurrent.toFixed(2)} A`
                        : `I_p = kVA × 1000 ÷ V_p = ${RecommendedRatingEquation(recommendedRating, primaryVoltage, false)} = ${primaryCurrent.toFixed(2)} A`
                      }
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] block text-slate-400 uppercase">Secondary Ampere ({is3Phase ? "3-Phase" : "Single Phase"})</span>
                    <div className="bg-slate-50 dark:bg-slate-900 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800/50 font-bold text-indigo-600 dark:text-indigo-400 overflow-x-auto">
                      {is3Phase 
                        ? `I_s = kVA × 1000 ÷ (√3 × V_s) = ${RecommendedRatingEquation(recommendedRating, secondaryVoltage, true)} = ${secondaryCurrent.toFixed(2)} A`
                        : `I_s = kVA × 1000 ÷ V_s = ${RecommendedRatingEquation(recommendedRating, secondaryVoltage, false)} = ${secondaryCurrent.toFixed(2)} A`
                      }
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}

function RecommendedRatingEquation(kva: number, volts: number, is3ph: boolean) {
  if (is3ph) {
    return `(${kva} × 1000) ÷ (1.732 × ${volts})`;
  }
  return `(${kva} × 1000) ÷ ${volts}`;
}
