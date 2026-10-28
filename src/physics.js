/**
 * physics.js — hand-written spring/damper model for the punching bag.
 *
 * The bag is modelled as:
 *   • a pendulum pivot with two angular springs (X = front/back, Z = left/right)
 *   • a squash spring on the bag body
 *
 * No cannon-es / ammo. Explicit Euler with fixed sub-steps is plenty here and
 * keeps the response snappy and tunable. All magic numbers are in TUNING below.
 */

export const TUNING = Object.freeze({
  // Pendulum (pivot) ──────────────────────────────────────────────────────
  // ω = sqrt(SWING_STIFFNESS) ≈ 5.1 rad/s. Damping ratio ≈ 0.23 → a few
  // visible overshoots before settling.
  SWING_STIFFNESS: 26,
  SWING_DAMPING: 2.35,
  SWING_IMPULSE: 1.95,
  SWING_MAX: 0.72, // radians; hard safety clamp
  KICKBACK_BASE: 0.62, // every punch pushes the bag away a little
  KICKBACK_VERTICAL: 0.72, // uppercuts push harder
  LATERAL_GAIN: 1.15,

  // Squash (body) ─────────────────────────────────────────────────────────
  // Fast spring: recovers in roughly 0.25–0.35 s.
  SQUASH_STIFFNESS: 300,
  SQUASH_DAMPING: 17,
  SQUASH_IMPULSE: 20,
  SQUASH_MIN: -0.32, // slight stretch on rebound
  SQUASH_MAX: 1.5,
  // Scale mapping: squash 1.0 → Y * 0.85, XZ * 1.09 (roughly volume-neutral).
  SQUASH_SCALE_Y: 0.15,
  SQUASH_SCALE_XZ: 0.09,

  // Integration ───────────────────────────────────────────────────────────
  FIXED_STEP: 1 / 120,
  MAX_STEPS: 6,
});

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export class BagPhysics {
  constructor(tuning = TUNING) {
    this.tuning = tuning;
    this.reset();
  }

  reset() {
    this.angX = 0; // front/back pivot angle (positive pushes bag away from camera)
    this.angZ = 0; // left/right pivot angle (positive pushes bag to screen-right)
    this.velX = 0;
    this.velZ = 0;
    this.squash = 0;
    this.squashVel = 0;
    this.lastImpulse = 0;
  }

  /**
   * Apply the impulse of a hit.
   * @param {object} hit
   * @param {number} hit.strength 0.3 .. 1.5
   * @param {{x:number,y:number}} hit.direction screen-space punch direction
   *        x: right positive, y: up positive
   */
  punch({ strength = 0.6, direction = { x: 0, y: 0 } } = {}) {
    const t = this.tuning;
    const s = clamp(strength, 0.3, 1.5);
    const dx = clamp(Number(direction?.x) || 0, -1, 1);
    const dy = clamp(Number(direction?.y) || 0, -1, 1);

    // A straight punch always pushes the bag away from the camera. An upward
    // motion adds more of that forward/back rotation (uppercut feel).
    this.velX += s * t.SWING_IMPULSE * (t.KICKBACK_BASE + t.KICKBACK_VERTICAL * Math.max(0, dy));
    // Lateral component makes the bag swing left/right.
    this.velZ += s * t.SWING_IMPULSE * t.LATERAL_GAIN * dx;

    // Body compression.
    this.squashVel += s * t.SQUASH_IMPULSE;

    this.lastImpulse = s;
    this._clampAngles();
    return this.state;
  }

  step(dt) {
    // Clamp the frame delta; tab switches can produce giant deltas.
    dt = clamp(dt, 0, 1 / 20);
    if (dt <= 0) return this.state;

    const t = this.tuning;
    const count = Math.min(t.MAX_STEPS, Math.max(1, Math.ceil(dt / t.FIXED_STEP)));
    const h = dt / count;

    for (let i = 0; i < count; i += 1) {
      // Pendulum axes: a = -k*x - c*v
      const ax = -t.SWING_STIFFNESS * this.angX - t.SWING_DAMPING * this.velX;
      const az = -t.SWING_STIFFNESS * this.angZ - t.SWING_DAMPING * this.velZ;
      this.velX += ax * h;
      this.velZ += az * h;
      this.angX += this.velX * h;
      this.angZ += this.velZ * h;

      // Squash spring
      const asq =
        -t.SQUASH_STIFFNESS * this.squash - t.SQUASH_DAMPING * this.squashVel;
      this.squashVel += asq * h;
      this.squash += this.squashVel * h;

      this._clampAngles();
      this._clampSquash();
    }

    return this.state;
  }

  _clampAngles() {
    const max = this.tuning.SWING_MAX;
    if (this.angX > max) {
      this.angX = max;
      if (this.velX > 0) this.velX *= -0.12;
    } else if (this.angX < -max) {
      this.angX = -max;
      if (this.velX < 0) this.velX *= -0.12;
    }
    if (this.angZ > max) {
      this.angZ = max;
      if (this.velZ > 0) this.velZ *= -0.12;
    } else if (this.angZ < -max) {
      this.angZ = -max;
      if (this.velZ < 0) this.velZ *= -0.12;
    }
  }

  _clampSquash() {
    if (this.squash > this.tuning.SQUASH_MAX) {
      this.squash = this.tuning.SQUASH_MAX;
      if (this.squashVel > 0) this.squashVel *= -0.1;
    } else if (this.squash < this.tuning.SQUASH_MIN) {
      this.squash = this.tuning.SQUASH_MIN;
      if (this.squashVel < 0) this.squashVel *= -0.1;
    }
  }

  get state() {
    return {
      angX: this.angX,
      angZ: this.angZ,
      velX: this.velX,
      velZ: this.velZ,
      squash: this.squash,
      scaleY: 1 - this.squash * this.tuning.SQUASH_SCALE_Y,
      scaleXZ: 1 + this.squash * this.tuning.SQUASH_SCALE_XZ,
    };
  }
}
