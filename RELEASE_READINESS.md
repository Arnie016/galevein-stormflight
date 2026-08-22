# Release readiness — 2026-08-22

## Scope

This checklist applies only to the generated `release/` artifact. It does not clear the older `dragon-storm-game` checkout, its legacy creature rigs, source packs, reports, or prior public page.

## Included runtime inputs

- Original project-generated Stormlance creature: `assets/galevein_stormlance.glb`.
- Procedural code-only landmarks; no legacy world GLB is fetched.
- Project-generated audio plus one documented CC0 menu track.
- Three.js r165, with MIT notice retained in `THIRD_PARTY_NOTICES.md`.
- Poseidon spectral-ocean source pinned to commit `184721a8eee8b4f78f31dcfdff4734574155685d`, plus Three.js r184 WebGPU/TSL, with complete MIT texts and a file-level provenance ledger.
- Project-owned procedural dusk/night sky; no upstream Poseidon panorama is shipped or requested.

## Excluded by construction

- Legacy/derivative dragon rigs and any rig-picker query route to them.
- Previous prototype media folders, source packs, reports, VisionOS work, and production Blender source.
- Any external network dependency; local smoke observed no external requests.
- Poseidon GUI, capture tools, development dependencies, and all upstream sky panorama files.

## Validation completed

- Stormlance GLB: Draco-compressed, one skin, 25-bone runtime contract, named `Flap` and `Glide` actions.
- Local browser smoke: game booted, the Stormlance loaded, procedural landmarks built, no console problems, and no external requests.
- Chrome 151 local WebGPU proof: Poseidon reached `webgpu-ready`, submitted its first frame, reported 18,807,596 bytes of renderer memory on medium, and hid the legacy sea/sky only after success.
- Forced `?ocean=webgl` proof: the Poseidon canvas remained hidden and the legacy sea/sky remained visible, with no blank frame or crash.
- Objective proof: Story, Practice, and Chapter launch contracts passed; beacon 12 produced `ESCAPED`; full detection produced `DETECTED`; reaching nightfall early produced `NIGHTFALL`.
- Low-altitude proof: two seconds of open-water flight remained active at roughly 15 m altitude with the WebGPU ocean visible and no runtime fault.
- Local duel proof: two independent same-origin tabs elected one temporary authority, rendered each other's Stormlance, converged one contested Stormheart capture, exchanged combat damage, entered a zero-health death state, and returned the downed client to flight after three seconds. The run made no external requests and produced no browser errors.
- Authored-opening proof: Wake Perch uses a fixed seed and launch pose, hides route clutter and distant set pieces until launch, preserves more than 35 m of route clearance, and presents one primary Story action.
- Current working-title web search did not reveal an exact game/product match, but that is not a trademark clearance or legal opinion.

## Release boundary

This is a free, non-commercial prototype using the working title **Galevein: Stormflight**. A paid launch, title/trademark filing, storefront campaign, or commercial asset claim requires a new build-hash ledger and appropriate professional review.

The GitHub Pages artifact is a public technical preview, not a production or
commercial release. A final human visual review is still required; the current
procedural mid-flight architecture remains placeholder-quality, and a green
harness or live URL does not establish store readiness or legal clearance.

The Local 1v1 Lab is same-device/two-tab transport built on `BroadcastChannel`.
It does not claim internet matchmaking, persistent accounts, anti-cheat,
dedicated-server authority, latency compensation, or cross-device networking.
