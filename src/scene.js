/**
 * scene.js — Three.js renderer, camera, lighting, gym floor and screen shake.
 * The bag itself lives in bag.js.
 */

import * as THREE from "three";
import { PunchingBag } from "./bag.js";

const CAMERA_BASE = new THREE.Vector3(0, 0.2, 6.3);
const CAMERA_TARGET = new THREE.Vector3(0, 0.22, 0);
const FLOOR_Y = -1.35;

/** Soft radial sprite used for the wall glow — no hard edges. */
function makeGlowTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const c = size / 2;

  const gradient = ctx.createRadialGradient(c, c, 0, c, c, c);
  gradient.addColorStop(0, "rgba(214, 56, 72, 0.62)");
  gradient.addColorStop(0.22, "rgba(176, 38, 55, 0.4)");
  gradient.addColorStop(0.48, "rgba(118, 24, 38, 0.18)");
  gradient.addColorStop(0.72, "rgba(70, 14, 24, 0.07)");
  gradient.addColorStop(1, "rgba(40, 8, 14, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

export class StressScene {
  constructor(canvas, { lang, photoMode } = {}) {
    this.canvas = canvas;
    this.width = 1;
    this.height = 1;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
      stencil: false,
    });
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.24;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x000000, 0);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x0b0d10, 0.034);

    this.camera = new THREE.PerspectiveCamera(43, 1, 0.1, 80);
    this.camera.position.copy(CAMERA_BASE);
    this.camera.lookAt(CAMERA_TARGET);

    this.shakeAmount = 0;
    this.time = 0;

    this._buildLights();
    this._buildFloor();

    this.bag = new PunchingBag(this.scene, this.renderer, { lang, photoMode });

    this._onResize = this.resize.bind(this);
    window.addEventListener("resize", this._onResize, { passive: true });
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", this._onResize, { passive: true });
    }

    this.resize();
  }

  get element() {
    return this.canvas;
  }

  _buildLights() {
    const hemi = new THREE.HemisphereLight(0xb6c9e8, 0x1c0f0a, 0.92);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xfff1e2, 3.05);
    key.position.set(4.2, 6.2, 5.2);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -4.5;
    key.shadow.camera.right = 4.5;
    key.shadow.camera.top = 5.5;
    key.shadow.camera.bottom = -2.5;
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 22;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.025;
    this.scene.add(key);
    this.keyLight = key;

    const fill = new THREE.DirectionalLight(0x86a4ff, 1.2);
    fill.position.set(-5.5, 2.6, 3.6);
    this.scene.add(fill);

    // Straight-on fill so the photo panel stays readable.
    const front = new THREE.DirectionalLight(0xffe9d6, 0.85);
    front.position.set(0.4, 1.2, 6.4);
    this.scene.add(front);

    // Warm rim from behind the bag.
    const rim = new THREE.PointLight(0xff4a30, 26, 10, 2);
    rim.position.set(0.4, 1.4, -2.6);
    this.scene.add(rim);

    // Cool edge on the opposite side.
    const cool = new THREE.PointLight(0x4c7dff, 14, 9, 2);
    cool.position.set(-3.1, 0.5, 1.2);
    this.scene.add(cool);

    const accent = new THREE.PointLight(0xe63946, 11, 7, 2);
    accent.position.set(2.8, -0.9, 2.2);
    this.scene.add(accent);
  }

  _buildFloor() {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 90),
      new THREE.MeshStandardMaterial({
        color: 0x0d1015,
        roughness: 0.86,
        metalness: 0.22,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = FLOOR_Y;
    floor.receiveShadow = true;
    this.scene.add(floor);
    this.floor = floor;

    // Dark rubber mat under the bag.
    const mat = new THREE.Mesh(
      new THREE.CircleGeometry(2.35, 64),
      new THREE.MeshStandardMaterial({
        color: 0x160e0f,
        roughness: 0.92,
        metalness: 0.05,
      }),
    );
    mat.rotation.x = -Math.PI / 2;
    mat.position.y = FLOOR_Y + 0.002;
    mat.receiveShadow = true;
    this.scene.add(mat);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.2, 2.26, 80),
      new THREE.MeshBasicMaterial({
        color: 0x923039,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = FLOOR_Y + 0.004;
    this.scene.add(ring);
    this.matRing = ring;

    const grid = new THREE.GridHelper(36, 36, 0x39414c, 0x1b2028);
    grid.position.y = FLOOR_Y + 0.003;
    grid.material.transparent = true;
    grid.material.opacity = 0.24;
    grid.material.depthWrite = false;
    this.scene.add(grid);

    // Soft red wall glow behind the bag for silhouette separation.
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(7.6, 7.6),
      new THREE.MeshBasicMaterial({
        map: makeGlowTexture(),
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    glow.position.set(0, 1.35, -3.4);
    this.scene.add(glow);
    this.backGlow = glow;
  }

  resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.width = width;
    this.height = height;

    // Keep the render cheap on high-DPI phones.
    const dpr = Math.min(window.devicePixelRatio || 1, width < 760 ? 1.75 : 2);
    this.pixelRatio = dpr;

    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);

    this.camera.aspect = Math.max(0.35, width / Math.max(1, height));
    // A little extra headroom on phones in portrait.
    this.camera.fov = height > width ? 47 : 43;
    this.camera.updateProjectionMatrix();
  }

  /** Add a decaying camera shake. */
  shake(strength = 0.6) {
    const target = 0.018 + 0.052 * Math.max(0, strength);
    this.shakeAmount = Math.min(0.18, Math.max(this.shakeAmount, target));
  }

  updateCamera(dt) {
    // Keep the bag framed on narrow screens by pulling the camera back a bit.
    const portrait = this.width / Math.max(1, this.height) < 0.72;
    const baseZ = CAMERA_BASE.z + (portrait ? 0.5 : 0);

    if (this.shakeAmount > 0.0004) {
      const a = this.shakeAmount;
      this.camera.position.set(
        CAMERA_BASE.x + (Math.random() * 2 - 1) * a,
        CAMERA_BASE.y + (Math.random() * 2 - 1) * a * 0.8,
        baseZ + (Math.random() * 2 - 1) * a * 0.35,
      );
      this.camera.lookAt(
        CAMERA_TARGET.x + (Math.random() * 2 - 1) * a * 0.45,
        CAMERA_TARGET.y + (Math.random() * 2 - 1) * a * 0.45,
        CAMERA_TARGET.z,
      );
      this.camera.rotateZ((Math.random() * 2 - 1) * a * 0.11);
      this.shakeAmount *= Math.exp(-dt * 15);
    } else {
      this.shakeAmount = 0;
      this.camera.position.set(CAMERA_BASE.x, CAMERA_BASE.y, baseZ);
      this.camera.lookAt(CAMERA_TARGET);
      this.camera.rotation.z = 0;
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    window.removeEventListener("resize", this._onResize);
    if (window.visualViewport) {
      window.visualViewport.removeEventListener("resize", this._onResize);
    }
    this.bag.dispose();
    this.renderer.dispose();
  }
}
