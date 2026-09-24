import * as THREE from "three";
import { CFG } from "./config.js";
import { E, D2R, cityWorld, lakeNorm, lakeOutline } from "./eternius_frame.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";   // update 41

// ============================================================================
// update 40: everything that is BUILT in Eternius City — the mountain, the castle,
// the lake and its bridge, the hallway, the cavern with its terraces, stairs,
// river, altar, homes, market, inn, throne hall and vault. Pure geometry: the
// rules (floors, walls, trade, talk) live in eternius.js.
//
// Every generated prop (Higgsfield) has a code fallback so the city stands
// while the models are still being made: see prop().
// ============================================================================

export function buildCity(city) {
  const g = city.g, w = g.world, A = g.assets, scene = g.scene, C = E(), L = C.levels;
  const grp = new THREE.Group();
  grp.position.set(C.cx, 0, C.cz); grp.rotation.y = C.grpYaw;
  scene.add(grp); city.grp = grp;

  // ---------------- materials ----------------
  const sand = (rx, rz) => { const m = w.mat("t_sandstone", rx, rz, 0xc8a870); m.emissive = new THREE.Color(0x4a3c26); m.emissiveIntensity = 0.42; return m; };
  const rock = (rx, rz) => { const m = w.mat("t_cavern", rx, rz, 0x6b5238); m.emissive = new THREE.Color(0x3a2c1c); m.emissiveIntensity = 0.5; return m; };
  const mountainM = (rx, rz) => { const m = w.mat(A.tex.t_mountain ? "t_mountain" : "t_cavern", rx, rz, 0x7a5a3c); m.vertexColors = true; return m; };
  const goldM = () => { const m = w.mat("t_goldpanel", 2, 2, 0xd4a72c); m.metalness = 0.55; m.roughness = 0.35; m.emissive = new THREE.Color(0x4a3608); m.emissiveIntensity = 0.35; return m; };
  const gold = goldM();
  const goldPlain = new THREE.MeshStandardMaterial({ color: 0xd9ad2e, metalness: 0.6, roughness: 0.3, emissive: 0x3a2a06 });
  const goldBright = new THREE.MeshStandardMaterial({ color: 0xf0c440, metalness: 0.7, roughness: 0.25, emissive: 0x5a4008, emissiveIntensity: 0.5 });
  const gem = new THREE.MeshStandardMaterial({ color: 0x2fdc5a, emissive: 0x1fbf46, emissiveIntensity: 1.4, roughness: 0.2 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2b2620, roughness: 0.9 });
  const carpetM = (rx = 1, ry = 1) => { const m = w.mat(A.tex.t_greencarpet ? "t_greencarpet" : "t_rug", rx, ry, 0x1f5a2a); if (!A.tex.t_greencarpet) m.color = new THREE.Color(0x2a6a34); m.emissive = new THREE.Color(0x0c2a10); m.emissiveIntensity = 0.5; return m; };
  const latticeM = () => { if (A.tex.t_goldlattice) { const m = w.mat("t_goldlattice", 1, 1, 0xd4a72c); m.transparent = true; m.side = THREE.DoubleSide; m.emissive = new THREE.Color(0x4a3608); m.emissiveIntensity = 0.5; return m; } return goldPlain; };
  const glowM = new THREE.MeshBasicMaterial({ color: 0xffd27a });
  const greenGlowM = new THREE.MeshBasicMaterial({ color: 0x8cff9a });
  const waterMat = () => { const m = new THREE.MeshStandardMaterial({ map: A.tex.t_water ? A.tex.t_water.clone() : null, color: A.tex.t_water ? 0xffffff : 0x3c7a8a, transparent: true, opacity: 0.86, roughness: 0.2, metalness: 0.05, emissive: 0x0a2a32 }); if (m.map) { m.map.wrapS = m.map.wrapT = THREE.RepeatWrapping; m.map.needsUpdate = true; } return m; };
  const flTex = new THREE.CanvasTexture(flameCanvas()); flTex.colorSpace = THREE.SRGBColorSpace;
  const flameM = new THREE.MeshBasicMaterial({ map: flTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  city.mats = { sand, rock, gold, goldPlain, goldBright, gem, dark, glowM, greenGlowM, carpetM, latticeM, flameM, waterMat };
  // update 43: the walls glow a little of their own (emissive), the generated models did not — under the cavern's dim
  // lamps a dark green door read as black. Every model clone the city places carries the same self-light now.
  const warmProp = (m, k = 0.3) => { m.traverse((o) => { if (o.isMesh && o.material) { o.material = o.material.clone(); if (o.material.map) { o.material.emissiveMap = o.material.map; o.material.emissive = new THREE.Color(0xffffff); o.material.emissiveIntensity = k; } } }); return m; };
  city.warmProp = warmProp;
  city.flames = []; city.lanterns = []; city.lights = []; city.flags = []; city.banners = []; city.walls = []; city.doors = []; city.nightGlows = [];

  // ---------------- primitives (local: x = b, z = a) ----------------
  const box = (wd, h, d, x, y, z, m, ry = 0, parent = grp) => { const mm = new THREE.Mesh(new THREE.BoxGeometry(wd, h, d), m); mm.position.set(x, y, z); mm.rotation.y = ry; mm.castShadow = mm.receiveShadow = true; parent.add(mm); return mm; };
  // a flat ring sector (θ from +z toward +x; RingGeometry counts from +x toward -z after rotateX, so [th0, th1] -> [90-th1, 90-th0])
  const sector = (r0, r1, th0, th1, y, m, segs = 40) => {
    const geo = new THREE.RingGeometry(Math.max(0.01, r0), r1, segs, 1, (90 - th1) * D2R, (th1 - th0) * D2R);
    geo.rotateX(Math.PI / 2);
    const mm = new THREE.Mesh(geo, m.clone()); mm.material.side = THREE.DoubleSide; mm.position.y = y; mm.receiveShadow = true; grp.add(mm); return mm;
  };
  const cyl = (r, th0, th1, y0, y1, m, inside = false, segs = 48) => {
    const geo = new THREE.CylinderGeometry(r, r, y1 - y0, segs, 1, true, th0 * D2R, (th1 - th0) * D2R);
    const mm = new THREE.Mesh(geo, inside ? (() => { const mc = m.clone(); mc.side = THREE.BackSide; return mc; })() : m); mm.position.y = (y0 + y1) / 2; grp.add(mm);
    return mm;
  };
  const wallSeg = (a0, b0, a1, b1, t = 0.4) => { const s = { a0, b0, a1, b1, t }; city.walls.push(s); return s; };
  const obst = (a, b, r) => w.addTree(...cityWorld(a, b), r, "city");   // update 42: tagged — not a tree
  const pillar = (b, y, a, r, h, m = gold, cap = true) => {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.1, h, 12), m); p.position.set(b, y + h / 2, a); p.castShadow = true; grp.add(p);
    if (cap) { box(r * 2.6, r * 0.6, r * 2.6, b, y + r * 0.3, a, goldPlain); box(r * 2.6, r * 0.6, r * 2.6, b, y + h - r * 0.3, a, goldPlain); }
    obst(a, b, r + 0.2); return p;
  };
  // a pointed-arch outline (span wd, apex at h): a frame band of thickness t, extruded depth d
  const archShape = (wd, h, t, filled = false) => {
    const W = wd / 2, R = wd, ys = h - 0.866 * wd;
    const outer = new THREE.Shape();
    const arc = (path, cx, cy, r, a0, a1, n = 14) => { for (let i = 0; i <= n; i++) { const t2 = a0 + (a1 - a0) * (i / n); path.lineTo(cx + r * Math.cos(t2), cy + r * Math.sin(t2)); } };
    outer.moveTo(-W - t, 0); outer.lineTo(-W - t, ys);
    arc(outer, W, ys, R + t, Math.PI, Math.PI * 2 / 3 + Math.acos((W) / (R + t)) * 0 + 0, 14);
    arc(outer, -W, ys, R + t, Math.PI / 3, 0, 14);
    outer.lineTo(W + t, 0); outer.closePath();
    if (!filled) {
      const inner = new THREE.Path();
      inner.moveTo(-W, 0); inner.lineTo(-W, ys);
      arc(inner, W, ys, R, Math.PI, Math.PI * 2 / 3, 14);
      arc(inner, -W, ys, R, Math.PI / 3, 0, 14);
      inner.lineTo(W, 0); inner.closePath();
      outer.holes.push(inner);
    }
    return outer;
  };
  const archFrame = (b, y, a, wd, h, t, d, m = gold, ry = 0) => {
    const geo = new THREE.ExtrudeGeometry(archShape(wd, h, t), { depth: d, bevelEnabled: false });
    geo.translate(0, 0, -d / 2);
    const mm = new THREE.Mesh(geo, m); mm.position.set(b, y, a); mm.rotation.y = ry; mm.castShadow = true; grp.add(mm); return mm;
  };
  const archFill = (b, y, a, wd, h, m, ry = 0) => {
    const geo = new THREE.ShapeGeometry(archShape(wd, h, 0, true));
    const mm = new THREE.Mesh(geo, m); mm.position.set(b, y, a); mm.rotation.y = ry; mm.material.side = THREE.DoubleSide; grp.add(mm); return mm;
  };
  // a wall (width wd along local x, height h, thickness t) with a pointed-arch doorway of span dw and height dh
  const archWall = (b, y, a, wd, h, t, dw, dh, m, ry = 0) => {
    const shape = new THREE.Shape(); shape.moveTo(-wd / 2, 0); shape.lineTo(wd / 2, 0); shape.lineTo(wd / 2, h); shape.lineTo(-wd / 2, h); shape.closePath();
    const hole = archShape(dw, dh, 0, true); const path = new THREE.Path(); path.curves = hole.curves; shape.holes.push(path);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false }); geo.translate(0, 0, -t / 2);
    const mm = new THREE.Mesh(geo, m); mm.position.set(b, y, a); mm.rotation.y = ry; mm.castShadow = mm.receiveShadow = true; grp.add(mm); return mm;
  };
  // a generated prop at local (a, b) facing polar direction faceDeg; `fb()` builds the code stand-in
  const prop = (id, a, b, y, faceDeg, fb, scaleMul = 1) => {
    const asset = A.glb[id];
    if (asset) {
      const m = warmProp(asset.model.clone()); const [x, z] = cityWorld(a, b);
      m.position.set(x, y, z); m.rotation.y = C.grpYaw + faceDeg * D2R; if (scaleMul !== 1) m.scale.multiplyScalar(scaleMul); scene.add(m); return m;
    }
    return fb ? fb() : null;
  };
  city.prims = { box, sector, cyl, wallSeg, obst, pillar, archFrame, archFill, archWall, prop };

  // ---------------- decorations ----------------
  city.addFlag = (bx, y, az, faceDeg, tall = false) => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, tall ? 9 : 6, 6), goldPlain); pole.position.set(bx, y + (tall ? 4.5 : 3), az); grp.add(pole);
    const tex = A.tex.t_flag;
    const m = new THREE.MeshStandardMaterial({ map: tex || null, color: tex ? 0xffffff : 0x1f5a2a, side: THREE.DoubleSide, roughness: 0.9, emissive: 0x2a1c00, emissiveIntensity: 0 });
    const f = new THREE.Mesh(new THREE.PlaneGeometry(tall ? 2.4 : 1.8, tall ? 4.2 : 2.4, 6, 4), m); f.position.set(bx, y + (tall ? 6.4 : 4.4), az); f.rotation.y = faceDeg * D2R;
    f.geometry.translate(tall ? 1.2 : 0.9, 0, 0);
    grp.add(f); city.flags.push(f);
  };
  // a long banner hung flat on a wall face (faceDeg = the direction the face looks)
  city.addBanner = (bx, y, az, faceDeg, wd = 2.4, h = 9) => {
    const tex = A.tex.t_flag;
    const m = new THREE.MeshStandardMaterial({ map: tex || null, color: tex ? 0xffffff : 0x1f5a2a, side: THREE.DoubleSide, roughness: 0.9, emissive: 0x2a1c00, emissiveIntensity: 0 });
    if (m.map) { m.map = m.map.clone(); m.map.repeat.set(1, h / (wd * 1.33)); m.map.wrapT = THREE.RepeatWrapping; m.map.needsUpdate = true; }
    const f = new THREE.Mesh(new THREE.PlaneGeometry(wd, h), m); f.position.set(bx, y - h / 2, az); f.rotation.y = faceDeg * D2R; grp.add(f); city.banners.push(f);   // update 42: a banner hangs still
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, wd + 0.6, 6), goldPlain); rod.position.set(bx, y + 0.1, az); rod.rotation.z = Math.PI / 2; rod.rotation.y = faceDeg * D2R; grp.add(rod);
  };
  // update 41: a lamp is a VIRTUAL light — a PointLight that is never rendered (visible = false). main.js keeps a
  // small pool of real lights and hands them to the nearest, brightest virtual ones each frame (initLightPool).
  // Every lamp used to be a real light: 192 of them, in every shader, for every pixel — 50 ms a frame at 1440p.
  city.emit = (parent, x, y, z, color, on, dist, flags = {}) => {
    const l = new THREE.PointLight(color, on, dist, 2); l.position.set(x, y, z); l.visible = false; l.userData.virtual = true; parent.add(l);
    if (flags.night) city.lights.push({ l, night: true, on: flags.on !== undefined ? flags.on : on });
    return l;
  };
  // update 43: a flag on a pole that leans out of a wall — socketed in the stone, 55 degrees up — with the pennant
  // hanging along the pole's length (its top edge IS the pole; you see it from its side). dirDeg = where the pole leans.
  city.addPoleFlag = (b, y, a, dirDeg, lean = 0.95, Lp = 5.5) => {
    const gg = new THREE.Group(); gg.position.set(b, y, a); gg.rotation.order = "YXZ"; gg.rotation.y = dirDeg * D2R; gg.rotation.x = lean; grp.add(gg);   // local +z leans out
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, Lp, 6), goldPlain); pole.position.set(0, Lp / 2, 0); gg.add(pole);
    const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 0.8, 8), gold); sock.position.set(0, 0.35, 0); gg.add(sock);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 6), goldBright); tip.position.set(0, Lp + 0.2, 0); gg.add(tip);
    const fl = new THREE.Group(); fl.rotation.x = -lean; gg.add(fl);   // world-upright frame at the socket: y up, z = the lean direction
    const z1 = Lp * Math.sin(lean), y1 = Lp * Math.cos(lean), h0 = 1.5, h1 = 2.4;
    const shp = new THREE.Shape(); shp.moveTo(0.5, 0.35); shp.lineTo(z1 - 0.3, y1 - 0.2); shp.lineTo(z1 - 0.3, y1 - 0.2 - h1); shp.lineTo(0.8, 0.35 - h0); shp.closePath();
    const geo = new THREE.ShapeGeometry(shp); geo.rotateY(-Math.PI / 2);   // shape x -> local z
    { const uv = geo.attributes.uv; const bb = geo.boundingBox || (geo.computeBoundingBox(), geo.boundingBox); const p = geo.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, (p.getZ(i) - bb.min.z) / (bb.max.z - bb.min.z), (p.getY(i) - bb.min.y) / (bb.max.y - bb.min.y)); }
    const tex = A.tex.t_flag;
    const m = new THREE.MeshStandardMaterial({ map: tex || null, color: tex ? 0xffffff : 0x1f5a2a, side: THREE.DoubleSide, roughness: 0.9, emissive: 0x2a1c00, emissiveIntensity: 0 });
    const f = new THREE.Mesh(geo, m); fl.add(f); city.flags.push(f);
    return gg;
  };
  city.addWallFlag = (thDeg, y, lean = 0.95) => { const R = C.wallR, th = thDeg * D2R; return city.addPoleFlag((R - 0.3) * Math.sin(th), y, (R - 0.3) * Math.cos(th), thDeg + 180, lean); };
  // the old small lantern (kept for the shelves and stalls)
  city.addLantern = (bx, y, az, night, cave, lit = 0) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 2.6, 6), goldPlain); post.position.set(bx, y + 1.3, az); grp.add(post);
    const cage = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.5), goldPlain); cage.position.set(bx, y + 2.9, az); grp.add(cage);
    const glow = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.5, 0.34), glowM); glow.position.set(bx, y + 2.9, az); grp.add(glow);
    city.lanterns.push({ glow, night });
    if (lit) city.emit(grp, bx, y + 2.9, az, 0xffc35a, lit, 34, { night, on: lit });
    else if (night) city.emit(grp, bx, y + 2.9, az, 0xffc35a, 0, 26, { night: true, on: 3.2 });
    obst(az, bx, 0.25);
  };
  // update 40: the golden lamppost with a green gem (Higgsfield: et_lamppost); lights the ground around it
  city.addLamppost = (a, b, y, night, lit = 3.2) => {
    const fb = () => {
      const gg = new THREE.Group(); gg.position.set(b, y, a); grp.add(gg);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.55, 0.5, 8), goldPlain); base.position.y = 0.25; gg.add(base);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 4.2, 8), gold); post.position.y = 2.6; gg.add(post);
      for (const k of [1.2, 2.6]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 6, 12), goldPlain); ring.position.y = k; ring.rotation.x = Math.PI / 2; gg.add(ring); }
      const cage = new THREE.Mesh(new THREE.OctahedronGeometry(0.55), goldPlain); cage.position.y = 5.0; gg.add(cage);
      const g2 = new THREE.Mesh(new THREE.OctahedronGeometry(0.34), gem); g2.position.y = 5.0; gg.add(g2);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 6), goldPlain); tip.position.y = 5.75; gg.add(tip);
      return gg;
    };
    prop("et_lamppost", a, b, y, 0, fb);
    city.emit(grp, b, y + 4.8, a, 0x9cffb0, night ? 0 : lit, 30, { night, on: lit, green: true });
    obst(a, b, 0.45);
  };
  city.addBrazier = (bx, y, az, big = false) => {
    const s = big ? 1.7 : 1;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * s, 0.32 * s, 2.2 * s, 8), goldPlain); stem.position.set(bx, y + 1.1 * s, az); grp.add(stem);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.7 * s, 0.35 * s, 0.5 * s, 10), goldPlain); bowl.position.set(bx, y + 2.4 * s, az); grp.add(bowl);
    city.addFlame(bx, y + 3.2 * s, az, s);
    obst(az, bx, 0.5 * s);
  };
  city.addFlame = (bx, y, az, s = 1, parent = grp) => {
    for (const rot of [0, Math.PI / 2]) { const f = new THREE.Mesh(new THREE.PlaneGeometry(1.1 * s, 1.5 * s), flameM); f.position.set(bx, y, az); f.rotation.y = rot; parent.add(f); city.flames.push(f); }
    city.emit(parent, bx, y, az, 0xffa040, 2.2 * s, 18 * s, { flame: true });
  };
  // update 40: a golden Eternial statue raising a bowl of fire (Higgsfield: et_torchbearer); stands against a wall, facing faceDeg
  city.addTorchbearer = (a, b, y, faceDeg) => {
    const m = prop("et_torchbearer", a, b, y, faceDeg, () => {
      const gg = new THREE.Group(); gg.position.set(b, y, a); gg.rotation.y = faceDeg * D2R; grp.add(gg);
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 1.6), sand(1, 1)); plinth.position.y = 0.3; gg.add(plinth);
      const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 1.6, 10), goldPlain); legs.position.y = 1.4; gg.add(legs);
      const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 1.1, 4, 10), gold); torso.position.y = 2.9; gg.add(torso);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), goldPlain); head.position.set(0, 3.95, 0.05); gg.add(head);
      for (const s of [-1, 1]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.42, 5), goldPlain); ear.position.set(s * 0.18, 4.32, 0); gg.add(ear); }
      for (const s of [-1, 1]) { const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.5, 8), goldPlain); arm.position.set(s * 0.45, 4.1, 0.15); arm.rotation.z = s * 0.25; gg.add(arm); }
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.4, 0.45, 12), goldBright); bowl.position.set(0, 4.95, 0.15); gg.add(bowl);
      return gg;
    });
    const s = 1.0, fy = y + 5.6;
    city.addFlame(b - Math.sin(faceDeg * D2R) * 0.0, fy, a, 1.1);
    obst(a, b, 0.9);
    return m;
  };
  // update 40: a golden lamp hanging from the ceiling on a chain (Higgsfield: et_ceilinglamp), warm light below
  city.addCeilingLamp = (a, b, yCeil, drop = 2.2, green = false) => {
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, drop, 5), dark); chain.position.set(b, yCeil - drop / 2, a); grp.add(chain);
    const y = yCeil - drop;
    prop("et_ceilinglamp", a, b, y - CFG.modelScale.et_ceilinglamp, 0, () => {
      const gg = new THREE.Group(); gg.position.set(b, y, a); grp.add(gg);
      const top = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.4, 8), goldPlain); top.position.y = -0.1; gg.add(top);
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.3, 0.9, 8, 1, true), latticeM()); body.position.y = -0.75; gg.add(body);
      const core = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.2, 0.8, 8), green ? greenGlowM : glowM); core.position.y = -0.75; gg.add(core);
      const bot = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.5, 8), goldPlain); bot.position.y = -1.4; bot.rotation.x = Math.PI; gg.add(bot);
      return gg;
    });
    city.emit(grp, b, y - 1.2, a, green ? 0x9cffb0 : 0xffc35a, green ? 1.4 : 2.4, 22, {});
  };

  buildMountain(city, grp, mountainM, dark, rock);
  buildCastle(city, grp, box, sand, rock, gold, goldPlain, goldBright, gem, dark, wallSeg, obst, archFrame, archFill, archWall, latticeM, prop, waterMat, pillar);
  buildCavern(city, grp, box, sector, cyl, sand, rock, gold, goldPlain, goldBright, gem, dark, wallSeg, obst, pillar, archFrame, archWall, carpetM, waterMat, prop, glowM, greenGlowM, latticeM);
  mergeStatic(city, grp);   // update 41: 2000 boxes and cylinders become ~150 draw calls
  // the map place, the safe spot the portals land you on
  if (!CFG.locations.some((l) => l.id === "eternius")) {
    CFG.locations.push({ id: "eternius", x: C.cx, z: C.cz, r: C.castle.a1 - 4 });
    CFG.portals.arrivals.eternius = cityWorld(C.bridge.a1 + 6, 0);
  }
}

// ============================================================================
// the MOUNTAIN: a craggy heightfield with a ridge cluster, dark crevices, a ragged
// shaft mouth. city.mountainH() is the same function the world's ground uses.
// ============================================================================
function buildMountain(city, grp, mountainM, dark, rock) {
  const C = E(), R = C.mountainR, NR = 64, NT = 168;
  const pos = [], uv = [], col = [], idx = [];
  const shaftR = (th) => C.shaftR * (1 + 0.22 * Math.sin(3 * th + 1.1) + 0.12 * Math.sin(7 * th + 0.4));
  for (let i = 0; i <= NR + 1; i++) {
    for (let j = 0; j <= NT; j++) {
      const th = (j / NT) * Math.PI * 2;
      // the grid follows the ragged foot: the last ring sits exactly on the edge (height 0), outcrops included;
      // update 41: one more ring — a rock apron 14 m out, just under the sand, so bays and the castle notch never show the void
      const Re = city.edgeR(Math.cos(th), Math.sin(th)) ;
      if (i === NR + 1) { const lx = (Re + 14) * Math.sin(th), lz = (Re + 14) * Math.cos(th); pos.push(lx, -0.35, lz); uv.push(lx / 16, lz / 16); col.push(1, 1, 1); continue; }
      const r = Re * Math.pow(i / NR, 0.72);
      let lx = r * Math.sin(th), lz = r * Math.cos(th);
      const [wx, wz] = cityWorld(lz, lx);
      let h = city.mountainH(wx, wz);
      // the shaft's mouth: the surface dips into the ragged hole
      const rs = shaftR(th);
      if (r < rs + 4) { const t = Math.max(0, (r - rs) / 4); h = C.peakH - 6 + 6 * t * t; }
      if (r < rs) { lx = rs * Math.sin(th); lz = rs * Math.cos(th); h = C.peakH - 6; }
      // update 42: the foot ring is lifted over the hallway's roof where the tunnel enters the rock — the cliff face used to
      // cross the corridor two metres behind the mountain gate and fill the doorway with rock
      if (lz > 0 && Math.abs(lx) < C.tunnel.hw + 2.4) { if (i === NR) h = C.levels.court + 19.5; else if (i === NR - 1) h = Math.max(h, C.levels.court + 19.5); }   // update 43: the rock begins above the gate's frame
      pos.push(lx, h, lz); uv.push(lx / 16 + h / 40, lz / 16 + h / 11);   // the height feeds the uv so the cliff faces are not streaked
      col.push(1, 1, 1);
    }
  }
  for (let i = 0; i < NR + 1; i++) for (let j = 0; j < NT; j++) {
    if (i === NR) { const th = ((j + 0.5) / NT) * Math.PI * 2; if (Math.cos(th) > 0 && Math.abs(Math.sin(th)) * R < C.tunnel.hw + 3.2) continue; }   // update 42: no apron across the corridor
    const p0 = i * (NT + 1) + j, p1 = p0 + 1, p2 = p0 + NT + 1, p3 = p2 + 1;
    idx.push(p0, p2, p1, p1, p2, p3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx); geo.computeVertexNormals();
  // crevices go dark, the sunlit shoulders lighter: colour by slope and height
  const nrm = geo.attributes.normal, pp = geo.attributes.position, cc = new Float32Array(pp.count * 3);
  for (let i = 0; i < pp.count; i++) {
    const ny = nrm.getY(i), y = pp.getY(i);
    const steep = 1 - Math.max(0, ny);
    const k = 0.62 + 0.38 * (1 - steep) + 0.12 * Math.min(1, y / C.peakH) - 0.18 * (Math.sin(pp.getX(i) * 0.21) * Math.sin(pp.getZ(i) * 0.19) > 0.55 ? 1 : 0);
    cc[i * 3] = k * 1.0; cc[i * 3 + 1] = k * 0.92; cc[i * 3 + 2] = k * 0.82;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(cc, 3));
  const mesh = new THREE.Mesh(geo, mountainM(1, 1)); mesh.receiveShadow = true; mesh.castShadow = true; grp.add(mesh);
  city.mountainMesh = mesh;
  // the shaft: a ragged rock tube from the cavern's ceiling up through the peak
  const N = 40, rows = 10, sp = [], si = [], su = [];
  for (let i = 0; i <= rows; i++) {
    const y = C.cavernH + (C.peakH - 4 - C.cavernH) * (i / rows);
    for (let j = 0; j <= N; j++) {
      const th = (j / N) * Math.PI * 2;
      const rr = shaftR(th) * (1 + 0.08 * Math.sin(i * 1.7 + th * 2.3) * Math.sin(Math.PI * i / rows));   // update 43: flush at both ends
      sp.push(rr * Math.sin(th), y, rr * Math.cos(th)); su.push(j / N * 6, i / rows * 8);
    }
  }
  for (let i = 0; i < rows; i++) for (let j = 0; j < N; j++) { const p0 = i * (N + 1) + j, p1 = p0 + 1, p2 = p0 + N + 1, p3 = p2 + 1; si.push(p0, p1, p2, p1, p3, p2); }
  const sg = new THREE.BufferGeometry(); sg.setAttribute("position", new THREE.Float32BufferAttribute(sp, 3)); sg.setAttribute("uv", new THREE.Float32BufferAttribute(su, 2)); sg.setIndex(si); sg.computeVertexNormals();
  const sm = rock(1, 1); sm.side = THREE.DoubleSide;
  const shaft = new THREE.Mesh(sg, sm); grp.add(shaft);
  city.shaftR = shaftR;
}

// ============================================================================
// the CASTLE at the mountain's foot, its lake, moat and bridge, the hallway
// ============================================================================
function buildCastle(city, grp, box, sand, rock, gold, goldPlain, goldBright, gem, dark, wallSeg, obst, archFrame, archFill, archWall, latticeM, prop, waterMat, pillar) {
  const C = E(), L = C.levels, A = city.g.assets, w = city.g.world;
  const K = C.castle, GT = C.gate, y0 = L.court, H = K.wallH, T = 2;
  const ac = (K.a0 + K.a1) / 2, len = K.a1 - K.a0;
  // the plinth and the paved floor, a gold inlay way from gate to gate
  box(K.hw * 2 + 6, 2.4, len + 6, 0, y0 - 1.2, ac, sand(12, 8));
  box(K.hw * 2, 0.2, len, 0, y0 - 0.1, ac, sand(10, 6)).receiveShadow = true;
  box(8, 0.06, len, 0, y0 + 0.04, ac, gold);
  for (const s of [-1, 1]) box(0.5, 0.08, len, s * 4.3, y0 + 0.05, ac, goldPlain);
  // nobody climbs the plinth: its front and side edges are walls (the gate is the way)
  wallSeg(K.a1 + 3, -K.hw - 3, K.a1 + 3, -C.bridge.hw - 0.2, 0.3); wallSeg(K.a1 + 3, C.bridge.hw + 0.2, K.a1 + 3, K.hw + 3, 0.3);
  wallSeg(K.a0 - 3, -K.hw - 3, K.a1 + 3, -K.hw - 3, 0.3); wallSeg(K.a0 - 3, K.hw + 3, K.a1 + 3, K.hw + 3, 0.3);

  // ---- curtain walls: a dark plinth band, sandstone, gold coping, gold pilasters with gems, blind arches ----
  const wallRun = (bx0, bx1, az, sideWall = false) => {
    const bw = Math.abs(bx1 - bx0), bc = (bx0 + bx1) / 2;
    if (sideWall) { box(T, H, bw, az, y0 + H / 2, bc, sand(3, 10)); box(T + 0.5, 1.2, bw, az, y0 + 0.6, bc, dark); box(T + 0.5, 0.7, bw, az, y0 + H + 0.35, bc, gold); }
    else { box(bw, H, T, bc, y0 + H / 2, az, sand(bw / 4, H / 4)); box(bw, 1.2, T + 0.5, bc, y0 + 0.6, az, dark); box(bw, 0.7, T + 0.5, bc, y0 + H + 0.35, az, gold); }
    const n = Math.max(1, Math.round(bw / 6));
    for (let i = 0; i <= n; i++) {
      const p = bx0 + (bw / n) * i;
      if (sideWall) { box(T + 0.9, H + 0.9, 1.1, az, y0 + (H + 0.9) / 2, p, gold); if (i < n) for (const s of [-1, 1]) { const gg = new THREE.Mesh(new THREE.OctahedronGeometry(0.3), gem); gg.position.set(az + s * (T / 2 + 0.55), y0 + H * 0.62, p + bw / n / 2); grp.add(gg); } }
      else { box(1.1, H + 0.9, T + 0.9, p, y0 + (H + 0.9) / 2, az, gold); if (i < n) for (const s of [-1, 1]) { const gg = new THREE.Mesh(new THREE.OctahedronGeometry(0.3), gem); gg.position.set(p + bw / n / 2, y0 + H * 0.62, az + s * (T / 2 + 0.55)); grp.add(gg); } }
    }
    // crenellations along the top
    const m = Math.round(bw / 2.4);
    for (let i = 0; i < m; i += 2) { const p = bx0 + 1.2 + i * 2.4; if (sideWall) box(T + 0.2, 1.1, 1.4, az, y0 + H + 1.25, p, sand(1, 1)); else box(1.4, 1.1, T + 0.2, p, y0 + H + 1.25, az, sand(1, 1)); }
  };
  for (const az of [K.a1, K.a0]) {
    wallRun(-K.hw, -GT.hw - 1, az); wallRun(GT.hw + 1, K.hw, az);
    wallSeg(az, -K.hw, az, -GT.hw - 0.6, T / 2 + 0.3); wallSeg(az, GT.hw + 0.6, az, K.hw, T / 2 + 0.3);
  }
  for (const s of [-1, 1]) { wallRun(K.a0, K.a1, s * K.hw, true); wallSeg(K.a0, s * K.hw, K.a1, s * K.hw, T / 2 + 0.3); }

  // ---- the gates: a tall pointed arch with a golden lattice tympanum, gold jambs, gems ----
  const gateArchH = 15, gateW = GT.hw * 2;
  for (const az of [K.a1, K.a0]) {
    const front = az === K.a1;
    // the wall above the opening (a pointed-arch cut), the golden frame, the lattice in the arch's head
    archWall(0, y0, az, gateW + 2.4, H, T, gateW, gateArchH, sand(3, 3));
    archFrame(0, y0, az + (front ? T / 2 + 0.3 : -T / 2 - 0.3), gateW, gateArchH, 0.9, 0.7, gold);
    archFrame(0, y0, az - (front ? T / 2 + 0.3 : -T / 2 - 0.3), gateW, gateArchH, 0.9, 0.7, gold);
    const lat = archFill(0, y0 + GT.h, az, gateW, gateArchH - GT.h, latticeM()); lat.position.y = y0; lat.scale.set(1, 1, 1);
    // the lattice only fills the head of the arch: a dark band under it keeps the doorway open below GT.h
    lat.geometry = new THREE.ShapeGeometry(archShapeHead(gateW, gateArchH, GT.h));
    for (const s of [-1, 1]) box(1.1, GT.h, T + 1.2, s * (GT.hw + 0.55), y0 + GT.h / 2, az, goldPlain);
    box(gateW + 2.4, 0.5, T + 1.4, 0, y0 + GT.h + 0.25, az, goldBright);
    for (const s of [-1, 1]) { const g1 = new THREE.Mesh(new THREE.OctahedronGeometry(0.55), gem); g1.position.set(s * (GT.hw + 0.55), y0 + GT.h + 1.6, az + (front ? T / 2 + 0.9 : -T / 2 - 0.9)); grp.add(g1); }
    // gate towers: tall, banded, faceted golden spires, vertical banners
    for (const s of [-1, 1]) {
      const tb = s * (GT.hw + 6.5), TH = H + 14;
      box(8, TH, 8, tb, y0 + TH / 2, az, sand(2, 6));
      box(8.6, 1.0, 8.6, tb, y0 + 0.5, az, dark);
      for (const yy of [H - 1, H + 5, TH - 0.6]) box(8.6, 0.6, 8.6, tb, y0 + yy, az, gold);
      const spire = new THREE.Mesh(new THREE.ConeGeometry(5.2, 15, 8), gold); spire.position.set(tb, y0 + TH + 7.5, az); grp.add(spire);
      const tip = new THREE.Mesh(new THREE.OctahedronGeometry(0.8), gem); tip.position.set(tb, y0 + TH + 15.6, az); grp.add(tip);
      for (let k = 0; k < 2; k++) { const gg = new THREE.Mesh(new THREE.OctahedronGeometry(0.5), gem); gg.position.set(tb, y0 + 5 + k * 6, az + (front ? 4.95 : -4.95)); grp.add(gg); }   // update 43: only below the banner
      city.addBanner(tb, y0 + TH - 2, az + (front ? 4.6 : -4.6), front ? 0 : 180, 3.2, 11);   // update 42: in front of the bands, the gems in front of it
      wallSeg(az - 4, tb - 4, az + 4, tb - 4, 0.3); wallSeg(az - 4, tb + 4, az + 4, tb + 4, 0.3);
      wallSeg(az - 4, tb - 4, az - 4, tb + 4, 0.3); wallSeg(az + 4, tb - 4, az + 4, tb + 4, 0.3);
    }
  }
  // corner towers: octagonal, domed, gold-ribbed
  for (const az of [K.a1, K.a0]) for (const s of [-1, 1]) {
    const TH = H + 8, r = 4.6;
    const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r + 0.4, TH, 8), sand(3, 5)); t.position.set(s * K.hw, y0 + TH / 2, az); grp.add(t);
    for (const yy of [1.0, H + 0.3, TH - 0.4]) { const band = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.5, r + 0.5, 0.7, 8), yy < 2 ? dark : gold); band.position.set(s * K.hw, y0 + yy, az); grp.add(band); }
    const dome = new THREE.Mesh(new THREE.SphereGeometry(r + 0.2, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), gold); dome.position.set(s * K.hw, y0 + TH, az); grp.add(dome);
    for (let k = 0; k < 8; k++) { const rib = new THREE.Mesh(new THREE.TorusGeometry(r + 0.25, 0.09, 6, 24, Math.PI / 2), goldBright); rib.position.set(s * K.hw, y0 + TH, az); rib.rotation.y = k * Math.PI / 4; rib.rotation.z = 0; rib.rotation.x = 0; rib.rotation.order = "YXZ"; rib.rotation.x = -Math.PI / 2; rib.rotation.z = Math.PI / 2; grp.add(rib); }
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.7, 3.4, 6), goldBright); tip.position.set(s * K.hw, y0 + TH + r + 1.6, az); grp.add(tip);
    const gg = new THREE.Mesh(new THREE.OctahedronGeometry(0.5), gem); gg.position.set(s * K.hw, y0 + TH + r + 3.6, az); grp.add(gg);
    obst(az, s * K.hw, r + 0.3);
  }
  // needle spires along both side walls: tapered pylons with gold inlay and faceted tips
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
    const az = K.a0 + 7 + i * ((len - 14) / 3), TH = 26;
    const py = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 2.6, TH, 4), sand(2, 8)); py.position.set(s * K.hw, y0 + H + TH / 2 - 1, az); py.rotation.y = Math.PI / 4; grp.add(py);
    const inlay = new THREE.Mesh(new THREE.BoxGeometry(0.5, TH - 3, 0.5), goldBright); inlay.position.set(s * (K.hw - 2.1), y0 + H + TH / 2 - 2, az); grp.add(inlay);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(1.5, 7, 8), gold); cone.position.set(s * K.hw, y0 + H + TH + 2.5 - 1, az); grp.add(cone);
    const gg = new THREE.Mesh(new THREE.OctahedronGeometry(0.45), gem); gg.position.set(s * K.hw, y0 + H + TH + 6.4 - 1, az); grp.add(gg);
    box(5.4, 5, 5.4, s * K.hw, y0 + H + 1.5, az, sand(1, 1));
  }
  // the great golden dome over the mountain gate, and the mountain gate itself: a pointed arch cut into the rock face
  const bigDome = new THREE.Mesh(new THREE.SphereGeometry(10, 26, 14, 0, Math.PI * 2, 0, Math.PI / 2), gold); bigDome.position.set(0, y0 + H + 2, K.a0 - 5); grp.add(bigDome);
  const domeTip = new THREE.Mesh(new THREE.ConeGeometry(1.0, 4, 8), goldBright); domeTip.position.set(0, y0 + H + 14, K.a0 - 5); grp.add(domeTip);
  archFrame(0, y0, K.a0 - 2.6, C.tunnel.hw * 2 + 4, 18, 1.4, 1.2, gold);
  for (const s of [-1, 1]) city.addTorchbearer(K.a0 + 3.5, s * (C.tunnel.hw + 6), y0, 90 * (s > 0 ? -1 : 1) + 0);
  // flags on every wall, banners on the towers, the gold way's lampposts, the colonnades, palms and benches
  for (let i = 0; i < 6; i++) for (const s of [-1, 1]) city.addFlag(s * (K.hw - 1.2), y0 + H + 0.7, K.a0 + 5 + i * (len - 10) / 5, s > 0 ? -90 : 90);
  for (const az of [K.a1, K.a0]) for (const s of [-1, 1]) for (const bb of [22, 38, 52]) city.addFlag(s * bb, y0 + H + 0.7, az + (az === K.a1 ? -1.2 : 1.2), az === K.a1 ? 180 : 0);
  for (const az of [K.a0 + 9, K.a0 + 20, ac, K.a1 - 20, K.a1 - 9]) for (const s of [-1, 1]) city.addLamppost(az, s * 6.5, y0, true);
  for (const s of [-1, 1]) {
    const bx = s * (K.hw - 5.5);
    for (let i = 0; i <= 6; i++) { const az = K.a0 + 3 + i * ((len - 6) / 6); pillar(bx, y0, az, 0.6, 8, gold); if (i % 2 === 1) city.addTorchbearer(az, s * (K.hw - 2.2), y0, s > 0 ? -90 : 90); }
    box(1.4, 0.5, len - 6, bx, y0 + 8.25, ac, gold);
    box(3.2, 0.12, len - 6, s * (K.hw - 4.2), y0 + 0.06, ac, sand(1, 8));
    if (A.glb.palm) for (const az of [K.a0 + 16, ac, K.a1 - 16]) { const p = A.glb.palm.model.clone(); const [x, z] = cityWorld(az, s * (K.hw - 10)); p.position.set(x, y0, z); p.rotation.y = az * 0.3; city.g.scene.add(p); obst(az, s * (K.hw - 10), 0.5); }
    // update 43: stone benches with gold and gems, sized for the Eternials (Higgsfield: et_bench)
    const benchA = A.glb.et_bench || A.glb.bench;
    if (benchA) for (const az of [K.a0 + 12, ac, K.a1 - 12]) { const bch = city.warmProp(benchA.model.clone()); const [x, z] = cityWorld(az, s * (K.hw - 8)); bch.position.set(x, y0, z); bch.rotation.y = C.grpYaw + (s > 0 ? -Math.PI / 2 : Math.PI / 2); city.g.scene.add(bch); obst(az, s * (K.hw - 8), 1.4); }
  }

  // ---- the HALLWAY through the rock: statues, ceiling lamps, flags, gold bands, a green carpet ----
  {
    const TN = C.tunnel, tlen = TN.a1 - TN.a0, tac = (TN.a0 + TN.a1) / 2;
    box(TN.hw * 2 + 1, 0.3, tlen + 2, 0, y0 - 0.15, tac, sand(3, 20));
    box(3.2, 0.05, tlen - 2, 0, y0 + 0.03, tac, city.mats.carpetM(1, 26));
    for (const s of [-1, 1]) {
      box(1, TN.h, tlen + 2, s * (TN.hw + 0.5), y0 + TN.h / 2, tac, sand(2, 24)); wallSeg(TN.a0 - 2, s * TN.hw, TN.a1 + 1, s * TN.hw, 0.6);
      for (const yy of [3.4, 7.4]) box(0.25, 0.35, tlen + 2, s * (TN.hw - 0.05), y0 + yy, tac, goldPlain);
      for (let i = 0; i <= 7; i++) box(0.5, TN.h, 1.0, s * (TN.hw - 0.2), y0 + TN.h / 2, TN.a0 + i * (tlen / 7), gold);
    }
    box(TN.hw * 2 + 2, 1, tlen + 2, 0, y0 + TN.h + 0.5, tac, rock(3, 20));
    for (let i = 0; i < 5; i++) { const az = TN.a0 + 9 + i * (tlen - 18) / 4; const s = i % 2 ? 1 : -1; city.addTorchbearer(az, s * (TN.hw - 1.3), y0, s > 0 ? -90 : 90); city.addPoleFlag(-s * (TN.hw - 0.1), y0 + 5.0, az, s > 0 ? 90 : -90, 0.8, 4.2); }   // update 43: socketed in the wall, not floating
    for (let i = 0; i < 7; i++) city.addCeilingLamp(TN.a0 + 6 + i * (tlen - 12) / 6, 0, y0 + TN.h, 1.6);
  }

  // ---- the LAKE (with the moat) and the BRIDGE ----
  {
    const LK = C.lake, wy = L.court - 2.05 + 0.02;
    const wm = waterMat(); wm.map && wm.map.repeat.set(7, 7);
    // update 41: the water is the lake's own outline (local x = b, z = a), a metre under the shore
    const shp = new THREE.Shape(); lakeOutline(1.2, 96).forEach(([a, b], i) => (i ? shp.lineTo(b, -a) : shp.moveTo(b, -a))); shp.closePath();
    const lgeo = new THREE.ShapeGeometry(shp); { const uvA = lgeo.attributes.uv; for (let i = 0; i < uvA.count; i++) uvA.setXY(i, uvA.getX(i) / 24, uvA.getY(i) / 24); }
    const lake = new THREE.Mesh(lgeo, wm); lake.rotation.x = -Math.PI / 2; lake.position.set(0, wy, 0); grp.add(lake); city.lakeMesh = lake;
    const BR = C.bridge, N = 16, Lb = BR.a1 - BR.a0;
    const deckAt = (a) => city.floorH(...cityWorld(a, 0));
    const stone = sand(2, 1);
    for (let i = 0; i < N; i++) {
      const a0 = BR.a0 + (Lb / N) * i, a1 = a0 + Lb / N;
      const y0b = deckAt(a0) - 0.18, y1b = deckAt(a1) - 0.18;
      const segL = Math.hypot(a1 - a0, y1b - y0b), tilt = Math.atan2(y1b - y0b, a1 - a0);
      const seg = new THREE.Mesh(new THREE.BoxGeometry(BR.hw * 2 + 0.6, 0.36, segL + 0.05), stone); seg.position.set(0, (y0b + y1b) / 2, (a0 + a1) / 2); seg.rotation.x = -tilt; seg.receiveShadow = true; grp.add(seg);
      for (const s of [-1, 1]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, segL + 0.05), goldPlain); rail.position.set(s * (BR.hw + 0.15), (y0b + y1b) / 2 + 1.15, (a0 + a1) / 2); rail.rotation.x = -tilt; grp.add(rail);
        const kerb = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, segL + 0.05), stone); kerb.position.set(s * (BR.hw + 0.1), (y0b + y1b) / 2 + 0.35, (a0 + a1) / 2); kerb.rotation.x = -tilt; grp.add(kerb);
      }
    }
    // balusters every 3 m, a lamppost every 4th; piers with pointed arches between them
    for (let a = BR.a0 + 3; a < BR.a1 - 1; a += 3) {
      const y = deckAt(a);
      for (const s of [-1, 1]) { box(0.26, 1.1, 0.26, s * (BR.hw + 0.15), y + 0.55, a, goldPlain); }
      if (Math.round((a - BR.a0) / 3) % 4 === 2) for (const s of [-1, 1]) city.addLamppost(a, s * (BR.hw + 0.55), y, true, 2.4);
    }
    const nP = 5, bed = L.court - 2.05 - LK.depth;
    for (let k = 0; k <= nP; k++) {
      const az = BR.a0 + 8 + (Lb - 16) * (k / nP), yd = deckAt(az);
      const pier = new THREE.Mesh(new THREE.BoxGeometry(BR.hw * 2 + 1.2, yd - 0.4 - bed, 2.2), stone); pier.position.set(0, (yd - 0.4 + bed) / 2, az); grp.add(pier);
      if (k < nP) {
        const span = (Lb - 16) / nP, am = az + span / 2, ym = deckAt(am);
        for (const s of [-1, 1]) archWall(s * (BR.hw + 0.35), bed, am, span, ym - 0.35 - bed, 0.4, span - 2.6, ym - 1.2 - bed, stone, Math.PI / 2);
      }
    }
  }
}
// the head of a pointed arch above a doorway of height yDoor (for the lattice tympanum)
function archShapeHead(wd, h, yDoor) {
  const W = wd / 2, R = wd, ys = h - 0.866 * wd, s = new THREE.Shape();
  const arc = (a0, a1, cx, n = 14) => { for (let i = 0; i <= n; i++) { const t = a0 + (a1 - a0) * (i / n); s.lineTo(cx + R * Math.cos(t), ys + R * Math.sin(t)); } };
  s.moveTo(-W, yDoor); s.lineTo(-W, Math.max(yDoor, ys)); arc(Math.PI, Math.PI * 2 / 3, W); arc(Math.PI / 3, 0, -W); s.lineTo(W, yDoor); s.closePath();
  return s;
}

// ============================================================================
// the CAVERN under the shaft of light
// ============================================================================
function buildCavern(city, grp, box, sector, cyl, sand, rock, gold, goldPlain, goldBright, gem, dark, wallSeg, obst, pillar, archFrame, archWall, carpetM, waterMat, prop, glowM, greenGlowM, latticeM) {
  const C = E(), L = C.levels, A = city.g.assets, w = city.g.world, scene = city.g.scene;
  const R = C.wallR, TR = C.terraceR, ET = C.entryTh, S = C.split, RT = C.riverTh, rise = C.stairRise;
  const stone = sand(4, 4);

  // ---- floors ----
  {   // update 43: the plaza floor with the down stair's trench cut out of it (the slab used to run over the treads)
    const SD = C.stairs.down, shp = new THREE.Shape(); shp.absarc(0, 0, TR + 1, 0, Math.PI * 2, false);
    const hole = new THREE.Path(); const x0 = -(TR + 0.5), x1 = -(SD.r0 - 0.3), yh = SD.hw + 0.25;   // shape x = b, shape y = -a; the hole must stay INSIDE the outline (earcut drops a crossing hole)
    hole.moveTo(x0, -yh); hole.lineTo(x1, -yh); hole.lineTo(x1, yh); hole.lineTo(x0, yh); hole.closePath(); shp.holes.push(hole);
    const geo = new THREE.ShapeGeometry(shp, 48); { const uv = geo.attributes.uv, pp = geo.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, pp.getX(i) / 7, pp.getY(i) / 7); }
    const fl = new THREE.Mesh(geo, sand(1, 1)); fl.material.side = THREE.DoubleSide; fl.rotation.x = -Math.PI / 2; fl.position.y = L.plaza; fl.receiveShadow = true; grp.add(fl);
    for (const s of [-1, 1]) box(0.3, L.plaza - L.lower + 0.6, TR + 1.5 - (SD.r0 - 0.3), s * (SD.hw + 0.4), (L.plaza + L.lower) / 2 + 0.3, -(TR + 1.5 + SD.r0 - 0.3) / 2, sand(1, 3), Math.PI / 2);   // the trench's side walls
  }
  // the altar dais: six real steps up to a golden platform
  const nD = Math.round((L.dais - L.plaza) / rise), runD = 0.6;
  for (let k = 1; k <= nD; k++) { const rr = C.altar.r + (nD - k) * runD, yy = L.plaza + rise * k; sector(rr, rr + runD, -180, 180, yy, k === nD ? gold : stone, 64); cyl(rr + runD, 0, 360, yy - rise, yy, k === nD ? gold : stone); }
  sector(0, C.altar.r, -180, 180, L.dais, gold, 64);
  // the entry terrace (court) — wall to wall at |θ| < ET, plus the chord region a > entryA
  sector(TR, R, -ET, ET, L.court, sand(8, 8), 40);
  {
    const shape = new THREE.Shape(); const th = Math.acos(Math.min(1, C.entryA / TR));
    shape.moveTo(-TR * Math.sin(th), C.entryA);
    for (let i = 0; i <= 24; i++) { const t = -th + (2 * th) * (i / 24); shape.lineTo(TR * Math.sin(t), TR * Math.cos(t)); }
    shape.closePath();
    const geo = new THREE.ShapeGeometry(shape); geo.rotateX(Math.PI / 2);
    const mm = new THREE.Mesh(geo, sand(8, 8)); mm.position.y = L.court; mm.material.side = THREE.DoubleSide; grp.add(mm);
  }
  // the entry stair: twenty broad treads, wall to wall, with gold nosings
  {
    const n = Math.round((L.court - L.plaza) / rise), run = (C.entryA - C.entryRampA) / n;
    for (let i = 1; i <= n; i++) {
      const a0 = C.entryRampA + run * (i - 1), y = L.plaza + rise * i, halfW = Math.sqrt(Math.max(1, TR * TR - a0 * a0)) + 2;
      box(halfW * 2, rise + 0.02, run + 0.02, 0, y - rise / 2, a0 + run / 2, i % 5 === 0 ? gold : sand(halfW / 2, 0.3));
      box(halfW * 2, 0.05, 0.12, 0, y + 0.02, a0 + 0.06, goldPlain);
    }
  }
  // the upper terrace (+8) runs from ET round past the throne door to S.stairTh0; the lower gallery (-14) from S.stairTh1 to -ET
  sector(TR, R, ET, 180, L.terrace, sand(6, 6), 48); sector(TR, R, -180, S.stairTh0, L.terrace, sand(6, 6), 24);
  cyl(TR, ET, 180, L.plaza, L.terrace, sand(48, 3)); cyl(TR, -180, S.stairTh0, L.plaza, L.terrace, sand(48, 3));
  sector(TR, C.riverR0, S.stairTh1, -ET, L.lower, sand(6, 6), 48);
  sector(C.riverR1, R, S.stairTh1, -ET, L.lower, sand(6, 6), 48);
  sector(C.riverR0 - 0.2, C.riverR1 + 0.2, RT.th0, RT.th1, L.riverBed, rock(6, 2), 48);
  sector(C.riverR0, C.riverR1, S.stairTh1, RT.th0, L.lower, sand(2, 2), 8); sector(C.riverR0, C.riverR1, RT.th1, -ET, L.lower, sand(2, 2), 8);
  { const g = (SD_hw) => (SD_hw / TR) / D2R; const dth = g(C.stairs.down.hw + 0.4); cyl(TR, S.stairTh1, -90 - dth, L.lower - 1, L.plaza, sand(48, 3)); cyl(TR, -90 + dth, -ET, L.lower - 1, L.plaza, sand(48, 3)); }   // update 43: a gap for the stair's trench, blocks not smears
  cyl(C.riverR0, RT.th0, RT.th1, L.riverBed, L.lower, rock(6, 1), true); cyl(C.riverR1, RT.th0, RT.th1, L.riverBed, L.lower, rock(6, 1));
  // the river's water, its culvert arches (the water flows in from the dark and out again), golden grates
  {
    const wm = waterMat(); wm.map && wm.map.repeat.set(8, 1);
    city.riverMesh = sector(C.riverR0, C.riverR1, RT.th0, RT.th1, L.water, wm, 64);
    {   // update 43: uv u runs ALONG the river (theta), v across it — the texture offset then flows the water
      const g2 = city.riverMesh.geometry, pp = g2.attributes.position, uv = g2.attributes.uv;
      for (let i = 0; i < pp.count; i++) { const x = pp.getX(i), z = pp.getZ(i), th = Math.atan2(x, z) / D2R, rr = Math.hypot(x, z); uv.setXY(i, (th - RT.th0) / (RT.th1 - RT.th0) * 9, (rr - C.riverR0) / (C.riverR1 - C.riverR0)); }
      uv.needsUpdate = true;
    }
    // update 43: the culvert helper — an end wall across the river whose pointed arch springs from the water, a dark lit
    // tunnel behind it, the water running in. `sgn` = which way along theta the tunnel goes (+ = increasing theta)
    city.culvert = (thd, sgn, yTop) => {
      const th = thd * D2R, rm = (C.riverR0 + C.riverR1) / 2, CV = C.culvert;
      const ca = rm * Math.cos(th), cb = rm * Math.sin(th), ry = th - Math.PI / 2;   // the wall's width runs radially
      const dir = [Math.cos(th), Math.sin(th)], tan = [-Math.sin(th), Math.cos(th)];
      const wd = C.riverR1 - C.riverR0 + 2.4, yB = L.water - 0.5;
      box(wd, yB - L.riverBed, 0.8, cb, (L.riverBed + yB) / 2, ca, sand(3, 1), ry);
      archWall(cb, yB, ca, wd, Math.max(CV.h + 0.4, yTop - yB), 0.8, CV.w - 1.2, CV.h, sand(3, 2), ry);
      archFrame(cb, yB, ca, CV.w - 1.2, CV.h, 0.5, 0.9, gold, ry);
      box(wd + 0.4, 0.5, 1.2, cb, yTop + 0.25, ca, gold, ry);
      const off = sgn * CV.depth / 2, ta = ca + tan[0] * off, tb2 = cb + tan[1] * off;
      const tun = new THREE.Mesh(new THREE.BoxGeometry(CV.w - 1.2, CV.h + 0.2, CV.depth), (() => { const m = rock(2, 2); m.side = THREE.BackSide; return m; })());
      tun.position.set(tb2, yB + (CV.h + 0.2) / 2 - 0.1, ta); tun.rotation.y = ry; grp.add(tun);
      const cap = new THREE.Mesh(new THREE.PlaneGeometry(CV.w, CV.h + 0.4), dark); cap.position.set(cb + tan[1] * off * 2, yB + CV.h / 2, ca + tan[0] * off * 2); cap.rotation.y = ry + (sgn > 0 ? Math.PI : 0); grp.add(cap);
      const tw = waterMat(); tw.map && tw.map.repeat.set(2, 3); const tws = new THREE.Mesh(new THREE.PlaneGeometry(CV.w - 1.4, CV.depth), tw); tws.rotation.order = "YXZ"; tws.rotation.y = ry; tws.rotation.x = -Math.PI / 2; tws.position.set(tb2, L.water, ta); grp.add(tws);
      for (let k = 1; k <= 3; k++) { const u = sgn * CV.depth * k / 4; const la = ca + tan[0] * u, lb = cb + tan[1] * u; for (const sd of [-1, 1]) { const gl = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.5, 0.25), glowM); gl.position.set(lb + dir[1] * sd * (CV.w / 2 - 1.0), yB + 3.6, la + dir[0] * sd * (CV.w / 2 - 1.0)); grp.add(gl); } city.emit(grp, lb, yB + 3.2, la, 0xffc35a, 1.6, 12, {}); }
    };
    city.culvert(RT.th1, 1, L.lower + C.culvert.wallUp);
    // update 43: the bridge over the river: an arched stone deck a boat passes under, gold balustrades sized for Eternials —
    // shorter now, and beside the vault's axis so it no longer ends on the vault door
    {
      const HWb = C.riverBridgeHw, rb0 = C.riverR0 - C.riverBridgeExt, rb1 = C.riverR1 + C.riverBridgeExt, N = 12, arch = C.riverBridgeArch, th = C.riverBridgeTh * D2R;
      const rad = [Math.cos(th), Math.sin(th)], tan = [-Math.sin(th), Math.cos(th)];   // (a, b)
      const AT = (rr, t) => [rr * rad[0] + t * tan[0], rr * rad[1] + t * tan[1]];
      const yAt = (rr) => L.lower + arch * Math.sin((rr - rb0) / (rb1 - rb0) * Math.PI);
      const tilted = (wd, h, rA, rB, yA, yB, t, m) => {   // a box along the radial, pitched to follow the arch
        const segL = Math.hypot(rB - rA, yB - yA), mm = new THREE.Mesh(new THREE.BoxGeometry(wd, h, segL + 0.04), m);
        const [pa, pb] = AT((rA + rB) / 2, t); mm.position.set(pb, (yA + yB) / 2, pa); mm.rotation.order = "YXZ"; mm.rotation.y = th; mm.rotation.x = Math.asin((yA - yB) / segL); mm.castShadow = mm.receiveShadow = true; grp.add(mm); return mm;
      };
      for (let i = 0; i < N; i++) {
        const rA = rb0 + (rb1 - rb0) * i / N, rB = rb0 + (rb1 - rb0) * (i + 1) / N, yA = yAt(rA) - 0.2, yB = yAt(rB) - 0.2;
        tilted(HWb * 2 + 0.4, 0.4, rA, rB, yA, yB, 0, sand(2, 1));
        for (const sg of [-1, 1]) { tilted(0.36, 0.5, rA, rB, yA + 0.35, yB + 0.35, sg * (HWb + 0.02), gold); tilted(0.18, 0.16, rA, rB, yA + 1.7, yB + 1.7, sg * (HWb + 0.05), goldPlain); tilted(0.14, 0.12, rA, rB, yA + 1.05, yB + 1.05, sg * (HWb + 0.05), goldPlain); }
      }
      for (let k = 0; k <= 10; k++) { const rr = rb0 + (rb1 - rb0) * k / 10, yy = yAt(rr); for (const sg of [-1, 1]) { const [pa, pb] = AT(rr, sg * (HWb + 0.05)); box(0.22, 1.7, 0.22, pb, yy + 0.85, pa, goldPlain, th); if (k % 5 === 0) { const gm = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), gem); gm.position.set(pb, yy + 1.95, pa); grp.add(gm); } } }
      for (const rr of [rb0 - 0.6, rb1 + 0.6]) for (const sg of [-1, 1]) { const [pa, pb] = AT(rr, sg * (HWb + 0.5)); pillar(pb, L.lower, pa, 0.4, 3.2, gold); }
      for (const sg of [-1, 1]) { const [a0w, b0w] = AT(rb0 + 0.6, sg * HWb), [a1w, b1w] = AT(rb1 - 0.6, sg * HWb); wallSeg(a0w, b0w, a1w, b1w, 0.25); }   // no stepping off the deck
    }
  }
  // ---- the two staircases from the plaza: up to the terrace (+b), down to the gallery (-b) — real treads, gold rails ----
  for (const sgn of [1, -1]) {
    const ST = sgn > 0 ? C.stairs.up : C.stairs.down, y1 = sgn > 0 ? L.terrace : L.lower;
    const n = Math.round(Math.abs(y1 - L.plaza) / rise), rs = (y1 - L.plaza) / n, run = (ST.r1 - ST.r0) / n;
    for (let i = 1; i <= n; i++) {
      const b0 = ST.r0 + run * (i - 1), y = L.plaza + rs * i;
      // going up: tread i sits at height y; going down: tread i is the (lower) step you land on
      const top = sgn > 0 ? y : y, bottom = sgn > 0 ? L.plaza - 0.2 : y1 - 0.2;
      const h = top - bottom;
      box(run + 0.02, h, ST.hw * 2, sgn * (b0 + run / 2), bottom + h / 2, 0, i % 5 === 0 ? gold : stone);
      box(0.12, 0.05, ST.hw * 2, sgn * (b0 + (sgn > 0 ? 0.06 : run - 0.06)), top + 0.02, 0, goldPlain);
    }
    for (const s of [-1, 1]) {
      const yA = L.plaza, yB = y1, mid = (ST.r0 + ST.r1) / 2, len = ST.r1 - ST.r0;
      const tilt = Math.atan2(yB - yA, len), slope = Math.hypot(len, yB - yA);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(slope + 0.4, 0.18, 0.18), goldPlain); rail.position.set(sgn * mid, (yA + yB) / 2 + 1.1, s * (ST.hw + 0.1)); rail.rotation.z = sgn * tilt; grp.add(rail);
      for (let k = 0; k <= 8; k++) { const bb = ST.r0 + len * (k / 8), yy = yA + (yB - yA) * (k / 8); box(0.16, 1.1, 0.16, sgn * bb, yy + 0.55, s * (ST.hw + 0.1), goldPlain); }
      wallSeg(s * (ST.hw + 0.1), sgn * ST.r0, s * (ST.hw + 0.1), sgn * Math.min(ST.r1, TR - 0.4), 0.2);   // update 42: ends where the terrace begins
    }
    for (const bb of [ST.r0 - 1.2, ST.r1 + 1.5]) for (const s of [-1, 1]) pillar(sgn * bb, sgn > 0 ? (bb < ST.r0 ? L.plaza : y1) : (bb < ST.r0 ? L.plaza : y1), s * (ST.hw + 0.9), 0.35, 3.2, gold);
  }
  // ---- the grand stair: from the terrace (+8) down the outer band to the gallery (-14), a landing halfway ----
  {
    const th0 = S.stairTh0, th1 = S.stairTh1, n = Math.round((L.terrace - L.lower) / rise), rs = (L.terrace - L.lower) / n;
    const total = th1 - th0, land = S.landing, stepArc = (total - land) / n, half = Math.floor(n / 2);
    city.grandStair = { th0, th1, n, rs, stepArc, land, half };
    for (let i = 1; i <= n; i++) {
      const tA = th0 + stepArc * (i - 1) + (i > half ? land : 0), tB = tA + stepArc;
      const y = L.terrace - rs * i;
      const chan = tB > th1 - C.riverChanDeg - 0.01;   // update 43: the lowest steps are split by the river's channel
      if (chan) { sector(TR, C.riverR0 - 0.2, tA, tB, y, i % 6 === 0 ? gold : stone, 2); sector(C.riverR1 + 0.2, R, tA, tB, y, i % 6 === 0 ? gold : stone, 2); }
      else sector(TR, R, tA, tB, y, i % 6 === 0 ? gold : stone, 2);
      cyl(TR, tA, tB, y, y + rs, stone, false, 2);   // (a riser is the terrace wall's own face; the visible one is the outer step face)
      if (y > L.lower + 0.05) cyl(TR, tA, tB, L.lower - 1, y, sand(48, 3), false, 2);   // update 43: the stair's inner face — no void under the steps
      // the riser: a thin wall across the band at tA
      const ra = (TR + R) / 2, ca = ra * Math.cos(tA * D2R), cb = ra * Math.sin(tA * D2R);
      if (chan) { const r0c = (TR + C.riverR0 - 0.2) / 2, r1c = (C.riverR1 + 0.2 + R) / 2; box(0.12, rs + 0.02, C.riverR0 - 0.2 - TR, r0c * Math.sin(tA * D2R), y + rs / 2, r0c * Math.cos(tA * D2R), stone, tA * D2R); box(0.12, rs + 0.02, R - C.riverR1 - 0.2, r1c * Math.sin(tA * D2R), y + rs / 2, r1c * Math.cos(tA * D2R), stone, tA * D2R); }
      else box(0.12, rs + 0.02, R - TR, cb, y + rs / 2, ca, stone, tA * D2R);   // update 42: along the radial
      if (i === half) { const tL = tB; sector(TR, R, tL, tL + land, y, gold, 3); }
    }
    // update 43: the channel's walls and bed, the arch the water comes out of (lit inside), and fences on both banks of the channel
    {
      const tc0 = th1 - C.riverChanDeg, RT2 = C.riverTh;
      for (const rr of [C.riverR0, C.riverR1]) cyl(rr, tc0 - 0.2, th1 + 0.2, L.riverBed, L.terrace - rs * n + 4, rock(6, 1), rr === C.riverR0, 6);
      sector(C.riverR0 - 0.2, C.riverR1 + 0.2, tc0 - 0.3, th1 + 0.3, L.riverBed, rock(6, 2), 6);
      city.culvert(tc0, -1, city.grandStairY(tc0 - 0.2) + 0.4);
      city.stairFence = (rr, ta, tb, yOf, dirOut) => {   // posts with lotus finials, a sloped top rail and bars between, following the steps
        const stepT = (1.6 / rr) / D2R; let prev = null;
        for (let t = ta; t <= tb + 1e-6; t += stepT) {
          const y = yOf(t), pa = rr * Math.cos(t * D2R), pb = rr * Math.sin(t * D2R);
          box(0.2, 1.6, 0.2, pb, y + 0.8, pa, goldPlain); const fin = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), gold); fin.position.set(pb, y + 1.72, pa); grp.add(fin);
          if (prev) { const [ppa, ppb, py] = prev; const dx = pb - ppb, dz = pa - ppa, dy = y - py, len = Math.hypot(dx, dz); for (const hh of [1.5, 0.75]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, Math.hypot(len, dy) + 0.02), goldPlain); rail.position.set((pb + ppb) / 2, (y + py) / 2 + hh, (pa + ppa) / 2); rail.rotation.order = "YXZ"; rail.rotation.y = Math.atan2(dx, dz); rail.rotation.x = -Math.atan2(dy, len); grp.add(rail); }
            for (let k = 1; k < 5; k++) { const u = k / 5, bx = ppb + dx * u, bz = ppa + dz * u, by = py + dy * u; box(0.06, 1.45, 0.06, bx, by + 0.75, bz, goldPlain); } }
          prev = [pa, pb, y];
        }
      };
      city.stairFence(C.riverR0 - 0.45, tc0 + 0.15, th1, (t) => city.grandStairY(t), 1);
      city.stairFence(C.riverR1 + 0.45, tc0 + 0.15, th1, (t) => city.grandStairY(t), -1);
      for (const rr of [C.riverR0 - 0.45, C.riverR1 + 0.45]) { const [q0a, q0b] = [rr * Math.cos(tc0 * D2R), rr * Math.sin(tc0 * D2R)], [q1a, q1b] = [rr * Math.cos((th1 + 0.4) * D2R), rr * Math.sin((th1 + 0.4) * D2R)]; wallSeg(q0a, q0b, q1a, q1b, 0.3); }
    }
  }
  // ---- the cavern wall: rock, in segments with real gaps for every door; the ceiling dome; the shaft; the beam ----
  const gaps = [];   // [th0, th1, yFloor, hDoor]
  const doorGap = (th, hw, yF, hD) => { const dth = (hw / R) / D2R; gaps.push([th - dth, th + dth, yF, hD]); };
  doorGap(0, C.tunnel.hw + 0.6, L.court, C.tunnel.h + 1.2);
  { const d = ((C.throne.doorHw + 0.6) / R) / D2R; gaps.push([180 - d, 180, L.terrace, 8.5], [-180, -180 + d, L.terrace, 8.5]); }   // the throne door straddles ±180
  doorGap(-90, C.vault.doorHw + 0.6, L.lower, 6.2);
  for (const rm of C.rooms) doorGap(rm.th, C.room.doorHw + 0.5, L[rm.level], 4.6);
  gaps.sort((p, q) => p[0] - q[0]);
  {
    const rockW = rock(24, 4); const ragged = (m) => { m.side = THREE.BackSide; return m; };
    let th = -180;
    const wallSegRing = (t0, t1, y0, y1) => { if (t1 - t0 < 0.05 || y1 - y0 < 0.05) return; const m = cyl(R, t0, t1, y0, y1, rockW, true, Math.max(2, Math.round((t1 - t0) / 3.75))); ragged(m.material); };
    for (const [g0, g1, yF, hD] of gaps) {
      if (g0 > th) wallSegRing(th, g0, L.riverBed - 2, C.wallTop);
      wallSegRing(g0, g1, L.riverBed - 2, yF - 0.3); wallSegRing(g0, g1, yF + hD, C.wallTop);
      th = g1;
    }
    // the throne door at 180 wraps: its gap is [180-d, 180+d]; anything past 180 has been handled by the sort at -180 side
    if (th < 180) wallSegRing(th, 180, L.riverBed - 2, C.wallTop);
    // the dome: a lathe whose profile is displaced by a rock noise, ending in the ragged shaft mouth
    const pts = [], N = 16;
    for (let i = 0; i <= N; i++) { const t = i / N; const rr = R - (R - C.shaftR) * Math.sin(t * Math.PI / 2); const yy = C.wallTop + (C.cavernH - C.wallTop) * Math.sin(t * Math.PI / 2); pts.push(new THREE.Vector2(rr, yy)); }
    const domeGeo = new THREE.LatheGeometry(pts, 96);
    {
      const p = domeGeo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i), rr = Math.hypot(x, z), th2 = Math.atan2(x, z);
        if (rr < C.shaftR + 0.5) { const rs = city.shaftR(th2) * 1.0; p.setX(i, rs * Math.sin(th2)); p.setZ(i, rs * Math.cos(th2)); continue; }
        const k = (rr - C.shaftR) / (R - C.shaftR);
        const nse = 1.6 * Math.sin(th2 * 5 + rr * 0.12) * Math.sin(y * 0.4 + th2 * 3) + 0.9 * Math.sin(th2 * 13 + rr * 0.3);
        const rim = Math.min(1, Math.max(0, (R - rr) / 12));   // no displacement at the rim: the dome must meet the wall top
        p.setY(i, y + nse * (0.4 + 0.6 * k) * (rr > C.shaftR + 4 ? 1 : (rr - C.shaftR - 0.5) / 3.5) * rim);
      }
      domeGeo.computeVertexNormals();
    }
    const dome = new THREE.Mesh(domeGeo, ragged(rock(24, 4))); grp.add(dome);
    // the beam of light: a soft column plus three faint rays; the pool of light on the dais
    const beamM = new THREE.MeshBasicMaterial({ color: 0xffe9b0, transparent: true, opacity: 0.09, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(C.shaftR * 0.95, C.shaftR * 1.35, C.cavernH - L.plaza + 4, 40, 1, true), beamM); beam.position.y = (C.cavernH + L.plaza) / 2 + 2; grp.add(beam); city.beam = beam;
    city.rays = [];
    for (let k = 0; k < 3; k++) { const ray = new THREE.Mesh(new THREE.CylinderGeometry(C.shaftR * 0.35, C.shaftR * 0.8, C.cavernH - L.plaza + 4, 12, 1, true), beamM.clone()); ray.material.opacity = 0.05; ray.position.set(Math.sin(k * 2.1) * 4, (C.cavernH + L.plaza) / 2 + 2, Math.cos(k * 2.1) * 4); ray.rotation.z = 0.03 * (k - 1); grp.add(ray); city.rays.push(ray); }
    const pool = new THREE.Mesh(new THREE.CircleGeometry(C.shaftR * 1.5, 40), new THREE.MeshBasicMaterial({ color: 0xffe3a0, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }));
    pool.rotation.x = -Math.PI / 2; pool.position.y = L.dais + 0.03; grp.add(pool); city.pool = pool;
  }
  // ---- update 42: the ALTAR after the concept picture — a faceted dark-stone drum banded with glowing gold inlay and a sun
  // disc, a crystalline golden spire growing out of it with the emerald set in its tip, six fire bowls on tall fluted gold
  // columns, a prayer table with offering flames and kneeling cushions, and chains with censers hung from the rim of the hole ----
  {
    // update 43: the altar body is the Higgsfield model made from the concept render — an all-gold ten-sided drum on a stepped
    // base with the sun disc and recessed channels, a crystalline spire growing out of its top. The channels are lit by
    // glowing lines laid along the model (they pulse, a wave running round the drum); the emerald is a real crystal set in
    // the tip; you pray at the altar itself
    const inlayM = new THREE.MeshStandardMaterial({ color: 0xffd45a, emissive: 0xffb63a, emissiveIntensity: 1.35, metalness: 0.6, roughness: 0.3 });
    const yD = L.dais, DR = 4.3, yDrum0 = yD + 1.45, yDrum1 = yD + 8.7, yTip = yD + 13.4;
    const altarModel = prop("et_altar", 0, 0, yD, 0, () => { const drum = new THREE.Mesh(new THREE.CylinderGeometry(DR, DR + 0.5, yDrum1 - yDrum0, 10), gold); drum.position.set(0, (yDrum0 + yDrum1) / 2, 0); grp.add(drum); const sp = new THREE.Mesh(new THREE.ConeGeometry(1.6, yTip - yDrum1, 5), goldBright); sp.position.set(0, (yDrum1 + yTip) / 2, 0); grp.add(sp); return drum; });
    city.altarModel = altarModel;
    if (altarModel && altarModel.traverse) altarModel.traverse((o) => { if (o.isMesh && o.material && o.material.map) { o.material.color = new THREE.Color(0xd8b24e); o.material.emissiveIntensity = 0.14; o.material.metalness = 0.45; o.material.roughness = 0.4; } });
    city.altarLines = [];
    const line = (geo, x, yy, z, phase, rot) => { const m = inlayM.clone(); const mm = new THREE.Mesh(geo, m); mm.position.set(x, yy, z); if (rot) mm.rotation.copy(rot); grp.add(mm); city.altarLines.push({ m, phase }); return mm; };
    for (const [yy, ph] of [[yDrum0 + 1.2, 0], [yDrum1 - 1.0, Math.PI]]) line(new THREE.TorusGeometry(DR + 0.14, 0.07, 6, 48), 0, yy, 0, ph, new THREE.Euler(Math.PI / 2, 0, 0));
    for (let k = 0; k < 10; k++) { const th = (k / 10) * Math.PI * 2 + Math.PI / 10; if (Math.abs(((th + Math.PI) % (Math.PI * 2)) - Math.PI) < 0.5) continue; line(new THREE.BoxGeometry(0.12, yDrum1 - yDrum0 - 2.6, 0.12), (DR + 0.14) * Math.sin(th), (yDrum0 + yDrum1) / 2, (DR + 0.14) * Math.cos(th), th); }
    { const ySun = yDrum0 + (yDrum1 - yDrum0) * 0.55, zF = DR + 0.16;
      line(new THREE.TorusGeometry(1.05, 0.09, 6, 30), 0, ySun, zF, 0.3); line(new THREE.CircleGeometry(0.6, 24), 0, ySun, zF + 0.02, 0.6);
      for (let k = 0; k < 8; k++) { const ang = k * Math.PI / 4; line(new THREE.BoxGeometry(0.1, 1.2, 0.08), Math.sin(ang) * 1.9, ySun + Math.cos(ang) * 1.9, zF, 1.0 + k * 0.2, new THREE.Euler(0, 0, -ang)); }
      for (const sg of [-1, 1]) { line(new THREE.BoxGeometry(0.1, 2.4, 0.08), sg * 2.9, ySun - 0.4, zF, 1.6); line(new THREE.BoxGeometry(1.6, 0.1, 0.08), sg * 3.5, ySun - 1.6, zF, 1.9); line(new THREE.BoxGeometry(1.1, 0.1, 0.08), sg * 2.4, ySun + 0.8, zF, 1.3); } }
    // the emerald: a six-sided crystal with pointed ends, set in the spire's socket, glowing and slowly turning
    const gemM = new THREE.MeshStandardMaterial({ color: 0x3cff7a, emissive: 0x22e060, emissiveIntensity: 1.9, roughness: 0.12, metalness: 0.1, flatShading: true });
    const crystal = new THREE.Group(); crystal.position.set(0, yTip + 0.9, 0); grp.add(crystal);
    { const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.48, 1.7, 6), gemM); crystal.add(body); const top = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.8, 6), gemM); top.position.y = 1.25; crystal.add(top); const bot = new THREE.Mesh(new THREE.ConeGeometry(0.48, 0.6, 6), gemM); bot.position.y = -1.15; bot.rotation.x = Math.PI; crystal.add(bot);
      const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.5, 0.5, 6), goldBright); sock.position.y = -1.55; crystal.add(sock);
      for (let k = 0; k < 4; k++) { const prong = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.0, 0.1), goldBright); const ang = k * Math.PI / 2 + Math.PI / 4; prong.position.set(Math.sin(ang) * 0.5, -0.9, Math.cos(ang) * 0.5); prong.rotation.set(Math.cos(ang) * 0.35, 0, -Math.sin(ang) * 0.35); crystal.add(prong); } }
    city.altarGem = crystal; city.altarGemY = crystal.position.y;
    const halo = new THREE.Mesh(new THREE.SphereGeometry(1.9, 16, 12), new THREE.MeshBasicMaterial({ color: 0x5cff8a, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false })); halo.position.copy(crystal.position); grp.add(halo); city.altarHalo = halo;
    city.emit(grp, 0, crystal.position.y, 0, 0x5cff7a, 3.4, 34, {});
    city.emit(grp, 0, yDrum0 + (yDrum1 - yDrum0) * 0.55, DR + 1.5, 0xffc060, 1.8, 16, {});
    // you pray AT the altar: three kneeling cushions before its sun face
    for (const cx of [-1.5, 0, 1.5]) box(1.0, 0.16, 0.7, cx, yD + 0.08, DR + 2.6, carpetM(1, 1));
    city.altarLocal = { a: DR + 2.8, b: 0 };
    obst(0, 0, DR + 1.3);
    // six fire bowls on tall fluted golden columns around the drum
    for (let k = 0; k < 6; k++) {
      const th = k * 60 + 30, pa = 8.4 * Math.cos(th * D2R), pb = 8.4 * Math.sin(th * D2R);
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.62, 8.6, 14), gold); col.position.set(pb, yD + 4.3, pa); col.castShadow = true; grp.add(col);
      for (let f = 0; f < 14; f++) { const ang = f / 14 * Math.PI * 2; const flute = new THREE.Mesh(new THREE.BoxGeometry(0.1, 7.4, 0.1), goldPlain); flute.position.set(pb + Math.sin(ang) * 0.54, yD + 4.3, pa + Math.cos(ang) * 0.54); flute.rotation.y = ang; grp.add(flute); }
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.0, 0.5, 10), goldPlain); base.position.set(pb, yD + 0.25, pa); grp.add(base);
      const capC = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.62, 0.5, 10), goldPlain); capC.position.set(pb, yD + 8.85, pa); grp.add(capC);
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 0.55, 0.7, 12), goldBright); bowl.position.set(pb, yD + 9.45, pa); grp.add(bowl);
      city.addFlame(pb, yD + 10.4, pa, 1.4);
      obst(pa, pb, 1.1);
    }
    // the chains from the rim of the hole: each anchored in the rock with a golden plate and ring, real links down to a censer
    // or a plumb-weight; the censers glow and smoke a little
    city.censers = [];
    const linkGeo = new THREE.TorusGeometry(0.16, 0.05, 5, 8); linkGeo.scale(1.4, 1, 1);
    for (let k = 0; k < 7; k++) {
      const th = k * (Math.PI * 2 / 7) + 0.4, rr = city.shaftR(th) + 1.6 + (k % 2) * 1.4;
      const ax = rr * Math.sin(th), az = rr * Math.cos(th);
      const t = Math.min(1, (R - rr) / (R - C.shaftR)), yTop = C.wallTop + (C.cavernH - C.wallTop) * Math.sin(t * Math.PI / 2) - 0.4;
      const drop = 13 + (k % 3) * 4.5;
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 0.3, 8), gold); plate.position.set(ax, yTop + 0.1, az); grp.add(plate);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.07, 6, 12), goldPlain); ring.position.set(ax, yTop - 0.3, az); grp.add(ring);
      const nL = Math.round(drop / 0.42);
      for (let i = 0; i < nL; i++) { const l = new THREE.Mesh(linkGeo, i % 4 === 0 ? goldBright : goldPlain); l.position.set(ax, yTop - 0.6 - i * 0.42, az); l.rotation.y = (i % 2) * Math.PI / 2; grp.add(l); }
      const yEnd = yTop - 0.6 - nL * 0.42;
      if (k % 3 === 2) { const bob = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.5, 8), goldBright); bob.position.set(ax, yEnd - 0.7, az); bob.rotation.x = Math.PI; grp.add(bob); const orb = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), gold); orb.position.set(ax, yEnd + 0.2, az); grp.add(orb); }
      else {
        const cs = prop("et_censer", az, ax, yEnd - CFG.modelScale.et_censer, 0, () => { const gg = new THREE.Group(); gg.position.set(ax, yEnd - 1.4, az); grp.add(gg); const b1 = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), gold); b1.position.y = 0.6; gg.add(b1); const lid = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.8, 8), goldBright); lid.position.y = 1.3; gg.add(lid); return gg; });
        const glow = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), glowM); glow.position.set(ax, yEnd - 0.7, az); grp.add(glow);
        city.emit(grp, ax, yEnd - 0.9, az, 0xffb060, 1.6, 16, { flame: true });
        city.addFlame(ax, yEnd + 0.15, az, 0.5);
        city.censers.push(cs);
      }
    }
  }
  // ---- radial walls between the entry terrace and the two bands ----
  for (const s of [-1, 1]) {
    const th = s * ET * D2R;
    const a0 = TR * Math.cos(th), b0 = TR * Math.sin(th), a1 = R * Math.cos(th), b1 = R * Math.sin(th);
    wallSeg(a0, b0, a1, b1, 0.5);
    const ya = s > 0 ? L.terrace : L.riverBed - 2, yb = s > 0 ? L.court : L.court, lo = Math.min(ya, yb), hi = Math.max(ya, yb);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.6, hi - lo, R - TR), sand(4, Math.round((hi - lo) / 2))); wall.position.set((b0 + b1) / 2, (lo + hi) / 2, (a0 + a1) / 2); wall.rotation.y = th; grp.add(wall);
    box(0.9, 0.5, R - TR, (b0 + b1) / 2, hi + 0.25, (a0 + a1) / 2, gold, th);
    // update 43: the face you see (the court side of +ET, the gallery side of -ET) gets pilasters, a gold band, gems, leaning flags and torch statues
    { const nx = s > 0 ? Math.sin(th) : -Math.sin(th), nb = s > 0 ? -Math.cos(th) : Math.cos(th);   // outward normal (a, b) of the decorated face
      const foot = s > 0 ? L.court : L.lower, top = hi, dirDeg = Math.atan2(nb, nx) / D2R;
      for (let d = 2; d < R - TR - 1; d += 4) { const ca = a0 + (a1 - a0) * d / (R - TR), cb = b0 + (b1 - b0) * d / (R - TR); box(0.5, top - foot - 0.2, 1.0, cb + nb * 0.5, (foot + top) / 2, ca + nx * 0.5, gold, th); const gm = new THREE.Mesh(new THREE.OctahedronGeometry(0.28), gem); gm.position.set(cb + nb * 0.85, top - 1.4, ca + nx * 0.85); grp.add(gm); }
      box(0.5, 0.35, R - TR, (b0 + b1) / 2 + nb * 0.35, foot + (top - foot) * 0.55, (a0 + a1) / 2 + nx * 0.35, goldPlain, th);
      for (let d = 5; d < R - TR - 2; d += 8) { const ca = a0 + (a1 - a0) * d / (R - TR), cb = b0 + (b1 - b0) * d / (R - TR); city.addPoleFlag(cb + nb * 0.4, top - 1.6, ca + nx * 0.4, dirDeg, 0.95, 4.5); city.addTorchbearer(ca + nx * 2.0, cb + nb * 2.0, foot, dirDeg); }
    }
  }
  // the stair's foundation: a wall under the grand stair's lower end, so nothing looks under the steps
  {
    const th = S.stairTh1 * D2R, a0 = TR * Math.cos(th), b0 = TR * Math.sin(th), a1 = R * Math.cos(th), b1 = R * Math.sin(th);
    for (const [ra, rb] of [[TR, C.riverR0 - 0.2], [C.riverR1 + 0.2, R]]) { const rm2 = (ra + rb) / 2; const wall = new THREE.Mesh(new THREE.BoxGeometry(0.6, L.lower - (L.riverBed - 2), rb - ra), sand(4, 6)); wall.position.set(rm2 * Math.sin(th), (L.lower + L.riverBed - 2) / 2, rm2 * Math.cos(th)); wall.rotation.y = th; grp.add(wall); }   // update 43: in two pieces, the river's channel between
  }
  // ---- the THRONE HALL ----
  {
    const T = C.throne, hw = T.hw, tlen = T.a1 - T.a0, tac = (T.a0 + T.a1) / 2, y = L.terrace, H = 14;
    box(hw * 2 + 2, 0.4, tlen + 2, 0, y - 0.2, tac, sand(6, 6));
    box(hw * 2 + 2, 1, tlen + 2, 0, y + H + 0.5, tac, rock(6, 6));
    for (const s of [-1, 1]) { box(1, H, tlen + 2, s * (hw + 0.5), y + H / 2, tac, sand(2, 6)); wallSeg(T.a0 - 1, s * hw, T.a1 + 1, s * hw, 0.6); for (const yy of [3.2, 9.6]) box(0.25, 0.35, tlen + 2, s * (hw - 0.05), y + yy, tac, goldPlain); }
    box(hw * 2 + 2, H, 1, 0, y + H / 2, T.a0 - 0.5, sand(6, 3)); wallSeg(T.a0, -hw, T.a0, hw, 0.6);
    // update 42: one wall with the arch cut out of it (no gaps above the frame), the golden frame, green wooden gates that swing inward
    archWall(0, y, T.a1 + 0.5, hw * 2 + 2, H, 1, T.doorHw * 2, 8, sand(3, 3));
    for (const s of [-1, 1]) wallSeg(T.a1, s * T.doorHw, T.a1, s * hw, 0.6);
    archFrame(0, y, T.a1 + 1.2, T.doorHw * 2, 8, 0.7, 0.6, gold);
    city.throneGate = { seg: wallSeg(T.a1 - 0.2, -T.doorHw - 0.2, T.a1 - 0.2, T.doorHw + 0.2, 0.3), open: 0, leaves: [], local: { a: T.a1, b: 0 } };
    // update 43: the ROYAL gates — each leaf is one half of the pointed arch itself (dark green wood), bordered and banded in gold,
    // studded with emeralds, the jackal emblem on each, gold ring handles; they swing inward on their hinges
    const woodM = w.mat(A.tex.t_darkwood ? "t_darkwood" : "t_woodplank", 1, 2, 0x3c7a48); woodM.emissive = new THREE.Color(0x10301a); woodM.emissiveIntensity = 0.5;
    for (const s of [-1, 1]) {
      const hinge = new THREE.Group(); hinge.position.set(s * T.doorHw, y, T.a1 - 0.2); grp.add(hinge);
      const leaf = new THREE.Group(); leaf.position.set(-s * T.doorHw, 0, 0); hinge.add(leaf);   // the leaf's frame: origin on the arch's centre line
      const Wd = T.doorHw, Rr = Wd * 2, ys = 8 - 0.866 * Rr, ht = 8;
      const shp = new THREE.Shape(); shp.moveTo(0, 0); shp.lineTo(s * Wd, 0); shp.lineTo(s * Wd, ys);
      for (let i = 0; i <= 16; i++) { const t = (Math.PI / 3) * (i / 16); shp.lineTo(s * (-Wd + Rr * Math.cos(t)), ys + Rr * Math.sin(t)); }
      shp.lineTo(0, ht); shp.closePath();
      const geo = new THREE.ExtrudeGeometry(shp, { depth: 0.36, bevelEnabled: false }); geo.translate(0, 0, -0.18);
      { const uv = geo.attributes.uv, pp = geo.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, pp.getX(i) / 2.5, pp.getY(i) / 2.5); }
      const lm = new THREE.Mesh(geo, woodM); lm.castShadow = true; leaf.add(lm);
      const gb = (wd2, h2, d2, x2, y2, z2, m2 = gold) => { const mm = new THREE.Mesh(new THREE.BoxGeometry(wd2, h2, d2), m2); mm.position.set(x2, y2, z2); leaf.add(mm); return mm; };
      const wAt = (yy) => yy <= ys ? Wd : Math.max(0.3, -Wd + Math.sqrt(Math.max(0, Rr * Rr - (yy - ys) * (yy - ys))));   // the leaf's width at height yy
      gb(0.3, ht - 0.4, 0.46, s * 0.18, ht / 2 - 0.1, 0); gb(Wd, 0.3, 0.46, s * Wd / 2, 0.2, 0);   // the meeting edge and the sill
      for (let i = 0; i <= 16; i++) { const t = (Math.PI / 3) * (i / 16); const px = s * (-Wd + Rr * Math.cos(t)) * 0.985, py = ys + Rr * Math.sin(t) * 0.985; const seg = gb(0.3, 0.3, 0.46, px, py, 0); seg.rotation.z = t * (s > 0 ? 1 : -1); }   // the arched edge
      for (const yy of [1.8, 4.2, 6.3]) { const wl = wAt(yy) - 0.3; gb(wl, 0.28, 0.44, s * (wl / 2 + 0.15), yy, 0); for (let k = 0.6; k < wl - 0.3; k += 0.8) { const gm = new THREE.Mesh(new THREE.OctahedronGeometry(0.11), gem); gm.position.set(s * (0.15 + k), yy, 0.3); leaf.add(gm); } }
      { const tex = A.tex.t_flag; const em = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7), new THREE.MeshStandardMaterial({ map: tex || null, color: tex ? 0xffffff : 0xd9ad2e, roughness: 0.6, emissive: 0x332208, emissiveIntensity: 0.6 })); em.position.set(s * (Wd / 2 + 0.1), 3.05, 0.24); leaf.add(em); }
      { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.06, 8, 16), goldBright); ring.position.set(s * 0.9, 3.3, 0.36); ring.rotation.x = Math.PI / 2 - 0.3; leaf.add(ring); const knob = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), goldBright); knob.position.set(s * 0.9, 3.55, 0.3); leaf.add(knob); }
      for (const yy of [1.0, 4.6, 6.8]) gb(0.9, 0.22, 0.5, s * (Wd - 0.55), yy, 0, goldPlain);   // hinge straps on the outer edge
      city.throneGate.leaves.push({ hinge, s });
    }
    // the green carpet from the door to the dais, gold-edged
    box(6, 0.06, tlen - 12, 0, y + 0.04, tac + 2, carpetM(2, 8)); for (const s of [-1, 1]) box(0.3, 0.07, tlen - 12, s * 3.1, y + 0.04, tac + 2, goldPlain);
    // the dais (three steps), the throne, the relief of Ozrek behind it, two fire bowls, the flags
    for (let k = 0; k < 3; k++) box(18 - k * 2.4, 0.4, 11 - k * 1.4, 0, y + 0.2 + k * 0.4, T.a0 + 6.5 + k * 0.7, k === 2 ? gold : sand(3, 2));   // update 42: wide enough for the fire columns and the throne
    const dy = y + 1.2;
    prop("et_throne", T.a0 + 5.6, 0, dy, 0, () => {
      box(3.2, 6.5, 0.8, 0, dy + 3.25, T.a0 + 3.9, gold);
      box(3.2, 1, 2.6, 0, dy + 0.5, T.a0 + 5.6, goldPlain); box(2.6, 0.35, 2.2, 0, dy + 1.15, T.a0 + 5.6, carpetM());
      for (const s of [-1, 1]) { box(0.4, 1.4, 2.4, s * 1.4, dy + 1.7, T.a0 + 5.5, gold); const orb = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), gem); orb.position.set(s * 1.4, dy + 2.55, T.a0 + 4.4); grp.add(orb); }
      const crest = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.2, 4), goldBright); crest.position.set(0, dy + 7.4, T.a0 + 3.9); crest.rotation.y = Math.PI / 4; grp.add(crest);
      const gg = new THREE.Mesh(new THREE.OctahedronGeometry(0.42), gem); gg.position.set(0, dy + 5.4, T.a0 + 4.35); grp.add(gg);
    });
    obst(T.a0 + 5.6, 0, 1.6);
    if (A.glb.et_statue) { const m = A.glb.et_statue.model.clone(); const [x, z] = cityWorld(T.a0 + 1.6, 0); m.position.set(x, y + 1.2, z); m.rotation.y = C.grpYaw; m.scale.multiplyScalar(0.72); m.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color = new THREE.Color(0xd9ad2e); o.material.metalness = 0.6; o.material.roughness = 0.35; o.material.emissive = new THREE.Color(0x3a2a06); } }); scene.add(m); }
    box(9, 9, 0.5, 0, y + 6, T.a0 + 0.3, gold); box(3, 1.2, 3, 0, y + 0.6, T.a0 + 1.6, gold);
    for (const s of [-1, 1]) city.addBrazier(s * 5.4, y + 1.2, T.a0 + 10.2, true);   // update 42: on the dais
    for (const s of [-1, 1]) city.addPoleFlag(s * (hw - 0.05), y + 7.5, T.a0 + 3.5, s > 0 ? -90 : 90, 0.9, 5.5);   // update 43: from the side walls, not floating
    // pillars with a flag on each, torch-bearers along the walls, lamps from the ceiling
    for (let i = 0; i < 4; i++) for (const s of [-1, 1]) { const pa = T.a0 + 5 + i * 8; pillar(s * (hw - 3), y, pa, 0.7, H, gold); city.addPoleFlag(s * (hw - 0.05), y + 8.5, pa, s > 0 ? -90 : 90, 0.95, 5.0); }   // update 43: on the walls between the pillars
    for (let i = 0; i < 3; i++) for (const s of [-1, 1]) city.addTorchbearer(T.a0 + 9 + i * 9, s * (hw - 1.6), y, s > 0 ? -90 : 90);
    for (let i = 0; i < 3; i++) city.addCeilingLamp(T.a0 + 8 + i * 9, 0, y + H, 3.2);
    // treasure and trophies: chests, urns, coin heaps, a gilded T-Rex skeleton on a plinth
    for (const [ca, cb] of [[T.a0 + 2.5, -(hw - 3.5)], [T.a0 + 2.5, hw - 3.5], [T.a0 + 8, -(hw - 2.6)]]) {
      if (A.glb.chest) { const m = A.glb.chest.model.clone(); const [x, z] = cityWorld(ca, cb); m.position.set(x, y, z); m.rotation.y = C.grpYaw + Math.PI; scene.add(m); }
      const heap = new THREE.Mesh(new THREE.ConeGeometry(1.1, 0.7, 12), goldBright); heap.position.set(cb + 1.5, y + 0.35, ca + 1.2); grp.add(heap); obst(ca, cb, 0.8);
    }
    for (const [ca, cb] of [[T.a0 + 14, -(hw - 1.8)], [T.a0 + 22, hw - 1.8], [T.a0 + 30, -(hw - 1.8)]]) {
      const urn = new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(0.3, 0), new THREE.Vector2(0.7, 0.5), new THREE.Vector2(0.55, 1.4), new THREE.Vector2(0.75, 1.9), new THREE.Vector2(0.45, 2.1)], 14), gold); urn.position.set(cb, y, ca); grp.add(urn); obst(ca, cb, 0.7);
    }
    if (A.glb.trexskel) { const m = A.glb.trexskel.model.clone(); const [x, z] = cityWorld(T.a0 + 20, hw - 5); m.position.set(x, y + 1.0, z); m.rotation.y = C.grpYaw + Math.PI / 2; m.scale.multiplyScalar(0.45); m.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color = new THREE.Color(0xe0b230); o.material.metalness = 0.5; o.material.roughness = 0.4; } }); scene.add(m); box(6, 1.0, 3, hw - 5, y + 0.5, T.a0 + 20, sand(2, 1)); obst(T.a0 + 20, hw - 5, 3); }
    city.throneLocal = { a: T.a0 + 8, b: 0 };
  }
  // ---- the VAULT behind the river ----
  {
    const V = C.vault, vhw = V.hw, vlen = V.b1 - V.b0, bc = -(V.b0 + V.b1) / 2, yv = L.lower, HV = 7;
    box(vhw * 2 + 2, 0.4, vlen + 2, bc, yv - 0.2, 0, sand(6, 6), Math.PI / 2);
    box(vhw * 2 + 2, 1, vlen + 2, bc, yv + HV + 0.5, 0, rock(6, 6), Math.PI / 2);
    for (const s of [-1, 1]) { box(1, HV, vlen + 2, bc, yv + HV / 2, s * (vhw + 0.5), sand(2, 6), Math.PI / 2); wallSeg(s * vhw, -V.b0 + 1, s * vhw, -V.b1 - 1, 0.6); }
    box(vhw * 2 + 2, HV, 1, -V.b1 - 0.5, yv + HV / 2, 0, sand(6, 2), Math.PI / 2); wallSeg(-vhw, -V.b1, vhw, -V.b1, 0.6);
    for (const s of [-1, 1]) { box(vhw - V.doorHw, HV, 1, -V.b0 + 0.5, yv + HV / 2, s * (V.doorHw + (vhw - V.doorHw) / 2), sand(3, 2), Math.PI / 2); wallSeg(s * V.doorHw, -V.b0, s * vhw, -V.b0, 0.6); }
    archFrame(-V.b0 - 1.0, yv, 0, V.doorHw * 2, 6, 0.5, 0.5, gold, Math.PI / 2);
    let door;   // update 42: the generated vault door (Higgsfield: et_vaultdoor); the plain gold slab stays as the stand-in
    if (A.glb.et_vaultdoor) { const d = A.glb.et_vaultdoor.model.clone(); const bb = new THREE.Box3().setFromObject(d), sz = new THREE.Vector3(); bb.getSize(sz); const dg = new THREE.Group(); dg.add(d); dg.scale.set((V.doorHw * 2 + 0.3) / sz.x, (HV - 0.7) / sz.y, 1); dg.position.set(-V.b0, yv, 0); dg.rotation.y = -Math.PI / 2; grp.add(dg); door = dg; }   // the scarab lock faces the gallery
    else door = box(V.doorHw * 2, HV - 1, 0.5, -V.b0, yv + (HV - 1) / 2, 0, gold, Math.PI / 2);
    const dg = new THREE.Mesh(new THREE.OctahedronGeometry(0.4), gem); dg.position.set(-V.b0 + 0.5, yv + 3.2, 0); grp.add(dg);
    city.vaultDoor = door; city.vaultDoorSeg = { a0: -V.doorHw, b0: -V.b0, a1: V.doorHw, b1: -V.b0, t: 0.5 }; city.walls.push(city.vaultDoorSeg);
    city.vaultDoorLocal = { a: 0, b: -V.b0 + 2.5 };
    for (const s of [-1, 1]) city.addLantern(-V.b0 - 2, yv + 3, s * (vhw - 1.5), false, true);
    city.addCeilingLamp(0, -V.b1 + 6, yv + HV, 1.8);
    city.vaultChests = [];
    for (const [ca, cb] of [[-8, -(V.b1 - 5)], [0, -(V.b1 - 4)], [8, -(V.b1 - 5)]]) {
      const [wx, wz] = cityWorld(ca, cb); let mesh = null;
      if (A.glb.chest) { mesh = A.glb.chest.model.clone(); mesh.position.set(wx, yv, wz); mesh.rotation.y = C.grpYaw + Math.PI; scene.add(mesh); }
      const ch = { x: wx, z: wz, y: yv, opened: false, knife: false, mesh, snake: false, treasure: true, desert: true, vault: true };
      w.chests.push(ch); city.vaultChests.push(ch); obst(ca, cb, 0.7);
    }
    const heap = new THREE.Mesh(new THREE.ConeGeometry(2.2, 1.2, 12), goldPlain); heap.position.set(bc, yv + 0.6, 0); grp.add(heap);
  }
  // ---- HOMES: house fronts along the cavern wall on every level; four of them open into a room ----
  buildHomes(city, grp, box, cyl, sand, rock, gold, goldPlain, goldBright, gem, dark, wallSeg, obst, archFrame, carpetM, prop, glowM, greenGlowM);
  // ---- the MARKET, the INN, the lampposts and flags on the terraces, the doors of the mountain gate ----
  for (const st of C.stalls) buildStall(city, st, grp, box, sand, gold, goldPlain, goldBright, gem, dark, obst, prop, latticeM, glowM);
  {
    const I = C.inn, y = L.terrace, cs = Math.cos(I.th * D2R), sn = Math.sin(I.th * D2R);
    const [ia, ib] = [I.r * cs, I.r * sn];
    box(14, 0.3, 12, ib, y + 0.15, ia, sand(3, 3), I.th * D2R);
    for (const s of [-1, 1]) for (const t of [-1, 1]) { const pa = ia + s * 5.5 * cs - t * 5.5 * sn, pb = ib + s * 5.5 * sn + t * 5.5 * cs; pillar(pb, y, pa, 0.4, 5.6, gold); }
    box(15, 0.4, 13, ib, y + 5.8, ia, gold, I.th * D2R);
    city.addBanner(ib - 1.4 * sn * 0 + 0, y + 5.6, ia, 0, 2, 3.4);
    city.innBeds = [];
    for (let k = -1; k <= 1; k++) {
      // three beds side by side, their heads to the back, turned 90 degrees from the old row
      const ba = ia - 2.0 * cs + k * 4.2 * -sn, bb = ib - 2.0 * sn + k * 4.2 * cs;
      const [wx, wz] = cityWorld(ba, bb);
      const face = I.th;   // the head toward the back wall
      prop("et_bed", ba, bb, y + 0.3, face, () => {
        const gg = new THREE.Group(); gg.position.set(bb, y + 0.3, ba); gg.rotation.y = face * D2R; grp.add(gg);
        const frame = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 3.8), gold); frame.position.y = 0.45; gg.add(frame);
        const matt = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.35, 3.6), new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.9 })); matt.position.y = 0.85; gg.add(matt);
        const blanket = new THREE.Mesh(new THREE.BoxGeometry(2.24, 0.12, 2.6), carpetM()); blanket.position.set(0, 1.06, -0.5); gg.add(blanket);
        const pillow = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.25, 0.7), new THREE.MeshStandardMaterial({ color: 0xf4eedc, roughness: 0.9 })); pillow.position.set(0, 1.12, 1.35); gg.add(pillow);
        const head = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, 0.16), gold); head.position.set(0, 1.2, 1.9); gg.add(head);
        const gm = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), gem); gm.position.set(0, 1.85, 1.9); gg.add(gm);
        return gg;
      });
      city.emit(grp, bb, y + 4.6, ba, 0x7cff9a, 1.1, 9, {});
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), greenGlowM); glow.position.set(bb, y + 4.9, ba); grp.add(glow);
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 4), dark); cord.position.set(bb, y + 5.3, ba); grp.add(cord);
      city.innBeds.push({ x: wx, z: wz, y: y + 0.3 });
      obst(ba, bb, 1.4);
    }
    city.innLocal = { a: ia + 4 * cs, b: ib + 4 * sn };
    city.addLantern(ib + 6 * cs, y + 4.6, ia - 6 * sn, false, true);
  }
  // lampposts along both terraces and the plaza ring, flags on the terrace wall
  for (let th = ET + 14; th < 180 + 30; th += 22) { const t2 = th > 180 ? th - 360 : th; if (t2 > S.stairTh0 && t2 < 0) continue; const rr = TR + 3; city.addLamppost(rr * Math.cos(t2 * D2R), rr * Math.sin(t2 * D2R), L.terrace, false); }
  for (let th = S.stairTh1 + 8; th < -ET - 6; th += 22) { const rr = TR + 3; city.addLamppost(rr * Math.cos(th * D2R), rr * Math.sin(th * D2R), L.lower, false); }
  for (let th = -160; th <= 160; th += 40) { if (Math.abs(th) < 10) continue; const rr = 62; city.addLamppost(rr * Math.cos(th * D2R), rr * Math.sin(th * D2R), L.plaza, false); }
  {   // update 42: the lamppost that stood INSIDE the entry stair — two now, on golden plinths on the treads either side of the way
    const n = Math.round((L.court - L.plaza) / rise), run = (C.entryA - C.entryRampA) / n, ay = 62;
    const treadY = L.plaza + rise * Math.min(n, Math.ceil((ay - C.entryRampA) / run));
    for (const s of [-1, 1]) { box(1.8, 0.5, 1.8, s * 10, treadY + 0.25, ay, gold); city.addLamppost(ay, s * 10, treadY + 0.5, false); }
  }
  // update 42: flags on poles socketed in the rock above the house fronts; the plaza's wall gets torch-bearers and flags too
  for (let th = 70; th <= 180; th += 22) city.addWallFlag(th, L.terrace + 9.2);
  for (let th = -178; th <= S.stairTh0 - 4; th += 22) city.addWallFlag(th, L.terrace + 9.2);
  for (let th = S.stairTh1 + 6; th <= -ET - 6; th += 20) city.addWallFlag(th, L.lower + 9.2);
  for (let th = -50; th <= 50; th += 25) if (Math.abs(th) > 12) city.addWallFlag(th, L.court + 9.2);
  for (let th = ET + 12; th <= 180 + 25; th += 24) { const t2 = th > 180 ? th - 360 : th; if (t2 > S.stairTh0 && t2 < 0) continue; if (Math.abs(t2 - 90) < 9) continue; city.addTorchbearer((TR - 1.7) * Math.cos(t2 * D2R), (TR - 1.7) * Math.sin(t2 * D2R), L.plaza, t2 + 180); }
  for (let th = S.stairTh1 + 10; th <= -ET - 10; th += 24) { if (Math.abs(th + 90) < 9) continue; city.addTorchbearer((TR - 1.7) * Math.cos(th * D2R), (TR - 1.7) * Math.sin(th * D2R), L.plaza, th + 180); }
  // update 43: the plaza's retaining wall above the river gallery and the terrace's face above the plaza — gold bands,
  // pilasters with gems, flags on leaning poles, torch statues at their feet — no more blank curved faces
  {
    const deco = (t0, t1, yLo, yHi, stepDeg, faceOut) => {   // faceOut: the visible face looks toward larger r
      const rP = faceOut ? TR + 0.3 : TR - 0.3, sgn = faceOut ? 1 : -1;
      cyl(rP, t0, t1, yHi - 0.55, yHi - 0.05, gold, !faceOut, 24); cyl(rP, t0, t1, yLo + 0.05, yLo + 0.55, gold, !faceOut, 24);
      for (let t = t0 + stepDeg / 2; t < t1; t += stepDeg) {
        const ca = Math.cos(t * D2R), cb = Math.sin(t * D2R);
        box(0.7, yHi - yLo - 1.1, 0.7, (TR + sgn * 0.35) * cb, (yLo + yHi) / 2, (TR + sgn * 0.35) * ca, gold, t * D2R);
        const gm = new THREE.Mesh(new THREE.OctahedronGeometry(0.3), gem); gm.position.set((TR + sgn * 0.8) * cb, yHi - 1.6, (TR + sgn * 0.8) * ca); grp.add(gm);
        if ((Math.round((t - t0) / stepDeg)) % 2 === 1) city.addPoleFlag((TR + sgn * 0.3) * cb, yHi - 3.2, (TR + sgn * 0.3) * ca, t + (faceOut ? 0 : 180), 0.9, 4.5);
      }
    };
    { const dth = ((C.stairs.down.hw + 0.4) / TR) / D2R; deco(S.stairTh1 + 1, -90 - dth - 1, L.lower, L.plaza, 10, true); deco(-90 + dth + 1, -ET - 1, L.lower, L.plaza, 10, true); }
    for (let t = S.stairTh1 + 8; t < -ET - 6; t += 24) { if (Math.abs(t + 90) < 8) continue; city.addTorchbearer((TR + 2.0) * Math.cos(t * D2R), (TR + 2.0) * Math.sin(t * D2R), L.lower, t); }
    { const dth = ((C.stairs.up.hw + 0.4) / TR) / D2R; deco(ET + 1, 90 - dth - 1, L.plaza, L.terrace, 10, false); deco(90 + dth + 1, 180, L.plaza, L.terrace, 10, false); deco(-180, S.stairTh0 - 1, L.plaza, L.terrace, 10, false); }
  }
  // update 42: the golden balustrade (Higgsfield: et_fence) along both terrace edges and the grand stair's inner edge —
  // you can walk into it, and it is what stops you from jumping down
  {
    const F = A.glb.et_fence; let segW = 3.0;
    if (F) { const bb = new THREE.Box3().setFromObject(F.model), sz = new THREE.Vector3(); bb.getSize(sz); segW = Math.max(1.2, sz.x); }
    const rr = TR + 0.45;
    const place = (thDeg, y) => {
      const th = thDeg * D2R, ca = rr * Math.cos(th), cb = rr * Math.sin(th);
      if (F) { const m = F.model.clone(); const [x, z] = cityWorld(ca, cb); m.position.set(x, y, z); m.rotation.y = C.grpYaw + th; scene.add(m); }
      else box(segW, 1.3, 0.16, cb, y + 0.65, ca, goldPlain, th);
    };
    const run = (t0, t1, yOf, skip) => { const step = (segW / rr) / D2R; for (let th = t0 + step / 2; th < t1; th += step) { if (skip && skip(th)) continue; place(th, yOf(th)); } };
    run(ET + 1.5, 180, () => L.terrace, (th) => Math.abs(th - 90) < 4.6);
    run(-180, S.stairTh0 - 1, () => L.terrace);
    // update 43: no fence against the plaza's wall on the river level; the grand stair gets a stepped balustrade of its own
    city.stairFence(TR + 0.45, S.stairTh0 + 0.4, S.stairTh1 - 0.3, (t) => city.grandStairY(t), 1);
  }
  // the mountain gate on the cavern side: a carved pointed arch with golden double doors that swing open as you come near
  {
    const TN = C.tunnel, y = L.court, a = TN.a0 - 0.6;
    archFrame(0, y, a, TN.hw * 2 + 1.2, TN.h + 4.5, 1.1, 1.2, gold);
    for (const s of [-1, 1]) { pillar(s * (TN.hw + 1.8), y, a - 0.4, 0.55, TN.h + 3, gold); const gg = new THREE.Mesh(new THREE.OctahedronGeometry(0.45), gem); gg.position.set(s * (TN.hw + 1.8), y + TN.h + 4.2, a - 0.4); grp.add(gg); }
    city.gate = { seg: wallSeg(a, -TN.hw - 0.2, a, TN.hw + 0.2, 0.3), open: 0, leaves: [] };
    for (const s of [-1, 1]) {
      const hinge = new THREE.Group(); hinge.position.set(s * TN.hw, y, a); grp.add(hinge);
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(TN.hw, TN.h - 0.2, 0.35), gold); leaf.position.set(-s * TN.hw / 2, (TN.h - 0.2) / 2, 0); hinge.add(leaf);
      for (const yy of [2.2, TN.h / 2, TN.h - 2.2]) { const gm = new THREE.Mesh(new THREE.OctahedronGeometry(0.3), gem); gm.position.set(-s * TN.hw / 2, yy, 0.3); hinge.add(gm); }
      for (const dz of [-0.28, 0.28]) { const pan = new THREE.Mesh(new THREE.BoxGeometry(TN.hw - 1.2, TN.h - 2.4, 0.1), goldBright); pan.position.set(-s * TN.hw / 2, TN.h / 2, dz); hinge.add(pan); }
      city.gate.leaves.push({ hinge, s });
    }
    city.gateLocal = { a, b: 0 };
    for (const s of [-1, 1]) city.addTorchbearer(a - 4, s * (TN.hw + 5), y, 180);   // update 42: turned to face the city
  }
}

function buildHomes(city, grp, box, cyl, sand, rock, gold, goldPlain, goldBright, gem, dark, wallSeg, obst, archFrame, carpetM, prop, glowM, greenGlowM) {
  const C = E(), L = C.levels, R = C.wallR, A = city.g.assets, scene = city.g.scene;
  const S = C.split, ET = C.entryTh, RM = C.room;
  // where NOTHING may stand along the wall (doors, the inn, the stalls' line of sight is not a concern here)
  // update 42: the throne hall and the vault are wider than their doors — no house fronts inside their span
  // update 43: nothing behind the radial walls either
  const blocked = [[-8, 8], [167, 180], [-180, -167], [-101, -79], [ET - 7, ET + 7], [-ET - 7, -ET + 7], [C.inn.th - 9, C.inn.th + 9], [S.stairTh0 - 1, S.stairTh1 + 1]];
  for (const rm of C.rooms) blocked.push([rm.th - 6, rm.th + 6]);
  const isBlocked = (th) => blocked.some(([t0, t1]) => th > t0 && th < t1);
  const levelAt = (th) => (Math.abs(th) < ET ? L.court : (th >= ET || th <= S.stairTh0) ? L.terrace : th >= S.stairTh1 ? L.lower : null);
  const windowM = new THREE.MeshBasicMaterial({ color: 0xffd08a });
  city.homeGlows = [];
  const facade = (th, y) => {
    const rr = R - 0.6, ca = rr * Math.cos(th * D2R), cb = rr * Math.sin(th * D2R), ry = th * D2R + Math.PI;   // faces the heart
    const gg = new THREE.Group(); gg.position.set(cb, y, ca); gg.rotation.y = ry; grp.add(gg);
    const add = (geo, m, x, yy, z) => { const mm = new THREE.Mesh(geo, m); mm.position.set(x, yy, z); mm.castShadow = true; gg.add(mm); return mm; };
    // a sandstone front standing a little proud of the rock, a doorway, two windows, a balcony with a gold rail, a lantern
    add(new THREE.BoxGeometry(7.6, C.facadeH, 0.9), sand(2, 2), 0, C.facadeH / 2, 0);
    add(new THREE.BoxGeometry(2.4, 4.0, 0.3), sand(1, 2), 0, 2.0, 0.1);   // update 43: a sand backing, not a black one
    // update 42: a green wooden door with a golden knob (Higgsfield: et_door) fills the doorway of every house you cannot enter
    if (A.glb.et_door) { const d = city.warmProp(A.glb.et_door.model.clone(), 0.34); const bb = new THREE.Box3().setFromObject(d), sz = new THREE.Vector3(); bb.getSize(sz); const dg = new THREE.Group(); dg.add(d); dg.scale.set(2.3 / sz.x, 3.9 / sz.y, 1); dg.position.set(0, 0.03, 0.62); dg.rotation.y = Math.PI; gg.add(dg); }   // the knob side out, self-lit
    add(new THREE.BoxGeometry(0.35, 4.2, 0.5), goldPlain, -1.35, 2.1, 0.5); add(new THREE.BoxGeometry(0.35, 4.2, 0.5), goldPlain, 1.35, 2.1, 0.5);
    add(new THREE.BoxGeometry(3.1, 0.4, 0.5), goldPlain, 0, 4.3, 0.5);
    for (const s of [-1, 1]) { add(new THREE.BoxGeometry(1.4, 1.6, 0.3), goldPlain, s * 2.6, 2.6, 0.5); const win = add(new THREE.BoxGeometry(1.1, 1.3, 0.1), windowM, s * 2.6, 2.6, 0.72); city.homeGlows.push(win); add(new THREE.BoxGeometry(0.08, 1.3, 0.06), goldPlain, s * 2.6, 2.6, 0.8); add(new THREE.BoxGeometry(1.1, 0.08, 0.06), goldPlain, s * 2.6, 2.6, 0.8); }   // update 42: the pane stands proud of the frame, a cross mullion
    add(new THREE.BoxGeometry(6.2, 0.3, 1.6), sand(2, 1), 0, 5.3, 0.9);
    for (let k = -3; k <= 3; k++) add(new THREE.BoxGeometry(0.1, 1.0, 0.1), goldPlain, k * 1.0, 5.95, 1.6);
    add(new THREE.BoxGeometry(6.2, 0.1, 0.1), goldPlain, 0, 6.45, 1.6);
    add(new THREE.BoxGeometry(1.0, 1.1, 0.3), goldPlain, 0, 6.2, 0.55); const win2 = add(new THREE.BoxGeometry(0.8, 0.9, 0.1), windowM, 0, 6.2, 0.77); city.homeGlows.push(win2); add(new THREE.BoxGeometry(0.06, 0.9, 0.05), goldPlain, 0, 6.2, 0.84);
    add(new THREE.BoxGeometry(0.3, 0.4, 0.3), glowM, 2.2, 3.9, 0.7);
    city.emit(gg, 2.2, 3.9, 1.2, 0xffc35a, 1.3, 12, {});
    // the blocking wall segment (the front is 0.9 m proud of the rock)
    const ta = [-Math.sin(th * D2R), Math.cos(th * D2R)];   // tangential (a, b)
    const fa = (R - 1.1) * Math.cos(th * D2R), fb = (R - 1.1) * Math.sin(th * D2R);
    wallSeg(fa - ta[0] * 3.8, fb - ta[1] * 3.8, fa + ta[0] * 3.8, fb + ta[1] * 3.8, 0.5);
  };
  for (let th = -180 + 4; th < 180; th += C.facadeStep / R / D2R) {
    const t = th > 180 ? th - 360 : th;
    if (isBlocked(t)) continue;
    const y = levelAt(t); if (y === null) continue;
    facade(t, y);
  }
  // the four rooms: carved beyond the wall, with a bed, a table and chairs, a lamp, and someone at home
  city.rooms = [];
  for (const rm of C.rooms) {
    const th = rm.th, y = L[rm.level], rad = [Math.cos(th * D2R), Math.sin(th * D2R)], tan = [-Math.sin(th * D2R), Math.cos(th * D2R)];
    const P = (u, v) => [R + u, v].map((_, i) => 0) && [R * rad[0] + u * rad[0] + v * tan[0], R * rad[1] + u * rad[1] + v * tan[1]];   // (u out of the wall, v along it) -> (a, b)
    const ry = th * D2R;   // local +z (a) points outward along the radial
    const cu = RM.depth / 2, [ca, cb] = P(cu, 0);
    box(RM.hw * 2 + 1, 0.3, RM.depth + 1.5, cb, y - 0.15, ca, sand(3, 3), ry);
    box(RM.hw * 2 + 1, 0.4, RM.depth + 1.5, cb, y + RM.h + 0.2, ca, rock(3, 3), ry);
    for (const s of [-1, 1]) { const [sa, sb] = P(cu, s * (RM.hw + 0.3)); box(0.6, RM.h, RM.depth + 1, sb, y + RM.h / 2, sa, sand(2, 2), ry); const [q0a, q0b] = P(-0.5, s * RM.hw), [q1a, q1b] = P(RM.depth + 0.5, s * RM.hw); wallSeg(q0a, q0b, q1a, q1b, 0.4); }
    { const [ba, bb] = P(RM.depth + 0.3, 0); box(RM.hw * 2 + 1, RM.h, 0.6, bb, y + RM.h / 2, ba, sand(2, 2), ry); const [q0a, q0b] = P(RM.depth, -RM.hw), [q1a, q1b] = P(RM.depth, RM.hw); wallSeg(q0a, q0b, q1a, q1b, 0.4); }
    // the front wall pieces either side of the door (the rock ring has its gap here)
    // update 42: the front is ONE wall with the arch cut out of it, so nothing gapes above or beside the frame
    { const [fa, fb] = P(0, 0); city.prims.archWall(fb, y, fa, RM.hw * 2 + 1, RM.h + 0.6, 0.7, RM.doorHw * 2, 4.6, sand(2, 2), ry); for (const s of [-1, 1]) { const [q0a, q0b] = P(0, s * RM.doorHw), [q1a, q1b] = P(0, s * RM.hw); wallSeg(q0a, q0b, q1a, q1b, 0.5); } }
    { const [fa, fb] = P(-0.25, 0); archFrame(fb, y, fa, RM.doorHw * 2, 4.6, 0.4, 0.5, gold, ry); }
    { const [fa, fb] = P(0.2, 3.2); box(0.3, 0.4, 0.3, fb, y + 3.9, fa, glowM); }
    // furnishing
    const [ra, rb] = P(RM.depth * 0.55, 0); box(RM.hw * 1.4, 0.05, RM.depth * 0.6, rb, y + 0.03, ra, carpetM(1.5, 1.5), ry);
    const [ba, bb] = P(RM.depth - 2.4, -(RM.hw - 1.6));
    prop("et_bed", ba, bb, y, th + 90, () => { const gg = new THREE.Group(); gg.position.set(bb, y, ba); gg.rotation.y = ry + Math.PI / 2; grp.add(gg); const fr = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 3.4), gold); fr.position.y = 0.4; gg.add(fr); const mt = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.3, 3.2), new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.9 })); mt.position.y = 0.8; gg.add(mt); const bl = new THREE.Mesh(new THREE.BoxGeometry(2.04, 0.1, 2.2), carpetM()); bl.position.set(0, 0.98, -0.4); gg.add(bl); return gg; });
    obst(ba, bb, 1.3);
    if (A.glb.k_table) { const [ta, tb] = P(RM.depth * 0.5, RM.hw - 2.2); const m = A.glb.k_table.model.clone(); const [x, z] = cityWorld(ta, tb); m.position.set(x, y, z); m.rotation.y = C.grpYaw + ry; scene.add(m); obst(ta, tb, 1.0); }
    if (A.glb.k_chair) for (const dv of [-1.2, 1.2]) { const [ta, tb] = P(RM.depth * 0.5 + dv, RM.hw - 2.2); const m = A.glb.k_chair.model.clone(); const [x, z] = cityWorld(ta, tb); m.position.set(x, y, z); m.rotation.y = C.grpYaw + ry + (dv > 0 ? Math.PI : 0); scene.add(m); }
    city.addCeilingLamp(ca, cb, y + RM.h, 1.2, true);
    const [na, nb] = P(RM.depth * 0.45, 0.5), [fa2, fb2] = P(-3, 0);
    city.rooms.push({ th, level: rm.level, y, kind: rm.kind, npc: { a: na, b: nb, faceA: fa2, faceB: fb2 }, doorA: P(0, 0)[0], doorB: P(0, 0)[1] });
  }
}

function buildStall(city, st, grp, box, sand, gold, goldPlain, goldBright, gem, dark, obst, prop, latticeM, glowM) {
  const C = E(), L = C.levels, A = city.g.assets, scene = city.g.scene, w = city.g.world;
  const a = st.r * Math.cos(st.th * D2R), b = st.r * Math.sin(st.th * D2R), y = L.plaza, ry = st.th * D2R;
  const cos = Math.cos(st.th * D2R), sin = Math.sin(st.th * D2R);
  // local helpers: (u toward the altar is -radial, v along the counter)
  const P = (u, v) => [a - u * cos - v * sin, b - u * sin + v * cos];
  const bx = (wd, h, d, u, yy, v, m) => { const [pa, pb] = P(u, v); const mm = new THREE.Mesh(new THREE.BoxGeometry(wd, h, d), m); mm.position.set(pb, yy, pa); mm.rotation.y = ry; mm.castShadow = true; grp.add(mm); return mm; };
  // the counter, gold-topped, on a woven rug; a back wall of shelves; four posts and a cloth awning with hanging lanterns
  bx(6.0, 1.1, 1.3, 0, y + 0.55, 0, sand(2, 1)); bx(6.3, 0.14, 1.6, 0, y + 1.17, 0, gold);
  bx(8.5, 0.05, 7.5, -1.2, y + 0.03, 0, city.mats.carpetM(2, 2));
  bx(6.0, 3.6, 0.35, -2.4, y + 1.8, 0, sand(2, 1));
  for (const yy of [1.6, 2.6]) bx(5.6, 0.12, 0.6, -2.2, y + yy, 0, goldPlain);
  for (const s of [-1, 1]) for (const u of [1.3, -2.4]) { const [pa, pb] = P(u, s * 3.1); const p = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 3.8, 6), gold); p.position.set(pb, y + 1.9, pa); grp.add(p); }
  const aw = new THREE.MeshStandardMaterial({ color: st.color || 0x2f7a3a, roughness: 0.9, side: THREE.DoubleSide, emissive: 0x101010 });
  const awn = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 4.6, 8, 4), aw);
  { const p = awn.geometry.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 2.6) * 0.08 - Math.abs(p.getY(i)) * 0.06); awn.geometry.computeVertexNormals(); }
  const [awa, awb] = P(-0.6, 0); awn.position.set(awb, y + 3.85, awa); awn.rotation.set(-Math.PI / 2 + 0.28, ry, 0, "YXZ"); grp.add(awn);
  for (const s of [-1, 1]) { const [la, lb] = P(0.9, s * 2.2); const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.55, 6, 1, true), latticeM()); cage.position.set(lb, y + 3.1, la); grp.add(cage); const gl = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.5, 6), glowM); gl.position.set(lb, y + 3.1, la); grp.add(gl); city.emit(grp, lb, y + 2.9, la, 0xffc35a, 1.4, 12, {}); }
  // the wares: what each stall really sells, on the counter and the shelves
  const put = (id, u, v, yy, yaw = 0, sc = 1, tint = null) => {
    const asset = A.glb[id]; if (!asset) return false;
    const m = asset.model.clone(); const [pa, pb] = P(u, v); const [x, z] = cityWorld(pa, pb);
    m.position.set(x, y + yy, z); m.rotation.y = C.grpYaw + ry + yaw; if (sc !== 1) m.scale.multiplyScalar(sc);
    if (tint) m.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color = new THREE.Color(tint); } });
    scene.add(m); return true;
  };
  const ball = (u, v, yy, r, col) => { const [pa, pb] = P(u, v); const mm = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), new THREE.MeshStandardMaterial({ color: col, roughness: 0.7 })); mm.position.set(pb, y + yy, pa); grp.add(mm); };
  if (st.id === "food") {
    for (const [v, col] of [[-2.1, 0xc83c2a], [-1.3, 0xc83c2a], [1.6, 0x3a3f88], [2.3, 0xe8d060]]) { put("k_basket", 0, v, 1.24, 0, 0.8) || bx(0.7, 0.3, 0.5, 0, y + 1.4, v, dark); for (let k = 0; k < 4; k++) ball(0.12 * Math.sin(k * 2.1), v + 0.18 * Math.cos(k * 1.9), 1.55, 0.11, col); }
    put("barrel", -1.2, -2.8, 0, 0, 0.8); put("k_potrack", -2.35, 0.8, 2.75, Math.PI, 0.7); put("bplush", 0, 0.4, 1.24, 0, 0.8); put("bcrate", -1.4, 2.9, 0, 0, 0.8);   // update 42: the blueberries moved here from the tool stall
    for (let k = 0; k < 5; k++) ball(-2.2, -2.2 + k * 0.5, 1.75, 0.13, k % 2 ? 0xd9412a : 0xe6c34a);
    put("k_herbs", -2.3, 2.2, 3.4, 0, 0.8);
  } else if (st.id === "tools") {
    put("axe3d", 0.2, -1.9, 1.3, Math.PI / 2, 1.1); put("knife3d", 0.1, -0.6, 1.3, Math.PI / 2, 1.2); put("torch3d", 0.1, 0.5, 1.3, Math.PI / 2, 1.1); put("crossbow3d", -2.3, 1.0, 2.75, 0, 0.9);
    const [ra, rb] = P(0, 1.7); const rope = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.09, 8, 16), new THREE.MeshStandardMaterial({ color: 0xb08a50, roughness: 1 })); rope.position.set(rb, y + 1.28, ra); rope.rotation.x = Math.PI / 2; grp.add(rope);
    bx(0.5, 0.12, 0.12, 0, y + 1.3, 2.4, dark); bx(0.12, 0.34, 0.12, 0, y + 1.42, 2.55, dark);   // a hammer
    for (let k = 0; k < 4; k++) bx(0.06, 0.06, 0.9, -2.2, y + 1.75, -2.0 + k * 0.4, goldPlain);   // arrows on the shelf
  } else if (st.id === "rare") {
    for (const [v, col] of [[-2.0, 0x2fdc5a], [-1.0, 0xd9412a], [1.0, 0x4a7ee6], [2.0, 0xe8e8ff]]) { const [pa, pb] = P(0, v); const gm = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.5, roughness: 0.2 })); gm.position.set(pb, y + 1.48, pa); grp.add(gm); bx(0.5, 0.1, 0.5, 0, y + 1.29, v, goldPlain); }
    put("trexskel", -2.35, 0, 2.75, Math.PI / 2, 0.12, 0xf0e6c8); put("wolfstatue", -2.3, -2.2, 2.75, 0, 0.35);   // update 42: no giant dagger on the counter
    const [ua, ub] = P(-2.3, 2.2); const urn = new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(0.15, 0), new THREE.Vector2(0.35, 0.3), new THREE.Vector2(0.25, 0.8), new THREE.Vector2(0.3, 1.0)], 12), goldBright); urn.position.set(ub, y + 2.7, ua); grp.add(urn);
  } else {
    put("anvil", -0.3, -3.2, 0, Math.PI / 2, 1.0); put("etsword3d", 0, -1.4, 1.42, 0, 0.9); put("etspear3d", 0, 1.4, 1.42, 0, 0.8);   // update 42: no dagger, the blades a little smaller
    for (let k = 0; k < 3; k++) bx(0.16, 0.16, 0.7, -2.2, y + 1.75, -1.4 + k * 1.4, gold);   // ingots
    city.addFlame(...(() => { const [fa, fb] = P(-1.4, 3.4); return [fb, y + 1.1, fa, 0.8]; })());
    const [ha, hb] = P(-1.4, 3.4); const hearth = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.9, 0.8, 10), dark); hearth.position.set(hb, y + 0.4, ha); grp.add(hearth);
  }
  obst(a, b, 3.4);
  const [ka, kb] = P(-1.1, 0), [kx, kz] = cityWorld(ka, kb);   // the keeper behind the counter
  const [fa, fb] = P(2.3, 0), [fx, fz] = cityWorld(fa, fb);    // where you stand to trade
  const [wx, wz] = cityWorld(a, b);
  city.stalls.push({ ...st, x: wx, z: wz, y, keeperX: kx, keeperZ: kz, frontX: fx, frontZ: fz });
}

export function flameCanvas() {
  const cv = document.createElement("canvas"); cv.width = 64; cv.height = 96;
  const c = cv.getContext("2d");
  const gr = c.createRadialGradient(32, 62, 4, 32, 58, 34);
  gr.addColorStop(0, "rgba(255,240,190,1)"); gr.addColorStop(0.35, "rgba(255,170,60,0.9)"); gr.addColorStop(0.7, "rgba(230,80,20,0.45)"); gr.addColorStop(1, "rgba(0,0,0,0)");
  c.fillStyle = gr; c.beginPath(); c.moveTo(32, 4); c.bezierCurveTo(50, 30, 58, 60, 32, 92); c.bezierCurveTo(6, 60, 14, 30, 32, 4); c.fill();
  return cv;
}

// ============================================================================
// update 41: the city is built from ~2500 small boxes, cylinders and tori, each its own draw call — from the
// courtyard, looking through the mountain gate, 2400 of them were in view (31 ms of CPU per frame). Every
// STATIC mesh with a plain position/normal/uv geometry is merged with its look-alikes (same material recipe)
// per district — 12 sectors by 5 rings — so frustum culling still drops what is behind you. The moving parts
// (flags, flames, doors, the gem, the beam, water, the mountain) and the GLB props are left alone.
// ============================================================================
function mergeStatic(city, grp) {
  // the moving and the toggled: flags, flames, the light rays, doors, the gem, the beam, the water, the mountain
  const keep = new Set([...(city.flags || []), ...(city.flames || []), ...(city.lanterns || []).map((l) => l.glow), ...(city.nightGlows || []),
    ...(city.rays || []), ...(city.doors || []), city.altarGem, city.lakeMesh, city.riverMesh, city.mountainMesh, city.beam, city.pool, city.vaultDoor].filter(Boolean));
  const dynAnc = new Set([...((city.gate && city.gate.leaves) || []).map((l) => l.hinge), ...((city.throneGate && city.throneGate.leaves) || []).map((l) => l.hinge), city.vaultDoor].filter(Boolean));   // update 43: the throne gates and the vault door move
  // a texture's identity is its SOURCE — the repeat and offset are baked into the merged uvs, so every sand(rx, rz)
  // variant lands in one bucket. Only materials whose map and normal map share one transform are baked.
  const texKey = (t) => t ? (t.source ? t.source.uuid : t.uuid) + "/" + t.wrapS + t.wrapT + (t.flipY ? 1 : 0) + t.colorSpace : "";
  const bakeable = (m) => { const a = m.map, b = m.normalMap; if (!a && !b) return true; if (a && a.rotation) return false; if (a && b) return a.repeat.equals(b.repeat) && a.offset.equals(b.offset); return true; };
  const sig = (m) => [m.type, m.color ? m.color.getHex() : "", texKey(m.map), texKey(m.normalMap), m.normalScale ? m.normalScale.x.toFixed(2) : "", m.emissive ? m.emissive.getHex() : "", m.emissiveIntensity || 0,
    m.roughness, m.metalness, m.side, m.transparent ? 1 : 0, m.opacity, m.vertexColors ? 1 : 0, m.alphaTest || 0, m.depthWrite ? 1 : 0, m.blending, bakeable(m) ? "b" : "u" + m.uuid].join("|");
  grp.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(grp.matrixWorld).invert();
  const buckets = new Map(), list = [];
  grp.traverse((o) => {
    if (!o.isMesh || o.isSkinnedMesh || keep.has(o) || !o.visible) return;
    for (let p = o.parent; p && p !== grp; p = p.parent) if (dynAnc.has(p)) return;
    const g = o.geometry, at = g.attributes;
    if (!at.position || !at.normal || !at.uv || Object.keys(at).length !== 3 || (g.morphAttributes && Object.keys(g.morphAttributes).length)) return;
    if (Array.isArray(o.material)) return;
    const tris = (g.index ? g.index.count : at.position.count) / 3;
    if (tris > 6000) return;   // the GLB props: shared geometry, their own draw calls
    list.push(o);
  });
  for (const o of list) {
    const rel = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    const px = rel.elements[12], pz = rel.elements[14], r = Math.hypot(px, pz), th = Math.atan2(px, pz);
    const cell = Math.floor((th + Math.PI) / (Math.PI / 6)) + "|" + (r < 40 ? 0 : r < 80 ? 1 : r < 125 ? 2 : r < 215 ? 3 : 4);
    const key = sig(o.material) + "#" + (o.geometry.index ? "i" : "n") + "#" + cell;
    let b = buckets.get(key); if (!b) { b = { mat: o.material, geos: [], meshes: [] }; buckets.set(key, b); }
    const geo = o.geometry.clone().applyMatrix4(rel);
    const t = o.material.map || o.material.normalMap;
    if (t && bakeable(o.material) && (t.repeat.x !== 1 || t.repeat.y !== 1 || t.offset.x || t.offset.y)) {
      const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * t.repeat.x + t.offset.x, uv.getY(i) * t.repeat.y + t.offset.y);
    }
    b.geos.push(geo); b.meshes.push(o);
  }
  const canon = new Map();   // one material per recipe, its textures at repeat 1
  let merged = 0, removed = 0, failed = 0;
  for (const [key, b] of buckets) {
    if (b.geos.length < 2) { b.geos.forEach((g) => g.dispose()); continue; }
    const mg = mergeGeometries(b.geos, false);
    b.geos.forEach((g) => g.dispose());
    if (!mg) { failed++; continue; }
    const recipe = key.split("#")[0];
    let cm = canon.get(recipe);
    if (!cm) {
      cm = b.mat;
      if (bakeable(b.mat) && (b.mat.map || b.mat.normalMap)) {
        cm = b.mat.clone();
        for (const k of ["map", "normalMap"]) if (cm[k]) { cm[k] = cm[k].clone(); cm[k].repeat.set(1, 1); cm[k].offset.set(0, 0); cm[k].needsUpdate = true; }
      }
      canon.set(recipe, cm);
    }
    const m = new THREE.Mesh(mg, cm); m.castShadow = m.receiveShadow = true; grp.add(m); merged++;
    for (const o of b.meshes) { if (o.parent) o.parent.remove(o); removed++; }
  }
  city.mergeStats = { merged, removed, failed, materials: canon.size };
}
