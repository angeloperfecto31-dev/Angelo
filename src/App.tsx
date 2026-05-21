import React, { useState, useEffect } from "react";
import { auth, db } from "./firebase";
import { onAuthStateChanged, User, signOut } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { handleFirestoreError, OperationType } from "./utils/firestoreError";
import LoginScreen from "./components/LoginScreen";
import PaymentScreen from "./components/PaymentScreen";
import {
  Zap,
  Layout,
  ShieldAlert,
  Ruler,
  Lightbulb,
  FileSpreadsheet,
  FileText,
  Plus,
  Map,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import * as XLSX from "xlsx-js-style";
import LoadSchedule, {
  INITIAL_CIRCUITS,
  INITIAL_PANEL,
} from "./components/LoadSchedule";
import ShortCircuitCalc from "./components/ShortCircuitCalc";
import VoltageDropCalc from "./components/VoltageDropCalc";
import IlluminationCalc from "./components/IlluminationCalc";
import FloorPlanUploader from "./components/FloorPlanUploader";
import {
  Circuit,
  PanelConfig,
  ShortCircuitParams,
  VoltageDropCalculation,
  IlluminationParams,
} from "./types";
import {
  STANDARD_CB_RATINGS,
  WIRE_AMPACITY_TABLE,
  INITIAL_SHORT_CIRCUIT_PARAMS,
  INITIAL_VOLTAGE_DROP_CALCULATIONS,
  INITIAL_ILLUMINATION_PARAMS,
} from "./constants";
import { exportToWord } from "./utils/exportWord";

import { toPng } from "html-to-image";
import { Auth } from "./components/Auth";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    // Determine if we should sign out (first time this instance runs)
    if (!window.sessionStorage.getItem("hasRunBefore")) {
      window.sessionStorage.setItem("hasRunBefore", "true");
      signOut(auth).catch(console.error);
    }

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        setIsActive(false);
        setAuthLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    // Listen to user document in Firestore to check active status
    const unsubscribe = onSnapshot(
      doc(db, "users", user.uid),
      (docSnap) => {
        if (docSnap.exists() && docSnap.data().isActive === true) {
          setIsActive(true);
        } else {
          setIsActive(false);
        }
        setAuthLoading(false);
      },
      (error) => {
        console.error("Firestore listener error:", error);
        setIsActive(false);
        setAuthLoading(false);
        try {
          handleFirestoreError(error, OperationType.GET, "users/" + user.uid);
        } catch (e) {
          // Keep the error from breaking state, but ensure it's reported
        }
      },
    );

    return () => unsubscribe();
  }, [user]);

  const [activeTab, setActiveTab] = useState<
    "schedule" | "isc" | "vd" | "lighting" | "floor-plan"
  >("schedule");
  const [panel, setPanel] = useState<PanelConfig>(INITIAL_PANEL);
  const [circuits, setCircuits] = useState<Circuit[]>(INITIAL_CIRCUITS);
  const [subPanels, setSubPanels] = useState<
    { id: string; panel: PanelConfig; circuits: Circuit[] }[]
  >([]);

  // State for calculators to prevent reset on tab change
  const [iscParams, setIscParams] = useState<ShortCircuitParams>(
    INITIAL_SHORT_CIRCUIT_PARAMS,
  );
  const [iscSource, setIscSource] = useState<string>("custom");

  const [vdCalculations, setVdCalculations] = useState<
    VoltageDropCalculation[]
  >(INITIAL_VOLTAGE_DROP_CALCULATIONS);

  const [illumParams, setIllumParams] = useState<IlluminationParams>(
    INITIAL_ILLUMINATION_PARAMS,
  );

  const [floorPlanImages, setFloorPlanImages] = useState<string[]>([]);

  // If redirecting back from PayMongo, don't show the login or app, let PaymentScreen handle it
  const isPostPaymentRedirect = window.location.search.includes("session_id=");

  if (authLoading || (!user && isPostPaymentRedirect)) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
          {isPostPaymentRedirect && (
            <span className="text-slate-600 font-bold">
              Verifying your payment...
            </span>
          )}
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  if (!isActive) {
    return <PaymentScreen user={user} />;
  }

  const tabs = [
    {
      id: "schedule",
      label: "Load Schedule",
      icon: Layout,
      color: "text-indigo-600",
      bg: "bg-indigo-50",
    },
    {
      id: "isc",
      label: "Short Circuit",
      icon: ShieldAlert,
      color: "text-red-600",
      bg: "bg-red-50",
    },
    {
      id: "vd",
      label: "Voltage Drop",
      icon: Ruler,
      color: "text-green-600",
      bg: "bg-green-50",
    },
    {
      id: "lighting",
      label: "Illumination",
      icon: Lightbulb,
      color: "text-yellow-500",
      bg: "bg-yellow-50",
    },
    {
      id: "floor-plan",
      label: "Floor Plan",
      icon: Map,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
    },
  ];

  const exportToExcel = () => {
    const wb = XLSX.utils.book_new();

    const allPanelsToExport = [
      { panel, circuits },
      ...subPanels.map((sp) => ({ panel: sp.panel, circuits: sp.circuits })),
    ];

    allPanelsToExport.forEach((item, index) => {
      const { panel: p, circuits: c } = item;

      const totalVA = c.reduce((sum, curr) => sum + curr.loadVA, 0);

      let mainCurrent = 0;
      if (p.system.includes("3PH")) {
        const loads = { R: 0, Y: 0, B: 0 };
        c.forEach((cir) => {
          cir.phases.forEach((ph) => {
            loads[ph as keyof typeof loads] += cir.loadVA / cir.phases.length;
          });
        });
        const maxPhaseVA = Math.max(loads.R, loads.Y, loads.B);
        mainCurrent = (maxPhaseVA * 3) / (p.voltage * Math.sqrt(3));
      } else {
        mainCurrent = totalVA / p.voltage;
      }

      const designAmp = mainCurrent * 1.25;
      const cb = STANDARD_CB_RATINGS.find((r) => r >= designAmp) || 100;

      let minSize = 2.0;
      if (cb > 15 && cb <= 20) minSize = 3.5;
      else if (cb > 20 && cb <= 30) minSize = 5.5;
      const requiredAmpacity = Math.max(designAmp, cb);
      const wire =
        WIRE_AMPACITY_TABLE.find(
          (w) => w.ampacity >= requiredAmpacity && w.size >= minSize,
        ) || WIRE_AMPACITY_TABLE[WIRE_AMPACITY_TABLE.length - 1];

      const wireSizeForGnd = wire.size;
      const wireAmpacity =
        WIRE_AMPACITY_TABLE.find((w) => w.size === wireSizeForGnd)?.ampacity ||
        20;

      let egcSize = 2.0;
      if (wireAmpacity <= 15) egcSize = 2.0;
      else if (wireAmpacity <= 20) egcSize = 3.5;
      else if (wireAmpacity <= 30) egcSize = 5.5;
      else if (wireAmpacity <= 40) egcSize = 8.0;
      else if (wireAmpacity <= 60) egcSize = 14;
      else if (wireAmpacity <= 100) egcSize = 22;
      else if (wireAmpacity <= 200) egcSize = 30;
      else if (wireAmpacity <= 300) egcSize = 38;
      else if (wireAmpacity <= 400) egcSize = 50;
      else if (wireAmpacity <= 500) egcSize = 60;
      else if (wireAmpacity <= 600) egcSize = 80;
      else if (wireAmpacity <= 800) egcSize = 100;
      else if (wireAmpacity <= 1000) egcSize = 125;
      else if (wireAmpacity <= 1200) egcSize = 150;
      else egcSize = 200;

      const actualGndSize = Math.min(egcSize, wireSizeForGnd);
      const formatWireSize = (size: number): string =>
        size <= 8 ? size.toFixed(1) : size.toString();
      const groundSize = formatWireSize(actualGndSize);

      let conduitSize = "15mm";
      if (wire.size <= 5.5) conduitSize = "15mm";
      else if (wire.size <= 14) conduitSize = "20mm";
      else if (wire.size <= 22) conduitSize = "25mm";
      else if (wire.size <= 38) conduitSize = "32mm";
      else if (wire.size <= 60) conduitSize = "40mm";
      else if (wire.size <= 100) conduitSize = "50mm";
      else if (wire.size <= 200) conduitSize = "65mm";
      else conduitSize = "80mm";

      const loads = { R: 0, Y: 0, B: 0 };
      c.forEach((cir) => {
        cir.phases.forEach((ph) => {
          loads[ph as keyof typeof loads] += cir.loadVA / cir.phases.length;
        });
      });
      const maxPhaseLoad = Math.max(loads.R, loads.Y, loads.B);
      const phaseImbalance =
        maxPhaseLoad > 0
          ? (1 - Math.min(loads.R, loads.Y, loads.B) / maxPhaseLoad) * 100
          : 0;

      const wsData: any[][] = [];
      wsData.push(["PROJECT:", p.project, "", "SYSTEM:", p.system]);
      wsData.push([
        "PANEL DESIGNATION:",
        p.designation,
        "",
        "VOLTAGE:",
        p.voltage,
      ]);
      wsData.push([]);
      const headers = ["NO.", "DESCRIPTION", "W", "QTY", "VA", "PHASE"];
      if (p.system.includes("3PH")) {
        headers.push("AMPS", "", "");
      } else {
        headers.push("AMPS");
      }
      headers.push("AT", "AF", "P", "KAIC", "TYPE", "WIRE / GND / CONDUIT");
      wsData.push(headers);

      if (p.system.includes("3PH")) {
        wsData.push([
          "",
          "",
          "",
          "",
          "",
          "",
          "AB",
          "BC",
          "CA",
          "",
          "",
          "",
          "",
          "",
          "",
        ]);
      }

      c.forEach((cir) => {
        const row: any[] = [
          cir.circuitNo,
          cir.description,
          cir.wattage,
          cir.quantity,
          cir.loadVA,
          cir.phases ? cir.phases.join(", ") : "",
        ];

        if (p.system.includes("3PH")) {
          row.push(
            cir.phases.includes("R") ? cir.loadA.toFixed(2) : "-",
            cir.phases.includes("Y") ? cir.loadA.toFixed(2) : "-",
            cir.phases.includes("B") ? cir.loadA.toFixed(2) : "-",
          );
        } else {
          row.push(cir.loadA.toFixed(2));
        }

        row.push(
          cir.mcbAT,
          cir.mcbAF,
          cir.mcbP,
          cir.mcbKAIC,
          cir.mcbType,
          `${cir.wireSize}mm² ${cir.wireType} / ${cir.groundSize}mm² GND in ${cir.conduitSize} ${cir.conduitType}`,
        );
        wsData.push(row);
      });

      const is3Phase = p.system.includes("3PH");
      const headerRowOffset = is3Phase ? 1 : 0;

      wsData.push([]);
      const baseTotalRow: any[] = [
        "",
        "",
        "",
        "Total Connected Load",
        `${totalVA.toFixed(0)} VA`,
        "",
      ];
      if (is3Phase) {
        const amps = { R: 0, Y: 0, B: 0 };
        c.forEach((cir) => {
          if (cir.phases.includes("R")) amps.R += cir.loadA;
          if (cir.phases.includes("Y")) amps.Y += cir.loadA;
          if (cir.phases.includes("B")) amps.B += cir.loadA;
        });
        baseTotalRow.push(
          `${amps.R.toFixed(2)} A`,
          `${amps.Y.toFixed(2)} A`,
          `${amps.B.toFixed(2)} A`,
        );
      } else {
        baseTotalRow.push(`${mainCurrent.toFixed(2)} A`);
      }
      wsData.push(baseTotalRow);
      wsData.push([
        "",
        "",
        "",
        "Total kVA",
        `${(totalVA / 1000).toFixed(2)} kVA`,
      ]);

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
      const poles = is3Phase ? 3 : 2;

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

      wsData.push([]);
      wsData.push(["SUMMARY & MAIN FEEDER"]);
      wsData.push([
        "Main Feeder:",
        `${formatWireSize(wire.size)}mm² THHN, ${groundSize}mm² GND in ${conduitSize} PVC`,
      ]);
      wsData.push([
        "Main Breaker:",
        `${cb}A AT / ${cbAF}AF, ${poles}P, ${kaic}kAIC, ${type}`,
      ]);
      wsData.push(["Phase Imbalance:", `${phaseImbalance.toFixed(2)}%`]);

      const ws = XLSX.utils.aoa_to_sheet(wsData);

      const merges = [];
      if (is3Phase) {
        merges.push({ s: { r: 3, c: 0 }, e: { r: 4, c: 0 } });
        merges.push({ s: { r: 3, c: 1 }, e: { r: 4, c: 1 } });
        merges.push({ s: { r: 3, c: 2 }, e: { r: 4, c: 2 } });
        merges.push({ s: { r: 3, c: 3 }, e: { r: 4, c: 3 } });
        merges.push({ s: { r: 3, c: 4 }, e: { r: 4, c: 4 } });
        merges.push({ s: { r: 3, c: 5 }, e: { r: 4, c: 5 } });
        merges.push({ s: { r: 3, c: 6 }, e: { r: 3, c: 8 } });
        merges.push({ s: { r: 3, c: 9 }, e: { r: 4, c: 9 } });
        merges.push({ s: { r: 3, c: 10 }, e: { r: 4, c: 10 } });
        merges.push({ s: { r: 3, c: 11 }, e: { r: 4, c: 11 } });
        merges.push({ s: { r: 3, c: 12 }, e: { r: 4, c: 12 } });
        merges.push({ s: { r: 3, c: 13 }, e: { r: 4, c: 13 } });
        merges.push({ s: { r: 3, c: 14 }, e: { r: 4, c: 14 } });
      }
      if (merges.length > 0) {
        ws["!merges"] = merges;
      }

      const wscols: any[] = [];
      const numCols = is3Phase ? 15 : 13;
      for (let col = 0; col < numCols; col++) {
        let maxLen = 0;
        wsData.forEach((row) => {
          if (row[col] !== undefined && row[col] !== null) {
            const valLen = row[col].toString().length;
            if (valLen > maxLen) {
              maxLen = valLen;
            }
          }
        });
        wscols.push({ wch: Math.max(5, maxLen + 2) });
      }
      ws["!cols"] = wscols;

      const range = XLSX.utils.decode_range(ws["!ref"] || "A1:A1");
      for (let R = range.s.r; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
          const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
          if (!ws[cellAddress]) ws[cellAddress] = { t: "s", v: "" };

          let style: any = {
            font: { name: "Arial", sz: 10, color: { rgb: "000000" } },
            fill: { fgColor: { rgb: "FFFFFF" } },
          };

          if (R === 0 || R === 1) {
            style.font.bold = true;
            style.fill.fgColor.rgb = "F3F4F6";
          } else if (R >= 3 && R <= 3 + headerRowOffset) {
            style.font.bold = true;
            style.font.color = { rgb: "FFFFFF" };
            style.fill.fgColor.rgb = "000000";
            style.alignment = { horizontal: "center", vertical: "center" };
            style.border = {
              bottom: { style: "medium", color: { rgb: "000000" } },
              top: { style: "medium", color: { rgb: "000000" } },
              left: { style: "thin", color: { rgb: "333333" } },
              right: { style: "thin", color: { rgb: "333333" } },
            };
          } else if (
            R >= 4 + headerRowOffset &&
            R < 4 + headerRowOffset + c.length
          ) {
            style.border = {
              bottom: { style: "thin", color: { rgb: "CCCCCC" } },
            };
            if (R % 2 !== 0) {
              style.fill.fgColor.rgb = "F9FAFB";
            }
            if (C !== 1) {
              style.alignment = { horizontal: "center" };
            }
          } else if (R === 4 + headerRowOffset + c.length + 1) {
            style.font.bold = true;
            style.fill.fgColor.rgb = "000000";
            style.font.color = { rgb: "FFFFFF" };
          } else if (R === 4 + headerRowOffset + c.length + 2) {
            style.font.bold = true;
            style.fill.fgColor.rgb = "000000";
            style.font.color = { rgb: "FFFFFF" };
          } else if (R >= 4 + headerRowOffset + c.length + 4) {
            style.fill.fgColor.rgb = "F3F4F6";
            if (C === 0) style.font.bold = true;
          }

          ws[cellAddress].s = style;
        }
      }

      let sheetName = p.designation || `Panel_${index}`;
      if (sheetName.length > 31) sheetName = sheetName.substring(0, 31);

      const existingNames = wb.SheetNames;
      let counter = 1;
      let finalName = sheetName;
      while (existingNames.includes(finalName)) {
        finalName = `${sheetName.substring(0, 28)}_${counter}`;
        counter++;
      }

      XLSX.utils.book_append_sheet(wb, ws, finalName);
    });

    XLSX.writeFile(wb, `Load_Schedule_${panel.designation || "Project"}.xlsx`);
  };

  const handleExportWord = async () => {
    try {
      const getImg = async (id: string) => {
        const el = document.getElementById(id);
        if (!el) return null;
        try {
          // Reduced pixel ratio from 2 to 1 to handle extremely large DOM elements (e.g., long load schedules) without exceeding canvas memory limits
          return await toPng(el, {
            quality: 1,
            backgroundColor: "#ffffff",
            pixelRatio: 1,
            skipFonts: true,
          });
        } catch (err) {
          console.warn(`Failed to capture image for element ${id}:`, err);
          return null;
        }
      };

      // Since the hidden container renders everything, we can grab them by ID.
      // LoadSchedule has `sld-${panel.designation || 'main'}`
      // ShortCircuitCalc has `short-circuit-diagram`
      // VoltageDropCalc has `voltage-drop-diagram`
      // IlluminationCalc has `illumination-diagram`
      const sldImages: Record<string, string | null> = {};
      const allPanels = [panel, ...subPanels.map((sp) => sp.panel)];
      for (const p of allPanels) {
        const id = `sld-${p?.designation || "main"}`;
        sldImages[p?.designation || ""] = await getImg(id);
      }

      const images = {
        sld: sldImages,
        isc: await getImg("short-circuit-diagram"),
        vdDiagrams: {} as Record<string, string | null>,
        illumination: await getImg("illumination-diagram"),
        floorPlan: floorPlanImages,
      };

      for (const calc of vdCalculations) {
        if (calc?.id) {
          images.vdDiagrams[calc.id] = await getImg(`vd-diagram-${calc.id}`);
        }
      }

      await exportToWord(panel, circuits, subPanels, vdCalculations, images);
    } catch (e) {
      console.error("Error generating Word doc:", e);
      let errorMsg = "Unknown error";
      if (e instanceof Error) errorMsg = e.message;
      else if (typeof e === "string") errorMsg = e;
      alert(
        "There was an issue generating the Word document. Error: " + errorMsg,
      );
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center">
      {/* Tab Navigation */}
      <nav className="w-full bg-white border-b border-slate-200 sticky top-0 z-50 no-print shadow-sm font-sans">
        <div className="max-w-[1600px] mx-auto px-4 flex items-center h-16 justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-400 rounded-lg shadow-sm">
              <Zap className="w-5 h-5 text-yellow-900" />
            </div>
            <div className="hidden md:block">
              <span className="font-black text-slate-900 tracking-tight text-lg">
                PEC PRO
              </span>
              <p className="text-[10px] text-slate-400 font-bold uppercase -mt-1">
                PH Engineering Tool
              </p>
            </div>
          </div>

          <div className="flex bg-slate-100 p-1 rounded-xl">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                  activeTab === tab.id
                    ? `bg-white shadow-sm shadow-slate-200 ${tab.color}`
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <tab.icon className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Auth />
            <button
              onClick={handleExportWord}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200/50"
            >
              <FileText className="w-4 h-4" />
              <span className="hidden lg:inline">Export Word Report</span>
            </button>
            <button
              onClick={exportToExcel}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-200/50"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span className="hidden lg:inline">Export Excel</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main
        id="print-area"
        className="w-full max-w-[1600px] p-4 md:p-8 flex flex-col items-center gap-8"
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="w-full flex justify-center"
          >
            {activeTab === "schedule" && (
              <div className="flex flex-col gap-12 w-full max-w-full">
                <LoadSchedule
                  panel={panel}
                  setPanel={setPanel}
                  circuits={circuits}
                  setCircuits={setCircuits}
                  availableSubPanels={subPanels}
                />

                {subPanels.map((sp, index) => (
                  <React.Fragment key={sp.id}>
                    <LoadSchedule
                      panel={sp.panel}
                      setPanel={(newPanel) => {
                        setSubPanels((prev) => {
                          const currentPanel = prev[index].panel;
                          const updatedPanel =
                            typeof newPanel === "function"
                              ? newPanel(currentPanel)
                              : newPanel;
                          if (currentPanel === updatedPanel) return prev;
                          return prev.map((p, i) =>
                            i === index ? { ...p, panel: updatedPanel } : p,
                          );
                        });
                      }}
                      circuits={sp.circuits}
                      setCircuits={(newCircuits) => {
                        setSubPanels((prev) => {
                          const currentCircuits = prev[index].circuits;
                          const updatedCircuits =
                            typeof newCircuits === "function"
                              ? newCircuits(currentCircuits)
                              : newCircuits;
                          if (currentCircuits === updatedCircuits) return prev;
                          return prev.map((p, i) =>
                            i === index
                              ? { ...p, circuits: updatedCircuits }
                              : p,
                          );
                        });
                      }}
                      isSubPanel={true}
                      onRemoveSubPanel={() => {
                        setSubPanels((prev) =>
                          prev.filter((p) => p.id !== sp.id),
                        );
                      }}
                    />
                  </React.Fragment>
                ))}

                <button
                  onClick={() => {
                    setSubPanels((prev) => [
                      ...prev,
                      {
                        id: crypto.randomUUID(),
                        panel: {
                          ...INITIAL_PANEL,
                          designation: `Sub-Panel ${prev.length + 1}`,
                        },
                        circuits: INITIAL_CIRCUITS,
                      },
                    ]);
                  }}
                  className="w-full py-6 border-2 border-dashed border-slate-300 rounded-2xl flex items-center justify-center gap-2 text-slate-500 font-bold hover:text-indigo-600 hover:border-indigo-400 hover:bg-indigo-50/50 transition-all no-print"
                >
                  <Plus className="w-5 h-5" />
                  Add Sub-Panel
                </button>
              </div>
            )}
            {activeTab === "isc" && (
              <ShortCircuitCalc
                panel={panel}
                circuits={circuits}
                subPanels={subPanels}
                params={iscParams}
                setParams={setIscParams}
                source={iscSource}
                setSource={setIscSource}
              />
            )}
            {activeTab === "vd" && (
              <VoltageDropCalc
                panel={panel}
                circuits={circuits}
                calculations={vdCalculations}
                setCalculations={setVdCalculations}
              />
            )}
            {activeTab === "lighting" && (
              <IlluminationCalc
                circuits={circuits}
                setCircuits={setCircuits}
                setActiveTab={setActiveTab}
                params={illumParams}
                setParams={setIllumParams}
              />
            )}
            {activeTab === "floor-plan" && (
              <FloorPlanUploader
                images={floorPlanImages}
                setImages={setFloorPlanImages}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Hidden Export Container for capturing all diagrams */}
      <div className="fixed top-0 left-[-9999px] w-[1000px] opacity-0 pointer-events-none flex flex-col gap-8 no-print z-[-10] bg-slate-50 min-h-screen">
        <div id="export-container-sld">
          <div className="flex flex-col gap-12 w-full max-w-full">
            <LoadSchedule
              panel={panel}
              setPanel={setPanel}
              circuits={circuits}
              setCircuits={setCircuits}
              availableSubPanels={subPanels}
              readOnly={true}
            />
            {subPanels.map((sp, index) => (
              <div key={sp.id}>
                <LoadSchedule
                  panel={sp.panel}
                  setPanel={(newPanel) => {
                    setSubPanels((prev) => {
                      const currentPanel = prev[index].panel;
                      const updatedPanel =
                        typeof newPanel === "function"
                          ? newPanel(currentPanel)
                          : newPanel;
                      if (currentPanel === updatedPanel) return prev;
                      return prev.map((p, i) =>
                        i === index ? { ...p, panel: updatedPanel } : p,
                      );
                    });
                  }}
                  circuits={sp.circuits}
                  setCircuits={(newCircuits) => {
                    setSubPanels((prev) => {
                      const currentCircuits = prev[index].circuits;
                      const updatedCircuits =
                        typeof newCircuits === "function"
                          ? newCircuits(currentCircuits)
                          : newCircuits;
                      if (currentCircuits === updatedCircuits) return prev;
                      return prev.map((p, i) =>
                        i === index ? { ...p, circuits: updatedCircuits } : p,
                      );
                    });
                  }}
                  isSubPanel={true}
                  onRemoveSubPanel={() => {
                    setSubPanels((prev) => prev.filter((p) => p.id !== sp.id));
                  }}
                  readOnly={true}
                />
              </div>
            ))}
          </div>
        </div>
        <div id="export-container-isc">
          <ShortCircuitCalc
            panel={panel}
            circuits={circuits}
            subPanels={subPanels}
            params={iscParams}
            setParams={setIscParams}
            source={iscSource}
            setSource={setIscSource}
          />
        </div>
        <div id="export-container-vd">
          <VoltageDropCalc
            panel={panel}
            circuits={circuits}
            calculations={vdCalculations}
            setCalculations={setVdCalculations}
          />
        </div>
        <div id="export-container-illum">
          <IlluminationCalc
            circuits={circuits}
            setCircuits={setCircuits}
            setActiveTab={setActiveTab}
            params={illumParams}
            setParams={setIllumParams}
          />
        </div>
      </div>

      <footer className="w-full bg-white border-t border-slate-100 py-12 mt-auto no-print">
        <div className="max-w-[1600px] mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex flex-col items-center md:items-start">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 bg-yellow-400 rounded flex items-center justify-center">
                <Zap className="w-4 h-4 text-yellow-900" />
              </div>
              <span className="font-bold text-slate-900">
                PEC Load Schedule Pro
              </span>
            </div>
            <p className="text-xs text-slate-400 max-w-xs text-center md:text-left">
              Professional calculators based on PEC Part 1 and Part 2.
              High-fidelity design for electrical engineers and contractors.
            </p>
          </div>
          <div className="flex gap-8">
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-black text-slate-300 uppercase letter tracking-widest text-center md:text-left">
                Standards
              </span>
              <div className="flex gap-4 opacity-30 grayscale items-center h-8">
                <img
                  src="https://upload.wikimedia.org/wikipedia/commons/b/ba/IEEE_Logo.svg"
                  className="h-4"
                  alt="IEEE"
                />
                <span className="text-xs font-bold text-slate-900">
                  PEC 2017
                </span>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
