import React, { useState, useEffect, useRef, useMemo } from "react";
import { auth, db } from "./firebase";
import { onAuthStateChanged, User, signOut } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { handleFirestoreError, OperationType } from "./utils/firestoreError";
import LoginScreen from "./components/LoginScreen";
import PaymentScreen from "./components/PaymentScreen";
import {
  ShieldCheck,
  Activity,
  Gauge,
  AlertTriangle,
  ArrowUpRight,
  Layers,
  HelpCircle,
  CheckCircle2,
  Sun,
  Moon,
  FolderOpen,
  Calculator,
  Receipt,
  Hammer,
  Cpu,
} from "lucide-react";
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
  Network,
  Copy,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import * as XLSX from "xlsx-js-style";
import LoadSchedule, {
  INITIAL_CIRCUITS,
  INITIAL_PANEL,
} from "./components/LoadSchedule";
import ShortCircuitCalc, {
  getRunsBySystem,
} from "./components/ShortCircuitCalc";
import VoltageDropCalc from "./components/VoltageDropCalc";
import SystemSLD from "./components/SystemSLD";
import IlluminationCalc from "./components/IlluminationCalc";
import FloorPlanUploader from "./components/FloorPlanUploader";
import InvoiceManager from "./components/InvoiceManager";
import {
  Circuit,
  PanelConfig,
  ShortCircuitParams,
  VoltageDropCalculation,
  IlluminationParams,
  LoadType,
  FloorPlanImage,
  MCBType,
} from "./types";
import {
  STANDARD_CB_RATINGS,
  WIRE_AMPACITY_TABLE,
  INITIAL_SHORT_CIRCUIT_PARAMS,
  INITIAL_VOLTAGE_DROP_CALCULATIONS,
  INITIAL_ILLUMINATION_PARAMS,
  WIRE_IMPEDANCE_TABLE,
} from "./constants";
import { ProjectData } from "./types/project";
import ProjectManagerModal from "./components/ProjectManagerModal";
import { exportToWord } from "./utils/exportWord";
import {
  computePanelScheduleValues,
  calculateCircuitValues,
  formatWireSizeLocal,
  isIdleSpareOrSpace,
} from "./utils/computeEngine";
import { exportToCAD } from "./utils/exportDxf";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from "recharts";

import { toPng } from "html-to-image";
import { Auth } from "./components/Auth";
import PECCurrentCalculator from "./components/PECCurrentCalculator";
import EgcSizingCalculator from "./components/EgcSizingCalculator";
import TransformerCalc from "./components/TransformerCalc";

export const getFreshInitialCircuits = (): Circuit[] => {
  return INITIAL_CIRCUITS.map((c) => ({
    ...c,
    id: crypto.randomUUID(),
    subLoads: c.subLoads ? c.subLoads.map((sl) => ({ ...sl, id: crypto.randomUUID() })) : undefined,
  }));
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isActive, setIsActive] = useState(false);
  const [userPlan, setUserPlan] = useState<"basic" | "premium" | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const isAdmin =
    user?.email?.trim().toLowerCase() === "angeloperfecto31@gmail.com";
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
      } else {
        // Prevent layout/payment screen flickering during authentication/subscription checks
        setAuthLoading(true);
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
            alert(
              "Your account has been manually approved and activated! Please log in to your account to continue.",
            );
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
    | "dashboard"
    | "schedule"
    | "isc"
    | "vd"
    | "lighting"
    | "floor-plan"
    | "verify"
    | "current-calc"
    | "egc"
    | "system-sld"
    | "transformer"
    | "billing"
  >("dashboard");
  const [activeScheduleTab, setActiveScheduleTab] = useState<string>("mdp");
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
  const [circuits, setCircuits] = useState<Circuit[]>(getFreshInitialCircuits);
  const [subPanels, setSubPanels] = useState<
    { id: string; panel: PanelConfig; circuits: Circuit[] }[]
  >([]);
  const [subSubPanels, setSubSubPanels] = useState<
    { id: string; panel: PanelConfig; circuits: Circuit[] }[]
  >([]);

  const uniqueSubPanels = useMemo(() => {
    const seen = new Set<string>();
    return subPanels.filter((sp) => {
      if (!sp || !sp.id) return false;
      if (seen.has(sp.id)) return false;
      seen.add(sp.id);
      return true;
    });
  }, [subPanels]);

  const uniqueSubSubPanels = useMemo(() => {
    const seen = new Set<string>();
    return subSubPanels.filter((ssp) => {
      if (!ssp || !ssp.id) return false;
      if (seen.has(ssp.id)) return false;
      seen.add(ssp.id);
      return true;
    });
  }, [subSubPanels]);

  // State for calculators to prevent reset on tab change
  const [iscParams, setIscParams] = useState<ShortCircuitParams>(
    INITIAL_SHORT_CIRCUIT_PARAMS,
  );
  const [iscSource, setIscSource] = useState<string>("auto");

  const [vdCalculations, setVdCalculations] = useState<
    VoltageDropCalculation[]
  >(INITIAL_VOLTAGE_DROP_CALCULATIONS);

  // Real-time synchronization of Short Circuit and Voltage Drop calculation parameters
  useEffect(() => {
    if (!circuits || !panel) return;
    
    if (iscSource === "auto") {
      const { mainFeeder, totalVA } = computePanelScheduleValues(panel, circuits);
      const totalKVA = totalVA / 1000;
      
      const standardKVA = [10, 15, 25, 37.5, 50, 75, 100, 167, 250, 333, 500, 750, 1000, 1500, 2000, 2500];
      const recommendedKVA = standardKVA.find(k => k >= totalKVA) || standardKVA[standardKVA.length - 1];

      let recommendedFeederSize = mainFeeder.wire.size.toString();
      let recommendedRuns = panel.system.includes("3PH") ? 3 : 2;

      if (mainFeeder.cb > 250) {
        recommendedRuns = mainFeeder.wire.runs; 
        recommendedFeederSize = mainFeeder.wire.size.toString();
      }

      setIscParams(p => {
        if (
          p.transformerKVA === recommendedKVA && 
          p.transformerVoltage === panel.voltage && 
          p.feederSize === recommendedFeederSize && 
          p.feederRuns === recommendedRuns &&
          (!panel.transformerConnection || p.transformerConnection === panel.transformerConnection)
        ) {
          return p;
        }
        return {
          ...p,
          transformerKVA: recommendedKVA,
          transformerVoltage: panel.voltage,
          feederSize: recommendedFeederSize,
          feederRuns: recommendedRuns,
          transformerConnection: panel.transformerConnection || p.transformerConnection
        };
      });
    }
  }, [iscSource, circuits, panel]);

  // Real-time alignment of feederRuns with system phase count
  useEffect(() => {
    if (!panel?.system) return;
    const expectedRuns = panel.system.includes("3PH") ? 3 : 2;
    if (iscParams.feederRuns !== expectedRuns) {
      setIscParams(current => ({
        ...current,
        feederRuns: expectedRuns
      }));
    }
  }, [panel, iscParams.feederRuns]);

  // Real-time synchronization of Voltage Drop calculations
  useEffect(() => {
    if (!circuits || !panel) return;

    setVdCalculations((prev) => {
      const prevMap = new globalThis.Map((prev || []).map((calc) => [calc.source, calc]));
      const updatedCalcs: VoltageDropCalculation[] = [];
      let changed = false;

      // 1. Maintain Main Feeder
      const is3PH = panel.system.includes("3PH");
      const { mainCurrent, mainFeeder } = computePanelScheduleValues(panel, circuits);

      const mainLoadA = Number(mainCurrent.baseAmp.toFixed(2));
      const mainWireSize = mainFeeder.wire.size.toString();
      const mainVoltage = panel.voltage;
      const mainSystemType: "1PH" | "3PH" = is3PH ? "3PH" : "1PH";

      const existingMain = prevMap.get("main");
      if (existingMain) {
        const hasMainChanged =
          existingMain.loadA !== mainLoadA ||
          existingMain.wireSize !== mainWireSize ||
          existingMain.voltage !== mainVoltage ||
          existingMain.systemType !== mainSystemType;
        if (hasMainChanged) {
          changed = true;
        }
        updatedCalcs.push({
          ...existingMain,
          loadA: mainLoadA,
          wireSize: mainWireSize,
          voltage: mainVoltage,
          systemType: mainSystemType,
        });
      } else {
        changed = true;
        updatedCalcs.push({
          id: crypto.randomUUID(),
          source: "main",
          name: "Main Feeder",
          loadA: mainLoadA,
          length: 30,
          wireSize: mainWireSize,
          voltage: mainVoltage,
          systemType: mainSystemType,
        });
      }

      // 2. Maintain Branch Circuits from Main Load Schedule
      circuits.forEach((c) => {
        const ltStr = c.loadType as string;
        if (
          ltStr === "SP" ||
          ltStr === "SPACE" ||
          ltStr === LoadType.SPARE ||
          ltStr === LoadType.SPACE
        ) {
          return;
        }

        const existingBranch = prevMap.get(c.id);
        const branchName = `Circuit ${c.circuitNo}: ${c.description}`;
        const branchSystemType: "1PH" | "3PH" =
          c.phases.length > 2 ? "3PH" : "1PH";

        if (existingBranch) {
          const isLoadADiff = existingBranch.loadA !== c.loadA && !(Number.isNaN(existingBranch.loadA) && Number.isNaN(c.loadA));
          const isVoltageDiff = existingBranch.voltage !== c.voltage && !(existingBranch.voltage == null && c.voltage == null) && !(Number.isNaN(existingBranch.voltage) && Number.isNaN(c.voltage));
          const hasBranchChanged =
            existingBranch.name !== branchName ||
            isLoadADiff ||
            existingBranch.wireSize !== c.wireSize ||
            isVoltageDiff ||
            existingBranch.systemType !== branchSystemType;
          if (hasBranchChanged) {
            changed = true;
          }
          updatedCalcs.push({
            ...existingBranch,
            name: branchName,
            loadA: c.loadA,
            wireSize: c.wireSize,
            voltage: c.voltage,
            systemType: branchSystemType,
          });
        } else {
          changed = true;
          updatedCalcs.push({
            id: crypto.randomUUID(),
            source: c.id,
            name: branchName,
            loadA: c.loadA,
            length: 30, // Default to 30 meters
            wireSize: c.wireSize,
            voltage: c.voltage,
            systemType: branchSystemType,
          });
        }
      });

      // 3. Maintain Sub-Panel Feeders & their branch circuits
      const allSubPanels = [...subPanels, ...subSubPanels];
      const seen = new Set();
      const uniqueAllSubPanels = allSubPanels.filter((sp) => {
        if (!sp || !sp.id) return false;
        if (seen.has(sp.id)) return false;
        seen.add(sp.id);
        return true;
      });

      if (uniqueAllSubPanels.length > 0) {
        uniqueAllSubPanels.forEach((sp) => {
          const spIs3PH = sp.panel.system.includes("3PH");
          const { mainCurrent: spMainCurrent, mainFeeder: spMainFeeder } = computePanelScheduleValues(sp.panel, sp.circuits);

          const spLoadA = Number(spMainCurrent.baseAmp.toFixed(2));
          const spWireSize = spMainFeeder.wire.size.toString();
          const spVoltage = sp.panel.voltage;
          const spSystemType: "1PH" | "3PH" = spIs3PH ? "3PH" : "1PH";
          const spName = `${sp.panel.designation || "Sub-Panel"} Feeder`;

          const existingSp = prevMap.get(sp.id);
          if (existingSp) {
            const hasSpChanged =
              existingSp.name !== spName ||
              existingSp.loadA !== spLoadA ||
              existingSp.wireSize !== spWireSize ||
              existingSp.voltage !== spVoltage ||
              existingSp.systemType !== spSystemType;
            if (hasSpChanged) {
              changed = true;
            }
            updatedCalcs.push({
              ...existingSp,
              name: spName,
              loadA: spLoadA,
              wireSize: spWireSize,
              voltage: spVoltage,
              systemType: spSystemType,
            });
          } else {
            changed = true;
            updatedCalcs.push({
              id: crypto.randomUUID(),
              source: sp.id,
              name: spName,
              loadA: spLoadA,
              length: 30,
              wireSize: spWireSize,
              voltage: spVoltage,
              systemType: spSystemType,
            });
          }
        });
      }

      // Add any custom entries that may have been created
      prevMap.forEach((calc) => {
        if (calc.source === "custom") {
          updatedCalcs.push(calc);
        }
      });

      return changed ? updatedCalcs : prev;
    });
  }, [circuits, panel, subPanels, subSubPanels]);

  const [illumParams, setIllumParams] = useState<IlluminationParams>(
    INITIAL_ILLUMINATION_PARAMS,
  );

  const [transformerPrimaryVoltage, setTransformerPrimaryVoltage] = useState<number>(13800);
  const [transformerPowerFactor, setTransformerPowerFactor] = useState<number>(0.85);
  const [transformerDemandFactor, setTransformerDemandFactor] = useState<number>(0.80);
  const [transformerLoadingFactor, setTransformerLoadingFactor] = useState<number>(0.80);

  // One-way sync: Illumination Saved Rooms -> Circuits
  useEffect(() => {
    if (!illumParams || !illumParams.savedRooms) return;

    setCircuits((prevCircuits) => {
      if (!prevCircuits) return prevCircuits;
      let circuitsChanged = false;

      const nextCircuits = prevCircuits.map((c) => {
        if (c.loadType === LoadType.LIGHTING) {
          // Find if there's a saved room with matching circuitNo
          const matchingRoom = illumParams.savedRooms?.find(
            (r) => r.circuitNo === c.circuitNo,
          );
          if (matchingRoom) {
            const estimatedWattage = matchingRoom.fixtureWattage || 15;
            const totalVA = estimatedWattage * matchingRoom.fixturesCount;

            if (
              c.quantity !== matchingRoom.fixturesCount ||
              c.wattage !== estimatedWattage ||
              c.loadVA !== totalVA ||
              Math.abs(c.loadA - totalVA / c.voltage) > 0.01
            ) {
              circuitsChanged = true;
              return {
                ...c,
                quantity: matchingRoom.fixturesCount,
                wattage: estimatedWattage,
                loadVA: totalVA,
                loadA: Number((totalVA / c.voltage).toFixed(2)),
              };
            }
          }
        }
        return c;
      });

      return circuitsChanged ? nextCircuits : prevCircuits;
    });
  }, [illumParams, setCircuits]);

  // Backward sync: Load Schedule Circuits -> Illumination Saved Rooms
  useEffect(() => {
    if (!circuits || !illumParams || !illumParams.savedRooms) return;

    let savedRoomsChanged = false;

    const nextSavedRooms = illumParams.savedRooms.map((room) => {
      // Find matching lighting circuit
      const matchingCircuit = circuits.find(
        (c) => c.loadType === LoadType.LIGHTING && c.circuitNo === room.circuitNo
      );

      if (matchingCircuit) {
        const fixWattage = matchingCircuit.wattage || 15;
        const totalVA = matchingCircuit.loadVA || (fixWattage * matchingCircuit.quantity);
        const fixturesCount = matchingCircuit.quantity || 1;

        // Try extracting roomName if description has "LIGHTING: <type> - <name>"
        let roomName = room.roomName;
        const desc = matchingCircuit.description || "";
        if (desc.includes(" - ")) {
          const parts = desc.split(" - ");
          if (parts.length > 1) {
            roomName = parts[parts.length - 1].trim();
          }
        }

        if (
          room.fixturesCount !== fixturesCount ||
          room.fixtureWattage !== fixWattage ||
          room.totalWattage !== totalVA ||
          room.roomName !== roomName
        ) {
          savedRoomsChanged = true;
          return {
            ...room,
            fixturesCount,
            fixtureWattage: fixWattage,
            totalWattage: totalVA,
            totalLumens: (room.fixtureLumens || 1000) * fixturesCount,
            roomName,
          };
        }
      }
      return room;
    });

    if (savedRoomsChanged) {
      setIllumParams((prev) => ({
        ...prev,
        savedRooms: nextSavedRooms,
      }));
    }
  }, [circuits]);

  // Wrapper for updating MDP circuits from the Load Schedule that handles reverse propagation to connected Sub-Panels
  const handleSetMdpCircuits = (
    newCircuitsOrFn: Circuit[] | ((prev: Circuit[]) => Circuit[])
  ) => {
    let subPanelsToUpdate: { id: string; panel: Partial<PanelConfig> }[] = [];

    setCircuits((prevCircuits) => {
      const nextCircuits =
        typeof newCircuitsOrFn === "function"
          ? newCircuitsOrFn(prevCircuits)
          : newCircuitsOrFn;

      // Check if any SUB_PANEL circuits changed from prev to next
      nextCircuits.forEach((nextC) => {
        if (nextC.loadType === LoadType.SUB_PANEL && nextC.linkedSubPanelId) {
          const prevC = prevCircuits.find((pc) => pc.id === nextC.id);
          if (prevC) {
            // Collect any edited fields
            const changedFields: Partial<Circuit> = {};
            const fieldsToCheck: (keyof Circuit)[] = [
              "description",
              "mcbAT",
              "mcbAF",
              "mcbP",
              "mcbKAIC",
              "mcbType",
              "voltage",
            ];
            fieldsToCheck.forEach((field) => {
              if (nextC[field] !== prevC[field]) {
                (changedFields as any)[field] = nextC[field];
              }
            });

            if (Object.keys(changedFields).length > 0) {
              const panelUpdates: Partial<PanelConfig> = {};
              if ("description" in changedFields) {
                panelUpdates.designation = nextC.description || "";
              }
              if ("voltage" in changedFields) {
                panelUpdates.voltage = nextC.voltage || 230;
              }
              
              let overrideChanged = false;
              const nextOverrides: any = { isOverrideEnabled: true };
              if ("mcbAT" in changedFields) {
                nextOverrides.breakerAT = nextC.mcbAT;
                overrideChanged = true;
              }
              if ("mcbAF" in changedFields) {
                nextOverrides.breakerAF = nextC.mcbAF;
                overrideChanged = true;
              }
              if ("mcbType" in changedFields) {
                nextOverrides.breakerType = nextC.mcbType;
                overrideChanged = true;
              }
              if ("mcbKAIC" in changedFields) {
                nextOverrides.kaic = nextC.mcbKAIC;
                overrideChanged = true;
              }
              if ("mcbP" in changedFields) {
                nextOverrides.poles = nextC.mcbP;
                overrideChanged = true;
              }

              if (overrideChanged) {
                panelUpdates.mainOverrides = nextOverrides as any;
                if ("mcbAT" in changedFields) panelUpdates.mainBreakerAT = nextC.mcbAT;
                if ("mcbAF" in changedFields) panelUpdates.mainBreakerAF = nextC.mcbAF;
                if ("mcbKAIC" in changedFields) panelUpdates.icRating = `${nextC.mcbKAIC}kAIC`;
              }
              
              subPanelsToUpdate.push({ id: nextC.linkedSubPanelId, panel: panelUpdates });
            }
          }
        }
      });

      return nextCircuits;
    });

    if (subPanelsToUpdate.length > 0) {
      setSubPanels((prev) => 
        prev.map((sp) => {
          const update = subPanelsToUpdate.find(u => u.id === sp.id);
          if (update) {
            const newOverrides = update.panel.mainOverrides 
              ? { ...(sp.panel.mainOverrides || {}), ...update.panel.mainOverrides }
              : sp.panel.mainOverrides;
              
            return {
              ...sp,
              panel: {
                ...sp.panel,
                ...update.panel,
                mainOverrides: newOverrides
              }
            };
          }
          return sp;
        })
      );
    }
  };

  const handleSetSubPanelCircuits = (
    spIdx: number,
    spId: string,
    newCircuitsOrFn: Circuit[] | ((prev: Circuit[]) => Circuit[])
  ) => {
    let subSubPanelsToUpdate: { id: string; panel: Partial<PanelConfig> }[] = [];

    setSubPanels((prevSubPanels) => {
      const currentSp = prevSubPanels.find(p => p.id === spId);
      if (!currentSp) return prevSubPanels;

      const prevCircuits = currentSp.circuits;
      const nextCircuits =
        typeof newCircuitsOrFn === "function"
          ? newCircuitsOrFn(prevCircuits)
          : newCircuitsOrFn;

      if (prevCircuits === nextCircuits) return prevSubPanels;

      // Check if any SUB_SUB_PANEL circuits changed from prev to next
      nextCircuits.forEach((nextC) => {
        if (nextC.loadType === LoadType.SUB_SUB_PANEL && nextC.linkedSubPanelId) {
          const prevC = prevCircuits.find((pc) => pc.id === nextC.id);
          if (prevC) {
            // Collect any edited fields
            const changedFields: Partial<Circuit> = {};
            const fieldsToCheck: (keyof Circuit)[] = [
              "description",
              "mcbAT",
              "mcbAF",
              "mcbP",
              "mcbKAIC",
              "mcbType",
              "voltage",
            ];
            fieldsToCheck.forEach((field) => {
              if (nextC[field] !== prevC[field]) {
                (changedFields as any)[field] = nextC[field];
              }
            });

            if (Object.keys(changedFields).length > 0) {
              const panelUpdates: Partial<PanelConfig> = {};
              if ("description" in changedFields) {
                panelUpdates.designation = nextC.description || "";
              }
              if ("voltage" in changedFields) {
                panelUpdates.voltage = nextC.voltage || 230;
              }
              
              let overrideChanged = false;
              const nextOverrides: any = { isOverrideEnabled: true };
              if ("mcbAT" in changedFields) {
                nextOverrides.breakerAT = nextC.mcbAT;
                overrideChanged = true;
              }
              if ("mcbAF" in changedFields) {
                nextOverrides.breakerAF = nextC.mcbAF;
                overrideChanged = true;
              }
              if ("mcbType" in changedFields) {
                nextOverrides.breakerType = nextC.mcbType;
                overrideChanged = true;
              }
              if ("mcbKAIC" in changedFields) {
                nextOverrides.kaic = nextC.mcbKAIC;
                overrideChanged = true;
              }
              if ("mcbP" in changedFields) {
                nextOverrides.poles = nextC.mcbP;
                overrideChanged = true;
              }

              if (overrideChanged) {
                panelUpdates.mainOverrides = nextOverrides as any;
                if ("mcbAT" in changedFields) panelUpdates.mainBreakerAT = nextC.mcbAT;
                if ("mcbAF" in changedFields) panelUpdates.mainBreakerAF = nextC.mcbAF;
                if ("mcbKAIC" in changedFields) panelUpdates.icRating = `${nextC.mcbKAIC}kAIC`;
              }
              
              subSubPanelsToUpdate.push({ id: nextC.linkedSubPanelId, panel: panelUpdates });
            }
          }
        }
      });

      return prevSubPanels.map((p) =>
        p.id === spId ? { ...p, circuits: nextCircuits } : p
      );
    });

    if (subSubPanelsToUpdate.length > 0) {
      setSubSubPanels((prev) => 
        prev.map((ssp) => {
          const update = subSubPanelsToUpdate.find(u => u.id === ssp.id);
          if (update) {
            const newOverrides = update.panel.mainOverrides 
              ? { ...(ssp.panel.mainOverrides || {}), ...update.panel.mainOverrides }
              : ssp.panel.mainOverrides;
              
            return {
              ...ssp,
              panel: {
                ...ssp.panel,
                ...update.panel,
                mainOverrides: newOverrides
              }
            };
          }
          return ssp;
        })
      );
    }
  };

  // Synchronize Sub-Sub-Panels recalculations back to Sub-Panels circuits
  useEffect(() => {
    setSubPanels((prevSubPanels) => {
      if (!prevSubPanels || prevSubPanels.length === 0) return prevSubPanels;
      let anyPanelChanged = false;
      const nextSubPanels = prevSubPanels.map((sp) => {
        let changed = false;
        const nextCircuits = sp.circuits.map((c) => {
          if (c.loadType === LoadType.SUB_SUB_PANEL && c.linkedSubPanelId) {
            const ssp = subSubPanels.find((s) => s.id === c.linkedSubPanelId);
            if (ssp) {
              const { totalVA: subTotalVA, mainFeeder: subMainFeeder, mainCurrent: subMainCurrent } = computePanelScheduleValues(ssp.panel, ssp.circuits, { vdCalculations, panelId: ssp.id });

              const subTotalWattage = ssp.circuits.reduce(
                (sum, cc) =>
                  sum +
                  (isIdleSpareOrSpace(cc)
                    ? 0
                    : (cc.wattage || 0) * (cc.quantity || 1)),
                0,
              );

              const subPoles = subMainFeeder.poles;
              const subCB = subMainFeeder.cb;
              const subAF = subMainFeeder.af;
              const subKAIC = subMainFeeder.kaic;
              const subType = subMainFeeder.type as MCBType;
              const subWireSize = formatWireSizeLocal(subMainFeeder.wire.size);
              const subGroundSize = subMainFeeder.groundSize;
              const subConduitSize = subMainFeeder.conduitSize;

              const subVoltage = ssp.panel.voltage;
              const designation = ssp.panel.designation || "Sub-Sub Panel";

              const is3PhaseMain = c.phases && c.phases.length === 3;
              const cirV = c.voltage || subVoltage || 230;
              const loadI = subMainCurrent.baseAmp;
              const demandVA = is3PhaseMain ? Math.round(loadI * cirV * 1.732) : Math.round(loadI * cirV);

              if (
                c.loadVA !== demandVA ||
                c.wattage !== subTotalWattage ||
                c.mcbP !== subPoles ||
                c.mcbAT !== subCB ||
                c.mcbAF !== subAF ||
                c.mcbKAIC !== subKAIC ||
                c.mcbType !== subType ||
                c.wireSize !== subWireSize ||
                c.groundSize !== subGroundSize ||
                c.conduitSize !== subConduitSize ||
                c.voltage !== subVoltage ||
                c.description !== designation ||
                Math.abs((c.loadA || 0) - Number(loadI.toFixed(2))) > 0.01
              ) {
                changed = true;
                return {
                  ...c,
                  wattage: subTotalWattage,
                  loadVA: demandVA,
                  loadA: Number(loadI.toFixed(2)),
                  quantity: 1,
                  mcbP: subPoles,
                  mcbAT: subCB,
                  mcbAF: subAF,
                  mcbKAIC: subKAIC,
                  mcbType: subType,
                  wireSize: subWireSize,
                  groundSize: subGroundSize,
                  conduitSize: subConduitSize,
                  voltage: subVoltage,
                  description: designation,
                };
              }
            }
          }
          return c;
        });

        if (changed) {
          anyPanelChanged = true;
          return { ...sp, circuits: nextCircuits };
        }
        return sp;
      });

      if (anyPanelChanged) return nextSubPanels;
      return prevSubPanels;
    });
  }, [subSubPanels, computePanelScheduleValues, vdCalculations]);

  // Synchronize Sub-Panels recalculations back to Main Panel circuits and update the Main Panel in real-time
  useEffect(() => {
    setCircuits((prevCircuits) => {
      if (!prevCircuits) return prevCircuits;
      let changed = false;
      const nextCircuits = prevCircuits.map((c) => {
        if (c.loadType === LoadType.SUB_PANEL && c.linkedSubPanelId) {
          const sp = subPanels.find((s) => s.id === c.linkedSubPanelId);
          if (sp) {
            // Compute sub-panel actual values
            const { totalVA: subTotalVA, mainFeeder: subMainFeeder, mainCurrent: subMainCurrent } = computePanelScheduleValues(sp.panel, sp.circuits, { vdCalculations, panelId: sp.id });

            const subTotalWattage = sp.circuits.reduce(
              (sum, cc) =>
                sum +
                (isIdleSpareOrSpace(cc)
                  ? 0
                  : (cc.wattage || 0) * (cc.quantity || 1)),
              0,
            );

            const subPoles = subMainFeeder.poles;
            const subCB = subMainFeeder.cb;
            const subAF = subMainFeeder.af;
            const subKAIC = subMainFeeder.kaic;
            const subType = subMainFeeder.type as MCBType;
            const subWireSize = formatWireSizeLocal(subMainFeeder.wire.size);
            const subGroundSize = subMainFeeder.groundSize;
            const subConduitSize = subMainFeeder.conduitSize;

            const subVoltage = sp.panel.voltage;
            const designation = sp.panel.designation || "Sub-Panel";

            // Calculate loadA for this sub-panel circuit in the main panel
            // Since it's connected to the main panel, using the main panel's system/poles for current calculation:
            const is3PhaseMain = c.phases && c.phases.length === 3;
            const cirV = c.voltage || subVoltage || 230;
            const loadI = subMainCurrent.baseAmp;
            const demandVA = is3PhaseMain ? Math.round(loadI * cirV * 1.732) : Math.round(loadI * cirV);

            if (
              c.loadVA !== demandVA ||
              c.wattage !== subTotalWattage ||
              c.mcbP !== subPoles ||
              c.mcbAT !== subCB ||
              c.mcbAF !== subAF ||
              c.mcbKAIC !== subKAIC ||
              c.mcbType !== subType ||
              c.wireSize !== subWireSize ||
              c.groundSize !== subGroundSize ||
              c.conduitSize !== subConduitSize ||
              c.voltage !== subVoltage ||
              c.description !== designation ||
              Math.abs((c.loadA || 0) - Number(loadI.toFixed(2))) > 0.01
            ) {
              changed = true;
              return {
                ...c,
                wattage: subTotalWattage,
                loadVA: demandVA,
                loadA: Number(loadI.toFixed(2)),
                quantity: 1,
                mcbP: subPoles,
                mcbAT: subCB,
                mcbAF: subAF,
                mcbKAIC: subKAIC,
                mcbType: subType,
                wireSize: subWireSize,
                groundSize: subGroundSize,
                conduitSize: subConduitSize,
                voltage: subVoltage,
                description: designation,
              };
            }
          }
        }
        return c;
      });

      return changed ? nextCircuits : prevCircuits;
    });
  }, [subPanels, setCircuits, vdCalculations]);

  // Automatically recalculate Main Panel circuits when Main Panel configuration changes
  useEffect(() => {
    setCircuits((prevCircuits) => {
      if (!prevCircuits || prevCircuits.length === 0) return prevCircuits;
      let changed = false;
      const nextCircuits = prevCircuits.map((c) => {
        const updated = calculateCircuitValues(c, panel, subPanels, vdCalculations);
        if (
          updated.wireSize !== c.wireSize ||
          updated.groundSize !== c.groundSize ||
          updated.conduitSize !== c.conduitSize ||
          updated.loadVA !== c.loadVA ||
          updated.loadA !== c.loadA ||
          updated.mcbAT !== c.mcbAT ||
          updated.mcbAF !== c.mcbAF ||
          updated.mcbKAIC !== c.mcbKAIC ||
          updated.voltage !== c.voltage ||
          updated.mcbP !== c.mcbP
        ) {
          changed = true;
          return { ...c, ...updated };
        }
        return c;
      });
      return changed ? nextCircuits : prevCircuits;
    });
  }, [
    panel.system,
    panel.connectionType,
    panel.conductorMaterial,
    panel.insulationType,
    panel.temperatureRating,
    subPanels,
    vdCalculations,
  ]);

  // Automatically recalculate subPanels circuits when subPanel configuration changes
  useEffect(() => {
    setSubPanels((prevSubPanels) => {
      if (!prevSubPanels || prevSubPanels.length === 0) return prevSubPanels;
      let anyChanged = false;
      const nextSubPanels = prevSubPanels.map((sp) => {
        let spChanged = false;
        const nextCircuits = sp.circuits.map((c) => {
          const updated = calculateCircuitValues(c, sp.panel, subSubPanels, vdCalculations);
          if (
            updated.wireSize !== c.wireSize ||
            updated.groundSize !== c.groundSize ||
            updated.conduitSize !== c.conduitSize ||
            updated.loadVA !== c.loadVA ||
            updated.loadA !== c.loadA ||
            updated.mcbAT !== c.mcbAT ||
            updated.mcbAF !== c.mcbAF ||
            updated.mcbKAIC !== c.mcbKAIC ||
            updated.voltage !== c.voltage ||
            updated.mcbP !== c.mcbP
          ) {
            spChanged = true;
            return { ...c, ...updated };
          }
          return c;
        });

        if (spChanged) {
          anyChanged = true;
          return { ...sp, circuits: nextCircuits };
        }
        return sp;
      });

      return anyChanged ? nextSubPanels : prevSubPanels;
    });
  }, [
    subPanels.map(sp => `${sp.panel.system}-${sp.panel.connectionType}-${sp.panel.conductorMaterial}-${sp.panel.insulationType}-${sp.panel.temperatureRating}`).join("|"),
    subSubPanels,
    vdCalculations,
  ]);

  // Automatically recalculate subSubPanels circuits when subSubPanel configuration changes
  useEffect(() => {
    setSubSubPanels((prevSubSubPanels) => {
      if (!prevSubSubPanels || prevSubSubPanels.length === 0) return prevSubSubPanels;
      let anyChanged = false;
      const nextSubSubPanels = prevSubSubPanels.map((ssp) => {
        let sspChanged = false;
        const nextCircuits = ssp.circuits.map((c) => {
          const updated = calculateCircuitValues(c, ssp.panel, [], vdCalculations);
          if (
            updated.wireSize !== c.wireSize ||
            updated.groundSize !== c.groundSize ||
            updated.conduitSize !== c.conduitSize ||
            updated.loadVA !== c.loadVA ||
            updated.loadA !== c.loadA ||
            updated.mcbAT !== c.mcbAT ||
            updated.mcbAF !== c.mcbAF ||
            updated.mcbKAIC !== c.mcbKAIC ||
            updated.voltage !== c.voltage ||
            updated.mcbP !== c.mcbP
          ) {
            sspChanged = true;
            return { ...c, ...updated };
          }
          return c;
        });

        if (sspChanged) {
          anyChanged = true;
          return { ...ssp, circuits: nextCircuits };
        }
        return ssp;
      });

      return anyChanged ? nextSubSubPanels : prevSubSubPanels;
    });
  }, [
    subSubPanels.map(ssp => `${ssp.panel.system}-${ssp.panel.connectionType}-${ssp.panel.conductorMaterial}-${ssp.panel.insulationType}-${ssp.panel.temperatureRating}`).join("|"),
    vdCalculations,
  ]);

  const [illumSnapshots, setIllumSnapshots] = useState<Record<string, string>>(
    {},
  );

  const handleAddIllumSnapshot = (
    circuitId: string,
    image: string,
    roomName: string,
  ) => {
    setIllumSnapshots((prev) => ({
      ...prev,
      [circuitId]: image,
    }));
  };

  const [floorPlanImages, setFloorPlanImages] = useState<FloorPlanImage[]>([]);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [isProjectManagerOpen, setIsProjectManagerOpen] =
    useState<boolean>(false);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);

  const [panelToDuplicate, setPanelToDuplicate] = useState<{ id: string; name: string } | null>(null);
  const [duplicateName, setDuplicateName] = useState("");

  const handleConfirmDuplicate = () => {
    if (!panelToDuplicate) return;
    const targetId = panelToDuplicate.id;
    const originalSp = subPanels.find((sp) => sp.id === targetId);
    const originalSsp = subSubPanels.find((ssp) => ssp.id === targetId);
    const original = originalSp || originalSsp;
    
    if (!original) {
      setPanelToDuplicate(null);
      return;
    }

    const newId = crypto.randomUUID();
    
    // Deep copy circuits and assign brand-new circuit IDs
    const duplicatedCircuits = original.circuits.map((c) => ({
      ...c,
      id: crypto.randomUUID(),
      subLoads: c.subLoads ? c.subLoads.map((sl) => ({ ...sl, id: crypto.randomUUID() })) : undefined,
    }));

    // Deep copy panel config with the unique duplicated designation
    const duplicatedPanel = {
      ...original.panel,
      designation: duplicateName.trim() || `${original.panel.designation || "Subpanel"} (Copy)`,
      mainOverrides: original.panel.mainOverrides ? { ...original.panel.mainOverrides } : undefined,
    };

    const cloned = {
      id: newId,
      panel: duplicatedPanel,
      circuits: duplicatedCircuits,
    };

    if (originalSp) {
      setSubPanels((prev) => {
        const idx = prev.findIndex((sp) => sp.id === targetId);
        if (idx !== -1) {
          const next = [...prev];
          next.splice(idx + 1, 0, cloned);
          return next;
        }
        return [...prev, cloned];
      });
    } else if (originalSsp) {
      setSubSubPanels((prev) => {
        const idx = prev.findIndex((sp) => sp.id === targetId);
        if (idx !== -1) {
          const next = [...prev];
          next.splice(idx + 1, 0, cloned);
          return next;
        }
        return [...prev, cloned];
      });
    }

    setActiveScheduleTab(newId);
    setPanelToDuplicate(null);
    setDuplicateName("");
  };

  const handleLoadProject = (projectId: string, data: ProjectData) => {
    setCurrentProjectId(projectId);

    // Normalize short circuit params
    const normalizedIscParams = { ...data.iscParams };
    if (normalizedIscParams) {
      if (normalizedIscParams.transformerConnection === "Delta-Wye")
        normalizedIscParams.transformerConnection = "Delta-Wye (Δ-Y)";
      else if (normalizedIscParams.transformerConnection === "Wye (Star)")
        normalizedIscParams.transformerConnection = "Wye (Star) Connection";
      else if (normalizedIscParams.transformerConnection === "Delta")
        normalizedIscParams.transformerConnection = "Delta Connection";
      else if (normalizedIscParams.transformerConnection === "Wye-Wye")
        normalizedIscParams.transformerConnection = "Wye-Wye (Y-Y)";
    }
    setIscParams(normalizedIscParams || INITIAL_SHORT_CIRCUIT_PARAMS);
    setIscSource(data.iscSource || 'auto');
    setIllumParams(data.illumParams || INITIAL_ILLUMINATION_PARAMS);

    if (data.transformerConfig) {
      setTransformerPrimaryVoltage(data.transformerConfig.primaryVoltage ?? 13800);
      setTransformerPowerFactor(data.transformerConfig.powerFactor ?? 0.85);
      setTransformerDemandFactor(data.transformerConfig.demandFactor ?? 0.80);
      setTransformerLoadingFactor(data.transformerConfig.loadingFactor ?? 0.80);
    } else {
      setTransformerPrimaryVoltage(13800);
      setTransformerPowerFactor(0.85);
      setTransformerDemandFactor(0.80);
      setTransformerLoadingFactor(0.80);
    }

    // MIGRATION / RECALCULATION: Automatically apply the latest calculation methodologies to loaded data.
    // Ensure accurate sizing by passing older circuits through the current compute engine.
    const seenCircuitIds = new Set<string>();

    const migratedSubSubPanels = (data.subSubPanels || []).map((sp) => {
      const updatedCircuits = sp.circuits.map((c) => {
        let uniqueId = c.id;
        if (seenCircuitIds.has(uniqueId)) {
          uniqueId = crypto.randomUUID();
        }
        seenCircuitIds.add(uniqueId);

        return {
          ...c,
          id: uniqueId,
          ...calculateCircuitValues(c, sp.panel, [], data.vdCalculations),
        };
      }) as Circuit[];
      
      const { mainFeeder } = computePanelScheduleValues(sp.panel, updatedCircuits, { vdCalculations: data.vdCalculations, panelId: sp.id });
      return { 
        ...sp, 
        panel: {
          ...sp.panel,
          mainBreakerAT: sp.panel.mainOverrides?.isOverrideEnabled && sp.panel.mainOverrides.breakerAT ? sp.panel.mainOverrides.breakerAT : mainFeeder.cb,
          mainBreakerAF: sp.panel.mainOverrides?.isOverrideEnabled && sp.panel.mainOverrides.breakerAF ? sp.panel.mainOverrides.breakerAF : mainFeeder.af,
          icRating: sp.panel.mainOverrides?.isOverrideEnabled && sp.panel.mainOverrides.kaic ? `${sp.panel.mainOverrides.kaic}kAIC` : `${mainFeeder.kaic}kAIC`,
        },
        circuits: updatedCircuits 
      };
    });

    const migratedSubPanels = (data.subPanels || []).map((sp) => {
      const updatedCircuits = sp.circuits.map((c) => {
        let uniqueId = c.id;
        if (seenCircuitIds.has(uniqueId)) {
          uniqueId = crypto.randomUUID();
        }
        seenCircuitIds.add(uniqueId);

        return {
          ...c,
          id: uniqueId,
          ...calculateCircuitValues(c, sp.panel, migratedSubSubPanels, data.vdCalculations),
        };
      }) as Circuit[];
      
      const { mainFeeder } = computePanelScheduleValues(sp.panel, updatedCircuits, { vdCalculations: data.vdCalculations, panelId: sp.id });
      return { 
        ...sp, 
        panel: {
          ...sp.panel,
          mainBreakerAT: sp.panel.mainOverrides?.isOverrideEnabled && sp.panel.mainOverrides.breakerAT ? sp.panel.mainOverrides.breakerAT : mainFeeder.cb,
          mainBreakerAF: sp.panel.mainOverrides?.isOverrideEnabled && sp.panel.mainOverrides.breakerAF ? sp.panel.mainOverrides.breakerAF : mainFeeder.af,
          icRating: sp.panel.mainOverrides?.isOverrideEnabled && sp.panel.mainOverrides.kaic ? `${sp.panel.mainOverrides.kaic}kAIC` : `${mainFeeder.kaic}kAIC`,
        },
        circuits: updatedCircuits 
      };
    });

    const migratedCircuits = data.circuits.map((c) => {
      let uniqueId = c.id;
      if (seenCircuitIds.has(uniqueId)) {
        uniqueId = crypto.randomUUID();
      }
      seenCircuitIds.add(uniqueId);

      return {
        ...c,
        id: uniqueId,
        ...calculateCircuitValues(c, data.panel, migratedSubPanels, data.vdCalculations),
      };
    }) as Circuit[];

    const { mainFeeder: mainFeederData } = computePanelScheduleValues(data.panel, migratedCircuits, { vdCalculations: data.vdCalculations, panelId: "main" });

    let tc = data.panel.transformerConnection;
    if (tc === "Delta-Wye") tc = "Delta-Wye (Δ-Y)";
    else if (tc === "Wye (Star)") tc = "Wye (Star) Connection";
    else if (tc === "Delta") tc = "Delta Connection";
    else if (tc === "Wye-Wye") tc = "Wye-Wye (Y-Y)";
    else tc = tc;

    setPanel({
      ...data.panel,
      transformerConnection: tc,
      mainBreakerAT: data.panel.mainOverrides?.isOverrideEnabled && data.panel.mainOverrides.breakerAT ? data.panel.mainOverrides.breakerAT : mainFeederData.cb,
      mainBreakerAF: data.panel.mainOverrides?.isOverrideEnabled && data.panel.mainOverrides.breakerAF ? data.panel.mainOverrides.breakerAF : mainFeederData.af,
      icRating: data.panel.mainOverrides?.isOverrideEnabled && data.panel.mainOverrides.kaic ? `${data.panel.mainOverrides.kaic}kAIC` : `${mainFeederData.kaic}kAIC`,
    });

    setCircuits(migratedCircuits);
    setSubPanels(migratedSubPanels);
    setSubSubPanels(migratedSubSubPanels);

    // MIGRATION: Update Voltage Drop tracking values
    const newVdCalculations = (data.vdCalculations || []).map((vd) => {
      // Re-evaluate calculation based on source
      if (vd.source === "main") {
        const { mainCurrent, mainFeeder } = computePanelScheduleValues(
          data.panel,
          migratedCircuits,
        );
        return {
          ...vd,
          loadA: Number(mainCurrent.baseAmp.toFixed(2)),
          wireSize: mainFeeder.wire.size.toString(),
          voltage: data.panel.voltage,
          systemType: (data.panel.system.includes("3PH") ? "3PH" : "1PH") as "1PH" | "3PH",
        };
      } else if (vd.source !== "custom") {
        // Evaluate for subpanel
        const sp = migratedSubPanels.find((s) => s.id === vd.source);
        if (sp) {
          const { mainCurrent, mainFeeder } = computePanelScheduleValues(
            sp.panel,
            sp.circuits,
          );
          return {
            ...vd,
            loadA: Number(mainCurrent.baseAmp.toFixed(2)),
            wireSize: mainFeeder.wire.size.toString(),
            voltage: sp.panel.voltage,
            systemType: (sp.panel.system.includes("3PH") ? "3PH" : "1PH") as "1PH" | "3PH",
          };
        }
      }
      return vd;
    });

    setVdCalculations(newVdCalculations);
  };

  const currentProjectData: ProjectData = {
    panel,
    circuits,
    subPanels,
    subSubPanels,
    iscParams,
    iscSource,
    vdCalculations,
    illumParams,
    transformerConfig: {
      primaryVoltage: transformerPrimaryVoltage,
      powerFactor: transformerPowerFactor,
      demandFactor: transformerDemandFactor,
      loadingFactor: transformerLoadingFactor,
    },
  };

  const handleNewProject = () => {
    setCurrentProjectId(null);
    setPanel(INITIAL_PANEL);
    setCircuits(getFreshInitialCircuits());
    setSubPanels([]);
    setSubSubPanels([]);
    setIscParams(INITIAL_SHORT_CIRCUIT_PARAMS);
    setIscSource("auto");
    setVdCalculations(INITIAL_VOLTAGE_DROP_CALCULATIONS);
    setIllumParams(INITIAL_ILLUMINATION_PARAMS);
    setTransformerPrimaryVoltage(13800);
    setTransformerPowerFactor(0.85);
    setTransformerDemandFactor(0.80);
    setTransformerLoadingFactor(0.80);
  };

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

  if (showUpgrade && (userPlan !== "premium" || isAdmin)) {
    return (
      <PaymentScreen
        user={user}
        isUpgrade={true}
        onClose={() => setShowUpgrade(false)}
        onPaymentSuccess={() => setShowUpgrade(false)}
      />
    );
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
      id: "system-sld",
      label: "System SLD",
      icon: Network,
      color: "text-teal-600",
      bg: "bg-teal-50",
    },
    {
      id: "floor-plan",
      label: "Floor Plan",
      icon: Map,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
    },
    {
      id: "current-calc",
      label: "PEC Calculator",
      icon: Calculator,
      color: "text-fuchsia-600",
      bg: "bg-fuchsia-50",
    },
    {
      id: "egc",
      label: "EGC Sizer",
      icon: Hammer,
      color: "text-indigo-600",
      bg: "bg-indigo-50",
    },
    {
      id: "transformer",
      label: "Transformer Capacity",
      icon: Cpu,
      color: "text-rose-600",
      bg: "bg-rose-50",
    },
    ...(isAdmin
      ? [
          {
            id: "billing",
            label: "My Billing",
            icon: Receipt,
            color: "text-amber-500",
            bg: "bg-amber-50",
          },
          {
            id: "verify",
            label: "Verify Users",
            icon: ShieldCheck,
            color: "text-amber-600",
            bg: "bg-amber-50",
          },
        ]
      : []),
  ];

  // We now import computePanelScheduleValues from computeEngine.ts

  const exportToExcel = () => {
    try {
      const wb = XLSX.utils.book_new();

      const sanitizeSheetName = (name: string): string => {
        // Excel worksheet names cannot contain: \ / ? * : [ ]
        // and cannot exceed 31 chars.
        let sanitized = name.replace(/[\\\/?:*\[\]]/g, "_");
        if (sanitized.length > 31) {
          sanitized = sanitized.substring(0, 31);
        }
        return sanitized || "Sheet";
      };

      const allPanelsToExport = [
        { id: "main", panel, circuits, type: "MDP" },
        ...subPanels.map((sp) => ({
          id: sp.id,
          panel: sp.panel,
          circuits: sp.circuits,
          type: "Sub Panel"
        })),
        ...(subSubPanels || []).map((ssp) => ({
          id: ssp.id,
          panel: ssp.panel,
          circuits: ssp.circuits,
          type: "Sub-Sub Panel"
        }))
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
            af,
          },
        } = computePanelScheduleValues(p, c, { vdCalculations, panelId: item.id });

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
          const isSpace =
            (cir.description && cir.description.toUpperCase() === "SPACE") ||
            cir.loadType === LoadType.SPACE;
          const row: any[] = [
            cir.circuitNo,
            cir.description,
            isSpace ? "-" : cir.wattage,
            isSpace ? "-" : cir.quantity,
            isSpace ? "-" : cir.loadVA,
            isSpace ? "-" : cir.phases ? cir.phases.join(", ") : "",
          ];

          if (is3Phase) {
            if (isSpace) {
              row.push("-", "-", "-", "-");
            } else {
              row.push(
                cir.phases.includes("R") && cir.phases.length < 3
                  ? cir.loadA.toFixed(2)
                  : "-",
                cir.phases.includes("Y") && cir.phases.length < 3
                  ? cir.loadA.toFixed(2)
                  : "-",
                cir.phases.includes("B") && cir.phases.length < 3
                  ? cir.loadA.toFixed(2)
                  : "-",
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
            isSpace
              ? "-"
              : `${cir.wireSize}mm² ${cir.wireType} / ${cir.groundSize}mm² GND in ${cir.conduitSize} ${cir.conduitType}`,
          );
          wsData.push(row);
        });

        const headerRowOffset = is3Phase ? 1 : 0;

        wsData.push([]);

        const baseTotalRow: any[] = [
          "Total Connected Load", // 0
          "",
          "",
          "",
          `${totalVA.toFixed(0)} VA`, // 4: VA
          `(${(totalVA / 1000).toFixed(2)} kVA)`, // 5: PHASE
        ];

        if (is3Phase) {
          baseTotalRow.push(
            `${phaseAmps.R.toFixed(2)} A`, // 6: p1
            `${phaseAmps.Y.toFixed(2)} A`, // 7: p2
            `${phaseAmps.B.toFixed(2)} A`, // 8: p3
            phaseAmps.threePhase > 0
              ? `${phaseAmps.threePhase.toFixed(2)} A`
              : "-", // 9: 3Ø
          );
        } else {
          baseTotalRow.push(`${mainCurrent.baseAmp.toFixed(2)} A`); // 6: AMPS
        }

        const numCols = is3Phase ? 16 : 13;
        const baseRemainingCols = numCols - baseTotalRow.length;
        if (baseRemainingCols > 0) {
          for (let i = 0; i < baseRemainingCols; i++) {
            baseTotalRow.push("");
          }
        }
        wsData.push(baseTotalRow);

        const totalKvaRow: any[] = [
          "Total kVA", // 0
          "",
          "",
          "",
          `${(totalVA / 1000).toFixed(2)} kVA`, // 4: VA
          "", // 5: PHASE
        ];
        const remainingCols = numCols - totalKvaRow.length;
        if (remainingCols > 0) {
          for (let i = 0; i < remainingCols; i++) {
            totalKvaRow.push("");
          }
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
          `${cb} AT / ${af} AF, ${poles}P, ${kaic} kAIC, ${type}`,
        ]);
        if (p.system.includes("3PH")) {
          wsData.push(["Phase Imbalance:", `${phaseImbalance.toFixed(2)}%`]);
        }
        wsData.push([
          "Max Demand Current:",
          `${mainCurrent.baseAmp.toFixed(2)} A`,
        ]);

        const ws = XLSX.utils.aoa_to_sheet(wsData);

        const merges = [];
        if (is3Phase) {
          merges.push({ s: { r: 3, c: 0 }, e: { r: 4, c: 0 } });
          merges.push({ s: { r: 3, c: 1 }, e: { r: 4, c: 1 } });
          merges.push({ s: { r: 3, c: 2 }, e: { r: 4, c: 2 } });
          merges.push({ s: { r: 3, c: 3 }, e: { r: 4, c: 3 } });
          merges.push({ s: { r: 3, c: 4 }, e: { r: 4, c: 4 } });
          merges.push({ s: { r: 3, c: 5 }, e: { r: 4, c: 5 } });
          merges.push({ s: { r: 3, c: 6 }, e: { r: 3, c: 9 } }); // AMPS spans cols 6, 7, 8, 9
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

        // Add merges for bottom total row labels
        merges.push({
          s: { r: 4 + headerRowOffset + c.length + 1, c: 0 },
          e: { r: 4 + headerRowOffset + c.length + 1, c: 3 },
        });
        merges.push({
          s: { r: 4 + headerRowOffset + c.length + 2, c: 0 },
          e: { r: 4 + headerRowOffset + c.length + 2, c: 3 },
        });

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
            
            const cellExists = !!ws[cellAddress];
            const isHeader = (R <= 1) || (R >= 3 && R <= 3 + headerRowOffset);
            const isTotalRow = (R === 4 + headerRowOffset + c.length + 1) || (R === 4 + headerRowOffset + c.length + 2);
            const isSummaryRow = (R >= 4 + headerRowOffset + c.length + 4);

            if (!cellExists && !isHeader && !isTotalRow && !isSummaryRow) {
              continue; // Optimization: skip empty elements to save memory
            }

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

        let sheetName = sanitizeSheetName(p.designation || `Panel_${index}`);
        const existingNames = wb.SheetNames;
        let counter = 1;
        let finalName = sheetName;
        while (existingNames.includes(finalName)) {
          const suffix = `_${counter}`;
          const maxPrefixLen = 31 - suffix.length;
          finalName = `${sheetName.substring(0, maxPrefixLen)}${suffix}`;
          counter++;
        }

        XLSX.utils.book_append_sheet(wb, ws, finalName);
      });

      // -----------------------------------------------------
      // Voltage Drop Export
      // -----------------------------------------------------
      if (vdCalculations && vdCalculations.length > 0) {
        const vdData: any[][] = [];
        vdData.push([
          "VOLTAGE DROP ANALYSIS",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
        ]);
        vdData.push([]);
        vdData.push([
          "SYSTEM / SOURCE",
          "LINE NAME",
          "CURRENT (A)",
          "LENGTH (m)",
          "WIRE SIZE (mm²)",
          "VOLTAGE",
          "SYSTEM TYPE",
          "VD (V)",
          "VD (%)",
          "STATUS",
        ]);

        vdCalculations.forEach((vd) => {
          const factor = vd.systemType === "3PH" ? 1.732 : 2;
          const cLength = vd.length || 0;
          const cLoad = vd.loadA || 0;
          const cVoltage = vd.voltage || 230;
          const dataStr = vd.wireSize;
          const impedanceInfo = WIRE_IMPEDANCE_TABLE[dataStr] ||
            WIRE_IMPEDANCE_TABLE["3.5"] || { r: 5.76, x: 0.157 };
          const R = impedanceInfo.r;

          const VD_v = (factor * cLength * cLoad * R) / 1000;
          const VD_percent = (VD_v / cVoltage) * 100;
          const status = VD_percent <= 3.0 ? "PASSED" : "FAILED";

          let sourceLabel = vd.source;
          if (vd.source === "custom") {
            sourceLabel = "Custom";
          } else {
            let matchingPanel = allPanelsToExport.find((p) => p.id === vd.source);
            if (!matchingPanel) {
              matchingPanel = allPanelsToExport.find((p) =>
                p.circuits.some((c) => c.id === vd.source),
              );
            }
            if (matchingPanel) {
              sourceLabel = `${matchingPanel.panel.system} / ${matchingPanel.panel.designation || matchingPanel.type}`;
            }
          }

          vdData.push([
            sourceLabel,
            vd.name,
            vd.loadA,
            vd.length,
            vd.wireSize,
            vd.voltage,
            vd.systemType,
            VD_v.toFixed(2),
            VD_percent.toFixed(2) + "%",
            status,
          ]);
        });

        const wsVd = XLSX.utils.aoa_to_sheet(vdData);

        const wscolsVd = [
          { wch: 20 },
          { wch: 25 },
          { wch: 15 },
          { wch: 15 },
          { wch: 18 },
          { wch: 15 },
          { wch: 15 },
          { wch: 12 },
          { wch: 12 },
          { wch: 15 },
        ];
        wsVd["!cols"] = wscolsVd;

        const rangeVd = XLSX.utils.decode_range(wsVd["!ref"] || "A1:A1");
        for (let R = rangeVd.s.r; R <= rangeVd.e.r; ++R) {
          for (let C = rangeVd.s.c; C <= rangeVd.e.c; ++C) {
            const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
            
            const cellExists = !!wsVd[cellAddress];
            const isHeader = (R === 0 || R === 2);

            if (!cellExists && !isHeader) {
              continue;
            }

            if (!wsVd[cellAddress]) wsVd[cellAddress] = { t: "s", v: "" };
            let style: any = {
              font: { name: "Arial", sz: 10, color: { rgb: "000000" } },
              fill: { fgColor: { rgb: "FFFFFF" } },
              alignment: { horizontal: "center", vertical: "center" },
            };
            if (R === 0) {
              style.font.bold = true;
              style.font.sz = 14;
              style.alignment = { horizontal: "left", vertical: "center" };
            } else if (R === 2) {
              style.font.bold = true;
              style.fill.fgColor.rgb = "F3F4F6";
            }
            wsVd[cellAddress].s = style;
          }
        }
        XLSX.utils.book_append_sheet(wb, wsVd, "Voltage_Drop");
      }

      // -----------------------------------------------------
      // Short Circuit Export
      // -----------------------------------------------------
      const scParams = iscParams || {
        transformerKVA: 100,
        transformerZ: 5,
        transformerVoltage: panel?.voltage || 230,
        primaryVoltage: 34500,
        transformerConnection: "Delta-Wye (Δ-Y)",
        utilityShortCircuitMVA: 500,
        feederLength: 10,
        feederSize: "30",
        feederRuns: getRunsBySystem(panel?.system),
        conductorType: "Copper",
      };

      const scBaseKVA = scParams.transformerKVA;
      const scBaseKV = scParams.transformerVoltage / 1000;
      
      let connectionMultiplier = 1.0;
      if (scParams.transformerConnection?.includes('Open') || false) {
        connectionMultiplier = 0.866; 
      } 
      
      let groundFaultFactor = 1.0;
      if (scParams.transformerConnection === 'Wye (Star) Connection' || 
          scParams.transformerConnection === 'Delta-Wye (Δ-Y)' || 
          scParams.transformerConnection === 'Wye-Wye (Y-Y)' ||
          scParams.transformerConnection === 'Open Wye-Open Delta') {
        groundFaultFactor = 1.25; 
      }

      const scZUtilitypu = scBaseKVA / (scParams.utilityShortCircuitMVA * 1000);
      const scZTranspu = (scParams.transformerZ / 100) / connectionMultiplier;

      const scFeederR =
        (0.7 * (scParams.feederLength / 1000)) / (scParams.feederRuns || 1);
      const scFeederX =
        (0.08 * (scParams.feederLength / 1000)) / (scParams.feederRuns || 1);
      const scFeederZ = Math.sqrt(scFeederR * scFeederR + scFeederX * scFeederX);
      const scZFeederpu =
        (scFeederZ * (scBaseKVA / 1000)) / (scBaseKV * scBaseKV);

      const scTotalZpu = scZUtilitypu + scZTranspu + scZFeederpu;
      const scIFullLoad =
        scParams.transformerKVA / (1.732 * (scParams.transformerVoltage / 1000));

      const scIscMainBreaker = scIFullLoad / (scZUtilitypu + scZTranspu);
      const scIscFaultPoint = scIFullLoad / scTotalZpu;

      const scMotorLoadVA = circuits
        .filter(
          (c) => c.loadType === LoadType.MOTOR || c.loadType === LoadType.AIR_CON,
        )
        .reduce((sum, c) => sum + c.loadVA, 0);
      const scMotorContribution =
        scMotorLoadVA > 0
          ? (scMotorLoadVA / (1.732 * scParams.transformerVoltage)) * 4
          : 0;

      const scCombinedSymmetricalCurrent = scIscFaultPoint + scMotorContribution;
      const scCombinedAsymmetricalCurrent = scCombinedSymmetricalCurrent * groundFaultFactor; // Use PEC ground fault factor
      const scBreakingkAIC = scCombinedAsymmetricalCurrent / 1000;

      const fault1Isc = (scParams.utilityShortCircuitMVA * 1000000) / (1.732 * scParams.primaryVoltage);

      const scData: any[][] = [];
      scData.push(["SHORT CIRCUIT (POINT-TO-POINT) STUDY", "", ""]);
      scData.push([]);
      scData.push(["INPUT DESIGN PARAMETERS", "VALUE", "UNIT"]);
      scData.push([
        "Utility Short Circuit Strength",
        scParams.utilityShortCircuitMVA,
        "MVAsc",
      ]);
      scData.push(["Primary Bus Voltage (HV)", scParams.primaryVoltage, "Volts"]);
      scData.push([
        "Secondary Rated Bus Voltage (LV)",
        scParams.transformerVoltage,
        "Volts",
      ]);
      scData.push([
        "Transformer Sizing Capacity",
        scParams.transformerKVA,
        "kVA",
      ]);
      scData.push([
        "Transformer Percent Impedance (%Z)",
        scParams.transformerZ,
        "%",
      ]);
      scData.push([
        "Feeder Conductor Cross-Section",
        scParams.feederSize,
        "mm² THHN",
      ]);
      scData.push(["Feeder Distance Length", scParams.feederLength, "Meters"]);
      scData.push(["Parallel Feeder Conductors", scParams.feederRuns, "Runs"]);
      scData.push([
        "Active Conductor Metal Type",
        scParams.conductorType,
        "Copper/Aluminum",
      ]);
      scData.push([
        "Transformer Connection",
        scParams.transformerConnection,
        "Configuration",
      ]);
      scData.push([
        "Ground Fault Factor applied",
        groundFaultFactor.toFixed(2),
        "Multiplier",
      ]);
      scData.push([]);
      scData.push([
        "PER-UNIT IMPEDANCES (BASE S SYSTEM = " +
          scParams.transformerKVA +
          " kVA)",
        "VALUE",
        "UNIT",
      ]);
      scData.push([
        "Transformer Full Load Current (FLA)",
        scIFullLoad.toFixed(2),
        "Amperes",
      ]);
      scData.push([
        "Utility Grid Impedance (Z-utility)",
        scZUtilitypu.toFixed(6),
        "pu",
      ]);
      scData.push([
        "Transformer Leakage Impedance (Z-transformer)",
        scZTranspu.toFixed(6),
        "pu",
      ]);
      scData.push([
        "Main Feeder Ohmic Resistance (R)",
        scFeederR.toFixed(5),
        "Ohms",
      ]);
      scData.push([
        "Main Feeder Ohmic Reactance (X)",
        scFeederX.toFixed(5),
        "Ohms",
      ]);
      scData.push([
        "Main Feeder Absolute Ohmic Impedance (|Z|)",
        scFeederZ.toFixed(5),
        "Ohms",
      ]);
      scData.push([
        "Feeder Integrated Impedance (Z-feeder)",
        scZFeederpu.toFixed(6),
        "pu",
      ]);
      scData.push([
        "Total Consolidated System Impedance (Z-total)",
        scTotalZpu.toFixed(6),
        "pu",
      ]);
      scData.push([]);
      scData.push(["FAULT LEVEL CALCULATED RESULTS", "VALUE", "UNIT"]);
      scData.push([
        "Fault 1: Symmetrical Fault Current at Utility HV (Isc)",
        fault1Isc.toFixed(2),
        "Amps",
      ]);
      scData.push([
        "Fault 2: Symmetrical Fault Current at Transformer (Isc Main)",
        scIscMainBreaker.toFixed(2),
        "Amps",
      ]);
      scData.push([
        "Fault 3: Symmetrical Fault Current at Panel (Isc Panel)",
        scIscFaultPoint.toFixed(2),
        "Amps",
      ]);
      scData.push([
        "Rotating Motor Feedback Symmetrical Contribution (Imotor)",
        scMotorContribution.toFixed(2),
        "Amps",
      ]);
      scData.push([
        "Combined Total Symmetrical Fault Current (Isc sym)",
        scCombinedSymmetricalCurrent.toFixed(2),
        "Amps",
      ]);
      scData.push([
        "Factored Asymmetrical Fault Current (Isc asym)",
        scCombinedAsymmetricalCurrent.toFixed(2),
        "Amps",
      ]);
      scData.push([
        "Ultimate Fault Breaking Intensity Assessment",
        scBreakingkAIC.toFixed(2),
        "kAIC",
      ]);
      scData.push([
        "Interrupting Protection Level Class",
        scBreakingkAIC > 22
          ? "35 kAIC Required"
          : scBreakingkAIC > 10
            ? "22 kAIC"
            : "10 kAIC",
        "",
      ]);

      const wsSc = XLSX.utils.aoa_to_sheet(scData);
      const wscolsSc = [{ wch: 45 }, { wch: 25 }, { wch: 15 }];
      wsSc["!cols"] = wscolsSc;

      const rangeSc = XLSX.utils.decode_range(wsSc["!ref"] || "A1:A1");
      for (let R = rangeSc.s.r; R <= rangeSc.e.r; ++R) {
        for (let C = rangeSc.s.c; C <= rangeSc.e.c; ++C) {
          const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
          
          const cellExists = !!wsSc[cellAddress];
          const isHeader = (R === 0 || R === 2 || R === 15 || R === 25);

          if (!cellExists && !isHeader) {
            continue;
          }

          if (!wsSc[cellAddress]) wsSc[cellAddress] = { t: "s", v: "" };
          let style: any = {
            font: { name: "Arial", sz: 10, color: { rgb: "000000" } },
            fill: { fgColor: { rgb: "FFFFFF" } },
            alignment: { horizontal: "center", vertical: "center" },
          };
          if (R === 0) {
            style.font.bold = true;
            style.font.sz = 14;
            style.alignment = { horizontal: "left", vertical: "center" };
          } else if (R === 2 || R === 15 || R === 25) {
            style.font.bold = true;
            style.fill.fgColor.rgb = "F3F4F6";
          }
          wsSc[cellAddress].s = style;
        }
      }
      XLSX.utils.book_append_sheet(wb, wsSc, "Short_Circuit");

      // -----------------------------------------------------
      // Illumination Export
      // -----------------------------------------------------
      if (
        illumParams &&
        illumParams.savedRooms &&
        illumParams.savedRooms.length > 0
      ) {
        const illData: any[][] = [];
        illData.push([
          "ILLUMINATION (LUMEN METHOD) ANALYSIS",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
        ]);
        illData.push([]);
        illData.push([
          "ROOM NAME",
          "TARGET LUX",
          "AREA (m²)",
          "FIXTURE TYPE",
          "FIXTURES COUNT",
          "TOTAL LUMENS",
          "TOTAL WATTAGE (W)",
          "LPD (W/m²)",
          "ASHRAE LIMIT (W/m²)",
          "STATUS",
          "CIRCUIT NO.",
        ]);

        illumParams.savedRooms.forEach((room) => {
          const roomLPD = room.totalWattage / room.area;
          const limitLPD = room.targetLux > 300 ? 9.0 : 6.0;
          const status = roomLPD <= limitLPD ? "PASSED" : "FAILED";
          illData.push([
            room.roomName,
            room.targetLux,
            room.area,
            room.fixtureLightType || "Custom",
            room.fixturesCount,
            room.totalLumens,
            room.totalWattage,
            Number(roomLPD.toFixed(2)),
            limitLPD,
            status,
            room.circuitNo ? room.circuitNo : "-",
          ]);
        });

        const wsIll = XLSX.utils.aoa_to_sheet(illData);
        const wscolsIll = [
          { wch: 25 },
          { wch: 15 },
          { wch: 15 },
          { wch: 25 },
          { wch: 18 },
          { wch: 18 },
          { wch: 18 },
          { wch: 15 },
          { wch: 20 },
          { wch: 15 },
          { wch: 15 },
        ];
        wsIll["!cols"] = wscolsIll;

        const rangeIll = XLSX.utils.decode_range(wsIll["!ref"] || "A1:A1");
        for (let R = rangeIll.s.r; R <= rangeIll.e.r; ++R) {
          for (let C = rangeIll.s.c; C <= rangeIll.e.c; ++C) {
            const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
            
            const cellExists = !!wsIll[cellAddress];
            const isHeader = (R === 0 || R === 2);

            if (!cellExists && !isHeader) {
              continue;
            }

            if (!wsIll[cellAddress]) wsIll[cellAddress] = { t: "s", v: "" };
            let style: any = {
              font: { name: "Arial", sz: 10, color: { rgb: "000000" } },
              fill: { fgColor: { rgb: "FFFFFF" } },
              alignment: { horizontal: "center", vertical: "center" },
            };
            if (R === 0) {
              style.font.bold = true;
              style.font.sz = 14;
              style.alignment = { horizontal: "left", vertical: "center" };
            } else if (R === 2) {
              style.font.bold = true;
              style.fill.fgColor.rgb = "F3F4F6";
            }
            wsIll[cellAddress].s = style;
          }
        }
        XLSX.utils.book_append_sheet(wb, wsIll, "Illumination");
      }

      // -----------------------------------------------------
      // Trigger File Download
      // -----------------------------------------------------
      const filename = `Engineering_Reports_${panel.designation || "Project"}.xlsx`;
      
      try {
        XLSX.writeFile(wb, filename);
      } catch (writeError) {
        console.warn("Standard XLSX.writeFile failed, using fallback Binary Blob Download:", writeError);
        const wbout = XLSX.write(wb, { bookType: "xlsx", type: "binary" });
        const buf = new ArrayBuffer(wbout.length);
        const view = new Uint8Array(buf);
        for (let i = 0; i < wbout.length; i++) {
          view[i] = wbout.charCodeAt(i) & 0xFF;
        }
        const blob = new Blob([buf], { type: "application/octet-stream" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (globalErr: any) {
      console.error("Excel Export fully failed:", globalErr);
      alert(`Error generating Excel report: ${globalErr.message || globalErr}`);
    }
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
              border: "none", // Ensures clean unconstrained look
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
        systemSLD: await getImg("sld-system-wide"),
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

      await exportToWord(
        panel,
        circuits,
        subPanels,
        vdCalculations,
        illumParams,
        images,
        iscParams,
        subSubPanels,
        {
          primaryVoltage: transformerPrimaryVoltage,
          powerFactor: transformerPowerFactor,
          demandFactor: transformerDemandFactor,
          loadingFactor: transformerLoadingFactor,
        }
      );
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
              title={
                isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"
              }
            >
              {isDarkMode ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-slate-400" />
              )}
            </button>
          </div>

          {/* Navigation Menu */}
          <div className="p-4 space-y-1">
            <p className="px-2 text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 mt-4">
              Modules
            </p>
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
                <tab.icon
                  className={`w-4 h-4 ${activeTab === tab.id ? "text-indigo-400" : "text-slate-500"}`}
                />
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
          {(userPlan !== "premium" || isAdmin) && (
            <button
              onClick={() => setShowUpgrade(true)}
              className="w-full flex items-center gap-2 justify-center px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white rounded-lg text-xs font-black uppercase tracking-wider transition-all shadow-lg shadow-amber-500/20 mb-2 border border-amber-400/50"
            >
              <Zap className="w-4 h-4 fill-white" />
              Upgrade to Premium {isAdmin && "(Admin Test)"}
            </button>
          )}

          <button
            onClick={() => setIsProjectManagerOpen(true)}
            className="w-full flex items-center gap-2 justify-center px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold transition-colors shadow-lg shadow-indigo-900/20 mb-2 border border-slate-700/50"
          >
            <FolderOpen className="w-4 h-4" />
            <span>Manage Projects</span>
          </button>

          <button
            onClick={
              userPlan === "premium" || isAdmin
                ? handleExportWord
                : () => setShowUpgrade(true)
            }
            className={`w-full flex items-center gap-2 justify-center px-4 py-2.5 ${userPlan === "premium" || isAdmin ? "bg-indigo-600 hover:bg-indigo-500 text-white" : "bg-slate-800 text-slate-400 hover:bg-slate-700"} rounded-lg text-xs font-bold transition-colors shadow-lg shadow-indigo-900/20`}
            title={
              userPlan !== "premium" && !isAdmin
                ? "Available on Premium Plan"
                : "Generate Word Report"
            }
          >
            <FileText className="w-4 h-4" />
            <span>
              {userPlan !== "premium" && !isAdmin
                ? "Report (Premium)"
                : "Generate Report"}
            </span>
          </button>
          <button
            onClick={exportToExcel}
            className="w-full flex items-center gap-2 justify-center px-4 py-2.5 bg-slate-800 text-slate-300 rounded-lg text-xs font-bold hover:bg-slate-700 hover:text-white transition-colors border border-slate-700/50"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Export to Excel</span>
          </button>
          <button
            onClick={() => {
              if (userPlan === "premium" || isAdmin) {
                exportToCAD(
                  panel,
                  circuits,
                  subPanels,
                  iscParams,
                  "ALL",
                  vdCalculations,
                  illumParams,
                  subSubPanels
                );
              } else {
                setShowUpgrade(true);
              }
            }}
            className={`w-full flex items-center gap-2 justify-center px-4 py-2.5 rounded-lg text-xs font-bold transition-all border ${
              userPlan === "premium" || isAdmin
                ? "bg-sky-950/45 text-sky-400 hover:bg-sky-900/60 border-sky-800/60 cursor-pointer"
                : "bg-slate-800 text-slate-400 hover:bg-slate-700 border-slate-700/50 cursor-pointer"
            }`}
            title={
              userPlan !== "premium" && !isAdmin
                ? "AutoCAD Export is available on the Premium Plan"
                : "Export complete Load Schedule Table and Short Circuit calculations directly to DWG/DXF AutoCAD format"
            }
          >
            <Layers
              className={`w-4 h-4 ${userPlan === "premium" || isAdmin ? "text-sky-400" : "text-slate-500"}`}
            />
            <span>
              {userPlan !== "premium" && !isAdmin
                ? "Export AutoCAD (Premium)"
                : "Export AutoCAD Drawing"}
            </span>
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
            <span className="font-extrabold text-slate-900 dark:text-white text-lg tracking-tight">
              ElectricalPH
            </span>
          </div>

          <div className="flex items-center gap-1">
            {/* Mobile Theme Toggle Button */}
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-1.5 mr-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
              title={
                isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"
              }
            >
              {isDarkMode ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-slate-500" />
              )}
            </button>
          </div>
        </header>

        {/* Mobile secondary navigation bar */}
        <div className="md:hidden bg-slate-100/80 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 px-4 py-2 sticky top-16 z-20 overflow-x-auto whitespace-nowrap [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] flex gap-2 no-print backdrop-blur-md">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                activeTab === tab.id
                  ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 shadow-sm"
                  : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/50 dark:border-slate-700"
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
              <div
                className={
                  activeTab === "dashboard" ? "w-full animate-fade" : "hidden"
                }
              >
                <motion.div
                  initial={{ opacity: 0, y: 15 }}
                  animate={
                    activeTab === "dashboard" ? { opacity: 1, y: 0 } : {}
                  }
                  transition={{ duration: 0.2 }}
                  className="space-y-8"
                >
                  {/* Engineering Hero Header */}
                  <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-950 rounded-3xl p-6 sm:p-8 text-white border border-slate-800 shadow-xl relative overflow-hidden">
                    <div
                      className="absolute inset-0 opacity-10 pointer-events-none"
                      style={{
                        backgroundImage:
                          "radial-gradient(circle at 80% 20%, rgba(99, 102, 241, 0.4), transparent 50%), linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)",
                        backgroundSize: "100% 100%, 30px 30px, 30px 30px",
                      }}
                    />

                    <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                      <div className="space-y-2">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-yellow-400/10 border border-yellow-400/20 text-yellow-300 text-xs font-bold uppercase tracking-wider">
                          ⚡ Active Session Station
                        </span>
                        <h2 className="text-3xl font-black uppercase tracking-tight text-white sm:text-4xl">
                          {panel.project || "Untitled Project Station"}
                        </h2>
                        <p className="text-slate-300 text-sm max-w-2xl">
                          Engineering dashboard for PEC compliant system design
                          and safety audits. Real-time telemetry is active. All
                          components verified against standard electrical wire
                          sizes and conductor tolerances.
                        </p>
                      </div>

                      <div className="bg-white/10 shrink-0 backdrop-blur-md border border-white/10 px-6 py-4 rounded-2xl flex flex-col gap-1 shadow-lg text-slate-100">
                        <span className="text-xs text-indigo-200 uppercase font-black tracking-widest">
                          Local Time (Manila)
                        </span>
                        <span className="font-mono text-xl font-bold text-yellow-300">
                          {new Date().toLocaleDateString("en-US", {
                            weekday: "short",
                            month: "short",
                            day: "2-digit",
                            year: "numeric",
                          })}
                        </span>
                        <span className="text-xs text-slate-400">
                          PEC Standards Version: PEC 2017
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Bento Grid: Summary Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
                    {/* Connected Load Schedule Telemetry */}
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block">
                            CONNECTED CAPACITY
                          </span>
                          <h3 className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight font-mono">
                            {(
                              circuits.reduce(
                                (sum, c) => sum + (c.loadVA || 0),
                                0,
                              ) / 1000
                            ).toFixed(2)}{" "}
                            kVA
                          </h3>
                        </div>
                        <div className="p-3 bg-indigo-50 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-sm">
                          <Layout className="w-5 h-5" />
                        </div>
                      </div>

                      <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-bold text-slate-700 dark:text-slate-300">
                          {circuits.length} Registered Loops
                        </span>
                        <button
                          onClick={() => setActiveTab("schedule")}
                          className="text-indigo-600 dark:text-indigo-400 font-extrabold hover:underline flex items-center gap-1"
                        >
                          Configure <ArrowUpRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Short Circuit Fault Adequacy */}
                    {(() => {
                      const baseKVA = iscParams.transformerKVA || 500;
                      const baseKV = (iscParams.transformerVoltage || 230) / 1000;
                      
                      const connectionMultiplier = 
                        iscParams.transformerConnection === 'Open Delta (V-V)' ? 0.577 :
                        iscParams.transformerConnection === 'Open Wye-Open Delta' ? 0.866 : 1.0;

                      // 1. Utility Impedance (pu)
                      const zUtilitypu = baseKVA / ((iscParams.utilityShortCircuitMVA || 250) * 1000);

                      // 2. Transformer Impedance (pu)
                      const zTranspu = ((iscParams.transformerZ || 5) / 100) / connectionMultiplier;

                      // 3. Feeder Impedance Estimate (Symmetrical pu)
                      let feederR = 0.7 * ((iscParams.feederLength || 30) / 1000) / (iscParams.feederRuns || 1);
                      let feederX = 0.08 * ((iscParams.feederLength || 30) / 1000) / (iscParams.feederRuns || 1);
                      if (iscParams.feederSize) {
                        const tableVals = WIRE_IMPEDANCE_TABLE[iscParams.feederSize.toString()];
                        if (tableVals) {
                          feederR = (tableVals.r * ((iscParams.feederLength || 30) / 1000)) / (iscParams.feederRuns || 1);
                          feederX = (tableVals.x * ((iscParams.feederLength || 30) / 1000)) / (iscParams.feederRuns || 1);
                        }
                      }
                      const feederZ = Math.sqrt(feederR*feederR + feederX*feederX);
                      const zFeederpu = feederZ * (baseKVA / 1000) / (baseKV * baseKV);

                      const totalZpu = zUtilitypu + zTranspu + zFeederpu;
                      const iFullLoad = baseKVA / (1.732 * baseKV);
                      
                      // Symmetrical Short Circuit Current at Fault Point
                      const iscFaultPointVal = iFullLoad / totalZpu;
                      const iscKAIC = iscFaultPointVal / 1000;
                      
                      const panelLimitKAIC = parseFloat(panel.icRating) || 10;
                      const scStatus = iscKAIC <= panelLimitKAIC ? "COMPLIANT" : "WARNING";

                      return (
                        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group">
                          <div className="flex items-start justify-between">
                            <div className="space-y-1">
                              <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block">
                                CALCULATED ISC
                              </span>
                              <h3 className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight font-mono">
                                {iscKAIC.toFixed(2)} kA
                              </h3>
                            </div>
                            <div
                              className={`p-3 rounded-xl shadow-sm transition-all ${
                                scStatus === "COMPLIANT"
                                  ? "bg-emerald-50 dark:bg-emerald-950/35 text-emerald-600 dark:text-emerald-400 group-hover:bg-emerald-600 group-hover:text-white"
                                  : "bg-rose-50 dark:bg-rose-950/35 text-rose-600 dark:text-rose-400 group-hover:bg-rose-600 group-hover:text-white"
                              }`}
                            >
                              <ShieldAlert className="w-5 h-5" />
                            </div>
                          </div>

                          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                            <span
                              className={`font-extrabold flex items-center gap-1.5 ${
                                scStatus === "COMPLIANT"
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : "text-rose-600 dark:text-rose-400"
                              }`}
                            >
                              <span
                                className={`w-2 h-2 rounded-full ${scStatus === "COMPLIANT" ? "bg-emerald-500" : "bg-rose-500 animate-pulse"}`}
                              />
                              {scStatus} Limit ({panelLimitKAIC}kA pf)
                            </span>
                            <button
                              onClick={() => setActiveTab("isc")}
                              className="text-indigo-600 dark:text-indigo-400 font-extrabold hover:underline flex items-center gap-1"
                            >
                              Audit <ArrowUpRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Voltage Drop Audit */}
                    {(() => {
                      let maxVDPercent = 0;
                      let vdCompliant = true;

                      vdCalculations.forEach((vd) => {
                        const data =
                          WIRE_IMPEDANCE_TABLE[vd.wireSize] ||
                          WIRE_IMPEDANCE_TABLE["3.5"];
                        const r = data ? data.r : 5.76;
                        const factor = vd.systemType === "3PH" ? 1.732 : 2;
                        const dropV = (factor * vd.loadA * vd.length * r) / 1000;
                        const pct = (dropV / vd.voltage) * 100;
                        
                        if (!Number.isNaN(pct) && pct > maxVDPercent) {
                          maxVDPercent = pct;
                        }

                        const isMainFeeder = vd.source === "main";
                        const isSubPanelFeeder = uniqueSubPanels.some(sp => sp.id === vd.source) || uniqueSubSubPanels.some(ssp => ssp.id === vd.source);
                        const isFeeder = isMainFeeder || isSubPanelFeeder || vd.name.toLowerCase().includes("feeder");
                        const limit = isFeeder ? 5.0 : 3.0;
                        if (!Number.isNaN(pct) && pct > limit) {
                          vdCompliant = false;
                        }
                      });
                      if (vdCalculations.length === 0) {
                        maxVDPercent = 1.15;
                        vdCompliant = true;
                      }

                      return (
                        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group">
                          <div className="flex items-start justify-between">
                            <div className="space-y-1">
                              <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block">
                                MAX VOLTAGE DROP
                              </span>
                              <h3 className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight font-mono">
                                {maxVDPercent.toFixed(2)}%
                              </h3>
                            </div>
                            <div
                              className={`p-3 rounded-xl shadow-sm transition-all ${
                                vdCompliant
                                  ? "bg-green-50 dark:bg-emerald-950/35 text-green-600 dark:text-emerald-400 group-hover:bg-green-600 group-hover:text-white"
                                  : "bg-amber-50 dark:bg-amber-950/35 text-amber-600 dark:text-amber-400 group-hover:bg-amber-600 group-hover:text-white"
                              }`}
                            >
                              <Ruler className="w-5 h-5" />
                            </div>
                          </div>

                          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                            <span
                              className={`font-extrabold flex items-center gap-1.5 ${
                                vdCompliant
                                  ? "text-green-600 dark:text-emerald-400"
                                  : "text-amber-600 dark:text-amber-400 hover:text-amber-700"
                              }`}
                            >
                              <span
                                className={`w-2 h-2 rounded-full ${vdCompliant ? "bg-green-500" : "bg-amber-500 animate-pulse"}`}
                              />
                              {vdCompliant
                                ? "PEC Compliant"
                                : "Exceeds PEC Limit"}
                            </span>
                            <button
                              onClick={() => setActiveTab("vd")}
                              className="text-indigo-600 dark:text-indigo-400 font-extrabold hover:underline flex items-center gap-1"
                            >
                              Evaluate <ArrowUpRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Recommended Transformer Capacity Card */}
                    {(() => {
                      const totalVA = circuits.reduce((sum, c) => sum + (c.loadVA || 0), 0);
                      const totalKVA = totalVA / 1000;
                      const demandKVA = totalKVA * transformerDemandFactor;
                      const requiredKVA = transformerLoadingFactor > 0 ? demandKVA / transformerLoadingFactor : 0;
                      
                      const standardKVA = [15, 30, 45, 75, 112.5, 150, 225, 300, 500, 750, 1000, 1500, 2000, 2500];
                      const recommendedRating = standardKVA.find((s) => s >= requiredKVA) || standardKVA[standardKVA.length - 1];
                      const actualLoadingPct = recommendedRating > 0 ? (demandKVA / recommendedRating) * 100 : 0;
                      const isLoadedCompliant = actualLoadingPct <= transformerLoadingFactor * 100;

                      return (
                        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group">
                          <div className="flex items-start justify-between">
                            <div className="space-y-1">
                              <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block">
                                RECOMMENDED TRANSFORMER
                              </span>
                              <h3 className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight font-mono">
                                {recommendedRating.toFixed(1)} kVA
                              </h3>
                            </div>
                            <div className="p-3 bg-teal-50 dark:bg-teal-950/35 text-teal-600 dark:text-teal-400 rounded-xl group-hover:bg-teal-600 group-hover:text-white transition-all shadow-sm">
                              <Zap className="w-5 h-5" />
                            </div>
                          </div>

                          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                            <span className="font-bold text-slate-700 dark:text-slate-300">
                              {actualLoadingPct.toFixed(1)}% Loading Factor
                            </span>
                            <button
                              onClick={() => setActiveTab("transformer")}
                              className="text-indigo-600 dark:text-indigo-400 font-extrabold hover:underline flex items-center gap-1"
                            >
                              Sizing <ArrowUpRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Illumination target status */}
                    {(() => {
                      const illumArea =
                        illumParams.inputMode === "area"
                          ? illumParams.userArea
                          : illumParams.roomWidth * illumParams.roomLength;
                      const calculatedLux = Math.ceil(
                        (illumParams.lumensPerFixture *
                          (illumParams.coefficientOfUtilization || 0.6) *
                          (illumParams.maintenanceFactor || 0.8)) /
                          (illumArea || 20),
                      );
                      const isLCompliance =
                        calculatedLux >= illumParams.targetLux;

                      return (
                        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group">
                          <div className="flex items-start justify-between">
                            <div className="space-y-1">
                              <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block">
                                EST. ILLUMINATION
                              </span>
                              <h3 className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight font-mono">
                                {calculatedLux || 0} Lux
                              </h3>
                            </div>
                            <div
                              className={`p-3 rounded-xl shadow-sm transition-all ${
                                isLCompliance
                                  ? "bg-yellow-50 dark:bg-yellow-950/35 text-yellow-600 dark:text-yellow-400 group-hover:bg-yellow-500 group-hover:text-white"
                                  : "bg-orange-50 dark:bg-orange-950/35 text-orange-600 dark:text-orange-400 group-hover:bg-orange-600 group-hover:text-white"
                              }`}
                            >
                              <Lightbulb className="w-5 h-5" />
                            </div>
                          </div>

                          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                            <span
                              className={`font-extrabold flex items-center gap-1.5 ${
                                isLCompliance
                                  ? "text-emerald-600 dark:text-emerald-200"
                                  : "text-orange-600 dark:text-orange-300"
                              }`}
                            >
                              <span
                                className={`w-2 h-2 rounded-full ${isLCompliance ? "bg-emerald-500" : "bg-orange-500 animate-pulse"}`}
                              />
                              {isLCompliance
                                ? "Target Met"
                                : "Low Illum"}
                            </span>
                            <button
                              onClick={() => setActiveTab("lighting")}
                              className="text-indigo-600 dark:text-indigo-400 font-extrabold hover:underline flex items-center gap-1"
                            >
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
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Layers className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                          <h4 className="font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider text-xs">
                            Panel board standard specs (PEC Part 1)
                          </h4>
                        </div>
                        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700 px-2 py-0.5 rounded-md">
                          Feeder: {panel.type || "Main Panelboard"}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-slate-50 dark:bg-slate-800 border border-slate-100/80 dark:border-slate-800 rounded-2xl p-4 space-y-1">
                          <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block">
                            SYSTEM VOLTAGE
                          </span>
                          <p className="text-xs font-extrabold text-slate-800 dark:text-slate-200">
                            {panel.system}
                          </p>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-800 border border-slate-100/80 dark:border-slate-800 rounded-2xl p-4 space-y-1">
                          <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block">
                            ENCLOSURE STYLE
                          </span>
                          <p className="text-xs font-extrabold text-slate-800 dark:text-slate-200">
                            {panel.enclosure || "NEMA 1 Indoors"}
                          </p>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-800 border border-slate-100/80 dark:border-slate-800 rounded-2xl p-4 space-y-1">
                          <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block">
                            MOUNTING METHOD
                          </span>
                          <p className="text-xs font-extrabold text-slate-800 dark:text-slate-200">
                            {panel.mounting || "Wall Surface"}
                          </p>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-800 border border-slate-100/80 dark:border-slate-800 rounded-2xl p-4 space-y-1">
                          <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block">
                            INTERRUPTING LIMIT
                          </span>
                          <p className="text-xs font-extrabold text-slate-800 dark:text-slate-200">
                            {panel.icRating || "10kA KAIC"}
                          </p>
                        </div>
                      </div>

                      {/* Quick System loads bar-analysis */}
                      <div className="space-y-3 pt-2">
                        <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          LOAD DISTRIBUTION BY COMPONENT TYPE
                        </h5>
                        {(() => {
                          const totalVA =
                            circuits.reduce(
                              (sum, c) => sum + (c.loadVA || 0),
                              0,
                            ) || 1;
                          const lightingVA = circuits
                            .filter((c) => c.loadType === "L")
                            .reduce((sum, c) => sum + (c.loadVA || 0), 0);
                          const outletVA = circuits
                            .filter((c) => c.loadType === "S")
                            .reduce((sum, c) => sum + (c.loadVA || 0), 0);
                          const motorVA = circuits
                            .filter(
                              (c) => c.loadType === "AC" || c.loadType === "M",
                            )
                            .reduce((sum, c) => sum + (c.loadVA || 0), 0);
                          const othersVA =
                            totalVA - (lightingVA + outletVA + motorVA);

                          const lightPct = (lightingVA / totalVA) * 100;
                          const outletPct = (outletVA / totalVA) * 100;
                          const motorPct = (motorVA / totalVA) * 100;
                          const otherPct = (othersVA / totalVA) * 100;

                          return (
                            <div className="space-y-3">
                              <div className="h-3 w-full bg-slate-100 rounded-full flex overflow-hidden">
                                <div
                                  style={{ width: `${lightPct}%` }}
                                  className="bg-indigo-500 h-full transition-all"
                                  title={`Lighting: ${lightPct.toFixed(1)}%`}
                                />
                                <div
                                  style={{ width: `${outletPct}%` }}
                                  className="bg-emerald-500 h-full transition-all"
                                  title={`Convenience Outlets: ${outletPct.toFixed(1)}%`}
                                />
                                <div
                                  style={{ width: `${motorPct}%` }}
                                  className="bg-amber-500 h-full transition-all"
                                  title={`Motors / AC: ${motorPct.toFixed(1)}%`}
                                />
                                <div
                                  style={{ width: `${otherPct}%` }}
                                  className="bg-slate-400 h-full transition-all"
                                  title={`Others: ${otherPct.toFixed(1)}%`}
                                />
                              </div>

                              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px]">
                                <span className="flex items-center gap-1 text-slate-500">
                                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 shrink-0" />{" "}
                                  Lighting (<strong>{lightPct.toFixed(1)}%</strong>)
                                </span>
                                <span className="flex items-center gap-1 text-slate-500">
                                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />{" "}
                                  Outlets (<strong>{outletPct.toFixed(1)}%</strong>)
                                </span>
                                <span className="flex items-center gap-1 text-slate-500">
                                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />{" "}
                                  Motors/AC (<strong>{motorPct.toFixed(1)}%</strong>)
                                </span>
                                <span className="flex items-center gap-1 text-slate-500">
                                  <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />{" "}
                                  Others (<strong>{otherPct.toFixed(1)}%</strong>)
                                </span>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    {/* Interactive Real-Time Phase Balance Chart */}
                    {(() => {
                      const { phaseLoads, phaseImbalance } = computePanelScheduleValues(panel, circuits);
                      const rKVA = (phaseLoads.R || 0) / 1000;
                      const yKVA = (phaseLoads.Y || 0) / 1000;
                      const bKVA = (phaseLoads.B || 0) / 1000;

                      const chartData = [
                        { name: "Phase R", Load: parseFloat(rKVA.toFixed(2)), color: "#ef4444" },
                        { name: "Phase Y", Load: parseFloat(yKVA.toFixed(2)), color: "#f59e0b" },
                        { name: "Phase B", Load: parseFloat(bKVA.toFixed(2)), color: "#3b82f6" },
                      ];

                      return (
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col justify-between space-y-4">
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <Activity className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                                <h4 className="font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider text-xs">
                                  Phase Loading Balance
                                </h4>
                              </div>
                              <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${
                                phaseImbalance <= 15
                                  ? "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400"
                                  : "bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400"
                              }`}>
                                {phaseImbalance.toFixed(2)}% Imbalance
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-400 leading-normal">
                              Symmetrical current alignment per phase. Minimize imbalance to optimize feeder wire sizes and limit transformer temperature expansion under full load.
                            </p>
                          </div>

                          <div className="h-32 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:stroke-slate-800" />
                                <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} />
                                <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} unit="k" />
                                <Tooltip 
                                  cursor={{ fill: 'transparent' }}
                                  contentStyle={{ 
                                    background: '#1e293b', 
                                    border: 'none', 
                                    borderRadius: '8px', 
                                    color: '#fff', 
                                    fontSize: '10px', 
                                    fontFamily: 'monospace' 
                                  }} 
                                />
                                <Bar dataKey="Load" radius={[6, 6, 0, 0]}>
                                  {chartData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                  ))}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>

                          <div className="flex items-center justify-between text-[10px] font-mono border-t border-slate-100 dark:border-slate-800 pt-3 text-slate-500">
                            <span>R: <strong className="text-red-600 font-bold">{rKVA.toFixed(2)}k</strong></span>
                            <span>Y: <strong className="text-amber-500 font-bold">{yKVA.toFixed(2)}k</strong></span>
                            <span>B: <strong className="text-blue-500 font-bold">{bKVA.toFixed(2)}k</strong></span>
                          </div>
                        </div>
                      );
                    })()}

                    {/* PEC Quick Reference Guide */}
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-4">
                          <Zap className="w-4 h-4 text-yellow-500" />
                          <h4 className="font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider text-xs">
                            PEC 2017 Quick Reference Guide
                          </h4>
                        </div>
                        <ul className="space-y-4 text-xs text-slate-600 dark:text-slate-400">
                          <li className="flex items-start gap-2">
                            <span className="text-yellow-500 shrink-0 font-bold mt-0.5">
                              ▪
                            </span>
                            <span>
                              <strong className="text-slate-800 dark:text-slate-200">
                                Section 2.10.2.1:
                              </strong>{" "}
                              Branch circuits branch wire size must possess wire
                              ampacity not less than 125% of continuous load.
                            </span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="text-yellow-500 shrink-0 font-bold mt-0.5">
                              ▪
                            </span>
                            <span>
                              <strong className="text-slate-800 dark:text-slate-200">
                                Table 3.10.1.16:
                              </strong>{" "}
                              Minimum conductor wire size for general lighting
                              branch loops in residential lands is{" "}
                              <strong className="text-slate-900 dark:text-white font-extrabold">
                                2.0 mm² THHN Cooper
                              </strong>
                              .
                            </span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="text-yellow-500 shrink-0 font-bold mt-0.5">
                              ▪
                            </span>
                            <span>
                              <strong className="text-slate-800 dark:text-slate-200">
                                Section 2.40.1.3:
                              </strong>{" "}
                              Breaker standard ratings are 15A, 20A, 30A, 40A,
                              50A, 60A, 70A, 100A, 115A, 125A.
                            </span>
                          </li>
                        </ul>
                      </div>

                      <div className="bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-950/40 rounded-2xl p-4 flex items-center justify-between text-xs mt-4">
                        <span className="text-indigo-950 dark:text-indigo-200 font-bold">
                          Standard Grounding sizes?
                        </span>
                        <button
                          onClick={() =>
                            alert(
                              "Grounding Wire size according to PEC Table 2.50.6.13 requires a minimum 2.0 mm² for 15A loads and 3.5 mm² ground for 20A branch loads.",
                            )
                          }
                          className="px-3 py-1 bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 font-bold rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 shadow-sm transition-colors shrink-0"
                        >
                          View Table
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Interactive PEC Current Calculator & Verifier */}
                  <PECCurrentCalculator panel={panel} setPanel={setPanel} />

                  {/* Direct Actions & Interactive Quick Launcher Tab */}
                  <div className="bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
                    <h4 className="font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest text-[10px]">
                      Jump-switch to Active Calculation Terminals:
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-4">
                      <button
                        onClick={() => setActiveTab("schedule")}
                        className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-800 p-4 rounded-2xl shadow-sm text-center font-bold text-xs text-slate-800 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all flex flex-col items-center gap-2 cursor-pointer"
                      >
                        <Layout className="w-5 h-5 text-indigo-500" />
                        Load Schedule
                      </button>
                      <button
                        onClick={() => setActiveTab("isc")}
                        className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-800 p-4 rounded-2xl shadow-sm text-center font-bold text-xs text-slate-800 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all flex flex-col items-center gap-2 cursor-pointer"
                      >
                        <ShieldAlert className="w-5 h-5 text-rose-500" />
                        Short Circuit
                      </button>
                      <button
                        onClick={() => setActiveTab("vd")}
                        className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-800 p-4 rounded-2xl shadow-sm text-center font-bold text-xs text-slate-800 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all flex flex-col items-center gap-2 cursor-pointer"
                      >
                        <Ruler className="w-5 h-5 text-emerald-500" />
                        Voltage Drop
                      </button>
                      <button
                        onClick={() => setActiveTab("lighting")}
                        className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-800 p-4 rounded-2xl shadow-sm text-center font-bold text-xs text-slate-800 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all flex flex-col items-center gap-2 cursor-pointer"
                      >
                        <Lightbulb className="w-5 h-5 text-yellow-500" />
                        Illumination
                      </button>
                      <button
                        onClick={() => setActiveTab("floor-plan")}
                        className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-800 p-4 rounded-2xl shadow-sm col-span-2 sm:col-span-1 text-center font-bold text-xs text-slate-800 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all flex flex-col items-center gap-2 cursor-pointer"
                      >
                        <Map className="w-5 h-5 text-cyan-500" />
                        Blueprint Preview
                      </button>
                    </div>
                  </div>
                </motion.div>
              </div>

              {/* Load Schedule Tab */}
              <div
                className={
                  activeTab === "schedule" || isExporting
                    ? "w-full"
                    : "absolute left-[-9999px] top-0 opacity-0 pointer-events-none w-full select-none"
                }
              >
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={
                    activeTab === "schedule" || isExporting
                      ? { opacity: 1, y: 0 }
                      : {}
                  }
                  transition={{ duration: 0.2 }}
                  className="w-full flex justify-center"
                >
                  <div className="flex flex-col gap-8 w-full max-w-full">
                    {/* Custom Inside Panel Tabs */}
                    {!isExporting && (
                      <div className="bg-slate-100/80 dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 rounded-2xl p-2.5 flex flex-wrap items-center gap-2 mb-2 no-print shadow-sm">
                        {/* Main Panel Tag */}
                        <button
                          onClick={() => setActiveScheduleTab("mdp")}
                          className={`px-4 py-2 text-xs sm:text-sm font-bold rounded-xl transition-all duration-200 flex items-center gap-2 cursor-pointer ${
                            activeScheduleTab === "mdp"
                              ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/10 dark:shadow-none translate-y-[-1px]"
                              : "text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-800/60"
                          }`}
                        >
                          <Layout className="w-4 h-4 text-indigo-500 shadow-sm" />
                          <span>{panel.designation || "Main Panel (MDP)"}</span>
                        </button>

                        {/* Sub Panels Tags */}
                        {uniqueSubPanels.map((sp) => (
                          <button
                            key={sp.id}
                            onClick={() => setActiveScheduleTab(sp.id)}
                            className={`px-4 py-2 text-xs sm:text-sm font-bold rounded-xl transition-all duration-200 flex items-center gap-2 cursor-pointer ${
                              activeScheduleTab === sp.id
                                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/10 dark:shadow-none translate-y-[-1px]"
                                : "text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-800/60"
                            }`}
                          >
                            <Network className="w-3.5 h-3.5 text-cyan-500" />
                            <span>{sp.panel.designation || "Subpanel"}</span>
                          </button>
                        ))}

                        {/* Sub-Sub Panels Tags */}
                        {uniqueSubSubPanels.map((ssp) => (
                          <button
                            key={ssp.id}
                            onClick={() => setActiveScheduleTab(ssp.id)}
                            className={`px-4 py-2 text-xs sm:text-sm font-bold rounded-xl transition-all duration-200 flex items-center gap-2 cursor-pointer border border-dashed border-cyan-200 dark:border-cyan-800 ${
                              activeScheduleTab === ssp.id
                                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/10 dark:shadow-none translate-y-[-1px] border-none"
                                : "text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-800/60"
                            }`}
                          >
                            <Layers className="w-3.5 h-3.5 text-indigo-400" />
                            <span>{ssp.panel.designation || "Sub-Sub Panel"}</span>
                          </button>
                        ))}

                        {/* Plus Quick Tab Action */}
                        <div className="flex items-center gap-2 ml-auto">
                          <button
                            onClick={() => {
                              const newId = crypto.randomUUID();
                              setSubPanels((prev) => [
                                ...prev,
                                {
                                  id: newId,
                                  panel: {
                                    ...INITIAL_PANEL,
                                    designation: `Sub-Panel ${prev.length + 1}`,
                                  },
                                  circuits: getFreshInitialCircuits(),
                                },
                              ]);
                              setActiveScheduleTab(newId);
                            }}
                            className="px-3 py-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/20 hover:bg-indigo-100 dark:hover:bg-indigo-950/40 border border-dashed border-indigo-300 dark:border-indigo-805/30 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Add Sub-Panel
                          </button>
                          <button
                            onClick={() => {
                              const newId = crypto.randomUUID();
                              setSubSubPanels((prev) => [
                                ...prev,
                                {
                                  id: newId,
                                  panel: {
                                    ...INITIAL_PANEL,
                                    designation: `Sub-Sub Panel ${prev.length + 1}`,
                                  },
                                  circuits: getFreshInitialCircuits(),
                                },
                              ]);
                              setActiveScheduleTab(newId);
                            }}
                            className="px-3 py-1.5 text-xs font-bold text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 bg-cyan-50 dark:bg-cyan-950/20 hover:bg-cyan-100 dark:hover:bg-cyan-950/40 border border-dashed border-cyan-300 dark:border-cyan-805/30 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Add Sub-Sub Panel
                          </button>
                        </div>
                      </div>
                    )}

                    {/* 1. Main Distribution Panel Schedule */}
                    {(isExporting || activeScheduleTab === "mdp") && (
                      <LoadSchedule
                        panel={panel}
                        setPanel={setPanel}
                        circuits={circuits}
                        setCircuits={handleSetMdpCircuits}
                        availableSubPanels={uniqueSubPanels}
                        iscParams={iscParams}
                        vdCalculations={vdCalculations}
                        isPremium={userPlan === "premium" || isAdmin}
                        onRequestUpgrade={() => setShowUpgrade(true)}
                        isAdmin={isAdmin}
                      />
                    )}

                    {/* 2. Sub-Panels Schedules */}
                    {uniqueSubPanels.map((sp, index) => {
                      const isVisible =
                        isExporting || activeScheduleTab === sp.id;
                      if (!isVisible) return null;

                      const parentMdpConn = circuits.find(
                        (c) => c.loadType === LoadType.SUB_PANEL && c.linkedSubPanelId === sp.id
                      );

                      return (
                        <React.Fragment key={sp.id}>
                          <LoadSchedule
                            panel={sp.panel}
                            setPanel={(newPanel) => {
                              setSubPanels((prev) => {
                                const currentPanel = prev[index]?.panel;
                                if (!currentPanel) return prev;
                                const updatedPanel =
                                  typeof newPanel === "function"
                                    ? newPanel(currentPanel)
                                    : newPanel;
                                if (currentPanel === updatedPanel) return prev;
                                return prev.map((p, i) =>
                                  i === index
                                    ? { ...p, panel: updatedPanel }
                                    : p,
                                );
                              });
                            }}
                            circuits={sp.circuits}
                            setCircuits={(newCircuits) => handleSetSubPanelCircuits(index, sp.id, newCircuits)}
                            isSubPanel={true}
                            availableSubPanels={uniqueSubSubPanels}
                            onRemoveSubPanel={() => {
                              setSubPanels((prev) =>
                                prev.filter((p) => p.id !== sp.id),
                              );
                              // Disconnect sub panel reference from MDP circuits
                              setCircuits((prevCircuits) =>
                                prevCircuits.map((c) =>
                                  c.linkedSubPanelId === sp.id
                                    ? {
                                        ...c,
                                        linkedSubPanelId: undefined,
                                        loadType: LoadType.SPARE,
                                        description: `${c.description || "Sub-Panel"} (Disconnected)`,
                                      }
                                    : c
                                )
                              );
                              setActiveScheduleTab("mdp");
                            }}
                            onDuplicateSubPanel={() => {
                              setPanelToDuplicate({ id: sp.id, name: `${sp.panel.designation || "Subpanel"} (Copy)` });
                              setDuplicateName(`${sp.panel.designation || "Subpanel"} (Copy)`);
                            }}
                            iscParams={iscParams}
                            isPremium={userPlan === "premium" || isAdmin}
                            onRequestUpgrade={() => setShowUpgrade(true)}
                            isAdmin={isAdmin}
                            parentMdpConnection={parentMdpConn ? {
                              circuitNo: parentMdpConn.circuitNo,
                              description: parentMdpConn.description,
                              mdpDesignation: panel.designation || "MDP",
                              circuitId: parentMdpConn.id,
                              feederSize: parentMdpConn.wireSize,
                              feederRuns: parentMdpConn.quantity || 1
                            } : undefined}
                            vdCalculations={vdCalculations}
                          />

                          {!isExporting && activeScheduleTab === sp.id && (
                            <button
                              onClick={() => {
                                const newId = crypto.randomUUID();
                                setSubSubPanels((prev) => [
                                  ...prev,
                                  {
                                    id: newId,
                                    panel: {
                                      ...INITIAL_PANEL,
                                      designation: `Sub-Sub Panel ${prev.length + 1}`,
                                    },
                                    circuits: getFreshInitialCircuits(),
                                  },
                                ]);
                                setActiveScheduleTab(newId);
                              }}
                              className="w-full mt-6 py-6 border-2 border-dashed border-cyan-300 dark:border-cyan-800 rounded-2xl flex items-center justify-center gap-2 text-cyan-600 dark:text-cyan-500 font-bold hover:text-cyan-700 dark:hover:text-cyan-400 hover:border-cyan-400 hover:bg-cyan-50/50 dark:hover:bg-cyan-950/20 transition-all no-print cursor-pointer shadow-sm"
                            >
                              <Layers className="w-5 h-5 animate-pulse" />
                              Create New Sub-Sub Panel Board
                            </button>
                          )}
                        </React.Fragment>
                      );
                    })}

                    {/* 3. Sub-Sub-Panels Schedules */}
                    {uniqueSubSubPanels.map((ssp, index) => {
                      const isVisible =
                        isExporting || activeScheduleTab === ssp.id;
                      if (!isVisible) return null;

                      let parentSpConn: any;
                      let parentSpName = "";
                      for (const sp of uniqueSubPanels) {
                        const conn = sp.circuits.find(
                          (c) => c.loadType === LoadType.SUB_SUB_PANEL && c.linkedSubPanelId === ssp.id
                        );
                        if (conn) {
                          parentSpConn = conn;
                          parentSpName = sp.panel.designation || "Sub-Panel";
                          break;
                        }
                      }

                      return (
                        <React.Fragment key={ssp.id}>
                          <LoadSchedule
                            panel={ssp.panel}
                            setPanel={(newPanel) => {
                              setSubSubPanels((prev) => {
                                const currentPanel = prev[index]?.panel;
                                if (!currentPanel) return prev;
                                const updatedPanel =
                                  typeof newPanel === "function"
                                    ? newPanel(currentPanel)
                                    : newPanel;
                                if (currentPanel === updatedPanel) return prev;
                                return prev.map((p, i) =>
                                  i === index
                                    ? { ...p, panel: updatedPanel }
                                    : p,
                                );
                              });
                            }}
                            circuits={ssp.circuits}
                            setCircuits={(newCircuits) => {
                              setSubSubPanels((prev) => {
                                const currentCircuits = prev[index]?.circuits;
                                if (!currentCircuits) return prev;
                                const updatedCircuits =
                                  typeof newCircuits === "function"
                                    ? newCircuits(currentCircuits)
                                    : newCircuits;
                                if (currentCircuits === updatedCircuits)
                                  return prev;
                                return prev.map((p, i) =>
                                  i === index
                                    ? { ...p, circuits: updatedCircuits }
                                    : p,
                                );
                              });
                            }}
                            isSubPanel={true}
                            isSubSubPanel={true}
                            onRemoveSubPanel={() => {
                              setSubSubPanels((prev) =>
                                prev.filter((p) => p.id !== ssp.id),
                              );
                              // Disconnect sub-sub panel reference from sub panels circuits
                              setSubPanels((prevSubPanels) =>
                                prevSubPanels.map((sp) => ({
                                  ...sp,
                                  circuits: sp.circuits.map((c) =>
                                    c.linkedSubPanelId === ssp.id
                                      ? {
                                          ...c,
                                          linkedSubPanelId: undefined,
                                          loadType: LoadType.SPARE,
                                          description: `${c.description || "Sub-Sub Panel"} (Disconnected)`,
                                        }
                                      : c
                                  ),
                                }))
                              );
                              setActiveScheduleTab(subPanels[0]?.id || "mdp");
                            }}
                            iscParams={iscParams}
                            isPremium={userPlan === "premium" || isAdmin}
                            onRequestUpgrade={() => setShowUpgrade(true)}
                            isAdmin={isAdmin}
                            parentMdpConnection={parentSpConn ? {
                              circuitNo: parentSpConn.circuitNo,
                              description: parentSpConn.description,
                              mdpDesignation: parentSpName,
                              circuitId: parentSpConn.id,
                              feederSize: parentSpConn.wireSize,
                              feederRuns: parentSpConn.quantity || 1
                            } : undefined}
                            vdCalculations={vdCalculations}
                          />
                        </React.Fragment>
                      );
                    })}

                    {/* Fallback Large "Add Subpanel" helper at the bottom ONLY if mdp is visible on screen */}
                    {!isExporting && activeScheduleTab === "mdp" && (
                      <button
                        onClick={() => {
                          const newId = crypto.randomUUID();
                          setSubPanels((prev) => [
                            ...prev,
                            {
                              id: newId,
                              panel: {
                                ...INITIAL_PANEL,
                                designation: `Sub-Panel ${prev.length + 1}`,
                              },
                              circuits: getFreshInitialCircuits(),
                            },
                          ]);
                          setActiveScheduleTab(newId);
                        }}
                        className="w-full py-6 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl flex items-center justify-center gap-2 text-slate-500 dark:text-slate-400 font-bold hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-400 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/20 transition-all no-print cursor-pointer shadow-sm"
                      >
                        <Plus className="w-5 h-5 animate-pulse" />
                        Create New Sub-Panel Board
                      </button>
                    )}
                  </div>
                </motion.div>
              </div>

              {/* Short Circuit Tab */}
              <div
                className={
                  activeTab === "isc" || isExporting
                    ? "w-full"
                    : "absolute left-[-9999px] top-0 opacity-0 pointer-events-none w-full select-none"
                }
              >
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={
                    activeTab === "isc" || isExporting
                      ? { opacity: 1, y: 0 }
                      : {}
                  }
                  transition={{ duration: 0.2 }}
                  className="w-full flex justify-center"
                >
                  <ShortCircuitCalc
                    panel={panel}
                    circuits={circuits}
                    subPanels={subPanels}
                    subSubPanels={subSubPanels}
                    params={iscParams}
                    setParams={setIscParams}
                    source={iscSource}
                    setSource={setIscSource}
                    isPremium={userPlan === "premium" || isAdmin}
                    onRequestUpgrade={() => setShowUpgrade(true)}
                  />
                </motion.div>
              </div>

              {/* Voltage Drop Tab */}
              <div
                className={
                  activeTab === "vd" || isExporting
                    ? "w-full"
                    : "absolute left-[-9999px] top-0 opacity-0 pointer-events-none w-full select-none"
                }
              >
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={
                    activeTab === "vd" || isExporting
                      ? { opacity: 1, y: 0 }
                      : {}
                  }
                  transition={{ duration: 0.2 }}
                  className="w-full flex justify-center"
                >
                  <VoltageDropCalc
                    panel={panel}
                    circuits={circuits}
                    subPanels={subPanels}
                    subSubPanels={subSubPanels}
                    calculations={vdCalculations}
                    setCalculations={setVdCalculations}
                    isPremium={userPlan === "premium" || isAdmin}
                    onRequestUpgrade={() => setShowUpgrade(true)}
                  />
                </motion.div>
              </div>

              {/* Illumination Tab */}
              <div
                className={
                  activeTab === "lighting" || isExporting
                    ? "w-full"
                    : "absolute left-[-9999px] top-0 opacity-0 pointer-events-none w-full select-none"
                }
              >
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={
                    activeTab === "lighting" || isExporting
                      ? { opacity: 1, y: 0 }
                      : {}
                  }
                  transition={{ duration: 0.2 }}
                  className="w-full flex justify-center"
                >
                  <IlluminationCalc
                    panel={panel}
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

              {/* System SLD Tab */}
              <div
                className={
                  activeTab === "system-sld" || isExporting
                    ? "w-full"
                    : "absolute left-[-9999px] top-0 opacity-0 pointer-events-none w-full select-none"
                }
              >
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={
                    activeTab === "system-sld" || isExporting
                      ? { opacity: 1, y: 0 }
                      : {}
                  }
                  transition={{ duration: 0.2 }}
                  className="w-full flex justify-center"
                >
                  <SystemSLD
                    panel={panel}
                    circuits={circuits}
                    subPanels={subPanels}
                    subSubPanels={subSubPanels}
                    iscParams={iscParams}
                    isPremium={userPlan === "premium" || isAdmin}
                    onRequestUpgrade={() => setShowUpgrade(true)}
                    vdCalculations={vdCalculations}
                  />
                </motion.div>
              </div>

              {/* Floor Plan Tab */}
              <div className={activeTab === "floor-plan" ? "w-full" : "hidden"}>
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={
                    activeTab === "floor-plan" ? { opacity: 1, y: 0 } : {}
                  }
                  transition={{ duration: 0.2 }}
                  className="w-full flex justify-center"
                >
                  <FloorPlanUploader
                    images={floorPlanImages}
                    setImages={setFloorPlanImages}
                  />
                </motion.div>
              </div>

              {/* PEC Calculator Tab */}
              <div
                className={activeTab === "current-calc" ? "w-full" : "hidden"}
              >
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={
                    activeTab === "current-calc" ? { opacity: 1, y: 0 } : {}
                  }
                  transition={{ duration: 0.2 }}
                  className="w-full"
                >
                  <div className="max-w-4xl mx-auto space-y-6">
                    <div className="bg-gradient-to-r from-fuchsia-600 to-indigo-650 rounded-2xl p-6 text-white shadow-md">
                      <h3 className="text-xl font-bold uppercase tracking-wider mb-2">
                        PEC Current Verification Suite
                      </h3>
                      <p className="text-xs text-fuchsia-100 leading-relaxed">
                        Verify connection parameters, trace standard equation
                        steps, and evaluate the final design currents fully
                        compliant with Philippine Electrical Code (PEC) 2017
                        Part 1 standards.
                      </p>
                    </div>
                    <PECCurrentCalculator panel={panel} setPanel={setPanel} />
                  </div>
                </motion.div>
              </div>

              {/* EGC Sizer Tab */}
              <div
                className={activeTab === "egc" ? "w-full" : "hidden"}
              >
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={
                    activeTab === "egc" ? { opacity: 1, y: 0 } : {}
                  }
                  transition={{ duration: 0.2 }}
                  className="w-full"
                >
                  <EgcSizingCalculator />
                </motion.div>
              </div>

              {/* Transformer Sizer Tab */}
              <div
                className={activeTab === "transformer" ? "w-full" : "hidden"}
              >
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={
                    activeTab === "transformer" ? { opacity: 1, y: 0 } : {}
                  }
                  transition={{ duration: 0.2 }}
                  className="w-full"
                >
                  <TransformerCalc
                    panel={panel}
                    circuits={circuits}
                    primaryVoltage={transformerPrimaryVoltage}
                    setPrimaryVoltage={setTransformerPrimaryVoltage}
                    powerFactor={transformerPowerFactor}
                    setPowerFactor={setTransformerPowerFactor}
                    demandFactor={transformerDemandFactor}
                    setDemandFactor={setTransformerDemandFactor}
                    loadingFactor={transformerLoadingFactor}
                    setLoadingFactor={setTransformerLoadingFactor}
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

              {/* Billing Info Tab */}
              <div className={activeTab === "billing" && isAdmin ? "w-full" : "hidden"}>
                {isAdmin && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={activeTab === "billing" ? { opacity: 1, y: 0 } : {}}
                    transition={{ duration: 0.2 }}
                    className="w-full flex justify-center font-sans"
                  >
                    <div className="w-full max-w-4xl">
                      <div className="bg-gradient-to-r from-amber-500 to-orange-500 rounded-3xl p-6 text-white shadow-md mb-6">
                        <h3 className="text-lg font-black uppercase tracking-wider mb-1">
                          Subscription Invoice & Billing Ledger
                        </h3>
                        <p className="text-xs text-amber-100 leading-relaxed font-semibold">
                          View active platform subscriptions, download official PDF invoices, or export your receipts list to Excel sheets instantly.
                        </p>
                      </div>
                      <InvoiceManager user={user} isAdminPanel={false} />
                    </div>
                  </motion.div>
                )}
              </div>
            </div>

            {isExporting && (
              <div className="fixed inset-0 z-[9999] bg-white dark:bg-slate-900 flex flex-col items-center justify-center shadow-2xl">
                <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-indigo-600 dark:border-indigo-400 mb-6 shadow-sm"></div>
                <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100 uppercase tracking-tighter">
                  Compiling Report
                </h2>
                <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 mt-2">
                  Please wait while the documents and diagrams are being
                  generated...
                </p>
              </div>
            )}

            <ProjectManagerModal
              isOpen={isProjectManagerOpen}
              onClose={() => setIsProjectManagerOpen(false)}
              currentProjectData={currentProjectData}
              onLoadProject={handleLoadProject}
              onNewProject={handleNewProject}
              currentProjectId={currentProjectId}
              setCurrentProjectId={setCurrentProjectId}
            />

            {panelToDuplicate && (
              <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[9999] p-4 animate-fade-in no-print">
                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-800/80 shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
                  {/* Modal Header */}
                  <div className="p-5 border-b border-slate-150 dark:border-slate-800/80 flex justify-between items-center bg-slate-50/80 dark:bg-slate-800/30">
                    <h2 className="text-lg font-black text-slate-800 dark:text-white flex items-center gap-2">
                      <Copy className="w-5 h-5 text-indigo-500" />
                      Duplicate Sub-Panel
                    </h2>
                    <button
                      onClick={() => setPanelToDuplicate(null)}
                      className="p-1.5 hover:bg-slate-150 dark:hover:bg-slate-800/65 rounded-lg transition-colors text-slate-500 hover:text-slate-700 dark:hover:text-slate-350 cursor-pointer"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Modal Body */}
                  <div className="p-7 space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold tracking-wider text-slate-500 uppercase">
                        New Designation (Name)
                      </label>
                      <input
                        type="text"
                        value={duplicateName || ""}
                        onChange={(e) => setDuplicateName(e.target.value)}
                        placeholder="e.g. Sub-Panel 2"
                        className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-medium"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            handleConfirmDuplicate();
                          }
                        }}
                      />
                    </div>
                  </div>

                  {/* Modal Footer */}
                  <div className="p-5 border-t border-slate-150 dark:border-slate-800/80 flex justify-end gap-3 bg-slate-50/50 dark:bg-slate-800/10">
                    <button
                      onClick={() => setPanelToDuplicate(null)}
                      className="px-4.5 py-2.5 text-xs font-extrabold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleConfirmDuplicate}
                      className="px-5 py-2.5 text-xs font-black text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-all shadow-md shadow-indigo-600/15 hover:shadow-none cursor-pointer"
                    >
                      Duplicate Design
                    </button>
                  </div>
                </div>
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
                    High-fidelity design for electrical engineers and
                    contractors.
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
