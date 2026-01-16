import { useEffect, useRef, useState, useMemo } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { GLTFLoader, type GLTFParser } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, VRM } from '@pixiv/three-vrm';
import { VRMAnimationLoaderPlugin, createVRMAnimationClip } from '@pixiv/three-vrm-animation';
import * as THREE from 'three';
import type { CharacterConfig } from '../../types';
import { useAppStore } from '../../store';

type AnimationState = 'idle' | 'listening' | 'thinking' | 'talking';

interface CharacterModelProps {
  config: CharacterConfig;
}

export function CharacterModel({ config }: CharacterModelProps) {
  const groupRef = useRef<THREE.Group>(null);
  const vrmRef = useRef<VRM | null>(null);
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

  // Load VRM model
  const gltf = useLoader(GLTFLoader, config.model.path, (loader) => {
    loader.register((parser: GLTFParser) => new VRMLoaderPlugin(parser));
  });

  // Load all VRMA animations
  const idleAnimGltf = useLoader(GLTFLoader, '/animations/neutral_idle.vrma', (loader) => {
    loader.register((parser: GLTFParser) => new VRMAnimationLoaderPlugin(parser));
  });
  const thinkingAnimGltf = useLoader(GLTFLoader, '/animations/thinking.vrma', (loader) => {
    loader.register((parser: GLTFParser) => new VRMAnimationLoaderPlugin(parser));
  });
  const talkingAnimGltf = useLoader(GLTFLoader, '/animations/talking.vrma', (loader) => {
    loader.register((parser: GLTFParser) => new VRMAnimationLoaderPlugin(parser));
  });

  // Store animation actions
  const actionsRef = useRef<{ [key: string]: THREE.AnimationAction }>({});
  const activeActionRef = useRef<THREE.AnimationAction | null>(null);

  useEffect(() => {
    if (!gltf || !groupRef.current || !idleAnimGltf || !thinkingAnimGltf || !talkingAnimGltf) return;

    // --- VRM Setup ---
    VRMUtils.removeUnnecessaryJoints(gltf.scene); // Clean up bones
    const vrm = gltf.userData.vrm as VRM;
    vrmRef.current = vrm;

    // Set model position, scale, and rotation
    vrm.scene.position.set(...config.model.position);
    vrm.scene.scale.setScalar(config.model.scale);
    vrm.scene.rotation.y = Math.PI; // Rotate 180 degrees to face camera

    // Make the model cast and receive shadows
    vrm.scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    groupRef.current.clear();
    groupRef.current.add(vrm.scene);

    // --- Animation Setup ---
    mixerRef.current = new THREE.AnimationMixer(vrm.scene);
    actionsRef.current = {};

    // Load all VRMA animations
    const animationGltfs = {
      idle: idleAnimGltf,
      thinking: thinkingAnimGltf,
      talking: talkingAnimGltf,
    };

    for (const [name, animGltf] of Object.entries(animationGltfs)) {
      const vrmAnimation = animGltf.userData.vrmAnimations?.[0];
      if (vrmAnimation) {
        const clip = createVRMAnimationClip(vrmAnimation, vrm);
        actionsRef.current[name] = mixerRef.current.clipAction(clip);
      }
    }

    // Play idle animation
    if (actionsRef.current['idle']) {
      activeActionRef.current = actionsRef.current['idle'];
      activeActionRef.current.play();
    }

    setModelLoaded(true);
    setCharacterLoaded(true);

    return () => {
      mixerRef.current?.stopAllAction();
      VRMUtils.deepDispose(vrm.scene); // Dispose resources
    };
  }, [gltf, idleAnimGltf, thinkingAnimGltf, talkingAnimGltf, config, setCharacterLoaded]);

  // Handle animation state changes
  useEffect(() => {
    if (!modelLoaded || !mixerRef.current) return;

    // Map animation state to animation name
    const animName = animationState === 'listening' ? 'idle' : animationState;

    if (!actionsRef.current[animName]) {
      // Fallback to idle if specific animation not found
      if (!actionsRef.current['idle']) return;
    }

    const newAction = actionsRef.current[animName] || actionsRef.current['idle'];
    const oldAction = activeActionRef.current;

    if (newAction !== oldAction) {
      if (oldAction) {
        oldAction.fadeOut(0.3);
      }
      newAction.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(0.3).play();
      activeActionRef.current = newAction;
    }
  }, [animationState, modelLoaded]);

  useFrame((_, delta) => {
    if (mixerRef.current) {
      mixerRef.current.update(delta); // Update animation mixer
    }
    if (vrmRef.current) {
      vrmRef.current.update(delta); // Update VRM (expressions, look-at, etc.)
    }
  });

  return <group ref={groupRef} />;
}

