import React, { useState, useMemo } from 'react';
import { Lightbulb, Maximize, Target, Calculator, Link } from 'lucide-react';
import { IlluminationParams, Circuit, MCBType, LoadType } from '../types';
import { RECOMMENDED_LUX_LEVELS } from '../constants';

export interface IlluminationCalcProps {
  circuits?: Circuit[];
  setCircuits?: React.Dispatch<React.SetStateAction<Circuit[]>>;
  setActiveTab?: (tab: 'schedule' | 'isc' | 'vd' | 'lighting') => void;
}

export default function IlluminationCalc({ circuits, setCircuits, setActiveTab }: IlluminationCalcProps) {
  const [params, setParams] = useState<IlluminationParams>({
    roomWidth: 4,
    roomLength: 5,
    ceilingHeight: 2.7,
    workingPlaneHeight: 0.75,
    targetLux: 300,
    lumensPerFixture: 1800,
    coefficientOfUtilization: 0.6,
    maintenanceFactor: 0.8
  });

  const calculation = useMemo(() => {
    const area = params.roomWidth * params.roomLength;
    // Formula: N = (E * A) / (F * CU * MF)
    const totalLumensRequired = (params.targetLux * area) / (params.coefficientOfUtilization * params.maintenanceFactor);
    const fixturesNeeded = Math.ceil(totalLumensRequired / params.lumensPerFixture);

    return {
      area: area.toFixed(1),
      fixtures: fixturesNeeded,
      totalLumens: Math.round(totalLumensRequired)
    };
  }, [params]);

  const handleAddToSchedule = () => {
    if (!setCircuits || !circuits || !setActiveTab) return;
    const newNo = circuits.length > 0 ? Math.max(...circuits.map(c => c.circuitNo)) + 1 : 1;
    const roomName = Object.entries(RECOMMENDED_LUX_LEVELS).find(([n, lux]) => lux === params.targetLux)?.[0] || 'ROOM';
    
    // Estimate LED wattage at approx 100 lumens/watt
    const estimatedWattage = Math.ceil(params.lumensPerFixture / 100);
    const totalVA = estimatedWattage * calculation.fixtures;
    
    const newCircuit: Circuit = {
      id: crypto.randomUUID(),
      circuitNo: newNo,
      description: `LIGHTING - ${roomName}`,
      wattage: estimatedWattage,
      quantity: calculation.fixtures,
      loadVA: totalVA,
      voltage: 230,
      phases: ['R'],
      loadA: totalVA / 230, // Assuming 230V, load Schedule will recalculate this but we set initial
      mcbAT: 15,
      mcbAF: 50,
      mcbP: 1,
      mcbKAIC: 10,
      mcbType: MCBType.BOLT_ON,
      wireSize: '2.0',
      wireType: 'THHN',
      groundSize: '2.0',
      conduitSize: '15mm',
      conduitType: 'PVC',
      loadType: LoadType.LIGHTING
    };

    setCircuits([...circuits, newCircuit]);
    setActiveTab('schedule');
  };

  return (
    <div className="w-full max-w-full space-y-6">
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 no-print">
        <div className="flex items-center gap-2 mb-6">
          <Lightbulb className="w-5 h-5 text-yellow-500" />
          <h2 className="text-lg font-bold text-slate-800">Illumination Parameters</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Width (m)</label>
              <input type="number" value={params.roomWidth} onChange={e => setParams({...params, roomWidth: parseFloat(e.target.value)})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Length (m)</label>
              <input type="number" value={params.roomLength} onChange={e => setParams({...params, roomLength: parseFloat(e.target.value)})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Target Lux</label>
              <select value={params.targetLux} onChange={e => setParams({...params, targetLux: parseInt(e.target.value)})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm">
                {Object.entries(RECOMMENDED_LUX_LEVELS).map(([name, lux]) => (
                  <option key={name} value={lux}>{name}</option>
                ))}
              </select>
            </div>
        </div>
      </section>

      <section id="illumination-diagram" className="bg-white rounded-2xl border border-slate-200 shadow-xl p-8 panel-container">
        <div className="w-full border-b border-slate-100 pb-4 mb-8">
           <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Lighting Design Report</h3>
           <p className="text-[10px] text-slate-400 font-bold">LUMEN METHOD CALCULATION</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1"><Maximize className="w-3 h-3" /> Width (m)</label>
                <input type="number" value={params.roomWidth} onChange={e => setParams({...params, roomWidth: parseFloat(e.target.value)})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1"><Maximize className="w-3 h-3 rotate-90" /> Length (m)</label>
                <input type="number" value={params.roomLength} onChange={e => setParams({...params, roomLength: parseFloat(e.target.value)})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1"><Target className="w-3 h-3" /> Target Illumination (Lux)</label>
              <select value={params.targetLux} onChange={e => setParams({...params, targetLux: parseInt(e.target.value)})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm">
                {Object.entries(RECOMMENDED_LUX_LEVELS).map(([name, lux]) => (
                  <option key={name} value={lux}>{name} ({lux} Lux)</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Lumens per Fixture</label>
              <input type="number" value={params.lumensPerFixture} onChange={e => setParams({...params, lumensPerFixture: parseInt(e.target.value)})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm" />
            </div>
          </div>

          <div className="flex flex-col justify-center items-center bg-slate-900 rounded-2xl p-8 text-white shadow-xl">
             <span className="text-[10px] font-black uppercase text-slate-500 mb-2">Quantity Required</span>
             <p className="text-7xl font-black text-yellow-400">{calculation.fixtures}</p>
             <p className="text-xs font-bold text-slate-400 uppercase mt-2">Fixtures / Luminaires</p>
             
             <div className="w-full mt-8 pt-8 border-t border-white/10 grid grid-cols-2 gap-4 text-center">
                <div>
                   <span className="text-[10px] font-black text-slate-500 uppercase">Room Area</span>
                   <p className="text-lg font-bold">{calculation.area} m²</p>
                </div>
                <div>
                   <span className="text-[10px] font-black text-slate-500 uppercase">Total Lumens</span>
                   <p className="text-lg font-bold">{calculation.totalLumens}</p>
                </div>
             </div>
             {circuits && setCircuits && (
               <button 
                 onClick={handleAddToSchedule}
                 className="w-full mt-6 bg-yellow-400 hover:bg-yellow-500 text-yellow-900 font-bold py-3 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2"
               >
                 <Link className="w-4 h-4" /> Add to Load Schedule
               </button>
             )}
          </div>
        </div>
      </section>

      {/* Calculations & Formulas Section (Only visible during PDF export / print) */}
      <section className="hidden print-show mt-12 bg-white rounded-2xl border-2 border-slate-800 p-8">
        <div className="flex items-center gap-2 mb-6">
          <Calculator className="w-5 h-5 text-yellow-500" />
          <h2 className="text-lg font-bold text-slate-800 uppercase tracking-widest">Calculations & Formulas</h2>
        </div>
        
        <div className="space-y-6 text-sm text-slate-700">
          <div>
            <h3 className="font-bold text-slate-900 mb-2">1. Area Calculation</h3>
            <p className="mb-2">The total area of the room is calculated using length and width.</p>
            <div className="bg-slate-50 p-4 rounded-lg font-mono text-xs border border-slate-200">
              Area (m²) = Length (m) × Width (m)
            </div>
            <p className="mt-2 text-yellow-600 font-bold">Calculated Area: {calculation.area} m²</p>
          </div>

          <div>
            <h3 className="font-bold text-slate-900 mb-2">2. Total Required Lumens</h3>
            <p className="mb-2">Using the required Lux level based on the space type to calculate total lumens for the room.</p>
            <div className="bg-slate-50 p-4 rounded-lg font-mono text-xs border border-slate-200">
              Total Lumens = Unit Area (m²) × Required Lux (Illuminance)
            </div>
            <div className="mt-2 flex flex-col gap-1 text-sm font-bold">
              <span>Required Lux: {params.requiredLux} Lux</span>
              <span className="text-yellow-600">Calculated Total Lumens: {calculation.totalLumens} Lumens</span>
            </div>
          </div>

          <div>
            <h3 className="font-bold text-slate-900 mb-2">3. Required Number of Fixtures</h3>
            <p className="mb-2">Calculate the required number of lighting fixtures by dividing total required lumens by the lumens provided by each individual fixture.</p>
            <div className="bg-slate-50 p-4 rounded-lg font-mono text-xs border border-slate-200 flex flex-col gap-2">
              <span>{`Number of Fixtures = Total Lumens / Lumens per Fixture`}</span>
            </div>
            <div className="mt-2 text-yellow-600 font-bold flex flex-col gap-1">
              <span>Fixtures Required: {calculation.fixtures} Fixtures</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
