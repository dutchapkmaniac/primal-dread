import * as THREE from "three";
import { CFG } from "./config.js?v=72";
import { STR } from "../strings.js?v=72";
import { riggedHumanoid, driveHumanoid } from "./humanoid.js?v=72";
import { clone as skeletonClone } from "three/addons/utils/SkeletonUtils.js";
import { Creature } from "./entities.js?v=72";
import { iconUrl } from "./items.js?v=72";

// ============================================================================
// update 69 (prompt37, update 1): the forest dressed up. Mild hills (makeHills, used by World.groundHeight and the forest
// floor tiles), fallen trunks you jump and a T-Rex slows on, mushrooms, yellow and white flowers, rosemary and belladonna
// as painted billboards you pick, the Meganeura (a 70 cm dragonfly that bursts from a tree while you run and only fights
// if you touch, hit or swing at it; its bite can poison you), bats in the crowns at night (chop a tree and one or two
// come for you), the beetle that climbs out of one chest in ten, and the witch's hut: her daily trade for ten empty
// vials, a bed, and the book of every potion. The creatures ride the Creature class (entities.js) with their own update
// methods attached here; their bodies are painted planes that flap.
// ============================================================================
const smooth = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
const D2R = Math.PI / 180;

// ---------------------------------------------------------------------------- the hills
// update 71: the hills are ONE heightfield. A value noise on two wavelengths is sampled once per G metres (lazily, cached),
// masked to zero at the temple's clearing, on the paths and in every landmark; between the samples h() interpolates on the
// two triangles of a cell - the SAME split the ground meshes are built on (World.buildHillGround) - so the ground you walk
// on, the feet of the trees and the grass you look at are a single surface. (Before, the walk height was raw noise with an
// 8 m stepped mask, the inner tiles were coarser PlaneGeometries of it and the grass plane and outer tiles were flat: trees
// floated over hollows, sank into rises, and you waded through ground the mesh drew higher than you stood.)
export function makeHills(world) {
  const H = CFG.forestHills, G = H.grid || 5;
  const hash = (ix, iz) => { let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + 1013904223) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
  const vn = (x, z, w) => { const gx = x / w, gz = z / w, ix = Math.floor(gx), iz = Math.floor(gz), fx = gx - ix, fz = gz - iz, sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz); const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1); return (a + (b - a) * sx) * (1 - sz) + (c + (d - c) * sx) * sz; };
  // the forest-edge mask: nine samples round an 8 m cell, then blended between cells (no steps)
  const cellMask = new Map();
  const cellM = (kx, kz) => {
    const key = kx * 200003 + kz; let m = cellMask.get(key); if (m !== undefined) return m;
    const cx = kx * 8, cz = kz * 8; let out = 0;
    for (let i = 0; i < 9; i++) { const sx = i === 0 ? cx : cx + Math.cos(i * Math.PI / 4) * H.edge, sz = i === 0 ? cz : cz + Math.sin(i * Math.PI / 4) * H.edge; if (!world.inForest(sx, sz)) out++; }
    m = 1 - out / 9; cellMask.set(key, m); return m;
  };
  const maskAt = (x, z) => {
    const gx = x / 8, gz = z / 8, kx = Math.floor(gx), kz = Math.floor(gz), fx = gx - kx, fz = gz - kz;
    let m = (cellM(kx, kz) * (1 - fx) + cellM(kx + 1, kz) * fx) * (1 - fz) + (cellM(kx, kz + 1) * (1 - fx) + cellM(kx + 1, kz + 1) * fx) * fz;
    m *= smooth((world.distToPath(x, z) - H.pathClear) / H.pathBlend);   // flat on the path, rising over pathBlend metres beside it
    const r = Math.hypot(x, z); m *= smooth((r - H.templeFlatR) / (H.templeBlendR - H.templeFlatR));
    return m;
  };
  // one height per grid node (ix, iz) = (ix*G, iz*G)
  const samples = new Map();
  const at = (ix, iz) => {
    const key = ix * 200003 + iz; let v = samples.get(key); if (v !== undefined) return v;
    const x = ix * G, z = iz * G, m = maskAt(x, z);
    if (m <= 0.001) v = 0;
    else { const n = (vn(x, z, H.wave1) - 0.5) * 1.3 + (vn(x + 1000, z - 1000, H.wave2) - 0.5) * 0.6; v = Math.max(-H.amp, Math.min(H.amp, n * H.amp * 1.7)) * m; }
    samples.set(key, v); return v;
  };
  // the cell (ix, iz) is two triangles: (x,z)-(x,z+G)-(x+G,z) and (x,z+G)-(x+G,z+G)-(x+G,z); fx+fz<=1 is the first
  const h = (x, z) => {
    const gx = x / G, gz = z / G, ix = Math.floor(gx), iz = Math.floor(gz), fx = gx - ix, fz = gz - iz;
    const h00 = at(ix, iz), h10 = at(ix + 1, iz), h01 = at(ix, iz + 1), h11 = at(ix + 1, iz + 1);
    return fx + fz <= 1 ? h00 + (h10 - h00) * fx + (h01 - h00) * fz : h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz);
  };
  return { h, maskAt, at, G };
}

// ---------------------------------------------------------------------------- painted planes
const spriteMat = (tex) => new THREE.MeshStandardMaterial({ map: tex, transparent: false, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9, metalness: 0 });
// a flat plane lying in the XZ plane, image-up = +z, image-right = +x, UV cropped to [u0,u1]
const flatPlane = (w, h, u0 = 0, u1 = 1, cx = 0) => { const g = new THREE.PlaneGeometry(w, h); g.rotateX(Math.PI / 2); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, u0 + uv.getX(i) * (u1 - u0)); g.translate(cx, 0, 0); return g; };

export class Forest {
  constructor(game) {
    this.g = game; this.world = game.world; this.scene = game.scene; this.rng = game.rng;
    this.pickups = []; this.trunks = []; this.flocks = []; this.tex = {}; this.mats = {};
    const F = CFG.forest; this.megT = F.meganeura.every * (0.4 + this.rng() * 0.6); this.flockT = 0; this.day = game.dayNum; this.witchTradedDay = -1;
    this.loadTextures();
    this.buildTrunks(); this.buildPickups(); this.buildBats(); this.buildWitchHut();
    this.installCreatureLogic();
  }
  loadTextures() {
    const L = new THREE.TextureLoader();
    for (const id of ["spr_mushroom", "spr_yellow_flower", "spr_white_flower", "spr_rosemary", "spr_belladonna", "spr_bat", "spr_beetle", "spr_meganeura"]) {
      const t = L.load(`./assets/tex/${id}.png`); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; this.tex[id] = t; this.mats[id] = spriteMat(t);
    }
  }

  // ---------------- fallen trunks ----------------
  buildTrunks() {
    const w = this.world, F = CFG.forest.trunks, rng = this.rng, S = CFG.world.square - 60;
    const geo = new THREE.CylinderGeometry(0.42, 0.5, 1, 10); geo.rotateZ(Math.PI / 2);   // along +x, unit length
    const mat = w.mat("t_bark", 3, 1, 0x4a3b2a); const dummy = new THREE.Object3D(); const mats = [];
    let guard = 0;
    while (this.trunks.length < F.count && guard++ < 40000) {
      const x = (rng() * 2 - 1) * S, z = (rng() * 2 - 1) * S; if (Math.hypot(x, z) < F.minR) continue;
      if (!w.inForest(x, z) || w.distToPath(x, z) < 8 || w.inNewLandmark(x, z, 10)) continue;
      const L = F.len[0] + rng() * (F.len[1] - F.len[0]), yaw = rng() * Math.PI * 2, ux = Math.cos(yaw), uz = -Math.sin(yaw);
      let clear = true; for (let k = -1; k <= 1 && clear; k++) { const px = x + ux * k * L / 2, pz = z + uz * k * L / 2; for (const t of w.treesNear(px, pz)) if (Math.hypot(t.x - px, t.z - pz) < 3.2) { clear = false; break; } if (!w.inForest(px, pz)) clear = false; }
      if (!clear || this.trunks.some((t) => Math.hypot(t.x - x, t.z - z) < 14)) continue;
      const y = w.groundHeight(x, z, 0) + 0.42;
      dummy.position.set(x, y, z); dummy.rotation.set(0, yaw, (rng() - 0.5) * 0.06); dummy.scale.set(L, 1, 1); dummy.updateMatrix(); mats.push(dummy.matrix.clone());
      const n = Math.max(3, Math.round(L / 1.4)); for (let k = 0; k < n; k++) { const t = (k + 0.5) / n - 0.5, px = x + ux * t * L, pz = z + uz * t * L, gy = w.groundHeight(px, pz, 0); w.addBox(px - 0.75, px + 0.75, gy, gy + F.collideH, pz - 0.75, pz + 0.75); }
      this.trunks.push({ x, z, yaw, L, ux, uz });
    }
    const inst = new THREE.InstancedMesh(geo, mat, Math.max(1, mats.length)); mats.forEach((m, i) => inst.setMatrixAt(i, m)); inst.count = mats.length; inst.instanceMatrix.needsUpdate = true; inst.castShadow = true; inst.receiveShadow = true;
    if (inst.computeBoundingSphere) inst.computeBoundingSphere(); this.scene.add(inst); this.trunkMesh = inst;
  }
  trunkNear(x, z, r) { for (const t of this.trunks) { const dx = x - t.x, dz = z - t.z; if (dx * dx + dz * dz > (t.L / 2 + 3) * (t.L / 2 + 3)) continue; const s = Math.max(-t.L / 2, Math.min(t.L / 2, dx * t.ux + dz * t.uz)); if (Math.hypot(dx - t.ux * s, dz - t.uz * s) < r) return true; } return false; }

  // ---------------- things you pick ----------------
  // flowers and herbs are crossed painted planes; mushrooms are real: a cap (half sphere, orange with cream dots painted on a
  // canvas), a cream stem and a gill disc, one to four per spot, each one its own instance so a pick takes one at a time
  mushroomGeos() {
    const cap = new THREE.SphereGeometry(0.19, 14, 9, 0, Math.PI * 2, 0, Math.PI * 0.5); cap.scale(1, 0.72, 1); cap.translate(0, 0.27, 0);
    const gill = new THREE.CircleGeometry(0.185, 14); gill.rotateX(Math.PI / 2); gill.translate(0, 0.27, 0);
    const stem = new THREE.CylinderGeometry(0.055, 0.075, 0.3, 10); stem.translate(0, 0.15, 0);
    const cv = document.createElement("canvas"); cv.width = cv.height = 256; const g = cv.getContext("2d");
    const grad = g.createRadialGradient(128, 128, 20, 128, 128, 150); grad.addColorStop(0, "#d4602a"); grad.addColorStop(0.7, "#b8431c"); grad.addColorStop(1, "#7a2a12"); g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
    let seed = 31; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let i = 0; i < 46; i++) { const r = 5 + rnd() * 11; g.beginPath(); g.ellipse(rnd() * 256, rnd() * 256, r, r * (0.7 + rnd() * 0.3), rnd() * 3, 0, Math.PI * 2); g.fillStyle = `rgba(245,232,200,${0.75 + rnd() * 0.25})`; g.fill(); }
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const capM = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 }), stemM = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.9 }), gillM = new THREE.MeshStandardMaterial({ color: 0xd8c8a4, roughness: 1, side: THREE.DoubleSide });
    return { cap, gill, stem, capM, stemM, gillM };
  }
  buildPickups() {
    const w = this.world, F = CFG.forest.pickups, rng = this.rng, S = CFG.world.square - 40;
    const kinds = [["mushroom", null, F.mushrooms, 0, 0], ["yellow_flower", "spr_yellow_flower", F.yellow, 0.7, 0.62], ["white_flower", "spr_white_flower", F.white, 0.7, 0.62], ["rosemary", "spr_rosemary", F.rosemary, 1.05, 1.0], ["belladonna", "spr_belladonna", F.belladonna, 1.0, 1.15]];
    const dummy = new THREE.Object3D(); this.pickDummy = dummy;
    for (const [kind, sprite, count, wd, ht] of kinds) {
      const spots = []; let guard = 0;
      while (spots.length < count && guard++ < 60000) {
        const x = (rng() * 2 - 1) * S, z = (rng() * 2 - 1) * S; if (Math.hypot(x, z) < F.minR) continue;
        if (!w.inForest(x, z) || w.distToPath(x, z) < 4 || w.inNewLandmark(x, z, 6)) continue;
        let ok = true; for (const t of w.treesNear(x, z)) if (Math.hypot(t.x - x, t.z - z) < 1.8) { ok = false; break; } if (!ok) continue;
        if (this.pickups.some((p) => Math.abs(p.x - x) < 5 && Math.abs(p.z - z) < 5 && Math.hypot(p.x - x, p.z - z) < 5)) continue;
        const y = w.groundHeight(x, z, 0);
        const n = kind === "mushroom" ? 1 + Math.floor(rng() * 4) : kind.endsWith("flower") ? 1 + Math.floor(rng() * 2) : 1 + (rng() < 0.5 ? 1 + (rng() < 0.5 ? 1 : 0) : 0);
        spots.push({ kind, x, z, y, n, max: n, yaw: rng() * Math.PI, sc: 0.85 + rng() * 0.3 });
      }
      if (kind === "mushroom") {
        const G = this.mushroomGeos(); const total = spots.reduce((a, s) => a + s.max, 0);
        const capI = new THREE.InstancedMesh(G.cap, G.capM, Math.max(1, total)), gillI = new THREE.InstancedMesh(G.gill, G.gillM, Math.max(1, total)), stemI = new THREE.InstancedMesh(G.stem, G.stemM, Math.max(1, total));
        let k = 0;
        for (const sp of spots) { sp.shrooms = []; for (let i = 0; i < sp.max; i++) { const a = rng() * Math.PI * 2, r = i === 0 ? 0 : 0.18 + rng() * 0.3, sc = 0.7 + rng() * 0.7, tilt = (rng() - 0.5) * 0.25; const m = { x: sp.x + Math.cos(a) * r, z: sp.z + Math.sin(a) * r, y: w.groundHeight(sp.x + Math.cos(a) * r, sp.z + Math.sin(a) * r, 0), sc, yaw: rng() * 6.28, tilt, idx: k++ }; sp.shrooms.push(m); dummy.position.set(m.x, m.y - 0.02, m.z); dummy.rotation.set(tilt, m.yaw, 0); dummy.scale.setScalar(sc); dummy.updateMatrix(); for (const inst of [capI, gillI, stemI]) inst.setMatrixAt(m.idx, dummy.matrix); } }
        for (const inst of [capI, gillI, stemI]) { inst.count = total; inst.instanceMatrix.needsUpdate = true; inst.castShadow = true; if (inst.computeBoundingSphere) inst.computeBoundingSphere(); this.scene.add(inst); }
        this.mushroomInst = [capI, gillI, stemI];
      } else {
        const geoA = new THREE.PlaneGeometry(wd, ht), geoB = new THREE.PlaneGeometry(wd, ht); geoA.translate(0, ht / 2, 0); geoB.translate(0, ht / 2, 0); geoB.rotateY(Math.PI / 2);
        const mat = this.mats[sprite];
        for (const [geo, tag] of [[geoA, "a"], [geoB, "b"]]) {
          const inst = new THREE.InstancedMesh(geo, mat, Math.max(1, spots.length));
          spots.forEach((sp, i) => { dummy.position.set(sp.x, sp.y, sp.z); dummy.rotation.set(0, sp.yaw, 0); dummy.scale.setScalar(sp.sc); dummy.updateMatrix(); inst.setMatrixAt(i, dummy.matrix); sp["inst" + tag] = inst; sp.idx = i; });
          inst.count = spots.length; inst.instanceMatrix.needsUpdate = true; inst.castShadow = false; if (inst.computeBoundingSphere) inst.computeBoundingSphere(); this.scene.add(inst);
        }
      }
      this.pickups.push(...spots);
    }
  }
  // a spot with `n` left shows: a mushroom spot its first n mushrooms, a plant its billboard while n > 0
  setPickVisible(s, on) {
    const d = this.pickDummy;
    if (s.kind === "mushroom") { s.shrooms.forEach((m, i) => { const show = on && i < s.n; d.position.set(m.x, m.y - 0.02, m.z); d.rotation.set(m.tilt, m.yaw, 0); d.scale.setScalar(show ? m.sc : 0.0001); d.updateMatrix(); for (const inst of this.mushroomInst) { inst.setMatrixAt(m.idx, d.matrix); inst.instanceMatrix.needsUpdate = true; } }); return; }
    d.position.set(s.x, s.y, s.z); d.rotation.set(0, s.yaw, 0); d.scale.setScalar(on ? s.sc : 0.0001); d.updateMatrix(); for (const inst of [s.insta, s.instb]) { inst.setMatrixAt(s.idx, d.matrix); inst.instanceMatrix.needsUpdate = true; }
  }
  respawnPickups() { for (const s of this.pickups) { if (s.n < s.max) { s.n = s.max; this.setPickVisible(s, true); } } }
  // ---------------- the night's bats (looks only) ----------------
  batBody(size) {
    const g = new THREE.Group(), m = this.mats.spr_bat;
    const l = new THREE.Mesh(flatPlane(size / 2, size * 0.5, 0, 0.5, -size / 4), m), r = new THREE.Mesh(flatPlane(size / 2, size * 0.5, 0.5, 1, size / 4), m);
    g.add(l, r); g.userData.anim = { wl: l, wr: r, hz: 9, amp: 0.7 }; return g;
  }
  buildBats() { for (let i = 0; i < CFG.forest.bats.flocks * CFG.forest.bats.perFlock; i++) { const b = this.batBody(0.55); b.visible = false; this.scene.add(b); this.flocks.push({ mesh: b, flock: Math.floor(i / CFG.forest.bats.perFlock), k: i % CFG.forest.bats.perFlock, ph: this.rng() * 6.28 }); } this.flockCentres = []; }
  pickFlockTrees() {
    const p = this.g.player, w = this.world, out = [];
    for (let tries = 0; tries < 30 && out.length < CFG.forest.bats.flocks; tries++) {
      const a = this.rng() * Math.PI * 2, d = 14 + this.rng() * 30, x = p.pos.x + Math.sin(a) * d, z = p.pos.z + Math.cos(a) * d;
      let best = null; for (const t of w.treesNear(x, z)) if (!t.tag && (!best || t.r > best.r)) best = t;
      if (!best || out.some((o) => Math.hypot(o.x - best.x, o.z - best.z) < 10)) continue;
      const s = best.r / 0.55; out.push({ x: best.x, z: best.z, y: w.groundHeight(best.x, best.z, 0) + 13 * s * 0.62, r: 3 + s * 1.2 });
    }
    this.flockCentres = out;
  }

  // ---------------- the witch's hut ----------------
  buildWitchHut() {
    const w = this.world, W = CFG.witchHut, g = this.g, A = g.assets, scene = this.scene;
    const hx = W.x, hz = W.z, y0 = w.groundHeight(hx, hz, 0), yaw = (W.yaw || 0) * D2R;
    const root = new THREE.Group(); root.position.set(hx, y0, hz); root.rotation.y = yaw; scene.add(root); this.hutRoot = root;
    const wood = w.mat("t_woodplank", 3, 2, 0x8a6a48), plank = w.mat("t_floorboard", 3, 3, 0x6a5238), stone = w.mat("t_cobble", 2, 2, 0x6a6660), thatch = w.mat("t_slate", 4, 4, 0x4a4440);
    const add = (geo, m, x, y, z, ry = 0, collide = null) => { const mm = new THREE.Mesh(geo, m); mm.position.set(x, y, z); mm.rotation.y = ry; mm.castShadow = mm.receiveShadow = true; root.add(mm); if (collide) { const [sx, sy, sz] = collide, c = Math.cos(yaw), s = Math.sin(yaw), wx = hx + x * c + z * s, wz = hz - x * s + z * c, hw = Math.abs(sx * c) / 2 + Math.abs(sz * s) / 2, hd = Math.abs(sx * s) / 2 + Math.abs(sz * c) / 2; w.addBox(wx - hw, wx + hw, y0 + y - sy / 2, y0 + y + sy / 2, wz - hd, wz + hd); } return mm; };
    const S = W.size, H = W.wallH, T = 0.26;
    add(new THREE.BoxGeometry(S + 1.2, 0.25, S + 1.2), stone, 0, 0.0, 0);                      // a stone footing
    add(new THREE.BoxGeometry(S, 0.08, S), plank, 0, 0.16, 0);                                 // the floor
    add(new THREE.BoxGeometry(S, H, T), wood, 0, 0.2 + H / 2, -S / 2, 0, [S, H, T]);          // north wall
    add(new THREE.BoxGeometry(T, H, S), wood, -S / 2, 0.2 + H / 2, 0, 0, [T, H, S]);          // west wall
    add(new THREE.BoxGeometry(T, H, S), wood, S / 2, 0.2 + H / 2, 0, 0, [T, H, S]);           // east wall
    const dw = 1.3, side = (S - dw) / 2;                                                       // south wall: the doorway
    add(new THREE.BoxGeometry(side, H, T), wood, -dw / 2 - side / 2, 0.2 + H / 2, S / 2, 0, [side, H, T]);
    add(new THREE.BoxGeometry(side, H, T), wood, dw / 2 + side / 2, 0.2 + H / 2, S / 2, 0, [side, H, T]);
    add(new THREE.BoxGeometry(dw + 0.3, 0.5, T), wood, 0, 0.2 + H - 0.25, S / 2);
    { const roof = new THREE.Mesh(new THREE.ConeGeometry(S * 0.92, W.roofH, 4, 1, false), thatch); roof.position.set(0, 0.2 + H + W.roofH / 2 - 0.1, 0); roof.rotation.y = Math.PI / 4; roof.castShadow = true; root.add(roof); const eave = new THREE.Mesh(new THREE.BoxGeometry(S + 1.0, 0.18, S + 1.0), wood); eave.position.set(0, 0.2 + H - 0.05, 0); root.add(eave); for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, H, 0.3), w.mat("t_darkwood", 1, 3, 0x3a2e22)); post.position.set(sx * (S / 2 + 0.05), 0.2 + H / 2, sz * (S / 2 + 0.05)); root.add(post); } }
    add(new THREE.BoxGeometry(0.5, W.roofH * 0.8, 0.5), stone, S * 0.28, 0.2 + H + W.roofH * 0.55, -S * 0.28);   // a chimney
    { for (const s of [-1, 1]) { const win = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.08), new THREE.MeshStandardMaterial({ color: 0xffc46a, emissive: 0xffa040, emissiveIntensity: 0.6 })); win.position.set(s * S * 0.28, 1.6, S / 2 + 0.02); root.add(win); } }
    // inside: the table with the book, the bed, the cauldron, a shelf of vials
    const TB = W.table; let table = null;
    if (A.glb.k_table) { table = A.glb.k_table.model.clone(); table.position.set(TB[0], 0.2, TB[1]); table.rotation.y = Math.PI / 2; root.add(table); } else table = add(new THREE.BoxGeometry(1.6, 0.08, 0.9), plank, TB[0], 0.95, TB[1]);
    add(new THREE.BoxGeometry(1.5, 0.9, 0.8), wood, TB[0], 0.65, TB[1], 0, [1.5, 0.9, 0.8]).visible = false;   // the table's collider
    { const bk = new THREE.Group(); bk.position.set(TB[0] + 0.1, W.tableH + 0.03, TB[1] - 0.05); bk.rotation.y = -0.3; const cover = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.05, 0.34), new THREE.MeshStandardMaterial({ color: 0x4a2a1a, roughness: 0.8 })); const pages = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.04, 0.3), new THREE.MeshStandardMaterial({ color: 0xe8dcbf })); pages.position.y = 0.045; const clasp = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.1), new THREE.MeshStandardMaterial({ color: 0xd9ad2e, metalness: 0.7, roughness: 0.3 })); clasp.position.set(0.2, 0.03, 0); bk.add(cover, pages, clasp); root.add(bk); this.book = bk; }
    const BD = W.bed; if (A.glb.hutbed) { const bed = A.glb.hutbed.model.clone(); bed.position.set(BD[0], 0.2, BD[1]); bed.rotation.y = Math.PI / 2; root.add(bed); } else add(new THREE.BoxGeometry(2.0, 0.5, 1.0), plank, BD[0], 0.45, BD[1]);
    add(new THREE.BoxGeometry(2.0, 0.6, 1.0), wood, BD[0], 0.5, BD[1], 0, [2.0, 0.6, 1.0]).visible = false;
    const CD = W.cauldron; { const pot = add(new THREE.CylinderGeometry(0.5, 0.38, 0.7, 12), new THREE.MeshStandardMaterial({ color: 0x1b1b1d, roughness: 0.6, metalness: 0.4 }), CD[0], 0.55, CD[1], 0, [1.0, 0.9, 1.0]); const brew = new THREE.Mesh(new THREE.CircleGeometry(0.44, 16), new THREE.MeshStandardMaterial({ color: 0x3fd96a, emissive: 0x2fbf55, emissiveIntensity: 0.9 })); brew.rotation.x = -Math.PI / 2; brew.position.set(CD[0], 0.88, CD[1]); root.add(brew); this.brew = brew; const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.3, 6), stone); legs.position.set(CD[0], 0.15, CD[1]); root.add(legs); const light = new THREE.PointLight(0x5fff8a, 0.9, 7); light.position.set(CD[0], 1.3, CD[1]); root.add(light); }
    { const shelf = add(new THREE.BoxGeometry(2.0, 0.06, 0.32), plank, -S * 0.2, 1.75, -S / 2 + 0.3); for (let i = 0; i < 7; i++) { const v = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.2, 8), new THREE.MeshStandardMaterial({ color: [0xd94a3b, 0xe8d04a, 0x6fd44a, 0x4a7ee6, 0xd94ab8, 0x4ad4c8, 0xe8e8ff][i], transparent: true, opacity: 0.75, roughness: 0.2 })); v.position.set(-S * 0.2 - 0.85 + i * 0.28, 1.89, -S / 2 + 0.3); root.add(v); } shelf.castShadow = false; }
    // the witch herself: the Higgsfield scan on the game's own humanoid rig (idle breathing, a glance at you)
    const WA = A.glb.et_witch; let body = null;
    // the scan comes rigged by Higgsfield (a skinned mesh): it is cloned with its skeleton and posed here (arms down from the
    // A-pose, a slow breath, her head following you); a plain scan would get the game's own procedural rig instead
    if (WA) { let skinned = false; WA.model.traverse((o) => { if (o.isSkinnedMesh) skinned = true; }); if (skinned) { body = skeletonClone(WA.model); const bones = {}; body.traverse((o) => { if (o.isBone) bones[o.name] = o; }); const bind = {}; for (const k of Object.keys(bones)) bind[k] = bones[k].quaternion.clone(); body.userData.wbones = bones; body.userData.wbind = bind; } else body = riggedHumanoid(WA.model, {}) || WA.model.clone(); }
    else { body = new THREE.Group(); const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 1.1, 4, 8), new THREE.MeshStandardMaterial({ color: 0x2f4a2a })); m.position.y = 0.85; body.add(m); }
    const WP = W.witch; body.position.set(WP[0], 0.2, WP[1]); body.rotation.y = WP[2] * D2R; root.add(body); this.witch = body; this.witchYaw = WP[2] * D2R;
    { const c = Math.cos(yaw), s = Math.sin(yaw); this.witchWorld = { x: hx + WP[0] * c + WP[1] * s, z: hz - WP[0] * s + WP[1] * c }; this.bookWorld = { x: hx + (TB[0] + 0.1) * c + (TB[1] - 0.05) * s, z: hz - (TB[0] + 0.1) * s + (TB[1] - 0.05) * c }; this.bedWorld = { x: hx + BD[0] * c + BD[1] * s, z: hz - BD[0] * s + BD[1] * c }; this.hutY = y0; }
    w.addBox(this.witchWorld.x - 0.4, this.witchWorld.x + 0.4, y0, y0 + 1.8, this.witchWorld.z - 0.4, this.witchWorld.z + 0.4);
  }
  wantedToday() { const W = CFG.witchHut, day = this.g.dayNum, dow = ((day - 1) % 7 + 7) % 7; const id = W.wants[dow]; return id === "flower" ? (day % 2 === 0 ? "white_flower" : "yellow_flower") : id; }
  openWitch() {
    const g = this.g, S = STR.forest, want = this.wantedToday(), name = STR.items[want] ? STR.items[want].name : want, done = this.witchTradedDay === g.dayNum, has = g.player.inv.has(want);
    const lines = [...S.witchLines, done ? S.witchDone : S.witchWant.replace("%i", name).replace("%n", CFG.witchHut.vials)];
    const s = g.npcPanel(S.witchName, lines, done ? [] : [["witchGive", S.witchGive.replace("%i", name)]]);
    const b = s.querySelector("#witchGive"); if (!b) return;
    b.addEventListener("click", () => {
      if (!has && !g.player.inv.has(want)) { g.ui.toast(S.witchNoItem.replace("%i", name)); g.audio.sDeny(); return; }
      g.player.inv.remove(want, 1); if (!g.player.inv.add("vial", CFG.witchHut.vials)) { g.spawnDrop("vial", CFG.witchHut.vials, this.witchWorld.x, this.witchWorld.z, this.hutY + 0.3); }
      this.witchTradedDay = g.dayNum; g.ui.renderHotbar(g.player.inv); g.audio.sPickup(); g.ui.toast(S.witchThanks.replace("%n", CFG.witchHut.vials)); g.ui.closeScreen(); g.resume();
    });
  }
  openBook() {
    const g = this.g, S = STR.forest, P = STR.potions;
    const icon = (id, px) => { const u = iconUrl(id); return u ? `<img src="${u}" alt="" style="width:${px}px;height:${px}px;vertical-align:middle">` : `<span style="display:inline-block;width:${px}px;height:${px}px"></span>`; };
    const nm = (id) => STR.items[id] ? STR.items[id].name : id;
    const row = (pt) => `<div style="display:flex;gap:7px;align-items:flex-start;padding:4px 0;border-bottom:1px solid rgba(60,40,20,.18)">
        <div style="flex:0 0 40px;text-align:center;padding-top:2px">${icon(pt.id, 36)}</div>
        <div style="flex:1;min-width:0"><div style="font-weight:700;font-size:13px;color:#2a1a0c">${nm(pt.id)}</div>
          <div style="font-size:10.5px;color:#4a3826;line-height:1.25">${P[pt.id] ? P[pt.id].effect : ""}</div>
          <div style="font-size:10.5px;color:#2a1a0c;margin-top:2px;line-height:1.5">${icon("vial_water", 18)} ${nm("vial_water")} + ${pt.needs.map(([id, n]) => `${icon(id, 18)} ${n > 1 ? n + "\u00d7 " : ""}${nm(id)}`).join(" + ")}</div></div>
      </div>`;
    const half = Math.ceil(CFG.potions.length / 2), left = CFG.potions.slice(0, half).map(row).join(""), right = CFG.potions.slice(half).map(row).join("");
    const page = (inner, side) => `<div style="flex:1 1 0;min-width:0;background:linear-gradient(${side === "l" ? "90deg" : "270deg"},#e9d9b4,#f4e8c8 18%,#f6ecd0);padding:14px 16px 12px;color:#2a1a0c;${side === "l" ? "border-radius:8px 2px 2px 8px;box-shadow:inset -14px 0 18px -14px rgba(60,40,10,.45)" : "border-radius:2px 8px 8px 2px;box-shadow:inset 14px 0 18px -14px rgba(60,40,10,.45)"}">${inner}</div>`;
    g.menuOpen = true;
    const s = g.ui.screen(`<div style="width:min(96vw,1040px)">
      <h1 style="font-size:22px;margin:0 0 2px;color:#f0e6cc">${S.bookTitle}</h1>
      <div style="font-size:12px;opacity:.85;margin-bottom:6px;color:#f0e6cc">${S.bookIntro}</div>
      <div style="display:flex;gap:0;background:#3a2a16;padding:8px;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.6)">${page(left, "l")}<div style="flex:0 0 6px;background:linear-gradient(90deg,#2a1a0c,#5a4020,#2a1a0c)"></div>${page(right, "r")}</div>
      <button id="pnlClose" style="margin-top:8px">${STR.close}</button></div>`);
    s.querySelector("#pnlClose").addEventListener("click", () => { g.ui.closeScreen(); g.resume(); });
  }

  // ---------------- prompts ----------------
  interact(consider, p) {
    const g = this.g, S = STR.forest;
    if (Math.abs(p.pos.y - this.hutY) < 4) {
      const W = this.witchWorld; if (Math.hypot(p.pos.x - W.x, p.pos.z - W.z) < 4) consider(W.x, W.z, this.hutY, `${S.talkWitch} [${STR.interact}]`, () => this.openWitch());
      const B = this.bookWorld; if (Math.hypot(p.pos.x - B.x, p.pos.z - B.z) < 3.4) consider(B.x, B.z, this.hutY, `${S.readBook} [${STR.interact}]`, () => this.openBook());
      const D = this.bedWorld; if (Math.hypot(p.pos.x - D.x, p.pos.z - D.z) < 3.0) consider(D.x, D.z, this.hutY, `${STR.sleep} [${STR.interact}]`, () => g.trySleep());
    }
    for (const s of this.pickups) {
      if (s.n <= 0 || Math.abs(s.x - p.pos.x) > 3 || Math.abs(s.z - p.pos.z) > 3) continue;
      if (Math.hypot(s.x - p.pos.x, s.z - p.pos.z) > 3) continue;
      const name = STR.items[s.kind] ? STR.items[s.kind].name : s.kind;
      consider(s.x, s.z, s.y, `${STR.pickUp} ${name} [${STR.interact}]`, () => {
        if (!p.inv.add(s.kind, 1)) return g.ui.toast(STR.inventoryFull);
        s.n -= 1; this.setPickVisible(s, s.n > 0);   // update 70: a mushroom spot loses one mushroom at a time
        g.audio.sPickup(); g.ui.renderHotbar(p.inv);
      });
    }
  }

  // ---------------- each frame ----------------
  update(dt) {
    const g = this.g, p = g.player, w = this.world, F = CFG.forest, t = g.time;
    if (g.dayNum !== this.day) { this.day = g.dayNum; this.respawnPickups(); }
    // the Meganeura: while you run through the forest, now and then one bursts from a tree near you
    if (p.sprinting && !g.ride && w.inForest(p.pos.x, p.pos.z)) {
      this.megT -= dt;
      if (this.megT <= 0) { this.megT = F.meganeura.every; if (g.rng() < F.meganeura.chance && !g.creatures.some((c) => c.type === "meganeura" && !c.dead && !c.gone)) this.spawnMeganeura(); }
    }
    // poison: one point of health every three seconds, for three minutes, never below one
    if (g.poison) { g.poison.t -= dt; g.poison.tick -= dt; if (g.poison.tick <= 0) { g.poison.tick = CFG.poison.every; if (p.hp > 1) p.hp = Math.max(1, p.hp - 1); } if (g.poison.t <= 0) { g.poison = null; g.ui.toast(STR.forest.poisonOver); } }
    const hpEl = document.getElementById("hp"); if (hpEl) hpEl.classList.toggle("poison", !!g.poison);
    // a T-Rex crossing a trunk slows for two seconds
    for (const c of g.creatures) { if (c.type !== "trex" || c.dead) continue; if (Math.abs(c.pos.x - p.pos.x) > 90 || Math.abs(c.pos.z - p.pos.z) > 90) continue; if (this.trunkNear(c.pos.x, c.pos.z, 1.8)) c.slowT = F.trunks.slowFor; }
    // the bats of the night: two flocks circling crowns near you
    if (g.isNight && !w.desert.inDesert(p.pos.x, p.pos.z) && w.inForest(p.pos.x, p.pos.z)) {
      this.flockT -= dt;
      if (this.flockT <= 0 || !this.flockCentres.length || this.flockCentres.every((c) => Math.hypot(c.x - p.pos.x, c.z - p.pos.z) > 70)) { this.pickFlockTrees(); this.flockT = 25; }
      for (const b of this.flocks) { const c = this.flockCentres[b.flock]; if (!c) { b.mesh.visible = false; continue; } b.mesh.visible = true; const a = t * (0.9 + b.k * 0.07) + b.ph, r = c.r * (0.7 + 0.3 * Math.sin(t * 0.3 + b.ph)); b.mesh.position.set(c.x + Math.cos(a) * r, c.y + Math.sin(t * 1.7 + b.ph) * 0.8, c.z + Math.sin(a) * r); b.mesh.rotation.y = -a; const an = b.mesh.userData.anim, f = Math.sin(t * 2 * Math.PI * an.hz + b.ph) * an.amp; an.wl.rotation.z = f; an.wr.rotation.z = -f; }
    } else for (const b of this.flocks) b.mesh.visible = false;
    if (this.brew) this.brew.material.emissiveIntensity = 0.7 + 0.3 * Math.sin(t * 2.2);
    if (this.witch) { const d = Math.hypot(p.pos.x - this.witchWorld.x, p.pos.z - this.witchWorld.z); let headTurn = 0; if (d < 9) { const want = Math.atan2(p.pos.x - this.witchWorld.x, p.pos.z - this.witchWorld.z); headTurn = ((want - this.witchYaw - (this.hutRoot.rotation.y) + Math.PI * 3) % (Math.PI * 2)) - Math.PI; headTurn = Math.max(-1.1, Math.min(1.1, headTurn)); } this.witchHead = (this.witchHead || 0) + (headTurn - (this.witchHead || 0)) * Math.min(1, dt * 3); if (d < 60) { if (this.witch.userData.wbones) this.poseWitch(dt); else if (this.witch.userData.hrig) driveHumanoid(this.witch, "idle", 0, dt, headTurn, "calm", null); } }
  }
  // the witch's pose on her Higgsfield skeleton, in world axes (her forward F, up U, right R): the A-pose arms brought down to
  // hang six degrees out, a breath in the lower spine, the head turned toward you
  poseWitch(dt) {
    const b = this.witch, B = b.userData.wbones, Q0 = b.userData.wbind; if (!B || !Q0) return;
    for (const k of ["Spine", "Spine01", "Spine02", "Head", "neck", "LeftArm", "RightArm", "LeftForeArm", "RightForeArm"]) if (B[k] && Q0[k]) B[k].quaternion.copy(Q0[k]);
    b.updateMatrixWorld(true);
    const qb = b.getWorldQuaternion(new THREE.Quaternion()), F = new THREE.Vector3(0, 0, 1).applyQuaternion(qb), U = new THREE.Vector3(0, 1, 0), R = new THREE.Vector3().crossVectors(F, U).normalize();
    const pw = new THREE.Quaternion(), pinv = new THREE.Quaternion();
    const turn = (bone, qWorld) => { bone.parent.getWorldQuaternion(pw); pinv.copy(pw).invert(); bone.quaternion.copy(pinv.clone().multiply(qWorld).multiply(pw).multiply(bone.quaternion)); };
    const wa = new THREE.Vector3(), wb = new THREE.Vector3();
    for (const [side, sgn] of [["Right", 1], ["Left", -1]]) { const arm = B[side + "Arm"], fore = B[side + "ForeArm"]; if (!arm || !fore) continue; arm.getWorldPosition(wa); fore.getWorldPosition(wb); const v = wb.sub(wa).normalize(); const rest = Math.atan2(v.dot(R) * sgn, -v.dot(U)); turn(arm, new THREE.Quaternion().setFromAxisAngle(F, sgn * (rest - 6 * D2R))); b.updateMatrixWorld(true); turn(fore, new THREE.Quaternion().setFromAxisAngle(R, 14 * D2R)); b.updateMatrixWorld(true); }
    const t = this.g.time; const sp = B.Spine02 || B.Spine01 || B.Spine; if (sp) { turn(sp, new THREE.Quaternion().setFromAxisAngle(R, Math.sin(t * 1.1) * 0.012)); b.updateMatrixWorld(true); }
    const hd = B.Head || B.neck; if (hd) turn(hd, new THREE.Quaternion().setFromAxisAngle(U, this.witchHead || 0));
  }
  poisonPlayer() { const g = this.g; if (g.poisonImmuneT > 0) return; const fresh = !g.poison; g.poison = { t: CFG.poison.dur, tick: CFG.poison.every }; if (fresh) { g.ui.toast(STR.forest.poisoned); g.ui.hurtFlash && g.ui.hurtFlash(); } }

  // ---------------- the small creatures ----------------
  makeSmall(type, x, z) {
    const g = this.g, c = new Creature(type, null, x, z, g.ctx, {});
    c.small = true; c.cfg = { ...CFG[type] }; c.hp = c.maxHp = c.cfg.hp; c.corpseHold = 1.2;
    c.group.remove(c.body);
    if (type === "meganeura") { const b = new THREE.Group(), m = this.mats.spr_meganeura, W = 1.0, H = 0.72; const body = new THREE.Mesh(flatPlane(W * 0.16, H, 0.42, 0.58), m); const wl = new THREE.Mesh(flatPlane(W * 0.44, H, 0, 0.44, -W * 0.22), m), wr = new THREE.Mesh(flatPlane(W * 0.44, H, 0.56, 1, W * 0.22), m); b.add(body, wl, wr); b.userData.anim = { wl, wr, hz: 17, amp: 0.55 }; c.body = b; }
    else if (type === "bat") { c.body = this.batBody(0.6); }
    else { const b = new THREE.Group(); const m = new THREE.Mesh(flatPlane(0.42, 0.5), this.mats.spr_beetle); m.position.y = 0.04; b.add(m); b.userData.anim = null; c.body = b; }
    c.group.add(c.body); c.hover = 0;
    g.creatures.push(c); return c;
  }
  spawnMeganeura() {
    const g = this.g, p = g.player, w = this.world; let tree = null;
    for (let i = 0; i < 20 && !tree; i++) { const a = g.rng() * Math.PI * 2, d = 8 + g.rng() * 6, x = p.pos.x + Math.sin(a) * d, z = p.pos.z + Math.cos(a) * d; for (const t of w.treesNear(x, z)) if (!t.tag) { tree = t; break; } }
    const x = tree ? tree.x : p.pos.x + 9, z = tree ? tree.z : p.pos.z; const c = this.makeSmall("meganeura", x, z); c.hover = 6; c.hoverY = 1.6; c.life = 0;
    g.ui.toast(STR.forest.megaAppears); g.audio.sDeny && g.audio.noise && g.audio.noise(0.25, 1800, 0.15, "bandpass");
  }
  chopBats(tree) {
    const g = this.g; if (!g.isNight || g.rng() > CFG.forest.bats.chopChance) return;
    const n = 1 + (g.rng() < 0.5 ? 1 : 0); for (let i = 0; i < n; i++) { const c = this.makeSmall("bat", tree.x + (g.rng() - 0.5), tree.z + (g.rng() - 0.5)); c.hover = 7; c.hoverY = 1.7; c.hostile = true; c.biteT = 1.0 + i * 0.6; }
    g.ui.toast(STR.forest.batsOut);
  }
  beetleFromChest(chest) {
    const g = this.g; const c = this.makeSmall("beetle", chest.x + 0.3, chest.z + 0.3); c.hostile = true; c.biteT = 0.5; c.hover = 0;
    g.ui.toast(STR.forest.beetleOut); g.audio.sDeny();
  }
  // the weapons each small thing takes: the table says how many blows of each
  hitSmall(c, dmg, game, weapon) {
    const T = CFG.forest.hits[c.type]; if (!T) return false;
    const hits = T[weapon || "fists"] !== undefined ? T[weapon || "fists"] : T.default;
    game.audio.sHit(); c.hp -= c.maxHp / hits + 1e-4; c.hurtT = 0.25;
    if (c.type === "meganeura" && !c.hostile) this.provoke(c);
    if (c.hp <= 0) {
      if (c.type === "meganeura") c.cfg.drops = [["raw_meganeura", 1], ...(game.rng() < CFG.meganeura.poisonSacChance ? [["poison_sac", 1]] : [])];
      c.die(game); game.ui.toast(STR.forest["killed_" + c.type] || "");
    }
    return true;
  }
  provoke(c) { if (c.hostile || c.dead) return; c.hostile = true; c.state = "chase"; this.g.ui.toast(STR.forest.megaAngry); }
  installCreatureLogic() {
    const forest = this;
    Creature.prototype.updateMeganeura = function (dt, game) {
      const p = game.player, d = this.distToPlayer(), M = CFG.meganeura; this.life = (this.life || 0) + dt;
      const an = this.body.userData.anim; if (an) { const f = Math.sin(this.phase * 2 * Math.PI * an.hz) * an.amp; an.wl.rotation.z = f; an.wr.rotation.z = -f; this.body.rotation.x = -Math.min(0.5, this.speed * 0.12); }
      this.hover += ((this.hoverY || 1.6) - this.hover) * Math.min(1, dt * 2.2);
      if (!this.hostile) {
        if (d < M.touchR && this.life > 1.5) forest.provoke(this);
        if (this.life > M.stay) { this.hoverY = 12; if (this.hover > 10) { this.gone = true; this.group.visible = false; } this.moveToward(this.pos.x + Math.sin(this.yaw) * 5, this.pos.z + Math.cos(this.yaw) * 5, M.speed, dt, 1.5); return; }
        this.orbA = (this.orbA || 0) + dt * 0.45; const r = M.orbitR; this.moveToward(p.pos.x + Math.sin(this.orbA) * r, p.pos.z + Math.cos(this.orbA) * r, M.speed, dt, 2.6); this.hoverY = 1.5 + Math.sin(this.phase * 1.3) * 0.35;
        return;
      }
      this.biteT = (this.biteT || 0) - dt;
      if (d > 1.25) this.moveToward(p.pos.x, p.pos.z, M.chaseSpeed, dt, 4.5); else { this.speed = 0; this.yaw = Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z); }
      this.hoverY = 1.25 + Math.sin(this.phase * 2.4) * 0.2;
      if (d < M.reach && this.biteT <= 0) { this.biteT = M.biteEvery; const dmg = M.bite[0] + Math.floor(game.rng() * (M.bite[1] - M.bite[0] + 1)); p.damage(dmg, "meganeura", this.pos); if (game.rng() < M.poisonChance) forest.poisonPlayer(); }
      if (d > M.giveUpR) { this.hostile = false; this.life = M.stay + 1; }
    };
    Creature.prototype.updateBat = function (dt, game) {
      const p = game.player, d = this.distToPlayer(), B = CFG.bat; this.life = (this.life || 0) + dt;
      const an = this.body.userData.anim; if (an) { const f = Math.sin(this.phase * 2 * Math.PI * an.hz) * an.amp; an.wl.rotation.z = f; an.wr.rotation.z = -f; }
      this.hover += ((this.hoverY || 1.7) - this.hover) * Math.min(1, dt * 2.5);
      this.biteT = (this.biteT || 0) - dt;
      if (d > 1.1) this.moveToward(p.pos.x + Math.sin(this.phase * 3) * 0.6, p.pos.z + Math.cos(this.phase * 3) * 0.6, B.chaseSpeed, dt, 5); else this.speed = 0;
      this.hoverY = 1.6 + Math.sin(this.phase * 3.1) * 0.3;
      if (d < B.reach && this.biteT <= 0) { this.biteT = B.biteEvery; p.damage(B.bite, "bat", this.pos); }
      if (d > B.giveUpR || (!game.isNight && this.life > 20)) { this.gone = true; this.group.visible = false; }
    };
    Creature.prototype.updateBeetle = function (dt, game) {
      const p = game.player, d = this.distToPlayer(), B = CFG.beetle; this.life = (this.life || 0) + dt;
      this.biteT = (this.biteT || 0) - dt;
      if (d > 0.9) this.moveToward(p.pos.x, p.pos.z, B.speed, dt, 6); else { this.speed = 0; this.yaw = Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z); }
      this.body.position.x = Math.sin(this.phase * 14) * 0.02 * (this.speed > 0.1 ? 1 : 0);
      if (d < B.reach && this.biteT <= 0) { this.biteT = B.biteEvery; p.damage(B.bite, "beetle", this.pos); game.ui.toast(STR.forest.beetleBite); }
      if (d > B.giveUpR) { this.gone = true; this.group.visible = false; }
    };
  }
}
