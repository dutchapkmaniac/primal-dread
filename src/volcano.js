// update 74 (prompt 38, update 1): the Rocky Mountain is the VOLCANO. Its unreachable peak is a flat crust with glowing cracks
// and a smoke plume; ember leaf grows on the high shelf (four a day) and once on the lower slope, picked only with leather
// gloves (bare hands burn); the wolf dungeon is a SILVER MINE: twelve ores mined with a pickaxe, three ores smelt into a bar
// at Jabb's furnace (lit by his three ember leaves), a bar and a hammer make an unenchanted dagger at his anvil, and the witch
// turns it into the silver dagger (holy water) or the EVIL DAGGER (unholy water) that makes every werewolf a friend to talk
// to and feed.
import * as THREE from "three";
import { CFG } from "./config.js?v=78";
import { ItemDrop } from "./entities.js?v=78";
import { STR } from "../strings.js?v=78";

const V = () => CFG.volcano;

export class Volcano {
  constructor(g) {
    this.g = g; this.w = g.world; this.day = g.dayNum; this.embers = []; this.mining = null; this.smoke = []; this.t = 0;
    this.buildLava();
    this.buildEmberMat();
    this.spawnEmber(); this.spawnPick();
  }

  // ---------------- the peak: a crust of cooling lava, a glow, a plume ----------------
  buildLava() {
    const M = CFG.mountain, C = V(), w = this.w, capH = w.mountainProfile(C.capD);
    const cv = document.createElement("canvas"); cv.width = cv.height = 512; const c = cv.getContext("2d");
    c.fillStyle = "#17120f"; c.fillRect(0, 0, 512, 512);
    let seed = 99; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let i = 0; i < 900; i++) { c.fillStyle = `rgba(${40 + rnd() * 30 | 0},${30 + rnd() * 20 | 0},${24 + rnd() * 14 | 0},0.5)`; c.beginPath(); c.arc(rnd() * 512, rnd() * 512, 3 + rnd() * 14, 0, Math.PI * 2); c.fill(); }
    c.lineCap = "round";
    for (let i = 0; i < 26; i++) {   // cracks: bright orange cores with a dim halo
      let x = rnd() * 512, y = rnd() * 512, a = rnd() * Math.PI * 2; const pts = [[x, y]];
      for (let k = 0; k < 9; k++) { a += (rnd() - 0.5) * 1.3; x += Math.cos(a) * (14 + rnd() * 22); y += Math.sin(a) * (14 + rnd() * 22); pts.push([x, y]); }
      for (const [wd, col] of [[11, "rgba(255,90,20,0.35)"], [5, "#ff6a1a"], [2, "#ffd27a"]]) { c.strokeStyle = col; c.lineWidth = wd; c.beginPath(); pts.forEach(([px, py], j) => j ? c.lineTo(px, py) : c.moveTo(px, py)); c.stroke(); }
    }
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(3, 3);
    const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: new THREE.Color(0xff5a10), emissiveIntensity: 0.5, roughness: 0.95, fog: false });   // seen from across the map
    const disc = new THREE.Mesh(new THREE.CircleGeometry(C.lavaR, 56), mat); disc.rotation.x = -Math.PI / 2; disc.position.set(M.cx, capH - C.lavaDrop, M.cz); disc.frustumCulled = true; this.g.scene.add(disc);
    this.lava = { disc, mat };
    const light = new THREE.PointLight(0xff7a2a, 0, C.glowR, 1.6); light.position.set(M.cx, capH + 4, M.cz); this.g.scene.add(light); this.glow = light;
    // the plume: soft grey sprites rising, growing and fading
    const sc = document.createElement("canvas"); sc.width = sc.height = 128; const s2 = sc.getContext("2d");
    const grad = s2.createRadialGradient(64, 64, 4, 64, 64, 62); grad.addColorStop(0, "rgba(70,62,58,0.7)"); grad.addColorStop(0.5, "rgba(62,56,52,0.36)"); grad.addColorStop(1, "rgba(55,50,48,0)");   // darker than the day sky, so the plume reads by day too s2.fillStyle = grad; s2.fillRect(0, 0, 128, 128);
    const stex = new THREE.CanvasTexture(sc);
    for (let i = 0; i < C.plumeN; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: stex, transparent: true, depthWrite: false, opacity: 0.5, color: 0xffffff, fog: false }));
      sp.position.set(M.cx, capH, M.cz); this.g.scene.add(sp); this.smoke.push({ sp, phase: i / C.plumeN, drift: (i * 2.399) % (Math.PI * 2) });
    }
    // a soft orange glow over the crater, additive and unfogged: the volcano's night beacon from across the map
    const gc = document.createElement("canvas"); gc.width = gc.height = 128; const g2 = gc.getContext("2d");
    const gg = g2.createRadialGradient(64, 64, 2, 64, 64, 64); gg.addColorStop(0, "rgba(255,140,50,0.9)"); gg.addColorStop(0.35, "rgba(255,90,20,0.45)"); gg.addColorStop(1, "rgba(255,60,10,0)"); g2.fillStyle = gg; g2.fillRect(0, 0, 128, 128);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(gc), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, fog: false }));
    halo.position.set(M.cx, capH + 6, M.cz); halo.scale.set(C.haloSize, C.haloSize * 0.6, 1); this.g.scene.add(halo); this.halo = halo;
    this.capH = capH;
  }
  buildEmberMat() {
    const t = new THREE.TextureLoader().load("./assets/tex/spr_emberleaf.png"); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    this.emberMat = new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: new THREE.Color(0xff8a30), emissiveIntensity: 0.9, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9, metalness: 0 });
    const C = V(); const ga = new THREE.PlaneGeometry(C.emberW, C.emberH), gb = new THREE.PlaneGeometry(C.emberW, C.emberH); ga.translate(0, C.emberH / 2 - 0.03, 0); gb.translate(0, C.emberH / 2 - 0.03, 0); gb.rotateY(Math.PI / 2);
    this.emberGeo = [ga, gb];
  }
  // four plants on the high shelf and one on the lower slope, new spots every day
  // update 78: a plain pickaxe lies ten metres before Jabb's door, one a day
  spawnPick() { const g = this.g, H = CFG.mountain.hut; if (this.pickDrop && g.drops.includes(this.pickDrop)) return; const x = H.x + 1.27, z = H.z + 3.75 + 10; this.pickDrop = new ItemDrop("pickaxe", 1, x, z, this.w.groundHeight(x, z, 40), g.scene, 0); g.drops.push(this.pickDrop); }
  spawnEmber() {
    const g = this.g, w = this.w, M = CFG.mountain, C = V();
    for (const e of this.embers) g.scene.remove(e.grp);
    this.embers = [];
    const rng = g.rng;
    const tryPlace = (d0, d1) => {
      for (let k = 0; k < 400; k++) {
        const a = rng() * Math.PI * 2, d = d0 + rng() * (d1 - d0), x = M.cx + Math.cos(a) * d, z = M.cz + Math.sin(a) * d;
        if (Math.abs(x) > CFG.world.square - 6 || Math.abs(z) > CFG.world.square - 6) continue;
        if (w.inDungeon(x, z) || Math.hypot(x - M.cave.x, z - M.cave.z) < 16 || Math.hypot(x - M.hut.x, z - M.hut.z) < 16) continue;
        if (this.embers.some((e) => Math.hypot(e.x - x, e.z - z) < 12)) continue;
        if (w.treesNear(x, z).some((t) => Math.hypot(t.x - x, t.z - z) < 2.2)) continue;
        const y = w.groundHeight(x, z, 60);
        const grp = new THREE.Group(); grp.add(new THREE.Mesh(this.emberGeo[0], this.emberMat), new THREE.Mesh(this.emberGeo[1], this.emberMat));
        grp.position.set(x, y, z); grp.rotation.y = rng() * Math.PI; g.scene.add(grp);
        this.embers.push({ x, z, y, grp, taken: false }); return true;
      }
      return false;
    };
    for (let i = 0; i < C.shelfN; i++) tryPlace(M.wallD + 10, M.cliffHi - 8);
    for (let i = 0; i < C.lowerN; i++) tryPlace(M.cliffLo + 8, M.r - 12);
  }
  pickEmber(e) {
    const g = this.g, p = g.player, C = V(), S = STR.volcano;
    if (e.taken) return;
    if (!p.inv.has("leather_gloves")) { p.damage(C.bareDmg, "ember", null); g.ui.toast(S.emberBurn); g.audio.sDeny(); return; }
    const n = C.leaves[0] + Math.floor(g.rng() * (C.leaves[1] - C.leaves[0] + 1));
    if (!p.inv.add("emberleaf", n)) { g.ui.toast(STR.inventoryFull); g.audio.sDeny(); return; }
    p.inv.removeOne("leather_gloves");
    e.taken = true; e.grp.scale.setScalar(0.001);
    g.audio.sPickup(); g.ui.renderHotbar(p.inv); g.ui.toast(S.emberGot.replace("%n", n));
  }

  // ---------------- the silver mine ----------------
  mineStart(ore, pickId) {
    const C = V(); if (this.mining && this.mining.ore === ore) return;
    this.mining = { ore, pick: pickId, t: 0, need: pickId === "et_pickaxe" ? C.tEternal : C.tPlain, swingT: 0 };
  }
  updateMining(dt) {
    const g = this.g, p = g.player, C = V(), S = STR.volcano, M = this.mining; if (!M) return;
    const held = g.ui.held && g.ui.held.has("KeyF"), sel = p.inv.selected();
    if (!held || g.menuOpen || !sel || sel.id !== M.pick || Math.hypot(p.pos.x - M.ore.x, p.pos.z - M.ore.z) > 3.6 || M.ore.left <= 0) { this.mining = null; return; }
    M.t += dt; M.swingT += dt; if (M.swingT > 0.7) { M.swingT = 0; if (g.audio.sHit) g.audio.sHit(); }
    if (M.t < M.need) return;
    M.t = 0;
    if (!p.inv.add("silver_ore", 1)) { g.ui.toast(STR.inventoryFull); g.audio.sDeny(); this.mining = null; return; }
    M.ore.left = 0; M.ore.emptyDay = g.dayNum; if (M.ore.mesh) M.ore.mesh.scale.setScalar(0.001);
    g.ui.renderHotbar(p.inv); g.ui.toast(S.oreGot); g.audio.sPickup();
    if (M.pick === "pickaxe" && g.rng() < C.breakChance) { p.inv.remove("pickaxe", 1); g.ui.renderHotbar(p.inv); g.ui.toast(S.pickBroke); g.audio.sDeny(); }
    this.mining = null;
  }
  respawnOres() { for (const o of this.w.silverOres || []) { o.left = 1; if (o.mesh && o.scale0) o.mesh.scale.copy(o.scale0); } }
  smelt() {
    const g = this.g, p = g.player, C = V(), S = STR.volcano;
    if (!g.jabbDone) { g.ui.toast(S.furnaceCold); g.audio.sDeny(); return; }
    if (p.inv.count("silver_ore") < C.smeltOres) { g.ui.toast(S.needOres.replace("%n", C.smeltOres)); g.audio.sDeny(); return; }
    p.inv.remove("silver_ore", C.smeltOres);
    if (!p.inv.add("silver_bar", 1)) g.spawnDrop("silver_bar", 1, p.pos.x, p.pos.z, g.world.groundHeight(p.pos.x, p.pos.z, p.pos.y));
    g.audio.sHit(); g.ui.renderHotbar(p.inv); g.ui.toast(S.smelted);
  }
  lightFurnace() { const w = this.w; if (w.furnaceLight) w.furnaceLight.intensity = V().furnaceLight; w.furnaceLit = true; if (w.furnaceGlow) w.furnaceGlow.visible = true; }

  // ---------------- the evil dagger: werewolves become company ----------------
  evilHeld() { const s = this.g.player.inv.selected(); return !!(s && s.id === "evil_dagger"); }
  talkWolf(wolf) {
    const g = this.g, p = g.player, S = STR.volcano;
    const meats = CFG.volcano.wolfMeats.filter((id) => p.inv.has(id));
    const lines = [S.wolfLines[Math.floor(g.rng() * S.wolfLines.length)], S.wolfLines[Math.floor(g.rng() * S.wolfLines.length)]];
    const btns = meats.map((id) => ["feed_" + id, S.wolfFeed.replace("%i", STR.items[id].name)]);
    const s = g.npcPanel(S.wolfTitle, lines, btns);
    for (const id of meats) { const b = s.querySelector("#feed_" + id); if (!b) continue; b.addEventListener("click", () => {
      if (!p.inv.has(id)) return; p.inv.removeOne(id); const hu = (CFG.food[id] && CFG.food[id].hu) || 10; p.heal(hu);
      g.audio.sEat(); g.ui.renderHotbar(p.inv); g.ui.closeScreen(); g.resume(); g.ui.toast(S.wolfLick.replace("%n", hu));
      wolf.state = "wander"; wolf.target = null;
    }); }
  }

  // ---------------- every frame ----------------
  update(dt) {
    const g = this.g, w = this.w, C = V();
    this.t += dt;
    if (g.dayNum !== this.day) { this.day = g.dayNum; this.spawnEmber(); this.respawnOres(); this.spawnPick(); }
    const hk = 1 - (w.hiddenK || 0);   // update 78: the lava's glow never shows in the Monial night
    const k = w.nightK || 0;
    if (this.lava) this.lava.mat.emissiveIntensity = C.glowDay + (C.glowNight - C.glowDay) * k;
    if (this.glow) this.glow.intensity = C.glowLightNight * k;
    if (this.halo) this.halo.material.opacity = C.haloNight * k * (0.9 + 0.1 * Math.sin(this.t * 1.7)) * hk;
    const M = CFG.mountain, cam = g.camera, lim = (cam ? cam.far : 400) * 0.85;
    // the game pulls the camera's far plane in with the fog (~160 m), so anything on the peak is clipped from afar: the plume
    // and the halo are slid along their sight line to just inside the far plane, scaled down by the same ratio, and keep their
    // size on screen - a beacon from across the map
    const near = (x, y, z, size, sp) => { const dx = x - cam.position.x, dy = y - cam.position.y, dz = z - cam.position.z, d = Math.hypot(dx, dy, dz) || 1, k = d > lim ? lim / d : 1; sp.position.set(cam.position.x + dx * k, cam.position.y + dy * k, cam.position.z + dz * k); return size * k; };
    for (const s of this.smoke) {
      const u = (this.t / C.plumeRise + s.phase) % 1;
      const h = u * C.plumeH, size0 = C.plumeSize0 + (C.plumeSize1 - C.plumeSize0) * u;
      const size = near(M.cx + Math.cos(s.drift + u * 2.5) * (3 + u * 10), this.capH - C.lavaDrop + 1 + h, M.cz + Math.sin(s.drift + u * 2.5) * (3 + u * 10), size0, s.sp);
      s.sp.scale.set(size, size, 1); s.sp.material.opacity = 0.6 * (1 - u * 0.85) * (u < 0.08 ? u / 0.08 : 1) * hk;
    }
    if (this.halo) { const hs = near(M.cx, this.capH + 6, M.cz, C.haloSize, this.halo); this.halo.scale.set(hs, hs * 0.6, 1); }
    if (w.furnaceLight && w.furnaceLit) w.furnaceLight.intensity = C.furnaceLight * (0.85 + 0.15 * Math.sin(this.t * 9) * Math.sin(this.t * 2.3));
    this.updateMining(dt);
  }

  // ---------------- prompts ----------------
  interact(consider, p) {
    const g = this.g, w = this.w, S = STR.volcano;
    for (const e of this.embers) {
      if (e.taken || Math.abs(e.x - p.pos.x) > 3 || Math.abs(e.z - p.pos.z) > 3 || Math.hypot(e.x - p.pos.x, e.z - p.pos.z) > 3) continue;
      consider(e.x, e.z, e.y, `${p.inv.has("leather_gloves") ? S.emberPick : S.emberPickBare} [${STR.interact}]`, () => this.pickEmber(e));
    }
    for (const o of w.silverOres || []) {
      if (o.left <= 0 || Math.abs(o.x - p.pos.x) > 3.4 || Math.abs(o.z - p.pos.z) > 3.4 || Math.hypot(o.x - p.pos.x, o.z - p.pos.z) > 3.4) continue;
      const sel = p.inv.selected(), pick = sel && (sel.id === "pickaxe" || sel.id === "et_pickaxe") ? sel.id : null;
      if (pick) consider(o.x, o.z, o.y + 0.6, S.mineOre, () => this.mineStart(o, pick));
      else consider(o.x, o.z, o.y + 0.6, S.needPick, () => { g.ui.toast(S.needPick); g.audio.sDeny(); });
    }
    if (w.furnace && Math.hypot(w.furnace.x - p.pos.x, w.furnace.z - p.pos.z) < 3) consider(w.furnace.x, w.furnace.z, w.furnace.y + 0.6, `${g.jabbDone ? S.smeltPrompt : S.furnaceColdPrompt} [${STR.interact}]`, () => this.smelt());
    if (this.evilHeld()) for (const wolf of g.wolves) {
      if (wolf.dead || Math.hypot(wolf.pos.x - p.pos.x, wolf.pos.z - p.pos.z) > 3.4) continue;
      consider(wolf.pos.x, wolf.pos.z, wolf.pos.y, `${S.wolfTalk} [${STR.interact}]`, () => this.talkWolf(wolf));
    }
  }
}
