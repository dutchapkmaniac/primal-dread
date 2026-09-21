import * as THREE from "three";
import { CFG } from "./config.js";
import { STR } from "../strings.js";
import { Creature } from "./entities.js";

// ============================================================================
// update 39: ETERNIUS CITY — the golden city of the Eternials in the south-west
// corner of the desert. A mountain with a castle at its foot and a lake with a
// bridge in front of it; behind the castle's courtyard a gate leads into the
// mountain, to a cavern city under a shaft of daylight: the market, the altar,
// an inn, the throne hall, the keeper of tales, the vault, and the river below.
//
// Everything is laid out in a LOCAL frame: `a` runs from the mountain's heart
// toward the north-east (the castle side), `b` runs to the north-west. The
// cavern is polar: r from the heart, θ = atan2(b, a) (0 = the entry side,
// +90° = north-west (the upper terrace), -90° = south-east (the lower gallery)).
// Local three.js coordinates inside `this.grp`: x = b, z = a.
// ============================================================================
const E = () => CFG.eternius;
const D2R = Math.PI / 180;

export function cityLocal(x, z) {
  const C = E(), dx = x - C.cx, dz = z - C.cz;
  return { a: dx * C.ux + dz * C.uz, b: dx * C.vx + dz * C.vz };
}
export function cityWorld(a, b) {
  const C = E();
  return [C.cx + a * C.ux + b * C.vx, C.cz + a * C.uz + b * C.vz];
}
// the dunes go flat around the city (the castle stands on level sand)
export function cityFlatten(x, z) {
  const C = E();
  const [px, pz] = cityWorld(C.flatA, 0);
  const d = Math.hypot(x - px, z - pz), r = Math.hypot(x - C.cx, z - C.cz);
  const cf = Math.max(0, Math.min(1, (d - C.flatR) / 50));
  const cm = Math.max(0, Math.min(1, (r - C.mountainR - 10) / 25));
  return Math.min(cf, cm);
}
// the lake in front of the castle: a bowl in the sand
export function cityLakeDip(x, z) {
  const C = E(), [lx, lz] = cityWorld(C.lake.a, 0);
  const r = Math.hypot(x - lx, z - lz) / C.lake.r;
  return r < 1 ? C.lake.depth * (1 - r * r) : 0;
}

const smooth = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

export class EterniusCity {
  constructor(game) {
    this.g = game;
    this.coins = 0;
    this.prayedDay = -1;
    this.tasksDone = 0; this.task = null; this.keyGiven = false; this.vaultOpen = false;
    this.chapter = 0; this.keeperReady = true;
    this.npcs = []; this.stalls = []; this.lights = []; this.flags = []; this.lanterns = [];
    this.walls = []; this.t = 0;
    this.rex = null; this.chainMesh = null;
    this.discoveredToast = false;
  }

  // ---------------- geometry queries ----------------
  polar(x, z) {
    const { a, b } = cityLocal(x, z);
    return { a, b, r: Math.hypot(a, b), th: Math.atan2(b, a) / D2R };
  }
  mountainH(x, z) {
    const C = E(), r = Math.hypot(x - C.cx, z - C.cz), R = C.mountainR;
    if (r >= R) return 0;
    if (r > R - C.cliffW) return C.cliffH * (R - r) / C.cliffW;   // a sheer foot: nothing walks up
    const t = smooth((R - C.cliffW - r) / (R - C.cliffW - C.peakR));
    const crag = 4 * Math.sin(0.05 * (x - C.cx)) * Math.sin(0.043 * (z - C.cz) + 1.3);
    return C.cliffH + (C.peakH - C.cliffH) * t + crag * (1 - t) * t * 4;
  }
  // inside the mountain (cavern, tunnel, the carved halls)?
  inMountainRooms(a, b, r) {
    const C = E();
    if (r < C.wallR + 0.5) return true;
    if (a > C.tunnel.a0 - 1 && a < C.tunnel.a1 + 1 && Math.abs(b) < C.tunnel.hw + 0.5) return true;
    const T = C.throne; if (a > T.a0 - 1 && a < T.a1 + 1 && Math.abs(b) < T.hw + 1) return true;
    const V = C.vault; if (Math.abs(a) < V.hw + 1 && b < -V.b0 + 1 && b > -V.b1 - 1) return true;
    return false;
  }
  // the floor under (x, z), or null outside the city's built ground. `y` gates the
  // rooms under the mountain: someone on the rock above must not fall through.
  floorH(x, z, y = 0) {
    const C = E(), L = C.levels, P = this.polar(x, z), { a, b, r, th } = P;
    if (r < C.mountainR + 2 || (a > C.tunnel.a0 && a < C.tunnel.a1 + 1)) {
      if (this.inMountainRooms(a, b, r) && (y < 24 || y > 900)) return this.roomH(a, b, r, th);
    }
    // the castle's courtyard plinth, the gate sill, the bridge over the lake
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
  roomH(a, b, r, th) {
    const C = E(), L = C.levels;
    const T = C.throne; if (a > T.a0 - 1 && a < T.a1 + 1 && Math.abs(b) < T.hw + 1) return L.terrace;
    const V = C.vault; if (Math.abs(a) < V.hw + 1 && b < -V.b0 + 1 && b > -V.b1 - 1) return L.lower;
    if (a > C.tunnel.a0 - 1) return L.court;                                   // the tunnel and the gate
    if (r >= C.terraceR && Math.abs(th) < C.entryTh) return L.court;           // the entry terrace, wall to wall
    if (a > C.entryA) return L.court;
    if (a > C.entryRampA) return L.plaza + (L.court - L.plaza) * (a - C.entryRampA) / (C.entryA - C.entryRampA);
    // the two ramps: up to the north-west terrace, down to the south-east gallery
    if (Math.abs(a) < C.ramp.hw) {
      if (b > C.ramp.r0 && b <= C.ramp.r1) return L.plaza + (L.terrace - L.plaza) * (b - C.ramp.r0) / (C.ramp.r1 - C.ramp.r0);
      if (-b > C.ramp.r0 && -b <= C.ramp.r1) return L.plaza + (L.lower - L.plaza) * (-b - C.ramp.r0) / (C.ramp.r1 - C.ramp.r0);
    }
    if (r >= C.terraceR) {
      if (b >= 0) return L.terrace;
      // the lower gallery, the river through it, the bridge over the river
      if (r > C.riverR0 && r < C.riverR1 && Math.abs(a) > C.riverBridgeHw) return L.riverBed;
      return L.lower;
    }
    if (r < C.altar.r) return L.dais;
    if (r < C.altar.r + 3) return L.plaza + (L.dais - L.plaza) * (C.altar.r + 3 - r) / 3;
    return L.plaza;
  }
  inside(x, z, y = 0) {
    const P = this.polar(x, z), C = E();
    if (this.inMountainRooms(P.a, P.b, P.r) && y < 24) return true;
    const K = C.castle;
    return P.a >= K.a0 && P.a <= K.a1 && Math.abs(P.b) < K.hw;
  }
  // a safe zone — except within the chained beast's reach
  isSafe(x, z, y) {
    if (!this.inside(x, z, y)) return false;
    if (this.rex && Math.hypot(x - this.rex.chain.x, z - this.rex.chain.z) < this.rex.chain.r + 3) return false;
    return true;
  }
  // ---------------- collision ----------------
  collide(x, z, r, y) {
    const C = E(), P = this.polar(x, z);
    let { a, b } = P;
    const rr = Math.hypot(a, b), th = Math.atan2(b, a) / D2R;
    let moved = false;
    // straight walls (local segments)
    for (const w of this.walls) {
      if (w.off) continue;
      const ex = w.a1 - w.a0, ez = w.b1 - w.b0, L2 = ex * ex + ez * ez || 1e-6;
      let t = ((a - w.a0) * ex + (b - w.b0) * ez) / L2; t = Math.max(0, Math.min(1, t));
      const px = w.a0 + ex * t, pz = w.b0 + ez * t;
      const dx = a - px, dz = b - pz, d = Math.hypot(dx, dz), need = r + (w.t || 0.4);
      if (d < need) { const k = d > 1e-6 ? need / d : 1; a = px + (d > 1e-6 ? dx * k : need); b = pz + (d > 1e-6 ? dz * k : 0); moved = true; }
    }
    if (y < 24 || y > 900) {
      // the cavern wall: stay inside (the vault door at -90°, the throne door at 180°)
      const inVaultDoor = Math.abs(a) < C.vault.doorHw + r && b < -C.wallR + 6 && b > -C.wallR - 6;
      const inThroneDoor = Math.abs(b) < C.throne.doorHw + r && a < -C.wallR + 6 && a > -C.wallR - 6;
      const inTunnel = a > C.tunnel.a0 - 4 && Math.abs(b) < C.tunnel.hw + r;
      if (rr > C.wallR - r && rr < C.wallR + 8 && !inVaultDoor && !inThroneDoor && !inTunnel) {
        const k = (C.wallR - r) / rr; a *= k; b *= k; moved = true;
      }
      // the terrace edges: a rail along r = terraceR, gaps at the ramps and the entry
      const ra = Math.hypot(a, b), tha = Math.atan2(b, a) / D2R;
      if (Math.abs(ra - C.terraceR) < r + 0.3 && Math.abs(tha) > C.entryTh && Math.abs(Math.abs(tha) - 90) > 4.5) {
        const side = ra < C.terraceR ? C.terraceR - r - 0.3 : C.terraceR + r + 0.3;
        const k = side / ra; a *= k; b *= k; moved = true;
      }
      // the river: banks, not water — unless on the bridge
      const rb = Math.hypot(a, b);
      if (b < 0 && Math.abs(Math.atan2(b, a) / D2R) > C.entryTh && rb > C.riverR0 - r && rb < C.riverR1 + r && Math.abs(a) > C.riverBridgeHw - 0.2) {
        const mid = (C.riverR0 + C.riverR1) / 2;
        const side = rb < mid ? C.riverR0 - r : C.riverR1 + r;
        const k = side / rb; a *= k; b *= k; moved = true;
      }
    }
    // the lake: no wading — the bridge crosses it
    {
      const LK = C.lake, da = a - LK.a, dl = Math.hypot(da, b);
      const onBridge = Math.abs(b) < C.bridge.hw + 0.2 && a > C.bridge.a0 - 1 && a < C.bridge.a1 + 1;
      if (dl < LK.r + r && !onBridge) { const k = (LK.r + r) / (dl || 1e-6); a = LK.a + da * k; b = b * k; moved = true; }
      if (onBridge && a > C.bridge.a0 + 2 && a < C.bridge.a1 - 2 && Math.abs(b) > C.bridge.hw - r) b = Math.sign(b || 1) * (C.bridge.hw - r), moved = true;
    }
    if (!moved) return { x, z };
    const [wx, wz] = cityWorld(a, b);
    return { x: wx, z: wz };
  }

  // ---------------- build ----------------
  build() {
    const g = this.g, w = g.world, A = g.assets, scene = g.scene, C = E(), L = C.levels;
    const grp = new THREE.Group();
    grp.position.set(C.cx, 0, C.cz); grp.rotation.y = C.grpYaw;
    scene.add(grp); this.grp = grp;
    // the interior is lit by lanterns and the shaft: the stone glows a little on its own, or the cavern reads black
    const sand = (rx, rz) => { const m = w.mat("t_sandstone", rx, rz, 0xc8a870); m.emissive = new THREE.Color(0x4a3c26); m.emissiveIntensity = 0.42; return m; };
    const rock = (rx, rz) => { const m = w.mat("t_cavern", rx, rz, 0x6b5238); m.emissive = new THREE.Color(0x3a2c1c); m.emissiveIntensity = 0.5; return m; };
    const goldM = () => { const m = w.mat("t_goldpanel", 2, 2, 0xd4a72c); m.metalness = 0.55; m.roughness = 0.35; m.emissive = new THREE.Color(0x4a3608); m.emissiveIntensity = 0.35; return m; };
    const gold = goldM();
    const goldPlain = new THREE.MeshStandardMaterial({ color: 0xd9ad2e, metalness: 0.6, roughness: 0.3, emissive: 0x3a2a06 });
    const gem = new THREE.MeshStandardMaterial({ color: 0x2fdc5a, emissive: 0x1fbf46, emissiveIntensity: 1.4, roughness: 0.2 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2b2620, roughness: 0.9 });
    this.mats = { sand, rock, gold, goldPlain, gem, dark };
    const box = (wd, h, d, x, y, z, m, ry = 0) => { const mm = new THREE.Mesh(new THREE.BoxGeometry(wd, h, d), m); mm.position.set(x, y, z); mm.rotation.y = ry; mm.castShadow = mm.receiveShadow = true; grp.add(mm); return mm; };
    // a flat ring sector in the local xz plane (θ from +z toward +x)
    const sector = (r0, r1, th0, th1, y, m, segs = 40) => {
      const geo = new THREE.RingGeometry(Math.max(0.01, r0), r1, segs, 1, (90 - th1) * D2R, (th1 - th0) * D2R);
      geo.rotateX(Math.PI / 2);
      const mm = new THREE.Mesh(geo, m.clone()); mm.material.side = THREE.DoubleSide; mm.position.y = y; mm.receiveShadow = true; grp.add(mm); return mm;
    };
    const cyl = (r, th0, th1, y0, y1, m, inside = false, segs = 48) => {
      const geo = new THREE.CylinderGeometry(r, r, y1 - y0, segs, 1, true, th0 * D2R, (th1 - th0) * D2R);
      const mm = new THREE.Mesh(geo, m); mm.material = m; mm.position.y = (y0 + y1) / 2; grp.add(mm);
      if (inside) mm.material = m.clone(), mm.material.side = THREE.BackSide;
      return mm;
    };
    // NOTE on RingGeometry: its θ runs from +x toward +y; after rotateX(-90°) that is +x toward -z.
    // Our polar θ runs from +z toward +x, so a sector [th0, th1] is passed as [90 - th1, 90 - th0]. cyl()
    // (CylinderGeometry) already counts from +z toward +x, exactly our θ.
    const wallSeg = (a0, b0, a1, b1, t = 0.4) => this.walls.push({ a0, b0, a1, b1, t });

    // ===== the MOUNTAIN: a craggy heightfield around the heart (the rooms are cut out below) =====
    {
      const R = C.mountainR, NR = 44, NT = 96;
      const pos = [], uv = [], idx = [];
      for (let i = 0; i <= NR; i++) {
        const r = R * Math.pow(i / NR, 0.8);
        for (let j = 0; j <= NT; j++) {
          const th = (j / NT) * Math.PI * 2;
          const lx = r * Math.sin(th), lz = r * Math.cos(th);
          const [wx, wz] = cityWorld(lz, lx);
          let h = this.mountainH(wx, wz);
          if (i === 0) h = C.peakH;
          pos.push(lx, h, lz); uv.push(lx / 18, lz / 18);
        }
      }
      for (let i = 0; i < NR; i++) for (let j = 0; j < NT; j++) {
        const p0 = i * (NT + 1) + j, p1 = p0 + 1, p2 = p0 + NT + 1, p3 = p2 + 1;
        idx.push(p0, p2, p1, p1, p2, p3);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx); geo.computeVertexNormals();
      const m = rock(1, 1); const mesh = new THREE.Mesh(geo, m); mesh.receiveShadow = true; grp.add(mesh);
      // the light shaft's mouth on the peak: a dark ring
      const mouth = new THREE.Mesh(new THREE.RingGeometry(C.shaftR, C.shaftR + 6, 32), dark); mouth.rotation.x = -Math.PI / 2; mouth.position.y = C.peakH + 0.3; grp.add(mouth);
    }

    // ===== the CASTLE: courtyard plinth, walls, gate towers, spires and domes =====
    {
      const K = C.castle, GT = C.gate, y0 = L.court, H = K.wallH, T = 2;
      box(K.hw * 2 + 6, 2.4, K.a1 - K.a0 + 6, 0, y0 - 1.2, (K.a0 + K.a1) / 2, sand(12, 8));      // the plinth
      const floor = box(K.hw * 2, 0.2, K.a1 - K.a0, 0, y0 - 0.1, (K.a0 + K.a1) / 2, sand(10, 6));
      floor.receiveShadow = true;
      // front wall (the gate at |b| < GT.hw) and the back wall (the mountain gate)
      for (const az of [K.a1, K.a0]) {
        for (const s of [-1, 1]) {
          const bw = K.hw - GT.hw, bc = s * (GT.hw + bw / 2);
          box(bw, H, T, bc, y0 + H / 2, az, sand(bw / 4, H / 4));
          box(bw, 0.6, T + 0.4, bc, y0 + H + 0.3, az, gold);   // gold coping
        }
        box(GT.hw * 2 + 1, H - GT.h, T, 0, y0 + GT.h + (H - GT.h) / 2, az, sand(3, 2));   // the lintel over the gate
        box(GT.hw * 2 + 1.4, 0.8, T + 0.5, 0, y0 + GT.h + 0.4, az, gold);
        for (const s of [-1, 1]) { box(0.9, GT.h, T + 0.6, s * (GT.hw + 0.45), y0 + GT.h / 2, az, goldPlain); }
        const g1 = new THREE.Mesh(new THREE.OctahedronGeometry(0.7), gem); g1.position.set(0, y0 + GT.h + 2.2, az + (az === K.a1 ? T / 2 + 0.4 : -T / 2 - 0.4)); grp.add(g1);
        wallSeg(az, -K.hw, az, -GT.hw, T / 2 + 0.3); wallSeg(az, GT.hw, az, K.hw, T / 2 + 0.3);
      }
      // side walls
      for (const s of [-1, 1]) {
        box(T, H, K.a1 - K.a0, s * K.hw, y0 + H / 2, (K.a0 + K.a1) / 2, sand(3, 10));
        box(T + 0.4, 0.6, K.a1 - K.a0, s * K.hw, y0 + H + 0.3, (K.a0 + K.a1) / 2, gold);
        wallSeg(K.a0, s * K.hw, K.a1, s * K.hw, T / 2 + 0.3);
        // three spires along each side wall
        for (let i = 0; i < 3; i++) {
          const az = K.a0 + 8 + i * ((K.a1 - K.a0 - 16) / 2);
          box(4, 6, 4, s * K.hw, y0 + H + 3, az, sand(1, 1));
          const cone = new THREE.Mesh(new THREE.ConeGeometry(2.6, 11, 8), gold); cone.position.set(s * K.hw, y0 + H + 6 + 5.5, az); grp.add(cone);
        }
      }
      // gate towers (front and back) and the four corner domes
      for (const az of [K.a1, K.a0]) for (const s of [-1, 1]) {
        const tb = s * (GT.hw + 5.5);
        box(7, H + 9, 7, tb, y0 + (H + 9) / 2, az, sand(2, 5));
        const cone = new THREE.Mesh(new THREE.ConeGeometry(4.6, 12, 8), gold); cone.position.set(tb, y0 + H + 9 + 6, az); grp.add(cone);
        for (let k = 0; k < 3; k++) { const gg = new THREE.Mesh(new THREE.OctahedronGeometry(0.45), gem); gg.position.set(tb, y0 + 4 + k * 5, az + (az === K.a1 ? 3.6 : -3.6)); grp.add(gg); }
        wallSeg(az - 3.5, tb - 3.5, az + 3.5, tb - 3.5, 0.3); wallSeg(az - 3.5, tb + 3.5, az + 3.5, tb + 3.5, 0.3);
        wallSeg(az - 3.5, tb - 3.5, az - 3.5, tb + 3.5, 0.3); wallSeg(az + 3.5, tb - 3.5, az + 3.5, tb + 3.5, 0.3);
      }
      for (const az of [K.a1, K.a0]) for (const s of [-1, 1]) {
        box(7, H + 6, 7, s * K.hw, y0 + (H + 6) / 2, az, sand(2, 4));
        const dome = new THREE.Mesh(new THREE.SphereGeometry(4.4, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), gold); dome.position.set(s * K.hw, y0 + H + 6, az); grp.add(dome);
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.6, 3, 6), goldPlain); tip.position.set(s * K.hw, y0 + H + 6 + 5.4, az); grp.add(tip);
      }
      // the great golden dome over the mountain gate, and a golden facade band with the emblem
      const bigDome = new THREE.Mesh(new THREE.SphereGeometry(9, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), gold); bigDome.position.set(0, y0 + H, K.a0 - 4); grp.add(bigDome);
      // flags on the walls
      for (let i = 0; i < 6; i++) for (const s of [-1, 1]) this.addFlag(s * (K.hw - 1.2), y0 + H + 0.6, K.a0 + 5 + i * 7, s > 0 ? -90 : 90);
      for (const s of [-1, 1]) { this.addFlag(s * 24, y0 + H + 0.6, K.a1 - 1.2, 0); this.addFlag(s * 40, y0 + H + 0.6, K.a1 - 1.2, 0); }
      // courtyard lanterns (their lights come on at night) and the paved way from gate to gate
      box(8, 0.06, K.a1 - K.a0, 0, y0 + 0.04, (K.a0 + K.a1) / 2, gold);
      for (const az of [K.a0 + 10, (K.a0 + K.a1) / 2, K.a1 - 10]) for (const s of [-1, 1]) this.addLantern(s * 6, y0, az, true);
      // the tunnel into the mountain
      const TN = C.tunnel, len = TN.a1 - TN.a0, ac = (TN.a0 + TN.a1) / 2;
      box(TN.hw * 2 + 1, 0.3, len + 2, 0, y0 - 0.15, ac, sand(3, 20));
      for (const s of [-1, 1]) { box(1, TN.h, len + 2, s * (TN.hw + 0.5), y0 + TN.h / 2, ac, rock(2, 20)); wallSeg(TN.a0 - 2, s * TN.hw, TN.a1 + 1, s * TN.hw, 0.6); }
      box(TN.hw * 2 + 2, 1, len + 2, 0, y0 + TN.h + 0.5, ac, rock(3, 20));
      for (let i = 0; i < 6; i++) for (const s of [-1, 1]) this.addLantern(s * (TN.hw - 0.6), y0 + 3.2, TN.a0 + 8 + i * (len / 6), false, true);
      // the lake and the bridge over it
      const LK = C.lake;
      const waterMat = new THREE.MeshStandardMaterial({ map: A.tex.t_water || null, color: A.tex.t_water ? 0xffffff : 0x3c7a8a, transparent: true, opacity: 0.82, roughness: 0.25, metalness: 0.05, emissive: 0x0a2a32 });
      if (waterMat.map) { waterMat.map = waterMat.map.clone(); waterMat.map.repeat.set(6, 6); waterMat.map.wrapS = waterMat.map.wrapT = THREE.RepeatWrapping; waterMat.map.needsUpdate = true; }
      const lake = new THREE.Mesh(new THREE.CircleGeometry(LK.r + 1, 48), waterMat); lake.rotation.x = -Math.PI / 2; lake.position.set(0, L.court - 2.05 + 0.02, LK.a); grp.add(lake); this.lakeMesh = lake;
      const BR = C.bridge, N = 14, Lb = BR.a1 - BR.a0;
      for (let i = 0; i < N; i++) {
        const a0 = BR.a0 + (Lb / N) * i, a1 = a0 + Lb / N;
        const y0b = this.floorH(...cityWorld(a0, 0)) - 0.16, y1b = this.floorH(...cityWorld(a1, 0)) - 0.16;
        const segL = Math.hypot(a1 - a0, y1b - y0b), tilt = Math.atan2(y1b - y0b, a1 - a0);
        const seg = new THREE.Mesh(new THREE.BoxGeometry(BR.hw * 2, 0.32, segL + 0.05), sand(2, 1)); seg.position.set(0, (y0b + y1b) / 2, (a0 + a1) / 2); seg.rotation.x = -tilt; seg.receiveShadow = true; grp.add(seg);
        for (const s of [-1, 1]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.1, segL + 0.05), goldPlain); rail.position.set(s * (BR.hw - 0.15), (y0b + y1b) / 2 + 0.7, (a0 + a1) / 2); rail.rotation.x = -tilt; grp.add(rail); }
      }
      for (const k of [0.25, 0.5, 0.75]) { const az = BR.a0 + Lb * k; const pier = new THREE.Mesh(new THREE.BoxGeometry(1.4, 6, 1.4), sand(1, 3)); pier.position.set(0, L.court - 2.6, az); grp.add(pier); }
    }

    // ===== the CAVERN =====
    {
      const R = C.wallR, TR = C.terraceR, ET = C.entryTh;
      // floors: plaza, the altar dais, the entry terrace, the upper terrace, the lower gallery, the river
      sector(0, TR + 1, -180, 180, L.plaza, sand(24, 24), 96);
      const daisM = gold; sector(0, C.altar.r, -180, 180, L.dais, daisM, 48);
      cyl(C.altar.r, 0, 360, L.plaza, L.dais, gold);
      for (let k = 1; k <= 3; k++) { const rr = C.altar.r + k; const yy = L.plaza + (L.dais - L.plaza) * (3 - k + 1) / 3; sector(rr - 1, rr, -180, 180, yy, sand(4, 4), 48); cyl(rr, 0, 360, L.plaza, yy, sand(4, 1)); }
      // entry terrace (a > entryA, plus the wall-to-wall band at |θ| < ET beyond the terrace radius)
      sector(TR, R, -ET, ET, L.court, sand(8, 8), 40);
      {
        const shape = new THREE.Shape();   // the chord region a > entryA inside r < TR (local x = b, y = a here)
        const th = Math.acos(Math.min(1, C.entryA / TR));
        shape.moveTo(-TR * Math.sin(th), C.entryA);
        for (let i = 0; i <= 24; i++) { const t = -th + (2 * th) * (i / 24); shape.lineTo(TR * Math.sin(t), TR * Math.cos(t)); }
        shape.closePath();
        const geo = new THREE.ShapeGeometry(shape); geo.rotateX(Math.PI / 2);   // shape (x, y) -> (x, -z)? keep a on +z
        const mm = new THREE.Mesh(geo, sand(8, 8)); mm.position.y = L.court; mm.material.side = THREE.DoubleSide; grp.add(mm);
      }
      // the ramp down from the entry terrace: a broad flight of steps, wall to wall
      {
        const steps = 8, dy = (L.court - L.plaza) / steps, da = (C.entryA - C.entryRampA) / steps;
        for (let i = 0; i < steps; i++) {
          const a0 = C.entryRampA + da * i, y = L.plaza + dy * (i + 1);
          const halfW = Math.sqrt(Math.max(1, TR * TR - a0 * a0)) + 2;
          box(halfW * 2, dy + 0.05, da + 0.05, 0, y - dy / 2, a0 + da / 2, sand(halfW / 2, 0.5));
        }
      }
      // the upper terrace (north-west, b > 0) and the lower gallery (south-east, b < 0)
      sector(TR, R, ET, 180, L.terrace, sand(6, 6), 48);
      cyl(TR, ET, 180, L.plaza, L.terrace, sand(12, 2));
      sector(TR, C.riverR0, -180, -ET, L.lower, sand(6, 6), 48);
      sector(C.riverR1, R, -180, -ET, L.lower, sand(6, 6), 48);
      sector(C.riverR0 - 0.2, C.riverR1 + 0.2, -180, -ET, L.riverBed, rock(6, 2), 48);
      cyl(TR, -180, -ET, L.lower, L.plaza, sand(12, 2));
      cyl(C.riverR0, -180, -ET, L.riverBed, L.lower, rock(6, 1), true); cyl(C.riverR1, -180, -ET, L.riverBed, L.lower, rock(6, 1));
      // the river's water
      {
        const wm = new THREE.MeshStandardMaterial({ map: A.tex.t_water ? A.tex.t_water.clone() : null, color: A.tex.t_water ? 0xffffff : 0x2f6e80, transparent: true, opacity: 0.8, roughness: 0.2, emissive: 0x0b2a34 });
        if (wm.map) { wm.map.repeat.set(8, 1); wm.map.wrapS = wm.map.wrapT = THREE.RepeatWrapping; wm.map.needsUpdate = true; }
        this.riverMesh = sector(C.riverR0, C.riverR1, -180, -ET, L.water, wm, 48);
      }
      // the bridge over the river (to the vault) and the two ramps
      box(C.riverBridgeHw * 2, 0.5, C.riverR1 - C.riverR0 + 2, -(C.riverR0 + C.riverR1) / 2, L.lower - 0.25, 0, sand(1, 2), Math.PI / 2);
      for (const s of [-1, 1]) box(0.3, 1.0, C.riverR1 - C.riverR0 + 2, -(C.riverR0 + C.riverR1) / 2, L.lower + 0.5, s * (C.riverBridgeHw - 0.15), goldPlain, Math.PI / 2);
      for (const sgn of [1, -1]) {
        const y1 = sgn > 0 ? L.terrace : L.lower, len = C.ramp.r1 - C.ramp.r0, mid = (C.ramp.r0 + C.ramp.r1) / 2;
        // local x = b: the ramp runs along x and rises with +x on both sides (up toward +b, down toward -b)
        const tilt = Math.atan2(Math.abs(y1 - L.plaza), len), slope = Math.hypot(len, y1 - L.plaza) + 0.4;
        const rm = new THREE.Mesh(new THREE.BoxGeometry(slope, 0.4, C.ramp.hw * 2), sand(3, 2));
        rm.position.set(sgn * mid, (L.plaza + y1) / 2 - 0.2, 0); rm.rotation.z = tilt; rm.receiveShadow = true; grp.add(rm);
        for (const s of [-1, 1]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(slope, 1.0, 0.3), goldPlain); rail.position.set(sgn * mid, (L.plaza + y1) / 2 + 0.5, s * (C.ramp.hw - 0.15)); rail.rotation.z = tilt; grp.add(rail); }
      }
      // the cavern wall, the dome, the shaft of light
      cyl(R, 0, 360, L.riverBed - 2, C.wallTop, rock(24, 4), true, 96);
      {
        const pts = [];
        const N = 14;
        for (let i = 0; i <= N; i++) { const t = i / N; const rr = R - (R - C.shaftR) * Math.sin(t * Math.PI / 2); const yy = C.wallTop + (C.cavernH - C.wallTop) * Math.sin(t * Math.PI / 2); pts.push(new THREE.Vector2(rr, yy)); }
        const dome = new THREE.Mesh(new THREE.LatheGeometry(pts, 96), (() => { const m = rock(24, 4); m.side = THREE.BackSide; return m; })()); grp.add(dome);
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(C.shaftR, C.shaftR, C.peakH - C.cavernH + 2, 32, 1, true), (() => { const m = rock(4, 8); m.side = THREE.BackSide; return m; })());
        shaft.position.y = (C.cavernH + C.peakH) / 2; grp.add(shaft);
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(C.shaftR * 0.9, C.shaftR * 1.3, C.cavernH - L.plaza, 32, 1, true),
          new THREE.MeshBasicMaterial({ color: 0xffe9b0, transparent: true, opacity: 0.09, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        beam.position.y = (C.cavernH + L.plaza) / 2; grp.add(beam); this.beam = beam;
        const pool = new THREE.Mesh(new THREE.CircleGeometry(C.shaftR * 1.5, 40), new THREE.MeshBasicMaterial({ color: 0xffe3a0, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }));
        pool.rotation.x = -Math.PI / 2; pool.position.y = L.dais + 0.03; grp.add(pool);
      }
      // the altar itself: a golden block with a gem, four braziers
      box(3.2, 1.3, 1.8, 0, L.dais + 0.65, 0, gold);
      const ag = new THREE.Mesh(new THREE.OctahedronGeometry(0.5), gem); ag.position.set(0, L.dais + 1.75, 0); grp.add(ag); this.altarGem = ag;
      this.altarLocal = { a: 0, b: 0 };
      for (const [ba, bb] of [[5, 5], [5, -5], [-5, 5], [-5, -5]]) this.addBrazier(bb, L.dais, ba);
      w.addTree(...cityWorld(0, 0), 2.0);
      // radial walls between the entry terrace and the two bands
      for (const s of [-1, 1]) {
        const th = s * ET * D2R;
        const a0 = TR * Math.cos(th), b0 = TR * Math.sin(th), a1 = R * Math.cos(th), b1 = R * Math.sin(th);
        wallSeg(a0, b0, a1, b1, 0.5);
        const len = R - TR, ya = s > 0 ? L.terrace : L.lower, yb = L.court;
        const wall = new THREE.Mesh(new THREE.BoxGeometry(0.6, Math.abs(ya - yb), len), sand(1, 4));
        wall.position.set((b0 + b1) / 2, (ya + yb) / 2, (a0 + a1) / 2); wall.rotation.y = -th; grp.add(wall);
      }
      // the throne hall (carved off the back of the cavern) and the vault (behind the river)
      {
        const T = C.throne, hw = T.hw, len = T.a1 - T.a0, ac = (T.a0 + T.a1) / 2, y = L.terrace, H = 14;
        box(hw * 2 + 2, 0.4, len + 2, 0, y - 0.2, ac, sand(6, 6));
        box(hw * 2 + 2, 1, len + 2, 0, y + H + 0.5, ac, rock(6, 6));
        for (const s of [-1, 1]) { box(1, H, len + 2, s * (hw + 0.5), y + H / 2, ac, sand(2, 6)); wallSeg(T.a0 - 1, s * hw, T.a1 + 1, s * hw, 0.6); }
        box(hw * 2 + 2, H, 1, 0, y + H / 2, T.a0 - 0.5, sand(6, 3)); wallSeg(T.a0, -hw, T.a0, hw, 0.6);
        for (const s of [-1, 1]) { box(hw - T.doorHw, H, 1, s * (T.doorHw + (hw - T.doorHw) / 2), y + H / 2, T.a1 + 0.5, sand(3, 3)); wallSeg(T.a1, s * T.doorHw, T.a1, s * hw, 0.6); }
        box(T.doorHw * 2 + 2, H - 8, 1.2, 0, y + 8 + (H - 8) / 2, T.a1 + 0.5, gold);
        // dais + throne
        box(8, 1.2, 5, 0, y + 0.6, T.a0 + 6, gold);
        box(3, 5, 1, 0, y + 1.2 + 2.5, T.a0 + 4.3, gold); box(3, 1, 2.4, 0, y + 1.2 + 0.9, T.a0 + 5.6, goldPlain);
        for (let i = 0; i < 4; i++) for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, H, 12), gold); p.position.set(s * (hw - 3), y + H / 2, T.a0 + 5 + i * 8); grp.add(p); w.addTree(...cityWorld(T.a0 + 5 + i * 8, s * (hw - 3)), 0.9); }
        for (let i = 0; i < 3; i++) for (const s of [-1, 1]) this.addLantern(s * (hw - 1.2), y + 4, T.a0 + 8 + i * 9, false, true);
        for (const s of [-1, 1]) this.addFlag(s * (hw - 1.5), y + 9, T.a0 + 3, s > 0 ? -90 : 90);
        w.addTree(...cityWorld(T.a0 + 5.6, 0), 1.6);
        this.throneLocal = { a: T.a0 + 8, b: 0 };
        const V = C.vault, vhw = V.hw, vlen = V.b1 - V.b0, bc = -(V.b0 + V.b1) / 2, yv = L.lower, HV = 7;
        box(vhw * 2 + 2, 0.4, vlen + 2, bc, yv - 0.2, 0, sand(6, 6), Math.PI / 2);
        box(vhw * 2 + 2, 1, vlen + 2, bc, yv + HV + 0.5, 0, rock(6, 6), Math.PI / 2);
        for (const s of [-1, 1]) { box(1, HV, vlen + 2, bc, yv + HV / 2, s * (vhw + 0.5), sand(2, 6), Math.PI / 2); wallSeg(s * vhw, -V.b0 + 1, s * vhw, -V.b1 - 1, 0.6); }
        box(vhw * 2 + 2, HV, 1, -V.b1 - 0.5, yv + HV / 2, 0, sand(6, 2), Math.PI / 2); wallSeg(-vhw, -V.b1, vhw, -V.b1, 0.6);
        for (const s of [-1, 1]) { box(vhw - V.doorHw, HV, 1, -V.b0 + 0.5, yv + HV / 2, s * (V.doorHw + (vhw - V.doorHw) / 2), sand(3, 2), Math.PI / 2); wallSeg(s * V.doorHw, -V.b0, s * vhw, -V.b0, 0.6); }
        // the vault door: a golden slab that slides aside once unlocked
        const door = box(V.doorHw * 2, HV - 1, 0.5, -V.b0, yv + (HV - 1) / 2, 0, gold, Math.PI / 2);
        const dg = new THREE.Mesh(new THREE.OctahedronGeometry(0.4), gem); dg.position.set(-V.b0 + 0.5, yv + 3.2, 0); grp.add(dg);
        this.vaultDoor = door; this.vaultDoorSeg = { a0: -V.doorHw, b0: -V.b0, a1: V.doorHw, b1: -V.b0, t: 0.5 }; this.walls.push(this.vaultDoorSeg);
        this.vaultDoorLocal = { a: 0, b: -V.b0 + 2.5 };
        for (const s of [-1, 1]) this.addLantern(-V.b0 - 2, yv + 3, s * (vhw - 1.5), false, true);
        this.addLantern(-V.b1 + 2, yv + 3, 0, false, true);
        // three treasure chests + a heap of coins on a plinth
        this.vaultChests = [];
        const chestA = A.glb.chest;
        for (const [ca, cb] of [[-8, -(V.b1 - 5)], [0, -(V.b1 - 4)], [8, -(V.b1 - 5)]]) {
          const [wx, wz] = cityWorld(ca, cb);
          let mesh = null;
          if (chestA) { mesh = chestA.model.clone(); mesh.position.set(wx, yv, wz); mesh.rotation.y = C.grpYaw + Math.PI; scene.add(mesh); }
          const ch = { x: wx, z: wz, y: yv, opened: false, knife: false, mesh, snake: false, treasure: true, desert: true, vault: true };
          w.chests.push(ch); this.vaultChests.push(ch);
          w.addTree(wx, wz, 0.7);
        }
        const heap = new THREE.Mesh(new THREE.ConeGeometry(2.2, 1.2, 12), goldPlain); heap.position.set(bc, yv + 0.6, 0); grp.add(heap);
      }
      // the market stalls, the smith, the inn, the keeper's bench
      for (const st of C.stalls) this.addStall(st);
      {
        const I = C.inn, y = L.terrace;
        const [ia, ib] = [I.r * Math.cos(I.th * D2R), I.r * Math.sin(I.th * D2R)];
        box(12, 0.3, 10, ib, y + 0.15, ia, sand(3, 3), -I.th * D2R);
        for (const s of [-1, 1]) for (const t of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 5, 8), gold); const pa = ia + s * 4.5 * Math.cos(I.th * D2R) - t * 4.5 * Math.sin(I.th * D2R), pb = ib + s * 4.5 * Math.sin(I.th * D2R) + t * 4.5 * Math.cos(I.th * D2R); p.position.set(pb, y + 2.5, pa); grp.add(p); }
        box(13, 0.4, 11, ib, y + 5.2, ia, gold, -I.th * D2R);
        this.innBeds = [];
        const bedA = A.glb.singlebed || A.glb.bedroll;
        for (let k = -1; k <= 1; k++) {
          const ba = ia - 2.5 * Math.cos(I.th * D2R) + k * 3.2 * -Math.sin(I.th * D2R), bb = ib - 2.5 * Math.sin(I.th * D2R) + k * 3.2 * Math.cos(I.th * D2R);
          const [wx, wz] = cityWorld(ba, bb);
          if (bedA) { const m = bedA.model.clone(); m.position.set(wx, y + 0.3, wz); m.rotation.y = C.grpYaw - I.th * D2R; scene.add(m); }
          else box(1.2, 0.5, 2.2, bb, y + 0.55, ba, dark, -I.th * D2R);
          this.innBeds.push({ x: wx, z: wz, y: y + 0.3 });
        }
        this.innLocal = { a: ia + 3 * Math.cos(I.th * D2R), b: ib + 3 * Math.sin(I.th * D2R) };
        this.addLantern(ib + 5 * Math.cos(I.th * D2R), y + 4.6, ia - 5 * Math.sin(I.th * D2R), false, true);
      }
      // lanterns along both terraces and their lights
      for (let th = ET + 12; th < 180; th += 24) { const rr = C.terraceR + 3; this.addLantern(rr * Math.sin(th * D2R), L.terrace + 0.1, rr * Math.cos(th * D2R), false, true, 3.5); }
      for (let th = -ET - 12; th > -180; th -= 24) { const rr = C.terraceR + 3; this.addLantern(rr * Math.sin(th * D2R), L.lower + 0.1, rr * Math.cos(th * D2R), false, true, 3.5); }
      for (let th = -160; th <= 160; th += 40) { const rr = 70; this.addLantern(rr * Math.sin(th * D2R), L.plaza, rr * Math.cos(th * D2R), false, true, 3.5); }
      for (let th = 100; th < 180; th += 26) this.addFlag((C.wallR - 2) * Math.sin(th * D2R), L.terrace + 6, (C.wallR - 2) * Math.cos(th * D2R), -th);
      // the entry terrace's gate arch into the cavern (a gold band)
      box(C.tunnel.hw * 2 + 3, 1.2, 1.2, 0, L.court + C.tunnel.h + 0.6, C.tunnel.a0 - 0.5, gold);
    }
    // the map place, the safe spot the portals land you on
    if (!CFG.locations.some((l) => l.id === "eternius")) {
      // the marker sits on the mountain's heart (clear of the oasis label); the radius reaches the courtyard
      CFG.locations.push({ id: "eternius", x: C.cx, z: C.cz, r: C.castle.a1 - 4 });
      CFG.portals.arrivals.eternius = cityWorld(C.bridge.a1 + 6, 0);
    }
    this.buildStatue();
    this.buildRex();
    this.buildNpcs();
  }
  addFlag(bx, y, az, faceDeg) {
    const grp = this.grp, A = this.g.assets;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 6, 6), this.mats.goldPlain); pole.position.set(bx, y + 3, az); grp.add(pole);
    const tex = A.tex.t_flag;
    const m = new THREE.MeshStandardMaterial({ map: tex || null, color: tex ? 0xffffff : 0x1f5a2a, side: THREE.DoubleSide, roughness: 0.9, emissive: 0x2a1c00, emissiveIntensity: 0 });
    const f = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 2.4, 6, 4), m); f.position.set(bx, y + 4.4, az); f.rotation.y = faceDeg * D2R;
    f.geometry.translate(0.9, 0, 0);
    grp.add(f); this.flags.push(f);
  }
  addLantern(bx, y, az, night, cave, lit = 0) {
    const grp = this.grp;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 2.6, 6), this.mats.goldPlain); post.position.set(bx, y + 1.3, az); grp.add(post);
    const cage = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.5), this.mats.goldPlain); cage.position.set(bx, y + 2.9, az); grp.add(cage);
    const glow = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.5, 0.34), new THREE.MeshBasicMaterial({ color: 0xffd27a })); glow.position.set(bx, y + 2.9, az); grp.add(glow);
    const [wx, wz] = cityWorld(az, bx);
    this.lanterns.push({ glow, night });
    if (lit) { const l = new THREE.PointLight(0xffc35a, lit, 34, 2); l.position.set(bx, y + 2.9, az); grp.add(l); this.lights.push({ l, night, on: lit }); }
    else if (night) { const l = new THREE.PointLight(0xffc35a, 0, 26, 2); l.position.set(bx, y + 2.9, az); grp.add(l); this.lights.push({ l, night: true, on: 3.2 }); }
    this.g.world.addTree(wx, wz, 0.25);
  }
  addBrazier(bx, y, az) {
    const grp = this.grp;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 2.2, 8), this.mats.goldPlain); stem.position.set(bx, y + 1.1, az); grp.add(stem);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.35, 0.5, 10), this.mats.goldPlain); bowl.position.set(bx, y + 2.4, az); grp.add(bowl);
    const flTex = new THREE.CanvasTexture(flameCanvas()); flTex.colorSpace = THREE.SRGBColorSpace;
    const fm = new THREE.MeshBasicMaterial({ map: flTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.flames = this.flames || [];
    for (const rot of [0, Math.PI / 2]) { const f = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.5), fm); f.position.set(bx, y + 3.2, az); f.rotation.y = rot; grp.add(f); this.flames.push(f); }
    const l = new THREE.PointLight(0xffa040, 2.2, 18, 2); l.position.set(bx, y + 3.2, az); grp.add(l);
    this.g.world.addTree(...cityWorld(az, bx), 0.5);
  }
  addStall(st) {
    const C = E(), L = C.levels, grp = this.grp, w = this.g.world;
    const a = st.r * Math.cos(st.th * D2R), b = st.r * Math.sin(st.th * D2R), y = L.plaza, ry = st.th * D2R;
    const box = (wd, h, d, x, yy, z, m) => { const mm = new THREE.Mesh(new THREE.BoxGeometry(wd, h, d), m); mm.position.set(x, yy, z); mm.rotation.y = ry; mm.castShadow = true; grp.add(mm); return mm; };
    // a counter facing the altar, a striped awning on gold posts, wares on top
    const cos = Math.cos(st.th * D2R), sin = Math.sin(st.th * D2R);
    box(4.6, 1.1, 1.2, b, y + 0.55, a, this.mats.sand(2, 1));
    box(4.8, 0.12, 1.4, b, y + 1.16, a, this.mats.gold);
    for (const s of [-1, 1]) { const pa = a + 1.2 * cos + s * 2.2 * -sin, pb = b + 1.2 * sin + s * 2.2 * cos; const p = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 3.2, 6), this.mats.goldPlain); p.position.set(pb, y + 1.6, pa); grp.add(p); }
    const back = box(4.6, 3.2, 0.3, b + 1.6 * sin, y + 1.6, a + 1.6 * cos, this.mats.sand(2, 1));
    const aw = new THREE.MeshStandardMaterial({ color: st.color || 0x2f7a3a, roughness: 0.9, side: THREE.DoubleSide });
    const awn = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 3.0), aw); awn.position.set(b + 0.4 * sin, y + 3.3, a + 0.4 * cos); awn.rotation.set(-Math.PI / 2 + 0.35, ry, 0, "YXZ"); grp.add(awn);
    const wares = st.wares || 0xa0522d;
    for (let i = -1; i <= 1; i++) { const ob = new THREE.Mesh(i === 0 ? new THREE.SphereGeometry(0.28, 8, 6) : new THREE.BoxGeometry(0.5, 0.4, 0.4), new THREE.MeshStandardMaterial({ color: wares, roughness: 0.8 })); ob.position.set(b + i * 1.3 * cos, y + 1.4, a - i * 1.3 * sin); grp.add(ob); }
    if (st.id === "smith") { const anvil = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.5), this.mats.dark); anvil.position.set(b - 3.0 * cos, y + 0.3 + 0.5, a + 3.0 * sin); grp.add(anvil); }
    this.addLantern(b + 2.6 * cos - 0.4 * sin, y, a - 2.6 * sin - 0.4 * cos, false, true, 0);
    const [wx, wz] = cityWorld(a, b);
    w.addTree(wx, wz, 2.3);
    // the keeper stands behind the counter, facing the altar
    const [kx, kz] = cityWorld(a + 1.1 * cos, b + 1.1 * sin);
    this.stalls.push({ ...st, x: wx, z: wz, y, keeperX: kx, keeperZ: kz });
  }
  buildStatue() {
    const C = E(), A = this.g.assets, S = C.statue, [x, z] = cityWorld(S.a, S.b), y = C.levels.court;
    if (A.glb.et_statue) { const m = A.glb.et_statue.model.clone(); m.position.set(x, y, z); m.rotation.y = C.grpYaw; this.g.scene.add(m); }
    else { const m = new THREE.Mesh(new THREE.BoxGeometry(3, 9, 3), this.mats.gold); m.position.set(x, y + 4.5, z); this.g.scene.add(m); }
    this.g.world.addTree(x, z, 2.6);
    this.statueWorld = { x, z };
  }
  // the chained beast: a T-Rex in every rule, green, in golden armour, held by a chain
  buildRex() {
    const C = E(), R = C.chainRex, A = this.g.assets, g = this.g;
    const [px, pz] = cityWorld(R.a, R.b), y = C.levels.court;
    const ctx = g.ctx;
    if (!A.glb.trex) return;
    // a green copy of the T-Rex model
    const asset = { model: A.glb.trex.model.clone(), anims: A.glb.trex.anims };
    asset.model.traverse((o) => { if (o.isMesh && o.material) { o.material = o.material.clone(); o.material.color = new THREE.Color(0x5cb84e); o.material.emissive = new THREE.Color(0x0c2a0a); o.material.emissiveIntensity = 0.6; } });
    const [sx, sz] = cityWorld(R.a + 4, R.b);
    const rex = new Creature("trex", asset, sx, sz, ctx, { chained: { x: px, z: pz, r: R.reach }, zone: "chained" });
    rex.hp = rex.maxHp = Infinity; rex.chained = true; rex.chain = { x: px, z: pz, r: R.reach };
    // the golden armour: a collar, a back plate, two shoulder plates, gems
    const gold = this.mats.goldPlain, gem = this.mats.gem, H = rex.cfg.height || CFG.trex.height || 5.4;
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.14, 8, 20), gold); collar.position.set(0, H * 0.62, H * 0.22); collar.rotation.x = Math.PI / 2 - 0.5; rex.group.add(collar);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.2, 2.6), gold); plate.position.set(0, H * 0.86, -H * 0.02); plate.rotation.x = 0.12; rex.group.add(plate);
    for (const s of [-1, 1]) { const sh = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), gold); sh.position.set(s * 0.95, H * 0.74, H * 0.12); rex.group.add(sh); }
    const gm = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), gem); gm.position.set(0, H * 0.93, 0.6); rex.group.add(gm);
    g.creatures.push(rex);
    this.rex = rex; this.rexCollar = collar;
    // the post and the chain
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 3.2, 10), this.mats.dark); post.position.set(px, y + 1.6, pz); g.scene.add(post);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.1, 8, 16), gold); ring.position.set(px, y + 3.0, pz); ring.rotation.x = Math.PI / 2; g.scene.add(ring);
    g.world.addTree(px, pz, 0.6);
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1, 6), this.mats.dark); g.scene.add(chain); this.chainMesh = chain;
    this.postTop = new THREE.Vector3(px, y + 3.0, pz);
    // a warning stone
    this.rexSign = { x: px + (sx - px) * 0.2, z: pz + (sz - pz) * 0.2 };
  }
  buildNpcs() {
    const C = E(), L = C.levels, A = this.g.assets, scene = this.g.scene;
    const K = C.castle;
    const mk = (kind, a, b, y, faceA, faceB, role, opts = {}) => {
      const id = { male: "et_male", female: "et_female", spear: "et_guardspear", sword: "et_guardsword", king: "et_king" }[kind];
      const asset = A.glb[id];
      const [x, z] = cityWorld(a, b);
      let body;
      if (asset) body = asset.model.clone();
      else { body = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 2.0, 4, 8), new THREE.MeshStandardMaterial({ color: 0x6c9c3a })); body.position.y = 1.5; const g2 = new THREE.Group(); g2.add(body); body = g2; }
      const [fx, fz] = cityWorld(faceA, faceB);
      const yaw = Math.atan2(fx - x, fz - z);
      body.position.set(x, y, z); body.rotation.y = yaw; scene.add(body);
      const npc = { kind, role, body, x, z, y, yaw0: yaw, yaw, name: opts.name || (kind === "female" ? "Eternial woman" : kind === "male" ? "Eternial man" : "Eternial guard"), lines: opts.lines, walk: opts.walk || null, t: Math.random() * 10, h: CFG.modelScale[id] || 3, ...opts };
      this.npcs.push(npc);
      if (!npc.walk) this.g.world.addTree(x, z, 0.55);
      return npc;
    };
    const S = STR.et;
    // courtyard: two spear guards at the gate, two sword guards at the mountain gate, a few citizens
    mk("spear", K.a1 - 3, 8, L.court, K.a1 + 40, 8, "guard", { lines: S.guardLines });
    mk("spear", K.a1 - 3, -8, L.court, K.a1 + 40, -8, "guard", { lines: S.guardLines });
    mk("sword", K.a0 + 3, 8, L.court, K.a1, 8, "guard", { lines: S.guardLines });
    mk("sword", K.a0 + 3, -8, L.court, K.a1, -8, "guard", { lines: S.guardLines });
    mk("female", 234, 24, L.court, C.statue.a, C.statue.b, "citizen", { lines: S.femaleLines });
    mk("male", 241, -22, L.court, C.statue.a, C.statue.b, "citizen", { lines: S.maleLines });
    mk("male", 214, 46, L.court, 214, 30, "citizen", { lines: S.maleLines });
    // the cavern: stall keepers, the innkeeper, the keeper of tales, the king, guards, walkers
    for (const st of this.stalls) {
      const { a, b } = cityLocal(st.keeperX, st.keeperZ);
      const npc = mk(st.kind || "male", a, b, L.plaza, 0, 0, "stall", { name: st.name, stall: st, lines: st.lines ? STR.et[st.lines] : S.maleLines });
      st.npc = npc;
    }
    mk("spear", C.entryRampA - 4, 12, L.plaza, C.entryA + 40, 12, "guard", { lines: S.guardLines });
    mk("spear", C.entryRampA - 4, -12, L.plaza, C.entryA + 40, -12, "guard", { lines: S.guardLines });
    mk("sword", C.throne.a1 + 3, 6, L.terrace, C.throne.a1 + 40, 6, "guard", { lines: S.guardLines });
    mk("sword", C.throne.a1 + 3, -6, L.terrace, C.throne.a1 + 40, -6, "guard", { lines: S.guardLines });
    mk("king", this.throneLocal.a, 0, L.terrace + 1.2, this.throneLocal.a + 30, 0, "king", { name: S.kingName, lines: S.kingLines });
    mk("female", this.innLocal.a, this.innLocal.b, L.terrace + 0.3, 0, 0, "inn", { name: S.innName, lines: S.innLines });
    const KP = C.keeper; mk("male", KP.r * Math.cos(KP.th * D2R), KP.r * Math.sin(KP.th * D2R), L.lower, 0, 0, "keeper", { name: S.keeperName, lines: S.keeperLines });
    // citizens who stroll the plaza between the stalls
    const stallAngles = C.stalls.map((s) => s.th);
    const way = (n) => { const out = []; for (let i = 0; i < n; i++) { let th, r; for (let k = 0; k < 40; k++) { th = -150 + Math.random() * 300; r = 22 + Math.random() * 45; if (stallAngles.every((sa) => Math.abs(sa - th) > 22 || r < 30)) break; } out.push([r * Math.cos(th * D2R), r * Math.sin(th * D2R)]); } return out; };
    for (let i = 0; i < 5; i++) {
      const pts = way(4); const [a, b] = pts[0];
      mk(i % 2 ? "female" : "male", a, b, L.plaza, pts[1][0], pts[1][1], "citizen", { lines: i % 2 ? S.femaleLines : S.maleLines, walk: { pts, i: 1, wait: 0, speed: 0.85 } });
    }
    // two citizens on the terraces, looking down
    mk("female", -20, C.terraceR + 8, L.terrace, 0, 0, "citizen", { lines: S.femaleLines });
    mk("male", -60, -(C.terraceR + 6), L.lower, 0, 0, "citizen", { lines: S.maleLines });
  }

  // ---------------- per frame ----------------
  update(dt) {
    const g = this.g, p = g.player, C = E();
    this.t += dt;
    const near = Math.hypot(p.pos.x - C.cx, p.pos.z - C.cz) < C.mountainR + 420;
    if (!near) return;
    // lanterns and flags glow at night in the courtyard; the cavern's lights never go out
    const night = g.isNight ? 1 : 0;
    // inside the mountain the day's fog would swallow the far wall: push it back while you are in
    const P = this.polar(p.pos.x, p.pos.z);
    if (g.scene.fog && this.inMountainRooms(P.a, P.b, P.r) && p.pos.y < 24) { g.scene.fog.near = Math.max(g.scene.fog.near, 150); g.scene.fog.far = Math.max(g.scene.fog.far, 460); }
    for (const L of this.lights) if (L.night) L.l.intensity = L.on * (night ? 1 : 0);
    for (const f of this.flags) { f.material.emissiveIntensity = night * 0.6; f.rotation.z = Math.sin(this.t * 1.7 + f.position.x) * 0.06; }
    if (this.altarGem) this.altarGem.rotation.y += dt;
    if (this.flames) this.flames.forEach((f, i) => { const k = 1 + 0.12 * Math.sin(this.t * 9 + i * 1.7); f.scale.set(k, 1 / k + 0.15 * Math.sin(this.t * 6 + i), 1); });
    if (this.beam) this.beam.material.opacity = 0.07 + 0.03 * Math.sin(this.t * 0.7) * (1 - night * 0.7);
    if (this.lakeMesh && this.lakeMesh.material.map) this.lakeMesh.material.map.offset.set(this.t * 0.01, this.t * 0.007);
    if (this.riverMesh && this.riverMesh.material.map) this.riverMesh.material.map.offset.set(this.t * 0.05, 0);
    // the chain follows the beast
    if (this.rex && this.chainMesh) {
      const r = this.rex, from = this.postTop;
      const to = new THREE.Vector3(r.group.position.x, r.group.position.y + (r.cfg.height || 5.4) * 0.62, r.group.position.z);
      const mid = from.clone().add(to).multiplyScalar(0.5); const len = from.distanceTo(to);
      this.chainMesh.position.copy(mid); this.chainMesh.scale.set(1, Math.max(0.1, len), 1);
      this.chainMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
    }
    // the Eternials: strollers walk their rounds, everyone turns to face you when you come close
    for (const n of this.npcs) {
      n.t += dt;
      const d = Math.hypot(p.pos.x - n.x, p.pos.z - n.z);
      let targetYaw = n.yaw0;
      if (n.walk) {
        const W = n.walk;
        if (d < 4) { W.wait = 0.6; }
        else if (W.wait > 0) W.wait -= dt;
        else {
          const [ta, tb] = W.pts[W.i]; const [tx, tz] = cityWorld(ta, tb);
          const dx = tx - n.x, dz = tz - n.z, dd = Math.hypot(dx, dz);
          if (dd < 0.6) { W.i = (W.i + 1) % W.pts.length; W.wait = 2 + Math.random() * 4; }
          else { const st = Math.min(dd, W.speed * dt); n.x += dx / dd * st; n.z += dz / dd * st; n.yaw0 = Math.atan2(dx, dz); }
          n.body.position.x = n.x; n.body.position.z = n.z;
          n.body.position.y = n.y + Math.abs(Math.sin(n.t * 6)) * 0.05;
        }
      }
      if (d < 5.5 && n.role !== "king") targetYaw = Math.atan2(p.pos.x - n.x, p.pos.z - n.z);
      const dy = ((targetYaw - n.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      n.yaw += Math.max(-2.5 * dt, Math.min(2.5 * dt, dy));
      n.body.rotation.y = n.yaw;
      if (!n.walk) n.body.position.y = n.y + Math.sin(n.t * 1.3) * 0.012;   // breathing
    }
    // the keeper tells the next chapter once you have walked away and come back
    if (!this.keeperReady) { const k = this.npcs.find((n) => n.role === "keeper"); if (k && Math.hypot(p.pos.x - k.x, p.pos.z - k.z) > 25) this.keeperReady = true; }
    // the warning in front of the chained beast
    if (this.rex && !this.rex.dead) {
      const dr = Math.hypot(p.pos.x - this.rex.chain.x, p.pos.z - this.rex.chain.z);
      if (dr < this.rex.chain.r + 12 && dr > this.rex.chain.r + 3 && !this._warned) { this._warned = true; g.ui.toast(STR.et.rexWarn); }
      if (dr > this.rex.chain.r + 20) this._warned = false;
    }
  }
  onMorning() {
    // a fresh task from the king each day (an unfinished one stays)
    if (!this.task || this.task.done) this.newTask();
  }
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
      const d = Math.hypot(p.pos.x - n.x, p.pos.z - n.z);
      if (d > 4.2) continue;
      if (n.role === "stall") consider(n.x, n.z, n.y, `${S.trade} ${n.name} [${STR.interact}]`, () => this.openStall(n.stall));
      else if (n.role === "king") consider(n.x, n.z, n.y, `${S.talk} ${n.name} [${STR.interact}]`, () => this.openKing());
      else if (n.role === "keeper") consider(n.x, n.z, n.y, `${S.talk} ${n.name} [${STR.interact}]`, () => this.openKeeper());
      else if (n.role === "inn") consider(n.x, n.z, n.y, `${S.talk} ${n.name} [${STR.interact}]`, () => this.openInn());
      else consider(n.x, n.z, n.y, `${S.talk} ${n.name} [${STR.interact}]`, () => this.talk(n));
    }
    // the altar: once a day, hunger AND health
    {
      const [ax, az] = cityWorld(0, 0), ay = C.levels.dais;
      if (Math.hypot(p.pos.x - ax, p.pos.z - az) < 4.5) consider(ax, az, ay, `${STR.prayPrompt} [${STR.interact}]`, () => {
        if (this.prayedDay === g.dayNum) { g.ui.toast(STR.prayedAlready); g.audio.sDeny(); return; }
        this.prayedDay = g.dayNum; p.hu = 100; p.hp = 100;
        g.ui.toast(S.prayed); g.audio.sPickup();
      });
    }
    // the inn's beds
    for (const b of this.innBeds || []) {
      if (Math.hypot(p.pos.x - b.x, p.pos.z - b.z) < 2.6) consider(b.x, b.z, b.y, `${S.sleepFor.replace("%n", C.innPrice)} [${STR.interact}]`, () => {
        if (!g.isNight) return g.ui.toast(STR.sleepNotNight);
        if (this.coins < C.innPrice) { g.ui.toast(S.noCoins); g.audio.sDeny(); return; }
        this.coins -= C.innPrice; g.ui.coins(this.coins); g.sleep();
      });
    }
    // the vault door
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
      const P = this.polar(p.pos.x, p.pos.z);
      const bank = P.b < 0 && Math.abs(P.th) > C.entryTh && ((P.r > C.riverR0 - 3 && P.r < C.riverR0) || (P.r > C.riverR1 && P.r < C.riverR1 + 3));
      if (bank && Math.abs(p.pos.y - C.levels.lower) < 2) consider(p.pos.x, p.pos.z, p.pos.y, `${S.fish} [${STR.interact}]`, () => { g.fishing = { x: p.pos.x, z: p.pos.z, t: C.fishTime }; g.ui.toast(S.fishing); });
    }
  }
  talk(n) {
    const g = this.g, lines = n.lines || STR.et.maleLines;
    n.lineI = ((n.lineI ?? -1) + 1) % lines.length;
    const s = g.npcPanel(n.name, [lines[n.lineI]]);
    g.audio.sSelect && g.audio.sSelect();
  }
  openInn() {
    const g = this.g, S = STR.et, C = E();
    g.npcPanel(S.innName, S.innLines.map((l) => l.replace("%n", C.innPrice)));
  }
  openKeeper() {
    const g = this.g, S = STR.et;
    const ch = S.chapters;
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
  // ---------------- trade ----------------
  openStall(st) {
    const g = this.g, p = g.player, S = STR.et, C = E();
    g.menuOpen = true;
    const price = (id) => C.prices[id];
    const name = (id) => id === "fill_water" ? S.fillWater : (STR.items[id] ? STR.items[id].name : id);
    const rows = [];
    if (st.sells && st.sells.length) {
      rows.push(`<div style="font-weight:700;margin:6px 0 2px">${S.buyHead}</div>`);
      for (const id of st.sells) rows.push(`<div class="trow"><span>${name(id)}</span><span>${price(id)} ${S.coinsShort}</span><button data-buy="${id}">${S.buy}</button></div>`);
    }
    const sellable = [];
    for (const s of p.inv.slots) if (s && st.buys && st.buys[s.id] !== undefined && !sellable.includes(s.id)) sellable.push(s.id);
    rows.push(`<div style="font-weight:700;margin:10px 0 2px">${S.sellHead}</div>`);
    if (st.rare) rows.push(`<div style="font-size:12px;opacity:.85;margin-bottom:4px">${S.rareWarn}</div>`);
    if (!sellable.length) rows.push(`<div style="font-size:13px;opacity:.7">${st.rare ? S.nothingRare : S.nothingToSell}</div>`);
    for (const id of sellable) rows.push(`<div class="trow"><span>${name(id)} × ${p.inv.count(id)}</span><span>${st.buys[id]} ${S.coinsShort}</span><button data-sell="${id}">${S.sell}</button></div>`);
    const s = g.ui.screen(`
      <h1 style="font-size:24px;margin-bottom:2px">${st.name}</h1>
      <div style="font-size:13px;opacity:.85;margin-bottom:6px">${STR.et[st.blurb] || ""}</div>
      <div id="purse" style="font-size:16px;font-weight:700;margin-bottom:6px">${S.purse.replace("%n", this.coins)}</div>
      <div style="max-width:560px;width:92vw;max-height:52vh;overflow:auto;text-align:left">${rows.join("")}</div>
      <button id="pnlClose" style="margin-top:8px">${STR.close}</button>`);
    s.querySelector("#pnlClose").addEventListener("click", () => { g.ui.closeScreen(); g.resume(); });
    const refresh = () => { g.ui.closeScreen(); this.openStall(st); };
    s.querySelectorAll("[data-buy]").forEach((b) => b.addEventListener("click", () => {
      const id = b.dataset.buy, cost = price(id);
      if (this.coins < cost) { g.ui.toast(S.noCoins); g.audio.sDeny(); return; }
      if (id === "fill_water") {
        if (!p.inv.has("water_bottle")) { g.ui.toast(S.noBottle); g.audio.sDeny(); return; }
        g.desert.bottle.water = 100;
      } else if (!p.inv.add(id, C.bundles[id] || 1)) { g.ui.toast(STR.inventoryFull); g.audio.sDeny(); return; }
      this.coins -= cost; g.ui.coins(this.coins); g.ui.renderHotbar(p.inv); g.audio.sPickup();
      g.ui.toast(S.bought.replace("%i", name(id)));
      refresh();
    }));
    s.querySelectorAll("[data-sell]").forEach((b) => b.addEventListener("click", () => {
      const id = b.dataset.sell, val = st.buys[id];
      if (st.rare && b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = S.sellSure.replace("%n", val); setTimeout(() => { if (document.body.contains(b)) { b.dataset.armed = "0"; b.textContent = S.sell; } }, 3500); return; }
      if (p.inv.count(id) < 1) return;
      p.inv.remove(id, 1);
      this.coins += val; g.ui.coins(this.coins); g.ui.renderHotbar(p.inv); g.audio.sPickup();
      g.ui.toast(S.sold.replace("%i", name(id)).replace("%n", val));
      refresh();
    }));
  }
  // ---------------- the map ----------------
  paint(c, tx, ty, s, mini) {
    const C = E(), W = CFG.world;
    c.save();
    c.beginPath(); c.rect(tx(-W.square), ty(-W.square), 2 * W.square * s, 2 * W.square * s); c.clip();
    c.beginPath(); c.arc(tx(C.cx), ty(C.cz), C.mountainR * s, 0, Math.PI * 2); c.fillStyle = mini ? "rgba(122,98,70,.9)" : "#8a6f4e"; c.fill();
    c.beginPath(); c.arc(tx(C.cx), ty(C.cz), C.mountainR * 0.55 * s, 0, Math.PI * 2); c.fillStyle = mini ? "rgba(150,124,92,.9)" : "#a08360"; c.fill();
    const [lx, lz] = cityWorld(C.lake.a, 0);
    c.beginPath(); c.arc(tx(lx), ty(lz), C.lake.r * s, 0, Math.PI * 2); c.fillStyle = "rgba(94,122,128,.85)"; c.fill();
    // the castle: a golden square
    const K = C.castle, corners = [[K.a0, -K.hw], [K.a1, -K.hw], [K.a1, K.hw], [K.a0, K.hw]].map(([a, b]) => cityWorld(a, b));
    c.beginPath(); corners.forEach(([x, z], i) => (i ? c.lineTo(tx(x), ty(z)) : c.moveTo(tx(x), ty(z)))); c.closePath();
    c.fillStyle = "rgba(214,172,52,.95)"; c.fill(); c.strokeStyle = "rgba(58,50,38,.7)"; c.lineWidth = 1; c.stroke();
    c.restore();
  }
}

function flameCanvas() {
  const cv = document.createElement("canvas"); cv.width = 64; cv.height = 96;
  const c = cv.getContext("2d");
  const gr = c.createRadialGradient(32, 62, 4, 32, 58, 34);
  gr.addColorStop(0, "rgba(255,240,190,1)"); gr.addColorStop(0.35, "rgba(255,170,60,0.9)"); gr.addColorStop(0.7, "rgba(230,80,20,0.45)"); gr.addColorStop(1, "rgba(0,0,0,0)");
  c.fillStyle = gr; c.beginPath(); c.moveTo(32, 4); c.bezierCurveTo(50, 30, 58, 60, 32, 92); c.bezierCurveTo(6, 60, 14, 30, 32, 4); c.fill();
  return cv;
}

// the three Eternial weapons, built from gold and green stone (no generated model yet)
export function buildEternialWeapons(assets) {
  const gold = new THREE.MeshStandardMaterial({ color: 0xe0b230, metalness: 0.7, roughness: 0.28, emissive: 0x3a2a06 });
  const gem = new THREE.MeshStandardMaterial({ color: 0x2fdc5a, emissive: 0x1fbf46, emissiveIntensity: 1.2, roughness: 0.2 });
  const mk = (kind) => {
    const g = new THREE.Group();
    const add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => { const mm = new THREE.Mesh(geo, m); mm.position.set(x, y, z); mm.rotation.set(rx, ry, rz); g.add(mm); return mm; };
    if (kind === "dagger") {
      add(new THREE.CylinderGeometry(0.035, 0.045, 0.34, 8), gold, 0, 0, 0, 0, 0, Math.PI / 2);          // grip along x
      add(new THREE.ConeGeometry(0.06, 0.62, 4), gold, -0.5, 0, 0, 0, 0, Math.PI / 2).scale.set(1, 1, 0.35); // blade toward -x
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
  assets.glb.etdagger3d = mk("dagger");
  assets.glb.etsword3d = mk("sword");
  assets.glb.etspear3d = mk("spear");
}
