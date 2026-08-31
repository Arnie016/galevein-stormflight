/**
 * Game structure bootstrap for Galevein: Stormflight.
 *
 * INTEGRATION: import and call gameStructure.init(S, D, landmarkPath) after load
 * (and after horizonDirector exists). Wire returned applyHud() into the tick where
 * driveMissions() currently writes $('objText').
 */
import { ChapterDirector } from './chapterDirector.js';
import { regionLandmarkProfiles as buildRegionLandmarkProfiles } from './proceduralLandmarks.js';

let _director = null;
let _regions = null;
let _chapters = null;

async function loadData(baseUrl) {
  const [chapters, regions] = await Promise.all([
    fetch(`${baseUrl}/chapters.json`).then((r) => {
      if (!r.ok) throw new Error(`chapters.json ${r.status}`);
      return r.json();
    }),
    fetch(`${baseUrl}/regions.json`).then((r) => {
      if (!r.ok) throw new Error(`regions.json ${r.status}`);
      return r.json();
    })
  ]);
  return { chapters, regions };
}

/**
 * @param {object} S global game state (chapter, score, tutDone, finishing, done, cause, t, …)
 * @param {object} D dragon state (group.position, speed, …)
 * @param {import('./landmarkPath.js').LandmarkPath} landmarkPath
 * @param {object} [options]
 * @param {import('./horizonDirector.js').HorizonDirector} [options.horizonDirector]
 * @param {number} [options.totalBeacons=12]
 * @param {number} [options.tutorialRings=3]
 * @param {() => number} [options.getDayAmount] returns 0..1 nightfall
 * @param {(pos: import('three').Vector3) => number} [options.getHeightAboveWater]
 * @param {() => number} [options.getTowersDestroyed]
 * @param {() => object|null} [options.getObjectiveTarget] next ring/beacon Vector3-like
 * @param {string} [options.dataBaseUrl='./world-expansion/data']
 */
export async function init(S, D, landmarkPath, options = {}) {
  const baseUrl = options.dataBaseUrl ?? './world-expansion/data';
  const payload = await loadData(baseUrl);
  _chapters = payload.chapters;
  _regions = payload.regions;

  _director = new ChapterDirector(_chapters, _regions, {
    onChapterEnter(chapter, snap) {
      S.chapter = chapter.index;
      S._chapterId = chapter.id;
      S._regionId = snap.regionId;
      options.onChapterStory?.(chapter, snap);
    },
    onRegionEnter(region, meta, snap) {
      S._regionId = region.id;
      if (options.horizonDirector) _director.applySkyPreset(options.horizonDirector, region.id);
      if (landmarkPath?.setRegionFilter) {
        landmarkPath.setRegionFilter(
          region.id,
          region.allowedLandmarkArchetypes ?? [],
          region.allowedLandmarkIds ?? []
        );
      }
      if (meta?.firstVisit !== false) options.onRegionStory?.(region, meta, snap);
    }
  });

  if (options.horizonDirector && _director.regionId) {
    _director.applySkyPreset(options.horizonDirector, _director.regionId);
  }

  if (landmarkPath) {
    landmarkPath.regionProfiles = buildRegionLandmarkProfiles(_regions?.regions ?? []);
    const bootRegion = _regions?.regions?.find((r) => r.id === _director.regionId);
    if (bootRegion) {
      landmarkPath.setRegionFilter(
        bootRegion.id,
        bootRegion.allowedLandmarkArchetypes ?? [],
        bootRegion.allowedLandmarkIds ?? []
      );
    }
  }

  return createRuntime(S, D, landmarkPath, options);
}

function createRuntime(S, D, landmarkPath, options) {
  const totalBeacons = options.totalBeacons ?? _chapters.totalBeacons ?? 12;
  const tutorialRings = options.tutorialRings ?? _chapters.tutorialRings ?? 3;
  const getDay = options.getDayAmount ?? (() => S.dayAmount ?? 0);
  const getHaw = options.getHeightAboveWater ?? (() => null);
  const getTowers = options.getTowersDestroyed ?? (() => S.towersDestroyed ?? 0);
  const getTarget = options.getObjectiveTarget ?? (() => (
    D?.group?.position ? { x: D.group.position.x, y: D.group.position.y, z: D.group.position.z } : null
  ));

  function buildState(extra = {}) {
    return {
      tutDone: !!S.tutDone,
      tutorialDone: extra.tutorialDone ?? S.tutorialDone ?? 0,
      score: S.score ?? 0,
      dayAmount: getDay(),
      finishing: !!S.finishing,
      done: !!S.done,
      cause: S.cause ?? '',
      hp: S.hp ?? 100,
      flightT: S.flightT ?? 0,
      position: D?.group?.position ?? null,
      target: getTarget(),
      heightAboveWater: getHaw(D?.group?.position),
      towersDestroyed: getTowers(),
      ...extra
    };
  }

  return {
    director: _director,
    chapters: _chapters,
    regions: _regions,

    /** Call once per frame after movement; returns HUD payload. */
    tick(extra = {}) {
      if (!_director) return null;
      return _director.update(buildState(extra));
    },

    /** Map HUD payload onto DOM ids used by index.html. */
    applyHud(hud, dom = {}) {
      if (!hud) return;
      const objText = dom.objText ?? (typeof document !== 'undefined' ? document.getElementById('objText') : null);
      const beaconV = dom.beaconV ?? (typeof document !== 'undefined' ? document.getElementById('beaconV') : null);
      const chapterEl = dom.chapterLabel ?? (typeof document !== 'undefined' ? document.getElementById('chapterLabel') : null);
      const distEl = dom.distanceV ?? (typeof document !== 'undefined' ? document.getElementById('distanceV') : null);
      const heightEl = dom.heightV ?? (typeof document !== 'undefined' ? document.getElementById('heightV') : null);
      const beatEl = dom.missionBeat ?? (typeof document !== 'undefined' ? document.getElementById('missionBeat') : null);
      const cueEl = dom.coachCue ?? (typeof document !== 'undefined' ? document.getElementById('coachCue') : null);
      const clockEl = dom.journeyClock ?? (typeof document !== 'undefined' ? document.getElementById('journeyClock') : null);
      const railEl = dom.journeyRail ?? (typeof document !== 'undefined' ? document.getElementById('journeyRail') : null);

      if (objText) objText.textContent = hud.missionBeatText || hud.objectiveText;
      if (beaconV) beaconV.textContent = `${S.score ?? 0}/${totalBeacons}`;
      if (chapterEl) chapterEl.textContent = hud.chapterLabel;
      if (distEl) distEl.textContent = hud.distanceText;
      if (heightEl) {
        heightEl.textContent = hud.heightText ?? '';
        heightEl.style.display = hud.heightText ? '' : 'none';
      }
      if (beatEl) { beatEl.textContent = ''; beatEl.classList.remove('on'); }
      if (cueEl) cueEl.textContent = '';
      if (clockEl) {
        const remaining = Math.max(0, Math.ceil(hud.journeyRemainingSeconds ?? 0));
        clockEl.textContent = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
      }
      if (railEl) {
        railEl.querySelectorAll('[data-journey-phase]').forEach((node, index) => {
          node.classList.toggle('done', index < hud.chapterIndex);
          node.classList.toggle('current', index === hud.chapterIndex);
          node.setAttribute('aria-current', index === hud.chapterIndex ? 'step' : 'false');
        });
      }
    },

    reset() {
      _director?.reset();
      S.chapter = 0;
      S._chapterId = 'first_flight';
      S._regionId = 'wake_cove';
    },

    getRegion(id) {
      return _regions?.regions?.find((r) => r.id === id) ?? null;
    },

    /** Landmark ids permitted in the active region (for spawn / visibility filtering). */
    allowedLandmarksForRegion(regionId = _director?.regionId) {
      const region = _regions?.regions?.find((r) => r.id === regionId);
      return region?.allowedLandmarkIds ?? [];
    },

    allowedArchetypesForRegion(regionId = _director?.regionId) {
      const region = _regions?.regions?.find((r) => r.id === regionId);
      return region?.allowedLandmarkArchetypes ?? [];
    },

    regionLandmarkProfiles() {
      return buildRegionLandmarkProfiles(_regions?.regions ?? []);
    },

    /** Structure proportion reference from data. */
    dragonWingspanUnits: _regions?.dragonWingspanUnits ?? 8,

    snapshot() {
      return _director?.snapshot() ?? null;
    },

    journey() {
      return _director?.snapshot() ?? null;
    }
  };
}

export function getDirector() {
  return _director;
}

export const gameStructure = { init, getDirector };

export default gameStructure;
