import * as THREE from 'three';

const PROFILE = 'serpent-coast-fixed-landmass-v1';
const ANCHOR = Object.freeze({ x: 520, y: 0, z: -420 });
const EXTENT = Object.freeze({ x: 165, z: 205 });
const GRID = Object.freeze({ x: 34, z: 42 });
const TERRACED_GRID = Object.freeze({ x: 52, z: 64 });
const FOREST_COUNT = 128;
const TALUS_COUNT = 112;

function clamp01(value) { return Math.max(0, Math.min(1, value)); }
function smooth(value) { const t = clamp01(value); return t * t * (3 - 2 * t); }
function gaussian(x, z, cx, cz, radius, height) {
  const d2 = (x - cx) ** 2 + (z - cz) ** 2;
  return Math.exp(-d2 / (radius * radius)) * height;
}
function makeRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let n = state;
    n = Math.imul(n ^ (n >>> 15), n | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

export function serpentCoastHeight(x, z) {
  const dx = (x - ANCHOR.x) / EXTENT.x;
  const dz = (z - ANCHOR.z) / EXTENT.z;
  const radial = Math.hypot(dx * 1.03, dz);
  const island = smooth((1.08 - radial) / .38);
  if (island <= .001) return -15;

  const fracture = Math.sin(x * .052 + z * .017) * 1.15 + Math.sin(z * .071 - x * .029) * .72;
  let height = -15 + island * (16.2 + fracture);
  height += gaussian(x, z, 568, -332, 72, 22);
  height += gaussian(x, z, 610, -455, 78, 18);
  height += gaussian(x, z, 548, -548, 62, 12);

  // The drowned homes share one low tidal shelf. Keeping this surface close to
  // the water preserves the stilt silhouette while the surrounding headlands
  // supply the grounded scale that the old flattened rock lacked.
  const villageDistance = Math.hypot(x - 487, z + 454);
  const villageShelf = smooth((78 - villageDistance) / 42);
  height = THREE.MathUtils.lerp(height, .75 + fracture * .10, villageShelf * .94);
  return height;
}

function coastGeometry(mode = 'camera-safe-terraces') {
  const grid = mode === 'incumbent' ? GRID : TERRACED_GRID;
  const width = grid.x + 1;
  const depth = grid.z + 1;
  const positions = new Float32Array(width * depth * 3);
  const colors = new Float32Array(width * depth * 3);
  const indices = [];
  const wet = new THREE.Color(0x202c31);
  const basalt = new THREE.Color(0x303d3d);
  const lichen = new THREE.Color(0x40564b);
  const cinder = new THREE.Color(0x25292a);
  const color = new THREE.Color();

  for (let iz = 0; iz < depth; iz += 1) {
    for (let ix = 0; ix < width; ix += 1) {
      const u = ix / grid.x;
      const v = iz / grid.z;
      const x = (u * 2 - 1) * EXTENT.x;
      const z = (v * 2 - 1) * EXTENT.z;
      const worldX = ANCHOR.x + x;
      const worldZ = ANCHOR.z + z;
      const y = serpentCoastHeight(worldX, worldZ);
      const offset = (iz * width + ix) * 3;
      positions.set([x, y, z], offset);
      if (y < .6) color.copy(wet);
      else if (y < 5) color.copy(cinder).lerp(basalt, clamp01(y / 5));
      else color.copy(basalt).lerp(lichen, clamp01((y - 5) / 18));
      const variation = Math.sin(worldX * .13 + worldZ * .07) * .035;
      color.offsetHSL(0, 0, variation);
      colors.set([color.r, color.g, color.b], offset);
    }
  }
  let visibleCells = 0;
  for (let iz = 0; iz < grid.z; iz += 1) {
    for (let ix = 0; ix < grid.x; ix += 1) {
      const a = iz * width + ix;
      const b = a + 1;
      const c = a + width;
      const d = c + 1;
      if (mode !== 'incumbent') {
        const ay = positions[a * 3 + 1], by = positions[b * 3 + 1];
        const cy = positions[c * 3 + 1], dy = positions[d * 3 + 1];
        // The Poseidon ocean owns the water plane. Dropping cells which are
        // wholly submerged removes the black rectangular platform around the
        // island while retaining shoreline-crossing triangles and fixed land.
        if (Math.max(ay, by, cy, dy) < -2) continue;
      }
      indices.push(a, c, b, b, c, d);
      visibleCells += 1;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.userData.visibleCells = visibleCells;
  geometry.userData.grid = { ...grid };
  return geometry;
}

function coastDetailTextures(size = 128) {
  const normal = new Uint8Array(size * size * 4);
  const roughness = new Uint8Array(size * size * 4);
  const signal = (u, v) => Math.sin(u * Math.PI * 12 + Math.sin(v * 11) * .8) * .52 +
    Math.cos(v * Math.PI * 17 - Math.sin(u * 9) * .6) * .31 + Math.sin((u + v) * Math.PI * 29) * .17;
  const step = 1 / size;
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
    const u = x / size, v = y / size;
    const dx = signal(u + step, v) - signal(u - step, v);
    const dy = signal(u, v + step) - signal(u, v - step);
    const nx = -dx * 1.8, ny = -dy * 1.8, nz = 1;
    const length = Math.hypot(nx, ny, nz), offset = (y * size + x) * 4;
    normal[offset] = Math.round((nx / length * .5 + .5) * 255);
    normal[offset + 1] = Math.round((ny / length * .5 + .5) * 255);
    normal[offset + 2] = Math.round((nz / length * .5 + .5) * 255); normal[offset + 3] = 255;
    const rough = 224 + Math.round(Math.abs(signal(u, v)) * 24);
    roughness[offset] = roughness[offset + 1] = roughness[offset + 2] = rough; roughness[offset + 3] = 255;
  }
  const make = (data) => {
    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(4, 5);
    texture.anisotropy = 4; texture.needsUpdate = true; return texture;
  };
  return { normal:make(normal), roughness:make(roughness), size };
}

function shorelineGeometry() {
  const points = [];
  for (let index = 0; index < 56; index += 1) {
    const angle = index / 56 * Math.PI * 2;
    const irregular = .775 + Math.sin(angle * 3 + .4) * .028 + Math.sin(angle * 7 - .8) * .015;
    points.push(new THREE.Vector3(
      Math.cos(angle) * EXTENT.x * irregular,
      .72,
      Math.sin(angle) * EXTENT.z * irregular
    ));
  }
  const curve = new THREE.CatmullRomCurve3(points, true, 'centripetal');
  return new THREE.TubeGeometry(curve, 112, .48, 6, true);
}

function hashMatrices(meshes) {
  let signature = 2166136261;
  for (const mesh of meshes) {
    for (const value of mesh.instanceMatrix?.array || mesh.matrix.elements) {
      signature ^= Math.round(value * 1000);
      signature = Math.imul(signature, 16777619);
    }
  }
  return (signature >>> 0).toString(16).padStart(8, '0');
}

export class SerpentCoast {
  constructor(scene, options = {}) {
    if (!scene?.add) throw new TypeError('SerpentCoast requires a Three.js scene.');
    this.scene = scene;
    this.flightRoute = options.flightRoute ?? [];
    this.geologyMode = options.geologyMode === 'incumbent' ? 'incumbent' : 'camera-safe-terraces';
    this.root = new THREE.Group();
    this.root.name = 'SerpentReach_FixedCinderCoast';
    this.root.position.set(ANCHOR.x, ANCHOR.y, ANCHOR.z);
    this.root.userData.profile = PROFILE;
    this.root.userData.worldAnchored = true;

    this.detailTextures = this.geologyMode === 'incumbent' ? null : coastDetailTextures();
    const landMaterial = this.geologyMode === 'incumbent'
      ? new THREE.MeshLambertMaterial({ vertexColors:true, flatShading:false, fog:true })
      : new THREE.MeshStandardMaterial({
        vertexColors:true, roughness:.93, metalness:.018, flatShading:false, fog:true,
        emissive:0x081110, emissiveIntensity:.025,
        normalMap:this.detailTextures.normal, normalScale:new THREE.Vector2(.22,.22),
        roughnessMap:this.detailTextures.roughness
      });
    this.land = new THREE.Mesh(coastGeometry(this.geologyMode), landMaterial);
    this.land.name = 'SerpentReach_ContinuousCoastalTerrain';
    // The world moon already shades the terrain. Re-rendering this entire
    // 330x410m surface into the shadow atlas doubled median frame time.
    this.land.castShadow = false;
    this.land.receiveShadow = true;
    this.root.add(this.land);

    this.foam = new THREE.Mesh(shorelineGeometry(), new THREE.MeshBasicMaterial({
      color: 0xd8e8e8, transparent: true, opacity: .36, depthWrite: false,
      blending: THREE.AdditiveBlending, fog: true
    }));
    this.foam.name = 'SerpentReach_FixedShoreBreak';
    this.root.add(this.foam);

    const random = makeRandom(0x51e7c057);
    const pineGeometry = new THREE.ConeGeometry(3.2, 11, 7, 2);
    const pineMaterial = new THREE.MeshLambertMaterial({ color: 0x172d27, flatShading: true, fog: true });
    this.forest = new THREE.InstancedMesh(pineGeometry, pineMaterial, FOREST_COUNT);
    this.forest.name = 'SerpentReach_WindBentForest';
    const dummy = new THREE.Object3D();
    let forestPlaced = 0;
    for (let attempt = 0; forestPlaced < FOREST_COUNT && attempt < 8000; attempt += 1) {
      const x = ANCHOR.x + (random() * 2 - 1) * EXTENT.x * .86;
      const z = ANCHOR.z + (random() * 2 - 1) * EXTENT.z * .86;
      const y = serpentCoastHeight(x, z);
      if (y < 5.5 || Math.hypot(x - 487, z + 454) < 82 || (x < 520 && z < -350)) continue;
      const scale = .72 + random() * 1.12;
      dummy.position.set(x - ANCHOR.x, y + 5.1 * scale, z - ANCHOR.z);
      dummy.scale.set(scale * (.8 + random() * .18), scale, scale * (.8 + random() * .18));
      dummy.rotation.set(0, random() * Math.PI * 2, -.07 - random() * .16);
      dummy.updateMatrix();
      this.forest.setMatrixAt(forestPlaced, dummy.matrix);
      forestPlaced += 1;
    }
    this.forest.instanceMatrix.needsUpdate = true;
    this.forest.computeBoundingSphere();
    // Dense silhouettes receive world light but do not each enter the global
    // shadow pass; contact comes from their dark material and slope placement.
    this.forest.castShadow = false;
    this.forest.receiveShadow = true;
    this.root.add(this.forest);

    const talusGeometry = new THREE.IcosahedronGeometry(2.2, 1);
    const talusMaterial = new THREE.MeshLambertMaterial({ color: 0x263236, flatShading: true, fog: true });
    this.talus = new THREE.InstancedMesh(talusGeometry, talusMaterial, TALUS_COUNT);
    this.talus.name = 'SerpentReach_ShoreTalus';
    for (let index = 0; index < TALUS_COUNT; index += 1) {
      const angle = index / TALUS_COUNT * Math.PI * 2 + (random() - .5) * .09;
      const radial = .73 + random() * .12;
      const x = ANCHOR.x + Math.cos(angle) * EXTENT.x * radial;
      const z = ANCHOR.z + Math.sin(angle) * EXTENT.z * radial;
      const y = serpentCoastHeight(x, z);
      const scale = .45 + random() * 1.45;
      dummy.position.set(x - ANCHOR.x, Math.max(-.2, y) + scale, z - ANCHOR.z);
      dummy.scale.set(scale * (1.1 + random()), scale * (.42 + random() * .45), scale);
      dummy.rotation.set(random() * .5, random() * Math.PI * 2, random() * .5);
      dummy.updateMatrix();
      this.talus.setMatrixAt(index, dummy.matrix);
    }
    this.talus.instanceMatrix.needsUpdate = true;
    this.talus.computeBoundingSphere();
    this.talus.castShadow = false;
    this.talus.receiveShadow = true;
    this.root.add(this.talus);

    this.scene.add(this.root);
    this.placementSignature = hashMatrices([this.forest, this.talus]);
  }

  getCollisionProxies() {
    return [
      { id: 'cinder-north-headland', x: 568, z: -332, radius: 50, top: 25 },
      { id: 'cinder-east-ridge', x: 610, z: -455, radius: 52, top: 22 },
      { id: 'cinder-south-headland', x: 548, z: -548, radius: 40, top: 16 }
    ];
  }

  getSnapshot() {
    const geometry = this.land.geometry;
    const routeSamples = this.flightRoute.map(([x, y, z], index) => {
      const terrain = serpentCoastHeight(x, z);
      const within = x >= ANCHOR.x - EXTENT.x && x <= ANCHOR.x + EXTENT.x &&
        z >= ANCHOR.z - EXTENT.z && z <= ANCHOR.z + EXTENT.z;
      return { beacon: index + 1, within, terrain: +terrain.toFixed(1), verticalClearance: +(y - Math.max(0, terrain)).toFixed(1) };
    }).filter(sample => sample.within);
    return {
      profile: PROFILE,
      geologyMode: this.geologyMode,
      placementMode: 'fixed-authored-world-v1',
      worldAnchored: true,
      cameraRelative: false,
      runtimeRepositioning: false,
      deterministic: true,
      placementSignature: this.placementSignature,
      anchor: [ANCHOR.x, ANCHOR.y, ANCHOR.z],
      footprint: { width: EXTENT.x * 2, length: EXTENT.z * 2 },
      architecture: 'continuous-cinder-headland-and-tidal-shelf',
      terrainTriangles: (geometry.index?.count || geometry.attributes.position.count) / 3,
      terrainGrid: { ...geometry.userData.grid },
      visibleTerrainCells: geometry.userData.visibleCells,
      submergedRectangularSkirt: this.geologyMode === 'incumbent',
      generatedSurfaceTextures: this.detailTextures ? 2 : 0,
      surfaceTextureResolution: this.detailTextures?.size ?? 0,
      shorelineProfile: 'closed-irregular-fixed-break-v1',
      shorelineSegments: 112,
      forestInstances: this.forest.count,
      forestDistribution: 'seeded-headland-belts',
      talusInstances: this.talus.count,
      drawCalls: 4,
      externalAssets: 0,
      collisionProxies: this.getCollisionProxies().length,
      routeSamples,
      minimumRouteVerticalClearance: Math.min(...routeSamples.map(sample => sample.verticalClearance))
    };
  }

  dispose() {
    this.scene.remove(this.root);
    for (const mesh of [this.land, this.foam, this.forest, this.talus]) {
      mesh.geometry.dispose(); mesh.material.dispose();
    }
    if (this.detailTextures) for (const texture of Object.values(this.detailTextures)) {
      if (texture?.dispose) texture.dispose();
    }
  }
}

export default SerpentCoast;
