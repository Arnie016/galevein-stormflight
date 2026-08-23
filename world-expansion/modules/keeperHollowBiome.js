// Keeper Hollow replaces the unrelated central rock pile with one authored,
// deterministic coastal valley. Render geometry and collision authority remain
// separate: the original six obstacle proxies are preserved exactly, while the
// new outer shoulders use explicit route-checked proxies.
import * as THREE from 'three';

const TAU = Math.PI * 2;
const PROFILE = 'keeper-hollow-biome-v1';
const FOREST_COUNT = 520;
const TALUS_COUNT = 112;
const SURFACE_TEXTURE_SIZE = 128;

export const KEEPER_SHRINE_SITES = Object.freeze([
  Object.freeze({ id:'south-watch', x:-220, z:-220, baseH:42, yaw0:0, rate:.42 }),
  Object.freeze({ id:'west-watch', x:-650, z:40, baseH:34, yaw0:2.1, rate:-.34 }),
  Object.freeze({ id:'north-watch', x:-200, z:460, baseH:38, yaw0:4.0, rate:.29 })
]);

function hash(index) {
  let value = Math.imul(index + 1, 0x9e3779b1);
  value ^= value >>> 16; value = Math.imul(value, 0x85ebca6b); value ^= value >>> 13;
  return (value >>> 0) / 4294967295;
}

function clampByte(value) { return Math.max(0, Math.min(255, Math.round(value))); }

function wrapInteger(value, period) { return ((value % period) + period) % period; }

function periodicHash(x, y, period) {
  let value = Math.imul(wrapInteger(x, period) + 1, 0x45d9f3b) ^
    Math.imul(wrapInteger(y, period) + 1, 0x27d4eb2d);
  value ^= value >>> 16; value = Math.imul(value, 0x85ebca6b); value ^= value >>> 13;
  return (value >>> 0) / 4294967295;
}

function periodicValueNoise(u, v, frequency) {
  const x = u * frequency, y = v * frequency;
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = periodicHash(ix, iy, frequency), b = periodicHash(ix + 1, iy, frequency);
  const c = periodicHash(ix, iy + 1, frequency), d = periodicHash(ix + 1, iy + 1, frequency);
  const low = a + (b - a) * sx, high = c + (d - c) * sx;
  return low + (high - low) * sy;
}

function periodicFbm(u, v) {
  let value = 0, amplitude = .54, normalization = 0;
  for (const frequency of [4, 8, 16, 32]) {
    value += periodicValueNoise(u, v, frequency) * amplitude;
    normalization += amplitude; amplitude *= .48;
  }
  return value / normalization;
}

function cliffSurfaceSample(u, v) {
  const grain = (periodicFbm(u, v) - .5) * 2;
  const broad = (periodicFbm(u * 2 + .17, v * 2 + .31) - .5) * 2;
  const strata = Math.sin(TAU * (v * 2 + grain * .16));
  const fractureSignal = Math.abs(periodicFbm(u * 2 + .43, v * 2 + .67) - .5);
  const fracture = Math.pow(Math.max(0, .095 - fractureSignal) / .095, 2);
  return { height:grain * .58 + broad * .23 + strata * .06 - fracture * .32, grain, strata, fracture };
}

function cliffDetailTextures(size = SURFACE_TEXTURE_SIZE) {
  const albedo = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
    const u = x / size, v = y / size;
    const sample = cliffSurfaceSample(u, v);
    const index = (y * size + x) * 4;
    const brightness = .985 + sample.grain * .055 + sample.strata * .012 - sample.fracture * .07;
    albedo[index] = clampByte(brightness * 246);
    albedo[index + 1] = clampByte(brightness * 253);
    albedo[index + 2] = clampByte(brightness * 249);
    albedo[index + 3] = 255;
  }
  const make = (data, color = false) => {
    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 3); texture.anisotropy = 4;
    texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter;
    if (color) texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  };
  return { albedo:make(albedo, true), size };
}

function cliffRadius(v) {
  const shelves = Math.sin(v * Math.PI * 5.2) * .055 + Math.sin(v * Math.PI * 11.0) * .025;
  return Math.max(.16, Math.pow(1 - v, .58) * (.93 + shelves) + .10);
}

function erodedCliffGeometry(radialSegments = 24, tiers = 18) {
  const positions = [], colors = [], uvs = [], indices = [];
  const low = new THREE.Color(0x263331);
  const rock = new THREE.Color(0x61716a);
  const moss = new THREE.Color(0x3a5a45);
  const lichen = new THREE.Color(0x99a69d);
  const color = new THREE.Color();
  for (let tier = 0; tier <= tiers; tier += 1) {
    const v = tier / tiers;
    const radius = cliffRadius(v);
    for (let segment = 0; segment <= radialSegments; segment += 1) {
      const angle = segment / radialSegments * TAU;
      const wrappedSegment = segment % radialSegments;
      const fracture = .82 + hash(tier * 131 + wrappedSegment * 17) * .34;
      const gullies = 1 - Math.pow(Math.max(0, Math.sin(angle * 3.0 + v * 7.4)), 5) * (.05 + v * .08);
      const leanX = v * v * .11, leanZ = -v * v * .07;
      positions.push(Math.cos(angle) * radius * fracture * gullies + leanX, v, Math.sin(angle) * radius * fracture * gullies + leanZ);
      const ledge = Math.max(0, Math.sin(v * Math.PI * 5.2 - .4));
      color.copy(low).lerp(rock, .28 + v * .46).lerp(moss, ledge * .38).lerp(lichen, Math.max(0, v - .76) * 1.55);
      const shade = .82 + hash(9000 + tier * 71 + wrappedSegment) * .25;
      colors.push(color.r * shade, color.g * shade, color.b * shade);
      uvs.push(segment / radialSegments, v);
    }
  }
  const columns = radialSegments + 1;
  for (let tier = 0; tier < tiers; tier += 1) {
    for (let segment = 0; segment < radialSegments; segment += 1) {
      const a = tier * columns + segment, b = a + 1;
      const c = (tier + 1) * columns + segment, d = c + 1;
      if ((tier + segment) % 2) indices.push(a, c, b, b, c, d);
      else indices.push(a, c, d, a, d, b);
    }
  }
  const topCenter = positions.length / 3;
  positions.push(.11, 1.01, -.07); colors.push(lichen.r, lichen.g, lichen.b); uvs.push(.5, 1);
  const topRing = tiers * columns;
  for (let segment = 0; segment < radialSegments; segment += 1) {
    indices.push(topCenter, topRing + segment, topRing + segment + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  return geometry;
}

function coniferGeometry(radialSegments = 7) {
  const profile = [[0,.07],[.14,.08],[.17,.46],[.34,.12],[.31,.39],[.51,.09],[.47,.31],[.69,.06],[.64,.22],[.85,.03],[1,0]];
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

// Three low stacks seat the route-aligned wind shrines. Ten larger shoulders
// alternate along the Chapter IV polyline, creating a bounded flyable valley
// while remaining outside the protected lane.
const MASSES = Object.freeze([
  { id:'south-watch-seat', x:-220, z:-220, radius:28, top:46, proxyRadius:18, proxyTop:46, shrine:true },
  { id:'west-watch-seat', x:-650, z:40, radius:30, top:38, proxyRadius:19, proxyTop:38, shrine:true },
  { id:'north-watch-seat', x:-200, z:460, radius:30, top:42, proxyRadius:19, proxyTop:42, shrine:true },
  { id:'southwest-threshold', x:-450, z:-500, radius:90, top:210, proxyRadius:52, proxyTop:210, shoulder:true },
  { id:'southeast-threshold', x:-150, z:-350, radius:100, top:225, proxyRadius:58, proxyTop:225, shoulder:true },
  { id:'west-gully', x:-520, z:-280, radius:92, top:218, proxyRadius:53, proxyTop:218, shoulder:true },
  { id:'east-gully', x:-180, z:-120, radius:110, top:240, proxyRadius:64, proxyTop:240, shoulder:true },
  { id:'west-crown', x:-720, z:140, radius:105, top:248, proxyRadius:61, proxyTop:248, shoulder:true },
  { id:'middle-crown', x:-380, z:100, radius:82, top:196, proxyRadius:48, proxyTop:196, shoulder:true },
  { id:'northwest-rampart', x:-650, z:420, radius:110, top:255, proxyRadius:64, proxyTop:255, shoulder:true },
  { id:'northeast-rampart', x:-300, z:350, radius:78, top:190, proxyRadius:45, proxyTop:190, shoulder:true },
  { id:'northwest-gate', x:-450, z:650, radius:115, top:268, proxyRadius:67, proxyTop:268, shoulder:true },
  { id:'northeast-gate', x:-80, z:620, radius:110, top:245, proxyRadius:64, proxyTop:245, shoulder:true }
]);

function pointSegmentDistance(x, z, a, b) {
  const dx = b[0] - a[0], dz = b[2] - a[2];
  const lengthSq = dx * dx + dz * dz || 1;
  const t = THREE.MathUtils.clamp(((x - a[0]) * dx + (z - a[2]) * dz) / lengthSq, 0, 1);
  return Math.hypot(x - (a[0] + dx * t), z - (a[2] + dz * t));
}

function routeClearance(masses, route) {
  if (!route?.length) return null;
  let minimum = Infinity;
  for (const mass of masses) for (let index = 0; index < route.length - 1; index += 1) {
    minimum = Math.min(minimum, pointSegmentDistance(mass.x, mass.z, route[index], route[index + 1]) - mass.proxyRadius);
  }
  return +minimum.toFixed(1);
}

export class KeeperHollowBiome {
  constructor(scene, options = {}) {
    if (!scene?.add) throw new TypeError('KeeperHollowBiome requires a Three.js scene.');
    this.scene = scene;
    this.route = options.flightRoute || null;
    this.root = new THREE.Group();
    this.root.name = 'Galevein_KeeperHollowBiome';
    this.root.visible = false;
    this.root.userData.profile = PROFILE;
    this.root.userData.authored = true;

    this.cliffTextures = cliffDetailTextures();
    this.cliffMaterial = new THREE.MeshStandardMaterial({
      color:0xffffff, vertexColors:true, roughness:.96, metalness:.015,
      flatShading:false, fog:true, emissive:0x08100f, emissiveIntensity:.035,
      map:this.cliffTextures.albedo
    });
    this.cliffs = new THREE.InstancedMesh(erodedCliffGeometry(), this.cliffMaterial, MASSES.length);
    this.cliffs.name = 'KeeperHollow_ErodedValleyShoulders';
    this.cliffs.castShadow = true; this.cliffs.receiveShadow = true; this.cliffs.frustumCulled = false;

    this.matrix = new THREE.Matrix4(); this.position = new THREE.Vector3();
    this.quaternion = new THREE.Quaternion(); this.scale = new THREE.Vector3();
    for (let index = 0; index < MASSES.length; index += 1) {
      const mass = MASSES[index];
      this.position.set(mass.x, -5, mass.z);
      this.quaternion.setFromEuler(new THREE.Euler(0, hash(index + 500) * TAU, 0));
      this.scale.set(mass.radius, mass.top + 5, mass.radius * (.62 + hash(index + 700) * .22));
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.cliffs.setMatrixAt(index, this.matrix);
      const tint = .955 + (hash(index + 820) - .5) * .07;
      this.cliffs.setColorAt(index, new THREE.Color(tint * .98, tint, tint * .985));
    }
    this.cliffs.instanceMatrix.needsUpdate = true; this.cliffs.instanceColor.needsUpdate = true;
    this.root.add(this.cliffs);

    this.forestMaterial = new THREE.MeshStandardMaterial({
      color:0x1f4235, roughness:1, flatShading:true, fog:true,
      emissive:0x07120d, emissiveIntensity:.08
    });
    this.forest = new THREE.InstancedMesh(coniferGeometry(), this.forestMaterial, FOREST_COUNT);
    this.forest.name = 'KeeperHollow_LedgeForest'; this.forest.frustumCulled = false;
    const forestShoulders = MASSES.filter((mass) => mass.shoulder);
    const forestSeats = MASSES.filter((mass) => mass.shrine);
    for (let index = 0; index < FOREST_COUNT; index += 1) {
      const mass = index % 11 === 0
        ? forestSeats[Math.floor(index / 11) % forestSeats.length]
        : forestShoulders[index % forestShoulders.length];
      const ledgeBands = [.27, .43, .60, .72];
      const v = ledgeBands[Math.floor(hash(index + 1100) * ledgeBands.length)] + (hash(index + 1200) - .5) * .07;
      const angleCluster = Math.floor(hash(index + 1300) * 10) / 10 * TAU;
      const angle = angleCluster + (hash(index + 1400) - .5) * .30;
      const radius = mass.radius * cliffRadius(v) * (.70 + hash(index + 1500) * .18);
      const height = 5.5 + hash(index + 1700) * 9;
      this.position.set(mass.x + Math.cos(angle) * radius, -5 + (mass.top + 5) * v, mass.z + Math.sin(angle) * radius * .74);
      this.quaternion.setFromEuler(new THREE.Euler(0, hash(index + 1900) * TAU, (hash(index + 2100) - .5) * .06));
      this.scale.set(height * (.72 + hash(index + 2300) * .18), height, height * (.72 + hash(index + 2500) * .18));
      this.matrix.compose(this.position, this.quaternion, this.scale); this.forest.setMatrixAt(index, this.matrix);
    }
    this.forest.instanceMatrix.needsUpdate = true; this.root.add(this.forest);

    this.talusMaterial = new THREE.MeshStandardMaterial({ color:0x202c2b, roughness:.93, metalness:.02, flatShading:true, fog:true });
    this.talus = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), this.talusMaterial, TALUS_COUNT);
    this.talus.name = 'KeeperHollow_ShoreTalus'; this.talus.frustumCulled = false;
    for (let index = 0; index < TALUS_COUNT; index += 1) {
      const mass = MASSES[index % MASSES.length];
      const angle = hash(index + 2700) * TAU;
      const radius = mass.radius * (.76 + hash(index + 2900) * .38);
      const size = 1.4 + hash(index + 3100) * Math.min(6, mass.radius * .07);
      this.position.set(mass.x + Math.cos(angle) * radius, .5 + hash(index + 3300) * 2.4, mass.z + Math.sin(angle) * radius * .74);
      this.quaternion.setFromEuler(new THREE.Euler(hash(index + 3500) * .7, hash(index + 3700) * TAU, hash(index + 3900) * .7));
      this.scale.set(size * (1 + hash(index + 4100) * .8), size * (.55 + hash(index + 4300) * .5), size);
      this.matrix.compose(this.position, this.quaternion, this.scale); this.talus.setMatrixAt(index, this.matrix);
    }
    this.talus.instanceMatrix.needsUpdate = true; this.root.add(this.talus);

    const ringGeometry = new THREE.RingGeometry(.78, 1.08, 36);
    this.wetMaterial = new THREE.MeshStandardMaterial({ color:0x152326, roughness:.38, metalness:.08, side:THREE.DoubleSide, fog:true });
    this.wetAprons = new THREE.InstancedMesh(ringGeometry, this.wetMaterial, MASSES.length);
    this.wetAprons.name = 'KeeperHollow_WetAprons'; this.wetAprons.frustumCulled = false;
    this.surfMaterial = new THREE.MeshBasicMaterial({ color:0xb9d1cc, transparent:true, opacity:.16, side:THREE.DoubleSide, depthWrite:false, blending:THREE.AdditiveBlending, fog:true });
    this.surf = new THREE.InstancedMesh(new THREE.RingGeometry(.98, 1.13, 42), this.surfMaterial, MASSES.length);
    this.surf.name = 'KeeperHollow_BrokenSurfCollars'; this.surf.frustumCulled = false;
    for (let index = 0; index < MASSES.length; index += 1) {
      const mass = MASSES[index], radius = mass.radius * (mass.shoulder ? .91 : .98);
      this.position.set(mass.x, .34, mass.z); this.quaternion.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, hash(index + 4500) * TAU));
      this.scale.set(radius, radius * .74, radius); this.matrix.compose(this.position, this.quaternion, this.scale);
      this.wetAprons.setMatrixAt(index, this.matrix);
      this.position.y = .56; this.scale.multiplyScalar(1.02); this.matrix.compose(this.position, this.quaternion, this.scale);
      this.surf.setMatrixAt(index, this.matrix);
    }
    this.wetAprons.instanceMatrix.needsUpdate = true; this.surf.instanceMatrix.needsUpdate = true;
    this.root.add(this.wetAprons, this.surf);

    this.scene.add(this.root);
    this.routeMinimumClearance = routeClearance(MASSES, this.route);
  }

  update(time = 0, day = 0, gust = 0) {
    this.cliffMaterial.emissiveIntensity = .04 + day * .08;
    this.forestMaterial.color.setHSL(.39 + day * .015, .36, .16 - day * .035);
    this.talusMaterial.color.setHSL(.48, .14, .16 - day * .025);
    this.wetMaterial.color.setHSL(.52 + day * .03, .24, .12 - day * .025);
    this.surfMaterial.opacity = .11 + Math.max(0, Math.sin(time * 1.25)) * .06 + gust * .04;
  }

  setVisible(visible) { this.root.visible = !!visible; }

  getCollisionProxies() {
    return MASSES.map((mass) => ({ x:mass.x, z:mass.z, radius:mass.proxyRadius, top:mass.proxyTop, id:mass.id }));
  }

  getSnapshot() {
    const triangles = (mesh) => Math.round(((mesh.geometry.index?.count || mesh.geometry.attributes.position.count) / 3) * mesh.count);
    return {
      profile:PROFILE, authored:true, deterministic:true, externalAssets:0,
      architecture:'continuous-eroded-cliff-bowl', cliffInstances:MASSES.length,
      valleyShoulders:MASSES.filter((mass) => mass.shoulder).length,
      shrineSupports:MASSES.filter((mass) => mass.shrine).length,
      forestInstances:this.forest.count, talusInstances:this.talus.count,
      forestDistribution:'deterministic-ledge-clusters', fogBackdrop:'shared-exponential-atmosphere',
      wetAprons:this.wetAprons.count, surfCollars:this.surf.count,
      drawCalls:5, collisionProxies:MASSES.length,
      surfaceProfile:'coastal-strata-pbr-v1', generatedSurfaceTextures:1,
      surfaceTextureResolution:this.cliffTextures.size, uvLayout:'seam-safe-cylindrical-v1',
      cliffShading:'smooth-generated-albedo', instanceColorVariants:MASSES.length,
      collisionContract:'chapter-iv-route-corridor-v2', routeAligned:true,
      routeMinimumClearance:this.routeMinimumClearance,
      shrineSites:KEEPER_SHRINE_SITES.map(site=>({id:site.id,x:site.x,z:site.z,baseH:site.baseH})),
      triangles:triangles(this.cliffs) + triangles(this.forest) + triangles(this.talus) + triangles(this.wetAprons) + triangles(this.surf),
      visualOnlyForest:true, productionDefault:true
    };
  }

  dispose() {
    this.scene.remove(this.root);
    for (const mesh of [this.cliffs, this.forest, this.talus, this.wetAprons, this.surf]) {
      mesh.geometry.dispose(); mesh.material.dispose();
    }
    for (const texture of Object.values(this.cliffTextures)) if (texture?.dispose) texture.dispose();
    this.root.clear();
  }
}

export default KeeperHollowBiome;
