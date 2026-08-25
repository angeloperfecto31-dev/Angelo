import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Calculator,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Trash2,
  Save,
  HelpCircle,
  Code2,
  Sparkles,
  Sliders,
  Check,
  X,
  Zap,
} from "lucide-react";
import LatexRenderer from "./LatexRenderer";
import {
  DEFAULT_1PH_DEMAND_FORMULA,
  DEFAULT_3PH_DEMAND_FORMULA,
  FORMULA_VARIABLES_1PH,
  FORMULA_VARIABLES_3PH,
  COMMON_CONSTANTS,
  COMMON_OPERATORS,
  validateDemandFormula,
  evaluateDemandFormula,
  formulaToLatex,
  DemandFormulaConfig,
} from "../utils/formulaEngine";
import { PanelConfig } from "../types";

interface DemandFormulaBuilderProps {
  panel: PanelConfig;
  setPanel: React.Dispatch<React.SetStateAction<PanelConfig>>;
  maxDemandDetails: {
    is3PH: boolean;
    systemVoltage: number;
    totalConnectedVA: number;
    internalConnectedVA: number;
    HML: number;
    totalAmpere: number;
    total3Phase: number;
    phaseR?: number;
    phaseY?: number;
    phaseB?: number;
  };
  onClose?: () => void;
}

export default function DemandFormulaBuilder({
  panel,
  setPanel,
  maxDemandDetails,
  onClose,
}: DemandFormulaBuilderProps) {
  const isPanel3Phase = panel.system?.includes("3PH") ?? false;
  const [activeTab, setActiveTab] = useState<"1PH" | "3PH">(
    isPanel3Phase ? "3PH" : "1PH"
  );

  const initialConfig = useMemo<DemandFormulaConfig>(() => {
    return {
      mode: panel.demandFormulaConfig?.mode || "default",
      singlePhaseFormula:
        panel.demandFormulaConfig?.singlePhaseFormula ||
        panel.demandFormulaConfig?.custom1PhFormula ||
        DEFAULT_1PH_DEMAND_FORMULA,
      threePhaseFormula:
        panel.demandFormulaConfig?.threePhaseFormula ||
        panel.demandFormulaConfig?.custom3PhFormula ||
        DEFAULT_3PH_DEMAND_FORMULA,
      custom1PhFormula:
        panel.demandFormulaConfig?.custom1PhFormula ||
        panel.demandFormulaConfig?.singlePhaseFormula ||
        DEFAULT_1PH_DEMAND_FORMULA,
      custom3PhFormula:
        panel.demandFormulaConfig?.custom3PhFormula ||
        panel.demandFormulaConfig?.threePhaseFormula ||
        DEFAULT_3PH_DEMAND_FORMULA,
    };
  }, [panel.demandFormulaConfig]);

  const [mode, setMode] = useState<"default" | "custom">(initialConfig.mode);
  const [singleFormula, setSingleFormula] = useState<string>(
    initialConfig.custom1PhFormula || DEFAULT_1PH_DEMAND_FORMULA
  );
  const [threeFormula, setThreeFormula] = useState<string>(
    initialConfig.custom3PhFormula || DEFAULT_3PH_DEMAND_FORMULA
  );

  const [validationState, setValidationState] = useState<{
    isValid: boolean;
    message?: string;
    showStatus: boolean;
  }>({
    isValid: true,
    showStatus: false,
  });

  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [saveSuccessNotification, setSaveSuccessNotification] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const currentActiveFormula = activeTab === "3PH" ? threeFormula : singleFormula;
  const setCurrentActiveFormula = (val: string) => {
    if (activeTab === "3PH") {
      setThreeFormula(val);
    } else {
      setSingleFormula(val);
    }
  };

  // Prepare current project electrical values for live testing
  const currentProjectVariables = useMemo(() => {
    const sysV = maxDemandDetails.systemVoltage || 230;
    const connectedVA = maxDemandDetails.internalConnectedVA || maxDemandDetails.totalConnectedVA || 0;
    const hmlVal = maxDemandDetails.HML || 0;
    const lineAmp = maxDemandDetails.totalAmpere || 0;
    const amp3P = maxDemandDetails.total3Phase || 0;

    return {
      // 1PH variables
      "Total Connected VA": connectedVA,
      Total_Connected_VA: connectedVA,
      totalConnectedVA: connectedVA,
      internalConnectedVA: connectedVA,
      Vsys: sysV,
      systemVoltage: sysV,
      HML: hmlVal,

      // 3PH variables
      Iline: lineAmp,
      I_line: lineAmp,
      totalAmpere: lineAmp,
      "I3Φ": amp3P,
      I3Phi: amp3P,
      I3Phase: amp3P,
      total3Phase: amp3P,
    };
  }, [maxDemandDetails]);

  // Live validation on formula change
  const currentValidation = useMemo(() => {
    return validateDemandFormula(currentActiveFormula, activeTab);
  }, [currentActiveFormula, activeTab]);

  // Live evaluation test result
  const currentTestEvaluation = useMemo(() => {
    if (!currentValidation.isValid) {
      return { result: 0, error: currentValidation.errorMessage };
    }
    return evaluateDemandFormula(currentActiveFormula, currentProjectVariables, activeTab);
  }, [currentActiveFormula, currentProjectVariables, activeTab, currentValidation]);

  // Insert token at cursor position
  const insertToken = (token: string) => {
    const el = textareaRef.current;
    if (!el) {
      setCurrentActiveFormula(currentActiveFormula + token);
      return;
    }

    const start = el.selectionStart ?? currentActiveFormula.length;
    const end = el.selectionEnd ?? currentActiveFormula.length;
    const textBefore = currentActiveFormula.substring(0, start);
    const textAfter = currentActiveFormula.substring(end);

    const nextText = textBefore + token + textAfter;
    setCurrentActiveFormula(nextText);

    setTimeout(() => {
      el.focus();
      const newPos = start + token.length;
      el.setSelectionRange(newPos, newPos);
    }, 10);
  };

  const handleValidateClick = () => {
    const valRes = validateDemandFormula(currentActiveFormula, activeTab);
    setValidationState({
      isValid: valRes.isValid,
      message: valRes.isValid
        ? `Formula is mathematically valid for ${activeTab === "3PH" ? "Three-Phase (3Φ)" : "Single-Phase (1Φ)"} calculations.`
        : `Invalid Formula: ${valRes.errorMessage}`,
      showStatus: true,
    });
  };

  const handleResetToDefault = () => {
    if (activeTab === "1PH") {
      setSingleFormula(DEFAULT_1PH_DEMAND_FORMULA);
    } else {
      setThreeFormula(DEFAULT_3PH_DEMAND_FORMULA);
    }
    setShowResetConfirm(false);
    setValidationState({
      isValid: true,
      message: `Reset ${activeTab === "3PH" ? "3-Phase" : "1-Phase"} formula to ElectricalPH PEC standard default.`,
      showStatus: true,
    });
  };

  const handleClearFormula = () => {
    setCurrentActiveFormula("");
    setValidationState({
      isValid: false,
      message: "Formula cleared. Please insert parameters or operators.",
      showStatus: true,
    });
  };

  const handleSaveAndApply = () => {
    // Validate both before saving
    const singleVal = validateDemandFormula(singleFormula, "1PH");
    const threeVal = validateDemandFormula(threeFormula, "3PH");

    if (mode === "custom") {
      if (activeTab === "1PH" && !singleVal.isValid) {
        setValidationState({
          isValid: false,
          message: `Cannot save invalid Single-Phase formula: ${singleVal.errorMessage}`,
          showStatus: true,
        });
        return;
      }
      if (activeTab === "3PH" && !threeVal.isValid) {
        setValidationState({
          isValid: false,
          message: `Cannot save invalid Three-Phase formula: ${threeVal.errorMessage}`,
          showStatus: true,
        });
        return;
      }
    }

    const newConfig: DemandFormulaConfig = {
      mode,
      singlePhaseFormula: mode === "custom" ? singleFormula : DEFAULT_1PH_DEMAND_FORMULA,
      threePhaseFormula: mode === "custom" ? threeFormula : DEFAULT_3PH_DEMAND_FORMULA,
      custom1PhFormula: singleFormula,
      custom3PhFormula: threeFormula,
    };

    setPanel((prev) => ({
      ...prev,
      demandFormulaConfig: newConfig,
    }));

    setSaveSuccessNotification(true);
    setTimeout(() => {
      setSaveSuccessNotification(false);
      if (onClose) onClose();
    }, 1200);
  };

  const availableVariables = activeTab === "3PH" ? FORMULA_VARIABLES_3PH : FORMULA_VARIABLES_1PH;

  // LaTeX preview formula
  const previewLatex = useMemo(() => {
    const rawForm = mode === "default"
      ? (activeTab === "3PH" ? DEFAULT_3PH_DEMAND_FORMULA : DEFAULT_1PH_DEMAND_FORMULA)
      : currentActiveFormula;

    return formulaToLatex(rawForm, activeTab);
  }, [mode, activeTab, currentActiveFormula]);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden text-slate-800 dark:text-slate-100 max-w-5xl mx-auto transition-all">
      {/* Header */}
      <div className="p-6 pb-5 bg-slate-50/80 dark:bg-slate-950/60 border-b border-slate-200/80 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-600 dark:bg-indigo-500 rounded-2xl text-white shadow-md shadow-indigo-500/20">
            <Calculator className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-black tracking-tight text-slate-900 dark:text-white uppercase">
                Main Breaker Formula Customizer
              </h3>
              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                PEC Engine
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Customize Max Demand Current formulas for Single-Phase (1Φ) and Three-Phase (3Φ) systems
            </p>
          </div>
        </div>

        {/* Mode Selector */}
        <div className="flex items-center bg-slate-200/80 dark:bg-slate-800 p-1 rounded-2xl border border-slate-300/60 dark:border-slate-700/60 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setMode("default")}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
              mode === "default"
                ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <div
              className={`w-2 h-2 rounded-full ${
                mode === "default" ? "bg-indigo-600 dark:bg-indigo-400" : "bg-slate-400"
              }`}
            />
            Default Formula
          </button>
          <button
            type="button"
            onClick={() => setMode("custom")}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
              mode === "custom"
                ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <div
              className={`w-2 h-2 rounded-full ${
                mode === "custom" ? "bg-amber-500 animate-pulse" : "bg-slate-400"
              }`}
            />
            Custom Formula
          </button>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* System Phase Tabs */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setActiveTab("1PH");
                setValidationState({ isValid: true, showStatus: false });
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === "1PH"
                  ? "bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              Single-Phase Formula (1Φ)
              {!isPanel3Phase && (
                <span className="text-[9px] bg-emerald-500 text-white font-extrabold px-1.5 py-0.2 rounded-md">
                  Active Panel
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab("3PH");
                setValidationState({ isValid: true, showStatus: false });
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === "3PH"
                  ? "bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              Three-Phase Formula (3Φ)
              {isPanel3Phase && (
                <span className="text-[9px] bg-emerald-500 text-white font-extrabold px-1.5 py-0.2 rounded-md">
                  Active Panel
                </span>
              )}
            </button>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400">
            <Sliders className="w-3.5 h-3.5 text-slate-400" />
            <span>Editing {activeTab === "3PH" ? "Three-Phase" : "Single-Phase"} Mode</span>
          </div>
        </div>

        {/* Status Alert if in Default Mode */}
        {mode === "default" && (
          <div className="p-4 bg-blue-50/70 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40 rounded-2xl flex items-start gap-3 text-blue-800 dark:text-blue-300 text-xs">
            <HelpCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Operating on Standard ElectricalPH Default Formula</p>
              <p className="text-blue-700 dark:text-blue-300/80 mt-0.5">
                The standard Philippine Electrical Code (PEC) allowable 80% continuous demand calculation is active.
                Switch to <strong className="font-bold underline">Custom Formula</strong> above to modify formula variables, constants, and multipliers.
              </p>
            </div>
          </div>
        )}

        {/* Formula Input & Builder Workspace */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Code2 className="w-4 h-4 text-indigo-500" />
              {activeTab === "3PH" ? "Three-Phase Expression" : "Single-Phase Expression"}
            </label>
            <span className="text-[11px] text-slate-400 font-mono">
              Click parameters below to insert at cursor
            </span>
          </div>

          {/* Formula Text Area */}
          <div className="relative">
            <textarea
              ref={textareaRef}
              disabled={mode === "default"}
              value={
                mode === "default"
                  ? (activeTab === "3PH" ? DEFAULT_3PH_DEMAND_FORMULA : DEFAULT_1PH_DEMAND_FORMULA)
                  : currentActiveFormula
              }
              onChange={(e) => {
                if (mode === "custom") {
                  setCurrentActiveFormula(e.target.value);
                  setValidationState({ isValid: true, showStatus: false });
                }
              }}
              rows={3}
              placeholder="e.g. [(Total Connected VA / Vsys) * 0.80 + (0.25 * HML)] * 1.25"
              className={`w-full p-4 font-mono text-sm sm:text-base rounded-2xl border transition-all resize-none focus:outline-none focus:ring-2 ${
                mode === "default"
                  ? "bg-slate-100/70 dark:bg-slate-950/40 border-slate-200 dark:border-slate-800 text-slate-500 cursor-not-allowed"
                  : currentValidation.isValid
                  ? "bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700 focus:ring-indigo-500 text-slate-900 dark:text-slate-100 shadow-inner"
                  : "bg-red-50/30 dark:bg-red-950/20 border-red-300 dark:border-red-800 focus:ring-red-500 text-slate-900 dark:text-slate-100"
              }`}
            />
          </div>

          {/* Formula Builder Palettes (Only interactive when in Custom Mode or previewing) */}
          <div className={`space-y-3 ${mode === "default" ? "opacity-60 pointer-events-none" : ""}`}>
            {/* Clickable Available Variables */}
            <div>
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1.5">
                Available Variables ({activeTab})
              </span>
              <div className="flex flex-wrap gap-2">
                {availableVariables.map((v) => (
                  <button
                    key={v.token}
                    type="button"
                    onClick={() => insertToken(` ${v.token} `)}
                    title={`${v.description} (${v.unit})`}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95"
                  >
                    <span className="font-mono">{v.label}</span>
                    <span className="text-[10px] opacity-60 font-normal">[{v.unit}]</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Clickable Operators & Constants */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {/* Operators */}
              <div>
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1.5">
                  Operators
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {COMMON_OPERATORS.map((op) => (
                    <button
                      key={op.label}
                      type="button"
                      onClick={() => insertToken(op.insert)}
                      title={op.description}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono font-bold transition-all active:scale-95 min-w-[36px] text-center"
                    >
                      {op.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Constants */}
              <div>
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1.5">
                  Numerical Constants
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {COMMON_CONSTANTS.map((c) => (
                    <button
                      key={c.label}
                      type="button"
                      onClick={() => insertToken(` ${c.value} `)}
                      title={c.description}
                      className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono font-bold transition-all active:scale-95"
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Quick Action Buttons */}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-150 dark:border-slate-800">
              <button
                type="button"
                onClick={handleValidateClick}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition-all border border-slate-200 dark:border-slate-700"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-indigo-500" />
                Validate Formula
              </button>

              <button
                type="button"
                onClick={handleClearFormula}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-rose-50 dark:bg-slate-800 dark:hover:bg-rose-950/30 text-slate-600 hover:text-rose-600 dark:text-slate-300 dark:hover:text-rose-400 rounded-xl text-xs font-bold transition-all border border-slate-200 dark:border-slate-700"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear Formula
              </button>

              <button
                type="button"
                onClick={() => setShowResetConfirm(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-amber-50 dark:bg-slate-800 dark:hover:bg-amber-950/30 text-slate-600 hover:text-amber-600 dark:text-slate-300 dark:hover:text-amber-400 rounded-xl text-xs font-bold transition-all border border-slate-200 dark:border-slate-700"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset to Default
              </button>
            </div>
          </div>

          {/* Validation Feedback Banner */}
          {validationState.showStatus && (
            <div
              className={`p-3.5 rounded-2xl border text-xs flex items-start gap-2.5 transition-all ${
                validationState.isValid
                  ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/40 text-emerald-800 dark:text-emerald-300"
                  : "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/40 text-red-800 dark:text-red-300"
              }`}
            >
              {validationState.isValid ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              )}
              <span className="font-medium">{validationState.message}</span>
            </div>
          )}
        </div>

        {/* Live Mathematical Formula Preview (LaTeX) */}
        <div className="space-y-2">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            {activeTab === "3PH"
              ? "MATHEMATICAL FORMULA (3-PHASE LATEX)"
              : "MATHEMATICAL FORMULA (SINGLE-PHASE LATEX)"}
          </h4>
          <div className="bg-slate-50 dark:bg-slate-950/70 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-x-auto min-h-[60px] flex items-center justify-center">
            <LatexRenderer tex={previewLatex} />
          </div>
        </div>

        {/* Live Test Calculation / Preview Calculation */}
        <div className="bg-slate-50 dark:bg-slate-950/40 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              Live Project Test Calculation
            </h4>
            <span className="text-[10px] text-slate-400 font-mono">
              Evaluated with current project values
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            {activeTab === "1PH" ? (
              <>
                <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800">
                  <span className="text-slate-400 block font-bold text-[10px] uppercase">
                    Total Connected VA
                  </span>
                  <span className="text-sm font-black font-mono text-slate-800 dark:text-slate-100">
                    {(maxDemandDetails.internalConnectedVA || maxDemandDetails.totalConnectedVA || 0).toLocaleString(undefined, { maximumFractionDigits: 1 })} VA
                  </span>
                </div>

                <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800">
                  <span className="text-slate-400 block font-bold text-[10px] uppercase">
                    System Voltage (Vsys)
                  </span>
                  <span className="text-sm font-black font-mono text-slate-800 dark:text-slate-100">
                    {maxDemandDetails.systemVoltage || 230} V
                  </span>
                </div>

                <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800">
                  <span className="text-slate-400 block font-bold text-[10px] uppercase">
                    Highest Motor Load (HML)
                  </span>
                  <span className="text-sm font-black font-mono text-slate-800 dark:text-slate-100">
                    {(maxDemandDetails.HML || 0).toFixed(2)} A
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800">
                  <span className="text-slate-400 block font-bold text-[10px] uppercase">
                    Highest Line Current (Iline)
                  </span>
                  <span className="text-sm font-black font-mono text-slate-800 dark:text-slate-100">
                    {(maxDemandDetails.totalAmpere || 0).toFixed(2)} A
                  </span>
                </div>

                <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800">
                  <span className="text-slate-400 block font-bold text-[10px] uppercase">
                    Total 3-Phase Current (I3Φ)
                  </span>
                  <span className="text-sm font-black font-mono text-slate-800 dark:text-slate-100">
                    {(maxDemandDetails.total3Phase || 0).toFixed(2)} A
                  </span>
                </div>

                <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800">
                  <span className="text-slate-400 block font-bold text-[10px] uppercase">
                    Highest Motor Load (HML)
                  </span>
                  <span className="text-sm font-black font-mono text-slate-800 dark:text-slate-100">
                    {(maxDemandDetails.HML || 0).toFixed(2)} A
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Test Evaluation Result Output */}
          <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
                Calculated Max Demand Current
              </span>
              <p className="text-xs text-slate-500 mt-0.5">
                Evaluated output applied to Main Breaker & Feeder sizing
              </p>
            </div>

            <div className="flex items-center gap-2">
              {!currentTestEvaluation.error && currentTestEvaluation.result > 0 ? (
                <div className="px-5 py-2.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 rounded-2xl text-center">
                  <span className="text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400">
                    {currentTestEvaluation.result.toFixed(2)}
                  </span>
                  <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300 ml-1.5">
                    AMPS
                  </span>
                </div>
              ) : (
                <div className="px-4 py-2 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-2xl text-red-600 dark:text-red-400 text-xs font-bold">
                  Calculation Error: {currentTestEvaluation.error || "Check formula"}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 pt-5">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
          >
            Cancel
          </button>

          <div className="flex items-center gap-3">
            {saveSuccessNotification && (
              <span className="flex items-center gap-1 text-xs text-emerald-600 font-bold animate-pulse">
                <Check className="w-4 h-4" /> Formula Saved & Applied!
              </span>
            )}

            <button
              type="button"
              onClick={handleSaveAndApply}
              className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-500/20 active:scale-95"
            >
              <Save className="w-4 h-4" />
              Save & Apply Formula
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation Modal before Resetting */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-amber-600 dark:text-amber-400">
              <div className="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-2xl">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h4 className="font-bold text-base text-slate-900 dark:text-white">
                Reset Formula to Default?
              </h4>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Are you sure you want to replace your custom {activeTab === "3PH" ? "Three-Phase (3Φ)" : "Single-Phase (1Φ)"} formula with the built-in ElectricalPH PEC default formula?
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleResetToDefault}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-95"
              >
                Yes, Reset Formula
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
