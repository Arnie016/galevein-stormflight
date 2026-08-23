// One project-owned atmosphere contract for the WebGL world and the Poseidon
// WebGPU sky/ocean. Values are deliberately slow and monotonic: threat may
// grade the weather, but never flickers the player's global exposure.
export const ATMOSPHERE_PROFILE = 'coastal-aerial-depth-v1';

export const ATMOSPHERE_STOPS = Object.freeze([
  Object.freeze({ at:0,    phase:'daylight', horizon:0x8faeb8, zenith:0x315d82, fog:0x8ba3ad, ambient:0x879ca0, sun:0xfff1d1, exposure:1.67, fogDensity:.00048, airHaze:1/4700, waterHaze:1/6100 }),
  Object.freeze({ at:.56,  phase:'dusk',     horizon:0xb27370, zenith:0x313858, fog:0x5a4e59, ambient:0x75666d, sun:0xffb77a, exposure:1.52, fogDensity:.00063, airHaze:1/3900, waterHaze:1/5300 }),
  Object.freeze({ at:1,    phase:'night',    horizon:0x172035, zenith:0x060b18, fog:0x111827, ambient:0x24334b, sun:0xa8c5ff, exposure:1.41, fogDensity:.00082, airHaze:1/3150, waterHaze:1/4500 })
]);

function clamp01(value) { return Math.max(0, Math.min(1, Number(value) || 0)); }
function smooth(value) { return value * value * (3 - 2 * value); }
function lerp(a, b, amount) { return a + (b - a) * amount; }
function segment(day) {
  const amount = clamp01(day);
  if (amount <= ATMOSPHERE_STOPS[1].at) {
    return [ATMOSPHERE_STOPS[0], ATMOSPHERE_STOPS[1], smooth(amount / ATMOSPHERE_STOPS[1].at)];
  }
  return [ATMOSPHERE_STOPS[1], ATMOSPHERE_STOPS[2], smooth((amount - ATMOSPHERE_STOPS[1].at) / (1 - ATMOSPHERE_STOPS[1].at))];
}

export function atmospherePhase(day) {
  const amount = clamp01(day);
  return amount < .40 ? 'daylight' : amount < .73 ? 'dusk' : 'night';
}

export function sampleAtmosphere(day, { threat = 0, valley = false } = {}) {
  const [a, b, amount] = segment(day);
  const danger = clamp01(threat);
  return {
    profile: ATMOSPHERE_PROFILE,
    phase: atmospherePhase(day),
    amount: clamp01(day),
    exposure: lerp(a.exposure, b.exposure, amount) - danger * .08,
    fogDensity: lerp(a.fogDensity, b.fogDensity, amount) + (valley ? .00012 : 0) + danger * .000035,
    airHaze: lerp(a.airHaze, b.airHaze, amount),
    waterHaze: lerp(a.waterHaze, b.waterHaze, amount)
  };
}

