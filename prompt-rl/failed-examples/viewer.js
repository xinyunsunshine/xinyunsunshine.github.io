// LiberoRobotViewer — embeddable 3D viewer for LIBERO-PRO pi0.5 rollouts.
// Loads a baked textured scene.glb + per-prompt keyframe trajectories and lets
// the user pick prompts (Eureka-style) to watch behavior differ. Free orbit.
//
// All baked geometry/trajectories are in raw MuJoCo world coords (z-up); we keep
// the world z-up and set the camera up vector to +Z, so no per-frame conversion.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

export class LiberoRobotViewer {
  constructor(root, manifestUrl) {
    this.root = root;
    this.dataDir = manifestUrl.slice(0, manifestUrl.lastIndexOf("/") + 1);
    this.trajCache = new Map();
    this.playing = true;
    this.speed = 1;
    this.frame = 0;
    this._buildDom();
    this._initThree();
    this._loadManifest(manifestUrl);
    this._animate = this._animate.bind(this);
    this._clock = new THREE.Clock();
    requestAnimationFrame(this._animate);
  }

  // ---------------- DOM ----------------
  _buildDom() {
    this.root.innerHTML = `
      <div class="lrv-side">
        <div class="lrv-tasks-head">Scenes</div>
        <div class="lrv-tasks" id="lrv-tasks"></div>
        <div class="lrv-head"><h1 id="lrv-title">Loading…</h1><p id="lrv-goal"></p></div>
        <div class="lrv-list" id="lrv-list"></div>
      </div>
      <div class="lrv-stage" id="lrv-stage">
        <div class="lrv-hint">drag to orbit · scroll to zoom · right-drag to pan</div>
        <div class="lrv-prompt" id="lrv-promptbox" style="display:none">
          <div class="k" id="lrv-plabel">prompt</div>
          <div class="txt" id="lrv-ptext"></div>
          <div class="why" id="lrv-pwhy"></div>
        </div>
        <div class="lrv-loading" id="lrv-loading">Loading scene…</div>
        <div class="lrv-controls">
          <button class="lrv-btn" id="lrv-play">❚❚</button>
          <input type="range" class="lrv-scrub" id="lrv-scrub" min="0" max="1000" value="0" />
          <span class="lrv-time" id="lrv-time">0.0 / 0.0s</span>
          <select class="lrv-select" id="lrv-speed">
            <option value="0.5">0.5×</option><option value="1" selected>1×</option>
            <option value="2">2×</option><option value="4">4×</option>
          </select>
          <span class="lrv-cams" id="lrv-cams"></span>
          <button class="lrv-btn" id="lrv-reset">reset view</button>
        </div>
      </div>`;
    this.$ = (id) => this.root.querySelector(id);
    this.$("#lrv-play").onclick = () => this._togglePlay();
    this.$("#lrv-scrub").oninput = (e) => { this.playing = false; this._setPlayBtn(); this._seek(+e.target.value / 1000); };
    this.$("#lrv-speed").onchange = (e) => { this.speed = +e.target.value; };
    this.$("#lrv-reset").onclick = () => this._resetView();
  }

  // ---------------- three.js ----------------
  _initThree() {
    const stage = this.$("#lrv-stage");
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    // Soft shadows ground the robot/objects on the table.
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.className = "lrv-canvas";
    stage.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0e13);

    // Image-based lighting: a procedural studio environment (no external HDR file)
    // pre-filtered into an env map -> realistic soft ambient + glossy reflections.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.envMapIntensity = 0.85;

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.05, 60);
    this.camera.up.set(0, 0, 1); // MuJoCo z-up
    this.camera.position.set(1.4, -1.4, 1.6);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(0, 0, 0.9);

    // With IBL doing the ambient/fill, lights are mostly a shadow-casting key + a
    // gentle cool rim. Key light casts soft shadows (frustum set in _setupShadows()).
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x35404d, 0.35));
    this.keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
    this.keyLight.position.set(1.8, -1.2, 3.2);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(2048, 2048);
    this.keyLight.shadow.bias = -0.00015;
    this.keyLight.shadow.normalBias = 0.02;
    this.scene.add(this.keyLight);
    this.scene.add(this.keyLight.target);
    const d2 = new THREE.DirectionalLight(0xbcd0ff, 0.35);
    d2.position.set(-1.5, 1.5, 1.5);
    this.scene.add(d2);

    new ResizeObserver(() => this._resize()).observe(stage);
    this._resize();
  }

  _resize() {
    const s = this.$("#lrv-stage");
    const w = s.clientWidth, h = s.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.composer) this.composer.setSize(w, h);
    if (this.gtao) this.gtao.setSize(w, h);
  }

  // ---------------- data ----------------
  async _loadManifest(url) {
    const m = await (await fetch(url)).json();
    this.tasks = m.tasks;
    this._buildTaskGrid();
    await this._selectTask(this.tasks[0]);
  }

  _buildTaskGrid() {
    const wrap = this.$("#lrv-tasks");
    wrap.innerHTML = "";
    this.taskEls = new Map();
    // hide the whole scene picker when there's only one task
    this.$(".lrv-tasks-head").style.display = this.tasks.length > 1 ? "" : "none";
    if (this.tasks.length <= 1) return;
    for (const t of this.tasks) {
      const el = document.createElement("button");
      el.className = "lrv-task";
      const thumb = t.thumbnail
        ? `<img src="${this.dataDir + t.thumbnail}" loading="lazy" alt="">`
        : `<div class="lrv-noimg"></div>`;
      el.innerHTML = `${thumb}<span class="lrv-task-name">${escapeHtml(t.name || ("Task " + t.id))}</span>`;
      el.onclick = () => this._selectTask(t);
      this.taskEls.set(t, el);
      wrap.appendChild(el);
    }
  }

  async _selectTask(task) {
    if (this.task === task) return;
    // Serialize switches: clicking scenes faster than they load must not leave stale scene
    // roots in the graph (which showed up as ghost robots/objects) or a stale prompt.
    const token = (this._loadToken = (this._loadToken || 0) + 1);
    this.$("#lrv-loading").style.display = "flex";
    this.$("#lrv-promptbox").style.display = "none";
    this.task = task;
    this.traj = null;  // stop animating the old trajectory immediately
    if (this.taskEls) for (const [t, el] of this.taskEls) el.classList.toggle("active", t === task);
    this.$("#lrv-title").textContent = task.name || `Task ${task.id}`;
    this.$("#lrv-goal").textContent = task.goal ? `Goal: ${task.goal}` : "";
    // tear down the previous scene's GPU resources before loading the next
    if (this.sceneRoot) {
      this.scene.remove(this.sceneRoot);
      this._disposeObject(this.sceneRoot);
      this.sceneRoot = null;
    }
    this.trajCache = new Map();  // traj paths are per-task

    const { root, nodeMap } = await this._loadScene(this.dataDir + task.scene);
    if (token !== this._loadToken) { this._disposeObject(root); return; }  // superseded by a newer click
    this.sceneRoot = root; this.nodeMap = nodeMap; this.scene.add(root);

    let gi = null;
    try { gi = await (await fetch(this.dataDir + task.geom_index)).json(); } catch {}
    if (token !== this._loadToken) return;
    this.dynNodeSet = new Set(gi ? gi.geoms.filter((g) => g.dynamic).map((g) => g.node) : []);
    await this._loadCameras(this.dataDir + task.cameras);
    if (token !== this._loadToken) return;
    this._buildList();
    this._frameToScene();
    this._setupPostAndShadows();
    this._resetView();
    this._selectPrompt(task.prompts[0]);
    this.$("#lrv-loading").style.display = "none";
  }

  _disposeObject(root) {
    root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          for (const k in m) { const v = m[k]; if (v && v.isTexture) v.dispose(); }
          m.dispose();
        }
      }
    });
  }

  async _loadScene(url) {
    // Returns the loaded root + its node map WITHOUT committing to the scene, so the caller
    // can discard it if a newer task switch superseded this load (avoids ghost scenes).
    if (!this._gltfLoader) {
      this._gltfLoader = new GLTFLoader();
      const draco = new DRACOLoader();
      draco.setDecoderPath("./vendor/draco/");   // Draco-compressed scene geometry
      this._gltfLoader.setDRACOLoader(draco);
    }
    const gltf = await this._gltfLoader.loadAsync(url);
    const root = gltf.scene;
    const nodeMap = new Map();
    root.traverse((o) => {
      if (o.name) nodeMap.set(o.name, o);
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) if (m && "envMapIntensity" in m) m.envMapIntensity = this.envMapIntensity;
      }
    });
    return { root, nodeMap };
  }

  async _loadCameras(url) {
    try { this.cameras = (await (await fetch(url)).json()).cameras; }
    catch { this.cameras = []; }
    const wrap = this.$("#lrv-cams");
    wrap.innerHTML = "";
    const want = new Set(["frontview", "agentview", "sideview", "birdview"]);
    (this.cameras || []).filter((c) => want.has(c.name)).forEach((c) => {
      const b = document.createElement("button");
      b.className = "lrv-btn"; b.textContent = c.name.replace("view", "");
      b.onclick = () => this._applyCamera(c);
      wrap.appendChild(b);
    });
  }

  _frameToScene() {
    // Frame the action (robot + objects + table), excluding the huge floor plane
    // and room walls which would otherwise dominate the bounding box.
    this.sceneRoot.updateMatrixWorld(true);
    const box = new THREE.Box3();
    // frame the workspace: dynamic geoms (robot + objects) + the table
    const keep = (n) => (this.dynNodeSet && this.dynNodeSet.has(n)) || /table/i.test(n);
    this.sceneRoot.traverse((o) => {
      if (o.isMesh && keep(o.name)) box.expandByObject(o);
    });
    if (box.isEmpty()) box.setFromObject(this.sceneRoot);
    this._center = box.getCenter(new THREE.Vector3());
    this._radius = box.getSize(new THREE.Vector3()).length() * 0.5 || 1.5;
    console.log(`[lrv] frame center=${this._center.toArray().map(n=>n.toFixed(2))} radius=${this._radius.toFixed(2)}`);
  }

  _setupPostAndShadows() {
    const c = this._center || new THREE.Vector3(0, 0, 0.9);
    const r = this._radius || 1.5;
    // Aim the shadow-casting key light at the workspace and size its orthographic
    // frustum to just cover it (tight frustum -> crisp soft shadows).
    this.keyLight.position.copy(c.clone().add(new THREE.Vector3(1.8, -1.2, 3.2)));
    this.keyLight.target.position.copy(c);
    this.keyLight.target.updateMatrixWorld(true);
    const span = r * 1.5;
    const sc = this.keyLight.shadow.camera;
    sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span;
    sc.near = 0.2; sc.far = span * 8;
    sc.updateProjectionMatrix();

    // Postprocessing: GTAO ambient occlusion for contact darkening + depth, then
    // OutputPass applies tone mapping + sRGB. EffectComposer uses HDR targets so the
    // ACES tone map isn't double-applied. Built once; scene/camera refs are stable across
    // task switches (only sceneRoot swaps inside this.scene), so we just retune the AO
    // radius to the new scene scale.
    const size = this.renderer.getSize(new THREE.Vector2());
    // AO sampling radius is WORLD-space; workspace objects are ~5-25cm, so a small radius
    // gives contact-shadow darkening. (A scene-scale radius over-occludes to black.)
    const aoRadius = Math.min(0.05, Math.max(0.02, r * 0.03));
    if (!this.composer) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.setPixelRatio(Math.min(devicePixelRatio, 2));
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      const gtao = new GTAOPass(this.scene, this.camera, size.x, size.y);
      gtao.output = GTAOPass.OUTPUT.Default;
      gtao.blendIntensity = 0.35;
      this.gtao = gtao;
      this.composer.addPass(gtao);
      this.composer.addPass(new OutputPass());
      this.composer.setSize(size.x, size.y);
    }
    try {
      this.gtao.updateGtaoMaterial({ radius: aoRadius, distanceExponent: 1.0, thickness: 0.3,
        scale: 1.0, samples: 16, distanceFallOff: 1.0, screenSpaceRadius: false });
    } catch (e) { /* keep defaults if signature differs */ }
  }

  _resetView() {
    // Clean 3/4 orbit framing the whole scene (nicer than the tight policy cam;
    // agentview etc. remain available as preset buttons). A task may override the
    // default direction/distance via a `view` field in the manifest.
    const c = this._center || new THREE.Vector3(0, 0, 0.9);
    const r = this._radius || 1.5;
    const v = (this.task && this.task.view) || {};
    const d = v.dir || [1, -1, 0.55];
    const dist = v.dist || 1.7;
    const dir = new THREE.Vector3(d[0], d[1], d[2]).normalize();
    this.controls.target.copy(c);
    this.camera.position.copy(c.clone().add(dir.multiplyScalar(r * dist)));
    this.controls.update();
  }

  _applyCamera(c) {
    const pos = new THREE.Vector3().fromArray(c.pos);
    const fwd = new THREE.Vector3().fromArray(c.forward).normalize();
    // aim at the point where the camera ray meets the scene center height
    const target = (this._center || new THREE.Vector3(0, 0, 0.9)).clone();
    this.camera.position.copy(pos);
    this.controls.target.copy(pos.clone().add(fwd.multiplyScalar(pos.distanceTo(target))));
    this.controls.update();
  }

  // ---------------- prompt selector ----------------
  _buildList() {
    const list = this.$("#lrv-list");
    list.innerHTML = "";
    const groups = [
      ["Ground-truth demonstration", (p) => p.label === "demo"],
      ["Original (canonical) prompt", (p) => p.label === "canonical"],
      ["Optimized prompts", (p) => p.label === "optimized"],
      ["Prompts that work", (p) => p.label === "working"],
      ["Prompts that fail", (p) => p.label === "failing"],
    ];
    this.itemEls = new Map();
    for (const [label, filt] of groups) {
      const items = this.task.prompts.filter(filt);
      if (!items.length) continue;
      const gl = document.createElement("div");
      gl.className = "lrv-group-label"; gl.textContent = label;
      list.appendChild(gl);
      for (const p of items) list.appendChild(this._itemEl(p));
    }
  }

  _itemEl(p) {
    const el = document.createElement("div");
    el.className = "lrv-item";
    // Badge = qualitative outcome only (no success-rate / score numbers): a green
    // check for a pi0.5 success, a red cross for a failure, "demo" for the scripted demo.
    let badge, bclass;
    if (p.label === "demo") { badge = "demo"; bclass = "demo"; }
    else if (p.outcome === "success") { badge = "✓"; bclass = "working"; }
    else { badge = "✗"; bclass = "failing"; }
    let note = "";
    if (p.pending) {
      note = '<div class="pending">pi0.5 rollout pending — showing demo motion</div>';
    } else if (p.outcome && p.label !== "demo") {
      const ok = p.outcome === "success";
      const partial = p.partial ? " (partial rollout)" : "";
      note = `<div class="outcome ${ok ? "ok" : "bad"}">${ok ? "✓ pi0.5 succeeds" : "✗ pi0.5 fails"}${partial}</div>`;
    }
    el.innerHTML = `<span class="lrv-badge ${bclass}">${badge}</span>
      <span class="lrv-item-txt">${escapeHtml(p.text)}${note}</span>`;
    el.onclick = () => this._selectPrompt(p);
    this.itemEls.set(p, el);
    return el;
  }

  async _selectPrompt(p) {
    this.active = p;
    for (const [pp, el] of this.itemEls) el.classList.toggle("active", pp === p);
    const box = this.$("#lrv-promptbox");
    box.style.display = "block";
    const kind = (p.label === "working" || p.label === "optimized") ? "optimized prompt"
      : p.label === "failing" ? "failed prompt"
      : p.label === "canonical" ? "original task instruction (unoptimized)"
      : "ground-truth demonstration";
    let real = "";
    if (p.outcome && p.label !== "demo") {
      real = p.outcome === "success" ? " · ✓ pi0.5 succeeds" : " · ✗ pi0.5 fails";
    }
    this.$("#lrv-plabel").textContent = kind + real;
    this.$("#lrv-ptext").textContent = `“${p.text}”`;
    this.$("#lrv-pwhy").textContent = p.reasoning || p.note || "";
    await this._loadTraj(p.traj);
    this.frame = 0; this.playing = true; this._setPlayBtn();
  }

  async _loadTraj(rel) {
    if (this.trajCache.has(rel)) { this.traj = this.trajCache.get(rel); return; }
    const header = await (await fetch(this.dataDir + rel + ".json")).json();
    const buf = await (await fetch(this.dataDir + rel + ".bin")).arrayBuffer();
    const data = new Float32Array(buf);
    // resolve node objects once
    const objs = header.nodes.map((n) => this.nodeMap.get(n) || null);
    const t = { header, data, objs };
    this.trajCache.set(rel, t);
    this.traj = t;
  }

  // ---------------- playback ----------------
  _togglePlay() { this.playing = !this.playing; this._setPlayBtn(); }
  _setPlayBtn() { this.$("#lrv-play").textContent = this.playing ? "❚❚" : "▶"; }
  _seek(frac) { if (this.traj) { this.frame = frac * (this.traj.header.nframes - 1); this._applyFrame(); } }

  _applyFrame() {
    const t = this.traj; if (!t) return;
    const { header, data, objs } = t;
    const f = Math.max(0, Math.min(header.nframes - 1, Math.round(this.frame)));
    const nd = header.ndyn;
    const base = f * nd * 7;
    for (let j = 0; j < nd; j++) {
      const o = objs[j]; if (!o) continue;
      const b = base + j * 7;
      o.position.set(data[b], data[b + 1], data[b + 2]);
      o.quaternion.set(data[b + 3], data[b + 4], data[b + 5], data[b + 6]);
    }
    const dur = (header.nframes - 1) / header.fps;
    this.$("#lrv-time").textContent = `${(f / header.fps).toFixed(1)} / ${dur.toFixed(1)}s`;
    this.$("#lrv-scrub").value = String(Math.round((f / (header.nframes - 1 || 1)) * 1000));
  }

  _animate() {
    requestAnimationFrame(this._animate);
    const dt = this._clock.getDelta();
    if (this.playing && this.traj) {
      this.frame += dt * this.traj.header.fps * this.speed;
      if (this.frame >= this.traj.header.nframes - 1) this.frame = 0; // loop
      this._applyFrame();
    }
    this.controls.update();
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
