import React, { useState, useMemo } from "react";
import { SolarDesignConfig, SolarCalculationResults, PVModule, SolarDesignOverrides } from "../../types/solar";
import { DEFAULT_PV_MODULES, determineRecommendedModule } from "../../utils/solarEngine";
import { SolarOverrideField } from "./SolarOverrideField";
import {
  Sun,
  Layers,
  ThermometerSnowflake,
  ThermometerSun,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Info,
  RotateCcw,
  Search,
  X,
  Sparkles,
  Sliders,
} from "lucide-react";

interface SolarPVTabProps {
  config: SolarDesignConfig;
  calc: SolarCalculationResults;
  onChange: (updated: Partial<SolarDesignConfig>) => void;
  onSetOverride?: (field: keyof SolarDesignOverrides, val: any) => void;
  onResetOverride?: (field: keyof SolarDesignOverrides) => void;
}

export const SolarPVTab: React.FC<SolarPVTabProps> = ({
  config,
  calc,
  onChange,
  onSetOverride,
  onResetOverride,
}) => {
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customMod, setCustomMod] = useState<Partial<PVModule>>({
    manufacturer: "Custom PV",
    model: "N-Type 600W",
    ratedPowerWp: 600,
    voc: 50.0,
    vmp: 42.0,
    isc: 14.8,
    imp: 14.28,
    maxSystemVoltage: 1500,
    efficiencyPercent: 22.0,
    tempCoeffVoc: -0.25,
    tempCoeffIsc: 0.045,
    tempCoeffPmax: -0.30,
    lengthMm: 2278,
    widthMm: 1134,
    thicknessMm: 35,
    weightKg: 28,
  });

  const allModules = useMemo(() => {
    return [...DEFAULT_PV_MODULES, ...(config.customModules || [])];
  }, [config.customModules]);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterBrand, setFilterBrand] = useState("all");

  const manufacturers = useMemo(() => {
    const list: string[] = [];
    allModules.forEach((m) => {
      const brand = m.isCustom ? "Custom" : m.manufacturer || "Other";
      if (!list.includes(brand)) {
        list.push(brand);
      }
    });
    return list;
  }, [allModules]);

  const filteredModules = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return allModules.filter((m) => {
      const matchBrand =
        filterBrand === "all" ||
        (filterBrand === "Custom" ? m.isCustom : m.manufacturer === filterBrand);
      if (!matchBrand) return false;
      if (!q) return true;
      const haystack = `${m.manufacturer} ${m.model} ${m.ratedPowerWp}W ${m.ratedPowerWp}Wp ${m.efficiencyPercent}%`.toLowerCase();
      return haystack.includes(q);
    });
  }, [allModules, searchQuery, filterBrand]);

  const isAutoModule =
    !config.selectedModuleId ||
    config.selectedModuleId === "auto" ||
    Boolean(config.autoModuleSelection);

  const recommendedModule = useMemo(() => {
    if (calc.recommendedModule) return calc.recommendedModule;
    const targetKwp = calc.totalDcCapacityKwp || config.targetCapacityKwp || 5.0;
    return determineRecommendedModule(config, targetKwp, allModules, calc.selectedInverter);
  }, [calc.recommendedModule, config, calc.totalDcCapacityKwp, allModules, calc.selectedInverter]);

  const groupedModules = useMemo(() => {
    let list = filteredModules;
    // Always ensure the currently selected module is accessible even if filtered
    if (config.selectedModuleId && config.selectedModuleId !== "auto" && !list.some((m) => m.id === config.selectedModuleId)) {
      const current = allModules.find((m) => m.id === config.selectedModuleId);
      if (current) list = [current, ...list];
    }

    const map = new Map<string, PVModule[]>();
    list.forEach((m) => {
      const groupName = m.isCustom ? "Custom Modules" : m.manufacturer || "Other";
      if (!map.has(groupName)) {
        map.set(groupName, []);
      }
      map.get(groupName)!.push(m);
    });
    // Smallest to largest wattage within each brand
    map.forEach((mods) => mods.sort((a, b) => a.ratedPowerWp - b.ratedPowerWp));
    return map;
  }, [filteredModules, config.selectedModuleId, allModules]);

  const handleAddCustomModule = () => {
    if (!customMod.model || !customMod.ratedPowerWp) return;
    const newMod: PVModule = {
      id: `custom-pv-${Date.now()}`,
      manufacturer: customMod.manufacturer || "Custom",
      model: customMod.model || "Custom Module",
      ratedPowerWp: customMod.ratedPowerWp || 550,
      voc: customMod.voc || 49.0,
      vmp: customMod.vmp || 41.5,
      isc: customMod.isc || 14.0,
      imp: customMod.imp || 13.25,
      maxSystemVoltage: customMod.maxSystemVoltage || 1500,
      efficiencyPercent: customMod.efficiencyPercent || 21.5,
      tempCoeffVoc: customMod.tempCoeffVoc || -0.25,
      tempCoeffIsc: customMod.tempCoeffIsc || 0.05,
      tempCoeffPmax: customMod.tempCoeffPmax || -0.32,
      lengthMm: customMod.lengthMm || 2278,
      widthMm: customMod.widthMm || 1134,
      thicknessMm: customMod.thicknessMm || 35,
      weightKg: customMod.weightKg || 28,
      isCustom: true,
    };

    const updatedList = [...(config.customModules || []), newMod];
    onChange({
      customModules: updatedList,
      selectedModuleId: newMod.id,
    });
    setShowCustomModal(false);
  };

  return (
    <div className="space-y-6">
      {/* 1. PV Module Selection & Technical Specifications */}
      <div className="bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-2xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-700/60 pb-3">
          <div className="flex items-center gap-2">
            <Sun className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
              Photovoltaic (PV) Module Selection
            </h3>
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700/60 px-2 py-0.5 rounded-full">
              {allModules.length} Models Available
            </span>
          </div>
          <button
            onClick={() => setShowCustomModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-amber-50 dark:bg-amber-950/50 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-amber-700 dark:text-amber-300 rounded-xl border border-amber-200 dark:border-amber-800/50 transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Custom Module</span>
          </button>
        </div>

        {/* Brand Filter Pills & Search Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
          <div className="flex items-center gap-1.5 overflow-x-auto max-w-full pb-1 text-[11px] scrollbar-thin">
            <button
              onClick={() => setFilterBrand("all")}
              className={`px-2.5 py-1 rounded-lg font-semibold transition whitespace-nowrap cursor-pointer ${
                filterBrand === "all"
                  ? "bg-amber-500 text-white shadow-xs"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}
            >
              All Brands ({allModules.length})
            </button>
            {manufacturers.map((brand) => (
              <button
                key={brand}
                onClick={() => setFilterBrand(brand)}
                className={`px-2 py-1 rounded-lg font-semibold transition whitespace-nowrap cursor-pointer ${
                  filterBrand === brand
                    ? "bg-amber-500 text-white shadow-xs"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                }`}
              >
                {brand}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search wattage, brand, model..."
              className="pl-8 pr-7 py-1 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:ring-2 focus:ring-amber-500 focus:outline-none w-48 sm:w-60"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Module Picker */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-1.5 mb-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <span>Select Module Model</span>
              </label>

              <div className="flex items-center gap-1.5">
                {isAutoModule ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-300/80 dark:border-emerald-800/80">
                    <Sparkles className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" />
                    <span>AUTOMATIC (Required: {recommendedModule.ratedPowerWp}Wp)</span>
                  </span>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-300/80 dark:border-amber-800/80">
                      <Sliders className="w-2.5 h-2.5 text-amber-600 dark:text-amber-400" />
                      <span>MANUAL SELECTION</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => onChange({ selectedModuleId: "auto", autoModuleSelection: true })}
                      title="Reset to automatic module model selection based on system requirement"
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 border border-slate-300/80 dark:border-slate-600 transition cursor-pointer"
                    >
                      <RotateCcw className="w-2.5 h-2.5" />
                      <span>Reset to Auto</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            <select
              value={isAutoModule ? "auto" : config.selectedModuleId}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "auto") {
                  onChange({ selectedModuleId: "auto", autoModuleSelection: true });
                } else {
                  onChange({ selectedModuleId: val, autoModuleSelection: false });
                }
              }}
              className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500 focus:outline-none"
            >
              <option value="auto">
                ⚡ Auto-Select (Recommended: {recommendedModule.manufacturer} {recommendedModule.model} — {recommendedModule.ratedPowerWp}Wp)
              </option>
              {Array.from(groupedModules.entries()).map(([groupName, mods]) => (
                <optgroup key={groupName} label={`${groupName} (${mods.length})`}>
                  {mods.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.manufacturer} {m.model} — {m.ratedPowerWp}Wp ({m.efficiencyPercent}% Eff)
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>

            <div className="mt-1.5 text-[11px] flex items-center gap-1.5">
              {isAutoModule ? (
                <span className="text-emerald-700 dark:text-emerald-400 flex items-center gap-1 font-medium">
                  <Sparkles className="w-3 h-3 shrink-0" />
                  <span>
                    Auto-selected for <strong>{config.projectType === "residential" ? "Residential" : config.projectType === "industrial" ? "Industrial" : "Commercial"}</strong> requirements ({calc.totalDcCapacityKwp || config.targetCapacityKwp} kWp needed): <strong>{recommendedModule.manufacturer} {recommendedModule.model}</strong> ({recommendedModule.ratedPowerWp}Wp, {recommendedModule.efficiencyPercent}% Eff, {recommendedModule.weightKg}kg).
                  </span>
                </span>
              ) : (
                <span className="text-amber-700 dark:text-amber-400 flex items-center gap-1 font-medium">
                  <Info className="w-3 h-3 shrink-0" />
                  <span>
                    Manual module model override active. Select <em>"⚡ Auto-Select"</em> or click <em>"Reset to Auto"</em> to let the engine auto-match based on project load &amp; scale.
                  </span>
                </span>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Module Efficiency &amp; Dimensions
            </label>
            <div className="px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900/50 text-emerald-600 dark:text-emerald-400">
              <div>{calc.selectedModule.efficiencyPercent}% Conversion Efficiency</div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 font-normal mt-0.5">
                {calc.selectedModule.lengthMm} × {calc.selectedModule.widthMm} × {calc.selectedModule.thicknessMm} mm • {calc.selectedModule.weightKg} kg
              </div>
            </div>
          </div>
        </div>

        {/* Selected Module Specs Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5 pt-2">
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-700/60 text-center">
            <span className="text-[10px] text-slate-400 font-bold block">Pmax (STC)</span>
            <span className="text-xs font-black text-slate-800 dark:text-slate-100 mt-0.5 block">
              {calc.selectedModule.ratedPowerWp} Wp
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-700/60 text-center">
            <span className="text-[10px] text-slate-400 font-bold block">Voc (STC)</span>
            <span className="text-xs font-black text-slate-800 dark:text-slate-100 mt-0.5 block">
              {calc.selectedModule.voc} V
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-700/60 text-center">
            <span className="text-[10px] text-slate-400 font-bold block">Vmp (STC)</span>
            <span className="text-xs font-black text-slate-800 dark:text-slate-100 mt-0.5 block">
              {calc.selectedModule.vmp} V
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-700/60 text-center">
            <span className="text-[10px] text-slate-400 font-bold block">Isc (STC)</span>
            <span className="text-xs font-black text-slate-800 dark:text-slate-100 mt-0.5 block">
              {calc.selectedModule.isc} A
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-700/60 text-center">
            <span className="text-[10px] text-slate-400 font-bold block">Imp (STC)</span>
            <span className="text-xs font-black text-slate-800 dark:text-slate-100 mt-0.5 block">
              {calc.selectedModule.imp} A
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-700/60 text-center">
            <span className="text-[10px] text-slate-400 font-bold block">Temp Coeff Voc</span>
            <span className="text-xs font-black text-slate-800 dark:text-slate-100 mt-0.5 block">
              {calc.selectedModule.tempCoeffVoc}%/°C
            </span>
          </div>
        </div>
      </div>

      {/* 2. String Architecture & Environmental Temperatures */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* String Sizing Inputs */}
        <div className="bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700/60 pb-3">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-sky-600" />
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                Array String Configuration
              </h3>
            </div>
            <span className="text-xs font-bold text-sky-600 dark:text-sky-400">
              {calc.totalModules} Total Modules
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SolarOverrideField
              label="Modules per String (Series)"
              fieldKey="modulesPerString"
              effectiveValue={calc.effective.modulesPerString}
              autoValue={calc.autoValues.modulesPerString}
              isOverridden={calc.isOverridden.modulesPerString}
              unit="mods"
              min={1}
              max={32}
              step={1}
              warning={calc.fieldWarnings.modulesPerString}
              hint="Sized for PEC 6.90 cold Voc and hot Vmp range"
              onValueChange={(val) => {
                const num = Math.max(1, parseInt(val) || 1);
                if (onSetOverride) {
                  onSetOverride("modulesPerString", num);
                } else {
                  onChange({
                    modulesPerString: num,
                    overrides: { ...(config.overrides || {}), modulesPerString: num },
                  });
                }
              }}
              onResetToAuto={() => {
                if (onResetOverride) {
                  onResetOverride("modulesPerString");
                } else {
                  const nextOverrides = { ...(config.overrides || {}) };
                  delete nextOverrides.modulesPerString;
                  onChange({ overrides: nextOverrides });
                }
              }}
            />

            <SolarOverrideField
              label="Number of Strings (Parallel)"
              fieldKey="numberOfStrings"
              effectiveValue={calc.effective.numberOfStrings}
              autoValue={calc.autoValues.numberOfStrings}
              isOverridden={calc.isOverridden.numberOfStrings}
              unit="strings"
              min={1}
              max={500}
              step={1}
              warning={calc.fieldWarnings.numberOfStrings}
              hint="Calculated from inverter capacity & array DC target"
              onValueChange={(val) => {
                const num = Math.max(1, parseInt(val) || 1);
                if (onSetOverride) {
                  onSetOverride("numberOfStrings", num);
                } else {
                  onChange({
                    numberOfStrings: num,
                    overrides: { ...(config.overrides || {}), numberOfStrings: num },
                  });
                }
              }}
              onResetToAuto={() => {
                if (onResetOverride) {
                  onResetOverride("numberOfStrings");
                } else {
                  const nextOverrides = { ...(config.overrides || {}) };
                  delete nextOverrides.numberOfStrings;
                  onChange({ overrides: nextOverrides });
                }
              }}
            />
          </div>

          {/* Module Count Override Field */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-700/60">
            <SolarOverrideField
              label="Total PV Modules in Array"
              fieldKey="totalModules"
              effectiveValue={calc.effective.totalModules}
              autoValue={calc.autoValues.totalModules}
              isOverridden={calc.isOverridden.totalModules}
              unit="mods"
              min={1}
              max={10000}
              step={1}
              warning={calc.fieldWarnings.totalModules}
              hint="Automatic: Series strings × modules per string"
              onValueChange={(val) => {
                const num = Math.max(1, parseInt(val) || 1);
                if (onSetOverride) {
                  onSetOverride("totalModules", num);
                } else {
                  onChange({
                    manualModuleOverride: true,
                    totalModules: num,
                    overrides: { ...(config.overrides || {}), totalModules: num },
                  });
                }
              }}
              onResetToAuto={() => {
                if (onResetOverride) {
                  onResetOverride("totalModules");
                } else {
                  const nextOverrides = { ...(config.overrides || {}) };
                  delete nextOverrides.totalModules;
                  onChange({
                    manualModuleOverride: false,
                    overrides: nextOverrides,
                  });
                }
              }}
            />
          </div>
        </div>

        {/* Operating Temperature Parameters (PEC 2017 Art 6.90.7) */}
        <div className="bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700/60 pb-3">
            <div className="flex items-center gap-2">
              <ThermometerSun className="w-4 h-4 text-rose-500" />
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                Environmental Temperature Design
              </h3>
            </div>
            <span className="text-[11px] font-bold text-slate-500">
              PEC 2017 Art 6.90.7
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Design Minimum Ambient (°C)
              </label>
              <div className="flex items-center gap-2">
                <ThermometerSnowflake className="w-4 h-4 text-sky-500 shrink-0" />
                <input
                  type="number"
                  min="5"
                  max="30"
                  value={config.minOperatingTempC}
                  onChange={(e) =>
                    onChange({ minOperatingTempC: parseFloat(e.target.value) || 18 })
                  }
                  className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                />
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">
                PH standard: 18°C (Max Voc calculation)
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Design Maximum Cell Temp (°C)
              </label>
              <div className="flex items-center gap-2">
                <ThermometerSun className="w-4 h-4 text-rose-500 shrink-0" />
                <input
                  type="number"
                  min="40"
                  max="85"
                  value={config.maxOperatingTempC}
                  onChange={(e) =>
                    onChange({ maxOperatingTempC: parseFloat(e.target.value) || 65 })
                  }
                  className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                />
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">
                PH standard: 65°C cell temp (Min Vmp)
              </span>
            </div>
          </div>

          {/* Quick Temperature Info Box */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-700/60 text-xs text-slate-600 dark:text-slate-400 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200">
              <Info className="w-3.5 h-3.5 text-sky-500" />
              <span>PEC Voltage Sizing Basis</span>
            </div>
            <p className="text-[11px]">
              PV module voltage increases in cold temperatures. Voc is evaluated at {config.minOperatingTempC}°C to guarantee the inverter max DC limit is never exceeded.
            </p>
          </div>
        </div>
      </div>

      {/* 3. Mathematical Calculations Output & Compliance Checks */}
      <div className="bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700/60 pb-3">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
            Calculated String Electrical Parameters & Voltage Validation
          </h3>
          <div className="flex items-center gap-2">
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-bold flex items-center gap-1 ${
                calc.validations.vocWithinMaxDcVoltage && calc.validations.vmpWithinMpptRange
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400"
                  : "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400"
              }`}
            >
              {calc.validations.vocWithinMaxDcVoltage && calc.validations.vmpWithinMpptRange ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>String Sizing Compliant</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>String Validation Alert</span>
                </>
              )}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/60">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Max String Voc (Cold 18°C)
            </span>
            <span className="text-base font-black text-rose-600 dark:text-rose-400 mt-1 block">
              {calc.stringVoc} V DC
            </span>
            <span className="text-[10px] text-slate-500 mt-1 block">
              Limit: ≤ {calc.selectedInverter.maxDcVoltage}V ({calc.validations.vocWithinMaxDcVoltage ? "OK" : "EXCEEDED"})
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/60">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              String Vmp (Hot 65°C)
            </span>
            <span className="text-base font-black text-sky-600 dark:text-sky-400 mt-1 block">
              {calc.stringVmp} V DC
            </span>
            <span className="text-[10px] text-slate-500 mt-1 block">
              MPPT: {calc.selectedInverter.mpptVoltageRangeMin}V - {calc.selectedInverter.mpptVoltageRangeMax}V ({calc.validations.vmpWithinMpptRange ? "OK" : "OUTSIDE"})
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/60">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              String Operating Current (Imp)
            </span>
            <span className="text-base font-black text-slate-800 dark:text-slate-100 mt-1 block">
              {calc.stringImp} A DC
            </span>
            <span className="text-[10px] text-slate-500 mt-1 block">
              Short-Circuit Isc: {calc.stringIsc} A
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/60">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Total DC Array Capacity
            </span>
            <span className="text-base font-black text-emerald-600 dark:text-emerald-400 mt-1 block">
              {calc.totalDcCapacityKwp} kWp
            </span>
            <span className="text-[10px] text-slate-500 mt-1 block">
              {calc.totalDcCapacityW.toLocaleString()} Watts DC
            </span>
          </div>
        </div>

        {/* Detailed Mathematical Substitution Breakdown */}
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/60 text-xs font-mono text-slate-700 dark:text-slate-300 space-y-1.5">
          <div className="font-bold text-slate-900 dark:text-slate-100 font-sans text-xs">
            Step-by-Step Mathematical Verifications:
          </div>
          <div>
            1. Module Voc(cold) = {calc.selectedModule.voc}V × [1 + ({config.minOperatingTempC} - 25) × ({calc.selectedModule.tempCoeffVoc} / 100)] = <span className="font-bold text-rose-600">{calc.vocCold} V</span>
          </div>
          <div>
            2. String Voc(cold) = {calc.effective.modulesPerString} mods × {calc.vocCold}V = <span className="font-bold text-rose-600">{calc.stringVoc} V DC</span> (PEC 6.90.7 check: {calc.stringVoc}V ≤ {calc.selectedInverter.maxDcVoltage}V)
          </div>
          <div>
            3. Module Vmp(hot) = {calc.selectedModule.vmp}V × [1 + ({config.maxOperatingTempC} - 25) × ({calc.selectedModule.tempCoeffPmax} / 100)] = <span className="font-bold text-sky-600">{calc.vmpHot} V</span>
          </div>
          <div>
            4. String Vmp(hot) = {calc.effective.modulesPerString} mods × {calc.vmpHot}V = <span className="font-bold text-sky-600">{calc.stringVmp} V DC</span> (MPPT operating range: {calc.selectedInverter.mpptVoltageRangeMin}V – {calc.selectedInverter.mpptVoltageRangeMax}V)
          </div>
        </div>
      </div>

      {/* Modal for adding custom PV Module */}
      {showCustomModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Add Custom PV Module Specification
              </h3>
              <button
                onClick={() => setShowCustomModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">Manufacturer</label>
                <input
                  type="text"
                  value={customMod.manufacturer}
                  onChange={(e) => setCustomMod({ ...customMod, manufacturer: e.target.value })}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">Model Name</label>
                <input
                  type="text"
                  value={customMod.model}
                  onChange={(e) => setCustomMod({ ...customMod, model: e.target.value })}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">Pmax (Wp)</label>
                <input
                  type="number"
                  value={customMod.ratedPowerWp}
                  onChange={(e) => setCustomMod({ ...customMod, ratedPowerWp: parseFloat(e.target.value) || 550 })}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">Efficiency (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={customMod.efficiencyPercent}
                  onChange={(e) => setCustomMod({ ...customMod, efficiencyPercent: parseFloat(e.target.value) || 21 })}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">Voc (V)</label>
                <input
                  type="number"
                  step="0.1"
                  value={customMod.voc}
                  onChange={(e) => setCustomMod({ ...customMod, voc: parseFloat(e.target.value) || 49 })}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">Vmp (V)</label>
                <input
                  type="number"
                  step="0.1"
                  value={customMod.vmp}
                  onChange={(e) => setCustomMod({ ...customMod, vmp: parseFloat(e.target.value) || 41 })}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">Isc (A)</label>
                <input
                  type="number"
                  step="0.1"
                  value={customMod.isc}
                  onChange={(e) => setCustomMod({ ...customMod, isc: parseFloat(e.target.value) || 14 })}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">Imp (A)</label>
                <input
                  type="number"
                  step="0.1"
                  value={customMod.imp}
                  onChange={(e) => setCustomMod({ ...customMod, imp: parseFloat(e.target.value) || 13 })}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setShowCustomModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddCustomModule}
                className="px-4 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white rounded-xl shadow-xs"
              >
                Add & Select Module
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
