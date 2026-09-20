// Seeded deterministic RNG (mulberry32) — same seed, same world.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function pickWeighted(rng, table) {
  // table: array of [value, weight, ...rest]
  let total = 0;
  for (const row of table) total += row[1];
  let r = rng() * total;
  for (const row of table) { r -= row[1]; if (r <= 0) return row; }
  return table[table.length - 1];
}
