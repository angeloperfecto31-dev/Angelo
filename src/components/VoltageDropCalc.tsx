import React, { useState, useMemo, useEffect } from 'react';
import { Ruler, Zap, AlertTriangle, Calculator, Link, Plus, Trash2, CheckCircle2 } from 'lucide-react';
import { VoltageDropCalculation, Circuit, PanelConfig, LoadType } from '../types';
import { WIRE_IMPEDANCE_TABLE, WIRE_AMPACITY_TABLE, STANDARD_CB_RATINGS } from '../constants';

export interface VoltageDropCalcProps {
  panel?: PanelConfig;
  circuits?: Circuit[];
  calculations: VoltageDropCalculation[];
  setCalculations: React.Dispatch<React.SetStateAction<VoltageDropCalculation[]>>;
}

export default function VoltageDropCalc({ panel, circuits, calculations, setCalculations }: VoltageDropCalcProps) {
  const [source, setSource] = useState<string>('custom');
  const [newLength, setNewLength] = useState<number>(30);

  useEffect(() => {
    if (!circuits || !panel || calculations.length === 0) return;
    
    setCalculations(prev => {
      let changed = false;
      const next = prev.map(calc => {
        if (calc.source === 'main') {
          // Recalculate main properly per PEC 2017 demand logic
          const is3PH = panel.system.includes('3PH');
          let phaseVAs = { R: 0, Y: 0, B: 0 };
          let motorVAs: number[] = [];
          let lightingReceptacleVA = 0;

          circuits.forEach(c => {
             const perPhaseVA = c.loadVA / c.phases.length;
             const isMotor = c.loadType === LoadType.AIR_CON || c.loadType === LoadType.MOTOR;
             
             c.phases.forEach(p => {
               if (p === 'R') { phaseVAs.R += perPhaseVA; }
               if (p === 'Y') { phaseVAs.Y += perPhaseVA; }
               if (p === 'B') { phaseVAs.B += perPhaseVA; }
             });

             if (isMotor) {
                motorVAs.push(c.loadVA);
             } else {
                lightingReceptacleVA += c.loadVA;
             }
          });

          // Step 1: Demand Factors for General Lighting & Receptacles
          let lightingReceptacleDemand = lightingReceptacleVA;
          if (lightingReceptacleVA > 120000) {
            lightingReceptacleDemand = 3000 * 1.0 + (120000 - 3000) * 0.35 + (lightingReceptacleVA - 120000) * 0.25;
          } else if (lightingReceptacleVA > 3000) {
            lightingReceptacleDemand = 3000 * 1.0 + (lightingReceptacleVA - 3000) * 0.35;
          }

          // Step 2: Motor Loads 
          const largestMotor = motorVAs.length > 0 ? Math.max(...motorVAs) : 0;
          
          let maxDesignAmp = 0;
          let maxBaseAmp = 0;

          if (is3PH) {
            const highestPhaseBaseVA = Math.max(phaseVAs.R, phaseVAs.Y, phaseVAs.B);
            const effectiveTotalBaseVA = highestPhaseBaseVA * 3;
            const factor = panel.voltage * Math.sqrt(3);
            maxBaseAmp = effectiveTotalBaseVA / factor;

            const totalMotorDemandVA = motorVAs.reduce((a, b) => a + b, 0) + (largestMotor * 0.25);
            const totalNetComputedVA = lightingReceptacleDemand + totalMotorDemandVA;
            const unbalanceRatio = motorVAs.length + lightingReceptacleVA > 0 ? (effectiveTotalBaseVA / (motorVAs.reduce((a, b) => a + b, 0) + lightingReceptacleVA)) : 1;
            
            maxDesignAmp = (totalNetComputedVA * Math.max(1, unbalanceRatio)) / factor;
          } else {
            const totalMotorDemandVA = motorVAs.reduce((a, b) => a + b, 0) + (largestMotor * 0.25);
            const totalNetComputedVA = lightingReceptacleDemand + totalMotorDemandVA;
            const totalBaseVA = lightingReceptacleVA + motorVAs.reduce((a,b) => a+b, 0);

            maxBaseAmp = totalBaseVA / panel.voltage;
            maxDesignAmp = totalNetComputedVA / panel.voltage;
          }

          const designAmp = maxDesignAmp;
          const maxBranchAT = Math.max(0, ...circuits.map(c => c.mcbAT));
          const calculatedCb = STANDARD_CB_RATINGS.find(r => r >= designAmp) || 100;
          const cb = panel.mainBreakerAT || Math.max(calculatedCb, STANDARD_CB_RATINGS.find(r => r >= maxBranchAT) || calculatedCb, 30);
          
          let minSize = 2.0;
          if (cb > 15 && cb <= 20) minSize = 3.5;
          else if (cb > 20 && cb <= 30) minSize = 5.5;
          const requiredAmpacity = Math.max(designAmp, cb);
          const wire = WIRE_AMPACITY_TABLE.find(w => w.ampacity >= requiredAmpacity && w.size >= minSize) || WIRE_AMPACITY_TABLE[WIRE_AMPACITY_TABLE.length - 1];
          
          const newLoadA = Number(maxBaseAmp.toFixed(2));
          const newWireSize = wire.size.toString();
          const newVoltage = panel.voltage;
          const newSystemType: '1PH' | '3PH' = is3PH ? '3PH' : '1PH';
          
          if (calc.loadA !== newLoadA || calc.wireSize !== newWireSize || calc.voltage !== newVoltage || calc.systemType !== newSystemType) {
            changed = true;
            return {
              ...calc,
              loadA: newLoadA,
              wireSize: newWireSize,
              voltage: newVoltage,
              systemType: newSystemType
            };
          }
        } else if (calc.source !== 'custom') {
          // It's a circuit
          const c = circuits.find(c => c.id === calc.source);
          if (c) {
            const newName = `Circuit ${c.circuitNo}: ${c.description}`;
            const newSystemType: '1PH' | '3PH' = c.phases.length > 2 ? '3PH' : '1PH';
            if (calc.loadA !== c.loadA || calc.wireSize !== c.wireSize || calc.voltage !== c.voltage || calc.name !== newName || calc.systemType !== newSystemType) {
              changed = true;
              return {
                ...calc,
                name: newName,
                loadA: c.loadA,
                wireSize: c.wireSize,
                voltage: c.voltage,
                systemType: newSystemType
              };
            }
          }
        }
        return calc;
      });
      return changed ? next : prev;
    });
  }, [circuits, panel, setCalculations]);

  const calculateVDAndCompliance = (calc: VoltageDropCalculation) => {
    const data = WIRE_IMPEDANCE_TABLE[calc.wireSize] || WIRE_IMPEDANCE_TABLE['3.5'];
    const R = data.r;
    const factor = calc.systemType === '3PH' ? Math.sqrt(3) : 2;
    const vd = (factor * calc.length * calc.loadA * R) / 1000;
    const vdPercentage = (vd / calc.voltage) * 100;
    
    return {
      vd: vd.toFixed(2),
      vdPercentage: vdPercentage.toFixed(2),
      isCompliant: vdPercentage <= 3.0
    };
  };

  const activeCalculations = useMemo(() => {
    return calculations.map(c => ({
      ...c,
      result: calculateVDAndCompliance(c)
    }));
  }, [calculations]);

  const handleAddCalculation = () => {
    if (source === 'custom') {
      const newCalc: VoltageDropCalculation = {
        id: crypto.randomUUID(),
        source: 'custom',
        name: 'Custom Circuit ' + (calculations.length + 1),
        loadA: 20,
        length: newLength,
        wireSize: '3.5',
        voltage: 230,
        systemType: '1PH'
      };
      setCalculations([...calculations, newCalc]);
    } else if (source === 'main' && panel && circuits) {
      const totalVA = circuits.reduce((sum, c) => sum + c.loadVA, 0);
      const is3PH = panel.system.includes('3PH');
      const mainCurrent = is3PH ? (totalVA) / (panel.voltage * Math.sqrt(3)) : (totalVA) / panel.voltage;
      const designAmp = mainCurrent * 1.25;
      const cb = panel.mainBreakerAT || STANDARD_CB_RATINGS.find(r => r >= designAmp) || 100;
      
      let minSize = 2.0;
      if (cb > 15 && cb <= 20) minSize = 3.5;
      else if (cb > 20 && cb <= 30) minSize = 5.5;
      const requiredAmpacity = Math.max(designAmp, cb);
      const wire = WIRE_AMPACITY_TABLE.find(w => w.ampacity >= requiredAmpacity && w.size >= minSize) || WIRE_AMPACITY_TABLE[WIRE_AMPACITY_TABLE.length - 1];
      
      const newCalc: VoltageDropCalculation = {
        id: crypto.randomUUID(),
        source: 'main',
        name: 'Main Feeder',
        loadA: Number(mainCurrent.toFixed(2)),
        length: newLength,
        wireSize: wire.size.toString(),
        voltage: panel.voltage,
        systemType: is3PH ? '3PH' : '1PH'
      };
      setCalculations([...calculations, newCalc]);
    } else if (circuits) {
      const c = circuits.find(c => c.id === source);
      if (c) {
        const newCalc: VoltageDropCalculation = {
          id: crypto.randomUUID(),
          source: c.id,
          name: `Circuit ${c.circuitNo}: ${c.description}`,
          loadA: c.loadA,
          length: newLength,
          wireSize: c.wireSize,
          voltage: c.voltage,
          systemType: c.phases.length > 2 ? '3PH' : '1PH'
        };
        setCalculations([...calculations, newCalc]);
      }
    }
    setSource('custom');
    setNewLength(30);
  };

  const handleUpdateCalculation = (id: string, updates: Partial<VoltageDropCalculation>) => {
    setCalculations(calculations.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const handleRemoveCalculation = (id: string) => {
    setCalculations(calculations.filter(c => c.id !== id));
  };

  const worstCase = useMemo(() => {
    if (activeCalculations.length === 0) return null;
    return activeCalculations.reduce((prev, current) => {
      return (parseFloat(current.result.vdPercentage) > parseFloat(prev.result.vdPercentage)) ? current : prev;
    });
  }, [activeCalculations]);

  return (
    <div className="w-full max-w-full space-y-6">
      <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 no-print">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Ruler className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Add Circuit for Voltage Drop</h2>
          </div>
        </div>
        
        <div className="flex flex-col gap-6 lg:flex-row items-end">
          {circuits && circuits.length > 0 && (
            <div className="flex-1 space-y-1.5 p-4 bg-indigo-50/50 dark:bg-indigo-950/20 rounded-xl border border-indigo-100 dark:border-indigo-900/35">
              <label className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase flex items-center gap-1"><Link className="w-3 h-3" /> Connect to Load Schedule</label>
              <select value={source} onChange={e => setSource(e.target.value)} className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-900 rounded-lg text-sm text-indigo-900 dark:text-indigo-200 font-medium font-sans mt-2 shadow-sm focus:outline-none">
                <option value="custom" className="dark:bg-slate-900 dark:text-slate-100">Custom Circuit</option>
                <option value="main" className="dark:bg-slate-900 dark:text-slate-100">Main Feeder</option>
                <optgroup label="Branch Circuits" className="dark:bg-slate-900 dark:text-slate-100">
                  {circuits.map(c => (
                    <option key={c.id} value={c.id}>Circuit {c.circuitNo}: {c.description}</option>
                  ))}
                </optgroup>
              </select>
            </div>
          )}

          <div className="flex-1 space-y-1.5 p-4">
            <label className="text-xs font-bold text-slate-400 uppercase">Length (m)</label>
            <input type="number" value={newLength} onChange={e => setNewLength(parseFloat(e.target.value))} className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 shadow-sm shadow-slate-100 dark:shadow-none rounded-lg text-sm font-bold text-slate-900 dark:text-slate-100 focus:outline-none" />
          </div>

          <div className="flex-none p-4">
            <button 
              onClick={handleAddCalculation}
              className="flex items-center gap-2 px-6 py-2 bg-indigo-600 dark:bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition shadow-lg shadow-indigo-200/50 dark:shadow-none"
            >
              <Plus className="w-4 h-4" /> Add to List
            </button>
          </div>
        </div>
      </section>

      <section id="voltage-drop-diagram" className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-8 panel-container">
        <div className="w-full border-b-2 border-slate-100 dark:border-slate-800 pb-6 mb-8 flex justify-between items-end">
           <div>
              <h3 className="text-2xl font-black text-slate-900 dark:text-slate-100 uppercase tracking-tighter">Voltage Drop Analysis</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase">Engineering Verification</p>
           </div>
           <p className="text-xs text-slate-400 font-mono">Ver: 1.0.3</p>
        </div>

        {worstCase && (
          <div className={`mb-8 p-6 rounded-2xl border-2 flex flex-col md:flex-row items-center justify-between transition-colors ${worstCase.result.isCompliant ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900/40 text-green-800 dark:text-green-300' : 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/40 text-red-800 dark:text-red-300'}`}>
            <div className="flex flex-col mb-4 md:mb-0">
               <span className={`text-[10px] font-black uppercase mb-1 ${worstCase.result.isCompliant ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>Worst Case Scenario</span>
               <h4 className="text-xl font-bold text-slate-900 dark:text-slate-100">{worstCase.name}</h4>
               <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Length: {worstCase.length}m | Load: {worstCase.loadA}A | Wire: {worstCase.wireSize}mm²</p>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-center">
                <p className="text-xs text-slate-400 uppercase font-black">Actual VD</p>
                <p className="text-2xl font-bold text-slate-700 dark:text-slate-200">{worstCase.result.vd} Volts</p>
              </div>
              <div className={`text-center ${worstCase.result.isCompliant ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
                <span className="text-[10px] font-black uppercase mb-1">VD (%)</span>
                <p className="text-5xl font-black">{worstCase.result.vdPercentage}%</p>
              </div>
              <div className="mt-2 flex items-center gap-2 font-bold text-sm">
                {worstCase.result.isCompliant ? (
                  <CheckCircle2 className="w-8 h-8 text-green-500" />
                ) : (
                  <AlertTriangle className="w-8 h-8 text-red-500" />
                )}
              </div>
            </div>
          </div>
        )}

        <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 font-bold">
                <th className="p-3">Circuit / Designation</th>
                <th className="p-3 w-24">Length (m)</th>
                <th className="p-3 w-20">Load (A)</th>
                <th className="p-3 w-24">Wire (mm²)</th>
                <th className="p-3 w-20">System</th>
                <th className="p-3 w-20">VD (V)</th>
                <th className="p-3 w-20">VD (%)</th>
                <th className="p-3 w-20 text-center">Status</th>
                <th className="p-3 w-10 no-print"></th>
              </tr>
            </thead>
            <tbody>
              {activeCalculations.map((c) => (
                <tr key={c.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors last:border-0 font-medium">
                  <td className="p-3 text-slate-900 dark:text-slate-100 border-r border-slate-50 dark:border-slate-800">
                    <input value={c.name} onChange={e => handleUpdateCalculation(c.id, { name: e.target.value })} className="w-full bg-transparent outline-none border-b border-transparent focus:border-slate-300 text-slate-900 dark:text-slate-100 font-medium" />
                  </td>
                  <td className="p-3 border-r border-slate-50 dark:border-slate-800">
                    <input 
                       type="number" 
                       value={c.length} 
                       onChange={e => handleUpdateCalculation(c.id, { length: parseFloat(e.target.value) || 0 })} 
                       className="w-full bg-transparent outline-none font-bold text-indigo-700 dark:text-indigo-400 bg-indigo-50/30 dark:bg-indigo-950/20 px-2 py-1 rounded" 
                    />
                  </td>
                  <td className="p-3">
                    <input 
                       type="number" 
                       readOnly={c.source !== 'custom'}
                       value={c.loadA} 
                       onChange={e => handleUpdateCalculation(c.id, { loadA: parseFloat(e.target.value) || 0 })} 
                        className={`w-full bg-transparent outline-none px-2 py-1 rounded text-slate-900 dark:text-slate-100 ${c.source === 'custom' ? 'focus:bg-slate-200 hover:bg-slate-200 dark:focus:bg-slate-800 dark:hover:bg-slate-800' : ''}`} 
                    />
                  </td>
                  <td className="p-3">
                     {c.source === 'custom' ? (
                        <select value={c.wireSize} onChange={e => handleUpdateCalculation(c.id, { wireSize: e.target.value })} className="bg-transparent outline-none max-w-full text-slate-900 dark:text-slate-100 dark:bg-slate-900">
                           {Object.keys(WIRE_IMPEDANCE_TABLE).map(s => <option key={s} value={s} className="dark:bg-slate-900 dark:text-slate-100">{s}</option>)}
                        </select>
                     ) : (
                        <span className="text-slate-900 dark:text-slate-100">{c.wireSize}</span>
                     )}
                  </td>
                  <td className="p-3">
                     {c.source === 'custom' ? (
                        <select value={c.systemType} onChange={e => handleUpdateCalculation(c.id, { systemType: e.target.value as any })} className="bg-transparent outline-none text-slate-900 dark:text-slate-100 dark:bg-slate-900">
                           <option value="1PH" className="dark:bg-slate-900 dark:text-slate-100">1Ф</option>
                           <option value="3PH" className="dark:bg-slate-900 dark:text-slate-100">3Ф</option>
                        </select>
                     ) : (
                        <span className="text-slate-900 dark:text-slate-100">{c.systemType}</span>
                     )}
                  </td>
                  <td className="p-3 text-slate-600 dark:text-slate-400">{c.result.vd}V</td>
                  <td className={`p-3 font-bold ${c.result.isCompliant ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{c.result.vdPercentage}%</td>
                  <td className="p-3 flex justify-center">
                    {c.result.isCompliant ? (
                       <Zap className="w-5 h-5 text-green-500" />
                    ) : (
                       <AlertTriangle className="w-5 h-5 text-red-500" />
                    )}
                  </td>
                  <td className="p-3 no-print">
                    <button onClick={() => handleRemoveCalculation(c.id)} className="p-1 hover:bg-red-100 dark:hover:bg-red-950/60 text-slate-400 hover:text-red-600 rounded transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {activeCalculations.length === 0 && (
                <tr>
                   <td colSpan={9} className="p-8 text-center text-slate-400 font-medium italic">
                      No circuits added to the calculation list. Select a source and click "Add to List".
                   </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Render SLDs for each calculation outside of the main table section so we can grab them individually if needed */}
      <div className="space-y-6">
         {activeCalculations.map(calc => (
            <section key={calc.id} id={`vd-diagram-${calc.id}`} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-8 panel-container">
               <h4 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-10 text-center uppercase tracking-wider">{calc.name}</h4>
               
               <div className="flex items-center justify-between mx-auto max-w-3xl relative mt-4 mb-4">
                 {/* Source */}
                  <div className="flex flex-col items-center z-10 w-32">
                       <div className="w-16 h-16 rounded-full border-[5px] border-indigo-600 flex items-center justify-center bg-white dark:bg-slate-800 z-10 shadow-[0_0_15px_rgba(79,70,229,0.3)]">
                          <Zap className="w-8 h-8 text-indigo-600" />
                       </div>
                       <div className="text-center mt-4">
                          <span className="font-black text-slate-900 dark:text-slate-100 block uppercase tracking-wider">Source</span>
                          <span className="text-sm font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded inline-block mt-1">{calc.voltage}V {calc.systemType}</span>
                       </div>
                  </div>

                  {/* Feeder/Wire */}
                  <div className="flex-1 h-3 bg-indigo-100 dark:bg-indigo-950/40 relative flex items-center justify-center -mx-4 z-0">
                     <div className="absolute -top-14 text-center w-full flex flex-col items-center gap-1">
                       <span className="font-bold text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-800 px-3 py-1 rounded-full border border-slate-200 dark:border-slate-700 shadow-sm">L = {calc.length} m</span>
                       <span className="text-xs font-bold text-slate-500 dark:text-slate-400">{calc.wireSize} mm² THHN/THWN</span>
                       <div className={`text-xs font-black px-2 py-0.5 rounded ${calc.result.isCompliant ? 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400'}`}>
                          VD: {calc.result.vd}V ({calc.result.vdPercentage}%)
                       </div>
                     </div>
                     {/* Triangle arrow representing current flow */}
                     <div className="w-4 h-4 border-t-[8px] border-t-transparent border-l-[12px] border-l-indigo-300 border-b-[8px] border-b-transparent"></div>
                  </div>

                  {/* Load */}
                  <div className="flex flex-col items-center z-10 w-32">
                       <div className="w-16 h-16 border-[5px] border-slate-700 dark:border-slate-600 flex items-center justify-center bg-white dark:bg-slate-800 z-10 shadow-[0_0_15px_rgba(51,65,85,0.2)]">
                          <span className="font-black text-slate-700 dark:text-slate-300 text-sm tracking-widest">LOAD</span>
                       </div>
                       <div className="text-center mt-4">
                          <span className="font-black text-slate-900 dark:text-slate-100 block uppercase tracking-wider">Current</span>
                          <span className="text-sm font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded inline-block mt-1">{calc.loadA} A</span>
                       </div>
                  </div>
               </div>
            </section>
         ))}
      </div>

      {/* Calculations & Formulas Section */}
      <section className="hidden print-show mt-12 bg-white rounded-2xl border-2 border-slate-800 p-8">
        <div className="flex items-center gap-2 mb-6">
          <Calculator className="w-5 h-5 text-indigo-600" />
          <h2 className="text-lg font-bold text-slate-800 uppercase tracking-widest">Calculations & Formulas</h2>
        </div>
        
        <div className="space-y-6 text-sm text-slate-700">
          <div>
            <h3 className="font-bold text-slate-900 mb-2">1. Resistance of Wire (R)</h3>
            <p className="mb-2">The resistance depends on the conductor material (Copper = 1.724 × 10^-8 Ω·m) and length, converted for standard NEC/PEC calculations using specific resistance K (K = 3.56 for Copper in ohms per km/mm²).</p>
            <div className="bg-slate-50 p-4 rounded-lg font-mono text-xs border border-slate-200">
              R = K / Area (mm²)
            </div>
          </div>

          <div>
            <h3 className="font-bold text-slate-900 mb-2">2. Single-Phase vs Three-Phase Voltage Drop</h3>
            <p className="mb-2">The voltage drop equation compensates for single-phase (2 wires) or three-phase (√3) system parameters in accordance with PEC.</p>
            <div className="bg-slate-50 p-4 rounded-lg font-mono text-xs border border-slate-200 flex flex-col gap-2">
              <span>{`VD (1-Phase) = (2 × K × I × L) / Area`}</span>
              <span>{`VD (3-Phase) = (√3 × K × I × L) / Area`}</span>
            </div>
          </div>

          <div>
            <h3 className="font-bold text-slate-900 mb-2">3. Voltage Drop Percentage</h3>
            <p className="mb-2">Article 2.10.2.1(A) FPN No. 4 of the Philippine Electrical Code (PEC) 2017 recommends that the maximum voltage drop for branch circuits does not exceed 3%, and the total voltage drop for feeders and branch circuits does not exceed 5%.</p>
            <div className="bg-slate-50 p-4 rounded-lg font-mono text-xs border border-slate-200 flex flex-col gap-2">
              <span>{`VD (%) = (Actual Voltage Drop / Source Voltage) × 100`}</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
