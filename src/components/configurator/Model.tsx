"use client";

import { useRef, useEffect, useMemo } from "react";

import {
  useFrame,
  useThree,
  useLoader,
  createPortal,
} from "@react-three/fiber";

import { useGLTF, useTexture, Decal } from "@react-three/drei";
import { usePathtracer } from "@react-three/gpu-pathtracer";

import { easing } from "maath";

import * as THREE from "three";
import { RoundedBoxGeometry } from "three-stdlib";
import { VerletClothSimulator } from "./VerletCloth";

import {
  Mesh,
  Box3,
  Vector3,
  Group,
  WebGLRenderer,
  RepeatWrapping,
} from "three";

import { DRACOLoader, KTX2Loader, GLTFLoader } from "three-stdlib";

// Pre-allocated helpers for per-frame quaternion rotation (avoids GC pressure)
const _rotQY = new THREE.Quaternion();
const _worldYAxis = new THREE.Vector3(0, 1, 0);

// =======================
// Types
// =======================

import { ConfigState } from "@/store/useConfigStore";

export const TEXTURES = [
  {
    id: "none",
    name: "Solid Fabric",
  },

  {
    id: "linen",
    name: "Rough Linen",
  },

  {
    id: "velvet",
    name: "Luxe Velvet",
  },

  {
    id: "leather",
    name: "Street Leather",
  },
];

export const DECALS = [
  {
    id: "none",
    name: "Clean Solid",
  },

  {
    id: "luxi",
    name: "LUXI Studio Logo",
  },

  {
    id: "graphic",
    name: "Streetwear Print",
  },
];

// =======================
// Models
// =======================

export interface ModelInfo {
  id: string;

  name: string;

  description: string;

  price: number;

  url: string;

  type: string;

  scale: number;

  rotationX?: number;

  rotationY?: number;

  rotationZ?: number;

  parts: {
    id: string;
    name: string;
  }[];

  materialType: string;
}

export const MODELS: ModelInfo[] = [
  {
    id: "shirt",

    name: "LUXI Signature Tee",

    description: "Premium heavy-weight organic cotton tee",

    price: 85,

    url: "/Cloth_models/clothe_mockup_3.glb",

    type: "glb",

    scale: 1,

    rotationX: 0,

    rotationY: 0,

    parts: [
      {
        id: "T-shirt_mainbody",

        name: "Fabric Body",
      },

      {
        id: "T-shirt_sleeves",

        name: "Fabric Sleeves",
      },
    ],

    materialType: "Heavy Cotton",
  },
  {
    id: "kaftan",
    name: "LUXI Modern Kaftan",
    description: "Elegant modern drape kaftan silhouette",
    price: 145,
    url: "/Cloth_models/Kaftan_mockup_4.glb",
    type: "glb",
    scale: 1,
    rotationX: 0,
    rotationY: 0,
    parts: [
      {
        id: "BAJU_BAJU_TEX_0",
        name: "Fabric Dress",
      },
    ],
    materialType: "Luxe Satin",
  },
];

// Triplanar shader scale constants
const WALL_TRI_SCALE = 2.5;
const LEFT_PLATFORM_TRI_SCALE = 2.0; // Scale for left platform (mesh_id42)
const CENTER_PLATFORM_TRI_SCALE = 2.5; // Scale for center platform (mesh_id78)

const TEXTURE_PATHS: Record<string, Record<string, string>> = {
  leather: {
    map: "/textures/leather/diffuse.ktx2",

    normalMap: "/textures/leather/normal.ktx2",

    roughnessMap: "/textures/leather/roughness.ktx2",
  },

  linen: {
    map: "/textures/linen/diffuse.ktx2",

    normalMap: "/textures/linen/normal.ktx2",

    aoMap: "/textures/linen/arm.ktx2",

    specMap: "/textures/linen/spec_ior.ktx2",
  },

  wooden_wall: {
    map: "/textures/wooden_wall/diffuse.ktx2",

    normalMap: "/textures/wooden_wall/normal.ktx2",

    roughnessMap: "/textures/wooden_wall/roughness.ktx2",
  },

  jeans: {
    map: "/textures/Jeans/diffuse.ktx2",
    normalMap: "/textures/Jeans/normal.ktx2",
    roughnessMap: "/textures/Jeans/roughness.ktx2",
  },

  fabric: {
    map: "/textures/Fabric/diffuse.ktx2",
    normalMap: "/textures/Fabric/normal.ktx2",
    roughnessMap: "/textures/Fabric/roughness.ktx2",
  },

  plastic: {
    map: "/textures/Plastic/diffuse.ktx2",
    normalMap: "/textures/Plastic/normal.ktx2",
    roughnessMap: "/textures/Plastic/roughness.ktx2",
  },

  velvet: {
    map: "/textures/velvet/diffuse.ktx2",

    normalMap: "/textures/velvet/normal.ktx2",

    aoMap: "/textures/velvet/arm.ktx2",

    specMap: "/textures/velvet/spec_ior.ktx2",
  },

  curtain: {
    map: "/textures/textures/curtain_2-2K/2K-curtain_2_basecolor.ktx2",
    normalMap: "/textures/textures/curtain_2-2K/2K-curtain_2_normal.ktx2",
    roughnessMap: "/textures/textures/curtain_2-2K/2K-curtain_2_roughness.ktx2",
  },

  fabric145: {
    map: "/textures/textures/fabric_145-2K/fabric_145_basecolor-2K.ktx2",
    normalMap: "/textures/textures/fabric_145-2K/fabric_145_normal-2K.ktx2",
    roughnessMap:
      "/textures/textures/fabric_145-2K/fabric_145_roughness-2K.ktx2",
  },

  fabric85: {
    map: "/textures/textures/fabric_85-2K/fabric_85_basecolor-2K.ktx2",
    normalMap: "/textures/textures/fabric_85-2K/fabric_85_normal-2K.ktx2",
    roughnessMap: "/textures/textures/fabric_85-2K/fabric_85_roughness-2K.ktx2",
  },

  dark_wood: {
    map: "/textures/Wood_texture/textures/dark_wood_diff_2k.ktx2",
    normalMap: "/textures/Wood_texture/textures/dark_wood_nor_gl_2k.ktx2",
    roughnessMap: "/textures/Wood_texture/textures/dark_wood_rough_2k.ktx2",
  },
};

let dracoLoader: DRACOLoader | null = null; // =======================
// Draco Loader
// =======================

function getDracoLoader() {
  if (!dracoLoader) {
    dracoLoader = new DRACOLoader();

    dracoLoader.setDecoderPath(
      "https://www.gstatic.com/draco/versioned/decoders/1.5.7/",
    );
  }

  return dracoLoader;
}

// =======================
// KTX2 Loader
// =======================

function getKTX2Loader(gl: WebGLRenderer) {
  const g = globalThis as unknown as {
    _ktx2Loader?: KTX2Loader;
  };

  if (!g._ktx2Loader) {
    const loader = new KTX2Loader();

    loader.setTranscoderPath("/basis/");

    loader.detectSupport(gl);

    g._ktx2Loader = loader;
  }

  return g._ktx2Loader;
}

// =======================
// Setup Loaders
// =======================

export function setupLoaders(loader: GLTFLoader, gl: WebGLRenderer) {
  loader.setDRACOLoader(getDracoLoader());

  loader.setKTX2Loader(getKTX2Loader(gl));
}

// =======================
// Preload Models
// =======================

export function PreloadModels() {
  const { gl } = useThree();

  useEffect(() => {
    MODELS.forEach((model) => {
      useGLTF.preload(model.url, undefined, undefined, (loader) =>
        setupLoaders(loader as GLTFLoader, gl),
      );
    });
  }, [gl]);

  return null;
}

// =======================
// Preload Textures
// =======================

export function PreloadTextures() {
  const { gl } = useThree();

  useEffect(() => {
    Object.values(TEXTURE_PATHS).forEach((paths) => {
      Object.values(paths).forEach((url) => {
        useLoader.preload(KTX2Loader, url, (loader: any) => {
          loader.setTranscoderPath("/basis/");
          loader.detectSupport(gl);
        });
      });
    });
    // Preload patterns
    ["/textures/textures/lambert25.001_baseColor.ktx2"].forEach((url) => {
      useLoader.preload(KTX2Loader, url, (loader: any) => {
        loader.setTranscoderPath("/basis/");
        loader.detectSupport(gl);
      });
    });
  }, [gl]);

  return null;
}

// Helper function to generate triplanar UV coordinates dynamically in JS for static meshes
function generateTriplanarUVs(mesh: THREE.Mesh, scale: number = 1.0, useLocalSpace: boolean = false) {
  const geometry = mesh.geometry;
  if (!geometry) return;

  // Clone geometry if it's shared, to avoid modifying other meshes sharing it
  if (!mesh.userData.isGeoClonedForUVs) {
    mesh.geometry = mesh.geometry.clone();
    mesh.userData.isGeoClonedForUVs = true;
  }

  const posAttr = mesh.geometry.attributes.position;
  const normalAttr = mesh.geometry.attributes.normal;
  if (!posAttr) return;

  const count = posAttr.count;
  const uvs = new Float32Array(count * 2);

  mesh.updateMatrixWorld(true);
  const matrix = mesh.matrixWorld;
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);

  const localPos = new THREE.Vector3();
  const worldPos = new THREE.Vector3();
  const localNorm = new THREE.Vector3();
  const worldNorm = new THREE.Vector3();

  for (let i = 0; i < count; i++) {
    localPos.fromBufferAttribute(posAttr, i);
    if (useLocalSpace) {
      worldPos.copy(localPos);
    } else {
      worldPos.copy(localPos).applyMatrix4(matrix);
    }
    
    if (normalAttr) {
      localNorm.fromBufferAttribute(normalAttr, i);
      if (useLocalSpace) {
        worldNorm.copy(localNorm).normalize();
      } else {
        worldNorm.copy(localNorm).applyMatrix3(normalMatrix).normalize();
      }
    } else {
      worldNorm.set(0, 1, 0);
    }

    const absX = Math.abs(worldNorm.x);
    const absY = Math.abs(worldNorm.y);
    const absZ = Math.abs(worldNorm.z);

    let u = 0;
    let v = 0;

    // Match WebGL shader mappings:
    // x normal: p.zy
    // y normal: p.zx
    // z normal: p.yx
    if (absX >= absY && absX >= absZ) {
      u = worldPos.z * scale;
      v = worldPos.y * scale;
    } else if (absY >= absX && absY >= absZ) {
      u = worldPos.z * scale;
      v = worldPos.x * scale;
    } else {
      u = worldPos.y * scale;
      v = worldPos.x * scale;
    }

    uvs[i * 2] = u;
    uvs[i * 2 + 1] = v;
  }

  mesh.geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  mesh.geometry.attributes.uv.needsUpdate = true;
}

// =======================
// Main Model Component
// =======================

export function Model({
  config,
  rotationRef,
  onFirstPaint,
}: {
  config: ConfigState;

  rotationRef: React.MutableRefObject<{
    x: number;
    y: number;
  }>;

  onFirstPaint?: () => void;
}) {
  const { gl } = useThree();
  const { update, reset, pathtracer } = usePathtracer();

  const wrapperRef = useRef<Group>(null!);

  const currentRotationYRef = useRef(0);
  const simulatorsRef = useRef<VerletClothSimulator[]>([]);
  const lastPTUpdateTime = useRef(0);
  const pendingPTUpdate = useRef(false);

  const modelInfo =
    MODELS.find((m) => m.id === config.selectedModel) || MODELS[0];

  // =======================
  // Load GLTF
  // =======================

  const roomGltf = useGLTF(
    "/Cloth_models/clothe_mockup_3.glb",
    undefined,
    undefined,
    (loader) => setupLoaders(loader as GLTFLoader, gl),
  );

  const gltfResult = useGLTF(modelInfo.url, undefined, undefined, (loader) =>
    setupLoaders(loader as GLTFLoader, gl),
  );

  // =======================
  // Load Decal Textures
  // =======================

  const luxiLogo = useTexture("/clothes/luxi_logo.svg");

  const graphicPrint = useLoader(
    KTX2Loader,
    "/clothes/graphic.ktx2",
    (loader: any) => {
      loader.setTranscoderPath("/basis/");
      loader.detectSupport(gl);
    },
  );

  // KTX2 textures cannot flipY natively through WebGL unpack, so we flip the texture matrix coordinates
  useEffect(() => {
    if (graphicPrint) {
      graphicPrint.colorSpace = THREE.SRGBColorSpace;
      graphicPrint.wrapT = THREE.RepeatWrapping;
      graphicPrint.repeat.y = -1;
      graphicPrint.offset.y = 1;
      graphicPrint.needsUpdate = true;
    }
  }, [graphicPrint]);

  useEffect(() => {
    if (onFirstPaint) {
      onFirstPaint();
    }
  }, [onFirstPaint]);

  useEffect(() => {
    if (luxiLogo) {
      luxiLogo.colorSpace = THREE.SRGBColorSpace;

      luxiLogo.needsUpdate = true;
    }

    if (graphicPrint) {
      graphicPrint.colorSpace = THREE.SRGBColorSpace;

      graphicPrint.needsUpdate = true;
    }
  }, [luxiLogo, graphicPrint]);

  // =======================
  // Active Decal
  // =======================

  const activeDecalTexture = useMemo(() => {
    if (config.selectedDecal === "luxi") {
      return luxiLogo;
    }

    if (config.selectedDecal === "graphic") {
      return graphicPrint;
    }

    return null;
  }, [config.selectedDecal, luxiLogo, graphicPrint]); // =======================
  // Texture Loading
  // =======================

  const textureFiles = useMemo(() => {
    const files: string[] = [];
    Object.keys(TEXTURE_PATHS).forEach((key) => {
      const p = TEXTURE_PATHS[key];
      if (p) {
        if (p.map) files.push(p.map);
        if (p.normalMap) files.push(p.normalMap);
        if (p.roughnessMap || p.aoMap) files.push(p.roughnessMap || p.aoMap);
        if (p.specMap) files.push(p.specMap);
      }
    });
    // Add pattern files
    files.push("/textures/textures/lambert25.001_baseColor.ktx2");
    return files.filter(Boolean);
  }, []);

  const loadedTextures = useLoader(KTX2Loader, textureFiles, (loader) => {
    loader.setTranscoderPath("/basis/");

    loader.detectSupport(gl);
  });

  // =======================
  // Build Scene
  // =======================

  const {
    staticScene,
    rotatableScene,
    targetScale,
    localCamPos,
    localChestTarget,
  } = useMemo(() => {
    // staticScene is always cloned from roomGltf (clothe_mockup_3.glb)
    const root = roomGltf.scene.clone();

    // Find camera nodes and settings from GLTF assets to build frustums
    const roomCameraNode = root.getObjectByName("Camera") || root.getObjectByName("Camera.001");
    const roomCamera = roomGltf.cameras[0] as THREE.PerspectiveCamera;

    const kaftanCameraNode = gltfResult.scene.getObjectByName("Camera") || gltfResult.scene.getObjectByName("Camera.001");
    const kaftanCamera = gltfResult.cameras[0] as THREE.PerspectiveCamera;

    const testAspect = 2.2; // Safe ultra-wide aspect ratio to prevent premature culling on wide screens

    // Setup Shirt view camera frustum
    const shirtCam = new THREE.PerspectiveCamera(roomCamera?.fov || 45, testAspect, roomCamera?.near || 0.1, roomCamera?.far || 100);
    if (roomCameraNode) {
      roomCameraNode.updateMatrixWorld(true);
      roomCameraNode.getWorldPosition(shirtCam.position);
      roomCameraNode.getWorldQuaternion(shirtCam.quaternion);
    } else {
      shirtCam.position.set(0.2587, 0.0728, -0.232);
    }
    shirtCam.updateProjectionMatrix();
    shirtCam.updateMatrixWorld(true);
    shirtCam.matrixWorldInverse.copy(shirtCam.matrixWorld).invert();

    const frustumShirt = new THREE.Frustum();
    const matShirt = new THREE.Matrix4().multiplyMatrices(shirtCam.projectionMatrix, shirtCam.matrixWorldInverse);
    frustumShirt.setFromProjectionMatrix(matShirt);

    // Setup Kaftan view camera frustum
    const kaftanCam = new THREE.PerspectiveCamera(kaftanCamera?.fov || 45, testAspect, kaftanCamera?.near || 0.1, kaftanCamera?.far || 100);
    if (kaftanCameraNode) {
      kaftanCameraNode.updateMatrixWorld(true);
      kaftanCameraNode.getWorldPosition(kaftanCam.position);
      kaftanCam.position.y += 0.05; // Matches ConfiguratorCanvas elevation shift
      kaftanCameraNode.getWorldQuaternion(kaftanCam.quaternion);
    } else {
      kaftanCam.position.set(0.325, -0.0872, -0.1792);
    }
    kaftanCam.updateProjectionMatrix();
    kaftanCam.updateMatrixWorld(true);
    kaftanCam.matrixWorldInverse.copy(kaftanCam.matrixWorld).invert();

    const frustumKaftan = new THREE.Frustum();
    const matKaftan = new THREE.Matrix4().multiplyMatrices(kaftanCam.projectionMatrix, kaftanCam.matrixWorldInverse);
    frustumKaftan.setFromProjectionMatrix(matKaftan);

    // Hide extra background mannequin, clothing, and other models that are outside the camera view of both cameras
    const toRemoveCull: THREE.Object3D[] = [];
    root.traverse((child) => {
      if ((child as any).isMesh) {
        const mesh = child as THREE.Mesh;

        // Skip light sources or area lights (don't hide the lights!)
        if (mesh.name === "Area" || mesh.name === "Area.001" || mesh.name.includes("Light")) {
          return;
        }

        // Always hide duplicate background mannequins
        if (mesh.name.includes("Object_")) {
          toRemoveCull.push(mesh);
          return;
        }

        // Ensure bounding box is computed
        if (mesh.geometry) {
          if (!mesh.geometry.boundingBox) {
            mesh.geometry.computeBoundingBox();
          }
        }

        mesh.updateMatrixWorld(true);
        const inShirt = frustumShirt.intersectsObject(mesh);
        const inKaftan = frustumKaftan.intersectsObject(mesh);

        if (!inShirt && !inKaftan) {
          toRemoveCull.push(mesh);
        }
      }
    });
    toRemoveCull.forEach((node) => {
      if (node.parent) {
        node.parent.remove(node);
      }
    });

    // rotRoot is cloned from the selected model (could be Kaftan or Tee)
    const rotRoot = gltfResult.scene.clone();

    root.scale.setScalar(1);
    root.position.set(0, 0, 0);

    rotRoot.rotation.x = modelInfo.rotationX || 0;
    rotRoot.rotation.y = modelInfo.rotationY || 0;
    rotRoot.rotation.z = modelInfo.rotationZ || 0;
    rotRoot.scale.setScalar(1);
    rotRoot.position.set(0, 0, 0);

    // Clean up color attributes from geometries to prevent three-gpu-pathtracer RangeErrors
    const cleanColors = (child: THREE.Object3D) => {
      if ((child as any).isMesh) {
        const mesh = child as THREE.Mesh;
        if (mesh.geometry) {
          const hasColor = Object.keys(mesh.geometry.attributes).some(k => k.startsWith('color'));
          if (hasColor) {
            mesh.geometry = mesh.geometry.clone();
            Object.keys(mesh.geometry.attributes).forEach(k => {
              if (k.startsWith('color')) {
                mesh.geometry.deleteAttribute(k);
              }
            });
          }
        }
      }
    };
    root.traverse(cleanColors);
    rotRoot.traverse(cleanColors);

    //---------------------------------
    // Upgrade Premium Materials in the Room
    //---------------------------------

    const shelfIds = ["_id60", "_id66", "_id72"];
    const poleIds = ["_id154", "_id156", "_id180", "_id181", "_id190"];
    const premiumMeshes = [...shelfIds, ...poleIds];

    root.traverse((child) => {
      if (
        (child as any).isMesh &&
        premiumMeshes.some((id) => child.name.includes(id))
      ) {
        const mesh = child as THREE.Mesh;
        const oldMat = mesh.material as THREE.MeshStandardMaterial;
        const newMat = new THREE.MeshStandardMaterial({
          color: oldMat.color,
          map: oldMat.map,
          normalMap: oldMat.normalMap,
          roughnessMap: oldMat.roughnessMap,
          metalnessMap: oldMat.metalnessMap,
        });

        const isPole = poleIds.some((id) => mesh.name.includes(id));
        const isMetallicSpot =
          mesh.name.includes("60.009") || mesh.name.includes("60.007");

        if (isPole || isMetallicSpot) {
          // Metallic pieces (poles and spots)
          newMat.metalness = 1.0;
          newMat.roughness = 0.15;
          newMat.color.set("#ffffff");
        } else {
          // Painted wood / acrylic shelves
          newMat.metalness = 0.1;
          newMat.roughness = 0;
          newMat.color.set("#5C4033");
        }

        mesh.material = newMat;
      }
    });

    //---------------------------------
    // Hide Static room components and duplicate mannequin in root
    //---------------------------------

    const toRemove: THREE.Object3D[] = [];
    root.traverse((child) => {
      if (
        child.name === "Area" ||
        child.name === "Area.001" ||
        child.name === "Plane" ||
        child.name === "platform" ||
        child.name === "Cylinder" ||
        child.name === "mannequin_present"
      ) {
        toRemove.push(child);
      }
    });
    toRemove.forEach((node) => {
      if (node.parent) {
        node.parent.remove(node);
      }
    });

    //---------------------------------
    // Configure parts and clone materials on active model
    //---------------------------------

    rotRoot.traverse((child) => {
      if ((child as any).isMesh) {
        const mesh = child as Mesh;
        const configurable = modelInfo.parts.some((p) => p.id === mesh.name);
        if (configurable) {
          mesh.userData.partId = mesh.name;
        }

        // Clone materials so custom colors/textures don't mutate cached GLTF models
        if (Array.isArray(mesh.material)) {
          mesh.material = mesh.material.map((m: any) =>
            m?.isMaterial ? m.clone() : m,
          );
        } else if (mesh.material && (mesh.material as any).isMaterial) {
          mesh.material = mesh.material.clone();
        }

        // Apply black shiny texture to Kaftan mannequin parts (stand and dummy body)
        if (
          mesh.name === "polySurface20_STAND_0" ||
          mesh.name === "polySurface21_DUMMY_0"
        ) {
          const applyShinyBlack = (mat: any) => {
            if (mat && mat.isMaterial) {
              mat.color.set("#000000");
              mat.roughness = 0;
              mat.metalness = 0;
              mat.map = null;
              mat.normalMap = null;
              mat.roughnessMap = null;
              mat.aoMap = null;
              mat.needsUpdate = true;
            }
          };
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach(applyShinyBlack);
          } else {
            applyShinyBlack(mesh.material);
          }
        }
      }
    });

    //---------------------------------
    // Sync trouser panel textures on active model
    //---------------------------------

    {
      let backMap: THREE.Texture | null = null;
      rotRoot.traverse((child) => {
        if (child.name === "Trousers_backPanel" && (child as any).isMesh) {
          const mat = (child as Mesh).material as THREE.MeshStandardMaterial;
          if (mat?.map) backMap = mat.map;
        }
      });

      if (backMap) {
        rotRoot.traverse((child) => {
          if (child.name === "Trouser_frontPanel" && (child as any).isMesh) {
            const mat = (child as Mesh).material as THREE.MeshStandardMaterial;
            if (mat) {
              mat.map = backMap;
              mat.needsUpdate = true;
            }
          }
        });
      }
    }

    //---------------------------------
    // Pivot - dynamically check active mannequin position
    //---------------------------------

    rotRoot.updateMatrixWorld(true);

    const pivot = new Vector3();
    const mannequin =
      rotRoot.getObjectByName("Model") ||
      rotRoot.getObjectByName("polySurface21_DUMMY_0");

    if (mannequin) {
      if ((mannequin as THREE.Mesh).isMesh) {
        const mesh = mannequin as THREE.Mesh;
        mesh.geometry.computeBoundingBox();
        if (mesh.geometry.boundingBox) {
          const center = new THREE.Vector3();
          mesh.geometry.boundingBox.getCenter(center);
          center.applyMatrix4(mesh.matrixWorld);
          pivot.copy(center);
        } else {
          mannequin.getWorldPosition(pivot);
        }
      } else {
        mannequin.getWorldPosition(pivot);
      }
    } else {
      pivot.set(-0.612, -0.4519, -0.3159);
    }

    //---------------------------------
    // Rotation Group
    //---------------------------------

    const rotGroup = new THREE.Group();
    rotGroup.name = "rotatableGroup";
    rotGroup.position.copy(pivot);

    // Parent to rotRoot temporarily to ensure valid matrixWorld for relative transform calculation
    rotRoot.add(rotGroup);
    rotRoot.updateMatrixWorld(true);

    const mannequinGroup =
      rotRoot.getObjectByName("mannequin_present") ||
      rotRoot.getObjectByName("RootNode");

    if (mannequinGroup) {
      rotGroup.attach(mannequinGroup);
    } else {
      rotRoot.traverse((child) => {
        if (
          child.name === "T-shirt_mainbody" ||
          child.name === "BAJU_BAJU_TEX_0"
        ) {
          let current: THREE.Object3D = child;
          while (
            current.parent &&
            current.parent !== rotRoot &&
            current.name !== "mannequin_present" &&
            current.name !== "RootNode"
          ) {
            current = current.parent;
          }
          if (
            current.name === "mannequin_present" ||
            current.name === "RootNode"
          ) {
            rotGroup.attach(current);
          }
        }
      });
    }

    // Detach rotGroup from rotRoot
    rotRoot.remove(rotGroup);

    // Find shirt mesh to compute center in world coordinates at default rotation
    let tempShirtMesh: any = null;
    rotGroup.traverse((child) => {
      if (
        (child as any).isMesh &&
        (child.name === "T-shirt_mainbody" || child.name === "BAJU_BAJU_TEX_0")
      ) {
        tempShirtMesh = child;
      }
    });

    const center = new Vector3();
    if (tempShirtMesh) {
      tempShirtMesh.updateWorldMatrix(true, false);
      const box = new Box3().setFromObject(tempShirtMesh);
      box.getCenter(center);
    } else {
      center.set(-0.612, -0.4519, -0.3159);
    }

    const calculatedLocalCamPos = new THREE.Vector3(
      0.2586659,
      0.0727528,
      -0.232007,
    ).sub(pivot);
    const calculatedLocalChestTarget = new THREE.Vector3(
      center.x + 0.02,
      center.y + 0.03,
      center.z,
    ).sub(pivot);

    return {
      staticScene: root,
      rotatableScene: rotGroup,
      targetScale: 1,
      localCamPos: calculatedLocalCamPos,
      localChestTarget: calculatedLocalChestTarget,
    };
  }, [roomGltf, gltfResult, modelInfo]);

  // =======================
  // Entrance Animation
  // =======================

  useEffect(() => {
    if (wrapperRef.current) {
      if (config.pathTracer) {
        wrapperRef.current.scale.set(targetScale, targetScale, targetScale);
      } else {
        wrapperRef.current.scale.set(0, 0, 0);
      }
    }
  }, [config.selectedModel, config.pathTracer, targetScale]); // =======================
  // Extract Materials
  // =======================

  const partMaterialsRef = useRef<Record<string, any>>({});

  useEffect(() => {
    const map: Record<string, any> = {};
    rotatableScene.traverse((child) => {
      if ((child as any).isMesh) {
        const mesh = child as Mesh;
        if (
          mesh.userData.partId &&
          mesh.material &&
          (mesh.material as any).isMaterial
        ) {
          if (!(mesh.material as any).isMeshPhysicalMaterial) {
            const oldMat = mesh.material as THREE.MeshStandardMaterial;
            const newMat = new THREE.MeshPhysicalMaterial();
            THREE.MeshStandardMaterial.prototype.copy.call(newMat, oldMat);
            mesh.material = newMat;
          }
          map[mesh.userData.partId] = mesh.material;
        }
      }
    });
    partMaterialsRef.current = map;
  }, [rotatableScene]);

  // =======================
  // Apply Colors + Textures
  // =======================

  // Effect: First Paint Notification
  useEffect(() => {
    if (rotatableScene && onFirstPaint) {
      onFirstPaint();
    }
  }, [rotatableScene, onFirstPaint]);

  // Effect: Colors
  useEffect(() => {
    Object.entries(partMaterialsRef.current).forEach(([name, mat]) => {
      if (mat) {
        if (config.selectedModel === "shirt") {
          const color = config.partColors[name];
          mat.color.set(color || config.mainColor);
        } else {
          mat.color.set("#ffffff");
        }
        mat.needsUpdate = true;
      }
    });
  }, [
    rotatableScene,
    config.partColors,
    config.mainColor,
    config.selectedModel,
  ]);

  // Effect: Textures & Triplanar Shader
  useEffect(() => {
    const textures = Array.isArray(loadedTextures)
      ? loadedTextures
      : [loadedTextures];

    const textureMaps: Record<
      string,
      {
        map: THREE.Texture | null;
        normalMap: THREE.Texture | null;
        roughOrAo: THREE.Texture | null;
        specMap: THREE.Texture | null;
      }
    > = {};
    let currentIndex = 0;

    Object.keys(TEXTURE_PATHS).forEach((key) => {
      const p = TEXTURE_PATHS[key];
      const maps = {
        map: null as any,
        normalMap: null as any,
        roughOrAo: null as any,
        specMap: null as any,
      };
      if (p) {
        if (p.map) {
          maps.map = textures[currentIndex++];
          if (maps.map) {
            maps.map.colorSpace = THREE.SRGBColorSpace;
          }
        }
        if (p.normalMap) maps.normalMap = textures[currentIndex++];
        if (p.roughnessMap || p.aoMap)
          maps.roughOrAo = textures[currentIndex++];
        if (p.specMap) maps.specMap = textures[currentIndex++];
      }
      [maps.map, maps.normalMap, maps.roughOrAo, maps.specMap].forEach(
        (tex) => {
          if (tex) {
            tex.wrapS = RepeatWrapping;
            tex.wrapT = RepeatWrapping;
          }
        },
      );
      textureMaps[key] = maps;
    });

    const kaftanPatternTex = textures[currentIndex++];

    [kaftanPatternTex].forEach((tex) => {
      if (tex) {
        tex.wrapS = RepeatWrapping;
        tex.wrapT = RepeatWrapping;
        tex.colorSpace = THREE.SRGBColorSpace;
      }
    });

    Object.entries(partMaterialsRef.current).forEach(([name, mat]) => {
      if (!mat) return;

      const partTexKey = config.partTextures[name] || "none";
      const hasTex = partTexKey !== "none";

      mat.roughness = partTexKey === "leather" ? 1 : 0.8;
      mat.metalness = partTexKey === "leather" ? 0.1 : 0;

      if (config.selectedModel === "shirt") {
        // T-Shirt logic (Restored to origin/main)
        if (hasTex && textureMaps[partTexKey] && partTexKey === "linen") {
          mat.map = textureMaps[partTexKey].map;
        } else {
          mat.map = null;
        }
      } else {
        // Kaftan logic (Patterns)
        const partPatternKey = config.partPatterns?.[name] || "default";
        let activePatternTex: THREE.Texture | null = null;

        let resolvedPatternKey = partPatternKey;
        if (partPatternKey === "default") {
          resolvedPatternKey = "kaftan_pattern";
        }

        if (resolvedPatternKey === "kaftan_pattern") {
          activePatternTex = kaftanPatternTex;
        } else if (resolvedPatternKey === "curtain_pattern") {
          activePatternTex = textureMaps["curtain"]?.map;
        } else if (resolvedPatternKey === "fabric_145_pattern") {
          activePatternTex = textureMaps["fabric145"]?.map;
        } else if (resolvedPatternKey === "fabric_85_pattern") {
          activePatternTex = textureMaps["fabric85"]?.map;
        }

        mat.map = activePatternTex;
      }

      if (hasTex && textureMaps[partTexKey]) {
        const texMap = textureMaps[partTexKey];
        mat.normalMap = texMap.normalMap;

        if (TEXTURE_PATHS[partTexKey].roughnessMap) {
          mat.roughnessMap = texMap.roughOrAo;
          mat.aoMap = null;
          mat.metalnessMap = null;
        } else if (partTexKey === "velvet") {
          mat.roughnessMap = texMap.roughOrAo;
          mat.aoMap = texMap.roughOrAo;
          mat.metalnessMap = texMap.roughOrAo;
        } else {
          mat.roughnessMap = null;
          mat.aoMap = null;
          mat.metalnessMap = null;
        }

        (mat as THREE.MeshPhysicalMaterial).specularIntensityMap = null;
        (mat as THREE.MeshPhysicalMaterial).specularIntensity = 0.0;

        // Optimization 7: prevent unnecessary shader recompilation
        const needsShaderUpdate = mat.userData.lastTexture !== partTexKey;
        if (needsShaderUpdate) {
          mat.userData.lastTexture = partTexKey;
          mat.onBeforeCompile = (shader: any) => {
            shader.uniforms.uTriScale = {
              value: partTexKey === "leather" ? 0.0006 : 0.001,
            };

            shader.vertexShader = shader.vertexShader.replace(
              "#include <common>",
              `
#include <common>
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
`,
            );

            shader.vertexShader = shader.vertexShader.replace(
              "#include <worldpos_vertex>",
              `
#include <worldpos_vertex>

vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vWorldNormal = normalize(mat3(modelMatrix) * normal);
`,
            );

            shader.fragmentShader = shader.fragmentShader.replace(
              "#include <common>",
              `
#include <common>

uniform float uTriScale;

varying vec3 vWorldPos;
varying vec3 vWorldNormal;

vec4 tri(sampler2D tex, vec3 p, vec3 n) {
  vec3 b = abs(normalize(n));
  b /= (b.x + b.y + b.z);
  vec4 x = texture2D(tex, p.yz * uTriScale);
  vec4 y = texture2D(tex, p.xz * uTriScale);
  vec4 z = texture2D(tex, p.xy * uTriScale);
  return x * b.x + y * b.y + z * b.z;
}
`,
            );

            if (config.selectedModel === "shirt" && partTexKey === "linen") {
              shader.fragmentShader = shader.fragmentShader.replace(
                "#include <map_fragment>",
                THREE.ShaderChunk.map_fragment.replace(
                  "texture2D( map, vMapUv )",
                  "tri(map, vWorldPos, vWorldNormal)",
                ),
              );
            }

            shader.fragmentShader = shader.fragmentShader.replace(
              "#include <normal_fragment_maps>",
              THREE.ShaderChunk.normal_fragment_maps.replace(
                "texture2D( normalMap, vNormalMapUv )",
                "tri(normalMap, vWorldPos, vWorldNormal)",
              ),
            );

            if (
              partTexKey === "leather" ||
              partTexKey === "velvet" ||
              partTexKey === "curtain" ||
              partTexKey === "fabric145" ||
              partTexKey === "fabric85"
            ) {
              shader.fragmentShader = shader.fragmentShader.replace(
                "#include <roughnessmap_fragment>",
                THREE.ShaderChunk.roughnessmap_fragment.replace(
                  "texture2D( roughnessMap, vRoughnessMapUv )",
                  "tri(roughnessMap, vWorldPos, vWorldNormal)",
                ),
              );
            }

            if (partTexKey === "velvet") {
              shader.fragmentShader = shader.fragmentShader.replace(
                "#include <aomap_fragment>",
                THREE.ShaderChunk.aomap_fragment.replace(
                  "texture2D( aoMap, vAoMapUv )",
                  "tri(aoMap, vWorldPos, vWorldNormal)",
                ),
              );
              shader.fragmentShader = shader.fragmentShader.replace(
                "#include <metalnessmap_fragment>",
                THREE.ShaderChunk.metalnessmap_fragment.replace(
                  "texture2D( metalnessMap, vMetalnessMapUv )",
                  "tri(metalnessMap, vWorldPos, vWorldNormal)",
                ),
              );
            }
          };
          mat.needsUpdate = true;
        }
      } else {
        mat.normalMap = null;
        mat.roughnessMap = null;
        mat.aoMap = null;
        mat.metalnessMap = null;
        (mat as THREE.MeshPhysicalMaterial).specularIntensityMap = null;

        const needsShaderUpdate = mat.userData.lastTexture !== "none";
        if (needsShaderUpdate) {
          mat.userData.lastTexture = "none";
          mat.onBeforeCompile = () => {};
          mat.needsUpdate = true;
        }
      }
    });

    if (staticScene) {
      staticScene.traverse((child) => {
        if ((child as any).isMesh) {
          const mesh = child as THREE.Mesh;
          if (!mesh.material) return;

          const isGlass =
            mesh.name === "mesh_id408" ||
            mesh.name === "mesh_id414" ||
            mesh.name === "mesh_id420";

          if (isGlass) {
            const processGlassMaterial = (mat: THREE.Material) => {
              if (!mat) return mat;

              let targetMat = mat as THREE.MeshPhysicalMaterial;
              const pathTracerMode = config.pathTracer;
              if (targetMat.type !== "MeshPhysicalMaterial") {
                targetMat = new THREE.MeshPhysicalMaterial({
                  color: new THREE.Color(pathTracerMode ? "#333333" : "#151515"),
                  transparent: !pathTracerMode,
                  opacity: pathTracerMode ? 1.0 : 0.25,
                  roughness: 0.1,
                  metalness: 0.1,
                  transmission: pathTracerMode ? 0.9 : 0.0,
                  ior: 1.5,
                  side: THREE.DoubleSide,
                });
              } else {
                targetMat.color.set(pathTracerMode ? "#333333" : "#151515");
                targetMat.transparent = !pathTracerMode;
                targetMat.opacity = pathTracerMode ? 1.0 : 0.25;
                targetMat.roughness = 0.1;
                targetMat.metalness = 0.1;
                targetMat.transmission = pathTracerMode ? 0.9 : 0.0;
                targetMat.ior = 1.5;
                targetMat.side = THREE.DoubleSide;
                targetMat.map = null;
                targetMat.normalMap = null;
                targetMat.roughnessMap = null;
                targetMat.metalnessMap = null;
                targetMat.aoMap = null;
                targetMat.needsUpdate = true;
              }

              return targetMat;
            };

            if (Array.isArray(mesh.material)) {
              mesh.material = mesh.material.map(processGlassMaterial);
            } else {
              mesh.material = processGlassMaterial(mesh.material);
            }
          }

          const isWall = mesh.name === "mesh_id48";
          const isPlatform =
            mesh.name === "mesh_id42" ||
            mesh.name === "mesh_id78" ||
            mesh.name === "mesh_id78.002" ||
            mesh.name === "mesh_id78002" ||
            mesh.name.includes("mesh_id42") ||
            mesh.name.includes("mesh_id78");

          if (
            (isWall && textureMaps["wooden_wall"]) ||
            (isPlatform && textureMaps["dark_wood"])
          ) {
            if (isPlatform && !mesh.userData.hasRoundedGeo && mesh.geometry) {
              mesh.geometry.computeBoundingBox();
              if (mesh.geometry.boundingBox) {
                const bbox = mesh.geometry.boundingBox;
                const size = new THREE.Vector3();
                bbox.getSize(size);
                const center = new THREE.Vector3();
                bbox.getCenter(center);

                // Create beveled box (1.5cm radius, 10 segments)
                const roundedGeo = new RoundedBoxGeometry(
                  size.x,
                  size.y,
                  size.z,
                  10,
                  1.5,
                );
                roundedGeo.translate(center.x, center.y, center.z);

                // Dispose old geometry to prevent memory leaks
                mesh.geometry.dispose();
                mesh.geometry = roundedGeo;
                mesh.userData.hasRoundedGeo = true;
              }
            }

            // Generate triplanar UVs dynamically for the mesh geometry!
            const isLeft = mesh.name === "mesh_id42" || mesh.name.includes("mesh_id42");
            const scaleVal = isWall ? WALL_TRI_SCALE : (isLeft ? LEFT_PLATFORM_TRI_SCALE : CENTER_PLATFORM_TRI_SCALE);
            generateTriplanarUVs(mesh, scaleVal, false);

            const processMaterial = (mat: THREE.Material) => {
              if (!mat || !(mat as any).isMaterial) return mat;

              let targetMat = mat as THREE.MeshStandardMaterial;

              if (isPlatform) {
                if (!targetMat.userData.isClonedForPlatform) {
                  targetMat = targetMat.clone();
                  targetMat.vertexColors = false;
                  targetMat.userData = {
                    ...targetMat.userData,
                    isClonedForPlatform: true,
                    lastTexture: undefined,
                  };
                }
              } else {
                // Ensure it's a Standard or Physical Material
                if (
                  targetMat.type !== "MeshStandardMaterial" &&
                  targetMat.type !== "MeshPhysicalMaterial"
                ) {
                  targetMat = new THREE.MeshStandardMaterial({
                    color: targetMat.color,
                    vertexColors: false,
                  });
                }
              }

              const texKey = isWall ? "wooden_wall" : "dark_wood";
              const texMap = textureMaps[texKey];

              targetMat.map = texMap.map;
              targetMat.roughnessMap = isPlatform ? null : texMap.roughOrAo;
              targetMat.normalMap = isPlatform ? null : texMap.normalMap;
              targetMat.roughness = isWall ? 0.9 : 0.8;
              targetMat.metalness = isWall ? 0 : 0.1;

              if (isPlatform) {
                targetMat.color.set("white"); // Clear any color tint to show the new texture exactly as it is
              }

              const needsShaderUpdate =
                targetMat.userData.lastTexture !== texKey;
              if (needsShaderUpdate) {
                targetMat.userData.lastTexture = texKey;
                const isLeft =
                  mesh.name === "mesh_id42" || mesh.name.includes("mesh_id42");
                targetMat.onBeforeCompile = (shader: any) => {
                  let scaleVal = WALL_TRI_SCALE;
                  if (isWall) {
                    scaleVal = WALL_TRI_SCALE;
                  } else if (isLeft) {
                    scaleVal = LEFT_PLATFORM_TRI_SCALE;
                  } else {
                    scaleVal = CENTER_PLATFORM_TRI_SCALE;
                  }

                  shader.uniforms.uTriScale = {
                    value: scaleVal,
                  };

                  shader.vertexShader = shader.vertexShader.replace(
                    "#include <common>",
                    `
    #include <common>
    varying vec3 vWorldPos;
    varying vec3 vWorldNormal;
    `,
                  );
                  shader.vertexShader = shader.vertexShader.replace(
                    "#include <worldpos_vertex>",
                    `
    #include <worldpos_vertex>
    vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
    vWorldNormal = normalize(inverseTransformDirection(normalMatrix * objectNormal, viewMatrix));
    `,
                  );

                  shader.fragmentShader = shader.fragmentShader.replace(
                    "#include <common>",
                    `
    #include <common>
    varying vec3 vWorldPos;
    varying vec3 vWorldNormal;
    uniform float uTriScale;

    vec4 tri(sampler2D tex, vec3 p, vec3 n) {
      vec3 b = abs(normalize(n));
      b /= (b.x + b.y + b.z);
      vec4 x = texture2D(tex, p.zy * uTriScale);
      vec4 y = texture2D(tex, p.zx * uTriScale);
      vec4 z = texture2D(tex, p.yx * uTriScale);
      return x * b.x + y * b.y + z * b.z;
    }
    `,
                  );

                  shader.fragmentShader = shader.fragmentShader.replace(
                    "#include <map_fragment>",
                    `
      #ifdef USE_MAP
        vec4 texelColor = tri(map, vWorldPos, vWorldNormal);
        texelColor = sRGBTransferEOTF(texelColor);
        diffuseColor.rgb *= texelColor.rgb;
      #endif
      `,
                  );

                  shader.fragmentShader = shader.fragmentShader.replace(
                    "#include <normal_fragment_maps>",
                    `
      #ifdef USE_NORMALMAP
        vec3 tnormal = tri(normalMap, vWorldPos, vWorldNormal).xyz * 2.0 - 1.0;
        tnormal.xy *= normalScale;

        // Construct artificial world-space TBN using geometry normal
        vec3 wNormal = normalize(vWorldNormal);
        vec3 wUp = abs(wNormal.y) < 0.999 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
        vec3 wTangent = normalize(cross(wUp, wNormal));
        vec3 wBitangent = cross(wNormal, wTangent);
        mat3 wTBN = mat3(wTangent, wBitangent, wNormal);
        
        vec3 perturbedWorldNormal = normalize(wTBN * tnormal);
        
        // Convert to view space for Three.js lighting calculations
        normal = normalize(mat3(viewMatrix) * perturbedWorldNormal);
      #endif
                    `,
                  );

                  shader.fragmentShader = shader.fragmentShader.replace(
                    "#include <roughnessmap_fragment>",
                    `
    float roughnessFactor = roughness;
    #ifdef USE_ROUGHNESSMAP
      vec4 texelRoughness = tri(roughnessMap, vWorldPos, vWorldNormal);
      roughnessFactor *= texelRoughness.g;
    #endif
    `,
                  );
                };
                targetMat.needsUpdate = true;
              }

              return targetMat;
            };

            if (Array.isArray(mesh.material)) {
              mesh.material = mesh.material.map(processMaterial);
            } else {
              mesh.material = processMaterial(mesh.material);
            }
          }
        }
      });
    }

    if (rotatableScene) {
      const toRemoveRot: THREE.Object3D[] = [];
      rotatableScene.traverse((child) => {
        if ((child as any).isMesh) {
          const mesh = child as THREE.Mesh;
          if (
            mesh.name === "mesh_id42" ||
            mesh.name === "mesh_id78" ||
            mesh.name === "mesh_id78.002" ||
            mesh.name === "mesh_id78002" ||
            mesh.name.includes("mesh_id42") ||
            mesh.name.includes("mesh_id78")
          ) {
            toRemoveRot.push(mesh);
          }
        }
      });
      toRemoveRot.forEach((node) => {
        if (node.parent) {
          node.parent.remove(node);
        }
      });
    }

    if (rotatableScene && textureMaps["linen"]) {
      rotatableScene.traverse((child) => {
        if (
          (child as any).isMesh &&
          (child.name === "Trousers_backPanel" ||
            child.name === "Trouser_frontPanel")
        ) {
          const mesh = child as THREE.Mesh;
          if ((mesh.material as any).type !== "MeshPhysicalMaterial") {
            mesh.material = new THREE.MeshPhysicalMaterial({
              color: (mesh.material as THREE.Material & { color?: THREE.Color })
                .color,
            });
          }
          const mat = mesh.material as THREE.MeshPhysicalMaterial;

          const texMap = textureMaps["linen"];
          mat.map = texMap.map;
          mat.roughnessMap = texMap.roughOrAo;
          mat.normalMap = texMap.normalMap;
          mat.roughness = 1;
          mat.metalness = 0.0;

          const needsShaderUpdate =
            mat.userData.lastTexture !== "linen_trousers";
          if (needsShaderUpdate) {
            mat.userData.lastTexture = "linen_trousers";
            mat.onBeforeCompile = (shader: any) => {
              shader.uniforms.uTriScale = {
                value: 2, // Increased scale for linen trousers
              };

              shader.vertexShader = shader.vertexShader.replace(
                "#include <common>",
                `
  #include <common>
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  `,
              );

              shader.vertexShader = shader.vertexShader.replace(
                "#include <worldpos_vertex>",
                `
  #include <worldpos_vertex>
  vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
  vWorldNormal = normalize((modelMatrix * vec4(objectNormal, 0.0)).xyz);
  `,
              );

              shader.fragmentShader = shader.fragmentShader.replace(
                "#include <common>",
                `
  #include <common>
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  uniform float uTriScale;

  vec4 tri(sampler2D tex, vec3 p, vec3 n) {
    vec3 b = abs(normalize(n));
    b /= (b.x + b.y + b.z);
    vec4 x = texture2D(tex, p.zy * uTriScale);
    vec4 y = texture2D(tex, p.zx * uTriScale);
    vec4 z = texture2D(tex, p.yx * uTriScale);
    return x * b.x + y * b.y + z * b.z;
  }
  `,
              );

              shader.fragmentShader = shader.fragmentShader.replace(
                "#include <map_fragment>",
                `
  #ifdef USE_MAP
    vec4 texelColor = tri(map, vWorldPos, vWorldNormal);
    texelColor = sRGBTransferEOTF(texelColor);
    diffuseColor.rgb *= texelColor.rgb;
  #endif
  `,
              );

              shader.fragmentShader = shader.fragmentShader.replace(
                "#include <normal_fragment_maps>",
                `
  #ifdef USE_NORMALMAP
    vec3 tnormal = tri(normalMap, vWorldPos, vWorldNormal).xyz * 2.0 - 1.0;
    tnormal.xy *= normalScale;

    // Construct artificial world-space TBN using geometry normal
    vec3 wNormal = normalize(vWorldNormal);
    vec3 wUp = abs(wNormal.y) < 0.999 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    vec3 wTangent = normalize(cross(wUp, wNormal));
    vec3 wBitangent = cross(wNormal, wTangent);
    mat3 wTBN = mat3(wTangent, wBitangent, wNormal);
    
    vec3 perturbedWorldNormal = normalize(wTBN * tnormal);
    
    // Convert to view space for Three.js lighting calculations
    normal = normalize(mat3(viewMatrix) * perturbedWorldNormal);
  #endif
                `,
              );

              shader.fragmentShader = shader.fragmentShader.replace(
                "#include <roughnessmap_fragment>",
                `
  float roughnessFactor = roughness;
  #ifdef USE_ROUGHNESSMAP
    vec4 texelRoughness = tri(roughnessMap, vWorldPos, vWorldNormal);
    roughnessFactor *= texelRoughness.g;
  #endif
  `,
              );
            };
          }
          mat.color.set(0x1a1a1a); // Very dark, near black
        }
      });
    }

    if (staticScene && textureMaps["plastic"]) {
      const shelfIds = ["_id60", "_id66", "_id72"];
      const rackMeshes = [...shelfIds]; // Removed poleIds to keep their original metal textures
      staticScene.traverse((child) => {
        if (
          (child as any).isMesh &&
          rackMeshes.some((id) => child.name.includes(id))
        ) {
          const mesh = child as THREE.Mesh;
          const origNormalMap = (mesh.material as THREE.MeshStandardMaterial)
            .normalMap;
          if ((mesh.material as any).type !== "MeshPhysicalMaterial") {
            mesh.material = new THREE.MeshPhysicalMaterial({
              color: (mesh.material as THREE.Material & { color?: THREE.Color })
                .color,
            });
            (mesh.material as THREE.MeshPhysicalMaterial).normalMap =
              origNormalMap;
          }
          const mat = mesh.material as THREE.MeshPhysicalMaterial;
          const texMap = textureMaps["plastic"];

          // Apply texture
          // Replace geometry with rounded box for bevels
          if (!mesh.userData.hasRoundedGeo && mesh.geometry) {
            mesh.geometry.computeBoundingBox();
            if (mesh.geometry.boundingBox) {
              const bbox = mesh.geometry.boundingBox;
              const size = new THREE.Vector3();
              bbox.getSize(size);
              const center = new THREE.Vector3();
              bbox.getCenter(center);

              // Create beveled box (1.5cm radius, 4 segments)
              const roundedGeo = new RoundedBoxGeometry(
                size.x,
                size.y,
                size.z,
                10,
                1.5,
              );
              roundedGeo.translate(center.x, center.y, center.z);

              // We must dispose the old geometry to prevent memory leaks
              mesh.geometry.dispose();
              mesh.geometry = roundedGeo;
              mesh.userData.hasRoundedGeo = true;
            }
          }

          // Generate triplanar UVs dynamically in local space!
          generateTriplanarUVs(mesh, 1.0, true);

          // Apply textures
          mat.map = texMap.map;
          mat.roughnessMap = texMap.roughOrAo;
          // mat.normalMap = texMap.normalMap;
          // mat.color.set("white");

          // Ensure textures can tile infinitely for the tri-planar shader
          if (!mat.userData.scaledTex) {
            [mat.map, mat.roughnessMap, mat.normalMap].forEach((t) => {
              if (t) {
                t.wrapS = THREE.RepeatWrapping;
                t.wrapT = THREE.RepeatWrapping;
              }
            });
            mat.userData.scaledTex = true;
          }

          const needsShaderUpdate =
            mat.userData.lastTexture !== "plastic_rack_tri";
          if (needsShaderUpdate) {
            mat.userData.lastTexture = "plastic_rack_tri";
            mat.onBeforeCompile = (shader: any) => {
              shader.uniforms.uTriScale = {
                value: 1,
              };

              shader.vertexShader = shader.vertexShader.replace(
                "#include <common>",
                `
  #include <common>
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  `,
              );

              shader.vertexShader = shader.vertexShader.replace(
                "#include <worldpos_vertex>",
                `
  #include <worldpos_vertex>
  vWorldPos = transformed; // Use local coordinates
  vWorldNormal = normalize(objectNormal); // Use local normals
  `,
              );

              shader.fragmentShader = shader.fragmentShader.replace(
                "#include <common>",
                `
  #include <common>
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  uniform float uTriScale;

  vec4 tri(sampler2D tex, vec3 p, vec3 n) {
    vec3 b = abs(normalize(n));
    b /= (b.x + b.y + b.z);
    vec4 x = texture2D(tex, p.zy * uTriScale);
    vec4 y = texture2D(tex, p.zx * uTriScale);
    vec4 z = texture2D(tex, p.yx * uTriScale);
    return x * b.x + y * b.y + z * b.z;
  }
  `,
              );

              shader.fragmentShader = shader.fragmentShader.replace(
                "#include <map_fragment>",
                `
  #ifdef USE_MAP
    vec4 texelColor = tri(map, vWorldPos, vWorldNormal);
    texelColor = sRGBTransferEOTF(texelColor);
    diffuseColor.rgb *= texelColor.rgb;
  #endif
  `,
              );

              shader.fragmentShader = shader.fragmentShader.replace(
                "#include <normal_fragment_maps>",
                `
  #ifdef USE_NORMALMAP
    vec3 tnormal = tri(normalMap, vWorldPos, vWorldNormal).xyz * 2.0 - 1.0;
    tnormal.xy *= 0.3 * normalScale.xy; // Soften the normal map to look natural

    // Construct artificial world-space TBN
    vec3 wNormal = normalize(vWorldNormal);
    vec3 wUp = abs(wNormal.y) < 0.999 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    vec3 wTangent = normalize(cross(wUp, wNormal));
    vec3 wBitangent = cross(wNormal, wTangent);
    mat3 wTBN = mat3(wTangent, wBitangent, wNormal);
    
    vec3 perturbedWorldNormal = normalize(wTBN * tnormal);
    
    // Convert to view space
    normal = normalize(mat3(viewMatrix) * perturbedWorldNormal);
  #endif
                `,
              );

              shader.fragmentShader = shader.fragmentShader.replace(
                "#include <roughnessmap_fragment>",
                `
  float roughnessFactor = roughness;
  #ifdef USE_ROUGHNESSMAP
    vec4 texelRoughness = tri(roughnessMap, vWorldPos, vWorldNormal);
    roughnessFactor *= texelRoughness.g;
  #endif
  `,
              );
            };
            mat.needsUpdate = true;
          }
        }
      });
    }
  }, [
    staticScene,
    rotatableScene,
    config.partTextures,
    config.partPatterns,
    config.selectedModel,
    config.trouserTexture,
    config.trouserColor,
    config.pathTracer,
    loadedTextures,
  ]); // =======================
  // Reset Rotation
  // =======================

  useEffect(() => {
    rotationRef.current = {
      x: 0,
      y: 0,
    };
    currentRotationYRef.current = 0;

    if (rotatableScene) {
      rotatableScene.quaternion.set(0, 0, 0, 1);
    }
  }, [config.selectedModel, rotatableScene, rotationRef]);

  // Return to front-facing rotation along the shortest path when ambientSpin is turned off
  useEffect(() => {
    if (!config.ambientSpin) {
      const wrapped =
        ((rotationRef.current.y % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const shortest = wrapped > Math.PI ? wrapped - Math.PI * 2 : wrapped;

      rotationRef.current.y = shortest;
      currentRotationYRef.current = shortest;

      rotationRef.current.y = 0;
    }
  }, [config.ambientSpin, rotationRef]);

  // Effect: Initialize Cloth Simulators
  useEffect(() => {
    if (!rotatableScene) return;

    // Temporarily set wrapper scale to 1,1,1 to ensure correct world space dimensions for physics initialization
    const tempScale = new THREE.Vector3();
    if (wrapperRef.current) {
      tempScale.copy(wrapperRef.current.scale);
      wrapperRef.current.scale.set(1, 1, 1);
      wrapperRef.current.updateMatrixWorld(true);
    }

    const simulators: VerletClothSimulator[] = [];
    const mannequin =
      rotatableScene.getObjectByName("Model") ||
      rotatableScene.getObjectByName("polySurface21_DUMMY_0");

    rotatableScene.traverse((child) => {
      if ((child as any).isMesh) {
        const mesh = child as THREE.Mesh;
        const isCloth =
          mesh.name === "T-shirt_mainbody" ||
          mesh.name === "T-shirt_sleeves" ||
          mesh.name === "BAJU_BAJU_TEX_0";

        if (isCloth && mesh.geometry) {
          // Clone the geometry so physics simulation changes don't corrupt the cached GLTF geometry
          if (!mesh.userData.isGeoCloned) {
            mesh.geometry = mesh.geometry.clone();
            mesh.userData.isGeoCloned = true;
          }
          const isTshirt = mesh.name === "T-shirt_mainbody" || mesh.name === "T-shirt_sleeves";
          // Maximum stiffness settings for the T-shirt (shapeStiffness = 500.0, iterations = 12, damping = 0.40)
          const shapeStiffness = isTshirt ? 500.0 : 22.0;
          const constraintIterations = isTshirt ? 12 : 3;
          const damping = isTshirt ? 0.40 : 0.85;

          simulators.push(
            new VerletClothSimulator(
              mesh,
              mannequin as THREE.Mesh,
              shapeStiffness,
              constraintIterations,
              damping,
              null
            )
          );
        }
      }
    });

    // Weld shared seams between T-shirt main body and sleeves to prevent tearing
    const mainbodySim = simulators.find((s) => s.getMeshName() === "T-shirt_mainbody");
    const sleevesSim = simulators.find((s) => s.getMeshName() === "T-shirt_sleeves");
    if (mainbodySim && sleevesSim) {
      VerletClothSimulator.pinSharedSeams(mainbodySim, sleevesSim);
    }

    simulatorsRef.current = simulators;

    // Restore wrapper scale
    if (wrapperRef.current) {
      wrapperRef.current.scale.copy(tempScale);
      wrapperRef.current.updateMatrixWorld(true);
    }

    return () => {
      simulators.forEach((s) => s.reset());
      simulatorsRef.current = [];
    };
  }, [rotatableScene]);

  // =======================
  // Animation
  // =======================

  useFrame((state, delta) => {
    if (!wrapperRef.current) {
      return;
    }

    // Optimization 8: Skip scale damping once settled to avoid per-frame math & updates
    const scale = wrapperRef.current.scale;
    if (Math.abs(scale.x - targetScale) > 0.001) {
      if (config.pathTracer) {
        scale.set(targetScale, targetScale, targetScale);
      } else {
        easing.damp(scale, "x", targetScale, 0.2, delta);
        easing.damp(scale, "y", targetScale, 0.2, delta);
        easing.damp(scale, "z", targetScale, 0.2, delta);
      }
    }

    // Ambient spin is paused in path tracer mode: continuous rotation increments rotationRef
    // every frame, which ConfiguratorCanvas detects as a scene change and calls reset() every
    // frame — permanently wiping sample accumulation and leaving the canvas blank.
    if (config.ambientSpin && !config.pathTracer) {
      rotationRef.current.y += delta * 0.15;
    }

    // Optimize: Only damp and apply rotation if ambient spin is running or the rotation has not settled
    if (rotatableScene) {
      const isSpinning = config.ambientSpin;
      const diff = Math.abs(
        currentRotationYRef.current - rotationRef.current.y,
      );
      if (isSpinning || diff > 0.0001) {
        if (config.pathTracer) {
          currentRotationYRef.current = rotationRef.current.y;
        } else {
          easing.damp(
            currentRotationYRef,
            "current",
            rotationRef.current.y,
            0.15,
            delta,
          );
        }

        _rotQY.setFromAxisAngle(_worldYAxis, currentRotationYRef.current);
        rotatableScene.quaternion.copy(_rotQY);
      }
    }

    // Step simulators only when the scale has settled near 1 and path tracer is disabled
    const currentScale = wrapperRef.current.scale;
    let maxSimulationMovement = 0;
    if (currentScale.x > 0.95 && !config.pathTracer) {
      simulatorsRef.current.forEach((simulator) => {
        const movement = simulator.update(delta);
        if (movement > maxSimulationMovement) {
          maxSimulationMovement = movement;
        }
      });
    }

    if (config.pathTracer) {
      if (maxSimulationMovement > 0.002) {
        const now = performance.now();
        if (now - lastPTUpdateTime.current > 200) { // Throttle updates during active movement to 5 FPS
          update();
          reset();
          lastPTUpdateTime.current = now;
          pendingPTUpdate.current = false;
        } else {
          pendingPTUpdate.current = true;
        }
      } else if (pendingPTUpdate.current) {
        // Cloth has settled, apply the final update
        update();
        reset();
        pendingPTUpdate.current = false;
        lastPTUpdateTime.current = performance.now();
      }
    }
  });

  // =======================
  // Find Shirt Mesh
  // =======================

  const shirtMesh = useMemo<Mesh | null>(() => {
    let mesh: Mesh | null = null;

    rotatableScene.traverse((child) => {
      if ((child as any).isMesh && child.name === "T-shirt_mainbody") {
        mesh = child as Mesh;
      }
    });

    return mesh;
  }, [rotatableScene]);

  // =======================
  // Decal Props (raycast)
  // =======================

  const decalProps = useMemo(() => {
    if (!shirtMesh) return null;

    // Update the entire rotatable hierarchy world matrices
    rotatableScene.updateWorldMatrix(true, true);

    // Use localCamPos and localChestTarget directly - no refs needed
    const camPos = localCamPos.clone().add(rotatableScene.position);
    const chestTarget = localChestTarget.clone().add(rotatableScene.position);

    const raycaster = new THREE.Raycaster();
    const dir = new Vector3().subVectors(chestTarget, camPos).normalize();
    raycaster.set(camPos, dir);

    const intersects = raycaster.intersectObject(shirtMesh, true);

    if (intersects.length > 0) {
      const hit = intersects[0];
      const localPos = shirtMesh.worldToLocal(hit.point.clone());

      // Build orthonormal basis so the decal stays upright
      const localNormal = hit.face
        ? hit.face.normal.clone()
        : new THREE.Vector3(1, 0, 0);

      const zAxis = localNormal.clone().normalize();
      const up = new THREE.Vector3(0, 1, 0);
      const xAxis = new THREE.Vector3();
      if (Math.abs(zAxis.dot(up)) > 0.99) {
        xAxis.set(1, 0, 0);
      } else {
        xAxis.crossVectors(up, zAxis).normalize();
      }
      const yAxis = new THREE.Vector3().crossVectors(zAxis, xAxis).normalize();
      const m = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
      const rotation = new THREE.Euler().setFromRotationMatrix(m);
      rotation.z -= Math.PI / 2;

      return {
        position: [localPos.x, localPos.y, localPos.z] as [
          number,
          number,
          number,
        ],
        rotation: [rotation.x, rotation.y, rotation.z] as [
          number,
          number,
          number,
        ],
        scale: [200, 200, 200] as [number, number, number],
      };
    }

    // Fallback: shoot from the back of the shirt toward the front
    // (handles back-face culling on front-ray miss)
    const backOrigin = new Vector3(
      chestTarget.x - dir.x * 2,
      chestTarget.y - dir.y * 2,
      chestTarget.z - dir.z * 2,
    );
    raycaster.set(backOrigin, dir.clone().negate());
    const backHits = raycaster.intersectObject(shirtMesh, true);

    if (backHits.length > 0) {
      const hit = backHits[0];
      const localPos = shirtMesh.worldToLocal(hit.point.clone());
      const localNormal = hit.face
        ? hit.face.normal.clone().negate()
        : new THREE.Vector3(0, 0, 1);
      const zAxis = localNormal.normalize();
      const up = new THREE.Vector3(0, 1, 0);
      const xAxis = new THREE.Vector3();
      if (Math.abs(zAxis.dot(up)) > 0.99) xAxis.set(1, 0, 0);
      else xAxis.crossVectors(up, zAxis).normalize();
      const yAxis = new THREE.Vector3().crossVectors(zAxis, xAxis).normalize();
      const m = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
      const rotation = new THREE.Euler().setFromRotationMatrix(m);
      rotation.z -= Math.PI / 2;
      return {
        position: [localPos.x, localPos.y, localPos.z] as [
          number,
          number,
          number,
        ],
        rotation: [rotation.x, rotation.y, rotation.z] as [
          number,
          number,
          number,
        ],
        scale: [200, 200, 200] as [number, number, number],
      };
    }

    // Ultimate fallback: place at shirt mesh local-space centre
    const box = new Box3().setFromObject(shirtMesh);
    const center = new Vector3();
    box.getCenter(center);
    const localCenter = shirtMesh.worldToLocal(center.clone());
    return {
      position: [localCenter.x, localCenter.y, localCenter.z] as [
        number,
        number,
        number,
      ],
      rotation: [0, 0, 0] as [number, number, number],
      scale: [200, 200, 200] as [number, number, number],
    };
  }, [shirtMesh, rotatableScene, localCamPos, localChestTarget]);


  // Sync the pathtracer materials after colors/textures/patterns/decals have been updated.
  // We call pathtracer.updateMaterials() but override reset() with a no-op to allow the new materials to
  // temporally blend/fade over existing samples instead of resetting the entire canvas.
  useEffect(() => {
    if (config.pathTracer && pathtracer) {
      const ptAny = pathtracer as any;
      const originalReset = ptAny.reset;
      ptAny.reset = () => {};
      try {
        pathtracer.updateMaterials();
      } finally {
        ptAny.reset = originalReset;
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    config.mainColor,
    config.accentColor,
    config.cushionColor,
    config.partColors,
    config.partTextures,
    config.partPatterns,
    config.trouserColor,
    config.trouserTexture,
    config.selectedDecal,
    pathtracer,
  ]);

  // Sync geometry changes (swapping selected model between shirt and kaftan) which requires a BVH rebuild.
  useEffect(() => {
    if (config.pathTracer) {
      update();
    }
  }, [config.selectedModel, config.pathTracer, update]);

  return (
    <group ref={wrapperRef} scale={0}>
      {/* Static Scene */}

      <primitive object={staticScene} dispose={null} />

      {/* Rotatable Model */}

      <primitive object={rotatableScene} dispose={null} />

      {/* Decal */}

      {activeDecalTexture &&
        shirtMesh &&
        decalProps &&
        createPortal(
          <Decal
            position={decalProps.position}
            rotation={decalProps.rotation}
            scale={decalProps.scale}
            depthTest
          >
            <meshPhysicalMaterial
              map={activeDecalTexture}
              transparent
              polygonOffset
              polygonOffsetFactor={-4}
              depthWrite={false}
              toneMapped={false}
            />
          </Decal>,

          shirtMesh,
        )}
    </group>
  );
}
