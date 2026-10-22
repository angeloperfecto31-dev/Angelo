import React, { useState, useMemo } from "react";
import { SolarDesignConfig, SolarDesignOverrides } from "../../types/solar";
import { PanelConfig, Circuit } from "../../types";
import {
  computeSolarDesign,
  DEFAULT_SOLAR_CONFIG,
  RESIDENTIAL_PRESETS,
  generateSolarBOM,
} from "../../utils/solarEngine";
import { computePanelScheduleValues } from "../../utils/computeEngine";
import { exportSolarToDxf } from "../../utils/exportSolarDxf";
import { exportSolarToExcel } from "../../utils/exportSolarExcel";
import { exportSolarToWord } from "../../utils/exportSolarWord";
import { exportSolarToPdf } from "../../utils/exportSolarPdf";
import { SolarSetupTab } from "./SolarSetupTab";
import { SolarPVTab } from "./SolarPVTab";
import { SolarInverterTab } from "./SolarInverterTab";
import { SolarProtectionTab } from "./SolarProtectionTab";
import { SolarSLD } from "./SolarSLD";
import { SolarBOMTab } from "./SolarBOMTab";
import { SolarQuotationModal } from "./SolarQuotationModal";
import {
  Sun,
  Zap,
  Battery,
  ShieldCheck,
  FileSpreadsheet,
  FileText,
  Download,
  CheckCircle2,
  AlertTriangle,
  Printer,
  Sparkles,
  Sliders,
  Layers,
  ChevronRight,
  ShieldAlert,
  RotateCcw,
  Receipt,
} from "lucide-react";

interface SolarDesignModuleProps {
  solarConfig?: SolarDesignConfig;
  onUpdateSolarConfig: (newConfig: SolarDesignConfig) => void;
  panels: PanelConfig[];
  circuits: Circuit[];
  subPanels?: any[];
  vdCalculations?: any[];
  projectName?: string;
  projectLocation?: string;
  clientName?: string;
  designerName?: string;
}

export const SolarDesignModule: React.FC<SolarDesignModuleProps> = ({
  solarConfig,
  onUpdateSolarConfig,
  panels,
  circuits,
  subPanels,
  vdCalculations,
  projectName,
  projectLocation,
  clientName,
  designerName,
}) => {
  // Identify linked panel (either selected by ID or defaulting to primary MDP)
  const linkedPanel = useMemo(() => {
    if (solarConfig?.selectedMdpId) {
      return (
        panels.find(
          (p) =>
            p.id === solarConfig.selectedMdpId ||
            p.designation === solarConfig.selectedMdpId
        ) || panels[0]
      );
    }
    return panels[0];
  }, [panels, solarConfig?.selectedMdpId]);

  // Retrieve active circuits for linked panel
  const linkedPanelCircuits = useMemo(() => {
    if (!linkedPanel) return circuits || [];
    if (
      linkedPanel.id === panels[0]?.id ||
      linkedPanel.designation === panels[0]?.designation
    ) {
      return circuits || [];
    }
    const foundSp = subPanels?.find(
      (sp) => sp.id === linkedPanel.id || sp.panel?.id === linkedPanel.id
    );
    return foundSp ? foundSp.circuits : circuits || [];
  }, [linkedPanel, panels, circuits, subPanels]);

  // Compute load schedule values and main breaker for the linked panel
  const linkedPanelComputed = useMemo(() => {
    if (!linkedPanel) return null;
    return computePanelScheduleValues(linkedPanel, linkedPanelCircuits, {
      availableSubPanels: subPanels,
      vdCalculations,
    });
  }, [linkedPanel, linkedPanelCircuits, subPanels, vdCalculations]);

  // Accurate PEC-calculated main service breaker rating from load schedule
  const computedMainCb = useMemo(() => {
    if (!linkedPanel) return 100;
    const is3Ph = linkedPanel.system?.includes("3PH") || false;
    return (
      linkedPanelComputed?.mainFeeder?.cb ||
      linkedPanel.mainBreakerAT ||
      linkedPanel.mainOverrides?.breakerAT ||
      (is3Ph ? 100 : 60)
    );
  }, [linkedPanel, linkedPanelComputed]);

  // Merge or fallback to default configuration with clean project sync
  const currentConfig: SolarDesignConfig = useMemo(() => {
    const raw = solarConfig || DEFAULT_SOLAR_CONFIG;
    const isDefaultProjectName =
      !raw.projectName ||
      raw.projectName === DEFAULT_SOLAR_CONFIG.projectName ||
      raw.projectName === "Solar PV Installation" ||
      raw.projectName === "Solar PV Project";
    const isDefaultLocation =
      !raw.projectLocation ||
      raw.projectLocation === DEFAULT_SOLAR_CONFIG.projectLocation ||
      raw.projectLocation === "Philippines" ||
      raw.projectLocation === "Metro Manila, Philippines";
    const isDefaultClient =
      !raw.clientName ||
      raw.clientName === DEFAULT_SOLAR_CONFIG.clientName ||
      raw.clientName === "Valued Client" ||
      raw.clientName === "Client";
    const isDefaultEngineer =
      !raw.designerName ||
      raw.designerName === DEFAULT_SOLAR_CONFIG.designerName ||
      raw.designerName === "Electrical Engineer" ||
      raw.designerName === "Professional Electrical Engineer";

    const is3Ph = linkedPanel?.system?.includes("3PH") || false;
    const fallbackVoltage = linkedPanel?.voltage || (is3Ph ? 400 : 230);
    const fallbackPhase = is3Ph ? "3PH" : "1PH";

    // Auto-synchronize main service breaker from MDP if not manually modified or if legacy 800
    const rawCapacity = raw.serviceCapacityAmps;
    const synchronizedCapacity =
      rawCapacity && rawCapacity !== 800 ? rawCapacity : computedMainCb;

    return {
      ...DEFAULT_SOLAR_CONFIG,
      utilityVoltage: raw.utilityVoltage || fallbackVoltage,
      utilityPhase: raw.utilityPhase || fallbackPhase,
      utilityFrequency: linkedPanel?.frequency || 60,
      selectedMdpId:
        raw.selectedMdpId ||
        linkedPanel?.id ||
        linkedPanel?.designation ||
        "",
      sizingMethod: raw.sizingMethod || "load_demand",
      ...(solarConfig || {}),
      serviceCapacityAmps: synchronizedCapacity,
      projectName:
        isDefaultProjectName && projectName
          ? projectName
          : raw.projectName || projectName || DEFAULT_SOLAR_CONFIG.projectName,
      projectLocation:
        isDefaultLocation && projectLocation
          ? projectLocation
          : raw.projectLocation ||
            projectLocation ||
            DEFAULT_SOLAR_CONFIG.projectLocation,
      clientName:
        isDefaultClient && clientName
          ? clientName
          : raw.clientName || clientName || DEFAULT_SOLAR_CONFIG.clientName,
      designerName:
        isDefaultEngineer && designerName
          ? designerName
          : raw.designerName ||
            designerName ||
            DEFAULT_SOLAR_CONFIG.designerName,
    };
  }, [
    solarConfig,
    projectName,
    projectLocation,
    clientName,
    designerName,
    linkedPanel,
    computedMainCb,
  ]);

  const [activeSubTab, setActiveSubTab] = useState<
    "setup" | "pv" | "inverter" | "protection" | "sld" | "bom"
  >("setup");
  const [isQuotationModalOpen, setIsQuotationModalOpen] = useState(false);

  // Execute full calculation engine
  const calc = useMemo(() => {
    return computeSolarDesign(currentConfig, linkedPanel, circuits, subPanels);
  }, [currentConfig, linkedPanel, circuits, subPanels]);

  const handleUpdate = (updated: Partial<SolarDesignConfig>) => {
    const nextConfig = { ...currentConfig, ...updated };
    onUpdateSolarConfig(nextConfig);
  };

  const handleSetOverride = (field: keyof SolarDesignOverrides, value: any) => {
    const nextOverrides = { ...(currentConfig.overrides || {}), [field]: value };
    handleUpdate({ overrides: nextOverrides });
  };

  const handleResetOverride = (field: keyof SolarDesignOverrides) => {
    const nextOverrides = { ...(currentConfig.overrides || {}) };
    delete nextOverrides[field];
    handleUpdate({ overrides: nextOverrides });
  };

  const handleResetAllOverrides = () => {
    handleUpdate({
      overrides: {},
      manualModuleOverride: false,
      selectedModuleId: "auto",
      autoModuleSelection: true,
      selectedInverterId: "auto",
      autoInverterSelection: true,
    });
  };

  const handleApplyPreset = (presetKey: string) => {
    const p = RESIDENTIAL_PRESETS[presetKey];
    if (!p) return;
    const updated: Partial<SolarDesignConfig> = {
      projectType: "residential",
      systemType: p.systemType,
      targetCapacityKwp: p.targetKwp,
      selectedModuleId: p.moduleId,
      selectedInverterId: p.inverterId,
      modulesPerString: p.modulesPerString,
      numberOfStrings: p.strings,
      inverterQuantity: p.inverterQty,
      utilityVoltage: p.voltage,
      utilityPhase: p.phase,
    };
    handleUpdate(updated);
  };

  // Export actions with resolved BOM items
  const resolvedConfigForExport = useMemo(() => {
    const items =
      currentConfig.bomItems && currentConfig.bomItems.length > 0
        ? currentConfig.bomItems
        : calc.bomItems && calc.bomItems.length > 0
        ? calc.bomItems
        : generateSolarBOM(currentConfig, calc);
    return {
      ...currentConfig,
      bomItems: items,
    };
  }, [currentConfig, calc]);

  const handleExportDxf = () => {
    exportSolarToDxf(resolvedConfigForExport, calc);
  };

  const handleExportExcel = () => {
    exportSolarToExcel(resolvedConfigForExport, calc);
  };

  const handleExportWord = async () => {
    await exportSolarToWord(resolvedConfigForExport, calc, {
      panels,
      circuits,
      subPanels,
      vdCalculations,
    });
  };

  const handleExportPdf = () => {
    exportSolarToPdf(resolvedConfigForExport, calc);
  };

  const handlePrint = () => {
    window.print();
  };

  // Estimated daily energy production (kWh/day) = kWp × PSH × Performance Ratio (0.78 - 0.82)
  const dailyEnergyKwh = Number(
    (calc.totalDcCapacityKwp * currentConfig.peakSunHours * 0.8).toFixed(1)
  );

  const pvOverridesCount = useMemo(() => {
    return [
      calc.isOverridden.modulesPerString,
      calc.isOverridden.numberOfStrings,
      calc.isOverridden.totalModules,
    ].filter(Boolean).length;
  }, [calc.isOverridden]);

  const invOverridesCount = useMemo(() => {
    return [
      calc.isOverridden.inverterQuantity,
      calc.isOverridden.batteryUnits,
    ].filter(Boolean).length;
  }, [calc.isOverridden]);

  const protOverridesCount = useMemo(() => {
    return [
      calc.isOverridden.dcFuseRatingAmps,
      calc.isOverridden.dcIsolatorRatingAmps,
      calc.isOverridden.dcSpdUcVolts,
      calc.isOverridden.dcEgcSizeMm2,
      calc.isOverridden.acBreakerAtAmps,
      calc.isOverridden.acBreakerAfAmps,
      calc.isOverridden.acKaic,
      calc.isOverridden.dcCableSizeMm2,
      calc.isOverridden.acCableSizeMm2,
      calc.isOverridden.acConduitSizeMm,
    ].filter(Boolean).length;
  }, [calc.isOverridden]);

  return (
    <div className="space-y-6">
      {/* 1. Master Solar KPI Bar */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white rounded-2xl p-5 shadow-lg border border-slate-700/60">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-700/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center font-black shadow-md">
              <Sun className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black tracking-tight text-white">
                  Solar PV Design & Net-Metering Engine
                </h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  PEC 2017 ART 6.90
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  RA 9513 COMPLIANT
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {currentConfig.projectName} • {currentConfig.projectType.toUpperCase()} ({currentConfig.systemType.toUpperCase()})
              </p>
            </div>
          </div>

          {/* Quick Export Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setIsQuotationModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-gradient-to-r from-sky-600 via-indigo-600 to-blue-600 hover:from-sky-500 hover:to-indigo-500 text-white rounded-xl shadow-xs transition cursor-pointer"
              title="Generate Solar Quotation & Contractor Proposal"
            >
              <Receipt className="w-3.5 h-3.5 text-sky-200" />
              <span>Quotation / Proposal</span>
            </button>
            <button
              onClick={handleExportDxf}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 rounded-xl shadow-xs transition"
              title="Export AutoCAD DXF"
            >
              <Download className="w-3.5 h-3.5 text-sky-400" />
              <span>AutoCAD (DXF)</span>
            </button>
            <button
              onClick={handleExportExcel}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 rounded-xl shadow-xs transition"
              title="Export Excel Calculation Sheet"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              <span>Excel (.xlsx)</span>
            </button>
            <button
              onClick={handleExportWord}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 rounded-xl shadow-xs transition"
              title="Export Word Engineering Report"
            >
              <FileText className="w-3.5 h-3.5 text-blue-400" />
              <span>Word (.docx)</span>
            </button>
            <button
              onClick={handleExportPdf}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-xl shadow-xs transition"
              title="Export Professional PDF Engineering Report"
            >
              <Download className="w-3.5 h-3.5 text-amber-400" />
              <span>PDF Report</span>
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 rounded-xl shadow-xs transition"
              title="Print / Save as PDF"
            >
              <Printer className="w-3.5 h-3.5 text-slate-400" />
              <span>Print</span>
            </button>
          </div>
        </div>

        {/* Real-time Engineering Metrics Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 pt-4">
          <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/50">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
              Installed Solar DC
            </span>
            <span className="text-base font-black text-amber-400 mt-0.5 block">
              {calc.totalDcCapacityKwp} kWp
            </span>
            <span className="text-[10px] text-slate-400">
              {calc.totalModules} Mods @ {calc.selectedModule.ratedPowerWp}W
            </span>
          </div>

          <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/50">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
              Inverter AC Export
            </span>
            <span className="text-base font-black text-sky-400 mt-0.5 block">
              {calc.totalInverterAcKw} kW AC
            </span>
            <span className="text-[10px] text-slate-400">
              {calc.inverterQuantity}x {calc.selectedInverter.ratedAcPowerKw}kW Inverters
            </span>
          </div>

          <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/50">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
              DC/AC Loading Ratio
            </span>
            <span
              className={`text-base font-black mt-0.5 block ${
                calc.validations.dcAcRatioValid ? "text-emerald-400" : "text-amber-400"
              }`}
            >
              {calc.dcAcRatio} : 1
            </span>
            <span className="text-[10px] text-slate-400">
              Optimal: 1.10 - 1.30
            </span>
          </div>

          <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/50">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
              Estimated Daily Yield
            </span>
            <span className="text-base font-black text-emerald-400 mt-0.5 block">
              {dailyEnergyKwh} kWh/day
            </span>
            <span className="text-[10px] text-slate-400">
              @ {currentConfig.peakSunHours} Peak Sun Hrs
            </span>
          </div>

          <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/50">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
              Facility Net Grid Peak
            </span>
            <span className="text-base font-black text-orange-400 mt-0.5 block">
              {calc.netRemainingGridDemandKw} kW
            </span>
            <span className="text-[10px] text-slate-400">
              Demand: {calc.maxDemandKw} kW
            </span>
          </div>

          <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/50">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
              PEC Engineering Checks
            </span>
            <span
              className={`text-base font-black mt-0.5 flex items-center gap-1 ${
                calc.passCount === calc.totalChecks ? "text-emerald-400" : "text-amber-400"
              }`}
            >
              {calc.passCount === calc.totalChecks ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <AlertTriangle className="w-4 h-4" />
              )}
              <span>
                {calc.passCount}/{calc.totalChecks} Pass
              </span>
            </span>
            <span className="text-[10px] text-slate-400">
              All electrical criteria
            </span>
          </div>
        </div>

        {/* Warnings Strip if any */}
        {calc.warnings.length > 0 && (
          <div className="mt-3 p-2.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-200 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
            <div className="truncate">
              <strong>Engineering Notice:</strong> {calc.warnings[0]}
              {calc.warnings.length > 1 && ` (+${calc.warnings.length - 1} more)`}
            </div>
          </div>
        )}
      </div>

      {/* 2. Sub-Tab Navigation */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        <button
          onClick={() => setActiveSubTab("setup")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeSubTab === "setup"
              ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xs"
              : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>1. Project Setup & Sizing</span>
        </button>

        <button
          onClick={() => setActiveSubTab("pv")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeSubTab === "pv"
              ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xs"
              : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          }`}
        >
          <Sun className="w-4 h-4" />
          <span>2. PV Array & String Sizing</span>
          {pvOverridesCount > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-[10px] font-black rounded-full bg-amber-500 text-white leading-none">
              {pvOverridesCount} custom
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveSubTab("inverter")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeSubTab === "inverter"
              ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xs"
              : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          }`}
        >
          <Zap className="w-4 h-4" />
          <span>3. Inverters & BESS Battery</span>
          {invOverridesCount > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-[10px] font-black rounded-full bg-amber-500 text-white leading-none">
              {invOverridesCount} custom
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveSubTab("protection")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeSubTab === "protection"
              ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xs"
              : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>4. Protection & Cables</span>
          {protOverridesCount > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-[10px] font-black rounded-full bg-amber-500 text-white leading-none">
              {protOverridesCount} custom
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveSubTab("sld")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeSubTab === "sld"
              ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xs"
              : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>5. Single Line Diagram (SLD)</span>
        </button>

        <button
          onClick={() => setActiveSubTab("bom")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeSubTab === "bom"
              ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xs"
              : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>6. Bill of Materials (BOM)</span>
        </button>
      </div>

      {/* Automation & Override System Status Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-xs">
        <div className="flex items-center gap-2.5">
          {calc.overrideCount > 0 ? (
            <>
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping inline-block" />
              <div>
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  Manual Overrides Active ({calc.overrideCount} custom value{calc.overrideCount > 1 ? "s" : ""})
                </span>
                <span className="text-slate-500 dark:text-slate-400 ml-2">
                  Dependent values, SLD, and exports automatically update based on your effective data.
                </span>
              </div>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <div>
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  100% Automated Engineering Calculations Active
                </span>
                <span className="text-slate-500 dark:text-slate-400 ml-2">
                  All parameters computed per PEC 2017 & manufacturer specs. You can customize any field whenever needed.
                </span>
              </div>
            </>
          )}
        </div>

        {calc.overrideCount > 0 && (
          <button
            onClick={handleResetAllOverrides}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-100 hover:bg-amber-200 dark:bg-amber-950/60 dark:hover:bg-amber-900/80 text-amber-800 dark:text-amber-300 border border-amber-300/80 dark:border-amber-700/60 transition"
            title="Restore all fields to automatic PEC calculated values"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset All to Auto</span>
          </button>
        )}
      </div>

      {/* 3. Sub-Tab Active View */}
      {activeSubTab === "setup" && (
        <SolarSetupTab
          config={currentConfig}
          calc={calc}
          panels={panels}
          circuits={circuits}
          subPanels={subPanels}
          vdCalculations={vdCalculations}
          computedMainCb={computedMainCb}
          linkedPanel={linkedPanel}
          onChange={handleUpdate}
          onApplyPreset={handleApplyPreset}
        />
      )}

      {activeSubTab === "pv" && (
        <SolarPVTab
          config={currentConfig}
          calc={calc}
          onChange={handleUpdate}
          onSetOverride={handleSetOverride}
          onResetOverride={handleResetOverride}
        />
      )}

      {activeSubTab === "inverter" && (
        <SolarInverterTab
          config={currentConfig}
          calc={calc}
          onChange={handleUpdate}
          onSetOverride={handleSetOverride}
          onResetOverride={handleResetOverride}
        />
      )}

      {activeSubTab === "protection" && (
        <SolarProtectionTab
          config={currentConfig}
          calc={calc}
          onChange={handleUpdate}
          onSetOverride={handleSetOverride}
          onResetOverride={handleResetOverride}
        />
      )}

      {activeSubTab === "sld" && (
        <SolarSLD
          config={currentConfig}
          calc={calc}
          panels={panels}
          circuits={circuits}
          subPanels={subPanels}
          onUpdateConfig={handleUpdate}
          onSetOverride={handleSetOverride}
        />
      )}

      {activeSubTab === "bom" && (
        <SolarBOMTab
          config={currentConfig}
          calc={calc}
          onChange={handleUpdate}
          projectInfo={{ projectName, projectLocation, clientName, designerName }}
        />
      )}

      {/* 4. Mandatory Professional Electrical Engineer (PEE) Disclaimer */}
      <div className="p-4 rounded-2xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 flex items-start gap-3 text-xs text-slate-700 dark:text-slate-300">
        <ShieldAlert className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <span className="font-bold text-rose-700 dark:text-rose-400 block">
            PROFESSIONAL ENGINEERING DISCLAIMER (REPUBLIC ACT 7920 / RA 9513):
          </span>
          <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
            This Solar Design Report is generated by ElectricalPH as an automated engineering aid based on the provisions of the Philippine Electrical Code (PEC) 2017, Republic Act 9513 (Renewable Energy Act of 2008), and distribution utility net-metering interconnection standards. Final design documentation submitted to building officials, distribution utilities (e.g., Meralco), and the Energy Regulatory Commission (ERC) must be reviewed, verified, and sealed by a duly licensed Professional Electrical Engineer (PEE) in accordance with Republic Act 7920 (New Electrical Engineering Law).
          </p>
        </div>
      </div>

      {/* Solar Quotation & Contractor Proposal Modal */}
      <SolarQuotationModal
        isOpen={isQuotationModalOpen}
        onClose={() => setIsQuotationModalOpen(false)}
        config={currentConfig}
        calc={calc}
        onUpdateConfig={handleUpdate}
        projectInfo={{ projectName, projectLocation, clientName, designerName }}
      />
    </div>
  );
};
