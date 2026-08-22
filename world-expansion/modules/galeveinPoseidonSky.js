/**
 * Project-owned procedural sky used by the Poseidon water shader. It replaces
 * Poseidon's panorama sampler so Galevein can preserve its storm-dusk identity
 * without distributing or requesting any panorama asset.
 */
import { BackSide, Mesh, MeshBasicNodeMaterial, SphereGeometry } from 'three/webgpu';
import {
  Fn, cameraPosition, dot, float, max, mix, mx_fractal_noise_float, normalize,
  positionWorld, pow, sin, smoothstep, vec2, vec3
} from 'three/tsl';

export function skyColor(direction, shading) {
  const dir = normalize(direction);
  const height = smoothstep(float(-0.08), float(0.78), dir.y);
  const base = mix(shading.horizon, shading.zenith, height).toVar();
  // The atmospheric cloud field is evaluated on the GPU and advected by the
  // same wind vector that moves Galevein. skyColor is also used by the water
  // shader, so those moving cloud masses appear in the ocean reflection.
  const projection = vec2(dir.x, dir.z).div(max(dir.y.add(0.24), float(0.12)));
  const flow = shading.windDir.mul(shading.time.mul(float(0.022).add(shading.gust.mul(0.018))));
  const cloudUv = projection.mul(vec2(1.35, 0.72)).sub(flow);
  const cloudNoise = mx_fractal_noise_float(cloudUv, 3, 2.03, 0.53).toVar();
  const cloudBand = smoothstep(float(0.03), float(0.18), dir.y)
    .mul(float(1).sub(smoothstep(float(0.58), float(0.86), dir.y)));
  const cloudMask = smoothstep(float(0.36).sub(shading.gust.mul(0.08)), float(0.68), cloudNoise)
    .mul(cloudBand)
    .mul(float(0.34).add(shading.gust.mul(0.28)));
  const cloudWarm = mix(vec3(0.72, 0.43, 0.40), vec3(0.12, 0.16, 0.27), shading.day);
  base.assign(mix(base, cloudWarm, cloudMask));
  const auroraBand = pow(max(float(0), float(1).sub(dir.y.sub(0.31).mul(5.2).abs())), float(2))
    .mul(shading.day)
    .mul(float(0.12).add(shading.gust.mul(0.08)));
  const auroraWave = sin(dir.x.mul(7.0).add(dir.z.mul(4.0)).add(shading.time.mul(0.22))).mul(0.5).add(0.5);
  base.assign(base.add(mix(vec3(0.09, 0.34, 0.44), vec3(0.34, 0.10, 0.46), auroraWave).mul(auroraBand)));
  const sunFacing = max(dot(dir, shading.sunDir), float(0));
  const halo = pow(sunFacing, float(18)).mul(shading.sunColor).mul(0.22);
  const disc = pow(sunFacing, float(420)).mul(shading.sunColor).mul(3.4);
  const underglow = mix(vec3(0.035, 0.024, 0.065), base, smoothstep(float(-0.24), float(0.04), dir.y));
  return mix(underglow, base, smoothstep(float(-0.03), float(0.09), dir.y)).add(halo).add(disc);
}

export function createSkyDome(shading, radius = 45000) {
  const material = new MeshBasicNodeMaterial({ side: BackSide, depthWrite: false });
  material.fog = false;
  material.colorNode = Fn(() => skyColor(normalize(positionWorld.sub(cameraPosition)), shading))();
  const mesh = new Mesh(new SphereGeometry(radius, 48, 28), material);
  mesh.frustumCulled = false;
  return mesh;
}
