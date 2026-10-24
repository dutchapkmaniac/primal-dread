// update 81 (prompt 40): SKULL VALLEY. The south-east corner beyond the river's last bend: white sand between dark cliffs,
// the bones of dinosaurs far larger than anything alive - a skull the size of a hill with the eye-socket shelter inside it,
// a ribcage you walk through, a spine along a ridge, a whole skeleton lying in the sand - and tunnels bored through the
// cliffs. Three new animals: the Majungasaurus (the valley's T-Rex, with a horn bump that stuns), the Therizinosaurus (calm
// in its den unless you take its gift unfed; fed, it lets you sleep there), and the Pachycephalosaurus herds (one blocks,
// one rams from the side; only Eternial steel and the holy dagger kill it, and only from the side or behind).
// Hendrik the fossil hunter camps by the entrance: coffee, a pickaxe for five fossil veins (five a day), a spade, the
// collector's box for the ten fossils, and a reward for the full set (the amber amulet, the bone whistle or the fossil
// pickaxe). Bone treasure chests: the loot of any chest, no beetle, but one chest in five rattles and every hunter within
// sixty metres comes to look. Stones in the tunnels are mined with a pickaxe (fossil veins, and a fossil one time in a
// hundred, one in fifty with the fossil pickaxe); sand mounds are dug with the spade (bones, a Majungasaurus tooth, the
// same fossil roll).
import * as THREE from "three";
import { CFG } from "./config.js?v=85";
import { STR } from "../strings.js?v=85";
import { pickWeighted } from "./rng.js?v=85";
import { iconUrl } from "./items.js?v=85";
import { Inventory } from "./items.js?v=85";
import { skullInside, skullH, skullCell, skullNode, skullTunnels, skullHills, tunnelDist, segDist } from "./skull_shape.js?v=85";
import { ClipAnimator } from "./skeletal.js?v=85";
import { meshyRig, driveMeshy, restOnly } from "./meshyrig.js?v=85";   /* update 85 */
import { clone as skeletonClone } from "three/addons/utils/SkeletonUtils.js";

const K = () => CFG.skull;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
export const FOSSILS = ["fossil_dickinsonia", "fossil_trilobite", "fossil_anomalocaris", "fossil_eurypterid", "fossil_dunkleosteus",
  "fossil_ammonite", "fossil_eoraptor", "fossil_archaeopteryx", "fossil_velociraptor", "fossil_megalodon"];

export { skullInside, skullH };

export class SkullValley {
  constructor(g) {
    const S = K();
    this.g = g; this.w = g.world; this.t = 0; this.day = g.dayNum;
    this.w.skullZone = this;
    this.storage = new Inventory(CFG.storageSlots, CFG.storageStackMax);     // Hendrik's chest
    this.eyeStorage = new Inventory(CFG.storageSlots, CFG.storageStackMax);  // the shelter's chest
    this.eyeStorage.add("spade", 1);   // whoever lived here left their spade
    this.boxFill = FOSSILS.map(() => false);
    this.pickSold = 0; this.pickDay = g.dayNum; this.hendrikCoffeeDay = -1;
    this.whistleT = 0; this.howlT = 30 + g.rng() * 40; this.amuletLock = false; this.amuletOpenT = 0;
    this.stones = []; this.digs = []; this.dens = []; this.fires = []; this.floors = [];
    this.mining = null; this.digging = null;
    let seed = 7331; this.rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    this.boneMat = new THREE.MeshStandardMaterial({ color: 0xd9d2bf, roughness: 0.95, side: THREE.DoubleSide });
    this.darkMat = this.w.mat("t_darkcliff", 1, 1, 0x3b3c3e); if (this.darkMat.normalScale) this.darkMat.normalScale.set(0.28, 0.28);
    this.buildGround();
    this.buildReach();
    this.buildTunnels();
    this.buildLandmarks();
    this.buildShelter();
    this.buildCamp();
    this.buildDens();
    this.buildChests();
    this.buildStones();
    this.buildDigs();
    this.w.skullFloor = (x, z, y) => this.floorAt(x, z, y);
  }
  inside(x, z) { return skullInside(x, z); }
  bounds() { let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; for (const [x, z] of K().poly) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); } return { x0, z0, x1, z1 }; }
  rot(px, pz, yaw) { return [px * Math.cos(yaw) + pz * Math.sin(yaw), -px * Math.sin(yaw) + pz * Math.cos(yaw)]; }

  // ---------------- the ground: white sand, dark rock where the cliffs rise ----------------
  buildGround() {
    // the same lattice as the forest's hill ground (world.buildHillGround skips exactly these cells and cuts the grass
    // plane under them), so the sand meets the grass at the nodes with no seam and no second surface
    const w = this.w, hill = w.hill, G = hill.G, sq = CFG.world.square, n0 = Math.floor(-sq / G) - 1, n1 = Math.ceil(sq / G) + 1;
    const B = this.bounds(), x0 = Math.max(n0, Math.floor((B.x0 - 60) / G)), x1 = Math.min(n1, Math.ceil((B.x1 + 60) / G)), z0 = Math.max(n0, Math.floor((B.z0 - 60) / G)), z1 = Math.min(n1, Math.ceil((B.z1 + 60) / G));
    const NX = x1 - x0 + 1, NZ = z1 - z0 + 1;
    const pos = new Float32Array(NX * NZ * 3), uv = new Float32Array(NX * NZ * 2), hs = new Float32Array(NX * NZ);
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) { const k = j * NX + i, ix = x0 + i, iz = z0 + j, x = ix * G, z = iz * G, sh = skullH(x, z), h = skullNode(ix, iz, G, hill.at); pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z; uv[k * 2] = x / 14; uv[k * 2 + 1] = -z / 14; hs[k] = sh; }
    const sand = [], rock = [];
    for (let j = 0; j < NZ - 1; j++) for (let i = 0; i < NX - 1; i++) {
      if (!skullCell(x0 + i, z0 + j, G)) continue;
      const a = j * NX + i, b = (j + 1) * NX + i, c = (j + 1) * NX + i + 1, d = j * NX + i + 1;
      const rocky = Math.max(hs[a], hs[b], hs[c], hs[d]) > 0.6;
      (rocky ? rock : sand).push(a, b, d, b, c, d);
    }
    const sandMat = w.mat("t_bonesand", 1, 1, K().floorColor); sandMat.roughness = 1;
    for (const [list, mat] of [[sand, sandMat], [rock, this.darkMat]]) {
      if (!list.length) continue;
      const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2)); geo.setIndex(list); geo.computeVertexNormals(); geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; this.g.scene.add(m);
    }
    this.groundCells = sand.length / 6 + rock.length / 6;
  }
  // the walkable floor joined to the camp (5 m cells): spawns, chests and targets go only where you can get to
  buildReach() {
    const G = 5, B = this.bounds(), S = K(); this.reachG = G; this.reachB = B;
    const nx = this.reachNX = Math.ceil((B.x1 - B.x0) / G), nz = this.reachNZ = Math.ceil((B.z1 - B.z0) / G);
    const walk = new Uint8Array(nx * nz); for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const x = B.x0 + (i + 0.5) * G, z = B.z0 + (j + 0.5) * G; if (this.inside(x, z) && skullH(x, z) < 2.5 && this.w.desert.riverDist(x, z) > 14) walk[j * nx + i] = 1; }
    const seen = this.reach = new Uint8Array(nx * nz); const q = [[Math.floor((S.camp.x - B.x0) / G), Math.floor((S.camp.z - B.z0) / G)]]; seen[q[0][1] * nx + q[0][0]] = 1;
    while (q.length) { const [i, j] = q.pop(); for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= nx || b >= nz) continue; const k = b * nx + a; if (!walk[k] || seen[k]) continue; seen[k] = 1; q.push([a, b]); } }
  }
  reachable(x, z) { if (!this.reach) return true; const i = Math.floor((x - this.reachB.x0) / this.reachG), j = Math.floor((z - this.reachB.z0) / this.reachG); if (i < 0 || j < 0 || i >= this.reachNX || j >= this.reachNZ) return false; return !!this.reach[j * this.reachNX + i]; }
  // a random spot on the open valley floor (the hunters' wander targets and spawns)
  randomFloor(rng, zone = null) {   // update 82: zone {x, z, r} - the hunters are born round the spine ridge
    const S = K(), B = this.bounds();
    for (let k = 0; k < 60; k++) {
      const x = zone ? zone.x + (rng() * 2 - 1) * zone.r : B.x0 + rng() * (B.x1 - B.x0), z = zone ? zone.z + (rng() * 2 - 1) * zone.r : B.z0 + rng() * (B.z1 - B.z0);
      if (!this.inside(x, z) || skullH(x, z) > 0.2 || !this.reachable(x, z) || this.inTent(x, z) || Math.hypot(x - S.camp.x, z - S.camp.z) < 20) continue;
      if (Math.abs(x) > CFG.world.square - 12 || Math.abs(z) > CFG.world.square - 12) continue;
      if (S.dens.some((D) => Math.hypot(x - D.x, z - D.z) < S.denR + 4)) continue;
      return [x, z];
    }
    return [S.skullCave.x + 60, S.skullCave.z + 60];
  }
  // ---------------- the tunnels through the cliffs: a roof slab and two bone-rock walls over each cut ----------------
  buildTunnels() {
    const S = K(), w = this.w, scene = this.g.scene;
    for (const [a, b] of skullTunnels()) {
      const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz), yaw = Math.atan2(dx, dz), mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
      const rockL = w.mat("t_darkcliff", L / 9, 1, 0x3b3c3e); if (rockL.normalScale) rockL.normalScale.set(0.5, 0.5);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(S.tunnelHw * 2 + 2 * S.tunnelNotch, 4, L - 4), rockL); roof.position.set(mx, S.tunnelH + 2, mz); roof.rotation.y = yaw; scene.add(roof);
      // update 82: the arch of bone at both mouths (the scan), the rings of the dead thing's spine
      const arch = this.g.assets.glb.sv_bonearch;
      if (arch) { const bb = new THREE.Box3().setFromObject(arch.model), sz = bb.getSize(new THREE.Vector3()), mul = (S.tunnelHw * 2 + 8) / sz.x; for (const [ex, ez, dir] of [[a[0], a[1], -1], [b[0], b[1], 1]]) { const m = arch.model.clone(); m.scale.multiplyScalar(mul); m.position.set(ex + dx / L * dir * 1.5, this.w.groundHeight(ex, ez, 999) - 0.3, ez + dz / L * dir * 1.5); m.rotation.y = yaw + (dir < 0 ? Math.PI : 0); scene.add(m); } }
      const n = Math.ceil(L / 3);
      for (const side of [-1, 1]) {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(1.2, S.tunnelH + 0.2, L + 6), rockL);
        const [ox, oz] = this.rot(side * (S.tunnelHw + 0.6), 0, yaw); wall.position.set(mx + ox, S.tunnelH / 2, mz + oz); wall.rotation.y = yaw; scene.add(wall);
        for (let i = 0; i <= n; i++) { const t = i / n, px = a[0] + dx * t + ox, pz = a[1] + dz * t + oz; w.addBox(px - 0.8, px + 0.8, 0, S.tunnelH, pz - 0.8, pz + 0.8); }
      }
      for (let i = 0; i < 2; i++) { const t = 0.3 + 0.4 * i; const l = new THREE.PointLight(0xd8c8a0, 2.2, 14, 1.8); l.position.set(a[0] + dx * t, S.tunnelH - 1.2, a[1] + dz * t); scene.add(l); }
    }
  }
  place(id, x, z, yaw, scaleMul = 1) {
    const a = this.g.assets.glb[id]; if (!a) return null;
    const m = a.model.clone(); m.position.set(x, this.w.groundHeight(x, z, 999), z); m.rotation.y = yaw; if (scaleMul !== 1) m.scale.multiplyScalar(scaleMul); this.g.scene.add(m); return m;
  }
  // ---------------- the giant bones ----------------
  buildLandmarks() {
    const S = K();
    this.skullMesh = this.place("sv_skull", S.skullCave.x, S.skullCave.z, S.skullCave.yaw);
    if (this.skullMesh) { let tex = null; this.skullMesh.traverse((o) => { if (!tex && o.isMesh && o.material && o.material.map) tex = o.material.map; }); if (tex) { const t2 = tex.clone(); t2.wrapS = t2.wrapT = THREE.RepeatWrapping; t2.repeat.set(0.6, 0.6); t2.needsUpdate = true; this.boneMat.map = t2; this.boneMat.color.set(0xffffff); this.boneMat.needsUpdate = true; const bg = this.w.desert && this.w.desert.boneBridge; if (bg) bg.traverse((o) => { if (o.isMesh) o.material = this.boneMat; }); } }   // update 82: the bone bridge is bone too
    if (this.skullMesh) {   // its LOCAL box (the fractions of the way to the eye are in the skull's own frame): measured unturned, then turned back
      const m = this.skullMesh, yaw = m.rotation.y; m.rotation.y = 0; m.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(m); m.rotation.y = yaw; m.updateMatrixWorld(true);
      this.skullBox = bb; this.skullSize = bb.getSize(new THREE.Vector3());
    }
    const rib = this.place("sv_ribcage", S.ribcage.x, S.ribcage.z, S.ribcage.yaw); this.ribMesh = rib;
    this.place("sv_spine", S.spine.x, S.spine.z, S.spine.yaw);
    this.place("sv_skeleton", S.skeleton.x, S.skeleton.z, S.skeleton.yaw);
    this.bones = []; this.rocks = [];
    this.buildBones();
    this.buildRocks();
  }
  // ---------------- the bone field: giants on the rock and in the sand, smaller pieces between ----------------
  boneSpot(minGap, list, tries = 60, onRock = null) {
    const S = K(), B = this.bounds(), T = skullTunnels();
    for (let k = 0; k < tries; k++) {
      const x = B.x0 + this.rng() * (B.x1 - B.x0), z = B.z0 + this.rng() * (B.z1 - B.z0);
      if (!this.inside(x, z)) continue;
      const h = skullH(x, z); if (onRock === true && h < 3) continue; if (onRock === false && h > 0.3) continue;
      if (S.flats.some(([fx, fz, r]) => Math.hypot(x - fx, z - fz) < r + 6)) continue;
      if (T.some(([a, b]) => segDist(x, z, a[0], a[1], b[0], b[1]) < S.tunnelHw + 10)) continue;
      if (this.w.desert.riverDist(x, z) < 26 || Math.abs(x) > CFG.world.square - 30 || Math.abs(z) > CFG.world.square - 30) continue;
      if (list.some((o) => Math.hypot(o.x - x, o.z - z) < minGap)) continue;
      return [x, z, h];
    }
    return null;
  }
  buildBones() {
    const S = K(), N = S.bones, kinds = [["sv_skull", 0.3, [0.3, 0.75]], ["sv_ribcage", 0.25, [0.5, 1.3]], ["sv_spine", 0.2, [0.5, 1.4]], ["sv_skeleton", 0.25, [0.6, 1.6]]];
    const pick = () => { let r = this.rng(), acc = 0; for (const k of kinds) { acc += k[1]; if (r <= acc) return k; } return kinds[3]; };
    const put = (kind, mul, gap, sinkMax) => {
      const H = CFG.modelScale[kind[0]] * mul; let sp = null;
      for (let t = 0; t < 12 && !sp; t++) {   // level enough for its size: no bone hanging off a cliff
        const c = this.boneSpot(gap, this.bones, 80); if (!c) return;
        const gh = (dx, dz) => this.w.groundHeight(c[0] + dx, c[1] + dz, 999), r = H * 0.5, hs = [gh(0, 0), gh(r, 0), gh(-r, 0), gh(0, r), gh(0, -r)];
        if (Math.max(...hs) - Math.min(...hs) < H * 0.35) sp = c;
      }
      if (!sp) return;
      const [x, z] = sp, yaw = this.rng() * Math.PI * 2, m = this.place(kind[0], x, z, yaw, mul); if (!m) return;
      m.position.y = this.w.groundHeight(x, z, 999) - this.rng() * sinkMax - H * 0.06;
      m.rotation.x = (this.rng() - 0.5) * 0.18; m.rotation.z = (this.rng() - 0.5) * 0.18;
      this.bones.push({ x, z, kind: kind[0], h: H, y: m.position.y, mesh: m });
      if (kind[0] === "sv_skull" && H > 4) this.w.addTree(x, z, H * 0.45, "bone");   // a skull is solid; ribs you walk between
    };
    for (let i = 0; i < N.giant; i++) { const k = pick(); put(k, k[2][0] + this.rng() * (k[2][1] - k[2][0]), 30, 1.6); }
    for (let i = 0; i < N.medium; i++) { const k = pick(); put(k, (k[2][0] + this.rng() * (k[2][1] - k[2][0])) * 0.22, 9, 0.5); }
  }
  // ---------------- the boulders ----------------
  buildRocks() {
    const S = K(), b = this.g.assets.glb.boulder; if (!b) return;
    for (let i = 0; i < S.bones.rocks; i++) {
      const sp = this.boneSpot(5, this.rocks, 40); if (!sp) continue;
      const [x, z] = sp, mul = 0.5 + this.rng() * this.rng() * 2.8, m = b.model.clone();
      m.traverse((o) => { if (o.isMesh) o.material = this.darkMat; }); m.scale.multiplyScalar(mul); m.rotation.y = this.rng() * 6.28; m.rotation.z = (this.rng() - 0.5) * 0.3;
      m.position.set(x, this.w.groundHeight(x, z, 999) - 0.25 * mul, z); this.g.scene.add(m);
      this.rocks.push({ x, z, r: 0.9 * mul, mesh: m }); if (mul > 0.9) this.w.addTree(x, z, 0.85 * mul);
    }
  }
  // a random sand spot on the valley floor, clear of the cliffs, the landmarks and the camp
  spot(minLand = 26) {
    const S = K(), B = this.bounds();
    for (let k = 0; k < 400; k++) {
      const x = B.x0 + this.rng() * (B.x1 - B.x0), z = B.z0 + this.rng() * (B.z1 - B.z0);
      if (!this.inside(x, z) || skullH(x, z) > 0.2 || !this.reachable(x, z) || tunnelDist(x, z) < 8) continue;
      if (Math.hypot(x - S.camp.x, z - S.camp.z) < 24) continue;
      if (Math.hypot(x - S.skullCave.x, z - S.skullCave.z) < S.skullCave.clearR) continue;
      if ([S.ribcage, S.spine, S.skeleton].some((L) => Math.hypot(x - L.x, z - L.z) < minLand)) continue;
      if (S.dens.some((D) => Math.hypot(x - D.x, z - D.z) < 34)) continue;
      if (this.bones && this.bones.some((o) => Math.hypot(o.x - x, o.z - z) < o.h * 0.6 + 2)) continue;
      if (this.w.desert.riverDist(x, z) < 26 || Math.abs(x) > CFG.world.square - 20 || Math.abs(z) > CFG.world.square - 20) continue;
      return [x, z];
    }
    return [S.camp.x + 30, S.camp.z + 30];
  }
  // ---------------- the eye-socket shelter inside the great skull ----------------
  shelterLocal(fx, fy, fz) {   // fractions of the skull's local box (x across, y up, z along; the snout is +z) -> world
    const S = K().skullCave, sz = this.skullSize || new THREE.Vector3(40, 40, 40);
    const lx = fx * sz.x, lz = fz * sz.z, c = Math.cos(S.yaw), s = Math.sin(S.yaw);
    return new THREE.Vector3(S.x + lx * c + lz * s, fy * sz.y, S.z - lx * s + lz * c);   // three.js rotation.y: x' = x cos + z sin, z' = -x sin + z cos
  }
  buildShelter() {
    const S = K(), E = S.eye, scene = this.g.scene, w = this.w;
    const P = E.path.map(([fx, fy, fz]) => this.shelterLocal(fx, fy, fz));
    this.eyePos = P[P.length - 1].clone(); this.mouthPos = P[0].clone();
    // the floors: ribbons along the path (the last stretch is too narrow for a hunter), with bone walls beside them
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], b = P[i + 1], hw = i >= P.length - 3 ? E.narrowHw : E.hw;
      this.floors.push({ a, b, hw, narrow: i >= P.length - 3 });
      const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz) || 1, nx = -dz / L, nz = dx / L;
      const g = new THREE.BufferGeometry(); const v = [a.x + nx * hw, a.y, a.z + nz * hw, a.x - nx * hw, a.y, a.z - nz * hw, b.x + nx * hw, b.y, b.z + nz * hw, b.x - nx * hw, b.y, b.z - nz * hw];
      g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, L / 3, 1, L / 3], 2)); g.setIndex([0, 2, 1, 1, 2, 3]); g.computeVertexNormals();
      scene.add(new THREE.Mesh(g, this.boneMat));
      for (const side of [-1, 1]) {   // walls: a strip from the floor up 4 m
        const wg = new THREE.BufferGeometry(); const ox = nx * (hw + 0.2) * side, oz = nz * (hw + 0.2) * side;
        wg.setAttribute("position", new THREE.Float32BufferAttribute([a.x + ox, a.y - 0.2, a.z + oz, a.x + ox, a.y + 4, a.z + oz, b.x + ox, b.y - 0.2, b.z + oz, b.x + ox, b.y + 4, b.z + oz], 3));
        wg.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 0, 1, L / 4, 0, L / 4, 1], 2)); wg.setIndex([0, 1, 2, 1, 3, 2]); wg.computeVertexNormals(); scene.add(new THREE.Mesh(wg, this.boneMat));
      }
      { const rg = new THREE.BufferGeometry(); const hh = 3.6;   // the roof
        rg.setAttribute("position", new THREE.Float32BufferAttribute([a.x + nx * (hw + 0.3), a.y + hh, a.z + nz * (hw + 0.3), a.x - nx * (hw + 0.3), a.y + hh, a.z - nz * (hw + 0.3), b.x + nx * (hw + 0.3), b.y + hh, b.z + nz * (hw + 0.3), b.x - nx * (hw + 0.3), b.y + hh, b.z - nz * (hw + 0.3)], 3));
        rg.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, L / 3, 1, L / 3], 2)); rg.setIndex([0, 1, 2, 1, 3, 2]); rg.computeVertexNormals(); scene.add(new THREE.Mesh(rg, this.boneMat)); }
      for (let t = 2.5; t < L - 1; t += 4) {   // rib rings
        const ring = new THREE.Mesh(new THREE.TorusGeometry(hw + 0.45, 0.16, 6, 16, Math.PI), this.boneMat);
        ring.position.set(a.x + dx * (t / L), a.y + (b.y - a.y) * (t / L) + 0.1, a.z + dz * (t / L)); ring.rotation.y = Math.atan2(dx, dz); scene.add(ring);
      }
      const l = new THREE.PointLight(0xe0c890, 1.6, 12, 1.8); l.position.set((a.x + b.x) / 2, (a.y + b.y) / 2 + 2.2, (a.z + b.z) / 2); scene.add(l);
    }
    // the platform at the eye: a bone disc, the bedroll, a chest, a fire, the drawings on the wall
    const e = this.eyePos; const disc = new THREE.Mesh(new THREE.CylinderGeometry(E.platR, E.platR + 0.6, 0.5, 18), this.boneMat); disc.position.set(e.x, e.y - 0.25, e.z); scene.add(disc);
    this.floors.push({ disc: true, x: e.x, z: e.z, y: e.y, r: E.platR });
    const yaw = S.skullCave.yaw;
    const bed = this.g.assets.glb.bedroll; if (bed) { const m = bed.model.clone(); const [bx, bz] = this.rot(-1.6, -1.2, yaw); m.position.set(e.x + bx, e.y + 0.02, e.z + bz); m.rotation.y = yaw + 0.3; scene.add(m); w.beds.push({ x: e.x + bx, z: e.z + bz, y: e.y + 0.05, label: "eye" }); }
    const ch = this.g.assets.glb.storagechest; if (ch) { const m = ch.model.clone(); const [cx, cz] = this.rot(1.8, -1.4, yaw); m.position.set(e.x + cx, e.y + 0.02, e.z + cz); m.rotation.y = yaw + Math.PI; m.scale.multiplyScalar(0.75); scene.add(m); this.eyeChest = { x: e.x + cx, z: e.z + cz, y: e.y }; }
    { const [fx, fz] = this.rot(0.6, 1.2, yaw); this.addFire(e.x + fx, e.z + fz, e.y); }
    // the drawings: a canvas on the inner wall - new, as if drawn days ago, by nobody
    { const cv = document.createElement("canvas"); cv.width = 512; cv.height = 256; const c = cv.getContext("2d"); c.fillStyle = "rgba(0,0,0,0)"; c.clearRect(0, 0, 512, 256);
      c.strokeStyle = "#6b4a2e"; c.lineWidth = 4; c.lineCap = "round";
      const stroke = (pts) => { c.beginPath(); pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.stroke(); };
      stroke([[40, 180], [90, 120], [150, 130], [200, 90], [250, 140], [300, 120]]); stroke([[150, 130], [160, 190]]); stroke([[250, 140], [240, 195]]);   // a long-necked beast
      stroke([[330, 200], [340, 150], [360, 150], [370, 200]]); stroke([[350, 150], [350, 125]]); c.beginPath(); c.arc(350, 115, 10, 0, Math.PI * 2); c.stroke();   // a man
      c.beginPath(); c.arc(430, 90, 34, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.arc(418, 82, 7, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.arc(444, 82, 7, 0, Math.PI * 2); c.stroke(); stroke([[412, 112], [448, 112]]);   // a skull
      stroke([[60, 60], [120, 40]]); stroke([[110, 30], [120, 40], [108, 50]]);   // an arrow
      for (let i = 0; i < 7; i++) stroke([[40 + i * 14, 230], [40 + i * 14, 210]]);   // tally marks
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      const [wx, wz] = this.rot(0, -E.platR + 0.4, yaw); const wall = new THREE.Mesh(new THREE.PlaneGeometry(5, 2.5), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 1, side: THREE.DoubleSide }));
      wall.position.set(e.x + wx, e.y + 1.9, e.z + wz); wall.rotation.y = yaw; scene.add(wall);
      const back = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 4.2), this.boneMat); back.position.set(e.x + wx * 1.06, e.y + 2.0, e.z + wz * 1.06); back.rotation.y = yaw; scene.add(back); }
    // the fossil veins along the way: three stones that always give a vein
    for (let i = 1; i < Math.min(4, P.length - 1); i++) { const a = P[i], b = P[i + 1]; const t = 0.5, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t, y = a.y + (b.y - a.y) * t; const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz) || 1; const ox = -dz / L * (E.hw - 0.5), oz = dx / L * (E.hw - 0.5); this.addStone(x + ox, z + oz, y, true); }
  }
  // the highest floor you can STEP onto (world.groundHeight takes the highest candidate within 0.7 m above your feet; a
  // higher stretch crossing above you must not hide the one you stand on)
  floorAt(x, z, y) {
    let best = null;
    for (const f of this.floors) {
      if (f.disc) { if (Math.hypot(x - f.x, z - f.z) < f.r + 0.3 && f.y <= y + 0.7 && y > f.y - 2.5 && (best === null || f.y > best)) best = f.y; continue; }
      const a = f.a, b = f.b, dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1; const u = ((x - a.x) * dx + (z - a.z) * dz) / L2; if (u < -0.02 || u > 1.02) continue;
      const px = a.x + dx * u, pz = a.z + dz * u; if (Math.hypot(x - px, z - pz) > f.hw + 0.35) continue;
      const fy = a.y + (b.y - a.y) * clamp01(u); if (fy <= y + 0.7 && y > fy - 2.5 && (best === null || fy > best)) best = fy;
    }
    return best;
  }
  inNarrow(x, z) { for (const f of this.floors) { if (!f.narrow) continue; const a = f.a, b = f.b; if (segDist(x, z, a.x, a.z, b.x, b.z) < f.hw + 1.5) return true; } return false; }
  addFire(x, z, y) {
    const w = this.w, scene = this.g.scene, grp = new THREE.Group(); grp.position.set(x, y, z);
    const logMat = w.mat("t_bark", 1.2, 0.5, 0x4a3b28);
    for (let i = 0; i < 3; i++) { const log = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.7, 6), logMat); log.rotation.z = Math.PI / 2.3; log.rotation.y = (i / 3) * Math.PI * 2; log.position.y = 0.08; grp.add(log); }
    for (let i = 0; i < 7; i++) { const st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.12, 0), this.boneMat); const a = i / 7 * Math.PI * 2; st.position.set(Math.cos(a) * 0.5, 0.08, Math.sin(a) * 0.5); grp.add(st); }
    const flames = []; const fm = this.g.assets.flame ? new THREE.MeshBasicMaterial({ map: this.g.assets.flame, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }) : new THREE.MeshBasicMaterial({ color: 0xff8a30, transparent: true, opacity: 0.8 });
    for (let i = 0; i < 2; i++) { const f = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.9), fm); f.position.y = 0.5; f.rotation.y = i * Math.PI / 2; grp.add(f); flames.push(f); }
    const light = new THREE.PointLight(0xff8a30, 3.2, 10, 1.8); light.position.y = 0.9; grp.add(light);
    scene.add(grp); const fire = { x, z, y, grp, flames, light, lit: true, temp: false }; this.fires.push(fire); (w.extraFires = w.extraFires || []).push(fire); return fire;
  }
  // ---------------- Hendrik's camp ----------------
  buildCamp() {
    const S = K(), C = S.camp, scene = this.g.scene, w = this.w, A = this.g.assets.glb, gy = w.groundHeight(C.x, C.z, 40);
    const tent = this.place("sv_tent", C.x, C.z, C.yaw);
    if (tent) { tent.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(tent); this.tentBox = bb; }
    // inside: two sleeping bags, the chest; outside: the table with his tools, a stool, the fire, a lantern pole
    const bagMat = new THREE.MeshStandardMaterial({ color: 0x4e5a3a, roughness: 1 });
    for (const side of [-1, 1]) { const [bx, bz] = this.rot(side * 1.3, -1.2, C.yaw); const br = A.bedroll; if (br) { const m = br.model.clone(); m.position.set(C.x + bx, gy + 0.02, C.z + bz); m.rotation.y = C.yaw; m.scale.multiplyScalar(1.15); scene.add(m); } else { const bag = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.26, 2.0), bagMat); bag.position.set(C.x + bx, gy + 0.13, C.z + bz); bag.rotation.y = C.yaw; scene.add(bag); } w.beds.push({ x: C.x + bx, z: C.z + bz, y: gy + 0.1, label: "hendrik" }); }   // update 82: real bedrolls
    if (A.storagechest) { const m = A.storagechest.model.clone(); const [cx, cz] = this.rot(0, -2.6, C.yaw); m.position.set(C.x + cx, gy + 0.02, C.z + cz); m.rotation.y = C.yaw + Math.PI; m.scale.multiplyScalar(0.8); scene.add(m); this.campChest = { x: C.x + cx, z: C.z + cz, y: gy }; }
    const [fx, fz] = this.rot(-2.6, 7.0, C.yaw); this.addFire(C.x + fx, C.z + fz, gy);   // the fire stands clear of Hendrik, so his prompt is his own
    { const [tx, tz] = this.rot(4.4, 4.2, C.yaw); const wood = w.mat("t_woodplank", 2, 1, 0x7a6448); const top = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 1.0), wood); top.position.set(C.x + tx, gy + 0.78, C.z + tz); top.rotation.y = C.yaw + 0.4; scene.add(top);
      for (const [lx, lz] of [[-0.75, -0.4], [0.75, -0.4], [-0.75, 0.4], [0.75, 0.4]]) { const [ox, oz] = this.rot(lx, lz, C.yaw + 0.4); const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.78, 0.08), wood); leg.position.set(C.x + tx + ox, gy + 0.39, C.z + tz + oz); scene.add(leg); }
      const toolMat = new THREE.MeshStandardMaterial({ color: 0x6b6b70, metalness: 0.5, roughness: 0.5 }); for (let i = 0; i < 5; i++) { const [ox, oz] = this.rot(-0.6 + i * 0.3, 0.1 - (i % 2) * 0.3, C.yaw + 0.4); const tool = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.5 + (i % 2) * 0.2), toolMat); tool.position.set(C.x + tx + ox, gy + 0.85, C.z + tz + oz); tool.rotation.y = C.yaw + 0.4 + (i - 2) * 0.1; scene.add(tool); }
      const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.55, 6), this.boneMat); const [bx2, bz2] = this.rot(0.55, 0.25, C.yaw + 0.4); bone.position.set(C.x + tx + bx2, gy + 0.86, C.z + tz + bz2); bone.rotation.z = Math.PI / 2; bone.rotation.y = C.yaw + 0.9; scene.add(bone);
      w.addBox(C.x + tx - 1.0, C.x + tx + 1.0, gy, gy + 0.9, C.z + tz - 0.7, C.z + tz + 0.7);
      this.tableWorld = { x: C.x + tx, z: C.z + tz }; }
    { const [sx, sz] = this.rot(-3.6, 4.6, C.yaw); const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.48, 10), w.mat("t_woodplank", 1, 1, 0x7a6448)); stool.position.set(C.x + sx, gy + 0.24, C.z + sz); scene.add(stool); }
    { const [lx, lz] = this.rot(3.4, 0.6, C.yaw); const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.6, 6), w.mat("t_darkwood", 1, 3, 0x4a3320)); pole.position.set(C.x + lx, gy + 1.3, C.z + lz); scene.add(pole);
      const lan = this.g.assets.glb.lantern; if (lan) { const m = lan.model.clone(); m.position.set(C.x + lx + 0.25, gy + 2.2, C.z + lz); m.scale.multiplyScalar(0.8); scene.add(m); } const l = new THREE.PointLight(0xffc070, 1.8, 14, 1.8); l.position.set(C.x + lx + 0.25, gy + 2.1, C.z + lz); scene.add(l); this.campLight = l; }
    // Hendrik himself, by the table, turning to you when you come close
    const H = A.hendrik;
    if (H) { const rigged = H.anims && H.anims.length; const body = rigged ? skeletonClone(H.model) : H.model.clone(); const [hx, hz] = this.rot(5.2, 3.4, C.yaw); body.position.set(C.x + hx, gy, C.z + hz); body.rotation.y = C.yaw + Math.PI * 0.7; scene.add(body); this.hendrik = { body, anim: rigged && !restOnly(H.anims) ? new ClipAnimator(body, H.anims) : null, yaw0: C.yaw + Math.PI * 0.7, x: C.x + hx, z: C.z + hz }; if (rigged && restOnly(H.anims)) meshyRig(body, 1); if (this.hendrik.anim) this.hendrik.anim.drive("idle", 0, 1, 0.016); w.addTree(C.x + hx, C.z + hz, 0.45, "npc"); }
    // the valley's name and his camp are found by standing here
    for (const [id, x, z, r] of [["skullvalley", (this.bounds().x0 + this.bounds().x1) / 2, (this.bounds().z0 + this.bounds().z1) / 2, 150], ["hendrik", C.x, C.z, 16], ["skullcave", S.skullCave.x, S.skullCave.z, S.skullCave.clearR], ["eyeshelter", this.eyePos ? this.eyePos.x : S.skullCave.x, this.eyePos ? this.eyePos.z : S.skullCave.z, 7]]) if (!CFG.locations.some((l) => l.id === id)) CFG.locations.push({ id, x, z, r, labelBelow: id === "eyeshelter" });
  }
  inTent(x, z) { const C = K().camp; return Math.hypot(x - C.x, z - C.z) < C.r; }
  // ---------------- the Therizinosaurus dens: a small skull cave, the gift chest in its mouth ----------------
  buildDens() {
    const S = K();
    for (const D of S.dens) {
      // update 82: the den is a MOUTH in the rock (the carved-cave scan), teeth hanging over a dark cave; the chest sits
      // in the mouth and the keeper stands on the sand before it. (The small skull stays only if the scan is missing.)
      const useCave = !!this.g.assets.glb[S.denModel];
      const cave = useCave ? this.place(S.denModel, D.x, D.z, D.yaw, 1) : this.place("sv_skull", D.x, D.z, D.yaw, S.denScale);
      let L = (this.skullSize ? this.skullSize.z : 55) * S.denScale;
      if (useCave && cave) { cave.updateMatrixWorld(true); const yaw = cave.rotation.y; cave.rotation.y = 0; cave.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(cave); cave.rotation.y = yaw; cave.updateMatrixWorld(true); L = bb.max.z - bb.min.z; cave.position.y -= 0.6; }
      const [cx, cz] = this.rot(0, L * (useCave ? 0.34 : 0.3), D.yaw);    // the chest in the mouth
      const [ax, az] = this.rot(0, L * (useCave ? 0.8 : 0.95), D.yaw);    // the den itself: the sand in front of the open mouth
      const chest = this.place("sv_chest", D.x + cx, D.z + cz, D.yaw + Math.PI, 0.9);
      this.dens.push({ x: D.x + ax, z: D.z + az, sx: D.x, sz: D.z, yaw: D.yaw, cave, chest, cx: D.x + cx, cz: D.z + cz, fedDay: -1, giftDay: -99, taken: false, growlT: 0, theri: null });
      this.w.addTree(D.x, D.z, L * 0.22, "den");   // the rock is solid
      // the keeper's trees: tall dead trees round the den, where it feeds
      const dt = this.g.assets.glb.deadtree;
      if (dt) for (let k = 0; k < S.denTrees; k++) { const a = D.yaw + Math.PI * 0.55 + (k / S.denTrees) * Math.PI * 0.9, r = L * 0.9 + 4 + this.rng() * 6; const x = D.x + ax * 0 + Math.sin(a) * r + ax, z = D.z + Math.cos(a) * r + az; const m = dt.model.clone(); m.scale.multiplyScalar(1.6 + this.rng() * 0.8); m.rotation.y = this.rng() * 6.28; m.position.set(x, this.w.groundHeight(x, z, 999) - 0.2, z); this.g.scene.add(m); this.w.addTree(x, z, 0.5); }
    }
  }
  den(i) { return this.dens[i]; }
  denFed(den) { return !!den && den.fedDay === this.g.dayNum; }
  // ---------------- bone chests, stones, dig mounds ----------------
  buildChests() {
    const S = K(), w = this.w;
    for (let i = 0; i < S.chestCount; i++) { const [x, z] = this.spot(14); const m = this.place("sv_chest", x, z, this.rng() * Math.PI * 2, 1); w.chests.push({ x, z, y: 0, opened: false, knife: false, snake: false, treasure: true, bone: true, mesh: m }); }
  }
  addStone(x, z, y, vein = false) {
    const b = this.g.assets.glb.boulder; let m = null;
    if (b) { m = b.model.clone(); m.traverse((o) => { if (o.isMesh) o.material = vein ? this.boneMat : this.darkMat; }); m.scale.multiplyScalar(vein ? 0.45 : 0.55 + this.rng() * 0.35); m.rotation.y = this.rng() * 6.28; m.position.set(x, y, z); this.g.scene.add(m); }
    this.stones.push({ x, z, y, mesh: m, scale0: m ? m.scale.clone() : null, left: 1, vein, emptyDay: -99 }); this.w.addTree(x, z, 0.6);
  }
  buildStones() {
    const S = K();
    for (const [a, b] of skullTunnels()) for (let i = 0; i < 4; i++) { const t = 0.15 + 0.7 * this.rng(), side = this.rng() < 0.5 ? -1 : 1; const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1; const x = a[0] + dx * t - dz / L * side * (S.tunnelHw - 1.1), z = a[1] + dz * t + dx / L * side * (S.tunnelHw - 1.1); this.addStone(x, z, 0); }
    for (let i = 0; i < S.stoneCount; i++) { const [x, z] = this.spot(18); this.addStone(x, z, this.w.groundHeight(x, z, 40)); }
    for (const [vx, vz] of S.veinSpots || []) this.addStone(vx, vz, this.w.groundHeight(vx, vz, 999), true);   // update 82: the fossil veins lie round the spine ridge, in the hunters' ground
  }
  buildDigs() {
    const S = K(), mat = this.w.mat("t_bonesand", 1, 1, 0xcfc8ba);
    for (let i = 0; i < S.digCount; i++) { const [x, z] = this.spot(12); const m = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.55, 12), mat); m.position.set(x, 0.1, z); this.g.scene.add(m); this.digs.push({ x, z, mesh: m, dugDay: -99 }); }
  }

  // ---------------- safety ----------------
  isSafe(x, z, y) {
    if (this.inTent(x, z)) return true;
    if (this.eyePos && Math.hypot(x - this.eyePos.x, z - this.eyePos.z) < K().eye.platR + 0.6 && Math.abs(y - this.eyePos.y) < 3) return true;
    for (const d of this.dens) if (this.denFed(d) && Math.hypot(x - d.x, z - d.z) < K().denSafeR) return true;
    return false;
  }

  // ---------------- interaction ----------------
  interact(consider, p) {
    const g = this.g, S = STR.skull, inv = p.inv, sel = inv.selected();
    if (this.hendrik) consider(this.hendrik.x, this.hendrik.z, p.pos.y, `${S.talk} [${STR.interact}]`, () => this.openHendrik());
    if (this.campChest) consider(this.campChest.x, this.campChest.z, this.campChest.y, `${STR.openStorage} [${STR.interact}]`, () => g.openStorage(this.storage, S.campChest));
    if (this.eyeChest) consider(this.eyeChest.x, this.eyeChest.z, this.eyeChest.y, `${STR.openStorage} [${STR.interact}]`, () => g.openStorage(this.eyeStorage, S.eyeChest));
    for (const f of this.fires) consider(f.x, f.z, f.y, `${STR.cookFirePrompt} [${STR.interact}]`, () => g.tryCook(f, true));
    // the dens: the gift, and feeding the keeper
    for (const d of this.dens) {
      const near = Math.hypot(p.pos.x - d.cx, p.pos.z - d.cz) < 3.2;
      if (near) { if (d.taken && this.g.dayNum < d.giftDay + K().giftRefillDays) consider(d.cx, d.cz, p.pos.y, S.giftEmpty, () => { g.ui.toast(S.giftEmpty); g.audio.sDeny(); }); else consider(d.cx, d.cz, p.pos.y, `${S.takeGift} [${STR.interact}]`, () => this.takeGift(d)); }
      if (d.theri && !d.theri.dead && Math.hypot(p.pos.x - d.theri.pos.x, p.pos.z - d.theri.pos.z) < 7 && d.theri.state !== "chase") consider(d.theri.pos.x, d.theri.pos.z, p.pos.y, `${S.feedPrompt} [${STR.interact}]`, () => this.openFeed(d));
    }
    // mining and digging: hold F
    const pick = sel && (sel.id === "pickaxe" || sel.id === "et_pickaxe" || sel.id === "fossil_pickaxe") ? sel.id : null;
    for (const s of this.stones) { if (s.left <= 0 || Math.hypot(p.pos.x - s.x, p.pos.z - s.z) > 3.4) continue; if (pick) consider(s.x, s.z, s.y, `${this.mining && this.mining.s === s ? S.mining.replace("%n", Math.round(100 * this.mining.t / this.mining.need)) : S.minePrompt} [${STR.interact}]`, () => this.mineStart(s, pick)); else consider(s.x, s.z, s.y, S.needPick, () => { g.ui.toast(S.needPick); g.audio.sDeny(); }); }
    for (const d of this.digs) { if (d.dugDay === g.dayNum || Math.hypot(p.pos.x - d.x, p.pos.z - d.z) > 3.0) continue; if (sel && sel.id === "spade") consider(d.x, d.z, 0, `${this.digging && this.digging.d === d ? S.digging.replace("%n", Math.round(100 * this.digging.t / this.digging.need)) : S.digPrompt} [${STR.interact}]`, () => this.digStart(d)); else consider(d.x, d.z, 0, S.needSpade, () => { g.ui.toast(S.needSpade); g.audio.sDeny(); }); }
    // the climb: two anchors, held and selected, at the foot of the skull below its eye
    if (this.eyePos && this.skullMesh) { const SC = K().skullCave; const d = Math.hypot(p.pos.x - this.eyePos.x, p.pos.z - this.eyePos.z); const anchors = inv.slots.reduce((n, s) => n + (s && s.id === "climbing_anchor" ? s.count : 0), 0); const ok = sel && sel.id === "climbing_anchor" && anchors >= CFG.climbAnchorsNeeded; if (d < SC.climbR && p.pos.y < 4) consider(p.pos.x, p.pos.z, p.pos.y, ok ? `${S.climb} [${STR.interact}]` : S.climbNeed, () => { if (!ok) { g.ui.toast(S.climbNeed); g.audio.sDeny(); return; } this.climbToEye(); }); }
  }
  async climbToEye() { const g = this.g, p = g.player; g.menuOpen = true; await g.ui.fade(true, 700); p.pos.set(this.eyePos.x, this.eyePos.y + 0.2, this.eyePos.z); p.vel.set(0, 0, 0); g.ui.toast(STR.skull.climbed); await g.ui.fade(false, 600); g.menuOpen = false; }
  mineStart(s, pickId) { if (this.mining && this.mining.s === s) return; const S = K(); this.mining = { s, pick: pickId, t: 0, need: pickId === "fossil_pickaxe" ? S.mineTime / 2 : pickId === "et_pickaxe" ? S.mineTime * 0.7 : S.mineTime, swingT: 0 }; }
  digStart(d) { if (this.digging && this.digging.d === d) return; this.digging = { d, t: 0, need: K().digTime, swingT: 0 }; }
  rollFossil(pick) {
    const S = K(), ch = pick === "fossil_pickaxe" ? S.fossilChancePick : S.fossilChance;
    for (const id of FOSSILS) if (Math.random() < ch) return id;   // ten rolls, one in a hundred each, never two
    return null;
  }
  updateHolds(dt) {
    const g = this.g, p = g.player, S = STR.skull, held = g.ui.held && g.ui.held.has("KeyF"), sel = p.inv.selected();
    const M = this.mining;
    if (M) {
      if (!held || g.menuOpen || !sel || sel.id !== M.pick || Math.hypot(p.pos.x - M.s.x, p.pos.z - M.s.z) > 3.8) this.mining = null;
      else { M.t += dt; M.swingT += dt; if (M.swingT > 0.6) { M.swingT = 0; g.audio.sHit(); }
        if (M.t >= M.need) { this.mining = null; const s = M.s; s.left = 0; s.emptyDay = g.dayNum; if (s.mesh) s.mesh.scale.setScalar(0.001);
          const fossil = this.rollFossil(M.pick); const gained = [];
          if (fossil) gained.push([fossil, 1]); else if (s.vein || Math.random() < K().veinChance) gained.push(["fossil_vein", 1]);
          if (!gained.length) g.ui.toast(S.stoneNothing); for (const [id, n] of gained) { if (!p.inv.add(id, n)) g.spawnDrop(id, n, s.x, s.z, s.y); g.ui.toast(id.startsWith("fossil_") && id !== "fossil_vein" ? S.fossilFound.replace("%i", STR.items[id].name) : S.veinFound); }
          g.audio.sPickup(); g.ui.renderHotbar(p.inv); } }
    }
    const D = this.digging;
    if (D) {
      if (!held || g.menuOpen || !sel || sel.id !== "spade" || Math.hypot(p.pos.x - D.d.x, p.pos.z - D.d.z) > 3.4) this.digging = null;
      else { D.t += dt; D.swingT += dt; if (D.swingT > 0.7) { D.swingT = 0; g.audio.noise(0.18, 700, 0.3); }
        if (D.t >= D.need) { this.digging = null; const d = D.d; d.dugDay = g.dayNum; d.mesh.scale.y = 0.25;
          const fossil = this.rollFossil(null); const gained = fossil ? [[fossil, 1]] : [[pickWeighted(Math.random, K().digLoot)[0], 1]];
          for (const [id, n] of gained) { if (!p.inv.add(id, n)) g.spawnDrop(id, n, d.x, d.z, 0); g.ui.toast(fossil ? S.fossilFound.replace("%i", STR.items[id].name) : S.dugUp.replace("%i", STR.items[id].name)); }
          g.audio.sPickup(); g.ui.renderHotbar(p.inv); } }
    }
  }
  // ---------------- the gift and the feeding ----------------
  takeGift(den) {
    const g = this.g, p = g.player, S = STR.skull;
    if (!this.denFed(den)) {   // unfed: the keeper takes it as theft
      if (den.theri && !den.theri.dead) { den.theri.state = "chase"; den.theri.angryT = 25; den.theri.target = null; }
      g.ui.toast(S.giftAngry); g.audio.sGrowl(); g.loudAct && g.loudAct();
    } else g.ui.toast(S.giftTaken);
    const [id, , n] = pickWeighted(Math.random, CFG.chestLoot);
    if (!p.inv.add(id, n || 1)) g.spawnDrop(id, n || 1, den.cx, den.cz, 0);
    den.taken = true; den.giftDay = g.dayNum; g.audio.sChest(); g.ui.renderHotbar(p.inv);
  }
  openFeed(den) {
    const g = this.g, p = g.player, S = STR.skull, T = CFG.theri;
    const foods = T.feeds.filter((id) => p.inv.has(id)), bad = T.refuses.filter((id) => p.inv.has(id));
    const lines = [this.denFed(den) ? S.theriFedLine : S.theriLine];
    if (!foods.length) lines.push(bad.length ? S.theriRefuse : S.theriNoFood);
    const btns = foods.map((id) => ["feed_" + id, STR.volcano.wolfFeed.replace("%i", STR.items[id].name)]);
    const s = g.npcPanel(S.theriTitle, lines, btns);
    for (const id of foods) { const b = s.querySelector("#feed_" + id); if (!b) continue; b.addEventListener("click", () => {
      if (!p.inv.has(id)) return; p.inv.removeOne(id); den.fedDay = g.dayNum; if (den.theri) { den.theri.state = "wander"; den.theri.target = null; den.theri.angryT = 0; }
      g.audio.sEat(); g.ui.renderHotbar(p.inv); g.ui.closeScreen(); g.resume(); g.ui.toast(S.fed); }); }
  }
  // ---------------- Hendrik ----------------
  openHendrik(page = "main") {
    const g = this.g, p = g.player, S = STR.skull, inv = p.inv, K2 = K();
    if (page === "dinos" || page === "fossils") { const s = g.npcPanel(S.name, page === "dinos" ? S.dinoLines : S.fossilLines); g.backToMain(s, () => this.openHendrik()); return; }
    if (this.pickDay !== g.dayNum) { this.pickDay = g.dayNum; this.pickSold = 0; }
    const veins = inv.count("fossil_vein"), full = this.boxFill.every(Boolean), hasBox = inv.has("collector_box") || this.storage.has("collector_box") || g.storage.has("collector_box") || this.eyeStorage.has("collector_box");
    const lines = [g.rng() < 0.3 ? S.partnerLines[0] : S.lines[Math.floor(g.rng() * S.lines.length)], S.veinsHave.replace("%n", veins)];   // update 82: he misses her
    if (page === "partner") { const s2 = g.npcPanel(S.name, g.bonePartnerKnown ? [S.partnerLines[0], S.partnerKnown] : S.partnerLines); g.backToMain(s2, () => this.openHendrik()); return; }   // update 82
    const btns = [["hkCoffee", STR.billCoffee.replace("Bill", "Hendrik")], ["hkDinos", S.askDinos], ["hkFossils", S.askFossils], ["hkPartner", S.askPartner]];
    btns.push(["hkPick", S.buyPick.replace("%n", K2.pickTradeVeins).replace("%m", K2.pickPerDay - this.pickSold)]);
    btns.push(["hkSpade", S.buySpade.replace("%n", K2.spadeVeins)]);
    if (!hasBox) btns.push(["hkBox", S.getBox]);
    if (full && inv.has("collector_box")) btns.push(["hkReward", S.claimReward]);
    const s = g.npcPanel(S.name, lines, btns);
    const on = (id, fn) => { const b = s.querySelector("#" + id); if (b) b.addEventListener("click", fn); };
    on("hkDinos", () => this.openHendrik("dinos")); on("hkFossils", () => this.openHendrik("fossils")); on("hkPartner", () => this.openHendrik("partner"));
    on("hkCoffee", () => { if (this.hendrikCoffeeDay === g.dayNum) { g.ui.toast(S.coffeeUsed); g.audio.sDeny(); return; } this.hendrikCoffeeDay = g.dayNum; g.coffeeT = CFG.coffee.regenTime; g.ui.closeScreen(); g.resume(); g.ui.toast(S.coffee); g.audio.sDrink(); });
    on("hkPick", () => { if (this.pickSold >= K2.pickPerDay) { g.ui.toast(S.pickOut); g.audio.sDeny(); return; } if (veins < K2.pickTradeVeins) { g.ui.toast(S.needVeins.replace("%n", K2.pickTradeVeins)); g.audio.sDeny(); return; } inv.remove("fossil_vein", K2.pickTradeVeins); if (!inv.add("pickaxe", 1)) g.spawnDrop("pickaxe", 1, p.pos.x, p.pos.z, p.pos.y); this.pickSold++; g.ui.renderHotbar(inv); g.ui.closeScreen(); g.resume(); g.ui.toast(S.pickBought); g.audio.sChest(); });
    on("hkSpade", () => { if (veins < K2.spadeVeins) { g.ui.toast(S.needVeins.replace("%n", K2.spadeVeins)); g.audio.sDeny(); return; } inv.remove("fossil_vein", K2.spadeVeins); if (!inv.add("spade", 1)) g.spawnDrop("spade", 1, p.pos.x, p.pos.z, p.pos.y); g.ui.renderHotbar(inv); g.ui.closeScreen(); g.resume(); g.ui.toast(S.spadeBought); g.audio.sChest(); });
    on("hkBox", () => { this.boxFill = FOSSILS.map(() => false); if (!inv.add("collector_box", 1)) g.spawnDrop("collector_box", 1, p.pos.x, p.pos.z, p.pos.y); g.ui.renderHotbar(inv); g.ui.closeScreen(); g.resume(); g.ui.toast(S.boxGiven); g.audio.sChest(); });
    on("hkReward", () => this.openReward());
  }
  openReward() {
    const g = this.g, p = g.player, S = STR.skull;
    const s = g.npcPanel(S.name, S.rewardLines, [["rwAmulet", S.rewardAmulet], ["rwWhistle", S.rewardWhistle], ["rwPick", S.rewardPick]]);
    const give = (id) => { p.inv.removeOne("collector_box"); this.boxFill = FOSSILS.map(() => false); if (!p.inv.add(id, 1)) g.spawnDrop(id, 1, p.pos.x, p.pos.z, p.pos.y); g.ui.renderHotbar(p.inv); g.ui.closeScreen(); g.resume(); g.ui.toast(S.rewardGiven.replace("%i", STR.items[id].name)); g.audio.sChest(); };
    for (const [bid, id] of [["rwAmulet", "amber_amulet"], ["rwWhistle", "bone_whistle"], ["rwPick", "fossil_pickaxe"]]) { const b = s.querySelector("#" + bid); if (b) b.addEventListener("click", () => give(id)); }
  }
  // the collector's box: its ten slots, and the fossils in your pack that fit an empty one
  openBox() {
    const g = this.g, p = g.player, S = STR.skull;
    const lines = FOSSILS.map((id, i) => { const u = iconUrl(id); return `<span style="display:inline-flex;align-items:center;gap:10px;opacity:${this.boxFill[i] ? 1 : 0.45}"><img src="${u}" alt="" style="width:40px;height:40px;${this.boxFill[i] ? "" : "filter:grayscale(1) brightness(.5)"}">${this.boxFill[i] ? "&#10004;" : "&#9675;"} ${STR.items[id].name}</span>`; });   // update 82: the fossils as their icons, dark until placed
    lines.push(`<i>${S.boxCount.replace("%n", this.boxFill.filter(Boolean).length)}</i>`);
    const can = FOSSILS.filter((id, i) => !this.boxFill[i] && p.inv.has(id));
    const s = g.npcPanel(S.boxTitle, lines, can.map((id) => ["bx_" + id, S.putIn.replace("%i", STR.items[id].name)]));
    for (const id of can) { const b = s.querySelector("#bx_" + id); if (b) b.addEventListener("click", () => { if (!p.inv.has(id)) return; p.inv.removeOne(id); this.boxFill[FOSSILS.indexOf(id)] = true; g.ui.renderHotbar(p.inv); g.audio.sPickup(); g.ui.closeScreen(); g.resume(); g.ui.toast(this.boxFill.every(Boolean) ? S.boxFull : S.boxPut.replace("%i", STR.items[id].name)); }); }
  }
  // ---------------- the whistle, the amulet, the rattling chests, the night ----------------
  blowWhistle() {
    const g = this.g, p = g.player, S = STR.skull, K2 = K();
    if (!this.inside(p.pos.x, p.pos.z)) { g.ui.toast(S.whistleOutside); g.audio.sDeny(); return; }
    if (this.whistleT > 0) { g.ui.toast(S.whistleWait.replace("%n", Math.ceil(this.whistleT))); g.audio.sDeny(); return; }
    this.whistleT = K2.whistleCd;
    const x = p.pos.x - Math.sin(p.yaw) * K2.whistleAhead, z = p.pos.z - Math.cos(p.yaw) * K2.whistleAhead;
    g.audio.blip(880, 0.5, "sine", 0.35, -300); setTimeout(() => g.audio.blip(660, 0.7, "sine", 0.3, -200), 350);
    g.emitNoise(x, z, K2.whistleR); g.ui.toast(S.whistled);
  }
  amuletSave(source) {
    const g = this.g, p = g.player;
    if (this.amuletLock || !p.inv.has("amber_amulet") || !K().amuletSources.includes(source)) return false;   // a dinosaur's bite only
    this.amuletLock = true; this.amuletOpenT = 0; g.ui.toast(STR.skull.amuletSaved); g.ui.shake(1.2); return true;
  }
  chestOpened(c) {
    const g = this.g, K2 = K();
    if (Math.random() >= K2.rattleChance) return;
    g.ui.toast(STR.skull.rattle);
    for (let i = 0; i < 7; i++) setTimeout(() => { g.audio.noise(0.08, 1800 + Math.random() * 1200, 0.5, "bandpass"); g.audio.blip(160 + Math.random() * 90, 0.06, "square", 0.25, -40); }, i * 110);
    g.emitNoise(c.x, c.z, K2.rattleR);
  }
  // ---------------- every frame ----------------
  update(dt) {
    const g = this.g, p = g.player, K2 = K();
    this.t += dt;
    if (g.dayNum !== this.day) { this.day = g.dayNum; for (const s of this.stones) if (s.left <= 0 && g.dayNum > s.emptyDay) { s.left = 1; if (s.mesh && s.scale0) s.mesh.scale.copy(s.scale0); } for (const d of this.digs) d.mesh.scale.y = 1; for (const d of this.dens) if (d.taken && g.dayNum >= d.giftDay + K2.giftRefillDays) d.taken = false; }
    this.updateHolds(dt);
    // bones and boulders beyond the fog are not drawn (the frustum alone leaves hundreds of scans in the draw list)
    this.cullT = (this.cullT || 0) - dt;
    if (this.cullT <= 0) { this.cullT = 0.3; const cam = g.camera.position, far = (g.scene.fog ? g.scene.fog.far : 400) + 20, f2 = far * far; for (const o of this.bones) if (o.mesh) o.mesh.visible = (o.x - cam.x) ** 2 + (o.z - cam.z) ** 2 < f2 + o.h * o.h; for (const o of this.rocks) if (o.mesh) o.mesh.visible = (o.x - cam.x) ** 2 + (o.z - cam.z) ** 2 < f2; }
    if (this.whistleT > 0) this.whistleT -= dt;
    if (g.dizzyT > 0) g.dizzyT -= dt;
    // the amulet re-arms once the hunter that would have killed you has lost you (no chase within 60 m for four seconds)
    if (this.amuletLock) { const chased = g.creatures.some((c) => !c.dead && c.state === "chase" && Math.hypot(c.pos.x - p.pos.x, c.pos.z - p.pos.z) < 60) || g.wolves.some((c) => !c.dead && c.state === "chase" && Math.hypot(c.pos.x - p.pos.x, c.pos.z - p.pos.z) < 60); this.amuletOpenT = chased ? 0 : this.amuletOpenT + dt; if (this.amuletOpenT > 4 && p.inv.has("amber_amulet")) { this.amuletLock = false; g.ui.toast(STR.skull.amuletReady); } }
    // the fires flicker
    for (const f of this.fires) { const k = 0.85 + 0.15 * Math.sin(this.t * 9 + f.x) * Math.cos(this.t * 13); f.light.intensity = 3.2 * k; for (const fl of f.flames) { fl.scale.y = 0.9 + 0.2 * Math.sin(this.t * 11 + f.z); fl.lookAt(g.camera.position.x, fl.position.y + f.y, g.camera.position.z); } }
    // Hendrik turns to you when you are near
    if (this.hendrik) { const H = this.hendrik, d = Math.hypot(p.pos.x - H.x, p.pos.z - H.z); const want = d < 6 ? Math.atan2(p.pos.x - H.x, p.pos.z - H.z) : H.yaw0; let dy = want - H.body.rotation.y; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2; H.body.rotation.y += dy * Math.min(1, dt * 4); if (H.anim) H.anim.drive("idle", 0, 1, dt); if (H.body.userData.mrig && d < 120) { let ht = want - H.body.rotation.y; while (ht > Math.PI) ht -= Math.PI * 2; while (ht < -Math.PI) ht += Math.PI * 2; driveMeshy(H.body, dt, { state: "idle", h: 1.75, headTurn: d < 6 ? ht : null, style: "busy" }); } }
    if (this.campLight) this.campLight.intensity = 0.5 + 1.6 * (g.world.nightK || 0);
    // the valley is seen further than the forest: the fog stands off while you are inside (a preset change is adopted as the new base)
    { const w = g.world; if (this.fogApplied === undefined || w.fogMult !== this.fogApplied) this.fogBase = w.fogMult; const want = this.inside(p.pos.x, p.pos.z) ? this.fogBase * K2.fogMult : this.fogBase; if (w.fogMult !== want) { w.fogMult = want; w.updateEnv && w.updateEnv(0); } this.fogApplied = want; }
    // the dens: the unfed keeper stands and growls when you walk in
    for (const d of this.dens) { if (!d.theri || d.theri.dead) continue; const inDen = Math.hypot(p.pos.x - d.x, p.pos.z - d.z) < K2.denR; d.growlT -= dt; if (inDen && !this.denFed(d) && d.theri.state !== "chase" && d.growlT <= 0) { d.growlT = 9; g.ui.toast(STR.skull.theriGrowl); g.audio.sGrowl(); } }
    // the night: Majungasaurus calls echo through the valley
    if (g.isNight) { this.howlT -= dt; if (this.howlT <= 0) { this.howlT = K2.howl[0] + g.rng() * (K2.howl[1] - K2.howl[0]); const ms = g.creatures.filter((c) => c.majunga && !c.dead); if (ms.length && (this.inside(p.pos.x, p.pos.z) || Math.hypot(p.pos.x - K2.skullCave.x, p.pos.z - K2.skullCave.z) < 500)) { const c = ms[Math.floor(g.rng() * ms.length)]; const dd = Math.hypot(c.pos.x - p.pos.x, c.pos.z - p.pos.z); g.audio.play3d("roar", Math.max(40, dd * 0.5), (c.pos.x - p.pos.x) * 0.01, 600, 0.5, 0.62); } } }
  }
  cull(cullEnt) { if (this.hendrik) cullEnt(this.hendrik.body); }

  // ---------------- the map ----------------
  // the valley's map layer is baked ONCE per kind (mini / full) into an offscreen canvas at 2 m per pixel: painting it live
  // sampled the heightfield thousands of times per minimap frame (300 ms every 120 ms = the whole game at 3 fps)
  paint(c, tx, ty, s, mini) {
    const S = K(), P = S.poly, B = this.bounds(), key = mini ? "mini" : "full";
    this.mapCache = this.mapCache || {};
    if (!this.mapCache[key]) {
      const mpp = 2, cv = document.createElement("canvas"); cv.width = Math.ceil((B.x1 - B.x0) / mpp); cv.height = Math.ceil((B.z1 - B.z0) / mpp);
      const cc = cv.getContext("2d"); this.paintInto(cc, (x) => (x - B.x0) / mpp, (z) => (z - B.z0) / mpp, 1 / mpp, mini);
      this.mapCache[key] = cv;
    }
    c.save(); c.beginPath(); P.forEach(([x, z], i) => i ? c.lineTo(tx(x), ty(z)) : c.moveTo(tx(x), ty(z))); c.closePath(); c.clip();
    c.drawImage(this.mapCache[key], tx(B.x0), ty(B.z0), (B.x1 - B.x0) * s, (B.z1 - B.z0) * s);
    c.restore();
    c.strokeStyle = mini ? "rgba(40,42,40,.9)" : "#2c2e2b"; c.lineWidth = Math.max(1.5, 3 * s); c.lineJoin = "round";
    c.beginPath(); for (let i = 0; i <= S.edgeN; i++) { const [x, z] = P[i]; i ? c.lineTo(tx(x), ty(z)) : c.moveTo(tx(x), ty(z)); } c.stroke();
  }
  paintInto(c, tx, ty, s, mini) {
    const S = K(), P = S.poly, B = this.bounds();
    c.save(); c.beginPath(); P.forEach(([x, z], i) => i ? c.lineTo(tx(x), ty(z)) : c.moveTo(tx(x), ty(z))); c.closePath(); c.clip();
    c.fillStyle = mini ? "rgba(222,216,202,.85)" : "#ded8c8"; c.fillRect(tx(B.x0) - 2, ty(B.z0) - 2, (B.x1 - B.x0) * s + 4, (B.z1 - B.z0) * s + 4);
    // the rock: every cell with cliff under it, grey, darker the higher; then hatch strokes on the slopes
    const G = mini ? 6 : 4;
    for (let z = B.z0; z < B.z1; z += G) for (let x = B.x0; x < B.x1; x += G) {
      const h = skullH(x + G / 2, z + G / 2); if (h < 1.5) continue;
      const k = Math.min(1, h / 36); c.fillStyle = "rgb(" + Math.round(158 - 70 * k) + "," + Math.round(158 - 70 * k) + "," + Math.round(152 - 66 * k) + ")";
      c.fillRect(tx(x), ty(z), G * s + 0.6, G * s + 0.6);
    }
    if (!mini) {
      let seed = 99; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
      c.strokeStyle = "rgba(40,42,38,.75)"; c.lineWidth = 1;
      for (let k = 0; k < 1400; k++) { const x = B.x0 + rnd() * (B.x1 - B.x0), z = B.z0 + rnd() * (B.z1 - B.z0); const h = skullH(x, z); if (h < 6 || !this.inside(x, z)) continue; const px = tx(x), py = ty(z), l = 2 + rnd() * 3 + h * 0.06; c.beginPath(); c.moveTo(px - l, py + l * 0.55); c.lineTo(px, py - l * 0.65); c.lineTo(px + l, py + l * 0.55); c.stroke(); }
      c.fillStyle = "rgba(120,110,92,.45)";
      for (let k = 0; k < 500; k++) { const x = B.x0 + rnd() * (B.x1 - B.x0), z = B.z0 + rnd() * (B.z1 - B.z0); if (!this.inside(x, z) || skullH(x, z) > 0.5) continue; c.fillRect(tx(x), ty(z), 1.2, 1.2); }
      // the tunnels: dark gaps through the rock
      c.strokeStyle = "#1c1d1b"; c.lineWidth = Math.max(1.5, S.tunnelHw * 2 * s); c.lineCap = "butt";
      for (const [a, b] of skullTunnels()) { c.beginPath(); c.moveTo(tx(a[0]), ty(a[1])); c.lineTo(tx(b[0]), ty(b[1])); c.stroke(); }
      // the bones: pale glyphs, the giants drawn, the small ones as flecks
      for (const o of this.bones || []) {
        const px = tx(o.x), py = ty(o.z), r = Math.max(1.2, o.h * 0.5 * s);
        c.fillStyle = "#f2ede0"; c.strokeStyle = "#5a5448"; c.lineWidth = 0.8;
        if (o.h < 5) { c.beginPath(); c.arc(px, py, 1.1, 0, 6.28); c.fill(); continue; }
        if (o.kind === "sv_skull") { c.beginPath(); c.arc(px, py, r, 0, 6.28); c.fill(); c.stroke(); c.fillStyle = "#3a3430"; c.beginPath(); c.arc(px - r * 0.35, py - r * 0.15, r * 0.22, 0, 6.28); c.arc(px + r * 0.35, py - r * 0.15, r * 0.22, 0, 6.28); c.fill(); }
        else if (o.kind === "sv_ribcage") { c.strokeStyle = "#f2ede0"; c.lineWidth = 1.4; for (let i = -1; i <= 1; i++) { c.beginPath(); c.arc(px + i * r * 0.7, py, r * 0.8, Math.PI, 0); c.stroke(); } }
        else if (o.kind === "sv_spine") { for (let i = -2; i <= 2; i++) { c.beginPath(); c.arc(px + i * r * 0.55, py + i * r * 0.2, r * 0.26, 0, 6.28); c.fill(); } }
        else { c.beginPath(); c.ellipse(px, py, r * 1.1, r * 0.4, 0.6, 0, 6.28); c.fill(); c.stroke(); }
      }
    }
    c.restore();
  }
  paintGlyphs(c, tx, ty, s, disc) {
    const S = K(), bone = "#efe9da", ink = "#3a3430";
    const skull = (x, z, r) => { c.fillStyle = bone; c.strokeStyle = ink; c.lineWidth = 1.2; c.beginPath(); c.arc(tx(x), ty(z) - r * 0.2, r, 0, Math.PI * 2); c.fill(); c.stroke(); c.fillStyle = ink; c.beginPath(); c.arc(tx(x) - r * 0.4, ty(z) - r * 0.3, r * 0.22, 0, Math.PI * 2); c.arc(tx(x) + r * 0.4, ty(z) - r * 0.3, r * 0.22, 0, Math.PI * 2); c.fill(); c.fillStyle = bone; c.fillRect(tx(x) - r * 0.5, ty(z) + r * 0.5, r, r * 0.5); c.strokeRect(tx(x) - r * 0.5, ty(z) + r * 0.5, r, r * 0.5); };
    if (disc.has("skullcave")) skull(S.skullCave.x, S.skullCave.z, Math.max(5, 22 * s));
    if (disc.has("skullvalley")) { const R = S.ribcage; c.strokeStyle = bone; c.lineWidth = Math.max(1.5, 3 * s); for (let i = -2; i <= 2; i++) { c.beginPath(); c.arc(tx(R.x + i * 7), ty(R.z), Math.max(3, 10 * s), Math.PI, Math.PI * 2); c.stroke(); } const Sp = S.spine; for (let i = -4; i <= 4; i++) { c.fillStyle = bone; c.beginPath(); c.arc(tx(Sp.x + i * 8), ty(Sp.z - i * 3), Math.max(1.5, 3 * s), 0, Math.PI * 2); c.fill(); } }
    if (disc.has("hendrik")) { const C = S.camp; c.fillStyle = "#c8793a"; c.strokeStyle = ink; c.lineWidth = 1; c.beginPath(); c.moveTo(tx(C.x), ty(C.z) - 8 * Math.max(0.5, s * 1.4)); c.lineTo(tx(C.x) - 8, ty(C.z) + 5); c.lineTo(tx(C.x) + 8, ty(C.z) + 5); c.closePath(); c.fill(); c.stroke(); }
  }
}
