/**
 * modes.js — round rules and tuning values that are shared by UI + game logic.
 * Pure data/helpers: no DOM, no Three.js.
 */

/** Seconds without a hit before a combo is considered broken. */
export const COMBO_WINDOW = 1.2;
export const COMBO_WINDOW_MS = COMBO_WINDOW * 1000;

/** Radius (in bag-local metres) of the precision target. */
export const TARGET_RADIUS = 0.26;

/** Target centre sits inside this vertical band of the bag face. */
export const TARGET_VERTICAL_RANGE = 0.68;
export const TARGET_ANGLE_RANGE = 0.52;

export const DURATIONS = [30, 60, 120];
export const DEFAULT_DURATION = 60;

/**
 * Every mode is described here so main.js / ui.js can stay generic.
 *  - scoring:          round produces a score
 *  - timed:            countdown controls round length
 *  - hasTarget:        precision target marker is shown
 *  - endsOnComboBreak: round ends as soon as the combo window lapses
 *  - show*:            which HUD blocks are relevant
 */
export const MODES = {
  zen: {
    id: "zen",
    order: 0,
    scoring: false,
    timed: false,
    hasTarget: false,
    endsOnComboBreak: false,
    canEndManually: false,
    showTimer: false,
    showCombo: false,
    showScore: false,
    icon: "∞",
  },
  timeAttack: {
    id: "timeAttack",
    order: 1,
    scoring: true,
    timed: true,
    hasTarget: false,
    endsOnComboBreak: false,
    canEndManually: true,
    showTimer: true,
    showCombo: true,
    showScore: true,
    icon: "◷",
  },
  combo: {
    id: "combo",
    order: 2,
    scoring: true,
    timed: false,
    hasTarget: false,
    endsOnComboBreak: true,
    canEndManually: true,
    showTimer: false,
    showCombo: true,
    showScore: true,
    icon: "⚡",
  },
  precision: {
    id: "precision",
    order: 3,
    scoring: true,
    timed: false,
    hasTarget: true,
    endsOnComboBreak: false,
    canEndManually: true,
    showTimer: false,
    showCombo: true,
    showScore: true,
    icon: "◎",
  },
};

export const MODE_IDS = Object.keys(MODES);
export const DEFAULT_MODE = "zen";

export function getMode(id) {
  return MODES[id] || MODES[DEFAULT_MODE];
}

export function isModeId(id) {
  return Object.prototype.hasOwnProperty.call(MODES, id);
}

/**
 * Score coefficient for a precision hit.
 * Dead centre = 2.0, edge of the ring = 0.5.
 * Anything outside the ring is handled as a miss by the game loop.
 */
export function precisionFactor(distance, radius = TARGET_RADIUS) {
  const d = Math.max(0, Math.min(1, distance / radius));
  return 2 - 1.5 * d;
}

export function precisionLabel(factor, lang, t) {
  if (factor >= 1.7) return t(lang, "precision.perfect");
  return t(lang, "precision.good");
}

/**
 * Pick a new target on the front of the bag.
 * Returns bag-local coordinates (same space as hit points).
 */
export function pickTargetLocal(centerY, radius = 0.62, random = Math.random) {
  const angle = (random() * 2 - 1) * TARGET_ANGLE_RANGE;
  const yOffset = (random() * 2 - 1) * TARGET_VERTICAL_RANGE;
  return {
    x: Math.sin(angle) * radius,
    y: centerY + yOffset,
    z: Math.cos(angle) * radius,
  };
}

/** 75 → "01:15" */
export function formatTime(totalSeconds) {
  const s = Math.max(0, Math.ceil(totalSeconds));
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return `${String(m).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

/** 12345 → "12,345" (locale-aware, tabular digits are handled in CSS). */
export function formatNumber(value) {
  return Math.max(0, Math.round(value)).toLocaleString();
}
