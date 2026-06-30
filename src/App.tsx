import React, { useState, useEffect, useRef, useMemo } from "react";
import { auth, db } from "./firebase";
import { onAuthStateChanged, User, signOut } from "firebase/auth";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
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
  Clock,
  Receipt,
  Hammer,
  Cpu,
  ChevronLeft,
  ChevronRight,
  Users,
  Settings,
  Lock,
  LogOut,
  Info,
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
import PowerSystemAnalysis from "./components/PowerSystemAnalysis";
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
import { syncHierarchyData } from "./utils/hierarchyEngine";
import {
  computePanelScheduleValues,
  calculateCircuitValues,
  formatWireSizeLocal,
  isIdleSpareOrSpace,
  setGlobalSubPanels,
} from "./utils/computeEngine";
import { exportToCAD } from "./utils/exportDxf";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from "recharts";

import { toPng } from "html-to-image";
import { Auth } from "./components/Auth";
import PECCurrentCalculator from "./components/PECCurrentCalculator";
import EgcSizingCalculator from "./components/EgcSizingCalculator";
import TransformerCalc from "./components/TransformerCalc";
import { ModuleManagement, SystemModule, DEFAULT_MODULES } from "./components/ModuleManagement";
import { collection, onSnapshot as onFirestoreSnapshot } from "firebase/firestore";

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
  const [userPlan, setUserPlan] = useState<"basic" | "premium" | "enterprise" | string | null>(null);
  const [activatedAt, setActivatedAt] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showRenew, setShowRenew] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
  const [isProfileSettingsOpen, setIsProfileSettingsOpen] = useState(false);
  const [isAccountSettingsOpen, setIsAccountSettingsOpen] = useState(false);
  const [countdownTime, setCountdownTime] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    totalMs: number;
  } | null>(null);

  const isAdmin =
    user?.email?.trim().toLowerCase() === "angeloperfecto31@gmail.com";
  const isActiveRef = useRef(false);

  useEffect(() => {
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

    let initialLoad = true;
    let unsubscribe: () => void;
    let retryTimeout: NodeJS.Timeout;

    const setupListener = () => {
      if (unsubscribe) {
        unsubscribe();
      }
      
      unsubscribe = onSnapshot(
        doc(db, "users", user.uid),
        (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            const plan = data.plan || "free";
            const userIsActive = data.isActive === true;
            
            // Check expiration for basic, premium, and free trials
            if ((plan === "basic" || plan === "premium" || plan === "free") && data.expiresAt) {
              const expires = new Date(data.expiresAt);
              if (new Date() >= expires) {
                // Subscription/Trial has expired
                setIsActive(false);
                isActiveRef.current = false;
                setUserPlan(plan);
                setActivatedAt(data.activatedAt || null);
                setExpiresAt(data.expiresAt);
                setShowRenew(true); // Redirect to Subscription/Upgrade Page
                setAuthLoading(false);
                return;
              }
            }

            setUserPlan(plan);
            setActivatedAt(data.activatedAt || null);
            setExpiresAt(data.expiresAt || null);
            setIsActive(userIsActive);
            isActiveRef.current = userIsActive;
          } else {
            // Profile does not exist, automatically provision a 30-Day Free Trial
            const now = new Date();
            const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
            
            const initialUserData = {
              uid: user.uid,
              email: user.email,
              displayName: user.displayName || user.email?.split("@")[0] || "Engineering User",
              plan: "free",
              isActive: true,
              activatedAt: now.toISOString(),
              expiresAt: thirtyDaysFromNow.toISOString(),
              createdAt: now.toISOString(),
              paymentStatus: "free_trial"
            };

            setDoc(doc(db, "users", user.uid), initialUserData)
              .then(() => {
                console.log("Successfully initialized user profile in Firestore.");
              })
              .catch((err) => {
                console.error("Error creating initial user profile:", err);
              });

            // Optimistically update local state so they don't have to wait for the next snapshot
            setUserPlan("free");
            setActivatedAt(now.toISOString());
            setExpiresAt(thirtyDaysFromNow.toISOString());
            setIsActive(true);
            isActiveRef.current = true;
          }
          initialLoad = false;
          setAuthLoading(false);
        },
        (error: any) => {
          console.error("Firestore listener error:", error);
          
          // Only mark as inactive if it's a definitive permission error
          if (error.code === 'permission-denied' || error.code === 'unauthenticated') {
            setIsActive(false);
            isActiveRef.current = false;
            setUserPlan(null);
            setAuthLoading(false);
          } else {
            // Transient error (like network disconnect)
            // Attempt to reconnect gracefully without breaking the user session
            retryTimeout = setTimeout(() => {
              setupListener();
            }, 5000);
          }

          try {
            handleFirestoreError(error, OperationType.GET, "users/" + user.uid);
          } catch (e) {
            // Keep the error from breaking state, but ensure it's reported
          }
        },
      );
    };

    setupListener();

    return () => {
      if (unsubscribe) unsubscribe();
      if (retryTimeout) clearTimeout(retryTimeout);
    };
  }, [user, isAdmin]);

  // Periodic expiration check
  useEffect(() => {
    if (!isActive || !expiresAt || (userPlan !== "basic" && userPlan !== "premium" && userPlan !== "free")) return;

    const checkExpiration = () => {
      const expires = new Date(expiresAt);
      if (new Date() >= expires) {
        setIsActive(false);
        isActiveRef.current = false;
        setShowRenew(true);
      }
    };

    // Check immediately and then every minute
    checkExpiration();
    const intervalId = setInterval(checkExpiration, 60000);
    return () => clearInterval(intervalId);
  }, [isActive, expiresAt, userPlan]);

  // Real-time countdown timer effect
  useEffect(() => {
    if (!expiresAt || !isActive || (userPlan !== "basic" && userPlan !== "premium" && userPlan !== "free")) {
      setCountdownTime(null);
      return;
    }

    const updateCountdown = () => {
      const target = new Date(expiresAt).getTime();
      const now = new Date().getTime();
      const diff = target - now;
      if (diff <= 0) {
        setCountdownTime({ days: 0, hours: 0, minutes: 0, seconds: 0, totalMs: 0 });
        return;
      }
      
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      
      setCountdownTime({ days, hours, minutes, seconds, totalMs: diff });
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, isActive, userPlan]);

  const [activeTab, setActiveTab] = useState<
    | "dashboard"
    | "schedule"
    | "isc"
    | "vd"
    | "lighting"
    | "floor-plan"
    | "verify"
    | "verify-registrations"
    | "current-calc"
    | "egc"
    | "system-sld"
    | "transformer"
    | "power-suite"
    | "billing"
    | "module-management"
  >("dashboard");

  const [systemModules, setSystemModules] = useState<SystemModule[]>(DEFAULT_MODULES);

  useEffect(() => {
    const unsub = onFirestoreSnapshot(collection(db, "modules"), (snapshot) => {
      const docs = snapshot.docs.map(d => d.data() as SystemModule);
      const merged = DEFAULT_MODULES.map(def => {
        const found = docs.find(d => d.id === def.id);
        return found || def;
      });
      setSystemModules(merged);
    });
    return unsub;
  }, []);

  const activeModuleStatus = systemModules.find(m => m.id === activeTab);
  const isMaintenanceMode = activeModuleStatus?.status === "maintenance" && !isAdmin;
  const isDisabledMode = activeModuleStatus?.status === "disabled" && !isAdmin;
  const isHiddenMode = activeModuleStatus?.status === "hidden" && !isAdmin;

  const getModuleStatus = (moduleId: string) => {
    if (isAdmin) return "active";
    const mod = systemModules.find(m => m.id === moduleId);
    return mod?.status || "active";
  };

  // If a tab becomes disabled or hidden while a non-admin is on it, kick them to dashboard
  useEffect(() => {
    if (isDisabledMode || isHiddenMode) {
      setActiveTab("dashboard");
    }
  }, [isDisabledMode, isHiddenMode]);

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
  

  const uniqueSubPanels = useMemo(() => {
    const seen = new Set<string>();
    return subPanels.filter((sp) => {
      if (!sp || !sp.id) return false;
      if (seen.has(sp.id)) return false;
      seen.add(sp.id);
      return true;
    });
  }, [subPanels]);

  

  useEffect(() => {
    setGlobalSubPanels(uniqueSubPanels);
  }, [uniqueSubPanels]);

  // State for calculators to prevent reset on tab change
  const [iscParams, setIscParams] = useState<ShortCircuitParams>(
    INITIAL_SHORT_CIRCUIT_PARAMS,
  );
  const [iscSource, setIscSource] = useState<string>("auto");

  const [vdCalculations, setVdCalculations] = useState<
    VoltageDropCalculation[]
  >(INITIAL_VOLTAGE_DROP_CALCULATIONS);

  const [transformerPrimaryVoltage, setTransformerPrimaryVoltage] = useState<number>(13800);
  const [transformerPowerFactor, setTransformerPowerFactor] = useState<number>(0.85);
  const [transformerDemandFactor, setTransformerDemandFactor] = useState<number>(0.80);
  const [transformerLoadingFactor, setTransformerLoadingFactor] = useState<number>(0.80);

  // Real-time synchronization of Short Circuit and Voltage Drop calculation parameters
  useEffect(() => {
    if (!circuits || !panel) return;
    
    if (iscSource === "auto") {
      const { mainFeeder, totalVA } = computePanelScheduleValues(panel, circuits);
      const totalKVA = totalVA / 1000;
      const demandKVA = totalKVA * transformerDemandFactor;
      const requiredKVA = transformerLoadingFactor > 0 ? demandKVA / transformerLoadingFactor : 0;
      
      const standardKVA = [10, 15, 25, 37.5, 50, 75, 100, 167, 250, 333, 500, 750, 1000, 1500, 2000, 2500];
      const recommendedKVA = standardKVA.find(k => k >= requiredKVA) || standardKVA[standardKVA.length - 1];

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
          p.primaryVoltage === transformerPrimaryVoltage &&
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
          primaryVoltage: transformerPrimaryVoltage,
          feederSize: recommendedFeederSize,
          feederRuns: recommendedRuns,
          transformerConnection: panel.transformerConnection || p.transformerConnection
        };
      });
    }
  }, [iscSource, circuits, panel, transformerDemandFactor, transformerLoadingFactor, transformerPrimaryVoltage]);

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
      const mainWireSets = mainFeeder.wire.runs || 1;
      const mainVoltage = panel.voltage;
      const mainSystemType: "1PH" | "3PH" = is3PH ? "3PH" : "1PH";

      const existingMain = prevMap.get("main");
      if (existingMain) {
        const hasMainChanged =
          existingMain.loadA !== mainLoadA ||
          existingMain.wireSize !== mainWireSize ||
          existingMain.wireSets !== mainWireSets ||
          existingMain.voltage !== mainVoltage ||
          existingMain.systemType !== mainSystemType;
        if (hasMainChanged) {
          changed = true;
        }
        updatedCalcs.push({
          ...existingMain,
          loadA: mainLoadA,
          wireSize: mainWireSize,
          wireSets: mainWireSets,
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
          wireSets: mainWireSets,
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
        const branchIs3P = c.is3PhaseMarker !== undefined ? c.is3PhaseMarker : (c.phases && c.phases.length === 3);
        const branchSystemType: "1PH" | "3PH" = branchIs3P ? "3PH" : "1PH";

        if (existingBranch) {
          const isLoadADiff = existingBranch.loadA !== c.loadA && !(Number.isNaN(existingBranch.loadA) && Number.isNaN(c.loadA));
          const isVoltageDiff = existingBranch.voltage !== c.voltage && !(existingBranch.voltage == null && c.voltage == null) && !(Number.isNaN(existingBranch.voltage) && Number.isNaN(c.voltage));
          const hasBranchChanged =
            existingBranch.name !== branchName ||
            isLoadADiff ||
            existingBranch.wireSize !== c.wireSize ||
            existingBranch.wireSets !== c.wireSets ||
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
            wireSets: c.wireSets,
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
            wireSets: c.wireSets,
            voltage: c.voltage,
            systemType: branchSystemType,
          });
        }
      });

      // 3. Maintain Sub-Panel Feeders & their branch circuits
      const allSubPanels = [...subPanels, ...subPanels];
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
          const spWireSets = spMainFeeder.wire.runs || 1;
          const spVoltage = sp.panel.voltage;
          const spSystemType: "1PH" | "3PH" = spIs3PH ? "3PH" : "1PH";
          const spName = `${sp.panel.designation || "Sub-Panel"} Feeder`;

          const existingSp = prevMap.get(sp.id);
          if (existingSp) {
            const hasSpChanged =
              existingSp.name !== spName ||
              existingSp.loadA !== spLoadA ||
              existingSp.wireSize !== spWireSize ||
              existingSp.wireSets !== spWireSets ||
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
              wireSets: spWireSets,
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
              wireSets: spWireSets,
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
  }, [circuits, panel, subPanels, subPanels]);

  const [illumParams, setIllumParams] = useState<IlluminationParams>(
    INITIAL_ILLUMINATION_PARAMS,
  );

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
              c.wattage !== estimatedWattage
            ) {
              circuitsChanged = true;
              return {
                ...c,
                quantity: matchingRoom.fixturesCount,
                wattage: estimatedWattage,
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
              "kaicOverride",
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
    let subPanelsToUpdate: { id: string; panel: Partial<PanelConfig> }[] = [];

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
              "kaicOverride",
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

      return prevSubPanels.map((p) =>
        p.id === spId ? { ...p, circuits: nextCircuits } : p
      );
    });

    if (subPanelsToUpdate.length > 0) {
      setSubPanels((prev) => 
        prev.map((ssp) => {
          const update = subPanelsToUpdate.find(u => u.id === ssp.id);
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

  // Centralized N-Level Hierarchy Synchronization
  useEffect(() => {
    const { updatedMdpCircuits, updatedSubPanels, hasChanges } = syncHierarchyData(
      panel,
      circuits,
      subPanels,
      vdCalculations
    );

    if (hasChanges) {
      setCircuits(updatedMdpCircuits);
      setSubPanels(updatedSubPanels);
    }
  }, [panel, circuits, subPanels, vdCalculations]);

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
    const originalSsp = subPanels.find((ssp) => ssp.id === targetId);
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
      setSubPanels((prev) => {
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

    const migratedSubSubPanels = (data.subPanels || []).map((sp) => {
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
    setSubPanels(migratedSubSubPanels);

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
          wireSets: mainFeeder.wire.runs || 1,
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
            wireSets: mainFeeder.wire.runs || 1,
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

  const handleNewProject = (configOverrides?: Partial<PanelConfig>) => {
    setCurrentProjectId(null);
    setPanel({ ...INITIAL_PANEL, ...configOverrides });
    setCircuits(getFreshInitialCircuits());
    setSubPanels([]);
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

  if (showRenew && (userPlan !== "enterprise" || isAdmin)) {
    return (
      <PaymentScreen
        user={user}
        isUpgrade={false}
        onClose={() => setShowRenew(false)}
        onPaymentSuccess={() => setShowRenew(false)}
      />
    );
  }

  if (showUpgrade && (userPlan !== "enterprise" || isAdmin)) {
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
            icon: Users,
            color: "text-amber-600",
            bg: "bg-amber-50",
          },
          {
            id: "verify-registrations",
            label: "Verify Registrations",
            icon: ShieldCheck,
            color: "text-amber-600",
            bg: "bg-amber-50",
          },
          {
            id: "module-management",
            label: "Module Visibility",
            icon: Settings,
            color: "text-amber-600",
            bg: "bg-amber-50",
          },
        ]
      : []),
  ];

  // We now import computePanelScheduleValues from computeEngine.ts

  const exportToExcel = () => {
    try {
      const isPremiumUser = userPlan === "premium" || userPlan === "enterprise" || isAdmin;
      const wb = XLSX.utils.book_new();

      const { updatedMdpCircuits, updatedSubPanels } = syncHierarchyData(panel, circuits, subPanels, vdCalculations);

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
        { id: "main", panel, circuits: updatedMdpCircuits, type: "MDP" },
        ...updatedSubPanels.map((sp) => ({
          id: sp.id,
          panel: sp.panel,
          circuits: sp.circuits,
          type: "Sub Panel"
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
            conduitType,
            poles,
            type,
            kaic,
            af,
          },
        } = computePanelScheduleValues(p, c, { vdCalculations, panelId: item.id });

        const formatWireSize = (size: number): string =>
          size <= 8 ? size.toFixed(1) : size.toString();

        const wsData: any[][] = [];
        wsData.push(["ELECTRICAL LOAD SCHEDULE", "", "", "", "", ""]);
        wsData.push([]);
        if (p.projectType) wsData.push(["PROJECT TYPE:", p.projectType.toUpperCase()]);
        if (p.owner) wsData.push(["OWNER:", p.owner.toUpperCase()]);
        wsData.push(["PROJECT:", (p.project || "").toUpperCase(), "", "SYSTEM:", (p.system || "").toUpperCase()]);
        wsData.push([
          "PANEL DESIGNATION:",
          (p.designation || "").toUpperCase(),
          "",
          "VOLTAGE:",
          p.voltage,
        ]);
        wsData.push(["", "", "", "PRIMARY VOLTAGE:", transformerPrimaryVoltage]);
        wsData.push(["", "", "", "TX CONNECTION:", (p.transformerConnection || "Delta-Wye (Δ-Y)").toUpperCase()]);
        if (p.location) wsData.push(["LOCATION:", p.location.toUpperCase()]);
        wsData.push([]);

        const is3Phase = p.system.includes("3PH");
        const headerRowIndex = wsData.length;

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
            if (isSpace || cir.loadType === LoadType.SPARE) {
              row.push("-", "-", "-", "-");
            } else if (cir.subPanelReflectionMode === "phase_loads" && cir.reflectedPhaseAmps) {
              row.push(
                cir.reflectedPhaseAmps.R > 0 ? cir.reflectedPhaseAmps.R.toFixed(2) : "-",
                cir.reflectedPhaseAmps.Y > 0 ? cir.reflectedPhaseAmps.Y.toFixed(2) : "-",
                cir.reflectedPhaseAmps.B > 0 ? cir.reflectedPhaseAmps.B.toFixed(2) : "-",
                cir.reflectedPhaseAmps.ThreePhase > 0 ? cir.reflectedPhaseAmps.ThreePhase.toFixed(2) : "-"
              );
            } else {
              const phases = cir.phases || [];
              row.push(
                phases.includes("R") && phases.length < 3
                  ? cir.loadA.toFixed(2)
                  : "-",
                phases.includes("Y") && phases.length < 3
                  ? cir.loadA.toFixed(2)
                  : "-",
                phases.includes("B") && phases.length < 3
                  ? cir.loadA.toFixed(2)
                  : "-",
                phases.length === 3 ? cir.loadA.toFixed(2) : "-",
              );
            }
          } else {
            row.push(isSpace || cir.loadType === LoadType.SPARE ? "-" : cir.loadA.toFixed(2));
          }

          row.push(
            isSpace ? "-" : cir.mcbAT,
            isSpace ? "-" : cir.mcbAF,
            isSpace ? "-" : cir.mcbP,
            isSpace ? "-" : cir.mcbKAIC,
            isSpace ? "-" : cir.mcbType,
            isSpace
              ? "-"
              : `${cir.wireSets && cir.wireSets > 1 ? `${cir.wireSets} Sets of ` : ''}${cir.wireSize}mm² ${cir.wireType} / ${cir.groundSize}mm² GND in ${cir.conduitSize} ${cir.conduitType}`,
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
          `${wire.runs && wire.runs > 1 ? `${wire.runs} Sets of ` : ''}${formatWireSize(wire.size)}mm² THHN, ${groundSize}mm² GND in ${conduitSize} ${conduitType || "PVC"}`,
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
        merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: numCols - 1 } });
        if (is3Phase) {
          merges.push({ s: { r: headerRowIndex, c: 0 }, e: { r: headerRowIndex + 1, c: 0 } });
          merges.push({ s: { r: headerRowIndex, c: 1 }, e: { r: headerRowIndex + 1, c: 1 } });
          merges.push({ s: { r: headerRowIndex, c: 2 }, e: { r: headerRowIndex + 1, c: 2 } });
          merges.push({ s: { r: headerRowIndex, c: 3 }, e: { r: headerRowIndex + 1, c: 3 } });
          merges.push({ s: { r: headerRowIndex, c: 4 }, e: { r: headerRowIndex + 1, c: 4 } });
          merges.push({ s: { r: headerRowIndex, c: 5 }, e: { r: headerRowIndex + 1, c: 5 } });
          merges.push({ s: { r: headerRowIndex, c: 6 }, e: { r: headerRowIndex, c: 9 } }); // AMPS spans cols 6, 7, 8, 9
          merges.push({ s: { r: headerRowIndex, c: 10 }, e: { r: headerRowIndex + 1, c: 10 } });
          merges.push({ s: { r: headerRowIndex, c: 11 }, e: { r: headerRowIndex + 1, c: 11 } });
          merges.push({ s: { r: headerRowIndex, c: 12 }, e: { r: headerRowIndex + 1, c: 12 } });
          merges.push({ s: { r: headerRowIndex, c: 13 }, e: { r: headerRowIndex + 1, c: 13 } });
          merges.push({ s: { r: headerRowIndex, c: 14 }, e: { r: headerRowIndex + 1, c: 14 } });
          merges.push({ s: { r: headerRowIndex, c: 15 }, e: { r: headerRowIndex + 1, c: 15 } });
        }
        if (merges.length > 0) {
          ws["!merges"] = merges;
        }

        // Add merges for bottom total row labels
        merges.push({
          s: { r: headerRowIndex + 1 + headerRowOffset + c.length + 1, c: 0 },
          e: { r: headerRowIndex + 1 + headerRowOffset + c.length + 1, c: 3 },
        });
        merges.push({
          s: { r: headerRowIndex + 1 + headerRowOffset + c.length + 2, c: 0 },
          e: { r: headerRowIndex + 1 + headerRowOffset + c.length + 2, c: 3 },
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
            const isTopHeaderRow = R < headerRowIndex;
            const isTableHeader = (R >= headerRowIndex && R <= headerRowIndex + headerRowOffset);
            const isHeader = isTopHeaderRow || isTableHeader;
            const isTotalRow = (R === headerRowIndex + 1 + headerRowOffset + c.length + 1) || (R === headerRowIndex + 1 + headerRowOffset + c.length + 2);
            const isSummaryRow = (R >= headerRowIndex + 1 + headerRowOffset + c.length + 4);

            if (!cellExists && !isHeader && !isTotalRow && !isSummaryRow) {
              continue; // Optimization: skip empty elements to save memory
            }

            if (!ws[cellAddress]) ws[cellAddress] = { t: "s", v: "" };

            let style: any = {
              font: { name: "Segoe UI", sz: 10, color: { rgb: "334155" } }, // Slate-700
              fill: { fgColor: { rgb: "FFFFFF" } },
              alignment: { vertical: "center", horizontal: "center" },
              border: {
                top: { style: "thin", color: { rgb: "E2E8F0" } },
                bottom: { style: "thin", color: { rgb: "E2E8F0" } },
                left: { style: "thin", color: { rgb: "E2E8F0" } },
                right: { style: "thin", color: { rgb: "E2E8F0" } },
              },
            };

            if (isTopHeaderRow) {
              if (R === 0) {
                // Main Banner title
                style.font = { name: "Segoe UI", sz: 12, bold: true, color: { rgb: "FFFFFF" } };
                style.fill.fgColor.rgb = "1E3A8A"; // Royal Navy Blue
                style.alignment = { horizontal: "left", vertical: "center", indent: 1 };
                style.border = {
                  top: { style: "medium", color: { rgb: "172554" } },
                  bottom: { style: "medium", color: { rgb: "172554" } },
                  left: { style: "medium", color: { rgb: "172554" } },
                  right: { style: "medium", color: { rgb: "172554" } },
                };
              } else if (ws[cellAddress].v && ws[cellAddress].v.toString().endsWith(":")) {
                style.font = { name: "Segoe UI", sz: 10, bold: true, color: { rgb: "1E293B" } }; // Slate-800
                style.fill.fgColor.rgb = "FFFFFF";
                style.alignment = { horizontal: "left", vertical: "center", indent: 1 };
                style.border = { top: { style: "none" }, bottom: { style: "none" }, left: { style: "none" }, right: { style: "none" } };
              } else {
                style.font = { name: "Segoe UI", sz: 10, bold: false, color: { rgb: "334155" } }; // Slate-700
                style.fill.fgColor.rgb = "FFFFFF";
                style.alignment = { horizontal: "left", vertical: "center" };
                style.border = { top: { style: "none" }, bottom: { style: "none" }, left: { style: "none" }, right: { style: "none" } };
              }
            } else if (isTableHeader) {
              // Table Header row (Load schedule columns header group)
              style.font = { name: "Segoe UI", sz: 10, bold: true, color: { rgb: "FFFFFF" } };
              style.fill.fgColor.rgb = "312E81"; // Indigo Navy
              style.alignment = { horizontal: "center", vertical: "center", wrapText: true };
              style.border = {
                bottom: { style: "medium", color: { rgb: "1E1B4B" } },
                top: { style: "medium", color: { rgb: "1E1B4B" } },
                left: { style: "thin", color: { rgb: "C7D2FE" } },
                right: { style: "thin", color: { rgb: "C7D2FE" } },
              };
            } else if (
              R >= headerRowIndex + 1 + headerRowOffset &&
              R < headerRowIndex + 1 + headerRowOffset + c.length
            ) {
              // Table data rows
              style.border = {
                bottom: { style: "thin", color: { rgb: "E2E8F0" } },
                left: { style: "thin", color: { rgb: "E2E8F0" } },
                right: { style: "thin", color: { rgb: "E2E8F0" } },
                top: { style: "thin", color: { rgb: "E2E8F0" } },
              };
              if (R % 2 !== 0) {
                style.fill.fgColor.rgb = "F8FAFC"; // Alternating Slate border zebra
              }
              if (C === 1) {
                // Description (load name) of circuit - align left
                style.alignment = { horizontal: "left", vertical: "center", indent: 1 };
              } else {
                style.alignment = { horizontal: "center", vertical: "center" };
              }
            } else if (isTotalRow) {
              // Total rows
              style.font = { name: "Segoe UI", sz: 10, bold: true, color: { rgb: "1E1B4B" } };
              style.fill.fgColor.rgb = "EEF2FF"; // soft indigo background for accountant calculations
              style.alignment = { horizontal: C <= 3 ? "left" : "center", vertical: "center", indent: C <= 3 ? 1 : 0 };
              style.border = {
                top: { style: "thin", color: { rgb: "312E81" } },
                bottom: R === headerRowIndex + 1 + headerRowOffset + c.length + 2 ? { style: "double", color: { rgb: "312E81" } } : { style: "thin", color: { rgb: "312E81" } },
                left: { style: "thin", color: { rgb: "C7D2FE" } },
                right: { style: "thin", color: { rgb: "C7D2FE" } },
              };
            } else if (isSummaryRow) {
              // Summaries at bottom
              style.fill.fgColor.rgb = "F8FAFC";
              style.font = { name: "Segoe UI", sz: 9.5, color: { rgb: "475569" } };
              style.alignment = { horizontal: "left", vertical: "center", indent: 1 };
              style.border = {
                top: { style: "thin", color: { rgb: "F1F5F9" } },
                bottom: { style: "thin", color: { rgb: "F1F5F9" } },
                left: { style: "none" },
                right: { style: "none" },
              };
              if (C === 0) {
                style.font.bold = true;
                style.font.color = { rgb: "0F172A" };
              }
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
      if (isPremiumUser && vdCalculations && vdCalculations.length > 0) {
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

        const panelsForVd = [
          { id: "main", type: "MDP", panel: panel, circuits: circuits },
          ...(subPanels || [])
        ].filter(p => p && p.panel);
        
        const allSpIds = new Set([...(subPanels || [])].map(sp => sp.id));

        panelsForVd.forEach((group) => {
          const groupCalcs = vdCalculations.filter(c => 
            c.source === group.id || 
            (group.circuits && group.circuits.some(circuit => circuit.id === c.source))
          );

          if (groupCalcs.length > 0) {
            vdData.push([`PANEL: ${group.panel.designation || ("type" in group ? (group as any).type : "Sub Panel")}`]);
            vdData.push([
              "LINE NAME",
              "CURRENT (A)",
              "LENGTH (m)",
              "WIRE SIZE (mm²)",
              "VOLTAGE",
              "SYSTEM TYPE",
              "VD (V)",
              "VD (%)",
              "LIMIT (%)",
              "STATUS",
            ]);

            groupCalcs.forEach((vd) => {
              const factor = vd.systemType === "3PH" ? 1.732 : 2;
              const cLength = vd.length || 0;
              const cLoad = vd.loadA || 0;
              const cVoltage = vd.voltage || 230;
              const dataStr = vd.wireSize;
              const impedanceInfo = WIRE_IMPEDANCE_TABLE[dataStr] || WIRE_IMPEDANCE_TABLE["3.5"] || { r: 5.76, x: 0.157 };
              
              const sets = vd.wireSets && vd.wireSets > 1 ? vd.wireSets : 1;
              const R = impedanceInfo.r / sets;

              const VD_v = (factor * cLength * cLoad * R) / 1000;
              const VD_percent = (VD_v / cVoltage) * 100;
              
              const isFeeder = vd.source === "main" || allSpIds.has(vd.source) || vd.name.toLowerCase().includes("feeder");
              const limit = isFeeder ? 5.0 : 3.0;
              const isWarning = VD_percent > limit * 0.9 && VD_percent <= limit;
              const isCompliant = VD_percent <= limit;
              const status = !isCompliant ? "CRITICAL" : (isWarning ? "WARNING" : "COMPLIANT");

              vdData.push([
                vd.name,
                vd.loadA,
                vd.length,
                vd.wireSets && vd.wireSets > 1 ? `${vd.wireSets}x ${vd.wireSize}` : vd.wireSize,
                vd.voltage,
                vd.systemType,
                VD_v.toFixed(2),
                VD_percent.toFixed(2) + "%",
                limit.toFixed(1) + "%",
                status,
              ]);
            });
            vdData.push([]);
          }
        });

        // Add custom calculations not belonging to any panel
        const customCalcs = vdCalculations.filter(c => c.source === "custom");
        if (customCalcs.length > 0) {
            vdData.push([`CUSTOM CIRCUITS`]);
            vdData.push([
              "LINE NAME",
              "CURRENT (A)",
              "LENGTH (m)",
              "WIRE SIZE (mm²)",
              "VOLTAGE",
              "SYSTEM TYPE",
              "VD (V)",
              "VD (%)",
              "LIMIT (%)",
              "STATUS",
            ]);

            customCalcs.forEach((vd) => {
              const factor = vd.systemType === "3PH" ? 1.732 : 2;
              const cLength = vd.length || 0;
              const cLoad = vd.loadA || 0;
              const cVoltage = vd.voltage || 230;
              const dataStr = vd.wireSize;
              const impedanceInfo = WIRE_IMPEDANCE_TABLE[dataStr] || WIRE_IMPEDANCE_TABLE["3.5"] || { r: 5.76, x: 0.157 };
              
              const sets = vd.wireSets && vd.wireSets > 1 ? vd.wireSets : 1;
              const R = impedanceInfo.r / sets;

              const VD_v = (factor * cLength * cLoad * R) / 1000;
              const VD_percent = (VD_v / cVoltage) * 100;
              
              const limit = 3.0;
              const isWarning = VD_percent > limit * 0.9 && VD_percent <= limit;
              const isCompliant = VD_percent <= limit;
              const status = !isCompliant ? "CRITICAL" : (isWarning ? "WARNING" : "COMPLIANT");

              vdData.push([
                vd.name,
                vd.loadA,
                vd.length,
                vd.wireSets && vd.wireSets > 1 ? `${vd.wireSets}x ${vd.wireSize}` : vd.wireSize,
                vd.voltage,
                vd.systemType,
                VD_v.toFixed(2),
                VD_percent.toFixed(2) + "%",
                limit.toFixed(1) + "%",
                status,
              ]);
            });
            vdData.push([]);
        }

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

        wsVd["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 9 } }];

        const rangeVd = XLSX.utils.decode_range(wsVd["!ref"] || "A1:A1");
        const wsrowsVd = [];
        for (let r = 0; r <= rangeVd.e.r; r++) {
          if (r === 0) wsrowsVd.push({ hpt: 28 });
          else if (r === 1) wsrowsVd.push({ hpt: 12 });
          else if (r === 2) wsrowsVd.push({ hpt: 24 });
          else wsrowsVd.push({ hpt: 20 });
        }
        wsVd["!rows"] = wsrowsVd;

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
              font: { name: "Segoe UI", sz: 10, color: { rgb: "334155" } }, // Slate-700
              fill: { fgColor: { rgb: "FFFFFF" } },
              alignment: { vertical: "center", horizontal: "center" },
              border: {
                top: { style: "thin", color: { rgb: "E2E8F0" } },
                bottom: { style: "thin", color: { rgb: "E2E8F0" } },
                left: { style: "thin", color: { rgb: "E2E8F0" } },
                right: { style: "thin", color: { rgb: "E2E8F0" } }
              }
            };
            
            if (R === 0) {
              // Title Banner block
              style.font = { name: "Segoe UI", sz: 12, bold: true, color: { rgb: "FFFFFF" } };
              style.fill.fgColor.rgb = "1E3A8A"; // Royal Navy Blue
              style.alignment = { horizontal: "left", vertical: "center", indent: 1 };
              style.border = {
                bottom: { style: "medium", color: { rgb: "172554" } }
              };
            } else if (R === 1) {
              // Spacer row
              style.border = {
                top: { style: "none" },
                bottom: { style: "none" },
                left: { style: "none" },
                right: { style: "none" }
              };
            } else if (R === 2) {
              // Table header columns
              style.font = { name: "Segoe UI", sz: 9.5, bold: true, color: { rgb: "FFFFFF" } };
              style.fill.fgColor.rgb = "312E81"; // Indigo Navy
              style.alignment = { horizontal: "center", vertical: "center", wrapText: true };
              style.border = {
                bottom: { style: "medium", color: { rgb: "1E1B4B" } },
                top: { style: "medium", color: { rgb: "1E1B4B" } }
              };
            } else {
              // Zebra Row Striping
              if (R % 2 === 0) {
                style.fill.fgColor.rgb = "F8FAFC"; // Slate-50 alternating row bg
              }

              // Adjust alignment based on column type
              if (C === 0 || C === 1) {
                style.alignment = { horizontal: "left", vertical: "center", indent: 1 };
              } else if (C === 2 || C === 3 || C === 7 || C === 8) {
                style.alignment = { horizontal: "right", vertical: "center" };
              } else {
                style.alignment = { horizontal: "center", vertical: "center" };
              }

              // Bold status badge colors
              if (C === 9) {
                style.font.bold = true;
                const val = String(wsVd[cellAddress].v).toUpperCase();
                if (val.includes("PASSED") || val.includes("PASS")) {
                  style.font.color = { rgb: "047857" }; // Emerald-700
                  style.fill.fgColor.rgb = "D1FAE5"; // Emerald-100
                } else if (val.includes("FAILED") || val.includes("FAIL")) {
                  style.font.color = { rgb: "B91C1C" }; // Red-700
                  style.fill.fgColor.rgb = "FEE2E2"; // Red-100
                }
              }
            }
            wsVd[cellAddress].s = style;
          }
        }
        XLSX.utils.book_append_sheet(wb, wsVd, "Voltage_Drop");
      }

      // -----------------------------------------------------
      // Short Circuit Export
      // -----------------------------------------------------
      if (isPremiumUser) {
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
      const wscolsSc = [{ wch: 55 }, { wch: 25 }, { wch: 18 }];
      wsSc["!cols"] = wscolsSc;

      wsSc["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }];

      const rangeSc = XLSX.utils.decode_range(wsSc["!ref"] || "A1:A1");
      const wsrowsSc = [];
      for (let r = 0; r <= rangeSc.e.r; r++) {
        if (r === 0) wsrowsSc.push({ hpt: 28 });
        else if (scData[r] && scData[r].length === 0) wsrowsSc.push({ hpt: 12 });
        else if (r === 2 || r === 15 || r === 25) wsrowsSc.push({ hpt: 24 });
        else wsrowsSc.push({ hpt: 20 });
      }
      wsSc["!rows"] = wsrowsSc;

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
            font: { name: "Segoe UI", sz: 10, color: { rgb: "334155" } }, // Slate-700
            fill: { fgColor: { rgb: "FFFFFF" } },
            alignment: { vertical: "center", horizontal: "center" },
            border: {
              top: { style: "thin", color: { rgb: "E2E8F0" } },
              bottom: { style: "thin", color: { rgb: "E2E8F0" } },
              left: { style: "thin", color: { rgb: "E2E8F0" } },
              right: { style: "thin", color: { rgb: "E2E8F0" } }
            }
          };

          if (R === 0) {
            // Main Banner Title
            style.font = { name: "Segoe UI", sz: 12, bold: true, color: { rgb: "FFFFFF" } };
            style.fill.fgColor.rgb = "1E3A8A"; // Royal Navy Blue
            style.alignment = { horizontal: "left", vertical: "center", indent: 1 };
            style.border = {
              bottom: { style: "medium", color: { rgb: "172554" } }
            };
          } else if (wsSc[cellAddress].v === "" && !isHeader) {
            // Spacer row / Blank cells
            style.border = {
              top: { style: "none" },
              bottom: { style: "none" },
              left: { style: "none" },
              right: { style: "none" }
            };
          } else if (R === 2 || R === 15 || R === 25) {
            // Section Headers
            style.font = { name: "Segoe UI", sz: 10, bold: true, color: { rgb: "FFFFFF" } };
            style.fill.fgColor.rgb = "312E81"; // Indigo Navy
            style.alignment = { horizontal: "left", vertical: "center", indent: 1 };
            style.border = {
              bottom: { style: "medium", color: { rgb: "1E1B4B" } },
              top: { style: "medium", color: { rgb: "1E1B4B" } }
            };
          } else {
            // Zebra data row striping
            if (R % 2 === 0) {
              style.fill.fgColor.rgb = "F8FAFC"; // Slate-50 alternating bg
            }

            // Alignments
            if (C === 0) {
              style.alignment = { horizontal: "left", vertical: "center", indent: 1 };
            } else if (C === 1) {
              style.alignment = { horizontal: "right", vertical: "center" };
              style.font.bold = true;
              style.font.color = { rgb: "0F172A" }; // Slate-900 (key values bold)
            } else if (C === 2) {
              style.alignment = { horizontal: "center", vertical: "center" };
              style.font.italic = true;
              style.font.color = { rgb: "64748B" }; // Muted Slate
            }
          }
          wsSc[cellAddress].s = style;
        }
      }
      XLSX.utils.book_append_sheet(wb, wsSc, "Short_Circuit");
      }

      // -----------------------------------------------------
      // Illumination Export
      // -----------------------------------------------------
      if (
        isPremiumUser &&
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

        wsIll["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 10 } }];

        const rangeIll = XLSX.utils.decode_range(wsIll["!ref"] || "A1:A1");
        const wsrowsIll = [];
        for (let r = 0; r <= rangeIll.e.r; r++) {
          if (r === 0) wsrowsIll.push({ hpt: 28 });
          else if (r === 1) wsrowsIll.push({ hpt: 12 });
          else if (r === 2) wsrowsIll.push({ hpt: 24 });
          else wsrowsIll.push({ hpt: 20 });
        }
        wsIll["!rows"] = wsrowsIll;

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
              font: { name: "Segoe UI", sz: 10, color: { rgb: "334155" } }, // Slate-700
              fill: { fgColor: { rgb: "FFFFFF" } },
              alignment: { vertical: "center", horizontal: "center" },
              border: {
                top: { style: "thin", color: { rgb: "E2E8F0" } },
                bottom: { style: "thin", color: { rgb: "E2E8F0" } },
                left: { style: "thin", color: { rgb: "E2E8F0" } },
                right: { style: "thin", color: { rgb: "E2E8F0" } }
              }
            };

            if (R === 0) {
              // Main Banner Title
              style.font = { name: "Segoe UI", sz: 12, bold: true, color: { rgb: "FFFFFF" } };
              style.fill.fgColor.rgb = "1E3A8A"; // Royal Navy Blue
              style.alignment = { horizontal: "left", vertical: "center", indent: 1 };
              style.border = {
                bottom: { style: "medium", color: { rgb: "172554" } }
              };
            } else if (R === 1) {
              // Spacer row
              style.border = {
                top: { style: "none" },
                bottom: { style: "none" },
                left: { style: "none" },
                right: { style: "none" }
              };
            } else if (R === 2) {
              // Table header columns
              style.font = { name: "Segoe UI", sz: 9.5, bold: true, color: { rgb: "FFFFFF" } };
              style.fill.fgColor.rgb = "312E81"; // Indigo Navy
              style.alignment = { horizontal: "center", vertical: "center", wrapText: true };
              style.border = {
                bottom: { style: "medium", color: { rgb: "1E1B4B" } },
                top: { style: "medium", color: { rgb: "1E1B4B" } }
              };
            } else {
              // Zebra data row striping
              if (R % 2 === 0) {
                style.fill.fgColor.rgb = "F8FAFC"; // Slate-50 alternating bg
              }

              // Adjust alignment based on column type
              if (C === 0 || C === 3) {
                style.alignment = { horizontal: "left", vertical: "center", indent: 1 };
              } else if (C === 1 || C === 2 || C === 4 || C === 5 || C === 6 || C === 7 || C === 8) {
                style.alignment = { horizontal: "right", vertical: "center" };
              } else {
                style.alignment = { horizontal: "center", vertical: "center" };
              }

              // Bold status badge colors
              if (C === 9) {
                style.font.bold = true;
                const val = String(wsIll[cellAddress].v).toUpperCase();
                if (val.includes("PASSED") || val.includes("PASS")) {
                  style.font.color = { rgb: "047857" }; // Emerald-700
                  style.fill.fgColor.rgb = "D1FAE5"; // Emerald-100
                } else if (val.includes("FAILED") || val.includes("FAIL")) {
                  style.font.color = { rgb: "B91C1C" }; // Red-700
                  style.fill.fgColor.rgb = "FEE2E2"; // Red-100
                }
              }
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
    const isPremiumUser = userPlan === "premium" || userPlan === "enterprise" || isAdmin;
    if (!isPremiumUser) {
      alert("Word and PDF document exports are available exclusively with the Premium Plan. Upgrade your subscription to unlock professional document generation.");
      setShowUpgrade(true);
      return;
    }

    const { updatedMdpCircuits, updatedSubPanels } = syncHierarchyData(panel, circuits, subPanels, vdCalculations);

    if (user?.uid) {
      try {
        const response = await fetch("/api/verify-doc-export", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user.uid, module: activeTab, format: "word" })
        });
        if (!response.ok) {
          const data = await response.json();
          alert(data.error || "Word document export verification failed.");
          setShowUpgrade(true);
          return;
        }
      } catch (err) {
        console.warn("Backend document validation failed, proceeding with client verification:", err);
      }
    }

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
          const isVdCanvas = id === "voltage-drop-interactive-canvas";

          if (id === "short-circuit-diagram") {
            width = 1050;
            height = 950;
          } else if (isIllumination) {
            width = el.clientWidth || 1000;
            height = el.clientHeight || 550;
          } else if (isVdCanvas) {
            width = el.clientWidth || 1200;
            height = el.clientHeight || 750;
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
      const allPanels = [panel, ...updatedSubPanels.map((sp) => sp.panel)];
      for (const p of allPanels) {
        const id = `sld-${p?.designation || "main"}`;
        sldImages[p?.designation || ""] = await getImg(id);
      }

      const images = {
        systemSLD: await getImg("sld-system-wide"),
        sld: sldImages,
        isc: await getImg("short-circuit-diagram"),
        vdDiagrams: {} as Record<string, string | null>,
        vdInteractiveCanvas: await getImg("voltage-drop-interactive-canvas"),
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
        updatedMdpCircuits,
        updatedSubPanels,
        vdCalculations,
        illumParams,
        images,
        iscParams,
        
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
      <aside 
        className={`${isSidebarCollapsed ? "w-[76px]" : "w-64"} bg-slate-900 dark:bg-slate-950 border-r border-slate-800 flex flex-col justify-between hidden md:flex shrink-0 no-print transition-all duration-300 ease-in-out relative z-30`}
      >
        <div className="flex flex-col h-full overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {/* Logo, Brand & Collapse Toggler */}
          <div className="h-16 flex items-center justify-between px-4 border-b border-slate-800/60 bg-slate-900/40 relative">
            <div className={`flex items-center gap-3 transition-opacity duration-200 ${isSidebarCollapsed ? "mx-auto justify-center" : ""}`}>
              <div className="p-2 bg-gradient-to-tr from-yellow-300 to-amber-500 rounded-xl shadow-md shadow-amber-500/10 shrink-0 transform hover:rotate-12 transition-transform duration-300">
                <Zap className="w-5 h-5 text-slate-950 fill-slate-950" />
              </div>
              {!isSidebarCollapsed && (
                <div className="flex flex-col select-none animate-fade-in">
                  <span className="font-extrabold text-white tracking-tight text-base font-sans drop-shadow-sm">
                    ElectricalPH
                  </span>
                  <p className="text-[10px] text-emerald-400 font-extrabold uppercase tracking-widest -mt-1 font-mono">
                    Engineering Tool
                  </p>
                </div>
              )}
            </div>

            {/* Desktop Collapse Toggler Button */}
            {!isSidebarCollapsed && (
              <div className="flex items-center gap-1">
                {/* Theme Switcher inside header to keep it compact */}
                <button
                  onClick={() => setIsDarkMode(!isDarkMode)}
                  className="p-1.5 hover:bg-slate-800/80 rounded-lg text-slate-400 hover:text-amber-400 transition-colors cursor-pointer"
                  title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
                >
                  {isDarkMode ? (
                    <Sun className="w-4 h-4 text-amber-400" />
                  ) : (
                    <Moon className="w-4 h-4 text-slate-400" />
                  )}
                </button>
                <button
                  onClick={() => setIsSidebarCollapsed(true)}
                  className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                  title="Collapse Sidebar"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* When collapsed, show expand button */}
            {isSidebarCollapsed && (
              <button
                onClick={() => setIsSidebarCollapsed(false)}
                className="absolute -right-3 top-5 bg-slate-850 hover:bg-emerald-600 border border-slate-700 hover:border-emerald-500 text-slate-300 hover:text-white p-1 rounded-full shadow-lg z-50 cursor-pointer transition-all duration-200 hover:scale-110 active:scale-95"
                title="Expand Sidebar"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Navigation Menu */}
          <div className="flex-1 py-4 px-3 space-y-6">
            
            {/* MODULES SECTION */}
            <div>
              <div className="flex items-center justify-between mb-2 px-3">
                {!isSidebarCollapsed ? (
                  <p className="text-xxs font-black text-slate-500 uppercase tracking-widest">
                    MODULES
                  </p>
                ) : (
                  <div className="w-full h-[1px] bg-slate-800/60 my-1"></div>
                )}
              </div>
              
              <div className="space-y-1">
                {[
                  { id: "dashboard", label: "Dashboard", icon: Gauge, requiresPremium: false },
                  { id: "schedule", label: "Load Schedule", icon: Layout, requiresPremium: false },
                  { id: "power-suite", label: "Power Analysis Suite", icon: Zap, requiresPremium: true },
                  { id: "isc", label: "Short Circuit", icon: ShieldAlert, requiresPremium: false },
                  { id: "vd", label: "Voltage Drop", icon: Ruler, requiresPremium: false },
                  { id: "lighting", label: "Illumination", icon: Lightbulb, requiresPremium: false },
                  { id: "system-sld", label: "System SLD", icon: Network, requiresPremium: false },
                  { id: "floor-plan", label: "Floor Plan", icon: Map, requiresPremium: false },
                  { id: "current-calc", label: "PEC Calculator", icon: Calculator, requiresPremium: false },
                  { id: "egc", label: "EGC Sizer", icon: Hammer, requiresPremium: false },
                  { id: "transformer", label: "Transformer Capacity", icon: Cpu, requiresPremium: false }
                ].filter(item => {
                  if (isAdmin) return true;
                  const mod = systemModules.find(m => m.id === item.id);
                  if (!mod) return true;
                  return mod.status !== "hidden";
                }).map((item) => {
                  const isActive = activeTab === item.id;
                  const IconComponent = item.icon;
                  const mod = systemModules.find(m => m.id === item.id);
                  const isMaintenance = !isAdmin && mod?.status === "maintenance";
                  const isDisabled = !isAdmin && mod?.status === "disabled";

                  const handleClick = () => {
                    if (isDisabled) {
                      alert(`Module Disabled\n\nThe ${mod?.name || item.label} module has been disabled by the administrator.`);
                      return;
                    }
                    if (isMaintenance) {
                      alert(`Module Under Maintenance\n\nThe ${mod?.name || item.label} module is currently under maintenance:\n${mod?.maintenanceMessage || "Please try again later."}`);
                      return;
                    }
                    setActiveTab(item.id as any);
                  };

                  return (
                    <div key={item.id} className="relative group">
                      <button
                        onClick={handleClick}
                        className={`w-full flex items-center ${isSidebarCollapsed ? "justify-center px-2 py-3" : "px-3 py-2.5"} rounded-lg text-xs font-bold transition-all relative ${
                          isActive
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-inner"
                            : (isMaintenance || isDisabled)
                              ? "text-slate-500 cursor-not-allowed opacity-50"
                              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 hover:translate-x-0.5"
                        }`}
                      >
                        {/* Active vertical left bar */}
                        {isActive && !isSidebarCollapsed && (
                          <div className="absolute left-0 top-1.5 bottom-1.5 w-[3px] bg-emerald-500 rounded-r" />
                        )}
                        <IconComponent className={`w-4 h-4 shrink-0 ${isActive ? "text-emerald-400" : "text-slate-500 group-hover:text-slate-300"}`} />
                        {!isSidebarCollapsed && (
                          <span className="ml-3 truncate flex items-center justify-between w-full">
                            <span>{item.label}</span>
                            {isMaintenance && <span className="text-[8px] font-black bg-amber-500/10 text-amber-500 border border-amber-500/20 px-1 py-0.2 rounded shrink-0">MAINT</span>}
                            {isDisabled && <span className="text-[8px] font-black bg-rose-500/10 text-rose-500 border border-rose-500/20 px-1 py-0.2 rounded shrink-0">LOCK</span>}
                          </span>
                        )}
                      </button>

                      {/* Tooltip for Collapsed Sidebar */}
                      {isSidebarCollapsed && (
                        <div className="absolute left-16 top-1/2 -translate-y-1/2 ml-2 px-3 py-1.5 bg-slate-950 text-white text-xxs font-black tracking-wider uppercase rounded-md border border-slate-800 shadow-xl opacity-0 scale-90 translate-x-1 group-hover:opacity-100 group-hover:scale-100 group-hover:translate-x-0 pointer-events-none transition-all duration-200 z-50 whitespace-nowrap">
                          {item.label} {isMaintenance && "(Maintenance)"} {isDisabled && "(Disabled)"}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ACCOUNT / ADMIN SECTION */}
            {isAdmin && (
              <div>
                <div className="flex items-center justify-between mb-2 px-3">
                  {!isSidebarCollapsed ? (
                    <p className="text-xxs font-black text-slate-500 uppercase tracking-widest">
                      ACCOUNT / ADMIN
                    </p>
                  ) : (
                    <div className="w-full h-[1px] bg-slate-800/60 my-2"></div>
                  )}
                </div>

                <div className="space-y-1">
                  {[
                    { id: "billing", label: "My Billing", icon: Receipt, restricted: !isAdmin, badge: null },
                    { id: "verify", label: "Verify Users", icon: Users, restricted: !isAdmin, badge: "3" },
                    { id: "verify-registrations", label: "Verify Registrations", icon: ShieldCheck, restricted: !isAdmin, badge: "1" },
                    { id: "module-management", label: "Module Visibility", icon: Settings, restricted: !isAdmin, badge: null }
                  ].map((item) => {
                    const isActive = activeTab === item.id;
                    const IconComponent = item.icon;
                    return (
                      <div key={item.id} className="relative group">
                        <button
                          onClick={() => {
                            if (item.restricted) {
                              alert("Administrator Access Required\n\nThis module contains confidential billing ledgers, verify queues, and user registration directories. Access is restricted to angeloperfecto31@gmail.com.");
                              return;
                            }
                            setActiveTab(item.id as any);
                          }}
                          className={`w-full flex items-center ${isSidebarCollapsed ? "justify-center px-2 py-3" : "px-3 py-2.5"} rounded-lg text-xs font-bold transition-all relative ${
                            isActive
                              ? "bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-inner"
                              : item.restricted
                                ? "text-slate-500/60 opacity-50 cursor-not-allowed hover:bg-transparent"
                                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 hover:translate-x-0.5"
                          }`}
                          disabled={false}
                        >
                          {/* Active vertical left bar */}
                          {isActive && !isSidebarCollapsed && (
                            <div className="absolute left-0 top-1.5 bottom-1.5 w-[3px] bg-amber-500 rounded-r" />
                          )}
                          <span className="relative">
                            <IconComponent className={`w-4 h-4 shrink-0 ${isActive ? "text-amber-400" : "text-slate-500 group-hover:text-slate-300"}`} />
                            
                            {/* Miniature Red Notification badge on icon when collapsed */}
                            {item.badge && isSidebarCollapsed && (
                              <span className="absolute -top-1.5 -right-1.5 w-2.5 h-2.5 bg-rose-500 border border-slate-900 rounded-full animate-ping" />
                            )}
                          </span>
                          
                          {!isSidebarCollapsed && (
                            <>
                              <span className="ml-3 truncate">{item.label}</span>
                              {/* Restricted Lock Icon */}
                              {item.restricted && (
                                <Lock className="w-3 h-3 text-slate-600 ml-auto shrink-0" />
                              )}
                              
                              {/* Custom Notification Badge */}
                              {item.badge && !item.restricted && (
                                <span className={`ml-auto text-[9px] px-1.5 py-0.5 rounded-full font-sans font-extrabold shadow-sm ${
                                  item.badge === "3" ? "bg-rose-500/20 text-rose-450 border border-rose-500/30 font-mono animate-pulse" : "bg-amber-550/20 text-amber-400 border border-amber-500/30"
                                }`}>
                                  {item.badge}
                                </span>
                              )}
                            </>
                          )}
                        </button>

                        {/* Tooltip for Collapsed Sidebar */}
                        {isSidebarCollapsed && (
                          <div className="absolute left-16 top-1/2 -translate-y-1/2 ml-2 px-3 py-1.5 bg-slate-950 text-white text-xxs font-black tracking-wider uppercase rounded-md border border-slate-800 shadow-xl opacity-0 scale-90 translate-x-1 group-hover:opacity-100 group-hover:scale-100 group-hover:translate-x-0 pointer-events-none transition-all duration-200 z-50 whitespace-nowrap flex items-center gap-1.5">
                            {item.label}
                            {item.restricted && <Lock className="w-2.5 h-2.5 text-slate-500" />}
                            {item.badge && <span className="bg-rose-500 text-white text-[8px] px-1 rounded font-sans font-extrabold">{item.badge}</span>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

          </div>
        </div>

        {/* Bottom Actions, Upgrade, and Profile Card */}
        <div className="p-3 border-t border-slate-800/60 bg-slate-950/60 space-y-3 shrink-0">
          
          {/* Active Subscription Countdown Card */}
          {!isSidebarCollapsed && isActive && expiresAt && (userPlan === "basic" || userPlan === "premium" || userPlan === "free") && (
            <div className="bg-slate-900/80 border border-slate-800/80 rounded-xl p-3 space-y-2.5 shadow-md">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                    {userPlan === "free" ? "Free Trial" : "SUBSCRIPTION"}
                  </span>
                </div>
                <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full border ${
                  userPlan === "premium" 
                    ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" 
                    : userPlan === "basic"
                      ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/20"
                      : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                }`}>
                  {userPlan === "free" ? "Trial" : userPlan}
                </span>
              </div>
              
              {(() => {
                const daysLeft = countdownTime ? countdownTime.days : Math.ceil((new Date(expiresAt).getTime() - new Date().getTime()) / (1000 * 3600 * 24));
                const percent = Math.min(100, Math.max(0, (daysLeft / 30) * 100));
                return (
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-end">
                      <span className="text-base font-black text-white font-mono tracking-tight leading-none">
                        {countdownTime ? (
                          <span className="flex items-center gap-0.5 text-xs">
                            <span className="text-white font-bold">{countdownTime.days}d</span>
                            <span className="text-slate-600 font-normal">:</span>
                            <span className="text-indigo-300 font-bold">{String(countdownTime.hours).padStart(2, "0")}h</span>
                            <span className="text-slate-600 font-normal">:</span>
                            <span className="text-indigo-300 font-bold">{String(countdownTime.minutes).padStart(2, "0")}m</span>
                            <span className="text-slate-600 font-normal">:</span>
                            <span className="text-rose-450 font-bold">{String(countdownTime.seconds).padStart(2, "0")}s</span>
                          </span>
                        ) : (
                          <span>{Math.max(0, daysLeft)} <span className="text-[10px] text-slate-400 font-normal">Days Left</span></span>
                        )}
                      </span>
                      <span className="text-[9px] font-bold text-slate-500 font-mono">
                        {Math.round(percent)}%
                      </span>
                    </div>
                    
                    {/* Custom progress bar */}
                    <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800/30">
                      <div 
                        className={`h-full transition-all duration-500 rounded-full ${
                          daysLeft <= 3 
                            ? "bg-gradient-to-r from-rose-500 to-red-500 animate-pulse" 
                            : daysLeft <= 7
                              ? "bg-gradient-to-r from-amber-500 to-orange-500"
                              : "bg-gradient-to-r from-emerald-500 to-teal-500"
                        }`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    
                    <div className="flex items-center justify-between text-[9px] text-slate-500 pt-0.5">
                      <span>30-Day Cycle</span>
                      <button 
                        onClick={() => {
                          if (userPlan === "free") {
                            setShowUpgrade(true);
                          } else {
                            setShowRenew(true);
                          }
                        }}
                        className="font-black text-indigo-400 hover:text-indigo-300 hover:underline transition-colors cursor-pointer"
                      >
                        {userPlan === "free" ? "Upgrade Plan" : "Renew Plan"}
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Action CTAs Area */}
          <div className="space-y-1.5">
            {/* Upgrade to Premium */}
            {(userPlan !== "premium" && userPlan !== "enterprise" || isAdmin) && (
              <div className="relative group">
                <button
                  onClick={() => setShowUpgrade(true)}
                  className={`w-full flex items-center justify-center gap-2 h-10 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 hover:from-amber-400 hover:via-orange-400 hover:to-rose-400 text-white font-extrabold uppercase tracking-wider text-[10px] transition-all duration-200 shadow-lg shadow-amber-500/10 hover:shadow-orange-500/20 active:scale-98 border border-amber-300/30 ${isSidebarCollapsed ? "p-0" : "px-3"}`}
                  title="Unlock Exporting Word & DXF CAD Blocks"
                >
                  <Zap className="w-3.5 h-3.5 fill-white animate-pulse shrink-0" />
                  {!isSidebarCollapsed && <span>Premium {isAdmin && "(Admin Test)"}</span>}
                </button>
                {isSidebarCollapsed && (
                  <div className="absolute left-16 top-1/2 -translate-y-1/2 ml-2 px-3 py-1.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xxs font-black tracking-wider uppercase rounded-md shadow-xl opacity-0 scale-90 translate-x-1 group-hover:opacity-100 group-hover:scale-100 group-hover:translate-x-0 pointer-events-none transition-all duration-200 z-50 whitespace-nowrap">
                    Upgrade to Premium
                  </div>
                )}
              </div>
            )}

            {/* Standardized Actions Grid or Stack */}
            {[
              { label: "Manage Projects", icon: FolderOpen, onClick: () => setIsProjectManagerOpen(true), priority: "secondary" },
              { 
                label: userPlan !== "premium" && userPlan !== "enterprise" && !isAdmin ? "Report (Premium)" : "Generate Report", 
                icon: FileText, 
                onClick: () => {
                  if (userPlan === "premium" || userPlan === "enterprise" || isAdmin) {
                    handleExportWord();
                  } else {
                    alert("Word and PDF document exports are available exclusively with the Premium Plan. Upgrade your subscription to unlock professional document generation.");
                    setShowUpgrade(true);
                  }
                }, 
                priority: "primary", 
                title: userPlan !== "premium" && userPlan !== "enterprise" && !isAdmin ? "Available on Premium Plan" : "Generate Custom Word Document Summary",
                isLocked: userPlan !== "premium" && userPlan !== "enterprise" && !isAdmin
              },
              { 
                label: (userPlan !== "premium" && userPlan !== "enterprise" && !isAdmin && activeTab !== "schedule") ? "Excel Export (Premium)" : "Export to Excel",
                icon: FileSpreadsheet,
                onClick: async () => {
                  if (userPlan === "premium" || userPlan === "enterprise" || isAdmin || activeTab === "schedule") {
                    if (user?.uid) {
                      try {
                        const response = await fetch("/api/verify-excel-export", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ userId: user.uid, module: activeTab })
                        });
                        if (!response.ok) {
                          const data = await response.json();
                          alert(data.error || "Excel export verification failed.");
                          setShowUpgrade(true);
                          return;
                        }
                      } catch (err) {
                        console.warn("Backend excel validation failed, proceeding with client verification:", err);
                      }
                    }
                    exportToExcel();
                  } else {
                    alert("Excel export for this module is available exclusively in the Premium Plan. Upgrade your subscription to unlock full Excel export functionality.");
                    setShowUpgrade(true);
                  }
                },
                priority: "secondary",
                title: (userPlan !== "premium" && userPlan !== "enterprise" && !isAdmin && activeTab !== "schedule") ? "Available on Premium Plan" : "Export current module details to Excel",
                isLocked: (userPlan !== "premium" && userPlan !== "enterprise" && !isAdmin && activeTab !== "schedule")
              },
              { 
                label: userPlan !== "premium" && userPlan !== "enterprise" && !isAdmin ? "CAD Export (Premium)" : "Export AutoCAD Drawing", 
                icon: Layers, 
                onClick: () => {
                  if (userPlan === "premium" || userPlan === "enterprise" || isAdmin) {
                    const { updatedMdpCircuits, updatedSubPanels } = syncHierarchyData(panel, circuits, subPanels, vdCalculations);
                    exportToCAD(panel, updatedMdpCircuits, updatedSubPanels, iscParams, "ALL", vdCalculations, illumParams);
                  } else {
                    setShowUpgrade(true);
                  }
                }, 
                priority: "secondary",
                title: "Complete Load Schedule and calculations directly to AutoCAD schema blocks",
                isLocked: userPlan !== "premium" && userPlan !== "enterprise" && !isAdmin
              }
            ].map((btn, index) => {
              const isPri = btn.priority === "primary";
              const isLck = (btn as any).isLocked;
              return (
                <div key={index} className="relative group">
                  <button
                    onClick={btn.onClick}
                    title={btn.title || btn.label}
                    className={`w-full flex items-center justify-center gap-2 h-9 rounded-lg font-extrabold text-[10px] uppercase tracking-wider transition-all duration-200 active:scale-98 border ${
                      isLck
                        ? "bg-slate-900/40 text-slate-500 hover:text-slate-400 border-slate-800/80 cursor-pointer"
                        : isPri 
                          ? "bg-indigo-600 hover:bg-indigo-500 hover:shadow-indigo-500/10 text-white border-indigo-500/40" 
                          : "bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white border-slate-700/60"
                    } ${isSidebarCollapsed ? "p-0" : "px-3"}`}
                  >
                    <btn.icon className={`w-3.5 h-3.5 shrink-0 ${isLck ? "text-slate-600" : isPri ? "text-indigo-200" : "text-slate-400 group-hover:text-slate-200"}`} />
                    {!isSidebarCollapsed && <span className="truncate">{btn.label}</span>}
                    {isLck && <Lock className="w-3 h-3 text-amber-500 shrink-0 ml-0.5" />}
                  </button>
                  {isSidebarCollapsed && (
                    <div className="absolute left-16 top-1/2 -translate-y-1/2 ml-2 px-3 py-1.5 bg-slate-950 text-white text-xxs font-black tracking-wider uppercase rounded-md border border-slate-800 shadow-xl opacity-0 scale-90 translate-x-1 group-hover:opacity-100 group-hover:scale-100 group-hover:translate-x-0 pointer-events-none transition-all duration-200 z-50 whitespace-nowrap">
                      {btn.label}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Fully Redesigned User Profile Card */}
          <div className="pt-2 border-t border-slate-800/80 relative">
            {user ? (
              <div className="relative">
                <button
                  onClick={() => setIsProfileDropdownOpen(!isProfileDropdownOpen)}
                  className={`w-full flex items-center gap-2.5 p-2 rounded-xl bg-slate-900/60 hover:bg-slate-900 border border-slate-800/60 hover:border-slate-750 transition-all text-left group/profile cursor-pointer ${isSidebarCollapsed ? "justify-center p-1.5" : ""}`}
                >
                  <div className="relative shrink-0 select-none">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-600 flex items-center justify-center text-white font-black text-sm shadow-md ring-2 ring-emerald-500/20">
                      {user.photoURL ? (
                        <img 
                          src={user.photoURL} 
                          alt="Avatar" 
                          className="w-full h-full rounded-xl object-cover" 
                          referrerPolicy="no-referrer" 
                        />
                      ) : (
                        user.displayName ? user.displayName.charAt(0).toUpperCase() : (user.email?.charAt(0).toUpperCase() || "?")
                      )}
                    </div>
                    {/* Active online dot */}
                    <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 border-2 border-slate-900 rounded-full" />
                  </div>

                  {!isSidebarCollapsed && (
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-black text-slate-200 truncate group-hover/profile:text-emerald-400 transition-colors">
                          {user.displayName || "Authorized User"}
                        </span>
                      </div>
                      <span className="text-[9px] font-medium text-slate-500 truncate block mt-0.5">
                        {user.email}
                      </span>
                      <div className="flex items-center gap-1 mt-1 flex-wrap">
                        {/* Subscription indicator bubble */}
                        <span className={`inline-block text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full ${
                          isAdmin 
                            ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" 
                            : userPlan === "enterprise"
                              ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                              : userPlan === "premium"
                                ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20" 
                                : userPlan === "basic"
                                  ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                                  : "bg-slate-800 text-slate-400 border border-slate-700/50"
                        }`}>
                          {isAdmin ? "Admin Engine" : userPlan === "enterprise" ? "Enterprise (Lifetime)" : userPlan === "premium" ? "Premium Access" : userPlan === "basic" ? "Basic Access" : "Free Member"}
                        </span>
                        
                        {/* Remaining Days indicator */}
                        {(userPlan === "basic" || userPlan === "premium" || userPlan === "free") && expiresAt && (
                          <span className={`inline-block text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full border ${
                            Math.ceil((new Date(expiresAt).getTime() - new Date().getTime()) / (1000 * 3600 * 24)) <= 3 
                              ? "bg-rose-500/10 text-rose-400 border-rose-500/20 animate-pulse" 
                              : Math.ceil((new Date(expiresAt).getTime() - new Date().getTime()) / (1000 * 3600 * 24)) <= 7
                                ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          }`}>
                            {Math.max(0, Math.ceil((new Date(expiresAt).getTime() - new Date().getTime()) / (1000 * 3600 * 24)))} Days Left
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </button>

                {/* Profile Quick-Access Dropdown Panel (Absolute Popover) */}
                {isProfileDropdownOpen && (
                  <div className={`absolute bottom-14 ${isSidebarCollapsed ? "left-14" : "left-0 right-0"} w-56 bg-slate-950 border border-slate-850 rounded-xl shadow-2xl p-1.5 z-50 animate-fade-in`}>
                    <div className="px-3 py-2 border-b border-slate-850/60 pb-2 mb-1.5">
                      <p className="text-[10px] font-black tracking-widest text-slate-500 uppercase">QUICK METERS</p>
                      <p className="text-xs font-extrabold text-slate-200 mt-0.5 truncate">{user.displayName || "User Profile"}</p>
                      
                      {(userPlan === "basic" || userPlan === "premium" || userPlan === "free") && expiresAt && (
                        <div className="mt-2 bg-slate-900 rounded-lg p-2 border border-slate-800">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Time Remaining</span>
                            <span className={`text-[10px] font-black ${
                              Math.ceil((new Date(expiresAt).getTime() - new Date().getTime()) / (1000 * 3600 * 24)) <= 3 
                                ? "text-rose-400" 
                                : Math.ceil((new Date(expiresAt).getTime() - new Date().getTime()) / (1000 * 3600 * 24)) <= 7
                                  ? "text-amber-400"
                                  : "text-emerald-400"
                            }`}>
                              {Math.max(0, Math.ceil((new Date(expiresAt).getTime() - new Date().getTime()) / (1000 * 3600 * 24)))} Days
                            </span>
                          </div>
                          <div className="w-full bg-slate-800 rounded-full h-1.5 mt-1 overflow-hidden">
                            <div className={`h-1.5 rounded-full ${
                              Math.ceil((new Date(expiresAt).getTime() - new Date().getTime()) / (1000 * 3600 * 24)) <= 3 
                                ? "bg-rose-500" 
                                : Math.ceil((new Date(expiresAt).getTime() - new Date().getTime()) / (1000 * 3600 * 24)) <= 7
                                  ? "bg-amber-500"
                                  : "bg-emerald-500"
                            }`} style={{ width: `${Math.min(100, Math.max(0, (Math.ceil((new Date(expiresAt).getTime() - new Date().getTime()) / (1000 * 3600 * 24)) / 30) * 100))}%` }}></div>
                          </div>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => {
                        setIsProfileDropdownOpen(false);
                        setIsProfileSettingsOpen(true);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-900 rounded-lg cursor-pointer transition-colors"
                    >
                      <Settings className="w-3.5 h-3.5 text-slate-400" />
                      <span>Profile Settings</span>
                    </button>

                    <button
                      onClick={() => {
                        setIsProfileDropdownOpen(false);
                        setIsAccountSettingsOpen(true);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-900 rounded-lg cursor-pointer transition-colors"
                    >
                      <Cpu className="w-3.5 h-3.5 text-slate-400" />
                      <span>Account Settings</span>
                    </button>

                    <div className="h-[1px] bg-slate-850/60 my-1"></div>

                    <button
                      onClick={async () => {
                        setIsProfileDropdownOpen(false);
                        try {
                          await signOut(auth);
                        } catch (err) {
                          console.error(err);
                        }
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs font-extrabold text-rose-450 hover:text-white hover:bg-rose-550/10 rounded-lg cursor-pointer transition-colors"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => setShowUpgrade(true)}
                className={`w-full h-10 flex items-center justify-center gap-2 bg-slate-900/60 hover:bg-slate-900 text-slate-300 hover:text-white rounded-xl border border-slate-850/60 active:scale-98 transition-all font-bold text-xs ${isSidebarCollapsed ? "p-0" : "px-3"}`}
              >
                <Users className="w-4 h-4 text-slate-400 shrink-0" />
                {!isSidebarCollapsed && <span>Sign in / Sign up</span>}
              </button>
            )}
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
            {isActive && countdownTime && (userPlan === "basic" || userPlan === "premium" || userPlan === "free") && (
              <div 
                onClick={() => {
                  if (userPlan === "free") {
                    setShowUpgrade(true);
                  } else {
                    setShowRenew(true);
                  }
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black font-mono border cursor-pointer select-none transition-all mr-1.5 ${
                  countdownTime.days <= 3 
                    ? "bg-rose-500/10 text-rose-650 dark:text-rose-400 border-rose-500/25 animate-pulse" 
                    : countdownTime.days <= 7
                      ? "bg-amber-500/10 text-amber-650 dark:text-amber-400 border-amber-500/25"
                      : "bg-emerald-500/10 text-emerald-650 dark:text-emerald-400 border-emerald-500/25"
                }`}
                title={`${userPlan === "free" ? "Trial" : "Subscription"} expires on ${expiresAt ? new Date(expiresAt).toLocaleString() : ""}`}
              >
                <Clock className="w-3 h-3" />
                <span>
                  {countdownTime.days > 0 ? `${countdownTime.days}d ` : ""}
                  {String(countdownTime.hours).padStart(2, "0")}:
                  {String(countdownTime.minutes).padStart(2, "0")}:
                  {String(countdownTime.seconds).padStart(2, "0")}
                </span>
              </div>
            )}

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

        {/* Desktop Navbar / Top Bar */}
        <header className="hidden md:flex h-14 bg-white dark:bg-slate-900 border-b border-slate-200/80 dark:border-slate-800/80 items-center justify-between px-6 shrink-0 z-20 shadow-sm no-print">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest font-mono">
              SYSTEM STATION
            </span>
            <span className="text-slate-350 dark:text-slate-700 font-normal">•</span>
            <span className="text-[10px] font-black text-slate-700 dark:text-slate-200 uppercase tracking-widest bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-md">
              {tabs.find(t => t.id === activeTab)?.label || "Dashboard"}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {isActive && countdownTime && (userPlan === "basic" || userPlan === "premium" || userPlan === "free") && (
              <div 
                onClick={() => {
                  if (userPlan === "free") {
                    setShowUpgrade(true);
                  } else {
                    setShowRenew(true);
                  }
                }}
                className={`flex items-center gap-2 px-3.5 py-1 rounded-full text-xs font-black font-mono border cursor-pointer select-none transition-all hover:scale-102 ${
                  countdownTime.days <= 3 
                    ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30 shadow-sm shadow-rose-500/5 animate-pulse" 
                    : countdownTime.days <= 7
                      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 shadow-sm"
                      : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 shadow-sm"
                }`}
                title={`${userPlan === "free" ? "Trial" : "Subscription"} expires on ${expiresAt ? new Date(expiresAt).toLocaleString() : ""}`}
              >
                <Clock className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
                <span className="text-slate-500 dark:text-slate-400 font-bold tracking-normal mr-0.5">
                  {userPlan === "free" ? "Trial Time Left:" : "Access Time Left:"}
                </span>
                <span className="tracking-tight text-slate-900 dark:text-white">
                  {countdownTime.days > 0 ? `${countdownTime.days}d ` : ""}
                  {String(countdownTime.hours).padStart(2, "0")}:
                  {String(countdownTime.minutes).padStart(2, "0")}:
                  {String(countdownTime.seconds).padStart(2, "0")}
                </span>
              </div>
            )}

            {/* Desktop Theme Toggle */}
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
              title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
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
          {tabs.filter(tab => {
            if (isAdmin) return true;
            const mod = systemModules.find(m => m.id === tab.id);
            if (!mod) return true;
            return mod.status !== "hidden";
          }).map((tab) => {
            const mod = systemModules.find(m => m.id === tab.id);
            const isMaintenance = !isAdmin && mod?.status === "maintenance";
            const isDisabled = !isAdmin && mod?.status === "disabled";

            const handleClick = () => {
              if (isDisabled) {
                alert(`Module Disabled\n\nThe ${mod?.name || tab.label} module has been disabled by the administrator.`);
                return;
              }
              if (isMaintenance) {
                alert(`Module Under Maintenance\n\nThe ${mod?.name || tab.label} module is currently under maintenance:\n${mod?.maintenanceMessage || "Please try again later."}`);
                return;
              }
              setActiveTab(tab.id as any);
            };

            return (
              <button
                key={tab.id}
                onClick={handleClick}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                  activeTab === tab.id
                    ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 shadow-sm"
                    : (isMaintenance || isDisabled)
                      ? "bg-slate-100 dark:bg-slate-800 text-slate-400 opacity-50 cursor-not-allowed border border-slate-200/20"
                      : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/50 dark:border-slate-700"
                }`}
              >
                {tab.label} {isMaintenance && "⚠"} {isDisabled && "🔒"}
              </button>
            );
          })}
        </div>

        {/* Scrollable Content Area */}
        <main
          id="print-area"
          className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:p-8 w-full"
        >
          <div className="max-w-[1400px] w-full mx-auto flex flex-col gap-8 pb-32">
            
            {/* Expiration Notification Banner */}
            {(() => {
              if (isActive && expiresAt && (userPlan === "basic" || userPlan === "premium" || userPlan === "free")) {
                const daysLeft = countdownTime ? countdownTime.days : Math.ceil((new Date(expiresAt).getTime() - new Date().getTime()) / (1000 * 3600 * 24));
                const percent = Math.min(100, Math.max(0, (daysLeft / 30) * 100));
                const planName = userPlan === "free" ? "Free Trial" : userPlan === "basic" ? "Basic" : "Premium";
                const isTrial = userPlan === "free";
                
                if (daysLeft <= 0) {
                  return (
                    <div className="w-full p-4 rounded-2xl flex items-center justify-between border shadow-sm bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/30">
                      <div className="flex items-center gap-3">
                        <AlertTriangle className="w-5 h-5 text-rose-600 animate-pulse" />
                        <div>
                          <p className="text-sm font-bold text-rose-800 dark:text-rose-200">
                            Your {planName} {isTrial ? "has ended" : "has expired"}!
                          </p>
                          <p className="text-xs text-rose-600 dark:text-rose-400">
                            {isTrial ? "Upgrade to a premium plan to continue using professional electrical calculation engines." : "Renew your subscription to regain access to premium features and exports."}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => isTrial ? setShowUpgrade(true) : setShowRenew(true)}
                        className="px-4 py-2 rounded-xl text-xs font-bold transition-colors bg-rose-600 hover:bg-rose-500 text-white cursor-pointer"
                      >
                        {isTrial ? "Upgrade Now" : "Renew Plan"}
                      </button>
                    </div>
                  );
                } else if (daysLeft <= 3) {
                  return (
                    <div className="w-full p-4 rounded-2xl flex items-center justify-between border shadow-sm bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/30">
                      <div className="flex items-center gap-3">
                        <AlertTriangle className="w-5 h-5 text-rose-600 animate-pulse animate-bounce" />
                        <div>
                          <p className="text-sm font-bold text-rose-800 dark:text-rose-200">
                            Your {planName} {isTrial ? "ends" : "expires"} in {daysLeft} day{daysLeft > 1 ? "s" : ""}!
                          </p>
                          <p className="text-xs text-rose-600 dark:text-rose-400">
                            Critical countdown: {isTrial ? "Upgrade to a premium plan to avoid losing workspace access." : "Renew immediately to avoid interruption."}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="hidden sm:flex flex-col items-end text-right font-mono">
                          <span className="text-xxs text-rose-400 font-bold uppercase">Time Remaining</span>
                          {countdownTime ? (
                            <span className="text-sm font-black text-rose-600 dark:text-rose-450 flex items-center gap-1">
                              <span>{countdownTime.days}d</span>
                              <span className="animate-pulse">:</span>
                              <span>{String(countdownTime.hours).padStart(2, "0")}h</span>
                              <span className="animate-pulse">:</span>
                              <span>{String(countdownTime.minutes).padStart(2, "0")}m</span>
                              <span className="animate-pulse">:</span>
                              <span>{String(countdownTime.seconds).padStart(2, "0")}s</span>
                            </span>
                          ) : (
                            <span className="text-sm font-bold text-rose-600 dark:text-rose-400">{daysLeft}d / 30d</span>
                          )}
                        </div>
                        <button
                          onClick={() => isTrial ? setShowUpgrade(true) : setShowRenew(true)}
                          className="px-4 py-2 rounded-xl text-xs font-bold transition-colors bg-rose-600 hover:bg-rose-500 text-white cursor-pointer"
                        >
                          {isTrial ? "Upgrade Now" : "Renew Plan"}
                        </button>
                      </div>
                    </div>
                  );
                } else if (daysLeft <= 7) {
                  return (
                    <div className="w-full p-4 rounded-2xl flex items-center justify-between border shadow-sm bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/30">
                      <div className="flex items-center gap-3">
                        <AlertTriangle className="w-5 h-5 text-amber-600" />
                        <div>
                          <p className="text-sm font-bold text-amber-800 dark:text-amber-200">
                            Your {planName} {isTrial ? "ends" : "expires"} in {daysLeft} day{daysLeft > 1 ? "s" : ""}!
                          </p>
                          <p className="text-xs text-amber-600 dark:text-amber-400">
                            {isTrial ? "Upgrade now to keep uninterrupted access to your professional suite." : "Renew now to keep uninterrupted access to your engineering tools."}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="hidden sm:flex flex-col items-end text-right font-mono">
                          <span className="text-xxs text-amber-400 font-bold uppercase">Time Remaining</span>
                          {countdownTime ? (
                            <span className="text-sm font-black text-amber-600 dark:text-amber-400 flex items-center gap-1">
                              <span>{countdownTime.days}d</span>
                              <span className="animate-pulse">:</span>
                              <span>{String(countdownTime.hours).padStart(2, "0")}h</span>
                              <span className="animate-pulse">:</span>
                              <span>{String(countdownTime.minutes).padStart(2, "0")}m</span>
                              <span className="animate-pulse">:</span>
                              <span>{String(countdownTime.seconds).padStart(2, "0")}s</span>
                            </span>
                          ) : (
                            <span className="text-sm font-bold text-amber-600 dark:text-amber-400">{daysLeft}d / 30d</span>
                          )}
                        </div>
                        <button
                          onClick={() => isTrial ? setShowUpgrade(true) : setShowRenew(true)}
                          className="px-4 py-2 rounded-xl text-xs font-bold transition-colors bg-amber-500 hover:bg-amber-400 text-slate-900 cursor-pointer"
                        >
                          {isTrial ? "Upgrade Now" : "Renew Plan"}
                        </button>
                      </div>
                    </div>
                  );
                } else {
                  return (
                    <div className="w-full p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between border shadow-sm bg-white dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800/80 gap-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 shrink-0">
                          <Zap className="w-5 h-5 fill-emerald-500 text-emerald-500" />
                        </div>
                        <div className="space-y-0.5 animate-fade-in">
                          <p className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                            Active {planName} {isTrial ? "Trial" : "Plan"}
                            <span className="text-[10px] bg-emerald-500/10 text-emerald-500 px-2.5 py-0.5 rounded-full font-black uppercase border border-emerald-500/20">
                              Active
                            </span>
                          </p>
                          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                            {countdownTime ? (
                              <span className="flex items-center gap-1">
                                <span>{isTrial ? "Remaining Trial Access Time:" : "Remaining Access Time:"}</span>
                                <strong className="font-mono text-emerald-600 dark:text-emerald-450 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded flex items-center gap-0.5 text-xxs">
                                  <span>{countdownTime.days}d</span>
                                  <span className="animate-pulse">:</span>
                                  <span>{String(countdownTime.hours).padStart(2, "0")}h</span>
                                  <span className="animate-pulse">:</span>
                                  <span>{String(countdownTime.minutes).padStart(2, "0")}m</span>
                                  <span className="animate-pulse">:</span>
                                  <span>{String(countdownTime.seconds).padStart(2, "0")}s</span>
                                </strong>
                              </span>
                            ) : (
                              <span>You have <strong>{daysLeft} days left</strong> in your current cycle.</span>
                            )}
                            <span className="text-slate-300 dark:text-slate-700">•</span>
                            <span className="font-mono text-[10px]">{isTrial ? "Trial Ends:" : "Expires:"} {new Date(expiresAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-4 w-full sm:w-auto max-w-xs shrink-0 self-end sm:self-center">
                        {/* Countdown progress bar */}
                        <div className="flex-1 space-y-1 min-w-[120px]">
                          <div className="flex justify-between text-[10px] font-bold text-slate-400 dark:text-slate-500 font-mono">
                            <span>{isTrial ? "TRIAL DAYS REMAINING" : "DAYS REMAINING"}</span>
                            {countdownTime ? (
                              <span>{countdownTime.days}d {String(countdownTime.hours).padStart(2, "0")}h</span>
                            ) : (
                              <span>{daysLeft}d / 30d</span>
                            )}
                          </div>
                          <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800/80 rounded-full overflow-hidden border border-slate-200/30 dark:border-slate-750">
                            <div 
                              className={`h-full rounded-full transition-all duration-500 ${
                                isTrial ? "bg-gradient-to-r from-amber-500 to-yellow-500" : "bg-gradient-to-r from-emerald-500 to-teal-500"
                              }`}
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                        </div>

                        <button
                          onClick={() => isTrial ? setShowUpgrade(true) : setShowRenew(true)}
                          className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all duration-200 shadow-sm whitespace-nowrap cursor-pointer active:scale-98 ${
                            isTrial 
                              ? "bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 text-slate-950" 
                              : "bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900"
                          }`}
                        >
                          {isTrial ? "Upgrade Now" : "Renew Plan"}
                        </button>
                      </div>
                    </div>
                  );
                }
              }
              return null;
            })()}

            {isMaintenanceMode && (
              <div className="w-full flex flex-col items-center justify-center min-h-[50vh] text-center space-y-6">
                <div className="bg-yellow-50 p-6 rounded-full inline-block mb-4">
                  <AlertTriangle className="w-16 h-16 text-yellow-600" />
                </div>
                <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight">Module Under Maintenance</h1>
                <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                  {activeModuleStatus?.maintenanceMessage || "This module is currently down for scheduled maintenance and upgrades. We apologize for the inconvenience. For urgent inquiries, please contact your system administrator."}
                </p>
                {activeModuleStatus?.expectedCompletion && (
                  <div className="bg-white border border-gray-200 shadow-sm rounded-lg px-6 py-4 flex items-center space-x-3 mt-4">
                    <CheckCircle2 className="w-5 h-5 text-indigo-500" />
                    <span className="text-gray-700 font-medium">
                      Expected Completion: <span className="text-gray-900 font-bold">{activeModuleStatus.expectedCompletion}</span>
                    </span>
                  </div>
                )}
                <div className="mt-8">
                  <button 
                    onClick={() => setActiveTab("dashboard")} 
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-xl shadow-lg transition-all font-medium"
                  >
                    Return to Dashboard
                  </button>
                </div>
              </div>
            )}

            <div className={isMaintenanceMode ? "hidden" : "w-full"}>
              {/* Module Management Tab */}
              <div className={activeTab === "module-management" && isAdmin ? "w-full" : "hidden"}>
                <ModuleManagement adminEmail={user?.email || undefined} />
              </div>

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
                    {getModuleStatus("schedule") !== "hidden" && (
                      <div className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group relative overflow-hidden ${
                        getModuleStatus("schedule") !== "active" ? "opacity-60" : ""
                      }`}>
                        {getModuleStatus("schedule") !== "active" && (
                          <div className="absolute inset-0 bg-slate-950/5 dark:bg-slate-950/25 backdrop-blur-[1px] flex flex-col items-center justify-center p-4 text-center z-10 select-none pointer-events-none">
                            <div className="bg-slate-900/90 border border-slate-800 text-white rounded-lg px-2.5 py-1 text-[10px] font-black flex items-center gap-1.5 shadow-md">
                              {getModuleStatus("schedule") === "disabled" ? (
                                <><Lock className="w-3 h-3 text-rose-500" /> LOCKED</>
                              ) : (
                                <><AlertTriangle className="w-3 h-3 text-amber-500 animate-pulse" /> MAINTENANCE</>
                              )}
                            </div>
                          </div>
                        )}
                        <div className="flex items-start justify-between">
                          <div className="space-y-1">
                            <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block">
                              CONNECTED CAPACITY
                            </span>
                            <h3 className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight font-mono">
                              {getModuleStatus("schedule") === "active" ? (
                                `${(circuits.reduce((sum, c) => sum + (c.loadVA || 0), 0) / 1000).toFixed(2)} kVA`
                              ) : "---"}
                            </h3>
                          </div>
                          <div className="p-3 bg-indigo-50 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-sm">
                            <Layout className="w-5 h-5" />
                          </div>
                        </div>

                        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                          <span className="font-bold text-slate-700 dark:text-slate-300">
                            {getModuleStatus("schedule") === "active" ? `${circuits.length} Registered Loops` : "No Active Telemetry"}
                          </span>
                          {getModuleStatus("schedule") === "active" && (
                            <button
                              onClick={() => setActiveTab("schedule")}
                              className="text-indigo-600 dark:text-indigo-400 font-extrabold hover:underline flex items-center gap-1 relative z-20"
                            >
                              Configure <ArrowUpRight className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Short Circuit Fault Adequacy */}
                    {getModuleStatus("isc") !== "hidden" && (() => {
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
                        <div className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group relative overflow-hidden ${
                          getModuleStatus("isc") !== "active" ? "opacity-60" : ""
                        }`}>
                          {getModuleStatus("isc") !== "active" && (
                            <div className="absolute inset-0 bg-slate-950/5 dark:bg-slate-950/25 backdrop-blur-[1px] flex flex-col items-center justify-center p-4 text-center z-10 select-none pointer-events-none">
                              <div className="bg-slate-900/90 border border-slate-800 text-white rounded-lg px-2.5 py-1 text-[10px] font-black flex items-center gap-1.5 shadow-md">
                                {getModuleStatus("isc") === "disabled" ? (
                                  <><Lock className="w-3 h-3 text-rose-500" /> LOCKED</>
                                ) : (
                                  <><AlertTriangle className="w-3 h-3 text-amber-500 animate-pulse" /> MAINTENANCE</>
                                )}
                              </div>
                            </div>
                          )}
                          <div className="flex items-start justify-between">
                            <div className="space-y-1">
                              <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block">
                                CALCULATED ISC
                              </span>
                              <h3 className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight font-mono">
                                {getModuleStatus("isc") === "active" ? `${iscKAIC.toFixed(2)} kA` : "---"}
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
                              {getModuleStatus("isc") === "active" ? `${scStatus} Limit (${panelLimitKAIC}kA pf)` : "No Active Audit"}
                            </span>
                            {getModuleStatus("isc") === "active" && (
                              <button
                                onClick={() => setActiveTab("isc")}
                                className="text-indigo-600 dark:text-indigo-400 font-extrabold hover:underline flex items-center gap-1 relative z-20"
                              >
                                Audit <ArrowUpRight className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Voltage Drop Audit */}
                    {getModuleStatus("vd") !== "hidden" && (() => {
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
                        const isSubPanelFeeder = uniqueSubPanels.some(sp => sp.id === vd.source) || uniqueSubPanels.some(ssp => ssp.id === vd.source);
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
                        <div className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group relative overflow-hidden ${
                          getModuleStatus("vd") !== "active" ? "opacity-60" : ""
                        }`}>
                          {getModuleStatus("vd") !== "active" && (
                            <div className="absolute inset-0 bg-slate-950/5 dark:bg-slate-950/25 backdrop-blur-[1px] flex flex-col items-center justify-center p-4 text-center z-10 select-none pointer-events-none">
                              <div className="bg-slate-900/90 border border-slate-800 text-white rounded-lg px-2.5 py-1 text-[10px] font-black flex items-center gap-1.5 shadow-md">
                                {getModuleStatus("vd") === "disabled" ? (
                                  <><Lock className="w-3 h-3 text-rose-500" /> LOCKED</>
                                ) : (
                                  <><AlertTriangle className="w-3 h-3 text-amber-500 animate-pulse" /> MAINTENANCE</>
                                )}
                              </div>
                            </div>
                          )}
                          <div className="flex items-start justify-between">
                            <div className="space-y-1">
                              <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block">
                                MAX VOLTAGE DROP
                              </span>
                              <h3 className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight font-mono">
                                {getModuleStatus("vd") === "active" ? `${maxVDPercent.toFixed(2)}%` : "---"}
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
                              {getModuleStatus("vd") === "active" ? (
                                vdCompliant ? "PEC Compliant" : "Exceeds PEC Limit"
                              ) : "No Active Evaluation"}
                            </span>
                            {getModuleStatus("vd") === "active" && (
                              <button
                                onClick={() => setActiveTab("vd")}
                                className="text-indigo-600 dark:text-indigo-400 font-extrabold hover:underline flex items-center gap-1 relative z-20"
                              >
                                Evaluate <ArrowUpRight className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Recommended Transformer Capacity Card */}
                    {getModuleStatus("transformer") !== "hidden" && (() => {
                      const totalVA = circuits.reduce((sum, c) => sum + (c.loadVA || 0), 0);
                      const totalKVA = totalVA / 1000;
                      const demandKVA = totalKVA * transformerDemandFactor;
                      const requiredKVA = transformerLoadingFactor > 0 ? demandKVA / transformerLoadingFactor : 0;
                      
                      const standardKVA = [15, 30, 45, 75, 112.5, 150, 225, 300, 500, 750, 1000, 1500, 2000, 2500];
                      const recommendedRating = standardKVA.find((s) => s >= requiredKVA) || standardKVA[standardKVA.length - 1];
                      const actualLoadingPct = recommendedRating > 0 ? (demandKVA / recommendedRating) * 100 : 0;
                      const isLoadedCompliant = actualLoadingPct <= transformerLoadingFactor * 100;

                      return (
                        <div className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group relative overflow-hidden ${
                          getModuleStatus("transformer") !== "active" ? "opacity-60" : ""
                        }`}>
                          {getModuleStatus("transformer") !== "active" && (
                            <div className="absolute inset-0 bg-slate-950/5 dark:bg-slate-950/25 backdrop-blur-[1px] flex flex-col items-center justify-center p-4 text-center z-10 select-none pointer-events-none">
                              <div className="bg-slate-900/90 border border-slate-800 text-white rounded-lg px-2.5 py-1 text-[10px] font-black flex items-center gap-1.5 shadow-md">
                                {getModuleStatus("transformer") === "disabled" ? (
                                  <><Lock className="w-3 h-3 text-rose-500" /> LOCKED</>
                                ) : (
                                  <><AlertTriangle className="w-3 h-3 text-amber-500 animate-pulse" /> MAINTENANCE</>
                                )}
                              </div>
                            </div>
                          )}
                          <div className="flex items-start justify-between">
                            <div className="space-y-1">
                              <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block">
                                RECOMMENDED TRANSFORMER
                              </span>
                              <h3 className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight font-mono">
                                {getModuleStatus("transformer") === "active" ? `${recommendedRating.toFixed(1)} kVA` : "---"}
                              </h3>
                            </div>
                            <div className="p-3 bg-teal-50 dark:bg-teal-950/35 text-teal-600 dark:text-teal-400 rounded-xl group-hover:bg-teal-600 group-hover:text-white transition-all shadow-sm">
                              <Zap className="w-5 h-5" />
                            </div>
                          </div>

                          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                            <span className="font-bold text-slate-700 dark:text-slate-300">
                              {getModuleStatus("transformer") === "active" ? `${actualLoadingPct.toFixed(1)}% Loading Factor` : "No Active Sizing"}
                            </span>
                            {getModuleStatus("transformer") === "active" && (
                              <button
                                onClick={() => setActiveTab("transformer")}
                                className="text-indigo-600 dark:text-indigo-400 font-extrabold hover:underline flex items-center gap-1 relative z-20"
                              >
                                Sizing <ArrowUpRight className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Illumination target status */}
                    {getModuleStatus("lighting") !== "hidden" && (() => {
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
                        <div className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group relative overflow-hidden ${
                          getModuleStatus("lighting") !== "active" ? "opacity-60" : ""
                        }`}>
                          {getModuleStatus("lighting") !== "active" && (
                            <div className="absolute inset-0 bg-slate-950/5 dark:bg-slate-950/25 backdrop-blur-[1px] flex flex-col items-center justify-center p-4 text-center z-10 select-none pointer-events-none">
                              <div className="bg-slate-900/90 border border-slate-800 text-white rounded-lg px-2.5 py-1 text-[10px] font-black flex items-center gap-1.5 shadow-md">
                                {getModuleStatus("lighting") === "disabled" ? (
                                  <><Lock className="w-3 h-3 text-rose-500" /> LOCKED</>
                                ) : (
                                  <><AlertTriangle className="w-3 h-3 text-amber-500 animate-pulse" /> MAINTENANCE</>
                                )}
                              </div>
                            </div>
                          )}
                          <div className="flex items-start justify-between">
                            <div className="space-y-1">
                              <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block">
                                EST. ILLUMINATION
                              </span>
                              <h3 className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight font-mono">
                                {getModuleStatus("lighting") === "active" ? `${calculatedLux || 0} Lux` : "---"}
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
                              {getModuleStatus("lighting") === "active" ? (
                                isLCompliance ? "Target Met" : "Low Illum"
                              ) : "No Active Simulation"}
                            </span>
                            {getModuleStatus("lighting") === "active" && (
                              <button
                                onClick={() => setActiveTab("lighting")}
                                className="text-indigo-600 dark:text-indigo-400 font-extrabold hover:underline flex items-center gap-1 relative z-20"
                              >
                                Simulate <ArrowUpRight className="w-3.5 h-3.5" />
                              </button>
                            )}
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
                      {[
                        { id: "schedule", label: "Load Schedule", icon: <Layout className="w-5 h-5 text-indigo-500" /> },
                        { id: "isc", label: "Short Circuit", icon: <ShieldAlert className="w-5 h-5 text-rose-500" /> },
                        { id: "vd", label: "Voltage Drop", icon: <Ruler className="w-5 h-5 text-emerald-500" /> },
                        { id: "lighting", label: "Illumination", icon: <Lightbulb className="w-5 h-5 text-yellow-500" /> },
                        { id: "floor-plan", label: "Blueprint Preview", icon: <Map className="w-5 h-5 text-cyan-500" /> },
                      ]
                        .filter(btn => getModuleStatus(btn.id) !== "hidden")
                        .map(btn => {
                          const status = getModuleStatus(btn.id);
                          const isActive = status === "active";
                          const isMaint = status === "maintenance";
                          const isDis = status === "disabled";

                          return (
                            <button
                              key={btn.id}
                              disabled={!isActive}
                              onClick={() => {
                                if (isActive) setActiveTab(btn.id as any);
                              }}
                              className={`bg-white dark:bg-slate-800 border p-4 rounded-2xl shadow-sm text-center font-bold text-xs transition-all flex flex-col items-center gap-2 relative ${
                                isActive 
                                  ? "hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-indigo-600 dark:hover:text-indigo-400 border-slate-200/80 dark:border-slate-800 cursor-pointer text-slate-800 dark:text-slate-200" 
                                  : "opacity-55 border-slate-100 dark:border-slate-900 cursor-not-allowed text-slate-400 dark:text-slate-600"
                              }`}
                            >
                              {btn.icon}
                              <span>{btn.label}</span>
                              {!isActive && (
                                <span className={`absolute top-1.5 right-1.5 px-1 py-0.5 rounded text-[8px] font-black uppercase tracking-wider text-white ${
                                  isDis ? "bg-rose-500" : "bg-amber-500 animate-pulse"
                                }`}>
                                  {isDis ? "LOCKED" : "MAINT"}
                                </span>
                              )}
                            </button>
                          );
                        })}
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
                        isPremium={userPlan === "premium" || userPlan === "enterprise" || isAdmin}
                        onRequestUpgrade={() => setShowUpgrade(true)}
                        isAdmin={isAdmin}
                        transformerPrimaryVoltage={transformerPrimaryVoltage}
                        setTransformerPrimaryVoltage={setTransformerPrimaryVoltage}
                      />
                    )}

                    {/* 2. Sub-Panels Schedules */}
                    {uniqueSubPanels.map((sp, index) => {
                      const isVisible =
                        isExporting || activeScheduleTab === sp.id;
                      if (!isVisible) return null;

                      let parentConn: Circuit | undefined = undefined;
                      let parentName = "";
                      
                      // Check MDP first
                      parentConn = circuits.find(
                        (c) => c.linkedSubPanelId === sp.id
                      );
                      if (parentConn) {
                        parentName = panel.designation || "MDP";
                      } else {
                        // Check other subpanels
                        for (const otherSp of uniqueSubPanels) {
                          const conn = otherSp.circuits.find(c => c.linkedSubPanelId === sp.id);
                          if (conn) {
                            parentConn = conn;
                            parentName = otherSp.panel.designation || "Sub-Panel";
                            break;
                          }
                        }
                      }

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
                            availableSubPanels={uniqueSubPanels}
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
                            isPremium={userPlan === "premium" || userPlan === "enterprise" || isAdmin}
                            onRequestUpgrade={() => setShowUpgrade(true)}
                            isAdmin={isAdmin}
                            transformerPrimaryVoltage={transformerPrimaryVoltage}
                            setTransformerPrimaryVoltage={setTransformerPrimaryVoltage}
                            parentMdpConnection={parentConn ? {
                              circuitNo: parentConn.circuitNo,
                              description: parentConn.description,
                              mdpDesignation: parentName,
                              circuitId: parentConn.id,
                              feederSize: parentConn.wireSize,
                              feederRuns: parentConn.quantity || 1
                            } : undefined}
                            vdCalculations={vdCalculations}
                          />

                          {!isExporting && activeScheduleTab === sp.id && (
                            <button
                              onClick={() => {
                                const newId = crypto.randomUUID();
                                setSubPanels((prev) => [
                                  ...prev,
                                  {
                                    id: newId,
                                    panel: {
                                      ...INITIAL_PANEL,
                                      designation: `Child Panel ${prev.length + 1}`,
                                    },
                                    circuits: getFreshInitialCircuits(),
                                  },
                                ]);
                                setActiveScheduleTab(newId);
                              }}
                              className="w-full mt-6 py-6 border-2 border-dashed border-cyan-300 dark:border-cyan-800 rounded-2xl flex items-center justify-center gap-2 text-cyan-600 dark:text-cyan-500 font-bold hover:text-cyan-700 dark:hover:text-cyan-400 hover:border-cyan-400 hover:bg-cyan-50/50 dark:hover:bg-cyan-950/20 transition-all no-print cursor-pointer shadow-sm"
                            >
                              <Layers className="w-5 h-5 animate-pulse" />
                              Create Nested Child Panel
                            </button>
                          )}
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
                    
                    params={iscParams}
                    setParams={setIscParams}
                    source={iscSource}
                    setSource={setIscSource}
                    isPremium={userPlan === "premium" || userPlan === "enterprise" || isAdmin}
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
                    
                    calculations={vdCalculations}
                    setCalculations={setVdCalculations}
                    isPremium={userPlan === "premium" || userPlan === "enterprise" || isAdmin}
                    onRequestUpgrade={() => setShowUpgrade(true)}
                    isExporting={isExporting}
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
                    subPanels={subPanels}
                    vdCalculations={vdCalculations}
                    setCircuits={setCircuits}
                    setActiveTab={setActiveTab}
                    activeTab={activeTab}
                    params={illumParams}
                    setParams={setIllumParams}
                    onSnapshotCapture={handleAddIllumSnapshot}
                    snapshots={illumSnapshots}
                    userId={user?.uid}
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
                    
                    iscParams={iscParams}
                    isPremium={userPlan === "premium" || userPlan === "enterprise" || isAdmin}
                    onRequestUpgrade={() => setShowUpgrade(true)}
                    vdCalculations={vdCalculations}
                  />
                </motion.div>
              </div>

              {/* Power Analysis Suite Tab */}
              <div
                className={
                  activeTab === "power-suite" || isExporting
                    ? "w-full"
                    : "absolute left-[-9999px] top-0 opacity-0 pointer-events-none w-full select-none"
                }
              >
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={
                    activeTab === "power-suite" || isExporting
                      ? { opacity: 1, y: 0 }
                      : {}
                  }
                  transition={{ duration: 0.2 }}
                  className="w-full flex justify-center"
                >
                  <PowerSystemAnalysis
                    panel={panel}
                    circuits={circuits}
                    subPanels={subPanels}
                    
                    iscParams={iscParams}
                    setIscParams={setIscParams}
                    vdCalculations={vdCalculations}
                    isPremium={userPlan === "premium" || userPlan === "enterprise" || isAdmin}
                    onRequestUpgrade={() => setShowUpgrade(true)}
                    transformerPrimaryVoltage={transformerPrimaryVoltage}
                    transformerPowerFactor={transformerPowerFactor}
                    transformerDemandFactor={transformerDemandFactor}
                    transformerLoadingFactor={transformerLoadingFactor}
                    user={user}
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
                  <EgcSizingCalculator
                    isPremium={userPlan === "premium" || userPlan === "enterprise" || isAdmin}
                    onRequestUpgrade={() => setShowUpgrade(true)}
                    user={user}
                  />
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
                    isPremium={userPlan === "premium" || userPlan === "enterprise" || isAdmin}
                    onRequestUpgrade={() => setShowUpgrade(true)}
                    user={user}
                  />
                </motion.div>
              </div>

              {/* Verify Admin Tab */}
              <div className={activeTab === "verify" || activeTab === "verify-registrations" ? "w-full" : "hidden"}>
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={activeTab === "verify" || activeTab === "verify-registrations" ? { opacity: 1, y: 0 } : {}}
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

            {/* Profile Settings Modal Overlay */}
            {isProfileSettingsOpen && (
              <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4 no-print animate-fade-in">
                <div className="bg-slate-900 border border-slate-800 text-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
                  {/* Modal Header */}
                  <div className="px-6 py-5 border-b border-slate-800 bg-slate-950/40 flex justify-between items-center">
                    <h2 className="text-base font-black tracking-tight text-white flex items-center gap-2.5">
                      <Settings className="w-5 h-5 text-emerald-450" />
                      PROFILE SETTINGS & AUTHENTICATION
                    </h2>
                    <button
                      onClick={() => setIsProfileSettingsOpen(false)}
                      className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Modal Content */}
                  <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                    <div>
                      <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-3">Professional Credentials</p>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-xxs font-black text-slate-400 uppercase tracking-wider block">Full Name</label>
                          <input 
                            type="text" 
                            defaultValue={user.displayName || "Authorized Electrical Designer"} 
                            className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700 focus:border-emerald-500 rounded-xl px-3 py-2 text-xs text-white font-semibold transition-all focus:outline-none focus:ring-1 focus:ring-emerald-500" 
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xxs font-black text-slate-400 uppercase tracking-wider block">PRC EE License Number</label>
                          <input 
                            type="text" 
                            placeholder="e.g. 0041529" 
                            className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700 focus:border-emerald-500 rounded-xl px-3 py-2 text-xs text-white font-semibold transition-all focus:outline-none focus:ring-1 focus:ring-emerald-500" 
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xxs font-black text-slate-400 uppercase tracking-wider block">Primary Account Email</label>
                      <input 
                        type="email" 
                        disabled 
                        value={user.email || ""} 
                        className="w-full bg-slate-950/60 border border-slate-850 rounded-xl px-3 py-2 text-xs text-slate-400 font-semibold cursor-not-allowed" 
                      />
                    </div>

                    <div className="bg-slate-950/40 p-3.5 rounded-2xl border border-slate-850/60 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-xxs font-bold text-slate-400">Account Security ID:</span>
                        <span className="text-xxs font-mono text-emerald-450 font-bold select-all truncate max-w-[200px]" title={user.uid}>{user.uid}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xxs font-bold text-slate-400">Database Connection Status:</span>
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                          <span className="text-xxs font-bold text-slate-200">Online & Encrypted</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Modal Footer */}
                  <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/20 flex justify-end gap-3">
                    <button
                      onClick={() => setIsProfileSettingsOpen(false)}
                      className="px-4 py-2 border border-slate-800 hover:bg-slate-850 text-slate-300 hover:text-white rounded-lg text-xxs font-black uppercase tracking-wider transition-all cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        setIsProfileSettingsOpen(false);
                      }}
                      className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xxs font-black uppercase tracking-wider transition-all shadow-md shadow-emerald-600/10 cursor-pointer"
                    >
                      Save Configuration
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Account Settings Modal Overlay */}
            {isAccountSettingsOpen && (
              <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4 no-print animate-fade-in">
                <div className="bg-slate-900 border border-slate-800 text-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
                  {/* Modal Header */}
                  <div className="px-6 py-5 border-b border-slate-800 bg-slate-950/40 flex justify-between items-center">
                    <h2 className="text-base font-black tracking-tight text-white flex items-center gap-2.5">
                      <Cpu className="w-5 h-5 text-amber-500" />
                      ELECTRICAL ENGINEERING COMPONENT DEFAULTS
                    </h2>
                    <button
                      onClick={() => setIsAccountSettingsOpen(false)}
                      className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Modal Content */}
                  <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                    <div>
                      <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-3">Subscription Tier</p>
                      <div className="flex flex-col gap-2 p-3.5 bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20 rounded-2xl">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-xs font-black text-amber-400 uppercase">
                              {userPlan === "enterprise" ? "ENTERPRISE (LIFETIME)" : (userPlan === "premium" ? "PREMIUM (30 DAYS)" : (userPlan === "basic" ? "BASIC (30 DAYS)" : "FREE TRIAL TIER"))}
                            </p>
                            <p className="text-[10px] text-slate-400 mt-0.5">Enterprise licenses unlock complete single-line CAD blueprints and bulk Word compiling.</p>
                          </div>
                          {userPlan !== "enterprise" && (
                            <button
                              onClick={() => {
                                setIsAccountSettingsOpen(false);
                                if (userPlan === "basic" || userPlan === "premium") {
                                  setShowRenew(true);
                                } else {
                                  setShowUpgrade(true);
                                }
                              }}
                              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg text-[10px] font-extrabold uppercase tracking-wider transition-all"
                            >
                              {userPlan === "premium" || userPlan === "basic" ? "Renew" : "Upgrade"}
                            </button>
                          )}
                        </div>
                        {(userPlan === "basic" || userPlan === "premium") && expiresAt && (
                          <div className="flex items-center gap-3 mt-2 text-[10px] font-semibold text-slate-400">
                            <div className="bg-slate-950/50 px-2 py-1 rounded">
                              <span className="text-slate-500 mr-1">Activated:</span> {new Date(activatedAt || "").toLocaleDateString()}
                            </div>
                            <div className="bg-slate-950/50 px-2 py-1 rounded">
                              <span className="text-slate-500 mr-1">Expires:</span> {new Date(expiresAt).toLocaleDateString()}
                            </div>
                            <div className={`px-2 py-1 rounded font-bold ${
                              (new Date(expiresAt).getTime() - new Date().getTime()) / (1000 * 3600 * 24) <= 3 ? "text-rose-400 bg-rose-950/50" : 
                              (new Date(expiresAt).getTime() - new Date().getTime()) / (1000 * 3600 * 24) <= 7 ? "text-amber-400 bg-amber-950/50" : 
                              "text-emerald-400 bg-emerald-950/50"
                            }`}>
                              {Math.max(0, Math.ceil((new Date(expiresAt).getTime() - new Date().getTime()) / (1000 * 3600 * 24)))} Days Left
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-1.5">Design Codes & Physics Standard</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-xxs font-black text-slate-400 uppercase tracking-wider block">Electrical Code Reference</label>
                        <select className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 font-semibold focus:outline-none focus:border-amber-500 cursor-pointer">
                          <option>PEC 10th Edition (2017)</option>
                          <option>National Electrical Code (NEC 2020)</option>
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xxs font-black text-slate-400 uppercase tracking-wider block">Physics Frequency Rating</label>
                        <select className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 font-semibold focus:outline-none focus:border-amber-500 cursor-pointer">
                          <option>60 Cycles/Sec (60 Hz)</option>
                          <option>50 Cycles/Sec (50 Hz)</option>
                        </select>
                      </div>
                      
                      <div className="space-y-1.5">
                        <label className="text-xxs font-black text-slate-400 uppercase tracking-wider block">Conductor Ampacity Temp</label>
                        <select className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 font-semibold focus:outline-none focus:border-amber-500 cursor-pointer">
                          <option>75°C (Recommended Standard)</option>
                          <option>90°C (Extended Rating)</option>
                          <option>60°C (Muted Baseline)</option>
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xxs font-black text-slate-400 uppercase tracking-wider block">Maximum Allowed Voltage Drop</label>
                        <select className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 font-semibold focus:outline-none focus:border-amber-500 cursor-pointer">
                          <option>3.00% (Branch Standard)</option>
                          <option>2.00% (Feeder Target)</option>
                          <option>5.00% (Total Stack Maximum)</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Modal Footer */}
                  <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/20 flex justify-end gap-3">
                    <button
                      onClick={() => setIsAccountSettingsOpen(false)}
                      className="px-4 py-2 border border-slate-800 hover:bg-slate-850 text-slate-300 hover:text-white rounded-lg text-xxs font-black uppercase tracking-wider transition-all cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        setIsAccountSettingsOpen(false);
                      }}
                      className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg text-xxs font-black uppercase tracking-wider transition-all shadow-md shadow-amber-500/10 cursor-pointer"
                    >
                      Save Parameters
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
