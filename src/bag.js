/**
 * bag.js — builds the 3D punching bag, composites the photo texture on a
 * curved front panel, and applies pendulum + squash deformation.
 *
 * Structure:
 *   pivot (position = ceiling attachment)
 *     └ deform (scale = squash; origin at bag top)
 *          ├ capsule body (leather)
 *          ├ curved photo panel (CanvasTexture)
 *          └ metal trim rings
 */

import * as THREE from "three";

const TEXTURE_SIZE = 1024;

export const BAG_GEOMETRY = Object.freeze({
  RADIUS: 0.62,
  CYLINDER_LENGTH: 1.95,
  CENTER_Y: -1.6,
  PANEL_RADIUS: 0.629,
  PANEL_HEIGHT: 1.96,
  PANEL_ARC: Math.PI, // half of the circumference, centred on the camera
  PIVOT_Y: 1.88,
});

export const BAG_RADIUS = BAG_GEOMETRY.RADIUS;
export const BAG_CENTER_Y = BAG_GEOMETRY.CENTER_Y;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/* ── Canvas helpers ─────────────────────────────────────────────────────── */

function roundedRectPath(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawCover(ctx, source, x, y, w, h) {
  const sw = source.width || source.naturalWidth || 1;
  const sh = source.height || source.naturalHeight || 1;
  if (!sw || !sh) return;
  const scale = Math.max(w / sw, h / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  ctx.drawImage(source, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function drawSpacedText(ctx, text, centerX, y, spacing) {
  const chars = Array.from(text);
  const widths = chars.map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((sum, w) => sum + w, 0) + spacing * Math.max(0, chars.length - 1);
  let x = centerX - total / 2;
  chars.forEach((ch, i) => {
    ctx.fillText(ch, x + widths[i] / 2, y);
    x += widths[i] + spacing;
  });
}

/* ── Procedural leather ─────────────────────────────────────────────────── */

function makeLeatherTextures() {
  const size = 512;
  const color = document.createElement("canvas");
  color.width = size;
  color.height = size;
  const c = color.getContext("2d");

  const base = c.createLinearGradient(0, 0, size, size);
  base.addColorStop(0, "#3c241d");
  base.addColorStop(0.45, "#301b16");
  base.addColorStop(1, "#231310");
  c.fillStyle = base;
  c.fillRect(0, 0, size, size);

  // Fine grain
  for (let i = 0; i < 4200; i += 1) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const a = 0.02 + Math.random() * 0.055;
    c.fillStyle = Math.random() > 0.55 ? `rgba(158, 101, 76, ${a})` : `rgba(0, 0, 0, ${a})`;
    c.fillRect(x, y, 1 + Math.random() * 1.4, 1 + Math.random() * 1.4);
  }

  // Long leather fibres
  c.lineCap = "round";
  for (let i = 0; i < 170; i += 1) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const len = 8 + Math.random() * 46;
    c.strokeStyle = `rgba(148, 92, 68, ${0.025 + Math.random() * 0.05})`;
    c.lineWidth = 0.6 + Math.random() * 1.1;
    c.beginPath();
    c.moveTo(x, y);
    c.quadraticCurveTo(x + len * 0.5, y + (Math.random() - 0.5) * 8, x + len, y + (Math.random() - 0.5) * 3);
    c.stroke();
  }

  // Soft vignette so repeats blend
  const vignette = c.createRadialGradient(size / 2, size / 2, size * 0.1, size / 2, size / 2, size * 0.7);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.22)");
  c.fillStyle = vignette;
  c.fillRect(0, 0, size, size);

  // Bump version
  const bump = document.createElement("canvas");
  bump.width = size;
  bump.height = size;
  const b = bump.getContext("2d");
  b.fillStyle = "#808080";
  b.fillRect(0, 0, size, size);
  for (let i = 0; i < 6000; i += 1) {
    const shade = Math.random() > 0.5 ? 255 : 0;
    b.fillStyle = `rgba(${shade},${shade},${shade},${0.02 + Math.random() * 0.06})`;
    b.fillRect(Math.random() * size, Math.random() * size, 1.4, 1.4);
  }
  for (let i = 0; i < 120; i += 1) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const len = 10 + Math.random() * 50;
    b.strokeStyle = `rgba(255,255,255,${0.02 + Math.random() * 0.04})`;
    b.lineWidth = 0.8;
    b.beginPath();
    b.moveTo(x, y);
    b.lineTo(x + len, y + (Math.random() - 0.5) * 4);
    b.stroke();
  }

  return { color, bump };
}

/* ── Bag class ──────────────────────────────────────────────────────────── */

export class PunchingBag {
  constructor(scene, renderer, { lang = "en", photoMode = "full" } = {}) {
    this.scene = scene;
    this.renderer = renderer;
    this.lang = lang;
    this.photoMode = photoMode === "portrait" ? "portrait" : "full";
    this.photoSource = null;

    this.pivot = new THREE.Group();
    this.pivot.position.set(0, BAG_GEOMETRY.PIVOT_Y, 0);
    this.pivot.name = "bag-pivot";
    scene.add(this.pivot);

    this.deform = new THREE.Group();
    this.deform.name = "bag-deform";
    this.pivot.add(this.deform);

    this.centerY = BAG_GEOMETRY.CENTER_Y;
    this.radius = BAG_GEOMETRY.RADIUS;

    this._buildTextureCanvas();
    this._buildMaterials();
    this._buildBag();
    this._buildRig();

    this.redrawTexture();
    this._fontReady = false;
    if (document.fonts?.ready) {
      document.fonts.ready
        .then(() => {
          this._fontReady = true;
          this.redrawTexture();
        })
        .catch(() => {});
    }
  }

  /* ── Texture prep ─────────────────────────────────────────────────────── */

  _buildTextureCanvas() {
    const leather = makeLeatherTextures();
    this.leatherCanvas = leather.color;
    this.leatherBumpCanvas = leather.bump;

    this.canvas = document.createElement("canvas");
    this.canvas.width = TEXTURE_SIZE;
    this.canvas.height = TEXTURE_SIZE;
    this.ctx = this.canvas.getContext("2d");

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    this.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = true;

    const bodyMap = new THREE.CanvasTexture(this.leatherCanvas);
    bodyMap.colorSpace = THREE.SRGBColorSpace;
    bodyMap.wrapS = THREE.RepeatWrapping;
    bodyMap.wrapT = THREE.RepeatWrapping;
    bodyMap.repeat.set(2.2, 1.4);
    bodyMap.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());

    const bodyBump = new THREE.CanvasTexture(this.leatherBumpCanvas);
    bodyBump.wrapS = THREE.RepeatWrapping;
    bodyBump.wrapT = THREE.RepeatWrapping;
    bodyBump.repeat.set(2.2, 1.4);
    bodyBump.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());

    this.bodyMap = bodyMap;
    this.bodyBump = bodyBump;
  }

  _buildMaterials() {
    this.leatherMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.bodyMap,
      bumpMap: this.bodyBump,
      bumpScale: 0.028,
      roughness: 0.68,
      metalness: 0.06,
    });

    this.panelMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.texture,
      emissive: 0xffffff,
      emissiveMap: this.texture,
      emissiveIntensity: 0.13,
      roughness: 0.6,
      metalness: 0.03,
    });

    this.trimMaterial = new THREE.MeshStandardMaterial({
      color: 0x4d5259,
      roughness: 0.42,
      metalness: 0.82,
    });

    this.chainMaterial = new THREE.MeshStandardMaterial({
      color: 0x6e747c,
      roughness: 0.38,
      metalness: 0.9,
    });

    this.ceilingMaterial = new THREE.MeshStandardMaterial({
      color: 0x1b1f25,
      roughness: 0.7,
      metalness: 0.45,
    });
  }

  /* ── Geometry ─────────────────────────────────────────────────────────── */

  _buildBag() {
    const g = BAG_GEOMETRY;

    // Main body: capsule gives a soft, heavy-bag silhouette.
    const bodyGeo = new THREE.CapsuleGeometry(g.RADIUS, g.CYLINDER_LENGTH, 10, 48);
    this.body = new THREE.Mesh(bodyGeo, this.leatherMaterial);
    this.body.position.y = g.CENTER_Y;
    this.body.castShadow = true;
    this.body.receiveShadow = true;
    this.deform.add(this.body);

    // Curved photo panel, half a cylinder on the front. Radius is slightly
    // larger to avoid z-fighting, arc length ≈ panel height → square photo.
    const panelGeo = new THREE.CylinderGeometry(
      g.PANEL_RADIUS,
      g.PANEL_RADIUS,
      g.PANEL_HEIGHT,
      64,
      1,
      true,
      -g.PANEL_ARC / 2,
      g.PANEL_ARC,
    );
    this.panel = new THREE.Mesh(panelGeo, this.panelMaterial);
    this.panel.position.y = g.CENTER_Y;
    this.panel.receiveShadow = true;
    this.deform.add(this.panel);

    // Metal trim rings framing the photo panel.
    const ringGeo = new THREE.TorusGeometry(g.RADIUS + 0.004, 0.017, 8, 64);
    for (const sign of [-1, 1]) {
      const ring = new THREE.Mesh(ringGeo, this.trimMaterial);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = g.CENTER_Y + sign * (g.PANEL_HEIGHT / 2);
      ring.castShadow = false;
      ring.receiveShadow = true;
      this.deform.add(ring);
    }

    // Top collar where the bag meets its hanger.
    const collarGeo = new THREE.CylinderGeometry(0.19, 0.23, 0.13, 28, 1, true);
    const collar = new THREE.Mesh(collarGeo, this.leatherMaterial);
    collar.position.y = -0.02;
    collar.castShadow = true;
    this.deform.add(collar);

    this.hitMeshes = [this.panel, this.body];
  }

  _buildRig() {
    const g = BAG_GEOMETRY;
    this.rig = new THREE.Group();
    this.rig.name = "bag-rig";
    this.scene.add(this.rig);

    // Ceiling plate.
    const plate = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.3, 0.09, 28),
      this.ceilingMaterial,
    );
    plate.position.y = 3.29;
    plate.receiveShadow = true;
    this.rig.add(plate);

    const plateRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.2, 0.022, 8, 40),
      this.chainMaterial,
    );
    plateRing.rotation.x = Math.PI / 2;
    plateRing.position.y = 3.235;
    this.rig.add(plateRing);

    // Chain: alternating vertical torus links.
    const linkGeo = new THREE.TorusGeometry(0.058, 0.0115, 7, 22);
    const chainLength = 3.22 - (g.PIVOT_Y + 0.02);
    const links = 10;
    for (let i = 0; i < links; i += 1) {
      const link = new THREE.Mesh(linkGeo, this.chainMaterial);
      link.position.y = 3.2 - (i / (links - 1)) * chainLength;
      if (i % 2 === 0) {
        link.rotation.y = Math.PI / 2;
      }
      link.rotation.z = 0.04;
      this.rig.add(link);
    }

    // Hanger ring attached to the pivot so it swings with the bag.
    const hanger = new THREE.Mesh(
      new THREE.TorusGeometry(0.085, 0.018, 8, 28),
      this.chainMaterial,
    );
    hanger.rotation.x = Math.PI / 2;
    hanger.position.y = 0.02;
    this.pivot.add(hanger);

    const strap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.055, 0.13, 16),
      this.ceilingMaterial,
    );
    strap.position.y = 0.085;
    this.pivot.add(strap);
  }

  /* ── Texture compositing ──────────────────────────────────────────────── */

  setPhoto(source, { mode = this.photoMode, lang = this.lang } = {}) {
    this.photoSource = source || null;
    this.photoMode = mode === "portrait" ? "portrait" : "full";
    this.lang = lang;
    this.redrawTexture();
  }

  setPhotoMode(mode) {
    const next = mode === "portrait" ? "portrait" : "full";
    if (next === this.photoMode) return;
    this.photoMode = next;
    this.redrawTexture();
  }

  setLanguage(lang, strings) {
    this.lang = lang;
    this.strings = strings || this.strings;
    if (!this.photoSource) this.redrawTexture();
  }

  redrawTexture() {
    const ctx = this.ctx;
    const S = TEXTURE_SIZE;

    ctx.clearRect(0, 0, S, S);

    // Leather base (scaled from the tileable pattern).
    ctx.drawImage(this.leatherCanvas, 0, 0, S, S);

    const edgeShade = ctx.createLinearGradient(0, 0, 0, S);
    edgeShade.addColorStop(0, "rgba(0,0,0,0.42)");
    edgeShade.addColorStop(0.16, "rgba(0,0,0,0.05)");
    edgeShade.addColorStop(0.82, "rgba(0,0,0,0.08)");
    edgeShade.addColorStop(1, "rgba(0,0,0,0.48)");
    ctx.fillStyle = edgeShade;
    ctx.fillRect(0, 0, S, S);

    if (this.photoSource) {
      if (this.photoMode === "portrait") {
        this._drawPortrait(ctx, S);
      } else {
        this._drawFullPhoto(ctx, S);
      }
    } else {
      this._drawPlaceholder(ctx, S);
    }

    this._drawStitching(ctx, S);
    this.texture.needsUpdate = true;
  }

  _drawFullPhoto(ctx, S) {
    const margin = 46;
    const x = margin;
    const y = margin;
    const w = S - margin * 2;
    const h = S - margin * 2;
    const radius = 24;

    ctx.save();
    roundedRectPath(ctx, x, y, w, h, radius);
    ctx.clip();

    drawCover(ctx, this.photoSource, x, y, w, h);

    // Bottom shadow for depth / readability.
    const shade = ctx.createLinearGradient(0, y + h * 0.55, 0, y + h);
    shade.addColorStop(0, "rgba(0,0,0,0)");
    shade.addColorStop(1, "rgba(0,0,0,0.34)");
    ctx.fillStyle = shade;
    ctx.fillRect(x, y + h * 0.55, w, h * 0.45);

    // Subtle warm photo grade so it sits inside the scene.
    const grade = ctx.createLinearGradient(x, y, x + w, y + h);
    grade.addColorStop(0, "rgba(255,90,60,0.05)");
    grade.addColorStop(1, "rgba(20,40,80,0.09)");
    ctx.fillStyle = grade;
    ctx.fillRect(x, y, w, h);
    ctx.restore();

    // Frame
    ctx.save();
    roundedRectPath(ctx, x, y, w, h, radius);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(241,243,245,0.24)";
    ctx.stroke();
    ctx.restore();

    // Red registration corners
    this._drawCorners(ctx, x - 6, y - 6, w + 12, h + 12, 34, "rgba(230,57,70,0.92)");
  }

  _drawPortrait(ctx, S) {
    const cx = S / 2;
    const cy = 300;
    const r = 218;

    // Soft halo behind the portrait
    const halo = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 1.55);
    halo.addColorStop(0, "rgba(230,57,70,0.2)");
    halo.addColorStop(0.55, "rgba(230,57,70,0.06)");
    halo.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, S, S);

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    drawCover(ctx, this.photoSource, cx - r, cy - r, r * 2, r * 2);

    const shade = ctx.createLinearGradient(0, cy, 0, cy + r);
    shade.addColorStop(0, "rgba(0,0,0,0)");
    shade.addColorStop(1, "rgba(0,0,0,0.28)");
    ctx.fillStyle = shade;
    ctx.fillRect(cx - r, cy, r * 2, r);
    ctx.restore();

    // Rings around portrait
    ctx.beginPath();
    ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(241,243,245,0.8)";
    ctx.lineWidth = 6;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, r + 15, -Math.PI * 0.85, -Math.PI * 0.18);
    ctx.strokeStyle = "rgba(230,57,70,0.95)";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.stroke();

    // Brand lockup below
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(241,243,245,0.92)";
    ctx.font = '800 54px "Barlow Condensed", "Arial Narrow", Impact, sans-serif';
    drawSpacedText(ctx, "STRESS PUNCH", S / 2, 636, 10);

    ctx.strokeStyle = "rgba(230,57,70,0.9)";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(S / 2 - 62, 682);
    ctx.lineTo(S / 2 + 62, 682);
    ctx.stroke();

    ctx.fillStyle = "rgba(241,243,245,0.42)";
    ctx.font = '600 20px "Inter", "Helvetica Neue", Arial, sans-serif';
    drawSpacedText(ctx, "PORTRAIT MODE", S / 2, 724, 7);
    ctx.restore();
  }

  _drawPlaceholder(ctx, S) {
    const cx = S / 2;
    const cy = 350;
    const r = 186;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fill();
    ctx.setLineDash([13, 13]);
    ctx.strokeStyle = "rgba(241,243,245,0.28)";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.setLineDash([]);

    // Plus
    ctx.strokeStyle = "rgba(230,57,70,0.92)";
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx, cy - 46);
    ctx.lineTo(cx, cy + 46);
    ctx.moveTo(cx - 46, cy);
    ctx.lineTo(cx + 46, cy);
    ctx.stroke();
    ctx.restore();

    const title = this.strings?.upload || "UPLOAD PHOTO";
    const sub = this.strings?.sub || "YOUR FACE HERE";

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(241,243,245,0.92)";
    ctx.font = '800 62px "Barlow Condensed", "Arial Narrow", Impact, sans-serif';
    drawSpacedText(ctx, title, cx, 622, 7);

    ctx.strokeStyle = "rgba(230,57,70,0.92)";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx - 54, 664);
    ctx.lineTo(cx + 54, 664);
    ctx.stroke();

    ctx.fillStyle = "rgba(241,243,245,0.4)";
    ctx.font = '600 21px "Inter", "Helvetica Neue", Arial, sans-serif';
    drawSpacedText(ctx, sub, cx, 704, 6);
    ctx.restore();

    this._drawCorners(ctx, 44, 44, S - 88, S - 88, 42, "rgba(241,243,245,0.22)");
  }

  _drawCorners(ctx, x, y, w, h, len, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    const corners = [
      [x, y, 1, 1],
      [x + w, y, -1, 1],
      [x, y + h, 1, -1],
      [x + w, y + h, -1, -1],
    ];
    for (const [px, py, sx, sy] of corners) {
      ctx.beginPath();
      ctx.moveTo(px, py + sy * len);
      ctx.lineTo(px, py);
      ctx.lineTo(px + sx * len, py);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawStitching(ctx, S) {
    // A faint stitched seam near the top and bottom of the panel.
    ctx.save();
    ctx.setLineDash([3, 7]);
    ctx.strokeStyle = "rgba(241,243,245,0.105)";
    ctx.lineWidth = 2;
    for (const y of [17, S - 17]) {
      ctx.beginPath();
      ctx.moveTo(26, y);
      ctx.lineTo(S - 26, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ── Runtime ──────────────────────────────────────────────────────────── */

  applyPhysics(state, time = 0, idle = 0) {
    const sway = clamp(idle, 0, 1);
    this.pivot.rotation.x = state.angX + Math.sin(time * 0.52) * 0.018 * sway;
    this.pivot.rotation.z = state.angZ + Math.sin(time * 0.41 + 1.3) * 0.023 * sway;
    this.pivot.rotation.y = Math.sin(time * 0.27 + 0.4) * 0.045 * sway;

    const sxz = clamp(state.scaleXZ, 0.84, 1.2);
    const sy = clamp(state.scaleY, 0.72, 1.08);
    this.deform.scale.set(sxz, sy, sxz);
  }

  updateMatrix() {
    this.pivot.updateMatrixWorld(true);
  }

  worldToLocal(worldPoint) {
    this.updateMatrix();
    return this.deform.worldToLocal(worldPoint.clone());
  }

  localToWorld(localPoint) {
    this.updateMatrix();
    return this.deform.localToWorld(localPoint.clone());
  }

  /** Bag-local point used by keyboard punches. aimX/aimY ∈ [-1, 1]. */
  getAimPoint(aimX = 0, aimY = 0) {
    const angle = clamp(aimX, -1, 1) * 0.62;
    const y = this.centerY + clamp(aimY, -1, 1) * 0.74;
    const r = this.radius + 0.012;
    return new THREE.Vector3(Math.sin(angle) * r, y, Math.cos(angle) * r);
  }

  /** Surface normal (bag-local XZ) for a hit point, used by punch marks. */
  getSurfaceNormal(localPoint) {
    const n = new THREE.Vector3(localPoint.x, 0, localPoint.z);
    if (n.lengthSq() < 1e-6) n.set(0, 0, 1);
    return n.normalize();
  }

  dispose() {
    this.scene.remove(this.pivot);
    this.scene.remove(this.rig);
    this.texture.dispose();
    this.bodyMap.dispose();
    this.bodyBump.dispose();
    this.body.geometry.dispose();
    this.panel.geometry.dispose();
    this.leatherMaterial.dispose();
    this.panelMaterial.dispose();
    this.trimMaterial.dispose();
    this.chainMaterial.dispose();
    this.ceilingMaterial.dispose();
  }
}
