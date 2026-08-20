/**
 * Pre-flight lobby hub — select a route, review its contract, then launch.
 * The DOM console and lightweight 3D pillar markers keep the choice legible
 * without adding a second map scene or changing flight simulation code.
 */

import * as THREE from 'three';

export const LOBBY_MODES = Object.freeze({
  story: {
    id: 'story', label: 'Story', sub: 'Full beacon road · 12 rings before nightfall',
    contract: 'Fly the beacon road · 12 beacons before nightfall'
  },
  practice: {
    id: 'practice', label: 'Practice', sub: 'Wake Cove rings · no keeper hunt',
    contract: 'Fly the cove route · 3 rings · no keeper hunt'
  },
  chapter: {
    id: 'chapter', label: 'Chapter Select', sub: 'Jump to a saved chapter checkpoint',
    contract: 'Resume a marked chapter checkpoint'
  }
});

const CHAPTER_NAMES = ['First Flight', 'Home Waters', 'Serpent Run', 'The Long Night', 'Tempest Gate'];

/** Three instanced pillars + platform disc — +2 draw calls, no per-frame alloc. */
export class LobbyMarkers {
  /**
   * @param {THREE.Scene} scene
   * @param {THREE.Vector3} anchor world position (dragon rest)
   */
  constructor(scene, anchor) {
    this.scene = scene;
    this.anchor = anchor;
    this.root = new THREE.Group();
    this.root.name = 'LobbyHubMarkers';
    this.root.userData.visualOnly = true;

    const platform = new THREE.Mesh(
      new THREE.CylinderGeometry(58, 62, 1.8, 24),
      new THREE.MeshStandardMaterial({
        color: 0x141c2c, emissive: 0x1e2840, emissiveIntensity: 0.35, roughness: 0.92, metalness: 0.08
      })
    );
    platform.position.y = -6;
    this.root.add(platform);

    const pillarGeo = new THREE.CylinderGeometry(2.8, 3.6, 24, 8);
    const pillarMat = new THREE.MeshStandardMaterial({
      color: 0x222a3c, emissive: 0x6a4cff, emissiveIntensity: 1.1, roughness: 0.75, metalness: 0.12
    });
    this.pillars = new THREE.InstancedMesh(pillarGeo, pillarMat, 3);
    this.pillars.name = 'LobbyPillars';
    this.root.add(this.pillars);

    this.capGeo = new THREE.CylinderGeometry(4.2, 3.2, 2.4, 8);
    this.capMat = new THREE.MeshStandardMaterial({
      color: 0x283048, emissive: 0x9a5cff, emissiveIntensity: 1.6, roughness: 0.6, metalness: 0.2
    });
    this.caps = [
      new THREE.Mesh(this.capGeo, this.capMat.clone()),
      new THREE.Mesh(this.capGeo, this.capMat.clone()),
      new THREE.Mesh(this.capGeo, this.capMat.clone())
    ];
    for (const cap of this.caps) this.root.add(cap);

    this.offsets = [
      new THREE.Vector3(-36, 10, 32),
      new THREE.Vector3(36, 10, 32),
      new THREE.Vector3(0, 10, -38)
    ];
    this.emissive = [0x9a5cff, 0x38e6d0, 0xffbe6a];
    this.matrix = new THREE.Matrix4();
    this.position = new THREE.Vector3();
    this.quaternion = new THREE.Quaternion();
    this.scale = new THREE.Vector3(1, 1, 1);
    this._visible = false;
    this.root.visible = false;
    scene.add(this.root);
    this._applyInstances(0);
  }

  _applyInstances(t) {
    for (let i = 0; i < 3; i++) {
      const bob = Math.sin(t * 1.4 + i * 2.1) * 1.2;
      this.position.copy(this.offsets[i]);
      this.position.y += bob;
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.pillars.setMatrixAt(i, this.matrix);
      this.caps[i].position.copy(this.offsets[i]);
      this.caps[i].position.y = 22 + bob;
      const pulse = 0.85 + 0.15 * Math.sin(t * 2.2 + i);
      this.caps[i].material.emissive.setHex(this.emissive[i]);
      this.caps[i].material.emissiveIntensity = 1.4 * pulse;
    }
    this.pillars.instanceMatrix.needsUpdate = true;
    const pillarPulse = 0.9 + 0.1 * Math.sin(t * 1.8);
    this.pillars.material.emissiveIntensity = 0.9 * pillarPulse;
  }

  setVisible(show) {
    this._visible = !!show;
    this.root.visible = this._visible;
  }

  syncAnchor(anchor) {
    if (anchor) this.root.position.copy(anchor);
  }

  update(t) {
    if (!this._visible) return;
    this._applyInstances(t);
  }

  snapshot() {
    return { visible: this._visible, drawCalls: 2, instances: 3 };
  }
}

export class LobbyHub {
  constructor(options = {}) {
    this.root = options.rootEl ?? null;
    this.onSelect = options.onSelect ?? (() => {});
    this.onReturn = options.onReturn ?? (() => {});
    this.markers = options.markers ?? null;
    this.mode = null;
    this.selection = null;
    this.chapterPick = 0;
    this._bound = false;
  }

  mount() {
    if (!this.root || this._bound) return;
    this._bound = true;
    this.root.querySelectorAll('[data-lobby-mode]').forEach((node) => {
      node.addEventListener('click', (e) => {
        e.stopPropagation();
        this.select(node.dataset.lobbyMode);
      });
    });
    const confirm = this.root.querySelector('[data-lobby-chapter-go]');
    if (confirm) {
      confirm.addEventListener('click', (e) => {
        e.stopPropagation();
        const pick = Number(this.root.querySelector('[data-lobby-chapter-pick]')?.value ?? 0);
        this.chapterPick = pick;
        this.select('chapter', { chapterIndex: pick });
      });
    }
    const back = this.root.querySelector('[data-lobby-chapter-back]');
    if (back) back.addEventListener('click', (e) => { e.stopPropagation(); this._toggleChapterPanel(false); });
    const launch = this.root.querySelector('[data-lobby-launch]');
    if (launch) launch.addEventListener('click', (e) => { e.stopPropagation(); this.launch(); });
    this._renderSelection();
  }

  _toggleChapterPanel(show) {
    const panel = this.root?.querySelector('[data-lobby-chapter-panel]');
    if (panel) panel.classList.toggle('on', !!show);
  }

  select(mode, extra = {}) {
    if (!LOBBY_MODES[mode]) return false;
    if (mode === 'chapter' && extra.chapterIndex == null) {
      this._toggleChapterPanel(true);
      return false;
    }
    this.mode = mode;
    this.selection = { mode, ...(mode === 'chapter' ? { chapterIndex: Number(extra.chapterIndex) } : {}) };
    this._toggleChapterPanel(false);
    this._renderSelection();
    return true;
  }

  launch() {
    if (!this.selection) return false;
    this.markers?.setVisible(false);
    this.onSelect(this.selection.mode, this.selection);
    return true;
  }

  _renderSelection() {
    if (!this.root) return;
    const selected = this.selection;
    this.root.querySelectorAll('[data-lobby-mode]').forEach((node) => {
      const on = node.dataset.lobbyMode === selected?.mode;
      node.classList.toggle('on', on);
      node.setAttribute('aria-pressed', String(on));
    });
    const world = this.root.querySelector('[data-lobby-world]');
    const contract = this.root.querySelector('[data-lobby-contract]');
    const launch = this.root.querySelector('[data-lobby-launch]');
    const definition = selected ? LOBBY_MODES[selected.mode] : null;
    if (world) {
      world.textContent = selected?.mode === 'chapter'
        ? `Chapter · ${CHAPTER_NAMES[selected.chapterIndex] ?? 'First Flight'}`
        : (definition?.label ?? 'Select a route');
    }
    if (contract) {
      contract.textContent = selected?.mode === 'chapter'
        ? `Resume ${CHAPTER_NAMES[selected.chapterIndex] ?? 'First Flight'} · checkpoint ready`
        : (definition?.contract ?? 'Choose a route to prepare the flight contract');
    }
    if (launch) {
      launch.disabled = !selected;
      launch.textContent = selected ? 'FLY THIS JOURNEY' : 'CHOOSE A ROUTE';
    }
  }

  show() {
    if (this.root) {
      this.root.classList.add('on');
      this.root.classList.remove('hide');
      this._toggleChapterPanel(false);
    }
    this.markers?.setVisible(true);
  }

  hide() {
    if (this.root) this.root.classList.add('hide');
    this.markers?.setVisible(false);
  }

  returnToHub(reason = '') {
    this.mode = null;
    this.selection = null;
    this.show();
    this._renderSelection();
    this.onReturn(reason);
  }

  snapshot() {
    return {
      mode: this.mode,
      selection: this.selection ? { ...this.selection } : null,
      chapterPick: this.chapterPick,
      visible: this.root ? !this.root.classList.contains('hide') : false,
      markers: this.markers?.snapshot?.() ?? null
    };
  }
}

export default LobbyHub;
