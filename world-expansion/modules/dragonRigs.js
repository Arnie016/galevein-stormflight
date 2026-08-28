/**
 * Public-demo creature catalogue.
 *
 * This is intentionally a one-creature catalogue. The demo must not expose
 * retired prototype rigs through URLs, localStorage, or its picker. Sablewing
 * is an original Galevein silhouette remodel of Charlie catling's CC BY 4.0
 * "Wyvern animated" rig; attribution and change history ship with the build.
 */

export const DRAGON_RIGS = Object.freeze([
  {
    id: 'sablewing',
    asset: 'assets/galevein_sablewing.glb',
    loreName: 'Sablewing',
    epithet: 'Tempest-Bound Galevein',
    note: 'A black aerial predator with compacted head and tail, broadened storm wings, source facial rig, and a wind-reactive chest saddle.',
    geometryProfile: 'sablewing-original-remodel-v2',
    flapProfile: 'fab-authored-powerstroke-v1',
    brakeProfile: 'fab-authored-idle-brake-v1',
    aliveProfile: 'control-layered-flight-response-v3',
    surfaceProfile: 'sablewing-authored-hide-v1',
    materialProfile: 'sablewing-authored-hide-v1',
    eyeProfile: 'source-face-rig-v1',
    riderProfile: 'scaled-chest-anchor-v1',
    licenseProfile: 'CC-BY-4.0-remodel',
    attribution: 'Wyvern animated by Charlie catling, CC BY 4.0; modified for Galevein: Stormflight',
    scale: 0.47,
    flapClip: 'Flap',
    glideClip: 'Glide',
    brakeClip: 'Brake',
    default: true,
    originalIP: true,
    derivativeAsset: true
  }
]);

export function defaultRig() {
  return DRAGON_RIGS[0];
}

export function rigCatalog() {
  return DRAGON_RIGS;
}
