/**
 * Project-owned procedural sky used by the Poseidon water shader. It replaces
 * Poseidon's panorama sampler so Galevein can preserve its storm-dusk identity
 * without distributing or requesting any panorama asset.
 */
import { BackSide, Mesh, MeshBasicNodeMaterial, SphereGeometry } from 'three/webgpu';
import {
  Fn, cameraPosition, dot, float, max, mix, normalize, positionWorld, pow,
  smoothstep, vec3
} from 'three/tsl';

export function skyColor(direction, shading) {
  const dir = normalize(direction);
  const height = smoothstep(float(-0.08), float(0.78), dir.y);
  const base = mix(shading.horizon, shading.zenith, height);
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
