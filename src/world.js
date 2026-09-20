import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { CFG } from "./config.js";
import { Desert } from "./desert.js";   // update 36
import { buildFarm, farmCands, farmSurface, inFarm } from "./farm.js";

// World geometry, colliders, zones and day/night environment.
// North = -Z. Three-floor roman ruin at the origin; a winding sandy path
// disappears into a dense forest and eventually finds the tree hut.

const V = { x: 0, z: 0 };

export class World {
  constructor(scene, assets, rng) {
    this.scene = scene;
    this.assets = assets;
    this.rng = rng;
    this.boxes = [];
    // update 32: live bodies — an animal you can walk into. Static boxes cannot
    // express these because they move every frame; whoever owns the creature
    // refills this list per frame and `collide` turns the player aside on it.
    this.softBodies = [];
    this.treeGrid = new Map();
    this.windows = [];    // {x,z,nx,nz,y} — holes the T-Rex can reach (floors 1-2)
    this.chests = [];
    this.apples = [];
    this.beds = [];
    this.twigs = [];      // {x,z,rearm} — crack loudly when stepped on
    this.stove = null;    // hut kitchen (cooks everything)
    this.campfire = null; // ruin campfire (meat only)
    this.craftTable = null;
    this.storageChest = null;
    this.bill = null;     // the farmer's spot in the hut
    this.occluders = [];  // boulders + thick trees — break the T-Rex's line of sight
    this.desert = new Desert(this);   // update 36: the river's course and the desert's region tests
    this.lights = {};
    // path segments for distance queries
    this.pathSegs = [];
    const P = CFG.world.pathPoints;
    for (let i = 0; i < P.length - 1; i++) this.pathSegs.push([P[i], P[i + 1]]);
    this.build();
  }

  // ---------- helpers ----------
  addBox(minX, maxX, minY, maxY, minZ, maxZ) {
    this.boxes.push({ minX, maxX, minY, maxY, minZ, maxZ });
  }
  gridKey(x, z) { return `${Math.floor(x / 8)},${Math.floor(z / 8)}`; }
  addTree(x, z, r) {
    const k = this.gridKey(x, z);
    if (!this.treeGrid.has(k)) this.treeGrid.set(k, []);
    this.treeGrid.get(k).push({ x, z, r });
  }
  treesNear(x, z) {
    const out = [];
    const cx = Math.floor(x / 8), cz = Math.floor(z / 8);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const arr = this.treeGrid.get(`${cx + i},${cz + j}`);
      if (arr) out.push(...arr);
    }
    return out;
  }

  distToPath(x, z) {
    let best = 1e9;
    for (const [[ax, az], [bx, bz]] of this.pathSegs) {
      const dx = bx - ax, dz = bz - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
      const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
      if (d < best) best = d;
    }
    return best;
  }

  inRuin(x, z) {
    const R = CFG.ruin;
    return x > -R.halfX + 0.3 && x < R.halfX - 0.3 && z > -R.halfZ + 0.3 && z < R.halfZ - 0.3;
  }
  inAlcove(x, z, y = 0) {
    const A = CFG.ruin.alcove;
    return y < 3.2 && x > A.x0 && x < A.x1 && z > A.z0 && z < A.z1;
  }
  onHut(x, z, y) {
    const [hx, hz] = CFG.world.hutPos;
    return y > 1.8 && x > hx - 4.7 && x < hx + 4.7 && z > hz - 3.7 && z < hz + 3.7;
  }
  inPen(x, z) {
    const [hx, hz] = CFG.world.hutPos;
    const P = CFG.pen;
    return x > hx + P.x0 && x < hx + P.x1 && z > hz + P.z0 && z < hz + P.z1;
  }
  // safe AND unseen: the entire ground floor of the ruin (the only place a
  // T-Rex cannot see you), the hut platform, or anywhere inside the lighthouse.
  isSafe(x, z, y) {
    if (this.inRuin(x, z) && y < 3.2) return true;
    if (this.inLighthouse(x, z)) return true;
    if (this.inContainer(x, z)) return true;
    if (this.inRuinsHouse(x, z) || this.inChurch(x, z)) return true;
    if (this.inJabbHut(x, z)) return true;   // the dwarf's walls hold
    if (inFarm(x, z)) return true;           // update 29: the whole farm compound
    if (this.desert.inTentZone(x, z)) return true;   // update 36: Idris's tent
    return this.onHut(x, z, y);
  }
  inFarm(x, z) { return inFarm(x, z); }
  inJabbHut(x, z) {
    const J = this.jabbHutRect;
    return !!J && x > J.x0 && x < J.x1 && z > J.z0 && z < J.z1;
  }
  // inside the wolf dungeon? Point-in-tunnel (near the spine polyline) or
  // point-in-chamber, computed in the dungeon's own diagonal frame.
  inDungeon(x, z) {
    const D = this.dungeon;
    if (!D) return false;
    const rx = x - D.ent.x, rz = z - D.ent.z;
    const s = rx * D.ux + rz * D.uz;
    const t = rx * D.vx + rz * D.vz;
    const send = D.sanctum ? D.sanctum.s1 : D.chamber.s1;
    if (s < -1.2 || s > send + 1) return false;
    if (s > D.chamber.s0 && s < D.chamber.s1 && Math.abs(t) < D.chamber.t) return true;
    if (D.ante && s > D.ante.s0 && s < D.ante.s1 && Math.abs(t) < D.ante.t) return true;
    // update 28: the exit passage out of the grand hall, and the statue
    // sanctum at the very end of the dungeon
    if (D.corr && s >= D.corr.s0 && s <= D.corr.s1 && Math.abs(t) < D.corr.hw + 0.8) return true;
    if (D.sanctum && s > D.sanctum.s0 && s < D.sanctum.s1 && Math.abs(t) < D.sanctum.t) return true;
    const lim = (D.hw + 0.8) * (D.hw + 0.8);
    for (let i = 0; i < D.spine.length - 1; i++) {
      const [a0, b0] = D.spine[i], [a1, b1] = D.spine[i + 1];
      const dx = a1 - a0, dz = b1 - b0;
      const len2 = dx * dx + dz * dz;
      let k = ((s - a0) * dx + (t - b0) * dz) / len2;
      k = Math.max(0, Math.min(1, k));
      const px = a0 + dx * k - s, pz = b0 + dz * k - t;
      if (px * px + pz * pz < lim) return true;
    }
    return false;
  }
  // floor two: inside, visible, and within reach of a neck through a hole
  inReachableInterior(x, z, y) {
    return this.inRuin(x, z) && y >= 3.2 && y <= 6.9;
  }
  // line of sight blocked by a boulder or thick tree?
  losBlocked(ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az;
    const len2 = dx * dx + dz * dz;
    if (len2 < 1) return false;
    for (const o of this.occluders) {
      const t = Math.max(0, Math.min(1, ((o.x - ax) * dx + (o.z - az) * dz) / len2));
      const d = Math.hypot(o.x - (ax + dx * t), o.z - (az + dz * t));
      if (d < o.r && t > 0.02 && t < 0.98) return true;
    }
    return false;
  }

  // what the player is standing on — drives footstep sound
  surfaceAt(x, z, y) {
    if (this.inContainer(x, z)) return "metal";           // update 28: steel rings like steel
    const fs = farmSurface(x, z, y);                      // update 29: the farmhouse floors and the terrace
    if (fs) return fs;
    if (this.inRuin(x, z) || this.inLighthouse(x, z)) return "stone";
    if (this.inRuinsHouse(x, z) || this.inChurch(x, z)) return "stone";
    if (this.onHut(x, z, y) || this.inJabbHut(x, z)) return "wood";  // both huts are planks
    // update 28: the mountain — and the dungeon bored into it — is bare rock
    if (this.dungeon && this.inDungeon(x, z) && y < this.dungeon.y + 7) return "rock";
    if (this.desert.inDesert(x, z) && !this.desert.bridgeAt(x, z)) return "sand";   // update 36
    if (this.desert.bridgeAt(x, z)) return "wood";
    const pen = this.lakePenetration(x, z);
    if (pen > 0 && y < 1) return "water";
    if (pen > -CFG.lake.beach && y < 1) return "sand";
    if (this.distToPath(x, z) < 2.6) return "sand";
    if (this.inMountain(x, z) && this.mountainH(x, z) > 0.3) return "rock";
    return "grass";
  }

  // walkable height with multi-floor support: highest candidate ≤ y + step
  groundHeight(x, z, y = 0) {
    // the dungeon floor overrides the mountain body it tunnels through —
    // without this the wall's rock height would swallow anyone inside.
    // Only near floor level (or for spawn snaps probing from 999): someone
    // standing on the rock ABOVE the tunnels must not fall through.
    if (this.dungeon && this.inDungeon(x, z) &&
        (y < this.dungeon.y + 7 || y > 900)) return this.dungeon.y;
    const cands = [this.mountainH(x, z)];
    this.desert.groundCand(x, z, cands);   // update 36: dunes, the oasis, the bridge decks
    // the treetop perch (update 27): while climbing, the crown holds you
    if (this.climbSpot && Math.abs(x - this.climbSpot.x) < 1.3
        && Math.abs(z - this.climbSpot.z) < 1.3 && y > this.climbSpot.y - 2) {
      cands.push(this.climbSpot.y);
    }
    const R = CFG.ruin;
    const [hx, hz] = CFG.world.hutPos;
    // update 29: the farmhouse floors, stairs, porch and balconies
    farmCands(x, z, cands);
    // hut platform + ramp
    if (x > hx - 4.5 && x < hx + 4.5 && z > hz - 3.5 && z < hz + 3.5) cands.push(2.2);
    const rz0 = hz + 3.5, rz1 = hz + 10.5;
    if (Math.abs(x - hx) < 1.2 && z >= rz0 && z <= rz1) cands.push(2.2 * (rz1 - z) / (rz1 - rz0));
    // ruin staircase (south-west room, ground -> floor2, rising westward)
    if (x > -8.3 && x < -0.6 && z > 4.6 && z < 6.95) {
      const t = (-0.6 - x) / 7.7;
      cands.push(R.floor2 * Math.min(1, Math.max(0, t)));
    }
    // (the old ramp to the roof is gone — only ground + first floor exist)
    // lighthouse: ground floor, helix stair (multi-revolution candidates), top deck
    const L = CFG.lighthouse;
    const ldx = x - L.x, ldz = z - L.z, ldd = Math.hypot(ldx, ldz);
    if (ldd < L.r - 0.8) {
      const k = L.top / L.revs;
      let ang = Math.atan2(ldx, ldz); // 0 at the door (+z side), winding up
      while (ang < 0) ang += Math.PI * 2;
      for (let n = 0; n <= L.revs; n++) {
        const h = ((ang + Math.PI * 2 * n) / (Math.PI * 2)) * k;
        // the stair head is clamped flush so the hatch drop is one small step
        if (h <= L.top + 0.4 && ldd > 1.0) cands.push(Math.min(h, L.top));
      }
      // round top deck. The deck only carries you when you are AT deck level —
      // while you are below it on the stairs it must never yank you up through
      // the floor. The open hatch is a hole from both sides: step in from the
      // deck and you drop onto the stair head; climb the stairs and you rise
      // out through it.
      if (ldd < 4.0) {
        const inHatch = ldx > -0.78 && ldx < 0.78 && ldz > 1.25 && ldz < 2.78;
        const hatchOpen = this.lhHatch && this.lhHatch.open;
        if (!(inHatch && hatchOpen) && y >= L.top - 0.05) cands.push(L.top + 0.14);
      }
    }
    // the nest: climb the woven rim, drop into the bowl where the eggs lie
    const NE = CFG.nest;
    const nd = Math.hypot(x - NE.x, z - NE.z);
    if (nd < NE.r + 0.6) cands.push(nd > NE.r * 0.7 ? 0.62 : 0.3);
    // floor-2 plate (minus atrium and the two ramp wells)
    if (this.inRuin(x, z)) {
      const A = R.atrium;
      const overAtrium = x > A.x0 && x < A.x1 && z > A.z0 && z < A.z1;
      const overStairs = x > -8.4 && x < -0.6 && z > 4.6;   // south-west stairwell
      if (!overAtrium && !overStairs) cands.push(R.floor2);
      // the roof is not walkable — floors stop at the first floor
    }
    let best = 0;
    for (const c of cands) if (c <= y + 0.7 && c > best) best = c;
    return best;
  }

  // ---------- construction ----------
  build() {
    const A = this.assets;
    const tex = (bank, id, rx, ry) => {
      const t = bank[id];
      if (!t) return null;
      const m = t.clone();
      m.wrapS = m.wrapT = THREE.RepeatWrapping;
      m.repeat.set(rx, ry);
      m.needsUpdate = true;
      return m;
    };
    this.mat = (id, rx, ry, fallback) => new THREE.MeshStandardMaterial({
      map: tex(A.tex, id, rx, ry), normalMap: tex(A.texN, id, rx, ry),
      color: A.tex[id] ? 0xffffff : fallback, roughness: 1, metalness: 0,
    });
    const mat = this.mat;

    // ground — sized for the map plus the frontier ring
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), mat("t_grass", 280, 280, 0x4a5540));   // update 36: sized for the 763 m square
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);

    // winding sandy path: one quad per segment
    const sandMat = mat("t_sandpath", 1.4, 7, 0x8a7a5c);
    this.pathSegs.forEach(([[ax, az], [bx, bz]], i) => {
      const len = Math.hypot(bx - ax, bz - az) + 2.4;
      const p = new THREE.Mesh(new THREE.PlaneGeometry(CFG.world.pathWidth, len), sandMat);
      p.rotation.x = -Math.PI / 2;
      p.rotation.z = -Math.atan2(bx - ax, -(bz - az));
      p.position.set((ax + bx) / 2, 0.02 + i * 0.001, (az + bz) / 2);
      this.scene.add(p);
    });

    // forest-floor patches under the tree ring
    const ffMat = mat("t_forestfloor", 22, 22, 0x3a4232);
    for (const [px, pz] of [[-95, -95], [95, -95], [-105, 40], [105, 40],
      [-200, -160], [200, -160], [-200, 160], [230, 140], [0, -215], [0, 215],
      [-280, 80], [280, -80], [90, 280], [-90, -280], [-240, 240], [250, 220]]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(150, 150), ffMat);
      p.rotation.x = -Math.PI / 2;
      p.position.set(px, 0.01, pz);
      this.scene.add(p);
    }
    // update 28: the EXPANDED outer ring walks on brown forest floor too —
    // patches all along the frontier band (the mountain corner keeps its rock)
    for (const [px, pz] of [
      [-88, -468], [92, -468], [272, -468], [452, -468],                       // north edge
      [468, -448], [468, -268], [468, -88], [468, 92], [468, 272], [468, 452], // east edge
      [-448, 468], [-268, 468], [-88, 468], [92, 468], [272, 468],             // south edge
      [-468, -88], [-468, 92], [-468, 272], [-468, 452],                       // west edge
    ]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(150, 150), ffMat);
      p.rotation.x = -Math.PI / 2;
      p.position.set(px, 0.01, pz);
      this.scene.add(p);
    }
    // update 29: ring6 walks on forest floor too — a second rank of patches
    // along the new frontier (the mountain corner keeps its rock)
    for (const [px, pz] of [
      [-88, -574], [92, -574], [272, -574], [452, -574], [574, -574],                       // north edge + NE corner
      [574, -448], [574, -268], [574, -88], [574, 92], [574, 272], [574, 452], [574, 574],  // east edge + SE corner
      [-448, 574], [-268, 574], [-88, 574], [92, 574], [272, 574], [-574, 574],             // south edge + SW corner
      [-574, -88], [-574, 92], [-574, 272], [-574, 452],                                    // west edge
    ]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(150, 150), ffMat);
      p.rotation.x = -Math.PI / 2;
      p.position.set(px, 0.01, pz);
      this.scene.add(p);
    }

    // update 36: ring7 walks on forest floor too — a fourth rank along the new frontier
    for (let a = -700; a <= 700; a += 175) {
      for (const [px, pz] of [[a, -700], [a, 700], [-700, a], [700, a]]) {
        if (this.desert.inDesert(px, pz)) continue;   // the sand is its own ground
        const p = new THREE.Mesh(new THREE.PlaneGeometry(180, 180), ffMat);
        p.rotation.x = -Math.PI / 2;
        p.position.set(px, 0.01, pz);
        this.scene.add(p);
      }
    }
    this.buildRuin();
    this.buildHut();
    this.buildTrees();
    this.buildBoulders();
    this.buildGrass();
    this.buildTwigs();
    this.desert.build(this.assets, this.scene, this.rng);   // update 36: sand, river, bridges, oasis, cacti, the tent
    this.buildChests();
    this.buildApples();
    this.buildLake();
    this.buildLighthouse();
    this.buildNest();
    this.buildContainer();
    this.buildCamp();
    this.buildRuinsVillage();
    buildFarm(this);           // update 29: Dirk's farm (south-east)
    this.buildMountain();
    this.buildLights();
    this.tempFires = [];
    // pre-warmed campfire light pool: adding a NEW PointLight mid-game
    // changes the light count and forces a full shader recompile — the
    // one-second freeze when placing a campfire. These lights exist from
    // frame one; campfires only borrow them.
    this.fireLightPool = [];
    for (let i = 0; i < 5; i++) {
      const l = new THREE.PointLight(0xd07a30, 0, CFG.tempFire.dist, 2);
      l.position.set(0, -60, 0);
      this.scene.add(l);
      this.fireLightPool.push(l);
    }
  }

  // ---- update 16: the ROCKY MOUNTAIN heightfield (north-west corner) ----
  // Piecewise profile measured from the world corner: walkable lower slope,
  // a sheer anchor-only cliff band, the high shelf, then the world's-end peak.
  mountainH(x, z) {
    const M = CFG.mountain;
    const dx = x - M.cx, dz = z - M.cz;
    const d = Math.hypot(dx, dz);
    if (d >= M.r) return 0;
    // Jabb's hut sits on a levelled pad cut into the slope
    const hd = Math.hypot(x - M.hut.x, z - M.hut.z);
    if (hd < 12) {
      const padH = this.mountainProfile(Math.hypot(M.hut.x - M.cx, M.hut.z - M.cz));
      const raw = this.mountainProfile(d);
      return hd < 8 ? padH : padH + (raw - padH) * (hd - 8) / 4;
    }
    return this.mountainProfile(d);
  }
  mountainProfile(d) {
    const M = CFG.mountain;
    if (d >= M.r) return 0;
    if (d > M.cliffLo) return M.walkTop * (M.r - d) / (M.r - M.cliffLo);
    if (d > M.cliffHi) return M.walkTop + (M.plateauH - M.walkTop) * (M.cliffLo - d) / (M.cliffLo - M.cliffHi);
    if (d > M.wallD) return M.plateauH;
    return M.plateauH + (M.wallD - d) * 0.65; // the unreachable summit
  }
  inMountain(x, z) { return this.mountainH(x, z) > 0.35; }

  // all lake circles (main body + lobes)
  lakeCircles() {
    const L = CFG.lake;
    return [{ x: L.x, z: L.z, r: L.r }, ...L.lobes];
  }
  // >0 = inside the water, measured from the nearest shore
  lakePenetration(x, z) {
    let best = -1e9;
    for (const c of this.lakeCircles()) best = Math.max(best, c.r - Math.hypot(x - c.x, z - c.z));
    return best;
  }
  // keep new-area structures clear of vegetation
  inNewLandmark(x, z, pad = 6) {
    const H = CFG.lighthouse, N = CFG.nest, C = CFG.container;
    if (this.lakePenetration(x, z) > -(pad + CFG.lake.beach)) return true;
    if (Math.hypot(x - H.x, z - H.z) < H.r + pad + 3) return true;
    if (Math.hypot(x - N.x, z - N.z) < N.r + pad) return true;
    if (Math.abs(x - C.x) < C.w / 2 + pad && Math.abs(z - C.z) < C.d / 2 + pad) return true;
    if (Math.hypot(x - CFG.camp.x, z - CFG.camp.z) < CFG.camp.r + pad + 2) return true;
    if (Math.hypot(x - CFG.ruins.x, z - CFG.ruins.z) < 32 + pad) return true;
    // update 29: the farm compound — house, garden, field and pasture stay clear
    if (Math.abs(x - CFG.farm.x) < CFG.farm.hw + pad && Math.abs(z - CFG.farm.z) < CFG.farm.hd + pad) return true;
    return false;
  }

  // update 35: "the forest" — anywhere among the trees: outside the open field,
  // inside the map's edge, and not in a landmark, the farm, the camp, the
  // mountain, the dungeon or the lake. Elisia is only ever met here.
  inForest(x, z) {
    const W = CFG.world;
    if (Math.hypot(x, z) < W.treeMinR) return false;
    if (Math.max(Math.abs(x), Math.abs(z)) > W.square - 8) return false;
    if (this.inMountain(x, z) || this.inNewLandmark(x, z, 10)) return false;
    if (inFarm(x, z) || this.inCamp(x, z)) return false;
    if (this.dungeon && this.inDungeon(x, z)) return false;
    if (this.lakePenetration(x, z) > -8) return false;
    if (this.desert.inDesert(x, z) || this.desert.riverDist(x, z) < 20) return false;   // update 36
    return true;
  }

  // open-field check for the mother: is there ANY cover near this point?
  // Trees and boulders both register in the tree grid, so one query covers both.
  nearCover(x, z) {
    const r = CFG.mother.coverR;
    for (const t of this.treesNear(x, z)) {
      if (Math.hypot(x - t.x, z - t.z) < r + t.r) return true;
    }
    return false;
  }

  // ---- the lake: shaped water with real texture, a sand beach, shallow wading
  buildLake() {
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x8fb2b8, transparent: true, opacity: 0.88,
      roughness: 0.12, metalness: 0.08,
    });
    const wTex = this.assets.tex.t_water;
    if (wTex) {
      const t = wTex.clone();
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(7, 7);
      t.needsUpdate = true;
      waterMat.map = t;
      waterMat.color.setHex(0xffffff);
      this.waterTex = t;
    } else waterMat.color.setHex(0x2e4a52);
    const beachMat = this.mat("t_beach", 9, 9, 0x9a8a68);
    const bedMat = new THREE.MeshStandardMaterial({ color: 0x1c2a26, roughness: 1 });
    for (const c of this.lakeCircles()) {
      const beach = new THREE.Mesh(new THREE.CircleGeometry(c.r + CFG.lake.beach, 40), beachMat);
      beach.rotation.x = -Math.PI / 2;
      beach.position.set(c.x, 0.02, c.z);
      const bed = new THREE.Mesh(new THREE.CircleGeometry(c.r * 0.985, 40), bedMat);
      bed.rotation.x = -Math.PI / 2;
      bed.position.set(c.x, 0.035, c.z);
      const water = new THREE.Mesh(new THREE.CircleGeometry(c.r, 40), waterMat);
      water.rotation.x = -Math.PI / 2;
      water.position.set(c.x, 0.32, c.z);
      this.scene.add(beach, bed, water);
    }
  }
  nearShore(x, z) {
    const pen = this.lakePenetration(x, z);
    return pen > -4 && pen < CFG.lake.wade + 0.5;
  }

  // split a generated door model into FRAME (static) and LEAF (swings):
  // vertices near the center-bottom belong to the leaf, the rest is frame.
  splitDoorLeaf(model) {
    let mesh = null;
    model.traverse((o) => { if (o.isMesh && !mesh) mesh = o; });
    if (!mesh || !mesh.geometry.index) return null;
    mesh.updateWorldMatrix(true, false);
    const geo = mesh.geometry.clone();
    geo.applyMatrix4(mesh.matrixWorld);
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    const size = new THREE.Vector3(); bb.getSize(size);
    const cx = (bb.min.x + bb.max.x) / 2;
    const leafHalf = size.x * 0.36, leafTop = bb.min.y + size.y * 0.88;
    const pos = geo.attributes.position, idx = geo.index;
    const leafIdx = [], frameIdx = [];
    const v = new THREE.Vector3();
    const inLeaf = (i) => {
      v.fromBufferAttribute(pos, i);
      return Math.abs(v.x - cx) < leafHalf && v.y < leafTop;
    };
    for (let t = 0; t < idx.count; t += 3) {
      const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2);
      (inLeaf(a) && inLeaf(b) && inLeaf(c) ? leafIdx : frameIdx).push(a, b, c);
    }
    if (leafIdx.length < 60 || frameIdx.length < 60) return null;
    const mk = (arr) => {
      const g2 = new THREE.BufferGeometry();
      g2.setAttribute("position", pos);
      if (geo.attributes.uv) g2.setAttribute("uv", geo.attributes.uv);
      if (geo.attributes.normal) g2.setAttribute("normal", geo.attributes.normal);
      g2.setIndex(arr);
      return new THREE.Mesh(g2, mesh.material);
    };
    return { frame: mk(frameIdx), leaf: mk(leafIdx), hingeX: cx - leafHalf };
  }

  // mount a generated door: static frame + swinging leaf; falls back to a panel
  mountDoor(asset, x, z, key) {
    const doorGrp = new THREE.Group();
    let split = null;
    if (asset) split = this.splitDoorLeaf(asset.model);
    if (split) {
      split.frame.position.set(x, 2.2 * (key === "hut" ? 1 : 0), z);
      if (key !== "hut") split.frame.position.y = 0;
      this.scene.add(split.frame);
      const leaf = split.leaf;
      leaf.position.x = -split.hingeX;
      doorGrp.add(leaf);
      doorGrp.position.set(x + split.hingeX, key === "hut" ? 2.2 : 0, z);
    } else if (asset) {
      const dm = asset.model.clone();
      dm.position.set(0.65, 0, 0);
      doorGrp.add(dm);
      doorGrp.position.set(x - 0.65, key === "hut" ? 2.2 : 0, z);
    } else {
      const doorMat = new THREE.MeshStandardMaterial({ color: 0x2e2820, roughness: 1 });
      const panel = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.05, 0.08), doorMat);
      panel.position.set(0.65, 1.03, 0);
      doorGrp.add(panel);
      doorGrp.position.set(x - 0.65, key === "hut" ? 2.2 : 0, z);
    }
    this.scene.add(doorGrp);
    return doorGrp;
  }

  // ---- the lighthouse: a tall safe tower with a helix stair and a cold beacon
  buildLighthouse() {
    const L = CFG.lighthouse;
    // generated mossy plaster textures — the proper lighthouse look
    const white = this.mat("t_lhwhite", 3.2, 1.1, 0xb8b4a6);
    const red = this.mat("t_lhred", 3.2, 1.1, 0x8c3a28);
    white.side = THREE.DoubleSide;
    red.side = THREE.DoubleSide;
    // shell: stacked, gently tapering banded cylinders (a third taller now).
    // The GROUND band has a real doorway gap cut into it — the door is
    // finally visible from the OUTSIDE instead of hiding inside the wall.
    const bands = 8, bandH = (L.top + 1.4) / bands;
    // the doorway is cut EXACTLY door-sized — the door sits alone in the
    // tower wall, no trim, no frame, nothing else around it
    const gapHalf = 0.14;
    for (let i = 0; i < bands; i++) {
      const t0 = i / bands, t1 = (i + 1) / bands;
      const rBot = L.r + 0.55 * (1 - t0), rTop = L.r + 0.55 * (1 - t1);
      const geo = i === 0
        ? new THREE.CylinderGeometry(rTop, rBot, bandH, 24, 1, true, gapHalf, Math.PI * 2 - gapHalf * 2)
        : new THREE.CylinderGeometry(rTop, rBot, bandH, 24, 1, true);
      const seg = new THREE.Mesh(geo, i % 2 ? red : white);
      seg.position.set(L.x, bandH * (i + 0.5), L.z);
      this.scene.add(seg);
    }
    // plain lighthouse wall above the door — part of the tower, not a frame
    const over = new THREE.Mesh(
      new THREE.CylinderGeometry(L.r + 0.47, L.r + 0.51, bandH - 2.25, 8, 1, true, -gapHalf, gapHalf * 2), white);
    over.position.set(L.x, 2.25 + (bandH - 2.25) / 2, L.z);
    this.scene.add(over);
    // a knife someone dropped by the stair — a fresh one appears each dawn
    this.addKnifeSpot(L.x + 1.3, L.z - 0.8, 0.05, 0.7);
    // gallery ring below the lamp
    const gallery = new THREE.Mesh(new THREE.TorusGeometry(L.r + 0.4, 0.14, 8, 26),
      new THREE.MeshStandardMaterial({ color: 0x2e3134, roughness: 0.7, metalness: 0.4 }));
    gallery.rotation.x = Math.PI / 2;
    gallery.position.set(L.x, L.top + 1.1, L.z);
    this.scene.add(gallery);
    // the generated METAL DOOR: alone in the wall, flush, and — finally —
    // its OWN collider is the one that moves when it opens. (The old code
    // captured a filler strip's collider by mistake, so the doorway stayed
    // solid even with the door wide open.)
    const doorGrp = this.mountDoor(this.assets.glb.metaldoor, L.x, L.z + L.r + 0.28, "lighthouse");
    this.addBox(L.x - 0.7, L.x + 0.7, 0, 2.4, L.z + L.r + 0.13, L.z + L.r + 0.43);
    this.lhDoor = {
      grp: doorGrp, open: false, x: L.x, z: L.z + L.r - 0.3, y: 0,
      boxRef: this.boxes[this.boxes.length - 1],
      closedBox: Object.assign({}, this.boxes[this.boxes.length - 1]),
    };
    // central column + helix steps
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, L.top + 0.5, 10), white);
    col.position.set(L.x, (L.top + 0.5) / 2, L.z);
    this.scene.add(col);
    const stepMat = this.mat("t_lhwhite", 0.8, 0.4, 0x9a978c);
    const stepGeos = [];
    const k = L.top / L.revs;
    const nSteps = L.revs * 20;
    for (let i = 0; i <= nSteps; i++) {
      const ang = (i / 20) * Math.PI * 2;
      const h = (ang / (Math.PI * 2)) * k;
      const g = new THREE.BoxGeometry(2.6, 0.14, 1.15);
      g.rotateY(-ang);
      const px = L.x + Math.sin(ang) * 2.05;
      const pz = L.z + Math.cos(ang) * 2.05;
      g.translate(px, Math.max(0.07, h), pz);
      stepGeos.push(g);
    }
    this.scene.add(new THREE.Mesh(mergeGeometries(stepGeos), stepMat));
    // top DECK: a ROUND platform matching the tower, with only the hatch
    // hole cut out of it — a circle shape with a rectangular hole, extruded.
    const deckShape = new THREE.Shape();
    deckShape.absarc(0, 0, 4.0, 0, Math.PI * 2, false);
    const hatchHole = new THREE.Path();
    hatchHole.moveTo(-0.78, -2.78);
    hatchHole.lineTo(0.78, -2.78);
    hatchHole.lineTo(0.78, -1.25);
    hatchHole.lineTo(-0.78, -1.25);
    hatchHole.closePath();
    deckShape.holes.push(hatchHole);
    const deckGeo = new THREE.ExtrudeGeometry(deckShape, { depth: 0.14, bevelEnabled: false });
    deckGeo.rotateX(-Math.PI / 2);          // lay flat: shape Y becomes -Z
    deckGeo.translate(L.x, L.top, L.z);
    const deckUv = deckGeo.attributes.uv;
    for (let i = 0; i < deckUv.count; i++) deckUv.setXY(i, deckUv.getX(i) * 0.35, deckUv.getY(i) * 0.35);
    this.scene.add(new THREE.Mesh(deckGeo, stepMat));
    // the generated TRAPDOOR: hinged at the hole's north edge, swings up
    const tdAsset = this.assets.glb.trapdoor;
    const hatch = new THREE.Group();
    if (tdAsset) {
      const td = tdAsset.model.clone();
      const tb = new THREE.Box3().setFromObject(td);
      const ts = new THREE.Vector3(); tb.getSize(ts);
      td.scale.multiplyScalar(1.62 / Math.max(ts.x, ts.z));
      td.position.z += 0.75;
      hatch.add(td);
    } else {
      // flat leaf carrying the GENERATED trapdoor art on its top face
      const woodM = this.mat("t_darkwood", 1, 1, 0x3a3226);
      let topM = woodM;
      if (this.assets.tex.t_trapdoor) {
        const tt = this.assets.tex.t_trapdoor.clone();
        tt.needsUpdate = true;
        topM = new THREE.MeshStandardMaterial({ map: tt, roughness: 1 });
      }
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.09, 1.46),
        [woodM, woodM, topM, woodM, woodM, woodM]);
      leaf.position.set(0, 0.05, 0.75);
      hatch.add(leaf);
    }
    hatch.position.set(L.x, L.top + 0.15, L.z + 1.25);
    this.scene.add(hatch);
    // a closed hatch physically blocks the last stretch of stair below it
    this.addBox(L.x - 0.78, L.x + 0.78, L.top - 1.5, L.top + 0.14, L.z + 1.25, L.z + 2.78);
    this.lhHatch = {
      grp: hatch, open: false, rotX: true,
      x: L.x, z: L.z + 2.0, y: L.top + 0.14,
      boxRef: this.boxes[this.boxes.length - 1],
      closedBox: Object.assign({}, this.boxes[this.boxes.length - 1]),
    };
    const cap = new THREE.Mesh(new THREE.ConeGeometry(L.r + 0.4, 2.2, 22), red);
    cap.position.set(L.x, L.top + 4.4, L.z);
    this.scene.add(cap);
    for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3.2, 0.18), white);
      post.position.set(L.x + ox * 2.6, L.top + 1.7, L.z + oz * 2.6);
      this.scene.add(post);
    }
    // the generated lighthouse LAMP (fresnel lens assembly)
    const lampAsset = this.assets.glb.beaconlamp;
    if (lampAsset) {
      const lamp = lampAsset.model.clone();
      lamp.position.set(L.x, L.top + 0.9, L.z);
      this.scene.add(lamp);
      this.beaconLampMeshes = [];
      lamp.traverse((o) => { if (o.isMesh) this.beaconLampMeshes.push(o); });
      this.beaconLamp = lamp.children[0] || lamp;
    } else {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.85, 14, 10),
        new THREE.MeshStandardMaterial({ color: 0x3a3a34, emissive: 0x000000, emissiveIntensity: 0 }));
      s.position.set(L.x, L.top + 2.1, L.z);
      this.scene.add(s);
      this.beaconLamp = s;
      this.beaconLampMeshes = [s];
    }
    // a bedroll up top — every safe shelter lets you sleep
    const brAsset = this.assets.glb.bedroll;
    if (brAsset) {
      const bag = brAsset.model.clone();
      bag.position.set(L.x - 2.2, L.top + 0.16, L.z - 1.3);
      bag.rotation.y = 0.9;
      this.scene.add(bag);
    }
    this.beds.push({ x: L.x - 2.2, z: L.z - 1.3, y: L.top + 0.14, label: "lighthouse" });
    this.beaconLight = new THREE.PointLight(0xffd080, 0, 140, 1.6);
    this.beaconLight.position.set(L.x, L.top + 2.3, L.z);
    this.scene.add(this.beaconLight);
    this.beacon = { x: L.x, z: L.z, y: L.top, lit: false };
  }
  inLighthouse(x, z) {
    const L = CFG.lighthouse;
    return Math.hypot(x - L.x, z - L.z) < L.r - 0.9;
  }

  // ---- the T-Rex nest, far from everything gentle: a GENERATED woven bowl
  buildNest() {
    const N = CFG.nest;
    const nestAsset = this.assets.glb.nest;
    if (nestAsset) {
      const m = nestAsset.model.clone();
      // widen to the gameplay footprint, flatten so the rim stays climbable
      const bb = new THREE.Box3().setFromObject(m);
      const size = new THREE.Vector3(); bb.getSize(size);
      const sxz = (N.r * 2.2) / Math.max(size.x, size.z);
      const sy = 1.15 / size.y;
      m.scale.set(m.scale.x * sxz, m.scale.y * sy, m.scale.z * sxz);
      m.position.set(N.x, 0.02, N.z);
      this.scene.add(m);
    } else {
      const dirt = new THREE.Mesh(new THREE.CylinderGeometry(N.r, N.r + 1.2, 0.5, 18),
        new THREE.MeshStandardMaterial({ color: 0x4a3b28, roughness: 1 }));
      dirt.position.set(N.x, 0.25, N.z);
      this.scene.add(dirt);
      const stickMat = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 1 });
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const s = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 2.2, 5), stickMat);
        s.position.set(N.x + Math.cos(a) * N.r, 0.6, N.z + Math.sin(a) * N.r);
        s.rotation.set(0.9, a, 0.3);
        this.scene.add(s);
      }
    }
    // the eggs: bigger now, half-sunk in the bowl floor
    this.nestEggs = [];
    const eggAsset = this.assets.glb.dinoegg;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      let m;
      if (eggAsset) m = eggAsset.model.clone();
      else {
        m = new THREE.Mesh(new THREE.SphereGeometry(0.46, 12, 9),
          new THREE.MeshStandardMaterial({ color: 0xcfc0a0, roughness: 0.7 }));
        m.scale.y = 1.35;
      }
      m.position.set(N.x + Math.cos(a) * 1.5, nestAsset ? 0.34 : 0.5, N.z + Math.sin(a) * 1.5);
      m.rotation.y = a * 2;
      this.scene.add(m);
      this.nestEggs.push(m);
    }
    this.nest = { x: N.x, z: N.z, r: N.r };
  }

  // ---- the sea container: a rusted safe room lost in the deepest jungle ----
  buildContainer() {
    const C = CFG.container;
    const W2 = C.w / 2, D2 = C.d / 2, H = C.h;
    const wallMat = this.mat("t_container", 3.2, 1.3, 0x6a4a38);
    wallMat.side = THREE.DoubleSide;
    wallMat.color.setHex(0xb8b0a8);   // mute the rust into the fog palette
    const endMat = this.mat("t_container", 1.4, 1.3, 0x6a4a38);
    endMat.side = THREE.DoubleSide;
    endMat.color.setHex(0xb8b0a8);
    const floorMat = this.mat("t_metalfloor", 3.4, 1.5, 0x4a4a48);
    const box = (cx, cy, cz, sx, sy, sz, m = wallMat, collide = true) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m);
      b.position.set(C.x + cx, cy, C.z + cz);
      this.scene.add(b);
      if (collide) this.addBox(C.x + cx - sx / 2, C.x + cx + sx / 2, cy - sy / 2, cy + sy / 2, C.z + cz - sz / 2, C.z + cz + sz / 2);
    };
    box(0, 0.05, 0, C.w, 0.1, C.d, floorMat, false);            // steel floor
    // long north wall — with a small WINDOW cut into it (look outside from
    // safety). Wall segments draw around the opening; one collider seals it.
    const wx = 0.9, wy0 = 1.15, wy1 = 1.75, ww = 0.8;            // window rect
    box((-W2 + (wx - ww / 2)) / 2, H / 2, -D2, (wx - ww / 2) + W2, H, 0.09, wallMat, false);
    box((wx + ww / 2 + W2) / 2, H / 2, -D2, W2 - (wx + ww / 2), H, 0.09, wallMat, false);
    box(wx, wy0 / 2, -D2, ww, wy0, 0.09, wallMat, false);
    box(wx, (wy1 + H) / 2, -D2, ww, H - wy1, 0.09, wallMat, false);
    this.addBox(C.x - W2, C.x + W2, 0, H, C.z - D2 - 0.05, C.z - D2 + 0.05);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(ww, wy1 - wy0),
      new THREE.MeshStandardMaterial({ color: 0xaebfc2, transparent: true, opacity: 0.22, roughness: 0.1, side: THREE.DoubleSide }));
    glass.position.set(C.x + wx, (wy0 + wy1) / 2, C.z - D2);
    this.scene.add(glass);
    const sillMat = this.mat("t_darkwood", 0.8, 0.3, 0x3a3226);
    for (const [sy, sw, sh] of [[wy0 - 0.04, ww + 0.12, 0.08], [wy1 + 0.04, ww + 0.12, 0.08]]) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(sw, sh, 0.14), sillMat);
      s.position.set(C.x + wx, sy, C.z - D2);
      this.scene.add(s);
    }
    box(0, H / 2, D2, C.w, H, 0.09);                             // long south wall
    box(-W2, H / 2, 0, 0.09, H, C.d, endMat);                    // sealed west end
    box(0, H + 0.06, 0, C.w + 0.1, 0.12, C.d + 0.1, wallMat, false); // roof
    // east end: the doorway — jambs, lintel, and a swinging steel leaf
    box(W2, H / 2, -(0.66 + (D2 - 0.66) / 2), 0.09, H, D2 - 0.66, endMat);
    box(W2, H / 2, 0.66 + (D2 - 0.66) / 2, 0.09, H, D2 - 0.66, endMat);
    box(W2, 2.2 + (H - 2.2) / 2, 0, 0.09, H - 2.2, 1.4, endMat, false);
    const leafGrp = new THREE.Group();
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.2, 1.3), endMat);
    leaf.position.set(0, 1.1, 0.65);
    // a faded safety-orange handle bar — the interactable accent
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.08),
      new THREE.MeshStandardMaterial({ color: 0xb06a2c, roughness: 0.7 }));
    handle.position.set(-0.09, 1.15, 1.1);
    leafGrp.add(leaf, handle);
    leafGrp.position.set(C.x + W2, 0, C.z - 0.65);
    this.scene.add(leafGrp);
    this.addBox(C.x + W2 - 0.08, C.x + W2 + 0.08, 0, 2.2, C.z - 0.65, C.z + 0.65);
    this.containerDoor = {
      grp: leafGrp, open: false, x: C.x + W2, z: C.z, y: 0,
      boxRef: this.boxes[this.boxes.length - 1],
      closedBox: Object.assign({}, this.boxes[this.boxes.length - 1]),
    };
    // corner campfire: warm light inside, cooks meat like any campfire
    const fg = new THREE.Group();
    const logMat = this.mat("t_bark", 1.2, 0.5, 0x4a3b28);
    for (let i = 0; i < 3; i++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.6, 6), logMat);
      log.rotation.z = Math.PI / 2.3;
      log.rotation.y = (i / 3) * Math.PI * 2;
      log.position.y = 0.12;
      fg.add(log);
    }
    const flameTex = this.assets.flame || new THREE.CanvasTexture(makeFlameCanvas());
    const fm = new THREE.MeshBasicMaterial({
      map: flameTex, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const cFlames = [];
    for (const rot of [0, Math.PI / 2]) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.62), fm);
      f.position.y = 0.42;
      f.rotation.y = rot;
      fg.add(f);
      cFlames.push(f);
    }
    const cLight = new THREE.PointLight(0xd07a30, 9, 8, 2);
    cLight.position.y = 0.9;
    fg.add(cLight);
    fg.position.set(C.x - W2 + 0.85, 0.08, C.z - D2 + 0.75);
    this.scene.add(fg);
    this.containerFire = { x: C.x - W2 + 0.85, z: C.z - D2 + 0.75, y: 0, flames: cFlames, light: cLight };
    // a tinderbox on the floor — a fresh one washes up every morning
    const ctb = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.09, 0.15),
      new THREE.MeshStandardMaterial({ color: 0x6a6d70, roughness: 0.65, metalness: 0.4 }));
    ctb.position.set(C.x + 1.6, 0.15, C.z - D2 + 0.55);
    ctb.rotation.y = -0.4;
    this.scene.add(ctb);
    this.containerTinderMesh = ctb;
    this.containerTinder = { x: C.x + 1.6, z: C.z - D2 + 0.55, y: 0.1 };
    // the second daily knife lies beside it — the container is a survival cache
    this.addKnifeSpot(C.x + 1.0, C.z - D2 + 0.9, 0.05, -1.1);
    // a bedroll along the south wall — sleep out the night behind steel
    const brAsset = this.assets.glb.bedroll;
    if (brAsset) {
      const bag = brAsset.model.clone();
      bag.position.set(C.x - 0.6, 0.1, C.z + D2 - 0.72);
      bag.rotation.y = Math.PI / 2;
      this.scene.add(bag);
    }
    this.beds.push({ x: C.x - 0.6, z: C.z + D2 - 0.72, y: 0.08, label: "container" });
    // the generated lantern outside marks the door through the night murk
    const lnAsset = this.assets.glb.lantern;
    if (lnAsset) {
      const ln = lnAsset.model.clone();
      ln.position.set(C.x + W2 + 0.35, 1.85, C.z + 1.05);
      this.scene.add(ln);
    }
    const cPorch = new THREE.PointLight(0xd89a4a, 8, 12, 2);
    cPorch.position.set(C.x + W2 + 0.5, 2.1, C.z + 1.0);
    this.scene.add(cPorch);
  }
  inContainer(x, z) {
    const C = CFG.container;
    return Math.abs(x - C.x) < C.w / 2 - 0.15 && Math.abs(z - C.z) < C.d / 2 - 0.15;
  }

  // ---- update 9: the CAMPING — a fenced circle of firelight in the west ----
  buildCamp() {
    const CP = CFG.camp;
    // trodden campsite earth (generated texture once it lands)
    const dirtId = this.assets.tex.t_campdirt ? "t_campdirt" : "t_dirtpath";
    const pad = new THREE.Mesh(new THREE.CircleGeometry(CP.r + 2.5, 26), this.mat(dirtId, 7, 7, 0x6a5a42));
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(CP.x, 0.03, CP.z);
    this.scene.add(pad);
    // the BIG campfire: the GENERATED fire pit when available, with the
    // living flames and light always on top
    const fg = new THREE.Group();
    const cfAsset = this.assets.glb.campfire;
    if (cfAsset) {
      const base = cfAsset.model.clone();
      const cb = new THREE.Box3().setFromObject(base);
      const cs = new THREE.Vector3(); cb.getSize(cs);
      base.scale.multiplyScalar(2.6 / Math.max(cs.x, cs.z));
      fg.add(base);
    } else {
      const stoneMat = this.mat("t_romanstone", 0.4, 0.4, 0x83887c);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const st = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.26, 0.3), stoneMat);
        st.position.set(Math.cos(a) * 1.15, 0.13, Math.sin(a) * 1.15);
        st.rotation.y = a;
        fg.add(st);
      }
      const logMat = this.mat("t_bark", 1.2, 0.5, 0x4a3b28);
      for (let i = 0; i < 4; i++) {
        const log = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 1.5, 6), logMat);
        log.rotation.z = Math.PI / 2.4;
        log.rotation.y = (i / 4) * Math.PI * 2;
        log.position.y = 0.3;
        fg.add(log);
      }
    }
    const flameTex = this.assets.flame || new THREE.CanvasTexture(makeFlameCanvas());
    const fm = new THREE.MeshBasicMaterial({
      map: flameTex, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const cpFlames = [];
    for (const rot of [0, Math.PI / 3, Math.PI * 2 / 3]) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.8), fm);
      f.position.y = 1.05;
      f.rotation.y = rot;
      fg.add(f);
      cpFlames.push(f);
    }
    const cpLight = new THREE.PointLight(0xd07a30, 22, 24, 2);
    cpLight.position.y = 1.6;
    fg.add(cpLight);
    fg.position.set(CP.x, 0.02, CP.z);
    this.scene.add(fg);
    this.campFire = { x: CP.x, z: CP.z, y: 0, flames: cpFlames, light: cpLight };
    this.addBox(CP.x - 1.2, CP.x + 1.2, 0, 0.5, CP.z - 1.2, CP.z + 1.2);
    // the WOODEN FENCE ring, one gate gap. Tiny, but the beasts respect it —
    // invisible collision circles do the real work; the GENERATED fence
    // segment model dresses the ring once it lands (procedural rails until then).
    const woodMat = this.mat("t_darkwood", 0.5, 1.0, 0x4a3b28);
    const fenceAsset = this.assets.glb.fence;
    const postGeos = [], railGeos = [];
    let fenceSize = null;
    if (fenceAsset) {
      const fb = new THREE.Box3().setFromObject(fenceAsset.model);
      fenceSize = new THREE.Vector3();
      fb.getSize(fenceSize);
    }
    const inGate = (a) => {
      let d = a - CP.gateA;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      return Math.abs(d) < CP.gateHalf;
    };
    const nPosts = 42;
    for (let i = 0; i < nPosts; i++) {
      const a = (i / nPosts) * Math.PI * 2;
      if (inGate(a)) continue;
      const px = CP.x + Math.cos(a) * CP.r, pz = CP.z + Math.sin(a) * CP.r;
      this.addTree(px, pz, 0.62); // collision circles — nothing squeezes through
      const a2 = ((i + 1) / nPosts) * Math.PI * 2;
      const gap2 = inGate(a2);
      const qx = CP.x + Math.cos(a2) * CP.r, qz = CP.z + Math.sin(a2) * CP.r;
      if (fenceAsset && !gap2) {
        const seg = fenceAsset.model.clone();
        const segLen = Math.hypot(qx - px, qz - pz);
        seg.scale.multiplyScalar(segLen / Math.max(fenceSize.x, fenceSize.z, 0.01));
        seg.position.set((px + qx) / 2, 0, (pz + qz) / 2);
        seg.rotation.y = -Math.atan2(qz - pz, qx - px);
        this.scene.add(seg);
        continue;
      }
      const post = new THREE.BoxGeometry(0.14, 1.05, 0.14);
      post.translate(px, 0.52, pz);
      postGeos.push(post);
      if (gap2) continue;
      for (const ry of [0.45, 0.9]) {
        const rail = new THREE.BoxGeometry(Math.hypot(qx - px, qz - pz) + 0.05, 0.07, 0.07);
        rail.rotateY(-Math.atan2(qz - pz, qx - px));
        rail.translate((px + qx) / 2, ry, (pz + qz) / 2);
        railGeos.push(rail);
      }
    }
    if (postGeos.length) this.scene.add(new THREE.Mesh(mergeGeometries(postGeos), woodMat));
    if (railGeos.length) this.scene.add(new THREE.Mesh(mergeGeometries(railGeos), woodMat));
    // the three tents: one generated model, three owners, three colors
    const tentAsset = this.assets.glb.tent;
    for (const t of CP.tents) {
      const tx = CP.x + Math.cos(t.a) * CP.tentDist;
      const tz = CP.z + Math.sin(t.a) * CP.tentDist;
      if (tentAsset) {
        const m = tentAsset.model.clone();
        m.traverse((o) => {
          if (o.isMesh) {
            o.material = o.material.clone();
            o.material.color = new THREE.Color(t.color);
          }
        });
        m.position.set(tx, 0.02, tz);
        m.rotation.y = t.a + Math.PI / 2;
        this.scene.add(m);
      } else {
        const m = new THREE.Mesh(new THREE.ConeGeometry(1.2, 1.5, 4),
          new THREE.MeshStandardMaterial({ color: t.color, roughness: 1 }));
        m.position.set(tx, 0.75, tz);
        this.scene.add(m);
      }
      this.addBox(tx - 1.0, tx + 1.0, 0, 1.4, tz - 1.0, tz + 1.0);
      if (t.id === "red") this.campBed = { x: tx + 1.6, z: tz + 0.4, y: 0 };
      if (t.id === "blue") {
        // the campers' COOL BOX: parked beside the blue tent, restocked with
        // one bottle of wine a day — the camp's answer to the bar fridge
        const bx = tx + Math.cos(t.a + Math.PI / 2) * 1.8;
        const bz = tz + Math.sin(t.a + Math.PI / 2) * 1.8;
        const cbAsset = this.assets.glb.coolbox;
        if (cbAsset) {
          // the GENERATED cooler — the real thing, scuffs and all
          const m = cbAsset.model.clone();
          m.position.set(bx, 0.02, bz);
          m.rotation.y = t.a;
          this.scene.add(m);
        } else {
          const cg = new THREE.Group();
          const body = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.44, 0.46),
            new THREE.MeshStandardMaterial({ color: 0xdde2e4, roughness: 0.55 }));
          body.position.y = 0.24;
          const lid = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.1, 0.5),
            new THREE.MeshStandardMaterial({ color: 0x33507a, roughness: 0.5 }));
          lid.position.y = 0.5;
          const handle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.3),
            new THREE.MeshStandardMaterial({ color: 0x33507a, roughness: 0.5 }));
          handle.position.set(0.38, 0.3, 0);
          cg.add(body, lid, handle);
          cg.position.set(bx, 0.02, bz);
          cg.rotation.y = t.a;
          this.scene.add(cg);
        }
        this.addBox(bx - 0.42, bx + 0.42, 0, 0.6, bz - 0.3, bz + 0.3);
        this.coolBox = { x: bx, z: bz, y: 0.3 };
      }
    }
    // Hans's wooden chest by the red tent (unlocked by the rescue)
    const wcAsset = this.assets.glb.woodchest;
    const red = CP.tents.find((t) => t.id === "red");
    const cx = CP.x + Math.cos(red.a) * CP.tentDist + 1.6, cz = CP.z + Math.sin(red.a) * CP.tentDist - 1.4;
    if (wcAsset) {
      const wc = wcAsset.model.clone();
      wc.position.set(cx, 0.02, cz);
      wc.rotation.y = red.a;
      this.scene.add(wc);
    }
    this.addBox(cx - 0.45, cx + 0.45, 0, 0.7, cz - 0.4, cz + 0.4);
    this.campChest = { x: cx, z: cz, y: 0 };
    // where the campers stand
    this.hansPos = { x: CP.x + 2.6, z: CP.z - 1.8, yaw: -2.2 };
    this.emilyPos = { x: CP.x - 2.4, z: CP.z + 2.0, yaw: 0.9 };
    this.timoCampPos = { x: CP.x + 0.5, z: CP.z + 3.2, yaw: Math.PI };
  }
  inCamp(x, z) {
    const CP = CFG.camp;
    return Math.hypot(x - CP.x, z - CP.z) < CP.r - 0.3;
  }

  // ---- update 9/10: the OLD RUINS — a dead medieval village, done properly ----
  buildRuinsVillage() {
    const RV = CFG.ruins;
    const rng = this.rng;
    const A = this.assets;
    // lighter, readable stone — the old tints rendered near-black in the fog
    const stoneMat = this.mat("t_romanstone", 3, 1.2, 0x9a9a90);
    stoneMat.color.setHex(0xcfccc2);
    // ruined masonry: the generated cracked-brick texture. A neutral tint —
    // any stronger and the walls wash out to white in the fog again.
    const stoneMat2 = this.mat("t_ruinbrick", 2.4, 1.2, 0x8a8578);
    if (A.tex.t_ruinbrick) stoneMat2.color.setHex(0xd8d2c6);
    const plankMat = this.mat("t_woodplank", 2, 1, 0x6a5a42);
    const beamMat = this.mat("t_darkwood", 1.4, 0.4, 0x3a3226);
    // packed-earth clearing
    const pad = new THREE.Mesh(new THREE.CircleGeometry(30, 28), this.mat("t_forestfloor", 9, 9, 0x4a4438));
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(RV.x, 0.03, RV.z);
    this.scene.add(pad);
    // COBBLED SQUARE + PATHS — a medieval village walks on stone, not dirt.
    // (Uses the generated cobblestone texture; roman stone stands in until
    // the t_cobble generation lands.)
    const cobbleId = A.tex.t_cobble ? "t_cobble" : "t_romanstone";
    const plazaMat = this.mat(cobbleId, 7, 7, 0x8a887e);
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(7.2, 22), plazaMat);
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.set(RV.x, 0.06, RV.z);
    this.scene.add(plaza);
    const pathTo = (cx, cz, w = 2.4) => {
      const len = Math.hypot(cx, cz) + 1;
      const pm = this.mat(cobbleId, Math.max(1, len / 3.4), 1, 0x8a887e);
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(len, w), pm);
      strip.rotation.x = -Math.PI / 2;
      strip.rotation.z = -Math.atan2(cz, cx);
      strip.position.set(RV.x + cx / 2, 0.055, RV.z + cz / 2);
      this.scene.add(strip);
    };
    pathTo(-11, -7);   // to the stone house
    pathTo(11, -9);    // to the church
    pathTo(-1, 11);    // to the bar
    pathTo(-4, -16);   // to the fallen house with the nest
    pathTo(14, 7, 2);  // out toward the broken homes
    const wall = (cx, cy, cz, sx, sy, sz, m = stoneMat) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m);
      b.position.set(RV.x + cx, cy, RV.z + cz);
      this.scene.add(b);
      this.addBox(RV.x + cx - sx / 2, RV.x + cx + sx / 2, cy - sy / 2, cy + sy / 2, RV.z + cz - sz / 2, RV.z + cz + sz / 2);
    };
    // a BROKEN wall: a run of stacked segments with a jagged crumbling top
    const brokenWall = (cx, cz, len, along, hBase, m = stoneMat) => {
      const segs = Math.max(3, Math.round(len / 1.1));
      const segL = len / segs;
      for (let i = 0; i < segs; i++) {
        const h = Math.max(0.5, hBase * (0.5 + rng() * 0.65));
        const off = (i + 0.5) * segL - len / 2;
        const sx = along === "x" ? segL + 0.04 : 0.42;
        const sz = along === "x" ? 0.42 : segL + 0.04;
        const b = new THREE.Mesh(new THREE.BoxGeometry(sx, h, sz), m);
        b.position.set(RV.x + cx + (along === "x" ? off : 0), h / 2, RV.z + cz + (along === "x" ? 0 : off));
        b.rotation.y = (rng() - 0.5) * 0.04;
        this.scene.add(b);
      }
      const bx0 = cx - (along === "x" ? len / 2 : 0.21), bx1 = cx + (along === "x" ? len / 2 : 0.21);
      const bz0 = cz - (along === "x" ? 0.21 : len / 2), bz1 = cz + (along === "x" ? 0.21 : len / 2);
      this.addBox(RV.x + bx0, RV.x + bx1, 0, hBase * 0.5, RV.z + bz0, RV.z + bz1);
    };
    // RUBBLE: heaps of fallen stone where walls gave up
    const boulderAsset = A.glb.boulder;
    const rubble = (cx, cz, n = 5, spread = 1.4) => {
      for (let i = 0; i < n; i++) {
        const a = rng() * Math.PI * 2, d = rng() * spread;
        if (boulderAsset && rng() < 0.55) {
          const rb = boulderAsset.model.clone();
          const s = 0.16 + rng() * 0.2;
          rb.scale.multiplyScalar(s);
          rb.position.set(RV.x + cx + Math.cos(a) * d, -0.12 * s, RV.z + cz + Math.sin(a) * d);
          rb.rotation.y = rng() * Math.PI * 2;
          this.scene.add(rb);
        } else {
          const st = new THREE.Mesh(new THREE.BoxGeometry(0.28 + rng() * 0.3, 0.2 + rng() * 0.2, 0.24 + rng() * 0.3), rng() < 0.5 ? stoneMat : stoneMat2);
          st.position.set(RV.x + cx + Math.cos(a) * d, 0.1, RV.z + cz + Math.sin(a) * d);
          st.rotation.set(rng() * 0.4, rng() * Math.PI, rng() * 0.4);
          this.scene.add(st);
        }
      }
    };
    // a fallen charred roof BEAM leaning where the roof used to be
    const beam = (cx, cz, yaw, len = 3.4, tilt = 0.5) => {
      const bm = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, len, 6), beamMat);
      bm.rotation.set(Math.PI / 2 - tilt, yaw, 0, "YXZ");
      bm.position.set(RV.x + cx, Math.sin(tilt) * len * 0.4, RV.z + cz);
      this.scene.add(bm);
    };
    // the dry FOUNTAIN in the village square — large, carved, and BONE dry.
    // The generated model dresses the square when it loads; the procedural
    // stone fountain stays as the fallback.
    const fnAsset = this.assets.glb.fountain;
    if (fnAsset) {
      const fn = fnAsset.model.clone();
      const fnB = new THREE.Box3().setFromObject(fn);
      const fnS = new THREE.Vector3(); fnB.getSize(fnS);
      fn.scale.multiplyScalar(5.4 / Math.max(fnS.x, fnS.z, 0.01)); // footprint rules — the square deserves a LARGE centerpiece
      fn.position.set(RV.x, 0.02, RV.z);
      this.scene.add(fn);
    } else {
      const fBasin = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 2.9, 0.95, 18, 1, true), stoneMat);
      fBasin.position.set(RV.x, 0.48, RV.z);
      const fRim = new THREE.Mesh(new THREE.TorusGeometry(2.75, 0.16, 8, 20), stoneMat);
      fRim.rotation.x = Math.PI / 2;
      fRim.position.set(RV.x, 0.96, RV.z);
      const fFloor = new THREE.Mesh(new THREE.CylinderGeometry(2.65, 2.65, 0.4, 18), stoneMat2);
      fFloor.position.set(RV.x, 0.2, RV.z);
      const fPillar = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.46, 2.0, 10), stoneMat);
      fPillar.position.set(RV.x, 1.35, RV.z);
      const fBowl = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 0.55, 0.4, 14, 1, true), stoneMat);
      fBowl.position.set(RV.x, 2.35, RV.z);
      const fBowlFloor = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.1, 14), stoneMat2);
      fBowlFloor.position.set(RV.x, 2.25, RV.z);
      this.scene.add(fBasin, fRim, fFloor, fPillar, fBowl, fBowlFloor);
    }
    this.addBox(RV.x - 2.7, RV.x + 2.7, 0, 1.0, RV.z - 2.7, RV.z + 2.7);
    // THE STONE HOUSE (intact): a bed and a chest behind thick walls — safe
    const H = { x: -11, z: -7, w: 6.2, d: 5.2, h: 2.7 };
    this.ruinsHouse = { x0: RV.x + H.x - H.w / 2, x1: RV.x + H.x + H.w / 2, z0: RV.z + H.z - H.d / 2, z1: RV.z + H.z + H.d / 2 };
    wall(H.x, H.h / 2, H.z - H.d / 2, H.w, H.h, 0.4);                        // north
    wall(H.x - H.w / 2, H.h / 2, H.z, 0.4, H.h, H.d);                        // west
    wall(H.x + H.w / 2, H.h / 2, H.z, 0.4, H.h, H.d);                        // east
    wall(H.x - 1.9, H.h / 2, H.z + H.d / 2, H.w - 3.8, H.h, 0.4);            // south, door east
    wall(H.x + 2.2, H.h / 2, H.z + H.d / 2, 1.8, H.h, 0.4);
    wall(H.x + 0.55, H.h - 0.35, H.z + H.d / 2, 1.5, 0.7, 0.4);              // lintel
    const roof = new THREE.Mesh(new THREE.BoxGeometry(H.w + 0.6, 0.16, H.d + 0.6), plankMat);
    roof.position.set(RV.x + H.x, H.h + 0.08, RV.z + H.z);
    this.scene.add(roof);
    const hbAsset = this.assets.glb.hutbed;
    if (hbAsset) {
      const b = hbAsset.model.clone();
      b.position.set(RV.x + H.x - 1.6, 0.05, RV.z + H.z - 1.2);
      b.rotation.y = Math.PI / 2;
      this.scene.add(b);
    }
    this.addBox(RV.x + H.x - 2.4, RV.x + H.x - 0.8, 0, 0.7, RV.z + H.z - 2.2, RV.z + H.z - 0.2);
    this.beds.push({ x: RV.x + H.x - 1.6, z: RV.z + H.z - 1.2, y: 0.05, label: "ruins" });
    const scAsset = this.assets.glb.storagechest;
    if (scAsset) {
      const sc = scAsset.model.clone();
      sc.position.set(RV.x + H.x + 1.9, 0.02, RV.z + H.z - 1.6);
      sc.rotation.y = -Math.PI / 2;
      this.scene.add(sc);
    }
    this.addBox(RV.x + H.x + 1.5, RV.x + H.x + 2.3, 0, 0.7, RV.z + H.z - 2.0, RV.z + H.z - 1.2);
    this.ruinsChest = { x: RV.x + H.x + 1.9, z: RV.z + H.z - 1.6, y: 0 };
    // Timo hides tucked into the far corner of the stone house, sitting
    this.timoRuinsPos = { x: RV.x + H.x - 2.2, z: RV.z + H.z + 1.7, yaw: 2.23 };
    // THE CHURCH: a half-destroyed house of god. A tall gabled facade with
    // the doorway, window openings down the standing side, one side wall
    // crumbled to waist height, roof long gone — beams and rubble inside,
    // rows of rotting pews still facing the altar.
    const C = { x: 11, z: -9, w: 7, d: 11, h: 4.4 };
    this.ruinsChurch = { x0: RV.x + C.x - C.w / 2, x1: RV.x + C.x + C.w / 2, z0: RV.z + C.z - C.d / 2, z1: RV.z + C.z + C.d / 2 };
    // north wall (behind the altar) with a tall broken window opening
    wall(C.x - 2.4, C.h / 2, C.z - C.d / 2, 2.2, C.h, 0.45);
    wall(C.x + 2.4, C.h / 2, C.z - C.d / 2, 2.2, C.h, 0.45);
    wall(C.x, 0.6, C.z - C.d / 2, 1.8, 1.2, 0.45);                            // under the window
    wall(C.x, C.h - 0.5, C.z - C.d / 2, 1.8, 1.0, 0.45);                      // over the window
    // east wall: two arched-window openings between pillars
    wall(C.x + C.w / 2, C.h / 2, C.z - 4.4, 0.45, C.h, 2.2);
    wall(C.x + C.w / 2, C.h / 2, C.z, 0.45, C.h, 1.6);
    wall(C.x + C.w / 2, C.h / 2, C.z + 4.4, 0.45, C.h, 2.2);
    wall(C.x + C.w / 2, 0.55, C.z - 2.1, 0.45, 1.1, 2.5);                     // sills
    wall(C.x + C.w / 2, 0.55, C.z + 2.1, 0.45, 1.1, 2.5);
    wall(C.x + C.w / 2, C.h - 0.45, C.z - 2.1, 0.45, 0.9, 2.5);               // lintel band
    wall(C.x + C.w / 2, C.h - 0.45, C.z + 2.1, 0.45, 0.9, 2.5);
    // west wall: collapsed to a jagged waist-high ruin
    brokenWall(C.x - C.w / 2, C.z, C.d - 1, "z", 1.5, stoneMat);
    rubble(C.x - C.w / 2 - 0.9, C.z - 1.5, 6, 1.8);
    rubble(C.x - C.w / 2 + 0.9, C.z + 2.5, 4, 1.4);
    // south FACADE: doorway + a broken gable climbing over it
    wall(C.x - 2.5, 1.5, C.z + C.d / 2, 2.0, 3.0, 0.45);
    wall(C.x + 2.5, 1.5, C.z + C.d / 2, 2.0, 3.0, 0.45);
    wall(C.x, 3.45, C.z + C.d / 2, C.w, 0.9, 0.45);                           // over the door
    wall(C.x - 1.4, 4.5, C.z + C.d / 2, 2.4, 1.2, 0.45);                      // gable, one shoulder
    wall(C.x - 0.2, 5.3, C.z + C.d / 2, 1.4, 0.9, 0.45);                      // gable, broken peak
    // inside: pews, fallen beams, and the altar under the empty window
    const altAsset = A.glb.altar;
    if (altAsset) {
      const al = altAsset.model.clone();
      al.position.set(RV.x + C.x, 0.02, RV.z + C.z - C.d / 2 + 1.3);
      this.scene.add(al);
    } else {
      wall(C.x, 0.55, C.z - C.d / 2 + 1.3, 1.6, 1.1, 0.8, stoneMat2);
    }
    this.addBox(RV.x + C.x - 0.8, RV.x + C.x + 0.8, 0, 1.2, RV.z + C.z - C.d / 2 + 0.9, RV.z + C.z - C.d / 2 + 1.7);
    this.altar = { x: RV.x + C.x, z: RV.z + C.z - C.d / 2 + 2.2, y: 0 };
    for (let row = 0; row < 4; row++) {
      const pz = C.z - 0.6 + row * 1.5;
      for (const side of [-1.6, 1.6]) {
        const seat = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.09, 0.5), plankMat);
        seat.position.set(RV.x + C.x + side, 0.5, RV.z + pz);
        const back = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.55, 0.08), plankMat);
        back.position.set(RV.x + C.x + side, 0.82, RV.z + pz + 0.24);
        back.rotation.x = -0.08;
        const legs = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 0.08), beamMat);
        legs.position.set(RV.x + C.x + side, 0.25, RV.z + pz);
        this.scene.add(seat, back, legs);
        this.addBox(RV.x + C.x + side - 1.2, RV.x + C.x + side + 1.2, 0, 1.0, RV.z + pz - 0.3, RV.z + pz + 0.3);
      }
    }
    beam(C.x - 1.5, C.z - 2.5, 0.6, 4.2, 0.55);
    beam(C.x + 1.8, C.z + 1.8, -1.1, 3.6, 0.4);
    rubble(C.x + 1.2, C.z - 3.6, 5, 1.2);
    // THE BAR: an actual abandoned tavern inside a broken building — half a
    // roof, a proper counter with stools, a bottle shelf on the back wall,
    // a cold fridge, rubble where the roof came down, and a forgotten chest.
    const B = { x: -1, z: 11, w: 6.5, d: 5.5, h: 2.5 };
    wall(B.x, B.h / 2, B.z + B.d / 2, B.w, B.h, 0.4, stoneMat2);             // south (intact, holds the roof)
    wall(B.x - B.w / 2, B.h / 2, B.z + 1.1, 0.4, B.h, B.d - 2.2, stoneMat2); // west, rear half standing
    brokenWall(B.x - B.w / 2, B.z - 1.9, 1.7, "z", 1.3, stoneMat2);          // west, front crumbled
    wall(B.x + B.w / 2, B.h / 2, B.z, 0.4, B.h, B.d, stoneMat2);             // east + window hole
    wall(B.x - 2.1, B.h / 2, B.z - B.d / 2, B.w - 4.2, B.h, 0.4, stoneMat2); // north, door east
    brokenWall(B.x + 2.3, B.z - B.d / 2, 1.9, "x", 1.6, stoneMat2);          // north, jagged by the door
    const halfRoof = new THREE.Mesh(new THREE.BoxGeometry(B.w + 0.5, 0.14, B.d / 2 + 0.3), plankMat);
    halfRoof.position.set(RV.x + B.x, B.h + 0.07, RV.z + B.z + B.d / 4);
    halfRoof.rotation.x = 0.06;
    this.scene.add(halfRoof);
    beam(B.x - 1.6, B.z - 1.2, 0.9, 3.2, 0.45);
    rubble(B.x - 2.6, B.z - 1.8, 6, 1.3);
    // the counter: two of Bill's tables pushed together, stools in front
    const tAsset = A.glb.table;
    for (const off of [-0.8, 0.8]) {
      if (tAsset) {
        const tm = tAsset.model.clone();
        tm.position.set(RV.x + B.x + off, 0.02, RV.z + B.z + 0.8);
        this.scene.add(tm);
      }
    }
    for (const sx of [-1.4, -0.2, 1.0]) {
      const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.16, 0.52, 8), beamMat);
      stool.position.set(RV.x + B.x + sx, 0.26, RV.z + B.z - 0.15);
      stool.rotation.y = rng() * 2;
      this.scene.add(stool);
    }
    // the back-bar: two shelf boards on the south wall, bottles still standing
    for (const sy of [1.25, 1.75]) {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.07, 0.32), plankMat);
      shelf.position.set(RV.x + B.x - 0.4, sy, RV.z + B.z + B.d / 2 - 0.38);
      this.scene.add(shelf);
      for (let bi = 0; bi < 5; bi++) {
        if (rng() < 0.3) continue; // looters took a few
        const bot = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.3, 7),
          new THREE.MeshStandardMaterial({ color: bi % 2 ? 0x2e4a2a : 0x4a2530, roughness: 0.25 }));
        bot.position.set(RV.x + B.x - 1.8 + bi * 0.72 + rng() * 0.2, sy + 0.19, RV.z + B.z + B.d / 2 - 0.38);
        this.scene.add(bot);
      }
    }
    this.addBox(RV.x + B.x - 1.6, RV.x + B.x + 1.6, 0, 0.9, RV.z + B.z + 0.1, RV.z + B.z + 1.5);
    this.barTable = { x: RV.x + B.x - 0.8, z: RV.z + B.z + 0.8, y: 0.82 };
    // a tinderbox someone left on the counter (a fresh one appears each dawn)
    const tb = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.09, 0.15),
      new THREE.MeshStandardMaterial({ color: 0x6a6d70, roughness: 0.65, metalness: 0.4 }));
    tb.position.set(RV.x + B.x - 0.8, 0.88, RV.z + B.z + 0.8);
    tb.rotation.y = 0.5;
    this.scene.add(tb);
    this.barTinderMesh = tb;
    const frAsset = this.assets.glb.fridge;
    if (frAsset) {
      const fr = frAsset.model.clone();
      fr.position.set(RV.x + B.x + 2.4, 0.02, RV.z + B.z + 1.6);
      fr.rotation.y = -Math.PI / 2;
      this.scene.add(fr);
    }
    this.addBox(RV.x + B.x + 1.95, RV.x + B.x + 2.85, 0, 1.8, RV.z + B.z + 1.15, RV.z + B.z + 2.05);
    this.fridge = { x: RV.x + B.x + 2.4, z: RV.z + B.z + 1.6, y: 0 };
    // the bar's treasure chest joins the world chest list (triple loot)
    const chAsset = this.assets.glb.chest;
    if (chAsset) {
      const ch = chAsset.model.clone();
      ch.position.set(RV.x + B.x - 2.3, 0.02, RV.z + B.z - 1.4);
      ch.rotation.y = 0.8;
      this.scene.add(ch);
      this.addBox(RV.x + B.x - 2.75, RV.x + B.x - 1.85, 0, 0.6, RV.z + B.z - 1.75, RV.z + B.z - 1.05);
      this.chests.push({ x: RV.x + B.x - 2.3, z: RV.z + B.z - 1.4, y: 0, opened: false, knife: false, mesh: ch, snake: false, treasure: true });
    }
    // DESTROYED HOMES: real house footprints reduced to jagged corners,
    // doorway stumps, fallen beams and heaps of their own stone
    // house ruin 1 (west of the square): an L of broken walls + doorway stump
    brokenWall(-14, 8, 5, "x", 1.9, stoneMat2);
    brokenWall(-16.4, 10.2, 4, "z", 1.5, stoneMat2);
    wall(-11.4, 1.1, 8, 0.5, 2.2, 0.42, stoneMat2);    // door jamb still standing
    beam(-14.6, 9.6, 0.4, 3.4, 0.5);
    rubble(-13, 10.5, 7, 2);
    rubble(-16.2, 7.4, 4, 1.2);
    // house ruin 2 (east): three wall runs, one taller gable corner
    brokenWall(14, 6, 5.4, "x", 1.7, stoneMat);
    brokenWall(16.6, 8.2, 4.2, "z", 1.9, stoneMat);
    wall(16.6, 1.6, 6.1, 0.42, 3.2, 0.5, stoneMat);    // the corner that refused to fall
    beam(15, 7.5, -0.7, 3.8, 0.5);
    rubble(14.8, 7.2, 8, 2.2);
    // house ruin 3 (south): mostly a floorprint and rubble
    brokenWall(2, -14, 5.6, "x", 1.2, stoneMat2);
    brokenWall(4.6, -15.8, 3.4, "z", 0.9, stoneMat);
    rubble(3, -15.4, 9, 2.4);
    beam(2.6, -14.8, 1.3, 3.0, 0.35);
    // the NEST house: four jagged broken walls, open sky, hatchlings inside
    const N = { x: -4, z: -16 };
    brokenWall(N.x, N.z - 3, 6, "x", 1.6, stoneMat);
    brokenWall(N.x - 3, N.z, 6, "z", 1.4, stoneMat2);
    brokenWall(N.x + 3, N.z, 6, "z", 1.6, stoneMat);
    brokenWall(N.x - 1.2, N.z + 3, 3.4, "x", 1.2, stoneMat2);
    rubble(N.x + 2.2, N.z + 2.6, 5, 1.4);
    const nestAsset = this.assets.glb.nest;
    if (nestAsset) {
      const nm = nestAsset.model.clone();
      const bb = new THREE.Box3().setFromObject(nm);
      const size = new THREE.Vector3(); bb.getSize(size);
      nm.scale.set(nm.scale.x * (5.2 / Math.max(size.x, size.z)), nm.scale.y * (0.8 / size.y), nm.scale.z * (5.2 / Math.max(size.x, size.z)));
      nm.position.set(RV.x + N.x, 0.03, RV.z + N.z);
      this.scene.add(nm);
    }
    this.spinoNest = { x: RV.x + N.x, z: RV.z + N.z };
    // the dead: a fallen T-Rex and the villagers the forest kept
    const tsAsset = this.assets.glb.trexskel;
    if (tsAsset) {
      const ts = tsAsset.model.clone();
      ts.position.set(RV.x + 6, 0.05, RV.z + 16);
      ts.rotation.y = 2.3;
      this.scene.add(ts);
    }
    const hsAsset = this.assets.glb.humanskel;
    for (const [sx, sz, sy] of [[-6, 4, 1.2], [9, -2, 4.4], [-2, 18, 0.4]]) {
      if (!hsAsset) break;
      const hs = hsAsset.model.clone();
      hs.position.set(RV.x + sx, 0.04, RV.z + sz);
      hs.rotation.y = sy;
      this.scene.add(hs);
    }
  }
  inRuinsHouse(x, z) {
    const h = this.ruinsHouse;
    return h && x > h.x0 + 0.2 && x < h.x1 - 0.2 && z > h.z0 + 0.2 && z < h.z1 - 0.2;
  }
  inChurch(x, z) {
    const c = this.ruinsChurch;
    return c && x > c.x0 + 0.2 && x < c.x1 - 0.2 && z > c.z0 + 0.2 && z < c.z1 - 0.2;
  }

  // player-made campfires: light anywhere, burn for a minute
  // ---- update 16: the ROCKY MOUNTAIN — grey stone, dead wood, thin air ----
  buildMountain() {
    const M = CFG.mountain;
    const rng = this.rng;
    // the DUNGEON's frame is declared FIRST so the terrain sheet below can
    // carve its passage — geometry is built further down
    const CV = M.cave;
    const caveY = this.mountainH(CV.x, CV.z);
    const ux = -Math.SQRT1_2, uz = -Math.SQRT1_2;   // s runs INTO the mountain
    const vx = -uz, vz = ux;                         // t is lateral
    const L = (s, t) => ({ x: CV.x + ux * s + vx * t, z: CV.z + uz * s + vz * t });
    const SPINE = [[0, 0], [16, 0], [30, 9], [44, -8], [58, 6], [72, 0]];
    const HW = 5.0;                             // update 28: a gallery, not a squeeze
    const ANTE = { s0: 26, s1: 46, t: 12 };     // the rock hall at the double bend
    const CH = { s0: 72, s1: 112, t: 21 };      // the GRAND HALL — the wolves' den
    const CORR = { s0: 112, s1: 122, hw: 3.2 }; // exit passage out the hall's far wall
    const SANCTUM = { s0: 122, s1: 142, t: 11 };// the statue room at the very end
    this.dungeon = { y: caveY, ent: { x: CV.x, z: CV.z }, ux, uz, vx, vz, spine: SPINE, hw: HW, ante: ANTE, chamber: CH, corr: CORR, sanctum: SANCTUM };
    // displaced terrain sheet: rock where the mountain rises, the skirt
    // dives under the grass where it doesn't
    const span = M.r * 2 + 20;
    const geo = new THREE.PlaneGeometry(span, span, 110, 110);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + M.cx, z = pos.getZ(i) + M.cz;
      let h = this.mountainH(x, z);
      // carve the tunnel: sheet vertices that would cross the passage at eye
      // level sink under the dungeon floor. High rock stays — from inside its
      // underside is backface-culled anyway, and outside the face is whole.
      if (this.inDungeon(x, z)) {
        // the deep rooms (grand hall + sanctum) vault far higher — they sit
        // under the peak, where the rock towers above even the taller band
        const rs = (x - CV.x) * ux + (z - CV.z) * uz;
        if (h < caveY + (rs > 70 ? 13.5 : 8)) h = caveY - 0.55;
      }
      pos.setY(i, h > 0.02 ? h + 0.04 : -0.6);
    }
    geo.computeVertexNormals();
    const rockGround = new THREE.Mesh(geo, this.mat("t_rock", 34, 34, 0x74776f));
    rockGround.position.set(M.cx, 0, M.cz);
    this.scene.add(rockGround);
    // dead wood instead of living forest (count 46, unchanged since u16).
    // Update 24: on the WALKABLE lower slope (below the anchor cliffs) every
    // fifth would-be tree becomes a crackable rock instead — 80% of the
    // surface trees remain, the shelf keeps all of its wood.
    const dtA = this.assets.glb.deadtree;
    this.slopeRockSpots = [];
    let placed = 0, guard = 0, surfaceN = 0;
    while (placed < 46 && guard++ < 4000) {
      const a = rng() * Math.PI / 2;
      const d = 115 + rng() * 175;
      const x = M.cx + Math.cos(a) * d, z = M.cz + Math.sin(a) * d;
      if (Math.abs(x) > CFG.world.square - 4 || Math.abs(z) > CFG.world.square - 4) continue;
      if (Math.hypot(x - M.hut.x, z - M.hut.z) < 14) continue;
      if (Math.hypot(x - M.cave.x, z - M.cave.z) < 15) continue;
      const h = this.mountainH(x, z);
      if (h < 0.3) continue;
      if (d > M.cliffLo && ++surfaceN % 5 === 0) {
        this.slopeRockSpots.push([x, z]);   // a rock will stand here instead
        placed++;
        continue;
      }
      let m;
      if (dtA) {
        m = dtA.model.clone();
        m.scale.multiplyScalar(0.75 + rng() * 0.5);
      } else {
        m = new THREE.Group();
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.3, 5.4, 6),
          new THREE.MeshStandardMaterial({ color: 0x5a5148, roughness: 1 }));
        trunk.position.y = 2.7;
        m.add(trunk);
      }
      m.position.set(x, h, z);
      m.rotation.y = rng() * Math.PI * 2;
      this.scene.add(m);
      this.addTree(x, z, 0.6);
      (this.deadTrees ||= []).push({ x, z });   // trike horns get stuck in these
      placed++;
    }
    // THE WOLF DUNGEON (update 23) — grown into the expanded map: a longer
    // crystal-lit tunnel boring diagonally from the high shelf INTO the
    // mountain's heart, widening into a rock-hall ANTECHAMBER halfway, and
    // ending in a grand chamber where the statue guards the silver.
    const rockMat = this.mat("t_rock", 3, 2, 0x63665f);
    const darkRock = this.mat("t_rock", 4, 4, 0x4c4f49);
    // craggy wall builder: short rotated rock boxes stepped along a line
    const wallRun = (s0, t0, s1, t1, gapFn, hMul = 1) => {
      const len = Math.hypot(s1 - s0, t1 - t0);
      const n = Math.max(1, Math.round(len / 2.7));
      for (let i = 0; i <= n; i++) {
        const k = i / n;
        const s = s0 + (s1 - s0) * k, t = t0 + (t1 - t0) * k;
        if (gapFn && gapFn(s, t)) continue;
        const p = L(s + (rng() - 0.5) * 0.8, t + (rng() - 0.5) * 0.9);
        const bh = (5.6 + rng() * 1.6) * hMul;
        const b = new THREE.Mesh(new THREE.BoxGeometry(3.0 + rng() * 1.4, bh, 1.6 + rng() * 0.9), rockMat);
        b.position.set(p.x, caveY + bh * 0.46 + rng() * 0.5, p.z);
        b.rotation.y = -Math.PI / 4 + Math.atan2(t1 - t0, s1 - s0) + (rng() - 0.5) * 0.55;
        b.rotation.z = (rng() - 0.5) * 0.14;   // tilted slabs, not fitted panels
        this.scene.add(b);
        this.addBox(p.x - 1.55, p.x + 1.55, caveY, caveY + 6.4 * hMul, p.z - 1.55, p.z + 1.55);
      }
    };
    // tunnel side walls hug the spine at ±(HW + 0.9) — but never build INSIDE
    // the antechamber or past the grand chamber's mouth
    // the fence is wider past s1 so a bend-segment's END pieces never jut
    // across the junction where the tunnel leaves the hall
    const inAnte = (s, t) => s > ANTE.s0 - 0.8 && s < ANTE.s1 + 2.4 && Math.abs(t) < ANTE.t + 2.4;
    for (let i = 0; i < SPINE.length - 1; i++) {
      const [a0, b0] = SPINE[i], [a1, b1] = SPINE[i + 1];
      const dx = a1 - a0, dz = b1 - b0, dl = Math.hypot(dx, dz);
      const nx = -dz / dl, nz = dx / dl;   // local normal
      for (const side of [1, -1]) {
        wallRun(a0 + nx * side * (HW + 0.9), b0 + nz * side * (HW + 0.9),
          a1 + nx * side * (HW + 0.9), b1 + nz * side * (HW + 0.9),
          (s, t) => inAnte(s, t) || s > CH.s0);
      }
    }
    // antechamber perimeter — openings where the tunnel enters (t≈6.4 on the
    // near wall) and leaves (t≈-6 on the far wall)
    wallRun(ANTE.s0, -ANTE.t, ANTE.s1, -ANTE.t);
    wallRun(ANTE.s0, ANTE.t, ANTE.s1, ANTE.t);
    wallRun(ANTE.s0, -ANTE.t, ANTE.s0, ANTE.t, (s, t) => Math.abs(t - 6.4) < HW + 1.2);
    wallRun(ANTE.s1, -ANTE.t, ANTE.s1, ANTE.t, (s, t) => Math.abs(t + 6) < HW + 1.2);
    // GRAND HALL perimeter (update 28: tall walls under a high vault) — one
    // opening where the tunnel arrives, one where the exit passage leaves
    wallRun(CH.s0, -CH.t, CH.s1, -CH.t, null, 1.9);
    wallRun(CH.s0, CH.t, CH.s1, CH.t, null, 1.9);
    wallRun(CH.s1, -CH.t, CH.s1, CH.t, (s, t) => Math.abs(t) < CORR.hw + 1.3, 1.9);
    wallRun(CH.s0, -CH.t, CH.s0, CH.t, (s, t) => Math.abs(t) < HW + 1.2, 1.9);
    // the exit passage walls, and the SANCTUM behind it — the statue's room
    for (const side of [1, -1]) {
      wallRun(CORR.s0 + 1.2, side * (CORR.hw + 0.9), CORR.s1 - 1.2, side * (CORR.hw + 0.9));
    }
    wallRun(SANCTUM.s0, -SANCTUM.t, SANCTUM.s1, -SANCTUM.t, null, 1.5);
    wallRun(SANCTUM.s0, SANCTUM.t, SANCTUM.s1, SANCTUM.t, null, 1.5);
    wallRun(SANCTUM.s1, -SANCTUM.t, SANCTUM.s1, SANCTUM.t, null, 1.5);
    wallRun(SANCTUM.s0, -SANCTUM.t, SANCTUM.s0, SANCTUM.t, (s, t) => Math.abs(t) < CORR.hw + 1.3, 1.5);
    // floors + roofs: rotated slabs along the spine, one big slab per chamber.
    // The first roof strip is VISIBLE on the shelf — it reads as the rocky
    // mound the cave mouth is carved into.
    const slab = (sMid, tMid, len, wid, y, h, mat2) => {
      const p = L(sMid, tMid);
      const b = new THREE.Mesh(new THREE.BoxGeometry(len, h, wid), mat2);
      b.position.set(p.x, y, p.z);
      b.rotation.y = -Math.PI / 4;
      this.scene.add(b);
      return b;
    };
    for (let i = 0; i < SPINE.length - 1; i++) {
      const [a0, b0] = SPINE[i], [a1, b1] = SPINE[i + 1];
      const mid = [(a0 + a1) / 2, (b0 + b1) / 2];
      const len = Math.hypot(a1 - a0, b1 - b0) + 4.5;
      const rot = Math.atan2(b1 - b0, a1 - a0);
      const roof = slab(mid[0], mid[1], len, HW * 2 + 5, caveY + 5.9, 1.4, rockMat);
      roof.rotation.y = -Math.PI / 4 + rot;
      const floor = slab(mid[0], mid[1], len, HW * 2 + 5, caveY - 0.31, 0.6, darkRock);
      floor.rotation.y = -Math.PI / 4 + rot;
    }
    slab(36, 0, 26, 28, caveY + 7.0, 1.6, rockMat);            // antechamber vault
    slab(36, 0, 26, 28, caveY - 0.31, 0.6, darkRock);          // antechamber floor
    slab(92, 0, 44, 46, caveY + 11.2, 2.0, rockMat);           // GRAND HALL vault — high
    slab(92, 0, 44, 46, caveY - 0.33, 0.6, darkRock);          // grand hall floor
    slab(117, 0, 12, CORR.hw * 2 + 4.5, caveY + 5.9, 1.4, rockMat);   // exit passage roof
    slab(117, 0, 12, CORR.hw * 2 + 4.5, caveY - 0.35, 0.6, darkRock); // exit passage floor
    slab(132, 0, 24, 26, caveY + 9.0, 1.8, rockMat);           // sanctum vault
    slab(132, 0, 24, 26, caveY - 0.37, 0.6, darkRock);         // sanctum floor
    // door LINTELS — the tall halls meet low doorways; these slabs fill the
    // open band between each door's top and the vault so no daylight leaks in
    slab(CH.s0, 0, 2.4, 16, caveY + 9.0, 5.6, rockMat);        // hall entry
    slab(CH.s1, 0, 2.4, 14, caveY + 9.0, 5.6, rockMat);        // hall exit
    slab(SANCTUM.s0, 0, 2.4, 12, caveY + 7.2, 3.4, rockMat);   // sanctum entry
    // the grand hall's natural columns — stalagmite pillars fused to the vault
    for (const [ps, pt] of [[80, -9], [84, 10], [98, -10], [102, 9]]) {
      const pp = L(ps, pt);
      let py = caveY;
      for (const [pw, ph] of [[3.0, 4.6], [2.3, 4.4], [1.7, 3.6]]) {
        const seg = new THREE.Mesh(new THREE.BoxGeometry(pw, ph, pw * (0.85 + rng() * 0.3)), rockMat);
        seg.position.set(pp.x + (rng() - 0.5) * 0.4, py + ph / 2, pp.z + (rng() - 0.5) * 0.4);
        seg.rotation.y = rng() * Math.PI;
        this.scene.add(seg);
        py += ph - 0.5;
      }
      this.addBox(pp.x - 1.6, pp.x + 1.6, caveY, caveY + 11, pp.z - 1.6, pp.z + 1.6);
      this.occluders.push({ x: pp.x, z: pp.z, r: 1.8 });
    }
    // the ROCKY HILLOCK the cave bores into: a jumbled pile of great slabs
    // burying the exposed early tunnel (the mountain's own wall only rises
    // above the roofline ~21 m in), tapering up toward the peak face
    const bAsset = this.assets.glb.boulder;
    const greyRock2 = this.mat("t_rock", 1.7, 1.7, 0x8a8d86);
    // slabs piled ON TOP of the tunnel roof (never into the passage below) —
    // staggered sideways and unevenly sized so no two edges ever line up
    for (const [ms, mt, mw, mh, md2] of [
      [4, 1.5, 11, 3.6, 10], [9, -2.5, 13, 5.2, 12], [12, 3, 10, 4.4, 9],
      [16, -1, 14, 6.6, 12], [19, 4, 9, 5.2, 8], [22, 0.5, 15, 7.8, 13],
    ]) {
      const mp = L(ms, mt + (rng() - 0.5) * 1.2);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(mw, mh, md2), rockMat);
      cap.position.set(mp.x, caveY + 6.5 + mh / 2, mp.z);
      cap.rotation.set((rng() - 0.5) * 0.14, -Math.PI / 4 + (rng() - 0.5) * 0.5, (rng() - 0.5) * 0.14);
      this.scene.add(cap);
    }
    // ground-seated shoulders flanking the tunnel — well outside its walls
    for (const [ms, mt, mw, mh, md2] of [
      [5, -9.5, 6, 6.5, 6], [6, 9.5, 6, 7, 6], [13, -10, 7, 8.5, 6],
      [14, 10, 7, 9, 6], [20, -9.5, 8, 10.5, 7], [21, 9.5, 8, 11, 7],
    ]) {
      const mp = L(ms, mt);
      const sh = new THREE.Mesh(new THREE.BoxGeometry(mw, mh, md2), rockMat);
      sh.position.set(mp.x, caveY + mh * 0.42, mp.z);
      sh.rotation.set((rng() - 0.5) * 0.1, -Math.PI / 4 + (rng() - 0.5) * 0.3, (rng() - 0.5) * 0.1);
      this.scene.add(sh);
      this.addBox(mp.x - md2 / 2, mp.x + md2 / 2, caveY, caveY + mh, mp.z - md2 / 2, mp.z + md2 / 2);
    }
    // THE CAVE MOUTH — the generated stone arch (Higgsfield): a natural
    // granite archway with a true opening, planted over the tunnel mouth
    const archA = this.assets.glb.cavearch;
    if (archA) {
      const arch = archA.model.clone();
      const ap = L(-1.6, 0);
      arch.position.set(ap.x, caveY - 0.35, ap.z);
      arch.rotation.y = Math.PI / 4;   // opening faces out, down the shelf
      this.scene.add(arch);
    }
    // the arch's legs are solid rock — walk THROUGH the opening, not the legs.
    // The leg offsets stay matched to the arch MODEL (the mouth is a 7 m
    // doorway that widens into the 10 m gallery behind it)
    for (const side of [1, -1]) {
      const p = L(-1.6, side * 5.6);
      this.addBox(p.x - 2.1, p.x + 2.1, caveY, caveY + 8, p.z - 2.1, p.z + 2.1);
      // a grey boulder settled against each leg
      if (bAsset) {
        const fb = bAsset.model.clone();
        fb.traverse((o) => { if (o.isMesh) o.material = greyRock2; });
        fb.scale.multiplyScalar(0.85 + rng() * 0.35);
        const fp = L(-4.9, side * 6.2);
        fb.position.set(fp.x, caveY, fp.z);
        fb.rotation.y = rng() * Math.PI * 2;
        this.scene.add(fb);
        this.addTree(fp.x, fp.z, 0.95);
      }
    }
    // CRYSTALS — the dungeon's only sun: teal clusters that keep it walkable-
    // dark, never pitch black. Lights exist from boot, so no shader recompiles.
    this.dungeonLights = [];
    const crystalMat = new THREE.MeshStandardMaterial({
      color: 0x1e3844, emissive: 0x4fd8ff, emissiveIntensity: 1.45, roughness: 0.3, metalness: 0.1,
    });
    const crystalCluster = (cs, ct, lit, sc = 1) => {
      const p = L(cs, ct);
      const g = new THREE.Group();
      const nCr = 3 + Math.floor(rng() * 2);
      for (let c = 0; c < nCr; c++) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry((0.16 + rng() * 0.22) * sc, (0.7 + rng() * 0.9) * sc, 5), crystalMat);
        cone.position.set((rng() - 0.5) * 0.9 * sc, 0.28 * sc, (rng() - 0.5) * 0.9 * sc);
        cone.rotation.set((rng() - 0.5) * 0.7, rng() * Math.PI, (rng() - 0.5) * 0.7);
        g.add(cone);
      }
      g.position.set(p.x, caveY, p.z);
      this.scene.add(g);
      if (lit) {
        const gl = new THREE.PointLight(0x63c8e8, 5.2, 15 + (sc - 1) * 6, 1.8);
        gl.position.set(p.x, caveY + 1.9 * sc, p.z);
        this.scene.add(gl);
        this.dungeonLights.push(gl);
      }
    };
    // ten LIT clusters pace the whole run (light count unchanged since u22 —
    // the forward renderer bills every light on every surface). Update 28:
    // redistributed over the longer run; the grand hall's are twice the size
    for (const [cs, ct, sc] of [[8, 1.5, 1], [24, 6, 1], [38, -8, 1], [52, 3, 1], [64, 4.4, 1],
      [80, -14, 2], [92, 15, 2], [104, -13, 2], [117, 2.4, 1], [134, 6, 1.6]]) crystalCluster(cs, ct, true, sc);
    // ...and unlit ones glow on emissive alone, dressing the dark between
    for (const [cs, ct, sc] of [[14, -1.6, 1], [20, 7, 1], [30, 10, 1], [33, -5, 1], [44, -10, 1],
      [58, 5, 1], [70, 3, 1], [76, 10, 1.6], [86, -8, 1.6], [97, 8, 1.6], [108, -6, 1.6],
      [112, 4, 1], [126, -6, 1.2], [138, -4, 1.2]]) crystalCluster(cs, ct, false, sc);
    // hide-behind rocks — cover from werewolf EYES, never a safe spot
    const greyRock = greyRock2;
    for (const [rs, rt, sc] of [[10, -3.8, 0.9], [22, 7.6, 1.05], [33, -8, 0.95], [41, -6.8, 1.1],
      [50, 1.8, 0.9], [64, -0.4, 1.0], [77, -15, 1.15], [82, 13, 1.0], [89, -10, 1.1],
      [96, 16, 0.95], [104, -15, 1.05], [108, 9, 1.0], [127, -7, 0.95], [135, -7, 1.0]]) {
      const p = L(rs, rt);
      let m;
      if (bAsset) {
        m = bAsset.model.clone();
        m.traverse((o) => { if (o.isMesh) o.material = greyRock; });
        m.scale.multiplyScalar(sc);
        m.position.y = caveY;
      } else {
        m = new THREE.Mesh(new THREE.DodecahedronGeometry(1.3 * sc, 0), greyRock);
        m.position.y = caveY + 0.9 * sc;
      }
      m.position.x = p.x; m.position.z = p.z;
      m.rotation.y = rng() * Math.PI * 2;
      this.scene.add(m);
      this.addTree(p.x, p.z, 1.1 * sc);
      this.occluders.push({ x: p.x, z: p.z, r: 1.35 * sc });
    }
    // the chamber's treasure chest
    const chA = this.assets.glb.chest;
    const chP = L(84, 13.5);
    if (chA) {
      const ch = chA.model.clone();
      ch.position.set(chP.x, caveY + 0.02, chP.z);
      ch.rotation.y = -2.2;
      this.scene.add(ch);
    }
    this.chests.push({ x: chP.x, z: chP.z, y: caveY, opened: false, knife: false, snake: false, treasure: true });
    // the WEREWOLF STATUE — update 28: enthroned in its OWN room, the sanctum
    // at the very end of the dungeon, silver gleaming in its paws
    const back = L(136, 0);
    const statueYaw = Math.PI * 0.75;   // faces back down the tunnel
    const stA = this.assets.glb.wolfstatue;
    if (stA) {
      const st = stA.model.clone();
      st.position.set(back.x, caveY + 0.02, back.z);
      st.rotation.y = statueYaw;
      this.scene.add(st);
    } else {
      const st = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.2, 1.0), rockMat);
      st.position.set(back.x, caveY + 1.1, back.z);
      this.scene.add(st);
    }
    this.addBox(back.x - 0.8, back.x + 0.8, caveY, caveY + 2.2, back.z - 0.8, back.z + 0.8);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.18),
      new THREE.MeshStandardMaterial({ color: 0xdfe3e8, roughness: 0.25, metalness: 0.9 }));
    const barPos = L(134.8, 0);
    bar.position.set(barPos.x, caveY + 1.32, barPos.z);
    bar.rotation.y = statueYaw;
    this.scene.add(bar);
    this.silverBar = { x: barPos.x, z: barPos.z, y: caveY + 1.3, mesh: bar, taken: false };
    this.cave = { x: CV.x, z: CV.z, r: CV.r, y: caveY };
    // ten wolf posts spread sparse through tunnel and chamber — tunnel posts
    // sit ON the spine so nobody wakes up inside the rock between two bends
    // update 28: the pack lives mostly in the GRAND HALL now — four posts on
    // the way in, five prowling the hall, one last guard in the sanctum
    this.dungeonSpawns = [[12, 0.5], [30, 6], [41, -4], [57, 3], [78, -10],
      [86, 6], [93, -9], [100, 14], [107, -2], [131, 4]].map(([s, t]) => { const p = L(s, t); return [p.x, p.z]; });
    // JABB'S MOUNTAIN HUT — on the free lower slope, no anchors needed
    const H = M.hut;
    const hy = this.mountainH(H.x, H.z);
    const wood = this.mat("t_darkwood", 1.6, 1, 0x4a3b28);
    const plank = this.mat("t_woodplank", 2, 1, 0x6a5a42);
    const hw = 9, hd = 7.5, hh = 2.7;   // roomier since update 17
    // inside these walls NOTHING reaches you — the mountain's safe room
    this.jabbHutRect = { x0: H.x - hw / 2, x1: H.x + hw / 2, z0: H.z - hd / 2, z1: H.z + hd / 2 };
    const hwall = (cx, cy, cz, sx, sy, sz) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), wood);
      b.position.set(H.x + cx, hy + cy, H.z + cz);
      this.scene.add(b);
      this.addBox(H.x + cx - sx / 2, H.x + cx + sx / 2, hy + cy - sy / 2, hy + cy + sy / 2, H.z + cz - sz / 2, H.z + cz + sz / 2);
    };
    // update 17: the hut GREW — two windows, a real door, a stove, a closet
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x9fb4c0, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.28 });
    // NORTH wall (window looks UP the mountain)
    hwall(-hw / 2 + 1.35, hh / 2, -hd / 2, 2.7, hh, 0.35);
    hwall(hw / 2 - 1.35, hh / 2, -hd / 2, 2.7, hh, 0.35);
    hwall(0, 0.55, -hd / 2, hw - 5.4, 1.1, 0.35);                  // sill
    hwall(0, hh - 0.4, -hd / 2, hw - 5.4, 0.8, 0.35);              // lintel
    const winN = new THREE.Mesh(new THREE.PlaneGeometry(hw - 5.4, hh - 1.9), glassMat);
    winN.position.set(H.x, hy + 1.5, H.z - hd / 2);
    this.scene.add(winN);
    this.addBox(H.x - (hw - 5.4) / 2, H.x + (hw - 5.4) / 2, hy + 1.1, hy + hh - 0.8, H.z - hd / 2 - 0.06, H.z - hd / 2 + 0.06);
    // WEST wall (solid)
    hwall(-hw / 2, hh / 2, 0, 0.35, hh, hd);
    // EAST wall (window looks DOWN to the forest)
    hwall(hw / 2, hh / 2, -hd / 2 + 1.2, 0.35, hh, 2.4);
    hwall(hw / 2, hh / 2, hd / 2 - 1.2, 0.35, hh, 2.4);
    hwall(hw / 2, 0.55, 0, 0.35, 1.1, hd - 4.8);
    hwall(hw / 2, hh - 0.4, 0, 0.35, 0.8, hd - 4.8);
    const winE = new THREE.Mesh(new THREE.PlaneGeometry(hd - 4.8, hh - 1.9), glassMat);
    winE.rotation.y = Math.PI / 2;
    winE.position.set(H.x + hw / 2, hy + 1.5, H.z);
    this.scene.add(winE);
    this.addBox(H.x + hw / 2 - 0.06, H.x + hw / 2 + 0.06, hy + 1.1, hy + hh - 0.8, H.z - (hd - 4.8) / 2, H.z + (hd - 4.8) / 2);
    // SOUTH wall with the doorway (east side)
    hwall(-1.625, hh / 2, hd / 2, 5.75, hh, 0.35);
    hwall(3.625, hh / 2, hd / 2, 1.75, hh, 0.35);
    hwall(2.0, hh - 0.3, hd / 2, 1.5, 0.6, 0.35);                  // lintel over the door
    // the DOOR: plain honest wood, hinged at its west jamb
    const doorGrp = new THREE.Group();
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(1.45, 2.12, 0.11), wood);
    leaf.position.x = 0.725;
    doorGrp.add(leaf);
    doorGrp.position.set(H.x + 1.27, hy + 1.06, H.z + hd / 2);
    this.scene.add(doorGrp);
    this.addBox(H.x + 1.27, H.x + 2.75, hy, hy + 2.12, H.z + hd / 2 - 0.1, H.z + hd / 2 + 0.1);
    this.jabbDoor = {
      grp: doorGrp, open: false, x: H.x + 2.0, z: H.z + hd / 2, y: hy + 1,
      boxRef: this.boxes[this.boxes.length - 1],
      closedBox: Object.assign({}, this.boxes[this.boxes.length - 1]),
    };
    const hroof = new THREE.Mesh(new THREE.BoxGeometry(hw + 0.9, 0.18, hd + 0.9), plank);
    hroof.position.set(H.x, hy + hh + 0.1, H.z);
    hroof.rotation.z = 0.06;
    this.scene.add(hroof);
    const hfloor = new THREE.Mesh(new THREE.BoxGeometry(hw, 0.14, hd), plank);
    hfloor.position.set(H.x, hy + 0.02, H.z);
    this.scene.add(hfloor);
    // the KITCHEN STOVE — same as Bill's, cooks everything (eggs included)
    const ktA = this.assets.glb.kitchen;
    if (ktA) {
      const kt = ktA.model.clone();
      kt.position.set(H.x - 3.6, hy + 0.06, H.z + 1.6);
      kt.rotation.y = Math.PI / 2;
      this.scene.add(kt);
    }
    this.addBox(H.x - 4.2, H.x - 3.0, hy, hy + 1.4, H.z + 0.9, H.z + 2.3);
    this.jabbStove = { x: H.x - 3.6, z: H.z + 1.6, y: hy };
    // a CLOSET against the north wall — it just makes the place a home
    const clA = this.assets.glb.closet;
    if (clA) {
      const cl = clA.model.clone();
      cl.position.set(H.x - 3.6, hy + 0.06, H.z - 2.8);
      this.scene.add(cl);
      this.addBox(H.x - 4.3, H.x - 2.9, hy, hy + 2.0, H.z - 3.3, H.z - 2.3);
    }
    // a bed for any traveler — no questions asked
    const hbA = this.assets.glb.hutbed;
    if (hbA) {
      const b = hbA.model.clone();
      b.position.set(H.x - 2.2, hy + 0.1, H.z - 1.5);
      b.rotation.y = Math.PI / 2;
      this.scene.add(b);
    }
    this.addBox(H.x - 3.0, H.x - 1.4, hy, hy + 0.6, H.z - 2.4, H.z - 0.6);
    this.beds.push({ x: H.x - 2.2, z: H.z - 1.5, y: hy + 0.1, label: "jabb" });
    // the storage box — LOCKED until the silver bar comes home
    const scA = this.assets.glb.storagechest;
    if (scA) {
      const sc = scA.model.clone();
      sc.position.set(H.x + 2.4, hy + 0.06, H.z - 2.0);
      sc.rotation.y = -Math.PI / 2;
      this.scene.add(sc);
    }
    this.addBox(H.x + 1.9, H.x + 2.9, hy, hy + 0.7, H.z - 2.5, H.z - 1.5);
    this.jabbChest = { x: H.x + 2.4, z: H.z - 2.0, y: hy };
    // the ANVIL — Jabb's pride
    const avA = this.assets.glb.anvil;
    if (avA) {
      const av = avA.model.clone();
      av.position.set(H.x + 2.1, hy + 0.06, H.z + 1.7);
      av.rotation.y = 0.6;
      this.scene.add(av);
    } else {
      const av = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.75, 0.4),
        new THREE.MeshStandardMaterial({ color: 0x3a3c40, roughness: 0.5, metalness: 0.7 }));
      av.position.set(H.x + 2.1, hy + 0.44, H.z + 1.7);
      this.scene.add(av);
    }
    this.addBox(H.x + 1.6, H.x + 2.6, hy, hy + 0.9, H.z + 1.2, H.z + 2.2);
    this.anvil = { x: H.x + 2.1, z: H.z + 1.7, y: hy };
    // Jabb's spot + a warm lamp over the doorway
    this.jabbPos = { x: H.x - 0.9, z: H.z + 0.9, yaw: 2.4 };
    const jl = new THREE.PointLight(0xd08a40, 8, 11, 2);
    jl.position.set(H.x, hy + 2.2, H.z);
    this.scene.add(jl);
    // Jabb's spare HAMMER on the anvil stump — a fresh one every dawn
    const hm = new THREE.Group();
    const hmHead = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.09, 0.09),
      new THREE.MeshStandardMaterial({ color: 0x4a4c50, roughness: 0.5, metalness: 0.6 }));
    hmHead.position.y = 0.14;
    const hmGrip = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.3, 6),
      new THREE.MeshStandardMaterial({ color: 0x6a5636, roughness: 1 }));
    hmGrip.position.y = 0.02;
    hm.add(hmHead, hmGrip);
    hm.position.set(H.x + 1.55, hy + 0.82, H.z + 1.45);
    hm.rotation.z = 1.35;
    this.scene.add(hm);
    this.hammerMesh = hm;
    this.hammerSpot = { x: H.x + 1.55, z: H.z + 1.45, y: hy + 0.8 };
    // TRIKE ROCKS: 15 crackable boulders on the lower slope — only a charging
    // triceratops breaks them open
    this.trikeRocks = [];
    const bA = this.assets.glb.boulder;
    // update 22: half again bigger, and GREY — no moss grows on this rock.
    // The mossy boulder look stays in the forest where it belongs.
    const greyStone = this.mat("t_rock", 1.8, 1.8, 0x878a84);
    const addTrikeRock = (x, z) => {
      const y = this.mountainH(x, z);
      let m;
      if (bA) {
        m = bA.model.clone();
        m.traverse((o) => { if (o.isMesh) o.material = greyStone; });
        m.scale.multiplyScalar((0.55 + rng() * 0.2) * 1.5);
        m.position.y = y;
      } else {
        m = new THREE.Mesh(new THREE.DodecahedronGeometry(1.8, 0), greyStone);
        m.position.y = y + 1.2;
      }
      m.position.x = x; m.position.z = z;
      m.rotation.y = rng() * Math.PI * 2;
      this.scene.add(m);
      this.addBox(x - 1.8, x + 1.8, y, y + 2.4, z - 1.8, z + 1.8);
      const boxRef = this.boxes[this.boxes.length - 1];
      this.trikeRocks.push({ x, z, y, mesh: m, boxRef, closedBox: Object.assign({}, boxRef),
        broken: false, respawnT: 0, chest: null });
    };
    let rn = 0, rguard = 0;
    while (rn < CFG.trikeRocks.count && rguard++ < 3000) {
      const a = (0.08 + rng() * 0.84) * Math.PI / 2;
      const d = 218 + rng() * 74;                     // the walkable lower band
      const x = M.cx + Math.cos(a) * d, z = M.cz + Math.sin(a) * d;
      if (Math.hypot(x - H.x, z - H.z) < 16) continue;
      if (this.trikeRocks.some((r) => Math.hypot(x - r.x, z - r.z) < 14)) continue;
      addTrikeRock(x, z);
      rn++;
    }
    // update 24: the rocks that took a dead tree's place on the lower slope —
    // same crackable kind, same loot rules
    for (const [x, z] of this.slopeRockSpots || []) addTrikeRock(x, z);
  }

  // a lone kitchen knife on the floor — the weakest weapon is now findable:
  // two fixed spots restock every dawn, like the tinderboxes
  addKnifeSpot(x, z, y = 0.05, yaw = 0) {
    const g = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.016, 0.05),
      new THREE.MeshStandardMaterial({ color: 0xb8bec4, roughness: 0.35, metalness: 0.6 }));
    blade.position.x = 0.14;
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.032, 0.056),
      new THREE.MeshStandardMaterial({ color: 0x3a3226, roughness: 0.9 }));
    grip.position.x = -0.08;
    g.add(blade, grip);
    g.position.set(x, y, z);
    g.rotation.y = yaw;
    this.scene.add(g);
    (this.knifeSpots ||= []).push({ x, z, y, mesh: g });
  }

  spawnTempFire(x, z, flameTex, fromY = 0) {
    const g = new THREE.Group();
    const logMat = this.mat("t_bark", 1.2, 0.5, 0x4a3b28);
    for (let i = 0; i < 3; i++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.7, 6), logMat);
      log.rotation.z = Math.PI / 2.3;
      log.rotation.y = (i / 3) * Math.PI * 2;
      log.position.y = 0.1;
      g.add(log);
    }
    const fm = new THREE.MeshBasicMaterial({
      map: flameTex, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const flames = [];
    for (const rot of [0, Math.PI / 2]) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.75), fm);
      f.position.y = 0.45;
      f.rotation.y = rot;
      g.add(f);
      flames.push(f);
    }
    // borrow a pre-warmed light — never create one mid-game (recompile freeze);
    // with the pool dry, the OLDEST fire dies early and donates its flame
    let light = this.fireLightPool.pop();
    if (!light) {
      const old = this.tempFires.shift();
      if (old) {
        this.scene.remove(old.g);
        old.g.remove(old.light);
        light = old.light;
        this.scene.add(light);
      }
    }
    if (light) {
      this.scene.remove(light);
      light.intensity = CFG.tempFire.light;
      light.position.set(0, 0.9, 0);
      g.add(light);
    }
    g.position.set(x, this.groundHeight(x, z, fromY + 0.6), z);
    this.scene.add(g);
    this.tempFires.push({ g, flames, light, ttl: CFG.tempFire.ttl });
  }

  // mossy boulders: cover to hide behind (and they block your path too)
  buildBoulders() {
    const rng = this.rng;
    const asset = this.assets.glb.boulder;
    const fallGeo = new THREE.DodecahedronGeometry(1.4, 1);
    const fallMat = new THREE.MeshStandardMaterial({ color: 0x6a6f64, roughness: 1 });
    let placed = 0, guard = 0;
    while (placed < CFG.boulderCount && guard++ < 8000) {
      const x = (rng() * 2 - 1) * 140;
      const z = (rng() * 2 - 1) * 140;
      const r = Math.hypot(x, z);
      if (r < 45 || r > 140) continue;
      if (this.distToPath(x, z) < 4) continue;
      if (CFG.world.chests.some(([cx, cz]) => Math.hypot(x - cx, z - cz) < 3)) continue;
      if (this.treesNear(x, z).some((t) => Math.hypot(x - t.x, z - t.z) < 2.6)) continue;
      const s = 0.8 + rng() * 0.7;
      let m;
      if (asset) { m = asset.model.clone(); m.scale.multiplyScalar(s); }
      else { m = new THREE.Mesh(fallGeo, fallMat); m.scale.setScalar(s); m.position.y = 0.9 * s; }
      if (asset) m.position.set(x, 0, z); else { m.position.x = x; m.position.z = z; }
      m.rotation.y = rng() * Math.PI * 2;
      this.scene.add(m);
      this.addTree(x, z, 1.15 * s);              // collision
      this.occluders.push({ x, z, r: 1.35 * s }); // breaks line of sight
      placed++;
    }
  }

  // Three-floor roman ruin. Stone everywhere, mossy, holes on floors 1-2.
  buildRuin() {
    const R = CFG.ruin;
    const stoneGeos = [];
    const T = R.wallT;
    const box = (cx, cy, cz, sx, sy, sz, collide = true) => {
      const g = new THREE.BoxGeometry(sx, sy, sz);
      g.translate(cx, cy, cz);
      stoneGeos.push(g);
      if (collide) this.addBox(cx - sx / 2, cx + sx / 2, cy - sy / 2, cy + sy / 2, cz - sz / 2, cz + sz / 2);
    };
    // wall with openings along X (at depth z), spanning [x0,x1], base..top
    const wallX = (z, x0, x1, base, top, openings) => {
      let parts = [[x0, x1]];
      for (const [o0, o1, oy0, oy1] of openings) {
        const next = [];
        for (const [a, b] of parts) {
          if (o1 <= a || o0 >= b) { next.push([a, b]); continue; }
          if (o0 > a) next.push([a, o0]);
          if (o1 < b) next.push([o1, b]);
          if (oy1 < top) box(stoneGeos && (o0 + o1) / 2, (oy1 + top) / 2, z, o1 - o0, top - oy1, T);
          if (oy0 > base) box((o0 + o1) / 2, (base + oy0) / 2, z, o1 - o0, oy0 - base, T);
        }
        parts = next;
      }
      for (const [a, b] of parts) box((a + b) / 2, (base + top) / 2, z, b - a, top - base, T);
    };
    const wallZ = (x, z0, z1, base, top, openings) => {
      let parts = [[z0, z1]];
      for (const [o0, o1, oy0, oy1] of openings) {
        const next = [];
        for (const [a, b] of parts) {
          if (o1 <= a || o0 >= b) { next.push([a, b]); continue; }
          if (o0 > a) next.push([a, o0]);
          if (o1 < b) next.push([o1, b]);
          if (oy1 < top) box(x, (oy1 + top) / 2, (o0 + o1) / 2, T, top - oy1, o1 - o0);
          if (oy0 > base) box(x, (base + oy0) / 2, (o0 + o1) / 2, T, oy0 - base, o1 - o0);
        }
        parts = next;
      }
      for (const [a, b] of parts) box(x, (base + top) / 2, (a + b) / 2, T, top - base, b - a);
    };
    const F2 = R.floor2, F3 = R.floor3;
    const win = (x, z, nx, nz, y) => this.windows.push({ x, z, nx, nz, y });

    // ---- floor 1 walls (0 .. F2) — holes are visual only; the T-Rex cannot
    // see or reach anyone on the ground floor ----
    // north (z=-7): grand doorway (exit one)
    wallX(-7, -R.halfX, R.halfX, 0, F2, [[-1.5, 1.5, 0, 2.9]]);
    // south (z=7): SECOND EXIT + one hole (escape whichever side is clear)
    wallX(R.halfZ, -R.halfX, R.halfX, 0, F2, [[-1.3, 1.3, 0, 2.7], [-8, -6, 1.0, 2.6]]);
    // east (x=12): one hole (north half — the alcove is the south half)
    wallZ(R.halfX, -R.halfZ, R.halfZ, 0, F2, [[-4, -2, 1.0, 2.6]]);
    // west (x=-12): one hole
    wallZ(-R.halfX, -R.halfZ, R.halfZ, 0, F2, [[-1, 1, 1.0, 2.6]]);

    // ---- floor 2 walls (F2 .. F3) — the T-Rex can reach these holes ----
    wallX(-7, -R.halfX, R.halfX, F2, F3, [[-7, -5, F2 + 1.0, F2 + 2.6], [5, 7, F2 + 1.0, F2 + 2.6]]);
    win(-6, -7, 0, -1, F2); win(6, -7, 0, -1, F2);
    wallX(7, -R.halfX, R.halfX, F2, F3, [[-2, 0, F2 + 1.0, F2 + 2.6]]);
    win(-1, 7, 0, 1, F2);
    wallZ(R.halfX, -7, 7, F2, F3, [[0, 2, F2 + 1.0, F2 + 2.6]]);
    win(R.halfX, 1, 1, 0, F2);
    wallZ(-R.halfX, -7, 7, F2, F3, [[-4, -2, F2 + 1.0, F2 + 2.6]]);
    win(-R.halfX, -3, -1, 0, F2);

    // ---- floor 3 parapet (ruined, crumbling — safe from the T-Rex) ----
    wallX(-7, -R.halfX, 2, F3, F3 + 1.15, []);
    wallX(7, -R.halfX, 5, F3, F3 + 1.15, []);
    wallZ(-R.halfX, -7, 7, F3, F3 + 1.15, []);
    wallZ(R.halfX, -7, -3, F3, F3 + 1.15, []);

    // ---- interior: entry hall walls + alcove ----
    wallZ(-4, -7, -2.2, 0, F2, []);          // hall west
    wallZ(4, -7, -2.2, 0, F2, []);           // hall east
    wallZ(6.2, 2.2, R.halfZ, 0, F2, [[4.3, 5.5, 0, 2.2]]); // alcove wall + doorway
    wallX(2.2, 6.2, R.halfX, 0, F2, []);     // alcove north wall

    // ---- crafting table on floor 2 (near the holes — earn it) ----
    const [ctx2, ctz2] = R.craftTable;
    const ctAsset = this.assets.glb.crafttable;
    if (ctAsset) {
      // the GENERATED workbench: scarred top, tools and all
      const m = ctAsset.model.clone();
      m.position.set(ctx2, F2 + 0.02, ctz2);
      m.rotation.y = Math.PI;
      this.scene.add(m);
    } else {
      const tblMat = new THREE.MeshStandardMaterial({ color: 0x3a3226, roughness: 1 });
      const tblTop = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.9), tblMat);
      tblTop.position.set(ctx2, F2 + 0.85, ctz2);
      this.scene.add(tblTop);
      for (const [lx, lz] of [[-0.7, -0.35], [0.7, -0.35], [-0.7, 0.35], [0.7, 0.35]]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.85, 0.12), tblMat);
        leg.position.set(ctx2 + lx, F2 + 0.42, ctz2 + lz);
        this.scene.add(leg);
      }
      const tools = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.3),
        new THREE.MeshStandardMaterial({ color: 0xb06a2c, roughness: 0.8 }));
      tools.position.set(ctx2 + 0.4, F2 + 0.95, ctz2);
      this.scene.add(tools);
    }
    this.addBox(ctx2 - 0.8, ctx2 + 0.8, F2, F2 + 0.95, ctz2 - 0.45, ctz2 + 0.45);
    this.craftTable = { x: ctx2, z: ctz2, y: F2 };

    // ---- floor plates ----
    const plate = (x0, x1, z0, z1, y) => {
      const g = new THREE.BoxGeometry(x1 - x0, 0.28, z1 - z0);
      g.translate((x0 + x1) / 2, y - 0.14, (z0 + z1) / 2);
      stoneGeos.push(g);
      this.addBox(x0, x1, y - 0.3, y, z0, z1);
    };
    const A = R.atrium;
    // floor 2 plate around the atrium hole and the two ramp wells
    plate(-8.4, 8.4, -R.halfZ, A.z0, F2);            // north strip
    plate(-8.4, 8.4, A.z1, 4.6, F2);                 // south strip (stairwell cut)
    plate(-0.6, 8.4, 4.6, R.halfZ, F2);              // over the alcove
    plate(-R.halfX + 0.35, -8.4, -R.halfZ, R.halfZ, F2); // full west strip (ramp gone)
    plate(-8.4, A.x0, A.z0, A.z1, F2);               // west-of-atrium strip
    plate(A.x1, 8.4, A.z0, A.z1, F2);                // east strip
    plate(8.4, R.halfX, -R.halfZ, R.halfZ, F2);      // full east strip
    // the roof: covers the WHOLE first floor now — no more open sky upstairs
    plate(-R.halfX + 0.3, R.halfX, -R.halfZ, R.halfZ, F3);
    // ground floor stone slab
    const fg = new THREE.BoxGeometry(R.halfX * 2 + 0.7, 0.12, R.halfZ * 2 + 0.7);
    fg.translate(0, 0.06, 0);
    stoneGeos.push(fg);

    // ---- ramps (visual; walkable via groundHeight) ----
    const rampGeo = (cx, topZ, botZ, y0, y1) => {
      const len = Math.abs(topZ - botZ);
      const g = new THREE.BoxGeometry(2.6, 0.18, Math.hypot(len, y1 - y0));
      g.rotateX(Math.atan2(y1 - y0, len) * (topZ > botZ ? 1 : -1));
      g.translate(cx, (y0 + y1) / 2, (topZ + botZ) / 2);
      stoneGeos.push(g);
    };
    // the STAIRCASE: in the south-west room, straight up the south wall
    const steps = 14, sLen = 7.7;
    for (let i = 0; i < steps; i++) {
      const x1 = -0.6 - (sLen / steps) * (i + 1);
      const y1 = (F2 / steps) * (i + 1);
      const sg = new THREE.BoxGeometry(sLen / steps + 0.06, 0.26, 2.3);
      sg.translate(x1 + (sLen / steps) / 2, y1 - 0.13, 5.78);
      stoneGeos.push(sg);
    }
    // (no ramp above the first floor — the roof is out of reach, as intended)
    void rampGeo;

    // ---- columns: portico + atrium ----
    const colGeo = [];
    const column = (x, z, h, y0 = 0) => {
      const c = new THREE.CylinderGeometry(0.38, 0.44, h, 10);
      c.translate(x, y0 + h / 2, z);
      colGeo.push(c);
      const cap = new THREE.BoxGeometry(1.05, 0.22, 1.05);
      cap.translate(x, y0 + h + 0.11, z);
      colGeo.push(cap);
      this.addBox(x - 0.45, x + 0.45, y0, y0 + h, z - 0.45, z + 0.45);
    };
    for (const cx of [-6, -2, 2, 6]) column(cx, -8.6, 3.4);
    const lintel = new THREE.BoxGeometry(14.4, 0.5, 1.2);
    lintel.translate(0, 3.85, -8.6);
    colGeo.push(lintel);
    for (const [cx, cz] of [[A.x0 - 0.6, A.z0 - 0.6], [A.x1 + 0.6, A.z0 - 0.6], [A.x0 - 0.6, A.z1 + 0.6], [A.x1 + 0.6, A.z1 + 0.6]])
      column(cx, cz, F2);

    // ---- rubble blocks ----
    const rub = (x, z, s, rot, y = 0) => {
      const g = new THREE.BoxGeometry(s, s * 0.7, s * 0.85);
      g.rotateY(rot); g.rotateZ(rot * 0.3);
      g.translate(x, y + s * 0.3, z);
      stoneGeos.push(g);
      this.addBox(x - s / 2, x + s / 2, y, y + s * 0.7, z - s / 2, z + s / 2);
    };
    rub(-9, -4, 1.2, 0.7); rub(-6.5, 4.8, 0.9, 2.1); rub(10.5, -8.9, 1.4, 1.2);
    rub(-3, 5.8, 0.7, 0.4); rub(2.5, 7.9, 1.1, 2.8, 0); rub(5, -2, 0.8, 1.9, F2);

    const stoneMat = this.mat("t_romanstone", 3.4, 1.7, 0x7a7f74);
    const stoneMesh = new THREE.Mesh(mergeGeometries(stoneGeos), stoneMat);
    stoneMesh.castShadow = stoneMesh.receiveShadow = true; // walls contain the firelight
    this.scene.add(stoneMesh);
    const colMat = this.mat("t_romanstone", 1.2, 2.4, 0x83887c);
    const colMesh = new THREE.Mesh(mergeGeometries(colGeo), colMat);
    colMesh.castShadow = colMesh.receiveShadow = true;
    this.scene.add(colMesh);

    // ---- statues (generated GLB; obelisk fallback) ----
    const statue = this.assets.glb.statue;
    const statueSpots = [
      [-3.2, -8.4, Math.PI], [3.2, -8.4, Math.PI],
      [A.x0 - 1.6, 0, Math.PI / 2], [A.x1 + 1.6, 0, -Math.PI / 2],
      [-6, 5.6, 0, 0], [0, -6, Math.PI, F2],
    ];
    for (const [sx, sz, yaw, sy = 0] of statueSpots) {
      let m;
      if (statue) m = statue.model.clone();
      else {
        m = new THREE.Group();
        const ob = new THREE.Mesh(new THREE.BoxGeometry(0.6, 2.4, 0.6),
          new THREE.MeshStandardMaterial({ color: 0x83887c, roughness: 1 }));
        ob.position.y = 1.2;
        m.add(ob);
      }
      m.position.set(sx, sy, sz);
      m.rotation.y = yaw;
      this.scene.add(m);
      this.addBox(sx - 0.5, sx + 0.5, sy, sy + 2.4, sz - 0.5, sz + 0.5);
    }

    // ---- the safe alcove: real mattress + sleeping bag, personal storage ----
    const [bx, bz] = R.sleepBag;
    const bedrollAsset = this.assets.glb.bedroll;
    if (bedrollAsset) {
      const bag = bedrollAsset.model.clone();
      bag.position.set(bx, 0.02, bz);
      bag.rotation.y = 0.4;
      this.scene.add(bag);
    } else {
      const bag = new THREE.Group();
      const mainBag = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.22, 2.0),
        new THREE.MeshStandardMaterial({ color: 0x5c5636, roughness: 1 }));
      mainBag.position.y = 0.11;
      const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.8, 8),
        new THREE.MeshStandardMaterial({ color: 0x8a7a56, roughness: 1 }));
      roll.rotation.z = Math.PI / 2;
      roll.position.set(0, 0.26, -0.75);
      bag.add(mainBag, roll);
      bag.position.set(bx, 0.06, bz);
      bag.rotation.y = 0.4;
      this.scene.add(bag);
    }
    this.beds.push({ x: bx, z: bz, y: 0, label: "building" });

    const [scx, scz] = R.storageChest;
    const scAsset = this.assets.glb.storagechest;
    let scMesh;
    if (scAsset) scMesh = scAsset.model.clone();
    else {
      scMesh = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.55),
        new THREE.MeshStandardMaterial({ color: 0x2e3134, roughness: 0.6, metalness: 0.5 }));
      body.position.y = 0.28;
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.1, 0.57),
        new THREE.MeshStandardMaterial({ color: 0xb06a2c, roughness: 0.8 }));
      stripe.position.y = 0.45;
      scMesh.add(body, stripe);
    }
    scMesh.position.set(scx, 0, scz);
    scMesh.rotation.y = -0.9;
    this.scene.add(scMesh);
    this.addBox(scx - 0.5, scx + 0.5, 0, 0.7, scz - 0.4, scz + 0.4);
    this.storageChest = { x: scx, z: scz, y: 0 };

    const [cx, cz] = R.campfire;
    const fire = new THREE.Group();
    // real logs: bark-textured, charred toward the center
    const logMat = this.mat("t_bark", 1.6, 0.7, 0x4a3b28);
    const charMat = new THREE.MeshStandardMaterial({ color: 0x17130e, roughness: 1 });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.35;
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.095, 1.0, 8), logMat);
      log.rotation.z = Math.PI / 2.25;
      log.rotation.y = a;
      log.position.y = 0.14;
      fire.add(log);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.085, 6, 5), charMat);
      tip.position.set(Math.cos(a + Math.PI / 2) * 0.12, 0.3, Math.sin(a + Math.PI / 2) * 0.12);
      fire.add(tip);
    }
    // charcoal bed
    const coals = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 0.1, 10),
      new THREE.MeshStandardMaterial({ color: 0x201510, roughness: 1, emissive: 0xa8420e, emissiveIntensity: 0.6 }));
    coals.position.y = 0.07;
    fire.add(coals);
    this.coals = coals;
    const stoneRingMat = new THREE.MeshStandardMaterial({ color: 0x6a6f64, roughness: 1 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.13, 0), stoneRingMat);
      st.position.set(Math.cos(a) * 0.6, 0.09, Math.sin(a) * 0.6);
      st.rotation.set(a, a * 2, 0);
      fire.add(st);
    }
    // flame: generated fire image on black -> additive billboards (3 layers)
    const flameTex = this.assets.flame || new THREE.CanvasTexture(makeFlameCanvas());
    flameTex.colorSpace = THREE.SRGBColorSpace;
    const flameMat = new THREE.MeshBasicMaterial({
      map: flameTex, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.flames = [];
    for (const [rot, s] of [[0, 1], [Math.PI / 2, 0.92], [Math.PI / 4, 0.7]]) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(0.95 * s, 1.15 * s), flameMat);
      f.position.y = 0.62 * s + 0.1;
      f.rotation.y = rot;
      fire.add(f);
      this.flames.push(f);
    }
    // embers drifting up
    const emberGeo = new THREE.BufferGeometry();
    const emberN = 14, emberPos = new Float32Array(emberN * 3);
    for (let i = 0; i < emberN; i++) {
      emberPos[i * 3] = (Math.random() - 0.5) * 0.4;
      emberPos[i * 3 + 1] = Math.random() * 1.6;
      emberPos[i * 3 + 2] = (Math.random() - 0.5) * 0.4;
    }
    emberGeo.setAttribute("position", new THREE.BufferAttribute(emberPos, 3));
    const embers = new THREE.Points(emberGeo, new THREE.PointsMaterial({
      color: 0xff9a40, size: 0.035, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    fire.add(embers);
    this.embers = embers;
    fire.position.set(cx, 0, cz);
    this.scene.add(fire);
    // the light CASTS SHADOWS so it stays inside the room
    this.fireLight = new THREE.PointLight(0xd07a30, 14, 9, 2);
    this.fireLight.position.set(cx, 1.2, cz);
    this.fireLight.castShadow = true;
    this.fireLight.shadow.mapSize.set(512, 512);
    this.fireLight.shadow.camera.near = 0.2;
    this.fireLight.shadow.camera.far = 9;
    this.fireLight.shadow.bias = -0.01;
    this.scene.add(this.fireLight);
    this.campfire = { x: cx, z: cz, y: 0 };
    this.addBox(cx - 0.5, cx + 0.5, 0, 0.4, cz - 0.5, cz + 0.5);
  }

  buildBed(x, z, floorY, yaw, label) {
    const g = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.3, 2.1),
      new THREE.MeshStandardMaterial({ color: 0x4a3b28, roughness: 1 }));
    frame.position.y = 0.25;
    const matt = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.18, 2.0),
      new THREE.MeshStandardMaterial({ color: 0x6a7258, roughness: 1 }));
    matt.position.y = 0.48;
    const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.12, 0.45),
      new THREE.MeshStandardMaterial({ color: 0xb8b2a0, roughness: 1 }));
    pillow.position.set(0, 0.6, -0.7);
    const blanket = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.06, 1.2),
      new THREE.MeshStandardMaterial({ color: 0x8a5a34, roughness: 1 }));
    blanket.position.set(0, 0.59, 0.35);
    g.add(frame, matt, pillow, blanket);
    g.position.set(x, floorY, z);
    g.rotation.y = yaw;
    this.scene.add(g);
    this.addBox(x - 0.6, x + 0.6, floorY, floorY + 0.6, z - 1.1, z + 1.1);
    this.beds.push({ x, z, y: floorY, label });
  }

  // Tree hut — bigger, sealed (gables closed), one window, an openable door,
  // dinner table with two chairs. Bed / kitchen / Bill untouched by request.
  buildHut() {
    const [hx, hz] = CFG.world.hutPos;
    const H = CFG.hut, W2 = H.w / 2, D2 = H.d / 2;
    const wh = H.wallH, wTop = 2.2 + wh;
    const woodGeos = [];
    const woodMat = this.mat("t_darkwood", 3, 3, 0x3a3226);
    const box = (cx, cy, cz, sx, sy, sz, collide = true) => {
      const g = new THREE.BoxGeometry(sx, sy, sz);
      g.translate(cx, cy, cz);
      woodGeos.push(g);
      if (collide) this.addBox(cx - sx / 2, cx + sx / 2, cy - sy / 2, cy + sy / 2, cz - sz / 2, cz + sz / 2);
    };
    // platform + stilts
    box(hx, 2.1, hz, H.w + 0.4, 0.2, H.d + 0.4, false);
    this.addBox(hx - W2, hx + W2, 0, 2.2, hz - D2, hz + D2);
    for (const [sx, sz] of [[-W2 + 0.3, -D2 + 0.3], [W2 - 0.3, -D2 + 0.3], [-W2 + 0.3, D2 - 0.3], [W2 - 0.3, D2 - 0.3], [0, -D2 + 0.3], [0, D2 - 0.3]])
      box(hx + sx, 1.05, hz + sz, 0.35, 2.1, 0.35);
    const wy = 2.2 + wh / 2, T = 0.22;
    // south wall: the doorway (the only entrance)
    box(hx - 0.65 - (W2 - 0.65) / 2, wy, hz + D2, W2 - 0.65, wh, T);
    box(hx + 0.65 + (W2 - 0.65) / 2, wy, hz + D2, W2 - 0.65, wh, T);
    box(hx, 2.2 + wh - 0.25, hz + D2, 1.4, 0.5, T, false);
    // north + east walls: sealed, no holes
    box(hx, wy, hz - D2, H.w, wh, T);
    box(hx + W2, wy, hz, T, wh, H.d);
    // west wall: ONE window to watch through (sill 1.0, top 2.2)
    box(hx - W2, wy, hz - 0.9 - (D2 - 0.9) / 2, T, wh, D2 - 0.9);
    box(hx - W2, wy, hz + 0.9 + (D2 - 0.9) / 2, T, wh, D2 - 0.9);
    box(hx - W2, 2.2 + 0.5, hz, T, 1.0, 1.8, false);
    box(hx - W2, 2.2 + wh - 0.2, hz, T, 0.4, 1.8, false);
    // shutters
    box(hx - W2 - 0.12, 2.2 + 1.6, hz - 1.15, 0.08, 1.2, 0.5, false);
    box(hx - W2 - 0.12, 2.2 + 1.6, hz + 1.15, 0.08, 1.2, 0.5, false);
    // pitched roof, sealed: slabs + ridge + eave beams + gable triangles
    const rise = H.ridge;
    const slopeH = D2 + 0.5;
    const slopeLen = Math.hypot(slopeH, rise) + 0.1;
    const pitch = Math.atan2(rise, slopeH);
    for (const side of [1, -1]) {
      const g = new THREE.BoxGeometry(H.w + 0.9, 0.14, slopeLen);
      g.rotateX(side * pitch);
      g.translate(hx, wTop + rise / 2 + 0.05, hz + side * slopeH / 2);
      woodGeos.push(g);
    }
    box(hx, wTop + rise + 0.1, hz, H.w + 1.0, 0.16, 0.5, false); // ridge beam
    box(hx, wTop + 0.06, hz + D2, H.w + 0.5, 0.28, 0.34, false); // eave beams
    box(hx, wTop + 0.06, hz - D2, H.w + 0.5, 0.28, 0.34, false);
    // gable triangles close the roof ends — double-sided so they render from
    // inside AND outside (the "open roof" hole was a one-sided face)
    const gableMat = woodMat.clone();
    gableMat.side = THREE.DoubleSide;
    for (const side of [-1, 1]) {
      const gx = hx + side * W2;
      const tri = new THREE.BufferGeometry();
      tri.setAttribute("position", new THREE.Float32BufferAttribute([
        gx, wTop - 0.1, hz - D2 - 0.6, gx, wTop - 0.1, hz + D2 + 0.6, gx, wTop + rise + 0.15, hz,
      ], 3));
      tri.setIndex([0, 1, 2]);
      tri.computeVertexNormals();
      tri.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 3, 0, 1.5, 1], 2));
      const m = new THREE.Mesh(tri, gableMat);
      this.scene.add(m);
    }
    // the window is for LOOKING, not leaving: invisible pane blocks the opening
    this.addBox(hx - W2 - 0.15, hx - W2 + 0.15, 2.2, wTop, hz - 1.0, hz + 1.0);
    // the DOOR — the frame stays put; ONLY the leaf swings on its hinge
    const doorGrp = this.mountDoor(this.assets.glb.door, hx, hz + D2, "hut");
    this.addBox(hx - 0.68, hx + 0.68, 2.2, 4.3, hz + D2 - 0.1, hz + D2 + 0.1);
    this.hutDoor = {
      grp: doorGrp, open: false,
      x: hx, z: hz + D2, y: 2.2,
      boxRef: this.boxes[this.boxes.length - 1],
      closedBox: Object.assign({}, this.boxes[this.boxes.length - 1]),
    };
    // a TRUE wooden staircase up to the door: stringers, treads, handrails.
    // (groundHeight already lerps this stretch, so the steps are pure looks.)
    const rz0 = hz + D2, rz1 = hz + D2 + 7.0;
    const nSteps = 12, stepRise = 2.2 / nSteps, stepRun = (rz1 - rz0) / nSteps;
    for (let i = 0; i < nSteps; i++) {
      const zc = rz1 - stepRun * (i + 0.5);
      const yTop = stepRise * (i + 1);
      // tread + riser board
      box(hx, yTop - 0.045, zc, 2.2, 0.09, stepRun + 0.08, false);
      box(hx, yTop - stepRise / 2 - 0.02, zc + stepRun / 2 - 0.03, 2.2, stepRise + 0.06, 0.06, false);
    }
    // stringers: two long boards following the slope
    for (const side of [-1, 1]) {
      const g = new THREE.BoxGeometry(0.14, 0.34, Math.hypot(7.0, 2.2) + 0.4);
      g.rotateX(Math.atan2(2.2, 7.0));
      g.translate(hx + side * 1.09, 1.06, rz0 + 3.5);
      woodGeos.push(g);
    }
    // handrails on posts
    for (const side of [-1, 1]) {
      const rail = new THREE.BoxGeometry(0.09, 0.09, Math.hypot(7.0, 2.2));
      rail.rotateX(Math.atan2(2.2, 7.0));
      rail.translate(hx + side * 1.14, 2.06, rz0 + 3.5);
      woodGeos.push(rail);
      for (let i = 0; i <= 3; i++) {
        const zc = rz1 - (7.0 / 3) * i;
        const yb = 2.2 * (rz1 - zc) / (rz1 - rz0);
        box(hx + side * 1.14, yb + 0.48, zc, 0.09, 0.96, 0.09, false);
      }
    }
    // kitchen (generated model — unchanged look)
    const kAsset = this.assets.glb.kitchen;
    if (kAsset) {
      const k = kAsset.model.clone();
      k.position.set(hx - 2.2, 2.2, hz - D2 + 0.35);
      this.scene.add(k);
      this.addBox(hx - 3.4, hx - 1.0, 2.2, 3.6, hz - D2, hz - D2 + 0.85);
      this.stoveBurner = null;
    } else {
      box(hx - 2.2, 2.2 + 0.45, hz - D2 + 0.5, 2.4, 0.9, 0.8);
      this.stoveBurner = null;
    }
    this.stove = { x: hx - 2.2, z: hz - D2 + 0.5, y: 2.2 };
    // Bill: stands by the kitchen — or sits at the dinner table sometimes
    this.bill = { x: hx + 0.5, z: hz - 2.4, y: 2.2, yaw: Math.PI * 0.85 };
    // dinner table + two chairs (generated models when available)
    const tx = hx - 1.2, tz = hz + 1.4;
    const tableMat = new THREE.MeshStandardMaterial({ color: 0x352c20, roughness: 1 });
    const tAsset = this.assets.glb.table;
    if (tAsset) {
      const tm = tAsset.model.clone();
      tm.position.set(tx, 2.2, tz);
      this.scene.add(tm);
    } else {
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.08, 14), tableMat);
      top.position.set(tx, 2.2 + 0.8, tz);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.8, 8), tableMat);
      leg.position.set(tx, 2.2 + 0.4, tz);
      this.scene.add(top, leg);
    }
    // a sewing needle glints on the table — Bill sets out a fresh one each dawn
    {
      const nd = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.002, 0.17, 5),
        new THREE.MeshStandardMaterial({ color: 0xd4d9de, roughness: 0.25, metalness: 0.75 }));
      nd.rotation.z = Math.PI / 2 - 0.1;
      nd.rotation.y = 0.6;
      nd.position.set(tx + 0.3, 2.2 + 0.87, tz + 0.2);
      this.scene.add(nd);
      this.needleMesh = nd;
      this.needleSpot = { x: tx + 0.3, z: tz + 0.2, y: 3.0 };
    }
    this.addBox(tx - 0.75, tx + 0.75, 2.2, 3.1, tz - 0.75, tz + 0.75);
    const cAsset = this.assets.glb.chair;
    const chair = (cx, cz, yaw) => {
      if (cAsset) {
        const cm = cAsset.model.clone();
        cm.position.set(cx, 2.2, cz);
        cm.rotation.y = yaw;
        this.scene.add(cm);
      } else {
        const g = new THREE.Group();
        const seat = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.09, 0.52), tableMat);
        seat.position.y = 0.5;
        const back = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.08), tableMat);
        back.position.set(0, 0.85, 0.24);
        const ped = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.12), tableMat);
        ped.position.y = 0.25;
        g.add(seat, back, ped);
        g.position.set(cx, 2.2, cz);
        g.rotation.y = yaw;
        this.scene.add(g);
      }
      this.addBox(cx - 0.28, cx + 0.28, 2.2, 2.9, cz - 0.28, cz + 0.28);
    };
    // chairs face EACH OTHER across the table (turned 180° from before)
    chair(tx - 1.15, tz, Math.PI / 2);
    chair(tx + 1.15, tz, -Math.PI / 2);
    this.chairs = {
      bill: { x: tx - 1.15, z: tz, y: 2.2, yaw: Math.PI / 2 },
      sit: { x: tx + 1.15, z: tz, y: 2.2, yaw: Math.PI / 2 },
    };
    // crates + the GENERATED barrel + lantern
    box(hx + 3.6, 2.2 + 0.3, hz + 2.6, 0.6, 0.6, 0.6, false);
    box(hx + 3.1, 2.2 + 0.24, hz + 2.9, 0.48, 0.48, 0.48, false);
    const brlAsset = this.assets.glb.barrel;
    if (brlAsset) {
      const brl = brlAsset.model.clone();
      brl.position.set(hx + 5.2, 0, hz + 2.2);
      brl.rotation.y = 0.7;
      this.scene.add(brl);
    } else {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.0, 10),
        new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 1 }));
      barrel.position.set(hx + 5.2, 0.5, hz + 2.2);
      this.scene.add(barrel);
    }
    this.addBox(hx + 4.75, hx + 5.65, 0, 1, hz + 1.75, hz + 2.65);
    const lnAsset = this.assets.glb.lantern;
    if (lnAsset) {
      const ln = lnAsset.model.clone();
      ln.position.set(hx + 1.3, 2.2 + 1.85, hz + D2 + 0.2);
      this.scene.add(ln);
    } else {
      const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 0.2),
        new THREE.MeshStandardMaterial({ color: 0x2a2c2e, emissive: 0xc98a4a, emissiveIntensity: 1.2 }));
      lantern.position.set(hx + 1.3, 2.2 + 2.1, hz + D2 + 0.15);
      this.scene.add(lantern);
    }
    // OUTSIDE light: spot the hut through the trees at night
    const porchLight = new THREE.PointLight(0xd89a4a, 10, 14, 2);
    porchLight.position.set(hx + 1.3, 2.2 + 2.2, hz + D2 + 0.6);
    this.scene.add(porchLight);
    // INSIDE light: a hanging oil lamp under the ridge — shelter with light
    const lampCord = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.7, 5),
      new THREE.MeshStandardMaterial({ color: 0x1c1a16, roughness: 1 }));
    lampCord.position.set(hx - 0.3, wTop + 0.75, hz);
    const lampShade = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.24, 10),
      new THREE.MeshStandardMaterial({ color: 0x2e3134, roughness: 0.7, metalness: 0.4 }));
    lampShade.position.set(hx - 0.3, wTop + 0.36, hz);
    const lampBulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xffe0a0, emissive: 0xffc060, emissiveIntensity: 2.2 }));
    lampBulb.position.set(hx - 0.3, wTop + 0.24, hz);
    this.scene.add(lampCord, lampShade, lampBulb);
    const lampLight = new THREE.PointLight(0xe8b060, 20, 12, 2);
    lampLight.position.set(hx - 0.3, wTop + 0.1, hz);
    this.scene.add(lampLight);

    const hbAsset = this.assets.glb.hutbed;
    if (hbAsset) {
      const b = hbAsset.model.clone();
      b.position.set(hx + 3.0, 2.3, hz + 0.4);
      this.scene.add(b);
      this.addBox(hx + 2.3, hx + 3.7, 2.3, 2.95, hz - 0.7, hz + 1.5);
      this.beds.push({ x: hx + 3.0, z: hz + 0.4, y: 2.3, label: "hut" });
    } else {
      this.buildBed(hx + 3.0, hz + 0.4, 2.3, 0, "hut");
    }

    // Bill's CLOSET: generated wardrobe with his books and clothes (decor)
    const clAsset = this.assets.glb.closet;
    if (clAsset) {
      const cl = clAsset.model.clone();
      cl.position.set(hx - 4.05, 2.2, hz - 1.9);
      cl.rotation.y = Math.PI / 2;
      this.scene.add(cl);
    }
    this.addBox(hx - 4.4, hx - 3.7, 2.2, 4.4, hz - 2.6, hz - 1.2);
    // Bill's WOODEN CHEST: extra storage he only unlocks for a true friend
    const wcAsset = this.assets.glb.woodchest;
    if (wcAsset) {
      const wc = wcAsset.model.clone();
      wc.position.set(hx + 3.8, 2.2, hz - 2.7);
      wc.rotation.y = -Math.PI / 2;
      this.scene.add(wc);
    } else {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.6), woodMat);
      body.position.set(hx + 3.8, 2.5, hz - 2.7);
      this.scene.add(body);
    }
    this.addBox(hx + 3.35, hx + 4.25, 2.2, 2.9, hz - 3.1, hz - 2.3);
    this.hutChest = { x: hx + 3.8, z: hz - 2.7, y: 2.2 };

    // chicken pen behind the hut
    const P = CFG.pen;
    const pz0 = hz + P.z0, pz1 = hz + P.z1, px0 = hx + P.x0, px1 = hx + P.x1;
    const rail = (cx, cy, cz, sx, sz) => box(cx, cy, cz, sx, 0.08, sz, false);
    const post = (cx, cz) => box(cx, 0.45, cz, 0.12, 0.9, 0.12, false);
    for (let x = px0; x <= px1 + 0.01; x += 1.5) post(x, pz0), post(x, pz1);
    for (let z = pz0; z <= pz1 + 0.01; z += 1.25) post(px0, z), post(px1, z);
    rail((px0 + px1) / 2, 0.42, pz0, px1 - px0, 0.06); rail((px0 + px1) / 2, 0.78, pz0, px1 - px0, 0.06);
    rail(px0, 0.42, (pz0 + pz1) / 2, 0.06, pz1 - pz0); rail(px0, 0.78, (pz0 + pz1) / 2, 0.06, pz1 - pz0);
    const gz = (pz0 + pz1) / 2;
    rail(px1, 0.42, (pz0 + gz - 0.6) / 2, 0.06, gz - 0.6 - pz0); rail(px1, 0.78, (pz0 + gz - 0.6) / 2, 0.06, gz - 0.6 - pz0);
    rail(px1, 0.42, (gz + 0.6 + pz1) / 2, 0.06, pz1 - gz - 0.6); rail(px1, 0.78, (gz + 0.6 + pz1) / 2, 0.06, pz1 - gz - 0.6);
    this.addBox(px0 - 0.06, px1 + 0.06, 0, 0.9, pz0 - 0.06, pz0 + 0.06);
    this.addBox(px0 - 0.06, px0 + 0.06, 0, 0.9, pz0, pz1);
    this.addBox(px1 - 0.06, px1 + 0.06, 0, 0.9, pz0, gz - 0.6);
    this.addBox(px1 - 0.06, px1 + 0.06, 0, 0.9, gz + 0.6, pz1);

    this.scene.add(new THREE.Mesh(mergeGeometries(woodGeos), woodMat));
  }

  buildTrees() {
    const rng = this.rng;
    const positions = [];
    const [hx, hz] = CFG.world.hutPos;
    const W = CFG.world;
    let guard = 0;
    while (positions.length < W.treeCount && guard++ < 60000) {
      const x = (rng() * 2 - 1) * W.treeMaxR;
      const z = (rng() * 2 - 1) * W.treeMaxR;
      const r = Math.hypot(x, z);
      if (r < W.treeMinR || r > W.treeMaxR) continue;
      if (this.distToPath(x, z) < W.pathClearance) continue;
      if (Math.hypot(x - hx, z - hz) < 9) continue; // clearing matches the bigger hut
      if (W.chests.some(([cx, cz]) => Math.hypot(x - cx, z - cz) < 2.6)) continue;
      if (W.appleTrees.some(([ax, az]) => Math.hypot(x - ax, z - az) < 5)) continue;
      if (positions.some(([px, pz]) => Math.hypot(x - px, z - pz) < W.treeSpacing)) continue;
      positions.push([x, z, 0.8 + rng() * 0.5, rng() * Math.PI * 2]);
    }

    // the NEW AREA: a second, vast forest ring beyond the old boundary
    const NA = CFG.newArea;
    let guard2 = 0;
    const newStart = positions.length;
    while (positions.length - newStart < NA.treeCount && guard2++ < 90000) {
      const x = (rng() * 2 - 1) * NA.treeMaxR;
      const z = (rng() * 2 - 1) * NA.treeMaxR;
      const r = Math.hypot(x, z);
      if (r < NA.treeMinR || r > NA.treeMaxR) continue;
      if (this.inNewLandmark(x, z)) continue;
      if (CFG.newArea.chests.some(([cx, cz]) => Math.hypot(x - cx, z - cz) < 2.6)) continue;
      if (positions.some(([px, pz]) => Math.hypot(x - px, z - pz) < W.treeSpacing)) continue;
      positions.push([x, z, 0.8 + rng() * 0.5, rng() * Math.PI * 2]);
    }

    // the DEEP-JUNGLE ring (update 8): the old map untouched, more forest around it
    const allApples = [...CFG.world.appleTrees, ...CFG.appleTrees2];
    const R2 = CFG.ring2;
    let guard3 = 0;
    const r2Start = positions.length;
    while (positions.length - r2Start < R2.treeCount && guard3++ < 90000) {
      const x = (rng() * 2 - 1) * R2.treeMaxR;
      const z = (rng() * 2 - 1) * R2.treeMaxR;
      const r = Math.hypot(x, z);
      if (r < R2.treeMinR || r > R2.treeMaxR) continue;
      if (this.inMountain(x, z)) continue;   // the rocky biome grows only dead wood
      if (this.inNewLandmark(x, z)) continue;
      if (R2.chests.some(([cx, cz]) => Math.hypot(x - cx, z - cz) < 2.6)) continue;
      if (allApples.some(([ax, az]) => Math.hypot(x - ax, z - az) < 5)) continue;
      if (positions.some(([px, pz]) => Math.hypot(x - px, z - pz) < W.treeSpacing)) continue;
      positions.push([x, z, 0.85 + rng() * 0.55, rng() * Math.PI * 2]);
    }

    // the FRONTIER ring (update 10): pure wild forest, room for future content
    const R3 = CFG.ring3;
    let guard4 = 0;
    const r3Start = positions.length;
    while (positions.length - r3Start < R3.treeCount && guard4++ < 90000) {
      const x = (rng() * 2 - 1) * R3.treeMaxR;
      const z = (rng() * 2 - 1) * R3.treeMaxR;
      const r = Math.hypot(x, z);
      if (r < R3.treeMinR || r > R3.treeMaxR) continue;
      if (this.inMountain(x, z)) continue;
      if (this.inNewLandmark(x, z)) continue;
      if (CFG.extraChests.some(([cx, cz]) => Math.hypot(x - cx, z - cz) < 2.6)) continue;
      if (allApples.some(([ax, az]) => Math.hypot(x - ax, z - az) < 5)) continue;
      if (positions.some(([px, pz]) => Math.hypot(x - px, z - pz) < W.treeSpacing)) continue;
      positions.push([x, z, 0.85 + rng() * 0.55, rng() * Math.PI * 2]);
    }

    // update 23: the EXPANSION BAND — the square grew 10%, and the new ring
    // fills with the same wild forest (the mountain corner rejects it and
    // grows bare rock by its own radial profile instead)
    const R4 = CFG.ring4;
    let guard4b = 0;
    const r4Start = positions.length;
    while (positions.length - r4Start < R4.treeCount && guard4b++ < 90000) {
      const x = (rng() * 2 - 1) * R4.treeMaxR;
      const z = (rng() * 2 - 1) * R4.treeMaxR;
      const r = Math.hypot(x, z);
      if (r < R4.treeMinR || r > R4.treeMaxR) continue;
      if (this.inMountain(x, z)) continue;
      if (this.inNewLandmark(x, z)) continue;   // update 30: the outer bands keep clear of landmarks too
      if (positions.some(([px, pz]) => Math.hypot(x - px, z - pz) < W.treeSpacing)) continue;
      positions.push([x, z, 0.85 + rng() * 0.55, rng() * Math.PI * 2]);
    }

    // update 27: the second expansion band, one ring further out
    const R5 = CFG.ring5;
    let guard4c = 0;
    const r5Start = positions.length;
    while (positions.length - r5Start < R5.treeCount && guard4c++ < 120000) {
      const x = (rng() * 2 - 1) * R5.treeMaxR;
      const z = (rng() * 2 - 1) * R5.treeMaxR;
      const r = Math.hypot(x, z);
      if (r < R5.treeMinR || r > R5.treeMaxR) continue;
      if (this.inMountain(x, z)) continue;
      if (this.inNewLandmark(x, z)) continue;   // update 30
      if (positions.some(([px, pz]) => Math.hypot(x - px, z - pz) < W.treeSpacing)) continue;
      positions.push([x, z, 0.85 + rng() * 0.55, rng() * Math.PI * 2]);
    }
    // update 29: the third expansion band — same recipe, one ring further out
    const R6 = CFG.ring6;
    let guard4d = 0;
    const r6Start = positions.length;
    while (positions.length - r6Start < R6.treeCount && guard4d++ < 160000) {
      const x = (rng() * 2 - 1) * R6.treeMaxR;
      const z = (rng() * 2 - 1) * R6.treeMaxR;
      const r = Math.hypot(x, z);
      if (r < R6.treeMinR || r > R6.treeMaxR) continue;
      if (this.inMountain(x, z)) continue;
      if (this.inNewLandmark(x, z)) continue;   // update 30
      if (positions.some(([px, pz]) => Math.hypot(x - px, z - pz) < W.treeSpacing)) continue;
      positions.push([x, z, 0.85 + rng() * 0.55, rng() * Math.PI * 2]);
    }

    // update 36: the fourth expansion band — same recipe, one ring further out
    const R7 = CFG.ring7;
    let guard4e = 0;
    const r7Start = positions.length;
    while (positions.length - r7Start < R7.treeCount && guard4e++ < 200000) {
      const x = (rng() * 2 - 1) * R7.treeMaxR;
      const z = (rng() * 2 - 1) * R7.treeMaxR;
      const r = Math.hypot(x, z);
      if (r < R7.treeMinR || r > R7.treeMaxR) continue;
      if (this.inMountain(x, z)) continue;
      if (this.inNewLandmark(x, z)) continue;
      if (this.desert.inDesert(x, z) || this.desert.riverDist(x, z) < 20) continue;
      if (positions.some(([px, pz]) => Math.hypot(x - px, z - pz) < W.treeSpacing)) continue;
      positions.push([x, z, 0.85 + rng() * 0.55, rng() * Math.PI * 2]);
    }
    // update 36: the desert and the river hold no forest — every earlier band is filtered too
    for (let i = positions.length - 1; i >= 0; i--) {
      const [px, pz] = positions[i];
      if (this.desert.inDesert(px, pz) || this.desert.riverDist(px, pz) < 20) positions.splice(i, 1);
    }

    // update 16: THE WORLD IS A SQUARE — wild forest floods the three corners
    // beyond the old circle. The fourth corner belongs to the mountain.
    const SQ = W.square - 6;
    let guard5 = 0, cornerN = 0;
    while (cornerN < 3300 && guard5++ < 600000) {
      const x = (rng() * 2 - 1) * SQ;
      const z = (rng() * 2 - 1) * SQ;
      if (Math.hypot(x, z) < W.boundaryR - 2) continue;  // corners only
      if (this.inMountain(x, z)) continue;
      if (this.inNewLandmark(x, z)) continue;   // update 30: Dirk's farm sits in the south-east corner now
      if (this.desert.inDesert(x, z) || this.desert.riverDist(x, z) < 20) continue;   // update 36
      if (positions.some(([px, pz]) => Math.hypot(x - px, z - pz) < W.treeSpacing)) continue;
      positions.push([x, z, 0.85 + rng() * 0.55, rng() * Math.PI * 2]);
      cornerN++;
    }

    // every facility now sits WRAPPED in forest — deliberate tree screens
    // with a gap left open toward each one's natural approach
    const screen = (cx, cz, radius, count, gapA, gapHalf) => {
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        let da = a - gapA;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        if (Math.abs(da) < gapHalf) continue;
        const rr = radius + rng() * 3;
        const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
        // update 30: the square is the frontier now (the farm's screen lies past the old circle)
        if (Math.abs(x) > CFG.world.square - 4 || Math.abs(z) > CFG.world.square - 4) continue;
        if (this.distToPath(x, z) < W.pathClearance) continue;
        positions.push([x, z, 0.9 + rng() * 0.4, rng() * Math.PI * 2]);
      }
    };
    const LH = CFG.lighthouse, NE2 = CFG.nest, CT = CFG.container, CP2 = CFG.camp, RV2 = CFG.ruins;
    screen(LH.x, LH.z, 16, 14, Math.PI / 2, 0.7);        // lighthouse — path from the south kept open
    // update 29: a loose ring of wood around the farm, open toward the temple side
    screen(CFG.farm.x, CFG.farm.z, 41, 26, Math.atan2(-CFG.farm.z, -CFG.farm.x), 0.6);
    screen(NE2.x, NE2.z, 13, 12, Math.PI, 0.6);          // nest — western approach open
    screen(CT.x, CT.z, 12, 12, 0, 0.6);                  // container — door side open
    screen(CP2.x, CP2.z, 21, 16, CP2.gateA, 0.55);       // camp — the gate stays clear
    screen(RV2.x, RV2.z, 40, 22, -Math.PI / 2, 0.8);     // ruins — northern gap for the guardian's circle

    // deliberate screen of trees AROUND the hut — it must be found, not seen.
    // Gaps stay open: the ramp approach (south), the pen side, the pen gate.
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const deg = a * 180 / Math.PI;
      if (deg > 55 && deg < 125) continue;    // ENTRANCE gap — nothing in front of the door
      if (deg > 245 && deg < 295) continue;   // pen side
      if (deg > 340 || deg < 25) continue;    // pen gate side
      const rr = 10 + rng() * 3.5;
      const x = hx + Math.cos(a) * rr, z = hz + Math.sin(a) * rr * 1.25;
      if (this.inPen(x, z)) continue;
      if (Math.abs(x - hx) < 3.0 && z > hz + 2 && z < hz + 13) continue; // never block the ramp
      positions.push([x, z, 0.95 + rng() * 0.35, rng() * Math.PI * 2]);
    }

    const treeAsset = this.assets.glb.tree;
    const dummy = new THREE.Object3D();
    if (treeAsset) {
      const meshes = [];
      treeAsset.model.traverse((o) => { if (o.isMesh) meshes.push(o); });
      // one whole-world InstancedMesh can never be culled — bucket the forest
      // into 64m grid cells so cells off-screen or past the fog wall cost nothing
      const CELL = 64, HALF = CFG.world.square + 6;
      const cells = new Map();
      // the CLIMBABLE trees (update 27) — actual forest trunks, never the
      // rocks and posts that also live in the collision grid
      this.treePoints = positions.map(([x, z]) => [x, z]);
      for (const p of positions) {
        const k = Math.floor((p[0] + HALF) / CELL) * 1000 + Math.floor((p[1] + HALF) / CELL);
        let arr = cells.get(k);
        if (!arr) cells.set(k, arr = []);
        arr.push(p);
      }
      for (const src of meshes.slice(0, 3)) {
        src.updateWorldMatrix(true, false);
        for (const arr of cells.values()) {
          const inst = new THREE.InstancedMesh(src.geometry, src.material, arr.length);
          for (let i = 0; i < arr.length; i++) {
            const [x, z, s, rot] = arr[i];
            dummy.position.set(x, 0, z);
            dummy.rotation.set(0, rot, 0);
            dummy.scale.setScalar(s);
            dummy.updateMatrix();
            dummy.matrix.multiply(src.matrixWorld);
            inst.setMatrixAt(i, dummy.matrix);
          }
          inst.instanceMatrix.needsUpdate = true;
          inst.computeBoundingSphere(); // instance-aware sphere — frustum culling works per cell
          this.scene.add(inst);
          (this.treeChunks ||= []).push(inst);
        }
      }
    } else {
      const trunkG = new THREE.CylinderGeometry(0.35, 0.55, 6, 6); trunkG.translate(0, 3, 0);
      const canG = new THREE.ConeGeometry(3.2, 8, 7); canG.translate(0, 9.5, 0);
      const trunkI = new THREE.InstancedMesh(trunkG, new THREE.MeshStandardMaterial({ color: 0x4a3b28, roughness: 1 }), positions.length);
      const canI = new THREE.InstancedMesh(canG, new THREE.MeshStandardMaterial({ color: 0x39432f, roughness: 1 }), positions.length);
      for (let i = 0; i < positions.length; i++) {
        const [x, z, s, rot] = positions[i];
        dummy.position.set(x, 0, z); dummy.rotation.set(0, rot, 0); dummy.scale.setScalar(s);
        dummy.updateMatrix();
        trunkI.setMatrixAt(i, dummy.matrix); canI.setMatrixAt(i, dummy.matrix);
      }
      trunkI.instanceMatrix.needsUpdate = canI.instanceMatrix.needsUpdate = true;
      this.scene.add(trunkI, canI);
    }
    for (const [x, z, s] of positions) {
      this.addTree(x, z, 0.55 * s);
      // thick trunks break the T-Rex's line of sight — hide behind them
      if (s > 1.18) this.occluders.push({ x, z, r: 0.8 * s });
    }

    const am = this.assets.glb.appletree;
    for (const [ax, az] of [...CFG.world.appleTrees, ...CFG.appleTrees2]) {
      if (am) {
        const t = am.model.clone();
        t.position.set(ax, 0, az);
        this.scene.add(t);
      } else {
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 2.6, 6),
          new THREE.MeshStandardMaterial({ color: 0x4a3b28 }));
        trunk.position.set(ax, 1.3, az);
        const crown = new THREE.Mesh(new THREE.SphereGeometry(2.4, 8, 6),
          new THREE.MeshStandardMaterial({ color: 0x44503a }));
        crown.position.set(ax, 3.6, az);
        this.scene.add(trunk, crown);
      }
      this.addTree(ax, az, 0.5);
    }
  }

  // instanced 3D grass tufts — the ground is not flat-bare anymore
  buildGrass() {
    const rng = this.rng;
    const R = CFG.ruin;
    const tuftTex = new THREE.CanvasTexture(makeGrassCanvas());
    tuftTex.colorSpace = THREE.SRGBColorSpace;
    const tuftMat = new THREE.MeshStandardMaterial({
      map: tuftTex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1,
    });
    const single = new THREE.PlaneGeometry(0.62, 0.42);
    single.translate(0, 0.21, 0);
    const cross = mergeGeometries([single, single.clone().rotateY(Math.PI / 2)]);
    const grassTotal = CFG.world.grassCount + CFG.newArea.grassCount + CFG.ring2.grassCount + CFG.ring3.grassCount + CFG.ring4.grassCount + CFG.ring5.grassCount + CFG.ring6.grassCount + CFG.ring7.grassCount;
    const GR = CFG.ring7.treeMaxR - 2;   // the grass disc hugs the outermost band (update 36: ring7)
    const inst = new THREE.InstancedMesh(cross, tuftMat, grassTotal);
    inst.frustumCulled = false;
    const dummy = new THREE.Object3D();
    let placed = 0, guard = 0;
    const [hx, hz] = CFG.world.hutPos;
    while (placed < grassTotal && guard++ < 200000) {
      const x = (rng() * 2 - 1) * GR;
      const z = (rng() * 2 - 1) * GR;
      const r = Math.hypot(x, z);
      if (r > GR) continue;
      if (this.inNewLandmark(x, z, 2)) continue;
      if (this.desert.inDesert(x, z) || this.desert.riverDist(x, z) < 18) continue;   // update 36: no grass on sand or in the river
      if (this.distToPath(x, z) < 2.8) continue;
      if (x > -R.halfX - 0.8 && x < R.halfX + 0.8 && z > -R.halfZ - 0.8 && z < R.halfZ + 0.8) continue;
      if (Math.hypot(x - hx, z - hz) < 4) continue;
      if (r > 56 && rng() < 0.4) continue; // sparser under the canopy
      dummy.position.set(x, 0, z);
      dummy.rotation.set(0, rng() * Math.PI, 0);
      const s = 0.7 + rng() * 0.8;
      dummy.scale.set(s, s * (0.8 + rng() * 0.55), s);
      dummy.updateMatrix();
      inst.setMatrixAt(placed++, dummy.matrix);
    }
    inst.count = placed;
    inst.instanceMatrix.needsUpdate = true;
    this.scene.add(inst);
    // the quality presets thin the grass by capping the instance count
    this.grassInst = inst;
    this.grassTotal = placed;
  }

  // foliage density lever (quality presets): purely visual — grass only,
  // never trees (colliders/cover) or twigs (the alarm mechanic)
  setFoliage(frac) {
    if (!this.grassInst) return;
    this.grassInst.count = Math.max(1, Math.round(this.grassTotal * Math.min(1, frac)));
  }

  // dry branches that CRACK when stepped on — the forest's alarm system
  buildTwigs() {
    const rng = this.rng;
    const geo = new THREE.CylinderGeometry(0.025, 0.04, 0.85, 5);
    geo.rotateZ(Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ color: 0x4e4030, roughness: 1 });
    const twigTotal = CFG.world.twigCount + CFG.newArea.twigCount + CFG.ring2.twigCount + CFG.ring3.twigCount;
    const inst = new THREE.InstancedMesh(geo, mat, twigTotal);
    const dummy = new THREE.Object3D();
    let placed = 0, guard = 0;
    while (placed < twigTotal && guard++ < 60000) {
      const x = (rng() * 2 - 1) * 392;
      const z = (rng() * 2 - 1) * 392;
      const r = Math.hypot(x, z);
      if (r < 40 || r > 392) continue;
      if (this.inNewLandmark(x, z, 2)) continue;              // forest + field edge only
      const dp = this.distToPath(x, z);
      if (dp > 12 && rng() < 0.55) continue;        // bias twigs toward the path
      dummy.position.set(x, 0.05, z);
      dummy.rotation.set(0, rng() * Math.PI, (rng() - 0.5) * 0.2);
      dummy.updateMatrix();
      inst.setMatrixAt(placed++, dummy.matrix);
      this.twigs.push({ x, z, rearm: 0 });
    }
    void 0;
    inst.count = placed;
    inst.instanceMatrix.needsUpdate = true;
    this.scene.add(inst);
  }

  buildChests() {
    const asset = this.assets.glb.chest;
    const L = CFG.lighthouse;
    const all = [
      ...CFG.world.chests,
      ...CFG.newArea.chests.map(([x, z]) => [x, z, false, 0]),
      ...CFG.ring2.chests.map(([x, z]) => [x, z, false, 0]),
      ...CFG.extraChests.map(([x, z]) => [x, z, false, 0]),
      [L.x + 2.2, L.z - 1.5, false, L.top + 0.14],   // the lighthouse chest
      ...(this.desert.chestSpots || []),             // update 36: rarer, on the dunes
    ];
    for (const [x, z, knife, y = 0] of all) {
      let mesh;
      if (asset) mesh = asset.model.clone();
      else {
        mesh = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.5),
          new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 1 }));
        body.position.y = 0.25;
        mesh.add(body);
      }
      mesh.position.set(x, y, z);
      mesh.rotation.y = this.rng() * Math.PI * 2;
      this.scene.add(mesh);
      this.addBox(x - 0.45, x + 0.45, y, y + 0.6, z - 0.35, z + 0.35);
      this.chests.push({ x, z, y, opened: false, knife, mesh, snake: this.rng() < CFG.snakeChance && !knife });
    }
  }

  buildApples() {
    const appleMat = new THREE.MeshStandardMaterial({ color: 0x9c3526, roughness: 0.5 });
    const appleGeo = new THREE.SphereGeometry(0.13, 8, 6);
    for (const [ax, az] of [...CFG.world.appleTrees, ...CFG.appleTrees2]) {
      for (let i = 0; i < CFG.world.applesPerTree; i++) {
        const ang = this.rng() * Math.PI * 2;
        const d = 1.2 + this.rng() * 1.6;
        const x = ax + Math.cos(ang) * d, z = az + Math.sin(ang) * d;
        const m = new THREE.Mesh(appleGeo, appleMat);
        m.position.set(x, 0.13, z);
        this.scene.add(m);
        this.apples.push({ x, z, mesh: m, taken: false });
      }
    }
  }

  respawnApples() {
    for (const a of this.apples) { a.taken = false; a.mesh.visible = true; }
  }
  // each dawn: fresh random loot, and each chest re-rolls its snake
  refillChests(rng) {
    for (const c of this.chests) {
      c.opened = false;
      c.snake = (rng ? rng() : this.rng()) < CFG.snakeChance;
    }
  }

  buildLights() {
    this.lights.hemi = new THREE.HemisphereLight(0x9aa79b, 0x3f4a3a, 0.85);
    this.lights.sun = new THREE.DirectionalLight(0xc9c4b0, 0.75);
    this.lights.sun.position.set(40, 70, 20);
    this.scene.add(this.lights.hemi, this.lights.sun);
    this.buildFireflies();
  }

  // fireflies: glowing clusters that wake at night — pockets of light outside
  buildFireflies() {
    const rng = this.rng;
    const F = CFG.fireflies;
    const glow = new THREE.CanvasTexture(makeGlowCanvas());
    glow.colorSpace = THREE.SRGBColorSpace;
    this.fireflies = [];
    let placed = 0, guard = 0;
    while (placed < F.clusters && guard++ < 4000) {
      const x = (rng() * 2 - 1) * 135;
      const z = (rng() * 2 - 1) * 135;
      const r = Math.hypot(x, z);
      if (r < 25 || r > 135) continue;
      if (Math.hypot(x - CFG.world.hutPos[0], z - CFG.world.hutPos[1]) < 14) continue;
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(F.per * 3);
      for (let i = 0; i < F.per; i++) {
        pos[i * 3] = (rng() - 0.5) * 5;
        pos[i * 3 + 1] = 0.5 + rng() * 2.2;
        pos[i * 3 + 2] = (rng() - 0.5) * 5;
      }
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      const pts = new THREE.Points(geo, new THREE.PointsMaterial({
        color: 0xd8e88a, size: 0.16, map: glow, transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0,
      }));
      pts.position.set(x, 0, z);
      this.scene.add(pts);
      const entry = { pts, phase: rng() * 9, light: null };
      if (placed < F.litClusters) {
        const l = new THREE.PointLight(0xc8d87a, 0, 7, 2);
        l.position.set(x, 1.6, z);
        this.scene.add(l);
        entry.light = l;
      }
      this.fireflies.push(entry);
      placed++;
    }
  }

  // per-frame visual effects — campfire, embers, door swing, fireflies
  // rendering only: the linear fog is fully opaque at fog.far, so whatever sits
  // beyond that wall is invisible anyway — stop submitting it to the GPU.
  // Conservative: a cell hides only when its NEAREST edge is past the wall.
  cullFog(cam, maxDist) {
    for (const m of this.treeChunks || []) {
      const s = m.boundingSphere;
      m.visible = Math.hypot(cam.x - s.center.x, cam.z - s.center.z) - s.radius < maxDist;
    }
  }

  flicker(t, dt = 0.016) {
    if (this.fireLight) {
      this.fireLight.intensity = 12 + Math.sin(t * 11) * 2 + Math.sin(t * 23 + 1.7) * 1.5;
    }
    if (this.flames) {
      for (let i = 0; i < this.flames.length; i++) {
        const f = this.flames[i];
        f.scale.y = 1 + Math.sin(t * 13 + i * 2.1) * 0.13;
        f.scale.x = 1 + Math.sin(t * 9 + i) * 0.08;
      }
    }
    if (this.coals) this.coals.material.emissiveIntensity = 0.5 + Math.sin(t * 7) * 0.2;
    if (this.embers) {
      const p = this.embers.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        let y = p.getY(i) + dt * (0.45 + (i % 4) * 0.12);
        if (y > 1.7) y = 0.15;
        p.setY(i, y);
        p.setX(i, p.getX(i) + Math.sin(t * 2 + i) * dt * 0.05);
      }
      p.needsUpdate = true;
    }
    if (this.hutDoor) {
      const d = this.hutDoor;
      const target = d.open ? -1.9 : 0;
      d.grp.rotation.y += (target - d.grp.rotation.y) * Math.min(1, dt * 7);
    }
    // update 29: the farmhouse doors, the pasture gate, the lanterns and the fountain
    for (const d of this.farmDoors || []) {
      const target = d.open ? -1.9 : 0;
      d.grp.rotation.y += (target - d.grp.rotation.y) * Math.min(1, dt * 7);
    }
    if (this.farmGate) {
      const g = this.farmGate;
      const target = g.open ? -1.55 : 0;
      g.grp.rotation.y += (target - g.grp.rotation.y) * Math.min(1, dt * 5);
    }
    if (this.farmLights) {
      const k = this.nightK || 0;
      this.farmLights.porch.intensity = 1.5 + k * 9;
      if (this.farmLights.garden) this.farmLights.garden.intensity = k * 8;
      for (const b of this.farmLanternBulbs || []) b.material.emissiveIntensity = 0.15 + k * 2.2;
    }
    if (this.farmWater && this.farmWater.tex) {
      this.farmWater.tex.offset.x = Math.sin(t * 0.9) * 0.02;
      this.farmWater.tex.offset.y = (t * 0.05) % 1;
    }
    // update 31: the fountain's spout breathes and the water falling from the upper
    // bowl into the basin runs downward
    if (this.farmJet) {
      const J = this.farmJet;
      // update 32: the scroll ran negative, which reads as water climbing the
      // curtain. Offsetting v UPWARD samples higher in the texture, so the
      // pattern travels DOWN the sheet — which is what falling water does.
      if (J.tex) J.tex.offset.y = (t * 1.5) % 1;
      if (J.jet) {
        J.jet.scale.y = 1 + Math.sin(t * 7.3) * 0.07 + Math.sin(t * 11.1 + 1) * 0.04;
        J.jet.scale.x = J.jet.scale.z = 1 + Math.sin(t * 9.2 + 2) * 0.1;
      }
      if (J.curtain) J.curtain.material.opacity = 0.36 + Math.sin(t * 3.3) * 0.05;
    }
    if (this.tempFires) {
      for (let i = this.tempFires.length - 1; i >= 0; i--) {
        const f = this.tempFires[i];
        f.ttl -= dt;
        for (let j = 0; j < f.flames.length; j++) {
          f.flames[j].scale.y = 1 + Math.sin(t * 13 + j * 2) * 0.15;
        }
        if (f.light) f.light.intensity = CFG.tempFire.light * Math.min(1, f.ttl / 5) * (1 + Math.sin(t * 11 + i) * 0.15);
        if (f.ttl <= 0) {
          this.scene.remove(f.g);
          if (f.light) {   // the flame goes back into the pool, parked underground
            f.g.remove(f.light);
            f.light.intensity = 0;
            f.light.position.set(0, -60, 0);
            this.scene.add(f.light);
            this.fireLightPool.push(f.light);
          }
          this.tempFires.splice(i, 1);
        }
      }
    }
    if (this.beacon && this.beacon.lit && this.beaconLight) {
      this.beaconLight.intensity = 46 + Math.sin(t * 2.2) * 8;
    }
    if (this.waterTex) {
      this.waterTex.offset.x = Math.sin(t * 0.08) * 0.06;
      this.waterTex.offset.y = t * 0.006 % 1;
    }
    if (this.jabbDoor) {
      const d = this.jabbDoor;
      const target = d.open ? -1.85 : 0;
      d.grp.rotation.y += (target - d.grp.rotation.y) * Math.min(1, t ? 0.12 : 0.12);
    }
    if (this.lhDoor) {
      const d = this.lhDoor;
      const target = d.open ? -1.9 : 0;
      d.grp.rotation.y += (target - d.grp.rotation.y) * Math.min(1, dt * 7);
    }
    if (this.containerDoor) {
      const d = this.containerDoor;
      const target = d.open ? 1.9 : 0;
      d.grp.rotation.y += (target - d.grp.rotation.y) * Math.min(1, dt * 7);
    }
    if (this.lhHatch) {
      const d = this.lhHatch;
      const target = d.open ? -1.72 : 0;
      d.grp.rotation.x += (target - d.grp.rotation.x) * Math.min(1, dt * 6);
    }
    if (this.containerFire) {
      for (let j = 0; j < this.containerFire.flames.length; j++) {
        this.containerFire.flames[j].scale.y = 1 + Math.sin(t * 12 + j * 2) * 0.14;
      }
      this.containerFire.light.intensity = 8 + Math.sin(t * 10) * 1.6;
    }
    if (this.campFire) {
      for (let j = 0; j < this.campFire.flames.length; j++) {
        this.campFire.flames[j].scale.y = 1 + Math.sin(t * 11 + j * 2.2) * 0.16;
        this.campFire.flames[j].scale.x = 1 + Math.sin(t * 8 + j) * 0.09;
      }
      this.campFire.light.intensity = 22 + Math.sin(t * 9) * 3.5;
    }
    if (this.fireflies) {
      const k = this.nightK || 0;
      for (const f of this.fireflies) {
        f.pts.material.opacity = k;
        f.pts.visible = k > 0.05;
        if (f.light) f.light.intensity = k * (2.2 + Math.sin(t * 3 + f.phase) * 0.8);
        if (k > 0.05) {
          f.phase += 0;
          f.pts.rotation.y = Math.sin(t * 0.25 + f.phase) * 0.6;
          f.pts.position.y = Math.sin(t * 0.7 + f.phase) * 0.25;
        }
      }
    }
  }

  // k: 0 = full day, 1 = full night
  updateEnv(k) {
    this.nightK = k;
    const d = CFG.env.day, n = CFG.env.night;
    const lerpC = (a, b) => new THREE.Color(a).lerp(new THREE.Color(b), k);
    const lerp = (a, b) => a + (b - a) * k;
    this.scene.background = lerpC(d.sky, n.sky);
    if (!this.scene.fog) this.scene.fog = new THREE.Fog(0x8d988c, d.fogNear, d.fogFar);
    this.scene.fog.color = lerpC(d.fog, n.fog);
    // fogMult: the quality preset's draw-distance lever (1 = the classic look).
    // cullFog and the day far-plane clamp both read fog.far, so they follow.
    const fm = this.fogMult || 1;
    this.scene.fog.near = lerp(d.fogNear, n.fogNear) * fm;
    this.scene.fog.far = lerp(d.fogFar, n.fogFar) * fm;
    this.lights.hemi.color = lerpC(d.hemiSky, n.hemiSky);
    this.lights.hemi.groundColor = lerpC(d.hemiGnd, n.hemiGnd);
    this.lights.hemi.intensity = lerp(d.hemi, n.hemi);
    this.lights.sun.color = lerpC(d.sun, n.sun);
    this.lights.sun.intensity = lerp(d.sunI, n.sunI);
  }

  // `skipSoft`: creatures resolve their own movement through this routine too,
  // and the live bodies in softBodies ARE the creatures — a cow was colliding
  // with itself every frame and being thrown 1.2 m sideways (update 32's
  // "crazy fast, circling" herd). Live bodies stop the PLAYER only.
  collide(x, z, r, y = 0, h = 1.7, skipSoft = false) {
    for (const b of this.boxes) {
      if (y + h < b.minY || y > b.maxY) continue;
      if (b.maxY <= y + 0.55) continue; // low enough to step onto (floor edges)
      const cx = Math.max(b.minX, Math.min(x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
      const dx = x - cx, dz = z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 > 1e-9) {
          const dd = Math.sqrt(d2);
          x = cx + (dx / dd) * r; z = cz + (dz / dd) * r;
        } else {
          const pushL = Math.abs(x - b.minX), pushR = Math.abs(b.maxX - x);
          const pushN = Math.abs(z - b.minZ), pushS = Math.abs(b.maxZ - z);
          const m = Math.min(pushL, pushR, pushN, pushS);
          if (m === pushL) x = b.minX - r; else if (m === pushR) x = b.maxX + r;
          else if (m === pushN) z = b.minZ - r; else z = b.maxZ + r;
        }
      }
    }
    // update 32: live bodies. A cow is not a hologram — it turns you aside, and
    // the owner of the body nudges it back in return, so leaning into one
    // shoulders it out of the way instead of passing through it.
    for (const b of skipSoft ? [] : this.softBodies) {
      if (y + h < b.minY || y > b.maxY) continue;
      const dx = x - b.x, dz = z - b.z;
      const rr = r + b.r;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr) {
        if (d2 > 1e-9) {
          const dd = Math.sqrt(d2);
          x = b.x + (dx / dd) * rr; z = b.z + (dz / dd) * rr;
        } else {
          x = b.x + rr;
        }
      }
    }
    for (const t of this.treesNear(x, z)) {
      const dx = x - t.x, dz = z - t.z;
      const rr = r + t.r;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-9) {
        const dd = Math.sqrt(d2);
        x = t.x + (dx / dd) * rr; z = t.z + (dz / dd) * rr;
      }
    }
    // the lake: two-three steps into the water, then the deep turns you back
    for (const c of this.lakeCircles()) {
      let dx = x - c.x, dz = z - c.z;
      let dd2 = Math.hypot(dx, dz);
      if (dd2 < 1e-6) { dx = 1; dz = 0; dd2 = 1; } // dead center: pick a way out
      const minD = c.r - CFG.lake.wade;
      if (dd2 < minD) {
        x = c.x + (dx / dd2) * minD;
        z = c.z + (dz / dd2) * minD;
      }
    }
    // lighthouse shell: a ring with a door gap (south), passable when open
    const LH = CFG.lighthouse;
    {
      const dx = x - LH.x, dz = z - LH.z;
      const dd2 = Math.hypot(dx, dz);
      const inner = LH.r - 0.8, outer = LH.r + 0.25;
      if (y < LH.top + 2.5 && dd2 > inner - r && dd2 < outer + r && dd2 > 1e-6) {
        const inDoorArc = Math.abs(Math.atan2(dx, dz)) < 0.16 && y < 2.3;
        if (!inDoorArc) {
          const mid = (inner + outer) / 2;
          const target = dd2 < mid ? inner - r : outer + r;
          x = LH.x + (dx / dd2) * target;
          z = LH.z + (dz / dd2) * target;
        }
      }
    }
    // update 36: the river — nothing wades it; a bridge's rails keep you on the deck
    {
      const rc = this.desert.collide(x, z, r, y);
      x = rc.x; z = rc.z;
    }
    // the world is a SQUARE now — clamp to its edges
    const sq = CFG.world.square - 1;
    if (x > sq) x = sq; else if (x < -sq) x = -sq;
    if (z > sq) z = sq; else if (z < -sq) z = -sq;
    return V.x = x, V.z = z, V;
  }
}

// canvas helpers (procedural art still follows the FORMULA palette)
function makeGrassCanvas() {
  const c = document.createElement("canvas");
  c.width = 128; c.height = 96;
  const ctx = c.getContext("2d");
  const shades = ["#4e5c42", "#5a6b4a", "#647349", "#57634a", "#6d7a52"];
  for (let i = 0; i < 15; i++) {
    const x0 = 8 + Math.random() * 112;
    const lean = (Math.random() - 0.5) * 26;
    const h = 40 + Math.random() * 52;
    ctx.strokeStyle = shades[(Math.random() * shades.length) | 0];
    ctx.lineWidth = 2.5 + Math.random() * 2.5;
    ctx.beginPath();
    ctx.moveTo(x0, 96);
    ctx.quadraticCurveTo(x0 + lean * 0.4, 96 - h * 0.6, x0 + lean, 96 - h);
    ctx.stroke();
  }
  return c;
}

function makeGlowCanvas() {
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(16, 16, 1, 16, 16, 15);
  g.addColorStop(0, "rgba(255,255,230,1)");
  g.addColorStop(0.4, "rgba(216,232,138,0.6)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  return c;
}

function makeFlameCanvas() {
  const c = document.createElement("canvas");
  c.width = 64; c.height = 96;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(32, 72, 4, 32, 60, 46);
  g.addColorStop(0, "rgba(255,214,140,0.95)");
  g.addColorStop(0.35, "rgba(220,130,50,0.8)");
  g.addColorStop(0.7, "rgba(150,60,20,0.35)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(32, 62, 24, 34, 0, 0, Math.PI * 2);
  ctx.fill();
  return c;
}
