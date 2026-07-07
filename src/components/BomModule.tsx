import React, { useState, useMemo, useEffect } from "react";
import * as XLSX from "xlsx-js-style";
import { 
  FileSpreadsheet, 
  Search, 
  Plus, 
  Trash2, 
  Lock, 
  Unlock, 
  RefreshCw, 
  CheckCircle, 
  AlertTriangle, 
  Printer, 
  Download, 
  Database, 
  Layers, 
  Briefcase, 
  Building2, 
  Edit3, 
  Save, 
  TrendingUp, 
  FileText,
  DollarSign
} from "lucide-react";
import { PanelConfig, Circuit, ShortCircuitParams, VoltageDropCalculation, LoadType } from "../types";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { exportBomToWord } from "../utils/exportBomToWord";

// Materials Library Item template
interface LibraryItem {
  id: string;
  category: string;
  name: string;
  brand: string;
  specification: string;
  unit: string;
  unitCost: number;
  rating?: string;
  supplierName?: string;
}

// Supplier registry interface
interface Supplier {
  id: string;
  name: string;
  contact: string;
  email: string;
  address: string;
  leadTime: string;
  brands: string[];
}

// Bill of Materials Item
export interface BomItem {
  id: string;
  category: "Conductors" | "Grounding" | "Conduits" | "Breakers" | "Switches" | "Distribution Equipment" | "Boxes" | "Lighting" | "Devices" | "Protection" | "Equipment" | "Accessories";
  name: string;
  description: string;
  brand: string;
  specification: string;
  quantity: number;
  unit: string;
  unitCost: number;
  laborCostPerUnit: number;
  remarks: string;
  isLocked: boolean; // lock from auto-recalculation
  source: string; // "MDP Circuit 1", "Main Transformer", "Manual Add", etc.
  rating?: string;
}

interface BomModuleProps {
  projectId?: string | null;
  panel: PanelConfig;
  circuits: Circuit[];
  subPanels: { id: string; panel: PanelConfig; circuits: Circuit[] }[];
  iscParams: ShortCircuitParams;
  vdCalculations: VoltageDropCalculation[];
  isPremium: boolean;
  onRequestUpgrade: () => void;
  savedBomItems?: BomItem[];
  savedBomSettings?: any;
  onSaveBom?: (items: BomItem[], settings: any) => void;
}

// Default standard Materials Library
const DEFAULT_LIBRARY_ITEMS: LibraryItem[] = [
  // Conductors (Copper & Aluminum)
  { id: "lib-cond-1", category: "Conductors", name: "THHN Copper Wire, 2.0 mm²", brand: "Phelps Dodge", specification: "600V, 90°C dry/75°C wet, PVC insulation", unit: "meters", unitCost: 15, rating: "2.0 mm²" },
  { id: "lib-cond-2", category: "Conductors", name: "THHN Copper Wire, 3.5 mm²", brand: "Phelps Dodge", specification: "600V, 90°C dry/75°C wet, PVC insulation", unit: "meters", unitCost: 24, rating: "3.5 mm²" },
  { id: "lib-cond-3", category: "Conductors", name: "THHN Copper Wire, 5.5 mm²", brand: "Phelps Dodge", specification: "600V, 90°C dry/75°C wet, PVC insulation", unit: "meters", unitCost: 38, rating: "5.5 mm²" },
  { id: "lib-cond-4", category: "Conductors", name: "THHN Copper Wire, 8.0 mm²", brand: "Phelps Dodge", specification: "600V, 90°C dry/75°C wet, PVC insulation", unit: "meters", unitCost: 55, rating: "8.0 mm²" },
  { id: "lib-cond-5", category: "Conductors", name: "THHN Copper Wire, 14.0 mm²", brand: "Phelps Dodge", specification: "600V, 90°C dry/75°C wet, PVC insulation", unit: "meters", unitCost: 95, rating: "14.0 mm²" },
  { id: "lib-cond-6", category: "Conductors", name: "THHN Copper Wire, 22.0 mm²", brand: "Phelps Dodge", specification: "600V, 90°C dry/75°C wet, PVC insulation", unit: "meters", unitCost: 150, rating: "22.0 mm²" },
  { id: "lib-cond-7", category: "Conductors", name: "THHN Copper Wire, 30.0 mm²", brand: "Phelps Dodge", specification: "600V, 90°C dry/75°C wet, PVC insulation", unit: "meters", unitCost: 210, rating: "30.0 mm²" },
  { id: "lib-cond-8", category: "Conductors", name: "THHN Copper Wire, 38.0 mm²", brand: "Phelps Dodge", specification: "600V, 90°C dry/75°C wet, PVC insulation", unit: "meters", unitCost: 265, rating: "38.0 mm²" },
  { id: "lib-cond-9", category: "Conductors", name: "THHN Copper Wire, 50.0 mm²", brand: "Phelps Dodge", specification: "600V, 90°C dry/75°C wet, PVC insulation", unit: "meters", unitCost: 345, rating: "50.0 mm²" },
  { id: "lib-cond-10", category: "Conductors", name: "THHN Copper Wire, 80.0 mm²", brand: "Phelps Dodge", specification: "600V, 90°C dry/75°C wet, PVC insulation", unit: "meters", unitCost: 540, rating: "80.0 mm²" },
  { id: "lib-cond-11", category: "Conductors", name: "THHN Copper Wire, 100.0 mm²", brand: "Phelps Dodge", specification: "600V, 90°C dry/75°C wet, PVC insulation", unit: "meters", unitCost: 680, rating: "100.0 mm²" },
  { id: "lib-cond-12", category: "Conductors", name: "THHN Copper Wire, 125.0 mm²", brand: "Phelps Dodge", specification: "600V, 90°C dry/75°C wet, PVC insulation", unit: "meters", unitCost: 850, rating: "125.0 mm²" },
  { id: "lib-cond-13", category: "Conductors", name: "THHN Copper Wire, 150.0 mm²", brand: "Phelps Dodge", specification: "600V, 90°C dry/75°C wet, PVC insulation", unit: "meters", unitCost: 1020, rating: "150.0 mm²" },
  { id: "lib-cond-14", category: "THHN Aluminum Wire, 14.0 mm²", name: "THHN Aluminum Wire, 14.0 mm²", brand: "Philflex", specification: "600V, 90°C dry/75°C wet, PVC insulation", unit: "meters", unitCost: 45, rating: "14.0 mm²" },
  { id: "lib-cond-15", category: "THHN Aluminum Wire, 22.0 mm²", name: "THHN Aluminum Wire, 22.0 mm²", brand: "Philflex", specification: "600V, 90°C dry/75°C wet, PVC insulation", unit: "meters", unitCost: 70, rating: "22.0 mm²" },
  { id: "lib-cond-16", category: "THHN Aluminum Wire, 38.0 mm²", name: "THHN Aluminum Wire, 38.0 mm²", brand: "Philflex", specification: "600V, 90°C dry/75°C wet, PVC insulation", unit: "meters", unitCost: 120, rating: "38.0 mm²" },
  // Conduits
  { id: "lib-conduit-1", category: "Conduits", name: "PVC Conduit, 20mm Ø", brand: "Neltex", specification: "Heavy duty thick wall, unplasticized PVC", unit: "meters", unitCost: 22, rating: "20mm" },
  { id: "lib-conduit-2", category: "Conduits", name: "PVC Conduit, 25mm Ø", brand: "Neltex", specification: "Heavy duty thick wall, unplasticized PVC", unit: "meters", unitCost: 30, rating: "25mm" },
  { id: "lib-conduit-3", category: "Conduits", name: "PVC Conduit, 32mm Ø", brand: "Neltex", specification: "Heavy duty thick wall, unplasticized PVC", unit: "meters", unitCost: 45, rating: "32mm" },
  { id: "lib-conduit-4", category: "Conduits", name: "PVC Conduit, 40mm Ø", brand: "Neltex", specification: "Heavy duty thick wall, unplasticized PVC", unit: "meters", unitCost: 65, rating: "40mm" },
  { id: "lib-conduit-5", category: "Conduits", name: "PVC Conduit, 50mm Ø", brand: "Neltex", specification: "Heavy duty thick wall, unplasticized PVC", unit: "meters", unitCost: 98, rating: "50mm" },
  { id: "lib-conduit-6", category: "Conduits", name: "PVC Conduit, 63mm Ø", brand: "Neltex", specification: "Heavy duty thick wall, unplasticized PVC", unit: "meters", unitCost: 155, rating: "63mm" },
  { id: "lib-conduit-7", category: "Conduits", name: "PVC Conduit, 75mm Ø", brand: "Neltex", specification: "Heavy duty thick wall, unplasticized PVC", unit: "meters", unitCost: 220, rating: "75mm" },
  { id: "lib-conduit-8", category: "Conduits", name: "PVC Conduit, 90mm Ø", brand: "Neltex", specification: "Heavy duty thick wall, unplasticized PVC", unit: "meters", unitCost: 310, rating: "90mm" },
  { id: "lib-conduit-9", category: "Conduits", name: "PVC Conduit, 110mm Ø", brand: "Neltex", specification: "Heavy duty thick wall, unplasticized PVC", unit: "meters", unitCost: 450, rating: "110mm" },
  { id: "lib-conduit-10", category: "Conduits", name: "IMC Steel Conduit, 20mm (1/2\")", brand: "Emerald", specification: "Intermediate Metal Conduit, zinc coated", unit: "meters", unitCost: 75, rating: "20mm" },
  { id: "lib-conduit-11", category: "Conduits", name: "IMC Steel Conduit, 25mm (3/4\")", brand: "Emerald", specification: "Intermediate Metal Conduit, zinc coated", unit: "meters", unitCost: 110, rating: "25mm" },
  { id: "lib-conduit-12", category: "Conduits", name: "IMC Steel Conduit, 32mm (1\")", brand: "Emerald", specification: "Intermediate Metal Conduit, zinc coated", unit: "meters", unitCost: 165, rating: "32mm" },
  // Breakers
  { id: "lib-brk-1", category: "Breakers", name: "Miniature Circuit Breaker, 15A 2-Pole Bolt-on", brand: "Schneider", specification: "10kAIC at 230V, Bolt-on type", unit: "pcs", unitCost: 650, rating: "15A 2P" },
  { id: "lib-brk-2", category: "Breakers", name: "Miniature Circuit Breaker, 20A 2-Pole Bolt-on", brand: "Schneider", specification: "10kAIC at 230V, Bolt-on type", unit: "pcs", unitCost: 650, rating: "20A 2P" },
  { id: "lib-brk-3", category: "Breakers", name: "Miniature Circuit Breaker, 30A 2-Pole Bolt-on", brand: "Schneider", specification: "10kAIC at 230V, Bolt-on type", unit: "pcs", unitCost: 680, rating: "30A 2P" },
  { id: "lib-brk-4", category: "Breakers", name: "Miniature Circuit Breaker, 40A 2-Pole Bolt-on", brand: "Schneider", specification: "10kAIC at 230V, Bolt-on type", unit: "pcs", unitCost: 720, rating: "40A 2P" },
  { id: "lib-brk-5", category: "Breakers", name: "Miniature Circuit Breaker, 50A 2-Pole Bolt-on", brand: "Schneider", specification: "10kAIC at 230V, Bolt-on type", unit: "pcs", unitCost: 750, rating: "50A 2P" },
  { id: "lib-brk-6", category: "Breakers", name: "Miniature Circuit Breaker, 60A 2-Pole Bolt-on", brand: "Schneider", specification: "10kAIC at 230V, Bolt-on type", unit: "pcs", unitCost: 850, rating: "60A 2P" },
  { id: "lib-brk-7", category: "Breakers", name: "Miniature Circuit Breaker, 100A 2-Pole Bolt-on", brand: "Schneider", specification: "10kAIC at 230V, Bolt-on type", unit: "pcs", unitCost: 1450, rating: "100A 2P" },
  { id: "lib-brk-8", category: "Breakers", name: "Molded Case Circuit Breaker, 100A 3-Pole 25kAIC", brand: "Schneider", specification: "25kAIC at 400V, MCCB frame", unit: "pcs", unitCost: 4800, rating: "100A 3P" },
  { id: "lib-brk-9", category: "Breakers", name: "Molded Case Circuit Breaker, 200A 3-Pole 35kAIC", brand: "Schneider", specification: "35kAIC at 400V, MCCB frame", unit: "pcs", unitCost: 8200, rating: "200A 3P" },
  { id: "lib-brk-10", category: "Breakers", name: "Molded Case Circuit Breaker, 400A 3-Pole 50kAIC", brand: "Schneider", specification: "50kAIC at 400V, MCCB frame", unit: "pcs", unitCost: 18500, rating: "400A 3P" },
  // Boxes & Enclosures
  { id: "lib-box-1", category: "Boxes", name: "Utility Box, Metal, Galvanized", brand: "Kotatsu", specification: "2\"x4\" Deep type with knockouts", unit: "pcs", unitCost: 45 },
  { id: "lib-box-2", category: "Boxes", name: "Junction Box, Metal, Galvanized with Cover", brand: "Kotatsu", specification: "4\" Octagonal with knockouts", unit: "pcs", unitCost: 65 },
  { id: "lib-box-3", category: "Boxes", name: "Square Pull Box, 6\"x6\"x4\" Metal with Cover", brand: "Kotatsu", specification: "NEMA 1 Indoor type", unit: "pcs", unitCost: 280 },
  { id: "lib-box-4", category: "Boxes", name: "Square Pull Box, 12\"x12\"x6\" NEMA 3R Outdoor", brand: "Kotatsu", specification: "Weatherproof gasketed cover", unit: "pcs", unitCost: 1450 },
  // Grounding
  { id: "lib-gnd-1", category: "Grounding", name: "Copper Clad Steel Ground Rod, 3/4\" x 10ft", brand: "Erico", specification: "99.9% pure copper electrolytic plating", unit: "pcs", unitCost: 950 },
  { id: "lib-gnd-2", category: "Grounding", name: "Heavy Duty Ground Rod Clamp, 3/4\"", brand: "Erico", specification: "High strength copper alloy bolt type", unit: "pcs", unitCost: 180 },
  { id: "lib-gnd-3", category: "Grounding", name: "Exothermic Welding Charge, #45", brand: "Cadweld", specification: "Standard weld metal shot with disk", unit: "pcs", unitCost: 420 },
  // Accessories & Fittings
  { id: "lib-acc-1", category: "Accessories", name: "PVC Connector with Locknut, 20mm", brand: "Neltex", specification: "Threaded adapter with heavy nut", unit: "pcs", unitCost: 8 },
  { id: "lib-acc-2", category: "Accessories", name: "PVC Connector with Locknut, 25mm", brand: "Neltex", specification: "Threaded adapter with heavy nut", unit: "pcs", unitCost: 12 },
  { id: "lib-acc-3", category: "Accessories", name: "PVC Conduit Coupling, 20mm", brand: "Neltex", specification: "Slip-fit sleeve socket", unit: "pcs", unitCost: 6 },
  { id: "lib-acc-4", category: "Accessories", name: "PVC Conduit Coupling, 25mm", brand: "Neltex", specification: "Slip-fit sleeve socket", unit: "pcs", unitCost: 8 },
  { id: "lib-acc-5", category: "Accessories", name: "Unistrut Metal Channel Support, 10ft", brand: "Superstrut", specification: "Galvanized 1-5/8\" x 1-5/8\"", unit: "pcs", unitCost: 650 },
  { id: "lib-acc-6", category: "Accessories", name: "Conduit Strap/Clamp with Bolt, 20mm", brand: "Neltex", specification: "Heavy duty zinc plated pipe clamp", unit: "pcs", unitCost: 10 },
  { id: "lib-acc-7", category: "Accessories", name: "Solderless Copper Cable Lug, 38 mm²", brand: "Calterm", specification: "One-hole heavy duty barrel", unit: "pcs", unitCost: 95 },
  { id: "lib-acc-8", category: "Accessories", name: "Solderless Copper Cable Lug, 8.0 mm²", brand: "Calterm", specification: "One-hole medium duty barrel", unit: "pcs", unitCost: 35 },
];

// Default standard Supplier database
const DEFAULT_SUPPLIERS: Supplier[] = [
  { id: "sup-1", name: "Luzon Electrical Supply Inc.", contact: "Engr. Marco Santos (02-8824-1111)", email: "sales@luzonelectrical.ph", address: "Soler St, Binondo, Manila, Philippines", leadTime: "2-3 days", brands: ["Schneider", "Phelps Dodge", "Neltex", "Erico", "ABB"] },
  { id: "sup-2", name: "Asia Pacific Industrial Supply", contact: "Ms. Clara Cheng (02-8512-4521)", email: "quotes@asiapacific.com.ph", address: "Ortigas Center, Pasig City, Metro Manila", leadTime: "3-5 days", brands: ["Siemens", "Philflex", "Emerald", "Cadweld", "Eaton"] },
  { id: "sup-3", name: "Visayas Co-op Electrical Distributor", contact: "Mr. Jose Garcia (032-231-5000)", email: "jose.garcia@visayascoop.com", address: "Mandaue City, Cebu, Philippines", leadTime: "5-7 days", brands: ["Schneider", "Phelps Dodge", "Neltex", "Fuji Electric", "Panasonic"] },
  { id: "sup-4", name: "Mindanao Power & Cable Trading", contact: "Engr. Sandra Lim (082-299-4400)", email: "sandralim@mindanaopower.ph", address: "Lanang, Davao City, Philippines", leadTime: "4-6 days", brands: ["Chint", "LS Electric", "Philflex", "Neltex", "Mitsubishi"] },
];

export default function BomModule({
  projectId,
  panel,
  circuits,
  subPanels,
  iscParams,
  vdCalculations,
  isPremium,
  onRequestUpgrade,
  savedBomItems,
  savedBomSettings,
  onSaveBom
}: BomModuleProps) {

  // Active sub-tab
  const [activeTab, setActiveTab] = useState<"workspace" | "alternatives" | "database" | "suppliers" | "summary" | "audit">("workspace");
  const [lastProjectId, setLastProjectId] = useState<string | null | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");

  // Local settings (initially from props or defaults)
  const [wasteConductors, setWasteConductors] = useState<number>(savedBomSettings?.wasteConductors ?? 10);
  const [wasteConduits, setWasteConduits] = useState<number>(savedBomSettings?.wasteConduits ?? 5);
  const [wasteAccessories, setWasteAccessories] = useState<number>(savedBomSettings?.wasteAccessories ?? 5);
  const [laborRatePercent, setLaborRatePercent] = useState<number>(savedBomSettings?.laborRatePercent ?? 35);
  const [taxRatePercent, setTaxRatePercent] = useState<number>(savedBomSettings?.taxRatePercent ?? 12);
  const [profitMarginPercent, setProfitMarginPercent] = useState<number>(savedBomSettings?.profitMarginPercent ?? 15);
  const [contingencyPercent, setContingencyPercent] = useState<number>(savedBomSettings?.contingencyPercent ?? 5);

  const [preferredBrandConductors, setPreferredBrandConductors] = useState<string>(savedBomSettings?.preferredBrandConductors ?? "Phelps Dodge");
  const [preferredBrandConduits, setPreferredBrandConduits] = useState<string>(savedBomSettings?.preferredBrandConduits ?? "Neltex");
  const [preferredBrandBreakers, setPreferredBrandBreakers] = useState<string>(savedBomSettings?.preferredBrandBreakers ?? "Schneider");
  const [preferredBrandAccessories, setPreferredBrandAccessories] = useState<string>(savedBomSettings?.preferredBrandAccessories ?? "Neltex");

  // Database of available materials
  const [library, setLibrary] = useState<LibraryItem[]>(DEFAULT_LIBRARY_ITEMS);
  const [suppliers, setSuppliers] = useState<Supplier[]>(DEFAULT_SUPPLIERS);

  // Active items in the Bill of Materials
  const [bomItems, setBomItems] = useState<BomItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<string[]>([]);

  // Dialog / Edit states
  const [editingItem, setEditingItem] = useState<BomItem | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newItem, setNewItem] = useState<Partial<BomItem>>({
    category: "Conductors",
    name: "",
    description: "",
    brand: "",
    specification: "",
    quantity: 1,
    unit: "pcs",
    unitCost: 100,
    laborCostPerUnit: 0,
    remarks: "",
    source: "Manual Add"
  });

  // Library Management Modal States
  const [editingLibItem, setEditingLibItem] = useState<LibraryItem | null>(null);
  const [showAddLibModal, setShowAddLibModal] = useState(false);
  const [newLibItem, setNewLibItem] = useState<Partial<LibraryItem>>({
    category: "Conductors",
    name: "",
    brand: "Phelps Dodge",
    specification: "",
    unit: "meters",
    unitCost: 10
  });

  // Helper: get lengths from voltage drop calculations
  const getCircuitLength = (circuitId: string): number => {
    const vd = vdCalculations.find(v => v.source === circuitId);
    return vd && vd.length ? vd.length : 30; // 30m default fallback for branch
  };

  const getFeederLength = (panelId: string): number => {
    const vd = vdCalculations.find(v => v.source === panelId);
    return vd && vd.length ? vd.length : 50; // 50m default fallback for feeders
  };

  // Run Quantity Takeoff and build/synchronize the BOM
  const synchronizeBOM = (forceReset: boolean = false) => {
    const logs: string[] = [];
    const timestamp = new Date().toLocaleTimeString();
    logs.push(`[${timestamp}] Initiated PEC-compliant BOM Takeoff synchronization.`);

    // Keep locked items, discard others if not force reset
    const lockedItems = forceReset ? [] : bomItems.filter(item => item.isLocked);
    if (lockedItems.length > 0) {
      logs.push(`[${timestamp}] Preserved ${lockedItems.length} manually modified/locked material lines.`);
    }

    const generatedItems: BomItem[] = [];

    // Auxiliary to safely add or consolidate items
    const addItem = (item: Omit<BomItem, "id" | "isLocked">) => {
      // Check if there's a locked item matching the exact name and source
      const isOverridden = lockedItems.some(
        li => li.name === item.name && li.source === item.source
      );
      if (isOverridden) return;

      // Consolidate identical items from the same source
      const existing = generatedItems.find(
        gi => gi.name === item.name && gi.source === item.source && gi.category === item.category && gi.brand === item.brand
      );

      if (existing) {
        existing.quantity += item.quantity;
      } else {
        generatedItems.push({
          ...item,
          id: `gen-${Math.random().toString(36).substr(2, 9)}`,
          isLocked: false
        });
      }
    };

    // 1. GENERATE FOR CIRCUIT BREAKERS & CONDUCTORS FROM MDP
    const mdpId = panel.designation || "Main Distribution Panel";
    logs.push(`[${timestamp}] Extracting circuits from main panel: ${mdpId}`);

    // Main Overcurrent Protective Device
    const mainBreakerRating = panel.mainBreakerAT || 100;
    const mainBreakerPoles = panel.system.includes("3PH") ? 3 : 2;
    const mainBreakerCost = mainBreakerRating > 100 ? 5800 : 18500; // approximation
    addItem({
      category: "Breakers",
      name: `Main Circuit Breaker, ${mainBreakerRating}AT/${panel.mainBreakerAF || 100}AF, ${mainBreakerPoles}P`,
      description: `Main protective breaker with interrupting capacity of ${panel.icRating || "10"} kAIC`,
      brand: preferredBrandBreakers,
      specification: `MCCB, NEMA Type 1 or Standard Box fitting, compliant with PEC Sec 2.40`,
      quantity: 1,
      unit: "pcs",
      unitCost: mainBreakerCost,
      laborCostPerUnit: mainBreakerCost * 0.15,
      remarks: "Main service protection",
      source: `Panel [${mdpId}] Main`
    });

    // Main Cabinet/Panel Box Enclosure
    addItem({
      category: "Distribution Equipment",
      name: `Panelboard Enclosure Cabinet - ${mdpId}`,
      description: `NEMA ${panel.mounting === "Flush" ? "1 Flush" : "1 Surface"} Panelboard Enclosure Cabinet, ${circuits.length} branches space`,
      brand: preferredBrandAccessories,
      specification: `Fabricated 1.5mm thick gauge metal, powder-coated ANSI 61 gray, busbar system included`,
      quantity: 1,
      unit: "pcs",
      unitCost: 3500 + (circuits.length * 150),
      laborCostPerUnit: 1200,
      remarks: `Main distribution cabinet - ${panel.mounting} mount`,
      source: `Panel [${mdpId}]`
    });

    // Grounding Kit for main panel
    addItem({
      category: "Grounding",
      name: "Copper Clad Ground Rod, 3/4\" x 10ft",
      description: "High-grade steel core rod with electrolytic copper cladding",
      brand: "Erico",
      specification: "PEC Article 2.50 compliant",
      quantity: 2,
      unit: "pcs",
      unitCost: 950,
      laborCostPerUnit: 400,
      remarks: "Service grounding system",
      source: "Grounding System"
    });
    addItem({
      category: "Grounding",
      name: "Ground Rod Clamp, 3/4\"",
      description: "Heavy-duty bronze direct burial ground clamp",
      brand: "Erico",
      specification: "Threaded bolt mechanical clamp",
      quantity: 2,
      unit: "pcs",
      unitCost: 180,
      laborCostPerUnit: 80,
      remarks: "Clamp connection to ground rods",
      source: "Grounding System"
    });

    // Transfer Switch (ATS / MTS)
    if (panel.transferSwitchType && panel.transferSwitchType !== "None") {
      const tsRating = panel.transferSwitchRating || mainBreakerRating;
      const tsCost = panel.transferSwitchType === "ATS" ? tsRating * 120 : tsRating * 45;
      addItem({
        category: "Switches",
        name: `${panel.transferSwitchType === "ATS" ? "Automatic" : "Manual"} Transfer Switch (ATS/MTS) - ${tsRating}A`,
        description: `${panel.transferSwitchPoles || mainBreakerPoles} Pole, ${panel.transferSwitchType === "ATS" ? "ATS" : "MTS"} generator transfer panel`,
        brand: panel.transferSwitchManufacturer || preferredBrandBreakers,
        specification: `SCCR ${panel.transferSwitchSCCR || "10kA"}, NEMA 1 Enclosure, Model: ${panel.transferSwitchModel || "Standard"}`,
        quantity: 1,
        unit: "pcs",
        unitCost: tsCost,
        laborCostPerUnit: tsCost * 0.12,
        remarks: panel.transferSwitchRemarks || "Generator backup line transition",
        source: `Panel [${mdpId}]`
      });
    }

    // Branch Circuits
    circuits.forEach((c) => {
      // Ignore space/spare
      if (c.loadType === LoadType.SPACE || c.loadType === LoadType.SPARE) return;

      const is3Ph = (c.is3PhaseMarker !== undefined ? c.is3PhaseMarker : (c.phases && c.phases.length > 2));
      const poles = is3Ph ? 3 : (c.mcbP || 2);
      const wireSets = c.wireSets || 1;

      // Extract Branch Circuit Breakers
      let breakerCost = 650; // fallback standard bolt-on price
      if (c.mcbAT > 100) breakerCost = 4500;
      else if (c.mcbAT > 50) breakerCost = 1200;

      addItem({
        category: "Breakers",
        name: `Circuit Breaker, ${c.mcbAT}AT/${c.mcbAF || 50}AF, ${poles}P, ${c.mcbType}`,
        description: `Interrupting capacity: ${c.mcbKAIC || 10} kAIC at 230V`,
        brand: preferredBrandBreakers,
        specification: `Bolt-on / plug-in molded breaker matching schedule specs`,
        quantity: 1,
        unit: "pcs",
        unitCost: breakerCost,
        laborCostPerUnit: breakerCost * 0.15,
        remarks: `Branch protection for Circuit ${c.circuitNo} (${c.description})`,
        source: `Panel [${mdpId}] Circuit ${c.circuitNo}`
      });

      // Branch Wires (Conductors)
      const length = getCircuitLength(c.id);
      const wireSizeStr = c.wireSizeOverride || c.calculatedWireSize || c.wireSize || "2.0";
      const wireSizeNum = parseFloat(wireSizeStr);
      
      // Determine standard price for wire from database or fallback scale
      const matchingLibWire = library.find(l => l.category === "Conductors" && l.rating === `${wireSizeStr} mm²`);
      const baseWireCost = matchingLibWire ? matchingLibWire.unitCost : (wireSizeNum * 5 + 10);

      // Branch circuits are usually 1PH (2 active wires) or 3PH (3 active wires)
      const conductorCount = is3Ph ? 3 : 2;
      const totalConductorMeters = length * conductorCount * wireSets * (1 + wasteConductors / 100);

      addItem({
        category: "Conductors",
        name: `THHN Copper Wire, ${wireSizeStr} mm²`,
        description: `Thermoplastic High Heat-Resistant Nylon-insulated, 600V`,
        brand: preferredBrandConductors,
        specification: `Annealed copper conductor, compliant with PEC Table 3.10.2.6(B)(16)`,
        quantity: Math.ceil(totalConductorMeters),
        unit: "meters",
        unitCost: baseWireCost,
        laborCostPerUnit: baseWireCost * 0.25,
        remarks: `Circuit ${c.circuitNo} Phase Wires (${wireSets} run/s)`,
        source: `Panel [${mdpId}] Circuit ${c.circuitNo}`
      });

      // Neutral Wire if Single Phase Line-to-Neutral (or if 3 Phase 4-Wire)
      const hasNeutral = panel.connectionType === "Line-to-Neutral" || (is3Ph && panel.system.includes("4W"));
      if (hasNeutral) {
        const totalNeutralMeters = length * wireSets * (1 + wasteConductors / 100);
        addItem({
          category: "Conductors",
          name: `THHN Copper Wire, ${wireSizeStr} mm² (Neutral)`,
          description: `Neutral Conductor (White/Gray coded), 600V`,
          brand: preferredBrandConductors,
          specification: `Annealed copper conductor matching Phase size for general branch`,
          quantity: Math.ceil(totalNeutralMeters),
          unit: "meters",
          unitCost: baseWireCost,
          laborCostPerUnit: baseWireCost * 0.25,
          remarks: `Circuit ${c.circuitNo} Neutral line`,
          source: `Panel [${mdpId}] Circuit ${c.circuitNo}`
        });
      }

      // Equipment Grounding Conductor (EGC)
      const egcSizeStr = c.groundSize || "2.0";
      const egcSizeNum = parseFloat(egcSizeStr);
      const matchingLibEgc = library.find(l => l.category === "Conductors" && l.rating === `${egcSizeStr} mm²`);
      const egcWireCost = matchingLibEgc ? matchingLibEgc.unitCost : (egcSizeNum * 5 + 10);
      const totalEgcMeters = length * wireSets * (1 + wasteConductors / 100);

      addItem({
        category: "Conductors",
        name: `THHN Copper Wire, ${egcSizeStr} mm² (Ground)`,
        description: `Equipment Grounding Conductor (Green coded), 600V`,
        brand: preferredBrandConductors,
        specification: `Annealed copper grounding wire compliant with PEC Table 2.50.6.13`,
        quantity: Math.ceil(totalEgcMeters),
        unit: "meters",
        unitCost: egcWireCost,
        laborCostPerUnit: egcWireCost * 0.25,
        remarks: `Circuit ${c.circuitNo} Ground conductor`,
        source: `Panel [${mdpId}] Circuit ${c.circuitNo}`
      });

      // Branch Conduits
      const conduitSizeStr = c.conduitSizeOverride || c.calculatedConduitSize || c.conduitSize || "20";
      const conduitType = c.conduitTypeOverride || c.conduitType || "PVC";
      const totalConduitMeters = length * (1 + wasteConduits / 100);

      const matchingConduit = library.find(l => l.category === "Conduits" && l.rating === `${conduitSizeStr}mm` && l.name.includes(conduitType));
      const baseConduitCost = matchingConduit ? matchingConduit.unitCost : (parseInt(conduitSizeStr) * 1.5 + 10);

      addItem({
        category: "Conduits",
        name: `${conduitType} Conduit, ${conduitSizeStr}mm Ø`,
        description: `Electrical conduit raceway for branch circuit runs`,
        brand: preferredBrandConduits,
        specification: `${conduitType === "PVC" ? "uPVC Thick-wall Heavy Duty" : "Rigid/Intermediate Steel Conduit"}`,
        quantity: Math.ceil(totalConduitMeters),
        unit: "meters",
        unitCost: baseConduitCost,
        laborCostPerUnit: baseConduitCost * 0.35,
        remarks: `Circuit ${c.circuitNo} Raceway`,
        source: `Panel [${mdpId}] Circuit ${c.circuitNo}`
      });

      // Fittings and Boxes per circuit (1 Utility/Junction Box, connectors and locknuts)
      addItem({
        category: "Boxes",
        name: c.loadType === "L" ? "Junction Box, Octagonal Metal" : "Utility Box, Rectangular Metal",
        description: `Outlet / connection box for circuit outlets`,
        brand: "Kotatsu",
        specification: "Standard galvanized steel with multiple conduit knockouts",
        quantity: 1,
        unit: "pcs",
        unitCost: c.loadType === "L" ? 65 : 45,
        laborCostPerUnit: 25,
        remarks: `Circuit ${c.circuitNo} box housing`,
        source: `Panel [${mdpId}] Circuit ${c.circuitNo}`
      });

      addItem({
        category: "Accessories",
        name: `PVC Connector with Locknut, ${conduitSizeStr}mm`,
        description: `Conduit fitting adapter to secure conduits to panel/utility boxes`,
        brand: preferredBrandConduits,
        specification: "Threaded PVC male adapter with securing ring",
        quantity: 2,
        unit: "pcs",
        unitCost: parseInt(conduitSizeStr) > 25 ? 18 : 8,
        laborCostPerUnit: 5,
        remarks: "Box connector endpoints",
        source: `Panel [${mdpId}] Circuit ${c.circuitNo}`
      });

      addItem({
        category: "Accessories",
        name: `PVC Conduit Coupling, ${conduitSizeStr}mm`,
        description: "Socket pipe sleeve for joining conduit lengths",
        brand: preferredBrandConduits,
        specification: "Slip-fit PVC coupling sleeve",
        quantity: Math.ceil(totalConduitMeters / 3), // 1 coupling per 3m standard conduit pipe
        unit: "pcs",
        unitCost: parseInt(conduitSizeStr) > 25 ? 15 : 6,
        laborCostPerUnit: 4,
        remarks: "Conduit joint couplings",
        source: `Panel [${mdpId}] Circuit ${c.circuitNo}`
      });
    });

    // 2. GENERATE FOR SUB-PANELS IN HIERARCHY
    subPanels.forEach((sp) => {
      const spId = sp.panel.designation || "Sub-Panel";
      logs.push(`[${timestamp}] Extracting circuits from sub-panel: ${spId}`);

      const spMainBreaker = sp.panel.mainBreakerAT || 60;
      const spMainPoles = sp.panel.system.includes("3PH") ? 3 : 2;
      const spBreakerCost = spMainBreaker > 100 ? 5800 : 18500;

      addItem({
        category: "Breakers",
        name: `Sub-Panel Main Breaker, ${spMainBreaker}AT/${sp.panel.mainBreakerAF || 100}AF, ${spMainPoles}P`,
        description: `Main overcurrent protective device for Sub-panelboard ${spId}`,
        brand: preferredBrandBreakers,
        specification: `MCCB / Bolt-on, matching subpanel current load rating`,
        quantity: 1,
        unit: "pcs",
        unitCost: spBreakerCost,
        laborCostPerUnit: spBreakerCost * 0.15,
        remarks: "Sub-panel incoming feeder protection",
        source: `Panel [${spId}] Main`
      });

      addItem({
        category: "Distribution Equipment",
        name: `Panelboard Enclosure Cabinet - ${spId}`,
        description: `NEMA ${sp.panel.mounting === "Flush" ? "1 Flush" : "1 Surface"} Enclosure Cabinet, ${sp.circuits.length} branches space`,
        brand: preferredBrandAccessories,
        specification: `Fabricated metal enclosure, ANSI 61 gray matching main standard`,
        quantity: 1,
        unit: "pcs",
        unitCost: 3000 + (sp.circuits.length * 150),
        laborCostPerUnit: 1000,
        remarks: `Secondary subpanel cabinet - ${sp.panel.mounting} mount`,
        source: `Panel [${spId}]`
      });

      // Subpanel branch circuits
      sp.circuits.forEach((sc) => {
        if (sc.loadType === LoadType.SPACE || sc.loadType === LoadType.SPARE) return;

        const sIs3Ph = (sc.is3PhaseMarker !== undefined ? sc.is3PhaseMarker : (sc.phases && sc.phases.length > 2));
        const sPoles = sIs3Ph ? 3 : (sc.mcbP || 2);
        const sWireSets = sc.wireSets || 1;

        let sBreakerCost = 650;
        if (sc.mcbAT > 100) sBreakerCost = 4500;
        else if (sc.mcbAT > 50) sBreakerCost = 1200;

        addItem({
          category: "Breakers",
          name: `Circuit Breaker, ${sc.mcbAT}AT/${sc.mcbAF || 50}AF, ${sPoles}P, ${sc.mcbType}`,
          description: `Interrupting capacity: ${sc.mcbKAIC || 10} kAIC at 230V`,
          brand: preferredBrandBreakers,
          specification: "Standard branch miniature circuit breaker",
          quantity: 1,
          unit: "pcs",
          unitCost: sBreakerCost,
          laborCostPerUnit: sBreakerCost * 0.15,
          remarks: `Branch protection for Circuit ${sc.circuitNo} (${sc.description})`,
          source: `Panel [${spId}] Circuit ${sc.circuitNo}`
        });

        // Wires for subpanel branch
        const sLength = getCircuitLength(sc.id);
        const sWireSizeStr = sc.wireSizeOverride || sc.calculatedWireSize || sc.wireSize || "2.0";
        const sWireSizeNum = parseFloat(sWireSizeStr);
        const sMatchingWire = library.find(l => l.category === "Conductors" && l.rating === `${sWireSizeStr} mm²`);
        const sBaseWireCost = sMatchingWire ? sMatchingWire.unitCost : (sWireSizeNum * 5 + 10);

        const sConductorCount = sIs3Ph ? 3 : 2;
        const sTotalConductorMeters = sLength * sConductorCount * sWireSets * (1 + wasteConductors / 100);

        addItem({
          category: "Conductors",
          name: `THHN Copper Wire, ${sWireSizeStr} mm²`,
          brand: preferredBrandConductors,
          description: "Branch feeder conductors, 600V PVC copper wire",
          specification: "PEC Table 3.10.2.6(B)(16) compliant",
          quantity: Math.ceil(sTotalConductorMeters),
          unit: "meters",
          unitCost: sBaseWireCost,
          laborCostPerUnit: sBaseWireCost * 0.25,
          remarks: `Circuit ${sc.circuitNo} Phase Wires`,
          source: `Panel [${spId}] Circuit ${sc.circuitNo}`
        });

        const sHasNeutral = sp.panel.connectionType === "Line-to-Neutral" || (sIs3Ph && sp.panel.system.includes("4W"));
        if (sHasNeutral) {
          const sTotalNeutralMeters = sLength * sWireSets * (1 + wasteConductors / 100);
          addItem({
            category: "Conductors",
            name: `THHN Copper Wire, ${sWireSizeStr} mm² (Neutral)`,
            brand: preferredBrandConductors,
            description: "Neutral line conductor, 600V",
            specification: "Color coded White/Gray for neutral grounding line",
            quantity: Math.ceil(sTotalNeutralMeters),
            unit: "meters",
            unitCost: sBaseWireCost,
            laborCostPerUnit: sBaseWireCost * 0.25,
            remarks: `Circuit ${sc.circuitNo} Neutral line`,
            source: `Panel [${spId}] Circuit ${sc.circuitNo}`
          });
        }

        const sEgcSizeStr = sc.groundSize || "2.0";
        const sEgcSizeNum = parseFloat(sEgcSizeStr);
        const sMatchingEgc = library.find(l => l.category === "Conductors" && l.rating === `${sEgcSizeStr} mm²`);
        const sEgcWireCost = sMatchingEgc ? sMatchingEgc.unitCost : (sEgcSizeNum * 5 + 10);
        const sTotalEgcMeters = sLength * sWireSets * (1 + wasteConductors / 100);

        addItem({
          category: "Conductors",
          name: `THHN Copper Wire, ${sEgcSizeStr} mm² (Ground)`,
          brand: preferredBrandConductors,
          description: "Grounding protection, Green insulated copper",
          specification: "PEC compliant Equipment Grounding Wire",
          quantity: Math.ceil(sTotalEgcMeters),
          unit: "meters",
          unitCost: sEgcWireCost,
          laborCostPerUnit: sEgcWireCost * 0.25,
          remarks: `Circuit ${sc.circuitNo} Ground conductor`,
          source: `Panel [${spId}] Circuit ${sc.circuitNo}`
        });

        const sConduitSizeStr = sc.conduitSizeOverride || sc.calculatedConduitSize || sc.conduitSize || "20";
        const sConduitType = sc.conduitTypeOverride || sc.conduitType || "PVC";
        const sTotalConduitMeters = sLength * (1 + wasteConduits / 100);
        const sMatchingConduit = library.find(l => l.category === "Conduits" && l.rating === `${sConduitSizeStr}mm` && l.name.includes(sConduitType));
        const sBaseConduitCost = sMatchingConduit ? sMatchingConduit.unitCost : (parseInt(sConduitSizeStr) * 1.5 + 10);

        addItem({
          category: "Conduits",
          name: `${sConduitType} Conduit, ${sConduitSizeStr}mm Ø`,
          brand: preferredBrandConduits,
          description: "Branch conduit pipeline protection",
          specification: `${sConduitType} Conduit, Class thick-wall standard`,
          quantity: Math.ceil(sTotalConduitMeters),
          unit: "meters",
          unitCost: sBaseConduitCost,
          laborCostPerUnit: sBaseConduitCost * 0.35,
          remarks: `Circuit ${sc.circuitNo} Raceway`,
          source: `Panel [${spId}] Circuit ${sc.circuitNo}`
        });

        // Box and fittings
        addItem({
          category: "Boxes",
          name: sc.loadType === "L" ? "Junction Box, Octagonal Metal" : "Utility Box, Rectangular Metal",
          description: "Secondary branch outlet junction box housing",
          brand: "Kotatsu",
          specification: "Galvanized utility wall box",
          quantity: 1,
          unit: "pcs",
          unitCost: sc.loadType === "L" ? 65 : 45,
          laborCostPerUnit: 25,
          remarks: `Circuit ${sc.circuitNo} Box housing`,
          source: `Panel [${spId}] Circuit ${sc.circuitNo}`
        });
      });
    });

    // Combine newly generated auto-takeoff items and preserved manually locked items
    const combined = [...lockedItems, ...generatedItems];
    setBomItems(combined);

    logs.push(`[${timestamp}] Successfully generated ${combined.length} BOM lines with full quantities Takeoff.`);
    setAuditLogs(prev => [...logs, ...prev]);

    // Save back to parent state if available
    if (onSaveBom) {
      onSaveBom(combined, {
        wasteConductors,
        wasteConduits,
        wasteAccessories,
        laborRatePercent,
        taxRatePercent,
        profitMarginPercent,
        contingencyPercent,
        preferredBrandConductors,
        preferredBrandConduits,
        preferredBrandBreakers,
        preferredBrandAccessories
      });
    }
  };

  // Load saved BOM items when a different project is loaded
  useEffect(() => {
    setLastProjectId(projectId);
    if (savedBomItems && savedBomItems.length > 0) {
      setBomItems(savedBomItems);
    } else {
      synchronizeBOM();
    }
  }, [projectId]);

  // Re-run auto-synchronization when panel/circuits/etc change within the same project
  useEffect(() => {
    // Avoid running on the very first mount before lastProjectId is initialized
    if (lastProjectId === undefined) return;
    // Avoid running when project ID has just changed (the other effect handles it)
    if (projectId !== lastProjectId) return;

    // Auto-update the BOM in real-time when inputs change
    synchronizeBOM();
  }, [panel, circuits, subPanels, iscParams, vdCalculations]);

  // Handle saving when manual inputs are changed
  const handleItemUpdate = (updatedItem: BomItem) => {
    const updated = bomItems.map(item => item.id === updatedItem.id ? { ...updatedItem, isLocked: true } : item);
    setBomItems(updated);
    
    setAuditLogs(prev => [
      `[${new Date().toLocaleTimeString()}] Updated material lines for "${updatedItem.name}" and locked to prevent override.`,
      ...prev
    ]);

    if (onSaveBom) {
      onSaveBom(updated, {
        wasteConductors,
        wasteConduits,
        wasteAccessories,
        laborRatePercent,
        taxRatePercent,
        profitMarginPercent,
        contingencyPercent,
        preferredBrandConductors,
        preferredBrandConduits,
        preferredBrandBreakers,
        preferredBrandAccessories
      });
    }
  };

  // Toggle item lock status
  const toggleItemLock = (id: string) => {
    const updated = bomItems.map(item => {
      if (item.id === id) {
        const nextLock = !item.isLocked;
        setAuditLogs(prev => [
          `[${new Date().toLocaleTimeString()}] ${nextLock ? "LOCKED" : "UNLOCKED"} material line "${item.name}"`,
          ...prev
        ]);
        return { ...item, isLocked: nextLock };
      }
      return item;
    });
    setBomItems(updated);
  };

  // Delete a BOM item
  const deleteBomItem = (id: string) => {
    const target = bomItems.find(item => item.id === id);
    const updated = bomItems.filter(item => item.id !== id);
    setBomItems(updated);
    setAuditLogs(prev => [
      `[${new Date().toLocaleTimeString()}] Deleted material line: "${target?.name || id}"`,
      ...prev
    ]);
  };

  // Add custom manual item to BOM
  const handleAddManualItem = () => {
    if (!newItem.name) return;
    const finalItem: BomItem = {
      id: `manual-${Math.random().toString(36).substr(2, 9)}`,
      category: (newItem.category || "Conductors") as any,
      name: newItem.name,
      description: newItem.description || "Manually added custom material",
      brand: newItem.brand || "Custom / generic",
      specification: newItem.specification || "Standard rating",
      quantity: newItem.quantity || 1,
      unit: newItem.unit || "pcs",
      unitCost: newItem.unitCost || 0,
      laborCostPerUnit: newItem.laborCostPerUnit || 0,
      remarks: newItem.remarks || "Custom addition",
      isLocked: true, // Custom items are always locked so they don't disappear on sync
      source: "Manual Add",
      rating: newItem.rating
    };

    const updated = [...bomItems, finalItem];
    setBomItems(updated);
    setShowAddModal(false);
    setNewItem({
      category: "Conductors",
      name: "",
      description: "",
      brand: "",
      specification: "",
      quantity: 1,
      unit: "pcs",
      unitCost: 100,
      laborCostPerUnit: 0,
      remarks: "",
      source: "Manual Add"
    });

    setAuditLogs(prev => [
      `[${new Date().toLocaleTimeString()}] Added manual custom material "${finalItem.name}" to BOM.`,
      ...prev
    ]);

    if (onSaveBom) {
      onSaveBom(updated, {
        wasteConductors,
        wasteConduits,
        wasteAccessories,
        laborRatePercent,
        taxRatePercent,
        profitMarginPercent,
        contingencyPercent,
        preferredBrandConductors,
        preferredBrandConduits,
        preferredBrandBreakers,
        preferredBrandAccessories
      });
    }
  };

  // Materials database library modifications (Admin)
  const handleUpdateLibItem = (updatedItem: LibraryItem) => {
    const updated = library.map(item => item.id === updatedItem.id ? updatedItem : item);
    setLibrary(updated);
    setAuditLogs(prev => [
      `[${new Date().toLocaleTimeString()}] Modified base library standard "${updatedItem.name}" pricing to ₱${updatedItem.unitCost}.`,
      ...prev
    ]);
  };

  const handleAddLibItem = () => {
    if (!newLibItem.name) return;
    const item: LibraryItem = {
      id: `lib-custom-${Math.random().toString(36).substr(2, 9)}`,
      category: newLibItem.category || "Conductors",
      name: newLibItem.name,
      brand: newLibItem.brand || "Generic",
      specification: newLibItem.specification || "",
      unit: newLibItem.unit || "pcs",
      unitCost: newLibItem.unitCost || 0,
      rating: newLibItem.rating
    };
    setLibrary([...library, item]);
    setShowAddLibModal(false);
    setNewLibItem({
      category: "Conductors",
      name: "",
      brand: "Phelps Dodge",
      specification: "",
      unit: "meters",
      unitCost: 10
    });
  };

  // Global Preferred Brand modifications
  const handleApplyPreferredBrands = () => {
    setAuditLogs(prev => [
      `[${new Date().toLocaleTimeString()}] Applied global preferred brand overrides (Conductors: ${preferredBrandConductors}, Conduits: ${preferredBrandConduits}, Breakers: ${preferredBrandBreakers}).`,
      ...prev
    ]);
    // Synchronize to apply new brands
    synchronizeBOM();
  };

  // Calculation summaries
  const costCalculations = useMemo(() => {
    let materialsSum = 0;
    let laborSum = 0;

    bomItems.forEach((item) => {
      materialsSum += item.quantity * item.unitCost;
      laborSum += item.quantity * (item.laborCostPerUnit || (item.unitCost * (laborRatePercent / 100)));
    });

    const subtotal = materialsSum + laborSum;
    const contingencyAmount = subtotal * (contingencyPercent / 100);
    const profitAmount = subtotal * (profitMarginPercent / 100);
    const taxableSubtotal = subtotal + contingencyAmount + profitAmount;
    const taxAmount = taxableSubtotal * (taxRatePercent / 100);
    const grandTotal = taxableSubtotal + taxAmount;

    return {
      materialsSum,
      laborSum,
      subtotal,
      contingencyAmount,
      profitAmount,
      taxAmount,
      grandTotal
    };
  }, [bomItems, laborRatePercent, taxRatePercent, profitMarginPercent, contingencyPercent]);

  // Chart data groupings
  const categoryData = useMemo(() => {
    const categories: Record<string, number> = {};
    bomItems.forEach(item => {
      const cost = item.quantity * item.unitCost;
      categories[item.category] = (categories[item.category] || 0) + cost;
    });

    return Object.keys(categories).map(cat => ({
      name: cat,
      value: Math.round(categories[cat])
    })).sort((a, b) => b.value - a.value);
  }, [bomItems]);

  const COLORS = ["#4F46E5", "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#14B8A6", "#6366F1", "#F97316"];

  // Search/Filters matching
  const filteredBomItems = useMemo(() => {
    return bomItems.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            item.specification.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            item.brand.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            item.source.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = categoryFilter === "All" || item.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [bomItems, searchQuery, categoryFilter]);

  // PEC Compliances Audit checks
  const complianceAudit = useMemo(() => {
    const issues: { circuitNo: number; type: string; severity: "warning" | "danger" | "info"; message: string; corrective: string }[] = [];

    // 1. Check if we have manually overridden wire sizes that are smaller than recommendations
    circuits.forEach(c => {
      if (c.loadType === LoadType.SPACE || c.loadType === LoadType.SPARE) return;
      const overrideSize = c.wireSizeOverride ? parseFloat(c.wireSizeOverride) : null;
      const recSize = parseFloat(c.calculatedWireSize || c.wireSize || "2.0");

      if (overrideSize && overrideSize < recSize) {
        issues.push({
          circuitNo: c.circuitNo,
          type: "Wire Size Override Under Recommendation",
          severity: "danger",
          message: `Circuit ${c.circuitNo} is configured with wire size ${overrideSize} mm², which is below the calculated PEC recommendation of ${recSize} mm² for protection.`,
          corrective: `Increase manually selected wire override size to at least ${recSize} mm² or release the override to use calculations.`
        });
      }
    });

    // 2. Check general ground wire size safety matching MCB AT
    circuits.forEach(c => {
      if (c.loadType === LoadType.SPACE || c.loadType === LoadType.SPARE) return;
      const currentAT = c.mcbAT;
      const gSize = parseFloat(c.groundSize || "2.0");

      if (currentAT > 30 && gSize <= 2.0) {
        issues.push({
          circuitNo: c.circuitNo,
          type: "Sub-sized Ground Wire",
          severity: "warning",
          message: `Circuit ${c.circuitNo} has protection of ${currentAT}A but Ground conductor is only ${gSize} mm². PEC Table 2.50.6.13 recommends a minimum ground wire of 3.5 mm² for ratings over 30A.`,
          corrective: `Update Equipment Grounding Conductor to 3.5 mm² to handle fault current securely.`
        });
      }
    });

    return issues;
  }, [circuits]);

  // Export to Excel using xlsx-js-style
  const handleExportExcel = () => {
    if (!isPremium) {
      alert("Excel export for this module is available exclusively in the Premium Plan. Upgrade your subscription to unlock full Excel export functionality.");
      onRequestUpgrade();
      return;
    }
    try {
      const wb = XLSX.utils.book_new();

      const headers = ["Category", "Material Name", "Description", "Brand", "Specification", "Quantity", "Unit", "Unit Cost (₱)", "Total Cost (₱)", "Source / Reference"];
      
      const rows = filteredBomItems.map(item => [
        item.category,
        item.name,
        item.description,
        item.brand,
        item.specification,
        item.quantity,
        item.unit,
        item.unitCost,
        item.quantity * item.unitCost,
        item.source
      ]);

      const grandTotalCost = filteredBomItems.reduce((sum, item) => sum + (item.quantity * item.unitCost), 0);
      const totalRow = [
        "GRAND TOTAL", "", "", "", "", "", "", "", grandTotalCost, ""
      ];

      const wsData = [
        ["BILL OF MATERIALS (BOM) TAKEOFF REPORT"],
        [`Project Designation: ${panel.designation || "Project"}`, "", "", "", "", "", "", "", "", `Generated on: ${new Date().toLocaleDateString()}`],
        [""],
        headers,
        ...rows,
        [""], // Spacer
        totalRow
      ];

      const ws = XLSX.utils.aoa_to_sheet(wsData);

      // Define standard styles
      const headerStyle = {
        font: { bold: true, color: { rgb: "FFFFFF" }, name: "Segoe UI", sz: 10 },
        fill: { fgColor: { rgb: "312E81" } }, // Indigo 900
        alignment: { horizontal: "center", vertical: "center", wrapText: true },
        border: {
          top: { style: "thin", color: { rgb: "000000" } },
          bottom: { style: "thin", color: { rgb: "000000" } },
          left: { style: "thin", color: { rgb: "000000" } },
          right: { style: "thin", color: { rgb: "000000" } }
        }
      };

      const titleStyle = {
        font: { bold: true, color: { rgb: "0F172A" }, name: "Segoe UI", sz: 16 },
        alignment: { horizontal: "left", vertical: "center" }
      };

      const subtitleStyle = {
        font: { bold: true, color: { rgb: "475569" }, name: "Segoe UI", sz: 11 },
        alignment: { horizontal: "left", vertical: "center" }
      };

      const cellStyle = {
        font: { name: "Segoe UI", sz: 10 },
        alignment: { vertical: "center" },
        border: {
          bottom: { style: "thin", color: { rgb: "E2E8F0" } }
        }
      };
      
      const costStyle = {
        font: { name: "Segoe UI", sz: 10, bold: true },
        alignment: { horizontal: "right", vertical: "center" },
        numFmt: "₱#,##0.00",
        border: {
          bottom: { style: "thin", color: { rgb: "E2E8F0" } }
        }
      };

      const qtyStyle = {
        font: { name: "Segoe UI", sz: 10, bold: true },
        alignment: { horizontal: "center", vertical: "center" },
        border: {
          bottom: { style: "thin", color: { rgb: "E2E8F0" } }
        }
      };

      const grandTotalLabelStyle = {
        font: { name: "Segoe UI", sz: 12, bold: true, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: "1E293B" } }, // Slate 800
        alignment: { horizontal: "right", vertical: "center" },
        border: {
          top: { style: "medium", color: { rgb: "000000" } },
          bottom: { style: "medium", color: { rgb: "000000" } }
        }
      };

      const grandTotalValueStyle = {
        font: { name: "Segoe UI", sz: 12, bold: true, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: "1E293B" } },
        alignment: { horizontal: "right", vertical: "center" },
        numFmt: "₱#,##0.00",
        border: {
          top: { style: "medium", color: { rgb: "000000" } },
          bottom: { style: "medium", color: { rgb: "000000" } }
        }
      };

      // Apply styles to cells
      const range = XLSX.utils.decode_range(ws["!ref"] || "A1:A1");
      for (let R = range.s.r; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
          const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
          if (!ws[cellAddress]) continue;

          if (R === 0) {
            ws[cellAddress].s = titleStyle;
          } else if (R === 1) {
            ws[cellAddress].s = subtitleStyle;
          } else if (R === 3) {
            ws[cellAddress].s = headerStyle;
          } else if (R === range.e.r) {
            // Grand Total row
            if (C === 8) {
              ws[cellAddress].s = grandTotalValueStyle;
            } else {
              ws[cellAddress].s = grandTotalLabelStyle;
            }
          } else if (R === range.e.r - 1) {
            // Spacer row
          } else if (R > 3) {
            if (C === 7 || C === 8) {
              ws[cellAddress].s = costStyle;
            } else if (C === 5) {
              ws[cellAddress].s = qtyStyle;
            } else {
              ws[cellAddress].s = cellStyle;
            }
          }
        }
      }

      // Merge cells for title and grand total
      if (!ws["!merges"]) ws["!merges"] = [];
      ws["!merges"].push({ s: { r: 0, c: 0 }, e: { r: 0, c: 9 } });
      ws["!merges"].push({ s: { r: range.e.r, c: 0 }, e: { r: range.e.r, c: 7 } }); // Merge Grand Total label

      // Set column widths
      ws["!cols"] = [
        { wch: 20 }, // Category
        { wch: 35 }, // Material Name
        { wch: 45 }, // Description
        { wch: 15 }, // Brand
        { wch: 35 }, // Specification
        { wch: 10 }, // Quantity
        { wch: 10 }, // Unit
        { wch: 15 }, // Unit Cost
        { wch: 15 }, // Total Cost
        { wch: 25 }  // Source
      ];

      XLSX.utils.book_append_sheet(wb, ws, "BOM_Takeoff");

      const filename = `BOM_Takeoff_Report_${panel.designation || "Project"}.xlsx`;
      XLSX.writeFile(wb, filename);
    } catch (err) {
      console.error("Excel Export failed:", err);
      alert("Failed to export Excel file. Check console for details.");
    }
  };

  const handleExportWord = async () => {
    if (!isPremium) {
      alert("Word export for this module is available exclusively in the Premium Plan. Upgrade your subscription to unlock full Word export functionality.");
      onRequestUpgrade();
      return;
    }
    try {
      await exportBomToWord(panel, filteredBomItems);
    } catch (err) {
      console.error("Word Export failed:", err);
      alert("Failed to export Word file. Check console for details.");
    }
  };

  // Trigger browser print
  const handlePrint = () => {
    window.print();
  };

  return (
    <div id="bom-management-module" className="bg-slate-50 dark:bg-slate-950/40 p-4 md:p-6 rounded-3xl border border-slate-200/60 dark:border-slate-800/80 shadow-sm animate-fade">
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 pb-6 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl font-black text-slate-800 dark:text-white flex items-center gap-2">
            <FileSpreadsheet className="w-6 h-6 text-indigo-600" />
            Bill of Materials (BOM) Takeoff Engine
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Automated PEC 2017 compliant materials list, quantities estimation, alternatives sizer, and live project synchronization.
          </p>
        </div>

        {/* Top-Right Quick Actions */}
        <div className="flex flex-wrap gap-2 no-print">
          <button 
            onClick={() => synchronizeBOM(true)}
            className="px-3.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/40 dark:text-indigo-300 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer border border-indigo-200/40"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Force Re-Synchronize Takeoff
          </button>
          <button 
            onClick={handleExportExcel}
            className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Export Excel
          </button>
          <button 
            onClick={handleExportWord}
            className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5" />
            Export Word
          </button>
          <button 
            onClick={handlePrint}
            className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            Print BOM
          </button>
        </div>
      </div>

      {/* Main Sizing Tabs */}
      <div className="flex border-b border-slate-150 dark:border-slate-800/80 mb-6 gap-1 md:gap-2 overflow-x-auto no-print">
        <button
          onClick={() => setActiveTab("workspace")}
          className={`px-4 py-2.5 text-xs md:text-sm font-bold flex items-center gap-2 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === "workspace" 
              ? "border-indigo-600 text-indigo-600 dark:text-indigo-400" 
              : "border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
          }`}
        >
          <Layers className="w-4 h-4" />
          BOM Workspace ({filteredBomItems.length})
        </button>
        <button
          onClick={() => setActiveTab("alternatives")}
          className={`px-4 py-2.5 text-xs md:text-sm font-bold flex items-center gap-2 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === "alternatives" 
              ? "border-indigo-600 text-indigo-600 dark:text-indigo-400" 
              : "border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
          }`}
        >
          <Briefcase className="w-4 h-4" />
          Brands & Waste Settings
        </button>
        <button
          onClick={() => setActiveTab("summary")}
          className={`px-4 py-2.5 text-xs md:text-sm font-bold flex items-center gap-2 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === "summary" 
              ? "border-indigo-600 text-indigo-600 dark:text-indigo-400" 
              : "border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          Cost Estimation & Analytics
        </button>
        <button
          onClick={() => setActiveTab("database")}
          className={`px-4 py-2.5 text-xs md:text-sm font-bold flex items-center gap-2 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === "database" 
              ? "border-indigo-600 text-indigo-600 dark:text-indigo-400" 
              : "border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
          }`}
        >
          <Database className="w-4 h-4" />
          Base Price Database (Admin)
        </button>
        <button
          onClick={() => setActiveTab("suppliers")}
          className={`px-4 py-2.5 text-xs md:text-sm font-bold flex items-center gap-2 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === "suppliers" 
              ? "border-indigo-600 text-indigo-600 dark:text-indigo-400" 
              : "border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
          }`}
        >
          <Building2 className="w-4 h-4" />
          Philippine Suppliers
        </button>
        <button
          onClick={() => setActiveTab("audit")}
          className={`px-4 py-2.5 text-xs md:text-sm font-bold flex items-center gap-2 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === "audit" 
              ? "border-indigo-600 text-indigo-600 dark:text-indigo-400" 
              : "border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
          }`}
        >
          <FileText className="w-4 h-4" />
          PEC Compliance Audit ({complianceAudit.length})
        </button>
      </div>

      {/* ----------------- TAB 1: BOM WORKSPACE ----------------- */}
      {activeTab === "workspace" && (
        <div className="space-y-4">
          {/* Quick Filters */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 no-print">
            <div className="flex flex-wrap gap-1.5">
              {["All", "Conductors", "Conduits", "Breakers", "Boxes", "Grounding", "Accessories"].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    categoryFilter === cat 
                      ? "bg-slate-900 text-white dark:bg-indigo-600" 
                      : "bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Smart Search */}
            <div className="relative w-full md:w-72">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Search className="w-4 h-4" />
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search materials, brands..."
                className="w-full pl-9 pr-4 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
          </div>

          {/* Master Table Grid */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-900/60 shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-150 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-bold">
                    <th className="p-3 w-10 text-center no-print">Sync</th>
                    <th className="p-3">Category</th>
                    <th className="p-3">Material Specification</th>
                    <th className="p-3">Preferred Brand</th>
                    <th className="p-3 text-right">Quantity</th>
                    <th className="p-3">Unit</th>
                    <th className="p-3 text-right">Unit Price</th>
                    <th className="p-3 text-right">Total Price</th>
                    <th className="p-3">Source / Reference</th>
                    <th className="p-3 text-center no-print w-16">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150 dark:divide-slate-800">
                  {filteredBomItems.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="p-8 text-center text-slate-400 font-mono">
                        No materials found matching criteria. Update Load Schedule or add custom items.
                      </td>
                    </tr>
                  ) : (
                    filteredBomItems.map((item) => {
                      const totalCost = item.quantity * item.unitCost;
                      return (
                        <tr key={item.id} className="hover:bg-slate-50/55 dark:hover:bg-slate-800/25 transition-colors">
                          {/* Sync Protection Lock Column */}
                          <td className="p-3 text-center no-print">
                            <button
                              onClick={() => toggleItemLock(item.id)}
                              title={item.isLocked ? "Manual override active: locked from auto-recalculation" : "Auto-synchronized: will update if Load Schedule changes"}
                              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                item.isLocked 
                                  ? "bg-amber-50 text-amber-600 hover:bg-amber-100 dark:bg-amber-950/20 dark:text-amber-400" 
                                  : "text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                              }`}
                            >
                              {item.isLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                            </button>
                          </td>
                          <td className="p-3 font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[10px]">
                              {item.category}
                            </span>
                          </td>
                          <td className="p-3">
                            <div>
                              <p className="font-bold text-slate-800 dark:text-slate-100">{item.name}</p>
                              <p className="text-[10px] text-slate-400 mt-0.5 max-w-xs md:max-w-md truncate" title={item.description}>
                                {item.specification || item.description}
                              </p>
                            </div>
                          </td>
                          <td className="p-3">
                            <input
                              type="text"
                              value={item.brand}
                              onChange={(e) => handleItemUpdate({ ...item, brand: e.target.value })}
                              className="w-24 px-1.5 py-1 text-xs border border-transparent hover:border-slate-200 dark:hover:border-slate-700 bg-transparent rounded focus:bg-white dark:focus:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none focus:ring-1 focus:ring-indigo-500/20"
                            />
                          </td>
                          <td className="p-3 text-right">
                            <input
                              type="number"
                              value={item.quantity}
                              onChange={(e) => handleItemUpdate({ ...item, quantity: Math.max(0, parseFloat(e.target.value) || 0) })}
                              className="w-16 px-1.5 py-1 text-xs text-right border border-transparent hover:border-slate-200 dark:hover:border-slate-700 bg-transparent rounded focus:bg-white dark:focus:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none focus:ring-1 focus:ring-indigo-500/20 font-mono font-bold"
                            />
                          </td>
                          <td className="p-3 text-slate-500 dark:text-slate-400">{item.unit}</td>
                          <td className="p-3 text-right">
                            <span className="font-mono text-slate-500 dark:text-slate-400">₱</span>
                            <input
                              type="number"
                              value={item.unitCost}
                              onChange={(e) => handleItemUpdate({ ...item, unitCost: Math.max(0, parseFloat(e.target.value) || 0) })}
                              className="w-20 px-1.5 py-1 text-xs text-right border border-transparent hover:border-slate-200 dark:hover:border-slate-700 bg-transparent rounded focus:bg-white dark:focus:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none focus:ring-1 focus:ring-indigo-500/20 font-mono font-bold"
                            />
                          </td>
                          <td className="p-3 text-right font-mono font-extrabold text-slate-900 dark:text-slate-100">
                            ₱{totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="p-3 text-slate-400 font-mono text-[10px] whitespace-nowrap">{item.source}</td>
                          {/* Delete Item Actions */}
                          <td className="p-3 text-center no-print">
                            <button
                              onClick={() => deleteBomItem(item.id)}
                              className="p-1.5 hover:bg-red-50 text-slate-400 hover:text-red-500 dark:hover:bg-red-950/20 rounded-lg transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Total Footer inside workspace */}
            <div className="bg-slate-50 dark:bg-slate-800/40 p-4 border-t border-slate-200 dark:border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowAddModal(true)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer no-print"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Custom Material
                </button>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-500 dark:text-slate-400">Total Materials (Unfinished Estimations):</span>
                <p className="text-lg md:text-xl font-black text-indigo-600 dark:text-indigo-400 font-mono mt-0.5">
                  ₱{costCalculations.materialsSum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- TAB 2: BRANDS & WASTE SETTINGS ----------------- */}
      {activeTab === "alternatives" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Brand Preferences Selector */}
          <div className="p-5 border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900/60 shadow-xs space-y-4">
            <h3 className="text-sm font-black text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-indigo-500" />
              Global Preferred Brands overrides
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Define the default preferred brands for automatic generation. Click 'Apply' to update all matching materials inside BOM.
            </p>

            <div className="space-y-3 pt-2">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">Conductors / Wires Brand</label>
                <select
                  value={preferredBrandConductors}
                  onChange={(e) => setPreferredBrandConductors(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:outline-none"
                >
                  <option value="Phelps Dodge">Phelps Dodge (Premium Copper)</option>
                  <option value="Philflex">Philflex (Standard Local)</option>
                  <option value="Emerald">Emerald Wires</option>
                  <option value="Mitsubishi">Mitsubishi Cables</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">Conduits / Raceways Brand</label>
                <select
                  value={preferredBrandConduits}
                  onChange={(e) => setPreferredBrandConduits(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:outline-none"
                >
                  <option value="Neltex">Neltex (uPVC Heavy)</option>
                  <option value="Emerald">Emerald PVC</option>
                  <option value="Atlanta">Atlanta Pipes</option>
                  <option value="Matsushita">Matsushita Rigid steel</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">Breakers / Enclosures Brand</label>
                <select
                  value={preferredBrandBreakers}
                  onChange={(e) => setPreferredBrandBreakers(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:outline-none"
                >
                  <option value="Schneider">Schneider Electric</option>
                  <option value="ABB">ABB</option>
                  <option value="Siemens">Siemens</option>
                  <option value="GE">General Electric</option>
                  <option value="Chint">Chint Electric (Economical)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">Boxes & Accessories Brand</label>
                <select
                  value={preferredBrandAccessories}
                  onChange={(e) => setPreferredBrandAccessories(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:outline-none"
                >
                  <option value="Neltex">Neltex Fittings</option>
                  <option value="Kotatsu">Kotatsu Galvanized Steel</option>
                  <option value="Calterm">Calterm Connectors</option>
                </select>
              </div>

              <div className="pt-2">
                <button
                  onClick={handleApplyPreferredBrands}
                  className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm cursor-pointer"
                >
                  Apply and Update BOM Brands
                </button>
              </div>
            </div>
          </div>

          {/* Waste Allowance Settings */}
          <div className="p-5 border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900/60 shadow-xs space-y-4">
            <h3 className="text-sm font-black text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Briefcase className="w-4 h-4 text-indigo-500" />
              Sizing Takeoff & Cost Modifiers
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Define standard waste percentages and rate formulas. Adjusting these values immediately triggers recalculation of wire/conduit takeoff bounds.
            </p>

            <div className="grid grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">Conductors Waste (%)</label>
                <input
                  type="number"
                  value={wasteConductors}
                  onChange={(e) => setWasteConductors(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 font-mono font-bold focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">Conduits Waste (%)</label>
                <input
                  type="number"
                  value={wasteConduits}
                  onChange={(e) => setWasteConduits(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 font-mono font-bold focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">Labor Rate (% of Material)</label>
                <input
                  type="number"
                  value={laborRatePercent}
                  onChange={(e) => setLaborRatePercent(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 font-mono font-bold focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">Contingency Rate (%)</label>
                <input
                  type="number"
                  value={contingencyPercent}
                  onChange={(e) => setContingencyPercent(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 font-mono font-bold focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">Profit Margin (%)</label>
                <input
                  type="number"
                  value={profitMarginPercent}
                  onChange={(e) => setProfitMarginPercent(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 font-mono font-bold focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">Tax Rate / VAT (%)</label>
                <input
                  type="number"
                  value={taxRatePercent}
                  onChange={(e) => setTaxRatePercent(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 font-mono font-bold focus:outline-none"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={() => synchronizeBOM()}
                className="w-full px-4 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-bold rounded-xl transition-all cursor-pointer"
              >
                Apply Cost Parameters & Recalculate Takeoff
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- TAB 3: COST ESTIMATION & SUMMARY ----------------- */}
      {activeTab === "summary" && (
        <div className="space-y-6">
          {/* Bento cost breakdown grid */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 rounded-2xl">
              <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">Materials Total</span>
              <p className="text-2xl font-black text-slate-800 dark:text-white font-mono mt-1">
                ₱{costCalculations.materialsSum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <span className="text-[10px] text-emerald-500 font-bold mt-1 block">✓ Fully cataloged</span>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 rounded-2xl">
              <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">Labor Estimation ({laborRatePercent}%)</span>
              <p className="text-2xl font-black text-slate-800 dark:text-white font-mono mt-1">
                ₱{costCalculations.laborSum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <span className="text-[10px] text-slate-400 mt-1 block">Derived from material cost index</span>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 rounded-2xl">
              <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">Taxes & Markups ({taxRatePercent + profitMarginPercent}%)</span>
              <p className="text-2xl font-black text-slate-800 dark:text-white font-mono mt-1">
                ₱{(costCalculations.profitAmount + costCalculations.taxAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <span className="text-[10px] text-slate-400 mt-1 block">VAT + Profit settings</span>
            </div>

            <div className="p-4 bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 rounded-2xl">
              <span className="text-[10px] font-bold text-indigo-500 tracking-wider uppercase">Estimated Project Cost</span>
              <p className="text-3xl font-black text-indigo-700 dark:text-indigo-400 font-mono mt-1">
                ₱{costCalculations.grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <span className="text-[10px] text-indigo-500/80 font-bold mt-1 block">Grand Professional Total</span>
            </div>
          </div>

          {/* Visual Charts of materials split */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-5 border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900/60">
              <h3 className="text-xs font-black text-slate-800 dark:text-slate-200 mb-4 uppercase tracking-wider">
                Material Categories Distribution
              </h3>
              <div className="h-64 w-full">
                {categoryData.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-slate-400 font-mono">No data</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={categoryData} layout="vertical" margin={{ left: 20, right: 10, top: 10, bottom: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tickFormatter={(v) => `₱${v/1000}k`} />
                      <YAxis dataKey="name" type="category" width={80} style={{ fontSize: '10px' }} />
                      <Tooltip formatter={(value) => `₱${value.toLocaleString()}`} />
                      <Bar dataKey="value" fill="#4F46E5" radius={[0, 4, 4, 0]}>
                        {categoryData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="p-5 border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900/60">
              <h3 className="text-xs font-black text-slate-800 dark:text-slate-200 mb-4 uppercase tracking-wider">
                Full Cost Division Split
              </h3>
              <div className="h-64 w-full flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: "Materials Base", value: costCalculations.materialsSum },
                        { name: "Labor cost", value: costCalculations.laborSum },
                        { name: "Contingency", value: costCalculations.contingencyAmount },
                        { name: "Profit Margin", value: costCalculations.profitAmount },
                        { name: "Government Tax", value: costCalculations.taxAmount }
                      ]}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {[0,1,2,3,4].map((index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => `₱${value.toLocaleString()}`} />
                    <Legend style={{ fontSize: '11px' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- TAB 4: DATABASE & PRICING MANAGEMENT ----------------- */}
      {activeTab === "database" && (
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 no-print">
            <h3 className="text-sm font-black text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Database className="w-4 h-4 text-indigo-500" />
              Materials Base Pricing Reference (Philippine Index)
            </h3>
            <button
              onClick={() => setShowAddLibModal(true)}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Base Template Material
            </button>
          </div>

          <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-900/60 shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-150 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-bold">
                    <th className="p-3">Category</th>
                    <th className="p-3">Generic / Item Name</th>
                    <th className="p-3">Standard Reference Brand</th>
                    <th className="p-3">Specification Details</th>
                    <th className="p-3">Unit</th>
                    <th className="p-3 text-right">Standard Cost (PHP)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150 dark:divide-slate-800 font-mono">
                  {library.map((libItem) => (
                    <tr key={libItem.id} className="hover:bg-slate-50/55 dark:hover:bg-slate-800/25 transition-colors">
                      <td className="p-3 font-semibold text-slate-700 dark:text-slate-300">
                        <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-sans">
                          {libItem.category}
                        </span>
                      </td>
                      <td className="p-3 font-bold text-slate-800 dark:text-slate-100 font-sans">{libItem.name}</td>
                      <td className="p-3 text-slate-500 dark:text-slate-400 font-sans">{libItem.brand}</td>
                      <td className="p-3 text-slate-400 text-[10px] font-sans">{libItem.specification || "Standard build"}</td>
                      <td className="p-3 text-slate-500 dark:text-slate-400 font-sans">{libItem.unit}</td>
                      <td className="p-3 text-right">
                        <span className="text-slate-400 mr-1">₱</span>
                        <input
                          type="number"
                          value={libItem.unitCost}
                          onChange={(e) => handleUpdateLibItem({ ...libItem, unitCost: Math.max(0, parseFloat(e.target.value) || 0) })}
                          className="w-20 px-1.5 py-1 text-xs text-right border border-transparent hover:border-slate-200 dark:hover:border-slate-700 bg-transparent rounded focus:bg-white dark:focus:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none font-bold"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- TAB 5: SUPPLIERS REGISTRY ----------------- */}
      {activeTab === "suppliers" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {suppliers.map((sup) => (
            <div key={sup.id} className="p-5 border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900/60 space-y-3 shadow-xs">
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-extrabold text-sm text-slate-800 dark:text-slate-200">{sup.name}</h4>
                  <p className="text-[10px] text-slate-400 mt-0.5">{sup.address}</p>
                </div>
                <span className="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold">
                  Lead Time: {sup.leadTime}
                </span>
              </div>

              <div className="border-t border-slate-100 dark:border-slate-800 pt-3 space-y-1 text-xs text-slate-600 dark:text-slate-300">
                <p><strong>Primary Contact:</strong> {sup.contact}</p>
                <p><strong>Corporate Email:</strong> <span className="font-mono text-indigo-500">{sup.email}</span></p>
              </div>

              <div className="flex flex-wrap gap-1 pt-2">
                {sup.brands.map((brand, i) => (
                  <span key={i} className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[9px] text-slate-500 font-semibold">
                    {brand}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ----------------- TAB 6: PEC COMPLIANCE AUDIT & LOGS ----------------- */}
      {activeTab === "audit" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Sizing Compliance Checklist */}
          <div className="md:col-span-2 space-y-4">
            <h3 className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              PEC 2017 Sizing & Safe Takeoff Violations
            </h3>

            {complianceAudit.length === 0 ? (
              <div className="p-6 border border-emerald-150 dark:border-emerald-900/40 rounded-2xl bg-emerald-50/20 dark:bg-emerald-950/10 flex items-center gap-4 text-emerald-800 dark:text-emerald-400">
                <CheckCircle className="w-8 h-8 text-emerald-500 shrink-0" />
                <div>
                  <h4 className="font-bold text-sm">Perfect Takeoff Compliance</h4>
                  <p className="text-xs mt-0.5 opacity-90">
                    No sizing, ground wire boundaries, or conductor coordination violations detected in current branch overrides. Excellent design standards!
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {complianceAudit.map((issue, idx) => (
                  <div key={idx} className="p-4 border border-rose-200 dark:border-rose-900/50 rounded-2xl bg-rose-50/20 dark:bg-rose-950/10 space-y-2">
                    <div className="flex justify-between items-start">
                      <span className="px-2.5 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-400 text-[10px] font-bold">
                        {issue.type}
                      </span>
                      <span className="text-[10px] text-rose-500 font-bold uppercase">{issue.severity}</span>
                    </div>
                    <p className="text-xs text-rose-800 dark:text-rose-300 leading-relaxed font-sans">
                      {issue.message}
                    </p>
                    <div className="text-[10px] bg-white dark:bg-slate-900/60 p-2 rounded-lg border border-slate-100 dark:border-slate-800 font-mono text-emerald-600 dark:text-emerald-400">
                      <strong>PEC Recommendation Action:</strong> {issue.corrective}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Audit Trails Logs */}
          <div className="p-5 border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900/60 space-y-4">
            <h3 className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-indigo-500" />
              BOM Engine Generation Audit Trails
            </h3>
            <div className="h-96 overflow-y-auto pr-2 font-mono text-[9px] text-slate-400 dark:text-slate-500 space-y-2.5 leading-relaxed">
              {auditLogs.map((log, index) => (
                <div key={index} className="border-b border-slate-100 dark:border-slate-800/80 pb-2">
                  {log}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ----------------- MODAL: ADD CUSTOM BOM ITEM ----------------- */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-[9999] p-4 animate-fade-in no-print">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
            <div className="p-5 border-b border-slate-150 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-850">
              <h3 className="text-sm font-black text-slate-800 dark:text-white flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-indigo-500" />
                Add Custom Material Line
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs font-bold cursor-pointer">Close</button>
            </div>

            <div className="p-5 space-y-3 max-h-[75vh] overflow-y-auto">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1">Category</label>
                <select
                  value={newItem.category}
                  onChange={(e) => setNewItem({ ...newItem, category: e.target.value as any })}
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none text-slate-800 dark:text-slate-100"
                >
                  {["Conductors", "Grounding", "Conduits", "Breakers", "Switches", "Distribution Equipment", "Boxes", "Lighting", "Devices", "Protection", "Equipment", "Accessories"].map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1">Material Name *</label>
                <input
                  type="text"
                  value={newItem.name}
                  onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                  placeholder="e.g. Copper wire, XLPE Conductor"
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none text-slate-800 dark:text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-1">Brand</label>
                  <input
                    type="text"
                    value={newItem.brand}
                    onChange={(e) => setNewItem({ ...newItem, brand: e.target.value })}
                    placeholder="e.g. Phelps Dodge"
                    className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none text-slate-800 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-1">Unit</label>
                  <input
                    type="text"
                    value={newItem.unit}
                    onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })}
                    placeholder="e.g. meters, pcs"
                    className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none text-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-1">Quantity</label>
                  <input
                    type="number"
                    value={newItem.quantity}
                    onChange={(e) => setNewItem({ ...newItem, quantity: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none font-mono font-bold text-slate-800 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-1">Unit Cost (₱)</label>
                  <input
                    type="number"
                    value={newItem.unitCost}
                    onChange={(e) => setNewItem({ ...newItem, unitCost: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none font-mono font-bold text-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1">Specification Details</label>
                <textarea
                  value={newItem.specification}
                  onChange={(e) => setNewItem({ ...newItem, specification: e.target.value })}
                  placeholder="Additional physical properties or insulation specs"
                  className="w-full h-16 px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none text-slate-800 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1">Source / Remarks</label>
                <input
                  type="text"
                  value={newItem.remarks}
                  onChange={(e) => setNewItem({ ...newItem, remarks: e.target.value })}
                  placeholder="Remarks for procurement"
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none text-slate-800 dark:text-slate-100"
                />
              </div>

              <div className="pt-3 border-t border-slate-150 dark:border-slate-800">
                <button
                  onClick={handleAddManualItem}
                  className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm cursor-pointer"
                >
                  Add to Bill of Materials
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- MODAL: ADD BASE STANDARD MATERIAL TEMPLATE ----------------- */}
      {showAddLibModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-[9999] p-4 animate-fade-in no-print">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
            <div className="p-5 border-b border-slate-150 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-850">
              <h3 className="text-sm font-black text-slate-800 dark:text-white flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-indigo-500" />
                Add Base Database Standard Material
              </h3>
              <button onClick={() => setShowAddLibModal(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs font-bold cursor-pointer">Close</button>
            </div>

            <div className="p-5 space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1">Category</label>
                <select
                  value={newLibItem.category}
                  onChange={(e) => setNewLibItem({ ...newLibItem, category: e.target.value })}
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none text-slate-800 dark:text-slate-100"
                >
                  {["Conductors", "Conduits", "Breakers", "Boxes", "Grounding", "Accessories"].map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1">Item Template Name *</label>
                <input
                  type="text"
                  value={newLibItem.name}
                  onChange={(e) => setNewLibItem({ ...newLibItem, name: e.target.value })}
                  placeholder="e.g. Copper Wire, 5.5 mm²"
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none text-slate-800 dark:text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-1">Reference Brand</label>
                  <input
                    type="text"
                    value={newLibItem.brand}
                    onChange={(e) => setNewLibItem({ ...newLibItem, brand: e.target.value })}
                    className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none text-slate-800 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-1">Unit</label>
                  <input
                    type="text"
                    value={newLibItem.unit}
                    onChange={(e) => setNewLibItem({ ...newLibItem, unit: e.target.value })}
                    className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none text-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-1">Rating Rating / Size</label>
                  <input
                    type="text"
                    value={newLibItem.rating || ""}
                    onChange={(e) => setNewLibItem({ ...newLibItem, rating: e.target.value })}
                    placeholder="e.g. 5.5 mm², 32mm"
                    className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none text-slate-800 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-1">Default Base Price (₱)</label>
                  <input
                    type="number"
                    value={newLibItem.unitCost}
                    onChange={(e) => setNewLibItem({ ...newLibItem, unitCost: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none font-mono font-bold text-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1">insulation / specification</label>
                <input
                  type="text"
                  value={newLibItem.specification || ""}
                  onChange={(e) => setNewLibItem({ ...newLibItem, specification: e.target.value })}
                  placeholder="Insulation or thickness specification info"
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none text-slate-800 dark:text-slate-100"
                />
              </div>

              <div className="pt-3 border-t border-slate-150 dark:border-slate-800">
                <button
                  onClick={handleAddLibItem}
                  className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm cursor-pointer"
                >
                  Add standard to library template
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
