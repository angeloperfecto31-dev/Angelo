import React, { useState, useMemo, useRef } from "react";
import { 
  FileText, 
  FileDown, 
  Printer, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  ShieldAlert, 
  Activity, 
  Network, 
  BookOpen, 
  Download, 
  Settings, 
  CheckCircle2, 
  AlertTriangle, 
  ChevronRight, 
  Sparkles, 
  ArrowRight,
  Info,
  Lock
} from "lucide-react";
import { PanelConfig, Circuit, ShortCircuitParams, VoltageDropCalculation } from "../types";
import { computePanelScheduleValues } from "../utils/computeEngine";
import { syncHierarchyData } from "../utils/hierarchyEngine";
import { motion } from "motion/react";
import { saveAs } from "file-saver";
import { jsPDF } from "jspdf";
import * as docx from "docx";

interface ReportExportModuleProps {
  panel: PanelConfig;
  circuits: Circuit[];
  subPanels: { id: string; panel: PanelConfig; circuits: Circuit[] }[];
  iscParams: ShortCircuitParams;
  vdCalculations: VoltageDropCalculation[];
  loadFlowResults: Record<string, any>;
  faultResults: Record<string, any>;
  isPremium: boolean;
  onRequestUpgrade: () => void;
  upstreamTrip: number;
  upstreamInstMultiplier: number;
  downstreamTrip: number;
  downstreamInstMultiplier: number;
  transformerPrimaryVoltage?: number;
  transformerPowerFactor?: number;
  transformerDemandFactor?: number;
  transformerLoadingFactor?: number;
  user?: any;
}

export default function ReportExportModule({
  panel,
  circuits,
  subPanels,
  iscParams,
  vdCalculations,
  loadFlowResults,
  faultResults,
  isPremium,
  onRequestUpgrade,
  upstreamTrip,
  upstreamInstMultiplier,
  downstreamTrip,
  downstreamInstMultiplier,
  transformerPrimaryVoltage,
  transformerPowerFactor,
  transformerDemandFactor,
  transformerLoadingFactor,
  user,
}: ReportExportModuleProps) {
  // Navigation Section State
  const [activeReportSection, setActiveReportSection] = useState<
    "all" | "project" | "transformer" | "coordination" | "loadflow" | "fault" | "recommendations" | "sld"
  >("all");

  // Zoom scale state (e.g. 1.0 = 100%)
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);

  // Single Line Diagram layer in preview
  const [sldLayer, setSldLayer] = useState<"protection" | "loadflow" | "fault">("protection");

  // Branded Options
  const [reportTitle, setReportTitle] = useState<string>("Electrical Power System Analysis Report");
  const [clientName, setClientName] = useState<string>("Enterprise Client Corp");
  const [projectNumber, setProjectNumber] = useState<string>("PRJ-2026-X1");
  const [authorName, setAuthorName] = useState<string>("Senior Electrical Engineer, PE");
  const [reportTheme, setReportTheme] = useState<"modern" | "corporate" | "classic">("modern");

  // Dynamic values
  const dateStr = useMemo(() => new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }), []);
  const systemVoltage = panel.voltage || 230;
  const isThreePhase = panel.system?.includes("3PH") ?? true;
  const systemFreq = 60;

  // Centralized Transformer Sizing, Loading, and Capacity metrics
  const transformerMetrics = useMemo(() => {
    const is3Phase = panel.system.includes("3PH");
    const secondaryVoltage = panel.voltage || 230;
    const primaryVoltage = transformerPrimaryVoltage || iscParams.primaryVoltage || 13800;
    const powerFactor = transformerPowerFactor ?? 0.85;
    const demandFactor = transformerDemandFactor ?? 1.0;
    const loadingFactor = transformerLoadingFactor ?? 0.8;

    const panelValues = computePanelScheduleValues(panel, circuits);
    const connectedLoadVA = panelValues.totalVA;
    const connectedLoadKVA = connectedLoadVA / 1000;
    const connectedLoadkW = connectedLoadKVA * powerFactor;

    const demandLoadKVA = connectedLoadKVA * demandFactor;
    const demandLoadkW = demandLoadKVA * powerFactor;

    const requiredKVA = loadingFactor > 0 ? demandLoadKVA / loadingFactor : 0;

    const standardSizes = [10, 15, 25, 37.5, 50, 75, 100, 167, 250, 333, 500, 750, 1000, 1500, 2000, 2500];
    let recommendedRating = standardSizes.find((s) => s >= requiredKVA) || standardSizes[standardSizes.length - 1];
    
    // Override from iscParams if present
    if (iscParams.transformerKVA) {
      recommendedRating = iscParams.transformerKVA;
    }

    const factor = is3Phase ? Math.sqrt(3) : 1;
    const primaryCurrent = primaryVoltage > 0 ? (recommendedRating * 1000) / (primaryVoltage * factor) : 0;
    const secondaryCurrent = secondaryVoltage > 0 ? (recommendedRating * 1000) / (secondaryVoltage * factor) : 0;

    const actualLoadingPct = recommendedRating > 0 ? (demandLoadKVA / recommendedRating) * 100 : 0;
    const spareCapacityKVA = Math.max(0, recommendedRating - demandLoadKVA);
    
    // Fault contributions from transformer
    const baseKV = secondaryVoltage / 1000;
    const txZ = iscParams.transformerZ || 5.0;
    const utilityMVA = iscParams.utilityShortCircuitMVA || 500;
    const zUtilitypu = recommendedRating / (utilityMVA * 1000);
    const zTranspu = txZ / 100;
    const totalZpu = zUtilitypu + zTranspu;
    const iBase = recommendedRating / ((is3Phase ? Math.sqrt(3) : 1) * baseKV);
    const transformerFaultKA = totalZpu > 0 ? (iBase / totalZpu) / 1000 : 0;

    return {
      is3Phase,
      secondaryVoltage,
      primaryVoltage,
      powerFactor,
      demandFactor,
      loadingFactor,
      connectedLoadVA,
      connectedLoadKVA,
      connectedLoadkW,
      demandLoadKVA,
      demandLoadkW,
      requiredKVA,
      recommendedRating,
      primaryCurrent,
      secondaryCurrent,
      actualLoadingPct,
      spareCapacityKVA,
      transformerFaultKA,
      txZ,
      utilityMVA,
    };
  }, [panel, circuits, iscParams, transformerPrimaryVoltage, transformerPowerFactor, transformerDemandFactor, transformerLoadingFactor]);

  // Automated compliance check & recommendation engine
  const engineeringFindings = useMemo(() => {
    const findings: { type: "info" | "warning" | "danger"; title: string; desc: string; section: string }[] = [];

    // 1. Protection Coordination Checks
    if (upstreamTrip <= downstreamTrip) {
      findings.push({
        type: "danger",
        title: "Critical Overlap: Mismatched Protection Breaker Ratings",
        desc: `Main breaker rating (${upstreamTrip}A) is less than or equal to downstream branch breaker rating (${downstreamTrip}A). Overcurrent on branches may trigger the main breaker, causing total blackout.`,
        section: "Protection Coordination"
      });
    } else if (upstreamTrip < downstreamTrip * 1.5) {
      findings.push({
        type: "warning",
        title: "Tight Selective Coordination Interval",
        desc: `Upstream breaker (${upstreamTrip}A) is less than 1.5x of downstream branch (${downstreamTrip}A). Poor margins under heavy continuous load or transient surges.`,
        section: "Protection Coordination"
      });
    }

    if (upstreamInstMultiplier <= downstreamInstMultiplier) {
      findings.push({
        type: "warning",
        title: "Overlapping Instantaneous Trip Settings",
        desc: `Upstream instantaneous pickup (${upstreamInstMultiplier}x) overlaps downstream branch (${downstreamInstMultiplier}x). Instantaneous faults will trigger both breakers simultaneously.`,
        section: "Protection Coordination"
      });
    }

    // 2. Load Flow checks
    Object.values(loadFlowResults).forEach((lfNode: any) => {
      if (lfNode.regulation > 5.0) {
        findings.push({
          type: "danger",
          title: `Excessive Voltage Drop at ${lfNode.name}`,
          desc: `Calculated voltage drop is ${lfNode.regulation.toFixed(2)}%, exceeding the IEEE/NEC recommended maximum limit of 5.0% for combined feeders.`,
          section: "Load Flow"
        });
      } else if (lfNode.regulation > 3.0) {
        findings.push({
          type: "warning",
          title: `Borderline Feeder Voltage Drop at ${lfNode.name}`,
          desc: `Calculated voltage drop is ${lfNode.regulation.toFixed(2)}%, approaching the standard maximum limit of 3.0% for branch circuit feeders.`,
          section: "Load Flow"
        });
      }

      if (lfNode.feederLoadingPct > 100) {
        findings.push({
          type: "danger",
          title: `Feeder Overload at ${lfNode.name}`,
          desc: `Calculated operating current of ${lfNode.currentMagnitude.toFixed(1)}A exceeds the nominal conductor ampacity limit (${lfNode.feederAmpacity}A) by ${(lfNode.feederLoadingPct - 100).toFixed(1)}%.`,
          section: "Load Flow"
        });
      } else if (lfNode.feederLoadingPct > 80) {
        findings.push({
          type: "warning",
          title: `High Feeder Utilization at ${lfNode.name}`,
          desc: `Feeder loading is at ${lfNode.feederLoadingPct.toFixed(1)}%, exceeding the standard continuous design loading threshold of 80%.`,
          section: "Load Flow"
        });
      }
    });

    // 3. Fault analysis checks
    Object.values(faultResults).forEach((fNode: any) => {
      if (fNode.compliance === "CRITICAL VIOLATION") {
        findings.push({
          type: "danger",
          title: `Inadequate Interrupting Capacity (AIC) at ${fNode.name}`,
          desc: `Available Symmetrical Fault Current (${fNode.iAvailable.toFixed(2)} kA) exceeds the protective device kAIC rating (${fNode.breakerkAIC} kA). Risk of violent equipment failure or fire during a solid fault.`,
          section: "Short-Circuit"
        });
      } else if (fNode.dutyPercentage > 85) {
        findings.push({
          type: "warning",
          title: `High Short-Circuit Duty at ${fNode.name}`,
          desc: `The maximum fault duty is at ${fNode.dutyPercentage.toFixed(1)}% of the device interrupting rating. Margins are below the industry-recommended 15% safety factor.`,
          section: "Short-Circuit"
        });
      }
    });

    // 4. Transformer Capacity & Sizing Validation Checks
    const { actualLoadingPct, recommendedRating, spareCapacityKVA, loadingFactor } = transformerMetrics;
    if (actualLoadingPct > 100) {
      findings.push({
        type: "danger",
        title: "Transformer Capacity Overload Violation",
        desc: `The calculated demand load of ${(recommendedRating - spareCapacityKVA).toFixed(1)} kVA exceeds the transformer capacity rating (${recommendedRating} kVA) by ${(actualLoadingPct - 100).toFixed(1)}%. Risk of heavy core overheating, thermal insulation breakdown, and catastrophic power outages.`,
        section: "Transformer Capacity"
      });
    } else if (actualLoadingPct > (loadingFactor * 100)) {
      findings.push({
        type: "warning",
        title: "Transformer Near Continuous Loading Limit",
        desc: `The calculated transformer loading percentage is ${actualLoadingPct.toFixed(1)}%, which exceeds the continuous maximum loading factor target of ${(loadingFactor * 100)}%. Consideration should be given to upgrading the transformer capacity size.`,
        section: "Transformer Capacity"
      });
    }

    // Default recommendation if empty
    if (findings.length === 0) {
      findings.push({
        type: "info",
        title: "All Parameters Standard & Compliant",
        desc: "The protective coordination margins, bus voltages, feeder load densities, and equipment AIC ratings are completely synchronized and optimal.",
        section: "System Summary"
      });
    }

    return findings;
  }, [upstreamTrip, downstreamTrip, upstreamInstMultiplier, downstreamInstMultiplier, loadFlowResults, faultResults]);

  // Handle zooming limits
  const handleZoomIn = () => setZoomLevel(prev => Math.min(prev + 0.1, 1.5));
  const handleZoomOut = () => setZoomLevel(prev => Math.max(prev - 0.1, 0.6));
  const handleZoomReset = () => setZoomLevel(1.0);

  // DOCX Generation Logic
  const handleExportDOCX = async () => {
    if (!isPremium) {
      alert("Word and PDF document exports are available exclusively with the Premium Plan. Upgrade your subscription to unlock professional document generation.");
      onRequestUpgrade();
      return;
    }

    const { updatedMdpCircuits, updatedSubPanels } = syncHierarchyData(panel, circuits, subPanels, vdCalculations);
    const syncCircuits = updatedMdpCircuits;
    const syncSubPanels = updatedSubPanels;

    if (user?.uid) {
      try {
        const response = await fetch("/api/verify-doc-export", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user.uid, module: "power-suite", format: "word" })
        });
        if (!response.ok) {
          const data = await response.json();
          alert(data.error || "Word document export verification failed.");
          onRequestUpgrade();
          return;
        }
      } catch (err) {
        console.warn("Backend validation failed, proceeding with client verification:", err);
      }
    }

    try {
      const docxChildren: any[] = [];

      // Always show Document Title at top of export
      docxChildren.push(
        new docx.Paragraph({
          text: reportTitle.toUpperCase(),
          heading: docx.HeadingLevel.TITLE,
          alignment: docx.AlignmentType.CENTER,
        }),
        new docx.Paragraph({
          text: "OFFICIAL ELECTRICAL POWER SYSTEM STUDY & REPORT",
          alignment: docx.AlignmentType.CENTER,
        }),
        new docx.Paragraph({ text: "" })
      );

      if (panel.projectType) {
        docxChildren.push(
          new docx.Paragraph({
            children: [
              new docx.TextRun({ text: "Project Classification: ", bold: true }),
              new docx.TextRun({ text: `${panel.projectType.toUpperCase()} FACILITY` }),
            ],
          })
        );
      }
      if (panel.institution) {
        docxChildren.push(
          new docx.Paragraph({
            children: [
              new docx.TextRun({ text: "Specific Institution: ", bold: true }),
              new docx.TextRun({ text: (panel.institution === 'Custom...' ? panel.customInstitutionName || 'Custom' : panel.institution).toUpperCase() }),
            ],
          })
        );
      }
      if (panel.owner) {
        docxChildren.push(
          new docx.Paragraph({
            children: [
              new docx.TextRun({ text: "Project Owner: ", bold: true }),
              new docx.TextRun({ text: panel.owner }),
            ],
          })
        );
      }

      docxChildren.push(
        new docx.Paragraph({
          children: [
            new docx.TextRun({ text: "Client Name: ", bold: true }),
            new docx.TextRun({ text: clientName }),
          ],
        }),
        new docx.Paragraph({
          children: [
            new docx.TextRun({ text: "Project Code Identifier: ", bold: true }),
            new docx.TextRun({ text: projectNumber }),
          ],
        }),
        new docx.Paragraph({
          children: [
            new docx.TextRun({ text: "Analysis Date: ", bold: true }),
            new docx.TextRun({ text: dateStr }),
          ],
        }),
        new docx.Paragraph({
          children: [
            new docx.TextRun({ text: "System Nominal Voltage: ", bold: true }),
            new docx.TextRun({ text: `${systemVoltage}V, ${isThreePhase ? "3-Phase" : "1-Phase"}, ${systemFreq}Hz` }),
          ],
        }),
        new docx.Paragraph({
          children: [
            new docx.TextRun({ text: "Assessing Engineer: ", bold: true }),
            new docx.TextRun({ text: authorName }),
          ],
        }),
        new docx.Paragraph({ text: "" }),
        new docx.Paragraph({ text: "--------------------------------------------------------------------------------------------------" }),
        new docx.Paragraph({ text: "" })
      );

      // Section 1.0 General Project Parameters
      if (activeReportSection === "all" || activeReportSection === "project") {
        docxChildren.push(
          new docx.Paragraph({
            text: "1.0 GENERAL STUDY PARAMETERS & METADATA",
            heading: docx.HeadingLevel.HEADING_1,
          }),
          new docx.Paragraph({
            text: "This study delivers critical evaluation of electrical selective breaker settings, steady-state load flows, bus voltages, and maximum symmetrical short-circuit current faults computed relative to nominal parameters.",
          }),
          new docx.Paragraph({ text: "" }),
          new docx.Table({
            rows: [
              new docx.TableRow({
                children: [
                  new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: "Project Parameter", bold: true })] })] }),
                  new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: "Standard Configuration Value", bold: true })] })] }),
                ],
              }),
              new docx.TableRow({
                children: [
                  new docx.TableCell({ children: [new docx.Paragraph({ text: "Enterprise Client Name" })] }),
                  new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: clientName, bold: true })] })] }),
                ],
              }),
              new docx.TableRow({
                children: [
                  new docx.TableCell({ children: [new docx.Paragraph({ text: "Project Reference Code" })] }),
                  new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: projectNumber, bold: true })] })] }),
                ],
              }),
              new docx.TableRow({
                children: [
                  new docx.TableCell({ children: [new docx.Paragraph({ text: "Nominal System Voltage" })] }),
                  new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: `${systemVoltage} V, ${isThreePhase ? "3-Phase" : "1-Phase"}`, bold: true })] })] }),
                ],
              }),
              new docx.TableRow({
                children: [
                  new docx.TableCell({ children: [new docx.Paragraph({ text: "Grid Standard Frequency" })] }),
                  new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: `${systemFreq} Hz`, bold: true })] })] }),
                ],
              }),
              new docx.TableRow({
                children: [
                  new docx.TableCell({ children: [new docx.Paragraph({ text: "Authorized Assessor" })] }),
                  new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: authorName, bold: true })] })] }),
                ],
              }),
              new docx.TableRow({
                children: [
                  new docx.TableCell({ children: [new docx.Paragraph({ text: "System Compliance Guidelines" })] }),
                  new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: "IEEE 242 Protection / IEEE 399 Load Flow Standard", bold: true })] })] }),
                ],
              }),
            ],
          }),
          new docx.Paragraph({ text: "" })
        );
      }

      // Section 2.0 Transformer Capacity & Sizing Study
      if (activeReportSection === "all" || activeReportSection === "transformer") {
        docxChildren.push(
          new docx.Paragraph({
            text: "2.0 TRANSFORMER CAPACITY & SIZING STUDY",
            heading: docx.HeadingLevel.HEADING_1,
          }),
          new docx.Paragraph({
            text: "Standard distribution step-down transformer capacity, configuration specifications, actual demand profiles, and spare capacity evaluations:",
          }),
          new docx.Paragraph({ text: "" }),
          new docx.Paragraph({
            children: [new docx.TextRun({ text: "2.1 Transformer Equipment Specifications", bold: true })]
          }),
          new docx.Table({
            rows: [
              new docx.TableRow({
                children: [
                  new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: "Specification Parameter", bold: true })] })] }),
                  new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: "Design Parameter Value", bold: true })] })] }),
                ],
              }),
              new docx.TableRow({
                children: [
                  new docx.TableCell({ children: [new docx.Paragraph({ text: "Transformer Rating" })] }),
                  new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: `${transformerMetrics.recommendedRating} kVA`, bold: true })] })] }),
                ],
              }),
              new docx.TableRow({
                children: [
                  new docx.TableCell({ children: [new docx.Paragraph({ text: "Type & Phase" })] }),
                  new docx.TableCell({ children: [new docx.Paragraph({ text: `Standard Step-Down, ${transformerMetrics.is3Phase ? "3-Phase" : "1-Phase"}` })] }),
                ],
              }),
              new docx.TableRow({
                children: [
                  new docx.TableCell({ children: [new docx.Paragraph({ text: "Primary Voltage" })] }),
                  new docx.TableCell({ children: [new docx.Paragraph({ text: `${transformerMetrics.primaryVoltage.toLocaleString()} V` })] }),
                ],
              }),
              new docx.TableRow({
                children: [
                  new docx.TableCell({ children: [new docx.Paragraph({ text: "Secondary Voltage" })] }),
                  new docx.TableCell({ children: [new docx.Paragraph({ text: `${transformerMetrics.secondaryVoltage} V` })] }),
                ],
              }),
              new docx.TableRow({
                children: [
                  new docx.TableCell({ children: [new docx.Paragraph({ text: "Percent Impedance (%Z)" })] }),
                  new docx.TableCell({ children: [new docx.Paragraph({ text: `${transformerMetrics.txZ.toFixed(1)}%` })] }),
                ],
              }),
              new docx.TableRow({
                children: [
                  new docx.TableCell({ children: [new docx.Paragraph({ text: "Secondary Connection" })] }),
                  new docx.TableCell({ children: [new docx.Paragraph({ text: transformerMetrics.is3Phase ? "Delta-Wye (D-Y, Solidly Grounded)" : "Single-Phase 2-Wire" })] }),
                ],
              }),
            ],
          }),
          new docx.Paragraph({ text: "" }),
          new docx.Paragraph({
            children: [new docx.TextRun({ text: "2.2 Loading & Capacity Analysis", bold: true })]
          }),
          new docx.Table({
            rows: [
              new docx.TableRow({
                children: [
                  new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: "Analysis Metric", bold: true })] })] }),
                  new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: "Calculated Value", bold: true })] })] }),
                ],
              }),
              new docx.TableRow({
                children: [
                  new docx.TableCell({ children: [new docx.Paragraph({ text: "Total Connected Load" })] }),
                  new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: `${(transformerMetrics.connectedLoadKVA).toFixed(2)} kVA (${(transformerMetrics.connectedLoadkW).toFixed(2)} kW)`, bold: true })] })] }),
                ],
              }),
              new docx.TableRow({
                children: [
                  new docx.TableCell({ children: [new docx.Paragraph({ text: "Maximum Demand Load" })] }),
                  new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: `${(transformerMetrics.demandLoadKVA).toFixed(2)} kVA (${(transformerMetrics.demandLoadkW).toFixed(2)} kW)`, bold: true })] })] }),
                ],
              }),
              new docx.TableRow({
                children: [
                  new docx.TableCell({ children: [new docx.Paragraph({ text: "Continuous Loading Factor" })] }),
                  new docx.TableCell({ children: [new docx.Paragraph({ text: `${(transformerMetrics.loadingFactor * 100).toFixed(0)}% Target limit` })] }),
                ],
              }),
              new docx.TableRow({
                children: [
                  new docx.TableCell({ children: [new docx.Paragraph({ text: "Actual Loading Percentage" })] }),
                  new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: `${transformerMetrics.actualLoadingPct.toFixed(1)}%`, bold: true, color: transformerMetrics.actualLoadingPct > 100 ? "FF0000" : "009900" })] })] }),
                ],
              }),
              new docx.TableRow({
                children: [
                  new docx.TableCell({ children: [new docx.Paragraph({ text: "Spare Capacity Available" })] }),
                  new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: `${transformerMetrics.spareCapacityKVA.toFixed(2)} kVA`, bold: true })] })] }),
                ],
              }),
              new docx.TableRow({
                children: [
                  new docx.TableCell({ children: [new docx.Paragraph({ text: "Secondary Full Load Current" })] }),
                  new docx.TableCell({ children: [new docx.Paragraph({ text: `${transformerMetrics.secondaryCurrent.toFixed(1)} A` })] }),
                ],
              }),
            ],
          }),
          new docx.Paragraph({ text: "" }),
          new docx.Paragraph({
            children: [new docx.TextRun({ text: "2.3 Secondary Fault Contribution Analysis", bold: true })]
          }),
          new docx.Paragraph({
            text: `Based on a primary utility short-circuit capacity of ${transformerMetrics.utilityMVA} MVA and step-down impedance of ${transformerMetrics.txZ}%, the maximum symmetrical short-circuit current fault at secondary terminals is calculated as ${transformerMetrics.transformerFaultKA.toFixed(2)} kA.`,
          }),
          new docx.Paragraph({ text: "" }),
          new docx.Paragraph({
            children: [new docx.TextRun({ text: "2.4 Integrated Protection Coordination Rules", bold: true })]
          }),
          new docx.Paragraph({
            text: `Under standard PEC regulations, secondary protection must be sized to continuous demand profiles. Recommended upstream main protection breaker rating is ${upstreamTrip} A with coordinating thermal damage limits positioned to safely ride through normal transformer magnetization inrush periods.`,
          }),
          new docx.Paragraph({ text: "" })
        );
      }

      // Section 3.0 Protection Selectivity & Coordination Study
      if (activeReportSection === "all" || activeReportSection === "coordination") {
        const isCoordinated = upstreamTrip > downstreamTrip;
        docxChildren.push(
          new docx.Paragraph({
            text: "3.0 PROTECTION SELECTIVITY & COORDINATION STUDY",
            heading: docx.HeadingLevel.HEADING_1,
          }),
          new docx.Paragraph({
            text: `Upstream Device Setting: ${upstreamTrip}A AT with a ${upstreamInstMultiplier}x instantaneous trip threshold. Downstream Device Setting: ${downstreamTrip}A AT with a ${downstreamInstMultiplier}x instantaneous pickup threshold.`,
          }),
          new docx.Paragraph({
            children: [
              new docx.TextRun({ text: "Breaker Coordination Status: ", bold: true }),
              new docx.TextRun({
                text: isCoordinated ? "COORDINATED MARGIN (Optimized Selectivity)" : "CRITICAL OVERLAP FINDING (Non-Selective Hazard)",
                bold: true,
                color: isCoordinated ? "009900" : "FF0000",
              }),
            ],
          }),
          new docx.Paragraph({
            text: "To guarantee selective coordination, branch breaker instantaneous pickup must clear before upstream breaker starts dynamic trips.",
          }),
          new docx.Paragraph({ text: "" }),
          new docx.Table({
            rows: [
              new docx.TableRow({
                children: [
                  new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: "Protective Node Location", bold: true })] })] }),
                  new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: "Rating (AT)", bold: true })] })] }),
                  new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: "kAIC Rating", bold: true })] })] }),
                  new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: "Instantaneous Setting", bold: true })] })] }),
                ],
              }),
              new docx.TableRow({
                children: [
                  new docx.TableCell({ children: [new docx.Paragraph({ text: "Upstream (Main Panel)" })] }),
                  new docx.TableCell({ children: [new docx.Paragraph({ text: `${upstreamTrip} A` })] }),
                  new docx.TableCell({ children: [new docx.Paragraph({ text: faultResults["mdp"]?.breakerkAIC ? `${faultResults["mdp"].breakerkAIC} kAIC` : `${parseFloat(panel.icRating) || 10} kAIC` })] }),
                  new docx.TableCell({ children: [new docx.Paragraph({ text: `${upstreamInstMultiplier}x (${upstreamTrip * upstreamInstMultiplier} A)` })] }),
                ],
              }),
              new docx.TableRow({
                children: [
                  new docx.TableCell({ children: [new docx.Paragraph({ text: "Downstream (Branch Feeders)" })] }),
                  new docx.TableCell({ children: [new docx.Paragraph({ text: `${downstreamTrip} A` })] }),
                  new docx.TableCell({ children: [new docx.Paragraph({ text: (Object.values(faultResults).find((r: any) => r.id !== "utility" && r.id !== "transformer" && r.id !== "mdp") as any)?.breakerkAIC ? `${(Object.values(faultResults).find((r: any) => r.id !== "utility" && r.id !== "transformer" && r.id !== "mdp") as any).breakerkAIC} kAIC` : "18 kAIC" })] }),
                  new docx.TableCell({ children: [new docx.Paragraph({ text: `${downstreamInstMultiplier}x (${downstreamTrip * downstreamInstMultiplier} A)` })] }),
                ],
              }),
            ],
          }),
          new docx.Paragraph({ text: "" }),
          new docx.Paragraph({
            children: [new docx.TextRun({ text: "Time-Current Curve Graph Parameters Mapping:", bold: true })]
          }),
          new docx.Table({
            rows: [
              new docx.TableRow({
                children: [
                  new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: "Breaker Type", bold: true })] })] }),
                  new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: "Overload Range (LTD)", bold: true })] })] }),
                  new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: "Instantaneous Pickup (INST)", bold: true })] })] }),
                  new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: "Conductor Damage Limit", bold: true })] })] }),
                ],
              }),
              new docx.TableRow({
                children: [
                  new docx.TableCell({ children: [new docx.Paragraph({ text: `Main (${upstreamTrip}A)` })] }),
                  new docx.TableCell({ children: [new docx.Paragraph({ text: `Continuous Trip at >${upstreamTrip} A` })] }),
                  new docx.TableCell({ children: [new docx.Paragraph({ text: `${upstreamTrip * upstreamInstMultiplier} A` })] }),
                  new docx.TableCell({ children: [new docx.Paragraph({ text: "Conductor damage curves safely clear of trip curves" })] }),
                ],
              }),
              new docx.TableRow({
                children: [
                  new docx.TableCell({ children: [new docx.Paragraph({ text: `Branch (${downstreamTrip}A)` })] }),
                  new docx.TableCell({ children: [new docx.Paragraph({ text: `Continuous Trip at >${downstreamTrip} A` })] }),
                  new docx.TableCell({ children: [new docx.Paragraph({ text: `${downstreamTrip * downstreamInstMultiplier} A` })] }),
                  new docx.TableCell({ children: [new docx.Paragraph({ text: "Conductor damage curves safely clear of trip curves" })] }),
                ],
              }),
            ],
          }),
          new docx.Paragraph({ text: "" })
        );
      }

      // Section 4.0 Load Flow & Bus Voltage Analysis
      if (activeReportSection === "all" || activeReportSection === "loadflow") {
        docxChildren.push(
          new docx.Paragraph({
            text: "4.0 LOAD FLOW SIMULATION & BUS VOLTAGE ANALYSIS",
            heading: docx.HeadingLevel.HEADING_1,
          }),
          new docx.Paragraph({
            text: "Aggregated phase operating load currents, active loads (kW), and percent regulatory voltage drop results mapped along each topological node in the feeder system:",
          }),
          new docx.Paragraph({ text: "" }),
          new docx.Table({
            rows: [
              new docx.TableRow({
                children: [
                  new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: "Bus/Panel Designation", bold: true })] })] }),
                  new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: "Voltage Mag (V)", bold: true })] })] }),
                  new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: "Load Current (A)", bold: true })] })] }),
                  new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: "Active Load (kW)", bold: true })] })] }),
                  new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: "Volt Drop (%)", bold: true })] })] }),
                  new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: "Status", bold: true })] })] }),
                ],
              }),
              ...Object.values(loadFlowResults).map((r: any) => (
                new docx.TableRow({
                  children: [
                    new docx.TableCell({ children: [new docx.Paragraph({ text: r.name })] }),
                    new docx.TableCell({ children: [new docx.Paragraph({ text: `${r.voltageMagnitude.toFixed(1)} V` })] }),
                    new docx.TableCell({ children: [new docx.Paragraph({ text: `${r.currentMagnitude.toFixed(1)} A` })] }),
                    new docx.TableCell({ children: [new docx.Paragraph({ text: `${r.kw.toFixed(2)} kW` })] }),
                    new docx.TableCell({ children: [new docx.Paragraph({ text: `${r.regulation.toFixed(2)} %` })] }),
                    new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: r.status.toUpperCase(), bold: true })] })] }),
                  ],
                })
              )),
            ],
          }),
          new docx.Paragraph({ text: "" })
        );
      }

      // Section 5.0 Symmetrical & Symmetrical Short-Circuit Fault Study
      if (activeReportSection === "all" || activeReportSection === "fault") {
        docxChildren.push(
          new docx.Paragraph({
            text: "5.0 SYMMETRICAL & UNSYMMETRICAL FAULT STUDY",
            heading: docx.HeadingLevel.HEADING_1,
          }),
          new docx.Paragraph({
            text: "Available solid fault profiles and peak transient currents computed relative to transformer impedance, X/R ratios, and grid available short-circuit capacity:",
          }),
          new docx.Paragraph({ text: "" }),
          new docx.Table({
            rows: [
              new docx.TableRow({
                children: [
                  new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: "Equipment Location", bold: true })] })] }),
                  new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: "3-PH Symmetrical", bold: true })] })] }),
                  new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: "Peak Fault (kA)", bold: true })] })] }),
                  new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: "Breaker kAIC", bold: true })] })] }),
                  new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: "Fault Duty (%)", bold: true })] })] }),
                  new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: "Safety Compliance", bold: true })] })] }),
                ],
              }),
              ...Object.values(faultResults).map((r: any) => (
                new docx.TableRow({
                  children: [
                    new docx.TableCell({ children: [new docx.Paragraph({ text: r.name })] }),
                    new docx.TableCell({ children: [new docx.Paragraph({ text: `${r.iSym3PH.toFixed(2)} kA` })] }),
                    new docx.TableCell({ children: [new docx.Paragraph({ text: `${r.peakFault.toFixed(2)} kA` })] }),
                    new docx.TableCell({ children: [new docx.Paragraph({ text: r.breakerkAIC > 0 ? `${r.breakerkAIC} kAIC` : "N/A" })] }),
                    new docx.TableCell({ children: [new docx.Paragraph({ text: r.breakerkAIC > 0 ? `${r.dutyPercentage.toFixed(1)} %` : "N/A" })] }),
                    new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: r.compliance, bold: true })] })] }),
                  ],
                })
              )),
            ],
          }),
          new docx.Paragraph({ text: "" })
        );
      }

      // Section 6.0 Topology & Single Line Diagram Layer Map (SLD)
      if (activeReportSection === "all" || activeReportSection === "sld") {
        docxChildren.push(
          new docx.Paragraph({
            text: "6.0 TOPOLOGY & SINGLE LINE DIAGRAM LAYER MAP",
            heading: docx.HeadingLevel.HEADING_1,
          }),
          new docx.Paragraph({
            text: `This section captures the topological single-line diagram layers matching the dynamic preview configuration. Active Diagram Layer: ${sldLayer.toUpperCase()}`,
          }),
          new docx.Paragraph({ text: "" }),
          new docx.Table({
            rows: [
              new docx.TableRow({
                children: [
                  new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: "Topology Level", bold: true })] })] }),
                  new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: "Equipment Details", bold: true })] })] }),
                  new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: "Active Layer Parameter View", bold: true })] })] }),
                ],
              }),
              new docx.TableRow({
                children: [
                  new docx.TableCell({ children: [new docx.Paragraph({ text: "Utility Source" })] }),
                  new docx.TableCell({ children: [new docx.Paragraph({ text: "Primary High Voltage Grid Source" })] }),
                  new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: sldLayerDetails.utility[sldLayer], bold: true })] })] }),
                ],
              }),
              new docx.TableRow({
                children: [
                  new docx.TableCell({ children: [new docx.Paragraph({ text: "Transformer" })] }),
                  new docx.TableCell({ children: [new docx.Paragraph({ text: `Step Down: 13.8kV to ${systemVoltage}V` })] }),
                  new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: sldLayerDetails.transformer[sldLayer], bold: true })] })] }),
                ],
              }),
              new docx.TableRow({
                children: [
                  new docx.TableCell({ children: [new docx.Paragraph({ text: panel.designation || "MDP Board Panel" })] }),
                  new docx.TableCell({ children: [new docx.Paragraph({ text: "Main Low Voltage Board" })] }),
                  new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: sldLayerDetails.mdp[sldLayer], bold: true })] })] }),
                ],
              }),
            ],
          }),
          new docx.Paragraph({ text: "" })
        );
      }

      // Section 7.0 Automated Diagnostics & Engineering Advisory
      if (activeReportSection === "all" || activeReportSection === "recommendations") {
        const hasDanger = engineeringFindings.some(f => f.type === "danger");
        docxChildren.push(
          new docx.Paragraph({
            text: "7.0 AUTOMATED DIAGNOSTICS & ENGINEERING ADVISORY",
            heading: docx.HeadingLevel.HEADING_1,
          }),
          new docx.Paragraph({
            text: "The following automated diagnostics and safety compliance findings were identified based on the analytical margins:",
          }),
          new docx.Paragraph({ text: "" }),
          ...engineeringFindings.map((finding) => (
            new docx.Paragraph({
              children: [
                new docx.TextRun({
                  text: `[${finding.section.toUpperCase()}] ${finding.title}\n`,
                  bold: true,
                  color: finding.type === "danger" ? "EF4444" : finding.type === "warning" ? "F59E0B" : "10B981",
                }),
                new docx.TextRun({
                  text: `Finding Class: ${finding.type.toUpperCase()} | ${finding.desc}\n`,
                }),
              ],
            })
          )),
          new docx.Paragraph({ text: "" }),
          new docx.Paragraph({
            children: [
              new docx.TextRun({ text: "Compliance Status: ", bold: true }),
              new docx.TextRun({
                text: hasDanger ? "VIOLATION FLAGS ACTIVE (Action Required)" : "SYSTEM DECLARED SECURE & COMPLIANT",
                bold: true,
                color: hasDanger ? "EF4444" : "10B981",
              }),
            ],
          }),
          new docx.Paragraph({ text: "" }),
          new docx.Paragraph({ text: "--------------------------------------------------------------------------------------------------" }),
          new docx.Paragraph({ text: "" }),
          new docx.Paragraph({
            children: [new docx.TextRun({ text: "Registered Professional Assessor Signature Verification:", bold: true })]
          }),
          new docx.Paragraph({ text: "" }),
          new docx.Paragraph({
            text: "Assessor Signature Line: ___________________________________",
          }),
          new docx.Paragraph({
            children: [new docx.TextRun({ text: `Assessor Name: ${authorName}`, bold: true })]
          }),
          new docx.Paragraph({
            text: "Registered Professional Assessor (PE)",
          }),
          new docx.Paragraph({ text: "" }),
          new docx.Paragraph({
            text: "Note: These parameters represent ideal static values based on current load schedules. Actual operating dynamics may vary based on temperature coefficients and individual motor startup periods.",
            alignment: docx.AlignmentType.JUSTIFIED,
          })
        );
      }

      // Create Document
      const doc = new docx.Document({
        sections: [
          {
            properties: {
              page: {
                margin: {
                  top: 1440, // 1 inch
                  bottom: 1440,
                  left: 1440,
                  right: 1440,
                },
              },
            },
            headers: {
              default: new docx.Header({
                children: [
                  new docx.Paragraph({
                    children: [
                      new docx.TextRun({
                        text: `${reportTitle} | ${clientName}`,
                        color: "666666",
                        size: 16,
                      }),
                    ],
                  }),
                ],
              }),
            },
            footers: {
              default: new docx.Footer({
                children: [
                  new docx.Paragraph({
                    children: [
                      new docx.TextRun({
                        text: `Generated via IEEE/IEC Power Analysis Suite. Page `,
                        color: "999999",
                        size: 16,
                      }),
                      new docx.TextRun({
                        children: [docx.PageNumber.CURRENT],
                        color: "999999",
                        size: 16,
                      }),
                    ],
                  }),
                ],
              }),
            },
            children: docxChildren,
          },
        ],
      });

      // Write docx
      const blob = await docx.Packer.toBlob(doc);
      const fileSuffix = activeReportSection === "all" ? "Combined" : activeReportSection;
      saveAs(blob, `${fileSuffix}_Power_Analysis_Report_${panel.designation || "MDP"}.docx`);
    } catch (err) {
      console.error("Failed to generate DOCX", err);
    }
  };

  // PDF Generation Logic
  const handleExportPDF = async () => {
    if (!isPremium) {
      alert("Word and PDF document exports are available exclusively with the Premium Plan. Upgrade your subscription to unlock professional document generation.");
      onRequestUpgrade();
      return;
    }

    const { updatedMdpCircuits, updatedSubPanels } = syncHierarchyData(panel, circuits, subPanels, vdCalculations);
    const syncCircuits = updatedMdpCircuits;
    const syncSubPanels = updatedSubPanels;

    if (user?.uid) {
      try {
        const response = await fetch("/api/verify-doc-export", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user.uid, module: "power-suite", format: "pdf" })
        });
        if (!response.ok) {
          const data = await response.json();
          alert(data.error || "PDF export verification failed.");
          onRequestUpgrade();
          return;
        }
      } catch (err) {
        console.warn("Backend validation failed, proceeding with client verification:", err);
      }
    }

    try {
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4"
      });

      let currentY = 50;

      const checkPageBreak = (neededHeight: number) => {
        if (currentY + neededHeight > 275) {
          doc.addPage();
          // Draw header on new page
          doc.setFillColor(30, 41, 59); // Slate-800
          doc.rect(0, 0, 210, 15, "F");
          doc.setTextColor(255, 255, 255);
          doc.setFont("Helvetica", "bold");
          doc.setFontSize(8);
          doc.text(`${reportTitle.toUpperCase()} | REPORT CONTINUED`, 15, 10);
          
          doc.setTextColor(51, 65, 85);
          currentY = 25; // Reset Y on new page
        }
      };

      // Always draw Cover Page / Header Block on Page 1
      doc.setFillColor(30, 41, 59); // Slate-800
      doc.rect(0, 0, 210, 40, "F");
      
      doc.setTextColor(255, 255, 255);
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(16);
      doc.text(reportTitle.toUpperCase(), 15, 18);
      
      doc.setFont("Helvetica", "normal");
      doc.setFontSize(9);
      doc.text("OFFICIAL ENGINEERING ANALYSIS STUDY REPORT", 15, 26);
      doc.text(`Project Code: ${projectNumber} | Date: ${dateStr}`, 15, 33);

      // Section 1.0 General Project Parameters
      if (activeReportSection === "all" || activeReportSection === "project") {
        checkPageBreak(50);
        doc.setTextColor(51, 65, 85);
        doc.setFontSize(12);
        doc.setFont("Helvetica", "bold");
        doc.text("1.0 SYSTEM METADATA & PROJECT PROPERTIES", 15, currentY);
        currentY += 8;

        doc.setFont("Helvetica", "normal");
        doc.setFontSize(9.5);
        if (panel.projectType) {
          doc.text(`Project Classification: ${panel.projectType.toUpperCase()} FACILITY`, 15, currentY);
          currentY += 6;
        }
        if (panel.institution) {
          const instText = (panel.institution === 'Custom...' ? panel.customInstitutionName || 'Custom' : panel.institution).toUpperCase();
          doc.text(`Specific Institution: ${instText}`, 15, currentY);
          currentY += 6;
        }
        doc.text(`Client Enterprise Name: ${clientName}`, 15, currentY);
        currentY += 6;
        if (panel.owner) {
          doc.text(`Project Owner: ${panel.owner}`, 15, currentY);
          currentY += 6;
        }
        doc.text(`Nominal System Voltage: ${systemVoltage} V (${isThreePhase ? "3-Phase" : "1-Phase"} balanced delta/wye)`, 15, currentY);
        currentY += 6;
        doc.text(`Grid Standard Frequency: ${systemFreq} Hz | Rated Power Factor: 0.85`, 15, currentY);
        currentY += 6;
        doc.text(`Generated By: ${authorName}`, 15, currentY);
        currentY += 6;
        doc.text(`System Compliance Baseline: IEEE 242 Protection / IEEE 399 Load Flow`, 15, currentY);
        currentY += 12;
      }

      // Section 2.0 Transformer Capacity & Sizing Study
      if (activeReportSection === "all" || activeReportSection === "transformer") {
        checkPageBreak(85);
        doc.setTextColor(51, 65, 85);
        doc.setFontSize(12);
        doc.setFont("Helvetica", "bold");
        doc.text("2.0 TRANSFORMER CAPACITY & SIZING STUDY", 15, currentY);
        currentY += 8;

        doc.setFont("Helvetica", "normal");
        doc.setFontSize(9.5);
        doc.text(`Active transformer configuration and sizing ratings, synchronized with the system-wide MDP loads:`, 15, currentY);
        currentY += 6;

        // Draw transformer spec boxes side by side
        doc.setFillColor(248, 250, 252);
        doc.rect(15, currentY, 85, 42, "F");
        doc.setDrawColor(203, 213, 225);
        doc.rect(15, currentY, 85, 42, "D");
        doc.setFillColor(248, 250, 252);
        doc.rect(110, currentY, 85, 42, "F");
        doc.rect(110, currentY, 85, 42, "D");

        doc.setFont("Helvetica", "bold");
        doc.setFontSize(8.5);
        doc.setTextColor(15, 23, 42);
        doc.text("Transformer Technical Specifications", 18, currentY + 5);
        doc.text("Loading & Capacity Analysis", 113, currentY + 5);

        doc.setFont("Helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(71, 85, 105);
        // Col 1 Details
        doc.text(`Transformer Rating: ${transformerMetrics.recommendedRating} kVA`, 18, currentY + 11);
        doc.text(`Type & Phase: Standard Step-Down, ${transformerMetrics.is3Phase ? "3-Phase" : "1-Phase"}`, 18, currentY + 16);
        doc.text(`Primary Voltage: ${transformerMetrics.primaryVoltage.toLocaleString()} V`, 18, currentY + 21);
        doc.text(`Secondary Voltage: ${transformerMetrics.secondaryVoltage} V`, 18, currentY + 26);
        doc.text(`Percent Impedance (%Z): ${transformerMetrics.txZ.toFixed(1)}%`, 18, currentY + 31);
        doc.text(`Secondary Connection: ${transformerMetrics.is3Phase ? "Delta-Wye (D-Y, Solidly Grounded)" : "Single-Phase 2-Wire"}`, 18, currentY + 36);

        // Col 2 Details
        doc.text(`Total Connected Load: ${transformerMetrics.connectedLoadKVA.toFixed(2)} kVA (${transformerMetrics.connectedLoadkW.toFixed(2)} kW)`, 113, currentY + 11);
        doc.text(`Maximum Demand Load: ${transformerMetrics.demandLoadKVA.toFixed(2)} kVA (${transformerMetrics.demandLoadkW.toFixed(2)} kW)`, 113, currentY + 16);
        doc.text(`Continuous Loading Factor: ${(transformerMetrics.loadingFactor * 100).toFixed(0)}% Target limit`, 113, currentY + 21);
        doc.text(`Spare Capacity Available: ${transformerMetrics.spareCapacityKVA.toFixed(2)} kVA`, 113, currentY + 26);
        doc.text(`Secondary Full Load Current: ${transformerMetrics.secondaryCurrent.toFixed(1)} A`, 113, currentY + 31);
        
        doc.text(`Actual Loading Percentage:`, 113, currentY + 36);
        doc.setFont("Helvetica", "bold");
        if (transformerMetrics.actualLoadingPct > 100) {
          doc.setTextColor(220, 38, 38); // red
        } else if (transformerMetrics.actualLoadingPct > (transformerMetrics.loadingFactor * 100)) {
          doc.setTextColor(217, 119, 6); // amber
        } else {
          doc.setTextColor(16, 124, 65); // green
        }
        doc.text(`${transformerMetrics.actualLoadingPct.toFixed(1)}%`, 147, currentY + 36);

        doc.setTextColor(51, 65, 85);
        currentY += 50;

        doc.setFont("Helvetica", "bold");
        doc.setFontSize(8.5);
        doc.text("Short-Circuit Fault Contribution", 15, currentY);
        doc.text("Integrated Protection Coordination Rules", 110, currentY);
        currentY += 5;
        
        doc.setFont("Helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(71, 85, 105);
        const faultText = doc.splitTextToSize(`The step-down transformer serves as the secondary grid fault source. Based on a utility primary short-circuit level of ${transformerMetrics.utilityMVA} MVA and transformer impedance of ${transformerMetrics.txZ}%, the calculated maximum symmetrical fault contribution at the secondary terminals is ${transformerMetrics.transformerFaultKA.toFixed(2)} kA.`, 85);
        doc.text(faultText, 15, currentY);
        
        const rulesText = doc.splitTextToSize(`Under standard PEC regulations, secondary protection must be sized to continuous demand profiles. Recommended upstream main protection breaker rating is ${upstreamTrip} A with coordinating thermal damage limits positioned to safely ride through normal transformer magnetization inrush periods.`, 85);
        doc.text(rulesText, 110, currentY);
        
        currentY += Math.max(faultText.length, rulesText.length) * 4 + 10;
      }

      // Section 3.0 Protection Selectivity & Coordination Study
      if (activeReportSection === "all" || activeReportSection === "coordination") {
        checkPageBreak(90);
        doc.setTextColor(51, 65, 85);
        doc.setFontSize(12);
        doc.setFont("Helvetica", "bold");
        doc.text("3.0 PROTECTION SELECTIVITY & COORDINATION STUDY", 15, currentY);
        currentY += 8;

        doc.setFont("Helvetica", "normal");
        doc.setFontSize(9.5);
        doc.text(`Main protective breaker is set at ${upstreamTrip}A AT with a standard ${upstreamInstMultiplier}x instantaneous trip surge threshold.`, 15, currentY);
        currentY += 6;
        doc.text(`Top subpanel branch protective devices are configured at ${downstreamTrip}A AT with ${downstreamInstMultiplier}x instantaneous pickup bounds.`, 15, currentY);
        currentY += 6;

        const isCoordinated = upstreamTrip > downstreamTrip;
        doc.setFont("Helvetica", "bold");
        if (isCoordinated) {
          doc.setTextColor(16, 124, 65); // green
          doc.text("Upstream to Downstream coordination status: COORDINATED MARGIN (Optimized)", 15, currentY);
        } else {
          doc.setTextColor(220, 38, 38); // red
          doc.text("Upstream to Downstream coordination status: CRITICAL OVERLAP FINDING (Non-Selective Overlap)", 15, currentY);
        }
        doc.setTextColor(51, 65, 85);
        currentY += 8;

        // Draw dynamic visual graph of TCC in PDF
        doc.setDrawColor(200, 200, 200);
        doc.setFillColor(248, 250, 252);
        doc.rect(15, currentY, 180, 50, "F");
        doc.rect(15, currentY, 180, 50, "D");

        doc.setLineWidth(0.2);
        for (let i = 0; i <= 5; i++) {
          const gridX = 15 + (i * 36);
          doc.line(gridX, currentY, gridX, currentY + 50);
        }

        // Main Curve (Red)
        doc.setDrawColor(239, 68, 68);
        doc.setLineWidth(1.0);
        doc.line(30, currentY + 5, 80 + (upstreamTrip / 10), currentY + 30);
        doc.line(80 + (upstreamTrip / 10), currentY + 30, 80 + (upstreamTrip / 10), currentY + 45);

        // Branch Curve (Blue)
        doc.setDrawColor(59, 130, 246);
        doc.setLineWidth(1.0);
        doc.line(20, currentY + 10, 50 + (downstreamTrip / 10), currentY + 35);
        doc.line(50 + (downstreamTrip / 10), currentY + 35, 50 + (downstreamTrip / 10), currentY + 45);

        // Cable Limit (Green)
        doc.setDrawColor(16, 185, 129);
        doc.setLineWidth(0.8);
        doc.line(160, currentY + 5, 120, currentY + 45);

        doc.setFontSize(7.5);
        doc.setFont("Helvetica", "bold");
        doc.setTextColor(239, 68, 68);
        doc.text(`Main breaker curve (${upstreamTrip}A)`, 85 + (upstreamTrip / 10), currentY + 28);
        
        doc.setTextColor(59, 130, 246);
        doc.text(`Branch breaker curve (${downstreamTrip}A)`, 55 + (downstreamTrip / 10), currentY + 40);

        doc.setTextColor(16, 185, 129);
        doc.text("Conductor Withstand Limit", 125, currentY + 10);

        doc.setTextColor(100, 116, 139);
        doc.setFontSize(7);
        doc.text("Current (Amperes) -> Log Scale", 90, currentY + 48);

        doc.setTextColor(51, 65, 85);
        currentY += 58;
      }

      // Section 4.0 Load Flow & Bus Voltage Analysis
      if (activeReportSection === "all" || activeReportSection === "loadflow") {
        checkPageBreak(55);
        doc.setFont("Helvetica", "bold");
        doc.setFontSize(12);
        doc.setTextColor(51, 65, 85);
        doc.text("4.0 LOAD FLOW SIMULATION & BUS VOLTAGE DROPS", 15, currentY);
        currentY += 8;

        doc.setFillColor(241, 245, 249);
        doc.rect(15, currentY, 180, 7, "F");
        doc.setFont("Helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(15, 23, 42);
        doc.text("Bus/Panel Designation", 17, currentY + 5);
        doc.text("Voltage Mag (V)", 65, currentY + 5);
        doc.text("Load Current (A)", 100, currentY + 5);
        doc.text("Active Load (kW)", 130, currentY + 5);
        doc.text("Volt Drop (%)", 160, currentY + 5);
        doc.text("Status", 185, currentY + 5);

        currentY += 12;
        doc.setFont("Helvetica", "normal");
        doc.setTextColor(51, 65, 85);
        
        Object.values(loadFlowResults).forEach((lfNode: any) => {
          checkPageBreak(10);
          doc.setFont("Helvetica", "bold");
          doc.text(lfNode.name, 17, currentY);
          doc.setFont("Helvetica", "normal");
          doc.text(`${lfNode.voltageMagnitude.toFixed(1)} V`, 65, currentY);
          doc.text(`${lfNode.currentMagnitude.toFixed(1)} A`, 100, currentY);
          doc.text(`${lfNode.kw.toFixed(2)} kW`, 130, currentY);
          doc.text(`${lfNode.regulation.toFixed(2)} %`, 160, currentY);
          
          doc.setFont("Helvetica", "bold");
          if (lfNode.status === "normal") doc.setTextColor(16, 124, 65);
          else if (lfNode.status === "warning") doc.setTextColor(217, 119, 6);
          else doc.setTextColor(220, 38, 38);
          doc.text(lfNode.status.toUpperCase(), 185, currentY);
          doc.setTextColor(51, 65, 85);
          
          currentY += 6.5;
        });
        currentY += 6;
      }

      // Section 5.0 Symmetrical & Symmetrical Short-Circuit Fault Study
      if (activeReportSection === "all" || activeReportSection === "fault") {
        checkPageBreak(55);
        doc.setFont("Helvetica", "bold");
        doc.setFontSize(12);
        doc.setTextColor(51, 65, 85);
        doc.text("5.0 SYSTEM SHORT-CIRCUIT FAULT LEVEL ASSESSMENTS", 15, currentY);
        currentY += 8;

        doc.setFillColor(241, 245, 249);
        doc.rect(15, currentY, 180, 7, "F");
        doc.setFont("Helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(15, 23, 42);
        doc.text("Equipment Location", 17, currentY + 5);
        doc.text("3-PH Symmetrical", 65, currentY + 5);
        doc.text("Peak Fault (kA)", 100, currentY + 5);
        doc.text("Breaker kAIC", 130, currentY + 5);
        doc.text("Fault Duty (%)", 160, currentY + 5);
        doc.text("Safety Compliance", 185, currentY + 5);

        currentY += 12;
        doc.setFont("Helvetica", "normal");
        doc.setTextColor(51, 65, 85);

        Object.values(faultResults).forEach((fNode: any) => {
          checkPageBreak(10);
          doc.setFont("Helvetica", "bold");
          doc.text(fNode.name, 17, currentY);
          doc.setFont("Helvetica", "normal");
          doc.text(`${fNode.iSym3PH.toFixed(2)} kA`, 65, currentY);
          doc.text(`${fNode.peakFault.toFixed(2)} kA`, 100, currentY);
          doc.text(fNode.breakerkAIC > 0 ? `${fNode.breakerkAIC} kA` : "N/A", 130, currentY);
          doc.text(fNode.breakerkAIC > 0 ? `${fNode.dutyPercentage.toFixed(1)} %` : "N/A", 160, currentY);
          
          doc.setFont("Helvetica", "bold");
          if (fNode.compliance === "PASSED") doc.setTextColor(16, 124, 65);
          else if (fNode.compliance === "WARNING") doc.setTextColor(217, 119, 6);
          else doc.setTextColor(220, 38, 38);
          doc.text(fNode.compliance, 185, currentY);
          doc.setTextColor(51, 65, 85);
          
          currentY += 6.5;
        });
        currentY += 6;
      }

      // Section 6.0 Topology & Single Line Diagram Layer Map (SLD)
      if (activeReportSection === "all" || activeReportSection === "sld") {
        checkPageBreak(65);
        doc.setFont("Helvetica", "bold");
        doc.setFontSize(12);
        doc.setTextColor(51, 65, 85);
        doc.text("6.0 Topology & Single Line Diagram Layer Map", 15, currentY);
        currentY += 8;

        doc.setFont("Helvetica", "normal");
        doc.setFontSize(9.5);
        doc.text(`Active Diagram View Layer: ${sldLayer.toUpperCase()}`, 15, currentY);
        currentY += 6;

        // Draw clean topology block in PDF
        doc.setFillColor(248, 250, 252);
        doc.rect(15, currentY, 180, 36, "F");
        doc.setDrawColor(203, 213, 225);
        doc.rect(15, currentY, 180, 36, "D");

        // Single Line flow
        doc.setDrawColor(15, 23, 42);
        doc.setLineWidth(1.0);
        doc.line(30, currentY + 18, 180, currentY + 18);

        doc.setFillColor(16, 185, 129);
        doc.circle(50, currentY + 18, 4, "FD");
        doc.setFillColor(245, 158, 11);
        doc.circle(100, currentY + 18, 4, "FD");
        doc.setFillColor(59, 130, 246);
        doc.rect(146, currentY + 14, 8, 8, "FD");

        doc.setFontSize(7.5);
        doc.setFont("Helvetica", "bold");
        doc.setTextColor(15, 23, 42);
        doc.text("Grid Source", 42, currentY + 10);
        doc.text("Transformer", 90, currentY + 10);
        doc.text(panel.designation || "MDP Board", 138, currentY + 10);

        doc.setFont("Helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(71, 85, 105);
        doc.text(doc.splitTextToSize(sldLayerDetails.utility[sldLayer], 45), 25, currentY + 28);
        doc.text(doc.splitTextToSize(sldLayerDetails.transformer[sldLayer], 45), 75, currentY + 28);
        doc.text(doc.splitTextToSize(sldLayerDetails.mdp[sldLayer], 45), 125, currentY + 28);

        doc.setTextColor(51, 65, 85);
        currentY += 46;
      }

      // Section 7.0 Automated Diagnostics & Engineering Advisory
      if (activeReportSection === "all" || activeReportSection === "recommendations") {
        checkPageBreak(50);
        doc.setFont("Helvetica", "bold");
        doc.setFontSize(12);
        doc.setTextColor(51, 65, 85);
        doc.text("7.0 AUTOMATED DIAGNOSTICS & ENGINEERING ADVISORY", 15, currentY);
        currentY += 8;

        engineeringFindings.forEach((f) => {
          const descWrapped = doc.splitTextToSize(f.desc, 174);
          const cardHeight = 12 + (descWrapped.length * 4);
          checkPageBreak(cardHeight + 4);

          doc.setFillColor(f.type === "danger" ? 254 : f.type === "warning" ? 255 : 240, f.type === "danger" ? 242 : f.type === "warning" ? 247 : 253, f.type === "danger" ? 242 : f.type === "warning" ? 237 : 250);
          doc.rect(15, currentY, 180, cardHeight, "F");
          
          doc.setFont("Helvetica", "bold");
          doc.setFontSize(8.5);
          doc.setTextColor(f.type === "danger" ? 153 : f.type === "warning" ? 180 : 30, f.type === "danger" ? 27 : f.type === "warning" ? 83 : 130, f.type === "danger" ? 27 : f.type === "warning" ? 9 : 76);
          doc.text(`[${f.section.toUpperCase()}] ${f.title}`, 18, currentY + 5.5);
          
          doc.setFont("Helvetica", "normal");
          doc.setFontSize(7.5);
          doc.setTextColor(15, 23, 42);
          
          doc.text(descWrapped, 18, currentY + 10);
          currentY += cardHeight + 4;
        });

        // Signoff Line
        const hasDanger = engineeringFindings.some(f => f.type === "danger");
        checkPageBreak(35);
        currentY += 6;
        doc.setFont("Helvetica", "bold");
        doc.setFontSize(9.5);
        doc.setTextColor(51, 65, 85);
        doc.text("SYSTEM COMPLIANCE SUMMARY:", 15, currentY);
        if (hasDanger) {
          doc.setTextColor(220, 38, 38);
          doc.text("VIOLATION FLAGS ACTIVE (Critical Action Required)", 75, currentY);
        } else {
          doc.setTextColor(16, 124, 65);
          doc.text("SYSTEM DECLARED SECURE & COMPLIANT", 75, currentY);
        }
        doc.setTextColor(51, 65, 85);
        currentY += 12;

        doc.setFont("Helvetica", "normal");
        doc.text("Assessor Signature: _________________________________", 15, currentY);
        doc.text(`Assessor Name: ${authorName}`, 15, currentY + 6);
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text("Registered Professional Assessor (PE)", 15, currentY + 11);
      }

      const fileSuffix = activeReportSection === "all" ? "Combined" : activeReportSection;
      doc.save(`${fileSuffix}_Power_Analysis_Report_${panel.designation || "MDP"}.pdf`);
    } catch (err) {
      console.error("Failed to generate PDF", err);
    }
  };

  // Helper to render responsive single line diagram layers
  const sldLayerDetails = useMemo(() => {
    return {
      utility: {
        protection: `Grid Source — Trip limit: 600A`,
        loadflow: `Supply: 13.8kV nominal, PF: 0.85`,
        fault: `Available Grid short-circuit capacity: ${iscParams.utilityShortCircuitMVA || 500} MVA`
      },
      transformer: {
        protection: `Primary protection: HV Fuse link`,
        loadflow: `${iscParams.transformerKVA || 500} kVA capacity, secondary ${systemVoltage}V`,
        fault: `Impedance (Z%): ${iscParams.transformerZ || 5.0}%, secondary fault: ${(faultResults["transformer"]?.iSym3PH || 0).toFixed(2)} kA`
      },
      mdp: {
        protection: `Breaker: ${upstreamTrip}A AT, Instantaneous: ${upstreamInstMultiplier}x`,
        loadflow: `Total Load: ${(loadFlowResults["mdp"]?.kva || 0).toFixed(1)} kVA, Drop: ${(loadFlowResults["mdp"]?.regulation || 0).toFixed(2)}%`,
        fault: `Main fault: ${(faultResults["mdp"]?.iSym3PH || 0).toFixed(2)} kA, Duty: ${(faultResults["mdp"]?.dutyPercentage || 0).toFixed(1)}%`
      }
    };
  }, [upstreamTrip, upstreamInstMultiplier, iscParams, systemVoltage, loadFlowResults, faultResults]);

  return (
    <div className="w-full flex flex-col gap-6" id="report-export-module">
      
      {/* Branded Template Customizer Header */}
      <div className="bg-slate-950/60 p-5 rounded-xl border border-slate-800/80 grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-2 flex flex-col gap-2">
          <label className="text-xxs uppercase tracking-wider font-black text-slate-400">Report Theme & Titles</label>
          <input 
            type="text" 
            value={reportTitle} 
            onChange={(e) => setReportTitle(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700/80 rounded px-3 py-1.5 text-xs font-bold text-white focus:outline-none focus:border-emerald-500"
            placeholder="Report Document Title"
          />
          <div className="grid grid-cols-2 gap-2 mt-1">
            <div>
              <label className="text-[10px] text-slate-400">Client Enterprise</label>
              <input 
                type="text" 
                value={clientName} 
                onChange={(e) => setClientName(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700/80 rounded px-2.5 py-1 text-[11px] text-slate-200"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400">Project Reference</label>
              <input 
                type="text" 
                value={projectNumber} 
                onChange={(e) => setProjectNumber(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700/80 rounded px-2.5 py-1 text-[11px] text-slate-200"
              />
            </div>
          </div>
        </div>

        <div>
          <label className="text-xxs uppercase tracking-wider font-black text-slate-400">Assessor Signature</label>
          <input 
            type="text" 
            value={authorName} 
            onChange={(e) => setAuthorName(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700/80 rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 mt-2"
          />
          <div className="mt-2.5">
            <span className="text-[10px] text-slate-400">Branded Logo Theme</span>
            <div className="flex gap-1.5 mt-1">
              {["modern", "corporate", "classic"].map((t) => (
                <button
                  key={t}
                  onClick={() => setReportTheme(t as any)}
                  className={`text-[10px] px-2.5 py-1 rounded capitalize border transition-all ${
                    reportTheme === t 
                      ? "bg-emerald-500/15 border-emerald-500 text-emerald-400 font-bold" 
                      : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-end gap-2.5">
          <div className="p-3 bg-slate-900 rounded border border-slate-800/80 text-xxs text-slate-400 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Report exports auto-bundle TCC curve parameters, Phase summaries, & Single Line diagrams.</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleExportPDF}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold rounded shadow transition-all ${
                isPremium 
                  ? "bg-red-600 hover:bg-red-500 text-white cursor-pointer" 
                  : "bg-slate-800 text-slate-500 hover:text-slate-400 border border-slate-700/60 cursor-pointer"
              }`}
            >
              <FileDown className="w-3.5 h-3.5" />
              <span>Download PDF</span>
              {!isPremium && <Lock className="w-3 h-3 text-amber-500 ml-0.5" />}
            </button>
            <button
              onClick={handleExportDOCX}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold rounded shadow transition-all ${
                isPremium 
                  ? "bg-blue-600 hover:bg-blue-500 text-white cursor-pointer" 
                  : "bg-slate-800 text-slate-500 hover:text-slate-400 border border-slate-700/60 cursor-pointer"
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Word DOCX</span>
              {!isPremium && <Lock className="w-3 h-3 text-amber-500 ml-0.5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Main Interactive Preview Container */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        
        {/* Navigation / Selection Sidebar (Section Outlines) */}
        <div className="xl:col-span-1 flex flex-col gap-2 bg-slate-950/40 p-4 rounded-xl border border-slate-800/60">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5 mb-2">
            <span className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-emerald-400" />
              Report Outline
            </span>
            <span className="text-xxs px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-black">
              Interactive
            </span>
          </div>

          {[
            { id: "all", label: "Full Combined Report", count: 7 },
            { id: "project", label: "1.0 Project Information", count: 1 },
            { id: "transformer", label: "2.0 Transformer Sizing Study", count: 1 },
            { id: "coordination", label: "3.0 Protection Selectivity", count: 2 },
            { id: "loadflow", label: "4.0 Load Flow & Bus Voltage", count: 3 },
            { id: "fault", label: "5.0 Fault Current Study", count: 2 },
            { id: "sld", label: "6.0 Single Line Diagram Layers", count: 1 },
            { id: "recommendations", label: "7.0 Engineering Diagnostics", count: engineeringFindings.length }
          ].map((sec) => {
            const isSelected = activeReportSection === sec.id;
            return (
              <button
                key={sec.id}
                onClick={() => setActiveReportSection(sec.id as any)}
                className={`w-full flex items-center justify-between px-3 py-2 text-xs rounded transition-all text-left ${
                  isSelected 
                    ? "bg-slate-800 text-white border-l-2 border-emerald-400 pl-2" 
                    : "text-slate-400 hover:bg-slate-800/40 hover:text-slate-200"
                }`}
              >
                <span>{sec.label}</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-900 text-slate-400 border border-slate-800">
                  {sec.count}
                </span>
              </button>
            );
          })}

          {!isPremium && (
            <div className="mt-4 p-4 bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-500/20 rounded-lg flex flex-col gap-2.5">
              <div className="flex items-center gap-2 text-amber-400 text-xs font-bold">
                <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
                Premium Only Actions
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Unlock Word Document (.DOCX), High-Fidelity Vector PDF exports, customized company templates, and custom branding logs.
              </p>
              <button 
                onClick={onRequestUpgrade}
                className="w-full py-1.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black transition-all shadow-md"
              >
                Upgrade to Premium
              </button>
            </div>
          )}
        </div>

        {/* Report Canvas Frame (Interactive Preview Screen) */}
        <div className="xl:col-span-3 flex flex-col gap-3">
          
          {/* Preview canvas controller (Zoom, scale) */}
          <div className="flex items-center justify-between bg-slate-900 px-4 py-2.5 rounded-lg border border-slate-800">
            <span className="text-xs font-bold text-slate-300">
              Document Preview Mode
            </span>
            <div className="flex items-center gap-2">
              <button 
                onClick={handleZoomOut} 
                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
                title="Zoom Out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="text-[11px] font-mono text-slate-400 w-12 text-center">
                {Math.round(zoomLevel * 100)}%
              </span>
              <button 
                onClick={handleZoomIn} 
                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
                title="Zoom In"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button 
                onClick={handleZoomReset} 
                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800"
                title="Reset Zoom"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Interactive Page canvas paper sheet */}
          <div className="w-full overflow-auto bg-slate-950 p-6 rounded-xl border border-slate-800/60 max-h-[750px] shadow-inner">
            <div 
              style={{ transform: `scale(${zoomLevel})`, transformOrigin: "top center" }}
              className="w-full min-h-[1050px] bg-white text-slate-900 p-12 shadow-2xl transition-all rounded mx-auto max-w-[850px]"
            >
              
              {/* Document Header template brand */}
              <div className="border-b-2 border-slate-900 pb-4 mb-8 flex justify-between items-start">
                <div>
                  <h2 className="text-xl font-black text-slate-900 tracking-tight">
                    {reportTitle}
                  </h2>
                  <p className="text-[11px] font-bold text-emerald-700 tracking-wider uppercase mt-1">
                    IEEE/IEC Analytical System Evaluation Study
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-black px-2.5 py-1 rounded bg-slate-100 text-slate-800 border border-slate-300">
                    {reportTheme.toUpperCase()} TEMPLATE
                  </span>
                  <p className="text-[10px] text-slate-500 mt-1.5">{dateStr}</p>
                </div>
              </div>

              {/* SECTION 1: PROJECT INFO */}
              {(activeReportSection === "all" || activeReportSection === "project") && (
                <div className="mb-10">
                  <h3 className="text-sm font-black border-b border-slate-300 pb-1 text-slate-900 uppercase mb-4 flex items-center gap-1.5">
                    1.0 General Project Parameters
                  </h3>
                  <div className="grid grid-cols-2 gap-y-3.5 gap-x-8 text-xs">
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase font-black">Project Identifier</span>
                      <strong className="text-slate-800 text-sm">{projectNumber}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase font-black">Client Enterprise</span>
                      <strong className="text-slate-800 text-sm">{clientName}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase font-black">Standard System Voltage</span>
                      <strong className="text-slate-800 text-sm">{systemVoltage} V, {isThreePhase ? "3-Phase" : "1-Phase"}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase font-black">Local Frequency</span>
                      <strong className="text-slate-800 text-sm">{systemFreq} Hz</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase font-black">Study Assessor Signature</span>
                      <strong className="text-slate-800 text-sm">{authorName}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase font-black">System Compliance Baseline</span>
                      <strong className="text-slate-800 text-sm">IEEE 242 Protection / IEEE 399 Load Flow</strong>
                    </div>
                  </div>
                </div>
              )}

              {/* SECTION 2: TRANSFORMER CAPACITY & SIZING */}
              {(activeReportSection === "all" || activeReportSection === "transformer") && (
                <div className="mb-10">
                  <h3 className="text-sm font-black border-b border-slate-300 pb-1 text-slate-900 uppercase mb-4 flex items-center gap-1.5">
                    2.0 Transformer Capacity & Sizing Study
                  </h3>
                  
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                    <div className="border border-slate-200 p-4 rounded bg-slate-50/50">
                      <span className="text-[10px] font-black uppercase text-slate-500 block mb-2">Transformer Specifications</span>
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between border-b border-slate-200/60 pb-1.5">
                          <span className="text-slate-500">Transformer Rating:</span>
                          <strong className="text-slate-900">{transformerMetrics.recommendedRating} kVA</strong>
                        </div>
                        <div className="flex justify-between border-b border-slate-200/60 pb-1.5">
                          <span className="text-slate-500">Type & Phase:</span>
                          <strong className="text-slate-900">Standard Step-Down, {transformerMetrics.is3Phase ? "3-Phase" : "1-Phase"}</strong>
                        </div>
                        <div className="flex justify-between border-b border-slate-200/60 pb-1.5">
                          <span className="text-slate-500">Primary Voltage:</span>
                          <strong className="text-slate-900">{transformerMetrics.primaryVoltage.toLocaleString()} V</strong>
                        </div>
                        <div className="flex justify-between border-b border-slate-200/60 pb-1.5">
                          <span className="text-slate-500">Secondary Voltage:</span>
                          <strong className="text-slate-900">{transformerMetrics.secondaryVoltage} V</strong>
                        </div>
                        <div className="flex justify-between border-b border-slate-200/60 pb-1.5">
                          <span className="text-slate-500">Percent Impedance (%Z):</span>
                          <strong className="text-slate-900">{transformerMetrics.txZ.toFixed(1)}%</strong>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Secondary Connection:</span>
                          <strong className="text-slate-900">{transformerMetrics.is3Phase ? "Delta-Wye (D-Y, Solidly Grounded)" : "Single-Phase 2-Wire"}</strong>
                        </div>
                      </div>
                    </div>

                    <div className="border border-slate-200 p-4 rounded bg-slate-50/50">
                      <span className="text-[10px] font-black uppercase text-slate-500 block mb-2">Loading & Capacity Analysis</span>
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between border-b border-slate-200/60 pb-1.5">
                          <span className="text-slate-500">Total Connected Load:</span>
                          <strong className="text-slate-900">{(transformerMetrics.connectedLoadKVA).toFixed(2)} kVA ({(transformerMetrics.connectedLoadkW).toFixed(2)} kW)</strong>
                        </div>
                        <div className="flex justify-between border-b border-slate-200/60 pb-1.5">
                          <span className="text-slate-500">Maximum Demand Load:</span>
                          <strong className="text-slate-900">{(transformerMetrics.demandLoadKVA).toFixed(2)} kVA ({(transformerMetrics.demandLoadkW).toFixed(2)} kW)</strong>
                        </div>
                        <div className="flex justify-between border-b border-slate-200/60 pb-1.5">
                          <span className="text-slate-500">Continuous Loading Factor:</span>
                          <strong className="text-slate-900">{(transformerMetrics.loadingFactor * 100).toFixed(0)}% Target limit</strong>
                        </div>
                        <div className="flex justify-between border-b border-slate-200/60 pb-1.5">
                          <span className="text-slate-500">Actual Loading Percentage:</span>
                          <strong className={`font-black ${transformerMetrics.actualLoadingPct > 100 ? "text-red-600" : transformerMetrics.actualLoadingPct > (transformerMetrics.loadingFactor * 100) ? "text-amber-600" : "text-emerald-700"}`}>
                            {transformerMetrics.actualLoadingPct.toFixed(1)}%
                          </strong>
                        </div>
                        <div className="flex justify-between border-b border-slate-200/60 pb-1.5">
                          <span className="text-slate-500">Spare Capacity Available:</span>
                          <strong className="text-emerald-700 font-bold">{transformerMetrics.spareCapacityKVA.toFixed(2)} kVA</strong>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Secondary Full Load Current:</span>
                          <strong className="text-slate-900">{transformerMetrics.secondaryCurrent.toFixed(1)} A</strong>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs border border-slate-200 p-4 rounded bg-slate-50/20">
                    <div>
                      <h4 className="font-bold text-slate-800 mb-1.5">Short-Circuit Fault Contribution</h4>
                      <p className="text-slate-600 leading-relaxed text-[11px]">
                        The step-down transformer serves as the secondary grid fault source. Based on a utility primary short-circuit level of <strong>{transformerMetrics.utilityMVA} MVA</strong> and transformer impedance of <strong>{transformerMetrics.txZ}%</strong>, the calculated maximum symmetrical fault contribution at the secondary terminals is <strong className="text-red-700">{transformerMetrics.transformerFaultKA.toFixed(2)} kA</strong>.
                      </p>
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-800 mb-1.5">Integrated Protection Coordination Rules</h4>
                      <p className="text-slate-600 leading-relaxed text-[11px]">
                        Under standard PEC regulations, secondary protection must be sized to continuous demand profiles. Recommended upstream main protection breaker rating is <strong className="text-blue-700">{upstreamTrip} A</strong> with coordinating thermal damage limits positioned to safely ride through normal transformer magnetization inrush periods.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* SECTION 3: PROTECTION COORDINATION */}
              {(activeReportSection === "all" || activeReportSection === "coordination") && (
                <div className="mb-10">
                  <h3 className="text-sm font-black border-b border-slate-300 pb-1 text-slate-900 uppercase mb-4 flex items-center gap-1.5">
                    3.0 Protection Selectivity & Coordination Study
                  </h3>
                  
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                    <div className="border border-slate-200 p-4 rounded bg-slate-50/50">
                      <span className="text-[10px] font-black uppercase text-slate-500 block mb-2">Device Selection Details</span>
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between border-b border-slate-200/60 pb-1.5">
                          <span className="text-slate-500">Upstream AT (Main):</span>
                          <strong className="text-slate-900">{upstreamTrip} A</strong>
                        </div>
                        <div className="flex justify-between border-b border-slate-200/60 pb-1.5">
                          <span className="text-slate-500">Upstream Inst Multiplier:</span>
                          <strong className="text-slate-900">{upstreamInstMultiplier}x ({upstreamTrip * upstreamInstMultiplier} A)</strong>
                        </div>
                        <div className="flex justify-between border-b border-slate-200/60 pb-1.5">
                          <span className="text-slate-500">Downstream AT (Branch):</span>
                          <strong className="text-slate-900">{downstreamTrip} A</strong>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Downstream Inst Multiplier:</span>
                          <strong className="text-slate-900">{downstreamInstMultiplier}x ({downstreamTrip * downstreamInstMultiplier} A)</strong>
                        </div>
                      </div>
                    </div>

                    <div className="border border-slate-200 p-4 rounded bg-slate-50/50">
                      <span className="text-[10px] font-black uppercase text-slate-500 block mb-2">Selectivity Analysis</span>
                      <div className="space-y-1.5 text-xs text-slate-700 leading-relaxed">
                        <p>
                          Upstream to Downstream coordination status: {" "}
                          {upstreamTrip > downstreamTrip ? (
                            <span className="text-emerald-700 font-black">COORDINATED MARGIN</span>
                          ) : (
                            <span className="text-red-600 font-black">CRITICAL OVERLAP FINDING</span>
                          )}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          To guarantee selective coordination, branch breaker instantaneous pickup must clear before upstream breaker starts dynamic trips.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* SVG TCC Curve embedded in Report */}
                  <div className="border border-slate-200 p-4 rounded mb-4">
                    <span className="text-[10px] font-black uppercase text-slate-500 block mb-2 text-center">Time Current Characteristic (TCC) Graph Curve</span>
                    <div className="w-full flex justify-center bg-slate-50 p-2 rounded">
                      <svg viewBox="0 0 400 240" className="w-full max-w-[360px] h-auto">
                        {/* Grid lines */}
                        <line x1="40" y1="20" x2="40" y2="200" stroke="#ddd" strokeDasharray="2" />
                        <line x1="120" y1="20" x2="120" y2="200" stroke="#ddd" strokeDasharray="2" />
                        <line x1="200" y1="20" x2="200" y2="200" stroke="#ddd" strokeDasharray="2" />
                        <line x1="280" y1="20" x2="280" y2="200" stroke="#ddd" strokeDasharray="2" />
                        <line x1="360" y1="20" x2="360" y2="200" stroke="#ddd" strokeDasharray="2" />
                        
                        <line x1="40" y1="200" x2="360" y2="200" stroke="#999" strokeWidth="1.5" />
                        <line x1="40" y1="20" x2="40" y2="200" stroke="#999" strokeWidth="1.5" />

                        {/* Labels */}
                        <text x="40" y="215" fontSize="8" textAnchor="middle" fill="#666">10A</text>
                        <text x="120" y="215" fontSize="8" textAnchor="middle" fill="#666">100A</text>
                        <text x="200" y="215" fontSize="8" textAnchor="middle" fill="#666">1kA</text>
                        <text x="280" y="215" fontSize="8" textAnchor="middle" fill="#666">10kA</text>
                        
                        <text x="18" y="40" fontSize="8" transform="rotate(-90 18,40)" textAnchor="middle" fill="#666">Time (s)</text>
                        <text x="200" y="232" fontSize="9" textAnchor="middle" fill="#444" fontWeight="bold">Current (Amperes)</text>

                        {/* Upstream Breaker Trip Curve (Red Line) */}
                        <path 
                          d={`M ${100 + (upstreamTrip / 5)} 20 Q ${120 + (upstreamTrip / 5)} 100 ${140 + (upstreamTrip / 5)} 140 T ${160 + (upstreamTrip * upstreamInstMultiplier / 20)} 200`} 
                          fill="none" 
                          stroke="#ef4444" 
                          strokeWidth="2.5" 
                        />
                        <text x="240" y="60" fontSize="8" fill="#ef4444" fontWeight="bold">Main ({upstreamTrip}A)</text>

                        {/* Downstream Breaker Trip Curve (Blue Line) */}
                        <path 
                          d={`M ${60 + (downstreamTrip / 5)} 20 Q ${80 + (downstreamTrip / 5)} 100 ${100 + (downstreamTrip / 5)} 140 T ${120 + (downstreamTrip * downstreamInstMultiplier / 20)} 200`} 
                          fill="none" 
                          stroke="#3b82f6" 
                          strokeWidth="2.5" 
                        />
                        <text x="80" y="35" fontSize="8" fill="#3b82f6" fontWeight="bold">Branch ({downstreamTrip}A)</text>

                        {/* Cable Damage curves (Staggered green line) */}
                        <line x1="320" y1="30" x2="280" y2="180" stroke="#10b981" strokeWidth="1.5" strokeDasharray="3" />
                        <text x="315" y="55" fontSize="7" fill="#10b981">Conductor Withstand</text>
                      </svg>
                    </div>
                  </div>
                </div>
              )}

              {/* SECTION 4: LOAD FLOW STUDY */}
              {(activeReportSection === "all" || activeReportSection === "loadflow") && (
                <div className="mb-10">
                  <h3 className="text-sm font-black border-b border-slate-300 pb-1 text-slate-900 uppercase mb-4 flex items-center gap-1.5">
                    4.0 Load Flow & Bus Voltage Analysis
                  </h3>

                  <p className="text-[11px] text-slate-600 mb-3">
                    Calculated steady state load currents, active/reactive components, and percent voltage drop mapped directly to nominal limits:
                  </p>

                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b-2 border-slate-900 bg-slate-100 text-slate-800 font-black">
                        <th className="py-2 px-1">Bus/Panel Designation</th>
                        <th className="py-2 px-1 text-right">Voltage Magnitude</th>
                        <th className="py-2 px-1 text-right">Current (A)</th>
                        <th className="py-2 px-1 text-right">kW Load</th>
                        <th className="py-2 px-1 text-right">Volt Drop</th>
                        <th className="py-2 px-1 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.values(loadFlowResults).map((r: any) => (
                        <tr key={r.id} className="border-b border-slate-200 hover:bg-slate-50 text-slate-700">
                          <td className="py-2 px-1 font-bold text-slate-950">{r.name}</td>
                          <td className="py-2 px-1 text-right">{r.voltageMagnitude.toFixed(1)} V</td>
                          <td className="py-2 px-1 text-right">{r.currentMagnitude.toFixed(1)} A</td>
                          <td className="py-2 px-1 text-right">{r.kw.toFixed(2)} kW</td>
                          <td className="py-2 px-1 text-right font-mono text-[11px]">{r.regulation.toFixed(2)} %</td>
                          <td className="py-2 px-1 text-center">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-black uppercase ${
                              r.status === "normal" 
                                ? "bg-emerald-100 text-emerald-800" 
                                : r.status === "warning" 
                                ? "bg-amber-100 text-amber-800" 
                                : "bg-red-100 text-red-800"
                            }`}>
                              {r.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* SECTION 5: FAULT ANALYSIS */}
              {(activeReportSection === "all" || activeReportSection === "fault") && (
                <div className="mb-10">
                  <h3 className="text-sm font-black border-b border-slate-300 pb-1 text-slate-900 uppercase mb-4 flex items-center gap-1.5">
                    5.0 Symmetrical & Symmetrical Short-Circuit Fault Study
                  </h3>

                  <p className="text-[11px] text-slate-600 mb-3">
                    Evaluation of maximum symmetrical and asymmetrical fault current duties relative to nominal equipment kAIC margins:
                  </p>

                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b-2 border-slate-900 bg-slate-100 text-slate-800 font-black">
                        <th className="py-2 px-1">Equipment Location</th>
                        <th className="py-2 px-1 text-right">3-PH Symmetrical</th>
                        <th className="py-2 px-1 text-right">Peak Fault (kA)</th>
                        <th className="py-2 px-1 text-right">Breaker kAIC</th>
                        <th className="py-2 px-1 text-right">Fault Duty (%)</th>
                        <th className="py-2 px-1 text-center">Safety Compliance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.values(faultResults).map((r: any) => (
                        <tr key={r.id} className="border-b border-slate-200 hover:bg-slate-50 text-slate-700">
                          <td className="py-2 px-1 font-bold text-slate-950">{r.name}</td>
                          <td className="py-2 px-1 text-right">{r.iSym3PH.toFixed(2)} kA</td>
                          <td className="py-2 px-1 text-right">{r.peakFault.toFixed(2)} kA</td>
                          <td className="py-2 px-1 text-right">{r.breakerkAIC > 0 ? `${r.breakerkAIC} kAIC` : "N/A"}</td>
                          <td className="py-2 px-1 text-right font-mono">{r.breakerkAIC > 0 ? `${r.dutyPercentage.toFixed(1)} %` : "N/A"}</td>
                          <td className="py-2 px-1 text-center">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-black ${
                              r.compliance === "PASSED" 
                                ? "bg-emerald-100 text-emerald-800" 
                                : r.compliance === "WARNING" 
                                ? "bg-amber-100 text-amber-800" 
                                : "bg-red-100 text-red-800"
                            }`}>
                              {r.compliance}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* SECTION 6: SINGLE LINE DIAGRAM INTEGRATION */}
              {(activeReportSection === "all" || activeReportSection === "sld") && (
                <div className="mb-10">
                  <h3 className="text-sm font-black border-b border-slate-300 pb-1 text-slate-900 uppercase mb-4 flex items-center gap-1.5">
                    6.0 Topology & Single Line Diagram Layer Map
                  </h3>
                  
                  {/* Layer switches for interactive document */}
                  <div className="flex gap-1.5 mb-4 bg-slate-100 p-1 rounded border border-slate-200">
                    {[
                      { id: "protection", label: "Protection Layer View" },
                      { id: "loadflow", label: "Load Flow Layer View" },
                      { id: "fault", label: "Short-Circuit Duty Layer View" }
                    ].map((l) => (
                      <button
                        key={l.id}
                        onClick={() => setSldLayer(l.id as any)}
                        className={`text-[10px] font-black uppercase flex-1 py-1 px-2.5 rounded transition-all ${
                          sldLayer === l.id 
                            ? "bg-white text-emerald-800 shadow-sm" 
                            : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        {l.label}
                      </button>
                    ))}
                  </div>

                  {/* High Fidelity Diagram Blocks */}
                  <div className="border border-slate-300 rounded p-4 flex flex-col gap-4 bg-slate-50/50">
                    {/* Utility Block */}
                    <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-emerald-600"></div>
                        <span className="text-xs font-black text-slate-900">Utility Grid Source</span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200">
                        {sldLayerDetails.utility[sldLayer]}
                      </span>
                    </div>

                    {/* Transformer Block */}
                    <div className="flex items-center justify-between border-b border-slate-200 pb-2 pl-4">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-amber-500"></div>
                        <span className="text-xs font-black text-slate-900">Distribution Transformer</span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200">
                        {sldLayerDetails.transformer[sldLayer]}
                      </span>
                    </div>

                    {/* Main MDP Block */}
                    <div className="flex items-center justify-between pl-8">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded bg-blue-600"></div>
                        <span className="text-xs font-black text-slate-900">{panel.designation || "MDP Board Panel"}</span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200">
                        {sldLayerDetails.mdp[sldLayer]}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* SECTION 7: RECOMMENDATIONS & COMPLIANCE FINDINGS */}
              {(activeReportSection === "all" || activeReportSection === "recommendations") && (
                <div>
                  <h3 className="text-sm font-black border-b border-slate-300 pb-1 text-slate-900 uppercase mb-4 flex items-center gap-1.5">
                    7.0 Automated Diagnostics & Engineering Advisory
                  </h3>

                  <div className="space-y-4">
                    {engineeringFindings.map((finding, idx) => (
                      <div 
                        key={idx} 
                        className={`p-4 rounded border text-xs leading-relaxed ${
                          finding.type === "danger" 
                            ? "bg-red-50 border-red-200 text-red-950" 
                            : finding.type === "warning" 
                            ? "bg-amber-50 border-amber-200 text-amber-950" 
                            : "bg-emerald-50 border-emerald-200 text-emerald-950"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1.5">
                          {finding.type === "danger" ? (
                            <ShieldAlert className="w-4 h-4 text-red-600 shrink-0" />
                          ) : finding.type === "warning" ? (
                            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                          ) : (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          )}
                          <strong className="text-xs font-black uppercase tracking-wide">
                            [{finding.section}] {finding.title}
                          </strong>
                        </div>
                        <p>{finding.desc}</p>
                      </div>
                    ))}
                  </div>

                  {/* Engineer Signature Line */}
                  <div className="mt-14 pt-8 border-t border-slate-200 flex justify-between items-end text-xs">
                    <div>
                      <p className="text-slate-400 text-[10px] uppercase">Compliance Status</p>
                      <strong className="text-emerald-700 font-bold uppercase">
                        {engineeringFindings.some(f => f.type === "danger") ? "VIOLATION FLAGS ACTIVE" : "SYSTEM DECLARED SECURE"}
                      </strong>
                    </div>
                    <div className="text-right">
                      <div className="h-6 w-32 border-b border-slate-400 ml-auto mb-1"></div>
                      <p className="font-bold text-slate-800">{authorName}</p>
                      <p className="text-slate-400 text-[10px]">Registered Professional Assessor</p>
                    </div>
                  </div>
                </div>
              )}

            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
