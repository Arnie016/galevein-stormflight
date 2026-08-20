// Integration: import after sky/sea setup; create new HorizonDirector(scene, camera), call update(camera.position, S.t, TOD.day) once per frame after sky follows camera, and call setSize only if renderer pixel ratio changes.
import * as THREE from 'three';

const TAU = Math.PI * 2;

function seeded(index) {
  let value = (index + 1) * 0x9e3779b1;
  value ^= value >>> 16; value = Math.imul(value, 0x85ebca6b); value ^= value >>> 13;
  return (value >>> 0) / 4294967295;
}

export class HorizonDirector {
  constructor(scene, camera, options = {}) {
    if (!scene?.add || !camera?.isCamera) throw new TypeError('HorizonDirector requires a scene and camera.');
    this.scene = scene;
    this.camera = camera;
    this.near = options.near ?? 850;
    this.far = options.far ?? 3600;
    this.cameraFar = options.cameraFar ?? 9000;
    this.fogDensity = options.fogDensity ?? 0.00082;
    this.snap = options.snap ?? 400;
    this.silhouetteCount = options.silhouetteCount ?? 10;
    this.silhouetteHeightMul = options.silhouetteHeightMul ?? 1;
    this._hueShift = 0;
    this._emissivePulse = 0.12;
    this.root = new THREE.Group();
    this.root.name = 'DragonStorm_HorizonDirector';
    this.root.userData.visualOnly = true;
    const geometry = new THREE.ConeGeometry(1, 1, 7, 2);
    const material = new THREE.MeshStandardMaterial({ color: 0x20283a, roughness: .92, flatShading: true, fog: true });
    this.masses = new THREE.InstancedMesh(geometry, material, 30);
    this.masses.name = 'DragonStorm_HorizonMasses';
    this.masses.frustumCulled = false;
    this.root.add(this.masses);

    // Cheap distant floating-island silhouettes — one instanced plane ring, camera-facing.
    this._islandCount = 10;
    const islandGeo = new THREE.PlaneGeometry(1, 1, 1, 1);
    const islandMat = new THREE.MeshBasicMaterial({
      color: 0x1a2234, transparent: true, opacity: 0.72, fog: true, depthWrite: false, side: THREE.DoubleSide
    });
    this.islands = new THREE.InstancedMesh(islandGeo, islandMat, this._islandCount);
    this.islands.name = 'DragonStorm_SkySilhouettes';
    this.islands.frustumCulled = false;
    this.root.add(this.islands);
    this._islandData = Array.from({ length: this._islandCount }, (_, i) => ({
      angle: (i / this._islandCount) * TAU + seeded(i + 300) * 0.4,
      radius: 0.55 + seeded(i + 401) * 0.35,
      lift: 0.08 + seeded(i + 502) * 0.22,
      width: 120 + seeded(i + 603) * 280,
      height: 28 + seeded(i + 704) * 72,
      variant: Math.floor(seeded(i + 805) * 3)
    }));

    this.scene.add(this.root);
    this.matrix = new THREE.Matrix4();
    this.position = new THREE.Vector3();
    this.quaternion = new THREE.Quaternion();
    this.scale = new THREE.Vector3();
    this._lookAt = new THREE.Vector3();
    this._lastCellX = Infinity;
    this._lastCellZ = Infinity;
    this.update(new THREE.Vector3(), 0, 0);
  }

  applySkyPreset(preset = {}) {
    if (preset.fogDensity != null) this.fogDensity = preset.fogDensity;
    if (preset.horizonNear != null) this.near = preset.horizonNear;
    if (preset.horizonFar != null) this.far = preset.horizonFar;
    if (preset.silhouetteCount != null) this.silhouetteCount = preset.silhouetteCount;
    if (preset.silhouetteHeightMul != null) this.silhouetteHeightMul = preset.silhouetteHeightMul;
    if (preset.hueShift != null) this._hueShift = preset.hueShift;
    if (preset.emissivePulse != null) this._emissivePulse = preset.emissivePulse;
    this._skyPreset = preset;
    this._lastCellX = Infinity;
  }

  configureFog(sceneFog) {
    if (sceneFog?.isFogExp2) sceneFog.density = this.fogDensity;
    this.camera.far = this.cameraFar;
    this.camera.updateProjectionMatrix();
  }

  rebuild(center) {
    const baseX = Math.floor(center.x / this.snap) * this.snap;
    const baseZ = Math.floor(center.z / this.snap) * this.snap;
    const cap = Math.min(30, Math.max(12, Math.round(this.silhouetteCount * 0.55)));
    for (let index = 0; index < 30; index += 1) {
      if (index >= cap) {
        this.matrix.makeScale(0, 0, 0);
        this.masses.setMatrixAt(index, this.matrix);
        continue;
      }
      const random = seeded(index);
      const angle = index / cap * TAU + random * .22;
      const radius = this.near + random * (this.far - this.near);
      const width = 80 + seeded(index + 47) * 190;
      const height = (80 + seeded(index + 101) * 300) * this.silhouetteHeightMul;
      this.position.set(baseX + Math.cos(angle) * radius, height * .46 - 14, baseZ + Math.sin(angle) * radius);
      this.quaternion.setFromEuler(new THREE.Euler(0, angle + Math.PI * .5, 0));
      this.scale.set(width, height, width * (.55 + seeded(index + 211) * .55));
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.masses.setMatrixAt(index, this.matrix);
    }
    this.masses.instanceMatrix.needsUpdate = true;
  }

  _rebuildIslands(center, cameraPosition, time) {
    const active = Math.min(this._islandCount, Math.max(4, Math.round(this.silhouetteCount / 2.5)));
    const baseX = Math.floor(center.x / this.snap) * this.snap;
    const baseZ = Math.floor(center.z / this.snap) * this.snap;
    const camYaw = Math.atan2(
      cameraPosition.x - (baseX + center.x) * 0,
      cameraPosition.z - (baseZ + center.z) * 0
    );
    for (let i = 0; i < this._islandCount; i += 1) {
      if (i >= active) {
        this.matrix.makeScale(0, 0, 0);
        this.islands.setMatrixAt(i, this.matrix);
        continue;
      }
      const spec = this._islandData[i];
      const bob = Math.sin(time * 0.08 + i * 1.7) * 6;
      const radius = this.near * 0.92 + spec.radius * (this.far - this.near);
      const angle = spec.angle + camYaw * 0.02;
      const px = baseX + Math.cos(angle) * radius;
      const pz = baseZ + Math.sin(angle) * radius;
      const py = spec.lift * this.silhouetteHeightMul * 180 + bob + 40;
      this.position.set(px, py, pz);
      this._lookAt.set(cameraPosition.x, py * 0.85, cameraPosition.z);
      this.quaternion.setFromRotationMatrix(
        new THREE.Matrix4().lookAt(this.position, this._lookAt, new THREE.Vector3(0, 1, 0))
      );
      const w = spec.width * (0.85 + spec.variant * 0.12);
      const h = spec.height * this.silhouetteHeightMul * (1 + spec.variant * 0.08);
      this.scale.set(w, h, 1);
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.islands.setMatrixAt(i, this.matrix);
    }
    this.islands.instanceMatrix.needsUpdate = true;
    const pulse = 0.62 + this._emissivePulse * Math.sin(time * 0.15);
    this.islands.material.opacity = pulse;
  }

  update(cameraPosition, time = 0, dayAmount = 0) {
    if (!cameraPosition?.isVector3) return;
    const cellX = Math.floor(cameraPosition.x / this.snap);
    const cellZ = Math.floor(cameraPosition.z / this.snap);
    if (cellX !== this._lastCellX || cellZ !== this._lastCellZ) {
      this._lastCellX = cellX;
      this._lastCellZ = cellZ;
      this.rebuild(cameraPosition);
    }
    this._rebuildIslands(cameraPosition, cameraPosition, time);
    this.configureFog(this.scene.fog);
    const hue = 0.61 + dayAmount * 0.05 + (this._hueShift || 0);
    this.masses.material.color.setHSL(hue, 0.26, 0.18 + (1 - dayAmount) * 0.07);
    this.masses.material.emissive?.setHSL(0.68, 0.18, 0.008 + Math.sin(time * 0.15) * 0.003);
    this.islands.material.color.setHSL(hue + 0.02, 0.22, 0.14 + (1 - dayAmount) * 0.05);
  }

  getSnapshot() {
    return {
      cameraFar: this.cameraFar,
      fogDensity: this.fogDensity,
      instances: 30,
      islandInstances: this._islandCount,
      drawCalls: 2,
      visualOnly: true,
      skyPreset: this._skyPreset?.id ?? null
    };
  }

  dispose() {
    this.scene.remove(this.root);
    this.masses.geometry.dispose();
    this.masses.material.dispose();
    this.islands.geometry.dispose();
    this.islands.material.dispose();
  }
}
