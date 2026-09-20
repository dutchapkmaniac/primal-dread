import { CFG, ASSET_V } from "./config.js";
import { STR } from "../strings.js";

// Top-down expedition map: the full parchment map (pause menu) and the small
// living minimap in the HUD corner. Terrain is always drawn; NAMED landmarks
// appear only after the player has actually stood there (game.discovered).

const INK = "#3a3226";          // map ink on parchment
const INK_SOFT = "rgba(58,50,38,.55)";
const FOREST = "rgba(74,90,58,.5)";
const FOREST_DEEP = "rgba(58,74,46,.6)";
const WATER = "rgba(94,122,128,.85)";
const SAND = "rgba(160,138,92,.9)";
const ACCENT = "#b06a2c";       // the safety-orange accent — the player

export class GameMap {
  constructor(game) {
    this.game = game;
    this.parch = null;
    const im = new Image();
    im.onload = () => { this.parch = im; };
    im.src = "./assets/map_parch.webp" + ASSET_V;
  }

  // ---- shared world layer painter ----
  // tx/ty map world coords to canvas pixels.
  paintWorld(c, tx, ty, s, mini) {
    const W = CFG.world;
    // forest rings (old ring, expansion, deep jungle)
    const ring = (r0, r1, fill) => {
      c.beginPath();
      c.arc(tx(0), ty(0), r1 * s, 0, Math.PI * 2);
      c.arc(tx(0), ty(0), r0 * s, 0, Math.PI * 2, true);
      c.fillStyle = fill;
      c.fill("evenodd");
    };
    ring(W.treeMinR, W.treeMaxR, FOREST);
    ring(CFG.newArea.treeMinR, CFG.newArea.treeMaxR, FOREST_DEEP);
    ring(CFG.ring2.treeMinR, CFG.ring2.treeMaxR, FOREST_DEEP);
    ring(CFG.ring3.treeMinR, CFG.ring3.treeMaxR, FOREST_DEEP);
    ring(CFG.ring4.treeMinR, CFG.ring4.treeMaxR, FOREST_DEEP);   // the 10% expansion band
    ring(CFG.ring5.treeMinR, CFG.ring5.treeMaxR, FOREST_DEEP);   // the +20% band (update 27)
    ring(CFG.ring6.treeMinR, CFG.ring6.treeMaxR, FOREST_DEEP);   // the ring6 band (update 29)
    ring(CFG.ring7.treeMinR, CFG.ring7.treeMaxR, FOREST_DEEP);   // the ring7 band (update 36)
    // update 36: the desert, its river and the three bridges
    if (this.game.desert) this.game.desert.paint(c, tx, ty, s, mini);
    // the lake with its beach
    for (const l of [{ x: CFG.lake.x, z: CFG.lake.z, r: CFG.lake.r }, ...CFG.lake.lobes]) {
      c.beginPath();
      c.arc(tx(l.x), ty(l.z), (l.r + CFG.lake.beach) * s, 0, Math.PI * 2);
      c.fillStyle = SAND;
      c.fill();
    }
    for (const l of [{ x: CFG.lake.x, z: CFG.lake.z, r: CFG.lake.r }, ...CFG.lake.lobes]) {
      c.beginPath();
      c.arc(tx(l.x), ty(l.z), l.r * s, 0, Math.PI * 2);
      c.fillStyle = WATER;
      c.fill();
    }
    // the ROCKY MOUNTAIN — a grey shoulder over the north-west corner
    const M = CFG.mountain;
    c.save();
    c.beginPath();
    c.rect(tx(-W.square), ty(-W.square), 2 * W.square * s, 2 * W.square * s);
    c.clip();
    c.beginPath();
    c.arc(tx(M.cx), ty(M.cz), M.r * s, 0, Math.PI * 2);
    c.fillStyle = mini ? "rgba(112,115,108,.85)" : "#70736c";
    c.fill();
    c.beginPath();
    c.arc(tx(M.cx), ty(M.cz), M.cliffLo * s, 0, Math.PI * 2);
    c.fillStyle = mini ? "rgba(128,131,124,.85)" : "#80837c";
    c.fill();
    c.beginPath();
    c.arc(tx(M.cx), ty(M.cz), M.wallD * s, 0, Math.PI * 2);
    c.fillStyle = mini ? "rgba(146,149,142,.9)" : "#92958e";
    c.fill();
    c.restore();
    // the sandy path
    c.strokeStyle = SAND;
    c.lineWidth = Math.max(1.5, W.pathWidth * s);
    c.lineCap = "round";
    c.lineJoin = "round";
    c.beginPath();
    W.pathPoints.forEach(([x, z], i) => (i ? c.lineTo(tx(x), ty(z)) : c.moveTo(tx(x), ty(z))));
    c.stroke();
    // the FULL map gets the cartographer's touch
    if (!mini) this.paintPro(c, tx, ty, s);
    // world edge — the SQUARE frontier
    c.beginPath();
    c.rect(tx(-W.square), ty(-W.square), 2 * W.square * s, 2 * W.square * s);
    c.strokeStyle = mini ? "rgba(200,190,160,.5)" : INK;
    c.lineWidth = mini ? 1.5 : 2.5;
    c.stroke();
  }

  // ---- update 17: a REAL expedition map — drawn, not flood-filled ----
  paintPro(c, tx, ty, s) {
    const W = CFG.world;
    let seed = 42;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    // forests as stippled tree glyphs
    const tree = (x, z, r) => {
      const px = tx(x), py = ty(z);
      c.beginPath(); c.moveTo(px, py); c.lineTo(px, py - r * 0.5);
      c.strokeStyle = "#4a3b28"; c.lineWidth = 0.8; c.stroke();
      c.beginPath(); c.arc(px, py - r * 0.55, r * 0.62, 0, Math.PI * 2);
      c.fillStyle = rnd() < 0.5 ? "#3d4a35" : "#485841"; c.fill();
      c.strokeStyle = "rgba(28,36,24,.55)"; c.lineWidth = 0.7; c.stroke();
    };
    for (let i = 0; i < 1800; i++) {
      const x = (rnd() * 2 - 1) * (W.square - 8), z = (rnd() * 2 - 1) * (W.square - 8);
      const r = Math.hypot(x, z);
      const wooded = (r > W.treeMinR && r < W.treeMaxR)
        || (r > CFG.newArea.treeMinR && r < CFG.ring7.treeMaxR)
        || r > W.boundaryR;
      if (!wooded) continue;
      if (this.game.world.inMountain(x, z)) continue;
      if (this.game.world.desert.inDesert(x, z) || this.game.world.desert.riverDist(x, z) < 20) continue;   // update 36
      if (Math.hypot(x - CFG.lake.x, z - CFG.lake.z) < CFG.lake.r + 14) continue;
      if (Math.hypot(x - CFG.ruins.x, z - CFG.ruins.z) < 26) continue;
      if (Math.abs(x - CFG.farm.x) < CFG.farm.hw + 4 && Math.abs(z - CFG.farm.z) < CFG.farm.hd + 4) continue;   // update 29
      tree(x, z, 4.2 + rnd() * 3.4);
    }
    // the mountain: hatched ridgelines + a snow-capped peak
    const M = CFG.mountain;
    c.lineWidth = 1.2;
    for (let i = 0; i < 52; i++) {
      const a = rnd() * Math.PI / 2, d = M.wallD * 0.4 + rnd() * (M.r - M.wallD * 0.4 - 10);
      const x = M.cx + Math.cos(a) * d, z = M.cz + Math.sin(a) * d;
      if (Math.abs(x) > W.square - 6 || Math.abs(z) > W.square - 6) continue;
      const px = tx(x), py = ty(z), l = 3 + rnd() * 5;
      c.beginPath(); c.moveTo(px - l, py + l * 0.55); c.lineTo(px, py - l * 0.65); c.lineTo(px + l, py + l * 0.55);
      c.strokeStyle = "#4e514b"; c.stroke();
    }
    const pk = { x: M.cx + 58, z: M.cz + 58 };
    c.beginPath(); c.moveTo(tx(pk.x) - 11, ty(pk.z) + 8); c.lineTo(tx(pk.x), ty(pk.z) - 11); c.lineTo(tx(pk.x) + 11, ty(pk.z) + 8);
    c.closePath(); c.fillStyle = "#83867f"; c.fill(); c.strokeStyle = "#3c3f39"; c.lineWidth = 1.4; c.stroke();
    c.beginPath(); c.moveTo(tx(pk.x) - 4.5, ty(pk.z) - 3); c.lineTo(tx(pk.x), ty(pk.z) - 11); c.lineTo(tx(pk.x) + 4.5, ty(pk.z) - 3);
    c.closePath(); c.fillStyle = "#e8eae6"; c.fill();
    // the lake: inked shoreline + wave strokes
    c.lineWidth = 1.6;
    for (const l of [{ x: CFG.lake.x, z: CFG.lake.z, r: CFG.lake.r }, ...CFG.lake.lobes]) {
      c.beginPath(); c.arc(tx(l.x), ty(l.z), l.r * s + 1, 0, Math.PI * 2);
      c.strokeStyle = "#3a5a6a"; c.stroke();
    }
    for (let i = 0; i < 8; i++) {
      const px = tx(CFG.lake.x + (rnd() - 0.5) * 44), py = ty(CFG.lake.z + (rnd() - 0.5) * 44);
      c.beginPath(); c.moveTo(px - 5, py); c.quadraticCurveTo(px, py - 3, px + 5, py);
      c.strokeStyle = "rgba(225,238,242,.55)"; c.lineWidth = 1; c.stroke();
    }
    // building glyphs appear only once a place is FOUND — the map keeps its secrets
    const disc = this.game.discovered || new Set();
    if (disc.has("ruinsv")) {
      const RV = CFG.ruins;
      c.lineWidth = 1;
      for (const [ox, oz, w2, h2] of [[-11, -7, 7, 6], [11, -9, 7, 9], [-1, 11, 7, 6], [14, 6, 6, 5], [-14, 8, 6, 5]]) {
        c.fillStyle = "#8d8a80"; c.fillRect(tx(RV.x + ox) - w2 / 2, ty(RV.z + oz) - h2 / 2, w2, h2);
        c.strokeStyle = "#4a473f"; c.strokeRect(tx(RV.x + ox) - w2 / 2, ty(RV.z + oz) - h2 / 2, w2, h2);
      }
    }
    if (disc.has("camping")) {
      const CP = CFG.camp;
      c.beginPath(); c.moveTo(tx(CP.x) - 7, ty(CP.z) + 5); c.lineTo(tx(CP.x), ty(CP.z) - 7); c.lineTo(tx(CP.x) + 7, ty(CP.z) + 5);
      c.closePath(); c.fillStyle = "#a8503c"; c.fill(); c.strokeStyle = "#3c2018"; c.stroke();
    }
    if (disc.has("lighthouse")) {
      const LH = CFG.lighthouse;
      c.fillStyle = "#d8d4c6"; c.fillRect(tx(LH.x) - 3, ty(LH.z) - 11, 6, 15);
      c.fillStyle = "#a8503c"; c.fillRect(tx(LH.x) - 3, ty(LH.z) - 7, 6, 3); c.fillRect(tx(LH.x) - 3, ty(LH.z) - 1, 6, 3);
      c.strokeStyle = "#3c3630"; c.strokeRect(tx(LH.x) - 3, ty(LH.z) - 11, 6, 15);
    }
    if (disc.has("temple")) {
      c.fillStyle = "#7a766a"; c.fillRect(tx(0) - 5, ty(0) - 5, 10, 10);
      c.strokeStyle = "#3c3830"; c.strokeRect(tx(0) - 5, ty(0) - 5, 10, 10);
    }
    if (disc.has("hut")) {
      const [hx2, hz2] = W.hutPos;
      c.fillStyle = "#6e5636"; c.fillRect(tx(hx2) - 4, ty(hz2) - 3, 8, 6);
      c.beginPath(); c.moveTo(tx(hx2) - 5, ty(hz2) - 3); c.lineTo(tx(hx2), ty(hz2) - 8); c.lineTo(tx(hx2) + 5, ty(hz2) - 3);
      c.closePath(); c.fillStyle = "#4a3b28"; c.fill();
    }
    if (this.game.desert) this.game.desert.paintGlyphs(c, tx, ty, s, disc);   // update 36
    // update 29: Dirk's farm — house, the fenced pasture and the berry rows
    if (disc.has("farm")) {
      const F = CFG.farm, HS = F.house, P = F.pasture, B = F.field;
      // the pasture: a dashed fence rectangle with a lighter grass fill
      c.fillStyle = "rgba(146,160,96,.55)";
      c.fillRect(tx(P.x0), ty(P.z0), (P.x1 - P.x0) * s, (P.z1 - P.z0) * s);
      c.save(); c.setLineDash([2, 2]); c.lineWidth = 1; c.strokeStyle = "#5a4a30";
      c.strokeRect(tx(P.x0), ty(P.z0), (P.x1 - P.x0) * s, (P.z1 - P.z0) * s);
      c.restore();
      // the field: dark soil with blueberry dots (deterministic — paintPro's seeded rnd)
      c.fillStyle = "rgba(70,56,40,.6)";
      c.fillRect(tx(B.x0), ty(B.z0), (B.x1 - B.x0) * s, (B.z1 - B.z0) * s);
      c.fillStyle = "#3b3f7a";
      for (let i = 0; i < 16; i++) {
        c.beginPath(); c.arc(tx(B.x0 + rnd() * (B.x1 - B.x0)), ty(B.z0 + rnd() * (B.z1 - B.z0)), 1.1, 0, Math.PI * 2); c.fill();
      }
      // the house: white body, dark roof line, drawn with its long side along z
      const hx3 = tx(HS.x), hz3 = ty(HS.z), hw3 = Math.max(6, HS.hd * s), hd3 = Math.max(7, HS.hw * s);
      c.fillStyle = "#e4e0d4"; c.fillRect(hx3 - hw3 / 2, hz3 - hd3 / 2, hw3, hd3);
      c.strokeStyle = "#3c3630"; c.lineWidth = 1; c.strokeRect(hx3 - hw3 / 2, hz3 - hd3 / 2, hw3, hd3);
      c.beginPath(); c.moveTo(hx3, hz3 - hd3 / 2); c.lineTo(hx3, hz3 + hd3 / 2); c.strokeStyle = "#4a4e52"; c.stroke();
    }
  }

  paintLandmarks(c, tx, ty, s, mini) {
    const disc = this.game.discovered;
    c.textAlign = "center";
    for (const loc of CFG.locations) {
      if (!disc.has(loc.id)) continue;
      const x = tx(loc.x), y = ty(loc.z);
      c.beginPath();
      c.arc(x, y, mini ? 3 : 5, 0, Math.PI * 2);
      c.fillStyle = mini ? "#e8ceac" : INK;
      c.fill();
      c.lineWidth = mini ? 1 : 1.6;
      c.strokeStyle = mini ? "rgba(0,0,0,.6)" : "rgba(232,206,172,.8)";
      c.stroke();
      if (!mini) {
        c.font = "700 13px 'Segoe UI',sans-serif";
        c.fillStyle = INK;
        c.strokeStyle = "rgba(214,198,158,.75)";
        c.lineWidth = 3;
        const label = STR.locations[loc.id] || loc.id;
        c.strokeText(label, x, y - 9);
        c.fillText(label, x, y - 9);
      }
    }
  }

  paintPlayer(c, x, y, yaw, r) {
    c.save();
    c.translate(x, y);
    c.rotate(-yaw); // player yaw: 0 = north (-Z); canvas up = north
    c.beginPath();
    c.moveTo(0, -r);
    c.lineTo(r * 0.62, r * 0.8);
    c.lineTo(0, r * 0.38);
    c.lineTo(-r * 0.62, r * 0.8);
    c.closePath();
    c.fillStyle = ACCENT;
    c.fill();
    c.lineWidth = 1.4;
    c.strokeStyle = "rgba(0,0,0,.65)";
    c.stroke();
    c.restore();
  }

  // ---- the full expedition map (pause menu / start screen) ----
  drawFull(canvas) {
    const size = canvas.width;
    const c = canvas.getContext("2d");
    c.clearRect(0, 0, size, size);
    if (this.parch) c.drawImage(this.parch, 0, 0, size, size);
    else { c.fillStyle = "#b8a87c"; c.fillRect(0, 0, size, size); }
    // scale keys on the SQUARE now — the 10% expansion must stay in frame
    const s = (size * 0.45) / CFG.world.square;
    const tx = (x) => size / 2 + x * s;
    const ty = (z) => size / 2 + z * s;
    // update 16: the WHOLE square is walkable now — corner forests included.
    // Ground parchment across the full frontier, forest wash over the corners.
    const m = size * 0.04;
    const sq = CFG.world.square * s;
    c.save();
    c.beginPath();
    c.rect(size / 2 - sq, size / 2 - sq, 2 * sq, 2 * sq);
    c.clip();
    if (this.parch) c.drawImage(this.parch, 0, 0, size, size);
    else { c.fillStyle = "#b8a87c"; c.fillRect(0, 0, size, size); }
    // the corner wilds: forest green outside the old circle
    c.beginPath();
    c.rect(size / 2 - sq, size / 2 - sq, 2 * sq, 2 * sq);
    c.arc(size / 2, size / 2, CFG.world.boundaryR * s, 0, Math.PI * 2, true);
    c.fillStyle = "#46523e";
    c.fill("evenodd");
    c.restore();
    c.strokeStyle = INK;
    c.lineWidth = 2.5;
    c.strokeRect(m, m, size - 2 * m, size - 2 * m);
    this.paintWorld(c, tx, ty, s, false);
    this.paintLandmarks(c, tx, ty, s, false);
    const p = this.game.player;
    if (p) this.paintPlayer(c, tx(p.pos.x), ty(p.pos.z), p.yaw, 8);
    // north rose in the corner
    c.font = "800 15px 'Segoe UI',sans-serif";
    c.fillStyle = INK;
    c.textAlign = "center";
    c.fillText("N", size - 26, 30);
    c.beginPath();
    c.moveTo(size - 26, 36); c.lineTo(size - 26, 54);
    c.strokeStyle = INK; c.lineWidth = 2; c.stroke();
    c.beginPath();
    c.moveTo(size - 26, 36); c.lineTo(size - 31, 43); c.lineTo(size - 21, 43);
    c.closePath(); c.fill();
  }

  // ---- the HUD minimap: player-centered, zoomed, round ----
  drawMini(canvas) {
    const size = canvas.width;
    const c = canvas.getContext("2d");
    const p = this.game.player;
    if (!p) return;
    c.clearRect(0, 0, size, size);
    c.save();
    c.beginPath();
    c.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
    c.clip();
    c.fillStyle = "rgba(14,18,12,.78)";
    c.fillRect(0, 0, size, size);
    const s = size / 110; // the minimap window spans ~110 m across
    const tx = (x) => size / 2 + (x - p.pos.x) * s;
    const ty = (z) => size / 2 + (z - p.pos.z) * s;
    // ground tint inside the playable circle
    c.beginPath();
    c.arc(tx(0), ty(0), CFG.world.boundaryR * s, 0, Math.PI * 2);
    c.fillStyle = "rgba(58,66,50,.55)";
    c.fill();
    this.paintWorld(c, tx, ty, s, true);
    this.paintLandmarks(c, tx, ty, s, true);
    this.paintPlayer(c, size / 2, size / 2, p.yaw, 7);
    c.restore();
    // rim
    c.beginPath();
    c.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
    c.strokeStyle = "rgba(140,150,130,.45)";
    c.lineWidth = 2;
    c.stroke();
  }
}
