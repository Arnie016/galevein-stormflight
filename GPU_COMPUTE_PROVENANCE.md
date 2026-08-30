# GPU atmosphere compute provenance

## Intake

- Project: GPU.js
- Canonical source: https://github.com/gpujs/gpu.js
- Package/version: `gpu.js@2.24.0`
- License: MIT, copied to `licenses/gpujs-2.24.0-MIT.txt`
- Shipped upstream file: `dist/gpu-browser.min.js`
- Reviewed bundle SHA-256: `68d8be4bcb15e755d396268b9045fa6e157a818701237e72df2f8f9ea38991ed`

`scripts/sync-gpujs-runtime.mjs` rejects a different dependency version,
license identity, or browser-bundle digest. The release does not ship GPU.js
source, package metadata, optional native `gl`, development tools, or examples.

## Galevein-owned integration

`world-expansion/modules/gpuAtmosphereField.js` is original Galevein code. It
uses GPU.js as a compute runtime for a 131,072-cell deterministic atmospheric
field. The simulation remains isolated from flight authority, dragon rigging,
Three.js rendering, and the Poseidon ocean.

The WebGPU path keeps the field in a pipeline buffer and reads sixteen probes at
four hertz. It never performs a full-field, per-frame readback. Slow frames skip
launches, overlapping work is refused, and an unavailable or failed WebGPU path
falls back to a two-hertz CPU implementation.

## Adoption boundary

The module is opt-in with `?compute=gpujs`. `?compute=cpu` runs the matched CPU
implementation and `?compute=gpujs&forceNoComputeWebGPU=1` proves fallback.
The matched benchmark proves useful compute performance without changing frame
p95, but the default game remains `compute=off` because the field has no visual
consumer yet. Its current output is telemetry-only; future cloud, lightning,
fog, flock, and tornado systems may consume the probes only after a separate
visual and performance acceptance pass.
