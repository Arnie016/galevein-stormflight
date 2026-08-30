const DEFAULTS = Object.freeze({
  width: 512,
  height: 256,
  probeCount: 16,
  cadenceHz: 4,
  cpuCadenceHz: 2,
  maxLaunchFrameMs: 18,
  timingWindow: 120,
  seed: 0x5ab1e5
});

const clamp01 = (value) => Math.max(0, Math.min(1, value));
const quantile = (values, q) => {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] || 0;
};

function deterministicField(width, height, seed) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let n = state;
    n = Math.imul(n ^ (n >>> 15), n | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
  const flat = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const broad = Math.sin(x * 0.083 + y * 0.127) * 0.18;
      flat[y * width + x] = clamp01(0.42 + broad + (next() - 0.5) * 0.16);
    }
  }
  return flat;
}

function rowsFromFlat(flat, width, height) {
  return Array.from({ length: height }, (_, y) => flat.slice(y * width, (y + 1) * width));
}

function loadGpuRuntime(source) {
  if (globalThis.GPU?.isWebGPUAvailable) return Promise.resolve(globalThis.GPU);
  if (globalThis.__galeveinGpuJsLoad) return globalThis.__galeveinGpuJsLoad;
  globalThis.__galeveinGpuJsLoad = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = source;
    script.async = true;
    script.dataset.galeveinRuntime = 'gpujs-2.24.0';
    script.onload = () => globalThis.GPU?.isWebGPUAvailable
      ? resolve(globalThis.GPU)
      : reject(new Error('GPU.js loaded without its browser API'));
    script.onerror = () => reject(new Error(`GPU.js runtime failed to load: ${source}`));
    document.head.appendChild(script);
  });
  return globalThis.__galeveinGpuJsLoad;
}

/**
 * A deliberately narrow GPU compute lane for future atmospheric systems.
 *
 * The 131,072-cell field stays resident in a GPU.js WebGPU pipeline. Only sixteen
 * deterministic probes return to JavaScript four times per second. This avoids
 * per-frame readPixels and keeps dragon flight, Three.js rendering, and the
 * Poseidon ocean independent. If WebGPU is unavailable or the kernel rejects,
 * the same deterministic scalar field continues on a capped CPU fallback.
 */
export class GaleveinAtmosphereCompute {
  constructor(options = {}) {
    this.settings = { ...DEFAULTS, ...options };
    this.requestedMode = options.mode || 'off';
    this.runtimeSource = options.runtimeSource || './vendor/gpujs/gpu-browser-2.24.0.min.js';
    this.forceNoWebGPU = !!options.forceNoWebGPU;
    this.backend = 'off';
    this.status = 'idle';
    this.fallbackReason = null;
    this.initMs = 0;
    this.inFlight = false;
    this.suspended = false;
    this.benchmarking = false;
    this.nextAt = 0;
    this.phase = 0;
    this.ticks = 0;
    this.skippedBusy = 0;
    this.skippedBudget = 0;
    this.timings = [];
    this.probes = new Float32Array(this.settings.probeCount);
    this._cpuA = deterministicField(this.settings.width, this.settings.height, this.settings.seed);
    this._cpuB = new Float32Array(this._cpuA.length);
    this._gpu = null;
    this._stepKernel = null;
    this._probeKernel = null;
    this._fieldHandle = null;
  }

  async init() {
    const started = performance.now();
    if (this.requestedMode === 'off') {
      this.status = 'off';
      return this.snapshot();
    }
    this.status = 'initializing';
    if (this.requestedMode === 'cpu' || this.forceNoWebGPU) {
      this._activateCpu(this.forceNoWebGPU ? 'forced-no-webgpu' : null);
      this.initMs = performance.now() - started;
      return this.snapshot();
    }
    try {
      const GPUClass = await loadGpuRuntime(this.runtimeSource);
      const available = !this.forceNoWebGPU && await GPUClass.isWebGPUAvailable();
      if (!available) this._activateCpu('webgpu-unavailable');
      else await this._activateWebGPU(GPUClass);
    } catch (error) {
      this._activateCpu(`gpujs-init:${error?.message || error}`);
    }
    this.initMs = performance.now() - started;
    return this.snapshot();
  }

  _activateCpu(reason = null) {
    this.backend = 'cpu';
    this.status = reason ? 'fallback' : 'ready';
    this.fallbackReason = reason;
    this.nextAt = performance.now();
  }

  async _activateWebGPU(GPUClass) {
    const { width, height, probeCount } = this.settings;
    this._gpu = new GPUClass({ mode: 'webgpu' });
    this._stepKernel = this._gpu.createKernel(function stepAtmosphere(field, phase, windX, windY, gust) {
      const x = this.thread.x;
      const y = this.thread.y;
      const offsetX = windX >= 0.0 ? 1 : -1;
      const offsetY = windY >= 0.0 ? 1 : -1;
      let upstreamX = x - offsetX;
      let upstreamY = y - offsetY;
      if (upstreamX < 0) upstreamX = this.constants.width - 1;
      if (upstreamX >= this.constants.width) upstreamX = 0;
      if (upstreamY < 0) upstreamY = this.constants.height - 1;
      if (upstreamY >= this.constants.height) upstreamY = 0;
      const center = field[y][x];
      const upstream = field[upstreamY][upstreamX];
      const wave = Math.sin(x * 0.173 + phase * 0.71) * Math.cos(y * 0.219 - phase * 0.43);
      const ridge = Math.sin((x + y) * 0.071 + phase * 0.19);
      const forcing = 0.5 + wave * 0.28 + ridge * 0.12 + gust * 0.1;
      let next = center * 0.86 + upstream * 0.1 + forcing * 0.04;
      if (next < 0.0) next = 0.0;
      if (next > 1.0) next = 1.0;
      return next;
    }, {
      output: [width, height],
      constants: { width, height },
      pipeline: true,
      immutable: true,
      precision: 'single',
      tactic: 'speed'
    });
    this._probeKernel = this._gpu.createKernel(function probeAtmosphere(field) {
      const i = this.thread.x;
      const x = (i * 37 + 11) % this.constants.width;
      const y = (i * 19 + 7) % this.constants.height;
      return field[y][x];
    }, {
      output: [probeCount],
      constants: { width, height },
      precision: 'single',
      tactic: 'speed'
    });
    this._fieldHandle = await this._stepKernel(
      rowsFromFlat(this._cpuA, width, height), 0, Math.SQRT1_2, Math.SQRT1_2, 0.25
    );
    const initialProbes = await this._probeKernel(this._fieldHandle);
    this.probes.set(Array.from(initialProbes).slice(0, probeCount));
    this.backend = 'webgpu';
    this.status = 'ready';
    this.nextAt = performance.now();
  }

  update(nowMs, context = {}) {
    if (!['ready', 'fallback'].includes(this.status) || this.benchmarking || this.suspended) return false;
    if (this.inFlight) {
      this.skippedBusy += 1;
      return false;
    }
    if (nowMs < this.nextAt) return false;
    const maxFrame = Number(context.maxLaunchFrameMs ?? this.settings.maxLaunchFrameMs);
    if (Number(context.frameMs || 0) > maxFrame) {
      this.skippedBudget += 1;
      this.nextAt = nowMs + 80;
      return false;
    }
    const cadence = this.backend === 'webgpu' ? this.settings.cadenceHz : this.settings.cpuCadenceHz;
    this.nextAt = nowMs + 1000 / cadence;
    this.inFlight = true;
    this._runStep(context).catch((error) => {
      if (this.backend === 'webgpu') this._activateCpu(`gpujs-runtime:${error?.message || error}`);
    }).finally(() => { this.inFlight = false; });
    return true;
  }

  async _runStep(context = {}) {
    const started = performance.now();
    const wind = context.wind || [Math.SQRT1_2, 0, Math.SQRT1_2];
    const dt = Math.max(1 / 240, Math.min(0.5, Number(context.dt || 1 / this.settings.cadenceHz)));
    this.phase += dt;
    if (this.backend === 'webgpu') {
      const previous = this._fieldHandle;
      const next = await this._stepKernel(previous, this.phase, Number(wind[0] || 0), Number(wind[2] ?? wind[1] ?? 0), Number(context.gust || 0));
      const sampled = await this._probeKernel(next);
      this.probes.set(Array.from(sampled).slice(0, this.settings.probeCount));
      this._fieldHandle = next;
      if (previous && previous !== next && typeof previous.delete === 'function') await Promise.resolve(previous.delete());
    } else {
      this._runCpuStep(Number(wind[0] || 0), Number(wind[2] ?? wind[1] ?? 0), Number(context.gust || 0));
    }
    const elapsed = performance.now() - started;
    this.timings.push(elapsed);
    if (this.timings.length > this.settings.timingWindow) this.timings.shift();
    this.ticks += 1;
    return elapsed;
  }

  _runCpuStep(windX, windY, gust) {
    const { width, height, probeCount } = this.settings;
    const offsetX = windX >= 0 ? 1 : -1;
    const offsetY = windY >= 0 ? 1 : -1;
    const source = this._cpuA;
    const target = this._cpuB;
    for (let y = 0; y < height; y += 1) {
      const upstreamY = (y - offsetY + height) % height;
      for (let x = 0; x < width; x += 1) {
        const upstreamX = (x - offsetX + width) % width;
        const center = source[y * width + x];
        const upstream = source[upstreamY * width + upstreamX];
        const wave = Math.sin(x * 0.173 + this.phase * 0.71) * Math.cos(y * 0.219 - this.phase * 0.43);
        const ridge = Math.sin((x + y) * 0.071 + this.phase * 0.19);
        target[y * width + x] = clamp01(center * 0.86 + upstream * 0.1 + (0.5 + wave * 0.28 + ridge * 0.12 + gust * 0.1) * 0.04);
      }
    }
    this._cpuA = target;
    this._cpuB = source;
    for (let i = 0; i < probeCount; i += 1) {
      const x = (i * 37 + 11) % width;
      const y = (i * 19 + 7) % height;
      this.probes[i] = target[y * width + x];
    }
  }

  async benchmark({ warmup = 6, steps = 36, wind = [Math.SQRT1_2, 0, Math.SQRT1_2], gust = 0.55 } = {}) {
    if (!['ready', 'fallback'].includes(this.status)) throw new Error(`Atmosphere compute is ${this.status}`);
    if (this.inFlight) {
      while (this.inFlight) await new Promise((resolve) => setTimeout(resolve, 5));
    }
    this.benchmarking = true;
    const samples = [];
    try {
      for (let i = 0; i < warmup + steps; i += 1) {
        const elapsed = await this._runStep({ wind, gust, dt: 1 / this.settings.cadenceHz });
        if (i >= warmup) samples.push(elapsed);
      }
    } finally {
      this.benchmarking = false;
      this.nextAt = performance.now() + 1000 / (this.backend === 'webgpu' ? this.settings.cadenceHz : this.settings.cpuCadenceHz);
    }
    return {
      backend: this.backend,
      cells: this.settings.width * this.settings.height,
      steps: samples.length,
      readbackFloatsPerStep: this.settings.probeCount,
      medianMs: +quantile(samples, 0.5).toFixed(3),
      p95Ms: +quantile(samples, 0.95).toFixed(3),
      maxMs: +Math.max(...samples).toFixed(3),
      samples: samples.map((value) => +value.toFixed(3))
    };
  }

  snapshot() {
    const values = Array.from(this.probes);
    const mean = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    return {
      profile: 'galevein-atmosphere-compute-v1',
      requestedMode: this.requestedMode,
      status: this.status,
      backend: this.backend,
      fallbackReason: this.fallbackReason,
      version: 'gpu.js-2.24.0',
      cells: this.settings.width * this.settings.height,
      dimensions: [this.settings.width, this.settings.height],
      cadenceHz: this.backend === 'webgpu' ? this.settings.cadenceHz : this.settings.cpuCadenceHz,
      pipelineResident: this.backend === 'webgpu',
      readbackFloatsPerTick: this.settings.probeCount,
      authority: 'telemetry-only-experiment-v1',
      consumerSlots: ['cloud-density', 'lightning-charge', 'fog-bank', 'flock-lift', 'tornado-shear'],
      initMs: +this.initMs.toFixed(2),
      ticks: this.ticks,
      inFlight: this.inFlight,
      suspended: this.suspended,
      skippedBusy: this.skippedBusy,
      skippedBudget: this.skippedBudget,
      timing: {
        samples: this.timings.length,
        medianMs: +quantile(this.timings, 0.5).toFixed(3),
        p95Ms: +quantile(this.timings, 0.95).toFixed(3),
        maxMs: +(this.timings.length ? Math.max(...this.timings) : 0).toFixed(3)
      },
      probes: { count: values.length, mean: +mean.toFixed(4), min: +Math.min(...values).toFixed(4), max: +Math.max(...values).toFixed(4) }
    };
  }

  async destroy() {
    this.status = 'destroying';
    if (this._fieldHandle?.delete) await Promise.resolve(this._fieldHandle.delete()).catch(() => {});
    if (this._gpu?.destroy) await this._gpu.destroy().catch(() => {});
    this._fieldHandle = null;
    this._gpu = null;
    this.status = 'destroyed';
  }

  setSuspended(value) {
    this.suspended = !!value;
    return this.suspended;
  }
}
