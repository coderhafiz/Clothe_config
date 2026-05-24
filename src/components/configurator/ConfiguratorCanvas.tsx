"use client";

import React, { Suspense, useEffect, useRef, useMemo, useState, 
  // useCallback
 } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import {
  Environment,
  ContactShadows,
  PerspectiveCamera,
  // PerformanceMonitor,
  Html,
  useGLTF,
} from "@react-three/drei";
import { EffectComposer, DepthOfField } from "@react-three/postprocessing";
import * as THREE_CORE from "three";
import { easing } from "maath";

import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";

// Initialize RectAreaLight uniforms once
if (typeof window !== "undefined") {
  RectAreaLightUniformsLib.init();

  // Silence library-level warnings
  const originalWarn = console.warn;
  console.warn = (...args) => {
    if (args[0] && typeof args[0] === "string") {
      if (args[0].includes("THREE.Clock")) return;
      if (args[0].includes("THREE.KTX2Loader")) return;
    }
    originalWarn(...args);
  };
}
import { Model, PreloadModels, PreloadTextures, MODELS, setupLoaders } from "./Model";
import { ConfigState } from "@/store/useConfigStore";
import { motion } from "framer-motion";

// Force a resize event after mount to fix initial dimension calculations in CSS-scaled mobile simulators
function ResizeFix() {
  useEffect(() => {
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event("resize"));
    }, 150);
    return () => clearTimeout(timer);
  }, []);
  return null;
}

interface ConfiguratorCanvasProps {
  onLoaded: () => void;
  config: ConfigState;
  isInitialLoading?: boolean;
}

function CanvasLoader({ hidden }: { hidden?: boolean }) {
  if (hidden) return null;
  return (
    <Html center style={{ zIndex: 0 }}>
      <div className="flex flex-col items-center justify-center min-w-[200px] pointer-events-none select-none">
        <div className="relative w-16 h-16">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            className="absolute inset-0 border-4 border-brand-primary/20 border-t-brand-primary rounded-full"
          />
          <motion.div
            animate={{ rotate: -360 }}
            transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
            className="absolute inset-2 border-4 border-brand-secondary/20 border-t-brand-secondary rounded-full"
          />
        </div>
        <p className="mt-4 text-[10px] font-bold text-text-muted uppercase tracking-[0.3em] whitespace-nowrap">
          Loading LUXI WEAR 3D Model
        </p>
      </div>
    </Html>
  );
}

// DOF quality tiers ΓÇö degraded progressively by PerformanceMonitor
type DofTier = "high" | "medium" | "off";

function SceneContent({
  config,
  rotationRef,
  onLoaded,
  isInitialLoading,
  dofTier,
}: {
  config: ConfigState;
  rotationRef: React.MutableRefObject<{ x: number; y: number }>;
  onLoaded: () => void;
  isInitialLoading: boolean;
  dofTier: DofTier;
}) {
  const { camera, gl } = useThree();
  const modelInfo = MODELS.find((m) => m.id === config.selectedModel) || MODELS[0];
  const gltf = useGLTF(modelInfo.url, undefined, undefined, (loader) =>
    setupLoaders(loader as any, gl)
  );

  // Compute the combined center of T-shirt and human model meshes in world space
  const combinedCenter = useMemo(() => {
    if (!gltf) {
      return new THREE_CORE.Vector3(0, 0, 0);
    }

    const box = new THREE_CORE.Box3();
    let hasObjects = false;

    gltf.scene.traverse((child) => {
      if (
        (child as any).isMesh &&
        (child.name === "T-shirt_mainbody" ||
          child.name === "T-shirt_sleeves" ||
          child.name === "Model")
      ) {
        child.updateMatrixWorld(true);
        const childBox = new THREE_CORE.Box3().setFromObject(child);
        box.union(childBox);
        hasObjects = true;
      }
    });

    const center = new THREE_CORE.Vector3();
    if (hasObjects) {
      box.getCenter(center);
    } else {
      const sceneBox = new THREE_CORE.Box3().setFromObject(gltf.scene);
      sceneBox.getCenter(center);
    }

    return center;
  }, [gltf]);

  const boundingBoxMaxY = useMemo(() => {
    if (!gltf) return 0;
    const box = new THREE_CORE.Box3();
    let hasObjects = false;
    gltf.scene.traverse((child) => {
      if (
        (child as any).isMesh &&
        (child.name === "T-shirt_mainbody" ||
          child.name === "T-shirt_sleeves" ||
          child.name === "Model")
      ) {
        child.updateMatrixWorld(true);
        box.union(new THREE_CORE.Box3().setFromObject(child));
        hasObjects = true;
      }
    });
    if (!hasObjects) {
      box.setFromObject(gltf.scene);
    }
    return box.max.y;
  }, [gltf]);

  const targetPos = useRef(new THREE_CORE.Vector3(0.2587, 0.0728, -0.2320));
  const targetFoc = useRef(new THREE_CORE.Vector3(-0.6187, -0.1667, -0.3149));
  const isAutoFraming = useRef(true);

  // Extract camera settings from the GLTF model once loaded
  useEffect(() => {
    if (!gltf) return;

    const gltfCameraNode = gltf.scene.getObjectByName("Camera") || gltf.scene.getObjectByName("Camera.001");
    const gltfCamera = gltf.cameras[0];

    if (gltfCameraNode && gltfCamera) {
      if ((gltfCamera as any).isPerspectiveCamera && (camera as any).isPerspectiveCamera) {
        const pCam = camera as THREE_CORE.PerspectiveCamera;
        const gCam = gltfCamera as THREE_CORE.PerspectiveCamera;
        pCam.fov = gCam.fov;
        pCam.near = gCam.near;
        pCam.far = gCam.far;
      }

      const worldPos = new THREE_CORE.Vector3();
      const worldQuat = new THREE_CORE.Quaternion();
      gltfCameraNode.getWorldPosition(worldPos);
      gltfCameraNode.getWorldQuaternion(worldQuat);

      camera.position.copy(worldPos);
      camera.quaternion.copy(worldQuat);
      camera.updateProjectionMatrix();

      targetPos.current.copy(worldPos);
      targetFoc.current.copy(combinedCenter);

      isAutoFraming.current = true;
    }
  }, [gltf, camera, combinedCenter]);

  // Extract Blender area lights dynamically
  const areaLights = useMemo(() => {
    if (!gltf) return [];
    const lights: {
      name: string;
      position: [number, number, number];
      quaternion: [number, number, number, number];
      width: number;
      height: number;
    }[] = [];

    gltf.scene.traverse((child) => {
      if (child.name === "Area" || child.name === "Area.001") {
        const pos = new THREE_CORE.Vector3();
        const quat = new THREE_CORE.Quaternion();
        const scale = new THREE_CORE.Vector3();

        child.updateMatrixWorld(true);
        child.matrixWorld.decompose(pos, quat, scale);

        // Correction for Blender area light direction (points down local negative Z)
        // Three.js RectAreaLight points down local positive Z.
        // We multiply the quaternion by a 180-degree rotation around local Y-axis.
        const correction = new THREE_CORE.Quaternion().setFromAxisAngle(
          new THREE_CORE.Vector3(0, 1, 0),
          Math.PI
        );
        quat.multiply(correction);

        // Hide node in gltf scene so it doesn't render inside the rotating model group
        child.visible = false;

        lights.push({
          name: child.name,
          position: [pos.x, pos.y, pos.z],
          quaternion: [quat.x, quat.y, quat.z, quat.w],
          width: scale.x,
          height: scale.y,
        });
      }
    });
    return lights;
  }, [gltf]);

  const dirLightRef = useRef<THREE_CORE.RectAreaLight>(null!);
  const ambientLightRef = useRef<THREE_CORE.AmbientLight>(null!);
  const areaLightRefs = useRef<Record<string, THREE_CORE.RectAreaLight>>({});

  useFrame((state, delta) => {
    // Smoothly damp overhead softbox intensity
    if (dirLightRef.current) {
      easing.damp(dirLightRef.current, "intensity", config.lightIntensity * 2.0, 0.2, delta);
    }

    // Smoothly damp ambient light intensity
    if (ambientLightRef.current) {
      easing.damp(
        ambientLightRef.current,
        "intensity",
        config.lightIntensity / 5,
        0.2,
        delta
      );
    }

    // Smoothly damp area lights' intensities
    Object.entries(areaLightRefs.current).forEach(([, light]) => {
      if (light) {
        easing.damp(light, "intensity", config.lightIntensity * 3.0, 0.2, delta);
      }
    });
  });

  // Compute focus distance from camera to subject center
  const focusDistance = useMemo(() => {
    const camPos = new THREE_CORE.Vector3(0.2587, 0.0728, -0.2320);
    return camPos.distanceTo(combinedCenter);
  }, [combinedCenter]);

  return (
    <>
      <ResizeFix />
      <Environment
        files="/hdri/brown_photostudio_01_1k.exr"
        blur={1}
        background={false}
        environmentIntensity={1 * (config.lightIntensity / 5)}
      />

      <ambientLight
        ref={ambientLightRef}
        intensity={1 * (config.lightIntensity / 5)}
      />

      {/* Render soft overhead studio light (RectAreaLight) directly over the model bounding box */}
      <rectAreaLight
        ref={dirLightRef}
        position={[combinedCenter.x, boundingBoxMaxY + 2.0, combinedCenter.z]}
        width={4}
        height={4}
        intensity={config.lightIntensity * 2.0}
        color="#ffebd6"
        onUpdate={(self) => {
          self.lookAt(combinedCenter);
        }}
      />

      {/* Render extracted Blender area lights static in world space */}
      {areaLights.map((light) => (
        <rectAreaLight
          key={light.name}
          ref={(el) => {
            if (el) areaLightRefs.current[light.name] = el;
          }}
          position={light.position}
          quaternion={light.quaternion}
          width={light.width}
          height={light.height}
          intensity={config.lightIntensity * 3.0}
          color="#ffffff"
        />
      ))}

      <Suspense fallback={<CanvasLoader hidden={isInitialLoading} />}>
        <Model
          config={config}
          rotationRef={rotationRef}
          onFirstPaint={onLoaded}
        />
      </Suspense>

      <ContactShadows
        position={[-0.612, -0.5694, -0.3159]}
        opacity={0.5}
        scale={10}
        blur={2.5}
        far={4}
        color="#000000"
      />

      {/* Depth of Field — adaptive quality based on device performance */}
      {dofTier !== "off" && (
        <EffectComposer multisampling={3}>
          <DepthOfField
            focusDistance={focusDistance}
            focalLength={0.4}
            bokehScale={2}
            height={500}
          />
        </EffectComposer>
      )}
    </>
  );
}

export default function ConfiguratorCanvas({
  onLoaded,
  config,
  isInitialLoading = false,
}: ConfiguratorCanvasProps) {
  const rotationRef = useRef({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const previousPointer = useRef({ x: 0, y: 0 });

  // Stable ref for isMobile ΓÇö set once on mount, used in callbacks without
  // causing re-renders or stale closure issues.
  const isMobileRef = useRef(false);

  // Start with "off" (safe SSR default). The useEffect below runs once on
  // client mount and upgrades to the correct tier based on real device signals.
  const [dofTier, setDofTier] = useState<DofTier>("off");

  // Canvas GL options derived from the detected tier stored in state so the
  // Canvas props are consistent after mount detection.
  const [canvasOpts, setCanvasOpts] = useState({
    antialias: true,
    powerPreference: "high-performance" as WebGLPowerPreference,
    dpr: [1, 2] as [number, number],
  });

  // ΓöÇΓöÇ Mount detection ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  // Runs exactly ONCE when the user lands on the page (client-side only).
  // All browser APIs (window, navigator) are safe to call here.
  useEffect(() => {
    const mobile =
      window.innerWidth < 768 || navigator.maxTouchPoints > 0;

    // const lowRAM =
    //   (navigator as any).deviceMemory !== undefined &&
    //   (navigator as any).deviceMemory < 4;

    isMobileRef.current = mobile;

    // Set canvas GL options that match the detected device class
    setCanvasOpts({
      antialias: !mobile,
      powerPreference: mobile ? "default" : "high-performance",
      dpr: mobile ? [1, 1.5] : [1, 2],
    });

    // Set the initial DOF tier based on device capabilities
    /*
    if (mobile || lowRAM) {
      setDofTier("off");   // never run post-processing on weak/mobile devices
    } else {
      setDofTier("high");  // full quality on capable desktop GPUs
    }
    */
    setDofTier("high");
  }, []); // [] ΓåÆ runs once, immediately after the component mounts

  // ΓöÇΓöÇ PerformanceMonitor callbacks ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  // Step quality down/up based on live FPS measurements during the session.
  // const handleDecline = useCallback(() => {
  //   setDofTier((prev) => {
  //     if (prev === "high") return "medium";
  //     if (prev === "medium") return "off";
  //     return "off";
  //   });
  // }, []);

  // const handleIncline = useCallback(() => {
  //   setDofTier((prev) => {
  //     // Recover one tier at a time; mobile devices are permanently capped at "off"
  //     if (prev === "off" && !isMobileRef.current) return "medium";
  //     if (prev === "medium" && !isMobileRef.current) return "high";
  //     return prev;
  //   });
  // }, []);

  // ΓöÇΓöÇ Pointer handlers ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  const handlePointerDown = (e: React.PointerEvent) => {
    isDragging.current = true;
    previousPointer.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    const deltaX = e.clientX - previousPointer.current.x;
    previousPointer.current = { x: e.clientX, y: e.clientY };
    rotationRef.current.y += deltaX * 0.007;
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    isDragging.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  return (
    <div
      className="absolute inset-0 select-none"
      style={{ touchAction: "none" }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <Canvas
        shadows={{ type: THREE_CORE.PCFShadowMap }}
        gl={{
          antialias: canvasOpts.antialias,
          alpha: true,
          powerPreference: canvasOpts.powerPreference,
          stencil: false,
          depth: true,
        }}
        dpr={canvasOpts.dpr}
        className="w-full h-full"
      >
        {!isInitialLoading && (
          <>
            <PreloadModels />
            <PreloadTextures />
          </>
        )}

        {/* Adaptive performance monitor — steps DOF quality up/down based on FPS */}
        {/*
        <PerformanceMonitor
          onDecline={handleDecline}
          onIncline={handleIncline}
          flipflops={3}
          threshold={0.9}
        />
        */}

        <Suspense fallback={null}>
          <PerspectiveCamera
            makeDefault
            position={[0.2587, 0.0728, -0.2320]}
            fov={45}
            far={100}
          />

          <SceneContent
            config={config}
            rotationRef={rotationRef}
            onLoaded={onLoaded}
            isInitialLoading={isInitialLoading}
            dofTier={dofTier}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}
