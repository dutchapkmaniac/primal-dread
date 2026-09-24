import * as THREE from "three";
import { CFG } from "./config.js";
import { STR } from "../strings.js";
import { Creature } from "./entities.js";
import { riggedHumanoid, driveHumanoid } from "./humanoid.js";
import { iconUrl } from "./items.js";
import { E, D2R, smooth, cityLocal, cityWorld, cityFlatten, cityLakeDip, lakeNorm, inLake, lakeR, lakeOutline } from "./eternius_frame.js";
import { buildCity } from "./eternius_build.js";
export { cityLocal, cityWorld, cityFlatten, cityLakeDip };

// ============================================================================
// update 39/40: ETERNIUS CITY — the golden city of the Eternials in the south-west
// corner of the desert. A mountain with a castle at its foot and a lake with a
// bridge in front of it; behind the castle's courtyard a gate leads into the
// mountain, to a cavern city under a shaft of daylight: the market, the altar,
// an inn, the throne hall, the keeper of tales, the vault, homes in the rock,
// and the river below.
//
// This file is the city's RULES: where the floor is, what stops you, who you
// can talk to, what the stalls trade, what the map shows. The geometry is in
// eternius_build.js, the local frame in eternius_frame.js.
// ============================================================================

export class EterniusCity {
  constructor(game) {
    this.g = game;
    this.coins = 0;
    this.prayedDay = -1;
    this.tasksDone = 0; this.task = null; this.keyGiven = false; this.vaultOpen = false;
    this.chapter = 0; this.keeperReady = true;
    this.npcs = []; this.stalls = []; this.lights = []; this.flags = []; this.lanterns = [];
    this.walls = []; this.t = 0;
    this.rex = null; this.chainLinks = null;
    this.discoveredToast = false;
  }

  // ---------------- geometry queries ----------------
  polar(x, z) {
    const { a, b } = cityLocal(x, z);
    return { a, b, r: Math.hypot(a, b), th: Math.atan2(b, a) / D2R };
  }
  // update 40: a ridge cluster — a broad shoulder, several peaks, crags — with a sheer foot nothing walks up
  // the foot of the mountain is not a circle: outcrops and bays up to ten metres in and out
  // update 41: behind the castle the foot is a straight face at a = castle.a0 - 3 — the rock used to bulge
  // 8 m into the courtyard, covering the mountain gate and pushing you back out of it
  edgeR(a, b) {
    const C = E(), th = Math.atan2(b, a);
    const R = C.mountainR + 5 * Math.sin(4 * th + 1) + 3 * Math.sin(9 * th + 2) + 2 * Math.sin(17 * th + 0.5);
    const K = C.castle, span = Math.atan2(K.hw + 6, K.a0), blend = 8 * D2R;
    const k = smooth((span + blend - Math.abs(th)) / blend);
    if (k <= 0) return R;
    const face = (K.a0 - 3) / Math.max(0.2, Math.cos(th));
    return R + (Math.min(R, face) - R) * k;
  }
  mountainH(x, z) {
    const C = E(), { a, b } = cityLocal(x, z), r = Math.hypot(a, b), R = this.edgeR(a, b);
    if (r >= R) return 0;
    if (r > R - C.cliffW) return C.cliffH * (R - r) / C.cliffW;
    const t = smooth((R - C.cliffW - r) / (R - C.cliffW - C.peakR));
    let h = C.cliffH + (C.peakH * 0.5 - C.cliffH) * t;
    const inner = smooth((R - C.cliffW - r) / 14);   // crags and peaks fade out at the foot so the cliff stays continuous
    for (const [pa, pb, ph] of C.peaks) {
      const pr = 46 + ph * 0.28, d = Math.hypot(a - pa, b - pb);
      if (d < pr) { const k = 1 - d / pr; h = Math.max(h, (C.cliffH + (ph - C.cliffH) * Math.pow(k, 1.5)) * inner + h * (1 - inner)); }
    }
    const crag = 3.2 * Math.sin(0.07 * a + 0.4) * Math.sin(0.06 * b + 1.3) + 1.7 * Math.sin(0.19 * a + 0.9) * Math.cos(0.17 * b) + 0.9 * Math.sin(0.41 * a) * Math.sin(0.37 * b + 0.6)
      + 2.2 * Math.abs(Math.sin(0.05 * (a - b) + 0.8));   // a ridge line
    return h + crag * inner;
  }
  // the four homes as (u out of the wall, v along it) around their own radial
  roomUV(rm, a, b) {
    const C = E(), cs = Math.cos(rm.th * D2R), sn = Math.sin(rm.th * D2R);
    return { u: a * cs + b * sn - C.wallR, v: -a * sn + b * cs };
  }
  inHome(a, b, m = 1) {
    const C = E(), RM = C.room;
    for (const rm of C.rooms) { const { u, v } = this.roomUV(rm, a, b); if (u > -m && u < RM.depth + m && Math.abs(v) < RM.hw + m) return rm; }
    return null;
  }
  // inside the mountain (cavern, tunnel, the carved halls, the homes)?
  inMountainRooms(a, b, r) {
    const C = E();
    if (r < C.wallR + 0.5) return true;
    if (a > C.tunnel.a0 - 1 && a < C.tunnel.a1 + 1 && Math.abs(b) < C.tunnel.hw + 0.5) return true;
    const T = C.throne; if (a > T.a0 - 1 && a < T.a1 + 1 && Math.abs(b) < T.hw + 1) return true;
    const V = C.vault; if (Math.abs(a) < V.hw + 1 && b < -V.b0 + 1 && b > -V.b1 - 1) return true;
    if (this.inHome(a, b, 1)) return true;
    return false;
  }
  inMountain(x, z, y = 0) {
    const P = this.polar(x, z);
    return this.inMountainRooms(P.a, P.b, P.r) && y < 24;
  }
  // the floor under (x, z), or null outside the city's built ground. `y` gates the
  // rooms under the mountain: someone on the rock above must not fall through.
  floorH(x, z, y = 0) {
    const C = E(), L = C.levels, P = this.polar(x, z), { a, b, r, th } = P;
    if (r < C.mountainR + 2 || (a > C.tunnel.a0 && a < C.tunnel.a1 + 1)) {
      if (this.inMountainRooms(a, b, r) && (y < 24 || y > 900)) return this.roomH(a, b, r, th);
    }
    const K = C.castle;
    if (a >= K.a0 - 0.5 && a <= K.a1 + 0.5 && Math.abs(b) < K.hw + 0.5) return L.court;
    const B = C.bridge;
    if (a > B.a0 && a < B.a1 && Math.abs(b) < B.hw + 0.5) {
      const u = (a - B.a0) / (B.a1 - B.a0);
      const end1 = this.g.world.desert.duneH(...cityWorld(B.a1 + 1, 0));
      return L.court + (end1 - L.court) * u + B.arch * Math.sin(u * Math.PI);
    }
    return null;
  }
  // update 43: distance across the river bridge's axis (the bridge sits at riverBridgeTh, not on the vault's line)
  bridgeT(a, b) { const th = E().riverBridgeTh * D2R; return Math.abs(-a * Math.sin(th) + b * Math.cos(th)); }
  grandStairY(th) {
    const G = this.grandStair, L = E().levels;
    if (!G) return L.terrace;
    const u = th - G.th0;
    if (u <= 0) return L.terrace;
    if (th >= G.th1) return L.lower;
    let i;
    if (u <= G.half * G.stepArc) i = Math.ceil(u / G.stepArc);
    else if (u <= G.half * G.stepArc + G.land) i = G.half;
    else i = G.half + Math.ceil((u - G.half * G.stepArc - G.land) / G.stepArc);
    return L.terrace - G.rs * Math.min(G.n, Math.max(0, i));
  }
  roomH(a, b, r, th) {
    const C = E(), L = C.levels, rise = C.stairRise, S = C.split;
    const T = C.throne; if (a > T.a0 - 1 && a < T.a1 + 1 && Math.abs(b) < T.hw + 1) {   // update 43: the dais is a floor, three steps up
      const da = a - T.a0, ab = Math.abs(b);
      if (da > 3.8 && da < 12 && ab < 6.6) return L.terrace + 1.2;
      if (da > 2.4 && da < 12 && ab < 7.8) return L.terrace + 0.8;
      if (da > 1.0 && da < 12 && ab < 9.0) return L.terrace + 0.4;
      return L.terrace;
    }
    const V = C.vault; if (Math.abs(a) < V.hw + 1 && b < -V.b0 + 1 && b > -V.b1 - 1) return L.lower;
    const home = this.inHome(a, b, 1); if (home) return L[home.level];
    if (a > C.tunnel.a0 - 1) return L.court;                                   // the tunnel and the gate
    if (r >= C.terraceR && Math.abs(th) < C.entryTh) return L.court;           // the entry terrace, wall to wall
    if (a > C.entryA) return L.court;
    if (a > C.entryRampA) {                                                     // the entry stair: real treads
      const n = Math.round((L.court - L.plaza) / rise), run = (C.entryA - C.entryRampA) / n;
      return L.plaza + rise * Math.min(n, Math.ceil((a - C.entryRampA) / run));
    }
    // the two staircases: up to the north-west terrace, down to the south-east gallery
    const SU = C.stairs.up, SD = C.stairs.down;
    if (Math.abs(a) < SU.hw + 0.3 && b > SU.r0 && b <= SU.r1 + 0.3) {
      const n = Math.round((L.terrace - L.plaza) / rise), run = (SU.r1 - SU.r0) / n;
      return L.plaza + ((L.terrace - L.plaza) / n) * Math.min(n, Math.ceil((b - SU.r0) / run));
    }
    if (Math.abs(a) < SD.hw + 0.3 && -b > SD.r0 && -b <= SD.r1 + 0.3) {
      const n = Math.round((L.plaza - L.lower) / rise), run = (SD.r1 - SD.r0) / n;
      return L.plaza - ((L.plaza - L.lower) / n) * Math.min(n, Math.ceil((-b - SD.r0) / run));
    }
    if (r >= C.terraceR) {
      if (th >= C.entryTh || th <= S.stairTh0) return L.terrace;
      if (th < S.stairTh1) return this.grandStairY(th);
      // the lower gallery, the river through it, the bridge over the river
      const RT = C.riverTh;
      if (this.bridgeT(a, b) <= C.riverBridgeHw + 0.3) {   // update 43: the arched bridge, at its own angle
        const rb0 = C.riverR0 - C.riverBridgeExt, rb1 = C.riverR1 + C.riverBridgeExt;
        if (r > rb0 && r < rb1) return L.lower + C.riverBridgeArch * Math.sin((r - rb0) / (rb1 - rb0) * Math.PI);
      }
      if (r > C.riverR0 && r < C.riverR1 && th > RT.th0 && th < RT.th1) return L.riverBed;
      return L.lower;
    }
    const nD = Math.round((L.dais - L.plaza) / rise), runD = 0.6, edge = C.altar.r + nD * runD;
    if (r < C.altar.r) return L.dais;
    if (r < edge) return L.plaza + rise * Math.min(nD, Math.ceil((edge - r) / runD));
    return L.plaza;
  }
  inside(x, z, y = 0) {
    const P = this.polar(x, z), C = E();
    if (this.inMountainRooms(P.a, P.b, P.r) && y < 24) return true;
    const K = C.castle;
    return P.a >= K.a0 && P.a <= K.a1 && Math.abs(P.b) < K.hw;
  }
  // a safe zone — except within the chained beast's reach
  // update 42: the whole of Eternius — mountain, castle, lake and bridge — is closed to the werewolves
  inZone(x, z) {
    const C = E(), P = this.polar(x, z);
    return P.r < C.mountainR + 30 || (P.a > C.mountainR - 10 && P.a < C.bridge.a1 + 25 && Math.abs(P.b) < C.lake.rSide + 20);
  }
  // update 44: inside the castle walls or the mountain — the bridge is as far as a desert beast comes
  inCastle(x, z) {
    const C = E(), K = C.castle, P = this.polar(x, z);
    return P.r < C.mountainR + 2 || (P.a > K.a0 - 6 && P.a < K.a1 + 2.5 && Math.abs(P.b) < K.hw + 3.5);
  }
  // update 42: a blow aimed at an Eternial. A citizen steps back. A guard strikes back once as a warning; the second blow
  // starts a fight — he and every guard near him come for you until you are gone, or he is down (a few coins on his belt)
  hitNpc(player, K, weapon, fx, fz) {
    const G = E().guard, S = STR.et, g = this.g;
    let best = null, bestD = 1e9;
    for (const n of this.npcs) {
      if (n.dead) continue;
      const dx = n.x - player.pos.x, dz = n.z - player.pos.z, d = Math.hypot(dx, dz);
      if (d > K.range + 1.4 || (dx * fx + dz * fz) / (d || 1) < K.arcCos) continue;
      if (d < bestD) { best = n; bestD = d; }
    }
    if (!best) return false;
    if (best.role !== "guard") { if (!this._npcHitT || g.time - this._npcHitT > 2) { this._npcHitT = g.time; g.ui.toast(S.noHitNpc); } g.audio.sDeny(); return true; }
    const n = best; n.hits = (n.hits || 0) + 1; g.audio.sHit();
    n.blockT = 0.45;   // update 44: he throws his arms up against the blow
    if (n.hostile && n.war) {
      n.hp -= K.dmg;
      if (n.hp <= 0) this.guardDown(n);
      return true;
    }
    if (n.hits === 1) { player.damage(G.warnDmg, "guard", new THREE.Vector3(n.x, n.y, n.z)); g.ui.toast(S.guardWarn); n.warnT = g.time; return true; }
    // the second blow: he and the guards around him draw steel
    for (const o of this.npcs) if (o.role === "guard" && !o.dead && Math.hypot(o.x - n.x, o.z - n.z) < 30) { o.hostile = true; o.war = true; o.beast = null; o.hp = o.hp || G.hp; o.atkT = 0.4; }
    n.hp = (n.hp || G.hp) - K.dmg;
    g.ui.toast(S.guardFight);
    if (n.hp <= 0) this.guardDown(n);
    return true;
  }
  guardDown(n) {
    const G = E().guard, g = this.g;
    n.dead = true; n.hostile = false; n.war = false; n.beast = null; n.strike = undefined; n.blockT = 0;
    n.body.rotation.x = -Math.PI / 2; n.body.position.y = n.y + 0.35;
    const coins = G.coins[0] + Math.floor(g.rng() * (G.coins[1] - G.coins[0] + 1));
    this.coins += coins; g.ui.coins(this.coins); g.ui.toast(STR.et.guardDown.replace("%n", coins));
    n.respawnT = G.respawn || 20;   // update 44: back on duty after 20 s (see update)
  }
  // update 44: the fallen guard rises at his post, whole again
  guardRespawn(n) {
    const G = E().guard, g = this.g;
    n.dead = false; n.hostile = false; n.war = false; n.beast = null; n.hits = 0; n.hp = G.hp; n.respawnT = undefined;
    n.x = n.homeX; n.z = n.homeZ; const fy = this.floorH(n.x, n.z, n.y); if (fy !== null) n.y = fy;
    n.body.rotation.x = 0; n.body.position.set(n.x, n.y, n.z); n.yaw0 = n.yawHome !== undefined ? n.yawHome : n.yaw0; n.yaw = n.yaw0; n.body.rotation.y = n.yaw;
    if (Math.hypot(g.player.pos.x - n.x, g.player.pos.z - n.z) < 45) g.ui.toast(STR.et.guardBack);
  }
  isSafe(x, z, y) {
    if (!this.inside(x, z, y)) return false;
    if (this.rex && Math.hypot(x - this.rex.chain.x, z - this.rex.chain.z) < this.rex.chain.r + 3) return false;
    return true;
  }
  // a place to fill the bottle: the cavern river's bank, the castle lake's shore
  waterSource(x, z, y) {
    const C = E(), L = C.levels, P = this.polar(x, z), { a, b, r, th } = P;
    const RT = C.riverTh;
    if (th > RT.th0 && th < RT.th1 && Math.abs(y - L.lower) < 2.5 && ((r > C.riverR0 - 3 && r < C.riverR0) || (r > C.riverR1 && r < C.riverR1 + 3))) {
      const rr = r < C.riverR0 ? C.riverR0 : C.riverR1, [wx, wz] = cityWorld(rr * Math.cos(th * D2R), rr * Math.sin(th * D2R));
      return { x: wx, z: wz, y: L.water, name: "cavern" };
    }
    const n = lakeNorm(a, b), onBridge = Math.abs(b) < C.bridge.hw + 0.4 && a > C.bridge.a0 - 1 && a < C.bridge.a1 + 1;   // (the lake bridge)
    if (!onBridge && n > 0.92 && n < 1.28 && y < 6) return { x, z, y: L.court - 2.05, name: "lake" };
    return null;
  }
  // ---------------- collision ----------------
  collide(x, z, r, y) {
    const C = E(), P = this.polar(x, z);
    let { a, b } = P;
    let moved = false;
    for (const w of this.walls) {
      if (w.off) continue;
      const ex = w.a1 - w.a0, ez = w.b1 - w.b0, L2 = ex * ex + ez * ez || 1e-6;
      let t = ((a - w.a0) * ex + (b - w.b0) * ez) / L2; t = Math.max(0, Math.min(1, t));
      const px = w.a0 + ex * t, pz = w.b0 + ez * t;
      const dx = a - px, dz = b - pz, d = Math.hypot(dx, dz), need = r + (w.t || 0.4);
      if (d < need) { const k = d > 1e-6 ? need / d : 1; a = px + (d > 1e-6 ? dx * k : need); b = pz + (d > 1e-6 ? dz * k : 0); moved = true; }
    }
    // update 40: the mountain is solid rock — below its surface and outside every room you are pushed out
    {
      const rc = Math.hypot(a, b);
      const Re = this.edgeR(a, b);
      if (rc < Re - 0.6 && !this.inMountainRooms(a, b, rc) && y < this.mountainH(x, z) - 1.2) {
        const k = (Re + 0.2) / (rc || 1e-6); a *= k; b *= k; moved = true;
      }
    }
    if (y < 24 || y > 900) {
      const rr = Math.hypot(a, b);
      // the cavern wall: stay inside, except through the doors and inside the halls carved beyond it
      const inVault = b < -(C.wallR - 6) && Math.abs(a) < C.vault.hw + 1;
      const inThrone = a < -(C.wallR - 6) && Math.abs(b) < C.throne.hw + 1;
      const inTunnel = a > C.tunnel.a0 - 4 && Math.abs(b) < C.tunnel.hw + r;
      const inHome = !!this.inHome(a, b, 1.2) || this.nearHomeDoor(a, b, r);
      if (rr > C.wallR - r && rr < C.wallR + 8 && !inVault && !inThrone && !inTunnel && !inHome) {
        const k = (C.wallR - r) / rr; a *= k; b *= k; moved = true;
      }
      // the terrace edges: a rail along r = terraceR, gaps at the two staircases and the entry
      const ra = Math.hypot(a, b), tha = Math.atan2(b, a) / D2R;
      const stairGap = (b > 0 && Math.abs(a) < C.stairs.up.hw + 0.6) || (b < 0 && Math.abs(a) < C.stairs.down.hw + 0.6);
      if (Math.abs(ra - C.terraceR) < r + 0.3 && Math.abs(tha) > C.entryTh && !stairGap) {
        const side = ra < C.terraceR ? C.terraceR - r - 0.3 : C.terraceR + r + 0.3;
        const k = side / ra; a *= k; b *= k; moved = true;
      }
      // the river: banks, not water — unless on the bridge
      const rb = Math.hypot(a, b), thb = Math.atan2(b, a) / D2R, RT = C.riverTh;
      if (thb > RT.th0 - 2 && thb < RT.th1 + 2 && rb > C.riverR0 - r && rb < C.riverR1 + r && this.bridgeT(a, b) > C.riverBridgeHw - 0.2) {
        const mid = (C.riverR0 + C.riverR1) / 2;
        const side = rb < mid ? C.riverR0 - r : C.riverR1 + r;
        const k = side / rb; a *= k; b *= k; moved = true;
      }
    }
    // update 41: the lake: no wading — pushed back to the shore, away from the water's heart; the bridge crosses it,
    // and only from its ends. Near the castle the push would land you on the sill, so there you go sideways instead.
    {
      const LK = C.lake, B = C.bridge, K = C.castle;
      const onBridge = Math.abs(b) < B.hw + 0.2 && a > B.a0 - 1 && a < B.a1 + 1;
      if (!onBridge) {
        const da = a - LK.a, dl = Math.hypot(da, b), phi = Math.atan2(b, da), Rl = lakeR(phi);
        if (dl < Rl + r) {
          const k = (Rl + r) / (dl || 1e-6);
          let na = LK.a + da * k, nb = b * k;
          if (na < K.a1 + 1.5 && Math.abs(nb) < K.hw + 2) {
            na = a; nb = b; const sg = Math.sign(b || 1);
            for (let i = 0; i < 60; i++) { nb += sg * 1.2; if (Math.hypot(na - LK.a, nb) >= lakeR(Math.atan2(nb, na - LK.a)) + r) break; }
          }
          a = na; b = nb; moved = true;
        }
      } else if (a > B.a0 - 1 && a < B.a1 - 2 && Math.abs(b) > B.hw - r) { b = Math.sign(b || 1) * (B.hw - r); moved = true; }
    }
    if (!moved) return { x, z };
    const [wx, wz] = cityWorld(a, b);
    return { x: wx, z: wz };
  }
  nearHomeDoor(a, b, r) {
    const C = E(), RM = C.room;
    for (const rm of C.rooms) { const { u, v } = this.roomUV(rm, a, b); if (u > -3 && u < 2 && Math.abs(v) < RM.doorHw + r) return true; }
    return false;
  }

  // ---------------- build ----------------
  build() {
    buildCity(this);
    this.buildStatue();
    this.buildRex();
    this.buildNpcs();
  }
  buildStatue() {
    const C = E(), A = this.g.assets, S = C.statue, [x, z] = cityWorld(S.a, S.b), y = C.levels.court;
    if (A.glb.et_statue) { const m = A.glb.et_statue.model.clone(); m.position.set(x, y, z); m.rotation.y = C.grpYaw; this.g.scene.add(m); }
    else { const m = new THREE.Mesh(new THREE.BoxGeometry(3, 9, 3), this.mats.gold); m.position.set(x, y + 4.5, z); this.g.scene.add(m); }
    this.g.world.addTree(x, z, 2.6);
    this.statueWorld = { x, z };
  }
  // the chained beast: a T-Rex in every rule, with its own green hide, heavy golden armour, held by a golden chain
  buildRex() {
    const C = E(), R = C.chainRex, A = this.g.assets, g = this.g;
    const [px, pz] = cityWorld(R.a, R.b), y = C.levels.court;
    // update 41: a green T-Rex of its own (Higgsfield: trexgreen) — real hide, not a tinted copy; the old tint stays as the fallback
    const src = A.glb.trexgreen || A.glb.trex;
    if (!src) return;
    const asset = { model: src.model.clone(), anims: src.anims };
    const green = A.glb.trexgreen ? null : A.tex.t_trexgreen;
    if (!A.glb.trexgreen) asset.model.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      o.material = o.material.clone();
      if (green) { const t = green.clone(); t.colorSpace = THREE.SRGBColorSpace; t.flipY = o.material.map ? o.material.map.flipY : false; t.needsUpdate = true; o.material.map = t; o.material.color = new THREE.Color(0xffffff); }
      else { o.material.color = new THREE.Color(0x4f8a2e); }
      o.material.emissive = new THREE.Color(0x061a06); o.material.emissiveIntensity = 0.5;
    });
    const [sx, sz] = cityWorld(R.a + 4, R.b);
    const rex = new Creature("trex", asset, sx, sz, g.ctx, { chained: { x: px, z: pz, r: R.reach }, zone: "chained" });
    rex.hp = rex.maxHp = Infinity; rex.chained = true; rex.chain = { x: px, z: pz, r: R.reach };
    g.creatures.push(rex);
    this.rex = rex;
    this.armourRex(rex);
    // the post and the chain: a golden ring on an ornate post, links that hang between post and collar
    const gold = this.mats.goldPlain, gem = this.mats.gem;
    const postAsset = A.glb.et_chainpost;
    if (postAsset) { const m = postAsset.model.clone(); m.position.set(px, y, pz); m.rotation.y = C.grpYaw; g.scene.add(m); }
    else {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.4, 0.5, 8), this.mats.sand(1, 1)); base.position.set(px, y + 0.25, pz); g.scene.add(base);
      const step = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.0, 0.4, 8), gold); step.position.set(px, y + 0.7, pz); g.scene.add(step);
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.55, 3.2, 8), this.mats.gold); shaft.position.set(px, y + 2.5, pz); g.scene.add(shaft);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.6, 0.9, 8), this.mats.goldBright); cap.position.set(px, y + 4.5, pz); g.scene.add(cap);
      for (let k = 0; k < 4; k++) { const gg = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), gem); gg.position.set(px + Math.sin(k * 1.57) * 0.5, y + 3.2, pz + Math.cos(k * 1.57) * 0.5); g.scene.add(gg); }
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.1, 8, 16), gold); ring.position.set(px, y + 3.6, pz); ring.rotation.x = Math.PI / 2; g.scene.add(ring);
    }
    g.world.addTree(px, pz, 0.8);
    this.postTop = new THREE.Vector3(px, y + 3.6, pz);
    // update 42: real chain links — elongated, alternating, laid along the curve (see update); as many as the chain is long
    const linkGeo = new THREE.TorusGeometry(0.2, 0.065, 6, 10); linkGeo.scale(1.45, 1, 1);
    this.chainPitch = 0.44; this.chainLinks = [];
    const nLinks = Math.round((R.reach + 6) / this.chainPitch);
    for (let i = 0; i < nLinks; i++) { const l = new THREE.Mesh(linkGeo, i % 5 === 0 ? this.mats.goldBright : this.mats.goldPlain); l.castShadow = true; g.scene.add(l); this.chainLinks.push(l); }
    this.rexSign = { x: px + (sx - px) * 0.2, z: pz + (sz - pz) * 0.2 };
  }
  // update 42: no armour — the beast wears the generated golden collar (Higgsfield: et_collar), FITTED to its neck: the neck is
  // measured on the mesh (the narrowest section between the chest and the skull), the collar sits there, tilted along the neck
  armourRex(rex) {
    const rig = rex.body && rex.body.userData && rex.body.userData.rig;
    const skinned = rex.body && rex.body.children && rex.body.children[0];
    const goldP = this.mats.goldPlain, A = this.g.assets;
    if (!rig || !skinned || !skinned.geometry || !skinned.geometry.boundingBox) {
      const H = rex.cfg.height || 5.4;
      const collar = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.14, 8, 20), goldP); collar.position.set(0, H * 0.62, H * 0.22); collar.rotation.x = Math.PI / 2 - 0.5; rex.group.add(collar);
      this.rexCollar = collar; return;
    }
    const geo = skinned.geometry, bb = geo.boundingBox, size = new THREE.Vector3(); bb.getSize(size);
    const spine = rig.head.parent, head = rig.head;
    const at = (bone, mesh, mx, my, mz) => {
      const bx = spine.position.x + (bone === spine ? 0 : bone.position.x), by = spine.position.y + (bone === spine ? 0 : bone.position.y), bz = spine.position.z + (bone === spine ? 0 : bone.position.z);
      mesh.position.set(mx - bx, my - by, mz - bz); bone.add(mesh); return mesh;
    };
    // the neck: slice the mesh along z between the chest and the skull, take the narrowest slice
    const pos = geo.attributes.position, z0 = bb.min.z, len = size.z, zA = z0 + len * 0.56, zB = z0 + len * 0.82, NS = 26;
    const sl = []; for (let i = 0; i < NS; i++) sl.push({ xmin: 1e9, xmax: -1e9, ymin: 1e9, ymax: -1e9, n: 0 });
    for (let i = 0; i < pos.count; i++) { const z = pos.getZ(i); if (z < zA || z > zB) continue; const k = Math.min(NS - 1, Math.floor((z - zA) / (zB - zA) * NS)), S = sl[k], x = pos.getX(i), y = pos.getY(i); S.n++; S.xmin = Math.min(S.xmin, x); S.xmax = Math.max(S.xmax, x); S.ymin = Math.min(S.ymin, y); S.ymax = Math.max(S.ymax, y); }
    let best = -1, bestW = 1e9;
    for (let k = 2; k < NS - 2; k++) { const S = sl[k]; if (S.n < 6) continue; const wdt = Math.max(S.xmax - S.xmin, (S.ymax - S.ymin) * 0.8); if (wdt < bestW) { bestW = wdt; best = k; } }
    const zc = (k) => zA + (k + 0.5) / NS * (zB - zA), yc = (k) => (sl[k].ymin + sl[k].ymax) / 2;
    const nk = best >= 0 ? best : Math.floor(NS / 2);
    const cz = zc(nk), cy = yc(nk), rad = Math.max(sl[nk].xmax - sl[nk].xmin, sl[nk].ymax - sl[nk].ymin) / 2;
    const kA = Math.max(0, nk - 3), kB = Math.min(NS - 1, nk + 3);
    const dir = new THREE.Vector3(0, yc(kB) - yc(kA), zc(kB) - zc(kA)).normalize();   // the neck's axis, chest to skull
    let collar;
    if (A.glb.et_collar) {
      const m = this.warmProp ? this.warmProp(A.glb.et_collar.model.clone()) : A.glb.et_collar.model.clone(); const mb = new THREE.Box3().setFromObject(m), ms = new THREE.Vector3(); mb.getSize(ms);
      const wrap = new THREE.Group(); m.position.y -= ms.y / 2; wrap.add(m);
      const sc = (rad * 2 * 1.12) / Math.max(ms.x, ms.z); wrap.scale.setScalar(sc);
      const AX = E().chainRex.collarAxis || [0, 1, 0];
      wrap.quaternion.setFromUnitVectors(new THREE.Vector3(AX[0], AX[1], AX[2]).normalize(), dir);
      wrap.rotateX(-(E().chainRex.collarTilt || 0));   // update 43: leans back along the neck
      if (E().chainRex.collarRoll) wrap.rotateY(E().chainRex.collarRoll);
      this.rexCollarDir = dir.clone(); this.rexCollarWrap = wrap;
      collar = wrap;
    } else { collar = new THREE.Mesh(new THREE.TorusGeometry(rad * 1.08, 0.16, 8, 24), goldP); collar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir); }
    at(head, collar, 0, cy, cz);
    // update 44: the cuff's axis is aimed along the neck in WORLD space — forward and up by collarPitch degrees off the
    // beast's facing — instead of the bind-space guess, which sat the cuff across the neck like a wheel
    if (this.rexCollarWrap === collar) {
      rex.group.rotation.y = rex.yaw; rex.group.updateMatrixWorld(true);   // the group's facing must be the beast's before the world frame is read
      const pitch = (E().chainRex.collarPitch !== undefined ? E().chainRex.collarPitch : 40) * Math.PI / 180;
      const f = new THREE.Vector3(Math.sin(rex.yaw), 0, Math.cos(rex.yaw)), axisW = f.multiplyScalar(Math.cos(pitch)).add(new THREE.Vector3(0, Math.sin(pitch), 0)).normalize();
      const qp = new THREE.Quaternion(); collar.parent.getWorldQuaternion(qp); qp.invert();
      collar.quaternion.copy(qp).multiply(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axisW));
      if (E().chainRex.collarTilt) collar.rotateX(-E().chainRex.collarTilt);
    }
    this.rexCollar = collar;
    // the ring the chain holds: on the collar's underside, toward the chest
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.06, 6, 12), goldP); ring.position.set(0, -(rad * 1.12 + 0.2), -0.1); ring.rotation.y = Math.PI / 2;
    const ringHold = new THREE.Group(); ringHold.quaternion.copy(collar.quaternion); ringHold.add(ring); at(head, ringHold, 0, cy, cz); this.rexRing = ring;
  }
  buildNpcs() {
    const C = E(), L = C.levels, A = this.g.assets, scene = this.g.scene;
    const K = C.castle, S = STR.et;
    const mk = (kind, a, b, y, faceA, faceB, role, opts = {}) => {
      const id = { male: "et_male", female: "et_female", spear: "et_guardspear", sword: "et_guardsword", king: "et_king" }[kind];
      const asset = A.glb[id];
      const [x, z] = cityWorld(a, b);
      let body;
      if (asset) body = riggedHumanoid(asset.model, { armIn: kind === "male" || kind === "female" ? 0.22 : 0 }) || asset.model.clone();   // update 42
      else { body = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 2.0, 4, 8), new THREE.MeshStandardMaterial({ color: 0x6c9c3a })); body.position.y = 1.5; const g2 = new THREE.Group(); g2.add(body); body = g2; }
      const [fx, fz] = cityWorld(faceA, faceB);
      const yaw = Math.atan2(fx - x, fz - z);
      body.position.set(x, y, z); body.rotation.y = yaw; scene.add(body);
      const npc = { kind, role, body, x, z, y, yaw0: yaw, yawHome: yaw, yaw, name: opts.name || (kind === "female" ? "Eternial woman" : kind === "male" ? "Eternial man" : "Eternial guard"), lines: opts.lines, walk: opts.walk || null, t: Math.random() * 10, h: CFG.modelScale[id] || 3, speed: 0, ...opts };
      this.npcs.push(npc);
      npc.homeX = x; npc.homeZ = z;
      if (!npc.walk) this.g.world.addTree(x, z, 0.55, "npc");   // update 42: tagged — a knife on an Eternial is not a knife on a tree
      return npc;
    };
    this.mkNpc = mk;
    // courtyard: two spear guards at the gate, two sword guards at the mountain gate, a few citizens
    // update 42: the gate guards stand in front of the towers, not inside them
    mk("spear", K.a1 - 9, 4.4, L.court, K.a1 + 40, 4.4, "guard", { lines: S.guardLines });   // update 43: on the gold way, looking out through the gate
    mk("spear", K.a1 - 9, -4.4, L.court, K.a1 + 40, -4.4, "guard", { lines: S.guardLines });
    mk("sword", K.a0 + 9, 4.4, L.court, K.a1, 4.4, "guard", { lines: S.guardLines });
    mk("sword", K.a0 + 9, -4.4, L.court, K.a1, -4.4, "guard", { lines: S.guardLines });
    mk("female", 234, 24, L.court, C.statue.a, C.statue.b, "citizen", { lines: S.femaleLines });
    mk("male", 241, -22, L.court, C.statue.a, C.statue.b, "citizen", { lines: S.maleLines });
    mk("male", 214, 46, L.court, 214, 30, "citizen", { lines: S.maleLines });
    // the cavern: stall keepers, the innkeeper, the keeper of tales, the king and his court, guards, walkers
    for (const st of this.stalls) {
      const { a, b } = cityLocal(st.keeperX, st.keeperZ);
      const npc = mk(st.kind || "male", a, b, L.plaza, 0, 0, "stall", { name: st.name, stall: st, lines: st.lines ? STR.et[st.lines] : S.maleLines, style: "busy" });
      st.npc = npc;
    }
    mk("spear", C.entryRampA - 4, 12, L.plaza, C.entryA + 40, 12, "guard", { lines: S.guardLines });
    mk("spear", C.entryRampA - 4, -12, L.plaza, C.entryA + 40, -12, "guard", { lines: S.guardLines });
    mk("sword", C.throne.a1 + 3, 6, L.terrace, C.throne.a1 + 40, 6, "guard", { lines: S.guardLines });
    mk("sword", C.throne.a1 + 3, -6, L.terrace, C.throne.a1 + 40, -6, "guard", { lines: S.guardLines });
    mk("king", this.throneLocal.a - 0.6, 0, L.terrace + 1.2, this.throneLocal.a + 30, 0, "king", { name: S.kingName, lines: S.kingLines });
    for (const s of [-1, 1]) mk("spear", C.throne.a0 + 13.6, s * 5.6, L.terrace, C.throne.a1, s * 5.6, "guard", { lines: S.guardLines });   // update 42: on the floor, in front of the fire columns
    mk("spear", 3.4, -C.vault.b0 + 3.2, L.lower, 3.4, -C.vault.b0 + 40, "guard", { lines: S.guardLines });   // update 42: the vault has a guard
    mk("male", C.advisor.a, C.advisor.b, L.terrace, C.advisor.a + 10, -4, "advisor", { name: S.advisorName, lines: S.advisorLines });
    mk("female", this.innLocal.a, this.innLocal.b, L.terrace + 0.3, 0, 0, "inn", { name: S.innName, lines: S.innLines });
    const KP = C.keeper; mk("male", KP.r * Math.cos(KP.th * D2R), KP.r * Math.sin(KP.th * D2R), L.lower, 0, 0, "keeper", { name: S.keeperName, lines: S.keeperLines });
    // someone at home in each of the carved rooms
    for (const rm of this.rooms || []) mk(rm.kind, rm.npc.a, rm.npc.b, rm.y, rm.npc.faceA, rm.npc.faceB, "citizen", { lines: S.homeLines, name: rm.kind === "female" ? S.homeFemale : S.homeMale });
    // citizens who stroll the plaza between the stalls — never across the altar, never through a stall
    const stallAngles = C.stalls.map((s) => s.th);
    const way = (n) => {
      const out = []; let lastTh = -150 + Math.random() * 300;
      for (let i = 0; i < n; i++) {
        let th = lastTh, r = 30;
        for (let k = 0; k < 40; k++) {
          th = lastTh + (Math.random() - 0.5) * 150; if (th > 180) th -= 360; if (th < -180) th += 360;
          r = 22 + Math.random() * 40;
          if (stallAngles.every((sa) => Math.abs(((sa - th + 540) % 360) - 180) > 22 || r < 32)) break;
        }
        lastTh = th; out.push([r * Math.cos(th * D2R), r * Math.sin(th * D2R)]);
      }
      return out;
    };
    for (let i = 0; i < 5; i++) {
      const pts = way(5); const [a, b] = pts[0];
      mk(i % 2 ? "female" : "male", a, b, L.plaza, pts[1][0], pts[1][1], "citizen", { lines: i % 2 ? S.femaleLines : S.maleLines, walk: { pts, i: 1, wait: 0, speed: 0.85 } });
    }
    // two citizens on the terraces, looking down
    mk("female", -20, C.terraceR + 8, L.terrace, 0, 0, "citizen", { lines: S.femaleLines });
    mk("male", -70, -(C.terraceR + 8), L.lower, 0, 0, "citizen", { lines: S.maleLines });
  }

  // ---------------- per frame ----------------
  update(dt) {
    const g = this.g, p = g.player, C = E();
    this.t += dt;
    const near = Math.hypot(p.pos.x - C.cx, p.pos.z - C.cz) < C.mountainR + 420;
    if (!near) return;
    const night = g.isNight ? 1 : 0;
    // inside the mountain the day's fog would swallow the far wall: push it back while you are in
    const P = this.polar(p.pos.x, p.pos.z);
    const inRooms = this.inMountainRooms(P.a, P.b, P.r) && p.pos.y < 24;
    if (g.scene.fog && inRooms) { g.scene.fog.near = Math.max(g.scene.fog.near, 150); g.scene.fog.far = Math.max(g.scene.fog.far, 460); }
    for (const L of this.lights) {
      if (!L.night) continue;
      let k = night;
      if (L.green && night) { const e = L.l.matrixWorld.elements, dl = Math.hypot(e[12] - p.pos.x, e[14] - p.pos.z); const nr = Math.max(0, Math.min(1, 1 - (dl - 3) / 11)); k = 1 + 1.8 * nr * nr; if (L.halo) L.halo.material.opacity = 0.12 + 0.3 * nr; }   // update 44: it flares as you pass
      else if (L.halo) L.halo.material.opacity = night ? 0.12 : 0;
      L.l.intensity = L.on * k;
    }
    for (const f of this.flags) { f.material.emissiveIntensity = night * 0.6; f.rotation.z = Math.sin(this.t * 1.7 + f.position.x) * 0.06; }
    for (const f of this.banners || []) f.material.emissiveIntensity = night * 0.6;
    if (this.altarGem) { this.altarGem.rotation.y += dt * 0.5; if (this.altarHalo) this.altarHalo.material.opacity = 0.11 + 0.06 * Math.sin(this.t * 2.1); }   // update 43: the crystal turns in its socket
    if (this.altarGlow) { const k = 1.15 + 0.85 * (0.5 + 0.5 * Math.sin(this.t * 2.2)); for (const m of this.altarGlow) m.emissiveIntensity = k; for (const l of this.altarGlowLights || []) l.intensity = 2.2 + 1.6 * (k - 1.15); }   // update 44: the carvings breathe emerald light
    for (const m of this.tunnelWater || []) if (m.material.map) m.material.map.offset.y = this.t * 0.22;   // update 44: the tunnel water runs out toward the river
    for (const sw of this.swing || []) { sw.g.rotation.z = Math.sin(this.t * 0.75 + sw.ph) * 0.05; sw.g.rotation.x = Math.sin(this.t * 0.55 + sw.ph * 1.7) * 0.035; }   // update 44: the hanging lanterns sway
    if (this.flames) this.flames.forEach((f, i) => { const k = 1 + 0.12 * Math.sin(this.t * 9 + i * 1.7); f.scale.set(k, 1 / k + 0.15 * Math.sin(this.t * 6 + i), 1); });
    // the shaft of light: warm and strong by day, a dim moon-white by night
    if (this.beam) {
      const k = g.world.nightK || 0;
      const col = new THREE.Color(0xffe9b0).lerp(new THREE.Color(0xd6e2ff), k);
      const op = (0.07 + 0.03 * Math.sin(this.t * 0.7)) * (1 - k * 0.72);
      this.beam.material.color.copy(col); this.beam.material.opacity = op;
      if (this.rays) this.rays.forEach((r2, i) => { r2.material.color.copy(col); r2.material.opacity = op * 0.5 * (0.7 + 0.3 * Math.sin(this.t * 0.4 + i)); r2.rotation.y += dt * 0.02; });
      if (this.pool) { this.pool.material.color.copy(col); this.pool.material.opacity = 0.16 * (1 - k * 0.72); }
    }
    if (this.lakeMesh && this.lakeMesh.material.map) this.lakeMesh.material.map.offset.set(this.t * 0.01, this.t * 0.007);
    if (this.riverMesh && this.riverMesh.material.map) this.riverMesh.material.map.offset.set(-this.t * 0.07, 0);   // update 43: along the river, counter-clockwise
    // the mountain gate's doors swing open as you come near, and close behind you
    if (this.gate) {
      const [gx, gz] = cityWorld(this.gateLocal.a, this.gateLocal.b);
      const want = Math.hypot(p.pos.x - gx, p.pos.z - gz) < C.gate.openR ? 1 : 0;
      this.gate.open += (want - this.gate.open) * Math.min(1, dt * 1.6);
      for (const { hinge, s } of this.gate.leaves) hinge.rotation.y = s * this.gate.open * 1.32;   // update 42: 76 degrees — the leaves stayed out of the tunnel walls
      this.gate.seg.off = this.gate.open > 0.55;
    }
    if (this.throneGate) {   // update 42: the throne hall's green gates swing inward as you come up the carpet
      const TG = this.throneGate, [gx, gz] = cityWorld(TG.local.a, TG.local.b);
      const want = Math.hypot(p.pos.x - gx, p.pos.z - gz) < 11 ? 1 : 0;
      TG.open += (want - TG.open) * Math.min(1, dt * 1.5);
      for (const { hinge, s } of TG.leaves) hinge.rotation.y = -s * TG.open * 1.45;
      TG.seg.off = TG.open > 0.5;
    }
    for (const w of g.wolves || []) {   // update 42: a werewolf inside Eternius is put back outside its walls
      if (w.dead || w.caveWolf || w.raid || !w.pos) continue;
      if (this.inZone(w.pos.x, w.pos.z)) { const dx = w.pos.x - C.cx, dz = w.pos.z - C.cz, dd = Math.hypot(dx, dz) || 1, Rz = C.bridge.a1 + 70; w.pos.x = C.cx + dx / dd * Rz; w.pos.z = C.cz + dz / dd * Rz; if (w.group) { w.group.position.x = w.pos.x; w.group.position.z = w.pos.z; } w.target = null; }
    }
    // the chain hangs between the post and the beast's collar
    if (this.rex && this.chainLinks) {
      const from = this.postTop, to = new THREE.Vector3();
      if (this.rexRing) this.rexRing.getWorldPosition(to); else if (this.rexCollar) this.rexCollar.getWorldPosition(to);
      else to.set(this.rex.group.position.x, this.rex.group.position.y + 3.3, this.rex.group.position.z);
      // update 43: the links follow the catenary but never go under the ground — the slack coils on the flagstones at the
      // post; the whole chain sways a little, more when the beast moves; each link faces along the curve, every other turned
      const n = this.chainLinks.length, d = from.distanceTo(to), total = n * this.chainPitch, ground = C.levels.court;
      // update 44: a modest hang, never to the ground; the slack is wound INSIDE the post (a winch) — the links that
      // are not on the curve are simply not shown, nothing lies on the flagstones
      const sagNat = 0.55 + Math.max(0, total - d) * 0.07, sagMax = Math.max(0.2, Math.min(from.y, to.y) - ground - 0.35);
      const sag = Math.min(sagNat, sagMax);
      const used = Math.sqrt(d * d + (2.1 * sag) * (2.1 * sag)) + 0.2;
      const nCurve = Math.max(4, Math.min(n, Math.round(used / this.chainPitch))), sway = 0.18 + 0.22 * Math.min(1, (this.rex.speed || 0) / 2);
      const hx = -(to.z - from.z), hz = to.x - from.x, hl = Math.hypot(hx, hz) || 1;
      const pt = (t) => { const v = new THREE.Vector3().lerpVectors(from, to, t); const w2 = Math.sin(t * Math.PI); v.y -= sag * w2; const sw = Math.sin(this.t * 1.4 + t * 2.2) * sway * w2; v.x += hx / hl * sw; v.z += hz / hl * sw; return v; };
      const nxt = new THREE.Vector3();
      for (let i = 0; i < n; i++) {
        const l = this.chainLinks[i];
        if (i < nCurve) { l.visible = true; const t = (i + 0.5) / nCurve; l.position.copy(pt(t)); nxt.copy(pt(Math.min(1, t + 0.5 / nCurve))); l.lookAt(nxt); if (i % 2) l.rotateX(Math.PI / 2); else l.rotateY(Math.PI / 2); }
        else { l.visible = false; l.position.copy(from); }
      }
    }
    // the Eternials: strollers walk their rounds    // the Eternials: strollers walk their rounds, everyone breathes, shifts and looks around; heads turn to a visitor
    const GD = C.guard;
    // update 44: a desert hunter inside the walls is a beast to be cut down — the nearest free guard takes it
    this.beastT = (this.beastT || 0) - dt;
    if (this.beastT <= 0) {
      this.beastT = 0.5;
      for (const cr of g.creatures || []) {
        if (cr.dead || cr.chain || !(cr.type === "remotus" || cr.type === "altai" || cr.type === "trex")) continue;
        if (!this.inCastle(cr.pos.x, cr.pos.z)) continue;
        if (this.npcs.some((o) => o.beast === cr && !o.dead)) continue;
        let best = null, bd = 70;
        for (const o of this.npcs) { if (o.role !== "guard" || o.dead || o.beast || o.war) continue; const dq = Math.hypot(o.x - cr.pos.x, o.z - cr.pos.z); if (dq < bd) { bd = dq; best = o; } }
        if (best) { best.beast = cr; best.hostile = true; best.hp = best.hp || GD.hp; best.atkT = 0.3; }
      }
    }
    for (const n of this.npcs) {
      n.t += dt;
      if (n.dead) { if (n.respawnT !== undefined) { n.respawnT -= dt; if (n.respawnT <= 0) this.guardRespawn(n); } continue; }
      const d = Math.hypot(p.pos.x - n.x, p.pos.z - n.z);
      let targetYaw = n.yaw0, walking = false;
      n.blockT = Math.max(0, (n.blockT || 0) - dt);
      if (n.hostile) {   // update 42/44: a guard at war — he comes for you (or the beast), winds up and strikes, goes home when it is over
        let beast = n.beast && !n.beast.dead && this.inCastle(n.beast.pos.x, n.beast.pos.z) ? n.beast : null;
        if (n.beast && !beast) { n.beast = null; }
        const dh = Math.hypot(p.pos.x - n.homeX, p.pos.z - n.homeZ);
        let tx, tz, atFoe = false;
        if (beast) { tx = beast.pos.x; tz = beast.pos.z; n.calmT = 0; atFoe = true; }
        else if (n.war && dh < GD.chaseR) { tx = p.pos.x; tz = p.pos.z; n.calmT = 0; atFoe = true; }
        else { tx = n.homeX; tz = n.homeZ; n.calmT = (n.calmT || 0) + dt; }
        const dx = tx - n.x, dz = tz - n.z, dd = Math.hypot(dx, dz);
        const reach = beast ? GD.reach + 1.4 : GD.reach;
        const stopAt = atFoe ? reach - 0.7 : 0.4;
        const striking = n.strike !== undefined;
        if (!striking && dd > stopAt) { const st = Math.min(dd - stopAt, GD.speed * dt); n.x += dx / dd * st; n.z += dz / dd * st; walking = true; n.speed = GD.speed; n.body.position.x = n.x; n.body.position.z = n.z; const fy = this.floorH(n.x, n.z, n.y); if (fy !== null) { n.y = fy; n.body.position.y = n.y; } }
        if (dd > 0.3) n.yaw0 = Math.atan2(dx, dz);
        n.atkT = (n.atkT || 0) - dt;
        if (atFoe && dd < reach + 0.3 && n.atkT <= 0 && !striking && n.blockT <= 0) { n.atkT = GD.hitEvery + GD.atkDur; n.strike = 0; n.strikeHit = false; }
        if (striking) {
          n.strike += dt / GD.atkDur;
          if (!n.strikeHit && n.strike > 0.52) {   // the blow lands as the arm comes down
            n.strikeHit = true;
            if (beast) { if (dd < reach + 1.2) { beast.guardHits = (beast.guardHits || 0) + 1; g.audio.sHit(); if (beast.guardHits >= GD.beastHits) { beast.die(g); n.beast = null; if (Math.hypot(p.pos.x - n.x, p.pos.z - n.z) < 60) g.ui.toast(STR.et.guardBeast); } } }
            else if (atFoe && dd < reach + 0.9) p.damage(GD.dmg, "guard", new THREE.Vector3(n.x, n.y, n.z));
          }
          if (n.strike >= 1) n.strike = undefined;
        }
        if (!beast && !n.war && !striking && dd < 1) { n.hostile = false; n.calmT = 0; n.yaw0 = n.yawHome !== undefined ? n.yawHome : n.yaw0; }   // the hunt is over and he is back at his post
        if (n.war && n.calmT > 6 && dd < 1) { n.hostile = false; n.war = false; n.hits = 0; n.hp = GD.hp; n.yaw0 = n.yawHome !== undefined ? n.yawHome : n.yaw0; if (!this.npcs.some((o) => o.war)) g.ui.toast(STR.et.guardCalm); }
      } else if (n.walk) {
        const W = n.walk;
        if (d < 3.5) { W.wait = Math.max(W.wait, 0.8); }
        else if (W.wait > 0) W.wait -= dt;
        else {
          const [ta, tb] = W.pts[W.i]; const [tx, tz] = cityWorld(ta, tb);
          const dx = tx - n.x, dz = tz - n.z, dd = Math.hypot(dx, dz);
          if (dd < 0.6) { W.i = (W.i + 1) % W.pts.length; W.wait = 2 + Math.random() * 5; }
          else { const st = Math.min(dd, W.speed * dt); n.x += dx / dd * st; n.z += dz / dd * st; n.yaw0 = Math.atan2(dx, dz); walking = true; n.speed = W.speed; }
          n.body.position.x = n.x; n.body.position.z = n.z;
          const fy = this.floorH(n.x, n.z, n.y); n.y = fy === null ? n.y : fy;
          n.body.position.y = n.y;
        }
      }
      if (d < 5.5 && n.role !== "king") targetYaw = Math.atan2(p.pos.x - n.x, p.pos.z - n.z);
      const dy = ((targetYaw - n.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      n.yaw += Math.max(-2.5 * dt, Math.min(2.5 * dt, dy));
      n.body.rotation.y = n.yaw;
      // a glance at a visitor a little further out (the body turns only when you are close)
      let headTurn = 0;
      if (d >= 5.5 && d < 12) { const want = Math.atan2(p.pos.x - n.x, p.pos.z - n.z); headTurn = ((want - n.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI; }
      if (n.body.userData.hrig) driveHumanoid(n.body, walking ? "walk" : "idle", walking ? n.speed : 0, dt, headTurn, n.style || "calm",
        (n.strike !== undefined || n.blockT > 0) ? { attack: n.strike !== undefined ? Math.min(1, n.strike) : 0, block: n.blockT > 0 ? 1 - n.blockT / 0.45 : 0 } : null);   // update 44
      else if (!n.walk) n.body.position.y = n.y + Math.sin(n.t * 1.3) * 0.012;
    }
    if (!this.keeperReady) { const k = this.npcs.find((n) => n.role === "keeper"); if (k && Math.hypot(p.pos.x - k.x, p.pos.z - k.z) > 25) this.keeperReady = true; }
    if (this.rex && !this.rex.dead) {
      { const K = C.castle, Pr = this.polar(this.rex.pos.x, this.rex.pos.z); const ca = Math.max(K.a0 + 4, Math.min(K.a1 - 4, Pr.a)), cb = Math.max(-K.hw + 4, Math.min(K.hw - 4, Pr.b)); if (ca !== Pr.a || cb !== Pr.b) { const [wx, wz] = cityWorld(ca, cb); this.rex.pos.x = wx; this.rex.pos.z = wz; } }   // update 42: the courtyard's walls hold it
      const dr = Math.hypot(p.pos.x - this.rex.chain.x, p.pos.z - this.rex.chain.z);
      if (dr < this.rex.chain.r + 12 && dr > this.rex.chain.r + 3 && !this._warned) { this._warned = true; g.ui.toast(STR.et.rexWarn); }
      if (dr > this.rex.chain.r + 20) this._warned = false;
    }
  }
  onMorning() { if (!this.task || this.task.done) this.newTask(); }
  newTask() {
    const T = E().tasks, g = this.g;
    const pick = T[Math.floor(g.rng() * T.length)];
    this.task = { ...pick, done: false, day: g.dayNum };
  }
  addCoins(n) {
    this.coins += n;
    this.g.ui.toast(STR.et.coinsGot.replace("%n", n));
    this.g.audio.sPickup();
    this.g.ui.coins(this.coins);
  }

  // ---------------- interaction ----------------
  interact(consider, p) {
    const g = this.g, C = E(), S = STR.et;
    if (Math.hypot(p.pos.x - C.cx, p.pos.z - C.cz) > C.mountainR + 300) return;
    for (const n of this.npcs) {
      if (n.role === "stall") {
        const st = n.stall, d = Math.hypot(p.pos.x - st.frontX, p.pos.z - st.frontZ);
        if (d < 3.4) consider(st.frontX, st.frontZ, st.y, `${S.trade} ${n.name} [${STR.interact}]`, () => this.openStall(st));
        continue;
      }
      const d = Math.hypot(p.pos.x - n.x, p.pos.z - n.z);
      if (d > 4.2) continue;
      if (n.role === "king") consider(n.x, n.z, n.y, `${S.talk} ${n.name} [${STR.interact}]`, () => this.openKing());
      else if (n.role === "keeper") consider(n.x, n.z, n.y, `${S.talk} ${n.name} [${STR.interact}]`, () => this.openKeeper());
      else if (n.role === "inn") consider(n.x, n.z, n.y, `${S.talk} ${n.name} [${STR.interact}]`, () => this.openInn());
      else if (n.role === "advisor") consider(n.x, n.z, n.y, `${S.talk} ${n.name} [${STR.interact}]`, () => this.openAdvisor(n));
      else consider(n.x, n.z, n.y, `${S.talk} ${n.name} [${STR.interact}]`, () => this.talk(n));
    }
    // the altar: once a day, hunger AND health
    {
      const [cx, cz] = cityWorld(0, 0), ay = C.levels.dais, DRa = this.altarR || 4.3;   // update 44: from every side
      const dA = Math.hypot(p.pos.x - cx, p.pos.z - cz), ux = (cx - p.pos.x) / (dA || 1), uz = (cz - p.pos.z) / (dA || 1);
      const ax = p.pos.x + ux * Math.max(0, dA - DRa), az = p.pos.z + uz * Math.max(0, dA - DRa);
      if (dA < DRa + 4.6 && p.pos.y > ay - 2) consider(ax, az, ay + 2.5, `${STR.prayPrompt} [${STR.interact}]`, () => {
        if (this.prayedDay === g.dayNum) { g.ui.toast(STR.prayedAlready); g.audio.sDeny(); return; }
        this.prayedDay = g.dayNum; p.hu = 100; p.hp = 100;
        g.ui.toast(S.prayed); g.audio.sPickup();
      });
    }
    for (const b of this.innBeds || []) {
      if (Math.hypot(p.pos.x - b.x, p.pos.z - b.z) < 3.0) consider(b.x, b.z, b.y, `${S.sleepFor.replace("%n", C.innPrice)} [${STR.interact}]`, () => {
        if (!g.isNight) return g.ui.toast(STR.sleepNotNight);
        if (this.coins < C.innPrice) { g.ui.toast(S.noCoins); g.audio.sDeny(); return; }
        this.coins -= C.innPrice; g.ui.coins(this.coins); g.sleep();
      });
    }
    {
      const [vx, vz] = cityWorld(this.vaultDoorLocal.a, this.vaultDoorLocal.b);
      if (!this.vaultOpen && Math.hypot(p.pos.x - vx, p.pos.z - vz) < 3.5) consider(vx, vz, C.levels.lower, `${S.vaultOpen} [${STR.interact}]`, () => {
        if (!p.inv.has("vault_key")) { g.ui.toast(S.vaultLocked); g.audio.sDeny(); return; }
        this.vaultOpen = true; this.vaultDoorSeg.off = true;
        if (this.vaultDoor) this.vaultDoor.position.z += C.vault.doorHw * 2 + 0.6;
        g.ui.toast(S.vaultOpened); g.audio.sChest();
      });
    }
    // fishing in the river below
    const sel = p.inv.selected();
    if (sel && sel.id === "fishing_rod" && !g.fishing) {
      const src = this.waterSource(p.pos.x, p.pos.z, p.pos.y);
      if (src && src.name === "cavern") consider(p.pos.x, p.pos.z, p.pos.y, `${S.fish} [${STR.interact}]`, () => { g.fishing = { x: p.pos.x, z: p.pos.z, t: C.fishTime }; g.ui.toast(S.fishing); });
    }
  }
  talk(n) {
    const g = this.g, lines = n.lines || STR.et.maleLines;
    n.lineI = ((n.lineI ?? -1) + 1) % lines.length;
    g.npcPanel(n.name, [lines[n.lineI]]);
    g.audio.sSelect && g.audio.sSelect();
  }
  openAdvisor(n) {
    const g = this.g, S = STR.et;
    if (!this.task) this.newTask();
    const T = this.task;
    const need = T.need.map(([id, k]) => `${k} × ${id === "cookedMeat" ? S.cookedMeat : STR.items[id].name}`).join(", ");
    n.lineI = ((n.lineI ?? -1) + 1) % S.advisorLines.length;
    const lines = [S.advisorLines[n.lineI]];
    lines.push(T.done ? S.advisorDone : S.advisorTask.replace("%need", need).replace("%r", T.reward));
    if (!this.keyGiven) lines.push(S.advisorKey.replace("%n", Math.max(0, E().vaultTasks - this.tasksDone)));
    g.npcPanel(n.name, lines);
  }
  openInn() {
    const g = this.g, S = STR.et, C = E();
    g.npcPanel(S.innName, S.innLines.map((l) => l.replace("%n", C.innPrice)));
  }
  openKeeper() {
    const g = this.g, S = STR.et, ch = S.chapters;
    let text;
    if (this.chapter >= ch.length) text = [S.keeperDone];
    else if (!this.keeperReady) text = [S.keeperLater];
    else { text = [ch[this.chapter].title, ...ch[this.chapter].lines]; this.chapter++; this.keeperReady = false; }
    g.npcPanel(S.keeperName, text);
  }
  openKing() {
    const g = this.g, S = STR.et, p = g.player;
    if (!this.task) this.newTask();
    const T = this.task;
    const need = T.need.map(([id, n]) => `${n} × ${id === "cookedMeat" ? S.cookedMeat : STR.items[id].name}`).join(", ");
    const have = T.need.every(([id, n]) => this.countOf(p, id) >= n);
    const lines = T.done ? [S.kingThanks] : [S.kingIntro, S.kingTask.replace("%need", need).replace("%r", T.reward)];
    const btns = (!T.done && have) ? [["kingGive", S.kingGive]] : [];
    const s = g.npcPanel(S.kingName, lines, btns);
    if (!T.done && have) s.querySelector("#kingGive").addEventListener("click", () => {
      for (const [id, n] of T.need) this.takeOf(p, id, n);
      T.done = true; this.tasksDone++;
      this.coins += T.reward; g.ui.coins(this.coins);
      g.ui.renderHotbar(p.inv);
      g.ui.closeScreen(); g.resume();
      g.ui.toast(S.taskDone.replace("%r", T.reward));
      g.audio.sPickup();
      if (this.tasksDone >= E().vaultTasks && !this.keyGiven) {
        this.keyGiven = true;
        if (!p.inv.add("vault_key", 1)) g.spawnDrop("vault_key", 1, p.pos.x, p.pos.z, p.pos.y);
        g.ui.renderHotbar(p.inv);
        setTimeout(() => g.ui.toast(S.keyGot), 900);
      }
    });
  }
  countOf(p, id) {
    if (id === "cookedMeat") return CFG.cookedMeat.reduce((n, m) => n + p.inv.count(m), 0);
    return p.inv.count(id);
  }
  takeOf(p, id, n) {
    if (id === "cookedMeat") { for (const m of CFG.cookedMeat) { while (n > 0 && p.inv.count(m) > 0) { p.inv.remove(m, 1); n--; } } return; }
    p.inv.remove(id, n);
  }
  // ---------------- trade: a grid of cards — icon, name, price ----------------
  openStall(st) {
    const g = this.g, p = g.player, S = STR.et, C = E();
    g.menuOpen = true;
    const price = (id) => C.prices[id];
    const name = (id) => id === "fill_water" ? S.fillWater : (STR.items[id] ? STR.items[id].name : id);
    const icon = (id) => { const u = iconUrl(id === "fill_water" ? "water_bottle" : id); return u ? `<img src="${u}" alt="">` : `<span class="noicon"></span>`; };
    const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
    // update 42: a stall with a `limit` sells that many of each thing a day (the water is never limited)
    if (!this.bought || this.bought.day !== g.dayNum) this.bought = { day: g.dayNum };
    const B = this.bought[st.id] || (this.bought[st.id] = {});
    const limitOf = (id) => st.limit && id !== "fill_water" ? st.limit : 0;
    const left = (id) => limitOf(id) ? Math.max(0, limitOf(id) - (B[id] || 0)) : Infinity;
    const rows = [];
    if (st.sells && st.sells.length) {
      rows.push(`<div class="shopHead">${S.buyHead}</div><div class="shopGrid">`);
      for (const id of st.sells) rows.push(`<button class="shopCard${left(id) === 0 ? " out" : ""}" data-buy="${id}">${icon(id)}<span class="nm">${esc(name(id))}${C.bundles[id] ? ` ×${C.bundles[id]}` : ""}</span><span class="pr">${price(id)} ${S.coinsShort}</span>${limitOf(id) ? `<span class="cnt">${S.leftToday.replace("%n", left(id))}</span>` : ""}</button>`);
      rows.push(`</div>`);
    }
    const sellable = [];
    for (const s of p.inv.slots) if (s && st.buys && st.buys[s.id] !== undefined && !sellable.includes(s.id)) sellable.push(s.id);
    rows.push(`<div class="shopHead">${S.sellHead}</div>`);
    if (st.rare) rows.push(`<div class="shopNote">${S.rareWarn}</div>`);
    if (!sellable.length) rows.push(`<div class="shopNote dim">${st.rare ? S.nothingRare : S.nothingToSell}</div>`);
    else {
      rows.push(`<div class="shopGrid">`);
      for (const id of sellable) rows.push(`<button class="shopCard sell" data-sell="${id}">${icon(id)}<span class="nm">${esc(name(id))} <span class="cnt">×${p.inv.count(id)}</span></span><span class="pr">${st.buys[id]} ${S.coinsShort}</span></button>`);
      rows.push(`</div>`);
    }
    const s = g.ui.screen(`
      <h1 style="font-size:24px;margin-bottom:2px">${esc(st.name)}</h1>
      <div style="font-size:13px;opacity:.85;margin-bottom:4px">${STR.et[st.blurb] || ""}</div>
      <div id="purse" class="purse">${S.purse.replace("%n", this.coins)}</div>
      <div class="shopWrap">${rows.join("")}</div>
      <button id="pnlClose" style="margin-top:8px">${STR.close}</button>`);
    s.querySelector("#pnlClose").addEventListener("click", () => { g.ui.closeScreen(); g.resume(); });
    const refresh = () => { const sc = s.querySelector(".shopWrap").scrollTop; g.ui.closeScreen(); this.openStall(st); const w2 = document.querySelector("#screen .shopWrap"); if (w2) w2.scrollTop = sc; };
    s.querySelectorAll("[data-buy]").forEach((b) => b.addEventListener("click", () => {
      const id = b.dataset.buy, cost = price(id);
      if (left(id) === 0) { g.ui.toast(S.soldOut); g.audio.sDeny(); return; }
      if (this.coins < cost) { g.ui.toast(S.noCoins); g.audio.sDeny(); return; }
      if (id === "fill_water") {
        if (!p.inv.has("water_bottle")) { g.ui.toast(S.noBottle); g.audio.sDeny(); return; }
        g.desert.bottle.water = CFG.desert.thirst.bottleTime;
      } else if (!p.inv.add(id, C.bundles[id] || 1)) { g.ui.toast(STR.inventoryFull); g.audio.sDeny(); return; }
      this.coins -= cost; g.ui.coins(this.coins); g.ui.renderHotbar(p.inv); g.audio.sPickup();
      if (limitOf(id)) B[id] = (B[id] || 0) + 1;
      g.ui.toast(S.bought.replace("%i", name(id)));
      refresh();
    }));
    s.querySelectorAll("[data-sell]").forEach((b) => b.addEventListener("click", () => {
      const id = b.dataset.sell, val = st.buys[id];
      if (st.rare && b.dataset.armed !== "1") { b.dataset.armed = "1"; b.querySelector(".pr").textContent = S.sellSure.replace("%n", val); b.classList.add("armed"); setTimeout(() => { if (document.body.contains(b)) { b.dataset.armed = "0"; b.classList.remove("armed"); b.querySelector(".pr").textContent = `${val} ${S.coinsShort}`; } }, 3500); return; }
      if (p.inv.count(id) < 1) return;
      p.inv.remove(id, 1);
      this.coins += val; g.ui.coins(this.coins); g.ui.renderHotbar(p.inv); g.audio.sPickup();
      g.ui.toast(S.sold.replace("%i", name(id)).replace("%n", val));
      refresh();
    }));
  }
  // ---------------- the map: a drawn mountain, the castle, the lake, the bridge ----------------
  paint(c, tx, ty, s, mini) {
    const C = E(), W = CFG.world, K = C.castle, LK = C.lake;
    c.save();
    c.beginPath(); c.rect(tx(-W.square), ty(-W.square), 2 * W.square * s, 2 * W.square * s); c.clip();
    // the mountain: an irregular massif, lighter toward the peaks, ridge lines running out from the heart
    const mx = tx(C.cx), mz = ty(C.cz), R = C.mountainR * s;
    c.beginPath();
    for (let i = 0; i <= 48; i++) { const th = (i / 48) * Math.PI * 2; const rr = R * (0.94 + 0.05 * Math.sin(3 * th + 0.8) + 0.03 * Math.sin(7 * th + 2)); const px = mx + Math.cos(th) * rr, py = mz + Math.sin(th) * rr; i ? c.lineTo(px, py) : c.moveTo(px, py); }
    c.closePath();
    const gr = c.createRadialGradient(mx - R * 0.15, mz - R * 0.15, R * 0.05, mx, mz, R);
    gr.addColorStop(0, mini ? "rgba(178,150,110,.95)" : "#b89870"); gr.addColorStop(0.55, mini ? "rgba(140,112,80,.95)" : "#8e6f4e"); gr.addColorStop(1, mini ? "rgba(98,78,56,.95)" : "#5f4a36");
    c.fillStyle = gr; c.fill();
    c.strokeStyle = mini ? "rgba(40,30,20,.6)" : "#3e2f22"; c.lineWidth = mini ? 1 : 1.4; c.stroke();
    c.lineWidth = mini ? 0.8 : 1.1; c.strokeStyle = mini ? "rgba(60,44,30,.7)" : "rgba(62,47,34,.85)";
    for (const [pa, pb, ph] of C.peaks) {
      const [wx, wz] = cityWorld(pa, pb), px = tx(wx), py = ty(wz);
      c.beginPath(); c.moveTo(mx, mz); c.lineTo(px, py); c.stroke();
      c.beginPath(); c.moveTo(px - 3, py + 3); c.lineTo(px, py - 4 * (ph / C.peakH) - 1); c.lineTo(px + 3, py + 3); c.closePath(); c.fillStyle = mini ? "rgba(70,52,36,.9)" : "#4a3828"; c.fill();
    }
    c.beginPath(); c.arc(mx, mz, Math.max(2, C.shaftR * s), 0, Math.PI * 2); c.fillStyle = "#2a2018"; c.fill();
    // the lake and the moat
    c.fillStyle = "rgba(94,132,142,.9)"; c.strokeStyle = "#3a5a6a"; c.lineWidth = 1;
    { const m = lakeOutline(0, 48).map(([a, b]) => cityWorld(a, b)); c.beginPath(); m.forEach(([x, z], i) => (i ? c.lineTo(tx(x), ty(z)) : c.moveTo(tx(x), ty(z)))); c.closePath(); c.fill(); c.stroke(); }
    // the castle: walls, four corner towers, the gate towers, the great dome; the bridge across the lake
    const corners = [[K.a0, -K.hw], [K.a1, -K.hw], [K.a1, K.hw], [K.a0, K.hw]].map(([a, b]) => cityWorld(a, b));
    c.beginPath(); corners.forEach(([x, z], i) => (i ? c.lineTo(tx(x), ty(z)) : c.moveTo(tx(x), ty(z)))); c.closePath();
    c.fillStyle = "rgba(226,190,96,.95)"; c.fill(); c.strokeStyle = "rgba(58,50,38,.85)"; c.lineWidth = mini ? 1 : 1.5; c.stroke();
    const tower = (a, b, rad, col) => { const [x, z] = cityWorld(a, b); c.beginPath(); c.arc(tx(x), ty(z), rad, 0, Math.PI * 2); c.fillStyle = col; c.fill(); c.strokeStyle = "rgba(58,50,38,.9)"; c.lineWidth = 1; c.stroke(); };
    for (const [a, b] of [[K.a0, -K.hw], [K.a1, -K.hw], [K.a1, K.hw], [K.a0, K.hw]]) tower(a, b, mini ? 2 : 3.2, "#d8a83a");
    for (const b of [-(C.gate.hw + 6.5), C.gate.hw + 6.5]) tower(K.a1, b, mini ? 1.6 : 2.6, "#e8c050");
    tower(K.a0 - 5, 0, mini ? 2.4 : 4, "#f0cc58");
    if (!mini) { for (const bb of [-K.hw + 12, -K.hw + 30, K.hw - 12, K.hw - 30]) { const [x, z] = cityWorld((K.a0 + K.a1) / 2, bb); c.beginPath(); c.moveTo(tx(x) - 2, ty(z) + 2); c.lineTo(tx(x), ty(z) - 3); c.lineTo(tx(x) + 2, ty(z) + 2); c.closePath(); c.fillStyle = "#c89a30"; c.fill(); } }
    { const [x0, z0] = cityWorld(C.bridge.a0, 0), [x1, z1] = cityWorld(C.bridge.a1, 0); c.beginPath(); c.moveTo(tx(x0), ty(z0)); c.lineTo(tx(x1), ty(z1)); c.strokeStyle = "#c8a870"; c.lineWidth = mini ? 2 : 3; c.stroke(); c.strokeStyle = "rgba(58,50,38,.9)"; c.lineWidth = mini ? 0.6 : 1; c.stroke(); }
    c.restore();
  }
}

// the three Eternial weapons: the generated scans stand upright (blade down for the dagger and the sword, blade up for the
// spear) — they are turned to lie along -x with the grip at the origin, the frame the hand and the throw code expect.
// A gold-and-green-stone stand-in is built for any weapon whose model has not landed.
export function buildEternialWeapons(assets) {
  const wrap = (id, H, bladeUp, gripX) => {
    const a = assets.glb[id]; if (!a || a.wrapped) return !!a;
    const g = new THREE.Group(); const m = a.model;
    g.add(m); g.rotation.z = bladeUp ? Math.PI / 2 : -Math.PI / 2; g.position.x = bladeUp ? gripX : -(H - gripX);
    const outer = new THREE.Group(); outer.add(g);
    assets.glb[id] = { model: outer, anims: [], wrapped: true }; return true;
  };
  const haveD = wrap("etdagger3d", 0.95, false, 0.3), haveS = wrap("etsword3d", 1.6, false, 0.36), haveP = wrap("etspear3d", 2.6, true, 1.2);
  const gold = new THREE.MeshStandardMaterial({ color: 0xe0b230, metalness: 0.7, roughness: 0.28, emissive: 0x3a2a06 });
  const gem = new THREE.MeshStandardMaterial({ color: 0x2fdc5a, emissive: 0x1fbf46, emissiveIntensity: 1.2, roughness: 0.2 });
  const mk = (kind) => {
    const g = new THREE.Group();
    const add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => { const mm = new THREE.Mesh(geo, m); mm.position.set(x, y, z); mm.rotation.set(rx, ry, rz); g.add(mm); return mm; };
    if (kind === "dagger") {
      add(new THREE.CylinderGeometry(0.035, 0.045, 0.34, 8), gold, 0, 0, 0, 0, 0, Math.PI / 2);
      add(new THREE.ConeGeometry(0.06, 0.62, 4), gold, -0.5, 0, 0, 0, 0, Math.PI / 2).scale.set(1, 1, 0.35);
      add(new THREE.OctahedronGeometry(0.05), gem, 0.2, 0, 0);
      add(new THREE.BoxGeometry(0.05, 0.2, 0.08), gold, -0.19, 0, 0);
    } else if (kind === "sword") {
      add(new THREE.CylinderGeometry(0.04, 0.05, 0.36, 8), gold, 0.18, 0, 0, 0, 0, Math.PI / 2);
      add(new THREE.BoxGeometry(1.1, 0.13, 0.03), gold, -0.6, 0, 0);
      add(new THREE.ConeGeometry(0.065, 0.24, 4), gold, -1.25, 0, 0, 0, 0, Math.PI / 2).scale.set(1, 1, 0.35);
      add(new THREE.BoxGeometry(0.06, 0.42, 0.1), gold, -0.02, 0, 0);
      add(new THREE.OctahedronGeometry(0.05), gem, -0.02, 0, 0.06);
      add(new THREE.SphereGeometry(0.06, 8, 6), gem, 0.4, 0, 0);
    } else {
      add(new THREE.CylinderGeometry(0.025, 0.025, 2.4, 8), gold, 0, 0, 0, 0, 0, Math.PI / 2);
      add(new THREE.ConeGeometry(0.07, 0.5, 4), gold, -1.42, 0, 0, 0, 0, Math.PI / 2).scale.set(1, 1, 0.35);
      add(new THREE.OctahedronGeometry(0.05), gem, -1.12, 0, 0);
      add(new THREE.ConeGeometry(0.035, 0.12, 6), gold, 1.25, 0, 0, 0, 0, -Math.PI / 2);
    }
    return { model: g, anims: [] };
  };
  if (!haveD) assets.glb.etdagger3d = mk("dagger");
  if (!haveS) assets.glb.etsword3d = mk("sword");
  if (!haveP) assets.glb.etspear3d = mk("spear");
}
