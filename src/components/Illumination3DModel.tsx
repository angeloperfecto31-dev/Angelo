import React, { useEffect, useRef, useMemo, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ActiveFixtureSelection, PlacedFixtureDragPosition } from '../types';
import { RoomPoint, placePointsInPolygon, pointInPolygon, polygonArea } from '../utils/roomGeometry';

interface SceneProps {
  width: number;
  length: number;
  height: number; // This is mountingHeight for fixtures
  ceilingHeight: number; // This is actual ceiling height for walls
  fixtures: number;
  lumens: number;
  showFalseColor?: boolean;
  enableDaylight?: boolean;
  windowArea?: number;
  skyCondition?: 'overcast' | 'partly' | 'clear';
  isLpdCompliant?: boolean;
  lpdValue?: number;
  lpdLimit?: number;
  targetLux: number;
  fixtureShape?: 'rectangular' | 'square' | 'circular' | 'linear';
  fixtureWidth?: number;
  fixtureLength?: number;
  fixtureDiameter?: number;
  fixtureThickness?: number;
  fixtureBeamAngle?: number;
  fixtureDistributionType?: 'conical' | 'oblong' | 'omni' | 'linear';
  activeFixtures?: ActiveFixtureSelection[];
  customPositions?: PlacedFixtureDragPosition[];
  /** Non-rectangular room outline in metres (bounding box 0..width × 0..length) */
  roomPolygon?: RoomPoint[];
  /** Working plane height (m); height (mounting height) is measured from it */
  workingPlaneHeight?: number;
}

interface PlacedFixture {
  x: number;
  z: number;
  y: number;
  rotationDegrees?: number;
  lumens: number;
  wattage: number;
  fixtureId: string;
  lightType: string;
  resolved: ReturnType<typeof resolveFixtureParams>;
}

// Resolver for safe default parameters of a light fixture shape or size
export function resolveFixtureParams(
  shape?: string,
  width?: number,
  length?: number,
  diameter?: number,
  thickness?: number,
  beamAngle?: number,
  distributionType?: string
) {
  const finalShape = (shape || 'square') as 'square' | 'rectangular' | 'circular' | 'linear';
  return {
    shape: finalShape,
    width: width !== undefined && width > 0 ? width : (finalShape === 'linear' ? 0.05 : 0.6),
    length: length !== undefined && length > 0 ? length : (finalShape === 'linear' ? 1.2 : 0.6),
    diameter: diameter !== undefined && diameter > 0 ? diameter : 0.15,
    thickness: thickness !== undefined && thickness > 0 ? thickness : 0.05,
    beamAngle: beamAngle !== undefined && beamAngle >= 5 ? beamAngle : 120,
    distributionType: (distributionType || 'conical') as 'conical' | 'oblong' | 'omni' | 'linear',
  };
}

/** Fixture styles drawn in the 3D room, picked from the luminaire's name and shape */
type FixtureStyle =
  | 'panel'
  | 'downlight'
  | 'surface-round'
  | 'batten'
  | 'linear-profile'
  | 'highbay'
  | 'bulb'
  | 'spot'
  | 'flood'
  | 'pendant'
  | 'exit'
  | 'emergency';

export function fixtureStyleOf(lightType: string | undefined, shape: string): FixtureStyle {
  const t = (lightType || '').toLowerCase();
  if (/exit/.test(t)) return 'exit';
  if (/emergency|twin-head/.test(t)) return 'emergency';
  if (/high-bay|high bay|highbay|ufo/.test(t)) return 'highbay';
  if (/flood|street|area|wall pack|wall-pack|canopy|tunnel|stadium|sports|shoebox/.test(t)) return 'flood';
  if (/pendant|chandelier|drum|dome/.test(t) && !/profile|linear/.test(t)) return 'pendant';
  if (/linear|profile|low-bay|low bay|grazer|suspended/.test(t)) return 'linear-profile';
  if (/tube|t8|t5|batten|vapor|tri-proof|strip|cove/.test(t)) return 'batten';
  if (/bulb|a60|filament/.test(t)) return 'bulb';
  if (/spot|track|gu10|mr16|gimbal|pin-hole|accent|cob/.test(t)) return 'spot';
  if (/downlight/.test(t)) return 'downlight';
  if (/panel|troffer|clean room|hospital|examination/.test(t)) return 'panel';
  if (/ceiling|surface|sensor|bulkhead|flush/.test(t)) return shape === 'circular' ? 'surface-round' : 'panel';
  if (shape === 'linear') return 'batten';
  if (shape === 'circular') return 'downlight';
  return 'panel';
}

/** Recessed and ceiling-mounted styles sit on the ceiling; the others hang at the mounting height */
export const isCeilingStyle = (style: FixtureStyle) =>
  style === 'panel' || style === 'downlight' || style === 'surface-round' || style === 'batten' || style === 'exit' || style === 'emergency';

/** Small "EXIT" face texture */
function exitTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#16a34a';
    ctx.fillRect(0, 0, 128, 64);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 34px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('EXIT', 64, 34);
  }
  return new THREE.CanvasTexture(c);
}

/**
 * 3D luminaire model. The group's origin is the mounting point; the body hangs below it with the lit
 * diffuser facing the floor. dropToCeiling adds suspension cords/rods up to the ceiling, and a faint
 * beam shows the light spread down to the floor (dropToFloor) at the fixture's beam angle.
 */
export function createFixture3D(
  resolved: ReturnType<typeof resolveFixtureParams>,
  lightType: string | undefined,
  opts: { dropToCeiling: number; dropToFloor: number; showBeam: boolean; beamOpacity: number }
) {
  const group = new THREE.Group();
  const style = fixtureStyleOf(lightType, resolved.shape);

  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xe5e7eb, roughness: 0.55, metalness: 0.15 });
  const alumMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.35, metalness: 0.7 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x3f4654, roughness: 0.5, metalness: 0.55 });
  const blackMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.6, metalness: 0.3 });
  const cordMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.9 });
  // The lit diffuser is unshaded so it always reads as glowing
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xfff8e8 });

  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    group.add(m);
    return m;
  };
  const cord = (x: number, z: number, len: number) => {
    if (len <= 0.01) return;
    add(new THREE.CylinderGeometry(0.004, 0.004, len, 6), cordMat, x, len / 2, z);
    add(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 16), whiteMat, x, len - 0.006, z); // ceiling rose
  };

  const W = Math.max(resolved.width, 0.05);
  const L = Math.max(resolved.length, 0.05);
  const D = Math.max(resolved.diameter, 0.06);
  let bottom = 0; // lowest point of the body (negative, below the mounting point)
  let beamTopR = 0.05;
  let beamScaleX = 1;

  switch (style) {
    case 'panel': {
      // Flat panel / troffer: thin aluminium frame and an opal diffuser just below it
      const pw = resolved.shape === 'square' ? W : Math.max(W, L);
      const pl = resolved.shape === 'square' ? W : Math.min(W, L);
      add(new THREE.BoxGeometry(pw, 0.012, pl), whiteMat, 0, -0.006, 0);
      add(new THREE.BoxGeometry(pw - 0.03, 0.002, pl - 0.03), glowMat, 0, -0.0135, 0);
      bottom = -0.015;
      beamTopR = Math.min(pw, pl) / 2;
      beamScaleX = pw / Math.max(pl, 0.01);
      break;
    }
    case 'downlight': {
      const r = Math.min(D, 0.3) / 2;
      add(new THREE.CylinderGeometry(r + 0.015, r + 0.015, 0.008, 32), whiteMat, 0, -0.004, 0); // trim ring
      add(new THREE.CylinderGeometry(r * 0.82, r * 0.82, 0.002, 32), glowMat, 0, -0.0095, 0);
      bottom = -0.011;
      beamTopR = r * 0.8;
      break;
    }
    case 'surface-round': {
      const r = Math.max(D, Math.min(W, 0.6)) / 2;
      add(new THREE.CylinderGeometry(r, r * 1.03, 0.06, 40), whiteMat, 0, -0.03, 0);
      add(new THREE.CylinderGeometry(r * 0.92, r * 0.92, 0.003, 40), glowMat, 0, -0.0615, 0);
      bottom = -0.063;
      beamTopR = r * 0.9;
      break;
    }
    case 'batten': {
      // Batten / tube fitting along X: white body with an opal tube
      const len = Math.max(L, W, 0.6);
      add(new THREE.BoxGeometry(len, 0.035, 0.075), whiteMat, 0, -0.0175, 0);
      const tube = new THREE.CylinderGeometry(0.028, 0.028, len * 0.97, 20);
      tube.rotateZ(Math.PI / 2);
      add(tube, glowMat, 0, -0.045, 0);
      bottom = -0.073;
      beamTopR = 0.04;
      beamScaleX = (len / 2 + 0.6) / 0.6;
      break;
    }
    case 'linear-profile': {
      // Suspended aluminium profile with a lit strip underneath
      const len = Math.max(L, W, 0.6);
      cord(-len * 0.4, 0, opts.dropToCeiling);
      cord(len * 0.4, 0, opts.dropToCeiling);
      add(new THREE.BoxGeometry(len, 0.07, 0.065), alumMat, 0, -0.035, 0);
      add(new THREE.BoxGeometry(len * 0.98, 0.003, 0.048), glowMat, 0, -0.0715, 0);
      bottom = -0.073;
      beamTopR = 0.04;
      beamScaleX = (len / 2 + 0.6) / 0.6;
      break;
    }
    case 'highbay': {
      // UFO high-bay: hook, driver, finned heat sink and a lit lens
      const r = Math.max(D, W, 0.28) / 2;
      cord(0, 0, opts.dropToCeiling);
      const hook = new THREE.TorusGeometry(0.025, 0.005, 8, 16);
      add(hook, darkMat, 0, -0.025, 0);
      add(new THREE.CylinderGeometry(r * 0.4, r * 0.4, 0.07, 24), darkMat, 0, -0.085, 0);
      add(new THREE.CylinderGeometry(r * 0.88, r, 0.1, 36), darkMat, 0, -0.17, 0);
      for (let i = 0; i < 12; i++) {
        const fin = add(new THREE.BoxGeometry(0.006, 0.09, r * 0.5), darkMat, 0, -0.165, 0);
        fin.rotation.y = (i / 12) * Math.PI;
      }
      add(new THREE.CylinderGeometry(r * 0.86, r * 0.86, 0.004, 36), glowMat, 0, -0.222, 0);
      bottom = -0.224;
      beamTopR = r * 0.8;
      break;
    }
    case 'bulb': {
      cord(0, 0, opts.dropToCeiling);
      add(new THREE.CylinderGeometry(0.018, 0.022, 0.05, 16), blackMat, 0, -0.025, 0); // lamp holder
      add(new THREE.SphereGeometry(0.034, 24, 16), glowMat, 0, -0.082, 0);
      bottom = -0.116;
      beamTopR = 0.03;
      break;
    }
    case 'spot': {
      // Track adapter, stem and spotlight can with a lit lens
      add(new THREE.BoxGeometry(0.05, 0.02, 0.035), blackMat, 0, -0.01, 0);
      add(new THREE.CylinderGeometry(0.006, 0.006, 0.05, 8), blackMat, 0, -0.045, 0);
      add(new THREE.CylinderGeometry(0.038, 0.034, 0.11, 24), blackMat, 0, -0.125, 0);
      add(new THREE.CylinderGeometry(0.03, 0.03, 0.003, 24), glowMat, 0, -0.1815, 0);
      bottom = -0.183;
      beamTopR = 0.03;
      break;
    }
    case 'flood': {
      // Die-cast floodlight / street-light head with a flat lit lens
      const fw = Math.max(Math.max(W, L), 0.25);
      const fl = Math.max(Math.min(W, L), 0.18);
      cord(0, 0, opts.dropToCeiling);
      add(new THREE.BoxGeometry(0.04, 0.06, 0.04), darkMat, 0, -0.03, 0);
      add(new THREE.BoxGeometry(fw, 0.05, fl), darkMat, 0, -0.085, 0);
      add(new THREE.BoxGeometry(fw - 0.03, 0.002, fl - 0.03), glowMat, 0, -0.111, 0);
      bottom = -0.112;
      beamTopR = fl / 2;
      beamScaleX = fw / fl;
      break;
    }
    case 'pendant': {
      const r = Math.max(D, 0.3) / 2;
      cord(0, 0, opts.dropToCeiling);
      add(new THREE.CylinderGeometry(0.012, 0.012, 0.05, 12), blackMat, 0, -0.025, 0);
      const shade = new THREE.CylinderGeometry(r * 0.3, r, 0.2, 32, 1, true);
      const shadeMesh = add(shade, new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.5, metalness: 0.4, side: THREE.DoubleSide }), 0, -0.15, 0);
      shadeMesh.renderOrder = 1;
      add(new THREE.SphereGeometry(r * 0.32, 24, 16), glowMat, 0, -0.2, 0);
      add(new THREE.CylinderGeometry(r * 0.98, r * 0.98, 0.002, 32), new THREE.MeshBasicMaterial({ color: 0xfff1d6, transparent: true, opacity: 0.55 }), 0, -0.249, 0);
      bottom = -0.25;
      beamTopR = r * 0.95;
      break;
    }
    case 'exit': {
      // Ceiling-hung exit sign with a lit "EXIT" face on both sides
      add(new THREE.BoxGeometry(0.02, 0.06, 0.02), whiteMat, 0, -0.03, 0);
      add(new THREE.BoxGeometry(0.36, 0.18, 0.035), whiteMat, 0, -0.15, 0);
      const face = new THREE.MeshBasicMaterial({ map: exitTexture() });
      add(new THREE.PlaneGeometry(0.32, 0.15), face, 0, -0.15, 0.0185);
      const back = add(new THREE.PlaneGeometry(0.32, 0.15), face, 0, -0.15, -0.0185);
      back.rotation.y = Math.PI;
      bottom = -0.24;
      beamTopR = 0;
      break;
    }
    case 'emergency': {
      // Twin-head emergency light: battery box with two lamp heads
      add(new THREE.BoxGeometry(0.3, 0.08, 0.1), whiteMat, 0, -0.04, 0);
      for (const x of [-0.11, 0.11]) {
        add(new THREE.CylinderGeometry(0.035, 0.035, 0.05, 20), whiteMat, x, -0.105, 0);
        add(new THREE.CylinderGeometry(0.03, 0.03, 0.003, 20), glowMat, x, -0.131, 0);
      }
      bottom = -0.133;
      beamTopR = 0.12;
      break;
    }
  }

  // Light beam: a faint cone from the diffuser to the floor at the beam angle
  if (opts.showBeam && beamTopR > 0) {
    const h = Math.max(0.1, opts.dropToFloor + bottom);
    const half = (Math.min(Math.max(resolved.beamAngle, 10), 160) * Math.PI) / 360;
    const rBottom = Math.min(beamTopR + h * Math.tan(half), 4.5);
    const beamGeo = new THREE.CylinderGeometry(beamTopR, rBottom, h, 40, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xfff1cf,
      transparent: true,
      opacity: opts.beamOpacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const beam = add(beamGeo, beamMat, 0, bottom - h / 2, 0);
    beam.scale.x = Math.max(1, beamScaleX * 0.6 + 0.4);
    beam.renderOrder = 2;
  }

  return { group, style };
}

export default function Illumination3DModel({ 
  width, 
  length, 
  height, 
  ceilingHeight,
  fixtures, 
  lumens,
  showFalseColor = false,
  enableDaylight = false,
  windowArea = 2.0,
  skyCondition = 'partly',
  isLpdCompliant = true,
  lpdValue = 0,
  lpdLimit = 0,
  targetLux,
  fixtureShape,
  fixtureWidth,
  fixtureLength,
  fixtureDiameter,
  fixtureThickness,
  fixtureBeamAngle,
  fixtureDistributionType,
  activeFixtures,
  customPositions,
  roomPolygon,
  workingPlaneHeight = 0.75
}: SceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fallbackCanvasRef = useRef<HTMLCanvasElement>(null);
  const [webGlError, setWebGlError] = useState<string | null>(null);

  // Debounce WebGL recreation & 2D heatmap texture generation to prevent lag during fast typing
  const [debouncedParams, setDebouncedParams] = useState({
    width,
    length,
    height,
    ceilingHeight,
    fixtures,
    lumens,
    showFalseColor,
    enableDaylight,
    windowArea,
    skyCondition,
    targetLux,
    fixtureShape,
    fixtureWidth,
    fixtureLength,
    fixtureDiameter,
    fixtureThickness,
    fixtureBeamAngle,
    fixtureDistributionType,
    activeFixtures,
    customPositions,
    roomPolygon
  });

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedParams({
        width,
        length,
        height,
        ceilingHeight,
        fixtures,
        lumens,
        showFalseColor,
        enableDaylight,
        windowArea,
        skyCondition,
        targetLux,
        fixtureShape,
        fixtureWidth,
        fixtureLength,
        fixtureDiameter,
        fixtureThickness,
        fixtureBeamAngle,
        fixtureDistributionType,
        activeFixtures,
        customPositions,
        roomPolygon
      });
    }, 280); // 280ms provides optimal blend between live feel and high-performance typing fluidity

    return () => {
      clearTimeout(handler);
    };
  }, [
    width, length, height, ceilingHeight, fixtures, lumens, showFalseColor, 
    enableDaylight, windowArea, skyCondition, targetLux,
    fixtureShape, fixtureWidth, fixtureLength, fixtureDiameter, fixtureThickness, fixtureBeamAngle, fixtureDistributionType,
    activeFixtures, customPositions, roomPolygon
  ]);

  const {
    width: dWidth,
    length: dLength,
    height: dHeight,
    ceilingHeight: dCeilingHeight,
    fixtures: dFixtures,
    lumens: dLumens,
    showFalseColor: dShowFalseColor,
    enableDaylight: dEnableDaylight,
    windowArea: dWindowArea,
    skyCondition: dSkyCondition,
    targetLux: dTargetLux,
    fixtureShape: dFixtureShape,
    fixtureWidth: dFixtureWidth,
    fixtureLength: dFixtureLength,
    fixtureDiameter: dFixtureDiameter,
    fixtureThickness: dFixtureThickness,
    fixtureBeamAngle: dFixtureBeamAngle,
    fixtureDistributionType: dFixtureDistributionType,
    activeFixtures: dActiveFixtures,
    customPositions: dCustomPositions,
    roomPolygon: dRoomPolygon
  } = debouncedParams;

  // Outline centred on the origin like the rest of the scene (x − W/2, z − L/2)
  const hasOutline = !!dRoomPolygon && dRoomPolygon.length >= 3;
  const isOnFloor = (x: number, z: number) => !hasOutline || pointInPolygon(x + dWidth / 2, z + dLength / 2, dRoomPolygon!);
  const floorArea = hasOutline ? polygonArea(dRoomPolygon!) : dWidth * dLength;

  // Resolved parameters accounting for pre-configured defaults
  const resolved = useMemo(() => {
    return resolveFixtureParams(
      dFixtureShape,
      dFixtureWidth,
      dFixtureLength,
      dFixtureDiameter,
      dFixtureThickness,
      dFixtureBeamAngle,
      dFixtureDistributionType
    );
  }, [dFixtureShape, dFixtureWidth, dFixtureLength, dFixtureDiameter, dFixtureThickness, dFixtureBeamAngle, dFixtureDistributionType]);

  // Generate actual coordinates and parameters of all active fixtures in the room (handles single and combined layouts)
  const placedFixtures = useMemo(() => {
    const list: PlacedFixture[] = [];
    const ratio = dWidth / Math.max(0.1, dLength);
    
    if (dCustomPositions && dCustomPositions.length > 0) {
      dCustomPositions.forEach(cp => {
        let matchingAf = dActiveFixtures?.find(f => f.fixtureId === cp.fixtureId);
        if (!matchingAf && dActiveFixtures && dActiveFixtures.length === 1) {
          matchingAf = dActiveFixtures[0];
        }
        const res = resolveFixtureParams(
          matchingAf?.fixtureShape ?? dFixtureShape,
          matchingAf?.fixtureWidth ?? dFixtureWidth,
          matchingAf?.fixtureLength ?? dFixtureLength,
          matchingAf?.fixtureDiameter ?? dFixtureDiameter,
          matchingAf?.fixtureThickness ?? dFixtureThickness,
          matchingAf?.fixtureBeamAngle ?? dFixtureBeamAngle,
          matchingAf?.fixtureDistributionType ?? dFixtureDistributionType
        );
        list.push({
          x: cp.x - dWidth / 2,
          z: cp.z - dLength / 2,
          y: dHeight, // mounting height
          rotationDegrees: cp.rotationDegrees,
          lumens: cp.lumens ?? matchingAf?.lumens ?? dLumens,
          wattage: cp.wattage ?? matchingAf?.wattage ?? 0,
          fixtureId: cp.fixtureId,
          lightType: cp.lightType,
          resolved: res
        });
      });
    } else if (dActiveFixtures && dActiveFixtures.length > 0) {
      dActiveFixtures.forEach((af, afIdx) => {
        const q = af.quantity || 0;
        if (q <= 0) return;
        if (hasOutline) {
          const res = resolveFixtureParams(af.fixtureShape, af.fixtureWidth, af.fixtureLength, af.fixtureDiameter, af.fixtureThickness, af.fixtureBeamAngle, af.fixtureDistributionType);
          placePointsInPolygon(dRoomPolygon!, q).forEach(([x, z]) => list.push({
            x: x - dWidth / 2, z: z - dLength / 2, y: dHeight, lumens: af.lumens, wattage: af.wattage, fixtureId: af.fixtureId, lightType: af.lightType, resolved: res
          }));
          return;
        }
        
        let cols = Math.ceil(Math.sqrt(q));
        let rows = Math.ceil(q / cols);
        cols = Math.max(1, Math.round(Math.sqrt(q * ratio)));
        rows = Math.ceil(q / cols);
        
        const res = resolveFixtureParams(
          af.fixtureShape,
          af.fixtureWidth,
          af.fixtureLength,
          af.fixtureDiameter,
          af.fixtureThickness,
          af.fixtureBeamAngle,
          af.fixtureDistributionType
        );
        
        const stepZ = dLength / rows;
        for (let r = 0; r < rows; r++) {
          const startIdx = r * cols;
          const endIdx = Math.min(q, (r + 1) * cols);
          const countRow = endIdx - startIdx;
          if (countRow <= 0) continue;
          
          const rowStepX = dWidth / countRow;
          for (let c = 0; c < countRow; c++) {
            // Apply a slight stagger offset to prevent visual overlap if rows/cols of different types land on exact coordinates
            let staggerX = 0;
            let staggerZ = 0;
            if (dActiveFixtures.length > 1) {
              const thetaOffset = (afIdx / dActiveFixtures.length) * 2 * Math.PI;
              const radiusOffset = 0.15; // 15cm shift
              staggerX = radiusOffset * Math.cos(thetaOffset);
              staggerZ = radiusOffset * Math.sin(thetaOffset);
            }
            list.push({
              x: -dWidth / 2 + rowStepX / 2 + c * rowStepX + staggerX,
              z: -dLength / 2 + stepZ / 2 + r * stepZ + staggerZ,
              y: dHeight, // mounting height
              lumens: af.lumens,
              wattage: af.wattage,
              fixtureId: af.fixtureId,
              lightType: af.lightType,
              resolved: res
            });
          }
        }
      });
    } else if (hasOutline && dFixtures > 0) {
      placePointsInPolygon(dRoomPolygon!, dFixtures).forEach(([x, z]) => list.push({
        x: x - dWidth / 2, z: z - dLength / 2, y: dHeight, lumens: dLumens, wattage: 0, fixtureId: dFixtureShape || 'square', lightType: 'Standard', resolved: resolved
      }));
    } else {
      if (dFixtures > 0) {
        let cols = Math.ceil(Math.sqrt(dFixtures));
        let rows = Math.ceil(dFixtures / cols);
        cols = Math.max(1, Math.round(Math.sqrt(dFixtures * ratio)));
        rows = Math.ceil(dFixtures / cols);
        
        const stepZ = dLength / rows;
        for (let r = 0; r < rows; r++) {
          const startIdx = r * cols;
          const endIdx = Math.min(dFixtures, (r + 1) * cols);
          const countRow = endIdx - startIdx;
          if (countRow <= 0) continue;
          
          const rowStepX = dWidth / countRow;
          for (let c = 0; c < countRow; c++) {
            list.push({
              x: -dWidth / 2 + rowStepX / 2 + c * rowStepX,
              z: -dLength / 2 + stepZ / 2 + r * stepZ,
              y: dHeight,
              lumens: dLumens,
              wattage: 0,
              fixtureId: dFixtureShape || 'square',
              lightType: 'Standard',
              resolved: resolved
            });
          }
        }
      }
    }
    return list;
  }, [dActiveFixtures, dCustomPositions, dWidth, dLength, dHeight, dFixtures, dLumens, dFixtureShape, resolved, dRoomPolygon]);

  // Generate false color heat-map texture dynamically using a 2D canvas with proper distribution curves
  const canvasTextureElement = useMemo(() => {
    if (!dShowFalseColor) return null;
    
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const skyIllum = dSkyCondition === 'clear' ? 35000 : dSkyCondition === 'partly' ? 18000 : 7000;

    for (let cZ = 0; cZ < 64; cZ++) {
      for (let cX = 0; cX < 64; cX++) {
        const realX = -dWidth / 2 + (cX / 63) * dWidth;
        const realZ = -dLength / 2 + (cZ / 63) * dLength;
        if (!isOnFloor(realX, realZ)) {
          ctx.fillStyle = 'rgb(15,23,42)';
          ctx.fillRect(cX, cZ, 1, 1);
          continue;
        }

        let totalLux = 0;

        placedFixtures.forEach(pos => {
          let ptLux = 0;
          const intensity = pos.lumens / (2 * Math.PI); // standard forward flux
          const res = pos.resolved;
          
          let dx = realX - pos.x;
          let dz = realZ - pos.z;

          if (pos.rotationDegrees) {
            const rad = -pos.rotationDegrees * Math.PI / 180;
            const cosR = Math.cos(rad);
            const sinR = Math.sin(rad);
            const tX = dx * cosR - dz * sinR;
            const tZ = dx * sinR + dz * cosR;
            dx = tX;
            dz = tZ;
          }
          
          if (res.distributionType === 'linear') {
            // Linear light segment spread along X-axis (length)
            const halfL = res.length / 2;
            const xClamped = Math.max(-halfL, Math.min(halfL, dx));
            
            const distSq = (dx - xClamped)*(dx - xClamped) + dz*dz + dHeight**2;
            const dist = Math.sqrt(distSq);
            
            const cosTheta = dHeight / dist;
            const theta = Math.acos(cosTheta);
            const beamHalfAngleRad = (res.beamAngle / 2) * (Math.PI / 180);
            
            let factor = 0;
            if (theta <= beamHalfAngleRad) {
              factor = Math.cos((theta / beamHalfAngleRad) * (Math.PI / 2));
            }
            
            const rawPtLux = (intensity * dHeight) / Math.pow(distSq, 1.5);
            ptLux = rawPtLux * factor;
            
          } else if (res.distributionType === 'oblong') {
            // Oval-shaped asymmetric spread (extended horizontally along X-axis)
            const odx = dx * 0.7; // extend X
            const odz = dz * 1.6; // squeeze Z
            const distSq = odx*odx + odz*odz + dHeight**2;
            const dist = Math.sqrt(distSq);
            const cosTheta = dHeight / dist;
            const theta = Math.acos(cosTheta);
            const beamHalfAngleRad = (res.beamAngle / 2) * (Math.PI / 180);
            
            let factor = 0;
            if (theta <= beamHalfAngleRad) {
              factor = Math.cos((theta / beamHalfAngleRad) * (Math.PI / 2));
            }
            
            const rawPtLux = (intensity * dHeight) / Math.pow(distSq, 1.5);
            ptLux = rawPtLux * factor;
            
          } else if (res.distributionType === 'omni') {
            // Omnidirectional scattering
            const distSq = dx*dx + dz*dz + dHeight**2;
            const dist = Math.sqrt(distSq);
            const cosTheta = dHeight / dist;
            
            // Very smooth diffuse dropoff
            const factor = Math.cos(Math.acos(cosTheta) * 0.6);
            
            const rawPtLux = (intensity * dHeight) / Math.pow(distSq, 1.5);
            ptLux = rawPtLux * factor;
            
          } else { // 'conical' standard directive spot
            const distSq = dx*dx + dz*dz + dHeight**2;
            const dist = Math.sqrt(distSq);
            const cosTheta = dHeight / dist;
            const theta = Math.acos(cosTheta);
            const beamHalfAngleRad = (res.beamAngle / 2) * (Math.PI / 180);
            
            let factor = 0;
            if (theta <= beamHalfAngleRad) {
              factor = Math.pow(Math.cos((theta / beamHalfAngleRad) * (Math.PI / 2)), 1.5);
            } else if (theta <= beamHalfAngleRad * 1.3) {
              const ratio = 1 - (theta - beamHalfAngleRad) / (beamHalfAngleRad * 0.3);
              factor = 0.08 * Math.pow(ratio, 2);
            }
            
            const rawPtLux = (intensity * dHeight) / Math.pow(distSq, 1.5);
            ptLux = rawPtLux * factor;
          }
          
          totalLux += ptLux;
        });

        // Add natural sunlight bleed details
        if (dEnableDaylight) {
          const distFromNorth = realZ - (-dLength/2);
          const dfAtWall = 0.08 * (dWindowArea / floorArea) * 100;
          const locDF = dfAtWall * Math.exp(-0.5 * Math.max(0, distFromNorth));
          const daylightPointLux = locDF * skyIllum / 100;
          totalLux += daylightPointLux;
        }

        // Color ramp map definitions
        const t1 = dTargetLux * 0.33;
        const t2 = dTargetLux * 0.67;
        const t3 = dTargetLux * 1.0;
        const t4 = dTargetLux * 1.67;
        const t5 = dTargetLux * 2.5;

        let rgbColor = 'rgb(0,0,50)';
        if (totalLux < t1) {
          const rValue = totalLux / t1;
          rgbColor = `rgb(0, 0, ${Math.round(50 + rValue * 150)})`;
        } else if (totalLux < t2) {
          const rValue = (totalLux - t1) / (t2 - t1);
          rgbColor = `rgb(0, ${Math.round(rValue * 200)}, 200)`;
        } else if (totalLux < t3) {
          const rValue = (totalLux - t2) / (t3 - t2);
          rgbColor = `rgb(0, 255, ${Math.round(200 - rValue * 200)})`;
        } else if (totalLux < t4) {
          const rValue = (totalLux - t3) / (t4 - t3);
          rgbColor = `rgb(${Math.round(rValue * 255)}, 255, 0)`;
        } else if (totalLux < t5) {
          const rValue = (totalLux - t4) / (t5 - t4);
          rgbColor = `rgb(255, ${Math.round(255 - rValue * 155)}, 0)`;
        } else {
          const rValue = Math.min(1, (totalLux - t5) / t5);
          rgbColor = `rgb(255, ${Math.round(100 + rValue * 155)}, ${Math.round(100 + rValue * 155)})`;
        }

        ctx.fillStyle = rgbColor;
        ctx.fillRect(cX, cZ, 1, 1);
      }
    }

    return canvas;
  }, [dWidth, dLength, dHeight, dShowFalseColor, dEnableDaylight, dWindowArea, dSkyCondition, dTargetLux, placedFixtures, dRoomPolygon]);

  // 2D Canvas Fallback Layout Renderer (triggered if WebGL is unavailable or fails to initialize)
  useEffect(() => {
    if (!webGlError || !fallbackCanvasRef.current) return;

    const canvas = fallbackCanvasRef.current;
    
    // Fit the canvas to the container client rect or generic dimensions
    const parent = canvas.parentElement;
    const cw = parent ? parent.clientWidth : 950;
    const ch = parent ? parent.clientHeight : 550;
    canvas.width = cw;
    canvas.height = ch;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear background with dark blue slate
    ctx.fillStyle = '#020617'; // slate-950
    ctx.fillRect(0, 0, cw, ch);

    // Grid columns & rows of fixtures
    const skyIllum = dSkyCondition === 'clear' ? 35000 : dSkyCondition === 'partly' ? 18000 : 7000;

    // Generate accurate fallback 2D illumination texture on a 96x96 grid for top performance
    const gridRes = 96;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = gridRes;
    tempCanvas.height = gridRes;
    const tempCtx = tempCanvas.getContext('2d');
    if (tempCtx) {
      const imgData = tempCtx.createImageData(gridRes, gridRes);
      for (let gZ = 0; gZ < gridRes; gZ++) {
        for (let gX = 0; gX < gridRes; gX++) {
          const realX = -dWidth / 2 + (gX / (gridRes - 1)) * dWidth;
          const realZ = -dLength / 2 + (gZ / (gridRes - 1)) * dLength;

          let totalLux = 0;

          placedFixtures.forEach(pos => {
            let ptLux = 0;
            const intensity = pos.lumens / (2 * Math.PI);
            const res = pos.resolved;

            let dx = realX - pos.x;
            let dz = realZ - pos.z;

            if (pos.rotationDegrees) {
              const rad = -pos.rotationDegrees * Math.PI / 180;
              const cosR = Math.cos(rad);
              const sinR = Math.sin(rad);
              const tX = dx * cosR - dz * sinR;
              const tZ = dx * sinR + dz * cosR;
              dx = tX;
              dz = tZ;
            }

            if (res.distributionType === 'linear') {
              const halfL = res.length / 2;
              const xClamped = Math.max(-halfL, Math.min(halfL, dx));
              const distSq = (dx - xClamped)*(dx - xClamped) + dz*dz + dHeight**2;
              const dist = Math.sqrt(distSq);
              const cosTheta = dHeight / dist;
              const theta = Math.acos(cosTheta);
              const beamHalfAngleRad = (res.beamAngle / 2) * (Math.PI / 180);
              let factor = 0;
              if (theta <= beamHalfAngleRad) {
                factor = Math.cos((theta / beamHalfAngleRad) * (Math.PI / 2));
              }
              ptLux = ((intensity * dHeight) / Math.pow(distSq, 1.5)) * factor;
            } else if (res.distributionType === 'oblong') {
              const odx = dx * 0.7;
              const odz = dz * 1.6;
              const distSq = odx*odx + odz*odz + dHeight**2;
              const dist = Math.sqrt(distSq);
              const cosTheta = dHeight / dist;
              const theta = Math.acos(cosTheta);
              const beamHalfAngleRad = (res.beamAngle / 2) * (Math.PI / 180);
              let factor = 0;
              if (theta <= beamHalfAngleRad) {
                factor = Math.cos((theta / beamHalfAngleRad) * (Math.PI / 2));
              }
              ptLux = ((intensity * dHeight) / Math.pow(distSq, 1.5)) * factor;
            } else if (res.distributionType === 'omni') {
              const distSq = dx*dx + dz*dz + dHeight**2;
              const dist = Math.sqrt(distSq);
              const cosTheta = dHeight / dist;
              const factor = Math.cos(Math.acos(cosTheta) * 0.6);
              ptLux = ((intensity * dHeight) / Math.pow(distSq, 1.5)) * factor;
            } else {
              const distSq = dx*dx + dz*dz + dHeight**2;
              const dist = Math.sqrt(distSq);
              const cosTheta = dHeight / dist;
              const theta = Math.acos(cosTheta);
              const beamHalfAngleRad = (res.beamAngle / 2) * (Math.PI / 180);
              let factor = 0;
              if (theta <= beamHalfAngleRad) {
                factor = Math.pow(Math.cos((theta / beamHalfAngleRad) * (Math.PI / 2)), 1.5);
              } else if (theta <= beamHalfAngleRad * 1.3) {
                const ratio = 1 - (theta - beamHalfAngleRad) / (beamHalfAngleRad * 0.3);
                factor = 0.08 * Math.pow(ratio, 2);
              }
              ptLux = ((intensity * dHeight) / Math.pow(distSq, 1.5)) * factor;
            }
            totalLux += ptLux;
          });

          if (dEnableDaylight) {
            const distFromNorth = realZ - (-dLength/2);
            const dfAtWall = 0.08 * (dWindowArea / floorArea) * 100;
            const locDF = dfAtWall * Math.exp(-0.5 * Math.max(0, distFromNorth));
            const daylightPointLux = locDF * skyIllum / 100;
            totalLux += daylightPointLux;
          }

          let r = 0, g = 0, b = 0;
          if (dShowFalseColor) {
            const t1 = dTargetLux * 0.33;
            const t2 = dTargetLux * 0.67;
            const t3 = dTargetLux * 1.0;
            const t4 = dTargetLux * 1.67;
            const t5 = dTargetLux * 2.5;

            if (totalLux < t1) {
              const rValue = totalLux / t1;
              r = 0; g = 0; b = Math.round(50 + rValue * 150);
            } else if (totalLux < t2) {
              const rValue = (totalLux - t1) / (t2 - t1);
              r = 0; g = Math.round(rValue * 200); b = 200;
            } else if (totalLux < t3) {
              const rValue = (totalLux - t2) / (t3 - t2);
              r = 0; g = 255; b = Math.round(200 - rValue * 200);
            } else if (totalLux < t4) {
              const rValue = (totalLux - t3) / (t4 - t3);
              r = Math.round(rValue * 255); g = 255; b = 0;
            } else if (totalLux < t5) {
              const rValue = (totalLux - t4) / (t5 - t4);
              r = 255; g = Math.round(255 - rValue * 155); b = 0;
            } else {
              const rValue = Math.min(1, (totalLux - t5) / t5);
              r = 255; g = Math.round(100 + rValue * 155); b = Math.round(100 + rValue * 155);
            }
          } else {
            const brightness = Math.min(1, totalLux / Math.max(1, dTargetLux * 1.5));
            r = Math.round(30 + brightness * 200); 
            g = Math.round(41 + brightness * 190); 
            b = Math.round(59 + brightness * 150); 
          }

          const idx = (gZ * gridRes + gX) * 4;
          imgData.data[idx] = r;
          imgData.data[idx+1] = g;
          imgData.data[idx+2] = b;
          imgData.data[idx+3] = 255;
        }
      }
      tempCtx.putImageData(imgData, 0, 0);
    }

    // Set layout aspect ratio box based on room size
    const pad = 75;
    const viewWidth = cw - pad * 2;
    const viewHeight = ch - pad * 2;

    const scale = Math.min(viewWidth / dWidth, viewHeight / dLength);
    const drawW = dWidth * scale;
    const drawH = dLength * scale;
    const startX = (cw - drawW) / 2;
    const startY = (ch - drawH) / 2;

    // Draw grid background for engineering feel
    ctx.strokeStyle = '#111827'; // slate-900 gridline
    ctx.lineWidth = 1;
    for (let xPos = 0; xPos <= cw; xPos += 40) {
      ctx.beginPath();
      ctx.moveTo(xPos, 0);
      ctx.lineTo(xPos, ch);
      ctx.stroke();
    }
    for (let yPos = 0; yPos <= ch; yPos += 40) {
      ctx.beginPath();
      ctx.moveTo(0, yPos);
      ctx.lineTo(cw, yPos);
      ctx.stroke();
    }

    // Draw the computed heatmap texture
    ctx.drawImage(tempCanvas, startX, startY, drawW, drawH);

    // Stroke border of the room
    ctx.strokeStyle = '#475569'; // slate-600
    ctx.lineWidth = 3;
    ctx.strokeRect(startX, startY, drawW, drawH);

    // Draw window marker if daylight enabled
    if (dEnableDaylight) {
      ctx.fillStyle = '#38bdf8'; // sky-400
      const winW = Math.min(drawW * 0.7, Math.sqrt(dWindowArea) * 1.5 * scale);
      ctx.fillRect(startX + (drawW - winW) / 2, startY - 5, winW, 8);
      
      ctx.fillStyle = '#e2e8f0';
      ctx.font = 'bold 9px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText('DAYLIGHT SOURCE WINDOW (NORTH)', startX + drawW / 2, startY - 8);
    }

    // Draw fixtures
    placedFixtures.forEach((pos, index) => {
      const cx = startX + ((pos.x + dWidth / 2) / dWidth) * drawW;
      const cy = startY + ((pos.z + dLength / 2) / dLength) * drawH;
      const res = pos.resolved;

      ctx.save();
      ctx.translate(cx, cy);
      if (pos.rotationDegrees) {
        ctx.rotate(pos.rotationDegrees * Math.PI / 180);
      }

      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#f8fafc';
      ctx.lineWidth = 1.5;
      
      ctx.shadowColor = '#fef08a';
      ctx.shadowBlur = 10;

      if (res.shape === 'circular') {
        const rad = Math.max(3.5, (res.diameter / 2) * scale);
        ctx.beginPath();
        ctx.arc(0, 0, rad, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
      } else if (res.shape === 'linear') {
        const lThickness = Math.max(2, res.width * scale);
        const lLen = Math.max(12, res.length * scale);
        ctx.fillRect(-lLen / 2, -lThickness / 2, lLen, lThickness);
        ctx.strokeRect(-lLen / 2, -lThickness / 2, lLen, lThickness);
      } else { // square or rectangular
        const wVal = res.shape === 'square' ? res.width : Math.max(res.width, res.length);
        const lVal = res.shape === 'square' ? res.width : Math.min(res.width, res.length);
        const rectW = Math.max(6, wVal * scale);
        const rectL = Math.max(6, lVal * scale);
        ctx.fillRect(-rectW / 2, -rectL / 2, rectW, rectL);
        ctx.strokeRect(-rectW / 2, -rectL / 2, rectW, rectL);
      }

      ctx.shadowBlur = 0; // Reset blur

      // Draw number inside fixture circle/rect, counter-rotating so it stays upright
      ctx.save();
      if (pos.rotationDegrees) {
        ctx.rotate(-pos.rotationDegrees * Math.PI / 180);
      }
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 8px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText((index + 1).toString(), 0, 0);
      ctx.restore();

      ctx.restore();
    });

    // Dimension indicators with arrows
    ctx.fillStyle = '#94a3b8';
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';

    // Width arrow line (underneath room)
    const arrowY = startY + drawH + 20;
    ctx.beginPath();
    ctx.moveTo(startX, arrowY);
    ctx.lineTo(startX + drawW, arrowY);
    ctx.stroke();

    // Arrows tips
    ctx.beginPath();
    ctx.moveTo(startX, arrowY); ctx.lineTo(startX + 6, arrowY - 3); ctx.lineTo(startX + 6, arrowY + 3); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(startX + drawW, arrowY); ctx.lineTo(startX + drawW - 6, arrowY - 3); ctx.lineTo(startX + drawW - 6, arrowY + 3); ctx.fill();
    
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(`${dWidth.toFixed(2)}m (Width)`, startX + drawW / 2, arrowY + 14);

    // Length arrow line (on side of room)
    ctx.fillStyle = '#94a3b8';
    const arrowX = startX - 25;
    ctx.beginPath();
    ctx.moveTo(arrowX, startY);
    ctx.lineTo(arrowX, startY + drawH);
    ctx.stroke();

    // Arrows tips
    ctx.beginPath();
    ctx.moveTo(arrowX, startY); ctx.lineTo(arrowX - 3, startY + 6); ctx.lineTo(arrowX + 3, startY + 6); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(arrowX, startY + drawH); ctx.lineTo(arrowX - 3, startY + drawH - 6); ctx.lineTo(arrowX + 3, startY + drawH - 6); ctx.fill();

    ctx.save();
    ctx.translate(arrowX - 10, startY + drawH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(`${dLength.toFixed(2)}m (Length)`, 0, 0);
    ctx.restore();

  }, [dWidth, dLength, dHeight, dCeilingHeight, dShowFalseColor, dEnableDaylight, dWindowArea, dSkyCondition, dTargetLux, placedFixtures, webGlError]);

  useEffect(() => {
    if (!containerRef.current || webGlError) return;

    // Reset container canvas elements
    containerRef.current.innerHTML = '';

    const containerWidth = containerRef.current.clientWidth || 600;
    const containerHeight = containerRef.current.clientHeight || 450;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#020617'); // depth slate-950

    // Rigging camera
    const camera = new THREE.PerspectiveCamera(45, containerWidth / containerHeight, 0.1, 1000);
    // Start just below ceiling level from a corner so the lit undersides of the fixtures are visible
    const viewDist = Math.max(dWidth, dLength);
    camera.position.set(dWidth * 0.5 + viewDist * 0.55, Math.min(1.6, dCeilingHeight * 0.6), dLength * 0.5 + viewDist * 0.75);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    } catch (err: any) {
      console.warn("WebGL Renderer creation failed:", err);
      setWebGlError(err?.message || "WebGL context creation failed");
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    // Filmic tone mapping keeps brightly lit floors from clipping to flat white
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.85;
    renderer.setSize(containerWidth, containerHeight);
    containerRef.current.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.05;
    controls.minPolarAngle = 0.05;
    controls.target.set(0, dCeilingHeight * 0.62, 0);
    controls.update();

    // Ambient light
    const ambientIntensity = dShowFalseColor ? 0.04 : 0.22;
    const ambientLight = new THREE.AmbientLight(0xffffff, ambientIntensity);
    scene.add(ambientLight);

    // Fixture models: recessed / ceiling types on the ceiling, hung types at working plane + mounting height
    const hungY = Math.min(dCeilingHeight - 0.05, Math.max(0.3, workingPlaneHeight + dHeight));
    const mountYOf = (pos: PlacedFixture) =>
      isCeilingStyle(fixtureStyleOf(pos.lightType, pos.resolved.shape)) ? dCeilingHeight - 0.001 : hungY;
    const showBeams = !dShowFalseColor && placedFixtures.length <= 80;
    // Overlapping beams add up, so each beam gets fainter as the fixture count grows
    const beamOpacity = Math.min(0.06, 0.35 / Math.max(1, placedFixtures.length));
    placedFixtures.forEach(pos => {
      const y = mountYOf(pos);
      const { group: model } = createFixture3D(pos.resolved, pos.lightType, {
        dropToCeiling: dCeilingHeight - y,
        dropToFloor: y,
        showBeam: showBeams,
        beamOpacity,
      });
      model.position.set(pos.x, y, pos.z);

      // Default basic orientation, and then apply custom rotation
      model.rotation.y = -(pos.rotationDegrees || 0) * Math.PI / 180;

      scene.add(model);
    });

    // Ceiling outline so recessed fixtures read as being in the ceiling
    {
      const ceilMat = new THREE.LineBasicMaterial({ color: 0x475569, transparent: true, opacity: 0.6 });
      const pts = (dRoomPolygon && dRoomPolygon.length >= 3)
        ? dRoomPolygon.map(([x, z]) => new THREE.Vector3(x - dWidth / 2, dCeilingHeight, z - dLength / 2))
        : [[0, 0], [dWidth, 0], [dWidth, dLength], [0, dLength]].map(([x, z]) => new THREE.Vector3(x - dWidth / 2, dCeilingHeight, z - dLength / 2));
      pts.push(pts[0].clone());
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), ceilMat));
    }

    // Spawn Three.js Spotlights matching the directionality and beam angle
    const MAX_LIGHTS = 16;
    let lightsToSpawn: { x: number; y: number; z: number; lumens: number; resolved: any }[] = [];
    if (placedFixtures.length <= MAX_LIGHTS) {
      lightsToSpawn = placedFixtures.map(f => ({
        x: f.x,
        y: mountYOf(f) - 0.05,
        z: f.z,
        lumens: f.lumens,
        resolved: f.resolved
      }));
    } else {
      const step = Math.ceil(placedFixtures.length / MAX_LIGHTS);
      for (let i = 0; i < placedFixtures.length; i += step) {
        if (lightsToSpawn.length < MAX_LIGHTS && placedFixtures[i]) {
          const f = placedFixtures[i];
          lightsToSpawn.push({
            x: f.x,
            y: mountYOf(f) - 0.05,
            z: f.z,
            lumens: f.lumens * step, // scale representing other lights
            resolved: f.resolved
          });
        }
      }
    }

    lightsToSpawn.forEach(l => {
      const pointLightIntensity = Math.min(l.lumens, 10000) / 100;
      const intensityMultiplier = placedFixtures.length > MAX_LIGHTS ? placedFixtures.length / MAX_LIGHTS : 1;
      const finalIntensity = pointLightIntensity * intensityMultiplier;
      const lightIntensity = dShowFalseColor ? finalIntensity * 0.15 : finalIntensity;

      const res = l.resolved;
      if (res.distributionType === 'conical' || res.distributionType === 'linear') {
        // High-fidelity cone/spotlights directed downward
        const spotLight = new THREE.SpotLight(
          0xfffff4,
          lightIntensity * 4.0, 
          dHeight * 3.8,
          (res.beamAngle * Math.PI) / 360, // angle/2 in radian
          0.3, // soft decay edge
          1.6  // physical decay
        );
        spotLight.position.set(l.x, l.y, l.z);
        
        // Spot target vector
        const targetObj = new THREE.Object3D();
        targetObj.position.set(l.x, l.y - 1.0, l.z);
        scene.add(targetObj);
        spotLight.target = targetObj;
        
        scene.add(spotLight);
      } else {
        // Spherical scattering for omni / oblong
        const pointLight = new THREE.PointLight(0xfffff0, lightIntensity, dHeight * 3.5, 1.8);
        pointLight.position.set(l.x, l.y, l.z);
        scene.add(pointLight);
      }
    });

    // Floor design plane
    let floorGeo: THREE.BufferGeometry = new THREE.PlaneGeometry(dWidth, dLength);
    if (hasOutline) {
      // Shape in the XY plane with y = −z, so rotating −90° about X lays it on the floor at +z
      const shape = new THREE.Shape(dRoomPolygon!.map(([x, z]) => new THREE.Vector2(x - dWidth / 2, -(z - dLength / 2))));
      floorGeo = new THREE.ShapeGeometry(shape);
      const pos = floorGeo.getAttribute('position');
      const uv = floorGeo.getAttribute('uv');
      for (let i = 0; i < pos.count; i++) {
        uv.setXY(i, (pos.getX(i) + dWidth / 2) / dWidth, (pos.getY(i) + dLength / 2) / dLength);
      }
      uv.needsUpdate = true;
    }
    let floorMat;

    if (dShowFalseColor && canvasTextureElement) {
      const texture = new THREE.CanvasTexture(canvasTextureElement);
      floorMat = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
    } else {
      // Elegant tiled linoleum grid for realism
      floorMat = new THREE.MeshStandardMaterial({ 
        color: 0x475569, 
        roughness: 0.65, 
        metalness: 0.12,
        side: THREE.DoubleSide 
      });
    }

    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    scene.add(floorMesh);

    // Natural daylight window pane
    if (dEnableDaylight) {
      const winW = Math.min(dWidth * 0.7, Math.sqrt(dWindowArea) * 1.5);
      const winH = Math.min(dCeilingHeight * 0.6, Math.sqrt(dWindowArea));
      const winGeo = new THREE.PlaneGeometry(winW, winH);
      const winMat = new THREE.MeshBasicMaterial({ 
        color: 0x38bdf8, 
        transparent: true, 
        opacity: 0.60, 
        side: THREE.DoubleSide 
      });
      const winMesh = new THREE.Mesh(winGeo, winMat);
      winMesh.position.set(0, dCeilingHeight / 2, -dLength / 2 + 0.015);
      scene.add(winMesh);
    }

    // Transparent wall cage references
    const wallMat = new THREE.MeshStandardMaterial({ 
      color: 0x334155, 
      transparent: true, 
      opacity: 0.10 
    });

    if (hasOutline) {
      const edgeMat = new THREE.LineBasicMaterial({ color: 0x94a3b8 });
      dRoomPolygon!.forEach(([x1, z1], i) => {
        const [x2, z2] = dRoomPolygon![(i + 1) % dRoomPolygon!.length];
        const len = Math.hypot(x2 - x1, z2 - z1);
        if (len < 0.01) return;
        const wall = new THREE.Mesh(new THREE.BoxGeometry(len, dCeilingHeight, 0.02), wallMat);
        wall.position.set((x1 + x2) / 2 - dWidth / 2, dCeilingHeight / 2, (z1 + z2) / 2 - dLength / 2);
        wall.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
        scene.add(wall);
        // Floor and ceiling outline edges so the room shape reads clearly
        for (const y of [0.005, dCeilingHeight]) {
          const g = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(x1 - dWidth / 2, y, z1 - dLength / 2),
            new THREE.Vector3(x2 - dWidth / 2, y, z2 - dLength / 2),
          ]);
          scene.add(new THREE.Line(g, edgeMat));
        }
      });
    }

    const vWallGeoX = new THREE.BoxGeometry(dWidth, dCeilingHeight, 0.02);
    const vWallGeoZ = new THREE.BoxGeometry(0.02, dCeilingHeight, dLength);

    if (!hasOutline) {
    const wallBack = new THREE.Mesh(vWallGeoX, wallMat);
    wallBack.position.set(0, dCeilingHeight / 2, -dLength / 2);
    scene.add(wallBack);

    const wallFront = new THREE.Mesh(vWallGeoX, wallMat);
    wallFront.position.set(0, dCeilingHeight / 2, dLength / 2);
    scene.add(wallFront);

    const wallLeft = new THREE.Mesh(vWallGeoZ, wallMat);
    wallLeft.position.set(-dWidth / 2, dCeilingHeight / 2, 0);
    scene.add(wallLeft);

    const wallRight = new THREE.Mesh(vWallGeoZ, wallMat);
    wallRight.position.set(dWidth / 2, dCeilingHeight / 2, 0);
    scene.add(wallRight);
    }

    // Render loop animation frames
    let animationFrameId: number;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Responsive Canvas Resizers
    const handleResize = () => {
      if (!containerRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
      controls.dispose();
      renderer.dispose();
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [dWidth, dLength, dHeight, dCeilingHeight, dShowFalseColor, dEnableDaylight, dWindowArea, dSkyCondition, canvasTextureElement, dTargetLux, placedFixtures, dRoomPolygon, workingPlaneHeight]);

  const totalLumensVal = activeFixtures && activeFixtures.length > 0
    ? activeFixtures.reduce((total, f) => total + (f.quantity || 0) * (f.lumens || 0), 0)
    : (fixtures * lumens);
  const totalQtyVal = activeFixtures && activeFixtures.length > 0
    ? activeFixtures.reduce((total, f) => total + (f.quantity || 0), 0)
    : fixtures;

  // Model Luminous Adequacy Assessments
  const estAverageLux = Math.ceil((totalLumensVal * 0.6) / ((roomPolygon && roomPolygon.length >= 3 ? polygonArea(roomPolygon) : width * length) || 1));
  
  let complianceBadge = "NO WORKPLACE FIXTURES";
  let complianceBg = "bg-slate-900/95 border-slate-700 text-slate-300";
  let complianceMessage = "Please add lighting fixtures to calculate estimated lux on the working plane.";

  if (totalQtyVal > 0) {
    if (estAverageLux >= targetLux) {
      if (estAverageLux >= targetLux * 1.6) {
        complianceBadge = "PASSED (OVERLIT WARNING)";
        complianceBg = "bg-amber-950/90 border-amber-500 text-yellow-300";
        complianceMessage = `Estimated ${estAverageLux} Lux on working plane exceeds the requested target of ${targetLux} Lux. Consider reducing the number of fixtures.`;
      } else {
        complianceBadge = "PEC COMPLIANT (PASSED)";
        complianceBg = "bg-emerald-950/90 border-emerald-500/80 text-emerald-300";
        complianceMessage = `Excellent configuration! Average level of ${estAverageLux} Lux satisfies target (${targetLux} Lux) comfortably.`;
      }
    } else {
      if (estAverageLux >= targetLux * 0.8) {
        complianceBadge = "CRITICAL BORDERLINE";
        complianceBg = "bg-yellow-950/90 border-yellow-500/80 text-yellow-300 font-bold";
        complianceMessage = `${estAverageLux} Lux is critically close or slightly below target (${targetLux} Lux). Minor adjustments recommended.`;
      } else {
        complianceBadge = "NEEDS ADJUSTMENT";
        complianceBg = "bg-rose-950/95 border-rose-500 text-rose-300";
        complianceMessage = `Underlit: Average lux of ${estAverageLux} Lux is dangerously below standard target (${targetLux} Lux). Add or configure larger fixtures.`;
      }
    }
  }

  return (
    <div className="w-full overflow-x-auto mt-8 relative pb-2 drop-shadow-md">
      <div id="illumination-diagram" className="w-full max-w-full h-[480px] sm:h-[550px] bg-slate-950 rounded-2xl overflow-hidden relative border-2 border-slate-800 mx-auto">
        
        {/* Heads-Up Display (HUD) Controls Overlay */}
        <div className="absolute top-4 left-4 z-10 text-white font-black text-xs tracking-wider uppercase opacity-90 flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:w-[calc(100%-32px)] pointer-events-none">
          <div className="flex flex-col gap-1.5 bg-slate-900/95 px-4 py-3 border border-slate-800 rounded-xl backdrop-blur-md text-slate-100">
            <span className="text-white text-xs font-bold font-mono tracking-tight flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-full animate-pulse ${webGlError ? 'bg-amber-500' : 'bg-blue-500'}`}></span>
              {webGlError ? '2D Lighting Simulation Space' : '3D Lighting CAD Space'}
            </span>
            <span className="text-[10px] font-medium text-slate-400 normal-case">
              {webGlError 
                ? "Showing top-down blueprint lighting layout simulation (WebGL disabled)." 
                : "Drag mouse pointer to rotate, scroll wheel to zoom model."}
            </span>
            <div className="text-[10px] text-yellow-350 font-mono tracking-normal mt-1 border-t border-slate-800 pt-1.5 font-bold normal-case space-y-0.5">
              <div>ROOM SIZE: {width.toFixed(2)}m (W) × {length.toFixed(2)}m (L) × {ceilingHeight.toFixed(2)}m (H){roomPolygon && roomPolygon.length >= 3 ? ` · ${roomPolygon.length}-WALL OUTLINE, ${polygonArea(roomPolygon).toFixed(2)} m²` : ''}</div>
              <div className="text-cyan-400 font-bold uppercase text-[9px] tracking-wide">
                {activeFixtures && activeFixtures.length > 1 ? (
                  <span>FIXTURES: COMBINED DESIGN ({totalQtyVal} Total units, {activeFixtures.length} Types)</span>
                ) : (
                  <span>FIXTURE: {resolved.shape} ({resolved.shape === 'circular' ? `Ø${resolved.diameter}m` : `${resolved.width}m × ${resolved.length}m`}) | Beam: {resolved.beamAngle}° | {resolved.distributionType}</span>
                )}
              </div>
            </div>
          </div>
          
          {/* LPD Compliance Status Indicator */}
          <div className="mt-2 md:mt-0 right-0 flex flex-col gap-2 pointer-events-auto">
            {lpdValue <= lpdLimit * 0.9 ? (
              <div className="bg-emerald-900/85 border border-emerald-500/50 px-3 py-1.5 rounded-lg text-emerald-300 text-[10px] uppercase backdrop-blur-sm flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
                <span>LPD Limit: Passed ({lpdValue.toFixed(2)} W/m² / {lpdLimit} max)</span>
              </div>
            ) : lpdValue <= lpdLimit ? (
              <div className="bg-amber-900/85 border border-amber-500/50 px-3 py-1.5 rounded-lg text-amber-300 text-[10px] uppercase backdrop-blur-sm flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></div>
                <span>LPD Standard critical ({lpdValue.toFixed(2)} W/m²)</span>
              </div>
            ) : (
              <div className="bg-red-900/85 border border-red-500/50 px-3 py-1.5 rounded-lg text-red-300 text-[10px] uppercase backdrop-blur-sm flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse"></div>
                <span>LPD Standard Overload ({lpdValue.toFixed(2)} W/m²)</span>
              </div>
            )}
 
            <div className={`px-3 py-1.5 rounded-lg border text-[10px] uppercase text-center backdrop-blur-sm ${complianceBg}`}>
              {complianceBadge}
            </div>
          </div>
        </div>
 
        {/* Floating Detailed Adequacy Note Panel */}
        <div className="absolute left-4 bottom-4 bg-slate-900/95 border border-slate-800 p-4 rounded-xl text-white z-10 text-[10px] max-w-[340px] pointer-events-auto backdrop-blur-md shadow-lg space-y-1.5">
          <div className="font-extrabold text-cyan-400 uppercase tracking-wider text-[10px]">Real-term Assessment Notes</div>
          <div className="text-slate-200 font-medium normal-case leading-relaxed">
            {complianceMessage}
          </div>
          <div className="text-[9px] text-slate-400 border-t border-slate-800/80 pt-1 flex justify-between">
            <span>Target Lux: <strong>{targetLux} lx</strong></span>
            <span>Estimated: <strong>{estAverageLux} lx</strong></span>
          </div>
        </div>
 
        {showFalseColor && (
          <div className="absolute right-4 bottom-4 bg-slate-900/95 border border-slate-700/80 p-3.5 rounded-xl text-white z-10 text-[10px] space-y-2 backdrop-blur-md shadow-lg max-w-[220px]">
            <div className="font-extrabold border-b border-white/10 pb-1 mb-1 uppercase tracking-widest text-[#fbbf24] text-[9px]">False Color Lux Index</div>
            <div className="flex items-center gap-2"><div className="w-3.5 h-3.5 rounded bg-[#ffffff] border border-slate-700 shrink-0"></div><span className="font-medium text-slate-200">&gt; {Math.round(targetLux * 2.5)} Lux (Overlit)</span></div>
            <div className="flex items-center gap-2"><div className="w-3.5 h-3.5 rounded bg-[#ff0000] shrink-0"></div><span className="font-medium text-slate-200">{Math.round(targetLux * 1.67)} - {Math.round(targetLux * 2.5)} Lux (Task Area)</span></div>
            <div className="flex items-center gap-2"><div className="w-3.5 h-3.5 rounded bg-[#ffff00] shrink-0"></div><span className="font-medium text-slate-200">{Math.round(targetLux * 1.0)} - {Math.round(targetLux * 1.67)} Lux (Target)</span></div>
            <div className="flex items-center gap-2"><div className="w-3.5 h-3.5 rounded bg-[#00ff00] shrink-0"></div><span className="font-medium text-slate-200">{Math.round(targetLux * 0.67)} - {Math.round(targetLux * 1.0)} Lux (Ambient)</span></div>
            <div className="flex items-center gap-2"><div className="w-3.5 h-3.5 rounded bg-[#00ffff] shrink-0"></div><span className="font-medium text-slate-200">{Math.round(targetLux * 0.33)} - {Math.round(targetLux * 0.67)} Lux (Low/Transit)</span></div>
            <div className="flex items-center gap-2"><div className="w-3.5 h-3.5 rounded bg-[#0000a0] shrink-0"></div><span className="font-medium text-slate-200">&lt; {Math.round(targetLux * 0.33)} Lux (Shadows)</span></div>
          </div>
        )}
 
        {enableDaylight && (
          <div className="absolute right-4 top-24 bg-indigo-950/90 border border-indigo-800/80 px-2.5 py-1.5 rounded-lg text-indigo-200 z-10 text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 backdrop-blur-md">
            <div className="w-2.5 h-2.5 rounded-full bg-indigo-400 animate-pulse"></div>
            Daylight Source Enabled (North Window)
          </div>
        )}
 
        {/* Actual mounted canvas shell / graceful WebGL fallback */}
        {webGlError ? (
          <canvas ref={fallbackCanvasRef} className="w-full h-full block" />
        ) : (
          <div ref={containerRef} className="w-full h-full" />
        )}
      </div>
    </div>
  );
}
