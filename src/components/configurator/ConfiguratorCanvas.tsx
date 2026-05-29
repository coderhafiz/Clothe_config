"use client";

import React, {
  Suspense,
  useEffect,
  useRef,
  useMemo,
  useState,
  useCallback
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
import { Pathtracer, usePathtracer, ShapedAreaLight } from "@react-three/gpu-pathtracer";
import { EffectComposer, DepthOfField } from "@react-three/postprocessing";
import * as THREE_CORE from "three";
import { easing } from "maath";

import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";

// Initialize RectAreaLight uniforms once
if (typeof window !== "undefined") {
  RectAreaLightUniformsLib.init();

  // Silence library-level informational warnings that are harmless
  const originalWarn = console.warn;
  console.warn = (...args) => {
    if (args[0] && typeof args[0] === "string") {
      if (args[0].includes("THREE.Clock")) return;
      if (args[0].includes("THREE.KTX2Loader")) return;
      // WEBGL_lose_context is an optional testing extension for simulating GPU loss.
      // Its absence has no effect on rendering or stability.
      if (args[0].includes("WEBGL_lose_context")) return;
    }
    originalWarn(...args);
  };
}
import {
  Model,
  PreloadModels,
  PreloadTextures,
  MODELS,
  setupLoaders,
} from "./Model";
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

function SafeEffectComposer({ children, ...props }: any) {
  const { gl } = useThree();
  const [hasContext, setHasContext] = useState(() => {
    if (!gl) return false;
    const ctx = gl.getContext();
    if (!ctx) return false;
    try {
      return ctx.getContextAttributes() !== null && !ctx.isContextLost();
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (!gl || !gl.domElement) return;

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      console.warn("SafeEffectComposer: WebGL context lost.");
      setHasContext(false);
    };

    const handleContextRestored = () => {
      console.log("SafeEffectComposer: WebGL context restored.");
      setHasContext(true);
    };

    const canvas = gl.domElement;
    canvas.addEventListener("webglcontextlost", handleContextLost);
    canvas.addEventListener("webglcontextrestored", handleContextRestored);

    const ctx = gl.getContext();
    if (ctx) {
      try {
        const isLost = ctx.isContextLost();
        const attrs = ctx.getContextAttributes();
        setHasContext(!isLost && attrs !== null);
      } catch {
        setHasContext(false);
      }
    } else {
      setHasContext(false);
    }

    return () => {
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      canvas.removeEventListener("webglcontextrestored", handleContextRestored);
    };
  }, [gl]);

  if (!hasContext) {
    return null;
  }

  return <EffectComposer {...props}>{children}</EffectComposer>;
}

function SceneContent({
  config,
  rotationRef,
  onLoaded,
  dofTier,
  isInitialLoading,
  setIsPathTracerLoading,
}: {
  config: ConfigState;
  rotationRef: React.MutableRefObject<{ x: number; y: number }>;
  onLoaded: () => void;
  dofTier: DofTier;
  isInitialLoading?: boolean;
  setIsPathTracerLoading: (loading: boolean) => void;
}) {
  const { camera, gl } = useThree();
  const [focusDistance, setFocusDistance] = useState(1.5);
  const { update, reset, pathtracer } = usePathtracer();

  const lastCameraMatrix = useRef(new THREE_CORE.Matrix4());
  const lastModelRotationY = useRef(0);
  const lastLoadingRef = useRef(false);
  const hasCompiled = useRef(false);
  
  // Reset compilation flag when path tracer toggles or model changes,
  // and sync lastLoadingRef so the loading overlay state is consistent.
  useEffect(() => {
    hasCompiled.current = false;
    lastLoadingRef.current = false; // Also reset so the isLoading setter fires correctly
  }, [config.pathTracer, config.selectedModel]);

  const modelInfo =
    MODELS.find((m) => m.id === config.selectedModel) || MODELS[0];

  const roomGltf = useGLTF(
    "/Cloth_models/clothe_mockup_3.glb",
    undefined,
    undefined,
    (loader) => setupLoaders(loader as any, gl),
  );

  const gltf = useGLTF(modelInfo.url, undefined, undefined, (loader) =>
    setupLoaders(loader as any, gl),
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
          child.name === "Model" ||
          child.name === "BAJU_BAJU_TEX_0" ||
          child.name === "polySurface20_STAND_0" ||
          child.name === "polySurface21_DUMMY_0")
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
          child.name === "Model" ||
          child.name === "BAJU_BAJU_TEX_0" ||
          child.name === "polySurface20_STAND_0" ||
          child.name === "polySurface21_DUMMY_0")
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

  // Target position, rotation, and FOV for Room Camera (T-Shirt)
  const roomCamPos = useRef(new THREE_CORE.Vector3(0.2587, 0.0728, -0.232));
  const roomCamQuat = useRef(new THREE_CORE.Quaternion(0, 0, 0, 1));
  const roomCamFov = useRef(45);

  // Target position, rotation, and FOV for Kaftan Camera
  const kaftanCamPos = useRef(
    new THREE_CORE.Vector3(0.325, -0.2072 + 0.12, -0.1792),
  );
  const kaftanCamQuat = useRef(
    new THREE_CORE.Quaternion(-0.0593, 0.6393, 0.0496, 0.765).normalize(),
  );
  const kaftanCamFov = useRef(45);

  // Extract camera settings from the GLTF model once loaded
  useEffect(() => {
    if (!roomGltf) return;

    const gltfCameraNode =
      roomGltf.scene.getObjectByName("Camera") ||
      roomGltf.scene.getObjectByName("Camera.001");
    const gltfCamera = roomGltf.cameras[0];

    if (gltfCameraNode) {
      gltfCameraNode.updateMatrixWorld(true);
      gltfCameraNode.getWorldPosition(roomCamPos.current);
      gltfCameraNode.getWorldQuaternion(roomCamQuat.current);
    }
    if (gltfCamera && (gltfCamera as any).isPerspectiveCamera) {
      roomCamFov.current = (gltfCamera as THREE_CORE.PerspectiveCamera).fov;
      const pCam = camera as THREE_CORE.PerspectiveCamera;
      pCam.near = (gltfCamera as THREE_CORE.PerspectiveCamera).near;
      pCam.far = (gltfCamera as THREE_CORE.PerspectiveCamera).far;
      pCam.updateProjectionMatrix();
    }
  }, [roomGltf, camera]);

  // Extract Kaftan camera settings from the Kaftan GLTF model once loaded
  useEffect(() => {
    if (config.selectedModel === "kaftan" && gltf) {
      const gltfCameraNode =
        gltf.scene.getObjectByName("Camera") ||
        gltf.scene.getObjectByName("Camera.001");
      const gltfCamera = gltf.cameras[0];

      if (gltfCameraNode) {
        gltfCameraNode.updateMatrixWorld(true);
        gltfCameraNode.getWorldPosition(kaftanCamPos.current);
        kaftanCamPos.current.y += 0.05; // Shift up to fit model + mannequin in view
        gltfCameraNode.getWorldQuaternion(kaftanCamQuat.current);
      }
      if (gltfCamera && (gltfCamera as any).isPerspectiveCamera) {
        kaftanCamFov.current = (gltfCamera as THREE_CORE.PerspectiveCamera).fov;
        const pCam = camera as THREE_CORE.PerspectiveCamera;
        pCam.near = (gltfCamera as THREE_CORE.PerspectiveCamera).near;
        pCam.far = (gltfCamera as THREE_CORE.PerspectiveCamera).far;
        pCam.updateProjectionMatrix();
      }
    }
  }, [gltf, config.selectedModel, camera]);

  // Extract Blender area lights dynamically
  const areaLights = useMemo(() => {
    if (!roomGltf) return [];
    const lights: {
      name: string;
      position: [number, number, number];
      quaternion: [number, number, number, number];
      width: number;
      height: number;
    }[] = [];

    roomGltf.scene.traverse((child) => {
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
          Math.PI,
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
  }, [roomGltf]);

  const dirLightRef = useRef<THREE_CORE.RectAreaLight>(null!);
  // const frontLightRef = useRef<THREE_CORE.RectAreaLight>(null!);
  const ambientLightRef = useRef<THREE_CORE.AmbientLight>(null!);
  const areaLightRefs = useRef<Record<string, THREE_CORE.RectAreaLight>>({});

  const isFirstFrame = useRef(true);
  const lastEnvironment = useRef<THREE_CORE.Texture | null>(null);
  const lastLightIntensity = useRef(config.lightIntensity);
  // Always initialise to false so that if the component mounts while path tracer is already
  // active, justEnteredPathTracer correctly fires on the first frame (triggering update() + camera snap).
  const lastPathTracerMode = useRef(false);

  useFrame((state, delta) => {
    // Determine active target position, quaternion, and FOV
    const isShirt = config.selectedModel === "shirt";
    const targetPosVec = isShirt ? roomCamPos.current : kaftanCamPos.current;
    const targetQuatVal = isShirt ? roomCamQuat.current : kaftanCamQuat.current;
    const targetFovVal = isShirt ? roomCamFov.current : kaftanCamFov.current;

    const pCam = state.camera as THREE_CORE.PerspectiveCamera;

    // Determine if we just switched INTO path tracer mode this frame
    const justEnteredPathTracer = config.pathTracer && lastPathTracerMode.current !== config.pathTracer;

    if (isFirstFrame.current || justEnteredPathTracer) {
      pCam.position.copy(targetPosVec);
      pCam.quaternion.copy(targetQuatVal);
      pCam.fov = targetFovVal;
      pCam.updateProjectionMatrix();
      isFirstFrame.current = false;
      // Force matrixWorld update and sync immediately so the change isn't flagged on the next frame
      pCam.updateMatrixWorld(true);
      lastCameraMatrix.current.copy(pCam.matrixWorld);
      // Pre-sync BVH on the very first frame of path tracer mode, BEFORE any samples are rendered.
      update();
    } else if (!config.pathTracer) {
      // Smoothly transition between the cameras using maath easing
      easing.damp3(pCam.position, targetPosVec, 0.8, delta);
      easing.dampQ(pCam.quaternion, targetQuatVal, 0.8, delta);

      const prevFov = pCam.fov;
      easing.damp(pCam, "fov", targetFovVal, 0.8, delta);
      if (Math.abs(pCam.fov - prevFov) > 0.001) {
        pCam.updateProjectionMatrix();
      }
    }

    /*
    // Sync front light position to camera position
    if (frontLightRef.current) {
      frontLightRef.current.position.copy(pCam.position);
      // Elevate slightly and shift slightly to the side to create beautiful key-light angles
      frontLightRef.current.position.y += 0.15;
      frontLightRef.current.position.x += 0.1;
      frontLightRef.current.lookAt(combinedCenter);
      frontLightRef.current.updateMatrixWorld(true);
    }
    */

    // Smoothly damp overhead softbox intensity in WebGL mode
    if (dirLightRef.current && !config.pathTracer) {
      easing.damp(
        dirLightRef.current,
        "intensity",
        config.lightIntensity * 2.0,
        0.2,
        delta,
      );
    }

    /*
    // Smoothly damp front key light intensity in WebGL mode
    if (frontLightRef.current && !config.pathTracer) {
      easing.damp(
        frontLightRef.current,
        "intensity",
        config.lightIntensity * 0.4,
        0.2,
        delta,
      );
    }
    */

    // Smoothly damp ambient light intensity in WebGL mode
    if (ambientLightRef.current && !config.pathTracer) {
      easing.damp(
        ambientLightRef.current,
        "intensity",
        config.lightIntensity / 5,
        0.2,
        delta,
      );
    }

    // Smoothly damp area lights' intensities in WebGL mode
    if (!config.pathTracer) {
      Object.entries(areaLightRefs.current).forEach(([, light]) => {
        if (light) {
          easing.damp(
            light,
            "intensity",
            config.lightIntensity * 3.0,
            0.2,
            delta,
          );
        }
      });
    }

    if (config.pathTracer) {
      // 1. Sync camera matrices to pathtracer
      const cameraMatrix = pCam.matrixWorld;
      let cameraChanged = false;
      for (let i = 0; i < 16; i++) {
        if (Math.abs(cameraMatrix.elements[i] - lastCameraMatrix.current.elements[i]) > 0.00001) {
          cameraChanged = true;
          break;
        }
      }
      if (cameraChanged) {
        pathtracer.updateCamera();
        reset();
        lastCameraMatrix.current.copy(cameraMatrix);
      }

      // 2. Check if model has rotated
      const diff = Math.abs(rotationRef.current.y - lastModelRotationY.current);
      if (diff > 0.0001) {
        update();
        reset();
        lastModelRotationY.current = rotationRef.current.y;
      }

      // 3. Sync environment map when it loads or changes
      if (state.scene.environment !== lastEnvironment.current) {
        pathtracer.updateEnvironment();
        reset();
        lastEnvironment.current = state.scene.environment;
      }

      // 4. Sync lights when intensity or mode changes
      if (
        config.lightIntensity !== lastLightIntensity.current ||
        config.pathTracer !== lastPathTracerMode.current
      ) {
        // Adjust toneMappingExposure to make the path tracer brighter
        gl.toneMappingExposure = 1.6;

        // Snap intensities immediately for path tracing
        if (dirLightRef.current) {
          dirLightRef.current.intensity = config.lightIntensity * 45.0;
        }
        /*
        if (frontLightRef.current) {
          frontLightRef.current.intensity = config.lightIntensity * 25.0;
        }
        */
        if (ambientLightRef.current) {
          ambientLightRef.current.intensity = config.lightIntensity * 1.0;
        }
        Object.values(areaLightRefs.current).forEach((light) => {
          if (light) light.intensity = config.lightIntensity * 75.0;
        });

        pathtracer.updateLights();
        reset();
        lastLightIntensity.current = config.lightIntensity;
        lastPathTracerMode.current = config.pathTracer;
      }

      // 5. Track path tracer loading state
      if (pathtracer.samples > 0) {
        hasCompiled.current = true;
      }
      const isLoading = pathtracer.samples === 0 && !hasCompiled.current;
      if (lastLoadingRef.current !== isLoading) {
        lastLoadingRef.current = isLoading;
        setIsPathTracerLoading(isLoading);
      }
    } else {
      if (lastLoadingRef.current !== false) {
        lastLoadingRef.current = false;
        setIsPathTracerLoading(false);
      }
      if (lastPathTracerMode.current !== false) {
        gl.toneMappingExposure = 1.0; // Reset tone mapping exposure for WebGL
        lastPathTracerMode.current = false;
      }
    }
  });

  // Compute focus distance from target camera to subject center
  useEffect(() => {
    const camPos =
      config.selectedModel === "shirt"
        ? roomCamPos.current
        : kaftanCamPos.current;
    setFocusDistance(camPos.distanceTo(combinedCenter));
  }, [config.selectedModel, combinedCenter, roomGltf, gltf]);

  return (
    <>
      <ResizeFix />
      <Environment
        files="/hdri/brown_photostudio_01_1k.exr"
        blur={1}
        background={false}
        environmentIntensity={config.pathTracer ? config.lightIntensity * 1.5 : config.lightIntensity / 5}
      />

      <ambientLight
        ref={ambientLightRef}
        intensity={config.pathTracer ? config.lightIntensity * 1.0 : config.lightIntensity / 5}
      />

      {/* Render soft overhead studio light (RectAreaLight) directly over the model bounding box */}
      <ShapedAreaLight
        ref={dirLightRef}
        position={[combinedCenter.x, boundingBoxMaxY + 2.0, combinedCenter.z]}
        width={4}
        height={4}
        intensity={config.pathTracer ? config.lightIntensity * 45.0 : config.lightIntensity * 0.5}
        color="white"
        onUpdate={(self) => {
          self.lookAt(combinedCenter);
        }}
      />

      {/* Front key studio light following the camera to illuminate the model from the front
      <ShapedAreaLight
        ref={frontLightRef}
        position={[0.2587, 0.0728, -0.232]}
        width={3}
        height={3}
        intensity={config.pathTracer ? config.lightIntensity * 25.0 : config.lightIntensity * 0.4}
        color="white"
        onUpdate={(self) => {
          self.lookAt(combinedCenter);
        }}
      />
      */}

      {/* Render extracted Blender area lights static in world space */}
      {areaLights.map((light) => (
        <ShapedAreaLight
          key={light.name}
          ref={(el) => {
            if (el) areaLightRefs.current[light.name] = el;
          }}
          position={light.position}
          quaternion={light.quaternion}
          width={light.width}
          height={light.height}
          intensity={config.pathTracer ? config.lightIntensity * 75.0 : config.lightIntensity * 0.5}
          color="white"
        />
      ))}

      <Suspense fallback={<CanvasLoader hidden={isInitialLoading} />}>
        <Model
          config={config}
          rotationRef={rotationRef}
          onFirstPaint={onLoaded}
        />
      </Suspense>

      {!config.pathTracer && (
        <ContactShadows
          position={[-0.612, -0.5694, -0.3159]}
          opacity={0.5}
          scale={10}
          blur={2.5}
          far={4}
          color="#000000"
        />
      )}

      {/* Depth of Field — adaptive quality based on device performance */}
      {dofTier !== "off" && !config.pathTracer && (
        <SafeEffectComposer multisampling={8}>
          <DepthOfField
            focusDistance={focusDistance}
            focalLength={0.4}
            bokehScale={1.5}
            height={1000}
          />
        </SafeEffectComposer>
      )}
    </>
  );
}

export default function ConfiguratorCanvas({
  onLoaded,
  config,
  isInitialLoading = false,
}: ConfiguratorCanvasProps) {
  const [webGlSupported, setWebGlSupported] = useState(true);
  const activePathtracerRef = useRef<any>(null);

  const pathtracerRef = useCallback((node: any) => {
    if (node) {
      activePathtracerRef.current = node;
    } else {
      if (activePathtracerRef.current) {
        console.log("Safe disposing of WebGLPathTracer...");
        const pt = activePathtracerRef.current;
        try {
          if (pt._quad) {
            pt._quad.dispose();
            if (pt._quad.material) pt._quad.material.dispose();
          }
          if (pt._pathTracer) pt._pathTracer.dispose();
          if (pt._lowResPathTracer) pt._lowResPathTracer.dispose();
          console.log("WebGLPathTracer safely disposed.");
        } catch (e) {
          console.warn("Failed to dispose WebGLPathTracer:", e);
        }
        activePathtracerRef.current = null;
      }
    }
  }, []);

  const rotationRef = useRef({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const previousPointer = useRef({ x: 0, y: 0 });

  const [isPathTracerLoading, setIsPathTracerLoading] = useState(false);
  const [showPathTracerLoader, setShowPathTracerLoader] = useState(false);

  useEffect(() => {
    if (isPathTracerLoading) {
      const timer = setTimeout(() => {
        setShowPathTracerLoader(true);
      }, 400);
      return () => clearTimeout(timer);
    } else {
      setShowPathTracerLoader(false);
    }
  }, [isPathTracerLoading]);

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
    // Check if WebGL context is blocked or unavailable
    let supported = true;
    try {
      const canvas = document.createElement("canvas");
      const glContext = (canvas.getContext("webgl2") || canvas.getContext("webgl") || canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
      if (!glContext || glContext.isContextLost()) {
        supported = false;
        setWebGlSupported(false);
      }
    } catch {
      supported = false;
      setWebGlSupported(false);
    }

    if (!supported) {
      onLoaded();
    }

    const mobile = window.innerWidth < 768 || navigator.maxTouchPoints > 0;

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
  }, [onLoaded]); // onLoaded is stable (wrapped in useCallback by parent)

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

  // —————————————————————————————————————————————————————————————————————————————
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

  if (!webGlSupported) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0a0a0c] text-white p-6 text-center select-none">
        <div className="w-12 h-12 mb-5 rounded-full border border-red-500/30 bg-red-500/10 flex items-center justify-center">
          <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-red-500">WebGL Context Blocked</h3>
        <p className="mt-3 text-[11px] text-[#8a8a93] max-w-sm leading-relaxed uppercase tracking-[0.05em]">
          The browser has blocked WebGL rendering due to a prior GPU timeout. 
          Please restart your browser tab to unblock the GPU.
        </p>
        <button 
          onClick={() => window.location.reload()} 
          className="mt-6 px-4 py-2 rounded border border-white/10 bg-white/5 hover:bg-white/10 text-[9px] font-bold text-white uppercase tracking-[0.2em] transition-all"
        >
          Reload Page
        </button>
      </div>
    );
  }

  return (
    <div
      className="absolute inset-0 select-none bg-[#0a0a0c]"
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
            position={[0.2587, 0.0728, -0.232]}
            fov={45}
            far={100}
          />

          <Pathtracer
            ref={pathtracerRef}
            enabled={config.pathTracer}
            samples={512}
            bounces={2}
            tiles={[2, 2]}
            filteredGlossyFactor={0.5}
            resolutionFactor={0.85}
            dynamicLowRes={true}
            lowResScale={0.5}
          >
            <SceneContent
              config={config}
              rotationRef={rotationRef}
              onLoaded={onLoaded}
              dofTier={dofTier}
              isInitialLoading={isInitialLoading}
              setIsPathTracerLoading={setIsPathTracerLoading}
            />
          </Pathtracer>
        </Suspense>
      </Canvas>

      {showPathTracerLoader && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-md z-30 pointer-events-none select-none">
          <div className="relative w-12 h-12">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
              className="absolute inset-0 border-3 border-white/10 border-t-white rounded-full"
            />
            <motion.div
              animate={{ rotate: -360 }}
              transition={{ duration: 2.2, repeat: Infinity, ease: "linear" }}
              className="absolute inset-1.5 border-3 border-white/5 border-t-white/60 rounded-full"
            />
          </div>
          <p className="mt-4 text-[10px] font-bold text-white uppercase tracking-[0.3em] whitespace-nowrap">
            Compiling Path Tracer Shaders
          </p>
          <p className="mt-1.5 text-[9px] text-white/50 uppercase tracking-[0.2em] whitespace-nowrap">
            This may take a few seconds...
          </p>
        </div>
      )}
    </div>
  );
}
