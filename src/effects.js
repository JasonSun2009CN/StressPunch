/**
 * effects.js — impact particles, punch-mark decals, hit numbers, screen flash.
 * All pools are capped so mid-range phones keep a steady frame rate.
 */

import * as THREE from "three";

const MAX_PARTICLES = 300;
const MAX_MARKS = 20;
const MARK_LIFETIME = 3;
const MARK_SIZE = 0.29;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/* ── Impact particle shader ─────────────────────────────────────────────── */

const PARTICLE_VERTEX = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  uniform float uScale;
  varying float vAlpha;
  varying vec3 vColor;

  void main() {
    vAlpha = aAlpha;
    vColor = aColor;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = max(1.0, aSize * uScale / max(0.1, -mvPosition.z));
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const PARTICLE_FRAGMENT = /* glsl */ `
  varying float vAlpha;
  varying vec3 vColor;

  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;
    float soft = smoothstep(0.5, 0.06, d);
    gl_FragColor = vec4(vColor, vAlpha * soft);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

class ParticleBurst {
  constructor(scene) {
    this.scene = scene;
    this.cursor = 0;
    this.geometry = new THREE.BufferGeometry();

    this.positions = new Float32Array(MAX_PARTICLES * 3);
    this.colors = new Float32Array(MAX_PARTICLES * 3);
    this.alphas = new Float32Array(MAX_PARTICLES);
    this.sizes = new Float32Array(MAX_PARTICLES);

    this.geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage),
    );
    this.geometry.setAttribute(
      "aColor",
      new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage),
    );
    this.geometry.setAttribute(
      "aAlpha",
      new THREE.BufferAttribute(this.alphas, 1).setUsage(THREE.DynamicDrawUsage),
    );
    this.geometry.setAttribute(
      "aSize",
      new THREE.BufferAttribute(this.sizes, 1).setUsage(THREE.DynamicDrawUsage),
    );

    this.material = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 1000 } },
      vertexShader: PARTICLE_VERTEX,
      fragmentShader: PARTICLE_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);

    this.data = Array.from({ length: MAX_PARTICLES }, () => ({
      life: 0,
      maxLife: 1,
      vx: 0,
      vy: 0,
      vz: 0,
      size: 0,
      baseAlpha: 1,
    }));

    this._color = new THREE.Color();
  }

  setViewport(height, fov) {
    // Convert world-space particle size → pixels at a given depth.
    const scale = height / (2 * Math.tan((fov * Math.PI) / 360));
    this.material.uniforms.uScale.value = scale;
  }

  spawn(origin, strength) {
    const count = Math.min(34, Math.round(16 + strength * 12));
    const s = clamp(strength, 0.3, 1.5);

    for (let n = 0; n < count; n += 1) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % MAX_PARTICLES;

      const data = this.data[i];
      const i3 = i * 3;

      this.positions[i3] = origin.x + (Math.random() - 0.5) * 0.06;
      this.positions[i3 + 1] = origin.y + (Math.random() - 0.5) * 0.06;
      this.positions[i3 + 2] = origin.z + (Math.random() - 0.5) * 0.06;

      const angle = Math.random() * Math.PI * 2;
      const spread = 0.5 + Math.random() * 1.6;
      data.vx = Math.cos(angle) * spread * (1.2 + s * 1.2);
      data.vy = Math.sin(angle) * spread * (0.8 + s * 1.1) + 0.8 + Math.random() * 1.6;
      data.vz = 0.7 + Math.random() * (1.2 + s * 1.4);

      data.maxLife = 0.32 + Math.random() * 0.5;
      data.life = data.maxLife;
      data.size = 0.018 + Math.random() * 0.045;
      data.baseAlpha = 0.65 + Math.random() * 0.35;

      // White-hot core, amber/orange sparks.
      const r = Math.random();
      if (r < 0.36) {
        this._color.setRGB(1, 0.96, 0.86);
      } else if (r < 0.82) {
        this._color.setRGB(1, 0.62 + Math.random() * 0.2, 0.22);
      } else {
        this._color.setRGB(1, 0.25 + Math.random() * 0.2, 0.15);
      }
      this.colors[i3] = this._color.r;
      this.colors[i3 + 1] = this._color.g;
      this.colors[i3 + 2] = this._color.b;

      this.sizes[i] = data.size;
      this.alphas[i] = data.baseAlpha;
    }

    this._flush();
  }

  update(dt) {
    let any = false;
    for (let i = 0; i < MAX_PARTICLES; i += 1) {
      const data = this.data[i];
      if (data.life <= 0) continue;
      any = true;

      data.life -= dt;
      if (data.life <= 0) {
        this.alphas[i] = 0;
        this.sizes[i] = 0;
        continue;
      }

      const i3 = i * 3;
      const drag = Math.exp(-2.2 * dt);
      data.vx *= drag;
      data.vz *= drag;
      data.vy = data.vy * drag - 6.2 * dt;

      this.positions[i3] += data.vx * dt;
      this.positions[i3 + 1] += data.vy * dt;
      this.positions[i3 + 2] += data.vz * dt;

      const t = data.life / data.maxLife;
      this.alphas[i] = data.baseAlpha * Math.pow(t, 0.75);
      this.sizes[i] = data.size * (0.55 + 0.45 * t);
    }

    if (any) this._flush();
  }

  _flush() {
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.aColor.needsUpdate = true;
    this.geometry.attributes.aAlpha.needsUpdate = true;
    this.geometry.attributes.aSize.needsUpdate = true;
  }

  clear() {
    for (let i = 0; i < MAX_PARTICLES; i += 1) {
      this.data[i].life = 0;
      this.alphas[i] = 0;
      this.sizes[i] = 0;
    }
    this._flush();
  }
}

/* ── Punch-mark decal pool ──────────────────────────────────────────────── */

function makeMarkTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const c = size / 2;

  const g = ctx.createRadialGradient(c, c, 4, c, c, c - 4);
  g.addColorStop(0, "rgba(255, 244, 230, 0.98)");
  g.addColorStop(0.12, "rgba(255, 205, 175, 0.82)");
  g.addColorStop(0.32, "rgba(255, 120, 82, 0.52)");
  g.addColorStop(0.58, "rgba(170, 40, 34, 0.3)");
  g.addColorStop(0.8, "rgba(80, 15, 15, 0.12)");
  g.addColorStop(1, "rgba(40, 5, 5, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  // Impact ring
  ctx.beginPath();
  ctx.arc(c, c, size * 0.31, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255, 226, 206, 0.5)";
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Cracks
  ctx.lineCap = "round";
  for (let i = 0; i < 9; i += 1) {
    const angle = (i / 9) * Math.PI * 2 + Math.random() * 0.3;
    const inner = size * (0.18 + Math.random() * 0.08);
    const outer = size * (0.32 + Math.random() * 0.13);
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(angle) * inner, c + Math.sin(angle) * inner);
    ctx.quadraticCurveTo(
      c + Math.cos(angle + 0.1) * outer * 0.7,
      c + Math.sin(angle + 0.1) * outer * 0.7,
      c + Math.cos(angle) * outer,
      c + Math.sin(angle) * outer,
    );
    ctx.strokeStyle = i % 2 ? "rgba(70, 12, 10, 0.42)" : "rgba(255, 232, 214, 0.5)";
    ctx.lineWidth = 1.2 + Math.random() * 1.6;
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

class MarkPool {
  constructor(bag) {
    this.bag = bag;
    this.entries = [];
    this.cursor = 0;

    this.texture = makeMarkTexture();
    this.geometry = new THREE.PlaneGeometry(MARK_SIZE, MARK_SIZE);

    const parent = bag.deform;
    for (let i = 0; i < MAX_MARKS; i += 1) {
      const material = new THREE.MeshBasicMaterial({
        map: this.texture,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        toneMapped: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });
      const mesh = new THREE.Mesh(this.geometry, material);
      mesh.visible = false;
      mesh.renderOrder = 3;
      parent.add(mesh);
      this.entries.push({ mesh, life: 0, maxLife: MARK_LIFETIME, strength: 1 });
    }

    this._up = new THREE.Vector3(0, 1, 0);
    this._normal = new THREE.Vector3();
    this._tangent = new THREE.Vector3();
    this._bitangent = new THREE.Vector3();
    this._basis = new THREE.Matrix4();
    this._pos = new THREE.Vector3();
  }

  add(localPoint, strength) {
    const entry = this.entries[this.cursor];
    this.cursor = (this.cursor + 1) % this.entries.length;

    const normal = this.bag.getSurfaceNormal(localPoint);
    this._normal.copy(normal);
    this._tangent.crossVectors(this._up, this._normal);
    if (this._tangent.lengthSq() < 1e-5) this._tangent.set(1, 0, 0);
    this._tangent.normalize();
    this._bitangent.crossVectors(this._normal, this._tangent).normalize();
    this._basis.makeBasis(this._tangent, this._bitangent, this._normal);

    const mesh = entry.mesh;
    this._pos.copy(localPoint).addScaledVector(this._normal, 0.02);
    mesh.position.copy(this._pos);
    mesh.quaternion.setFromRotationMatrix(this._basis);
    mesh.rotateZ(Math.random() * Math.PI * 2);

    const scale = 0.82 + Math.random() * 0.36 + clamp(strength - 0.6, -0.3, 0.9) * 0.22;
    mesh.scale.setScalar(scale);
    mesh.material.opacity = 0.92;
    mesh.visible = true;

    entry.life = MARK_LIFETIME;
    entry.strength = strength;
  }

  update(dt) {
    for (const entry of this.entries) {
      if (entry.life <= 0) continue;
      entry.life -= dt;
      if (entry.life <= 0) {
        entry.life = 0;
        entry.mesh.visible = false;
        entry.mesh.material.opacity = 0;
        continue;
      }
      // Hold full strength briefly, then fade out over the last 1.1 s.
      const fade = Math.min(1, entry.life / 1.1);
      entry.mesh.material.opacity = 0.92 * fade;
    }
  }

  clear() {
    for (const entry of this.entries) {
      entry.life = 0;
      entry.mesh.visible = false;
      entry.mesh.material.opacity = 0;
    }
  }
}

/* ── Public effects facade ──────────────────────────────────────────────── */

export class Effects {
  constructor({ scene, camera, bag, layer, flashEl }) {
    this.scene = scene;
    this.camera = camera;
    this.bag = bag;
    this.layer = layer;
    this.flashEl = flashEl;

    this.width = window.innerWidth;
    this.height = window.innerHeight;

    this.particles = new ParticleBurst(scene);
    this.marks = new MarkPool(bag);

    this._projected = new THREE.Vector3();
    this._flashTimer = 0;
  }

  setViewport(width, height, fov) {
    this.width = width;
    this.height = height;
    this.particles.setViewport(height, fov);
  }

  /**
   * Play all visual feedback for a hit.
   * @param {object} opts
   * @param {THREE.Vector3} opts.world      world-space hit point
   * @param {THREE.Vector3} opts.local      bag-local hit point
   * @param {number} opts.strength
   * @param {number} opts.combo
   * @param {number} opts.points            points awarded (negative for miss)
   * @param {boolean} opts.scored
   * @param {boolean} opts.miss
   * @param {string} [opts.label]           e.g. "PERFECT" / "MISS"
   */
  hit({ world, local, strength, combo, points, scored, miss, label }) {
    this.particles.spawn(world, strength);
    this.marks.add(local, strength);
    this.flash(strength);

    if (!scored) return;

    const screen = this._projectToScreen(world);
    if (!screen) return;

    // Keep the popup inside the viewport and below the HUD.
    const x = clamp(screen.x, 70, this.width - 70);
    const y = clamp(screen.y, 105, this.height - 70);

    const el = document.createElement("div");
    el.className = "hit-pop";
    if (miss) el.classList.add("is-miss");
    if (label && !miss) el.classList.add("is-perfect");

    const pointsEl = document.createElement("span");
    pointsEl.className = "hit-pop-points";
    if (miss) {
      pointsEl.textContent = String(points);
    } else {
      pointsEl.textContent = `+${points}`;
    }
    el.appendChild(pointsEl);

    if (combo >= 2) {
      const comboEl = document.createElement("span");
      comboEl.className = "hit-pop-combo";
      comboEl.textContent = `×${combo}`;
      el.appendChild(comboEl);
    }

    if (label) {
      const labelEl = document.createElement("span");
      labelEl.className = "hit-pop-combo";
      labelEl.textContent = label;
      el.appendChild(labelEl);
    }

    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.setProperty("--drift", `${(Math.random() * 2 - 1) * 34}px`);
    this.layer.appendChild(el);

    window.setTimeout(() => el.remove(), 780);
  }

  flash(strength) {
    if (!this.flashEl) return;
    this.flashEl.classList.remove("is-hit");
    // Force restart of the CSS animation.
    void this.flashEl.offsetWidth;
    this.flashEl.classList.add("is-hit");
  }

  _projectToScreen(world) {
    this._projected.copy(world).project(this.camera);
    if (this._projected.z > 1) return null;
    return {
      x: (this._projected.x * 0.5 + 0.5) * this.width,
      y: (-this._projected.y * 0.5 + 0.5) * this.height,
    };
  }

  update(dt) {
    this.particles.update(dt);
    this.marks.update(dt);
  }

  clear() {
    this.particles.clear();
    this.marks.clear();
    if (this.layer) this.layer.replaceChildren();
  }
}
