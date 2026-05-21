import React, { useState, useMemo } from 'react';
import { Lightbulb, Maximize, Target, Calculator, Link, Square, CheckCircle2, X, List } from 'lucide-react';
import { IlluminationParams, Circuit, MCBType, LoadType } from '../types';
import { RECOMMENDED_LUX_LEVELS, LIGHT_FIXTURES_LIBRARY } from '../constants';
import Illumination3DModel from './Illumination3DModel';

export interface IlluminationCalcProps {
  circuits?: Circuit[];
  setCircuits?: React.Dispatch<React.SetStateAction<Circuit[]>>;
  setActiveTab?: (tab: 'schedule' | 'isc' | 'vd' | 'lighting') => void;
  params: IlluminationParams;
  setParams: React.Dispatch<React.SetStateAction<IlluminationParams>>;
}

export default function IlluminationCalc({ circuits, setCircuits, setActiveTab, params, setParams }: IlluminationCalcProps) {
  const [showFixtureModal, setShowFixtureModal] = useState(false);
  const calculation = useMemo(() => {
    const area = params.inputMode === 'area' ? params.userArea : params.roomWidth * params.roomLength;
    // Formula: N = (E * A) / (F * CU * MF)
    const totalLumensRequired = (params.targetLux * area) / (params.coefficientOfUtilization * params.maintenanceFactor);
    const fixturesNeeded = Math.ceil(totalLumensRequired / params.lumensPerFixture);

    return {
      area: area.toFixed(2),
      fixtures: fixturesNeeded,
      totalLumens: Math.round(totalLumensRequired)
    };
  }, [params]);

  // Derived properties
  const mountingHeight = params.mountingHeight !== undefined ? params.mountingHeight : params.ceilingHeight - params.workingPlaneHeight;

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

  const renderFloorPlan = () => {
    const { fixtures } = calculation;
    if (fixtures <= 0) return null;

    let cols = Math.ceil(Math.sqrt(fixtures));
    let rows = Math.ceil(fixtures / cols);

    // If using dimensions, adjust ratio
    if (params.inputMode === 'dimensions' && params.roomWidth > 0 && params.roomLength > 0) {
      const ratio = params.roomWidth / params.roomLength;
      cols = Math.max(1, Math.round(Math.sqrt(fixtures * ratio)));
      rows = Math.ceil(fixtures / cols);
    }
    
    const isDimensions = params.inputMode === 'dimensions' && params.roomLength > 0 && params.roomWidth > 0;
    const ratio = isDimensions ? params.roomWidth / params.roomLength : 1;
    
    // We want the floor plan to fit within a bounded height (e.g. 400px) while maintaining responsive width.
    const gridStyle = {
      display: 'grid',
      gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
      gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
      gap: 'min(2vw, 1rem)',
      padding: 'min(4vw, 2rem)',
      width: '100%',
      maxWidth: `min(100%, calc(400px * ${ratio}))`,
      aspectRatio: isDimensions ? `${params.roomWidth} / ${params.roomLength}` : '1 / 1',
      margin: '0 auto',
      backgroundColor: '#f8fafc',
      border: '4px solid #cbd5e1',
      borderRadius: '0.5rem',
      position: 'relative' as const,
      boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.05)'
    };

    const fixturesArray = Array.from({ length: fixtures }, (_, i) => i);

    return (
      <div className="mt-8 flex flex-col items-center">
        <h4 className="text-xl font-bold text-slate-800 mb-2">Automated Floor Plan</h4>
        <p className="text-sm font-bold text-slate-500 mb-6">Showing suggested distribution of {fixtures} fixtures</p>
        <div style={gridStyle}>
           {params.inputMode === 'dimensions' && (
              <>
                 <div className="absolute -top-8 left-1/2 -translate-x-1/2 text-xs font-black text-slate-400 uppercase tracking-widest">{params.roomWidth}m (Width)</div>
                 <div className="absolute top-1/2 -left-12 -translate-y-1/2 -rotate-90 text-xs font-black text-slate-400 uppercase tracking-widest">{params.roomLength}m (Length)</div>
              </>
           )}
           {params.inputMode === 'area' && (
              <div className="absolute -top-8 left-1/2 -translate-x-1/2 text-xs font-black text-slate-400 uppercase tracking-widest">{Number(calculation.area)}m² (Total Area)</div>
           )}
          {fixturesArray.map((_, i) => (
            <div key={i} className="flex items-center justify-center relative group">
               <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-yellow-100 border-2 border-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.4)] flex items-center justify-center transition-all duration-300 group-hover:scale-110 group-hover:bg-yellow-200">
                 <Lightbulb className="w-4 h-4 md:w-5 md:h-5 text-yellow-600" />
               </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="w-full max-w-full space-y-6">
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 no-print">
        <div className="flex items-center justify-between mb-6">
           <div className="flex items-center gap-2">
             <Lightbulb className="w-5 h-5 text-yellow-500" />
             <h2 className="text-lg font-bold text-slate-800">Illumination Parameters</h2>
           </div>
           
           {/* Global input mode toggle */}
           <div className="flex p-1 bg-slate-100 rounded-lg">
             <button title="Dimensions Mode" onClick={() => setParams({...params, inputMode: 'dimensions'})} className={`px-4 py-1.5 text-xs font-bold uppercase tracking-wider rounded-md transition-all ${params.inputMode === 'dimensions' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>Dimensions</button>
             <button title="Area Mode" onClick={() => setParams({...params, inputMode: 'area'})} className={`px-4 py-1.5 text-xs font-bold uppercase tracking-wider rounded-md transition-all ${params.inputMode === 'area' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>Total Area</button>
           </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">             {params.inputMode === 'dimensions' ? (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Width (m)</label>
                  <input type="number" value={params.roomWidth} onChange={e => setParams({...params, roomWidth: parseFloat(e.target.value)})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Length (m)</label>
                  <input type="number" value={params.roomLength} onChange={e => setParams({...params, roomLength: parseFloat(e.target.value)})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm" />
                </div>
              </>
             ) : (
              <div className="space-y-1.5 md:col-span-2">
                 <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Total Area (m²)</label>
                 <input type="number" value={params.userArea} onChange={e => setParams({...params, userArea: parseFloat(e.target.value)})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm" />
              </div>
             )}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Mounting Ht (m)</label>
              <input type="number" value={mountingHeight} onChange={e => setParams({...params, mountingHeight: parseFloat(e.target.value)})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm" />
            </div>
            <div className="space-y-1.5 md:col-span-1">
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

        <div className="mb-10 no-print flex flex-col md:flex-row gap-4 items-end">
          <div className="flex-1">
            <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Selected Fixture</h4>
            {(() => {
              const selectedFixture = LIGHT_FIXTURES_LIBRARY.find(f => f.id === params.selectedFixtureId) || LIGHT_FIXTURES_LIBRARY[0];
              return (
                <div className="flex items-center gap-4 bg-slate-50 border border-slate-200 p-4 rounded-xl">
                  <div className="w-16 h-16 bg-white rounded-lg border border-slate-200 overflow-hidden shrink-0">
                    <img src={selectedFixture.imageUrl} alt={selectedFixture.model} className="w-full h-full object-cover mix-blend-multiply" crossOrigin="anonymous" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-0.5">{selectedFixture.brand}</p>
                    <p className="font-bold text-slate-800 truncate mb-1">{selectedFixture.model}</p>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded">{selectedFixture.lumens} lm</span>
                      <span className="text-xs font-medium text-slate-500">{selectedFixture.wattage}W</span>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
          <button 
            onClick={() => setShowFixtureModal(true)} 
            className="flex items-center justify-center gap-2 px-6 py-4 bg-indigo-50 border-2 border-dashed border-indigo-200 rounded-xl text-indigo-600 hover:border-indigo-600 hover:bg-indigo-100 transition-all font-bold h-[98px]"
          >
            <List className="w-5 h-5" /> Browse Fixture Library
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-6">
            {params.inputMode === 'dimensions' ? (
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
            ) : (
               <div className="space-y-1.5">
                 <label className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1"><Square className="w-3 h-3" /> Area (m²)</label>
                 <input type="number" value={params.userArea} onChange={e => setParams({...params, userArea: parseFloat(e.target.value)})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm" />
               </div>
            )}
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

          <div className="flex flex-col justify-center items-center bg-slate-900 rounded-2xl p-8 text-white shadow-xl h-full">
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
        
        {renderFloorPlan()}

        {params.inputMode === 'dimensions' && params.roomWidth > 0 && params.roomLength > 0 && (
          <Illumination3DModel 
            width={params.roomWidth} 
            length={params.roomLength} 
            height={mountingHeight} 
            fixtures={calculation.fixtures} 
            lumens={params.lumensPerFixture} 
          />
        )}

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
            <p className="mb-2">{params.inputMode === 'dimensions' ? 'The total area of the room is calculated using length and width.' : 'The total area of the room is inputted directly.'}</p>
            <div className="bg-slate-50 p-4 rounded-lg font-mono text-xs border border-slate-200">
              Area (m²) = {params.inputMode === 'dimensions' ? 'Length (m) × Width (m)' : 'User Input Area'}
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
              <span>Required Lux: {params.targetLux} Lux</span>
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

      {/* Fixture Selection Modal */}
      {showFixtureModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10 rounded-t-2xl">
              <div>
                <h3 className="text-xl font-black text-slate-800">Fixture Library</h3>
                <p className="text-sm font-medium text-slate-500">Select a fixture to use in your calculation.</p>
              </div>
              <button 
                onClick={() => setShowFixtureModal(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {LIGHT_FIXTURES_LIBRARY.map((fixture) => (
                  <button
                    key={fixture.id}
                    onClick={() => {
                      setParams({ ...params, selectedFixtureId: fixture.id, lumensPerFixture: fixture.lumens });
                      setShowFixtureModal(false);
                    }}
                    className={`relative flex flex-col items-center text-left border rounded-xl overflow-hidden transition-all group ${
                      params.selectedFixtureId === fixture.id ? 'border-yellow-400 ring-2 ring-yellow-400/50 scale-[1.02] shadow-md z-10' : 'border-slate-200 hover:border-slate-300 hover:shadow-md'
                    }`}
                  >
                    {params.selectedFixtureId === fixture.id && (
                      <div className="absolute top-2 right-2 bg-white rounded-full z-10 shadow-sm">
                        <CheckCircle2 className="w-5 h-5 text-yellow-500" />
                      </div>
                    )}
                    <div className="w-full h-32 bg-slate-100 relative">
                      <img src={fixture.imageUrl} alt={fixture.model} className="w-full h-full object-cover mix-blend-multiply opacity-80 group-hover:opacity-100 transition-opacity" crossOrigin="anonymous" />
                    </div>
                    <div className="p-4 w-full bg-white border-t border-slate-100">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider truncate mb-1">{fixture.brand}</p>
                      <p className="text-sm font-bold text-slate-800 leading-tight mb-3 truncate" title={fixture.model}>{fixture.model}</p>
                      <div className="flex items-center justify-between mt-auto">
                        <span className="text-xs font-bold text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded">{fixture.lumens} lm</span>
                        <span className="text-xs font-medium text-slate-500">{fixture.wattage}W</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
