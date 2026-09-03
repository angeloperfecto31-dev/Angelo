import React, { useState, useRef, useMemo } from "react";
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
  Copy,
  Layers,
  BookOpen,
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

// Common engineering formula presets for 1PH and 3PH
const PRESETS_1PH = [
  {
    name: "PEC Standard 80%",
    formula: "[(Total Connected VA / Vsys) * 0.80 + (0.25 * HML)] * 1.25",
    desc: "80% continuous factor + 25% largest motor with 1.25 design factor",
  },
  {
    name: "100% Demand Rule",
    formula: "[(Total Connected VA / Vsys) * 1.00 + (0.25 * HML)] * 1.25",
    desc: "100% total connected load + 25% motor allowance × 1.25 multiplier",
  },
  {
    name: "Continuous 125% Only",
    formula: "(Total Connected VA / Vsys) * 1.25",
    desc: "Standard 125% continuous circuit sizing without motor branch",
  },
  {
    name: "Direct Connected VA",
    formula: "Total Connected VA / Vsys",
    desc: "Nominal 100% full-load current without extra design multipliers",
  },
];

const PRESETS_3PH = [
  {
    name: "PEC Standard 80%",
    formula: "[(Iline * 1.732) * 0.80 + I3Φ + (0.25 * HML)] * 1.25",
    desc: "80% on 1Φ line currents + 3Φ load + 25% HML with 1.25 safety multiplier",
  },
  {
    name: "Balanced 3-Phase Line",
    formula: "[Iline * 1.732 + (0.25 * HML)] * 1.25",
    desc: "Maximum line current multiplied by √3 plus largest motor allowance",
  },
  {
    name: "100% Full Load 3PH",
    formula: "[(Iline * 1.732) * 1.00 + I3Φ + (0.25 * HML)] * 1.25",
    desc: "100% demand on line currents and 3-phase circuits with motor branch",
  },
  {
    name: "Direct Symmetrical Line",
    formula: "Iline * 1.732 + I3Φ",
    desc: "Direct addition of transformed line current and 3-phase circuits",
  },
];

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
  const [copiedLatex, setCopiedLatex] = useState(false);

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
    const connectedVA =
      maxDemandDetails.internalConnectedVA ||
      maxDemandDetails.totalConnectedVA ||
      0;
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
    const formulaToTest =
      mode === "default"
        ? activeTab === "3PH"
          ? DEFAULT_3PH_DEMAND_FORMULA
          : DEFAULT_1PH_DEMAND_FORMULA
        : currentActiveFormula;
    return validateDemandFormula(formulaToTest, activeTab);
  }, [currentActiveFormula, activeTab, mode]);

  // Live evaluation test result
  const currentTestEvaluation = useMemo(() => {
    const formulaToTest =
      mode === "default"
        ? activeTab === "3PH"
          ? DEFAULT_3PH_DEMAND_FORMULA
          : DEFAULT_1PH_DEMAND_FORMULA
        : currentActiveFormula;

    const valRes = validateDemandFormula(formulaToTest, activeTab);
    if (!valRes.isValid) {
      return { result: 0, error: valRes.errorMessage };
    }
    return evaluateDemandFormula(
      formulaToTest,
      currentProjectVariables,
      activeTab
    );
  }, [
    currentActiveFormula,
    currentProjectVariables,
    activeTab,
    mode,
  ]);

  // Insert token at cursor position
  const insertToken = (token: string) => {
    if (mode === "default") {
      setMode("custom");
    }

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
        ? `Formula is mathematically valid and safe for ${
            activeTab === "3PH" ? "Three-Phase (3Φ)" : "Single-Phase (1Φ)"
          } calculation.`
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
      message: `Reset ${
        activeTab === "3PH" ? "3-Phase" : "1-Phase"
      } formula to ElectricalPH PEC standard default.`,
      showStatus: true,
    });
  };

  const handleClearFormula = () => {
    setCurrentActiveFormula("");
    setValidationState({
      isValid: false,
      message: "Formula cleared. Click variables or operators below to build an expression.",
      showStatus: true,
    });
  };

  const handleApplyPreset = (formulaText: string) => {
    if (mode === "default") {
      setMode("custom");
    }
    setCurrentActiveFormula(formulaText);
    setValidationState({
      isValid: true,
      message: `Applied preset equation. You can customize variables or save.`,
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
      singlePhaseFormula:
        mode === "custom" ? singleFormula : DEFAULT_1PH_DEMAND_FORMULA,
      threePhaseFormula:
        mode === "custom" ? threeFormula : DEFAULT_3PH_DEMAND_FORMULA,
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

  const availableVariables =
    activeTab === "3PH" ? FORMULA_VARIABLES_3PH : FORMULA_VARIABLES_1PH;
  const currentPresets = activeTab === "3PH" ? PRESETS_3PH : PRESETS_1PH;

  // LaTeX preview formula
  const previewLatex = useMemo(() => {
    const rawForm =
      mode === "default"
        ? activeTab === "3PH"
          ? DEFAULT_3PH_DEMAND_FORMULA
          : DEFAULT_1PH_DEMAND_FORMULA
        : currentActiveFormula;

    return formulaToLatex(rawForm, activeTab);
  }, [mode, activeTab, currentActiveFormula]);

  const handleCopyLatex = () => {
    if (!previewLatex) return;
    navigator.clipboard.writeText(previewLatex);
    setCopiedLatex(true);
    setTimeout(() => setCopiedLatex(false), 2000);
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden text-slate-800 dark:text-slate-100 max-w-5xl w-full max-h-[96dvh] sm:max-h-[92vh] flex flex-col transition-all my-auto">
      {/* Header - Sticky Top with Backdrop Blur */}
      <div className="shrink-0 p-3.5 sm:p-5 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 flex flex-col gap-3">
        {/* Top row: Title, Badge, Description, and Mobile/Desktop Close */}
        <div className="flex items-start justify-between gap-2.5 w-full">
          <div className="flex items-start sm:items-center gap-2.5 sm:gap-3 flex-1 min-w-0">
            <div className="p-2 sm:p-2.5 bg-indigo-600 dark:bg-indigo-500 rounded-xl sm:rounded-2xl text-white shadow-md shadow-indigo-500/20 shrink-0 mt-0.5 sm:mt-0">
              <Calculator className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center flex-wrap gap-1.5 sm:gap-2">
                <h3 className="text-sm sm:text-base md:text-lg font-black tracking-tight text-slate-900 dark:text-white uppercase leading-tight truncate">
                  Main Breaker Formula Customizer
                </h3>
                <span className="text-[9px] sm:text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 shrink-0">
                  PEC Sizing Engine
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                Configure Max Demand Current calculation formulas for 1Φ & 3Φ systems
              </p>
            </div>
          </div>

          {/* Close button for all screens */}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-2 sm:p-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors shrink-0 min-w-[40px] min-h-[40px] sm:min-w-[44px] sm:min-h-[44px] flex items-center justify-center cursor-pointer"
              aria-label="Close dialog"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Mode Selector - Responsive full-width on mobile, auto on tablet/desktop */}
        <div className="flex flex-col xs:flex-row items-stretch xs:items-center justify-between gap-2 pt-1 border-t border-slate-200/60 dark:border-slate-800/60">
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider hidden sm:inline">
            Calculation Engine Mode:
          </span>
          <div className="grid grid-cols-2 sm:flex items-center bg-slate-200/80 dark:bg-slate-800 p-1 rounded-xl sm:rounded-2xl border border-slate-300/60 dark:border-slate-700/60 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => {
                setMode("default");
                setValidationState({ isValid: true, showStatus: false });
              }}
              className={`flex items-center justify-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-lg sm:rounded-xl text-xs font-bold transition-all min-h-[40px] sm:min-h-[36px] cursor-pointer ${
                mode === "default"
                  ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <div
                className={`w-2 h-2 rounded-full ${
                  mode === "default"
                    ? "bg-indigo-600 dark:bg-indigo-400"
                    : "bg-slate-400"
                }`}
              />
              <span>Default PEC</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("custom");
                setValidationState({ isValid: true, showStatus: false });
              }}
              className={`flex items-center justify-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-lg sm:rounded-xl text-xs font-bold transition-all min-h-[40px] sm:min-h-[36px] cursor-pointer ${
                mode === "custom"
                  ? "bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <div
                className={`w-2 h-2 rounded-full ${
                  mode === "custom"
                    ? "bg-amber-500 animate-pulse"
                    : "bg-slate-400"
                }`}
              />
              <span>Custom Formula</span>
            </button>
          </div>
        </div>
      </div>

      {/* Scrollable Content Body */}
      <div className="flex-1 overflow-y-auto min-h-0 p-3.5 sm:p-5 md:p-6 space-y-4 sm:space-y-6 overscroll-contain">
        {/* System Phase Tabs */}
        <div className="flex flex-col gap-2.5 border-b border-slate-200 dark:border-slate-800 pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="grid grid-cols-2 sm:flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => {
                  setActiveTab("1PH");
                  setValidationState({ isValid: true, showStatus: false });
                }}
                className={`flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer min-h-[44px] ${
                  activeTab === "1PH"
                    ? "bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent"
                }`}
              >
                <Zap className="w-4 h-4 shrink-0 text-amber-500" />
                <span>Single-Phase (1Φ)</span>
                {!isPanel3Phase && (
                  <span className="hidden xs:inline-block text-[9px] bg-emerald-500 text-white font-black px-1.5 py-0.2 rounded-md">
                    Active
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab("3PH");
                  setValidationState({ isValid: true, showStatus: false });
                }}
                className={`flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer min-h-[44px] ${
                  activeTab === "3PH"
                    ? "bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent"
                }`}
              >
                <Zap className="w-4 h-4 shrink-0 text-indigo-500" />
                <span>Three-Phase (3Φ)</span>
                {isPanel3Phase && (
                  <span className="hidden xs:inline-block text-[9px] bg-emerald-500 text-white font-black px-1.5 py-0.2 rounded-md">
                    Active
                  </span>
                )}
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                <span>Editing: <strong className="text-slate-800 dark:text-slate-200 font-bold">{activeTab === "3PH" ? "3-Phase (3Φ)" : "Single-Phase (1Φ)"}</strong></span>
              </span>
              {((!isPanel3Phase && activeTab === "1PH") || (isPanel3Phase && activeTab === "3PH")) ? (
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-950/30 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-900/50">
                  Matches Current Panel
                </span>
              ) : (
                <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                  Panel is currently {isPanel3Phase ? "3-Phase" : "1-Phase"}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Status Alert if in Default Mode */}
        {mode === "default" && (
          <div className="p-3.5 sm:p-4 bg-blue-50/70 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40 rounded-xl sm:rounded-2xl flex flex-col sm:flex-row items-start justify-between gap-3 text-blue-800 dark:text-blue-300 text-xs">
            <div className="flex items-start gap-2.5 flex-1">
              <HelpCircle className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-xs sm:text-sm">Standard PEC 80% Default Calculation is Active</p>
                <p className="text-blue-700 dark:text-blue-300/80 mt-0.5 leading-relaxed">
                  ElectricalPH calculates demand current using the Philippine Electrical Code standard continuous formula. Switch to <strong className="font-bold underline cursor-pointer" onClick={() => setMode("custom")}>Custom Formula</strong> to adjust multipliers, tokens, or formulas.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setMode("custom")}
              className="w-full sm:w-auto px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs shrink-0 cursor-pointer min-h-[44px] flex items-center justify-center"
            >
              Switch to Custom Formula
            </button>
          </div>
        )}

        {/* Quick Engineering Presets */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-1">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
              Standard Engineering Presets ({activeTab})
            </span>
            <span className="text-[10px] text-slate-400 font-mono">Tap preset to apply equation</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-2.5">
            {currentPresets.map((preset) => (
              <button
                key={preset.name}
                type="button"
                onClick={() => handleApplyPreset(preset.formula)}
                className="p-3 text-left bg-slate-50 hover:bg-indigo-50/70 dark:bg-slate-800/60 dark:hover:bg-indigo-950/40 border border-slate-200 hover:border-indigo-300 dark:border-slate-700 dark:hover:border-indigo-800 rounded-xl transition-all group active:scale-[0.98] cursor-pointer flex flex-col justify-between min-h-[72px]"
              >
                <div>
                  <div className="flex items-center justify-between mb-1 gap-1">
                    <span className="font-bold text-xs text-slate-800 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                      {preset.name}
                    </span>
                    <Layers className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-500 shrink-0" />
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-2 leading-tight">
                    {preset.desc}
                  </p>
                </div>
                <div className="mt-2 text-[9px] font-mono font-bold text-indigo-600/80 dark:text-indigo-400/80 truncate">
                  {preset.formula}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Formula Input & Builder Workspace */}
        <div className="space-y-3.5 sm:space-y-4">
          <div className="flex flex-col xs:flex-row xs:items-center justify-between gap-1">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
              <Code2 className="w-4 h-4 text-indigo-500 shrink-0" />
              <span>{activeTab === "3PH" ? "Three-Phase Expression" : "Single-Phase Expression"}</span>
            </label>
            <span className="text-[10px] sm:text-[11px] text-slate-400 font-mono">
              Tap parameters below to insert at cursor
            </span>
          </div>

          {/* Formula Text Area */}
          <div className="relative">
            <textarea
              ref={textareaRef}
              disabled={mode === "default"}
              value={
                mode === "default"
                  ? activeTab === "3PH"
                    ? DEFAULT_3PH_DEMAND_FORMULA
                    : DEFAULT_1PH_DEMAND_FORMULA
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
              className={`w-full p-3 sm:p-4 font-mono text-xs sm:text-sm md:text-base rounded-xl sm:rounded-2xl border transition-all resize-y min-h-[96px] sm:min-h-[110px] max-h-48 focus:outline-none focus:ring-2 whitespace-pre-wrap break-words leading-relaxed ${
                mode === "default"
                  ? "bg-slate-100/70 dark:bg-slate-950/40 border-slate-200 dark:border-slate-800 text-slate-500 cursor-not-allowed"
                  : currentValidation.isValid
                  ? "bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700 focus:ring-indigo-500 text-slate-900 dark:text-slate-100 shadow-inner"
                  : "bg-red-50/30 dark:bg-red-950/20 border-red-300 dark:border-red-800 focus:ring-red-500 text-slate-900 dark:text-slate-100"
              }`}
            />
          </div>

          {/* Formula Builder Palettes */}
          <div
            className={`space-y-3.5 sm:space-y-4 ${
              mode === "default" ? "opacity-60" : ""
            }`}
          >
            {/* Clickable Available Variables */}
            <div>
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1.5">
                Available Variables ({activeTab})
              </span>
              <div className="flex flex-wrap gap-1.5 sm:gap-2">
                {availableVariables.map((v) => (
                  <button
                    key={v.token}
                    type="button"
                    onClick={() => insertToken(` ${v.token} `)}
                    title={`${v.description} (${v.unit})`}
                    className="flex items-center gap-1.5 px-3 py-2 sm:py-2.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-xl text-xs sm:text-sm font-bold transition-all shadow-xs active:scale-95 cursor-pointer min-h-[44px]"
                  >
                    <span className="font-mono">{v.label}</span>
                    <span className="text-[10px] opacity-75 font-semibold px-1 py-0.5 bg-indigo-200/60 dark:bg-indigo-900/80 rounded">
                      [{v.unit}]
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Clickable Operators & Constants */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 sm:gap-4 pt-1">
              {/* Operators */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                  Operators & Brackets
                </span>
                <div className="grid grid-cols-5 xs:grid-cols-7 sm:flex sm:flex-wrap gap-1.5">
                  {COMMON_OPERATORS.map((op) => (
                    <button
                      key={op.label}
                      type="button"
                      onClick={() => insertToken(op.insert)}
                      title={op.description}
                      className="px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-mono font-bold transition-all active:scale-95 min-w-[44px] min-h-[44px] text-center cursor-pointer flex items-center justify-center shadow-2xs"
                    >
                      {op.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Constants */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                  Numerical Multipliers & Constants
                </span>
                <div className="grid grid-cols-2 xs:grid-cols-3 sm:flex sm:flex-wrap gap-1.5">
                  {COMMON_CONSTANTS.map((c) => (
                    <button
                      key={c.label}
                      type="button"
                      onClick={() => insertToken(` ${c.value} `)}
                      title={c.description}
                      className="px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-mono font-bold transition-all active:scale-95 min-h-[44px] cursor-pointer flex items-center justify-center shadow-2xs"
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Quick Action Toolbar Buttons */}
            <div className="grid grid-cols-1 xs:grid-cols-3 sm:flex sm:flex-wrap items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={handleValidateClick}
                className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs sm:text-sm font-bold transition-all border border-slate-200 dark:border-slate-700 cursor-pointer min-h-[44px]"
              >
                <CheckCircle2 className="w-4 h-4 text-indigo-500 shrink-0" />
                <span>Validate Formula</span>
              </button>

              <button
                type="button"
                onClick={handleClearFormula}
                className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-slate-100 hover:bg-rose-50 dark:bg-slate-800 dark:hover:bg-rose-950/30 text-slate-600 hover:text-rose-600 dark:text-slate-300 dark:hover:text-rose-400 rounded-xl text-xs sm:text-sm font-bold transition-all border border-slate-200 dark:border-slate-700 cursor-pointer min-h-[44px]"
              >
                <Trash2 className="w-4 h-4 shrink-0" />
                <span>Clear Formula</span>
              </button>

              <button
                type="button"
                onClick={() => setShowResetConfirm(true)}
                className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-slate-100 hover:bg-amber-50 dark:bg-slate-800 dark:hover:bg-amber-950/30 text-slate-600 hover:text-amber-600 dark:text-slate-300 dark:hover:text-amber-400 rounded-xl text-xs sm:text-sm font-bold transition-all border border-slate-200 dark:border-slate-700 cursor-pointer min-h-[44px]"
              >
                <RotateCcw className="w-4 h-4 shrink-0" />
                <span>Reset to Default</span>
              </button>
            </div>
          </div>

          {/* Validation Feedback Banner */}
          {validationState.showStatus && (
            <div
              className={`p-3.5 sm:p-4 rounded-xl sm:rounded-2xl border text-xs sm:text-sm flex items-start gap-2.5 transition-all leading-relaxed break-words ${
                validationState.isValid
                  ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/40 text-emerald-800 dark:text-emerald-300"
                  : "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/40 text-red-800 dark:text-red-300"
              }`}
            >
              {validationState.isValid ? (
                <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              )}
              <span className="font-medium flex-1">
                {validationState.message}
              </span>
            </div>
          )}
        </div>

        {/* Live Mathematical Formula Preview (LaTeX) */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-1">
            <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              {activeTab === "3PH"
                ? "MATHEMATICAL FORMULA (3-PHASE LATEX)"
                : "MATHEMATICAL FORMULA (SINGLE-PHASE LATEX)"}
            </h4>
            <button
              type="button"
              onClick={handleCopyLatex}
              className="text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg transition-colors cursor-pointer min-h-[36px]"
            >
              {copiedLatex ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-emerald-600 dark:text-emerald-400">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy LaTeX</span>
                </>
              )}
            </button>
          </div>
          <div className="bg-slate-50 dark:bg-slate-950/70 p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 overflow-x-auto min-h-[64px] flex items-center justify-center text-center">
            <div className="max-w-full overflow-x-auto py-1 px-2 text-xs sm:text-sm md:text-base">
              <LatexRenderer tex={previewLatex} />
            </div>
          </div>
        </div>

        {/* Live Test Calculation / Preview Calculation */}
        <div className="bg-slate-50 dark:bg-slate-950/40 p-3.5 sm:p-5 rounded-xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3.5 sm:space-y-4">
          <div className="flex flex-col xs:flex-row xs:items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2.5 gap-1">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
              <span>Live Project Test Calculation</span>
            </h4>
            <span className="text-[10px] text-slate-400 font-mono">
              Evaluated with current project panel values
            </span>
          </div>

          <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3 text-xs">
            {activeTab === "1PH" ? (
              <>
                <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-2xs">
                  <span className="text-slate-400 block font-bold text-[10px] uppercase">
                    Total Connected VA
                  </span>
                  <span className="text-sm sm:text-base font-black font-mono text-slate-800 dark:text-slate-100">
                    {(
                      maxDemandDetails.internalConnectedVA ||
                      maxDemandDetails.totalConnectedVA ||
                      0
                    ).toLocaleString(undefined, { maximumFractionDigits: 1 })}{" "}
                    VA
                  </span>
                </div>

                <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-2xs">
                  <span className="text-slate-400 block font-bold text-[10px] uppercase">
                    System Voltage (Vsys)
                  </span>
                  <span className="text-sm sm:text-base font-black font-mono text-slate-800 dark:text-slate-100">
                    {maxDemandDetails.systemVoltage || 230} V
                  </span>
                </div>

                <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-2xs xs:col-span-2 lg:col-span-1">
                  <span className="text-slate-400 block font-bold text-[10px] uppercase">
                    Highest Motor Load (HML)
                  </span>
                  <span className="text-sm sm:text-base font-black font-mono text-slate-800 dark:text-slate-100">
                    {(maxDemandDetails.HML || 0).toFixed(2)} A
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-2xs">
                  <span className="text-slate-400 block font-bold text-[10px] uppercase">
                    Highest Line Current (Iline)
                  </span>
                  <span className="text-sm sm:text-base font-black font-mono text-slate-800 dark:text-slate-100">
                    {(maxDemandDetails.totalAmpere || 0).toFixed(2)} A
                  </span>
                </div>

                <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-2xs">
                  <span className="text-slate-400 block font-bold text-[10px] uppercase">
                    Total 3-Phase Current (I3Φ)
                  </span>
                  <span className="text-sm sm:text-base font-black font-mono text-slate-800 dark:text-slate-100">
                    {(maxDemandDetails.total3Phase || 0).toFixed(2)} A
                  </span>
                </div>

                <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-2xs xs:col-span-2 lg:col-span-1">
                  <span className="text-slate-400 block font-bold text-[10px] uppercase">
                    Highest Motor Load (HML)
                  </span>
                  <span className="text-sm sm:text-base font-black font-mono text-slate-800 dark:text-slate-100">
                    {(maxDemandDetails.HML || 0).toFixed(2)} A
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Test Evaluation Result Output Banner */}
          <div className="p-3.5 sm:p-4 bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-2xs">
            <div className="flex-1">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
                Calculated Max Demand Current Output
              </span>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                Evaluated amperage directly applied to Main Circuit Breaker & Feeder sizing
              </p>
            </div>

            <div className="w-full md:w-auto flex items-center justify-center md:justify-end">
              {!currentTestEvaluation.error &&
              currentTestEvaluation.result > 0 ? (
                <div className="w-full md:w-auto px-5 py-2.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 rounded-xl sm:rounded-2xl text-center flex items-center justify-center md:justify-end gap-2 min-h-[48px]">
                  <span className="text-2xl sm:text-3xl font-black font-mono text-emerald-600 dark:text-emerald-400">
                    {currentTestEvaluation.result.toFixed(2)}
                  </span>
                  <span className="text-xs sm:text-sm font-bold text-emerald-700 dark:text-emerald-300">
                    AMPS
                  </span>
                </div>
              ) : (
                <div className="w-full md:w-auto px-4 py-2.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-xl sm:rounded-2xl text-red-600 dark:text-red-400 text-xs font-bold text-center min-h-[44px] flex items-center justify-center">
                  Calculation Error:{" "}
                  {currentTestEvaluation.error || "Check formula syntax"}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer Actions - Sticky Bottom with Touch-Friendly Layout */}
      <div className="shrink-0 p-3.5 sm:p-5 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-3">
        <button
          type="button"
          onClick={onClose}
          className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 transition-all text-center cursor-pointer min-h-[44px] flex items-center justify-center"
        >
          Cancel
        </button>

        <div className="w-full sm:w-auto flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3">
          {saveSuccessNotification && (
            <span className="flex items-center justify-center gap-1.5 text-xs sm:text-sm text-emerald-600 dark:text-emerald-400 font-bold animate-pulse py-1">
              <Check className="w-4 h-4" /> Formula Saved & Applied!
            </span>
          )}

          <button
            type="button"
            onClick={handleSaveAndApply}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs sm:text-sm font-bold transition-all shadow-md shadow-indigo-500/20 active:scale-95 cursor-pointer min-h-[44px]"
          >
            <Save className="w-4 h-4" />
            <span>Save & Apply Formula</span>
          </button>
        </div>
      </div>

      {/* Confirmation Modal before Resetting */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3.5 sm:p-4 animate-fade">
          <div className="bg-white dark:bg-slate-900 p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-amber-600 dark:text-amber-400">
              <div className="p-2.5 sm:p-3 bg-amber-50 dark:bg-amber-950/40 rounded-2xl shrink-0">
                <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <div>
                <h4 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white">
                  Reset Formula to Default?
                </h4>
                <span className="text-[11px] text-slate-400">
                  Philippine Electrical Code (PEC) Sizing Rule
                </span>
              </div>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Are you sure you want to restore the built-in ElectricalPH PEC default formula for{" "}
              <strong>{activeTab === "3PH" ? "Three-Phase (3Φ)" : "Single-Phase (1Φ)"}</strong>? Any custom edits will be replaced with standard 80% continuous factor calculations.
            </p>
            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all text-center cursor-pointer min-h-[44px] flex items-center justify-center"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleResetToDefault}
                className="w-full sm:w-auto px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs sm:text-sm font-bold transition-all shadow-md active:scale-95 text-center cursor-pointer min-h-[44px] flex items-center justify-center"
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
