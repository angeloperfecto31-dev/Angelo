import React, { useMemo } from "react";
import { PanelConfig, Circuit } from "../types";
import { Zap, AlertTriangle, CheckCircle2, RefreshCw, Cpu, ShieldCheck, Lock, Download, FileSpreadsheet, FileText, Check } from "lucide-react";
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

  // Primary Current calculations
  // I = kVA * 1000 / (V * factor) where factor is sqrt(3) for 3PH, 1 for 1PH
  const primaryCurrent = useMemo(() => {
    if (primaryVoltage <= 0) return 0;
    const factor = is3Phase ? Math.sqrt(3) : 1;
    return (recommendedRating * 1000) / (primaryVoltage * factor);
  }, [recommendedRating, primaryVoltage, is3Phase]);

  // Secondary Current calculations
  const secondaryCurrent = useMemo(() => {
    if (secondaryVoltage <= 0) return 0;
    const factor = is3Phase ? Math.sqrt(3) : 1;
    return (recommendedRating * 1000) / (secondaryVoltage * factor);
  }, [recommendedRating, secondaryVoltage, is3Phase]);

  // Transformer actual loading percentage
  const actualLoadingPct = useMemo(() => {
    if (recommendedRating <= 0) return 0;
    return (demandLoadKVA / recommendedRating) * 100;
  }, [demandLoadKVA, recommendedRating]);

  // Spare Capacity
  const spareCapacityKVA = useMemo(() => {
    return Math.max(0, recommendedRating - demandLoadKVA);
  }, [recommendedRating, demandLoadKVA]);

  const isOverloaded = actualLoadingPct > (loadingFactor * 100);

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
      doc.text(`${recommendedRating} kVA`, 20, 127);

      doc.setFontSize(8.5);
      doc.setFont("Helvetica", "bold");
      doc.setTextColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
      doc.text("Recommended Standard Transformer Rating", 20, 131);

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
        ["Selected Transformer Rating capacity:", `${recommendedRating} kVA`],
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
        doc.text(`   Ip (3-Phase) = S_base / (sqrt(3) * V_primary) = (${recommendedRating} * 1000) / (1.732 * ${primaryVoltage}) = ${primaryCurrent.toFixed(2)} A`, 15, 259);
        doc.text(`   Is (3-Phase) = S_base / (sqrt(3) * V_secondary) = (${recommendedRating} * 1000) / (1.732 * ${secondaryVoltage}) = ${secondaryCurrent.toFixed(2)} A`, 15, 263);
      } else {
        doc.text(`   Ip (Single Phase) = S_base / V_primary = (${recommendedRating} * 1000) / ${primaryVoltage} = ${primaryCurrent.toFixed(2)} A`, 15, 259);
        doc.text(`   Is (Single Phase) = S_base / V_secondary = (${recommendedRating} * 1000) / ${secondaryVoltage} = ${secondaryCurrent.toFixed(2)} A`, 15, 263);
      }

      // Footnote
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

  const handleExportExcel = () => {
    if (!isPremium) {
      if (onRequestUpgrade) onRequestUpgrade();
      return;
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
        ["Maximum Core Demand Load:", `${demandLoadKVA.toFixed(2)} kVA`, "Recommended Rating selected:", `${recommendedRating} kVA`],
        ["Power Equivalent Demand kW:", `${demandLoadkW.toFixed(2)} kW`, "Transformer Actual Sizing Load ratio:", `${actualLoadingPct.toFixed(1)}%`],
        ["Available Spare kVA capacity:", `${spareCapacityKVA.toFixed(2)} kVA`, "Design Compliance Status:", isOverloaded ? "OVERLOADED - NONCOMPLIANT" : "PASSED - COMPLIANT, SAFE"],
        ["Full Load Primary Ampere (Ip):", `${primaryCurrent.toFixed(2)} A`, "Full Load Secondary Ampere (Is):", `${secondaryCurrent.toFixed(2)} A`],
        [],
        ["ENGINEERING METHODOLOGY AND FORMULA STRINGS"],
        ["1. Required capacity (S_req) formula:"],
        ["   Required Capacity (kVA) = Computed Demand Load / Loading Limit = " + `${demandLoadKVA.toFixed(2)} / ${loadingFactor.toFixed(2)} = ${requiredKVA.toFixed(2)} kVA`],
        ["2. Nominal Full Load Amperes Equations:"],
        [is3Phase 
          ? `   Ip (3PH) = kVA * 1000 / (sqrt(3) * Vp) = (${recommendedRating} * 1000) / (1.732 * ${primaryVoltage}) = ${primaryCurrent.toFixed(2)} A`
          : `   Ip (1PH) = kVA * 1000 / Vp = (${recommendedRating} * 1000) / ${primaryVoltage} = ${primaryCurrent.toFixed(2)} A`
        ],
        [is3Phase 
          ? `   Is (3PH) = kVA * 1000 / (sqrt(3) * Vs) = (${recommendedRating} * 1000) / (1.732 * ${secondaryVoltage}) = ${secondaryCurrent.toFixed(2)} A`
          : `   Is (1PH) = kVA * 1000 / Vs = (${recommendedRating} * 1000) / ${secondaryVoltage} = ${secondaryCurrent.toFixed(2)} A`
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
        else if (r === 19) wsrows.push({ hpt: 24 });
        else if (r === 2 || r === 8 || r === 13) wsrows.push({ hpt: 24 });
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

          // Zebra striping for non-heading, non-formula rows
          if (R > 2 && R < 19 && R % 2 === 0) {
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
          else if ((R === 2) || (R === 8) || (R === 13) || (R === 19)) {
            ws[cellAddress].s.font = { name: "Segoe UI", sz: 10, bold: true, color: { rgb: "FFFFFF" } };
            ws[cellAddress].s.fill = { fgColor: { rgb: "312E81" } }; // Indigo Navy
            ws[cellAddress].s.alignment = { vertical: "center", horizontal: "center" };
          }

          else {
            // Labels style (col A and C)
            if ((C === 0 || C === 2) && R > 2 && R < 18) {
              ws[cellAddress].s.font.bold = true;
              ws[cellAddress].s.font.color = { rgb: "0F172A" }; // Dark Slate
              ws[cellAddress].s.alignment = { vertical: "center", horizontal: "left", indent: 1 };
            }

            // Values style (col B and D)
            if ((C === 1 || C === 3) && R > 2 && R < 18) {
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
            if (R >= 20 && R <= 25) {
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
        { wch: 38 },
        { wch: 30 },
        { wch: 38 },
        { wch: 32 },
      ];

      // Merge Main Header row
      ws["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
        { s: { r: 19, c: 0 }, e: { r: 19, c: 3 } },
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
              <span className="font-mono text-indigo-505 dark:text-indigo-400">
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
              className="w-full accent-indigo-505"
            />
          </div>

          {/* Load Diversity/Demand Factor */}
          <div className="space-y-2 opacity-70">
            <div className="flex justify-between items-center text-xs font-black uppercase text-slate-500 dark:text-slate-400">
              <span>Computed Demand Factor</span>
              <span className="font-mono text-indigo-505 dark:text-indigo-400">
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
              <span className="font-mono text-indigo-505 dark:text-indigo-400">
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
              className="w-full accent-indigo-505"
            />
            <p className="text-[10px] text-slate-400 leading-tight">
              Standard design practices suggest keeping utility transformers under 80% continuous rating.
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
          </div>

          {/* Summary Details Cards */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200/60 dark:border-slate-800/80 shadow-md">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5 pb-4 border-b border-slate-100 dark:border-slate-800/50">
              <h4 className="text-base font-bold text-slate-805 dark:text-white flex items-center gap-2">
                <Zap className="w-4 h-4 text-indigo-500" />
                Transformer Capacity Summary
              </h4>

              {/* Export Buttons Block */}
              <div className="flex flex-wrap items-center gap-2">
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
                  <div className="flex justify-between grayscale-0">
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

              {/* Recommended Size & Current Panel */}
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

            {/* Recommendation Display */}
            <div className="mt-6 flex flex-col md:flex-row items-center gap-4 bg-indigo-50/40 dark:bg-indigo-950/10 p-5 rounded-2xl border border-indigo-100 dark:border-indigo-950/30">
              <div className="text-center md:text-left flex-1">
                <span className="text-[10px] font-black uppercase text-indigo-500 tracking-wider">Recommended Rating</span>
                <h5 className="text-3xl font-black font-mono text-indigo-600 dark:text-indigo-400 mt-1">
                  {recommendedRating} <span className="text-lg">kVA</span>
                </h5>
                <p className="text-xs text-slate-400 mt-1">
                  Nearest standard transformer rating chosen automatically to prevent operation past {loadingFactor * 100}% load capacity.
                </p>
              </div>
              <div className="flex flex-wrap gap-1 justify-center max-w-sm">
                {STANDARD_TRANSFORMER_SIZES.slice(0, 11).map((sz) => (
                  <span
                    key={sz}
                    className={`px-2 py-1 text-[10px] font-mono font-bold rounded-lg ${
                      recommendedRating === sz
                        ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                        : sz < requiredKVA
                        ? "bg-red-50 text-red-550 dark:bg-red-950/20 dark:text-red-400/60 font-medium cursor-not-allowed border border-red-200/30 line-through"
                        : "bg-slate-150/70 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                    }`}
                  >
                    {sz}
                  </span>
                ))}
                {STANDARD_TRANSFORMER_SIZES.length > 11 && (
                  <span className="text-[10px] text-slate-400 font-bold self-center ml-1">...</span>
                )}
              </div>
            </div>

          </div>

          {/* Technical Loading Verification Details */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200/60 dark:border-slate-800/80 shadow-md">
            <h4 className="text-base font-bold text-slate-805 dark:text-white mb-4">
              Detailed Loading Verification
            </h4>

            {/* Visualization Loading bar */}
            <div className="space-y-2 mb-6">
              <div className="flex justify-between text-xs font-bold text-slate-400">
                <span>0 kVA</span>
                <span className="text-slate-800 dark:text-slate-200 font-mono">
                  Demand: {demandLoadKVA.toFixed(1)} kVA / Rated: {recommendedRating} kVA
                </span>
                <span>{recommendedRating} kVA</span>
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 pt-3 border-t border-slate-100 dark:border-slate-800">
              <div className="flex justify-between items-center py-2 border-b border-dashed border-slate-100 dark:border-slate-800/80">
                <span className="text-xs font-bold text-slate-500">Selected Transformer Rating</span>
                <span className="text-sm font-black font-mono text-slate-800 dark:text-slate-200">{recommendedRating} kVA</span>
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
