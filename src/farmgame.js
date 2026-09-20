// update 29: the LIFE of Dirk's farm — Dirk and his trade, Duco the dog, the
// cows' milking, the blueberry field and its crate, the auto gate, the living
// clock, the werewolf raid roll. Geometry lives in farm.js.
import * as THREE from "three";
import { clone as skeletonClone } from "three/addons/utils/SkeletonUtils.js";
import { CFG } from "./config.js";
import { STR } from "../strings.js";
import { ClipAnimator, riggedCreature, driveCreature } from "./skeletal.js";
import { Creature } from "./entities.js";
import { Inventory, iconUrl } from "./items.js";
import { inFarm, inField, inHouseRooms, inPasture, X, Z } from "./farm.js";

const FA = CFG.farm;

export class FarmGame {
  constructor(game) {
    this.g = game;
    this.crate = 0;                 // blueberries in the crate
    this.trusted = false;           // Dirk's storage chest unlocked (per run)
    this.helping = false;           // Duco picks berries with you until nightfall
    this.ducoQueue = [];            // Duco's berries on their way to the crate
    this.wineDay = -1;              // the farm fridge's daily bottle
    this.storage = new Inventory(CFG.storageSlots, CFG.storageStackMax);
    this.cows = [];
    this.herdT = 3;                 // update 32: the herd's slow "is anyone missing?" tick
    this.raidWolf = null;
    this.dirk = null; this.dirkW = null;
    this.duco = null;
    this.barkT = 6;
  }

  // ---------- setup (called from Game.start once the world exists) ----------
  setup(ctx) {
    const g = this.g, w = g.world, A = g.assets;
    const P = FA.pasture;
    for (let i = 0; i < CFG.cow.count; i++) {
      const x = P.x0 + 4 + g.rng() * (P.x1 - P.x0 - 8), z = P.z0 + 5 + g.rng() * (P.z1 - P.z0 - 8);
      const c = new Creature("cow", A.glb.cow, x, z, ctx);
      c.state = "idle"; c.stateT = g.rng() * 4;
      g.creatures.push(c);
      this.cows.push(c);
    }
    // the raider: a werewolf that exists only for raid nights, parked otherwise
    const rw = new Creature("werewolf", A.glb.werewolf, P.x1 + 26, (P.z0 + P.z1) / 2, ctx);
    rw.raider = true; rw.dead = true; rw.respawnT = 1e9; rw.group.visible = false;
    g.wolves.push(rw);
    this.raidWolf = rw;
    // Dirk, rigged when the model ships clips
    // update 32: Dirk on a REAL humanoid skeleton. The auto-rigger had to guess
    // his joints from a photo and got his hand and one leg wrong twice running;
    // this model ships its own bones, so the limbs are the rig's, not a guess.
    this.dirk = this.placeNpc("dirk6", w.dirkPos);   // update 33c: a plain farmer, built new, on the mesher's own skeleton
    if (this.dirk) this.dirkW = { state: "stand", t: 3 + g.rng() * 4, tx: 0, tz: 0 };
    // Duco: an NPC body with the dog's procedural rig — never a target
    const da = A.glb.duco;   // update 30: Duco lifted from his own photo, 50% bigger
    let body = null, rig = null, anim = null;
    if (da && da.anims && da.anims.length) { body = skeletonClone(da.model); anim = new ClipAnimator(body, da.anims); }
    else if (da) { rig = riggedCreature(da.model, "dog"); body = rig || da.model.clone(); }
    else {
      body = new THREE.Group();
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.5, 4, 8), new THREE.MeshStandardMaterial({ color: 0xa07a48, roughness: 1 }));
      m.rotation.x = Math.PI / 2; m.position.y = 0.34; body.add(m);
    }
    const start = [FA.terrace.x1 + 1.5, FA.terrace.z0 + 3];
    body.position.set(start[0], w.groundHeight(start[0], start[1], 999), start[1]);
    g.scene.add(body);
    this.duco = { body, rig, anim, mode: "wander", t: 1, target: null, speed: 0, pathI: 0, happyT: 0, autoDoor: false, yaw: 0 };
    // the door path: porch steps -> doorway -> living room -> the mat
    // update 32: at nightfall Duco no longer stops at his mat by the door — he
    // climbs the stairs and gets up on the big bed. The stair leg runs along the
    // flight's own centre line, so he walks the treads instead of the banister.
    // update 33: the route is the house's own doors, in order — the kitchen door
    // from the garden, across the kitchen, through the kitchen's door into the
    // living room, up the stairs, along the upstairs hallway to the big
    // bedroom's door, and onto the bed. Every leg stays inside one room or
    // passes through a doorway; the old path cut a straight line to the bed
    // that went through the hobby room and out through its wall.
    const S = FA.stairs, su = (S.u0 + S.u1) / 2;
    const BD = 6.3;            // the kitchen (back) door, centre of its opening
    const KD = 0.8;            // the kitchen -> living-room door in the partition
    const HALL = 0.45;         // the upstairs hallway, clear of the stairwell's guard (update 36: was -0.05, inside his own radius of the well)
    const BR = 0.9;            // the big bedroom's door off that hallway
    this.homePath = [
      [X(-8.6), Z(BD)], [X(-7.0), Z(BD)],                 // garden -> the back stoop
      // update 36: ROUND the kitchen table — along the back wall past the counter,
      // then up between the table's end and the hutch to the inner door
      [X(-5.2), Z(BD)], [X(-5.2), Z(3.3)], [X(-2.7), Z(2.9)], [X(-2.1), Z(1.6)], [X(-2.0), Z(KD)],
      [X(-0.6), Z(KD)], [X(-0.7), Z(su)],                 // living room, to the foot of the stairs
      [X(S.vBot), Z(su)], [X(S.vTop), Z(su)], [X(S.vTop - 0.4), Z(su)],   // up, fully onto the landing plate
      [X(S.vTop - 0.4), Z(HALL)],                          // update 36: sideways off the landing, past the guard's end, into the hallway
      [X(-3.0), Z(HALL)], [X(BR), Z(HALL)],               // along the hallway to the bedroom door
      [X(BR), Z(2.4)], [X(BR), Z(3.6)],                   // through it, into the room
    ];
    const db = w.farmDogBed;
    if (db) this.homePath.push([db.x, db.z]);
    else this.homePath.push([w.dogMat.x, w.dogMat.z]);   // no bed measured: the old mat
  }

  placeNpc(id, pos) {
    const g = this.g, a = g.assets.glb[id];
    if (!a || !pos) return null;
    const rigged = a.anims && a.anims.length;
    const m = rigged ? skeletonClone(a.model) : a.model.clone();
    m.position.set(pos.x, pos.y ?? g.world.groundHeight(pos.x, pos.z, 999), pos.z);
    m.rotation.y = pos.yaw || 0;
    m.userData.anim = rigged ? new ClipAnimator(m, a.anims) : null;
    g.scene.add(m);
    return m;
  }

  cull(cullEnt) { cullEnt(this.dirk); if (this.duco) cullEnt(this.duco.body); }

  // ---------- per-frame ----------
  update(dt) {
    const g = this.g, w = g.world, p = g.player;
    this.updateDirk(dt);
    this.updateToy(dt);          // update 32: before Duco, so he sees this frame's toy
    this.updateDuco(dt);
    this.updateHerd(dt);
    // the pasture gate opens for YOU as you come, and shuts behind you
    const gate = w.farmGate;
    if (gate) {
      const want = Math.hypot(p.pos.x - gate.x, p.pos.z - gate.z) < 2.6 && p.pos.y < 1.5;
      if (want !== gate.open) {
        gate.open = want;
        if (want) Object.assign(gate.boxRef, { minX: 1e6, maxX: 1e6 + 0.1, minZ: 1e6, maxZ: 1e6 + 0.1 });
        else Object.assign(gate.boxRef, gate.closedBox);
        g.audio.s3("gate", 1, 0, 12, 0.7, () => g.audio.sChest());
      }
    }
    // the grandfather clock keeps the game's own time (a day = 06:00 -> 22:00, then the night)
    if (w.farmClock) {
      const cyc = CFG.time.dayLen + CFG.time.nightLen;
      const hours = 6 + ((g.time % cyc) / cyc) * 24;
      w.farmClock.hour.rotation.z = -((hours % 12) / 12) * Math.PI * 2;
      w.farmClock.minute.rotation.z = -((hours * 60) % 60) / 60 * Math.PI * 2;
    }
    // ambience: the fountain's trickle and the clock's tick, by distance
    const on = g.playing && !g.menuOpen;
    const FO = FA.fountain;
    const df = Math.hypot(p.pos.x - FO.x, p.pos.z - FO.z);
    g.audio.loopMix("fountain", on ? Math.pow(Math.max(0, 1 - df / 24), 1.6) * (inHouseRooms(p.pos.x, p.pos.z) ? 0.25 : 1) : 0, 0.65);
    const dc = w.farmClock ? Math.hypot(p.pos.x - w.farmClock.x, p.pos.z - w.farmClock.z) : 99;
    g.audio.loopMix("clock", on && inHouseRooms(p.pos.x, p.pos.z) ? Math.pow(Math.max(0, 1 - dc / 9), 1.2) : 0, 0.45);
    // bushes regrow; Duco's berries land in the crate
    for (const b of w.bushes || []) {
      if (b.ripe) continue;
      b.t += dt;
      if (b.t >= FA.bushRegrow) { b.ripe = true; this.setBerries(b, true); }
    }
    while (this.ducoQueue.length && this.ducoQueue[0] <= g.time) {
      this.ducoQueue.shift();
      if (this.crate < FA.crate.cap) { this.crate++; this.helperText(); }
    }
    if (this.helping && g.isNight) this.endHelp();
  }

  helperText() {
    if (!this.helping) { this.g.ui.setHelper(null); return; }
    this.g.ui.setHelper(`${STR.ducoHelping} · ${this.crate}/${FA.crate.cap}`);
  }
  endHelp() {
    this.helping = false;
    this.ducoQueue.length = 0;
    this.g.ui.setHelper(null);
    this.g.ui.toast(STR.ducoDone);
  }

  setBerries(b, on) {
    const mesh = this.g.world.berryMesh;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    for (let k = 0; k < b.n; k++) {
      const [x, y, z] = b.pts[k];
      if (on) m.makeTranslation(x, y, z); else m.makeScale(0, 0, 0);
      mesh.setMatrixAt(b.first + k, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  // ---------- Dirk: walks his living room, turns to you when you come close ----------
  updateDirk(dt) {
    const b = this.dirk, wd = this.dirkW;
    if (!b || !wd) return;
    const g = this.g, p = g.player, A = FA.dirkArea;
    const pd = Math.hypot(p.pos.x - b.position.x, p.pos.z - b.position.z);
    if (pd < 3.2) {
      wd.state = "stand"; wd.t = Math.max(wd.t, 1.6);
      const want = Math.atan2(p.pos.x - b.position.x, p.pos.z - b.position.z);
      let dy = want - b.rotation.y;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      b.rotation.y += dy * Math.min(1, dt * 6);
    } else if (wd.state === "stand") {
      wd.t -= dt;
      if (wd.t <= 0) {
        const u = A.u0 + g.rng() * (A.u1 - A.u0), v = A.v0 + g.rng() * (A.v1 - A.v0);
        wd.tx = X(v); wd.tz = Z(u);
        wd.state = "walk";
      }
    }
    if (wd.state === "walk") {
      const dx = wd.tx - b.position.x, dz = wd.tz - b.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.25) { wd.state = "stand"; wd.t = 4 + g.rng() * 9; }
      else {
        const step = Math.min(0.9 * dt, d);
        b.position.x += (dx / d) * step;
        b.position.z += (dz / d) * step;
        b.rotation.y = Math.atan2(dx, dz);
      }
    }
    b.position.y = FA.house.floor0;
    const anim = b.userData.anim;
    if (anim) anim.drive(wd.state === "walk" ? "walk" : "idle", wd.state === "walk" ? 0.8 : 0, 0.9, dt);
    else b.position.y += wd.state === "walk" ? Math.abs(Math.sin(g.time * 7)) * 0.04 : Math.sin(g.time * 1.6) * 0.01;
  }

  // ---------- Duco's blueberry ----------
  // update 32: a TOY, deliberately not an item. It never enters the inventory,
  // it cannot be stored, and it cannot leave the farm — carry it past the fence
  // and it is taken out of your hands and put back where it started. Its whole
  // life is: rest -> held -> flight -> fetch (Duco runs it down) -> carried
  // (in his mouth) -> rest again at your feet.
  updateToy(dt) {
    const g = this.g, w = g.world, p = g.player, T = w.farmToy;
    if (!T) return;
    const m = T.mesh, input = g.ui.input;
    if (T.state === "held") {
      // off the farm it is not yours to take
      if (!inFarm(p.pos.x, p.pos.z) || p.dead) { this.returnToy(); return; }
      const cam = g.camera;
      const f = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
      const r = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
      m.position.copy(cam.position).addScaledVector(f, 0.78).addScaledVector(r, 0.34);
      m.position.y -= 0.32 + (T.charge || 0) * 0.06;      // it draws back as you wind up
      m.rotation.y += dt * 0.6;
      // hold to wind up, release to let fly — a tap is a short toss
      if (input.useHeld) T.charge = Math.min(1, (T.charge || 0) + dt * 1.5);
      else if (T.charge > 0) this.throwToy(T.charge);
      input.use = false;                                   // never swing a weapon with a toy in hand
      return;
    }
    if (T.state === "flight") {
      // update 33: the toy cannot leave the farm at all. The moment a throw
      // carries it over the boundary it vanishes and is back at its spot, with
      // a word about other people's toys — no more losing it in the forest.
      if (!inFarm(m.position.x, m.position.z)) { this.returnToy(); return; }
      T.vel.y -= 12 * dt;
      m.position.addScaledVector(T.vel, dt);
      m.rotation.x += T.spin * dt;
      m.rotation.z += T.spin * 0.55 * dt;
      const gy = w.groundHeight(m.position.x, m.position.z, m.position.y + 1.2);
      if (m.position.y <= gy || Math.hypot(T.vel.x, T.vel.z) < 0.2) {
        m.position.y = gy;
        m.rotation.set(0, m.rotation.y, 0);
        T.vel.set(0, 0, 0);
        // a dog who is awake and out in the yard goes and gets it
        const D = this.duco;
        T.state = (D && D.mode !== "sleep" && D.mode !== "home") ? "fetch" : "rest";
        if (T.state === "fetch") this.bark();
      }
      return;
    }
    if (T.state === "carried") {
      // ride at Duco's mouth — updateDuco does the walking
      const D = this.duco;
      if (!D) { T.state = "rest"; return; }
      const b = D.body;
      m.position.set(b.position.x + Math.sin(b.rotation.y) * 0.34, b.position.y + CFG.dog.height * 0.66,
        b.position.z + Math.cos(b.rotation.y) * 0.34);
    }
  }

  throwToy(charge) {
    const g = this.g, T = g.world.farmToy;
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(g.camera.quaternion);
    T.vel.copy(f).multiplyScalar(6.5 + charge * 11);
    T.vel.y += 2.4 + charge * 2.2;
    T.spin = 7 + charge * 12;
    T.charge = 0;
    T.state = "flight";
    g.audio.s3("dogHappy", 1, 0, 14, 0.6, () => g.audio.sChicken());
  }

  takeToy() {
    const T = this.g.world.farmToy;
    T.state = "held"; T.charge = 0;
    this.g.audio.sChest();
    this.g.ui.toast(STR.toyHint);
  }

  returnToy() {
    const T = this.g.world.farmToy;
    T.state = "rest"; T.charge = 0;
    T.vel.set(0, 0, 0);
    T.mesh.position.set(T.home.x, T.home.y, T.home.z);
    T.mesh.rotation.set(0, 0, 0);
    this.g.audio.sDeny();
    this.g.ui.toast(STR.toySteal);
  }

  // ---------- the herd ----------
  // update 32: two things the cows were missing. They had no body — the player
  // walked through them as though they were not there — and nothing guaranteed
  // the herd came back to full, so a cow a werewolf took could stay gone.
  updateHerd(dt) {
    const g = this.g, w = g.world, p = g.player, C = CFG.cow;
    const bodies = w.softBodies;
    bodies.length = 0;
    for (const c of this.cows) {
      if (c.dead) continue;
      const by = c.group.position.y;
      bodies.push({ x: c.pos.x, z: c.pos.z, r: C.radius, minY: by, maxY: by + C.height * 0.95 });
      // lean into a cow and it gives ground, the way an animal does — the world
      // has already stopped you, this is the half that makes the cow move
      const dx = c.pos.x - p.pos.x, dz = c.pos.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      const rr = C.radius + CFG.player.radius;
      if (d < rr && d > 1e-4 && p.pos.y < by + C.height) {
        const step = Math.min(rr - d, C.shoveSpeed * dt);
        c.pos.x += (dx / d) * step;
        c.pos.z += (dz / d) * step;
      }
    }
    // the guarantee: a thinned herd is always full again a while later
    this.herdT -= dt;
    if (this.herdT > 0) return;
    this.herdT = 3;
    for (const c of this.cows) {
      if (!c.dead) { c.deadFor = 0; continue; }
      c.deadFor = (c.deadFor || 0) + 3;
      if (c.deadFor >= FA.cowRespawn) {
        c.deadFor = 0;
        c.shedSpot = null;
        c.respawn();
      }
    }
  }

  // ---------- Duco ----------
  updateDuco(dt) {
    const D = this.duco;
    if (!D) return;
    const g = this.g, w = g.world, p = g.player, C = CFG.dog, b = D.body;
    D.happyT = Math.max(0, D.happyT - dt);
    D.sit = 0; D.look = 0;          // update 32: re-decided every frame by the branches below
    const door = w.farmBackDoor || w.farmDoor;   // update 33: he comes and goes by the kitchen door
    const px = p.pos.x, pz = p.pos.z;
    // mode transitions on the day/night edge
    if (g.isNight && D.mode !== "home" && D.mode !== "sleep") { D.mode = "home"; D.pathI = 0; }
    if (!g.isNight && (D.mode === "home" || D.mode === "sleep")) { D.mode = "leave"; D.pathI = this.homePath.length - 2; }
    let tx = null, tz = null, spd = C.speed, stopAt = 0.35;
    if (D.mode === "home" || D.mode === "leave") {
      const path = this.homePath;
      const forward = D.mode === "home";
      const wp = path[D.pathI];
      tx = wp[0]; tz = wp[1];
      if (Math.hypot(tx - b.position.x, tz - b.position.z) < 0.45) {
        D.pathI += forward ? 1 : -1;
        if (forward && D.pathI >= path.length) { D.mode = "sleep"; D.pathI = path.length - 1; }
        if (!forward && D.pathI < 0) { D.mode = "wander"; D.t = 1; D.pathI = 0; }
      }
      spd = C.followSpeed;
    }
    // update 36: EVERY farm door swings for the dog as he reaches it, and shuts
    // behind him once he is through (unless you are standing in it)
    for (const dr of w.farmDoors || []) {
      const dd = Math.hypot(dr.x - b.position.x, dr.z - b.position.z);
      if (dd < 1.6 && !dr.open && D.speed > 0.2) { g.toggleDoor(dr); dr.ducoOpened = true; }
      else if (dr.ducoOpened && dd > 2.8 && dr.open && Math.hypot(dr.x - px, dr.z - pz) > 1.8) { g.toggleDoor(dr); dr.ducoOpened = false; }
    }
    void door;
    if (D.mode === "home" || D.mode === "leave") {
      // (the path leg above already chose the target)
    } else if (D.mode === "sleep") {
      tx = null;
    } else {
      // by day: follow you around the farm, pick with you, or nose about the garden
      const near = inFarm(px, pz) && !inHouseRooms(px, pz) && p.pos.y < 1.5;
      const pd = Math.hypot(px - b.position.x, pz - b.position.z);
      const T = w.farmToy;
      if (T && (T.state === "fetch" || T.state === "carried")) {
        // update 32: fetch. Run the blueberry down, take it in his mouth, bring
        // it back and drop it at your feet — then wait to be thrown it again.
        if (T.state === "fetch") {
          tx = T.mesh.position.x; tz = T.mesh.position.z;
          spd = C.followSpeed * 1.35; stopAt = 0.3;
          if (Math.hypot(tx - b.position.x, tz - b.position.z) < 0.7) { T.state = "carried"; D.happyT = 1.2; }
        } else {
          tx = px; tz = pz; spd = C.followSpeed * 1.2; stopAt = 1.0;
          // update 36: you left the farm — he stops at the border, drops it there and goes back to his day
          if (!inFarm(px, pz)) {
            T.state = "rest";
            T.mesh.position.set(b.position.x, w.groundHeight(b.position.x, b.position.z, b.position.y + 1.2), b.position.z);
            T.mesh.rotation.set(0, 0, 0);
            D.mode = "wander"; D.t = 1; D.target = null;
            tx = null;
          } else if (pd < 1.5) {
            T.state = "rest";
            T.mesh.position.set(b.position.x, w.groundHeight(b.position.x, b.position.z, b.position.y + 1.2), b.position.z);
            T.mesh.rotation.set(0, 0, 0);
            D.happyT = 2.5;
            g.audio.s3("dogHappy", 1, 0, 16, 0.8, () => g.audio.sChicken());
            g.ui.toast(STR.toyBack);
          }
        }
        D.target = null;
      } else if (this.helping && inField(px, pz, 2)) {
        D.t -= dt;
        if (!D.target || D.t <= 0 || Math.hypot(D.target[0] - px, D.target[1] - pz) > 7) {
          const bushes = (w.bushes || []).filter((q) => Math.hypot(q.x - px, q.z - pz) < 6);
          const q = bushes.length ? bushes[Math.floor(g.rng() * bushes.length)] : null;
          D.target = q ? [q.x + (g.rng() - 0.5) * 1.6, q.z + (g.rng() - 0.5) * 1.6] : [px + (g.rng() - 0.5) * 4, pz + (g.rng() - 0.5) * 4];
          D.t = 2.5 + g.rng() * 3;
        }
        tx = D.target[0]; tz = D.target[1]; spd = C.followSpeed * 0.8;
      } else if (near && pd < C.leash) {
        if (pd > C.followDist + 0.5) { tx = px; tz = pz; spd = pd > 7 ? C.followSpeed * 1.4 : C.followSpeed; stopAt = C.followDist; }
        else {
          // update 32: he has caught up, and you are not going anywhere — so he
          // sits, turns to face you and looks UP into your eyes. Walk on and he
          // is back on his feet, off beside you with the same stride as before.
          const want = Math.atan2(px - b.position.x, pz - b.position.z);
          let dy = want - b.rotation.y;
          while (dy > Math.PI) dy -= Math.PI * 2;
          while (dy < -Math.PI) dy += Math.PI * 2;
          b.rotation.y += dy * Math.min(1, dt * 6);
          if (Math.hypot(p.vel.x, p.vel.z) < 0.9) D.sit = 1;
          // the pitch that puts his eyes on yours, from wherever he is sitting
          const eye = p.pos.y + CFG.player.height * 0.9;
          const hy = b.position.y + C.height * 0.9;
          D.look = -Math.max(-0.25, Math.min(0.9, Math.atan2(eye - hy, Math.max(0.5, pd))));
        }
        D.target = null;
      } else {
        D.t -= dt;
        if (!D.target || D.t <= 0) {
          const T = FA.terrace;
          D.target = [T.x0 - 1 + g.rng() * (FA.hedge.x - T.x0), T.z0 - 6 + g.rng() * 18];   // update 30: relative to the terrace
          D.t = 4 + g.rng() * 8;
        }
        tx = D.target[0]; tz = D.target[1];
        if (Math.hypot(tx - b.position.x, tz - b.position.z) < 0.5) { tx = null; }
      }
    }
    // move
    let moving = 0;
    // update 36: mid-jump over the pasture fence — an arc, no collision, no steering
    if (D.jump) {
      const J = D.jump;
      J.t += dt;
      const k = Math.min(1, J.t / J.dur);
      b.position.x = J.x0 + (J.x1 - J.x0) * k;
      b.position.z = J.z0 + (J.z1 - J.z0) * k;
      D.jumpY = Math.sin(k * Math.PI) * 0.95;
      b.rotation.y = Math.atan2(J.x1 - J.x0, J.z1 - J.z0);
      moving = Math.hypot(J.x1 - J.x0, J.z1 - J.z0) / J.dur;
      if (k >= 1) { D.jump = null; D.jumpY = 0; }
      tx = null;
    }
    if (tx !== null) {
      // update 36: he never leaves the farm — a target beyond the border is the border
      const M = 0.8;
      tx = Math.max(FA.x - FA.hw + M, Math.min(FA.x + FA.hw - M, tx));
      tz = Math.max(FA.z - FA.hd + M, Math.min(FA.z + FA.hd - M, tz));
      const dx = tx - b.position.x, dz = tz - b.position.z;
      const d = Math.hypot(dx, dz);
      if (d > stopAt) {
        const step = Math.min(spd * dt, d - stopAt);
        const nx = b.position.x + (dx / d) * step, nz = b.position.z + (dz / d) * step;
        // update 36: he walks round things now — walls, furniture, fences, doors.
        // The one exception is the last leg onto (and the first leg off) his bed:
        // the bed is a solid box to everyone else, and he hops onto it.
        const bedLeg = (D.mode === "home" || D.mode === "leave") && D.pathI >= this.homePath.length - 1;
        const c = bedLeg ? { x: nx, z: nz } : w.collide(nx, nz, 0.28, b.position.y, 0.9, true);
        const got = Math.hypot(c.x - b.position.x, c.z - b.position.z);
        // the pasture fence: blocked with the target on the far side -> he jumps it
        if (got < step * 0.25 && inPasture(tx, tz, -0.5) !== inPasture(b.position.x, b.position.z, -0.5)) {
          const jx = b.position.x + (dx / d) * 2.6, jz = b.position.z + (dz / d) * 2.6;
          D.jump = { x0: b.position.x, z0: b.position.z, x1: jx, z1: jz, t: 0, dur: 0.75 };
          this.bark();
        } else {
          b.position.x = c.x; b.position.z = c.z;
          b.rotation.y = Math.atan2(dx, dz);
          moving = got / Math.max(dt, 1e-4);
        }
      }
    }
    D.speed = moving;
    // update 32: asleep he is ON the bed, not on the floor under it, so his
    // height comes from the mattress rather than from the ground probe.
    const dbed = w.farmDogBed;
    if (D.mode === "sleep" && dbed) {
      b.position.x = dbed.x; b.position.z = dbed.z; b.position.y = dbed.y;
      b.rotation.y = -Math.PI / 2;                      // lying along the bed
    } else {
      // update 32: probe from 0.9 m above him, not 1.6. A dog does not step up
      // further than that anyway, and from the bed's mattress the taller probe
      // reached the ATTIC floor — he left the bedroom in the morning by standing
      // on the ceiling and walking out along it.
      const gy = w.groundHeight(b.position.x, b.position.z, b.position.y + 0.9);
      b.position.y = gy + (D.happyT > 0 ? Math.abs(Math.sin(g.time * 14)) * 0.14 : 0) + (D.jumpY || 0);
    }
    if (D.anim) D.anim.drive(moving > 0.2 ? "walk" : "idle", moving, CFG.animGait.dog || 0.9, dt);
    // update 33: on the bed he LIES DOWN — asleep is flat, not sitting up
    else if (D.rig) {
      const asleep = D.mode === "sleep";
      driveCreature(D.rig, asleep ? 0 : moving, dt, asleep ? 0.25 : D.look, 0, asleep ? 0 : D.sit, asleep ? 1 : 0);
    }
    else b.position.y += moving > 0.2 ? Math.abs(Math.sin(g.time * 9)) * 0.05 : 0;
    // a dog knows when wolves prowl: barks at the night from the yard
    this.barkT -= dt;
    if (this.barkT <= 0) {
      this.barkT = 5 + g.rng() * 6;
      if (g.isNight) {
        const wolfNear = g.wolves.some((wf) => !wf.dead && Math.hypot(wf.pos.x - b.position.x, wf.pos.z - b.position.z) < 30);
        if (wolfNear) this.bark();
      }
    }
  }
  bark() {
    const g = this.g, b = this.duco.body;
    const d = Math.hypot(g.player.pos.x - b.position.x, g.player.pos.z - b.position.z);
    g.audio.s3("bark", d, (b.position.x - g.player.pos.x) * 0.02, 60, 0.9, () => g.audio.sChicken());
  }

  // ---------- the interact hub hooks (called from Game.updateInteract) ----------
  interact(consider, p) {
    const g = this.g, w = g.world;
    if (!inFarm(p.pos.x, p.pos.z)) return;
    // Dirk
    if (this.dirk) {
      const b = this.dirk;
      consider(b.position.x, b.position.z, b.position.y + 1, `${STR.talkToDirk} [${STR.interact}]`, () => this.openDirk());
    }
    // Duco: the bowl of blueberry yogurt
    if (this.duco) {
      const b = this.duco.body, sel = p.inv.selected();
      if (sel && sel.id === "bowl_yogurt_blueberries") {
        consider(b.position.x, b.position.z, b.position.y + 0.5, `${STR.ducoGive} [${STR.interact}]`, () => this.giveYogurt());
      }
    }
    // the cows: milk them with an empty bowl
    for (const c of this.cows) {
      if (c.dead || c.state === "angry") continue;
      consider(c.pos.x, c.pos.z, c.group.position.y + 0.6, `${STR.cowMilk} [${STR.interact}]`, () => this.milk(c));
    }
    // the blueberry bushes
    if (inField(p.pos.x, p.pos.z, 3)) {
      for (const b of w.bushes || []) {
        if (!b.ripe) continue;
        if (Math.abs(b.x - p.pos.x) > 3 || Math.abs(b.z - p.pos.z) > 3) continue;
        consider(b.x, b.z, p.pos.y, `${STR.pickBerries} [${STR.interact}]`, () => this.pickBush(b));
      }
    }
    // the crate
    if (w.farmCrate) {
      const c = w.farmCrate;
      consider(c.x, c.z, c.y + 0.4, `${STR.cratePrompt} [${STR.interact}]`, () => this.openCrate());
    }
    // the house: doors, stove, fridge, crafting table, storage chest, dinner table
    for (const d of w.farmDoors || []) {
      consider(d.x, d.z, d.y + 1, `${d.open ? STR.closeDoor : STR.openDoor} [${STR.interact}]`, () => {
        g.toggleDoor(d);
        g.audio.s3("doorCreak", 1, 0, 12, 0.7, null);
      });
    }
    if (w.farmStove) {
      const s = w.farmStove;
      consider(s.x, s.z, s.y + 0.6, `${STR.cookPrompt} [${STR.interact}]`, () => g.tryCook(w.farmStove, false));
    }
    // update 30: the taps — a drink of well water (kitchen sink, bathroom basin)
    for (const t of w.farmTaps || []) {
      consider(t.x, t.z, t.y + 0.9, `${STR.tapPrompt} [${STR.interact}]`, () => this.drinkTap(t));
    }
    // update 32: Duco's blueberry, lying where it was left
    const toy = w.farmToy;
    if (toy && toy.state === "rest") {
      consider(toy.mesh.position.x, toy.mesh.position.z, toy.mesh.position.y + 0.18,
        `${STR.toyPick} [${STR.interact}]`, () => this.takeToy());
    }
    // update 31: the ladder to the attic — offered from whichever floor you are on
    const L = w.farmLadder;
    if (L) {
      if (Math.abs(p.pos.y - L.y) < 1.3) consider(L.x, L.z, L.y + 1.1, `${STR.climbLadder} [${STR.interact}]`, () => this.climbLadder(1));
      else if (Math.abs(p.pos.y - L.topY) < 1.3) consider(L.x, L.z, L.topY + 0.9, `${STR.climbDownLadder} [${STR.interact}]`, () => this.climbLadder(-1));
    }
    if (w.farmFridge) {
      const f = w.farmFridge;
      consider(f.x, f.z, f.y + 0.8, `${STR.fridgePrompt} [${STR.interact}]`, () => {
        if (this.wineDay === g.dayNum) { g.ui.toast(STR.fridgeEmpty); g.audio.sDeny(); return; }
        if (!p.inv.add("wine", 1)) return g.ui.toast(STR.inventoryFull);
        this.wineDay = g.dayNum;
        g.audio.sChest();
        g.ui.toast(STR.fridgeWine);
        g.ui.renderHotbar(p.inv);
      });
    }
    if (w.farmCraft) {
      const s = w.farmCraft;
      consider(s.x, s.z, s.y + 0.6, `${STR.useCraft} [${STR.interact}]`, () => g.openCrafting());
    }
    if (w.dirkChest) {
      const c = w.dirkChest;
      consider(c.x, c.z, c.y + 0.4, `${STR.dirkChestTitle} [${STR.interact}]`, () => {
        if (this.trusted) g.openStorage(this.storage, STR.dirkChestTitle);
        else { g.ui.toast(STR.dirkChestLocked); g.audio.sDeny(); }
      });
    }
    if (!g.sitting) {
      for (const s of w.farmSeats || []) {
        consider(s.x, s.z, s.y + 0.4, `${s.kind === "chair" ? STR.farmSitChair : STR.farmSitDown} [${STR.interact}]`, () => {
          g.seat = s;
          g.sitting = true;
          p.vel.set(0, 0, 0);
          p.yaw = s.yaw;
        });
      }
    }
  }

  // ---------- actions ----------
  // update 31: up and down the loft ladder. A ladder cannot be a height field like
  // the staircase is, so the climb is the interaction itself — you step off beside
  // the hatch, never into it.
  climbLadder(dir) {
    const g = this.g, p = g.player, L = g.world.farmLadder;
    if (!L) return;
    p.pos.set(L.land.x, (dir > 0 ? L.topY : L.y) + 0.05, L.land.z);
    p.vel.set(0, 0, 0);
    g.audio.s3("ladder", 1, 0, 10, 0.9, () => g.audio.sChest());
    g.ui.toast(dir > 0 ? STR.atticUp : STR.atticDown);
  }

  drinkTap(t) {
    const g = this.g, p = g.player;
    g.audio.s3("tap", 1, 0, 10, 0.9, () => g.audio.sDrink());
    if (p.en >= 100) { g.ui.toast(STR.tapFullEnergy); return; }
    p.en = Math.min(100, p.en + FA.tap.energy);
    g.ui.toast(STR.tapDrink);
  }

  milk(c) {
    const g = this.g, inv = g.player.inv;
    if (!inv.has("bowl")) { g.ui.toast(STR.cowMilkNeedBowl); g.audio.sDeny(); return; }
    inv.removeOne("bowl");
    if (!inv.add("bowl_milk", 1)) g.spawnDrop("bowl_milk", 1, g.player.pos.x, g.player.pos.z, g.world.groundHeight(g.player.pos.x, g.player.pos.z, g.player.pos.y));
    const d = c.distToPlayer();
    g.audio.s3("milk", d, 0, 12, 0.9, () => g.audio.sDrink());
    g.ui.toast(STR.cowMilked);
    g.ui.renderHotbar(inv);
  }

  pickBush(b) {
    const g = this.g, p = g.player;
    if (!p.inv.add("blueberries", 1)) return g.ui.toast(STR.inventoryFull);
    b.ripe = false; b.t = 0;
    this.setBerries(b, false);
    g.audio.s3("berry", 1, 0, 10, 0.9, () => g.audio.sPickup());
    g.ui.renderHotbar(p.inv);
    if (this.helping) this.ducoQueue.push(g.time + FA.ducoPickDelay + g.rng() * 1.5);
  }

  giveYogurt() {
    const g = this.g, p = g.player, inv = p.inv;
    const sel = inv.selected();
    if (!sel || sel.id !== "bowl_yogurt_blueberries") return;
    inv.consumeSelected();
    if (!inv.add("bowl", 1)) g.spawnDrop("bowl", 1, p.pos.x, p.pos.z, g.world.groundHeight(p.pos.x, p.pos.z, p.pos.y));
    const b = this.duco.body;
    const d = Math.hypot(p.pos.x - b.position.x, p.pos.z - b.position.z);
    g.audio.s3("dogHappy", d, 0, 20, 1, () => g.audio.sChicken());
    setTimeout(() => this.bark(), 900);
    this.duco.happyT = 3.5;
    if (p.en < 100) {
      p.en = 100;
      g.ui.toast(STR.ducoEnergy);
    } else {
      this.helping = true;
      g.ui.toast(STR.ducoHelps);
      this.helperText();
    }
    g.ui.renderHotbar(inv);
  }

  // ---------- panels ----------
  openDirk() {
    const g = this.g;
    const s = g.npcPanel(STR.dirkTitle, STR.dirkLines, [["dAsk", STR.dirkAskFarm], ["dShop", STR.dirkShopBtn]]);
    s.querySelector("#dAsk").addEventListener("click", () => {
      const s2 = g.npcPanel(STR.dirkTitle, STR.dirkFarmLines);
      g.backToMain(s2, () => this.openDirk());
    });
    s.querySelector("#dShop").addEventListener("click", () => this.openShop());
    g.ui.refreshNav();
  }

  openShop() {
    const g = this.g, inv = g.player.inv;
    const have = (id) => inv.slots.reduce((n, sl) => n + (sl && sl.id === id ? sl.count : 0), 0);
    const eligibleScroll = () => !g.learned.has("yogurt") && !inv.has("scroll_yogurt");
    const rows = FA.shop.map((r, i) => {
      if (r.egg && !eligibleScroll()) return "";
      const cost = r.egg ? STR.dirkEggPrice
        : Object.entries(r.cost).map(([id, n]) => `${n}× ${STR.items[id]?.name || id}`).join(", ");
      return `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 0;border-bottom:1px solid #2c332a">
        <div style="display:flex;align-items:center;gap:10px;text-align:left">
          <span class="slot" style="width:40px;height:40px;flex:none;background-image:url(${iconUrl(r.id)})"></span>
          <div><b>${r.n > 1 ? r.n + "× " : ""}${STR.items[r.id]?.name || r.id}</b>
          <div class="sub" style="margin:2px 0 0">${STR.dirkFor} ${cost}</div></div></div>
        <button data-si="${i}" style="font-size:13px;padding:7px 16px;flex:none">${STR.dirkBuyBtn}</button></div>`;
    }).join("");
    const s = g.panelShell(STR.dirkShopTitle, `<p class="sub">${STR.dirkShopHint}</p>${rows}<p class="sub" id="shopMsg"></p>`);
    const refresh = () => {
      s.querySelectorAll("button[data-si]").forEach((btn) => {
        const r = FA.shop[+btn.dataset.si];
        const ok = r.egg ? true : Object.entries(r.cost).every(([id, n]) => have(id) >= n);
        btn.disabled = !ok; btn.style.opacity = ok ? 1 : 0.45;
      });
      g.ui.refreshNav();
    };
    s.querySelectorAll("button[data-si]").forEach((btn) => btn.addEventListener("click", () => {
      const r = FA.shop[+btn.dataset.si];
      const msg = s.querySelector("#shopMsg");
      if (r.egg) {
        if (!eligibleScroll()) { msg.textContent = STR.dirkScrollKnown; g.audio.sDeny(); return; }
        if (!g.carriedEgg) { msg.textContent = STR.dirkEggNeeded; g.audio.sDeny(); return; }
        g.carriedEgg = false;
        if (g.mother) g.mother.returning = true;
        if (!inv.add("scroll_yogurt", 1)) g.spawnDrop("scroll_yogurt", 1, g.player.pos.x, g.player.pos.z, g.world.groundHeight(g.player.pos.x, g.player.pos.z, g.player.pos.y));
        this.trusted = true;
        g.audio.sPickup();
        g.ui.renderHotbar(inv);
        btn.closest("div").remove();   // the row itself — the panel body (and the message line) stays
        msg.textContent = STR.dirkScrollBought;
        refresh();
        return;
      }
      if (!Object.entries(r.cost).every(([id, n]) => have(id) >= n)) { msg.textContent = STR.dirkNoGoods; g.audio.sDeny(); return; }
      for (const [id, n] of Object.entries(r.cost)) for (let k = 0; k < n; k++) inv.removeOne(id);
      let yieldN = r.n || 1;
      while (yieldN-- > 0) {
        if (!inv.add(r.id, 1)) g.spawnDrop(r.id, 1, g.player.pos.x, g.player.pos.z, g.world.groundHeight(g.player.pos.x, g.player.pos.z, g.player.pos.y));
      }
      g.audio.sPickup();
      msg.textContent = `${STR.dirkSold}: ${r.n > 1 ? r.n + "× " : ""}${STR.items[r.id].name}`;
      g.ui.renderHotbar(inv);
      refresh();
    }));
    g.backToMain(s, () => this.openDirk());
    refresh();
  }

  openCrate() {
    const g = this.g, inv = g.player.inv, cap = FA.crate.cap;
    const s = g.panelShell(STR.crateTitle, `
      <p class="sub">${STR.crateHint}</p>
      <p id="crN" style="font-size:18px;color:#c8d0ff;margin:10px"></p>
      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
        <button id="crStore" style="font-size:14px;padding:9px 20px">${STR.crateStoreAll}</button>
        <button id="crTen" style="font-size:14px;padding:9px 20px">${STR.crateTake10}</button>
        <button id="crAll" style="font-size:14px;padding:9px 20px">${STR.crateTakeAll}</button>
      </div>
      <p class="sub" id="crMsg"></p>`);
    const count = () => inv.slots.reduce((n, sl) => n + (sl && sl.id === "blueberries" ? sl.count : 0), 0);
    const msg = (t) => { s.querySelector("#crMsg").textContent = t; };
    const refresh = () => {
      s.querySelector("#crN").textContent = `${STR.crateCount}: ${this.crate} / ${cap}`;
      s.querySelector("#crStore").disabled = count() === 0 || this.crate >= cap;
      s.querySelector("#crTen").disabled = this.crate === 0;
      s.querySelector("#crAll").disabled = this.crate === 0;
      for (const id of ["crStore", "crTen", "crAll"]) { const b = s.querySelector("#" + id); b.style.opacity = b.disabled ? 0.45 : 1; }
      this.helperText();
      g.ui.refreshNav();
    };
    const take = (k) => {
      let n = 0;
      while (n < k && this.crate > 0 && inv.add("blueberries", 1)) { this.crate--; n++; }
      if (n === 0) { msg(this.crate === 0 ? STR.crateEmptyMsg : STR.cratePackFull); g.audio.sDeny(); }
      else { msg(`${STR.items.blueberries.name} × ${n}`); g.audio.sPickup(); }
      g.ui.renderHotbar(inv);
      refresh();
    };
    s.querySelector("#crStore").addEventListener("click", () => {
      const room = cap - this.crate, has = count();
      if (has === 0) { msg(STR.crateNoBerries); g.audio.sDeny(); return; }
      if (room <= 0) { msg(STR.crateFull); g.audio.sDeny(); return; }
      const n = Math.min(room, has);
      for (let i = 0; i < n; i++) inv.removeOne("blueberries");
      this.crate += n;
      msg(`+${n}`);
      g.audio.sChest();
      g.ui.renderHotbar(inv);
      refresh();
    });
    s.querySelector("#crTen").addEventListener("click", () => take(10));
    s.querySelector("#crAll").addEventListener("click", () => take(cap));
    refresh();
  }

  // ---------- day/night hooks ----------
  onNightfall() {
    const g = this.g;
    if (this.helping) this.endHelp();
    // some nights a werewolf comes for the cows
    const alive = this.cows.filter((c) => !c.dead);
    if (this.raidWolf && alive.length && g.rng() < FA.raidChance) {
      const rw = this.raidWolf;
      rw.dead = false; rw.hp = rw.maxHp; rw.respawnT = 1e9;
      rw.group.visible = true; rw.group.rotation.z = 0;
      rw.pos.set(rw.spawn.x, 0, rw.spawn.z);
      rw.raid = { cow: alive[Math.floor(g.rng() * alive.length)], phase: "go", t: 0 };
      rw.state = "raid";
      if (this.duco) setTimeout(() => this.bark(), 1500);
    }
  }
  onMorning() {
    for (const c of this.cows) c.shedSpot = null;
  }
}
