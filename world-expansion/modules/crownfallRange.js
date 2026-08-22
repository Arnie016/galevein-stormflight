import * as THREE from 'three';

const PROFILE = 'crownfall-range-v2';
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
  const strata = deterministicNoise(nx, nz) * (16 + 18 * (1 - radial));
  const mass = 42 + 338 * crown + 174 * westPeak + 142 * eastPeak + 250 * east + 342 * stormscar +
    230 * south + 192 * north + 116 * ridge - 138 * pass + strata;
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
  const exposure = smoothstep(.28, .72, slope);
  if (t < .07) target.copy(wet).lerp(basalt, t / .07);
  else if (t < .48) target.copy(heath).lerp(lichen, clamp01((noise + .7) * .42));
  else target.copy(upper);
  target.lerp(basalt, exposure * (.55 + t * .25));
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
      name: 'Crownfall_SlopeBiomes_MicroStrata', vertexColors: true, roughness: .94,
      metalness: .015, flatShading: false, fog: true,
      emissive: 0x10191a, emissiveIntensity: .08,
      normalMap: this.detailTextures.normal,
      normalScale: new THREE.Vector2(.18, .18), roughnessMap: this.detailTextures.roughness
    });
    this.lod = new THREE.LOD();
    this.lod.name = 'Crownfall_TerrainLOD';
    this.lodLevels = [
      { distance: 0, segments: [64, 48] },
      { distance: 900, segments: [32, 24] },
      { distance: 1650, segments: [20, 15] }
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
    const dummy = new THREE.Object3D();
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
      maxDrawCalls: 5,
      collisionProxies: this.proxies.length,
      routeLaneRadius: LANE_RADIUS,
      minRouteClearance: this.routeClearance == null ? null : +this.routeClearance.toFixed(1),
      waterline: 'irregular-contour-animated-surf',
      surfaceProfile: 'slope-biomes-generated-microstrata-v2',
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
    this.foam.geometry.dispose(); this.foamMaterial.dispose();
    this.waterfalls.geometry.dispose(); this.waterfalls.material.dispose();
    this.shelfLights.geometry.dispose(); this.shelfLights.material.dispose();
  }
}
