// Keeper Hollow replaces the unrelated central rock pile with one authored,
// deterministic coastal valley. Render geometry and collision authority remain
// separate: the original six obstacle proxies are preserved exactly, while the
// new outer shoulders use explicit route-checked proxies.
import * as THREE from 'three';

const TAU = Math.PI * 2;
const PROFILE = 'keeper-hollow-biome-v1';
const FOREST_COUNT = 520;
const TALUS_COUNT = 112;

function hash(index) {
  let value = Math.imul(index + 1, 0x9e3779b1);
  value ^= value >>> 16; value = Math.imul(value, 0x85ebca6b); value ^= value >>> 13;
  return (value >>> 0) / 4294967295;
}

function cliffRadius(v) {
  const shelves = Math.sin(v * Math.PI * 5.2) * .055 + Math.sin(v * Math.PI * 11.0) * .025;
  return Math.max(.16, Math.pow(1 - v, .58) * (.93 + shelves) + .10);
}

function erodedCliffGeometry(radialSegments = 24, tiers = 18) {
  const positions = [], colors = [], indices = [];
  const low = new THREE.Color(0x263331);
  const rock = new THREE.Color(0x61716a);
  const moss = new THREE.Color(0x3a5a45);
  const lichen = new THREE.Color(0x99a69d);
  const color = new THREE.Color();
  for (let tier = 0; tier <= tiers; tier += 1) {
    const v = tier / tiers;
    const radius = cliffRadius(v);
    for (let segment = 0; segment < radialSegments; segment += 1) {
      const angle = segment / radialSegments * TAU;
      const fracture = .82 + hash(tier * 131 + segment * 17) * .34;
      const gullies = 1 - Math.pow(Math.max(0, Math.sin(angle * 3.0 + v * 7.4)), 5) * (.05 + v * .08);
      const leanX = v * v * .11, leanZ = -v * v * .07;
      positions.push(Math.cos(angle) * radius * fracture * gullies + leanX, v, Math.sin(angle) * radius * fracture * gullies + leanZ);
      const ledge = Math.max(0, Math.sin(v * Math.PI * 5.2 - .4));
      color.copy(low).lerp(rock, .28 + v * .46).lerp(moss, ledge * .38).lerp(lichen, Math.max(0, v - .76) * 1.55);
      const shade = .82 + hash(9000 + tier * 71 + segment) * .25;
      colors.push(color.r * shade, color.g * shade, color.b * shade);
    }
  }
  for (let tier = 0; tier < tiers; tier += 1) {
    for (let segment = 0; segment < radialSegments; segment += 1) {
      const next = (segment + 1) % radialSegments;
      const a = tier * radialSegments + segment, b = tier * radialSegments + next;
      const c = (tier + 1) * radialSegments + segment, d = (tier + 1) * radialSegments + next;
      if ((tier + segment) % 2) indices.push(a, c, b, b, c, d);
      else indices.push(a, c, d, a, d, b);
    }
  }
  const topCenter = positions.length / 3;
  positions.push(.11, 1.01, -.07); colors.push(lichen.r, lichen.g, lichen.b);
  const topRing = tiers * radialSegments;
  for (let segment = 0; segment < radialSegments; segment += 1) {
    indices.push(topCenter, topRing + segment, topRing + (segment + 1) % radialSegments);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
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

// The first six entries preserve the old rock() collision positions/radii/tops.
// Two more low stacks seat the formerly floating east and west shrines. The
// remaining shoulders frame the route from outside its protected lane.
const MASSES = Object.freeze([
  { id:'hollow-heart', x:0, z:0, radius:34, top:46, proxyRadius:27.88, proxyTop:46, legacy:true, shrine:true },
  { id:'east-fin', x:58, z:32, radius:20, top:32, proxyRadius:14.76, proxyTop:32, legacy:true },
  { id:'west-fin', x:-64, z:-22, radius:18, top:38, proxyRadius:13.12, proxyTop:38, legacy:true },
  { id:'south-tooth', x:34, z:-58, radius:15, top:24, proxyRadius:10.66, proxyTop:24, legacy:true },
  { id:'north-tooth', x:-30, z:70, radius:16, top:28, proxyRadius:11.48, proxyTop:28, legacy:true },
  { id:'east-tooth', x:90, z:-30, radius:14, top:22, proxyRadius:9.84, proxyTop:22, legacy:true },
  { id:'east-shrine-seat', x:120, z:90, radius:24, top:30, proxyRadius:16, proxyTop:30, shrine:true },
  { id:'west-shrine-seat', x:-140, z:60, radius:28, top:34, proxyRadius:18, proxyTop:34, shrine:true },
  { id:'northwest-wall', x:-300, z:0, radius:70, top:168, proxyRadius:40, proxyTop:168, shoulder:true },
  { id:'north-mist-wall', x:-100, z:300, radius:110, top:226, proxyRadius:64, proxyTop:226, shoulder:true },
  { id:'north-crown', x:100, z:400, radius:115, top:254, proxyRadius:67, proxyTop:254, shoulder:true },
  { id:'northeast-gate', x:300, z:500, radius:120, top:272, proxyRadius:70, proxyTop:272, shoulder:true },
  { id:'east-rampart', x:600, z:0, radius:110, top:232, proxyRadius:64, proxyTop:232, shoulder:true },
  { id:'southeast-wall', x:600, z:-200, radius:110, top:246, proxyRadius:64, proxyTop:246, shoulder:true },
  { id:'south-crown', x:0, z:-700, radius:120, top:268, proxyRadius:70, proxyTop:268, shoulder:true },
  { id:'southwest-wall', x:-500, z:-400, radius:110, top:242, proxyRadius:64, proxyTop:242, shoulder:true }
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

    this.cliffMaterial = new THREE.MeshStandardMaterial({
      color:0xffffff, vertexColors:true, roughness:.96, metalness:.015,
      flatShading:true, fog:true, emissive:0x08100f, emissiveIntensity:.05
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
    }
    this.cliffs.instanceMatrix.needsUpdate = true;
    this.root.add(this.cliffs);

    this.forestMaterial = new THREE.MeshStandardMaterial({
      color:0x1f4235, roughness:1, flatShading:true, fog:true,
      emissive:0x07120d, emissiveIntensity:.08
    });
    this.forest = new THREE.InstancedMesh(coniferGeometry(), this.forestMaterial, FOREST_COUNT);
    this.forest.name = 'KeeperHollow_LedgeForest'; this.forest.frustumCulled = false;
    const forestShoulders = MASSES.filter((mass) => mass.shoulder);
    const forestSeats = MASSES.filter((mass) => mass.shrine && !mass.legacy);
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
      legacyCoreProxiesPreserved:MASSES.filter((mass) => mass.legacy).length === 6,
      routeMinimumClearance:this.routeMinimumClearance,
      triangles:triangles(this.cliffs) + triangles(this.forest) + triangles(this.talus) + triangles(this.wetAprons) + triangles(this.surf),
      visualOnlyForest:true, productionDefault:true
    };
  }

  dispose() {
    this.scene.remove(this.root);
    for (const mesh of [this.cliffs, this.forest, this.talus, this.wetAprons, this.surf]) {
      mesh.geometry.dispose(); mesh.material.dispose();
    }
    this.root.clear();
  }
}

export default KeeperHollowBiome;
