import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { GLTFLoader, type GLTFParser } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, VRM } from '@pixiv/three-vrm';
import { VRMAnimationLoaderPlugin, createVRMAnimationClip } from '@pixiv/three-vrm-animation';
import * as THREE from 'three';
import type { CharacterConfig } from '../../types';
import { useAppStore } from '../../store';

type AnimationState = 'idle' | 'listening' | 'thinking' | 'running';

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
  const isHiding = useAppStore((state) => state.character.isHiding);
  const isRightHalf = useAppStore((state) => state.ui.quadrant.isRightHalf);

  const animationState: AnimationState = useMemo(() => {
    if (isHiding) return 'running';
    if (isThinking) return 'thinking';
    if (isUserTyping) return 'listening';
    return 'idle';
  }, [isHiding, isThinking, isUserTyping]);

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
  const runningAnimGltf = useLoader(GLTFLoader, '/animations/Running.vrma', (loader) => {
    loader.register((parser: GLTFParser) => new VRMAnimationLoaderPlugin(parser));
  });
  const armStretchAnimGltf = useLoader(GLTFLoader, '/animations/Arm Stretching.vrma', (loader) => {
    loader.register((parser: GLTFParser) => new VRMAnimationLoaderPlugin(parser));
  });
  const standingPoseAnimGltf = useLoader(GLTFLoader, '/animations/Female Standing Pose.vrma', (loader) => {
    loader.register((parser: GLTFParser) => new VRMAnimationLoaderPlugin(parser));
  });

  // Store animation actions
  const actionsRef = useRef<{ [key: string]: THREE.AnimationAction }>({});
  const activeActionRef = useRef<THREE.AnimationAction | null>(null);

  // Idle cycling
  const idleVariants = useMemo(() => ['idle'], []);
  const currentIdleRef = useRef('idle');
  const [idleTrigger, setIdleTrigger] = useState(0);

  // Store original rotation for restoring after running animation
  const originalRotationYRef = useRef<number>(Math.PI);
  // Target rotation for smooth turning
  const targetRotationYRef = useRef<number>(Math.PI);

  // Helper function to transition to a new animation
  const transitionToAnimation = useCallback((animName: string) => {
    if (!mixerRef.current || !actionsRef.current[animName]) return;

    const newAction = actionsRef.current[animName];
    const oldAction = activeActionRef.current;

    if (newAction !== oldAction) {
      if (oldAction) {
        oldAction.fadeOut(0.3);
      }
      newAction.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(0.3).play();
      activeActionRef.current = newAction;
    }
  }, []);

  // Idle cycling timer
  useEffect(() => {
    if (!modelLoaded || animationState !== 'idle') return;

    const scheduleNextIdleChange = () => {
      // Random interval between 10-20 seconds
      const interval = 10000 + Math.random() * 10000;
      return setTimeout(() => {
        // Pick a random idle variant different from the current one
        const availableVariants = idleVariants.filter(v => v !== currentIdleRef.current);
        const newVariant = availableVariants[Math.floor(Math.random() * availableVariants.length)];
        currentIdleRef.current = newVariant;
        setIdleTrigger(t => t + 1);
      }, interval);
    };

    const timeoutId = scheduleNextIdleChange();
    return () => clearTimeout(timeoutId);
  }, [modelLoaded, animationState, idleVariants, idleTrigger]);

  useEffect(() => {
    if (!gltf || !groupRef.current || !idleAnimGltf || !thinkingAnimGltf || !runningAnimGltf || !armStretchAnimGltf || !standingPoseAnimGltf) return;

    // --- VRM Setup ---
    VRMUtils.removeUnnecessaryJoints(gltf.scene); // Clean up bones
    const vrm = gltf.userData.vrm as VRM;
    vrmRef.current = vrm;

    // Set model position, scale, and rotation
    vrm.scene.position.set(...config.model.position);
    vrm.scene.scale.setScalar(config.model.scale);
    const rotationY = config.model.rotation ? config.model.rotation[1] : Math.PI;
    if (config.model.rotation) {
      vrm.scene.rotation.set(...config.model.rotation);
    } else {
      vrm.scene.rotation.set(0, Math.PI, 0); // Reset all axes and rotate 180 degrees to face camera
    }
    originalRotationYRef.current = rotationY;
    targetRotationYRef.current = rotationY; // Also update target immediately

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
      idle_stretch: armStretchAnimGltf,
      idle_pose: standingPoseAnimGltf,
      thinking: thinkingAnimGltf,
      running: runningAnimGltf,
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

    const modelPath = config.model.path;
    return () => {
      mixerRef.current?.stopAllAction();
      VRMUtils.deepDispose(vrm.scene); // Dispose resources
      // Clear the useLoader cache to prevent stale rotation/state on next load
      useLoader.clear(GLTFLoader, modelPath);
    };
  }, [gltf, idleAnimGltf, thinkingAnimGltf, runningAnimGltf, armStretchAnimGltf, standingPoseAnimGltf, config, setCharacterLoaded]);

  // Handle animation state changes
  useEffect(() => {
    if (!modelLoaded || !mixerRef.current) return;

    // Map animation state to animation name
    let animName: string;
    if (animationState === 'idle') {
      // Use the current idle variant for cycling
      animName = currentIdleRef.current;
    } else if (animationState === 'listening') {
      // Listening uses the current idle animation
      animName = currentIdleRef.current;
    } else {
      // 'thinking' or 'running' use their specific animations
      animName = animationState;
    }

    // Fallback to 'idle' if animation not found
    if (!actionsRef.current[animName]) {
      animName = 'idle';
      if (!actionsRef.current[animName]) return;
    }

    transitionToAnimation(animName);
  }, [animationState, modelLoaded, idleTrigger, transitionToAnimation]);

  // Handle model rotation target when running
  useEffect(() => {
    if (animationState === 'running') {
      // Rotate to face the edge of the screen the character is running towards
      // Direction depends on the character's base rotation
      const baseRotation = originalRotationYRef.current;
      if (baseRotation === 0) {
        // jessica, sam, victoria - base rotation 0 (facing camera from opposite direction)
        // right half → run right → face right: +90° from 0
        // left half → run left → face left: -90° from 0
        targetRotationYRef.current = isRightHalf ? Math.PI / 2 : -Math.PI / 2;
      } else {
        // emily, grace, rose - base rotation Math.PI
        // right half → run right → face right: +90° from Math.PI = 270°
        // left half → run left → face left: -90° from Math.PI = 90°
        targetRotationYRef.current = isRightHalf ? Math.PI * 1.5 : Math.PI / 2;
      }
    } else {
      // Restore original rotation (facing camera)
      targetRotationYRef.current = originalRotationYRef.current;
    }
  }, [animationState, isRightHalf]);

  useFrame((_, delta) => {
    if (mixerRef.current) {
      mixerRef.current.update(delta); // Update animation mixer
    }
    if (vrmRef.current) {
      vrmRef.current.update(delta); // Update VRM (expressions, look-at, etc.)

      // Smoothly interpolate rotation towards target
      const currentRotation = vrmRef.current.scene.rotation.y;
      const targetRotation = targetRotationYRef.current;
      if (Math.abs(currentRotation - targetRotation) > 0.01) {
        // Lerp speed: ~5 radians per second for smooth turning
        const lerpFactor = Math.min(1, delta * 5);
        vrmRef.current.scene.rotation.y = THREE.MathUtils.lerp(
          currentRotation,
          targetRotation,
          lerpFactor
        );
      }
    }
  });

  return <group ref={groupRef} />;
}
