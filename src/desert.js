// update 36: THE DESERT — the south-west of the world, cut off from the forest
// by a winding river with three bridges. Rolling dunes of sand, a small oasis
// with one palm, cacti here and there, treasure chests (rarer than the
// forest's), and Idris's tent at the middle bridge — a safe place in the shade
// where the one water bottle in the game comes from.
//
// Heat: while you stand in the desert sun a THIRST bar shows under your hunger
// and drains 100 -> 0 in six minutes. Shade (the tent, the palm's crown)
// freezes it; leaving the desert hides it but keeps its value. A bottle with
// water holds thirst at 100 and empties in six desert-minutes (frozen in
// shade and outside the desert). Thirst at zero doubles your hunger drain.
//
// This module owns the geometry (river, banks, dunes, bridges), the region
// tests every other system asks (inDesert, inRiver, onBridge, duneH, shade),
// the build of every desert prop, the thirst/bottle rules, Idris, the wind,
// and the map painting. The two Alioramus live in entities.js and only ask
// this module where the desert is.
import * as THREE from "three";
import { CFG } from "./config.js";
import { STR } from "../strings.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { clone as skeletonClone } from "three/addons/utils/SkeletonUtils.js";
import { ClipAnimator } from "./skeletal.js";

const D = () => CFG.desert;

// ---------- the river: a Catmull-Rom spline through the sketch's points ----------
function splinePoints(ctrl, per = 8) {
  const out = [];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      const x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
      const z = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
      out.push([x, z]);
    }
  }
  out.push([ctrl[ctrl.length - 1][0], ctrl[ctrl.length - 1][1]]);
  return out;
}

export class Desert {
  constructor(world) {
    this.world = world;
    const C = D();
    this.pts = splinePoints(C.river.points);
    // per-segment tangents + cumulative length, for the nearest-point search
    this.seg = [];
    let acc = 0;
    for (let i = 0; i < this.pts.length - 1; i++) {
      const [ax, az] = this.pts[i], [bx, bz] = this.pts[i + 1];
      const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz) || 1e-6;
      this.seg.push({ ax, az, bx, bz, tx: dx / len, tz: dz / len, len, s0: acc });
      acc += len;
    }
    this.length = acc;
    // the three bridges: the river points nearest the sketch's dashes
    this.bridges = C.bridges.map(([bx, bz]) => {
      let best = null, bd = 1e9;
      for (const s of this.seg) {
        const d = Math.hypot(s.ax - bx, s.az - bz);
        if (d < bd) { bd = d; best = s; }
      }
      const nx = -best.tz, nz = best.tx;        // the normal that points INTO the desert
      return { x: best.ax, z: best.az, tx: best.tx, tz: best.tz, nx, nz, half: C.river.halfW + C.bridge.overhang, hw: C.bridge.halfWidth };
    });
    // Idris's tent: on the desert bank of the middle bridge
    const B = this.bridges[1];
    const T = C.tent;
    this.tent = { x: B.x + B.nx * T.fromBridge + B.tx * T.along, z: B.z + B.nz * T.fromBridge + B.tz * T.along, yaw: Math.atan2(-B.nx, -B.nz) };
    this.oasis = { x: C.oasis.x, z: C.oasis.z, r: C.oasis.r };
    this.palm = { x: C.oasis.palmX, z: C.oasis.palmZ };
    this.cacti = []; this.chests = [];
    // named places for the map / discovery — added once, before the game reads them
    if (!CFG.locations.some((l) => l.id === "tent")) {
      CFG.locations.push({ id: "tent", x: this.tent.x, z: this.tent.z, r: 12 });
      CFG.locations.push({ id: "oasis", x: this.oasis.x, z: this.oasis.z, r: 18 });
    }
  }

  // nearest point on the river: distance, the tangent there, and which side
  // (side > 0 = the desert bank, < 0 = the forest bank)
  riverInfo(x, z) {
    let best = null, bd = 1e18;
    for (const s of this.seg) {
      let t = ((x - s.ax) * s.tx + (z - s.az) * s.tz);
      t = Math.max(0, Math.min(s.len, t));
      const px = s.ax + s.tx * t, pz = s.az + s.tz * t;
      const d2 = (x - px) * (x - px) + (z - pz) * (z - pz);
      if (d2 < bd) { bd = d2; best = { s, t, px, pz }; }
    }
    const { s, px, pz } = best;
    const ox = x - px, oz = z - pz;
    const cross = s.tx * oz - s.tz * ox;
    return { d: Math.sqrt(bd), side: cross >= 0 ? 1 : -1, tx: s.tx, tz: s.tz, px, pz };
  }
  riverDist(x, z) { return this.riverInfo(x, z).d; }
  inRiver(x, z) { return this.riverInfo(x, z).d < D().river.halfW; }
  // the desert: the river's south-west bank, inside the world's edge
  inDesert(x, z) {
    const sq = CFG.world.square - 1;
    if (Math.abs(x) > sq || Math.abs(z) > sq) return false;
    const R = this.riverInfo(x, z);
    return R.side > 0 && R.d >= D().river.halfW;
  }
  // on a bridge deck: |along the river| < hw, |across| < half
  bridgeAt(x, z) {
    for (const b of this.bridges) {
      const ox = x - b.x, oz = z - b.z;
      const along = ox * b.tx + oz * b.tz, across = ox * b.nx + oz * b.nz;
      if (Math.abs(along) < b.hw && Math.abs(across) < b.half) return { b, along, across };
    }
    return null;
  }
  inOasisWater(x, z) { return Math.hypot(x - this.oasis.x, z - this.oasis.z) < this.oasis.r; }
  // update 37: the deck's height across the river — a hump, deckY at both ends, deckY + arch in the middle
  deckY(across) {
    const B = D().bridge, half = D().river.halfW + B.overhang;
    const u = across / half;
    return B.deckY + (B.arch || 0) * Math.max(0, 1 - u * u);
  }
  // shade: the tent (also a safe zone) and the palm's crown
  inTentZone(x, z) { return Math.hypot(x - this.tent.x, z - this.tent.z) < D().tent.zoneR; }
  inPalmShade(x, z) { return Math.hypot(x - this.palm.x, z - this.palm.z) < D().oasis.shadeR; }
  inShade(x, z) { return this.inTentZone(x, z) || this.inPalmShade(x, z); }

  // the dunes: rolling ridges 2-5 m high that flatten toward the water and the oasis
  duneH(x, z) {
    const C = D().dune;
    const rd = this.riverDist(x, z) - D().river.halfW;
    const fade = Math.max(0, Math.min(1, rd / C.fadeIn));
    const f = fade * fade * (3 - 2 * fade);
    const od = Math.hypot(x - this.oasis.x, z - this.oasis.z) - this.oasis.r - 4;
    const of = Math.max(0, Math.min(1, od / 24));
    const ridges =
      C.a1 * (0.5 + 0.5 * Math.sin(0.021 * x + 1.3 * Math.sin(0.009 * z + 1.1))) +
      C.a2 * (0.5 + 0.5 * Math.sin(0.017 * z + 0.9 * Math.sin(0.011 * x + 0.4))) +
      C.a3 * (0.5 + 0.5 * Math.sin(0.045 * (x + z) + 0.7 * Math.sin(0.02 * (x - z)))) +
      C.a4 * (0.5 + 0.5 * Math.sin(0.09 * x + 0.6 * Math.sin(0.05 * z + 2.0))) +
      C.a5 * (0.5 + 0.5 * Math.sin(0.14 * z + 0.05 * x + 0.5 * Math.sin(0.06 * x - 0.8)));
    return C.base + ridges * f * of * of;
  }
  // a candidate for World.groundHeight
  groundCand(x, z, cands) {
    const br = this.bridgeAt(x, z);
    if (br) { cands.push(this.deckY(br.across)); return; }   // update 37: the arch
    if (!this.inDesert(x, z)) return;
    if (this.inOasisWater(x, z)) { cands.push(D().dune.base - 0.25); return; }
    cands.push(this.duneH(x, z));
  }
  // the dune crest test the sight-hunter uses: is the straight line between two
  // heads cut by the sand in between?
  crestBlocked(ax, az, ay, bx, bz, by) {
    const n = 7;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      if (!this.inDesert(x, z)) continue;
      if (this.duneH(x, z) > ay + (by - ay) * t - 0.2) return true;
    }
    return false;
  }
  // nothing walks in the river: pushed out to the bank on its own side, unless it is on a bridge
  collide(x, z, r, y) {
    // update 37: the rails are SOLID walls along both sides of every bridge. In the
    // rail band you are pushed back to whichever side you came from, so the deck
    // can only be entered from its two ends; on the deck the river below does not count.
    const B = D().bridge;
    for (const b of this.bridges) {
      const ox = x - b.x, oz = z - b.z;
      const along = ox * b.tx + oz * b.tz, across = ox * b.nx + oz * b.nz;
      if (Math.abs(across) >= b.half + 0.2) continue;
      const a = Math.abs(along), sgn = along < 0 ? -1 : 1;
      const inner = b.hw - r - 0.05, outer = b.hw + (B.railT || 0.5) + r;
      if (a > inner && a < outer) {
        const t = a < b.hw ? inner : outer;
        x = b.x + b.tx * (sgn * t) + b.nx * across;
        z = b.z + b.tz * (sgn * t) + b.nz * across;
      }
      if (Math.abs(along) <= inner + 1e-6 && Math.abs(across) < b.half) return { x, z };
    }
    const R = this.riverInfo(x, z);
    const min = D().river.halfW + r + 0.3;
    if (R.d < min) {
      // but never off the end of a bridge: someone stepping off the deck lands on the bank
      const nx = R.side >= 0 ? -R.tz : R.tz, nz = R.side >= 0 ? R.tx : -R.tx;
      x = R.px + nx * min; z = R.pz + nz * min;
    }
    return { x, z };
  }

  // ---------- build ----------
  build(assets, scene, rng) {
    const C = D(), W = CFG.world;
    const w = this.world;
    // --- the sand: a heightfield over the south-west, hidden where the forest is
    const X0 = -W.square - 4, X1 = C.bounds.x1, Z0 = C.bounds.z0, Z1 = W.square + 4;
    const nx = Math.ceil((X1 - X0) / 4), nz = Math.ceil((Z1 - Z0) / 4);
    const geo = new THREE.PlaneGeometry(X1 - X0, Z1 - Z0, nx, nz);
    geo.rotateX(-Math.PI / 2);
    geo.translate((X0 + X1) / 2, 0, (Z0 + Z1) / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const R = this.riverInfo(x, z);
      let y;
      if (R.side > 0 && R.d >= C.river.halfW) y = this.inOasisWater(x, z) ? C.dune.base - 0.3 : this.duneH(x, z);
      else if (R.side > 0) y = C.dune.base - 0.1 - (C.river.halfW - R.d) * 0.12;   // the bank slopes into the water
      else y = -3;                                                                 // the forest side: under the grass
      pos.setY(i, y);
    }
    geo.computeVertexNormals();
    const sandMat = w.mat("t_sand", 60, 60, 0xc9a25a);
    if (sandMat.map) { sandMat.map.repeat.set((X1 - X0) / 9, (Z1 - Z0) / 9); }
    const sand = new THREE.Mesh(geo, sandMat);
    sand.receiveShadow = true;
    scene.add(sand);
    // --- the river: a dark bed, the water, a sand beach on the forest bank
    const ribbon = (inner, outer, y, mat, sideOnly = 0, uvLen = 12) => {
      const g = new THREE.BufferGeometry();
      const v = [], idx = [], uv = [];
      for (let i = 0; i < this.pts.length; i++) {
        const s = this.seg[Math.min(i, this.seg.length - 1)];
        const nx2 = -s.tz, nz2 = s.tx;   // toward the desert
        const [px, pz] = this.pts[i];
        const a = sideOnly ? sideOnly : -1, b = sideOnly ? sideOnly : 1;
        v.push(px + nx2 * inner * a, y, pz + nz2 * inner * a, px + nx2 * outer * b, y, pz + nz2 * outer * b);
        // update 37: real UVs — one tile per uvLen metres along the river, the width in the same scale
        const u = (i < this.seg.length ? s.s0 : this.length) / uvLen;
        uv.push(u, 0, u, (Math.abs(inner * a - outer * b)) / uvLen);
        // update 37: counter-clockwise seen from above — the old winding was back-facing, and a
        // double-sided material flips the normal on a back face, so the water was lit from below (black)
        if (i) { const k = (i - 1) * 2; if (sideOnly < 0) idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); else idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }   // a one-sided strip lists its pair the other way round
      }
      g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      // flat water and beds face the sky whatever the winding of the strip
      const nrm = new Float32Array(v.length); for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
      g.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
      const m = new THREE.Mesh(g, mat);
      m.material.side = THREE.FrontSide;
      scene.add(m);
      return m;
    };
    const HW = C.river.halfW;
    ribbon(HW + 0.6, HW + 0.6, C.river.bedY, new THREE.MeshStandardMaterial({ color: 0x3e5a58, roughness: 1 }));   // update 37: a paler bed shows through as turquoise
    // update 37: water that reads as water — the flowing texture, its normal map, a pale tint over the dark bed
    const waterMat = new THREE.MeshStandardMaterial({ color: 0x9fc6ce, transparent: true, opacity: 0.8, roughness: 0.08, metalness: 0.12, emissive: 0x0c2a32 });
    if (assets.tex.t_water) {
      const t = assets.tex.t_water.clone();
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 1); t.needsUpdate = true;
      waterMat.map = t; waterMat.color.setHex(0xffffff);
      this.waterTex = t;
      if (assets.texN && assets.texN.t_water) {
        const n = assets.texN.t_water.clone(); n.wrapS = n.wrapT = THREE.RepeatWrapping; n.repeat.set(1, 1); n.needsUpdate = true;
        waterMat.normalMap = n; waterMat.normalScale.set(0.7, 0.7); this.waterTexN = n;
      }
    }
    this.water = ribbon(HW, HW, C.river.waterY, waterMat, 0, 10);
    // the forest bank: a strip of river sand on the far side (the desert side IS sand) — update 37: its own texture
    const bankId = assets.tex.t_riversand ? "t_riversand" : "t_beach";
    ribbon(HW - 0.5, HW + C.river.beach, 0.03, w.mat(bankId, 1, 1, 0x9a8a68), -1, 5);
    // --- the bridges (update 37): arched plank decks that rise in the middle, solid
    // plank rails along both sides (you step on only at the ends), piers up to the deck
    const plankMat = w.mat("t_woodplank", 1, 6, 0x6e5636);
    const railMat = new THREE.MeshStandardMaterial({ color: 0x5a4630, roughness: 1 });
    const railPlank = w.mat("t_woodplank", 3, 1, 0x6e5636);
    this.bridgeMeshes = [];
    for (const b of this.bridges) {
      const g = new THREE.Group();
      const deckW = b.hw * 2, N = 16, L = b.half * 2 + 2;
      for (let i = 0; i < N; i++) {
        const z0 = -L / 2 + (L / N) * i, z1 = z0 + L / N;
        const y0 = this.deckY(z0) - 0.11, y1 = this.deckY(z1) - 0.11;
        const len = Math.hypot(z1 - z0, y1 - y0);
        const tilt = -Math.atan2(y1 - y0, z1 - z0);
        const seg = new THREE.Mesh(new THREE.BoxGeometry(deckW, 0.22, len + 0.05), plankMat);
        seg.position.set(0, (y0 + y1) / 2, (z0 + z1) / 2); seg.rotation.x = tilt;
        g.add(seg);
        for (const sgn of [-1, 1]) {
          const wall = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.05, len + 0.05), railPlank);
          wall.position.set(sgn * (b.hw - 0.07), (y0 + y1) / 2 + 0.62, (z0 + z1) / 2); wall.rotation.x = tilt;
          g.add(wall);
          if (i % 2 === 0) {
            const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.25, 0.18), railMat);
            post.position.set(sgn * (b.hw - 0.07), y0 + 0.62, z0);
            g.add(post);
          }
        }
      }
      for (const k of [-1, 0, 1]) {
        const pz = k * (L / 3.2), top = this.deckY(pz) - 0.1;
        const pier = new THREE.Mesh(new THREE.BoxGeometry(0.6, top - C.river.bedY + 0.2, 0.6), railMat);
        pier.position.set(0, (top + C.river.bedY) / 2 - 0.1, pz);
        g.add(pier);
      }
      g.position.set(b.x, 0, b.z);
      g.rotation.y = Math.atan2(b.nx, b.nz);   // the deck's long axis runs across the river
      scene.add(g);
      this.bridgeMeshes.push(g);
    }
    // --- the oasis: a small pool and one palm
    {
      const O = this.oasis;
      const bed = new THREE.Mesh(new THREE.CircleGeometry(O.r + 0.4, 36), new THREE.MeshStandardMaterial({ color: 0x3e5a58, roughness: 1 }));
      bed.rotation.x = -Math.PI / 2; bed.position.set(O.x, C.dune.base - 0.28, O.z);
      const pool = new THREE.Mesh(new THREE.CircleGeometry(O.r, 36), waterMat);
      pool.rotation.x = -Math.PI / 2; pool.position.set(O.x, C.dune.base - 0.02, O.z);
      scene.add(bed, pool);
      const pa = assets.glb.palm;
      const py = this.duneH(this.palm.x, this.palm.z);
      if (pa) {
        const m = pa.model.clone();
        m.position.set(this.palm.x, py - 0.05, this.palm.z);
        m.rotation.y = rng() * Math.PI * 2;
        scene.add(m);
      } else {
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.4, 7, 8), new THREE.MeshStandardMaterial({ color: 0x6e5636, roughness: 1 }));
        trunk.position.set(this.palm.x, py + 3.5, this.palm.z);
        const crown = new THREE.Mesh(new THREE.SphereGeometry(3.2, 10, 8), new THREE.MeshStandardMaterial({ color: 0x4d6a34, roughness: 1 }));
        crown.position.set(this.palm.x, py + 7.4, this.palm.z); crown.scale.y = 0.45;
        scene.add(trunk, crown);
      }
      w.addTree(this.palm.x, this.palm.z, 0.5);   // a trunk to walk round — and to cut branches from
      w.occluders.push({ x: this.palm.x, z: this.palm.z, r: 0.6 });
      w.palmTree = { x: this.palm.x, z: this.palm.z };
      // update 37: the palm's shadow on the sand — exactly the circle where thirst freezes
      {
        const cnv = document.createElement("canvas"); cnv.width = cnv.height = 256;
        const cx2 = cnv.getContext("2d");
        const grd = cx2.createRadialGradient(128, 128, 16, 128, 128, 126);
        grd.addColorStop(0, "rgba(0,0,0,0.6)"); grd.addColorStop(0.72, "rgba(0,0,0,0.5)"); grd.addColorStop(1, "rgba(0,0,0,0)");
        cx2.fillStyle = grd; cx2.beginPath(); cx2.arc(128, 128, 126, 0, Math.PI * 2); cx2.fill();
        cx2.fillStyle = "rgba(0,0,0,0.5)";
        for (let i = 0; i < 11; i++) {
          cx2.save(); cx2.translate(128, 128); cx2.rotate(i / 11 * Math.PI * 2 + 0.3);
          cx2.beginPath(); cx2.ellipse(72, 0, 56, 12, 0, 0, Math.PI * 2); cx2.fill(); cx2.restore();
        }
        const st = new THREE.CanvasTexture(cnv);
        const sh = new THREE.Mesh(new THREE.PlaneGeometry(C.oasis.shadeR * 2.2, C.oasis.shadeR * 2.2),
          new THREE.MeshBasicMaterial({ map: st, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
        sh.rotation.x = -Math.PI / 2;
        sh.position.set(this.palm.x, py + 0.08, this.palm.z);
        scene.add(sh);
      }
    }
    // --- cacti: seeded, spread out, clear of the river, the oasis and the tent
    {
      const ca = assets.glb.cactus;
      let guard = 0;
      while (this.cacti.length < C.cactusCount && guard++ < 40000) {
        const x = X0 + 10 + rng() * (X1 - X0 - 20), z = Z0 + 10 + rng() * (Z1 - Z0 - 20);
        if (!this.inDesert(x, z) || this.riverDist(x, z) < 30) continue;
        if (Math.hypot(x - this.oasis.x, z - this.oasis.z) < 26) continue;
        if (Math.hypot(x - this.tent.x, z - this.tent.z) < 22) continue;
        if (this.cacti.some((q) => Math.hypot(q.x - x, q.z - z) < C.cactusSpacing)) continue;
        const y = this.duneH(x, z);
        let mesh;
        if (ca) { mesh = ca.model.clone(); }
        else {
          mesh = new THREE.Group();
          const m = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 3.6, 8), new THREE.MeshStandardMaterial({ color: 0x5f7a45, roughness: 1 }));
          m.position.y = 1.8; mesh.add(m);
        }
        mesh.position.set(x, y - 0.05, z);
        mesh.rotation.y = rng() * Math.PI * 2;
        scene.add(mesh);
        w.addTree(x, z, 0.45);                       // solid, like a trunk
        w.occluders.push({ x, z, r: 0.9 });          // and it hides you from the sight-hunter
        this.cacti.push({ x, z, y, mesh });
      }
    }
    // --- Idris's tent, his bedroll and the man himself
    {
      const T = this.tent, ta = assets.glb.tent;
      const ty = this.duneH(T.x, T.z);
      if (ta) {
        const m = ta.model.clone();
        m.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color = new THREE.Color(0xc8b48a); } });
        m.position.set(T.x, ty + 0.02, T.z);
        m.rotation.y = T.yaw + Math.PI / 2;
        scene.add(m);
      } else {
        const m = new THREE.Mesh(new THREE.ConeGeometry(1.4, 1.7, 4), new THREE.MeshStandardMaterial({ color: 0xc8b48a, roughness: 1 }));
        m.position.set(T.x, ty + 0.85, T.z); scene.add(m);
      }
      // the bedroll lies inside; the man stands by the flap, facing the bridge
      const fx = Math.sin(T.yaw), fz = Math.cos(T.yaw);
      const ba = assets.glb.bedroll;
      const bx = T.x - fx * 0.2, bz = T.z - fz * 0.2;
      if (ba) { const m = ba.model.clone(); m.position.set(bx, ty + 0.02, bz); m.rotation.y = T.yaw; scene.add(m); }
      this.bed = { x: bx, z: bz, y: ty };
      const nx2 = T.x + fx * 2.2 + fz * 1.4, nz2 = T.z + fz * 2.2 - fx * 1.4;
      const na = assets.glb.nomad;
      if (na) {
        const m = na.anims && na.anims.length ? skeletonClone(na.model) : na.model.clone();
        m.position.set(nx2, this.duneH(nx2, nz2), nz2);
        m.rotation.y = T.yaw;
        if (na.anims && na.anims.length) m.userData.anim = new ClipAnimator(m, na.anims);
        scene.add(m);
        this.nomad = m;
      } else {
        const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 1.1, 4, 8), new THREE.MeshStandardMaterial({ color: 0xb09a70, roughness: 1 }));
        m.position.set(nx2, this.duneH(nx2, nz2) + 0.85, nz2); scene.add(m); this.nomad = m;
      }
      this.nomadPos = { x: nx2, z: nz2 };
    }
    // --- treasure chests: rarer than the forest's, same loot rules (world.buildChests reads them)
    {
      let guard = 0;
      const spots = [];
      // update 37: the first eight anywhere the old desert was, six more only in the part the map grew
      const oldSq = CFG.world.square / 1.2;
      while (spots.length < C.chestCount + (C.chestCountNew || 0) && guard++ < 80000) {
        const x = X0 + 12 + rng() * (X1 - X0 - 24), z = Z0 + 12 + rng() * (Z1 - Z0 - 24);
        const outer = Math.abs(x) > oldSq || Math.abs(z) > oldSq;
        if (spots.length < C.chestCount ? outer : !outer) continue;
        if (!this.inDesert(x, z) || this.riverDist(x, z) < 26) continue;
        if (Math.hypot(x - this.oasis.x, z - this.oasis.z) < 22) continue;
        if (Math.hypot(x - this.tent.x, z - this.tent.z) < 18) continue;
        if (spots.some(([qx, qz]) => Math.hypot(qx - x, qz - z) < C.chestSpacing)) continue;
        if (this.cacti.some((q) => Math.hypot(q.x - x, q.z - z) < 6)) continue;
        spots.push([x, z]);
      }
      this.chestSpots = spots.map(([x, z]) => [x, z, false, this.duneH(x, z)]);
    }
  }
  // where the hunters are born: remotus within the river band, altai deeper in
  spawnsFor(kind, count, rng) {
    const C = CFG[kind], W = CFG.world, out = [];
    let guard = 0;
    while (out.length < count && guard++ < 40000) {
      const x = -W.square + 20 + rng() * (D().bounds.x1 + W.square - 40), z = D().bounds.z0 + 10 + rng() * (W.square - D().bounds.z0 - 20);
      if (!this.inDesert(x, z)) continue;
      const rd = this.riverDist(x, z);
      if (kind === "remotus" ? (rd < 28 || rd > C.riverBand) : rd < C.riverMin) continue;
      if (Math.hypot(x - this.tent.x, z - this.tent.z) < 45) continue;
      if (Math.hypot(x - this.oasis.x, z - this.oasis.z) < 30) continue;
      if (out.some(([qx, qz]) => Math.hypot(qx - x, qz - z) < 40)) continue;
      out.push([x, z]);
    }
    return out;
  }
  // the desert's animated water shares the lake's scroll
  tick(t) { if (this.waterTex) { this.waterTex.offset.x = (t * 0.03) % 1; this.waterTex.offset.y = (t * 0.008) % 1; if (this.waterTexN) this.waterTexN.offset.copy(this.waterTex.offset); } }
}

// ---------- the living part: thirst, the bottle, Idris, the wind ----------
export class DesertSystem {
  constructor(game) {
    this.g = game;
    this.bottle = { water: 0 };        // seconds of water in the one canteen
    this.warned = false;
    this.wind = 0;
    this.inDesert = false;
    this.shade = false;
  }
  get d() { return this.g.world.desert; }
  update(dt) {
    const g = this.g, p = g.player, w = g.world, des = this.d, C = D();
    if (!des) return;
    des.tick(g.time);
    const inD = des.inDesert(p.pos.x, p.pos.z) && !des.bridgeAt(p.pos.x, p.pos.z);
    const shade = inD && des.inShade(p.pos.x, p.pos.z);
    this.inDesert = inD; this.shade = shade;
    const sun = inD && !shade;
    const has = p.inv.has("water_bottle");
    if (!has) this.bottle.water = 0;
    if (sun) {
      if (has && this.bottle.water > 0) {
        this.bottle.water = Math.max(0, this.bottle.water - dt);
        p.th = Math.min(100, p.th + C.thirst.drinkRate * dt);
      } else {
        p.th = Math.max(0, p.th - (100 / C.thirst.drainTime) * dt);
      }
    }
    p.thirstZero = inD && p.th <= 0;
    // the bar lives only in the desert
    g.ui.thirst(inD ? p.th : null);
    if (inD && p.th < 25 && !this.warned) { this.warned = true; g.ui.toast(STR.thirstWarn); g.audio.sDeny(); }
    if (p.th > 40) this.warned = false;
    // wind: while you are in the desert sun the air moves
    const wantWind = inD ? (shade ? 0.35 : 1) : 0;
    this.wind += (wantWind - this.wind) * Math.min(1, dt * 0.8);
    g.audio.windMix(this.wind);
    // Idris idles by his tent
    if (des.nomad && des.nomad.userData.anim) des.nomad.userData.anim.drive("idle", 0, 0, dt);
    // the drop tint of the bottle's hotbar hint follows its water
  }
  // the hotbar line for the bottle
  bottleHint() {
    const s = Math.ceil(this.bottle.water);
    if (s <= 0) return STR.bottleEmpty;
    const m = Math.floor(s / 60), r = s % 60;
    return STR.bottleFull.replace("%t", `${m}:${r < 10 ? "0" : ""}${r}`);
  }
  fill() {
    const g = this.g;
    if (!g.player.inv.has("water_bottle")) { g.ui.toast(STR.noBottle); g.audio.sDeny(); return false; }
    this.bottle.water = D().thirst.bottleTime;
    g.audio.sDrink();
    g.ui.toast(STR.bottleFilled);
    g.ui.renderHotbar(g.player.inv);
    return true;
  }
  // a knife swing at a cactus: water for the bottle — or spines in your hand
  cutCactus(c) {
    const g = this.g, p = g.player;
    if (!p.inv.has("water_bottle")) { g.ui.toast(STR.noBottle); g.audio.sDeny(); return; }
    if (g.rng() < D().cactusFailChance) {
      p.damage(D().cactusDmg, "cactus", { x: c.x, z: c.z });
      g.ui.toast(STR.cactusHurt);
      return;
    }
    this.bottle.water = D().thirst.bottleTime;
    g.audio.sDrink();
    g.ui.toast(STR.cactusWater);
    g.ui.renderHotbar(p.inv);
  }
  // near enough to a water source to fill the bottle?
  waterSource(x, z) {
    const w = this.g.world, des = this.d;
    if (!des) return null;
    const R = des.riverInfo(x, z);
    if (R.d > D().river.halfW - 1 && R.d < D().river.halfW + 4 && !des.bridgeAt(x, z)) return { x: R.px, z: R.pz, name: "river" };
    const od = Math.hypot(x - des.oasis.x, z - des.oasis.z);
    if (od > des.oasis.r - 1 && od < des.oasis.r + 3.5) {
      const a = Math.atan2(z - des.oasis.z, x - des.oasis.x);
      return { x: des.oasis.x + Math.cos(a) * des.oasis.r, z: des.oasis.z + Math.sin(a) * des.oasis.r, name: "oasis" };
    }
    if (w.nearShore(x, z)) return { x, z, name: "lake" };
    for (const t of w.farmTaps || []) if (Math.hypot(t.x - x, t.z - z) < 2.2) return { x: t.x, z: t.z, y: t.y + 0.9, name: "tap" };
    const F = CFG.farm.fountain;
    if (Math.hypot(F.x - x, F.z - z) < F.r + 1.6) return { x: F.x, z: F.z, name: "fountain" };
    return null;
  }
  interact(consider, p) {
    const g = this.g, des = this.d;
    if (!des) return;
    if (p.inv.has("water_bottle")) {
      const src = this.waterSource(p.pos.x, p.pos.z);
      if (src) consider(src.x, src.z, src.y ?? p.pos.y, `${STR.fillBottle} [${STR.interact}]`, () => this.fill());
    }
    if (des.nomadPos && Math.hypot(des.nomadPos.x - p.pos.x, des.nomadPos.z - p.pos.z) < 4) {
      consider(des.nomadPos.x, des.nomadPos.z, p.pos.y, `${STR.talkToIdris} [${STR.interact}]`, () => this.openIdris());
    }
    if (des.bed && Math.hypot(des.bed.x - p.pos.x, des.bed.z - p.pos.z) < 3) {
      consider(des.bed.x, des.bed.z, des.bed.y, `${STR.sleep} [${STR.interact}]`, () => g.trySleep());
    }
  }
  openIdris() {
    const g = this.g, p = g.player;
    const has = p.inv.has("water_bottle");
    const lines = this.met ? (has ? STR.idrisAgain : STR.idrisLost) : STR.idrisFirst;
    const btns = has ? [["idrisBye", STR.idrisBye]] : [["idrisTake", STR.idrisTake]];
    const s = g.npcPanel(STR.idrisTitle, lines, btns);
    this.met = true;
    const closeIt = () => { g.ui.closeScreen(); g.resume(); };
    if (has) s.querySelector("#idrisBye").addEventListener("click", closeIt);
    else s.querySelector("#idrisTake").addEventListener("click", () => {
      if (!p.inv.add("water_bottle", 1)) g.spawnDrop("water_bottle", 1, p.pos.x, p.pos.z, g.world.groundHeight(p.pos.x, p.pos.z, p.pos.y));
      this.bottle.water = 0;
      g.audio.sPickup();
      g.ui.renderHotbar(p.inv);
      g.ui.toast(STR.bottleGot);
      closeIt();
    });
  }
  // death: the canteen is lost for good — Idris has another
  onPlayerDeath() { this.bottle.water = 0; }

  // ---------- the map ----------
  paint(c, tx, ty, s, mini) {
    const des = this.d, W = CFG.world;
    if (!des) return;
    // the desert: everything on the river's south-west side, out to the corner
    const pts = des.pts;
    c.save();
    c.beginPath();
    c.rect(tx(-W.square), ty(-W.square), 2 * W.square * s, 2 * W.square * s);
    c.clip();
    c.beginPath();
    c.moveTo(tx(pts[0][0]), ty(pts[0][1]));
    for (let i = 1; i < pts.length; i++) c.lineTo(tx(pts[i][0]), ty(pts[i][1]));
    c.lineTo(tx(-W.square - 40), ty(W.square + 40));
    c.closePath();
    c.fillStyle = mini ? "rgba(205,168,96,.75)" : "#cfa95f";
    c.fill();
    // dune shading on the full map
    if (!mini) {
      c.strokeStyle = "rgba(120,88,40,.35)"; c.lineWidth = 1;
      for (let k = 0; k < 40; k++) {
        const x = -W.square + 20 + ((k * 137) % (W.square - 40)), z = 320 + ((k * 89) % (W.square - 340));
        if (!des.inDesert(x, z) || des.riverDist(x, z) < 30) continue;
        c.beginPath(); c.moveTo(tx(x - 14), ty(z + 3)); c.quadraticCurveTo(tx(x), ty(z - 4), tx(x + 14), ty(z + 3)); c.stroke();
      }
    }
    // the river
    c.strokeStyle = mini ? "rgba(120,160,168,.9)" : "#6f9aa3";
    c.lineWidth = Math.max(2, D().river.halfW * 2 * s);
    c.lineCap = "round"; c.lineJoin = "round";
    c.beginPath();
    c.moveTo(tx(pts[0][0]), ty(pts[0][1]));
    for (let i = 1; i < pts.length; i++) c.lineTo(tx(pts[i][0]), ty(pts[i][1]));
    c.stroke();
    // the bridges: short brown bars across it
    c.strokeStyle = "#7a5a34"; c.lineWidth = Math.max(2, 4 * s); c.lineCap = "butt";
    for (const b of des.bridges) {
      c.beginPath();
      c.moveTo(tx(b.x - b.nx * b.half), ty(b.z - b.nz * b.half));
      c.lineTo(tx(b.x + b.nx * b.half), ty(b.z + b.nz * b.half));
      c.stroke();
    }
    // the oasis
    c.beginPath(); c.arc(tx(des.oasis.x), ty(des.oasis.z), Math.max(2, des.oasis.r * s), 0, Math.PI * 2);
    c.fillStyle = mini ? "rgba(120,160,168,.9)" : "#6f9aa3"; c.fill();
    c.restore();
  }
  // glyphs once found
  paintGlyphs(c, tx, ty, s, disc) {
    const des = this.d;
    if (!des) return;
    if (disc.has("tent")) {
      const T = des.tent;
      c.beginPath(); c.moveTo(tx(T.x) - 6, ty(T.z) + 4); c.lineTo(tx(T.x), ty(T.z) - 6); c.lineTo(tx(T.x) + 6, ty(T.z) + 4);
      c.closePath(); c.fillStyle = "#c8b48a"; c.fill(); c.strokeStyle = "#5a4630"; c.lineWidth = 1; c.stroke();
    }
    if (disc.has("oasis")) {
      const P = des.palm;
      c.beginPath(); c.moveTo(tx(P.x), ty(P.z) + 2); c.lineTo(tx(P.x), ty(P.z) - 7); c.strokeStyle = "#5a4630"; c.lineWidth = 1.2; c.stroke();
      c.beginPath(); c.arc(tx(P.x), ty(P.z) - 7, 4, 0, Math.PI * 2); c.fillStyle = "#4d6a34"; c.fill();
    }
  }
}
