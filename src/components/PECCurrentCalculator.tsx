import React, { useState } from 'react';
import { Calculator, Zap, ShieldAlert, ArrowRight, Clipboard, CheckCircle } from 'lucide-react';

export default function PECCurrentCalculator() {
  const [system, setSystem] = useState<'230V_1PH_2W' | '230V_3PH_3W' | '400V_230V_3PH_4W'>('400V_230V_3PH_4W');
  const [loadType, setLoadType] = useState<'3PH' | '1PH_LN' | '1PH_LL'>('3PH');
  const [inputType, setInputType] = useState<'VA' | 'P'>('VA');
  const [inputValue, setInputValue] = useState<string>('5000');
  const [powerFactor, setPowerFactor] = useState<string>('0.85');
  const [copied, setCopied] = useState<boolean>(false);

  // Synchronize appropriate load type options when system change
  const handleSystemChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value as any;
    setSystem(val);
    if (val === '230V_1PH_2W') {
      setLoadType('1PH_LN');
    } else if (val === '230V_3PH_3W') {
      setLoadType('3PH');
    } else if (val === '400V_230V_3PH_4W') {
      setLoadType('3PH');
    }
  };

  // Perform Calculation and Substitution Formatting
  const getCalculationSummary = () => {
    const sVal = parseFloat(inputValue) || 0;
    const pfVal = parseFloat(powerFactor) || 1.0;
    
    let is3Phase = false;
    let voltage = 230;
    let approachIdentified = "";
    let formulaSelected = "";
    let stepSubstitution = "";
    let intermediateStep = "";
    let calculatedCurrent = 0;

    // 1. Systems & Configurations mapping
    if (system === '230V_1PH_2W') {
      voltage = 230;
      is3Phase = false;
      approachIdentified = "SYSTEM: 230V, 1PH, 2W\nLOAD TYPE: Single-Phase\nAPPROACH: Line-to-Line / Line-to-Neutral (230V Reference)";
      
      if (inputType === 'P') {
        formulaSelected = "I = P / (V * PF)";
        calculatedCurrent = sVal / (voltage * pfVal);
        stepSubstitution = `I = ${sVal} / (230 * ${pfVal})`;
        intermediateStep = `I = ${sVal} / ${(230 * pfVal).toFixed(2)}`;
      } else {
        formulaSelected = "I = VA / V";
        calculatedCurrent = sVal / voltage;
        stepSubstitution = `I = ${sVal} / 230`;
        intermediateStep = `I = ${(sVal / 230).toFixed(4)}`;
      }
    } 
    else if (system === '230V_3PH_3W') {
      if (loadType === '3PH') {
        voltage = 230;
        is3Phase = true;
        approachIdentified = "SYSTEM: 230V, 3PH, 3W\nLOAD TYPE: 3-Phase\nAPPROACH: Line-to-Line (230V)";
        
        if (inputType === 'P') {
          formulaSelected = "I = P / (1.732 * V * PF)";
          calculatedCurrent = sVal / (1.732 * voltage * pfVal);
          stepSubstitution = `I = ${sVal} / (1.732 * 230 * ${pfVal})`;
          intermediateStep = `I = ${sVal} / ${(1.732 * 230 * pfVal).toFixed(2)}`;
        } else {
          formulaSelected = "I = VA / (1.732 * V)";
          calculatedCurrent = sVal / (1.732 * voltage);
          stepSubstitution = `I = ${sVal} / (1.732 * 230)`;
          intermediateStep = `I = ${sVal} / 398.36`;
        }
      } else {
        // Single Phase load from 230V 3PH system
        voltage = 230;
        is3Phase = false;
        approachIdentified = "SYSTEM: 230V, 3PH, 3W\nLOAD TYPE: Single-Phase (Tapped from 3-Phase System)\nAPPROACH: Line-to-Line (230V)";
        
        if (inputType === 'P') {
          formulaSelected = "I = P / (230 * PF)";
          calculatedCurrent = sVal / (voltage * pfVal);
          stepSubstitution = `I = ${sVal} / (230 * ${pfVal})`;
          intermediateStep = `I = ${sVal} / ${(230 * pfVal).toFixed(2)}`;
        } else {
          formulaSelected = "I = VA / 230";
          calculatedCurrent = sVal / voltage;
          stepSubstitution = `I = ${sVal} / 230`;
          intermediateStep = `I = ${(sVal / 230).toFixed(4)}`;
        }
      }
    } 
    else if (system === '400V_230V_3PH_4W') {
      if (loadType === '3PH') {
        voltage = 400;
        is3Phase = true;
        approachIdentified = "SYSTEM: 400V/230V, 3PH, 4W\nLOAD TYPE: 3-Phase\nAPPROACH: Line-to-Line (400V)";
        
        if (inputType === 'P') {
          formulaSelected = "I = P / (1.732 * V * PF)";
          calculatedCurrent = sVal / (1.732 * voltage * pfVal);
          stepSubstitution = `I = ${sVal} / (1.732 * 400 * ${pfVal})`;
          intermediateStep = `I = ${sVal} / ${(1.732 * 400 * pfVal).toFixed(2)}`;
        } else {
          formulaSelected = "I = VA / (1.732 * V)";
          calculatedCurrent = sVal / (1.732 * voltage);
          stepSubstitution = `I = ${sVal} / (1.732 * 400)`;
          intermediateStep = `I = ${sVal} / 692.80`;
        }
      } else if (loadType === '1PH_LN') {
        voltage = 230;
        is3Phase = false;
        approachIdentified = "SYSTEM: 400V/230V, 3PH, 4W\nLOAD TYPE: Single-Phase (Line-to-Neutral)\nAPPROACH: Line-to-Neutral (230V)";
        
        if (inputType === 'P') {
          formulaSelected = "I = P / (V * PF)";
          calculatedCurrent = sVal / (voltage * pfVal);
          stepSubstitution = `I = ${sVal} / (230 * ${pfVal})`;
          intermediateStep = `I = ${sVal} / ${(230 * pfVal).toFixed(2)}`;
        } else {
          formulaSelected = "I = VA / V";
          calculatedCurrent = sVal / voltage;
          stepSubstitution = `I = ${sVal} / 230`;
          intermediateStep = `I = ${(sVal / 230).toFixed(4)}`;
        }
      } else {
        voltage = 400;
        is3Phase = false;
        approachIdentified = "SYSTEM: 400V/230V, 3PH, 4W\nLOAD TYPE: Single-Phase (Line-to-Line)\nAPPROACH: Line-to-Line (400V)";
        
        if (inputType === 'P') {
          formulaSelected = "I = P / (V * PF)";
          calculatedCurrent = sVal / (voltage * pfVal);
          stepSubstitution = `I = ${sVal} / (400 * ${pfVal})`;
          intermediateStep = `I = ${sVal} / ${(400 * pfVal).toFixed(2)}`;
        } else {
          formulaSelected = "I = VA / V";
          calculatedCurrent = sVal / voltage;
          stepSubstitution = `I = ${sVal} / 400`;
          intermediateStep = `I = ${(sVal / 400).toFixed(4)}`;
        }
      }
    }

    const reportText = `================================================================
PEC COMPLIANT ELECTRICAL CURRENT CALCULATION
================================================================
[1] IDENTIFICATION APPROACH:
----------------------------------------------------------------
${approachIdentified}

[2] FORMULA SELECTION:
----------------------------------------------------------------
Selected Equation:  ${formulaSelected}

[3] STEP-BY-STEP SUBSTITUTION:
----------------------------------------------------------------
Given Load Value:   ${sVal} ${inputType === 'P' ? 'Watts (P)' : 'Volt-Amperes (VA)'}
System Voltage (V): ${voltage}V
Power Factor (PF):  ${inputType === 'P' ? pfVal.toFixed(2) : 'N/A (Calculated using VA direct)'}

Substitution:
   1.  ${formulaSelected}
   2.  ${stepSubstitution}
   3.  ${intermediateStep}
   4.  I = ${calculatedCurrent.toFixed(4)} Amperes

[4] FINAL ROUNDED VALUE:
----------------------------------------------------------------
Calculated Current = ${calculatedCurrent.toFixed(2)} Amperes`;

    return {
      reportText,
      current: calculatedCurrent,
      is3Phase,
      voltage,
      approachIdentified,
      formulaSelected,
      stepSubstitution,
      intermediateStep
    };
  };

  const results = getCalculationSummary();

  const handleCopy = () => {
    navigator.clipboard.writeText(results.reportText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div id="pec-load-calculator" className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4 mb-6">
        <div className="flex items-center gap-2">
          <Calculator className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          <h3 className="font-extrabold text-slate-800 dark:text-slate-100 uppercase text-sm tracking-wider">
            PEC Current Calculation & Substitution Verifier
          </h3>
        </div>
        <span className="text-[10px] font-black text-slate-400 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700 px-2 py-0.5 rounded-md uppercase">
          PEC 2017 Part 1
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Input Parameters Box */}
        <div className="space-y-6">
          <div className="space-y-4">
            <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block">Input Parameters</span>
            
            {/* System select */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400">System Configuration</label>
              <select 
                value={system} 
                onChange={handleSystemChange} 
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-100 font-medium focus:outline-none focus:border-indigo-500 dark:focus:border-indigo-400 transition"
              >
                <option value="230V_1PH_2W">230V, 1PH, 2W (1-Phase System)</option>
                <option value="230V_3PH_3W">230V, 3PH, 3W (3-Phase Delta)</option>
                <option value="400V_230V_3PH_4W">400V/230V, 3PH, 4W (3-Phase Wye)</option>
              </select>
            </div>

            {/* Load type select */}
            {system !== '230V_1PH_2W' && (
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400">Connected Load Type</label>
                <select 
                  value={loadType} 
                  onChange={(e) => setLoadType(e.target.value as any)} 
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-100 font-medium focus:outline-none focus:border-indigo-500 dark:focus:border-indigo-400 transition"
                >
                  {system === '230V_3PH_3W' && (
                    <>
                      <option value="3PH">3-Phase Load (230V Line-to-Line)</option>
                      <option value="1PH_LL">Single-Phase Load (230V Tapped)</option>
                    </>
                  )}
                  {system === '400V_230V_3PH_4W' && (
                    <>
                      <option value="3PH">3-Phase Load (400V Line-to-Line)</option>
                      <option value="1PH_LN">Single-Phase Load (230V Line-to-Neutral)</option>
                      <option value="1PH_LL">Single-Phase Load (400V Line-to-Line)</option>
                    </>
                  )}
                </select>
              </div>
            )}

            {/* Input quantity type */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400">Specify Load value in:</label>
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-6">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer">
                  <input 
                    type="radio" 
                    name="input_calc_type" 
                    checked={inputType === 'VA'} 
                    onChange={() => setInputType('VA')} 
                    className="accent-indigo-600 shrink-0"
                  />
                  Volt-Amperes (VA) [Direct Load Capacity]
                </label>
                <label className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer">
                  <input 
                    type="radio" 
                    name="input_calc_type" 
                    checked={inputType === 'P'} 
                    onChange={() => setInputType('P')} 
                    className="accent-indigo-600"
                  />
                  Watts (P) [Real Power, PF required]
                </label>
              </div>
            </div>

            {/* Value slider or Text Box */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400">
                  {inputType === 'VA' ? 'Apparent Power S (VA)' : 'Real Power P (Watts)'}
                </label>
                <input 
                  type="number" 
                  value={inputValue} 
                  onChange={(e) => setInputValue(e.target.value)} 
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg font-mono text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                  placeholder="e.g. 5000"
                />
              </div>

              {inputType === 'P' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400">Power Factor (PF)</label>
                  <input 
                    type="number" 
                    step="0.01" 
                    min="0.1" 
                    max="1.0" 
                    value={powerFactor} 
                    onChange={(e) => setPowerFactor(e.target.value)} 
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg font-mono text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                    placeholder="0.85"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Quick Technical standards rules help container */}
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4 border border-slate-100 dark:border-slate-800 space-y-3">
            <h4 className="text-[11px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5" /> Reference standard formula guides
            </h4>
            <div className="space-y-3.5 text-[11px] leading-loose text-slate-600 dark:text-slate-400">
              <p>• <strong>1PH Formula (230V):</strong> Loads tapped L-N or L-L, calculated as <span className="inline-block font-mono bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 mx-1">I = VA / 230</span>.</p>
              <p>• <strong>3PH 3W System (230V L-L):</strong> Three-phase balanced loops use <span className="inline-block font-mono bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 mx-1">I = VA / (1.732 * 230)</span>. Single-phase tapped loops use 230V 1-phase formula.</p>
              <p>• <strong>3PH 4W System (400V L-L, 230V L-N):</strong> Three-phase loads use <span className="inline-block font-mono bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 mx-1">I = VA / (1.732 * 400)</span>. Single-phase general wye loads use <span className="inline-block font-mono bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 mx-1">I = VA / 230</span>.</p>
            </div>
          </div>
        </div>

        {/* Output Engineering Verification Report */}
        <div className="flex flex-col h-full justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block">ENGINEERING CALCULATION REPORT OUT</span>
              <button 
                onClick={handleCopy}
                className="flex items-center gap-1 text-[11px] font-black text-indigo-600 dark:text-indigo-400 hover:underline px-2 py-1 bg-indigo-50 dark:bg-indigo-950/30 rounded"
              >
                {copied ? (
                  <>
                    <CheckCircle className="w-3 h-3" /> Copied!
                  </>
                ) : (
                  <>
                    <Clipboard className="w-3 h-3" /> Copy Output
                  </>
                )}
              </button>
            </div>
            
            <pre className="w-full bg-slate-950 text-slate-200 p-4 rounded-2xl font-mono text-xs overflow-x-auto border border-slate-800 shadow-inner h-[280px] leading-relaxed select-all">
              {results.reportText}
            </pre>
          </div>

          <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300 rounded-2xl flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-[10px] uppercase font-black tracking-wider block text-emerald-600 dark:text-emerald-400">PRECISION ROUNDED LOAD</span>
              <h4 className="text-xl font-black font-mono">
                {results.current.toFixed(2)} Amperes
              </h4>
            </div>
            <div className="p-2.5 bg-emerald-500 text-white rounded-xl shadow-lg">
              <CheckCircle className="w-5 h-5" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
