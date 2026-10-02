import * as THREE from "three";
import { CFG } from "./config.js?v=76";
import { STR } from "../strings.js?v=76";
import { E, D2R, cityWorld } from "./eternius_frame.js?v=76";

// ============================================================================
// update 50: FLOOR -1's rules — where the floor is, what is rock, the water you can drink, its people, the boat
// ride down the spiral and back up. Called from eternius.js (floorH / collide / waterSource / interact / update)
// and main.js (the ride owns the player while it runs). The geometry is in eternius_lower.js.
// ============================================================================
const LW = () => E().lower;
const inW = (th) => th > LW().west.th0 && th < LW().west.th1;
const inEa = (th) => th > LW().east.th0 && th < LW().east.th1;

// the room (hospital, house, store, a cell) that holds (a, b), within margin m
export function lowerRoom(city, a, b, m = 1, y) {   // update 54: at the room's own height only (the walkway runs over the hospital)
  for (const rm of city.lowerRooms || []) { if (y !== undefined && (y < rm.y - 2 || y > rm.y + rm.h + 2)) continue; const u = rm.u(a, b), v = rm.v(a, b); if (u > -(m + (rm.front || 0)) && u < rm.depth + m && Math.abs(v) < rm.hw + m) return rm; }   // update 68: rm.front - a room whose floor reaches out past its threshold (the house's passage)
  return null;
}
function mineDist(city, a, b) {
  const M = city.lowerMine; if (!M) return 1e9;
  if (M.samples) { let best = 1e9; for (const p of M.samples) { const d = Math.hypot(p.x - b, p.z - a); if (d < best) best = d; } return best; }   // update 57: the longer tunnel, sampled once
  let best = 1e9; const q = new THREE.Vector3(b, 0, a);
  for (let i = 0; i <= 40; i++) { const p = M.path.getPointAt(i / 40); const d = Math.hypot(p.x - q.x, p.z - q.z); if (d < best) best = d; }
  return best;
}
// update 57: how far along the mine you are (metres from its mouth) and how far off its centre line
export function mineAlong(city, a, b) {
  const M = city.lowerMine; if (!M || !M.samples) return null;
  let best = 1e9, bi = 0; for (let i = 0; i < M.samples.length; i++) { const p = M.samples[i]; const d = Math.hypot(p.x - b, p.z - a); if (d < best) { best = d; bi = i; } }
  return { d: best, along: bi / (M.samples.length - 1) * M.total };
}
// inside the carved space of floor -1 (the bowl, the two bands, the rooms, the mine)?
export function lowerInside(city, a, b, r, th, y) {
  const L = LW(), C = E();
  if (r < C.terraceR + 0.5) return true;
  if (r < C.wallR + 0.5 && (inW(th) || inEa(th))) return true;
  if (lowerRoom(city, a, b, 1, y)) return true;
  if (mineDist(city, a, b) < L.mine.hw + 0.5) return true;
  return false;
}
export function lowerH(city, a, b, r, th, y) {
  const C = E(), L = LW(), Y = L.y, rise = C.stairRise, TR = C.terraceR;
  const rm = lowerRoom(city, a, b, 1, y); if (rm) return rm.y;
  if (r > C.wallR + 0.5) return mineDist(city, a, b) < L.mine.hw + 0.5 ? Y.low : null;
  const SU = C.stairs.up, SD = C.stairs.down;
  if (Math.abs(a) < SU.hw + 0.3 && b > SU.r0 && b <= SU.r1 + 0.3) { const n = Math.round((Y.walk - Y.park) / rise), run = (SU.r1 - SU.r0) / n; return Y.park + ((Y.walk - Y.park) / n) * Math.min(n, Math.ceil((b - SU.r0) / run)); }
  { const se = L.stairETh * D2R, u = a * Math.cos(se) + b * Math.sin(se), v = -a * Math.sin(se) + b * Math.cos(se);   // update 55: the trench stair at its own angle
    if (Math.abs(v) < SD.hw + 0.3 && u > SD.r0 && u <= SD.r1 + 0.3) { const n = Math.round((Y.park - Y.low) / rise), run = (SD.r1 - SD.r0) / n; return Y.park - ((Y.park - Y.low) / n) * Math.min(n, Math.ceil((u - SD.r0) / run)); } }
  if (r >= TR) {
    if (inW(th)) {
      if (city.lowerJetty && Math.abs(th - city.lowerJetty.th) < 1.3 && r < L.riverR0 + 3.9) return Y.walk;   // the jetty's pier, level with the walkway
      const B = city.lowerBridge; const bt = B ? Math.abs(-a * Math.sin(B.th * D2R) + b * Math.cos(B.th * D2R)) : 1e9;
      if (B && r > B.r0 && r < B.r1 && bt <= B.hw + 0.3) return Y.walk + B.arch * Math.sin((r - B.r0) / (B.r1 - B.r0) * Math.PI);   // update 55: the arched deck
      if (r > L.riverR0 && r < L.riverR1) return Y.riverBed;
      return Y.walk;
    }
    if (inEa(th)) return Y.low;
    if (mineDist(city, a, b) < L.mine.hw + 0.5) return Y.low;
    return null;
  }
  const FR = L.fountainR;
  if (r < FR - 0.6) return Y.park + 0.7;
  if (r < FR) return Y.park + 0.9;
  if (r < FR + 8) return Y.park + 0.02;
  return Y.park;
}
// the pushes of floor -1 (in place of the ground floor's): the bowl's rock at TR in the closed sectors, the outer wall,
// the rails along the bands' edges, the river's banks, the mouths. Returns [a, b] or null when nothing moved
export function lowerCollide(city, a, b, rad, y) {
  const C = E(), L = LW(), Y = L.y, TR = C.terraceR, R = C.wallR;
  let moved = false;
  let r = Math.hypot(a, b), th = Math.atan2(b, a) / D2R;
  const room = lowerRoom(city, a, b, 1.2, y), nearDoor = (city.lowerRooms || []).some((rm) => { if (y < rm.y - 2 || y > rm.y + rm.h + 2) return false; const u = rm.u(a, b), v = rm.v(a, b); return u > -3 && u < 2 && Math.abs(v) < (rm.kind === "store" ? 2.2 : rm.kind === "cell" ? 1.15 : C.room.doorHw) + rad; });
  const inMine = mineDist(city, a, b) < L.mine.hw + rad + 1;
  if (inMine && city.lowerMine && city.lowerMine.total) {   // update 57: the working face - the tunnel runs on into the dark past the last miner, but not for you
    const M = city.lowerMine, al = mineAlong(city, a, b);
    if (al && al.along > L.mine.len) {
      const u = Math.min(1, (L.mine.len - 0.6) / M.total), p = M.path.getPointAt(u), t = M.path.getTangentAt(u);
      const lat = Math.max(-(L.mine.hw - rad - 0.3), Math.min(L.mine.hw - rad - 0.3, (b - p.x) * t.z - (a - p.z) * t.x));
      b = p.x + t.z * lat; a = p.z - t.x * lat; moved = true;
      const g = city.g; if (g && g.ui && (city.mineWarnT === undefined || city.t - city.mineWarnT > 4)) { city.mineWarnT = city.t; g.ui.toast(`${STR.et.minerName}: ${STR.et.minerBack}`); }
    }
  }
  const se = L.stairETh * D2R, su = a * Math.cos(se) + b * Math.sin(se), sv = -a * Math.sin(se) + b * Math.cos(se);
  const stairGap = (b > 0 && Math.abs(a) < C.stairs.up.hw + 0.6) || (su > 0 && Math.abs(sv) < C.stairs.down.hw + 0.6);
  if (!room && !nearDoor) {
    if (!(inW(th) || inEa(th))) { if (r > TR - rad && r < TR + 30) { const k = (TR - rad) / r; a *= k; b *= k; moved = true; } }   // the closed sectors: rock at the park's edge
    else if (!inMine && r > R - rad && r < R + 8) { const k = (R - rad) / r; a *= k; b *= k; moved = true; }   // the outer wall
  }
  r = Math.hypot(a, b); th = Math.atan2(b, a) / D2R;
  if ((inW(th) || inEa(th)) && Math.abs(r - TR) < rad + 0.3 && !stairGap && !room && !nearDoor) {   // the rails at the bands' edges
    const side = r < TR ? TR - rad - 0.3 : TR + rad + 0.3; const k = side / r; a *= k; b *= k; moved = true;
  }
  r = Math.hypot(a, b); th = Math.atan2(b, a) / D2R;
  if (inW(th) && r > L.riverR0 - rad && r < L.riverR1 + rad && y > Y.riverBed + 2.5) {   // the river: banks, not water — unless on the bridge
    const B = city.lowerBridge; const bt = B ? Math.abs(-a * Math.sin(B.th * D2R) + b * Math.cos(B.th * D2R)) : 1e9;
    const onPier = city.lowerJetty && Math.abs(th - city.lowerJetty.th) < 1.1 && r < L.riverR0 + 3.7;
    if (!onPier && !(B && bt <= B.hw - 0.2)) { const mid = (L.riverR0 + L.riverR1) / 2, side = r < mid ? L.riverR0 - rad : L.riverR1 + rad; const k = side / r; a *= k; b *= k; moved = true; }
  }
  return moved ? [a, b] : null;
}
export function lowerWater(city, x, z, y, P) {
  const C = E(), L = LW(), Y = L.y, { a, b, r, th } = P;
  if (y > -100) return null;
  if (r < L.fountainR + 3.2 && Math.abs(y - Y.park) < 3) { const k = (L.fountainR - 0.4) / (r || 1); const [wx, wz] = cityWorld(a * k, b * k); return { x: wx, z: wz, y: Y.park + 0.7, name: "fountain" }; }
  if (inW(th) && Math.abs(y - Y.walk) < 2.5 && ((r > L.riverR0 - 3 && r < L.riverR0) || (r > L.riverR1 && r < L.riverR1 + 3))) {
    const rr = r < L.riverR0 ? L.riverR0 : L.riverR1, [wx, wz] = cityWorld(rr * Math.cos(th * D2R), rr * Math.sin(th * D2R));
    return { x: wx, z: wz, y: Y.water, name: "cavern" };
  }
  return null;
}
// ---------------- the people of floor -1 ----------------
export function lowerNpcs(city) {
  const C = E(), L = LW(), Y = L.y, S = STR.et, mk = city.mkNpc, R = C.wallR, TR = C.terraceR;
  if (!mk) return;
  const pt = (r, th) => [r * Math.cos(th * D2R), r * Math.sin(th * D2R)];
  for (const [ga, gb] of city.lowerJailGuards || []) { const [fa, fb] = pt(R, Math.atan2(gb, ga) / D2R); mk("spear", ga, gb, Y.low, fa, fb, "guard", { lines: S.jailerLines, jailer: true }); }
  if (city.lowerCells && city.lowerCells[2]) { const c = city.lowerCells[2]; mk("prisoner", c.inA, c.inB, Y.low, c.rm.doorA, c.rm.doorB, "prisoner", { name: S.prisonerName, lines: S.prisonerLines }); }
  if (city.lowerHospital) { const h = city.lowerHospital; mk("doctor", h.npc[0], h.npc[1], Y.park, h.doorA, h.doorB, "doctor", { name: S.doctorName, lines: S.doctorLines, style: "calm" }); }
  if (city.lowerStore) { const s = city.lowerStore; mk("male", s.npc[0], s.npc[1], Y.low, s.doorA, s.doorB, "minekeeper", { name: S.minekeeperName, lines: S.minekeeperLines, style: "busy" }); }
  for (const m of city.lowerMiners || []) { const fa = m.a + Math.cos(m.face * D2R) * 3, fb = m.b + Math.sin(m.face * D2R) * 3; mk("miner", m.a, m.b, Y.low, fa, fb, "miner", { name: S.minerName, lines: S.minerLines, style: "busy", mining: true }); }
  if (city.lowerHouse) { const rm = city.lowerHouse.rm; const [ra, rb] = rm.P(-4.5, 3.2); mk("female", ra, rb, Y.park, rm.doorA, rm.doorB, "realtor", { name: S.realtorName, lines: S.realtorLines }); }
  if (city.lowerJetty) { const J = city.lowerJetty; const [ba, bb] = pt(L.riverR0 - 2.4, J.th - 3); mk("male", ba, bb, Y.walk, J.boatA, J.boatB, "boatman", { name: S.boatmanName, lines: S.boatmanLowerLines }); }
  if (city.jettyUp) { const J = city.jettyUp; const [ba, bb] = pt(C.riverR0 - 2.4, J.th + 3); mk("male", ba, bb, C.levels.lower, J.boatA, J.boatB, "boatman", { name: S.boatmanName, lines: S.boatmanUpperLines }); }
  // strollers round the fountain and along the tree walks
  const ring = (r0, t0, n, dir) => { const pts = []; for (let i = 0; i < n; i++) { const t = t0 + dir * i * (360 / n); pts.push(pt(r0, t)); } return pts; };
  mk("female", ...pt(28, 20), Y.park, 0, 0, "citizen", { lines: S.parkLines, name: S.homeFemale, walk: { pts: ring(28, 20, 10, 1), i: 0, wait: 1, speed: 1.1 } });
  mk("male", ...pt(34, 200), Y.park, 0, 0, "citizen", { lines: S.parkLines, name: S.homeMale, walk: { pts: ring(34, 200, 12, -1), i: 0, wait: 2, speed: 1.0 } });
  mk("female", ...pt(72, 50), Y.park, 0, 0, "citizen", { lines: S.parkLines, name: S.homeFemale, walk: { pts: [pt(72, 50), pt(60, 30), pt(56, -40), pt(72, -70), pt(80, -30), pt(76, 20)], i: 0, wait: 3, speed: 0.9 } });
  mk("male", ...pt(66, 160), Y.park, 0, 0, "citizen", { lines: S.parkLines, name: S.homeMale, walk: { pts: [pt(66, 160), pt(50, 140), pt(44, 100), pt(58, 125), pt(70, 175)], i: 0, wait: 2, speed: 1.0 } });
  { const arc = []; for (let t = 60; t <= 130; t += 6) arc.push(pt(R - 5, t)); for (let t = 124; t > 60; t -= 6) arc.push(pt(R - 5, t)); mk("male", ...pt(R - 5, 60), Y.walk, ...pt(R, 60), "citizen", { lines: S.parkLines, name: S.homeMale, walk: { pts: arc, i: 0, wait: 4, speed: 0.9 } }); }   // update 55: along the arc, never across the water
}
// ---------------- prompts ----------------
export function lowerInteract(city, consider, p) {
  const C = E(), L = LW(), S = STR.et, g = city.g;
  const near = (pa, pb, d) => { const [x, z] = cityWorld(pa, pb); return Math.hypot(p.pos.x - x, p.pos.z - z) < d; };
  if (city.jettyUp && !g.ride && near(city.jettyUp.a, city.jettyUp.b, 6.5) && Math.abs(p.pos.y - C.levels.lower) < 3) { const [x, z] = cityWorld(city.jettyUp.a, city.jettyUp.b); consider(x, z, p.pos.y, `${S.boatDown} [${STR.interact}]`, () => startRide(city, 1)); }
  if (city.lowerJetty && !g.ride && near(city.lowerJetty.a, city.lowerJetty.b, 6.5) && Math.abs(p.pos.y - L.y.walk) < 3) { const [x, z] = cityWorld(city.lowerJetty.a, city.lowerJetty.b); consider(x, z, p.pos.y, `${S.boatUp} [${STR.interact}]`, () => startRide(city, -1)); }
  if (city.lowerHouse && near(city.lowerHouse.rm.doorA, city.lowerHouse.rm.doorB, 4.0) && Math.abs(p.pos.y - L.y.park) < 3) { const [x, z] = cityWorld(...city.lowerHouse.rm.P(-2.9, 0)); if (city.houseOwned) consider(x, z, p.pos.y, `${city.houseDoorOpen ? S.houseClose : S.houseOpen} [${STR.interact}]`, () => city.houseToggleDoor()); else consider(x, z, p.pos.y, `${S.enterHome} [${STR.interact}]`, () => { g.ui.toast(S.notYourHome); g.audio.sDeny(); }); }   // update 63: yours once bought; update 67: the prompt point sits at the door's FRONT (u -2.9) - the door's collider stops you 3.1 m from the door itself, past the 2.6 m prompt reach, so the prompt never showed in play
  // update 63: your bed and your chest once the house is bought; the hospital's beds when you are badly hurt; the cell's cot and the
  // jailer at the bars while you sit; the emerald veins with a pickaxe in hand
  if (city.lowerHouse && city.houseOwned && Math.abs(p.pos.y - L.y.park) < 3) {
    const H = city.lowerHouse; if (near(H.bed.a, H.bed.b, 3.0)) { const [x, z] = cityWorld(H.bed.a, H.bed.b); consider(x, z, p.pos.y, `${S.houseBed} [${STR.interact}]`, () => { if (!g.isNight) return g.ui.toast(STR.sleepNotNight); g.sleep(); }); }
    if (near(H.chest.a, H.chest.b, 3.0)) { const [x, z] = cityWorld(H.chest.a, H.chest.b); consider(x, z, p.pos.y, `${S.houseChest} [${STR.interact}]`, () => g.openStorage(g.houseStorage, S.houseChestTitle)); }
  }
  if (city.lowerHospBeds && Math.abs(p.pos.y - L.y.park) < 3) for (const [ba, bb] of city.lowerHospBeds) if (near(ba, bb, 3.0)) { const [x, z] = cityWorld(ba, bb); consider(x, z, p.pos.y, `${S.hospSleep} [${STR.interact}]`, () => { if (p.hp >= 20) { g.ui.toast(S.bedsForHurt); g.audio.sDeny(); return; } if (!g.isNight) return g.ui.toast(STR.sleepNotNight); g.sleep(); }); }
  if (city.jail && city.lowerCells && Math.abs(p.pos.y - L.y.low) < 3) {
    const cell = city.lowerCells[city.jail.cell];
    if (near(cell.bedA, cell.bedB, 3.0)) { const [x, z] = cityWorld(cell.bedA, cell.bedB); consider(x, z, p.pos.y, `${S.jailSleep} [${STR.interact}]`, () => { if (!g.isNight) return g.ui.toast(STR.sleepNotNight); g.sleep().then(() => city.releaseJail(true)); }); }
    const [qa, qb] = cell.rm.P(0.6, 0); if (near(qa, qb, 2.6)) { const [x, z] = cityWorld(qa, qb); consider(x, z, p.pos.y, `${S.callJailer.replace("%n", city.jail.bail)} [${STR.interact}]`, () => city.openJailer()); }
  }
  if (city.groundApples && Math.abs(p.pos.y - L.y.park) < 3) for (const tr of city.groundApples) for (const sl of tr.slots) { if (sl.taken || !near(sl.a, sl.b, 2.6)) continue; const [x, z] = cityWorld(sl.a, sl.b); consider(x, z, p.pos.y, `${STR.pickApple} [${STR.interact}]`, () => { if (!p.inv.add(sl.gold ? "golden_apple" : "green_apple", 1)) return g.ui.toast(STR.inventoryFull); sl.taken = true; sl.mesh.scale.setScalar(0.001); if (!tr.lastT) tr.lastT = city.t; g.audio.sPickup(); g.ui.renderHotbar(p.inv); if (sl.gold) g.ui.toast(S.goldenApple); }); }   // update 64
  if (city.lowerVeins && Math.abs(p.pos.y - L.y.low) < 3) for (const v of city.lowerVeins) {
    if (!v.model || v.left <= 0 || !near(v.a, v.b, 3.6)) continue;
    const sel = p.inv.selected(), [x, z] = cityWorld(v.a, v.b), M = city.mining;
    if (sel && (sel.id === "pickaxe" || sel.id === "et_pickaxe")) consider(x, z, p.pos.y, M && M.v === v ? `${S.mining.replace("%n", Math.round(100 * M.t / M.need))} [${STR.interact}]` : `${S.minePrompt} [${STR.interact}]`, () => city.mineStart(v, sel.id));
    else consider(x, z, p.pos.y, S.needPick, () => { g.ui.toast(S.needPick); g.audio.sDeny(); });
  }
}
// ---------------- each frame ----------------
export function lowerUpdate(city, dt) {
  const t = city.t;
  if (city.lowerRiver && city.lowerRiver.material.map) city.lowerRiver.material.map.offset.set(-t * 0.07, 0);
  if (city.lowerFount && city.lowerFount.material.map) city.lowerFount.material.map.offset.set(t * 0.03, t * 0.02);
  if (city.rideWater && city.rideWater.material.map) city.rideWater.material.map.offset.set(-t * 0.25, 0);
  if (city.lowerBeam) city.lowerBeam.material.opacity = 0.011 + Math.sin(t * 0.5) * 0.004;   // update 59: barely there - a brighter beam read as a pale wall from the east stair
  // update 65: once, when the floor's colliders exist: an apple that lies inside something (a planter, a bench, a trunk) is
  // nudged outward from its trunk until the player could stand on it
  if (city.groundApples && !city.groundApplesChecked && city.g && city.g.player) { city.groundApplesChecked = true; const yy = LW().y.park + 0.1; for (const tr of city.groundApples) for (const sl of tr.slots) { const dx = sl.a - tr.ta, dz = sl.b - tr.tb, L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L; for (let k = 0; k < 6; k++) { const [x, z] = cityWorld(sl.a, sl.b); const r = city.collide(x, z, 0.5, yy); if (Math.hypot(r.x - x, r.z - z) < 0.05) break; sl.a += ux * 1.2; sl.b += uz * 1.2; sl.mesh.position.set(sl.b, sl.mesh.position.y, sl.a); } } }
  if (city.groundApples) for (const tr of city.groundApples) { if (!tr.slots.some((sl) => sl.taken)) continue; if (t - tr.lastT < 120) continue; const sl = tr.slots.find((x) => x.taken); sl.taken = false; sl.gold = Math.random() < 0.01; sl.mesh.material = sl.gold ? city.groundAppleMats.gold : city.groundAppleMats.green; sl.mesh.scale.setScalar(1); tr.lastT = t; }   // update 64: one apple back every two minutes under a tree that lost some
  if (city.gemPulse) { city.gemPulse.mat.emissiveIntensity = 0.45 + 0.4 * (0.5 + 0.5 * Math.sin(t * 2.1)); city.gemPulse.mesh.rotation.y += 0.004; }   // update 58: the shop's crystal breathes light
}
// ---------------- the boat ride ----------------
export function startRide(city, dir) {
  const g = city.g, C = E(), S = STR.et;
  if (g.ride || !city.rideCurve) return;
  const boat = city.rideBoat; if (!boat) return;
  const from = dir > 0 ? city.boatUp : city.boatLow; if (from) from.visible = false;
  boat.visible = true;
  // update 53: two seconds of sailing toward the tunnel, a fade to black, and the picture returns with you in the boat at
  // the other jetty; a moment later you step off. (The whole 1200 m spiral is still there to look at as you go in.)
  g.ride = { dir, s: 0, len: city.rideLen, speed: C.lower.ride.speed, t: 0, phase: "sail" };
  g.menuOpen = false; g.sitting = false;
  g.ui.toast(dir > 0 ? S.boatLeaveDown : S.boatLeaveUp); g.audio.sSelect && g.audio.sSelect();
  placeBoat(city, g.ride, 0.0005);
  const p = g.player; const tw = tangentWorld(city, g.ride, dir > 0 ? 0.001 : 0.999, dir); p.yaw = Math.atan2(-tw.x, -tw.z); p.pitch = 0.05;
}
function tangentWorld(city, Rd, u, dir) {
  const t = city.rideCurve.getTangentAt(u).clone(); if (dir < 0) t.negate();
  const q = new THREE.Quaternion(); city.grp.getWorldQuaternion(q); return t.applyQuaternion(q).normalize();
}
function placeBoat(city, Rd, u) {
  const boat = city.rideBoat, curve = city.rideCurve;
  const pl = curve.getPointAt(u), pw = city.grp.localToWorld(pl.clone());
  const tw = tangentWorld(city, Rd, u, Rd.dir);
  boat.position.set(pw.x, pw.y + 0.15, pw.z);
  const yaw = Math.atan2(tw.x, tw.z) + (city.boatYawOff || 0);
  boat.rotation.set(0, yaw, 0); boat.rotateX(-Math.asin(Math.max(-0.6, Math.min(0.6, tw.y))));
  return pw;
}
export function updateRide(city, dt, input) {
  const g = city.g, Rd = g.ride, p = g.player, C = E(), L = LW(), S = STR.et, RC = C.lower.ride;
  if (!Rd) return;
  Rd.t += dt;
  const boat = city.rideBoat;
  if (Rd.phase === "sail") {
    Rd.s = Math.min(Rd.len, Rd.s + Rd.speed * dt * Math.min(1, Rd.t / 1.0));
    const u = Rd.dir > 0 ? Rd.s / Rd.len : 1 - Rd.s / Rd.len;
    placeBoat(city, Rd, Math.max(0.0005, Math.min(0.9995, u)));
    if (Rd.t >= RC.sail) { Rd.phase = "fade"; Rd.t = 0; g.ui.fade(true, RC.fade * 1000); }
  } else if (Rd.phase === "fade") {
    if (Rd.t >= RC.fade + 0.25) {
      const dest = Rd.dir > 0 ? city.boatLow : city.boatUp;
      if (dest) { boat.position.copy(dest.position); boat.rotation.copy(dest.rotation); dest.visible = false; }
      const tw = new THREE.Vector3(0, 0, 1).applyQuaternion(boat.quaternion); p.yaw = Math.atan2(-tw.x, -tw.z);
      Rd.phase = "arrive"; Rd.t = 0; g.ui.fade(false, RC.fade * 1000);
    }
  } else if (Rd.phase === "arrive") {
    if (Rd.t >= RC.arrive) {
      const J = Rd.dir > 0 ? city.lowerJetty : city.jettyUp, y = Rd.dir > 0 ? L.y.walk : C.levels.lower;
      const [x, z] = cityWorld(J.a, J.b); p.pos.set(x, y + 0.1, z);
      boat.visible = false; if (city.boatUp) city.boatUp.visible = true; if (city.boatLow) city.boatLow.visible = true;
      g.ride = null; g.ui.prompt(""); g.ui.toast(Rd.dir > 0 ? S.boatArriveDown : S.boatArriveUp);
      return;
    }
  }
  p.pos.set(boat.position.x, boat.position.y + 0.35, boat.position.z); p.vel && p.vel.set(0, 0, 0);
  p.yaw += (input.turn || 0) * 2.7 * dt; p.yaw -= input.look.dx * 0.0023; p.pitch = Math.max(-1.45, Math.min(1.45, p.pitch - input.look.dy * 0.0023)); input.look.dx = input.look.dy = 0;
  g.camera.position.set(p.pos.x, p.pos.y + 1.15, p.pos.z); g.camera.rotation.set(p.pitch, p.yaw, 0, "YXZ");
  g.ui.prompt(Rd.dir > 0 ? S.boatRidingDown : S.boatRidingUp);
}
