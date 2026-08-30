// Integration: create LandmarkPath(scene, { route }), await build(), call
// update(D.group.position, S.t) in tick and setNightfall(TOD.day, S.t) alongside the
// other time-of-day writes. Add getCollisionProxies() to the collider pass.
//
// This used to load three landmark GLBs and, on any parse failure, silently substitute
// cones and tori. That fallback produced a false diagnosis once already: the world
// looked wrong, the models "loaded fine", and nobody could tell which geometry they
// were actually looking at. There is no fallback here any more. If the build fails the
// promise rejects, the caller is expected to surface it, and the sky stays empty so the
// failure is impossible to mistake for an art problem.
import * as THREE from 'three';
import {
  LANDMARK_BUDGET,
  LANDMARK_SITES,
  buildLandmarkSite,
  createLandmarkMaterials,
  filterLandmarkSites,
  landmarksForRegion,
  regionLandmarkProfiles,
  validateRouteClearance
} from './proceduralLandmarks.js';

const ACTIVE_DISTANCE = 620;

export const DRAGON_STORM_LANDMARK_ROUTE = LANDMARK_SITES;

export class LandmarkPath {
  constructor(scene, options = {}) {
    if (!scene?.add) throw new TypeError('LandmarkPath requires a Three.js scene.');
    this.scene = scene;
    this.flightRoute = options.flightRoute || null;
    this.foundationMode = options.foundationMode === 'incumbent' ? 'incumbent' : 'terrain-islets';
    this.allSites = (options.sites || LANDMARK_SITES).map((site) => ({
      ...site, foundationMode: this.foundationMode
    }));
    // Build the full authored map once. Region state may choose objectives and
    // nearby signal lights, but it never removes physical landmarks from the world.
    this.sites = this.allSites;
    this.activeRegionId = options.activeRegionId ?? null;
    this.regionProfiles = options.regionProfiles ?? null;
    this.root = new THREE.Group();
    this.root.name = 'DragonStorm_LandmarkPath';
    this.root.userData.visualOnly = true;
    this.scene.add(this.root);
    this.materials = createLandmarkMaterials();
    this.route = this.sites.map((site) => ({ ...site, object: null, active: false, distance: Infinity }));
    this.metrics = null;
    this.clearance = null;
    this.collisionAuthority = false;
    this.buildError = null;
    this.regionFilter = null;
    this._regionArchetypes = null;
    this._regionIds = null;
    this.placementRevision = 0;
    this.placementSignature = null;

    // A small fixed pool of point lights, moved to the nearest sites each frame. The
    // previous build gave every landmark its own light, which charges every lit
    // fragment in the scene for landmarks the player cannot even see.
    this._lights = Array.from({ length: LANDMARK_BUDGET.pointLights }, () => {
      const light = new THREE.PointLight(0xffffff, 0, 260, 2);
      light.visible = false;
      this.root.add(light);
      return light;
    });
    this._nearest = [];
  }

  // Synchronous underneath; the promise shape is kept so callers can await it and so a
  // build failure surfaces as a rejection rather than a half-populated scene.
  build() {
    return new Promise((resolve, reject) => {
      const run = () => {
        try {
          const started = (typeof performance !== 'undefined' ? performance : Date).now();
          const proxies = [];
          const perSite = [];
          for (const entry of this.route) {
            const built = buildLandmarkSite(entry, this.materials);
            entry.object = built.lod;
            entry.object.visible = true;
            entry.proxies = built.proxies;
            this.root.add(built.lod);
            proxies.push(...built.proxies);
            perSite.push(built.metrics);
          }
          this._proxies = proxies;
          if (this.flightRoute) this.clearance = validateRouteClearance(proxies, this.flightRoute);
          const totals = perSite.reduce((sum, site) => {
            for (let level = 0; level < 3; level += 1) sum[level] += site.triangles[level];
            return sum;
          }, [0, 0, 0]);
          const foundationTotals = perSite.reduce((sum, site) => {
            for (let level = 0; level < 3; level += 1) sum[level] += site.foundationTriangles[level];
            return sum;
          }, [0, 0, 0]);
          if (totals[0] > LANDMARK_BUDGET.totalTriangles) {
            reject(new Error(`Landmark geometry totals ${totals[0]} triangles at LOD0, over the ${LANDMARK_BUDGET.totalTriangles} budget.`));
            return;
          }
          this.metrics = {
            sites: perSite.length,
            materials: 2,
            buildMs: +((typeof performance !== 'undefined' ? performance : Date).now() - started).toFixed(1),
            trianglesByLevel: totals,
            foundationTrianglesByLevel: foundationTotals,
            foundationPieces: perSite.reduce((sum, site) => sum + site.foundationPieces, 0),
            groundedSites: perSite.filter((site) => site.foundationPieces > 0).length,
            foundationCollisionProxies: proxies.filter((proxy) => proxy.foundation).length,
            shortest: Math.min(...perSite.map((site) => site.height)),
            tallest: Math.max(...perSite.map((site) => site.height)),
            perSite
          };
          this.placementRevision += 1;
          this.placementSignature = this._calculatePlacementSignature();
          resolve(this.getSnapshot());
        } catch (error) {
          this.buildError = error;
          reject(error);
        }
      };
      if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(run);
      else setTimeout(run, 0);
    });
  }

  // Retained for callers that still say loadTemplates(); the GLB manifest is gone.
  loadTemplates() { return this.build(); }

  /**
   * Filter visible landmarks by active region data from regions.json.
   * @param {string|null} regionId
   * @param {string[]} [allowedArchetypes]
   * @param {string[]} [allowedLandmarkIds]
   */
  setRegionFilter(regionId, allowedArchetypes = [], allowedLandmarkIds = []) {
    this.regionFilter = regionId ?? null;
    this.activeRegionId = regionId ?? null;
    this._regionArchetypes = allowedArchetypes?.length ? new Set(allowedArchetypes) : null;
    this._regionIds = allowedLandmarkIds?.length ? new Set(allowedLandmarkIds) : null;
  }

  getRegionLandmarks(regionId) {
    const profile = this.regionProfiles?.find((entry) => entry.regionId === regionId);
    return profile?.sites ?? [];
  }

  _passesRegionFilter(entry) {
    if (!this.regionFilter) return true;
    const idOk = this._regionIds ? this._regionIds.has(entry.id) : true;
    const archetypeOk = this._regionArchetypes ? this._regionArchetypes.has(entry.archetype) : true;
    // Explicit IDs are authoritative. Using ID OR archetype made every viaduct in the
    // whole world appear in Wake Cove simply because the cove contains one viaduct.
    if (this._regionIds) return idOk;
    if (this._regionArchetypes) return archetypeOk;
    return true;
  }

  _calculatePlacementSignature() {
    let signature = 2166136261;
    const feed = (value) => {
      signature ^= value;
      signature = Math.imul(signature, 16777619);
    };
    for (const entry of this.route) {
      for (const character of entry.id) feed(character.charCodeAt(0));
      for (const value of entry.position) feed(Math.round(value * 1000));
      if (!entry.object) continue;
      for (const value of [
        ...entry.object.position.toArray(),
        ...entry.object.quaternion.toArray(),
        ...entry.object.scale.toArray()
      ]) feed(Math.round(value * 100000));
    }
    return (signature >>> 0).toString(16).padStart(8, '0');
  }

  update(playerPosition) {
    if (!playerPosition?.isVector3) return;
    const nearest = this._nearest;
    nearest.length = 0;
    for (const entry of this.route) {
      if (!entry.object) continue;
      const distance = playerPosition.distanceTo(entry.object.position);
      entry.distance = distance;
      const regionOk = this._passesRegionFilter(entry);
      entry.active = regionOk && distance < ACTIVE_DISTANCE;
      // Spatial permanence is part of the map contract: a landmark may become an
      // active objective nearby, but it never spawns, despawns, or follows the rider.
      entry.object.visible = true;
      if (entry.active) nearest.push(entry);
    }
    nearest.sort((a, b) => a.distance - b.distance);
    for (let i = 0; i < this._lights.length; i += 1) {
      const light = this._lights[i];
      const entry = nearest[i];
      if (!entry) { light.visible = false; light.intensity = 0; continue; }
      light.visible = true;
      light.color.copy(entry.palette.signal);
      light.position.set(entry.position[0], entry.position[1] + 46, entry.position[2]);
      // Fade in with proximity so the pool swapping between sites is not visible.
      light.intensity = 26 * (1 - entry.distance / ACTIVE_DISTANCE);
      light.distance = 300;
    }
  }

  // Two uniform writes per frame for the whole feature, because palette variety is
  // baked into vertex colours rather than spread across per-landmark materials.
  setNightfall(day = 0, time = 0) {
    this.materials.stone.emissiveIntensity = .05 + .17 * day;
    const pulse = 1 + .05 * Math.sin(time * .9);
    this.materials.signal.color.setScalar((.82 + .34 * day) * pulse);
  }

  getCollisionProxies() { return this._proxies ? this._proxies.slice() : []; }

  setCollisionAuthority(enabled = true) { this.collisionAuthority = !!enabled; }

  getSnapshot() {
    const activeSites = this.activeRegionId ? this.getRegionLandmarks(this.activeRegionId) : [];
    return {
      landmarks: this.route.length,
      procedural: true,
      generatedInCode: true,
      externalAssets: 0,
      foundationMode: this.foundationMode,
      foundationProfile: this.foundationMode === 'incumbent' ? 'submerged-footings-v1' : 'authored-rock-islets-v1',
      buildError: this.buildError ? String(this.buildError.message || this.buildError) : null,
      metrics: this.metrics,
      clearance: this.clearance,
      loadedTemplates: [...new Set(this.route.map((entry) => entry.archetype))],
      active: this.route.filter((entry) => entry.active).map((entry) => entry.id),
      regionFilter: this.regionFilter,
      activeRegionArchetypes: [...new Set(activeSites.map((site) => site.archetype))],
      regionProfiles: this.regionProfiles,
      visibilityMode: 'always-present-authored-map-v1',
      spatialPermanence: true,
      worldAnchored: true,
      playerRelativeCulling: false,
      regionVisibilityCulling: false,
      visible: this.route.filter((entry) => entry.object?.visible).map((entry) => entry.id),
      placementRevision: this.placementRevision,
      placementSignature: this.placementSignature,
      collisionWiringRequired: !this.collisionAuthority
    };
  }

  dispose() {
    this.scene.remove(this.root);
    this.root.traverse((object) => { if (object.geometry) object.geometry.dispose(); });
    this.materials.stone.dispose();
    this.materials.signal.dispose();
    this.root.clear();
  }
}
