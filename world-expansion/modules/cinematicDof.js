// Integration: import after renderer creation; construct with (renderer, scene, camera), call setFocusWorld(D.group.position) and render() instead of renderer.render(scene, camera), then call setSize() from resize.
import * as THREE from 'three';

const VERTEX = `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const FRAGMENT = `#include <packing>
uniform sampler2D uColor; uniform sampler2D uDepth; uniform float uNear; uniform float uFar;
uniform float uFocus; uniform float uRange; uniform float uMaxBlur; uniform vec2 uTexel;
varying vec2 vUv;
float linearDepth(float z){float ndc=z*2.0-1.0;return (2.0*uNear*uFar)/(uFar+uNear-ndc*(uFar-uNear));}
void main(){
  float d=linearDepth(unpackRGBAToDepth(texture2D(uDepth,vUv)));
  float blur=clamp(abs(d-uFocus)/max(uRange,.001),0.,1.)*uMaxBlur;
  vec2 r=uTexel*blur;
  vec4 c=texture2D(uColor,vUv)*.20;
  c+=texture2D(uColor,vUv+vec2(r.x,0.))*.12;
  c+=texture2D(uColor,vUv-vec2(r.x,0.))*.12;
  c+=texture2D(uColor,vUv+vec2(0.,r.y))*.12;
  c+=texture2D(uColor,vUv-vec2(0.,r.y))*.12;
  c+=texture2D(uColor,vUv+r*.707)*.08;
  c+=texture2D(uColor,vUv-r*.707)*.08;
  c+=texture2D(uColor,vUv+vec2(r.x,-r.y)*.707)*.08;
  c+=texture2D(uColor,vUv+vec2(-r.x,r.y)*.707)*.08;
  gl_FragColor=c;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class CinematicDofPipeline {
  constructor(renderer, scene, camera, options = {}) {
    if (!renderer?.render || !scene?.isScene || !camera?.isCamera) throw new TypeError('CinematicDofPipeline requires renderer, scene, and camera.');
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.enabled = options.enabled ?? true;
    this.focusDistance = options.focusDistance ?? 34;
    this.focusRange = options.focusRange ?? 28;
    this.maxBlur = options.maxBlur ?? 2.25;
    this.focusPoint = new THREE.Vector3();
    this.colorTarget = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true });
    this.depthTarget = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true });
    this.depthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, blending: THREE.NoBlending });
    this.quadScene = new THREE.Scene();
    this.quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: this.colorTarget.texture }, uDepth: { value: this.depthTarget.texture },
        uNear: { value: camera.near }, uFar: { value: camera.far }, uFocus: { value: this.focusDistance },
        uRange: { value: this.focusRange }, uMaxBlur: { value: this.maxBlur }, uTexel: { value: new THREE.Vector2(1, 1) }
      },
      vertexShader: VERTEX, fragmentShader: FRAGMENT, depthTest: false, depthWrite: false
    });
    this.quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material));
    this.setSize(renderer.domElement.width || 1, renderer.domElement.height || 1);
  }

  setFocusWorld(point) {
    if (!point?.isVector3) return this.focusDistance;
    this.focusPoint.copy(point);
    this.focusDistance = THREE.MathUtils.clamp(this.camera.position.distanceTo(point), this.camera.near + 1, this.camera.far - 1);
    return this.focusDistance;
  }

  setSize(width, height) {
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    this.colorTarget.setSize(w, h);
    this.depthTarget.setSize(w, h);
    this.material.uniforms.uTexel.value.set(1 / w, 1 / h);
  }

  render() {
    if (!this.enabled) return this.renderer.render(this.scene, this.camera);
    const renderer = this.renderer;
    const previousTarget = renderer.getRenderTarget();
    const previousOverride = this.scene.overrideMaterial;
    renderer.setRenderTarget(this.colorTarget);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    this.scene.overrideMaterial = this.depthMaterial;
    renderer.setRenderTarget(this.depthTarget);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    this.scene.overrideMaterial = previousOverride;
    this.material.uniforms.uNear.value = this.camera.near;
    this.material.uniforms.uFar.value = this.camera.far;
    this.material.uniforms.uFocus.value = this.focusDistance;
    this.material.uniforms.uRange.value = this.focusRange;
    this.material.uniforms.uMaxBlur.value = this.maxBlur;
    renderer.setRenderTarget(previousTarget);
    renderer.render(this.quadScene, this.quadCamera);
  }

  dispose() {
    this.colorTarget.dispose();
    this.depthTarget.dispose();
    this.depthMaterial.dispose();
    this.material.dispose();
    this.quadScene.children[0]?.geometry.dispose();
  }
}
