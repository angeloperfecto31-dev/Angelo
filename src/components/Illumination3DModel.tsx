import React, { useEffect, useRef, useMemo, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

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

// Dynamic 3D model generator for custom physical fixtures
function createFixture3D(resolved: ReturnType<typeof resolveFixtureParams>) {
  const group = new THREE.Group();
  
  const housingMat = new THREE.MeshStandardMaterial({
    color: 0x334155, // Slate-700 housing frame
    roughness: 0.5,
    metalness: 0.5
  });
  
  const emitterMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xfffcf0,
    emissiveIntensity: 2.0
  });

  if (resolved.shape === 'linear') {
    // Tube light / linear fitting
    const housingW = resolved.width + 0.02;
    const housingL = resolved.length + 0.02;
    const housingH = Math.max(0.02, resolved.thickness);
    
    // Housing plate / backplate
    const housingGeo = new THREE.BoxGeometry(housingW, housingH, housingL);
    const housingMesh = new THREE.Mesh(housingGeo, housingMat);
    group.add(housingMesh);
    
    // Long illuminated tube cylinder
    const tubeR = resolved.width / 2;
    const tubeL = resolved.length * 0.96;
    const tubeGeo = new THREE.CylinderGeometry(tubeR, tubeR, tubeL, 16);
    tubeGeo.rotateX(Math.PI / 2); // align along Z-axis (room length)
    const tubeMesh = new THREE.Mesh(tubeGeo, emitterMat);
    tubeMesh.position.y = -housingH / 2 + 0.005;
    group.add(tubeMesh);
    
    // Small chrome/metallic end-caps
    const capGeo = new THREE.CylinderGeometry(tubeR + 0.005, tubeR + 0.005, 0.02, 16);
    capGeo.rotateX(Math.PI / 2);
    const cap1 = new THREE.Mesh(capGeo, new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8 }));
    cap1.position.set(0, -housingH / 2 + 0.005, -tubeL / 2);
    const cap2 = cap1.clone();
    cap2.position.set(0, -housingH / 2 + 0.005, tubeL / 2);
    group.add(cap1);
    group.add(cap2);
    
  } else if (resolved.shape === 'circular') {
    const rad = resolved.diameter / 2;
    const h = resolved.thickness;
    
    if (h > 0.15) {
      // Pendant suspension chandelier or industrial high-bay cone
      // Ceiling cap attachment
      const capGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.02, 16);
      const cap = new THREE.Mesh(capGeo, housingMat);
      cap.position.y = 0.01;
      group.add(cap);
      
      // Suspension cord
      const cordL = h * 0.7;
      const cordGeo = new THREE.CylinderGeometry(0.006, 0.006, cordL, 8);
      const cord = new THREE.Mesh(cordGeo, new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9 }));
      cord.position.y = -cordL / 2;
      group.add(cord);
      
      // Pendant cone body
      const bodyH = h * 0.3;
      const bodyGeo = new THREE.CylinderGeometry(rad * 0.3, rad, bodyH, 32, 1, false);
      const body = new THREE.Mesh(bodyGeo, housingMat);
      body.position.y = -cordL - bodyH / 2;
      group.add(body);
      
      // Glowing sphere bulb inside bell
      const bulbGeo = new THREE.SphereGeometry(rad * 0.45, 24, 24);
      const bulb = new THREE.Mesh(bulbGeo, emitterMat);
      bulb.position.y = -cordL - bodyH + 0.01;
      group.add(bulb);
      
    } else {
      // Small/flat circular downlight or ceiling dome
      // Housing container flange
      const ringGeo = new THREE.CylinderGeometry(rad + 0.015, rad + 0.015, h, 32);
      const ring = new THREE.Mesh(ringGeo, housingMat);
      group.add(ring);
      
      // Glowing diffuser board
      const diskGeo = new THREE.CylinderGeometry(rad, rad, h - 0.004, 32);
      const disk = new THREE.Mesh(diskGeo, emitterMat);
      disk.position.y = -0.002;
      group.add(disk);
    }
    
  } else if (resolved.shape === 'square') {
    // Square modular light ceiling panel (e.g. 2x2 grid flat)
    const w = resolved.width;
    const h = resolved.thickness;
    
    // Metallic outer framing
    const frameGeo = new THREE.BoxGeometry(w + 0.02, h, w + 0.02);
    const frame = new THREE.Mesh(frameGeo, housingMat);
    group.add(frame);
    
    // Glowing diffuser block
    const boardGeo = new THREE.BoxGeometry(w, h - 0.004, w);
    const board = new THREE.Mesh(boardGeo, emitterMat);
    board.position.y = -0.002;
    group.add(board);
    
  } else {
    // Rectangular office fixture or floodlight plate
    const w = resolved.width;
    const l = resolved.length;
    const h = resolved.thickness;
    
    const frameGeo = new THREE.BoxGeometry(w + 0.02, h, l + 0.02);
    const frame = new THREE.Mesh(frameGeo, housingMat);
    group.add(frame);
    
    const boardGeo = new THREE.BoxGeometry(w, h - 0.004, l);
    const board = new THREE.Mesh(boardGeo, emitterMat);
    board.position.y = -0.002;
    group.add(board);
  }
  
  return group;
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
  fixtureDistributionType
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
    fixtureDistributionType
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
        fixtureDistributionType
      });
    }, 280); // 280ms provides optimal blend between live feel and high-performance typing fluidity

    return () => {
      clearTimeout(handler);
    };
  }, [
    width, length, height, ceilingHeight, fixtures, lumens, showFalseColor, 
    enableDaylight, windowArea, skyCondition, targetLux,
    fixtureShape, fixtureWidth, fixtureLength, fixtureDiameter, fixtureThickness, fixtureBeamAngle, fixtureDistributionType
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
    fixtureDistributionType: dFixtureDistributionType
  } = debouncedParams;

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

  // Generate false color heat-map texture dynamically using a 2D canvas with proper distribution curves
  const canvasTextureElement = useMemo(() => {
    if (!dShowFalseColor) return null;
    
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Find grid layout of fixtures
    let cols = Math.ceil(Math.sqrt(dFixtures));
    let rows = Math.ceil(dFixtures / cols);
    const ratio = dWidth / Math.max(0.1, dLength);
    cols = Math.max(1, Math.round(Math.sqrt(dFixtures * ratio)));
    rows = Math.ceil(dFixtures / cols);

    const fixturePositions: {x: number; z: number}[] = [];
    if (dFixtures > 0 && cols > 0 && rows > 0) {
      const stepZ = dLength / rows;
      for (let r = 0; r < rows; r++) {
        const startIdx = r * cols;
        const endIdx = Math.min(dFixtures, (r + 1) * cols);
        const fixturesInThisRow = endIdx - startIdx;
        if (fixturesInThisRow <= 0) continue;

        const rowStepX = dWidth / fixturesInThisRow;
        for (let c = 0; c < fixturesInThisRow; c++) {
          fixturePositions.push({
            x: -dWidth / 2 + rowStepX / 2 + c * rowStepX,
            z: -dLength / 2 + stepZ / 2 + r * stepZ
          });
        }
      }
    }

    const skyIllum = dSkyCondition === 'clear' ? 35000 : dSkyCondition === 'partly' ? 18000 : 7000;

    for (let cZ = 0; cZ < 64; cZ++) {
      for (let cX = 0; cX < 64; cX++) {
        const realX = -dWidth / 2 + (cX / 63) * dWidth;
        const realZ = -dLength / 2 + (cZ / 63) * dLength;

        let totalLux = 0;

        fixturePositions.forEach(pos => {
          let ptLux = 0;
          const intensity = dLumens / (2 * Math.PI); // standard forward flux
          
          if (resolved.distributionType === 'linear') {
            // Linear light segment spread along Z-axis (length)
            const halfL = resolved.length / 2;
            const zClamped = Math.max(pos.z - halfL, Math.min(pos.z + halfL, realZ));
            
            const dx = realX - pos.x;
            const dz = realZ - zClamped;
            const distSq = dx*dx + dz*dz + dHeight**2;
            const dist = Math.sqrt(distSq);
            
            const cosTheta = dHeight / dist;
            const theta = Math.acos(cosTheta);
            const beamHalfAngleRad = (resolved.beamAngle / 2) * (Math.PI / 180);
            
            let factor = 0;
            if (theta <= beamHalfAngleRad) {
              factor = Math.cos((theta / beamHalfAngleRad) * (Math.PI / 2));
            }
            
            const rawPtLux = (intensity * dHeight) / Math.pow(distSq, 1.5);
            ptLux = rawPtLux * factor;
            
          } else if (resolved.distributionType === 'oblong') {
            // Oval-shaped asymmetric spread
            const dx = (realX - pos.x) * 1.6; // squeeze X
            const dz = (realZ - pos.z) * 0.7; // extend Z (wide roadway sweep)
            const distSq = dx*dx + dz*dz + dHeight**2;
            const dist = Math.sqrt(distSq);
            const cosTheta = dHeight / dist;
            const theta = Math.acos(cosTheta);
            const beamHalfAngleRad = (resolved.beamAngle / 2) * (Math.PI / 180);
            
            let factor = 0;
            if (theta <= beamHalfAngleRad) {
              factor = Math.cos((theta / beamHalfAngleRad) * (Math.PI / 2));
            }
            
            const rawPtLux = (intensity * dHeight) / Math.pow(distSq, 1.5);
            ptLux = rawPtLux * factor;
            
          } else if (resolved.distributionType === 'omni') {
            // Omnidirectional scattering
            const dx = realX - pos.x;
            const dz = realZ - pos.z;
            const distSq = dx*dx + dz*dz + dHeight**2;
            const dist = Math.sqrt(distSq);
            const cosTheta = dHeight / dist;
            
            // Very smooth diffuse dropoff
            const factor = Math.cos(Math.acos(cosTheta) * 0.6);
            
            const rawPtLux = (intensity * dHeight) / Math.pow(distSq, 1.5);
            ptLux = rawPtLux * factor;
            
          } else { // 'conical' standard directive spot
            const dx = realX - pos.x;
            const dz = realZ - pos.z;
            const distSq = dx*dx + dz*dz + dHeight**2;
            const dist = Math.sqrt(distSq);
            const cosTheta = dHeight / dist;
            const theta = Math.acos(cosTheta);
            const beamHalfAngleRad = (resolved.beamAngle / 2) * (Math.PI / 180);
            
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
          const dfAtWall = 0.08 * (dWindowArea / (dWidth * dLength)) * 100;
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
  }, [dWidth, dLength, dHeight, dCeilingHeight, dFixtures, dLumens, dShowFalseColor, dEnableDaylight, dWindowArea, dSkyCondition, dTargetLux, resolved]);

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
    let cols = Math.ceil(Math.sqrt(dFixtures));
    let rows = Math.ceil(dFixtures / cols);
    const ratio = dWidth / Math.max(0.1, dLength);
    cols = Math.max(1, Math.round(Math.sqrt(dFixtures * ratio)));
    rows = Math.ceil(dFixtures / cols);

    const fixturePositions: {x: number; z: number}[] = [];
    if (dFixtures > 0 && cols > 0 && rows > 0) {
      const stepZ = dLength / rows;
      for (let r = 0; r < rows; r++) {
        const startIdx = r * cols;
        const endIdx = Math.min(dFixtures, (r + 1) * cols);
        const fixturesInThisRow = endIdx - startIdx;
        if (fixturesInThisRow <= 0) continue;

        const rowStepX = dWidth / fixturesInThisRow;
        for (let c = 0; c < fixturesInThisRow; c++) {
          fixturePositions.push({
            x: -dWidth / 2 + rowStepX / 2 + c * rowStepX,
            z: -dLength / 2 + stepZ / 2 + r * stepZ
          });
        }
      }
    }

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

          fixturePositions.forEach(pos => {
            let ptLux = 0;
            const intensity = dLumens / (2 * Math.PI);

            if (resolved.distributionType === 'linear') {
              const halfL = resolved.length / 2;
              const zClamped = Math.max(pos.z - halfL, Math.min(pos.z + halfL, realZ));
              const dx = realX - pos.x;
              const dz = realZ - zClamped;
              const distSq = dx*dx + dz*dz + dHeight**2;
              const dist = Math.sqrt(distSq);
              const cosTheta = dHeight / dist;
              const theta = Math.acos(cosTheta);
              const beamHalfAngleRad = (resolved.beamAngle / 2) * (Math.PI / 180);
              let factor = 0;
              if (theta <= beamHalfAngleRad) {
                factor = Math.cos((theta / beamHalfAngleRad) * (Math.PI / 2));
              }
              ptLux = ((intensity * dHeight) / Math.pow(distSq, 1.5)) * factor;
            } else if (resolved.distributionType === 'oblong') {
              const dx = (realX - pos.x) * 1.6;
              const dz = (realZ - pos.z) * 0.7;
              const distSq = dx*dx + dz*dz + dHeight**2;
              const dist = Math.sqrt(distSq);
              const cosTheta = dHeight / dist;
              const theta = Math.acos(cosTheta);
              const beamHalfAngleRad = (resolved.beamAngle / 2) * (Math.PI / 180);
              let factor = 0;
              if (theta <= beamHalfAngleRad) {
                factor = Math.cos((theta / beamHalfAngleRad) * (Math.PI / 2));
              }
              ptLux = ((intensity * dHeight) / Math.pow(distSq, 1.5)) * factor;
            } else if (resolved.distributionType === 'omni') {
              const dx = realX - pos.x;
              const dz = realZ - pos.z;
              const distSq = dx*dx + dz*dz + dHeight**2;
              const dist = Math.sqrt(distSq);
              const cosTheta = dHeight / dist;
              const factor = Math.cos(Math.acos(cosTheta) * 0.6);
              ptLux = ((intensity * dHeight) / Math.pow(distSq, 1.5)) * factor;
            } else {
              const dx = realX - pos.x;
              const dz = realZ - pos.z;
              const distSq = dx*dx + dz*dz + dHeight**2;
              const dist = Math.sqrt(distSq);
              const cosTheta = dHeight / dist;
              const theta = Math.acos(cosTheta);
              const beamHalfAngleRad = (resolved.beamAngle / 2) * (Math.PI / 180);
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
            const dfAtWall = 0.08 * (dWindowArea / (dWidth * dLength)) * 100;
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
    fixturePositions.forEach((pos, index) => {
      const cx = startX + ((pos.x + dWidth / 2) / dWidth) * drawW;
      const cy = startY + ((pos.z + dLength / 2) / dLength) * drawH;

      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#f8fafc';
      ctx.lineWidth = 1.5;
      
      ctx.shadowColor = '#fef08a';
      ctx.shadowBlur = 10;

      if (resolved.shape === 'circular') {
        const rad = Math.max(3.5, (resolved.diameter / 2) * scale);
        ctx.beginPath();
        ctx.arc(cx, cy, rad, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
      } else if (resolved.shape === 'linear') {
        const lThickness = Math.max(2, resolved.width * scale);
        const lLen = Math.max(12, resolved.length * scale);
        ctx.fillRect(cx - lThickness / 2, cy - lLen / 2, lThickness, lLen);
        ctx.strokeRect(cx - lThickness / 2, cy - lLen / 2, lThickness, lLen);
      } else { // square or rectangular
        const rectW = Math.max(6, resolved.width * scale);
        const rectL = Math.max(6, resolved.length * scale);
        ctx.fillRect(cx - rectW / 2, cy - rectL / 2, rectW, rectL);
        ctx.strokeRect(cx - rectW / 2, cy - rectL / 2, rectW, rectL);
      }

      ctx.shadowBlur = 0; // Reset blur

      // Draw number inside fixture circle/rect
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 8px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText((index + 1).toString(), cx, cy);
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

  }, [dWidth, dLength, dHeight, dCeilingHeight, dFixtures, dLumens, dShowFalseColor, dEnableDaylight, dWindowArea, dSkyCondition, dTargetLux, resolved, webGlError]);

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
    camera.position.set(dWidth * 1.4, dCeilingHeight * 2.2, dLength * 1.4);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    } catch (err: any) {
      console.warn("WebGL Renderer creation failed:", err);
      setWebGlError(err?.message || "WebGL context creation failed");
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(containerWidth, containerHeight);
    containerRef.current.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.05;
    controls.minPolarAngle = 0.05;

    // Ambient light
    const ambientIntensity = dShowFalseColor ? 0.04 : 0.22;
    const ambientLight = new THREE.AmbientLight(0xffffff, ambientIntensity);
    scene.add(ambientLight);

    // Calculate grid placements
    let cols = Math.ceil(Math.sqrt(dFixtures));
    let rows = Math.ceil(dFixtures / cols);
    const ratio = dWidth / Math.max(0.1, dLength);
    cols = Math.max(1, Math.round(Math.sqrt(dFixtures * ratio)));
    rows = Math.ceil(dFixtures / cols);

    const fixturePositions: [number, number, number][] = [];
    if (dFixtures > 0 && cols > 0 && rows > 0) {
      const stepZ = dLength / rows;
      for (let r = 0; r < rows; r++) {
        const startIdx = r * cols;
        const endIdx = Math.min(dFixtures, (r + 1) * cols);
        const fixturesInThisRow = endIdx - startIdx;
        if (fixturesInThisRow <= 0) continue;

        const rowStepX = dWidth / fixturesInThisRow;
        for (let c = 0; c < fixturesInThisRow; c++) {
          const x = -dWidth / 2 + rowStepX / 2 + c * rowStepX;
          const z = -dLength / 2 + stepZ / 2 + r * stepZ;
          fixturePositions.push([x, dHeight, z]);
        }
      }
    }

    // Spawn 3D Fixture models on ceiling
    fixturePositions.forEach(pos => {
      const model = createFixture3D(resolved);
      model.position.set(pos[0], pos[1], pos[2]);
      
      // If linear, align orientation along Z-axis (room length) or X-axis based on room ratio
      if (resolved.shape === 'linear') {
        // Oriented nicely
        model.rotation.y = 0; 
      }
      scene.add(model);
    });

    // Spawn Three.js Spotlights matching the directionality and beam angle
    const MAX_LIGHTS = 16;
    let lightPositions: [number, number, number][] = [];
    if (dFixtures <= MAX_LIGHTS) {
      lightPositions = fixturePositions;
    } else {
      const count = MAX_LIGHTS;
      let lCols = Math.ceil(Math.sqrt(count));
      let lRows = Math.ceil(count / lCols);
      const lRatio = dWidth / Math.max(0.1, dLength);
      lCols = Math.max(1, Math.round(Math.sqrt(count * lRatio)));
      lRows = Math.ceil(count / lCols);

      if (count > 0 && lCols > 0 && lRows > 0) {
        const stepZ = dLength / lRows;
        for (let r = 0; r < lRows; r++) {
          const startIdx = r * lCols;
          const endIdx = Math.min(count, (r + 1) * lCols);
          const lightsInThisRow = endIdx - startIdx;
          if (lightsInThisRow <= 0) continue;

          const rowStepX = dWidth / lightsInThisRow;
          for (let c = 0; c < lightsInThisRow; c++) {
            const x = -dWidth / 2 + rowStepX / 2 + c * rowStepX;
            const z = -dLength / 2 + stepZ / 2 + r * stepZ;
            lightPositions.push([x, dHeight, z]);
          }
        }
      }
    }

    const pointLightIntensity = Math.min(dLumens, 10000) / 100;
    const intensityMultiplier = dFixtures > MAX_LIGHTS ? dFixtures / MAX_LIGHTS : 1;
    const finalIntensity = pointLightIntensity * intensityMultiplier;
    const lightIntensity = dShowFalseColor ? finalIntensity * 0.15 : finalIntensity;

    lightPositions.forEach(pos => {
      if (resolved.distributionType === 'conical' || resolved.distributionType === 'linear') {
        // High-fidelity cone/spotlights directed downward
        const spotLight = new THREE.SpotLight(
          0xfffff4,
          lightIntensity * 4.0, 
          dHeight * 3.8,
          (resolved.beamAngle * Math.PI) / 360, // angle/2 in radian
          0.3, // soft decay edge
          1.6  // physical decay
        );
        spotLight.position.set(pos[0], pos[1], pos[2]);
        
        // Spot target vector
        const targetObj = new THREE.Object3D();
        targetObj.position.set(pos[0], pos[1] - 1.0, pos[2]);
        scene.add(targetObj);
        spotLight.target = targetObj;
        
        scene.add(spotLight);
      } else {
        // Spherical scattering for omni / oblong
        const pointLight = new THREE.PointLight(0xfffff0, lightIntensity, dHeight * 3.5, 1.8);
        pointLight.position.set(pos[0], pos[1], pos[2]);
        scene.add(pointLight);
      }
    });

    // Floor design plane
    const floorGeo = new THREE.PlaneGeometry(dWidth, dLength);
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

    const vWallGeoX = new THREE.BoxGeometry(dWidth, dCeilingHeight, 0.02);
    const vWallGeoZ = new THREE.BoxGeometry(0.02, dCeilingHeight, dLength);

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
  }, [dWidth, dLength, dHeight, dCeilingHeight, dFixtures, dLumens, dShowFalseColor, dEnableDaylight, dWindowArea, dSkyCondition, canvasTextureElement, dTargetLux, resolved]);

  // Model Luminous Adequacy Assessments
  const estAverageLux = Math.ceil((fixtures * lumens * 0.6) / (width * length || 1));
  
  let complianceBadge = "NO WORKPLACE FIXTURES";
  let complianceBg = "bg-slate-900/95 border-slate-700 text-slate-300";
  let complianceMessage = "Please add lighting fixtures to calculate estimated lux on the working plane.";

  if (fixtures > 0) {
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
      <div id="illumination-diagram" className="min-w-[950px] w-full max-w-full h-[550px] bg-slate-950 rounded-2xl overflow-hidden relative border-2 border-slate-800 mx-auto">
        
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
              <div>ROOM SIZE: {width.toFixed(2)}m (W) × {length.toFixed(2)}m (L) × {ceilingHeight.toFixed(2)}m (H)</div>
              <div className="text-cyan-400 font-bold uppercase text-[9px] tracking-wide">
                FIXTURE: {resolved.shape} ({resolved.shape === 'circular' ? `Ø${resolved.diameter}m` : `${resolved.width}m × ${resolved.length}m`}) | Beam: {resolved.beamAngle}° | {resolved.distributionType}
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
