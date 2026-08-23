# Galevein: Stormflight

An original browser-game prototype about flying a Galevein through the Sable Reach: learn the cove, evade the keepers, collect the beacons, and escape through the Tempest Gate.

The release contains two distinct play contracts:

- **Story** is the authored solo route from Wake Perch through the floating Sable Reach.
- **Stormscar 1v1 Lab** links two tabs opened to the same origin on one device. The pair contests the Stormheart with three distinct attacks, exchanges flight state and authority-validated combat damage, and respawns a downed dragon after three seconds. This is a real two-client prototype, but it is not internet matchmaking; GitHub Pages does not provide a multiplayer server.

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

Build r10 adds one deterministic 45-degree prevailing wind field. Its gust
cycle now drives dragon drift and roll, asymmetric wing flex, swaying
four-segment streamlines, rain shear, wind audio, WebGL cloud travel, and the
WebGPU/TSL cloud layer reflected by the ocean. The fallback remains the
production default whenever the WebGPU first-frame gate does not pass.

Build r11 replaces the seven isolated cone mountains with **Crownfall Range**,
a 980 × 740 authored macro-landmass rising 560 units above the sea. Crownfall
uses three terrain LODs, a wet shoreline, animated surf, waterfalls, settlement
lights, and four readable districts: Crownfall Summit for Story, Stormscar
Shelf as a PvP arena, Gale Cut as a flight pass, and The Undercroft as
a future quest entrance. The protected Story route retains 65.1 units of
measured minimum clearance. This is a map-scale and navigation pass; the
terrain surface remains prototype art rather than a final realistic biome.

Build r12 activates **Stormscar Shelf** as the 1v1 combat arena. `X` fires a
chargeable long-range Volt Lance, `Z` fires close-range Arc Scatter, and `R`
emits a short-range Wingbreak Pulse that interrupts the shared capture. The
temporary host validates attack identity, cooldown, range, and damage bounds.

Build r13 adds a local-first **server-authority foundation**. An opt-in
WebSocket route moves pairing, health, attack validation, kills, capture score,
round victory, and respawn timing out of both browsers. The normal public URL
still uses the same-device fallback because no internet backend has been
provisioned or deployed.

Build r14 gives **Crownfall Range** a stronger authored silhouette and surface
hierarchy. Two connected summit masses and a broad Stormscar shoulder replace
the single smooth mound, while slope-aware wet basalt, heath, lichen, exposed
rock, and summit frost replace the old altitude bands. Two small generated
normal/roughness maps add close surface breakup without external textures or
extra terrain draw calls. The first high-frequency material candidate was
rejected for visible moire; the retained calmer pass is still stylized
prototype terrain, not Fortnite-level environment art.

Build r15 replaces the flat four-button mode list with the **Wake Perch Flight
Operations** deck. Story Campaign and Stormscar Duel are now the two primary
promises; Practice Cove and Checkpoints are visibly secondary utilities. The
selected route shows its objective and transport contract before launch. On the
current public static build, Duel says `LOCAL RIVAL LINK · TWO TABS · SAME
DEVICE` instead of implying internet matchmaking.

The same deck is ready for an author-pinned server endpoint. A release operator
can build a server-backed artifact without accepting an endpoint from a shared
URL:

```sh
GALEVEIN_DUEL_SERVER_URL=wss://your-reviewed-host.example/match npm run build
```

Only credential-free `wss://` URLs are accepted. The checked-in and currently
published build deliberately leaves this setting empty.

Build r16 replaces the old circular cone-and-billboard horizon with the
**Bounded Reach Basin**. Three deterministic mountain depth layers now frame a
forward valley corridor, 220 instanced conifers form forest belts, and six
volumetric sky monoliths preserve Galevein's floating-rock identity. Crownfall
v3 raises the close terrain mesh to 16,956 visible triangles, keeps its 65.1-unit
Story-route clearance, adds ridged coastal erosion, 128 shoreline talus rocks,
and 141 ledge trees. Poseidon's WebGPU sky and ocean now share a piecewise
daylight to gold-dusk to moonlit-night palette so the reflection changes with
the world rather than merely darkening. This is a substantial authored-world
pass, but the code-generated vegetation and architecture are still stylized;
it is not photographic final art.

Build r17 replaces the modern red-white lighthouse kit and broad opaque
searchlight cones with **Keeper wind shrines**: fractured basalt tripods,
weathered-bronze wind crowns, cold cores, and thin segmented shear ribbons that
move with the shared wind field. The main route markers are now incomplete
storm-vane arcs with lower opacity instead of bright complete hoops. Detection,
cover, shrine health, plasma destruction, Story routing, and multiplayer combat
authority are unchanged. This improves cultural coherence and flight
readability; it does not make the procedural architecture photorealistic.

Build r18 replaces Chapter IV's unrelated center rock pile with **Keeper
Hollow**, a deterministic coastal valley built around the three shrines. Eight
large eroded perimeter shoulders, 520 clustered ledge conifers, 112 talus
rocks, wet shore aprons, and broken surf collars now form one fog-backed basin
without changing the twelve-beacon route. The six original center collision
proxies are preserved exactly, new shoulders are route-checked, and the old
Serpent Canyon wall is visible only during its own chapter. The subsystem uses
five instanced draw calls and no external art. It improves spatial hierarchy
and forest density, but remains stylized procedural environment art rather
than photoreal terrain.

Build r19 turns that basin into **The Long Night route** instead of leaving it
as scenery beside the real objective path. Ten alternating cliff shoulders and
three shrine seats now follow beacons nine through eleven, with 69.4 units of
measured minimum route clearance and a stronger Chapter IV fog layer. Beacon
eleven is sealed until all three wind shrines have been destroyed with charged
plasma; the HUD reports the remaining shrines and then opens the final approach.
The release verifier fires six real projectiles through the production combat
path to prove the gate. This fixes an objective-placement bug and makes the
chapter feel like a bounded flight-and-combat valley, but its faceted procedural
geology is still stylized rather than photoreal.

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
- `Z`: Arc Scatter; `R`: Wingbreak Pulse (Stormscar 1v1)
- `C`: echo pulse; `F`: call the flock
- Hold/release `A` or `D`: spiral into Ultra speed
- Dive then pull up: Stormbreak Dive
- `Q` / `E`: look; `V`: chase/rider view
- `Tab`: Flight Codex; `B`: Forge; `M`: sound

## Prototype boundary

This is a free, non-commercial prototype under a working title. It uses an original locally generated Stormlance Galevein, procedural landmarks, synthesized project audio, a documented CC0 menu track, vendored Three.js, and an MIT-licensed Poseidon spectral-ocean adaptation. Stormlance v2 retains the 25-bone rig and Flap/Glide clips while adding a higher-density crescent membrane, broader torso and neck, split lightning crown, jaw keel, sensory barbs, and a clear rider-seat gap. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), [OCEAN_PROVENANCE.md](OCEAN_PROVENANCE.md), and [RELEASE_READINESS.md](RELEASE_READINESS.md).

## Flight harness

The development workspace includes a local preflight harness inspired by the supplied game-harness reference, adapted to this game rather than imported from it. It boots the exact static artifact in an isolated browser, verifies the one original creature and procedural world, checks Crownfall and Keeper Hollow scale, collision proxies, and protected-route clearance, proves that one deterministic wind field couples physics, weather, audio, and the WebGPU sky, proves the WebGPU ocean or fallback decision, exercises Story, Practice, and Chapter entry paths, fires real charged-plasma projectiles through the three-shrine Long Night gate, and asserts the escape, detection, and nightfall outcomes.

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

## Two-client duel harness

The duel verifier opens two independent Chrome tabs, proves one temporary host and one challenger, checks the Stormscar arena and three authority-validated attack classes, converged Stormheart score, combat death, and three-second respawn, then rejects external requests or browser errors:

```sh
npm run verify:duel
```

The default regression run skips CDP screenshot readback because background-tab
GPU capture can stall independently of duel state. Add `-- --capture true` for
faceoff/objective/downed images; the dedicated environment pass supplies the
three required release visuals.

To try it manually, open the same served game URL in two tabs and choose **Stormscar 1v1 Lab** in both. A public-origin proof can be run with `node scripts/duel-harness.mjs --url <game-url>`. Remote internet matchmaking remains a separate backend milestone.

## Server-authority proof

The source workspace includes a dependency-free Node match server. It binds to
loopback by default, requires a matching browser origin, and serves the exact
release artifact beside `/match`, `/health`, and aggregate `/metrics` routes.
Run the complete server plus two-browser proof with one command:

```sh
npm run build
npm run verify:network
```

The verifier requires two clients to join one match while neither claims
authority, exercises all three attack classes, completes a first-to-three
round, and proves death plus respawn. This is local multi-process proof, not a
deployed internet service or cross-device field test.
