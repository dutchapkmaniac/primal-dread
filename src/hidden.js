// update 75 (prompt 38, update 2): THE HIDDEN FOREST. A stick-drawn blob of the eastern forest that, if you stand inside it
// through the four seconds of nightfall, turns into the Monial night: blue-purple glowing trees, grass, lanterns, emblems,
// a full blue moon, white fireflies; safe from every beast, no way out until dawn (a force), the night at half speed, its
// own music. By day the lake with its bridge and the abandoned village are plain wood and stone. Seven Monial people live
// in the night: a farmer and his wife, an explorer, a witch, a warrior, a historian and the lady of the lake - they speak
// Monial until you carry the enchanted staff (or have read the historian's book). Starflowers, magic mushrooms, moonstone
// and the void bloom grow only at night; moonfish rise only then.
// update 76 (prompt 38b): the forest dressed properly. An oval lake the size of the lighthouse's, its bridge across the
// narrow side landing on both shores, day water that IS the lighthouse lake's and a lighter rippling glowing night water;
// four or five lanterns on every tree (dark and crooked by day, lit and straight at night, each tree a light the pool turns
// on as you pass), a carved glowing crescent on every third trunk and glowing veins up every trunk; real 3D glowing plants
// (Higgsfield) with their own lights in place of the flat pictures; moonstone rocks that stand as mossy boulders by day;
// a village with log huts dressed inside and out (porch, banner, lanterns, ivy, carved crescent, rug, table set, shelves,
// a hanging lamp), lampposts, a fence, benches and clutter, a stone path from the bridge, a moon shrine, and a bigger
// fountain: mossy and dry by day, a clean crescent fountain at night. The Monial wear their own colours now, with only a
// blue rim of light. Nothing hostile is inside while the forest is turned, and the ordinary forest's flowers and mushrooms
// never grow inside the line.
import * as THREE from "three";
import { CFG } from "./config.js?v=76";
import { STR } from "../strings.js?v=76";
import { clone as skeletonClone } from "three/addons/utils/SkeletonUtils.js";

const D2R = Math.PI / 180;
const H = () => CFG.hidden;
const clamp01 = (v) => Math.max(0, Math.min(1, v));

export function pointInPoly(poly, x, z) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

// the stone path from the bridge's east end to the plaza's west gap (world.inNewLandmark keeps the trees off it)
export function hiddenPathEnds() {
  const C = CFG.hidden, L = C.lake, B = C.bridge, V = C.village;
  const ang = Math.atan2(L.z - V.z, L.x - V.x);
  return [[L.x + B.len / 2 + 1.0, L.z], [V.x + Math.cos(ang) * (V.plazaR - 0.5), V.z + Math.sin(ang) * (V.plazaR - 0.5)], ang];
}
export function hiddenPathDist(x, z) {
  const [[ax, az], [bx, bz]] = hiddenPathEnds();
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1; const u = clamp01(((x - ax) * dx + (z - az) * dz) / L2);
  return Math.hypot(x - (ax + dx * u), z - (az + dz * u));
}

export class HiddenForest {
  constructor(g) {
    this.g = g; this.w = g.world; const C = H();
    this.poly = C.poly; this.active = false; this.k = -1; this.pending = null; this.t = 0; this.pushT = 0;
    this.pick = []; this.voidTaken = 0; this.voidMax = 0; this.npcs = []; this.tintMap = null; this.battle = null; this.lasers = []; this.lights = [];
    this.rimU = { value: 0 };
    let cx = 0, cz = 0; for (const [x, z] of this.poly) { cx += x; cz += z; } this.cx = cx / this.poly.length; this.cz = cz / this.poly.length;
    this.w.hiddenZone = this; this.w.hiddenFloor = (x, z, y) => this.floorAt(x, z, y);
    this.rng = () => { this.seed = ((this.seed || 7) * 1103515245 + 12345) & 0x7fffffff; return this.seed / 0x7fffffff; };
    this.buildLine(); this.buildLake(); this.buildBridge(); this.buildVillage(); this.buildNpcs(); this.buildDressing(); this.buildMoon();
    this.updateLook(0, true);
  }
  inside(x, z) { return pointInPoly(this.poly, x, z); }
  texMat(id, opts = {}) {
    const t = new THREE.TextureLoader().load(`./assets/tex/${id}.png`); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    if (opts.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(opts.repeat[0], opts.repeat[1]); }
    const m = new THREE.MeshStandardMaterial({ map: t, alphaTest: opts.alphaTest !== undefined ? opts.alphaTest : 0.45, side: THREE.DoubleSide, roughness: 0.9, metalness: 0, transparent: !!opts.transparent, depthWrite: opts.depthWrite !== false, blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    m.userData.noTint = true; m.userData.tex = t; return m;
  }

  // ---------------- the stick-drawn line ----------------
  buildLine() {
    const w = this.w, pts = [];
    for (let i = 0; i < this.poly.length; i++) { const a = this.poly[i], b = this.poly[(i + 1) % this.poly.length]; const n = Math.max(2, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 1.5)); for (let k = 0; k < n; k++) { const t = k / n; pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); } }
    const N = pts.length, pos = new Float32Array(N * 2 * 3), idx = [];
    for (let i = 0; i < N; i++) { const [x, z] = pts[i], [nx, nz] = pts[(i + 1) % N]; let dx = nx - x, dz = nz - z; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L; const px = -dz * 0.09, pz = dx * 0.09; const y = w.groundHeight(x, z, 40) + 0.05; pos.set([x + px, y, z + pz, x - px, y, z - pz], i * 6); const a = i * 2, b = ((i + 1) % N) * 2; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x2a1e12, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 })); m.frustumCulled = false; this.g.scene.add(m); this.line = m;
  }
  // a ribbon of ground-hugging quads between two points (the stone path)
  ribbon(ax, az, bx, bz, width, mat, lift = 0.05) {
    const w = this.w, L = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.ceil(L / 2)), ux = (bx - ax) / L, uz = (bz - az) / L, px = -uz * width / 2, pz = ux * width / 2;
    const pos = new Float32Array((n + 1) * 6), uv = new Float32Array((n + 1) * 4), idx = [];
    for (let i = 0; i <= n; i++) { const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t; const y1 = w.groundHeight(x + px, z + pz, 40) + lift, y2 = w.groundHeight(x - px, z - pz, 40) + lift; pos.set([x + px, y1, z + pz, x - px, y2, z - pz], i * 6); uv.set([0, t * L / width, 1, t * L / width], i * 4); if (i < n) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 2, a + 3, a + 1); } }
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; this.g.scene.add(m); return m;
  }

  // ---------------- the second lake and its bridge ----------------
  // an oval (40 x 65 m) with a gentle wobble; theta = atan2(dz, dx)
  lakeR(theta) { const L = H().lake, c = Math.cos(theta), s = Math.sin(theta); const e = L.rx * L.rz / Math.sqrt((L.rz * c) * (L.rz * c) + (L.rx * s) * (L.rx * s)); return e * (1 + 0.05 * Math.sin(theta * 3 + 0.7) + 0.035 * Math.cos(theta * 5 + 2.1)); }
  lakePen2(x, z) { const L = H().lake, dx = x - L.x, dz = z - L.z, d = Math.hypot(dx, dz); return this.lakeR(Math.atan2(dz, dx)) - d; }
  nearShore2(x, z) { const pen = this.lakePen2(x, z); return pen > -4 && pen < H().lake.wade + 0.5; }
  buildLake() {
    const g = this.g, w = this.w, L = H().lake, N = 72;
    const ring = (f) => { const sh = new THREE.Shape(); for (let i = 0; i < N; i++) { const t = i / N * Math.PI * 2, r = this.lakeR(t) + f; const x = Math.cos(t) * r, y = -Math.sin(t) * r; i ? sh.lineTo(x, y) : sh.moveTo(x, y); } sh.closePath(); return sh; };
    const mk = (sh, mat, y) => { const m = new THREE.Mesh(new THREE.ShapeGeometry(sh, 1), mat); m.rotation.x = -Math.PI / 2; m.position.set(L.x, y, L.z); g.scene.add(m); return m; };
    mk(ring(3.5), w.mat("t_beach", 7, 7, 0x9a8a68), 0.02);
    mk(ring(-0.3), new THREE.MeshStandardMaterial({ color: 0x1c2a26, roughness: 1 }), 0.035);
    // by day the lighthouse lake's own water: the same material and the same shared drifting texture (world.update moves it)
    const dayMat = new THREE.MeshStandardMaterial({ color: 0x8fb2b8, transparent: true, opacity: 0.88, roughness: 0.12, metalness: 0.08 });
    if (w.waterTex) { dayMat.map = w.waterTex; dayMat.color.setHex(0xffffff); }
    dayMat.userData.noTint = true; this.dayWater = mk(ring(0), dayMat, 0.32); this.dayMat = dayMat;
    // at night a lighter, cleaner, faintly glowing sheet with slow ripples (the water's normal map, drifting two ways)
    const nMat = new THREE.MeshStandardMaterial({ color: 0xb0c0f0, transparent: true, opacity: 0, roughness: 0.12, metalness: 0.12, emissive: 0x3a4ce0, emissiveIntensity: 0.3, depthWrite: false });
    nMat.userData.noTint = true; if (w.waterTex) nMat.map = w.waterTex;   // the same drifting sheet, lifted and glowing
    const nn = g.assets.texN && g.assets.texN.t_water; if (nn) { const t = nn.clone(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(5, 8); t.needsUpdate = true; nMat.normalMap = t; nMat.normalScale.set(0.22, 0.22); this.nightNorm = t; }
    this.nightWater = mk(ring(0), nMat, 0.335); this.nightWater.visible = false; this.nightWater.renderOrder = 2; this.nightMat = nMat;
    // the lighthouse lake tiles its texture seven times over its diameter: the same density here
    for (const m of [this.dayWater, this.nightWater]) { const uv = m.geometry.attributes.uv, sc = 7 / (2 * CFG.lake.r); for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * sc, uv.getY(i) * sc); uv.needsUpdate = true; }
  }
  buildBridge() {
    const g = this.g, w = this.w, B = H().bridge, L = H().lake, plank = w.mat("t_woodplank", 1, 4, 0x6a5a42), post = w.mat("t_darkwood", 1, 2, 0x4a3b28);
    plank.userData.hiddenTint = true; post.userData.hiddenTint = true;
    const c = Math.cos(B.yaw * D2R), s = Math.sin(B.yaw * D2R); this.bridgeWorld = { c, s, x: L.x, z: L.z };
    const toW = (u, v) => [L.x + u * c + v * s, L.z - u * s + v * c];
    const [ax, az] = toW(-B.len / 2, 0), [bx, bz] = toW(B.len / 2, 0);
    const yA = w.groundHeight(ax, az, 40) + 0.03, yB = w.groundHeight(bx, bz, 40) + 0.03;
    this.bridgeEnds = [[ax, az], [bx, bz]];
    // the deck starts ON the ground at both ends and arches over the water
    this.deck = (u) => { const t = clamp01((u + B.len / 2) / B.len); return yA + (yB - yA) * t + B.rise * Math.sin(Math.PI * t); };
    const root = new THREE.Group(); root.position.set(L.x, 0, L.z); root.rotation.y = B.yaw * D2R; g.scene.add(root); this.bridgeRoot = root;
    const n = Math.round(B.len / 0.5);
    for (let i = 0; i < n; i++) { const u = -B.len / 2 + (i + 0.5) * 0.5, y = this.deck(u); const p = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.09, B.w), plank); p.position.set(u, y - 0.045, 0); p.rotation.z = Math.atan2(this.deck(u + 0.25) - this.deck(u - 0.25), 0.5); root.add(p); }
    // piers every three metres, from the deck down to the lake bed or the ground, with a cross beam
    for (let u = -B.len / 2 + 1.5; u < B.len / 2; u += 3) { const y = this.deck(u); const [wx, wz] = toW(u, 0); const base = this.lakePen2(wx, wz) > 0 ? 0.0 : w.groundHeight(wx, wz, 40); const h = Math.max(0.3, y - base + 0.1); for (const sd of [-1, 1]) { const pl = new THREE.Mesh(new THREE.BoxGeometry(0.24, h, 0.24), post); pl.position.set(u, base + h / 2 - 0.1, sd * (B.w / 2 - 0.2)); root.add(pl); } const beam = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.18, B.w + 0.3), post); beam.position.set(u, y - 0.2, 0); root.add(beam); }
    // rail posts every two metres, two rails, a hanging lantern on every other post (lit only in the hidden night)
    this.railLanterns = []; let pi = 0;
    for (let u = -B.len / 2; u <= B.len / 2 + 0.01; u += 2, pi++) { const y = this.deck(u); for (const sd of [-1, 1]) { const po = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.15, 0.14), post); po.position.set(u, y + 0.55, sd * (B.w / 2 - 0.1)); root.add(po); if (pi % 2 === 1) { const [wx, wz] = toW(u, sd * (B.w / 2 + 0.24)); this.railLanterns.push([wx, y + 0.95, wz]); } } }
    for (const sd of [-1, 1]) for (const ry of [0.55, 1.08]) { const pts = []; for (let u = -B.len / 2; u <= B.len / 2 + 0.01; u += 1) pts.push(new THREE.Vector3(u, this.deck(u) + ry, sd * (B.w / 2 - 0.1))); root.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 72, 0.045, 6, false), post)); }
    // colliders: the rails keep you on the deck (thin boxes along the sides, in world axes - the bridge runs along x)
    for (const side of [-1, 1]) for (let u = -B.len / 2 + 0.5; u < B.len / 2; u += 1) { const v = side * (B.w / 2 + 0.08); const [wx, wz] = toW(u, v); const y = this.deck(u); w.addBox(wx - 0.5, wx + 0.5, y, y + 1.15, wz - 0.12, wz + 0.12); }
    this.ladySpot = { x: L.x, z: L.z + 0.5, y: this.deck(0) };
  }
  // the bridge deck is a floor: world.groundHeight asks here (day and night alike - the physics never change)
  floorAt(x, z, y) {
    const B = H().bridge, L = H().lake; if (!this.bridgeWorld || !this.deck) return null;
    const dx = x - L.x, dz = z - L.z, u = dx * this.bridgeWorld.c - dz * this.bridgeWorld.s, v = dx * this.bridgeWorld.s + dz * this.bridgeWorld.c;
    if (Math.abs(u) > B.len / 2 + 0.3 || Math.abs(v) > B.w / 2 + 0.05) return null;
    return this.deck(u) + 0.04;
  }

  // ---------------- the village: four log huts, a stone plaza, the fountain, lampposts, a fence, the shrine, the field ----------------
  buildVillage() {
    const g = this.g, w = this.w, V = H().village, F = H().field, A = g.assets, rng = this.rng;
    const stone = w.mat("t_cobble", 10, 10, 0x6a6a66), wood = w.mat("t_darkwood", 2, 1, 0x3a2e22), plank = w.mat("t_woodplank", 2, 1, 0x5a4a36), bark = w.mat("t_bark", 2, 1, 0x4a3b2a), slate = w.mat("t_slate", 4, 4, 0x4a4a52), hedge = w.mat("t_hedge", 1, 2, 0x2e4a2a), rug = w.mat("t_rug", 1, 1, 0x6a3a3a);
    for (const m of [wood, plank, bark, slate, hedge]) m.userData.hiddenTint = true;
    const stoneP = w.mat("t_cobble", 1, 4, 0x6a6a66); this.mats = { stone, stoneP, wood, plank, bark, slate, hedge, rug };
    const y0 = w.groundHeight(V.x, V.z, 40); this.villageY = y0;
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(V.plazaR, 48), stone); plaza.rotation.x = -Math.PI / 2; plaza.position.set(V.x, y0 + 0.03, V.z); g.scene.add(plaza);
    // the fountain: the mossy one stands dry by day; at the turning the clean crescent fountain takes its place (same footprint)
    { const fa = A.glb.hf_fountain, fb = A.glb.hf_fountain2; let r = 2.3;
      if (fa) { const m = fa.model.clone(); m.position.set(V.x, y0, V.z); g.scene.add(m); this.fountainDay = m; const bb = new THREE.Box3().setFromObject(m), sz = bb.getSize(new THREE.Vector3()); r = Math.max(sz.x, sz.z) / 2; }
      else { const m = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.6, 1.0, 20), stone); m.position.set(V.x, y0 + 0.5, V.z); g.scene.add(m); this.fountainDay = m; r = 3.6; }
      if (fb) { const m = fb.model.clone(); m.position.set(V.x, y0, V.z); m.visible = false; g.scene.add(m); this.fountainNight = m; const bb = new THREE.Box3().setFromObject(m), sz = bb.getSize(new THREE.Vector3()); r = Math.max(r, Math.max(sz.x, sz.z) / 2); }
      this.fountainR = r; w.addTree(V.x, V.z, r * 0.92, "city");
      const wat = new THREE.Mesh(new THREE.CircleGeometry(r * 0.8, 32), new THREE.MeshStandardMaterial({ color: 0x8fb2ff, transparent: true, opacity: 0.8, roughness: 0.1, emissive: 0x3050c0, emissiveIntensity: 0.4 })); wat.rotation.x = -Math.PI / 2; wat.position.set(V.x, y0 + V.waterY, V.z); wat.visible = false; g.scene.add(wat); this.fountainWater = wat;
      const N = 90, pos = new Float32Array(N * 3); const pts = new THREE.Points(new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(pos, 3)), new THREE.PointsMaterial({ color: 0xbfd0ff, size: 0.14, transparent: true, opacity: 0.9, depthWrite: false })); pts.position.set(V.x, y0, V.z); pts.visible = false; g.scene.add(pts); this.spray = { pts, pos, N, seeds: Array.from({ length: N }, (_, i) => i / N), sc: r / 2.3 };
      this.fountain = { x: V.x, z: V.z, y: y0 }; }
    // four huts round the plaza, doors to the fountain
    this.huts = []; this.beds = []; this.hutLanterns = [];
    for (let i = 0; i < 4; i++) {
      const a = (45 + i * 90) * D2R, hx = V.x + Math.cos(a) * V.hutR, hz = V.z + Math.sin(a) * V.hutR, yaw = Math.atan2(V.x - hx, V.z - hz);
      this.huts.push(this.buildHut(hx, hz, yaw, i));
    }
    // the farmer's field beside hut 0: a fence, rows of infial belladonna and magic mushrooms (real plants, each a light)
    { const hut = this.huts[0]; const fx = hut.x + Math.cos(hut.yaw + Math.PI / 2) * F.dx, fz = hut.z - Math.sin(hut.yaw + Math.PI / 2) * F.dx; const fy = w.groundHeight(fx, fz, 40); this.field = { x: fx, z: fz, y: fy };
      const soil = new THREE.Mesh(new THREE.PlaneGeometry(F.w, F.d), w.mat("t_soil", 3, 2, 0x4a3a28)); soil.rotation.x = -Math.PI / 2; soil.position.set(fx, fy + 0.04, fz); g.scene.add(soil);
      for (let i = 0; i < 4; i++) for (const sgn of [-1, 1]) { const px = fx + sgn * F.w / 2, pz = fz - F.d / 2 + i * F.d / 3; const p = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.0, 0.14), wood); p.position.set(px, fy + 0.5, pz); g.scene.add(p); const px2 = fx - F.w / 2 + i * F.w / 3, pz2 = fz + sgn * F.d / 2; const p2 = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.0, 0.14), wood); p2.position.set(px2, fy + 0.5, pz2); g.scene.add(p2); }
      for (const sgn of [-1, 1]) { const r1 = new THREE.Mesh(new THREE.BoxGeometry(F.w, 0.08, 0.08), wood); r1.position.set(fx, fy + 0.85, fz + sgn * F.d / 2); g.scene.add(r1); const r2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, F.d), wood); r2.position.set(fx + sgn * F.w / 2, fy + 0.85, fz); g.scene.add(r2); }
      this.fieldPlants = [];
      for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) { const px = fx - F.w / 2 + 1.1 + c * (F.w - 2.2) / 3, pz = fz - F.d / 2 + 1.0 + r * (F.d - 2) / 2; const kind = r === 2 ? "magic_mushroom" : "infial_belladonna"; const grp = this.plantMesh(kind === "magic_mushroom" ? "hf_magicmush" : "hf_infial", H().glow[kind === "magic_mushroom" ? "magic_mushroom" : "infial"], 6, 6); grp.position.set(px, w.groundHeight(px, pz, 40), pz); grp.rotation.y = (r * 7 + c * 3) * 0.5; grp.visible = false; g.scene.add(grp); this.fieldPlants.push(grp); }
      this.farmerSpot = { x: fx + F.w / 2 + 1.2, z: fz, y: w.groundHeight(fx + F.w / 2 + 1.2, fz, 40), face: Math.atan2(fx - (fx + F.w / 2 + 1.2), 0) }; }
    this.explorerSpot = { x: V.x + 7.5, z: V.z + 3.0, y: y0, face: Math.atan2(V.x - (V.x + 7.5), V.z - (V.z + 3.0)) };
    // ---- lampposts: six round the plaza between the huts, two at each bridge end, two at the path gap
    const [pA, pB, pathAng] = hiddenPathEnds(); this.pathAng = pathAng;
    const fieldAng = Math.atan2(this.field.z - V.z, this.field.x - V.x);
    const angDiff = (a, b) => Math.abs(((a - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    const lampAt = (x, z, yaw = 0) => { const y = w.groundHeight(x, z, 40); const la = A.glb.hf_lamppost; let top = 3.0; if (la) { const m = la.model.clone(); m.position.set(x, y, z); m.rotation.y = yaw; g.scene.add(m); const bb = new THREE.Box3().setFromObject(m); top = bb.max.y - y - 0.35; } else { const m = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3.0, 0.16), wood); m.position.set(x, y + 1.5, z); g.scene.add(m); }
      w.addTree(x, z, 0.22, "city"); this.addLight(x, y + top, z, H().glow.lamppost, 20, 16); };
    for (let i = 0; i < V.lampposts; i++) { const a = (30 + i * 60) * D2R, r = V.plazaR + 1.3; lampAt(V.x + Math.cos(a) * r, V.z + Math.sin(a) * r, -a + Math.PI / 2); }
    { const B = H().bridge, L = H().lake; for (const sd of [-1, 1]) for (const e of [-1, 1]) lampAt(L.x + e * (B.len / 2 + 1.3), L.z + sd * (B.w / 2 + 1.0), e > 0 ? -Math.PI / 2 : Math.PI / 2); }
    for (const sd of [-1, 1]) { const a = pathAng + sd * 7 * D2R, r = V.plazaR + 2.2; lampAt(V.x + Math.cos(a) * r, V.z + Math.sin(a) * r, -a + Math.PI / 2); }
    // ---- a low fence round the plaza, broken by the four huts, the path gap and the field gap; banner poles at the gaps
    { const r = V.plazaR + 0.9, step = 2.0 / r; const posts = [];
      for (let a = 0; a < Math.PI * 2; a += step) { let blocked = false; for (let i = 0; i < 4; i++) if (angDiff(a, (45 + i * 90) * D2R) < 15 * D2R) blocked = true; if (angDiff(a, pathAng) < 7 * D2R || angDiff(a, fieldAng) < 7 * D2R) blocked = true; posts.push({ a, blocked }); }
      for (let i = 0; i < posts.length; i++) { const p = posts[i], q = posts[(i + 1) % posts.length]; if (p.blocked) continue; const x = V.x + Math.cos(p.a) * r, z = V.z + Math.sin(p.a) * r, y = w.groundHeight(x, z, 40); const po = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.05, 0.16), wood); po.position.set(x, y + 0.52, z); g.scene.add(po); w.addTree(x, z, 0.14, "city");
        if (!q.blocked) { const x2 = V.x + Math.cos(q.a) * r, z2 = V.z + Math.sin(q.a) * r, y2 = w.groundHeight(x2, z2, 40); const L = Math.hypot(x2 - x, z2 - z); for (const ry of [0.45, 0.88]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(L, 0.07, 0.07), wood); rail.position.set((x + x2) / 2, (y + y2) / 2 + ry, (z + z2) / 2); rail.rotation.y = -Math.atan2(z2 - z, x2 - x); g.scene.add(rail); for (let k = 0.5; k < L; k += 1) w.addTree(x + (x2 - x) * k / L, z + (z2 - z) * k / L, 0.14, "city"); } } }
      for (const ga of [pathAng, fieldAng]) for (const sd of [-1, 1]) { const a = ga + sd * 9.5 * D2R; this.bannerPole(V.x + Math.cos(a) * r, V.z + Math.sin(a) * r, -ga + Math.PI / 2); } }   // the cloth faces the path
    // ---- benches by the fountain, crates, barrels and baskets against the huts
    { const bench = (x, z, yaw) => { const y = w.groundHeight(x, z, 40); const ba = A.glb.bench; if (ba) { const m = ba.model.clone(); m.position.set(x, y, z); m.rotation.y = yaw; g.scene.add(m); } else { const m = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.45, 0.5), plank); m.position.set(x, y + 0.3, z); m.rotation.y = yaw; g.scene.add(m); } w.addTree(x, z, 0.7, "city"); };
      const fr = this.fountainR + 2.4; for (const a of [pathAng + Math.PI / 2, pathAng - Math.PI / 2]) bench(V.x + Math.cos(a) * fr, V.z + Math.sin(a) * fr, -a);
      const clutter = (hut, lx, lz, ids) => { const c = Math.cos(hut.yaw), s = Math.sin(hut.yaw); const x = hut.x + lx * c + lz * s, z = hut.z - lx * s + lz * c, y = w.groundHeight(x, z, 40); const id = ids[Math.floor(rng() * ids.length)]; const a = A.glb[id]; if (a) { const m = a.model.clone(); m.position.set(x, y, z); m.rotation.y = rng() * 6.28; g.scene.add(m); } else { const m = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), plank); m.position.set(x, y + 0.3, z); g.scene.add(m); } w.addTree(x, z, 0.4, "city"); };
      const HW = V.hutSize / 2; for (const hut of this.huts) { clutter(hut, HW + 0.7, HW - 0.6, ["bcrate", "et_barrel", "barrel"]); clutter(hut, HW + 0.7, HW - 1.4, ["k_basket", "bcrate"]); clutter(hut, -HW - 0.7, HW - 0.8, ["et_barrel", "barrel", "bcrate"]); } }
    // ---- the moon shrine on the plaza's far side: a plinth and a standing stone crescent that glows at night
    { const a = pathAng + Math.PI, r = V.plazaR - 2.6, x = V.x + Math.cos(a) * r, z = V.z + Math.sin(a) * r; const y = y0;
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.9, 1.1), w.mat("t_romanstone", 1, 1, 0x7a7a74)); plinth.position.set(x, y + 0.45, z); plinth.rotation.y = -a; g.scene.add(plinth);
      const sh = new THREE.Shape(); sh.absarc(0, 0, 0.85, Math.PI * 0.35, Math.PI * 1.65, false); const hole = new THREE.Path(); hole.absarc(0.3, 0, 0.72, Math.PI * 0.42, Math.PI * 1.58, false); sh.holes.push(hole);
      const cm = new THREE.MeshStandardMaterial({ color: 0xb8c0d8, emissive: 0x6a7cff, emissiveIntensity: 0, roughness: 0.4 }); cm.userData.noTint = true;
      const cres = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.18, bevelEnabled: false }), cm); cres.position.set(x, y + 1.85, z); cres.rotation.y = -a + Math.PI / 2; g.scene.add(cres); this.shrineMat = cm;
      w.addTree(x, z, 0.95, "city"); this.addLight(x, y + 2.0, z, 0x8f9fff, 10, 9); }
    // ---- the stone path from the bridge to the plaza
    this.ribbon(pA[0], pA[1], pB[0], pB[1], 2.4, stoneP, 0.045);
  }
  addLight(x, y, z, color, on, dist) { const pl = new THREE.PointLight(color, 0, dist, 1.7); pl.position.set(x, y, z); pl.userData.on = on; this.g.scene.add(pl); this.lights.push(pl); return pl; }
  bannerPole(x, z, face) {
    const g = this.g, w = this.w, M = this.mats, y = w.groundHeight(x, z, 40);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 3.4, 8), M.wood); pole.position.set(x, y + 1.7, z); g.scene.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.07, 0.07), M.wood); arm.position.set(x, y + 3.25, z); arm.rotation.y = face; g.scene.add(arm);
    const b = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.15), this.bannerMat()); b.position.set(x, y + 2.62, z); b.rotation.y = face; g.scene.add(b);
    w.addTree(x, z, 0.14, "city");
  }
  bannerMat() { if (!this._bannerMat) this._bannerMat = this.texMat("spr_moonbanner", { alphaTest: 0.5 }); return this._bannerMat; }
  carvingMat() { if (!this._carveMat) { const m = this.texMat("spr_carving", { alphaTest: 0.3 }); m.emissive = new THREE.Color(0x8f80ff); m.emissiveMap = m.map; m.emissiveIntensity = 0; m.color.setHex(0x202028); this._carveMat = m; } return this._carveMat; }
  lanternPiece() {
    if (this._lanternGeo) return this._lanternGeo;
    let geo = null, mat = null; const la = this.g.assets.glb.hf_lantern; if (la) la.model.traverse((o) => { if (o.isMesh && !geo) { geo = o.geometry.clone(); o.updateWorldMatrix(true, false); geo.applyMatrix4(o.matrixWorld); mat = o.material.clone(); } });
    if (!geo) { geo = new THREE.BoxGeometry(0.3, 0.5, 0.3); mat = new THREE.MeshStandardMaterial({ color: 0x9fb4ff }); }
    mat.emissive = new THREE.Color(H().glow.lantern); mat.emissiveIntensity = 0; if (mat.map) mat.emissiveMap = mat.map; mat.userData.noTint = true; this.lanternColor0 = mat.color.clone();
    this._lanternGeo = { geo, mat }; return this._lanternGeo;
  }
  // a model whose own texture glows in its colour (one glowing copy per id; the clones share its materials)
  glowModel(id, color) {
    if (!this._glow) this._glow = {}; if (this._glow[id]) return this._glow[id];
    const m = this.g.assets.glb[id].model.clone(); const seen = new Map();
    m.traverse((o) => { if (!o.isMesh) return; const mats = Array.isArray(o.material) ? o.material : [o.material]; const out = mats.map((mm) => { if (seen.has(mm)) return seen.get(mm); const c = mm.clone(); c.emissive = new THREE.Color(color); c.emissiveMap = c.map || null; c.emissiveIntensity = 0.55; c.userData.noTint = true; seen.set(mm, c); return c; }); o.material = Array.isArray(o.material) ? out : out[0]; });
    this._glow[id] = m; return m;
  }
  // a 3D plant (or rock) with its own coloured light that goes out when it is picked
  plantMesh(id, color, on, dist) {
    const grp = new THREE.Group(), a = this.g.assets.glb[id];
    if (a) grp.add(this.glowModel(id, color).clone()); else { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), new THREE.MeshStandardMaterial({ color })); m.position.y = 0.3; grp.add(m); }
    const l = new THREE.PointLight(color, on, dist, 1.8); l.position.y = 0.55; grp.add(l);
    return grp;
  }
  // a log hut: stacked bark logs, corner posts, a slate roof, a porch over the door, a carved glowing crescent above it, a moon
  // banner, a lantern each side of the door, ivy on the corners; inside a rug, the table set, shelves with jars, a crescent on
  // the back wall, a chest by the door and a hanging lamp. The bed stays in the back corner, the person near the front.
  buildHut(hx, hz, yaw, i) {
    const g = this.g, w = this.w, A = g.assets, V = H().village, M = this.mats, S = V.hutSize, HW = S / 2, WH = V.wallH, y0 = w.groundHeight(hx, hz, 40), sgn = i % 2 ? -1 : 1;
    const root = new THREE.Group(); root.position.set(hx, y0, hz); root.rotation.y = yaw; g.scene.add(root);
    const c = Math.cos(yaw), s = Math.sin(yaw); const world = (lx, lz) => [hx + lx * c + lz * s, hz - lx * s + lz * c];
    const box = (lx, ly, lz, sx, sy, sz, mat, ry = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat); m.position.set(lx, ly, lz); m.rotation.y = ry; root.add(m); return m; };
    const put = (id, lx, lz, ry, fallbackSize) => { const a = A.glb[id]; if (a) { const m = a.model.clone(); m.position.set(lx, 0.02, lz); m.rotation.y = ry; root.add(m); return m; } if (fallbackSize) return box(lx, fallbackSize[1] / 2, lz, fallbackSize[0], fallbackSize[1], fallbackSize[2], M.plank, ry); return null; };
    // floor
    box(0, 0.06, 0, S + 0.2, 0.12, S + 0.2, M.plank);
    // log walls: eight logs high; the front wall leaves the doorway and carries two lintel logs
    const LR = 0.17, nLog = Math.round(WH / (LR * 2)), dw = 1.3, side = (S - dw) / 2;
    const log = (lx, ly, lz, len, along) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(LR, LR, len, 9), M.bark); m.position.set(lx, ly, lz); m.rotation.z = along === "x" ? Math.PI / 2 : 0; m.rotation.x = along === "z" ? Math.PI / 2 : 0; root.add(m); };
    for (let k = 0; k < nLog; k++) { const ly = LR + k * LR * 2; log(0, ly, -HW, S, "x"); log(-HW, ly, 0, S, "z"); log(HW, ly, 0, S, "z");
      if (ly < WH - 0.55) { log(-HW + side / 2, ly, HW, side, "x"); log(HW - side / 2, ly, HW, side, "x"); } else log(0, ly, HW, S, "x"); }
    for (const [lx, lz] of [[-HW, -HW], [HW, -HW], [-HW, HW], [HW, HW]]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.23, WH + 0.3, 9), M.wood); p.position.set(lx, (WH + 0.3) / 2, lz); root.add(p); }
    for (const sd of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, WH - 0.4, 8), M.wood); p.position.set(sd * dw / 2, (WH - 0.4) / 2, HW); root.add(p); }
    // colliders: a chain of round posts along each wall (an axis-aligned box of a turned wall would fill the room)
    const wallLine = (ax, az, bx, bz) => { const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.4)); for (let k = 0; k <= n; k++) { const [wx, wz] = world(ax + (bx - ax) * k / n, az + (bz - az) * k / n); w.addTree(wx, wz, 0.3, "city"); } };
    wallLine(-HW, -HW, HW, -HW); wallLine(-HW, -HW, -HW, HW); wallLine(HW, -HW, HW, HW); wallLine(-HW, HW, -dw / 2, HW); wallLine(dw / 2, HW, HW, HW);
    // roof: slate shingles on a low pyramid with a wooden eave and a ridge knob
    const roof = new THREE.Mesh(new THREE.ConeGeometry(S * 0.86, V.roofH, 4), M.slate); roof.rotation.y = Math.PI / 4; roof.position.y = WH + V.roofH / 2 - 0.05; root.add(roof);
    box(0, WH + 0.02, 0, S + 1.1, 0.16, S + 1.1, M.wood);
    { const knob = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), M.wood); knob.position.y = WH + V.roofH - 0.02; root.add(knob); }
    // porch: two posts and a sloping slate roof over the door
    for (const sd of [-1, 1]) { box(sd * 1.25, 1.15, HW + 1.5, 0.14, 2.3, 0.14, M.wood); const [px, pz] = world(sd * 1.25, HW + 1.5); w.addTree(px, pz, 0.14, "city"); }
    { const pr = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.08, 2.0), M.slate); pr.position.set(0, WH - 0.1, HW + 0.95); pr.rotation.x = 0.28; root.add(pr); box(0, 2.3, HW + 1.5, 2.9, 0.1, 0.1, M.wood); }
    // the carved glowing crescent above the door, the banner right of it, a window left with open shutters, ivy on the corners
    { const cv = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.55), this.carvingMat()); cv.position.set(0, WH - 0.28, HW + LR + 0.02); root.add(cv); }
    { const b = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.9), this.bannerMat()); b.position.set(HW - 0.95, WH - 0.62, HW + LR + 0.03); root.add(b); box(HW - 0.95, WH - 0.14, HW + LR + 0.02, 0.8, 0.06, 0.06, M.wood); }
    { box(-HW + 0.95, 1.55, HW + LR - 0.02, 0.8, 0.7, 0.08, new THREE.MeshStandardMaterial({ color: 0x0c1020, roughness: 0.3, metalness: 0.2 })); for (const sd of [-1, 1]) box(-HW + 0.95 + sd * 0.62, 1.55, HW + LR + 0.12, 0.36, 0.7, 0.05, M.plank, sd * 0.5); }
    for (const [lx, lz] of [[-HW, HW], [HW, HW]]) { const iv = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.3, 0.14), M.hedge); iv.position.set(lx + (lx < 0 ? 0.1 : -0.1), 1.25, lz + 0.26); root.add(iv); }
    { const iv = new THREE.Mesh(new THREE.BoxGeometry(S + 1.0, 0.32, 0.14), M.hedge); iv.position.set(0, WH + 0.1, HW + 0.62); root.add(iv); }
    // lanterns both sides of the door (lit only at night; part of the forest's lantern mesh)
    for (const sd of [-1, 1]) { const [lx, lz] = world(sd * (dw / 2 + 0.5), HW + LR + 0.3); this.hutLanterns.push([lx, y0 + WH - 0.95, lz]); }
    // inside: the rug, the bed in the back corner, the table set in the other back corner, shelves and a crescent on the
    // back wall, a chest by the door, a lamp hanging from the roof
    { const r = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.9), M.rug); r.rotation.x = -Math.PI / 2; r.position.set(0, 0.125, 0.2); root.add(r); }
    const bl = [-1.3 * sgn, -HW + 1.1];
    if (!put("hutbed", bl[0], bl[1], Math.PI / 2)) box(bl[0], 0.3, bl[1], 1.0, 0.5, 2.0, M.plank);
    { const [bx, bz] = world(bl[0], bl[1]); w.addBox(bx - 0.7, bx + 0.7, y0, y0 + 0.5, bz - 1.0, bz + 1.0); this.beds.push({ x: bx, z: bz, y: y0 + 0.1, hut: i }); }
    { const tl = [1.55 * sgn, -HW + 1.5]; put("hf_interior", tl[0], tl[1], sgn > 0 ? -Math.PI / 6 : Math.PI / 6, [1.4, 0.9, 1.4]); const [tx, tz] = world(tl[0], tl[1]); w.addTree(tx, tz, 0.72, "city"); }
    for (const [lx, ly] of [[0.1 * sgn, 1.35], [0.1 * sgn, 1.85]]) { box(lx, ly, -HW + LR + 0.2, 1.4, 0.05, 0.3, M.plank); for (let k = 0; k < 3; k++) { const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.22, 8), new THREE.MeshStandardMaterial({ color: [0x8a5a3a, 0x4a6a8a, 0x6a4a7a][k], roughness: 0.6 })); jar.position.set(lx - 0.5 + k * 0.5, ly + 0.14, -HW + LR + 0.2); root.add(jar); } }
    { const cv = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), this.carvingMat()); cv.position.set(0.1 * sgn, 2.3, -HW + LR + 0.02); root.add(cv); }
    { const cl = [1.6 * sgn, HW - 0.9]; put("woodchest", cl[0], cl[1], sgn > 0 ? Math.PI / 2 : -Math.PI / 2, [0.9, 0.6, 0.6]); const [cx2, cz2] = world(cl[0], cl[1]); w.addTree(cx2, cz2, 0.5, "city"); }
    { const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 5), M.wood); chain.position.set(0, WH + 0.1, 0); root.add(chain); const [lx, lz] = world(0, 0); this.hutLanterns.push([lx, y0 + WH - 0.95, lz]); this.addLight(lx, y0 + WH - 0.75, lz, H().glow.hut, 14, 9); }
    const [ix, iz] = world(1.1 * sgn, 0.6), [fx, fz] = world(0, HW + 2.4);
    return { x: hx, z: hz, y: y0, yaw, root, inside: { x: ix, z: iz, y: y0 }, front: { x: fx, z: fz, y: w.groundHeight(fx, fz, 40) } };
  }

  // ---------------- the Monial people: rigged Higgsfield scans in their own colours, a blue rim of light, posed on their bones ----------------
  buildNpcs() {
    const g = this.g, w = this.w, A = g.assets, N = H().npcs, V = H().village;
    const spots = {
      farmer: this.farmerSpot, wife: { ...this.huts[0].inside, face: this.huts[0].yaw }, explorer: this.explorerSpot,
      witch: { ...this.huts[1].inside, face: this.huts[1].yaw }, warrior: { ...this.huts[2].front, face: this.huts[2].yaw + Math.PI }, historian: { ...this.huts[3].inside, face: this.huts[3].yaw },
      lady: { ...this.ladySpot, face: Math.PI / 2 },
    };
    const rimU = this.rimU;
    for (const role of Object.keys(N)) {
      const sp = spots[role], asset = A.glb[N[role].model]; let body, bones = null, bind = null;
      if (asset) { let skinned = false; asset.model.traverse((o) => { if (o.isSkinnedMesh) skinned = true; }); body = skinned ? skeletonClone(asset.model) : asset.model.clone(); if (skinned) { bones = {}; body.traverse((o) => { if (o.isBone) bones[o.name] = o; }); bind = {}; for (const k of Object.keys(bones)) bind[k] = bones[k].quaternion.clone(); } }
      else { body = new THREE.Group(); const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, (N[role].h || 1.75) - 0.9, 4, 8), new THREE.MeshStandardMaterial({ color: 0x8fb0ff })); m.position.y = (N[role].h || 1.75) / 2; body.add(m); }
      // the scan's own colours, solid; a thin blue glow along the edges (a view-angle rim added to the emissive term)
      body.traverse((o) => { if (o.isMesh) { const m = o.material.clone(); m.transparent = false; m.opacity = 1; m.emissive = new THREE.Color(0x000000); m.emissiveIntensity = 0; m.depthWrite = true; m.userData.noTint = true;
        m.onBeforeCompile = (sh) => { sh.uniforms.uRim = rimU; sh.fragmentShader = sh.fragmentShader.replace("uniform vec3 emissive;", "uniform vec3 emissive;\nuniform float uRim;").replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n{ float fr = 1.0 - clamp(dot(normalize(vViewPosition), normalize(normal)), 0.0, 1.0); fr = pow(fr, 3.0); totalEmissiveRadiance += vec3(0.30, 0.42, 1.0) * fr * uRim; }"); };
        m.customProgramCacheKey = () => "monialrim"; o.material = m; o.frustumCulled = false; } });
      body.position.set(sp.x, sp.y, sp.z); body.rotation.y = sp.face; body.visible = false; g.scene.add(body);
      w.addTree(sp.x, sp.z, 0.45, "city");
      this.npcs.push({ role, body, bones, bind, x: sp.x, z: sp.z, y: sp.y, yaw: sp.face, name: STR.hidden.names[role] });
    }
  }
  poseNpc(n) {
    const b = n.body, B = n.bones, Q0 = n.bind; if (!B || !Q0) return;
    for (const k of ["Spine", "Spine01", "Spine02", "Head", "neck", "LeftArm", "RightArm", "LeftForeArm", "RightForeArm"]) if (B[k] && Q0[k]) B[k].quaternion.copy(Q0[k]);
    b.updateMatrixWorld(true);
    const qb = b.getWorldQuaternion(new THREE.Quaternion()), F = new THREE.Vector3(0, 0, 1).applyQuaternion(qb), U = new THREE.Vector3(0, 1, 0), R = new THREE.Vector3().crossVectors(F, U).normalize();
    const pw = new THREE.Quaternion(), pinv = new THREE.Quaternion();
    const turn = (bone, qWorld) => { bone.parent.getWorldQuaternion(pw); pinv.copy(pw).invert(); bone.quaternion.copy(pinv.clone().multiply(qWorld).multiply(pw).multiply(bone.quaternion)); };
    const wa = new THREE.Vector3(), wb = new THREE.Vector3();
    for (const [side, sgn] of [["Right", 1], ["Left", -1]]) { const arm = B[side + "Arm"], fore = B[side + "ForeArm"]; if (!arm || !fore) continue; arm.getWorldPosition(wa); fore.getWorldPosition(wb); const v = wb.sub(wa).normalize(); const rest = Math.atan2(v.dot(R) * sgn, -v.dot(U)); turn(arm, new THREE.Quaternion().setFromAxisAngle(F, sgn * (rest - 7 * D2R))); b.updateMatrixWorld(true); turn(fore, new THREE.Quaternion().setFromAxisAngle(R, 12 * D2R)); b.updateMatrixWorld(true); }
    const t = this.g.time + n.x * 0.01; const sp = B.Spine02 || B.Spine01 || B.Spine; if (sp) { turn(sp, new THREE.Quaternion().setFromAxisAngle(R, Math.sin(t * 1.0) * 0.014)); b.updateMatrixWorld(true); }
    if (B.Head && n.headTurn) { turn(B.Head, new THREE.Quaternion().setFromAxisAngle(U, n.headTurn)); b.updateMatrixWorld(true); }
  }

  // ---------------- dressing: lanterns on every tree, carvings and veins on the trunks, the moonstone boulders, fireflies ----------------
  buildDressing() {
    const g = this.g, w = this.w, C = H(), A = g.assets, rng = this.rng;
    // every tree inside the line, with its trunk size (the collision circle is 0.55 x the tree's scale)
    const trees = [];
    for (const [x, z] of (w.treePoints || [])) { if (!this.inside(x, z)) continue; let r = 0.55; for (const t of w.treesNear(x, z)) if (!t.tag && Math.abs(t.x - x) < 0.01 && Math.abs(t.z - z) < 0.01) { r = t.r; break; } trees.push({ x, z, r, s: r / 0.55, y: w.groundHeight(x, z, 40) }); }
    this.treesInside = trees;
    // ---- lanterns: four or five in every tree's branches, on the bridge rails and at the huts' doors. By day they hang dark
    // and a third of them crooked, some cracked; at the turning they straighten and light. One light per tree.
    const items = [];
    for (const t of trees) { const n = C.lanternsPerTree[0] + (rng() < 0.5 ? C.lanternsPerTree[1] - C.lanternsPerTree[0] : 0); for (let k = 0; k < n; k++) { const a = rng() * Math.PI * 2, d = 1.3 + rng() * 1.1 * Math.max(0.8, t.s); items.push({ x: t.x + Math.cos(a) * d, y: t.y + 2.4 + 1.2 * t.s + rng() * 1.6, z: t.z + Math.sin(a) * d, yaw: rng() * 6.28, tilt: rng() < 0.33 ? (rng() - 0.5) * 0.8 : 0, crack: rng() < 0.3 }); }
      this.addLight(t.x, t.y + 3.6 + 0.8 * t.s, t.z, C.glow.lantern, 16, 13); }
    for (const [x, y, z] of this.railLanterns || []) items.push({ x, y, z, yaw: rng() * 6.28, tilt: rng() < 0.4 ? (rng() - 0.5) * 0.7 : 0, crack: rng() < 0.3 });
    for (let i = 0; i < (this.railLanterns || []).length; i += 2) { const [x, y, z] = this.railLanterns[i]; this.addLight(x, y + 0.6, z, C.glow.lantern, 9, 9); }
    for (const [x, y, z] of this.hutLanterns || []) items.push({ x, y, z, yaw: 0, tilt: 0, crack: false });
    { const { geo, mat } = this.lanternPiece(); const inst = new THREE.InstancedMesh(geo, mat, Math.max(1, items.length)); inst.count = items.length; inst.frustumCulled = false; g.scene.add(inst); this.lanterns = inst; this.lanternMat = mat; this.lanternItems = items;
      const cm = this.texMat("spr_cracks", { alphaTest: 0.35 }); cm.color.setHex(0xd8dce8); const cracks = items.filter((it) => it.crack); const ci = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.34, 0.5), cm, Math.max(1, cracks.length)); ci.count = cracks.length; ci.frustumCulled = false; g.scene.add(ci); this.cracks = ci; this.crackItems = cracks;
      this.layLanterns(0); }
    // ---- the carved crescent on every third trunk (dark by day, glowing at night) and the glowing veins up every trunk
    { const carved = trees.filter((_, i) => i % C.carveEvery === 0); const ci = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.9, 0.9), this.carvingMat(), Math.max(1, carved.length)); const d = new THREE.Object3D();
      carved.forEach((t, i) => { const a = rng() * Math.PI * 2, rr = t.r * 0.95 + 0.05; d.position.set(t.x + Math.cos(a) * rr, t.y + 1.75, t.z + Math.sin(a) * rr); d.rotation.set(0, Math.atan2(Math.cos(a), Math.sin(a)), 0); d.scale.setScalar(0.8 + 0.3 * Math.min(1.4, t.s)); d.updateMatrix(); ci.setMatrixAt(i, d.matrix); });
      ci.count = carved.length; ci.instanceMatrix.needsUpdate = true; ci.frustumCulled = false; g.scene.add(ci); this.carvings = ci;
      const vm = this.texMat("spr_veins", { alphaTest: 0.05, transparent: true, depthWrite: false, additive: true, repeat: [2, 2] }); vm.emissive = new THREE.Color(0x7a6cff); vm.emissiveMap = vm.map; vm.emissiveIntensity = 1.4; vm.opacity = 0; vm.side = THREE.FrontSide;
      const vg = new THREE.CylinderGeometry(1, 1, 1, 14, 1, true); const vi = new THREE.InstancedMesh(vg, vm, Math.max(1, trees.length));
      trees.forEach((t, i) => { const rr = t.r + 0.07, hh = 3.6 + 1.6 * t.s; d.position.set(t.x, t.y + hh / 2 + 0.1, t.z); d.rotation.set(0, rng() * 6.28, 0); d.scale.set(rr, hh, rr); d.updateMatrix(); vi.setMatrixAt(i, d.matrix); });
      vi.count = trees.length; vi.instanceMatrix.needsUpdate = true; vi.frustumCulled = false; vi.visible = false; g.scene.add(vi); this.veins = vi; this.veinMat = vm; }
    // ---- fixed lights of the village night (the fountain, the field)
    const V = H().village;
    this.addLight(V.x, this.villageY + 2.6, V.z, 0x6a7cff, 26, 22); this.addLight(this.field.x, this.field.y + 2.0, this.field.z, 0xff5a4a, 10, 12);
    // ---- the moonstone rocks: ten mossy boulders stand in the forest by day; at the turning each becomes a rock of moonstone
    { this.stones = []; let guard = 0; const b = this.bounds();
      while (this.stones.length < C.spawn.moonstone && guard++ < 20000) { const x = b.x0 + rng() * (b.x1 - b.x0), z = b.z0 + rng() * (b.z1 - b.z0); if (!this.inside(x, z) || this.lakePen2(x, z) > -8 || this.inVillage(x, z) || w.distToPath(x, z) < 5 || hiddenPathDist(x, z) < 4 || !w.inForest(x, z)) continue; if (w.treesNear(x, z).some((t) => Math.hypot(t.x - x, t.z - z) < 2.2)) continue; if (this.stones.some((s) => Math.hypot(s.x - x, s.z - z) < 18)) continue;
        const y = w.groundHeight(x, z, 40), yaw = rng() * 6.28; let boulder; const ba = A.glb.boulder; if (ba) { boulder = ba.model.clone(); boulder.scale.multiplyScalar(0.7); } else { boulder = new THREE.Mesh(new THREE.DodecahedronGeometry(0.7, 1), new THREE.MeshStandardMaterial({ color: 0x6a6f64, roughness: 1 })); boulder.position.y = 0.5; }
        boulder.position.x = x; boulder.position.z = z; boulder.position.y += y; boulder.rotation.y = yaw; g.scene.add(boulder);
        const rock = this.plantMesh("hf_moonrock", C.glow.moonstone, 10, 10); rock.position.set(x, y, z); rock.rotation.y = yaw; rock.visible = false; g.scene.add(rock);
        w.addTree(x, z, 0.8, "city"); this.stones.push({ kind: "moonstone", x, z, y, boulder, grp: rock, taken: false, left: 1 }); } }
    // ---- white fireflies
    { const cv = document.createElement("canvas"); cv.width = cv.height = 32; const c2 = cv.getContext("2d"); const gr = c2.createRadialGradient(16, 16, 1, 16, 16, 15); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.4, "rgba(230,235,255,0.5)"); gr.addColorStop(1, "rgba(220,230,255,0)"); c2.fillStyle = gr; c2.fillRect(0, 0, 32, 32); const tex = new THREE.CanvasTexture(cv);
      this.fireflies = []; for (let i = 0; i < C.fireflyClusters; i++) { const t = trees[Math.floor(rng() * trees.length)] || { x: this.cx, z: this.cz, y: 0 }; const N = 12, pos = new Float32Array(N * 3); for (let k = 0; k < N; k++) { pos[k * 3] = (rng() - 0.5) * 6; pos[k * 3 + 1] = 0.6 + rng() * 2.4; pos[k * 3 + 2] = (rng() - 0.5) * 6; } const pts = new THREE.Points(new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(pos, 3)), new THREE.PointsMaterial({ color: 0xffffff, size: 0.18, map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 })); pts.position.set(t.x + 3, t.y, t.z + 2); g.scene.add(pts); this.fireflies.push({ pts, phase: rng() * 9 }); } }
    if (g.scanLights && g.vlights) g.scanLights();
  }
  // the lanterns' matrices for a night-fraction k: crooked by day (k = 0), straight at night (k = 1)
  layLanterns(k) {
    const inst = this.lanterns, items = this.lanternItems; if (!inst) return; const d = new THREE.Object3D();
    items.forEach((it, i) => { d.position.set(it.x, it.y, it.z); d.rotation.set(0, it.yaw, it.tilt * (1 - k)); d.scale.setScalar(1.5); d.updateMatrix(); inst.setMatrixAt(i, d.matrix); });
    inst.instanceMatrix.needsUpdate = true;
    if (this.cracks && k < 0.5) { this.crackItems.forEach((it, i) => { d.position.set(it.x + Math.sin(it.yaw) * 0.22, it.y + 0.42, it.z + Math.cos(it.yaw) * 0.22); d.rotation.set(0, it.yaw, it.tilt * (1 - k)); d.scale.setScalar(1); d.updateMatrix(); this.cracks.setMatrixAt(i, d.matrix); }); this.cracks.instanceMatrix.needsUpdate = true; }
  }
  buildMoon() {
    const cv = document.createElement("canvas"); cv.width = cv.height = 256; const c = cv.getContext("2d");
    const halo = c.createRadialGradient(128, 128, 60, 128, 128, 128); halo.addColorStop(0, "rgba(140,150,255,0.55)"); halo.addColorStop(1, "rgba(120,110,255,0)"); c.fillStyle = halo; c.fillRect(0, 0, 256, 256);
    c.fillStyle = "#c9d2ff"; c.beginPath(); c.arc(128, 128, 62, 0, Math.PI * 2); c.fill();
    c.fillStyle = "rgba(150,150,220,0.35)"; for (const [x, y, r] of [[100, 110, 14], [140, 150, 10], [150, 100, 7], [112, 150, 6], [135, 120, 5]]) { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); }
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false, opacity: 0, fog: false })); this.g.scene.add(sp); this.moon = sp;
  }

  // ---------------- the night itself ----------------
  collectTint() {
    const g = this.g, treeMats = new Set(); const ta = g.assets.glb.tree; if (ta) ta.model.traverse((o) => { if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => treeMats.add(m)); });
    const want = /t_bark|t_grass|t_forestfloor|t_woodplank|t_floorboard|t_leaf|t_darkwood|t_slate|t_hedge/;
    this.tintMap = new Map();
    g.scene.traverse((o) => { if (!o.isMesh && !o.isInstancedMesh) return; for (const m of (Array.isArray(o.material) ? o.material : [o.material])) { if (!m || this.tintMap.has(m) || !m.isMeshStandardMaterial || m.userData.noTint) continue; const src = m.map && m.map.image && typeof m.map.image.src === "string" ? m.map.image.src : ""; if (treeMats.has(m) || m.userData.hiddenTint || (src && want.test(src))) this.tintMap.set(m, { color: m.color.clone(), emissive: m.emissive.clone(), ei: m.emissiveIntensity, emap: m.emissiveMap, leaf: treeMats.has(m) }); } });
  }
  updateLook(k, force) {
    const g = this.g, w = this.w, C = H(); if (!force && k === this.k) return; const prevK = this.k; this.k = k; w.hiddenK = k;
    if (k > 0 && !this.tintMap) this.collectTint();
    if (this.tintMap) for (const [m, o] of this.tintMap) {
      const tc = C.tint.color; m.color.setRGB(o.color.r * (1 + (tc[0] - 1) * k), o.color.g * (1 + (tc[1] - 1) * k), o.color.b * (1 + (tc[2] - 1) * k));
      m.emissive.copy(o.emissive).lerp(new THREE.Color(C.tint.emissive), k); m.emissiveIntensity = o.ei + ((o.leaf ? C.tint.leafI : C.tint.emissiveI) - o.ei) * k;
      const em = k > 0 ? (m.map || o.emap) : o.emap; if (em !== m.emissiveMap) { m.emissiveMap = em; m.needsUpdate = true; }
    }
    const show = k > 0.35, night = k >= 0.5;
    // water: the day sheet fades out as the night sheet fades in
    if (this.dayWater) { this.dayMat.opacity = 0.88 * (1 - k); this.dayWater.visible = k < 0.999; }
    if (this.nightWater) { this.nightMat.opacity = 0.74 * k; this.nightWater.visible = k > 0.001; }
    // lanterns: dark and crooked by day, straight and lit at night
    if (this.lanterns) { this.lanternMat.color.copy(this.lanternColor0 || new THREE.Color(0xffffff)).lerp(new THREE.Color(0x4e5264), 1 - k); this.lanternMat.emissiveIntensity = 2.6 * k; if (k !== prevK) this.layLanterns(k); if (this.cracks) this.cracks.visible = k < 0.5; }
    // carvings and veins
    { const cm = this.carvingMat(); cm.color.copy(new THREE.Color(0x202028)).lerp(new THREE.Color(0xffffff), k); cm.emissiveIntensity = 1.6 * k; }
    if (this.veins) { this.veins.visible = k > 0.001; this.veinMat.opacity = 0.9 * k; }
    if (this.shrineMat) this.shrineMat.emissiveIntensity = 1.5 * k;
    // the fountain: mossy and dry by day, clean and running at night
    if (this.fountainDay) this.fountainDay.visible = !night || !this.fountainNight; if (this.fountainNight) this.fountainNight.visible = night;
    if (this.fountainWater) this.fountainWater.visible = show; if (this.spray) this.spray.pts.visible = show;
    for (const n of this.npcs) n.body.visible = show; this.rimU.value = 0.9 * k;
    for (const f of this.fieldPlants || []) f.visible = show;
    for (const l of this.lights) l.intensity = (l.userData.on || 0) * k;
    for (const f of this.fireflies || []) f.pts.material.opacity = 0.9 * k;
    if (this.moon) this.moon.material.opacity = 0.95 * k;
    for (const p of this.pick) if (p.grp) p.grp.visible = show && !p.taken;
    for (const s of this.stones || []) { s.boulder.visible = !show; s.grp.visible = show && !s.taken; }
  }
  activate() { this.active = true; this.voidTaken = 0; this.spawnPickups(); this.g.ui.toast(STR.hidden.enter); if (this.g.audio.sPickup) this.g.audio.sPickup(); }
  deactivate() { this.active = false; this.clearPickups(); this.endBattle(false); if (this.g.ui) this.g.ui.strideBar(!!this.g.strideOn); }
  spawnPickups() {
    const g = this.g, w = this.w, S = H().spawn, G = H().glow, rng = g.rng; this.clearPickups();
    const b = this.bounds();
    const place = (kind, n, mkMesh) => { let guard = 0; const spots = []; while (spots.length < n && guard++ < 20000) { const x = b.x0 + rng() * (b.x1 - b.x0), z = b.z0 + rng() * (b.z1 - b.z0); if (!this.inside(x, z) || this.lakePen2(x, z) > -6 || this.inVillage(x, z) || w.distToPath(x, z) < 4 || hiddenPathDist(x, z) < 2.5 || !w.inForest(x, z)) continue; if (w.treesNear(x, z).some((t) => Math.hypot(t.x - x, t.z - z) < 1.5)) continue; if (this.pick.some((p) => Math.hypot(p.x - x, p.z - z) < 4)) continue; const y = w.groundHeight(x, z, 40); const grp = mkMesh(); grp.position.set(x, y, z); grp.rotation.y = rng() * Math.PI * 2; g.scene.add(grp); const p = { kind, x, z, y, grp, taken: false, left: 0 }; this.pick.push(p); spots.push(p); } };
    place("starflower", S.starflower, () => this.plantMesh("hf_starflower", G.starflower, 7, 7));
    place("magic_mushroom", S.magic_mushroom, () => this.plantMesh("hf_magicmush", G.magic_mushroom, 7, 7));
    const nv = S.void_bloom[0] + Math.floor(rng() * (S.void_bloom[1] - S.void_bloom[0] + 1)); this.voidMax = nv;
    place("void_bloom", nv, () => this.plantMesh("hf_voidbloom", G.void_bloom, 10, 9));
    // the moonstone rocks regrow every night on their fixed spots
    for (const s of this.stones || []) { s.taken = false; this.pick.push(s); }
    if (g.scanLights && g.vlights) g.scanLights();
  }
  clearPickups() { for (const p of this.pick) if (p.kind !== "moonstone") this.g.scene.remove(p.grp); this.pick = []; this.mining = null; }
  bounds() { let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; for (const [x, z] of this.poly) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); } return { x0, z0, x1, z1 }; }
  inVillage(x, z) { const V = H().village; return Math.hypot(x - V.x, z - V.z) < V.hutR + 9 || (this.field && Math.abs(x - this.field.x) < H().field.w / 2 + 3 && Math.abs(z - this.field.z) < H().field.d / 2 + 3); }
  understands() { const s = this.g.player.inv.selected(); return !!this.g.monialKnown || !!(s && s.id === "monial_staff"); }
  strideOn() { return this.active && !!this.g.monialStride; }
  waterSource(x, z) { if (this.lakePen2(x, z) > -4.5) return { x, z, y: 0.3, name: "lake2" }; if (this.active && this.fountain) { const f = this.fountain, dx = x - f.x, dz = z - f.z, d = Math.hypot(dx, dz) || 1, R = this.fountainR || 2.3; if (d < R + 2.6) return { x: f.x + dx / d * (R - 0.25), z: f.z + dz / d * (R - 0.25), y: f.y + 0.9, name: "fountain2" }; } return null; }   // the rim facing you: the basin's collider keeps you just outside it, inside the 2.6 m prompt reach

  // ---------------- every frame ----------------
  update(dt) {
    const g = this.g, w = this.w, C = H(), p = g.player, T = CFG.time, cycle = T.dayLen + T.nightLen, t = g.time % cycle, W = C.window;
    this.t += dt;
    const inPoly = this.inside(p.pos.x, p.pos.z);
    let k = this.active ? 1 : 0;
    if (!this.active) {
      if (t >= T.dayLen - W && t <= T.dayLen + W) {
        if (!this.pending) this.pending = { ok: inPoly && t < T.dayLen - W + 0.25, started: t };
        else this.pending.ok = this.pending.ok && inPoly;
        if (this.pending.ok) k = clamp01((t - (T.dayLen - W)) / (2 * W));
      } else if (this.pending) { if (this.pending.ok && t > T.dayLen + W && t < T.dayLen + W + 30) { this.activate(); k = 1; } this.pending = null; }
    } else {
      // dawn: the last two seconds of the night and the first two of the day turn it back; sleeping skips straight to day
      if (!g.isNight) { k = clamp01(0.5 - t / (2 * W)); if (t > W || t > 60) { this.deactivate(); k = 0; } }
      else if (t >= cycle - W) k = clamp01((cycle - t) / W) * 0.5 + 0.5;
      // a force holds you in
      if (!inPoly) { const q = this.nearestInside(p.pos.x, p.pos.z); p.pos.x = q.x; p.pos.z = q.z; p.vel.x *= -0.3; p.vel.z *= -0.3; if (this.pushT <= 0) { this.pushT = 2.5; g.ui.toast(STR.hidden.force); g.audio.sDeny(); } }
      if (g.player.pos.y < -20 || Math.hypot(p.pos.x - this.cx, p.pos.z - this.cz) > 900) this.deactivate();
      // nothing hostile walks the hidden night: a werewolf or a beast that spawns or strays inside is set down outside the
      // line; the forest's small things (the dragonfly, bats, beetles) simply leave
      const outside = (c) => { const q = this.nearestInside(c.pos.x, c.pos.z); const dx = q.x - this.cx, dz = q.z - this.cz, d = Math.hypot(dx, dz) || 1; c.pos.x = q.x + dx / d * 14; c.pos.z = q.z + dz / d * 14; if (c.group) c.group.position.set(c.pos.x, w.groundHeight(c.pos.x, c.pos.z, 40), c.pos.z); c.state = "wander"; c.target = null; };
      for (const wolf of g.wolves) { if (wolf.dead || !this.inside(wolf.pos.x, wolf.pos.z)) continue; outside(wolf); }
      for (const c of g.creatures || []) { if (c.dead || c.gone || c.type === "elisia" || !c.pos || !this.inside(c.pos.x, c.pos.z)) continue; if (c.hover !== undefined || c.type === "meganeura" || c.type === "bat" || c.type === "beetle") { c.gone = true; if (c.group) c.group.visible = false; } else outside(c); }
    }
    this.pushT -= dt;
    this.updateLook(k);
    // the second lake: the deep turns you back like the first
    { const L = H().lake, pen = this.lakePen2(p.pos.x, p.pos.z); if (pen > L.wade && !this.floorAt(p.pos.x, p.pos.z, p.pos.y)) { const dx = p.pos.x - L.x, dz = p.pos.z - L.z, d = Math.hypot(dx, dz) || 1, r = this.lakeR(Math.atan2(dz, dx)) - L.wade; p.pos.x = L.x + dx / d * r; p.pos.z = L.z + dz / d * r; } }
    if (this.k > 0) {
      if (this.nightNorm) { this.nightNorm.offset.x = (this.t * 0.012) % 1; this.nightNorm.offset.y = (Math.sin(this.t * 0.07) * 0.08 + this.t * 0.006) % 1; }
      for (const n of this.npcs) { const d = Math.hypot(p.pos.x - n.x, p.pos.z - n.z); n.headTurn = d < 8 ? Math.max(-0.7, Math.min(0.7, ((Math.atan2(p.pos.x - n.x, p.pos.z - n.z) - n.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI)) : 0; if (d < 40) this.poseNpc(n); }
      if (this.spray) { const S = this.spray, P = S.pos, sc = S.sc || 1; for (let i = 0; i < S.N; i++) { const u = (this.t * 0.55 + S.seeds[i]) % 1; const a = S.seeds[i] * Math.PI * 2 * 7; P[i * 3] = Math.cos(a) * u * 1.4 * sc; P[i * 3 + 1] = (1.2 + 2.2 * Math.sin(u * Math.PI)) * sc; P[i * 3 + 2] = Math.sin(a) * u * 1.4 * sc; } S.pts.geometry.attributes.position.needsUpdate = true; }
      for (const f of this.fireflies || []) { const P = f.pts.geometry.attributes.position; for (let i = 0; i < P.count; i++) P.setY(i, 0.8 + 1.2 * (0.5 + 0.5 * Math.sin(this.t * 0.8 + f.phase + i * 1.7))); P.needsUpdate = true; }
      if (this.moon) { const cam = g.camera, lim = (cam ? cam.far : 400) * 0.85, M = C.moon; this.moon.position.set(cam.position.x + M.dir[0] * lim, cam.position.y + M.dir[1] * lim, cam.position.z + M.dir[2] * lim); const sc = M.size * lim / 400; this.moon.scale.set(sc, sc, 1); }
    }
    this.updateMining(dt); this.updateBattle(dt);
  }
  nearestInside(x, z) {
    let best = null, bd = 1e9;
    for (let i = 0; i < this.poly.length; i++) { const [ax, az] = this.poly[i], [bx, bz] = this.poly[(i + 1) % this.poly.length]; const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1; const u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)); const qx = ax + dx * u, qz = az + dz * u, d = Math.hypot(x - qx, z - qz); if (d < bd) { bd = d; best = [qx, qz]; } }
    const dx = this.cx - best[0], dz = this.cz - best[1], d = Math.hypot(dx, dz) || 1;
    return { x: best[0] + dx / d * 0.8, z: best[1] + dz / d * 0.8 };
  }

  // ---------------- picking and mining in the night ----------------
  pickUp(p) {
    const g = this.g, S = STR.hidden, inv = g.player.inv;
    if (p.kind === "void_bloom" && this.voidTaken >= this.voidMax) { g.ui.toast(S.voidEnough); g.audio.sDeny(); return; }
    if (!inv.add(p.kind, 1)) { g.ui.toast(STR.inventoryFull); g.audio.sDeny(); return; }
    if (p.kind === "void_bloom") this.voidTaken++;
    p.taken = true; p.grp.visible = false; g.audio.sPickup(); g.ui.renderHotbar(inv); g.ui.toast(`${STR.pickUp} ${STR.items[p.kind].name}`);
  }
  mineStart(p, pickId) { if (this.mining && this.mining.p === p) return; this.mining = { p, pick: pickId, t: 0, need: pickId === "et_pickaxe" ? 2 : 4, swingT: 0 }; }
  updateMining(dt) {
    const g = this.g, p = g.player, M = this.mining; if (!M) return;
    const held = g.ui.held && g.ui.held.has("KeyF"), sel = p.inv.selected();
    if (!held || g.menuOpen || !sel || sel.id !== M.pick || M.p.taken || Math.hypot(p.pos.x - M.p.x, p.pos.z - M.p.z) > 3.6) { this.mining = null; return; }
    M.t += dt; M.swingT += dt; if (M.swingT > 0.7) { M.swingT = 0; if (g.audio.sHit) g.audio.sHit(); }
    if (M.t < M.need) return;
    if (!p.inv.add("moonstone", 1)) { g.ui.toast(STR.inventoryFull); g.audio.sDeny(); this.mining = null; return; }
    M.p.taken = true; M.p.grp.visible = false; g.ui.renderHotbar(p.inv); g.ui.toast(STR.hidden.moonstoneGot); g.audio.sPickup(); this.mining = null;
  }

  // ---------------- the people ----------------
  gibberish(n = 2) { const syl = ["mo", "ni", "al", "the", "ra", "ve", "lu", "sha", "ir", "en", "ka", "do", "ya", "ol", "ess", "tir"]; const r = this.g.rng; const word = () => { let s = ""; const k = 1 + Math.floor(r() * 3); for (let i = 0; i < k; i++) s += syl[Math.floor(r() * syl.length)]; return s; }; const lines = []; for (let i = 0; i < n; i++) { const w = 3 + Math.floor(r() * 5); const ws = []; for (let j = 0; j < w; j++) ws.push(word()); lines.push(ws.join(" ").replace(/^./, (c) => c.toUpperCase()) + "."); } return lines; }
  talk(n) {
    const g = this.g, p = g.player, S = STR.hidden, inv = p.inv;
    if (!this.understands()) { g.npcPanel(n.name, [...this.gibberish(2), `<i style="opacity:.7">${S.noUnderstand}</i>`]); return; }
    const close = () => { g.ui.closeScreen(); g.resume(); };
    const give = (s, id, what, n2, fn) => { const b = s.querySelector("#" + id); if (b) b.addEventListener("click", () => { if (inv.count(what) < n2) { g.ui.toast(S.needItem.replace("%i", STR.items[what].name)); g.audio.sDeny(); return; } inv.remove(what, n2); fn(); g.audio.sPickup(); g.ui.renderHotbar(inv); close(); }); };
    if (n.role === "farmer") { const s = g.npcPanel(n.name, S.farmerLines, inv.has("void_bloom") ? [["hfVoid", S.farmerTrade]] : []); give(s, "hfVoid", "void_bloom", 1, () => { if (!inv.add("infial_belladonna", 10)) g.spawnDrop("infial_belladonna", 10, n.x, n.z, n.y + 0.3); g.ui.toast(S.farmerThanks); }); }
    else if (n.role === "wife") { const s = g.npcPanel(n.name, S.wifeLines, inv.count("starflower") >= 5 ? [["hfMeal", S.wifeMeal]] : []); give(s, "hfMeal", "starflower", 5, () => { p.hu = Math.min(100, p.hu + 40); g.audio.sEat(); g.ui.toast(S.wifeThanks); }); }
    else if (n.role === "explorer") { const s = g.npcPanel(n.name, [S.explorerIntro], S.explorerQ.map((q, i) => ["hfQ" + i, q.q])); S.explorerQ.forEach((q, i) => { const b = s.querySelector("#hfQ" + i); if (b) b.addEventListener("click", () => { const s2 = g.npcPanel(n.name, [q.a]); g.backToMain(s2, () => this.talk(n)); }); }); }
    else if (n.role === "witch") { const btns = []; if (inv.has("void_bloom") && !g.monialStride) btns.push(["hfStride", S.witchStride]); if (inv.has("infial_belladonna")) btns.push(["hfConv", S.convertBtn]); const s = g.npcPanel(n.name, g.monialStride ? S.witchLinesHas : S.witchLines, btns); give(s, "hfStride", "void_bloom", 1, () => { g.monialStride = true; g.ui.toast(S.witchStrideOn); }); const cb = s.querySelector("#hfConv"); if (cb) cb.addEventListener("click", () => { this.convertInfial(); close(); }); }
    else if (n.role === "warrior") { const s = g.npcPanel(n.name, this.battle ? S.warriorBusy : S.warriorLines, this.battle ? [] : [["hfFight", S.warriorFight]]); const b = s.querySelector("#hfFight"); if (b) b.addEventListener("click", () => { close(); this.startBattle(n); }); }
    else if (n.role === "historian") { const btns = [["hfStory", S.historianStory]]; if (inv.has("void_bloom")) btns.push(["hfBook", S.historianBook]); const s = g.npcPanel(n.name, S.historianLines, btns); const sb = s.querySelector("#hfStory"); if (sb) sb.addEventListener("click", () => { const st = S.stories[(this.storyI = ((this.storyI || 0) % S.stories.length))]; this.storyI++; const s2 = g.npcPanel(st.title, st.lines); g.backToMain(s2, () => this.talk(n)); }); give(s, "hfBook", "void_bloom", 1, () => { if (!inv.add("monial_book", 1)) g.spawnDrop("monial_book", 1, n.x, n.z, n.y + 0.3); g.ui.toast(S.historianGives); }); }
    else { g.npcPanel(n.name, S.ladyLines); }
  }
  convertInfial() { const g = this.g, inv = g.player.inv, n = inv.count("infial_belladonna"); if (!n) { g.ui.toast(STR.hidden.needItem.replace("%i", STR.items.infial_belladonna.name)); g.audio.sDeny(); return; } inv.remove("infial_belladonna", n); for (let i = 0; i < n; i++) if (!inv.add("belladonna", 1)) g.spawnDrop("belladonna", 1, g.player.pos.x, g.player.pos.z, g.world.groundHeight(g.player.pos.x, g.player.pos.z, g.player.pos.y)); g.audio.sPickup(); g.ui.renderHotbar(inv); g.ui.toast(STR.hidden.converted.replace("%n", n)); }
  readBook() { const g = this.g; g.monialKnown = true; g.player.inv.consumeSelected(); g.audio.sPickup(); g.ui.renderHotbar(g.player.inv); g.ui.toast(STR.hidden.bookRead); }

  // ---------------- the warrior's battle ----------------
  startBattle(n) {
    const g = this.g, B = H().battle; this.battle = { n, hits: 0, meleeT: 1.5, laserT: 3, t: 0 }; g.ui.toast(STR.hidden.battleStart); g.audio.sGrowl && g.audio.sGrowl();
    let el = document.getElementById("foeBar"); if (!el) { el = document.createElement("div"); el.id = "foeBar"; el.style.cssText = "position:fixed;left:50%;top:76px;transform:translateX(-50%);width:260px;padding:5px 8px;border-radius:8px;background:rgba(0,0,0,.55);color:#cfd8ff;font:700 12px 'Segoe UI',sans-serif;text-align:center;z-index:20"; document.body.appendChild(el); }
    el.style.display = "block"; this.drawFoeBar();
  }
  drawFoeBar() { const el = document.getElementById("foeBar"), b = this.battle; if (!el || !b) return; const B = H().battle, k = Math.max(0, 1 - b.hits / B.hits); el.innerHTML = `${b.n.name} — ${Math.max(0, B.hits - Math.floor(b.hits))} ${STR.hidden.hitsLeft}<div style="height:7px;margin-top:4px;border-radius:4px;background:#1a1f3a"><div style="width:${Math.round(k * 100)}%;height:100%;border-radius:4px;background:linear-gradient(90deg,#6f7fff,#b070ff)"></div></div>`; }
  endBattle(won) { const el = document.getElementById("foeBar"); if (el) el.style.display = "none"; for (const l of this.lasers) this.g.scene.remove(l.sp); this.lasers = []; this.battle = null; }
  // the player's swing: a hit on the warrior if he is in reach and in front
  swing(weapon) {
    const g = this.g, p = g.player, b = this.battle; if (!b) return false; const B = H().battle, n = b.n;
    const dx = n.x - p.pos.x, dz = n.z - p.pos.z, d = Math.hypot(dx, dz); if (d > B.reach + 0.6) return false;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw); if ((dx * fx + dz * fz) / (d || 1) < 0.35) return false;
    const strong = ["axe", "et_sword", "et_dagger", "silver_dagger", "evil_dagger", "monial_dagger", "machete", "trex_dagger", "imp_dagger"];
    b.hits += weapon === "knife" || weapon === "silver_dagger_plain" ? B.knife : weapon ? (strong.includes(weapon) ? B.strong : B.knife) : B.fists;
    g.audio.sHit(); this.drawFoeBar();
    if (b.hits >= B.hits) { if (!p.inv.add("monial_dagger", 1)) g.spawnDrop("monial_dagger", 1, n.x, n.z, n.y + 0.3); g.ui.renderHotbar(p.inv); g.ui.toast(STR.hidden.battleWon); this.endBattle(true); }
    return true;
  }
  updateBattle(dt) {
    const g = this.g, p = g.player, b = this.battle; if (!b) return; const B = H().battle, n = b.n;
    b.t += dt; const d = Math.hypot(n.x - p.pos.x, n.z - p.pos.z);
    if (d > B.leaveR || !this.active) { g.ui.toast(STR.hidden.battleLeft); this.endBattle(false); return; }
    n.yaw = Math.atan2(p.pos.x - n.x, p.pos.z - n.z); n.body.rotation.y = n.yaw;
    const hurt = (dmg, from) => { const real = Math.min(dmg, p.hp - 1); if (real > 0) p.damage(real, "warrior", from); if (p.hp <= 1) { p.hp = 100; g.ui.toast(STR.hidden.battleLost); this.endBattle(false); } };
    b.meleeT -= dt; if (b.meleeT <= 0) { b.meleeT = B.meleeEvery; if (d < B.reach) hurt(B.meleeDmg, { x: n.x, z: n.z }); }
    b.laserT -= dt; if (b.laserT <= 0 && this.battle) { b.laserT = B.laserEvery; const cv = this.laserTex || (this.laserTex = (() => { const c = document.createElement("canvas"); c.width = c.height = 64; const x = c.getContext("2d"); const gr = x.createRadialGradient(32, 32, 2, 32, 32, 32); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.3, "rgba(150,120,255,0.9)"); gr.addColorStop(1, "rgba(90,60,255,0)"); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })()); const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: cv, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); sp.scale.set(0.9, 0.9, 1); sp.position.set(n.x, n.y + 1.4, n.z); g.scene.add(sp); const tx = p.pos.x, ty = p.pos.y + 1.0, tz = p.pos.z; const L = Math.hypot(tx - n.x, ty - (n.y + 1.4), tz - n.z) || 1; this.lasers.push({ sp, vx: (tx - n.x) / L * B.laserSpeed, vy: (ty - n.y - 1.4) / L * B.laserSpeed, vz: (tz - n.z) / L * B.laserSpeed, life: 3 }); g.audio.sDeny(); }
    for (const l of this.lasers) { l.sp.position.x += l.vx * dt; l.sp.position.y += l.vy * dt; l.sp.position.z += l.vz * dt; l.life -= dt; if (this.battle && Math.hypot(l.sp.position.x - p.pos.x, l.sp.position.y - p.pos.y - 1.0, l.sp.position.z - p.pos.z) < 1.2) { hurt(B.laserDmg, { x: l.sp.position.x, z: l.sp.position.z }); l.life = 0; } }
    this.lasers = this.lasers.filter((l) => { if (l.life <= 0) { g.scene.remove(l.sp); return false; } return true; });
  }

  // ---------------- prompts ----------------
  interact(consider, p) {
    const g = this.g, S = STR.hidden;
    if (this.k > 0.35) {
      for (const n of this.npcs) { if (Math.hypot(n.x - p.pos.x, n.z - p.pos.z) > 3.6) continue; consider(n.x, n.z, n.y + 1, `${S.talkTo} ${n.name} [${STR.interact}]`, () => this.talk(n)); }
      for (const q of this.pick) {
        if (q.taken || Math.abs(q.x - p.pos.x) > 3.4 || Math.abs(q.z - p.pos.z) > 3.4 || Math.hypot(q.x - p.pos.x, q.z - p.pos.z) > 3.4) continue;
        if (q.kind === "moonstone") { const sel = p.inv.selected(), pick = sel && (sel.id === "pickaxe" || sel.id === "et_pickaxe") ? sel.id : null; if (pick) consider(q.x, q.z, q.y + 0.5, S.mineMoonstone, () => this.mineStart(q, pick)); else consider(q.x, q.z, q.y + 0.5, S.needPick, () => { g.ui.toast(S.needPick); g.audio.sDeny(); }); }
        else consider(q.x, q.z, q.y, `${STR.pickUp} ${STR.items[q.kind].name} [${STR.interact}]`, () => this.pickUp(q));
      }
    }
    for (const b of this.beds) { if (Math.hypot(b.x - p.pos.x, b.z - p.pos.z) > 2.2) continue; consider(b.x, b.z, b.y, `${STR.sleep} [${STR.interact}]`, () => { if (this.active) g.trySleep(); else { if (g.forest) { const c = g.forest.makeSmall("beetle", b.x + 0.6, b.z + 0.4); c.hostile = true; c.biteT = 0.5; c.hover = 0; } g.ui.toast(S.bedBeetle); g.audio.sDeny(); } }); }
  }
}
