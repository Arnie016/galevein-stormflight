/**
 * Pre-flight lobby hub — select a route, review its contract, then launch.
 * The DOM console and lightweight 3D pillar markers keep the choice legible
 * without adding a second map scene or changing flight simulation code.
 */

import * as THREE from 'three';

export const LOBBY_MODES = Object.freeze({
  story: {
    id: 'story', label: 'Story Campaign', sub: 'Five chapters · 12 beacons · one escape',
    contract: 'Fly the beacon road · 12 beacons before nightfall', kind: 'campaign'
  },
  practice: {
    id: 'practice', label: 'Practice', sub: 'Wake Cove rings · no keeper hunt',
    contract: 'Fly the cove route · 3 rings · no keeper hunt', kind: 'utility'
  },
  duel: {
    id: 'duel', label: 'Stormscar Duel', sub: '1v1 · three attacks · first to three',
    contract: 'Fight above Stormscar Shelf · X precision · Z spread · R objective break', kind: 'versus'
  },
  chapter: {
    id: 'chapter', label: 'Chapter Select', sub: 'Jump to a saved chapter checkpoint',
    contract: 'Resume a marked chapter checkpoint', kind: 'utility'
  }
});

const CHAPTER_NAMES = ['First Flight', 'Home Waters', 'Serpent Run', 'The Long Night', 'Tempest Gate'];

/**
 * Authored Wake Perch lobby landmark.
 *
 * This is deliberately a place in the world, not three abstract mode-select pillars.
 * The basalt stack, bronze mooring deck and keeper lamps give the resting dragon a
 * readable home silhouette while all route selection remains in accessible DOM UI.
 */
export class LobbyMarkers {
  /**
   * @param {THREE.Scene} scene
   * @param {THREE.Vector3} anchor world position (dragon rest)
   */
  constructor(scene, anchor) {
    this.scene = scene;
    this.anchor = anchor;
    this.root = new THREE.Group();
    this.root.name = 'WakePerch';
    this.root.userData.visualOnly = true;
    this.root.userData.authoredScene = 'wake-perch-v1';

    this.basalt = new THREE.MeshStandardMaterial({
      color: 0x17212b, emissive: 0x07131a, emissiveIntensity: 0.12,
      roughness: 0.96, metalness: 0.02, flatShading: true
    });
    this.bronze = new THREE.MeshStandardMaterial({
      color: 0x70583d, emissive: 0x171006, emissiveIntensity: 0.08,
      roughness: 0.76, metalness: 0.22
    });
    this.lampMaterial = new THREE.MeshStandardMaterial({
      color: 0xffd6a0, emissive: 0xffb867, emissiveIntensity: 2.1,
      roughness: 0.42, metalness: 0.06
    });

    const stack = new THREE.Mesh(new THREE.CylinderGeometry(18, 28, 40, 12, 3), this.basalt);
    stack.name = 'WakePerch_BasaltStack';
    stack.position.y = -26;
    stack.scale.z = 0.82;
    this.root.add(stack);

    const crown = new THREE.Mesh(new THREE.CylinderGeometry(21, 18, 4.5, 12), this.basalt);
    crown.name = 'WakePerch_Crown';
    crown.position.y = -5;
    crown.scale.z = 0.82;
    this.root.add(crown);

    const deck = new THREE.Mesh(new THREE.BoxGeometry(28, 1.8, 12), this.bronze);
    deck.name = 'WakePerch_MooringDeck';
    deck.position.set(0, -2.2, 30);
    this.root.add(deck);

    const postGeo = new THREE.CylinderGeometry(0.7, 0.9, 9, 8);
    this.posts = new THREE.InstancedMesh(postGeo, this.bronze, 4);
    this.posts.name = 'WakePerch_LampPosts';
    this.root.add(this.posts);

    const lampGeo = new THREE.OctahedronGeometry(1.45, 0);
    this.lamps = new THREE.InstancedMesh(lampGeo, this.lampMaterial, 4);
    this.lamps.name = 'WakePerch_Lamps';
    this.root.add(this.lamps);

    this.offsets = [
      new THREE.Vector3(-14, 2.2, 20),
      new THREE.Vector3(14, 2.2, 20),
      new THREE.Vector3(-18, 2.2, -9),
      new THREE.Vector3(18, 2.2, -9)
    ];
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
    for (let i = 0; i < this.offsets.length; i++) {
      this.position.copy(this.offsets[i]);
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.posts.setMatrixAt(i, this.matrix);
      this.position.y += 5.8;
      this.scale.setScalar(1 + 0.035 * Math.sin(t * 1.15 + i * 0.7));
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.lamps.setMatrixAt(i, this.matrix);
      this.scale.setScalar(1);
    }
    this.posts.instanceMatrix.needsUpdate = true;
    this.lamps.instanceMatrix.needsUpdate = true;
    this.lampMaterial.emissiveIntensity = 2.0 + 0.16 * Math.sin(t * 1.15);
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
    return {
      visible: this._visible,
      scene: 'wake-perch-v1',
      authored: true,
      deterministic: true,
      drawCalls: 5,
      lamps: 4,
      anchor: this.root.position.toArray().map((value) => +value.toFixed(1)),
      palette: ['basalt', 'weathered-bronze', 'warm-keeper-lamp']
    };
  }
}

export class LobbyHub {
  constructor(options = {}) {
    this.root = options.rootEl ?? null;
    this.onSelect = options.onSelect ?? (() => {});
    this.onReturn = options.onReturn ?? (() => {});
    this.markers = options.markers ?? null;
    this.duelTransport = options.duelTransport === 'server' ? 'server' : 'local';
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
    this.select('story');
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
    const statusLabel = this.root.querySelector('[data-lobby-status-label]');
    const statusValue = this.root.querySelector('[data-lobby-status-value]');
    const statusNote = this.root.querySelector('[data-lobby-status-note]');
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
      launch.textContent = selected?.mode === 'story'
        ? 'LAUNCH STORY FLIGHT'
        : (selected?.mode === 'duel' ? (this.duelTransport === 'server' ? 'FIND ONLINE RIVAL' : 'CREATE LOCAL 1V1')
        : (selected ? 'FLY THIS ROUTE' : 'CHOOSE A ROUTE'));
    }
    const status = selected?.mode === 'duel'
      ? (this.duelTransport === 'server'
        ? ['ONLINE MATCHMAKING', 'SERVER AUTHORITY · FIFO 1V1', 'The match server owns damage, captures, victory, and respawn.']
        : ['LOCAL RIVAL LINK', 'TWO TABS · SAME DEVICE', 'This public build has no internet match server attached yet.'])
      : selected?.mode === 'story'
        ? ['SOLO CAMPAIGN', 'FIVE CHAPTERS · 12 BEACONS', 'One authored route from Wake Perch to the Tempest Gate.']
        : selected?.mode === 'practice'
          ? ['TRAINING FLIGHT', 'THREE COVE RINGS · NO PURSUIT', 'Learn weight, climb, dive, and banking before the campaign.']
          : ['CHECKPOINT ROUTE', `CHAPTER ${selected?.chapterIndex ?? 0} READY`, 'Resume an authored story checkpoint.'];
    if (statusLabel) statusLabel.textContent = status[0];
    if (statusValue) statusValue.textContent = status[1];
    if (statusNote) statusNote.textContent = status[2];
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
      profile: 'wake-perch-operations-v2',
      mode: this.mode,
      selection: this.selection ? { ...this.selection } : null,
      chapterPick: this.chapterPick,
      duelTransport: this.duelTransport,
      primaryModes: ['story', 'duel'],
      utilityModes: ['practice', 'chapter'],
      visible: this.root ? !this.root.classList.contains('hide') : false,
      markers: this.markers?.snapshot?.() ?? null
    };
  }
}

export default LobbyHub;
