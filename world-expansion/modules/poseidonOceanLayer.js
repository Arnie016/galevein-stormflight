import {
  Color, Mesh, NeutralToneMapping, PerspectiveCamera, Scene, Vector2, Vector3,
  WebGPURenderer
} from 'three/webgpu';
import { uniform } from 'three/tsl';
import { Ocean } from '../../vendor/poseidon-ocean/Ocean.js';
import { createAerialPerspective } from '../../vendor/poseidon-ocean/atmosphere.js';
import { makeDetailTexture } from '../../vendor/poseidon-ocean/detailTexture.js';
import { createRadialGrid } from '../../vendor/poseidon-ocean/oceanGrid.js';
import { createOceanSurfaceMaterial } from '../../vendor/poseidon-ocean/oceanSurfaceMaterial.js';
import { params as upstreamParams } from '../../vendor/poseidon-ocean/params.js';
import { createSkyDome } from './galeveinPoseidonSky.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const query = new URLSearchParams(location.search);
const CYCLE_PROFILE = 'day-dusk-night-reflection-v2';
const CYCLE = Object.freeze({
  horizon: [new Color(0x8fb6c3), new Color(0xb76b72), new Color(0x11172c)],
  zenith: [new Color(0x315c83), new Color(0x29345c), new Color(0x050917)],
  ambient: [new Color(0x9db7b1), new Color(0x705f70), new Color(0x16243e)],
  sun: [new Color(0xfff1cf), new Color(0xffb474), new Color(0x9eb9ff)]
});

function ease(value) { return value * value * (3 - 2 * value); }
function cycleColor(target, colors, day) {
  if (day <= .56) target.copy(colors[0]).lerp(colors[1], ease(day / .56));
  else target.copy(colors[1]).lerp(colors[2], ease((day - .56) / .44));
}
function cyclePhase(day) { return day < .40 ? 'daylight' : day < .73 ? 'dusk' : 'night'; }

export function createPoseidonOceanLayer({ canvas, onModeChange = () => {} }) {
  const state = {
    requested: query.get('ocean') || 'auto',
    mode: 'webgl-fallback',
    reason: 'not-started',
    active: false,
    backend: null,
    firstFrame: false,
    frames: 0,
    computeN: 0,
    quality: 'med',
    initMs: 0,
    lastError: null,
    cycleProfile: CYCLE_PROFILE,
    cyclePhase: 'daylight',
    cycleAmount: 0,
    wind: {
      profile: 'galevein-shared-wind-v1',
      skyProfile: 'webgpu-advected-clouds-v1',
      prevailingDegrees: 45,
      headingDegrees: 45,
      speed: 10.5,
      gust: 0
    }
  };
  let renderer = null;
  let scene = null;
  let camera = null;
  let ocean = null;
  let oceanMesh = null;
  let skyDome = null;
  let shading = null;
  let elapsed = 0;
  let pendingDt = 0;
  let innerSpacing = 0.35;
  let startPromise = null;
  let currentDpr = 1.5;

  function publish(mode, reason) {
    state.mode = mode;
    state.reason = reason;
    state.active = mode === 'webgpu-ready';
    canvas.hidden = !state.active;
    onModeChange({ ...state });
  }

  function fallback(reason, error = null) {
    state.lastError = error ? String(error?.message || error) : null;
    publish('webgl-fallback', reason);
    if (error) console.warn('[Galevein ocean] WebGPU fallback:', reason, error);
    return snapshot();
  }

  function makeParams(quality) {
    const p = structuredClone(upstreamParams);
    p.N = quality === 'high' ? 128 : 64;
    p.cascades = 3;
    p.sky = 'midday';
    p.timeScale = 0.72;
    return p;
  }

  async function initialize(quality) {
    const startedAt = performance.now();
    state.quality = quality;
    if (query.get('forceNoWebGPU') === '1' || state.requested === 'webgl') return fallback('forced-webgl');
    if (quality === 'low' && state.requested !== 'poseidon') return fallback('low-quality-tier');
    if (!('gpu' in navigator)) return fallback('navigator.gpu-unavailable');
    publish('initializing', 'requesting-adapter');

    try {
      const params = makeParams(quality);
      state.computeN = params.N;
      scene = new Scene();
      camera = new PerspectiveCamera(64, innerWidth / innerHeight, 0.5, 60000);
      renderer = new WebGPURenderer({ canvas, antialias: true });
      renderer.setPixelRatio(currentDpr);
      renderer.setSize(innerWidth, innerHeight, false);
      renderer.setClearColor(new Color(params.colors.skyHorizon), 1);
      renderer.toneMapping = NeutralToneMapping;
      renderer.toneMappingExposure = 1.05;
      await renderer.init();
      if (!renderer.backend?.isWebGPUBackend) return fallback('renderer-not-webgpu');
      state.backend = 'WebGPU';
      const device = renderer.backend.device;
      device?.addEventListener?.('uncapturederror', (event) => {
        state.lastError = event.error?.message || String(event.error);
        fallback('webgpu-validation-error', state.lastError);
      });

      const c = params.colors;
      shading = {
        sunDir: uniform(new Vector3(-0.62, 0.46, 0.34).normalize()),
        sunColor: uniform(CYCLE.sun[0].clone().multiplyScalar(1.18)),
        horizon: uniform(CYCLE.horizon[0].clone()),
        zenith: uniform(CYCLE.zenith[0].clone()),
        ambient: uniform(CYCLE.ambient[0].clone()),
        deepColor: uniform(new Color(c.deep)),
        scatterColor: uniform(new Color(c.scatter)),
        palette: uniform(1),
        sssStrength: uniform(params.sssStrength),
        foamColor: uniform(new Color(c.foam)),
        foamThreshold: uniform(params.foamThreshold),
        foamScale: uniform(params.foamScale),
        detail: uniform(params.detailStrength),
        time: uniform(0),
        day: uniform(0),
        windDir: uniform(new Vector2(Math.SQRT1_2, Math.SQRT1_2)),
        windSpeed: uniform(10.5),
        gust: uniform(0),
        originXZ: uniform(new Vector2()),
        hazeWater: uniform(1 / 5200),
        hazeAir: uniform(1 / 3800),
        specBoost: uniform(5.5)
      };

      skyDome = createSkyDome(shading, 45000);
      scene.add(skyDome);
      scene.fogNode = createAerialPerspective(shading, { density: shading.hazeAir });

      const detailTexture = makeDetailTexture(quality === 'high' ? 384 : 192, 5, 0.68);
      ocean = new Ocean(renderer, params);
      await ocean.updateInitialSpectrum();
      const material = createOceanSurfaceMaterial(ocean.cascades, {
        lengthScales: params.lengthScales,
        shading,
        detailTex: detailTexture
      });
      const gridOptions = quality === 'high'
        ? { rings: 320, sectors: 640, spacing: 0.35, soften: 41 }
        : { rings: 200, sectors: 400, spacing: 0.35, soften: 41 };
      const grid = createRadialGrid(gridOptions);
      innerSpacing = grid.innerSpacing;
      oceanMesh = new Mesh(grid.geometry, material);
      oceanMesh.frustumCulled = false;
      scene.add(oceanMesh);

      camera.position.set(0, 18, 68);
      camera.lookAt(0, 2, -20);
      ocean.evolve(0, 1 / 60);
      renderer.render(scene, camera);
      await device?.queue?.onSubmittedWorkDone?.();
      state.firstFrame = true;
      state.frames = 1;
      state.initMs = Math.round(performance.now() - startedAt);
      publish('webgpu-ready', 'first-frame-rendered');
      return snapshot();
    } catch (error) {
      state.initMs = Math.round(performance.now() - startedAt);
      return fallback('initialization-failed', error);
    }
  }

  function start(quality = 'med') {
    state.quality = quality;
    if (!startPromise) startPromise = initialize(quality);
    return startPromise;
  }

  function syncAndRender(frame) {
    if (!state.active || !renderer || !ocean || !camera) return false;
    pendingDt += clamp(frame.dt || 1 / 60, 1 / 240, 0.05);
    const minFrame = state.quality === 'high' ? 1 / 45 : 1 / 30;
    if (pendingDt < minFrame) return false;
    const dt = clamp(pendingDt, 1 / 240, 0.05);
    pendingDt = 0;
    elapsed += dt * 0.72;
    camera.position.set(frame.position[0], frame.position[1], frame.position[2]);
    camera.quaternion.set(frame.quaternion[0], frame.quaternion[1], frame.quaternion[2], frame.quaternion[3]);
    camera.fov = frame.fov;
    camera.aspect = frame.aspect;
    camera.near = frame.near;
    camera.far = Math.max(60000, frame.far);
    camera.updateProjectionMatrix();

    const day = clamp(frame.day || 0, 0, 1);
    const wind = frame.wind || {};
    const wx = Number(wind.direction?.[0] ?? Math.SQRT1_2);
    const wz = Number(wind.direction?.[1] ?? Math.SQRT1_2);
    const wl = Math.hypot(wx, wz) || 1;
    const windSpeed = clamp(Number(wind.speed ?? 10.5), 0, 30);
    const gust = clamp(Number(wind.gust ?? 0), 0, 1);
    cycleColor(shading.horizon.value, CYCLE.horizon, day);
    cycleColor(shading.zenith.value, CYCLE.zenith, day);
    cycleColor(shading.ambient.value, CYCLE.ambient, day);
    cycleColor(shading.sunColor.value, CYCLE.sun, day);
    shading.sunColor.value.multiplyScalar(day < .56 ? 1.22 - day * .08 : 1.18 - (day - .56) * .50);
    const solarArc = Math.cos(day * Math.PI) * .44;
    shading.sunDir.value.set(-0.62, .18 + solarArc, .34).normalize();
    shading.time.value = elapsed;
    shading.day.value = day;
    shading.windDir.value.set(wx / wl, wz / wl);
    shading.windSpeed.value = windSpeed;
    shading.gust.value = gust;
    shading.hazeAir.value = 1 / (4200 - day * 1350);
    shading.hazeWater.value = 1 / (5700 - day * 1300);
    state.cyclePhase = cyclePhase(day);
    state.cycleAmount = +day.toFixed(3);

    ocean.evolve(elapsed, dt * 0.72);
    const ox = Math.round(camera.position.x / innerSpacing) * innerSpacing;
    const oz = Math.round(camera.position.z / innerSpacing) * innerSpacing;
    oceanMesh.position.set(ox, 0, oz);
    shading.originXZ.value.set(ox, oz);
    state.wind = {
      profile: 'galevein-shared-wind-v1',
      skyProfile: 'webgpu-advected-clouds-v1',
      prevailingDegrees: 45,
      headingDegrees: ((Number(wind.heading ?? Math.PI / 4) * 180 / Math.PI) % 360 + 360) % 360,
      speed: windSpeed,
      gust
    };
    skyDome.position.copy(camera.position);
    renderer.render(scene, camera);
    state.frames += 1;
    return true;
  }

  function resize(width = innerWidth, height = innerHeight, dpr = currentDpr) {
    currentDpr = state.quality === 'high' ? Math.min(dpr, 1.35) : Math.min(dpr, 1);
    if (!renderer || !camera) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(currentDpr);
    renderer.setSize(width, height, false);
  }

  function setQuality(quality, dpr) {
    state.quality = quality;
    currentDpr = quality === 'high' ? Math.min(dpr, 1.35) : Math.min(dpr, 1);
    if (quality === 'low' && state.active && state.requested !== 'poseidon') {
      fallback('low-quality-tier');
      return;
    }
    resize(innerWidth, innerHeight, currentDpr);
    if (!startPromise && quality !== 'low') start(quality);
  }

  function snapshot() {
    return {
      ...state,
      canvas: { width: canvas.width, height: canvas.height, clientWidth: canvas.clientWidth, clientHeight: canvas.clientHeight, hidden: canvas.hidden },
      rendererMemory: renderer?.info?.memory ? { ...renderer.info.memory } : null,
      rendererCalls: renderer?.info?.render?.calls ?? null
    };
  }

  return { start, syncAndRender, resize, setQuality, snapshot };
}
