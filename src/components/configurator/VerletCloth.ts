import * as THREE from "three";

interface Particle {
  pos: THREE.Vector3;          // Current position in World space
  oldPos: THREE.Vector3;       // Previous position in World space
  origLocalPos: THREE.Vector3; // Original position in Local space
  isPinned: boolean;
  closestMannequinPos?: THREE.Vector3;    // Closest mannequin vertex in mannequin local space
  closestMannequinNormal?: THREE.Vector3; // Closest mannequin normal in mannequin local space
}

interface Constraint {
  p1: number;
  p2: number;
  restLength: number;          // Distance in World space
}

export class VerletClothSimulator {
  private mesh: THREE.Mesh;
  private mannequinMesh?: THREE.Mesh;
  public particles: Particle[] = [];
  private constraints: Constraint[] = [];
  private shapeStiffness: number = 22.0;
  private constraintIterations: number = 3;
  private damping: number = 0.85;
  private maxDeviation: number | null = null;

  constructor(
    mesh: THREE.Mesh,
    mannequinMesh?: THREE.Mesh,
    shapeStiffness: number = 22.0,
    constraintIterations: number = 3,
    damping: number = 0.85,
    maxDeviation: number | null = null
  ) {
    this.mesh = mesh;
    this.mannequinMesh = mannequinMesh;
    this.shapeStiffness = shapeStiffness;
    this.constraintIterations = constraintIterations;
    this.damping = damping;
    this.maxDeviation = maxDeviation;
    this.initPhysics();
  }

  public getMeshName(): string {
    return this.mesh.name;
  }

  public static pinSharedSeams(sim1: VerletClothSimulator, sim2: VerletClothSimulator) {
    const pts1 = sim1.particles;
    const pts2 = sim2.particles;
    if (pts1.length === 0 || pts2.length === 0) return;

    const cellSize = 0.003;
    const grid = new Map<string, number[]>();

    for (let j = 0; j < pts2.length; j++) {
      const p = pts2[j].pos;
      const ix = Math.floor(p.x / cellSize);
      const iy = Math.floor(p.y / cellSize);
      const iz = Math.floor(p.z / cellSize);
      const key = `${ix},${iy},${iz}`;
      let cell = grid.get(key);
      if (!cell) {
        cell = [];
        grid.set(key, cell);
      }
      cell.push(j);
    }

    for (let i = 0; i < pts1.length; i++) {
      const p1 = pts1[i];
      const ix = Math.floor(p1.pos.x / cellSize);
      const iy = Math.floor(p1.pos.y / cellSize);
      const iz = Math.floor(p1.pos.z / cellSize);

      // Search all 27 cells (self + 26 neighbors) in sim2's grid
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dz = -1; dz <= 1; dz++) {
            const key = `${ix + dx},${iy + dy},${iz + dz}`;
            const cell = grid.get(key);
            if (!cell) continue;

            for (let k = 0; k < cell.length; k++) {
              const j = cell[k];
              const p2 = pts2[j];
              if (p1.pos.distanceToSquared(p2.pos) < 0.000009) {
                p1.isPinned = true;
                p2.isPinned = true;
              }
            }
          }
        }
      }
    }
  }

  private initPhysics() {
    const geometry = this.mesh.geometry;
    if (!geometry) return;

    const posAttr = geometry.attributes.position;
    if (!posAttr) return;

    const count = posAttr.count;
    const array = posAttr.array as Float32Array;

    // Update both world matrices so we can align their spaces correctly
    this.mesh.updateWorldMatrix(true, false);
    if (this.mannequinMesh) {
      this.mannequinMesh.updateWorldMatrix(true, false);
    }

    // 1. Initialize Particles in World Space
    this.particles = [];
    const localBoundingBox = new THREE.Box3();
    
    for (let i = 0; i < count; i++) {
      const localPos = new THREE.Vector3(
        array[i * 3],
        array[i * 3 + 1],
        array[i * 3 + 2]
      );
      localBoundingBox.expandByPoint(localPos);

      const worldPos = localPos.clone().applyMatrix4(this.mesh.matrixWorld);
      
      this.particles.push({
        pos: worldPos.clone(),
        oldPos: worldPos.clone(),
        origLocalPos: localPos.clone(),
        isPinned: false
      });
    }

    // 2. Identify Top Vertices to Pin (Shoulders / Collar) in local space
    const minY = localBoundingBox.min.y;
    const maxY = localBoundingBox.max.y;
    const height = maxY - minY;
    // Pin vertices in the top 12% of the bounding box
    const pinThresholdY = maxY - height * 0.12;

    this.particles.forEach((p) => {
      if (p.origLocalPos.y > pinThresholdY) {
        p.isPinned = true;
      }
    });

    // 3. Extract Unique Constraints (rest lengths in world space)
    this.constraints = [];
    const edgeKeySet = new Set<string>();

    const addUniqueConstraint = (a: number, b: number) => {
      if (a === b) return;
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      if (!edgeKeySet.has(key)) {
        edgeKeySet.add(key);
        const dist = this.particles[a].pos.distanceTo(this.particles[b].pos);
        this.constraints.push({
          p1: a,
          p2: b,
          restLength: dist
        });
      }
    };

    if (geometry.index) {
      const indexArr = geometry.index.array;
      for (let i = 0; i < indexArr.length; i += 3) {
        const a = indexArr[i];
        const b = indexArr[i + 1];
        const c = indexArr[i + 2];
        addUniqueConstraint(a, b);
        addUniqueConstraint(b, c);
        addUniqueConstraint(c, a);
      }
    } else {
      for (let i = 0; i < count; i += 3) {
        addUniqueConstraint(i, i + 1);
        addUniqueConstraint(i + 1, i + 2);
        addUniqueConstraint(i + 2, i);
      }
    }

    // Weld seams: add constraints between coincident vertices (UV seam splits) using 3D Spatial Hashing
    const seamCellSize = 0.003;
    const seamGrid = new Map<string, number[]>();
    for (let i = 0; i < count; i++) {
      const p = this.particles[i].pos;
      const ix = Math.floor(p.x / seamCellSize);
      const iy = Math.floor(p.y / seamCellSize);
      const iz = Math.floor(p.z / seamCellSize);
      const key = `${ix},${iy},${iz}`;
      let cell = seamGrid.get(key);
      if (!cell) {
        cell = [];
        seamGrid.set(key, cell);
      }
      cell.push(i);
    }

    const neighborOffsets = [
      [1, -1, -1], [1, -1, 0], [1, -1, 1],
      [1, 0, -1],  [1, 0, 0],  [1, 0, 1],
      [1, 1, -1],  [1, 1, 0],  [1, 1, 1],
      [0, 1, -1],  [0, 1, 0],  [0, 1, 1],
      [0, 0, 1]
    ];

    for (const [key, cellIndices] of seamGrid.entries()) {
      const parts = key.split(',');
      const ix = parseInt(parts[0], 10);
      const iy = parseInt(parts[1], 10);
      const iz = parseInt(parts[2], 10);

      const len = cellIndices.length;

      // 1. Check within the same cell
      for (let i = 0; i < len; i++) {
        const idxA = cellIndices[i];
        const posA = this.particles[idxA].pos;
        for (let j = i + 1; j < len; j++) {
          const idxB = cellIndices[j];
          const posB = this.particles[idxB].pos;
          if (posA.distanceToSquared(posB) < 0.000004) { // 2mm squared (0.002^2 = 0.000004)
            addUniqueConstraint(idxA, idxB);
          }
        }
      }

      // 2. Check neighboring cells
      for (let o = 0; o < neighborOffsets.length; o++) {
        const offset = neighborOffsets[o];
        const nx = ix + offset[0];
        const ny = iy + offset[1];
        const nz = iz + offset[2];
        const neighborKey = `${nx},${ny},${nz}`;
        const neighborIndices = seamGrid.get(neighborKey);
        if (!neighborIndices) continue;

        for (let i = 0; i < len; i++) {
          const idxA = cellIndices[i];
          const posA = this.particles[idxA].pos;
          for (let j = 0; j < neighborIndices.length; j++) {
            const idxB = neighborIndices[j];
            const posB = this.particles[idxB].pos;
            if (posA.distanceToSquared(posB) < 0.000004) {
              addUniqueConstraint(idxA, idxB);
            }
          }
        }
      }
    }

    // 4. Set Up Precise Mesh Colliders
    if (this.mannequinMesh) {
      const mqPosAttr = this.mannequinMesh.geometry.attributes.position;
      const mqNormAttr = this.mannequinMesh.geometry.attributes.normal;

      if (mqPosAttr && mqNormAttr) {
        const mqCount = mqPosAttr.count;
        const mqWorldMatrix = this.mannequinMesh.matrixWorld;

        // Cache mannequin vertices in world space for accurate initial proximity matching
        const mqWorldVertices: { 
          worldPos: THREE.Vector3; 
          localPos: THREE.Vector3; 
          localNorm: THREE.Vector3; 
        }[] = [];

        const mqGrid = new Map<string, number[]>();
        const mqCellSize = 0.05; // 5cm cell size

        for (let j = 0; j < mqCount; j++) {
          const lPos = new THREE.Vector3(mqPosAttr.getX(j), mqPosAttr.getY(j), mqPosAttr.getZ(j));
          const lNorm = new THREE.Vector3(mqNormAttr.getX(j), mqNormAttr.getY(j), mqNormAttr.getZ(j));
          const wPos = lPos.clone().applyMatrix4(mqWorldMatrix);
          
          mqWorldVertices.push({
            worldPos: wPos,
            localPos: lPos,
            localNorm: lNorm
          });

          const ix = Math.floor(wPos.x / mqCellSize);
          const iy = Math.floor(wPos.y / mqCellSize);
          const iz = Math.floor(wPos.z / mqCellSize);
          const key = `${ix},${iy},${iz}`;
          let cell = mqGrid.get(key);
          if (!cell) {
            cell = [];
            mqGrid.set(key, cell);
          }
          cell.push(j);
        }

        // For each cloth particle, find the closest mannequin vertex (using initial pose world space)
        this.particles.forEach((p) => {
          let minD2 = Infinity;
          let bestVertex = mqWorldVertices[0];
          let foundInGrid = false;

          const ix = Math.floor(p.pos.x / mqCellSize);
          const iy = Math.floor(p.pos.y / mqCellSize);
          const iz = Math.floor(p.pos.z / mqCellSize);

          // 1. Search in 27-cell neighborhood
          for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
              for (let dz = -1; dz <= 1; dz++) {
                const key = `${ix + dx},${iy + dy},${iz + dz}`;
                const cell = mqGrid.get(key);
                if (!cell) continue;

                for (let k = 0; k < cell.length; k++) {
                  const j = cell[k];
                  const mqV = mqWorldVertices[j];
                  const d2 = p.pos.distanceToSquared(mqV.worldPos);
                  if (d2 < minD2) {
                    minD2 = d2;
                    bestVertex = mqV;
                    foundInGrid = true;
                  }
                }
              }
            }
          }

          // 2. Fallback to brute force if not found in grid neighborhood
          if (!foundInGrid) {
            for (let j = 0; j < mqCount; j++) {
              const mqV = mqWorldVertices[j];
              const d2 = p.pos.distanceToSquared(mqV.worldPos);
              if (d2 < minD2) {
                minD2 = d2;
                bestVertex = mqV;
              }
            }
          }

          p.closestMannequinPos = bestVertex.localPos.clone();
          p.closestMannequinNormal = bestVertex.localNorm.clone().normalize();
        });
      }
    }
  }

  public update(delta: number): number {
    if (this.particles.length === 0) return 0;

    // Force update world matrices for the simulation tick
    this.mesh.updateWorldMatrix(true, false);
    if (this.mannequinMesh) {
      this.mannequinMesh.updateWorldMatrix(true, false);
    }

    // Cache start positions to compute maximum particle movement this frame
    const startPositions = this.particles.map((p) => p.pos.clone());

    // Sub-stepping for simulation stability
    const subSteps = 3;
    const clampedDelta = Math.min(delta, 0.03); 
    const dt = clampedDelta / subSteps;

    const invMatrix = new THREE.Matrix4().copy(this.mesh.matrixWorld).invert();

    for (let step = 0; step < subSteps; step++) {
      // 1. Verlet Integration Step with Restorative Shape-Matching Force
      this.particles.forEach((p) => {
        if (p.isPinned) {
          // Pinned vertices follow the mesh's animated world transformation perfectly
          p.pos.copy(p.origLocalPos.clone().applyMatrix4(this.mesh.matrixWorld));
          return;
        }

        const temp = p.pos.clone();
        
        // Target original design position in world space
        const targetWorldPos = p.origLocalPos.clone().applyMatrix4(this.mesh.matrixWorld);
        
        // Shape matching restorative spring force (pulls cloth back to its exact initial drape)
        const shapeSpringForce = targetWorldPos.sub(p.pos).multiplyScalar(this.shapeStiffness);
        
        // Verlet integration formula
        const velocity = p.pos.clone().sub(p.oldPos).multiplyScalar(this.damping); // Damping friction

        // Clamp velocity length to a maximum of 0.015 units per sub-step (approx 2.7m/s) to prevent physics explosion under force
        const maxVel = 0.015;
        const velLen = velocity.length();
        if (velLen > maxVel) {
          velocity.multiplyScalar(maxVel / velLen);
        }

        p.pos.add(velocity).addScaledVector(shapeSpringForce, dt * dt);

        // Clamp distance to target design position to prevent abnormal stretching if maxDeviation is set
        if (this.maxDeviation !== null) {
          const toTarget = p.pos.clone().sub(targetWorldPos);
          const distSq = toTarget.lengthSq();
          if (distSq > this.maxDeviation * this.maxDeviation) {
            const dist = Math.sqrt(distSq);
            p.pos.copy(targetWorldPos).addScaledVector(toTarget, this.maxDeviation / dist);
          }
        }

        p.oldPos.copy(temp);
      });

      // 2. Solve Mannequin Mesh Collisions (World Space)
      if (this.mannequinMesh) {
        const mqWorldMatrix = this.mannequinMesh.matrixWorld;

        this.particles.forEach((p) => {
          if (p.isPinned || !p.closestMannequinPos || !p.closestMannequinNormal) return;

          // Resolve surface point and normal vector in current world space
          const vWorld = p.closestMannequinPos.clone().applyMatrix4(mqWorldMatrix);
          const nWorld = p.closestMannequinNormal.clone().transformDirection(mqWorldMatrix);

          // Vector from mannequin surface point to cloth particle
          const disp = p.pos.clone().sub(vWorld);
          
          // Penetration depth along normal (positive = outside, negative = inside)
          const depth = disp.dot(nWorld);
          
          const minDist = 0.003; // Maintain 3mm hover distance outside mannequin surface

          if (depth < minDist) {
            // Push particle along surface normal to keep it outside mannequin mesh
            p.pos.addScaledVector(nWorld, minDist - depth);
          }
        });
      }

      // 3. Satisfy Distance Constraints (World Space)
      const constraintIterations = this.constraintIterations;
      for (let iter = 0; iter < constraintIterations; iter++) {
        this.constraints.forEach((c) => {
          const p1 = this.particles[c.p1];
          const p2 = this.particles[c.p2];

          const diff = p1.pos.clone().sub(p2.pos);
          const currentDist = diff.length();
          if (currentDist === 0) return;

          const error = currentDist - c.restLength;
          const correctionAmount = (error / currentDist) * 0.5;
          const correctionVec = diff.multiplyScalar(correctionAmount);

          if (!p1.isPinned) p1.pos.sub(correctionVec);
          if (!p2.isPinned) p2.pos.add(correctionVec);
        });
      }
    }

    // 4. Transform World Positions back to Local Space and write to BufferGeometry
    const geometry = this.mesh.geometry;
    const posAttr = geometry.attributes.position;
    const array = posAttr.array as Float32Array;

    let maxMovement = 0;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      const localPos = p.pos.clone().applyMatrix4(invMatrix);
      array[i * 3] = localPos.x;
      array[i * 3 + 1] = localPos.y;
      array[i * 3 + 2] = localPos.z;

      if (!p.isPinned) {
        const dist = p.pos.distanceTo(startPositions[i]);
        if (dist > maxMovement) {
          maxMovement = dist;
        }
      }
    }

    posAttr.needsUpdate = true;
    geometry.computeVertexNormals();

    return maxMovement;
  }

  public reset() {
    this.mesh.updateWorldMatrix(true, false);
    this.particles.forEach((p) => {
      const worldPos = p.origLocalPos.clone().applyMatrix4(this.mesh.matrixWorld);
      p.pos.copy(worldPos);
      p.oldPos.copy(worldPos);
    });
  }
}
