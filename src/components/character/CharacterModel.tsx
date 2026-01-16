import { useEffect, useRef, useState, useMemo } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
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
    loader.register((parser) => new VRMLoaderPlugin(parser));
  });

  // Load VRMA idle animation
  const idleAnimationGltf = useLoader(GLTFLoader, '/animations/neutral_idle.vrma', (loader) => {
    loader.register((parser) => new VRMAnimationLoaderPlugin(parser));
  });

  // Store animation actions
  const actionsRef = useRef<{ [key: string]: THREE.AnimationAction }>({});
  const activeActionRef = useRef<THREE.AnimationAction | null>(null);

  useEffect(() => {
    if (!gltf || !groupRef.current || !idleAnimationGltf) return;

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

    // Load VRMA idle animation
    const vrmAnimation = idleAnimationGltf.userData.vrmAnimations?.[0];
    if (vrmAnimation) {
      const clip = createVRMAnimationClip(vrmAnimation, vrm);
      actionsRef.current['idle'] = mixerRef.current.clipAction(clip);
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
  }, [gltf, idleAnimationGltf, config, setCharacterLoaded]);

  // Handle animation state changes
  useEffect(() => {
    if (!modelLoaded || !mixerRef.current) return;

    let animName: string | undefined;
    switch (animationState) {
      case 'talking':
        animName = config.animations.talking?.[0];
        break;
      case 'idle':
      default:
        animName = config.animations.idle[0];
        break;
    }

    if (!animName || !actionsRef.current[animName]) {
      // Fallback to idle if specific animation not found
      animName = config.animations.idle[0];
      if (!animName || !actionsRef.current[animName]) return; // No idle animation found
    }

    const newAction = actionsRef.current[animName];
    const oldAction = activeActionRef.current;

    if (newAction !== oldAction) {
      if (oldAction) {
        oldAction.fadeOut(0.3);
      }
      newAction.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(0.3).play();
      activeActionRef.current = newAction;
    }
  }, [animationState, modelLoaded, config.animations]);

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

