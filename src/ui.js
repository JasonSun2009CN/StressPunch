/**
 * ui.js — DOM bindings and view state. No game logic lives here.
 * The app calls imperative methods; the UI only renders.
 */

import { applyTranslations, t } from "./i18n.js";
import { formatNumber, formatTime, getMode } from "./modes.js";

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(callbacks = {}) {
    this.callbacks = callbacks;
    this.lang = "en";
    this.modeId = "zen";
    this.currentMode = null;
    this.muted = false;
    this.settingsOpen = false;
    this.lastResult = null;
    this.resetArmed = false;
    this._resetTimer = 0;
    this._toastTimer = 0;
    this._lastHud = {};

    this._cacheElements();
    this._bindEvents();

    this._renderHudMode = this._renderHudMode.bind(this);
    window.addEventListener("resize", this._renderHudMode, { passive: true });

    this.setLanguage("en");
    this.setMode("zen");
    this.setDuration(60);
    this.setPhotoMode("full");
  }

  _cacheElements() {
    this.hud = $("hud");
    this.hudMode = $("hud-mode");
    this.hudTimerWrap = $("hud-timer-wrap");
    this.hudTimer = $("hud-timer");
    this.hudComboWrap = $("hud-combo-wrap");
    this.hudCombo = $("hud-combo");
    this.hudScoreWrap = $("hud-score-wrap");
    this.hudScore = $("hud-score");

    this.btnPause = $("btn-pause");
    this.btnMute = $("btn-mute");
    this.btnLang = $("btn-lang");
    this.btnLangText = $("btn-lang-text");
    this.btnSettings = $("btn-settings");

    this.screenMenu = $("screen-menu");
    this.screenResult = $("screen-result");
    this.screenPause = $("screen-pause");

    this.modeGrid = $("mode-grid");
    this.modeCards = Array.from(this.modeGrid.querySelectorAll(".mode-card"));

    this.dropzone = $("dropzone");
    this.photoInput = $("photo-input");
    this.photoEmpty = $("photo-empty");
    this.photoPreview = $("photo-preview");
    this.photoChangeBadge = $("photo-change-badge");
    this.btnRemovePhoto = $("btn-remove-photo");
    this.previewCtx = this.photoPreview.getContext("2d");

    this.photoModeButtons = Array.from(document.querySelectorAll("[data-photo-mode]"));
    this.durationButtons = Array.from(document.querySelectorAll("[data-duration]"));
    this.durationField = $("duration-field");

    this.btnStart = $("btn-start");

    this.resultMode = $("result-mode");
    this.resultTitle = $("result-title");
    this.resultNewBest = $("result-newbest");
    this.resultScore = $("result-score");
    this.statCombo = $("stat-combo");
    this.statHits = $("stat-hits");
    this.statBest = $("stat-best");
    this.btnReplay = $("btn-replay");
    this.btnChangeMode = $("btn-change-mode");
    this.btnChangePhoto = $("btn-change-photo");

    this.btnResume = $("btn-resume");
    this.btnRestart = $("btn-restart");
    this.btnEndRound = $("btn-end-round");
    this.btnQuit = $("btn-quit");

    this.settingsBackdrop = $("settings-backdrop");
    this.settingsSheet = $("settings-sheet");
    this.btnSettingsClose = $("btn-settings-close");
    this.settingsLanguageButtons = Array.from(
      this.settingsSheet.querySelectorAll("[data-lang]"),
    );
    this.settingsSound = $("settings-sound");
    this.settingsSoundText = $("settings-sound-text");
    this.btnResetBest = $("btn-reset-best");

    this.target = $("precision-target");
    this.aim = $("aim-reticle");
    this.comboLayer = $("combo-layer");
    this.flashEl = $("hit-flash");
    this.toastEl = $("toast");
  }

  _bindEvents() {
    const cb = this.callbacks;

    this.btnStart.addEventListener("click", () => cb.onStart?.());

    this.modeCards.forEach((card) => {
      card.addEventListener("click", () => {
        const mode = card.dataset.mode;
        if (!mode) return;
        this.setMode(mode);
        cb.onModeChange?.(mode);
      });
    });

    this.dropzone.addEventListener("click", () => this.openPhotoPicker());
    this.dropzone.addEventListener("keydown", (event) => {
      if (event.code === "Enter" || event.code === "Space") {
        event.preventDefault();
        this.openPhotoPicker();
      }
    });

    this.photoInput.addEventListener("change", () => {
      const file = this.photoInput.files?.[0];
      this.photoInput.value = "";
      if (file) cb.onPhotoFile?.(file);
    });

    this.dropzone.addEventListener("dragover", (event) => {
      event.preventDefault();
      this.dropzone.classList.add("is-dragover");
    });
    this.dropzone.addEventListener("dragleave", () => {
      this.dropzone.classList.remove("is-dragover");
    });
    this.dropzone.addEventListener("drop", (event) => {
      event.preventDefault();
      this.dropzone.classList.remove("is-dragover");
      const file = event.dataTransfer?.files?.[0];
      if (file) cb.onPhotoFile?.(file);
    });

    // Stop the browser from navigating when a file is dropped anywhere else.
    window.addEventListener("dragover", (event) => event.preventDefault());
    window.addEventListener("drop", (event) => event.preventDefault());

    this.photoModeButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const mode = button.dataset.photoMode;
        if (!mode) return;
        this.setPhotoMode(mode);
        cb.onPhotoModeChange?.(mode);
      });
    });

    this.durationButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const seconds = Number(button.dataset.duration);
        if (!Number.isFinite(seconds)) return;
        this.setDuration(seconds);
        cb.onDurationChange?.(seconds);
      });
    });

    this.btnRemovePhoto.addEventListener("click", () => cb.onRemovePhoto?.());
    this.btnPause.addEventListener("click", () => cb.onPause?.());
    this.btnMute.addEventListener("click", () => cb.onToggleMute?.());
    this.settingsSound.addEventListener("click", () => cb.onToggleMute?.());
    this.btnLang.addEventListener("click", () => cb.onToggleLanguage?.());

    this.settingsLanguageButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const lang = button.dataset.lang;
        if (lang === "zh" || lang === "en") cb.onSetLanguage?.(lang);
      });
    });

    this.btnSettings.addEventListener("click", () => {
      cb.onOpenSettings?.();
      this.showSettings();
    });
    this.btnSettingsClose.addEventListener("click", () => this.closeSettings());
    this.settingsBackdrop.addEventListener("click", () => this.closeSettings());

    this.btnResume.addEventListener("click", () => cb.onResume?.());
    this.btnRestart.addEventListener("click", () => cb.onRestart?.());
    this.btnEndRound.addEventListener("click", () => cb.onEndRound?.());
    this.btnQuit.addEventListener("click", () => cb.onQuit?.());

    this.btnReplay.addEventListener("click", () => cb.onReplay?.());
    this.btnChangeMode.addEventListener("click", () => cb.onChangeMode?.());
    this.btnChangePhoto.addEventListener("click", () => cb.onChangePhoto?.());

    this.btnResetBest.addEventListener("click", () => this._handleResetBest());

    window.addEventListener("keydown", (event) => {
      if (event.code === "Escape" && this.settingsOpen) {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.closeSettings();
      }
    });
  }

  /* ── Language ────────────────────────────────────────────────────────── */

  setLanguage(lang) {
    this.lang = lang === "zh" ? "zh" : "en";
    applyTranslations(this.lang, document);

    this.btnLangText.textContent = this.lang === "zh" ? "EN" : "中";
    this.settingsLanguageButtons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.lang === this.lang);
    });

    this.setMuted(this.muted);
    this.disarmReset();

    this._renderHudMode();
    if (this.lastResult) this.renderResult(this.lastResult);
  }

  /** HUD uses short mode labels when space is tight. */
  _renderHudMode() {
    if (!this.hudMode) return;
    const key =
      window.innerWidth <= 430
        ? `mode.${this.modeId}.short`
        : `mode.${this.modeId}.name`;
    this.hudMode.textContent = t(this.lang, key);
  }

  /* ── Settings controls ───────────────────────────────────────────────── */

  setMuted(muted) {
    this.muted = Boolean(muted);
    this.btnMute.classList.toggle("is-muted", this.muted);
    this.btnMute.setAttribute("aria-pressed", String(this.muted));
    this.btnMute.setAttribute(
      "title",
      t(this.lang, this.muted ? "hud.unmute" : "hud.mute"),
    );
    this.btnMute.setAttribute(
      "aria-label",
      t(this.lang, this.muted ? "hud.unmute" : "hud.mute"),
    );

    this.settingsSound.setAttribute("aria-pressed", String(!this.muted));
    this.settingsSoundText.textContent = t(
      this.lang,
      this.muted ? "settings.soundOff" : "settings.soundOn",
    );
  }

  setMode(modeId) {
    this.modeId = modeId;
    this.modeCards.forEach((card) => {
      card.classList.toggle("is-active", card.dataset.mode === modeId);
    });
    const mode = getMode(modeId);
    this.durationField.classList.toggle("is-hidden", mode.id !== "timeAttack");
    this._renderHudMode();
  }

  setDuration(seconds) {
    this.durationButtons.forEach((button) => {
      button.classList.toggle("is-active", Number(button.dataset.duration) === Number(seconds));
    });
  }

  setPhotoMode(mode) {
    this.photoModeButtons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.photoMode === mode);
    });
  }

  /* ── Photo preview ───────────────────────────────────────────────────── */

  showPhotoPreview(source) {
    const canvas = this.photoPreview;
    const ctx = this.previewCtx;
    const size = canvas.width;
    const sw = source.width || source.naturalWidth || 1;
    const sh = source.height || source.naturalHeight || 1;

    ctx.clearRect(0, 0, size, size);
    const scale = Math.max(size / sw, size / sh);
    const dw = sw * scale;
    const dh = sh * scale;
    ctx.drawImage(source, (size - dw) / 2, (size - dh) / 2, dw, dh);

    canvas.hidden = false;
    this.photoEmpty.hidden = true;
    this.photoChangeBadge.classList.remove("is-hidden");
    this.btnRemovePhoto.classList.remove("is-hidden");
  }

  clearPhotoPreview() {
    this.previewCtx.clearRect(0, 0, this.photoPreview.width, this.photoPreview.height);
    this.photoPreview.hidden = true;
    this.photoEmpty.hidden = false;
    this.photoChangeBadge.classList.add("is-hidden");
    this.btnRemovePhoto.classList.add("is-hidden");
  }

  openPhotoPicker() {
    this.photoInput.value = "";
    this.photoInput.click();
  }

  /* ── Screens ─────────────────────────────────────────────────────────── */

  showMenu() {
    this.screenMenu.classList.remove("is-hidden");
    this.screenResult.classList.add("is-hidden");
    this.screenPause.classList.add("is-hidden");
    this.hideTarget();
    this.hideAim();
    this.hideSettings();

    this.hud.classList.remove("is-hidden");
    this.hud.classList.add("is-minimal");
    this.hudTimerWrap.classList.add("is-hidden");
    this.hudComboWrap.classList.add("is-hidden");
    this.hudScoreWrap.classList.add("is-hidden");
    this.currentMode = null;
    this.lastResult = null;
    this._lastHud = {};
    this.screenMenu.scrollTop = 0;
  }

  showGame(modeOrId) {
    const mode = typeof modeOrId === "string" ? getMode(modeOrId) : modeOrId;
    this.currentMode = mode;
    this.modeId = mode.id;

    this.screenMenu.classList.add("is-hidden");
    this.screenResult.classList.add("is-hidden");
    this.screenPause.classList.add("is-hidden");
    this.hideSettings();

    this.hud.classList.remove("is-hidden", "is-minimal");
    this._renderHudMode();
    this.hudTimerWrap.classList.toggle("is-hidden", !mode.showTimer);
    this.hudComboWrap.classList.toggle("is-hidden", !mode.showCombo);
    this.hudScoreWrap.classList.toggle("is-hidden", !mode.showScore);

    this._lastHud = {};
    this.lastResult = null;
    this.setCombo(0);
    this.setScore(0);
    this.hudTimer.textContent = formatTime(0);
    this.hudTimer.classList.remove("is-danger");
  }

  showResult(data) {
    this.lastResult = data;
    this.screenMenu.classList.add("is-hidden");
    this.screenResult.classList.remove("is-hidden");
    this.screenPause.classList.add("is-hidden");
    this.hud.classList.add("is-hidden");
    this.hideTarget();
    this.hideAim();
    this.renderResult(data);
    this.screenResult.scrollTop = 0;
  }

  renderResult(data) {
    const mode = getMode(data.modeId);
    this.resultMode.textContent = t(this.lang, `mode.${mode.id}.name`);
    this.resultTitle.textContent = t(this.lang, "result.title");
    this.resultNewBest.classList.toggle("is-hidden", !data.isNewBest);
    this.resultScore.textContent = formatNumber(data.score);
    this.statCombo.textContent = formatNumber(data.maxCombo);
    this.statHits.textContent = formatNumber(data.hits);
    this.statBest.textContent = formatNumber(data.best);
  }

  showPause(canEndRound = true) {
    this.screenPause.classList.remove("is-hidden");
    this.btnEndRound.classList.toggle("is-hidden", !canEndRound);
    this.hideTarget();
    this.hideAim();
  }

  hidePause() {
    this.screenPause.classList.add("is-hidden");
  }

  showSettings() {
    this.settingsOpen = true;
    this.settingsBackdrop.classList.remove("is-hidden");
    this.settingsSheet.classList.remove("is-hidden");
  }

  hideSettings() {
    this.settingsOpen = false;
    this.settingsBackdrop.classList.add("is-hidden");
    this.settingsSheet.classList.add("is-hidden");
  }

  closeSettings() {
    this.hideSettings();
    this.callbacks.onCloseSettings?.();
  }

  /* ── HUD ─────────────────────────────────────────────────────────────── */

  setScore(score) {
    const text = formatNumber(score);
    if (this._lastHud.score !== text) {
      this._lastHud.score = text;
      this.hudScore.textContent = text;
    }
  }

  setCombo(combo) {
    const text = `×${combo}`;
    const previous = this._lastHud.combo;
    this._lastHud.combo = combo;

    if (previous !== combo) {
      this.hudCombo.textContent = text;
      this.hudCombo.classList.toggle("is-hot", combo >= 10);
      if (combo > (previous || 0)) {
        this.hudCombo.classList.remove("combo-bump");
        void this.hudCombo.offsetWidth;
        this.hudCombo.classList.add("combo-bump");
      }
    }
  }

  updateHUD({ timeLeft = 0, score = 0, combo = 0 } = {}) {
    const mode = this.currentMode;
    if (!mode) return;

    if (mode.showTimer) {
      const timerText = formatTime(timeLeft);
      if (this._lastHud.timer !== timerText) {
        this._lastHud.timer = timerText;
        this.hudTimer.textContent = timerText;
      }
      const danger = timeLeft <= 10;
      if (this._lastHud.danger !== danger) {
        this._lastHud.danger = danger;
        this.hudTimer.classList.toggle("is-danger", danger);
      }
    }
    if (mode.showScore) this.setScore(score);
    if (mode.showCombo) this.setCombo(combo);
  }

  /* ── In-world overlays ───────────────────────────────────────────────── */

  showTarget(x, y, radius) {
    const size = Math.max(24, radius * 2);
    this.target.style.width = `${size}px`;
    this.target.style.height = `${size}px`;
    this.target.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
    this.target.classList.remove("is-hidden");
  }

  hideTarget() {
    this.target.classList.add("is-hidden");
  }

  showAim(x, y) {
    this.aim.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
    this.aim.classList.remove("is-hidden");
  }

  hideAim() {
    this.aim.classList.add("is-hidden");
  }

  /* ── Toast ───────────────────────────────────────────────────────────── */

  toast(message, { error = false, duration = 2800 } = {}) {
    if (!message) return;
    window.clearTimeout(this._toastTimer);
    this.toastEl.textContent = message;
    this.toastEl.classList.toggle("is-error", error);
    this.toastEl.classList.add("is-visible");
    this._toastTimer = window.setTimeout(() => {
      this.toastEl.classList.remove("is-visible");
    }, duration);
  }

  /* ── Misc ────────────────────────────────────────────────────────────── */

  _handleResetBest() {
    if (!this.resetArmed) {
      this.resetArmed = true;
      this.btnResetBest.textContent = t(this.lang, "settings.resetConfirm");
      this.btnResetBest.classList.add("is-armed");
      window.clearTimeout(this._resetTimer);
      this._resetTimer = window.setTimeout(() => this.disarmReset(), 3200);
      return;
    }
    this.disarmReset();
    this.callbacks.onResetBest?.();
  }

  disarmReset() {
    this.resetArmed = false;
    window.clearTimeout(this._resetTimer);
    if (this.btnResetBest) {
      this.btnResetBest.textContent = t(this.lang, "settings.resetBest");
      this.btnResetBest.classList.remove("is-armed");
    }
  }
}
