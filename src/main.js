/**
 * main.js — application state machine and glue.
 *
 * States: menu → playing ⇄ paused → result → playing / menu
 * Photos never leave this file: File API → canvas → CanvasTexture.
 */

import * as THREE from "three";

import { AudioEngine } from "./audio.js";
import { Effects } from "./effects.js";
import { detectLanguage, t } from "./i18n.js";
import { InputController } from "./input.js";
import {
  DURATIONS,
  TARGET_RADIUS,
  getMode,
  isModeId,
  pickTargetLocal,
  precisionFactor,
} from "./modes.js";
import { BagPhysics } from "./physics.js";
import { StressScene } from "./scene.js";
import {
  ScoreSystem,
  loadBest,
  loadSettings,
  resetBestStore,
  saveSettings,
} from "./score.js";
import { UI } from "./ui.js";

const MAX_IMAGE_SIDE = 2048;

/** Read a file locally and downscale it if needed. Never hits the network. */
async function loadPhotoSource(file) {
  let source = null;

  if ("createImageBitmap" in window) {
    try {
      source = await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      try {
        source = await createImageBitmap(file);
      } catch {
        source = null;
      }
    }
  }

  if (!source) {
    source = await new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("image-decode-failed"));
      };
      image.src = url;
    });
  }

  const width = source.width || source.naturalWidth || 0;
  const height = source.height || source.naturalHeight || 0;
  if (!width || !height) throw new Error("image-empty");

  const largest = Math.max(width, height);
  if (largest <= MAX_IMAGE_SIDE) return source;

  const scale = MAX_IMAGE_SIDE / largest;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

  if (typeof source.close === "function") source.close();
  return canvas;
}

class StressPunchApp {
  constructor() {
    this.settings = loadSettings();
    this.lang = this.settings.lang || detectLanguage();
    this.best = loadBest();
    this.modeId = isModeId(this.settings.mode) ? this.settings.mode : "zen";
    this.state = "menu";
    this.photoSource = null;
    this.pausedAt = 0;
    this.time = 0;
    this.lastFrame = performance.now();
    this.round = {
      duration: this.settings.duration,
      elapsed: 0,
      timeLeft: this.settings.duration,
      target: null,
    };

    this.audio = new AudioEngine({ muted: this.settings.muted });
    this.score = new ScoreSystem();

    this.ui = new UI(this._uiCallbacks());
    this.ui.setLanguage(this.lang);
    this.ui.setMuted(this.settings.muted);
    this.ui.setMode(this.modeId);
    this.ui.setDuration(this.settings.duration);
    this.ui.setPhotoMode(this.settings.photoMode);

    try {
      this.scene = new StressScene(document.getElementById("scene"), {
        lang: this.lang,
        photoMode: this.settings.photoMode,
      });
    } catch (error) {
      console.error("[StressPunch] WebGL init failed", error);
      this.scene = null;
      this.ui.showMenu();
      this.ui.btnStart.disabled = true;
      this.ui.toast(t(this.lang, "toast.webgl"), { error: true, duration: 9000 });
      return;
    }

    this.bag = this.scene.bag;
    this._syncBagLanguage();

    this.effects = new Effects({
      scene: this.scene.scene,
      camera: this.scene.camera,
      bag: this.bag,
      layer: document.getElementById("combo-layer"),
      flashEl: document.getElementById("hit-flash"),
    });
    this.physics = new BagPhysics();
    this.input = new InputController({
      element: this.scene.element,
      camera: this.scene.camera,
      bag: this.bag,
      onHit: (hit) => this._handleHit(hit),
      onPause: () => this._togglePause(),
    });

    this._cameraRight = new THREE.Vector3();
    this._projected = new THREE.Vector3();
    this._projectedEdge = new THREE.Vector3();
    this._targetVisible = false;
    this._aimVisible = false;

    this._onResize = () => {
      this.effects.setViewport(window.innerWidth, window.innerHeight, this.scene.camera.fov);
    };
    window.addEventListener("resize", this._onResize, { passive: true });
    this.effects.setViewport(window.innerWidth, window.innerHeight, this.scene.camera.fov);

    document.addEventListener("visibilitychange", () => {
      if (document.hidden && this.state === "playing") this._pauseRound();
    });
    window.addEventListener("beforeunload", () => {
      if (this.photoSource && typeof this.photoSource.close === "function") {
        this.photoSource.close();
      }
    });

    this.ui.showMenu();

    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  /* ── Callbacks passed to the UI ───────────────────────────────────────── */

  _uiCallbacks() {
    return {
      onStart: () => this._startRound(),
      onModeChange: (modeId) => this._setMode(modeId),
      onPhotoFile: (file) => this._handlePhotoFile(file),
      onPhotoModeChange: (mode) => this._setPhotoMode(mode),
      onDurationChange: (seconds) => this._setDuration(seconds),
      onToggleMute: () => this._toggleMute(),
      onToggleLanguage: () => this._setLanguage(this.lang === "zh" ? "en" : "zh"),
      onSetLanguage: (lang) => this._setLanguage(lang),
      onOpenSettings: () => this._handleSettingsOpen(),
      onCloseSettings: () => {},
      onResetBest: () => this._resetBest(),
      onRemovePhoto: () => this._removePhoto(),
      onPause: () => this._togglePause(),
      onResume: () => this._resumeRound(),
      onRestart: () => this._startRound(),
      onEndRound: () => this._endRound({ manual: true }),
      onQuit: () => this._quitToMenu(),
      onReplay: () => this._startRound(),
      onChangeMode: () => this._quitToMenu(),
      onChangePhoto: () => {
        this._quitToMenu();
        this.ui.openPhotoPicker();
      },
    };
  }

  /* ── Settings / language / photo ──────────────────────────────────────── */

  _save() {
    saveSettings(this.settings);
  }

  _uiClick() {
    this.audio.unlock();
    this.audio.playUi();
  }

  _setMode(modeId) {
    if (!isModeId(modeId)) return;
    this._uiClick();
    this.modeId = modeId;
    this.settings.mode = modeId;
    this._save();
    this.ui.setMode(modeId);
  }

  _setDuration(seconds) {
    const value = Number(seconds);
    if (!DURATIONS.includes(value)) return;
    this._uiClick();
    this.settings.duration = value;
    this._save();
    this.ui.setDuration(value);
  }

  _setPhotoMode(mode) {
    const value = mode === "portrait" ? "portrait" : "full";
    this._uiClick();
    this.settings.photoMode = value;
    this._save();
    this.ui.setPhotoMode(value);
    this.bag?.setPhotoMode(value);
  }

  _toggleMute() {
    this.settings.muted = !this.settings.muted;
    this._save();
    this.audio.setMuted(this.settings.muted);
    this.ui.setMuted(this.settings.muted);
    if (!this.settings.muted) {
      this.audio.unlock();
      this.audio.playUi();
    }
  }

  _setLanguage(lang) {
    if (lang !== "zh" && lang !== "en") return;
    if (lang === this.lang) return;
    this._uiClick();
    this.lang = lang;
    this.settings.lang = lang;
    this._save();
    this.ui.setLanguage(lang);
    this._syncBagLanguage();
  }

  _syncBagLanguage() {
    if (!this.bag) return;
    this.bag.setLanguage(this.lang, {
      upload: t(this.lang, "texture.upload"),
      sub: t(this.lang, "texture.sub"),
    });
  }

  async _handlePhotoFile(file) {
    if (!file) return;
    if (file.type && !file.type.startsWith("image/")) {
      this.ui.toast(t(this.lang, "toast.invalidImage"), { error: true });
      return;
    }

    try {
      const source = await loadPhotoSource(file);
      if (this.photoSource && typeof this.photoSource.close === "function") {
        this.photoSource.close();
      }
      this.photoSource = source;
      this.bag.setPhoto(source, {
        mode: this.settings.photoMode,
        lang: this.lang,
      });
      this.ui.showPhotoPreview(source);
      this.ui.toast(t(this.lang, "toast.photoReady"));
      this._uiClick();
    } catch (error) {
      console.error("[StressPunch] photo load failed", error);
      this.ui.toast(t(this.lang, "toast.imageError"), { error: true });
    }
  }

  _removePhoto() {
    if (this.photoSource && typeof this.photoSource.close === "function") {
      this.photoSource.close();
    }
    this.photoSource = null;
    this.bag?.setPhoto(null, { mode: this.settings.photoMode, lang: this.lang });
    this.ui.clearPhotoPreview();
    this.ui.toast(t(this.lang, "toast.photoRemoved"));
  }

  _resetBest() {
    this.best = resetBestStore();
    this.ui.toast(t(this.lang, "toast.reset"));
    this._uiClick();
  }

  _handleSettingsOpen() {
    if (this.state === "playing") this._pauseRound();
  }

  /* ── Round lifecycle ─────────────────────────────────────────────────── */

  _startRound() {
    if (!this.scene) return;
    this._uiClick();

    const mode = getMode(this.modeId);
    this.score.reset(this.modeId);
    this.physics.reset();
    this.effects.clear();

    this.round.duration = this.settings.duration;
    this.round.elapsed = 0;
    this.round.timeLeft = this.round.duration;
    this.round.target = null;
    this.pausedAt = 0;

    this.state = "playing";
    this.input.setEnabled(true);
    this.input.resetAim();
    this.ui.showGame(mode);
    this.ui.hidePause();
    this.ui.hideTarget();
    this.ui.hideAim();
    this._targetVisible = false;
    this._aimVisible = false;

    if (mode.hasTarget) this._newTarget();

    this.ui.updateHUD({
      timeLeft: this.round.timeLeft,
      score: this.score.score,
      combo: this.score.combo,
    });

    this.lastFrame = performance.now();
  }

  _pauseRound() {
    if (this.state !== "playing") return;
    this.state = "paused";
    this.pausedAt = performance.now();
    this.input.setEnabled(false);
    this.ui.showPause(getMode(this.modeId).canEndManually);
  }

  _resumeRound() {
    if (this.state !== "paused") return;
    const now = performance.now();
    if (this.pausedAt && this.score.lastHitAt > 0) {
      // Shift the combo deadline so pausing does not break a combo.
      this.score.lastHitAt += now - this.pausedAt;
    }
    this.pausedAt = 0;
    this.state = "playing";
    this.ui.hidePause();
    this.input.setEnabled(true);
    this.lastFrame = now;
  }

  _togglePause() {
    if (this.state === "playing") {
      this._pauseRound();
    } else if (this.state === "paused" && !this.ui.settingsOpen) {
      this._resumeRound();
    }
  }

  _quitToMenu() {
    this.state = "menu";
    this.pausedAt = 0;
    this.input?.setEnabled(false);
    this.ui.showMenu();
    this.ui.hidePause();
    this.ui.setMode(this.modeId);
    this.effects?.clear();
    this.physics?.reset();
    this.score.reset(this.modeId);
    this.round.target = null;
    this.round.elapsed = 0;
    this.round.timeLeft = this.round.duration;
    this._targetVisible = false;
    this._aimVisible = false;
    this.ui.hideTarget();
    this.ui.hideAim();
  }

  _endRound({ manual = false, timeUp = false, comboBreak = false } = {}) {
    if (this.state !== "playing" && this.state !== "paused") return;

    const mode = getMode(this.modeId);
    if (mode.id === "zen" || !mode.scoring) {
      this._quitToMenu();
      return;
    }

    this.state = "result";
    this.pausedAt = 0;
    this.input.setEnabled(false);
    this.ui.hidePause();
    this.ui.hideTarget();
    this.ui.hideAim();
    this._targetVisible = false;
    this._aimVisible = false;
    this.round.target = null;

    const commit = this.score.commitBest(this.best);
    const stats = this.score.getStats();

    this.audio.playRoundEnd();
    if (!manual && (timeUp || comboBreak)) {
      // The synthesized end-chime doubles as a clear "round over" cue.
    }

    this.ui.showResult({
      modeId: mode.id,
      score: stats.score,
      maxCombo: stats.maxCombo,
      hits: stats.hits,
      best: commit.best,
      isNewBest: commit.isNew,
    });
  }

  /* ── Hits ────────────────────────────────────────────────────────────── */

  _handleHit(hit) {
    if (this.state !== "playing") return;
    this.audio.unlock();
    this.audio.playPunch(hit.strength);

    const mode = getMode(this.modeId);
    const now = performance.now();

    let miss = false;
    let label = "";
    let precision = 1;

    if (mode.hasTarget && this.round.target) {
      const distance = hit.local.distanceTo(this.round.target);
      if (distance <= TARGET_RADIUS) {
        precision = precisionFactor(distance, TARGET_RADIUS);
        if (precision >= 1.7) label = t(this.lang, "precision.perfect");
      } else {
        miss = true;
        label = t(this.lang, "precision.miss");
      }
    }

    const result = miss
      ? this.score.registerMiss({ now })
      : this.score.registerHit({ now, strength: hit.strength, precision });

    this.physics.punch({ strength: hit.strength, direction: hit.direction });
    this.scene.shake(hit.strength * (miss ? 0.72 : 1));

    this.effects.hit({
      world: hit.point,
      local: hit.local,
      strength: hit.strength,
      combo: result.combo,
      points: result.points,
      scored: result.scored,
      miss,
      label,
    });

    if (mode.hasTarget) this._newTarget();

    this.ui.updateHUD({
      timeLeft: this.round.timeLeft,
      score: this.score.score,
      combo: this.score.combo,
    });
  }

  _newTarget() {
    const point = pickTargetLocal(this.bag.centerY, this.bag.radius);
    this.round.target = new THREE.Vector3(point.x, point.y, point.z);
  }

  /* ── Frame loop ──────────────────────────────────────────────────────── */

  _loop(now) {
    const rawDt = (now - this.lastFrame) / 1000;
    const dt = Math.min(0.05, Math.max(0, rawDt || 0));
    this.lastFrame = now;
    this.time += dt;

    if (this.state === "playing") {
      const mode = getMode(this.modeId);
      this.round.elapsed += dt;
      if (mode.timed) {
        this.round.timeLeft = Math.max(0, this.round.duration - this.round.elapsed);
      }

      this.input.update(now);

      if (mode.timed && this.round.timeLeft <= 0) {
        this._endRound({ timeUp: true });
      } else {
        const comboState = this.score.update(now);
        if (comboState.shouldEndRound) {
          this._endRound({ comboBreak: true });
        }
      }
    }

    // Physics settles outside of play too (menu / results), but freezes on pause.
    if (this.state !== "paused") {
      this.physics.step(dt);
      this.effects.update(dt);
    }

    const idle = this.state === "playing" ? 0.22 : 0.8;
    this.bag.applyPhysics(this.physics.state, this.time, idle);
    this.scene.updateCamera(dt);
    this._updateOverlays(now);

    if (this.state === "playing" || this.state === "paused") {
      this.ui.updateHUD({
        timeLeft: this.round.timeLeft,
        score: this.score.score,
        combo: this.score.combo,
      });
    }

    this.scene.render();
    requestAnimationFrame(this._loop);
  }

  _updateOverlays(now) {
    const mode = getMode(this.modeId);
    const playing = this.state === "playing";
    const camera = this.scene.camera;

    // Precision target follows the bag in screen space.
    if (playing && mode.hasTarget && this.round.target) {
      this.bag.updateMatrix();
      camera.updateMatrixWorld();
      this._cameraRight.setFromMatrixColumn(camera.matrixWorld, 0);

      const world = this.bag.localToWorld(this.round.target);
      this._projected.copy(world).project(camera);
      this._projectedEdge
        .copy(world)
        .addScaledVector(this._cameraRight, TARGET_RADIUS)
        .project(camera);

      const x = (this._projected.x * 0.5 + 0.5) * this.scene.width;
      const y = (-this._projected.y * 0.5 + 0.5) * this.scene.height;
      const radiusPx =
        Math.abs(this._projectedEdge.x - this._projected.x) * 0.5 * this.scene.width;

      if (
        this._projected.z < 1 &&
        x > -40 &&
        x < this.scene.width + 40 &&
        y > -40 &&
        y < this.scene.height + 40
      ) {
        this.ui.showTarget(x, y, Math.max(26, radiusPx));
        this._targetVisible = true;
      } else if (this._targetVisible) {
        this.ui.hideTarget();
        this._targetVisible = false;
      }
    } else if (this._targetVisible) {
      this.ui.hideTarget();
      this._targetVisible = false;
    }

    // Keyboard aim reticle.
    if (playing && this.input.isKeyboardAiming(now)) {
      const local = this.bag.getAimPoint(this.input.aimX, this.input.aimY);
      const world = this.bag.localToWorld(local);
      camera.updateMatrixWorld();
      this._projected.copy(world).project(camera);
      const x = (this._projected.x * 0.5 + 0.5) * this.scene.width;
      const y = (-this._projected.y * 0.5 + 0.5) * this.scene.height;

      if (this._projected.z < 1 && x > 0 && x < this.scene.width && y > 0 && y < this.scene.height) {
        this.ui.showAim(x, y);
        this._aimVisible = true;
      } else if (this._aimVisible) {
        this.ui.hideAim();
        this._aimVisible = false;
      }
    } else if (this._aimVisible) {
      this.ui.hideAim();
      this._aimVisible = false;
    }
  }
}

/* ── Boot ──────────────────────────────────────────────────────────────── */

function boot() {
  window.stressPunch = new StressPunchApp();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
