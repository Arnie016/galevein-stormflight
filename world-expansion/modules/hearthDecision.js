/**
 * Deterministic social-choice contract for the Drowned Hearth encounter.
 *
 * The state machine owns trigger and resolution authority. Rendering, audio,
 * rewards, and HUD effects are callback concerns in index.html, so a visual
 * effect cannot silently resolve or rewrite the player's choice.
 */

export const DROWNED_HEARTH_CONTRACT = Object.freeze({
  profile: 'drowned-hearth-choice-v1',
  anchor: [521, 10.2, -437],
  triggerChapter: 2,
  triggerScore: 6,
  triggerRadius: 118,
  abandonRadius: 190,
  prompt: 'One hearth answers your echo. Survivor, or Keeper bait?',
  choices: Object.freeze({
    answer: Object.freeze({
      id: 'answer',
      key: '1',
      label: 'ANSWER THE HEARTH',
      promise: 'Reveal your line · gain a guide',
      consequence: Object.freeze({
        detectionDelta: 0.18,
        dayDelta: 0.035,
        plasmaSet: 3,
        trustDelta: 1,
        guideBeacons: 2,
        graceSeconds: 0
      })
    }),
    silent: Object.freeze({
      id: 'silent',
      key: '2',
      label: 'PASS IN SHADOW',
      promise: 'Preserve stealth · leave the signal',
      consequence: Object.freeze({
        detectionDelta: -0.18,
        dayDelta: 0,
        plasmaSet: null,
        trustDelta: 0,
        guideBeacons: 0,
        graceSeconds: 6
      })
    })
  }),
  cognition: Object.freeze([
    'uncertain-intent',
    'costly-signal',
    'persistent-consequence'
  ])
});

function distance3(position, anchor) {
  if (!position) return Infinity;
  const x = position.x ?? position[0] ?? 0;
  const y = position.y ?? position[1] ?? 0;
  const z = position.z ?? position[2] ?? 0;
  return Math.hypot(x - anchor[0], y - anchor[1], z - anchor[2]);
}

export class DrownedHearthDecision {
  constructor(options = {}) {
    this.contract = options.contract ?? DROWNED_HEARTH_CONTRACT;
    this.onPrompt = options.onPrompt ?? null;
    this.onResolve = options.onResolve ?? null;
    this.reset();
  }

  reset() {
    this.status = 'dormant';
    this.choice = null;
    this.reason = null;
    this.promptedAt = null;
    this.resolvedAt = null;
    this.distance = null;
    this.sequence = 0;
    return this.snapshot();
  }

  canTrigger(context = {}) {
    return context.mode === 'story' && !context.practice && !context.duel &&
      context.chapter === this.contract.triggerChapter &&
      context.score >= this.contract.triggerScore && context.score <= this.contract.triggerScore + 1;
  }

  update(context = {}) {
    this.distance = Number.isFinite(distance3(context.position, this.contract.anchor))
      ? distance3(context.position, this.contract.anchor)
      : null;
    if (this.status === 'dormant' && this.canTrigger(context) && this.distance <= this.contract.triggerRadius) {
      this.forcePrompt(context.time ?? 0);
    }
    if (this.status === 'prompted' && this.distance > this.contract.abandonRadius) {
      this.choose('silent', { reason: 'left-signal-range', time: context.time ?? 0 });
    }
    return this.snapshot();
  }

  forcePrompt(time = 0) {
    if (this.status !== 'dormant') return this.snapshot();
    this.status = 'prompted';
    this.promptedAt = Number(time) || 0;
    this.sequence += 1;
    this.onPrompt?.(this.snapshot());
    return this.snapshot();
  }

  choose(choiceId, meta = {}) {
    const choice = this.contract.choices[choiceId];
    if (!choice || this.status !== 'prompted') {
      return { accepted: false, ...this.snapshot() };
    }
    this.status = 'resolved';
    this.choice = choice.id;
    this.reason = meta.reason ?? 'player-choice';
    this.resolvedAt = Number(meta.time) || 0;
    this.sequence += 1;
    const result = { accepted: true, ...this.snapshot() };
    this.onResolve?.(result);
    return result;
  }

  snapshot() {
    const choice = this.choice ? this.contract.choices[this.choice] : null;
    return {
      profile: this.contract.profile,
      anchor: [...this.contract.anchor],
      status: this.status,
      choice: this.choice,
      reason: this.reason,
      promptedAt: this.promptedAt,
      resolvedAt: this.resolvedAt,
      distance: this.distance == null ? null : +this.distance.toFixed(1),
      sequence: this.sequence,
      prompt: this.contract.prompt,
      choices: Object.values(this.contract.choices).map((entry) => ({
        id: entry.id,
        key: entry.key,
        label: entry.label,
        promise: entry.promise,
        consequence: { ...entry.consequence }
      })),
      selectedConsequence: choice ? { ...choice.consequence } : null,
      cognition: [...this.contract.cognition],
      persistentForRun: true
    };
  }
}

export default DrownedHearthDecision;
