// update 29: DIRK'S FARM — the house (two floors, porch, balconies), the cow
// pasture with its auto gate and shed, the garden terrace with the fountain,
// the blueberry field and the crate. Pure geometry + world records; the game
// logic (Dirk, Duco, cows, shop) lives in farmgame.js.
//
// update 30: the second pass — the farm moved to the south-east corner (every
// coordinate here is relative to CFG.farm now), fresh Tripo models for the
// doors, the fountain, the king bed, a whole kitchen (tiled) and a whole
// bathroom (tiled, door off the landing), down-facing lamps that cannot leak
// through the floor, taps you can drink from, a living jet on the fountain.
//
// The house is laid out in the user's PLAN frame: u = plan-right, v = plan-down
// (the front). Plan-down faces WEST (toward the temple), plan-right faces south:
//   world x = house.x - v,   world z = house.z + u
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { CFG } from "./config.js";

const F = CFG.farm, H = F.house;
export const X = (v) => H.x - v;   // plan-front (v+) is world -x
export const Z = (u) => H.z + u;   // plan-right (u+) is world +z
export const toU = (z) => z - H.z;
export const toV = (x) => H.x - x;

// the rooms that got their own floors (update 30): plan-frame rectangles
const KITCHEN = { u0: -0.2, u1: H.hw, v0: -H.hd, v1: -1.4 };
const BATH = { u0: -H.hw, u1: -1.85, v0: -H.hd, v1: -0.36 };
// door openings (plan u along the front/back walls)
const FRONT_DOOR = { u0: -0.52, u1: 0.52 };
const BACK_DOOR = { u0: 5.72, u1: 6.88 };
const BATH_DOOR = { v0: -5.85, v1: -4.9 };   // update 30: off the landing at the top of the stairs
// update 31: the roof's shape is shared with the attic under it. The ridge runs along
// u (the long axis) and the rafters fall away toward +-v, so the head room lives in a
// strip down the middle — that is where the attic room and its hatch have to sit.
const ATTIC_Y = H.floor1 + H.wallH;          // attic floor = the first floor's ceiling
const KNEE_V = 1.9;                          // the knee walls, where the rafters come down
const HATCH = { u0: 0.35, u1: 1.65, v0: -1.25, v1: 0.2 };   // the hallway's free stretch
const ROOF = { eave: 0.5, ridgeY: ATTIC_Y + 2.55, eaveY: ATTIC_Y - 0.1, halfSpan: H.hd + 0.5 };
const roofYAt = (v) => ROOF.eaveY + (ROOF.ridgeY - ROOF.eaveY) * (1 - Math.min(1, Math.abs(v) / ROOF.halfSpan));
function inHatch(u, v) { return u > HATCH.u0 && u < HATCH.u1 && v > HATCH.v0 && v < HATCH.v1; }

// ---------- region tests (used by world.js, entities.js and farmgame.js) ----------
export function inFarm(x, z) { return Math.abs(x - F.x) < F.hw && Math.abs(z - F.z) < F.hd; }
export function inPasture(x, z, m = 0) {
  const P = F.pasture;
  return x > P.x0 - m && x < P.x1 + m && z > P.z0 - m && z < P.z1 + m;
}
export function inField(x, z, m = 0) {
  const B = F.field;
  return x > B.x0 - m && x < B.x1 + m && z > B.z0 - m && z < B.z1 + m;
}
// the house footprint incl. porch and balconies (hd runs along x, hw along z)
export function inHouse(x, z, pad = 0) {
  const u = toU(z), v = toV(x);
  return Math.abs(u) < H.hw + pad && v > -H.hd - F.balconyDepth - pad && v < H.hd + F.porchDepth + pad;
}
export function inHouseRooms(x, z) {
  const u = toU(z), v = toV(x);
  return Math.abs(u) < H.hw && Math.abs(v) < H.hd;
}
function inStairs(u, v) {
  const S = F.stairs;
  return u > S.u0 && u < S.u1 && v > S.vTop && v < S.vBot;
}
function inRect(u, v, R) { return u > R.u0 && u < R.u1 && v > R.v0 && v < R.v1; }
function inFrontBalcony(u, v) { return u > -7.2 && u < 6.9 && v >= H.hd && v < H.hd + F.balconyDepth; }
function inBackBalcony(u, v) { return u > -4.25 && u < 4.0 && v > -H.hd - F.balconyDepth && v <= -H.hd; }

// walkable-height candidates for the farm (called from World.groundHeight)
export function farmCands(x, z, cands) {
  if (!inFarm(x, z)) return;
  const u = toU(z), v = toV(x);
  const f0 = H.floor0, f1 = H.floor1;
  // the raised ground floor: rooms + the front porch
  if (Math.abs(u) <= H.hw && v >= -H.hd && v <= H.hd + F.porchDepth) cands.push(f0);
  // the back stoop outside the kitchen door
  if (u > BACK_DOOR.u0 - 0.5 && u < BACK_DOOR.u1 + 0.5 && v > -H.hd - 1.3 && v <= -H.hd) cands.push(f0);
  // the staircase: a clamped lerp from the living room up to the landing
  const S = F.stairs;
  if (inStairs(u, v)) {
    const t = (S.vBot - v) / (S.vBot - S.vTop);
    cands.push(f0 + (f1 - f0) * Math.min(1, Math.max(0, t)));
  }
  // the first floor: rooms minus the stairwell, plus the three balconies
  if (Math.abs(u) <= H.hw && Math.abs(v) <= H.hd && !inStairs(u, v)) cands.push(f1);
  if (inFrontBalcony(u, v) || inBackBalcony(u, v)) cands.push(f1);
  // update 31: the attic floor. The hatch is a real hole — step into it and you drop
  // back onto the landing, which is exactly what a hatch should do.
  if (Math.abs(u) <= H.hw && Math.abs(v) <= H.hd && !inHatch(u, v)) cands.push(ATTIC_Y);
}

// footstep surface inside the compound
export function farmSurface(x, z, y) {
  if (inHouse(x, z, 0.3) && y > H.floor0 - 0.2) {
    const u = toU(z), v = toV(x);
    // update 30: the tiled kitchen and bathroom ring like stone underfoot
    if (y < H.floor1 - 0.5 && inRect(u, v, KITCHEN)) return "stone";
    if (y >= H.floor1 - 0.5 && inRect(u, v, BATH)) return "stone";
    return "wood";
  }
  const T = F.terrace;
  if (x > T.x0 && x < T.x1 && z > T.z0 && z < T.z1) return "stone";
  return null;
}

// ---------- geometry helpers ----------
// a BoxGeometry whose UVs are scaled per face so a texture tiles at `tile`
// metres everywhere, no matter the box size (merged walls never stretch)
function uvBox(sx, sy, sz, tile) {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  const uv = g.attributes.uv;
  const dims = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]];
  for (let f = 0; f < 6; f++) {
    const [w, h] = dims[f];
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, uv.getX(k) * w / tile, uv.getY(k) * h / tile);
    }
  }
  return g;
}

export function buildFarm(world) {
  const scene = world.scene, rng = world.rng, A = world.assets;
  const mat = world.mat;
  const f0 = H.floor0, f1 = H.floor1, WH = H.wallH, T = H.T, top1 = f1 + WH;
  const ceil0 = f1 - 0.28;   // the ground floor's ceiling = the underside of the first-floor plate

  // ---- materials (one per surface, shared by every merged box) ----
  const M = {
    clap: mat("t_clapboard", 1, 1, 0xdcd8cc),
    paper: mat("t_wallpaper", 1, 1, 0xb8b096),
    floor: mat("t_floorboard", 1, 1, 0x8a6a44),
    slate: mat("t_slate", 1, 1, 0x4a4e52),
    dark: mat("t_darkwood", 1, 1, 0x3a2c1e),
    plank: mat("t_woodplank", 1, 1, 0x6e5636),
    stone: mat("t_romanstone", 1, 1, 0x7a766a),
    brick: mat("t_ruinbrick", 1, 1, 0x8a5a48),
    hedge: mat("t_hedge", 1, 1, 0x3d5a2e),
    // update 30: the kitchen and bathroom finishes
    wtile: mat("t_whitetile", 1, 1, 0xe6e6e2),
    cream: mat("t_cream", 1, 1, 0xefe6cf),
    trim: new THREE.MeshStandardMaterial({ color: 0x2f5a3a, roughness: 0.85 }),   // the green shutters and the tile border
    white: new THREE.MeshStandardMaterial({ color: 0xe8e4da, roughness: 0.9 }),
  };
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x9fb4c0, roughness: 0.15, metalness: 0.1,
    transparent: true, opacity: 0.28, side: THREE.DoubleSide });
  const geos = {};
  const pushBox = (key, cx, cy, cz, sx, sy, sz, tile = 2) => {
    const g = uvBox(sx, sy, sz, tile);
    g.translate(cx, cy, cz);
    (geos[key] = geos[key] || []).push(g);
  };
  const col = (x0, x1, y0, y1, z0, z1) => world.addBox(Math.min(x0, x1), Math.max(x0, x1), y0, y1, Math.min(z0, z1), Math.max(z0, z1));

  // glass pane + the thin collider that keeps you from walking through it
  const glass = (fixed, alongZ, a0, a1, y0, y1) => {
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(Math.abs(a1 - a0) - 0.04, y1 - y0 - 0.04), glassMat);
    pane.position.set(alongZ ? fixed : (a0 + a1) / 2, (y0 + y1) / 2, alongZ ? (a0 + a1) / 2 : fixed);
    if (alongZ) pane.rotation.y = Math.PI / 2;
    scene.add(pane);
    // cross bars: a window is four panes in a wooden frame
    const bw = Math.abs(a1 - a0), bh = y1 - y0;
    if (alongZ) {
      pushBox("trim", fixed, (y0 + y1) / 2, (a0 + a1) / 2, 0.06, bh, 0.05, 1);
      pushBox("trim", fixed, (y0 + y1) / 2, (a0 + a1) / 2, 0.06, 0.05, bw, 1);
      col(fixed - 0.06, fixed + 0.06, y0, y1, a0, a1);
    } else {
      pushBox("trim", (a0 + a1) / 2, (y0 + y1) / 2, fixed, 0.05, bh, 0.06, 1);
      pushBox("trim", (a0 + a1) / 2, (y0 + y1) / 2, fixed, bw, 0.05, 0.06, 1);
      col(a0, a1, y0, y1, fixed - 0.06, fixed + 0.06);
    }
  };

  // a wall run with door/window openings. `fixed` = the wall's world
  // coordinate on the thin axis; `alongZ` = the wall runs along world z.
  // layers = [{key, off0, off1}] across the thickness (exterior walls carry an
  // outer clapboard skin and an inner wallpaper skin). collide=false makes a
  // decorative skin (update 30: the tile and paint layers); opening kind
  // "hole" cuts without glass.
  const wallRun = ({ fixed, alongZ, a0, a1, y0, y1, T: th, openings = [], layers, tile = 2, collide = true }) => {
    const lo = Math.min(a0, a1), hi = Math.max(a0, a1);
    const solid = (s0, s1, yy0, yy1, doCol) => {
      if (s1 - s0 < 0.02 || yy1 - yy0 < 0.02) return;
      for (const L of layers) {
        const c = fixed + (L.off0 + L.off1) / 2, w = L.off1 - L.off0;
        if (alongZ) pushBox(L.key, c, (yy0 + yy1) / 2, (s0 + s1) / 2, w, yy1 - yy0, s1 - s0, L.tile || tile);
        else pushBox(L.key, (s0 + s1) / 2, (yy0 + yy1) / 2, c, s1 - s0, yy1 - yy0, w, L.tile || tile);
      }
      if (doCol && collide) {
        if (alongZ) col(fixed - th / 2, fixed + th / 2, yy0, yy1, s0, s1);
        else col(s0, s1, yy0, yy1, fixed - th / 2, fixed + th / 2);
      }
    };
    let parts = [[lo, hi]];
    const ops = openings.map((o) => ({ ...o, a0: Math.min(o.a0, o.a1), a1: Math.max(o.a0, o.a1) }))
      .filter((o) => o.a1 > lo && o.a0 < hi)
      .sort((p, q) => p.a0 - q.a0);
    for (const o of ops) {
      const next = [];
      for (const [s0, s1] of parts) {
        if (o.a1 <= s0 || o.a0 >= s1) { next.push([s0, s1]); continue; }
        if (o.a0 > s0) next.push([s0, o.a0]);
        if (o.a1 < s1) next.push([o.a1, s1]);
        const oa0 = Math.max(o.a0, s0), oa1 = Math.min(o.a1, s1);
        if (o.y1 < y1) solid(oa0, oa1, Math.max(o.y1, y0), y1, true);   // lintel
        if (o.y0 > y0) solid(oa0, oa1, y0, Math.min(o.y0, y1), true);   // sill
        if (o.kind === "window") glass(fixed, alongZ, o.a0, o.a1, o.y0, o.y1);
      }
      parts = next;
    }
    for (const [s0, s1] of parts) solid(s0, s1, y0, y1, true);
  };
  // exterior wall skins: inSign = +1 when the interior lies at the LARGER world coordinate
  const ext = (inSign) => inSign > 0
    ? [{ key: "clap", off0: -T / 2, off1: 0 }, { key: "paper", off0: 0, off1: T / 2 }]
    : [{ key: "paper", off0: -T / 2, off1: 0 }, { key: "clap", off0: 0, off1: T / 2 }];
  const TI = 0.15;
  const inner = [{ key: "paper", off0: -TI / 2, off1: TI / 2 }];
  // plan-frame wrappers: wallU runs along u at fixed v; wallV runs along v at fixed u
  const wallU = (v, u0, u1, y0, y1, th, layers, openings = [], collide = true) => wallRun({
    fixed: X(v), alongZ: true, a0: Z(u0), a1: Z(u1), y0, y1, T: th, layers, collide,
    openings: openings.map((o) => ({ a0: Z(o.a0), a1: Z(o.a1), y0: o.y0, y1: o.y1, kind: o.kind })),
  });
  const wallV = (u, v0, v1, y0, y1, th, layers, openings = [], collide = true) => wallRun({
    fixed: Z(u), alongZ: false, a0: X(v0), a1: X(v1), y0, y1, T: th, layers, collide,
    openings: openings.map((o) => ({ a0: X(o.a0), a1: X(o.a1), y0: o.y0, y1: o.y1, kind: o.kind })),
  });
  const win = (a0, a1, base) => ({ a0, a1, y0: base + 1.0, y1: base + 2.2, kind: "window" });
  const door = (a0, a1, base) => ({ a0, a1, y0: base, y1: base + 2.15, kind: "door" });
  const hole = (a0, a1, y0, y1) => ({ a0, a1, y0, y1, kind: "hole" });
  // a decorative skin layer (0.02 thick, no collider) — tiles, paint
  const skin = (key, tile) => [{ key, off0: -0.01, off1: 0.01, tile }];

  // ================= THE HOUSE =================
  // ---- exterior walls, ground floor (interior at: front +x, back -x, west +z, east -z) ----
  wallU(H.hd, -H.hw, H.hw, f0, f1, T, ext(+1), [door(FRONT_DOOR.u0, FRONT_DOOR.u1, f0), win(-5.5, -3.5, f0), win(2.5, 4.5, f0)]);   // front (west)
  wallU(-H.hd, -H.hw, H.hw, f0, f1, T, ext(-1), [door(BACK_DOOR.u0, BACK_DOOR.u1, f0), win(1.0, 3.0, f0), win(-6.5, -4.8, f0)]);   // back (east)
  wallV(-H.hw, -H.hd, H.hd, f0, f1, T, ext(+1), [win(3.8, 5.4, f0), win(-5.4, -3.9, f0)]);                        // north side (plan left)
  wallV(H.hw, -H.hd, H.hd, f0, f1, T, ext(-1), [win(-5.2, -3.4, f0), win(0.8, 2.8, f0)]);                         // south side (plan right)
  // ---- exterior walls, first floor ----
  wallU(H.hd, -H.hw, H.hw, f1, top1, T, ext(+1), [door(-6.1, -4.9, f1), door(3.4, 4.6, f1), win(-0.6, 0.6, f1), win(2.0, 3.0, f1), win(-3.9, -2.7, f1)]);
  wallU(-H.hd, -H.hw, H.hw, f1, top1, T, ext(-1), [door(-0.7, 0.7, f1), win(-6.8, -5.4, f1), win(5.5, 7.0, f1)]);
  wallV(-H.hw, -H.hd, H.hd, f1, top1, T, ext(+1), [win(-5.0, -3.5, f1), win(2.6, 4.2, f1)]);
  wallV(H.hw, -H.hd, H.hd, f1, top1, T, ext(-1), [win(2.4, 4.4, f1), win(-4.4, -3.0, f1)]);
  // ---- interior partitions: the kitchen (ground) and the four rooms (first floor) ----
  wallU(-1.4, -0.2, H.hw, f0, f1, TI, inner, [door(0.1, 1.5, f0)]);      // kitchen / living room
  wallV(-0.2, -H.hd, -1.4, f0, f1, TI, inner);                            // kitchen / stairs
  // update 30: the bathroom door sits beside the landing now (v -5.85..-4.9), not over the well
  wallV(-1.85, -H.hd, H.hd, f1, top1, TI, inner, [door(BATH_DOOR.v0, BATH_DOOR.v1, f1), door(0.4, 1.4, f1)]);   // hallway west side
  wallV(1.75, -H.hd, H.hd, f1, top1, TI, inner, [door(-4.3, -3.3, f1), door(0.4, 1.4, f1)]);    // hallway east side
  wallU(-0.36, -H.hw, -1.85, f1, top1, TI, inner);                        // bathroom / small bedroom
  wallU(-1.57, 1.75, H.hw, f1, top1, TI, inner);                          // hobby room / big bedroom

  // ---- update 30: the kitchen's tiles (1.4 m) with cream paint above, the bathroom's full tiles ----
  {
    const K = KITCHEN, tileH = f0 + 1.4;
    const WT = skin("wtile", 1.2), CR = skin("cream", 1.5);
    // back wall (v = -6): the room lies at smaller world x -> the skin sits just inside
    const backV = -H.hd + T / 2 + 0.01, southU = H.hw - T / 2 - 0.01, partV = -1.4 - TI / 2 - 0.01, partU = -0.2 + TI / 2 + 0.01;
    wallU(backV, K.u0, K.u1, f0, tileH, 0.02, WT, [hole(BACK_DOOR.u0, BACK_DOOR.u1, f0, tileH), hole(1.0, 3.0, f0 + 1.0, tileH)], false);
    wallU(backV, K.u0, K.u1, tileH, ceil0, 0.02, CR, [hole(BACK_DOOR.u0, BACK_DOOR.u1, tileH, f0 + 2.15), hole(1.0, 3.0, tileH, f0 + 2.2)], false);
    wallV(southU, K.v0, K.v1, f0, tileH, 0.02, WT, [hole(-5.2, -3.4, f0 + 1.0, tileH)], false);
    wallV(southU, K.v0, K.v1, tileH, ceil0, 0.02, CR, [hole(-5.2, -3.4, tileH, f0 + 2.2)], false);
    wallU(partV, K.u0, K.u1, f0, tileH, 0.02, WT, [hole(0.1, 1.5, f0, tileH)], false);
    wallU(partV, K.u0, K.u1, tileH, ceil0, 0.02, CR, [hole(0.1, 1.5, tileH, f0 + 2.15)], false);
    wallV(partU, K.v0, K.v1, f0, tileH, 0.02, WT, [], false);
    wallV(partU, K.v0, K.v1, tileH, ceil0, 0.02, CR, [], false);
    // a thin green border where the tiles meet the paint. update 31: it now STOPS at
    // both kitchen doorways — it used to run straight across the frames.
    const uBorder = (v, gaps) => {
      let segs = [[K.u0, K.u1]];
      for (const [g0, g1] of gaps) {
        const next = [];
        for (const [s0, s1] of segs) {
          if (g1 <= s0 || g0 >= s1) { next.push([s0, s1]); continue; }
          if (g0 > s0) next.push([s0, g0]);
          if (g1 < s1) next.push([g1, s1]);
        }
        segs = next;
      }
      for (const [s0, s1] of segs) if (s1 - s0 > 0.02) pushBox("trim", X(v), tileH, Z((s0 + s1) / 2), 0.02, 0.06, s1 - s0, 1);
    };
    uBorder(backV - 0.012, [[BACK_DOOR.u0 - 0.1, BACK_DOOR.u1 + 0.1]]);   // the back door
    uBorder(partV + 0.012, [[0.0, 1.6]]);                                  // the living-room door
    for (const [cx, cz, sx, sz] of [
      [X((K.v0 + K.v1) / 2), Z(southU + 0.012), K.v1 - K.v0, 0.02],
      [X((K.v0 + K.v1) / 2), Z(partU - 0.012), K.v1 - K.v0, 0.02],
    ]) pushBox("trim", cx, tileH, cz, sx, 0.06, sz, 1);
    // the checkerboard floor
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(K.v1 - K.v0, K.u1 - K.u0), mat("t_checker", (K.v1 - K.v0) / 2.1, (K.u1 - K.u0) / 2.1, 0xd8d8d0));
    fl.rotation.x = -Math.PI / 2;
    fl.position.set(X((K.v0 + K.v1) / 2), f0 + 0.012, Z((K.u0 + K.u1) / 2));
    scene.add(fl);
  }
  {
    const B = BATH, bord = f1 + 1.5;
    const WT = skin("wtile", 1.2);
    const westU = -H.hw + T / 2 + 0.01, backV = -H.hd + T / 2 + 0.01, hallU = -1.85 - TI / 2 - 0.01, bedV = -0.36 - TI / 2 - 0.01;
    wallV(westU, B.v0, B.v1, f1, top1, 0.02, WT, [hole(-5.0, -3.5, f1 + 1.0, f1 + 2.2)], false);
    wallU(backV, B.u0, B.u1, f1, top1, 0.02, WT, [hole(-6.8, -5.4, f1 + 1.0, f1 + 2.2)], false);
    wallV(hallU, B.v0, B.v1, f1, top1, 0.02, WT, [hole(BATH_DOOR.v0, BATH_DOOR.v1, f1, f1 + 2.15)], false);
    wallU(bedV, B.u0, B.u1, f1, top1, 0.02, WT, [], false);
    // the dark-green border line at 1.5 m, skipping the window and door cuts
    const border = (segments) => { for (const [cx, cz, sx, sz] of segments) pushBox("trim", cx, bord, cz, sx, 0.06, sz, 1); };
    border([
      [X((B.v0 + -5.0) / 2), Z(westU + 0.012), -5.0 - B.v0, 0.02], [X((-3.5 + B.v1) / 2), Z(westU + 0.012), B.v1 + 3.5, 0.02],
      [X(backV - 0.012), Z((B.u0 + -6.8) / 2), 0.02, -6.8 - B.u0], [X(backV - 0.012), Z((-5.4 + B.u1) / 2), 0.02, B.u1 + 5.4],
      [X((BATH_DOOR.v1 + B.v1) / 2), Z(hallU - 0.012), B.v1 - BATH_DOOR.v1, 0.02],
      [X(bedV + 0.012), Z((B.u0 + B.u1) / 2), 0.02, B.u1 - B.u0],
    ]);
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(B.v1 - B.v0, B.u1 - B.u0), mat("t_mosaic", (B.v1 - B.v0) / 1.6, (B.u1 - B.u0) / 1.6, 0xe0e0dc));
    fl.rotation.x = -Math.PI / 2;
    fl.position.set(X((B.v0 + B.v1) / 2), f1 + 0.012, Z((B.u0 + B.u1) / 2));
    scene.add(fl);
  }

  // ---- floors ----
  // ground plate (rooms), the porch and the back stoop — top face at floor0
  pushBox("floor", X(0), f0 - 0.14, Z(0), 2 * H.hd, 0.28, 2 * H.hw, 2);
  col(X(H.hd), X(-H.hd), f0 - 0.3, f0, Z(-H.hw), Z(H.hw));
  pushBox("plank", X(H.hd + F.porchDepth / 2), f0 - 0.14, Z(0), F.porchDepth, 0.28, 2 * H.hw, 1.5);
  col(X(H.hd + F.porchDepth), X(H.hd), f0 - 0.3, f0, Z(-H.hw), Z(H.hw));
  const stoopU = (BACK_DOOR.u0 + BACK_DOOR.u1) / 2;
  pushBox("plank", X(-H.hd - 0.65), f0 - 0.14, Z(stoopU), 1.3, 0.28, 2.2, 1.5);
  // stone foundation under everything raised
  pushBox("stone", X(0.9), f0 / 2 - 0.02, Z(0), 2 * H.hd + F.porchDepth + 0.2, f0 - 0.04, 2 * H.hw + 0.2, 1.5);
  pushBox("stone", X(-H.hd - 0.65), f0 / 2 - 0.02, Z(stoopU), 1.3, f0 - 0.04, 2.2, 1.5);
  // first-floor plate: strips around the stairwell hole
  const S = F.stairs;
  const plate1 = (u0, u1, v0, v1) => {
    pushBox("floor", X((v0 + v1) / 2), f1 - 0.14, Z((u0 + u1) / 2), Math.abs(v1 - v0), 0.28, u1 - u0, 2);
    col(X(v0), X(v1), f1 - 0.3, f1, Z(u0), Z(u1));
  };
  plate1(-H.hw, S.u0, -H.hd, H.hd);          // west of the well (plan left)
  plate1(S.u1, H.hw, -H.hd, H.hd);           // east of the well
  plate1(S.u0, S.u1, -H.hd, S.vTop);         // the landing behind the top step
  plate1(S.u0, S.u1, S.vBot, H.hd);          // in front of the bottom step
  // the three balconies (plank decks at floor1)
  const deck = (u0, u1, v0, v1) => {
    pushBox("plank", X((v0 + v1) / 2), f1 - 0.1, Z((u0 + u1) / 2), Math.abs(v1 - v0), 0.2, u1 - u0, 1.5);
    col(X(v0), X(v1), f1 - 0.22, f1, Z(u0), Z(u1));
  };
  deck(-7.2, 6.9, H.hd, H.hd + F.balconyDepth);          // front, over the porch
  deck(-4.25, 4.0, -H.hd - F.balconyDepth, -H.hd);       // back, over the terrace steps

  // ---- railings: posts + two rails, one collider strip per open edge ----
  const rail = (x0, z0, x1, z1, y, collide = true) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len / 1.2));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pushBox("dark", x0 + (x1 - x0) * t, y + 0.5, z0 + (z1 - z0) * t, 0.09, 1.0, 0.09, 1);
    }
    const along = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    for (const ry of [0.5, 0.95]) {
      if (along) pushBox("dark", (x0 + x1) / 2, y + ry, z0, len, 0.05, 0.06, 1);
      else pushBox("dark", x0, y + ry, (z0 + z1) / 2, 0.06, 0.05, len, 1);
    }
    if (collide) {
      if (along) col(x0, x1, y, y + 1.0, z0 - 0.06, z0 + 0.06);
      else col(x0 - 0.06, x0 + 0.06, y, y + 1.0, z0, z1);
    }
  };
  // porch railing (ground): the west edge with the centre-steps gap, ends open for the side steps
  const px = X(H.hd + F.porchDepth);
  rail(px, Z(-H.hw), px, Z(-1.2), f0);
  rail(px, Z(1.2), px, Z(H.hw), f0);
  // porch posts hold the balcony up
  for (const u of [-7.35, -1.3, 1.3, 7.35]) pushBox("dark", px + 0.12, (f0 + f1) / 2, Z(u), 0.16, f1 - f0, 0.16, 1);
  // front balcony railing: west edge + both ends
  const bx = X(H.hd + F.balconyDepth);
  rail(bx, Z(-7.2), bx, Z(6.9), f1);
  rail(bx, Z(-7.2), X(H.hd), Z(-7.2), f1);
  rail(bx, Z(6.9), X(H.hd), Z(6.9), f1);
  // back balcony railing: east edge + both ends, and two posts to the terrace
  const bbx = X(-H.hd - F.balconyDepth);
  rail(bbx, Z(-4.25), bbx, Z(4.0), f1);
  rail(X(-H.hd), Z(-4.25), bbx, Z(-4.25), f1);
  rail(X(-H.hd), Z(4.0), bbx, Z(4.0), f1);
  for (const u of [-4.1, 3.85]) pushBox("dark", bbx - 0.12, f1 / 2, Z(u), 0.16, f1, 0.16, 1);

  // ---- steps (visual; the 0.45 rise is a step-over) ----
  const stepPair = (cx0, cx1, cz0, cz1, alongX) => {
    // two treads: half height then full height, from the ground up to the deck
    if (alongX) {
      const mid = (cx0 + cx1) / 2;
      pushBox("plank", (cx0 + mid) / 2, f0 / 4, (cz0 + cz1) / 2, mid - cx0, f0 / 2, cz1 - cz0, 1.5);
      pushBox("plank", (mid + cx1) / 2, f0 / 2, (cz0 + cz1) / 2, cx1 - mid, f0, cz1 - cz0, 1.5);
    } else {
      const mid = (cz0 + cz1) / 2;
      pushBox("plank", (cx0 + cx1) / 2, f0 / 4, (cz0 + mid) / 2, cx1 - cx0, f0 / 2, mid - cz0, 1.5);
      pushBox("plank", (cx0 + cx1) / 2, f0 / 2, (mid + cz1) / 2, cx1 - cx0, f0, cz1 - mid, 1.5);
    }
  };
  // centre steps: the half tread lies furthest from the deck (west), the full tread against it
  stepPair(px - 0.9, px, Z(-1.2), Z(1.2), true);
  // side steps at both porch ends, spanning the porch depth only
  stepPair(px, X(H.hd), Z(-H.hw) - 0.9, Z(-H.hw), false);                 // north end (half tread outermost)
  pushBox("plank", (px + X(H.hd)) / 2, f0 / 2, Z(H.hw) + 0.225, X(H.hd) - px, f0, 0.45, 1.5);       // south end: full tread against the deck
  pushBox("plank", (px + X(H.hd)) / 2, f0 / 4, Z(H.hw) + 0.675, X(H.hd) - px, f0 / 2, 0.45, 1.5);   // ...then the half tread
  pushBox("plank", X(-H.hd - 1.3) + 0.25, f0 / 4, Z(stoopU), 0.5, f0 / 2, 2.2, 1.5);   // back stoop step

  // ---- the staircase ----
  {
    const steps = 14, rise = (f1 - f0) / steps, run = (S.vBot - S.vTop) / steps;
    const uc = (S.u0 + S.u1) / 2, uw = S.u1 - S.u0;
    for (let i = 0; i < steps; i++) {
      const v = S.vBot - (i + 0.5) * run;
      const y = f0 + (i + 1) * rise;
      pushBox("dark", X(v), y - 0.03, Z(uc), run, 0.06, uw, 1);                    // tread
      pushBox("dark", X(v + run / 2) + 0.0, y - rise / 2 - 0.03, Z(uc), 0.04, rise, uw, 1); // riser
    }
    // handrail + balusters on the open (living-room) side, colliders stepping up the slope
    const uo = S.u0 - 0.03;
    for (let i = 0; i <= 8; i++) {
      const v = S.vBot - (i / 8) * (S.vBot - S.vTop);
      const y = f0 + (f1 - f0) * (i / 8);
      pushBox("dark", X(v), y + 0.45, Z(uo), 0.06, 0.9, 0.06, 1);
      if (i < 8) {
        const v2 = S.vBot - ((i + 1) / 8) * (S.vBot - S.vTop);
        col(X(v), X(v2), y, y + 0.95, Z(uo) - 0.06, Z(uo) + 0.06);
      }
    }
    const rl = Math.hypot(S.vBot - S.vTop, f1 - f0);
    const railG = uvBox(rl, 0.06, 0.07, 1);
    railG.rotateZ(Math.atan2(f1 - f0, S.vBot - S.vTop));
    railG.translate(X((S.vBot + S.vTop) / 2), (f0 + f1) / 2 + 0.92, Z(uo));
    (geos.dark = geos.dark || []).push(railG);
    // the stairwell guard on the first floor: along the well's hallway side and its foot
    rail(X(S.vBot), Z(S.u1) + 0.03, X(S.vTop), Z(S.u1) + 0.03, f1);
    rail(X(S.vBot) + 0.03, Z(S.u0), X(S.vBot) + 0.03, Z(S.u1), f1);
  }

  // ---- roof: two slate slabs on a ridge along the long axis, gables front and back ----
  {
    const eave = ROOF.eave, ridgeY = ROOF.ridgeY, eaveY = ROOF.eaveY;
    const halfSpan = ROOF.halfSpan, rise = ridgeY - eaveY;
    const L = Math.hypot(halfSpan, rise), ang = Math.atan2(rise, halfSpan);
    const slabLen = 2 * H.hw + 1.2;
    for (const side of [1, -1]) {
      const g = uvBox(L, 0.2, slabLen, 2);
      g.rotateZ(side * ang);
      g.translate(H.x - side * halfSpan / 2, (ridgeY + eaveY) / 2, H.z);
      (geos.slate = geos.slate || []).push(g);
    }
    pushBox("dark", H.x, ridgeY + 0.05, H.z, 0.3, 0.22, slabLen + 0.2, 1);   // ridge beam
    // gables: triangles closing the roof at both short ends. update 31: each one
    // carries a small window, so the attic behind them is not a black box by day.
    for (const u of [-H.hw, H.hw]) {
      const sh = new THREE.Shape();
      sh.moveTo(X(H.hd), top1); sh.lineTo(X(-H.hd), top1); sh.lineTo(H.x, ridgeY); sh.closePath();
      const gw = 0.45, gy0 = ATTIC_Y + 0.8, gy1 = ATTIC_Y + 1.65;
      const gap = new THREE.Path();
      gap.moveTo(H.x - gw, gy0); gap.lineTo(H.x + gw, gy0);
      gap.lineTo(H.x + gw, gy1); gap.lineTo(H.x - gw, gy1); gap.closePath();
      sh.holes.push(gap);
      const gm = new THREE.Mesh(new THREE.ShapeGeometry(sh), M.clap.clone());
      gm.material.side = THREE.DoubleSide;
      gm.position.z = Z(u);
      scene.add(gm);
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(2 * gw, gy1 - gy0), glassMat);
      pane.position.set(H.x, (gy0 + gy1) / 2, Z(u));
      scene.add(pane);
      const sgn = u > 0 ? 1 : -1, gz = Z(u) + sgn * 0.045;
      pushBox("trim", H.x, (gy0 + gy1) / 2, gz, 0.05, gy1 - gy0, 0.05, 1);          // glazing bars
      pushBox("trim", H.x, (gy0 + gy1) / 2, gz, 2 * gw, 0.05, 0.05, 1);
      for (const gy of [gy0 - 0.05, gy1 + 0.05]) pushBox("white", H.x, gy, gz, 2 * gw + 0.2, 0.1, 0.1, 1);
      for (const gx of [H.x - gw - 0.05, H.x + gw + 0.05]) pushBox("white", gx, (gy0 + gy1) / 2, gz, 0.1, gy1 - gy0 + 0.2, 0.1, 1);
    }
    pushBox("brick", X(5.5), top1 + 1.7, Z(-5.0), 0.9, 3.2, 0.9, 1);   // chimney
    // eaves boards along the long sides
    for (const v of [H.hd + eave, -H.hd - eave]) pushBox("dark", X(v), eaveY - 0.12, H.z, 0.12, 0.24, slabLen, 1);
  }

  // ---- shutters beside every ground and first-floor window (the green pair) ----
  const shutters = (fixed, alongZ, a0, a1, base) => {
    const w = 0.42, h = 1.3;
    for (const a of [a0 - w / 2 - 0.04, a1 + w / 2 + 0.04]) {
      if (alongZ) pushBox("trim", fixed + (fixed < H.x ? -T / 2 - 0.03 : T / 2 + 0.03), base + 1.6, a, 0.05, h, w, 1);
      else pushBox("trim", a, base + 1.6, fixed + (fixed < H.z ? -T / 2 - 0.03 : T / 2 + 0.03), w, h, 0.05, 1);
    }
  };
  for (const [u0, u1, base] of [[-5.5, -3.5, f0], [2.5, 4.5, f0], [-0.6, 0.6, f1], [2.0, 3.0, f1], [-3.9, -2.7, f1]]) shutters(X(H.hd), true, Z(u0), Z(u1), base);
  for (const [u0, u1, base] of [[1.0, 3.0, f0], [-6.5, -4.8, f0], [-6.8, -5.4, f1], [5.5, 7.0, f1]]) shutters(X(-H.hd), true, Z(u0), Z(u1), base);
  for (const [v0, v1, base] of [[3.8, 5.4, f0], [-5.4, -3.9, f0], [-5.0, -3.5, f1], [2.6, 4.2, f1]]) shutters(Z(-H.hw), false, X(v1), X(v0), base);
  for (const [v0, v1, base] of [[-5.2, -3.4, f0], [0.8, 2.8, f0], [2.4, 4.4, f1], [-4.4, -3.0, f1]]) shutters(Z(H.hw), false, X(v1), X(v0), base);

  // ---- doors (update 31) ----
  // The update-30 doors arrived as one model, door and frame together, and the leaf
  // had to be cut out of it by sorting triangles — which left every leaf with torn
  // edges the moment it swung open. Now the leaf is generated ON ITS OWN and never
  // cut, and the casing around the opening is built here out of trim.
  const casing = (fixed, alongZ, a0, a1, y0, y1, th) => {
    const lo = Math.min(a0, a1), hi = Math.max(a0, a1), W = 0.09, D = th + 0.07;
    const cy = (y0 + y1) / 2 + W / 2, sy = y1 - y0 + W;
    if (alongZ) {
      pushBox("white", fixed, cy, lo - W / 2, D, sy, W, 1);                     // jambs
      pushBox("white", fixed, cy, hi + W / 2, D, sy, W, 1);
      pushBox("white", fixed, y1 + W / 2, (lo + hi) / 2, D, W, hi - lo, 1);     // head
      pushBox("white", fixed, (y0 + y1) / 2, lo - 0.02, th - 0.02, y1 - y0, 0.05, 1);   // reveal
      pushBox("white", fixed, (y0 + y1) / 2, hi + 0.02, th - 0.02, y1 - y0, 0.05, 1);
    } else {
      pushBox("white", lo - W / 2, cy, fixed, W, sy, D, 1);
      pushBox("white", hi + W / 2, cy, fixed, W, sy, D, 1);
      pushBox("white", (lo + hi) / 2, y1 + W / 2, fixed, hi - lo, W, D, 1);
      pushBox("white", lo - 0.02, (y0 + y1) / 2, fixed, 0.05, y1 - y0, th - 0.02, 1);
      pushBox("white", hi + 0.02, (y0 + y1) / 2, fixed, 0.05, y1 - y0, th - 0.02, 1);
    }
  };
  // A lifted door brings its knob and letter plate as a spindle straight through the
  // leaf — the photograph gives the mesher no depth for them, so it extrudes. Measure
  // the leaf's own plane, drop every triangle that sits clear of it, and remember how
  // thick the slab really is. Runs once per asset; the leaves share their geometry.
  const deSpindle = (asset) => {
    if (asset.__leaf) return asset.__leaf;
    asset.model.updateMatrixWorld(true);
    let half = 0.05, clipped = false;
    asset.model.traverse((o) => {
      if (!o.isMesh || !o.geometry.index) return;
      const g = o.geometry, pos = g.attributes.position, idx = g.index;
      const v = new THREE.Vector3(), zs = new Float64Array(pos.count);
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
        zs[i] = v.z; if (v.z < lo) lo = v.z; if (v.z > hi) hi = v.z;
      }
      const mid = (lo + hi) / 2;
      const dev = Array.from(zs, (t) => Math.abs(t - mid)).sort((a, b) => a - b);
      const p90 = dev[Math.floor(dev.length * 0.9)];
      half = Math.max(0.01, p90);
      const lim = p90 * 1.35;
      if (dev[dev.length - 1] <= lim * 1.15) return;      // nothing sticks out
      const keep = [];
      for (let t = 0; t < idx.count; t += 3) {
        const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2);
        if (Math.min(Math.abs(zs[a] - mid), Math.abs(zs[b] - mid), Math.abs(zs[c] - mid)) > lim) continue;
        keep.push(a, b, c);
      }
      if (keep.length > 30) { g.setIndex(keep); g.computeBoundingSphere(); clipped = true; }
    });
    asset.__leaf = { half, clipped };
    return asset.__leaf;
  };
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xc09434, roughness: 0.3, metalness: 0.85 });
  // the leaf: scaled to the opening, hung on one edge so it swings about it
  const mountLeaf = (asset, x, z, y, yaw, W, Hgt, hinge) => {
    const parent = new THREE.Group();
    parent.position.set(x, y, z);
    parent.rotation.y = yaw;
    const doorGrp = new THREE.Group();
    let leaf, sc = null, cut = null;
    if (asset) {
      cut = deSpindle(asset);
      leaf = asset.model.clone();
      const b = new THREE.Box3().setFromObject(leaf);
      const s = new THREE.Vector3(); b.getSize(s);
      const kx = (W - 0.05) / Math.max(0.01, s.x);
      // the slab is thinned to a door's 7 cm however chunky the lift made it
      sc = new THREE.Vector3(kx, (Hgt - 0.03) / Math.max(0.01, s.y), Math.min(kx, 0.035 / cut.half));
      leaf.scale.copy(sc);
    } else {
      leaf = new THREE.Group();
      const panel = new THREE.Mesh(new THREE.BoxGeometry(W - 0.05, Hgt - 0.03, 0.06), M.trim);
      panel.position.y = (Hgt - 0.03) / 2;
      leaf.add(panel);
    }
    const hx = hinge * (W / 2 - 0.03);
    leaf.position.x = -hx;
    doorGrp.position.set(hx, 0, 0);
    doorGrp.add(leaf);
    // a knob where the clipped spindle used to be: on the free edge, at hand height
    if (cut && cut.clipped) {
      const kr = 0.037, kz = cut.half * sc.z + kr * 0.5;
      for (const side of [1, -1]) {
        const kn = new THREE.Mesh(new THREE.SphereGeometry(kr, 14, 10), brassMat);
        kn.position.set(-hx - hinge * (W * 0.34), Hgt * 0.46, side * kz);
        kn.scale.z = 0.72;
        doorGrp.add(kn);
      }
    }
    parent.add(doorGrp);
    scene.add(parent);
    return doorGrp;
  };
  const doorRec = (grp, x, z, y, boxRef) => ({ grp, open: false, x, z, y, boxRef, closedBox: Object.assign({}, boxRef) });
  world.farmDoors = [];
  {
    const DH = 2.15;
    // front door: in the west wall (fixed x), the leaf's width runs along z; its face looks at the porch (-x)
    const fx = X(H.hd), fz = Z((FRONT_DOOR.u0 + FRONT_DOOR.u1) / 2), fw = Z(FRONT_DOOR.u1) - Z(FRONT_DOOR.u0);
    casing(fx, true, Z(FRONT_DOOR.u0), Z(FRONT_DOOR.u1), f0, f0 + DH, T);
    const g = mountLeaf(A.glb.leaf_front, fx, fz, f0, -Math.PI / 2, fw, DH, -1);
    col(fx - 0.12, fx + 0.12, f0, f0 + DH, Z(FRONT_DOOR.u0), Z(FRONT_DOOR.u1));
    world.farmDoor = doorRec(g, fx, fz, f0, world.boxes[world.boxes.length - 1]);
    world.farmDoors.push(world.farmDoor);
    // kitchen back door: in the east wall, its glazed face toward the backyard (+x)
    const kx = X(-H.hd), kz = Z(stoopU), kw = Z(BACK_DOOR.u1) - Z(BACK_DOOR.u0);
    casing(kx, true, Z(BACK_DOOR.u0), Z(BACK_DOOR.u1), f0, f0 + DH, T);
    const g2 = mountLeaf(A.glb.leaf_back, kx, kz, f0, Math.PI / 2, kw, DH, -1);
    col(kx - 0.12, kx + 0.12, f0, f0 + DH, Z(BACK_DOOR.u0), Z(BACK_DOOR.u1));
    world.farmBackDoor = doorRec(g2, kx, kz, f0, world.boxes[world.boxes.length - 1]);
    world.farmDoors.push(world.farmBackDoor);
    // update 31: the three balcony doorways were open holes — each gets a glazed
    // French door now (two off the bedrooms in front, one off the hallway at the back)
    for (const [v, u0, u1, yaw] of [[H.hd, -6.1, -4.9, -Math.PI / 2], [H.hd, 3.4, 4.6, -Math.PI / 2], [-H.hd, -0.7, 0.7, Math.PI / 2]]) {
      const bx = X(v), bz = Z((u0 + u1) / 2), bw = Z(u1) - Z(u0);
      casing(bx, true, Z(u0), Z(u1), f1, f1 + DH, T);
      const gb = mountLeaf(A.glb.leaf_balc, bx, bz, f1, yaw, bw, DH, -1);
      col(bx - 0.12, bx + 0.12, f1, f1 + DH, Z(u0), Z(u1));
      world.farmDoors.push(doorRec(gb, bx, bz, f1, world.boxes[world.boxes.length - 1]));
    }
  }

  // ---- furniture: generated GLBs with hand-typed colliders (update 29 set) ----
  const place = (id, u, v, y, yaw, hu, hv, h, fallback) => {
    const asset = A.glb[id];
    let m = null;
    if (asset) {
      m = asset.model.clone();
      m.position.set(X(v), y, Z(u));
      m.rotation.y = yaw;
      scene.add(m);
    } else if (fallback) {
      m = fallback();
      m.position.set(X(v), y, Z(u));
      m.rotation.y = yaw;
      scene.add(m);
    }
    if (hu > 0 && hv > 0) col(X(v) - hv, X(v) + hv, y, y + h, Z(u) - hu, Z(u) + hu);
    return m;
  };
  const blockFallback = (sx, sy, sz, color) => () => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), new THREE.MeshStandardMaterial({ color, roughness: 1 }));
    m.position.y = sy / 2;
    const g = new THREE.Group(); g.add(m); return g;
  };
  // update 30: fitted placement — the model is scaled to the sizes you ask for
  // (w = its width along its own left-right axis, d = its depth, h = its height;
  // one value scales uniformly, more values scale per axis) and the collider is
  // read off the placed model's bounding box unless `nocol` or a manual `col`.
  const placeFit = (id, u, v, y, yaw, o = {}) => {
    const asset = A.glb[id];
    let m;
    if (asset) m = asset.model.clone();
    else m = blockFallback(o.w || 0.6, o.h || 0.8, o.d || o.w || 0.6, o.color || 0x6a5a48)();
    if (asset) {
      const box = new THREE.Box3().setFromObject(m);
      const sz = new THREE.Vector3(); box.getSize(sz);
      const base = o.w ? o.w / Math.max(0.01, sz.x) : o.h ? o.h / Math.max(0.01, sz.y) : o.d ? o.d / Math.max(0.01, sz.z) : 1;
      m.scale.set(base, base, base);
      if (o.w && o.h) m.scale.y = o.h / Math.max(0.01, sz.y);
      if ((o.w || o.h) && o.d) m.scale.z = o.d / Math.max(0.01, sz.z);
      if (o.h && !o.w && o.d) m.scale.x = base;
    }
    m.position.set(X(v), y, Z(u));
    m.rotation.y = yaw;
    scene.add(m);
    if (!o.nocol) {
      if (o.col) col(X(v) - o.col[1], X(v) + o.col[1], y, y + (o.col[2] || 1), Z(u) - o.col[0], Z(u) + o.col[0]);
      else {
        m.updateMatrixWorld(true);
        const wb = new THREE.Box3().setFromObject(m);
        const pad = 0.03;
        if (wb.max.x - wb.min.x > 2 * pad && wb.max.z - wb.min.z > 2 * pad)
          col(wb.min.x + pad, wb.max.x - pad, y, Math.min(wb.max.y, y + 2.2), wb.min.z + pad, wb.max.z - pad);
      }
    }
    return m;
  };
  // yaw notes: models face their photo's front along +z after normalizeModel;
  // "facing +u" = toward world +z (yaw 0), "facing -u" = yaw PI, "facing +v"
  // (toward the porch, world -x) = yaw PI/2... no: rotation.y = t maps local +z
  // to world (sin t, 0, cos t), so facing -x is -PI/2 and facing +x is +PI/2.
  const faceU = 0, faceNegU = Math.PI, faceV = -Math.PI / 2, faceNegV = Math.PI / 2;

  // living room
  world.farmClockPos = { x: X(-5.55), z: Z(-3.3), y: f0 };
  const clockModel = place("clock", -3.3, -5.55, f0, faceV, 0.38, 0.32, 2.2, blockFallback(0.6, 2.1, 0.5, 0x3a2418));
  // update 32: the mat became a proper bolster bed — a padded rim all the way
  // round a sunken quilted cushion, instead of the flat disc that read as cheese
  const matModel = place("dogmat2", F.dogMat.u, F.dogMat.v, f0 + 0.01, 0, 0, 0, 0, null);
  if (!matModel) {
    const mm = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.85, 0.12, 20), new THREE.MeshStandardMaterial({ color: 0x8a5a3a, roughness: 1 }));
    mm.position.set(X(F.dogMat.v), f0 + 0.06, Z(F.dogMat.u));
    scene.add(mm);
  }
  world.dogMat = { x: X(F.dogMat.v), z: Z(F.dogMat.u), y: f0 };
  // update 32: Duco's blueberry. A TOY, not an item — it never reaches your
  // inventory, and it belongs to the farm: carry it off the property and it
  // leaves your hands and goes back to the spot it started from.
  {
    const tu = F.dogMat.u + 0.9, tv = F.dogMat.v - 0.15;
    const toy = A.glb.bplush ? A.glb.bplush.model.clone()
      : new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 10), new THREE.MeshStandardMaterial({ color: 0x4a4a8a, roughness: 0.95 }));
    toy.position.set(X(tv), f0, Z(tu));
    scene.add(toy);
    world.farmToy = { mesh: toy, home: { x: X(tv), y: f0, z: Z(tu) },
      state: "rest", vel: new THREE.Vector3(), spin: 0 };
  }
  place("tvset", -6.9, 1.1, f0, faceU, 0.48, 0.75, 1.05, blockFallback(1.4, 1.0, 0.6, 0x3a2c1e));
  place("sidetable", -5.0, 0.4, f0, 0, 0.35, 0.35, 0.62, blockFallback(0.6, 0.6, 0.6, 0x4a3520));
  world.farmSeats = [];
  // update 32: the sofa reads small for the room, so it grew 15% (its scale in
  // config, with the collider following), and it gained a matching armchair
  // across the rug — a second place to actually sit, not just scenery.
  place("sofa", -3.05, 1.2, f0, faceNegU, 0.58, 1.32, 1.04, blockFallback(1.0, 1.05, 2.5, 0x2f4a30));
  {
    const au = -5.0, av = 3.1;
    place("armchair", au, av, f0, faceNegV, 0.42, 0.42, 1.0, blockFallback(0.8, 1.0, 0.8, 0x2f4a30));
    // seated, you look back across the rug — the chair's own yaw turned around
    world.farmSeats.push({ x: X(av), z: Z(au), y: f0, yaw: faceNegV + Math.PI, regen: CFG.sit.regen, cap: CFG.sit.cap, kind: "chair" });   // update 33: its own prompt
  }
  place("dinetable", 4.7, 2.2, f0, 0, 0.55, 1.25, 0.82, blockFallback(2.4, 0.8, 1.0, 0x5a4020));
  for (const [u, v, yaw, pyaw] of [[3.7, 1.4, faceU, Math.PI], [3.7, 3.0, faceU, Math.PI], [5.7, 1.4, faceNegU, 0], [5.7, 3.0, faceNegU, 0]]) {
    place("dinechair", u, v, f0, yaw, 0.28, 0.28, 1.0, blockFallback(0.5, 1.0, 0.5, 0x5a4020));
    world.farmSeats.push({ x: X(v), z: Z(u), y: f0, yaw: pyaw, regen: CFG.sit.regen, cap: CFG.sit.cap });
  }
  // the rug under the sofa corner
  const rugMat = mat("t_rug", 1, 1, 0x6a2a2a);
  {
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.4), rugMat);
    rug.rotation.x = -Math.PI / 2; rug.rotation.z = Math.PI / 2;
    rug.position.set(X(1.0), f0 + 0.012, Z(-5.0));
    scene.add(rug);
  }

  // ---- update 30: THE KITCHEN — every piece generated for this house ----
  // plan: u -0.2..7.5 (along z), v -6..-1.4 (along x). Back wall v=-6 (east), south wall u=7.5,
  // the partition to the living room at v=-1.4 with its door at u 0.1..1.5.
  world.farmTaps = [];
  {
    const K = KITCHEN;
    // the range on the south wall, right of the window; the fridge and the sink along the back wall
    const stove = placeFit("k_range", 7.05, -2.3, f0, faceNegU, { w: 1.3, d: 0.75, h: 1.55 });
    world.farmStove = { x: X(-2.3 + 0.35), z: Z(6.5), y: f0, mesh: stove };
    placeFit("k_counter", 7.06, -4.3, f0, faceNegU, { w: 2.0, d: 0.65, h: 0.9 });
    placeFit("k_basket", 7.0, -3.75, f0 + 0.9, faceNegU, { w: 0.45, nocol: true });
    placeFit("k_sink", 2.0, -5.45, f0, faceV, { w: 1.0, d: 0.8, h: 1.15 });
    world.farmTaps.push({ x: X(-5.0), z: Z(2.0), y: f0 });
    placeFit("fridge2", 0.5, -5.45, f0, faceV, { w: 0.92, d: 0.78, h: 1.72 });   // update 31: monitor-top refrigerator
    world.farmFridge = { x: X(-4.95), z: Z(0.5), y: f0 };
    placeFit("k_shelf", 4.4, -5.7, f0 + 1.45, faceV, { w: 1.0, nocol: true });
    placeFit("k_hutch", 3.6, -1.735, f0, faceNegV, { w: 1.4, d: 0.5, h: 2.0 });
    placeFit("k_herbs", 5.6, -1.575, f0 + 1.55, faceNegV, { w: 1.0, nocol: true });
    // the table in the middle, a chair either side (you can sit here too)
    placeFit("k_table", 4.4, -3.8, f0, faceNegV, { w: 1.6, d: 0.95, h: 0.78 });
    for (const [u, v, yaw, pyaw] of [[4.4, -4.75, faceV, Math.PI / 2], [4.4, -2.85, faceNegV, -Math.PI / 2]]) {
      placeFit("k_chair", u, v, f0, yaw, { h: 1.0 });
      world.farmSeats.push({ x: X(v), z: Z(u), y: f0, yaw: pyaw, regen: CFG.sit.regen, cap: CFG.sit.cap });
    }
    // the pot rack hangs from the ceiling over the table
    const rackH = 1.16;
    placeFit("k_potrack", 4.4, -3.8, ceil0 - rackH, faceNegV, { w: 1.2, h: rackH, nocol: true });
    void K;
  }

  // the lamps (update 30): every indoor light is a SPOT pointing DOWN — a point
  // light in a house with no shadows shone straight through the floor and lit
  // the hallway's walls from below. A cone that opens downward cannot.
  const lampY = f1 - 0.55;
  const spotDown = (x, y, z, color, intensity, dist, angle) => {
    const s = new THREE.SpotLight(color, intensity, dist, angle, 0.55, 2);
    s.position.set(x, y, z);
    s.target.position.set(x, y - 2, z);
    scene.add(s, s.target);
    return s;
  };
  {
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 5), new THREE.MeshStandardMaterial({ color: 0x1c1a16, roughness: 1 }));
    cord.position.set(X(2.0), f1 - 0.28, Z(0.6));
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.26, 12), new THREE.MeshStandardMaterial({ color: 0x2e3134, roughness: 0.7, metalness: 0.4 }));
    shade.position.set(X(2.0), lampY + 0.12, Z(0.6));
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffe0a0, emissive: 0xffc060, emissiveIntensity: 2.2 }));
    bulb.position.set(X(2.0), lampY, Z(0.6));
    scene.add(cord, shade, bulb);
    const light = spotDown(X(2.0), lampY - 0.05, Z(0.6), 0xe8b060, 28, 7.5, 1.25);
    // a second, softer cone over the kitchen table — the tiled room was pitch black
    const kLight = spotDown(X(-3.8), ceil0 - 0.3, Z(4.4), 0xe8c080, 14, 4.5, 1.2);
    // upstairs: the generated brass pendant over the hallway, its own down-cone.
    // update 31: its glass globe is an ordinary opaque material, so from outside the
    // fixture looked dead while the floor under it was lit. Find the globe (the
    // widest band of the model) and sleeve it in a glowing shell — the lamp burns now.
    const hallH = 0.8, hallY = top1 - hallH - 0.02;
    const hall = placeFit("hall_lamp", 0.8, -3.0, hallY, 0, { h: hallH, nocol: true });
    let gY = hallY + 0.22, gR = 0.12;
    if (hall) {
      hall.updateMatrixWorld(true);
      const NB = 24, br = new Float32Array(NB);
      const hb = new THREE.Box3().setFromObject(hall);
      const h0 = hb.min.y, hH = Math.max(0.01, hb.max.y - hb.min.y);
      const cxh = X(-3.0), czh = Z(0.8), vv = new THREE.Vector3();
      hall.traverse((o) => {
        if (!o.isMesh) return;
        const pa = o.geometry.attributes.position;
        for (let i = 0; i < pa.count; i++) {
          vv.fromBufferAttribute(pa, i).applyMatrix4(o.matrixWorld);
          const k = Math.min(NB - 1, Math.max(0, Math.floor(((vv.y - h0) / hH) * NB)));
          const rr = Math.hypot(vv.x - cxh, vv.z - czh);
          if (rr > br[k]) br[k] = rr;
        }
      });
      let bk = 0;
      for (let k = 0; k < NB; k++) if (br[k] > br[bk]) bk = k;
      if (br[bk] > 0.04) { gR = br[bk]; gY = h0 + ((bk + 0.5) / NB) * hH; }
    }
    const hallBulb = new THREE.Mesh(new THREE.SphereGeometry(gR * 1.05, 20, 14),
      new THREE.MeshStandardMaterial({ color: 0xfff4dc, emissive: 0xffe2ac, emissiveIntensity: 2.0, roughness: 0.35 }));
    hallBulb.position.set(X(-3.0), gY, Z(0.8));
    scene.add(hallBulb);
    const hLight = spotDown(X(-3.0), gY - 0.06, Z(0.8), 0xe8c080, 22, 2.6, 1.15);
    void hall;
    const porch = new THREE.PointLight(0xd89a4a, 10, 14, 2);
    porch.position.set(X(H.hd + 0.9), f0 + 2.6, Z(1.3));
    scene.add(porch);
    const lantern = A.glb.lantern ? A.glb.lantern.model.clone() : null;
    if (lantern) { lantern.position.set(X(H.hd + 0.35), f0 + 2.3, Z(1.3)); scene.add(lantern); }
    world.farmLights = { living: light, kitchen: kLight, hall: hLight, porch, bulbs: [bulb, hallBulb] };
  }

  // first floor: bathroom, small bedroom, hobby room, big bedroom
  // ---- update 30: THE BATHROOM — tub under the back window, toilet and basin on the west wall ----
  {
    place("bathtub", -6.1, -5.4, f1, 0, 1.0, 0.45, 0.72, blockFallback(2.0, 0.7, 0.9, 0xe8e4da));
    place("toilet", -7.0, -2.6, f1, faceU, 0.3, 0.36, 0.8, blockFallback(0.6, 0.8, 0.7, 0xe8e4da));
    placeFit("b_basin", -7.0, -1.3, f1, faceU, { h: 0.88, col: [0.32, 0.32, 0.9] });
    world.farmTaps.push({ x: X(-1.3), z: Z(-6.7), y: f1 });
    placeFit("b_mirror", -7.27, -1.3, f1 + 1.3, faceU, { h: 0.8, nocol: true });
    placeFit("b_cabinet", -2.09, -2.6, f1 + 1.25, faceNegU, { h: 0.75, nocol: true });
    placeFit("b_towel", -4.5, -0.66, f1 + 1.0, faceNegV, { w: 0.9, nocol: true });
  }
  {
    const single = place("singlebed", -6.6, 1.4, f1, faceV, 0.52, 1.05, 0.62, blockFallback(2.0, 0.6, 1.0, 0x6a6a72));
    world.beds.push({ x: X(1.4), z: Z(-6.6), y: f1, label: "single" });
    place("trunk", -2.75, 5.3, f1, faceNegU, 0.55, 0.42, 0.72, blockFallback(1.1, 0.7, 0.8, 0x4a3520));
    world.dirkChest = { x: X(5.3), z: Z(-2.75), y: f1 };
    place("dresser", -6.7, 4.6, f1, faceU, 0.55, 0.3, 1.2, blockFallback(1.1, 1.2, 0.6, 0x4a3520));
    const rug2 = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.0), rugMat);
    rug2.rotation.x = -Math.PI / 2; rug2.rotation.z = Math.PI / 2;
    rug2.position.set(X(2.4), f1 + 0.012, Z(-4.4));
    scene.add(rug2);
    void single;
  }
  {
    const craft = place("crafttable", 6.55, -3.8, f1, faceNegU, 0.78, 0.48, 1.05, blockFallback(1.5, 1.0, 0.9, 0x5a4020));
    world.farmCraft = { x: X(-3.8), z: Z(6.55), y: f1, mesh: craft };
    place("dresser", 2.7, -5.6, f1, faceV, 0.55, 0.3, 1.2, blockFallback(1.1, 1.2, 0.6, 0x4a3520));
  }
  {
    // update 30: the king-size bed — two metres wide, its carved head against the hobby-room wall
    const kingModel = placeFit("kingbed2", 5.0, -0.35, f1, faceV, { w: 2.0, color: 0x6a5a48 });
    world.beds.push({ x: X(-0.35), z: Z(5.0), y: f1, label: "king" });
    // update 32: where Duco lies at night. Measured off the bed's own mattress
    // rather than guessed, and set to one side of it so you can still get in
    // beside him — the sleep prompt is on the bed's centre and stays reachable.
    if (kingModel) {
      kingModel.updateMatrixWorld(true);
      const kb = new THREE.Box3().setFromObject(kingModel);
      world.farmDogBed = { x: X(-0.35), z: Z(5.0) + 0.6, y: kb.min.y + (kb.max.y - kb.min.y) * 0.46 };
    }
    place("dresser", 6.9, 4.6, f1, faceNegU, 0.55, 0.3, 1.2, blockFallback(1.1, 1.2, 0.6, 0x4a3520));
    const rug3 = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.6), rugMat);
    rug3.rotation.x = -Math.PI / 2; rug3.rotation.z = Math.PI / 2;
    rug3.position.set(X(2.2), f1 + 0.012, Z(5.0));
    scene.add(rug3);
  }
  // ---- update 31: the ceiling, the attic above it, and the ladder up ----
  // The first-floor walls stopped at the wall plate, so from the landing you could
  // see straight over them into the roof void. Planks close that now, and the space
  // they make is a real attic: knee walls where the rafters come down, a window in
  // each gable, a hatch in the free stretch of hallway, and a ladder to reach it.
  {
    const plate = (u0, u1, v0, v1) => {
      if (u1 - u0 < 0.02 || Math.abs(v1 - v0) < 0.02) return;
      pushBox("floor", X((v0 + v1) / 2), ATTIC_Y - 0.14, Z((u0 + u1) / 2), Math.abs(v1 - v0), 0.28, u1 - u0, 2);
    };
    plate(-H.hw, HATCH.u0, -H.hd, H.hd);
    plate(HATCH.u1, H.hw, -H.hd, H.hd);
    plate(HATCH.u0, HATCH.u1, -H.hd, HATCH.v0);
    plate(HATCH.u0, HATCH.u1, HATCH.v1, H.hd);
    // knee walls: the room ends where the rafters come down to the floor
    const kneeTop = roofYAt(KNEE_V);
    for (const v of [KNEE_V, -KNEE_V]) {
      pushBox("plank", X(v), (ATTIC_Y + kneeTop) / 2, H.z, 0.12, kneeTop - ATTIC_Y, 2 * H.hw, 1.5);
      pushBox("dark", X(v), kneeTop - 0.07, H.z, 0.18, 0.14, 2 * H.hw, 1);        // the plate beam on top
      col(X(v) - 0.07, X(v) + 0.07, ATTIC_Y, kneeTop, Z(-H.hw), Z(H.hw));
    }
    for (const u of [-H.hw, H.hw]) col(X(KNEE_V), X(-KNEE_V), ATTIC_Y, ATTIC_Y + 2.6, Z(u) - 0.12, Z(u) + 0.12);
    // a guard rail on three sides of the hatch; the ladder side stays open
    rail(X(HATCH.v0), Z(HATCH.u1), X(HATCH.v1), Z(HATCH.u1), ATTIC_Y);
    rail(X(HATCH.v0), Z(HATCH.u0), X(HATCH.v0), Z(HATCH.u1), ATTIC_Y);
    rail(X(HATCH.v1), Z(HATCH.u0), X(HATCH.v1), Z(HATCH.u1), ATTIC_Y);
    // the ladder stands in the hatch's open edge, its foot on the landing
    const lu = HATCH.u0 + 0.13, lv = (HATCH.v0 + HATCH.v1) / 2;
    placeFit("ladder", lu, lv, f1, faceNegU, { h: ATTIC_Y - f1 + 0.2, nocol: true });
    world.farmLadder = { x: X(lv), z: Z(lu), y: f1, topY: ATTIC_Y,
      land: { x: X(lv), z: Z(HATCH.u0 - 0.85) } };
    // what is stored up here: crates and sacks along the knee walls
    placeFit("a_crates", -4.6, 1.25, ATTIC_Y, faceNegV, { h: 1.05 });
    placeFit("a_crates", 5.4, -1.25, ATTIC_Y, faceV, { h: 0.85 });
    placeFit("a_sacks", 3.2, 1.4, ATTIC_Y, faceNegU, { w: 1.15 });
    placeFit("a_sacks", -6.3, -1.35, ATTIC_Y, faceU, { w: 0.95 });
  }

  // the grandfather clock's living hands, driven by the game clock (farmgame).
  // update 34: the dial is painted INTO the clock's own skin now. Updates 31-33
  // hung a separate canvas-textured disc in front of the case's painted face,
  // and however carefully it was measured it read as a sticker stuck on the
  // clock: a flat bright circle floating a few centimetres proud of the wood.
  // tools/glb_clock_dial.py splits the case's flat face panel (behind the hood's
  // glass) into a second primitive of clock.glb with its own dial texture —
  // cream plate, chapter ring, Roman numerals — so the dial IS the case. Only
  // the two hands and the centre pin are still 3D parts, so the time can move.
  //
  // Numbers from that script (run it and read them off; they are in the placed
  // model's own axes, in game units, relative to its origin at (cp.x, f0, cp.z)):
  //   dial centre  dx 0.0027  dy 1.8083  dz 0.0810   (dz = the face plane's front)
  //   chapter ring radius 0.1743
  // The case is placed with rotation.y = faceV (-PI/2), which maps its local
  // (dx, dy, dz) to world (cp.x - dz, f0 + dy, cp.z + dx): its front (+z) looks
  // down world -x into the room. The hands sit 4 mm in front of the face plane.
  {
    const cp = world.farmClockPos;
    const DIAL = { dx: 0.0027, dy: 1.8083, dz: 0.0810, r: 0.1743 };   // glb_clock_dial.py, update 34
    const face = new THREE.Group();
    face.position.set(cp.x - DIAL.dz - 0.004, f0 + DIAL.dy, cp.z + DIAL.dx);
    face.rotation.y = -Math.PI / 2;   // local +z faces world -x (the room), local +x = world +z = the dial's III side
    const R = DIAL.r;
    const hm = new THREE.MeshStandardMaterial({ color: 0x1a1612, roughness: 0.6 });
    const hourL = R * 0.50, minL = R * 0.78;
    const hour = new THREE.Mesh(new THREE.BoxGeometry(R * 0.10, hourL, 0.005), hm); hour.position.set(0, hourL / 2, 0.005);
    const minute = new THREE.Mesh(new THREE.BoxGeometry(R * 0.065, minL, 0.005), hm); minute.position.set(0, minL / 2, 0.007);
    const hourP = new THREE.Group(); hourP.add(hour); const minP = new THREE.Group(); minP.add(minute);
    face.add(hourP, minP);
    // the pin: brass, but NOT metalness 0.8 — with no environment map in this
    // scene a metal renders black; a mostly-dielectric warm gold reads as brass
    const pin = new THREE.Mesh(new THREE.CircleGeometry(R * 0.06, 12), new THREE.MeshStandardMaterial({ color: 0xb8902e, roughness: 0.45, metalness: 0.25 }));
    pin.position.z = 0.009;
    face.add(pin);
    scene.add(face);
    world.farmClock = { face, hour: hourP, minute: minP, x: cp.x, z: cp.z };
  }

  // ================= THE BACKYARD =================
  // a mown lawn under the whole compound — the pasture is a GRASS field, not forest floor
  {
    const lawn = new THREE.Mesh(new THREE.PlaneGeometry(2 * F.hw, 2 * F.hd), mat("t_grass", (2 * F.hw) / 5.7, (2 * F.hd) / 5.7, 0x4a5540));
    lawn.rotation.x = -Math.PI / 2;
    lawn.position.set(F.x, 0.018, F.z);
    scene.add(lawn);
  }
  const TR = F.terrace;
  {
    const terr = new THREE.Mesh(new THREE.PlaneGeometry(TR.x1 - TR.x0, TR.z1 - TR.z0), mat("t_terrace", (TR.x1 - TR.x0) / 2, (TR.z1 - TR.z0) / 2, 0x7a766a));
    terr.rotation.x = -Math.PI / 2;
    terr.position.set((TR.x0 + TR.x1) / 2, 0.05, (TR.z0 + TR.z1) / 2);
    scene.add(terr);
    // gravel paths: east to the hedge gap, south to the pasture gate
    const gravel = (x0, x1, z0, z1) => {
      const g = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), mat("t_gravel", (x1 - x0) / 1.5, (z1 - z0) / 1.5, 0x8a8478));
      g.rotation.x = -Math.PI / 2;
      g.position.set((x0 + x1) / 2, 0.045, (z0 + z1) / 2);
      scene.add(g);
    };
    gravel(TR.x1, F.hedge.x + 0.6, F.hedge.gap0, F.hedge.gap1);
    gravel(F.pasture.gate.x0 - 0.2, F.pasture.gate.x1 + 0.2, TR.z1, F.pasture.z0);
    // the fountain on its gravel apron, with living water
    const FO = F.fountain;
    const apron = new THREE.Mesh(new THREE.CircleGeometry(FO.r + 1.1, 28), mat("t_gravel", 3, 3, 0x8a8478));
    apron.rotation.x = -Math.PI / 2; apron.position.set(FO.x, 0.04, FO.z);
    scene.add(apron);
    // update 30: the restored two-tier fountain, fitted to the same footprint
    const fnAsset = A.glb.fountain2;
    let fh = 2.1, fnModel = null;
    if (fnAsset) {
      const fn = fnAsset.model.clone();
      fnModel = fn;
      const fb = new THREE.Box3().setFromObject(fn);
      const fs = new THREE.Vector3(); fb.getSize(fs);
      const k = (FO.r * 2) / Math.max(fs.x, fs.z, 0.01);
      fn.scale.multiplyScalar(k);
      fn.position.set(FO.x, 0.02, FO.z);
      scene.add(fn);
      fh = fs.y * k;
    } else {
      const sm = new THREE.MeshStandardMaterial({ color: 0xd8d0c0, roughness: 1 });
      const basin = new THREE.Mesh(new THREE.CylinderGeometry(FO.r, FO.r + 0.1, 0.7, 24), sm); basin.position.set(FO.x, 0.35, FO.z);
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 1.3, 12), sm); pillar.position.set(FO.x, 1.2, FO.z);
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.3, 0.3, 18), sm); bowl.position.set(FO.x, 1.9, FO.z);
      scene.add(basin, pillar, bowl);
    }
    // update 31: the water is MEASURED off the stone instead of guessed. One pass over
    // the fountain's vertices gives the widest radius of every height band, which finds
    // the basin's rim and the upper bowl's rim exactly. The old version put six opaque
    // stream cylinders outside the bowl, standing in the basin like black poles.
    const BANDS = 48, band = new Float32Array(BANDS);
    if (fnModel) {
      const vv = new THREE.Vector3();
      fnModel.updateMatrixWorld(true);
      fnModel.traverse((o) => {
        if (!o.isMesh) return;
        const pa = o.geometry.attributes.position;
        for (let i = 0; i < pa.count; i++) {
          vv.fromBufferAttribute(pa, i).applyMatrix4(o.matrixWorld);
          const k = Math.floor(((vv.y - 0.02) / Math.max(0.01, fh)) * BANDS);
          if (k < 0 || k >= BANDS) continue;
          const rr = Math.hypot(vv.x - FO.x, vv.z - FO.z);
          if (rr > band[k]) band[k] = rr;
        }
      });
    }
    const bandY = (k) => 0.02 + ((k + 0.5) / BANDS) * fh;
    let basinK = 0, rimK = Math.floor(BANDS * 0.78);
    for (let k = 1; k < Math.floor(BANDS * 0.42); k++) if (band[k] > band[basinK]) basinK = k;
    for (let k = Math.floor(BANDS * 0.52); k < Math.floor(BANDS * 0.95); k++) if (band[k] > band[rimK]) rimK = k;
    const basinR = band[basinK] > 0.3 ? band[basinK] : FO.r;
    const basinY = band[basinK] > 0.3 ? Math.max(0.28, bandY(basinK) - 0.07) : fh * 0.30;
    const rimR = band[rimK] > 0.12 ? band[rimK] : FO.r * 0.46;
    const rimY = band[rimK] > 0.12 ? bandY(rimK) : fh * 0.79;
    // the two still surfaces: the basin, and the bowl it overflows from
    const waterMat = mat("t_water", 2, 2, 0x88aab4);
    waterMat.transparent = true; waterMat.opacity = 0.85; waterMat.roughness = 0.2;
    const water = new THREE.Mesh(new THREE.CircleGeometry(basinR * 0.9, 32), waterMat);
    water.rotation.x = -Math.PI / 2; water.position.set(FO.x, basinY, FO.z);
    scene.add(water);
    const bowlWater = new THREE.Mesh(new THREE.CircleGeometry(rimR * 0.88, 24), waterMat);
    bowlWater.rotation.x = -Math.PI / 2; bowlWater.position.set(FO.x, rimY - 0.05, FO.z);
    scene.add(bowlWater);
    world.farmWater = { mesh: water, tex: waterMat.map };
    // the falling water. Unlit (MeshBasic) so it stays water-coloured at dusk instead
    // of going black, and its texture scrolls downward.
    const jetTex = waterMat.map ? waterMat.map.clone() : null;
    if (jetTex) { jetTex.needsUpdate = true; jetTex.wrapS = jetTex.wrapT = THREE.RepeatWrapping; jetTex.repeat.set(7, 2); }
    const jetMat = new THREE.MeshBasicMaterial({ map: jetTex, color: 0xdaeef6, transparent: true,
      opacity: 0.38, depthWrite: false, side: THREE.DoubleSide });
    const dropH = Math.max(0.3, rimY - 0.07 - basinY);
    const curtain = new THREE.Mesh(new THREE.CylinderGeometry(rimR * 0.99, rimR * 0.8, dropH, 32, 1, true), jetMat);
    curtain.position.set(FO.x, basinY + dropH / 2, FO.z);
    scene.add(curtain);
    // and the spout on the finial, rising from the very top
    const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.05, 0.32, 10, 1, true), jetMat);
    jet.position.set(FO.x, fh + 0.1, FO.z);
    scene.add(jet);
    world.farmJet = { jet, curtain, tex: jetTex };
    col(FO.x - FO.r, FO.x + FO.r, 0, 1.0, FO.z - FO.r, FO.z + FO.r);
    // the bench and its little table, looking at the fountain
    const bench = A.glb.bench ? A.glb.bench.model.clone() : null;
    if (bench) { bench.position.set(FO.x, 0.02, FO.z - 3.9); bench.rotation.y = 0; scene.add(bench); }
    else pushBox("plank", FO.x, 0.45, FO.z - 3.9, 1.8, 0.08, 0.5, 1);
    col(FO.x - 0.95, FO.x + 0.95, 0, 0.95, FO.z - 4.2, FO.z - 3.6);
    const st = A.glb.sidetable ? A.glb.sidetable.model.clone() : null;
    if (st) { st.position.set(FO.x + 1.9, 0.02, FO.z - 3.8); scene.add(st); }
    col(FO.x + 1.55, FO.x + 2.25, 0, 0.62, FO.z - 4.15, FO.z - 3.45);
    // two flower beds: soil box, stone edging, a blooming top (update 30: placed off the terrace edges)
    const bed = (x0, x1, z0, z1) => {
      pushBox("dark", (x0 + x1) / 2, 0.12, (z0 + z1) / 2, x1 - x0, 0.24, z1 - z0, 1);
      for (const [cx, cz, sx, sz] of [[(x0 + x1) / 2, z0, x1 - x0 + 0.16, 0.16], [(x0 + x1) / 2, z1, x1 - x0 + 0.16, 0.16], [x0, (z0 + z1) / 2, 0.16, z1 - z0], [x1, (z0 + z1) / 2, 0.16, z1 - z0]])
        pushBox("stone", cx, 0.16, cz, sx, 0.32, sz, 1);
      const top = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0 - 0.1, z1 - z0 - 0.1), mat("t_flowerbed", (x1 - x0) / 1.6, (z1 - z0) / 1.6, 0x5a3a2a));
      top.rotation.x = -Math.PI / 2; top.position.set((x0 + x1) / 2, 0.25, (z0 + z1) / 2);
      scene.add(top);
      col(x0, x1, 0, 0.32, z0, z1);
    };
    bed(TR.x0 + 1, TR.x1 - 1, TR.z0 - 2.4, TR.z0 - 1.2);
    bed(TR.x0 + 1, TR.x1 - 1, TR.z1 + 1.2, TR.z1 + 2.4);
    // two lantern posts; one carries the garden's PointLight
    world.farmLanternBulbs = [];
    for (const [lx, lz, lit] of [[TR.x1 + 0.8, TR.z0 - 1.8, true], [TR.x1 + 0.8, TR.z1 + 1.6, false]]) {
      pushBox("dark", lx, 1.1, lz, 0.12, 2.2, 0.12, 1);
      const lan = A.glb.lantern ? A.glb.lantern.model.clone() : null;
      if (lan) { lan.position.set(lx, 2.1, lz); scene.add(lan); }
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffe0a0, emissive: 0xffc060, emissiveIntensity: 0.2 }));
      b.position.set(lx, 2.35, lz); scene.add(b);
      world.farmLanternBulbs.push(b);
      col(lx - 0.1, lx + 0.1, 0, 2.2, lz - 0.1, lz + 0.1);
      if (lit) {
        const gl = new THREE.PointLight(0xd89a4a, 0, 12, 2);
        gl.position.set(lx, 2.4, lz);
        scene.add(gl);
        world.farmLights.garden = gl;
      }
    }
    // the hedge between garden and field, with the gap for the path
    const HG = F.hedge;
    for (const [z0, z1] of [[HG.z0, HG.gap0], [HG.gap1, HG.z1]]) {
      pushBox("hedge", HG.x, 0.48, (z0 + z1) / 2, 0.7, 0.96, z1 - z0, 1.2);
      col(HG.x - 0.35, HG.x + 0.35, 0, 0.96, z0, z1);
    }
  }

  // ---- the blueberry field ----
  {
    const B = F.field;
    const soil = new THREE.Mesh(new THREE.PlaneGeometry(B.x1 - B.x0, B.z1 - B.z0), mat("t_forestfloor", (B.x1 - B.x0) / 3, (B.z1 - B.z0) / 3, 0x4a3a2a));
    soil.rotation.x = -Math.PI / 2; soil.position.set((B.x0 + B.x1) / 2, 0.02, (B.z0 + B.z1) / 2);
    scene.add(soil);
    world.bushes = [];
    const bushAsset = A.glb.bush;
    const berryGeo = new THREE.SphereGeometry(0.048, 6, 5);
    const berryMat = new THREE.MeshStandardMaterial({ color: 0x2b3070, roughness: 0.55 });
    const perBush = 9;
    const total = B.rows * B.perRow;
    const berries = new THREE.InstancedMesh(berryGeo, berryMat, total * perBush);
    const mtx = new THREE.Matrix4();
    let bi = 0;
    // update 30: one INSTANCED bush mesh instead of 56 clones — 56 draw calls became one
    let bushInst = null, bushMesh = null;
    if (bushAsset) {
      bushAsset.model.traverse((o) => { if (o.isMesh && !bushMesh) bushMesh = o; });
      if (bushMesh) {
        bushMesh.updateWorldMatrix(true, false);
        const g = bushMesh.geometry.clone();
        g.applyMatrix4(bushMesh.matrixWorld);
        bushInst = new THREE.InstancedMesh(g, bushMesh.material, total);
        bushInst.frustumCulled = true;
      }
    }
    const bushFallback = () => {
      const g = new THREE.Group();
      const lm = new THREE.MeshStandardMaterial({ color: 0x3d5a2e, roughness: 1 });
      for (let i = 0; i < 4; i++) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(0.42 + rng() * 0.18, 7, 5), lm);
        s.position.set((rng() - 0.5) * 0.5, 0.45 + rng() * 0.3, (rng() - 0.5) * 0.5);
        s.scale.y = 0.75;
        g.add(s);
      }
      return g;
    };
    const tmpQ = new THREE.Quaternion(), tmpP = new THREE.Vector3(), tmpS = new THREE.Vector3();
    let n = 0;
    for (let r = 0; r < B.rows; r++) {
      for (let i = 0; i < B.perRow; i++) {
        const x = B.rowX0 + r * B.rowDX + (rng() - 0.5) * 0.3;
        const z = B.bushZ0 + i * B.bushDZ + (rng() - 0.5) * 0.3;
        const ry = rng() * Math.PI * 2;
        const sc = 0.9 + rng() * 0.2;
        if (bushInst) {
          tmpP.set(x, 0.02, z); tmpQ.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry); tmpS.set(sc, sc, sc);
          bushInst.setMatrixAt(n++, mtx.compose(tmpP, tmpQ, tmpS));
        } else {
          const m = bushFallback();
          m.position.set(x, 0.02, z); m.rotation.y = ry; m.scale.multiplyScalar(sc);
          scene.add(m);
        }
        world.addTree(x, z, 0.5);
        const rec = { x, z, ripe: true, t: 0, first: bi, n: perBush, pts: [] };
        for (let k = 0; k < perBush; k++) {
          const a = rng() * Math.PI * 2, rr = 0.2 + rng() * 0.32;
          const pxb = x + Math.cos(a) * rr * sc, pz = z + Math.sin(a) * rr * sc, py = (0.45 + rng() * 0.5) * sc;
          rec.pts.push([pxb, py, pz]);
          mtx.makeTranslation(pxb, py, pz);
          berries.setMatrixAt(bi++, mtx);
        }
        world.bushes.push(rec);
      }
    }
    if (bushInst) { bushInst.instanceMatrix.needsUpdate = true; bushInst.computeBoundingSphere(); scene.add(bushInst); }
    berries.instanceMatrix.needsUpdate = true;
    scene.add(berries);
    world.berryMesh = berries;
    // the blueberry crate at the field gate
    const CR = F.crate;
    const crate = A.glb.bcrate ? A.glb.bcrate.model.clone() : null;
    if (crate) { crate.position.set(CR.x, 0.02, CR.z); crate.rotation.y = -Math.PI / 2; scene.add(crate); }
    else pushBox("plank", CR.x, 0.3, CR.z, 0.9, 0.6, 0.7, 1);
    col(CR.x - 0.5, CR.x + 0.5, 0, 0.62, CR.z - 0.4, CR.z + 0.4);
    world.farmCrate = { x: CR.x, z: CR.z, y: 0 };
  }

  // ---- the pasture: fence with an auto gate, the shed, the cows' spots ----
  {
    const P = F.pasture, G = P.gate;
    const fenceAsset = A.glb.fence;
    let fl = 2.4;
    let fenceMesh = null, fenceGeo = null;
    if (fenceAsset) {
      const fb = new THREE.Box3().setFromObject(fenceAsset.model);
      const fs = new THREE.Vector3(); fb.getSize(fs);
      fl = Math.max(fs.x, fs.z, 1.2);
      fenceAsset.model.traverse((o) => { if (o.isMesh && !fenceMesh) fenceMesh = o; });
      if (fenceMesh) {
        fenceMesh.updateWorldMatrix(true, false);
        fenceGeo = fenceMesh.geometry.clone();
        fenceGeo.applyMatrix4(fenceMesh.matrixWorld);
      }
    }
    // update 30: the fence segments are ONE instanced mesh as well
    const segs = [];
    const fenceLine = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const n = Math.max(1, Math.round(len / fl));
      const seg = len / n;
      for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = (i + 1) / n;
        const ax = x0 + (x1 - x0) * t0, az = z0 + (z1 - z0) * t0;
        const bx = x0 + (x1 - x0) * t1, bz = z0 + (z1 - z0) * t1;
        if (fenceGeo) {
          segs.push([(ax + bx) / 2, (az + bz) / 2, -Math.atan2(bz - az, bx - ax), seg / fl]);
        } else {
          pushBox("dark", ax, 0.5, az, 0.14, 1.0, 0.14, 1);
          const along = Math.abs(bx - ax) > Math.abs(bz - az);
          for (const ry of [0.42, 0.85]) {
            if (along) pushBox("dark", (ax + bx) / 2, ry, az, seg, 0.07, 0.06, 1);
            else pushBox("dark", ax, ry, (az + bz) / 2, 0.06, 0.07, seg, 1);
          }
        }
      }
      // one collider per run, tall enough that nothing steps over
      if (Math.abs(x1 - x0) > Math.abs(z1 - z0)) col(x0, x1, 0, 1.0, z0 - 0.08, z0 + 0.08);
      else col(x0 - 0.08, x0 + 0.08, 0, 1.0, z0, z1);
    };
    fenceLine(P.x0, P.z0, G.x0, P.z0);       // north, up to the gate
    fenceLine(G.x1, P.z0, P.x1, P.z0);       // north, after the gate
    fenceLine(P.x1, P.z0, P.x1, P.z1);       // east
    fenceLine(P.x1, P.z1, P.x0, P.z1);       // south
    fenceLine(P.x0, P.z1, P.x0, P.z0);       // west
    if (fenceGeo && segs.length) {
      const inst = new THREE.InstancedMesh(fenceGeo, fenceMesh.material, segs.length);
      const q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), m4 = new THREE.Matrix4();
      segs.forEach(([x, z, ry, sc], i) => {
        p.set(x, 0, z); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry); s.set(sc, sc, sc);
        inst.setMatrixAt(i, m4.compose(p, q, s));
      });
      inst.instanceMatrix.needsUpdate = true;
      inst.computeBoundingSphere();
      scene.add(inst);
    }
    // the gate leaf: hinge at the west post, swings INTO the pasture
    {
      const leaf = new THREE.Group();
      const gw = G.x1 - G.x0;
      const dm = M.dark;
      for (const ry of [0.32, 0.62, 0.92]) {
        const r = new THREE.Mesh(uvBox(gw, 0.07, 0.06, 1), dm); r.position.set(gw / 2, ry, 0); leaf.add(r);
      }
      for (let i = 0; i <= 4; i++) {
        const p = new THREE.Mesh(uvBox(0.07, 1.0, 0.07, 1), dm); p.position.set(0.08 + (gw - 0.16) * (i / 4), 0.5, 0); leaf.add(p);
      }
      leaf.position.set(G.x0, 0, P.z0);
      scene.add(leaf);
      pushBox("dark", G.x0, 0.55, P.z0, 0.16, 1.1, 0.16, 1);
      pushBox("dark", G.x1, 0.55, P.z0, 0.16, 1.1, 0.16, 1);
      col(G.x0, G.x1, 0, 1.0, P.z0 - 0.08, P.z0 + 0.08);
      const ref = world.boxes[world.boxes.length - 1];
      world.farmGate = { grp: leaf, open: false, x: (G.x0 + G.x1) / 2, z: P.z0, y: 0, boxRef: ref, closedBox: Object.assign({}, ref) };
    }
    // the shed: three plank walls, posts, a tilted plank roof, hay inside — open to the south
    const SH = F.shed;
    const shx = (SH.x0 + SH.x1) / 2, shw = SH.x1 - SH.x0, shd = SH.z1 - SH.z0;
    pushBox("plank", shx, 1.2, SH.z0, shw + 0.3, 2.4, 0.15, 1.5); col(SH.x0 - 0.15, SH.x1 + 0.15, 0, 2.4, SH.z0 - 0.08, SH.z0 + 0.08);
    pushBox("plank", SH.x0, 1.2, (SH.z0 + SH.z1) / 2, 0.15, 2.4, shd, 1.5); col(SH.x0 - 0.08, SH.x0 + 0.08, 0, 2.4, SH.z0, SH.z1);
    pushBox("plank", SH.x1, 1.2, (SH.z0 + SH.z1) / 2, 0.15, 2.4, shd, 1.5); col(SH.x1 - 0.08, SH.x1 + 0.08, 0, 2.4, SH.z0, SH.z1);
    for (const px2 of [SH.x0 + 0.1, SH.x1 - 0.1]) { pushBox("dark", px2, 1.25, SH.z1 - 0.1, 0.18, 2.5, 0.18, 1); col(px2 - 0.1, px2 + 0.1, 0, 2.5, SH.z1 - 0.2, SH.z1); }
    {
      const rg = uvBox(shw + 0.8, 0.12, shd + 0.9, 1.5);
      rg.rotateX(0.14);
      rg.translate(shx, 2.72, (SH.z0 + SH.z1) / 2 + 0.1);
      (geos.plank = geos.plank || []).push(rg);
    }
    const dirt = new THREE.Mesh(new THREE.PlaneGeometry(shw, shd), mat("t_campdirt", shw / 2, shd / 2, 0x5a4a38));
    dirt.rotation.x = -Math.PI / 2; dirt.position.set(shx, 0.03, (SH.z0 + SH.z1) / 2);
    scene.add(dirt);
    for (const [hx2, hz2, ry] of [[SH.x0 + 1.2, SH.z0 + 0.9, 0.3], [SH.x1 - 1.3, SH.z0 + 1.0, -0.4]]) {
      const hb = A.glb.haybale ? A.glb.haybale.model.clone() : null;
      if (hb) { hb.position.set(hx2, 0.03, hz2); hb.rotation.y = ry; scene.add(hb); }
      else pushBox("plank", hx2, 0.38, hz2, 1.2, 0.75, 0.8, 1);
      col(hx2 - 0.6, hx2 + 0.6, 0, 0.75, hz2 - 0.45, hz2 + 0.45);
    }
    // a few dirt patches where the cows gather
    for (const [dx2, dz2, dr] of [[(G.x0 + G.x1) / 2, P.z0 + 2.2, 2.4], [SH.x1 + 2.5, SH.z1 + 1.6, 2.8], [P.x1 - 8, P.z1 - 6, 3.2]]) {
      const d = new THREE.Mesh(new THREE.CircleGeometry(dr, 18), mat("t_campdirt", dr, dr, 0x5a4a38));
      d.rotation.x = -Math.PI / 2; d.position.set(dx2, 0.025, dz2);
      scene.add(d);
    }
    // where the cows stand at night
    world.shedSpots = [[SH.x0 + 1.1, SH.z0 + 2.6], [SH.x0 + 2.6, SH.z0 + 2.3], [SH.x0 + 4.1, SH.z0 + 2.6], [SH.x1 - 0.9, SH.z0 + 2.2],
      [SH.x0 + 1.6, SH.z1 + 0.9], [SH.x1 - 1.5, SH.z1 + 0.9]];
    // update 32: what a cow cannot walk through. The player's own colliders are
    // filtered by height and never consulted by creature movement, so the shed
    // needs saying again in the cows' own terms — three walls, the two corner
    // posts, and the hay. The south side is deliberately absent: that is the way in.
    // The back and west walls are SEALED to the pasture fence rather than drawn
    // as thin slabs. The shed stands only a metre off those two fences, which is
    // less than a cow's own width: modelled as thin walls, a cow that got into
    // either gap had no legal position left and stuck there, jittering, for the
    // rest of the night. Filled in, the gap simply is not somewhere a cow can be
    // — and since they spawn and graze east and south of the shed, none is ever
    // caught inside one. The south side is deliberately open: that is the door.
    // update 33: ONE block for the shed — its whole footprint plus the two gaps
    // between it and the fence — flagged `shed` so a cow that is inside it, or
    // standing in its doorway on the way in or out, is let through (entities
    // decides that). Outside cows are pushed out along whichever face keeps
    // them inside the pasture: east or south, never over the fence. That fence
    // face was what update 32 kept choosing, which threw the herd outside and
    // snapped it back every frame. The hay bales stay solid for everyone.
    world.cowBlockers = [
      { x0: P.x0 - 1, x1: SH.x1 + 0.15, z0: P.z0 - 1, z1: SH.z1 + 0.15, shed: true },
      { x0: SH.x0 + 0.6, x1: SH.x0 + 1.8, z0: SH.z0 + 0.45, z1: SH.z0 + 1.35 },     // the two hay bales
      { x0: SH.x1 - 1.9, x1: SH.x1 - 0.7, z0: SH.z0 + 0.55, z1: SH.z0 + 1.45 },
    ];
  }

  // ---- merge every static box into one mesh per material ----
  for (const [key, list] of Object.entries(geos)) {
    if (!list.length) continue;
    const mesh = new THREE.Mesh(mergeGeometries(list), M[key]);
    scene.add(mesh);
  }

  // records the game reads
  world.farmRect = { x0: F.x - F.hw, x1: F.x + F.hw, z0: F.z - F.hd, z1: F.z + F.hd };
  world.dirkPos = { x: X(1.5), z: Z(0.5), y: f0, yaw: Math.PI };
  world.farmHouse = { x: H.x, z: H.z };
}
