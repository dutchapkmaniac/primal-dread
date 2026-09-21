// update 37: THE PORTALS — five stone rings that carry you across the map once
// you have earned them. Four stand at the far ends of the forest (red north,
// green west, yellow east, blue south) and the fifth, white, waits in the
// temple's basement. Each awakens on its own condition:
//   red    — pick an apple from 30 different apple trees (each dawn forgets the
//            first five you found, so those can be found again)
//   yellow — five days in a row without the hunger bar reaching zero
//   green  — open five different chests in one day (a snake's bite or the dawn
//            starts you over)
//   blue   — sleep in five different beds
//   white  — the other four
// Death keeps what is awake; the red count and the beds stay, the hunger streak
// and the day's chests reset. An awake portal carries you to any named place
// you have discovered, and to any portal you have found. One-way.
import * as THREE from "three";
import { CFG } from "./config.js";
import { STR } from "../strings.js";

const P = () => CFG.portals;
export const PORTAL_IDS = ["red", "green", "yellow", "blue", "white"];

// ---------- procedural art: the emblem, the coloured flame, the swirl ----------
function hexCss(hex, a = 1) { const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255; return `rgba(${r},${g},${b},${a})`; }

function emblemCanvas(id, hex, lit) {
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const x = c.getContext("2d"), m = 128;
  // the stone disc
  const g = x.createRadialGradient(m, m, 10, m, m, 128);
  g.addColorStop(0, lit ? "#4a4a46" : "#3a3a37"); g.addColorStop(1, lit ? "#2c2c2a" : "#232321");
  x.fillStyle = g; x.beginPath(); x.arc(m, m, 126, 0, Math.PI * 2); x.fill();
  x.strokeStyle = "#5a5852"; x.lineWidth = 6; x.beginPath(); x.arc(m, m, 118, 0, Math.PI * 2); x.stroke();
  const col = hexCss(hex, lit ? 1 : 0.75);
  x.strokeStyle = col; x.fillStyle = col; x.lineWidth = 11; x.lineCap = "round"; x.lineJoin = "round";
  if (lit) { x.shadowColor = hexCss(hex, 0.9); x.shadowBlur = 18; }
  x.beginPath();
  switch (id) {
    case "red":      // a rising flame: a tall triangle with a drop inside
      x.moveTo(m, 40); x.lineTo(m + 62, 178); x.lineTo(m - 62, 178); x.closePath(); x.stroke();
      x.beginPath(); x.arc(m, 140, 22, 0, Math.PI * 2); x.fill(); break;
    case "green":    // a leaf: a rhombus with its vein
      x.moveTo(m, 36); x.lineTo(m + 58, m); x.lineTo(m, 220); x.lineTo(m - 58, m); x.closePath(); x.stroke();
      x.beginPath(); x.moveTo(m, 60); x.lineTo(m, 196); x.stroke(); break;
    case "yellow":   // the sun: a disc with eight rays
      x.arc(m, m, 34, 0, Math.PI * 2); x.fill();
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; x.beginPath(); x.moveTo(m + Math.cos(a) * 54, m + Math.sin(a) * 54); x.lineTo(m + Math.cos(a) * 92, m + Math.sin(a) * 92); x.stroke(); } break;
    case "blue":     // a crescent moon and one star
      x.arc(m + 6, m, 74, 0.55, Math.PI * 2 - 0.55); x.stroke();
      x.beginPath(); x.arc(m + 26, m, 52, 0.9, Math.PI * 2 - 0.9, true); x.stroke();
      x.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 7 : 16; x.lineTo(m + 78 + Math.cos(a) * r, m - 60 + Math.sin(a) * r); } x.closePath(); x.fill(); break;
    default:         // white: a five-pointed star
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 36 : 88; x.lineTo(m + Math.cos(a) * r, m + Math.sin(a) * r); } x.closePath(); x.stroke();
  }
  return c;
}

function flameCanvas(hex) {
  const c = document.createElement("canvas"); c.width = 64; c.height = 96;
  const x = c.getContext("2d");
  const g = x.createRadialGradient(32, 72, 3, 32, 58, 46);
  g.addColorStop(0, "rgba(255,255,255,0.95)");
  g.addColorStop(0.3, hexCss(hex, 0.85));
  g.addColorStop(0.7, hexCss(hex, 0.3));
  g.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = g; x.beginPath(); x.ellipse(32, 62, 24, 34, 0, 0, Math.PI * 2); x.fill();
  return c;
}

function swirlCanvas(hex) {
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const x = c.getContext("2d"), m = 128;
  const g = x.createRadialGradient(m, m, 4, m, m, 128);
  g.addColorStop(0, "rgba(255,255,255,0.75)");
  g.addColorStop(0.35, hexCss(hex, 0.55));
  g.addColorStop(0.85, hexCss(hex, 0.25));
  g.addColorStop(1, hexCss(hex, 0));
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  // three spiral arms of paler light
  x.strokeStyle = "rgba(255,255,255,0.35)"; x.lineWidth = 9; x.lineCap = "round";
  for (let k = 0; k < 3; k++) {
    x.beginPath();
    for (let t = 0; t <= 1; t += 0.02) {
      const a = k * (Math.PI * 2 / 3) + t * 4.2, r = 8 + t * 112;
      const px = m + Math.cos(a) * r, py = m + Math.sin(a) * r;
      if (t === 0) x.moveTo(px, py); else x.lineTo(px, py);
    }
    x.stroke();
  }
  return c;
}

export class PortalSystem {
  constructor(game) {
    this.g = game;
    this.list = [];
    this.on = { red: false, green: false, yellow: false, blue: false, white: false };
    this.apples = [];                 // tree indices, oldest first
    this.hungerDays = 0; this.starvedToday = false;
    this.chestsToday = new Set();
    this.beds = new Set();
    this.t = 0;
    // named places for the map and the teleport list — appended once
    if (!CFG.locations.some((l) => l.id === "portal_red")) {
      for (const id of PORTAL_IDS) {
        const s = this.spot(id);
        // the white one sits under the temple floor: never found from above (r 0), portals.update discovers it
        CFG.locations.push({ id: "portal_" + id, x: s.x, z: s.z, r: id === "white" ? 0 : 12 });
      }
    }
  }
  spot(id) {
    if (id === "white") { const B = P().basement; return { x: B.portal[0], z: B.portal[1], y: B.y, yaw: B.portalYaw }; }
    const [x, z] = P().spots[id];
    return { x, z, y: null, yaw: Math.atan2(-x, -z) };   // its face turned toward the temple
  }
  byId(id) { return this.list.find((p) => p.id === id); }

  // ---------- build ----------
  build() {
    const g = this.g, w = g.world, A = g.assets, scene = g.scene, G = P().geo;
    const asset = A.glb.portal;
    for (const id of PORTAL_IDS) {
      const s = this.spot(id), hex = P().colors[id];
      const y = s.y ?? w.groundHeight(s.x, s.z, 50);
      const sc = id === "white" ? P().whiteScale : 1;
      const grp = new THREE.Group();
      grp.position.set(s.x, y, s.z); grp.rotation.y = s.yaw; grp.scale.setScalar(sc);
      if (asset) grp.add(asset.model.clone());
      else {
        const stone = new THREE.MeshStandardMaterial({ color: 0x6f716b, roughness: 1 });
        const ring = new THREE.Mesh(new THREE.TorusGeometry(G.ringR + 0.3, 0.32, 10, 40), stone); ring.position.y = G.ringY; grp.add(ring);
        for (const sx of [-1, 1]) { const pil = new THREE.Mesh(new THREE.BoxGeometry(0.6, G.bowlY, 0.6), stone); pil.position.set(sx * G.bowlX, G.bowlY / 2, G.bowlZ); grp.add(pil); }
        const base = new THREE.Mesh(new THREE.BoxGeometry(G.ringR * 2 + 1.2, 0.5, 2.2), stone); base.position.y = 0.25; grp.add(base);
      }
      // the emblem on the medallion, both faces
      const dim = new THREE.CanvasTexture(emblemCanvas(id, hex, false)), lit = new THREE.CanvasTexture(emblemCanvas(id, hex, true));
      dim.colorSpace = lit.colorSpace = THREE.SRGBColorSpace;
      const emb = [];
      // update 38: measured from the model — the disc sits flush ON each medallion face, no gap
      for (const [mz, dir] of [[G.medZF, 1], [G.medZB, -1]]) {
        const m = new THREE.Mesh(new THREE.CircleGeometry(G.medR, 28), new THREE.MeshBasicMaterial({ map: dim, transparent: true, polygonOffset: true, polygonOffsetFactor: -1 }));
        m.position.set(0, G.medY, mz + dir * 0.012); if (dir < 0) m.rotation.y = Math.PI;
        grp.add(m); emb.push(m);
      }
      // the ring's light and the swirl inside it (shown once awake)
      const ring = new THREE.Mesh(new THREE.TorusGeometry(G.ringR - 0.1, 0.13, 8, 56),
        new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
      ring.position.set(0, G.ringY, G.swirlZ || 0); grp.add(ring);   // update 39: inside the stone wheel
      const swTex = new THREE.CanvasTexture(swirlCanvas(hex)); swTex.colorSpace = THREE.SRGBColorSpace;
      const swirl = [];
      for (const k of [0, 1]) {
        const m = new THREE.Mesh(new THREE.CircleGeometry(G.ringR - 0.04, 40),
          new THREE.MeshBasicMaterial({ map: swTex, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        m.position.set(0, G.ringY, (G.swirlZ || 0) + (k ? -1 : 1) * 0.03); grp.add(m); swirl.push(m);
      }
      // the bowls' fires: crossed billboards in the portal's colour
      const flTex = new THREE.CanvasTexture(flameCanvas(hex)); flTex.colorSpace = THREE.SRGBColorSpace;
      const flMat = new THREE.MeshBasicMaterial({ map: flTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
      const flames = [];
      for (const sx of [-1, 1]) for (const rot of [0, Math.PI / 2]) {
        // update 38: the flame's base is IN the bowl (the billboard's bottom edge at the rim)
        const f = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.95), flMat);
        f.position.set(sx * G.bowlX, G.bowlY + 0.38, G.bowlZ); f.rotation.y = rot;
        grp.add(f); flames.push(f);
      }
      // the light exists from frame one (a NEW light mid-game recompiles every shader)
      const light = new THREE.PointLight(hex, 0, 16, 2);
      light.position.set(0, G.ringY, 0.6); grp.add(light);
      scene.add(grp);
      // what you cannot walk through: the two pillars and the ring's feet
      const cs = Math.cos(s.yaw), sn = Math.sin(s.yaw);
      const loc = (lx, lz) => [s.x + (lx * cs + lz * sn) * sc, s.z + (-lx * sn + lz * cs) * sc];
      for (const sx of [-1, 1]) { const [px, pz] = loc(sx * G.bowlX, G.bowlZ); w.addTree(px, pz, 0.45 * sc); }
      for (const sx of [-1, 1]) { const [px, pz] = loc(sx * (G.ringR + 0.25), 0); w.addTree(px, pz, 0.5 * sc); }
      this.list.push({ id, x: s.x, z: s.z, y, yaw: s.yaw, grp, emb, dim, lit, ring, swirl, flames, light });
    }
    this.refresh();
  }
  // visuals follow the state
  refresh() {
    for (const p of this.list) {
      const on = this.on[p.id];
      p.ring.visible = on; for (const m of p.swirl) m.visible = on; for (const f of p.flames) f.visible = on;
      p.light.intensity = on ? 6 : 0;
      for (const m of p.emb) { m.material.map = on ? p.lit : p.dim; m.material.needsUpdate = true; }
    }
  }
  update(dt) {
    const g = this.g, p = g.player;
    this.t += dt;
    if (p.hu <= 0 && !p.dead) this.hungerZero();
    for (const pt of this.list) {
      if (!this.on[pt.id]) continue;
      // only animate what is near enough to be seen
      if (Math.hypot(pt.x - p.pos.x, pt.z - p.pos.z) > 160) continue;
      pt.swirl[0].rotation.z = this.t * 0.7; pt.swirl[1].rotation.z = -this.t * 0.45;
      pt.ring.material.opacity = 0.75 + 0.2 * Math.sin(this.t * 2.3);
      pt.light.intensity = 5.5 + Math.sin(this.t * 7.1) * 0.8;
      pt.flames.forEach((f, i) => { const k = 1 + 0.12 * Math.sin(this.t * 9 + i * 1.7); f.scale.set(k, 1 / k + 0.15 * Math.sin(this.t * 6 + i), 1); });
    }
    // the white portal is found by standing beside it, down in the basement
    const wp = this.byId("white");
    if (wp && !g.discovered.has("portal_white") && p.pos.y < wp.y + 2 && Math.hypot(wp.x - p.pos.x, wp.z - p.pos.z) < 8) {
      g.discovered.add("portal_white");
      g.ui.toast(`${STR.discovered}: ${STR.locations.portal_white}`);
      g.audio.sPickup();
    }
  }

  // ---------- progress ----------
  applePicked(tree) {
    if (tree == null || this.on.red || this.apples.includes(tree)) return;
    this.apples.push(tree);
    if (this.apples.length >= P().apples) this.activate("red");
  }
  hungerZero() { if (!this.starvedToday) { this.starvedToday = true; this.hungerDays = 0; } }
  chestOpened(c) {
    if (this.on.green) return;
    this.chestsToday.add(c);
    if (this.chestsToday.size >= P().chests) this.activate("green");
  }
  snakeBite() { this.chestsToday.clear(); }
  slept(x, z) {
    if (this.on.blue) return;
    const w = this.g.world;
    const all = [...w.beds, w.campBed, w.desert && w.desert.bed].filter(Boolean);
    let best = null, bd = 4;
    for (const b of all) { const d = Math.hypot(b.x - x, b.z - z); if (d < bd) { bd = d; best = b; } }
    const key = best ? `${best.x.toFixed(1)},${best.z.toFixed(1)}` : `${Math.round(x)},${Math.round(z)}`;
    this.beds.add(key);
    if (this.beds.size >= P().beds) this.activate("blue");
  }
  onMorning() {
    if (!this.on.yellow) {
      if (this.starvedToday) this.hungerDays = 0; else this.hungerDays++;
      this.starvedToday = false;
      if (this.hungerDays >= P().hungerDays) this.activate("yellow");
    }
    this.chestsToday.clear();
  }
  onDeath() { this.hungerDays = 0; this.starvedToday = true; this.chestsToday.clear(); }
  activate(id) {
    if (this.on[id]) return;
    this.on[id] = true;
    const g = this.g;
    g.ui.toast(STR.portal.activated.replace("%p", STR.locations["portal_" + id]));
    g.audio.blip(520, 0.5, "sine", 0.35, 260);
    setTimeout(() => g.audio.blip(780, 0.6, "sine", 0.3, 200), 260);
    this.refresh();
    if (!this.on.white && PORTAL_IDS.slice(0, 4).every((k) => this.on[k])) this.activate("white");
  }
  progressLine(id) {
    const S = STR.portal, N = P();
    switch (id) {
      case "red": return S.red.replace("%n", this.apples.length).replace("%m", N.apples);
      case "yellow": return S.yellow.replace("%n", this.hungerDays).replace("%m", N.hungerDays);
      case "green": return S.green.replace("%n", this.chestsToday.size).replace("%m", N.chests);
      case "blue": return S.blue.replace("%n", this.beds.size).replace("%m", N.beds);
      default: return S.white.replace("%n", PORTAL_IDS.slice(0, 4).filter((k) => this.on[k]).length).replace("%m", 4);
    }
  }

  // ---------- interaction ----------
  interact(consider, p) {
    for (const pt of this.list) {
      if (Math.abs(p.pos.y - pt.y) > 3) continue;
      const sc = pt.id === "white" ? P().whiteScale : 1;
      // the ring is big: measure from its front step, and hand consider() a point one
      // metre in front of you (the ring's centre is further than the interact radius)
      const fx = pt.x + Math.sin(pt.yaw) * 1.4 * sc, fz = pt.z + Math.cos(pt.yaw) * 1.4 * sc;
      const d = Math.min(Math.hypot(fx - p.pos.x, fz - p.pos.z), Math.hypot(pt.x - p.pos.x, pt.z - p.pos.z));
      if (d > P().useR) continue;
      const ux = (pt.x - p.pos.x) / (Math.hypot(pt.x - p.pos.x, pt.z - p.pos.z) || 1), uz = (pt.z - p.pos.z) / (Math.hypot(pt.x - p.pos.x, pt.z - p.pos.z) || 1);
      consider(p.pos.x + ux, p.pos.z + uz, p.pos.y, `${this.on[pt.id] ? STR.portal.use : STR.portal.investigate} [${STR.interact}]`, () => this.open(pt));
    }
  }
  open(pt) {
    const g = this.g, S = STR.portal, name = STR.locations["portal_" + pt.id];
    if (!this.on[pt.id]) {
      g.npcPanel(name, [S.locked, this.progressLine(pt.id)]);
      return;
    }
    const here = "portal_" + pt.id;
    const dests = CFG.locations.filter((l) => l.id !== here && g.discovered.has(l.id));
    if (!dests.length) { g.npcPanel(name, [S.awake, S.noDest]); return; }
    this.openMap(pt, dests);
  }
  // update 38: the teleport MAP — W/A/S/D move the mark between the places you know, F goes, one button says no
  openMap(pt, dests) {
    const g = this.g, S = STR.portal;
    g.menuOpen = true;
    const size = Math.min(640, Math.floor(Math.min(window.innerWidth * 0.86, window.innerHeight * 0.62)));
    const s = g.ui.screen(`
      <h1 style="font-size:24px;margin-bottom:4px">${STR.locations["portal_" + pt.id]}</h1>
      <div style="font-size:13px;opacity:.85;margin-bottom:6px">${S.pickHint}</div>
      <canvas id="tpMap" width="${size}" height="${size}" style="border-radius:8px;max-width:92vw;max-height:62vh"></canvas>
      <div id="tpName" style="font-size:18px;font-weight:700;margin:8px 0 6px">&nbsp;</div>
      <button id="tpNo" style="font-size:15px;padding:9px 26px">${S.dontGo}</button>`);
    g.ui.navEls = null;
    const cnv = s.querySelector("#tpMap");
    const sc = (size * 0.45) / CFG.world.square;
    const tx = (x) => size / 2 + x * sc, ty = (z) => size / 2 + z * sc;
    // start on the nearest place
    let sel = 0, bd = 1e18;
    dests.forEach((l, i) => { const d = Math.hypot(l.x - pt.x, l.z - pt.z); if (d < bd) { bd = d; sel = i; } });
    const draw = () => {
      g.map.drawFull(cnv);
      const c = cnv.getContext("2d");
      // you: a ring where this portal stands
      c.beginPath(); c.arc(tx(pt.x), ty(pt.z), 7, 0, Math.PI * 2); c.lineWidth = 2.5; c.strokeStyle = "#ffffff"; c.stroke();
      dests.forEach((l, i) => {
        const x = tx(l.x), y = ty(l.z), on = i === sel;
        c.beginPath(); c.arc(x, y, on ? 11 : 7, 0, Math.PI * 2);
        c.fillStyle = on ? "rgba(255,190,80,.35)" : "rgba(255,255,255,.12)"; c.fill();
        c.lineWidth = on ? 3 : 1.5; c.strokeStyle = on ? "#ffb347" : "rgba(255,220,160,.8)"; c.stroke();
        if (on) { c.beginPath(); c.arc(x, y, 16 + 3 * Math.sin(performance.now() / 180), 0, Math.PI * 2); c.lineWidth = 1.5; c.strokeStyle = "rgba(255,179,71,.7)"; c.stroke(); }
      });
      s.querySelector("#tpName").textContent = S.goTo.replace("%p", STR.locations[dests[sel].id] || dests[sel].id);
    };
    draw();
    const anim = setInterval(() => { if (!document.body.contains(cnv)) { clearInterval(anim); return; } draw(); }, 120);
    const close = () => { clearInterval(anim); g.ui.closeScreen(); g.resume(); };
    s.querySelector("#tpNo").addEventListener("click", close);
    // W/A/S/D: the place that lies most in that direction from the current mark
    const DIRS = { KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] };
    g.ui.keyHook = (e) => {
      if (DIRS[e.code]) {
        const [ux, uz] = DIRS[e.code], cur = dests[sel];
        let best = -1, bs = -1e9;
        dests.forEach((l, i) => {
          if (i === sel) return;
          const dx = l.x - cur.x, dz = l.z - cur.z, d = Math.hypot(dx, dz) || 1;
          const dot = (dx * ux + dz * uz) / d;
          if (dot < 0.35) return;
          const score = dot * 2 - d / 900;   // mostly the direction, a little the distance
          if (score > bs) { bs = score; best = i; }
        });
        if (best >= 0) { sel = best; draw(); g.audio.sSelect(); }
        return true;
      }
      if (e.code === "KeyF" || e.code === "Enter" || e.code === "Space") { const id = dests[sel].id; close(); this.teleport(id); return true; }
      return false;   // Escape falls through to the screen's own handling (the button)
    };
  }
  // where you land: in front of a portal, or a free spot beside a place's marker
  arrival(id) {
    if (id.startsWith("portal_")) {
      const pt = this.byId(id.slice(7));
      const sc = pt.id === "white" ? P().whiteScale : 1;
      return { x: pt.x + Math.sin(pt.yaw) * 3.4 * sc, z: pt.z + Math.cos(pt.yaw) * 3.4 * sc, y: pt.y, yaw: pt.yaw + Math.PI };
    }
    const w = this.g.world, L = CFG.locations.find((l) => l.id === id);
    const fixed = P().arrivals[id];
    const cand = fixed ? [fixed] : [];
    cand.push([L.x, L.z]);
    for (const r of [5, 9, 14, 20]) for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; cand.push([L.x + Math.cos(a) * r, L.z + Math.sin(a) * r]); }
    for (const [x, z] of cand) {
      if (Math.abs(x) > CFG.world.square - 3 || Math.abs(z) > CFG.world.square - 3) continue;
      const y = w.groundHeight(x, z, 40);
      if (w.desert.inRiver(x, z) || w.desert.inOasisWater(x, z) || w.lakePenetration(x, z) > -1) continue;
      const c = w.collide(x, z, 0.45, y);
      if (Math.hypot(c.x - x, c.z - z) < 0.02) return { x, z, y, yaw: Math.atan2(L.x - x, L.z - z) };
    }
    return { x: L.x, z: L.z, y: w.groundHeight(L.x, L.z, 40), yaw: 0 };
  }
  async teleport(id) {
    const g = this.g, p = g.player;
    const to = this.arrival(id);
    g.menuOpen = true;
    // update 38: the whoosh and a white flash
    if (g.audio.buf.teleport) g.audio.play("teleport", { vol: 1 }); else g.audio.blip(300, 0.7, "sine", 0.3, 500);
    const flash = document.createElement("div");
    flash.style.cssText = "position:fixed;inset:0;background:#fff;opacity:0;pointer-events:none;z-index:60;transition:opacity .35s";
    document.body.appendChild(flash);
    requestAnimationFrame(() => { flash.style.opacity = "1"; });
    await new Promise((r) => setTimeout(r, 420));
    p.pos.set(to.x, to.y, to.z); p.vel.set(0, 0, 0); p.yaw = to.yaw; p.pitch = 0;
    if (g.camera) g.camera.position.set(to.x, to.y + 1.6, to.z);
    await new Promise((r) => setTimeout(r, 150));
    flash.style.transition = "opacity .9s"; flash.style.opacity = "0";
    setTimeout(() => flash.remove(), 1000);
    g.menuOpen = false;
    g.ui.toast(STR.portal.arrive);
  }

  // ---------- the map ----------
  paintGlyphs(c, tx, ty, s, disc) {
    for (const pt of this.list) {
      if (!disc.has("portal_" + pt.id)) continue;
      const hex = P().colors[pt.id];
      c.beginPath(); c.arc(tx(pt.x), ty(pt.z), 7, 0, Math.PI * 2);
      c.lineWidth = 3; c.strokeStyle = "#" + hex.toString(16).padStart(6, "0"); c.stroke();
      c.lineWidth = 1; c.strokeStyle = "rgba(0,0,0,.6)"; c.stroke();
    }
  }
}
