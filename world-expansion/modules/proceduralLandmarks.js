// Procedural landmark geometry for Galevein: Stormflight.
//
// Why this exists: the licensed landmark GLBs are 16-20 KB of untextured, near-empty
// geometry that loaded at 3.5-14 world units. At the 200-1500 unit range the player
// actually sees them they subtended a handful of pixels, so three separate art passes
// concluded "the landmarks look wrong" without the lighting ever being the cause.
//
// Everything here is generated in code at load, so there is no asset to license, no
// download, and detail is bounded by an explicit triangle/draw budget instead of by
// whatever an asset pack happened to contain.
//
// Design rules that keep this inside the frame budget:
//   * One shared stone material and one shared signal material for the whole feature,
//     so palette variety comes from baked vertex colours rather than material count.
//   * Every structure merges down to at most two meshes per LOD level, so a visible
//     landmark costs two draw calls no matter how many parts it was authored from.
//   * Three real LOD levels. The far level is a silhouette shell plus lit window
//     strips, which is what a landmark actually contributes at 1.2 km.
//   * Geometry is built once, synchronously, at load. Nothing here allocates per frame.
//
// Readability rules, which is the part the earlier passes missed:
//   * Pierced openings. Sky visible through a structure is the single strongest
//     "this is built, not terrain" cue at distance, so every archetype has real voids.
//   * Horizontal banding. Overhanging cornices at regular intervals read as floors.
//   * Rhythmic repetition: arcade bays, window rows, colonnades, rib pairs.
//   * Straight tops and right angles, against terrain that is all cones and ridges.
//   * Rows of lit windows, which is what actually sells a dusk silhouette.
import * as THREE from 'three';

const TAU = Math.PI * 2;

/* ------------------------------------------------------------------ budget --- */

// Deliberately tight. If a future edit pushes past these the build throws at load
// rather than quietly costing frame time that nobody attributes back to this file.
//
// The far cap is sized so that all twelve sites being far at once costs about 14k
// triangles, under a third of the existing 48k-vertex sea mesh. The near cap assumes at
// most two or three sites are ever inside 460 units at once, which the route spacing
// guarantees.
export const LANDMARK_BUDGET = Object.freeze({
  trianglesPerSite: Object.freeze({ 0: 11000, 1: 4200, 2: 1200 }),
  totalTriangles: 150000,
  materials: 2,
  drawCallsPerVisibleSite: 2,
  pointLights: 2
});

const NEAR_DISTANCE = 460;
const MID_DISTANCE = 1150;
const CULL_DISTANCE = 2300;

// How far every water-meeting mass continues below the site origin.
const FOUNDATION_DROP = 34;

/* ------------------------------------------------------------------- random --- */

function makeRandom(seed) {
  let state = (seed | 0) || 1;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------------------------------------------------------------- geometry --- */

// Triangular prism with the ridge running along local X. Pitched roofs are the
// cheapest unambiguous "building" signal there is, and a box will not do it.
function ridgeGeometry(width, height, depth) {
  const hw = width / 2, hd = depth / 2;
  const a = [-hw, 0, -hd], b = [-hw, 0, hd], c = [-hw, height, 0];
  const d = [hw, 0, -hd], e = [hw, 0, hd], f = [hw, height, 0];
  const tris = [
    a, c, b, d, e, f,          // gable ends
    b, c, f, b, f, e,          // +z slope
    a, d, f, a, f, c,          // -z slope
    a, b, e, a, e, d           // underside
  ];
  const positions = new Float32Array(tris.length * 3);
  for (let i = 0; i < tris.length; i += 1) positions.set(tris[i], i * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function triangleCount(geometry) {
  const index = geometry.index;
  return Math.floor((index ? index.count : geometry.attributes.position.count) / 3);
}

// Bakes each part's transform and flat colour into one non-indexed buffer. Non-indexed
// keeps the merge trivial and costs nothing here because part counts are in the low
// hundreds, not the millions.
function mergeParts(parts) {
  if (!parts.length) return null;
  let vertexCount = 0;
  const prepared = parts.map((part) => {
    if (!part.geometry.attributes.normal) part.geometry.computeVertexNormals();
    const flat = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry;
    vertexCount += flat.attributes.position.count;
    return { flat, source: part.geometry, color: part.color };
  });
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  let offset = 0;
  for (const part of prepared) {
    const count = part.flat.attributes.position.count;
    positions.set(part.flat.attributes.position.array, offset * 3);
    normals.set(part.flat.attributes.normal.array, offset * 3);
    for (let i = 0; i < count; i += 1) {
      const at = (offset + i) * 3;
      colors[at] = part.color.r;
      colors[at + 1] = part.color.g;
      colors[at + 2] = part.color.b;
    }
    offset += count;
    if (part.flat !== part.source) part.flat.dispose();
    part.source.dispose();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  return geometry;
}

/* ------------------------------------------------------------------ builder --- */

const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _scale = new THREE.Vector3();

class SiteBuilder {
  constructor(palette, random, detail) {
    this.palette = palette;
    this.random = random;
    this.detail = detail;
    this.stone = [];
    this.signal = [];
  }

  get near() { return this.detail === 0; }
  get mid() { return this.detail <= 1; }
  get far() { return this.detail === 2; }

  jitter(amount) { return 1 + (this.random() - .5) * amount; }

  _put(bucket, geometry, position, rotation, scale, color) {
    _position.set(position[0], position[1], position[2]);
    _euler.set(rotation ? rotation[0] || 0 : 0, rotation ? rotation[1] || 0 : 0, rotation ? rotation[2] || 0 : 0);
    _quaternion.setFromEuler(_euler);
    _scale.set(scale ? scale[0] : 1, scale ? scale[1] : 1, scale ? scale[2] : 1);
    geometry.applyMatrix4(_matrix.compose(_position, _quaternion, _scale));
    bucket.push({ geometry, color });
  }

  // Structural mass. `shade` walks the palette so adjacent faces separate under flat
  // shading without needing a texture.
  rock(geometry, position, rotation, scale, shade = 1) {
    const color = this.palette.stone.clone().multiplyScalar(shade * this.jitter(.09));
    this._put(this.stone, geometry, position, rotation, scale, color);
    return this;
  }

  metal(geometry, position, rotation, scale, shade = 1) {
    const color = this.palette.metal.clone().multiplyScalar(shade * this.jitter(.08));
    this._put(this.stone, geometry, position, rotation, scale, color);
    return this;
  }

  // Unlit, tone-mapping-exempt emissive. Window rows are what make a dusk silhouette
  // read as inhabited rather than as another rock.
  lamp(geometry, position, rotation, scale, shade = 1) {
    const color = this.palette.signal.clone().multiplyScalar(shade * this.jitter(.14));
    this._put(this.signal, geometry, position, rotation, scale, color);
    return this;
  }

  box(w, h, d) { return new THREE.BoxGeometry(w, h, d); }
  drum(top, bottom, height, segments) { return new THREE.CylinderGeometry(top, bottom, height, segments, 1); }
  ridge(w, h, d) { return ridgeGeometry(w, h, d); }

  // Sites sit at y 2-8 while the sea swells about eight units either way, so every mass
  // that meets the water needs to continue well below it. Without this the structures
  // read as cut-outs resting on the surface.
  footing(width, depth, x = 0, z = 0, rotation = null, segments = 0) {
    // Beyond the mid range the waterline join is sub-pixel, so the footing is pure cost.
    if (this.far) return this;
    const drop = FOUNDATION_DROP;
    if (segments) this.rock(this.drum(width, width * 1.18, drop, segments), [x, -drop / 2 + 2, z], rotation, null, .52);
    else this.rock(this.box(width, drop, depth), [x, -drop / 2 + 2, z], rotation, null, .52);
    return this;
  }

  // A genuine pierced arch built from voussoir blocks around a semicircle. The hole is
  // the point: sky through a structure is the strongest built-ness cue available.
  arch(span, thickness, depth, voussoirs, origin = [0, 0, 0], shade = .94) {
    const radius = span / 2;
    const step = Math.PI / voussoirs;
    for (let i = 0; i < voussoirs; i += 1) {
      const angle = step * (i + .5);
      // Just over the arc pitch: enough that blocks meet, not enough that their corners
      // stick out of the extrados and turn the ring into a pile of rubble.
      const blockWidth = radius * step * 1.1;
      this.rock(
        this.box(blockWidth, thickness, depth),
        [origin[0] - Math.cos(angle) * radius, origin[1] + Math.sin(angle) * radius, origin[2]],
        [0, 0, angle - Math.PI / 2],
        null,
        shade * (i % 2 ? 1.09 : .93)
      );
    }
    return this;
  }

  // Regular window openings with a lit pane and, up close, a recessed stone frame.
  // Beyond the mid range individual panes are sub-pixel, so the whole row collapses to
  // one lit band: the same silhouette read for a twelfth of the triangles.
  windowRow(count, spacing, y, faceZ, paneW, paneH, shade = 1) {
    if (this.far) {
      this.lamp(this.box(spacing * count * .8, paneH, .5), [0, y, faceZ], null, null, shade * .8);
      return this;
    }
    for (let i = 0; i < count; i += 1) {
      const x = (i - (count - 1) / 2) * spacing;
      if (this.near) this.rock(this.box(paneW * 1.7, paneH * 1.45, .9), [x, y, faceZ * .985], null, null, .62);
      const lit = this.random() > .22;
      if (lit) this.lamp(this.box(paneW, paneH, .5), [x, y, faceZ], null, null, shade * (.6 + this.random() * .7));
      else this.rock(this.box(paneW, paneH, .5), [x, y, faceZ], null, null, .38);
    }
    return this;
  }

  // Four-legged X-braced mast. Four legs rather than two so it holds a silhouette from
  // any approach angle instead of vanishing when seen edge-on.
  lattice(height, width, bays, position, rotation, shade = 1) {
    const bayHeight = height / bays;
    const brace = Math.hypot(bayHeight, width);
    const lean = Math.atan2(width, bayHeight);
    const yaw = rotation?.[1] || 0;
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    // Two legs are enough once the mast is a few pixels wide.
    for (const sx of this.far ? [-1] : [-1, 1]) {
      for (const sz of [-1, 1]) {
        const ox = sx * width / 2, oz = sz * width / 2;
        this.metal(this.box(width * .22, height, width * .22),
          [position[0] + ox * cos + oz * sin, position[1] + height / 2, position[2] - ox * sin + oz * cos],
          rotation, null, shade);
      }
    }
    for (let i = 0; i < bays; i += 1) {
      const y = position[1] + bayHeight * (i + .5);
      for (const sz of this.far ? [-1] : [-1, 1]) {
        const oz = sz * width / 2;
        this.metal(this.box(width * .13, brace, width * .13),
          [position[0] + oz * sin, y, position[2] + oz * cos],
          [0, yaw, i % 2 ? lean : -lean], null, shade * .9);
      }
      // Girth rings tie the legs together and give the mast horizontal rhythm.
      if (this.mid) this.metal(this.box(width * 1.12, width * .13, width * 1.12), [position[0], position[1] + bayHeight * (i + 1), position[2]], rotation, null, shade * 1.14);
    }
    return this;
  }

  buckets() { return { stone: this.stone, signal: this.signal }; }
}

/* --------------------------------------------------------------- archetypes --- */

// Twin banded towers carrying a pierced arch and a walkway deck. The deck line plus
// the void under the arch give a silhouette nothing in the terrain can imitate.
function buildSeagate(builder, spec) {
  const { random } = builder;
  const stages = spec.stages;
  const halfSpan = spec.span / 2;
  const stageHeight = spec.height / (stages + 1.1);
  const segments = builder.near ? 8 : builder.mid ? 8 : 6;

  for (const side of [-1, 1]) {
    const baseX = side * halfSpan;
    builder.footing(spec.baseRadius * 1.5, 0, baseX, 0, null, segments);
    builder.rock(builder.drum(spec.baseRadius * 1.24, spec.baseRadius * 1.52, spec.height * .07, segments), [baseX, spec.height * .035, 0], null, null, .72);
    for (let i = 0; i < stages; i += 1) {
      const bottom = spec.baseRadius * (1 - i * .085);
      const top = spec.baseRadius * (1 - (i + 1) * .085);
      const y = spec.height * .07 + stageHeight * (i + .5);
      builder.rock(builder.drum(top, bottom, stageHeight, segments), [baseX, y, 0], [0, side * .04 * i, 0], null, .86 + (i % 3) * .07);
      // Overhanging cornice between stages: the banding that reads as floors.
      builder.rock(builder.box(top * 2.42, stageHeight * .09, top * 2.42), [baseX, y + stageHeight * .5, 0], [0, Math.PI / 8, 0], null, 1.2);
      // Window rows on the two faces the player can actually see on approach.
      const rows = builder.near ? 3 : builder.mid ? 2 : 1;
      for (let r = 0; r < rows; r += 1) {
        const wy = y - stageHeight * .28 + (stageHeight * .56 / Math.max(1, rows - 1 || 1)) * r;
        builder.windowRow(builder.near ? 3 : 2, top * .78, wy, top * .96, 1.5, 2.7, 1);
        builder.windowRow(builder.near ? 3 : 2, top * .78, wy, -top * .96, 1.5, 2.7, .85);
      }
      // Vertical pilasters: they hold the eye on the tower at mid distance.
      if (builder.mid) {
        for (let p = 0; p < 4; p += 1) {
          const angle = TAU * (p / 4) + .4;
          builder.rock(builder.box(top * .2, stageHeight * .92, top * .2), [baseX + Math.cos(angle) * top * .93, y, Math.sin(angle) * top * .93], null, null, 1.1);
        }
      }
    }
    // Splayed buttresses tie the tower to the ground instead of letting it float.
    if (builder.mid) {
      for (let b = 0; b < 4; b += 1) {
        const angle = TAU * (b / 4) + .78;
        const reach = spec.baseRadius * 1.85;
        builder.rock(builder.box(spec.baseRadius * .34, spec.height * .3, reach), [baseX + Math.cos(angle) * reach * .5, spec.height * .16, Math.sin(angle) * reach * .5], [0, -angle, .2], null, .78);
      }
    }
    // Crown: merlons, mast and a lantern so the top edge is notched, not smooth.
    const crownY = spec.height * .07 + stageHeight * stages;
    const crownR = spec.baseRadius * (1 - stages * .085);
    builder.rock(builder.drum(crownR * 1.3, crownR * 1.12, stageHeight * .3, segments), [baseX, crownY + stageHeight * .15, 0], null, null, 1.05);
    const merlons = builder.near ? 8 : builder.mid ? 6 : 4;
    for (let m = 0; m < merlons; m += 1) {
      const angle = TAU * (m / merlons);
      builder.rock(builder.box(crownR * .42, stageHeight * .34, crownR * .42), [baseX + Math.cos(angle) * crownR * 1.1, crownY + stageHeight * .45, Math.sin(angle) * crownR * 1.1], [0, -angle, 0], null, 1.24);
    }
    builder.metal(builder.box(1.5, spec.height * .13, 1.5), [baseX, crownY + spec.height * .095, 0], null, null, 1);
    builder.lamp(builder.drum(crownR * .3, crownR * .42, stageHeight * .36, segments), [baseX, crownY + stageHeight * .42, 0], null, null, 1.5);
  }

  // The span. Two parallel arch rings plus transverse ribs so it has depth.
  const archY = spec.height * .42;
  const archRings = builder.near ? [-spec.depth * .34, 0, spec.depth * .34] : builder.mid ? [-spec.depth * .3, spec.depth * .3] : [0];
  for (const z of archRings) {
    builder.arch(spec.span * .92, spec.height * .055, builder.far ? spec.depth * .78 : spec.depth * .3, builder.near ? 16 : builder.mid ? 11 : 6, [0, archY, z], .96);
  }
  // Roadway deck over the arch with a parapet: a long straight horizontal at height,
  // which is the read that terrain can never produce.
  const deckY = archY + spec.span * .48;
  builder.rock(builder.box(spec.span * 1.12, spec.height * .035, spec.depth * .96), [0, deckY, 0], null, null, 1.14);
  builder.rock(builder.box(spec.span * 1.16, spec.height * .022, spec.depth * 1.06), [0, deckY + spec.height * .026, 0], null, null, 1.28);
  if (builder.mid) {
    const posts = builder.near ? 17 : 11;
    for (let i = 0; i < posts; i += 1) {
      const x = (i / (posts - 1) - .5) * spec.span * 1.1;
      for (const side of [-1, 1]) {
        builder.metal(builder.box(1.1, spec.height * .045, 1.1), [x, deckY + spec.height * .05, side * spec.depth * .46], null, null, 1);
      }
      if (i % 3 === 1) builder.lamp(builder.box(1.6, 1.6, 1.6), [x, deckY + spec.height * .078, 0], null, null, 1.3);
    }
    for (const side of [-1, 1]) {
      builder.metal(builder.box(spec.span * 1.1, 1.2, 1.2), [0, deckY + spec.height * .072, side * spec.depth * .46], null, null, 1.16);
    }
  }
  // Hanging chains under the span read as maintenance rigging on a close pass.
  if (builder.near) {
    for (let i = 0; i < 6; i += 1) {
      const x = (random() - .5) * spec.span * .8;
      const drop = spec.height * (.08 + random() * .14);
      builder.metal(builder.box(.6, drop, .6), [x, archY - drop * .5 + spec.height * .02, (random() - .5) * spec.depth * .5], null, null, .8);
    }
  }
}

// Stepped beacon tower: tapering drums, ring balconies, flying buttresses and a caged
// lantern. Vertical ribs run the full height so it reads tall, not merely large.
function buildBeaconTower(builder, spec) {
  const drums = spec.stages;
  const segments = builder.near ? 10 : builder.mid ? 9 : 7;
  const drumHeight = spec.height / (drums + 1.4);

  builder.footing(spec.baseRadius * 1.9, 0, 0, 0, null, segments);
  builder.rock(builder.drum(spec.baseRadius * 1.5, spec.baseRadius * 1.95, spec.height * .06, segments), [0, spec.height * .03, 0], null, null, .7);
  builder.rock(builder.drum(spec.baseRadius * 1.34, spec.baseRadius * 1.5, spec.height * .035, segments), [0, spec.height * .075, 0], null, null, .96);

  for (let i = 0; i < drums; i += 1) {
    const bottom = spec.baseRadius * (1 - i * .108);
    const top = spec.baseRadius * (1 - (i + 1) * .108);
    const y = spec.height * .09 + drumHeight * (i + .5);
    builder.rock(builder.drum(top, bottom, drumHeight, segments), [0, y, 0], [0, i * .12, 0], null, .84 + (i % 4) * .06);
    builder.rock(builder.box(top * 2.5, drumHeight * .075, top * 2.5), [0, y + drumHeight * .5, 0], [0, Math.PI / segments, 0], null, 1.22);
    // Slit windows climb the tower in a helix, which reads as an internal stair.
    const slits = builder.near ? 4 : 2;
    for (let s = 0; s < slits; s += 1) {
      const angle = (i * 1.1 + s * (TAU / slits)) % TAU;
      const wy = y - drumHeight * .2 + drumHeight * .4 * (s / Math.max(1, slits));
      if (builder.near) builder.rock(builder.box(2.6, 5.4, 1.1), [Math.cos(angle) * top * .95, wy, Math.sin(angle) * top * .95], [0, -angle, 0], null, .58);
      builder.lamp(builder.box(1.5, 3.9, .6), [Math.cos(angle) * top * 1.01, wy, Math.sin(angle) * top * 1.01], [0, -angle, 0], null, 1.15);
    }
    // Full-height pilaster ribs.
    if (builder.mid) {
      const ribs = builder.near ? 8 : 5;
      for (let r = 0; r < ribs; r += 1) {
        const angle = TAU * (r / ribs) + i * .12;
        builder.rock(builder.box(top * .17, drumHeight * .95, top * .17), [Math.cos(angle) * top * .96, y, Math.sin(angle) * top * .96], [0, -angle, 0], null, 1.12);
      }
    }
  }

  // Two cantilevered ring balconies with railings: unmistakable horizontal ledges.
  if (builder.mid) {
    for (const fraction of [.42, .72]) {
      const y = spec.height * .09 + drumHeight * drums * fraction;
      // Balcony sits just outside the shaft radius at that height.
      const shaft = spec.baseRadius * (1 - fraction * drums * .108);
      const ring = Math.max(spec.baseRadius * .5, shaft * 1.42);
      builder.rock(new THREE.CylinderGeometry(ring * 1.02, ring * .92, spec.height * .018, segments * 2, 1, true), [0, y, 0], null, null, 1.18);
      builder.rock(builder.box(ring * 2.1, spec.height * .014, ring * 2.1), [0, y - spec.height * .012, 0], [0, Math.PI / segments, 0], null, 1.05);
      const posts = builder.near ? segments * 2 : segments;
      for (let p = 0; p < posts; p += 1) {
        const angle = TAU * (p / posts);
        builder.metal(builder.box(.8, spec.height * .028, .8), [Math.cos(angle) * ring * .96, y + spec.height * .022, Math.sin(angle) * ring * .96], null, null, 1);
      }
      builder.metal(new THREE.CylinderGeometry(ring * .98, ring * .98, .9, segments * 2, 1, true), [0, y + spec.height * .037, 0], null, null, 1.2);
    }
  }

  // Flying buttresses: sloped struts from an outer ring of piers into the shaft. The
  // strut is solved from the pier top to an anchor on the actual shaft radius at the
  // anchor height, otherwise it floats a dozen units clear of the tower.
  if (builder.mid) {
    const piers = builder.near ? 6 : 4;
    const reach = spec.baseRadius * 2.3;
    const pierHeight = spec.height * .24;
    const anchorY = spec.height * .5;
    const shaftRadius = spec.baseRadius * (1 - Math.min(drums, Math.max(0, (anchorY - spec.height * .09) / drumHeight)) * .108);
    const dr = reach - shaftRadius;
    const dy = anchorY - pierHeight;
    const strutLength = Math.hypot(dr, dy);
    const tilt = Math.atan2(dr, dy);
    const midRadius = (reach + shaftRadius) / 2;
    const midY = (pierHeight + anchorY) / 2;
    for (let p = 0; p < piers; p += 1) {
      const angle = TAU * (p / piers) + .3;
      builder.rock(builder.drum(spec.baseRadius * .26, spec.baseRadius * .4, pierHeight, 6), [Math.cos(angle) * reach, pierHeight * .5, Math.sin(angle) * reach], null, null, .8);
      builder.rock(builder.box(spec.baseRadius * .34, spec.baseRadius * .34, spec.baseRadius * .34), [Math.cos(angle) * reach, pierHeight, Math.sin(angle) * reach], [0, -angle, 0], null, 1.18);
      builder.rock(builder.box(spec.baseRadius * .2, strutLength * 1.03, spec.baseRadius * .3),
        [Math.cos(angle) * midRadius, midY, Math.sin(angle) * midRadius],
        [0, -angle, tilt], null, .94);
    }
  }

  // Lantern: an open cage of ribs around a bright core, capped by a spire.
  const crownY = spec.height * .09 + drumHeight * drums;
  const lanternR = spec.baseRadius * (1 - drums * .108) * 1.55;
  builder.rock(builder.box(lanternR * 2.5, spec.height * .022, lanternR * 2.5), [0, crownY + spec.height * .012, 0], [0, Math.PI / 8, 0], null, 1.26);
  const ribs = builder.near ? 8 : 6;
  for (let r = 0; r < ribs; r += 1) {
    const angle = TAU * (r / ribs);
    builder.metal(builder.box(1.3, spec.height * .075, 1.3), [Math.cos(angle) * lanternR, crownY + spec.height * .05, Math.sin(angle) * lanternR], [0, -angle, 0], null, 1.1);
  }
  builder.lamp(new THREE.OctahedronGeometry(lanternR * .78, 0), [0, crownY + spec.height * .05, 0], null, [1, 1.35, 1], 1.65);
  builder.metal(builder.drum(lanternR * .18, lanternR * 1.2, spec.height * .085, segments), [0, crownY + spec.height * .13, 0], null, null, 1.15);
  builder.metal(builder.box(.9, spec.height * .07, .9), [0, crownY + spec.height * .2, 0], null, null, 1.2);
  builder.lamp(new THREE.OctahedronGeometry(2.1, 0), [0, crownY + spec.height * .235, 0], null, null, 1.7);
}

// Drowned harbour works: a stilted deck carrying a cluster of jettied houses, gantry
// cranes and chimney stacks. Cluster silhouettes read at speed far better than one
// large object, which is the lesson from the Aeolith village.
function buildHarborWorks(builder, spec) {
  const { random } = builder;
  const deckY = spec.height * .3;
  const halfW = spec.span / 2;
  const halfD = spec.depth / 2;

  // Deck and its stilts. The legs run below zero so the structure sits in the water
  // rather than hovering above it.
  builder.rock(builder.box(spec.span, spec.height * .045, spec.depth), [0, deckY, 0], null, null, .92);
  builder.rock(builder.box(spec.span * 1.04, spec.height * .022, spec.depth * 1.04), [0, deckY + spec.height * .032, 0], null, null, 1.14);
  // Edge beams read light, not dark: a dark rim against dark water disappears and the
  // deck goes back to looking like a sheet of paper floating on the sea.
  for (const side of builder.mid ? [-1, 1] : []) {
    builder.rock(builder.box(spec.span * 1.05, spec.height * .075, spec.depth * .04), [0, deckY - spec.height * .014, side * spec.depth * .5], null, null, 1.12);
    builder.rock(builder.box(spec.span * .04, spec.height * .075, spec.depth * 1.05), [side * spec.span * .5, deckY - spec.height * .014, 0], null, null, 1.04);
  }
  // Fender piles: the strongest single cue that the deck is built on the water rather
  // than resting on it, because they break the waterline and the deck edge at once.
  if (builder.mid) {
    const piles = builder.near ? 22 : 12;
    for (let i = 0; i < piles; i += 1) {
      const t = (i + .5) / piles;
      const edge = Math.floor(t * 4);
      const along = (t * 4 - edge) * 2 - 1;
      const px = edge === 0 ? along * halfW : edge === 1 ? halfW * 1.03 : edge === 2 ? -along * halfW : -halfW * 1.03;
      const pz = edge === 0 ? -halfD * 1.03 : edge === 1 ? along * halfD : edge === 2 ? halfD * 1.03 : -along * halfD;
      const rise = spec.height * (.055 + random() * .05);
      const drop = deckY + spec.height * .22 + rise;
      builder.rock(builder.drum(spec.height * .015, spec.height * .019, drop, 5), [px, deckY + rise - drop * .5, pz], [(random() - .5) * .05, 0, (random() - .5) * .05], null, .98);
      if (builder.near && i % 2 === 0) {
        builder.metal(builder.box(spec.height * .02, spec.height * .012, spec.height * .02), [px, deckY + rise, pz], null, null, 1.2);
      }
    }
  }
  const legs = builder.near ? 18 : builder.mid ? 12 : 6;
  for (let i = 0; i < legs; i += 1) {
    const angle = TAU * (i / legs) + .2;
    const rx = Math.cos(angle) * halfW * (.55 + random() * .38);
    const rz = Math.sin(angle) * halfD * (.55 + random() * .38);
    const drop = deckY + spec.height * (.28 + random() * .2);
    builder.rock(builder.drum(spec.height * .028, spec.height * .042, drop, 6), [rx, deckY - drop * .5, rz], [random() * .06, 0, (random() - .5) * .09], null, .68);
    if (builder.near && i % 3 === 0) {
      builder.metal(builder.box(spec.height * .012, spec.height * .012, halfD * .5), [rx, deckY - drop * .34, rz * .6], [0, angle, 0], null, .84);
    }
  }

  // The houses. Varied heights, jettied upper floors and pitched roofs; the overhang
  // is what makes them read as buildings rather than as boxes.
  const houses = builder.near ? 13 : builder.mid ? 11 : 7;
  for (let i = 0; i < houses; i += 1) {
    const ring = i / houses;
    const angle = ring * TAU * 1.618 + spec.seedAngle;
    const radius = (.16 + random() * .74);
    const hx = Math.cos(angle) * halfW * radius;
    const hz = Math.sin(angle) * halfD * radius;
    const width = spec.span * (.1 + random() * .07);
    const depth = spec.depth * (.09 + random() * .06);
    const storeys = 1 + Math.floor(random() * 3);
    const storeyHeight = spec.height * (.11 + random() * .05);
    const yaw = Math.round(random() * 4) * (Math.PI / 4) + (random() - .5) * .2;
    let y = deckY + spec.height * .032;
    for (let s = 0; s < storeys; s += 1) {
      const jetty = 1 + s * .11;
      builder.rock(builder.box(width * jetty, storeyHeight, depth * jetty), [hx, y + storeyHeight * .5, hz], [0, yaw, 0], null, .8 + ((i + s) % 4) * .08);
      if (builder.near) builder.rock(builder.box(width * jetty * 1.06, storeyHeight * .07, depth * jetty * 1.06), [hx, y + storeyHeight, hz], [0, yaw, 0], null, 1.2);
      const panes = builder.near ? 3 : 2;
      for (let p = 0; p < panes; p += 1) {
        const px = (p - (panes - 1) / 2) * width * .3;
        if (random() > .3) {
          builder.lamp(builder.box(width * .16, storeyHeight * .34, .5),
            [hx + Math.cos(yaw) * px + Math.sin(yaw) * depth * jetty * .51, y + storeyHeight * .55, hz - Math.sin(yaw) * px + Math.cos(yaw) * depth * jetty * .51],
            [0, yaw, 0], null, .7 + random() * .8);
        }
      }
      y += storeyHeight;
    }
    builder.rock(builder.ridge(width * (1 + storeys * .11) * 1.1, storeyHeight * .8, depth * (1 + storeys * .11) * 1.1), [hx, y, hz], [0, yaw, 0], null, .66);
    if (builder.near && random() > .45) {
      builder.rock(builder.box(width * .17, storeyHeight * .7, width * .17), [hx + width * .22, y + storeyHeight * .5, hz], [0, yaw, 0], null, .74);
      builder.lamp(builder.box(width * .1, width * .1, width * .1), [hx + width * .22, y + storeyHeight * .9, hz], null, null, 1.1);
    }
  }

  // Two gantry cranes. Lattice masts with a jib and counterweight give the cluster a
  // tall asymmetric silhouette, and lattice voids read as fabricated at any range.
  for (const side of [-1, 1]) {
    const mx = side * halfW * .78;
    const mz = side * halfD * .3;
    const mastHeight = spec.height * (.62 + (side > 0 ? .12 : 0));
    const width = spec.span * .075;
    builder.lattice(mastHeight, width, builder.near ? 7 : 4, [mx, deckY + spec.height * .032, mz], [0, side * .3, 0], .96);
    const jib = spec.span * .42;
    builder.metal(builder.box(jib, spec.height * .026, width * .55), [mx - side * jib * .34, deckY + spec.height * .032 + mastHeight, mz], [0, side * .3, -side * .1], null, 1.06);
    builder.metal(builder.box(width * 1.3, spec.height * .05, width * 1.1), [mx + side * jib * .2, deckY + spec.height * .032 + mastHeight - spec.height * .02, mz], [0, side * .3, 0], null, .88);
    builder.lamp(builder.box(1.7, 1.7, 1.7), [mx - side * jib * .66, deckY + spec.height * .032 + mastHeight - spec.height * .01, mz], null, null, 1.5);
    if (builder.near) {
      const hookDrop = spec.height * .3;
      builder.metal(builder.box(.5, hookDrop, .5), [mx - side * jib * .6, deckY + spec.height * .032 + mastHeight - hookDrop * .5, mz], null, null, .8);
    }
  }

  // Chimney stacks: thin verticals that break the roofline.
  const stacks = builder.near ? 4 : 3;
  for (let i = 0; i < stacks; i += 1) {
    const angle = TAU * (i / stacks) + 1.1;
    const sx = Math.cos(angle) * halfW * .5;
    const sz = Math.sin(angle) * halfD * .5;
    const stackHeight = spec.height * (.4 + random() * .22);
    builder.rock(builder.drum(spec.height * .022, spec.height * .034, stackHeight, 7), [sx, deckY + stackHeight * .5, sz], null, null, .74);
    builder.rock(builder.drum(spec.height * .03, spec.height * .026, spec.height * .022, 7), [sx, deckY + stackHeight, sz], null, null, 1.2);
    builder.lamp(builder.drum(spec.height * .02, spec.height * .024, spec.height * .012, 7), [sx, deckY + stackHeight + spec.height * .022, sz], null, null, 1.35);
  }

  // Mooring masts and catwalks around the rim.
  if (builder.mid) {
    const masts = builder.near ? 8 : 5;
    for (let i = 0; i < masts; i += 1) {
      const angle = TAU * (i / masts) + .55;
      const mx = Math.cos(angle) * halfW * .92;
      const mz = Math.sin(angle) * halfD * .92;
      const mastHeight = spec.height * (.2 + random() * .16);
      builder.metal(builder.box(spec.height * .012, mastHeight, spec.height * .012), [mx, deckY + mastHeight * .5, mz], null, null, 1);
      if (i % 2 === 0) builder.lamp(builder.box(1.3, 1.3, 1.3), [mx, deckY + mastHeight, mz], null, null, 1.4);
      if (builder.near) builder.metal(builder.box(spec.span * .12, .9, .9), [mx * .8, deckY + spec.height * .06, mz * .8], [0, -angle, 0], null, 1.1);
    }
  }
}

// Arcade viaduct: repeated pier-and-arch bays under a roadway, with a second tier over
// the centre. The most legible built silhouette in the set, and it reads from very far
// because it is long, level-topped and full of regular holes.
function buildViaduct(builder, spec) {
  const bays = spec.bays;
  const bayWidth = spec.span / bays;
  const pierHeight = spec.height * .5;
  const deckY = pierHeight + bayWidth * .5;

  for (let i = 0; i <= bays; i += 1) {
    const x = (i / bays - .5) * spec.span;
    const taper = i === 0 || i === bays ? 1.35 : 1;
    builder.footing(bayWidth * .42 * taper, spec.depth * 1.2, x, 0);
    builder.rock(builder.box(bayWidth * .3 * taper, pierHeight, spec.depth * 1.02), [x, pierHeight * .5, 0], null, null, .82 + (i % 3) * .07);
    builder.rock(builder.box(bayWidth * .38 * taper, pierHeight * .07, spec.depth * 1.12), [x, pierHeight * .035, 0], null, null, .7);
    // Cutwater noses: a small detail that reads as engineered on a close pass.
    if (builder.near) {
      for (const side of [-1, 1]) {
        builder.rock(builder.drum(bayWidth * .1, bayWidth * .14, pierHeight * .8, 5), [x, pierHeight * .4, side * spec.depth * .52], null, null, .76);
      }
    }
  }
  for (let i = 0; i < bays; i += 1) {
    const x = (i / bays - .5) * spec.span + bayWidth * .5;
    // One full-depth arch ring once the bays are too small on screen to show depth.
    const rings = builder.near ? [-spec.depth * .36, 0, spec.depth * .36] : builder.mid ? [-spec.depth * .34, spec.depth * .34] : [0];
    for (const z of rings) {
      // Voussoirs run much lighter than the piers. At close range a dark arch ring over
      // dark water reads as a gap between pillars, not as an arcade.
      builder.arch(bayWidth * .84, spec.height * .05, builder.far ? spec.depth * .95 : spec.depth * .32, builder.near ? 14 : builder.mid ? 9 : 5, [x, pierHeight, z], 1.3);
    }
    if (builder.near) builder.rock(builder.box(bayWidth * .16, pierHeight * .18, spec.depth * .9), [x, pierHeight + bayWidth * .44, 0], null, null, 1.05);
  }
  // String course along the springing line: one box, and it ties the whole arcade into a
  // single horizontal read instead of a row of separate piers.
  builder.rock(builder.box(spec.span * 1.03, spec.height * .022, spec.depth * 1.12), [0, pierHeight, 0], null, null, 1.32);

  // Roadway, kerbs and parapet. The unbroken level line is the payload.
  builder.rock(builder.box(spec.span * 1.02, spec.height * .04, spec.depth * 1.06), [0, deckY, 0], null, null, 1.12);
  builder.rock(builder.box(spec.span * 1.05, spec.height * .022, spec.depth * 1.14), [0, deckY + spec.height * .03, 0], null, null, 1.3);
  if (builder.mid) {
    for (const side of [-1, 1]) {
      builder.rock(builder.box(spec.span * 1.02, spec.height * .05, spec.depth * .1), [0, deckY + spec.height * .06, side * spec.depth * .5], null, null, 1.2);
    }
    const lamps = builder.near ? bays * 2 : bays;
    for (let i = 0; i < lamps; i += 1) {
      const x = ((i + .5) / lamps - .5) * spec.span;
      builder.metal(builder.box(.9, spec.height * .07, .9), [x, deckY + spec.height * .09, spec.depth * .42], null, null, 1);
      builder.lamp(builder.box(1.8, 1.6, 1.8), [x, deckY + spec.height * .125, spec.depth * .42], null, null, 1.45);
    }
  }

  // Upper tier over the centre bays: the classic aqueduct read.
  const upperBays = Math.max(2, Math.round(bays * .55));
  const upperSpan = bayWidth * upperBays;
  const upperPier = spec.height * .24;
  const upperBay = upperSpan / upperBays;
  for (let i = 0; i <= upperBays; i += 1) {
    const x = (i / upperBays - .5) * upperSpan;
    builder.rock(builder.box(upperBay * .26, upperPier, spec.depth * .72), [x, deckY + spec.height * .04 + upperPier * .5, 0], null, null, .9 + (i % 2) * .1);
  }
  for (let i = 0; i < upperBays; i += 1) {
    const x = (i / upperBays - .5) * upperSpan + upperBay * .5;
    builder.arch(upperBay * .82, spec.height * .038, builder.far ? spec.depth * .7 : spec.depth * .3, builder.near ? 9 : builder.mid ? 7 : 5, [x, deckY + spec.height * .04 + upperPier, 0], 1.34);
  }
  const capY = deckY + spec.height * .04 + upperPier + upperBay * .5;
  builder.rock(builder.box(upperSpan * 1.06, spec.height * .034, spec.depth * .8), [0, capY, 0], null, null, 1.22);
  const merlons = builder.near ? upperBays * 4 : builder.mid ? upperBays * 2 : upperBays;
  for (let i = 0; i < merlons; i += 1) {
    const x = ((i + .5) / merlons - .5) * upperSpan * 1.02;
    builder.rock(builder.box(upperSpan / merlons * .5, spec.height * .045, spec.depth * .22), [x, capY + spec.height * .04, 0], null, null, 1.3);
    if (i % 4 === 1) builder.lamp(builder.box(1.5, 1.5, 1.5), [x, capY + spec.height * .07, 0], null, null, 1.4);
  }
}

// Rib hall: paired curved ribs forming a nave, a keel spine along the apex and an apse
// drum with a pierced rose opening. The gaps between ribs are the whole effect.
function buildRibHall(builder, spec) {
  const pairs = builder.near ? spec.bays : builder.mid ? Math.max(5, spec.bays - 2) : Math.max(4, Math.round(spec.bays * .55));
  const links = builder.near ? 7 : builder.mid ? 6 : 4;
  const halfSpan = spec.span / 2;

  // Plinth with steps, on a submerged foundation.
  builder.footing(spec.depth * 1.02, spec.span * .96);
  builder.rock(builder.box(spec.depth * 1.08, spec.height * .05, spec.span * 1.02), [0, spec.height * .025, 0], null, null, .8);
  if (builder.mid) {
    builder.rock(builder.box(spec.depth * 1.2, spec.height * .022, spec.span * 1.1), [0, spec.height * .011, 0], null, null, .68);
    builder.rock(builder.box(spec.depth * .34, spec.height * .028, spec.span * .1), [spec.depth * .62, spec.height * .022, 0], null, null, .74);
  }

  for (let p = 0; p < pairs; p += 1) {
    const z = (p / (pairs - 1) - .5) * spec.span * .92;
    const taper = 1 - Math.abs(p / (pairs - 1) - .5) * .5;
    const ribHeight = spec.height * (.62 + taper * .38);
    const ribReach = spec.depth * .42 * (.72 + taper * .3);
    for (const side of [-1, 1]) {
      for (let l = 0; l < links; l += 1) {
        // Quarter-circle sweep from the floor out and over to the apex.
        const t0 = l / links, t1 = (l + 1) / links;
        const at = (t) => [side * ribReach * Math.cos(t * Math.PI / 2), spec.height * .05 + ribHeight * Math.sin(t * Math.PI / 2), z];
        const a = at(t0), b = at(t1);
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        // Heavier than the first pass: thin ribs read as a comb rather than as vaulting.
        const thickness = spec.height * (.088 - t0 * .042);
        builder.rock(builder.box(thickness, length * 1.12, thickness * (1 + taper * .5)),
          [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z],
          [0, 0, Math.atan2(-(b[0] - a[0]), b[1] - a[1])], null, .82 + (l % 3) * .09);
      }
      // Buttress foot so the rib lands rather than stops.
      builder.rock(builder.box(spec.height * .07, spec.height * .16, spec.height * .07 * (1 + taper)), [side * ribReach, spec.height * .12, z], null, null, .74);
      if (builder.near) builder.lamp(builder.box(1.2, 1.2, 1.2), [side * ribReach * .96, spec.height * .21, z], null, null, 1.2);
    }
    // Keystone block at the apex.
    builder.rock(builder.box(spec.height * .075, spec.height * .06, spec.height * .075 * (1 + taper)), [0, spec.height * .05 + ribHeight, z], null, null, 1.18);
  }

  // Keel spine plus purlins tying the ribs together: repetition along the length.
  builder.metal(builder.box(spec.height * .035, spec.height * .035, spec.span * .96), [0, spec.height * .05 + spec.height * .99, 0], null, null, 1.14);
  if (builder.mid) {
    for (const fraction of [.55, .82]) {
      for (const side of [-1, 1]) {
        const radius = spec.depth * .42 * Math.cos(fraction * Math.PI / 2);
        const y = spec.height * .05 + spec.height * .9 * Math.sin(fraction * Math.PI / 2);
        builder.metal(builder.box(spec.height * .022, spec.height * .022, spec.span * .94), [side * radius, y, 0], null, null, 1.06);
      }
    }
  }

  // Apse: a colonnade half-ring under a drum with a pierced rose window.
  const apseZ = -spec.span * .62;
  const columns = builder.near ? 9 : builder.mid ? 7 : 5;
  for (let c = 0; c < columns; c += 1) {
    const angle = Math.PI * (c / (columns - 1)) - Math.PI / 2;
    const radius = spec.depth * .4;
    builder.rock(builder.drum(spec.height * .035, spec.height * .05, spec.height * .48, 7), [Math.sin(angle) * radius, spec.height * .29, apseZ - Math.cos(angle) * radius * .55], null, null, .88 + (c % 3) * .08);
    if (builder.near) builder.rock(builder.box(spec.height * .09, spec.height * .03, spec.height * .09), [Math.sin(angle) * radius, spec.height * .535, apseZ - Math.cos(angle) * radius * .55], null, null, 1.22);
  }
  builder.rock(builder.box(spec.depth * .9, spec.height * .04, spec.depth * .5), [0, spec.height * .56, apseZ - spec.depth * .1], null, null, 1.18);
  const drumR = spec.depth * .34;
  builder.rock(new THREE.CylinderGeometry(drumR * .84, drumR, spec.height * .34, builder.near ? 10 : 8, 1, true), [0, spec.height * .75, apseZ - spec.depth * .1], null, null, .95);
  // Rose window: a ring of lit panes with stone mullions between them.
  const panes = builder.near ? 10 : 7;
  for (let i = 0; i < panes; i += 1) {
    const angle = TAU * (i / panes);
    builder.lamp(builder.box(drumR * .28, drumR * .28, .8), [Math.cos(angle) * drumR * .55, spec.height * .78 + Math.sin(angle) * drumR * .55, apseZ - spec.depth * .1 + drumR * .86], null, null, 1.25);
    if (builder.near) builder.rock(builder.box(drumR * .1, drumR * .5, 1.1), [Math.cos(angle + TAU / (panes * 2)) * drumR * .55, spec.height * .78 + Math.sin(angle + TAU / (panes * 2)) * drumR * .55, apseZ - spec.depth * .1 + drumR * .86], [0, 0, angle], null, .7);
  }
  builder.lamp(new THREE.OctahedronGeometry(drumR * .22, 0), [0, spec.height * .78, apseZ - spec.depth * .1 + drumR * .86], null, null, 1.5);
  builder.rock(builder.drum(drumR * .1, drumR * .92, spec.height * .2, builder.near ? 10 : 8), [0, spec.height * 1.0, apseZ - spec.depth * .1], null, null, 1.06);
  builder.lamp(new THREE.OctahedronGeometry(2.4, 0), [0, spec.height * 1.12, apseZ - spec.depth * .1], null, [1, 1.5, 1], 1.6);
}

const ARCHETYPES = {
  seagate: { build: buildSeagate, defaults: { height: 152, span: 118, depth: 34, baseRadius: 15, stages: 6 } },
  beacon: { build: buildBeaconTower, defaults: { height: 188, span: 70, depth: 70, baseRadius: 15.5, stages: 6 } },
  harbor: { build: buildHarborWorks, defaults: { height: 104, span: 168, depth: 148, baseRadius: 40, stages: 1, seedAngle: .7 } },
  viaduct: { build: buildViaduct, defaults: { height: 104, span: 330, depth: 26, baseRadius: 14, bays: 7 } },
  ribhall: { build: buildRibHall, defaults: { height: 112, span: 178, depth: 132, baseRadius: 40, bays: 7 } }
};

// Footprint discs approximate each archetype's visual extent in local XZ. They are
// deliberately larger than the collision proxies: they exist to keep structures from
// growing out of the side of an existing mountain, which reads as a bug even though it
// never touches gameplay.
const FOOTPRINTS = {
  seagate: (spec) => [
    { dx: 0, dz: 0, radius: spec.span * .34 },
    ...[-1, 1].map((side) => ({ dx: side * spec.span / 2, dz: 0, radius: spec.baseRadius * 2.5 }))
  ],
  beacon: (spec) => [{ dx: 0, dz: 0, radius: spec.baseRadius * 2.9 }],
  harbor: (spec) => [{ dx: 0, dz: 0, radius: Math.max(spec.span, spec.depth) * .56 }],
  viaduct: (spec) => Array.from({ length: spec.bays + 1 }, (unused, i) => ({
    dx: (i / spec.bays - .5) * spec.span, dz: 0, radius: spec.span / spec.bays * .62
  })),
  ribhall: (spec) => [
    { dx: 0, dz: 0, radius: spec.depth * .5 },
    { dx: 0, dz: spec.span * .46, radius: spec.depth * .42 },
    { dx: 0, dz: -spec.span * .46, radius: spec.depth * .42 },
    { dx: 0, dz: -spec.span * .62, radius: spec.depth * .45 }
  ]
};

// Collision proxies are authored per archetype in local space and stay tight to the
// load-bearing masses. Arch spans and decks are deliberately not colliders, so flying
// under a gate is a feature rather than a crash.
const PROXIES = {
  seagate: (spec) => [-1, 1].map((side) => ({ dx: side * spec.span / 2, dz: 0, radius: spec.baseRadius * 1.5, top: spec.height })),
  beacon: (spec) => [{ dx: 0, dz: 0, radius: spec.baseRadius * 1.6, top: spec.height * 1.1 }],
  harbor: (spec) => [
    { dx: 0, dz: 0, radius: spec.span * .3, top: spec.height * .75 },
    { dx: spec.span * .3, dz: spec.depth * .12, radius: spec.span * .12, top: spec.height * .95 },
    { dx: -spec.span * .3, dz: -spec.depth * .12, radius: spec.span * .12, top: spec.height * .95 }
  ],
  viaduct: (spec) => Array.from({ length: spec.bays + 1 }, (unused, i) => ({
    dx: (i / spec.bays - .5) * spec.span, dz: 0, radius: spec.span / spec.bays * .22, top: spec.height * .5
  })),
  ribhall: (spec) => [
    { dx: 0, dz: 0, radius: spec.depth * .3, top: spec.height * .9 },
    { dx: 0, dz: -spec.span * .62, radius: spec.depth * .34, top: spec.height * 1.1 }
  ]
};

/* ------------------------------------------------------------------ palettes --- */

// The scene runs ambient 1.55, hemi 0.78, a 1.85 key light and exposure 1.62, which
// washes mid-tone stone out to pale lavender. These gains pull the authored hues down so
// the structures sit DARKER than the dusk sky and read as silhouettes, with the lit
// window rows carrying the detail. Tuned against reports/landmark-geometry screenshots.
const STONE_GAIN = .6;
const METAL_GAIN = .7;

function palette(stone, metal, signal) {
  return {
    stone: new THREE.Color(stone).multiplyScalar(STONE_GAIN),
    metal: new THREE.Color(metal).multiplyScalar(METAL_GAIN),
    signal: new THREE.Color(signal)
  };
}

/* -------------------------------------------------------------------- route --- */

// Twelve sites, one per beacon leg, placed to flank the flight line rather than sit on
// it. Lateral offsets are large enough that the collider avoidance push never fires on
// the route; `validateRouteClearance` proves that at load instead of trusting it.
// Positions and yaws come from reports/landmark-geometry/place.mjs --solve, which relaxes
// every site out of the terrain masses, off the flight line and away from its neighbours
// while a weak spring holds it near where it was authored. Hand-placing twelve sites
// against seven mountains, twenty-one rocks and a twelve-leg route does not converge.
export const LANDMARK_SITES = Object.freeze([
  { id: 'wake-arch', archetype: 'seagate', position: [128, 6, 263], yaw: -0.62, scale: 1.0, palette: palette(0x4a6a70, 0x6f8b8f, 0x86f0e2), seed: 1207 },
  { id: 'tide-viaduct', archetype: 'viaduct', position: [-185, 4, 151], yaw: -0.567, scale: .92, palette: palette(0x445267, 0x707d94, 0x9fc6ff), seed: 3391 },
  { id: 'storm-spire', archetype: 'beacon', position: [248, 8, 6], yaw: -0.3, scale: 1.06, palette: palette(0x3a4068, 0x6a6f96, 0xa08cff), seed: 5122 },
  // A compact arcade: the inner archipelago has no room for a full-length viaduct.
  { id: 'keeper-arcade', archetype: 'viaduct', position: [-82, 4, -292], yaw: 1.202, scale: .58, palette: palette(0x3f4f5c, 0x69808c, 0x7fdcf2), seed: 811 },
  { id: 'drowned-gate', archetype: 'seagate', position: [361, 6, -116], yaw: -0.234, scale: 1.12, palette: palette(0x3d5666, 0x64818f, 0x7ce0f4), seed: 9044 },
  { id: 'cinder-harbor', archetype: 'harbor', position: [545, 2, -305], yaw: 0.62, scale: 1.0, palette: palette(0x5b3f39, 0x8a6353, 0xff8a52), seed: 2266 },
  { id: 'salt-arcade', archetype: 'viaduct', position: [612, 4, -552], yaw: -0.34, scale: 1.0, palette: palette(0x53474a, 0x7d7175, 0xffb27a), seed: 7710 },
  { id: 'bone-sentinel', archetype: 'ribhall', position: [67, 4, -673], yaw: 1.36, scale: 1.08, palette: palette(0x7a747c, 0x9b94a2, 0xdcbcff), seed: 4488 },
  { id: 'gale-spire', archetype: 'beacon', position: [-155, 8, -587], yaw: 0.22, scale: .94, palette: palette(0x424a70, 0x6f76a0, 0xb0a2ff), seed: 6301 },
  { id: 'keeper-works', archetype: 'harbor', position: [-525, 2, -216], yaw: -0.86, scale: .94, palette: palette(0x3c4b52, 0x69808a, 0x8fe6d6), seed: 1555 },
  // Long axis laid parallel to the r9 -> r10 leg and offset west of it, so the nave reads
  // as a close pass down its flank instead of a wall in the way.
  { id: 'rib-vault', archetype: 'ribhall', position: [-504, 4, 519], yaw: 0.752, scale: 1.0, palette: palette(0x6d7480, 0x8f97a6, 0xa8d8ff), seed: 8823 },
  { id: 'aurora-crown', archetype: 'seagate', position: [-253, 6, 815], yaw: -0.7, scale: 1.18, palette: palette(0x3f6664, 0x6c9490, 0x7dffc8), seed: 3077 }
]);

/** Filter sites by region.json allowedLandmarkIds / allowedLandmarkArchetypes. */
export function filterLandmarkSites(sites, filter = {}) {
  let out = sites;
  if (filter.allowedLandmarkIds?.length) {
    out = out.filter((site) => filter.allowedLandmarkIds.includes(site.id));
  }
  if (filter.allowedLandmarkArchetypes?.length) {
    out = out.filter((site) => filter.allowedLandmarkArchetypes.includes(site.archetype));
  }
  return out;
}

/** Landmarks assigned to a region via allowedLandmarkIds (authoritative over archetype list). */
export function landmarksForRegion(region, sites = LANDMARK_SITES) {
  if (!region) return [];
  return filterLandmarkSites(sites, {
    allowedLandmarkIds: region.allowedLandmarkIds,
    allowedLandmarkArchetypes: region.allowedLandmarkArchetypes
  });
}

/** Proof payload: distinct archetypes per named region. */
export function regionLandmarkProfiles(regions = []) {
  return regions.map((region) => ({
    regionId: region.id,
    name: region.name,
    allowedLandmarkIds: region.allowedLandmarkIds ?? [],
    allowedLandmarkArchetypes: region.allowedLandmarkArchetypes ?? [],
    sites: landmarksForRegion(region).map((site) => ({ id: site.id, archetype: site.archetype }))
  }));
}

export function specFor(site) {
  const defaults = ARCHETYPES[site.archetype].defaults;
  const spec = {};
  for (const [key, value] of Object.entries(defaults)) {
    spec[key] = key === 'stages' || key === 'bays' || key === 'seedAngle' ? value : value * site.scale;
  }
  const random = makeRandom(site.seed);
  // Seeded proportion drift so repeated archetypes are not visibly the same object.
  spec.height *= .9 + random() * .24;
  spec.span *= .92 + random() * .18;
  spec.depth *= .92 + random() * .18;
  if (spec.stages) spec.stages = Math.max(4, spec.stages + (random() > .55 ? 1 : 0) - (random() > .78 ? 1 : 0));
  if (spec.bays) spec.bays = Math.max(5, spec.bays + Math.round((random() - .5) * 3));
  spec.seedAngle = random() * TAU;
  return spec;
}

/* -------------------------------------------------- clearance verification --- */

// Local-space disc -> world. Rotation about Y by `yaw` sends local +X to
// (cos yaw, -sin yaw) and local +Z to (sin yaw, cos yaw) in world XZ.
function toWorld(site, disc) {
  const cos = Math.cos(site.yaw), sin = Math.sin(site.yaw);
  return {
    x: site.position[0] + disc.dx * cos + disc.dz * sin,
    z: site.position[2] - disc.dx * sin + disc.dz * cos,
    radius: disc.radius
  };
}

// Pure placement math: no geometry is built, so the offline placement checker can run
// the identical function the game runs.
export function siteProxies(site) {
  const spec = specFor(site);
  return {
    spec,
    collision: PROXIES[site.archetype](spec).map((proxy, index) => {
      const world = toWorld(site, proxy);
      return { id: `${site.id}-${index}`, x: world.x, z: world.z, radius: world.radius, top: site.position[1] + proxy.top };
    }),
    footprint: FOOTPRINTS[site.archetype](spec).map((disc, index) => {
      const world = toWorld(site, disc);
      return { id: `${site.id}#${index}`, site: site.id, ...world };
    })
  };
}

// Reports, does not throw: a landmark clipping a mountain is an art defect to be fixed
// by moving the site, not a reason to refuse to boot the game.
export function evaluateTerrainClearance(sites, masses) {
  if (!masses?.length) return null;
  const overlaps = [];
  for (const site of sites) {
    const { footprint } = siteProxies(site);
    let worst = null;
    for (const disc of footprint) {
      for (const mass of masses) {
        const distance = Math.hypot(disc.x - mass.x, disc.z - mass.z);
        const gap = distance - (disc.radius + mass.radius);
        if (!worst || gap < worst.gap) {
          worst = { gap: +gap.toFixed(1), disc: disc.id, mass: mass.id || `${mass.x},${mass.z}`, pushX: +((disc.x - mass.x) / (distance || 1)).toFixed(3), pushZ: +((disc.z - mass.z) / (distance || 1)).toFixed(3) };
        }
      }
    }
    if (worst) overlaps.push({ site: site.id, ...worst });
  }
  const clipping = overlaps.filter((entry) => entry.gap < 0);
  return {
    masses: masses.length,
    clipping: clipping.length,
    worst: overlaps.slice().sort((a, b) => a.gap - b.gap).slice(0, 6),
    all: overlaps
  };
}

function distanceToSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const lengthSq = dx * dx + dz * dz;
  const t = lengthSq > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lengthSq)) : 0;
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

// Loud by design. A landmark that overlaps the flight line is a gameplay regression,
// not a cosmetic one, so it fails the build instead of shipping.
export function validateRouteClearance(proxies, route, { hardMargin = 6, softMargin = 26 } = {}) {
  const report = [];
  for (const proxy of proxies) {
    let closest = Infinity;
    for (let i = 0; i < route.length; i += 1) {
      const a = route[i], b = route[(i + 1) % route.length];
      closest = Math.min(closest, distanceToSegment(proxy.x, proxy.z, a[0], a[2], b[0], b[2]));
    }
    report.push({ id: proxy.id, clearance: +(closest - proxy.radius).toFixed(1) });
  }
  const blocking = report.filter((entry) => entry.clearance < hardMargin);
  if (blocking.length) {
    throw new Error(`Landmark colliders sit on the flight line: ${blocking.map((e) => `${e.id} (${e.clearance})`).join(', ')}`);
  }
  const ranked = report.slice().sort((a, b) => a.clearance - b.clearance);
  return {
    proxies: report.length,
    tightest: ranked.slice(0, 4),
    warnings: report.filter((entry) => entry.clearance < softMargin).map((entry) => entry.id),
    all: report
  };
}

/* ------------------------------------------------------------------- build --- */

export function createLandmarkMaterials() {
  const stone = new THREE.MeshStandardMaterial({
    name: 'Galevein_LandmarkStone',
    vertexColors: true, flatShading: true, roughness: .76, metalness: .07,
    emissive: new THREE.Color(0x1b1830), emissiveIntensity: .05, fog: true
  });
  const signal = new THREE.MeshBasicMaterial({
    name: 'Galevein_LandmarkSignal',
    vertexColors: true, toneMapped: false, fog: true
  });
  return { stone, signal };
}

// Builds one LOD level. Returns the meshes plus the triangle count so the caller can
// enforce the budget.
function buildLevel(site, spec, detail, materials) {
  const builder = new SiteBuilder(site.palette, makeRandom(site.seed + detail * 977), detail);
  ARCHETYPES[site.archetype].build(builder, spec);
  const { stone, signal } = builder.buckets();
  const level = new THREE.Group();
  level.name = `Galevein_Landmark_${site.id}_L${detail}`;
  let triangles = 0;
  const stoneGeometry = mergeParts(stone);
  if (stoneGeometry) {
    const mesh = new THREE.Mesh(stoneGeometry, materials.stone);
    mesh.castShadow = false;   // the moon shadow camera is a 520-unit box around the
    mesh.receiveShadow = false; // dragon; landmark shadow casters would only cost draws
    mesh.name = `${level.name}_stone`;
    level.add(mesh);
    triangles += triangleCount(stoneGeometry);
  }
  const signalGeometry = mergeParts(signal);
  if (signalGeometry) {
    const mesh = new THREE.Mesh(signalGeometry, materials.signal);
    mesh.name = `${level.name}_signal`;
    level.add(mesh);
    triangles += triangleCount(signalGeometry);
  }
  return { level, triangles, drawCalls: level.children.length };
}

export function buildLandmarkSite(site, materials) {
  const spec = specFor(site);
  const lod = new THREE.LOD();
  lod.name = `Galevein_Landmark_${site.id}`;
  lod.position.fromArray(site.position);
  lod.rotation.y = site.yaw;
  lod.userData.landmarkId = site.id;
  lod.userData.visualOnly = true;

  const levels = [];
  const distances = [0, NEAR_DISTANCE, MID_DISTANCE];
  for (let detail = 0; detail < 3; detail += 1) {
    const built = buildLevel(site, spec, detail, materials);
    const cap = LANDMARK_BUDGET.trianglesPerSite[detail];
    if (built.triangles > cap) {
      throw new Error(`Landmark ${site.id} LOD${detail} is ${built.triangles} triangles, over its ${cap} budget.`);
    }
    if (built.drawCalls > LANDMARK_BUDGET.drawCallsPerVisibleSite) {
      throw new Error(`Landmark ${site.id} LOD${detail} needs ${built.drawCalls} draw calls, over its ${LANDMARK_BUDGET.drawCallsPerVisibleSite} budget.`);
    }
    lod.addLevel(built.level, distances[detail]);
    levels.push(built);
  }

  const box = new THREE.Box3().setFromObject(lod.levels[0].object);
  const size = box.getSize(new THREE.Vector3());
  const { collision } = siteProxies(site);

  return {
    lod,
    proxies: collision,
    metrics: {
      id: site.id,
      archetype: site.archetype,
      triangles: levels.map((entry) => entry.triangles),
      drawCalls: levels.map((entry) => entry.drawCalls),
      size: size.toArray().map((value) => +value.toFixed(1)),
      height: +size.y.toFixed(1)
    }
  };
}
