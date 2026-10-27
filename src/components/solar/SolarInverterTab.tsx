import React, { useState, useMemo } from "react";
import {
  SolarDesignConfig,
  SolarCalculationResults,
  SolarInverter,
  SolarBattery,
  SolarDesignOverrides,
} from "../../types/solar";
import {
  DEFAULT_INVERTERS,
  DEFAULT_BATTERIES,
  determineRecommendedInverter,
} from "../../utils/solarEngine";
import { SolarOverrideField } from "./SolarOverrideField";
import {
  Zap,
  Battery,
  BatteryCharging,
  Gauge,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldAlert,
  Layers,
  Sparkles,
  ArrowRight,
  Search,
  X,
  Plus,
  Sliders,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Cpu,
  Boxes,
  RotateCcw,
} from "lucide-react";

interface SolarInverterTabProps {
  config: SolarDesignConfig;
  calc: SolarCalculationResults;
  onChange: (updated: Partial<SolarDesignConfig>) => void;
  onSetOverride?: (field: keyof SolarDesignOverrides, val: any) => void;
  onResetOverride?: (field: keyof SolarDesignOverrides) => void;
}

export const SolarInverterTab: React.FC<SolarInverterTabProps> = ({
  config,
  calc,
  onChange,
  onSetOverride,
  onResetOverride,
}) => {
  const allInverters = useMemo(() => {
    return [...DEFAULT_INVERTERS, ...(config.customInverters || [])];
  }, [config.customInverters]);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterBrand, setFilterBrand] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const [customInv, setCustomInv] = useState<Partial<SolarInverter>>({
    manufacturer: "Custom Inverter",
    model: "Commercial 60kW",
    ratedAcPowerKw: 60.0,
    maxDcInputPowerKw: 90.0,
    maxDcVoltage: 1100,
    mpptVoltageRangeMin: 200,
    mpptVoltageRangeMax: 1000,
    numMppts: 4,
    maxInputCurrentPerMppt: 32.0,
    maxIscPerMppt: 48.0,
    ratedAcCurrent: 86.6,
    maxAcCurrent: 95.5,
    acVoltage: 400,
    phase: "3PH",
    efficiencyPercent: 98.6,
    ipRating: "IP66",
  });

  // Battery Storage System State & Expansion
  const allBatteries = useMemo<SolarBattery[]>(() => {
    return [...DEFAULT_BATTERIES, ...(config.customBatteries || [])];
  }, [config.customBatteries]);

  const [batterySearchQuery, setBatterySearchQuery] = useState("");
  const [batteryFilterBrand, setBatteryFilterBrand] = useState("all");
  const [batteryFilterVoltageType, setBatteryFilterVoltageType] = useState("all");
  const [showAllBatteries, setShowAllBatteries] = useState(false);
  const [isAddBatteryModalOpen, setIsAddBatteryModalOpen] = useState(false);

  const [customBatt, setCustomBatt] = useState<Partial<SolarBattery>>({
    manufacturer: "Custom Energy",
    model: "LFP Server Rack 51.2V 100Ah",
    voltageV: 51.2,
    capacityAh: 100,
    energyKwh: 5.12,
    dodPercent: 90,
    efficiencyPercent: 95,
    chemistry: "LiFePO4",
    voltageType: "low_voltage",
    formFactor: "rack_mount",
    maxDischargeCurrentA: 100,
    cycleLife: 6000,
  });

  const batteryManufacturers = useMemo(() => {
    const list: string[] = [];
    allBatteries.forEach((b) => {
      const brand = b.isCustom ? "Custom" : b.manufacturer || "Other";
      if (!list.includes(brand)) {
        list.push(brand);
      }
    });
    return list.sort();
  }, [allBatteries]);

  const filteredBatteries = useMemo(() => {
    return allBatteries.filter((b) => {
      if (batteryFilterBrand !== "all") {
        const brand = b.isCustom ? "Custom" : b.manufacturer;
        if (brand !== batteryFilterBrand) return false;
      }
      if (batteryFilterVoltageType === "low_voltage" && b.voltageType !== "low_voltage" && b.voltageV > 100) {
        return false;
      }
      if (batteryFilterVoltageType === "high_voltage" && (b.voltageType !== "high_voltage" || b.voltageV <= 100)) {
        return false;
      }
      if (batteryFilterVoltageType === "commercial_bess" && b.voltageType !== "commercial_bess" && b.energyKwh < 40) {
        return false;
      }
      if (batterySearchQuery.trim()) {
        const q = batterySearchQuery.toLowerCase();
        const match =
          b.manufacturer.toLowerCase().includes(q) ||
          b.model.toLowerCase().includes(q) ||
          `${b.energyKwh}kwh`.includes(q) ||
          `${b.voltageV}v`.includes(q) ||
          (b.chemistry || "").toLowerCase().includes(q) ||
          (b.formFactor || "").toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [allBatteries, batteryFilterBrand, batteryFilterVoltageType, batterySearchQuery]);

  const manufacturers = useMemo(() => {
    const list: string[] = [];
    allInverters.forEach((i) => {
      const brand = i.isCustom ? "Custom" : i.manufacturer || "Other";
      if (!list.includes(brand)) {
        list.push(brand);
      }
    });
    return list;
  }, [allInverters]);

  const filteredInverters = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return allInverters.filter((i) => {
      const matchBrand =
        filterBrand === "all" ||
        (filterBrand === "Custom" ? i.isCustom : i.manufacturer === filterBrand);
      if (!matchBrand) return false;

      // Type / Grid filter
      if (filterType === "1PH" && i.phase !== "1PH") return false;
      if (filterType === "3PH-400V" && !(i.phase === "3PH" && i.acVoltage >= 380)) return false;
      if (filterType === "3PH-230V" && !(i.phase === "3PH" && i.acVoltage <= 240)) return false;
      if (
        filterType === "hybrid" &&
        !i.model.toLowerCase().includes("hybrid") &&
        !i.model.toLowerCase().includes("storage")
      )
        return false;
      if (filterType === "micro" && !i.model.toLowerCase().includes("micro")) return false;

      if (!q) return true;
      const haystack =
        `${i.manufacturer} ${i.model} ${i.ratedAcPowerKw}kw ${i.ratedAcPowerKw} kw ${i.phase} ${i.acVoltage}v ${i.numMppts}mppt ${i.efficiencyPercent}%`.toLowerCase();
      return haystack.includes(q);
    });
  }, [allInverters, searchQuery, filterBrand, filterType]);

  const isAutoInverter =
    !config.selectedInverterId ||
    config.selectedInverterId === "auto" ||
    Boolean(config.autoInverterSelection);

  const recommendedInverter = useMemo(() => {
    if (calc.recommendedInverter) return calc.recommendedInverter;
    const targetKwp = calc.totalDcCapacityKwp || config.targetCapacityKwp || 5.0;
    return determineRecommendedInverter(config, targetKwp, allInverters, calc.selectedModule);
  }, [calc.recommendedInverter, config, calc.totalDcCapacityKwp, allInverters, calc.selectedModule]);

  const groupedInverters = useMemo(() => {
    let list = filteredInverters;
    if (
      config.selectedInverterId &&
      config.selectedInverterId !== "auto" &&
      !list.some((i) => i.id === config.selectedInverterId)
    ) {
      const current = allInverters.find((i) => i.id === config.selectedInverterId);
      if (current) list = [current, ...list];
    }

    const map = new Map<string, SolarInverter[]>();
    list.forEach((i) => {
      const groupName = i.isCustom ? "Custom Inverters" : i.manufacturer || "Other";
      if (!map.has(groupName)) {
        map.set(groupName, []);
      }
      map.get(groupName)!.push(i);
    });
    // Single-phase models first, then by size
    map.forEach((list) =>
      list.sort((a, b) => (a.phase === b.phase ? 0 : a.phase === "1PH" ? -1 : 1) || a.ratedAcPowerKw - b.ratedAcPowerKw)
    );
    return map;
  }, [filteredInverters, allInverters, config.selectedInverterId]);

  const handleSaveCustomInverter = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customInv.model || !customInv.ratedAcPowerKw) return;
    const newId = `custom-inv-${Date.now()}`;
    const newInv: SolarInverter = {
      id: newId,
      manufacturer: customInv.manufacturer || "Custom Inverter",
      model: customInv.model,
      ratedAcPowerKw: Number(customInv.ratedAcPowerKw) || 50,
      maxDcInputPowerKw:
        Number(customInv.maxDcInputPowerKw) || (Number(customInv.ratedAcPowerKw) || 50) * 1.5,
      maxDcVoltage: Number(customInv.maxDcVoltage) || 1100,
      mpptVoltageRangeMin: Number(customInv.mpptVoltageRangeMin) || 200,
      mpptVoltageRangeMax: Number(customInv.mpptVoltageRangeMax) || 1000,
      numMppts: Number(customInv.numMppts) || 4,
      maxInputCurrentPerMppt: Number(customInv.maxInputCurrentPerMppt) || 30,
      maxIscPerMppt: Number(customInv.maxIscPerMppt) || 40,
      ratedAcCurrent: Number(customInv.ratedAcCurrent) || 72.2,
      maxAcCurrent: Number(customInv.maxAcCurrent) || 80.0,
      acVoltage: Number(customInv.acVoltage) || 400,
      phase: (customInv.phase as "1PH" | "3PH") || "3PH",
      frequencyHz: 60,
      efficiencyPercent: Number(customInv.efficiencyPercent) || 98.5,
      ipRating: customInv.ipRating || "IP66",
      isCustom: true,
    };
    const updatedCustom = [...(config.customInverters || []), newInv];
    onChange({
      customInverters: updatedCustom,
      selectedInverterId: newId,
    });
    setIsAddModalOpen(false);
  };

  const isHybridOrOffGrid = config.systemType !== "on-grid";

  const handleAutoRecommendInverters = () => {
    // Recommend inverter quantity so that DC/AC ratio is ~1.15 - 1.25
    const targetAcKw = calc.totalDcCapacityKwp / 1.2;
    const invRating = calc.selectedInverter.ratedAcPowerKw;
    const recommendedQty = Math.max(1, Math.round(targetAcKw / invRating));
    onChange({ inverterQuantity: recommendedQty });
  };

  const handleSelectBatteryPreset = (b: SolarBattery) => {
    onChange({
      battery: {
        ...config.battery,
        manufacturer: b.manufacturer,
        model: b.model,
        voltageV: b.voltageV,
        capacityAh: b.capacityAh,
        energyKwh: b.energyKwh,
        dodPercent: b.dodPercent,
        efficiencyPercent: b.efficiencyPercent,
        chemistry: b.chemistry || "LiFePO4",
        voltageType: b.voltageType || (b.voltageV > 100 ? "high_voltage" : "low_voltage"),
        maxDischargeCurrentA: b.maxDischargeCurrentA,
      },
    });
  };

  const handleAddCustomBattery = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customBatt.manufacturer || !customBatt.model || !customBatt.energyKwh) return;

    const newBattery: SolarBattery = {
      id: `custom-batt-${Date.now()}`,
      manufacturer: customBatt.manufacturer.trim(),
      model: customBatt.model.trim(),
      voltageV: Number(customBatt.voltageV) || 51.2,
      capacityAh: Number(customBatt.capacityAh) || 100,
      energyKwh: Number(customBatt.energyKwh) || 5.12,
      dodPercent: Number(customBatt.dodPercent) || 90,
      efficiencyPercent: Number(customBatt.efficiencyPercent) || 95,
      chemistry: customBatt.chemistry || "LiFePO4",
      voltageType: customBatt.voltageType || (Number(customBatt.voltageV) > 100 ? "high_voltage" : "low_voltage"),
      formFactor: customBatt.formFactor || "wall_mount",
      maxDischargeCurrentA: Number(customBatt.maxDischargeCurrentA) || 100,
      cycleLife: Number(customBatt.cycleLife) || 6000,
      isCustom: true,
    };

    const updatedCustomBatteries = [...(config.customBatteries || []), newBattery];
    onChange({
      customBatteries: updatedCustomBatteries,
      battery: {
        ...config.battery,
        manufacturer: newBattery.manufacturer,
        model: newBattery.model,
        voltageV: newBattery.voltageV,
        capacityAh: newBattery.capacityAh,
        energyKwh: newBattery.energyKwh,
        dodPercent: newBattery.dodPercent,
        efficiencyPercent: newBattery.efficiencyPercent,
        chemistry: newBattery.chemistry,
        voltageType: newBattery.voltageType,
      },
    });
    setIsAddBatteryModalOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* 1. Inverter Selection & AC Sizing */}
      <div className="bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-2xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-700/60 pb-3">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-sky-500" />
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
              Solar Inverter Selection & AC Generation
            </h3>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300">
              {filteredInverters.length} of {allInverters.length} Models
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-sky-500" />
              <span>Add Custom Inverter</span>
            </button>
            <button
              onClick={handleAutoRecommendInverters}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-sky-50 dark:bg-sky-950/50 hover:bg-sky-100 dark:hover:bg-sky-900/60 text-sky-700 dark:text-sky-300 rounded-xl border border-sky-200 dark:border-sky-800/50 transition cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Auto-Size Inverter Qty (~1.20 DC/AC)</span>
            </button>
          </div>
        </div>

        {/* Brand & Type Filters + Search Bar */}
        <div className="space-y-2.5 pt-1">
          {/* Brand Filter Row */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-slate-400 font-semibold mr-1 flex items-center gap-1">
                <SlidersHorizontal className="w-3 h-3" /> Brand:
              </span>
              <button
                onClick={() => setFilterBrand("all")}
                className={`px-2 py-1 rounded-lg font-semibold transition whitespace-nowrap cursor-pointer ${
                  filterBrand === "all"
                    ? "bg-sky-500 text-white shadow-xs"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                }`}
              >
                All Brands ({allInverters.length})
              </button>
              {manufacturers.map((brand) => (
                <button
                  key={brand}
                  onClick={() => setFilterBrand(brand)}
                  className={`px-2 py-1 rounded-lg font-semibold transition whitespace-nowrap cursor-pointer ${
                    filterBrand === brand
                      ? "bg-sky-500 text-white shadow-xs"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                  }`}
                >
                  {brand}
                </button>
              ))}
            </div>

            {/* Search Bar */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search kW, model, brand, MPPT..."
                className="pl-8 pr-7 py-1 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:ring-2 focus:ring-sky-500 focus:outline-none w-52 sm:w-64"
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

          {/* Type / Grid Filters */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-slate-400 font-semibold mr-1">Grid / Phase:</span>
            {[
              { id: "all", label: "All Grid Types" },
              { id: "1PH", label: "1PH (230V Residential)" },
              { id: "3PH-400V", label: "3PH (400V Standard C&I)" },
              { id: "3PH-230V", label: "3PH (230V Delta PH Grid)" },
              { id: "hybrid", label: "Hybrid / BESS" },
              { id: "micro", label: "Microinverters" },
            ].map((type) => (
              <button
                key={type.id}
                onClick={() => setFilterType(type.id)}
                className={`px-2 py-0.5 text-[11px] rounded-md font-semibold transition cursor-pointer ${
                  filterType === type.id
                    ? "bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900"
                    : "bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                }`}
              >
                {type.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-1.5 mb-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <span>Select Inverter Model</span>
              </label>

              <div className="flex items-center gap-1.5">
                {isAutoInverter ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-800 dark:bg-sky-950/70 dark:text-sky-300 border border-sky-300/80 dark:border-sky-800/80">
                    <Sparkles className="w-2.5 h-2.5 text-sky-600 dark:text-sky-400" />
                    <span>AUTOMATIC (Required: ~{recommendedInverter.ratedAcPowerKw} kW AC • {recommendedInverter.phase} {recommendedInverter.acVoltage}V)</span>
                  </span>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-300/80 dark:border-amber-800/80">
                      <Sliders className="w-2.5 h-2.5 text-amber-600 dark:text-amber-400" />
                      <span>MANUAL SELECTION</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => onChange({ selectedInverterId: "auto", autoInverterSelection: true })}
                      title="Reset to automatic inverter model selection based on system requirement"
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
              value={isAutoInverter ? "auto" : config.selectedInverterId}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "auto") {
                  onChange({ selectedInverterId: "auto", autoInverterSelection: true });
                } else {
                  onChange({ selectedInverterId: val, autoInverterSelection: false });
                }
              }}
              className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-sky-500 focus:outline-none"
            >
              <option value="auto">
                ⚡ Auto-Select (Recommended: {recommendedInverter.manufacturer} {recommendedInverter.model} — {recommendedInverter.ratedAcPowerKw} kW AC)
              </option>
              {Array.from(groupedInverters.entries()).map(([groupName, inverters]) => (
                <optgroup key={groupName} label={`${groupName} (${inverters.length})`}>
                  {inverters.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.manufacturer} {i.model} — {i.ratedAcPowerKw} kW AC ({i.phase} {i.acVoltage}V, {i.numMppts} MPPTs)
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>

            <div className="mt-1.5 text-[11px] flex items-center gap-1.5">
              {isAutoInverter ? (
                <p className="text-sky-700 dark:text-sky-400 font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-sky-500 shrink-0" />
                  <span>
                    Auto-sized for <strong>{calc.totalDcCapacityKwp} kWp</strong> DC capacity on <strong>{config.utilityPhase} {config.utilityVoltage}V</strong> grid ({config.systemType === "hybrid" ? "Hybrid BESS" : config.systemType === "off-grid" ? "Off-Grid Islanding" : "Grid-Tie"}).
                  </span>
                </p>
              ) : (
                <p className="text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1">
                  <span>Custom inverter model locked.</span>
                  <button
                    type="button"
                    onClick={() => onChange({ selectedInverterId: "auto", autoInverterSelection: true })}
                    className="text-sky-600 dark:text-sky-400 underline font-semibold hover:text-sky-700 cursor-pointer"
                  >
                    Switch back to auto-selection
                  </button>
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col justify-end">
            <SolarOverrideField
              label="Inverter Quantity"
              fieldKey="inverterQuantity"
              effectiveValue={calc.effective.inverterQuantity}
              autoValue={calc.autoValues.inverterQuantity}
              isOverridden={calc.isOverridden.inverterQuantity}
              unit="units"
              min={1}
              max={50}
              step={1}
              warning={calc.fieldWarnings.inverterQuantity}
              hint="Calculated for optimal DC/AC ratio (~1.15 - 1.25)"
              onValueChange={(val) => {
                const num = Math.max(1, parseInt(val) || 1);
                if (onSetOverride) {
                  onSetOverride("inverterQuantity", num);
                } else {
                  onChange({
                    inverterQuantity: num,
                    overrides: { ...(config.overrides || {}), inverterQuantity: num },
                  });
                }
              }}
              onResetToAuto={() => {
                if (onResetOverride) {
                  onResetOverride("inverterQuantity");
                } else {
                  const nextOverrides = { ...(config.overrides || {}) };
                  delete nextOverrides.inverterQuantity;
                  onChange({ overrides: nextOverrides });
                }
              }}
            />
          </div>
        </div>

        {/* Selected Inverter Specs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2.5 pt-2">
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-700/60 text-center">
            <span className="text-[10px] text-slate-400 font-bold block">Rated AC Power</span>
            <span className="text-xs font-black text-slate-800 dark:text-slate-100 mt-0.5 block">
              {calc.selectedInverter.ratedAcPowerKw} kW
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-700/60 text-center">
            <span className="text-[10px] text-slate-400 font-bold block">Total Inverter AC</span>
            <span className="text-xs font-black text-sky-600 dark:text-sky-400 mt-0.5 block">
              {calc.totalInverterAcKw} kW AC
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-700/60 text-center">
            <span className="text-[10px] text-slate-400 font-bold block">Max DC Voltage</span>
            <span className="text-xs font-black text-slate-800 dark:text-slate-100 mt-0.5 block">
              {calc.selectedInverter.maxDcVoltage} V DC
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-700/60 text-center">
            <span className="text-[10px] text-slate-400 font-bold block">MPPT Range</span>
            <span className="text-xs font-black text-slate-800 dark:text-slate-100 mt-0.5 block">
              {calc.selectedInverter.mpptVoltageRangeMin}–{calc.selectedInverter.mpptVoltageRangeMax}V
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-700/60 text-center">
            <span className="text-[10px] text-slate-400 font-bold block">Max AC Current</span>
            <span className="text-xs font-black text-slate-800 dark:text-slate-100 mt-0.5 block">
              {calc.inverterMaxAcCurrent} A
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-700/60 text-center">
            <span className="text-[10px] text-slate-400 font-bold block">Efficiency</span>
            <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 mt-0.5 block">
              {calc.selectedInverter.efficiencyPercent}%
            </span>
          </div>
        </div>

        {/* DC/AC Ratio Status & Gauge */}
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/60 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center font-black text-sm">
              <Gauge className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  System DC/AC Overloading Ratio:
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-black ${
                    calc.dcAcRatio >= 1.1 && calc.dcAcRatio <= 1.35
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400"
                      : calc.dcAcRatio > 1.45
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400"
                      : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300"
                  }`}
                >
                  {calc.dcAcRatio} : 1
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Installed DC: {calc.totalDcCapacityKwp} kWp ÷ Inverter AC: {calc.totalInverterAcKw} kW
              </p>
            </div>
          </div>

          <div className="text-right">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Total Inverter Aggregated AC Current
            </span>
            <span className="text-base font-black text-sky-600 dark:text-sky-400 block">
              {calc.totalSystemAcCurrent} Amps AC @ {calc.selectedInverter.acVoltage}V
            </span>
          </div>
        </div>
      </div>

      {/* Custom Inverter Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-sky-500" />
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
                  Add Custom Inverter Model
                </h3>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCustomInverter} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Manufacturer / Brand *
                  </label>
                  <input
                    type="text"
                    required
                    value={customInv.manufacturer}
                    onChange={(e) =>
                      setCustomInv({ ...customInv, manufacturer: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Model Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={customInv.model}
                    onChange={(e) => setCustomInv({ ...customInv, model: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Rated AC Power (kW) *
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={customInv.ratedAcPowerKw}
                    onChange={(e) =>
                      setCustomInv({
                        ...customInv,
                        ratedAcPowerKw: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Max DC Input Power (kW)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={customInv.maxDcInputPowerKw}
                    onChange={(e) =>
                      setCustomInv({
                        ...customInv,
                        maxDcInputPowerKw: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Phase Configuration
                  </label>
                  <select
                    value={customInv.phase}
                    onChange={(e) =>
                      setCustomInv({ ...customInv, phase: e.target.value as "1PH" | "3PH" })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  >
                    <option value="1PH">1-Phase (Single-Phase 230V)</option>
                    <option value="3PH">3-Phase (Three-Phase)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Nominal AC Voltage (V)
                  </label>
                  <input
                    type="number"
                    value={customInv.acVoltage}
                    onChange={(e) =>
                      setCustomInv({ ...customInv, acVoltage: parseInt(e.target.value) || 230 })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Number of MPPTs
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={customInv.numMppts}
                    onChange={(e) =>
                      setCustomInv({ ...customInv, numMppts: parseInt(e.target.value) || 1 })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Max DC System Voltage (V)
                  </label>
                  <input
                    type="number"
                    value={customInv.maxDcVoltage}
                    onChange={(e) =>
                      setCustomInv({ ...customInv, maxDcVoltage: parseInt(e.target.value) || 1000 })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    MPPT Voltage Min (V)
                  </label>
                  <input
                    type="number"
                    value={customInv.mpptVoltageRangeMin}
                    onChange={(e) =>
                      setCustomInv({
                        ...customInv,
                        mpptVoltageRangeMin: parseInt(e.target.value) || 180,
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    MPPT Voltage Max (V)
                  </label>
                  <input
                    type="number"
                    value={customInv.mpptVoltageRangeMax}
                    onChange={(e) =>
                      setCustomInv({
                        ...customInv,
                        mpptVoltageRangeMax: parseInt(e.target.value) || 950,
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Max AC Output Current (A)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={customInv.maxAcCurrent}
                    onChange={(e) =>
                      setCustomInv({
                        ...customInv,
                        maxAcCurrent: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Efficiency (%)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={customInv.efficiencyPercent}
                    onChange={(e) =>
                      setCustomInv({
                        ...customInv,
                        efficiencyPercent: parseFloat(e.target.value) || 98.5,
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-500 rounded-xl shadow-xs transition cursor-pointer"
                >
                  Save Inverter Model
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Battery Energy Storage System (BESS) - For Hybrid & Off-Grid */}
      <div className="bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-2xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-700/60 pb-3">
          <div className="flex items-center gap-2">
            <Battery className="w-4 h-4 text-purple-600" />
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
              Battery Energy Storage System (BESS)
            </h3>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300">
              {filteredBatteries.length} of {allBatteries.length} Models
            </span>
          </div>
          <div className="flex items-center gap-2">
            {config.battery.enabled && (
              <button
                type="button"
                onClick={() => setIsAddBatteryModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-purple-50 dark:bg-purple-950/50 hover:bg-purple-100 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300 rounded-xl border border-purple-200 dark:border-purple-800/50 transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Custom Battery</span>
              </button>
            )}
            <label className="flex items-center gap-2 cursor-pointer bg-slate-50 dark:bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
              <input
                type="checkbox"
                checked={config.battery.enabled}
                onChange={(e) =>
                  onChange({
                    battery: { ...config.battery, enabled: e.target.checked },
                  })
                }
                className="rounded text-purple-600 focus:ring-purple-500"
              />
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Enable Battery Storage
              </span>
            </label>
          </div>
        </div>

        {config.battery.enabled ? (
          <div className="space-y-4">
            {/* Battery Presets & Filters */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Quick Battery Library Selection
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-400 font-medium hidden sm:inline">Direct Select:</span>
                  <select
                    value={config.battery.model}
                    onChange={(e) => {
                      const selected = allBatteries.find((b) => b.model === e.target.value);
                      if (selected) handleSelectBatteryPreset(selected);
                    }}
                    className="text-xs font-semibold px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-purple-500 focus:outline-none max-w-xs"
                  >
                    <option value="">-- Jump to Battery Model ({allBatteries.length}) --</option>
                    {batteryManufacturers.map((brand) => (
                      <optgroup key={brand} label={brand}>
                        {allBatteries
                          .filter((b) => (b.isCustom ? "Custom" : b.manufacturer) === brand)
                          .map((b) => (
                            <option key={b.model} value={b.model}>
                              {b.manufacturer} {b.model} ({b.energyKwh} kWh • {b.voltageV}V)
                            </option>
                          ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
              </div>

              {/* Brand & Type Filters + Search Bar */}
              <div className="space-y-2.5 pt-1">
                {/* Brand Filter Row */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="text-slate-400 font-semibold mr-1 flex items-center gap-1">
                      <SlidersHorizontal className="w-3 h-3" /> Brand:
                    </span>
                    <button
                      type="button"
                      onClick={() => setBatteryFilterBrand("all")}
                      className={`px-2 py-1 rounded-lg font-semibold transition whitespace-nowrap cursor-pointer ${
                        batteryFilterBrand === "all"
                          ? "bg-purple-600 text-white shadow-xs"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                      }`}
                    >
                      All Brands ({allBatteries.length})
                    </button>
                    {batteryManufacturers.map((brand) => (
                      <button
                        key={brand}
                        type="button"
                        onClick={() => setBatteryFilterBrand(brand)}
                        className={`px-2 py-1 rounded-lg font-semibold transition whitespace-nowrap cursor-pointer ${
                          batteryFilterBrand === brand
                            ? "bg-purple-600 text-white shadow-xs"
                            : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                        }`}
                      >
                        {brand}
                      </button>
                    ))}
                  </div>

                  {/* Search Bar */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={batterySearchQuery}
                      onChange={(e) => setBatterySearchQuery(e.target.value)}
                      placeholder="Search kWh, V, model, brand..."
                      className="pl-8 pr-7 py-1 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:ring-2 focus:ring-purple-500 focus:outline-none w-52 sm:w-60"
                    />
                    {batterySearchQuery && (
                      <button
                        type="button"
                        onClick={() => setBatterySearchQuery("")}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Voltage Class & Application Pills */}
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="text-slate-400 font-semibold mr-1">Voltage Class:</span>
                  {[
                    { id: "all", label: "All Categories" },
                    { id: "low_voltage", label: "48V / 51.2V Low Voltage (Residential/Off-Grid)" },
                    { id: "high_voltage", label: "High Voltage (HV 150V–600V+ Hybrid)" },
                    { id: "commercial_bess", label: "C&I & Utility BESS (Containerized)" },
                  ].map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setBatteryFilterVoltageType(cat.id)}
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold transition cursor-pointer ${
                        batteryFilterVoltageType === cat.id
                          ? "bg-purple-100 dark:bg-purple-950/70 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-700 font-bold"
                          : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 border border-transparent"
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Cards Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 pt-1">
                {(showAllBatteries ||
                batteryFilterBrand !== "all" ||
                batteryFilterVoltageType !== "all" ||
                batterySearchQuery.trim()
                  ? filteredBatteries
                  : filteredBatteries.slice(0, 8)
                ).map((b, idx) => {
                  const isSelected = config.battery.model === b.model;
                  const isHighVoltage = b.voltageV > 100;
                  const isCommercial = b.voltageType === "commercial_bess" || b.energyKwh >= 40;
                  return (
                    <button
                      key={b.id || idx}
                      type="button"
                      onClick={() => handleSelectBatteryPreset(b)}
                      className={`p-3 rounded-xl border text-left transition relative cursor-pointer flex flex-col justify-between group ${
                        isSelected
                          ? "border-purple-500 bg-purple-50/70 dark:bg-purple-950/40 text-purple-900 dark:text-purple-200 ring-2 ring-purple-500/20 shadow-xs"
                          : "border-slate-200 dark:border-slate-700 bg-slate-50/40 dark:bg-slate-900/40 text-slate-700 dark:text-slate-300 hover:border-purple-300 dark:hover:border-purple-700 hover:bg-white dark:hover:bg-slate-800/80"
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <span className="text-xs font-bold text-slate-900 dark:text-slate-100">{b.manufacturer}</span>
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                              isCommercial
                                ? "bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300"
                                : isHighVoltage
                                ? "bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300"
                                : "bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300"
                            }`}
                          >
                            {isCommercial ? "C&I BESS" : isHighVoltage ? "High Voltage" : `${b.voltageV}V LV`}
                          </span>
                        </div>
                        <div className="text-[11px] font-medium text-slate-600 dark:text-slate-300 line-clamp-2 leading-snug" title={b.model}>
                          {b.model}
                        </div>
                      </div>

                      <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-end justify-between">
                        <div>
                          <div className="text-xs font-black text-purple-600 dark:text-purple-400">
                            {b.energyKwh} kWh • {b.voltageV}V
                          </div>
                          <div className="text-[10px] text-slate-400 font-medium">
                            {b.capacityAh} Ah capacity
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] font-bold text-slate-600 dark:text-slate-300">
                            {b.dodPercent}% DoD
                          </div>
                          <div className="text-[9px] text-slate-400 font-medium">
                            {b.chemistry || "LiFePO4"}
                          </div>
                        </div>
                      </div>

                      {isSelected && (
                        <div className="absolute top-2.5 right-2.5 w-4 h-4 rounded-full bg-purple-600 text-white flex items-center justify-center shadow-xs">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Show more toggle if filteredBatteries > 8 and not actively searching/filtering */}
              {!showAllBatteries &&
                batteryFilterBrand === "all" &&
                batteryFilterVoltageType === "all" &&
                !batterySearchQuery.trim() &&
                filteredBatteries.length > 8 && (
                  <div className="text-center pt-1">
                    <button
                      type="button"
                      onClick={() => setShowAllBatteries(true)}
                      className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/40 hover:bg-purple-100 dark:hover:bg-purple-900/60 rounded-xl border border-purple-200 dark:border-purple-800/50 transition cursor-pointer"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                      <span>Show All {filteredBatteries.length} Battery Models ({filteredBatteries.length - 8} more)</span>
                    </button>
                  </div>
                )}

              {showAllBatteries &&
                batteryFilterBrand === "all" &&
                batteryFilterVoltageType === "all" &&
                !batterySearchQuery.trim() && (
                  <div className="text-center pt-1">
                    <button
                      type="button"
                      onClick={() => setShowAllBatteries(false)}
                      className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition cursor-pointer"
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                      <span>Show Less (Top 8 Models)</span>
                    </button>
                  </div>
                )}

              {/* Active Selected Battery Specification Details Card */}
              <div className="p-3.5 rounded-xl bg-purple-50/40 dark:bg-purple-950/20 border border-purple-100 dark:border-purple-900/40 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center text-purple-700 dark:text-purple-300">
                    <BatteryCharging className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400 font-semibold">Active Selected Battery:</div>
                    <div className="font-bold text-slate-800 dark:text-slate-100">
                      {config.battery.manufacturer} — {config.battery.model}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-600 dark:text-slate-300 font-medium">
                  <div>
                    <span className="text-slate-400">Rating: </span>
                    <strong className="text-purple-600 dark:text-purple-400">{config.battery.energyKwh} kWh</strong> ({config.battery.voltageV}V / {config.battery.capacityAh}Ah)
                  </div>
                  <div>
                    <span className="text-slate-400">Usable DoD: </span>
                    <strong>{config.battery.dodPercent}%</strong> (~{(config.battery.energyKwh * (config.battery.dodPercent / 100)).toFixed(2)} kWh)
                  </div>
                  <div>
                    <span className="text-slate-400">Chemistry: </span>
                    <strong>{config.battery.chemistry || "LiFePO4"}</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Sizing Parameters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Required Backup Load (kW)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  value={config.battery.requiredBackupLoadKw}
                  onChange={(e) =>
                    onChange({
                      battery: {
                        ...config.battery,
                        requiredBackupLoadKw: Math.max(0.5, parseFloat(e.target.value) || 1),
                      },
                    })
                  }
                  className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Target Backup Hours (hrs)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="1"
                  max="48"
                  value={config.battery.backupHours}
                  onChange={(e) =>
                    onChange({
                      battery: {
                        ...config.battery,
                        backupHours: Math.max(1, parseFloat(e.target.value) || 4),
                      },
                    })
                  }
                  className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Depth of Discharge (DoD %)
                </label>
                <input
                  type="number"
                  min="50"
                  max="100"
                  value={config.battery.dodPercent}
                  onChange={(e) =>
                    onChange({
                      battery: {
                        ...config.battery,
                        dodPercent: Math.min(100, Math.max(50, parseInt(e.target.value) || 90)),
                      },
                    })
                  }
                  className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                />
              </div>

              <div>
                <SolarOverrideField
                  label={calc.batteryUnitsInSeries > 1 ? `Battery Units (${calc.batteryUnitsInSeries}S x ${calc.batteryUnitsInParallel}P)` : "Battery Units (Parallel)"}
                  fieldKey="batteryUnits"
                  effectiveValue={calc.effective.batteryUnits}
                  autoValue={calc.autoValues.batteryUnits}
                  isOverridden={calc.isOverridden.batteryUnits}
                  unit="units"
                  min={1}
                  max={40}
                  step={1}
                  warning={calc.fieldWarnings.batteryUnits}
                  hint={`Auto: ${calc.batteryUnitsForEnergy} for ${calc.batteryEnergyKwhRequired} kWh backup; at least ${calc.batteryParallelForCurrent} in parallel for the ${calc.batteryMaxDcCurrentA} A inverter battery current`}
                  onValueChange={(val) => {
                    const num = Math.max(1, parseInt(val) || 1);
                    if (onSetOverride) {
                      onSetOverride("batteryUnits", num);
                    } else {
                      onChange({
                        battery: { ...config.battery, units: num },
                        overrides: { ...(config.overrides || {}), batteryUnits: num },
                      });
                    }
                  }}
                  onResetToAuto={() => {
                    if (onResetOverride) {
                      onResetOverride("batteryUnits");
                    } else {
                      const nextOverrides = { ...(config.overrides || {}) };
                      delete nextOverrides.batteryUnits;
                      onChange({
                        battery: { ...config.battery, units: undefined },
                        overrides: nextOverrides,
                      });
                    }
                  }}
                />
              </div>
            </div>

            {/* Battery Sizing Results */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2">
              <div className="p-3 rounded-xl bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200/80 dark:border-purple-800/50">
                <span className="text-[10px] font-bold text-purple-700 dark:text-purple-300 uppercase tracking-wider block">
                  Required Usable Energy
                </span>
                <span className="text-sm font-black text-purple-900 dark:text-purple-100 mt-1 block">
                  {calc.batteryEnergyKwhRequired} kWh
                </span>
              </div>

              <div className="p-3 rounded-xl bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200/80 dark:border-purple-800/50">
                <span className="text-[10px] font-bold text-purple-700 dark:text-purple-300 uppercase tracking-wider block">
                  Installed Usable Energy
                </span>
                <span className="text-sm font-black text-purple-600 dark:text-purple-400 mt-1 block">
                  {calc.batteryUsableEnergyKwh} kWh
                </span>
              </div>

              <div className="p-3 rounded-xl bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200/80 dark:border-purple-800/50">
                <span className="text-[10px] font-bold text-purple-700 dark:text-purple-300 uppercase tracking-wider block">
                  Calculated Autonomy
                </span>
                <span className="text-sm font-black text-emerald-600 dark:text-emerald-400 mt-1 block">
                  ~{calc.batteryBackupHoursActual} Hours
                </span>
              </div>

              <div className="p-3 rounded-xl bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200/80 dark:border-purple-800/50">
                <span className="text-[10px] font-bold text-purple-700 dark:text-purple-300 uppercase tracking-wider block">
                  Bank Voltage
                </span>
                <span className="text-sm font-black text-slate-800 dark:text-slate-100 mt-1 block">
                  {calc.batteryBankVoltage} V DC
                </span>
              </div>
            </div>

            {/* Bank arrangement and DC protection (all automatic from the design) */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              {[
                {
                  label: "Bank Arrangement",
                  value:
                    calc.batteryUnitsInSeries > 1
                      ? `${calc.batteryUnitsInSeries}S x ${calc.batteryUnitsInParallel}P`
                      : `${calc.batteryUnitsInParallel} in parallel`,
                  sub: `${calc.effective.batteryUnits} x ${config.battery.energyKwh} kWh = ${calc.batteryTotalEnergyKwh} kWh total`,
                },
                {
                  label: "Battery DC Current",
                  value: `${calc.batteryMaxDcCurrentA} A`,
                  sub: `At ${calc.totalInverterAcKw} kW inverter power, ${calc.batteryBankVoltage} V bank`,
                },
                {
                  label: "Battery DC Breaker",
                  value: `${calc.batteryBreakerAmps} A DC, 2P`,
                  sub: "125% of the battery DC current (PEC 6.90.8)",
                },
                {
                  label: "Battery Cable",
                  value: `${calc.batteryCableRuns > 1 ? `${calc.batteryCableRuns} x ` : ""}${calc.batteryCableSizeMm2} mm² Cu (+/-)`,
                  sub: `EGC ${calc.batteryEgcSizeMm2} mm², rated for the ${calc.batteryBreakerAmps} A breaker`,
                },
              ].map((c) => (
                <div key={c.label} className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-purple-200/80 dark:border-purple-800/50">
                  <span className="text-[10px] font-bold text-purple-700 dark:text-purple-300 uppercase tracking-wider block">{c.label}</span>
                  <span className="text-sm font-black text-slate-800 dark:text-slate-100 mt-1 block">{c.value}</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5">{c.sub}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="p-6 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-dashed border-slate-200 dark:border-slate-700 text-center space-y-2">
            <Battery className="w-8 h-8 text-slate-400 mx-auto" />
            <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Battery Storage is Currently Disabled (Standard On-Grid Mode)
            </div>
            <p className="text-[11px] text-slate-400 max-w-md mx-auto">
              Check "Enable Battery Storage" above to configure lithium iron phosphate (LiFePO4) storage banks for Hybrid or Off-Grid operation.
            </p>
          </div>
        )}
      </div>

      {/* Add Custom Battery Modal */}
      {isAddBatteryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Battery className="w-5 h-5 text-purple-600" />
                <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base">
                  Add Custom Battery Storage Model
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddBatteryModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddCustomBattery} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Manufacturer / Brand *
                  </label>
                  <input
                    type="text"
                    required
                    value={customBatt.manufacturer}
                    onChange={(e) =>
                      setCustomBatt({ ...customBatt, manufacturer: e.target.value })
                    }
                    placeholder="e.g. CATL, LG, Victron, Custom"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Model Designation *
                  </label>
                  <input
                    type="text"
                    required
                    value={customBatt.model}
                    onChange={(e) =>
                      setCustomBatt({ ...customBatt, model: e.target.value })
                    }
                    placeholder="e.g. PowerVault 14.3 kWh"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Total Energy Capacity (kWh) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.5"
                    required
                    value={customBatt.energyKwh}
                    onChange={(e) =>
                      setCustomBatt({
                        ...customBatt,
                        energyKwh: parseFloat(e.target.value) || 5,
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Nominal Voltage (V DC) *
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="12"
                    required
                    value={customBatt.voltageV}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value) || 51.2;
                      setCustomBatt({
                        ...customBatt,
                        voltageV: v,
                        voltageType: v > 100 ? "high_voltage" : "low_voltage",
                      });
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Rated Capacity (Ah)
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="10"
                    value={customBatt.capacityAh}
                    onChange={(e) =>
                      setCustomBatt({
                        ...customBatt,
                        capacityAh: parseFloat(e.target.value) || 100,
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Usable Depth of Discharge (DoD %)
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="50"
                    max="100"
                    value={customBatt.dodPercent}
                    onChange={(e) =>
                      setCustomBatt({
                        ...customBatt,
                        dodPercent: parseInt(e.target.value) || 90,
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Battery Chemistry
                  </label>
                  <select
                    value={customBatt.chemistry || "LiFePO4"}
                    onChange={(e) =>
                      setCustomBatt({
                        ...customBatt,
                        chemistry: e.target.value as any,
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  >
                    <option value="LiFePO4">Lithium Iron Phosphate (LiFePO4)</option>
                    <option value="NMC">Lithium Nickel Manganese Cobalt (NMC)</option>
                    <option value="Lead-Acid Carbon">Lead-Acid / Carbon Gel</option>
                    <option value="Sodium-ion">Sodium-ion (Na-ion)</option>
                    <option value="LTO">Lithium Titanate (LTO)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Voltage Class & Application
                  </label>
                  <select
                    value={customBatt.voltageType || "low_voltage"}
                    onChange={(e) =>
                      setCustomBatt({
                        ...customBatt,
                        voltageType: e.target.value as any,
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  >
                    <option value="low_voltage">Low Voltage 48V / 51.2V (Residential & Off-Grid)</option>
                    <option value="high_voltage">High Voltage (HV 150V - 600V+ Hybrid)</option>
                    <option value="commercial_bess">C&I & Utility BESS (Containerized)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Form Factor / Mounting
                  </label>
                  <select
                    value={customBatt.formFactor || "wall_mount"}
                    onChange={(e) =>
                      setCustomBatt({
                        ...customBatt,
                        formFactor: e.target.value as any,
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  >
                    <option value="rack_mount">19" Server Rack Mount</option>
                    <option value="wall_mount">Wall Mount Cabinet</option>
                    <option value="stackable">Stackable Modular Block</option>
                    <option value="containerized">Containerized Outdoor Cabinet</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Round-Trip Efficiency (%)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="70"
                    max="99"
                    value={customBatt.efficiencyPercent}
                    onChange={(e) =>
                      setCustomBatt({
                        ...customBatt,
                        efficiencyPercent: parseFloat(e.target.value) || 95,
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddBatteryModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-500 rounded-xl shadow-xs transition cursor-pointer"
                >
                  Save & Select Battery Model
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
