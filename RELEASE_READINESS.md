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
- Stormscar r12 local duel proof: two independent same-origin tabs elected one temporary authority, rendered each other's Stormlance over the authored Shelf arena, exposed Volt Lance, Arc Scatter, and Wingbreak Pulse, and accepted bounded damage only after host validation of attack identity, cooldown, range, and damage. The clients converged one contested Stormheart capture, entered a zero-health death state, and returned the downed client to flight after three seconds. The 9/9 run made no external requests and produced no browser errors.
- Authored-opening proof: Wake Perch uses a fixed seed and launch pose, hides route clutter and distant set pieces until launch, preserves more than 35 m of route clearance, and presents one primary Story action.
- Crownfall r11 proof: one 980 × 740 macro-landmass rises 560 units above the sea, exposes four named districts and four collision proxies, uses three LODs capped at 3,344 terrain triangles and five draw calls, clips submerged heightfield cells, and preserves 65.1 units of minimum clearance from the protected Story route. The final local Story/WebGPU harness passed 24/24 checks; the final Local 1v1 harness passed 7/7 checks, with no external requests or browser errors in either run.
- Stormscar r12 regression proof: the post-combat-change Story/WebGPU harness passed 24/24 checks, including WebGPU first-frame submission and the forced WebGL fallback; it reported no external requests or browser errors.
- Server foundation r13 proof: a dependency-free loopback WebSocket server paired exactly two browser clients while both reported `authoritative: false` and `serverAuthoritative: true`. The 11/11 client run and three server assertions recorded one accepted Volt Lance, Arc Scatter, and Wingbreak Pulse with zero rejects, three objective captures, one death, one respawn, and one converged first-to-three winner. The unchanged BroadcastChannel fallback passed 10/10 and the Story/WebGPU regression passed 24/24.
- Crownfall r14 visual proof: the terrain retains its 980 x 740 footprint, 560-unit height, five-draw-call ceiling, four collision proxies, and 65.1-unit protected-route clearance while changing to a connected twin-peak silhouette with a readable Stormscar shoulder. Slope-aware biomes and two generated 256 x 256 normal/roughness textures replace smooth altitude bands; the revised LODs measure 3,518 / 940 / 394 triangles. Three matched views passed the authored-runtime assertion. An earlier high-frequency surface candidate was rejected because it produced visible moire, so it is not release evidence. The exact final release then passed the Story/WebGPU harness 24/24 and the same-device Stormscar 1v1 harness 10/10, each with zero external requests and zero browser console problems.
- Operations deck r15 proof: the preflight UI now exposes Story Campaign and Stormscar Duel as its two primary routes, with Practice Cove and Checkpoints as utilities. The local-duel selection explicitly reports `TWO TABS · SAME DEVICE`; it does not claim online matchmaking. The exact local release passed 25/25 Story/WebGPU assertions and 10/10 same-device duel assertions with zero external requests or browser console problems. The loopback server-authority run passed 11/11 browser assertions plus all three server assertions: two connections, one match, one accepted attack from each class, zero rejected attacks, three captures, one death, and one respawn. A build-only test proved that `GALEVEIN_DUEL_SERVER_URL` injects an author-pinned credential-free WSS endpoint, and the final public-bound build was rebuilt with no endpoint configured.
- Bounded Reach r16 proof: the old 30-cone and ten-billboard horizon is absent. The replacement reports three deterministic mountain layers, 86 volumetric mountain instances, 220 forest instances, six dimensional sky monoliths, five draw calls, a forward valley corridor, and zero billboard silhouettes. Crownfall v3 reports 16,956 / 4,350 / 1,148 visible LOD triangles, seven maximum draw calls, 128 shore-talus rocks, 141 ledge trees, four collision proxies, and the unchanged 65.1-unit Story-route clearance. Poseidon reports `day-dusk-night-reflection-v2`, a submitted WebGPU first frame, and safe forced WebGL fallback. The exact release passed 27/27 Story/WebGPU assertions, 10/10 same-device duel assertions, and 11/11 server-routed browser assertions plus all three authority-server assertions with zero external requests or console problems. Three locally captured WebGL fallback views document daylight approach, fog-valley dusk, and night coast; Chrome's WebGPU surface readback timed out, so those image files are not claimed as WebGPU screenshots.
- Keeper shrines r17 proof: all three modern striped lighthouses and their broad opaque cones are replaced by project-authored fractured-basalt and weathered-bronze wind shrines. Each threat exposes 18 segmented wind-shear lines, a maximum cone opacity of 0.045, unchanged angular/occlusion detection authority, four health, wind coupling, and plasma destruction. Main-route markers changed from complete 0.42-tube hoops to partial `storm-vane-v2` arcs with 0.28 tube and 0.42 maximum opacity while preserving the 15-unit hit radius. The exact release passed 28/28 Story/WebGPU/fallback assertions, 10/10 same-device duel assertions, and 11/11 server-routed browser assertions plus all three authority-server assertions, with zero external requests or console problems. Three matched local WebGL captures document daylight, dusk, and night; visual inspection judges the original-world coherence and cue restraint improved, while the architecture and vegetation remain stylized.
- Keeper Hollow r18 proof: Chapter IV now uses one deterministic eroded-cliff basin instead of the six unrelated center rocks and the prior chapter's dominant black canyon wall. Sixteen cliff masses include the six exactly preserved legacy collision proxies, three seated shrine supports, and eight perimeter shoulders; the retained candidate adds 520 deterministic ledge-cluster conifers, 112 talus rocks, 16 wet aprons, and 16 surf collars in five draw calls. The protected route retains 25.8 units of minimum clearance. The exact local release passed 29/29 Story/WebGPU/fallback assertions, 10/10 same-device duel assertions, and 11/11 server-routed browser assertions plus all three authority-server assertions, with zero external requests or console problems. Chrome submitted a medium-quality WebGPU frame and reported 18,825,954 renderer bytes; the fixed ocean proof measured 8.4 ms median and 33.6 ms p95, while forced WebGL fallback measured 8.4 ms median and 24.9 ms p95. Three matched local captures document daylight, dusk, and night. Visual inspection judges framing, chapter separation, shrine grounding, and forest density improved, while the faceted procedural geology remains stylized and requires human playtest feedback.
- Long Night route r19 proof: the real Chapter IV beacon path and the three shrine sites now occupy one deterministic corridor instead of separate parts of the map. Ten alternating valley shoulders, three shrine supports, 520 ledge-cluster conifers, 112 talus rocks, wet aprons, surf collars, and a Chapter IV fog increment use five instanced draw calls and retain 69.4 units of measured minimum route clearance. Beacon eleven is production-locked while any shrine remains. The falsifiable verifier first reached it at score 10 and confirmed the gate stayed sealed, then fired two real charged-plasma projectiles into each of the three production shrines, observed all health values fall from 4 to -2, and confirmed beacon eleven advanced the score to 11 only afterward. The exact local release passed 31/31 Story/WebGPU/fallback assertions, 10/10 same-device duel assertions, and 11/11 server-routed browser assertions plus all three authority-server assertions, with zero external requests or browser console problems. Chrome submitted a medium-quality WebGPU frame and reported 18,860,514 renderer bytes. Three matched local WebGL captures passed visual review for corridor continuity, dragon framing, shrine readability, and no camera clipping. The result is visibly denser and less lobby-like, but still faceted procedural art rather than photoreal terrain.
- Current working-title web search did not reveal an exact game/product match, but that is not a trademark clearance or legal opinion.

## Release boundary

This is a free, non-commercial prototype using the working title **Galevein: Stormflight**. A paid launch, title/trademark filing, storefront campaign, or commercial asset claim requires a new build-hash ledger and appropriate professional review.

The GitHub Pages artifact is a public technical preview, not a production or
commercial release. A final human visual review is still required; the current
procedural mid-flight architecture remains placeholder-quality, and a green
harness or live URL does not establish store readiness or legal clearance.

Crownfall and the Bounded Reach now establish macro scale, coastal geology,
forested depth, and a navigable valley hierarchy, but their code-generated
vegetation, Keeper shrine architecture, and distant materials remain stylized
prototype art. They do not establish Fortnite-level fidelity or a complete
open-world RPG.

The public Stormscar 1v1 Lab remains same-device/two-tab transport built on
`BroadcastChannel`. The source workspace now contains a locally proven
server-authoritative WebSocket path, but it has not been provisioned, deployed,
or cross-device tested. Production internet matchmaking still needs TLS and
reverse-proxy validation, an approved hosting and spend cap, authentication or
anonymous-session abuse controls, regional latency tests, persistence policy,
capacity/load testing, observability, and operational review.
