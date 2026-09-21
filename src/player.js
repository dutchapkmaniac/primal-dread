import * as THREE from "three";
import { CFG } from "./config.js";
import { STR } from "../strings.js";
import { Inventory } from "./items.js";

export class Player {
  constructor(camera, ctx) {
    this.camera = camera;
    this.ctx = ctx;
    const P = CFG.player;
    this.pos = new THREE.Vector3(CFG.ruin.spawn[0], 0, CFG.ruin.spawn[1]); // the alcove, by the campfire
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0; // facing the safe-room doorway
    this.hp = P.hp; this.en = P.en; this.hu = P.hu;
    this.th = 100; this.thirstZero = false;   // update 36: thirst — only the desert touches it
    this.sneak = false; this.sprinting = false;
    this.onGround = true;
    this.inv = new Inventory();
    this.inv.add("apple", 1);
    this.atkT = 0; this.stepT = 0; this.heartT = 0; this.starveWarned = false;
    this.dead = false;
    this.buildViewmodel();
  }

  // mount a GENERATED held-item GLB in front of the camera (update 8: every
  // item has its own design — the knife and machete finally look different)
  mountHeld(id) {
    const glb = this.ctx.assets && this.ctx.assets.glb;
    const a = glb && glb[id];
    const H = CFG.held[id];
    if (!a || !H) return null;
    const g = new THREE.Group();
    const m = a.model.clone();
    // H.s is the item's REAL length in meters — scale by the longest side
    const bb0 = new THREE.Box3().setFromObject(m);
    const sz = new THREE.Vector3(); bb0.getSize(sz);
    m.scale.multiplyScalar(H.s / Math.max(sz.x, sz.y, sz.z));
    const bb = new THREE.Box3().setFromObject(m);
    const ctr = new THREE.Vector3(); bb.getCenter(ctr);
    m.position.sub(ctr);
    // held items read as silhouettes without a fill — let the texture glow a little
    m.traverse((o) => {
      if (o.isMesh && o.material && o.material.map) {
        o.material = o.material.clone();
        o.material.emissive = new THREE.Color(0xffffff);
        o.material.emissiveMap = o.material.map;
        o.material.emissiveIntensity = 0.38;
      }
    });
    g.add(m);
    g.position.set(H.pos[0], H.pos[1], H.pos[2]);
    g.rotation.set(H.rot[0], H.rot[1], H.rot[2]);
    g.userData.base = { y: H.pos[1], z: H.pos[2], rx: H.rot[0] };
    g.visible = false;
    this.camera.add(g);
    return g;
  }

  buildViewmodel() {
    // low-poly knife fallback — also the silver dagger's held look
    const g = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.05, 0.22),
      new THREE.MeshStandardMaterial({ color: 0x9aa0a2, roughness: 0.35, metalness: 0.7 }));
    blade.position.z = -0.16;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.07, 4),
      blade.material);
    tip.rotation.x = -Math.PI / 2; tip.rotation.y = Math.PI / 4;
    tip.position.z = -0.30;
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, 0.02),
      new THREE.MeshStandardMaterial({ color: 0x2a2c2e, roughness: 0.8 }));
    guard.position.z = -0.045;
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.024, 0.11, 6),
      new THREE.MeshStandardMaterial({ color: 0x8a5a2c, roughness: 1 }));
    grip.rotation.x = Math.PI / 2;
    grip.position.z = 0.02;
    g.add(blade, tip, guard, grip);
    g.position.set(0.26, -0.22, -0.45);
    g.rotation.y = -0.15;
    g.visible = false;
    g.userData.base = { y: -0.22, z: -0.45, rx: 0 };
    this.knifeVm = g;
    this.camera.add(g);
    // the generated designs (fall back to the procedural knife when missing)
    this.knife3dVm = this.mountHeld("knife3d");
    this.machete3dVm = this.mountHeld("machete3d");
    this.axe3dVm = this.mountHeld("axe3d");
    this.dagger3dVm = this.mountHeld("dagger3d");   // the silver dagger's REAL design
    this.trexDagger3dVm = this.mountHeld("trexdagger3d");   // update 38: the generated tooth daggers
    this.impDagger3dVm = this.mountHeld("impdagger3d");
    this.etDagger3dVm = this.mountHeld("etdagger3d");   // update 39: the Eternial weapons
    this.etSword3dVm = this.mountHeld("etsword3d");
    this.etSpear3dVm = this.mountHeld("etspear3d");
    this.crossbowVm = this.mountHeld("crossbow3d"); // the crossbow (update 27)
    // update 35: the T-Rex dagger — a curved tooth for a blade, brass guard, leather grip
    {
      const td = new THREE.Group();
      const ivory = new THREE.MeshStandardMaterial({ color: 0xe8dcc4, roughness: 0.55 });
      const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.30, 7), ivory);
      tooth.rotation.x = -Math.PI / 2; tooth.position.set(0, 0.015, -0.19);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.017, 0.12, 7), ivory);   // the tooth curves upward at the tip
      tip.rotation.x = -Math.PI / 2 + 0.5; tip.position.set(0, 0.06, -0.335);
      const tguard = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.007, 6, 14),
        new THREE.MeshStandardMaterial({ color: 0xb8902e, roughness: 0.45, metalness: 0.25 }));
      tguard.position.z = -0.04;
      const tgrip = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.024, 0.12, 8),
        new THREE.MeshStandardMaterial({ color: 0x4a3324, roughness: 1 }));
      tgrip.rotation.x = Math.PI / 2; tgrip.position.z = 0.03;
      td.add(tooth, tip, tguard, tgrip);
      td.position.set(0.26, -0.22, -0.45);
      td.rotation.y = -0.15;
      td.visible = false;
      td.userData.base = { y: -0.22, z: -0.45, rx: 0 };
      this.trexDaggerVm = td;
      this.camera.add(td);
    }
    // the bound spear: a knife blade lashed to a long shaft (update 11)
    const sp = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.021, 1.15, 6),
      new THREE.MeshStandardMaterial({ color: 0x6e5636, roughness: 1 }));
    shaft.rotation.x = Math.PI / 2;
    const sBlade = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.16, 4),
      new THREE.MeshStandardMaterial({ color: 0x9aa0a2, roughness: 0.35, metalness: 0.7 }));
    sBlade.rotation.x = -Math.PI / 2; sBlade.rotation.y = Math.PI / 4;
    sBlade.position.z = -0.65;
    const lash = new THREE.Mesh(new THREE.CylinderGeometry(0.027, 0.027, 0.07, 6),
      new THREE.MeshStandardMaterial({ color: 0xa08a5c, roughness: 1 }));
    lash.rotation.x = Math.PI / 2;
    lash.position.z = -0.55;
    sp.add(shaft, sBlade, lash);
    sp.position.set(0.3, -0.26, -0.42);
    sp.rotation.set(0.1, -0.12, 0);
    sp.userData.base = { y: -0.26, z: -0.42, rx: 0.1 };
    sp.visible = false;
    this.spearVm = sp;
    this.camera.add(sp);
    // the carried T-Rex egg, hugged in front of you
    const egg = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 9),
      new THREE.MeshStandardMaterial({ color: 0xcfc0a0, roughness: 0.7 }));
    egg.scale.y = 1.3;
    egg.position.set(0, -0.32, -0.5);
    egg.visible = false;
    this.eggVm = egg;
    this.camera.add(egg);
  }

  noiseRadius() {
    const P = CFG.player;
    const moving = this.vel.lengthSq() > 0.4;
    if (!moving) return P.noiseR.sneak;
    if (this.sprinting) return P.noiseR.sprint;
    if (this.sneak) return P.noiseR.sneak;
    return P.noiseR.walk;
  }

  damage(amount, source, fromPos) {
    if (this.dead) return;
    this.hp = Math.max(0, this.hp - amount);
    this.ctx.audio.sHurt();
    this.ctx.ui.hurtFlash();
    this.ctx.ui.shake(1.0);
    if (fromPos) {
      // knockback away from the source
      const dx = this.pos.x - fromPos.x, dz = this.pos.z - fromPos.z;
      const d = Math.hypot(dx, dz) || 1;
      this.vel.x += (dx / d) * 6; this.vel.z += (dz / d) * 6;
      this.vel.y = 2.2;
      this.onGround = false;
    }
    if (this.hp <= 0) this.ctx.onDeath(source);
  }

  heal(x) { this.hp = Math.min(100, this.hp + x); }

  update(dt, input, game) {
    if (this.dead) return;
    const P = CFG.player;
    const w = game.world;

    // look (mouse/touch drag + Q/E key turning)
    this.yaw -= input.look.dx * 0.0023;
    this.yaw += (input.turn || 0) * 2.7 * dt;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - input.look.dy * 0.0023));
    input.look.dx = input.look.dy = 0;
    // drunk: the world sways and your feet don't quite obey
    if (game.drunkT > 0) {
      this.yaw += Math.sin(game.time * 1.7) * 0.5 * dt;
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch + Math.sin(game.time * 2.4) * 0.12 * dt));
    }

    // stance — carrying the T-Rex egg forbids running
    this.sneak = input.sneak;
    const wantSprint = input.sprint && input.move.z < -0.1 && !this.sneak && !game.carriedEgg;
    if (wantSprint && this.en > P.sprintMin) this.sprinting = true;
    else if (this.sprinting && (!wantSprint || this.en <= 0.5)) this.sprinting = false;
    if (input.sprint && this.en <= P.sprintMin && !this.sprinting && !this._tiredMsg) {
      this._tiredMsg = true; game.ui.toast(STR.tooTired);
      setTimeout(() => (this._tiredMsg = false), 3000);
    }

    const drunk = game.drunkT > 0;
    const speed = this.sprinting ? P.sprint * (drunk ? CFG.wine.speedMult : 1) : this.sneak ? P.sneak : P.walk;

    // camera-relative movement
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const mx = input.move.x * cos + input.move.z * sin;
    const mz = input.move.z * cos - input.move.x * sin;
    const ml = Math.hypot(mx, mz) || 1;
    const tx = (ml > 1 ? mx / ml : mx) * speed;
    const tz = (ml > 1 ? mz / ml : mz) * speed;
    const acc = this.onGround ? P.accel : P.accel * P.airControl;
    this.vel.x += (tx - this.vel.x) * Math.min(1, acc * dt / 4);
    this.vel.z += (tz - this.vel.z) * Math.min(1, acc * dt / 4);

    // jump + gravity
    const groundY = w.groundHeight(this.pos.x, this.pos.z, this.pos.y);
    if (input.jump && this.onGround) {
      if (this.en >= P.jumpCost) {
        this.vel.y = P.jumpVel;
        this.onGround = false;
        this.en -= P.jumpCost;
      } else game.ui.toast(STR.tooTiredJump);
      input.jump = false;
    }
    this.vel.y -= P.gravity * dt;
    this.pos.y += this.vel.y * dt;
    if (this.pos.y <= groundY) {
      this.pos.y = groundY; this.vel.y = 0; this.onGround = true;
    } else if (this.pos.y > groundY + 0.05) this.onGround = false;

    // integrate + collide
    let nx = this.pos.x + this.vel.x * dt;
    let nz = this.pos.z + this.vel.z * dt;
    const c = w.collide(nx, nz, P.radius, this.pos.y, P.height);
    this.pos.x = c.x; this.pos.z = c.z;
    // walking off the platform edge: fall, not teleport — groundHeight handles it next frame

    // energy — running drunk burns it TWICE as fast
    const moving = Math.hypot(this.vel.x, this.vel.z) > 0.5;
    if (this.sprinting && moving) this.en = Math.max(0, this.en - P.sprintDrain * (drunk ? CFG.wine.drainMult : 1) * dt);
    else if (this.sneak) this.en = Math.min(100, this.en + P.regenSneak * dt);
    else if (moving) this.en = Math.min(100, this.en + P.regenMove * dt);
    else this.en = Math.min(100, this.en + P.regenIdle * dt);

    // hunger — running makes you hungry faster
    const huMult = (this.sprinting && moving ? P.hungerRunMult : 1) * (this.thirstZero ? CFG.desert.thirstHungerMult : 1);   // update 36: dry = twice as hungry
    this.hu = Math.max(0, this.hu - P.hungerDrain * huMult * dt);
    if (this.hu <= 0) {
      this.hp = Math.max(0, this.hp - P.starveHpDrain * dt);
      if (this.hp <= 0) { this.ctx.onDeath("hunger"); return; }
    }

    // heartbeat at low hp
    if (this.hp < 25) {
      this.heartT -= dt;
      if (this.heartT <= 0) { this.heartT = 1.1; game.audio.sHeart(); }
    }

    // footsteps: surface-aware sound + dry twigs crack underfoot
    if (moving && this.onGround) {
      this.stepT -= dt * (this.sprinting ? 2.2 : this.sneak ? 0.7 : 1.3);
      if (this.stepT <= 0) {
        this.stepT = 0.5;
        const surface = w.surfaceAt(this.pos.x, this.pos.z, this.pos.y);
        game.audio.sStepOn(surface, this.sneak, this.sprinting);
        for (const t of w.twigs) {
          if (t.rearm > game.time) continue;
          if (Math.hypot(t.x - this.pos.x, t.z - this.pos.z) < 0.75) {
            t.rearm = game.time + 10;
            game.audio.sTwig();
            game.ui.toast(STR.twigCrack);
            game.emitNoise(this.pos.x, this.pos.z, CFG.trex.twigNoiseR);
            break;
          }
        }
      }
    }

    // attack cooldown + viewmodel — each weapon shows its OWN design
    this.atkT -= dt;
    const sel = this.inv.selected();
    const weapon = sel && (sel.id === "knife" || sel.id === "silver_dagger" || sel.id === "trex_dagger" || sel.id === "imp_dagger" || sel.id === "et_dagger" || sel.id === "et_sword" || sel.id === "machete" || sel.id === "axe") ? sel.id : null;
    const showVm = game.carriedEgg ? null
      : weapon
        ? (weapon === "knife" && this.knife3dVm) || (weapon === "machete" && this.machete3dVm)
          || (weapon === "axe" && this.axe3dVm)
          || (weapon === "silver_dagger" && this.dagger3dVm)
          || (weapon === "trex_dagger" && (this.trexDagger3dVm || this.trexDaggerVm))
          || (weapon === "imp_dagger" && (this.impDagger3dVm || this.trexDagger3dVm || this.trexDaggerVm))
          || (weapon === "et_dagger" && this.etDagger3dVm) || (weapon === "et_sword" && this.etSword3dVm) || this.knifeVm
        : sel && sel.id === "spear" ? this.spearVm
        : sel && sel.id === "et_spear" ? (this.etSpear3dVm || this.spearVm)
        : sel && sel.id === "crossbow" ? this.crossbowVm : null;
    for (const vm of [this.knifeVm, this.knife3dVm, this.machete3dVm, this.axe3dVm, this.dagger3dVm, this.trexDaggerVm, this.trexDagger3dVm, this.impDagger3dVm, this.etDagger3dVm, this.etSword3dVm, this.etSpear3dVm, this.spearVm, this.crossbowVm]) {
      if (vm) vm.visible = vm === showVm;
    }
    if (this.eggVm) this.eggVm.visible = !!game.carriedEgg;
    if (this.torchVm) this.torchVm.visible = !!(sel && sel.id === "lit_torch") && !game.carriedEgg;
    if (this.torchLight) this.torchLight.intensity = this.torchVm && this.torchVm.visible ? CFG.torch.intensity : 0;
    if (showVm) {
      const base = showVm.userData.base;
      if (this.swingT > 0) {
        this.swingT -= dt;
        const k = 1 - this.swingT / 0.28;
        showVm.rotation.x = base.rx - Math.sin(k * Math.PI) * 1.1;
        showVm.position.z = base.z - Math.sin(k * Math.PI) * 0.22;
      } else {
        showVm.rotation.x = base.rx;
        showVm.position.z = base.z;
        // subtle idle sway
        showVm.position.y = base.y + Math.sin(game.time * 1.8) * 0.006;
      }
    }

    // camera
    this.camera.position.set(this.pos.x, this.pos.y + P.height, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, "YXZ");
  }

  attack(game) {
    if (this.atkT > 0) return;
    // carrying the T-Rex egg: left-click sets it down
    if (game.carriedEgg) { game.dropCarriedEgg(); return; }
    const sel = this.inv.selected();
    // the crossbow FIRES (update 27) — if you've learned how
    if (sel && sel.id === "crossbow") {
      this.atkT = CFG.crossbow.cooldown;
      game.fireCrossbow(this);
      return;
    }
    // arrows in hand are for LOADING (hold left-click), never for swinging —
    // stay silent so the long-press flow isn't drowned in deny-beeps
    if (sel && (sel.id === "arrow" || sel.id === "silver_arrow")
        && this.inv.slots.some((s) => s && s.id === "crossbow")) return;
    // the bound spear is THROWN, not swung
    if (sel && (sel.id === "spear" || sel.id === "et_spear")) {   // update 39: the Eternial spear is thrown too
      this.atkT = CFG.spear.cooldown;
      this.swingT = 0.28;
      game.throwSpear(this);
      return;
    }
    const weapon = sel && (sel.id === "knife" || sel.id === "silver_dagger" || sel.id === "trex_dagger" || sel.id === "imp_dagger" || sel.id === "et_dagger" || sel.id === "et_sword" || sel.id === "machete" || sel.id === "axe") ? sel.id : null;
    // an ITEM in hand gets used; an EMPTY hand throws a punch
    if (!weapon && sel) return this.useSelected(game);
    const K = weapon ? CFG.player[weapon] : CFG.player.fists;
    this.atkT = K.cooldown;
    game.loudAct();   // update 36
    if (weapon) this.swingT = 0.28;
    if (weapon) game.audio.play("knife", { vol: 0.7 }) || game.audio.noise(0.08, 3000, 0.2, "highpass");
    else game.audio.noise(0.07, 900, 0.25, "lowpass");
    // hit test: distance + facing cone
    const fx = Math.sin(this.yaw) * -1, fz = Math.cos(this.yaw) * -1;
    // update 29: Duco cannot be attacked — his cuteness disarms you
    const duco = game.farm && game.farm.duco ? game.farm.duco.body : null;
    if (duco) {
      const dx = duco.position.x - this.pos.x, dz = duco.position.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d < K.range + 0.6 && (dx * fx + dz * fz) / (d || 1) >= K.arcCos) {
        game.ui.toast(STR.ducoNoHit);
        game.audio.sDeny();
        return;
      }
    }
    for (const c of [...game.creatures, ...game.wolves]) {
      if (c.dead) continue;
      const dx = c.pos.x - this.pos.x, dz = c.pos.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      const reach = K.range + c.cfg.height * 0.3;
      if (d > reach) continue;
      const dot = (dx * fx + dz * fz) / (d || 1);
      if (dot < K.arcCos) continue;
      c.hit(K.dmg, game, weapon);
      return;
    }
    // no creature hit — a knife blow against a tree yields a branch
    if (!weapon) return; // bare fists strip no bark
    // update 36: a cactus first — water for the bottle (or spines in your hand)
    if (game.world.desert && game.world.desert.cacti.length) {
      for (const c of game.world.desert.cacti) {
        const dx = c.x - this.pos.x, dz = c.z - this.pos.z, d = Math.hypot(dx, dz);
        if (d > 2.6) continue;
        if ((dx * fx + dz * fz) / (d || 1) < 0.4) continue;
        game.audio.sHit();
        game.desert.cutCactus(c);
        return;
      }
    }
    this.chopT = this.chopT || 0;
    if (game.time - this.chopT < 0.9) return;
    for (const t of game.world.treesNear(this.pos.x, this.pos.z)) {
      const dx = t.x - this.pos.x, dz = t.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 2.4) continue;
      const dot = (dx * fx + dz * fz) / (d || 1);
      if (dot < 0.4) continue;
      this.chopT = game.time;
      game.audio.sHit();
      if (game.rng() < CFG.branchChance) {
        // the axe BITES: three branches per strike where a knife shaves one
        const n = weapon === "axe" ? CFG.axeBranches : 1;
        if (this.inv.add("branch", n)) {
          game.ui.toast(n > 1 ? `${STR.branchCut} ×${n}` : STR.branchCut);
          game.ui.renderHotbar(this.inv);
        } else game.ui.toast(STR.inventoryFull);
      }
      break;
    }
  }

  useSelected(game) {
    const sel = this.inv.selected();
    if (!sel) return;
    const id = sel.id;
    if (id === "knife") return;
    // update 27: scrolls teach, the pestle crushes, the compass whispers
    if (id.startsWith("scroll_")) { game.useScroll(id); return; }
    if (id === "pestle") { game.usePestle(); return; }
    if (id === "death_compass") {
      game.ui.toast(game.lastDeathSpot ? `${STR.compassPoints}…` : STR.compassIdle);
      return;
    }
    if (id === "bandage") {
      if (this.hp >= 100) return game.ui.toast(STR.fullHealth);
      this.inv.consumeSelected();
      this.heal(CFG.bandageHeal);
      game.audio.sEat();
      game.ui.toast(STR.usedBandage);
    } else if (id === "energy_drink" || id === "super_energy_drink") {
      if (this.en >= 100) return game.ui.toast(STR.fullEnergy);
      this.inv.consumeSelected();
      this.en = Math.min(100, this.en + (id === "super_energy_drink" ? CFG.superEnergyDrink : CFG.energyDrink));
      game.audio.sDrink();
      game.ui.toast(id === "super_energy_drink" ? STR.drankSuper : STR.drankEnergy);
    } else if (id === "wolf_bag") {
      // sling it on your back: it IS your inventory now — every slot doubles
      if (game.wolfBagOn) return game.ui.toast(STR.wolfBagAlready);
      this.inv.consumeSelected();
      game.wolfBagOn = true;   // for this run — a fresh session starts at 10 a slot again
      this.inv.stackMax = CFG.wolfBagStackMax;
      game.audio.sPickup();
      game.ui.toast(STR.wolfBagOn);
    } else if (id === "bowl_yogurt") {
      // update 29: plain yogurt + five bunches of blueberries = the dish (anywhere)
      if (!game.learned.has("yogurt")) { game.ui.toast(STR.yogurtUnlearned); game.audio.sDeny(); return; }
      const have = this.inv.slots.reduce((n, s) => n + (s && s.id === "blueberries" ? s.count : 0), 0);
      if (have < 5) { game.ui.toast(STR.yogurtNeedsBerries.replace("%n", have)); game.audio.sDeny(); return; }
      this.inv.consumeSelected();
      for (let i = 0; i < 5; i++) this.inv.removeOne("blueberries");
      if (!this.inv.add("bowl_yogurt_blueberries", 1)) game.spawnDrop("bowl_yogurt_blueberries", 1, this.pos.x, this.pos.z, game.world.groundHeight(this.pos.x, this.pos.z, this.pos.y));
      game.audio.sPickup();
      game.ui.toast(STR.yogurtMade);
    } else if (id === "holy_water" || id === "unholy_water" || id === "unholy_tiara") {
      // update 35: Elisia's bottles and crown — kept, for now
      game.ui.toast(id === "holy_water" ? STR.holyWaterHint : id === "unholy_water" ? STR.unholyWaterHint : STR.unholyTiaraHint);
      game.audio.sDeny();
    } else if (id === "bowl" || id === "lemon") {
      game.ui.toast(`${STR.items[id].name}: ${id === "bowl" ? STR.hintBowl : STR.hintLemon}`);
      game.audio.sDeny();
    } else if (id === "bowl_milk") {
      game.ui.toast(game.learned.has("yogurt") ? STR.hintBowlMilk : STR.yogurtUnlearned);
      game.audio.sDeny();
    } else if (id === "water_bottle") {
      game.ui.toast(`${STR.items[id].name}: ${game.desert.bottleHint()}`);   // update 36: it is drunk by itself, in the heat
      game.audio.sDeny();
    } else if (CFG.food[id]) {
      const f = CFG.food[id];
      game.loudAct();   // update 36: the crunch carries
      // a dish that also heals is welcome on a full stomach when you are hurt
      if (this.hu >= 100 && !(f.hp && this.hp < 100)) return game.ui.toast(STR.fullHunger);
      this.inv.consumeSelected();
      this.hu = Math.min(100, this.hu + f.hu);
      if (f.en) this.en = Math.min(100, this.en + f.en);
      if (f.hp) this.heal(f.hp);
      if (f.special === "appleEnergy" && this.en < 25) this.en = 25;
      game.audio.sEat();
      let msg = id === "apple" ? STR.ateApple : `${STR.items[id].name} — +${f.hu}%${f.hp ? `, +${f.hp}% health` : ""}`;
      // update 29: a bowl dish hands the EMPTY bowl back — or drops it when the pack is full
      if (f.returns) {
        if (this.inv.add(f.returns, 1)) msg += ` — ${STR.bowlBack}`;
        else { game.spawnDrop(f.returns, 1, this.pos.x, this.pos.z, game.world.groundHeight(this.pos.x, this.pos.z, this.pos.y)); msg += ` — ${STR.bowlDropped}`; }
      }
      game.ui.toast(msg);
    } else if (id === "wine") {
      this.inv.consumeSelected();
      this.heal(CFG.wine.hp);
      this.hu = Math.min(100, this.hu + CFG.wine.hu);
      game.audio.sDrink();
      game.startDrunk();
    } else if (id === "branch") {
      game.lightFire(this);
    } else if (id === "torch") {
      game.lightTorch(this);
    } else if (id === "lit_torch") {
      game.ui.toast(STR.torchAlreadyLit);
    } else if (id === "fishing_rod") {
      game.tryFish();
    } else if (CFG.cookMap[id]) {
      game.ui.toast(STR.needsCooking);
      game.audio.sDeny();
    } else {
      game.ui.toast(STR.noEffect);
      game.audio.sDeny();
    }
    game.ui.renderHotbar(this.inv);
  }
}
