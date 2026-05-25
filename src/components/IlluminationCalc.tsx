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
  AlertTriangle,
  Trash2,
  Plus
} from 'lucide-react';
import { IlluminationParams, Circuit, MCBType, LoadType } from '../types';
import { RECOMMENDED_LUX_LEVELS, RECOMMENDED_LUX_LEVELS_CATEGORIZED, LIGHT_FIXTURES_LIBRARY } from '../constants';
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

  // Active fixture model derived from selection or manual input
  const activeFixture = useMemo(() => {
    if (params.isCustomFixture) {
      const curL = params.customLumens !== undefined ? params.customLumens : 1500;
      const curW = params.customWattage !== undefined ? params.customWattage : 15;
      return {
        id: 'custom',
        category: 'Custom',
        lightType: params.customLightType || 'Custom Fixture',
        wattageRange: `${curW}W`,
        lumensRange: `${curL} lm`,
        brands: 'Manual Intake Spec',
        wattage: curW,
        lumens: curL
      };
    }
    return LIGHT_FIXTURES_LIBRARY.find(f => f.id === params.selectedFixtureId) || LIGHT_FIXTURES_LIBRARY[0];
  }, [params.isCustomFixture, params.selectedFixtureId, params.customLightType, params.customWattage, params.customLumens]);

  // Primary calculations
  const calculation = useMemo(() => {
    const area = params.inputMode === 'area' ? params.userArea : params.roomWidth * params.roomLength;
    
    // Calculate Room Index to adjust CU dynamically based on ceiling height
    let effectiveCU = params.coefficientOfUtilization;
    if (params.inputMode === 'dimensions' && params.roomWidth > 0 && params.roomLength > 0) {
      const hrc = Math.max(0.1, (params.ceilingHeight || 2.7) - (params.workingPlaneHeight || 0.75));
      const roomIndex = (params.roomWidth * params.roomLength) / (hrc * (params.roomWidth + params.roomLength));
      
      // Standardize the User's CU entry against a typical Room Index of 2.0
      // This scaling ensures that higher ceilings (lower Room Index) reduce CU, requiring more fixtures.
      const riFactor = roomIndex / (roomIndex + 0.5);
      const baselineRiFactor = 2.0 / 2.5; // RI of 2.0
      effectiveCU = Math.min(0.95, Math.max(0.1, params.coefficientOfUtilization * (riFactor / baselineRiFactor)));
    }

    // Basic Lumen Formula: N = (E * A) / (F * CU * MF)
    const totalLumensRequired = (params.targetLux * area) / (effectiveCU * params.maintenanceFactor);
    const fixturesNeeded = Math.ceil(totalLumensRequired / (activeFixture.lumens || 1));

    return {
      area: area.toFixed(2),
      fixtures: fixturesNeeded,
      totalLumens: Math.round(totalLumensRequired),
      effectiveCU: Number(effectiveCU.toFixed(2))
    };
  }, [params, activeFixture.lumens]);

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
          const intensity = (activeFixture.lumens * params.coefficientOfUtilization * params.maintenanceFactor) / (2 * Math.PI);
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
  }, [params, calculation.fixtures, mountingHeight, enableDaylight, skyCondition, windowArea, activeFixture.lumens]);

  // Unified Glare Rating (UGR) estimation
  const glareAnalysis = useMemo(() => {
    const fixtureCount = calculation.fixtures;
    const lumenWeight = activeFixture.lumens / 3000;
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
  }, [calculation.fixtures, activeFixture.lumens, params.roomWidth, params.roomLength, mountingHeight]);

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
  }, [calculation.fixtures, calculation.area, activeFixture, lpdLimitInfo, operatingHours, operatingDays, electricityRate, daylightSavings]);

  const handleAddToSchedule = () => {
    if (!setCircuits || !circuits) return;
    const newNo = circuits.length > 0 ? Math.max(...circuits.map(c => c.circuitNo)) + 1 : 1;
    
    // Use active fixture spec (manual/library)
    const estimatedWattage = activeFixture.wattage;
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
    
    // Add to local Saved Rooms table
    const newSavedRoom = {
      id: crypto.randomUUID(),
      circuitNo: newNo,
      roomName: lpdLimitInfo.roomName,
      targetLux: params.targetLux,
      area: Number(calculation.area),
      fixtureId: activeFixture.id,
      fixtureLightType: activeFixture.lightType,
      fixturesCount: calculation.fixtures,
      totalLumens: calculation.totalLumens,
      totalWattage: totalVA,
      fixtureWattage: activeFixture.wattage,
      fixtureLumens: activeFixture.lumens
    };
    
    setParams({
      ...params,
      savedRooms: [...(params.savedRooms || []), newSavedRoom]
    });
  };

  const updateSavedRoom = (id: string, field: string, value: any) => {
    if (!params.savedRooms) return;
    
    let updatedCircuitNo: number | undefined;
    let newWattage: number | undefined;
    let newQuantity: number | undefined;

    const newRooms = params.savedRooms.map(r => {
      if (r.id === id) {
        const updated = { ...r, [field]: value };
        if (field === 'fixturesCount') {
          const isCustom = updated.fixtureId === 'custom';
          const fixWattage = isCustom ? (updated.fixtureWattage || params.customWattage || 15) : (LIGHT_FIXTURES_LIBRARY.find(f => f.id === updated.fixtureId)?.wattage || 0);
          const fixLumens = isCustom ? (updated.fixtureLumens || params.customLumens || 1500) : (LIGHT_FIXTURES_LIBRARY.find(f => f.id === updated.fixtureId)?.lumens || 0);
          
          updated.totalWattage = fixWattage * updated.fixturesCount;
          updated.totalLumens = fixLumens * updated.fixturesCount;
          newWattage = updated.totalWattage;
          newQuantity = updated.fixturesCount;
        }
        updatedCircuitNo = updated.circuitNo;
        return updated;
      }
      return r;
    });
    setParams({ ...params, savedRooms: newRooms });

    if (updatedCircuitNo !== undefined && circuits && setCircuits && field === 'fixturesCount' && newWattage !== undefined && newQuantity !== undefined) {
      const newCircuits = circuits.map(c => {
         if (c.circuitNo === updatedCircuitNo) {
           return {
             ...c,
             quantity: newQuantity!,
             loadVA: newWattage!,
             loadA: newWattage! / c.voltage
           };
         }
         return c;
      });
      setCircuits(newCircuits);
    }
  };

  const removeSavedRoom = (id: string) => {
    if (!params.savedRooms) return;
    const roomToRemove = params.savedRooms.find(r => r.id === id);
    setParams({
      ...params,
      savedRooms: params.savedRooms.filter(r => r.id !== id)
    });
    
    // Attempt to remove from global circuits too
    if (roomToRemove && roomToRemove.circuitNo && circuits && setCircuits) {
       setCircuits(circuits.filter(c => c.circuitNo !== roomToRemove.circuitNo));
    }
  };

  return (
    <div className="w-full max-w-full space-y-6">
      <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 no-print">
        <div className="flex items-center justify-between mb-6">
           <div className="flex items-center gap-2">
             <Target className="w-5 h-5 text-indigo-600 dark:text-indigo-455" />
             <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Space Parameters</h2>
           </div>
           
           {/* Global input mode toggle */}
           <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
             <button title="Dimensions Mode" onClick={() => setParams({...params, inputMode: 'dimensions'})} className={`px-4 py-1.5 text-xs font-bold uppercase tracking-wider rounded-md transition-all ${params.inputMode === 'dimensions' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}>Dimensions</button>
             <button title="Area Mode" onClick={() => setParams({...params, inputMode: 'area'})} className={`px-4 py-1.5 text-xs font-bold uppercase tracking-wider rounded-md transition-all ${params.inputMode === 'area' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}>Total Area</button>
           </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {params.inputMode === 'dimensions' ? (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Width (m)</label>
                  <input type="number" step="0.1" value={params.roomWidth} onChange={e => setParams({...params, roomWidth: parseFloat(e.target.value)})} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-lg text-sm transition-colors focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Length (m)</label>
                  <input type="number" step="0.1" value={params.roomLength} onChange={e => setParams({...params, roomLength: parseFloat(e.target.value)})} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-lg text-sm transition-colors focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none" />
                </div>
              </>
             ) : (
              <div className="space-y-1.5 md:col-span-2">
                 <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Total Area (m²)</label>
                  <input type="number" value={params.userArea} onChange={e => setParams({...params, userArea: parseFloat(e.target.value)})} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-lg text-sm transition-colors focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none" />
              </div>
             )}
            
            <div className="space-y-1.5">
               <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Ceiling Ht (m)</label>
               <input type="number" step="0.1" value={ceilingHeight} onChange={e => setParams({...params, ceilingHeight: parseFloat(e.target.value)})} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-lg text-sm transition-colors focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none" />
            </div>
            
            <div className="space-y-1.5">
               <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Working Plane (m)</label>
               <input type="number" step="0.05" value={workingPlaneHeight} onChange={e => setParams({...params, workingPlaneHeight: parseFloat(e.target.value)})} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-lg text-sm transition-colors focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none" />
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Target Lux Standard</label>
              <select value={params.targetLux} onChange={e => setParams({...params, targetLux: parseInt(e.target.value)})} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-lg text-sm transition-colors focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none">
                {RECOMMENDED_LUX_LEVELS_CATEGORIZED && Object.entries(RECOMMENDED_LUX_LEVELS_CATEGORIZED).map(([category, items]) => (
                  <optgroup key={category} label={category} className="dark:bg-slate-900 dark:text-slate-100">
                    {items.map(item => (
                      <option key={item.name} value={item.lux} className="dark:bg-slate-900 dark:text-slate-100">{item.name} ({item.lux} Lux)</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Util. Coefficient (CU)</label>
              <input type="number" min="0.1" max="1.0" step="0.05" value={params.coefficientOfUtilization} onChange={e => setParams({...params, coefficientOfUtilization: parseFloat(e.target.value)})} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-lg text-sm transition-colors focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none" />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Maint. Factor (MF)</label>
              <input type="number" min="0.1" max="1.0" step="0.05" value={params.maintenanceFactor} onChange={e => setParams({...params, maintenanceFactor: parseFloat(e.target.value)})} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-lg text-sm transition-colors focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none" />
            </div>
        </div>
      </section>

      <section id="illumination-diagram" className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl p-8 panel-container">
        <div className="w-full border-b border-slate-100 dark:border-slate-800 pb-4 mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
           <div>
              <h3 className="text-xl font-black text-slate-900 dark:text-slate-100 uppercase tracking-tighter">Lighting Design Report</h3>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 font-black uppercase tracking-widest">LUMEN METHOD, GLARE, UNIFORMITY & DAYLIGHT AUDIT</p>
           </div>
           
           <div className="flex gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg self-start">
             <button title="3D Visualizer" onClick={() => setActiveSubTab('3d')} className={`px-2.5 py-1 text-xs font-bold flex items-center gap-1 rounded transition-all ${activeSubTab === '3d' ? 'bg-slate-900 dark:bg-slate-700 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'}`}><Maximize className="w-3.5 h-3.5" /> 3D View</button>
             <button title="Lux Grid" onClick={() => setActiveSubTab('grid')} className={`px-2.5 py-1 text-xs font-bold flex items-center gap-1 rounded transition-all ${activeSubTab === 'grid' ? 'bg-slate-900 dark:bg-slate-700 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'}`}><Activity className="w-3.5 h-3.5" /> Uniformity Grid</button>
             <button title="Daylight" onClick={() => setActiveSubTab('daylight')} className={`px-2.5 py-1 text-xs font-bold flex items-center gap-1 rounded transition-all ${activeSubTab === 'daylight' ? 'bg-slate-900 dark:bg-slate-700 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'}`}><Sun className="w-3.5 h-3.5" /> Daylight</button>
             <button title="Glare Index" onClick={() => setActiveSubTab('glare')} className={`px-2.5 py-1 text-xs font-bold flex items-center gap-1 rounded transition-all ${activeSubTab === 'glare' ? 'bg-slate-900 dark:bg-slate-700 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'}`}><Eye className="w-3.5 h-3.5" /> Glare (UGR)</button>
             <button title="Energy audit" onClick={() => setActiveSubTab('energy')} className={`px-2.5 py-1 text-xs font-bold flex items-center gap-1 rounded transition-all ${activeSubTab === 'energy' ? 'bg-slate-900 dark:bg-slate-700 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'}`}><Zap className="w-3.5 h-3.5" /> Energy & LPD</button>
           </div>
        </div>

        <div className="mb-8 no-print animate-fade-in">
          <div className="flex justify-between items-center mb-3">
            <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Selected Fixture details</h4>
            {params.isCustomFixture && (
              <button 
                type="button"
                onClick={() => setParams({ ...params, isCustomFixture: false, selectedFixtureId: 'ind-panel', lumensPerFixture: 3600 })} 
                className="text-xs font-bold text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300"
              >
                Use Library Standard
              </button>
            )}
          </div>

          <div className="flex flex-col lg:flex-row gap-4 items-stretch">
            <div className="flex-grow min-w-0 flex flex-col">
            {params.isCustomFixture ? (
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-sm space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-950/40 rounded-xl border border-indigo-100 dark:border-indigo-900 flex items-center justify-center shrink-0">
                    <Lightbulb className="w-6 h-6 text-indigo-550" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">Custom Light Specification</p>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">{params.customLightType || 'Custom Fixture'}</h4>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Light Type / Name</label>
                    <input 
                      type="text" 
                      value={params.customLightType || ''} 
                      placeholder="e.g. LED Custom Batten" 
                      onChange={e => setParams({ ...params, customLightType: e.target.value })} 
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none" 
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Lumens (lm)</label>
                    <input 
                      type="number" 
                      value={params.customLumens || ''} 
                      placeholder="e.g. 1500" 
                      onChange={e => {
                        const lumens = Math.max(0, parseInt(e.target.value) || 0);
                        setParams({ ...params, customLumens: lumens, lumensPerFixture: lumens });
                      }} 
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none" 
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Wattage (W)</label>
                    <input 
                      type="number" 
                      value={params.customWattage || ''} 
                      placeholder="e.g. 15" 
                      onChange={e => {
                        const wattage = Math.max(0, parseInt(e.target.value) || 0);
                        setParams({ ...params, customWattage: wattage });
                      }} 
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none" 
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-sm flex-grow h-full">
                <div className="w-16 h-16 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-100 dark:border-slate-800 flex items-center justify-center shrink-0">
                  <Lightbulb className="w-8 h-8 text-indigo-500 dark:text-indigo-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-black text-slate-400 dark:text-slate-550 uppercase tracking-wider mb-1">{activeFixture.category} &middot; {activeFixture.brands}</p>
                  <p className="text-lg font-bold text-slate-900 dark:text-slate-100 truncate mb-1.5">{activeFixture.lightType}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200/50 dark:border-amber-900/30 px-2.5 py-1 rounded-md">{activeFixture.lumensRange}</span>
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-350 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 px-2.5 py-1 rounded-md">{activeFixture.wattageRange}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
          <button 
            type="button"
            onClick={() => setShowFixtureModal(true)} 
            className="flex flex-col items-center justify-center gap-2 px-6 py-4 bg-indigo-50/10 dark:bg-indigo-950/20 border-2 border-dashed border-indigo-200 dark:border-indigo-900 rounded-2xl text-indigo-700 dark:text-indigo-400 hover:border-indigo-600 dark:hover:border-indigo-500 hover:bg-indigo-100/25 transition-all font-bold lg:w-[240px] shadow-sm animate-pulse-subtle shrink-0"
          >
            <List className="w-5 h-5 mb-1" /> 
            <span>Browse Fixture Library</span>
            <span className="text-[10px] text-indigo-500 dark:text-indigo-400 font-semibold">Or Select Custom Fixture</span>
          </button>
        </div>
      </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
          
          {/* Main lumen estimation left box */}
          <div className="md:col-span-1 space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Required Target Illuminance</label>
              <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 px-4 py-3 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-500 dark:text-slate-405 font-bold uppercase block">Target Lux</span>
                  <span className="text-lg font-black text-slate-800 dark:text-slate-100">{params.targetLux} Lux</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 dark:text-slate-505 font-black uppercase block">Zone Type</span>
                  <span className="text-xs font-black text-indigo-600 dark:text-indigo-400 tracking-tight">{lpdLimitInfo.roomName}</span>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block font-sans">Mounting Clearance (m)</label>
              <div className="bg-slate-5 border border-slate-200 dark:border-slate-800 p-3.5 rounded-xl font-mono text-xs text-slate-600 dark:text-slate-400 space-y-1">
                <div className="flex justify-between"><span>Ceiling Height:</span><span className="font-bold">{ceilingHeight}m</span></div>
                <div className="flex justify-between"><span>Working Plane:</span><span className="font-bold">+{workingPlaneHeight}m</span></div>
                <div className="border-t border-slate-200 dark:border-slate-750 pt-1 mt-1 flex justify-between text-slate-900 dark:text-slate-100 font-sans font-black">
                  <span>Effective Height (H):</span>
                  <span className="text-indigo-600 dark:text-indigo-400">{mountingHeight.toFixed(2)}m</span>
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
          <div className="md:col-span-2 border border-slate-200 rounded-2xl p-6 bg-slate-50/50">

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
                    ceilingHeight={ceilingHeight}
                    fixtures={calculation.fixtures} 
                    lumens={params.lumensPerFixture} 
                    showFalseColor={showFalseColor}
                    enableDaylight={enableDaylight}
                    windowArea={windowArea}
                    skyCondition={skyCondition}
                    isLpdCompliant={energyAudit.passLPD}
                    lpdValue={energyAudit.lpd}
                    lpdLimit={lpdLimitInfo.limit}
                    targetLux={params.targetLux}
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
                     <div className="bg-slate-50 p-2.5 rounded border border-slate-200">
                       <span className="text-[9px] font-black text-slate-400 block uppercase">Min Lux</span>
                       <span className="text-lg font-black text-slate-800">{luxGridData.minLux} lx</span>
                     </div>
                     <div className="bg-slate-50 p-2.5 rounded border border-slate-200">
                       <span className="text-[9px] font-black text-slate-400 block uppercase">Max Lux</span>
                       <span className="text-lg font-black text-slate-800">{luxGridData.maxLux} lx</span>
                     </div>
                     <div className="bg-slate-50 p-2.5 rounded border border-slate-200">
                       <span className="text-[9px] font-black text-slate-400 block uppercase">Avg Calculated</span>
                       <span className="text-lg font-black text-indigo-600">{luxGridData.averageLux} lx</span>
                     </div>
                   </div>
                </div>

                {/* Compliance Report */}
                <div className="space-y-3.5">
                   <h5 className="text-xs font-black text-slate-500 uppercase tracking-wider block">Visual Quality & Uniformity metrics</h5>
                   
                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                     <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-bold text-slate-600 block">Overall Uniformity (U₀)</span>
                          <span className={`text-xs px-2 py-0.5 rounded font-black ${luxGridData.uniformityU0 >= 0.4 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                            {luxGridData.uniformityU0 >= 0.4 ? 'Pass' : 'Low Uniformity'}
                          </span>
                        </div>
                        <p className="text-xl font-black text-slate-800">
                           {luxGridData.uniformityU0} <span className="text-xs text-slate-400 font-medium">U₀ (Target &ge; 0.40)</span>
                        </p>
                        <p className="text-[10px] text-slate-400 leading-normal">
                           U₀ = E_min / E_average. Measures how evenly light is spread. Uniform lighting promotes comfort.
                        </p>
                     </div>

                     <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-bold text-slate-600 block">Contrast Ratio (U₁)</span>
                          <span className={`text-xs px-2 py-0.5 rounded font-black ${luxGridData.uniformityU1 >= 0.16 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                            {luxGridData.uniformityU1 >= 0.16 ? 'Pass' : 'Contrast Alert'}
                          </span>
                        </div>
                        <p className="text-xl font-black text-slate-800">
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
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-white p-4 rounded-xl border border-slate-200">
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

                <div className="flex flex-col sm:flex-row gap-5 items-center bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                   <div className="w-24 h-24 rounded-full border-4 border-slate-200 flex flex-col items-center justify-center shrink-0 shadow-inner bg-slate-50 select-none">
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

                <div className="bg-white p-4 rounded-xl border border-slate-200">
                  <h5 className="text-xs font-bold text-slate-700 mb-3 flex items-center gap-1"><Shield className="w-3.5 h-3.5 text-indigo-500" /> Standard Unified Glare Rating (UGR) limits</h5>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px] text-slate-600 text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-400">
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
                  <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-1">
                     <div className="flex justify-between items-center">
                       <span className="text-xs font-bold text-slate-600 block">Lighting Power Density (LPD)</span>
                       <span className={`text-[10px] px-2 py-0.5 rounded font-black border ${energyAudit.passLPD ? 'bg-green-100 text-green-700 border-green-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                         {energyAudit.passLPD ? 'ASHRAE Compliant' : 'Exceeds limit'}
                       </span>
                     </div>
                     <p className="text-2xl font-black text-slate-800">
                        {energyAudit.lpd} <span className="text-xs font-medium text-slate-400">W/m²</span>
                     </p>
                     <p className="text-[9px] text-slate-400 leading-normal" title={lpdLimitInfo.description}>
                        Allowed Limit: &le; {lpdLimitInfo.limit} W/m² code standard based on target lux setting.
                     </p>
                  </div>

                  {/* Operational Settings panel */}
                  <div className="bg-white p-3.5 rounded-xl border border-slate-200 flex flex-col justify-between">
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

                <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-4">
                  <h4 className="text-xs font-black text-slate-700 flex items-center gap-1 border-b border-slate-100 pb-2">
                     <DollarSign className="w-4 h-4 text-emerald-500" />
                     Annual Energy Consumption & Financing Projection
                  </h4>

                  <div className="grid grid-cols-3 gap-3 text-center sm:text-left">
                    <div className="bg-slate-50 p-2.5 rounded border border-slate-200">
                      <span className="text-[9px] font-black text-slate-400 block uppercase">Standard usage</span>
                      <span className="text-base font-black text-slate-700">{energyAudit.annualKWhStandard} kWh</span>
                    </div>
                    <div className="bg-slate-50 p-2.5 rounded border border-slate-200">
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

      {/* Saved Lighting Details Table */}
      {params.savedRooms && params.savedRooms.length > 0 && (
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 overflow-hidden no-print">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-slate-800">Calculated Lighting Rooms</h3>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Click cell values to edit</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="text-xs uppercase bg-slate-50 text-slate-500 font-bold border-y border-slate-200">
                <tr>
                  <th className="px-4 py-3">Room / Space</th>
                  <th className="px-4 py-3">Target Lux</th>
                  <th className="px-4 py-3">Area (m²)</th>
                  <th className="px-4 py-3">Fixture Type</th>
                  <th className="px-4 py-3 text-right">No. of Fixtures</th>
                  <th className="px-4 py-3 text-right">Total Lumens</th>
                  <th className="px-4 py-3 text-right">Est. Wattage (VA)</th>
                  <th className="px-4 py-3 text-center border-l border-slate-200">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {params.savedRooms.map((room) => (
                  <tr key={room.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 font-semibold text-slate-900 border-r border-slate-100">
                      <input 
                        type="text" 
                        value={room.roomName} 
                        onChange={(e) => updateSavedRoom(room.id, 'roomName', e.target.value)}
                        className="w-full bg-transparent p-1 border border-transparent hover:border-slate-300 focus:border-indigo-500 rounded outline-none transition-colors"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input 
                        type="number" 
                        value={room.targetLux} 
                        onChange={(e) => updateSavedRoom(room.id, 'targetLux', Number(e.target.value))}
                        className="w-20 bg-transparent p-1 border border-transparent hover:border-slate-300 focus:border-indigo-500 rounded outline-none transition-colors text-slate-800 font-medium"
                      />
                    </td>
                    <td className="px-4 py-3 text-slate-500">{room.area}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs font-bold uppercase tracking-wider">{room.fixtureLightType}</td>
                    <td className="px-4 py-3 text-right">
                      <input 
                        type="number" 
                        value={room.fixturesCount} 
                        onChange={(e) => updateSavedRoom(room.id, 'fixturesCount', Number(e.target.value))}
                        className="w-16 bg-transparent p-1 border border-transparent hover:border-slate-300 focus:border-indigo-500 rounded outline-none transition-colors text-right text-indigo-600 font-bold"
                      />
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-amber-600">{room.totalLumens}</td>
                    <td className="px-4 py-3 text-right font-bold text-slate-700">{room.totalWattage}W</td>
                    <td className="px-4 py-3 text-center border-l border-slate-100">
                      <button
                        title="Remove calculation"
                        onClick={() => removeSavedRoom(room.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                      >
                        <Trash2 className="w-4 h-4 mx-auto" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

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
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Manual Specification Selection Entry */}
                <button
                  type="button"
                  onClick={() => {
                    setParams({ 
                      ...params, 
                      isCustomFixture: true, 
                      selectedFixtureId: 'custom', 
                      customLightType: params.customLightType || 'Custom LED Fixture', 
                      customLumens: params.customLumens || 1500, 
                      customWattage: params.customWattage || 15, 
                      lumensPerFixture: params.customLumens || 1500 
                    });
                    setShowFixtureModal(false);
                  }}
                  className={`relative flex flex-col focus:outline-none text-left border rounded-xl overflow-hidden transition-all group p-5 bg-gradient-to-br from-indigo-50/10 to-white hover:border-indigo-400 hover:shadow-md ${
                    params.isCustomFixture ? 'border-indigo-500 ring-2 ring-indigo-550/30 scale-[1.02] shadow-md z-10 bg-indigo-50/10' : 'border-slate-200 border-dashed hover:border-indigo-300'
                  }`}
                >
                  {params.isCustomFixture && (
                    <div className="absolute top-4 right-4 bg-white rounded-full z-10 shadow-sm p-0.5 border border-indigo-250">
                      <CheckCircle2 className="w-5 h-5 text-indigo-600" />
                    </div>
                  )}
                  <div className="w-full flex flex-col h-full">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[10px] font-black text-indigo-600 uppercase tracking-wider">Manual entry</span>
                    </div>
                    <p className="text-base font-bold text-slate-800 leading-tight mb-2">Custom Fixture Specifications</p>
                    <p className="text-xs text-slate-500 font-medium leading-relaxed mb-4">
                      No matching item in library? Manually define Light type, Lumens, and Watts parameters.
                    </p>
                    <div className="mt-auto pt-3 border-t border-slate-100 flex items-center justify-between text-indigo-700 font-bold text-xs gap-1">
                      <span>Specify manually</span>
                      <Plus className="w-4 h-4" />
                    </div>
                  </div>
                </button>

                {LIGHT_FIXTURES_LIBRARY.map((fixture) => (
                  <button
                    type="button"
                    key={fixture.id}
                    onClick={() => {
                      setParams({ ...params, selectedFixtureId: fixture.id, lumensPerFixture: fixture.lumens, isCustomFixture: false });
                      setShowFixtureModal(false);
                    }}
                    className={`relative flex flex-col focus:outline-none text-left border rounded-xl overflow-hidden transition-all group ${
                      (!params.isCustomFixture && params.selectedFixtureId === fixture.id) ? 'border-yellow-400 ring-2 ring-yellow-400/50 scale-[1.02] shadow-md z-10 bg-yellow-50/10' : 'border-slate-200 hover:border-slate-300 hover:shadow-md bg-white'
                    }`}
                  >
                    {(!params.isCustomFixture && params.selectedFixtureId === fixture.id) && (
                      <div className="absolute top-4 right-4 bg-white rounded-full z-10 shadow-sm">
                        <CheckCircle2 className="w-5 h-5 text-yellow-500" />
                      </div>
                    )}
                    <div className="p-5 w-full flex flex-col h-full">
                      <div className="flex items-center gap-2 mb-2">
                         <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">{fixture.category}</span>
                      </div>
                      <p className="text-base font-bold text-slate-800 leading-tight mb-2 truncate" title={fixture.lightType}>{fixture.lightType}</p>
                      
                      <div className="mt-auto space-y-3">
                        <div>
                          <p className="text-xs text-slate-500 font-medium truncate mb-0.5">Typical Brands</p>
                          <p className="text-[10px] text-slate-400 truncate" title={fixture.brands}>{fixture.brands}</p>
                        </div>
                        
                        <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                          <div className="flex flex-col">
                            <span className="text-[9px] text-slate-400 uppercase tracking-wider mb-0.5">Wattage</span>
                            <span className="text-xs font-bold text-slate-600">{fixture.wattageRange}</span>
                          </div>
                          <div className="flex flex-col items-end">
                            <span className="text-[9px] text-slate-400 uppercase tracking-wider mb-0.5">Lumens</span>
                            <span className="text-xs font-bold text-yellow-600">{fixture.lumensRange}</span>
                          </div>
                        </div>
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
