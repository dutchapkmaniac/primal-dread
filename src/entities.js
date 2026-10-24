import * as THREE from "three";
import { clone as skeletonClone } from "three/addons/utils/SkeletonUtils.js";
import { CFG } from "./config.js?v=84";
import { inFarm, inPasture } from "./farm.js?v=84";
import { STR } from "../strings.js?v=84";
import { icons } from "./items.js?v=84";
import { ClipAnimator, riggedCreature, driveCreature } from "./skeletal.js?v=84";

// Creatures. Rigged GLBs (T-Rex, werewolf, chicken) play real walk/run clips;
// the pig gets a procedural quadruped gait. The T-Rex cannot be killed.

function normalizeYaw(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// update 80: the beasts the safe rooms keep out (Elisia alone walks where she likes)
import { skullInside } from "./skull_shape.js?v=84";   // update 81
const HOSTILE = new Set(["werewolf", "trex", "mother", "spino", "spinobaby", "trike", "remotus", "altai", "croc", "meganeura", "alio", "pachy", "theri"]);
export class Creature {
  constructor(type, asset, x, z, ctx, opts = {}) {
    this.type = type;
    this.cfg = CFG[type] || CFG.trex;
    // update 35: Elisia carries her OWN cfg copy — her height changes when she turns
    if (type === "elisia") { this.cfg = { ...CFG.elisia }; this.form = "good"; }
    this.wild = !!opts.wild;   // wild chickens roam free (not pen-bound)
    this.outer = !!opts.outer; // update 28: frontier T-Rexes patrol the outer ring
    this.zone = opts.zone || null;   // update 38: "outside" — the extra hunters keep to the frontier beyond the old circle
    this.chain = opts.chained || null;   // update 39: {x, z, r} — the city's beast is held to its post
    // update 38: the Imperator — a T-Rex in every rule, with its own numbers
    this.imperator = !!opts.imperator;
    if (this.imperator) {
      const I = CFG.imperator;
      this.cfg = { ...CFG.trex, biteDmg: Math.round(CFG.trex.biteDmg * I.biteDmgMult), sightR: I.sightR,
        twigNoiseR: I.twigNoiseR, noiseMult: I.noiseMult, height: CFG.trex.height * I.sizeMult };
    }
    this.roarRate = this.imperator ? CFG.imperator.roarRate : 1;
    // update 81: the Majungasaurus - a T-Rex in every rule, on its own model, held to Skull Valley, with a horn
    this.majunga = !!opts.majunga;
    if (this.majunga) this.cfg = { ...CFG.trex, height: CFG.majunga.height };
    this.herd = opts.herd || null; this.herdIdx = opts.idx || 0; this.home = opts.home || null;   // update 81: the dome-heads
    this.den = opts.den || null;   // update 81: the Therizinosaurus keeps to its den
    this.recoverT = 0; this.angryT = 0; this.secondT = 0;
    this.ctx = ctx;
    this.spawn = { x, z };
    this.pos = new THREE.Vector3(x, 0, z);
    this.yaw = ctx.rng() * Math.PI * 2;
    this.hp = this.cfg.hp || Infinity;
    // update 11: the regular T-Rex can be HUNTED — by spear, and only by spear
    if (type === "trex") this.hp = CFG.trexHunt.hp;
    this.maxHp = this.hp;
    this.bleedT = 0; this.enraged = false;
    this.stuckSpears = [];   // thrown spears lodged in this beast
    this.state = "wander";
    this.stateT = 0;
    this.target = null;
    this.noiseTarget = null;   // where a sound came from (investigate)
    this.phase = ctx.rng() * 10;
    this.atkT = 0; this.loseT = 0; this.stepT = 0; this.roarT = 0;
    this.dead = false; this.respawnT = 0;
    this.hasTasted = false;   // bit the player once -> knows their smell
    this.hiddenT = 0; this.elevT = 0;
    this.speed = 0;            // actual m/s this tick, drives the gait

    this.group = new THREE.Group();
    this.anim = null; this.rigged = null;
    this.neckPitch = 0;
    if (asset && asset.anims && asset.anims.length) {
      this.body = skeletonClone(asset.model);
      this.anim = new ClipAnimator(this.body, asset.anims);
    } else if (asset) {
      // non-humanoids: procedural bone chain (legs, neck, tail) driven in code
      const rig = riggedCreature(asset.model, this.imperator ? "imperator" : type);   // update 39: the Imperator's own plan
      this.body = rig || asset.model.clone();
      this.rigged = rig;
    } else {
      this.body = this.fallbackBody(type);
    }
    if (type === "mother") this.group.scale.setScalar(3.25); // the matriarch TOWERS now
    if (type === "spinobaby") this.group.scale.setScalar(0.185); // hatchlings share the adult model
    this.group.add(this.body);
    ctx.scene.add(this.group);
    this.group.position.copy(this.pos);
    // spawn ON the terrain — a mountain goat born at y0 sits INSIDE the rock
    if (ctx.world) this.group.position.y = ctx.world.groundHeight(this.pos.x, this.pos.z, 999);
  }

  fallbackBody(type) {
    const colors = { trex: 0x5c6650, werewolf: 0x3a3d42, pig: 0x9c7466, chicken: 0xd8d4c8, goat: 0xd8d2c4, cow: 0xe8e2d8, dog: 0xa07a48, elisia: 0xf0ece4, remotus: 0x6c7a86, altai: 0xa8683a };
    const h = this.cfg.height;
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(h * 0.22, h * 0.55, 4, 8),
      new THREE.MeshStandardMaterial({ color: colors[type] || 0x777777, roughness: 1 }));
    body.rotation.x = Math.PI / 2;
    body.position.y = h * 0.55;
    g.add(body);
    return g;
  }

  distToPlayer() {
    const p = this.ctx.player;
    return Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
  }

  // update 80: the sight line against every occluder was the dearest thing a hunter did each frame; far from you it is
  // asked every fourth frame (staggered), within twelve metres every frame as before
  losCached(w, p) {
    if (this._losK === undefined) this._losK = Math.floor(Math.random() * 4);
    this._losK++;
    if (this._los === undefined || (this._losK & 3) === 0 || this.distToPlayer() < 12) this._los = w.losBlocked(this.pos.x, this.pos.z, p.pos.x, p.pos.z);
    return this._los;
  }
  moveToward(tx, tz, speed, dt, turnRate = 3.4) {
    const dx = tx - this.pos.x, dz = tz - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) { this.speed = 0; return true; }
    const targetYaw = Math.atan2(dx, dz);
    const dy = normalizeYaw(targetYaw - this.yaw);
    this.yaw += Math.max(-turnRate * dt, Math.min(turnRate * dt, dy));
    if (this.slowT > 0) { this.slowT -= dt; speed *= CFG.forest.trunks.slowMult; }   // update 69: a fallen trunk underfoot
    const step = Math.min(speed * dt, d);
    let nx = this.pos.x + Math.sin(this.yaw) * step;
    let nz = this.pos.z + Math.cos(this.yaw) * step;
    const c = this.collideXZ(nx, nz, this.type === "trex");
    // update 33b: `speed` drives the gait animation. It used to be the raw
    // displacement, so any collision nudge — a half-metre shove out of a block
    // in one frame — read as 30 m/s and the legs went into a blur while the
    // animal barely moved. That blur was the cows "moving very fast". The gait
    // can never run faster than the speed the animal was asked to walk at.
    this.speed = Math.min(speed, Math.hypot(c.x - this.pos.x, c.z - this.pos.z) / Math.max(dt, 1e-4));
    this.pos.x = c.x; this.pos.z = c.z;
    return d < 0.6;
  }

  collideXZ(x, z, ignoreTrees) {
    const w = this.ctx.world;
    const r = Math.max(0.4, this.cfg.height * 0.18);
    // update 79: no beast walks into the silver mine (its own wolves and the goats excepted), and no hunter climbs the
    // volcano unless it is chasing you up there - the Imperator never
    if (w.dungeon && !this.caveWolf && this.type !== "goat" && w.inDungeon(x, z) && !w.inDungeon(this.pos.x, this.pos.z)) return { x: this.pos.x, z: this.pos.z };
    // update 80: the start temple and the lighthouse are safe rooms - no hunter, wolf or beast sets foot in them
    if (HOSTILE.has(this.type) && !this.chain && ((w.inRuin(x, z) && !w.inRuin(this.pos.x, this.pos.z)) || (w.inLighthouse(x, z) && !w.inLighthouse(this.pos.x, this.pos.z)))) return { x: this.pos.x, z: this.pos.z };
    // update 81: Skull Valley - its own beasts never leave it, the forest's hunters never enter it, and nothing hostile
    // crosses Hendrik's tent line or fits the narrow bone tunnel to the eye
    if (CFG.skull) {
      const valleyBeast = this.majunga || this.type === "pachy" || this.type === "theri";
      if (valleyBeast && !skullInside(x, z) && skullInside(this.pos.x, this.pos.z)) return { x: this.pos.x, z: this.pos.z };
      if (this.type === "trex" && !this.majunga && !this.chain && skullInside(x, z) && !skullInside(this.pos.x, this.pos.z)) return { x: this.pos.x, z: this.pos.z };
      if (HOSTILE.has(this.type) && w.skullZone && (w.skullZone.inTent(x, z) || w.skullZone.inNarrow(x, z))) return { x: this.pos.x, z: this.pos.z };
    }
    if (this.type === "trex" && !this.chain && w.inMountain(x, z) && !w.inMountain(this.pos.x, this.pos.z) && (this.imperator || this.state !== "chase")) return { x: this.pos.x, z: this.pos.z };
    // update 42: the werewolves never set foot in Eternius — the mountain, the castle, the bridge
    if (this.type === "werewolf" && !this.caveWolf && w.city && w.city.inZone(x, z) && !w.city.inZone(this.pos.x, this.pos.z)) return { x: this.pos.x, z: this.pos.z };
    // update 44: the desert's hunters (and any wandering T-Rex) stop at the castle's sill — the bridge is as far as they come
    if ((this.type === "remotus" || this.type === "altai" || (this.type === "trex" && !this.chain)) && w.city && w.city.inCastle(x, z) && !w.city.inCastle(this.pos.x, this.pos.z)) return { x: this.pos.x, z: this.pos.z };
    // update 29: the raiding werewolf leaps every fence — only the world's edge holds it
    if (this.raid) {
      const sqr = CFG.world.square - 2;
      return { x: Math.max(-sqr, Math.min(sqr, x)), z: Math.max(-sqr, Math.min(sqr, z)) };
    }
    if (this.type === "croc") {
      // the water is the croc's home: it swims the whole lake AND crawls out
      // onto land after you — only walls and trees stop it
      for (const t of w.treesNear(x, z)) {
        const dx = x - t.x, dz = z - t.z;
        const rr = r + t.r;
        const d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-9) {
          const dd = Math.sqrt(d2);
          x = t.x + (dx / dd) * rr; z = t.z + (dz / dd) * rr;
        }
      }
      for (const b of w.boxes) {
        if (b.maxY < 0.3 || b.minY > this.cfg.height) continue;
        const cx = Math.max(b.minX, Math.min(x, b.maxX));
        const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
        const dx = x - cx, dz = z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < r * r && d2 > 1e-9) {
          const dd = Math.sqrt(d2);
          x = cx + (dx / dd) * r; z = cz + (dz / dd) * r;
        }
      }
      const sqC = CFG.world.square - 2;
      if (x > sqC) x = sqC; else if (x < -sqC) x = -sqC;
      if (z > sqC) z = sqC; else if (z < -sqC) z = -sqC;
      return { x, z };
    }
    if (!ignoreTrees) {
      const c = w.collide(x, z, r, 0, this.cfg.height, true);   // update 33b: never against the live bodies — one of them is us
      x = c.x; z = c.z;
    } else {
      for (const b of w.boxes) {
        if (b.maxY < 0.5 || b.minY > this.cfg.height) continue;
        const cx = Math.max(b.minX, Math.min(x, b.maxX));
        const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
        const dx = x - cx, dz = z - cz;
        const d2 = dx * dx + dz * dz;
        const rr = r + 1.7; // a T-Rex body never clips through walls
        if (d2 < rr * rr && d2 > 1e-9) {
          const dd = Math.sqrt(d2);
          x = cx + (dx / dd) * rr; z = cz + (dz / dd) * rr;
        }
      }
      // the camp fence: beasts keep their distance unless already hunting you
      if (this.state !== "chase" && this.state !== "window") {
        const CP = CFG.camp;
        const dxC = x - CP.x, dzC = z - CP.z;
        const dC = Math.hypot(dxC, dzC);
        if (dC < CP.r + 1.2 && dC > 1e-6) {
          x = CP.x + (dxC / dC) * (CP.r + 1.2);
          z = CP.z + (dzC / dC) * (CP.r + 1.2);
        }
      }
    }
    // update 36: the river turns everyone back at its bank, and the desert's
    // hunters never leave the sand while a T-Rex never sets foot on it
    {
      const des = w.desert;
      if (des) {
        const rc = des.collide(x, z, r, 0);
        x = rc.x; z = rc.z;
        if (this.type === "remotus" || this.type === "altai") {
          if (!des.inDesert(x, z) || des.bridgeAt(x, z)) { x = this.pos.x; z = this.pos.z; }
        } else if (this.type === "trex" && des.inDesert(x, z)) { x = this.pos.x; z = this.pos.z; }
      }
    }
    // Jabb's hut is SOLID to every NPC — wall boxes are filtered by a y-range
    // the mountain's altitude puts out of reach, so the rect itself is the law:
    // no creature's body ever overlaps the hut, walls, doorway or interior.
    const JH = w.jabbHutRect;
    if (JH) {
      const m = r + 0.15;
      if (x > JH.x0 - m && x < JH.x1 + m && z > JH.z0 - m && z < JH.z1 + m) {
        const dxl = x - (JH.x0 - m), dxr = (JH.x1 + m) - x;
        const dzl = z - (JH.z0 - m), dzr = (JH.z1 + m) - z;
        const min = Math.min(dxl, dxr, dzl, dzr);   // out along the nearest face
        if (min === dxl) x = JH.x0 - m;
        else if (min === dxr) x = JH.x1 + m;
        else if (min === dzl) z = JH.z0 - m;
        else z = JH.z1 + m;
      }
    }
    // update 29: the farm is a SAFE ZONE — no beast crosses its boundary. The
    // cows live inside (they are farm creatures), everyone else is pushed out
    // along the nearest face, hunting or not.
    if (this.type !== "cow" && this.type !== "dog") {
      const FA = CFG.farm;
      const m = r + 0.15;
      const x0 = FA.x - FA.hw - m, x1 = FA.x + FA.hw + m, z0 = FA.z - FA.hd - m, z1 = FA.z + FA.hd + m;
      if (x > x0 && x < x1 && z > z0 && z < z1) {
        const dxl = x - x0, dxr = x1 - x, dzl = z - z0, dzr = z1 - z;
        const min = Math.min(dxl, dxr, dzl, dzr);
        if (min === dxl) x = x0;
        else if (min === dxr) x = x1;
        else if (min === dzl) z = z0;
        else z = z1;
      }
    }
    // update 32: the shed's plank walls and its hay are SOLID to a cow. Without
    // this they filed to their night spot straight through the north wall,
    // because nothing in a creature's movement ever consulted the farm's boxes.
    // update 33: rewritten. Update 32 pushed a cow out of a block along its
    // NEAREST face — and the blocks that sealed the gaps beside the shed reach
    // the pasture fence, so the nearest face was often OUTSIDE the pasture. The
    // cow was thrown over the fence and snapped back by the pasture clamp every
    // frame: that was the fast, glitching herd. A face that leaves the pasture
    // is never a candidate now, and a cow that is inside the shed, or at its
    // door on the way in or out, ignores the shed block entirely (updateCow
    // decides that — see shedExempt).
    if (this.type === "cow" && w.cowBlockers) {
      const P = CFG.farm.pasture, m = r + 0.1;
      for (const b of w.cowBlockers) {
        if (b.shed && this.shedExempt) continue;
        if (!(x > b.x0 - m && x < b.x1 + m && z > b.z0 - m && z < b.z1 + m)) continue;
        let best = null, bd = Infinity;
        const face = (dist, ok, apply) => { if (ok && dist < bd) { bd = dist; best = apply; } };
        face(x - (b.x0 - m), b.x0 - m >= P.x0 + 0.7, () => { x = b.x0 - m; });
        face((b.x1 + m) - x, b.x1 + m <= P.x1 - 0.7, () => { x = b.x1 + m; });
        face(z - (b.z0 - m), b.z0 - m >= P.z0 + 0.7, () => { z = b.z0 - m; });
        face((b.z1 + m) - z, b.z1 + m <= P.z1 - 0.7, () => { z = b.z1 + m; });
        if (best) best();
      }
    }
    // NOBODY walks on water. Every land creature obeys the player's wade rule —
    // only the crocodile (which returned above) owns the deep. The pushout
    // iterates: where the lake's lobes OVERLAP, a single pass shoves you out
    // of one circle straight into the other (T-Rex "standing mid-lake" bug).
    for (let pass = 0; pass < 4; pass++) {
      let pushed = false;
      for (const c of w.lakeCircles()) {
        let dx = x - c.x, dz = z - c.z;
        let dd2 = Math.hypot(dx, dz);
        if (dd2 < 1e-6) { dx = 1; dz = 0; dd2 = 1; }
        const minD = c.r - CFG.lake.wade;
        if (dd2 < minD) {
          x = c.x + (dx / dd2) * minD;
          z = c.z + (dz / dd2) * minD;
          pushed = true;
        }
      }
      if (!pushed) break;
    }
    const sq = CFG.world.square - 2;
    if (x > sq) x = sq; else if (x < -sq) x = -sq;
    if (z > sq) z = sq; else if (z < -sq) z = -sq;
    return { x, z };
  }

  pickWanderTarget() {
    const rng = this.ctx.rng;
    if (this.chain) { const a = rng() * Math.PI * 2, d = (0.3 + rng() * 0.65) * this.chain.r; return [this.chain.x + Math.cos(a) * d, this.chain.z + Math.sin(a) * d]; }   // update 43: it uses the whole circle
    // update 29: cows graze their own pasture, nothing else aims INTO the farm
    if (this.type === "cow") {
      const P = CFG.farm.pasture, SH = CFG.farm.shed;
      const tx = P.x0 + 1.2 + rng() * (P.x1 - P.x0 - 2.4);
      const tz = P.z0 + 1.2 + rng() * (P.z1 - P.z0 - 2.4);
      // update 32: the shed stands a metre off the pasture's north and west
      // fences, and a cow is wider than that gap — one that grazes its way in
      // there ends up wedged between the fence and the plank wall with nowhere
      // to stand. Nothing to graze back there anyway: keep the herd east and
      // south of the shed, which is also the side its door is on.
      if (tx < SH.x1 + 1.2 && tz < SH.z1 + 1.2) {
        return [SH.x1 + 1.2 + rng() * Math.max(1, P.x1 - SH.x1 - 2.4), tz < SH.z1 ? SH.z1 + 1.2 + rng() * 3 : tz];
      }
      return [tx, tz];
    }
    if (this.type === "chicken" && !this.wild) {
      const [hx, hz] = CFG.world.hutPos;
      const P = CFG.pen;
      return [hx + P.x0 + 0.5 + rng() * (P.x1 - P.x0 - 1), hz + P.z0 + 0.5 + rng() * (P.z1 - P.z0 - 1)];
    }
    if (this.type === "remotus" || this.type === "altai") {
      // update 36: a leg of 15-40 m that stays on its own part of the sand
      const des = this.ctx.world.desert, C = this.cfg;
      for (let i = 0; i < 12; i++) {
        const a = rng() * Math.PI * 2, dd = 15 + rng() * 25;
        const x = this.pos.x + Math.cos(a) * dd, z = this.pos.z + Math.sin(a) * dd;
        if (!des.inDesert(x, z)) continue;
        const rd = des.riverDist(x, z);
        if (this.type === "remotus" ? (rd < 22 || rd > C.riverBand + 20) : rd < C.riverMin - 20) continue;
        if (Math.hypot(x - des.tent.x, z - des.tent.z) < 24) continue;
        return [x, z];
      }
      return [this.pos.x, this.pos.z];
    }
    // update 81: Skull Valley's beasts pick their targets on the valley floor (the dome-heads near their herd's home,
    // the Therizinosaurus inside its den)
    if (this.majunga && this.ctx.world.skullZone) return this.ctx.world.skullZone.randomFloor(rng);
    if (this.type === "pachy" && this.home) { for (let i = 0; i < 10; i++) { const a = rng() * Math.PI * 2, dd = rng() * CFG.pachy.homeR; const x = this.home[0] + Math.cos(a) * dd, z = this.home[1] + Math.sin(a) * dd; if (skullInside(x, z)) return [x, z]; } return [this.home[0], this.home[1]]; }
    if (this.type === "theri" && this.den) { const a = rng() * Math.PI * 2, dd = 2 + rng() * (CFG.skull.denR - 5); return [this.den.x + Math.cos(a) * dd, this.den.z + Math.sin(a) * dd]; }
    if (this.type === "trex") {
      // update 38: the ten extra hunters roam anywhere OUTSIDE the old circle
      if (this.zone === "outside") return this.ctx.world.randomOutsideForest(rng, CFG.trex.extraMinR);
      // update 28: frontier hunters patrol the SQUARE outer band — polar
      // targets never reach the expanded ring's corners
      if (this.outer && this.cfg.outerBand) {
        const [b0, b1] = this.cfg.outerBand;
        let x = 0, z = 0, g = 0;
        do {
          const c = (b0 + rng() * (b1 - b0)) * (rng() < 0.5 ? 1 : -1); // ring depth, either side
          const a = (rng() * 2 - 1) * b1;                              // along the edge
          if (rng() < 0.5) { x = c; z = a; } else { x = a; z = c; }
        } while (this.ctx.world.inMountain(x, z) && ++g < 20);
        return [x, z];
      }
      const [rmin, rmax] = this.cfg.wanderR;
      for (let i = 0; i < 12; i++) {
        const a = rng() * Math.PI * 2;
        const r = rmin + rng() * (rmax - rmin);
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        if (this.ctx.world.desert && this.ctx.world.desert.inDesert(x, z)) continue;   // update 36: not the sand
        if (this.ctx.world.inMountain(x, z)) continue;   // update 74: hunters never AIM for the volcano - only a chase takes them up
        return [x, z];
      }
      return [this.pos.x, this.pos.z];
    }
    const a = rng() * Math.PI * 2;
    const d = 6 + rng() * 14;
    let x = this.pos.x + Math.cos(a) * d, z = this.pos.z + Math.sin(a) * d;
    // goats live ONLY above the anchor-gated cliff — the herd is the reward
    // for the climb, never a sight from the lower slope. Any target that
    // leaves the high shelf (or dips into the dungeon) snaps back home.
    if (this.type === "goat") {
      const M = CFG.mountain;
      const dc = Math.hypot(x - M.cx, z - M.cz);
      if (!this.ctx.world.inMountain(x, z) || dc > 164 ||
          (this.ctx.world.inDungeon && this.ctx.world.inDungeon(x, z))) {
        x = this.spawn.x + (rng() - 0.5) * 10;
        z = this.spawn.z + (rng() - 0.5) * 10;
      }
    }
    // Trikes hold their OWN patch of the slope: they graze near where they
    // live, so you meet them one at a time (a chase can still drag one out).
    if (this.type === "trike" &&
        (!this.ctx.world.inMountain(x, z) || Math.hypot(x - this.spawn.x, z - this.spawn.z) > 26)) {
      x = this.spawn.x + (rng() - 0.5) * 22;
      z = this.spawn.z + (rng() - 0.5) * 22;
    }
    // no land creature ever AIMS for open water — targets stop at the beach
    // (iterated: a push out of one lobe must not land the target in another)
    if (this.type !== "croc") {
      for (let pass = 0; pass < 4; pass++) {
        let pushed = false;
        for (const c of this.ctx.world.lakeCircles()) {
          const dx = x - c.x, dz = z - c.z;
          const dd = Math.hypot(dx, dz) || 1;
          if (dd < c.r + 2) { x = c.x + (dx / dd) * (c.r + 2); z = c.z + (dz / dd) * (c.r + 2); pushed = true; }
        }
        if (!pushed) break;
      }
    }
    const sq = CFG.world.square - 8;
    if (x > sq) x = sq; else if (x < -sq) x = -sq;
    if (z > sq) z = sq; else if (z < -sq) z = -sq;
    if (!this.raid && inFarm(x, z)) { x = this.spawn.x; z = this.spawn.z; }   // update 29: never wander at the farm
    return [x, z];
  }

  // a discrete sound reached this creature (twig crack, loud steps)
  hearNoise(x, z, game) {
    if ((this.type !== "trex" && this.type !== "pachy") || this.dead) return;   // update 81: the dome-heads come to look too
    if (this.state === "chase" || this.state === "window" || this.state === "foe") return;
    this.noiseTarget = [x, z];
    if (this.state !== "investigate") {
      this.state = "investigate";
      this.stateT = 0;
      this.investigated = false;
      if (this.distToPlayer() < 45) game.ui.toast(STR.trexHeard);
    }
  }

  hit(dmg, game, weapon) {
    if (this.small && game.forest && game.forest.hitSmall(this, dmg, game, weapon)) return;   // update 69: the insects and bats take blows by the table
    if (this.type === "trike") {
      game.audio.sHit();
      game.ui.toast(STR.trikeImmune);
      return;
    }
    if (this.type === "trex" || this.type === "mother" || this.type === "spino") {
      game.audio.sHit();
      game.ui.toast(STR.knifeUseless); // no blade swung by hand gets through
      return;
    }
    if (this.type === "remotus" || this.type === "altai") {   // update 36
      game.audio.sHit();
      game.ui.toast(STR.alioImmune);
      game.loudAct();
      if (this.state !== "eat") { this.state = "chase"; this.lostT = 0; }
      return;
    }
    if (this.dead) return;
    // update 81: the dome-head's skull turns every blow from the front; from the side or behind only Eternial steel or the holy dagger bites
    if (this.type === "pachy") {
      const p = game.player, dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z, dd = Math.hypot(dx, dz) || 1;
      const front = (Math.sin(this.yaw) * dx + Math.cos(this.yaw) * dz) / dd;
      if (front > 0.35) { game.audio.sHit(); game.ui.toast(STR.skull.pachyBlock); return; }
      if (!CFG.pachy.weapons.includes(weapon)) { game.audio.sHit(); game.ui.toast(STR.skull.pachyImmune); return; }
    }
    // update 81: a blow wakes the Therizinosaurus
    if (this.type === "theri" && this.state !== "chase") { this.state = "chase"; this.angryT = 30; this.target = null; game.audio.sGrowl(); }
    // update 35: Elisia. Her light cannot be struck; her dark form only bleeds for a
    // T-Rex's tooth — the dagger in your hand, or a live T-Rex's bite (takeBite)
    if (this.type === "elisia") {
      if (this.form !== "evil") { game.audio.sHit(); game.ui.toast(STR.elisiaUnharmed); return; }
      if (weapon !== "trex_dagger" && weapon !== "imp_dagger") { game.audio.sHit(); game.ui.toast(STR.elisiaImmune); return; }
      dmg = weapon === "imp_dagger" ? CFG.elisia.daggerDmgImp : CFG.elisia.daggerDmg;   // update 38
    }
    // the croc dies by the count: ten punches, five knife cuts, three machete blows
    if (this.type === "croc") {
      const table = CFG.croc.hitDmg;
      dmg = table[weapon || "fists"] || table.fists;
      this.hidden = false;
      this.group.visible = true;
    }
    // only SILVER wounds a werewolf — the dagger, or a silver arrow (u27)
    if (this.type === "werewolf" && weapon === "evil_dagger") { game.ui.toast(STR.volcano.evilStops); game.audio.sDeny(); return; }   // update 74: a force stops the arm
    if (this.type === "werewolf" && weapon !== "silver_dagger" && weapon !== "silver_arrow" && weapon !== "monial_dagger") {   // update 75
      game.audio.sHit();
      game.ui.toast(STR.wolfImmune);
      this.state = "chase";
      return;
    }
    // and even silver takes EXACTLY three blows — no more one-cut kills
    // (the dagger only — arrows carry their own damage)
    if (this.type === "werewolf" && (weapon === "silver_dagger" || weapon === "monial_dagger")) {
      dmg = Math.ceil(this.maxHp / 3);
      // update 27: the blessed metal STAGGERS it — a short shove back, just
      // enough room to line up the next cut
      const p = game.player;
      const kx = this.pos.x - p.pos.x, kz = this.pos.z - p.pos.z;
      const kd = Math.hypot(kx, kz) || 1;
      const push = CFG.werewolf.silverKnockback;
      const c2 = this.collideXZ(this.pos.x + (kx / kd) * push, this.pos.z + (kz / kd) * push, false);
      this.pos.x = c2.x; this.pos.z = c2.z;
      this.atkT = Math.max(this.atkT, 0.6);   // the stagger also delays its bite
    }
    this.hp -= dmg;
    game.audio.sHit();
    if (this.type === "pig") game.audio.sPig();
    if (this.type === "chicken") game.audio.sChicken();
    if (this.type === "werewolf") game.audio.sGrowl();
    if (this.type === "cow") game.audio.s3("mooAngry", this.distToPlayer(), (this.pos.x - game.player.pos.x) * 0.02, 40, 0.9, () => game.audio.sPig());
    if (this.hp <= 0) this.die(game);
    else if (this.type === "pig" || this.type === "chicken" || this.type === "goat") {
      this.state = "flee"; this.stateT = 0;
    } else if (this.type === "cow") {
      // update 29: cows hit BACK — but only ever after you started it
      if (this.state !== "angry") game.ui.toast(STR.cowAngry);
      this.state = "angry"; this.stateT = 0; this.calmT = 0;
    } else if (this.type === "werewolf") {
      this.state = "chase";
      // strike one cave wolf and the WHOLE den answers
      if (this.caveWolf) for (const cw of game.wolves) if (cw.caveWolf) cw.caveAggroed = true;
    }
  }

  // update 11: a THROWN spear found its mark — the only wound a T-Rex knows
  spearHit(game, head) {
    if (this.dead) return;
    if (this.type === "elisia") {   // update 35: no thrown thing touches her
      game.audio.sHit();
      game.ui.toast(this.form === "evil" ? STR.spearImmune : STR.elisiaUnharmed);
      return;
    }
    const S = CFG.spear;
    if (this.type === "mother" || this.type === "spino" || this.type === "spinobaby") {
      game.audio.sHit();
      game.ui.toast(STR.spearImmune);
      if (this.type === "spino" || this.type === "spinobaby") {
        if (game.spino && !game.spino.dead) game.spino.alerted = true;
      }
      return;
    }
    if (this.type === "remotus" || this.type === "altai") {   // update 36
      game.audio.sHit();
      game.ui.toast(STR.spearImmune);
      if (this.state !== "eat") { this.state = "chase"; this.lostT = 0; }
      return;
    }
    if (this.type !== "trex") { this.hit(S.dmg * (game.spearMult || 1), game, "spear"); return; }   // update 39: the Eternial spear cuts deeper
    // update 36: the T-Rex cannot be killed by the player any more. The spear
    // snaps off its hide like it does on the mother's — and it KNOWS you now.
    game.audio.sHit();
    game.ui.toast(STR.spearImmune);
    game.audio.play3d("roar", this.distToPlayer(), (this.pos.x - game.player.pos.x) * 0.02, 80, 1, this.roarRate || 1);
    game.ui.shake(1.2);
    this.state = "chase"; this.loseT = 0; this.hiddenT = 0;
    this.hasTasted = true;
    return;
    // eslint-disable-next-line no-unreachable
    this.hp -= S.dmg * (head ? S.headMult : 1);
    this.bleedT = S.bleedTime;
    game.audio.sHit();
    game.ui.toast(head ? STR.spearHead : STR.spearHit);
    game.huntTarget = this;
    if (this.hp <= 0) { this.die(game); return; }
    // pain roar — and it KNOWS you now; hiding won't shake a speared hunter
    const d = this.distToPlayer();
    game.audio.play3d("roar", d, (this.pos.x - game.player.pos.x) * 0.02, 80, 1, this.roarRate || 1);
    game.ui.shake(1.2);
    this.state = "chase"; this.loseT = 0; this.hiddenT = 0;
    this.hasTasted = true;
    this.checkEnrage(game);
  }

  checkEnrage(game) {
    if (this.enraged || this.type !== "trex" || this.dead) return;
    if (this.hp <= this.maxHp * CFG.trexHunt.enrageFrac) {
      this.enraged = true;
      game.ui.toast(STR.trexEnraged);
      game.ui.shake(1.6);
    }
  }

  die(game) {
    this.dead = true;
    this.state = "dead";
    this.stateT = 0;
    this.respawnT = this.type === "trex" ? CFG.trexHunt.respawn
      : this.type === "goat" ? CFG.goat.respawn : this.type === "pachy" ? CFG.pachy.respawn : this.type === "theri" ? CFG.theri.respawn : CFG.respawnTime;
    let drops = this.cfg.drops;
    if (this.type === "pachy" && game.rng() < CFG.pachy.skullChance) drops = [...drops, ["pachy_skull", 1]];   // update 81: one dome in 256 comes off whole
    if (this.type === "chicken") {
      drops = [[game.rng() < 0.7 ? "raw_chicken" : "egg", 1]];
      // update 27: one bird in four sheds a FEATHER alongside its normal drop
      if (game.rng() < CFG.featherChance) drops = [...drops, ["feather", 1]];
    }
    // one goat in twenty carries the horn worth keeping
    if (this.type === "goat" && game.rng() < CFG.goat.hornChance) drops = [...drops, ["goat_horn", 1]];
    // a werewolf ALWAYS gives up its fur — and one in 64 leaves a fang behind
    if (this.type === "werewolf" && game.rng() < 1 / 64) drops = [...drops, ["wolf_tooth", 1]];
    // the silver-arrows scroll: a once-per-run werewolf secret (update 27)
    if (this.type === "werewolf" && !game.scrollFound.scroll_silver_arrows
        && game.rng() < CFG.scrollSilverWolfChance) {
      game.scrollFound.scroll_silver_arrows = true;
      drops = [...drops, ["scroll_silver_arrows", 1]];
    }
    if (this.type === "trex") {
      drops = [...CFG.trexHunt.drops];
      // update 38: one hunter in ten (Imperator: one in five) leaves a tooth where it fell
      if (game.rng() < (this.imperator ? CFG.imperator.toothChance : CFG.trexHunt.toothChance)) drops.push([this.imperator ? "imp_tooth" : "trex_tooth", 1]);
      // some spears come out of the carcass whole
      let recovered = 0;
      for (const s of this.stuckSpears) {
        this.group.remove(s);
        if (game.rng() < CFG.spear.recoverChance) recovered++;
      }
      this.stuckSpears = [];
      if (recovered) drops.push(["spear", recovered]);
      if (game.huntTarget === this) game.huntTarget = null;
      game.ui.toast(STR.trexSlain);
      game.ui.shake(2);
      game.audio.play3d("thud", this.distToPlayer(), 0, 80, 1);
    }
    // update 35: the dark form falls once and never returns; unholy water always,
    // the unholy tiara one time in sixty-four
    if (this.type === "elisia") {
      this.respawnT = 1e9;
      drops = [...(this.cfg.drops || [])];
      if (game.rng() < CFG.elisia.tiaraChance) drops = [...drops, ["unholy_tiara", 1]];
      if (game.huntTarget === this) game.huntTarget = null;
      game.ui.toast(STR.elisiaSlain);
      game.ui.shake(1.5);
    }
    // probe the ground from the ANIMAL's height, not from sea level — the
    // 0-probe dropped mountain-goat meat (and horns) 24 m under the shelf
    const dropY = this.ctx.world.groundHeight(this.pos.x, this.pos.z, this.group.position.y + 1.5);
    for (const [id, n] of drops || []) game.spawnDrop(id, n, this.pos.x, this.pos.z, dropY);
    const msg = { pig: STR.killedPig, chicken: STR.killedChicken, werewolf: STR.killedWolf, croc: STR.killedCroc,
      cow: this.raidKill ? null : STR.killedCow }[this.type];
    if (msg) game.ui.toast(msg);
    if (this.type === "cow") {
      game.audio.s3("mooDistress", this.distToPlayer(), (this.pos.x - game.player.pos.x) * 0.02, 60, 1, null);
      this.raidKill = false;
    }
  }

  respawn() {
    this.dead = false;
    this.hp = this.type === "trex" ? CFG.trexHunt.hp : (this.cfg.hp || Infinity);
    this.maxHp = this.hp;
    this.bleedT = 0; this.enraged = false; this.hasTasted = false;
    this.state = "wander";
    this.target = null;
    this.calmT = 0;
    this.pos.set(this.spawn.x, 0, this.spawn.z);
    this.group.visible = true;
    this.group.rotation.z = 0;
  }

  update(dt, game) {
    // update 80: a beast that finds itself inside the temple or the lighthouse (a wolf that got in before the walls held)
    // is set down outside the nearest wall at once
    if (HOSTILE.has(this.type) && !this.dead) { const w0 = game.world; if (w0.inRuin(this.pos.x, this.pos.z)) { const R = CFG.ruin; const ex = R.halfX + 2.5 - Math.abs(this.pos.x), ez = R.halfZ + 2.5 - Math.abs(this.pos.z); if (ex < ez) this.pos.x = Math.sign(this.pos.x || 1) * (R.halfX + 2.5); else this.pos.z = Math.sign(this.pos.z || 1) * (R.halfZ + 2.5); this.target = null; }
      else if (w0.inLighthouse(this.pos.x, this.pos.z)) { const L = CFG.lighthouse, ax = this.pos.x - L.x, az = this.pos.z - L.z, dd = Math.hypot(ax, az) || 1; this.pos.x = L.x + ax / dd * (L.r + 2.5); this.pos.z = L.z + az / dd * (L.r + 2.5); this.target = null; } }
    this.stateT += dt;
    this.phase += dt;
    if (this.dead) {
      if (this.stateT < 0.6) this.group.rotation.z = (this.stateT / 0.6) * Math.PI / 2;
      else if (this.stateT > (this.corpseHold || 2) && this.group.visible) {   // update 38: corpseHold — she eats it first
        this.group.visible = false;
        if (this.type === "elisia" || this.small) this.gone = true;   // update 35: she is removed, not respawned; update 69: so are the small things
      }
      this.respawnT -= dt;
      if (this.respawnT <= 0) {
        if (this.type === "werewolf" && !game.isNight && !this.caveWolf) { /* wait for night */ }
        else this.respawn();
      }
      return;
    }

    this.speed = 0;
    switch (this.type) {
      case "trex": this.updateTrex(dt, game); break;
      case "mother": this.updateMother(dt, game); break;
      case "spino": this.updateSpino(dt, game); break;
      case "spinobaby": this.updateBaby(dt, game); break;
      case "croc": this.updateCroc(dt, game); break;
      case "trike": this.updateTrike(dt, game); break;
      case "pachy": this.updatePachy(dt, game); break;   // update 81
      case "theri": this.updateTheri(dt, game); break;   // update 81
      case "werewolf": this.updateWolf(dt, game); break;
      case "cow": this.updateCow(dt, game); break;
      case "elisia": this.updateElisia(dt, game); break;   // update 35
      case "remotus": case "altai": this.updateAlio(dt, game); break;   // update 36
      case "meganeura": this.updateMeganeura(dt, game); break;   // update 69 (forest.js)
      case "bat": this.updateBat(dt, game); break;
      case "beetle": this.updateBeetle(dt, game); break;
      default: this.updatePrey(dt, game); break;
    }

    // update 79: a hunter that has not moved for three minutes is stuck (a lake's edge, a trunk) - it is set down on a
    // fresh wander spot and lives on from there
    if (this.type === "trex" && !this.chain && !this.dead) {
      if (!this.stillAt || Math.hypot(this.pos.x - this.stillAt.x, this.pos.z - this.stillAt.z) > 2.5) { this.stillAt = { x: this.pos.x, z: this.pos.z }; this.stillT = 0; }
      else if ((this.stillT = (this.stillT || 0) + dt) > (CFG.trexHunt.stuckTime || 180)) { const t = this.pickWanderTarget(game.rng); /* update 81: a Majungasaurus picks a valley spot */ this.spawn = { x: t[0], z: t[1] }; this.pos.set(t[0], 0, t[1]); this.stillAt = null; this.state = "wander"; this.target = null; this.loseT = 0; }
    }
    // update 39: the chain holds — a step past its length is pulled back
    if (this.chain) {
      const dx = this.pos.x - this.chain.x, dz = this.pos.z - this.chain.z, d = Math.hypot(dx, dz);
      if (d > this.chain.r) { this.pos.x = this.chain.x + dx / d * this.chain.r; this.pos.z = this.chain.z + dz / d * this.chain.r; }
    }
    // place + orient — probe from the CURRENT height, not sea level, or every
    // creature on the mountain sinks inside it (the swimming-in-rock bug)
    const groundY = this.ctx.world.groundHeight(this.pos.x, this.pos.z, this.group.position.y + 1.6);
    this.group.position.set(this.pos.x, groundY, this.pos.z);
    if (this.liftY) this.group.position.y += this.liftY;   // update 35: Elisia rising away
    if (this.hover) this.group.position.y += this.hover;   // update 69: the flyers
    this.group.rotation.y = this.yaw + (CFG.modelYaw[this.type] || 0);

    // drive the animation layer
    if (this.anim) {
      const running = this.speed > this.cfg.speed * 1.6;
      const animState = this.speed > 0.2 ? (running ? "run" : "walk") : "idle";
      this.anim.drive(animState, this.speed, CFG.animGait[this.type] || 0.5, dt);
    } else if (this.rigged) {
      // T-Rex at a hole: dip the neck AND push the head through the window
      const staring = this.type === "trex" && this.state === "window";
      driveCreature(this.rigged, this.speed, dt, staring ? -0.5 : 0, staring ? 2.4 : 0);
    } else {
      // no rig at all: fall back to the old gait bob
      const amp = this.cfg.height * 0.04;
      this.group.position.y += this.speed > 0.2 ? Math.abs(Math.sin(this.phase * 5)) * amp : 0;
    }
    // attack/threat lunge is a whole-body pose on top of whatever plays
    if (this.lungeT > 0) {
      this.lungeT -= dt;
      this.group.rotation.x = -0.35 * Math.sin((1 - this.lungeT / 0.4) * Math.PI);
    } else this.group.rotation.x = 0;
  }


  // --- update 36: the Alioramus of the desert ---
  // remotus hunts by EAR: walk past it and it lets you; run, swing a weapon or
  // eat within its hearing and it comes — and every remotus near it comes too.
  // altai hunts by EYE: it turns slowly, and only what is in its cone with a
  // clear line — no cactus, no dune crest in between — is prey. It steals cooked
  // meat: a half bite, one portion gone, five seconds of eating.
  // Neither ever leaves the desert, and nothing the player carries can kill one.
  updateAlio(dt, game) {
    const p = game.player, w = game.world, des = w.desert, C = this.cfg;
    const d = this.distToPlayer();
    const playerIn = des.inDesert(p.pos.x, p.pos.z) && !des.bridgeAt(p.pos.x, p.pos.z);
    const playerSafe = w.isSafe(p.pos.x, p.pos.z, p.pos.y);
    this.atkT -= dt;
    // footsteps
    if (this.speed > 0.2) {
      this.stepT -= dt;
      if (this.stepT <= 0) {
        this.stepT = this.state === "chase" ? 0.3 : 0.6;
        game.audio.play3d("thud", d, (this.pos.x - p.pos.x) * 0.02, 40, this.state === "chase" ? 0.5 : 0.3);
        if (d < 18 && this.state === "chase") game.ui.shake(Math.min(0.4, 1 - d / 18) * 0.8);
      }
    }
    if (this.state === "eat") {
      // tearing into the stolen meat: five seconds, then a look at where you are
      this.stateT += 0;
      if (this.eatT === undefined) this.eatT = C.stealTime;
      this.eatT -= dt;
      this.speed = 0;
      if (this.eatT <= 0) {
        this.eatT = undefined;
        // far enough: sated — it forgets you for a while and goes back to roaming
        if (d > C.stealFreeDist || !playerIn || playerSafe) { this.state = "wander"; this.target = null; this.satedT = C.satedTime; }
        else { this.state = "chase"; this.lostT = 0; }
      }
      return;
    }
    if (this.state === "chase") {
      // the water's edge is the end of it — and a safe roof too
      if (!playerIn || playerSafe) {
        this.state = "wander"; this.target = null; this.lostT = 0;
        if (d < 40 && !playerSafe) game.ui.toast(STR.alioLost);
        return;
      }
      let lost = false;
      if (this.type === "remotus") {
        this.lostT = d > C.loseDist ? (this.lostT || 0) + dt : 0;
        lost = this.lostT > C.loseTime;
      } else {
        const seen = d < C.sightR * 1.4 * game.player.sightMult && this.canSee(game, p);   // update 73: the scent potion
        this.lostT = seen ? 0 : (this.lostT || 0) + dt;
        lost = this.lostT > C.loseTime;
      }
      if (lost) { this.state = "wander"; this.target = null; this.lostT = 0; return; }
      this.moveToward(p.pos.x, p.pos.z, C.chaseSpeed, dt);
      if (d < C.biteRange && this.atkT <= 0 && p.pos.y < this.group.position.y + 2.4) {
        this.atkT = C.biteCd;
        this.lungeT = 0.4;
        // altai: cooked meat in your pack buys you a half bite and five seconds
        const meat = this.type === "altai" ? p.inv.slots.find((s) => s && CFG.cookedMeat.includes(s.id)) : null;
        if (meat) {
          p.damage(C.biteDmg * 0.5, "alio", this.pos);
          p.inv.removeOne(meat.id);
          game.ui.renderHotbar(p.inv);
          game.ui.toast(STR.alioSteal);
          game.audio.play3d("roar", d, (this.pos.x - p.pos.x) * 0.02, 60, 0.6, this.roarRate || 1);
          this.state = "eat"; this.eatT = C.stealTime;
        } else {
          game.audio.sGrowl();
          p.damage(C.biteDmg, "alio", this.pos);
        }
      }
      return;
    }
    // --- wander: a slow walk between points of its own part of the desert
    this.stateT += 0;
    if (this.type === "altai") {
      // it turns slowly: the yaw the wander leg asks for is reached at turnRate
      if (!this.target || this.moveToward(this.target[0], this.target[1], C.speed, dt, C.turnRate)) {
        this.target = this.pickWanderTarget(game.rng);
      }
    } else if (!this.target || this.moveToward(this.target[0], this.target[1], C.speed, dt)) {
      this.target = this.pickWanderTarget(game.rng);
    }
    // --- detection
    if (this.satedT > 0) { this.satedT -= dt; return; }
    if (!playerIn || playerSafe) return;
    let alert = false;
    if (this.type === "remotus") {
      const H = C.hear;
      const moving = p.vel.lengthSq() > 0.4;
      const r = !moving || p.sneak ? H.sneak : p.sprinting ? H.run : H.walk;
      if (d < r) alert = true;
      const L = game.lastLoud;
      if (L && game.time - L.t < 1.0 && Math.hypot(L.x - this.pos.x, L.z - this.pos.z) < H.event) alert = true;
      if (alert) {
        // the pack answers
        for (const o of game.creatures) {
          if (o !== this && o.type === "remotus" && !o.dead && o.state !== "chase"
              && Math.hypot(o.pos.x - this.pos.x, o.pos.z - this.pos.z) < C.packR) { o.state = "chase"; o.lostT = 0; }
        }
        if (d < 60) game.ui.toast(STR.alioHeard);
      }
    } else if (d < C.sightR * game.player.sightMult && this.canSee(game, p)) {
      alert = true;
      if (d < 60) game.ui.toast(STR.alioSeen);
    }
    if (alert) {
      this.state = "chase"; this.lostT = 0;
      game.audio.play3d("roar", d, (this.pos.x - p.pos.x) * 0.02, 70, 0.7, this.roarRate || 1);
    }
  }
  // altai's eye: inside its cone, and nothing between — no cactus, no crest
  canSee(game, p) {
    const C = this.cfg, w = game.world, des = w.desert;
    const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z, d = Math.hypot(dx, dz) || 1;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    if ((dx * fx + dz * fz) / d < C.fovCos) return false;
    if (w.losBlocked(this.pos.x, this.pos.z, p.pos.x, p.pos.z)) return false;
    if (des.crestBlocked(this.pos.x, this.pos.z, this.group.position.y + C.height * 0.9, p.pos.x, p.pos.z, p.pos.y + 1.5)) return false;
    return true;
  }

  // --- update 35: Elisia — her own module drives her ---
  updateElisia(dt, game) { if (game.elisia) game.elisia.drive(this, dt); }
  // a live T-Rex's bite: the one wound her dark form knows besides the dagger
  takeBite(game, dmg) {
    if (this.type !== "elisia" || this.form !== "evil" || this.dead) return;
    this.hp -= dmg;
    game.audio.sHit();
    if (this.hp <= 0) this.die(game);
  }
  // a T-Rex that finds her dark form takes YOUR side: it goes for her, bites her,
  // and never once looks at you — no roar-at-you, no toasts, no taste of you
  updateTrexFoe(dt, game, foe) {
    this.state = "foe";
    const d = Math.hypot(foe.pos.x - this.pos.x, foe.pos.z - this.pos.z);
    const reach = this.cfg.biteRange + foe.cfg.height * 0.3;
    this.moveToward(foe.pos.x, foe.pos.z, d > reach ? this.cfg.chaseSpeed : 0, dt);
    this.stepT -= dt;
    if (this.speed > 0.2 && this.stepT <= 0) {
      this.stepT = 0.42;
      const pd = this.distToPlayer();
      game.audio.play3d("thud", pd, (this.pos.x - game.player.pos.x) * 0.02, CFG.audio.thudMaxDist, 1);
      if (pd < 30) game.ui.shake(Math.min(0.6, 1 - pd / 30));
    }
    this.atkT -= dt;
    if (d < reach && this.atkT <= 0) {
      this.atkT = this.cfg.biteCd;
      this.lungeT = 0.4;
      game.audio.play3d("roar", this.distToPlayer(), (this.pos.x - game.player.pos.x) * 0.02, 80, 0.8, this.roarRate || 1);
      foe.takeBite(game, CFG.elisia.trexBite * (this.fightBiteMult || 1));   // update 38: the fight's luck
    }
  }

  // --- T-Rex: noise-driven hunter ---
  updateTrex(dt, game) {
    const p = game.player, w = game.world;
    const d = this.distToPlayer();
    // a stuck spear keeps cutting — the wound bleeds until it closes
    if (this.bleedT > 0) {
      this.bleedT -= dt;
      this.hp -= CFG.spear.bleedDps * dt;
      if (this.hp <= 0) { this.die(game); return; }
      this.checkEnrage(game);
    }
    // update 35: Elisia's dark form nearby — the hunter turns on HER
    const foe = game.elisia ? game.elisia.evilTarget() : null;
    if (foe && Math.hypot(foe.pos.x - this.pos.x, foe.pos.z - this.pos.z) < CFG.elisia.trexHelpR) { this.updateTrexFoe(dt, game, foe); return; }
    if (this.state === "foe") { this.state = "wander"; this.target = null; }
    // escorting Timo makes the pair of you far easier to notice
    const escortMult = game.escorting ? CFG.escortSightMult : 1;
    const noiseR = p.noiseRadius() * escortMult * (this.cfg.noiseMult || 1);   // update 38: the Imperator hears a little better
    const playerSafe = w.isSafe(p.pos.x, p.pos.z, p.pos.y);

    const walking = this.state !== "idle" && this.speed > 0.2;
    if (walking) {
      this.stepT -= dt;
      if (this.stepT <= 0) {
        this.stepT = this.state === "chase" ? 0.42 : this.cfg.stepInterval;
        const side = (this.pos.x - p.pos.x) * 0.02;
        game.audio.play3d("thud", d, side, CFG.audio.thudMaxDist, this.state === "chase" ? 1 : 0.8);
        if (d < 30) game.ui.shake(Math.min(0.6, (1 - d / 30)) * (this.state === "chase" ? 1.6 : 1));
        if (d < 40 && d > 25 && game.time % 11 < 0.05) game.ui.toast(STR.trexNear);
      }
    }
    this.roarT -= dt;
    // update 28: the SEARCHING roar — sometimes, not always, the hunter
    // bellows into the forest for no one in particular. Hear it, and you
    // know one is close before you ever see it.
    this.idleRoarT = (this.idleRoarT === undefined ? 6 + game.rng() * 20 : this.idleRoarT) - dt;
    if (this.idleRoarT <= 0) {
      this.idleRoarT = 22 + game.rng() * 38;
      if (this.state !== "chase" && game.audio.buf.roarIdle) {
        game.audio.play3d("roarIdle", d, (this.pos.x - p.pos.x) * 0.02, 130, 0.9, this.roarRate || 1);
      }
    }

    // continuous detection: stance noise, or close SIGHT — and sight is
    // blocked by boulders and thick trees (noise is not; sound carries).
    // Inside the camp fence you're beneath their interest — unless the
    // hunt already started before you slipped in.
    const losClear = !this.losCached(w, p);
    const campShield = w.inCamp(p.pos.x, p.pos.z) && this.state !== "chase" && this.state !== "window";
    // update 43: the chained beast only minds you INSIDE its circle — its chain grew, its temper did not
    const chainOK = !this.chain || Math.hypot(p.pos.x - this.chain.x, p.pos.z - this.chain.z) < this.chain.r + 1.5;
    if (this.chain && !chainOK && this.state === "chase") { this.state = "wander"; this.target = null; }
    const detected = chainOK && !playerSafe && !campShield
      && ((d < noiseR && (losClear || d < noiseR * 0.5)) || (d < this.cfg.sightR * escortMult * game.player.sightMult && losClear));

    if (this.state === "chase") {
      // update 81: after a horn bump the Majungasaurus stands, turning slowly back to you
      if (this.recoverT > 0) { this.recoverT -= dt; this.speed = 0; const want = Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z); this.yaw += normalizeYaw(want - this.yaw) * Math.min(1, dt * 0.9); return; }
      // player on the first floor: NEVER push through the wall — go to a
      // window and put the head through THAT (the only opening it fits)
      if (w.inReachableInterior(p.pos.x, p.pos.z, p.pos.y)) {
        let best = null, bd = 1e9;
        for (const win of w.windows) {
          if (Math.abs(win.y - p.pos.y) > 2.4) continue;
          const dd = Math.hypot(win.x - p.pos.x, win.z - p.pos.z);
          if (dd < bd) { bd = dd; best = win; }
        }
        if (best && bd < this.cfg.windowTrigger && best.y + 1.0 < this.cfg.neckReachY) {
          this.state = "window"; this.window = best; this.stateT = 0;
          return;
        }
        // no window near the player: hold off the wall instead of clipping in
        const away = Math.atan2(this.pos.x, this.pos.z);
        const hold = 16.5; // ruin half-diagonal + body standoff
        const hx2 = Math.sin(away) * Math.max(Math.hypot(this.pos.x, this.pos.z), hold);
        const hz2 = Math.cos(away) * Math.max(Math.hypot(this.pos.x, this.pos.z), hold);
        this.moveToward(hx2, hz2, this.cfg.speed, dt);
        this.elevT += dt;
        if (this.elevT > this.cfg.elevatedGiveUp) {
          this.elevT = 0; this.state = "wander"; this.target = null;
        }
        return;
      }
      if (playerSafe) {
        this.loseT += dt;
        if (this.loseT > 2.5) { this.state = "wander"; this.target = null; game.ui.toast(STR.trexLost); }
        const ox = p.pos.x + (this.pos.x - p.pos.x) * 0.4;
        const oz = p.pos.z + (this.pos.z - p.pos.z) * 0.4;
        this.moveToward(ox, oz, this.cfg.speed, dt);
        return;
      }
      this.loseT = d > this.cfg.loseDist ? this.loseT + dt : 0;
      if (this.loseT > this.cfg.loseTime) {
        this.state = "wander"; this.target = null;
        game.ui.toast(STR.trexLost);
        return;
      }
      // hiding behind cover breaks the chase — unless it has TASTED you
      if (!losClear && !this.hasTasted) {
        this.hiddenT += dt;
        if (this.hiddenT > CFG.losHideTime) {
          this.state = "investigate";
          this.noiseTarget = [p.pos.x, p.pos.z];
          this.investigated = false; this.stateT = 0; this.hiddenT = 0;
          game.ui.toast(STR.trexLost);
          return;
        }
      } else this.hiddenT = 0;
      // player perched above its reach (floor 2/3): pace, then give up —
      // but a TREETOP is no shelter from that neck (update 27)
      const treed = !!game.world.climbSpot;
      if (p.pos.y > 2.6 && d < 10 && this.state === "chase" && !treed) {
        this.elevT += dt;
        if (this.elevT > this.cfg.elevatedGiveUp) {
          this.elevT = 0;
          this.state = "wander"; this.target = null;
          return;
        }
      } else this.elevT = 0;
      // an enraged, bleeding hunter runs a quarter faster — it wants this OVER
      // update 80: a chaser held up by a trunk (it could see you and stood pushing at the tree) sidesteps round it
      if (this.sideT > 0) { this.sideT -= dt; this.moveToward(this.sideX, this.sideZ, this.cfg.chaseSpeed, dt); }
      else {
        this.moveToward(p.pos.x, p.pos.z, this.cfg.chaseSpeed * (this.enraged ? CFG.trexHunt.enrageSpeedMult : 1), dt);
        this.chaseStuckT = this.speed < this.cfg.chaseSpeed * 0.25 && d > this.cfg.biteRange + 1.5 ? (this.chaseStuckT || 0) + dt : 0;
        if (this.chaseStuckT > 1.0) { this.chaseStuckT = 0; const side = game.rng() < 0.5 ? 1 : -1, a = this.yaw + side * Math.PI / 2, dd = Math.max(5, this.cfg.height * 0.9); this.sideX = this.pos.x + Math.sin(a) * dd; this.sideZ = this.pos.z + Math.cos(a) * dd; this.sideT = 1.1; }
      }
      this.atkT -= dt;
      // a ground bite can only reach a player on the ground — or up a TREE
      if (d < this.cfg.biteRange + (treed ? 1.5 : 0) && this.atkT <= 0 && !playerSafe && (p.pos.y < 2.6 || treed)) {
        this.atkT = this.cfg.biteCd;
        this.lungeT = 0.4;
        this.hasTasted = true;
        // update 81: one attack in three the Majungasaurus leads with its horn: the same damage, a shove, two seconds
        // stunned - and it needs two or three seconds to turn and come after you again
        if (this.majunga && game.rng() < CFG.skull.bumpChance) {
          const K = CFG.skull;
          p.damage(this.cfg.biteDmg, "trex", this.pos);
          if (!p.dead) { const kx = p.pos.x - this.pos.x, kz = p.pos.z - this.pos.z, kd = Math.hypot(kx, kz) || 1; p.vel.x += kx / kd * K.bumpPush; p.vel.z += kz / kd * K.bumpPush; p.vel.y = Math.max(p.vel.y, 3.2); p.onGround = false; p.stunT = K.bumpStun; game.ui.toast(STR.skull.hornBump); game.ui.shake(1.6); }
          this.recoverT = K.bumpRecover[0] + game.rng() * (K.bumpRecover[1] - K.bumpRecover[0]);
        } else p.damage(this.cfg.biteDmg, "trex", this.pos);
      }
      return;
    }

    if (this.state === "window") {
      const win = this.window;
      const so = this.cfg.windowStandoff;
      const wx = win.x + win.nx * so, wz = win.z + win.nz * so;
      const arrived = this.moveToward(wx, wz, this.cfg.speed, dt);
      const pd = Math.hypot(win.x - p.pos.x, win.z - p.pos.z);
      const py = Math.abs(p.pos.y - win.y);
      if (!w.inReachableInterior(p.pos.x, p.pos.z, p.pos.y)) {
        this.state = w.isSafe(p.pos.x, p.pos.z, p.pos.y) ? "wander" : "chase";
        return;
      }
      if (arrived) {
        this.yaw = Math.atan2(-win.nx, -win.nz);
        this.atkT -= dt;
        if (pd < this.cfg.windowReach && py < 2.4) {
          game.ui.prompt(STR.windowWarning, true);
          if (this.atkT <= 0) {
            this.atkT = this.cfg.windowCd;
            this.lungeT = 0.4;
            this.hasTasted = true;
            game.audio.play3d("roar", pd + 2, 0, 40, 0.9, this.roarRate || 1);
            p.damage(this.cfg.windowDmg, "trex", { x: win.x + win.nx * 3, z: win.z + win.nz * 3 });
          }
        }
        if (this.stateT > 9) { this.state = "wander"; this.target = null; }
      }
      return;
    }

    if (this.state === "investigate") {
      if (detected) { this.engage(game, d); return; }
      const [nx, nz] = this.noiseTarget || [this.pos.x, this.pos.z];
      const arrived = this.moveToward(nx, nz, this.cfg.investigateSpeed, dt);
      if (arrived && !this.investigated) { this.investigated = true; this.investT = 0; }
      if (this.investigated) {
        // sniff around the spot, sweeping its head
        this.investT = (this.investT || 0) + dt;
        this.yaw += Math.sin(this.investT * 2.2) * 1.1 * dt;
        if (this.investT > this.cfg.investigateTime) { this.state = "wander"; this.target = null; }
      }
      return;
    }

    if (detected) { this.engage(game, d); return; }
    if (this.state === "idle") {
      if (this.stateT > 2 + game.rng() * 3) { this.state = "wander"; this.target = null; this.stateT = 0; }
      return;
    }
    if (!this.target) this.target = this.pickWanderTarget();
    if (this.moveToward(this.target[0], this.target[1], this.cfg.speed, dt)) {
      this.target = null; this.state = "idle"; this.stateT = 0;
    }
    // update 80: a wanderer that cannot move (the volcano's foot, a trunk, a wall) gives its target up after two seconds,
    // steps aside and picks another way - a hunter never stands pushing at the same spot
    this.blockT = this.speed < 0.25 ? (this.blockT || 0) + dt : 0;
    if (this.blockT > (CFG.trexHunt.blockedRetarget || 2)) { this.blockT = 0; this.target = null; this.state = "idle"; this.stateT = 1.5; const a = this.yaw + Math.PI * (0.5 + game.rng()); this.pos.x += Math.sin(a) * 0.5; this.pos.z += Math.cos(a) * 0.5; }
  }

  engage(game, d) {
    this.state = "chase"; this.loseT = 0;
    if (this.roarT <= 0) {
      this.roarT = this.cfg.roarCd;
      const p = game.player;
      // update 28: the ATTACK roar — its own generated scream, nothing like
      // the searching bellow you sometimes hear in the distance
      game.audio.play3d(game.audio.buf.roarAggro ? "roarAggro" : "roar", d, (this.pos.x - p.pos.x) * 0.02, 80, 1);
      game.ui.toast(STR.trexSpotted);
      game.ui.shake(1.4);
    }
  }

  // --- the SPINOSAURUS: the guardian of the old ruins ---
  // Circles the dead village all day. Sees you at TWICE a T-Rex's range,
  // hears twice as far, and runs 25% faster. The stone walls are your only
  // friends — and good timing, because her patrol is a slow, wide circle.
  updateSpino(dt, game) {
    const p = game.player, w = game.world;
    const S = this.cfg;
    const RV = CFG.ruins;
    const d = this.distToPlayer();
    const playerSafe = w.isSafe(p.pos.x, p.pos.z, p.pos.y);
    const losClear = !this.losCached(w, p);
    // heavy clawed steps
    const walking = this.speed > 0.2;
    if (walking) {
      this.stepT -= dt;
      if (this.stepT <= 0) {
        this.stepT = this.state === "chase" ? 0.4 : S.stepInterval;
        game.audio.play3d("thud", d, (this.pos.x - p.pos.x) * 0.02, 70, this.state === "chase" ? 1 : 0.8);
        if (d < 26) game.ui.shake(Math.min(0.6, (1 - d / 26)) * (this.state === "chase" ? 1.6 : 1));
        if (d < 34 && d > 20 && game.time % 9 < 0.05) game.ui.toast(STR.spinoNear);
      }
    }
    this.roarT -= dt;
    // detection: double a T-Rex's senses; the hatchlings can rat you out
    const escortMult = game.escorting ? CFG.escortSightMult : 1;
    const noiseR = p.noiseRadius() * S.noiseMult * escortMult;
    const detected = !playerSafe
      && ((d < noiseR && (losClear || d < noiseR * 0.5)) || (d < S.sightR * escortMult * game.player.sightMult && losClear) || this.alerted);
    if (this.state === "chase") {
      this.alerted = false;
      if (playerSafe) {
        this.loseT += dt;
        if (this.loseT > 2.5) { this.state = "patrol"; this.target = null; game.ui.toast(STR.trexLost); }
        const ox = p.pos.x + (this.pos.x - p.pos.x) * 0.4;
        const oz = p.pos.z + (this.pos.z - p.pos.z) * 0.4;
        this.moveToward(ox, oz, S.speed, dt);
        return;
      }
      this.loseT = d > S.loseDist ? this.loseT + dt : 0;
      if (this.loseT > S.loseTime) {
        this.state = "patrol"; this.target = null;
        game.ui.toast(STR.trexLost);
        return;
      }
      this.moveToward(p.pos.x, p.pos.z, S.chaseSpeed, dt);
      this.atkT -= dt;
      if (d < S.biteRange && this.atkT <= 0 && !playerSafe && p.pos.y < 2.6) {
        this.atkT = S.biteCd;
        this.lungeT = 0.4;
        p.damage(S.biteDmg, "trex", this.pos);
      }
      return;
    }
    if (this.state === "investigate") {
      if (detected) { this.engageSpino(game, d); return; }
      const [nx, nz] = this.noiseTarget || [this.pos.x, this.pos.z];
      const arrived = this.moveToward(nx, nz, S.investigateSpeed, dt);
      if (arrived && !this.investigated) { this.investigated = true; this.investT = 0; }
      if (this.investigated) {
        this.investT = (this.investT || 0) + dt;
        this.yaw += Math.sin(this.investT * 2.2) * 1.1 * dt;
        if (this.investT > S.investigateTime) { this.state = "patrol"; this.target = null; }
      }
      return;
    }
    if (detected) { this.engageSpino(game, d); return; }
    // the patrol: a big slow circle around the village, forever
    this.patrolA = this.patrolA === undefined ? Math.atan2(this.pos.z - RV.z, this.pos.x - RV.x) : this.patrolA;
    this.patrolA += (S.speed / RV.patrolR) * dt;
    const tx = RV.x + Math.cos(this.patrolA) * RV.patrolR;
    const tz = RV.z + Math.sin(this.patrolA) * RV.patrolR;
    this.state = "patrol";
    this.moveToward(tx, tz, S.speed, dt);
  }
  engageSpino(game, d) {
    this.state = "chase"; this.loseT = 0; this.alerted = false;
    if (this.roarT <= 0) {
      this.roarT = this.cfg.roarCd;
      const p = game.player;
      // update 28: the guardian is SILENT until this exact moment — then its
      // own generated shriek, not a borrowed T-Rex roar, opens the chase
      game.audio.play3d(game.audio.buf.spinoCry ? "spinoCry" : "roar", d, (this.pos.x - p.pos.x) * 0.02, 90, 1);
      game.ui.toast(STR.spinoSpotted);
      game.ui.shake(1.6);
    }
  }

  // --- the hatchlings: harmless, loud, and very well guarded ---
  updateBaby(dt, game) {
    const nest = game.world.spinoNest;
    const p = game.player;
    const d = this.distToPlayer();
    // wander a step or two inside the nest walls
    if (!this.target || game.rng() < 0.004) {
      const a = game.rng() * Math.PI * 2;
      this.target = [nest.x + Math.cos(a) * 1.6, nest.z + Math.sin(a) * 1.6];
    }
    this.moveToward(this.target[0], this.target[1], this.cfg.speed, dt);
    // come too close and they SCREAM for their mother
    this.screamCd = (this.screamCd || 0) - dt;
    if (d < CFG.spino.babyScreamR && this.screamCd <= 0 && !game.world.isSafe(p.pos.x, p.pos.z, p.pos.y)) {
      this.screamCd = 9;
      game.ui.toast(STR.babyScream);
      game.audio.noise(0.5, 1800, 0.5, "highpass");
      game.ui.shake(0.8);
      if (game.spino && !game.spino.dead) game.spino.alerted = true;
    }
  }

  // --- the MOTHER: towering, hunts by smell — and OWNS the open ground ---
  updateMother(dt, game) {
    const p = game.player, w = game.world;
    const M = CFG.mother;
    const d = this.distToPlayer();
    // while she has you in her jaws, she stands still and finishes it
    if (game.grabbed && game.grabbed.mother === this) {
      this.speed = 0;
      const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z;
      if (Math.hypot(dx, dz) > 0.5) this.yaw = Math.atan2(dx, dz);
      return;
    }
    // heavy footsteps you can always hear
    this.stepT -= dt;
    if (this.stepT <= 0) {
      this.stepT = this.state === "chase" ? 0.5 : 1.1;
      game.audio.play3d("thud", d, (this.pos.x - p.pos.x) * 0.02, 120, 1);
      if (d < 55) game.ui.shake(Math.min(1, 1 - d / 55) * 2);
      if (d < 70 && game.time % 13 < 0.05) game.ui.toast(STR.motherNear);
    }
    // returning the egg sends her home; she fades at the nest
    if (this.returning) {
      const N = CFG.nest;
      if (this.moveToward(N.x, N.z, M.speed, dt) || Math.hypot(this.pos.x - N.x, this.pos.z - N.z) < 8) {
        this.fade = (this.fade || 1) - dt * 0.25;
        this.group.visible = this.fade > 0;
        if (this.fade <= 0) this.gone = true;
      }
      return;
    }
    const playerSafe = w.isSafe(p.pos.x, p.pos.z, p.pos.y);
    const losClear = !this.losCached(w, p);
    // her eyes are poor — but any other T-Rex spotting you gives you away.
    // And on an EMPTY FIELD (no trees, no boulders near either of you), she
    // simply sees you. Same open field, no cover: you are already dead.
    const packAlert = game.creatures.some((c) => c.type === "trex" && (c.state === "chase" || c.state === "window"));
    const openField = d < M.fieldSightR && losClear
      && !w.nearCover(p.pos.x, p.pos.z) && !w.nearCover(this.pos.x, this.pos.z);
    const campShieldM = w.inCamp(p.pos.x, p.pos.z) && this.state !== "chase";
    const sees = !playerSafe && !campShieldM && ((d < M.sightR && losClear) || packAlert || openField);
    if (sees && this.state !== "chase") {
      this.state = "chase";
      if (openField && d > M.sightR + 4) {
        game.ui.toast(STR.motherSees);
        game.audio.play3d("roar", d, 0, 130, 1, this.roarRate || 1);
        game.ui.shake(1.8);
      }
    }
    if (this.state === "chase") {
      if (playerSafe || (d > M.fieldSightR + 20 && !packAlert)) { this.state = "smell"; }
      // cover regained (and she never tasted you from the open) — she loses the eye-lock
      if (!openField && !packAlert && d > M.sightR && w.nearCover(p.pos.x, p.pos.z) && !losClear) {
        this.state = "smell";
      }
      this.moveToward(p.pos.x, p.pos.z, M.chaseSpeed, dt);
      this.atkT -= dt;
      if (d < M.biteRange && this.atkT <= 0 && !playerSafe && p.pos.y < 4) {
        this.atkT = M.biteCd;
        this.lungeT = 0.4;
        game.startMotherGrab(this); // the mouth takes you — the kill cinematic
      }
      return;
    }
    // smell-tracking: she re-scents your trail every few seconds
    this.smellT = (this.smellT || 0) - dt;
    if (this.smellT <= 0 || !this.smellPos) {
      this.smellT = M.smellRepath;
      this.smellPos = [p.pos.x, p.pos.z];
    }
    this.state = "smell";
    this.moveToward(this.smellPos[0], this.smellPos[1], M.speed, dt);
  }

  // --- crocodile: an unseen shadow under the water until the moment it strikes ---
  updateCroc(dt, game) {
    const p = game.player;
    const L = CFG.lake;
    const d = this.distToPlayer();
    // submerged approach: invisible, silent, closing in fast
    if (this.hidden) {
      this.group.visible = false;
      this.moveToward(p.pos.x, p.pos.z, this.cfg.chaseSpeed * 1.2, dt);
      if (d < 3.4 || game.world.lakePenetration(this.pos.x, this.pos.z) <= 0.2) {
        this.hidden = false;
        this.group.visible = true;
        this.lungeT = 0.4;
        game.audio.noise(0.5, 600, 0.5);   // the water erupts
        game.audio.sGrowl();
        game.ui.shake(1.2);
      }
      return;
    }
    this.lifeT = (this.lifeT || 0) + dt;
    const retreat = this.lifeT > this.cfg.retreatAfter || d > this.cfg.giveUpDist;
    if (retreat) {
      // slide back into the deep and vanish
      if (this.moveToward(L.x, L.z, this.cfg.chaseSpeed * 0.8, dt) ||
          Math.hypot(this.pos.x - L.x, this.pos.z - L.z) < L.r * 0.5 + 1) {
        this.gone = true;
        this.group.visible = false;
      }
      return;
    }
    this.moveToward(p.pos.x, p.pos.z, d < this.cfg.aggroR ? this.cfg.chaseSpeed : this.cfg.speed, dt);
    this.atkT -= dt;
    if (d < this.cfg.atkRange && this.atkT <= 0 && p.pos.y < 1.5) {
      this.atkT = this.cfg.atkCd;
      this.lungeT = 0.4;
      game.audio.sGrowl();
      p.damage(this.cfg.dmg, "croc", this.pos);
    }
  }

  // --- Triceratops: the straight-line charger. Sidestep or be flattened. ---

  // ---- update 81: the Pachycephalosaurus herd. Three to a herd: the first plants itself in your way and stamps, the
  // others circle to your side and ram. A ram hurts, shoves, and leaves you dizzy. ----
  updatePachy(dt, game) {
    const p = game.player, d = this.distToPlayer(), P = CFG.pachy, R = P.ram, w = game.world;
    const playerSafe = w.isSafe(p.pos.x, p.pos.z, p.pos.y);
    this.atkT -= dt;
    const inValley = skullInside(p.pos.x, p.pos.z);
    if (this.state === "ram") {
      this.pos.x += Math.sin(this.chargeDir) * R.chargeSpeed * dt; this.pos.z += Math.cos(this.chargeDir) * R.chargeSpeed * dt;
      this.speed = R.chargeSpeed; this.yaw = this.chargeDir;
      if (!skullInside(this.pos.x, this.pos.z) || (w.skullZone && w.skullZone.inTent(this.pos.x, this.pos.z))) { this.pos.x -= Math.sin(this.chargeDir) * R.chargeSpeed * dt; this.pos.z -= Math.cos(this.chargeDir) * R.chargeSpeed * dt; this.state = "chase"; this.stateT = 0; return; }
      if (d < R.hitR && !playerSafe && this.atkT <= 0) {
        this.atkT = R.cd;
        p.damage(R.dmg, "pachy", this.pos);
        if (!p.dead) { const kx = p.pos.x - this.pos.x, kz = p.pos.z - this.pos.z, kd = Math.hypot(kx, kz) || 1; p.vel.x += kx / kd * R.knock; p.vel.z += kz / kd * R.knock; game.dizzyT = Math.max(game.dizzyT || 0, R.dizzy); game.ui.toast(STR.skull.pachyRam); game.ui.shake(1.5); }
        this.state = "chase"; this.stateT = 0; return;
      }
      const run = Math.hypot(this.pos.x - this.chargeFrom.x, this.pos.z - this.chargeFrom.z);
      if (run > this.chargeLen) { this.state = "chase"; this.stateT = 0; }
      return;
    }
    if (this.state === "chase") {
      if (playerSafe || !inValley) { this.loseT += dt; } else this.loseT = d > P.loseDist ? this.loseT + dt : 0;
      if (this.loseT > P.loseTime) { this.state = "wander"; this.target = null; this.loseT = 0; return; }
      if (this.herdIdx === 0) {
        // the blocker: stands between you and where you are going, and stamps
        const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
        const bx = p.pos.x + fx * P.blockStand, bz = p.pos.z + fz * P.blockStand;
        const bd = Math.hypot(bx - this.pos.x, bz - this.pos.z);
        if (bd > 1.6) this.moveToward(bx, bz, P.chaseSpeed, dt);
        else { this.speed = 0; this.yaw += normalizeYaw(Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z) - this.yaw) * Math.min(1, dt * 5); this.stampT = (this.stampT || 0) + dt; if (this.stampT > 0.9) { this.stampT = 0; game.audio.play3d("thud", d, (this.pos.x - p.pos.x) * 0.02, 40, 0.5, 1.6); if (d < 12) game.ui.shake(0.3); } }
        // when you are already past it, it rams too
        if (this.atkT <= 0 && d < R.flankD && d > 3 && Math.abs(normalizeYaw(Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z) - this.yaw)) < 0.3 && game.rng() < dt * 0.25) this.startRam(game);
        return;
      }
      // the flankers: out to your side, then straight at you
      const side = this.herdIdx === 1 ? 1 : -1;
      const sx = p.pos.x + Math.cos(p.yaw) * side * R.flankD, sz = p.pos.z - Math.sin(p.yaw) * side * R.flankD;
      const sd = Math.hypot(sx - this.pos.x, sz - this.pos.z);
      if (sd > 3.5) this.moveToward(sx, sz, P.chaseSpeed, dt);
      else { this.speed = 0; this.yaw += normalizeYaw(Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z) - this.yaw) * Math.min(1, dt * 6); if (this.atkT <= 0 && !playerSafe) this.startRam(game); }
      return;
    }
    if (this.state === "investigate") {
      const t = this.noiseTarget; if (!t || this.moveToward(t[0], t[1], P.speed * 1.6, dt) || this.stateT > 14) { this.state = "wander"; this.target = null; this.noiseTarget = null; }
      if (d < P.sightR * p.sightMult && !playerSafe && inValley) { this.state = "chase"; this.stateT = 0; this.loseT = 0; }
      return;
    }
    // grazing - until the herd sees you (one sees, all three come)
    if (d < P.sightR * p.sightMult && !playerSafe && inValley && !this.losCached(w, p)) { this.state = "chase"; this.stateT = 0; this.loseT = 0; this.atkT = 1.2 + game.rng(); for (const o of game.creatures) if (o !== this && o.type === "pachy" && o.herd === this.herd && !o.dead && o.state !== "chase") { o.state = "chase"; o.stateT = 0; o.loseT = 0; o.atkT = 1.5 + game.rng() * 1.5; } return; }
    if (this.state === "wander" && this.target && this.speed < 0.2) { this.blockT = (this.blockT || 0) + dt; if (this.blockT > 2) { this.target = null; this.blockT = 0; } } else this.blockT = 0;
    this.updatePrey(dt, game);
  }
  startRam(game) {
    const p = game.player, R = CFG.pachy.ram;
    this.chargeDir = Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
    this.chargeFrom = { x: this.pos.x, z: this.pos.z }; this.chargeLen = Math.min(26, this.distToPlayer() + 6);
    this.state = "ram"; this.stateT = 0;
    game.audio.play3d("thud", this.distToPlayer(), (this.pos.x - p.pos.x) * 0.02, 40, 0.8, 1.3);
  }
  // ---- update 81: the Therizinosaurus. Keeps to its den; chases only when robbed or struck; every attack is two ----
  updateTheri(dt, game) {
    const p = game.player, d = this.distToPlayer(), T = CFG.theri, den = this.den, w = game.world;
    const playerSafe = w.isSafe(p.pos.x, p.pos.z, p.pos.y);
    this.atkT -= dt;
    if (this.secondT > 0) { this.secondT -= dt; if (this.secondT <= 0 && d < T.claw.range + 1 && !playerSafe && !p.dead) p.damage(T.claw.dmg, "theri", this.pos); }
    if (this.state === "chase") {
      this.angryT -= dt;
      const dd = den ? Math.hypot(p.pos.x - den.x, p.pos.z - den.z) : 0;
      if (playerSafe || this.angryT <= 0 || (den && dd > CFG.skull.denR + T.chaseOut)) { this.state = "wander"; this.target = null; this.angryT = 0; if (d < 60) game.ui.toast(STR.skull.theriCalm); return; }
      this.moveToward(p.pos.x, p.pos.z, T.chaseSpeed, dt);
      if (d < T.claw.range && this.atkT <= 0 && !playerSafe) { this.atkT = T.claw.cd; this.secondT = T.claw.gap; this.lungeT = 0.3; p.damage(T.claw.dmg, "theri", this.pos); }
      return;
    }
    // the warning: an unfed visitor in the den is faced, standing
    const skz = w.skullZone, inDen = den && Math.hypot(p.pos.x - den.x, p.pos.z - den.z) < CFG.skull.denR;
    if (inDen && skz && !skz.denFed(den)) { this.speed = 0; this.yaw += normalizeYaw(Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z) - this.yaw) * Math.min(1, dt * 3); this.state = "idle"; this.stateT = 0; return; }
    if (this.state === "idle") { if (this.stateT > 4 + game.rng() * 6) { this.state = "wander"; this.target = null; this.stateT = 0; } return; }
    if (!this.target) this.target = this.pickWanderTarget();
    if (this.moveToward(this.target[0], this.target[1], T.speed, dt)) { this.target = null; this.state = "idle"; this.stateT = 0; }
  }
  updateTrike(dt, game) {
    const p = game.player;
    const d = this.distToPlayer();
    const T = CFG.trike;
    // update 28: the herd has a voice — an occasional low bellow while it
    // grazes, so you know one is around before the ground starts shaking
    this.gruntT = (this.gruntT === undefined ? 8 + game.rng() * 18 : this.gruntT) - dt;
    if (this.gruntT <= 0) {
      this.gruntT = 26 + game.rng() * 32;
      if (this.state !== "charge" && game.audio.buf.trikeCry) {
        game.audio.play3d("trikeCry", d, (this.pos.x - p.pos.x) * 0.02, 55, 0.5);
      }
    }
    // a SAFE player does not exist to a triceratops — step into Jabb's hut
    // (or any safe room) mid-charge and the horns get NOTHING, in any state
    const playerSafe = game.world.isSafe(p.pos.x, p.pos.z, p.pos.y);
    if (this.state === "charge") {
      // thunder STRAIGHT along the locked heading — no steering, no mercy
      this.pos.x += Math.sin(this.chargeDir) * T.chargeSpeed * dt;
      this.pos.z += Math.cos(this.chargeDir) * T.chargeSpeed * dt;
      this.speed = T.chargeSpeed;
      this.yaw = Math.atan2(Math.sin(this.chargeDir), Math.cos(this.chargeDir));
      const sq = CFG.world.square - 3;
      this.pos.x = Math.max(-sq, Math.min(sq, this.pos.x));
      this.pos.z = Math.max(-sq, Math.min(sq, this.pos.z));
      // horns meet ROCK: the rock loses
      game.smashRocksAt && game.smashRocksAt(this.pos.x, this.pos.z);
      // horns meet DEAD TREE: the tree wins — stuck fast, your window to run
      for (const dtp of game.world.deadTrees || []) {
        if (Math.hypot(this.pos.x - dtp.x, this.pos.z - dtp.z) < 1.6) {
          this.state = "stuck";
          this.stateT = 0;
          game.audio.sHit();
          if (this.distToPlayer() < 30) game.ui.toast(STR.trikeStuck);
          return;
        }
      }
      // horns meet the HUT: the charge breaks against the safe room's walls
      const J = game.world.jabbHutRect;
      if (J && this.pos.x > J.x0 - 1.6 && this.pos.x < J.x1 + 1.6 &&
          this.pos.z > J.z0 - 1.6 && this.pos.z < J.z1 + 1.6) {
        this.state = "turn"; this.stateT = 0;
        game.audio.sHit();
        return;
      }
      if (inFarm(this.pos.x, this.pos.z)) {   // update 29: nor does it cross the farm line
        this.state = "turn"; this.stateT = 0;
        game.audio.sHit();
        return;
      }
      // horns meet PLAYER: damage + a shove — never through safe-room walls
      this.atkT -= dt;
      if (d < T.hitR && this.atkT <= 0 && !playerSafe) {
        this.atkT = T.hitCd;
        p.damage(T.dmg, "trike", this.pos);
        const kx = p.pos.x - this.pos.x, kz = p.pos.z - this.pos.z, kd = Math.hypot(kx, kz) || 1;
        p.vel.x += (kx / kd) * T.knockback;
        p.vel.z += (kz / kd) * T.knockback;
        game.ui.shake(1.4);
      }
      // ran far enough past the mark — pull up and wheel around
      const run = Math.hypot(this.pos.x - this.chargeFrom.x, this.pos.z - this.chargeFrom.z);
      if (run > this.chargeLen) { this.state = "turn"; this.stateT = 0; }
      return;
    }
    if (this.state === "stuck") {
      // horns buried in dead wood: heave and wrench until it tears free
      this.speed = 0;
      this.yaw += Math.sin(this.stateT * 9) * 0.02;
      if (this.stateT > CFG.trike.stuckTime) { this.state = "turn"; this.stateT = 0; }
      return;
    }
    if (this.state === "turn") {
      // the slow realization: wheel toward the player, then go again
      const want = Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
      let dy = want - this.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      this.yaw += dy * Math.min(1, dt / Math.max(0.2, CFG.trike.turnTime - this.stateT));
      this.speed = 0.3;
      if (this.stateT > CFG.trike.turnTime) {
        if (d < (T.sightR + 8) * game.player.sightMult && !playerSafe) this.startCharge(game);
        else this.state = "wander";
      }
      return;
    }
    // grazing — until it SEES you (a player indoors is simply ignored)
    if (d < T.sightR * game.player.sightMult && !playerSafe) { this.startCharge(game); return; }
    // a grazer whose wander target lies BEHIND a dead tree walks against the
    // trunk forever — which reads as "stuck before it ever chased me".
    // Two seconds without progress = pick a fresh target.
    if (this.state === "wander" && this.target && this.speed < 0.2) {
      this.blockT = (this.blockT || 0) + dt;
      if (this.blockT > 2) { this.target = null; this.blockT = 0; }
    } else this.blockT = 0;
    this.updatePrey(dt, game);
  }
  startCharge(game) {
    const p = game.player;
    this.state = "charge";
    this.chargeDir = Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
    this.chargeFrom = { x: this.pos.x, z: this.pos.z };
    this.chargeLen = this.distToPlayer() + CFG.trike.chargePast;
    this.atkT = 0;
    // update 28: the trike bellows with its OWN voice when it commits
    if (this.roarT <= 0) {
      game.audio.play3d(game.audio.buf.trikeCry ? "trikeCry" : "roar", this.distToPlayer(), 0, 70, 0.9);
      this.roarT = 6;
    }
  }

  // --- Werewolf: night hunter, killable ---
  // ---- update 29: the cows ----
  // Placid grazers inside their fence: wander, low, shelter in the shed at
  // night. Struck first, a cow turns on you until you are gone or it is dead.
  // The pasture rect is the law for them — the auto gate opens for YOU only.
  updateCow(dt, game) {
    const p = game.player;
    const P = CFG.farm.pasture;
    const clamp = () => {
      this.pos.x = Math.max(P.x0 + 0.7, Math.min(P.x1 - 0.7, this.pos.x));
      this.pos.z = Math.max(P.z0 + 0.7, Math.min(P.z1 - 0.7, this.pos.z));
    };
    // update 33: the shed is solid to a cow OUTSIDE it and open to one inside
    // it or standing in its doorway. Decided here, once, and read by collideXZ.
    const SH = CFG.farm.shed;
    const inFootprint = this.pos.x > SH.x0 - 0.2 && this.pos.x < SH.x1 + 0.2 &&
      this.pos.z > SH.z0 && this.pos.z < SH.z1 + 0.05;
    const mouthOf = (sx) => [Math.max(SH.x0 + 0.9, Math.min(SH.x1 - 0.9, sx)), SH.z1 + 0.9];
    const atMouthFor = (sx) => Math.abs(this.pos.x - sx) < 0.7 && this.pos.z >= SH.z1 - 0.05 && this.pos.z < SH.z1 + 1.5;
    this.shedExempt = inFootprint;
    const d = this.distToPlayer();
    this.mooT = (this.mooT || 0) - dt;
    if (this.mooT <= 0) {
      this.mooT = 14 + game.rng() * 26;
      if (d < 45) game.audio.s3("moo", d, (this.pos.x - p.pos.x) * 0.02, 45, 0.7, null);
    }
    if (this.state === "angry") {
      // gone from the pasture (or safe on a floor above): the grudge fades
      const near = inPasture(p.pos.x, p.pos.z, 2.0) && p.pos.y < 1.5;
      this.calmT = near ? 0 : (this.calmT || 0) + dt;
      if (this.calmT > this.cfg.calmTime || d > 30) { this.state = "wander"; this.target = null; this.stateT = 0; clamp(); return; }
      // update 33b: it only charges while you are IN the pasture. With you on the
      // far side of the fence it used to drive into the rails at full chase
      // speed until it calmed, jittering against the clamp the whole time.
      if (near && d > this.cfg.atkRange * 0.75) this.moveToward(p.pos.x, p.pos.z, this.cfg.chaseSpeed, dt);
      else { this.speed = 0; this.yaw = Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z); }
      clamp();
      this.atkT = (this.atkT || 0) - dt;
      if (near && d < this.cfg.atkRange && this.atkT <= 0) {
        this.atkT = this.cfg.atkCd;
        this.lungeT = 0.4;
        game.audio.s3("mooAngry", d, (this.pos.x - p.pos.x) * 0.02, 40, 0.9, () => game.audio.sPig());
        p.damage(this.cfg.dmg, "cow", this.pos);
      }
      return;
    }
    // dusk: file into the shed and stand there until morning
    if (game.isNight) {
      if (!this.shedSpot) {
        const spots = game.world.shedSpots || [];
        const idx = game.creatures.filter((c) => c.type === "cow").indexOf(this);
        this.shedSpot = spots.length ? spots[idx % spots.length] : null;
      }
      if (this.shedSpot) {
        const [sx, sz] = this.shedSpot;
        // The shed has three plank walls and one open side (+z). A cow whose
        // stall is INSIDE walks to the doorway in line with it first, and only
        // then straight in — and while it is in the doorway or inside, the shed
        // block stands aside for it (shedExempt).
        let ax = sx, az = sz;
        if (sz < SH.z1) {
          const atMouth = atMouthFor(sx);
          this.shedExempt = inFootprint || atMouth;
          if (!inFootprint && !atMouth) [ax, az] = mouthOf(sx);
        }
        // arriving AT the stall is close enough at 0.7 m; the doorway is a
        // waypoint and must be reached properly or the cow parks outside it
        const tol = (ax === sx && az === sz) ? 0.7 : 0.3;
        if (Math.hypot(ax - this.pos.x, az - this.pos.z) > tol) this.moveToward(ax, az, this.cfg.speed, dt);
        else this.speed = 0;
        clamp();
        return;
      }
    }
    if (this.state === "idle") {
      if (this.stateT > 2 + game.rng() * 6) { this.state = "wander"; this.target = null; this.stateT = 0; }
      return;
    }
    if (!this.target) this.target = this.pickWanderTarget();
    // update 33: a cow still inside the shed in the morning leaves by the door,
    // not through the wall its grazing spot happens to lie behind
    let [tx, tz] = this.target;
    if (inFootprint && !(tx > SH.x0 && tx < SH.x1 && tz > SH.z0 && tz < SH.z1)) [tx, tz] = mouthOf(this.pos.x);
    if (this.moveToward(tx, tz, this.cfg.speed, dt) && tx === this.target[0]) {
      this.target = null; this.state = "idle"; this.stateT = 0;
    }
    clamp();
  }

  // ---- update 29: a werewolf raid on the pasture ----
  // The raider ignores the player entirely: it runs to its cow, kills it, eats
  // a while, and drags off into the trees. By day it parks like every wolf.
  updateRaid(dt, game) {
    const R = this.raid;
    if (!game.isNight || !R) {
      this.group.visible = false; this.dead = true; this.respawnT = 1e9; this.raid = null;
      return;
    }
    R.t = (R.t || 0) + dt;
    if (R.phase === "go") {
      const cow = R.cow;
      if (!cow || cow.dead) { R.phase = "leave"; R.t = 0; return; }
      const dc = Math.hypot(cow.pos.x - this.pos.x, cow.pos.z - this.pos.z);
      this.moveToward(cow.pos.x, cow.pos.z, this.cfg.chaseSpeed * 0.85, dt);
      if (dc < 1.9 || R.t > 60) {
        this.lungeT = 0.4;
        if (this.anim) this.anim.playAttack();
        game.audio.sGrowl();
        cow.raidKill = true;
        cow.die(game);
        if (this.distToPlayer() < 80) game.ui.toast(STR.cowRaid);
        R.phase = "eat"; R.t = 0;
      }
      return;
    }
    if (R.phase === "eat") {
      this.speed = 0;
      if (R.t > CFG.farm.raidEatTime) { R.phase = "leave"; R.t = 0; }
      else if (game.rng() < 0.01) game.audio.sGrowl();
      return;
    }
    // leave: back to where it came from, then vanish for the night
    const arrived = this.moveToward(this.spawn.x, this.spawn.z, this.cfg.chaseSpeed * 0.8, dt);
    if (arrived || R.t > 45) {
      if (this.distToPlayer() < 80) game.ui.toast(STR.cowRaidGone);
      this.group.visible = false; this.dead = true; this.respawnT = 1e9; this.raid = null;
    }
  }

  updateWolf(dt, game) {
    const p = game.player, w = game.world;
    if (this.raid) return this.updateRaid(dt, game);
    // DUNGEON wolves live by the den's rules, not the sun's: inside the cave
    // there is no safe hour and no safe spot — only rocks break their sight.
    // The EXIT is the first mercy: step into daylight and they stop at the
    // mouth; escape at night and the pack follows you out.
    if (this.caveWolf && w.dungeon) {
      const playerIn = w.inDungeon(p.pos.x, p.pos.z);
      const provoked = this.caveAggroed || p.inv.has("silver_bar");
      const d = this.distToPlayer();
      if (playerIn) {
        if (this.state !== "chase" &&
            (provoked || (d < this.cfg.aggroR && !w.losBlocked(this.pos.x, this.pos.z, p.pos.x, p.pos.z)))) {
          this.state = "chase";
          game.audio.sGrowl();
        }
      } else if (this.state === "chase" && !game.isNight) {
        this.state = "wander"; this.target = null;   // daylight is a wall
      }
      if (this.state === "chase") {
        if (w.isSafe(p.pos.x, p.pos.z, p.pos.y)) { this.state = "wander"; this.target = null; }
        else {
          // a player perched in a tree is out of reach — circle 10s, give up
          if (p.pos.y - this.group.position.y > 2.5) {
            this.treeWait = (this.treeWait || 0) + dt;
            if (this.treeWait > CFG.treeClimb.wolfGiveup) {
              this.treeWait = 0;
              this.state = "wander"; this.target = null;
              if (this.distToPlayer() < 25) game.ui.toast(STR.wolfGaveUp);
            }
            this.moveToward(p.pos.x, p.pos.z, this.cfg.stalkSpeed * 0.5, dt);
            return;
          }
          this.treeWait = 0;
          this.moveToward(p.pos.x, p.pos.z, this.cfg.chaseSpeed, dt);
          this.atkT -= dt;
          if (d < this.cfg.atkRange && this.atkT <= 0) {
            this.atkT = this.cfg.atkCd;
            this.lungeT = 0.4;
            if (!this.anim || !this.anim.playAttack()) { /* lunge covers it */ }
            game.audio.sGrowl();
            p.damage(this.cfg.dmg, "werewolf", this.pos);
          }
          return;
        }
      }
      // a prowler that drifted out through the rocks walks straight back in —
      // the pack is never met anywhere but inside
      if (!w.inDungeon(this.pos.x, this.pos.z)) {
        this.moveToward(this.spawn.x, this.spawn.z, this.cfg.stalkSpeed, dt);
        return;
      }
      // prowl the tunnels near my post — sparse, one shadow at a time
      if (!this.target || game.rng() < 0.006) {
        const s = this.spawn;
        this.target = [s.x + (game.rng() - 0.5) * 13, s.z + (game.rng() - 0.5) * 13];
        if (!w.inDungeon(this.target[0], this.target[1])) this.target = [s.x, s.z];
      }
      this.moveToward(this.target[0], this.target[1], this.cfg.stalkSpeed * 0.6, dt);
      return;
    }
    if (!game.isNight) {
      this.state = "flee";
      const away = Math.atan2(this.pos.x, this.pos.z);
      this.moveToward(Math.sin(away) * 160, Math.cos(away) * 160, this.cfg.chaseSpeed, dt);
      if (Math.hypot(this.pos.x, this.pos.z) > CFG.world.boundaryR - 6) {
        this.group.visible = false;
        this.dead = true; this.respawnT = 1e9;
      }
      return;
    }
    const d = this.distToPlayer();
    const evilHeld = !!(p.inv.selected() && p.inv.selected().id === "evil_dagger");   // update 74: the black blade makes the pack your kin
    const playerSafe = w.isSafe(p.pos.x, p.pos.z, p.pos.y) || evilHeld;
    if (playerSafe) {
      this.state = "wander";
      if (!this.target || game.rng() < 0.005) {
        const a = game.rng() * Math.PI * 2;
        this.target = [p.pos.x + Math.cos(a) * 14, p.pos.z + Math.sin(a) * 14];
      }
      this.moveToward(this.target[0], this.target[1], this.cfg.stalkSpeed, dt);
      return;
    }
    if (d < this.cfg.aggroR && !(w.inCamp(p.pos.x, p.pos.z) && this.state !== "chase")) this.state = "chase";
    if (this.state === "chase") {
      // treed prey: pace below for 10 seconds, then slink off (update 27)
      if (p.pos.y - this.group.position.y > 2.5) {
        this.treeWait = (this.treeWait || 0) + dt;
        if (this.treeWait > CFG.treeClimb.wolfGiveup) {
          this.treeWait = 0;
          this.state = "wander"; this.target = null;
          const a = game.rng() * Math.PI * 2;
          this.moveToward(this.pos.x + Math.cos(a) * 40, this.pos.z + Math.sin(a) * 40, this.cfg.stalkSpeed, dt);
          if (d < 25) game.ui.toast(STR.wolfGaveUp);
          return;
        }
        this.moveToward(p.pos.x, p.pos.z, this.cfg.stalkSpeed * 0.5, dt);
        return;
      }
      this.treeWait = 0;
      this.moveToward(p.pos.x, p.pos.z, this.cfg.chaseSpeed, dt);
      this.atkT -= dt;
      if (d < this.cfg.atkRange && this.atkT <= 0) {
        this.atkT = this.cfg.atkCd;
        this.lungeT = 0.4;
        if (!this.anim || !this.anim.playAttack()) { /* lunge covers it */ }
        game.audio.sGrowl();
        p.damage(this.cfg.dmg, "werewolf", this.pos);
      }
    } else {
      this.moveToward(p.pos.x, p.pos.z, this.cfg.stalkSpeed, dt);
    }
  }

  // --- pigs and chickens ---
  updatePrey(dt, game) {
    const p = game.player;
    const d = this.distToPlayer();
    // chickens randomly drop eggs in the pen — walk in and pick them up
    if (this.type === "chicken") {
      if (this.layT === undefined) this.layT = CFG.chicken.layMin + game.rng() * (CFG.chicken.layMax - CFG.chicken.layMin);
      this.layT -= dt;
      if (this.layT <= 0) {
        this.layT = CFG.chicken.layMin + game.rng() * (CFG.chicken.layMax - CFG.chicken.layMin);
        const loose = game.drops.filter((dr) => dr.id === "egg").length;
        if (loose < CFG.maxLooseEggs) {
          game.spawnDrop("egg", 1, this.pos.x, this.pos.z, this.ctx.world.groundHeight(this.pos.x, this.pos.z, 0));
          if (d < 14) game.audio.sChicken();
        }
      }
    }
    // goats spook at walkers and runners — but a CROUCHED hunter (C) reads as
    // part of the mountain and can close the whole distance unnoticed
    const spookR = this.type === "goat" && p.sneak ? 0 : this.cfg.fleeR;
    if (this.state === "flee" || d < spookR) {
      this.state = "flee";
      if (this.stateT > 4 && d > this.cfg.fleeR * 1.8) { this.state = "wander"; this.target = null; }
      const a = Math.atan2(this.pos.x - p.pos.x, this.pos.z - p.pos.z);
      let tx = this.pos.x + Math.sin(a) * 6, tz = this.pos.z + Math.cos(a) * 6;
      if (this.type === "chicken" && !this.wild) {
        const [hx, hz] = CFG.world.hutPos;
        const P = CFG.pen;
        tx = Math.max(hx + P.x0 + 0.4, Math.min(hx + P.x1 - 0.4, tx));
        tz = Math.max(hz + P.z0 + 0.4, Math.min(hz + P.z1 - 0.4, tz));
      }
      this.moveToward(tx, tz, this.cfg.fleeSpeed, dt);
      return;
    }
    if (this.state === "idle") {
      if (this.stateT > 1.5 + game.rng() * 4) { this.state = "wander"; this.target = null; this.stateT = 0; }
      return;
    }
    if (!this.target) this.target = this.pickWanderTarget();
    if (this.moveToward(this.target[0], this.target[1], this.cfg.speed, dt)) {
      this.target = null; this.state = "idle"; this.stateT = 0;
      if (game.rng() < 0.3) {
        if (this.type === "pig" && d < 18) game.audio.sPig();
        if (this.type === "chicken" && d < 12) game.audio.sChicken();
      }
    }
  }
}

// ---- item drops ----
// Eggs lie on the ground like the apples do; everything else floats.
export class ItemDrop {
  constructor(id, count, x, z, y, scene, ttl = 0, opts = {}) {
    this.id = id; this.count = count;
    this.ttl = ttl;   // 0 = forever; player-dropped items fade after 10 min
    this.pos = new THREE.Vector3(x, y, z);
    const spearA = (id === "spear" || id === "et_spear") && ItemDrop.assets && ItemDrop.assets.glb && ItemDrop.assets.glb[id === "spear" ? "hf_spear" : "etspear3d"];
    this.grounded = id === "egg" || id === "torch" || !!opts.flat || !!spearA;
    if (spearA) {
      // update 79: a thrown spear lies where it landed, as itself - its longest side along the ground
      const m = spearA.model.clone(); const bb = new THREE.Box3().setFromObject(m), sz = bb.getSize(new THREE.Vector3()); m.scale.multiplyScalar(1.7 / Math.max(sz.x, sz.y, sz.z));
      const g = new THREE.Group(); const bb2 = new THREE.Box3().setFromObject(m), c = bb2.getCenter(new THREE.Vector3()); m.position.sub(c); g.add(m);
      g.position.set(x, y + 0.08, z); g.rotation.y = Math.random() * Math.PI * 2; this.sprite = g; scene.add(g);
    } else if (opts.flat) {
      // update 79: a spawned tool lies flat on its table or on the ground, no bob
      const cnv = icons[id]; const texMap = new THREE.CanvasTexture(cnv || document.createElement("canvas")); texMap.colorSpace = THREE.SRGBColorSpace;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshStandardMaterial({ map: texMap, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.8 }));
      m.rotation.x = -Math.PI / 2; m.rotation.z = Math.random() * Math.PI * 2; m.position.set(x, y + 0.03, z); this.sprite = m; scene.add(m);
      // on a slope (the pickaxe on the volcano's foot) a level card sinks into the rise on one side: lie it ALONG the ground
      const W = ItemDrop.world; if (W && W.groundHeight) { const e = 0.3, dx = (W.groundHeight(x + e, z, y + 1) - W.groundHeight(x - e, z, y + 1)) / (2 * e), dz = (W.groundHeight(x, z + e, y + 1) - W.groundHeight(x, z - e, y + 1)) / (2 * e);
        if (Math.abs(dx) < 1.5 && Math.abs(dz) < 1.5 && (Math.abs(dx) > 0.02 || Math.abs(dz) > 0.02)) { const nrm = new THREE.Vector3(-dx, 1, -dz).normalize(); const spin = m.rotation.z; m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), nrm).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), spin)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)); m.position.y = y + 0.05; } }
    } else if (id === "egg") {
      const egg = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8),
        new THREE.MeshStandardMaterial({ color: 0xdfd2b8, roughness: 0.55 }));
      egg.scale.y = 1.3;
      egg.position.set(x, y + 0.13, z);
      egg.rotation.z = (Math.random() - 0.5) * 0.5;
      this.sprite = egg;
      scene.add(egg);
    } else if (id === "torch") {
      // a torch lying on the ground, waiting to be picked up
      const g = new THREE.Group();
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.75, 6),
        new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 1 }));
      stick.rotation.z = Math.PI / 2.15;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6),
        new THREE.MeshStandardMaterial({ color: 0x2a2118, roughness: 1 }));
      head.position.set(0.36, 0.12, 0);
      g.add(stick, head);
      g.position.set(x, y + 0.06, z);
      g.rotation.y = Math.random() * Math.PI * 2;
      this.sprite = g;
      scene.add(g);
    } else {
      const cnv = icons[id];
      const texMap = new THREE.CanvasTexture(cnv || document.createElement("canvas"));
      texMap.colorSpace = THREE.SRGBColorSpace;
      this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texMap, transparent: true }));
      this.sprite.scale.setScalar(0.55);
      this.sprite.position.copy(this.pos);
    }
    this.phase = Math.random() * 6;
    if (!this.grounded) scene.add(this.sprite);
  }
  update(dt) {
    if (this.grounded) return; // eggs rest on the ground
    this.phase += dt;
    this.sprite.position.y = this.pos.y + 0.45 + Math.sin(this.phase * 2.2) * 0.08;
  }
  dispose(scene) {
    scene.remove(this.sprite);
    if (this.sprite.material) {
      if (this.sprite.material.map) this.sprite.material.map.dispose();
      this.sprite.material.dispose();
    }
  }
}
