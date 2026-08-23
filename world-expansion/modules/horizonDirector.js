// Authored, world-anchored basin backdrop. The geometry is visual-only: gameplay
// collision remains in the bounded region and Crownfall proxy systems. Landscape
// placement never follows the camera or rebuilds around view direction.
import * as THREE from 'three';

const TAU = Math.PI * 2;
const PROFILE = 'bounded-reach-island-v3';
const LAYER_COUNTS = Object.freeze({ near: 24, mid: 34, far: 28, forest: 220, skyMonoliths: 6 });
const FIXED_WORLD_ANCHOR = Object.freeze({ x:-20, y:0, z:110 });
const FIXED_ROUTE_HEADING = Math.atan2(-700, 530);

function seeded(index) {
  let value = (index + 1) * 0x9e3779b1;
  value ^= value >>> 16; value = Math.imul(value, 0x85ebca6b); value ^= value >>> 13;
  return (value >>> 0) / 4294967295;
}

function ruggedPeakGeometry(radialSegments = 11, tiers = 6, seedOffset = 0) {
  const positions = [];
  const indices = [];
  for (let tier = 0; tier <= tiers; tier += 1) {
    const v = tier / tiers;
    const baseRadius = Math.pow(1 - v, .72) * (1 - .08 * Math.sin(v * Math.PI));
    for (let segment = 0; segment < radialSegments; segment += 1) {
      const angle = segment / radialSegments * TAU;
      const fracture = .78 + seeded(seedOffset + tier * 37 + segment * 11) * .38;
      const leanX = v * v * .15;
      const leanZ = -v * v * .08;
      positions.push(
        Math.cos(angle) * baseRadius * fracture + leanX,
        v,
        Math.sin(angle) * baseRadius * fracture + leanZ
      );
    }
  }
  for (let tier = 0; tier < tiers; tier += 1) {
    for (let segment = 0; segment < radialSegments; segment += 1) {
      const next = (segment + 1) % radialSegments;
      const a = tier * radialSegments + segment;
      const b = tier * radialSegments + next;
      const c = (tier + 1) * radialSegments + segment;
      const d = (tier + 1) * radialSegments + next;
      if ((tier + segment) % 2) indices.push(a, c, b, b, c, d);
      else indices.push(a, c, d, a, d, b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function layeredConiferGeometry(radialSegments = 7) {
  const profile = [[0,.07],[.17,.08],[.19,.44],[.36,.13],[.34,.38],[.53,.10],[.50,.31],[.70,.07],[.67,.23],[.86,.035],[1,0]];
  const positions = [], indices = [];
  for (let ring = 0; ring < profile.length; ring += 1) {
    const [y, radius] = profile[ring];
    for (let segment = 0; segment < radialSegments; segment += 1) {
      const angle = segment / radialSegments * TAU;
      positions.push(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
    }
  }
  for (let ring = 0; ring < profile.length - 1; ring += 1) for (let segment = 0; segment < radialSegments; segment += 1) {
    const next = (segment + 1) % radialSegments;
    const a = ring * radialSegments + segment, b = ring * radialSegments + next;
    const c = (ring + 1) * radialSegments + segment, d = (ring + 1) * radialSegments + next;
    indices.push(a, c, b, b, c, d);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  return geometry;
}

function basinAngle(index, count, layer, forwardAngle) {
  // Two dense valley walls with a deliberate open corridor ahead and a narrower
  // opening behind. This avoids the old evenly random circular-lobby silhouette.
  const side = index % 2 ? 1 : -1;
  const row = Math.floor(index / 2);
  const rows = Math.ceil(count / 2);
  const progress = rows <= 1 ? .5 : row / (rows - 1);
  const wallArc = .48 + progress * 1.42;
  const jitter = (seeded(index + layer * 101) - .5) * .10;
  return forwardAngle + side * wallArc + jitter;
}

export class HorizonDirector {
  constructor(scene, camera, options = {}) {
    if (!scene?.add || !camera?.isCamera) throw new TypeError('HorizonDirector requires a scene and camera.');
    this.scene = scene;
    this.camera = camera;
    this.near = options.near ?? 850;
    this.far = options.far ?? 3600;
    this.fixedNear = this.near;
    this.fixedFar = this.far;
    this.cameraFar = options.cameraFar ?? 9000;
    this.fogDensity = options.fogDensity ?? 0.00082;
    this.silhouetteCount = options.silhouetteCount ?? 24;
    this.silhouetteHeightMul = options.silhouetteHeightMul ?? 1;
    this.fixedSilhouetteHeightMul = this.silhouetteHeightMul;
    this.anchor = new THREE.Vector3(
      options.anchorX ?? FIXED_WORLD_ANCHOR.x,
      options.anchorY ?? FIXED_WORLD_ANCHOR.y,
      options.anchorZ ?? FIXED_WORLD_ANCHOR.z
    );
    this.routeHeading = options.routeHeading ?? FIXED_ROUTE_HEADING;
    this.placementRevision = 0;
    this.placementSignature = null;
    this._hueShift = 0;
    this._emissivePulse = 0.12;
    this.root = new THREE.Group();
    this.root.name = 'Galevein_BoundedReachBasin';
    this.root.userData.visualOnly = true;
    this.root.userData.profile = PROFILE;

    const peakGeometries = [ruggedPeakGeometry(12, 7, 0), ruggedPeakGeometry(10, 6, 700), ruggedPeakGeometry(9, 5, 1400)];
    const peakMaterials = [
      new THREE.MeshStandardMaterial({ color: 0x263633, roughness: .98, flatShading: true, fog: true }),
      new THREE.MeshStandardMaterial({ color: 0x28333a, roughness: 1, flatShading: true, fog: true }),
      new THREE.MeshBasicMaterial({ color: 0x34404c, fog: true })
    ];
    this.layers = [
      new THREE.InstancedMesh(peakGeometries[0], peakMaterials[0], LAYER_COUNTS.near),
      new THREE.InstancedMesh(peakGeometries[1], peakMaterials[1], LAYER_COUNTS.mid),
      new THREE.InstancedMesh(peakGeometries[2], peakMaterials[2], LAYER_COUNTS.far)
    ];
    this.layers.forEach((layer, index) => {
      layer.name = `Galevein_BasinMountainLayer${index + 1}`;
      layer.frustumCulled = false;
      this.root.add(layer);
    });
    // Compatibility handle used by the release harness for triangle accounting.
    this.masses = this.layers[0];

    const forestGeometry = layeredConiferGeometry();
    const forestMaterial = new THREE.MeshStandardMaterial({
      color: 0x172b25, roughness: 1, flatShading: true, fog: true,
      emissive: 0x07100d, emissiveIntensity: .08
    });
    this.forest = new THREE.InstancedMesh(forestGeometry, forestMaterial, LAYER_COUNTS.forest);
    this.forest.name = 'Galevein_ValleyForestBelts';
    this.forest.frustumCulled = false;
    this.root.add(this.forest);

    // A few fully dimensional sky monoliths preserve Galevein's floating-rock
    // identity without returning to the old billboard ring.
    this.monoliths = new THREE.InstancedMesh(
      ruggedPeakGeometry(9, 5, 2300),
      new THREE.MeshStandardMaterial({ color: 0x202b30, roughness: 1, flatShading: true, fog: true }),
      LAYER_COUNTS.skyMonoliths
    );
    this.monoliths.name = 'Galevein_DistantSkyMonoliths';
    this.monoliths.frustumCulled = false;
    this.root.add(this.monoliths);
    // Compatibility alias; unlike the removed planes, these are volumetric.
    this.islands = this.monoliths;

    this.scene.add(this.root);
    this.matrix = new THREE.Matrix4();
    this.position = new THREE.Vector3();
    this.quaternion = new THREE.Quaternion();
    this.scale = new THREE.Vector3();
    this.rebuild();
    this.update(null, 0, 0);
  }

  applySkyPreset(preset = {}) {
    if (preset.fogDensity != null) this.fogDensity = preset.fogDensity;
    // Region presets may grade fog and color, but cannot move or rescale the
    // physical landscape. ChapterDirector writes these fields before calling
    // this hook, so restore the authored island contract here.
    this.near = this.fixedNear;
    this.far = this.fixedFar;
    this.silhouetteHeightMul = this.fixedSilhouetteHeightMul;
    if (preset.hueShift != null) this._hueShift = preset.hueShift;
    if (preset.emissivePulse != null) this._emissivePulse = preset.emissivePulse;
    this._skyPreset = preset;
  }

  configureFog(sceneFog) {
    if (sceneFog?.isFogExp2) sceneFog.density = this.fogDensity;
    this.camera.far = this.cameraFar;
    this.camera.updateProjectionMatrix();
  }

  _placeLayer(mesh, layerIndex, count, baseX, baseZ, forwardAngle) {
    const nearBand = [this.near * .92, this.near * 1.52, this.near * 2.18][layerIndex];
    const farBand = [Math.min(this.far * .57, this.near * 1.80), this.far * .80, this.far][layerIndex];
    for (let index = 0; index < count; index += 1) {
      const angle = basinAngle(index, count, layerIndex, forwardAngle);
      const depth = seeded(index + 3100 + layerIndex * 317);
      const radius = nearBand + depth * Math.max(80, farBand - nearBand);
      const width = (layerIndex === 0 ? 120 : layerIndex === 1 ? 175 : 245) * (.72 + seeded(index + 3300) * .68);
      const height = (layerIndex === 0 ? 245 : layerIndex === 1 ? 360 : 510) * (.62 + seeded(index + 3500) * .66) * this.silhouetteHeightMul;
      const depthScale = width * (.46 + seeded(index + 3700) * .34);
      this.position.set(baseX + Math.sin(angle) * radius, -28, baseZ + Math.cos(angle) * radius);
      this.quaternion.setFromEuler(new THREE.Euler(0, angle + seeded(index + 3900) * .7, 0));
      this.scale.set(width, height, depthScale);
      this.matrix.compose(this.position, this.quaternion, this.scale);
      mesh.setMatrixAt(index, this.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  _placeForest(baseX, baseZ, forwardAngle) {
    for (let index = 0; index < LAYER_COUNTS.forest; index += 1) {
      const side = index % 2 ? 1 : -1;
      const progress = Math.floor(index / 2) / (LAYER_COUNTS.forest / 2 - 1);
      const angle = forwardAngle + side * (.50 + progress * 1.30) + (seeded(index + 4100) - .5) * .12;
      const radius = this.near * (.78 + seeded(index + 4300) * .72);
      const height = 16 + seeded(index + 4500) * 29;
      const width = height * (.82 + seeded(index + 4700) * .18);
      const rise = 18 + seeded(index + 4900) * 105;
      this.position.set(baseX + Math.sin(angle) * radius, rise, baseZ + Math.cos(angle) * radius);
      this.quaternion.setFromEuler(new THREE.Euler(0, seeded(index + 5100) * TAU, 0));
      this.scale.set(width, height, width);
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.forest.setMatrixAt(index, this.matrix);
    }
    this.forest.instanceMatrix.needsUpdate = true;
  }

  _placeMonoliths(baseX, baseZ) {
    for (let index = 0; index < LAYER_COUNTS.skyMonoliths; index += 1) {
      const side = index % 2 ? 1 : -1;
      const angle = side * (1.08 + Math.floor(index / 2) * .47) + Math.PI;
      const radius = this.near * (1.48 + seeded(index + 5300) * .58);
      const width = 70 + seeded(index + 5500) * 75;
      const height = 90 + seeded(index + 5700) * 150;
      this.position.set(baseX + Math.sin(angle) * radius, 210 + seeded(index + 5900) * 185, baseZ + Math.cos(angle) * radius);
      this.quaternion.setFromEuler(new THREE.Euler(Math.PI, angle, (seeded(index + 6100) - .5) * .24));
      this.scale.set(width, height, width * .68);
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.monoliths.setMatrixAt(index, this.matrix);
    }
    this.monoliths.instanceMatrix.needsUpdate = true;
  }

  _calculatePlacementSignature() {
    let signature = 2166136261;
    for (const mesh of [...this.layers, this.forest, this.monoliths]) {
      for (const value of mesh.instanceMatrix.array) {
        signature ^= Math.round(value * 1000);
        signature = Math.imul(signature, 16777619);
      }
    }
    return (signature >>> 0).toString(16).padStart(8, '0');
  }

  rebuild() {
    const baseX = this.anchor.x;
    const baseZ = this.anchor.z;
    const forwardAngle = this.routeHeading;
    this._placeLayer(this.layers[0], 0, LAYER_COUNTS.near, baseX, baseZ, forwardAngle);
    this._placeLayer(this.layers[1], 1, LAYER_COUNTS.mid, baseX, baseZ, forwardAngle);
    this._placeLayer(this.layers[2], 2, LAYER_COUNTS.far, baseX, baseZ, forwardAngle);
    this._placeForest(baseX, baseZ, forwardAngle);
    this._placeMonoliths(baseX, baseZ);
    this.placementRevision += 1;
    this.placementSignature = this._calculatePlacementSignature();
  }

  update(_cameraPosition, time = 0, dayAmount = 0) {
    this.configureFog(this.scene.fog);
    const hue = 0.54 + dayAmount * .10 + (this._hueShift || 0);
    this.layers[0].material.color.setHSL(hue, .20, .21 - dayAmount * .055);
    this.layers[1].material.color.setHSL(hue + .018, .17, .24 - dayAmount * .065);
    this.layers[2].material.color.setHSL(hue + .035, .16, .31 - dayAmount * .09);
    this.forest.material.color.setHSL(.40 + this._hueShift * .25, .34, .12 - dayAmount * .025);
    this.monoliths.material.color.setHSL(hue + .01, .18, .17 - dayAmount * .035);
    this.monoliths.rotation.y = Math.sin(time * .015) * .0025;
  }

  getSnapshot() {
    return {
      profile: PROFILE,
      placementMode: 'fixed-island-map-v1',
      worldAnchored: true,
      cameraRelative: false,
      cellSnapping: false,
      viewDirectionRebuilds: false,
      runtimeRepositioning: false,
      anchor: this.anchor.toArray(),
      routeHeadingDegrees: +(THREE.MathUtils.radToDeg(this.routeHeading)).toFixed(1),
      placementRevision: this.placementRevision,
      placementSignature: this.placementSignature,
      cameraFar: this.cameraFar,
      fogDensity: this.fogDensity,
      instances: LAYER_COUNTS.near + LAYER_COUNTS.mid + LAYER_COUNTS.far,
      islandInstances: LAYER_COUNTS.skyMonoliths,
      mountainLayers: 3,
      forestInstances: LAYER_COUNTS.forest,
      drawCalls: 5,
      valleyCorridor: true,
      fogBackdrop: true,
      billboardSilhouettes: 0,
      deterministicPlacement: true,
      visualOnly: true,
      skyPreset: this._skyPreset?.id ?? null
    };
  }

  dispose() {
    this.scene.remove(this.root);
    for (const layer of this.layers) { layer.geometry.dispose(); layer.material.dispose(); }
    this.forest.geometry.dispose(); this.forest.material.dispose();
    this.monoliths.geometry.dispose(); this.monoliths.material.dispose();
  }
}
