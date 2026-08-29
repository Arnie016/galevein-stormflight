/**
 * Chapter state machine for Galevein: Stormflight.
 * Owns region gates, objective strings, and win/loss evaluation.
 * Does not touch the DOM. returns HUD payloads for the playability layer.
 */

const DEFAULT_TOTAL_BEACONS = 12;
const DEFAULT_TUTORIAL_RINGS = 3;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function hypot2(x, z) {
  return Math.hypot(x, z);
}

function fillTemplate(template, vars) {
  return String(template).replace(/\{(\w+)\}/g, (_, key) => (
    vars[key] !== undefined && vars[key] !== null ? String(vars[key]) : `{${key}}`
  ));
}

export class ChapterDirector {
  /**
   * @param {{ chapters: object[], totalBeacons?: number, tutorialRings?: number }} chapterData
   * @param {{ regions: object[] }} regionData
   * @param {object} [options]
   */
  constructor(chapterData, regionData, options = {}) {
    if (!chapterData?.chapters?.length) throw new TypeError('ChapterDirector requires chapterData.chapters');
    if (!regionData?.regions?.length) throw new TypeError('ChapterDirector requires regionData.regions');

    this.chapters = chapterData.chapters.slice().sort((a, b) => a.index - b.index);
    this.regions = regionData.regions.slice();
    this.regionById = Object.fromEntries(this.regions.map((region) => [region.id, region]));
    this.totalBeacons = chapterData.totalBeacons ?? DEFAULT_TOTAL_BEACONS;
    this.tutorialRings = chapterData.tutorialRings ?? DEFAULT_TUTORIAL_RINGS;
    this.journeyProfile = chapterData.journeyProfile ?? 'chapter-route-v1';
    this.maxDurationSeconds = chapterData.maxDurationSeconds ?? 600;
    this.metaObjectives = chapterData.metaObjectives ?? {};

    this.callbacks = {
      onChapterEnter: options.onChapterEnter ?? null,
      onRegionEnter: options.onRegionEnter ?? null,
      onWin: options.onWin ?? null,
      onLoss: options.onLoss ?? null
    };

    this.reset();
  }

  reset() {
    this.chapterIndex = 0;
    this.regionId = this.chapters[0]?.regionId ?? this.regions[0]?.id ?? null;
    this.seenRegions = new Set();
    this.completed = false;
    this.failed = false;
    this.failureReason = '';
    this.lastHud = null;
  }

  get chapter() {
    return this.chapters[this.chapterIndex] ?? this.chapters[this.chapters.length - 1];
  }

  get region() {
    return this.regionId ? this.regionById[this.regionId] ?? null : null;
  }

  /**
   * Resolve active chapter from gameplay score (post-tutorial).
   * @param {number} score
   * @returns {object}
   */
  chapterForScore(score) {
    let active = this.chapters[0];
    for (const chapter of this.chapters) {
      if (chapter.index === 0) continue;
      const unlock = chapter.unlockAtScore ?? 0;
      if (score >= unlock) active = chapter;
    }
    return active;
  }

  /**
   * Advance chapter index when score crosses unlock thresholds.
   * @param {number} score
   * @param {boolean} tutDone
   */
  syncChapterFromProgress(score, tutDone) {
    if (!tutDone) {
      if (this.chapterIndex !== 0) this.enterChapter(0);
      return;
    }
    const next = this.chapterForScore(score);
    if (next.index > this.chapterIndex) this.enterChapter(next.index);
  }

  enterChapter(index) {
    const chapter = this.chapters.find((entry) => entry.index === index);
    if (!chapter || this.chapterIndex === index) return;
    this.chapterIndex = index;
    if (chapter.regionId && chapter.regionId !== this.regionId) {
      this.enterRegion(chapter.regionId, { fromChapter: chapter.id });
    }
    this.callbacks.onChapterEnter?.(chapter, this.snapshot());
  }

  enterRegion(regionId, meta = {}) {
    if (!this.regionById[regionId]) return;
    const firstVisit = !this.seenRegions.has(regionId);
    const changed = this.regionId !== regionId;
    this.regionId = regionId;
    this.seenRegions.add(regionId);
    if (changed || firstVisit) {
      this.callbacks.onRegionEnter?.(this.regionById[regionId], { ...meta, firstVisit }, this.snapshot());
    }
  }

  /**
   * Region gate from player position. Circular gate uses bounds.center + bounds.radius.
   * @param {{ x: number, y?: number, z: number }} position
   */
  updateRegionGate(position) {
    if (!position) return;
    let best = null;
    let bestDist = Infinity;
    for (const region of this.regions) {
      const center = region.bounds?.center;
      const radius = region.bounds?.radius ?? 0;
      if (!center || !radius) continue;
      const dist = hypot2(position.x - center[0], position.z - center[2]);
      if (dist <= radius && dist < bestDist) {
        best = region;
        bestDist = dist;
      }
    }
    if (best && best.id !== this.regionId) this.enterRegion(best.id, { fromPosition: true });
  }

  /**
   * @param {object} state gameplay snapshot
   * @param {boolean} state.tutDone
   * @param {number} state.tutorialDone ring count 0..3
   * @param {number} state.score beacon count
   * @param {number} state.dayAmount 0..1 nightfall progress
   * @param {boolean} state.finishing escape sequence active
   * @param {boolean} state.done run ended
   * @param {string} [state.cause] loss cause
   * @param {{ x:number,y:number,z:number }} [state.position]
   * @param {{ x:number,y:number,z:number }} [state.target]
   * @param {number} [state.heightAboveWater]
   * @param {number} [state.towersDestroyed]
   */
  update(state) {
    if (state.position) this.updateRegionGate(state.position);
    if (state.tutDone) this.syncChapterFromProgress(state.score ?? 0, true);

    const outcome = this.evaluateOutcome(state);
    if (outcome === 'win' && !this.completed) {
      this.completed = true;
      this.callbacks.onWin?.(this.chapter, state, this.snapshot());
    } else if (outcome === 'loss' && !this.failed) {
      this.failed = true;
      this.failureReason = state.cause || this.chapter.loss?.narrative || 'run_failed';
      this.callbacks.onLoss?.(this.chapter, state, this.snapshot());
    }

    this.lastHud = this.buildHud(state);
    return this.lastHud;
  }

  evaluateOutcome(state) {
    if (state.done && state.finishing) return 'win';
    if (state.done && !state.finishing) return 'loss';
    if (state.cause && (state.hp <= 0 || /shot|wreck|crash|down/i.test(state.cause))) return 'loss';

    const chapter = this.chapter;
    if (chapter.index === 0) {
      if ((state.tutorialDone ?? 0) >= this.tutorialRings) return null;
      return null;
    }

    const day = state.dayAmount ?? 0;
    const score = state.score ?? 0;
    const threshold = chapter.win?.threshold ?? this.totalBeacons;

    if (chapter.id === 'tempest_gate') {
      if (day >= 0.99 && score < this.totalBeacons && !state.finishing) return 'loss';
      if (state.finishing) return 'win';
      return null;
    }

    if (day >= 0.99 && score < threshold) return 'loss';
    if (score >= threshold && chapter.index < this.chapters.length - 1) return null;
    return null;
  }

  buildMissionBeat(chapter, state, vars) {
    const beat = chapter.storyBeat;
    if (beat === 'thread_canyon') {
      const hearth = state.hearthDecision;
      if (hearth?.status === 'prompted') {
        return '◈ The Last Hearth is calling. [1] Answer it. [2] Slip past.';
      }
      const target = 120;
      const peak = state.altitudePeak ?? 0;
      if (!state.altitudeCollected) return `▲ Rise above the harbor. ${Math.max(0, Math.round(peak))}/${target}m`;
      if (hearth?.status === 'resolved' && hearth.choice === 'answer') {
        return '✓ The harbor is mapped. The hearth answers. Beacon eight wakes.';
      }
      if (hearth?.status === 'resolved' && hearth.choice === 'silent') {
        return '✓ The harbor is mapped. The hearth fades behind you. Beacon eight wakes.';
      }
      if ((state.score ?? 0) >= 6) {
        return '◇ The coast is clear below. Find the Last Hearth beneath beacon seven.';
      }
      return '✓ You can read the coast now. Follow the vanes to the Last Hearth.';
    }
    if (beat === 'destroy_tower') {
      const td = vars.towersDestroyed ?? 0;
      const need = Math.min(3, state.towerTarget ?? 3);
      if (td >= need) return `✓ The last shrine falls quiet. The wastes lie open.`;
      return `⚔ Silence the wind shrines. ${td}/${need} broken. Hold X for stormfire.`;
    }
    if (beat === 'nightfall_escape') {
      if (state.apexDefeated) return '✓ The Crowned Maw breaks away. Cross the final vane.';
      return `⚔ Crowned Maw. ${Math.max(0, state.apexHp ?? 10)}/${state.apexMaxHp ?? 10} resolve. Hold X to charge.`;
    }
    const meta = this.metaObjectives[beat];
    if (meta && chapter.index > 0 && chapter.index < 4) return meta;
    return '';
  }

  buildHud(state) {
    const chapter = this.chapter;
    const region = this.region;
    const score = state.score ?? 0;
    const tutorialDone = state.tutorialDone ?? 0;
    const hud = chapter.hud ?? {};

    const vars = {
      score,
      tutorialDone,
      totalBeacons: this.totalBeacons,
      towersDestroyed: state.towersDestroyed ?? 0
    };

    const objectiveText = fillTemplate(hud.objectiveTemplate ?? '', vars);
    const distance = this.computeDistance(state.position, state.target);
    const missionBeatText = this.buildMissionBeat(chapter, state, vars);
    const elapsedSeconds = clamp(state.flightT ?? 0, 0, this.maxDurationSeconds);

    return {
      chapterIndex: chapter.index,
      chapterRoman: chapter.roman,
      chapterTitle: chapter.title,
      chapterLabel: hud.chapterLabel ?? `Chapter ${chapter.roman} · ${chapter.title}`,
      regionId: region?.id ?? chapter.regionId,
      regionName: region?.name ?? '',
      objectiveText,
      missionBeatText,
      goalText: hud.goalText ?? '',
      distanceM: distance,
      distanceLabel: hud.distanceLabel ?? 'Next objective',
      distanceText: distance != null ? `${Math.round(distance)} m` : '',
      heightAboveWater: hud.showHeightAboveWater ? (state.heightAboveWater ?? null) : null,
      heightText: hud.showHeightAboveWater && state.heightAboveWater != null
        ? `${Math.max(0, Math.round(state.heightAboveWater))} m AGL`
        : null,
      subHints: hud.subHints ?? [],
      storyLine: chapter.storyLine ?? '',
      popupOnEnter: chapter.popupOnEnter ?? '',
      metaObjective: this.metaObjectives[chapter.storyBeat] ?? '',
      journeyProfile: this.journeyProfile,
      journeyPhase: chapter.index + 1,
      journeyTotalPhases: this.chapters.length,
      journeyElapsedSeconds: elapsedSeconds,
      journeyRemainingSeconds: Math.max(0, this.maxDurationSeconds - elapsedSeconds),
      journeyMaxSeconds: this.maxDurationSeconds,
      timeWindowSeconds: chapter.timeWindowSeconds ?? null,
      humanCue: chapter.humanCue ?? '',
      phasePromise: chapter.phasePromise ?? '',
      reward: chapter.reward ?? '',
      skyPresetId: region?.skyPreset?.id ?? null,
      ambientLine: region?.ambientLine ?? ''
    };
  }

  computeDistance(position, target) {
    if (!position || !target) return null;
    const dx = (target.x ?? target[0]) - position.x;
    const dy = (target.y ?? target[1] ?? 0) - (position.y ?? 0);
    const dz = (target.z ?? target[2]) - position.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /**
   * Apply sky preset fields onto a HorizonDirector instance.
   * Cheap extension. does not allocate per frame.
   * @param {import('./horizonDirector.js').HorizonDirector} horizonDirector
   * @param {string} [regionId]
   */
  applySkyPreset(horizonDirector, regionId = this.regionId) {
    const region = this.regionById[regionId];
    const preset = region?.skyPreset;
    if (!preset || !horizonDirector) return;
    if (preset.fogDensity != null) horizonDirector.fogDensity = preset.fogDensity;
    if (preset.horizonNear != null) horizonDirector.near = preset.horizonNear;
    if (preset.horizonFar != null) horizonDirector.far = preset.horizonFar;
    if (typeof horizonDirector.applySkyPreset === 'function') {
      horizonDirector.applySkyPreset(preset);
    } else {
      horizonDirector._skyPreset = preset;
    }
  }

  snapshot() {
    return {
      chapterIndex: this.chapterIndex,
      chapterId: this.chapter?.id,
      chapterTitle: this.chapter?.title,
      regionId: this.regionId,
      regionName: this.region?.name,
      seenRegions: [...this.seenRegions],
      completed: this.completed,
      failed: this.failed,
      failureReason: this.failureReason,
      journeyProfile: this.journeyProfile,
      maxDurationSeconds: this.maxDurationSeconds,
      phases: this.chapters.map((chapter) => ({
        id: chapter.id,
        index: chapter.index,
        title: chapter.title,
        timeWindowSeconds: chapter.timeWindowSeconds ?? null,
        humanCue: chapter.humanCue ?? '',
        reward: chapter.reward ?? ''
      })),
      hud: this.lastHud
    };
  }
}

export async function loadChapterDirector(baseUrl = './world-expansion/data') {
  const [chapters, regions] = await Promise.all([
    fetch(`${baseUrl}/chapters.json`).then((response) => {
      if (!response.ok) throw new Error(`Failed to load chapters.json (${response.status})`);
      return response.json();
    }),
    fetch(`${baseUrl}/regions.json`).then((response) => {
      if (!response.ok) throw new Error(`Failed to load regions.json (${response.status})`);
      return response.json();
    })
  ]);
  return new ChapterDirector(chapters, regions, {});
}
