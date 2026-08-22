# Release readiness — 2026-08-22

## Scope

This checklist applies only to the generated `release/` artifact. It does not clear the older `dragon-storm-game` checkout, its legacy creature rigs, source packs, reports, or prior public page.

## Included runtime inputs

- Original project-generated Stormlance creature: `assets/galevein_stormlance.glb`.
- Procedural code-only landmarks; no legacy world GLB is fetched.
- Project-authored Crownfall terrain system; no external terrain asset is fetched.
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

- Stormlance v2 GLB: Draco-compressed, one skin, 25-bone runtime contract, named `Flap` and `Glide` actions. The clean-room generator reports 2,880 Blender vertices, 2,787 polygons, a 1.5325-unit wingspan, and a positive rider-seat gap after the v2 rebuild.
- Local browser smoke: game booted, the Stormlance loaded, procedural landmarks built, no console problems, and no external requests.
- Chrome 151 local WebGPU proof: Poseidon reached `webgpu-ready`, submitted its first frame, reported 18,895,074 bytes of renderer memory on medium, and hid the legacy sea/sky only after success.
- Shared-wind proof: a deterministic 45-degree prevailing field drives flight drift and roll, asymmetric wing flex, 110 four-segment streamlines, rain shear, audio, WebGL cloud travel, and the WebGPU/TSL cloud layer. The sampled strongest fixed-cycle gust reached 0.932 / 19.45 m/s; the matched WebGPU ocean pose measured 8.4 ms p50 and 32.5 ms p95 frame time over 900 samples.
- Forced `?ocean=webgl` proof: the Poseidon canvas remained hidden and the legacy sea/sky remained visible, with no blank frame or crash.
- Objective proof: Story, Practice, and Chapter launch contracts passed; beacon 12 produced `ESCAPED`; full detection produced `DETECTED`; reaching nightfall early produced `NIGHTFALL`.
- Low-altitude proof: two seconds of open-water flight remained active at roughly 15 m altitude with the WebGPU ocean visible and no runtime fault.
- Local duel proof: two independent same-origin tabs elected one temporary authority, rendered each other's Stormlance, converged one contested Stormheart capture, exchanged combat damage, entered a zero-health death state, and returned the downed client to flight after three seconds. The heartbeat now samples live transforms even when a tab's render loop is suspended, and the respawn timer uses a monotonic real-time clock. The run made no external requests and produced no browser errors.
- Authored-opening proof: Wake Perch uses a fixed seed and launch pose, hides route clutter and distant set pieces until launch, preserves more than 35 m of route clearance, and presents one primary Story action.
- Crownfall r11 proof: one 980 × 740 macro-landmass rises 560 units above the sea, exposes four named districts and four collision proxies, uses three LODs capped at 3,456 terrain triangles and five draw calls, and preserves 65.1 units of minimum clearance from the protected Story route. The final local Story/WebGPU harness passed 24/24 checks; the final Local 1v1 harness passed 7/7 checks, with no external requests or browser errors in either run.
- Current working-title web search did not reveal an exact game/product match, but that is not a trademark clearance or legal opinion.

## Release boundary

This is a free, non-commercial prototype using the working title **Galevein: Stormflight**. A paid launch, title/trademark filing, storefront campaign, or commercial asset claim requires a new build-hash ledger and appropriate professional review.

The GitHub Pages artifact is a public technical preview, not a production or
commercial release. A final human visual review is still required; the current
procedural mid-flight architecture remains placeholder-quality, and a green
harness or live URL does not establish store readiness or legal clearance.

Crownfall fixes macro scale and navigational hierarchy, but its terrain
materials and remaining distant silhouettes are still prototype-quality. It
does not establish Fortnite-level art fidelity or a complete open-world RPG.

The Local 1v1 Lab is same-device/two-tab transport built on `BroadcastChannel`.
It does not claim internet matchmaking, persistent accounts, anti-cheat,
dedicated-server authority, latency compensation, or cross-device networking.
