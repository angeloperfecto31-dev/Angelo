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
  isExporting?: boolean;
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
  isExporting = false
}: SceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);

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
    targetLux
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
        targetLux
      });
    }, 280); // 280ms provides optimal blend between live feel and high-performance typing fluidity

    return () => {
      clearTimeout(handler);
    };
  }, [width, length, height, ceilingHeight, fixtures, lumens, showFalseColor, enableDaylight, windowArea, skyCondition, targetLux]);

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
    targetLux: dTargetLux
  } = debouncedParams;

  // Generate false color heat-map texture dynamically using a 2D canvas
  const canvasTextureElement = useMemo(() => {
    if (!dShowFalseColor) return null;
    
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // find fixture positions
    let cols = Math.ceil(Math.sqrt(dFixtures));
    let rows = Math.ceil(dFixtures / cols);
    const ratio = dWidth / Math.max(0.1, dLength);
    cols = Math.max(1, Math.round(Math.sqrt(dFixtures * ratio)));
    rows = Math.ceil(dFixtures / cols);

    const fixturePositions: {x: number; z: number}[] = [];
    if (dFixtures > 0 && cols > 0 && rows > 0) {
      const stepX = dWidth / cols;
      const stepZ = dLength / rows;
      for (let i = 0; i < dFixtures; i++) {
        const r = Math.floor(i / cols);
        const c = i % cols;
        fixturePositions.push({
          x: -dWidth / 2 + stepX / 2 + c * stepX,
          z: -dLength / 2 + stepZ / 2 + r * stepZ
        });
      }
    }

    const skyIllum = dSkyCondition === 'clear' ? 35000 : dSkyCondition === 'partly' ? 18000 : 7000;

    for (let cZ = 0; cZ < 64; cZ++) {
      for (let cX = 0; cX < 64; cX++) {
        // Map 0-63 grid to actual coordinates from -width/2 to width/2, -length/2 to length/2
        const realX = -dWidth / 2 + (cX / 63) * dWidth;
        const realZ = -dLength / 2 + (cZ / 63) * dLength;

        let totalLux = 0;
        fixturePositions.forEach(pos => {
          const distSq = (realX - pos.x)**2 + (realZ - pos.z)**2 + dHeight**2;
          const intensity = dLumens / (2 * Math.PI); // forward light distribution scale
          const ptLux = (intensity * dHeight) / Math.pow(distSq, 1.5);
          totalLux += ptLux;
        });

        // Add daylight factor details (from North y=negative direction)
        if (dEnableDaylight) {
          // North is negative Z in three.js: e.g. -length/2
          const distFromNorth = realZ - (-dLength/2);
          const dfAtWall = 0.08 * (dWindowArea / (dWidth * dLength)) * 100;
          const locDF = dfAtWall * Math.exp(-0.5 * Math.max(0, distFromNorth));
          const daylightPointLux = locDF * skyIllum / 100;
          totalLux += daylightPointLux;
        }

        // Define dynamic thresholds based on targetLux
        const t1 = dTargetLux * 0.33;
        const t2 = dTargetLux * 0.67;
        const t3 = dTargetLux * 1.0;
        const t4 = dTargetLux * 1.67;
        const t5 = dTargetLux * 2.5;

        // Color mapper representing relative lux values
        let rgbColor = 'rgb(0,0,50)';
        if (totalLux < t1) {
          const ratio = totalLux / t1;
          rgbColor = `rgb(0, 0, ${Math.round(50 + ratio * 150)})`;
        } else if (totalLux < t2) {
          const ratio = (totalLux - t1) / (t2 - t1);
          rgbColor = `rgb(0, ${Math.round(ratio * 200)}, 200)`;
        } else if (totalLux < t3) {
          const ratio = (totalLux - t2) / (t3 - t2);
          rgbColor = `rgb(0, 255, ${Math.round(200 - ratio * 200)})`;
        } else if (totalLux < t4) {
          const ratio = (totalLux - t3) / (t4 - t3);
          rgbColor = `rgb(${Math.round(ratio * 255)}, 255, 0)`;
        } else if (totalLux < t5) {
          const ratio = (totalLux - t4) / (t5 - t4);
          rgbColor = `rgb(255, ${Math.round(255 - ratio * 155)}, 0)`;
        } else {
          const ratio = Math.min(1, (totalLux - t5) / t5);
          rgbColor = `rgb(255, ${Math.round(100 + ratio * 155)}, ${Math.round(100 + ratio * 155)})`;
        }

        ctx.fillStyle = rgbColor;
        ctx.fillRect(cX, cZ, 1, 1);
      }
    }

    return canvas;
  }, [dWidth, dLength, dHeight, dCeilingHeight, dFixtures, dLumens, dShowFalseColor, dEnableDaylight, dWindowArea, dSkyCondition, dTargetLux]);

  useEffect(() => {
    if (!containerRef.current) return;

    // Clear any existing contents
    containerRef.current.innerHTML = '';

    const containerWidth = containerRef.current.clientWidth || 600;
    const containerHeight = containerRef.current.clientHeight || 450;

    // Use scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#020617'); // slate-950

    // Setup camera
    const camera = new THREE.PerspectiveCamera(45, containerWidth / containerHeight, 0.1, 1000);
    camera.position.set(dWidth * 1.5, dCeilingHeight * 2.5, dLength * 1.5);

    // Setup renderer with preserveDrawingBuffer enabled for image exports
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(containerWidth, containerHeight);
    containerRef.current.appendChild(renderer.domElement);

    // Setup controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.05;
    controls.minPolarAngle = 0.05;

    // Lighting config
    const ambientIntensity = dShowFalseColor ? 0.05 : 0.2;
    const ambientLight = new THREE.AmbientLight(0xffffff, ambientIntensity);
    scene.add(ambientLight);

    // Fixture Positions Grid derivation
    let cols = Math.ceil(Math.sqrt(dFixtures));
    let rows = Math.ceil(dFixtures / cols);
    const ratio = dWidth / Math.max(0.1, dLength);
    cols = Math.max(1, Math.round(Math.sqrt(dFixtures * ratio)));
    rows = Math.ceil(dFixtures / cols);

    const fixturePositions: [number, number, number][] = [];
    if (dFixtures > 0 && cols > 0 && rows > 0) {
      const stepX = dWidth / cols;
      const stepZ = dLength / rows;

      for (let i = 0; i < dFixtures; i++) {
        const r = Math.floor(i / cols);
        const c = i % cols;
        const x = -dWidth / 2 + stepX / 2 + c * stepX;
        const z = -dLength / 2 + stepZ / 2 + r * stepZ;
        fixturePositions.push([x, dHeight, z]);
      }
    }

    // Drawing individual light boxes (reflectors) on ceiling
    const fixtureGeo = new THREE.BoxGeometry(0.3, 0.08, 0.3);
    const fixtureMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 1.0
    });

    fixturePositions.forEach(pos => {
      const fixtureMesh = new THREE.Mesh(fixtureGeo, fixtureMat);
      fixtureMesh.position.set(pos[0], pos[1], pos[2]);
      scene.add(fixtureMesh);
    });

    // Aggregate point lights (up to 16) to prevent WebGL driver crashes
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
        const stepX = dWidth / lCols;
        const stepZ = dLength / lRows;
        for (let i = 0; i < count; i++) {
          const r = Math.floor(i / lCols);
          const c = i % lCols;
          const x = -dWidth / 2 + stepX / 2 + c * stepX;
          const z = -dLength / 2 + stepZ / 2 + r * stepZ;
          lightPositions.push([x, dHeight, z]);
        }
      }
    }

    const pointLightIntensity = Math.min(dLumens, 10000) / 100;
    const intensityMultiplier = dFixtures > MAX_LIGHTS ? dFixtures / MAX_LIGHTS : 1;
    const finalIntensity = pointLightIntensity * intensityMultiplier;
    const lightIntensity = dShowFalseColor ? finalIntensity * 0.15 : finalIntensity;

    lightPositions.forEach(pos => {
      const pointLight = new THREE.PointLight(0xfffff0, lightIntensity, dHeight * 3.5, 1.8);
      pointLight.position.set(pos[0], pos[1], pos[2]);
      scene.add(pointLight);
    });

    // Floor Base plane
    const floorGeo = new THREE.PlaneGeometry(dWidth, dLength);
    let floorMat;

    if (dShowFalseColor && canvasTextureElement) {
      const texture = new THREE.CanvasTexture(canvasTextureElement);
      floorMat = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
    } else {
      floorMat = new THREE.MeshStandardMaterial({ 
        color: 0x475569, 
        roughness: 0.75, 
        metalness: 0.1,
        side: THREE.DoubleSide 
      });
    }

    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    scene.add(floorMesh);

    // Render Windows geometry if daylight is configured
    if (dEnableDaylight) {
      const winW = Math.min(dWidth * 0.7, Math.sqrt(dWindowArea) * 1.5);
      const winH = Math.min(dCeilingHeight * 0.6, Math.sqrt(dWindowArea));
      const winGeo = new THREE.PlaneGeometry(winW, winH);
      const winMat = new THREE.MeshBasicMaterial({ 
        color: 0x38bdf8, 
        transparent: true, 
        opacity: 0.65, 
        side: THREE.DoubleSide 
      });
      const winMesh = new THREE.Mesh(winGeo, winMat);
      winMesh.position.set(0, dCeilingHeight / 2, -dLength / 2 + 0.01);
      scene.add(winMesh);
    }

    // Transparent Wall cages representation to contain visual room frame
    const wallMat = new THREE.MeshStandardMaterial({ 
      color: 0x334155, 
      transparent: true, 
      opacity: 0.12 
    });

    const vWallGeoX = new THREE.BoxGeometry(dWidth, dCeilingHeight, 0.04);
    const vWallGeoZ = new THREE.BoxGeometry(0.04, dCeilingHeight, dLength);

    // Back wall
    const wallBack = new THREE.Mesh(vWallGeoX, wallMat);
    wallBack.position.set(0, dCeilingHeight / 2, -dLength / 2);
    scene.add(wallBack);

    // Front wall
    const wallFront = new THREE.Mesh(vWallGeoX, wallMat);
    wallFront.position.set(0, dCeilingHeight / 2, dLength / 2);
    scene.add(wallFront);

    // Left wall
    const wallLeft = new THREE.Mesh(vWallGeoZ, wallMat);
    wallLeft.position.set(-dWidth / 2, dCeilingHeight / 2, 0);
    scene.add(wallLeft);

    // Right wall
    const wallRight = new THREE.Mesh(vWallGeoZ, wallMat);
    wallRight.position.set(dWidth / 2, dCeilingHeight / 2, 0);
    scene.add(wallRight);

    // Animation Render Loop
    let animationFrameId: number;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Event resize listener with ResizeObserver
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

    // Unmount cleanup
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
  }, [dWidth, dLength, dHeight, dCeilingHeight, dFixtures, dLumens, dShowFalseColor, dEnableDaylight, dWindowArea, dSkyCondition, canvasTextureElement, dTargetLux]);

  // Compute estimated average lighting intensity (Lux) for HUD indicators
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
        complianceMessage = `Underlit: Average lux of ${estAverageLux} Lux is dangerously below standard target (${targetLux} Lux). Add fixtures!`;
      }
    }
  }

  return (
    <div id="illumination-diagram" className={`w-full ${isExporting ? 'h-auto overflow-hidden !important bg-slate-50 flex flex-col p-4 text-slate-800' : 'h-[480px] mt-8 bg-slate-950 overflow-hidden relative'} rounded-2xl border-2 border-slate-800 shadow-xl overflow-hidden`} style={isExporting ? { overflow: 'hidden !important' } : {}}>
      
      {/* Heads-Up Display (HUD) Controls Overlay */}
      <div className={`${isExporting ? 'flex flex-col gap-3 md:flex-row md:items-start md:justify-between w-full text-slate-800 mb-4' : 'absolute top-4 left-4 z-10 text-white opacity-90 md:flex-row md:items-start md:justify-between md:w-[calc(100%-32px)] pointer-events-none'} font-black text-xs tracking-wider uppercase flex flex-col gap-3`}>
        <div className="flex flex-col gap-1.5 bg-slate-900/90 px-4 py-3 border border-slate-800 rounded-xl backdrop-blur-md">
          <span className="text-white text-xs font-bold font-mono tracking-tight flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse"></span>
            3D Lighting CAD Space
          </span>
          <span className="text-[10px] font-medium text-slate-400 normal-case">Drag mouse pointer to rotate, scroll wheel to zoom model.</span>
          <div className="text-[10px] text-yellow-300 font-mono tracking-normal mt-1 border-t border-slate-800 pt-1.5 font-bold normal-case">
            ROOM SIZE: {width.toFixed(2)}m (Width) × {length.toFixed(2)}m (Length) × {ceilingHeight.toFixed(2)}m (Ceiling Height)
          </div>
        </div>
        
        {/* LPD Compliance Status Indicator */}
        <div className="mt-2 md:mt-0 right-0 flex flex-col gap-2 pointer-events-auto">
          {lpdValue <= lpdLimit * 0.9 ? (
            <div className="bg-emerald-900/80 border border-emerald-500/50 px-3 py-1.5 rounded-lg text-emerald-300 text-[10px] uppercase backdrop-blur-sm flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
              <span>LPD Limit: Passed ({lpdValue.toFixed(2)} W/m² / {lpdLimit} max)</span>
            </div>
          ) : lpdValue <= lpdLimit ? (
            <div className="bg-amber-900/80 border border-amber-500/50 px-3 py-1.5 rounded-lg text-amber-300 text-[10px] uppercase backdrop-blur-sm flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></div>
              <span>LPD Standard critical ({lpdValue.toFixed(2)} W/m²)</span>
            </div>
          ) : (
            <div className="bg-red-900/80 border border-red-500/50 px-3 py-1.5 rounded-lg text-red-300 text-[10px] uppercase backdrop-blur-sm flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
              <span>LPD Standard Overload ({lpdValue.toFixed(2)} W/m²)</span>
            </div>
          )}

          {/* Fixture compliant status */}
          <div className={`px-3 py-1.5 rounded-lg border text-[10px] uppercase text-center backdrop-blur-sm ${complianceBg}`}>
            {complianceBadge}
          </div>
        </div>
      </div>

      {/* Floating Detailed Adequacy Note Panel */}
      <div className={`${isExporting ? 'block text-slate-800 bg-white border-slate-200 mt-4 mb-4 shadow-sm' : 'absolute left-4 bottom-4 bg-slate-900/95 border-slate-800 text-white shadow-lg pointer-events-auto'} border p-4 rounded-xl z-10 text-[10px] max-w-[340px] backdrop-blur-md space-y-1.5`}>
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
        <div className={`${isExporting ? 'block text-slate-800 bg-white border-slate-200 mb-4 shadow-sm' : 'absolute right-4 bottom-4 bg-slate-900/95 border-slate-700/80 text-white shadow-lg'} p-3.5 rounded-xl border z-10 text-[10px] space-y-2 backdrop-blur-md max-w-[220px]`}>
          <div className="font-extrabold border-b border-white/10 pb-1 mb-1 uppercase tracking-widest text-[#fbbf24] text-[9px]">False Color Lux Index</div>
          <div className="flex items-center gap-2"><div className="w-3.5 h-3.5 rounded bg-[#ffffff] border border-slate-700 shrink-0"></div><span className="font-medium text-slate-200">&gt; {Math.round(targetLux * 2.5)} Lux (Overlit / Bright)</span></div>
          <div className="flex items-center gap-2"><div className="w-3.5 h-3.5 rounded bg-[#ff0000] shrink-0"></div><span className="font-medium text-slate-200">{Math.round(targetLux * 1.67)} - {Math.round(targetLux * 2.5)} Lux (Task Area / High)</span></div>
          <div className="flex items-center gap-2"><div className="w-3.5 h-3.5 rounded bg-[#ffff00] shrink-0"></div><span className="font-medium text-slate-200">{Math.round(targetLux * 1.0)} - {Math.round(targetLux * 1.67)} Lux (Standard Target)</span></div>
          <div className="flex items-center gap-2"><div className="w-3.5 h-3.5 rounded bg-[#00ff00] shrink-0"></div><span className="font-medium text-slate-200">{Math.round(targetLux * 0.67)} - {Math.round(targetLux * 1.0)} Lux (Ambient / Warm)</span></div>
          <div className="flex items-center gap-2"><div className="w-3.5 h-3.5 rounded bg-[#00ffff] shrink-0"></div><span className="font-medium text-slate-200">{Math.round(targetLux * 0.33)} - {Math.round(targetLux * 0.67)} Lux (Low / Hallways)</span></div>
          <div className="flex items-center gap-2"><div className="w-3.5 h-3.5 rounded bg-[#0000a0] shrink-0"></div><span className="font-medium text-slate-200">&lt; {Math.round(targetLux * 0.33)} Lux (Min / Shadows)</span></div>
        </div>
      )}

      {enableDaylight && (
        <div className="absolute right-4 top-24  bg-indigo-950/80 border border-indigo-800/80 px-2.5 py-1.5 rounded-lg text-indigo-200 z-10 text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 backdrop-blur-md">
          <div className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse"></div>
          Daylight Source Enabled (North Window)
        </div>
      )}

      {/* Actual mounted canvas shell */}
      <div ref={containerRef} className={`w-full ${isExporting ? 'h-[480px] shrink-0 border border-slate-300 rounded-lg overflow-hidden' : 'h-full absolute top-0 left-0 -z-10'}`} />
    </div>
  );
}
