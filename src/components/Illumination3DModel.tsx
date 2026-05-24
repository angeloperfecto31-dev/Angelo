import React, { useEffect, useRef, useMemo } from 'react';
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
  targetLux
}: SceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Generate false color heat-map texture dynamically using a 2D canvas
  const canvasTextureElement = useMemo(() => {
    if (!showFalseColor) return null;
    
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // find fixture positions
    let cols = Math.ceil(Math.sqrt(fixtures));
    let rows = Math.ceil(fixtures / cols);
    const ratio = width / Math.max(0.1, length);
    cols = Math.max(1, Math.round(Math.sqrt(fixtures * ratio)));
    rows = Math.ceil(fixtures / cols);

    const fixturePositions: {x: number; z: number}[] = [];
    if (fixtures > 0 && cols > 0 && rows > 0) {
      const stepX = width / cols;
      const stepZ = length / rows;
      for (let i = 0; i < fixtures; i++) {
        const r = Math.floor(i / cols);
        const c = i % cols;
        fixturePositions.push({
          x: -width / 2 + stepX / 2 + c * stepX,
          z: -length / 2 + stepZ / 2 + r * stepZ
        });
      }
    }

    const skyIllum = skyCondition === 'clear' ? 35000 : skyCondition === 'partly' ? 18000 : 7000;

    for (let cZ = 0; cZ < 64; cZ++) {
      for (let cX = 0; cX < 64; cX++) {
        // Map 0-63 grid to actual coordinates from -width/2 to width/2, -length/2 to length/2
        const realX = -width / 2 + (cX / 63) * width;
        const realZ = -length / 2 + (cZ / 63) * length;

        let totalLux = 0;
        fixturePositions.forEach(pos => {
          const distSq = (realX - pos.x)**2 + (realZ - pos.z)**2 + height**2;
          const intensity = lumens / (2 * Math.PI); // forward light distribution scale
          const ptLux = (intensity * height) / Math.pow(distSq, 1.5);
          totalLux += ptLux;
        });

        // Add daylight factor details (from North y=negative direction)
        if (enableDaylight) {
          // North is negative Z in three.js: e.g. -length/2
          const distFromNorth = realZ - (-length/2);
          const dfAtWall = 0.08 * (windowArea / (width * length)) * 100;
          const locDF = dfAtWall * Math.exp(-0.5 * Math.max(0, distFromNorth));
          const daylightPointLux = locDF * skyIllum / 100;
          totalLux += daylightPointLux;
        }

        // Define dynamic thresholds based on targetLux
        const t1 = targetLux * 0.33;
        const t2 = targetLux * 0.67;
        const t3 = targetLux * 1.0;
        const t4 = targetLux * 1.67;
        const t5 = targetLux * 2.5;

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
  }, [width, length, height, ceilingHeight, fixtures, lumens, showFalseColor, enableDaylight, windowArea, skyCondition, targetLux]);

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
    camera.position.set(width * 1.5, ceilingHeight * 2.5, length * 1.5);

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
    const ambientIntensity = showFalseColor ? 0.05 : 0.2;
    const ambientLight = new THREE.AmbientLight(0xffffff, ambientIntensity);
    scene.add(ambientLight);

    // Fixture Positions Grid derivation
    let cols = Math.ceil(Math.sqrt(fixtures));
    let rows = Math.ceil(fixtures / cols);
    const ratio = width / Math.max(0.1, length);
    cols = Math.max(1, Math.round(Math.sqrt(fixtures * ratio)));
    rows = Math.ceil(fixtures / cols);

    const fixturePositions: [number, number, number][] = [];
    if (fixtures > 0 && cols > 0 && rows > 0) {
      const stepX = width / cols;
      const stepZ = length / rows;

      for (let i = 0; i < fixtures; i++) {
        const r = Math.floor(i / cols);
        const c = i % cols;
        const x = -width / 2 + stepX / 2 + c * stepX;
        const z = -length / 2 + stepZ / 2 + r * stepZ;
        fixturePositions.push([x, height, z]);
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
    if (fixtures <= MAX_LIGHTS) {
      lightPositions = fixturePositions;
    } else {
      const count = MAX_LIGHTS;
      let lCols = Math.ceil(Math.sqrt(count));
      let lRows = Math.ceil(count / lCols);
      const lRatio = width / Math.max(0.1, length);
      lCols = Math.max(1, Math.round(Math.sqrt(count * lRatio)));
      lRows = Math.ceil(count / lCols);

      if (count > 0 && lCols > 0 && lRows > 0) {
        const stepX = width / lCols;
        const stepZ = length / lRows;
        for (let i = 0; i < count; i++) {
          const r = Math.floor(i / lCols);
          const c = i % lCols;
          const x = -width / 2 + stepX / 2 + c * stepX;
          const z = -length / 2 + stepZ / 2 + r * stepZ;
          lightPositions.push([x, height, z]);
        }
      }
    }

    const pointLightIntensity = Math.min(lumens, 10000) / 100;
    const intensityMultiplier = fixtures > MAX_LIGHTS ? fixtures / MAX_LIGHTS : 1;
    const finalIntensity = pointLightIntensity * intensityMultiplier;
    const lightIntensity = showFalseColor ? finalIntensity * 0.15 : finalIntensity;

    lightPositions.forEach(pos => {
      const pointLight = new THREE.PointLight(0xfffff0, lightIntensity, height * 3.5, 1.8);
      pointLight.position.set(pos[0], pos[1], pos[2]);
      scene.add(pointLight);
    });

    // Floor Base plane
    const floorGeo = new THREE.PlaneGeometry(width, length);
    let floorMat;

    if (showFalseColor && canvasTextureElement) {
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
    if (enableDaylight) {
      const winW = Math.min(width * 0.7, Math.sqrt(windowArea) * 1.5);
      const winH = Math.min(ceilingHeight * 0.6, Math.sqrt(windowArea));
      const winGeo = new THREE.PlaneGeometry(winW, winH);
      const winMat = new THREE.MeshBasicMaterial({ 
        color: 0x38bdf8, 
        transparent: true, 
        opacity: 0.65, 
        side: THREE.DoubleSide 
      });
      const winMesh = new THREE.Mesh(winGeo, winMat);
      winMesh.position.set(0, ceilingHeight / 2, -length / 2 + 0.01);
      scene.add(winMesh);
    }

    // Transparent Wall cages representation to contain visual room frame
    const wallMat = new THREE.MeshStandardMaterial({ 
      color: 0x334155, 
      transparent: true, 
      opacity: 0.12 
    });

    const vWallGeoX = new THREE.BoxGeometry(width, ceilingHeight, 0.04);
    const vWallGeoZ = new THREE.BoxGeometry(0.04, ceilingHeight, length);

    // Back wall
    const wallBack = new THREE.Mesh(vWallGeoX, wallMat);
    wallBack.position.set(0, ceilingHeight / 2, -length / 2);
    scene.add(wallBack);

    // Front wall
    const wallFront = new THREE.Mesh(vWallGeoX, wallMat);
    wallFront.position.set(0, ceilingHeight / 2, length / 2);
    scene.add(wallFront);

    // Left wall
    const wallLeft = new THREE.Mesh(vWallGeoZ, wallMat);
    wallLeft.position.set(-width / 2, ceilingHeight / 2, 0);
    scene.add(wallLeft);

    // Right wall
    const wallRight = new THREE.Mesh(vWallGeoZ, wallMat);
    wallRight.position.set(width / 2, ceilingHeight / 2, 0);
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
  }, [width, length, height, ceilingHeight, fixtures, lumens, showFalseColor, enableDaylight, windowArea, skyCondition, canvasTextureElement, targetLux]);

  return (
    <div className="w-full h-[450px] mt-8 bg-slate-950 rounded-xl overflow-hidden relative border-2 border-slate-800 shadow-inner">
      <div className="absolute top-4 left-4 z-10 text-white font-black text-xs tracking-wider uppercase opacity-80 flex flex-col gap-1 md:flex-row md:items-center md:justify-between md:w-[calc(100%-32px)]">
        <div className="flex flex-col gap-1">
          <span>3D Lighting Visualizer</span>
          <span className="text-[10px] font-medium text-slate-400 normal-case">Drag to rotate, scroll to zoom</span>
        </div>
        
        {/* LPD Compliance Status Indicator */}
        <div className="mt-2 md:mt-0 right-0">
          {lpdValue <= lpdLimit * 0.9 ? (
            <div className="bg-emerald-900/80 border border-emerald-500/50 px-3 py-1.5 rounded-lg text-emerald-300 text-[10px] uppercase backdrop-blur-sm flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
              <span>Status: Passed (LPD {lpdValue.toFixed(1)}W/m²)</span>
            </div>
          ) : lpdValue <= lpdLimit ? (
            <div className="bg-amber-900/80 border border-amber-500/50 px-3 py-1.5 rounded-lg text-amber-300 text-[10px] uppercase backdrop-blur-sm flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></div>
              <span>Needs Adjustment (LPD {lpdValue.toFixed(1)}W/m²)</span>
            </div>
          ) : (
            <div className="bg-red-900/80 border border-red-500/50 px-3 py-1.5 rounded-lg text-red-300 text-[10px] uppercase backdrop-blur-sm flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
              <span>Critical Overload (LPD {lpdValue.toFixed(1)}W/m²)</span>
            </div>
          )}
        </div>
      </div>

      {showFalseColor && (
        <div className="absolute right-4 bottom-4 bg-slate-900/95 border border-slate-700/80 p-3.5 rounded-xl text-white z-10 text-[10px] space-y-2 backdrop-blur-md shadow-lg max-w-[220px]">
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
        <div className="absolute left-4 bottom-4 bg-indigo-950/80 border border-indigo-800/80 px-2.5 py-1.5 rounded-lg text-indigo-200 z-10 text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 backdrop-blur-md">
          <div className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse"></div>
          Daylight Source Enabled (North Window)
        </div>
      )}

      {/* Actual mounted canvas shell */}
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}
