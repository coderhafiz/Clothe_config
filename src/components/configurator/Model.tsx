"use client";

import { useRef, useEffect, useMemo } from "react";

import {
  useFrame,
  useThree,
  useLoader,
  createPortal,
} from "@react-three/fiber";

import {
  useGLTF,
  useTexture,
  Decal,
} from "@react-three/drei";

import { easing } from "maath";

import * as THREE from "three";

import {
  Mesh,
  Box3,
  Vector3,
  Group,
  WebGLRenderer,
  RepeatWrapping,
} from "three";

import {
  DRACOLoader,
  KTX2Loader,
  GLTFLoader,
} from "three-stdlib";




// Pre-allocated helpers for per-frame quaternion rotation (avoids GC pressure)
const _rotQY = new THREE.Quaternion();
const _worldYAxis = new THREE.Vector3(0, 1, 0);

// =======================
// Types
// =======================

export interface ConfigState {
  mainColor: string;
  accentColor: string;
  cushionColor: string;
  selectedModel: string;
  lightIntensity: number;
  partColors: Record<
    string,
    string
  >;
  selectedTexture: string;
  selectedDecal: string;
  ambientSpin: boolean;
}

export const TEXTURES = [
  {
    id: "none",
    name:
      "Solid Fabric",
  },

  {
    id: "linen",
    name:
      "Rough Linen",
  },

  {
    id: "velvet",
    name:
      "Luxe Velvet",
  },

  {
    id: "leather",
    name:
      "Street Leather",
  },
];

export const DECALS = [
  {
    id: "none",
    name:
      "Clean Solid",
  },

  {
    id: "luxi",
    name:
      "LUXI Studio Logo",
  },

  {
    id: "graphic",
    name:
      "Streetwear Print",
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

  materialType:
  string;
}

export const MODELS: ModelInfo[] =
  [
    {
      id: "shirt",

      name:
        "LUXI Signature Tee",

      description:
        "Premium heavy-weight organic cotton tee",

      price: 85,

      url:
        "/Cloth_models/clothe_mockup_3.glb",

      type:
        "glb",

      scale:
        1,

      rotationX:
        0,

      rotationY:
        0,

      parts: [
        {
          id:
            "T-shirt_mainbody",

          name:
            "Fabric Body",
        },

        {
          id:
            "T-shirt_sleeves",

          name:
            "Fabric Sleeves",
        },
      ],

      materialType:
        "Heavy Cotton",
    },
  ];



// =======================
// Texture Paths
// =======================

const TEXTURE_PATHS:
  Record<
    string,
    Record<
      string,
      string
    >
  > = {
  leather: {
    map:
      "/textures/leather/diffuse.ktx2",

    normalMap:
      "/textures/leather/normal.ktx2",

    roughnessMap:
      "/textures/leather/roughness.ktx2",
  },

  linen: {
    map:
      "/textures/linen/diffuse.ktx2",

    normalMap:
      "/textures/linen/normal.ktx2",

    aoMap:
      "/textures/linen/arm.ktx2",
  },

  velvet: {
    map:
      "/textures/velvet/diffuse.ktx2",

    normalMap:
      "/textures/velvet/normal.ktx2",

    aoMap:
      "/textures/velvet/arm.ktx2",
  },
};

let dracoLoader:
  DRACOLoader |
  null =
  null;// =======================
// Draco Loader
// =======================

function getDracoLoader() {
  if (!dracoLoader) {
    dracoLoader =
      new DRACOLoader();

    dracoLoader.setDecoderPath(
      "https://www.gstatic.com/draco/versioned/decoders/1.5.7/"
    );
  }

  return dracoLoader;
}



// =======================
// KTX2 Loader
// =======================

function getKTX2Loader(
  gl: WebGLRenderer
) {
  const g =
    globalThis as unknown as {
      _ktx2Loader?: KTX2Loader;
    };

  if (!g._ktx2Loader) {
    const loader =
      new KTX2Loader();

    loader.setTranscoderPath(
      "/basis/"
    );

    loader.detectSupport(
      gl
    );

    g._ktx2Loader =
      loader;
  }

  return g._ktx2Loader;
}



// =======================
// Setup Loaders
// =======================

export function setupLoaders(
  loader: GLTFLoader,
  gl: WebGLRenderer
) {
  loader.setDRACOLoader(
    getDracoLoader()
  );

  loader.setKTX2Loader(
    getKTX2Loader(gl)
  );
}



// =======================
// Preload Models
// =======================

export function PreloadModels() {
  const { gl } =
    useThree();

  useEffect(() => {
    MODELS.forEach(
      (model) => {
        useGLTF.preload(
          model.url,
          undefined,
          undefined,
          (loader) =>
            setupLoaders(
              loader as GLTFLoader,
              gl
            )
        );
      }
    );
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
  }, [gl]);

  return null;
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

  rotationRef:
  React.MutableRefObject<{
    x: number;
    y: number;
  }>;

  onFirstPaint?: () => void;
}) {
  const { gl } =
    useThree();

  const wrapperRef =
    useRef<Group>(
      null!
    );

  const currentRotationYRef = useRef(0);

  const modelInfo =
    MODELS.find(
      (m) =>
        m.id ===
        config.selectedModel
    ) || MODELS[0];



  // =======================
  // Load GLTF
  // =======================

  const gltfResult =
    useGLTF(
      modelInfo.url,
      undefined,
      undefined,
      (loader) =>
        setupLoaders(
          loader as GLTFLoader,
          gl
        )
    );



  // =======================
  // Load Decal Textures
  // =======================

  const luxiLogo =
    useTexture(
      "/clothes/luxi_logo.svg"
    );

  const graphicPrint =
    useTexture(
      "/clothes/graphic.png"
    );

  useEffect(() => {
    if (onFirstPaint) {
      onFirstPaint();
    }
  }, [onFirstPaint]);

  useEffect(() => {
    if (luxiLogo) {
      luxiLogo.colorSpace =
        THREE.SRGBColorSpace;

      luxiLogo.needsUpdate =
        true;
    }

    if (graphicPrint) {
      graphicPrint.colorSpace =
        THREE.SRGBColorSpace;

      graphicPrint.needsUpdate =
        true;
    }
  }, [
    luxiLogo,
    graphicPrint,
  ]);



  // =======================
  // Active Decal
  // =======================

  const activeDecalTexture =
    useMemo(() => {
      if (
        config.selectedDecal ===
        "luxi"
      ) {
        return luxiLogo;
      }

      if (
        config.selectedDecal ===
        "graphic"
      ) {
        return graphicPrint;
      }

      return null;
    }, [
      config.selectedDecal,
      luxiLogo,
      graphicPrint,
    ]);// =======================
  // Texture Loading
  // =======================

  const hasTexture =
    config.selectedTexture !==
    "none";

  const textureFiles =
    useMemo(() => {
      if (
        !hasTexture
      ) {
        return [];
      }

      const p =
        TEXTURE_PATHS[
        config
          .selectedTexture
        ];

      return [
        p.map,
        p.normalMap,
        p.roughnessMap ||
        p.aoMap,
      ].filter(
        Boolean
      );
    }, [
      config.selectedTexture,
      hasTexture,
    ]);

  const loadedTextures =
    useLoader(
      KTX2Loader,
      textureFiles,
      (
        loader
      ) => {
        loader.setTranscoderPath(
          "/basis/"
        );

        loader.detectSupport(
          gl
        );
      }
    );



  // =======================
  // Build Scene
  // =======================

  const {
    staticScene,
    rotatableScene,
    targetScale,
    localCamPos,
    localChestTarget,
  } =
    useMemo(() => {
      const root =
        gltfResult.scene.clone();

      root.rotation.x =
        modelInfo.rotationX ||
        0;

      root.rotation.y =
        modelInfo.rotationY ||
        0;

      root.rotation.z =
        modelInfo.rotationZ ||
        0;

      root.scale.setScalar(
        1
      );

      root.position.set(
        0,
        0,
        0
      );



      //---------------------------------
      // Traverse
      //---------------------------------

      root.traverse(
        (
          child
        ) => {
          if (
            child.name === "Area" ||
            child.name === "Area.001" ||
            child.name === "Plane" ||
            child.name === "platform" ||
            child.name === "Cylinder"
          ) {
            child.visible = false;
          }

          if (
            (
              child as any
            ).isMesh
          ) {
            const mesh =
              child as Mesh;

            const configurable =
              modelInfo.parts.some(
                (
                  p
                ) =>
                  p.id ===
                  mesh.name
              );

            if (
              configurable
            ) {
              mesh.userData.partId =
                mesh.name;
            }

            //---------------------------------
            // Clone materials
            //---------------------------------

            if (
              Array.isArray(
                mesh.material
              )
            ) {
              mesh.material =
                mesh.material.map(
                  (
                    m: any
                  ) =>
                    m?.isMaterial
                      ? m.clone()
                      : m
                );
            }

            else if (
              mesh.material &&
              (
                mesh.material as any
              )
                .isMaterial
            ) {
              mesh.material =
                mesh.material.clone();
            }
          }
        }
      );



      //---------------------------------
      // Sync trouser panel textures
      // The GLB bakes an image map onto Trousers_backPanel but not onto
      // Trouser_frontPanel (a Blender export inconsistency).  Copy the back
      // panel's base-color map to the front panel so both look identical.
      //---------------------------------

      {
        let backMap: THREE.Texture | null = null;

        // Pass 1 — grab the back panel's baked map
        root.traverse((child) => {
          if (child.name === "Trousers_backPanel" && (child as any).isMesh) {
            const mat = (child as Mesh).material as THREE.MeshStandardMaterial;
            if (mat?.map) backMap = mat.map;
          }
        });

        // Pass 2 — assign it to the front panel
        if (backMap) {
          root.traverse((child) => {
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
      // Pivot
      //---------------------------------

      root.updateMatrixWorld(
        true
      );

      const pivot =
        new Vector3();

      const mannequin =
        root.getObjectByName(
          "Model"
        );

      if (
        mannequin
      ) {
        mannequin.getWorldPosition(
          pivot
        );
      }

      else {
        pivot.set(
          -0.612,
          -0.4519,
          -0.3159
        );
      }



      //---------------------------------
      // Rotation Group
      //---------------------------------

      const rotGroup =
        new THREE.Group();

      rotGroup.name =
        "rotatableGroup";

      rotGroup.position.copy(
        pivot
      );

      // clothe_mockup_3.glb exports a clean "mannequin_present" group that
      // contains exactly: Model (mannequin body), platform (stand), shirt
      // (T-shirt meshes), Trouser meshes.  The new file wraps everything under
      // a top-level "Scene Collection" node, so a simple position.sub(pivot)
      // offset would mis-position the group — use THREE's attach() instead.
      // attach() re-derives the correct local transform for any intermediate
      // parent offsets, preserving the node's world-space position exactly.

      // Temporarily parent rotGroup to root so it gets a valid matrixWorld
      // before attach() uses it to compute the relocation transform.
      root.add(rotGroup);
      root.updateMatrixWorld(true);

      const mannequinGroup =
        root.getObjectByName("mannequin_present");

      if (mannequinGroup) {
        // attach() moves mannequinGroup into rotGroup while keeping its
        // world position/rotation/scale identical.
        rotGroup.attach(mannequinGroup);
      } else {
        // Fallback for any future GLB that doesn't use the mannequin_present
        // naming: walk up from a known mesh until we find it.
        root.traverse((child) => {
          if (child.name === "T-shirt_mainbody") {
            let current: THREE.Object3D = child;
            while (
              current.parent &&
              current.parent !== root &&
              current.name !== "mannequin_present"
            ) {
              current = current.parent;
            }
            if (current.name === "mannequin_present") {
              rotGroup.attach(current);
            }
          }
        });
      }

      // Detach rotGroup from root — it is rendered as a sibling <primitive>
      root.remove(rotGroup);

      // Find shirt mesh to compute center in world coordinates at default rotation
      let tempShirtMesh: any = null;
      rotGroup.traverse((child) => {
        if ((child as any).isMesh && child.name === "T-shirt_mainbody") {
          tempShirtMesh = child;
        }
      });

      const center = new Vector3();
      if (tempShirtMesh) {
        tempShirtMesh.updateWorldMatrix(true, false);
        const box = new Box3().setFromObject(tempShirtMesh);
        box.getCenter(center);
      } else {
        // Fallback center if mesh is not found
        center.set(-0.612, -0.4519, -0.3159);
      }

      const calculatedLocalCamPos = new THREE.Vector3(0.2586659, 0.0727528, -0.232007).sub(pivot);
      const calculatedLocalChestTarget = new THREE.Vector3(center.x + 0.02, center.y + 0.03, center.z).sub(pivot);

      return {
        staticScene: root,
        rotatableScene: rotGroup,
        targetScale: 1,
        localCamPos: calculatedLocalCamPos,
        localChestTarget: calculatedLocalChestTarget,
      };
    }, [
      gltfResult,
      modelInfo,
    ]);



  // =======================
  // Entrance Animation
  // =======================

  useEffect(() => {
    if (
      wrapperRef.current
    ) {
      wrapperRef.current.scale.set(
        0,
        0,
        0
      );
    }
  }, [
    config.selectedModel,
  ]);// =======================
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
        const color = config.partColors[name];
        mat.color.set(color || config.mainColor);
        mat.needsUpdate = true;
      }
    });
  }, [rotatableScene, config.partColors, config.mainColor]);

  // Effect: Textures & Triplanar Shader
  useEffect(() => {
    let map: THREE.Texture | null = null;
    let normalMap: THREE.Texture | null = null;
    let roughOrAo: THREE.Texture | null = null;

    const textures = Array.isArray(loadedTextures)
      ? loadedTextures
      : [loadedTextures];

    if (hasTexture && textures.length) {
      const p = TEXTURE_PATHS[config.selectedTexture];
      let i = 0;
      if (p.map) {
        map = textures[i++];
      }
      if (p.normalMap) {
        normalMap = textures[i++];
      }
      if (p.roughnessMap || p.aoMap) {
        roughOrAo = textures[i++];
      }

      [map, normalMap, roughOrAo].forEach((tex) => {
        if (tex) {
          tex.wrapS = RepeatWrapping;
          tex.wrapT = RepeatWrapping;
        }
      });
    }

    Object.entries(partMaterialsRef.current).forEach(([, mat]) => {
      if (!mat) return;

      mat.roughness = config.selectedTexture === "leather" ? 0.4 : 0.8;
      mat.metalness = config.selectedTexture === "leather" ? 0.1 : 0;

      if (hasTexture) {
        mat.map = map;
        mat.normalMap = normalMap;

        if (TEXTURE_PATHS[config.selectedTexture].roughnessMap) {
          mat.roughnessMap = roughOrAo;
          mat.aoMap = null;
        } else {
          mat.aoMap = roughOrAo;
          mat.roughnessMap = null;
        }

        // Optimization 7: prevent unnecessary shader recompilation
        const needsShaderUpdate = mat.userData.lastTexture !== config.selectedTexture;
        if (needsShaderUpdate) {
          mat.userData.lastTexture = config.selectedTexture;
          mat.onBeforeCompile = (shader: any) => {
            shader.uniforms.uTriScale = {
              value: config.selectedTexture === "leather" ? 0.0006 : 0.001,
            };

            shader.vertexShader = shader.vertexShader.replace(
              "#include <common>",
              `
#include <common>
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
`
            );

            shader.vertexShader = shader.vertexShader.replace(
              "#include <worldpos_vertex>",
              `
#include <worldpos_vertex>

vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vWorldNormal = normalize(mat3(modelMatrix) * normal);
`
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
`
            );

            shader.fragmentShader = shader.fragmentShader.replace(
              "#include <map_fragment>",
              `
#ifdef USE_MAP
vec4 tex = tri(map, vWorldPos, vWorldNormal);
diffuseColor.rgb *= tex.rgb;
#endif
`
            );
          };
          mat.needsUpdate = true;
        }
      } else {
        mat.map = null;
        mat.normalMap = null;
        mat.roughnessMap = null;
        mat.aoMap = null;

        const needsShaderUpdate = mat.userData.lastTexture !== "none";
        if (needsShaderUpdate) {
          mat.userData.lastTexture = "none";
          mat.onBeforeCompile = () => {};
          mat.needsUpdate = true;
        }
      }
    });
  }, [
    rotatableScene,
    config.selectedTexture,
    loadedTextures,
    hasTexture,
  ]);// =======================
  // Reset Rotation
  // =======================

  useEffect(() => {
    rotationRef.current = {
      x: 0,
      y: 0,
    };
    currentRotationYRef.current = 0;

    if (
      rotatableScene
    ) {
      rotatableScene.quaternion.set(0, 0, 0, 1);
    }
  }, [
    config.selectedModel,
    rotatableScene,
    rotationRef,
  ]);



  // Return to front-facing rotation along the shortest path when ambientSpin is turned off
  useEffect(() => {
    if (!config.ambientSpin) {
      const wrapped = ((rotationRef.current.y % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const shortest = wrapped > Math.PI ? wrapped - Math.PI * 2 : wrapped;

      rotationRef.current.y = shortest;
      currentRotationYRef.current = shortest;

      rotationRef.current.y = 0;
    }
  }, [config.ambientSpin, rotationRef]);



  // =======================
  // Animation
  // =======================

  useFrame(
    (
      state,
      delta
    ) => {
      if (
        !wrapperRef.current
      ) {
        return;
      }

      // Optimization 8: Skip scale damping once settled to avoid per-frame math & updates
      const scale = wrapperRef.current.scale;
      if (Math.abs(scale.x - targetScale) > 0.001) {
        easing.damp(scale, "x", targetScale, 0.2, delta);
        easing.damp(scale, "y", targetScale, 0.2, delta);
        easing.damp(scale, "z", targetScale, 0.2, delta);
      }

      if (config.ambientSpin) {
        rotationRef.current.y += delta * 0.15;
      }

      // Optimize: Only damp and apply rotation if ambient spin is running or the rotation has not settled
      if (rotatableScene) {
        const isSpinning = config.ambientSpin;
        const diff = Math.abs(currentRotationYRef.current - rotationRef.current.y);
        if (isSpinning || diff > 0.0001) {
          easing.damp(
            currentRotationYRef,
            "current",
            rotationRef.current.y,
            0.15,
            delta
          );

          _rotQY.setFromAxisAngle(_worldYAxis, currentRotationYRef.current);
          rotatableScene.quaternion.copy(_rotQY);
        }
      }
    }
  );



  // =======================
  // Find Shirt Mesh
  // =======================

  const shirtMesh =
    useMemo<
      Mesh |
      null
    >(() => {
      let mesh:
        Mesh |
        null =
        null;

      rotatableScene.traverse(
        (
          child
        ) => {
          if (
            (
              child as any
            ).isMesh &&
            child.name ===
            "T-shirt_mainbody"
          ) {
            mesh =
              child as Mesh;
          }
        }
      );

      return mesh;
    }, [
      rotatableScene,
    ]);



  // =======================
  // Decal Props (raycast)
  // =======================

  const decalProps =
    useMemo(() => {
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
        const localNormal = hit.face ? hit.face.normal.clone() : new THREE.Vector3(1, 0, 0);

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
          position: [localPos.x, localPos.y, localPos.z] as [number, number, number],
          rotation: [rotation.x, rotation.y, rotation.z] as [number, number, number],
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
          position: [localPos.x, localPos.y, localPos.z] as [number, number, number],
          rotation: [rotation.x, rotation.y, rotation.z] as [number, number, number],
          scale: [200, 200, 200] as [number, number, number],
        };
      }

      // Ultimate fallback: place at shirt mesh local-space centre
      const box = new Box3().setFromObject(shirtMesh);
      const center = new Vector3();
      box.getCenter(center);
      const localCenter = shirtMesh.worldToLocal(center.clone());
      return {
        position: [localCenter.x, localCenter.y, localCenter.z] as [number, number, number],
        rotation: [0, 0, 0] as [number, number, number],
        scale: [200, 200, 200] as [number, number, number],
      };
    }, [shirtMesh, rotatableScene, localCamPos, localChestTarget]);// =======================
  // Render
  // =======================

  return (
    <group
      ref={
        wrapperRef
      }
      scale={
        0
      }
    >
      {/* Static Scene */}

      <primitive
        object={
          staticScene
        }
        dispose={
          null
        }
      />



      {/* Rotatable Model */}

      <primitive
        object={
          rotatableScene
        }
        dispose={
          null
        }
      />



      {/* Decal */}

      {activeDecalTexture &&
        shirtMesh &&
        decalProps &&
        createPortal(
          <Decal
            position={
              decalProps.position
            }

            rotation={
              decalProps.rotation
            }

            scale={
              decalProps.scale
            }

            depthTest
          >
            <meshBasicMaterial
              map={
                activeDecalTexture
              }

              transparent

              polygonOffset

              polygonOffsetFactor={
                -4
              }

              depthWrite={
                false
              }

              toneMapped={
                false
              }
            />
          </Decal>,

          shirtMesh
        )}
    </group>
  );
}