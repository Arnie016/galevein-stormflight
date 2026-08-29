import * as THREE from 'three';

const PROFILE = 'crownfall-range-v3';
const ANCHOR = Object.freeze([-850, 0, -250]);
const FOOTPRINT = Object.freeze({ width: 980, depth: 740, maxHeight: 560 });
const LANE_RADIUS = 22;

const DISTRICTS = Object.freeze([
  { id: 'crownfall-summit', name: 'Crownfall Summit', role: 'story landmark', position: [-990, 468, -270] },
  { id: 'stormscar-shelf', name: 'Stormscar Shelf', role: 'PvP arena', position: [-430, 178, -250] },
  { id: 'gale-cut', name: 'Gale Cut', role: 'flight pass', position: [-470, 72, -210] },
  { id: 'undercroft', name: 'The Undercroft', role: 'future quest entrance', position: [-530, 48, -390] }
]);

function clamp01(value) { return Math.min(1, Math.max(0, value)); }
function smoothstep(edge0, edge1, value) {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}
function gaussian(x, z, cx, cz, sx, sz) {
  const dx = (x - cx) / sx, dz = (z - cz) / sz;
  return Math.exp(-(dx * dx + dz * dz) * 1.45);
}
function deterministicNoise(x, z) {
  return Math.sin(x * 19.7 + z * 11.3) * .5 + Math.sin(x * 43.1 - z * 31.7) * .28 + Math.cos(x * 73.9 + z * 57.1) * .22;
}

function hash2(x, z) {
  const value = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
  return value - Math.floor(value);
}

function valueNoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return (a + (b - a) * ux) + ((c + (d - c) * ux) - (a + (b - a) * ux)) * uz;
}

function fbm(x, z, octaves = 5) {
  let value = 0, amplitude = .52, frequency = 1, normalization = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    value += valueNoise(x * frequency, z * frequency) * amplitude;
    normalization += amplitude; frequency *= 2.03; amplitude *= .49;
  }
  return value / normalization;
}

function ridgedFbm(x, z) {
  let value = 0, amplitude = .56, frequency = 1, normalization = 0;
  for (let octave = 0; octave < 5; octave += 1) {
    const ridge = 1 - Math.abs(valueNoise(x * frequency, z * frequency) * 2 - 1);
    value += ridge * ridge * amplitude;
    normalization += amplitude; frequency *= 2.11; amplitude *= .47;
  }
  return value / normalization;
}

function terrainHeight(nx, nz) {
  const radial = Math.hypot(nx * 1.02, nz * 1.12);
  const island = smoothstep(1.06, .69, radial);
  const crown = gaussian(nx, nz, -.29, -.03, .31, .40);
  const westPeak = gaussian(nx, nz, -.43, -.12, .13, .19);
  const eastPeak = gaussian(nx, nz, -.16, .11, .14, .18);
  const east = gaussian(nx, nz, .39, .14, .25, .31);
  const stormscar = gaussian(nx, nz, .79, .02, .20, .30);
  const south = gaussian(nx, nz, .06, -.48, .31, .23);
  const north = gaussian(nx, nz, .02, .48, .27, .24);
  const ridge = Math.exp(-Math.pow((nz + .04 + Math.sin(nx * 3.8) * .11) / .22, 2)) * (1 - Math.min(.75, Math.abs(nx) * .48));
  const pass = gaussian(nx, nz, .74, .08, .12, .32);
  const erosion = (ridgedFbm(nx * 2.45 + 4.7, nz * 2.45 - 2.1) - .48) * (62 + crown * 96);
  const weathering = (fbm(nx * 5.1 + 9.2, nz * 5.1 - 6.4) - .5) * (34 + 25 * (1 - radial));
  const channelSignal = Math.abs(fbm(nx * 3.4 - 8.3, nz * 3.4 + 1.7) * 2 - 1);
  const gullies = Math.pow(Math.max(0, .22 - channelSignal) / .22, 2) * (18 + 42 * smoothstep(.08, .82, crown + east + stormscar));
  const strata = deterministicNoise(nx, nz) * (7 + 9 * (1 - radial));
  const mass = 42 + 338 * crown + 174 * westPeak + 142 * eastPeak + 250 * east + 342 * stormscar +
    230 * south + 192 * north + 116 * ridge - 138 * pass + strata + erosion + weathering - gullies;
  return Math.max(-30, Math.min(FOOTPRINT.maxHeight, -30 + island * mass));
}

function terrainSlope(nx, nz) {
  const epsilon = .008;
  const dx = (terrainHeight(nx + epsilon, nz) - terrainHeight(nx - epsilon, nz)) / (epsilon * FOOTPRINT.width);
  const dz = (terrainHeight(nx, nz + epsilon) - terrainHeight(nx, nz - epsilon)) / (epsilon * FOOTPRINT.depth);
  return Math.hypot(dx, dz);
}

function colorAt(height, nx, nz, slope, target) {
  const wet = new THREE.Color(0x213039);
  const basalt = new THREE.Color(0x3c4a4d);
  const heath = new THREE.Color(0x516757);
  const lichen = new THREE.Color(0x71806a);
  const upper = new THREE.Color(0x74777a);
  const crown = new THREE.Color(0xd5dcde);
  const t = clamp01(height / FOOTPRINT.maxHeight);
  const noise = deterministicNoise(nx * 1.8, nz * 1.8);
  const exposure = smoothstep(.08, .36, slope);
  if (t < .07) target.copy(wet).lerp(basalt, t / .07);
  else target.copy(basalt).lerp(upper, smoothstep(.52, .82, t) * .58);
  const ledgeGreen = (1 - exposure) * smoothstep(.07, .18, t) * (1 - smoothstep(.54, .74, t));
  const green = heath.clone().lerp(lichen, clamp01((noise + .7) * .42));
  target.lerp(green, ledgeGreen * .82);
  const snow = smoothstep(.68, .90, t) * (1 - smoothstep(.46, .92, slope)) * smoothstep(-.42, .30, noise);
  target.lerp(crown, snow);
  const striation = .975 + .035 * Math.sin(height * .08 + nx * 17 - nz * 13) * (.35 + exposure * .65);
  target.multiplyScalar(striation);
}

function surfaceSignal(u, v) {
  const tau = Math.PI * 2;
  return Math.sin(u * tau * 5 + Math.sin(v * tau * 2) * .7) * .46 +
    Math.cos(v * tau * 7 - Math.sin(u * tau * 3) * .5) * .31 +
    Math.sin((u + v) * tau * 13) * .15 + Math.cos((u - v) * tau * 19) * .08;
}

function terrainDetailTextures(size = 256) {
  const normal = new Uint8Array(size * size * 4);
  const roughness = new Uint8Array(size * size * 4);
  const step = 1 / size;
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
    const u = x / size, v = y / size, signal = surfaceSignal(u, v);
    const dx = surfaceSignal(u + step, v) - surfaceSignal(u - step, v);
    const dz = surfaceSignal(u, v + step) - surfaceSignal(u, v - step);
    const nx = -dx * 2.0, ny = -dz * 2.0, nz = 1, length = Math.hypot(nx, ny, nz);
    const index = (y * size + x) * 4;
    normal[index] = Math.round((nx / length * .5 + .5) * 255);
    normal[index + 1] = Math.round((ny / length * .5 + .5) * 255);
    normal[index + 2] = Math.round((nz / length * .5 + .5) * 255); normal[index + 3] = 255;
    const rough = Math.round(228 + Math.abs(signal) * 18);
    roughness[index] = roughness[index + 1] = roughness[index + 2] = rough; roughness[index + 3] = 255;
  }
  const make = (data) => {
    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(3, 2);
    texture.anisotropy = 4;
    texture.needsUpdate = true; return texture;
  };
  return { normal: make(normal), roughness: make(roughness), size };
}

function terrainGeometry(xSegments, zSegments) {
  const columns = xSegments + 1, rows = zSegments + 1;
  const positions = new Float32Array(columns * rows * 3);
  const colors = new Float32Array(columns * rows * 3);
  const uvs = new Float32Array(columns * rows * 2);
  const indices = [];
  const color = new THREE.Color();
  let ptr = 0;
  for (let z = 0; z <= zSegments; z += 1) {
    const nz = z / zSegments * 2 - 1;
    for (let x = 0; x <= xSegments; x += 1) {
      const nx = x / xSegments * 2 - 1;
      const y = terrainHeight(nx, nz);
      positions[ptr] = nx * FOOTPRINT.width * .5;
      positions[ptr + 1] = y;
      positions[ptr + 2] = nz * FOOTPRINT.depth * .5;
      colorAt(y, nx, nz, terrainSlope(nx, nz), color);
      colors[ptr] = color.r; colors[ptr + 1] = color.g; colors[ptr + 2] = color.b;
      const uv = (z * columns + x) * 2; uvs[uv] = x / xSegments; uvs[uv + 1] = z / zSegments;
      ptr += 3;
    }
  }
  for (let z = 0; z < zSegments; z += 1) {
    for (let x = 0; x < xSegments; x += 1) {
      const a = z * columns + x, b = a + 1, c = a + columns, d = c + 1;
      const ay = positions[a * 3 + 1], by = positions[b * 3 + 1];
      const cy = positions[c * 3 + 1], dy = positions[d * 3 + 1];
      // Do not render the submerged rectangular heightfield skirt. The ocean
      // is a separate WebGPU canvas, so even below-water triangles can read as
      // a square platform through reflections. Retain only shoreline-crossing
      // and dry cells, yielding the actual irregular island silhouette.
      if (Math.max(ay, by, cy, dy) < -2) continue;
      if ((x + z) % 2) indices.push(a, c, b, b, c, d);
      else indices.push(a, c, d, a, d, b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function coastlineSamples(segments = 160) {
  const points = [];
  for (let index = 0; index <= segments; index += 1) {
    const angle = index / segments * Math.PI * 2;
    const dx = Math.cos(angle), dz = Math.sin(angle);
    let coastRadius = .35;
    for (let step = 1; step <= 80; step += 1) {
      const radius = .35 + step / 80 * .78;
      if (terrainHeight(dx * radius, dz * radius) > 1.5) coastRadius = radius;
    }
    const pulse = deterministicNoise(dx * 1.7, dz * 1.7) * .004;
    points.push({ dx, dz, radius: coastRadius + pulse });
  }
  return points;
}

function shorelineGeometry(points) {
  const positions = new Float32Array(points.length * 2 * 3);
  const indices = [];
  points.forEach(({ dx, dz, radius }, index) => {
    const inner = Math.max(.25, radius - .010);
    const outer = radius + .016;
    const base = index * 6;
    positions[base] = dx * inner * FOOTPRINT.width * .5;
    positions[base + 1] = 1.4;
    positions[base + 2] = dz * inner * FOOTPRINT.depth * .5;
    positions[base + 3] = dx * outer * FOOTPRINT.width * .5;
    positions[base + 4] = 1.15;
    positions[base + 5] = dz * outer * FOOTPRINT.depth * .5;
    if (index < points.length - 1) {
      const a = index * 2, b = a + 1, c = a + 2, d = a + 3;
      indices.push(a, c, b, b, c, d);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function cliffGeometry(points) {
  const positions = new Float32Array(points.length * 2 * 3);
  const indices = [];
  points.forEach(({ dx, dz, radius }, index) => {
    const nx = dx * radius, nz = dz * radius;
    const top = Math.max(2.5, terrainHeight(nx, nz));
    const base = index * 6;
    positions[base] = nx * FOOTPRINT.width * .5;
    positions[base + 1] = top;
    positions[base + 2] = nz * FOOTPRINT.depth * .5;
    positions[base + 3] = positions[base];
    positions[base + 4] = -58;
    positions[base + 5] = positions[base + 2];
    if (index < points.length - 1) {
      const a = index * 2, b = a + 1, c = a + 2, d = a + 3;
      indices.push(a, b, c, c, b, d);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function forestSamples(limit = 150) {
  const samples = [];
  for (let index = 0; index < 5200 && samples.length < limit; index += 1) {
    const nx = -0.91 + hash2(index, 17) * 1.72;
    const nz = -0.88 + hash2(index, 31) * 1.76;
    const height = terrainHeight(nx, nz), slope = terrainSlope(nx, nz);
    const shelfReserve = Math.hypot(nx - .40, nz - .15) < .17;
    const passReserve = nx > .58 && Math.abs(nz - .08) < .24;
    if (height < 34 || height > 292 || slope > .58 || shelfReserve || passReserve) continue;
    samples.push({ nx, nz, height, scale: .72 + hash2(index, 59) * .7, yaw: hash2(index, 73) * Math.PI * 2 });
  }
  return samples;
}

function layeredConiferGeometry(radialSegments = 7) {
  const profile = [[-.08,.13],[0,.10],[.17,.08],[.19,.44],[.36,.13],[.34,.38],[.53,.10],[.50,.31],[.70,.07],[.67,.23],[.86,.035],[1,0]];
  const positions = [], indices = [];
  for (let ring = 0; ring < profile.length; ring += 1) {
    const [y, radius] = profile[ring];
    for (let segment = 0; segment < radialSegments; segment += 1) {
      const angle = segment / radialSegments * Math.PI * 2;
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

function talusSamples(coast, limit = 128) {
  const samples = [];
  for (let index = 0; index < limit; index += 1) {
    const coastIndex = Math.floor(index / limit * (coast.length - 1));
    const point = coast[coastIndex];
    const radialJitter = (hash2(index, 91) - .5) * .032;
    const nx = point.dx * (point.radius + radialJitter);
    const nz = point.dz * (point.radius + radialJitter);
    samples.push({ nx, nz, scale: 1.8 + hash2(index, 107) * 5.4, yaw: hash2(index, 131) * Math.PI * 2 });
  }
  return samples;
}

function distanceToSegment2D(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az, wx = px - ax, wz = pz - az;
  const denom = vx * vx + vz * vz;
  const t = denom ? clamp01((wx * vx + wz * vz) / denom) : 0;
  return Math.hypot(px - (ax + vx * t), pz - (az + vz * t));
}

export class CrownfallRange {
  constructor(scene, options = {}) {
    if (!scene?.add) throw new TypeError('CrownfallRange requires a Three.js scene.');
    this.scene = scene;
    this.anchor = new THREE.Vector3(...(options.anchor ?? ANCHOR));
    this.root = new THREE.Group();
    this.root.name = 'CrownfallRange_AuthoredMacroLandmass';
    this.root.position.copy(this.anchor);
    this.root.userData.profile = PROFILE;
    this.scene.add(this.root);

    this.detailTextures = terrainDetailTextures();
    this.terrainMaterial = new THREE.MeshStandardMaterial({
      name: 'Crownfall_CoastalErosionBiomes', vertexColors: true, roughness: .96,
      metalness: .015, flatShading: true, fog: true,
      emissive: 0x10191a, emissiveIntensity: .08,
      normalMap: this.detailTextures.normal,
      normalScale: new THREE.Vector2(.18, .18), roughnessMap: this.detailTextures.roughness
    });
    this.lod = new THREE.LOD();
    this.lod.name = 'Crownfall_TerrainLOD';
    this.lodLevels = [
      { distance: 0, segments: [144, 108] },
      { distance: 1450, segments: [72, 54] },
      { distance: 2550, segments: [36, 27] }
    ].map((spec, index) => {
      const geometry = terrainGeometry(...spec.segments);
      const mesh = new THREE.Mesh(geometry, this.terrainMaterial);
      mesh.name = `Crownfall_LOD${index}`;
      mesh.receiveShadow = true;
      mesh.castShadow = index === 0;
      this.lod.addLevel(mesh, spec.distance);
      return { ...spec, triangles: geometry.index.count / 3 };
    });
    this.root.add(this.lod);

    const coast = coastlineSamples();
    this.cliffMaterial = new THREE.MeshStandardMaterial({
      color: 0x263940, roughness: .96, metalness: .01, fog: true,
      emissive: 0x0a1114, emissiveIntensity: .10, flatShading: true
    });
    this.cliffs = new THREE.Mesh(cliffGeometry(coast), this.cliffMaterial);
    this.cliffs.name = 'Crownfall_SubmergedCliffSkirt';
    this.cliffs.castShadow = true;
    this.cliffs.receiveShadow = true;
    this.root.add(this.cliffs);

    const dummy = new THREE.Object3D();
    const talus = talusSamples(coast);
    const talusGeometry = new THREE.IcosahedronGeometry(1, 1);
    const talusMaterial = new THREE.MeshStandardMaterial({
      color: 0x2b3739, roughness: 1, metalness: 0, flatShading: true, fog: true
    });
    this.talus = new THREE.InstancedMesh(talusGeometry, talusMaterial, talus.length);
    this.talus.name = 'Crownfall_ShoreTalus';
    talus.forEach((rock, index) => {
      dummy.position.set(rock.nx * FOOTPRINT.width * .5, 1.7 + rock.scale * .22, rock.nz * FOOTPRINT.depth * .5);
      dummy.rotation.set(hash2(index, 149) * .55, rock.yaw, hash2(index, 163) * .42);
      dummy.scale.set(rock.scale * (1.2 + hash2(index, 179)), rock.scale * (.48 + hash2(index, 191) * .42), rock.scale);
      dummy.updateMatrix(); this.talus.setMatrixAt(index, dummy.matrix);
    });
    this.talus.instanceMatrix.needsUpdate = true;
    this.talus.castShadow = true; this.talus.receiveShadow = true;
    this.root.add(this.talus);

    const forest = forestSamples();
    const forestGeometry = layeredConiferGeometry();
    const forestMaterial = new THREE.MeshStandardMaterial({
      color: 0x183128, roughness: 1, flatShading: true, fog: true,
      emissive: 0x07100d, emissiveIntensity: .08
    });
    this.forest = new THREE.InstancedMesh(forestGeometry, forestMaterial, forest.length);
    this.forest.name = 'Crownfall_ForestLedgeBelts';
    forest.forEach((tree, index) => {
      const height = 7 + tree.scale * 7, width = height * (.86 + hash2(index, 211) * .14);
      dummy.position.set(tree.nx * FOOTPRINT.width * .5, tree.height, tree.nz * FOOTPRINT.depth * .5);
      dummy.rotation.set(0, tree.yaw, 0); dummy.scale.set(width, height, width);
      dummy.updateMatrix(); this.forest.setMatrixAt(index, dummy.matrix);
    });
    this.forest.instanceMatrix.needsUpdate = true;
    this.forest.castShadow = true; this.forest.receiveShadow = true;
    this.root.add(this.forest);

    this.foamMaterial = new THREE.MeshBasicMaterial({
      color: 0xb9d7dc, transparent: true, opacity: .18, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: true
    });
    this.foam = new THREE.Mesh(shorelineGeometry(coast), this.foamMaterial);
    this.foam.name = 'Crownfall_IrregularSurfContour';
    this.root.add(this.foam);

    const falls = [[.69, -.31, 6], [.73, .02, 4], [.64, .37, 5]];
    const fallMaterial = new THREE.MeshBasicMaterial({
      color: 0x7fc5cf, transparent: true, opacity: .30, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: true
    });
    this.waterfalls = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), fallMaterial, falls.length);
    this.waterfalls.name = 'Crownfall_Waterfalls';
    falls.forEach(([nx, nz, width], index) => {
      const top = Math.max(42, terrainHeight(nx, nz) * .82), height = Math.max(32, top - 4);
      dummy.position.set(nx * FOOTPRINT.width * .5 + 3, 4 + height * .5, nz * FOOTPRINT.depth * .5);
      dummy.rotation.set(0, Math.PI / 2, 0);
      dummy.scale.set(width, height, 1);
      dummy.updateMatrix(); this.waterfalls.setMatrixAt(index, dummy.matrix);
    });
    this.waterfalls.instanceMatrix.needsUpdate = true;
    this.root.add(this.waterfalls);

    const lightMaterial = new THREE.MeshBasicMaterial({ color: 0xffc477, toneMapped: true, fog: true });
    this.shelfLights = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.2, 0), lightMaterial, 16);
    this.shelfLights.name = 'Stormscar_SettlementLights';
    for (let index = 0; index < 16; index += 1) {
      const angle = index / 16 * Math.PI * 1.55 - Math.PI * .75;
      const nx = .40 + Math.cos(angle) * (.085 + (index % 3) * .012);
      const nz = .15 + Math.sin(angle) * (.11 + (index % 2) * .016);
      dummy.position.set(nx * FOOTPRINT.width * .5, terrainHeight(nx, nz) + 3.5, nz * FOOTPRINT.depth * .5);
      dummy.scale.setScalar(.8 + (index % 4) * .12);
      dummy.rotation.set(0, angle, 0); dummy.updateMatrix(); this.shelfLights.setMatrixAt(index, dummy.matrix);
    }
    this.shelfLights.instanceMatrix.needsUpdate = true;
    this.root.add(this.shelfLights);

    this.proxies = [
      { id: 'crownfall-crown', x: -990, z: -270, radius: 175, top: 520 },
      { id: 'stormscar-shoulder', x: -640, z: -190, radius: 135, top: 350 },
      { id: 'crownfall-south', x: -810, z: -440, radius: 120, top: 310 },
      { id: 'crownfall-north', x: -780, z: -70, radius: 100, top: 260 }
    ];
    this.route = [];
    this.routeClearance = null;
  }

  setRoute(route = []) {
    this.route = route.map((point) => point.slice(0, 3).map(Number));
    let minimum = Infinity;
    for (const proxy of this.proxies) {
      for (let index = 0; index < this.route.length - 1; index += 1) {
        const a = this.route[index], b = this.route[index + 1];
        const gap = distanceToSegment2D(proxy.x, proxy.z, a[0], a[2], b[0], b[2]) - proxy.radius - LANE_RADIUS;
        minimum = Math.min(minimum, gap);
      }
    }
    this.routeClearance = Number.isFinite(minimum) ? minimum : null;
    return this.routeClearance;
  }

  getCollisionProxies() { return this.proxies.map((proxy) => ({ ...proxy })); }

  update(time = 0, day = 0) {
    this.foamMaterial.opacity = .14 + Math.sin(time * .72) * .035 + (1 - day) * .025;
    this.foam.position.y = Math.sin(time * .58) * .22;
    this.waterfalls.material.opacity = .24 + Math.sin(time * 1.15) * .055;
    this.shelfLights.material.color.setHSL(.095, .82, .62 + (1 - day) * .08);
  }

  getSnapshot() {
    return {
      profile: PROFILE,
      authored: true,
      procedural: true,
      externalAssets: 0,
      anchor: this.anchor.toArray(),
      footprint: { ...FOOTPRINT },
      heightToOceanRatio: +(FOOTPRINT.maxHeight / FOOTPRINT.width).toFixed(3),
      districts: DISTRICTS.map((district) => ({ ...district, position: district.position.slice() })),
      lodTriangles: this.lodLevels.map((level) => level.triangles),
      maxDrawCalls: 7,
      collisionProxies: this.proxies.length,
      routeLaneRadius: LANE_RADIUS,
      minRouteClearance: this.routeClearance == null ? null : +this.routeClearance.toFixed(1),
      waterline: 'irregular-contour-animated-surf',
      surfaceProfile: 'coastal-erosion-biomes-v3',
      coastalGeology: 'fractured-basalt-gullies-green-ledges',
      shoreTalus: this.talus.count,
      forestInstances: this.forest.count,
      generatedSurfaceTextures: 2,
      surfaceTextureResolution: this.detailTextures.size,
      silhouette: 'twin-peak-summit-connected-stormscar-shoulder',
      navigationHierarchy: ['Crownfall macro landmark', 'four named districts', 'twelve-beacon route']
    };
  }

  dispose() {
    this.scene.remove(this.root);
    for (const level of this.lod.levels) level.object.geometry.dispose();
    this.terrainMaterial.dispose();
    this.detailTextures.normal.dispose(); this.detailTextures.roughness.dispose();
    this.cliffs.geometry.dispose(); this.cliffMaterial.dispose();
    this.talus.geometry.dispose(); this.talus.material.dispose();
    this.forest.geometry.dispose(); this.forest.material.dispose();
    this.foam.geometry.dispose(); this.foamMaterial.dispose();
    this.waterfalls.geometry.dispose(); this.waterfalls.material.dispose();
    this.shelfLights.geometry.dispose(); this.shelfLights.material.dispose();
  }
}
