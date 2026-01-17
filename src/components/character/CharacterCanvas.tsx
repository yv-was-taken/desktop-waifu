import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { EffectComposer, Outline } from '@react-three/postprocessing';
import { CharacterModel } from './CharacterModel';
import { characters } from '../../characters';
import { useAppStore } from '../../store';

function LoadingFallback() {
  return (
    <mesh>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#39c5bb" wireframe />
    </mesh>
  );
}

export function CharacterCanvas() {
  const selectedCharacter = useAppStore((state) => state.settings.selectedCharacter);
  const character = characters[selectedCharacter];

  if (!character) {
    return <div className="flex-1 flex items-center justify-center text-white">Character not found</div>;
  }

  return (
    <div className="w-full h-full">
      <Canvas
        gl={{
          alpha: true,
          antialias: true,
          powerPreference: 'high-performance',
        }}
        camera={{
          position: [0, -0.3, 3],
          fov: 30,
          near: 0.1,
          far: 1000,
        }}
        className="w-full h-full"
      >

        
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
              visibleEdgeColor={0xffffff}
              hiddenEdgeColor={0xffffff}
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
          minDistance={1}
          maxDistance={10}
          minPolarAngle={Math.PI / 6}
          maxPolarAngle={Math.PI / 2}
          target={[0, -0.3, 0]}
        />
      </Canvas>
    </div>
  );
}
