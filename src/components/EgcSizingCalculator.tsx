import React, { useState, useMemo } from "react";
import { 
  Calculator, 
  FileSpreadsheet, 
  FileText, 
  Hammer, 
  Info, 
  Search, 
  ShieldAlert,
  Sliders,
  Sparkles,
  HelpCircle,
  FileDown,
  Lock
} from "lucide-react";
import { 
  PEC_EGC_TABLE_2017, 
  findEgcSize, 
  exportEgcToExcel, 
  exportEgcToWord, 
  exportEgcToPdf, 
  exportEgcToDxf 
} from "../utils/exportEgcExports";
import { STANDARD_CB_RATINGS } from "../constants";

interface EgcSizingCalculatorProps {
  isPremium?: boolean;
  onRequestUpgrade?: () => void;
  user?: any;
}

export default function EgcSizingCalculator({ isPremium = false, onRequestUpgrade, user }: EgcSizingCalculatorProps) {
  const [ocpdRating, setOcpdRating] = useState<number>(100);
  const [isCustomStyle, setIsCustomStyle] = useState<boolean>(false);
  const [customOcpdText, setCustomOcpdText] = useState<string>("100");
  const [material, setMaterial] = useState<"Copper" | "Aluminum" | "Copper-Clad Aluminum">("Copper");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Derive the active OCPD value
  const activeOcpd = useMemo(() => {
    if (isCustomStyle) {
      const parsed = parseFloat(customOcpdText);
      return isNaN(parsed) || parsed < 0 ? 0 : parsed;
    }
    return ocpdRating;
  }, [isCustomStyle, ocpdRating, customOcpdText]);

  // Compute grounding wire parameters
  const egcResult = useMemo(() => {
    return findEgcSize(activeOcpd, material);
  }, [activeOcpd, material]);

  // Handle inputs
  const handleRatingSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = parseInt(e.target.value);
    setOcpdRating(val);
    if (!isCustomStyle) {
      setCustomOcpdText(val.toString());
    }
  };

  const handleCustomOcpdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setCustomOcpdText(val);
  };

  // Filter Table entries for searchable view
  const filteredTable = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return PEC_EGC_TABLE_2017;
    return PEC_EGC_TABLE_2017.filter(entry => {
      return (
        entry.rating.toString().includes(query) ||
        entry.copperAwg.toLowerCase().includes(query) ||
        entry.alumAwg.toLowerCase().includes(query)
      );
    });
  }, [searchQuery]);

  return (
    <div id="egc-calculator-container" className="p-6 max-w-7xl mx-auto space-y-8 bg-slate-50 dark:bg-slate-900 rounded-2xl transition-colors duration-200">
      
      {/* Title & Header Section */}
      <div id="egc-header" className="flex flex-col md:flex-row md:items-center md:justify-between pb-6 border-b border-slate-200 dark:border-slate-800 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2.5 bg-indigo-500 rounded-xl text-white">
              <Hammer className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-sans font-bold text-slate-900 dark:text-white tracking-tight">
              EGC Sizing Utility
            </h1>
          </div>
          <p className="text-sm font-sans text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
            In accordance with **PEC 2017, Table 2.50.6.13** - Minimum Size Equipment Grounding Conductors for Grounding Raceway & Equipment.
          </p>
        </div>

        {/* Export Dropdown Group */}
        <div id="egc-exports-group" className="flex flex-wrap items-center gap-2.5">
          <button
            id="btn-export-pdf"
            onClick={async () => {
              if (isPremium) {
                if (user?.uid) {
                  try {
                    const response = await fetch("/api/verify-doc-export", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ userId: user.uid, module: "egc", format: "pdf" })
                    });
                    if (!response.ok) {
                      const data = await response.json();
                      alert(data.error || "PDF export verification failed.");
                      if (onRequestUpgrade) onRequestUpgrade();
                      return;
                    }
                  } catch (err) {
                    console.warn("Backend validation failed, proceeding with client verification:", err);
                  }
                }
                exportEgcToPdf(activeOcpd, material, egcResult);
              } else {
                alert("Word and PDF document exports are available exclusively with the Premium Plan. Upgrade your subscription to unlock professional document generation.");
                if (onRequestUpgrade) onRequestUpgrade();
              }
            }}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg border transition-all cursor-pointer shadow-sm ${
              isPremium
                ? "bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-950/40 dark:hover:bg-red-950/60 dark:text-red-400 border-red-200/40 dark:border-red-900/30"
                : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700/60"
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>PDF Report</span>
            {!isPremium && <Lock className="w-3 h-3 text-amber-500 ml-0.5" />}
          </button>
          
          <button
            id="btn-export-docx"
            onClick={async () => {
              if (isPremium) {
                if (user?.uid) {
                  try {
                    const response = await fetch("/api/verify-doc-export", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ userId: user.uid, module: "egc", format: "word" })
                    });
                    if (!response.ok) {
                      const data = await response.json();
                      alert(data.error || "Word document export verification failed.");
                      if (onRequestUpgrade) onRequestUpgrade();
                      return;
                    }
                  } catch (err) {
                    console.warn("Backend validation failed, proceeding with client verification:", err);
                  }
                }
                exportEgcToWord(activeOcpd, material, egcResult);
              } else {
                alert("Word and PDF document exports are available exclusively with the Premium Plan. Upgrade your subscription to unlock professional document generation.");
                if (onRequestUpgrade) onRequestUpgrade();
              }
            }}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg border transition-all cursor-pointer shadow-sm ${
              isPremium
                ? "bg-blue-50 hover:bg-blue-100 text-blue-600 dark:bg-blue-950/40 dark:hover:bg-blue-950/60 dark:text-blue-400 border-blue-200/40 dark:border-blue-900/30"
                : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700/60"
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Word Doc</span>
            {!isPremium && <Lock className="w-3 h-3 text-amber-500 ml-0.5" />}
          </button>

          <button
            id="btn-export-xlsx"
            onClick={async () => {
              if (isPremium) {
                if (user?.uid) {
                  try {
                    const response = await fetch("/api/verify-excel-export", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ userId: user.uid, module: "egc" })
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
                exportEgcToExcel(activeOcpd, material, egcResult);
              } else {
                alert("Excel export for this module is available exclusively in the Premium Plan. Upgrade your subscription to unlock full Excel export functionality.");
                if (onRequestUpgrade) onRequestUpgrade();
              }
            }}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg border transition-all cursor-pointer shadow-sm ${
              isPremium
                ? "bg-emerald-50 hover:bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:hover:bg-emerald-950/60 dark:text-emerald-400 border-emerald-200/40 dark:border-emerald-900/30"
                : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700/60"
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Excel Sheet</span>
            {!isPremium && <Lock className="w-3 h-3 text-amber-500 ml-0.5" />}
          </button>

          <button
            id="btn-export-dxf"
            onClick={async () => {
              if (isPremium) {
                if (user?.uid) {
                  try {
                    const response = await fetch("/api/verify-cad-export", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ userId: user.uid, module: "egc" })
                    });
                    if (!response.ok) {
                      const data = await response.json();
                      alert(data.error || "CAD export verification failed.");
                      if (onRequestUpgrade) onRequestUpgrade();
                      return;
                    }
                  } catch (err) {
                    console.warn("Backend CAD validation failed, proceeding with client verification:", err);
                  }
                }
                exportEgcToDxf(activeOcpd, material, egcResult);
              } else {
                alert("AutoCAD export for this module is available exclusively in the Premium Plan. Upgrade your subscription to unlock full CAD export functionality.");
                if (onRequestUpgrade) onRequestUpgrade();
              }
            }}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg border transition-all cursor-pointer shadow-sm ${
              isPremium
                ? "bg-violet-50 hover:bg-violet-100 text-violet-600 dark:bg-violet-950/40 dark:hover:bg-violet-950/60 dark:text-violet-400 border-violet-200/40 dark:border-violet-900/30"
                : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700/60"
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>AutoCAD DXF</span>
            {!isPremium && <Lock className="w-3 h-3 text-amber-500 ml-0.5" />}
          </button>
        </div>
      </div>

      {/* Main Form + Metrics split grid */}
      <div id="egc-calculator-grid" className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left column: Parameters Intake */}
        <div id="egc-panel-params" className="lg:col-span-5 bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700/80 shadow-sm space-y-6">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-750">
            <Sliders className="w-4 h-4 text-indigo-500" />
            <h2 className="text-sm font-sans font-bold uppercase tracking-wider text-slate-750 dark:text-slate-300">
              User Design Inputs
            </h2>
          </div>

          {/* OCPD Amperes Intake */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                OCPD Rating (Overcurrent Protection)
                <span className="tooltip" title="The current rating of the fuse or circuit breaker.">
                  <HelpCircle className="w-3.5 h-3.5 text-slate-400 cursor-pointer" />
                </span>
              </label>
              
              {/* Toggle for Standard vs Custom Amperes */}
              <button
                type="button"
                onClick={() => setIsCustomStyle(!isCustomStyle)}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 transition"
              >
                {isCustomStyle ? "Switch to List" : "Enter Custom Value"}
              </button>
            </div>

            {isCustomStyle ? (
              <div className="relative rounded-lg shadow-sm">
                <input
                  id="input-custom-ocpd"
                  type="number"
                  placeholder="Enter OCPD rating e.g., 175"
                  value={customOcpdText}
                  onChange={handleCustomOcpdChange}
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-650 bg-white dark:bg-slate-750 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  min="1"
                  max="50000"
                />
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-xs font-medium text-slate-400">
                  Amperes (A)
                </div>
              </div>
            ) : (
              <select
                id="select-standard-ocpd"
                value={ocpdRating}
                onChange={handleRatingSelect}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-650 bg-white dark:bg-slate-750 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              >
                {STANDARD_CB_RATINGS.map(val => (
                  <option key={val} value={val}>
                    {val} Amperes (A)
                  </option>
                ))}
              </select>
            )}

            <p className="text-xs text-slate-405 dark:text-slate-400">
              {isCustomStyle 
                ? "Custom values between standards will automatically match the next higher standard rating in the table." 
                : "Select from standard circuit breaker or fuse ratings."}
            </p>
          </div>

          {/* Conductor Material Select */}
          <div className="space-y-3 pt-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">
              Conductor Material
            </label>
            
            <div className="grid grid-cols-3 gap-2">
              {(["Copper", "Aluminum", "Copper-Clad Aluminum"] as const).map(mat => {
                const isSel = material === mat;
                return (
                  <button
                    key={mat}
                    type="button"
                    onClick={() => setMaterial(mat)}
                    className={`px-3 py-2.5 text-xs font-bold rounded-lg border text-center transition-all cursor-pointer ${
                      isSel 
                        ? "bg-indigo-50 border-indigo-500 text-indigo-600 dark:bg-indigo-950/40 dark:border-indigo-500 dark:text-indigo-400" 
                        : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 dark:bg-slate-750 dark:border-slate-700 dark:text-slate-300"
                    }`}
                  >
                    {mat}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Input values validation flags / hints */}
          {activeOcpd < 15 && activeOcpd > 0 && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/25 border border-amber-200 dark:border-amber-900/40 rounded-lg flex items-start gap-2.5">
              <Info className="w-4.5 h-4.5 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                <strong>Minimum Size Compliance Note:</strong> General circuit breakers below 15A default to the 15A table row guidelines (minimum 2.0 mm² Copper, 3.5 mm² Al).
              </p>
            </div>
          )}

          {activeOcpd > 6000 && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/25 border border-rose-200 dark:border-rose-900/40 rounded-lg flex items-start gap-2.5">
              <ShieldAlert className="w-4.5 h-4.5 text-rose-500 shrink-0 mt-0.5" />
              <p className="text-xs text-rose-700 dark:text-rose-400">
                <strong>Maximum Ceiling Reached:</strong> OCPDs above 6000A exceed Standard Table 2.50.6.13 capacity. Sizing has defaulted to the maximal 6000A index (400 mm² Copper, 600 mm² Aluminum).
              </p>
            </div>
          )}
        </div>

        {/* Right column: Results Sizing Card */}
        <div id="egc-panel-results" className="lg:col-span-7 space-y-4">
          
          {/* Main big display card */}
          <div className="bg-gradient-to-br from-slate-900 to-indigo-950 p-6 md:p-8 rounded-xl border border-indigo-900/40 shadow-xl text-white relative overflow-hidden">
            
            {/* Ambient visual glowing bubble in background */}
            <div className="absolute right-0 top-0 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
            
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
              <span className="text-xs font-semibold uppercase tracking-widest text-indigo-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                Sizing Calculation Result
              </span>
              <span className="px-2 py-0.5 text-[10px] bg-indigo-550/30 text-indigo-300 rounded border border-indigo-550/30">
                PEC 2017 Part 1
              </span>
            </div>

            {/* Giant computed size display */}
            <div id="egc-computed-box" className="py-6 flex flex-col md:flex-row md:items-baseline md:justify-between gap-2 border-b border-white/[0.08]">
              <div>
                <p className="text-xs text-slate-400 font-medium">MINIMUM REQUIRED EQUIPMENT GROUNDING SIZE</p>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-4xl md:text-5xl font-extrabold text-white tracking-tight">
                    {egcResult.sizeMm2}
                  </span>
                  <span className="text-xl md:text-2xl font-bold text-indigo-300">
                    mm²
                  </span>
                </div>
              </div>

              <div className="bg-slate-800/60 p-3 rounded-lg border border-white/5 space-y-1">
                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Equivalent Gauge Size</p>
                <p className="text-lg md:text-xl font-bold text-indigo-300">{egcResult.sizeAwg}</p>
              </div>
            </div>

            {/* Minor Specs metadata grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pt-5">
              <div>
                <span className="text-[10px] block text-indigo-200/60 uppercase font-semibold">Matched Table Limit</span>
                <span className="text-sm font-bold text-white mt-0.5 block">{egcResult.entry.rating}A limit</span>
              </div>
              <div>
                <span className="text-[10px] block text-indigo-200/60 uppercase font-semibold">Nominal Diameter</span>
                <span className="text-sm font-bold text-white mt-0.5 block">
                  {egcResult.sizeDia === "---" ? "Not Specified" : `${egcResult.sizeDia} mm`}
                </span>
              </div>
              <div className="col-span-2 md:col-span-1">
                <span className="text-[10px] block text-indigo-200/60 uppercase font-semibold">Sizing Suffix</span>
                <span className="text-sm font-bold text-white mt-0.5 block">
                  {egcResult.isCustom ? "Rounded Up" : "Direct Match"}
                </span>
              </div>
            </div>

            {/* Live calculation guidelines text block */}
            <div className="mt-6 pt-4 border-t border-white/[0.08] flex items-start gap-2 text-[11px] text-slate-300/90 leading-relaxed">
              <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
              <div>
                <p>
                  Calculated against system circuit capacity OCPD rating of <strong>{activeOcpd}A</strong>. As per standard design guidelines, 
                  whenever the circuit overcurrent rating falls between values in Table 2.50.6.13, 
                  this calculator selects the corresponding values in the <strong>next higher standard rating ({egcResult.entry.rating}A)</strong>.
                </p>
              </div>
            </div>
          </div>

          {/* Quick Code reference guideline card */}
          <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700/80 shadow-sm flex items-start gap-3">
            <div className="p-1.5 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-500 rounded-lg shrink-0">
              <Info className="w-4.5 h-4.5" />
            </div>
            <div>
              <p className="text-xs text-slate-800 dark:text-slate-200 font-semibold">
                PEC 2017 Table Reference Clause Source: Panel EGC Sizing
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-normal mt-1">
                Equipment Grounding Conductors (EGC) are sized in accordance with Table 2.50.6.13. Rating represents the maximum current setting of the circuit breaker or fuse ahead of the protective device. Aluminum or Copper-Clad Aluminum conductors must be larger than corresponding Copper units due to ampacity and resistivity specifications.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Complete Interactive Searchable Table */}
      <div id="egc-table-section" className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700/80 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between pb-3 border-b border-slate-100 dark:border-slate-755 gap-4">
          <div>
            <h2 className="text-base font-sans font-bold text-slate-900 dark:text-white">
              PEC 2017 Table 2.50.6.13 Reference Matrix
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Search by rating or scroll to see historical values with live calculation row matching.
            </p>
          </div>

          {/* Search Box Inputs */}
          <div className="relative w-full md:w-64">
            <input
              id="input-table-search"
              type="text"
              placeholder="Search table... (e.g., 200)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-650 bg-white dark:bg-slate-750 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-1.5 focus:ring-indigo-500/50"
            />
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="w-3.5 h-3.5 text-slate-500" />
            </div>
          </div>
        </div>

        {/* Scrollable table container */}
        <div className="overflow-x-auto relative rounded-lg border border-slate-100 dark:border-slate-750 max-h-96 scrolling-touch">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-slate-100 dark:bg-slate-750 z-10 text-xs font-semibold uppercase text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="py-2.5 px-4 text-center">OCPD Up to (Amperes)</th>
                <th colSpan={3} className="py-2.5 px-4 text-center border-l border-slate-20s dark:border-slate-700 bg-amber-500/5 text-amber-700 dark:bg-amber-950/10 dark:text-amber-400">
                  Copper Grounding Conductor Size
                </th>
                <th colSpan={3} className="py-2.5 px-4 text-center border-l bg-indigo-500/5 text-indigo-700 dark:bg-indigo-950/10 dark:text-indigo-400">
                  Alum or Copper-Clad Alum Grounding Size
                </th>
              </tr>
              <tr className="bg-slate-50 dark:bg-slate-800 text-[10px] text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                <th className="py-2 px-4 text-center">Max Rating</th>
                <th className="py-2 px-2 text-center border-l">Size (mm²)</th>
                <th className="py-2 px-2 text-center">Dia. (mm)</th>
                <th className="py-2 px-2 text-center">AWG Equivalent</th>
                <th className="py-2 px-2 text-center border-l">Size (mm²)</th>
                <th className="py-2 px-2 text-center">Dia. (mm)</th>
                <th className="py-2 px-2 text-center">AWG Equivalent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-750 text-xs">
              {filteredTable.length > 0 ? (
                filteredTable.map((entry, idx) => {
                  const isMatch = (entry.rating === egcResult.entry.rating);
                  return (
                    <tr 
                      key={idx}
                      className={`transition-colors duration-150 ${
                        isMatch 
                          ? "bg-indigo-50 hover:bg-indigo-100/80 dark:bg-indigo-950/40 dark:hover:bg-indigo-950/60 font-semibold" 
                          : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      }`}
                    >
                      <td className="py-2 px-4 text-center border-r border-slate-100 dark:border-slate-750">
                        {isMatch && <span className="mr-1.5 text-indigo-650 dark:text-indigo-400">➔</span>}
                        {entry.rating} A
                      </td>
                      <td className={`py-2 px-2 text-center border-l ${isMatch && material === "Copper" ? "text-indigo-650 dark:text-indigo-400" : "text-slate-700 dark:text-slate-300"}`}>
                        {entry.copperMm2}
                      </td>
                      <td className="py-2 px-2 text-center text-slate-500 dark:text-slate-400">
                        {entry.copperDia}
                      </td>
                      <td className={`py-2 px-2 text-center ${isMatch && material === "Copper" ? "text-indigo-600 dark:text-indigo-400 font-bold" : "text-slate-600 dark:text-slate-400"}`}>
                        {entry.copperAwg}
                      </td>

                      <td className={`py-2 px-2 text-center border-l ${isMatch && material !== "Copper" ? "text-indigo-650 dark:text-indigo-400" : "text-slate-700 dark:text-slate-300"}`}>
                        {entry.alumMm2}
                      </td>
                      <td className="py-2 px-2 text-center text-slate-500 dark:text-slate-400">
                        {entry.alumDia}
                      </td>
                      <td className={`py-2 px-2 text-center ${isMatch && material !== "Copper" ? "text-indigo-600 dark:text-indigo-400 font-bold" : "text-slate-600 dark:text-slate-400"}`}>
                        {entry.alumAwg}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="py-8 px-4 text-center text-slate-505 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/20">
                    No matching OCPD sizes found in database table.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      
    </div>
  );
}
