# Ocean provenance

## Canonical intake

- Repository: `https://github.com/owenyuwono/poseidon`
- Pinned commit: `184721a8eee8b4f78f31dcfdff4734574155685d`
- Upstream license: MIT; full text at `licenses/poseidon-MIT.txt`
- Runtime: Three.js `0.184.0` WebGPU/TSL; full text at `licenses/three-r184-MIT.txt`

`package-lock.json` pins the intake. `scripts/sync-poseidon-runtime.mjs`
materializes and verifies the browser files before the release allowlist is
built.

## Borrowed files

The following are copied from the pinned Poseidon commit:

- `Ocean.js`, `OceanCascade.js`: simulation orchestration and cascades.
- `fft.js`, `gaussianNoise.js`, `spectrum.js`: seeded spectral field and FFT.
- `maps.js`: displacement, derivative, and foam map assembly.
- `oceanGrid.js`: camera-centred radial ocean geometry.
- `oceanSurfaceMaterial.js`, `water.js`, `detailTexture.js`: water shading,
  attenuation, whitecaps, glitter, and detail texture.
- `atmosphere.js`: aerial-perspective node.
- `params.js`: reviewed upstream tuning constants and documented model lineage.

The Three.js r184 files `three.core.js`, `three.tsl.js`, and
`three.webgpu.js` are copied from the exact `three@0.184.0` package.

## Galevein modifications

- `world-expansion/modules/poseidonOceanLayer.js` is project-authored. It owns
  the isolated r184 renderer, quality budgets, camera synchronization,
  first-frame gate, diagnostics, and WebGL fallback.
- `world-expansion/modules/galeveinPoseidonSky.js` is project-authored. It
  supplies a procedural storm-dusk sky to the Poseidon water reflection and
  atmosphere paths.
- The sync script rewrites only the two Poseidon `sky.js` imports to the
  project-owned sky module.
- The sync script suppresses Three r184's generic multi-instance warning. Two
  revisions are intentional and do not exchange objects: r165 owns gameplay;
  r184 owns the lower ocean canvas.
- Medium uses a 64 by 64 FFT for each of three cascades, a 200 by 400 radial
  grid, 1.0 ocean pixel ratio, and a 30 Hz water update. High uses a 128 by 128
  FFT, 320 by 640 grid, up to 1.35 ocean pixel ratio, and a 45 Hz update.

## Deliberately excluded

- All upstream panorama files, including the separately credited golden sky.
- Upstream `sky.js`, GUI, HUD, capture/fly-camera utilities, tools, docs, and
  development configuration.
- `lil-gui` and every `node_modules` file from the served release artifact.

## Gameplay boundary

The Poseidon layer is visual. Galevein's existing `waveH` function remains the
authority for flight collision, sea strikes, splash placement, and rogue-wave
gameplay. Unsupported WebGPU, forced fallback, or low graphics leave the
original WebGL sea and sky active.
