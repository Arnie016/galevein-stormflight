/**
 * Public-demo creature catalogue.
 *
 * This is intentionally a one-creature catalogue.  The demo must not expose
 * the old prototype's legacy rigs through URLs, localStorage, or its picker.
 * Stormlance is generated from the clean-room Blender source retained outside
 * this served artifact; its 25-bone contract preserves the existing flight,
 * rider, mouth-charge, and animation systems.
 */

export const DRAGON_RIGS = Object.freeze([
  {
    id: 'stormlance',
    asset: 'assets/galevein_stormlance.glb',
    loreName: 'Stormlance',
    epithet: 'Warden of the Sable Reach',
    note: 'A clean-room Galevein: power-body chest, crescent wings, deep keel, and a split storm-rudder tail.',
    geometryProfile: 'stormlance-flight-body-v4',
    flapProfile: 'aeroelastic-powerstroke-v2',
    brakeProfile: 'held-airbrake-v1',
    aliveProfile: 'inertial-flight-response-v2',
    scale: 10.0,
    flapClip: 'Flap',
    glideClip: 'Glide',
    brakeClip: 'Brake',
    default: true,
    original: true
  }
]);

export function defaultRig() {
  return DRAGON_RIGS[0];
}

export function rigCatalog() {
  return DRAGON_RIGS;
}
