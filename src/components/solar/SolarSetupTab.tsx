import React from "react";
import { SolarDesignConfig, SolarCalculationResults } from "../../types/solar";
import { RESIDENTIAL_PRESETS } from "../../utils/solarEngine";
import { PanelConfig, Circuit, VoltageDropCalculation } from "../../types";
import { computePanelScheduleValues } from "../../utils/computeEngine";
import {
  Sun,
  Building,
  Factory,
  Home,
  Zap,
  MapPin,
  User,
  Layers,
  Sparkles,
  Compass,
  Maximize2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
} from "lucide-react";

interface SolarSetupTabProps {
  config: SolarDesignConfig;
  calc: SolarCalculationResults;
  panels: PanelConfig[];
  circuits?: Circuit[];
  subPanels?: any[];
  vdCalculations?: VoltageDropCalculation[];
  computedMainCb?: number;
  linkedPanel?: PanelConfig;
  onChange: (updated: Partial<SolarDesignConfig>) => void;
  onApplyPreset: (presetKey: string) => void;
}

export const SolarSetupTab: React.FC<SolarSetupTabProps> = ({
  config,
  calc,
  panels,
  circuits,
  subPanels,
  vdCalculations,
  computedMainCb = 100,
  linkedPanel,
  onChange,
  onApplyPreset,
}) => {
  return (
    <div className="space-y-6">
      {/* 1. Quick Presets Banner for Residential */}
      <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-200 dark:border-amber-900/40 rounded-2xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center font-bold">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Residential Standard Sizing Presets
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Instantly load optimized, pre-engineered PEC-compliant configurations
              </p>
            </div>
          </div>
          <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-100/60 dark:bg-amber-950/60 px-2.5 py-1 rounded-full">
            1-Click Auto Configure
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
          {Object.entries(RESIDENTIAL_PRESETS).map(([key, p]) => (
            <button
              key={key}
              onClick={() => onApplyPreset(key)}
              className="flex flex-col items-start p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-amber-500 dark:hover:border-amber-500 hover:shadow-md transition text-left group"
            >
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-amber-600 dark:group-hover:text-amber-400">
                {p.name.split(" ")[0]} {p.name.split(" ")[1]}
              </span>
              <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                {p.targetKwp} kWp DC
              </span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                {p.phase} {p.voltage}V • {p.strings} Str
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* 2. Project Metadata Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Basic Project Info Card */}
        <div className="bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-700/60 pb-3">
            <Compass className="w-4 h-4 text-sky-600" />
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
              Project Identification
            </h3>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Project Name
              </label>
              <input
                type="text"
                value={config.projectName}
                onChange={(e) => onChange({ projectName: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                placeholder="e.g., Commercial Rooftop Solar PV"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Project Location
              </label>
              <input
                type="text"
                value={config.projectLocation}
                onChange={(e) => onChange({ projectLocation: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                placeholder="e.g., Pasig City, Metro Manila"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Client / Owner
                </label>
                <input
                  type="text"
                  value={config.clientName}
                  onChange={(e) => onChange({ clientName: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  placeholder="e.g., ABC Corporation"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Lead Electrical Engineer / PEE
                </label>
                <input
                  type="text"
                  value={config.designerName}
                  onChange={(e) => onChange({ designerName: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  placeholder="e.g., Engr. Juan Dela Cruz, PEE"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Project Classification & Architecture */}
        <div className="bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-700/60 pb-3">
            <Zap className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
              System Classification & Type
            </h3>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Project Type
                </label>
                <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 dark:bg-slate-900/60 rounded-xl">
                  <button
                    type="button"
                    title="Residential"
                    onClick={() => onChange({ projectType: "residential" })}
                    className={`flex items-center justify-center gap-1 px-1 py-1.5 text-xs font-bold rounded-lg transition ${
                      config.projectType === "residential"
                        ? "bg-white dark:bg-slate-800 text-sky-600 dark:text-sky-400 shadow-2xs"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                    }`}
                  >
                    <Home className="w-3.5 h-3.5" />
                    <span>Res</span>
                  </button>
                  <button
                    type="button"
                    title="Commercial"
                    onClick={() => onChange({ projectType: "commercial" })}
                    className={`flex items-center justify-center gap-1 px-1 py-1.5 text-xs font-bold rounded-lg transition ${
                      config.projectType === "commercial"
                        ? "bg-white dark:bg-slate-800 text-sky-600 dark:text-sky-400 shadow-2xs"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                    }`}
                  >
                    <Building className="w-3.5 h-3.5" />
                    <span>Comm</span>
                  </button>
                  <button
                    type="button"
                    title="Industrial"
                    onClick={() => onChange({ projectType: "industrial" })}
                    className={`flex items-center justify-center gap-1 px-1 py-1.5 text-xs font-bold rounded-lg transition ${
                      config.projectType === "industrial"
                        ? "bg-white dark:bg-slate-800 text-sky-600 dark:text-sky-400 shadow-2xs"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                    }`}
                  >
                    <Factory className="w-3.5 h-3.5" />
                    <span>Ind</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Grid Interconnection
                </label>
                <select
                  value={config.systemType}
                  onChange={(e) =>
                    onChange({
                      systemType: e.target.value as any,
                      battery: {
                        ...config.battery,
                        enabled: e.target.value !== "on-grid",
                      },
                    })
                  }
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 text-slate-900 dark:text-slate-100 font-semibold focus:ring-2 focus:ring-sky-500 focus:outline-none"
                >
                  <option value="on-grid">On-Grid (Grid-Tied)</option>
                  <option value="hybrid">Hybrid (Grid + Battery ESS)</option>
                  <option value="off-grid">Off-Grid (Standalone)</option>
                </select>
              </div>
            </div>

            {/* Sizing Method Selector */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Sizing Strategy / Method
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onChange({ sizingMethod: "target_capacity" })}
                  className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                    config.sizingMethod === "target_capacity"
                      ? "border-sky-500 bg-sky-50/50 dark:bg-sky-950/30 text-sky-900 dark:text-sky-200 ring-1 ring-sky-500/20"
                      : "border-slate-200 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-900/30 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600"
                  }`}
                >
                  <div className="text-xs font-bold">Target kWp Capacity</div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                    User specifies exact target peak DC wattage
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => onChange({ sizingMethod: "load_demand" })}
                  className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                    config.sizingMethod !== "target_capacity"
                      ? "border-sky-500 bg-sky-50/50 dark:bg-sky-950/30 text-sky-900 dark:text-sky-200 ring-1 ring-sky-500/20"
                      : "border-slate-200 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-900/30 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600"
                  }`}
                >
                  <div className="text-xs font-bold">Load Schedule Demand</div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Autosize to 85% of active panel max demand
                  </div>
                </button>
              </div>
            </div>

            {/* Target Capacity Input if method is target_capacity */}
            {config.sizingMethod === "target_capacity" ? (
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Target Solar Capacity (kWp DC)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.5"
                    min="1"
                    max="5000"
                    value={config.targetCapacityKwp}
                    onChange={(e) =>
                      onChange({ targetCapacityKwp: Math.max(1, parseFloat(e.target.value) || 1) })
                    }
                    className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                  <span className="text-xs font-bold text-slate-500">kWp</span>
                </div>
              </div>
            ) : (
              <div className="bg-sky-50/60 dark:bg-sky-950/20 border border-sky-200/70 dark:border-sky-800/50 rounded-xl p-3 flex items-center justify-between text-xs">
                <span className="text-slate-600 dark:text-slate-300">
                  Autosized Target from <span className="font-bold text-slate-800 dark:text-slate-100">{linkedPanel?.designation || "Active Panel"}</span> Demand:
                </span>
                <span className="font-extrabold text-sky-700 dark:text-sky-300 bg-sky-100/80 dark:bg-sky-900/40 px-2 py-0.5 rounded-lg">
                  {calc.totalDcCapacityKwp} kWp DC
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. Roof & Physical Site Conditions */}
      <div className="bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700/60 pb-3">
          <div className="flex items-center gap-2">
            <Maximize2 className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
              Roof Structure & Site Conditions
            </h3>
          </div>
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Estimated Area Required: <span className="font-bold text-emerald-600 dark:text-emerald-400">{calc.areaRequiredM2} m²</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Available Roof Area (m²)
            </label>
            <input
              type="number"
              min="10"
              value={config.availableRoofAreaM2}
              onChange={(e) =>
                onChange({ availableRoofAreaM2: Math.max(10, parseFloat(e.target.value) || 10) })
              }
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-sky-500 focus:outline-none"
            />
            {config.availableRoofAreaM2 < calc.areaRequiredM2 && (
              <span className="text-[10px] text-rose-500 font-bold mt-1 block">
                Exceeds available roof ({config.availableRoofAreaM2} m²)
              </span>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Roof Covering Material
            </label>
            <select
              value={config.roofType}
              onChange={(e) => onChange({ roofType: e.target.value as any })}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-sky-500 focus:outline-none"
            >
              <option value="gi_sheet">Corrugated GI / Metal Sheet</option>
              <option value="concrete_slab">Concrete Flat Slab Roof</option>
              <option value="tile">Concrete / Clay Roof Tiles</option>
              <option value="ground_mount">Ground Mount / Carport</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Mounting Structure Type
            </label>
            <select
              value={config.mountingType}
              onChange={(e) => onChange({ mountingType: e.target.value as any })}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-sky-500 focus:outline-none"
            >
              <option value="flush_mount">Flush Mount (Coplanar with slope)</option>
              <option value="tilted_rack">Tilted Triangular Rack (10° - 15°)</option>
              <option value="ballasted">Ballasted Non-Penetrative</option>
              <option value="ground_fixed">Fixed Tilt Ground-Mount</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Average Peak Sun Hours (PSH)
            </label>
            <input
              type="number"
              step="0.1"
              min="3"
              max="6"
              value={config.peakSunHours}
              onChange={(e) =>
                onChange({ peakSunHours: Math.max(2, parseFloat(e.target.value) || 4.5) })
              }
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-sky-500 focus:outline-none"
            />
            <span className="text-[10px] text-slate-400 mt-1 block">
              Philippine average: 4.2 - 4.8 PSH/day
            </span>
          </div>
        </div>
      </div>

      {/* 4. Electrical Load & Utility Connection */}
      <div className="bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700/60 pb-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
              Utility Interconnection & Load Schedule Synchronization
            </h3>
          </div>
          <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-2.5 py-1 rounded-full">
            Live Synchronized with ElectricalPH Panel
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Link with Panel Schedule
              </label>
              {config.selectedMdpId && (
                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                  Synced
                </span>
              )}
            </div>
            <select
              value={config.selectedMdpId}
              onChange={(e) => {
                const pid = e.target.value;
                const matched = panels.find((p, idx) => (p.id || p.designation || `panel-${idx}`) === pid);
                if (matched) {
                  const is3Ph = matched.system?.includes("3PH") || (matched as any).phase === 3;
                  const v = matched.voltage || (is3Ph ? 400 : 230);
                  const targetC =
                    matched.id === panels[0]?.id || matched.designation === panels[0]?.designation
                      ? circuits || []
                      : subPanels?.find((sp) => sp.id === matched.id || sp.panel?.id === matched.id)?.circuits || [];
                  const pValues = computePanelScheduleValues(matched, targetC, {
                    availableSubPanels: subPanels,
                    vdCalculations,
                  });
                  const mainAmp =
                    pValues.mainFeeder?.cb ||
                    matched.mainBreakerAT ||
                    matched.mainOverrides?.breakerAT ||
                    (is3Ph ? 100 : 60);

                  onChange({
                    selectedMdpId: pid,
                    utilityVoltage: v,
                    utilityPhase: is3Ph ? "3PH" : "1PH",
                    utilityFrequency: matched.frequency || 60,
                    serviceCapacityAmps: mainAmp,
                  });
                } else {
                  onChange({ selectedMdpId: pid });
                }
              }}
              className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-sky-500 focus:outline-none"
            >
              <option value="">-- Main Distribution Panel (Default) --</option>
              {panels.map((p, idx) => {
                const pid = p.id || p.designation || `panel-${idx}`;
                const pname = p.name || p.designation || `Panel #${idx + 1}`;
                return (
                  <option key={pid} value={pid}>
                    {pname} ({p.system} {p.voltage}V)
                  </option>
                );
              })}
            </select>
            {config.selectedMdpId && (
              <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1 font-medium">
                Voltage, Phase & Capacity auto-synchronized from panel
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Utility Voltage (Volts)
            </label>
            <select
              value={config.utilityVoltage}
              onChange={(e) => onChange({ utilityVoltage: parseInt(e.target.value) || 230 })}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-sky-500 focus:outline-none"
            >
              <option value={230}>230 V (Standard Residential/Commercial)</option>
              <option value={400}>400 V (Commercial 3-Phase Wye)</option>
              <option value={460}>460 V (Industrial 3-Phase)</option>
              <option value={480}>480 V (Industrial 3-Phase)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Phase Configuration
            </label>
            <select
              value={config.utilityPhase}
              onChange={(e) => onChange({ utilityPhase: e.target.value as any })}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-sky-500 focus:outline-none"
            >
              <option value="1PH">Single Phase (1PH 2-Wire + Ground)</option>
              <option value="3PH">Three Phase (3PH 3-Wire / 4-Wire + Ground)</option>
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Main Service Breaker (Amps)
              </label>
              {config.serviceCapacityAmps === computedMainCb ? (
                <span
                  className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1"
                  title="Synchronized with Load Schedule"
                >
                  <CheckCircle2 className="w-3 h-3" /> Synced ({computedMainCb}A)
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onChange({ serviceCapacityAmps: computedMainCb })}
                  className="text-[10px] font-bold text-sky-600 dark:text-sky-400 hover:text-sky-500 flex items-center gap-1 transition"
                  title={`Reset and sync with ${linkedPanel?.designation || "MDP"} (${computedMainCb}A)`}
                >
                  <RefreshCw className="w-3 h-3" /> Sync ({computedMainCb}A)
                </button>
              )}
            </div>
            <div className="relative">
              <input
                type="number"
                min="20"
                value={config.serviceCapacityAmps}
                onChange={(e) =>
                  onChange({ serviceCapacityAmps: Math.max(20, parseInt(e.target.value) || 100) })
                }
                className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-sky-500 focus:outline-none"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400 pointer-events-none">
                AT
              </span>
            </div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 font-medium">
              Load Schedule: <strong className="text-slate-700 dark:text-slate-200">{computedMainCb}A</strong> ({linkedPanel?.designation || "Main Panel"})
            </p>
          </div>
        </div>

        {/* Real-time Load Demand Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2">
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/60">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Connected Facility Load
            </span>
            <span className="text-sm font-black text-slate-800 dark:text-slate-100 mt-1 block">
              {calc.connectedLoadKw} kW
            </span>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/60">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Maximum Demand Load
            </span>
            <span className="text-sm font-black text-sky-600 dark:text-sky-400 mt-1 block">
              {calc.maxDemandKw} kW
            </span>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/60">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Estimated Peak Solar Output
            </span>
            <span className="text-sm font-black text-emerald-600 dark:text-emerald-400 mt-1 block">
              {calc.estimatedSolarPeakGenerationKw} kW
            </span>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/60">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Net Daytime Grid Demand
            </span>
            <span className="text-sm font-black text-amber-600 dark:text-amber-400 mt-1 block">
              {calc.netRemainingGridDemandKw} kW
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
