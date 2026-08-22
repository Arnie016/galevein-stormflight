# Galevein: Stormflight

An original browser-game prototype about flying a Galevein through the Sable Reach: learn the cove, evade the keepers, collect the beacons, and escape through the Tempest Gate.

## Play

Serve this folder over HTTP; ES modules and the Draco-compressed creature will not load from `file://`.

```sh
python3 -m http.server 8000
```

Then open `http://127.0.0.1:8000`.

On Chrome/Edge/Safari builds with WebGPU, medium and high graphics use the
spectral Poseidon ocean. Unsupported browsers and the low tier keep the
original WebGL ocean automatically; `?ocean=webgl` is the deterministic
fallback check.

## Build the release artifact

```sh
npm install --ignore-scripts
npm run build
```

The build syncs the exact reviewed Poseidon commit and Three.js r184 files,
then creates `release/` from an explicit allowlist. It does not include
`node_modules`, the upstream GUI/tools, or any upstream panorama.

## Controls

- `W` / `S`: speed up / brake
- Arrow keys or `A` / `D`: climb, dive, bank, turn
- `Space`: flap for lift
- Hold/release `X`: charge plasma
- `C`: echo pulse; `F`: call the flock
- Hold/release `A` or `D`: spiral into Ultra speed
- Dive then pull up: Stormbreak Dive
- `Q` / `E`: look; `V`: chase/rider view
- `Tab`: Flight Codex; `B`: Forge; `M`: sound

## Prototype boundary

This is a free, non-commercial prototype under a working title. It uses an original locally generated Stormlance Galevein, procedural landmarks, synthesized project audio, a documented CC0 menu track, vendored Three.js, and an MIT-licensed Poseidon spectral-ocean adaptation. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), [OCEAN_PROVENANCE.md](OCEAN_PROVENANCE.md), and [RELEASE_READINESS.md](RELEASE_READINESS.md).

## Flight harness

The development workspace includes a local preflight harness inspired by the supplied game-harness reference, adapted to this game rather than imported from it. It boots the exact static artifact in an isolated browser, verifies the one original creature and procedural world, proves the WebGPU ocean or fallback decision, exercises Story, Practice, and Chapter entry paths, and asserts the escape, detection, and nightfall outcomes.

```sh
node scripts/flight-harness.mjs --root release --out /tmp/galevein-flight-harness.json
```

By default it is loopback-only and never publishes or changes game assets. `--preflight-shot`, `--shot`, and `--fallback-shot` are optional visual checkpoints.

The current public technical preview is available at
[arnie016.github.io/galevein-stormflight](https://arnie016.github.io/galevein-stormflight/).
The same assertions can target that public origin directly:

```sh
node scripts/flight-harness.mjs --url https://arnie016.github.io/galevein-stormflight/index.html --out /tmp/galevein-live.json
```
