// update 82 (prompt 40b): THE BONE MENTOR'S TUNNEL. A bone-arched bore in the mountain wall on the valley's east edge,
// over four hundred metres long, curving south under the rock. Its first stretch is pitch dark; past that, lanterns hang
// left and right and the ribs of something enormous vault the roof. Deep inside the Bone Mentor walks between his four
// chained prisoners - giants who were people once. He hunts by sight alone: seen, he stops, the lanterns turn green, and
// he comes after you - a bone spear from afar (his hands rattle first), skeleton hands out of the floor (the ground cracks
// first), a bone wall across your path when you run, and up close a grab and a slam. He never enters the dark near the
// mouth; lose him there or behind the arches and the lanterns go back to orange. Past him: the amber mine and the great
// chest, once a day. Giant garlic bread lies at the mouth (he likes it).
import * as THREE from "three";
import { CFG } from "./config.js?v=85";
import { STR } from "../strings.js?v=85";
import { pickWeighted } from "./rng.js?v=85";
import { ClipAnimator } from "./skeletal.js?v=85";
import { meshyRig, driveMeshy, restOnly } from "./meshyrig.js?v=85";   /* update 85: a living driver for rest-pose Meshy rigs */
import { clone as skeletonClone } from "three/addons/utils/SkeletonUtils.js";

const B = () => CFG.bone;
const clamp01 = (v) => Math.max(0, Math.min(1, v));

export class BoneTunnel {
  constructor(g) {
    const C = B();
    this.g = g; this.w = g.world; this.t = 0; this.day = g.dayNum;
    this.w.boneTunnel = this;
    this.group = new THREE.Group(); g.scene.add(this.group);
    this.lanterns = []; this.prisoners = []; this.amber = []; this.spears = []; this.hands = null; this.wall = null;
    this.alert = 0; this.chestDay = -1; this.breadDay = -1; this.mining = null; this.talkedF1 = false;
    this.buildPath();
    this.buildTube();
    this.buildLanterns();
    this.buildPrisoners();
    this.buildMentor();
    this.buildDeep();
    this.w.boneFloor = (x, z, y) => this.floorAt(x, z, y);
    if (!CFG.locations.some((l) => l.id === "bonetunnel")) CFG.locations.push({ id: "bonetunnel", x: C.path[0][0], z: C.path[0][1], r: 18 });
  }
  // ---------------- the path: a spline through the config points, sampled every 3 m ----------------
  buildPath() {
    const C = B(), P = C.path.map(([x, z, y]) => new THREE.Vector3(x, y, z));
    const curve = new THREE.CatmullRomCurve3(P, false, "catmullrom", 0.35);
    const L = curve.getLength(); this.length = L;
    const n = Math.ceil(L / 3); this.pts = []; this.tan = [];
    for (let i = 0; i <= n; i++) { const u = i / n; this.pts.push(curve.getPointAt(u)); this.tan.push(curve.getTangentAt(u).normalize()); }
    this.step = L / n;
  }
  // arc length and lateral offset of a point: the nearest sample, refined along its tangent
  where(x, z) {
    let bi = 0, bd = 1e9;
    for (let i = 0; i < this.pts.length; i++) { const p = this.pts[i], d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z); if (d < bd) { bd = d; bi = i; } }
    const p = this.pts[bi], t = this.tan[bi]; const dx = x - p.x, dz = z - p.z;
    const along = dx * t.x + dz * t.z, lat = -dx * t.z + dz * t.x;
    return { s: bi * this.step + along, lat, y: p.y + (this.tan[bi].y || 0) * along, i: bi };
  }
  inside(x, z, margin = 0) { const q = this.where(x, z); return q.s > -2 && q.s < this.length + 2 && Math.abs(q.lat) < B().halfW + margin; }
  floorAt(x, z, y) { const q = this.where(x, z); if (q.s < -1 || q.s > this.length + 1 || Math.abs(q.lat) > B().halfW + 0.6) return null; if (y < q.y - 4 || y > q.y + 9) return null; return q.y; }
  darkHere(x, z) { const q = this.where(x, z); return this.inside(x, z, 2) && q.s < B().darkLen; }
  // ---------------- the tube: a floor ribbon, rock walls, a roof of ribs, colliders ----------------
  buildTube() {
    const C = B(), w = this.w, hw = C.halfW, H = C.height, N = this.pts.length;
    const bone = w.mat("t_bonesand", 1, 1, 0xd8d2c4); bone.side = THREE.DoubleSide;
    const rock = w.mat("t_darkcliff", 1, 1, 0x3b3c3e); rock.side = THREE.DoubleSide; if (rock.normalScale) rock.normalScale.set(0.5, 0.5);
    const floorV = [], floorUV = [], floorI = [], wallV = [], wallUV = [], wallI = [];
    for (let i = 0; i < N; i++) {
      const p = this.pts[i], t = this.tan[i], nx = -t.z, nz = t.x, u = i * this.step;
      floorV.push(p.x + nx * (hw + 0.5), p.y, p.z + nz * (hw + 0.5), p.x - nx * (hw + 0.5), p.y, p.z - nz * (hw + 0.5)); floorUV.push(u / 6, 0, u / 6, hw / 3);
      for (const side of [1, -1]) {   // the wall: floor to roof, leaning out a little
        const ox = nx * (hw + 0.3) * side, oz = nz * (hw + 0.3) * side, ox2 = nx * (hw + 2.2) * side, oz2 = nz * (hw + 2.2) * side;
        wallV.push(p.x + ox, p.y - 0.3, p.z + oz, p.x + ox2, p.y + H, p.z + oz2); wallUV.push(u / 8, 0, u / 8, H / 8);
      }
      if (i) {
        const a = (i - 1) * 2, b = a + 1, c = i * 2, d = c + 1; floorI.push(a, c, b, b, c, d);
        for (let s = 0; s < 2; s++) { const a2 = (i - 1) * 4 + s * 2, b2 = a2 + 1, c2 = i * 4 + s * 2, d2 = c2 + 1; wallI.push(a2, c2, b2, b2, c2, d2); }
      }
      // colliders along both walls every sample
      for (const side of [1, -1]) { const x = p.x + nx * (hw + 0.9) * side, z = p.z + nz * (hw + 0.9) * side; w.addBox(x - 1.2, x + 1.2, p.y - 2, p.y + H + 4, z - 1.2, z + 1.2); }
    }
    const mk = (v, uv, idx, mat) => { const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); const m = new THREE.Mesh(g, mat); m.receiveShadow = true; this.group.add(m); return m; };
    mk(floorV, floorUV, floorI, bone); mk(wallV, wallUV, wallI, rock);
    // the roof: a dark lid, and the ribs of the great dead thing vaulting over the way, every few metres
    const roofV = [], roofUV = [], roofI = [];
    for (let i = 0; i < N; i++) { const p = this.pts[i], t = this.tan[i], nx = -t.z, nz = t.x, u = i * this.step; roofV.push(p.x + nx * (hw + 2.4), p.y + H, p.z + nz * (hw + 2.4), p.x - nx * (hw + 2.4), p.y + H, p.z - nz * (hw + 2.4)); roofUV.push(u / 8, 0, u / 8, 1); if (i) { const a = (i - 1) * 2, b = a + 1, c = i * 2, d = c + 1; roofI.push(a, b, c, b, d, c); } }
    mk(roofV, roofUV, roofI, rock);
    const rib = this.g.assets.glb.sv_ribcage_lo || this.g.assets.glb.sv_ribcage; this.ribs = [];   /* update 85: the 7k-tri copy, 26 of them */
    if (rib) {
      const bb = new THREE.Box3().setFromObject(rib.model), sz = bb.getSize(new THREE.Vector3()), mul = (hw * 2 + 3) / sz.x;
      for (let s = 9; s < this.length - 6; s += C.ribEvery) {
        const i = Math.min(N - 1, Math.round(s / this.step)), p = this.pts[i], t = this.tan[i];
        const m = rib.model.clone(); m.scale.multiplyScalar(mul); m.position.set(p.x, p.y - 0.6, p.z); m.rotation.y = Math.atan2(t.x, t.z); this.group.add(m); this.ribs.push({ m, s });   /* update 85: the spine runs ALONG the way, the ribs vault over it (the old +PI/2 stood them across it like a comb) */
      }
    }
    // the mouth: the bone arch (its own scan) and, until you are close, a black veil over the dark beyond it
    const arch = this.g.assets.glb.sv_bonearch, p0 = this.pts[0], t0 = this.tan[0];
    if (arch) { const m = arch.model.clone(); const bb = new THREE.Box3().setFromObject(m), sz = bb.getSize(new THREE.Vector3()); m.scale.multiplyScalar((hw * 2 + 6) / sz.x); const i8 = Math.min(N - 1, Math.round(8 / this.step)), p8 = this.pts[i8], t8 = this.tan[i8]; m.position.set(p8.x, p8.y - 0.2, p8.z); m.rotation.y = Math.atan2(t8.x, t8.z); this.group.add(m); }   /* update 85: 8 m in, seen through the skull's teeth */
    // update 85: the mouth is a skull carved in the wall's foot - the way runs in through its teeth. sv_skullmouth is the cliff
    // scan with the corridor cut out of it, drawn front-faces-only: from inside you see the tube, never the block's belly
    const sm = this.g.assets.glb.sv_skullmouth;
    if (sm) { const m = sm.model.clone(); m.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.side = THREE.FrontSide; } }); const bb = new THREE.Box3().setFromObject(m), sz = bb.getSize(new THREE.Vector3()); const i16 = Math.min(N - 1, Math.round(16 / this.step)), pc = this.pts[i16]; m.position.set(pc.x, 0, pc.z); m.rotation.y = Math.atan2(t0.x, t0.z) + Math.PI; this.group.add(m); this.mouthRock = m;
      const W = sz.x / 2, D = sz.z / 2; w.addBox(pc.x - D, pc.x + D, -2, 40, pc.z + 8.5, pc.z + W); w.addBox(pc.x - D, pc.x + D, -2, 40, pc.z - W, pc.z - 8.5); }   /* its cheeks are solid; the first stretch runs along +x */
    { const i = Math.min(N - 1, Math.round(16 / this.step)), p = this.pts[i], t = this.tan[i]; const veil = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2 + 6, H + 4), new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide, fog: false })); veil.position.set(p.x, p.y + H / 2, p.z); veil.rotation.y = Math.atan2(t.x, t.z); this.group.add(veil); this.veil = veil; }
  }
  buildLanterns() {
    const C = B(), lan = this.g.assets.glb.hf_minelantern || this.g.assets.glb.lantern, hw = C.halfW;
    for (let s = C.darkLen; s < this.length - 10; s += C.lanternEvery) {
      for (const side of [1, -1]) {
        const i = Math.min(this.pts.length - 1, Math.round(s / this.step)), p = this.pts[i], t = this.tan[i], nx = -t.z, nz = t.x;
        const x = p.x + nx * (hw - 0.6) * side, z = p.z + nz * (hw - 0.6) * side, y = p.y + 3.2;
        if (lan) { const m = lan.model.clone(); m.position.set(x, y - 0.5, z); m.scale.multiplyScalar(1.3); this.group.add(m); }
        const l = new THREE.PointLight(C.lanternColor, 4.2, 32, 1.6); l.position.set(x, y, z); this.group.add(l);
        this.lanterns.push({ light: l, s, x, z });
      }
      s += 0;
    }
  }
  // ---------------- the prisoners: four giants chained to the walls where the lanterns are ----------------
  buildPrisoners() {
    const C = B(), A = this.g.assets.glb, hw = C.halfW;
    C.prisoners.forEach((P, k) => {
      const i = Math.min(this.pts.length - 1, Math.round(P.s / this.step)), p = this.pts[i], t = this.tan[i], nx = -t.z, nz = t.x;
      const x = p.x + nx * (hw - 2.6) * P.side, z = p.z + nz * (hw - 2.6) * P.side, yaw = Math.atan2(-nx * P.side, -nz * P.side);
      const a = A[P.model]; let body = null, anim = null;
      if (a) { const rigged = a.anims && a.anims.length; body = rigged ? skeletonClone(a.model) : a.model.clone(); if (rigged && !restOnly(a.anims)) anim = new ClipAnimator(body, a.anims); else if (rigged) meshyRig(body, 1); body.position.set(x, p.y, z); body.rotation.y = yaw; this.group.add(body); }
      // the chains: collar and both wrists to the wall
      const chainMat = new THREE.MeshStandardMaterial({ color: 0x5a4a38, roughness: 0.9, metalness: 0.4 });
      for (const [hy, off] of [[P.h * 0.86, 0], [P.h * 0.5, 0.9], [P.h * 0.5, -0.9]]) { const wx = p.x + nx * (hw + 0.2) * P.side + t.x * off, wz = p.z + nz * (hw + 0.2) * P.side + t.z * off; const L = Math.hypot(wx - (x + t.x * off * 0.5), wz - (z + t.z * off * 0.5)); const c = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, L, 6), chainMat); c.position.set((x + wx) / 2 + t.x * off * 0.25, p.y + hy, (z + wz) / 2 + t.z * off * 0.25); c.rotation.z = Math.PI / 2; c.rotation.y = Math.atan2(nx, nz) + Math.PI / 2; this.group.add(c); }
      this.w.addTree(x, z, 1.4, "npc");
      this.prisoners.push({ k, x, z, y: p.y, yaw, body, anim, h: P.h, name: STR.bone.prisonerNames[k], lines: STR.bone.prisonerLines[k], mood: this.g.rng() < 0.5 ? "calm" : "angry", moodT: 120 + this.g.rng() * 120, atkT: 0, telT: 0, sobT: 3 + this.g.rng() * 6, chainR: C.chainR, s: P.s, side: P.side });
    });
  }
  // ---------------- the Bone Mentor ----------------
  buildMentor() {
    const C = B(), A = this.g.assets.glb, a = A.bonementor;
    const i = Math.min(this.pts.length - 1, Math.round(C.mentor.home / this.step)), p = this.pts[i];
    const rigged = !!(a && a.anims && a.anims.length);
    const body = a ? (rigged ? skeletonClone(a.model) : a.model.clone()) : new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.2, 6, 8), new THREE.MeshStandardMaterial({ color: 0xcfc8b8 }));
    body.position.set(p.x, p.y, p.z); this.group.add(body); if (rigged && restOnly(a.anims)) meshyRig(body, 1);
    this.mentor = { body, anim: rigged && !restOnly(a.anims) ? new ClipAnimator(body, a.anims) : null, pos: new THREE.Vector3(p.x, p.y, p.z), yaw: 0, state: "patrol", target: null, speed: 0, stateT: 0, seeT: 0, lostT: 0, cd: { spear: 4, hands: 7, wall: 6, slam: 2 }, tel: null, phase: 0, idx: 0 };
    this.w.addTree(p.x, p.z, 1.6, "npc"); this.mentorCollider = this.w.trees ? this.w.trees[this.w.trees.length - 1] : null;
  }
  // ---------------- the deep end: amber, the great chest, the bread at the mouth ----------------
  buildDeep() {
    const C = B(), A = this.g.assets.glb, hw = C.halfW;
    const amberMat = new THREE.MeshStandardMaterial({ color: 0xffb347, emissive: 0xff7a10, emissiveIntensity: 0.7, roughness: 0.3, metalness: 0.1, transparent: true, opacity: 0.92 });
    const bld = A.boulder;
    for (let k = 0; k < C.amberNodes; k++) {
      const s = C.amberFrom + k * ((C.amberTo - C.amberFrom) / (C.amberNodes - 1)), side = k % 2 ? 1 : -1;
      const i = Math.min(this.pts.length - 1, Math.round(s / this.step)), p = this.pts[i], t = this.tan[i], nx = -t.z, nz = t.x;
      const x = p.x + nx * (hw - 1.6) * side, z = p.z + nz * (hw - 1.6) * side;
      let m = null; if (bld) { m = bld.model.clone(); m.traverse((o) => { if (o.isMesh) o.material = amberMat; }); m.scale.multiplyScalar(0.7); m.position.set(x, p.y + 0.2, z); this.group.add(m); }
      const l = new THREE.PointLight(0xffa040, 1.2, 9, 2); l.position.set(x, p.y + 1.4, z); this.group.add(l);
      this.amber.push({ x, z, y: p.y, mesh: m, light: l, left: 1, day: -99 });
    }
    { const i = Math.min(this.pts.length - 1, Math.round(C.chestS / this.step)), p = this.pts[i], t = this.tan[i]; const ch = A.sv_chest; if (ch) { const m = ch.model.clone(); m.scale.multiplyScalar(2.4); m.position.set(p.x, p.y, p.z); m.rotation.y = Math.atan2(t.x, t.z) + Math.PI; this.group.add(m); } this.chest = { x: p.x, z: p.z, y: p.y }; this.w.addTree(p.x, p.z, 1.6, "chest"); }
    { const i = Math.min(this.pts.length - 1, Math.round(C.breadS / this.step)), p = this.pts[i], t = this.tan[i]; this.breadSpot = { x: p.x - t.z * 3, z: p.z + t.x * 3, y: p.y }; }
    this.spawnBread();
  }
  spawnBread() { if (this.breadDay === this.g.dayNum) return; this.breadDay = this.g.dayNum; const b = this.breadSpot; if (!this.g.drops.some((d) => d.id === "garlic_bread" && Math.hypot(d.pos ? d.pos.x - b.x : 0, d.pos ? d.pos.z - b.z : 0) < 6)) this.g.spawnDrop("garlic_bread", 1, b.x, b.z, b.y); }

  // ---------------- safety and the darkness: the first stretch is black, the rest lantern-lit ----------------
  envK(p, dayK = 0) { if (!this.inside(p.pos.x, p.pos.z, 1)) return null; const q = this.where(p.pos.x, p.pos.z); const dark = q.s < B().darkLen ? 1.0 : B().litK; const t = Math.max(0, Math.min(1, (q.s - 3) / 24)); return dayK + (dark - dayK) * t; }   /* update 85: the day's light reaches 3 m in and dies over the next 24 */
  isSafe() { return false; }

  // ---------------- interaction ----------------
  interact(consider, p) {
    const S = STR.bone, g = this.g, sel = p.inv.selected();
    for (const pr of this.prisoners) { if (Math.hypot(p.pos.x - pr.x, p.pos.z - pr.z) > 5) continue; if (pr.mood === "calm") consider(pr.x, pr.z, pr.y, `${S.talk.replace("%n", pr.name)} [${STR.interact}]`, () => this.talk(pr)); }
    const pick = sel && (sel.id === "pickaxe" || sel.id === "et_pickaxe" || sel.id === "fossil_pickaxe") ? sel.id : null;
    for (const a of this.amber) { if (a.left <= 0 || Math.hypot(p.pos.x - a.x, p.pos.z - a.z) > 3.4) continue; if (pick) consider(a.x, a.z, a.y, `${this.mining && this.mining.a === a ? S.mining.replace("%n", Math.round(100 * this.mining.t / this.mining.need)) : S.minePrompt} [${STR.interact}]`, () => { if (!(this.mining && this.mining.a === a)) this.mining = { a, pick, t: 0, need: pick === "fossil_pickaxe" ? B().mineTime / 2 : B().mineTime, swingT: 0 }; }); else consider(a.x, a.z, a.y, STR.skull.needPick, () => { g.ui.toast(STR.skull.needPick); g.audio.sDeny(); }); }
    if (this.chest && Math.hypot(p.pos.x - this.chest.x, p.pos.z - this.chest.z) < 4.2) consider(this.chest.x, this.chest.z, this.chest.y, this.chestDay === g.dayNum ? S.chestDone : `${S.openChest} [${STR.interact}]`, () => this.openChest());
  }
  talk(pr) {
    const g = this.g, S = STR.bone; const lines = [pr.lines[Math.floor(g.rng() * pr.lines.length)]];
    if (pr.k === 2) { lines.push(S.partnerLine); this.talkedF1 = true; g.bonePartnerKnown = true; }
    g.npcPanel(pr.name, lines, [["prAsk", S.askHow]]); const b = document.querySelector("#prAsk"); if (b) b.addEventListener("click", () => { g.npcPanel(pr.name, [S.howLines[pr.k]]); });
    g.audio.sGrowl();
  }
  openChest() {
    const g = this.g, p = g.player, S = STR.bone, C = B();
    if (this.chestDay === g.dayNum) { g.ui.toast(S.chestDone); g.audio.sDeny(); return; }
    this.chestDay = g.dayNum; g.audio.sChest();
    const got = [];
    for (let r = 0; r < 2; r++) { const [id] = pickWeighted(Math.random, C.loot); got.push([id, C.bundles[id] || 1]); }
    got.push(["garlic_bread", 3]);
    for (const [id, n] of got) { if (!p.inv.add(id, n)) g.spawnDrop(id, n, this.chest.x, this.chest.z, this.chest.y); }
    g.ui.renderHotbar(p.inv); g.ui.toast(S.chestGot.replace("%a", STR.items[got[0][0]].name).replace("%b", STR.items[got[1][0]].name));
  }
  // ---------------- every frame ----------------
  update(dt) {
    const g = this.g, p = g.player, C = B();
    this.t += dt;
    if (g.dayNum !== this.day) { this.day = g.dayNum; for (const a of this.amber) if (a.left <= 0 && g.dayNum > a.day) { a.left = 1; if (a.mesh) a.mesh.visible = true; a.light.intensity = 1.2; } this.spawnBread(); }
    const d0 = Math.hypot(p.pos.x - this.pts[0].x, p.pos.z - this.pts[0].z);
    this.group.visible = d0 < 520;
    if (!this.group.visible) return;
    if (this.veil) this.veil.visible = !this.inside(p.pos.x, p.pos.z, 3) && d0 > 24;
    if (this.ribs) { const qs = this.where(p.pos.x, p.pos.z).s; for (const rb of this.ribs) rb.m.visible = Math.abs(rb.s - qs) < 130; }   /* update 85: only the cages within 130 m along the way are drawn */
    // mining
    if (this.mining) { const M = this.mining, held = g.ui.held && g.ui.held.has("KeyF"), sel = p.inv.selected(); if (!held || g.menuOpen || !sel || sel.id !== M.pick || Math.hypot(p.pos.x - M.a.x, p.pos.z - M.a.z) > 3.8) this.mining = null; else { M.t += dt; M.swingT += dt; if (M.swingT > 0.6) { M.swingT = 0; g.audio.sHit(); } if (M.t >= M.need) { const a = M.a; this.mining = null; a.left = 0; a.day = g.dayNum; if (a.mesh) a.mesh.visible = false; a.light.intensity = 0; const n = 1 + (Math.random() < C.amberTwoChance ? 1 : 0); if (!p.inv.add("amber", n)) g.spawnDrop("amber", n, a.x, a.z, a.y); g.audio.sPickup(); g.ui.renderHotbar(p.inv); g.ui.toast(STR.bone.amberGot.replace("%n", n)); } } }
    this.updatePrisoners(dt);
    this.updateMentor(dt);
    this.updateSpears(dt);
    // lantern colour follows the alert
    const want = this.mentor && this.mentor.state !== "patrol" && this.mentor.state !== "return" ? 1 : 0; this.alert += (want - this.alert) * Math.min(1, dt * 3);
    const col = new THREE.Color(C.lanternColor).lerp(new THREE.Color(C.alertColor), this.alert); for (const l of this.lanterns) l.light.color.copy(col);
  }
  updatePrisoners(dt) {
    const g = this.g, p = g.player, S = STR.bone, C = B();
    for (const pr of this.prisoners) {
      pr.moodT -= dt; if (pr.moodT <= 0) { pr.moodT = 120 + g.rng() * 120; pr.mood = g.rng() < 0.5 ? "calm" : "angry"; }
      const d = Math.hypot(p.pos.x - pr.x, p.pos.z - pr.z);
      if (pr.anim) pr.anim.drive("idle", 0, 1, dt);
      pr.sob = (pr.sob || 0) * Math.exp(-dt * 1.4);
      if (pr.body && pr.body.userData.mrig && d < 120) { let ht = (d < 14 ? Math.atan2(p.pos.x - pr.x, p.pos.z - pr.z) : pr.yaw) - pr.body.rotation.y; while (ht > Math.PI) ht -= Math.PI * 2; while (ht < -Math.PI) ht += Math.PI * 2; driveMeshy(pr.body, dt, { state: "idle", h: pr.h, headTurn: d < 14 ? ht : null, mood: pr.mood === "angry" ? "angry" : "sad", sob: pr.sob, tel: pr.tel ? 1 - pr.tel / C.prisonerTelegraph : 0, rate: pr.tel ? 12 : 5 }); }   /* update 85: hanging heads, sobs, chain tugs, the wind-up */
      if (pr.body) { const want = d < 14 ? Math.atan2(p.pos.x - pr.x, p.pos.z - pr.z) : pr.yaw; let dy = want - pr.body.rotation.y; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2; pr.body.rotation.y += dy * Math.min(1, dt * 2); pr.body.position.y = pr.y + (pr.body.userData.mrig ? 0 : Math.sin(this.t * 1.3 + pr.k) * 0.02); pr.body.rotation.x = pr.body.userData.mrig ? 0 : pr.mood === "angry" ? Math.sin(this.t * 2.1 + pr.k) * 0.03 : 0.04 + Math.sin(this.t * 0.9 + pr.k) * 0.02; }
      // the crying: a sob every few seconds when you are near enough to hear it
      pr.sobT -= dt; if (pr.sobT <= 0 && d < 45) { pr.sobT = 4 + g.rng() * 6; pr.sob = 1; const v = Math.max(0.08, 0.5 * (1 - d / 45)); g.audio.blip(150 + g.rng() * 60, 0.5, "sine", v, -40); setTimeout(() => g.audio.noise(0.35, 500, v * 0.7), 420); }
      pr.atkT -= dt;
      if (pr.mood === "angry" && d < pr.chainR && pr.atkT <= 0) {
        if (pr.tel === undefined || pr.tel === null) { pr.tel = C.prisonerTelegraph; g.ui.toast(S.prisonerRaises.replace("%n", pr.name)); g.audio.sGrowl(); }
        else { pr.tel -= dt; if (pr.tel <= 0) { pr.tel = null; pr.atkT = C.prisonerCd; if (Math.hypot(p.pos.x - pr.x, p.pos.z - pr.z) < pr.chainR) { p.damage(C.prisonerDmg, "prisoner", { x: pr.x, z: pr.z }); g.ui.toast(S.prisonerHits.replace("%n", pr.name)); g.ui.shake(1.5); } } }
      } else pr.tel = null;
    }
  }
  updateMentor(dt) {
    const g = this.g, p = g.player, M = this.mentor, C = B(), MC = C.mentor; if (!M) return;
    const d = Math.hypot(p.pos.x - M.pos.x, p.pos.z - M.pos.z);
    for (const k in M.cd) M.cd[k] -= dt;
    const qp = this.where(p.pos.x, p.pos.z), pInside = this.inside(p.pos.x, p.pos.z, 1), pDark = pInside && qp.s < C.darkLen;
    // hidden: in the dark, or crouched between lanterns beyond 18 m
    const nearLantern = this.lanterns.some((l) => Math.hypot(l.x - p.pos.x, l.z - p.pos.z) < 9);
    const canSee = pInside && !pDark && d < MC.sightR && !(p.sneak && d > 18 && !nearLantern) && !p.dead;
    const moveTo = (x, z, speed) => { const dx = x - M.pos.x, dz = z - M.pos.z, dd = Math.hypot(dx, dz); if (dd < 0.3) { M.speed = 0; return true; } const want = Math.atan2(dx, dz); let dy = want - M.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2; M.yaw += Math.max(-3 * dt, Math.min(3 * dt, dy)); const st = Math.min(dd, speed * dt); let nx = M.pos.x + Math.sin(M.yaw) * st, nz = M.pos.z + Math.cos(M.yaw) * st; const q = this.where(nx, nz); if (q.s < C.darkLen + 4 || q.s > this.length - 2 || Math.abs(q.lat) > C.halfW - 2) { M.speed = 0; return false; } M.pos.set(nx, q.y, nz); M.speed = speed; return dd < 0.6; };
    const spots = C.prisoners.map((P) => { const i = Math.min(this.pts.length - 1, Math.round(P.s / this.step)), pt = this.pts[i]; return [pt.x, pt.z]; });
    if (M.state === "patrol" || M.state === "return") {
      if (!M.target) M.target = spots[M.idx % spots.length];
      if (moveTo(M.target[0], M.target[1], MC.walk)) { M.idx++; M.target = null; M.state = "patrol"; }
      M.lookT = (M.lookT || 0) - dt; if (M.lookT <= 0) { M.lookT = 3 + g.rng() * 3; M.lookDir = (g.rng() - 0.5) * 1.6; }
      if (canSee) { M.state = "alert"; M.stateT = 0; M.speed = 0; g.ui.toast(STR.bone.seen); g.audio.sGrowl(); g.loudAct && g.loudAct(); }
    } else if (M.state === "alert") {
      M.stateT += dt; M.speed = 0; const want = Math.atan2(p.pos.x - M.pos.x, p.pos.z - M.pos.z); let dy = want - M.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2; M.yaw += dy * Math.min(1, dt * 2.5);
      if (M.stateT > MC.alertT) { M.state = "chase"; M.lostT = 0; }
    } else if (M.state === "chase") {
      if (canSee) M.lostT = 0; else M.lostT += dt;
      if (M.lostT > MC.loseT) { M.state = "return"; M.target = null; M.tel = null; g.ui.toast(STR.bone.lost); }
      else {
        // the attacks: a telegraph first, always
        if (M.tel) {
          M.tel.t -= dt; M.speed = 0;
          if (M.tel.t <= 0) { this.fire(M.tel); M.tel = null; }
        } else if (d < 4.2 && M.cd.slam <= 0) { M.tel = { kind: "slam", t: MC.slamTel }; g.ui.toast(STR.bone.grab); }
        else if (d > 7 && d < 34 && M.cd.spear <= 0 && g.rng() < 0.55) { M.tel = { kind: "spear", t: MC.spearTel }; this.rattle(d); }
        else if (d > 4 && d < 26 && M.cd.hands <= 0) { M.tel = { kind: "hands", t: MC.handsTel, x: p.pos.x, z: p.pos.z }; this.cracks(p.pos.x, p.pos.z); g.ui.toast(STR.bone.cracks); }
        else if (d > 10 && M.cd.wall <= 0 && this.runningAway(p, M)) { this.raiseWall(p); M.cd.wall = MC.wallCd; }
        else moveTo(p.pos.x, p.pos.z, MC.chase);
      }
    }
    // the body follows
    const b = M.body; b.position.set(M.pos.x, M.pos.y, M.pos.z); b.rotation.y = M.yaw + (M.state === "patrol" ? (M.lookDir || 0) * 0.5 : 0) + (CFG.modelYaw.bonementor || 0);
    const rig = b.userData.mrig;
    M.phase += dt * (M.speed > 0.1 ? 3.2 : 0.6);
    b.position.y = M.pos.y + (rig ? 0 : (M.speed > 0.1 ? Math.abs(Math.sin(M.phase)) * 0.12 : Math.sin(M.phase) * 0.03));
    b.rotation.z = !rig && M.speed > 0.1 ? Math.sin(M.phase) * 0.035 : 0; b.rotation.x = !rig && M.state === "alert" ? 0.06 : 0;
    if (M.anim) M.anim.drive(M.speed > 0.1 ? "walk" : "idle", M.speed > 0.1 ? 1 : 0, 1, dt);
    if (rig && d < 160) { let ht = Math.atan2(p.pos.x - M.pos.x, p.pos.z - M.pos.z) - b.rotation.y; while (ht > Math.PI) ht -= Math.PI * 2; while (ht < -Math.PI) ht += Math.PI * 2; const tel = M.tel ? { kind: M.tel.kind, k: 1 - M.tel.t / (M.tel.kind === "slam" ? MC.slamTel : M.tel.kind === "spear" ? MC.spearTel : MC.handsTel) } : null; driveMeshy(b, dt, { state: M.speed > 0.1 ? "walk" : "idle", speed: M.speed, h: 6, headTurn: M.state === "patrol" || M.state === "return" ? null : ht, headPitch: M.state === "alert" ? 0.1 : 0, fx: tel, rate: M.tel ? 10 : 6 }); }   /* update 85: strides, a look, the wind-ups on his own bones */
    if (this.mentorCollider) { this.mentorCollider.x = M.pos.x; this.mentorCollider.z = M.pos.z; }
    // the hands that hold you
    if (this.hands) { const H = this.hands; H.t -= dt; H.grp.children.forEach((c, i) => { c.position.y = Math.min(1.6, c.position.y + dt * 4); }); if (H.t <= 0) { this.group.remove(H.grp); this.hands = null; } }
    if (this.wall) { const W = this.wall; W.t -= dt; const px = p.pos.x - W.x, pz = p.pos.z - W.z; const along = px * W.tx + pz * W.tz, lat = -px * W.tz + pz * W.tx; if (Math.abs(along) < 1.2 && Math.abs(lat) < C.halfW) { const push = (along < 0 ? -1 : 1) * (1.3 - Math.abs(along)); p.pos.x += W.tx * push; p.pos.z += W.tz * push; } if (W.t <= 0) { this.group.remove(W.mesh); this.wall = null; } }
  }
  runningAway(p, M) { const vx = p.vel.x, vz = p.vel.z, sp = Math.hypot(vx, vz); if (sp < 3) return false; const dx = p.pos.x - M.pos.x, dz = p.pos.z - M.pos.z, dd = Math.hypot(dx, dz) || 1; return (vx * dx + vz * dz) / (sp * dd) > 0.6; }
  rattle(d) { const g = this.g; for (let i = 0; i < 6; i++) setTimeout(() => g.audio.blip(900 + Math.random() * 600, 0.05, "square", Math.max(0.08, 0.3 * (1 - d / 40)), -60), i * 90); g.ui.toast(STR.bone.rattle); }
  cracks(x, z) { const ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 2.4, 18), new THREE.MeshBasicMaterial({ color: 0x1a1612, transparent: true, opacity: 0.85, side: THREE.DoubleSide })); const q = this.where(x, z); ring.rotation.x = -Math.PI / 2; ring.position.set(x, q.y + 0.06, z); this.group.add(ring); setTimeout(() => this.group.remove(ring), 2600); this.g.audio.noise(0.5, 300, 0.4); }
  fire(tel) {
    const g = this.g, p = g.player, M = this.mentor, C = B(), MC = C.mentor;
    if (tel.kind === "slam") { M.cd.slam = MC.slamCd; if (Math.hypot(p.pos.x - M.pos.x, p.pos.z - M.pos.z) < 5) { p.damage(MC.slamDmg, "mentor", { x: M.pos.x, z: M.pos.z }); p.vel.y = 3; g.ui.shake(2); g.ui.toast(STR.bone.slam); } }
    else if (tel.kind === "spear") { M.cd.spear = MC.spearCd; const sp = g.assets.glb.sv_bonespear; const mesh = sp ? sp.model.clone() : new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3, 6), new THREE.MeshStandardMaterial({ color: 0xe0d8c0 })); if (sp) { const bb = new THREE.Box3().setFromObject(mesh), sz = bb.getSize(new THREE.Vector3()); mesh.scale.multiplyScalar(3.2 / Math.max(sz.x, sz.y, sz.z)); } const from = new THREE.Vector3(M.pos.x, M.pos.y + 4.2, M.pos.z), to = new THREE.Vector3(p.pos.x, p.pos.y + 0.6, p.pos.z); const dir = to.clone().sub(from).normalize(); mesh.position.copy(from); mesh.lookAt(to); mesh.rotateX(Math.PI / 2); this.group.add(mesh); this.spears.push({ mesh, vel: dir.multiplyScalar(MC.spearSpeed), t: 0 }); g.audio.noise(0.12, 1600, 0.3, "highpass"); }
    else if (tel.kind === "hands") { M.cd.hands = MC.handsCd; if (Math.hypot(p.pos.x - tel.x, p.pos.z - tel.z) < 2.4) { p.stunT = MC.holdT; g.ui.toast(STR.bone.held); g.ui.shake(1); const grp = new THREE.Group(); const mat = new THREE.MeshStandardMaterial({ color: 0xd8d0bc, roughness: 0.9 }); for (let i = 0; i < 5; i++) { const f = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 1.2, 5), mat); const a = i / 5 * Math.PI * 2; f.position.set(p.pos.x + Math.cos(a) * 0.5, p.pos.y - 2.2, p.pos.z + Math.sin(a) * 0.5); f.rotation.z = (Math.random() - 0.5) * 0.4; grp.add(f); } this.group.add(grp); this.hands = { grp, t: MC.holdT + 0.6 }; } else g.ui.toast(STR.bone.dodged); }
  }
  raiseWall(p) {
    const q = this.where(p.pos.x - Math.sin(p.yaw) * 10, p.pos.z - Math.cos(p.yaw) * 10), i = Math.max(0, Math.min(this.pts.length - 1, q.i)), pt = this.pts[i], t = this.tan[i], C = B();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(C.halfW * 2, C.height * 0.75, 1.6), new THREE.MeshStandardMaterial({ color: 0xd4ccb6, roughness: 0.95 })); mesh.position.set(pt.x, pt.y + C.height * 0.75 / 2 - 0.2, pt.z); mesh.rotation.y = Math.atan2(t.x, t.z); this.group.add(mesh);
    this.wall = { mesh, x: pt.x, z: pt.z, tx: t.x, tz: t.z, t: C.mentor.wallT }; this.g.ui.toast(STR.bone.wall); this.g.audio.noise(0.6, 250, 0.5); this.g.ui.shake(0.8);
  }
  updateSpears(dt) {
    const g = this.g, p = g.player, MC = B().mentor;
    for (let i = this.spears.length - 1; i >= 0; i--) { const s = this.spears[i]; s.t += dt; s.mesh.position.addScaledVector(s.vel, dt); const P = s.mesh.position; if (Math.hypot(P.x - p.pos.x, P.z - p.pos.z) < 1.5 && Math.abs(P.y - p.pos.y - 0.6) < 1.6 && !p.dead) { p.damage(MC.spearDmg, "mentor", { x: P.x - s.vel.x, z: P.z - s.vel.z }); g.ui.toast(STR.bone.speared); this.group.remove(s.mesh); this.spears.splice(i, 1); continue; } const fl = this.floorAt(P.x, P.z, P.y); if (s.t > 2.5 || (fl !== null && P.y < fl + 0.1) || !this.inside(P.x, P.z, 2)) { this.group.remove(s.mesh); this.spears.splice(i, 1); } }
  }
  cull(cullEnt) { if (this.mentor) cullEnt(this.mentor.body); for (const pr of this.prisoners) if (pr.body) cullEnt(pr.body); }
  // the map: the mouth as a dark arch once found
  paintGlyphs(c, tx, ty, s, disc) {
    if (!disc.has("bonetunnel")) return; const p = this.pts[0];
    c.strokeStyle = "#f2ede0"; c.lineWidth = 2; c.beginPath(); c.arc(tx(p.x), ty(p.z), Math.max(3, 9 * s), Math.PI, 0); c.stroke(); c.fillStyle = "#1c1d1b"; c.beginPath(); c.arc(tx(p.x), ty(p.z), Math.max(2, 6 * s), Math.PI, 0); c.fill();
  }
}
