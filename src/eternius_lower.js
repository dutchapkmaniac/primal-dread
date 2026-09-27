import * as THREE from "three";
import { CFG } from "./config.js?v=54";
import { E, D2R, cityWorld } from "./eternius_frame.js?v=54";

// ============================================================================
// update 50: FLOOR -1 — the park under the city, 200 m down. The river leaves the ground floor through the
// court-side tunnel and spirals down through the rock to a second cavern the size of the first: a park round a
// golden fountain (drinkable), giant apple trees on soil beds, planters, benches, lamps; the river along the west
// on a walkway 12 m up (a jetty at its north end, a bridge across it); a lower gallery along the east 10 m down
// with the jail cells carved into its wall and the mine running out of its south end; the hospital and the
// buyable house carved into the walls; homes everywhere. Straight above the fountain a shaft climbs to the green
// glass ring round the altar, and the glass is this floor's light hole. Laid out from the user's Floor -1 map:
// map-up = +a, map-left = +b (theta +90).
// Everything here is built with the helpers eternius_build.js exposes on `city` (prims, mats, addLamppost, ...).
// ============================================================================
export function buildLower(city, grp) {
  const C = E(), LW = C.lower, Y = LW.y, R = C.wallR, TR = C.terraceR, A = city.g.assets, w = city.g.world, scene = city.g.scene;
  const { box, sector, cyl, pillar, archFrame, archWall, archShape } = city.prims;
  // update 51: floor -1's walls and colliders count only 200 m down (they used to block the entry stair upstairs), and its
  // models are listed so they draw only while you are down here
  const wallSeg = city.prims.wallSeg, obst = city.prims.obst;   // update 54: they carry city.wallY0..wallY1 — floor -1's range, or a room's own while it is carved
  city.lowerProps = city.lowerProps || [];
  const prop = (id, a, b, y, faceDeg, fb, scaleMul = 1) => { const m = city.prims.prop(id, a, b, y, faceDeg, fb, scaleMul); if (m && m.parent === scene) { city.lowerProps.push(m); m.visible = false; } return m; };   // hidden until you are down here
  const { sand, sandLit, rock, gold, goldPlain, goldBright, gem, dark, glowM, greenGlowM, carpetM, latticeM, waterMat } = city.mats;
  const rise = C.stairRise;
  const soilM = (rx, rz) => { const m = w.mat("t_soil", rx, rz, 0x3a2a1c); m.emissive = new THREE.Color(0x2a1e14); m.emissiveIntensity = 0.5; return m; };
  const pt = (r, th) => [r * Math.cos(th * D2R), r * Math.sin(th * D2R)];   // (a, b)
  const inW = (th) => th > LW.west.th0 && th < LW.west.th1, inEa = (th) => th > LW.east.th0 && th < LW.east.th1;
  city.keepExtra = city.keepExtra || [];

  // ---------------- the floors ----------------
  sector(0, TR, -180, 180, Y.park, sand(8, 8), 96);
  // the soil beds under the tree groups, a kerb of sandstone round each (a little ridge between the earth and the paving)
  for (const [t0, t1, r0, r1] of LW.beds) {
    sector(r0, r1, t0, t1, Y.park + 0.12, soilM(4, 4), 24);
    cyl(r0, t0, t1, Y.park, Y.park + 0.3, goldPlain, true, 16); cyl(r1, t0, t1, Y.park, Y.park + 0.3, goldPlain, false, 16);
    box(0.4, 0.3, r1 - r0, ...(() => { const [a, b] = pt((r0 + r1) / 2, t0); return [b, Y.park + 0.15, a]; })(), goldPlain, t0 * D2R - Math.PI / 2);
    box(0.4, 0.3, r1 - r0, ...(() => { const [a, b] = pt((r0 + r1) / 2, t1); return [b, Y.park + 0.15, a]; })(), goldPlain, t1 * D2R - Math.PI / 2);
    sector(r0 + 0.2, r1 - 0.2, t0 + 0.5, t1 - 0.5, Y.park + 0.28, soilM(4, 4), 24);
  }
  // the west walkway (12 m up) either side of the river, the river bed and the water; the east gallery (10 m down)
  sector(TR, LW.riverR0, LW.west.th0, LW.west.th1, Y.walk, sand(6, 6), 48); sector(LW.riverR1, R, LW.west.th0, LW.west.th1, Y.walk, sand(6, 6), 48);
  sector(LW.riverR0 - 0.2, LW.riverR1 + 0.2, LW.west.th0 - 0.3, LW.west.th1 + 0.3, Y.riverBed, rock(6, 2), 48);
  for (const [rr, ins] of [[LW.riverR0, true], [LW.riverR1, false]]) { const bm = sandLit((LW.west.th1 - LW.west.th0) * 0.4, 1); bm.side = THREE.DoubleSide; cyl(rr, LW.west.th0, LW.west.th1, Y.riverBed, Y.walk, bm, ins, 48); }   // update 53: sandstone banks, seen from the water and the walkway
  {
    const wm = waterMat(); wm.map && wm.map.repeat.set(8, 1);
    const m = sector(LW.riverR0, LW.riverR1, LW.west.th0, LW.west.th1, Y.water, wm, 64);
    const g2 = m.geometry, pp = g2.attributes.position, uv = g2.attributes.uv;
    for (let i = 0; i < pp.count; i++) { const x = pp.getX(i), z = pp.getZ(i), th = Math.atan2(x, z) / D2R, rr = Math.hypot(x, z); uv.setXY(i, (th - LW.west.th0) / (LW.west.th1 - LW.west.th0) * 9, (rr - LW.riverR0) / (LW.riverR1 - LW.riverR0)); }
    uv.needsUpdate = true; city.lowerRiver = m; city.keepExtra.push(m);
  }
  sector(TR, R, LW.east.th0, LW.east.th1, Y.low, sand(6, 6), 48);
  // the retaining walls between the park and the two bands (both faces lit sandstone), gold beams top and bottom
  const dthU = ((C.stairs.up.hw + 0.4) / TR) / D2R, dthD = ((C.stairs.down.hw + 0.4) / TR) / D2R;
  const face = (t0, t1, yLo, yHi, faceOut) => {
    if (t1 - t0 < 0.1) return;
    const m = cyl(TR, t0, t1, yLo, yHi, sandLit((t1 - t0) * 0.4, (yHi - yLo) * 0.25), false, Math.max(4, Math.round((t1 - t0) / 4))); m.material.side = THREE.DoubleSide;
    const rP = faceOut ? TR + 0.3 : TR - 0.3;
    cyl(rP, t0, t1, yHi - 0.55, yHi - 0.05, gold, !faceOut, 24); cyl(rP, t0, t1, yLo + 0.05, yLo + 0.55, gold, !faceOut, 24);
    for (let t = t0 + 5; t < t1 - 2; t += 10) { const [ca, cb] = pt(rP + (faceOut ? 0.05 : -0.05), t); box(0.7, yHi - yLo - 1.1, 0.7, cb, (yLo + yHi) / 2, ca, gold, t * D2R); const g2 = new THREE.Mesh(new THREE.OctahedronGeometry(0.3), gem); const [ga, gb] = pt(rP + (faceOut ? 0.5 : -0.5), t); g2.position.set(gb, yHi - 1.6, ga); grp.add(g2); }
  };
  // west: the wall goes UP from the park; a gap for the stair at +90 and the hospital's door at hospitalTh
  const HT = LW.hospitalTh, hd = ((C.room.doorHw + 0.6) / TR) / D2R;
  face(LW.west.th0, HT - hd, Y.park, Y.walk, false); face(HT + hd, LW.west.th1, Y.park, Y.walk, false);   // update 53: continuous behind the stair's top (the gap there showed the sky)
  face(HT - hd, HT + hd, Y.park + C.room.h + 0.6, Y.walk, false);   // over the hospital's door
  // east: the wall goes DOWN from the park; a gap for the trench stair at -90
  face(LW.east.th0, -90 - dthD - 0.15, Y.low, Y.park, false); face(-90 + dthD + 0.15, LW.east.th1, Y.low, Y.park, false);
  // the closed sectors (north, south): the rock rises straight from the park's edge — a wall you cannot pass
  for (const [t0, t1] of [[LW.east.th1, LW.west.th0], [LW.west.th1, LW.east.th0 + 360]]) {
    const n = Math.max(3, Math.round((t1 - t0) / 12));
    for (let i = 0; i < n; i++) { const ta = (t0 + (t1 - t0) * i / n) * D2R, tb = (t0 + (t1 - t0) * (i + 1) / n) * D2R; wallSeg(TR * Math.cos(ta), TR * Math.sin(ta), TR * Math.cos(tb), TR * Math.sin(tb), 0.5); }
  }
  // the band rails: the same rail as the terrace edge (collision is in eternius.js lowerCollide)

  // ---------------- the two staircases (the same treads as upstairs: up along +b, down along -b) ----------------
  const stone = sand(4, 4); if (stone.map) { stone.emissiveMap = stone.map; stone.emissive = new THREE.Color(0xffffff); stone.emissiveIntensity = 0.14; }
  for (const sgn of [1, -1]) {
    const ST = sgn > 0 ? C.stairs.up : C.stairs.down, y0 = Y.park, y1 = sgn > 0 ? Y.walk : Y.low;
    const n = Math.round(Math.abs(y1 - y0) / rise), rs = (y1 - y0) / n, run = (ST.r1 - ST.r0) / n;
    for (let i = 1; i <= n; i++) {
      const b0 = ST.r0 + run * (i - 1), y = y0 + rs * i, top = y, bottom = sgn > 0 ? y0 - 0.2 : y1 - 0.2, h = top - bottom;
      box(run + 0.02, h, ST.hw * 2, sgn * (b0 + run / 2), bottom + h / 2, 0, (sgn > 0 && i % 5 === 0) ? gold : stone);
      if (sgn > 0) box(0.12, 0.05, ST.hw * 2, sgn * (b0 + 0.06), top + 0.02, 0, goldPlain);
    }
    for (const s of [-1, 1]) {
      if (sgn > 0) city.lineFence(s * (ST.hw + 0.25), ST.r0, s * (ST.hw + 0.25), Math.min(ST.r1, TR - 0.4), y0, y1);
      wallSeg(s * (ST.hw + 0.1), sgn * ST.r0, s * (ST.hw + 0.1), sgn * Math.min(ST.r1, TR - 0.4), 0.2);
      if (sgn < 0) { const wm = sandLit(6, 3); wm.side = THREE.DoubleSide; const wl = new THREE.Mesh(new THREE.BoxGeometry(ST.r1 - ST.r0 + 0.4, y0 - y1 + 0.6, 0.6), wm); wl.position.set(-(ST.r0 + ST.r1) / 2, (y0 + y1) / 2, s * (ST.hw + 0.4)); grp.add(wl); }   // the trench walls
    }
    if (sgn > 0) { for (const bb of [ST.r0 - 1.2]) for (const s of [-1, 1]) pillar(sgn * bb, y0, s * (ST.hw + 0.9), 0.35, 3.2, gold); const bEnd = Math.min(ST.r1, TR - 0.4), slope = Math.atan2(y1 - y0, ST.r1 - ST.r0), len = (bEnd - ST.r0) / Math.cos(slope), bm = (ST.r0 + bEnd) / 2, ym = y0 + (y1 - y0) * (bm - ST.r0) / (ST.r1 - ST.r0) - 0.75; for (const s of [-1, 1]) { const sk = box(len, 1.4, 0.3, bm, ym, s * (ST.hw + 0.2), sandLit(Math.max(1, Math.round(len / 4)), 1)); sk.rotation.z = slope; } }
    for (const s of [-1, 1]) city.addTorchbearer(s * (ST.hw + 2.6), sgn * (ST.r0 - 2.2), y0, sgn > 0 ? -90 : 90);
  }

  // ---------------- the bridge over the river, the jetty, the river's two mouths ----------------
  {
    const BT = LW.bridgeTh, hw = C.riverBridgeHw, r0 = LW.riverR0 - 1.5, r1 = LW.riverR1 + 1.5, [ca, cb] = pt((r0 + r1) / 2, BT), ry = BT * D2R - Math.PI / 2;
    const N = 12; const deck = new THREE.Mesh(new THREE.BoxGeometry(r1 - r0, 0.5, hw * 2), sand(4, 2)); deck.position.set(cb, Y.walk + 0.2, ca); deck.rotation.y = ry; grp.add(deck);
    for (const s of [-1, 1]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(r1 - r0, 1.1, 0.16), gold); const [ra, rb] = pt((r0 + r1) / 2, BT + (s * (hw + 0.1) / ((r0 + r1) / 2)) / D2R); rail.position.set(rb, Y.walk + 0.95, ra); rail.rotation.y = ry; grp.add(rail); for (let k = 0; k <= N; k++) { const rr = r0 + (r1 - r0) * k / N, [pa, pb] = pt(rr, BT + (s * (hw + 0.1) / rr) / D2R); pillar(pb, Y.walk + 0.4, pa, 0.07, 0.8, goldPlain, false); } }
    for (const s of [-1, 1]) { const [pa, pb] = pt(s > 0 ? r1 + 0.8 : r0 - 0.8, BT); for (const t of [-1, 1]) { const [qa, qb] = pt(s > 0 ? r1 + 0.8 : r0 - 0.8, BT + (t * (hw + 0.8) / (s > 0 ? r1 : r0)) / D2R); pillar(qb, Y.walk, qa, 0.3, 2.6, gold); } }
    city.lowerBridge = { th: BT, hw };
    // the jetty: a stone pier from the inner walkway's edge out over the water, gold bollards, a lantern; the boat lies beside it
    const JT = LW.jettyTh, [ja, jb] = pt(LW.riverR0 + 1.8, JT), jry = JT * D2R - Math.PI / 2;
    const pier = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.6, 4.0), sand(2, 2)); pier.position.set(jb, Y.walk - 0.3, ja); pier.rotation.y = jry; grp.add(pier);   // update 53: level with the walkway
    for (const t of [-1, 1]) { const [qa, qb] = pt(LW.riverR0 + 3.4, JT + (t * 1.7 / LW.riverR0) / D2R); pillar(qb, Y.walk, qa, 0.16, 0.9, goldPlain); }
    { const [la, lb] = pt(LW.riverR0 - 1.2, JT + (2.6 / LW.riverR0) / D2R); city.addLantern(lb, Y.walk, la, false, true, 3.0); }
    city.lowerJetty = { a: ja, b: jb, th: JT, boatA: pt(LW.riverR0 + 4.6, JT)[0], boatB: pt(LW.riverR0 + 4.6, JT)[1], y: Y.water };
    { const [ba2, bb2] = pt(LW.riverR0 + 4.6, JT); city.boatLow = prop("et_boat", ba2, bb2, Y.water + 0.15, JT + 90 + (city.boatYawOff || 0) / D2R, () => { const gg = new THREE.Group(); gg.position.set(bb2, Y.water + 0.15, ba2); gg.rotation.y = (JT + 90) * D2R; grp.add(gg); const hull = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 6.0), sand(1, 3)); hull.position.y = 0.3; gg.add(hull); return gg; }); }
    // the mouths: an end wall with a pointed arch the water runs under, a short dark tunnel behind
    const mouth = (thd, sgn, tunnel = true) => {
      const rm = (LW.riverR0 + LW.riverR1) / 2, [ma, mb] = pt(rm, thd), mry = thd * D2R - Math.PI / 2, wd = LW.riverR1 - LW.riverR0 + 2.4, yB = Y.water - 0.5, W = 6.8, Hh = 6.2;
      box(wd, yB - Y.riverBed, 0.8, mb, (Y.riverBed + yB) / 2, ma, sand(3, 1), mry);
      archWall(mb, yB, ma, wd, Y.walk + 0.4 - yB, 0.8, W, Hh, sand(3, 2), mry);
      archFrame(mb, yB, ma, W, Hh, 0.5, 0.9, gold, mry);
      const tm = rock(2, 3); tm.side = THREE.BackSide;
      const segL = 5, n = tunnel ? 6 : 0, dth = segL / rm;
      for (let i = 0; i < n; i++) { const t = thd * D2R + sgn * dth * (i + 0.5), [ca2, cb2] = [rm * Math.cos(t), rm * Math.sin(t)]; const g2 = new THREE.ExtrudeGeometry(archShape(W, Hh + 0.2, 0, true), { depth: segL + 0.3, bevelEnabled: false }); g2.translate(0, -0.1, -(segL + 0.3) / 2); const gs = g2.groups.find((g) => g.materialIndex === 1) || { start: 0, count: g2.attributes.position.count }; const pick = (at) => new THREE.BufferAttribute(at.array.slice(gs.start * at.itemSize, (gs.start + gs.count) * at.itemSize), at.itemSize); const side = new THREE.BufferGeometry(); side.setAttribute("position", pick(g2.attributes.position)); side.setAttribute("normal", pick(g2.attributes.normal)); side.setAttribute("uv", pick(g2.attributes.uv)); const mm = new THREE.Mesh(side, tm); mm.position.set(cb2, yB, ca2); mm.rotation.y = t - Math.PI / 2; grp.add(mm); const wtr = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.2, segL + 0.4), waterMat()); wtr.rotation.x = -Math.PI / 2; wtr.rotation.z = 0; wtr.position.set(cb2, Y.water, ca2); wtr.rotation.y = t - Math.PI / 2; grp.add(wtr); city.keepExtra.push(wtr); }
    };
    mouth(LW.west.th1, 1);   // the south mouth: the water runs on into the dark
    mouth(LW.west.th0, -1, false);   // the north mouth: the spiral's tube comes in through it
  }

  // ---------------- the fountain (drinkable), its plaza ring, benches, lamps ----------------
  {
    const FR = LW.fountainR;
    cyl(FR, 0, 360, Y.park, Y.park + 0.9, gold, false, 48); cyl(FR - 0.6, 0, 360, Y.park + 0.5, Y.park + 0.95, goldPlain, true, 48);
    sector(FR - 0.6, FR, 0, 360, Y.park + 0.9, goldPlain, 48);
    { const wm = waterMat(); wm.map && wm.map.repeat.set(3, 3); const wtr = sector(0, FR - 0.6, 0, 360, Y.park + 0.7, wm, 48); city.lowerFount = wtr; city.keepExtra.push(wtr); }
    const model = prop("et_fountain", 0, 0, Y.park + 0.3, 0, () => { const gg = new THREE.Group(); gg.position.set(0, Y.park + 0.3, 0); grp.add(gg); for (const [rr, yy, h] of [[4.6, 0.6, 1.2], [3.2, 3.4, 1.0], [1.9, 5.6, 0.8]]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(rr, rr * 0.8, h, 16), gold); b.position.y = yy; gg.add(b); } const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 7.5, 10), goldPlain); stem.position.y = 3.6; gg.add(stem); const sp = new THREE.Mesh(new THREE.ConeGeometry(0.4, 3.0, 8), gold); sp.position.y = 8.6; gg.add(sp); const g2 = new THREE.Mesh(new THREE.OctahedronGeometry(0.6), gem); g2.position.y = 10.4; gg.add(g2); return gg; });
    city.lowerFountModel = model;
    city.emit(grp, 0, Y.park + 9.5, 0, 0x8cffb0, 6, 40, {});
    for (let k = 0; k < 4; k++) { const t = k * 90 + 45; const [a, b] = pt(FR + 1.2, t); city.emit(grp, b, Y.park + 1.6, a, 0xffd28a, 2.4, 22, {}); }
    sector(FR, FR + 8, 0, 360, Y.park + 0.02, sand(6, 6), 64); cyl(FR + 8, 0, 360, Y.park, Y.park + 0.12, goldPlain, false, 64);
    obst(0, 0, FR + 0.4);
    // eight lampposts round the plaza ring, six benches facing the water
    for (let k = 0; k < 8; k++) { const t = k * 45 + 22.5; const [a, b] = pt(FR + 7, t); city.addLamppost(a, b, Y.park, false); }
    const benchA = A.glb.et_bench || A.glb.bench;
    for (let k = 0; k < 6; k++) { const t = k * 60; const [a, b] = pt(FR + 4.2, t); if (benchA) { const bch = city.warmProp(benchA.model.clone()); const [x, z] = cityWorld(a, b); bch.position.set(x, Y.park, z); bch.rotation.y = C.grpYaw + t * D2R + Math.PI / 2; scene.add(bch); city.lowerProps.push(bch); bch.visible = false; } else box(2.4, 0.5, 0.8, b, Y.park + 0.25, a, sand(1, 1), t * D2R + Math.PI / 2); obst(a, b, 1.2); }
  }

  // ---------------- planters (hedges and flowers in gold-trimmed sandstone boxes), more benches, lamps ----------------
  {
    const hedgeM = w.mat("t_hedge", 6, 1, 0x2f6a2a), flowerM = w.mat("t_flowerbed", 6, 1, 0x7a3a5a);
    for (const [t0, t1] of LW.planters) {
      const r0 = LW.planterR - 1.6, r1 = LW.planterR + 1.6;
      sector(r0, r1, t0, t1, Y.park + 1.0, soilM(2, 2), 24);
      cyl(r0, t0, t1, Y.park, Y.park + 1.05, sand(6, 1), true, 24); cyl(r1, t0, t1, Y.park, Y.park + 1.05, sand(6, 1), false, 24);
      cyl(r0 - 0.15, t0, t1, Y.park + 0.9, Y.park + 1.12, goldPlain, true, 24); cyl(r1 + 0.15, t0, t1, Y.park + 0.9, Y.park + 1.12, goldPlain, false, 24);
      for (const t of [t0, t1]) { const [a, b] = pt(LW.planterR, t); box(0.5, 1.12, r1 - r0 + 0.3, b, Y.park + 0.56, a, sand(1, 1), t * D2R - Math.PI / 2); }
      const hm = sector(r0 + 0.7, r1 - 0.7, t0 + 1.5, t1 - 1.5, Y.park + 2.1, hedgeM, 24); hm.material.side = THREE.DoubleSide;
      cyl(r0 + 0.7, t0 + 1.5, t1 - 1.5, Y.park + 1.0, Y.park + 2.1, hedgeM, true, 24); cyl(r1 - 0.7, t0 + 1.5, t1 - 1.5, Y.park + 1.0, Y.park + 2.1, hedgeM, false, 24);
      for (const t of [t0 + 1.5, t1 - 1.5]) { const [a, b] = pt(LW.planterR, t); box(0.2, 1.1, r1 - r0 - 1.4, b, Y.park + 1.55, a, hedgeM, t * D2R - Math.PI / 2); }
      sector(r0 + 0.2, r0 + 0.7, t0 + 0.5, t1 - 0.5, Y.park + 1.02, flowerM, 24); sector(r1 - 0.7, r1 - 0.2, t0 + 0.5, t1 - 0.5, Y.park + 1.02, flowerM, 24);
      const n = Math.max(2, Math.round((t1 - t0) / 6));
      for (let i = 0; i < n; i++) { const ta = (t0 + (t1 - t0) * i / n) * D2R, tb = (t0 + (t1 - t0) * (i + 1) / n) * D2R; for (const rr of [r0 - 0.3, r1 + 0.3]) wallSeg(rr * Math.cos(ta), rr * Math.sin(ta), rr * Math.cos(tb), rr * Math.sin(tb), 0.3); }
      const benchA = A.glb.et_bench || A.glb.bench, tm = (t0 + t1) / 2;
      for (const dt of [-8, 8]) { const t = tm + dt, [a, b] = pt(r0 - 2.6, t); if (benchA) { const bch = city.warmProp(benchA.model.clone()); const [x, z] = cityWorld(a, b); bch.position.set(x, Y.park, z); bch.rotation.y = C.grpYaw + t * D2R + Math.PI / 2 + Math.PI; scene.add(bch); city.lowerProps.push(bch); bch.visible = false; } obst(a, b, 1.2); }
      { const [a, b] = pt(r1 + 2.4, tm); city.addLamppost(a, b, Y.park, false); }
    }
    // lamps along the park's edge, torch statues by the walls, flags on the walls
    for (let t = -180; t < 180; t += 24) { const [a, b] = pt(TR - 4.5, t); if (Math.abs(Math.abs(t) - 90) < 9) continue; city.addLamppost(a, b, Y.park, false); }
    for (let t = -180 + 12; t < 180; t += 36) { if (Math.abs(Math.abs(t) - 90) < 12 || Math.abs(t - LW.hospitalTh) < 8 || Math.abs(t - LW.houseTh) < 8) continue; const [a, b] = pt(TR - 2.2, t); city.addTorchbearer(a, b, Y.park, t + 180); }
    for (let t = -170; t < 180; t += 20) { if (inW(t) || inEa(t)) continue; const th = t * D2R; city.addPoleFlag((TR - 0.3) * Math.sin(th), Y.park + 9.2, (TR - 0.3) * Math.cos(th), t + 180, 0.9, 5.0); }
    for (let t = LW.west.th0 + 8; t < LW.west.th1 - 4; t += 22) city.addWallFlag(t, Y.walk + 9.2);
    for (let t = LW.east.th0 + 8; t < LW.east.th1 - 4; t += 22) city.addWallFlag(t, Y.low + 9.2);
    for (let t = LW.west.th0 + 6; t < LW.west.th1 - 4; t += 18) { const [a, b] = pt(R - 3.2, t); city.addLamppost(a, b, Y.walk, false); const [a2, b2] = pt(TR + 3.0, t + 9); if (t + 9 < LW.west.th1 - 3) city.addLamppost(a2, b2, Y.walk, false); }
    for (let t = LW.east.th0 + 10; t < LW.east.th1 - 4; t += 20) { if (Math.abs(t + 90) < 9 || Math.abs(t - LW.mineTh) < 9) continue; const [a, b] = pt(TR + 3.0, t); city.addLamppost(a, b, Y.low, false); }
  }

  // ---------------- the giant apple trees ----------------
  {
    const treeA = A.glb.et_bigtree;
    city.lowerTrees = [];
    for (const [t, rr] of LW.trees) {
      const [a, b] = pt(rr, t), yaw = (t * 7.3) % 360;
      const m = prop("et_bigtree", a, b, Y.park + 0.28, yaw, () => {
        const gg = new THREE.Group(); gg.position.set(b, Y.park + 0.28, a); grp.add(gg);
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.8, 14, 10), w.mat("t_bark", 2, 4, 0x5a3a22)); trunk.position.y = 7; gg.add(trunk);
        const crown = new THREE.Mesh(new THREE.SphereGeometry(9, 12, 10), new THREE.MeshStandardMaterial({ color: 0x3f8a2e, roughness: 0.9 })); crown.position.y = 19; crown.scale.y = 0.8; gg.add(crown);
        return gg;
      });
      // warm lantern light under the crown, a soft green glow in it
      city.emit(grp, b, Y.park + 9, a, 0xffc35a, 3.2, 26, {});
      obst(a, b, 3.0);
      city.lowerTrees.push({ a, b, th: t, r: rr, model: m });
    }
  }

  // ---------------- update 53: the homes - the same house fronts as upstairs along every wall of this floor ----------------
  if (city.facade) {
    const step = C.facadeStep / R / D2R, stepT = C.facadeStep / TR / D2R, YR = [-270, -150];
    const clear = (t, list) => list.every(([t0, t1]) => t < t0 || t > t1);
    const J = LW.jail, dJ = 5, dM = ((LW.mine.hw + 5) / R) / D2R, dS = 8, dR = 7;
    for (let t = LW.west.th0 + 6; t < LW.west.th1 - 5; t += step) if (clear(t, [[LW.west.th0 - 1, LW.west.th0 + 4], [LW.west.th1 - 4, LW.west.th1 + 1]])) city.facade(t, Y.walk, R, YR);
    for (let t = LW.east.th0 + 6; t < LW.east.th1 - 5; t += step) if (clear(t, [[J.th0 - dJ, J.th1 + dJ], [LW.mineTh - dM, LW.mineTh + dM], [LW.storeTh - dS, LW.storeTh + dS], [-90 - 9, -90 + 9]])) city.facade(t, Y.low, R, YR);
    for (let t = LW.east.th1 + 5; t < LW.west.th0 - 4; t += stepT) if (clear(t, [[LW.houseTh - dR, LW.houseTh + dR]])) city.facade(t, Y.park, TR, YR);
    for (let t = LW.west.th1 + 5; t < LW.east.th0 + 360 - 4; t += stepT) { const tt = t > 180 ? t - 360 : t; if (clear(tt, [[LW.hospitalTh - 9, LW.hospitalTh + 9]])) city.facade(tt, Y.park, TR, YR); }
  }
  // ---------------- the rooms carved into the walls: the hospital, the house for sale, the mining store, the jail ----------------
  const RM = C.room;
  city.lowerRooms = [];
  // a room off a wall of radius `wallR`, its door facing the heart, floor y; `kind` for the floor/inside checks
  const carve = (th, wallR, y, kind, depth, hw, h, opts = {}) => {
    const rad = [Math.cos(th * D2R), Math.sin(th * D2R)], tan = [-Math.sin(th * D2R), Math.cos(th * D2R)];
    const P = (u, v) => [wallR * rad[0] + u * rad[0] + v * tan[0], wallR * rad[1] + u * rad[1] + v * tan[1]];
    const ry = th * D2R, cu = depth / 2, [ca, cb] = P(cu, 0);
    const wy0 = city.wallY0, wy1 = city.wallY1; city.wallY0 = y - 1.5; city.wallY1 = y + h + 1.5;   // update 54: the room's walls count at the room's height only (the hospital lies under the walkway)
    box(hw * 2 + 1, 0.3, depth + 1.5, cb, y - 0.15, ca, sand(3, 3), ry);
    box(hw * 2 + 1, 0.4, depth + 1.5, cb, y + h + 0.2, ca, sand(3, 3), ry);
    for (const s of [-1, 1]) { const [sa, sb] = P(cu, s * (hw + 0.3)); box(0.6, h, depth + 1, sb, y + h / 2, sa, sand(2, 2), ry); const [q0a, q0b] = P(-0.5, s * hw), [q1a, q1b] = P(depth + 0.5, s * hw); wallSeg(q0a, q0b, q1a, q1b, 0.4); }
    { const [ba, bb] = P(depth + 0.3, 0); box(hw * 2 + 1, h, 0.6, bb, y + h / 2, ba, sand(2, 2), ry); const [q0a, q0b] = P(depth, -hw), [q1a, q1b] = P(depth, hw); wallSeg(q0a, q0b, q1a, q1b, 0.4); }
    const dw = opts.doorHw !== undefined ? opts.doorHw : RM.doorHw, dh = opts.doorH || 4.6;
    if (!opts.open) {
      const [fa, fb] = P(0, 0); archWall(fb, y, fa, hw * 2 + 1, h + 0.6, 0.7, dw * 2, dh, sand(2, 2), ry);
      for (const s of [-1, 1]) { const [q0a, q0b] = P(0, s * dw), [q1a, q1b] = P(0, s * hw); wallSeg(q0a, q0b, q1a, q1b, 0.35); }
      { const [fa2, fb2] = P(-0.25, 0); archFrame(fb2, y, fa2, dw * 2, dh, 0.4, 0.5, gold, ry); }
      { const [fa2, fb2] = P(0.2, hw - 1.3); box(0.3, 0.4, 0.3, fb2, y + 3.9, fa2, glowM); }
    }
    { const [ra, rb] = P(depth * 0.55, 0); box(hw * 1.4, 0.05, depth * 0.6, rb, y + 0.03, ra, carpetM(1.5, 1.5), ry); }
    city.addCeilingLamp(ca, cb, y + h, 1.2, !!opts.green);
    city.wallY0 = wy0; city.wallY1 = wy1;
    const room = { th, wallR, y, kind, depth, hw, h, P, ry, doorA: P(0, 0)[0], doorB: P(0, 0)[1], u: (a, b) => a * rad[0] + b * rad[1] - wallR, v: (a, b) => -a * rad[1] + b * rad[0] };
    city.lowerRooms.push(room);
    return room;
  };
  // the hospital: under the west walkway, off the park; three beds, the doctor's table
  {
    const rm = carve(LW.hospitalTh, TR, Y.park, "hospital", 11, 6.5, 5, { green: true });
    const hy0 = city.wallY0, hy1 = city.wallY1; city.wallY0 = Y.park - 1.5; city.wallY1 = Y.park + 6.5;   // update 54: its beds and table block nobody on the walkway above
    city.lowerBeds = [];
    for (let k = 0; k < 3; k++) { const [ba, bb] = rm.P(3.2 + k * 3.4, rm.hw - 1.6); prop("et_bed", ba, bb, Y.park, LW.hospitalTh + 90, () => { const gg = new THREE.Group(); gg.position.set(bb, Y.park, ba); gg.rotation.y = rm.ry + Math.PI / 2; grp.add(gg); const fr = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 3.4), gold); fr.position.y = 0.4; gg.add(fr); const mt = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.3, 3.2), new THREE.MeshStandardMaterial({ color: 0xe8e2d0 })); mt.position.y = 0.8; gg.add(mt); return gg; }); obst(ba, bb, 1.3); const [x, z] = cityWorld(ba, bb); city.lowerBeds.push({ x, z, y: Y.park + 0.9, a: ba, b: bb }); }
    { const [ta, tb] = rm.P(rm.depth * 0.5, -(rm.hw - 2.4)); if (A.glb.k_table) { const m = A.glb.k_table.model.clone(); const [x, z] = cityWorld(ta, tb); m.position.set(x, Y.park, z); m.rotation.y = C.grpYaw + rm.ry; scene.add(m); city.lowerProps.push(m); m.visible = false; } obst(ta, tb, 1.0); }
    for (const s of [-1, 1]) { const [pa, pb] = rm.P(-1.4, s * (rm.hw + 0.6)); pillar(pb, Y.park, pa, 0.35, 4.6, gold); }
    { const [fa, fb] = rm.P(-1.2, 0); const sign = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 0.2), new THREE.MeshStandardMaterial({ color: 0xf2eee6, emissive: 0xf2eee6, emissiveIntensity: 0.35 })); sign.position.set(fb, Y.park + 5.6, fa); sign.rotation.y = rm.ry; grp.add(sign); const crossM = new THREE.MeshStandardMaterial({ color: 0xd8302a, emissive: 0xd8302a, emissiveIntensity: 0.6 }); for (const [w2, h2] of [[1.1, 0.32], [0.32, 1.1]]) { const cr = new THREE.Mesh(new THREE.BoxGeometry(w2, h2, 0.08), crossM); cr.position.set(0, 0, -0.14); sign.add(cr); } }
    city.wallY0 = hy0; city.wallY1 = hy1;
    city.lowerHospital = rm; rm.npc = rm.P(rm.depth * 0.45, -(rm.hw - 2.4) + 2.2);
  }
  // the house for sale: a brown door (the only one), a bed and a storage chest behind it — the door stays shut until it is yours
  {
    const rm = carve(LW.houseTh, TR, Y.park, "house", RM.depth, RM.hw, RM.h, {});
    const [ba, bb] = rm.P(RM.depth - 2.4, -(RM.hw - 1.6));
    prop("et_bed", ba, bb, Y.park, LW.houseTh + 90, () => { const gg = new THREE.Group(); gg.position.set(bb, Y.park, ba); gg.rotation.y = rm.ry + Math.PI / 2; grp.add(gg); const fr = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 3.4), gold); fr.position.y = 0.4; gg.add(fr); return gg; }); obst(ba, bb, 1.3);
    const [sa, sb] = rm.P(RM.depth - 2.0, RM.hw - 1.8);
    prop("storagechest", sa, sb, Y.park, LW.houseTh + 180, () => { const ch = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 0.9), w.mat("t_darkwood", 1, 1, 0x4a3320)); ch.position.set(sb, Y.park + 0.45, sa); ch.rotation.y = rm.ry; grp.add(ch); return ch; }, 1.6); obst(sa, sb, 0.9);
    const [x, z] = cityWorld(rm.doorA, rm.doorB);
    // the door: brown wood, gold knob, a bar across it (it opens once bought — eternius.js)
    { const [da, db] = rm.P(0.15, 0); const door = new THREE.Mesh(new THREE.BoxGeometry(RM.doorHw * 2 - 0.1, 4.2, 0.25), w.mat("t_darkwood", 1, 2, 0x5a3a22)); door.position.set(db, Y.park + 2.1, da); door.rotation.y = rm.ry; grp.add(door); city.keepExtra.push(door); const knob = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), goldPlain); knob.position.set(0.8, 0, 0.18); door.add(knob); city.lowerHouse = { rm, door, x, z, seg: wallSeg(...rm.P(0, -RM.doorHw), ...rm.P(0, RM.doorHw), 0.3), chest: { a: sa, b: sb }, bed: { a: ba, b: bb } }; }
  }
  // the mining store: beside the mine's mouth on the east gallery, a counter inside, shelves of gems and picks
  {
    const rm = carve(LW.storeTh, R, Y.low, "store", 10, 5.5, 5.2, { doorHw: 2.2, doorH: 4.8 });
    { const [ca, cb] = rm.P(6.2, 0); box(6.0, 1.1, 1.3, cb, Y.low + 0.55, ca, sand(2, 1), rm.ry + Math.PI / 2); box(6.3, 0.14, 1.6, cb, Y.low + 1.17, ca, gold, rm.ry + Math.PI / 2); }
    { const [ca, cb] = rm.P(9.3, 0); box(8.0, 3.2, 0.35, cb, Y.low + 1.6, ca, sand(2, 1), rm.ry + Math.PI / 2); for (const yy of [1.4, 2.4]) box(7.6, 0.12, 0.6, cb, Y.low + yy, ca, goldPlain, rm.ry + Math.PI / 2); }
    for (const [u, v] of [[9.0, -2.4], [9.0, 0], [9.0, 2.4]]) { const [ga, gb] = rm.P(u, v); prop("et_emerald", ga, gb, Y.low + 1.5, LW.storeTh + 180, () => { const g2 = new THREE.Mesh(new THREE.OctahedronGeometry(0.35), gem); g2.position.set(gb, Y.low + 1.9, ga); grp.add(g2); return g2; }, 0.45); }
    wallSeg(...rm.P(6.2, -3.1), ...rm.P(6.2, 3.1), 0.7);
    city.lowerStore = rm; rm.npc = rm.P(8.0, 0);
  }
  // the jail: cells carved into the east gallery's outer wall, gold bars across their fronts, a stone bed in each
  {
    const J = LW.jail, n = J.cells, step = (J.th1 - J.th0) / n;
    city.lowerCells = [];
    for (let k = 0; k < n; k++) {
      const th = J.th0 + step * (k + 0.5);
      const rm = carve(th, R, Y.low, "cell", 7, 3.0, 4.6, { open: true });
      // the bars: gold rods every half metre across the front, top and bottom rails, a barred door that swings (locked — eternius.js)
      const [fa, fb] = rm.P(0.1, 0);
      for (let v = -rm.hw + 0.25; v <= rm.hw - 0.25; v += 0.5) { if (Math.abs(v) < 1.15) continue; const [pa, pb] = rm.P(0.1, v); pillar(pb, Y.low, pa, 0.06, 4.6, goldPlain, false); }
      box(rm.hw * 2 + 0.6, 0.18, 0.18, fb, Y.low + 4.55, fa, goldPlain, rm.ry + Math.PI / 2); box(rm.hw * 2 + 0.6, 0.18, 0.18, fb, Y.low + 0.09, fa, goldPlain, rm.ry + Math.PI / 2);
      for (const s of [-1, 1]) { const [q0a, q0b] = rm.P(0.1, s * 1.15), [q1a, q1b] = rm.P(0.1, s * rm.hw); wallSeg(q0a, q0b, q1a, q1b, 0.25); }
      const hinge = new THREE.Group(); { const [ha, hb] = rm.P(0.1, -1.15); hinge.position.set(hb, Y.low, ha); hinge.rotation.y = rm.ry; grp.add(hinge); }
      const gate = new THREE.Group(); hinge.add(gate); for (let v = 0.2; v < 2.3; v += 0.5) { const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4.3, 6), goldPlain); rod.position.set(v, 2.15, 0); gate.add(rod); } for (const yy of [0.25, 2.2, 4.2]) { const bar = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.14, 0.14), goldPlain); bar.position.set(1.15, yy, 0); gate.add(bar); }
      city.keepExtra.push(hinge);
      const seg = wallSeg(...rm.P(0.1, -1.15), ...rm.P(0.1, 1.15), 0.25);
      { const [ba, bb] = rm.P(5.4, -(rm.hw - 1.2)); box(2.0, 0.5, 3.2, bb, Y.low + 0.25, ba, sand(1, 1), rm.ry); box(1.8, 0.2, 2.9, bb, Y.low + 0.6, ba, w.mat("t_rug", 1, 1, 0x7a6a50), rm.ry); }
      { const [la, lb] = rm.P(6.5, rm.hw - 0.9); box(0.3, 0.4, 0.3, lb, Y.low + 3.6, la, glowM); }
      city.lowerCells.push({ rm, hinge, seg, open: 0, bedA: rm.P(5.4, -(rm.hw - 1.2))[0], bedB: rm.P(5.4, -(rm.hw - 1.2))[1], inA: rm.P(3.5, 0)[0], inB: rm.P(3.5, 0)[1] });
    }
    // two guards at the cells, a brazier between them
    { const [ba, bb] = pt(R - 5.0, (J.th0 + J.th1) / 2); city.addBrazier(bb, Y.low, ba, true); }
    city.lowerJailGuards = [pt(R - 4.0, J.th0 + 2), pt(R - 4.0, J.th1 - 2)];
  }

  // ---------------- the mine: a tunnel out of the east gallery, rails, carts, timber, emerald veins, lamps ----------------
  {
    const MT = LW.mineTh, M = LW.mine, hw = M.hw, h = M.h;
    // the tunnel bends to the right as it goes (the map): a curve out from the wall's mouth
    const [ma, mb] = pt(R - 1, MT), dir = [Math.cos(MT * D2R), Math.sin(MT * D2R)], tng = [-Math.sin(MT * D2R), Math.cos(MT * D2R)];
    const pts = []; for (let i = 0; i <= 6; i++) { const s = i / 6, d = M.len * s, bend = -18 * s * s; pts.push(new THREE.Vector3(mb + dir[1] * d + tng[1] * bend, Y.low, ma + dir[0] * d + tng[0] * bend)); }
    const path = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.5);
    const tunM = rock(3, 3); tunM.side = THREE.DoubleSide; if (tunM.map) { tunM.emissiveMap = tunM.map; tunM.emissive = new THREE.Color(0xffffff); tunM.emissiveIntensity = 0.3; }   // the swept tube is seen from inside
    // rough arch: walls straight up to h-1.8, a low arch on top
    const prof2 = [[-hw, -0.4], [-hw, h - 1.8]]; for (let i = 0; i <= 10; i++) { const t = i / 10; prof2.push([-hw * Math.cos(t * Math.PI), h - 1.8 + Math.sin(t * Math.PI) * 1.8]); } prof2.push([hw, -0.4]);
    const tube = sweep(path, prof2, 60, 0.9); const tm = new THREE.Mesh(tube, tunM); grp.add(tm);
    { const fm = new THREE.Mesh(sweep(path, [[-hw - 0.2, 0], [hw + 0.2, 0]], 60, 0.4), w.mat("t_gravel", 1, 12, 0x5a4a3a)); grp.add(fm); }
    city.lowerMine = { path, len: M.len, hw, h, th: MT };
    // the mouth in the gallery wall: a timber-and-gold portal
    { const [pa, pb] = pt(R - 1.6, MT); archFrame(pb, Y.low, pa, hw * 2 + 0.6, h - 0.4, 0.6, 0.9, gold, MT * D2R); for (const s of [-1, 1]) { const [qa, qb] = pt(R - 1.2, MT + (s * (hw + 1.4) / R) / D2R); pillar(qb, Y.low, qa, 0.4, h + 0.6, w.mat("t_darkwood", 1, 3, 0x4a3320)); city.addLantern(qb, Y.low + 0.0, qa, false, true, 3.0); } }
    // rails, timber props, lamps, emerald veins along the way; carts; the miners' spots
    const railM = goldPlain, timberM = w.mat("t_darkwood", 1, 3, 0x4a3320);
    city.lowerVeins = []; city.lowerMiners = [];
    const N = 30;
    for (let i = 0; i <= N; i++) {
      const s = i / N, p = path.getPointAt(s), t = path.getTangentAt(s), rt = new THREE.Vector3(t.z, 0, -t.x).normalize();   // right of travel (local x=b, z=a)
      const yaw = Math.atan2(t.x, t.z);
      if (i < N) { for (const side of [-1.0, 1.0]) { const q = p.clone().addScaledVector(rt, side * 0.75); const seg = path.getPointAt(Math.min(1, s + 1 / N)).sub(p); const L2 = seg.length(); const r2 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, L2 + 0.05), railM); r2.position.copy(q).add(seg.clone().multiplyScalar(0.5)); r2.position.y += 0.05; r2.rotation.y = yaw; grp.add(r2); } if (i % 2 === 0) { const sl = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.35), timberM); sl.position.copy(p); sl.position.y += 0.02; sl.rotation.y = yaw; grp.add(sl); } }
      if (i % 5 === 2) { for (const side of [-1, 1]) { const q = p.clone().addScaledVector(rt, side * (hw - 0.35)); const post = new THREE.Mesh(new THREE.BoxGeometry(0.45, h - 1.6, 0.45), timberM); post.position.copy(q); post.position.y += (h - 1.6) / 2; grp.add(post); } const beam = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 - 0.2, 0.45, 0.45), timberM); beam.position.copy(p); beam.position.y += h - 1.6; beam.rotation.y = yaw; grp.add(beam); const lq = p.clone().addScaledVector(rt, -(hw - 0.9)); city.addLantern(lq.x, Y.low + 0.6, lq.z, false, true, 3.2); }
      if (i % 3 === 1 && i > 2) { const side = (i % 2) ? 1 : -1; const q = p.clone().addScaledVector(rt, side * (hw - 0.6)); const [va, vb] = [q.z, q.x]; const m = prop("et_emerald", va, vb, Y.low + 0.6 + (i % 4) * 0.7, yaw / D2R + (side > 0 ? 90 : -90), () => { const g2 = new THREE.Mesh(new THREE.OctahedronGeometry(0.6), gem); g2.position.set(vb, Y.low + 1.2, va); grp.add(g2); return g2; }, 0.55); city.emit(grp, vb, Y.low + 1.6, va, 0x4fff8a, 1.4, 9, {}); city.lowerVeins.push({ a: va, b: vb, y: Y.low + 1.0, model: m, left: 3 }); }
      if (i === 9 || i === 21) { const yaw2 = yaw; prop("et_minecart", p.z, p.x, Y.low + 0.05, yaw2 / D2R, () => { const c = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.0, 2.0), dark); c.position.set(p.x, Y.low + 0.7, p.z); c.rotation.y = yaw2; grp.add(c); return c; }); obst(p.z, p.x, 1.2); }
      if (i === 6 || i === 15 || i === 25) { const side = i === 15 ? -1 : 1; const q = p.clone().addScaledVector(rt, side * (hw - 2.2)); city.lowerMiners.push({ a: q.z, b: q.x, face: yaw / D2R + (side > 0 ? 90 : -90) }); }
    }
    { const e = path.getPointAt(1); const cap = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 1, h + 1, 1), rock(2, 2)); cap.position.copy(e); cap.position.y += h / 2 - 0.2; const t = path.getTangentAt(1); cap.rotation.y = Math.atan2(t.x, t.z); grp.add(cap); }
    for (let i = 0; i < N; i++) { const p0 = path.getPointAt(i / N), p1 = path.getPointAt((i + 1) / N), t = p1.clone().sub(p0), rt = new THREE.Vector3(t.z, 0, -t.x).normalize(); for (const side of [-1, 1]) { const q0 = p0.clone().addScaledVector(rt, side * hw), q1 = p1.clone().addScaledVector(rt, side * hw); wallSeg(q0.z, q0.x, q1.z, q1.x, 0.3); } }
  }

  // ---------------- the cavern: the rock wall ring, the dome, the shaft up to the glass ----------------
  {
    const rockW = rock(24, 4); rockW.side = THREE.BackSide;
    const ring = (rr, t0, t1, y0, y1) => { if (t1 - t0 < 0.05 || y1 - y0 < 0.05) return; cyl(rr, t0, t1, y0, y1, rockW, true, Math.max(2, Math.round((t1 - t0) / 3.75))); };
    const wallTop = Y.park + C.wallTop + 4, apex = Y.park + C.cavernH + 4;
    // the outer ring (R) along the two bands with gaps for the cells, the store, the mine, the two mouths
    const gaps = [];
    for (const rm of city.lowerRooms) { if (rm.wallR !== R) continue; const d = ((rm.hw + 0.6) / R) / D2R; gaps.push([rm.th - d, rm.th + d, rm.y, rm.h + 0.7]); }
    { const d = ((LW.mine.hw + 1.0) / R) / D2R; gaps.push([LW.mineTh - d, LW.mineTh + d, Y.low, LW.mine.h + 0.8]); }
    { const d = ((LW.riverR1 - LW.riverR0) / 2 + 0.9) / ((LW.riverR0 + LW.riverR1) / 2) / D2R; for (const t of [LW.west.th0, LW.west.th1]) gaps.push([t - d, t + d, Y.riverBed - 2, Y.walk - (Y.riverBed - 2) + 0.4, "river"]); }   // narrower than the mouth's end wall: no sliver of sky beside it
    gaps.sort((p, q) => p[0] - q[0]);
    const spans = [[LW.west.th0 - 0.5, LW.west.th1 + 0.5, Y.riverBed - 4], [LW.east.th0, LW.east.th1, Y.low - 4]];   // update 53: each band's wall starts under ITS floor (the river's bed rose above the gallery)
    for (const [s0, s1, yBot] of spans) {
      let th = s0;
      for (const [g0, g1, yF, hD] of gaps) { if (g1 < s0 || g0 > s1) continue; if (g0 > th) ring(R, th, g0, yBot, wallTop); ring(R, g0, g1, yBot, yF - 0.3); ring(R, g0, g1, yF + hD, wallTop); th = g1; }
      if (th < s1) ring(R, th, s1, yBot, wallTop);
    }
    // the closed sectors: rock straight up from the park's edge at TR (gaps for the hospital and the house), a rock ledge out to R at the wall top
    const gapsT = city.lowerRooms.filter((rm) => rm.wallR === TR).map((rm) => { const d = ((rm.hw + 0.6) / TR) / D2R; return [rm.th - d, rm.th + d, rm.y, rm.h + 0.7]; }).sort((p, q) => p[0] - q[0]);
    for (const [s0, s1] of [[LW.east.th1, LW.west.th0], [LW.west.th1, LW.east.th0 + 360]]) {
      let th = s0;
      for (const [g0, g1, yF, hD] of gapsT) { const a0 = g0 < s0 - 180 ? g0 + 360 : g0, a1 = g1 < s0 - 180 ? g1 + 360 : g1; if (a1 < s0 || a0 > s1) continue; if (a0 > th) ring(TR, th, a0, Y.park - 1, wallTop); ring(TR, a0, a1, Y.park - 1, yF - 0.3); ring(TR, a0, a1, yF + hD, wallTop); th = a1; }
      if (th < s1) ring(TR, th, s1, Y.park - 1, wallTop);
      const ledge = sector(TR - 0.2, R + 0.2, s0, s1, wallTop - 0.2, rock(6, 2), 24); ledge.material.side = THREE.DoubleSide;
    }
    // the bands' four ends: a radial face of rock from TR out to R, floor to wall top (the sky showed through)
    for (const [t, yF] of [[LW.west.th0, Y.riverBed - 4], [LW.west.th1, Y.riverBed - 4], [LW.east.th0, Y.low - 4], [LW.east.th1, Y.low - 4]]) {
      const [ea, eb] = pt((TR + R) / 2, t); const em = rock(4, 6); em.side = THREE.DoubleSide; const ew = new THREE.Mesh(new THREE.BoxGeometry(R - TR + 0.6, wallTop - yF, 0.5), em); ew.position.set(eb, (wallTop + yF) / 2, ea); ew.rotation.y = t * D2R - Math.PI / 2; grp.add(ew);
      const [q0a, q0b] = pt(TR, t), [q1a, q1b] = pt(R, t); wallSeg(q0a, q0b, q1a, q1b, 0.4);
    }
    // the dome: the same lathe as upstairs, opening into the glass shaft (radius shaftR1) instead of the light hole
    const SR = LW.shaftR, pts = [], N = 16;
    for (let i = 0; i <= N; i++) { const t = i / N; const rr = R - (R - SR) * Math.sin(t * Math.PI / 2); const yy = wallTop + (apex - wallTop) * Math.sin(t * Math.PI / 2); pts.push(new THREE.Vector2(rr, yy)); }
    const domeGeo = new THREE.LatheGeometry(pts, 96);
    { const p = domeGeo.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), rr = Math.hypot(x, z), th2 = Math.atan2(x, z); if (rr < SR + 1) continue; const k = (rr - SR) / (R - SR); const nse = 1.6 * Math.sin(th2 * 5 + rr * 0.12) * Math.sin(y * 0.4 + th2 * 3) + 0.9 * Math.sin(th2 * 13 + rr * 0.3); const rim = Math.min(1, Math.max(0, (R - rr) / 12)); p.setY(i, y + nse * (0.4 + 0.6 * k) * Math.min(1, (rr - SR - 1) / 4) * rim); } domeGeo.computeVertexNormals(); }
    const dm = rock(24, 4); dm.side = THREE.BackSide; grp.add(new THREE.Mesh(domeGeo, dm));
    cyl(R - 0.3, -180, 180, wallTop - 0.9, wallTop + 1.1, rock(24, 1), true, 96);
    // the shaft: rock all the way up to the glass ring, gold bands every 25 m, a green beam of light down it
    const shaftTop = C.levels.plaza - 0.6;
    { const sm = rock(16, 30); sm.side = THREE.BackSide; cyl(SR, -180, 180, apex - 0.5, shaftTop, sm, true, 64); }
    for (let yy = apex + 10; yy < shaftTop - 5; yy += 25) cyl(SR - 0.15, -180, 180, yy, yy + 0.6, gold, true, 64);
    const beamM = new THREE.MeshBasicMaterial({ color: 0xa8ffc8, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(SR * 0.9, SR * 1.5, apex - Y.park + 6, 40, 1, true), beamM); beam.position.y = (apex + Y.park) / 2 + 2; grp.add(beam); city.keepExtra.push(beam); city.lowerBeam = beam;
    const pool = new THREE.Mesh(new THREE.CircleGeometry(SR * 1.3, 40), new THREE.MeshBasicMaterial({ color: 0xa0ffc0, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false })); pool.rotation.x = -Math.PI / 2; pool.position.y = Y.park + 0.96; grp.add(pool); city.keepExtra.push(pool);
    // the light itself: a green glow high in the shaft and a fill over the park
    city.emit(grp, 0, Y.park + 40, 0, 0x9cffb0, 14, 120, {});
  }

  // ---------------- the spiral: the river's way down from the court-side tunnel to the jetty ----------------
  {
    const H = LW.helix, W = C.culvert.w - 1.2, Hh = C.culvert.h;
    const rm = (C.riverR0 + C.riverR1) / 2, thEnd = C.riverTh.th1 + (C.culvert.depth / rm) / D2R, yB = C.levels.water - 0.5;
    const drop = (d) => -d / 30;   // the court-side tunnel's own grade
    const P = [];   // [a, b, y] — y is the WATER line
    const jettyG = city.jettyUp;   // the ground-floor jetty (built in eternius_build.js)
    P.push([jettyG.boatA, jettyG.boatB, C.levels.water]);
    for (const t of [C.riverTh.th1 - 1.5, C.riverTh.th1 + 6, C.riverTh.th1 + 16, C.riverTh.th1 + 28, C.riverTh.th1 + 40]) { const d = Math.max(0, (t - C.riverTh.th1) * D2R * rm); P.push([rm * Math.cos(t * D2R), rm * Math.sin(t * D2R), C.levels.water + drop(d)]); }
    const endY = C.levels.water + drop(C.culvert.depth);
    P.push([rm * Math.cos(thEnd * D2R), rm * Math.sin(thEnd * D2R), endY]);
    P.push([118, -2, endY - 2.5]); P.push([128, 26, endY - 6]);
    const phi0 = Math.PI, phi1 = Math.PI - 2 * Math.PI * H.turns, y0 = H.yTop, y1 = H.yBot, NS = Math.round(H.turns * 24);
    for (let i = 0; i <= NS; i++) { const s = i / NS, phi = phi0 + (phi1 - phi0) * s; P.push([H.ca + H.r * Math.cos(phi), H.cb + H.r * Math.sin(phi), y0 + (y1 - y0) * s]); }
    const [m0a, m0b] = pt(R + 14, LW.west.th0 - 4), [m1a, m1b] = pt(R - 1.5, LW.west.th0 + 0.3), [m2a, m2b] = pt((LW.riverR0 + LW.riverR1) / 2, LW.west.th0 + 3);
    P.push([m0a, m0b, Y.water + 1.0]); P.push([m1a, m1b, Y.water + 0.2]); P.push([m2a, m2b, Y.water]);
    P.push([city.lowerJetty.boatA, city.lowerJetty.boatB, Y.water]);
    const curve = new THREE.CatmullRomCurve3(P.map(([a, b, y]) => new THREE.Vector3(b, y, a)), false, "catmullrom", 0.3);
    city.rideCurve = curve; city.rideLen = curve.getLength();
    // the tube: from the court tunnel's end to the north mouth — rock, a water strip, cage lamps every 22 m
    const tunM = rock(4, 4); tunM.side = THREE.DoubleSide; if (tunM.map) { tunM.emissiveMap = tunM.map; tunM.emissive = new THREE.Color(0xffffff); tunM.emissiveIntensity = 0.34; }   // lit by its own texture: a lamp every 12 m is not enough in a spiral
    const prof = [[-W / 2, -1.4], [-W / 2, 0]]; { const N = 12; for (let i = 0; i <= N; i++) { const t = i / N; prof.push([-W / 2 * Math.cos(t * Math.PI), Hh * Math.sin(t * Math.PI) * 0.62 + (1 - Math.abs(Math.cos(t * Math.PI))) * Hh * 0.38]); } } prof.push([W / 2, 0], [W / 2, -1.4]);
    // find the parameter where the court tunnel ends (its last point is P[6]) and where the north mouth is (P[len-3])
    const uOf = (idx) => { const target = curve.points[idx]; let best = 0, bd = 1e9; for (let i = 0; i <= 400; i++) { const u = i / 400, q = curve.getPointAt(u); const d = q.distanceTo(target); if (d < bd) { bd = d; best = u; } } return best; };
    const uStart = uOf(6) - 0.004, uEnd = uOf(P.length - 3);   // from the court tunnel's end to just inside the north mouth
    const tube = sweepU(curve, prof, uStart, uEnd, Math.round(city.rideLen * (uEnd - uStart) / 4), 1.0, 0.0);
    grp.add(new THREE.Mesh(tube, tunM));
    { const wm = waterMat(); wm.map && wm.map.repeat.set(1, 1); const strip = sweepU(curve, [[-W / 2 + 0.1, 0.0], [W / 2 - 0.1, 0.0]], uStart, uEnd, Math.round(city.rideLen * (uEnd - uStart) / 4), 0.25, 0); const sm = new THREE.Mesh(strip, wm); grp.add(sm); city.keepExtra.push(sm); city.rideWater = sm; }
    const nL = Math.round(city.rideLen * (uEnd - uStart) / 12);
    for (let i = 1; i < nL; i++) { const u = uStart + (uEnd - uStart) * i / nL, p = curve.getPointAt(u), t = curve.getTangentAt(u), rt = new THREE.Vector3(t.z, 0, -t.x).normalize(), side = i % 2 ? 1 : -1; const q = p.clone().addScaledVector(rt, side * (W / 2 - 0.45)); const cage = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.55, 0.4), goldPlain); cage.position.set(q.x, q.y + 3.0, q.z); grp.add(cage); const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.2), gem); core.position.copy(cage.position); grp.add(core); city.emit(grp, q.x, q.y + 3.0, q.z, 0xffc35a, 3.0, 18, {}); }
    city.rideU = { start: 0, end: 1 };
  }
}

// a profile (2D points [x right, y up] in the plane across the path) swept along a curve between u0..u1 with the
// world up as the frame's up (a helix's own Frenet frame would roll the profile). uScale/vScale: metres per texture
export function sweepU(curve, prof, u0, u1, steps, uScale = 1.0, vOff = 0) {
  const pos = [], uv = [], idx = [];
  const up = new THREE.Vector3(0, 1, 0);
  let dist = 0, prev = null;
  for (let i = 0; i <= steps; i++) {
    const u = u0 + (u1 - u0) * i / steps, p = curve.getPointAt(u), t = curve.getTangentAt(u);
    const rt = new THREE.Vector3().crossVectors(t, up).normalize(); if (rt.lengthSq() < 1e-6) rt.set(1, 0, 0);
    const upp = new THREE.Vector3().crossVectors(rt, t).normalize();
    if (prev) dist += p.distanceTo(prev); prev = p;
    let vlen = 0;
    for (let k = 0; k < prof.length; k++) {
      const [px, py] = prof[k]; const q = p.clone().addScaledVector(rt, px).addScaledVector(upp, py);
      if (k > 0) vlen += Math.hypot(prof[k][0] - prof[k - 1][0], prof[k][1] - prof[k - 1][1]);
      pos.push(q.x, q.y, q.z); uv.push(dist * uScale / 4, vlen / 4 + vOff);
    }
  }
  const n = prof.length;
  for (let i = 0; i < steps; i++) for (let k = 0; k < n - 1; k++) { const a = i * n + k, b = a + 1, c = a + n, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
export function sweep(curve, prof, steps, uScale = 1.0) { return sweepU(curve, prof, 0, 1, steps, uScale, 0); }
