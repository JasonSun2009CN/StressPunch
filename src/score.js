/**
 * score.js — persistent settings / best scores + combo + scoring rules.
 * localStorage is never required for the app to work; all access is guarded.
 */

import {
  COMBO_WINDOW_MS,
  DEFAULT_DURATION,
  DEFAULT_MODE,
  DURATIONS,
  MODE_IDS,
  getMode,
  isModeId,
} from "./modes.js";

export const SETTINGS_KEY = "stresspunch.settings";
export const BEST_KEY = "stresspunch.best";

export const DEFAULT_SETTINGS = Object.freeze({
  lang: null, // null → follow navigator.language
  muted: false,
  photoMode: "full",
  duration: DEFAULT_DURATION,
  mode: DEFAULT_MODE,
});

const SCORING_MODE_IDS = MODE_IDS.filter((id) => getMode(id).scoring);

function safeParse(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readStorage(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function loadSettings() {
  const stored = safeParse(readStorage(SETTINGS_KEY)) || {};
  const settings = { ...DEFAULT_SETTINGS };

  if (stored.lang === "zh" || stored.lang === "en") settings.lang = stored.lang;
  if (typeof stored.muted === "boolean") settings.muted = stored.muted;
  if (stored.photoMode === "full" || stored.photoMode === "portrait") {
    settings.photoMode = stored.photoMode;
  }
  if (DURATIONS.includes(Number(stored.duration))) {
    settings.duration = Number(stored.duration);
  }
  if (isModeId(stored.mode)) settings.mode = stored.mode;

  return settings;
}

export function saveSettings(settings) {
  return writeStorage(SETTINGS_KEY, JSON.stringify(settings));
}

export function loadBest() {
  const stored = safeParse(readStorage(BEST_KEY)) || {};
  const best = {};
  for (const id of SCORING_MODE_IDS) {
    const value = Number(stored[id]);
    best[id] = Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
  }
  return best;
}

export function saveBest(best) {
  return writeStorage(BEST_KEY, JSON.stringify(best));
}

export function resetBestStore() {
  const zero = {};
  for (const id of SCORING_MODE_IDS) zero[id] = 0;
  writeStorage(BEST_KEY, JSON.stringify(zero));
  return zero;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * The live scoring state for one round.
 * Zen mode still tracks hits/combo internally, but never adds score.
 */
export class ScoreSystem {
  constructor() {
    this.reset(DEFAULT_MODE);
  }

  reset(modeId) {
    this.modeId = isModeId(modeId) ? modeId : DEFAULT_MODE;
    this.mode = getMode(this.modeId);
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.hits = 0;
    this.misses = 0;
    this.lastHitAt = 0;
    this.hasHit = false;
    this.lastPoints = 0;
    this.lastMultiplier = 1;
  }

  /**
   * Register a successful punch.
   * @returns {{points:number, base:number, combo:number, multiplier:number, continued:boolean, scored:boolean}}
   */
  registerHit({ strength = 0.6, now = performance.now(), precision = 1 } = {}) {
    const scored = this.mode.scoring;
    const base = Math.round(10 * clamp(strength, 0.3, 1.5));

    const continued =
      this.hasHit && this.combo > 0 && now - this.lastHitAt <= COMBO_WINDOW_MS;

    this.combo = continued ? this.combo + 1 : 1;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.hasHit = true;
    this.lastHitAt = now;
    this.hits += 1;

    const multiplier = Math.min(5, 1 + Math.floor(this.combo / 5) * 0.5);
    const points = scored
      ? Math.max(0, Math.round(base * multiplier * clamp(precision, 0.1, 2)))
      : 0;

    if (scored) this.score += points;

    this.lastPoints = points;
    this.lastMultiplier = multiplier;

    return {
      points,
      base,
      combo: this.combo,
      multiplier,
      continued,
      scored,
    };
  }

  /** Precision mode: hit the bag but miss the target. */
  registerMiss({ now = performance.now(), penalty = 5 } = {}) {
    const before = this.score;
    if (this.mode.scoring) {
      this.score = Math.max(0, this.score - penalty);
    }
    this.combo = 0;
    this.hasHit = true;
    this.lastHitAt = now;
    this.hits += 1;
    this.misses += 1;
    this.lastPoints = -(before - this.score);
    this.lastMultiplier = 1;

    return {
      points: this.lastPoints,
      penalty,
      combo: 0,
      multiplier: 1,
      scored: this.mode.scoring,
      missed: true,
    };
  }

  /**
   * Called every frame while playing. Handles combo expiration.
   * In Combo mode this also signals that the round should end.
   */
  update(now = performance.now()) {
    if (this.combo > 0 && now - this.lastHitAt > COMBO_WINDOW_MS) {
      const lostCombo = this.combo;
      this.combo = 0;
      return {
        comboExpired: true,
        lostCombo,
        shouldEndRound: this.mode.endsOnComboBreak && this.hasHit,
      };
    }
    return { comboExpired: false, shouldEndRound: false };
  }

  getStats() {
    return {
      score: this.score,
      combo: this.combo,
      maxCombo: this.maxCombo,
      hits: this.hits,
      misses: this.misses,
    };
  }

  /**
   * Write the current score if it beats the stored best.
   * @returns {{isNew:boolean, previous:number, best:number}}
   */
  commitBest(best) {
    if (!this.mode.scoring) {
      return { isNew: false, previous: 0, best: 0 };
    }
    const previous = Math.max(0, Math.round(Number(best[this.modeId]) || 0));
    if (this.score > previous) {
      best[this.modeId] = this.score;
      saveBest(best);
      return { isNew: true, previous, best: this.score };
    }
    return { isNew: false, previous, best: previous };
  }
}
