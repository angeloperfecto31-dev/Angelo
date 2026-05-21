import React, { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Box, Plane } from '@react-three/drei';

interface SceneProps {
  width: number;
  length: number;
  height: number;
  fixtures: number;
  lumens: number;
}

function Lights({ width, length, height, fixtures, lumens }: SceneProps) {
  const fixturePositions = useMemo(() => {
    let cols = Math.ceil(Math.sqrt(fixtures));
    let rows = Math.ceil(fixtures / cols);
    const ratio = width / Math.max(0.1, length);
    cols = Math.max(1, Math.round(Math.sqrt(fixtures * ratio)));
    rows = Math.ceil(fixtures / cols);

    const positions: [number, number, number][] = [];
    if (fixtures > 0 && cols > 0 && rows > 0) {
      const stepX = width / cols;
      const stepZ = length / rows;

      for (let i = 0; i < fixtures; i++) {
        const r = Math.floor(i / cols);
        const c = i % cols;
        const x = -width / 2 + stepX / 2 + c * stepX;
        const z = -length / 2 + stepZ / 2 + r * stepZ;
        positions.push([x, height, z]);
      }
    }
    return positions;
  }, [width, length, height, fixtures]);

  // Aggregate point lights if there are too many (max 16 to avoid WebGL uniform limits)
  const MAX_LIGHTS = 16;
  const lightPositions = useMemo(() => {
    if (fixtures <= MAX_LIGHTS) return fixturePositions;
    
    // Create a smaller grid for the actual light sources
    const count = MAX_LIGHTS;
    let cols = Math.ceil(Math.sqrt(count));
    let rows = Math.ceil(count / cols);
    const ratio = width / Math.max(0.1, length);
    cols = Math.max(1, Math.round(Math.sqrt(count * ratio)));
    rows = Math.ceil(count / cols);

    const positions: [number, number, number][] = [];
    if (count > 0 && cols > 0 && rows > 0) {
      const stepX = width / cols;
      const stepZ = length / rows;

      for (let i = 0; i < count; i++) {
        const r = Math.floor(i / cols);
        const c = i % cols;
        const x = -width / 2 + stepX / 2 + c * stepX;
        const z = -length / 2 + stepZ / 2 + r * stepZ;
        positions.push([x, height, z]);
      }
    }
    return positions;
  }, [width, length, height, fixtures, fixturePositions]);

  const pointLightIntensity = Math.min(lumens, 10000) / 100; // Scaled for threejs standard materials
  // Scale intensity up if we're aggregating lights
  const intensityMultiplier = fixtures > MAX_LIGHTS ? fixtures / MAX_LIGHTS : 1;
  const finalIntensity = pointLightIntensity * intensityMultiplier;

  return (
    <>
      <ambientLight intensity={0.2} />
      {/* Visual fixtures (boxes) */}
      {fixturePositions.map((pos, idx) => (
        <group key={`mesh-${idx}`} position={pos}>
          <mesh position={[0, 0, 0]}>
            <boxGeometry args={[0.3, 0.1, 0.3]} />
            <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={1} />
          </mesh>
        </group>
      ))}
      
      {/* Actual light sources (capped to prevent uniform limit errors) */}
      {lightPositions.map((pos, idx) => (
        <pointLight 
          key={`light-${idx}`} 
          position={pos} 
          intensity={finalIntensity} 
          distance={height * 3} 
          decay={2} 
          color="#fffcf5" 
        />
      ))}
    </>
  );
}

export default function Illumination3DModel({ width, length, height, fixtures, lumens }: SceneProps) {
  return (
    <div className="w-full h-[400px] mt-8 bg-slate-900 rounded-xl overflow-hidden relative cursor-move">
      <div className="absolute top-4 left-4 z-10 text-white font-bold text-sm tracking-widest uppercase opacity-50">3D Lighting Visualizer</div>
      <Canvas camera={{ position: [width * 1.5, height * 2, length * 1.5], fov: 50 }}>
        <OrbitControls makeDefault minPolarAngle={0} maxPolarAngle={Math.PI / 2 - 0.05} />
        <Lights width={width} length={length} height={height} fixtures={fixtures} lumens={lumens} />
        
        {/* Floor */}
        <Plane rotation={[-Math.PI / 2, 0, 0]} args={[width, length]} receiveShadow>
          <meshStandardMaterial color="#808080" roughness={0.8} metalness={0.2} />
        </Plane>

        {/* Walls Outline */}
        <Box position={[0, height / 2, -length / 2]} args={[width, height, 0.1]}>
           <meshStandardMaterial color="#a0a0a0" transparent opacity={0.1} />
        </Box>
        <Box position={[0, height / 2, length / 2]} args={[width, height, 0.1]}>
           <meshStandardMaterial color="#a0a0a0" transparent opacity={0.1} />
        </Box>
        <Box position={[-width / 2, height / 2, 0]} args={[0.1, height, length]}>
           <meshStandardMaterial color="#a0a0a0" transparent opacity={0.1} />
        </Box>
        <Box position={[width / 2, height / 2, 0]} args={[0.1, height, length]}>
           <meshStandardMaterial color="#a0a0a0" transparent opacity={0.1} />
        </Box>
      </Canvas>
    </div>
  );
}
