/**
 * input.js — one unifed input layer for mouse, touch and keyboard.
 * Everything funnels into onHit({ point, local, strength, direction, source }).
 */

import * as THREE from "three";

const HIT_COOLDOWN_MS = 80;
const HOLD_DELAY_MS = 250;
const HOLD_INTERVAL_MS = 155;
const SWIPE_START_DISTANCE = 11;
const SWIPE_HIT_DISTANCE = 30;
const SWIPE_HIT_INTERVAL_MS = 95;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export class InputController {
  constructor({ element, camera, bag, onHit, onPause, onAimChange }) {
    this.element = element;
    this.camera = camera;
    this.bag = bag;
    this.onHit = onHit;
    this.onPause = onPause;
    this.onAimChange = onAimChange;

    this.enabled = false;
    this.pointer = null;
    this.lastHitAt = 0;

    this.aimX = 0;
    this.aimY = 0.06;
    this.lastKeyboardAt = 0;
    this.lastSource = "pointer";

    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 30;
    this.ndc = new THREE.Vector2();
    this._local = new THREE.Vector3();
    this._world = new THREE.Vector3();

    this._onPointerDown = this._handlePointerDown.bind(this);
    this._onPointerMove = this._handlePointerMove.bind(this);
    this._onPointerUp = this._handlePointerUp.bind(this);
    this._onPointerCancel = this._handlePointerUp.bind(this);
    this._onKeyDown = this._handleKeyDown.bind(this);
    this._onBlur = this._handleBlur.bind(this);
    this._onContextMenu = (event) => event.preventDefault();

    element.addEventListener("pointerdown", this._onPointerDown, { passive: false });
    element.addEventListener("pointermove", this._onPointerMove, { passive: false });
    element.addEventListener("pointerup", this._onPointerUp);
    element.addEventListener("pointercancel", this._onPointerCancel);
    element.addEventListener("lostpointercapture", this._onPointerUp);
    element.addEventListener("contextmenu", this._onContextMenu);
    window.addEventListener("keydown", this._onKeyDown);
    window.addEventListener("blur", this._onBlur);
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (!this.enabled) {
      this.pointer = null;
      this.element.style.cursor = "default";
    } else {
      this.element.style.cursor = "crosshair";
    }
  }

  resetAim() {
    this.aimX = 0;
    this.aimY = 0.06;
    this.onAimChange?.(this.aimX, this.aimY);
  }

  /* ── Pointer ─────────────────────────────────────────────────────────── */

  _handlePointerDown(event) {
    if (!this.enabled) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;

    event.preventDefault();
    try {
      this.element.setPointerCapture(event.pointerId);
    } catch {
      /* ignore capture failures */
    }

    this.aimX = 0;
    this.aimY = 0.06;

    const x = event.clientX;
    const y = event.clientY;
    this.pointer = {
      id: event.pointerId,
      startX: x,
      startY: y,
      lastX: x,
      lastY: y,
      downAt: performance.now(),
      lastMoveAt: performance.now(),
      lastSwipeAt: 0,
      moved: false,
      movedDistance: 0,
    };

    const hit = this._raycast(x, y);
    if (!hit) return;

    this.aimX = clamp((hit.local.x / this.bag.radius) * 0.8, -1, 1);
    this.aimY = clamp((hit.local.y - this.bag.centerY) / 1.25, -1, 1);

    this._emit({
      hit,
      strength: 0.62,
      direction: this._directionFromPoint(hit.local, 0.35),
      source: "pointer",
    });
  }

  _handlePointerMove(event) {
    if (!this.enabled || !this.pointer || event.pointerId !== this.pointer.id) return;

    const pointer = this.pointer;
    const x = event.clientX;
    const y = event.clientY;
    const now = performance.now();
    const dx = x - pointer.lastX;
    const dy = y - pointer.lastY;
    const stepDistance = Math.hypot(dx, dy);
    const totalDistance = Math.hypot(x - pointer.startX, y - pointer.startY);

    if (totalDistance > SWIPE_START_DISTANCE) pointer.moved = true;

    if (pointer.moved && stepDistance > 0.5) {
      event.preventDefault();
      pointer.movedDistance += stepDistance;

      const elapsed = Math.max(8, now - pointer.lastMoveAt);
      const speed = stepDistance / elapsed; // px / ms
      const strength = clamp(0.5 + speed * 0.35, 0.3, 1.5);

      if (
        now - pointer.lastSwipeAt >= SWIPE_HIT_INTERVAL_MS &&
        pointer.movedDistance >= SWIPE_HIT_DISTANCE
      ) {
        const hit = this._raycast(x, y);
        if (hit) {
          const len = Math.max(0.001, Math.hypot(x - pointer.startX, y - pointer.startY));
          const direction = {
            x: clamp((x - pointer.startX) / len, -1, 1),
            y: clamp(-(y - pointer.startY) / len, -1, 1),
          };
          const didHit = this._emit({
            hit,
            strength,
            direction,
            source: "pointer",
          });
          if (didHit) {
            pointer.lastSwipeAt = now;
            pointer.movedDistance = 0;
            this.aimX = clamp((hit.local.x / this.bag.radius) * 0.8, -1, 1);
            this.aimY = clamp((hit.local.y - this.bag.centerY) / 1.25, -1, 1);
          }
        }
      }
    }

    pointer.lastX = x;
    pointer.lastY = y;
    pointer.lastMoveAt = now;
  }

  _handlePointerUp(event) {
    if (!this.pointer) return;
    if (event.pointerId !== undefined && event.pointerId !== this.pointer.id) return;
    try {
      this.element.releasePointerCapture(this.pointer.id);
    } catch {
      /* ignore */
    }
    this.pointer = null;
  }

  _handleBlur() {
    this.pointer = null;
  }

  /* ── Keyboard ────────────────────────────────────────────────────────── */

  _handleKeyDown(event) {
    const target = event.target;
    if (target instanceof HTMLElement) {
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) {
        return;
      }
    }

    if (event.code === "Escape") {
      // Let the app decide: playing → pause, paused → resume, other states no-op.
      event.preventDefault();
      this.onPause?.();
      return;
    }

    if (!this.enabled) return;

    if (event.code === "ArrowLeft" || event.code === "ArrowRight") {
      event.preventDefault();
      this.aimX = clamp(this.aimX + (event.code === "ArrowRight" ? 0.22 : -0.22), -1, 1);
      this.lastKeyboardAt = performance.now();
      this.lastSource = "keyboard";
      this.onAimChange?.(this.aimX, this.aimY);
      return;
    }

    if (event.code === "ArrowUp" || event.code === "ArrowDown") {
      event.preventDefault();
      this.aimY = clamp(this.aimY + (event.code === "ArrowUp" ? 0.2 : -0.2), -1, 1);
      this.lastKeyboardAt = performance.now();
      this.lastSource = "keyboard";
      this.onAimChange?.(this.aimX, this.aimY);
      return;
    }

    let strength = 0;
    if (event.code === "KeyJ") strength = 0.74;
    else if (event.code === "KeyK") strength = 0.96;
    else if (event.code === "Space") strength = 1.18;
    else return;

    event.preventDefault();
    const now = performance.now();
    if (now - this.lastHitAt < HIT_COOLDOWN_MS) return;

    const local = this.bag.getAimPoint(this.aimX, this.aimY);
    const world = this.bag.localToWorld(local);
    this.aimX = clamp(this.aimX, -1, 1);
    this.lastKeyboardAt = now;
    this.lastSource = "keyboard";

    const hit = { world, local, screen: null };
    this._emit({
      hit,
      strength: clamp(strength + (Math.random() - 0.5) * 0.08, 0.3, 1.5),
      direction: {
        x: this.aimX * 0.85,
        y: 0.32 + this.aimY * 0.58,
      },
      source: "keyboard",
    });
  }

  /* ── Shared ──────────────────────────────────────────────────────────── */

  _raycast(clientX, clientY) {
    this.ndc.set(
      (clientX / Math.max(1, window.innerWidth)) * 2 - 1,
      -(clientY / Math.max(1, window.innerHeight)) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const intersections = this.raycaster.intersectObjects(this.bag.hitMeshes, false);
    if (!intersections.length) return null;

    const world = intersections[0].point.clone();
    const local = this.bag.worldToLocal(world);
    return { world, local, screen: { x: clientX, y: clientY } };
  }

  _directionFromPoint(local, randomness = 0.3) {
    const x = (local.x / this.bag.radius) * 0.9 + (Math.random() - 0.5) * randomness;
    const y =
      ((local.y - this.bag.centerY) / 1.3) * 0.55 + (Math.random() - 0.5) * randomness * 0.7;
    return { x: clamp(x, -1, 1), y: clamp(y, -1, 1) };
  }

  _emit({ hit, strength, direction, source }) {
    const now = performance.now();
    if (now - this.lastHitAt < HIT_COOLDOWN_MS) return false;
    this.lastHitAt = now;
    this.lastSource = source;

    this.onHit?.({
      point: hit.world,
      local: hit.local,
      screen: hit.screen,
      strength,
      direction,
      source,
    });
    return true;
  }

  /** Called each animation frame; handles press-and-hold rapid jabs. */
  update(now) {
    if (!this.enabled || !this.pointer) return;
    const pointer = this.pointer;
    if (pointer.moved) return;

    if (now - pointer.downAt < HOLD_DELAY_MS) return;
    if (now - this.lastHitAt < HOLD_INTERVAL_MS) return;

    const hit = this._raycast(pointer.lastX, pointer.lastY);
    if (!hit) return;

    this._emit({
      hit,
      strength: 0.52 + Math.random() * 0.16,
      direction: this._directionFromPoint(hit.local, 0.45),
      source: "pointer",
    });
  }

  isKeyboardAiming(now = performance.now()) {
    return this.enabled && now - this.lastKeyboardAt < 2600;
  }

  destroy() {
    this.element.removeEventListener("pointerdown", this._onPointerDown);
    this.element.removeEventListener("pointermove", this._onPointerMove);
    this.element.removeEventListener("pointerup", this._onPointerUp);
    this.element.removeEventListener("pointercancel", this._onPointerCancel);
    this.element.removeEventListener("lostpointercapture", this._onPointerUp);
    this.element.removeEventListener("contextmenu", this._onContextMenu);
    window.removeEventListener("keydown", this._onKeyDown);
    window.removeEventListener("blur", this._onBlur);
  }
}
