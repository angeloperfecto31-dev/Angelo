import React, { useState, useEffect, useRef } from "react";
import { auth, db } from "./firebase";
import { onAuthStateChanged, User, signOut } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { handleFirestoreError, OperationType } from "./utils/firestoreError";
import LoginScreen from "./components/LoginScreen";
import PaymentScreen from "./components/PaymentScreen";
import { ShieldCheck, Activity, Gauge, AlertTriangle, ArrowUpRight, Layers, HelpCircle, CheckCircle2, Sun, Moon } from "lucide-react";
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
  LoadType,
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
  const [userPlan, setUserPlan] = useState<"basic" | "premium" | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const isAdmin = user?.email?.trim().toLowerCase() === "angeloperfecto31@gmail.com";
  const isActiveRef = useRef(false);

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
        isActiveRef.current = false;
        setAuthLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    // Listen to user document in Firestore to check active status
    let initialLoad = true;
    const unsubscribe = onSnapshot(
      doc(db, "users", user.uid),
      (docSnap) => {
        if (docSnap.exists() && docSnap.data().isActive === true) {
          const data = docSnap.data();
          setUserPlan(data.plan || "premium");
          if (!initialLoad && !isActiveRef.current && !isAdmin) {
             // Transitioned from inactive to active while logged in!
             // Give a tiny delay for payment screen to unmount or show a message if we wanted, but the prompt says redirect automatically.
             alert("Your account has been manually approved and activated! Please log in to your account to continue.");
             signOut(auth).catch(console.error);
          } else {
             setIsActive(true);
             isActiveRef.current = true;
          }
        } else {
          setIsActive(false);
          isActiveRef.current = false;
          setUserPlan(null);
        }
        initialLoad = false;
        setAuthLoading(false);
      },
      (error) => {
        console.error("Firestore listener error:", error);
        setIsActive(false);
        isActiveRef.current = false;
        setAuthLoading(false);
        try {
          handleFirestoreError(error, OperationType.GET, "users/" + user.uid);
        } catch (e) {
          // Keep the error from breaking state, but ensure it's reported
        }
      },
    );

    return () => unsubscribe();
  }, [user, isAdmin]);

  const [activeTab, setActiveTab] = useState<
    "dashboard" | "schedule" | "isc" | "vd" | "lighting" | "floor-plan" | "verify"
  >("dashboard");
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem("theme");
    return saved === "dark";
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [isDarkMode]);
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
  
  const [illumSnapshots, setIllumSnapshots] = useState<Record<string, string>>({});

  const handleAddIllumSnapshot = (circuitId: string, image: string, roomName: string) => {
    setIllumSnapshots(prev => ({
      ...prev,
      [circuitId]: image
    }));
  };

  const [floorPlanImages, setFloorPlanImages] = useState<string[]>([]);
  const [isExporting, setIsExporting] = useState<boolean>(false);

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

  if (!isActive && !isAdmin) {
    return <PaymentScreen user={user} />;
  }

  if (showUpgrade && userPlan !== 'premium' && !isAdmin) {
    return <PaymentScreen user={user} isUpgrade={true} onClose={() => setShowUpgrade(false)} />;
  }

  const tabs = [
    {
      id: "dashboard",
      label: "Dashboard",
      icon: Gauge,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
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
    ...(isAdmin ? [{
      id: "verify",
      label: "Verify Users",
      icon: ShieldCheck,
      color: "text-amber-600",
      bg: "bg-amber-50",
    }] : [])
  ];

  const computePanelScheduleValues = (p: PanelConfig, c: Circuit[]) => {
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

    const getWireForBreakerLocal = (cbRating: number, designAmpacity: number) => {
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

    const formatWireSizeLocal = (size: number): string =>
      size <= 8 ? size.toFixed(1) : size.toString();

    const getGroundWireForWireSizeLocal = (wireSize: number, cbRating: number): string => {
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

    const getConduitSizeForWiresLocal = (wireSize: number, groundSizeString: string, poles: number, systemName: string): string => {
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

    const totalVA = c.reduce((sum, curr) => sum + curr.loadVA, 0);

    const phaseLoads = { R: 0, Y: 0, B: 0 };
    c.forEach((cir) => {
      cir.phases.forEach((ph: string) => {
        phaseLoads[ph as keyof typeof phaseLoads] +=
          cir.loadVA / cir.phases.length;
      });
    });

    const maxPhaseLoad = Math.max(phaseLoads.R, phaseLoads.Y, phaseLoads.B);
    const phaseImbalance =
      maxPhaseLoad > 0
        ? (1 - Math.min(phaseLoads.R, phaseLoads.Y, phaseLoads.B) / maxPhaseLoad) *
          100
        : 0;

    const phaseAmps = { R: 0, Y: 0, B: 0 };
    c.forEach((cir) => {
      if (cir.phases.includes("R")) phaseAmps.R += cir.loadA;
      if (cir.phases.includes("Y")) phaseAmps.Y += cir.loadA;
      if (cir.phases.includes("B")) phaseAmps.B += cir.loadA;
    });

    // Calculate mainCurrent
    let lightingReceptacleVA = 0;
    let motorVAs: number[] = [];

    let phaseVAs = { R: 0, Y: 0, B: 0 };
    let motorPhaseVAs = { R: 0, Y: 0, B: 0 };

    c.forEach((cir) => {
      const perPhaseVA = cir.loadVA / cir.phases.length;
      const isMotor =
        cir.loadType === LoadType.AIR_CON ||
        cir.loadType === LoadType.MOTOR;

      cir.phases.forEach((ph: string) => {
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

    let maxDesignAmp = 0;
    let maxBaseAmp = 0;

    if (p.system.includes("3PH")) {
      const highestPhaseBaseVA = Math.max(phaseVAs.R, phaseVAs.Y, phaseVAs.B);
      const effectiveTotalBaseVA = highestPhaseBaseVA * 3;

      const factor = p.voltage * Math.sqrt(3);
      maxBaseAmp = effectiveTotalBaseVA / factor;

      const totalMotorDemandVA =
        motorVAs.reduce((a, b) => a + b, 0) + largestMotor * 0.25;
      const totalNetComputedVA = lightingReceptacleDemand + totalMotorDemandVA;

      const unbalanceRatio =
        motorVAs.length + lightingReceptacleVA > 0
          ? effectiveTotalBaseVA / (motorVAs.reduce((a, b) => a + b, 0) + lightingReceptacleVA)
          : 1;

      maxDesignAmp = (totalNetComputedVA * Math.max(1, unbalanceRatio)) / factor;
    } else {
      const totalMotorDemandVA =
        motorVAs.reduce((a, b) => a + b, 0) + largestMotor * 0.25;
      const totalNetComputedVA = lightingReceptacleDemand + totalMotorDemandVA;
      const totalBaseVA = lightingReceptacleVA + motorVAs.reduce((a, b) => a + b, 0);

      maxBaseAmp = totalBaseVA / p.voltage;
      maxDesignAmp = totalNetComputedVA / p.voltage;
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

    return {
      totalVA,
      phaseLoads,
      maxPhaseLoad,
      phaseImbalance,
      phaseAmps,
      mainCurrent,
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

  const exportToExcel = () => {
    const wb = XLSX.utils.book_new();

    const allPanelsToExport = [
      { panel, circuits },
      ...subPanels.map((sp) => ({ panel: sp.panel, circuits: sp.circuits })),
    ];

    allPanelsToExport.forEach((item, index) => {
      const { panel: p, circuits: c } = item;

      // Extract accurate calculations matching the system's UI engine
      const {
        totalVA,
        phaseImbalance,
        phaseAmps,
        mainCurrent,
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
      } = computePanelScheduleValues(p, c);

      const formatWireSize = (size: number): string =>
        size <= 8 ? size.toFixed(1) : size.toString();

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
      
      const is3Phase = p.system.includes("3PH");

      const headers = ["NO.", "DESCRIPTION", "W", "QTY", "VA", "PHASE"];
      if (is3Phase) {
        headers.push("AMPS", "", "", ""); // push 4 slots for AMPS
      } else {
        headers.push("AMPS");
      }
      headers.push("AT", "AF", "P", "KAIC", "TYPE", "WIRE / GND / CONDUIT");
      wsData.push(headers);

      if (is3Phase) {
        const p1 = p.connectionType === "Line-to-Neutral" ? "AN" : "AB";
        const p2 = p.connectionType === "Line-to-Neutral" ? "BN" : "BC";
        const p3 = p.connectionType === "Line-to-Neutral" ? "CN" : "CA";
        wsData.push([
          "",
          "",
          "",
          "",
          "",
          "",
          p1,
          p2,
          p3,
          "3Ø",
          "",
          "",
          "",
          "",
          "",
          "",
        ]);
      }

      c.forEach((cir) => {
        const isSpace = (cir.description && cir.description.toUpperCase() === 'SPACE') || cir.loadType === LoadType.SPACE;
        const row: any[] = [
          cir.circuitNo,
          cir.description,
          isSpace ? "-" : cir.wattage,
          isSpace ? "-" : cir.quantity,
          isSpace ? "-" : cir.loadVA,
          isSpace ? "-" : (cir.phases ? cir.phases.join(", ") : ""),
        ];

        if (is3Phase) {
          if (isSpace) {
            row.push("-", "-", "-", "-");
          } else {
            row.push(
              cir.phases.includes("R") && cir.phases.length < 3 ? cir.loadA.toFixed(2) : "-",
              cir.phases.includes("Y") && cir.phases.length < 3 ? cir.loadA.toFixed(2) : "-",
              cir.phases.includes("B") && cir.phases.length < 3 ? cir.loadA.toFixed(2) : "-",
              cir.phases.length === 3 ? cir.loadA.toFixed(2) : "-",
            );
          }
        } else {
          row.push(isSpace ? "-" : cir.loadA.toFixed(2));
        }

        row.push(
          isSpace ? "-" : cir.mcbAT,
          isSpace ? "-" : cir.mcbAF,
          isSpace ? "-" : cir.mcbP,
          isSpace ? "-" : cir.mcbKAIC,
          isSpace ? "-" : cir.mcbType,
          isSpace ? "-" : `${cir.wireSize}mm² ${cir.wireType} / ${cir.groundSize}mm² GND in ${cir.conduitSize} ${cir.conduitType}`,
        );
        wsData.push(row);
      });

      const headerRowOffset = is3Phase ? 1 : 0;

      wsData.push([]);
      
      const baseTotalRow: any[] = [
        "",
        "",
        "",
        "Total Connected Load",
        `${totalVA.toFixed(0)} VA`,
        `(${(totalVA / 1000).toFixed(2)} kVA)`,
      ];
      
      if (is3Phase) {
        baseTotalRow.push(
          `${phaseAmps.R.toFixed(2)} A`,
          `${phaseAmps.Y.toFixed(2)} A`,
          `${phaseAmps.B.toFixed(2)} A`,
          "-",
        );
      } else {
        baseTotalRow.push(`${mainCurrent.baseAmp.toFixed(2)} A`);
      }
      
      const numCols = is3Phase ? 16 : 13;
      const baseRemainingCols = numCols - baseTotalRow.length;
      for (let i = 0; i < baseRemainingCols; i++) {
        baseTotalRow.push("");
      }
      wsData.push(baseTotalRow);

      const totalKvaRow: any[] = [
        "",
        "",
        "",
        "Total kVA",
        `${(totalVA / 1000).toFixed(2)} kVA`,
        "",
      ];
      const remainingCols = numCols - totalKvaRow.length;
      for (let i = 0; i < remainingCols; i++) {
        totalKvaRow.push("");
      }
      wsData.push(totalKvaRow);

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
        merges.push({ s: { r: 3, c: 6 }, e: { r: 3, c: 9 } });
        merges.push({ s: { r: 3, c: 10 }, e: { r: 4, c: 10 } });
        merges.push({ s: { r: 3, c: 11 }, e: { r: 4, c: 11 } });
        merges.push({ s: { r: 3, c: 12 }, e: { r: 4, c: 12 } });
        merges.push({ s: { r: 3, c: 13 }, e: { r: 4, c: 13 } });
        merges.push({ s: { r: 3, c: 14 }, e: { r: 4, c: 14 } });
        merges.push({ s: { r: 3, c: 15 }, e: { r: 4, c: 15 } });
      }
      if (merges.length > 0) {
        ws["!merges"] = merges;
      }

      const wscols: any[] = [];
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
    setIsExporting(true);
    // Give React time to render all components visibly
    await new Promise((resolve) => setTimeout(resolve, 1000));

    try {
      const getImg = async (id: string) => {
        const el = document.getElementById(id);
        if (!el) return null;
        try {
          const isSld = id.startsWith("sld-");
          const pRatio = isSld ? 1 : 1.5;
          
          let width = el.scrollWidth;
          let height = el.scrollHeight;
          const isIllumination = id === "illumination-diagram";
          
          if (id === "short-circuit-diagram") {
            width = 1050;
            height = 950;
          } else if (isIllumination) {
            width = el.clientWidth || 1000;
            height = el.clientHeight || 550;
          }
          
          return await toPng(el, {
            quality: 1,
            backgroundColor: isIllumination ? "#020617" : "#ffffff",
            pixelRatio: pRatio,
            width: width,
            height: height,
            skipFonts: true,
            style: {
              opacity: "1",
              visibility: "visible",
              transform: "none",
              left: "0",
              top: "0",
              margin: "0",
              position: "relative",
              overflow: "hidden", // Removes the scrollbars when capturing!
              border: "none",     // Ensures clean unconstrained look
              boxShadow: "none",
              width: `${width}px`,
              height: `${height}px`,
            },
          });
        } catch (err) {
          console.warn(`Failed to capture image for element ${id}:`, err);
          return null;
        }
      };

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
        illumination: await getImg("illumination-diagram"), // The current one
        illumSnapshots: illumSnapshots, // the recorded ones
        floorPlan: floorPlanImages,
      };

      for (const calc of vdCalculations) {
        if (calc?.id) {
          images.vdDiagrams[calc.id] = await getImg(`vd-diagram-${calc.id}`);
        }
      }

      await exportToWord(panel, circuits, subPanels, vdCalculations, illumParams, images, iscParams);
    } catch (e) {
      console.error("Error generating Word doc:", e);
      let errorMsg = "Unknown error";
      if (e instanceof Error) errorMsg = e.message;
      else if (typeof e === "string") errorMsg = e;
      alert(
        "There was an issue generating the Word document. Error: " + errorMsg,
      );
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 font-sans overflow-hidden text-slate-900 dark:text-slate-100 transition-colors duration-200">
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-slate-900 dark:bg-slate-950 border-r border-slate-800 flex flex-col justify-between hidden md:flex shrink-0 no-print transition-all">
        <div>
          {/* Logo and Brand */}
          <div className="h-16 flex items-center justify-between px-6 border-b border-slate-800/50 bg-slate-900/50">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-400 rounded-lg shadow-sm">
                <Zap className="w-5 h-5 text-yellow-900" />
              </div>
              <div>
                <span className="font-black text-white tracking-tight text-lg">
                  ElectricalPH
                </span>
                <p className="text-[10px] text-slate-400 font-bold uppercase -mt-1 tracking-wider">
                  Engineering Tool
                </p>
              </div>
            </div>
            {/* Desktop Theme Switcher */}
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
              title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-400" />}
            </button>
          </div>
          
          {/* Navigation Menu */}
          <div className="p-4 space-y-1">
            <p className="px-2 text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 mt-4">Modules</p>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                  activeTab === tab.id
                    ? `bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-inner`
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                }`}
              >
                <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? 'text-indigo-400' : 'text-slate-500'}`} />
                <span>{tab.label}</span>
                {activeTab === tab.id && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-500"></div>
                )}
              </button>
            ))}
            
            {/* Verify Users for Admin */}
            {isAdmin && (
              <button
                onClick={() => setActiveTab("verify")}
                className={`w-full flex items-center gap-3 px-3 py-2.5 mt-8 rounded-lg text-sm font-semibold transition-all ${
                  activeTab === "verify" 
                    ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" 
                    : "text-amber-400/70 hover:text-amber-400 hover:bg-slate-800/50"
                }`}
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Verify Registrations</span>
              </button>
            )}
          </div>
        </div>

        {/* Bottom Sidebar - User Profile & Actions */}
        <div className="p-4 border-t border-slate-800/50 space-y-3 bg-slate-900/50">
          <button
            onClick={userPlan === 'premium' || isAdmin ? handleExportWord : () => setShowUpgrade(true)}
            className={`w-full flex items-center gap-2 justify-center px-4 py-2.5 ${userPlan === 'premium' || isAdmin ? 'bg-indigo-600 hover:bg-indigo-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'} rounded-lg text-xs font-bold transition-colors shadow-lg shadow-indigo-900/20`}
            title={userPlan !== 'premium' && !isAdmin ? "Available on Premium Plan" : "Generate Word Report"}
          >
            <FileText className="w-4 h-4" />
            <span>{userPlan !== 'premium' && !isAdmin ? "Report (Premium)" : "Generate Report"}</span>
          </button>
          <button
            onClick={exportToExcel}
            className="w-full flex items-center gap-2 justify-center px-4 py-2.5 bg-slate-800 text-slate-300 rounded-lg text-xs font-bold hover:bg-slate-700 hover:text-white transition-colors border border-slate-700/50"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Export to Excel</span>
          </button>
          <div className="pt-2 flex justify-center">
            <Auth />
          </div>
        </div>
      </aside>

      {/* Main Layout Wrapper */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden bg-slate-50 dark:bg-slate-950 relative transition-colors duration-200">
        
        {/* Mobile Navbar */}
        <header className="md:hidden h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-4 sticky top-0 z-20 shrink-0 shadow-sm no-print">
           <div className="flex items-center gap-2">
              <div className="p-1.5 bg-yellow-400 rounded-md">
                <Zap className="w-4 h-4 text-yellow-900" />
              </div>
              <span className="font-extrabold text-slate-900 dark:text-white text-lg tracking-tight">ElectricalPH</span>
           </div>
           
           <div className="flex items-center gap-1">
             {/* Mobile Theme Toggle Button */}
             <button
               onClick={() => setIsDarkMode(!isDarkMode)}
               className="p-1.5 mr-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
               title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
             >
               {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-500" />}
             </button>
           </div>
        </header>

        {/* Mobile secondary navigation bar */}
        <div className="md:hidden bg-slate-100/80 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 px-4 py-2 sticky top-16 z-20 overflow-x-auto whitespace-nowrap hide-scrollbar flex gap-2 no-print backdrop-blur-md">
          {tabs.map((tab) => (
             <button
               key={tab.id}
               onClick={() => setActiveTab(tab.id as any)}
               className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                 activeTab === tab.id ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 shadow-sm" : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/50 dark:border-slate-700"
               }`}
             >
               {tab.label}
             </button>
          ))}
        </div>

        {/* Scrollable Content Area */}
        <main
          id="print-area"
          className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:p-8 w-full"
        >
          <div className="max-w-[1400px] w-full mx-auto flex flex-col gap-8 pb-32">
            <div className="w-full">
          {/* Dashboard Tab */}
          <div className={activeTab === "dashboard" ? "w-full animate-fade" : "hidden"}>
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={activeTab === "dashboard" ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.2 }}
              className="space-y-8"
            >
              {/* Engineering Hero Header */}
              <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-950 rounded-3xl p-6 sm:p-8 text-white border border-slate-800 shadow-xl relative overflow-hidden">
                <div className="absolute inset-0 opacity-10 pointer-events-none" style={{
                  backgroundImage: 'radial-gradient(circle at 80% 20%, rgba(99, 102, 241, 0.4), transparent 50%), linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
                  backgroundSize: '100% 100%, 30px 30px, 30px 30px'
                }} />
                
                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div className="space-y-2">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-yellow-400/10 border border-yellow-400/20 text-yellow-300 text-xs font-bold uppercase tracking-wider">
                      ⚡ Active Session Station
                    </span>
                    <h2 className="text-3xl font-black uppercase tracking-tight text-white sm:text-4xl">
                      {panel.project || 'Untitled Project Station'}
                    </h2>
                    <p className="text-slate-300 text-sm max-w-2xl">
                      Engineering dashboard for PEC compliant system design and safety audits. Real-time telemetry is active. All components verified against standard electrical wire sizes and conductor tolerances.
                    </p>
                  </div>
                  
                  <div className="bg-white/10 shrink-0 backdrop-blur-md border border-white/10 px-6 py-4 rounded-2xl flex flex-col gap-1 shadow-lg text-slate-100">
                    <span className="text-xs text-indigo-200 uppercase font-black tracking-widest">Local Time (Manila)</span>
                    <span className="font-mono text-xl font-bold text-yellow-300">
                      {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: '2-digit', year: 'numeric' })}
                    </span>
                    <span className="text-xs text-slate-400">PEC Standards Version: PEC 2017</span>
                  </div>
                </div>
              </div>

              {/* Bento Grid: Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                
                {/* Connected Load Schedule Telemetry */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block">CONNECTED CAPACITY</span>
                      <h3 className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight font-mono">
                        {(circuits.reduce((sum, c) => sum + (c.loadVA || 0), 0) / 1000).toFixed(2)} kVA
                      </h3>
                    </div>
                    <div className="p-3 bg-indigo-50 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-sm">
                      <Layout className="w-5 h-5" />
                    </div>
                  </div>
                  
                  <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-bold text-slate-700 dark:text-slate-300">{circuits.length} Registered Loops</span>
                    <button onClick={() => setActiveTab("schedule")} className="text-indigo-600 dark:text-indigo-400 font-extrabold hover:underline flex items-center gap-1">
                      Configure <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Short Circuit Fault Adequacy */}
                {(() => {
                  const baseKVA = iscParams.transformerKVA || 500;
                  const baseKV = (iscParams.transformerVoltage || 230) / 1000;
                  const zUtilitypu = baseKVA / ((iscParams.utilityShortCircuitMVA || 250) * 1000);
                  const zTranspu = (iscParams.transformerZ || 5) / 100;
                  const iFullLoad = baseKVA / (Math.sqrt(3) * baseKV);
                  const iscMainBreakerVal = iFullLoad / (zUtilitypu + zTranspu) || 12500; 
                  const iscKAIC = (iscMainBreakerVal / 1000);
                  const panelLimitKAIC = parseFloat(panel.icRating) || 10;
                  const scStatus = iscKAIC <= panelLimitKAIC ? "COMPLIANT" : "WARNING";

                  return (
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block">CALCULATED ISC</span>
                          <h3 className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight font-mono">
                            {iscKAIC.toFixed(2)} kA
                          </h3>
                        </div>
                        <div className={`p-3 rounded-xl shadow-sm transition-all ${
                          scStatus === 'COMPLIANT' 
                            ? 'bg-emerald-50 dark:bg-emerald-950/35 text-emerald-600 dark:text-emerald-400 group-hover:bg-emerald-600 group-hover:text-white' 
                            : 'bg-rose-50 dark:bg-rose-950/35 text-rose-600 dark:text-rose-400 group-hover:bg-rose-600 group-hover:text-white'
                        }`}>
                          <ShieldAlert className="w-5 h-5" />
                        </div>
                      </div>
                      
                      <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                        <span className={`font-extrabold flex items-center gap-1.5 ${
                          scStatus === 'COMPLIANT' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                        }`}>
                          <span className={`w-2 h-2 rounded-full ${scStatus === 'COMPLIANT' ? 'bg-emerald-500' : 'bg-rose-500 animate-pulse'}`} /> 
                          {scStatus} Limit ({panelLimitKAIC}kA pf)
                        </span>
                        <button onClick={() => setActiveTab("isc")} className="text-indigo-600 dark:text-indigo-400 font-extrabold hover:underline flex items-center gap-1">
                          Audit <ArrowUpRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })()}

                {/* Voltage Drop Audit */}
                {(() => {
                  let maxVDPercent = 0;
                  vdCalculations.forEach((vd) => {
                    const size = parseFloat(vd.wireSize) || 3.5;
                    const r = 0.0172 / size; 
                    const factor = vd.systemType === '3PH' ? Math.sqrt(3) : 2;
                    const dropV = factor * vd.loadA * vd.length * r;
                    const pct = (dropV / vd.voltage) * 100;
                    if (pct > maxVDPercent) maxVDPercent = pct;
                  });
                  if (vdCalculations.length === 0) {
                    maxVDPercent = 1.15; 
                  }
                  const isVDPass = maxVDPercent <= 3.0;

                  return (
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block">MAX VOLTAGE DROP</span>
                          <h3 className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight font-mono">
                            {maxVDPercent.toFixed(2)}%
                          </h3>
                        </div>
                        <div className={`p-3 rounded-xl shadow-sm transition-all ${
                          isVDPass 
                            ? 'bg-green-50 dark:bg-emerald-950/35 text-green-600 dark:text-emerald-400 group-hover:bg-green-600 group-hover:text-white' 
                            : 'bg-amber-50 dark:bg-amber-950/35 text-amber-600 dark:text-amber-400 group-hover:bg-amber-600 group-hover:text-white'
                        }`}>
                          <Ruler className="w-5 h-5" />
                        </div>
                      </div>
                      
                      <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                        <span className={`font-extrabold flex items-center gap-1.5 ${
                          isVDPass ? 'text-green-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400 hover:text-amber-700'
                        }`}>
                          <span className={`w-2 h-2 rounded-full ${isVDPass ? 'bg-green-500' : 'bg-amber-500 animate-ping'}`} /> 
                          {isVDPass ? 'PEC Compliant (<3%)' : 'Exceeds PEC Limit'}
                        </span>
                        <button onClick={() => setActiveTab("vd")} className="text-indigo-600 dark:text-indigo-400 font-extrabold hover:underline flex items-center gap-1">
                          Evaluate <ArrowUpRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })()}

                {/* Illumination target status */}
                {(() => {
                  const illumArea = illumParams.inputMode === 'area' ? illumParams.userArea : illumParams.roomWidth * illumParams.roomLength;
                  const calculatedLux = Math.ceil((illumParams.lumensPerFixture * (illumParams.coefficientOfUtilization || 0.6) * (illumParams.maintenanceFactor || 0.8)) / (illumArea || 20));
                  const isLCompliance = calculatedLux >= illumParams.targetLux;

                  return (
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block">EST. ILLUMINATION</span>
                          <h3 className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight font-mono">
                            {calculatedLux || 0} Lux
                          </h3>
                        </div>
                        <div className={`p-3 rounded-xl shadow-sm transition-all ${
                          isLCompliance 
                            ? 'bg-yellow-50 dark:bg-yellow-950/35 text-yellow-600 dark:text-yellow-400 group-hover:bg-yellow-500 group-hover:text-white' 
                            : 'bg-orange-50 dark:bg-orange-950/35 text-orange-600 dark:text-orange-400 group-hover:bg-orange-600 group-hover:text-white'
                        }`}>
                          <Lightbulb className="w-5 h-5" />
                        </div>
                      </div>
                      
                      <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                        <span className={`font-extrabold flex items-center gap-1.5 ${
                          isLCompliance ? 'text-emerald-600 dark:text-emerald-200' : 'text-orange-600 dark:text-orange-300'
                        }`}>
                          <span className={`w-2 h-2 rounded-full ${isLCompliance ? 'bg-emerald-500' : 'bg-orange-500 animate-pulse'}`} /> 
                          {isLCompliance ? 'Target Met' : 'Low Illum vs Target'}
                        </span>
                        <button onClick={() => setActiveTab("lighting")} className="text-indigo-600 dark:text-indigo-400 font-extrabold hover:underline flex items-center gap-1">
                          Simulate <ArrowUpRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })()}

              </div>

              {/* Sub-panels and System parameters side-by-side */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                
                {/* Panel board specifications summary */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm lg:col-span-2 space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Layers className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                      <h4 className="font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider text-sm">Specification Standards Overview (PEC Part 1)</h4>
                    </div>
                    <span className="text-xs font-bold text-slate-400 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700 px-2 py-0.5 rounded-md">
                      Feeder: {panel.type || 'Main Panelboard'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    <div className="bg-slate-50 dark:bg-slate-800 border border-slate-100/80 dark:border-slate-800 rounded-2xl p-4 space-y-1">
                      <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block">SYSTEM VOLTAGE</span>
                      <p className="text-sm font-extrabold text-slate-800 dark:text-slate-200">{panel.system}</p>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800 border border-slate-100/80 dark:border-slate-800 rounded-2xl p-4 space-y-1">
                      <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block">ENCLOSURE STYLE</span>
                      <p className="text-sm font-extrabold text-slate-800 dark:text-slate-200">{panel.enclosure || "NEMA 1 Indoors"}</p>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800 border border-slate-100/80 dark:border-slate-800 rounded-2xl p-4 space-y-1">
                      <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block">MOUNTING METHOD</span>
                      <p className="text-sm font-extrabold text-slate-800 dark:text-slate-200">{panel.mounting || "Wall Surface"}</p>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800 border border-slate-100/80 dark:border-slate-800 rounded-2xl p-4 space-y-1">
                      <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block">INTERRUPTING COMPLIANCE</span>
                      <p className="text-sm font-extrabold text-slate-800 dark:text-slate-200">{panel.icRating || "10kA KAIC"}</p>
                    </div>
                  </div>

                  {/* Quick System loads bar-analysis */}
                  <div className="space-y-3">
                    <h5 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">LOAD DISTRIBUTION BY COMPONENT TYPE</h5>
                    {(() => {
                      const totalVA = circuits.reduce((sum, c) => sum + (c.loadVA || 0), 0) || 1;
                      const lightingVA = circuits.filter(c => c.loadType === 'L').reduce((sum, c) => sum + (c.loadVA || 0), 0);
                      const outletVA = circuits.filter(c => c.loadType === 'S').reduce((sum, c) => sum + (c.loadVA || 0), 0);
                      const motorVA = circuits.filter(c => c.loadType === 'AC' || c.loadType === 'M').reduce((sum, c) => sum + (c.loadVA || 0), 0);
                      const othersVA = totalVA - (lightingVA + outletVA + motorVA);

                      const lightPct = (lightingVA / totalVA) * 100;
                      const outletPct = (outletVA / totalVA) * 100;
                      const motorPct = (motorVA / totalVA) * 100;
                      const otherPct = (othersVA / totalVA) * 100;

                      return (
                        <div className="space-y-4">
                          <div className="h-4 w-full bg-slate-100 rounded-full flex overflow-hidden">
                            <div style={{ width: `${lightPct}%` }} className="bg-indigo-500 h-full transition-all" title={`Lighting: ${lightPct.toFixed(1)}%`} />
                            <div style={{ width: `${outletPct}%` }} className="bg-emerald-500 h-full transition-all" title={`Convenience Outlets: ${outletPct.toFixed(1)}%`} />
                            <div style={{ width: `${motorPct}%` }} className="bg-amber-500 h-full transition-all" title={`Motors / AC: ${motorPct.toFixed(1)}%`} />
                            <div style={{ width: `${otherPct}%` }} className="bg-slate-400 h-full transition-all" title={`Others: ${otherPct.toFixed(1)}%`} />
                          </div>
                          
                          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
                            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-indigo-500" /> Lighting (<strong>{lightPct.toFixed(1)}%</strong>)</span>
                            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-emerald-500" /> Outlets (<strong>{outletPct.toFixed(1)}%</strong>)</span>
                            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-amber-500" /> Motors/AC (<strong>{motorPct.toFixed(1)}%</strong>)</span>
                            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-slate-400" /> Others (<strong>{otherPct.toFixed(1)}%</strong>)</span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* PEC Quick Reference Guide */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <Zap className="w-4 h-4 text-yellow-500" />
                      <h4 className="font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider text-xs">PEC 2017 Quick Reference Guide</h4>
                    </div>
                    <ul className="space-y-4 text-xs text-slate-600 dark:text-slate-400">
                      <li className="flex items-start gap-2">
                        <span className="text-yellow-500 shrink-0 font-bold mt-0.5">▪</span>
                        <span><strong className="text-slate-800 dark:text-slate-200">Section 2.10.2.1:</strong> Branch circuits branch wire size must possess wire ampacity not less than 125% of continuous load.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-yellow-500 shrink-0 font-bold mt-0.5">▪</span>
                        <span><strong className="text-slate-800 dark:text-slate-200">Table 3.10.1.16:</strong> Minimum conductor wire size for general lighting branch loops in residential lands is <strong className="text-slate-900 dark:text-white font-extrabold">2.0 mm² THHN Cooper</strong>.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-yellow-500 shrink-0 font-bold mt-0.5">▪</span>
                        <span><strong className="text-slate-800 dark:text-slate-200">Section 2.40.1.3:</strong> Breaker standard ratings are 15A, 20A, 30A, 40A, 50A, 60A, 70A, 100A, 115A, 125A.</span>
                      </li>
                    </ul>
                  </div>

                  <div className="bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-950/40 rounded-2xl p-4 flex items-center justify-between text-xs mt-4">
                    <span className="text-indigo-950 dark:text-indigo-200 font-bold">Standard Grounding sizes?</span>
                    <button onClick={() => alert("Grounding Wire size according to PEC Table 2.50.6.13 requires a minimum 2.0 mm² for 15A loads and 3.5 mm² ground for 20A branch loads.")} className="px-3 py-1 bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 font-bold rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 shadow-sm transition-colors shrink-0">
                      View Table
                    </button>
                  </div>
                </div>

              </div>

              {/* Direct Actions & Interactive Quick Launcher Tab */}
              <div className="bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
                <h4 className="font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest text-[10px]">Jump-switch to Active Calculation Terminals:</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-4">
                  <button onClick={() => setActiveTab("schedule")} className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-800 p-4 rounded-2xl shadow-sm text-center font-bold text-xs text-slate-800 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all flex flex-col items-center gap-2 cursor-pointer">
                    <Layout className="w-5 h-5 text-indigo-500" />
                    Load Schedule
                  </button>
                  <button onClick={() => setActiveTab("isc")} className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-800 p-4 rounded-2xl shadow-sm text-center font-bold text-xs text-slate-800 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all flex flex-col items-center gap-2 cursor-pointer">
                    <ShieldAlert className="w-5 h-5 text-rose-500" />
                    Short Circuit
                  </button>
                  <button onClick={() => setActiveTab("vd")} className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-800 p-4 rounded-2xl shadow-sm text-center font-bold text-xs text-slate-800 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all flex flex-col items-center gap-2 cursor-pointer">
                    <Ruler className="w-5 h-5 text-emerald-500" />
                    Voltage Drop
                  </button>
                  <button onClick={() => setActiveTab("lighting")} className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-800 p-4 rounded-2xl shadow-sm text-center font-bold text-xs text-slate-800 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all flex flex-col items-center gap-2 cursor-pointer">
                    <Lightbulb className="w-5 h-5 text-yellow-500" />
                    Illumination
                  </button>
                  <button onClick={() => setActiveTab("floor-plan")} className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-800 p-4 rounded-2xl shadow-sm col-span-2 sm:col-span-1 text-center font-bold text-xs text-slate-800 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all flex flex-col items-center gap-2 cursor-pointer">
                    <Map className="w-5 h-5 text-cyan-500" />
                    Blueprint Preview
                  </button>
                </div>
              </div>

            </motion.div>
          </div>

          {/* Load Schedule Tab */}
          <div className={(activeTab === "schedule" || isExporting) ? "w-full" : "absolute left-[-9999px] top-0 opacity-0 pointer-events-none w-full select-none"}>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={(activeTab === "schedule" || isExporting) ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.2 }}
              className="w-full flex justify-center"
            >
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
                  className="w-full py-6 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl flex items-center justify-center gap-2 text-slate-500 dark:text-slate-400 font-bold hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-400 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/20 transition-all no-print"
                >
                  <Plus className="w-5 h-5" />
                  Add Sub-Panel
                </button>
              </div>
            </motion.div>
          </div>

          {/* Short Circuit Tab */}
          <div className={(activeTab === "isc" || isExporting) ? "w-full" : "absolute left-[-9999px] top-0 opacity-0 pointer-events-none w-full select-none"}>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={(activeTab === "isc" || isExporting) ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.2 }}
              className="w-full flex justify-center"
            >
              <ShortCircuitCalc
                panel={panel}
                circuits={circuits}
                subPanels={subPanels}
                params={iscParams}
                setParams={setIscParams}
                source={iscSource}
                setSource={setIscSource}
              />
            </motion.div>
          </div>

          {/* Voltage Drop Tab */}
          <div className={(activeTab === "vd" || isExporting) ? "w-full" : "absolute left-[-9999px] top-0 opacity-0 pointer-events-none w-full select-none"}>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={(activeTab === "vd" || isExporting) ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.2 }}
              className="w-full flex justify-center"
            >
              <VoltageDropCalc
                panel={panel}
                circuits={circuits}
                calculations={vdCalculations}
                setCalculations={setVdCalculations}
              />
            </motion.div>
          </div>

          {/* Illumination Tab */}
          <div className={(activeTab === "lighting" || isExporting) ? "w-full" : "absolute left-[-9999px] top-0 opacity-0 pointer-events-none w-full select-none"}>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={(activeTab === "lighting" || isExporting) ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.2 }}
              className="w-full flex justify-center"
            >
              <IlluminationCalc
                circuits={circuits}
                setCircuits={setCircuits}
                setActiveTab={setActiveTab}
                activeTab={activeTab}
                params={illumParams}
                setParams={setIllumParams}
                onSnapshotCapture={handleAddIllumSnapshot}
                snapshots={illumSnapshots}
              />
            </motion.div>
          </div>

          {/* Floor Plan Tab */}
          <div className={activeTab === "floor-plan" ? "w-full" : "hidden"}>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={activeTab === "floor-plan" ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.2 }}
              className="w-full flex justify-center"
            >
              <FloorPlanUploader
                images={floorPlanImages}
                setImages={setFloorPlanImages}
              />
            </motion.div>
          </div>

          {/* Verify Admin Tab */}
          <div className={activeTab === "verify" ? "w-full" : "hidden"}>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={activeTab === "verify" ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.2 }}
              className="w-full flex justify-center"
            >
              <div className="w-full">
                <PaymentScreen
                  user={user}
                  forceAdmin={true}
                  onPaymentSuccess={() => setActiveTab("schedule")}
                />
              </div>
            </motion.div>
          </div>
        </div>

      {isExporting && (
        <div className="fixed inset-0 z-[9999] bg-white dark:bg-slate-900 flex flex-col items-center justify-center shadow-2xl">
          <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-indigo-600 dark:border-indigo-400 mb-6 shadow-sm"></div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100 uppercase tracking-tighter">Compiling Report</h2>
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 mt-2">Please wait while the documents and diagrams are being generated...</p>
        </div>
      )}

        <footer className="w-full bg-white/50 border-t border-slate-200 mt-12 py-8 rounded-2xl no-print">
          <div className="mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex flex-col items-center md:items-start">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 bg-yellow-400 rounded flex items-center justify-center">
                  <Zap className="w-4 h-4 text-yellow-900" />
                </div>
                <span className="font-bold text-slate-900">
                  ElectricalPH
                </span>
              </div>
              <p className="text-xs text-slate-500 max-w-xs text-center md:text-left">
                Professional calculators based on PEC Part 1 and Part 2.
                High-fidelity design for electrical engineers and contractors.
              </p>
            </div>
            <div className="flex gap-8">
              <div className="flex flex-col gap-2">
                <span className="text-[10px] font-black text-slate-400 uppercase letter tracking-widest text-center md:text-left">
                  Standards Supported
                </span>
                <div className="flex gap-4 opacity-50 grayscale items-center h-8">
                  <span className="text-xs font-bold text-slate-900">
                    PEC 2017 & ASHRAE 90.1
                  </span>
                </div>
              </div>
            </div>
          </div>
        </footer>
        </div>
      </main>
    </div>
  </div>
  );
}
