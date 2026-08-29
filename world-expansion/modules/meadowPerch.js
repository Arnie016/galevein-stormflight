import * as THREE from 'three';

const PROFILE = Object.freeze({
  id: 'wake-meadow-perch-v1',
  placement: 'fixed-authored-cove-landform-v1',
  grounding: 'rock-base-grass-cap-root-embedded-v1',
  landing: 'hold-brake-proximity-v1',
  flora: 'deterministic-meadow-clusters-v1'
});

const PATCHES = Object.freeze([
  [-15, -7, 7, .08], [10, -10, 6, -.15], [-5, 12, 8, .18], [17, 7, 5, -.24]
]);
const FLOWERS = Object.freeze([
  [-18, -3, 0xffc98a], [-14, 10, 0xb8e7df], [-7, -12, 0xe8c5ff], [2, 14, 0xffd4a3],
  [8, -14, 0x9fe7d0], [14, 10, 0xe7d4ff], [19, -2, 0xffc98a], [-2, -18, 0xb8e7df]
]);

function irregularPatch(radius, seed) {
  const shape = new THREE.Shape();
  const points = [];
  for (let index = 0; index < 15; index += 1) {
    const angle = index / 15 * Math.PI * 2;
    const edge = radius * (1 + Math.sin(angle * 3 + seed) * .09 + Math.cos(angle * 5 - seed) * .055);
    points.push(new THREE.Vector2(Math.cos(angle) * edge, Math.sin(angle) * edge * .72));
  }
  shape.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index += 1) shape.lineTo(points[index].x, points[index].y);
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

function softPointTexture() {
  const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 32;
  const context = canvas.getContext('2d');
  const glow = context.createRadialGradient(16, 16, 1, 16, 16, 15);
  glow.addColorStop(0, 'rgba(240,255,224,1)'); glow.addColorStop(.34, 'rgba(196,255,216,.72)');
  glow.addColorStop(1, 'rgba(196,255,216,0)'); context.fillStyle = glow; context.fillRect(0, 0, 32, 32);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}

export class MeadowPerch {
  constructor(scene, { position = [650, 0, 430] } = {}) {
    this.root = new THREE.Group();
    this.root.name = 'WakeMeadow_Perch';
    this.root.position.fromArray(position);
    scene.add(this.root);

    const rock = new THREE.MeshStandardMaterial({
      color: 0x2a3033, roughness: .82, metalness: .06, flatShading: true
    });
    const wetRock = new THREE.MeshStandardMaterial({
      color: 0x171d20, roughness: .45, metalness: .12, flatShading: true
    });
    const grass = new THREE.MeshStandardMaterial({
      color: 0x345846, roughness: .96, metalness: 0, flatShading: true
    });
    const meadow = new THREE.MeshStandardMaterial({
      color: 0x41624e, roughness: .98, metalness: 0, flatShading: true
    });
    const bark = new THREE.MeshStandardMaterial({ color: 0x3a3028, roughness: 1, flatShading: true });
    const needle = new THREE.MeshStandardMaterial({ color: 0x183c32, roughness: .94, flatShading: true });

    const apron = new THREE.Mesh(new THREE.CylinderGeometry(42, 47, 8, 14), wetRock);
    apron.position.y = 4; apron.scale.z = .84; apron.receiveShadow = true; this.root.add(apron);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(34, 43, 20, 14), rock);
    base.position.y = 14; base.scale.z = .84; base.castShadow = true; base.receiveShadow = true; this.root.add(base);
    const buttressGeometry = new THREE.DodecahedronGeometry(8, 1);
    for (let index = 0; index < 6; index += 1) {
      const angle = index / 6 * Math.PI * 2 + .18;
      const buttress = new THREE.Mesh(buttressGeometry, index % 2 ? rock : wetRock);
      buttress.position.set(Math.cos(angle) * 34, 13 + (index % 3), Math.sin(angle) * 28);
      buttress.scale.set(1.25, 1.7 + (index % 2) * .25, .9); buttress.rotation.set(.1, -angle, .08);
      buttress.castShadow = true; buttress.receiveShadow = true; this.root.add(buttress);
    }
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(32, 35, 2.6, 18), grass);
    cap.position.y = 25.3; cap.scale.z = .84; cap.receiveShadow = true; this.root.add(cap);

    for (const [x, z, radius, yaw] of PATCHES) {
      const patch = new THREE.Mesh(irregularPatch(radius, yaw * 11 + x * .03), meadow);
      patch.rotation.x = -Math.PI / 2; patch.rotation.z = yaw;
      patch.position.set(x, 26.65, z); patch.receiveShadow = true; this.root.add(patch);
    }

    // One wind-bent pine makes the perch legible from the air. Its trunk enters
    // the grass cap, so it never reads as a floating prop.
    const tree = new THREE.Group(); tree.name = 'WakeMeadow_RootedPine'; tree.position.set(17, 26, 13);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.8, 1.25, 12, 7), bark);
    trunk.position.y = 5.2; trunk.rotation.z = -.08; trunk.castShadow = true; tree.add(trunk);
    for (let tier = 0; tier < 3; tier += 1) {
      const crown = new THREE.Mesh(new THREE.ConeGeometry(6.8 - tier * 1.2, 10, 8, 2), needle);
      crown.position.set(-tier * .35, 8.4 + tier * 4.1, 0); crown.rotation.z = -.12; crown.castShadow = true; tree.add(crown);
    }
    this.root.add(tree);

    const flowerGeo = new THREE.SphereGeometry(.42, 7, 5);
    for (const [x, z, color] of FLOWERS) {
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(.06, .08, 1.25, 5), needle);
      stem.position.set(x, 27.05, z); this.root.add(stem);
      const bloom = new THREE.Mesh(flowerGeo, new THREE.MeshStandardMaterial({
        color, emissive: color, emissiveIntensity: .24, roughness: .72
      }));
      bloom.position.set(x, 27.76, z); bloom.castShadow = true; this.root.add(bloom);
    }

    const pebbleGeo = new THREE.DodecahedronGeometry(1, 0);
    for (const [x, z, scale] of [[-22, 8, 2.2], [20, -9, 1.8], [-9, -20, 1.35]]) {
      const pebble = new THREE.Mesh(pebbleGeo, rock);
      pebble.position.set(x, 27.1, z); pebble.scale.set(scale, scale * .7, scale * 1.15);
      pebble.rotation.set(.2, x * .07, -.12); pebble.castShadow = true; this.root.add(pebble);
    }

    const fireflyPosition = new Float32Array(FLOWERS.length * 3);
    FLOWERS.forEach(([x, z], index) => {
      fireflyPosition[index * 3] = x;
      fireflyPosition[index * 3 + 1] = 30 + (index % 3) * 1.1;
      fireflyPosition[index * 3 + 2] = z;
    });
    const fireflyGeometry = new THREE.BufferGeometry();
    fireflyGeometry.setAttribute('position', new THREE.BufferAttribute(fireflyPosition, 3));
    this.fireflies = new THREE.Points(fireflyGeometry, new THREE.PointsMaterial({
      color: 0xd6ffe6, size: 1.6, map: softPointTexture(), transparent: true, opacity: .16, alphaTest: .02,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: true
    }));
    this.root.add(this.fireflies);

    this.landingPoint = new THREE.Vector3(position[0], 34, position[2]);
    this.radius = 38;
  }

  update(time, dayAmount, resting = false) {
    const dusk = THREE.MathUtils.smoothstep(dayAmount, .28, .82);
    this.fireflies.material.opacity = .10 + dusk * .32 + (resting ? .18 : 0);
    const positions = this.fireflies.geometry.attributes.position;
    for (let index = 0; index < positions.count; index += 1) {
      positions.setY(index, 30 + (index % 3) * 1.1 + Math.sin(time * .75 + index * 1.83) * .7);
    }
    positions.needsUpdate = true;
  }

  getCollisionProxy() {
    return { x: this.root.position.x, z: this.root.position.z, radius: this.radius, top: 27 };
  }

  getSnapshot() {
    return {
      profile: PROFILE.id,
      placement: PROFILE.placement,
      grounding: PROFILE.grounding,
      flora: PROFILE.flora,
      landing: PROFILE.landing,
      position: this.root.position.toArray(),
      landingPoint: this.landingPoint.toArray(),
      radius: this.radius,
      flowerClusters: FLOWERS.length,
      rootedTrees: 1
    };
  }
}
