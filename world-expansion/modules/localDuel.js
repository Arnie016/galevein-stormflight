/**
 * Same-origin two-client duel transport for the static Galevein demo.
 *
 * BroadcastChannel makes this a genuine two-browser-client exchange without
 * pretending that GitHub Pages is an internet matchmaking server. The lowest
 * peer id is the temporary match authority for objective score, damage, kills,
 * and round state. Closing either tab ends the match.
 */

const CHANNEL_NAME = 'galevein-local-duel-v1';
const OBJECTIVE = Object.freeze({ position: [900, 88, 900], radius: 32, holdSeconds: 3, scoreToWin: 3 });
const now = () => performance.now();

function makeId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function safeState(state = {}) {
  const position = Array.isArray(state.position) ? state.position.slice(0, 3).map(Number) : [0, 80, 0];
  return {
    position,
    yaw: Number(state.yaw) || 0,
    pitch: Number(state.pitch) || 0,
    roll: Number(state.roll) || 0,
    speed: Number(state.speed) || 0,
    hp: Math.max(0, Number(state.hp) || 0),
    dead: !!state.dead,
    insideObjective: !!state.insideObjective,
    sentAt: now()
  };
}

export class LocalDuelSession {
  constructor(options = {}) {
    this.channelName = options.channelName ?? CHANNEL_NAME;
    this.onDamage = options.onDamage ?? (() => {});
    this.onEvent = options.onEvent ?? (() => {});
    // A background browser tab can pause requestAnimationFrame while timers
    // continue. Pulling the live transform here prevents a heartbeat from
    // repeatedly rebroadcasting an old objective position.
    this.getState = typeof options.getState === 'function' ? options.getState : null;
    this.peerId = makeId();
    this.channel = null;
    this.status = 'idle';
    this.opponentId = null;
    this.role = null;
    this.local = safeState();
    this.remote = null;
    this.seq = 0;
    this.lastSend = 0;
    this.lastHello = 0;
    this.lastRemoteAt = 0;
    this.hold = 0;
    this.captureOwner = null;
    this.scores = {};
    this.kills = {};
    this.roundWinner = null;
    this.seenEvents = new Set();
    this.objective = OBJECTIVE;
  }

  join() {
    if (this.channel) return this.snapshot();
    if (!globalThis.BroadcastChannel) {
      this.status = 'unsupported';
      this.onEvent({ type: 'unsupported' });
      return this.snapshot();
    }
    this.channel = new BroadcastChannel(this.channelName);
    this.channel.onmessage = (event) => this._receive(event.data);
    this.status = 'searching';
    this._post({ type: 'HELLO' });
    this.lastHello = now();
    // Networking cannot depend on requestAnimationFrame: browsers pause the
    // hidden tab, but a two-tab duel necessarily leaves one client hidden.
    this.heartbeat = setInterval(() => {
      if (!this.channel) return;
      if (this.status === 'searching') this._post({ type: 'HELLO' });
      else if (this.status === 'matched') {
        this.local = safeState(this.getState?.() ?? this.local);
        this._post({ type: 'STATE', target: this.opponentId, state: this.local });
      }
    }, 500);
    return this.snapshot();
  }

  leave() {
    if (this.channel) this._post({ type: 'LEAVE', target: this.opponentId });
    clearInterval(this.heartbeat); this.heartbeat = null;
    try { this.channel?.close(); } catch {}
    this.channel = null;
    this.status = 'idle';
    this.opponentId = null;
    this.role = null;
    this.remote = null;
    this.roundWinner = null;
    this.hold = 0;
    this.captureOwner = null;
  }

  _post(message) {
    if (!this.channel) return;
    this.channel.postMessage({ ...message, from: this.peerId, seq: ++this.seq, at: now() });
  }

  _pair(peerId) {
    if (!peerId || peerId === this.peerId) return;
    if (this.opponentId && this.opponentId !== peerId) return;
    this.opponentId = peerId;
    this.role = this.peerId.localeCompare(peerId) < 0 ? 'host' : 'challenger';
    this.status = 'matched';
    this.scores[this.peerId] ??= 0;
    this.scores[peerId] ??= 0;
    this.kills[this.peerId] ??= 0;
    this.kills[peerId] ??= 0;
    this.onEvent({ type: 'matched', role: this.role, opponentId: peerId });
  }

  _receive(message) {
    if (!message || message.from === this.peerId) return;
    if (message.target && message.target !== this.peerId) return;
    if (message.type === 'HELLO') {
      this._pair(message.from);
      this._post({ type: 'ACCEPT', target: message.from });
      return;
    }
    if (message.type === 'ACCEPT') {
      this._pair(message.from);
      return;
    }
    if (message.type === 'LEAVE' && message.from === this.opponentId) {
      this.status = 'searching';
      this.opponentId = null;
      this.role = null;
      this.remote = null;
      this.onEvent({ type: 'left' });
      return;
    }
    if (message.from !== this.opponentId) return;
    if (message.type === 'STATE') {
      this.remote = safeState(message.state);
      this.lastRemoteAt = now();
      return;
    }
    if (message.type === 'ATTACK' && this.role === 'host') {
      this._authorizeAttack(message);
      return;
    }
    if (message.type === 'DAMAGE') {
      if (this.seenEvents.has(message.eventId)) return;
      this.seenEvents.add(message.eventId);
      if (message.target === this.peerId) this.onDamage({ damage: message.damage, source: message.source, eventId: message.eventId });
      return;
    }
    if (message.type === 'DEATH' && this.role === 'host') {
      this._awardKill(message.killer, message.from);
      return;
    }
    if (message.type === 'MATCH') this._applyMatch(message.match);
  }

  _authorizeAttack(message) {
    const eventId = String(message.eventId || '');
    if (!eventId || this.seenEvents.has(eventId) || message.target !== this.opponentId && message.target !== this.peerId) return;
    this.seenEvents.add(eventId);
    const damage = Math.min(60, Math.max(6, Number(message.damage) || 0));
    const packet = { type: 'DAMAGE', eventId, target: message.target, source: message.from, damage };
    this._post(packet);
    if (packet.target === this.peerId) this.onDamage(packet);
  }

  reportHit(damage) {
    if (this.status !== 'matched' || !this.opponentId || this.roundWinner) return false;
    const eventId = `${this.peerId}:${Date.now().toString(36)}:${this.seq + 1}`;
    const message = { type: 'ATTACK', eventId, target: this.opponentId, damage: Math.min(60, Math.max(6, Number(damage) || 0)) };
    if (this.role === 'host') this._authorizeAttack({ ...message, from: this.peerId });
    else this._post(message);
    return true;
  }

  notifyDeath(killer) {
    if (this.status !== 'matched') return;
    if (this.role === 'host') this._awardKill(killer, this.peerId);
    else this._post({ type: 'DEATH', killer, target: this.opponentId });
  }

  _awardKill(killer, victim) {
    if (this.role !== 'host' || !killer || killer === victim) return;
    this.kills[killer] = (this.kills[killer] || 0) + 1;
    this._broadcastMatch();
  }

  _broadcastMatch() {
    const match = {
      scores: { ...this.scores }, kills: { ...this.kills }, hold: this.hold,
      captureOwner: this.captureOwner, roundWinner: this.roundWinner
    };
    this._applyMatch(match);
    this._post({ type: 'MATCH', match });
  }

  _applyMatch(match = {}) {
    this.scores = { ...(match.scores || {}) };
    this.kills = { ...(match.kills || {}) };
    this.hold = Number(match.hold) || 0;
    this.captureOwner = match.captureOwner || null;
    this.roundWinner = match.roundWinner || null;
  }

  _hostObjectiveTick(dt) {
    if (this.role !== 'host' || !this.remote || this.roundWinner) return;
    const occupants = [];
    if (!this.local.dead && this.local.insideObjective) occupants.push(this.peerId);
    if (!this.remote.dead && this.remote.insideObjective) occupants.push(this.opponentId);
    const owner = occupants.length === 1 ? occupants[0] : null;
    if (owner !== this.captureOwner) {
      this.captureOwner = owner;
      this.hold = 0;
      this._broadcastMatch();
    }
    if (!owner) return;
    this.hold += dt;
    if (this.hold >= this.objective.holdSeconds) {
      this.scores[owner] = (this.scores[owner] || 0) + 1;
      this.hold = 0;
      this.captureOwner = null;
      if (this.scores[owner] >= this.objective.scoreToWin) this.roundWinner = owner;
      this._broadcastMatch();
      this.onEvent({ type: 'capture', owner, score: this.scores[owner], winner: this.roundWinner });
    }
  }

  update(dt, state) {
    this.local = safeState(state);
    if (!this.channel) return this.snapshot();
    const t = now();
    if (this.status === 'searching' && t - this.lastHello > 500) {
      this._post({ type: 'HELLO' });
      this.lastHello = t;
    }
    if (this.status === 'matched' && t - this.lastSend > 80) {
      this._post({ type: 'STATE', target: this.opponentId, state: this.local });
      this.lastSend = t;
    }
    // A hidden tab can miss several animation frames even when browser timer
    // throttling is disabled. Eight seconds keeps an actual closed tab honest
    // without making normal tab switching look like a disconnect.
    if (this.status === 'matched' && this.lastRemoteAt && t - this.lastRemoteAt > 8000) {
      this.status = 'searching';
      this.opponentId = null;
      this.role = null;
      this.remote = null;
      this.onEvent({ type: 'timeout' });
    }
    this._hostObjectiveTick(Math.min(dt, 0.05));
    return this.snapshot();
  }

  snapshot() {
    const localScore = this.scores[this.peerId] || 0;
    const remoteScore = this.opponentId ? this.scores[this.opponentId] || 0 : 0;
    return {
      transport: 'BroadcastChannel', scope: 'same-origin same-device', authoritative: this.role === 'host',
      peerId: this.peerId, opponentId: this.opponentId, status: this.status, role: this.role,
      matched: this.status === 'matched', remote: this.remote ? { ...this.remote, position: this.remote.position.slice() } : null,
      localScore, remoteScore,
      localKills: this.kills[this.peerId] || 0,
      remoteKills: this.opponentId ? this.kills[this.opponentId] || 0 : 0,
      hold: +this.hold.toFixed(2), captureOwner: this.captureOwner,
      roundWinner: this.roundWinner,
      objective: { ...this.objective, position: this.objective.position.slice() }
    };
  }
}

export default LocalDuelSession;
