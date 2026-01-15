import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { EffectComposer, Outline } from '@react-three/postprocessing';
import { CharacterModel } from './CharacterModel';
import { characters, defaultCharacterId } from '../../characters';

function LoadingFallback() {
  return (
    <mesh>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#39c5bb" wireframe />
    </mesh>
  );
}

export function CharacterCanvas() {
  const character = characters[defaultCharacterId];

  if (!character) {
    return <div className="flex-1 flex items-center justify-center text-white">Character not found</div>;
  }

  return (
    <div className="flex-1 w-full h-full flex items-center justify-center">
      <Canvas
        gl={{
          alpha: false,
          antialias: true,
          powerPreference: 'high-performance',
        }}
        camera={{
          position: [0, 5, 10],
          fov: 60,
          near: 0.1,
          far: 1000,
        }}
        style={{ background: '#1a1a2e', width: '100vw', height: '100vh'}}
      >
        {/* Background color */}
        <color attach="background" args={['#1a1a2e']} />
        
        {/* Lighting for Toon Shading */}
        <ambientLight intensity={0.8} />
        <directionalLight
          position={[5, 10, 5]}
          intensity={2.5}
          castShadow
          shadow-mapSize={[2048, 2048]}
        />

        {/* Character Model and Post-processing */}
        <Suspense fallback={<LoadingFallback />}>
          <EffectComposer autoClear={false}>
            <Outline
              blur
              visibleEdgeColor="white"
              hiddenEdgeColor="white"
              edgeStrength={100}
              width={1000}
            />
            <CharacterModel config={character.config} />
          </EffectComposer>
        </Suspense>

        {/* Camera controls */}
        <OrbitControls
          enablePan={true}
          enableZoom={true}
          minDistance={2}
          maxDistance={80}
          minPolarAngle={Math.PI / 6}
          maxPolarAngle={Math.PI / 2}
          target={[0, 5, -5]}
        />
      </Canvas>
    </div>
  );
}
