// update 75 (prompt 38, update 2): THE HIDDEN FOREST. A stick-drawn blob of the eastern forest that, if you stand inside it
// through the four seconds of nightfall, turns into the Monial night: blue-purple glowing trees, grass, lanterns, emblems,
// a full blue moon, white fireflies; safe from every beast, no way out until dawn (a force), the night at half speed, its
// own music. By day the lake with its bridge and the abandoned village are plain wood and stone. Seven Monial people live
// in the night: a farmer and his wife, an explorer, a witch, a warrior, a historian and the lady of the lake - they speak
// Monial until you carry the enchanted staff (or have read the historian's book). Starflowers, magic mushrooms, moonstone
// and the void bloom grow only at night; moonfish rise only then.
import * as THREE from "three";
import { CFG } from "./config.js?v=75";
import { STR } from "../strings.js?v=75";
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

export class HiddenForest {
  constructor(g) {
    this.g = g; this.w = g.world; const C = H();
    this.poly = C.poly; this.active = false; this.k = 0; this.pending = null; this.t = 0; this.pushT = 0;
    this.pick = []; this.voidTaken = 0; this.npcs = []; this.tintMap = null; this.battle = null; this.lasers = [];
    let cx = 0, cz = 0; for (const [x, z] of this.poly) { cx += x; cz += z; } this.cx = cx / this.poly.length; this.cz = cz / this.poly.length;
    this.w.hiddenZone = this; this.w.hiddenFloor = (x, z, y) => this.floorAt(x, z, y);
    this.buildLine(); this.buildLake(); this.buildBridge(); this.buildVillage(); this.buildNpcs(); this.buildDressing(); this.buildMoon();
    this.updateLook(0, true);
  }
  inside(x, z) { return pointInPoly(this.poly, x, z); }

  // ---------------- the stick-drawn line ----------------
  buildLine() {
    const w = this.w, pts = [];
    for (let i = 0; i < this.poly.length; i++) { const a = this.poly[i], b = this.poly[(i + 1) % this.poly.length]; const n = Math.max(2, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 1.5)); for (let k = 0; k < n; k++) { const t = k / n; pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); } }
    const N = pts.length, pos = new Float32Array(N * 2 * 3), idx = [];
    for (let i = 0; i < N; i++) { const [x, z] = pts[i], [nx, nz] = pts[(i + 1) % N]; let dx = nx - x, dz = nz - z; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L; const px = -dz * 0.09, pz = dx * 0.09; const y = w.groundHeight(x, z, 40) + 0.05; pos.set([x + px, y, z + pz, x - px, y, z - pz], i * 6); const a = i * 2, b = ((i + 1) % N) * 2; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x2a1e12, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 })); m.frustumCulled = false; this.g.scene.add(m); this.line = m;
  }

  // ---------------- the second lake and its bridge ----------------
  lakeR(theta) { const L = H().lake; return L.r0 + (L.r1 - L.r0) * (0.5 + 0.5 * Math.sin(theta * 3 + 0.7) * 0.6 + 0.2 * Math.sin(theta * 5 + 2.1) + 0.2 * Math.cos(theta * 2 - 0.4)); }
  lakePen2(x, z) { const L = H().lake, dx = x - L.x, dz = z - L.z, d = Math.hypot(dx, dz); return this.lakeR(Math.atan2(dz, dx)) - d; }
  nearShore2(x, z) { const pen = this.lakePen2(x, z); return pen > -4 && pen < H().lake.wade + 0.5; }
  buildLake() {
    const g = this.g, w = this.w, L = H().lake, N = 48, shape = new THREE.Shape(), beach = new THREE.Shape(), bed = new THREE.Shape();
    for (let i = 0; i < N; i++) { const t = i / N * Math.PI * 2, r = this.lakeR(t), x = Math.cos(t) * r, y = -Math.sin(t) * r; i ? shape.lineTo(x, y) : shape.moveTo(x, y); i ? beach.lineTo(x * (r + 3.5) / r, y * (r + 3.5) / r) : beach.moveTo(x * (r + 3.5) / r, y * (r + 3.5) / r); i ? bed.lineTo(x * 0.985, y * 0.985) : bed.moveTo(x * 0.985, y * 0.985); }
    shape.closePath(); beach.closePath(); bed.closePath();
    const waterMat = new THREE.MeshStandardMaterial({ color: 0x8fb2b8, transparent: true, opacity: 0.88, roughness: 0.12, metalness: 0.08 });
    const wTex = g.assets.tex.t_water; if (wTex) { const t = wTex.clone(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 4); t.needsUpdate = true; waterMat.map = t; waterMat.color.setHex(0xffffff); }
    const mk = (sh, mat, y) => { const m = new THREE.Mesh(new THREE.ShapeGeometry(sh, 1), mat); m.rotation.x = -Math.PI / 2; m.position.set(L.x, y, L.z); g.scene.add(m); return m; };
    mk(beach, w.mat("t_beach", 7, 7, 0x9a8a68), 0.02); mk(bed, new THREE.MeshStandardMaterial({ color: 0x1c2a26, roughness: 1 }), 0.035); this.water = mk(shape, waterMat, 0.32); this.waterMat = waterMat; this.waterColor0 = waterMat.color.clone();
    { const uv = this.water.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 12, uv.getY(i) / 12); }
  }
  buildBridge() {
    const g = this.g, w = this.w, B = H().bridge, L = H().lake, plank = w.mat("t_woodplank", 1, 4, 0x6a5a42), post = w.mat("t_darkwood", 1, 2, 0x4a3b28);
    plank.userData.hiddenTint = true; post.userData.hiddenTint = true;
    const root = new THREE.Group(); root.position.set(L.x, 0, L.z); root.rotation.y = B.yaw * D2R; g.scene.add(root); this.bridgeRoot = root;
    const n = Math.round(B.len / 0.5); this.deck = (u) => B.deckY + B.rise * Math.sin(Math.PI * clamp01((u + B.len / 2) / B.len));
    for (let i = 0; i < n; i++) { const u = -B.len / 2 + (i + 0.5) * 0.5, y = this.deck(u); const p = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, B.w), plank); p.position.set(u, y, 0); p.rotation.z = Math.atan2(this.deck(u + 0.25) - this.deck(u - 0.25), 0.5); root.add(p); }
    for (let i = 0; i <= n / 6; i++) { const u = -B.len / 2 + i * 3; const y = this.deck(u); for (const s of [-1, 1]) { const po = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.1, 0.14), post); po.position.set(u, y + 0.5, s * (B.w / 2 - 0.1)); root.add(po); } if (i % 3 === 0 && Math.abs(u) > 2) for (const s of [-1, 1]) { const pl = new THREE.Mesh(new THREE.BoxGeometry(0.22, Math.max(0.4, y - 0.1), 0.22), post); pl.position.set(u, (y - 0.1) / 2, s * (B.w / 2 + 0.2)); root.add(pl); } }
    for (const s of [-1, 1]) { const rail = []; for (let i = 0; i <= n; i += 2) { const u = -B.len / 2 + i * 0.5; rail.push(new THREE.Vector3(u, this.deck(u) + 1.0, s * (B.w / 2 - 0.1))); } const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rail), 48, 0.05, 6, false), post); root.add(tube); }
    // lamps on the posts: a lantern model at every third post, lit only in the hidden night
    this.bridgeLamps = [];
    for (let i = 0; i <= n / 6; i += 3) { const u = -B.len / 2 + i * 3; for (const s of [-1, 1]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.34, 0.22), this.lampMat()); m.position.set(u, this.deck(u) + 1.3, s * (B.w / 2 - 0.1)); root.add(m); this.bridgeLamps.push(m); } }
    // colliders: the rails keep you on the deck (thin boxes along the sides, in world axes - the bridge runs along x)
    const c = Math.cos(B.yaw * D2R), s = Math.sin(B.yaw * D2R);
    this.bridgeWorld = { c, s, x: L.x, z: L.z }; this.bridgeEnds = [[L.x - c * B.len / 2, L.z + s * B.len / 2], [L.x + c * B.len / 2, L.z - s * B.len / 2]];
    for (const side of [-1, 1]) for (let i = 0; i < n; i += 2) { const u = -B.len / 2 + i * 0.5 + 0.5, v = side * (B.w / 2 + 0.08); const wx = L.x + u * c + v * s, wz = L.z - u * s + v * c; const y = this.deck(u); w.addBox(wx - 0.5, wx + 0.5, y, y + 1.1, wz - 0.12, wz + 0.12); }
    this.ladySpot = { x: L.x, z: L.z + 0.5, y: this.deck(0) };
  }
  lampMat() { if (!this._lampMat) this._lampMat = new THREE.MeshStandardMaterial({ color: 0x9fb4ff, emissive: 0x6f7fff, emissiveIntensity: 0, roughness: 0.4 }); return this._lampMat; }
  // the bridge deck is a floor: world.groundHeight asks here
  floorAt(x, z, y) {
    const B = H().bridge, L = H().lake; if (!this.bridgeWorld) return null;
    const dx = x - L.x, dz = z - L.z, u = dx * this.bridgeWorld.c - dz * this.bridgeWorld.s, v = dx * this.bridgeWorld.s + dz * this.bridgeWorld.c;
    if (Math.abs(u) > B.len / 2 + 0.3 || Math.abs(v) > B.w / 2 + 0.05) return null;
    return this.deck(u) + 0.04;
  }

  // ---------------- the village: four huts, a stone plaza, the fountain, the farmer's field ----------------
  buildVillage() {
    const g = this.g, w = this.w, V = H().village, F = H().field, A = g.assets;
    const stone = w.mat("t_cobble", 10, 10, 0x6a6a66), wood = w.mat("t_darkwood", 2, 1, 0x3a2e22), plank = w.mat("t_woodplank", 2, 1, 0x5a4a36), moss = w.mat("t_forestfloor", 2, 2, 0x3a4a30);
    for (const m of [wood, plank, moss]) m.userData.hiddenTint = true;
    const y0 = w.groundHeight(V.x, V.z, 40); this.villageY = y0;
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(V.plazaR, 40), stone); plaza.rotation.x = -Math.PI / 2; plaza.position.set(V.x, y0 + 0.03, V.z); g.scene.add(plaza);
    // the fountain (Higgsfield) with its dry basin by day and water by night
    { const fa = A.glb.hf_fountain; if (fa) { const m = fa.model.clone(); m.position.set(V.x, y0, V.z); g.scene.add(m); } else { const m = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.4, 0.9, 16), stone); m.position.set(V.x, y0 + 0.45, V.z); g.scene.add(m); }
      w.addTree(V.x, V.z, 2.3, "city");
      const wat = new THREE.Mesh(new THREE.CircleGeometry(1.9, 24), new THREE.MeshStandardMaterial({ color: 0x8fb2ff, transparent: true, opacity: 0.8, roughness: 0.1, emissive: 0x3050c0, emissiveIntensity: 0.4 })); wat.rotation.x = -Math.PI / 2; wat.position.set(V.x, y0 + 0.72, V.z); wat.visible = false; g.scene.add(wat); this.fountainWater = wat;
      const N = 60, pos = new Float32Array(N * 3); const pts = new THREE.Points(new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(pos, 3)), new THREE.PointsMaterial({ color: 0xbfd0ff, size: 0.12, transparent: true, opacity: 0.9, depthWrite: false })); pts.position.set(V.x, y0, V.z); pts.visible = false; g.scene.add(pts); this.spray = { pts, pos, N, seeds: Array.from({ length: N }, (_, i) => i / N) };
      this.fountain = { x: V.x, z: V.z, y: y0 }; }
    // four huts round the plaza, doors to the fountain
    this.huts = []; this.beds = [];
    for (let i = 0; i < 4; i++) {
      const a = (45 + i * 90) * D2R, hx = V.x + Math.cos(a) * V.hutR, hz = V.z + Math.sin(a) * V.hutR, yaw = Math.atan2(V.x - hx, V.z - hz);
      this.huts.push(this.buildHut(hx, hz, yaw, i, wood, plank, moss));
    }
    // the farmer's field beside hut 0: a fence, rows of infial belladonna and magic mushrooms
    { const hut = this.huts[0]; const fx = hut.x + Math.cos(hut.yaw + Math.PI / 2) * F.dx, fz = hut.z - Math.sin(hut.yaw + Math.PI / 2) * F.dx; const fy = w.groundHeight(fx, fz, 40); this.field = { x: fx, z: fz, y: fy };
      const soil = new THREE.Mesh(new THREE.PlaneGeometry(F.w, F.d), w.mat("t_soil", 3, 2, 0x4a3a28) ); soil.rotation.x = -Math.PI / 2; soil.position.set(fx, fy + 0.04, fz); g.scene.add(soil);
      for (let i = 0; i < 4; i++) for (const sgn of [-1, 1]) { const px = fx + sgn * F.w / 2, pz = fz - F.d / 2 + i * F.d / 3; const p = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.0, 0.14), wood); p.position.set(px, fy + 0.5, pz); g.scene.add(p); const px2 = fx - F.w / 2 + i * F.w / 3, pz2 = fz + sgn * F.d / 2; const p2 = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.0, 0.14), wood); p2.position.set(px2, fy + 0.5, pz2); g.scene.add(p2); }
      for (const sgn of [-1, 1]) { const r1 = new THREE.Mesh(new THREE.BoxGeometry(F.w, 0.08, 0.08), wood); r1.position.set(fx, fy + 0.85, fz + sgn * F.d / 2); g.scene.add(r1); const r2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, F.d), wood); r2.position.set(fx + sgn * F.w / 2, fy + 0.85, fz); g.scene.add(r2); }
      this.fieldPlants = []; const infMat = this.spriteMat("spr_infialbelladonna", 0xff3a3a, 0.9), mushMat = this.spriteMat("spr_magicmushroom", 0x4060ff, 0.9);
      for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) { const px = fx - F.w / 2 + 1.1 + c * (F.w - 2.2) / 3, pz = fz - F.d / 2 + 1.0 + r * (F.d - 2) / 2; const kind = r === 2 ? "magic_mushroom" : "infial_belladonna"; const grp = this.crossed(kind === "magic_mushroom" ? mushMat : infMat, kind === "magic_mushroom" ? 0.8 : 1.0, kind === "magic_mushroom" ? 0.7 : 1.1); grp.position.set(px, w.groundHeight(px, pz, 40), pz); grp.rotation.y = (r * 7 + c * 3) * 0.5; grp.visible = false; g.scene.add(grp); this.fieldPlants.push(grp); }
      this.farmerSpot = { x: fx + F.w / 2 + 1.2, z: fz, y: w.groundHeight(fx + F.w / 2 + 1.2, fz, 40), face: Math.atan2(fx - (fx + F.w / 2 + 1.2), 0) }; }
    this.explorerSpot = { x: V.x + 7.5, z: V.z + 3.0, y: y0, face: Math.atan2(V.x - (V.x + 7.5), V.z - (V.z + 3.0)) };
  }
  buildHut(hx, hz, yaw, i, wood, plank, moss) {
    const g = this.g, w = this.w, V = H().village, S = V.hutSize, HW = S / 2, WH = V.wallH, y0 = w.groundHeight(hx, hz, 40);
    const root = new THREE.Group(); root.position.set(hx, y0, hz); root.rotation.y = yaw; g.scene.add(root);
    const c = Math.cos(yaw), s = Math.sin(yaw); const world = (lx, lz) => [hx + lx * c + lz * s, hz - lx * s + lz * c];
    const box = (lx, ly, lz, sx, sy, sz, mat, solid = true) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat); m.position.set(lx, ly, lz); root.add(m); if (solid) { const [wx, wz] = world(lx, lz); const r = Math.max(sx, sz) / 2; const corners = [[lx - sx / 2, lz - sz / 2], [lx + sx / 2, lz - sz / 2], [lx - sx / 2, lz + sz / 2], [lx + sx / 2, lz + sz / 2]].map(([a, b]) => world(a, b)); const xs = corners.map((q) => q[0]), zs = corners.map((q) => q[1]); w.addBox(Math.min(...xs), Math.max(...xs), y0 + ly - sy / 2, y0 + ly + sy / 2, Math.min(...zs), Math.max(...zs)); } return m; };
    // floor, three walls, the front wall with its doorway (the door faces +z local, toward the plaza). The huts stand at odd
    // angles, so a wall's collider is a chain of small round posts along it (an axis-aligned box of a turned wall would fill
    // the whole room), and the walls' meshes carry no box of their own
    box(0, 0.06, 0, S + 0.2, 0.12, S + 0.2, plank, false);
    box(0, WH / 2, -HW, S, WH, 0.3, wood, false); box(-HW, WH / 2, 0, 0.3, WH, S, wood, false); box(HW, WH / 2, 0, 0.3, WH, S, wood, false);
    const dw = 1.3, side = (S - dw) / 2; box(-HW + side / 2, WH / 2, HW, side, WH, 0.3, wood, false); box(HW - side / 2, WH / 2, HW, side, WH, 0.3, wood, false); box(0, WH - 0.25, HW, dw, 0.5, 0.3, wood, false);
    const wallLine = (ax, az, bx, bz) => { const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.4)); for (let k = 0; k <= n; k++) { const [wx, wz] = world(ax + (bx - ax) * k / n, az + (bz - az) * k / n); w.addTree(wx, wz, 0.3, "city"); } };
    wallLine(-HW, -HW, HW, -HW); wallLine(-HW, -HW, -HW, HW); wallLine(HW, -HW, HW, HW); wallLine(-HW, HW, -dw / 2, HW); wallLine(dw / 2, HW, HW, HW);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(S * 0.82, V.roofH, 4), moss); roof.rotation.y = Math.PI / 4; roof.position.y = WH + V.roofH / 2 - 0.05; root.add(roof);
    const eave = new THREE.Mesh(new THREE.BoxGeometry(S + 1.0, 0.16, S + 1.0), wood); eave.position.y = WH + 0.02; root.add(eave);
    // the bed inside, against the back wall; a lantern by the door
    const bA = g.assets.glb.hutbed; const bl = [-1.3 * (i % 2 ? -1 : 1), -HW + 1.1];
    if (bA) { const b = bA.model.clone(); b.position.set(bl[0], 0.1, bl[1]); b.rotation.y = Math.PI / 2; root.add(b); } else box(bl[0], 0.3, bl[1], 1.0, 0.5, 2.0, plank, false);
    { const [bx, bz] = world(bl[0], bl[1]); w.addBox(bx - 0.7, bx + 0.7, y0, y0 + 0.5, bz - 1.0, bz + 1.0); this.beds.push({ x: bx, z: bz, y: y0 + 0.1, hut: i }); }
    const lan = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.34, 0.22), this.lampMat()); lan.position.set(dw / 2 + 0.5, WH - 0.5, HW + 0.25); root.add(lan);
    const [ix, iz] = world(1.1 * (i % 2 ? -1 : 1), 0.6), [fx, fz] = world(0, HW + 2.2);
    return { x: hx, z: hz, y: y0, yaw, root, inside: { x: ix, z: iz, y: y0 }, front: { x: fx, z: fz, y: w.groundHeight(fx, fz, 40) } };
  }
  spriteMat(id, emissive, ei) { const t = new THREE.TextureLoader().load(`./assets/tex/${id}.png`); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: new THREE.Color(emissive), emissiveIntensity: ei, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9, metalness: 0 }); }
  crossed(mat, wd, ht) { const ga = new THREE.PlaneGeometry(wd, ht), gb = new THREE.PlaneGeometry(wd, ht); ga.translate(0, ht / 2 - 0.02, 0); gb.translate(0, ht / 2 - 0.02, 0); gb.rotateY(Math.PI / 2); const grp = new THREE.Group(); grp.add(new THREE.Mesh(ga, mat), new THREE.Mesh(gb, mat)); return grp; }

  // ---------------- the Monial people: rigged Higgsfield scans, translucent and glowing, posed on their bones ----------------
  buildNpcs() {
    const g = this.g, w = this.w, A = g.assets, N = H().npcs, V = H().village;
    const spots = {
      farmer: this.farmerSpot, wife: { ...this.huts[0].inside, face: this.huts[0].yaw }, explorer: this.explorerSpot,
      witch: { ...this.huts[1].inside, face: this.huts[1].yaw }, warrior: { ...this.huts[2].front, face: this.huts[2].yaw + Math.PI }, historian: { ...this.huts[3].inside, face: this.huts[3].yaw },
      lady: { ...this.ladySpot, face: Math.PI / 2 },
    };
    for (const role of Object.keys(N)) {
      const sp = spots[role], asset = A.glb[N[role].model]; let body, bones = null, bind = null;
      if (asset) { let skinned = false; asset.model.traverse((o) => { if (o.isSkinnedMesh) skinned = true; }); body = skinned ? skeletonClone(asset.model) : asset.model.clone(); if (skinned) { bones = {}; body.traverse((o) => { if (o.isBone) bones[o.name] = o; }); bind = {}; for (const k of Object.keys(bones)) bind[k] = bones[k].quaternion.clone(); } }
      else { body = new THREE.Group(); const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, (N[role].h || 1.75) - 0.9, 4, 8), new THREE.MeshStandardMaterial({ color: 0x8fb0ff })); m.position.y = (N[role].h || 1.75) / 2; body.add(m); }
      body.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.82; o.material.emissive = new THREE.Color(0x2846c8); o.material.emissiveIntensity = 0.45; o.material.depthWrite = true; o.frustumCulled = false; } });
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

  // ---------------- dressing that only the hidden night shows: lanterns in the trees, emblems, white fireflies ----------------
  buildDressing() {
    const g = this.g, w = this.w, C = H(), A = g.assets, rng = () => { this.seed = ((this.seed || 7) * 1103515245 + 12345) & 0x7fffffff; return this.seed / 0x7fffffff; };
    const trees = (w.treePoints || []).filter(([x, z]) => this.inside(x, z));
    this.treesInside = trees;
    // lanterns: the Higgsfield lantern's first mesh, instanced; a few blue lights near the village and the bridge
    { let geo = null, mat = null; const la = A.glb.hf_lantern; if (la) la.model.traverse((o) => { if (o.isMesh && !geo) { geo = o.geometry.clone(); o.updateWorldMatrix(true, false); geo.applyMatrix4(o.matrixWorld); mat = o.material.clone(); } });
      if (!geo) { geo = new THREE.BoxGeometry(0.3, 0.5, 0.3); mat = new THREE.MeshStandardMaterial({ color: 0x9fb4ff }); }
      mat.emissive = new THREE.Color(0x8f9fff); mat.emissiveIntensity = 0; if (mat.map) mat.emissiveMap = mat.map;
      const n = Math.min(C.lanterns, trees.length), inst = new THREE.InstancedMesh(geo, mat, Math.max(1, n)), d = new THREE.Object3D();
      for (let i = 0; i < n; i++) { const t = trees[Math.floor(rng() * trees.length)]; const a = rng() * Math.PI * 2; d.position.set(t[0] + Math.cos(a) * 1.1, w.groundHeight(t[0], t[1], 40) + 3.4 + rng() * 1.2, t[1] + Math.sin(a) * 1.1); d.rotation.set(0, rng() * 6.28, 0); d.scale.setScalar(1.5); d.updateMatrix(); inst.setMatrixAt(i, d.matrix); }
      inst.count = n; inst.instanceMatrix.needsUpdate = true; inst.frustumCulled = false; inst.visible = false; g.scene.add(inst); this.lanterns = inst; this.lanternMat = mat; }
    this.lights = []; const V = H().village, L = H().lake;
    for (const [x, z, y] of [[V.x + 3, V.z - 3, 2.6], [V.x - 3, V.z + 3, 2.6], [V.x, V.z - V.hutR, 2.4], [V.x, V.z + V.hutR, 2.4], [L.x - 8, L.z, 2.4], [L.x + 8, L.z, 2.4], [this.field.x, this.field.z, 2.0]]) { const pl = new THREE.PointLight(0x5a6cff, 0, 22, 1.7); pl.position.set(x, (y !== undefined ? y : 2.4) + (this.villageY || 0), z); g.scene.add(pl); this.lights.push(pl); }
    // emblems on trunks
    { const m = this.spriteMat("spr_emblem", 0x7a60ff, 1.2); this.emblems = []; for (let i = 0; i < Math.min(C.emblems, trees.length); i++) { const t = trees[Math.floor(rng() * trees.length)]; const a = rng() * Math.PI * 2; const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 1.15), m); pl.position.set(t[0] + Math.cos(a) * 0.95, w.groundHeight(t[0], t[1], 40) + 2.1, t[1] + Math.sin(a) * 0.95); pl.rotation.y = Math.atan2(Math.cos(a), Math.sin(a)); pl.visible = false; g.scene.add(pl); this.emblems.push(pl); } }
    // white fireflies
    { const cv = document.createElement("canvas"); cv.width = cv.height = 32; const c2 = cv.getContext("2d"); const gr = c2.createRadialGradient(16, 16, 1, 16, 16, 15); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.4, "rgba(230,235,255,0.5)"); gr.addColorStop(1, "rgba(220,230,255,0)"); c2.fillStyle = gr; c2.fillRect(0, 0, 32, 32); const tex = new THREE.CanvasTexture(cv);
      this.fireflies = []; for (let i = 0; i < C.fireflyClusters; i++) { const t = trees[Math.floor(rng() * trees.length)] || [this.cx, this.cz]; const N = 12, pos = new Float32Array(N * 3); for (let k = 0; k < N; k++) { pos[k * 3] = (rng() - 0.5) * 6; pos[k * 3 + 1] = 0.6 + rng() * 2.4; pos[k * 3 + 2] = (rng() - 0.5) * 6; } const pts = new THREE.Points(new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(pos, 3)), new THREE.PointsMaterial({ color: 0xffffff, size: 0.18, map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 })); pts.position.set(t[0] + 3, w.groundHeight(t[0], t[1], 40), t[1] + 2); g.scene.add(pts); this.fireflies.push({ pts, phase: rng() * 9 }); } }
    // the pick-up sprite materials
    this.pickMats = { starflower: this.spriteMat("spr_starflower", 0x6080ff, 1.1), magic_mushroom: this.spriteMat("spr_magicmushroom", 0x5060ff, 1.0), void_bloom: this.spriteMat("spr_voidbloom", 0xa040ff, 1.3) };
    this.moonstoneMat = new THREE.MeshStandardMaterial({ color: 0xdfe6ff, emissive: 0x8fa4ff, emissiveIntensity: 0.9, roughness: 0.35 });
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
    const want = /t_bark|t_grass|t_forestfloor|t_woodplank|t_floorboard|t_leaf|spr_|t_darkwood/;
    this.tintMap = new Map();
    g.scene.traverse((o) => { if (!o.isMesh && !o.isInstancedMesh) return; for (const m of (Array.isArray(o.material) ? o.material : [o.material])) { if (!m || this.tintMap.has(m) || !m.isMeshStandardMaterial) continue; const src = m.map && m.map.image && typeof m.map.image.src === "string" ? m.map.image.src : ""; if (treeMats.has(m) || m.userData.hiddenTint || (src && want.test(src))) this.tintMap.set(m, { color: m.color.clone(), emissive: m.emissive.clone(), ei: m.emissiveIntensity, emap: m.emissiveMap, leaf: treeMats.has(m) }); } });
    if (this.waterMat) this.tintMap.set(this.waterMat, { color: this.waterMat.color.clone(), emissive: this.waterMat.emissive.clone(), ei: this.waterMat.emissiveIntensity, emap: null, water: true });
  }
  updateLook(k, force) {
    const g = this.g, w = this.w, C = H(); if (!force && k === this.k) return; this.k = k; w.hiddenK = k;
    if (k > 0 && !this.tintMap) this.collectTint();
    if (this.tintMap) for (const [m, o] of this.tintMap) {
      const tc = C.tint.color; m.color.setRGB(o.color.r * (1 + (tc[0] - 1) * k), o.color.g * (1 + (tc[1] - 1) * k), o.color.b * (1 + (tc[2] - 1) * k));
      m.emissive.copy(o.emissive).lerp(new THREE.Color(o.water ? C.tint.waterEmissive : C.tint.emissive), k); m.emissiveIntensity = o.ei + ((o.leaf ? C.tint.leafI : o.water ? C.tint.waterI : C.tint.emissiveI) - o.ei) * k;
      const em = k > 0 ? (m.map || o.emap) : o.emap; if (em !== m.emissiveMap) { m.emissiveMap = em; m.needsUpdate = true; }
      if (o.water) m.opacity = 0.88 - 0.2 * k;
    }
    const show = k > 0.35;
    if (this.lanterns) { this.lanterns.visible = show; this.lanternMat.emissiveIntensity = 2.4 * k; }
    for (const e of this.emblems || []) e.visible = show;
    for (const n of this.npcs) n.body.visible = show;
    for (const f of this.fieldPlants || []) f.visible = show;
    if (this.fountainWater) this.fountainWater.visible = show; if (this.spray) this.spray.pts.visible = show;
    for (const l of this.lights) l.intensity = 26 * k;
    this.lampMat().emissiveIntensity = 1.6 * k;
    for (const f of this.fireflies || []) f.pts.material.opacity = 0.9 * k;
    if (this.moon) this.moon.material.opacity = 0.95 * k;
    for (const p of this.pick) if (p.grp) p.grp.visible = show && !p.taken;
  }
  activate() { this.active = true; this.voidTaken = 0; this.spawnPickups(); this.g.ui.toast(STR.hidden.enter); if (this.g.audio.sPickup) this.g.audio.sPickup(); }
  deactivate() { this.active = false; this.clearPickups(); this.endBattle(false); if (this.g.ui) this.g.ui.strideBar(!!this.g.strideOn); }
  spawnPickups() {
    const g = this.g, w = this.w, S = H().spawn, rng = g.rng; this.clearPickups();
    const b = this.bounds();
    const place = (kind, n, mkMesh) => { let guard = 0; const spots = []; while (spots.length < n && guard++ < 6000) { const x = b.x0 + rng() * (b.x1 - b.x0), z = b.z0 + rng() * (b.z1 - b.z0); if (!this.inside(x, z) || this.lakePen2(x, z) > -6 || this.inVillage(x, z) || w.distToPath(x, z) < 4 || !w.inForest(x, z)) continue; if (w.treesNear(x, z).some((t) => Math.hypot(t.x - x, t.z - z) < 1.5)) continue; if (this.pick.some((p) => Math.hypot(p.x - x, p.z - z) < 4)) continue; const y = w.groundHeight(x, z, 40); const grp = mkMesh(); grp.position.set(x, y, z); grp.rotation.y = rng() * Math.PI; g.scene.add(grp); const p = { kind, x, z, y, grp, taken: false, left: kind === "moonstone" ? 1 : 0 }; this.pick.push(p); spots.push(p); } };
    place("starflower", S.starflower, () => this.crossed(this.pickMats.starflower, 0.95, 1.05));
    place("magic_mushroom", S.magic_mushroom, () => this.crossed(this.pickMats.magic_mushroom, 0.8, 0.75));
    place("void_bloom", S.void_bloom, () => this.crossed(this.pickMats.void_bloom, 0.7, 0.95));
    place("moonstone", S.moonstone, () => { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 0), this.moonstoneMat); m.position.y = 0.3; const gr = new THREE.Group(); gr.add(m); return gr; });
  }
  clearPickups() { for (const p of this.pick) this.g.scene.remove(p.grp); this.pick = []; this.mining = null; }
  bounds() { let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; for (const [x, z] of this.poly) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); } return { x0, z0, x1, z1 }; }
  inVillage(x, z) { const V = H().village; return Math.hypot(x - V.x, z - V.z) < V.hutR + 8 || (this.field && Math.abs(x - this.field.x) < H().field.w / 2 + 3 && Math.abs(z - this.field.z) < H().field.d / 2 + 3); }
  understands() { const s = this.g.player.inv.selected(); return !!this.g.monialKnown || !!(s && s.id === "monial_staff"); }
  strideOn() { return this.active && !!this.g.monialStride; }
  waterSource(x, z) { const L = H().lake; if (this.lakePen2(x, z) > -4.5) return { x, z, y: 0.3, name: "lake2" }; if (this.active && this.fountain) { const f = this.fountain, dx = x - f.x, dz = z - f.z, d = Math.hypot(dx, dz) || 1; if (d < 4.6) return { x: f.x + dx / d * 2.1, z: f.z + dz / d * 2.1, y: f.y + 0.9, name: "fountain2" }; } return null; }   // the rim facing you: the basin's collider keeps you 2.65 m from its centre, past the 2.6 m prompt reach

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
      // no werewolf walks the hidden night: any that spawns or strays inside is set down outside the line
      for (const wolf of g.wolves) { if (wolf.dead || !this.inside(wolf.pos.x, wolf.pos.z)) continue; const q = this.nearestInside(wolf.pos.x, wolf.pos.z); const dx = q.x - this.cx, dz = q.z - this.cz, d = Math.hypot(dx, dz) || 1; wolf.pos.x = q.x + dx / d * 14; wolf.pos.z = q.z + dz / d * 14; if (wolf.group) wolf.group.position.set(wolf.pos.x, g.world.groundHeight(wolf.pos.x, wolf.pos.z, 40), wolf.pos.z); wolf.state = "wander"; wolf.target = null; }
    }
    this.pushT -= dt;
    this.updateLook(k);
    // the second lake: the deep turns you back like the first
    { const L = H().lake, pen = this.lakePen2(p.pos.x, p.pos.z); if (pen > L.wade && !this.floorAt(p.pos.x, p.pos.z, p.pos.y)) { const dx = p.pos.x - L.x, dz = p.pos.z - L.z, d = Math.hypot(dx, dz) || 1, r = this.lakeR(Math.atan2(dz, dx)) - L.wade; p.pos.x = L.x + dx / d * r; p.pos.z = L.z + dz / d * r; } }
    if (this.k > 0) {
      for (const n of this.npcs) { const d = Math.hypot(p.pos.x - n.x, p.pos.z - n.z); n.headTurn = d < 8 ? Math.max(-0.7, Math.min(0.7, ((Math.atan2(p.pos.x - n.x, p.pos.z - n.z) - n.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI)) : 0; if (d < 40) this.poseNpc(n); }
      if (this.spray) { const S = this.spray, P = S.pos; for (let i = 0; i < S.N; i++) { const u = (this.t * 0.55 + S.seeds[i]) % 1; const a = S.seeds[i] * Math.PI * 2 * 7; P[i * 3] = Math.cos(a) * u * 1.4; P[i * 3 + 1] = 1.2 + 2.2 * Math.sin(u * Math.PI) ; P[i * 3 + 2] = Math.sin(a) * u * 1.4; } S.pts.geometry.attributes.position.needsUpdate = true; }
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
    const g = this.g, S = STR.hidden, inv = g.player.inv, Sp = H().spawn;
    if (p.kind === "void_bloom" && this.voidTaken >= Sp.voidMax) { g.ui.toast(S.voidEnough); g.audio.sDeny(); return; }
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
        if (q.taken || Math.abs(q.x - p.pos.x) > 3.2 || Math.abs(q.z - p.pos.z) > 3.2 || Math.hypot(q.x - p.pos.x, q.z - p.pos.z) > 3.2) continue;
        if (q.kind === "moonstone") { const sel = p.inv.selected(), pick = sel && (sel.id === "pickaxe" || sel.id === "et_pickaxe") ? sel.id : null; if (pick) consider(q.x, q.z, q.y + 0.3, S.mineMoonstone, () => this.mineStart(q, pick)); else consider(q.x, q.z, q.y + 0.3, S.needPick, () => { g.ui.toast(S.needPick); g.audio.sDeny(); }); }
        else consider(q.x, q.z, q.y, `${STR.pickUp} ${STR.items[q.kind].name} [${STR.interact}]`, () => this.pickUp(q));
      }
    }
    for (const b of this.beds) { if (Math.hypot(b.x - p.pos.x, b.z - p.pos.z) > 2.2) continue; consider(b.x, b.z, b.y, `${STR.sleep} [${STR.interact}]`, () => { if (this.active) g.trySleep(); else { if (g.forest) { const c = g.forest.makeSmall("beetle", b.x + 0.6, b.z + 0.4); c.hostile = true; c.biteT = 0.5; c.hover = 0; } g.ui.toast(S.bedBeetle); g.audio.sDeny(); } }); }
  }
}
