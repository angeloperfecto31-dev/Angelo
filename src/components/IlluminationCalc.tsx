import React, { useState, useMemo, useEffect, useRef } from 'react';
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
  Plus,
  RefreshCw,
  RotateCw,
  Grid,
  Search,
  Globe,
  Database,
  Sparkles,
  Loader2,
  Heart,
  Star,
  Upload,
  Download,
  Filter,
  PenBox,
  AlertCircle
} from 'lucide-react';
import { auth, db } from '../firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { toPng } from 'html-to-image';
import { IlluminationParams, Circuit, MCBType, LoadType, ActiveFixtureSelection, PlacedFixtureDragPosition, PanelConfig } from '../types';
import { RECOMMENDED_LUX_LEVELS, RECOMMENDED_LUX_LEVELS_CATEGORIZED, LIGHT_FIXTURES_LIBRARY } from '../constants';
import Illumination3DModel from './Illumination3DModel';

export interface IlluminationCalcProps {
  panel?: PanelConfig;
  circuits?: Circuit[];
  setCircuits?: React.Dispatch<React.SetStateAction<Circuit[]>>;
  setActiveTab?: (tab: 'schedule' | 'isc' | 'vd' | 'lighting') => void;
  activeTab?: string;
  params: IlluminationParams;
  setParams: React.Dispatch<React.SetStateAction<IlluminationParams>>;
  onSnapshotCapture?: (circuitId: string, image: string, roomName: string) => void;
  snapshots?: Record<string, string>;
}

function calcSinglePointLux(
  rx: number,
  rz: number,
  cp: { x: number; z: number; lumens?: number; fixtureId?: string; rotationDegrees?: number; y?: number },
  activeFixtures: any[] | undefined,
  coe: number,
  maintenance: number,
  mountingHeight: number,
  defaultLumens: number
): number {
  let matchingAf = activeFixtures?.find(f => f.fixtureId === cp.fixtureId);
  if (!matchingAf && activeFixtures && activeFixtures.length === 1) {
    matchingAf = activeFixtures[0];
  }
  const defaults = getPredefinedFixtureDefaults(cp.fixtureId || '', false);
  const fBeamAngle = matchingAf?.fixtureBeamAngle ?? defaults.fixtureBeamAngle;
  const fDistType = matchingAf?.fixtureDistributionType ?? defaults.fixtureDistributionType;
  const fLength = matchingAf?.fixtureLength ?? defaults.fixtureLength;

  let dx = rx - cp.x;
  let dz = rz - cp.z;

  if (cp.rotationDegrees) {
    const rad = -cp.rotationDegrees * Math.PI / 180;
    const cosR = Math.cos(rad);
    const sinR = Math.sin(rad);
    const tX = dx * cosR - dz * sinR;
    const tZ = dx * sinR + dz * cosR;
    dx = tX;
    dz = tZ;
  }

  const lum = cp.lumens ?? matchingAf?.lumens ?? defaultLumens;
  const intensity = (lum * coe * maintenance) / (2 * Math.PI);
  let ptLux = 0;

  if (fDistType === 'linear') {
    const halfL = fLength / 2;
    const zClamped = Math.max(-halfL, Math.min(halfL, dz));
    const distSq = dx*dx + (dz - zClamped)*(dz - zClamped) + mountingHeight**2;
    const dist = Math.sqrt(distSq);
    const cosTheta = mountingHeight / dist;
    const theta = Math.acos(cosTheta);
    const beamHalfAngleRad = (fBeamAngle / 2) * (Math.PI / 180);
    let factor = 0;
    if (theta <= beamHalfAngleRad) {
      factor = Math.cos((theta / beamHalfAngleRad) * (Math.PI / 2));
    }
    ptLux = ((intensity * mountingHeight) / Math.pow(distSq, 1.5)) * factor;
  } else if (fDistType === 'oblong') {
    const odx = dx * 1.6;
    const odz = dz * 0.7;
    const distSq = odx*odx + odz*odz + mountingHeight**2;
    const dist = Math.sqrt(distSq);
    const cosTheta = mountingHeight / dist;
    const theta = Math.acos(cosTheta);
    const beamHalfAngleRad = (fBeamAngle / 2) * (Math.PI / 180);
    let factor = 0;
    if (theta <= beamHalfAngleRad) {
      factor = Math.cos((theta / beamHalfAngleRad) * (Math.PI / 2));
    }
    ptLux = ((intensity * mountingHeight) / Math.pow(distSq, 1.5)) * factor;
  } else if (fDistType === 'omni') {
    const distSq = dx*dx + dz*dz + mountingHeight**2;
    const dist = Math.sqrt(distSq);
    const cosTheta = mountingHeight / dist;
    const factor = Math.cos(Math.acos(cosTheta) * 0.6);
    ptLux = ((intensity * mountingHeight) / Math.pow(distSq, 1.5)) * factor;
  } else { // conical standard
    const distSq = dx*dx + dz*dz + mountingHeight**2;
    const dist = Math.sqrt(distSq);
    const cosTheta = mountingHeight / dist;
    const theta = Math.acos(cosTheta);
    const beamHalfAngleRad = (fBeamAngle / 2) * (Math.PI / 180);
    let factor = 0;
    if (theta <= beamHalfAngleRad) {
      factor = Math.pow(Math.cos((theta / beamHalfAngleRad) * (Math.PI / 2)), 1.5);
    } else if (theta <= beamHalfAngleRad * 1.3) {
      const ratio = 1 - (theta - beamHalfAngleRad) / (beamHalfAngleRad * 0.3);
      factor = 0.08 * Math.pow(ratio, 2);
    }
    ptLux = ((intensity * mountingHeight) / Math.pow(distSq, 1.5)) * factor;
  }

  return ptLux;
}

function getPredefinedFixtureDefaults(fixtureId: string, isCustom: boolean) {
  if (isCustom || !fixtureId) {
    const idLower = (fixtureId || '').toLowerCase();
    if (idLower.includes('bulb') || idLower.includes('spot') || idLower.includes('downlight')) {
      return {
        fixtureShape: 'circular' as const,
        fixtureWidth: 0.1,
        fixtureLength: 0.1,
        fixtureDiameter: 0.12,
        fixtureThickness: 0.15,
        fixtureBeamAngle: 60,
        fixtureDistributionType: 'conical' as const
      };
    }
    if (idLower.includes('linear') || idLower.includes('tube') || idLower.includes('strip') || idLower.includes('t5') || idLower.includes('t8')) {
      return {
        fixtureShape: 'linear' as const,
        fixtureWidth: 0.05,
        fixtureLength: 1.2,
        fixtureDiameter: 0.05,
        fixtureThickness: 0.05,
        fixtureBeamAngle: 120,
        fixtureDistributionType: 'linear' as const
      };
    }
    if (idLower.includes('panel') || idLower.includes('troffer')) {
      return {
        fixtureShape: 'square' as const,
        fixtureWidth: 0.6,
        fixtureLength: 0.6,
        fixtureDiameter: 0.6,
        fixtureThickness: 0.02,
        fixtureBeamAngle: 110,
        fixtureDistributionType: 'conical' as const
      };
    }
    return {
      fixtureShape: 'square' as const,
      fixtureWidth: 0.6,
      fixtureLength: 0.6,
      fixtureDiameter: 0.2,
      fixtureThickness: 0.05,
      fixtureBeamAngle: 120,
      fixtureDistributionType: 'conical' as const
    };
  }

  switch (fixtureId) {
    case 'ind-led-bulb':
    case 'ind-smart-bulb':
    case 'spl-rgb':
      return {
        fixtureShape: 'circular' as const,
        fixtureWidth: 0.1,
        fixtureLength: 0.1,
        fixtureDiameter: 0.12,
        fixtureThickness: 0.15,
        fixtureBeamAngle: 140,
        fixtureDistributionType: 'omni' as const
      };
    
    case 'ind-t5-t8':
    case 'spl-uv':
      return {
        fixtureShape: 'linear' as const,
        fixtureWidth: 0.05,
        fixtureLength: 1.2,
        fixtureDiameter: 0.05,
        fixtureThickness: 0.05,
        fixtureBeamAngle: 120,
        fixtureDistributionType: 'linear' as const
      };
    
    case 'ind-panel':
      return {
        fixtureShape: 'square' as const,
        fixtureWidth: 0.6,
        fixtureLength: 0.6,
        fixtureDiameter: 0.6,
        fixtureThickness: 0.02,
        fixtureBeamAngle: 110,
        fixtureDistributionType: 'conical' as const
      };
    
    case 'ind-downlight':
    case 'out-pool':
      return {
        fixtureShape: 'circular' as const,
        fixtureWidth: 0.15,
        fixtureLength: 0.15,
        fixtureDiameter: 0.15,
        fixtureThickness: 0.02,
        fixtureBeamAngle: 60,
        fixtureDistributionType: 'conical' as const
      };
    
    case 'ind-ceiling':
      return {
        fixtureShape: 'circular' as const,
        fixtureWidth: 0.4,
        fixtureLength: 0.4,
        fixtureDiameter: 0.4,
        fixtureThickness: 0.08,
        fixtureBeamAngle: 120,
        fixtureDistributionType: 'omni' as const
      };
    
    case 'ind-chandelier':
      return {
        fixtureShape: 'circular' as const,
        fixtureWidth: 0.6,
        fixtureLength: 0.6,
        fixtureDiameter: 0.6,
        fixtureThickness: 0.5,
        fixtureBeamAngle: 180,
        fixtureDistributionType: 'omni' as const
      };
    
    case 'ind-track':
      return {
        fixtureShape: 'linear' as const,
        fixtureWidth: 0.08,
        fixtureLength: 1.0,
        fixtureDiameter: 0.08,
        fixtureThickness: 0.12,
        fixtureBeamAngle: 35,
        fixtureDistributionType: 'conical' as const
      };
    
    case 'ind-desk':
      return {
        fixtureShape: 'circular' as const,
        fixtureWidth: 0.2,
        fixtureLength: 0.2,
        fixtureDiameter: 0.18,
        fixtureThickness: 0.35,
        fixtureBeamAngle: 50,
        fixtureDistributionType: 'conical' as const
      };
    
    case 'ind-emergency':
      return {
        fixtureShape: 'rectangular' as const,
        fixtureWidth: 0.3,
        fixtureLength: 0.1,
        fixtureDiameter: 0.15,
        fixtureThickness: 0.12,
        fixtureBeamAngle: 80,
        fixtureDistributionType: 'conical' as const
      };
    
    case 'out-floodlight':
    case 'spl-motion':
      return {
        fixtureShape: 'rectangular' as const,
        fixtureWidth: 0.22,
        fixtureLength: 0.16,
        fixtureDiameter: 0.15,
        fixtureThickness: 0.1,
        fixtureBeamAngle: 90,
        fixtureDistributionType: 'conical' as const
      };
    
    case 'out-street':
      return {
        fixtureShape: 'rectangular' as const,
        fixtureWidth: 0.25,
        fixtureLength: 0.6,
        fixtureDiameter: 0.25,
        fixtureThickness: 0.12,
        fixtureBeamAngle: 110,
        fixtureDistributionType: 'oblong' as const
      };
    
    case 'out-solar':
      return {
        fixtureShape: 'rectangular' as const,
        fixtureWidth: 0.35,
        fixtureLength: 0.2,
        fixtureDiameter: 0.2,
        fixtureThickness: 0.08,
        fixtureBeamAngle: 100,
        fixtureDistributionType: 'conical' as const
      };
    
    case 'out-garden':
      return {
        fixtureShape: 'circular' as const,
        fixtureWidth: 0.15,
        fixtureLength: 0.15,
        fixtureDiameter: 0.15,
        fixtureThickness: 0.6,
        fixtureBeamAngle: 180,
        fixtureDistributionType: 'omni' as const
      };
    
    case 'out-wall':
      return {
        fixtureShape: 'rectangular' as const,
        fixtureWidth: 0.12,
        fixtureLength: 0.1,
        fixtureDiameter: 0.1,
        fixtureThickness: 0.25,
        fixtureBeamAngle: 90,
        fixtureDistributionType: 'oblong' as const
      };
    
    case 'out-highbay':
      return {
        fixtureShape: 'circular' as const,
        fixtureWidth: 0.4,
        fixtureLength: 0.4,
        fixtureDiameter: 0.4,
        fixtureThickness: 0.28,
        fixtureBeamAngle: 90,
        fixtureDistributionType: 'conical' as const
      };
    
    case 'out-lowbay':
      return {
        fixtureShape: 'circular' as const,
        fixtureWidth: 0.3,
        fixtureLength: 0.3,
        fixtureDiameter: 0.3,
        fixtureThickness: 0.2,
        fixtureBeamAngle: 110,
        fixtureDistributionType: 'conical' as const
      };
    
    case 'out-canopy':
      return {
        fixtureShape: 'square' as const,
        fixtureWidth: 0.4,
        fixtureLength: 0.4,
        fixtureDiameter: 0.4,
        fixtureThickness: 0.08,
        fixtureBeamAngle: 90,
        fixtureDistributionType: 'conical' as const
      };
    
    case 'spl-grow':
      return {
        fixtureShape: 'linear' as const,
        fixtureWidth: 0.12,
        fixtureLength: 1.2,
        fixtureDiameter: 0.12,
        fixtureThickness: 0.06,
        fixtureBeamAngle: 90,
        fixtureDistributionType: 'linear' as const
      };
    
    case 'spl-exit':
      return {
        fixtureShape: 'rectangular' as const,
        fixtureWidth: 0.3,
        fixtureLength: 0.03,
        fixtureDiameter: 0.15,
        fixtureThickness: 0.15,
        fixtureBeamAngle: 160,
        fixtureDistributionType: 'conical' as const
      };
    
    case 'spl-strip':
    case 'spl-cob-strip':
    case 'spl-neon':
      return {
        fixtureShape: 'linear' as const,
        fixtureWidth: 0.02,
        fixtureLength: 1.0,
        fixtureDiameter: 0.02,
        fixtureThickness: 0.01,
        fixtureBeamAngle: 120,
        fixtureDistributionType: 'linear' as const
      };
    
    default:
      return {
        fixtureShape: 'square' as const,
        fixtureWidth: 0.3,
        fixtureLength: 0.3,
        fixtureDiameter: 0.3,
        fixtureThickness: 0.05,
        fixtureBeamAngle: 120,
        fixtureDistributionType: 'conical' as const
      };
  }
}

import { handleFirestoreError, OperationType } from '../utils/firestoreError';

export default function IlluminationCalc({ panel, circuits, setCircuits, setActiveTab, activeTab, params, setParams, onSnapshotCapture, snapshots }: IlluminationCalcProps) {
  // Synchronized custom imported fixtures state
  const [importedFixtures, setImportedFixtures] = useState<any[]>([]);

  // Local Custom Fixtures fallback storage
  const [localCustomFixtures, setLocalCustomFixtures] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('local_custom_fixtures');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Favorite fixtures state
  const [favoriteFixtureIds, setFavoriteFixtureIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('favorite_fixtures');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // High-fidelity search and filter states
  const [filterCategory, setFilterCategory] = useState<string>('All');
  const [filterMounting, setFilterMounting] = useState<string>('All');
  const [filterMinWatt, setFilterMinWatt] = useState<string>('');
  const [filterMaxWatt, setFilterMaxWatt] = useState<string>('');
  const [filterMinLumen, setFilterMinLumen] = useState<string>('');
  const [filterMaxLumen, setFilterMaxLumen] = useState<string>('');
  const [filterOnlyFavs, setFilterOnlyFavs] = useState<boolean>(false);

  // Custom fixture creation/editing state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingFormFixtureId, setEditingFormFixtureId] = useState<string | null>(null);
  const [fixtureForm, setFixtureForm] = useState({
    lightType: '',
    category: 'Recessed Downlights',
    wattage: 15,
    lumens: 1500,
    efficacy: 100,
    cct: '4000K (Neutral White)',
    cri: 80,
    mountingType: 'Recessed',
    beamAngle: 110,
    utilizationFactor: 0.65,
    brands: 'Custom Spec',
    description: '',
    manufacturerReference: ''
  });

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      setImportedFixtures([]);
      return;
    }

    const colRef = collection(db, "users", user.uid, "importedFixtures");
    const unsubscribe = onSnapshot(colRef, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        list.push({
          id: d.id,
          category: d.category || 'Special',
          lightType: d.lightType || 'Custom LED',
          wattage: Number(d.wattage) || 15,
          lumens: Number(d.lumens) || 1500,
          brands: d.brands || 'Custom Import',
          wattageRange: d.wattageRange || `${d.wattage}W`,
          lumensRange: d.lumensRange || `${d.lumens} lm`,
          description: d.description || '',
          modelNumber: d.modelNumber || '',
          manufacturer: d.manufacturer || d.brands || d.manufacturerReference || '',
          efficacy: Number(d.efficacy) || Math.round((Number(d.lumens) || 1500) / (Number(d.wattage) || 15)),
          cct: d.cct || '4000K (Neutral White)',
          cri: Number(d.cri) || 80,
          mountingType: d.mountingType || 'Recessed',
          beamAngle: Number(d.beamAngle) || 110,
          utilizationFactor: Number(d.utilizationFactor) || 0.65,
          manufacturerReference: d.manufacturerReference || 'N/A',
          isCustom: true
        });
      });
      setImportedFixtures(list);
    }, (error) => {
      console.error("Error loading synchronized imported fixtures:", error);
      try {
        handleFirestoreError(error, OperationType.LIST, "users/" + user.uid + "/importedFixtures");
      } catch (e) {
        // Prevent crashing entire view, just log
      }
    });

    return () => unsubscribe();
  }, []);

  const allCustomFixtures = useMemo(() => {
    const combined = [...localCustomFixtures];
    importedFixtures.forEach((inf) => {
      if (!combined.some(c => c.id === inf.id)) {
        combined.push(inf);
      }
    });
    return combined;
  }, [localCustomFixtures, importedFixtures]);

  const allFixtures = useMemo(() => {
    const merged = [...LIGHT_FIXTURES_LIBRARY];
    allCustomFixtures.forEach((custom) => {
      if (!merged.some(f => f.id === custom.id)) {
        merged.push({
          ...custom,
          isCustom: true
        });
      }
    });
    return merged.map(f => ({
      ...f,
      isFavorite: favoriteFixtureIds.includes(f.id)
    }));
  }, [allCustomFixtures, favoriteFixtureIds]);

  const getFixtureById = (id: string) => {
    return allFixtures.find(f => f.id === id) || allFixtures[0] || LIGHT_FIXTURES_LIBRARY[0];
  };

  const [showFixtureModal, setShowFixtureModal] = useState(false);
  const [editingFixtureIndex, setEditingFixtureIndex] = useState<number | null>(null);
  
  // Advanced search states
  const [searchQuery, setSearchQuery] = useState('');
  const [searchTab, setSearchTab] = useState<'local' | 'online'>('local');
  const [onlineResults, setOnlineResults] = useState<any[]>([]);
  const [isSearchingOnline, setIsSearchingOnline] = useState(false);
  const [importingFixtureId, setImportingFixtureId] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [onlineSearchError, setOnlineSearchError] = useState<string | null>(null);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Filter local fixtures recursively with advanced multi-faceted search/filters
  const filteredLocalFixtures = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    
    return allFixtures.filter((fixture) => {
      // 1. Text Search matching
      if (q) {
        const matchBrand = (fixture.brands || '').toLowerCase().includes(q);
        const matchName = (fixture.lightType || '').toLowerCase().includes(q);
        const matchCategory = (fixture.category || '').toLowerCase().includes(q);
        const matchDescription = (fixture.description || '').toLowerCase().includes(q);
        const matchModel = (fixture.modelNumber || fixture.manufacturerReference || '').toLowerCase().includes(q);
        const textMatched = matchBrand || matchName || matchCategory || matchDescription || matchModel;
        if (!textMatched) return false;
      }

      // 2. Category Filter
      if (filterCategory !== 'All' && fixture.category !== filterCategory) {
        return false;
      }

      // 3. Mounting Type Filter
      if (filterMounting !== 'All' && fixture.mountingType !== filterMounting) {
        return false;
      }

      // 4. Wattage limits
      if (filterMinWatt !== '') {
        const minW = parseFloat(filterMinWatt);
        if (!isNaN(minW) && fixture.wattage < minW) return false;
      }
      if (filterMaxWatt !== '') {
        const maxW = parseFloat(filterMaxWatt);
        if (!isNaN(maxW) && fixture.wattage > maxW) return false;
      }

      // 5. Lumen limits
      if (filterMinLumen !== '') {
        const minL = parseFloat(filterMinLumen);
        if (!isNaN(minL) && fixture.lumens < minL) return false;
      }
      if (filterMaxLumen !== '') {
        const maxL = parseFloat(filterMaxLumen);
        if (!isNaN(maxL) && fixture.lumens > maxL) return false;
      }

      // 6. Favorites Filter
      if (filterOnlyFavs && !fixture.isFavorite) {
        return false;
      }

      return true;
    });
  }, [searchQuery, allFixtures, filterCategory, filterMounting, filterMinWatt, filterMaxWatt, filterMinLumen, filterMaxLumen, filterOnlyFavs]);

  // Favorite toggle helper
  const toggleFavorite = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavoriteFixtureIds((prev) => {
      const updated = prev.includes(id) ? prev.filter((fid) => fid !== id) : [...prev, id];
      localStorage.setItem('favorite_fixtures', JSON.stringify(updated));
      return updated;
    });
  };

  // Save customized or created new fixture parameters
  const handleSaveFixture = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = editingFormFixtureId || `custom-${Date.now()}`;
    const user = auth.currentUser;

    const payload = {
      id,
      category: fixtureForm.category,
      lightType: fixtureForm.lightType || 'Custom LED Fixture',
      brands: fixtureForm.brands || 'Custom Brand',
      manufacturer: fixtureForm.brands || 'Custom Brand',
      wattage: Number(fixtureForm.wattage) || 15,
      lumens: Number(fixtureForm.lumens) || 1500,
      efficacy: Number(fixtureForm.efficacy) || Math.round((Number(fixtureForm.lumens) || 1500) / (Number(fixtureForm.wattage) || 15)),
      cct: fixtureForm.cct || '4000K',
      cri: Number(fixtureForm.cri) || 80,
      mountingType: fixtureForm.mountingType || 'Recessed',
      beamAngle: Number(fixtureForm.beamAngle) || 110,
      utilizationFactor: Number(fixtureForm.utilizationFactor) || 0.65,
      description: fixtureForm.description || 'User defined custom lighting specification.',
      manufacturerReference: fixtureForm.manufacturerReference || 'N/A',
      wattageRange: `${fixtureForm.wattage}W`,
      lumensRange: `${fixtureForm.lumens} lm`,
      isCustom: true
    };

    if (user) {
      try {
        const docRef = doc(db, "users", user.uid, "importedFixtures", id);
        await setDoc(docRef, {
          ...payload,
          updatedAt: new Date().toISOString(),
          ownerId: user.uid
        });
      } catch (err) {
        console.error("Firestore save error:", err);
      }
    }

    setLocalCustomFixtures((prev) => {
      const idx = prev.findIndex((item) => item.id === id);
      let updated;
      if (idx !== -1) {
        updated = [...prev];
        updated[idx] = payload;
      } else {
        updated = [...prev, payload];
      }
      localStorage.setItem('local_custom_fixtures', JSON.stringify(updated));
      return updated;
    });

    setSuccessBanner(editingFormFixtureId ? "Fixture updated successfully!" : "Custom fixture saved successfully to local and cloud libraries!");
    setTimeout(() => setSuccessBanner(null), 4000);

    // Reset Form
    setShowCreateForm(false);
    setEditingFormFixtureId(null);
    setFixtureForm({
      lightType: '',
      category: 'Recessed Downlights',
      wattage: 15,
      lumens: 1500,
      efficacy: 100,
      cct: '4000K (Neutral White)',
      cri: 80,
      mountingType: 'Recessed',
      beamAngle: 110,
      utilizationFactor: 0.65,
      brands: 'Custom Spec',
      description: '',
      manufacturerReference: ''
    });
  };

  const handleStartEditFixture = (fixture: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingFormFixtureId(fixture.id);
    setFixtureForm({
      lightType: fixture.lightType || '',
      category: fixture.category || 'Recessed Downlights',
      wattage: fixture.wattage || 15,
      lumens: fixture.lumens || 1500,
      efficacy: fixture.efficacy || Math.round((fixture.lumens || 1500) / (fixture.wattage || 15)),
      cct: fixture.cct || '4000K (Neutral White)',
      cri: fixture.cri || 80,
      mountingType: fixture.mountingType || 'Recessed',
      beamAngle: fixture.beamAngle || 110,
      utilizationFactor: fixture.utilizationFactor || 0.65,
      brands: fixture.brands || 'Custom Spec',
      description: fixture.description || '',
      manufacturerReference: fixture.manufacturerReference || ''
    });
    setShowCreateForm(true);
  };

  const handleDeleteCustomFixture = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this custom fixture from your libraries?")) return;

    const user = auth.currentUser;
    if (user) {
      try {
        const docRef = doc(db, "users", user.uid, "importedFixtures", id);
        await deleteDoc(docRef);
      } catch (err) {
        console.error("Firestore delete error:", err);
      }
    }

    setLocalCustomFixtures((prev) => {
      const updated = prev.filter((item) => item.id !== id);
      localStorage.setItem('local_custom_fixtures', JSON.stringify(updated));
      return updated;
    });

    setSuccessBanner("Custom fixture removed from library.");
    setTimeout(() => setSuccessBanner(null), 3000);
  };

  const handleExportLibrary = () => {
    // Export all custom fixtures + standard favorites
    const customList = allFixtures.filter(f => f.isCustom || f.isFavorite);
    const dataStr = JSON.stringify(customList, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `illumination_fixtures_catalog_${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportLibrary = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const list = JSON.parse(text);
        if (!Array.isArray(list)) {
          alert("Invalid file structure. Make sure you upload a list of fixtures.");
          return;
        }

        const user = auth.currentUser;
        const newLocal = [...localCustomFixtures];

        for (const item of list) {
          if (!item.lightType) continue;

          const importedId = item.id && item.id.startsWith('custom-') ? item.id : `custom-imported-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
          const payload = {
            id: importedId,
            category: item.category || 'Recessed Downlights',
            lightType: item.lightType,
            brands: item.brands || 'Custom Import',
            manufacturer: item.brands || 'Custom Import',
            wattage: Number(item.wattage) || 15,
            lumens: Number(item.lumens) || 1500,
            efficacy: Number(item.efficacy) || Math.round((Number(item.lumens) || 1500) / (Number(item.wattage) || 15)),
            cct: item.cct || '4000K',
            cri: Number(item.cri) || 80,
            mountingType: item.mountingType || 'Recessed',
            beamAngle: Number(item.beamAngle) || 110,
            utilizationFactor: Number(item.utilizationFactor) || 0.65,
            description: item.description || 'Imported lighting specification.',
            manufacturerReference: item.manufacturerReference || 'N/A',
            wattageRange: item.wattageRange || `${item.wattage}W`,
            lumensRange: item.lumensRange || `${item.lumens} lm`,
            isCustom: true
          };

          if (user) {
            try {
              const docRef = doc(db, "users", user.uid, "importedFixtures", importedId);
              await setDoc(docRef, { ...payload, ownerId: user.uid, updatedAt: new Date().toISOString() });
            } catch (err) {
              console.error(err);
            }
          }

          if (!newLocal.some(x => x.id === importedId)) {
            newLocal.push(payload);
          }
        }

        setLocalCustomFixtures(newLocal);
        localStorage.setItem('local_custom_fixtures', JSON.stringify(newLocal));
        setSuccessBanner(`Successfully imported ${list.length} custom fixtures into your libraries.`);
        setTimeout(() => setSuccessBanner(null), 4000);
      } catch (err) {
        alert("Failed importing. Make sure target file is clear valid JSON catalog.");
      }
    };
    reader.readAsText(file);
  };

  // Handle internet-grounded fixture model queries
  useEffect(() => {
    if (searchTab !== 'online' || !searchQuery.trim()) {
      setOnlineResults([]);
      setOnlineSearchError(null);
      return;
    }

    const delayDebounceFn = setTimeout(async () => {
      setIsSearchingOnline(true);
      setOnlineSearchError(null);
      try {
        const response = await fetch('/api/fixtures/search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ q: searchQuery })
        });
        const data = await response.json();
        
        if (response.status === 429) {
          setOnlineSearchError("Search limit reached. Please try again later.");
          setOnlineResults([]);
        } else if (response.ok && data.fixtures) {
          setOnlineResults(data.fixtures);
        } else {
          setOnlineSearchError("Failed connecting to fixture database. Try a different query.");
          setOnlineResults([]);
        }
      } catch (err) {
        console.error("Online search failed:", err);
        setOnlineSearchError("Network failure occurred during online search.");
        setOnlineResults([]);
      } finally {
        setIsSearchingOnline(false);
      }
    }, 600); // 600ms debounce buffer

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, searchTab]);

  const handleImportFixture = async (fixture: any) => {
    const user = auth.currentUser;
    if (!user) {
      alert("Please sign in to import custom-spec fixtures into your persistent database library.");
      return;
    }

    setImportingFixtureId(fixture.id);
    try {
      const docRef = doc(db, "users", user.uid, "importedFixtures", fixture.id);
      const payload = {
        id: fixture.id,
        category: fixture.category || "Indoor",
        lightType: fixture.lightType || "Imported LED Fixture",
        brands: fixture.brands || fixture.manufacturer || "Custom Import",
        wattage: Number(fixture.wattage) || 15,
        lumens: Number(fixture.lumens) || 1500,
        wattageRange: fixture.wattageRange || `${fixture.wattage}W`,
        lumensRange: fixture.lumensRange || `${fixture.lumens} lm`,
        description: fixture.description || 'Imported catalog fixture.',
        modelNumber: fixture.modelNumber || 'N/A',
        manufacturer: fixture.manufacturer || fixture.brands || 'N/A',
        importedAt: new Date().toISOString(),
        ownerId: user.uid
      };

      await setDoc(docRef, payload);

      if (editingFixtureIndex !== null && params.activeFixtures) {
        const list = [...params.activeFixtures];
        const oldFixtureId = list[editingFixtureIndex]?.fixtureId;
        const defaults = getPredefinedFixtureDefaults(fixture.id, false);
        if (list[editingFixtureIndex]) {
          list[editingFixtureIndex] = {
            ...list[editingFixtureIndex],
            fixtureId: fixture.id,
            lightType: fixture.lightType,
            lumens: fixture.lumens,
            wattage: fixture.wattage,
            brands: fixture.brands || fixture.manufacturer,
            isCustom: false,
            fixtureShape: defaults.fixtureShape,
            fixtureWidth: defaults.fixtureWidth,
            fixtureLength: defaults.fixtureLength,
            fixtureDiameter: defaults.fixtureDiameter,
            fixtureThickness: defaults.fixtureThickness,
            fixtureBeamAngle: defaults.fixtureBeamAngle,
            fixtureDistributionType: defaults.fixtureDistributionType
          };
        }

        let updatedCustomPositions = params.customPositions;
        if (oldFixtureId && params.customPositions && params.customPositions.length > 0) {
          const targetActiveF = list[editingFixtureIndex];
          updatedCustomPositions = params.customPositions.map(cp => {
            const isMatch = cp.activeFixtureId 
              ? cp.activeFixtureId === targetActiveF?.id
              : cp.fixtureId === oldFixtureId;
            if (isMatch) {
              return {
                ...cp,
                fixtureId: fixture.id,
                lightType: fixture.lightType,
                lumens: fixture.lumens,
                wattage: fixture.wattage,
                activeFixtureId: targetActiveF?.id
              };
            }
            return cp;
          });
        }

        if (list.length === 1) {
          setParams({ 
            ...params, 
            activeFixtures: list,
            customPositions: updatedCustomPositions,
            selectedFixtureId: fixture.id,
            lumensPerFixture: fixture.lumens,
            isCustomFixture: false,
            fixtureShape: defaults.fixtureShape,
            fixtureWidth: defaults.fixtureWidth,
            fixtureLength: defaults.fixtureLength,
            fixtureDiameter: defaults.fixtureDiameter,
            fixtureThickness: defaults.fixtureThickness,
            fixtureBeamAngle: defaults.fixtureBeamAngle,
            fixtureDistributionType: defaults.fixtureDistributionType
          });
        } else {
          setParams({ 
            ...params, 
            activeFixtures: list,
            customPositions: updatedCustomPositions
          });
        }
      } else {
        setParams({ ...params, selectedFixtureId: fixture.id, lumensPerFixture: fixture.lumens, isCustomFixture: false });
      }

      setSuccessBanner(`Successfully imported "${fixture.lightType}" into your persistent library database!`);
      setTimeout(() => setSuccessBanner(null), 4000);
      
      setShowFixtureModal(false);
      setEditingFixtureIndex(null);
    } catch (err) {
      console.error("Failed to import custom fixture to Firestore collection:", err);
      alert("Import operation failed. Make sure your network is connected and you are logged in.");
    } finally {
      setImportingFixtureId(null);
    }
  };

  const [activeSubTab, setActiveSubTab] = useState<'3d' | 'grid' | 'daylight' | 'glare' | 'energy'>('3d');
  const [layoutViewMode, setLayoutViewMode] = useState<'3d' | 'drag'>('3d');
  const [draggedFixtureId, setDraggedFixtureId] = useState<string | null>(null);
  const [rotatingFixtureId, setRotatingFixtureId] = useState<string | null>(null);
  const dragContainerRef = useRef<HTMLDivElement>(null);

  const isCurrentlyCustom = useMemo(() => {
    if (editingFixtureIndex !== null && params.activeFixtures && params.activeFixtures[editingFixtureIndex]) {
      return !!params.activeFixtures[editingFixtureIndex].isCustom;
    }
    return !!params.isCustomFixture;
  }, [editingFixtureIndex, params.activeFixtures, params.isCustomFixture]);

  const currentSelectedFixtureId = useMemo(() => {
    if (editingFixtureIndex !== null && params.activeFixtures && params.activeFixtures[editingFixtureIndex]) {
      return params.activeFixtures[editingFixtureIndex].fixtureId;
    }
    return params.selectedFixtureId;
  }, [editingFixtureIndex, params.activeFixtures, params.selectedFixtureId]);

  // Ensure we have at least one active fixture in params.activeFixtures for combined design
  useEffect(() => {
    if (!params.activeFixtures || params.activeFixtures.length === 0) {
      const activeF = getFixtureById(params.selectedFixtureId || 'ind-panel');
      const defaults = getPredefinedFixtureDefaults(params.selectedFixtureId || 'ind-panel', !!params.isCustomFixture);
      const isCustom = !!params.isCustomFixture;
      
      const seedFixture = {
        id: crypto.randomUUID(),
        fixtureId: params.selectedFixtureId || 'ind-panel',
        lightType: isCustom ? (params.customLightType || 'Custom Fixture') : activeF.lightType,
        quantity: 4,
        wattage: isCustom ? (params.customWattage || 15) : activeF.wattage,
        lumens: isCustom ? (params.customLumens || 1500) : activeF.lumens,
        brands: isCustom ? 'Manual Intake Spec' : activeF.brands,
        isCustom: isCustom,
        fixtureShape: params.fixtureShape || defaults.fixtureShape,
        fixtureWidth: params.fixtureWidth !== undefined ? params.fixtureWidth : defaults.fixtureWidth,
        fixtureLength: params.fixtureLength !== undefined ? params.fixtureLength : defaults.fixtureLength,
        fixtureDiameter: params.fixtureDiameter !== undefined ? params.fixtureDiameter : defaults.fixtureDiameter,
        fixtureThickness: params.fixtureThickness !== undefined ? params.fixtureThickness : defaults.fixtureThickness,
        fixtureBeamAngle: params.fixtureBeamAngle !== undefined ? params.fixtureBeamAngle : defaults.fixtureBeamAngle,
        fixtureDistributionType: params.fixtureDistributionType || defaults.fixtureDistributionType
      };
      
      setParams(prev => ({
        ...prev,
        activeFixtures: [seedFixture]
      }));
    }
  }, [params.selectedFixtureId, params.isCustomFixture, params.activeFixtures]);

  // Keep track of previously selected fixture and override values when choice changes
  const [prevFixtureKey, setPrevFixtureKey] = useState('');
  useEffect(() => {
    const key = `${params.isCustomFixture ? 'custom' : 'lib'}-${params.selectedFixtureId || ''}`;
    if (prevFixtureKey && prevFixtureKey !== key) {
      const defaults = getPredefinedFixtureDefaults(params.selectedFixtureId || 'ind-panel', !!params.isCustomFixture);
      setParams(current => {
        const nextParams = {
          ...current,
          fixtureShape: defaults.fixtureShape,
          fixtureWidth: defaults.fixtureWidth,
          fixtureLength: defaults.fixtureLength,
          fixtureDiameter: defaults.fixtureDiameter,
          fixtureThickness: defaults.fixtureThickness,
          fixtureBeamAngle: defaults.fixtureBeamAngle,
          fixtureDistributionType: defaults.fixtureDistributionType,
        };

        if (current.activeFixtures && current.activeFixtures.length === 1) {
          const activeF = getFixtureById(current.selectedFixtureId || 'ind-panel');
          const oldFixtureId = current.activeFixtures[0].fixtureId;
          const newFixtureId = current.selectedFixtureId || 'ind-panel';
          const newLightType = current.isCustomFixture ? (current.customLightType || 'Custom Fixture') : activeF.lightType;
          const newWattage = current.isCustomFixture ? (current.customWattage || 15) : activeF.wattage;
          const newLumens = current.isCustomFixture ? (current.customLumens || 1500) : activeF.lumens;

          nextParams.activeFixtures = [{
            ...current.activeFixtures[0],
            fixtureId: newFixtureId,
            lightType: newLightType,
            wattage: newWattage,
            lumens: newLumens,
            brands: current.isCustomFixture ? 'Manual Intake Spec' : activeF.brands,
            isCustom: !!current.isCustomFixture,
            fixtureShape: defaults.fixtureShape,
            fixtureWidth: defaults.fixtureWidth,
            fixtureLength: defaults.fixtureLength,
            fixtureDiameter: defaults.fixtureDiameter,
            fixtureThickness: defaults.fixtureThickness,
            fixtureBeamAngle: defaults.fixtureBeamAngle,
            fixtureDistributionType: defaults.fixtureDistributionType,
          }];
          
          if (current.customPositions && current.customPositions.length > 0) {
            nextParams.customPositions = current.customPositions.map(cp => {
              if (cp.fixtureId === oldFixtureId) {
                return {
                  ...cp,
                  fixtureId: newFixtureId,
                  lightType: newLightType,
                  lumens: newLumens,
                  wattage: newWattage
                };
              }
              return cp;
            });
          }
        }

        return nextParams;
      });
    }
    setPrevFixtureKey(key);
  }, [params.selectedFixtureId, params.isCustomFixture]);


  // Backfill on mount if dimension details are missing or empty
  useEffect(() => {
    const defaults = getPredefinedFixtureDefaults(params.selectedFixtureId || 'ind-panel', !!params.isCustomFixture);
    if (
      params.fixtureShape === undefined ||
      params.fixtureWidth === undefined ||
      params.fixtureLength === undefined ||
      params.fixtureDiameter === undefined ||
      params.fixtureThickness === undefined ||
      params.fixtureBeamAngle === undefined ||
      params.fixtureDistributionType === undefined
    ) {
      setParams(current => ({
        ...current,
        fixtureShape: current.fixtureShape || defaults.fixtureShape,
        fixtureWidth: current.fixtureWidth !== undefined ? current.fixtureWidth : defaults.fixtureWidth,
        fixtureLength: current.fixtureLength !== undefined ? current.fixtureLength : defaults.fixtureLength,
        fixtureDiameter: current.fixtureDiameter !== undefined ? current.fixtureDiameter : defaults.fixtureDiameter,
        fixtureThickness: current.fixtureThickness !== undefined ? current.fixtureThickness : defaults.fixtureThickness,
        fixtureBeamAngle: current.fixtureBeamAngle !== undefined ? current.fixtureBeamAngle : defaults.fixtureBeamAngle,
        fixtureDistributionType: current.fixtureDistributionType || defaults.fixtureDistributionType,
      }));
    }
  }, []);

  // Synchronize general physical properties from sliders/inputs into activeFixtures when editing a single fixture layout
  useEffect(() => {
    if (params.activeFixtures && params.activeFixtures.length === 1) {
      const first = params.activeFixtures[0];
      
      const targetShape = params.fixtureShape !== undefined ? params.fixtureShape : first.fixtureShape;
      const targetWidth = params.fixtureWidth !== undefined ? params.fixtureWidth : first.fixtureWidth;
      const targetLength = params.fixtureLength !== undefined ? params.fixtureLength : first.fixtureLength;
      const targetDiameter = params.fixtureDiameter !== undefined ? params.fixtureDiameter : first.fixtureDiameter;
      const targetThickness = params.fixtureThickness !== undefined ? params.fixtureThickness : first.fixtureThickness;
      const targetBeamAngle = params.fixtureBeamAngle !== undefined ? params.fixtureBeamAngle : first.fixtureBeamAngle;
      const targetDistributionType = params.fixtureDistributionType !== undefined ? params.fixtureDistributionType : first.fixtureDistributionType;

      if (
        first.fixtureShape !== targetShape ||
        first.fixtureWidth !== targetWidth ||
        first.fixtureLength !== targetLength ||
        first.fixtureDiameter !== targetDiameter ||
        first.fixtureThickness !== targetThickness ||
        first.fixtureBeamAngle !== targetBeamAngle ||
        first.fixtureDistributionType !== targetDistributionType
      ) {
        setParams(prev => {
          if (!prev.activeFixtures || prev.activeFixtures.length !== 1) return prev;
          const updatedFirst = {
            ...prev.activeFixtures[0],
            fixtureShape: prev.fixtureShape !== undefined ? prev.fixtureShape : prev.activeFixtures[0].fixtureShape,
            fixtureWidth: prev.fixtureWidth !== undefined ? prev.fixtureWidth : prev.activeFixtures[0].fixtureWidth,
            fixtureLength: prev.fixtureLength !== undefined ? prev.fixtureLength : prev.activeFixtures[0].fixtureLength,
            fixtureDiameter: prev.fixtureDiameter !== undefined ? prev.fixtureDiameter : prev.activeFixtures[0].fixtureDiameter,
            fixtureThickness: prev.fixtureThickness !== undefined ? prev.fixtureThickness : prev.activeFixtures[0].fixtureThickness,
            fixtureBeamAngle: prev.fixtureBeamAngle !== undefined ? prev.fixtureBeamAngle : prev.activeFixtures[0].fixtureBeamAngle,
            fixtureDistributionType: prev.fixtureDistributionType !== undefined ? prev.fixtureDistributionType : prev.activeFixtures[0].fixtureDistributionType,
          };
          return {
            ...prev,
            activeFixtures: [updatedFirst]
          };
        });
      }
    }
  }, [
    params.fixtureShape,
    params.fixtureWidth,
    params.fixtureLength,
    params.fixtureDiameter,
    params.fixtureThickness,
    params.fixtureBeamAngle,
    params.fixtureDistributionType,
    params.activeFixtures
  ]);

  // Synchronize custom positions list with the active selection of fixtures & quantities
  useEffect(() => {
    if (params.activeFixtures && params.activeFixtures.length > 0) {
      const expectedTotalQty = params.activeFixtures.reduce((sum, f) => sum + (f.quantity || 0), 0);
      const currentQty = params.customPositions ? params.customPositions.length : 0;
      
      if (expectedTotalQty > 0) {
        if (expectedTotalQty !== currentQty) {
          // Generate uniform spaced coordinates
          const list: PlacedFixtureDragPosition[] = [];
          const w = params.roomWidth || 4;
          const l = params.roomLength || 5;
          const ratio = w / Math.max(0.1, l);
          
          params.activeFixtures.forEach((af, afIdx) => {
            const q = af.quantity || 0;
            if (q <= 0) return;
            
            let cols = Math.ceil(Math.sqrt(q));
            let rows = Math.ceil(q / cols);
            cols = Math.max(1, Math.round(Math.sqrt(q * ratio)));
            rows = Math.ceil(q / cols);
            
            const stepZ = l / rows;
            for (let r = 0; r < rows; r++) {
              const startIdx = r * cols;
              const endIdx = Math.min(q, (r + 1) * cols);
              const countRow = endIdx - startIdx;
              if (countRow <= 0) continue;
              
              const rowStepX = w / countRow;
              for (let c = 0; c < countRow; c++) {
                let staggerX = 0;
                let staggerZ = 0;
                if (params.activeFixtures!.length > 1) {
                  const thetaOffset = (afIdx / params.activeFixtures!.length) * 2 * Math.PI;
                  const radiusOffset = 0.15; // 15cm shift
                  staggerX = radiusOffset * Math.cos(thetaOffset);
                  staggerZ = radiusOffset * Math.sin(thetaOffset);
                }
                
                let proposedX = rowStepX / 2 + c * rowStepX + staggerX;
                let proposedZ = stepZ / 2 + r * stepZ + staggerZ;
                proposedX = Math.max(0.05, Math.min(w - 0.05, proposedX));
                proposedZ = Math.max(0.05, Math.min(l - 0.05, proposedZ));
                
                list.push({
                  id: `fixture-${af.fixtureId}-${afIdx}-${r}-${c}-${Math.random().toString(36).substr(2, 4)}`,
                  fixtureId: af.fixtureId,
                  lightType: af.lightType,
                  x: Number(proposedX.toFixed(3)),
                  z: Number(proposedZ.toFixed(3)),
                  lumens: af.lumens,
                  wattage: af.wattage,
                  activeFixtureId: af.id
                });
              }
            }
          });
          
          setParams(prev => ({
            ...prev,
            customPositions: list
          }));
        } else {
          // Quantities match, but lumens/wattage might have changed. Sync them without resetting x/z.
          let hasChanges = false;
          const updatedList = (params.customPositions || []).map(cp => {
            let matchingAf = cp.activeFixtureId 
              ? params.activeFixtures!.find(af => af.id === cp.activeFixtureId)
              : params.activeFixtures!.find(af => af.fixtureId === cp.fixtureId);
            
            // If the fixtureId in custom position is out of sync and there's only 1 active fixture, map to it.
            if (!matchingAf && params.activeFixtures!.length === 1) {
              matchingAf = params.activeFixtures![0];
            }
            
            if (matchingAf && (matchingAf.fixtureId !== cp.fixtureId || matchingAf.lumens !== cp.lumens || matchingAf.wattage !== cp.wattage || matchingAf.lightType !== cp.lightType || cp.activeFixtureId !== matchingAf.id)) {
              hasChanges = true;
              return {
                ...cp,
                fixtureId: matchingAf.fixtureId,
                lumens: matchingAf.lumens,
                wattage: matchingAf.wattage,
                lightType: matchingAf.lightType,
                activeFixtureId: matchingAf.id
              };
            }
            return cp;
          });
          
          if (hasChanges) {
            setParams(prev => ({
              ...prev,
              customPositions: updatedList
            }));
          }
        }
      }
    }
  }, [params.activeFixtures, params.roomWidth, params.roomLength]);

  // Keep existing coordinates within room boundary when room size is edited
  useEffect(() => {
    if (params.customPositions && params.customPositions.length > 0) {
      const w = params.roomWidth || 4;
      const l = params.roomLength || 5;
      let shifted = false;
      
      const updated = params.customPositions.map(cp => {
        let newX = cp.x;
        let newZ = cp.z;
        if (cp.x > w) {
          newX = w - 0.1;
          shifted = true;
        }
        if (cp.z > l) {
          newZ = l - 0.1;
          shifted = true;
        }
        return {
          ...cp,
          x: Math.max(0.05, Number(newX.toFixed(3))),
          z: Math.max(0.05, Number(newZ.toFixed(3)))
        };
      });
      
      if (shifted) {
        setParams(prev => ({
          ...prev,
          customPositions: updated
        }));
      }
    }
  }, [params.roomWidth, params.roomLength]);

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

  // Drag handlers for manual layout positioning within design room area
  const handleDragStart = (id: string, e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    setDraggedFixtureId(id);
  };
  
  const handleRotateStart = (id: string, e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setRotatingFixtureId(id);
  };

  const handleDragMove = (e: React.MouseEvent | React.TouchEvent) => {
    if ((!draggedFixtureId && !rotatingFixtureId) || !params.customPositions || !dragContainerRef.current) return;
    
    let clientX = 0;
    let clientY = 0;
    if ('touches' in e) {
      if (e.touches.length === 0) return;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const rect = dragContainerRef.current.getBoundingClientRect();
    
    if (rotatingFixtureId) {
      const w = params.roomWidth || 4;
      const l = params.roomLength || 5;
      const fixture = params.customPositions.find(p => p.id === rotatingFixtureId);
      if (fixture) {
        // Calculate center of fixture in screen pixels
        const fixtureCenterX = rect.left + (fixture.x / w) * rect.width;
        const fixtureCenterY = rect.top + (fixture.z / l) * rect.height;
        
        // Calculate angle between center and mouse pointer
        // Mouse straight up (dx=0, dy=-1) should be 0 degrees
        const dx = clientX - fixtureCenterX;
        const dy = clientY - fixtureCenterY;
        let angleRot = Math.atan2(dx, -dy) * 180 / Math.PI;
        
        // Snap to nearest 15 degrees if near it
        angleRot = Math.round(angleRot / 15) * 15;
        // Normalize 0-360
        if (angleRot < 0) angleRot += 360;

        setParams(prev => {
          if (!prev.customPositions) return prev;
          const updated = prev.customPositions.map(cp => {
            if (cp.id === rotatingFixtureId) {
              return { ...cp, rotationDegrees: angleRot };
            }
            return cp;
          });
          return { ...prev, customPositions: updated };
        });
      }
      return;
    }

    const relativeX = clientX - rect.left;
    const relativeY = clientY - rect.top;

    const w = params.roomWidth || 4;
    const l = params.roomLength || 5;
    
    let proposedMeterX = (relativeX / rect.width) * w;
    let proposedMeterZ = (relativeY / rect.height) * l;

    // Clamp coordinates with a safe boundary buffer (5cm inside walls)
    proposedMeterX = Math.max(0.05, Math.min(w - 0.05, proposedMeterX));
    proposedMeterZ = Math.max(0.05, Math.min(l - 0.05, proposedMeterZ));

    setParams(prev => {
      if (!prev.customPositions) return prev;
      const updated = prev.customPositions.map(cp => {
        if (cp.id === draggedFixtureId) {
          return {
            ...cp,
            x: Number(proposedMeterX.toFixed(3)),
            z: Number(proposedMeterZ.toFixed(3))
          };
        }
        return cp;
      });
      return {
        ...prev,
        customPositions: updated
      };
    });
  };

  const handleDragEnd = () => {
    setDraggedFixtureId(null);
    setRotatingFixtureId(null);
  };

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
    return getFixtureById(params.selectedFixtureId || 'ind-panel');
  }, [params.isCustomFixture, params.selectedFixtureId, params.customLightType, params.customWattage, params.customLumens, allFixtures]);

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

  // Keep single active fixture's quantity in sync with dynamically calculated quantity for the room
  const prevCalcFixtures = useRef(calculation.fixtures);
  useEffect(() => {
    if (params.activeFixtures && params.activeFixtures.length === 1 && calculation.fixtures > 0) {
      if (prevCalcFixtures.current !== calculation.fixtures || params.activeFixtures[0].quantity === 4 /* Initial seed */) {
        prevCalcFixtures.current = calculation.fixtures;
        if (params.activeFixtures[0].quantity !== calculation.fixtures) {
          setParams(prev => {
            if (prev.activeFixtures && prev.activeFixtures.length === 1) {
              return {
                ...prev,
                activeFixtures: [{
                  ...prev.activeFixtures[0],
                  quantity: calculation.fixtures
                }]
              };
            }
            return prev;
          });
        }
      }
    }
  }, [calculation.fixtures, params.activeFixtures]);

  // Derived properties from Space Standard Limits (ASHRAE 90.1)
  const lpdLimitInfo = useMemo(() => {
    let roomName = params.targetRoomName;
    if (!roomName) {
      roomName = Object.entries(RECOMMENDED_LUX_LEVELS).find(([_, lux]) => lux === params.targetLux)?.[0] || 'GENERAL SPACE';
    }
    const roomNameUpper = roomName.toUpperCase();
    
    let limit = 6.0; // standard W/m² limit for standard spaces
    let description = 'General lighting standards';

    if (roomNameUpper.includes('OFFICE')) {
      limit = 6.0;
      description = 'ASHRAE 90.1 Office boundary (max 6.0 W/m²)';
    } else if (roomNameUpper.includes('CONFERENCE')) {
      limit = 6.5;
      description = 'ASHRAE 90.1 Conference Space boundary (max 6.5 W/m²)';
    } else if (roomNameUpper.includes('WAREHOUSE') || roomNameUpper.includes('STORAGE')) {
      limit = 3.8;
      description = 'ASHRAE 90.1 Storage / Warehouse space (max 3.8 W/m²)';
    } else if (roomNameUpper.includes('STAIRWAY') || roomNameUpper.includes('CORRIDOR')) {
      limit = 4.5;
      description = 'ASHRAE 90.1 Circulation Corridor boundary (max 4.5 W/m²)';
    } else if (roomNameUpper.includes('CLASSROOM') || roomNameUpper.includes('SCHOOL')) {
      limit = 5.4;
      description = 'ASHRAE 90.1 Education classrooms (max 5.4 W/m²)';
    } else if (roomNameUpper.includes('LOBBY') || roomNameUpper.includes('RECEPTION')) {
      limit = 7.0;
      description = 'ASHRAE 90.1 Entrance Lobbies (max 7.0 W/m²)';
    } else if (roomNameUpper.includes('TOILET') || roomNameUpper.includes('RESTROOM')) {
      limit = 4.8;
      description = 'ASHRAE 90.1 Sanitary Rooms (max 4.8 W/m²)';
    }

    return { limit, description, roomName };
  }, [params.targetLux, params.targetRoomName]);

  // Generate 5x5 dynamic Measurement Grid values representing Lux distribution (DIALux calculation points)
  const luxGridData = useMemo(() => {
    const w = params.roomWidth || 4;
    const l = params.roomLength || 5;
    const h = mountingHeight || 1.95;
    const ratio = w / Math.max(0.1, l);
    
    const fixtureCoords: { x: number; z: number; lumens: number; coefficientOfUtilization: number; maintenanceFactor: number; fixtureId?: string; rotationDegrees?: number }[] = [];
    
    if (params.customPositions && params.customPositions.length > 0) {
      params.customPositions.forEach(cp => {
        fixtureCoords.push({
          x: cp.x,
          z: cp.z,
          lumens: cp.lumens ?? activeFixture.lumens,
          coefficientOfUtilization: params.coefficientOfUtilization,
          maintenanceFactor: params.maintenanceFactor,
          fixtureId: cp.fixtureId,
          rotationDegrees: cp.rotationDegrees
        });
      });
    } else if (params.activeFixtures && params.activeFixtures.length > 0) {
      params.activeFixtures.forEach(af => {
        const q = af.quantity || 0;
        if (q <= 0) return;
        
        let cols = Math.ceil(Math.sqrt(q));
        let rows = Math.ceil(q / cols);
        cols = Math.max(1, Math.round(Math.sqrt(q * ratio)));
        rows = Math.ceil(q / cols);
        
        const stepZ = l / rows;
        for (let r = 0; r < rows; r++) {
          const startIdx = r * cols;
          const endIdx = Math.min(q, (r + 1) * cols);
          const countRow = endIdx - startIdx;
          if (countRow <= 0) continue;
          
          const rowStepX = w / countRow;
          for (let c = 0; c < countRow; c++) {
            fixtureCoords.push({
              x: rowStepX / 2 + c * rowStepX,
              z: stepZ / 2 + r * stepZ,
              lumens: af.lumens,
              coefficientOfUtilization: params.coefficientOfUtilization,
              maintenanceFactor: params.maintenanceFactor,
              fixtureId: af.fixtureId,
              rotationDegrees: 0
            });
          }
        }
      });
    } else {
      const fixturesCount = calculation.fixtures;
      let cols = Math.ceil(Math.sqrt(fixturesCount));
      let rows = Math.ceil(fixturesCount / cols);
      if (params.inputMode === 'dimensions') {
        cols = Math.max(1, Math.round(Math.sqrt(fixturesCount * ratio)));
        rows = Math.ceil(fixturesCount / cols);
      }
      
      if (fixturesCount > 0 && cols > 0 && rows > 0) {
        const stepZ = l / rows;
        for (let r = 0; r < rows; r++) {
          const startIdx = r * cols;
          const endIdx = Math.min(fixturesCount, (r + 1) * cols);
          const fixturesInThisRow = endIdx - startIdx;
          if (fixturesInThisRow <= 0) continue;

          const rowStepX = w / fixturesInThisRow;
          for (let c = 0; c < fixturesInThisRow; c++) {
            fixtureCoords.push({
              x: rowStepX / 2 + c * rowStepX,
              z: stepZ / 2 + r * stepZ,
              lumens: activeFixture.lumens,
              coefficientOfUtilization: params.coefficientOfUtilization,
              maintenanceFactor: params.maintenanceFactor,
              fixtureId: activeFixture.id,
              rotationDegrees: 0
            });
          }
        }
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
          directLux += calcSinglePointLux(x, z, fixture, params.activeFixtures, fixture.coefficientOfUtilization, fixture.maintenanceFactor, h, activeFixture.lumens);
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
    const fixtureCount = params.activeFixtures && params.activeFixtures.length > 0
      ? params.activeFixtures.reduce((total, f) => total + (f.quantity || 0), 0)
      : calculation.fixtures;
    const averageLumens = params.activeFixtures && params.activeFixtures.length > 0
      ? params.activeFixtures.reduce((total, f) => total + (f.quantity || 0) * (f.lumens || 0), 0) / Math.max(1, fixtureCount)
      : activeFixture.lumens;
    const lumenWeight = averageLumens / 3000;
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
  }, [params.activeFixtures, calculation.fixtures, activeFixture.lumens, params.roomWidth, params.roomLength, mountingHeight]);

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
    const totalPowerW = params.activeFixtures && params.activeFixtures.length > 0
      ? params.activeFixtures.reduce((total, f) => total + (f.quantity || 0) * (f.wattage || 0), 0)
      : calculation.fixtures * (getFixtureById(params.selectedFixtureId || 'ind-panel')?.wattage || 15);
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

  const handleAddToSchedule = async () => {
    if (!setCircuits || !circuits) return;
    const newNo = circuits.length > 0 ? Math.max(...circuits.map(c => c.circuitNo)) + 1 : 1;
    
    // Use active fixture spec or sum of activeFixtures of combined design
    const isCombined = params.activeFixtures && params.activeFixtures.length > 1;
    const totalVA = params.activeFixtures && params.activeFixtures.length > 0
      ? params.activeFixtures.reduce((total, f) => total + (f.quantity || 0) * (f.wattage || 0), 0)
      : activeFixture.wattage * calculation.fixtures;
    const totalQty = params.activeFixtures && params.activeFixtures.length > 0
      ? params.activeFixtures.reduce((total, f) => total + (f.quantity || 0), 0)
      : calculation.fixtures;
    
    const labelDescription = isCombined 
      ? `LIGHTING: COMBINED DESIGN (${params.activeFixtures?.length} Types) - ${lpdLimitInfo.roomName}`
      : `LIGHTING: ${activeFixture.lightType} - ${lpdLimitInfo.roomName}`;

    const targetVoltage = panel?.voltage || 230;

    const newCircuit: Circuit = {
      id: crypto.randomUUID(),
      circuitNo: newNo,
      description: labelDescription,
      wattage: isCombined ? Math.round(totalVA / totalQty) : activeFixture.wattage,
      quantity: totalQty,
      loadVA: totalVA,
      voltage: targetVoltage,
      phases: ['R'],
      loadA: Number((totalVA / targetVoltage).toFixed(2)),
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
  };

  const handleAddToIlluminationTable = async () => {
    const isCombined = params.activeFixtures && params.activeFixtures.length > 1;
    const totalVA = params.activeFixtures && params.activeFixtures.length > 0
      ? params.activeFixtures.reduce((total, f) => total + (f.quantity || 0) * (f.wattage || 0), 0)
      : activeFixture.wattage * calculation.fixtures;
    const totalQty = params.activeFixtures && params.activeFixtures.length > 0
      ? params.activeFixtures.reduce((total, f) => total + (f.quantity || 0), 0)
      : calculation.fixtures;
    const totalLumensVal = params.activeFixtures && params.activeFixtures.length > 0
      ? params.activeFixtures.reduce((total, f) => total + (f.quantity || 0) * (f.lumens || 0), 0)
      : activeFixture.lumens * calculation.fixtures;
    
    // Unified numbering with circuits
    const nextNo = circuits && circuits.length > 0 ? Math.max(...circuits.map(c => c.circuitNo)) + 1 : 1;
    const newNo = nextNo;
    
    // Create local Saved Rooms table entry 
    const newSavedRoom = {
      id: crypto.randomUUID(),
      circuitNo: newNo,
      roomName: lpdLimitInfo.roomName,
      targetLux: params.targetLux,
      area: Number(calculation.area),
      fixtureId: isCombined ? 'combined' : activeFixture.id,
      fixtureLightType: isCombined ? `Combined Design (${params.activeFixtures?.length} Types)` : activeFixture.lightType,
      fixturesCount: totalQty,
      totalLumens: totalLumensVal,
      totalWattage: totalVA,
      fixtureWattage: isCombined ? Math.round(totalVA / totalQty) : activeFixture.wattage,
      fixtureLumens: isCombined ? Math.round(totalLumensVal / totalQty) : activeFixture.lumens
    };

    if (onSnapshotCapture) {
      const el = document.getElementById("illumination-diagram");
      if (el) {
        try {
          const captureWidth = el.clientWidth || 1000;
          const captureHeight = el.clientHeight || 550;
          const dataUrl = await toPng(el, {
            quality: 1,
            backgroundColor: "#020617",
            pixelRatio: 1,
            width: captureWidth,
            height: captureHeight,
            skipFonts: true,
            style: {
              opacity: "1",
              visibility: "visible",
              transform: "none",
              width: `${captureWidth}px`,
              height: `${captureHeight}px`,
            },
          });
          onSnapshotCapture(newSavedRoom.id, dataUrl, lpdLimitInfo.roomName);
        } catch (err) {
          console.warn("Failed to capture illumination state", err);
        }
      }
    }
    
    setParams({
      ...params,
      savedRooms: [...(params.savedRooms || []), newSavedRoom]
    });
  };

  const updateSavedRoom = (id: string, field: string, value: any) => {
    if (!params.savedRooms) return;
    
    const newRooms = params.savedRooms.map(r => {
      if (r.id === id) {
        const updated = { ...r, [field]: value };
        const isCustom = updated.fixtureId === 'custom';
        const fixWattage = isCustom ? (updated.fixtureWattage || params.customWattage || 15) : (getFixtureById(updated.fixtureId)?.wattage || 0);
        const fixLumens = isCustom ? (updated.fixtureLumens || params.customLumens || 1500) : (getFixtureById(updated.fixtureId)?.lumens || 1000 || 1);
        const cu = params.coefficientOfUtilization || 0.6;
        const mf = params.maintenanceFactor || 0.8;
        const areaVal = Number(updated.area) || 1;

        if (field === 'targetLux' || field === 'area') {
          const targetLuxVal = Number(updated.targetLux) || 0;
          const totalLumensRequiredForRoom = (targetLuxVal * areaVal) / (cu * mf);
          updated.fixturesCount = Math.max(1, Math.ceil(totalLumensRequiredForRoom / (fixLumens || 1)));
          updated.totalWattage = fixWattage * updated.fixturesCount;
          updated.totalLumens = fixLumens * updated.fixturesCount;
        } else if (field === 'fixturesCount') {
          updated.totalWattage = fixWattage * updated.fixturesCount;
          updated.totalLumens = fixLumens * updated.fixturesCount;
          updated.targetLux = Math.round((updated.fixturesCount * fixLumens * cu * mf) / areaVal);
        }
        return updated;
      }
      return r;
    });
    setParams({ ...params, savedRooms: newRooms });
  };

  const removeSavedRoom = (id: string) => {
    if (!params.savedRooms) return;
    setParams({
      ...params,
      savedRooms: params.savedRooms.filter(r => r.id !== id)
    });
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
              <select value={params.targetRoomName || Object.entries(RECOMMENDED_LUX_LEVELS).find(([_, lux]) => lux === params.targetLux)?.[0] || ""} onChange={e => {
                const val = e.target.value;
                const luxVal = RECOMMENDED_LUX_LEVELS[val];
                if (luxVal !== undefined) {
                  setParams({...params, targetRoomName: val, targetLux: luxVal});
                } else {
                  // Fallback if parsing old state
                  setParams({...params, targetLux: parseInt(val) || 0});
                }
              }} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-lg text-sm transition-colors focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none">
                {RECOMMENDED_LUX_LEVELS_CATEGORIZED && Object.entries(RECOMMENDED_LUX_LEVELS_CATEGORIZED).map(([category, items]) => (
                  <optgroup key={category} label={category} className="dark:bg-slate-900 dark:text-slate-100">
                    {items.map(item => (
                      <option key={item.name} value={item.name} className="dark:bg-slate-900 dark:text-slate-100">{item.name} ({item.lux} Lux)</option>
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

      <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl p-8 panel-container">
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
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
            <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <span>Selected Lighting Fixtures (Combined Design)</span>
              <span className="px-2.5 py-0.5 text-[9px] bg-indigo-150 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 rounded-md font-black font-mono">
                {params.activeFixtures ? params.activeFixtures.length : 1} TYPES IN DESIGN
              </span>
            </h4>
            <button 
              type="button"
              onClick={() => {
                const defaults = getPredefinedFixtureDefaults('ind-downlight', false);
                const nextNo = (params.activeFixtures || []).length;
                const newItem: ActiveFixtureSelection = {
                  id: crypto.randomUUID(),
                  fixtureId: 'ind-downlight',
                  lightType: 'Recessed LED Downlight',
                  quantity: 4,
                  wattage: 12,
                  lumens: 1000,
                  brands: 'Philips / Osram',
                  isCustom: false,
                  fixtureShape: defaults.fixtureShape,
                  fixtureWidth: defaults.fixtureWidth,
                  fixtureLength: defaults.fixtureLength,
                  fixtureDiameter: defaults.fixtureDiameter,
                  fixtureThickness: defaults.fixtureThickness,
                  fixtureBeamAngle: defaults.fixtureBeamAngle,
                  fixtureDistributionType: defaults.fixtureDistributionType
                };
                setParams(prev => {
                  let currentList = prev.activeFixtures;
                  if (!currentList || currentList.length === 0) {
                    const activeF = getFixtureById(prev.selectedFixtureId || 'ind-panel');
                    const defaultsSeed = getPredefinedFixtureDefaults(prev.selectedFixtureId || 'ind-panel', !!prev.isCustomFixture);
                    const isCustom = !!prev.isCustomFixture;
                    const seedFixture = {
                      id: crypto.randomUUID(),
                      fixtureId: prev.selectedFixtureId || 'ind-panel',
                      lightType: isCustom ? (prev.customLightType || 'Custom Fixture') : activeF.lightType,
                      quantity: 4,
                      wattage: isCustom ? (prev.customWattage || 15) : activeF.wattage,
                      lumens: isCustom ? (prev.customLumens || 1500) : activeF.lumens,
                      brands: isCustom ? 'Manual Intake Spec' : activeF.brands,
                      isCustom: isCustom,
                      fixtureShape: prev.fixtureShape || defaultsSeed.fixtureShape,
                      fixtureWidth: prev.fixtureWidth !== undefined ? prev.fixtureWidth : defaultsSeed.fixtureWidth,
                      fixtureLength: prev.fixtureLength !== undefined ? prev.fixtureLength : defaultsSeed.fixtureLength,
                      fixtureDiameter: prev.fixtureDiameter !== undefined ? prev.fixtureDiameter : defaultsSeed.fixtureDiameter,
                      fixtureThickness: prev.fixtureThickness !== undefined ? prev.fixtureThickness : defaultsSeed.fixtureThickness,
                      fixtureBeamAngle: prev.fixtureBeamAngle !== undefined ? prev.fixtureBeamAngle : defaultsSeed.fixtureBeamAngle,
                      fixtureDistributionType: prev.fixtureDistributionType || defaultsSeed.fixtureDistributionType
                    };
                    currentList = [seedFixture];
                  }
                  return {
                    ...prev,
                    activeFixtures: [...currentList, newItem]
                  };
                });
              }} 
              className="text-xs font-black text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-350 flex items-center justify-center gap-1.5 bg-indigo-50/50 dark:bg-indigo-950/20 px-3.5 py-2 rounded-xl border border-indigo-100 dark:border-indigo-900 transition-all shadow-sm"
            >
              <Plus className="w-4 h-4 text-indigo-500" /> 
              <span>Add Another Fixture Type</span>
            </button>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-stretch">
            {(params.activeFixtures || [
              {
                id: 'seeded',
                fixtureId: params.selectedFixtureId || 'ind-panel',
                lightType: activeFixture.lightType,
                quantity: calculation.fixtures || 4,
                wattage: activeFixture.wattage || 15,
                lumens: activeFixture.lumens || 1500,
                brands: activeFixture.brands || 'Pre-configured Spec',
                isCustom: !!params.isCustomFixture,
                fixtureShape: params.fixtureShape || 'square',
                fixtureWidth: params.fixtureWidth || 0.6,
                fixtureLength: params.fixtureLength || 0.6,
                fixtureDiameter: params.fixtureDiameter || 0.2,
                fixtureThickness: params.fixtureThickness || 0.05,
                fixtureBeamAngle: params.fixtureBeamAngle || 120,
                fixtureDistributionType: params.fixtureDistributionType || 'conical'
              }
            ]).map((af, idx) => {
              const bCustom = !!af.isCustom;
              return (
                <div key={af.id} className="relative bg-slate-50/30 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl flex flex-col md:flex-row md:items-center gap-5 justify-between">
                  <div className="flex items-center gap-4 flex-grow min-w-0">
                    <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-950/40 rounded-xl border border-indigo-100 dark:border-indigo-900 flex items-center justify-center shrink-0">
                      <Lightbulb className="w-6 h-6 text-indigo-500 dark:text-indigo-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                          Fixture Slot #{idx + 1} &middot; {bCustom ? 'Custom specifications' : af.brands}
                        </span>
                      </div>
                      
                      {bCustom ? (
                        <div className="space-y-1 mt-1">
                          <input 
                            type="text" 
                            value={af.lightType} 
                            placeholder="e.g. LED Custom Slot" 
                            onChange={e => {
                              const title = e.target.value;
                              setParams(prev => {
                                const list = [...(prev.activeFixtures || [])];
                                if (list[idx]) {
                                  list[idx] = { ...list[idx], lightType: title };
                                }
                                return { ...prev, activeFixtures: list };
                              });
                            }} 
                            className="w-full px-2 py-1 bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-750 text-slate-900 dark:text-slate-100 rounded text-xs font-bold outline-none" 
                          />
                        </div>
                      ) : (
                        <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate mt-0.5">{af.lightType}</h4>
                      )}

                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        {bCustom ? (
                          <div className="flex gap-2 items-center">
                            <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                              <span className="text-[10px] text-slate-450 font-bold">lm:</span>
                              <input 
                                type="number" 
                                value={af.lumens || ''} 
                                onChange={e => {
                                  const lmVal = Math.max(0, parseInt(e.target.value) || 0);
                                  setParams(prev => {
                                    const list = [...(prev.activeFixtures || [])];
                                    if (list[idx]) {
                                      list[idx] = { ...list[idx], lumens: lmVal };
                                    }
                                    return { ...prev, activeFixtures: list };
                                  });
                                }} 
                                className="w-14 bg-transparent outline-none text-xs font-mono font-bold text-yellow-600 dark:text-yellow-400 p-0"
                              />
                            </div>
                            <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                              <span className="text-[10px] text-slate-450 font-bold">W:</span>
                              <input 
                                type="number" 
                                value={af.wattage || ''} 
                                onChange={e => {
                                  const wVal = Math.max(0, parseInt(e.target.value) || 0);
                                  setParams(prev => {
                                    const list = [...(prev.activeFixtures || [])];
                                    if (list[idx]) {
                                      list[idx] = { ...list[idx], wattage: wVal };
                                    }
                                    return { ...prev, activeFixtures: list };
                                  });
                                }} 
                                className="w-10 bg-transparent outline-none text-xs font-mono font-bold text-slate-600 dark:text-slate-400 p-0"
                              />
                            </div>
                          </div>
                        ) : (
                          <>
                            <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200/50 dark:border-amber-900/30 px-2.5 py-0.5 rounded-md">
                              {af.lumens} lm
                            </span>
                            <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-350 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 px-2.5 py-0.5 rounded-md">
                              {af.wattage}W
                            </span>
                          </>
                        )}
                        <span className="text-[11px] font-mono text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-200/50 dark:border-indigo-900/30 px-2.5 py-0.5 rounded-md uppercase">
                          {af.fixtureShape} &middot; {af.fixtureBeamAngle}°
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 justify-between md:justify-end shrink-0 select-none border-t md:border-t-0 border-slate-100 dark:border-slate-800 pt-3 md:pt-0">
                    {/* Quantity Selector Spinner */}
                    <div className="flex flex-col items-center gap-1.5">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Quantity</span>
                      <div className="flex items-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-1 shadow-sm">
                        <button 
                          type="button" 
                          onClick={() => {
                            setParams(prev => {
                              const list = [...(prev.activeFixtures || [])];
                              if (list[idx] && list[idx].quantity > 1) {
                                list[idx] = { ...list[idx], quantity: list[idx].quantity - 1 };
                              }
                              return { ...prev, activeFixtures: list };
                            });
                          }}
                          className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                        >
                          -
                        </button>
                        <span className="w-8 text-center text-xs font-mono font-black text-indigo-600 dark:text-indigo-400">
                          {af.quantity}
                        </span>
                        <button 
                          type="button"
                          onClick={() => {
                            setParams(prev => {
                              const list = [...(prev.activeFixtures || [])];
                              if (list[idx]) {
                                list[idx] = { ...list[idx], quantity: list[idx].quantity + 1 };
                              }
                              return { ...prev, activeFixtures: list };
                            });
                          }}
                          className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {/* Actions: Swap and Delete */}
                    <div className="flex flex-col gap-1.5 self-end">
                      <button 
                        type="button"
                        onClick={() => {
                          setEditingFixtureIndex(idx);
                          setShowFixtureModal(true);
                        }} 
                        className="px-3.5 py-1.5 bg-white hover:bg-indigo-50/50 dark:bg-slate-800 dark:hover:bg-indigo-950/40 text-slate-700 hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-400 border border-slate-250 dark:border-slate-700 hover:border-indigo-300 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm"
                      >
                        <List className="w-3.5 h-3.5 text-slate-400" />
                        <span>Swap fixture</span>
                      </button>
                      
                      {(params.activeFixtures || []).length > 1 && (
                        <button 
                          type="button"
                          onClick={() => {
                            setParams(prev => {
                              const list = [...(prev.activeFixtures || [])];
                              list.splice(idx, 1);
                              return { ...prev, activeFixtures: list };
                            });
                          }} 
                          className="px-3.5 py-1 bg-rose-50/80 hover:bg-rose-100 text-rose-600 border border-rose-100/50 dark:bg-rose-950/20 dark:hover:bg-rose-900/30 dark:text-rose-400 dark:border-rose-900/45 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                          <span>Remove</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
          
          {/* Main lumen estimation left box */}
          <div className="md:col-span-1 space-y-6">
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div>
                <label className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Required Target Illuminance</label>
              </div>
              <div className="bg-slate-50/50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-700/50 px-4 py-3 rounded-2xl flex items-center justify-between shadow-sm">
                <div>
                  <span className="text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase block tracking-wider">Target Lux</span>
                  <span className="text-lg font-mono font-black text-slate-900 dark:text-slate-100 tracking-tight">{params.targetLux} <span className="text-[10px] text-slate-500 font-bold font-sans">LUX</span></span>
                </div>
                <div className="text-right">
                  <span className="text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase block tracking-wider">Zone Type</span>
                  <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 tracking-tight">{lpdLimitInfo.roomName}</span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-400"></div>
                <label className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-widest block font-sans">Mounting Clearance</label>
              </div>
              <div className="bg-slate-50/50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-700/50 p-4 rounded-2xl font-mono text-xs text-slate-600 dark:text-slate-400 space-y-2 shadow-sm">
                <div className="flex justify-between items-center"><span className="text-slate-500 font-sans text-[11px] font-medium uppercase tracking-wider">Ceiling Height:</span><span className="font-bold text-slate-900 dark:text-slate-200">{ceilingHeight}m</span></div>
                <div className="flex justify-between items-center"><span className="text-slate-500 font-sans text-[11px] font-medium uppercase tracking-wider">Working Plane:</span><span className="font-bold text-slate-900 dark:text-slate-200">+{workingPlaneHeight}m</span></div>
                <div className="border-t border-slate-200 dark:border-slate-700/50 pt-2 mt-2 flex justify-between items-center text-slate-900 dark:text-slate-100 font-sans font-black">
                  <span className="text-[11px] uppercase tracking-wider">Effective Height (H):</span>
                  <span className="text-indigo-600 dark:text-indigo-400 font-mono font-bold">{mountingHeight.toFixed(2)}m</span>
                </div>
              </div>
            </div>

            <div className="relative overflow-hidden bg-slate-900 dark:bg-slate-950 border border-slate-800 rounded-3xl p-6 text-white shadow-lg text-center">
               <div className="relative z-10">
                 <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-1 block">{params.activeFixtures && params.activeFixtures.length > 1 ? 'Combined Quantity in Layout' : 'Quantity of Luminaires'}</span>
                 <div className="flex items-baseline justify-center gap-1.5">
                   <p className="text-[80px] leading-[1] font-mono font-black text-amber-400 tracking-tighter">
                     {params.activeFixtures && params.activeFixtures.length > 1 
                       ? params.activeFixtures.reduce((sum, f) => sum + (f.quantity || 0), 0)
                       : calculation.fixtures}
                   </p>
                 </div>
                 <p className="text-[10px] font-bold text-slate-500 uppercase mt-2 tracking-wider">Fixtures Distributed</p>
                 
                 <div className="w-full mt-6 pt-5 border-t border-slate-800 grid grid-cols-2 gap-4 text-center">
                    <div>
                       <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Est. Room Area</span>
                       <p className="text-base font-mono font-bold text-slate-100">{calculation.area} <span className="text-[10px] text-slate-500 font-sans">m²</span></p>
                    </div>
                    <div>
                       <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Total Required Lm</span>
                       <p className="text-base font-mono font-bold text-slate-100">{calculation.totalLumens}</p>
                    </div>
                 </div>
                 {circuits && setCircuits && (
                   <div className="flex flex-col gap-2 mt-6">
                     <button 
                       type="button"
                       onClick={handleAddToIlluminationTable}
                       className="w-full bg-indigo-500 hover:bg-indigo-400 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-900"
                     >
                       <Plus className="w-4 h-4" /> Add to Illumination Table
                     </button>
                     <button 
                       type="button"
                       onClick={handleAddToSchedule}
                       className="w-full bg-amber-400 hover:bg-amber-300 text-amber-950 font-bold py-3 px-4 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 text-sm focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-slate-900"
                     >
                       <Link className="w-4 h-4" /> Add to Load Schedule
                     </button>
                   </div>
                 )}
               </div>
               
               {/* Background pattern */}
               <div className="absolute right-[-20px] bottom-[-20px] opacity-[0.03] select-none pointer-events-none">
                 <svg width="120" height="120" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                   <path d="M12 2L22 22H2L12 2Z" />
                 </svg>
               </div>
            </div>
          </div>

          {/* Interactive view main column */}
          <div className="md:col-span-2 border border-slate-200 rounded-2xl p-6 bg-slate-50/50">

            {/* TAB 1: 3D Visualization */}
            {activeSubTab === '3d' && (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
                   <div>
                     <span className="text-[10px] font-black text-indigo-505 uppercase tracking-widest block text-indigo-600 dark:text-indigo-400">Interactive Scene</span>
                     <span className="text-base font-extrabold text-slate-800 dark:text-slate-100">Room Physical Layout</span>
                   </div>
                   <div className="flex flex-wrap items-center gap-3">
                     {/* View Mode Toggle */}
                     <div className="flex bg-slate-100 dark:bg-slate-900 p-0.5 rounded-lg border border-slate-200 dark:border-slate-800">
                       <button
                         type="button"
                         onClick={() => setLayoutViewMode('3d')}
                         className={`px-3 py-1 text-[11px] font-bold rounded-md transition-all ${layoutViewMode === '3d' ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                       >
                         3D Orbit CAD
                       </button>
                       <button
                         type="button"
                         onClick={() => setLayoutViewMode('drag')}
                         className={`px-3 py-1 text-[11px] font-bold rounded-md transition-all flex items-center gap-1 ${layoutViewMode === 'drag' ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                       >
                         <Maximize className="w-2.5 h-2.5" /> 2D Drag & Place
                       </button>
                     </div>

                     {/* False Color Render */}
                     <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-2.5 py-1 rounded-lg">
                       <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">False Color</span>
                       <button 
                         type="button"
                         onClick={() => setShowFalseColor(!showFalseColor)}
                         className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 focus:outline-none ${showFalseColor ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'}`}
                       >
                         <div className={`w-4 h-4 rounded-full bg-white shadow-sm transform transition-transform duration-200 ${showFalseColor ? 'translate-x-4' : 'translate-x-0'}`} />
                       </button>
                     </div>
                   </div>
                </div>

                {params.inputMode === 'dimensions' && params.roomWidth > 0 && params.roomLength > 0 ? (
                  <>
                  {layoutViewMode === '3d' ? (
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
                      fixtureShape={params.fixtureShape}
                      fixtureWidth={params.fixtureWidth}
                      fixtureLength={params.fixtureLength}
                      fixtureDiameter={params.fixtureDiameter}
                      fixtureThickness={params.fixtureThickness}
                      fixtureBeamAngle={params.fixtureBeamAngle}
                      fixtureDistributionType={params.fixtureDistributionType}
                      activeFixtures={params.activeFixtures}
                      customPositions={params.customPositions}
                    />
                  ) : (
                    // 2D Drag-and-drop Layout Panel
                    <div className="space-y-4">
                      {/* Interactive Drag SVG/HTML Board */}
                      <div className="flex flex-col items-center justify-center bg-slate-900 dark:bg-slate-950 p-6 rounded-2xl border border-slate-800 relative select-none touch-none overflow-hidden" style={{ minHeight: '440px' }}>
                        
                        {/* Blueprint grid background lines */}
                        <div className="absolute inset-0 opacity-[0.07] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#38bdf8 1px, transparent 1px)', backgroundSize: '16px 16px' }} />
                        
                        {/* Heading & stats */}
                        <div className="absolute top-3 left-4 text-left z-10">
                          <span className="block text-[9px] font-black text-sky-400 uppercase tracking-widest">Tactile Placement Editor</span>
                          <span className="block text-xs font-bold text-slate-300">Drag fixtures to reposition. Calculations update instantly.</span>
                        </div>

                        <div className="absolute top-3 right-4 z-10 flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              // snap to a crisp 10cm grid
                              if (params.customPositions) {
                                const snapped = params.customPositions.map(cp => ({
                                  ...cp,
                                  x: Number((Math.round(cp.x * 10) / 10).toFixed(1)),
                                  z: Number((Math.round(cp.z * 10) / 10).toFixed(1))
                                }));
                                setParams(prev => ({ ...prev, customPositions: snapped }));
                              }
                            }}
                            className="text-[10px] font-bold bg-slate-800 hover:bg-slate-700 text-sky-405 px-2.5 py-1 rounded border border-slate-705 transition-colors flex items-center gap-1 text-sky-400"
                          >
                            <Grid className="w-3 h-3" /> Snap to 10cm Grid
                          </button>
                        </div>

                        {/* Centered Floor Container */}
                        {(() => {
                          const w = params.roomWidth || 4;
                          const l = params.roomLength || 5;
                          const maxPix = 320;
                          const scale = maxPix / Math.max(w, l);
                          const pixW = w * scale;
                          const pixL = l * scale;

                          return (
                            <div 
                              ref={dragContainerRef}
                              onMouseMove={handleDragMove}
                              onTouchMove={handleDragMove}
                              onMouseUp={handleDragEnd}
                              onTouchEnd={handleDragEnd}
                              className="relative border-4 border-slate-600/80 bg-slate-950/40 rounded shadow-2xl transition-all overflow-hidden cursor-crosshair select-none touch-none"
                              style={{ width: `${pixW}px`, height: `${pixL}px` }}
                            >
                              {/* Uniformity Grid live background if False Color Render is enabled */}
                              {showFalseColor && (
                                <canvas
                                  id="falseColorCanvas2D"
                                  className="absolute inset-0 w-full h-full opacity-60 pointer-events-none"
                                  ref={(canvas) => {
                                    if (canvas) {
                                      const ctx = canvas.getContext('2d');
                                      if (ctx) {
                                        // Draw a simple, beautiful 64x64 interpolated false color heatmap of the room
                                        const skyIllum = skyCondition === 'clear' ? 35000 : skyCondition === 'partly' ? 18000 : 7000;
                                        const imgData = ctx.createImageData(64, 64);
                                        const activeFixts = params.customPositions || [];
                                        
                                        for (let cz = 0; cz < 64; cz++) {
                                          for (let cx = 0; cx < 64; cx++) {
                                            const rx = (cx / 63) * w;
                                            const rz = (cz / 63) * l;
                                            
                                            let pointLuxVal = 0;
                                            activeFixts.forEach(cp => {
                                              pointLuxVal += calcSinglePointLux(rx, rz, cp, params.activeFixtures, params.coefficientOfUtilization, params.maintenanceFactor, mountingHeight, activeFixture.lumens);
                                            });
                                            
                                            if (enableDaylight) {
                                              const daylightFactorAtWall = 0.08 * (windowArea / (w * l)) * 100;
                                              const daylightFactorAtPoint = daylightFactorAtWall * Math.exp(-0.5 * rz);
                                              pointLuxVal += (daylightFactorAtPoint * skyIllum) / 100;
                                            }
                                            
                                            // Map pointLux to False Color spectrum
                                            const val = Math.min(1.0, pointLuxVal / Math.max(100, params.targetLux * 1.8));
                                            
                                            // Spectrum interpolation: Blue -> Cyan -> Green -> Yellow -> Red
                                            let rgb = [0, 0, 0];
                                            if (val < 0.25) {
                                              const f = val / 0.25;
                                              rgb = [0, Math.round(f * 255), 255];
                                            } else if (val < 0.5) {
                                              const f = (val - 0.25) / 0.25;
                                              rgb = [0, 255, Math.round((1 - f) * 255)];
                                            } else if (val < 0.75) {
                                              const f = (val - 0.5) / 0.25;
                                              rgb = [Math.round(f * 255), 255, 0];
                                            } else {
                                              const f = (val - 0.75) / 0.25;
                                              rgb = [255, Math.round((1 - f) * 255), 0];
                                            }
                                            
                                            const idx = (cz * 64 + cx) * 4;
                                            imgData.data[idx] = rgb[0];
                                            imgData.data[idx+1] = rgb[1];
                                            imgData.data[idx+2] = rgb[2];
                                            imgData.data[idx+3] = 255;
                                          }
                                        }
                                        ctx.putImageData(imgData, 0, 0);
                                      }
                                    }
                                  }}
                                  style={{ imageRendering: 'pixelated' }}
                                />
                              )}

                              {/* Floor tick boundary measurements labels */}
                              <div className="absolute inset-0 pointer-events-none opacity-[0.12] border-t border-b border-sky-400" style={{ backgroundSize: `${scale}px ${scale}px`, backgroundImage: 'linear-gradient(to right, #38bdf8 1px, transparent 1px), linear-gradient(to bottom, #38bdf8 1px, transparent 1px)' }} />

                              {/* Compass indicator representing North wall Window position */}
                              <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-sky-500 via-sky-400 to-sky-500 shadow flex items-center justify-center pointer-events-none">
                                <span className="text-[7px] text-sky-950 font-black tracking-widest bg-sky-200 px-2 rounded-b">NORTH WALL (WINDOW LEVEL)</span>
                              </div>

                              {/* Draw 5x5 Uniformity sensor nodes overlay dynamically on their locations */}
                              {luxGridData.grid.map((row, rIdx) => {
                                const sensorZPct = (0.1 + rIdx * 0.2) * 100;
                                return row.map((luxVal, cIdx) => {
                                  const sensorXPct = (0.1 + cIdx * 0.2) * 100;
                                  return (
                                    <div 
                                      key={`sensor-${rIdx}-${cIdx}`}
                                      className="absolute transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center p-0.5 rounded pointer-events-none"
                                      style={{ left: `${sensorXPct}%`, top: `${sensorZPct}%` }}
                                    >
                                      <div className="w-1.5 h-1.5 rounded-full bg-slate-400/80 animate-ping absolute" />
                                      <div className="w-1.5 h-1.5 rounded-full bg-slate-400/50" />
                                      <span className="text-[7px] font-mono text-slate-400 bg-slate-950/80 scale-90 px-0.5 rounded font-black mt-0.5">{luxVal} lx</span>
                                    </div>
                                  );
                                });
                              })}

                              {/* Draggable Fixtures nodes */}
                              {(params.customPositions || []).map((cp, idx) => {
                                const isDraggingThis = draggedFixtureId === cp.id;
                                const matchingAf = params.activeFixtures?.find(f => f.fixtureId === cp.fixtureId);
                                const shape = matchingAf?.fixtureShape || params.fixtureShape || 'square';
                                const isLinear = shape === 'linear';
                                const isCircular = shape === 'circular';
                                const isRect = shape === 'rectangular';
                                
                                // Color assignment for layout legend indexing
                                const colorClass = idx % 4 === 0 
                                  ? 'from-amber-450 to-yellow-500 hover:from-amber-300 hover:to-yellow-400 shadow-amber-500/30 text-amber-950' 
                                  : idx % 4 === 1
                                    ? 'from-cyan-405 to-teal-500 hover:from-cyan-330 hover:to-teal-400 shadow-cyan-500/30 text-cyan-950'
                                    : idx % 4 === 2
                                      ? 'from-pink-405 to-rose-500 hover:from-pink-330 hover:to-rose-400 shadow-pink-500/30 text-rose-955'
                                      : 'from-violet-405 to-indigo-505 hover:from-violet-330 hover:to-indigo-400 shadow-violet-500/30 text-indigo-950';
                                
                                return (
                                  <div
                                    id={`drag-fixture-${cp.id}`}
                                    key={cp.id}
                                    onMouseDown={(e) => handleDragStart(cp.id, e)}
                                    onTouchStart={(e) => handleDragStart(cp.id, e)}
                                    className={`absolute cursor-grab active:cursor-grabbing select-none z-20 group`}
                                    style={{ 
                                      left: `${(cp.x / w) * 100}%`, 
                                      top: `${(cp.z / l) * 100}%`,
                                      transform: `translate(-50%, -50%) rotate(${cp.rotationDegrees || 0}deg)`
                                    }}
                                  >
                                    {/* Rotate handle */}
                                    <div 
                                      className="absolute -top-[28px] left-1/2 -translate-x-1/2 w-6 h-6 flex items-center justify-center cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-white bg-slate-900/60 rounded-full border border-slate-700/50 shadow-lg hover:bg-sky-500 hover:border-sky-400 z-30"
                                      onMouseDown={(e) => handleRotateStart(cp.id, e)}
                                      onTouchStart={(e) => handleRotateStart(cp.id, e)}
                                    >
                                      <RotateCw className="w-[12px] h-[12px]" />
                                    </div>

                                    {/* Styled Physical bounding box matching true scaled dimensions with glow */}
                                    <div 
                                      className={`relative border flex items-center justify-center bg-gradient-to-br ${colorClass} transition-shadow shadow-md ${(isDraggingThis || rotatingFixtureId === cp.id) ? 'scale-110 shadow-lg cursor-grabbing border-white ring-2 ring-sky-400' : 'border-slate-800/80'}`}
                                      style={{
                                        width: isLinear ? '42px' : isCircular ? '32px' : isRect ? '38px' : '32px',
                                        height: isLinear ? '12px' : isCircular ? '32px' : isRect ? '24px' : '32px',
                                        borderRadius: isCircular ? '50%' : isLinear ? '4px' : isRect ? '4px' : '2px',
                                      }}
                                    >
                                      {/* Small Lightbulb center point */}
                                      <Lightbulb className={`w-3.5 h-3.5 text-slate-900 pointer-events-none ${isLinear ? 'scale-75' : ''}`} />
                                      
                                      {/* Index indicator */}
                                      <span className="absolute -top-1.5 -right-1.5 bg-slate-900 text-white text-[8px] font-black rounded-full w-3.5 h-3.5 flex items-center justify-center border border-slate-700 pointer-events-none">
                                        {idx + 1}
                                      </span>

                                      {/* Scaled beam angle dispersion coverage indicator circle */}
                                      <div 
                                        className="absolute rounded-full border border-yellow-400/25 bg-yellow-400/[0.04] pointer-events-none transition-opacity scale-100 group-hover:opacity-100 opacity-0"
                                        style={{
                                          width: `${Math.tan((matchingAf?.fixtureBeamAngle || 120) / 2 * Math.PI / 180) * mountingHeight * scale * 2}px`,
                                          height: `${Math.tan((matchingAf?.fixtureBeamAngle || 120) / 2 * Math.PI / 180) * mountingHeight * scale * 2}px`,
                                          left: '50%',
                                          top: '50%',
                                          transform: 'translate(-50%, -50%)',
                                        }}
                                      />
                                    </div>

                                    {/* Tactile Coordinate tooltip overlay */}
                                    <div 
                                      className="absolute top-full left-1/2 mt-1.5 bg-slate-950/90 text-[8px] text-sky-400 font-mono tracking-wider whitespace-nowrap rounded px-1.5 py-0.5 border border-slate-800 shadow pointer-events-none transition-all group-hover:opacity-100 group-hover:visible"
                                      style={{ transform: `translate(-50%, 0) rotate(${-(cp.rotationDegrees || 0)}deg)` }}
                                    >
                                      X: {cp.x.toFixed(2)}m | Z: {cp.z.toFixed(2)}m | ∠{Math.round(cp.rotationDegrees || 0)}°
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}

                        {/* Drag and Drop instructions instructions footer */}
                        <div className="absolute bottom-3 text-center w-full px-4 pointer-events-none">
                          <span className="text-[10px] font-bold text-slate-400">
                            Hold & Drag any fixture to update illumination results in real-time. Room boundaries: {params.roomWidth}m (width) by {params.roomLength}m (length).
                          </span>
                        </div>
                      </div>

                      {/* Tactical Reset and Helper Actions Toolbar */}
                      <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-800 border border-slate-205 dark:border-slate-700 p-4 rounded-xl shadow-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
                          <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                            Tactile Placement Synced: <strong className="font-extrabold text-indigo-600 dark:text-indigo-400">{params.customPositions?.length || 0} Fixtures Connected</strong>
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              const list: PlacedFixtureDragPosition[] = [];
                              const w = params.roomWidth || 4;
                              const l = params.roomLength || 5;
                              const ratio = w / Math.max(0.1, l);
                              
                              if (params.activeFixtures && params.activeFixtures.length > 0) {
                                params.activeFixtures.forEach((af, afIdx) => {
                                  const q = af.quantity || 0;
                                  if (q <= 0) return;
                                  
                                  let cols = Math.ceil(Math.sqrt(q));
                                  let rows = Math.ceil(q / cols);
                                  cols = Math.max(1, Math.round(Math.sqrt(q * ratio)));
                                  rows = Math.ceil(q / cols);
                                  
                                  const stepZ = l / rows;
                                  for (let r = 0; r < rows; r++) {
                                    const startIdx = r * cols;
                                    const endIdx = Math.min(q, (r + 1) * cols);
                                    const countRow = endIdx - startIdx;
                                    if (countRow <= 0) continue;
                                    
                                    const rowStepX = w / countRow;
                                    for (let c = 0; c < countRow; c++) {
                                      let staggerX = 0;
                                      let staggerZ = 0;
                                      if (params.activeFixtures!.length > 1) {
                                        const thetaOffset = (afIdx / params.activeFixtures!.length) * 2 * Math.PI;
                                        const radiusOffset = 0.15;
                                        staggerX = radiusOffset * Math.cos(thetaOffset);
                                        staggerZ = radiusOffset * Math.sin(thetaOffset);
                                      }
                                      
                                      let proposedX = rowStepX / 2 + c * rowStepX + staggerX;
                                      let proposedZ = stepZ / 2 + r * stepZ + staggerZ;
                                      proposedX = Math.max(0.05, Math.min(w - 0.05, proposedX));
                                      proposedZ = Math.max(0.05, Math.min(l - 0.05, proposedZ));
                                      
                                      list.push({
                                        id: `fixture-${af.fixtureId}-${afIdx}-${r}-${c}-${Math.random().toString(36).substr(2, 4)}`,
                                        fixtureId: af.fixtureId,
                                        lightType: af.lightType,
                                        x: Number(proposedX.toFixed(3)),
                                        z: Number(proposedZ.toFixed(3)),
                                        lumens: af.lumens,
                                        wattage: af.wattage,
                                        activeFixtureId: af.id
                                      });
                                    }
                                  }
                                });
                              }
                              setParams(prev => ({ ...prev, customPositions: list }));
                            }}
                            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-850 dark:text-slate-200 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5"
                          >
                            <RefreshCw className="w-3.5 h-3.5" /> Snap to Spacing Grid
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Dynamic interactive form controls for physical shape/size/spread customization */}
                  <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 p-5 rounded-2xl shadow-sm mt-6 space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-indigo-505 rounded-full animate-pulse"></div>
                        <h4 className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider">Configure Fixture Dimensions & Light Distribution</h4>
                      </div>
                      <span className="text-[9px] bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded font-bold uppercase font-mono">DIALux / CAD Engine</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      
                      {/* Control 1: Shape */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider block">Physical Shape</label>
                        <select 
                          value={params.fixtureShape || 'square'}
                          onChange={e => setParams({ ...params, fixtureShape: e.target.value as any })}
                          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-lg text-xs font-bold focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                        >
                          <option value="square">Square Panel</option>
                          <option value="rectangular">Rectangular Plate</option>
                          <option value="circular">Circular Downlight/Dome</option>
                          <option value="linear">Linear Tube/Strip</option>
                        </select>
                      </div>

                      {/* Control 2: Sizes */}
                      {(params.fixtureShape === 'square' || params.fixtureShape === 'rectangular' || params.fixtureShape === 'linear' || !params.fixtureShape) && (
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider block">Fixture Width (m)</label>
                          <input 
                            type="number" 
                            step="0.01" 
                            min="0.01"
                            max="5.0"
                            value={params.fixtureWidth !== undefined ? params.fixtureWidth : 0.6}
                            onChange={e => setParams({ ...params, fixtureWidth: Math.max(0.01, parseFloat(e.target.value) || 0.6) })}
                            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-lg text-xs font-bold font-mono focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                          />
                        </div>
                      )}

                      {(params.fixtureShape === 'rectangular' || params.fixtureShape === 'linear') && (
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider block">Fixture Length (m)</label>
                          <input 
                            type="number" 
                            step="0.05" 
                            min="0.1"
                            max="10.0"
                            value={params.fixtureLength !== undefined ? params.fixtureLength : 1.2}
                            onChange={e => setParams({ ...params, fixtureLength: Math.max(0.05, parseFloat(e.target.value) || 1.2) })}
                            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-lg text-xs font-bold font-mono focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                          />
                        </div>
                      )}

                      {params.fixtureShape === 'circular' && (
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider block">Fixture Diameter (Ø m)</label>
                          <input 
                            type="number" 
                            step="0.01" 
                            min="0.02"
                            max="3.0"
                            value={params.fixtureDiameter !== undefined ? params.fixtureDiameter : 0.15}
                            onChange={e => setParams({ ...params, fixtureDiameter: Math.max(0.02, parseFloat(e.target.value) || 0.15) })}
                            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-lg text-xs font-bold font-mono focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                          />
                        </div>
                      )}

                      {/* Control 3: Thickness */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider block">Thickness/Height (m)</label>
                        <input 
                          type="number" 
                          step="0.01" 
                          min="0.005"
                          max="2.0"
                          value={params.fixtureThickness !== undefined ? params.fixtureThickness : 0.05}
                          onChange={e => setParams({ ...params, fixtureThickness: Math.max(0.005, parseFloat(e.target.value) || 0.05) })}
                          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-lg text-xs font-bold font-mono focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                        />
                      </div>

                      {/* Control 4: Dispersion */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider block">Dispersion Pattern</label>
                        <select 
                          value={params.fixtureDistributionType || 'conical'}
                          onChange={e => setParams({ ...params, fixtureDistributionType: e.target.value as any })}
                          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-lg text-xs font-bold focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                        >
                          <option value="conical">Conical Spot (Downlights)</option>
                          <option value="linear">Linear Spread (Tube lights)</option>
                          <option value="oblong">Oblong (Flood/Street Sconces)</option>
                          <option value="omni">Omnidirectional (Bulbs/Chandeliers)</option>
                        </select>
                      </div>

                    </div>

                    {/* Beam spread slider slider */}
                    <div className="bg-slate-50 dark:bg-slate-900/40 p-4 rounded-xl border border-slate-100 dark:border-slate-700/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                      <div className="space-y-0.5">
                        <span className="text-[11px] font-extrabold text-slate-700 dark:text-slate-300 block uppercase tracking-wider">Beam Spread Angle</span>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 normal-case">Directly governs the spotlight beam radius and the false color falloff gradients.</p>
                      </div>
                      <div className="flex items-center gap-3 w-full sm:max-w-xs shrink-0">
                        <input 
                          type="range"
                          min="15"
                          max="180"
                          step="5"
                          value={params.fixtureBeamAngle !== undefined ? params.fixtureBeamAngle : 120}
                          onChange={e => setParams({ ...params, fixtureBeamAngle: parseInt(e.target.value) || 120 })}
                          className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                        />
                        <span className="text-xs font-black text-slate-700 dark:text-slate-250 font-mono w-12 text-center bg-white dark:bg-slate-950 px-2 py-1 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm">{params.fixtureBeamAngle || 120}°</span>
                      </div>
                    </div>
                  </div>
                  </>
                ) : (
                  <div id="illumination-diagram" className="w-full h-[320px] bg-slate-100/80 rounded-xl border border-dashed border-slate-200 flex flex-col items-center justify-center text-center p-6 mt-8">
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
                    <td className="px-4 py-3">
                      <input 
                        type="number" 
                        step="0.1"
                        min="0.1"
                        value={room.area} 
                        onChange={(e) => updateSavedRoom(room.id, 'area', Number(e.target.value))}
                        className="w-20 bg-transparent p-1 border border-transparent hover:border-slate-300 focus:border-indigo-500 rounded outline-none transition-colors text-slate-800 font-medium font-mono"
                      />
                    </td>
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

      {/* Saved Room 3D CAD Representations Grid */}
      {params.savedRooms && params.savedRooms.length > 0 && snapshots && Object.keys(snapshots).length > 0 && (
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 overflow-hidden mt-6 no-print">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-slate-800">Saved Room 3D CAD Representations</h3>
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {params.savedRooms.map((room) => snapshots[room.id] ? (
              <div key={room.id} className="border-2 border-slate-800 rounded-xl overflow-hidden bg-slate-950 flex flex-col shadow border">
                <div className="bg-slate-900 border-b border-slate-800 p-3 text-center text-white text-xs font-bold uppercase tracking-wider flex items-center justify-between">
                  <span>{room.roomName}</span>
                  <span className="text-indigo-400">{room.targetLux} LUX required</span>
                </div>
                <div className="p-2 flex justify-center items-center w-full min-h-[300px]">
                   <img src={snapshots[room.id]} alt={`3D CAD mapping for ${room.roomName}`} className="w-full h-auto rounded drop-shadow object-contain filter" />
                </div>
              </div>
            ) : null)}
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
                <p className="text-sm font-medium text-slate-500">
                  {editingFixtureIndex !== null 
                    ? `Replacing fixture in Design Slot #${editingFixtureIndex + 1}` 
                    : 'Select a fixture to use in your calculation.'}
                </p>
              </div>
              <button 
                type="button"
                onClick={() => {
                  setShowFixtureModal(false);
                  setEditingFixtureIndex(null);
                  setSearchQuery('');
                  setSearchTab('local');
                }}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Success Notification Banner */}
            {successBanner && (
              <div className="mx-6 mt-4 p-3.5 bg-green-50 rounded-xl border border-green-200 flex items-center gap-2 text-sm text-green-800 font-semibold animate-fade-in">
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                <span>{successBanner}</span>
              </div>
            )}

            {/* Advanced Search & Filtering Controls */}
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="relative w-full md:max-w-md flex-grow">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400">
                  <Search className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={searchTab === "local" ? "Search brand, model, lumens, watts..." : "Enter keyword or model to search web catalog..."}
                  className="w-full text-sm rounded-lg pl-10 pr-10 py-2.5 bg-white border border-slate-200 text-slate-850 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-550 transition-all font-medium"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Advanced Source Tabs */}
              <div className="flex bg-slate-100 p-1 rounded-xl w-full md:w-auto self-stretch md:self-auto">
                <button
                  type="button"
                  onClick={() => setSearchTab('local')}
                  className={`flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all flex-1 md:flex-none cursor-pointer ${
                    searchTab === 'local'
                      ? 'bg-white shadow-sm text-slate-850'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Database className="w-3.5 h-3.5" />
                  <span>Local Library ({filteredLocalFixtures.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSearchTab('online')}
                  className={`flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all flex-1 md:flex-none cursor-pointer ${
                    searchTab === 'online'
                      ? 'bg-white shadow-sm text-slate-850'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>Online Web Catalog</span>
                </button>
              </div>
            </div>

            {/* Advanced Multi-faceted Filtering Bar (Collapsible) */}
            {searchTab === 'local' && (
              <div className="px-6 py-3 border-b border-slate-100 bg-slate-100/50 flex flex-col gap-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                      className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 text-xs font-bold hover:bg-slate-50 hover:border-slate-300 transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <Filter className="w-3.5 h-3.5 text-slate-500" />
                      <span>{showAdvancedFilters ? "Hide Filters" : "Show Advanced Filters"}</span>
                      {(filterCategory !== 'All' || filterMounting !== 'All' || filterMinWatt || filterMaxWatt || filterMinLumen || filterMaxLumen || filterOnlyFavs) && (
                        <span className="w-2 h-2 bg-indigo-600 rounded-full" />
                      )}
                    </button>
                    
                    {(filterCategory !== 'All' || filterMounting !== 'All' || filterMinWatt || filterMaxWatt || filterMinLumen || filterMaxLumen || filterOnlyFavs) && (
                      <button
                        type="button"
                        onClick={() => {
                          setFilterCategory('All');
                          setFilterMounting('All');
                          setFilterMinWatt('');
                          setFilterMaxWatt('');
                          setFilterMinLumen('');
                          setFilterMaxLumen('');
                          setFilterOnlyFavs(false);
                        }}
                        className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold underline"
                      >
                        Clear Filters
                      </button>
                    )}
                  </div>

                  {/* Export / Create Actions */}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowCreateForm(!showCreateForm);
                        setEditingFormFixtureId(null);
                        if (!showCreateForm) {
                          setFixtureForm({
                            lightType: '',
                            category: 'Recessed Downlights',
                            wattage: 15,
                            lumens: 1500,
                            efficacy: 100,
                            cct: '4000K (Neutral White)',
                            cri: 80,
                            mountingType: 'Recessed',
                            beamAngle: 110,
                            utilizationFactor: 0.65,
                            brands: 'Custom Spec',
                            description: '',
                            manufacturerReference: ''
                          });
                        }
                      }}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{showCreateForm ? 'Close Editor' : 'Create Custom Fixture'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleExportLibrary}
                      className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-705 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                      title="Export custom fixtures and favorites to .json"
                    >
                      <Download className="w-3.5 h-3.5 text-slate-500" />
                      <span>Export Catalog</span>
                    </button>
                    <label className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-705 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs">
                      <Upload className="w-3.5 h-3.5 text-slate-500" />
                      <span>Import Catalog</span>
                      <input
                        type="file"
                        accept=".json"
                        onChange={handleImportLibrary}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>

                {showAdvancedFilters && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-white border border-slate-200 rounded-xl animate-fade-in shadow-xs">
                    {/* Category Filter */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400">Category</label>
                      <select
                        value={filterCategory}
                        onChange={(e) => setFilterCategory(e.target.value)}
                        className="w-full text-xs font-bold text-slate-750 bg-slate-50 border border-slate-200 rounded-lg p-2 focus:ring-1 focus:ring-indigo-550 focus:outline-none"
                      >
                        <option value="All">All Categories ({allFixtures.length})</option>
                        {Array.from(new Set(allFixtures.map(f => f.category))).filter(Boolean).map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>

                    {/* Mounting Type Filter */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400">Mounting Type</label>
                      <select
                        value={filterMounting}
                        onChange={(e) => setFilterMounting(e.target.value)}
                        className="w-full text-xs font-bold text-slate-750 bg-slate-50 border border-slate-200 rounded-lg p-2 focus:ring-1 focus:ring-indigo-550 focus:outline-none"
                      >
                        <option value="All">All Mounting Types</option>
                        {Array.from(new Set(allFixtures.map(f => f.mountingType))).filter(Boolean).map(m => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </div>

                    {/* Wattage Limits */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400">Wattage Range (W)</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          placeholder="Min"
                          value={filterMinWatt}
                          onChange={(e) => setFilterMinWatt(e.target.value)}
                          className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-2 focus:outline-none focus:border-indigo-500"
                        />
                        <span className="text-slate-400 text-xs font-black">-</span>
                        <input
                          type="number"
                          placeholder="Max"
                          value={filterMaxWatt}
                          onChange={(e) => setFilterMaxWatt(e.target.value)}
                          className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-2 focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>

                    {/* Lumen Limits */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400">Lumen Range (lm)</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          placeholder="Min"
                          value={filterMinLumen}
                          onChange={(e) => setFilterMinLumen(e.target.value)}
                          className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-2 focus:outline-none focus:border-indigo-500"
                        />
                        <span className="text-slate-400 text-xs font-black">-</span>
                        <input
                          type="number"
                          placeholder="Max"
                          value={filterMaxLumen}
                          onChange={(e) => setFilterMaxLumen(e.target.value)}
                          className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-2 focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>

                    {/* Starred Favorites Toggle */}
                    <div className="col-span-full pt-1 flex items-center justify-between">
                      <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={filterOnlyFavs}
                          onChange={(e) => setFilterOnlyFavs(e.target.checked)}
                          className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                        />
                        <Heart className="w-3.5 h-3.5 fill-red-500 text-red-500" />
                        <span>Show Only Frequently Used & Favorited Fixtures</span>
                      </label>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Custom Created/Edited Specific Fixtures Form */}
            {searchTab === 'local' && showCreateForm && (
              <div className="mx-6 mt-4 p-5 bg-gradient-to-br from-indigo-50/40 via-white to-indigo-50/20 border border-indigo-150 rounded-xl shadow-xs">
                <div className="flex items-center justify-between mb-4 pb-2 border-b border-indigo-100">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-600 animate-spin" />
                    <h4 className="text-sm font-black text-indigo-950">
                      {editingFormFixtureId ? "Edit Fixture Specifications" : "Create New Custom Fixture"}
                    </h4>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateForm(false);
                      setEditingFormFixtureId(null);
                    }}
                    className="text-xs text-slate-450 hover:text-slate-700 font-extrabold uppercase bg-transparent border-0 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>

                <form onSubmit={handleSaveFixture} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {/* Light Type / Name */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-black uppercase text-slate-400">Fixture Model / Name *</label>
                    <input
                      type="text"
                      required
                      value={fixtureForm.lightType}
                      onChange={(e) => setFixtureForm({ ...fixtureForm, lightType: e.target.value })}
                      placeholder="e.g. Philips Smart Downlight Pro"
                      className="text-xs bg-white border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  {/* Brands / Manufacturer */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-black uppercase text-slate-400">Manufacturer / Brand</label>
                    <input
                      type="text"
                      value={fixtureForm.brands}
                      onChange={(e) => setFixtureForm({ ...fixtureForm, brands: e.target.value })}
                      placeholder="e.g. Philips Lighting / Cree"
                      className="text-xs bg-white border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  {/* Category Selection */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-black uppercase text-slate-400">Category</label>
                    <select
                      value={fixtureForm.category}
                      onChange={(e) => setFixtureForm({ ...fixtureForm, category: e.target.value })}
                      className="text-xs bg-white border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    >
                      <option value="Recessed Downlights">Recessed Downlights</option>
                      <option value="Surface Mounted">Surface Mounted</option>
                      <option value="Panel Lights">Panel Lights</option>
                      <option value="Linear & Batten">Linear & Batten</option>
                      <option value="Industrial & High-Bay">Industrial & High-Bay</option>
                      <option value="Outdoor & Street">Outdoor & Street</option>
                      <option value="Landscape & Specialty">Landscape & Specialty</option>
                      <option value="Emergency & Exit">Emergency & Exit</option>
                      <option value="Aesthetic & Decorative">Aesthetic & Decorative</option>
                      <option value="Track & Spotlights">Track & Spotlights</option>
                    </select>
                  </div>

                  {/* Wattage (W) */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-black uppercase text-slate-400">Fixture Wattage (W) *</label>
                    <input
                      type="number"
                      required
                      min="1"
                      step="0.1"
                      value={fixtureForm.wattage}
                      onChange={(e) => {
                        const w = parseFloat(e.target.value) || 0;
                        const eff = fixtureForm.efficacy;
                        setFixtureForm({ 
                          ...fixtureForm, 
                          wattage: w,
                          lumens: Math.round(w * eff)
                        });
                      }}
                      className="text-xs bg-white border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  {/* Luminous Flux / Lumens (lm) */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-black uppercase text-slate-400">Luminous Flux (Lumens lm) *</label>
                    <input
                      type="number"
                      required
                      min="10"
                      value={fixtureForm.lumens}
                      onChange={(e) => {
                        const lm = parseInt(e.target.value) || 0;
                        const w = fixtureForm.wattage || 1;
                        setFixtureForm({ 
                          ...fixtureForm, 
                          lumens: lm,
                          efficacy: Math.round(lm / w)
                        });
                      }}
                      className="text-xs bg-white border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  {/* Efficacy calculation output (lm/W) */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-black uppercase text-slate-400">Efficacy (lm/W)</label>
                    <input
                      type="number"
                      readOnly
                      value={fixtureForm.efficacy}
                      className="text-xs bg-slate-50 font-bold border border-slate-200 rounded-lg p-2.5 text-indigo-700 focus:outline-none"
                    />
                  </div>

                  {/* CCT - Color Temperature */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-black uppercase text-slate-400">Color temperature (CCT)</label>
                    <select
                      value={fixtureForm.cct}
                      onChange={(e) => setFixtureForm({ ...fixtureForm, cct: e.target.value })}
                      className="text-xs bg-white border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    >
                      <option value="2700K (Warm White)">2700K (Warm White)</option>
                      <option value="3000K (Warm White)">3000K (Warm White)</option>
                      <option value="4000K (Neutral White)">4000K (Neutral White)</option>
                      <option value="5000K (Daylight / Cool)">5000K (Daylight / Cool)</option>
                      <option value="6500K (Daylight)">6500K (Daylight)</option>
                    </select>
                  </div>

                  {/* CRI (Color Rendering Index) */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-black uppercase text-slate-400">Color Rendering Index (CRI Ra)</label>
                    <input
                      type="number"
                      min="50"
                      max="100"
                      value={fixtureForm.cri}
                      onChange={(e) => setFixtureForm({ ...fixtureForm, cri: parseInt(e.target.value) || 80 })}
                      className="text-xs bg-white border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  {/* Mounting Type */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-black uppercase text-slate-400">Mounting Type</label>
                    <select
                      value={fixtureForm.mountingType}
                      onChange={(e) => setFixtureForm({ ...fixtureForm, mountingType: e.target.value })}
                      className="text-xs bg-white border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    >
                      <option value="Recessed">Recessed</option>
                      <option value="Surface-mounted">Surface-mounted</option>
                      <option value="Suspended">Suspended</option>
                      <option value="Pendant">Pendant</option>
                      <option value="Wall-mounted">Wall-mounted</option>
                      <option value="Pole mounted">Pole mounted</option>
                      <option value="Ground / Flange mounted">Ground / Flange mounted</option>
                      <option value="Track mounted">Track mounted</option>
                    </select>
                  </div>

                  {/* Beam Angle (degrees) */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-black uppercase text-slate-400">Beam Angle (°)</label>
                    <input
                      type="number"
                      min="5"
                      max="360"
                      value={fixtureForm.beamAngle}
                      onChange={(e) => setFixtureForm({ ...fixtureForm, beamAngle: parseInt(e.target.value) || 120 })}
                      className="text-xs bg-white border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  {/* Utilization Factor (CoU) */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-black uppercase text-slate-400">Utilization Factor (UF / 0.0 - 1.0)</label>
                    <input
                      type="number"
                      min="0.1"
                      max="1.0"
                      step="0.01"
                      value={fixtureForm.utilizationFactor}
                      onChange={(e) => setFixtureForm({ ...fixtureForm, utilizationFactor: parseFloat(e.target.value) || 0.65 })}
                      className="text-xs bg-white border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  {/* Manufacturer Reference */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-black uppercase text-slate-400">Supplier Ref / Model No</label>
                    <input
                      type="text"
                      value={fixtureForm.manufacturerReference}
                      onChange={(e) => setFixtureForm({ ...fixtureForm, manufacturerReference: e.target.value })}
                      placeholder="e.g. MODEL-LED-S302"
                      className="text-xs bg-white border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  {/* Description */}
                  <div className="col-span-full flex flex-col gap-1">
                    <label className="text-[10px] font-black uppercase text-slate-400">Description</label>
                    <input
                      type="text"
                      value={fixtureForm.description}
                      onChange={(e) => setFixtureForm({ ...fixtureForm, description: e.target.value })}
                      placeholder="Add short notes or material certifications..."
                      className="text-xs bg-white border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  {/* Actions */}
                  <div className="col-span-full pt-2 flex items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setShowCreateForm(false);
                        setEditingFormFixtureId(null);
                      }}
                      className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer bg-transparent border-0"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2.5 text-xs font-black bg-indigo-650 hover:bg-indigo-750 text-white rounded-lg shadow-sm transition-colors cursor-pointer border-0"
                    >
                      {editingFormFixtureId ? "Update Fixture Spec" : "Save Fixture to Catalog"}
                    </button>
                  </div>
                </form>
              </div>
            )}
            
            <div className="p-6 overflow-y-auto w-full flex-grow">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {searchTab === 'local' ? (
                  <>
                    {/* Manual Specification Selection Entry */}
                    <button
                      type="button"
                      onClick={() => {
                        if (editingFixtureIndex !== null && params.activeFixtures) {
                          const list = [...params.activeFixtures];
                          const oldFixtureId = list[editingFixtureIndex]?.fixtureId;
                          if (list[editingFixtureIndex]) {
                            list[editingFixtureIndex] = {
                              ...list[editingFixtureIndex],
                              fixtureId: 'custom',
                              lightType: params.customLightType || 'Custom LED Fixture',
                              lumens: params.customLumens || 1500,
                              wattage: params.customWattage || 15,
                              isCustom: true,
                              brands: 'Manual Intake Spec'
                            };
                          }

                          let updatedCustomPositions = params.customPositions;
                          if (oldFixtureId && params.customPositions && params.customPositions.length > 0) {
                            const targetActiveF = list[editingFixtureIndex];
                            updatedCustomPositions = params.customPositions.map(cp => {
                              const isMatch = cp.activeFixtureId 
                                ? cp.activeFixtureId === targetActiveF?.id
                                : cp.fixtureId === oldFixtureId;
                              if (isMatch) {
                                return {
                                  ...cp,
                                  fixtureId: 'custom',
                                  lightType: params.customLightType || 'Custom LED Fixture',
                                  lumens: params.customLumens || 1500,
                                  wattage: params.customWattage || 15,
                                  activeFixtureId: targetActiveF?.id
                                };
                              }
                              return cp;
                            });
                          }

                          if (list.length === 1) {
                            setParams({ 
                              ...params, 
                              activeFixtures: list, 
                              customPositions: updatedCustomPositions,
                              isCustomFixture: true, 
                              selectedFixtureId: 'custom' 
                            });
                          } else {
                            setParams({ 
                              ...params, 
                              activeFixtures: list,
                              customPositions: updatedCustomPositions
                            });
                          }
                        } else {
                          setParams({ 
                            ...params, 
                            isCustomFixture: true, 
                            selectedFixtureId: 'custom', 
                            customLightType: params.customLightType || 'Custom LED Fixture', 
                            customLumens: params.customLumens || 1500, 
                            customWattage: params.customWattage || 15, 
                            lumensPerFixture: params.customLumens || 1500 
                          });
                        }
                        setShowFixtureModal(false);
                        setEditingFixtureIndex(null);
                      }}
                      className={`relative flex flex-col focus:outline-none text-left border rounded-xl overflow-hidden transition-all group p-5 bg-gradient-to-br from-indigo-50/10 to-white hover:border-indigo-400 hover:shadow-md cursor-pointer ${
                        isCurrentlyCustom ? 'border-indigo-500 ring-2 ring-indigo-500/30 scale-[1.02] shadow-md z-10 bg-indigo-50/10' : 'border-slate-200 border-dashed hover:border-indigo-300'
                      }`}
                    >
                      {isCurrentlyCustom && (
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

                    {filteredLocalFixtures.length === 0 ? (
                      <div className="col-span-full py-12 text-center text-slate-500 bg-slate-50 border border-slate-200 border-dashed rounded-xl p-6">
                        <AlertTriangle className="w-8 h-8 mx-auto text-amber-500 mb-2" />
                        <p className="font-bold text-slate-700">No matching library fixtures found</p>
                        <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">We couldn't find any fixture in our database matching "{searchQuery}". Try searching the web online for active manufacturer specs.</p>
                        <button
                          type="button"
                          onClick={() => setSearchTab('online')}
                          className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-lg transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <Globe className="w-3.5 h-3.5" />
                          <span>Search Web Online</span>
                        </button>
                      </div>
                    ) : (
                      filteredLocalFixtures.map((fixture) => (
                        <button
                          type="button"
                          key={fixture.id}
                          onClick={() => {
                            if (editingFixtureIndex !== null && params.activeFixtures) {
                              const list = [...params.activeFixtures];
                              const oldFixtureId = list[editingFixtureIndex]?.fixtureId;
                              const defaults = getPredefinedFixtureDefaults(fixture.id, false);
                              if (list[editingFixtureIndex]) {
                                list[editingFixtureIndex] = {
                                  ...list[editingFixtureIndex],
                                  fixtureId: fixture.id,
                                  lightType: fixture.lightType,
                                  lumens: fixture.lumens,
                                  wattage: fixture.wattage,
                                  brands: fixture.brands,
                                  isCustom: false,
                                  fixtureShape: defaults.fixtureShape,
                                  fixtureWidth: defaults.fixtureWidth,
                                  fixtureLength: defaults.fixtureLength,
                                  fixtureDiameter: defaults.fixtureDiameter,
                                  fixtureThickness: defaults.fixtureThickness,
                                  fixtureBeamAngle: defaults.fixtureBeamAngle,
                                  fixtureDistributionType: defaults.fixtureDistributionType
                                };
                              }

                               let updatedCustomPositions = params.customPositions;
                               if (oldFixtureId && params.customPositions && params.customPositions.length > 0) {
                                 const targetActiveF = list[editingFixtureIndex];
                                 updatedCustomPositions = params.customPositions.map(cp => {
                                   const isMatch = cp.activeFixtureId 
                                     ? cp.activeFixtureId === targetActiveF?.id
                                     : cp.fixtureId === oldFixtureId;
                                   if (isMatch) {
                                     return {
                                       ...cp,
                                       fixtureId: fixture.id,
                                       lightType: fixture.lightType,
                                       lumens: fixture.lumens,
                                       wattage: fixture.wattage,
                                       activeFixtureId: targetActiveF?.id
                                     };
                                   }
                                   return cp;
                                 });
                               }

                              if (list.length === 1) {
                                setParams({ 
                                  ...params, 
                                  activeFixtures: list,
                                  customPositions: updatedCustomPositions,
                                  selectedFixtureId: fixture.id,
                                  lumensPerFixture: fixture.lumens,
                                  isCustomFixture: false,
                                  fixtureShape: defaults.fixtureShape,
                                  fixtureWidth: defaults.fixtureWidth,
                                  fixtureLength: defaults.fixtureLength,
                                  fixtureDiameter: defaults.fixtureDiameter,
                                  fixtureThickness: defaults.fixtureThickness,
                                  fixtureBeamAngle: defaults.fixtureBeamAngle,
                                  fixtureDistributionType: defaults.fixtureDistributionType
                                });
                              } else {
                                setParams({ 
                                  ...params, 
                                  activeFixtures: list,
                                  customPositions: updatedCustomPositions
                                });
                              }
                            } else {
                              setParams({ ...params, selectedFixtureId: fixture.id, lumensPerFixture: fixture.lumens, isCustomFixture: false });
                            }
                            setShowFixtureModal(false);
                            setEditingFixtureIndex(null);
                          }}
                          className={`relative flex flex-col focus:outline-none text-left border rounded-xl overflow-hidden transition-all group cursor-pointer ${
                            (!isCurrentlyCustom && currentSelectedFixtureId === fixture.id) ? 'border-yellow-400 ring-2 ring-yellow-400/50 scale-[1.02] shadow-md z-10 bg-yellow-50/10' : 'border-slate-200 hover:border-slate-300 hover:shadow-md bg-white'
                          }`}
                        >
                          {(!isCurrentlyCustom && currentSelectedFixtureId === fixture.id) && (
                            <div className="absolute top-4 right-4 bg-white rounded-full z-10 shadow-sm">
                              <CheckCircle2 className="w-5 h-5 text-yellow-500" />
                            </div>
                          )}
                          <div className="p-5 w-full flex flex-col h-full">
                            <div className="flex items-center justify-between mb-2 gap-1.5">
                              <span className="text-[9px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md uppercase tracking-wider truncate max-w-[130px]">{fixture.category}</span>
                              <div className="flex items-center gap-1">
                                {/* Favorite Button */}
                                <button
                                  type="button"
                                  onClick={(e) => toggleFavorite(fixture.id, e)}
                                  className="p-1 rounded-full text-slate-400 hover:text-red-500 hover:bg-slate-100 transition-colors cursor-pointer bg-transparent border-0"
                                  title={fixture.isFavorite ? "Remove from Favorites" : "Add to Favorites"}
                                >
                                  <Heart className={`w-3.5 h-3.5 ${fixture.isFavorite ? 'fill-red-500 text-red-500' : ''}`} />
                                </button>

                                {/* Edit Button for Custom Items */}
                                {fixture.isCustom && (
                                  <button
                                    type="button"
                                    onClick={(e) => handleStartEditFixture(fixture, e)}
                                    className="p-1 rounded-full text-slate-400 hover:text-indigo-650 hover:bg-slate-100 transition-colors cursor-pointer bg-transparent border-0"
                                    title="Edit custom fixture"
                                  >
                                    <PenBox className="w-3.5 h-3.5" />
                                  </button>
                                )}

                                {/* Delete Button for Custom Items */}
                                {fixture.isCustom && (
                                  <button
                                    type="button"
                                    onClick={(e) => handleDeleteCustomFixture(fixture.id, e)}
                                    className="p-1 rounded-full text-slate-400 hover:text-red-600 hover:bg-slate-100 transition-colors cursor-pointer bg-transparent border-0"
                                    title="Delete custom fixture"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                            <p className="text-sm font-black text-slate-850 leading-tight mb-1 truncate" title={fixture.lightType}>{fixture.lightType}</p>
                            {fixture.manufacturerReference && fixture.manufacturerReference !== 'N/A' && (
                              <p className="text-[10px] text-slate-400 font-mono mb-2">Model: {fixture.manufacturerReference}</p>
                            )}

                            <div className="space-y-2 mt-2 text-xs text-slate-600 border-t border-slate-100 pt-2 flex-grow">
                              <div className="flex justify-between items-center text-[11px]">
                                <span className="text-slate-405 font-medium">Brands & Mfg:</span>
                                <span className="font-semibold text-slate-700 truncate max-w-[140px]" title={fixture.brands}>{fixture.brands}</span>
                              </div>

                              <div className="grid grid-cols-2 gap-2 text-[10px] bg-slate-50 p-2 rounded-lg">
                                <div>
                                  <span className="text-slate-400 block font-medium">CCT Temp</span>
                                  <span className="font-bold text-slate-700 block truncate">{fixture.cct || '4000K'}</span>
                                </div>
                                <div>
                                  <span className="text-slate-400 block font-medium">CRI Rating</span>
                                  <span className="font-bold text-slate-700 block">Ra {fixture.cri || 80}</span>
                                </div>
                                <div>
                                  <span className="text-slate-400 block font-medium">Mounting</span>
                                  <span className="font-bold text-slate-700 block truncate">{fixture.mountingType || 'Recessed'}</span>
                                </div>
                                <div>
                                  <span className="text-slate-400 block font-medium">Beam Angle</span>
                                  <span className="font-bold text-slate-700 block">{fixture.beamAngle || 120}°</span>
                                </div>
                              </div>
                            </div>

                            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                              <div className="flex flex-col">
                                <span className="text-[9px] text-slate-400 uppercase font-bold tracking-wider mb-0.5">Wattage</span>
                                <span className="text-xs font-black text-slate-750">{fixture.wattage} W</span>
                              </div>
                              <div className="flex flex-col items-center">
                                <span className="text-[9px] text-slate-400 uppercase font-bold tracking-wider mb-0.5">Efficacy</span>
                                <span className="text-xs font-black text-indigo-650">{fixture.efficacy || Math.round(fixture.lumens / fixture.wattage)} lm/W</span>
                              </div>
                              <div className="flex flex-col items-end">
                                <span className="text-[9px] text-slate-400 uppercase font-bold tracking-wider mb-0.5">Lumens</span>
                                <span className="text-xs font-black text-yellow-600">{fixture.lumens} lm</span>
                              </div>
                            </div>
                          </div>
                        </button>
                      ))
                    )}
                  </>
                ) : (
                  <>
                    {!searchQuery.trim() ? (
                      <div className="col-span-full py-12 text-center text-slate-500 bg-slate-50 border border-slate-200 border-dashed rounded-xl p-6">
                        <Globe className="w-8 h-8 mx-auto text-indigo-400 mb-2 animate-bounce" />
                        <p className="font-bold text-slate-700">Ready to search online catalogs</p>
                        <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">Enter light brand names, model numbers, or descriptions in the search bar to query live web data securely using Gemini Search grounding.</p>
                      </div>
                    ) : isSearchingOnline ? (
                      <div className="col-span-full py-12 text-center text-slate-500 bg-indigo-50/20 border border-indigo-100 rounded-xl p-6 flex flex-col items-center justify-center animate-pulse">
                        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mb-3" />
                        <p className="font-bold text-indigo-900">Querying Global Manufacturer Specs...</p>
                        <p className="text-xs text-indigo-650 mt-1 max-w-sm mx-auto">AI is actively searching live supplier documentation & industrial catalogs to discover specifications for "{searchQuery}".</p>
                      </div>
                    ) : onlineSearchError ? (
                      <div className="col-span-full py-12 text-center text-rose-500 bg-rose-50 border border-rose-200 border-dashed rounded-xl p-6">
                        <AlertTriangle className="w-8 h-8 mx-auto text-rose-500 mb-2" />
                        <p className="font-bold text-rose-700 font-sans">Search Unavailable</p>
                        <p className="text-xs text-rose-500 mt-1 max-w-sm mx-auto">{onlineSearchError}</p>
                      </div>
                    ) : onlineResults.length === 0 ? (
                      <div className="col-span-full py-12 text-center text-slate-500 bg-slate-50 border border-slate-200 border-dashed rounded-xl p-6">
                        <Search className="w-8 h-8 mx-auto text-slate-400 mb-2" />
                        <p className="font-bold text-slate-700 font-sans">No web matches found</p>
                        <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">We couldn't find matches on the web for your query. Try searching general terminology like "Cree troffer", "Lithonia round LED", or "Philips recessed panel".</p>
                      </div>
                    ) : (
                      onlineResults.map((fixture) => (
                        <div
                          key={fixture.id}
                          className="relative flex flex-col border border-slate-200 rounded-2xl overflow-hidden bg-white hover:border-indigo-300 hover:shadow-md transition-all p-5 text-left"
                        >
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-indigo-50 text-indigo-700 uppercase tracking-wider">
                              {fixture.category || "Indoor"}
                            </span>
                            {fixture.modelNumber && (
                              <span className="text-[10px] text-slate-400 font-mono" title="Model Number">
                                {fixture.modelNumber}
                              </span>
                            )}
                          </div>
                          <p className="text-base font-bold text-slate-800 leading-snug mb-1 truncate" title={fixture.lightType}>
                            {fixture.lightType}
                          </p>
                          <p className="text-xs text-slate-500 font-bold mb-3">
                            by {fixture.brands || fixture.manufacturer || "Unknown Brand"}
                          </p>
                          <p className="text-xs text-slate-400 line-clamp-3 mb-4 leading-relaxed font-medium">
                            {fixture.description || "Verified industrial lighting catalog specification."}
                          </p>
                          
                          <div className="mt-auto space-y-4">
                            <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-100">
                              <div className="flex flex-col">
                                <span className="text-[9px] text-slate-400 uppercase font-bold tracking-wider mb-0.5">Power Spec</span>
                                <span className="text-xs font-black text-slate-700">{fixture.wattage} Watts</span>
                              </div>
                              <div className="flex flex-col items-end">
                                <span className="text-[9px] text-slate-400 uppercase font-bold tracking-wider mb-0.5">Brightness</span>
                                <span className="text-xs font-black text-yellow-600">{fixture.lumens} Lumens</span>
                              </div>
                            </div>

                            <button
                              type="button"
                              disabled={importingFixtureId !== null}
                              onClick={() => handleImportFixture(fixture)}
                              className={`w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors shadow-sm cursor-pointer ${
                                importingFixtureId === fixture.id ? 'opacity-70' : ''
                              }`}
                            >
                              {importingFixtureId === fixture.id ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  <span>Importing...</span>
                                </>
                              ) : (
                                <>
                                  <Sparkles className="w-3.5 h-3.5" />
                                  <span>Import & Select</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
