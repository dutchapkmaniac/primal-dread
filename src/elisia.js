// update 35: Elisia — the angel of the forest.
//
// Once per full day, while you walk the forest, she is put down 40-70 m away,
// out of your sight, and you simply find her standing there. Coming closer
// brings a mist that thickens toward her. Within 18 m, with a clear line of
// sight (a thick tree hides you), she sees you and one of two things happens,
// each as likely as the other: she walks to you and kisses you — every bar to
// 100%, a T-Rex dagger and a bottle of holy water — then smiles and rises into
// the sky; or the mist turns grey and she becomes her nine-foot dark form,
// which claws, spits red fire, and can only be hurt by a T-Rex's tooth — a live
// T-Rex's bite, or the dagger. A T-Rex that is near her takes your side.
//
// She is ONE Creature of type "elisia" (entities.js) whose body is swapped for
// the dark form; this module holds everything that is hers alone: the daily
// placement, her state machine, the mist, the kiss cinematic and the fireballs.
import * as THREE from "three";
import { CFG } from "./config.js";
import { STR } from "../strings.js";
import { Creature } from "./entities.js";
import { ClipAnimator } from "./skeletal.js";
import { clone as skeletonClone } from "three/addons/utils/SkeletonUtils.js";

const E = () => CFG.elisia;
const norm = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

export class ElisiaSystem {
  constructor(game) {
    this.g = game;
    this.day = 0;          // the day she was last put down on
    this.c = null;         // her Creature while she is in the world
    this.mist = 0;         // 0..1: how much of her mist is on
    this.mistD = 999;      // her last known distance (the mist fades from there)
    this.grey = false;     // the dark form's mist
    this.fireballs = [];
    this.cine = null;      // the kiss cinematic, while it runs
    this._glow = null;
  }

  // the dark form, while she lives — what a T-Rex turns on
  evilTarget() {
    const c = this.c;
    return c && !c.dead && !c.gone && c.state === "evil" ? c : null;
  }

  // ---------- update 36: ONE spot, anywhere in the forest, until an encounter finishes ----------
  // She is put down at game start at a random forest spot and stays there, day
  // and night, until you meet her: the kiss and the ascent, or the dark form's
  // death or yours. Only then does she get a new random spot, at once, out of
  // your view. Seeing her from a distance changes nothing.
  update(dt) {
    const g = this.g;
    if (this.c && this.c.gone) this.c = null;
    if (!this.c && g.assets.glb.elisia) this.place();
    this.updateFireballs(dt);
  }

  place() {
    const g = this.g, p = g.player, w = g.world, S = CFG.world.square - 12;
    const fwd = new THREE.Vector3(0, 0, -1);
    if (g.camera) g.camera.getWorldDirection(fwd);
    const far = (g.scene && g.scene.fog ? g.scene.fog.far : 150) + 20;
    for (let i = 0; i < 400; i++) {
      const x = (g.rng() * 2 - 1) * S, z = (g.rng() * 2 - 1) * S;
      const d = Math.hypot(x - p.pos.x, z - p.pos.z);
      // never where you could see it happen: beyond the fog, or behind you
      if (d < 40) continue;
      if (d < far && (x - p.pos.x) * fwd.x + (z - p.pos.z) * fwd.z > 0) continue;
      if (!w.inForest(x, z)) continue;
      if (w.treesNear(x, z).some((t) => Math.hypot(x - t.x, z - t.z) < t.r + 1.5)) continue;
      if (w.boxes.some((b) => x > b.minX - 1 && x < b.maxX + 1 && z > b.minZ - 1 && z < b.maxZ + 1)) continue;
      const c = new Creature("elisia", g.assets.glb.elisia, x, z, g.ctx);
      c.state = "stand"; c.stateT = 0;
      g.creatures.push(c);
      this.c = c; this.day = g.dayNum; this.grey = false;
      return c;
    }
    return null;
  }

  onMorning() {
    // update 36: a new day changes nothing — she waits where she stands
  }

  onPlayerDeath() {
    if (this.c) { this.c.gone = true; this.c = null; }
    this.cine = null; this.grey = false;
    for (const f of this.fireballs) this.g.scene.remove(f.mesh);
    this.fireballs.length = 0;
    if (this.g.huntTarget && this.g.huntTarget.type === "elisia") this.g.huntTarget = null;
  }

  // ---------- her state machine (called from Creature.updateElisia) ----------
  drive(c, dt) {
    const g = this.g, p = g.player, w = g.world, C = E();
    const dx = p.pos.x - c.pos.x, dz = p.pos.z - c.pos.z, d = Math.hypot(dx, dz);
    this.mistD = d;
    const face = (rate) => {
      const dy = norm(Math.atan2(dx, dz) - c.yaw);
      c.yaw += Math.max(-rate * dt, Math.min(rate * dt, dy));
    };
    switch (c.state) {
      case "stand":
        if (d < 25) face(1.5);
        if (d < C.seeR && !w.losBlocked(c.pos.x, c.pos.z, p.pos.x, p.pos.z)) {
          // she has seen you. Fifty-fifty, decided now and not before.
          c.stateT = 0;
          if (g.rng() < 0.5) c.state = "approach";
          else {
            c.state = "transform";
            this.grey = true;
            g.ui.bless("dark");
            g.ui.toast(STR.elisiaEvil);
            g.audio.play("howl", { vol: 1 });
            g.ui.shake(1.4);
          }
        }
        break;
      case "approach":
        if (d > 1.7) c.moveToward(p.pos.x, p.pos.z, C.speed, dt);
        else {
          c.state = "kiss"; c.stateT = 0;
          this.cine = { t: 0, kissed: false, gifted: false, yaw0: p.yaw, pitch0: p.pitch };
        }
        break;
      case "kiss":
        face(4);   // the cinematic does the rest
        break;
      case "ascend":
        c.liftY = (c.liftY || 0) + 2.5 * dt;
        this.fadeBody(c, Math.max(0, 1 - c.stateT / 3));
        if (c.stateT > 3) c.gone = true;
        break;
      case "transform":
        face(4);
        if (c.stateT > 1.2) this.becomeEvil(c);
        break;
      case "evil":
        this.driveEvil(c, dt, d, dx, dz);
        break;
      default:
        c.state = "stand";
    }
  }

  driveEvil(c, dt, d, dx, dz) {
    const g = this.g, p = g.player, w = g.world, C = E();
    c.atkT -= dt;
    c.fireT = (c.fireT || 0) - dt;
    // a T-Rex within reach is fought first — it is the only thing that can hurt her
    let foe = null, fd = 1e9;
    for (const t of g.creatures) {
      if (t.type !== "trex" || t.dead) continue;
      const td = Math.hypot(t.pos.x - c.pos.x, t.pos.z - c.pos.z);
      if (td < 6 && td < fd) { foe = t; fd = td; }
    }
    if (foe) {
      const reach = C.claw.range + foe.cfg.height * 0.3;
      c.moveToward(foe.pos.x, foe.pos.z, fd > reach ? C.chaseSpeed : 0, dt);
      if (fd <= reach && c.atkT <= 0) {
        c.atkT = C.claw.cd; c.lungeT = 0.4;
        if (c.anim) c.anim.playAttack();
        g.audio.sGrowl();
        foe.hp -= C.clawTrex;
        if (foe.hp <= 0) foe.die(g);
      }
      return;
    }
    // safe zones are safe: she holds off, paces, and waits for you to come out
    if (w.isSafe(p.pos.x, p.pos.z, p.pos.y)) {
      if (d > 5) {
        const k = 1 - 4.5 / d;
        c.moveToward(c.pos.x + dx * k, c.pos.z + dz * k, C.chaseSpeed, dt);
      } else {
        const dy = norm(Math.atan2(dx, dz) - c.yaw);
        c.yaw += Math.max(-3 * dt, Math.min(3 * dt, dy));
      }
      return;
    }
    if (d > C.claw.range * 0.8) c.moveToward(p.pos.x, p.pos.z, C.chaseSpeed, dt);
    else {
      const dy = norm(Math.atan2(dx, dz) - c.yaw);
      c.yaw += Math.max(-4 * dt, Math.min(4 * dt, dy));
    }
    if (d < C.claw.range && c.atkT <= 0 && p.pos.y < c.group.position.y + 3) {
      c.atkT = C.claw.cd; c.lungeT = 0.4;
      if (c.anim) c.anim.playAttack();
      g.audio.sGrowl();
      p.damage(C.claw.dmg, "elisia", c.pos);
    }
    if (d >= C.fire.minR && d <= C.fire.maxR && c.fireT <= 0
        && !w.losBlocked(c.pos.x, c.pos.z, p.pos.x, p.pos.z)) {
      c.fireT = C.fire.cd;
      if (c.anim) c.anim.playAttack();
      this.spitFire(c);
    }
  }

  becomeEvil(c) {
    const g = this.g, a = g.assets.glb.elisia_evil, C = E();
    c.form = "evil"; c.state = "evil"; c.stateT = 0;
    c.cfg.height = C.evilHeight;
    c.group.remove(c.body);
    if (a) {
      c.body = skeletonClone(a.model);
      c.anim = a.anims && a.anims.length ? new ClipAnimator(c.body, a.anims) : null;
      c.rigged = null;
    } else {
      c.body.scale.multiplyScalar(C.evilHeight / C.height);   // no dark model: she simply grows
    }
    c.group.add(c.body);
    delete c.group.userData.fogMeshes;   // cullView caches the meshes it toggles
    delete c.group.userData.fogShow;
    c.hp = c.maxHp = C.hp;
    c.atkT = 0.8; c.fireT = 1.5;
    g.huntTarget = c;
    g.ui.shake(1.2);
  }

  fadeBody(c, k) {
    if (!c._faded) {
      // normalizeModel forces every material opaque and skeletonClone SHARES
      // materials between clones — so clone hers once before fading
      c._faded = true;
      c.body.traverse((o) => {
        if (!(o.isMesh || o.isSkinnedMesh) || !o.material) return;
        o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
        for (const m of [].concat(o.material)) m.transparent = true;
      });
    }
    c.body.traverse((o) => { if (o.material) for (const m of [].concat(o.material)) m.opacity = k; });
  }

  // ---------- the kiss: a 2.2 s cinematic (runs from Game.step) ----------
  updateCinematic(dt) {
    const g = this.g, p = g.player, c = this.c, K = this.cine;
    if (!c || c.gone || c.dead) { this.cine = null; return; }
    K.t += dt;
    p.vel.set(0, 0, 0);
    const eyeY = p.pos.y + CFG.player.height;
    const faceY = c.group.position.y + c.cfg.height * 0.9;
    const ddx = c.pos.x - p.pos.x, ddz = c.pos.z - p.pos.z, dd = Math.hypot(ddx, ddz) || 1;
    const yawT = Math.atan2(-ddx, -ddz), pitchT = Math.atan2(faceY - eyeY, dd);
    const k = Math.min(1, K.t / 0.6), ease = k * k * (3 - 2 * k);
    p.yaw = K.yaw0 + norm(yawT - K.yaw0) * ease;
    p.pitch = K.pitch0 + (pitchT - K.pitch0) * ease;
    if (g.camera) {
      g.camera.position.set(p.pos.x, eyeY, p.pos.z);
      g.camera.rotation.set(p.pitch, p.yaw, 0, "YXZ");
    }
    if (!K.kissed && K.t >= 0.6) {
      K.kissed = true;
      g.ui.bless("gold");
      g.ui.toast(STR.elisiaKiss);
      g.audio.sHeart();
      p.hp = 100; p.en = 100; p.hu = 100;
      if (g.drunkT > 0) { g.drunkT = 0; g.ui.setDrunk(0); }
    }
    if (!K.gifted && K.t >= 1.4) {
      K.gifted = true;
      for (const id of ["trex_dagger", "holy_water"]) {
        if (!p.inv.add(id, 1)) g.spawnDrop(id, 1, c.pos.x, c.pos.z, g.world.groundHeight(c.pos.x, c.pos.z, c.group.position.y + 1));
      }
      g.ui.renderHotbar(p.inv);
      g.audio.sPickup();
      g.ui.toast(STR.elisiaGift);
    }
    if (K.t >= 2.2) {
      this.cine = null;
      c.state = "ascend"; c.stateT = 0; c.liftY = 0;
      g.ui.toast(STR.elisiaRise);
    }
  }

  // ---------- the mist (applied every frame AFTER world.updateEnv) ----------
  applyMist(dt) {
    const g = this.g, fog = g.scene && g.scene.fog;
    if (!fog) return;
    const c = this.c, on = !!(c && !c.gone && !c.dead);
    if (on) this.mistD = Math.hypot(c.pos.x - g.player.pos.x, c.pos.z - g.player.pos.z);
    const d = this.mistD;
    const target = on ? Math.max(0, 1 - d / E().mistR) : 0;
    const rate = target > this.mist ? 2 : 0.35;
    this.mist += Math.max(-rate * dt, Math.min(rate * dt, target - this.mist));
    if (this.mist < 0.002) { this.mist = 0; return; }
    const m = this.mist;
    fog.near += (3.5 - fog.near) * m;
    // she must stay inside it: cullView hides bodies past fog.far + 12
    fog.far += (Math.max(24, d + 16) - fog.far) * m;
    const col = new THREE.Color(this.grey ? 0x55585c : 0xdfe3e6);
    fog.color.lerp(col, m);
    if (g.scene.background && g.scene.background.isColor) g.scene.background.lerp(col, m);
  }

  // ---------- red fire ----------
  glowTex() {
    if (this._glow !== null) return this._glow;
    try {
      const cnv = document.createElement("canvas");
      cnv.width = cnv.height = 64;
      const ctx = cnv.getContext("2d");
      const gr = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
      gr.addColorStop(0, "rgba(255,240,200,1)");
      gr.addColorStop(0.35, "rgba(255,120,40,0.7)");
      gr.addColorStop(1, "rgba(255,40,10,0)");
      ctx.fillStyle = gr; ctx.fillRect(0, 0, 64, 64);
      this._glow = new THREE.CanvasTexture(cnv);
    } catch (e) { this._glow = false; }
    return this._glow;
  }

  spitFire(c) {
    const g = this.g, p = g.player, C = E().fire;
    const from = new THREE.Vector3(c.pos.x + Math.sin(c.yaw) * 0.6, c.group.position.y + c.cfg.height * 0.72, c.pos.z + Math.cos(c.yaw) * 0.6);
    // aimed at where you ARE, not where you will be — step aside and it misses
    const to = new THREE.Vector3(p.pos.x, p.pos.y + 1.1, p.pos.z);
    const vel = to.sub(from).normalize().multiplyScalar(C.speed);
    const mesh = new THREE.Group();
    mesh.add(new THREE.Mesh(new THREE.SphereGeometry(C.r, 12, 10), new THREE.MeshBasicMaterial({ color: 0xff3a10 })));
    const tex = this.glowTex();
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex || null, color: 0xff5020, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.95 }));
    glow.scale.setScalar(C.r * 5);
    mesh.add(glow);
    mesh.add(new THREE.PointLight(0xff4010, 3, 9));
    mesh.position.copy(from);
    g.scene.add(mesh);
    this.fireballs.push({ mesh, vel, t: 0, burst: 0 });
    g.audio.noise(0.25, 1800, 0.35, "lowpass");
  }

  updateFireballs(dt) {
    const g = this.g, p = g.player, w = g.world, C = E().fire;
    for (let i = this.fireballs.length - 1; i >= 0; i--) {
      const f = this.fireballs[i];
      if (f.burst > 0) {
        f.burst -= dt;
        const k = 1 - Math.max(0, f.burst) / 0.35;
        f.mesh.scale.setScalar(1 + k * 2);
        for (const o of f.mesh.children) if (o.material) o.material.opacity = 1 - k;
        if (f.burst <= 0) { g.scene.remove(f.mesh); this.fireballs.splice(i, 1); }
        continue;
      }
      f.t += dt;
      f.vel.y -= C.gravity * dt;
      f.mesh.position.addScaledVector(f.vel, dt);
      const P = f.mesh.position;
      let stop = false;
      if (Math.hypot(P.x - p.pos.x, P.z - p.pos.z) < CFG.player.radius + C.r
          && P.y > p.pos.y - 0.2 && P.y < p.pos.y + CFG.player.height + 0.2) {
        p.damage(C.dmg, "elisia", P);
        stop = true;
      }
      if (!stop) stop = P.y <= w.groundHeight(P.x, P.z, P.y) + 0.05 || f.t > 6;
      if (!stop) for (const t of w.treesNear(P.x, P.z)) {
        if (Math.hypot(P.x - t.x, P.z - t.z) < t.r * 0.7 && P.y < 14) { stop = true; break; }
      }
      if (!stop) for (const b of w.boxes) {
        if (P.x > b.minX && P.x < b.maxX && P.z > b.minZ && P.z < b.maxZ && P.y > b.minY && P.y < b.maxY) { stop = true; break; }
      }
      if (stop) {
        f.burst = 0.35;
        f.vel.set(0, 0, 0);
        for (const o of f.mesh.children) if (o.material) o.material.transparent = true;
      }
    }
  }
}
