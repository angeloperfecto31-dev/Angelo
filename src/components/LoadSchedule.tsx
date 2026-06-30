import React, { useState, useMemo, useEffect } from "react";
import { isEqual } from "lodash";
import {
  Plus,
  Trash2,
  Printer,
  Settings2,
  Info,
  Zap,
  Calculator,
  FileText,
  Copy,
  ShieldAlert,
  List,
  X,
  Layers,
  ArrowUp,
  ArrowDown,
  GripVertical,
  MoveVertical,
  Search,
  RotateCcw
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Circuit,
  PanelConfig,
  LoadType,
  Phase,
  MCBType,
  ShortCircuitParams,
  VoltageDropCalculation,
} from "../types";
import { exportToCAD } from "../utils/exportDxf";
import { findEgcSize } from "../utils/exportEgcExports";
import {
  STANDARD_CB_RATINGS,
  SYSTEM_VOLTAGES,
  DESCRIPTION_CODES,
  LOAD_PRESETS,
  CONDUIT_LIBRARY,
  CONDUIT_SIZES,
} from "../constants";
import {
  PEC_AMPACITY_TABLE,
  getConductorAmpacity,
  getTemperatureForInsulation,
  sizeConductor,
} from "../utils/pecAmpacityDatabase";
import { SingleLineDiagram } from "./SingleLineDiagram";
import LatexRenderer from "./LatexRenderer";
import { calculateCircuitValues, getPanelSystemVoltageFallback, extractHorsepowerFromDescription, computePanelScheduleValues, formatWireSizeLocal, isIdleSpareOrSpace, calculatePanelFault, validateSubPanelConnection, parseSystemVoltage } from "../utils/computeEngine";
import {
  getThreePhaseFLCDatabaseList,
  saveThreePhaseFLCEntry,
  deleteThreePhaseFLCEntry,
  seedThreePhaseFLCBackup,
  INITIAL_THREE_PHASE_FLC_DATA,
  SINGLE_PHASE_FLC_TABLE,
  parseHpToNumber,
  ThreePhaseFLCEntry,
  getThreePhaseFLCColumn
} from "../utils/motorFLCHelper";

export const INITIAL_CIRCUITS: Circuit[] = [
  {
    id: crypto.randomUUID(),
    circuitNo: 1,
    description: "LIGHTING OUTLETS - GROUND FLOOR",
    wattage: 100,
    quantity: 12,
    loadVA: 1200,
    pf: 1.0,
    voltage: 230,
    phases: ["R"],
    loadA: 5.22,
    mcbAT: 15,
    mcbAF: 50,
    mcbP: 1,
    mcbKAIC: 10,
    mcbType: MCBType.BOLT_ON,
    wireSize: "2.0",
    wireType: "THHN",
    groundSize: "2.0",
    conduitSize: "15mm",
    conduitType: "PVC",
    loadType: LoadType.LIGHTING,
  },
  {
    id: crypto.randomUUID(),
    circuitNo: 2,
    description: "CONVENIENCE OUTLETS - GROUND FLOOR",
    wattage: 180,
    quantity: 20,
    loadVA: 3600,
    pf: 1.0,
    voltage: 230,
    phases: ["R"],
    loadA: 15.65,
    mcbAT: 20,
    mcbAF: 50,
    mcbP: 2,
    mcbKAIC: 10,
    mcbType: MCBType.BOLT_ON,
    wireSize: "3.5",
    wireType: "THHN",
    groundSize: "3.5",
    conduitSize: "15mm",
    conduitType: "PVC",
    loadType: LoadType.CONVENIENCE_OUTLET,
  },
];

export const INITIAL_PANEL: PanelConfig = {
  project: "RESIDENTIAL BUILDING",
  projectType: "Residential",
  location: "MAIN PANEL - GARAGE",
  designation: "MDP",
  type: "MAIN DISTRIBUTION PANEL",
  system: "230V, 1PH, 2W",
  connectionType: "Line-to-Line",
  transformerConnection: "Delta-Wye (Δ-Y)",
  mounting: "FLUSH MOUNTED",
  enclosure: "NEMA 1",
  mainBreakerAT: 60,
  mainBreakerAF: 100,
  icRating: "10kA",
  voltage: 230,
  frequency: 60,
};

export interface LoadScheduleProps {
  panel: PanelConfig;
  setPanel: React.Dispatch<React.SetStateAction<PanelConfig>>;
  circuits: Circuit[];
  setCircuits: React.Dispatch<React.SetStateAction<Circuit[]>>;
  isSubPanel?: boolean;
  isSubSubPanel?: boolean;
  onAddSubPanel?: () => void;
  onRemoveSubPanel?: () => void;
  onDuplicateSubPanel?: () => void;
  availableSubPanels?: {
    id: string;
    panel: PanelConfig;
    circuits: Circuit[];
  }[];
  readOnly?: boolean;
  iscParams?: ShortCircuitParams;
  isPremium?: boolean;
  onRequestUpgrade?: () => void;
  parentMdpConnection?: { circuitNo: number; description: string; mdpDesignation: string; circuitId?: string; feederSize?: string; feederRuns?: number };
  vdCalculations?: VoltageDropCalculation[];
  transformerPrimaryVoltage?: number;
  setTransformerPrimaryVoltage?: (val: number) => void;
}

const AmpsInput = ({ c, panel, is3P, onAmpsUpdate, disabled }: { c: Circuit; panel: PanelConfig; is3P: boolean; onAmpsUpdate: (newAmps: number) => void; disabled: boolean }) => {
  const [val, setVal] = React.useState(c.loadA.toFixed(2));
  
  React.useEffect(() => {
    setVal(c.loadA.toFixed(2));
  }, [c.loadA]);

  const handleBlur = () => {
    let parsed = parseFloat(val);
    if (isNaN(parsed)) parsed = 0;
    if (Math.abs(parsed - c.loadA) > 0.01) {
      onAmpsUpdate(parsed);
    } else {
      setVal(c.loadA.toFixed(2));
    }
  };

  if (disabled) {
    return <span>{c.loadA.toFixed(2)}</span>;
  }

  return (
    <input
      type="number"
      step="0.01"
      className={`w-16 bg-transparent text-center font-mono focus:outline-none focus:border-b focus:border-slate-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${is3P ? 'text-indigo-600 dark:text-indigo-400' : ''}`}
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur();
        }
      }}
    />
  );
};

const WireBundle = ({
  system,
  wireSize,
  groundSize,
  isBranch = false,
  phases = [],
  className = "",
  direction = "down",
}: {
  system?: string;
  wireSize: string | number;
  groundSize: string | number;
  isBranch?: boolean;
  phases?: string[];
  className?: string;
  direction?: "down" | "up" | "left" | "right";
}) => {
  const baseSize = parseFloat(wireSize.toString()) || 2;
  const gSize = parseFloat(groundSize.toString()) || 2;
  const getPx = (s: number) => Math.floor(Math.max(2, Math.pow(s, 0.6) * 1.5));
  const mainPx = getPx(baseSize);
  const gPx = getPx(gSize);

  const wires: { id: string; color: string; size: number }[] = [];
  const getWires = () => {
    if (isBranch) {
      phases.forEach((p) => {
        if (p === "R")
          wires.push({ id: "R", color: "bg-red-500", size: mainPx });
        if (p === "Y")
          wires.push({ id: "Y", color: "bg-yellow-400", size: mainPx });
        if (p === "B")
          wires.push({ id: "B", color: "bg-blue-500", size: mainPx });
      });
      if (phases.length < 3 && (!system || system.includes("1PH"))) {
        wires.push({ id: "N", color: "bg-slate-300", size: mainPx });
      }
      wires.push({ id: "G", color: "bg-green-500", size: gPx });
    } else if (system) {
      if (system.includes("1PH")) {
        wires.push(
          { id: "L", color: "bg-black", size: mainPx },
          { id: "N", color: "bg-slate-300", size: mainPx },
          { id: "G", color: "bg-green-500", size: gPx },
        );
      } else if (system.includes("4W") || system.includes("5W")) {
        wires.push(
          { id: "L1", color: "bg-red-500", size: mainPx },
          { id: "L2", color: "bg-yellow-400", size: mainPx },
          { id: "L3", color: "bg-blue-500", size: mainPx },
          { id: "N", color: "bg-slate-300", size: mainPx },
          { id: "G", color: "bg-green-500", size: gPx },
        );
      } else {
        wires.push(
          { id: "L1", color: "bg-red-500", size: mainPx },
          { id: "L2", color: "bg-yellow-400", size: mainPx },
          { id: "L3", color: "bg-blue-500", size: mainPx },
          { id: "G", color: "bg-green-500", size: gPx },
        );
      }
    }
  };
  getWires();

  const animClass =
    direction === "down"
      ? "animate-flow-down"
      : direction === "up"
        ? "animate-flow-up"
        : direction === "right"
          ? "animate-flow-right"
          : "animate-flow-left";

  const flowPattern =
    direction === "down" || direction === "up"
      ? "linear-gradient(to bottom, transparent 40%, rgba(255,255,255,0.7) 50%, transparent 60%)"
      : "linear-gradient(to right, transparent 40%, rgba(255,255,255,0.7) 50%, transparent 60%)";
  const flowSize =
    direction === "down" || direction === "up" ? "100% 16px" : "16px 100%";

  const isVertical = direction === "down" || direction === "up";

  return (
    <div
      className={`flex ${isVertical ? "flex-row" : "flex-col"} justify-center gap-[1px] items-center shrink-0 ${className}`}
    >
      {wires.map((w) => (
        <div
          key={w.id}
          className={`${w.color} relative overflow-hidden`}
          style={{
            width: isVertical ? `${w.size}px` : "100%",
            height: isVertical ? "100%" : `${w.size}px`,
          }}
        >
          <div
            className={`absolute inset-0 mix-blend-overlay opacity-60 ${animClass}`}
            style={{
              backgroundImage: flowPattern,
              backgroundSize: flowSize,
            }}
          />
        </div>
      ))}
    </div>
  );
};

const RealisticBreaker = ({
  amps,
  poles,
  kaic,
  type,
  isMain = false,
}: {
  amps: string | number;
  poles: number;
  kaic: number;
  type: string;
  isMain?: boolean;
}) => {
  const isDinRail = type.includes("MCB") || type.includes("DIN");

  return (
    <div
      className={`relative flex rounded overflow-hidden z-20 shrink-0 shadow-md ${isMain ? "h-32" : "h-24"} ${isDinRail ? "bg-white border border-slate-300" : "bg-[#e2e3e5] border border-slate-400"}`}
    >
      {/* Rendering per pole for realism */}
      {Array.from({ length: poles }).map((_, i) => (
        <div
          key={i}
          className={`flex flex-col items-center justify-between border-r last:border-r-0 ${isDinRail ? "border-slate-200" : "border-slate-400"} ${isMain ? "w-10" : "w-8"}`}
        >
          {/* Top terminal */}
          <div
            className={`w-full h-[15%] flex justify-center items-center shadow-inner border-b ${isDinRail ? "bg-zinc-200 border-zinc-300" : "bg-zinc-400 border-zinc-500"}`}
          >
            <div className="w-2.5 h-2.5 rounded-full bg-zinc-300 border border-zinc-500 shadow-inner flex items-center justify-center">
              <div className="w-1.5 h-[1px] bg-zinc-500 rounded" />
            </div>
          </div>

          {/* Center body for pole */}
          <div className="flex-1 w-full flex flex-col justify-center items-center relative">
            {/* Branding / Text only on the first pole or center */}
            {i === 0 && !isMain && (
              <div className="absolute top-1 left-1 flex flex-col justify-start items-start opacity-70">
                <span className="text-[5px] font-bold text-blue-600 leading-none tracking-tighter">
                  bonti
                </span>
                <span className="text-[5px] font-black text-slate-500 leading-none mt-0.5">
                  {type}
                </span>
              </div>
            )}
            {isMain && i === Math.floor(poles / 2) && (
              <div className="absolute top-1 flex flex-col justify-center items-center w-full opacity-80">
                <span className="text-[6px] font-bold text-blue-600 leading-none">
                  bonti
                </span>
                <span className="text-[5px] font-black text-slate-500 leading-none mt-0.5">
                  {type}
                </span>
              </div>
            )}

            {/* Switch Toggle */}
            <div
              className={`bg-zinc-800 rounded-sm shadow-inner relative flex justify-center items-center overflow-hidden border border-zinc-900 ${isDinRail ? (isMain ? "w-5 h-8 mt-4" : "w-4 h-6 mt-2") : isMain ? "w-6 h-10 mt-4" : "w-5 h-8 mt-2"}`}
            >
              <div
                className={`w-full h-1/2 flex justify-center items-center absolute top-0 shadow-inner border-b ${isMain ? "bg-orange-500 border-orange-700" : "bg-slate-700 border-slate-900"}`}
              ></div>
            </div>

            {i === 0 && (
              <div className="absolute bottom-1 right-1/2 translate-x-1/2">
                <span
                  className={`font-bold leading-none block ${isDinRail ? "text-teal-600" : "text-slate-800"} ${isMain ? "text-[10px]" : "text-[8px]"}`}
                >
                  C{amps}
                </span>
              </div>
            )}
          </div>

          {/* Bottom terminal */}
          <div
            className={`w-full h-[15%] flex justify-center items-center shadow-inner border-t ${isDinRail ? "bg-zinc-200 border-zinc-300" : "bg-zinc-400 border-zinc-500"}`}
          >
            <div className="w-2.5 h-2.5 rounded-full bg-zinc-300 border border-zinc-500 shadow-inner flex items-center justify-center">
              <div className="w-1.5 h-[1px] bg-zinc-500 rounded" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

const VerticalBusBarComponent: React.FC<{
  label: string;
  is3Phase?: boolean;
}> = ({ label, is3Phase = true }) => {
  return (
    <div className="w-24 h-full min-h-[96px] bg-transparent flex flex-col items-center justify-center relative z-10 shrink-0 overflow-visible">
      {/* The vertical parallel lines spanning the row */}
      <div className="absolute inset-y-0 w-full flex justify-evenly z-0 pt-0 pb-0">
        {is3Phase ? (
          <>
            <div className="w-2 bg-red-500 shadow-sm"></div>
            <div className="w-2 bg-yellow-400 shadow-sm"></div>
            <div className="w-2 bg-blue-500 shadow-sm"></div>
          </>
        ) : (
          <>
            <div className="w-2 bg-black shadow-sm"></div>
            <div className="w-2 bg-slate-500 shadow-sm"></div>
          </>
        )}
      </div>

      <div className="relative border-y-2 border-slate-300 bg-slate-50/90 text-slate-700 w-full flex items-center justify-center z-10 py-1 font-black text-xl shadow-sm backdrop-blur">
        PHASE {label}
      </div>

      {/* Left Phase Stub */}
      {/* Extend horizontal tap from the center to the edge */}
      <div
        className={`absolute left-0 right-1/2 top-1/2 -translate-y-1/2 h-2 ${label === "L1" ? "bg-red-500" : label === "L2" ? "bg-yellow-400" : label === "L3" ? "bg-blue-500" : "bg-black"} z-0`}
      />

      {/* Right Phase Stub */}
      <div
        className={`absolute left-1/2 right-0 top-1/2 -translate-y-1/2 h-2 ${label === "L1" ? "bg-red-500" : label === "L2" ? "bg-yellow-400" : label === "L3" ? "bg-blue-500" : "bg-black"} z-0`}
      />
    </div>
  );
};

function SortableCircuitItem({ circuit, index }: { circuit: Circuit; index: number }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: circuit.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm mb-2"
    >
      <button {...attributes} {...listeners} className="text-slate-400 hover:text-slate-600 focus:outline-none cursor-grab active:cursor-grabbing">
        <GripVertical className="w-5 h-5" />
      </button>
      <div className="flex-1 flex flex-col min-w-0">
        <div className="font-bold text-slate-800 dark:text-slate-200 truncate flex items-center gap-2">
          <span className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300 font-black text-xs px-2 py-0.5 rounded-full shrink-0">
            #{circuit.circuitNo}
          </span>
          <span className="truncate">{circuit.description || "Unnamed Circuit"}</span>
        </div>
        <div className="text-xs font-semibold text-slate-500 mt-0.5 truncate">
          {circuit.loadA}A Load • CB: {circuit.mcbAT}AT • {circuit.wireSize}mm²
        </div>
      </div>
    </div>
  );
}

export default function LoadSchedule({
  panel,
  setPanel,
  circuits,
  setCircuits,
  isSubPanel = false,
  isSubSubPanel = false,
  onRemoveSubPanel,
  onDuplicateSubPanel,
  availableSubPanels,
  readOnly = false,
  iscParams,
  vdCalculations,
  isPremium = true,
  onRequestUpgrade,
  isAdmin = false,
  parentMdpConnection,
  transformerPrimaryVoltage,
  setTransformerPrimaryVoltage,
}: LoadScheduleProps & { isAdmin?: boolean }) {
  const [tableFontSize, setTableFontSize] = useState<number>(11);
  const [customKaicCircuitIds, setCustomKaicCircuitIds] = useState<string[]>([]);
  const standardKAICRatings = useMemo(() => [5, 10, 14, 18, 22, 25, 30, 35, 42, 50, 65, 85, 100], []);
  const [showPresetsModal, setShowPresetsModal] = useState<boolean>(false);
  const [showRearrangeModal, setShowRearrangeModal] = useState<boolean>(false);
  const [selectedPresets, setSelectedPresets] = useState<any[]>([]);
  
  // Search and Filter States for Presets
  const [presetSearch, setPresetSearch] = useState<string>("");
  const [presetCategoryFilter, setPresetCategoryFilter] = useState<string>("All");
  const [presetLoadTypeFilter, setPresetLoadTypeFilter] = useState<string>("All");
  const [presetPhaseFilter, setPresetPhaseFilter] = useState<string>("All");
  const [presetSortBy, setPresetSortBy] = useState<string>("Alphabetical");
  const [presetSortOrder, setPresetSortOrder] = useState<"asc" | "desc">("asc");

  const [isCustomPrimaryVoltage, setIsCustomPrimaryVoltage] = useState<boolean>(![13800, 34500, 69000, 115000, 230000].includes(transformerPrimaryVoltage || 34500));

  const [showDemandMath, setShowDemandMath] = useState<boolean>(true);

  // Drag and Drop Sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setCircuits((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        const newArray = arrayMove(items, oldIndex, newIndex);
        // Renumber circuits and safely increment
        return newArray.map((c, i) => ({ ...c, circuitNo: i + 1 }));
      });
    }
  };

  const moveCircuitUp = (index: number) => {
    if (index === 0) return;
    setCircuits((items) => {
      const newArray = [...items];
      const temp = newArray[index - 1];
      newArray[index - 1] = newArray[index];
      newArray[index] = temp;
      return newArray.map((c, i) => ({ ...c, circuitNo: i + 1 }));
    });
  };

  const moveCircuitDown = (index: number) => {
    if (index === circuits.length - 1) return;
    setCircuits((items) => {
      const newArray = [...items];
      const temp = newArray[index + 1];
      newArray[index + 1] = newArray[index];
      newArray[index] = temp;
      return newArray.map((c, i) => ({ ...c, circuitNo: i + 1 }));
    });
  };

  // FLC Library States
  const [dbThreePhaseFLC, setDbThreePhaseFLC] = useState<ThreePhaseFLCEntry[]>([]);
  const [loadingFLC, setLoadingFLC] = useState<boolean>(false);
  const [showFLCAdminPanel, setShowFLCAdminPanel] = useState<boolean>(false);

  // FLC HP list union helper
  const hpOptions = useMemo(() => {
    const defaultHps = INITIAL_THREE_PHASE_FLC_DATA.map((e) => e.hp);
    const singlePhaseHps = Object.keys(SINGLE_PHASE_FLC_TABLE);
    const fetchedHps = dbThreePhaseFLC.map((e) => e.hp);
    const union = Array.from(new Set([...defaultHps, ...singlePhaseHps, ...fetchedHps]));
    return union.sort((a, b) => parseHpToNumber(a) - parseHpToNumber(b));
  }, [dbThreePhaseFLC]);

  const dynamicLoadPresets = useMemo(() => {
    return LOAD_PRESETS.map((category) => {
      if (category.category === "Air Conditioning (PEC 2017 Based)") {
        return {
          ...category,
          items: category.items.map((item) => {
            const hp = extractHorsepowerFromDescription(item.description);
            if (hp) {
              const is3PH = panel.system.includes("3PH");
              let flcVal = 0;
              if (is3PH) {
                const colName = getThreePhaseFLCColumn(panel.voltage);
                const match = dbThreePhaseFLC.find(e => e.hp.trim() === hp.trim()) ||
                              INITIAL_THREE_PHASE_FLC_DATA.find(e => e.hp.trim() === hp.trim());
                if (match) {
                  flcVal = match[colName] ?? 0;
                }
              } else {
                flcVal = SINGLE_PHASE_FLC_TABLE[hp] ?? 0;
              }

              if (flcVal > 0) {
                const updatedLabel = `${flcVal.toFixed(1)}A FLC @ ${panel.voltage}V (${is3PH ? "3Ø" : "1Ø"})`;
                const updatedWattage = is3PH
                  ? Math.round(flcVal * panel.voltage * 1.732)
                  : Math.round(flcVal * panel.voltage);
                return {
                  ...item,
                  label: updatedLabel,
                  wattage: updatedWattage,
                };
              }
            }
            return item;
          }),
        };
      }
      return category;
    });
  }, [dbThreePhaseFLC, panel.system, panel.voltage]);

  const filteredLoadPresets = useMemo(() => {
    let result = dynamicLoadPresets.map(cat => ({...cat, items: [...cat.items]}));

    // 1. Category Filter
    if (presetCategoryFilter !== "All") {
      result = result.filter(cat => cat.category === presetCategoryFilter);
    }

    // Process items within remaining categories
    result = result.map(cat => {
      let filteredItems = cat.items;

      // 2. Load Type Filter
      if (presetLoadTypeFilter !== "All") {
        filteredItems = filteredItems.filter(item => {
          if (presetLoadTypeFilter === "Lighting" && item.loadType === "L") return true;
          if (presetLoadTypeFilter === "Receptacle" && item.loadType === "S") return true;
          if (presetLoadTypeFilter === "Motor" && item.loadType === "M") return true;
          if (presetLoadTypeFilter === "Air Conditioning" && item.loadType === "AC") return true;
          if (presetLoadTypeFilter === "Appliance" && item.loadType === "A") return true;
          if (presetLoadTypeFilter === "Other" && item.loadType === "O") return true;
          return false;
        });
      }

      // 3. Phase Type Filter
      if (presetPhaseFilter !== "All") {
        filteredItems = filteredItems.filter(item => {
          const is3P = ((item.loadType === "M" || item.loadType === "AC") && panel.system.includes("3PH"));
          if (presetPhaseFilter === "3 Phase" && is3P) return true;
          if (presetPhaseFilter === "1 Phase" && !is3P) return true;
          return false;
        });
      }

      // 4. Search Keyword Filter
      if (presetSearch.trim() !== "") {
        const query = presetSearch.toLowerCase();
        filteredItems = filteredItems.filter(item => 
          item.description.toLowerCase().includes(query) ||
          item.label.toLowerCase().includes(query) ||
          cat.category.toLowerCase().includes(query)
        );
      }

      // 5. Sorting Items
      filteredItems.sort((a, b) => {
        let comp = 0;
        if (presetSortBy === "Alphabetical") {
          comp = a.description.localeCompare(b.description);
        } else if (presetSortBy === "Wattage") {
          comp = a.wattage - b.wattage;
        }
        return presetSortOrder === "asc" ? comp : -comp;
      });

      return { ...cat, items: filteredItems };
    });

    // Remove empty categories
    return result.filter(cat => cat.items.length > 0);
  }, [dynamicLoadPresets, presetSearch, presetCategoryFilter, presetLoadTypeFilter, presetPhaseFilter, presetSortBy, presetSortOrder, panel.system]);

  // Load FLC values from Firestore
  useEffect(() => {
    let active = true;
    const fetchFLC = async () => {
      setLoadingFLC(true);
      try {
        // Prevent Firestore from blocking the app for 10 seconds if offline
        const data = await Promise.race([
          getThreePhaseFLCDatabaseList(),
          new Promise<ThreePhaseFLCEntry[]>((_, reject) => 
            setTimeout(() => reject(new Error("Firestore timeout")), 3000)
          )
        ]);
        if (active) {
          setDbThreePhaseFLC(data);
        }
      } catch (err) {
        console.warn("Using offline fallback static data table for FLC lookup.");
        if (active) {
          setDbThreePhaseFLC(INITIAL_THREE_PHASE_FLC_DATA);
        }
      } finally {
        if (active) setLoadingFLC(false);
      }
    };
    fetchFLC();
    return () => {
      active = false;
    };
  }, []);

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

  const CONDUIT_FILL_TABLE = CONDUIT_LIBRARY.PVC;

  const formatWireSize = (size: number): string =>
    size <= 8 ? size.toFixed(1) : size.toString();

  // Enforce PEC Small Conductor Rule and standard matching (including support for parallel conductor runs)
  const getWireForBreaker = (cbRating: number, designAmpacity: number) => {
    return sizeConductor(
      cbRating,
      designAmpacity,
      panel.conductorMaterial || "Copper",
      panel.insulationType || "THHN",
      panel.temperatureRating as any
    );
  };

  const getGroundWireForWireSize = (
    wireSize: number,
    cbRating: number,
  ): string => {
    const mat = panel.conductorMaterial || "Copper";
    const result = findEgcSize(cbRating, mat);
    // EGC is never required to be larger than the phase conductors
    const actualSize = Math.min(result.sizeMm2, wireSize);
    return formatWireSize(actualSize);
  };

  const getConduitSizeForWires = (
    wireSize: number,
    groundSizeString: string,
    poles: number,
    systemName: string,
    conduitType: string = "PVC"
  ): string => {
    // poles is 1, 2, or 3
    let activePhaseCount = poles === 1 ? 2 : poles; // 1P branch has Phase + Neutral (2 wires)
    if (poles === 3 && (systemName.includes("4W") || systemName.includes("5W"))) {
      activePhaseCount = 4; // 3 phases + 1 neutral (4 wires)
    }

    const phaseArea = THHN_WIRE_AREAS[wireSize] || wireSize * 2.5;
    const groundSize = parseFloat(groundSizeString) || 2.0;
    const groundArea = THHN_WIRE_AREAS[groundSize] || groundSize * 2.5;

    const totalArea = phaseArea * activePhaseCount + groundArea;
    const selectedType = conduitType && CONDUIT_LIBRARY[conduitType] ? conduitType : "PVC";
    const table = CONDUIT_LIBRARY[selectedType];
    const conduit =
      table.find((c) => c.limit >= totalArea) ||
      table[table.length - 1];
    return conduit.size;
  };

  useEffect(() => {
    if (readOnly) return;
    setCircuits((prevCircuits) => {
      let changed = false;
      const recalculated = prevCircuits.map((c) => {
        const rec = { ...c, ...calculateCircuit(c) } as Circuit;
        if (!isEqual(rec, c)) {
          changed = true;
          return rec;
        }
        return c;
      });

      if (changed) {
        return recalculated;
      }
      return prevCircuits;
    });
  }, [
    panel.system,
    panel.connectionType,
    panel.voltage,
    dbThreePhaseFLC,
    availableSubPanels,
    vdCalculations,
  ]);

  const calculateCircuit = (c: Partial<Circuit>): Partial<Circuit> => {
    return calculateCircuitValues(c, panel, availableSubPanels, vdCalculations);
  };

  const addCircuit = () => {
    const newNo =
      circuits.length > 0
        ? Math.max(...circuits.map((c) => c.circuitNo)) + 1
        : 1;
    const base: Partial<Circuit> = {
      id: crypto.randomUUID(),
      circuitNo: newNo,
      description: "NEW CIRCUIT",
      wattage: 180,
      quantity: 1,
      voltage: panel.voltage,
      phases: ["R"],
      is3PhaseMarker: false,
      loadType: LoadType.POWER,
      mcbType: MCBType.BOLT_ON,
      wireType: "THHN",
      conduitType: "PVC",
    };
    const newCircuit = { ...base, ...calculateCircuit(base) } as Circuit;
    setCircuits([...circuits, newCircuit]);
  };

  const addCircuitFromPreset = (item: {
    description: string;
    wattage: number;
    loadType: string;
  }) => {
    const newNo =
      circuits.length > 0
        ? Math.max(...circuits.map((c) => c.circuitNo)) + 1
        : 1;
    const is3P = ((item.loadType === LoadType.MOTOR || item.loadType === LoadType.AIR_CON) && panel.system.includes("3PH"));
    const base: Partial<Circuit> = {
      id: crypto.randomUUID(),
      circuitNo: newNo,
      description: item.description,
      wattage: item.wattage,
      quantity: 1,
      voltage: panel.voltage,
      phases: is3P ? ["R", "Y", "B"] : ["R"],
      is3PhaseMarker: is3P,
      loadType: item.loadType as LoadType,
      mcbType: MCBType.BOLT_ON,
      wireType: "THHN",
      conduitType: "PVC",
    };
    const newCircuit = { ...base, ...calculateCircuit(base) } as Circuit;
    setCircuits([...circuits, newCircuit]);
    setShowPresetsModal(false);
  };

  const addMultiLoadCircuitFromPresets = () => {
    if (selectedPresets.length === 0) return;
    const newNo =
      circuits.length > 0
        ? Math.max(...circuits.map((c) => c.circuitNo)) + 1
        : 1;

    const subLoads = selectedPresets.map((item) => ({
      id: crypto.randomUUID(),
      description: item.description,
      wattage: item.wattage,
      quantity: 1,
    }));

    const totalVA = subLoads.reduce((sum, sl) => sum + sl.wattage, 0);

    const is3P = ((selectedPresets[0].loadType === LoadType.MOTOR || selectedPresets[0].loadType === LoadType.AIR_CON) && panel.system.includes("3PH"));
    const base: Partial<Circuit> = {
      id: crypto.randomUUID(),
      circuitNo: newNo,
      description: subLoads.map((sl) => sl.description).join(", "),
      wattage: totalVA,
      quantity: 1,
      voltage: panel.voltage,
      phases: is3P ? ["R", "Y", "B"] : ["R"],
      is3PhaseMarker: is3P,
      loadType: selectedPresets[0].loadType as LoadType,
      mcbType: MCBType.BOLT_ON,
      wireType: "THHN",
      conduitType: "PVC",
      subLoads: subLoads,
    };
    const newCircuit = { ...base, ...calculateCircuit(base) } as Circuit;
    setCircuits([...circuits, newCircuit]);
    setShowPresetsModal(false);
    setSelectedPresets([]);
  };

  const handleAmpsUpdate = (id: string, newAmps: number, c: Circuit, is3P: boolean) => {
    const v = c.voltage || getPanelSystemVoltageFallback(panel.system, is3P, panel.connectionType);
    const newVA = Math.round(is3P ? newAmps * v * 1.732 : newAmps * v);
    const qty = c.quantity || 1;
    const pf = c.pf !== undefined ? c.pf : 1.0;
    const newWattage = Math.round((newVA * pf) / qty);
    updateCircuit(id, { loadVA: newVA, wattage: newWattage, motorHP: "" });
  };

  const updateCircuit = (id: string, updates: Partial<Circuit>) => {
    setCircuits((prev) =>
      prev.map((c) => {
        if (c.id === id) {
          const merged = { ...c, ...updates };
          // Trigger recalculation if load parameters OR the circuit breaker itself changes
          if (
            "phases" in updates ||
            "wattage" in updates ||
            "quantity" in updates ||
            "voltage" in updates ||
            "mcbAT" in updates ||
            "loadType" in updates ||
            "pf" in updates ||
            "linkedSubPanelId" in updates ||
            "subPanelReflectionMode" in updates ||
            "subLoads" in updates ||
            "motorHP" in updates
          ) {
            return { ...merged, ...calculateCircuit(merged) } as Circuit;
          }
          return merged;
        }
        return c;
      }),
    );
  };

  const removeCircuit = (id: string) => {
    setCircuits((prev) => {
      const filtered = prev.filter((c) => c.id !== id);
      return filtered.map((c, index) => ({ ...c, circuitNo: index + 1 }));
    });
  };
  const duplicateCircuit = (circuit: Circuit) => {
    const newNo = Math.max(...circuits.map((c) => c.circuitNo)) + 1;
    setCircuits([
      ...circuits,
      { ...circuit, id: crypto.randomUUID(), circuitNo: newNo },
    ]);
  };

  const totalVA = useMemo(
    () => circuits.reduce((sum, c) => sum + c.loadVA, 0),
    [circuits],
  );

  const phaseLoads = useMemo(() => {
    const loads = { R: 0, Y: 0, B: 0 };
    circuits.forEach((c) => {
      if (c.subPanelReflectionMode === 'phase_loads' && c.reflectedPhaseLoads) {
        loads.R += c.reflectedPhaseLoads.R + c.reflectedPhaseLoads.ThreePhase / 3;
        loads.Y += c.reflectedPhaseLoads.Y + c.reflectedPhaseLoads.ThreePhase / 3;
        loads.B += c.reflectedPhaseLoads.B + c.reflectedPhaseLoads.ThreePhase / 3;
      } else {
        c.phases.forEach((p) => {
          loads[p as keyof typeof loads] += c.loadVA / (c.phases.length || 1);
        });
      }
    });
    return loads;
  }, [circuits]);

  const maxPhaseLoad = Math.max(phaseLoads.R, phaseLoads.Y, phaseLoads.B);
  const phaseImbalance =
    panel.system.includes("3PH") && maxPhaseLoad > 0
      ? (1 -
          Math.min(phaseLoads.R, phaseLoads.Y, phaseLoads.B) / maxPhaseLoad) *
        100
      : 0;

  const phaseAmps = useMemo(() => {
    const amps = { R: 0, Y: 0, B: 0, threePhase: 0 };
    circuits.forEach((c) => {
      if (c.subPanelReflectionMode === 'phase_loads' && c.reflectedPhaseAmps) {
        amps.R += c.reflectedPhaseAmps.R;
        amps.Y += c.reflectedPhaseAmps.Y;
        amps.B += c.reflectedPhaseAmps.B;
        amps.threePhase += c.reflectedPhaseAmps.ThreePhase;
      } else if (c.phases.length === 3) {
        amps.threePhase += c.loadA;
      } else {
        if (c.phases.includes("R")) amps.R += c.loadA;
        if (c.phases.includes("Y")) amps.Y += c.loadA;
        if (c.phases.includes("B")) amps.B += c.loadA;
      }
    });
    return amps;
  }, [circuits]);

  const { maxDemandDetails, mainCurrent } = useMemo(() => {
    return computePanelScheduleValues(panel, circuits, { vdCalculations, panelId: panel.designation || "main" });
  }, [circuits, panel, vdCalculations]);

  const mainFeeder = useMemo(() => {
    // The design ampacity correctly incorporates Continuous (125%) + Non-Continuous (100%) + Largest Motor (25%)
    const designAmp = mainCurrent.designAmp;

    // Minimum main breaker sizes are standard, and it must not be less than the maximum branch breaker
    const maxBranchAT = Math.max(0, ...circuits.map((c) => c.mcbAT));
    let calculatedCb =
      STANDARD_CB_RATINGS.find(
        (r) => r * 0.8 >= mainCurrent.baseAmp && r >= Math.max(designAmp, mainCurrent.baseAmp),
      ) || 100;

    if (calculatedCb < maxBranchAT) {
      calculatedCb = STANDARD_CB_RATINGS.find((r) => r >= maxBranchAT) || calculatedCb;
    }

    while (calculatedCb * 0.8 < mainCurrent.baseAmp) {
      const nextSize = STANDARD_CB_RATINGS.find((r) => r > calculatedCb);
      if (!nextSize) break;
      calculatedCb = nextSize;
    }

    let cb = Math.max(
      calculatedCb,
      STANDARD_CB_RATINGS.find((r) => r >= maxBranchAT) || calculatedCb,
      30,
    );

    while (cb * 0.8 < mainCurrent.baseAmp) {
      const nextSize = STANDARD_CB_RATINGS.find((r) => r > cb);
      if (!nextSize) break;
      cb = nextSize;
    }

    const poles = panel.system.includes("3PH") ? 3 : 2;
    // Main feeder wire must be rated for the breaker or the load, whichever is higher
    const wire = getWireForBreaker(cb, designAmp);
    const groundSize = getGroundWireForWireSize(wire.size, cb);
    const selectedMainConduitType = panel.mainConduitType || panel.mainOverrides?.conduitType || "PVC";
    const conduitSize = getConduitSizeForWires(
      wire.size,
      groundSize,
      poles,
      panel.system,
      selectedMainConduitType
    );

    const branchTypeCounts = circuits.reduce(
      (acc, c) => {
        acc[c.mcbType] = (acc[c.mcbType] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
    const sortedBranchTypes = Object.entries(branchTypeCounts).sort(
      (a, b) => Number(b[1]) - Number(a[1]),
    );
    const predominantBranchType = (sortedBranchTypes[0]?.[0] ||
      MCBType.MCB) as MCBType;
    let type = predominantBranchType;
    if (
      cb > 100 &&
      (type === MCBType.PLUG_IN ||
        type === MCBType.BOLT_ON ||
        type === MCBType.MCB)
    ) {
      type = MCBType.MCCB;
    }
    let faultCurrentA = 10000;
    if (iscParams) {
      if (!isSubPanel && !isSubSubPanel) {
        // MDP
        faultCurrentA = calculatePanelFault(panel, iscParams, undefined, undefined, undefined, 0);
      } else if (parentMdpConnection && parentMdpConnection.circuitId) {
        // Sub-panels
        const vd = vdCalculations?.find(v => v.source === parentMdpConnection.circuitId);
        const feederLen = vd?.length || iscParams.feederLength || 10;
        const motorVA = circuits.reduce((acc, curr) => (curr.loadType === LoadType.MOTOR || curr.loadType === LoadType.AIR_CON) ? acc + (curr.loadVA || 0) : acc, 0);
        faultCurrentA = calculatePanelFault(
          panel, 
          iscParams, 
          feederLen, 
          parentMdpConnection.feederSize, 
          parentMdpConnection.feederRuns, 
          motorVA
        );
      }
    }
    
    const defaultKaic = cb > 100 ? 18 : 10;
    let kaic = defaultKaic;
    if (faultCurrentA) {
      const faultKA = faultCurrentA / 1000;
      const KAIC_RATINGS = [10, 14, 18, 22, 25, 30, 35, 42, 50, 65, 85, 100];
      kaic = KAIC_RATINGS.find(k => k >= faultKA) || 100;
    }
    const af =
      cb <= 50 ? 50 : cb <= 100 ? 100 : cb <= 225 ? 225 : cb <= 400 ? 400 : 600;

    let finalCb = cb;
    let finalAf = af;
    let finalType = type;
    let finalKaic = kaic;
    let finalPoles = poles;
    
    let finalWireSize = wire.size;
    let finalWireRuns = wire.runs;
    let finalGroundSize = groundSize;
    let finalConduitSize = conduitSize;
    let finalConduitType = selectedMainConduitType;

    if (panel.mainOverrides?.isOverrideEnabled) {
      if (panel.mainOverrides.breakerAT) finalCb = panel.mainOverrides.breakerAT;
      if (panel.mainOverrides.breakerAF) finalAf = panel.mainOverrides.breakerAF;
      if (panel.mainOverrides.breakerType) finalType = panel.mainOverrides.breakerType as MCBType;
      if (panel.mainOverrides.kaic) finalKaic = panel.mainOverrides.kaic;
      if (panel.mainOverrides.poles) finalPoles = panel.mainOverrides.poles;

      if (panel.mainOverrides.wireSize) finalWireSize = Number(panel.mainOverrides.wireSize);
      if (panel.mainOverrides.wireRuns) finalWireRuns = panel.mainOverrides.wireRuns;
      if (panel.mainOverrides.groundSize) finalGroundSize = panel.mainOverrides.groundSize;
      if (panel.mainOverrides.conduitSize) finalConduitSize = panel.mainOverrides.conduitSize;
      if (panel.mainOverrides.conduitType) finalConduitType = panel.mainOverrides.conduitType;
    }

    const mat = panel.conductorMaterial || "Copper";
    const ins = panel.insulationType || "THHN";
    const temp = (panel.temperatureRating as any) || getTemperatureForInsulation(ins);
    let finalWireAmpacity = getConductorAmpacity(finalWireSize, mat, temp) * finalWireRuns;

    return { 
      wire: { size: finalWireSize, ampacity: finalWireAmpacity, runs: finalWireRuns }, 
      groundSize: finalGroundSize, 
      cb: finalCb, 
      conduitSize: finalConduitSize, 
      conduitType: finalConduitType,
      poles: finalPoles, 
      type: finalType, 
      kaic: finalKaic, 
      af: finalAf,
      raw: {
        wireSize: wire.size,
        cb: cb,
        type: type,
        kaic: kaic,
        designAmp: designAmp,
        faultCurrentA: faultCurrentA
      }
    };
  }, [mainCurrent, circuits, panel, iscParams, isSubPanel, isSubSubPanel, parentMdpConnection, vdCalculations]);

  useEffect(() => {
    if (!circuits || circuits.length === 0) return;
    
    // Evaluate if any branch circuit needs an automatic kAIC upgrade
    const targetKaic = mainFeeder.kaic;
    
    let changed = false;
    const nextCircuits = circuits.map((c) => {
      // Spaces/spares/idle skip check
      if (isIdleSpareOrSpace(c)) return c;
      
      const mcbAT = c.mcbAT || 15;
      const baseCalculated = mcbAT <= 50 ? 10 : mcbAT <= 100 ? 18 : 25;
      const autoCalculated = Math.max(baseCalculated, targetKaic);
      
      const desiredKaic = c.kaicOverride !== undefined ? c.kaicOverride : autoCalculated;
      
      if (c.mcbKAIC !== desiredKaic || c.mcbKAICCalculated !== autoCalculated) {
        changed = true;
        return {
          ...c,
          mcbKAIC: desiredKaic,
          mcbKAICCalculated: autoCalculated
        };
      }
      return c;
    });
    
    if (changed) {
      setCircuits(nextCircuits);
    }
  }, [mainFeeder.kaic, circuits]);

  const panelRows = useMemo(() => {
    const maxCircuitNo = Math.max(...circuits.map((c) => c.circuitNo), 0);
    const rows = [];
    const pLabels = panel.system.includes("3PH")
      ? ["L1", "L2", "L3"]
      : ["L1", "L2"];

    for (let i = 1; i <= Math.max(maxCircuitNo, 2); i += 2) {
      rows.push({
        index: i,
        label: pLabels[((i - 1) / 2) % pLabels.length],
        left: circuits.find((c) => c.circuitNo === i),
        right: circuits.find((c) => c.circuitNo === i + 1),
      });
    }
    return rows;
  }, [circuits, panel.system]);

  React.useEffect(() => {
    if (readOnly) return;
    if (
      panel.mainBreakerAT !== mainFeeder.cb ||
      panel.mainBreakerAF !== mainFeeder.af ||
      panel.icRating !== `${mainFeeder.kaic}kAIC`
    ) {
      setPanel((prev) => ({
        ...prev,
        mainBreakerAT: mainFeeder.cb,
        mainBreakerAF: mainFeeder.af,
        icRating: `${mainFeeder.kaic}kAIC`,
      }));
    }
  }, [
    mainFeeder.cb,
    mainFeeder.af,
    mainFeeder.kaic,
    panel.mainBreakerAT,
    panel.mainBreakerAF,
    panel.icRating,
    setPanel,
  ]);

  return (
    <div className="w-full max-w-full space-y-6">
      {/* Three-Phase Motor FLC Library Manager Panel */}
      {showFLCAdminPanel && (
        <div className="bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-900 rounded-2xl shadow-sm p-6 space-y-4 no-print transition-all">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div>
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                Three-Phase Motor FLC Library (Table 4.30.14.4)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Manage, customize, and add motor Full-Load Current ratings. Overrides are instantly applied to all sizing calculations.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  if (confirm("Are you sure you want to reset the FLC library to standard PEC 2017 Table 4.30.14.4 values? This will overwrite your custom modifications.")) {
                    setLoadingFLC(true);
                    try {
                      await seedThreePhaseFLCBackup();
                      const freshData = await getThreePhaseFLCDatabaseList();
                      setDbThreePhaseFLC(freshData);
                      alert("FLC Library restored to defaults!");
                    } catch (e) {
                      console.error(e);
                      alert("Failed to reset library.");
                    } finally {
                      setLoadingFLC(false);
                    }
                  }
                }}
                className="px-2.5 py-1 text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-950/50 rounded-lg transition-colors cursor-pointer"
              >
                Reset to Standard PEC
              </button>
              <button
                onClick={() => setShowFLCAdminPanel(false)}
                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors cursor-pointer"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
          </div>

          {loadingFLC && (
            <div className="flex items-center justify-center py-10">
              <div className="flex flex-col items-center gap-2">
                <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 font-sans">Syncing with Firestore Library...</span>
              </div>
            </div>
          )}

          {!loadingFLC && (
            <div className="space-y-4 font-sans">
              {/* Add Entry Card */}
              {isAdmin && (
                <div className="bg-emerald-50/40 dark:bg-emerald-950/10 border border-emerald-100 dark:border-emerald-950/30 rounded-xl p-4 space-y-3">
                  <h4 className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider">
                    + Add New Horsepower / FLC Rating
                  </h4>
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const formData = new FormData(e.currentTarget);
                      const hp = formData.get("hp")?.toString().trim();
                      if (!hp) return;
                      const entry: any = {
                        hp,
                        v115: parseFloat(formData.get("v115")?.toString() || "0") || 0,
                        v200: parseFloat(formData.get("v200")?.toString() || "0") || 0,
                        v208: parseFloat(formData.get("v208")?.toString() || "0") || 0,
                        v230: parseFloat(formData.get("v230")?.toString() || "0") || 0,
                        v460: parseFloat(formData.get("v460")?.toString() || "0") || 0,
                        v575: parseFloat(formData.get("v575")?.toString() || "0") || 0,
                      };
                      setLoadingFLC(true);
                      try {
                        await saveThreePhaseFLCEntry(entry);
                        const fresh = await getThreePhaseFLCDatabaseList();
                        setDbThreePhaseFLC(fresh);
                        e.currentTarget.reset();
                      } catch (err) {
                        alert("Error saving entry: " + err);
                      } finally {
                        setLoadingFLC(false);
                      }
                    }}
                    className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3 items-end"
                  >
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-0.5">HP (e.g., "1.25" or "10")</label>
                      <input name="hp" required placeholder="HP" className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-lg text-xs" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-0.5">115V (A)</label>
                      <input name="v115" type="number" step="0.1" defaultValue="0" className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-lg text-xs" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-0.5">200V (A)</label>
                      <input name="v200" type="number" step="0.1" defaultValue="0" className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-lg text-xs" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-0.5">208V (A)</label>
                      <input name="v208" type="number" step="0.1" defaultValue="0" className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-lg text-xs" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-0.5">230V (A)</label>
                      <input name="v230" type="number" step="0.1" defaultValue="0" className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-lg text-xs" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-0.5">460V (A)</label>
                      <input name="v460" type="number" step="0.1" defaultValue="0" className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-lg text-xs" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-0.5">575V (A)</label>
                      <input name="v575" type="number" step="0.1" defaultValue="0" className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-lg text-xs" />
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                      <button type="submit" className="w-full py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg cursor-pointer transition-colors shadow-xs">
                        Add Entry
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Data Table */}
              <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl max-h-[350px] overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 font-bold uppercase tracking-wider sticky top-0">
                    <tr>
                      <th className="px-4 py-2.5">Horsepower (HP)</th>
                      <th className="px-3 py-2.5">115V</th>
                      <th className="px-3 py-2.5">200V</th>
                      <th className="px-3 py-2.5">208V</th>
                      <th className="px-3 py-2.5">230V</th>
                      <th className="px-3 py-2.5">460V</th>
                      <th className="px-3 py-2.5">575V</th>
                      {isAdmin && <th className="px-4 py-2.5 text-right">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                    {(dbThreePhaseFLC.length > 0 ? dbThreePhaseFLC : INITIAL_THREE_PHASE_FLC_DATA)
                      .slice()
                      .sort((a, b) => parseHpToNumber(a.hp) - parseHpToNumber(b.hp))
                      .map((entry) => (
                        <tr key={entry.hp} className="hover:bg-slate-50/55 dark:hover:bg-slate-800/30 transition-colors">
                          <td className="px-4 py-2 font-black text-indigo-600 dark:text-indigo-400">{entry.hp} HP</td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              step="0.1"
                              disabled={!isAdmin}
                              className="w-16 bg-transparent disabled:opacity-90 font-mono focus:outline-none focus:border-b focus:border-indigo-500"
                              value={entry.v115 || 0}
                              onChange={async (e) => {
                                if (!isAdmin) return;
                                const val = parseFloat(e.target.value) || 0;
                                const updated = { ...entry, v115: val };
                                setDbThreePhaseFLC((prev) => prev.map((x) => (x.hp === entry.hp ? updated : x)));
                                await saveThreePhaseFLCEntry(updated);
                              }}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              step="0.1"
                              disabled={!isAdmin}
                              className="w-16 bg-transparent disabled:opacity-90 font-mono focus:outline-none focus:border-b focus:border-indigo-500"
                              value={entry.v200 || 0}
                              onChange={async (e) => {
                                if (!isAdmin) return;
                                const val = parseFloat(e.target.value) || 0;
                                const updated = { ...entry, v200: val };
                                setDbThreePhaseFLC((prev) => prev.map((x) => (x.hp === entry.hp ? updated : x)));
                                await saveThreePhaseFLCEntry(updated);
                              }}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              step="0.1"
                              disabled={!isAdmin}
                              className="w-16 bg-transparent disabled:opacity-90 font-mono focus:outline-none focus:border-b focus:border-indigo-500"
                              value={entry.v208 || 0}
                              onChange={async (e) => {
                                if (!isAdmin) return;
                                const val = parseFloat(e.target.value) || 0;
                                const updated = { ...entry, v208: val };
                                setDbThreePhaseFLC((prev) => prev.map((x) => (x.hp === entry.hp ? updated : x)));
                                await saveThreePhaseFLCEntry(updated);
                              }}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              step="0.1"
                              disabled={!isAdmin}
                              className="w-16 bg-transparent disabled:opacity-90 font-mono focus:outline-none focus:border-b focus:border-indigo-500"
                              value={entry.v230 || 0}
                              onChange={async (e) => {
                                if (!isAdmin) return;
                                const val = parseFloat(e.target.value) || 0;
                                const updated = { ...entry, v230: val };
                                setDbThreePhaseFLC((prev) => prev.map((x) => (x.hp === entry.hp ? updated : x)));
                                await saveThreePhaseFLCEntry(updated);
                              }}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              step="0.1"
                              disabled={!isAdmin}
                              className="w-16 bg-transparent disabled:opacity-90 font-mono focus:outline-none focus:border-b focus:border-indigo-500"
                              value={entry.v460 || 0}
                              onChange={async (e) => {
                                if (!isAdmin) return;
                                const val = parseFloat(e.target.value) || 0;
                                const updated = { ...entry, v460: val };
                                setDbThreePhaseFLC((prev) => prev.map((x) => (x.hp === entry.hp ? updated : x)));
                                await saveThreePhaseFLCEntry(updated);
                              }}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              step="0.1"
                              disabled={!isAdmin}
                              className="w-16 bg-transparent disabled:opacity-90 font-mono focus:outline-none focus:border-b focus:border-indigo-500"
                              value={entry.v575 || 0}
                              onChange={async (e) => {
                                if (!isAdmin) return;
                                const val = parseFloat(e.target.value) || 0;
                                const updated = { ...entry, v575: val };
                                setDbThreePhaseFLC((prev) => prev.map((x) => (x.hp === entry.hp ? updated : x)));
                                await saveThreePhaseFLCEntry(updated);
                              }}
                            />
                          </td>
                          {isAdmin && (
                            <td className="px-4 py-2 text-right">
                              <button
                                type="button"
                                onClick={async () => {
                                  if (confirm(`Remove custom horsepower entry "${entry.hp} HP" from the library?`)) {
                                    setLoadingFLC(true);
                                    try {
                                      await deleteThreePhaseFLCEntry(entry.hp);
                                      const fresh = await getThreePhaseFLCDatabaseList();
                                      setDbThreePhaseFLC(fresh);
                                    } catch (err) {
                                      alert("Error deleting entry: " + err);
                                    } finally {
                                      setLoadingFLC(false);
                                    }
                                  }
                                }}
                                className="text-red-500 hover:text-red-700 p-1 rounded transition-colors"
                                title="Delete Custom Rating"
                              >
                                <Trash2 className="w-4 h-4 cursor-pointer" />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-6 overflow-hidden no-print">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">
              {isSubSubPanel
                ? "Sub-Sub Panel Configuration"
                : isSubPanel
                  ? "Sub-Panel Configuration"
                  : "Panel Board Configuration"}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFLCAdminPanel(!showFLCAdminPanel)}
              className="px-3 py-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100 dark:hover:bg-emerald-950/50 rounded-lg flex items-center gap-1.5 transition-colors border border-emerald-200 dark:border-emerald-800 cursor-pointer shadow-2xs mr-2"
              title="Open Three-Phase Motor Full-Load Current Library (Table 4.30.14.4)"
            >
              <span>{showFLCAdminPanel ? "Hide FLC Library" : "Manage FLC Library"}</span>
            </button>
            {isSubPanel && onDuplicateSubPanel && (
              <button
                onClick={onDuplicateSubPanel}
                className="px-3 py-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/30 hover:bg-indigo-100 dark:hover:bg-indigo-950/50 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                id="btn-duplicate-subpanel"
              >
                <Copy className="w-4 h-4" />
                Duplicate
              </button>
            )}
            {isSubPanel && onRemoveSubPanel && (
              <button
                onClick={onRemoveSubPanel}
                className="px-3 py-1.5 text-xs font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-950/50 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                {isSubSubPanel ? "Remove Sub-Sub Panel" : "Remove Sub-Panel"}
              </button>
            )}
            <button
              onClick={() => {
                if (!isPremium) {
                  if (onRequestUpgrade) onRequestUpgrade();
                  return;
                }
                exportToCAD(
                  panel,
                  circuits,
                  availableSubPanels || [],
                  iscParams || {
                    transformerKVA: 100,
                    transformerZ: 5,
                    transformerVoltage: panel.voltage || 230,
                    primaryVoltage: 34500,
                    transformerConnection: "Delta-Wye (Δ-Y)",
                    utilityShortCircuitMVA: 500,
                    feederLength: 10,
                    feederSize: "30",
                    feederRuns: 1,
                    conductorType: "Copper",
                  },
                  "LOAD_SCHEDULE",
                );
              }}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-all cursor-pointer shadow-xs border ${
                isPremium
                  ? "text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/30 hover:bg-sky-100 dark:hover:bg-sky-950/50 border-sky-300 dark:border-sky-800"
                  : "text-slate-500 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
              }`}
              title={
                isPremium
                  ? "Export complete Board Schedule and calculations to editable AutoCAD DXF/DWG standard blueprint drawing"
                  : "Export AutoCad is available on the Premium Plan"
              }
            >
              <Layers className="w-4 h-4" />
              <span>
                {isPremium ? "Export to AutoCAD" : "AutoCAD Export (Premium)"}
              </span>
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6 mt-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Project Name
            </label>
            <input
              value={panel.project}
              onChange={(e) => setPanel({ ...panel, project: e.target.value })}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-100 transition-colors focus:bg-white dark:focus:bg-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Project Type
            </label>
            <select
              value={panel.projectType || "Residential"}
              onChange={(e) => setPanel({ ...panel, projectType: e.target.value })}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-100 transition-colors focus:bg-white dark:focus:bg-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
            >
              <option value="Residential">Residential</option>
              <option value="Commercial">Commercial</option>
              <option value="Industrial">Industrial</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Owner
            </label>
            <input
              value={panel.owner || ""}
              onChange={(e) => setPanel({ ...panel, owner: e.target.value })}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-100 transition-colors focus:bg-white dark:focus:bg-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Location
            </label>
            <input
              value={panel.location || ""}
              onChange={(e) => setPanel({ ...panel, location: e.target.value })}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-100 transition-colors focus:bg-white dark:focus:bg-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
              placeholder="e.g. Electrical Room"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Designation
            </label>
            <input
              value={panel.designation || ""}
              onChange={(e) =>
                setPanel({ ...panel, designation: e.target.value })
              }
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-100 transition-colors focus:bg-white dark:focus:bg-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
              placeholder="e.g. MDP"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Panel Type
            </label>
            <input
              value={panel.type || ""}
              onChange={(e) => setPanel({ ...panel, type: e.target.value })}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-100 transition-colors focus:bg-white dark:focus:bg-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
              placeholder="e.g. Main Distribution Panel"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Mounting
            </label>
            <input
              value={panel.mounting || ""}
              onChange={(e) => setPanel({ ...panel, mounting: e.target.value })}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-100 transition-colors focus:bg-white dark:focus:bg-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
              placeholder="e.g. Flush Mounted"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Enclosure
            </label>
            <input
              value={panel.enclosure || ""}
              onChange={(e) =>
                setPanel({ ...panel, enclosure: e.target.value })
              }
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-100 transition-colors focus:bg-white dark:focus:bg-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
              placeholder="e.g. NEMA 1"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Primary Voltage (HV)
            </label>
            <div className="flex gap-2">
              <select
                value={isCustomPrimaryVoltage ? "custom" : (transformerPrimaryVoltage || 34500)}
                onChange={(e) => {
                  if (e.target.value === "custom") {
                    setIsCustomPrimaryVoltage(true);
                  } else {
                    setIsCustomPrimaryVoltage(false);
                    if (setTransformerPrimaryVoltage) {
                      setTransformerPrimaryVoltage(Number(e.target.value));
                    }
                  }
                }}
                disabled={isSubPanel || isSubSubPanel}
                className={`px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-100 transition-colors focus:bg-white dark:focus:bg-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none disabled:opacity-50 disabled:cursor-not-allowed ${isCustomPrimaryVoltage ? "w-1/3" : "w-full"}`}
              >
                <option value={13800}>13.8 kV</option>
                <option value={34500}>34.5 kV</option>
                <option value={69000}>69 kV</option>
                <option value={115000}>115 kV</option>
                <option value={230000}>230 kV</option>
                <option value="custom">Custom</option>
              </select>
              {isCustomPrimaryVoltage && (
                <div className="relative w-2/3">
                  <input
                    type="number"
                    value={transformerPrimaryVoltage}
                    onChange={(e) => {
                      if (setTransformerPrimaryVoltage) {
                        setTransformerPrimaryVoltage(Number(e.target.value));
                      }
                    }}
                    disabled={isSubPanel || isSubSubPanel}
                    className="w-full px-3 py-2 pr-8 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-100 transition-colors focus:bg-white dark:focus:bg-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                    placeholder="Voltage (V)"
                  />
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                    <span className="text-slate-400 dark:text-slate-500 text-xs font-bold">V</span>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              System Voltage (LV)
            </label>
            <select
              value={panel.system}
              onChange={(e) => {
                const newSystem = e.target.value as any;
                const is3PH = newSystem.includes("3PH");
                setPanel({
                  ...panel,
                  system: newSystem,
                  voltage:
                    SYSTEM_VOLTAGES[newSystem as keyof typeof SYSTEM_VOLTAGES],
                });
                setCircuits((prevCircuits) =>
                  prevCircuits.map((cir) => {
                    const isAcuOrMotor = cir.loadType === LoadType.MOTOR || cir.loadType === LoadType.AIR_CON;
                    if (isAcuOrMotor) {
                      return {
                        ...cir,
                        phases: is3PH ? ["R", "Y", "B"] : ["R"],
                        is3PhaseMarker: is3PH,
                      };
                    }
                    return cir;
                  })
                );
              }}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-100 transition-colors focus:bg-white dark:focus:bg-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
            >
              <optgroup label="Single-Phase (1PH) Systems" className="bg-white dark:bg-slate-900 text-xs font-bold text-slate-400 dark:text-slate-500">
                {Object.keys(SYSTEM_VOLTAGES)
                  .filter((s) => s.includes("1PH"))
                  .map((s) => (
                    <option key={s} value={s} className="font-normal text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-900">
                      {s}
                    </option>
                  ))}
              </optgroup>
              <optgroup label="Three-Phase, 5-Wire (3PH, 5W) Systems" className="bg-white dark:bg-slate-900 text-xs font-bold text-slate-400 dark:text-slate-500">
                {Object.keys(SYSTEM_VOLTAGES)
                  .filter((s) => s.includes("3PH") && s.includes("5W"))
                  .map((s) => (
                    <option key={s} value={s} className="font-normal text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-900">
                      {s}
                    </option>
                  ))}
              </optgroup>
              <optgroup label="Three-Phase, 4-Wire (3PH, 4W) Systems" className="bg-white dark:bg-slate-900 text-xs font-bold text-slate-400 dark:text-slate-500">
                {Object.keys(SYSTEM_VOLTAGES)
                  .filter((s) => s.includes("3PH") && s.includes("4W"))
                  .map((s) => (
                    <option key={s} value={s} className="font-normal text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-900">
                      {s}
                    </option>
                  ))}
              </optgroup>
              <optgroup label="Three-Phase, 3-Wire (3PH, 3W) Systems" className="bg-white dark:bg-slate-900 text-xs font-bold text-slate-400 dark:text-slate-500">
                {Object.keys(SYSTEM_VOLTAGES)
                  .filter((s) => s.includes("3PH") && s.includes("3W"))
                  .map((s) => (
                    <option key={s} value={s} className="font-normal text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-900">
                      {s}
                    </option>
                  ))}
              </optgroup>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Transformer Connection
            </label>
            <select
              value={panel.transformerConnection || "Delta-Wye (Δ-Y)"}
              onChange={(e) =>
                setPanel({ ...panel, transformerConnection: e.target.value })
              }
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-100 transition-colors focus:bg-white dark:focus:bg-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
            >
              <option
                value="Wye (Star) Connection"
                className="dark:bg-slate-900 dark:text-slate-100"
              >
                Wye (Star) Connection
              </option>
              <option
                value="Delta Connection"
                className="dark:bg-slate-900 dark:text-slate-100"
              >
                Delta Connection
              </option>
              <option
                value="Delta-Wye (Δ-Y)"
                className="dark:bg-slate-900 dark:text-slate-100"
              >
                Delta-Wye (Δ-Y)
              </option>
              <option
                value="Wye-Delta (Y-Δ)"
                className="dark:bg-slate-900 dark:text-slate-100"
              >
                Wye-Delta (Y-Δ)
              </option>
              <option
                value="Delta-Delta (Δ-Δ)"
                className="dark:bg-slate-900 dark:text-slate-100"
              >
                Delta-Delta (Δ-Δ)
              </option>
              <option
                value="Wye-Wye (Y-Y)"
                className="dark:bg-slate-900 dark:text-slate-100"
              >
                Wye-Wye (Y-Y)
              </option>
              <option
                value="Open Delta (V-V)"
                className="dark:bg-slate-900 dark:text-slate-100"
              >
                Open Delta (V-V)
              </option>
              <option
                value="Open Wye-Open Delta"
                className="dark:bg-slate-900 dark:text-slate-100"
              >
                Open Wye-Open Delta
              </option>
              <option
                value="Single-Phase Transformer"
                className="dark:bg-slate-900 dark:text-slate-100"
              >
                Single-Phase Transformer
              </option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Connection (Sub-Circuits)
            </label>
            <select
              value={panel.connectionType || "Line-to-Line"}
              onChange={(e) =>
                setPanel({ ...panel, connectionType: e.target.value as any })
              }
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-100 transition-colors focus:bg-white dark:focus:bg-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
            >
              <option
                value="Line-to-Line"
                className="dark:bg-slate-900 dark:text-slate-100"
              >
                Line-to-Line
              </option>
              <option
                value="Line-to-Neutral"
                className="dark:bg-slate-900 dark:text-slate-100"
              >
                Line-to-Neutral
              </option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Conductor Material
            </label>
            <select
              value={panel.conductorMaterial || "Copper"}
              onChange={(e) =>
                setPanel({ ...panel, conductorMaterial: e.target.value as any })
              }
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-100 transition-colors focus:bg-white dark:focus:bg-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
            >
              <option value="Copper" className="dark:bg-slate-900 dark:text-slate-100">Copper (Cu)</option>
              <option value="Aluminum" className="dark:bg-slate-900 dark:text-slate-100">Aluminum (Al)</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Insulation Type
            </label>
            <select
              value={panel.insulationType || "THHN"}
              onChange={(e) => {
                const insulation = e.target.value;
                const autoTemp = getTemperatureForInsulation(insulation);
                setPanel({
                  ...panel,
                  insulationType: insulation,
                  temperatureRating: autoTemp
                });
              }}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-100 transition-colors focus:bg-white dark:focus:bg-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
            >
              <optgroup label="60°C Insulation Rated" className="dark:bg-slate-900 font-semibold text-slate-500">
                <option value="TW">TW</option>
                <option value="UF">UF</option>
              </optgroup>
              <optgroup label="75°C Insulation Rated" className="dark:bg-slate-900 font-semibold text-slate-500">
                <option value="RHW">RHW</option>
                <option value="THHW">THHW</option>
                <option value="THW">THW</option>
                <option value="THWN">THWN</option>
                <option value="XHHW">XHHW</option>
                <option value="USE">USE</option>
                <option value="ZW">ZW</option>
              </optgroup>
              <optgroup label="90°C Insulation Rated" className="dark:bg-slate-900 font-semibold text-slate-500">
                <option value="THHN">THHN</option>
                <option value="THWN-2">THWN-2</option>
                <option value="THW-2">THW-2</option>
                <option value="THHW-2">THHW-2</option>
                <option value="XHHW-2">XHHW-2</option>
                <option value="RHW-2">RHW-2</option>
                <option value="USE-2">USE-2</option>
                <option value="TBS">TBS</option>
                <option value="SA">SA</option>
                <option value="SIS">SIS</option>
                <option value="FEP">FEP</option>
                <option value="FEPB">FEPB</option>
                <option value="MI">MI</option>
                <option value="RHH">RHH</option>
                <option value="XHH">XHH</option>
                <option value="ZW-2">ZW-2</option>
              </optgroup>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Temperature Column
            </label>
            <select
              value={panel.temperatureRating || ""}
              onChange={(e) => {
                const val = e.target.value;
                setPanel({
                  ...panel,
                  temperatureRating: val ? (Number(val) as any) : undefined
                });
              }}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-100 transition-colors focus:bg-white dark:focus:bg-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
            >
              <option value="" className="dark:bg-slate-900 dark:text-slate-100">
                Auto ({getTemperatureForInsulation(panel.insulationType || "THHN")}°C)
              </option>
              <option value="60" className="dark:bg-slate-900 dark:text-slate-100">60°C</option>
              <option value="75" className="dark:bg-slate-900 dark:text-slate-100">75°C</option>
              <option value="90" className="dark:bg-slate-900 dark:text-slate-100">90°C</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Main Conduit Type
            </label>
            <select
              value={panel.mainConduitType || "PVC"}
              onChange={(e) => {
                setPanel({
                  ...panel,
                  mainConduitType: e.target.value,
                });
              }}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-100 transition-colors focus:bg-white dark:focus:bg-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
            >
              <option value="PVC">PVC (Thick-wall S40)</option>
              <option value="EMT">EMT (Electrical Metallic Tubing)</option>
              <option value="IMC">IMC (Intermediate Metal Conduit)</option>
              <option value="RSC">RSC (Rigid Steel Conduit)</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Table Font Size ({tableFontSize}px)
            </label>
            <div className="flex items-center h-10 px-2 mt-1">
              <input
                type="range"
                min="8"
                max="16"
                step="0.5"
                value={tableFontSize}
                onChange={(e) => setTableFontSize(parseFloat(e.target.value))}
                className="w-full accent-indigo-600"
              />
            </div>
          </div>
        </div>

        {/* --- MANAUL OVERRIDES SECTION --- */}
        <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-500" />
                Engineering Overrides
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Manually override system-calculated values. The system will retain these values but mark them as user-defined.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                className="sr-only peer" 
                checked={panel.mainOverrides?.isOverrideEnabled || false}
                onChange={(e) => {
                  setPanel(prev => ({
                    ...prev,
                    mainOverrides: {
                      ...(prev.mainOverrides || {}),
                      isOverrideEnabled: e.target.checked
                    }
                  }));
                }}
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 dark:peer-focus:ring-indigo-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-amber-500"></div>
              <span className="ml-3 text-sm font-medium text-slate-700 dark:text-slate-300">Enable Overrides</span>
            </label>
          </div>

          {panel.mainOverrides?.isOverrideEnabled && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 p-4 bg-amber-50 dark:bg-amber-950/20 rounded-xl border border-amber-200 dark:border-amber-900/50">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-amber-800 dark:text-amber-500 uppercase tracking-wider">
                  Main Breaker Rating (AT)
                </label>
                <select
                  value={panel.mainOverrides.breakerAT || ""}
                  onChange={(e) => setPanel(prev => ({
                    ...prev,
                    mainOverrides: {
                      ...prev.mainOverrides,
                      breakerAT: e.target.value ? Number(e.target.value) : undefined,
                      isOverrideEnabled: true
                    }
                  }))}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-amber-200 dark:border-amber-900/50 rounded-lg text-sm text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-amber-500/20 outline-none"
                >
                  <option value="">Auto ({mainFeeder.raw.cb} AT)</option>
                  {STANDARD_CB_RATINGS.map(r => (
                    <option key={r} value={r}>{r} AT</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-amber-800 dark:text-amber-500 uppercase tracking-wider">
                  Main Feeder Size (mm²)
                </label>
                <div className="flex gap-2">
                  <select
                    value={panel.mainOverrides.wireRuns || ""}
                    onChange={(e) => setPanel(prev => ({
                      ...prev,
                      mainOverrides: {
                        ...prev.mainOverrides,
                        wireRuns: e.target.value ? Number(e.target.value) : undefined,
                        isOverrideEnabled: true
                      }
                    }))}
                    className="w-1/3 px-3 py-2 bg-white dark:bg-slate-800 border border-amber-200 dark:border-amber-900/50 rounded-lg text-sm text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-amber-500/20 outline-none"
                  >
                    <option value="">Auto ({mainFeeder.wire.runs > 1 ? `${mainFeeder.wire.runs}x` : '1x'})</option>
                    {[1, 2, 3, 4, 5, 6, 7, 8].map(r => (
                      <option key={r} value={r}>{r}x Sets</option>
                    ))}
                  </select>
                  <select
                    value={panel.mainOverrides.wireSize || ""}
                    onChange={(e) => setPanel(prev => ({
                      ...prev,
                      mainOverrides: {
                        ...prev.mainOverrides,
                        wireSize: e.target.value ? Number(e.target.value) : undefined,
                        isOverrideEnabled: true
                      }
                    }))}
                    className="w-2/3 px-3 py-2 bg-white dark:bg-slate-800 border border-amber-200 dark:border-amber-900/50 rounded-lg text-sm text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-amber-500/20 outline-none"
                  >
                    <option value="">Auto ({formatWireSize(mainFeeder.raw.wireSize)})</option>
                    {PEC_AMPACITY_TABLE.map(w => (
                      <option key={w.size} value={w.size}>{formatWireSize(w.size)} mm²</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-amber-800 dark:text-amber-500 uppercase tracking-wider">
                  Main Breaker Type
                </label>
                <select
                  value={panel.mainOverrides.breakerType || ""}
                  onChange={(e) => setPanel(prev => ({
                    ...prev,
                    mainOverrides: {
                      ...prev.mainOverrides,
                      breakerType: e.target.value || undefined,
                      isOverrideEnabled: true
                    }
                  }))}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-amber-200 dark:border-amber-900/50 rounded-lg text-sm text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-amber-500/20 outline-none"
                >
                  <option value="">Auto ({mainFeeder.raw.type})</option>
                  {Object.values(MCBType).map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-amber-800 dark:text-amber-500 uppercase tracking-wider">
                  Interrupting Capacity
                </label>
                <select
                  value={panel.mainOverrides.kaic || ""}
                  onChange={(e) => setPanel(prev => ({
                    ...prev,
                    mainOverrides: {
                      ...prev.mainOverrides,
                      kaic: e.target.value ? Number(e.target.value) : undefined,
                      isOverrideEnabled: true
                    }
                  }))}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-amber-200 dark:border-amber-900/50 rounded-lg text-sm text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-amber-500/20 outline-none"
                >
                  <option value="">Auto ({mainFeeder.raw.kaic} kAIC)</option>
                  {[5, 10, 14, 18, 22, 25, 30, 35, 42, 50, 65, 85, 100].map(k => (
                    <option key={k} value={k}>{k} kAIC</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-amber-800 dark:text-amber-500 uppercase tracking-wider">
                  Main Conduit Type
                </label>
                <select
                  value={panel.mainOverrides.conduitType || ""}
                  onChange={(e) => setPanel(prev => ({
                    ...prev,
                    mainOverrides: {
                      ...prev.mainOverrides,
                      conduitType: e.target.value || undefined,
                      isOverrideEnabled: true
                    }
                  }))}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-amber-200 dark:border-amber-900/50 rounded-lg text-sm text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-amber-500/20 outline-none"
                >
                  <option value="">Auto ({panel.mainConduitType || "PVC"})</option>
                  <option value="PVC">PVC</option>
                  <option value="EMT">EMT</option>
                  <option value="IMC">IMC</option>
                  <option value="RSC">RSC</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-amber-800 dark:text-amber-500 uppercase tracking-wider">
                  Main Conduit Size
                </label>
                <select
                  value={panel.mainOverrides.conduitSize || ""}
                  onChange={(e) => setPanel(prev => ({
                    ...prev,
                    mainOverrides: {
                      ...prev.mainOverrides,
                      conduitSize: e.target.value || undefined,
                      isOverrideEnabled: true
                    }
                  }))}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-amber-200 dark:border-amber-900/50 rounded-lg text-sm text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-amber-500/20 outline-none"
                >
                  <option value="">Auto ({mainFeeder.conduitSize})</option>
                  {CONDUIT_SIZES.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Centralized PEC 2017 Compliance checklist / warnings block */}
          <div className="mt-4 p-4 rounded-xl border bg-slate-50 dark:bg-slate-900/30 border-slate-200 dark:border-slate-800 space-y-3">
            <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <span>PEC 2017 Cable & Conductor Diagnostics</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="space-y-1 bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-100 dark:border-slate-800">
                <span className="text-slate-400 font-medium">Selected Assembly</span>
                <p className="font-bold text-slate-800 dark:text-slate-200">
                  {mainFeeder.wire.runs > 1 ? `${mainFeeder.wire.runs}x parallel runs of ` : ""}
                  {formatWireSize(mainFeeder.wire.size)} mm² {panel.insulationType || "THHN"} ({panel.conductorMaterial || "Copper"})
                </p>
                <div className="flex justify-between mt-1 pt-1 border-t border-slate-100 dark:border-slate-800/50 text-slate-500">
                  <span>PEC Allowable Ampacity:</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">{mainFeeder.wire.ampacity} A</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Temperature Column:</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">{panel.temperatureRating || getTemperatureForInsulation(panel.insulationType || "THHN")}°C</span>
                </div>
              </div>

              <div className="space-y-2 bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-100 dark:border-slate-800">
                <span className="text-slate-400 font-medium">Required Benchmarks</span>
                <div className="space-y-1.5 text-slate-600 dark:text-slate-400">
                  <div className="flex items-center justify-between">
                    <span>Design Load ({mainFeeder.raw.designAmp?.toFixed(1)} A):</span>
                    {mainFeeder.wire.ampacity >= mainFeeder.raw.designAmp ? (
                      <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400 font-bold">PASSED</span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] bg-rose-50 text-rose-700 dark:bg-rose-950/20 dark:text-rose-400 font-bold">UNDERSIZED</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Breaker AT Limit ({mainFeeder.cb} A):</span>
                    {mainFeeder.wire.ampacity >= mainFeeder.cb ? (
                      <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400 font-bold">PASSED</span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] bg-rose-50 text-rose-700 dark:bg-rose-950/20 dark:text-rose-400 font-bold">FAIL (AT PROTECTION)</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span>kAIC Interruption ({mainFeeder.kaic} kA):</span>
                    {mainFeeder.kaic >= (mainFeeder.raw.faultCurrentA || 0) / 1000 ? (
                      <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400 font-bold">PASSED</span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] bg-rose-50 text-rose-700 dark:bg-rose-950/20 dark:text-rose-400 font-bold">INSUFFICIENT kAIC</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Warn user with detailed explanations and suggestions */}
            {mainFeeder.kaic < (mainFeeder.raw.faultCurrentA || 0) / 1000 && (
              <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-lg flex items-start gap-2.5 text-red-800 dark:text-red-400 text-xs text-left">
                <span className="font-extrabold text-base leading-none">🚨</span>
                <div>
                  <p className="font-bold">CRITICAL SHORT CIRCUIT RISK: Insufficient kAIC Rating</p>
                  <p className="mt-0.5 opacity-90">
                    The chosen or overridden short circuit capability (<strong>{mainFeeder.kaic} kAIC</strong>) is LESS than the calculated available fault current of <strong>{((mainFeeder.raw.faultCurrentA || 0) / 1000).toFixed(2)} kA</strong> at this node. This poses a severe failure risk under short circuit conditions.
                    Ensure the main breaker's interrupting rating is correctly verified.
                  </p>
                </div>
              </div>
            )}

            {mainFeeder.wire.ampacity < mainFeeder.raw.designAmp && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/50 rounded-lg flex items-start gap-2.5 text-rose-800 dark:text-rose-400 text-xs text-left">
                <span className="font-extrabold text-base leading-none">⚠️</span>
                <div>
                  <p className="font-bold">CONFORMANCE WARNING: Conductor Ampacity is Insufficient</p>
                  <p className="mt-0.5 opacity-90">
                    The chosen conductor assembly has a combined allowable ampacity of <strong>{mainFeeder.wire.ampacity} A</strong> under PEC 2017 Table 3.10.2.6(B)(16), which is less than the calculated peak design loads of <strong>{mainFeeder.raw.designAmp?.toFixed(1)} A</strong>.
                    Please select a larger conductor size or increase parallel runs.
                  </p>
                </div>
              </div>
            )}

            {mainFeeder.wire.ampacity >= mainFeeder.raw.designAmp && mainFeeder.wire.ampacity < mainFeeder.cb && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/20 border border-rose-105 dark:border-rose-900/50 rounded-lg flex items-start gap-2.5 text-rose-800 dark:text-rose-400 text-xs text-left">
                <span className="font-extrabold text-base leading-none">⚠️</span>
                <div>
                  <p className="font-bold">PEC 2017 CODE COMPLIANCE EXCEPTION: Overcurrent Setting Mismatch</p>
                  <p className="mt-0.5 opacity-90">
                    Although the conductor matches raw continuous load requirements, the overcurrent protective device rating (<strong>{mainFeeder.cb} AT</strong>) exceeds the conductor ampacity of <strong>{mainFeeder.wire.ampacity} A</strong>. Under PEC 2.40 rule series, wire ampacity must safely match or exceed the overcurrent setting.
                  </p>
                </div>
              </div>
            )}

            {mainFeeder.wire.ampacity >= mainFeeder.raw.designAmp && mainFeeder.wire.ampacity >= mainFeeder.cb && (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/10 border border-emerald-100 dark:border-emerald-900/20 rounded-lg flex items-start gap-2.5 text-emerald-800 dark:text-emerald-400 text-xs text-left">
                <span className="font-extrabold text-base leading-none">✓</span>
                <div>
                  <p className="font-bold">PEC 2017 COMPLIANT</p>
                  <p className="mt-0.5 opacity-90">
                    Sized accurately per PEC Table 3.10.2.6(B)(16) at ambient temperature 30°C in raceway. Safety boundaries validated green.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden panel-container print:rounded-none">
        <div className="p-8 border-b-2 border-slate-100 dark:border-slate-800 flex flex-col md:flex-row justify-between gap-8 bg-slate-50/50 dark:bg-slate-900/50 print:bg-white print:py-4">
          <div className="flex items-start gap-4">
            <div className="no-print p-3 bg-indigo-600 rounded-lg">
              <FileText className="w-6 h-6 text-white" />
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-3xl font-black text-slate-900 dark:text-slate-100 uppercase tracking-tighter print:text-xl">
                  Panel Board Schedule
                </h3>
                {isSubPanel && parentMdpConnection && (
                  <div className="flex items-center gap-1.5 px-3 py-1 text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/40 rounded-xl no-print">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span>Linked to {parentMdpConnection.mdpDesignation} (Circuit {parentMdpConnection.circuitNo}: {parentMdpConnection.description})</span>
                  </div>
                )}
                {isSubPanel && !parentMdpConnection && (
                  <div className="flex items-center gap-1.5 px-3 py-1 text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-250 dark:border-amber-900/40 rounded-xl no-print">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                    <span>{isSubSubPanel ? "Independent Sub-Sub Panel (Not Connected)" : "Independent Sub-Panel (Not Connected to MDP)"}</span>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-2 text-sm font-medium mt-3">
                <div className="flex flex-col">
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold tracking-wider">
                    PROJECT
                  </span>
                  <span className="text-slate-900 dark:text-slate-200 uppercase font-bold">
                    {panel.project}
                  </span>
                </div>
                {panel.projectType && (
                  <div className="flex flex-col">
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold tracking-wider">
                      PROJECT TYPE
                    </span>
                    <span className="text-slate-900 dark:text-slate-200 uppercase font-bold">
                      {panel.projectType}
                    </span>
                  </div>
                )}
                {panel.owner && (
                  <div className="flex flex-col">
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold tracking-wider">
                      OWNER
                    </span>
                    <span className="text-slate-900 dark:text-slate-200 uppercase font-bold">
                      {panel.owner}
                    </span>
                  </div>
                )}
                <div className="flex flex-col">
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold tracking-wider">
                    LOCATION
                  </span>
                  <span className="text-slate-900 dark:text-slate-200 uppercase font-bold">
                    {panel.location}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold tracking-wider">
                    DESIGNATION
                  </span>
                  <span className="text-slate-900 dark:text-slate-200 uppercase font-bold">
                    {panel.designation}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold tracking-wider">
                    SYSTEM VOLTAGE
                  </span>
                  <span className="text-slate-900 dark:text-slate-200 uppercase font-bold">
                    {panel.system}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold tracking-wider">
                    PANEL TYPE
                  </span>
                  <span className="text-slate-900 dark:text-slate-200 uppercase font-bold">
                    {panel.type}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold tracking-wider">
                    MOUNTING
                  </span>
                  <span className="text-slate-900 dark:text-slate-200 uppercase font-bold">
                    {panel.mounting}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold tracking-wider">
                    ENCLOSURE
                  </span>
                  <span className="text-slate-900 dark:text-slate-200 uppercase font-bold">
                    {panel.enclosure}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto print:overflow-visible bg-slate-50/30 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800">
          <table className="w-full border-collapse text-sm table-auto print:!w-full whitespace-nowrap">
            <thead className="bg-slate-900 text-white print:bg-slate-200 print:text-slate-900">
              <tr>
                {["NO.", "DESCRIPTION", "W", "QTY", "VA", "PHASE"].map(
                  (header) => (
                    <th
                      key={header}
                      rowSpan={panel.system.includes("3PH") ? 2 : 1}
                      style={{ fontSize: tableFontSize - 1 }}
                      className={`px-2 py-3 border border-slate-700 transition-colors ${header === "DESCRIPTION" ? "text-left w-full max-w-[300px]" : "text-center"}`}
                    >
                      {header}
                    </th>
                  ),
                )}

                {panel.system.includes("3PH") ? (
                  <th
                    colSpan={4}
                    className="px-2 border border-slate-700 text-center transition-colors"
                    style={{ fontSize: tableFontSize - 1 }}
                  >
                    AMPS
                  </th>
                ) : (
                  <th
                    className="px-2 py-3 border border-slate-700 text-center transition-colors"
                    style={{ fontSize: tableFontSize - 1 }}
                  >
                    AMPS
                  </th>
                )}

                {[
                  "AT",
                  "AF",
                  "P",
                  "KAIC",
                  "TYPE",
                  "WIRE / GND / CONDUIT",
                  "ACTIONS",
                ].map((header) => (
                  <th
                    key={header}
                    rowSpan={panel.system.includes("3PH") ? 2 : 1}
                    style={{ fontSize: tableFontSize - 1 }}
                    className={`px-2 py-3 border border-slate-700 transition-colors text-center ${header === "ACTIONS" ? "no-print border-slate-400" : ""}`}
                  >
                    {header}
                  </th>
                ))}
              </tr>
              {panel.system.includes("3PH") && (
                <tr>
                  {panel.connectionType === "Line-to-Neutral" ? (
                    <>
                      <th
                        className="px-1 py-1 border border-slate-700 text-center text-red-500 print:text-slate-900"
                        style={{ fontSize: tableFontSize - 2 }}
                      >
                        AN
                      </th>
                      <th
                        className="px-1 py-1 border border-slate-700 text-center text-yellow-500 print:text-slate-900"
                        style={{ fontSize: tableFontSize - 2 }}
                      >
                        BN
                      </th>
                      <th
                        className="px-1 py-1 border border-slate-700 text-center text-blue-500 print:text-slate-900"
                        style={{ fontSize: tableFontSize - 2 }}
                      >
                        CN
                      </th>
                    </>
                  ) : (
                    <>
                      <th
                        className="px-1 py-1 border border-slate-700 text-center text-red-500 print:text-slate-900"
                        style={{ fontSize: tableFontSize - 2 }}
                      >
                        AB
                      </th>
                      <th
                        className="px-1 py-1 border border-slate-700 text-center text-yellow-500 print:text-slate-900"
                        style={{ fontSize: tableFontSize - 2 }}
                      >
                        BC
                      </th>
                      <th
                        className="px-1 py-1 border border-slate-700 text-center text-blue-500 print:text-slate-900"
                        style={{ fontSize: tableFontSize - 2 }}
                      >
                        CA
                      </th>
                    </>
                  )}
                  <th
                    className="px-1 py-1 border border-slate-700 text-center text-indigo-500 print:text-slate-900"
                    style={{ fontSize: tableFontSize - 2 }}
                  >
                    3Ø
                  </th>
                </tr>
              )}
            </thead>
            <tbody>
              {circuits.map((c, idx) => {
                const isSpace =
                  c.description?.toUpperCase() === "SPACE" ||
                  c.loadType === LoadType.SPACE;

                return (
                  <tr
                    key={c.id}
                    style={{ fontSize: tableFontSize }}
                    className={`${idx % 2 === 1 ? "bg-slate-50/50 dark:bg-slate-800/50" : "bg-white dark:bg-slate-900"} hover:bg-indigo-50/30 dark:hover:bg-indigo-950/20 group print:bg-white border-b border-slate-100 dark:border-slate-800 text-slate-800 dark:text-slate-100`}
                  >
                    <td className="px-1 py-3 text-center font-bold text-indigo-600 truncate">
                      {c.circuitNo}
                    </td>
                    <td className="px-2 py-3 overflow-hidden align-top">
                      <div className="flex items-start gap-1 min-w-0 mt-1">
                        <select
                          value={c.loadType}
                          onChange={(e) => {
                            const nextType = e.target.value as LoadType;
                            let fallbackSubId = c.linkedSubPanelId;
                            if (
                              (nextType === LoadType.SUB_PANEL || nextType === LoadType.SUB_SUB_PANEL) &&
                              !fallbackSubId &&
                              availableSubPanels?.length
                            ) {
                              const existingSubCount = circuits.filter(
                                (circ) =>
                                  circ.loadType === nextType &&
                                  circ.id !== c.id,
                              ).length;
                              const targetIndex = Math.min(
                                existingSubCount,
                                availableSubPanels.length - 1,
                              );
                              fallbackSubId =
                                availableSubPanels[targetIndex].id;
                            }
                            const updates: Partial<Circuit> = {
                              loadType: nextType,
                              linkedSubPanelId: fallbackSubId,
                            };
                            if (nextType === LoadType.MOTOR && panel.system.includes("3PH")) {
                              updates.phases = ["R", "Y", "B"];
                            }
                            updateCircuit(c.id, updates);
                          }}
                          className="p-0.5 bg-slate-100 dark:bg-slate-800 border-0 rounded uppercase font-black no-print shrink-0 text-slate-800 dark:text-slate-100"
                          style={{ fontSize: tableFontSize - 3 }}
                        >
                          {Object.keys(DESCRIPTION_CODES)
                            .filter((code) => {
                              // Any panel can connect to a child panel (SUB). We don't restrict depth anymore.
                              // But we'll hide "SUBSUB" type since "SUB" covers all child panels now.
                              return code !== "SUBSUB";
                            })
                            .map((code) => (
                            <option
                              key={code}
                              value={code}
                              className="dark:bg-slate-900 dark:text-slate-100"
                            >
                              {code}
                            </option>
                          ))}
                        </select>
                        {c.loadType === LoadType.SUB_PANEL || c.loadType === LoadType.SUB_SUB_PANEL ? (
                          <div className="flex-1 flex flex-col gap-1 min-w-0">
                            <select
                              value={c.linkedSubPanelId || ""}
                              onChange={(e) =>
                                updateCircuit(c.id, {
                                  linkedSubPanelId: e.target.value,
                                })
                              }
                              className="flex-1 bg-transparent dark:bg-slate-900 font-medium min-w-0 truncate text-slate-800 dark:text-slate-100"
                            >
                              <option
                                value=""
                                disabled
                                className="dark:bg-slate-900 dark:text-slate-100"
                              >
                                Select {c.loadType === LoadType.SUB_SUB_PANEL ? "Sub-Sub Panel" : "Sub-Panel"}
                              </option>
                              {availableSubPanels?.map((sp) => (
                                <option
                                  key={sp.id}
                                  value={sp.id}
                                  className="dark:bg-slate-900 dark:text-slate-100"
                                >
                                  {sp.panel.designation || (c.loadType === LoadType.SUB_SUB_PANEL ? "Unnamed Sub-Sub Panel" : "Unnamed Sub-Panel")}
                                </option>
                              ))}
                            </select>

                             {panel.system.includes("3PH") && c.linkedSubPanelId && (
                               <select
                                 value={c.subPanelReflectionMode || "max_demand"}
                                 onChange={(e) => updateCircuit(c.id, { subPanelReflectionMode: e.target.value as 'max_demand' | 'phase_loads' })}
                                 className="mt-1 p-1 text-[10px] bg-slate-100 dark:bg-slate-800 border-0 rounded font-bold text-slate-700 dark:text-slate-300 w-full no-print"
                               >
                                 <option value="max_demand">Reflect Max Demand Current</option>
                                 <option value="phase_loads">Reflect Phase Loads Directly</option>
                               </select>
                             )}

                             {/* Connection Sync & Discrepancy Warnings */}
                             {c.linkedSubPanelId ? (() => {
                               const sp = availableSubPanels?.find(s => s.id === c.linkedSubPanelId);
                               if (sp) {
                                 const validation = validateSubPanelConnection(
                                   panel.system,
                                   sp.panel.system,
                                   sp.panel.voltage || 230
                                 );

                                 const isInvalidConnection = !validation.isValid;
                                 const providedVoltage = validation.providedVoltage || null;
                                 const isVoltageIncompatible = !validation.isValid;
                                 const isVoltageMismatch = !isInvalidConnection && c.voltage !== sp.panel.voltage;

                                 const { totalVA: subTotalVA, mainFeeder: subMainFeeder } = computePanelScheduleValues(sp.panel, sp.circuits, { vdCalculations, panelId: sp.id });
                                 const isDesignationMismatch = c.description !== (sp.panel.designation || (c.loadType === LoadType.SUB_SUB_PANEL ? "Sub-Sub Panel" : "Sub-Panel"));
                                 const isBreakerMismatch = c.mcbAT !== subMainFeeder.cb;
                                 const isWireSizeMismatch = c.wireSize !== formatWireSizeLocal(subMainFeeder.wire.size);

                                 if (isInvalidConnection || isVoltageIncompatible) {
                                   return (
                                     <div className="flex flex-col gap-1 mt-1 no-print">
                                       <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider font-extrabold text-rose-600 dark:text-rose-450 bg-rose-50 dark:bg-rose-950/30 px-2 py-0.5 rounded border border-rose-200 dark:border-rose-950/50 w-fit">
                                         <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                                         <span>Invalid Connection</span>
                                       </div>
                                       <span className="text-[8px] text-rose-500 font-semibold pl-1 leading-tight max-w-xs">
                                         {validation.reason || `Parent system (${panel.system}) cannot derive the required sub-panel voltage.`}
                                       </span>
                                     </div>
                                   );
                                 }

                                 if (isVoltageMismatch || isDesignationMismatch || isBreakerMismatch || isWireSizeMismatch) {
                                   const reasons = [];
                                   if (isVoltageMismatch) reasons.push("Voltage Mismatch");
                                   if (isDesignationMismatch) reasons.push("Name Mismatch");
                                   if (isBreakerMismatch) reasons.push(`Breaker Mismatch (${c.mcbAT}AT vs ${subMainFeeder.cb}AT)`);
                                   if (isWireSizeMismatch) reasons.push(`Wire size Mismatch (${c.wireSize} vs ${formatWireSizeLocal(subMainFeeder.wire.size)} mm²)`);
                                   
                                   return (
                                     <div className="flex flex-col gap-1 mt-1 no-print">
                                       <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider font-extrabold text-rose-600 dark:text-rose-450 bg-rose-50 dark:bg-rose-950/30 px-2 py-0.5 rounded border border-rose-200 dark:border-rose-950/50 w-fit">
                                         <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                                         <span>Discrepancy: Mismatch!</span>
                                       </div>
                                       <span className="text-[8px] text-rose-500 font-semibold pl-1 leading-tight max-w-xs">{reasons.join(", ")}</span>
                                     </div>
                                   );
                                 }
                                 return (
                                   <div className="flex items-center gap-1 mt-1 text-[9px] uppercase tracking-wider font-extrabold text-emerald-600 dark:text-emerald-450 bg-emerald-50 dark:bg-emerald-950/30 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-950/50 w-fit no-print">
                                     <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                     <span>Sync Active</span>
                                   </div>
                                 );
                               }
                               return (
                                 <div className="flex items-center gap-1 mt-1 text-[9px] uppercase tracking-wider font-extrabold text-rose-500 dark:text-rose-450 bg-rose-50 dark:bg-rose-950/20 px-2 py-0.5 rounded border border-rose-200 dark:border-rose-900/40 w-fit no-print">
                                   <span>Sub-Panel Board Deleted or Lost</span>
                                 </div>
                               );
                             })() : (
                              <div className="flex items-center gap-1 mt-1 text-[9px] uppercase tracking-wider font-extrabold text-amber-600 dark:text-amber-450 bg-amber-50 dark:bg-amber-950/30 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-950/50 w-fit no-print">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                <span>Pending connection</span>
                              </div>
                            )}
                          </div>
                        ) : c.subLoads && c.subLoads.length > 0 ? (
                          <div className="flex-1 flex flex-col gap-1.5 min-w-0">
                            {c.subLoads.map((sl, slIndex) => (
                              <div
                                key={sl.id}
                                className="flex flex-1 items-center gap-1 min-w-0"
                              >
                                <input
                                  className="flex-1 bg-transparent font-medium min-w-0 text-slate-800 dark:text-slate-100 focus:outline-none"
                                  value={sl.description || ""}
                                  onChange={(e) => {
                                    const newSl = [...(c.subLoads || [])];
                                    newSl[slIndex] = {
                                      ...newSl[slIndex],
                                      description: e.target.value,
                                    };
                                    updateCircuit(c.id, { subLoads: newSl });
                                  }}
                                />
                              </div>
                            ))}
                            <button
                              onClick={() => {
                                const newSl = [
                                  ...(c.subLoads || []),
                                  {
                                    id: crypto.randomUUID(),
                                    description: "New Load",
                                    quantity: 1,
                                    wattage: 100,
                                  },
                                ];
                                updateCircuit(c.id, { subLoads: newSl });
                              }}
                              className="text-xs font-bold text-indigo-500 hover:text-indigo-700 text-left mt-1 no-print focus:outline-none"
                            >
                              + Add Load
                            </button>
                          </div>
                        ) : (
                          <div className="flex-1 flex flex-col min-w-0">
                            <div className="flex items-center min-w-0">
                              <input
                                className="flex-1 bg-transparent font-medium min-w-0 text-slate-800 dark:text-slate-100 focus:outline-none"
                                value={c.description || ""}
                                onChange={(e) =>
                                  updateCircuit(c.id, {
                                    description: e.target.value,
                                  })
                                }
                              />
                              {!isSpace && (
                                <button
                                  onClick={() => {
                                    updateCircuit(c.id, {
                                      subLoads: [
                                        {
                                          id: crypto.randomUUID(),
                                          description: c.description,
                                          wattage: c.wattage,
                                          quantity: c.quantity,
                                        },
                                        {
                                          id: crypto.randomUUID(),
                                          description: "New Load",
                                          wattage: 100,
                                          quantity: 1,
                                        },
                                      ],
                                    });
                                  }}
                                  className="text-indigo-400 hover:text-indigo-600 px-1 ml-1 text-xs uppercase font-bold no-print"
                                  title="Convert to multi-load circuit"
                                >
                                  + Adds
                                </button>
                              )}
                            </div>
                            {c.loadType === LoadType.MOTOR && (
                              <div className="flex items-center gap-2 mt-1.5 no-print" onClick={(e) => e.stopPropagation()}>
                                <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500">HP:</span>
                                <select
                                  value={c.motorHP || ""}
                                  onChange={(e) => {
                                    updateCircuit(c.id, { motorHP: e.target.value });
                                  }}
                                  className="p-1 py-0.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-[11px] font-bold text-indigo-600 dark:text-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all cursor-pointer"
                                >
                                  <option value="" className="dark:bg-slate-900 dark:text-slate-100">-- Select HP --</option>
                                  {hpOptions.map((hpVal) => (
                                    <option key={hpVal} value={hpVal} className="dark:bg-slate-900 dark:text-slate-100">
                                      {hpVal} HP
                                    </option>
                                  ))}
                                </select>
                                {c.motorFLC && (
                                  <span className="text-[10px] font-mono font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-1.5 py-0.5 rounded border border-emerald-100 dark:border-emerald-950/50">
                                    {c.motorFLC}A FLC
                                  </span>
                                )}
                              </div>
                            )}
                            {c.loadType === LoadType.MOTOR && c.motorHP && (
                              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold block mt-0.5">
                                ({c.motorHP} HP Motor, FLC: {c.motorFLC || 0}A)
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-1 py-3 text-center align-top pt-4">
                      {isSpace ? (
                        "-"
                      ) : c.loadType === "SUB" ? (
                        <input
                          type="number"
                          readOnly
                          className={`w-16 max-w-full mx-auto bg-transparent text-center font-mono text-slate-400 dark:text-slate-500 font-bold`}
                          value={c.wattage || 0}
                          onChange={(e) =>
                            updateCircuit(c.id, {
                              wattage: parseInt(e.target.value) || 0,
                            })
                          }
                        />
                      ) : c.subLoads && c.subLoads.length > 0 ? (
                        <div className="flex flex-col gap-1.5 items-center">
                          {c.subLoads.map((sl, slIndex) => (
                            <input
                              key={sl.id}
                              type="number"
                              className="w-16 bg-transparent text-center font-mono text-slate-800 dark:text-slate-100 focus:outline-none"
                              value={sl.wattage || 0}
                              onChange={(e) => {
                                const newSl = [...(c.subLoads || [])];
                                newSl[slIndex] = {
                                  ...newSl[slIndex],
                                  wattage: parseInt(e.target.value) || 0,
                                };
                                updateCircuit(c.id, { subLoads: newSl });
                              }}
                            />
                          ))}
                          <div className="h-[20px] text-[10px] text-slate-500 font-bold mt-1 px-1 font-mono no-print">
                            T: {c.wattage}
                          </div>
                        </div>
                      ) : (
                        <input
                          type="number"
                          readOnly={c.loadType === LoadType.MOTOR && !!c.motorHP}
                          className={`w-16 max-w-full mx-auto bg-transparent text-center font-mono text-slate-800 dark:text-slate-100 focus:outline-none ${c.loadType === LoadType.MOTOR && !!c.motorHP ? "text-slate-400 dark:text-slate-500 font-bold" : ""}`}
                          value={c.wattage || 0}
                          title={c.loadType === LoadType.MOTOR && !!c.motorHP ? "Calculated automatically from FLC" : ""}
                          onChange={(e) =>
                            updateCircuit(c.id, {
                              wattage: parseInt(e.target.value) || 0,
                            })
                          }
                        />
                      )}
                    </td>
                    <td className="px-1 py-3 text-center align-top pt-4 text-slate-800 dark:text-slate-100">
                      {isSpace ? (
                        "-"
                      ) : c.loadType === "SUB" ? (
                        <input
                          type="number"
                          readOnly
                          className={`w-12 max-w-full mx-auto bg-transparent text-center font-mono text-slate-400 dark:text-slate-500 font-bold`}
                          value={c.quantity || 0}
                          onChange={(e) =>
                            updateCircuit(c.id, {
                              quantity: parseInt(e.target.value) || 0,
                            })
                          }
                        />
                      ) : c.subLoads && c.subLoads.length > 0 ? (
                        <div className="flex flex-col gap-1.5 items-center relative">
                          {c.subLoads.map((sl, slIndex) => (
                            <div
                              key={sl.id}
                              className="flex items-center gap-0 w-full relative"
                            >
                              <input
                                type="number"
                                className="w-12 bg-transparent text-center font-mono text-slate-800 dark:text-slate-100 focus:outline-none"
                                value={sl.quantity || 0}
                                onChange={(e) => {
                                  const newSl = [...(c.subLoads || [])];
                                  newSl[slIndex] = {
                                    ...newSl[slIndex],
                                    quantity: parseInt(e.target.value) || 0,
                                  };
                                  updateCircuit(c.id, { subLoads: newSl });
                                }}
                              />
                              <button
                                onClick={() => {
                                  let newSl = (c.subLoads || []).filter(
                                    (_, i) => i !== slIndex,
                                  );
                                  if (newSl.length <= 1) {
                                    const remaining = newSl[0] || {
                                      description: "Load",
                                      wattage: 100,
                                      quantity: 1,
                                    };
                                    updateCircuit(c.id, {
                                      subLoads: undefined,
                                      description: remaining.description,
                                      wattage: remaining.wattage,
                                      quantity: remaining.quantity,
                                    });
                                  } else {
                                    updateCircuit(c.id, { subLoads: newSl });
                                  }
                                }}
                                className="text-red-400 hover:text-red-600 absolute -right-3 -top-[2px] px-1 text-sm no-print font-bold block"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <input
                          type="number"
                          className="w-12 max-w-full mx-auto bg-transparent text-center font-mono text-slate-800 dark:text-slate-100 focus:outline-none"
                          value={c.quantity || 0}
                          onChange={(e) =>
                            updateCircuit(c.id, {
                              quantity: parseInt(e.target.value) || 0,
                            })
                          }
                        />
                      )}
                    </td>
                    <td className="px-1 py-3 text-center font-mono font-bold text-slate-400 dark:text-slate-500 truncate">
                      {isSpace ? "-" : c.loadVA}
                    </td>
                    <td className="px-1 py-3 text-center">
                      {isSpace ? (
                        "-"
                      ) : c.subPanelReflectionMode === 'phase_loads' && c.reflectedPhaseLoads ? (
                        <div className="flex gap-0.5 justify-center flex-wrap">
                          {["R", "Y", "B", "3Ø"].map((p) => {
                            const isActive =
                              (p === "R" && c.reflectedPhaseLoads!.R > 0) ||
                              (p === "Y" && c.reflectedPhaseLoads!.Y > 0) ||
                              (p === "B" && c.reflectedPhaseLoads!.B > 0) ||
                              (p === "3Ø" && c.reflectedPhaseLoads!.ThreePhase > 0);
                            if (!isActive) return null;
                            return (
                              <span
                                key={p}
                                className={`px-1 h-5 min-w-[16px] rounded-sm font-bold shrink-0 flex items-center justify-center ${
                                  p === "3Ø"
                                    ? "bg-indigo-600 text-white"
                                    : p === "R"
                                      ? "bg-red-600 text-white"
                                      : p === "Y"
                                        ? "bg-yellow-400 text-black"
                                        : "bg-blue-600 text-white"
                                }`}
                                style={{ fontSize: tableFontSize - 4 }}
                              >
                                {p}
                              </span>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="flex gap-0.5 justify-center flex-wrap">
                          {["R", "Y", "B", "3Ø"].map((p) => (
                            <button
                              key={p}
                              onClick={() => {
                                if (p === "3Ø") {
                                  updateCircuit(c.id, {
                                    phases: ["R", "Y", "B"],
                                    is3PhaseMarker: true,
                                  });
                                } else {
                                  // Single phase selection replaces other phases to ensure it's reflected correctly
                                  updateCircuit(c.id, { 
                                    phases: [p as Phase],
                                    is3PhaseMarker: false,
                                  });
                                }
                              }}
                              className={`px-1 h-5 min-w-[16px] rounded-sm font-bold shrink-0 flex items-center justify-center ${
                                p === "3Ø" && c.phases.length === 3
                                  ? "bg-indigo-600 text-white"
                                  : p !== "3Ø" &&
                                      c.phases.includes(p as Phase) &&
                                      c.phases.length === 1
                                    ? p === "R"
                                      ? "bg-red-600 text-white"
                                      : p === "Y"
                                        ? "bg-yellow-400 text-black"
                                        : "bg-blue-600 text-white"
                                    : "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700"
                              } ${!panel.system.includes("3PH") && p !== "R" ? "hidden" : ""}`}
                              style={{ fontSize: tableFontSize - 4 }}
                            >
                              {p}
                            </button>
                          ))}
                        </div>
                      )}
                    </td>
                    {panel.system.includes("3PH") ? (
                      <>
                        <td className="px-1 py-3 text-center font-mono font-bold truncate text-red-600 print:text-slate-900">
                          {isSpace
                            ? "-"
                            : c.subPanelReflectionMode === 'phase_loads' && c.reflectedPhaseAmps
                              ? c.reflectedPhaseAmps.R > 0 ? c.reflectedPhaseAmps.R.toFixed(2) : "-"
                              : c.phases.includes("R") && c.phases.length < 3
                                ? <AmpsInput c={c} panel={panel} is3P={c.is3PhaseMarker ?? false} disabled={c.loadType === LoadType.SUB_PANEL || c.loadType === LoadType.SUB_SUB_PANEL} onAmpsUpdate={(newAmps) => handleAmpsUpdate(c.id, newAmps, c, c.is3PhaseMarker ?? false)} />
                                : "-"}
                        </td>
                        <td className="px-1 py-3 text-center font-mono font-bold truncate text-yellow-600 print:text-slate-900">
                          {isSpace
                            ? "-"
                            : c.subPanelReflectionMode === 'phase_loads' && c.reflectedPhaseAmps
                              ? c.reflectedPhaseAmps.Y > 0 ? c.reflectedPhaseAmps.Y.toFixed(2) : "-"
                              : c.phases.includes("Y") && c.phases.length < 3
                                ? <AmpsInput c={c} panel={panel} is3P={c.is3PhaseMarker ?? false} disabled={c.loadType === LoadType.SUB_PANEL || c.loadType === LoadType.SUB_SUB_PANEL} onAmpsUpdate={(newAmps) => handleAmpsUpdate(c.id, newAmps, c, c.is3PhaseMarker ?? false)} />
                                : "-"}
                        </td>
                        <td className="px-1 py-3 text-center font-mono font-bold truncate text-blue-600 print:text-slate-900">
                          {isSpace
                            ? "-"
                            : c.subPanelReflectionMode === 'phase_loads' && c.reflectedPhaseAmps
                              ? c.reflectedPhaseAmps.B > 0 ? c.reflectedPhaseAmps.B.toFixed(2) : "-"
                              : c.phases.includes("B") && c.phases.length < 3
                                ? <AmpsInput c={c} panel={panel} is3P={c.is3PhaseMarker ?? false} disabled={c.loadType === LoadType.SUB_PANEL || c.loadType === LoadType.SUB_SUB_PANEL} onAmpsUpdate={(newAmps) => handleAmpsUpdate(c.id, newAmps, c, c.is3PhaseMarker ?? false)} />
                                : "-"}
                        </td>
                        <td className="px-1 py-3 text-center font-mono font-bold truncate text-indigo-600 print:text-slate-900">
                          {isSpace
                            ? "-"
                            : c.subPanelReflectionMode === 'phase_loads' && c.reflectedPhaseAmps
                              ? c.reflectedPhaseAmps.ThreePhase > 0 ? c.reflectedPhaseAmps.ThreePhase.toFixed(2) : "-"
                              : c.phases.length === 3
                                ? <AmpsInput c={c} panel={panel} is3P={c.is3PhaseMarker ?? true} disabled={c.loadType === LoadType.SUB_PANEL || c.loadType === LoadType.SUB_SUB_PANEL} onAmpsUpdate={(newAmps) => handleAmpsUpdate(c.id, newAmps, c, c.is3PhaseMarker ?? true)} />
                                : "-"}
                        </td>
                      </>
                    ) : (
                      <td className="px-1 py-3 text-center font-mono font-bold truncate">
                        {isSpace ? "-" : <AmpsInput c={c} panel={panel} is3P={false} disabled={c.loadType === LoadType.SUB_PANEL || c.loadType === LoadType.SUB_SUB_PANEL} onAmpsUpdate={(newAmps) => handleAmpsUpdate(c.id, newAmps, c, false)} />}
                      </td>
                    )}
                    <td className="px-1 py-3 text-center">
                      {isSpace ? (
                        "-"
                      ) : (
                        <select
                          value={c.mcbAT || ""}
                          disabled={c.loadType === LoadType.SUB_PANEL || c.loadType === LoadType.SUB_SUB_PANEL}
                          onChange={(e) =>
                            updateCircuit(c.id, {
                              mcbAT: parseInt(e.target.value),
                            })
                          }
                          className={`bg-transparent text-center text-slate-800 dark:text-slate-100 font-bold appearance-none w-14 max-w-full mx-auto dark:bg-slate-900 ${c.loadType === LoadType.SUB_PANEL || c.loadType === LoadType.SUB_SUB_PANEL ? "text-slate-400 dark:text-slate-500" : ""}`}
                        >
                          {STANDARD_CB_RATINGS.map((r) => (
                            <option
                              key={r}
                              value={r}
                              className="dark:bg-slate-900 dark:text-slate-100"
                            >
                              {r}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="px-1 py-3 text-center font-bold text-slate-400 dark:text-slate-500 truncate">
                      {isSpace ? "-" : c.mcbAF}
                    </td>
                    <td className="px-1 py-3 text-center">
                      {isSpace ? (
                        "-"
                      ) : (
                        <select
                          value={c.mcbP || ""}
                          disabled={c.loadType === LoadType.SUB_PANEL || c.loadType === LoadType.SUB_SUB_PANEL}
                          onChange={(e) =>
                            updateCircuit(c.id, {
                              mcbP: parseInt(e.target.value),
                            })
                          }
                          className={`bg-transparent text-center text-slate-800 dark:text-slate-100 appearance-none w-12 max-w-full mx-auto dark:bg-slate-900 ${c.loadType === LoadType.SUB_PANEL || c.loadType === LoadType.SUB_SUB_PANEL ? "text-slate-400 dark:text-slate-500" : ""}`}
                        >
                          {[1, 2, 3, 4].map((p) => (
                            <option
                              key={p}
                              value={p}
                              className="dark:bg-slate-900 dark:text-slate-100"
                            >
                              {p}P
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="px-1 py-3 text-center">
                      {isSpace ? (
                        "-"
                      ) : (
                        <div className="flex flex-col items-center justify-center gap-1">
                          {customKaicCircuitIds.includes(c.id) || (c.kaicOverride !== undefined && !standardKAICRatings.includes(c.kaicOverride)) ? (
                            <div className="flex items-center gap-1 justify-center">
                              <input
                                type="number"
                                value={c.kaicOverride ?? ""}
                                placeholder={String(c.mcbKAICCalculated ?? 10)}
                                onChange={(e) => {
                                  const val = e.target.value ? Number(e.target.value) : undefined;
                                  updateCircuit(c.id, { kaicOverride: val });
                                }}
                                className="w-14 bg-white dark:bg-slate-800 text-center text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                style={{ fontSize: tableFontSize - 2 }}
                              />
                              <span className="text-xxs text-slate-500 dark:text-slate-400 shrink-0">kA</span>
                              <button
                                onClick={() => {
                                  updateCircuit(c.id, { kaicOverride: undefined });
                                  setCustomKaicCircuitIds(prev => prev.filter(id => id !== c.id));
                                }}
                                className="text-slate-400 hover:text-indigo-600 p-0.5 transition-colors no-print shrink-0"
                                title="Reset to calculated"
                              >
                                <RotateCcw className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 justify-center">
                              <select
                                value={c.kaicOverride === undefined ? "auto" : String(c.kaicOverride)}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val === "auto") {
                                    updateCircuit(c.id, { kaicOverride: undefined });
                                  } else if (val === "custom") {
                                    setCustomKaicCircuitIds(prev => [...prev, c.id]);
                                    updateCircuit(c.id, { kaicOverride: c.mcbKAICCalculated ?? 10 });
                                  } else {
                                    updateCircuit(c.id, { kaicOverride: Number(val) });
                                  }
                                }}
                                className={`bg-transparent text-center font-bold appearance-none cursor-pointer border border-transparent hover:border-slate-200 dark:hover:border-slate-800 rounded px-1 py-0.5 dark:bg-slate-900 ${
                                  c.kaicOverride !== undefined 
                                    ? "text-amber-600 dark:text-amber-400 font-extrabold bg-amber-50 dark:bg-amber-950/20 px-1.5 rounded border-amber-200 dark:border-amber-900/40" 
                                    : "text-slate-500 dark:text-slate-400"
                                }`}
                                style={{ fontSize: tableFontSize - 1 }}
                              >
                                <option value="auto" className="dark:bg-slate-900 dark:text-slate-100 font-normal">
                                  {c.mcbKAICCalculated ?? c.mcbKAIC ?? 10} (Auto)
                                </option>
                                {standardKAICRatings.map((rating) => (
                                  <option
                                    key={rating}
                                    value={String(rating)}
                                    className="dark:bg-slate-900 dark:text-slate-100"
                                  >
                                    {rating} kA
                                  </option>
                                ))}
                                <option value="custom" className="dark:bg-slate-900 dark:text-slate-100 italic">
                                  Custom...
                                </option>
                              </select>
                              
                              {c.kaicOverride !== undefined && (
                                <button
                                  onClick={() => {
                                    updateCircuit(c.id, { kaicOverride: undefined });
                                    setCustomKaicCircuitIds(prev => prev.filter(id => id !== c.id));
                                  }}
                                  className="text-amber-500 hover:text-indigo-600 p-0.5 ml-0.5 no-print shrink-0"
                                  title="Manually Overridden. Click to Reset to Calculated"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-1 py-3 text-center">
                      {isSpace ? (
                        "-"
                      ) : (
                        <select
                          value={c.mcbType || ""}
                          disabled={c.loadType === LoadType.SUB_PANEL || c.loadType === LoadType.SUB_SUB_PANEL}
                          onChange={(e) =>
                            updateCircuit(c.id, {
                              mcbType: e.target.value as MCBType,
                            })
                          }
                          className={`bg-transparent text-center text-slate-800 dark:text-slate-100 appearance-none cursor-pointer w-24 max-w-full mx-auto truncate dark:bg-slate-900 ${c.loadType === LoadType.SUB_PANEL || c.loadType === LoadType.SUB_SUB_PANEL ? 'text-slate-400 dark:text-slate-500' : ''}`}
                          style={{ fontSize: tableFontSize - 2 }}
                        >
                          {Object.values(MCBType).map((t) => (
                            <option
                              key={t}
                              value={t}
                              className="dark:bg-slate-900 dark:text-slate-100"
                            >
                              {t}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="px-1 py-3 text-center font-medium leading-tight truncate">
                      {isSpace ? (
                        "-"
                      ) : (
                        <>
                          <div className="flex flex-col items-center gap-1">
                            <div className="flex items-center justify-center gap-1">
                              <select
                                value={c.wireSets || 1}
                                onChange={(e) => updateCircuit(c.id, { wireSets: Number(e.target.value) })}
                                className={`bg-transparent text-slate-500 dark:text-slate-400 font-bold text-xxs border-none cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-800 rounded px-1 py-0.5 outline-none ${(!c.wireSets || c.wireSets === 1) ? "print:hidden" : ""}`}
                                title="Number of Cable Sets"
                              >
                                {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                                  <option key={n} value={n}>{n > 1 ? `${n} Sets of` : ''}</option>
                                ))}
                              </select>
                              <span>
                                {c.wireSize}mm² {c.wireType}
                              </span>
                            </div>
                            <span className="text-slate-500 dark:text-slate-400 text-xxs flex items-center gap-1 justify-center whitespace-nowrap">
                              {c.groundSize}mm² GND in {c.conduitSize}
                              <select
                                value={c.conduitType || "PVC"}
                                onChange={(e) =>
                                  updateCircuit(c.id, {
                                    conduitType: e.target.value,
                                  })
                                }
                                className="bg-slate-100 dark:bg-slate-800 text-slate-705 dark:text-slate-300 font-semibold border border-slate-300 dark:border-slate-700 rounded px-1 py-0.5 text-xxs cursor-pointer hover:bg-slate-200 print:appearance-none print:bg-transparent print:border-none print:p-0 font-sans"
                              >
                                <option value="PVC">PVC</option>
                                <option value="EMT">EMT</option>
                                <option value="IMC">IMC</option>
                                <option value="RSC">RSC</option>
                              </select>
                            </span>
                          </div>
                        </>
                      )}
                    </td>
                    <td className="px-1 py-3 text-center no-print overflow-hidden">
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 justify-center flex-wrap">
                        <button
                          onClick={() => moveCircuitUp(idx)}
                          disabled={idx === 0}
                          className="p-1 hover:text-indigo-600 disabled:opacity-30 shrink-0"
                          title="Move Up"
                        >
                          <ArrowUp className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => moveCircuitDown(idx)}
                          disabled={idx === circuits.length - 1}
                          className="p-1 hover:text-indigo-600 disabled:opacity-30 shrink-0"
                          title="Move Down"
                        >
                          <ArrowDown className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => duplicateCircuit(c)}
                          className="p-1 hover:text-indigo-600 shrink-0"
                          title="Duplicate Circuit"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => removeCircuit(c.id)}
                          className="p-1 hover:text-red-600 shrink-0"
                          title="Remove Circuit"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              <tr
                style={{ fontSize: tableFontSize }}
                className="bg-slate-900 text-white font-bold border-t-2 border-slate-900 print:text-slate-900 print:bg-white transition-all"
              >
                <td
                  colSpan={4}
                  className="px-4 py-6 text-right uppercase opacity-70"
                >
                  Total Connected Load
                </td>
                <td className="px-1 py-6 text-center truncate">
                  {totalVA.toFixed(0)} VA
                </td>
                <td className="px-1 py-6 text-center opacity-70 truncate">
                  ({(totalVA / 1000).toFixed(2)} kVA)
                </td>
                {panel.system.includes("3PH") ? (
                  <>
                    <td className="px-1 py-6 text-center text-red-500 print:text-slate-900 truncate">
                      {phaseAmps.R.toFixed(2)} A
                    </td>
                    <td className="px-1 py-6 text-center text-yellow-500 print:text-slate-900 truncate">
                      {phaseAmps.Y.toFixed(2)} A
                    </td>
                    <td className="px-1 py-6 text-center text-blue-500 print:text-slate-900 truncate">
                      {phaseAmps.B.toFixed(2)} A
                    </td>
                    <td className="px-1 py-6 text-center text-indigo-500 print:text-slate-900 truncate">
                      {phaseAmps.threePhase > 0
                        ? `${phaseAmps.threePhase.toFixed(2)} A`
                        : "-"}
                    </td>
                  </>
                ) : (
                  <td className="px-1 py-6 text-center text-yellow-400 print:text-slate-900 truncate">
                    {mainCurrent.baseAmp.toFixed(2)} A
                  </td>
                )}
                <td colSpan={7} className="px-4 py-6">
                  <div
                    className="uppercase opacity-70 flex flex-col gap-1 items-end"
                    style={{ fontSize: tableFontSize - 2 }}
                  >
                    <span>
                      Main Feeder:{" "}
                      {mainFeeder.wire.runs > 1
                        ? `${mainFeeder.wire.runs} sets of `
                        : ""}
                      {formatWireSize(mainFeeder.wire.size)}mm² {panel.insulationType || "THHN"} ({panel.conductorMaterial || "Copper"}),{" "}
                      {mainFeeder.groundSize}mm² GND in {mainFeeder.conduitSize}{" "}
                      {mainFeeder.conduitType || "PVC"}
                      {panel.mainOverrides?.isOverrideEnabled && panel.mainOverrides.wireSize ? " (Manual)" : ""}
                    </span>
                    <span className="flex items-center gap-1 flex-wrap justify-end">
                      <span>Main Breaker: {mainFeeder.cb} AT / {mainFeeder.af} AF, {mainFeeder.poles}P, </span>
                      <span className="inline-flex items-center gap-0.5">
                        <select
                          value={panel.mainOverrides?.kaic === undefined ? "auto" : String(panel.mainOverrides.kaic)}
                          onChange={(e) => {
                            const val = e.target.value;
                            setPanel((prev) => ({
                              ...prev,
                              mainOverrides: {
                                isOverrideEnabled: prev.mainOverrides?.isOverrideEnabled ?? true,
                                ...(prev.mainOverrides || {}),
                                kaic: val === "auto" ? undefined : Number(val),
                              }
                            }));
                          }}
                          className={`bg-slate-100 dark:bg-slate-800 font-bold border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 rounded px-1.5 py-0.5 text-xs cursor-pointer select-none ${
                            panel.mainOverrides?.kaic !== undefined
                              ? "text-amber-600 dark:text-amber-400 font-extrabold bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/40"
                              : "text-slate-800 dark:text-slate-200"
                          }`}
                          style={{ fontSize: tableFontSize - 2 }}
                        >
                          <option value="auto">
                            {mainFeeder.raw.kaic} (Auto)
                          </option>
                          {standardKAICRatings.map((rating) => (
                            <option
                              key={rating}
                              value={String(rating)}
                              className="dark:bg-slate-900 dark:text-slate-100"
                            >
                              {rating} kA
                            </option>
                          ))}
                        </select>
                        {panel.mainOverrides?.kaic !== undefined && (
                          <button
                            onClick={() => {
                              setPanel((prev) => ({
                                ...prev,
                                mainOverrides: {
                                  isOverrideEnabled: prev.mainOverrides?.isOverrideEnabled ?? false,
                                  ...(prev.mainOverrides || {}),
                                  kaic: undefined
                                }
                              }));
                            }}
                            className="text-amber-500 hover:text-indigo-500 p-0.5 no-print shrink-0"
                            title="Reset Main kAIC to Calculated"
                          >
                            <RotateCcw className="w-3 h-3" />
                          </button>
                        )}
                      </span>
                      <span> kAIC, {mainFeeder.type}</span>
                      {panel.mainOverrides?.isOverrideEnabled && (panel.mainOverrides.breakerAT || panel.mainOverrides.kaic || panel.mainOverrides.breakerType) ? " (Manual)" : ""}
                    </span>
                    {panel.system.includes("3PH") && (
                      <span
                        className={
                          phaseImbalance > 15 ? "text-red-400" : "text-green-400"
                        }
                      >
                        Phase Imbalance: {phaseImbalance.toFixed(1)}%
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="no-print p-6 bg-slate-50 border-t border-slate-100 flex justify-center flex-wrap gap-4">
          <button
            onClick={addCircuit}
            className="flex items-center gap-2 px-6 py-2 bg-white border-2 border-dashed border-slate-300 rounded-lg text-slate-500 hover:border-indigo-600 hover:text-indigo-600 transition-all font-bold"
          >
            <Plus className="w-4 h-4" /> Add Circuit
          </button>
          <button
            onClick={() => setShowRearrangeModal(true)}
            className="flex items-center gap-2 px-6 py-2 bg-white border-2 border-dashed border-slate-300 rounded-lg text-slate-500 hover:border-indigo-600 hover:text-indigo-600 transition-all font-bold"
          >
            <MoveVertical className="w-4 h-4" /> Rearrange
          </button>
          <button
            onClick={() => setShowPresetsModal(true)}
            className="flex items-center gap-2 px-6 py-2 bg-indigo-50 border-2 border-dashed border-indigo-200 rounded-lg text-indigo-600 hover:border-indigo-600 hover:bg-indigo-100 transition-all font-bold"
          >
            <List className="w-4 h-4" /> Load Schedule Library
          </button>
        </div>
      </section>

      <section className="bg-slate-900 p-8 rounded-2xl text-white flex justify-between items-center print:bg-white print:text-slate-900 print:border-2 print:border-slate-800 sm:p-6">
        <div>
          <h4 className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1 print:text-slate-500">
            Max Demand Current
          </h4>
          <p className="text-5xl font-black text-yellow-400 print:text-slate-900 md:text-3xl">
            {mainCurrent.baseAmp.toFixed(1)}
            <span className="text-lg ml-2">AMPS</span>
          </p>
        </div>
        <div className="p-4 bg-white/10 rounded-2xl print:border print:border-slate-200">
          <Calculator className="w-8 h-8" />
        </div>
      </section>

      {/* Maximum Demand Current Solver Section */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-6 sm:p-4 no-print">
        <div
          className="flex items-center justify-between cursor-pointer border-b border-slate-100 dark:border-slate-800 pb-4"
          onClick={() => setShowDemandMath(!showDemandMath)}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 dark:bg-indigo-950/40 rounded-xl">
              <Calculator className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h3 className="font-black text-slate-800 dark:text-white uppercase tracking-wider text-sm">
                PEC Maximum Demand Math Solver
              </h3>
              <p className="text-xs text-slate-400">
                Step-by-step mathematical substitution in LaTeX format
              </p>
            </div>
          </div>
          <button className="text-xs font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 px-3 py-1.5 rounded-lg transition-all">
            {showDemandMath ? "Hide Math" : "Show Math"}
          </button>
        </div>

        {showDemandMath && (
          <div className="mt-6 space-y-6">
            {!maxDemandDetails.is3PH ? (
              <div className="space-y-4">
                <div className="bg-slate-50 dark:bg-slate-950/20 p-4 rounded-xl border border-slate-100 dark:border-slate-850">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Mathematical Formula (LaTeX)
                  </h4>
                  <div className="bg-white dark:bg-zinc-950 p-2 rounded-xl border border-slate-200 dark:border-zinc-800 overflow-x-auto">
                    <LatexRenderer tex="\text{Max Demand Current (1}\Phi\text{)} = \left[ \left( \frac{\text{Total Connected VA}}{V_{\text{sys}}} \right) \times 0.80 + 0.25 \times \text{HML} \right] \times 1.25" />
                  </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-950/20 p-4 rounded-xl border border-slate-100 dark:border-slate-850">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 font-semibold">
                    Step-by-Step Substations & Values
                  </h4>
                  <div className="space-y-3 text-sm text-slate-600 dark:text-slate-350">
                    <p className="flex justify-between border-b border-dashed border-slate-200 dark:border-slate-800 pb-1">
                      <span>
                        Total Connected Load (
                        <span className="font-mono">Total VA</span>):
                      </span>
                      <span className="font-bold text-slate-800 dark:text-white">
                        {(maxDemandDetails.totalConnectedVA || 0).toFixed(1)} VA
                      </span>
                    </p>
                    <p className="flex justify-between border-b border-dashed border-slate-200 dark:border-slate-800 pb-1">
                      <span>
                        System Voltage (<span className="font-mono">V_sys</span>
                        ):
                      </span>
                      <span className="font-bold text-slate-800 dark:text-white">
                        {maxDemandDetails.systemVoltage} V
                      </span>
                    </p>
                    <p className="flex justify-between border-b border-dashed border-slate-200 dark:border-slate-800 pb-1">
                      <span>
                        Highest Motor Load (
                        <span className="font-mono">HML</span>):
                      </span>
                      <span className="font-bold text-slate-800 dark:text-white">
                        {(maxDemandDetails.HML || 0).toFixed(2)} A
                      </span>
                    </p>
                  </div>
                </div>

                <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl text-white">
                  <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">
                    LaTex Solution Details
                  </h4>
                  <div className="bg-zinc-950 p-4 rounded-xl overflow-x-auto min-h-[140px] flex items-center">
                    <div className="mx-auto">
                      <LatexRenderer
                        tex={`\\begin{aligned}
  I_{\\text{demand}} &= \\left[ \\left( \\frac{${(maxDemandDetails.totalConnectedVA || 0).toFixed(1)}}{230} \\right) \\times 0.80 + 0.25 \\times ${(maxDemandDetails.HML || 0).toFixed(2)} \\right] \\times 1.25 ${maxDemandDetails.subPanelDemandAmps ? `+ I_{\\text{subpanels}}` : ''} \\\\
  &= \\left[ \\left( ${((maxDemandDetails.totalConnectedVA || 0) / 230).toFixed(3)} \\right) \\times 0.80 + ${(0.25 * (maxDemandDetails.HML || 0)).toFixed(3)} \\right] \\times 1.25 ${maxDemandDetails.subPanelDemandAmps ? `+ ${(maxDemandDetails.subPanelDemandAmps || 0).toFixed(2)}` : ''} \\\\
  &= \\left[ ${(((maxDemandDetails.totalConnectedVA || 0) / 230) * 0.8).toFixed(3)} + ${(0.25 * (maxDemandDetails.HML || 0)).toFixed(3)} \\right] \\times 1.25 ${maxDemandDetails.subPanelDemandAmps ? `+ ${(maxDemandDetails.subPanelDemandAmps || 0).toFixed(2)}` : ''} \\\\
  &= ${((((maxDemandDetails.totalConnectedVA || 0) / 230) * 0.8) + (0.25 * (maxDemandDetails.HML || 0))).toFixed(3)} \\times 1.25 ${maxDemandDetails.subPanelDemandAmps ? `+ ${(maxDemandDetails.subPanelDemandAmps || 0).toFixed(2)}` : ''} \\\\
  &= ${(maxDemandDetails.internalDemandCurrent || 0).toFixed(2)} ${maxDemandDetails.subPanelDemandAmps ? `+ ${(maxDemandDetails.subPanelDemandAmps || 0).toFixed(2)}` : ''} \\\\
  &= \\mathbf{${(maxDemandDetails.baseAmp || 0).toFixed(2)}\\text{ A}}
  \\end{aligned}`}
                      />
                    </div>
                  </div>
                  <div className="mt-4 flex justify-between items-center border-t border-zinc-800 pt-3">
                    <span className="text-[10px] text-zinc-500">
                      Perfect for technical paper publications and PEE
                      submittals.
                    </span>
                    <button
                      onClick={() => {
                        const code = `\\text{Max Demand Current (1\\Phi)} = \\left[ \\left( \\frac{${(maxDemandDetails.totalConnectedVA || 0).toFixed(1)}}{230} \\right) \\times 0.80 + 0.25 \\times ${(maxDemandDetails.HML || 0).toFixed(2)} \\right] \\times 1.25 ${maxDemandDetails.subPanelDemandAmps ? `+ ${(maxDemandDetails.subPanelDemandAmps || 0).toFixed(2)}` : ''} = ${(maxDemandDetails.baseAmp || 0).toFixed(2)}\\text{ A}`;
                        navigator.clipboard.writeText(code);
                      }}
                      className="flex items-center gap-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      <Copy className="w-3.5 h-3.5" /> Copy LaTeX
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-slate-50 dark:bg-slate-950/20 p-4 rounded-xl border border-slate-100 dark:border-slate-850">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Mathematical Formula (3-Phase LaTeX)
                  </h4>
                  <div className="bg-white dark:bg-zinc-950 p-2 rounded-xl border border-slate-200 dark:border-zinc-800 overflow-x-auto">
                    <LatexRenderer tex={`\\text{Max Demand Current (3}\\Phi\\text{)} = \\left[ (I_{\\text{line}} \\times 1.732) \\times 0.80 + I_{3\\Phi} + 0.25 \\times \\text{HML} \\right] \\times 1.25 ${maxDemandDetails.subPanelDemandAmps ? `+ I_{\\text{subpanels}}` : ''}`} />
                  </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-950/20 p-4 rounded-xl border border-slate-100 dark:border-slate-850">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 font-semibold">
                    Step-by-Step Substations & Values (
                    {maxDemandDetails.connectionType})
                  </h4>
                  <div className="space-y-3 text-sm text-slate-600 dark:text-slate-350">
                    <p className="flex justify-between border-b border-dashed border-slate-200 dark:border-slate-800 pb-1">
                      <span>Phase currents (Line values):</span>
                      <span className="font-mono text-xs">
                        {maxDemandDetails.connectionType === "Line-to-Line"
                           ? "AB"
                           : "AN"}{" "}
                        = {(maxDemandDetails.phaseR || 0).toFixed(2)} A,{" "}
                        {maxDemandDetails.connectionType === "Line-to-Line"
                           ? "BC"
                           : "BN"}{" "}
                        = {(maxDemandDetails.phaseY || 0).toFixed(2)} A,{" "}
                        {maxDemandDetails.connectionType === "Line-to-Line"
                           ? "CA"
                           : "CN"}{" "}
                        = {(maxDemandDetails.phaseB || 0).toFixed(2)} A
                      </span>
                    </p>
                    <p className="flex justify-between border-b border-dashed border-slate-200 dark:border-slate-800 pb-1 font-bold text-slate-800 dark:text-white">
                      <span>
                        Highest Phase Current (
                        <span className="font-mono">I_line</span>):
                      </span>
                      <span>
                        {(maxDemandDetails.totalAmpere || 0).toFixed(2)} A
                      </span>
                    </p>
                    <p className="flex justify-between border-b border-dashed border-slate-200 dark:border-slate-800 pb-1">
                      <span>
                        Total 3-Phase loads current (
                        <span className="font-mono">I_3ph</span>):
                      </span>
                      <span className="font-bold text-slate-800 dark:text-white">
                        {(maxDemandDetails.total3Phase || 0).toFixed(2)} A
                      </span>
                    </p>
                    <p className="flex justify-between border-b border-dashed border-slate-200 dark:border-slate-800 pb-1">
                      <span>
                        Highest Motor Load (
                        <span className="font-mono">HML</span>):
                      </span>
                      <span className="font-bold text-slate-800 dark:text-white">
                        {(maxDemandDetails.HML || 0).toFixed(2)} A
                      </span>
                    </p>
                    {maxDemandDetails.subPanelDemandAmps ? (
                      <p className="flex justify-between border-b border-dashed border-slate-200 dark:border-slate-800 pb-1">
                        <span>
                          Sub-Panel Reflections (
                          <span className="font-mono">I_subpanels</span>):
                        </span>
                        <span className="font-bold text-slate-800 dark:text-white">
                          {(maxDemandDetails.subPanelDemandAmps || 0).toFixed(2)} A
                        </span>
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl text-white">
                  <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">
                    LaTex Solution Details
                  </h4>
                  <div className="bg-zinc-950 p-4 rounded-xl overflow-x-auto min-h-[140px] flex items-center">
                    <div className="mx-auto">
                      <LatexRenderer
                        tex={`\\begin{aligned}
  I_{\\text{demand}} &= \\left[ (${(maxDemandDetails.totalAmpere || 0).toFixed(2)} \\times 1.732) \\times 0.80 + ${(maxDemandDetails.total3Phase || 0).toFixed(2)} + 0.25 \\times ${(maxDemandDetails.HML || 0).toFixed(2)} \\right] \\times 1.25 ${maxDemandDetails.subPanelDemandAmps ? `+ I_{\\text{subpanels}}` : ''} \\\\
  &= \\left[ (${((maxDemandDetails.totalAmpere || 0) * 1.732).toFixed(3)}) \\times 0.80 + ${(maxDemandDetails.total3Phase || 0).toFixed(2)} + ${(0.25 * (maxDemandDetails.HML || 0)).toFixed(3)} \\right] \\times 1.25 ${maxDemandDetails.subPanelDemandAmps ? `+ ${(maxDemandDetails.subPanelDemandAmps || 0).toFixed(2)}` : ''} \\\\
  &= \\left[ ${((maxDemandDetails.totalAmpere || 0) * 1.732 * 0.8).toFixed(3)} + ${(maxDemandDetails.total3Phase || 0).toFixed(2)} + ${(0.25 * (maxDemandDetails.HML || 0)).toFixed(3)} \\right] \\times 1.25 ${maxDemandDetails.subPanelDemandAmps ? `+ ${(maxDemandDetails.subPanelDemandAmps || 0).toFixed(2)}` : ''} \\\\
  &= ${(((maxDemandDetails.totalAmpere || 0) * 1.732 * 0.8) + (maxDemandDetails.total3Phase || 0) + (0.25 * (maxDemandDetails.HML || 0))).toFixed(3)} \\times 1.25 ${maxDemandDetails.subPanelDemandAmps ? `+ ${(maxDemandDetails.subPanelDemandAmps || 0).toFixed(2)}` : ''} \\\\
  &= ${(maxDemandDetails.internalDemandCurrent || 0).toFixed(2)} ${maxDemandDetails.subPanelDemandAmps ? `+ ${(maxDemandDetails.subPanelDemandAmps || 0).toFixed(2)}` : ''} \\\\
  &= \\mathbf{${(maxDemandDetails.baseAmp || 0).toFixed(2)}\\text{ A}}
  \\end{aligned}`}
                      />
                    </div>
                  </div>
                  <div className="mt-4 flex justify-between items-center border-t border-zinc-800 pt-3">
                    <span className="text-[10px] text-zinc-500">
                      Includes 80% demand factor on line currents + separate
                      3-phase and 25% HML, adjusted by a 1.25 system-wide safety factor.

                    </span>
                    <button
                      onClick={() => {
                        const code = `\\text{Max Demand Current (3\\Phi)} = \\left[ (${(maxDemandDetails.totalAmpere || 0).toFixed(2)} \\times 1.732) \\times 0.80 + ${(maxDemandDetails.total3Phase || 0).toFixed(2)} + 0.25 \\times ${(maxDemandDetails.HML || 0).toFixed(2)} \\right] \\times 1.25 = ${(maxDemandDetails.baseAmp || 0).toFixed(2)}\\text{ A}`;
                        navigator.clipboard.writeText(code);
                      }}
                      className="flex items-center gap-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      <Copy className="w-3.5 h-3.5" /> Copy LaTeX
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Single Line Diagram / Panel Layout */}
      <section
        id={`sld-${panel.designation || "main"}`}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 rounded-2xl shadow-sm print:shadow-none print:border-2 print:border-slate-800 overflow-x-auto"
      >
        <h4 className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-12 flex items-center gap-2">
          <Zap className="w-4 h-4 text-yellow-500" />
          Single Line Diagram - {panel.designation}
        </h4>

        <SingleLineDiagram
          panel={panel}
          mainFeeder={mainFeeder}
          panelRows={panelRows}
          formatWireSize={formatWireSize}
          isSubPanel={isSubPanel}
        />
      </section>

      {/* Legend & Disclaimer */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-12 print:mt-8">
        <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-lg print:border-2 print:border-slate-800 col-span-1 md:col-span-2">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5 mb-6">
            <div>
              <h4 className="flex items-center gap-2 text-md font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider print:text-slate-900">
                <Info className="w-5 h-5 text-indigo-600 dark:text-indigo-400 no-print" />
                Legend & Technical Reference Notes
              </h4>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">Conformity criteria defined under the Philippine Electrical Code (PEC) Part 1 2017 Edition</p>
            </div>
            <span className="text-[10px] font-mono tracking-widest text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/50 border border-slate-200/50 dark:border-slate-700/50 px-2 py-1 rounded-md self-start md:self-auto">
              PEC-2017-CH2-DRAFT
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-xs font-medium text-slate-600 dark:text-slate-400 print:text-slate-900">
            {/* Classification & Symbols Legend */}
            <div className="space-y-4">
              <h5 className="text-[10px] uppercase tracking-widest font-black text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800/60 pb-2">
                Classification Abbreviations
              </h5>
              <div className="space-y-2.5 font-mono text-[11px]">
                <div className="flex items-start gap-2">
                  <span className="bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-bold px-1.5 py-0.5 rounded text-[10px] min-w-[50px] text-center shrink-0">
                    L / LO
                  </span>
                  <div className="space-y-0.5">
                    <p className="font-sans font-bold text-slate-700 dark:text-slate-300">Lighting Outlets</p>
                    <p className="text-[10px] text-slate-400">100VA per active lamp outlet / fixed luminaire strap (PEC 2.20.2.3(C))</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-bold px-1.5 py-0.5 rounded text-[10px] min-w-[50px] text-center shrink-0">
                    S / CO
                  </span>
                  <div className="space-y-0.5">
                    <p className="font-sans font-bold text-slate-700 dark:text-slate-300">Convenience Outlets</p>
                    <p className="text-[10px] text-slate-400">Duplex receptacle rated at 180VA per simplex / strap assembly (PEC 2.20.2.3(I))</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-bold px-1.5 py-0.5 rounded text-[10px] min-w-[50px] text-center shrink-0">
                    ACU
                  </span>
                  <div className="space-y-0.5">
                    <p className="font-sans font-bold text-slate-700 dark:text-slate-300">Air Conditioning Units</p>
                    <p className="text-[10px] text-slate-400">Hermetic refrigerant motor-compressors sized at 125% FLC (PEC Article 4.40)</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-bold px-1.5 py-0.5 rounded text-[10px] min-w-[50px] text-center shrink-0">
                    M / WP
                  </span>
                  <div className="space-y-0.5">
                    <p className="font-sans font-bold text-slate-700 dark:text-slate-300">Motors / Pumps</p>
                    <p className="text-[10px] text-slate-400">Continuous motor loads sized per FLC values in PEC Tables 4.30 (largest motor @ 125%)</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-bold px-1.5 py-0.5 rounded text-[10px] min-w-[50px] text-center shrink-0">
                    WH / RE
                  </span>
                  <div className="space-y-0.5">
                    <p className="font-sans font-bold text-slate-700 dark:text-slate-300">Water Heaters & Ranges</p>
                    <p className="text-[10px] text-slate-400">Fixed appliances rated at nameplate VA. Range demand factor PEC Table 2.20.3.16</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-bold px-1.5 py-0.5 rounded text-[10px] min-w-[50px] text-center shrink-0">
                    SP/SPAC
                  </span>
                  <div className="space-y-0.5">
                    <p className="font-sans font-bold text-slate-700 dark:text-slate-300">Spare & Space</p>
                    <p className="text-[10px] text-slate-400">Spare (active overcurrent protector) or Space (empty enclosure bus physical slot)</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Wiring, Material & Conduit Standards */}
            <div className="space-y-4">
              <h5 className="text-[10px] uppercase tracking-widest font-black text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800/60 pb-2">
                Conductors & Conduits
              </h5>
              <div className="space-y-3 font-sans text-[11px] leading-relaxed">
                <p className="bg-slate-50 dark:bg-slate-800/30 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
                  ⚡ <strong>Wiring Medium:</strong> {panel.conductorMaterial || "Copper"} conductors with type {panel.insulationType || "THHN"}/{panel.insulationType === "THW" ? "THW" : "THWN-2"} thermoplastic jackets, rated for 90°C dry / 75°C wet operating conditions.
                </p>
                <p>
                  📏 <strong>Minimum Wire Sizes:</strong> Branch circuits feeding lighting loads must use a minimum wire size of <strong>2.0mm²</strong> (14 AWG) copper. Power and general convenience outlet circuits must use at least <strong>3.5mm²</strong> (12 AWG) copper.
                </p>
                <p>
                  📂 <strong>Conduit Specification:</strong> Thick-wall Schedule 40 PVC, Electrical Metallic Tubing (EMT), or Rigid Steel Conduit (RSC). Standard cross-sectional fill ratio must not exceed <strong>40%</strong> for three or more conductors (PEC Chapter 9, Tabular limits).
                </p>
                <p>
                  📉 <strong>Voltage Drop Limitations:</strong> Recommended maximum voltage drop on branch circuits is <strong>3%</strong>, and <strong>3%</strong> on feeder lines, with a maximum cumulative voltage drop of <strong>5%</strong> for overall system efficiency (PEC Part 1, FPN 2.10.1.19 & 2.15.1.2).
                </p>
              </div>
            </div>

            {/* Overcurrent & Grounding Rules */}
            <div className="space-y-4">
              <h5 className="text-[10px] uppercase tracking-widest font-black text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800/60 pb-2">
                Protection & Grounding
              </h5>
              <div className="space-y-3 font-sans text-[11px] leading-relaxed">
                <p>
                  🛡️ <strong>Overcurrent Protection:</strong> Sized according to load type: continuous loads are rated at <strong>125%</strong> of nominal ampacity, plus <strong>100%</strong> of non-continuous loads (PEC 2.15.1.3). Breakers utilize standard molded-case inverse-time principles.
                </p>
                <p>
                  🌱 <strong>Equipment Grounding Conductor (EGC):</strong> High-conductivity copper grounding conductor installed in all power conduits, sized per PEC Table 2.50.6.13 corresponding to circuit breaker rating. Conductor must remain insulated and color-coded Green or bare.
                </p>
                <p>
                  🔌 <strong>Service Grounding Electrode Conductor (GEC):</strong> Serves as main reference link to grounding rod / grid array. Sized per service entrance size in strict conformance with PEC Table 2.50.3.17.
                </p>
                <p className="bg-slate-50 dark:bg-slate-800/30 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 text-[10px]">
                  ⚖️ <strong>Dynamic Phase Balancing:</strong> Symmetrical balance must be maintained across Phase Line R, Y, and B. Target total imbalance is ideally <strong>&lt; 15%</strong> to minimize circulating neural currents and reduce feeder heat.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-amber-50 dark:bg-amber-950/20 p-6 rounded-2xl border border-amber-200 dark:border-amber-900/50 flex flex-col justify-center print:bg-white print:border-2 print:border-slate-800">
          <div className="flex items-center gap-2 mb-2 text-amber-800 dark:text-amber-400 font-bold text-sm uppercase print:text-slate-900">
            <ShieldAlert className="w-4 h-4 no-print" />
            Safety Disclaimer
          </div>
          <p className="text-[10px] text-amber-700 dark:text-amber-300 leading-relaxed font-medium print:text-slate-700">
            This document is generated for preliminary design and estimation
            purposes based on Philippine Electrical Code (PEC) guidelines.
            Calculations must be reviewed and certified by a{" "}
            <span className="font-bold underline text-amber-900 dark:text-amber-300 print:text-slate-900">
              Professional Electrical Engineer (PEE)
            </span>{" "}
            before implementation. The developers are not liable for errors in
            manual data entry or misinterpretations.
          </p>
        </div>
      </section>

      {/* Calculations & Formulas Section (Only visible during PDF export / print) */}
      <section className="hidden print-show mt-12 bg-white rounded-2xl border-2 border-slate-800 p-8">
        <div className="flex items-center gap-2 mb-6">
          <Calculator className="w-5 h-5 text-indigo-600" />
          <h2 className="text-lg font-bold text-slate-800 uppercase tracking-widest">
            Calculations & Formulas
          </h2>
        </div>

        <div className="space-y-6 text-sm text-slate-700">
          <div>
            <h3 className="font-bold text-slate-900 mb-2">
              1. Total Load Calculation
            </h3>
            <p className="mb-2">
              The total connected load is the sum of the Volt-Ampere (VA) rating
              of all circuits.
            </p>
            <div className="bg-slate-50 p-4 rounded-lg font-mono text-xs border border-slate-200">
              Total VA = Σ (Quantity × Wattage)
            </div>
            <p className="mt-2 text-indigo-600 font-bold">
              Calculated Total: {totalVA.toFixed(2)} VA
            </p>
          </div>

          <div>
            <h3 className="font-bold text-slate-900 mb-2">
              2. Single-Phase vs Three-Phase Current (Ampacity)
            </h3>
            <p className="mb-2">
              The total design current depends on the system type (1-Phase vs
              3-Phase). Based on PEC 2017 Part 1.
            </p>
            <div className="bg-slate-50 p-4 rounded-lg font-mono text-xs border border-slate-200 flex flex-col gap-2">
              <span>{`For 1-Phase: I = Total Connected VA / Voltage`}</span>
              <span>{`For 3-Phase: I = Total Connected VA / (1.732 × Voltage)`}</span>
            </div>
            <p className="mt-2 text-indigo-600 font-bold">
              Calculated Main Current: {mainCurrent.baseAmp.toFixed(2)} Amperes
              ({panel.system.includes("3PH") ? "Three-Phase" : "Single-Phase"},{" "}
              {panel.voltage}V)
            </p>
          </div>

          <div>
            <h3 className="font-bold text-slate-900 mb-2">
              3. Main Breaker Ampacity (AT) & Wire Sizing
            </h3>
            <p className="mb-2">
              According to PEC Article 2.10 and Article 2.40, the overcurrent
              protection (Circuit Breaker) rating and wire ampacity must follow
              continuous load multiplier rules.
            </p>
            <div className="bg-slate-50 p-4 rounded-lg font-mono text-xs border border-slate-200 flex flex-col gap-2">
              <span>
                Design Current incorporates Demand Factors (125% for Continuous
                Loads, 100% for Non-Continuous) + 25% for the largest Motor.
              </span>
              <span>
                Circuit Breaker Rating (AT) ≥ Design Current (Next Standard
                Size)
              </span>
              <span>
                Wire Ampacity ≥ Max(Design Current, Circuit Breaker Rating)
              </span>
            </div>
            <div className="mt-2 text-indigo-600 font-bold flex flex-col gap-1">
              <span>
                Design Current: {mainCurrent.designAmp.toFixed(2)} Amperes
              </span>
              <span>Selected Main Breaker: {mainFeeder.cb} AT</span>
              <span>
                Selected Main Wire:{" "}
                {mainFeeder.wire.runs > 1
                  ? `${mainFeeder.wire.runs} sets of `
                  : ""}
                {formatWireSize(mainFeeder.wire.size)} mm² {panel.insulationType || "THHN"} ({panel.conductorMaterial || "Copper"}) (Ampacity:{" "}
                {mainFeeder.wire.ampacity} A)
              </span>
              <span>Selected Main Conduit: {mainFeeder.conduitSize} {mainFeeder.conduitType || "PVC"}</span>
            </div>
          </div>

          {panel.system.includes("3PH") && (
            <div>
              <h3 className="font-bold text-slate-900 mb-2">
                4. Phase Balancing Check
              </h3>
              <p className="mb-2">
                For a well-designed electrical panel, the loads across the phases
                (R, Y, B) should be evenly distributed to prevent neutral current
                overload.
              </p>
              <div className="bg-slate-50 p-4 rounded-lg font-mono text-xs border border-slate-200 flex flex-col gap-2">
                <span>Max Phase Load = Max(Load_R, Load_Y, Load_B)</span>
                <span>Min Phase Load = Min(Load_R, Load_Y, Load_B)</span>
                <span>
                  Imbalance % = (1 - (Min Phase Load / Max Phase Load)) × 100
                </span>
              </div>
              <div className="mt-2 flex flex-col gap-1 text-sm font-bold">
                <span className="text-slate-600">
                  Phase R: {phaseLoads.R.toFixed(2)} VA
                </span>
                <span className="text-slate-600">
                  Phase Y: {phaseLoads.Y.toFixed(2)} VA
                </span>
                <span className="text-slate-600">
                  Phase B: {phaseLoads.B.toFixed(2)} VA
                </span>
                <span
                  className={
                    phaseImbalance > 15 ? "text-red-500" : "text-green-600"
                  }
                >
                  Phase Imbalance: {phaseImbalance.toFixed(2)}%{" "}
                  {phaseImbalance > 15 ? "(Warning: >15%)" : "(Acceptable)"}
                </span>
              </div>
            </div>
          )}
        </div>
      </section>
      
      {/* Rearrange Circuits Modal */}
      {showRearrangeModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 no-print">
          <div
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={() => setShowRearrangeModal(false)}
          ></div>
          <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-slate-200 dark:border-slate-800">
            <div className="flex justify-between items-center p-6 border-b border-slate-100 dark:border-slate-800 shrink-0">
              <div>
                <h2 className="text-xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <MoveVertical className="w-6 h-6 text-indigo-600" />
                  Rearrange Circuits
                </h2>
                <p className="text-sm font-medium text-slate-500 mt-1">
                  Drag and drop to easily reorder your circuits. Sequence numbers are updated automatically.
                </p>
              </div>
              <button
                onClick={() => setShowRearrangeModal(false)}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 bg-slate-50 dark:bg-slate-950">
              <DndContext 
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext 
                  items={circuits.map(c => c.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {circuits.map((c, index) => (
                    <SortableCircuitItem key={c.id} circuit={c} index={index} />
                  ))}
                </SortableContext>
              </DndContext>
            </div>
            
            <div className="p-6 border-t border-slate-100 dark:border-slate-800 shrink-0 flex justify-end">
              <button
                onClick={() => setShowRearrangeModal(false)}
                className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-lg shadow-sm hover:bg-indigo-700 transition"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Presets Modal */}
      {showPresetsModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 no-print">
          <div
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={() => setShowPresetsModal(false)}
          ></div>
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col border border-slate-200">
            <div className="p-6 border-b border-slate-100 shrink-0 flex flex-col gap-4 bg-slate-50 rounded-t-2xl">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
                  <List className="w-6 h-6 text-indigo-600" />
                  Load Schedule Reference Guide
                </h2>
                <div className="flex items-center gap-4">
                  <span className="text-sm font-bold text-slate-500 bg-white px-3 py-1 rounded border shadow-sm">
                    {filteredLoadPresets.reduce((sum, cat) => sum + cat.items.length, 0)} items found
                  </span>
                  <button
                    onClick={() => {
                      setPresetSearch("");
                      setPresetCategoryFilter("All");
                      setPresetLoadTypeFilter("All");
                      setPresetPhaseFilter("All");
                      setPresetSortBy("Alphabetical");
                      setPresetSortOrder("asc");
                    }}
                    className="text-xs font-bold text-slate-500 hover:text-indigo-600 transition"
                  >
                    Clear Filters
                  </button>
                  <button
                    onClick={() => {
                      setShowPresetsModal(false);
                      setSelectedPresets([]);
                    }}
                    className="p-2 hover:bg-slate-200 bg-white rounded-full transition-colors text-slate-500 shadow-sm border border-slate-200"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3">
                <div className="lg:col-span-2 relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search description, label, category..."
                    value={presetSearch}
                    onChange={(e) => setPresetSearch(e.target.value)}
                    className="w-full text-sm font-bold pl-9 pr-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white shadow-sm"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <select
                    value={presetCategoryFilter}
                    onChange={(e) => setPresetCategoryFilter(e.target.value)}
                    className="w-full text-xs font-bold px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white shadow-sm"
                  >
                    <option value="All">All Categories</option>
                    {dynamicLoadPresets.map(cat => (
                      <option key={cat.category} value={cat.category}>{cat.category}</option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <select
                    value={presetLoadTypeFilter}
                    onChange={(e) => setPresetLoadTypeFilter(e.target.value)}
                    className="w-full text-xs font-bold px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white shadow-sm"
                  >
                    <option value="All">All Load Types</option>
                    <option value="Lighting">Lighting</option>
                    <option value="Receptacle">Receptacle</option>
                    <option value="Motor">Motor</option>
                    <option value="Air Conditioning">Air Conditioning</option>
                    <option value="Appliance">Appliance</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <select
                    value={presetPhaseFilter}
                    onChange={(e) => setPresetPhaseFilter(e.target.value)}
                    className="w-full text-xs font-bold px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white shadow-sm"
                    disabled={!panel.system.includes("3PH")}
                  >
                    <option value="All">All Phases</option>
                    <option value="1 Phase">1 Phase</option>
                    <option value="3 Phase">3 Phase</option>
                  </select>
                </div>

                <div className="flex gap-2">
                  <select
                    value={presetSortBy}
                    onChange={(e) => setPresetSortBy(e.target.value)}
                    className="w-full text-xs font-bold px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white shadow-sm truncate"
                  >
                    <option value="Alphabetical">Sort: A-Z</option>
                    <option value="Wattage">Sort: Wattage</option>
                  </select>
                  <button
                    onClick={() => setPresetSortOrder(prev => prev === "asc" ? "desc" : "asc")}
                    className="px-3 py-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 shadow-sm transition"
                    title={presetSortOrder === "asc" ? "Ascending" : "Descending"}
                  >
                    {presetSortOrder === "asc" ? "↑" : "↓"}
                  </button>
                </div>
              </div>
            </div>

            <div className="p-6 overflow-y-auto w-full grid grid-cols-1 md:grid-cols-2 gap-8">
              {filteredLoadPresets.length === 0 ? (
                <div className="col-span-1 md:col-span-2 text-center py-12 text-slate-500 font-bold">
                  No matching loads found. Try clearing your filters.
                </div>
              ) : filteredLoadPresets.map((category, catIdx) => (
                <div
                  key={catIdx}
                  className="bg-slate-50 rounded-xl p-5 border border-slate-200"
                >
                  <h3 className="font-bold text-slate-800 mb-4 border-b border-slate-200 pb-2 flex justify-between items-end">
                    {category.category}
                  </h3>
                  <div className="flex flex-col gap-2">
                    {category.items.map((item, itemIdx) => {
                      const isSelected = selectedPresets.some(
                        (p) => p.description === item.description,
                      );
                      return (
                        <button
                          key={itemIdx}
                          onClick={() => {
                            if (selectedPresets.length > 0) {
                              if (isSelected) {
                                setSelectedPresets(
                                  selectedPresets.filter(
                                    (p) => p.description !== item.description,
                                  ),
                                );
                              } else {
                                setSelectedPresets([...selectedPresets, item]);
                              }
                            } else {
                              addCircuitFromPreset(item);
                            }
                          }}
                          className={`group flex justify-between items-center p-3 rounded-lg border transition-all text-left ${isSelected ? "bg-indigo-50 border-indigo-500 shadow-sm" : "bg-white border-slate-200 hover:border-indigo-400 hover:shadow-md"}`}
                        >
                          <div className="flex items-start gap-3">
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isSelected) {
                                  setSelectedPresets(
                                    selectedPresets.filter(
                                      (p) => p.description !== item.description,
                                    ),
                                  );
                                } else {
                                  setSelectedPresets([
                                    ...selectedPresets,
                                    item,
                                  ]);
                                }
                              }}
                              className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center cursor-pointer shrink-0 ${isSelected ? "bg-indigo-600 border-indigo-600" : "border-slate-300 hover:border-indigo-500"}`}
                            >
                              {isSelected && (
                                <svg
                                  className="w-3 h-3 text-white"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={3}
                                    d="M5 13l4 4L19 7"
                                  />
                                </svg>
                              )}
                            </div>
                            <div className="flex flex-col">
                              <span
                                className={`font-bold ${isSelected ? "text-indigo-800" : "text-slate-700 group-hover:text-indigo-700"}`}
                              >
                                {item.description}
                              </span>
                              <span className="text-xs text-slate-500 font-mono mt-1">
                                {item.label}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="bg-slate-100 text-slate-600 text-xs font-black px-2 py-1 rounded">
                              {item.loadType}
                            </span>
                            <span className="bg-indigo-50 text-indigo-700 text-sm font-black px-3 py-1 rounded w-16 text-center">
                              {item.wattage}W
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            {selectedPresets.length > 0 ? (
              <div className="p-4 border-t border-indigo-100 shrink-0 flex items-center justify-between bg-indigo-50/50">
                <div className="flex items-center gap-3">
                  <span className="font-bold text-indigo-700 bg-white px-3 py-1 rounded border border-indigo-200 shadow-sm">
                    {selectedPresets.length} items selected
                  </span>
                  <span className="text-sm font-bold text-slate-600 border-l border-indigo-200 pl-3">
                    Total combined load:{" "}
                    {selectedPresets.reduce(
                      (sum, item) => sum + item.wattage,
                      0,
                    )}
                    W
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      let nextNo =
                        circuits.length > 0
                          ? Math.max(...circuits.map((c) => c.circuitNo)) + 1
                          : 1;
                      const newCircuits = [...circuits];
                      selectedPresets.forEach((preset) => {
                        const base: Partial<Circuit> = {
                          id: crypto.randomUUID(),
                          circuitNo: nextNo++,
                          description: preset.description,
                          wattage: preset.wattage,
                          quantity: 1,
                          voltage: panel.voltage,
                          phases: ["R"],
                          loadType: preset.loadType as LoadType,
                          mcbType: MCBType.BOLT_ON,
                          wireType: "THHN",
                          conduitType: "PVC",
                        };
                        newCircuits.push({
                          ...base,
                          ...calculateCircuit(base),
                        } as Circuit);
                      });
                      setCircuits(newCircuits);
                      setSelectedPresets([]);
                      setShowPresetsModal(false);
                    }}
                    className="text-sm font-bold bg-white text-indigo-600 px-4 py-2 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors"
                  >
                    Add Individually
                  </button>
                  <button
                    onClick={addMultiLoadCircuitFromPresets}
                    className="text-sm font-bold bg-indigo-600 text-white px-4 py-2 rounded-lg shadow disabled:opacity-50 hover:bg-indigo-700 transition-colors"
                  >
                    Add as Single Circuit
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-4 border-t border-slate-100 shrink-0 flex justify-end text-sm text-slate-400 font-medium">
                Click any load or checkbox to select. Select multiple to
                combine.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
