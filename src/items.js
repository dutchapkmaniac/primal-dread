import { CFG, ASSET_V } from "./config.js";
import { STR } from "../strings.js";

// Icon sheet: 4x4 grid, 13 icons, generated on a blue key background.
// Sliced + chroma-keyed at load time into per-item canvases.
export const ICON_ORDER = [
  "bandage", "energy_drink", "apple", "raw_pork",
  "cooked_pork", "raw_chicken", "cooked_chicken", "egg",
  "cooked_eggs", "raw_wolf", "cooked_wolf", "wolf_fur",
  "knife",
];

export const icons = {}; // id -> canvas (or null)

// versioned + one retry: icon sheets must survive a network blip
function loadImage(src) {
  return new Promise((res) => {
    const im = new Image();
    let retried = false;
    im.onload = () => res(im);
    im.onerror = () => {
      if (!retried) { retried = true; setTimeout(() => { im.src = src + ASSET_V + "&r=1"; }, 400); }
      else res(null);
    };
    im.src = src + ASSET_V;
  });
}

export async function loadIcons() {
  const img = await loadImage("./assets/ui_icons.png");
  const loaded = !!img;
  for (let i = 0; i < ICON_ORDER.length; i++) {
    const id = ICON_ORDER[i];
    if (!loaded) { icons[id] = fallbackIcon(id); continue; }
    const cell = img.width / 4;
    const cnv = document.createElement("canvas");
    cnv.width = cnv.height = 128;
    const ctx = cnv.getContext("2d");
    ctx.drawImage(img, (i % 4) * cell, Math.floor(i / 4) * cell, cell, cell, 0, 0, 128, 128);
    chromaKey(ctx, 128, 128);
    icons[id] = cnv;
  }
  // second generated sheet: expansion items (4x2 grid, 7 icons)
  const ORDER2 = ["rope", "branch", "tinderbox", "fishing_rod", "raw_fish", "cooked_fish", "machete"];
  const im2 = await loadImage("./assets/ui_icons2.png");
  if (im2) {
    const cell = im2.width / 4;
    for (let i = 0; i < ORDER2.length; i++) {
      const cnv = document.createElement("canvas");
      cnv.width = cnv.height = 128;
      const ctx = cnv.getContext("2d");
      ctx.drawImage(im2, (i % 4) * cell, Math.floor(i / 4) * cell, cell, cell, 0, 0, 128, 128);
      chromaKey(ctx, 128, 128);
      icons[ORDER2[i]] = cnv;
    }
  } else {
    for (const id of ORDER2) icons[id] = fallbackIcon(id);
  }
  // standalone generated icons (added after the original sheet)
  await Promise.all([
    ["silver_dagger", "./assets/ui_dagger.png"], ["torch", "./assets/ui_torch.png"], ["wine", "./assets/ui_wine.png"],
    ["croc_skin", "./assets/ui_crocskin.png"], ["spear", "./assets/ui_spear.png"],
    ["raw_trex", "./assets/ui_rawtrex.png"], ["cooked_trex", "./assets/ui_cookedtrex.png"],
    ["trex_tooth", "./assets/ui_tooth.png"], ["fur_cloak", "./assets/ui_furcloak.png"],
    ["super_energy_drink", "./assets/ui_superdrink.png"], ["axe", "./assets/ui_axe.png"],
    ["needle", "./assets/ui_needle.png"], ["thread", "./assets/ui_thread.png"],
    ["wolf_bag", "./assets/ui_wolfbag.png"], ["goggles", "./assets/ui_goggles.png"],
    ["raw_goat", "./assets/ui_rawgoat.png"], ["cooked_goat", "./assets/ui_cookedgoat.png"],
    ["goat_horn", "./assets/ui_goathorn.png"], ["climbing_anchor", "./assets/ui_anchor.png"],
    ["silver_bar", "./assets/ui_silverbar.png"],
    ["hammer", "./assets/ui_hammer.png"], ["broken_hook", "./assets/ui_brokenhook.png"],
    ["lit_torch", "./assets/ui_torch.png"], ["wolf_tooth", "./assets/ui_wolftooth.png"],
    ["crossbow", "./assets/ui_crossbow.png"], ["arrow", "./assets/ui_arrow.png"],
    ["silver_arrow", "./assets/ui_silverarrow.png"], ["feather", "./assets/ui_feather.png"],
    ["pestle", "./assets/ui_pestle.png"], ["silver_dust", "./assets/ui_silverdust.png"],
    ["chocolate", "./assets/ui_chocolate.png"], ["death_compass", "./assets/ui_deathcompass.png"],
    ["scroll_spear", "./assets/ui_scroll_spear.png"], ["scroll_arrows", "./assets/ui_scroll_arrows.png"],
    ["scroll_silver_arrows", "./assets/ui_scroll_silver.png"], ["scroll_pestle", "./assets/ui_scroll_pestle.png"],
    ["scroll_climb", "./assets/ui_scroll_climb.png"], ["scroll_crossbow_use", "./assets/ui_scroll_crossbow.png"],
    // update 29: Dirk's farm
    ["cooked_beef", "./assets/ui_cookedbeef.png"], ["blueberries", "./assets/ui_blueberries.png"],
    ["raw_beef", "./assets/ui_rawbeef.png"],   // update 30
    ["lemon", "./assets/ui_lemon.png"], ["bowl", "./assets/ui_bowl.png"],
    ["bowl_milk", "./assets/ui_bowlmilk.png"], ["bowl_yogurt", "./assets/ui_bowlyogurt.png"],
    ["bowl_yogurt_blueberries", "./assets/ui_bowlyogurtberries.png"], ["scroll_yogurt", "./assets/ui_scroll_yogurt.png"],
    // update 35: Elisia
    ["trex_dagger", "./assets/ui_trexdagger.png"], ["holy_water", "./assets/ui_holywater.png"],
    ["unholy_water", "./assets/ui_unholywater.png"], ["unholy_tiara", "./assets/ui_unholytiara.png"],
    ["water_bottle", "./assets/ui_waterbottle.png"],   // update 36
    ["imp_tooth", "./assets/ui_imptooth.png"], ["imp_dagger", "./assets/ui_impdagger.png"],   // update 38
  ].map(async ([id, url]) => {
    const im = await loadImage(url);
    if (!im) { icons[id] = fallbackIcon(id); return; }
    const cnv = document.createElement("canvas");
    cnv.width = cnv.height = 128;
    const ctx = cnv.getContext("2d");
    ctx.drawImage(im, 0, 0, 128, 128);
    // icons keyed OFFLINE ship with transparent corners — re-keying them
    // would eat any blue in the art itself (ask the super energy drink)
    const c = ctx.getImageData(0, 0, 1, 1).data[3] + ctx.getImageData(127, 0, 1, 1).data[3]
      + ctx.getImageData(0, 127, 1, 1).data[3] + ctx.getImageData(127, 127, 1, 1).data[3];
    if (c > 0) chromaKey(ctx, 128, 128);
    icons[id] = cnv;
  }));
  // the BURNING torch shares the torch art — plus a live flame glow, so the
  // two torches never look like the same item in a slot
  if (icons.lit_torch) {
    const ctx = icons.lit_torch.getContext("2d");
    const gr = ctx.createRadialGradient(70, 26, 4, 70, 26, 44);
    gr.addColorStop(0, "rgba(255,225,130,.95)");
    gr.addColorStop(0.4, "rgba(255,155,45,.55)");
    gr.addColorStop(1, "rgba(255,120,20,0)");
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, 128, 128);
  }
}

// Remove the blue key background (including anti-aliased edges).
function chromaKey(ctx, w, h) {
  const d = ctx.getImageData(0, 0, w, h);
  const p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    const r = p[i], g = p[i + 1], b = p[i + 2];
    const blueness = b - Math.max(r, g);
    if (blueness > 60) p[i + 3] = 0;
    else if (blueness > 25) p[i + 3] = Math.round(255 * (1 - (blueness - 25) / 35));
  }
  ctx.putImageData(d, 0, 0);
}

function fallbackIcon(id) {
  const colors = {
    bandage: "#d8d4c8", energy_drink: "#b06a2c", apple: "#a8422d",
    raw_pork: "#c4838a", cooked_pork: "#8a5a34", raw_chicken: "#d9c3ad",
    cooked_chicken: "#a3702f", egg: "#e0d6b8", cooked_eggs: "#d8b04c",
    raw_wolf: "#7a3d42", cooked_wolf: "#5c3a26", wolf_fur: "#8a8d90", wolf_tooth: "#e8e2d2", knife: "#9aa0a6",
    silver_dagger: "#c9ced4", fur_cloak: "#6e7173", spear: "#8a6f4a",
    rope: "#a08a5c", branch: "#6e5636", tinderbox: "#7a7d80", fishing_rod: "#8a6f4a",
    raw_fish: "#7a97a0", cooked_fish: "#a3702f", machete: "#aab0b6", torch: "#c98a3a",
    wine: "#5c2431", croc_skin: "#5a6b42",
    raw_trex: "#a85a4e", cooked_trex: "#7a4a26", trex_tooth: "#ded8c4",
    super_energy_drink: "#3a6ac8", axe: "#8a8f96", needle: "#c9ced4",
    thread: "#8a6f4a", wolf_bag: "#7d8083", goggles: "#4a7a3a", lit_torch: "#e8a040",
    raw_goat: "#b06a5e", cooked_goat: "#96662e", goat_horn: "#a89880",
    climbing_anchor: "#9aa0a6", silver_bar: "#d4d9de",
    hammer: "#7a7d80", broken_hook: "#8a6f5a",
    crossbow: "#5a4a36", arrow: "#8a6f4a", silver_arrow: "#c9ced4",
    feather: "#e0dcd0", pestle: "#8a8d86", silver_dust: "#d4d9de",
    chocolate: "#5c3a26", death_compass: "#7a6a4a",
    scroll_spear: "#c9b98a", scroll_arrows: "#c9b98a", scroll_silver_arrows: "#c9ced4",
    scroll_pestle: "#c9b98a", scroll_climb: "#9ab06a", scroll_crossbow_use: "#c9a06a",
    cooked_beef: "#7a4a26", raw_beef: "#a8303a", blueberries: "#3a4a8c", lemon: "#d8c23a", bowl: "#a08a5c",
    bowl_milk: "#e8e4d8", bowl_yogurt: "#ece6d4", bowl_yogurt_blueberries: "#8a7aa8", scroll_yogurt: "#e0d8b0",
    trex_dagger: "#e8dcc4", holy_water: "#f0e2b0", unholy_water: "#4a1018", unholy_tiara: "#3a3438",
    imp_tooth: "#3a3a3c", imp_dagger: "#2c2c30",
    water_bottle: "#5a3a22",
  };
  const cnv = document.createElement("canvas");
  cnv.width = cnv.height = 128;
  const ctx = cnv.getContext("2d");
  ctx.fillStyle = colors[id] || "#888";
  ctx.beginPath(); ctx.roundRect(20, 20, 88, 88, 16); ctx.fill();
  ctx.fillStyle = "#0d0f0a"; ctx.font = "bold 52px sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText((STR.items[id]?.name || id)[0].toUpperCase(), 64, 68);
  return cnv;
}

export function iconUrl(id) {
  const c = icons[id];
  return c ? c.toDataURL() : "";
}

// ---- inventory (also used for the personal storage chest) ----
export class Inventory {
  // stackMax is PER inventory: your pack holds 10 a slot (20 with the wolf
  // bag on your back), a storage chest swallows 100
  constructor(size = CFG.player.slots, stackMax = CFG.player.stackMax) {
    this.slots = new Array(size).fill(null); // {id, count}
    this.sel = 0;
    this.stackMax = stackMax;
  }
  add(id, count = 1) {
    // stack first
    for (const s of this.slots) {
      if (s && s.id === id && s.count < this.stackMax) {
        const take = Math.min(count, this.stackMax - s.count);
        s.count += take; count -= take;
        if (count <= 0) return true;
      }
    }
    for (let i = 0; i < this.slots.length; i++) {
      if (!this.slots[i]) {
        const take = Math.min(count, this.stackMax);
        this.slots[i] = { id, count: take }; count -= take;
        if (count <= 0) return true;
      }
    }
    return count <= 0;
  }
  has(id) { return this.slots.some((s) => s && s.id === id); }
  removeOne(id) {
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (s && s.id === id) {
        s.count--; if (s.count <= 0) this.slots[i] = null;
        return true;
      }
    }
    return false;
  }
  selected() { return this.slots[this.sel]; }
  // move slot a onto slot b: same item merges (up to a full stack), else swap
  move(a, b) {
    if (a === b) return;
    const A = this.slots[a], B = this.slots[b];
    if (A && B && A.id === B.id) {
      const take = Math.min(this.stackMax - B.count, A.count);
      B.count += take; A.count -= take;
      if (A.count <= 0) this.slots[a] = null;
    } else {
      this.slots[a] = B;
      this.slots[b] = A;
    }
  }
  consumeSelected() {
    const s = this.slots[this.sel];
    if (!s) return null;
    const id = s.id;
    s.count--; if (s.count <= 0) this.slots[this.sel] = null;
    return id;
  }
  firstRaw() {
    for (const s of this.slots) if (s && CFG.cookMap[s.id]) return s.id;
    return null;
  }
}
