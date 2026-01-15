import { useEffect, useRef, useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useFBX, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import type { CharacterConfig } from '../../types';
import { useAppStore } from '../../store';

type AnimationState = 'idle' | 'listening' | 'thinking' | 'talking';

interface CharacterModelProps {
  config: CharacterConfig;
}

export function CharacterModel({ config }: CharacterModelProps) {
  const groupRef = useRef<THREE.Group>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const [modelLoaded, setModelLoaded] = useState(false);

  const setCharacterLoaded = useAppStore((state) => state.setCharacterLoaded);
  const isUserTyping = useAppStore((state) => state.chat.isUserTyping);
  const isThinking = useAppStore((state) => state.chat.isThinking);
  const isTalking = useAppStore((state) => state.character.isTalking);

  const animationState: AnimationState = useMemo(() => {
    if (isTalking) return 'talking';
    if (isThinking) return 'thinking';
    if (isUserTyping) return 'listening';
    return 'idle';
  }, [isTalking, isThinking, isUserTyping]);

  // Load FBX model and texture
  const fbx = useFBX(config.model.path);
  const texture = useTexture('/assets/Stylized Miku/Textures/StylizedMiku.png');

  useEffect(() => {
    if (!fbx || !groupRef.current) return;

    // Clone the model
    const model = fbx.clone();

    // Log bounding box
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    console.log('Model size (x, y, z):', size.x, size.y, size.z);

    // Configure texture
    texture.flipY = false;
    texture.colorSpace = THREE.SRGBColorSpace;

    // Scale and position
    model.scale.setScalar(config.model.scale);
    model.position.set(...config.model.position);

    // Apply texture to all meshes
    let meshCount = 0;
    model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        meshCount++;
        child.castShadow = true;
        child.receiveShadow = true;
        child.frustumCulled = false;

        // Create new material with the texture
        const newMaterial = new THREE.MeshStandardMaterial({
          map: texture,
          side: THREE.DoubleSide,
          transparent: true,
          alphaTest: 0.5,
        });

        child.material = newMaterial;
      }
    });
    console.log('Applied texture to', meshCount, 'meshes');

    // Clear and add model
    while (groupRef.current.children.length > 0) {
      groupRef.current.remove(groupRef.current.children[0]);
    }
    groupRef.current.add(model);

    // Animation mixer
    mixerRef.current = new THREE.AnimationMixer(model);

    setModelLoaded(true);
    setCharacterLoaded(true);

    return () => {
      mixerRef.current?.stopAllAction();
    };
  }, [fbx, texture, config, setCharacterLoaded]);

  const getAnimationParams = (state: AnimationState, time: number) => {
    switch (state) {
      case 'idle':
        return {
          posY: Math.sin(time * 0.5) * 0.03,
          rotY: Math.sin(time * 0.3) * 0.02,
          rotX: 0,
          rotZ: Math.sin(time * 0.4) * 0.01,
          scale: 1,
        };
      case 'listening':
        return {
          posY: Math.sin(time * 0.8) * 0.02 + 0.02,
          rotY: Math.sin(time * 0.5) * 0.03,
          rotX: -0.05,
          rotZ: Math.sin(time * 0.6) * 0.02,
          scale: 1,
        };
      case 'thinking':
        return {
          posY: Math.sin(time * 0.3) * 0.02,
          rotY: Math.sin(time * 0.2) * 0.05 + 0.1,
          rotX: Math.sin(time * 0.4) * 0.02,
          rotZ: 0.05 + Math.sin(time * 0.3) * 0.02,
          scale: 1,
        };
      case 'talking':
        return {
          posY: Math.sin(time * 1.2) * 0.04 + Math.sin(time * 2.5) * 0.01,
          rotY: Math.sin(time * 0.8) * 0.08,
          rotX: Math.sin(time * 1.5) * 0.02,
          rotZ: Math.sin(time * 1.0) * 0.03,
          scale: 1 + Math.sin(time * 3) * 0.005,
        };
      default:
        return { posY: 0, rotY: 0, rotX: 0, rotZ: 0, scale: 1 };
    }
  };

  const currentParamsRef = useRef({ posY: 0, rotY: 0, rotX: 0, rotZ: 0, scale: 1 });
  const transitionSpeed = 0.08;

  useFrame((_, delta) => {
    if (mixerRef.current) {
      mixerRef.current.update(delta);
    }

    if (groupRef.current && modelLoaded) {
      const time = Date.now() * 0.001;
      const targetParams = getAnimationParams(animationState, time);
      const current = currentParamsRef.current;

      current.posY += (targetParams.posY - current.posY) * transitionSpeed;
      current.rotY += (targetParams.rotY - current.rotY) * transitionSpeed;
      current.rotX += (targetParams.rotX - current.rotX) * transitionSpeed;
      current.rotZ += (targetParams.rotZ - current.rotZ) * transitionSpeed;
      current.scale += (targetParams.scale - current.scale) * transitionSpeed;

      groupRef.current.position.y = config.model.position[1] + current.posY;
      groupRef.current.rotation.y = current.rotY;
      groupRef.current.rotation.x = current.rotX;
      groupRef.current.rotation.z = current.rotZ;
      groupRef.current.scale.setScalar(config.model.scale * current.scale);
    }
  });

  return <group ref={groupRef} />;
}
