import { CFG } from "./config.js";

// ============================================================================
// update 40: the city's local frame, shared by eternius.js (the game logic),
// eternius_build.js (the geometry) and desert.js (the dunes go flat around it).
// `a` runs from the mountain's heart toward the north-east (the castle side),
// `b` toward the north-west. Inside the city's group: local x = b, local z = a.
// ============================================================================
export const E = () => CFG.eternius;
export const D2R = Math.PI / 180;
export const smooth = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

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
// the lake in front of the castle: a round bowl, and (update 40) a moat band along
// the castle's whole front so the bridge is the only way to the gate
export function lakeNorm(a, b) {
  const LK = E().lake;
  const nc = Math.hypot(a - LK.a, b) / LK.r;
  const A0 = LK.moatA0, A1 = LK.moatA1, HW = LK.moatHw, edge = 5;
  const da = (a < A0 ? A0 - a : a > A1 ? a - A1 : 0) / edge;
  const db = Math.max(0, Math.abs(b) - (HW - edge)) / edge;
  const nm = Math.hypot(da, db);
  return Math.min(nc, nm);
}
export function inLake(a, b, m = 0) {
  const LK = E().lake;
  if (Math.hypot(a - LK.a, b) < LK.r + m) return true;
  return a > LK.moatA0 - m && a < LK.moatA1 + m && Math.abs(b) < LK.moatHw + m;
}
export function cityLakeDip(x, z) {
  const { a, b } = cityLocal(x, z);
  const n = lakeNorm(a, b);
  return n < 1 ? E().lake.depth * (1 - n * n) : 0;
}
// the lake's outline as a local polygon (for the hole in the grass under it)
export function lakeOutline(margin = 3, n = 72) {
  const LK = E().lake, P = [LK.moatA0 + 6, 0], pts = [];
  for (let i = 0; i < n; i++) {
    const th = (i / n) * Math.PI * 2, dx = Math.cos(th), dy = Math.sin(th);
    // ray from P against the circle
    const fx = P[0] - LK.a, fy = P[1];
    const bq = 2 * (fx * dx + fy * dy), cq = fx * fx + fy * fy - LK.r * LK.r;
    let t1 = (-bq + Math.sqrt(Math.max(0, bq * bq - 4 * cq))) / 2;
    // ray against the moat box
    let t2 = 0;
    const tx = dx > 1e-6 ? (LK.moatA1 - P[0]) / dx : dx < -1e-6 ? (LK.moatA0 - P[0]) / dx : 1e9;
    const ty = dy > 1e-6 ? (LK.moatHw - P[1]) / dy : dy < -1e-6 ? (-LK.moatHw - P[1]) / dy : 1e9;
    t2 = Math.min(tx, ty);
    const t = Math.max(t1, t2) + margin;
    pts.push([P[0] + dx * t, P[1] + dy * t]);
  }
  return pts;
}
