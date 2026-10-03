import * as THREE from "three";
import { CFG } from "./config.js?v=78";
const VEIN_BURY = { et_vein1: 0.5, et_vein3: 0.3, et_vein2: 0.8 };   // update 60: how much of each vein model's height sits inside the rock (its grey base); vein1 = the double crystal, vein3 = a single spike with a tall base, vein2 = a slab with crystals along its edges (not used on the walls - its grey face shows whichever way it is turned)
import { E, D2R, cityWorld } from "./eternius_frame.js?v=78";

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
  {   // update 55: the park floor is notched over the trench of the east stair (it ran flat across the treads)
    const SE = LW.stairETh * D2R, SD = C.stairs.down, yh = SD.hw + 0.25, u0 = SD.r0 - 0.05, ur = Math.sqrt(TR * TR - yh * yh);
    const Q = (u, v) => [u * Math.cos(SE) - v * Math.sin(SE), u * Math.sin(SE) + v * Math.cos(SE)];   // (a, b)
    const S = (u, v) => { const [a, b] = Q(u, v); return [b, -a]; };   // shape x = b, shape y = -a
    const [x1, y1] = S(u0, -yh), [x2, y2] = S(ur, -yh), [x3, y3] = S(ur, yh), [x4, y4] = S(u0, yh);
    let sa = Math.atan2(y2, x2), ea = Math.atan2(y3, x3); let span = ea - sa; while (span < 0) span += Math.PI * 2; const long = span > Math.PI;
    const shp = new THREE.Shape(); shp.moveTo(x1, y1); shp.lineTo(x2, y2); shp.absarc(0, 0, TR, sa, ea, !long); shp.lineTo(x4, y4); shp.closePath();
    const geo = new THREE.ShapeGeometry(shp, 64); { const uv = geo.attributes.uv, pp = geo.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, pp.getX(i) / 7, pp.getY(i) / 7); }
    const fl = new THREE.Mesh(geo, sand(1, 1)); fl.material.side = THREE.DoubleSide; fl.rotation.x = -Math.PI / 2; fl.position.y = Y.park; fl.receiveShadow = true; grp.add(fl);
  }
  // the soil beds under the tree groups, a kerb of sandstone round each (a little ridge between the earth and the paving)
  for (const [t0, t1, r0, r1] of LW.beds) {
    sector(r0, r1, t0, t1, Y.park + 0.12, soilM(4, 4), 24);
    // update 55: a golden beam round the soil, a green gem every few metres — you can walk on the earth, but it reads as not meant for it
    cyl(r0, t0, t1, Y.park, Y.park + 0.45, gold, true, 24); cyl(r1, t0, t1, Y.park, Y.park + 0.45, gold, false, 24); cyl(r0 - 0.25, t0, t1, Y.park, Y.park + 0.45, gold, false, 24); cyl(r1 + 0.25, t0, t1, Y.park, Y.park + 0.45, gold, true, 24);
    sector(r0 - 0.25, r0, t0, t1, Y.park + 0.45, goldPlain, 24); sector(r1, r1 + 0.25, t0, t1, Y.park + 0.45, goldPlain, 24);
    for (const t of [t0, t1]) { const [a, b] = pt((r0 + r1) / 2, t); box(0.5, 0.45, r1 - r0 + 0.5, b, Y.park + 0.22, a, gold, t * D2R); for (const rr of [r0 + 4, (r0 + r1) / 2, r1 - 4]) { const [ga, gb] = pt(rr, t); const g2 = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), gem); g2.position.set(gb, Y.park + 0.55, ga); grp.add(g2); } }   // update 60: ALONG the soil's edge - they lay across it, half on the earth and half on the paving - with gems like the arcs
    for (const rr of [r0 - 0.12, r1 + 0.12]) for (let t = t0 + 2; t < t1 - 1; t += 4) { const [a, b] = pt(rr, t); const g2 = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), gem); g2.position.set(b, Y.park + 0.55, a); grp.add(g2); }
    sector(r0 + 0.2, r1 - 0.2, t0 + 0.5, t1 - 0.5, Y.park + 0.28, soilM(4, 4), 24);
  }
  // the west walkway (12 m up) either side of the river, the river bed and the water; the east gallery (10 m down)
  sector(TR, LW.riverR0, LW.west.th0, LW.west.th1, Y.walk, sand(6, 6), 48); sector(LW.riverR1, R, LW.west.th0, LW.west.th1, Y.walk, sand(6, 6), 48);
  sector(LW.riverR0 - 0.2, LW.riverR1 + 0.2, LW.west.th0 - 0.3, LW.west.th1 + 0.3, Y.riverBed, rock(6, 2), 48);
  for (const [rr, ins] of [[LW.riverR0, true], [LW.riverR1, false]]) { const bm = sandLit((LW.west.th1 - LW.west.th0) * 0.4, 1); const bk = cyl(rr, LW.west.th0, LW.west.th1, Y.riverBed, Y.walk, bm, ins, 48); bk.material.side = THREE.DoubleSide; }   // update 57: BOTH faces (cyl's inside clone was back-face only: a see-through strip along the inner bank)   // update 53: sandstone banks, seen from the water and the walkway
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
  face(LW.east.th0, LW.stairETh - dthD - 0.15, Y.low, Y.park, false); face(LW.stairETh + dthD + 0.15, LW.east.th1, Y.low, Y.park, false);   // update 55: the trench at stairETh
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
    // update 55: the up stair runs along +b (90 deg) as upstairs; the trench stair sits at stairETh, where the map has it
    const SE = sgn > 0 ? 90 * D2R : LW.stairETh * D2R, Q = (u, v) => [u * Math.cos(SE) - v * Math.sin(SE), u * Math.sin(SE) + v * Math.cos(SE)];   // (a, b): u out along the stair, v across it
    for (let i = 1; i <= n; i++) {
      const u0 = ST.r0 + run * (i - 1), y = y0 + rs * i, top = y, bottom = sgn > 0 ? y0 - 0.2 : y1 - 0.2, h = top - bottom;
      const [ta, tb] = Q(u0 + run / 2, 0); box(ST.hw * 2, h, run + 0.02, tb, bottom + h / 2, ta, (sgn > 0 && i % 5 === 0) ? gold : stone, SE);
      if (sgn > 0) { const [na, nb] = Q(u0 + 0.06, 0); box(ST.hw * 2, 0.05, 0.12, nb, top + 0.02, na, goldPlain, SE); }
    }
    const uEnd = Math.min(ST.r1, TR - 0.4);
    for (const sd of [-1, 1]) {
      const [f0a, f0b] = Q(ST.r0, sd * (ST.hw + 0.25)), [f1a, f1b] = Q(uEnd, sd * (ST.hw + 0.25));
      if (sgn > 0) city.lineFence(f0a, f0b, f1a, f1b, y0, y1);
      const [w0a, w0b] = Q(ST.r0, sd * (ST.hw + 0.1)), [w1a, w1b] = Q(uEnd, sd * (ST.hw + 0.1)); wallSeg(w0a, w0b, w1a, w1b, 0.2);
      if (sgn < 0) { const wm = sandLit(6, 3); wm.side = THREE.DoubleSide; const [wa, wb] = Q((ST.r0 + ST.r1) / 2, sd * (ST.hw + 0.4)); const wl = new THREE.Mesh(new THREE.BoxGeometry(0.6, y0 - y1 + 0.6, ST.r1 - ST.r0 + 0.4), wm); wl.position.set(wb, (y0 + y1) / 2, wa); wl.rotation.y = SE; grp.add(wl); }   // the trench walls
    if (sgn < 0) { const [ra, rb] = Q(ST.r0 - 0.12, 0); box(ST.hw * 2 + 0.6, Math.abs(rs) + 0.14, 0.32, rb, y0 + rs / 2 - 0.02, ra, stone, SE); }   // update 59: the riser under the park's edge (the top step showed a slit of sky)
    }
    if (sgn > 0) { for (const sd of [-1, 1]) { const [pa, pb] = Q(ST.r0 - 1.2, sd * (ST.hw + 0.9)); pillar(pb, y0, pa, 0.35, 3.2, gold); } const slope = Math.atan2(y1 - y0, ST.r1 - ST.r0), len = (uEnd - ST.r0) / Math.cos(slope), um = (ST.r0 + uEnd) / 2, ym = y0 + (y1 - y0) * (um - ST.r0) / (ST.r1 - ST.r0) - 0.75; for (const sd of [-1, 1]) { const [ka, kb] = Q(um, sd * (ST.hw + 0.2)); const sk = box(0.3, 1.4, len, kb, ym, ka, sandLit(Math.max(1, Math.round(len / 4)), 1), SE); sk.rotation.order = "YXZ"; sk.rotation.x = -slope; } }
    for (const sd of [-1, 1]) { const [ta, tb] = Q(ST.r0 - 2.2, sd * (ST.hw + 2.6)); city.addTorchbearer(ta, tb, y0, SE / D2R); }
  }

  // ---------------- the bridge over the river, the jetty, the river's two mouths ----------------
  {
    // update 55: the same arched bridge as upstairs — a boat passes under it
    const BT = LW.bridgeTh, hw = C.riverBridgeHw, rb0 = LW.riverR0 - 3, rb1 = LW.riverR1 + 3, N = 12, arch = C.riverBridgeArch, th = BT * D2R;
    const rad = [Math.cos(th), Math.sin(th)], tan = [-Math.sin(th), Math.cos(th)];
    const AT = (rr, t) => [rr * rad[0] + t * tan[0], rr * rad[1] + t * tan[1]];
    const yAt = (rr) => Y.walk + arch * Math.sin((rr - rb0) / (rb1 - rb0) * Math.PI);
    const tilted = (wd, h, rA, rB, yA, yB, t, m) => { const segL = Math.hypot(rB - rA, yB - yA), mm = new THREE.Mesh(new THREE.BoxGeometry(wd, h, segL + 0.04), m); const [pa, pb] = AT((rA + rB) / 2, t); mm.position.set(pb, (yA + yB) / 2, pa); mm.rotation.order = "YXZ"; mm.rotation.y = th; mm.rotation.x = Math.asin((yA - yB) / segL); mm.castShadow = mm.receiveShadow = true; grp.add(mm); return mm; };
    for (let i = 0; i < N; i++) {
      const rA = rb0 + (rb1 - rb0) * i / N, rB = rb0 + (rb1 - rb0) * (i + 1) / N, yA = yAt(rA) - 0.2, yB = yAt(rB) - 0.2;
      tilted(hw * 2 + 0.4, 0.4, rA, rB, yA, yB, 0, sand(2, 1));
      for (const sg of [-1, 1]) { tilted(0.36, 0.5, rA, rB, yA + 0.35, yB + 0.35, sg * (hw + 0.02), gold); tilted(0.18, 0.16, rA, rB, yA + 1.7, yB + 1.7, sg * (hw + 0.05), goldPlain); tilted(0.14, 0.12, rA, rB, yA + 1.05, yB + 1.05, sg * (hw + 0.05), goldPlain); }
    }
    for (let k = 0; k <= 10; k++) { const rr = rb0 + (rb1 - rb0) * k / 10, yy = yAt(rr); for (const sg of [-1, 1]) { const [pa, pb] = AT(rr, sg * (hw + 0.05)); box(0.22, 1.7, 0.22, pb, yy + 0.85, pa, goldPlain, th); if (k % 5 === 0) { const gm = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), gem); gm.position.set(pb, yy + 1.85, pa); grp.add(gm); } } }
    for (const sg of [-1, 1]) for (const e of [rb0 - 0.6, rb1 + 0.6]) { const [pa, pb] = AT(e, sg * (hw + 0.6)); pillar(pb, Y.walk, pa, 0.3, 2.6, gold); }
    for (const sg of [-1, 1]) { const [q0a, q0b] = AT(rb0, sg * (hw + 0.2)), [q1a, q1b] = AT(rb1, sg * (hw + 0.2)); wallSeg(q0a, q0b, q1a, q1b, 0.2); }
    city.lowerBridge = { th: BT, hw, r0: rb0, r1: rb1, arch };
    // the jetty: a stone pier from the inner walkway's edge out over the water, gold bollards, a lantern; the boat lies beside it
    const JT = LW.jettyTh, [ja, jb] = pt(LW.riverR0 + 1.8, JT), jry = JT * D2R - Math.PI / 2;
    const pier = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.6, 4.0), sand(2, 2)); pier.position.set(jb, Y.walk - 0.3, ja); pier.rotation.y = jry; grp.add(pier);   // update 53: level with the walkway
    for (const t of [-1, 1]) { const [qa, qb] = pt(LW.riverR0 + 3.4, JT + (t * 1.7 / LW.riverR0) / D2R); pillar(qb, Y.walk, qa, 0.16, 0.9, goldPlain); }
    { const [la, lb] = pt(LW.riverR0 - 1.6, JT + (3.2 / LW.riverR0) / D2R); city.addLamppost(la, lb, Y.walk, false); }   // update 55: a real lamppost by the jetty (the box lantern stood there)
    city.lowerJetty = { a: ja, b: jb, th: JT, boatA: pt(LW.riverR0 + 4.6, JT)[0], boatB: pt(LW.riverR0 + 4.6, JT)[1], y: Y.water };
    { const [ba2, bb2] = pt(LW.riverR0 + 4.6, JT); city.boatLow = prop("et_boat", ba2, bb2, Y.water + 0.15, JT + 90 + (city.boatYawOff || 0) / D2R, () => { const gg = new THREE.Group(); gg.position.set(bb2, Y.water + 0.15, ba2); gg.rotation.y = (JT + 90) * D2R; grp.add(gg); const hull = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 6.0), sand(1, 3)); hull.position.y = 0.3; gg.add(hull); return gg; }); }
    // update 55: the river's two tunnels — the same as upstairs: the end wall flush with the band's end, a pointed golden
    // arch springing from the water, a sandstone-lined tunnel curving on with the river's arc, gold bands along its walls,
    // lamps for the first 18 m. The north one is open at its end: the boat's spiral joins it there
    // update 59: the ground floor's culvert, ported whole: graded (grade +1 the water comes DOWN to you, -1 it runs away
    // downhill), 60 m along the river's arc so the end is round the bend, and NO beam across the top - the bow alone
    city.lowerCulvert = (thd, sgn, depth, open, grade = 0) => {
      const th = thd * D2R, rm = (LW.riverR0 + LW.riverR1) / 2, CV = C.culvert;
      const ca = rm * Math.cos(th), cb = rm * Math.sin(th), ry = th - Math.PI / 2;
      const wd = LW.riverR1 - LW.riverR0 + 2.4, yB = Y.water - 0.5, W = CV.w - 1.2, Hh = CV.h, yTop = Y.walk + 0.4;
      box(wd, yB - (Y.riverBed - 1), 0.8, cb, (Y.riverBed - 1 + yB) / 2, ca, sand(3, 1), ry);
      archWall(cb, yB, ca, wd, Math.max(Hh + 0.4, yTop - yB), 0.8, W, Hh, sand(3, 2), ry);
      archFrame(cb, yB, ca, W, Hh, 0.5, 0.9, gold, ry);
      const segL = 5, nSeg = Math.round(depth / segL), slope = grade * Math.atan2(1.0, 30), dth = segL / rm;
      const tunM = sand(2, 3); tunM.side = THREE.BackSide; if (tunM.map) { tunM.emissiveMap = tunM.map; tunM.emissive = new THREE.Color(0xffffff); tunM.emissiveIntensity = 0.14; }   // update 60: a little self-lit - the black past the last lamp read as a dead end
      const tw = waterMat(); tw.map && tw.map.repeat.set(2, 3);
      const segGeo = (() => { const ex = new THREE.ExtrudeGeometry(archShape(W, Hh + 0.2, 0, true), { depth: segL + 0.3, bevelEnabled: false }); ex.translate(0, -0.1, -(segL + 0.3) / 2); const gs = ex.groups.find((g) => g.materialIndex === 1) || { start: 0, count: ex.attributes.position.count }; const pick = (at) => new THREE.BufferAttribute(at.array.slice(gs.start * at.itemSize, (gs.start + gs.count) * at.itemSize), at.itemSize); const g2 = new THREE.BufferGeometry(); g2.setAttribute("position", pick(ex.attributes.position)); g2.setAttribute("uv", pick(ex.attributes.uv)); const uv = g2.attributes.uv, pp = g2.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, (pp.getX(i) + pp.getZ(i)) / 3, pp.getY(i) / 3); g2.computeVertexNormals(); g2.computeBoundingSphere(); return g2; })();
      const bandGeo = new THREE.BoxGeometry(0.2, 0.3, segL + 0.3), waterGeo = new THREE.PlaneGeometry(W - 0.2, segL + 0.3);
      const segAt = (k) => { const t = th + sgn * (k + 0.5) * dth, u = (k + 0.5) * segL; return { t, u, a: rm * Math.cos(t), b: rm * Math.sin(t), y: yB + Math.tan(slope) * u, ry: t - Math.PI / 2 + (sgn > 0 ? Math.PI : 0) }; };
      // update 60: past 30 m the tunnel fades to black the way the mine does - the walls, the gold bands and the water darken
      // segment by segment - and a black cap closes the end. A tunnel bending round this ring hides its end only after ~75 m
      // of arc, and both ends are as far as the rock allows (the house, the east gallery), so the dark does the rest. The north
      // cap sits where the spiral's tube joins: the boat ride fades to black long before it gets there
      const fadeAt = (u) => u < 30 ? 1 : Math.pow(Math.max(0, 1 - (u - 30) / Math.max(1, depth - 30)), 1.4);
      for (let k = 0; k < nSeg; k++) {
        const S2 = segAt(k), fd = fadeAt(S2.u);
        const sm = tunM.clone(); sm.color.multiplyScalar(fd); sm.emissiveIntensity *= fd;
        const seg = new THREE.Mesh(segGeo, sm); seg.rotation.order = "YXZ"; seg.rotation.y = S2.ry; seg.rotation.x = -slope; seg.position.set(S2.b, S2.y, S2.a); grp.add(seg);
        if (fd > 0.25) for (const sd of [-1, 1]) { const gm2 = goldPlain.clone(); gm2.color.multiplyScalar(fd); gm2.emissive.multiplyScalar(fd); const bm = new THREE.Mesh(bandGeo, gm2); bm.rotation.order = "YXZ"; bm.rotation.y = S2.ry; bm.rotation.x = -slope; bm.position.set(S2.b + Math.sin(S2.t) * sd * (W / 2 - 0.12), S2.y + 3.0, S2.a + Math.cos(S2.t) * sd * (W / 2 - 0.12)); grp.add(bm); }
        const wmat = tw.clone(); wmat.color.multiplyScalar(fd); wmat.emissive.multiplyScalar(fd); const wm2 = new THREE.Mesh(waterGeo, wmat); wm2.rotation.order = "YXZ"; wm2.rotation.y = S2.ry; wm2.rotation.x = -Math.PI / 2 - slope; wm2.position.set(S2.b, S2.y + 0.5, S2.a); grp.add(wm2); city.keepExtra.push(wm2);
      }
      { const E2 = segAt(nSeg - 0.5); const cap = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.4, Hh + 1), new THREE.MeshBasicMaterial({ color: 0x000000, fog: false })); cap.rotation.y = E2.ry + Math.PI; cap.position.set(E2.b, E2.y + Hh / 2, E2.a); grp.add(cap); }
      // update 60: lamps for the first 40 m (they stopped at 18 m), then the dark
      for (let u = 3; u <= Math.min(depth - 2, 40); u += 6) { const t = th + sgn * u / rm, yy = yB + Math.tan(slope) * u; for (const sd of [-1, 1]) { const rr = rm + sd * (W / 2 - 0.4), lb = rr * Math.sin(t), la = rr * Math.cos(t); box(0.32, 0.12, 0.42, lb, yy + 3.5, la, goldPlain, t); const cage = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.5, 0.34), goldPlain); cage.position.set(lb, yy + 3.2, la); grp.add(cage); const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.18), gem); core.position.copy(cage.position); grp.add(core); city.emit(grp, lb, yy + 3.2, la, 0x9cffb0, 2.4, 14, {}); } }
      const yAt = (tdeg) => yB + Math.tan(slope) * Math.min(depth, Math.max(0, sgn * (tdeg - thd) * D2R * rm)) + 0.5;
      return { endTh: thd + sgn * (depth / rm) / D2R, rm, yB, endY: yB + Math.tan(slope) * depth, yAt };
    };
    city.lowerCulvert(LW.west.th1, 1, LW.culvertS, false, -1);   // the south tunnel: the water runs on into the dark
    city.lowerCulvertN = city.lowerCulvert(LW.west.th0, -1, LW.culvertN, true, 1);   // the north tunnel: the spiral comes in through it
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
    for (let k = 0; k < 6; k++) { const t = k * 60; const [a, b] = pt(FR + 4.2, t); if (benchA) { const bch = city.warmProp(benchA.model.clone()); const [x, z] = cityWorld(a, b); bch.position.set(x, Y.park, z); bch.rotation.y = C.grpYaw + (t + 90) * D2R; scene.add(bch); city.lowerProps.push(bch); bch.visible = false; } else box(2.4, 0.5, 0.8, b, Y.park + 0.25, a, sand(1, 1), t * D2R + Math.PI / 2); obst(a, b, 1.2); }   // update 55: turned to face the fountain
  }

  // ---------------- planters (hedges and flowers in gold-trimmed sandstone boxes), more benches, lamps ----------------
  {
    // update 55: the planters are the Higgsfield trough (sandstone, gold rim, a bed of coloured flowers), laid end to end along
    // each arc and closed at both ends; the old hedge boxes stay only as the fallback
    const plA = A.glb.et_planter; let plLen = 3.6, plW = 1.3, plLongX = true;
    if (plA) { const bb = new THREE.Box3().setFromObject(plA.model), sz = bb.getSize(new THREE.Vector3()); plLongX = sz.x >= sz.z; plLen = Math.max(sz.x, sz.z); plW = Math.min(sz.x, sz.z); }
    const hedgeM = w.mat("t_hedge", 6, 1, 0x2f6a2a), flowerM = w.mat("t_flowerbed", 6, 1, 0x7a3a5a);
    for (const [t0, t1] of LW.planters) {
      const r0 = LW.planterR - plW / 2 - 0.2, r1 = LW.planterR + plW / 2 + 0.2;
      if (plA) {
        const arcLen = (t1 - t0) * D2R * LW.planterR, nP = Math.max(2, Math.round(arcLen / plLen)), stepT = (t1 - t0) / nP;
        for (let i = 0; i < nP; i++) { const t = t0 + stepT * (i + 0.5), [a, b] = pt(LW.planterR, t); prop("et_planter", a, b, Y.park, t + 90 + (plLongX ? 90 : 0)); }
      } else {
        sector(r0, r1, t0, t1, Y.park + 1.0, soilM(2, 2), 24);
        cyl(r0, t0, t1, Y.park, Y.park + 1.05, sand(6, 1), true, 24); cyl(r1, t0, t1, Y.park, Y.park + 1.05, sand(6, 1), false, 24);
        for (const t of [t0, t1]) { const [a, b] = pt(LW.planterR, t); box(0.5, 1.12, r1 - r0 + 0.3, b, Y.park + 0.56, a, sand(1, 1), t * D2R - Math.PI / 2); }
        const hm = sector(r0 + 0.5, r1 - 0.5, t0 + 1, t1 - 1, Y.park + 1.9, hedgeM, 24); hm.material.side = THREE.DoubleSide;
        sector(r0 + 0.2, r1 - 0.2, t0 + 0.5, t1 - 0.5, Y.park + 1.02, flowerM, 24);
      }
      const n = Math.max(2, Math.round((t1 - t0) / 6));
      for (let i = 0; i < n; i++) { const ta = (t0 + (t1 - t0) * i / n) * D2R, tb = (t0 + (t1 - t0) * (i + 1) / n) * D2R; for (const rr of [r0 - 0.3, r1 + 0.3]) wallSeg(rr * Math.cos(ta), rr * Math.sin(ta), rr * Math.cos(tb), rr * Math.sin(tb), 0.3); }
      const benchA = A.glb.et_bench || A.glb.bench, tm = (t0 + t1) / 2;
      for (const dt of [-8, 8]) { const t = tm + dt, [a, b] = pt(r0 - 2.6, t); if (benchA) { const bch = city.warmProp(benchA.model.clone()); const [x, z] = cityWorld(a, b); bch.position.set(x, Y.park, z); bch.rotation.y = C.grpYaw + (t + 90) * D2R; scene.add(bch); city.lowerProps.push(bch); bch.visible = false; } obst(a, b, 1.2); }   // facing the fountain
      { const [a, b] = pt(r1 + 2.4, tm); city.addLamppost(a, b, Y.park, false); }
    }
    // lamps along the park's edge, torch statues by the walls, flags on the walls
    for (let t = -180; t < 180; t += 24) { const [a, b] = pt(TR - 4.5, t); if (Math.abs(t - 90) < 9 || Math.abs(t - LW.stairETh) < 9) continue; city.addLamppost(a, b, Y.park, false); }
    { const stepT = C.facadeStep / TR / D2R, doorGap = (t) => { let best = 99; for (const b0 of [LW.east.th1 + 5, LW.west.th1 + 5]) { const k = Math.round((t - b0) / stepT); for (const kk of [k - 1, k, k + 1]) { const ft = b0 + kk * stepT; best = Math.min(best, Math.abs(((ft - t) % 360 + 540) % 360 - 180)); } } return best; };   // update 58: no statue in front of a home's door - it steps half a house along
      for (let t = -180 + 12; t < 180; t += 36) { if (Math.abs(t - 90) < 12 || Math.abs(t - LW.stairETh) < 12 || Math.abs(t - LW.hospitalTh) < 8 || Math.abs(t - LW.houseTh) < 8) continue; const tt = doorGap(t) < 2.2 ? t + stepT / 2 : t; const [a, b] = pt(TR - 2.2, tt); city.addTorchbearer(a, b, Y.park, tt + 180); } }
    for (let t = -170; t < 180; t += 20) { if (inW(t) || inEa(t)) continue; const th = t * D2R; city.addPoleFlag((TR - 0.3) * Math.sin(th), Y.park + 9.2, (TR - 0.3) * Math.cos(th), t + 180, 0.9, 5.0); }
    for (let t = LW.west.th0 + 8; t < LW.west.th1 - 4; t += 22) city.addWallFlag(t, Y.walk + 9.2);
    for (let t = LW.east.th0 + 8; t < LW.east.th1 - 4; t += 22) city.addWallFlag(t, Y.low + 9.2);
    for (let t = LW.west.th0 + 6; t < LW.west.th1 - 4; t += 18) { const [a, b] = pt(R - 3.2, t); city.addLamppost(a, b, Y.walk, false); const [a2, b2] = pt(TR + 3.0, t + 9); if (t + 9 < LW.west.th1 - 3) city.addLamppost(a2, b2, Y.walk, false); }
    for (let t = LW.east.th0 + 10; t < LW.east.th1 - 4; t += 20) { if (Math.abs(t - LW.stairETh) < 9 || Math.abs(t - LW.mineTh) < 9) continue; const [a, b] = pt(TR + 3.0, t); city.addLamppost(a, b, Y.low, false); }
  }

  // ---------------- the giant apple trees ----------------
  // update 57: the tree keeps its scan. Its baked head-sized apples are painted over with leaf green on the texture, its
  // lanterns glow through an emissive map (and light the ground under the crown), and real small apples - one in a hundred
  // golden - hang on the crown's surface as instances (they are the ones that will fall, next update)
  {
    const treeA = A.glb.et_bigtree;
    city.lowerTrees = [];
    let crownPts = city.treeCrownPts || null, lanternTex = city.treeLanternTex || null;
    if (treeA && !city.treeFixed) { try {
      let mesh = null; treeA.model.traverse((o) => { if (o.isMesh && !mesh) mesh = o; });
      const mat = mesh && mesh.material, im = mat && mat.map && mat.map.image;
      if (im && im.width && mesh.geometry.attributes.uv) {
        city.treeFixed = true;
        const cv = document.createElement("canvas"); cv.width = im.width; cv.height = im.height; const cx = cv.getContext("2d"); cx.drawImage(im, 0, 0);
        const id = cx.getImageData(0, 0, cv.width, cv.height), dd = id.data, em = cx.createImageData(cv.width, cv.height), ed = em.data;
        for (let i = 0; i < dd.length; i += 4) { const r = dd[i], g = dd[i + 1], b = dd[i + 2];
          const lantern = r > 150 && r > g + 20 && g > 80 && b < 110; ed[i] = lantern ? r : dd[i] * 0.5; ed[i + 1] = lantern ? g : dd[i + 1] * 0.5; ed[i + 2] = lantern ? b : dd[i + 2] * 0.5; ed[i + 3] = 255; }
        cx.putImageData(id, 0, 0); const t = new THREE.CanvasTexture(cv); t.colorSpace = mat.map.colorSpace; t.flipY = mat.map.flipY; t.wrapS = mat.map.wrapS; t.wrapT = mat.map.wrapT; mat.map = t; mat.needsUpdate = true;
        const cv2 = document.createElement("canvas"); cv2.width = cv.width; cv2.height = cv.height; cv2.getContext("2d").putImageData(em, 0, 0); lanternTex = new THREE.CanvasTexture(cv2); lanternTex.colorSpace = t.colorSpace; lanternTex.flipY = t.flipY; lanternTex.wrapS = t.wrapS; lanternTex.wrapT = t.wrapT; city.treeLanternTex = lanternTex;
        // update 59: the crown's OUTER shell, by direction bins from the crown's centre (the outermost vertices in each bin
        // and those within 7% of them) - apples hang on the leaves' surface, never inside the crown. Points are in the mesh's own
        // frame; each tree maps them through its own world matrix
        treeA.model.updateMatrixWorld(true); const M4 = new THREE.Matrix4().copy(treeA.model.matrixWorld).invert().multiply(mesh.matrixWorld);
        const pos = mesh.geometry.attributes.position, v = new THREE.Vector3(); let yMin = 1e9, yMax = -1e9, xMin = 1e9, xMax = -1e9, zMin = 1e9, zMax = -1e9;
        for (let i = 0; i < pos.count; i += 2) { v.fromBufferAttribute(pos, i).applyMatrix4(M4); yMin = Math.min(yMin, v.y); yMax = Math.max(yMax, v.y); xMin = Math.min(xMin, v.x); xMax = Math.max(xMax, v.x); zMin = Math.min(zMin, v.z); zMax = Math.max(zMax, v.z); }
        const H = yMax - yMin, sW = 34 / Math.max(1e-6, H), cc = new THREE.Vector3((xMin + xMax) / 2, yMin + H * 0.66, (zMin + zMax) / 2), bins = new Map();
        for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(M4); if (v.y < yMin + H * 0.42) continue; const dx = v.x - cc.x, dy = v.y - cc.y, dz = v.z - cc.z, r = Math.hypot(dx, dy, dz); if (r < 1e-6) continue; const key = Math.floor((Math.atan2(dx, dz) + Math.PI) / (Math.PI * 2) * 40) + "|" + Math.floor((Math.asin(dy / r) + Math.PI / 2) / Math.PI * 20); let b2 = bins.get(key); if (!b2) { b2 = { max: 0, pts: [] }; bins.set(key, b2); } b2.pts.push([v.x, v.y, v.z, r]); if (r > b2.max) b2.max = r; }
        const pts = [], push = 0.10 / sW; for (const b2 of bins.values()) for (const [x, y, z, r] of b2.pts) if (r > b2.max * 0.93) { const k = 1 + push / r; pts.push([cc.x + (x - cc.x) * k, cc.y + (y - cc.y) * k, cc.z + (z - cc.z) * k]); }
        crownPts = pts; city.treeCrownPts = pts;
      }
    } catch (e) { console.warn("tree fix", e); } }
    const appleGeo = new THREE.SphereGeometry(0.12, 6, 5); appleGeo.scale(1, 0.9, 1);   // update 64: half the triangles - ten thousand of these
    const appleM = new THREE.MeshStandardMaterial({ color: 0xa4e83c, roughness: 0.35, emissive: 0x3c7a12, emissiveIntensity: 0.45 });
    const goldM = new THREE.MeshStandardMaterial({ color: 0xffd24a, metalness: 0.85, roughness: 0.3, emissive: 0x9a6a10, emissiveIntensity: 0.6 });
    const perTree = 380, nT = LW.trees.length, useApples = !!(crownPts && crownPts.length > 50);   // update 59: apple-sized apples on the leaves' surface, one golden apple on every third tree
    const green = useApples ? new THREE.InstancedMesh(appleGeo, appleM, perTree * nT) : null, goldI = useApples ? new THREE.InstancedMesh(appleGeo, goldM, Math.max(8, Math.ceil(perTree * nT * 0.03))) : null;   // update 63: one apple in a hundred is gold
    let gi = 0, ki = 0; const mtx = new THREE.Matrix4(), wp = new THREE.Vector3(); city.lowerApples = [];
    let treeIdx = -1;
    for (const [t, rr] of LW.trees) {
      treeIdx++; const [a, b] = pt(rr, t), yaw = (t * 7.3) % 360;
      const m = prop("et_bigtree", a, b, Y.park + 0.28, yaw, () => {
        const gg = new THREE.Group(); gg.position.set(b, Y.park + 0.28, a); grp.add(gg);
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.8, 14, 10), w.mat("t_bark", 2, 4, 0x5a3a22)); trunk.position.y = 7; gg.add(trunk);
        const crown = new THREE.Mesh(new THREE.SphereGeometry(9, 12, 10), new THREE.MeshStandardMaterial({ color: 0x3f8a2e, roughness: 0.9 })); crown.position.y = 19; crown.scale.y = 0.8; gg.add(crown);
        return gg;
      });
      if (m && lanternTex) m.traverse((o) => { if (o.isMesh && o.material) { o.material.emissiveMap = lanternTex; o.material.emissive = new THREE.Color(0xffffff); o.material.emissiveIntensity = 1.0; o.material.needsUpdate = true; } });   // the lanterns glow, the leaves keep their warm 0.3
      if (m && useApples) { m.updateMatrixWorld(true); let seed = (Math.round(t) * 7919 + Math.round(rr) * 31) | 0; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }; const goldK = -1; for (let k = 0; k < perTree; k++) { const P0 = crownPts[Math.floor(rnd() * crownPts.length)]; wp.set(P0[0], P0[1], P0[2]).applyMatrix4(m.matrixWorld); mtx.makeTranslation(wp.x, wp.y, wp.z); const isGold = rnd() < 0.01 || k === goldK; if (isGold && ki < goldI.count) goldI.setMatrixAt(ki++, mtx); else if (gi < green.count) green.setMatrixAt(gi++, mtx); city.lowerApples.push({ x: wp.x, y: wp.y, z: wp.z, gold: isGold }); } }
      // lantern light: three warm lights round the trunk where the lanterns hang (the pool of real lights follows you)
      for (let k = 0; k < 3; k++) { const ang = (k * 120 + t) * D2R; city.emit(grp, b + Math.sin(ang) * 4.5, Y.park + 10.5, a + Math.cos(ang) * 4.5, 0xffc35a, 2.6, 24, {}); }
      obst(a, b, 4.8);   // update 65: 4.8 - the roots arch wide and 5.6 felt like an unseen wall; the apples lie from 6.2 m out   // update 55: the trunk's own girth - nobody stands inside it, and the way between two trees stays open
      city.lowerTrees.push({ a, b, th: t, r: rr, model: m });
    }
    if (useApples) { green.count = gi; goldI.count = ki; green.instanceMatrix.needsUpdate = true; goldI.instanceMatrix.needsUpdate = true; for (const im2 of [green, goldI]) { if (im2.computeBoundingSphere) { im2.computeBoundingSphere(); im2.frustumCulled = true; } else im2.frustumCulled = false; scene.add(im2); city.lowerProps.push(im2); im2.visible = false; } city.lowerAppleMeshes = [green, goldI]; }
    // update 64: apples lying on the soil round every trunk - four a tree, picked up like the forest's, one in a hundred golden
    // at every spawn, one back every two minutes (eternius_lower_logic.js: lowerInteract picks, lowerUpdate respawns)
    { const gaGeo = new THREE.SphereGeometry(0.14, 7, 5); let sg = 9173; const rg = () => { sg = (sg * 1103515245 + 12345) & 0x7fffffff; return sg / 0x7fffffff; };
      city.groundApples = []; city.groundAppleMats = { green: appleM, gold: goldM };
      for (const [t, rr] of LW.trees) { const [ta, tb] = pt(rr, t); const slots = [];
        for (let k = 0; k < 4; k++) { const ang = rg() * Math.PI * 2, rad = 6.2 + rg() * 2.4; const a = ta + Math.cos(ang) * rad, b = tb + Math.sin(ang) * rad, gold = rg() < 0.01; const m = new THREE.Mesh(gaGeo, gold ? goldM : appleM); m.position.set(b, Y.park + 0.42, a); m.rotation.set(rg() * 0.6, rg() * 6.28, 0); grp.add(m); city.keepExtra.push(m); city.lowerProps.push(m); m.visible = false; slots.push({ a, b, mesh: m, gold, taken: false }); }
        city.groundApples.push({ slots, lastT: 0, ta, tb }); } }
  }

  // ---------------- update 53: the homes - the same house fronts as upstairs along every wall of this floor ----------------
  if (city.facade) {
    const step = C.facadeStep / R / D2R, stepT = C.facadeStep / TR / D2R, YR = [-270, -150];
    const clear = (t, list) => list.every(([t0, t1]) => t < t0 || t > t1);
    const J = LW.jail, dJ = 5, dM = ((LW.mine.hw + 5) / R) / D2R, dS = 8, dR = 7;
    for (let t = LW.west.th0 + 6; t < LW.west.th1 - 5; t += step) if (clear(t, [[LW.west.th0 - 1, LW.west.th0 + 4], [LW.west.th1 - 4, LW.west.th1 + 1]])) city.facade(t, Y.walk, R, YR);
    for (let t = LW.east.th0 + 6; t < LW.east.th1 - 5; t += step) if (clear(t, [[J.th0 - dJ, J.th1 + dJ], [LW.mineTh - dM, LW.mineTh + dM], [LW.storeTh - dS, LW.storeTh + dS], [LW.stairETh - 9, LW.stairETh + 9]])) city.facade(t, Y.low, R, YR);
    for (let t = LW.east.th1 + 5; t < LW.west.th0 - 4; t += stepT) if (clear(t, [[LW.houseTh - dR, LW.houseTh + dR]])) city.facade(t, Y.park, TR, YR);
    city.lowerHouseFront = city.facade(LW.houseTh, Y.park, TR, YR, { brown: true, noWall: true, doorway: true });   // update 55: the house for sale — the same front as every home, its door brown
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
    for (let k = 0; k < 3; k++) { const [ba, bb] = rm.P(3.2 + k * 3.4, rm.hw - 1.6); prop(A.glb.et_hospbed ? "et_hospbed" : "et_bed", ba, bb, Y.park, LW.hospitalTh + 90, () => { const gg = new THREE.Group(); gg.position.set(bb, Y.park, ba); gg.rotation.y = rm.ry + Math.PI / 2; grp.add(gg); const fr = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 3.4), gold); fr.position.y = 0.4; gg.add(fr); const mt = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.3, 3.2), new THREE.MeshStandardMaterial({ color: 0xe8e2d0 })); mt.position.y = 0.8; gg.add(mt); return gg; }); obst(ba, bb, 1.3); const [x, z] = cityWorld(ba, bb); city.lowerBeds.push({ x, z, y: Y.park + 0.9, a: ba, b: bb }); }
    { const [ka, kb] = rm.P(rm.depth - 1.0, -(rm.hw - 1.7)); prop("et_medcab", ka, kb, Y.park, LW.hospitalTh + 180, () => { box(2.4, 2.2, 0.7, kb, Y.park + 1.1, ka, w.mat("t_darkwood", 2, 2, 0x4a3320), rm.ry + Math.PI / 2); box(2.5, 0.12, 0.8, kb, Y.park + 2.26, ka, goldPlain, rm.ry + Math.PI / 2); for (const dy of [0.5, 1.2, 1.9]) box(2.2, 0.06, 0.55, kb, Y.park + dy, ka, goldPlain, rm.ry + Math.PI / 2); for (const [dx, dy] of [[-0.6, 0.62], [0.3, 0.62], [-0.2, 1.32], [0.6, 1.32], [-0.5, 2.02]]) { const bt = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.36, 8), new THREE.MeshStandardMaterial({ color: 0xe8f4ec, emissive: 0x2a6a40, emissiveIntensity: 0.5, roughness: 0.3 })); const [pa, pb] = rm.P(rm.depth - 1.2, -(rm.hw - 1.6) + dx); bt.position.set(pb, Y.park + dy + 0.18, pa); grp.add(bt); } return null; }); obst(ka, kb, 0.9); }   // update 57: the Higgsfield medicine cabinet (the box one is the fallback)
    { const [ta, tb] = rm.P(rm.depth * 0.5, -(rm.hw - 2.4)); if (A.glb.k_table) { const m = A.glb.k_table.model.clone(); const [x, z] = cityWorld(ta, tb); m.position.set(x, Y.park, z); m.rotation.y = C.grpYaw + rm.ry; scene.add(m); city.lowerProps.push(m); m.visible = false; } obst(ta, tb, 1.0); }
    for (const s of [-1, 1]) { const [pa, pb] = rm.P(-1.4, s * (rm.hw + 0.6)); pillar(pb, Y.park, pa, 0.35, 4.6, gold); }
    { const [fa, fb] = rm.P(-1.2, 0); const sign = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 0.2), new THREE.MeshStandardMaterial({ color: 0xf2eee6, emissive: 0xf2eee6, emissiveIntensity: 0.35 })); sign.position.set(fb, Y.park + 5.6, fa); sign.rotation.y = rm.ry; grp.add(sign); const crossM = new THREE.MeshStandardMaterial({ color: 0xd8302a, emissive: 0xd8302a, emissiveIntensity: 0.6 }); for (const [w2, h2] of [[1.1, 0.32], [0.32, 1.1]]) { const cr = new THREE.Mesh(new THREE.BoxGeometry(w2, h2, 0.08), crossM); cr.position.set(0, 0, -0.14); sign.add(cr); } }
    city.wallY0 = hy0; city.wallY1 = hy1;
    city.lowerHospBeds = [0, 1, 2].map((k) => rm.P(3.2 + k * 3.4, rm.hw - 1.6));   // update 63: where you may sleep when badly hurt
    city.lowerHospital = rm; rm.npc = rm.P(rm.depth * 0.45, -(rm.hw - 2.4) + 2.2);
  }
  // the house for sale: a brown door (the only one), a bed and a storage chest behind it — the door stays shut until it is yours
  {
    const rm = carve(LW.houseTh, TR + 1.5, Y.park, "house", RM.depth, RM.hw, RM.h, { open: true });   // update 55: the front is the ordinary home front (built above), brown door; update 57: 1.5 m deeper in the rock
    const [ba, bb] = rm.P(RM.depth - 2.4, -(RM.hw - 1.6));
    prop("et_bed", ba, bb, Y.park, LW.houseTh + 90, () => { const gg = new THREE.Group(); gg.position.set(bb, Y.park, ba); gg.rotation.y = rm.ry + Math.PI / 2; grp.add(gg); const fr = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 3.4), gold); fr.position.y = 0.4; gg.add(fr); return gg; }); obst(ba, bb, 1.3);
    const [sa, sb] = rm.P(RM.depth - 2.0, RM.hw - 1.8);
    prop(A.glb.et_goldchest ? "et_goldchest" : "storagechest", sa, sb, Y.park, LW.houseTh + 180, () => { const ch = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 0.9), w.mat("t_darkwood", 1, 1, 0x4a3320)); ch.position.set(sb, Y.park + 0.45, sa); ch.rotation.y = rm.ry; grp.add(ch); return ch; }, A.glb.et_goldchest ? 1 : 1.6); obst(sa, sb, 0.9);   // update 57: the golden chest with its emeralds (Higgsfield)
    const [x, z] = cityWorld(rm.doorA, rm.doorB);
    // the door: brown wood, gold knob, a bar across it (it opens once bought — eternius.js)
    city.lowerHouse = { rm, door: city.lowerHouseFront || null, x, z, seg: wallSeg(...rm.P(-2.4, -RM.doorHw - 0.4), ...rm.P(-2.4, RM.doorHw + 0.4), 0.35), chest: { a: sa, b: sb }, bed: { a: ba, b: bb } };
    // update 66: the neighbouring home's facade wall ran straight across this doorway (the facade row steps 13 degrees and the
    // house sits between two of them), so the bought house could never be entered. Every wall within 2 m of the door point
    // except the door's own toggling segment is cut open there
    { const H = city.lowerHouse, [da, db] = [rm.doorA, rm.doorB], R2 = 2.0, add = [];
      for (const w of city.walls) { if (w === H.seg) continue; const ex = w.a1 - w.a0, ez = w.b1 - w.b0, L2 = ex * ex + ez * ez; if (L2 < 1e-6) continue; const tt = Math.max(0, Math.min(1, ((da - w.a0) * ex + (db - w.b0) * ez) / L2)); const qa = w.a0 + ex * tt, qb = w.b0 + ez * tt; if (Math.hypot(qa - da, qb - db) > R2 + (w.t || 0.4) / 2) continue;
        const L = Math.sqrt(L2), ds = (R2 + (w.t || 0.4) / 2) / L, s0 = tt - ds, s1 = tt + ds, keep = { ...w };
        if (s0 > 0.02) add.push({ ...keep, a1: w.a0 + ex * s0, b1: w.b0 + ez * s0 }); if (s1 < 0.98) add.push({ ...keep, a0: w.a0 + ex * s1, b0: w.b0 + ez * s1 }); w.off = true; w.cut = true; }
      for (const w of add) city.walls.push(w); }
    // update 68: the passage between the front (0.15 m before TR) and the room (1.5 m behind it): a floor slab, two side walls
    // and a ceiling, door-wide, so there is no strip of nothing under the threshold and no rock beside the door; the room's
    // floor lookup reaches 2.3 m out past its threshold (rm.front), which closes the half-metre band where the game found no
    // floor -1 floor at all and fell back to the ground floor's height (the 'teleport')
    { const hy0 = city.wallY0, hy1 = city.wallY1; city.wallY0 = Y.park - 1.5; city.wallY1 = Y.park + RM.h + 1.5; const dw = 1.2, dh = 4.1;   // the front's opening is 2.4 wide: the passage walls sit flush with its edges
      const [fa, fb] = rm.P(-1.0, 0); box(dw * 2 + 1.2, 0.3, 2.6, fb, Y.park - 0.15, fa, sand(3, 3), rm.ry);
      box(dw * 2 + 1.2, 0.4, 2.2, fb, Y.park + dh + 0.2, fa, sand(3, 3), rm.ry);
      for (const s2 of [-1, 1]) { const [wa, wb] = rm.P(-0.95, s2 * (dw + 0.3)); box(0.6, dh + 0.4, 2.1, wb, Y.park + (dh + 0.4) / 2, wa, sand(2, 2), rm.ry); const [q0a, q0b] = rm.P(-2.0, s2 * dw), [q1a, q1b] = rm.P(0.2, s2 * dw); wallSeg(q0a, q0b, q1a, q1b, 0.4); }
      // the room has no front wall of its own (open: true): two pieces beside the passage close the void between the passage walls and the room's side walls
      for (const s2 of [-1, 1]) { const [pa, pb] = rm.P(-0.2, s2 * (dw + 0.3 + (RM.hw + 0.5 - dw - 0.3) / 2)); box(RM.hw + 0.5 - dw - 0.3, RM.h, 0.6, pb, Y.park + RM.h / 2, pa, sand(2, 2), rm.ry); }
      rm.front = 2.3; city.wallY0 = hy0; city.wallY1 = hy1; }


    for (const sd of [-1, 1]) { const [q0a, q0b] = rm.P(-2.4, sd * (RM.doorHw + 0.4)), [q1a, q1b] = rm.P(-2.4, sd * (RM.hw + 0.5)); wallSeg(q0a, q0b, q1a, q1b, 0.4); }   // the front either side of the door
    for (const sd of [-1, 1]) { const wd2 = RM.hw + 1.2 - 3.5; const [fa2, fb2] = rm.P(-1.3, sd * (3.5 + wd2 / 2)); box(wd2 + 0.3, RM.h + 1.6, 1.6, fb2, Y.park + (RM.h + 1.6) / 2 - 0.2, fa2, rock(2, 2), rm.ry); }   // update 57: the slits beside the front are rock now - the house looks like every other home
  }
  // the mining store: beside the mine's mouth on the east gallery - update 57: a real shop. A counter across the room with
  // Bakenre behind it, the pickaxe rack on the back wall, an emerald statue and a gem case by the door (all Higgsfield); the
  // brick wall that stood in the middle is gone and every corner in front of the counter is yours to walk
  {
    const rm = carve(LW.storeTh, R, Y.low, "store", 10, 5.5, 5.2, { doorHw: 2.2, doorH: 4.8 });
    { const [ca, cb] = rm.P(6.6, 0); const cm = prop("et_counter", ca, cb, Y.low, LW.storeTh + 180, () => { box(7.0, 1.1, 1.3, cb, Y.low + 0.55, ca, sand(2, 1), rm.ry + Math.PI / 2); return box(7.3, 0.14, 1.6, cb, Y.low + 1.17, ca, gold, rm.ry + Math.PI / 2); }); if (cm && A.glb.et_counter) { cm.scale.x *= 2.2; for (const sd of [-1, 1]) { const [ea, eb] = rm.P(6.6, sd * (2.1 + (rm.hw - 2.1) / 2)); box(rm.hw - 2.1 + 0.2, 1.05, 1.1, eb, Y.low + 0.52, ea, sand(2, 1), rm.ry + Math.PI / 2); box(rm.hw - 2.1 + 0.3, 0.12, 1.3, eb, Y.low + 1.1, ea, gold, rm.ry + Math.PI / 2); } } wallSeg(...rm.P(6.6, -rm.hw), ...rm.P(6.6, rm.hw), 0.5); rm.front = rm.P(5.7, 0); rm.frontW = cityWorld(...rm.front); }   // update 64: a thinner counter collider and the trade point at its front   // the Higgsfield counter in the middle (stretched along the room), plain sandstone counter ends to the walls
    { const [ra, rb] = rm.P(rm.depth - 0.5, 0); prop("et_pickrack", ra, rb, Y.low + 1.2, LW.storeTh + 180, () => box(4.0, 2.2, 0.3, rb, Y.low + 2.4, ra, w.mat("t_darkwood", 2, 1, 0x4a3320), rm.ry + Math.PI / 2)); }
    { const [sa2, sb2] = rm.P(2.6, -(rm.hw - 1.5)); prop("et_emstatue", sa2, sb2, Y.low, LW.storeTh + 180, () => { const g2 = new THREE.Mesh(new THREE.OctahedronGeometry(0.5), gem); g2.position.set(sb2, Y.low + 1.4, sa2); grp.add(g2); return g2; }); obst(sa2, sb2, 0.8); }
    { const [ga, gb] = rm.P(2.6, rm.hw - 1.5); const gc = prop("et_gemcase", ga, gb, Y.low, LW.storeTh + 180, () => { const g2 = new THREE.Mesh(new THREE.OctahedronGeometry(0.4), gem); g2.position.set(gb, Y.low + 1.2, ga); grp.add(g2); return g2; }); obst(ga, gb, 0.8);
      // update 58: the scan's painted glass is clipped off above the cushion; real glass and a real crystal take its place - a
      // deep teal stone with gold veins that breathes light (city.gemPulse, eternius_lower_logic.js lowerUpdate)
      if (gc && A.glb.et_gemcase) { try {
        const cut = Y.low + 0.98; scene.updateMatrixWorld && gc.updateMatrixWorld(true); const wcut = grp.localToWorld(new THREE.Vector3(0, cut, 0)).y;
        city.g.renderer.localClippingEnabled = true; gc.traverse((o) => { if (o.isMesh && o.material) { o.material.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, -1, 0), wcut)]; o.material.clipShadows = true; } });
        const glassM = new THREE.MeshPhysicalMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.18, roughness: 0.05, metalness: 0, transmission: 0.4, thickness: 0.05, side: THREE.DoubleSide, depthWrite: false });
        const gw = 0.58, gh = 0.5, gy0 = cut - 0.02; const gbox = new THREE.Mesh(new THREE.BoxGeometry(gw, gh, gw), glassM); gbox.position.set(gb, gy0 + gh / 2, ga); gbox.rotation.y = rm.ry; grp.add(gbox);
        for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.03, gh, 0.03), goldPlain); e.position.set(dx * gw / 2, 0, dz * gw / 2); gbox.add(e); }
        for (const yy of [-gh / 2 + 0.015, gh / 2 - 0.015]) for (const [rx, rz, len] of [[0, -1, gw], [0, 1, gw], [-1, 0, gw], [1, 0, gw]]) { const e = new THREE.Mesh(new THREE.BoxGeometry(rx ? 0.03 : len, 0.03, rx ? len : 0.03), goldPlain); e.position.set(rx * gw / 2, yy, rz * gw / 2); gbox.add(e); }
        const cv = document.createElement("canvas"); cv.width = cv.height = 256; const cx = cv.getContext("2d"); cx.fillStyle = "#0b5646"; cx.fillRect(0, 0, 256, 256); cx.strokeStyle = "rgba(255,206,90,0.95)"; cx.lineWidth = 2.2; let sd = 7; const rnd = () => { sd = (sd * 1103515245 + 12345) & 0x7fffffff; return sd / 0x7fffffff; }; for (let v = 0; v < 14; v++) { cx.beginPath(); let x = rnd() * 256, y = rnd() * 256; cx.moveTo(x, y); for (let k = 0; k < 9; k++) { x += (rnd() - 0.5) * 70; y += (rnd() - 0.5) * 70; cx.lineTo(x, y); } cx.stroke(); }
        const vt = new THREE.CanvasTexture(cv); vt.colorSpace = THREE.SRGBColorSpace; vt.wrapS = vt.wrapT = THREE.RepeatWrapping;
        const crM = new THREE.MeshStandardMaterial({ map: vt, color: 0xffffff, emissive: 0x1f9c78, emissiveIntensity: 0.6, roughness: 0.22, metalness: 0.15 });
        const emA = A.glb.et_emerald; let cr; if (emA) { cr = emA.model.clone(); cr.traverse((o) => { if (o.isMesh) o.material = crM; }); const bb = new THREE.Box3().setFromObject(cr), sz = bb.getSize(new THREE.Vector3()); cr.scale.multiplyScalar(0.34 / Math.max(sz.x, sz.z)); } else { cr = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), crM); }
        const [wx, wz] = cityWorld(ga, gb); cr.position.set(wx, 0, wz); const wyb = grp.localToWorld(new THREE.Vector3(0, gy0 + 0.02, 0)).y; cr.position.y = wyb; cr.rotation.y = C.grpYaw + rm.ry; scene.add(cr); city.lowerProps.push(cr); cr.visible = false; city.gemPulse = { mesh: cr, mat: crM };
        city.emit(grp, gb, gy0 + 0.35, ga, 0x2fd0a0, 1.6, 9, {});
      } catch (e) { console.warn("gem case", e); } }
    }
    for (const [u, v] of [[6.4, -3.7], [6.5, 3.8]]) { const [ga, gb] = rm.P(u, v); const em = prop("et_emerald", ga, gb, Y.low + 1.16, LW.storeTh + 180 + (v > 0 ? 40 : -25), () => null, 0.3); if (em) { em.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(em); const top = grp.localToWorld(new THREE.Vector3(0, Y.low + 1.16, 0)).y; em.position.y += top - bb.min.y; } }   // update 59: a stone on each sandstone counter end, its base on the gold top
    city.lowerStore = rm; rm.npc = rm.P(8.4, 0);
  }
  // the jail: cells carved into the east gallery's outer wall, gold bars across their fronts, a stone bed in each
  {
    const J = LW.jail, n = J.cells, step = ((3.0 * 2 + 0.7) / R) / D2R;   // update 55: side by side, a 0.7 m wall between them
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
      city.lowerCells.push({ rm, hinge, seg, open: 0, bedA: rm.P(5.4, -(rm.hw - 1.2))[0], bedB: rm.P(5.4, -(rm.hw - 1.2))[1], inA: rm.P(1.5, 0)[0], inB: rm.P(1.5, 0)[1] });   // update 58: 1.5 m in, within the prompt's reach   // update 55: he stands at the bars, where you can talk to him from the gallery
    }
    // two guards at the cells, a brazier between them
    const jEnd = J.th0 + step * n; { const [ba, bb] = pt(R - 5.0, (J.th0 + jEnd) / 2); city.addBrazier(bb, Y.low, ba, true); }
    city.lowerJailGuards = [pt(R - 4.0, J.th0 + 1.5), pt(R - 4.0, jEnd - 1.5)];
  }

  // ---------------- the mine: a tunnel out of the east gallery, rails, carts, timber, emerald veins, lamps ----------------
  // update 57: a real mine. Rugged rock (Higgsfield rock, the walls displaced by a noise), a tunnel that runs on past the working
  // face and curves away to the LEFT into the dark so its end is never seen; the stop at M.len (eternius_lower_logic.js) is where
  // the nearest miner calls you back. The mouth: rock with the tunnel's own profile cut out, a gold frame following it (the
  // pointed arch fell apart for an opening wider than it is tall - the 'golden plate')
  {
    const MT = LW.mineTh, M = LW.mine, hw = M.hw, h = M.h, deep = M.deep || 60, total = M.len + deep, wallTopM = Y.park + C.wallTop + 4;
    const [ma, mb] = pt(R - 1, MT), dir = [Math.cos(MT * D2R), Math.sin(MT * D2R)], tng = [-Math.sin(MT * D2R), Math.cos(MT * D2R)];   // +tng = the LEFT of travel (three.js: left = (f.z, -f.x))
    const bendAt = (d) => d < 30 ? 0 : (M.bend || 34) * Math.pow((d - 30) / (total - 30), 2);
    const pts = []; for (let i = 0; i <= 13; i++) { const d = total * i / 13, bd = bendAt(d); pts.push(new THREE.Vector3(mb + dir[1] * d + tng[1] * bd, Y.low, ma + dir[0] * d + tng[0] * bd)); }
    const path = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.5);
    const pathLen = path.getLength(), uStop = M.len / pathLen;
    const rockM = (rx, rz, em) => { const m = w.mat("t_minerock", rx, rz, 0x3a3028); m.side = THREE.DoubleSide; m.fog = false; if (m.map && em > 0) { m.emissiveMap = m.map; m.emissive = new THREE.Color(0xffffff); m.emissiveIntensity = em; } else if (em > 0) { m.emissive = new THREE.Color(0x1a1410); m.emissiveIntensity = 0.5; } return m; };
    // the profile: a rough half-ellipse; the walls stand at hw+0.5 and are then pushed in and out up to 0.8 m
    const prof2 = []; { const NP = 22; for (let i = 0; i <= NP; i++) { const t = i / NP; prof2.push([-(hw + 0.5) * Math.cos(t * Math.PI), -0.3 + (h + 0.3) * Math.pow(Math.sin(t * Math.PI), 0.85)]); } }
    const noise = (x, y, z) => 0.38 * Math.sin(x * 0.9 + y * 1.3) * Math.sin(z * 0.7 - x * 0.4 + 1.1) + 0.26 * Math.sin(x * 2.1 - z * 1.7 + y * 0.8) + 0.16 * Math.sin(y * 3.3 + z * 2.6 + x * 0.5);
    // update 58: the tunnel glows by itself for its first 30 m; over the next 100 m the glow AND the vertex light fade out step
    // by step, so the dark comes on like real dark and never as a wall (the stop at M.len sits inside the fade)
    const rugged = (u0, u1, steps, c0, c1) => {
      const gg = sweepU(path, prof2, u0, u1, steps, 1.0, 0); const p = gg.attributes.position, n = gg.attributes.normal; const v = new THREE.Vector3(), nv = new THREE.Vector3();
      const col = new Float32Array(p.count * 3), np = prof2.length;
      for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); nv.fromBufferAttribute(n, i); const t = Math.floor(i / np) / steps, dAlong = (u0 + (u1 - u0) * t) * pathLen, kd = Math.min(1, Math.max(0, (dAlong - 1.6) / 3)); const k = kd * Math.min(1, Math.max(0, (v.y - Y.low - 0.35) / 1.2)); v.addScaledVector(nv, noise(v.x, v.y, v.z) * k); p.setXYZ(i, v.x, v.y, v.z); const sh = c0 + (c1 - c0) * t; col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = sh * sh; }   // update 59: flat for the first metres so the rock never pokes through the mouth's panel
      gg.setAttribute("color", new THREE.BufferAttribute(col, 3)); gg.computeVertexNormals(); return gg;
    };
    const floorM = (em) => { const m = w.mat("t_minefloor", 0.5, 0.5, 0x4a3a2a); m.side = THREE.DoubleSide; m.fog = false; if (m.map && em > 0) { m.emissiveMap = m.map; m.emissive = new THREE.Color(0xffffff); m.emissiveIntensity = em; } return m; };   // update 59: the floor's own dirt-and-gravel, 4 m per tile both ways
    const floorGeo = (u0, u1, steps, c0, c1) => { const g2 = sweepU(path, [[-hw - 0.4, 0.02], [hw + 0.4, 0.02]], u0, u1, steps, 1.0, 0); const cnt = g2.attributes.position.count, cc = new Float32Array(cnt * 3); for (let i = 0; i < cnt; i++) { const t = Math.floor(i / 2) / steps, sh = c0 + (c1 - c0) * t; cc[i * 3] = cc[i * 3 + 1] = cc[i * 3 + 2] = sh * sh; } g2.setAttribute("color", new THREE.BufferAttribute(cc, 3)); return g2; };
    const wallMeshes = [], uLit = 30 / pathLen, NSEG = 9;
    { const m0 = rockM(2, 2, 0.2); m0.vertexColors = true; const t0m = new THREE.Mesh(rugged(0, uLit, 12, 1, 1), m0); grp.add(t0m); wallMeshes.push(t0m); const f0 = floorM(0.16); f0.vertexColors = true; grp.add(new THREE.Mesh(floorGeo(1.0 / pathLen, uLit, 12, 1, 1), f0)); }
    for (let k = 0; k < NSEG; k++) {
      const a0 = uLit + (1 - uLit) * k / NSEG, a1 = uLit + (1 - uLit) * (k + 1) / NSEG, e0 = Math.pow(1 - k / NSEG, 1.4), e1 = Math.pow(1 - (k + 1) / NSEG, 1.4);
      const wm = rockM(2, 2, 0.2 * e0); wm.vertexColors = true; const seg = new THREE.Mesh(rugged(a0, a1, 6, e0, e1), wm); grp.add(seg); if (a0 * pathLen < M.len + 6) wallMeshes.push(seg);
      const fm = floorM(0.16 * e0); fm.vertexColors = true; grp.add(new THREE.Mesh(floorGeo(a0, a1, 6, e0, e1), fm));
    }
    // a vein sits ON the displaced wall: a ray from the tunnel's axis at the vein's height finds the rock, the vein goes 12 cm into it
    grp.updateMatrixWorld(true); const gq = grp.getWorldQuaternion(new THREE.Quaternion());
    const wallHit = (p, rtv, side, hy) => { const o = grp.localToWorld(new THREE.Vector3(p.x, p.y + hy, p.z)); const dw = new THREE.Vector3(rtv.x * side, 0, rtv.z * side).applyQuaternion(gq).normalize(); const hit = new THREE.Raycaster(o, dw, 0, hw + 3).intersectObjects(wallMeshes, false)[0]; return hit ? grp.worldToLocal(hit.point.clone()) : p.clone().addScaledVector(rtv, side * (hw - 0.35)); };   // update 60: the point on the rock itself
    { const e = path.getPointAt(1), t = path.getTangentAt(1); const cap = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 4, h + 4, 1), new THREE.MeshBasicMaterial({ color: 0x000000, fog: false })); cap.position.copy(e); cap.position.y += h / 2; cap.rotation.y = Math.atan2(t.x, t.z); grp.add(cap); }
    // update 59: real stones - three Higgsfield rock chunks scattered over the walls and the ceiling at every size and angle, a
    // third of each sunk into the rock; instanced, kept out of the merge, hidden with the rest of floor -1 while you are upstairs
    { const ids = ["et_rock1", "et_rock2", "et_rock3"].filter((id) => A.glb[id]); let seed = 4242; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }; const tmp = new THREE.Object3D();
      for (const id of ids) { const src = A.glb[id].model; let mesh = null; src.traverse((o) => { if (o.isMesh && !mesh) mesh = o; }); if (!mesh) continue; src.updateMatrixWorld(true); const geo = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld); const mat = mesh.material.clone(); mat.fog = false; if (mat.map) { mat.emissiveMap = mat.map; mat.emissive = new THREE.Color(0xffffff); mat.emissiveIntensity = 0.14; }
        const per = Math.round(460 / ids.length), inst = new THREE.InstancedMesh(geo, mat, per); let cnt = 0;
        for (let k2 = 0; k2 < per; k2++) { const d = 2.5 + rnd() * (M.len + 30), u = Math.min(1, d / pathLen), ang = 0.1 + rnd() * (Math.PI - 0.2); const p = path.getPointAt(u), t = path.getTangentAt(u), rt = new THREE.Vector3(t.z, 0, -t.x).normalize(); const px = -(hw + 0.5) * Math.cos(ang), py = -0.3 + (h + 0.3) * Math.pow(Math.sin(ang), 0.85); if (py < 0.6) continue; const pos = p.clone().addScaledVector(rt, px); pos.y += py; const axis = p.clone(); axis.y += h * 0.45; const inward = axis.sub(pos).normalize(); const sc = 0.55 + rnd() * 1.35; pos.addScaledVector(inward, -sc * 0.42); tmp.position.copy(pos); tmp.up.set(0, 1, 0); tmp.lookAt(pos.clone().add(inward)); tmp.rotateZ(rnd() * Math.PI * 2); tmp.rotateX((rnd() - 0.5) * 0.6); tmp.scale.setScalar(sc); tmp.updateMatrix(); inst.setMatrixAt(cnt++, tmp.matrix); }
        inst.count = cnt; inst.instanceMatrix.needsUpdate = true; if (inst.computeBoundingSphere) { inst.computeBoundingSphere(); inst.frustumCulled = true; } else inst.frustumCulled = false; inst.castShadow = false; grp.add(inst); city.keepExtra.push(inst); city.lowerProps.push(inst); inst.visible = false; } }
    city.lowerMine = { path, len: M.len, hw, h, th: MT, total: pathLen, samples: path.getSpacedPoints(120) };
    // the mouth in the gallery wall: rock round the tunnel's own profile, a gold frame following it, timber posts, lampposts
    {
      const ry = MT * D2R, hole = new THREE.Path(); prof2.forEach(([x, y], i) => i ? hole.lineTo(x * 0.995, y) : hole.moveTo(x * 0.995, y)); hole.closePath();
      const shp = new THREE.Shape(); shp.moveTo(-7.5, -4.6); shp.lineTo(7.5, -4.6); shp.lineTo(7.5, wallTopM - Y.low + 0.8); shp.lineTo(-7.5, wallTopM - Y.low + 0.8); shp.closePath(); shp.holes.push(hole);
      const pg = new THREE.ExtrudeGeometry(shp, { depth: 1.2, bevelEnabled: false }); { const uv = pg.attributes.uv, pp = pg.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, (pp.getX(i) + pp.getZ(i)) / 4, (pp.getY(i) + pp.getZ(i)) / 4); }
      const [pa, pb] = pt(R - 0.6, MT); const pm = rock(3, 8); pm.side = THREE.DoubleSide; const panel = new THREE.Mesh(pg, pm); panel.position.set(pb, Y.low, pa); panel.rotation.y = ry; grp.add(panel); city.keepExtra.push(panel);
      const fr = new THREE.Shape(); prof2.forEach(([x, y], i) => { const X = x * (hw + 1.1) / (hw + 0.5), Y2 = -0.3 + (y + 0.3) * (h + 0.9) / (h + 0.3); i ? fr.lineTo(X, Y2) : fr.moveTo(X, Y2); }); for (let i2 = prof2.length - 1; i2 >= 0; i2--) fr.lineTo(prof2[i2][0], prof2[i2][1]); fr.closePath();   // update 58: one closed band - the bow and nothing along the floor (the hole touching the outline left a gold wedge)
      const fg = new THREE.ExtrudeGeometry(fr, { depth: 0.7, bevelEnabled: false }); { const uv = fg.attributes.uv, pp = fg.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, pp.getX(i) / 2, pp.getY(i) / 2); }
      const [fa, fb] = pt(R - 1.3, MT); const frame = new THREE.Mesh(fg, gold); frame.position.set(fb, Y.low, fa); frame.rotation.y = ry; grp.add(frame); city.keepExtra.push(frame);
      for (const s2 of [-1, 1]) { const [qa, qb] = pt(R - 1.2, MT + (s2 * (hw + 1.9) / R) / D2R); pillar(qb, Y.low, qa, 0.4, h + 1.4, w.mat("t_darkwood", 1, 3, 0x4a3320)); city.addLamppost(qa, qb + (s2 > 0 ? 1.4 : -1.4) * Math.cos(MT * D2R), Y.low, false); }
    }
    // rails, timber props, lamps, emerald veins along the way; carts; the miners' spots - lamps, veins, carts and miners only
    // in the worked part, the rails and the timber run on into the dark
    const railM = goldPlain, timberM = w.mat("t_darkwood", 1, 3, 0x4a3320);
    city.lowerVeins = []; city.lowerMiners = [];
    const N = 60;
    for (let i = 0; i <= N; i++) {
      const s2 = i / N, d = s2 * pathLen, p = path.getPointAt(s2), t = path.getTangentAt(s2), rt = new THREE.Vector3(t.z, 0, -t.x).normalize();   // right of travel (local x=b, z=a)
      const yaw = Math.atan2(t.x, t.z), work = d <= M.len + 0.5;
      if (i < N && d < total - 8) { for (const side of [-1.0, 1.0]) { const q = p.clone().addScaledVector(rt, side * 0.75); const seg = path.getPointAt(Math.min(1, s2 + 1 / N)).sub(p); const L2 = seg.length(); const r2 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, L2 + 0.05), railM); r2.position.copy(q).add(seg.clone().multiplyScalar(0.5)); r2.position.y += 0.05; r2.rotation.y = yaw; grp.add(r2); } if (i % 2 === 0) { const sl = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.35), timberM); sl.position.copy(p); sl.position.y += 0.02; sl.rotation.y = yaw; grp.add(sl); } }
      if (i % 5 === 2 && d < total - 10) { for (const side of [-1, 1]) { const q = p.clone().addScaledVector(rt, side * (hw - 0.35)); const post = new THREE.Mesh(new THREE.BoxGeometry(0.45, h - 1.6, 0.45), timberM); post.position.copy(q); post.position.y += (h - 1.6) / 2; grp.add(post); } const beam = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 - 0.2, 0.45, 0.45), timberM); beam.position.copy(p); beam.position.y += h - 1.6; beam.rotation.y = yaw; grp.add(beam); if (work) { const lq = p.clone().addScaledVector(rt, -(hw - 1.6)); city.addCeilingLamp(lq.z, lq.x, Y.low + h - 1.65, 1.1, false); const lq2 = p.clone().addScaledVector(rt, (hw - 1.6)); if (i % 10 === 7) city.addCeilingLamp(lq2.z, lq2.x, Y.low + h - 1.65, 1.1, true); } }
      const veinIds = ["et_vein1", "et_vein3", "et_vein1"].filter((id) => A.glb[id]);
      // update 60: a vein grows OUT of the rock: its up axis is turned to point into the tunnel (tilted a little upward
      // higher on the wall) and the model is pushed into the wall by VEIN_BURY of its height, so the grey base is inside the
      // rock and only the crystals stand out; nearly twice as many, on both walls where the path allows
      if (work && i > 1 && i % 5 !== 2 && i % 4 !== 0) for (const side of (i % 6 === 3 ? [1, -1] : [i % 2 ? 1 : -1])) { const hy = 0.5 + ((i * 7 + (side > 0 ? 3 : 0)) % 5) * 0.95, sc = 0.55 + ((i * 3 + side + 4) % 4) * 0.2; const q = wallHit(p, rt, side, hy); const [va, vb] = [q.z, q.x]; const id = veinIds.length ? veinIds[(i * 7 + side + 9) % veinIds.length] : "et_emerald"; const m = prop(id, va, vb, Y.low + hy, 0, () => { const g2 = new THREE.Mesh(new THREE.OctahedronGeometry(0.6), gem); g2.position.set(vb, Y.low + 1.2, va); grp.add(g2); return g2; }, sc);
        let inward = new THREE.Vector3(-side * rt.x, 0, -side * rt.z);
        if (m && veinIds.length) { const tilt = (hy - 0.5) / h * 40 * D2R; inward = new THREE.Vector3(inward.x * Math.cos(tilt), Math.sin(tilt), inward.z * Math.cos(tilt)).applyQuaternion(gq).normalize(); const qv = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), inward); const twist = new THREE.Quaternion().setFromAxisAngle(inward, ((i * 37 + side * 11) % 360) * D2R); m.quaternion.copy(twist.multiply(qv)); const Hm = (CFG.modelScale[id] || 1) * sc; m.position.addScaledVector(inward, -(VEIN_BURY[id] || 0.5) * Hm); }
        if (i % 2 === 0) city.emit(grp, vb - side * rt.x * 0.5, Y.low + hy + 0.3, va - side * rt.z * 0.5, 0x4fff8a, 1.2, 8, {}); city.lowerVeins.push({ a: va, b: vb, y: Y.low + hy, model: m, left: 3 }); }
      if (i === 14 || i === 27) { const yaw2 = yaw; prop("et_minecart", p.z, p.x, Y.low + 0.05, yaw2 / D2R + 90, () => { const c = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.0, 2.0), dark); c.position.set(p.x, Y.low + 0.7, p.z); c.rotation.y = yaw2; grp.add(c); return c; }, 1.4); obst(p.z, p.x, 1.3); }   // update 57: turned to run ON the rails, grown to their gauge
      if (i === 10 || i === 20 || i === 30) { const side = i === 20 ? -1 : 1; const q = p.clone().addScaledVector(rt, side * (hw - 1.6)); city.lowerMiners.push({ a: q.z, b: q.x, face: yaw / D2R + (side > 0 ? 90 : -90) }); }
    }
    for (let i = 0; i < N; i++) { const p0 = path.getPointAt(i / N), p1 = path.getPointAt((i + 1) / N); if (i / N * pathLen > M.len + 5) break; const t = p1.clone().sub(p0), rt = new THREE.Vector3(t.z, 0, -t.x).normalize(); for (const side of [-1, 1]) { const q0 = p0.clone().addScaledVector(rt, side * hw), q1 = p1.clone().addScaledVector(rt, side * hw); wallSeg(q0.z, q0.x, q1.z, q1.x, 0.3); } }
  }

  // ---------------- the cavern: the rock wall ring, the dome, the shaft up to the glass ----------------
  {
    const rockW = rock(24, 4); rockW.side = THREE.BackSide;
    const ring = (rr, t0, t1, y0, y1) => { if (t1 - t0 < 0.05 || y1 - y0 < 0.05) return; cyl(rr, t0, t1, y0, y1, rockW, true, Math.max(2, Math.round((t1 - t0) / 3.75))); };
    const wallTop = Y.park + C.wallTop + 4, apex = Y.park + C.cavernH + 4;
    // the outer ring (R) along the two bands with gaps for the cells, the store, the mine, the two mouths
    const gaps = [];
    for (const rm of city.lowerRooms) { if (rm.wallR !== R) continue; const d = ((rm.hw + 0.6) / R) / D2R; gaps.push([rm.th - d, rm.th + d, rm.y, rm.h + 0.35]); }   // update 58: the ring starts inside the ceiling slab (0.7 left a strip of sky)
    { const d = (7.3 / R) / D2R; gaps.push([LW.mineTh - d, LW.mineTh + d, Y.low - 4, wallTop - Y.low + 6]); }   // update 57: the whole column - the mouth's own rock panel fills it
    // update 59: no gap in the ring for the river - the tunnels run along the arc at r 104, well inside the wall (the gap was the sky strip beside each arch)
    gaps.sort((p, q) => p[0] - q[0]);
    const spans = [[LW.west.th0 - 0.5, LW.west.th1 + 0.5, Y.riverBed - 4], [LW.east.th0, LW.east.th1, Y.low - 4]];   // update 53: each band's wall starts under ITS floor (the river's bed rose above the gallery)
    for (const [s0, s1, yBot] of spans) {
      let th = s0;
      for (const [g0, g1, yF, hD] of gaps) { if (g1 < s0 || g0 > s1) continue; if (g0 > th) ring(R, th, g0, yBot, wallTop); ring(R, g0, g1, yBot, yF - 0.3); ring(R, g0, g1, yF + hD, wallTop); th = g1; }
      if (th < s1) ring(R, th, s1, yBot, wallTop);
    }
    // the closed sectors: rock straight up from the park's edge at TR (gaps for the hospital and the house), a rock ledge out to R at the wall top
    const gapsT = city.lowerRooms.filter((rm) => Math.abs(rm.wallR - TR) < 2).map((rm) => { const d = ((rm.hw + 0.6) / TR) / D2R; return [rm.th - d, rm.th + d, rm.y, rm.h + 0.35]; }).sort((p, q) => p[0] - q[0]);
    for (const [s0, s1] of [[LW.east.th1, LW.west.th0], [LW.west.th1, LW.east.th0 + 360]]) {
      let th = s0;
      for (const [g0, g1, yF, hD] of gapsT) { const a0 = g0 < s0 - 180 ? g0 + 360 : g0, a1 = g1 < s0 - 180 ? g1 + 360 : g1; if (a1 < s0 || a0 > s1) continue; if (a0 > th) ring(TR, th, a0, Y.park - 1, wallTop); ring(TR, a0, a1, Y.park - 1, yF - 0.3); ring(TR, a0, a1, yF + hD, wallTop); th = a1; }
      if (th < s1) ring(TR, th, s1, Y.park - 1, wallTop);
      const ledge = sector(TR - 0.2, R + 0.2, s0, s1, wallTop - 0.2, rock(6, 2), 24); ledge.material.side = THREE.DoubleSide;
    }
    // the bands' four ends: a radial face of rock from TR out to R, floor to wall top (the sky showed through)
    for (const [t, yF, river] of [[LW.west.th0, Y.riverBed - 4, true], [LW.west.th1, Y.riverBed - 4, true], [LW.east.th0, Y.low - 4, false], [LW.east.th1, Y.low - 4, false]]) {
      // update 57: at the river's two ends the face leaves the tunnel's mouth open (it stood right across the arch): rock either side of
      // the river, rock above the arch wall and under the bed
      const em = rock(4, 6); em.side = THREE.DoubleSide;
      const pieces = river ? [[TR - 0.3, LW.riverR0 - 1.0, yF, wallTop], [LW.riverR1 + 1.0, R + 0.3, yF, wallTop], [LW.riverR0 - 1.4, LW.riverR1 + 1.4, Math.max(Y.walk + 0.3, Y.water - 0.5 + C.culvert.h + 0.3), wallTop], [LW.riverR0 - 1.4, LW.riverR1 + 1.4, yF, Y.riverBed - 0.9]] : [[TR - 0.3, R + 0.3, yF, wallTop]];
      for (const [q0, q1, y0, y1] of pieces) { const [ea, eb] = pt((q0 + q1) / 2, t); const ew = new THREE.Mesh(new THREE.BoxGeometry(q1 - q0, y1 - y0, 0.5), em); ew.position.set(eb, (y0 + y1) / 2, ea); ew.rotation.y = t * D2R - Math.PI / 2; grp.add(ew); }
      const [q0a, q0b] = pt(TR, t), [q1a, q1b] = pt(R, t); wallSeg(q0a, q0b, q1a, q1b, 0.4);
    }
    // the dome: the same lathe as upstairs, opening into the glass shaft (radius shaftR1) instead of the light hole
    const SR = LW.shaftR, SR2 = LW.shaftR2 || SR, pts = [], N = 16;   // update 58: the dome opens into the funnel's wide end
    for (let i = 0; i <= N; i++) { const t = i / N; const rr = R - (R - SR2) * Math.sin(t * Math.PI / 2); const yy = wallTop + (apex - wallTop) * Math.sin(t * Math.PI / 2); pts.push(new THREE.Vector2(rr, yy)); }
    const domeGeo = new THREE.LatheGeometry(pts, 96);
    { const p = domeGeo.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), rr = Math.hypot(x, z), th2 = Math.atan2(x, z); if (rr < SR2 + 1) continue; const k = (rr - SR2) / (R - SR2); const nse = 1.6 * Math.sin(th2 * 5 + rr * 0.12) * Math.sin(y * 0.4 + th2 * 3) + 0.9 * Math.sin(th2 * 13 + rr * 0.3); const rim = Math.min(1, Math.max(0, (R - rr) / 12)); p.setY(i, y + nse * (0.4 + 0.6 * k) * Math.min(1, (rr - SR2 - 1) / 4) * rim); } domeGeo.computeVertexNormals(); }
    const dm = rock(24, 4); dm.side = THREE.BackSide; grp.add(new THREE.Mesh(domeGeo, dm));
    cyl(R - 0.3, -180, 180, wallTop - 0.9, wallTop + 1.1, rock(24, 1), true, 96);
    // the shaft: rock all the way up to the glass ring, gold bands every 25 m, a green beam of light down it
    const shaftTop = C.levels.plaza - 0.6;
    // update 58: a FUNNEL - shaftR at the glass ring, shaftR2 where it opens into the park's ceiling: from the glass you look
    // down onto the fountain, the benches, the beds and the near trees, not into a pipe
    const rAt = (yy) => SR + (SR2 - SR) * (shaftTop - yy) / (shaftTop - (apex - 0.5));
    { const sm = rock(16, 30); sm.side = THREE.BackSide; const cone = new THREE.Mesh(new THREE.CylinderGeometry(SR, SR2, shaftTop - (apex - 0.5), 64, 12, true), sm); cone.position.y = (shaftTop + apex - 0.5) / 2; grp.add(cone); }
    for (let yy = apex + 10; yy < shaftTop - 5; yy += 25) cyl(rAt(yy) - 0.15, -180, 180, yy, yy + 0.6, gold, true, 64);
    const beamM = new THREE.MeshBasicMaterial({ color: 0xa8ffc8, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    beamM.opacity = 0.012; const beam = new THREE.Mesh(new THREE.CylinderGeometry(SR * 0.9, SR2 * 1.05, apex - Y.park + 6, 40, 1, true), beamM); beam.position.y = (apex + Y.park) / 2 + 2; grp.add(beam); city.keepExtra.push(beam); city.lowerBeam = beam;
    const pool = new THREE.Mesh(new THREE.CircleGeometry(SR * 1.3, 40), new THREE.MeshBasicMaterial({ color: 0xa0ffc0, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false })); pool.rotation.x = -Math.PI / 2; pool.position.y = Y.park + 0.96; grp.add(pool); city.keepExtra.push(pool);
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
    // update 55: into the north tunnel's far end, then along the tunnel's arc, out through its arch to the jetty
    const CN = city.lowerCulvertN, rmL = CN.rm, tE = CN.endTh;
    const wE = CN.endY + 0.5;   // update 59: the tunnel climbs 1:30 - the spiral meets its water line at the far end
    P.push([...pt(rmL + 18, tE - 1), wE + 1.4]); P.push([...pt(rmL + 8, tE - 9), wE + 0.6]); P.push([...pt(rmL + 0.8, tE - 5.2), wE + 0.15]); P.push([...pt(rmL, tE - 0.2), wE]);
    for (const t of [tE + (LW.west.th0 - tE) * 0.5, LW.west.th0 + 0.5, LW.west.th0 + 4]) P.push([...pt(rmL, t), CN.yAt(t)]);
    P.push([city.lowerJetty.boatA, city.lowerJetty.boatB, Y.water]);
    const curve = new THREE.CatmullRomCurve3(P.map(([a, b, y]) => new THREE.Vector3(b, y, a)), false, "catmullrom", 0.3);
    city.rideCurve = curve; city.rideLen = curve.getLength();
    // the tube: from the court tunnel's end to the north mouth — rock, a water strip, cage lamps every 22 m
    const tunM = rock(4, 4); tunM.side = THREE.DoubleSide; if (tunM.map) { tunM.emissiveMap = tunM.map; tunM.emissive = new THREE.Color(0xffffff); tunM.emissiveIntensity = 0.34; }   // lit by its own texture: a lamp every 12 m is not enough in a spiral
    const prof = [[-W / 2, -1.4], [-W / 2, 0]]; { const N = 12; for (let i = 0; i <= N; i++) { const t = i / N; prof.push([-W / 2 * Math.cos(t * Math.PI), Hh * Math.sin(t * Math.PI) * 0.62 + (1 - Math.abs(Math.cos(t * Math.PI))) * Hh * 0.38]); } } prof.push([W / 2, 0], [W / 2, -1.4]);
    // find the parameter where the court tunnel ends (its last point is P[6]) and where the north mouth is (P[len-3])
    const uOf = (idx) => { const target = curve.points[idx]; let best = 0, bd = 1e9; for (let i = 0; i <= 400; i++) { const u = i / 400, q = curve.getPointAt(u); const d = q.distanceTo(target); if (d < bd) { bd = d; best = u; } } return best; };
    const uStart = uOf(6) - 0.004, uEnd = uOf(P.length - 5) + 0.002;   // from the court tunnel's end to the north tunnel's far end
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
