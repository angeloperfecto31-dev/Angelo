import React, { useState, useMemo } from 'react';
import { 
  Lightbulb, 
  Maximize, 
  Target, 
  Calculator, 
  Link, 
  Square, 
  CheckCircle2, 
  X, 
  List, 
  Sun, 
  Eye, 
  Activity, 
  Zap, 
  TrendingUp, 
  Shield, 
  DollarSign, 
  Calendar, 
  Clock, 
  AlertTriangle 
} from 'lucide-react';
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
  const [activeSubTab, setActiveSubTab] = useState<'3d' | 'grid' | 'daylight' | 'glare' | 'energy'>('3d');

  // Advanced DIALux evo inputs managed inside the component
  const [showFalseColor, setShowFalseColor] = useState(false);
  const [enableDaylight, setEnableDaylight] = useState(false);
  const [skyCondition, setSkyCondition] = useState<'overcast' | 'partly' | 'clear'>('partly');
  const [windowArea, setWindowArea] = useState(2.0); // m²
  const [windowDirection, setWindowDirection] = useState<'North' | 'South' | 'East' | 'West'>('North');
  const [operatingHours, setOperatingHours] = useState(10); // hours per day
  const [operatingDays, setOperatingDays] = useState(250); // days per year
  const [electricityRate, setElectricityRate] = useState(11.5); // PHP/kWh (typical Philippine rate)
  
  // Ceiling and working plane defaults
  const ceilingHeight = params.ceilingHeight || 2.7;
  const workingPlaneHeight = params.workingPlaneHeight || 0.75;
  const mountingHeight = params.mountingHeight !== undefined ? params.mountingHeight : ceilingHeight - workingPlaneHeight;

  // Primary calculations
  const calculation = useMemo(() => {
    const area = params.inputMode === 'area' ? params.userArea : params.roomWidth * params.roomLength;
    // Basic Lumen Formula: N = (E * A) / (F * CU * MF)
    const totalLumensRequired = (params.targetLux * area) / (params.coefficientOfUtilization * params.maintenanceFactor);
    const fixturesNeeded = Math.ceil(totalLumensRequired / params.lumensPerFixture);

    return {
      area: area.toFixed(2),
      fixtures: fixturesNeeded,
      totalLumens: Math.round(totalLumensRequired)
    };
  }, [params]);

  // Derived properties from Space Standard Limits (ASHRAE 90.1)
  const lpdLimitInfo = useMemo(() => {
    const roomName = Object.entries(RECOMMENDED_LUX_LEVELS).find(([_, lux]) => lux === params.targetLux)?.[0] || 'GENERAL SPACE';
    
    let limit = 6.0; // standard W/m² limit for standard spaces
    let description = 'General lighting standards';

    if (roomName.includes('OFFICE')) {
      limit = 6.0;
      description = 'ASHRAE 90.1 Office boundary (max 6.0 W/m²)';
    } else if (roomName.includes('CONFERENCE')) {
      limit = 6.5;
      description = 'ASHRAE 90.1 Conference Space boundary (max 6.5 W/m²)';
    } else if (roomName.includes('WAREHOUSE') || roomName.includes('STORAGE')) {
      limit = 3.8;
      description = 'ASHRAE 90.1 Storage / Warehouse space (max 3.8 W/m²)';
    } else if (roomName.includes('STAIRWAY') || roomName.includes('CORRIDOR')) {
      limit = 4.5;
      description = 'ASHRAE 90.1 Circulation Corridor boundary (max 4.5 W/m²)';
    } else if (roomName.includes('CLASSROOM') || roomName.includes('SCHOOL')) {
      limit = 5.4;
      description = 'ASHRAE 90.1 Education classrooms (max 5.4 W/m²)';
    } else if (roomName.includes('LOBBY') || roomName.includes('RECEPTION')) {
      limit = 7.0;
      description = 'ASHRAE 90.1 Entrance Lobbies (max 7.0 W/m²)';
    } else if (roomName.includes('TOILET') || roomName.includes('RESTROOM')) {
      limit = 4.8;
      description = 'ASHRAE 90.1 Sanitary Rooms (max 4.8 W/m²)';
    }

    return { limit, description, roomName };
  }, [params.targetLux]);

  // Generate 5x5 dynamic Measurement Grid values representing Lux distribution (DIALux calculation points)
  const luxGridData = useMemo(() => {
    const w = params.roomWidth || 4;
    const l = params.roomLength || 5;
    const h = mountingHeight || 1.95;
    const fixturesCount = calculation.fixtures;
    
    // Grid alignment
    let cols = Math.ceil(Math.sqrt(fixturesCount));
    let rows = Math.ceil(fixturesCount / cols);
    if (params.inputMode === 'dimensions') {
      const ratio = w / l;
      cols = Math.max(1, Math.round(Math.sqrt(fixturesCount * ratio)));
      rows = Math.ceil(fixturesCount / cols);
    }
    
    const fixtureCoords: {x: number, z: number}[] = [];
    if (fixturesCount > 0 && cols > 0 && rows > 0) {
      const stepX = w / cols;
      const stepZ = l / rows;
      for (let i = 0; i < fixturesCount; i++) {
        const r = Math.floor(i / cols);
        const c = i % cols;
        fixtureCoords.push({
          x: stepX / 2 + c * stepX,
          z: stepZ / 2 + r * stepZ
        });
      }
    }
    
    // Constant sky background lux based on sky condition
    const skyIllum = skyCondition === 'clear' ? 40000 : skyCondition === 'partly' ? 20000 : 8000;
    
    const grid: number[][] = [];
    let minLux = 100000;
    let maxLux = 0;
    let totalLuxSum = 0;

    for (let rIdx = 0; rIdx < 5; rIdx++) {
      const row: number[] = [];
      const z = l * (0.1 + rIdx * 0.2); // samples from 10% to 90%
      for (let cIdx = 0; cIdx < 5; cIdx++) {
        const x = w * (0.1 + cIdx * 0.2);
        
        let directLux = 0;
        fixtureCoords.forEach(fixture => {
          const distSq = (x - fixture.x)**2 + (z - fixture.z)**2 + h**2;
          // Apply lighting distribution curve (intensity modeled around 50% lumens emitted into general field)
          const intensity = (params.lumensPerFixture * params.coefficientOfUtilization * params.maintenanceFactor) / (2 * Math.PI);
          directLux += (intensity * h) / Math.pow(distSq, 1.5);
        });

        // Add Daylight Gradient if enabled
        let daylightPointLux = 0;
        if (enableDaylight) {
          // Daylight factor decreases exponentially from Window position (placed on North edge, z = 0)
          const distToWindow = z; // distance from North Wall (z = 0)
          const daylightFactorAtWall = 0.08 * (windowArea / (w * l)) * 100; // Peak Daylight factor
          const daylightFactorAtPoint = daylightFactorAtWall * Math.exp(-0.5 * distToWindow);
          daylightPointLux = (daylightFactorAtPoint * skyIllum) / 100;
        }

        const pointLux = Math.round(directLux + daylightPointLux);
        
        if (pointLux < minLux) minLux = pointLux;
        if (pointLux > maxLux) maxLux = pointLux;
        totalLuxSum += pointLux;
        row.push(pointLux);
      }
      grid.push(row);
    }

    const calculatedAvg = Math.round(totalLuxSum / 25);
    const uniformityU0 = calculatedAvg > 0 ? Number((minLux / calculatedAvg).toFixed(2)) : 0;
    const uniformityU1 = maxLux > 0 ? Number((minLux / maxLux).toFixed(2)) : 0;

    return {
      grid,
      minLux,
      maxLux,
      averageLux: calculatedAvg,
      uniformityU0,
      uniformityU1
    };
  }, [params, calculation.fixtures, mountingHeight, enableDaylight, skyCondition, windowArea]);

  // Unified Glare Rating (UGR) estimation
  const glareAnalysis = useMemo(() => {
    const fixtureCount = calculation.fixtures;
    const lumenWeight = params.lumensPerFixture / 3000;
    const areaWeight = (params.roomWidth * params.roomLength || 20) / 25;
    const hWeight = 2.0 / (mountingHeight || 2.0);

    // Simulated physically aligned UGR index for spacing and fixtures
    let ugrValue = 14 + 3.8 * Math.log10(fixtureCount + 1) + 2.5 * Math.log10(lumenWeight + 0.1) + 2.0 * (hWeight - 1);
    // Keep reasonable limits
    ugrValue = Math.max(10, Math.min(30, Number(ugrValue.toFixed(1))));

    let assessment = 'Comfortable';
    let labelColor = 'text-green-600 bg-green-50 border-green-200';
    let description = 'This spacing has highly comfortable glare levels. Acceptable for offices and reading rooms.';

    if (ugrValue < 16) {
      assessment = 'Very Low Glare (Excellent)';
      labelColor = 'text-emerald-600 bg-emerald-50 border-emerald-200';
      description = 'Extremely comfortable. Perfect for highly precise technical drawing, drafting, or operation theaters.';
    } else if (ugrValue <= 19) {
      assessment = 'Low Glare (Standard Office Compliant)';
      labelColor = 'text-green-600 bg-green-50 border-green-200';
      description = 'Meets international EN 12464-1 limits for standard computer office screens.';
    } else if (ugrValue <= 22) {
      assessment = 'Medium Glare (Industrial Workspace)';
      labelColor = 'text-yellow-600 bg-yellow-50 border-yellow-200';
      description = 'Fairly comfortable. Suited for general corridors, mechanical rooms, toilets, and assembly lines.';
    } else {
      assessment = 'High Glare (Visual Discomfort)';
      labelColor = 'text-rose-600 bg-rose-50 border-rose-250';
      description = 'Exceeds standard glare comfort boundaries. Recommended to add diffusers, choose a fixture with lower lumen output, or increase the ceiling height.';
    }

    return { value: ugrValue, assessment, labelColor, description };
  }, [calculation.fixtures, params.lumensPerFixture, params.roomWidth, params.roomLength, mountingHeight]);

  // Smart Daylight Integration Energy Savings
  const daylightSavings = useMemo(() => {
    if (!enableDaylight) {
      return {
        dimmingPotentialPercent: 0,
        energySavingPercent: 0,
        averageDaylightLux: 0
      };
    }

    const skyIllum = skyCondition === 'clear' ? 40000 : skyCondition === 'partly' ? 20000 : 8000;
    const area = params.roomWidth * params.roomLength || 20;
    // Estimated average natural daylight level falling on Working Plane
    const daylightAvgLux = Math.round((skyIllum * 0.05 * windowArea) / area);
    
    // Dimming target based on how much lux daylight fulfills relative to target
    const target = params.targetLux;
    const dimmingRatio = Math.min(0.70, daylightAvgLux / target); // maximum dim down to 30% for safety (70% savings)
    const dimmingPercent = Math.round(dimmingRatio * 100);

    return {
      dimmingPotentialPercent: dimmingPercent,
      energySavingPercent: Math.round(dimmingPercent * 0.9), // 90% efficiency of dims
      averageDaylightLux: daylightAvgLux
    };
  }, [enableDaylight, skyCondition, windowArea, params.roomWidth, params.roomLength, params.targetLux]);

  // Energy Consumption & Lighting Power Density (LPD) Audit
  const energyAudit = useMemo(() => {
    const selectedFixture = LIGHT_FIXTURES_LIBRARY.find(f => f.id === params.selectedFixtureId) || LIGHT_FIXTURES_LIBRARY[0];
    const unitWattage = selectedFixture.wattage;
    const totalPowerW = calculation.fixtures * unitWattage;
    const roomAreaNum = parseFloat(calculation.area) || 1;
    
    // Lighting Power Density
    const lpd = Number((totalPowerW / roomAreaNum).toFixed(2));
    const passLPD = lpd <= lpdLimitInfo.limit;

    // Standard annual usage calculations
    const yearlyHours = operatingHours * operatingDays;
    const annualKWhStandard = (totalPowerW * yearlyHours) / 1000;
    
    // Adjusted annual usage with smart Daylight sensors (dimming is applied during daylight hours - assume 60% of work hours can benefit from dimming)
    const daylightSavingsFactor = 1 - (daylightSavings.energySavingPercent / 100) * 0.6;
    const annualKWhOptimized = annualKWhStandard * daylightSavingsFactor;

    const annualCostStandard = annualKWhStandard * electricityRate;
    const annualCostOptimized = annualKWhOptimized * electricityRate;
    const annualSavingsCost = annualCostStandard - annualCostOptimized;

    // GHG carbon factor: ~0.535 kg CO2 per kWh grid electric (average)
    const carbonFactor = 0.535;
    const co2Standard = annualKWhStandard * carbonFactor;
    const co2Optimized = annualKWhOptimized * carbonFactor;
    const co2SavedYearly = co2Standard - co2Optimized;

    return {
      totalPowerW,
      lpd,
      passLPD,
      annualKWhStandard: Math.round(annualKWhStandard),
      annualKWhOptimized: Math.round(annualKWhOptimized),
      annualCostStandard: Math.round(annualCostStandard),
      annualCostOptimized: Math.round(annualCostOptimized),
      annualSavingsCost: Math.round(annualSavingsCost),
      co2Standard: Math.round(co2Standard),
      co2Optimized: Math.round(co2Optimized),
      co2SavedYearly: Math.round(co2SavedYearly)
    };
  }, [calculation.fixtures, calculation.area, params.selectedFixtureId, lpdLimitInfo, operatingHours, operatingDays, electricityRate, daylightSavings]);

  const handleAddToSchedule = () => {
    if (!setCircuits || !circuits || !setActiveTab) return;
    const newNo = circuits.length > 0 ? Math.max(...circuits.map(c => c.circuitNo)) + 1 : 1;
    
    // Estimate LED wattage at approx 100 lumens/watt if not specified
    const selectedFixture = LIGHT_FIXTURES_LIBRARY.find(f => f.id === params.selectedFixtureId) || LIGHT_FIXTURES_LIBRARY[0];
    const estimatedWattage = selectedFixture.wattage;
    const totalVA = estimatedWattage * calculation.fixtures;
    
    const newCircuit: Circuit = {
      id: crypto.randomUUID(),
      circuitNo: newNo,
      description: `LIGHTING - ${lpdLimitInfo.roomName}`,
      wattage: estimatedWattage,
      quantity: calculation.fixtures,
      loadVA: totalVA,
      voltage: 230,
      phases: ['R'],
      loadA: totalVA / 230,
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
    
    const gridStyle = {
      display: 'grid',
      gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
      gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
      gap: 'min(2vw, 1.25rem)',
      padding: 'min(4vw, 2.5rem)',
      width: '100%',
      maxWidth: `min(100%, calc(450px * ${ratio}))`,
      aspectRatio: isDimensions ? `${params.roomWidth} / ${params.roomLength}` : '1 / 1',
      margin: '0 auto',
      backgroundColor: '#f8fafc',
      border: '4px solid #e2e8f0',
      borderRadius: '1rem',
      position: 'relative' as const,
      boxShadow: 'inset 0 4px 15px rgba(0,0,0,0.03)'
    };

    const fixturesArray = Array.from({ length: fixtures }, (_, i) => i);

    return (
      <div className="mt-8 flex flex-col items-center">
        <h4 className="text-xl font-black text-slate-800 mb-2">Automated Luminaire Layout</h4>
        <p className="text-sm font-semibold text-slate-500 mb-6 flex items-center gap-1.5 justify-center">
          <Lightbulb className="w-4 h-4 text-amber-500" />
          Reflected Ceiling Plan (RCP) showing suggested {fixtures} fixtures
        </p>
        <div style={gridStyle}>
           {params.inputMode === 'dimensions' && (
              <>
                 <div className="absolute -top-8 left-1/2 -translate-x-1/2 text-[10px] font-black text-slate-400 uppercase tracking-widest">{params.roomWidth}m (Room Width)</div>
                 <div className="absolute top-1/2 -left-14 -translate-y-1/2 -rotate-90 text-[10px] font-black text-slate-400 uppercase tracking-widest">{params.roomLength}m (Room Length)</div>
              </>
           )}
           {params.inputMode === 'area' && (
              <div className="absolute -top-8 left-1/2 -translate-x-1/2 text-[10px] font-black text-slate-400 uppercase tracking-widest">{Number(calculation.area)}m² (Total Floor Area)</div>
           )}
          {fixturesArray.map((_, i) => (
            <div key={i} className="flex items-center justify-center relative group">
               <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-yellow-100 border-2 border-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.35)] flex items-center justify-center transition-all duration-300 group-hover:scale-110 group-hover:bg-yellow-250">
                 <Lightbulb className="w-5 h-5 md:w-6 md:h-6 text-yellow-600 animate-pulse" />
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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {params.inputMode === 'dimensions' ? (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Width (m)</label>
                  <input type="number" step="0.1" value={params.roomWidth} onChange={e => setParams({...params, roomWidth: parseFloat(e.target.value)})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Length (m)</label>
                  <input type="number" step="0.1" value={params.roomLength} onChange={e => setParams({...params, roomLength: parseFloat(e.target.value)})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm" />
                </div>
              </>
             ) : (
              <div className="space-y-1.5 md:col-span-2">
                 <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Total Area (m²)</label>
                 <input type="number" value={params.userArea} onChange={e => setParams({...params, userArea: parseFloat(e.target.value)})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm" />
              </div>
             )}
            
            <div className="space-y-1.5">
               <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Ceiling Ht (m)</label>
               <input type="number" step="0.1" value={ceilingHeight} onChange={e => setParams({...params, ceilingHeight: parseFloat(e.target.value)})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm" />
            </div>
            
            <div className="space-y-1.5">
               <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Working Plane (m)</label>
               <input type="number" step="0.05" value={workingPlaneHeight} onChange={e => setParams({...params, workingPlaneHeight: parseFloat(e.target.value)})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm" />
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Target Lux Standard</label>
              <select value={params.targetLux} onChange={e => setParams({...params, targetLux: parseInt(e.target.value)})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm">
                {Object.entries(RECOMMENDED_LUX_LEVELS).map(([name, lux]) => (
                  <option key={name} value={lux}>{name} ({lux} Lux)</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Util. Coefficient (CU)</label>
              <input type="number" min="0.1" max="1.0" step="0.05" value={params.coefficientOfUtilization} onChange={e => setParams({...params, coefficientOfUtilization: parseFloat(e.target.value)})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm" />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Maint. Factor (MF)</label>
              <input type="number" min="0.1" max="1.0" step="0.05" value={params.maintenanceFactor} onChange={e => setParams({...params, maintenanceFactor: parseFloat(e.target.value)})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm" />
            </div>
        </div>
      </section>

      <section id="illumination-diagram" className="bg-white rounded-2xl border border-slate-200 shadow-xl p-8 panel-container">
        <div className="w-full border-b border-slate-100 pb-4 mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
           <div>
              <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Lighting Design Report</h3>
              <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">LUMEN METHOD, GLARE, UNIFORMITY & DAYLIGHT AUDIT</p>
           </div>
           
           <div className="flex gap-1.5 p-1 bg-slate-100 rounded-lg self-start">
             <button title="3D Visualizer" onClick={() => setActiveSubTab('3d')} className={`px-2.5 py-1 text-xs font-bold flex items-center gap-1 rounded transition-all ${activeSubTab === '3d' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}><Maximize className="w-3.5 h-3.5" /> 3D View</button>
             <button title="Lux Grid" onClick={() => setActiveSubTab('grid')} className={`px-2.5 py-1 text-xs font-bold flex items-center gap-1 rounded transition-all ${activeSubTab === 'grid' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}><Activity className="w-3.5 h-3.5" /> Uniformity Grid</button>
             <button title="Daylight" onClick={() => setActiveSubTab('daylight')} className={`px-2.5 py-1 text-xs font-bold flex items-center gap-1 rounded transition-all ${activeSubTab === 'daylight' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}><Sun className="w-3.5 h-3.5" /> Daylight</button>
             <button title="Glare Index" onClick={() => setActiveSubTab('glare')} className={`px-2.5 py-1 text-xs font-bold flex items-center gap-1 rounded transition-all ${activeSubTab === 'glare' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}><Eye className="w-3.5 h-3.5" /> Glare (UGR)</button>
             <button title="Energy audit" onClick={() => setActiveSubTab('energy')} className={`px-2.5 py-1 text-xs font-bold flex items-center gap-1 rounded transition-all ${activeSubTab === 'energy' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}><Zap className="w-3.5 h-3.5" /> Energy & LPD</button>
           </div>
        </div>

        <div className="mb-10 no-print flex flex-col md:flex-row gap-4 items-end">
          <div className="flex-1">
            <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Selected Fixture details</h4>
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
            type="button"
            onClick={() => setShowFixtureModal(true)} 
            className="flex items-center justify-center gap-2 px-6 py-4 bg-indigo-50 border-2 border-dashed border-indigo-200 rounded-xl text-indigo-600 hover:border-indigo-600 hover:bg-indigo-100 transition-all font-bold h-[98px]"
          >
            <List className="w-5 h-5" /> Browse Fixture Library
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
          
          {/* Main lumen estimation left box */}
          <div className="md:col-span-1 space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Required Target Illuminance</label>
              <div className="bg-slate-55 border border-slate-200 px-4 py-3 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-500 font-bold uppercase block">Target Lux</span>
                  <span className="text-lg font-black text-slate-800">{params.targetLux} Lux</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 font-black uppercase block">Zone Type</span>
                  <span className="text-xs font-black text-indigo-600 tracking-tight">{lpdLimitInfo.roomName}</span>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block">Mounting Clearance (m)</label>
              <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl font-mono text-xs text-slate-600 space-y-1">
                <div className="flex justify-between"><span>Ceiling Height:</span><span className="font-bold">{ceilingHeight}m</span></div>
                <div className="flex justify-between"><span>Working Plane:</span><span className="font-bold">+{workingPlaneHeight}m</span></div>
                <div className="border-t border-slate-200 pt-1 mt-1 flex justify-between text-slate-900 font-black">
                  <span>Effective Height (H):</span>
                  <span className="text-indigo-600">{mountingHeight.toFixed(2)}m</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col justify-center items-center bg-slate-900 rounded-2xl p-6 text-white shadow-xl text-center">
               <span className="text-[10px] font-black uppercase text-slate-500 mb-2">Quantity of Luminaires</span>
               <p className="text-6xl font-black text-yellow-400">{calculation.fixtures}</p>
               <p className="text-xs font-black text-slate-400 uppercase mt-2">Fixtures Distributed</p>
               
               <div className="w-full mt-6 pt-6 border-t border-white/10 grid grid-cols-2 gap-4 text-center">
                  <div>
                     <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Est. Room Area</span>
                     <p className="text-base font-bold text-white">{calculation.area} m²</p>
                  </div>
                  <div>
                     <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Total Required Lm</span>
                     <p className="text-base font-bold text-white">{calculation.totalLumens}</p>
                  </div>
               </div>
               {circuits && setCircuits && (
                 <button 
                   type="button"
                   onClick={handleAddToSchedule}
                   className="w-full mt-6 bg-yellow-400 hover:bg-yellow-500 text-yellow-900 font-bold py-3 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 text-sm"
                 >
                   <Link className="w-4.5 h-4.5" /> Add to Load Schedule
                 </button>
               )}
            </div>
          </div>

          {/* Interactive view main column */}
          <div className="md:col-span-2 border border-slate-150 rounded-2xl p-6 bg-slate-50/50">

            {/* TAB 1: 3D Visualization */}
            {activeSubTab === '3d' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                   <div>
                     <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest block">Interactive Scene</span>
                     <span className="text-base font-extrabold text-slate-800">Room 3D CAD Representation</span>
                   </div>
                   <div className="flex items-center gap-2">
                     <span className="text-xs font-bold text-slate-600">False Color Render</span>
                     <button 
                       type="button"
                       onClick={() => setShowFalseColor(!showFalseColor)}
                       className={`w-12 h-6 rounded-full p-0.5 transition-colors duration-200 focus:outline-none ${showFalseColor ? 'bg-indigo-600' : 'bg-slate-300'}`}
                     >
                       <div className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform duration-200 ${showFalseColor ? 'translate-x-6' : 'translate-x-0'}`} />
                     </button>
                   </div>
                </div>

                {params.inputMode === 'dimensions' && params.roomWidth > 0 && params.roomLength > 0 ? (
                  <Illumination3DModel 
                    width={params.roomWidth} 
                    length={params.roomLength} 
                    height={mountingHeight} 
                    fixtures={calculation.fixtures} 
                    lumens={params.lumensPerFixture} 
                    showFalseColor={showFalseColor}
                    enableDaylight={enableDaylight}
                    windowArea={windowArea}
                    skyCondition={skyCondition}
                  />
                ) : (
                  <div className="w-full h-[320px] bg-slate-100/80 rounded-xl border border-dashed border-slate-200 flex flex-col items-center justify-center text-center p-6 mt-8">
                     <Maximize className="w-10 h-10 text-slate-300 mb-3" />
                     <p className="text-sm font-bold text-slate-600">3D Simulation requires Room Dimensions mode</p>
                     <p className="text-xs text-slate-400 max-w-xs mt-1">Please switch the input toggle above to "Dimensions" and specify the room width and length to boot standard 3D rendering.</p>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: Lux & Uniformity Grid */}
            {activeSubTab === 'grid' && (
              <div className="space-y-6">
                <div className="border-b border-slate-100 pb-3">
                   <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest block">Daylight & Luminaires Sum</span>
                   <span className="text-base font-extrabold text-slate-800">Point-by-Point Illumination (Lux Grid)</span>
                </div>

                {/* Grid container with heat map background colors */}
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                   <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 text-center">Lux values measured on working plane height (+{workingPlaneHeight}m)</p>
                   
                   <div className="grid grid-cols-5 gap-2 max-w-[340px] mx-auto text-center">
                     {luxGridData.grid.map((row, rIdx) => 
                       row.map((luxVal, cIdx) => {
                         // Determine custom Heat Cell color according to lux
                         let bgCell = 'bg-blue-50 text-blue-800';
                         if (luxVal < 100) bgCell = 'bg-blue-100/80 text-blue-900 border border-blue-200';
                         else if (luxVal < 200) bgCell = 'bg-cyan-100/90 text-cyan-950 border border-cyan-200';
                         else if (luxVal < 300) bgCell = 'bg-emerald-100/90 text-emerald-950 border border-emerald-250';
                         else if (luxVal < 500) bgCell = 'bg-yellow-100/90 text-yellow-950 border border-yellow-250';
                         else if (luxVal < 750) bgCell = 'bg-amber-100/90 text-amber-950 border border-amber-300';
                         else bgCell = 'bg-rose-100/90 text-rose-950 border border-rose-350 font-black';

                         return (
                           <div 
                             key={`cell-${rIdx}-${cIdx}`} 
                             className={`aspect-square flex items-center justify-center rounded text-[11px] font-bold shadow-sm transition-all hover:scale-105 ${bgCell}`}
                             title={`Grid node (${cIdx + 1}, ${rIdx + 1})`}
                           >
                             {luxVal}
                           </div>
                         );
                       })
                     )}
                   </div>

                   <div className="mt-8 border-t border-slate-100 pt-5 grid grid-cols-3 gap-3 text-center sm:text-left">
                     <div className="bg-slate-50 p-2.5 rounded border border-slate-150">
                       <span className="text-[9px] font-black text-slate-400 block uppercase">Min Lux</span>
                       <span className="text-lg font-black text-slate-800">{luxGridData.minLux} lx</span>
                     </div>
                     <div className="bg-slate-50 p-2.5 rounded border border-slate-150">
                       <span className="text-[9px] font-black text-slate-400 block uppercase">Max Lux</span>
                       <span className="text-lg font-black text-slate-800">{luxGridData.maxLux} lx</span>
                     </div>
                     <div className="bg-slate-50 p-2.5 rounded border border-slate-150">
                       <span className="text-[9px] font-black text-slate-400 block uppercase">Avg Calculated</span>
                       <span className="text-lg font-black text-indigo-600">{luxGridData.averageLux} lx</span>
                     </div>
                   </div>
                </div>

                {/* Compliance Report */}
                <div className="space-y-3.5">
                   <h5 className="text-xs font-black text-slate-500 uppercase tracking-wider block">Visual Quality & Uniformity metrics</h5>
                   
                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                     <div className="bg-white p-4 rounded-xl border border-slate-150 space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-bold text-slate-600 block">Overall Uniformity (U₀)</span>
                          <span className={`text-xs px-2 py-0.5 rounded font-black ${luxGridData.uniformityU0 >= 0.4 ? 'bg-green-150 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                            {luxGridData.uniformityU0 >= 0.4 ? 'Pass' : 'Low Uniformity'}
                          </span>
                        </div>
                        <p className="text-xl font-black text-slate-850">
                           {luxGridData.uniformityU0} <span className="text-xs text-slate-400 font-medium">U₀ (Target &ge; 0.40)</span>
                        </p>
                        <p className="text-[10px] text-slate-400 leading-normal">
                           U₀ = E_min / E_average. Measures how evenly light is spread. Uniform lighting promotes comfort.
                        </p>
                     </div>

                     <div className="bg-white p-4 rounded-xl border border-slate-150 space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-bold text-slate-600 block">Contrast Ratio (U₁)</span>
                          <span className={`text-xs px-2 py-0.5 rounded font-black ${luxGridData.uniformityU1 >= 0.16 ? 'bg-green-150 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                            {luxGridData.uniformityU1 >= 0.16 ? 'Pass' : 'Contrast Alert'}
                          </span>
                        </div>
                        <p className="text-xl font-black text-slate-850">
                           {luxGridData.uniformityU1} <span className="text-xs text-slate-400 font-medium">U₁ (Target &ge; 0.16)</span>
                        </p>
                        <p className="text-[10px] text-slate-400 leading-normal">
                           U₁ = E_min / E_max. Ratio between deepest shadows and peak bright spots to control eye adaption.
                        </p>
                     </div>
                   </div>
                </div>
              </div>
            )}

            {/* TAB 3: Daylight Integration */}
            {activeSubTab === 'daylight' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                   <div>
                     <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest block">Daylight harvesting simulation</span>
                     <span className="text-base font-extrabold text-slate-800">Dynamic Window Integration</span>
                   </div>
                   <button 
                     type="button"
                     onClick={() => setEnableDaylight(!enableDaylight)}
                     className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border shadow-sm transition-all focus:outline-none ${enableDaylight ? 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
                   >
                     <Sun className={`w-3.5 h-3.5 ${enableDaylight ? 'fill-current animate-pulse' : ''}`} />
                     {enableDaylight ? 'Active' : 'Enable Windows'}
                   </button>
                </div>

                {enableDaylight ? (
                  <div className="space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-white p-4 rounded-xl border border-slate-150">
                      <div className="space-y-1.5">
                         <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Window Area (m²)</label>
                         <input 
                           type="number" 
                           min="0.5" 
                           max="15" 
                           step="0.5" 
                           value={windowArea} 
                           onChange={e => setWindowArea(Math.max(0.1, parseFloat(e.target.value)))} 
                           className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-250 rounded text-xs text-slate-800 font-bold" 
                         />
                      </div>

                      <div className="space-y-1.5">
                         <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Sky Environment</label>
                         <select 
                           value={skyCondition} 
                           onChange={e => setSkyCondition(e.target.value as any)} 
                           className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-250 rounded text-xs text-slate-800 font-bold"
                         >
                           <option value="overcast">Overcast sky (8,000 Lux)</option>
                           <option value="partly">Partly Cloudy (20,000 Lux)</option>
                           <option value="clear">Sunny Clear (40,000 Lux)</option>
                         </select>
                      </div>

                      <div className="space-y-1.5">
                         <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Facade Facing</label>
                         <select 
                           value={windowDirection} 
                           onChange={e => setWindowDirection(e.target.value as any)} 
                           className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-250 rounded text-xs text-slate-800 font-bold"
                         >
                           <option value="North">North Wall</option>
                           <option value="South">South Wall</option>
                           <option value="East">East Facade</option>
                           <option value="West">West Facade</option>
                         </select>
                      </div>
                    </div>

                    <div className="bg-indigo-50 border border-indigo-150 p-5 rounded-xl space-y-4">
                      <h4 className="text-sm font-black text-indigo-900 flex items-center gap-1.5">
                        <TrendingUp className="w-4 h-4 text-indigo-600" />
                        Green Building savings estimation
                      </h4>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white p-3.5 rounded border border-indigo-100 text-center sm:text-left">
                           <span className="text-[9px] font-black text-slate-400 block uppercase">Avg Natural Light</span>
                           <span className="text-xl font-black text-indigo-700">{daylightSavings.averageDaylightLux} Lux</span>
                           <p className="text-[9px] text-slate-400 leading-normal mt-1">Direct daylight Contribution near facade.</p>
                        </div>

                        <div className="bg-white p-3.5 rounded border border-indigo-100 text-center sm:text-left">
                           <span className="text-[9px] font-black text-slate-400 block uppercase">Fixture Dim potential</span>
                           <span className="text-xl font-black text-emerald-600">-{daylightSavings.dimmingPotentialPercent}%</span>
                           <p className="text-[9px] text-slate-400 leading-normal mt-1">Recommended artificial lamp dim percentage.</p>
                        </div>
                      </div>

                      <div className="text-xs text-indigo-950 font-medium leading-relaxed bg-white/70 p-3.5 rounded border border-indigo-150/40">
                         <strong>Smart Daylight Harvesting:</strong> Integrating photo-sensor dimmers can scale down the fixture driver currents during work hours. This matches standard Leadership in Energy and Environmental Design (LEED) criteria, saving significant electricity overhead during daytime operations.
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="w-full py-12 flex flex-col items-center justify-center text-center">
                    <Sun className="w-12 h-12 text-slate-300 animate-bounce" />
                    <h4 className="text-sm font-black text-slate-700 mt-4">Daylight harvesting is turned off</h4>
                    <p className="text-xs text-slate-400 max-w-xs mt-1">Activate daylight integration to inject a window frame mesh on the North wall, simulate daylight factors, sky lux metrics, and harvest electric energy savings.</p>
                  </div>
                )}
              </div>
            )}

            {/* TAB 4: Glare Evaluation (UGR) */}
            {activeSubTab === 'glare' && (
              <div className="space-y-6">
                <div className="border-b border-slate-100 pb-3">
                   <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest block">Visual Comfort Standard</span>
                   <span className="text-base font-extrabold text-slate-800">Unified Glare Rating (UGR Analysis)</span>
                </div>

                <div className="flex flex-col sm:flex-row gap-5 items-center bg-white p-5 rounded-xl border border-slate-150 shadow-sm">
                   <div className="w-24 h-24 rounded-full border-4 border-slate-150 flex flex-col items-center justify-center shrink-0 shadow-inner bg-slate-50 select-none">
                     <span className="text-slate-400 text-[9px] uppercase font-black">UGR value</span>
                     <span className="text-2xl font-black text-slate-800">{glareAnalysis.value}</span>
                   </div>
                   <div className="space-y-1.5 flex-1 text-center sm:text-left">
                     <span className={`inline-block px-2.5 py-0.5 rounded text-xs font-black border uppercase tracking-wider ${glareAnalysis.labelColor}`}>
                       {glareAnalysis.assessment}
                     </span>
                     <p className="text-xs text-slate-600 leading-relaxed font-semibold">
                       {glareAnalysis.description}
                     </p>
                   </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-150">
                  <h5 className="text-xs font-bold text-slate-700 mb-3 flex items-center gap-1"><Shield className="w-3.5 h-3.5 text-indigo-500" /> Standard Unified Glare Rating (UGR) limits</h5>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px] text-slate-600 text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-150 text-slate-400">
                          <th className="py-2.5 font-bold uppercase">Space Type</th>
                          <th className="py-2.5 font-bold uppercase text-center">UGR limit</th>
                          <th className="py-2.5 font-bold uppercase text-right">Current conformance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        <tr>
                          <td className="py-2.5 font-medium">Fine Technical Drafting / Surgery</td>
                          <td className="py-2.5 text-center font-bold">&le; 16</td>
                          <td className="py-2.5 text-right font-black">{glareAnalysis.value <= 16 ? <span className="text-green-600">Complies</span> : <span className="text-slate-400">-</span>}</td>
                        </tr>
                        <tr>
                          <td className="py-2.5 font-medium">General Computer Office / Reading</td>
                          <td className="py-2.5 text-center font-bold">&le; 19</td>
                          <td className="py-2.5 text-right font-black">{glareAnalysis.value <= 19 ? <span className="text-green-600">Complies</span> : <span className="text-slate-400">-</span>}</td>
                        </tr>
                        <tr>
                          <td className="py-2.5 font-medium">Classrooms / School boards</td>
                          <td className="py-2.5 text-center font-bold">&le; 19</td>
                          <td className="py-2.5 text-right font-black">{glareAnalysis.value <= 19 ? <span className="text-green-600">Complies</span> : <span className="text-slate-400">-</span>}</td>
                        </tr>
                        <tr>
                          <td className="py-2.5 font-medium">General Assembly Lines / Factories</td>
                          <td className="py-2.5 text-center font-bold">&le; 22</td>
                          <td className="py-2.5 text-right font-black">{glareAnalysis.value <= 22 ? <span className="text-amber-600">Acceptable</span> : <span className="text-slate-400">-</span>}</td>
                        </tr>
                        <tr>
                          <td className="py-2.5 font-medium">Corridors, Washrooms & Storage areas</td>
                          <td className="py-2.5 text-center font-bold">&le; 25</td>
                          <td className="py-2.5 text-right font-black">{glareAnalysis.value <= 25 ? <span className="text-green-600">Complies</span> : <span className="text-rose-600 font-bold">Uncomfortable</span>}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 5: Energy, LPD & Carbon Audit */}
            {activeSubTab === 'energy' && (
              <div className="space-y-6">
                <div className="border-b border-slate-100 pb-3">
                   <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest block">Building conservation code</span>
                   <span className="text-base font-extrabold text-slate-800">Energy & LPD Evaluation</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* LPD panel */}
                  <div className="bg-white p-4 rounded-xl border border-slate-150 space-y-1">
                     <div className="flex justify-between items-center">
                       <span className="text-xs font-bold text-slate-600 block">Lighting Power Density (LPD)</span>
                       <span className={`text-[10px] px-2 py-0.5 rounded font-black border ${energyAudit.passLPD ? 'bg-green-55 text-green-700 border-green-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                         {energyAudit.passLPD ? 'ASHRAE Compliant' : 'Exceeds limit'}
                       </span>
                     </div>
                     <p className="text-2xl font-black text-slate-850">
                        {energyAudit.lpd} <span className="text-xs font-medium text-slate-400">W/m²</span>
                     </p>
                     <p className="text-[9px] text-slate-400 leading-normal" title={lpdLimitInfo.description}>
                        Allowed Limit: &le; {lpdLimitInfo.limit} W/m² code standard based on target lux setting.
                     </p>
                  </div>

                  {/* Operational Settings panel */}
                  <div className="bg-white p-3.5 rounded-xl border border-slate-150 flex flex-col justify-between">
                     <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Operating Parameters</span>
                     <div className="grid grid-cols-2 gap-2 mt-2">
                       <div className="space-y-1">
                         <span className="text-[9px] font-bold text-slate-500 flex items-center gap-0.5"><Clock className="w-3 h-3 text-slate-450" /> Hours/Day</span>
                         <input type="number" value={operatingHours} onChange={e => setOperatingHours(Math.max(1, parseInt(e.target.value)))} className="w-full h-7 px-2 bg-slate-50 border border-slate-200 rounded text-xs font-bold text-slate-700" />
                       </div>
                       <div className="space-y-1">
                         <span className="text-[9px] font-bold text-slate-500 flex items-center gap-0.5"><Calendar className="w-3 h-3 text-slate-450" /> Days/Year</span>
                         <input type="number" value={operatingDays} onChange={e => setOperatingDays(Math.max(1, parseInt(e.target.value)))} className="w-full h-7 px-2 bg-slate-50 border border-slate-200 rounded text-xs font-bold text-slate-700" />
                       </div>
                     </div>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-150 space-y-4">
                  <h4 className="text-xs font-black text-slate-700 flex items-center gap-1 border-b border-slate-100 pb-2">
                     <DollarSign className="w-4 h-4 text-emerald-500" />
                     Annual Energy Consumption & Financing Projection
                  </h4>

                  <div className="grid grid-cols-3 gap-3 text-center sm:text-left">
                    <div className="bg-slate-50 p-2.5 rounded border border-slate-150">
                      <span className="text-[9px] font-black text-slate-400 block uppercase">Standard usage</span>
                      <span className="text-base font-black text-slate-700">{energyAudit.annualKWhStandard} kWh</span>
                    </div>
                    <div className="bg-slate-50 p-2.5 rounded border border-slate-150">
                      <span className="text-[9px] font-black text-slate-400 block uppercase">Standard Cost</span>
                      <span className="text-base font-black text-slate-700">₱{energyAudit.annualCostStandard.toLocaleString()}</span>
                    </div>
                    <div className="bg-indigo-50/50 p-2.5 rounded border border-indigo-100">
                      <span className="text-[9px] font-black text-indigo-400 block uppercase">Daylight Dimmed</span>
                      <span className="text-base font-black text-indigo-700">₱{energyAudit.annualCostOptimized.toLocaleString()}</span>
                    </div>
                  </div>

                  {enableDaylight && (
                    <div className="bg-emerald-50 border border-emerald-150 px-3.5 py-2.5 rounded-lg flex items-center justify-between text-xs text-emerald-900 font-bold">
                       <span className="flex items-center gap-1.5"><Zap className="w-4 h-4 text-emerald-600 animate-pulse" /> Smart sensors optimized saving</span>
                       <span className="font-extrabold text-emerald-700">₱{energyAudit.annualSavingsCost.toLocaleString()} / year saved</span>
                    </div>
                  )}

                  <div className="pt-2 flex justify-between items-center text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                     <span>Total Electrical connected load</span>
                     <span className="text-slate-800">{energyAudit.totalPowerW} Watts</span>
                  </div>
                  
                  {/* Greenhouse gas emission equivalent */}
                  <div className="border-t border-slate-100 pt-3 flex flex-col sm:flex-row items-center justify-between gap-2">
                     <span className="text-xs text-slate-600 flex items-center gap-1 font-semibold">
                       <AlertTriangle className="w-4 h-4 text-indigo-500" />
                       Annual carbon footprint equivalent:
                     </span>
                     <span className="font-bold text-slate-800 text-xs text-right">
                       {enableDaylight ? (
                         <span>
                           <strong className="text-emerald-600">{energyAudit.co2Optimized} kg CO₂</strong>
                           <span className="text-slate-400"> (Reduced {energyAudit.co2SavedYearly} kg CO₂ / year!)</span>
                         </span>
                       ) : (
                         <strong className="text-slate-700">{energyAudit.co2Standard} kg CO₂ / year</strong>
                       )}
                     </span>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
        
        {renderFloorPlan()}

        {/* Calculations & Formulas Section (Only visible during PDF export / print) */}
        <section className="hidden print-show mt-12 bg-white rounded-2xl border-2 border-slate-800 p-8">
          <div className="flex items-center gap-2 mb-6">
            <Calculator className="w-5 h-5 text-yellow-500" />
            <h2 className="text-lg font-bold text-slate-800 uppercase tracking-widest">Calculations & Formulas REFERENCE</h2>
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
                type="button"
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
                    type="button"
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
