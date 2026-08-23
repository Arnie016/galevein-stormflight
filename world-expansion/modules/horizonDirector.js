// Authored, world-anchored basin backdrop. The geometry is visual-only: gameplay
// collision remains in the bounded region and Crownfall proxy systems. Landscape
// placement never follows the camera or rebuilds around view direction.
import * as THREE from 'three';

const TAU = Math.PI * 2;
const PROFILE = 'bounded-reach-island-v4';
const LAYER_COUNTS = Object.freeze({ forest: 320, skyMonoliths: 4 });
const FIXED_WORLD_ANCHOR = Object.freeze({ x:-20, y:0, z:110 });
const FIXED_ROUTE_HEADING = Math.atan2(-700, 530);
const RIDGE_SPECS = Object.freeze([
  Object.freeze({ id:'near', sections:48, inner:520, width:390, start:-980, end:1660, height:370, opening:185 }),
  Object.freeze({ id:'mid', sections:56, inner:980, width:560, start:-1450, end:2320, height:545, opening:250 }),
  Object.freeze({ id:'far', sections:64, inner:1580, width:780, start:-2100, end:3180, height:720, opening:340 })
]);
const CROSS_PROFILE = Object.freeze([
  Object.freeze({ x:0, y:-.07, tone:'waterline' }),
  Object.freeze({ x:.08, y:.015, tone:'waterline' }),
  Object.freeze({ x:.17, y:.10, tone:'forest' }),
  Object.freeze({ x:.29, y:.25, tone:'ledge' }),
  Object.freeze({ x:.42, y:.57, tone:'stone' }),
  Object.freeze({ x:.51, y:1, tone:'crown' }),
  Object.freeze({ x:.62, y:.70, tone:'crown' }),
  Object.freeze({ x:.75, y:.41, tone:'stone' }),
  Object.freeze({ x:.88, y:.13, tone:'forest' }),
  Object.freeze({ x:1, y:-.07, tone:'waterline' })
]);

function clamp01(value) { return Math.max(0, Math.min(1, value)); }
function smoothstep(edge0, edge1, value) {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

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

function ridgeShape(spec, along, side, layerIndex) {
  const t = clamp01((along - spec.start) / (spec.end - spec.start));
  const edge = Math.abs(t - .5) * 2;
  const phase = layerIndex * 1.71 + side * .83;
  const wander = Math.sin(t * Math.PI * 3.4 + phase) * (28 + layerIndex * 14)
    + Math.sin(t * Math.PI * 8.2 - phase * .63) * (12 + layerIndex * 8);
  const inner = spec.inner + spec.opening * smoothstep(.55, 1, edge) + wander;
  const crest = spec.height * (.72
    + .18 * Math.sin(t * Math.PI * 5.2 + phase)
    + .10 * Math.sin(t * Math.PI * 13.4 - phase * .7));
  const crownOffset = spec.width * (.49 + .06 * Math.sin(t * Math.PI * 6.6 + phase * 1.2));
  return { inner, crest: Math.max(spec.height * .48, crest), crownOffset };
}

function ridgeSurfaceHeight(spec, shape, crossU) {
  const u = clamp01(crossU);
  for (let index = 0; index < CROSS_PROFILE.length - 1; index += 1) {
    const a = CROSS_PROFILE[index], b = CROSS_PROFILE[index + 1];
    if (u > b.x) continue;
    const t = smoothstep(a.x, b.x, u);
    return (a.y + (b.y - a.y) * t) * shape.crest;
  }
  return CROSS_PROFILE[CROSS_PROFILE.length - 1].y * shape.crest;
}

function ridgeTone(tone, layerIndex, target) {
  const palette = {
    waterline: 0x4c5a5d,
    forest: 0x65786d,
    ledge: 0x74847b,
    crown: 0xd1d7d3,
    stone: 0x6c777b
  };
  target.setHex(palette[tone] || palette.stone);
  target.offsetHSL(layerIndex * .012, -layerIndex * .025, layerIndex * .035);
  return target;
}

function continuousRidgeGeometry(spec, layerIndex, anchor, routeHeading) {
  const positions = [], colors = [], indices = [];
  const color = new THREE.Color();
  const forwardX = Math.sin(routeHeading), forwardZ = Math.cos(routeHeading);
  const sideX = Math.cos(routeHeading), sideZ = -Math.sin(routeHeading);
  const columns = CROSS_PROFILE.length;
  for (let sideIndex = 0; sideIndex < 2; sideIndex += 1) {
    const side = sideIndex ? 1 : -1;
    const sideOffset = positions.length / 3;
    for (let segment = 0; segment <= spec.sections; segment += 1) {
      const t = segment / spec.sections;
      const along = spec.start + (spec.end - spec.start) * t;
      const shape = ridgeShape(spec, along, side, layerIndex);
      for (let column = 0; column < columns; column += 1) {
        const profile = CROSS_PROFILE[column];
        const crownBias = Math.sin(profile.x * Math.PI) * (shape.crownOffset - spec.width * .51);
        const cross = shape.inner + spec.width * profile.x + crownBias;
        const fracture = column > 0 && column < columns - 1
          ? Math.sin(segment * 2.21 + column * 1.73 + side * 2.4 + layerIndex) * (3 + layerIndex * 2)
          : 0;
        positions.push(
          anchor.x + forwardX * along + sideX * side * cross,
          anchor.y + profile.y * shape.crest + fracture,
          anchor.z + forwardZ * along + sideZ * side * cross
        );
        ridgeTone(profile.tone, layerIndex, color);
        const strata = .92 + .08 * Math.sin(segment * .91 + column * 2.4 + sideIndex * 1.3);
        colors.push(color.r * strata, color.g * strata, color.b * strata);
      }
    }
    for (let segment = 0; segment < spec.sections; segment += 1) {
      for (let column = 0; column < columns - 1; column += 1) {
        const a = sideOffset + segment * columns + column;
        const b = a + 1;
        const c = a + columns;
        const d = c + 1;
        if ((segment + column + sideIndex) % 2) indices.push(a, c, b, b, c, d);
        else indices.push(a, c, d, a, d, b);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.ridgeWalls = 2;
  geometry.userData.sections = spec.sections;
  return geometry;
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

    const ridgeMaterials = [
      new THREE.MeshStandardMaterial({ color: 0x71807b, vertexColors:true, roughness:.97, metalness:.01, flatShading:true, fog:true, emissive:0x101b19, emissiveIntensity:.05 }),
      new THREE.MeshStandardMaterial({ color: 0x78858a, vertexColors:true, roughness:.99, metalness:0, flatShading:true, fog:true, emissive:0x10171a, emissiveIntensity:.035 }),
      new THREE.MeshBasicMaterial({ color: 0x89939a, vertexColors:true, fog:true })
    ];
    this.layers = RIDGE_SPECS.map((spec, index) => new THREE.Mesh(
      continuousRidgeGeometry(spec, index, this.anchor, this.routeHeading),
      ridgeMaterials[index]
    ));
    this.layers.forEach((layer, index) => {
      layer.name = `Galevein_BasinMountainLayer${index + 1}`;
      layer.frustumCulled = false;
      this.root.add(layer);
    });
    // Compatibility handle used by the release harness and day/night grading.
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

  _placeForest(baseX, baseZ, forwardAngle) {
    const forwardX = Math.sin(forwardAngle), forwardZ = Math.cos(forwardAngle);
    const sideX = Math.cos(forwardAngle), sideZ = -Math.sin(forwardAngle);
    for (let index = 0; index < LAYER_COUNTS.forest; index += 1) {
      const side = index % 2 ? 1 : -1;
      const layerIndex = index % 7 === 0 ? 1 : 0;
      const spec = RIDGE_SPECS[layerIndex];
      const progress = Math.floor(index / 2) / (LAYER_COUNTS.forest / 2 - 1);
      const along = spec.start + (spec.end - spec.start) * (.08 + progress * .84)
        + (seeded(index + 4100) - .5) * 105;
      const shape = ridgeShape(spec, along, side, layerIndex);
      const crossU = .19 + seeded(index + 4300) * .29;
      const cross = shape.inner + spec.width * crossU;
      const height = 12 + seeded(index + 4500) * 20;
      const width = height * (.78 + seeded(index + 4700) * .19);
      const rise = ridgeSurfaceHeight(spec, shape, crossU) + height * .01;
      this.position.set(
        baseX + forwardX * along + sideX * side * cross,
        rise,
        baseZ + forwardZ * along + sideZ * side * cross
      );
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
    for (const mesh of this.layers) {
      for (const value of mesh.geometry.attributes.position.array) {
        signature ^= Math.round(value * 1000);
        signature = Math.imul(signature, 16777619);
      }
    }
    for (const mesh of [this.forest, this.monoliths]) {
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
    this._placeForest(baseX, baseZ, forwardAngle);
    this._placeMonoliths(baseX, baseZ);
    this.placementRevision += 1;
    this.placementSignature = this._calculatePlacementSignature();
  }

  update(_cameraPosition, time = 0, dayAmount = 0) {
    this.configureFog(this.scene.fog);
    const hue = 0.54 + dayAmount * .10 + (this._hueShift || 0);
    this.layers[0].material.color.setHSL(hue, .17, .56 - dayAmount * .10);
    this.layers[1].material.color.setHSL(hue + .018, .14, .62 - dayAmount * .12);
    this.layers[2].material.color.setHSL(hue + .035, .12, .70 - dayAmount * .15);
    this.forest.material.color.setHSL(.40 + this._hueShift * .25, .34, .12 - dayAmount * .025);
    this.monoliths.material.color.setHSL(hue + .01, .18, .17 - dayAmount * .035);
    // Suspended rock is allowed; scenery drift is not. Keep the transform authored
    // and immutable so parallax comes only from rider movement through the basin.
    this.monoliths.rotation.y = 0;
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
      instances: RIDGE_SPECS.reduce((sum, spec) => sum + spec.sections, 0),
      islandInstances: LAYER_COUNTS.skyMonoliths,
      mountainLayers: 3,
      continuousRidgeWalls: 6,
      detachedMountainInstances: 0,
      ridgeGeometryMode: 'continuous-fixed-walls-v1',
      ridgeSections: RIDGE_SPECS.map(spec => spec.sections),
      ridgeTriangles: this.layers.reduce((sum, layer) => sum + (layer.geometry.index?.count || 0) / 3, 0),
      valleyFloorWidth: RIDGE_SPECS[0].inner * 2,
      longitudinalSpan: RIDGE_SPECS[2].end - RIDGE_SPECS[2].start,
      forestInstances: LAYER_COUNTS.forest,
      forestAttachment: 'slope-sampled-v1',
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
