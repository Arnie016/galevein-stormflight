const TAU = Math.PI * 2;

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const smoothstep = (a, b, value) => {
  const t = clamp((value - a) / Math.max(1e-9, b - a));
  return t * t * (3 - 2 * t);
};
const hash = (value) => {
  let n = value >>> 0;
  n = Math.imul(n ^ (n >>> 16), 0x21f0aaad);
  n = Math.imul(n ^ (n >>> 15), 0x735a2d97);
  return ((n ^ (n >>> 15)) >>> 0) / 4294967296;
};

/**
 * One deterministic wind authority for flight forces, weather VFX and the
 * WebGPU atmosphere. The 45 degree prevailing direction is the same direction
 * used to build Poseidon's local wind-sea spectrum.
 */
export class GaleveinWindField {
  constructor({ seed = 0x5ab1e5, baseHeading = Math.PI / 4, baseSpeed = 10.5 } = {}) {
    this.seed = seed >>> 0;
    this.baseHeading = baseHeading;
    this.baseSpeed = baseSpeed;
    this.profile = 'galevein-shared-wind-v1';
    this.cycleSeconds = 13.5;
  }

  sample(time = 0, position = [0, 0, 0]) {
    const t = Math.max(0, Number(time) || 0);
    const cycle = Math.floor(t / this.cycleSeconds);
    const phase = (t / this.cycleSeconds) - cycle;
    const seedA = hash(this.seed + Math.imul(cycle + 1, 0x9e3779b1));
    const seedB = hash(this.seed ^ Math.imul(cycle + 7, 0x85ebca6b));
    const rise = smoothstep(0.16, 0.25, phase);
    const fall = 1 - smoothstep(0.48, 0.72, phase);
    const gust = rise * fall * (0.72 + seedB * 0.28);
    const terrainCurl = Math.sin((position[0] || 0) * 0.0031 - (position[2] || 0) * 0.0023) * 0.055;
    const heading = this.baseHeading
      + Math.sin(t * 0.071) * 0.24
      + Math.sin(t * 0.019 + 1.7) * 0.11
      + (seedA - 0.5) * 0.72 * gust
      + terrainCurl;
    const speed = this.baseSpeed
      + Math.sin(t * 0.083 + 0.6) * 1.35
      + Math.sin(t * 0.031) * 0.75
      + gust * (7.0 + seedA * 3.0);
    const vertical = Math.sin(t * 0.23 + (position[0] || 0) * 0.004) * 0.055
      + Math.sin(t * 0.11 - (position[2] || 0) * 0.003) * 0.035
      + gust * Math.sin(t * 1.9 + seedB * TAU) * 0.16;
    const horizontal = Math.sqrt(Math.max(0, 1 - vertical * vertical));
    const direction = [Math.cos(heading) * horizontal, vertical, Math.sin(heading) * horizontal];
    return {
      profile: this.profile,
      time: t,
      cycle,
      phase,
      heading,
      headingDegrees: ((heading * 180 / Math.PI) % 360 + 360) % 360,
      speed,
      gust,
      direction,
      prevailingDegrees: this.baseHeading * 180 / Math.PI
    };
  }

  flightForces(sample, yaw = 0, { grazing = false } = {}) {
    const calm = grazing ? 0.24 : 1;
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);
    const crosswind = sample.direction[0] * rightX + sample.direction[2] * rightZ;
    const driftScale = (0.34 + sample.gust * 1.14) * calm;
    return {
      driftPerSecond: [
        sample.direction[0] * sample.speed * driftScale,
        sample.direction[1] * sample.speed * (0.42 + sample.gust * 0.9) * calm,
        sample.direction[2] * sample.speed * driftScale
      ],
      rollPerSecond: crosswind * (0.10 + sample.gust * 0.54) * calm,
      crosswind
    };
  }

  proof() {
    const position = [420, 62, -310];
    const first = this.sample(8.1, position);
    const repeat = this.sample(8.1, position);
    let strongest = this.sample(0, position);
    for (let t = 0; t <= this.cycleSeconds * 2; t += 0.1) {
      const candidate = this.sample(t, position);
      if (candidate.gust > strongest.gust) strongest = candidate;
    }
    const forces = this.flightForces(strongest, Math.PI, { grazing: false });
    return {
      profile: this.profile,
      deterministic: JSON.stringify(first) === JSON.stringify(repeat),
      prevailingDegrees: this.baseHeading * 180 / Math.PI,
      strongest: {
        time: +strongest.time.toFixed(2),
        gust: +strongest.gust.toFixed(3),
        speed: +strongest.speed.toFixed(2),
        headingDegrees: +strongest.headingDegrees.toFixed(2)
      },
      impulse: {
        driftPerSecond: forces.driftPerSecond.map((value) => +value.toFixed(3)),
        rollPerSecond: +forces.rollPerSecond.toFixed(3),
        crosswind: +forces.crosswind.toFixed(3)
      }
    };
  }
}
