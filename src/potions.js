// update 73 (prompt 37, update 2): herblore and potions.
// Aloe vera in the desert (cut with any blade), vials filled at any water, the pestle crushes mushrooms, beetle shells and goat
// horns, a vial of water mixes itself into a potion when the pack holds the makings (a choice screen when it holds the makings
// of more than one), every potion drunk like food, and the running effects: scent, silence, thick skin, regeneration, poison
// immunity, immortality, night vision, the stamina stride and the Dread potion's footprints. Chests add herbs, vials and potions.
import * as THREE from "three";
import { CFG } from "./config.js?v=77";
import { STR } from "../strings.js?v=77";
import { iconUrl } from "./items.js?v=77";
import { cityFlatten } from "./eternius.js?v=77";

const FX = () => CFG.potionFx;
const fmt = (t) => { t = Math.max(0, Math.ceil(t)); const m = Math.floor(t / 60), s = t % 60; return `${m}:${s < 10 ? "0" : ""}${s}`; };

export class Potions {
  constructor(g) {
    this.g = g;
    this.fx = { predator: 0, silence: 0, thickskin: 0, regen: 0, immortal: 0, nightvision: 0, dread: 0, stamina: 0, invis: 0 };
    this.regenT = 0; this.hudT = 0; this.trailT = 0; this.dodged = new WeakSet(); this.trails = new Map();
    this.aloes = []; this.aloeDay = g.dayNum;
    this.buildAloe();
    this.buildPrints();
  }

  // ---------------- aloe vera: five plants on the sand ----------------
  buildAloe() {
    const g = this.g, w = g.world, des = w.desert, H = CFG.herbs.aloe, W = CFG.world, C = CFG.desert;
    if (!des || !des.inDesert) return;
    let seed = 7331; const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const X0 = -W.square - (C.edgePad || 4), X1 = C.bounds.x1, Z0 = C.bounds.z0, Z1 = W.square + (C.edgePad || 4);
    const L = new THREE.TextureLoader(); const t = L.load("./assets/tex/spr_aloe.png"); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    const mat = new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9, metalness: 0 });
    const geoA = new THREE.PlaneGeometry(H.w, H.h), geoB = new THREE.PlaneGeometry(H.w, H.h); geoA.translate(0, H.h / 2 - 0.03, 0); geoB.translate(0, H.h / 2 - 0.03, 0); geoB.rotateY(Math.PI / 2);
    let guard = 0;
    while (this.aloes.length < H.count && guard++ < 40000) {
      const x = X0 + 10 + rng() * (X1 - X0 - 20), z = Z0 + 10 + rng() * (Z1 - Z0 - 20);
      if (!des.inDesert(x, z) || des.riverDist(x, z) < 30) continue;
      if (des.oasis && Math.hypot(x - des.oasis.x, z - des.oasis.z) < 26) continue;
      if (des.tent && Math.hypot(x - des.tent.x, z - des.tent.z) < 22) continue;
      if (cityFlatten(x, z) < 1) continue;
      if ((des.cacti || []).some((q) => Math.hypot(q.x - x, q.z - z) < 8)) continue;
      if (this.aloes.some((q) => Math.hypot(q.x - x, q.z - z) < H.spacing)) continue;
      const y = w.groundHeight(x, z, 40);
      const grp = new THREE.Group(); grp.add(new THREE.Mesh(geoA, mat), new THREE.Mesh(geoB, mat));
      grp.position.set(x, y, z); grp.rotation.y = rng() * Math.PI; g.scene.add(grp);
      this.aloes.push({ x, z, y, taken: 0, empty: false, grp });
    }
  }
  bladeInHand(p) { const s = p.inv.selected(); return !!(s && CFG.herbs.blades.includes(s.id)); }
  cutAloe(a) {
    const g = this.g, p = g.player, H = CFG.herbs.aloe;
    if (a.empty) return;
    // the first two leaves are sure; each one after is a coin toss, five at most
    if (a.taken >= 2 && (a.taken >= H.max || g.rng() >= H.moreChance)) { a.empty = true; a.grp.scale.setScalar(0.001); g.ui.toast(STR.brew.aloeEmpty); g.audio.sDeny(); return; }
    if (!p.inv.add("aloe_vera", 1)) { g.ui.toast(STR.inventoryFull); g.audio.sDeny(); return; }
    a.taken++; g.audio.sHit(); g.ui.renderHotbar(p.inv); g.ui.toast(`${STR.items.aloe_vera.name} ×${a.taken}`);
    if (a.taken >= H.max) { a.empty = true; a.grp.scale.setScalar(0.001); }
  }

  // ---------------- water: every empty vial fills at once ----------------
  fillVials() {
    const g = this.g, p = g.player, n = p.inv.count("vial");
    if (!n) return 0;
    p.inv.remove("vial", n);
    for (let i = 0; i < n; i++) if (!p.inv.add("vial_water", 1)) g.spawnDrop("vial_water", 1, p.pos.x, p.pos.z, g.world.groundHeight(p.pos.x, p.pos.z, p.pos.y));
    g.audio.sDrink(); g.ui.renderHotbar(p.inv); g.ui.toast(n === 1 ? STR.brew.vialFilled1 : STR.brew.vialsFilled.replace("%n", n));
    return n;
  }

  // ---------------- the pestle: crush ----------------
  crush() {
    const g = this.g, p = g.player, S = STR.brew;
    const rows = CFG.herbs.crush.filter(([from]) => p.inv.has(from));
    const silver = p.inv.has("silver_dagger");
    if (!rows.length && !silver) { g.ui.toast(S.crushNone); g.audio.sDeny(); return; }
    g.menuOpen = true; g.ui.wantLock = false; document.exitPointerLock?.();
    const icon = (id) => { const u = iconUrl(id); return u ? `<img src="${u}" alt="" style="width:30px;height:30px;vertical-align:middle">` : ""; };
    const nm = (id) => STR.items[id] ? STR.items[id].name : id;
    const html = rows.map(([from, to, n]) => `<div class="bookRow" style="display:flex;align-items:center;gap:10px;padding:6px 4px;border-bottom:1px solid rgba(255,255,255,.12)">
        <div style="flex:1;text-align:left">${icon(from)} ${nm(from)} <span style="opacity:.7">×${p.inv.count(from)}</span> &rarr; ${icon(to)} ${n > 1 ? n + "× " : ""}${nm(to)}</div>
        <button data-crush="${from}" data-n="1">${S.crushOne}</button><button data-crush="${from}" data-n="all">${S.crushAll}</button></div>`).join("");
    const silverRow = silver ? `<div class="bookRow" style="display:flex;align-items:center;gap:10px;padding:6px 4px"><div style="flex:1;text-align:left">${icon("silver_dagger")} ${nm("silver_dagger")} &rarr; ${icon("silver_dust")} 10× ${nm("silver_dust")}${g.learned.has("pestle") ? "" : ` <span style="opacity:.7">(${STR.pestleUnlearned})</span>`}</div>${g.learned.has("pestle") ? `<button id="crushSilver">${S.crushOne}</button>` : ""}</div>` : "";
    const s = g.ui.screen(`<h1 style="font-size:24px;margin-bottom:2px">${STR.items.pestle.name}</h1>
      <div style="font-size:13px;opacity:.85;margin-bottom:6px">${S.crushIntro}</div>
      <div class="shopWrap" style="max-height:60vh;overflow:auto;width:min(92vw,560px)">${html}${silverRow}</div>
      <button id="pnlClose" style="margin-top:8px">${STR.close}</button>`);
    const close = () => { g.ui.closeScreen(); g.resume(); };
    s.querySelector("#pnlClose").addEventListener("click", close);
    s.querySelectorAll("[data-crush]").forEach((b) => b.addEventListener("click", () => {
      const from = b.dataset.crush, [, to, per] = CFG.herbs.crush.find((r) => r[0] === from);
      let k = b.dataset.n === "all" ? p.inv.count(from) : 1, made = 0;
      while (k-- > 0 && p.inv.has(from)) { p.inv.removeOne(from); for (let i = 0; i < per; i++) if (!p.inv.add(to, 1)) g.spawnDrop(to, 1, p.pos.x, p.pos.z, g.world.groundHeight(p.pos.x, p.pos.z, p.pos.y)); made += per; }
      g.audio.sHit(); g.ui.renderHotbar(p.inv); g.ui.toast(S.crushed.replace("%i", `${nm(to)} ×${made}`));
      close(); if (CFG.herbs.crush.some(([f]) => p.inv.has(f))) this.crush();   // more to crush: the screen comes back; else the toast stands
    }));
    const sv = s.querySelector("#crushSilver");
    if (sv) sv.addEventListener("click", () => { close(); g.usePestle(); });
  }

  // ---------------- a vial of water: brew ----------------
  canMake(pt) { const p = this.g.player; return pt.needs.every(([id, n]) => p.inv.count(id) >= n); }
  brew() {
    const g = this.g, p = g.player, S = STR.brew;
    if (!p.inv.has("pestle")) { g.ui.toast(S.noPestle); g.audio.sDeny(); return; }
    if (!p.inv.has("vial_water")) { g.ui.toast(S.noWater); g.audio.sDeny(); return; }
    const can = CFG.potions.filter((pt) => this.canMake(pt));
    if (!can.length) { g.ui.toast(S.none); g.audio.sDeny(); return; }
    if (can.length === 1) { this.make(can[0]); return; }
    g.menuOpen = true; g.ui.wantLock = false; document.exitPointerLock?.();
    const icon = (id, px = 34) => { const u = iconUrl(id); return u ? `<img src="${u}" alt="" style="width:${px}px;height:${px}px;vertical-align:middle">` : ""; };
    const nm = (id) => STR.items[id] ? STR.items[id].name : id;
    const rows = can.map((pt) => `<button class="bookRow" data-brew="${pt.id}" style="display:flex;align-items:center;gap:10px;padding:7px 8px;width:100%;text-align:left">
        <div style="flex:0 0 44px;text-align:center">${icon(pt.id)}</div>
        <div style="flex:1"><b>${nm(pt.id)}</b><div style="font-size:12px;opacity:.85">${STR.potions[pt.id] ? STR.potions[pt.id].effect : ""}</div>
          <div style="font-size:12px;margin-top:2px">${pt.needs.map(([id, n]) => `${icon(id, 18)} ${n > 1 ? n + "× " : ""}${nm(id)}`).join(" + ")}</div></div></button>`).join("");
    const s = g.ui.screen(`<h1 style="font-size:24px;margin-bottom:2px">${S.chooseTitle}</h1>
      <div style="font-size:13px;opacity:.85;margin-bottom:6px">${S.chooseIntro}</div>
      <div class="shopWrap" style="max-height:62vh;overflow:auto;width:min(92vw,600px);display:flex;flex-direction:column;gap:6px">${rows}</div>
      <button id="pnlClose" style="margin-top:8px">${STR.close}</button>`);
    const close = () => { g.ui.closeScreen(); g.resume(); };
    s.querySelector("#pnlClose").addEventListener("click", close);
    s.querySelectorAll("[data-brew]").forEach((b) => b.addEventListener("click", () => { const pt = CFG.potions.find((q) => q.id === b.dataset.brew); close(); if (pt && this.canMake(pt) && p.inv.has("vial_water")) this.make(pt); }));
  }
  make(pt) {
    const g = this.g, p = g.player;
    p.inv.removeOne("vial_water");
    for (const [id, n] of pt.needs) p.inv.remove(id, n);
    if (!p.inv.add(pt.id, 1)) g.spawnDrop(pt.id, 1, p.pos.x, p.pos.z, g.world.groundHeight(p.pos.x, p.pos.z, p.pos.y));
    g.audio.sDrink(); g.ui.renderHotbar(p.inv); g.ui.toast(STR.brew.made.replace("%p", STR.items[pt.id].name));
  }

  // ---------------- drinking ----------------
  drink(id) {
    const g = this.g, p = g.player, F = FX(), S = STR.brew, name = STR.items[id] ? STR.items[id].name : id;
    const fx = this.fx; let ok = true;
    { const def = CFG.potions.find((q) => q.id === id); if (def && def.noDrink) { g.ui.toast(S.noDrink); g.audio.sDeny(); return; } }   // update 75
    switch (id) {
      case "potion_starvation": if (p.hu >= 100) { g.ui.toast(STR.fullHunger); ok = false; } else p.hu = Math.min(100, p.hu + F.food); break;
      case "potion_healing": if (p.hp >= 100) { g.ui.toast(STR.fullHealth); ok = false; } else p.heal(F.heal); break;
      case "potion_energy": if (p.en >= 100) { g.ui.toast(STR.fullEnergy); ok = false; } else p.en = Math.min(100, p.en + F.energy); break;
      case "potion_antidote": if (!g.poison) { g.ui.toast(S.notPoisoned); ok = false; } else { g.poison = null; g.ui.toast(S.cured); } break;
      case "potion_superantidote": g.poison = null; g.poisonImmuneT = F.immune; g.ui.toast(S.immune); break;
      case "potion_predator": fx.predator = F.predator; break;
      case "potion_silence": fx.silence = F.silence; break;
      case "potion_invis": fx.predator = Math.max(fx.predator, F.invis); fx.silence = Math.max(fx.silence, F.invis); fx.invis = F.invis; break;
      case "potion_dread": fx.dread = F.dread; this.trails.clear(); break;
      case "potion_thickskin": fx.thickskin = F.thickskin; break;
      case "potion_stamina": p.en = Math.min(100, p.en + F.staminaEnergy); fx.stamina = F.stamina; break;
      case "potion_regen": fx.regen = F.regen; break;
      case "potion_immortal": fx.immortal = F.immortal; this.dodged = new WeakSet(); break;
      case "potion_nightvision": fx.nightvision = F.nightvision; break;
      default: g.ui.toast(`${name}: ?`); ok = false;
    }
    if (!ok) { g.audio.sDeny(); return; }
    p.inv.consumeSelected();
    if (!p.inv.add("vial", 1)) g.spawnDrop("vial", 1, p.pos.x, p.pos.z, g.world.groundHeight(p.pos.x, p.pos.z, p.pos.y));
    g.audio.sDrink(); g.ui.renderHotbar(p.inv); g.ui.toast(S.drank.replace("%p", name));
    this.hud(true);
  }

  // ---------------- damage: the first blow of every enemy is dodged; thick skin takes a quarter off a dinosaur's bite ----------------
  potionDamage(amount, source, fromPos) {
    const F = FX(), g = this.g;
    if (this.fx.immortal > 0 && fromPos && fromPos.isVector3 && !this.dodged.has(fromPos)) { this.dodged.add(fromPos); g.ui.toast(STR.brew.dodged); g.audio.sDeny(); return 0; }
    if (this.fx.thickskin > 0 && F.dinoSources.includes(source)) amount *= F.thickMult;
    return amount;
  }

  // ---------------- every frame ----------------
  update(dt) {
    const g = this.g, p = g.player, F = FX(), fx = this.fx;
    if (g.dayNum !== this.aloeDay) { this.aloeDay = g.dayNum; for (const a of this.aloes) { a.taken = 0; a.empty = false; a.grp.scale.setScalar(1); } }
    for (const k of Object.keys(fx)) if (fx[k] > 0) { fx[k] -= dt; if (fx[k] <= 0) { fx[k] = 0; this.ended(k); } }
    if (g.poisonImmuneT > 0) g.poisonImmuneT = Math.max(0, g.poisonImmuneT - dt);
    if (fx.regen > 0) { this.regenT -= dt; if (this.regenT <= 0) { this.regenT = F.regenEvery; if (p.hp < 100 && !p.dead) p.heal(1); } }
    p.sightMult = fx.predator > 0 ? F.sightMult : 1;
    p.noiseMult = fx.silence > 0 ? F.noiseMult : 1;
    g.ui.strideBar(!!g.strideOn || fx.stamina > 0 || !!(g.hidden && g.hidden.strideOn()));
    this.updatePrints(dt);
    this.hudT -= dt; if (this.hudT <= 0) { this.hudT = 0.5; this.hud(); }
  }
  ended(k) {
    const g = this.g, F = FX(), S = STR.brew;
    if (k === "immortal") { this.fx.thickskin = Math.max(this.fx.thickskin, F.immortalSkin); g.ui.toast(S.immortalSkin); return; }
    if (k === "invis") return;
    const id = { predator: "potion_predator", silence: "potion_silence", thickskin: "potion_thickskin", regen: "potion_regen", nightvision: "potion_nightvision", dread: "potion_dread", stamina: "potion_stamina" }[k];
    if (id && STR.items[id]) g.ui.toast(S.over.replace("%p", STR.items[id].name));
  }
  hud(force) {
    const el = document.getElementById("fx"); if (!el) return;
    const fx = this.fx, g = this.g, rows = [];
    const add = (id, t) => { if (t > 0) rows.push(`<span class="fxi" title="${STR.items[id].name}"><img src="${iconUrl(id)}" alt=""><b>${fmt(t)}</b></span>`); };
    if (fx.invis > 0) add("potion_invis", fx.invis); else { add("potion_predator", fx.predator); add("potion_silence", fx.silence); }
    add("potion_dread", fx.dread); add("potion_thickskin", fx.thickskin); add("potion_stamina", fx.stamina); add("potion_regen", fx.regen);
    add("potion_superantidote", g.poisonImmuneT || 0); add("potion_immortal", fx.immortal); add("potion_nightvision", fx.nightvision);
    const html = rows.join("");
    if (force || html !== this.lastHud) { el.innerHTML = html; this.lastHud = html; }
  }

  // ---------------- the Dread potion: three-toed prints along every dinosaur's trail, deeper the nearer it is ----------------
  buildPrints() {
    const cv = document.createElement("canvas"); cv.width = cv.height = 128; const c = cv.getContext("2d");
    c.fillStyle = "#000"; c.fillRect(0, 0, 128, 128);   // an alphaMap reads the GREEN channel: black = clear, white = the print
    c.fillStyle = "#fff";
    c.beginPath(); c.ellipse(64, 86, 22, 26, 0, 0, Math.PI * 2); c.fill();                       // the pad
    for (const [x, y, a] of [[30, 46, -0.5], [64, 30, 0], [98, 46, 0.5]]) { c.beginPath(); c.ellipse(x, y, 11, 30, a, 0, Math.PI * 2); c.fill(); }   // three toes
    const tex = new THREE.CanvasTexture(cv);
    const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ alphaMap: tex, transparent: true, depthWrite: false, color: 0xffffff, opacity: 0.9, polygonOffset: true, polygonOffsetFactor: -2 });
    const F = FX();
    this.prints = new THREE.InstancedMesh(geo, mat, F.maxPrints); this.prints.count = 0; this.prints.frustumCulled = false; this.prints.visible = false;
    this.prints.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(F.maxPrints * 3), 3);
    this.g.scene.add(this.prints);
  }
  isDino(c) { return !c.small && !c.dead && !c.gone && !FX().notDino.includes(c.type); }
  updatePrints(dt) {
    const g = this.g, F = FX(), P = this.prints; if (!P) return;
    if (this.fx.dread <= 0) { if (P.visible) { P.visible = false; P.count = 0; this.trails.clear(); } return; }
    P.visible = true;
    this.trailT -= dt;
    if (this.trailT <= 0) {
      this.trailT = F.printEvery;
      for (const c of g.creatures) {
        if (!this.isDino(c) || Math.hypot(c.pos.x - g.player.pos.x, c.pos.z - g.player.pos.z) > F.printR) continue;
        let tr = this.trails.get(c); if (!tr) { tr = []; this.trails.set(c, tr); }
        const last = tr[tr.length - 1];
        if (last && Math.hypot(last.x - c.pos.x, last.z - c.pos.z) < F.printStep) continue;
        const side = tr.length % 2 ? 1 : -1, fx = Math.sin(c.yaw || 0), fz = Math.cos(c.yaw || 0);
        const x = c.pos.x - fz * side * 0.35, z = c.pos.z + fx * side * 0.35;
        tr.push({ x, z, y: g.world.groundHeight(x, z, c.pos.y + 1) + 0.03, yaw: c.yaw || 0, t: g.time });
        while (tr.length > F.printsPer) tr.shift();
      }
    }
    const d = new THREE.Object3D(), col = new THREE.Color(); let k = 0;
    for (const [c, tr] of this.trails) {
      if (c.dead || c.gone) { this.trails.delete(c); continue; }
      const dist = Math.hypot(c.pos.x - g.player.pos.x, c.pos.z - g.player.pos.z), near = 1 - Math.min(1, dist / F.printR);
      const sc = (F.printSize[0] + (F.printSize[1] - F.printSize[0]) * near) * (c.cfg && c.cfg.height ? Math.min(1.6, Math.max(0.6, c.cfg.height / 5)) : 1);
      const dark = 0.3 - 0.29 * near;   // linear values - 0.3 shows as a light press, 0.01 as a deep black one (sRGB lifts the greys)
      for (const pr of tr) {
        if (k >= F.maxPrints) break;
        if (g.time - pr.t > F.printLife) continue;
        d.position.set(pr.x, pr.y, pr.z); d.rotation.set(0, pr.yaw, 0); d.scale.setScalar(sc); d.updateMatrix();
        P.setMatrixAt(k, d.matrix); col.setRGB(dark, dark, dark); P.setColorAt(k, col); k++;
      }
    }
    P.count = k; P.instanceMatrix.needsUpdate = true; if (P.instanceColor) P.instanceColor.needsUpdate = true;
  }

  // ---------------- chests: herbs, vials and the common potions ----------------
  chestLoot(gained, c) {
    const g = this.g, H = CFG.herbs.chest, r = () => g.lootRng();
    if (r() < H.rosemaryPotion) gained.push([H.rosemaryPotions[Math.floor(r() * H.rosemaryPotions.length)], 1]);
    if (r() < H.belladonnaPotion) gained.push([H.belladonnaPotions[Math.floor(r() * H.belladonnaPotions.length)], 1]);
    if (r() < H.rosemary) gained.push(["rosemary", 1]);
    if (r() < H.belladonna) gained.push(["belladonna", 1]);
    if (r() < H.aloe) gained.push(["aloe_vera", 1]);
    if (r() < H.valerian) gained.push(["valerian", 1]);
    if (r() < H.vials) gained.push(["vial", H.vialsN]);
  }

  // ---------------- prompts ----------------
  interact(consider, p) {
    const S = STR.brew;
    for (const a of this.aloes) {
      if (a.empty || Math.abs(a.x - p.pos.x) > 3 || Math.abs(a.z - p.pos.z) > 3 || Math.hypot(a.x - p.pos.x, a.z - p.pos.z) > 3) continue;
      if (this.bladeInHand(p)) consider(a.x, a.z, a.y, `${S.aloeCut} [${STR.interact}]`, () => this.cutAloe(a));
      else consider(a.x, a.z, a.y, S.aloeNeedsKnife, () => { this.g.ui.toast(S.aloeNeedsKnife); this.g.audio.sDeny(); });
    }
  }
}
