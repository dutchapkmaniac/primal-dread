import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { CFG, ASSET_V } from "./config.js";
import { STR } from "../strings.js";
import { clone as skeletonClone } from "three/addons/utils/SkeletonUtils.js";
import { mulberry32, pickWeighted } from "./rng.js";
import { loadIcons, iconUrl, Inventory } from "./items.js";
import { ClipAnimator } from "./skeletal.js";
import { AudioMan } from "./audio.js";
import { UI } from "./ui.js";
import { World } from "./world.js";
import { Player } from "./player.js";
import { Creature, ItemDrop } from "./entities.js";
import { GameMap } from "./map.js";
import { FarmGame } from "./farmgame.js";
import { ElisiaSystem } from "./elisia.js";   // update 35
import { DesertSystem } from "./desert.js";
import { PortalSystem } from "./portals.js";
import { EterniusCity, buildEternialWeapons } from "./eternius.js";   // update 39   // update 37: the five portals   // update 36

const TEX_IDS = ["t_grass", "t_forestfloor", "t_sandpath", "t_romanstone", "t_intfloor", "t_woodplank", "t_darkwood", "t_bark",
  "t_lhwhite", "t_lhred", "t_beach", "t_water", "t_container", "t_metalfloor", "t_trapdoor", "t_campdirt", "t_cobble", "t_ruinbrick", "t_rock",
  // update 29: the farmhouse and its garden
  "t_clapboard", "t_slate", "t_wallpaper", "t_floorboard", "t_terrace", "t_gravel", "t_hedge", "t_flowerbed", "t_rug",
  // update 30: kitchen + bathroom finishes
  "t_checker", "t_whitetile", "t_mosaic", "t_cream",
  // update 36: the desert's sand
  "t_sand", "t_riversand",   // update 37: the river bank
  "t_sandstone", "t_goldpanel", "t_cavern", "t_flag",
  "t_trexgreen", "t_goldlattice", "t_greencarpet", "t_mountain", "t_relief"];   // update 44: the jackal relief on the river wall   // update 39/40: Eternius City
// ONE word per situation for the mobile context button, resolved from the
// prompt label's leading constant. Built ONCE — update 26 profiling caught the
// per-frame rebuild of this table as the main-thread's top garbage source.
const VERB_MAP = [
  [STR.pickUp, STR.mobTake], [STR.pickApple, STR.mobTake],
  [STR.closeDoor, STR.mobClose], [STR.closeHatch, STR.mobClose],
  [STR.openChest, STR.mobOpen], [STR.openStorage, STR.mobOpen],
  [STR.openDoor, STR.mobOpen], [STR.openHatch, STR.mobOpen],
  [STR.hutChestTitle, STR.mobOpen], [STR.coolboxPrompt, STR.mobOpen], [STR.fridgePrompt, STR.mobOpen],
  [STR.sleep, STR.mobSleep],
  [STR.cookPrompt, STR.mobCook], [STR.cookFirePrompt, STR.mobCook],
  [STR.useCraft, STR.mobCraft], [STR.useAnvil, STR.mobForge],
  [STR.talkTo, STR.mobTalk], [STR.talkToHans, STR.mobTalk], [STR.talkToEmily, STR.mobTalk],
  [STR.talkToTimo, STR.mobTalk], [STR.talkToJabb, STR.mobTalk],
  [STR.eggToBill, STR.mobGive], [STR.eggReturn, STR.mobReturn],
  [STR.eggTake, STR.mobTake], [STR.eggPickBack, STR.mobTake],
  [STR.deathBagPrompt, STR.mobTake], [STR.stealBar, STR.mobSteal],
  [STR.prayPrompt, STR.mobPray], [STR.barTinderbox, STR.mobTake],
  [STR.lightBeacon, STR.mobLight], [STR.sitDown, STR.mobSit],
  [STR.climbTree, STR.mobClimb], [STR.slideDown, STR.mobSlide],
  // update 29: the farm
  [STR.talkToDirk, STR.mobTalk], [STR.cowMilk, STR.mobMilk], [STR.pickBerries, STR.mobPick],
  [STR.tapPrompt, STR.mobDrink],   // update 30
  [STR.climbLadder, STR.mobClimb], [STR.climbDownLadder, STR.mobClimb],   // update 31
  [STR.toyPick, STR.mobToy],   // update 32
  [STR.fillBottle, STR.mobFill], [STR.talkToIdris, STR.mobTalk],   // update 36
  [STR.cratePrompt, STR.mobOpen], [STR.dirkChestTitle, STR.mobOpen], [STR.ducoGive, STR.mobGive],
  [STR.farmSitDown, STR.mobSit],
];
const verbFor = (label) => {
  for (const [pre, verb] of VERB_MAP) if (pre && label.startsWith(pre)) return verb;
  return STR.mobUse;
};

const GLB_IDS = ["trex", "trexgreen", "et_door", "et_fence", "et_collar", "et_vaultdoor", "et_censer", "et_bench", "et_altar", "werewolf", "pig", "chicken", "tree", "appletree", "chest", "statue",
  "bedroll", "hutbed", "kitchen", "bill", "storagechest", "boulder",
  "door", "table", "chair", "lantern", "croc", "dinoegg", "metaldoor", "beaconlamp",
  "nest", "barrel", "closet", "woodchest", "trapdoor", "knife3d", "machete3d", "torch3d",
  "spino", "tent", "fountain", "trexskel", "humanskel", "altar", "fridge", "hans", "emily", "timo",
  "fence", "campfire", "coolbox", "crafttable", "axe3d",
  "goat", "jabb", "wolfstatue", "deadtree", "anvil", "trike", "dagger3d", "cavearch", "crossbow3d",
  // update 29: Dirk's farm
  "cow", "sofa", "sidetable", "tvset", "clock", "bathtub", "toilet", "singlebed",
  "dresser", "dinetable", "dinechair", "trunk", "bush", "bench", "bcrate", "haybale",
  // update 30: the farm's second pass — Tripo lifts (Dirk with a face, Duco from his photo,
  // the doors, the fountain, the bed, the whole kitchen and bathroom)
  "duco", "fountain2", "kingbed2",
  "k_range", "k_sink", "k_counter", "k_table", "k_chair", "k_potrack", "k_hutch", "k_basket", "k_shelf", "k_herbs",
  "b_basin", "b_towel", "b_cabinet", "b_mirror", "hall_lamp",
  // update 31: door leaves that are never cut, the monitor-top fridge, the attic
  "leaf_front", "leaf_back", "leaf_balc", "fridge2", "ladder", "a_crates", "a_sacks",
  // update 32: Dirk on a real skeleton (dirk3 retired), the parlour armchair,
  // Duco's bolster bed and the blueberry he fetches
  "armchair", "dogmat2", "bplush",
  // update 33c: Dirk built new from a plain-farmer reference (dirk4 too bright, dirk5 came back low-poly)
  "dirk6",
  // update 35: Elisia — her light and her dark form
  "elisia", "elisia_evil",
  // update 36: the desert — its two Alioramus, the cactus, the palm, Idris
  "remotus", "altai", "cactus", "palm", "nomad",
  // update 40: Eternius City's generated furniture (a code stand-in takes each one's place until it lands)
  "et_bed", "et_lamppost", "et_torchbearer", "et_chainpost", "et_ceilinglamp", "et_throne",
  "etdagger3d", "etsword3d", "etspear3d",   // update 40: the Eternial weapons, generated at last (buildEternialWeapons wraps them)
  "portal",   // update 37
  "imperator", "trexdagger3d", "impdagger3d",   // update 38
  "et_male", "et_female", "et_guardspear", "et_guardsword", "et_king", "et_statue", "et_magician"];   // update 39: the Eternials; update 49: the sorcerer

// scale + ground + material hygiene for generated GLBs
function normalizeModel(root, targetH, yaw = 0) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3(); box.getSize(size);
  const s = targetH / (size.y || 1);
  root.scale.setScalar(s);
  root.rotation.y = yaw;
  root.updateMatrixWorld(true);
  const box2 = new THREE.Box3().setFromObject(root);
  const ctr = new THREE.Vector3(); box2.getCenter(ctr);
  root.position.x -= ctr.x;
  root.position.z -= ctr.z;
  root.position.y -= box2.min.y;
  root.traverse((o) => {
    if (o.isMesh) {
      // force OPAQUE + double-sided (BLEND masquerades as inverted normals)
      o.material.transparent = false;
      o.material.depthWrite = true;
      o.material.side = THREE.DoubleSide;
      if (o.material.map) o.material.map.colorSpace = THREE.SRGBColorSpace;
      // some generated GLBs omit metallicFactor — the glTF default is FULL
      // METAL, which renders pitch black without an environment map. These
      // are organic/stone/wood props: no metal, honest roughness.
      if (o.material.metalness === undefined || o.material.metalness > 0.6) {
        o.material.metalness = 0;
        if (o.material.roughness === undefined || o.material.roughness >= 1) o.material.roughness = 0.85;
      }
    }
    // skinning moves vertices outside the bind-pose bounds
    if (o.isSkinnedMesh) o.frustumCulled = false;
  });
  const g = new THREE.Group();
  g.add(root);
  return g;
}

class Game {
  constructor() {
    this.ui = new UI();
    this.audio = new AudioMan();
    this.rng = mulberry32(CFG.seed);
    this.lootRng = mulberry32(CFG.seed ^ 0x9e3779b9);
    this.time = 0;
    this.playing = false;
    this.menuOpen = true;
    this.isNight = false;
    this.dayNum = 1;
    this.wonShown = false;
    this.creatures = [];
    this.wolves = [];
    this.drops = [];
    this.spears = [];        // thrown spears in flight (update 11)
    this.arrows = [];        // crossbow bolts in flight (update 27)
    // update 27: PER-RUN learning — every scroll exists once per game, using
    // it teaches the skill for this run only. NOTHING here is ever persisted.
    this.learned = new Set();
    this.scrollFound = {};       // scroll ids already granted this run
    this.climbedTrees = new Set();
    this.lastDeathSpot = null;   // where the compass of death points
    this.huntTarget = null;  // the wounded T-Rex the HP bar tracks
    this.cooking = null;
    this.goalState = 0;
    // storage chests hold DEEP stacks — 100 an item slot (your pack stays at 10)
    this.storage = new Inventory(CFG.storageSlots, CFG.storageStackMax);
    this.hutStorage = new Inventory(CFG.hutStorageSlots, CFG.storageStackMax);
    this.campStorage = new Inventory(CFG.storageSlots, CFG.storageStackMax);
    this.ruinsStorage = new Inventory(CFG.storageSlots, CFG.storageStackMax);
    this.drunkT = 0;
    this.wineDay = -1;
    this.prayedDay = -1;
    this.seat = null;            // update 29: which chair you sit on (null = Bill's)
    this.farm = new FarmGame(this);
    this.elisia = new ElisiaSystem(this);   // update 35: the angel of the forest
    this.desert = new DesertSystem(this);   // update 36: thirst, the bottle, Idris, the wind
    this.portals = new PortalSystem(this);  // update 37: the five portals
    this.city = new EterniusCity(this);     // update 39: Eternius City
    this.barTinderTaken = false;
    this.containerTinderTaken = false;
    this.assets = { tex: {}, texN: {}, glb: {} };
    // discovery is PER RUN now: each session the map starts blank except the
    // temple you wake in — places label themselves as you reach them
    localStorage.removeItem("pdDiscovered");
    this.discovered = new Set(["temple"]);
    this.billEggs = parseInt(localStorage.pdBillEggs || "0", 10) || 0;
  }

  async load() {
    this.ui.loading();
    const texLoader = new THREE.TextureLoader();
    const gltfLoader = new GLTFLoader();
    let done = 0;
    const total = TEX_IDS.length * 2 + GLB_IDS.length + 2;
    const tick = () => this.ui.setProgress(++done / total);
    // ASSET_V busts stale browser caches; patient retries ride out network
    // blips — a failed download must never silently degrade to grey shapes.
    const tryTex = (url, attempt = 0) => new Promise((res) =>
      texLoader.load(url + ASSET_V, (t) => {
        t.colorSpace = url.includes("basecolor") ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        res(t);
      }, undefined, () => {
        if (attempt < 4) setTimeout(() => tryTex(url, attempt + 1).then(res), 500 * (attempt + 1));
        else res(null);
      }));
    const tryGlb = (url, attempt = 0) => new Promise((res) =>
      gltfLoader.load(url + ASSET_V, (g) => res(g), undefined, () => {
        if (attempt < 4) setTimeout(() => tryGlb(url, attempt + 1).then(res), 500 * (attempt + 1));
        else res(null);
      }));
    // task list, loaded through a small worker pool: firing ~65 requests at
    // once gets some of them dropped by tunnels/CDNs — batching never does.
    const tasks = [];
    for (const id of TEX_IDS) {
      tasks.push(() => tryTex(`./assets/tex/${id}_basecolor.webp`).then((t) => { this.assets.tex[id] = t; tick(); }));
      tasks.push(() => tryTex(`./assets/tex/${id}_normal.webp`).then((t) => { this.assets.texN[id] = t; tick(); }));
    }
    for (const id of GLB_IDS) {
      tasks.push(() => tryGlb(`./assets/models/${id}.glb`).then((gltf) => {
        this.assets.glb[id] = gltf
          ? { model: normalizeModel(gltf.scene, CFG.modelScale[id], CFG.modelYaw[id] || 0),
              anims: gltf.animations || [] }
          : null;
        tick();
      }));
    }
    tasks.push(() => loadIcons().then(tick));
    tasks.push(() => this.audio.init().then(tick));
    // generated fire billboard (black background -> additive transparency)
    tasks.push(() => tryTex("./assets/fx_flame.png").then((t) => { this.assets.flame = t; }));
    const POOL = 8;
    let next = 0;
    const worker = async () => {
      while (next < tasks.length) {
        const t = tasks[next++];
        await t();
      }
    };
    await Promise.all(Array.from({ length: POOL }, worker));
  }

  start() {
    // graphics settings, persisted in localStorage.pdGfx
    const GFX_SCALES = { low: 0.67, medium: 1, high: 1.5 }; // "native" = devicePixelRatio
    // quality presets (update 26): bundles of scale/MSAA/fog/foliage/shadows.
    // "medium" IS the pre-preset behavior — same scale, msaa, fog, grass, shadows.
    const GFX_PRESETS = {
      low:    { scale: "low",    msaa: false, fog: 0.85, grass: 0.5, shadows: false },
      medium: { scale: "medium", msaa: false, fog: 1,    grass: 1,   shadows: true },
      high:   { scale: "high",   msaa: false, fog: 1.15, grass: 1,   shadows: true },
      ultra:  { scale: "native", msaa: true,  fog: 1.3,  grass: 1,   shadows: true },
    };
    let gfx;
    try { gfx = JSON.parse(localStorage.pdGfx || "{}"); } catch (e) { gfx = {}; }
    if (!(gfx.scale in GFX_SCALES) && gfx.scale !== "native") gfx.scale = "medium";
    gfx.msaa = gfx.msaa === true;
    gfx.dgpu = gfx.dgpu !== false;   // dedicated GPU: ON unless explicitly disabled
    if (!(gfx.preset in GFX_PRESETS) && gfx.preset !== "custom") gfx.preset = "medium";
    gfx.dynres = gfx.dynres === true;   // dynamic resolution: OFF by default
    // players who customized BEFORE presets existed count as user-chosen —
    // the first-run auto tuner must never override them
    if (gfx.userSet === undefined && (gfx.scale !== "medium" || gfx.msaa)) gfx.userSet = true;
    this.gfx = gfx;
    // fog/grass/shadows follow the preset; "custom" keeps medium's world levers
    const presetFx = GFX_PRESETS[gfx.preset] || GFX_PRESETS.medium;
    this.dynMult = 1;                   // dynamic-resolution multiplier (1 = off)
    const gfxDpr = (key) => key === "native" ? (devicePixelRatio || 1) : GFX_SCALES[key];
    // update 30: the drawing buffer is capped at 2560x1440 worth of pixels on EVERY
    // scale — "native" on a 4K panel rendered 8.3 M pixels with MSAA, which no
    // GTX-1070-class card holds at 60 fps; 1440p upscaled to the panel is the ceiling
    const MAX_PX = 2560 * 1440;
    const effDpr = (key) => Math.min(gfxDpr(key), Math.sqrt(MAX_PX / Math.max(1, innerWidth * innerHeight)));

    // renderer — MSAA and powerPreference are context-creation flags, so
    // those two apply on reload. high-performance asks the browser for the
    // DEDICATED graphics card on dual-GPU machines (a HINT — drivers may
    // ignore it); single-GPU devices ignore it harmlessly.
    const canvas = document.getElementById("c");
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: gfx.msaa,
      powerPreference: gfx.dgpu ? "high-performance" : "default" });
    // firelight stays in its room — except on the Low preset, where the shadow
    // system is off entirely (materials then compile without shadow sampling)
    this.renderer.shadowMap.enabled = presetFx.shadows;
    this.renderer.shadowMap.type = THREE.BasicShadowMap;
    // the only shadow light (the spawn fire) never moves and its only casters
    // (the stone walls) are static, so the cube map is baked ONCE — re-rendering
    // its 6 faces every frame cost ~25% of the GPU frame for identical pixels.
    // If a MOVING caster ever gets castShadow, set shadowMap.needsUpdate there.
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    // which GPU actually took the context — shown in Graphics and [perf]
    const glCtx = this.renderer.getContext();
    const dbgInfo = glCtx.getExtension("WEBGL_debug_renderer_info");
    this.gpuName = String((dbgInfo && glCtx.getParameter(dbgInfo.UNMASKED_RENDERER_WEBGL))
      || glCtx.getParameter(glCtx.RENDERER) || "unknown");
    // the dedicated-GPU toggle is only OFFERED where switchable graphics is
    // plausible: desktop Windows, desktop Linux, and INTEL Macs. Android,
    // iOS/iPadOS, Apple-Silicon Macs and ChromeOS hide it — the setting
    // itself still applies there (high-performance by default).
    const uaP = navigator.userAgentData;
    const plat = (uaP && uaP.platform) || navigator.platform || "";
    const uaS = navigator.userAgent || "";
    const isAndroid = /Android/i.test(uaS) || plat === "Android";
    const isCrOS = /CrOS/i.test(uaS);
    // iPadOS 13+ masquerades as "MacIntel" — the touch-point check unmasks it
    const isIOS = /iPhone|iPad|iPod/i.test(uaS) || (/Mac/i.test(plat) && navigator.maxTouchPoints > 1);
    const isMac = /Mac/i.test(plat) && !isIOS;
    const appleSilicon = isMac && /Apple (M\d|GPU)/i.test(this.gpuName);
    const isWin = /Win/i.test(plat) || /Windows/i.test(uaS);
    const isLinux = /Linux/i.test(plat) && !isAndroid && !isCrOS;
    this.dgpuRelevant = (isWin || isLinux || (isMac && !appleSilicon)) && !isAndroid && !isIOS && !isCrOS;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.08, 400);
    this.scene.add(this.camera);
    const resize = () => {
      this.renderer.setPixelRatio(effDpr(this.gfx.scale) * this.dynMult);
      this.renderer.setSize(innerWidth, innerHeight);
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
    };
    this._gfxResize = resize;
    addEventListener("resize", resize);
    addEventListener("orientationchange", resize);
    resize();
    // the Graphics panel talks to the renderer through this — resolution
    // applies LIVE, MSAA persists and applies on the next load
    // applying a preset: scale/fog/foliage live; MSAA and shadows are boot
    // flags — they persist and take effect on the next load
    const applyPreset = (key, save) => {
      const P = GFX_PRESETS[key];
      if (!P) return;
      this.gfx.preset = key;
      this.gfx.scale = P.scale;
      this.gfx.msaa = P.msaa;
      resize();
      this.world.fogMult = P.fog;
      this.world.updateEnv(this.world.nightK || 0);
      this.world.setFoliage(P.grass);
      if (save) localStorage.pdGfx = JSON.stringify(this.gfx);
    };
    this._applyPreset = applyPreset;
    const markCustom = () => { this.gfx.preset = "custom"; this.gfx.userSet = true; };
    this.ui.gfxApi = {
      state: () => this.gfx,
      pixels: (key) => Math.round(innerWidth * effDpr(key)) + "×" + Math.round(innerHeight * effDpr(key)),
      active: () => this.renderer.domElement.width + "×" + this.renderer.domElement.height,
      setScale: (key) => {
        this.gfx.scale = key;
        markCustom();                      // a manual pick overrides the preset
        localStorage.pdGfx = JSON.stringify(this.gfx);
        resize();
      },
      setMsaa: (on) => {
        this.gfx.msaa = !!on;
        markCustom();
        localStorage.pdGfx = JSON.stringify(this.gfx);
      },
      setPreset: (key) => {
        this.gfx.userSet = true;           // the user chose — auto never overrides
        applyPreset(key, true);
      },
      setDynres: (on) => {
        this.gfx.dynres = !!on;
        this.gfx.userSet = true;
        if (!on) { this.dynMult = 1; resize(); }
        localStorage.pdGfx = JSON.stringify(this.gfx);
      },
      gpu: () => this.gpuName,
      dgpuShown: () => this.dgpuRelevant,
      setDgpu: (on) => {   // context-creation flag — applies on the next load
        this.gfx.dgpu = !!on;
        localStorage.pdGfx = JSON.stringify(this.gfx);
      },
    };

    this.world = new World(this.scene, this.assets, this.rng);
    this.world.city = this.city;            // update 39: the city's floors, walls and mountain join the world's ground
    this.portals.build();                   // update 37: the portals stand once the ground exists
    this.world.fogMult = presetFx.fog;      // preset draw distance, from boot
    this.world.updateEnv(0);
    this.world.setFoliage(presetFx.grass);  // preset foliage density
    // pre-compile every material NOW, behind the loading screen — not as a
    // multi-second stutter the first time something enters the camera view
    this.renderer.compile(this.scene, this.camera);

    buildEternialWeapons(this.assets);   // update 39: the gold weapons exist before the player mounts them
    const ctx = {
      scene: this.scene, world: this.world, rng: this.rng,
      audio: this.audio, ui: this.ui, assets: this.assets,
      player: null,
      onDeath: (src) => this.onDeath(src),
    };
    this.player = new Player(this.camera, ctx);
    ctx.player = this.player;
    this.ctx = ctx;
    this.city.build();   // update 39: the city needs the creature context for its chained beast
    this.initLightPool();   // update 41: after everything with a lamp exists

    // the expedition map + HUD minimap + compass
    this.map = new GameMap(this);
    this.ui.audio = this.audio;
    this.ui.drawMap = (cnv) => this.map.drawFull(cnv);
    this.miniCanvas = document.getElementById("minimap");
    this.compassEl = document.getElementById("compass");

    // creatures
    // update 38: TWENTY hunters — the seven of the old map, the three frontier patrols, and ten more
    // born and roaming OUTSIDE the old circle. One of the twenty, chosen at random, is the Imperator.
    {
      const specs = [];
      for (const [x, z] of CFG.trex.spawns) specs.push([x, z, {}]);
      for (const [x, z] of CFG.trex.outerSpawns || []) specs.push([x, z, { outer: true }]);
      for (let i = 0; i < (CFG.trex.extraCount || 0); i++) {
        const [x, z] = this.world.randomOutsideForest(this.rng, CFG.trex.extraMinR);
        specs.push([x, z, { zone: "outside" }]);
      }
      // update 39: two Imperators among the thirty, each a random one
      const imps = new Set();
      while (imps.size < Math.min(CFG.trex.imperatorCount || 1, specs.length)) imps.add(Math.floor(this.rng() * specs.length));
      specs.forEach(([x, z, o], i) => {
        const isImp = imps.has(i);
        this.creatures.push(new Creature("trex", (isImp && this.assets.glb.imperator) || this.assets.glb.trex, x, z, ctx, { ...o, imperator: isImp }));
      });
    }
    for (const [x, z] of CFG.pig.spawns) this.creatures.push(new Creature("pig", this.assets.glb.pig, x, z, ctx));
    // update 36: the desert's hunters — remotus along the river, altai deeper in
    for (const kind of ["remotus", "altai"]) {
      for (const [x, z] of this.world.desert.spawnsFor(kind, CFG[kind].count, this.rng)) {
        this.creatures.push(new Creature(kind, this.assets.glb[kind], x, z, ctx));
      }
    }
    const [hx, hz] = CFG.world.hutPos;
    for (let i = 0; i < CFG.chicken.count; i++) {
      const P = CFG.pen;
      this.creatures.push(new Creature("chicken", this.assets.glb.chicken,
        hx + P.x0 + 0.6 + this.rng() * (P.x1 - P.x0 - 1.2),
        hz + P.z0 + 0.6 + this.rng() * (P.z1 - P.z0 - 1.2), ctx));
    }
    // wild game across the whole map — huntable anywhere
    for (const [x, z] of CFG.wildChickens.spawns)
      this.creatures.push(new Creature("chicken", this.assets.glb.chicken, x, z, ctx, { wild: true }));
    // the MOUNTAIN HERD: twelve goats scattered over the rocks, quick to return
    const M16 = CFG.mountain;
    for (let i = 0; i < CFG.goat.count; i++) {
      const a = (0.12 + (i / CFG.goat.count) * 0.76) * Math.PI / 2; // fan across the quarter
      // update 22: the WHOLE herd lives above the anchor-gated cliff (d < 170
      // from the corner) — the climb is the price of goat meat, as designed
      let gx, gz, guard = 0;
      do {
        const d = 106 + this.rng() * 54;
        gx = M16.cx + Math.cos(a) * d; gz = M16.cz + Math.sin(a) * d;
      } while (this.world.inDungeon(gx, gz) && guard++ < 20);
      this.creatures.push(new Creature("goat", this.assets.glb.goat, gx, gz, ctx));
    }
    // FIVE TRICERATOPS graze the lower slope — sidestep artists required
    const MT = CFG.mountain;
    for (let i = 0; i < CFG.trike.count; i++) {
      // evenly fanned across the quarter, alternating depth — maximum spread,
      // and each one now grazes only its OWN patch (see pickWanderTarget)
      const a = (0.1 + (i / (CFG.trike.count - 1)) * 0.8) * Math.PI / 2;
      const d = i % 2 ? 234 : 276;
      this.creatures.push(new Creature("trike", this.assets.glb.trike,
        MT.cx + Math.cos(a) * d, MT.cz + Math.sin(a) * d, ctx));
    }
    // the DUNGEON PACK: ten shadows spread sparse through the tunnels —
    // they hunt at ANY hour in there, and never leave the dark by day
    for (const [wx, wz] of this.world.dungeonSpawns || []) {
      const cw = new Creature("werewolf", this.assets.glb.werewolf, wx, wz, ctx);
      cw.caveWolf = true;
      this.wolves.push(cw);
    }
    // the GUARDIAN of the old ruins and her two hatchlings
    const RVq = CFG.ruins;
    this.spino = new Creature("spino", this.assets.glb.spino, RVq.x + RVq.patrolR, RVq.z, ctx);
    this.creatures.push(this.spino);
    for (const [ox, oz] of [[-1.2, 0.7], [1.3, -0.6]]) {
      this.creatures.push(new Creature("spinobaby", this.assets.glb.spino,
        this.world.spinoNest.x + ox, this.world.spinoNest.z + oz, ctx));
    }
    // update 29: the farm's people and animals
    this.farm.setup(ctx);

    // THE torch: exactly one lies on the temple's first floor
    this.spawnDrop("torch", 1, -3.5, -5.6, 3.7);
    // torch viewmodel: the GENERATED torch (stick fallback) + flame + light
    {
      let g = this.player.mountHeld("torch3d");
      let flameY = 0.3, flameZ = 0;
      if (!g) {
        g = new THREE.Group();
        const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, 0.5, 6),
          new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 1 }));
        stick.rotation.x = 0.35;
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6),
          new THREE.MeshStandardMaterial({ color: 0x2a2118, roughness: 1 }));
        head.position.set(0, 0.26, -0.09);
        g.add(stick, head);
        g.position.set(-0.3, -0.28, -0.55);
        g.visible = false;
        this.camera.add(g);
        flameY = 0.42; flameZ = -0.11;
      }
      if (this.assets.flame) {
        const fm = new THREE.MeshBasicMaterial({
          map: this.assets.flame, transparent: true, depthWrite: false,
          blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        });
        for (const rot of [0, Math.PI / 2]) {
          const f = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.3), fm);
          f.position.set(0, flameY, flameZ);
          f.rotation.y = rot;
          g.add(f);
        }
      }
      // the torch LIGHT lives on the camera permanently at intensity 0 —
      // parenting it to the toggled viewmodel changed the scene's light count
      // on first lighting and froze the game in a full shader recompile
      const tl = new THREE.PointLight(0xe8a050, 0, CFG.torch.dist, 1.8);
      tl.position.set(-0.3, 0.16, -0.64);
      this.camera.add(tl);
      this.player.torchLight = tl;
      this.player.torchVm = g;
    }
    this.quest = { given: this.billEggs > 0 };
    this.carriedEgg = false;
    this.shoreT = 0;
    this.nextCrocAt = undefined;
    this.healCd = 0;

    // the campers — generated survivors, now with REAL rigged clips when
    // the model ships them (walk + idle, merged like Bill's)
    const placeNpc = (id, pos) => {
      const a = this.assets.glb[id];
      if (!a || !pos) return null;
      const rigged = a.anims && a.anims.length;
      const m = rigged ? skeletonClone(a.model) : a.model.clone();
      // probe from HIGH UP — an NPC on the mountain pad must land ON it,
      // not under the terrain (Jabb was buried this way)
      m.position.set(pos.x, this.world.groundHeight(pos.x, pos.z, 999), pos.z);
      m.rotation.y = pos.yaw || 0;
      m.userData.anim = rigged ? new ClipAnimator(m, a.anims) : null;
      this.scene.add(m);
      return m;
    };
    this.hansBody = placeNpc("hans", this.world.hansPos);
    this.emilyBody = placeNpc("emily", this.world.emilyPos);
    // the campers LIVE here: they stroll between spots inside the fence
    this.campers = [this.hansBody, this.emilyBody].filter(Boolean).map((body, i) => ({
      body, state: "stand", t: 3 + i * 5 + this.rng() * 6, ph: this.rng() * 7, tx: 0, tz: 0,
    }));
    // the wolf bag lasts for THIS run: every fresh session starts at 10 a slot
    // (a stale flag from older builds gave day-one players 20 — purge it)
    localStorage.removeItem("pdWolfBag");
    this.wolfBagOn = false;
    // Timo: 0 = unheard-of, 1 = hiding in the ruins, 2 = following you, 3 = home
    // update 24: the rescue is PER-RUN. The old pdTimo flag survived in the
    // browser after one completed rescue and silently skipped the whole quest
    // in every later session (Timo pre-placed at camp, Hans never asking).
    delete localStorage.pdTimo;
    this.questTimo = 0;
    this.timoBody = placeNpc("timo", this.world.timoRuinsPos);
    // JABB, the dwarf smith of the mountain hut
    this.jabbBody = placeNpc("jabb", this.world.jabbPos);
    // update 27: the silver-bar quest is PER-RUN — the old pdJabb flag from a
    // long-finished run was silently unlocking the storage box at every boot
    // (the same stale-persistence class as Timo's rescue)
    delete localStorage.pdJabb;
    this.jabbDone = false;
    this.jabbStorage = new Inventory(CFG.storageSlots, CFG.storageStackMax);
    this.jabbCoffeeDay = -1;
    if (this.timoBody && this.questTimo < 1) this.timoBody.visible = false;
    if (this.questTimo === 3) this.timoJoinsCamp(); // already rescued: he lives at the camp

    // Bill the farmer — rigged idle, standing by his kitchen
    const billAsset = this.assets.glb.bill;
    const bp = this.world.bill;
    if (billAsset && bp) {
      const body = billAsset.anims.length ? skeletonClone(billAsset.model) : billAsset.model.clone();
      body.position.set(bp.x, bp.y, bp.z);
      body.rotation.y = bp.yaw;
      this.scene.add(body);
      this.billBody = body;
      this.billAnim = billAsset.anims.length ? new ClipAnimator(body, billAsset.anims) : null;
    } else if (bp) {
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 1.1, 4, 8),
        new THREE.MeshStandardMaterial({ color: 0x8a7a56, roughness: 1 }));
      m.position.set(bp.x, bp.y + 0.85, bp.z);
      this.scene.add(m);
    }

    // hooks
    this.ui.onSlot = (i) => {
      if (this.ui.pauseInv) { this.ui.invClickSlot(i); this.audio.sSelect(); return; }
      this.player.inv.sel = i;
      this.audio.sSelect();
      this.ui.renderHotbar(this.player.inv);
    };
    this.ui.onSlotNext = () => this.ui.onSlot((this.player.inv.sel + 1) % this.player.inv.slots.length);
    // update 33: Q/E step the selection one slot left or right, wrapping round
    // — 8 then E is 1, 1 then Q is 8. The digits still jump straight to a slot.
    this.ui.onSlotStep = (d) => { const n = this.player.inv.slots.length; this.ui.onSlot((this.player.inv.sel + d + n) % n); };
    this.ui.onPause = () => this.pause();
    addEventListener("blur", () => { if (this.playing && !this.menuOpen) this.pause(); });

    // contextual hint under the crosshair-side of the hotbar: how to USE the selection
    const useKey = this.ui.isTouch ? `[${STR.hintUseBtn}]` : `[${STR.hintLeftClick}]`;
    this.ui.hintFor = (slot) => {
      if (!slot) return null;
      const name = STR.items[slot.id]?.name || slot.id;
      if (slot.id === "knife" || slot.id === "silver_dagger" || slot.id === "trex_dagger" || slot.id === "imp_dagger" || slot.id === "machete" || slot.id === "axe") return `${useKey} ${STR.hintAttack} — ${name}`;
      if (slot.id === "spear") return `${useKey} ${STR.hintSpear}`;
      if (slot.id === "water_bottle") return `${name}: ${this.desert.bottleHint()}`;   // update 36
      if (slot.id === "super_energy_drink") return `${useKey} ${STR.hintDrink} — ${name}`;
      if (slot.id === "wolf_bag") return `${useKey} ${STR.hintWolfBag}`;
      if (slot.id === "goggles") return `${name}: ${STR.hintGoggles}`;
      if (slot.id === "needle" || slot.id === "thread") return `${name}: ${STR.hintSewing}`;
      if (slot.id === "climbing_anchor") return `${name}: ${STR.hintAnchor}`;
      if (slot.id === "silver_bar") return `${name}: ${STR.hintSilverBar}`;
      if (slot.id === "branch") return `${useKey} light a campfire — needs a tinderbox`;
      if (slot.id === "fishing_rod") return `${useKey} cast — at the lake shore`;
      if (slot.id === "rope") return `${name}: craft a fishing rod at the crafting table`;
      if (slot.id === "tinderbox") return `${name}: lights campfires, torches and the beacon`;
      if (slot.id === "torch") return `${useKey} light it — tinderbox, or stand at a campfire`;
      if (slot.id === "lit_torch") return `${name}: burning — hold it to light your way`;
      if (slot.id === "bandage") return `${useKey} ${STR.hintBandage} — ${name}`;
      if (slot.id === "energy_drink") return `${useKey} ${STR.hintDrink} — ${name}`;
      // update 29: the farm's foods and the bowl chain
      if (slot.id === "bowl_yogurt") return this.learned.has("yogurt") ? `${useKey} ${STR.hintYogurtMix} — ${name}` : `${name}: ${STR.yogurtUnlearned}`;
      if (slot.id === "bowl_milk") return `${name}: ${STR.hintBowlMilk}`;
      if (slot.id === "blueberries") return `${useKey} ${STR.hintBlueberries} — ${name}`;
      if (slot.id === "lemon") return `${name}: ${STR.hintLemon}`;
      if (slot.id === "bowl") return `${name}: ${STR.hintBowl}`;
      if (slot.id === "raw_beef") return `${name}: ${STR.hintRawBeef}`;   // update 30
      if (CFG.food[slot.id]) return `${useKey} ${STR.hintEat} — ${name}`;
      if (slot.id === "egg") return `${name}: ${STR.hintCookKitchen}`;
      if (CFG.cookMap[slot.id]) return `${name}: ${STR.hintCookFirst}`;
      if (slot.id === "crossbow") return this.learned.has("crossbowUse")
        ? `${useKey} shoot — ${name}`
        : `${name}: you must LEARN to use it first`;
      if (slot.id === "arrow" || slot.id === "silver_arrow") return `hold ${useKey} — load into your crossbow`;
      if (slot.id === "pestle") return this.learned.has("pestle")
        ? `${useKey} crush a silver dagger into silver dust`
        : `${name}: you must LEARN to use it first`;
      if (slot.id.startsWith("scroll_")) return `${useKey} read — learn this skill`;
      if (slot.id === "death_compass") return `${name}: hold it and follow the needle`;
      if (slot.id === "feather") return `${name}: fletching for arrows`;
      if (slot.id === "silver_dust") return `${name}: the heart of a silver arrow`;
      if (slot.id === "wolf_fur") return `${name}: four of these sew a wolf-fur cloak`;
      if (slot.id === "broken_hook") return `${name}: hammer it into an anchor at the anvil`;
      if (slot.id === "hammer") return `${name}: anvil work — forging climbing anchors`;
      return `${name}: ${STR.hintNoUse}`;
    };
    // Bill sometimes sits at his dinner table, sometimes stands in his room
    this.billState = { sitting: false, t: 45 + this.rng() * 90 };
    this.sitting = false;

    this.ui.renderHotbar(this.player.inv);
    this.ui.goal(STR.goalStart);

    // dev overlay
    this.dev = new URLSearchParams(location.search).has("dev");
    if (this.dev) document.getElementById("dev").style.display = "block";

    // menu → play
    this.ui.menu(() => this.resume());

    // fixed-timestep loop
    const STEP = 1 / 60;
    const RSTEP = 1000 / (CFG.perf.targetFps || 60);
    let acc = 0, last = performance.now(), renderAt = 0;
    let frames = 0, fpsAt = last, fps = 0;
    const frame = (now) => {
      requestAnimationFrame(frame);
      acc += Math.min(0.25, (now - last) / 1000);
      last = now;
      // 60fps cap: on 120/144/165Hz monitors skip the extra vsync ticks outright.
      // Logic time banks up in `acc` and replays in whole STEPs — speed unchanged.
      if (now - renderAt < RSTEP - 1) return;
      renderAt = Math.abs(now - renderAt) > RSTEP * 2 ? now : renderAt + RSTEP;
      if (this.menuOpen) { acc = 0; this.renderer.render(this.scene, this.camera); this.perfLog(now); return; }
      const input = this.ui.collect();
      while (acc >= STEP) { this.step(STEP, input); acc -= STEP; }
      this.render(now);
      this.perfLog(now);
      this.adaptive(now);
      if (this.dev) {
        frames++;
        if (now - fpsAt >= 500) {
          fps = Math.round(frames * 1000 / (now - fpsAt));
          frames = 0; fpsAt = now;
          const inf = this.renderer.info.render;
          document.getElementById("dev").textContent =
            `${fps} fps · ${inf.calls} calls · ${(inf.triangles / 1000) | 0}k tri · ${this.creatures.length + this.wolves.length} ent`;
        }
      }
    };
    this.warmGpu();
    requestAnimationFrame(frame);
  }

  // update 30: every texture uploaded and every shader linked BEFORE the first frame.
  // three.js does both lazily at first sight — reaching the farm meant 21 models'
  // worth of 2K textures and a dozen fresh programs arriving mid-stride: single
  // frames of 0.5-1.3 s. Now it all happens behind the loading screen, once.
  // (The renderer.compile() up in start() ran before the creatures, the NPCs and
  // the held items existed — this pass sees the finished stage.)
  warmGpu() {
    const r = this.renderer;
    const seen = new Set();
    const KEYS = ["map", "normalMap", "roughnessMap", "metalnessMap", "emissiveMap", "alphaMap", "aoMap", "bumpMap"];
    const warmMat = (m) => {
      for (const k of KEYS) {
        const t = m[k];
        if (t && !seen.has(t)) { seen.add(t); r.initTexture(t); }
      }
    };
    this.scene.traverse((o) => {
      if (!o.material) return;
      if (Array.isArray(o.material)) o.material.forEach(warmMat); else warmMat(o.material);
    });
    // textures the loader holds but nothing on stage wears yet (icons, effects)
    for (const store of [this.assets.tex, this.assets.texN]) for (const id in store) {
      const t = store[id];
      if (t && !seen.has(t)) { seen.add(t); r.initTexture(t); }
    }
    if (this.assets.flame && !seen.has(this.assets.flame)) r.initTexture(this.assets.flame);
    r.compile(this.scene, this.camera);
    r.shadowMap.needsUpdate = true;
  }

  pause() {
    if (this.menuOpen) return;
    this.menuOpen = true;
    this.ui.pauseInv = this.player.inv; // the pack is editable while paused
    this.ui.setInvEdit(true);           // lift the hotbar ABOVE the overlay
    this.ui.menu(() => this.resume(), true);
  }
  resume() {
    this.menuOpen = false;
    this.ui.pauseInv = null;
    this.ui.invGrab = null;
    this.ui.setInvEdit(false);
    this.playing = true;
    this.audio.unlock();
    this.ui.renderHotbar(this.player.inv);
  }

  get escorting() { return this.questTimo === 2; }

  // Timo on the walk home: keeps close, hurries when he falls behind
  // once home safe, Timo joins the camp strollers like Hans and Emily
  timoJoinsCamp() {
    if (!this.timoBody || (this.campers || []).some((w) => w.body === this.timoBody)) return;
    this.campers.push({ body: this.timoBody, state: "stand", t: 4 + this.rng() * 6, ph: this.rng() * 7, tx: 0, tz: 0 });
  }

  updateTimo(dt) {
    const t = this.timoBody;
    if (!t) return;
    const anim = t.userData.anim;
    // hiding in the ruins: he sits tucked into the corner, breathing, waiting
    if (this.questTimo < 2) {
      if (anim && t.visible) {
        anim.drive(anim.actions.sitIdle ? "sitIdle" : "idle", 0, 0, dt);
        // the sit clip assumes a chair — sink him so he rests against the wall
        if (anim.actions.sitIdle) {
          const base = this.world.timoRuinsPos;
          t.position.y = this.world.groundHeight(base.x, base.z, 0) - 0.25;
        }
      }
      return;
    }
    if (this.questTimo !== 2) return;
    const p = this.player;
    const dx = p.pos.x - t.position.x, dz = p.pos.z - t.position.z;
    const d = Math.hypot(dx, dz);
    if (d > 2.2) {
      const sp = d > 22 ? 6.6 : 4.6;
      const step = Math.min(sp * dt, d - 1.8);
      t.position.x += (dx / d) * step;
      t.position.z += (dz / d) * step;
      t.rotation.y = Math.atan2(dx, dz);
      t.position.y = this.world.groundHeight(t.position.x, t.position.z, t.position.y)
        + (anim ? 0 : Math.abs(Math.sin(this.time * 8)) * 0.05);
      if (anim) anim.drive("walk", 0.9, 0.9, dt);
    } else {
      t.position.y = this.world.groundHeight(t.position.x, t.position.z, t.position.y);
      if (anim) anim.drive("idle", 0, 0, dt);
    }
    // both of you inside the camp: the rescue is done
    if (Math.hypot(t.position.x - CFG.camp.x, t.position.z - CFG.camp.z) < 10 &&
        Math.hypot(p.pos.x - CFG.camp.x, p.pos.z - CFG.camp.z) < 10) {
      this.questTimo = 3;   // per-run since update 24 — never persisted again
      const cp = this.world.timoCampPos;
      t.position.set(cp.x, this.world.groundHeight(cp.x, cp.z, 0), cp.z);
      t.rotation.y = cp.yaw;
      this.timoJoinsCamp();
      // update 27: Hans's extra thanks — the crossbow manual
      if (!this.scrollFound.scroll_crossbow_use) {
        this.scrollFound.scroll_crossbow_use = true;
        if (!this.player.inv.add("scroll_crossbow_use", 1)) {
          this.spawnDrop("scroll_crossbow_use", 1, this.player.pos.x, this.player.pos.z,
            this.world.groundHeight(this.player.pos.x, this.player.pos.z, this.player.pos.y));
        }
        this.ui.toast(STR.hansScrollGift);
        this.ui.renderHotbar(this.player.inv);
      }
      this.audio.sPickup();
      this.panelShell(STR.hansTitle,
        `<p style="text-align:left">${STR.hansQuestDone[0]}</p><p style="text-align:left">${STR.hansQuestDone[1]}</p>`);
    }
  }

  // A charging trike versus a rock: the rock loses. 20% a chest hid under it,
  // 5% a broken hook — and the rubble reforms in five minutes.
  smashRocksAt(x, z) {
    for (const r of this.world.trikeRocks || []) {
      if (r.broken || Math.hypot(x - r.x, z - r.z) > CFG.trikeRocks.r + 1.2) continue;
      r.broken = true;
      r.mesh.visible = false;
      r.boxRef.minY = 9e9; r.boxRef.maxY = 9e9;   // collider off
      // update 28: a real generated rock-shatter, placed in the world —
      // the old procedural thump sold the moment short
      if (this.audio.buf.rockBreak) {
        const pd = Math.hypot(this.player.pos.x - r.x, this.player.pos.z - r.z);
        this.audio.play3d("rockBreak", pd, (r.x - this.player.pos.x) * 0.02, 90, 1);
      } else this.audio.sHit();
      this.ui.shake(0.8);
      const roll = this.lootRng();
      if (roll < CFG.trikeRocks.chestChance) {
        const chA = this.assets.glb.chest;
        const c = { x: r.x, z: r.z, y: r.y, opened: false, knife: false, snake: false, treasure: true };
        if (chA) { c.mesh = chA.model.clone(); c.mesh.position.set(r.x, r.y + 0.02, r.z); this.scene.add(c.mesh); }
        this.world.chests.push(c);
        r.chest = c;
        this.ui.toast(STR.rockChest);
      } else if (roll < CFG.trikeRocks.chestChance + CFG.trikeRocks.hookChance) {
        this.spawnDrop("broken_hook", 1, r.x, r.z, r.y);
        this.ui.toast(STR.rockHook);
      } else {
        r.respawnT = CFG.trikeRocks.respawn;
      }
      if (r.chest == null && r.respawnT === 0) r.respawnT = CFG.trikeRocks.respawn;
      if (!r.chest && !r.respawnT) r.respawnT = CFG.trikeRocks.respawn;
    }
  }
  updateRocks(dt) {
    for (const r of this.world.trikeRocks || []) {
      if (!r.broken) continue;
      if (r.chest) {
        if (r.chest.opened) { r.chest = null; r.respawnT = CFG.trikeRocks.respawn; }
        continue;   // the countdown starts once the loot is claimed
      }
      r.respawnT -= dt;
      if (r.respawnT <= 0) {
        r.broken = false;
        r.mesh.visible = true;
        Object.assign(r.boxRef, r.closedBox);
      }
    }
  }

  // The mountain's law: the sheer band between the lower slope and the high
  // shelf only yields to a climber holding TWO anchors, selected and ready.
  // ---- update 41: THE LIGHT POOL ----
  // Three.js puts every visible light into every lit shader, for every pixel: with the city's 150 lamps the
  // scene held 192 point lights and a 1440p frame took 50 ms on a GTX 1070. Now every PointLight that does not
  // cast shadows is VIRTUAL — hidden, still owned and animated by its module (flicker, night switches, the
  // campfire pool) — and a fixed pool of real lights mirrors the nearest, brightest ones. The count of real
  // lights never changes, so no shader ever recompiles. Lights created later are picked up by a 2 s rescan.
  initLightPool() {
    this.lpool = []; this.vlights = []; this.lpoolT = 0; this.lscanT = 0;
    const n = (CFG.perf && CFG.perf.lightPool) || 12;
    for (let i = 0; i < n; i++) { const l = new THREE.PointLight(0xffffff, 0, 10, 2); l.position.set(0, -500, 0); l.userData.pool = true; this.scene.add(l); this.lpool.push({ l, v: null, fade: 0 }); }
    this.scanLights();
  }
  scanLights() {
    const seen = new Set(this.vlights);
    this.scene.traverse((o) => {
      if (!o.isPointLight || o.userData.pool || o.castShadow || seen.has(o)) return;
      o.visible = false; o.userData.virtual = true; this.vlights.push(o);
    });
  }
  updateLightPool(dt) {
    if (!this.lpool) return;
    this.lscanT -= dt; if (this.lscanT <= 0) { this.lscanT = 2; this.scanLights(); }
    this.lpoolT -= dt;
    const p = this.player.pos;
    if (this.lpoolT <= 0) {
      this.lpoolT = 0.15;
      const cand = [];
      for (const v of this.vlights) {
        if (v.intensity <= 0 || !v.parent) continue;
        let shown = true; for (let q = v.parent; q; q = q.parent) if (q.visible === false) { shown = false; break; }
        if (!shown) continue;
        const e = v.matrixWorld.elements, d = Math.hypot(e[12] - p.x, e[13] - p.y, e[14] - p.z), reach = v.distance || 20;
        if (d > reach * 1.3 + 4) continue;
        v.userData.score = v.intensity / (1 + (d * d) / (reach * reach * 0.25));
        cand.push(v);
      }
      cand.sort((a, b) => b.userData.score - a.userData.score);
      const top = new Set(cand.slice(0, this.lpool.length));
      for (const P of this.lpool) if (P.v && !top.has(P.v)) P.v = null;
      for (const v of top) if (!this.lpool.some((P) => P.v === v)) { const free = this.lpool.find((P) => !P.v); if (free) { free.v = v; free.fade = 0; } }
    }
    for (const P of this.lpool) {
      const l = P.l, v = P.v;
      if (!v || !v.parent) { l.intensity = 0; P.v = null; continue; }
      P.fade = Math.min(1, P.fade + dt * 5);
      const e = v.matrixWorld.elements; l.position.set(e[12], e[13], e[14]);
      l.color.copy(v.color); l.distance = v.distance; l.decay = v.decay; l.intensity = v.intensity * P.fade;
    }
  }
  enforceClimb() {
    const M = CFG.mountain, p = this.player;
    // THE dungeon-entry bug (three reports): the summit "world's-end" wall
    // below (d < wallD+2) radially shoved the player back out — and the
    // tunnel bores STRAIGHT through that radius. Inside the dungeon the
    // mountain's surface laws simply do not apply.
    if (this.world.inDungeon(p.pos.x, p.pos.z)) return;
    // update 28: mid-slide the band is EXPECTED to be crossed — no shoving
    if (this.sliding) return;
    const dx = p.pos.x - M.cx, dz = p.pos.z - M.cz;
    const d = Math.hypot(dx, dz);
    if (d < M.cliffLo + 6 && d > M.cliffHi - 6) {
      const inBand = d < M.cliffLo && d > M.cliffHi;
      if (inBand) {
        const sel = p.inv.selected();
        const anchors = p.inv.slots.reduce((n, s) => n + (s && s.id === "climbing_anchor" ? s.count : 0), 0);
        const ok = sel && sel.id === "climbing_anchor" && anchors >= CFG.climbAnchorsNeeded;
        if (!ok) {
          // shove back to whichever rim they came from
          const back = (this._climbSide || "low") === "low" ? M.cliffLo + 0.5 : M.cliffHi - 0.5;
          const k = back / (d || 1);
          p.pos.x = M.cx + dx * k;
          p.pos.z = M.cz + dz * k;
          p.pos.y = this.world.groundHeight(p.pos.x, p.pos.z, p.pos.y);
          p.vel.set(0, 0, 0);
          // going UP still demands anchors, loudly. Going DOWN stays quiet —
          // the standing "slide down [F]" prompt at the edge says it all.
          if (this._climbSide !== "high" && (this._climbToastT || 0) < this.time) {
            this.ui.toast(STR.climbNeed);
            this.audio.sDeny();
            this._climbToastT = this.time + 5;
          }
        }
      } else {
        this._climbSide = d >= M.cliffLo ? "low" : "high";
      }
    }
    // the summit wall — the world simply ends here
    if (d < M.wallD + 2 && d > 0.001) {
      const k = (M.wallD + 2) / d;
      p.pos.x = M.cx + dx * k;
      p.pos.z = M.cz + dz * k;
    }
  }

  // Hans and Emily are ALIVE: they stroll between spots inside the fence,
  // pause, look around, and turn to face you when you come close to talk
  updateCampers(dt) {
    const CP = CFG.camp;
    const p = this.player;
    for (const w of this.campers || []) {
      const b = w.body;
      const pd = Math.hypot(p.pos.x - b.position.x, p.pos.z - b.position.z);
      if (pd < 3.2) {
        // company — stop wandering and give the visitor your attention
        w.state = "stand";
        w.t = Math.max(w.t, 1.6);
        const want = Math.atan2(p.pos.x - b.position.x, p.pos.z - b.position.z);
        let dy = want - b.rotation.y;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        b.rotation.y += dy * Math.min(1, dt * 6);
      } else if (w.state === "stand") {
        w.t -= dt;
        if (w.t <= 0) {
          // pick a new spot on the inner circle — clear of the fire pit and tents
          const a = this.rng() * Math.PI * 2;
          const d = 2.4 + this.rng() * 2.8;
          w.tx = CP.x + Math.cos(a) * d;
          w.tz = CP.z + Math.sin(a) * d;
          w.state = "walk";
        }
      }
      if (w.state === "walk") {
        const dx = w.tx - b.position.x, dz = w.tz - b.position.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.25) {
          w.state = "stand";
          w.t = 5 + this.rng() * 10;
        } else {
          const step = Math.min(1.05 * dt, d);
          b.position.x += (dx / d) * step;
          b.position.z += (dz / d) * step;
          b.rotation.y = Math.atan2(dx, dz);
        }
      }
      const gy = this.world.groundHeight(b.position.x, b.position.z, 0);
      const anim = b.userData.anim;
      if (anim) {
        // real clips: legs stride, arms swing, the body LIVES
        b.position.y = gy;
        anim.drive(w.state === "walk" ? "walk" : "idle", w.state === "walk" ? 0.85 : 0, 0.9, dt);
      } else {
        // fallback statue: a step bob on the move, a slow breath at rest
        b.position.y = gy + (w.state === "walk"
          ? Math.abs(Math.sin(this.time * 7 + w.ph)) * 0.05
          : Math.sin(this.time * 1.6 + w.ph) * 0.012);
        if (w.state === "stand" && pd >= 3.2) b.rotation.y += Math.sin(this.time * 0.45 + w.ph) * 0.0012;
      }
    }
  }

  // the wine: warmth now, wobbling legs for a minute
  startDrunk() {
    this.drunkT = CFG.wine.drunkTime;
    this.ui.toast(STR.drunkStart);
  }

  // the mother's kill: her mouth closes around you and lifts you off the ground
  startMotherGrab(mother) {
    if (this.grabbed || this.player.dead) return;
    this.grabbed = { mother, t: 0, from: this.player.pos.clone() };
    mother.lungeT = 0.4;
    this.ui.toast(STR.motherGrab);
    this.audio.play("roar", { vol: 1 });
    this.ui.shake(2);
  }
  updateGrab(dt) {
    const g = this.grabbed;
    const M = CFG.mother;
    const m = g.mother, p = this.player;
    g.t += dt;
    const k = Math.min(1, g.t / M.grabTime);
    const ease = k * k * (3 - 2 * k);
    // hoisted toward her jaws — a point ahead of her chest, high above
    const mx = m.pos.x + Math.sin(m.yaw) * 4.0;
    const mz = m.pos.z + Math.cos(m.yaw) * 4.0;
    const my = this.world.groundHeight(m.pos.x, m.pos.z, 0) + M.height * 0.6;
    p.pos.x += (mx - p.pos.x) * Math.min(1, ease + dt * 3);
    p.pos.z += (mz - p.pos.z) * Math.min(1, ease + dt * 3);
    p.pos.y = g.from.y + (my - g.from.y) * ease;
    // stare back into her eyes on the way up; the world shudders
    const ddx = m.pos.x - p.pos.x, ddz = m.pos.z - p.pos.z;
    p.yaw = Math.atan2(-ddx, -ddz);
    p.pitch = Math.max(-0.4, 0.5 - ease * 0.9);
    this.camera.position.set(p.pos.x, p.pos.y + 0.8, p.pos.z);
    this.camera.rotation.set(p.pitch, p.yaw, Math.sin(g.t * 26) * 0.09 * k, "YXZ");
    this.ui.shake(0.5);
    if (g.t >= M.grabTime) {
      this.grabbed = null;
      p.damage(999, "mother");
    }
  }

  // ---------- simulation ----------
  step(dt, input) {
    this.time += dt;
    this.updateDayNight(dt);
    // caught by the mother: the kill cinematic owns the camera
    if (this.grabbed) {
      this.updateGrab(dt);
      for (const c of this.creatures) c.update(dt, this);
      for (const w of this.wolves) w.update(dt, this);
      this.updateMusic();
      this.ui.bars(this.player.hp, this.player.en, this.player.hu);
      return;
    }
    // update 35: Elisia's kiss — a short cinematic that owns the camera
    if (this.elisia && this.elisia.cine) {
      this.elisia.updateCinematic(dt);
      for (const c of this.creatures) c.update(dt, this);
      for (const w of this.wolves) w.update(dt, this);
      this.elisia.update(dt);
      this.updateMusic();
      this.ui.bars(this.player.hp, this.player.en, this.player.hu);
      return;
    }
    // Bill's coffee: a quick full energy refill over a few seconds
    if (this.coffeeT > 0) {
      this.coffeeT -= dt;
      this.player.en = Math.min(100, this.player.en + (100 / CFG.coffee.regenTime) * dt);
    }
    if (this.sitting) {
      // resting on the chair: energy climbs (never past the cap), time flows
      const p = this.player;
      const c = this.seat || this.world.chairs.sit;   // update 29: any chair, Bill's by default
      const cap = c.cap ?? CFG.sit.cap, regen = c.regen ?? CFG.sit.regen;
      if (p.en < cap) p.en = Math.min(cap, p.en + regen * dt);
      p.hu = Math.max(0, p.hu - CFG.player.hungerDrain * dt);
      p.pos.set(c.x, c.y, c.z);
      this.camera.position.set(c.x, c.y + 1.15, c.z);
      this.camera.rotation.set(p.pitch, p.yaw, 0, "YXZ");
      p.yaw += (input.turn || 0) * 2.7 * dt;
      p.yaw -= input.look.dx * 0.0023;
      p.pitch = Math.max(-1.45, Math.min(1.45, p.pitch - input.look.dy * 0.0023));
      input.look.dx = input.look.dy = 0;
      this.ui.prompt(`${STR.sitResting} — ${STR.standUp} [${STR.interact}]`);
      if (input.interact || input.move.x || input.move.z || input.jump) {
        input.interact = false; input.jump = false;
        this.sitting = false;
        if (this.seat) p.pos.set(c.x + Math.sin(c.yaw) * 0.9, c.y, c.z + Math.cos(c.yaw) * 0.9); // step back off the chair
        else p.pos.set(c.x, c.y, c.z + 1.0); // step clear of the chair
        this.seat = null;
      }
      this.updateBill(dt);
      this.farm.update(dt);
      for (const c2 of this.creatures) c2.update(dt, this);
      for (const w of this.wolves) w.update(dt, this);
      this.updateMusic();
      this.ui.bars(this.player.hp, this.player.en, this.player.hu);
      return;
    }
    this.player.update(dt, input, this);
    this.enforceClimb();
    this.updateSlide(dt);
    this.updateRocks(dt);
    if (this.jabbBody && this.jabbBody.userData.anim) this.jabbBody.userData.anim.drive("idle", 0, 0, dt);
    this.updateBill(dt);
    this.updateTimo(dt);
    this.updateCampers(dt);
    this.farm.update(dt);
    // the drunk minute ticks down on screen
    if (this.drunkT > 0) {
      this.drunkT -= dt;
      this.ui.setDrunk(this.drunkT);
      if (this.drunkT <= 0) { this.ui.setDrunk(0); this.ui.toast(STR.drunkEnd); }
    }
    this.updateExpansion(dt);
    for (const c of this.creatures) c.update(dt, this);
    for (const w of this.wolves) w.update(dt, this);
    for (const d of this.drops) d.update(dt);
    // player-dropped items live 10 minutes, then the forest reclaims them
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      if (d.ttl > 0 && (d.ttl -= dt) <= 0) {
        d.dispose(this.scene);
        this.drops.splice(i, 1);
      }
    }
    this.updateSpears(dt);
    this.updateArrows(dt);
    this.elisia.update(dt);   // update 35
    this.desert.update(dt);   // update 36
    this.portals.update(dt);  // update 37
    this.city.update(dt);     // update 39
    this.updateLightPool(dt);   // update 41
    this.updateHunt();
    // 20Hz is plenty for proximity prompts — profiling showed this scan was
    // the main thread's top allocator (~45 label strings/frame). A pending
    // F-press still processes IMMEDIATELY (input.interact latches until read).
    this._intT = (this._intT || 0) + 1;
    if (input.interact || this._intT >= 3) { this._intT = 0; this.updateInteract(input); }
    if (input.use) { this.player.attack(this); input.use = false; }
    this.updateDropHold(dt, input);
    this.updateArrowStore(dt, input);
    this.updateTreePerch(dt);
    this.updateCooking(dt);
    this.updateGoal();
    this.updateMusic();
    this.updateChickenSound();
    this.ui.bars(this.player.hp, this.player.en, this.player.hu);
    this.coinsT = (this.coinsT || 0) - dt;
    if (this.coinsT <= 0) { this.coinsT = 0.4; this.ui.coinsVisible(!!(this.world.desert && this.world.desert.inDesert(this.player.pos.x, this.player.pos.z))); }   // update 44: the purse belongs to the desert
  }

  updateDayNight(dt) {
    const { dayLen, nightLen } = CFG.time;
    const cycle = dayLen + nightLen;
    const t = this.time % cycle;
    const newDay = Math.floor(this.time / cycle) + 1;
    const wasNight = this.isNight;
    this.isNight = t >= dayLen;

    // darkness factor with dusk/dawn ramps
    const duskW = dayLen * CFG.time.duskFrac, dawnW = dayLen * CFG.time.dawnFrac;
    let k;
    if (t < dawnW) k = 1 - t / dawnW;
    else if (t < dayLen - duskW) k = 0;
    else if (t < dayLen) k = (t - (dayLen - duskW)) / duskW;
    else k = 1;
    // NIGHT VISION: goggles in hand turn the dark into green daylight —
    // the world lights up, the fog pulls back, the screen washes green
    const sel = this.player.inv.selected();
    const nvg = !!(sel && sel.id === "goggles" && k > 0.2);
    // the dungeon keeps its OWN hour: crystal dusk — darker than day,
    // never as black as the night outside
    const inDun = this.world.inDungeon(this.player.pos.x, this.player.pos.z);
    // update 42: inside the mountain the night is the cavern's own — warm, a little dimmer (CFG.env.cave)
    const inMt = !!(this.city && this.city.inMountain(this.player.pos.x, this.player.pos.z, this.player.pos.y));
    this.world.updateEnv(nvg ? 0.08 : inDun ? 0.55 : inMt ? k * 0.8 : k, inMt && !nvg);
    if (this.elisia) this.elisia.applyMist(dt);   // update 35: her mist sits on top of the day's fog
    this.ui.nightVig(nvg ? 0 : (inDun ? 0.55 : inMt ? k * 0.4 : k) * 0.7);
    this.ui.nvgOverlay(nvg);
    // the soundscape follows the light — crickets fade in WITH the dusk
    this.audio.nightMix(k);

    let phase = STR.timeDay;
    if (t < dawnW) phase = STR.timeDawn;
    else if (this.isNight) phase = STR.timeNight;
    else if (t > dayLen - duskW) phase = STR.timeDusk;
    this.ui.clockDisplay(this.dayNum, phase, this.isNight);

    if (this.isNight && !wasNight) this.onNightfall();
    if (!this.isNight && wasNight) this.onMorning();
    if (newDay !== this.dayNum) {
      this.dayNum = newDay;
      if (this.dayNum >= CFG.time.winDay && !this.wonShown) {
        this.wonShown = true;
        this.menuOpen = true;
        this.ui.win(() => this.resume());
      }
    }
  }

  // ---------- expansion systems: fishing, crocodile, death bag, quest ----------
  updateExpansion(dt) {
    const p = this.player;
    // fishing
    if (this.fishing) {
      if (Math.hypot(p.pos.x - this.fishing.x, p.pos.z - this.fishing.z) > 1.6) this.fishing = null;
      else {
        this.fishing.t -= dt;
        if (this.fishing.t <= 0) {
          this.fishing = null;
          if (p.inv.add("raw_fish", 1)) { this.ui.toast(STR.fishCaught); this.audio.sPickup(); }
          else this.ui.toast(STR.inventoryFull);
          this.ui.renderHotbar(p.inv);
        }
      }
    }
    // crocodile ambush — the SILENT rules: the moment you step into the
    // water there is a 20% chance one is already gliding toward you; wade
    // for more than 30 seconds and the strike is certain. No timer, no
    // text — the lake just erupts. The croc stays invisible underwater
    // until the moment it surfaces to attack.
    const inWater = this.world.lakePenetration(p.pos.x, p.pos.z) > 0;
    const crocOut = this.creatures.some((c) => c.type === "croc");
    if (inWater && !crocOut) {
      if (!this.wasInWater) {
        this.wasInWater = true;
        this.waterT = 0;
        this.crocStrikeAt = this.rng() < CFG.croc.entryChance
          ? 1.2 + this.rng() * 2.2
          : CFG.croc.guaranteedAfter;
      }
      this.waterT += dt;
      if (this.waterT >= this.crocStrikeAt) {
        this.wasInWater = false;
        const L = CFG.lake;
        const a = Math.atan2(p.pos.x - L.x, p.pos.z - L.z);
        const sd = Math.min(Math.hypot(p.pos.x - L.x, p.pos.z - L.z) + 9, L.r * 0.8);
        const croc = new Creature("croc", this.assets.glb.croc,
          L.x + Math.sin(a) * sd, L.z + Math.cos(a) * sd, this.ctx);
        croc.hidden = true;
        croc.group.visible = false;
        this.creatures.push(croc);
      }
    } else if (!inWater) {
      this.wasInWater = false;
    }
    // stolen nest eggs regrow ten minutes after the theft
    if (this.world.nestEggs) {
      for (const m of this.world.nestEggs) {
        if (!m.visible && m.userData.hideT !== undefined && this.time - m.userData.hideT > CFG.nest.eggRespawn) {
          m.visible = true;
          m.userData.hideT = undefined;
          this.ui.toast(STR.eggRegrown);
        }
      }
    }
    // discovery: stand at a named place once and it joins your map forever
    this.discT = (this.discT || 0) - dt;
    if (this.discT <= 0) {
      this.discT = 0.5;
      for (const loc of CFG.locations) {
        if (this.discovered.has(loc.id)) continue;
        if (Math.hypot(p.pos.x - loc.x, p.pos.z - loc.z) < loc.r) {
          this.discovered.add(loc.id);
          this.ui.toast(`${STR.discovered}: ${STR.locations[loc.id]}`);
          this.audio.sPickup();
        }
      }
      if (!this._cSafeShown && this.world.inContainer(p.pos.x, p.pos.z)) {
        this._cSafeShown = true;
        this.ui.toast(STR.containerSafe);
      }
    }
    // remove finished dynamic creatures (croc gone, mother faded, dead crocs)
    for (let i = this.creatures.length - 1; i >= 0; i--) {
      const c = this.creatures[i];
      if (c.gone || (c.type === "croc" && c.dead && c.stateT > 2.5)) {
        this.scene.remove(c.group);
        this.creatures.splice(i, 1);
        if (c.type === "mother") this.mother = null;
      }
    }
    // death bag countdown
    if (this.deathBag) {
      this.deathBag.ttl -= dt;
      if (this.deathBag.ttl <= 0) {
        this.scene.remove(this.deathBag.mesh);
        this.deathBag = null;
        this.ui.toast(STR.deathBagGone);
      }
    }
    // Bill heals his egg-bringer on sight
    this.healCd -= dt;
    if (this.quest.given && this.billBody && this.healCd <= 0 && p.hp < 40) {
      if (Math.hypot(this.billBody.position.x - p.pos.x, this.billBody.position.z - p.pos.z) < 3.5) {
        p.hp = 100;
        this.healCd = 15;
        this.ui.toast(STR.billHealed);
        this.audio.sPickup();
      }
    }
  }

  // ---- update 11: the spear throw — the T-Rex hunt ----
  buildSpearMesh() {
    // shaft along +Z, blade at the nose — lookAt() then flies point-first
    const g = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.026, 1.5, 6),
      new THREE.MeshStandardMaterial({ color: 0x6e5636, roughness: 1 }));
    shaft.rotation.x = Math.PI / 2;
    const blade = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.22, 4),
      new THREE.MeshStandardMaterial({ color: 0x9aa0a2, roughness: 0.35, metalness: 0.7 }));
    blade.rotation.x = Math.PI / 2;
    blade.position.z = 0.85;
    g.add(shaft, blade);
    return g;
  }
  throwSpear(player) {
    const sel = player.inv.selected();
    if (!sel || (sel.id !== "spear" && sel.id !== "et_spear")) return;   // update 39: the Eternial spear too
    const kind = sel.id;
    player.inv.consumeSelected();
    this.ui.renderHotbar(player.inv);
    let mesh = this.buildSpearMesh();
    if (kind === "et_spear" && this.assets.glb.etspear3d) { mesh = new THREE.Group(); const m = this.assets.glb.etspear3d.model.clone(); m.rotation.y = Math.PI / 2; m.scale.setScalar(0.75); mesh.add(m); }
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    mesh.position.copy(this.camera.position).addScaledVector(dir, 0.7);
    mesh.lookAt(mesh.position.clone().add(dir));
    this.scene.add(mesh);
    this.spears.push({ mesh, vel: dir.multiplyScalar(CFG.spear.throwSpeed), t: 0, kind });
    this.audio.noise(0.12, 1600, 0.25, "highpass"); // the whoosh
  }
  updateSpears(dt) {
    if (!this.spears.length) return;
    const S = CFG.spear;
    const v = new THREE.Vector3();
    for (let i = this.spears.length - 1; i >= 0; i--) {
      const sp = this.spears[i];
      sp.t += dt;
      sp.vel.y -= S.gravity * dt;
      sp.mesh.position.addScaledVector(sp.vel, dt);
      sp.mesh.lookAt(v.copy(sp.mesh.position).add(sp.vel));
      const P = sp.mesh.position;
      // beasts first — the skull is a small target worth TRIPLE
      let struck = null, head = false;
      for (const c of [...this.creatures, ...this.wolves]) {
        if (c.dead || (c.type === "croc" && c.hidden)) continue;
        const h = c.cfg.height; // already the creature's WORLD height
        if (c.type === "trex" && c.rigged && c.rigged.userData.rig) {
          c.rigged.userData.rig.head.getWorldPosition(v);
          v.y += h * 0.22; // the bone sits at the neck root — the SKULL rides higher
          if (P.distanceTo(v) < S.headR) { struck = c; head = true; break; }
        }
        const gy = this.world.groundHeight(c.pos.x, c.pos.z, 0);
        const bodyR = Math.max(0.5, h * 0.22);
        if (Math.hypot(P.x - c.pos.x, P.z - c.pos.z) < bodyR
            && P.y > gy + h * 0.12 && P.y < gy + h * 0.95) { struck = c; break; }
      }
      if (struck) {
        if (struck.type === "trex") {
          // the spear stays lodged in its hide and rides along
          struck.group.attach(sp.mesh);
          struck.stuckSpears.push(sp.mesh);
        } else {
          this.scene.remove(sp.mesh);
          // it clatters off lesser prey and can be picked back up
          if (struck.type !== "mother" && struck.type !== "spino" && struck.type !== "spinobaby") {
            this.spawnDrop(sp.kind || "spear", 1, P.x, P.z, this.world.groundHeight(P.x, P.z, 0));
          }
        }
        this.spearMult = sp.kind === "et_spear" ? CFG.etSpear.dmgMult : 1;   // update 39
        struck.spearHit(this, head);
        this.spearMult = 1;
        this.spears.splice(i, 1);
        continue;
      }
      // ground, trees, walls — a missed spear lands and waits to be recovered
      let stop = P.y <= this.world.groundHeight(P.x, P.z, P.y) + 0.05;
      if (!stop) {
        for (const t of this.world.treesNear(P.x, P.z)) {
          if (Math.hypot(P.x - t.x, P.z - t.z) < t.r * 0.7 && P.y < 14) { stop = true; break; }
        }
      }
      if (!stop) {
        for (const b of this.world.boxes) {
          if (P.x > b.minX && P.x < b.maxX && P.z > b.minZ && P.z < b.maxZ
              && P.y > b.minY && P.y < b.maxY) { stop = true; break; }
        }
      }
      if (stop || sp.t > 8) {
        this.scene.remove(sp.mesh);
        this.spawnDrop(sp.kind || "spear", 1, P.x, P.z, this.world.groundHeight(P.x, P.z, 0));
        this.emitNoise(P.x, P.z, 25); // the clatter carries — hunters come to look
        this.spears.splice(i, 1);
      }
    }
  }
  // hold left-click with ARROWS selected: after 0.6s they pour into the
  // crossbow's internal magazine (up to 100). Releases re-arm the press.
  updateArrowStore(dt, input) {
    const p = this.player;
    const sel = p.inv.selected();
    const isAmmo = sel && (sel.id === "arrow" || sel.id === "silver_arrow");
    if (input.useHeld && isAmmo && !p.dead && !this.menuOpen) {
      const cbSlot = p.inv.slots.find((s) => s && s.id === "crossbow");
      if (!cbSlot) { this._storeT = 0; return; }
      if (this._storeT === -1) return;              // latched until release
      this._storeT = (this._storeT || 0) + dt;
      if (this._storeT >= 0.6) {
        this._storeT = -1;
        const mag = cbSlot.mag || (cbSlot.mag = { arrow: 0, silver_arrow: 0 });
        const space = CFG.crossbow.mag - mag.arrow - mag.silver_arrow;
        if (space <= 0) { this.ui.toast(STR.crossbowFull); this.audio.sDeny(); return; }
        const move = Math.min(space, sel.count);
        mag[sel.id] += move;
        sel.count -= move;
        if (sel.count <= 0) p.inv.slots[p.inv.sel] = null;
        this.audio.sPickup();
        this.ui.toast(`${STR.crossbowStored} (${mag.arrow + mag.silver_arrow}/${CFG.crossbow.mag})`);
        this.ui.renderHotbar(p.inv);
      }
    } else if (!input.useHeld) this._storeT = 0;
  }

  // update 28: the hen pen is AUDIBLE — a clucking bed behind Bill's hut.
  // Louder as you walk toward it, hushed through the hut's walls, and gone
  // entirely while every hen is dead — each respawn adds its voice back.
  updateChickenSound() {
    const [hx, hz] = CFG.world.hutPos;
    const P = CFG.pen;
    const cx = hx + (P.x0 + P.x1) / 2, cz = hz + (P.z0 + P.z1) / 2;
    let alive = 0, total = 0;
    for (const c of this.creatures) {
      if (c.type === "chicken" && !c.wild) { total++; if (!c.dead) alive++; }
    }
    const p = this.player;
    const d = Math.hypot(p.pos.x - cx, p.pos.z - cz);
    const dist = Math.max(0, 1 - d / 45);
    const muffle = this.world.onHut(p.pos.x, p.pos.z, p.pos.y) ? 0.18 : 1;
    const k = (total ? alive / total : 0) * Math.pow(dist, 1.6) * muffle;
    this.audio.chickenMix(this.playing && !this.menuOpen ? k : 0);
  }

  // update 28: riding the scree down the anchor cliffs — not a climb, a
  // barely-controlled fall. Radially OUTWARD from the peak until the lower
  // rim, then the mountain collects its 30%.
  updateSlide(dt) {
    if (!this.sliding) return;
    const M = CFG.mountain, p = this.player;
    const dx = p.pos.x - M.cx, dz = p.pos.z - M.cz;
    const d = Math.hypot(dx, dz) || 1;
    const nd = d + M.slideSpeed * dt;
    const k = nd / d;
    p.pos.x = M.cx + dx * k;
    p.pos.z = M.cz + dz * k;
    p.pos.y = this.world.groundHeight(p.pos.x, p.pos.z, p.pos.y + 1);
    p.vel.set(0, 0, 0);
    this.ui.shake(0.3);
    this.sliding.t += dt;
    if (nd > M.cliffLo + 1.5 || this.sliding.t > 8) {
      this.sliding = null;
      p.damage(M.slideDmg, "fall");
      this.ui.toast(STR.slideOuch);
    }
  }

  // standing in a treetop: watch for the walk-off (and the hard landing)
  updateTreePerch(dt) {
    const p = this.player, w = this.world;
    if (w.climbSpot) {
      if (Math.hypot(p.pos.x - w.climbSpot.x, p.pos.z - w.climbSpot.z) > 1.5) {
        if (p.pos.y > 4.5) this._fallFrom = p.pos.y;   // stepped off the crown
        w.climbSpot = null;
      }
    }
    // consume the fall only once the player has actually DESCENDED — on the
    // arming frame they are still grounded at crown height (0 m drop)
    if (this._fallFrom && p.onGround && p.pos.y < this._fallFrom - 0.6) {
      if (this._fallFrom - p.pos.y > 5) {
        p.damage(CFG.treeClimb.fallDmg, "fall");
        this.ui.toast(STR.fallOuch);
      }
      this._fallFrom = null;
    }
  }

  // climbing a tree: scroll-taught, two anchors, and the canopy may pay out
  climbTree(tx, tz) {
    const p = this.player;
    const sel = p.inv.selected();
    const anchors = p.inv.slots.reduce((n, s) => n + (s && s.id === "climbing_anchor" ? s.count : 0), 0);
    if (!(sel && sel.id === "climbing_anchor" && anchors >= CFG.climbAnchorsNeeded)) {
      this.ui.toast(STR.climbNeedAnchors);
      this.audio.sDeny();
      return;
    }
    this.world.climbSpot = { x: tx, z: tz, y: CFG.treeClimb.topY };
    p.pos.set(tx, CFG.treeClimb.topY, tz);
    p.vel.set(0, 0, 0);
    this.audio.sStepOn && this.audio.sStepOn("wood", false, false);
    // each tree pays out at most once a run — a 1-in-5 surprise up top
    const key = `${Math.round(tx)},${Math.round(tz)}`;
    if (!this.climbedTrees.has(key)) {
      this.climbedTrees.add(key);
      if (this.rng() < CFG.treeClimb.itemChance) {
        const [id, , n] = pickWeighted(this.rng, CFG.treeClimb.loot);
        if (id === "death_compass" && this.scrollFound.death_compass) return; // one per run
        if (id === "death_compass") this.scrollFound.death_compass = true;
        if (!p.inv.add(id, n)) this.spawnDrop(id, n, tx, tz, this.world.groundHeight(tx, tz, 0.5));
        this.ui.toast(`${STR.treeItemFound} ${STR.items[id].name}${n > 1 ? " ×" + n : ""}`);
        this.audio.sPickup();
        this.ui.renderHotbar(p.inv);
      }
    }
  }

  // a scroll teaches ONCE, then crumbles (all per-run — see the constructor)
  useScroll(id) {
    const SKILL = { scroll_spear: "spear", scroll_arrows: "arrows", scroll_silver_arrows: "silver_arrows",
      scroll_pestle: "pestle", scroll_climb: "treeClimb", scroll_crossbow_use: "crossbowUse",
      scroll_yogurt: "yogurt" };
    const skill = SKILL[id];
    if (!skill) return;
    this.player.inv.consumeSelected();
    this.learned.add(skill);
    this.audio.sPickup();
    this.ui.toast(STR.scrollLearned);
    this.ui.renderHotbar(this.player.inv);
  }

  // the pestle and mortar: silver dagger -> 10 silver dust, with a warning
  usePestle() {
    if (!this.learned.has("pestle")) { this.ui.toast(STR.pestleUnlearned); this.audio.sDeny(); return; }
    if (!this.player.inv.has("silver_dagger")) { this.ui.toast(STR.pestleNothing); this.audio.sDeny(); return; }
    this.menuOpen = true;
    this.ui.wantLock = false;
    document.exitPointerLock?.();
    const s = this.ui.screen(`
      <h2>${STR.items.pestle.name}</h2>
      <p style="max-width:480px">${STR.pestleConfirm}</p>
      <div class="btnRow"><button id="crushYes">${STR.pestleCrush}</button><button id="pnlClose">${STR.pestleCancel}</button></div>`);
    const close = () => { this.ui.closeScreen(); this.resume(); };
    s.querySelector("#crushYes").addEventListener("click", () => {
      this.player.inv.removeOne("silver_dagger");
      for (let i = 0; i < 10; i++) {
        if (!this.player.inv.add("silver_dust", 1)) {
          this.spawnDrop("silver_dust", 1, this.player.pos.x, this.player.pos.z,
            this.world.groundHeight(this.player.pos.x, this.player.pos.z, this.player.pos.y));
        }
      }
      this.audio.sHit();
      this.ui.toast(STR.pestleCrushed);
      this.ui.renderHotbar(this.player.inv);
      close();
    });
    s.querySelector("#pnlClose").addEventListener("click", close);
  }

  // ---- update 27: the crossbow ----
  buildArrowMesh(silver) {
    const g = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.011, 0.55, 5),
      new THREE.MeshStandardMaterial({ color: 0x6e5636, roughness: 1 }));
    shaft.rotation.x = Math.PI / 2;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.08, 4),
      new THREE.MeshStandardMaterial({ color: silver ? 0xdfe3e8 : 0x9aa0a2, roughness: 0.3, metalness: 0.8 }));
    tip.rotation.x = -Math.PI / 2; tip.position.z = -0.3;
    const fl = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.003, 0.1),
      new THREE.MeshStandardMaterial({ color: 0xe0dcd0, roughness: 1 }));
    fl.position.z = 0.23;
    g.add(shaft, tip, fl);
    return g;
  }
  // regular bolts fire first (silver is saved for what needs it); the
  // magazine feeds before loose arrows in the pack
  fireCrossbow(player) {
    if (!this.learned.has("crossbowUse")) { this.ui.toast(STR.crossbowUnlearned); this.audio.sDeny(); return; }
    const sel = player.inv.selected();
    const mag = sel.mag || (sel.mag = { arrow: 0, silver_arrow: 0 });
    let kind = null;
    if (mag.arrow > 0) { mag.arrow--; kind = "arrow"; }
    else if (player.inv.has("arrow")) { player.inv.removeOne("arrow"); kind = "arrow"; }
    else if (mag.silver_arrow > 0) { mag.silver_arrow--; kind = "silver_arrow"; }
    else if (player.inv.has("silver_arrow")) { player.inv.removeOne("silver_arrow"); kind = "silver_arrow"; }
    if (!kind) { this.ui.toast(STR.crossbowEmpty); this.audio.sDeny(); return; }
    const mesh = this.buildArrowMesh(kind === "silver_arrow");
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    mesh.position.copy(this.camera.position).addScaledVector(dir, 0.6);
    mesh.lookAt(mesh.position.clone().add(dir));
    this.scene.add(mesh);
    this.arrows.push({ mesh, vel: dir.multiplyScalar(CFG.crossbow.speed), t: 0, kind });
    this.audio.noise(0.09, 2200, 0.22, "highpass");
    this.ui.renderHotbar(player.inv);
  }
  // a landed (or deflected) arrow returns to the world — minus the 1-in-10
  landArrow(kind, x, z) {
    if (this.rng() < CFG.crossbow.loseChance) return;
    this.spawnDrop(kind, 1, x, z, this.world.groundHeight(x, z, this.player.pos.y + 2));
  }
  updateArrows(dt) {
    if (!this.arrows.length) return;
    const CB = CFG.crossbow;
    const v = new THREE.Vector3();
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const ar = this.arrows[i];
      ar.t += dt;
      ar.vel.y -= CB.gravity * dt;
      ar.mesh.position.addScaledVector(ar.vel, dt);
      ar.mesh.lookAt(v.copy(ar.mesh.position).add(ar.vel));
      const P = ar.mesh.position;
      let struck = null;
      for (const c of [...this.creatures, ...this.wolves]) {
        if (c.dead || (c.type === "croc" && c.hidden)) continue;
        const h = c.cfg.height;
        const gy = this.world.groundHeight(c.pos.x, c.pos.z, c.group.position.y + 1);
        if (Math.hypot(P.x - c.pos.x, P.z - c.pos.z) < Math.max(0.5, h * 0.22)
            && P.y > gy + h * 0.1 && P.y < gy + h * 0.95) { struck = c; break; }
      }
      if (struck) {
        this.scene.remove(ar.mesh);
        this.arrows.splice(i, 1);
        const silver = ar.kind === "silver_arrow";
        const dino = struck.type === "trex" || struck.type === "mother" || struck.type === "spino"
          || struck.type === "spinobaby" || struck.type === "trike" || struck.type === "remotus" || struck.type === "altai";
        if (dino) {
          this.ui.toast(STR.arrowImmune);
          this.audio.sHit();
        } else if (struck.type === "werewolf" && !silver) {
          this.ui.toast(STR.arrowWolfImmune);
          this.audio.sHit();
          struck.state = "chase";
        } else {
          struck.hit(CB.dmg * (silver ? CB.silverMult : 1), this, silver ? "silver_arrow" : "arrow");
        }
        this.landArrow(ar.kind, P.x, P.z);
        continue;
      }
      let stop = P.y <= this.world.groundHeight(P.x, P.z, P.y) + 0.04;
      if (!stop) {
        for (const t of this.world.treesNear(P.x, P.z)) {
          if (Math.hypot(P.x - t.x, P.z - t.z) < t.r * 0.7 && P.y < 14) { stop = true; break; }
        }
      }
      if (!stop) {
        for (const b of this.world.boxes) {
          if (P.x > b.minX && P.x < b.maxX && P.z > b.minZ && P.z < b.maxZ
              && P.y > b.minY && P.y < b.maxY) { stop = true; break; }
        }
      }
      if (stop || ar.t > 7) {
        this.scene.remove(ar.mesh);
        this.landArrow(ar.kind, P.x, P.z);
        this.arrows.splice(i, 1);
      }
    }
  }

  // the hunt HP bar: shows while the beast you wounded is alive and near
  updateHunt() {
    const t = this.huntTarget;
    if (t && !t.dead && t.hp < t.maxHp && t.distToPlayer() < 70) {
      const label = t.type === "elisia" ? STR.huntElisia : t.enraged ? `${STR.huntTrex} — ${STR.huntEnraged}` : STR.huntTrex;
      this.ui.huntBar(label, Math.max(0, t.hp) / t.maxHp, t.enraged);
    } else {
      this.ui.huntBar(null, null);
      if (t && t.dead) this.huntTarget = null;
    }
    // update 38: the T-Rex she fights shows its own bar under hers
    // update 39: the foe's bar lives exactly as long as the fight — when she dies (or feeds, or leaves) both bars go together
    const f = this.huntFoe, ec = this.elisia && this.elisia.c;
    const fightOn = !!(f && !f.dead && ec && !ec.dead && !ec.gone && this.elisia.fight && this.elisia.fight.foe === f);
    if (fightOn && f.distToPlayer() < 90) this.ui.huntBar2(f.imperator ? STR.huntImperator : STR.huntTrex, Math.max(0, f.hp) / f.maxHp);
    else { this.ui.huntBar2(null, null); if (f && !fightOn) this.huntFoe = null; }
  }

  // light the torch: tinderbox, or hold it into any burning fire.
  // Lighting CONVERTS the item — an unlit torch and a burning torch are two
  // different things and never stack into each other.
  lightTorch(player) {
    const nearFire = () => {
      const c = this.world.campfire;
      if (c && Math.hypot(c.x - player.pos.x, c.z - player.pos.z) < 2.5 && player.pos.y < 1.5) return true;
      const cp = this.world.campFire;
      if (cp && Math.hypot(cp.x - player.pos.x, cp.z - player.pos.z) < 2.5) return true;
      const cf = this.world.containerFire;
      if (cf && Math.hypot(cf.x - player.pos.x, cf.z - player.pos.z) < 2.4) return true;
      return (this.world.tempFires || []).some((f) =>
        Math.hypot(f.g.position.x - player.pos.x, f.g.position.z - player.pos.z) < 2.2);
    };
    if (player.inv.has("tinderbox") || nearFire()) {
      const inv = player.inv;
      const sel = inv.slots[inv.sel];
      if (sel && sel.id === "torch") {
        sel.count--;
        if (sel.count <= 0) inv.slots[inv.sel] = null;
      } else inv.removeOne("torch");
      if (!inv.add("lit_torch", 1)) {
        // hands too full to hold the burning thing — it lands at your feet
        this.spawnDrop("lit_torch", 1, player.pos.x, player.pos.z,
          this.world.groundHeight(player.pos.x, player.pos.z, 0));
      }
      this.audio.sCook();
      this.ui.toast(STR.torchLitMsg);
      this.ui.renderHotbar(inv);
    } else {
      this.ui.toast(STR.torchNeedsFire);
      this.audio.sDeny();
    }
  }

  lightFire(player) {
    if (!player.inv.has("tinderbox")) { this.ui.toast(STR.fireNeedsTinder); this.audio.sDeny(); return; }
    player.inv.removeOne("branch");
    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
    // probe the ground from the PLAYER's height — a 0-probe on the mountain
    // returned sea level and buried the fire inside the rock (update 24)
    this.world.spawnTempFire(player.pos.x + fx * 1.4, player.pos.z + fz * 1.4, this.assets.flame, player.pos.y);
    this.audio.sCook();
    this.ui.toast(STR.fireLit);
    this.ui.renderHotbar(player.inv);
  }

  tryFish() {
    const p = this.player;
    if (!this.world.nearShore(p.pos.x, p.pos.z)) { this.ui.toast(STR.items.fishing_rod.desc); return; }
    if (this.fishing) return;
    this.fishing = { x: p.pos.x, z: p.pos.z, t: CFG.fishing.min + this.rng() * (CFG.fishing.max - CFG.fishing.min) };
    this.ui.toast(STR.fishCast);
  }

  // ---- the T-Rex egg heist ----
  takeNestEgg() {
    const idx = this.world.nestEggs.findIndex((m) => m.visible);
    if (idx < 0) return;
    this.world.nestEggs[idx].visible = false;
    this.world.nestEggs[idx].userData.hideT = this.time; // regrows in 10 min
    this.carriedEgg = true;
    this.ui.toast(STR.eggTaken);
    setTimeout(() => { if (this.carriedEgg) this.ui.toast(STR.eggMother); }, 2500);
    if (!this.mother) {
      const p = this.player;
      const N = CFG.nest;
      const a = Math.atan2(p.pos.x - N.x, p.pos.z - N.z) + Math.PI; // far behind, unseen
      const mx = Math.max(-250, Math.min(250, N.x + Math.sin(a) * 60));
      const mz = Math.max(-250, Math.min(250, N.z + Math.cos(a) * 60));
      this.mother = new Creature("mother", this.assets.glb.trex, mx, mz, this.ctx);
      this.creatures.push(this.mother);
    } else this.mother.returning = false;
  }
  dropCarriedEgg() {
    if (!this.carriedEgg) return;
    this.carriedEgg = false;
    const p = this.player;
    const N = CFG.nest;
    if (Math.hypot(p.pos.x - N.x, p.pos.z - N.z) < N.r + 3) return this.returnEggToNest(true);
    const egg = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 9),
      new THREE.MeshStandardMaterial({ color: 0xcfc0a0, roughness: 0.7 }));
    egg.scale.y = 1.3;
    egg.position.set(p.pos.x, this.world.groundHeight(p.pos.x, p.pos.z, p.pos.y) + 0.38, p.pos.z);
    this.scene.add(egg);
    this.droppedEgg = { x: p.pos.x, z: p.pos.z, mesh: egg };
    this.ui.toast(STR.eggDrop);
  }
  returnEggToNest(silent) {
    this.carriedEgg = false;
    const hidden = this.world.nestEggs.find((m) => !m.visible);
    if (hidden) { hidden.visible = true; hidden.userData.hideT = undefined; }
    if (this.mother) this.mother.returning = true;
    this.ui.toast(STR.eggReturned);
    void silent;
  }
  giveEggToBill() {
    this.carriedEgg = false;
    this.billEggs += 1;
    localStorage.pdBillEggs = String(this.billEggs);
    if (!this.quest.given) {
      this.quest.given = true;
      this.player.inv.add("machete", 1);
    }
    if (this.mother) this.mother.returning = true;
    this.ui.renderHotbar(this.player.inv);
    const line = this.billEggs === 1 ? STR.billEggThanks
      : this.billEggs === 2 ? STR.billEggMore
      : this.billEggs === 3 ? STR.billEggChest : STR.billTraded;
    this.panelShell(STR.billTitle, `<p style="text-align:left">${line}</p>`);
  }

  // Bill lives his little life: stands a while, WALKS to his chair, SITS
  // DOWN (real animation), rests, stands back up and walks to his spot.
  updateBill(dt) {
    if (!this.billBody || !this.world.chairs) return;
    const st = this.billState;
    const anim = this.billAnim;
    const chair = this.world.chairs.bill, stand = this.world.bill;
    const body = this.billBody;
    st.t -= dt;
    const moveTo = (tx, tz, speed) => {
      const dx = tx - body.position.x, dz = tz - body.position.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.06) {
        body.rotation.y = Math.atan2(dx, dz);
        const step = Math.min(speed * dt, d);
        body.position.x += (dx / d) * step;
        body.position.z += (dz / d) * step;
      }
      return d < 0.1;
    };
    if (!st.mode) st.mode = "stand";
    switch (st.mode) {
      case "stand":
        if (anim) anim.drive("idle", 0, 0, dt);
        if (st.t <= 0) st.mode = "toChair";
        break;
      case "toChair":
        if (anim) anim.drive("walk", 0.85, 0.9, dt);
        if (moveTo(chair.x + 0.75, chair.z, 0.85)) {
          // seat him a touch FORWARD of the chair center — his back rests
          // against the backrest instead of passing through it
          const fwd = CFG.bill.sitForward;
          body.position.set(chair.x + Math.sin(chair.yaw) * fwd, chair.y,
            chair.z + Math.cos(chair.yaw) * fwd);
          body.rotation.y = chair.yaw;
          st.mode = "sitDown";
          st.t = anim && anim.actions.sitDown ? anim.playOnce("sitDown") : 0.1;
          if (!(anim && anim.actions.sitDown)) body.position.y = chair.y - 0.45;
        }
        break;
      case "sitDown":
        if (anim) anim.update(dt);
        if (st.t <= 0) { st.mode = "sit"; st.t = 60 + this.rng() * 120; }
        break;
      case "sit":
        if (anim && anim.actions.sitIdle) anim.drive("sitIdle", 0, 0, dt);
        else if (anim) anim.update(dt);
        if (st.t <= 0) {
          st.mode = "standUp";
          st.t = anim && anim.actions.standUp ? anim.playOnce("standUp") : 0.1;
        }
        break;
      case "standUp":
        if (anim) anim.update(dt);
        if (st.t <= 0) { st.mode = "toStand"; body.position.y = stand.y; }
        break;
      case "toStand":
        if (anim) anim.drive("walk", 0.85, 0.9, dt);
        if (moveTo(stand.x, stand.z, 0.85)) {
          st.mode = "stand";
          st.t = 45 + this.rng() * 120;
          body.rotation.y = stand.yaw;
        }
        break;
    }
  }

  toggleDoor(d = this.world.hutDoor) {
    d.open = !d.open;
    this.audio.sChest();
    if (d.open) {
      Object.assign(d.boxRef, { minX: 1e6, maxX: 1e6 + 0.1, minZ: 1e6, maxZ: 1e6 + 0.1 });
    } else {
      Object.assign(d.boxRef, d.closedBox);
    }
  }

  onNightfall() {
    this.ui.toast(STR.nightFalls);
    this.audio.play("howl", { vol: 0.8 });
    // summon wolves near (not at) the player — the cave pack doesn't count
    while (this.wolves.filter((w) => !w.caveWolf && !w.raider).length < CFG.werewolf.count) {
      let x = 0, z = 0, tries = 0;
      do {
        const a = this.rng() * Math.PI * 2;
        const d = 34 + this.rng() * 26;
        x = this.player.pos.x + Math.cos(a) * d;
        z = this.player.pos.z + Math.sin(a) * d;
        const sq = CFG.world.square - 5;
        x = Math.max(-sq, Math.min(sq, x));
        z = Math.max(-sq, Math.min(sq, z));
      } while ((this.world.inFarm(x, z) || (this.city && this.city.inZone(x, z))) && ++tries < 16);   // update 29: never born inside the farm; update 42: nor in Eternius
      this.wolves.push(new Creature("werewolf", this.assets.glb.werewolf, x, z, this.ctx));
    }
    for (const w of this.wolves) if (w.dead && w.respawnT > 1e8 && !w.raider) w.respawn();
    this.farm.onNightfall();
  }

  onMorning() {
    this.ui.toast(STR.morning);
    this.world.refillChests(this.lootRng);
    this.world.respawnApples();
    // a new day washes your scent off — the T-Rexes forget your taste
    for (const c of this.creatures) if (c.type === "trex") c.hasTasted = false;
    // the ruins bar and the sea container restock their tinderboxes each dawn
    this.barTinderTaken = false;
    if (this.world.barTinderMesh) this.world.barTinderMesh.visible = true;
    this.containerTinderTaken = false;
    if (this.world.containerTinderMesh) this.world.containerTinderMesh.visible = true;
    // ...and the two spare knives reappear where they always lie
    for (const k of this.world.knifeSpots || []) k.mesh.visible = true;
    // Bill sets a fresh needle out on his table
    if (this.world.needleMesh) this.world.needleMesh.visible = true;
    // ...and Jabb lays a spare hammer on the stump
    if (this.world.hammerMesh) this.world.hammerMesh.visible = true;
    this.farm.onMorning();
    this.city.onMorning();   // update 39: the king's daily task
    this.elisia.onMorning();   // update 35
    this.portals.onMorning();  // update 37
  }

  // ---------- panels: Bill, storage, crafting ----------
  panelShell(title, inner) {
    this.menuOpen = true;
    const s = this.ui.screen(`
      <h1 style="font-size:26px">${title}</h1>
      <div style="max-width:560px;width:92vw">${inner}</div>
      <button id="pnlClose">${STR.close}</button>`);
    s.querySelector("#pnlClose").addEventListener("click", () => { this.ui.closeScreen(); this.resume(); });
    return s;
  }

  openDialog(page = "main") {
    const texts = { main: STR.billLines, rex: STR.billRexLines, safe: STR.billSafeLines }[page];
    const lines = texts.map((l) => `<p style="text-align:left">${l}</p>`).join("");
    const coffeeBtn = `<button id="coffeeBtn" style="font-size:14px;padding:9px 22px">${STR.billCoffee}</button>`;
    const questBtns = this.quest.given ? `
      <button id="healBtn" style="font-size:14px;padding:9px 22px">${STR.billHeal}</button>
      ${!this.player.inv.has("machete") ? `<button id="macheteBtn" style="font-size:14px;padding:9px 22px">${STR.billMachete}</button>` : ""}` : "";
    const extra = page === "main" ? `
      <button id="askRex" style="font-size:14px;padding:9px 22px">${STR.billAskRex}</button>
      <button id="askSafe" style="font-size:14px;padding:9px 22px">${STR.billAskSafe}</button>
      <button id="tradeBtn" style="font-size:14px;padding:9px 22px">${STR.billTradeBtn}</button>${coffeeBtn}${questBtns}
      <p class="sub" id="tradeMsg"></p>` : "";
    const s = this.panelShell(STR.billTitle, `${lines}${extra}`);
    if (page !== "main") {
      // Back returns to Bill's main dialogue instead of closing
      const closeBtn = s.querySelector("#pnlClose");
      closeBtn.textContent = STR.billBack;
      const clone = closeBtn.cloneNode(true);
      closeBtn.replaceWith(clone);
      clone.addEventListener("click", () => this.openDialog("main"));
      this.ui.refreshNav();
      return;
    }
    s.querySelector("#askRex").addEventListener("click", () => this.openDialog("rex"));
    s.querySelector("#askSafe").addEventListener("click", () => this.openDialog("safe"));
    s.querySelector("#coffeeBtn")?.addEventListener("click", () => {
      if (this.coffeeDay === this.dayNum) {
        s.querySelector("#tradeMsg").textContent = STR.billCoffeeUsed;
        this.audio.sDeny();
        return;
      }
      this.coffeeDay = this.dayNum;
      this.ui.closeScreen();
      this.resume();
      // you sit together; he pours; warmth returns fast
      this.sitting = true;
      this.player.vel.set(0, 0, 0);
      this.player.yaw = this.world.chairs.sit.yaw;
      this.coffeeT = CFG.coffee.regenTime;
      this.player.heal(20);   // update 24: the daily cup also mends 20% health
      this.audio.sDrink();
      this.ui.toast(STR.billCoffeeMsg);
    });
    s.querySelector("#healBtn")?.addEventListener("click", () => {
      this.player.hp = 100;
      this.audio.sPickup();
      s.querySelector("#tradeMsg").textContent = STR.billHealed;
    });
    s.querySelector("#macheteBtn")?.addEventListener("click", () => {
      const eggs = this.player.inv.slots.reduce((n, sl) => n + (sl && sl.id === "egg" ? sl.count : 0), 0);
      if (eggs < 10) { s.querySelector("#tradeMsg").textContent = STR.billNoEggs; return; }
      let need = 10;
      while (need-- > 0) this.player.inv.removeOne("egg");
      this.player.inv.add("machete", 1);
      this.audio.sPickup();
      s.querySelector("#tradeMsg").textContent = STR.billMacheteGiven;
      this.ui.renderHotbar(this.player.inv);
    });
    const refresh = () => {
      const eggs = this.player.inv.slots.reduce((n, sl) => n + (sl && sl.id === "egg" ? sl.count : 0), 0);
      s.querySelector("#tradeBtn").disabled = eggs < CFG.eggTrade.eggs;
      s.querySelector("#tradeBtn").style.opacity = eggs < CFG.eggTrade.eggs ? 0.45 : 1;
      this.ui.refreshNav();
    };
    s.querySelector("#tradeBtn").addEventListener("click", () => {
      let need = CFG.eggTrade.eggs;
      const eggs = this.player.inv.slots.reduce((n, sl) => n + (sl && sl.id === "egg" ? sl.count : 0), 0);
      if (eggs < need) { s.querySelector("#tradeMsg").textContent = STR.billNoEggs; return; }
      while (need-- > 0) this.player.inv.removeOne("egg");
      this.player.inv.add(CFG.eggTrade.gives, 1);
      this.audio.sPickup();
      s.querySelector("#tradeMsg").textContent = STR.billTraded;
      this.ui.renderHotbar(this.player.inv);
      refresh();
    });
    refresh();
  }

  // ---- the campers' dialogues: lore, tips, and the Timo rescue ----
  npcPanel(title, lines, buttons = []) {
    const body = lines.map((l) => `<p style="text-align:left">${l}</p>`).join("");
    const btns = buttons.map(([id, label]) =>
      `<button id="${id}" style="font-size:14px;padding:9px 22px">${label}</button>`).join("");
    return this.panelShell(title, `${body}${btns}`);
  }
  openHans(page = "main") {
    if (page === "mystery") {
      const s = this.npcPanel(STR.hansTitle, STR.hansMysteryLines);
      this.backToMain(s, () => this.openHans());
      return;
    }
    if (page === "danger") {
      const s = this.npcPanel(STR.hansTitle, STR.hansDangerLines);
      this.backToMain(s, () => this.openHans());
      return;
    }
    if (page === "timo") {
      if (this.questTimo === 0) {
        this.questTimo = 1;
        if (this.timoBody) this.timoBody.visible = true;
        this.ui.toast(STR.timoWaits);
      }
      const s = this.npcPanel(STR.hansTitle, STR.hansTimoLines);
      this.backToMain(s, () => this.openHans());
      return;
    }
    const lines = [...STR.hansLines];
    if (this.questTimo === 1 || this.questTimo === 2) lines.push(STR.hansQuestActive);
    const buttons = [["hMyst", STR.hansAskMystery], ["hDang", STR.hansAskDanger]];
    if (this.questTimo === 0) buttons.push(["hTimo", STR.hansAskTimo]);
    // wearing one wolf bag and carrying a SPARE: Hans collects wolf work
    const canSell = this.wolfBagOn && this.player.inv.has("wolf_bag");
    if (canSell) {
      lines.push(STR.hansBagIntro);
      buttons.push(["hBag", STR.hansSellBag]);
    }
    const s = this.npcPanel(STR.hansTitle, lines, buttons);
    s.querySelector("#hMyst").addEventListener("click", () => this.openHans("mystery"));
    s.querySelector("#hDang").addEventListener("click", () => this.openHans("danger"));
    s.querySelector("#hTimo")?.addEventListener("click", () => this.openHans("timo"));
    s.querySelector("#hBag")?.addEventListener("click", () => this.sellWolfBag());
    this.ui.refreshNav();
  }
  // Jabb the dwarf: gruff, coffee-rich, and in the market for stolen silver
  openJabb() {
    const lines = [...(this.jabbDone ? STR.jabbLinesDone : STR.jabbLines)];
    const buttons = [["jCoffee", STR.jabbCoffeeBtn]];
    if (!this.jabbDone && this.player.inv.has("silver_bar")) buttons.unshift(["jBar", STR.jabbGiveBar]);
    const s = this.npcPanel(STR.jabbTitle, lines, buttons);
    s.querySelector("#jBar")?.addEventListener("click", () => {
      this.player.inv.removeOne("silver_bar");
      this.player.inv.add("silver_dagger", 1);
      this.jabbDone = true;   // per-run since update 27 — never persisted again
      // silver home, grudge settled — the den calms down
      for (const cw of this.wolves) if (cw.caveWolf) cw.caveAggroed = false;
      this.audio.sPickup();
      this.ui.renderHotbar(this.player.inv);
      const s2 = this.npcPanel(STR.jabbTitle, STR.jabbThanks);
      this.backToMain(s2, () => this.openJabb());
    });
    s.querySelector("#jCoffee").addEventListener("click", () => {
      if (this.jabbCoffeeDay === this.dayNum) { this.ui.toast(STR.billCoffeeUsed); this.audio.sDeny(); return; }
      this.jabbCoffeeDay = this.dayNum;
      this.coffeeT = CFG.coffee.regenTime;
      this.player.heal(20);   // update 24: dwarf brew mends 20% health too
      this.audio.sDrink();
      this.ui.closeScreen();
      this.resume();
      this.ui.toast(STR.jabbCoffeeMsg);
    });
    this.ui.refreshNav();
  }
  // the anvil: metal work the crafting table can't touch
  openSmithing() {
    const rows = CFG.anvilRecipes.map((r, i) => {
      const cost = Object.entries(r.cost)
        .map(([id, n]) => `${n}× ${STR.items[id]?.name || id}`).join(", ");
      return `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 0;border-bottom:1px solid #2c332a">
        <div style="text-align:left"><b>${STR.items[r.id]?.name || r.id}</b>
        <div class="sub" style="margin:2px 0 0">${STR.items[r.id]?.desc || ""} — ${cost}</div></div>
        <button data-ai="${i}" style="font-size:13px;padding:7px 16px">${STR.smithBtn}</button></div>`;
    }).join("");
    const s = this.panelShell(STR.smithTitle, `<p class="sub">${STR.smithHint}</p>${rows}<p class="sub" id="smithMsg"></p>`);
    s.querySelectorAll("button[data-ai]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const r = CFG.anvilRecipes[+btn.dataset.ai];
        const inv = this.player.inv;
        const have = (id) => inv.slots.reduce((n, sl) => n + (sl && sl.id === id ? sl.count : 0), 0);
        if (r.needs && !inv.has(r.needs)) {
          s.querySelector("#smithMsg").textContent = `${STR.craftMissing} (${STR.items[r.needs].name})`;
          this.audio.sDeny();
          return;
        }
        if (!Object.entries(r.cost).every(([id, n]) => have(id) >= n)) {
          s.querySelector("#smithMsg").textContent = STR.craftMissing;
          this.audio.sDeny();
          return;
        }
        for (const [id, n] of Object.entries(r.cost)) for (let k = 0; k < n; k++) inv.removeOne(id);
        inv.add(r.id, 1);
        this.audio.sHit();
        s.querySelector("#smithMsg").textContent = `${STR.crafted}: ${STR.items[r.id].name}`;
        this.ui.renderHotbar(inv);
      });
    });
  }

  // Hans pays for a spare wolf bag with ONE random treasure — sight unseen
  sellWolfBag() {
    const inv = this.player.inv;
    if (!inv.has("wolf_bag")) return;
    inv.removeOne("wolf_bag");
    const rewards = [
      [["wine", 2]], [["cooked_pork", 15]], [["axe", 1]], [["super_energy_drink", 15]],
      [["rope", 15]], [["machete", 1]], [["bandage", 15]], [["goggles", 1]],
    ];
    const pick = rewards[Math.floor(this.lootRng() * rewards.length)];
    const names = pick.map(([id, n]) => `${n > 1 ? n + "× " : ""}${STR.items[id].name}`).join(", ");
    for (const [id, n] of pick) {
      if (!inv.add(id, n)) this.spawnDrop(id, n, this.player.pos.x, this.player.pos.z,
        this.world.groundHeight(this.player.pos.x, this.player.pos.z, 0));
    }
    this.audio.sChest();
    this.ui.renderHotbar(inv);
    const s = this.npcPanel(STR.hansTitle, [STR.hansBagThanks, `${STR.hansBagReward} ${names}.`]);
    this.backToMain(s, () => this.openHans());
  }
  openEmily(page = "main") {
    if (page === "tips") {
      const s = this.npcPanel(STR.emilyTitle, STR.emilyTipsLines);
      this.backToMain(s, () => this.openEmily());
      return;
    }
    if (page === "mother") {
      const s = this.npcPanel(STR.emilyTitle, STR.emilyMotherLines);
      this.backToMain(s, () => this.openEmily());
      return;
    }
    const s = this.npcPanel(STR.emilyTitle, STR.emilyLines,
      [["eTips", STR.emilyAskTips], ["eMoth", STR.emilyAskMother]]);
    s.querySelector("#eTips").addEventListener("click", () => this.openEmily("tips"));
    s.querySelector("#eMoth").addEventListener("click", () => this.openEmily("mother"));
    this.ui.refreshNav();
  }
  backToMain(s, fn) {
    const closeBtn = s.querySelector("#pnlClose");
    closeBtn.textContent = STR.billBack;
    const clone = closeBtn.cloneNode(true);
    closeBtn.replaceWith(clone);
    clone.addEventListener("click", fn);
    this.ui.refreshNav();
  }
  openTimoRuins() {
    const s = this.npcPanel(STR.timoTitle, STR.timoRuinsLines, [["tGo", STR.timoFollowBtn]]);
    s.querySelector("#tGo").addEventListener("click", () => {
      this.questTimo = 2;
      this.ui.closeScreen();
      this.resume();
      this.ui.toast(STR.timoFollowing);
    });
    this.ui.refreshNav();
  }

  openStorage(store = this.storage, title = STR.storageTitle) {
    const COLS = 8;
    const s = this.panelShell(title, `
      <p class="sub">${STR.storageHint}</p>
      <div id="stGrid" style="display:grid;grid-template-columns:repeat(${COLS},54px);gap:4px;justify-content:center;margin:8px 0"></div>
      <div style="border-top:1px solid #3c4438;margin:8px 0"></div>
      <div id="invGrid" style="display:grid;grid-template-columns:repeat(${COLS},54px);gap:4px;justify-content:center"></div>`);
    const invs = [store, this.player.inv];
    const grids = [s.querySelector("#stGrid"), s.querySelector("#invGrid")];
    // one item crosses per transfer — tap for one, HOLD to pour the stack
    const moveOne = (g, i) => {
      const src = invs[g], dst = invs[1 - g];
      const slot = src.slots[i];
      if (!slot) return;
      if (!dst.add(slot.id, 1)) { this.ui.toast(STR.storageFull); this.ui.stopPour(); return; }
      slot.count--;
      if (slot.count <= 0) { src.slots[i] = null; this.ui.stopPour(); }
      this.ui.renderHotbar(this.player.inv);
      render();
    };
    const nav = this.ui.storeNav = {
      g: 1, i: 0, cols: COLS, moveOne,
      closeBtn: s.querySelector("#pnlClose"),
      lens: [store.slots.length, this.player.inv.slots.length],
      paint() {
        s.querySelectorAll(".slot.knav").forEach((el) => el.classList.remove("knav"));
        this.closeBtn.classList.toggle("knav", this.g === 2);
        if (this.g < 2) grids[this.g].children[this.i]?.classList.add("knav");
      },
      // full 2D travel: left/right walk the row, up/down cross rows, grids
      // and the Close button — storage, pack, Close, and around again
      move(dx, dy) {
        if (this.g === 2) {
          if (dy < 0) { this.g = 1; this.i = Math.min(this.lens[1] - 1, this.i); }
          else if (dy > 0) { this.g = 0; this.i = 0; }
          this.paint(); return;
        }
        if (dx) {
          this.i = (this.i + dx + this.lens[this.g]) % this.lens[this.g];
        } else if (dy) {
          const ni = this.i + dy * this.cols;
          if (ni < 0) {
            if (this.g === 1) { this.g = 0; const col = this.i % this.cols; this.i = Math.min(col + this.cols * (Math.ceil(this.lens[0] / this.cols) - 1), this.lens[0] - 1); }
            else this.g = 2;
          } else if (ni >= this.lens[this.g]) {
            if (this.g === 0) { this.g = 1; this.i = Math.min(this.i % this.cols, this.lens[1] - 1); }
            else this.g = 2;
          } else this.i = ni;
        }
        this.paint();
      },
    };
    const render = () => {
      grids.forEach((el, g) => {
        el.innerHTML = "";
        invs[g].slots.forEach((slot, i) => {
          const d = document.createElement("div");
          d.className = "slot";
          if (slot) {
            d.style.backgroundImage = `url(${iconUrl(slot.id)})`;
            d.innerHTML = `<span class="n">${slot.count > 1 ? slot.count : ""}</span>`;
            d.title = STR.items[slot.id]?.name || slot.id;
            d.style.cursor = "pointer";
          }
          d.addEventListener("pointerdown", (e) => {
            nav.g = g; nav.i = i; nav.paint();
            if (slot) this.ui.startPour(() => moveOne(g, i));
            e.preventDefault();
          });
          el.appendChild(d);
        });
      });
      nav.paint();
    };
    render();
    this.ui.refreshNav();
  }

  openCrafting() {
    // update 27: scroll-taught recipes only APPEAR once their scroll is used
    const rows = CFG.recipes.map((r, i) => {
      if (r.scroll && !this.learned.has(r.scroll)) return "";
      const cost = Object.entries(r.cost)
        .map(([id, n]) => `${n}× ${STR.items[id]?.name || id}`).join(", ");
      const yieldTxt = (r.count || 1) > 1 ? ` ×${r.count}` : "";
      return `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 0;border-bottom:1px solid #2c332a">
        <div style="text-align:left"><b>${STR.items[r.id]?.name || r.id}${yieldTxt}</b>
        <div class="sub" style="margin:2px 0 0">${STR.items[r.id]?.desc || ""} — ${cost}</div></div>
        <button data-ri="${i}" style="font-size:13px;padding:7px 16px">${STR.craftBtn}</button></div>`;
    }).join("");
    const s = this.panelShell(STR.craftTitle, `<p class="sub">${STR.craftHint}</p>${rows}<p class="sub" id="craftMsg"></p>`);
    s.querySelectorAll("button[data-ri]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const r = CFG.recipes[+btn.dataset.ri];
        const inv = this.player.inv;
        const have = (id) => inv.slots.reduce((n, sl) => n + (sl && sl.id === id ? sl.count : 0), 0);
        if (r.needs && !inv.has(r.needs)) {
          s.querySelector("#craftMsg").textContent = `${STR.craftMissing} (${STR.items[r.needs].name})`;
          this.audio.sDeny();
          return;
        }
        if (!Object.entries(r.cost).every(([id, n]) => have(id) >= n)) {
          s.querySelector("#craftMsg").textContent = STR.craftMissing;
          this.audio.sDeny();
          return;
        }
        for (const [id, n] of Object.entries(r.cost)) for (let k = 0; k < n; k++) inv.removeOne(id);
        // arrow batches craft TEN at a time — whatever doesn't fit, drops
        let yieldN = r.count || 1;
        while (yieldN-- > 0) {
          if (!inv.add(r.id, 1)) this.spawnDrop(r.id, 1, this.player.pos.x, this.player.pos.z,
            this.world.groundHeight(this.player.pos.x, this.player.pos.z, this.player.pos.y));
        }
        this.audio.sPickup();
        let msg = `${STR.crafted}: ${STR.items[r.id].name}${(r.count || 1) > 1 ? " ×" + r.count : ""}`;
        // sewing gambles the needle — one snap in five, and it's gone
        if (r.needs === "needle" && this.lootRng() < CFG.needleBreakChance) {
          inv.removeOne("needle");
          msg += ` — ${STR.needleBroke}`;
          this.audio.sDeny();
        }
        s.querySelector("#craftMsg").textContent = msg;
        this.ui.renderHotbar(inv);
      });
    });
  }

  // ---------- interactions ----------
  updateInteract(input) {
    const p = this.player;
    const R = CFG.player.interactR;
    let best = null, bd = R;
    const consider = (x, z, y, label, fn) => {
      const dy = Math.abs((y ?? p.pos.y) - p.pos.y);
      if (dy > 2.4) return;
      const d = Math.hypot(x - p.pos.x, z - p.pos.z);
      if (d < bd) { bd = d; best = { label, fn }; }
    };
    // egg gathering is rate-limited: 5 per minute, silently (no UI text)
    const now = this.time;
    this.eggPickups = (this.eggPickups || []).filter((t) => now - t < CFG.eggPickupCap.windowS);
    const eggCapped = this.eggPickups.length >= CFG.eggPickupCap.max;
    for (const d of this.drops) {
      if (d.id === "egg" && eggCapped) continue; // the prompt simply doesn't appear
      consider(d.pos.x, d.pos.z, d.pos.y, `${STR.pickUp} ${STR.items[d.id].name} [${STR.interact}]`, () => {
        if (!p.inv.add(d.id, d.count)) return this.ui.toast(STR.inventoryFull);
        if (d.id === "egg") this.eggPickups.push(this.time);
        this.audio.sPickup();
        d.dispose(this.scene);
        this.drops.splice(this.drops.indexOf(d), 1);
        this.ui.renderHotbar(p.inv);
      });
    }
    for (const a of this.world.apples) {
      if (a.taken) continue;
      consider(a.x, a.z, 0, `${STR.pickApple} [${STR.interact}]`, () => {
        if (!p.inv.add("apple", 1)) return this.ui.toast(STR.inventoryFull);
        a.taken = true; a.mesh.visible = false;
        this.portals.applePicked(a.tree);   // update 37: the red portal counts trees
        this.audio.sPickup();
        this.ui.renderHotbar(p.inv);
      });
    }
    for (const c of this.world.chests) {
      if (c.opened) continue;
      consider(c.x, c.z, c.y || 0, `${STR.openChest} [${STR.interact}]`, () => this.openChest(c));
    }
    for (const b of this.world.beds) {
      consider(b.x, b.z, b.y, `${STR.sleep} [${STR.interact}]`, () => this.trySleep());
    }
    if (this.world.stove) {
      const s = this.world.stove;
      consider(s.x, s.z, s.y, `${STR.cookPrompt} [${STR.interact}]`, () => this.tryCook(this.world.stove, false));
    }
    if (this.world.campfire) {
      const c = this.world.campfire;
      consider(c.x, c.z, c.y, `${STR.cookFirePrompt} [${STR.interact}]`, () => this.tryCook(this.world.campfire, true));
    }
    if (this.world.storageChest) {
      const s = this.world.storageChest;
      consider(s.x, s.z, s.y, `${STR.openStorage} [${STR.interact}]`, () => this.openStorage());
    }
    if (this.world.craftTable) {
      const s = this.world.craftTable;
      consider(s.x, s.z, s.y, `${STR.useCraft} [${STR.interact}]`, () => this.openCrafting());
    }
    if (this.world.bill) {
      const b = this.billBody ? { x: this.billBody.position.x, z: this.billBody.position.z, y: 2.2 } : this.world.bill;
      if (this.carriedEgg) consider(b.x, b.z, b.y, `${STR.eggToBill} [${STR.interact}]`, () => this.giveEggToBill());
      else consider(b.x, b.z, b.y, `${STR.talkTo} [${STR.interact}]`, () => this.openDialog());
    }
    if (this.world.hutDoor) {
      const d = this.world.hutDoor;
      consider(d.x, d.z, d.y, `${d.open ? STR.closeDoor : STR.openDoor} [${STR.interact}]`, () => this.toggleDoor(d));
    }
    if (this.world.lhDoor) {
      const d = this.world.lhDoor;
      consider(d.x, d.z, d.y, `${d.open ? STR.closeDoor : STR.openDoor} [${STR.interact}]`, () => this.toggleDoor(d));
    }
    if (this.world.lhHatch) {
      const d = this.world.lhHatch;
      consider(d.x, d.z, d.y, `${d.open ? STR.closeHatch : STR.openHatch} [${STR.interact}]`, () => this.toggleDoor(d));
    }
    if (this.world.containerDoor) {
      const d = this.world.containerDoor;
      consider(d.x, d.z, d.y, `${d.open ? STR.closeDoor : STR.openDoor} [${STR.interact}]`, () => this.toggleDoor(d));
    }
    if (this.world.containerFire) {
      const c = this.world.containerFire;
      consider(c.x, c.z, c.y, `${STR.cookFirePrompt} [${STR.interact}]`, () => this.tryCook(this.world.containerFire, true));
    }
    if (this.world.hutChest) {
      const h = this.world.hutChest;
      consider(h.x, h.z, h.y, `${STR.hutChestTitle} [${STR.interact}]`, () => {
        if (this.billEggs >= CFG.billChestEggs) this.openStorage(this.hutStorage, STR.hutChestTitle);
        else { this.ui.toast(STR.hutChestLocked); this.audio.sDeny(); }
      });
    }
    // ---- the camping ----
    if (this.hansBody) {
      consider(this.hansBody.position.x, this.hansBody.position.z, 0, `${STR.talkToHans} [${STR.interact}]`, () => this.openHans());
    }
    if (this.emilyBody) {
      consider(this.emilyBody.position.x, this.emilyBody.position.z, 0, `${STR.talkToEmily} [${STR.interact}]`, () => this.openEmily());
    }
    if (this.timoBody && this.timoBody.visible && this.questTimo !== 2) {
      consider(this.timoBody.position.x, this.timoBody.position.z, this.timoBody.position.y, `${STR.talkToTimo} [${STR.interact}]`, () => {
        if (this.questTimo === 1) this.openTimoRuins();
        else this.npcPanel(STR.timoTitle, STR.timoCampLines);
      });
    }
    if (this.world.campBed) {
      const b = this.world.campBed;
      consider(b.x, b.z, b.y, `${STR.sleep} [${STR.interact}]`, () => {
        if (this.questTimo >= 3) this.trySleep();
        else { this.ui.toast(STR.questRedTentLocked); this.audio.sDeny(); }
      });
    }
    if (this.world.campChest) {
      const c = this.world.campChest;
      consider(c.x, c.z, c.y, `${STR.openStorage} [${STR.interact}]`, () => {
        if (this.questTimo >= 3) this.openStorage(this.campStorage);
        else { this.ui.toast(STR.questChestLocked); this.audio.sDeny(); }
      });
    }
    // EVERY fire cooks: the big camp fire pit...
    if (this.world.campFire) {
      const c = this.world.campFire;
      consider(c.x, c.z, c.y, `${STR.cookFirePrompt} [${STR.interact}]`, () => this.tryCook(this.world.campFire, true));
    }
    // ...and every campfire you light yourself
    for (const f of this.world.tempFires || []) {
      const fx = f.g.position.x, fz = f.g.position.z;
      consider(fx, fz, f.g.position.y, `${STR.cookFirePrompt} [${STR.interact}]`, () =>
        this.tryCook({ x: fx, z: fz, y: f.g.position.y, temp: f }, true));
    }
    // the camp cool box: one cold bottle a day, same deal as the bar fridge
    if (this.world.coolBox) {
      const c = this.world.coolBox;
      consider(c.x, c.z, c.y, `${STR.coolboxPrompt} [${STR.interact}]`, () => {
        if (this.campWineDay === this.dayNum) { this.ui.toast(STR.fridgeEmpty); this.audio.sDeny(); return; }
        if (!p.inv.add("wine", 1)) return this.ui.toast(STR.inventoryFull);
        this.campWineDay = this.dayNum;
        this.audio.sChest();
        this.ui.toast(STR.fridgeWine);
        this.ui.renderHotbar(p.inv);
      });
    }
    // ---- the mountain ----
    if (this.world.silverBar && !this.world.silverBar.taken) {
      const b = this.world.silverBar;
      consider(b.x, b.z, b.y, `${STR.stealBar} [${STR.interact}]`, () => {
        if (!p.inv.add("silver_bar", 1)) return this.ui.toast(STR.inventoryFull);
        b.taken = true;
        b.mesh.visible = false;
        // the whole den knows the INSTANT the silver leaves the statue
        for (const cw of this.wolves) if (cw.caveWolf) { cw.caveAggroed = true; cw.state = "chase"; }
        this.audio.play("howl", { vol: 0.9 });
        this.ui.shake(1.2);
        this.ui.toast(STR.barStolen);
        this.ui.renderHotbar(p.inv);
      });
    }
    if (this.jabbBody) {
      consider(this.jabbBody.position.x, this.jabbBody.position.z, this.jabbBody.position.y + 1,
        `${STR.talkToJabb} [${STR.interact}]`, () => this.openJabb());
    }
    if (this.world.jabbChest) {
      const c = this.world.jabbChest;
      consider(c.x, c.z, c.y + 0.5, `${STR.openStorage} [${STR.interact}]`, () => {
        if (this.jabbDone) this.openStorage(this.jabbStorage, STR.jabbChestTitle);
        else { this.ui.toast(STR.jabbChestLocked); this.audio.sDeny(); }
      });
    }
    if (this.world.anvil) {
      const av = this.world.anvil;
      consider(av.x, av.z, av.y + 0.5, `${STR.useAnvil} [${STR.interact}]`, () => this.openSmithing());
    }
    if (this.world.jabbDoor) {
      const d = this.world.jabbDoor;
      consider(d.x, d.z, d.y, `${d.open ? STR.closeDoor : STR.openDoor} [${STR.interact}]`, () => this.toggleDoor(d));
    }
    if (this.world.jabbStove) {
      const s2 = this.world.jabbStove;
      consider(s2.x, s2.z, s2.y + 0.5, `${STR.cookPrompt} [${STR.interact}]`, () => this.tryCook(this.world.jabbStove, false));
    }
    // Jabb's spare hammer — daily, like the knives
    if (this.world.hammerSpot && this.world.hammerMesh && this.world.hammerMesh.visible) {
      const h = this.world.hammerSpot;
      consider(h.x, h.z, h.y, `${STR.pickUp} ${STR.items.hammer.name} [${STR.interact}]`, () => {
        if (!p.inv.add("hammer", 1)) return this.ui.toast(STR.inventoryFull);
        this.world.hammerMesh.visible = false;
        this.audio.sPickup();
        this.ui.renderHotbar(p.inv);
      });
    }
    // the daily knives (lighthouse floor + container floor)
    for (const k of this.world.knifeSpots || []) {
      if (!k.mesh.visible) continue;
      consider(k.x, k.z, k.y, `${STR.pickUp} ${STR.items.knife.name} [${STR.interact}]`, () => {
        if (!p.inv.add("knife", 1)) return this.ui.toast(STR.inventoryFull);
        k.mesh.visible = false;
        this.audio.sPickup();
        this.ui.renderHotbar(p.inv);
      });
    }
    // ---- the old ruins ----
    if (this.world.ruinsChest) {
      const c = this.world.ruinsChest;
      consider(c.x, c.z, c.y, `${STR.openStorage} [${STR.interact}]`, () => this.openStorage(this.ruinsStorage));
    }
    if (this.world.altar) {
      const a = this.world.altar;
      consider(a.x, a.z, a.y, `${STR.prayPrompt} [${STR.interact}]`, () => {
        if (this.prayedDay === this.dayNum) { this.ui.toast(STR.prayedAlready); this.audio.sDeny(); return; }
        this.prayedDay = this.dayNum;
        this.player.hu = 100;
        this.ui.toast(STR.prayed);
        this.audio.sPickup();
      });
    }
    if (this.world.barTable && !this.barTinderTaken) {
      const t = this.world.barTable;
      consider(t.x, t.z, t.y, `${STR.barTinder} [${STR.interact}]`, () => {
        if (!p.inv.add("tinderbox", 1)) return this.ui.toast(STR.inventoryFull);
        this.barTinderTaken = true;
        if (this.world.barTinderMesh) this.world.barTinderMesh.visible = false;
        this.audio.sPickup();
        this.ui.renderHotbar(p.inv);
      });
    }
    // the sea container keeps a spare tinderbox on the floor (daily)
    if (this.world.containerTinder && !this.containerTinderTaken) {
      const t = this.world.containerTinder;
      consider(t.x, t.z, t.y, `${STR.barTinder} [${STR.interact}]`, () => {
        if (!p.inv.add("tinderbox", 1)) return this.ui.toast(STR.inventoryFull);
        this.containerTinderTaken = true;
        if (this.world.containerTinderMesh) this.world.containerTinderMesh.visible = false;
        this.audio.sPickup();
        this.ui.renderHotbar(p.inv);
      });
    }
    if (this.world.fridge) {
      const f = this.world.fridge;
      consider(f.x, f.z, f.y, `${STR.fridgePrompt} [${STR.interact}]`, () => {
        if (this.wineDay === this.dayNum) { this.ui.toast(STR.fridgeEmpty); this.audio.sDeny(); return; }
        if (!p.inv.add("wine", 1)) return this.ui.toast(STR.inventoryFull);
        this.wineDay = this.dayNum;
        this.audio.sChest();
        this.ui.toast(STR.fridgeWine);
        this.ui.renderHotbar(p.inv);
      });
    }
    if (this.world.beacon && !this.world.beacon.lit && p.pos.y > CFG.lighthouse.top - 1) {
      const b = this.world.beacon;
      consider(b.x, b.z, b.y, `${STR.lightBeacon} [${STR.interact}]`, () => {
        if (!p.inv.has("tinderbox")) { this.ui.toast(STR.beaconNeedsTinder); this.audio.sDeny(); return; }
        b.lit = true;
        this.world.beaconLight.intensity = 46;
        for (const m of this.world.beaconLampMeshes || []) {
          m.material = m.material.clone();
          m.material.emissive.setHex(0xffc060);
          m.material.emissiveIntensity = 2.2;
        }
        this.audio.sCook();
        this.ui.toast(STR.beaconLit);
      });
    }
    // the nest: take an egg, or return the one you carry
    if (this.world.nest) {
      const N = this.world.nest;
      if (this.carriedEgg) {
        consider(N.x, N.z, 0, `${STR.eggReturn} [${STR.interact}]`, () => this.returnEggToNest());
      } else if (this.world.nestEggs.some((m) => m.visible) && !this.droppedEgg) {
        consider(N.x, N.z, 0, `${STR.eggTake} [${STR.interact}]`, () => this.takeNestEgg());
      }
    }
    if (this.droppedEgg && !this.carriedEgg) {
      const e = this.droppedEgg;
      consider(e.x, e.z, 0, `${STR.eggPickBack} [${STR.interact}]`, () => {
        this.scene.remove(e.mesh);
        this.droppedEgg = null;
        this.carriedEgg = true;
      });
    }
    if (this.deathBag) {
      const b = this.deathBag;
      consider(b.x, b.z, b.y, `${STR.deathBagPrompt} [${STR.interact}]`, () => {
        for (const s of b.slots) if (s) p.inv.add(s.id, s.count);
        this.scene.remove(b.mesh);
        this.deathBag = null;
        this.audio.sPickup();
        this.ui.toast(STR.deathBagRecovered);
        this.ui.renderHotbar(p.inv);
      });
    }
    if (this.world.chairs && !this.sitting) {
      const c = this.world.chairs.sit;
      consider(c.x, c.z, c.y, `${STR.sitDown} [${STR.interact}]`, () => {
        this.sitting = true;
        this.player.vel.set(0, 0, 0);
        this.player.yaw = this.world.chairs.sit.yaw;
      });
    }
    // update 28: the cliff's upper edge — downhill needs no anchors, if you
    // are willing to pay the toll. The warning IS the prompt; F is consent.
    if (!this.sliding) {
      const M = CFG.mountain;
      const dcl = Math.hypot(p.pos.x - M.cx, p.pos.z - M.cz);
      if (dcl > M.cliffHi - 6 && dcl < M.cliffHi + 2 && p.pos.y > 2) {
        const sel = p.inv.selected();
        const anchorN = p.inv.slots.reduce((n, s) => n + (s && s.id === "climbing_anchor" ? s.count : 0), 0);
        const anchorsOk = sel && sel.id === "climbing_anchor" && anchorN >= CFG.climbAnchorsNeeded;
        if (!anchorsOk) {
          consider(p.pos.x, p.pos.z, p.pos.y, `${STR.slideDown} [${STR.interact}]`, () => {
            this.sliding = { t: 0 };
          });
        }
      }
    }
    // the needle on Bill's table — a fresh one every dawn
    if (this.world.needleSpot && this.world.needleMesh && this.world.needleMesh.visible) {
      const n = this.world.needleSpot;
      consider(n.x, n.z, n.y, `${STR.pickUp} ${STR.items.needle.name} [${STR.interact}]`, () => {
        if (!p.inv.add("needle", 1)) return this.ui.toast(STR.inventoryFull);
        this.world.needleMesh.visible = false;
        this.audio.sPickup();
        this.ui.renderHotbar(p.inv);
      });
    }
    // update 29: everything at Dirk's farm
    this.farm.interact(consider, p);
    this.desert.interact(consider, p);   // update 36
    this.portals.interact(consider, p);  // update 37
    this.city.interact(consider, p);     // update 39
    // update 27: the canopy — climbable once the scroll has taught you
    if (this.learned.has("treeClimb") && !this.world.climbSpot && this.world.treePoints && p.pos.y < 2) {
      let bt = null, btd = 2.5;
      for (const tp of this.world.treePoints) {
        const dtp = Math.hypot(tp[0] - p.pos.x, tp[1] - p.pos.z);
        if (dtp < btd) { btd = dtp; bt = tp; }
      }
      if (bt) consider(bt[0], bt[1], p.pos.y, `${STR.climbTree} [${STR.interact}]`, () => this.climbTree(bt[0], bt[1]));
    }
    this.ui.prompt(this.cooking ? STR.cooking : best ? best.label : this.compassLine());
    // touch devices mirror the prompt as a circular ONE-word button
    // (OPEN / SLEEP / COOK / TALK...) — visible only while in reach
    this.ui.actionBtn(this.cooking || !best ? null : verbFor(best.label));
    if (input.interact) {
      input.interact = false;
      if (best && !this.cooking) best.fn();
    }
  }

  // the compass of death: while selected, the HUD whispers bearing + distance
  compassLine() {
    const sel = this.player.inv.selected();
    if (!sel || sel.id !== "death_compass" || !this.lastDeathSpot) return null;
    const dx = this.lastDeathSpot.x - this.player.pos.x;
    const dz = this.lastDeathSpot.z - this.player.pos.z;
    const dist = Math.hypot(dx, dz);
    // arrow relative to where you FACE (forward = -sin yaw, -cos yaw);
    // positive rel = clockwise on screen, matching the arrow ring below
    let rel = (this.player.yaw + Math.PI) - Math.atan2(dx, dz);
    while (rel > Math.PI) rel -= 2 * Math.PI;
    while (rel < -Math.PI) rel += 2 * Math.PI;
    const ARROWS = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"];
    const idx = ((Math.round(rel / (Math.PI / 4)) % 8) + 8) % 8;
    return `☠ ${ARROWS[idx]} ${Math.round(dist)} m`;
  }

  openChest(c) {
    c.opened = true;
    this.audio.sChest();
    // ~10% of chests hide a snake: a bite, and it keeps the chest for the day
    if (c.snake) {
      this.ui.toast(STR.snakeBite);
      this.player.damage(CFG.snakeDmg, "snake");
      this.portals.snakeBite();   // update 37: the green portal's day starts over
      return;
    }
    this.portals.chestOpened(c);   // update 37
    const gained = [];
    // update 39: the desert's chests carry Eternial coins (3-5); a fossil once in 256 chests anywhere;
    // the golden statuette once in 512 desert chests. Both are only good for selling in Eternius.
    {
      const ET = CFG.eternius, inDes = !!(c.desert || (this.world.desert && this.world.desert.inDesert(c.x, c.z)));
      if (inDes) this.city.addCoins(ET.coinsPerChest[0] + Math.floor(this.lootRng() * (ET.coinsPerChest[1] - ET.coinsPerChest[0] + 1)));
      if (this.lootRng() < ET.fossilChance) gained.push(["fossil", 1]);
      if (inDes && this.lootRng() < ET.statuetteChance) gained.push(["gold_statuette", 1]);
    }
    // the silver dagger: a genuine 1-in-128 find
    if (this.lootRng() < CFG.silverChestChance && !this.player.inv.has("silver_dagger")) {
      gained.push(["silver_dagger", 1]);
      this.ui.toast(STR.daggerFound);
    }
    // the axe: a 1-in-64 stroke of lumberjack's luck
    if (this.lootRng() < CFG.axeChestChance && !this.player.inv.has("axe")) {
      gained.push(["axe", 1]);
      this.ui.toast(STR.axeFound);
    }
    // update 27: the crossbow (1/256), arrow bundles (1/32), the pestle (1/32)
    if (this.lootRng() < CFG.crossbow.chestChance && !this.player.inv.has("crossbow")) {
      gained.push(["crossbow", 1]);
      this.ui.toast(STR.crossbowFound);
    }
    if (this.lootRng() < CFG.crossbow.arrowsChestChance) gained.push(["arrow", CFG.crossbow.arrowsPer]);
    if (this.lootRng() < CFG.pestleChestChance && !this.player.inv.has("pestle")) gained.push(["pestle", 1]);
    // learning scrolls: each exists ONCE per run — once found, never again
    for (const [sid, chance] of Object.entries(CFG.scrollChest)) {
      if (!this.scrollFound[sid] && this.lootRng() < chance) {
        this.scrollFound[sid] = true;
        gained.push([sid, 1]);
        this.ui.toast(STR.scrollFound);
      }
    }
    if (c.treasure) {
      // the bar's TREASURE chest: three rolls, no snakes, no mercy needed
      for (let i = 0; i < 3; i++) {
        const [id, , n] = pickWeighted(this.lootRng, CFG.chestLoot);
        gained.push([id, n]);
      }
    } else if (c.knife && !this.player.inv.has("knife") && this.goalState < 1) {
      gained.push(["knife", 1], ["bandage", 1]);
    } else {
      const [id, , n] = pickWeighted(this.lootRng, CFG.chestLoot);
      gained.push([id, n]);
      if (this.lootRng() < 0.35) {
        const [id2, , n2] = pickWeighted(this.lootRng, CFG.chestLoot);
        gained.push([id2, n2]);
      }
    }
    const names = [];
    for (const [id, n] of gained) {
      if (this.player.inv.add(id, n)) names.push(STR.items[id].name + (n > 1 ? ` ×${n}` : ""));
      else this.ui.toast(STR.inventoryFull);
    }
    if (names.length) this.ui.toast(`${STR.found}: ${names.join(", ")}`);
    this.ui.renderHotbar(this.player.inv);
  }

  trySleep() {
    if (!this.isNight) return this.ui.toast(STR.sleepNotNight);
    this.sleep();
  }
  async sleep() {
    this.menuOpen = true;
    await this.ui.fade(true, 900);
    // your bed is your anchor: dying returns you to where you LAST slept
    const p0 = this.player.pos;
    this.lastSleep = { x: p0.x, y: p0.y, z: p0.z };
    this.portals.slept(p0.x, p0.z);   // update 37: the blue portal counts beds
    // jump to next dawn
    const cycle = CFG.time.dayLen + CFG.time.nightLen;
    this.time = Math.ceil(this.time / cycle) * cycle;
    this.player.hp = 100; this.player.en = 100;
    for (const w of this.wolves) { w.group.visible = false; w.dead = true; w.respawnT = 1e9; }
    this.updateDayNight(0);
    await this.ui.fade(false, 900);
    this.menuOpen = false;
    this.ui.toast(STR.slept);
  }

  tryCook(src, fireOnly) {
    const cookable = (s) => {
      if (!s || !CFG.cookMap[s.id]) return false;
      if (fireOnly && !CFG.campfireCooks.includes(s.id)) return false;
      // update 29: two-ingredient cooks need the second item AND the scroll
      const ex = CFG.cookExtra && CFG.cookExtra[s.id];
      if (ex && ((ex.scroll && !this.learned.has(ex.scroll)) || (ex.needs && !this.player.inv.has(ex.needs)))) return false;
      return true;
    };
    // carrying DIFFERENT raw foods? Then YOU pick: hold the one you mean.
    // With only one kind aboard (any number of stacks) it cooks without fuss.
    const kinds = new Set();
    for (const s of this.player.inv.slots) if (cookable(s)) kinds.add(s.id);
    const sel = this.player.inv.selected();
    let raw = null;
    if (cookable(sel)) raw = sel.id;
    else if (kinds.size === 1) raw = [...kinds][0];
    else if (kinds.size > 1) {
      this.ui.toast(STR.cookChoose);
      this.audio.sDeny();
      return;
    }
    if (!raw) {
      // update 29: milk that will not set — say why
      if (this.player.inv.has("bowl_milk")) {
        if (!this.learned.has("yogurt")) { this.ui.toast(STR.yogurtUnlearned); this.audio.sDeny(); return; }
        if (!this.player.inv.has("lemon")) { this.ui.toast(STR.yogurtNeedsLemon); this.audio.sDeny(); return; }
      }
      // eggs on a campfire: explain WHY it refuses (no pan)
      if (fireOnly && this.player.inv.has("egg")) return this.ui.toast(STR.noEggOnFire);
      return this.ui.toast(fireOnly ? STR.nothingToCookFire : STR.nothingToCook);
    }
    this.cooking = { t: CFG.cookTime, raw, src };
    this.audio.sCook();
  }
  updateCooking(dt) {
    if (!this.cooking) return;
    const s = this.cooking.src || this.world.stove;
    if (Math.hypot(s.x - this.player.pos.x, s.z - this.player.pos.z) > 3.5) { this.cooking = null; return; }
    // a self-made campfire can burn out from under the pot
    if (s.temp && !this.world.tempFires.includes(s.temp)) { this.cooking = null; return; }
    this.cooking.t -= dt;
    if (this.world.stoveBurner) this.world.stoveBurner.material.emissiveIntensity = 1.5 + Math.sin(this.time * 20) * 0.5;
    if (this.cooking.t <= 0) {
      const { raw } = this.cooking;
      this.cooking = null;
      if (this.world.stoveBurner) this.world.stoveBurner.material.emissiveIntensity = 0.6;
      if (this.player.inv.removeOne(raw)) {
        const ex = CFG.cookExtra && CFG.cookExtra[raw];
        if (ex && ex.needs) this.player.inv.removeOne(ex.needs);   // update 29: the lemon goes into the milk
        const cooked = CFG.cookMap[raw];
        if (this.player.inv.add(cooked, 1)) {
          this.ui.toast(`${STR.cooked}: ${STR.items[cooked].name}`);
        } else {
          // no room in the pack — the meal lands at your feet, not in the void
          const p = this.player;
          this.spawnDrop(cooked, 1, p.pos.x, p.pos.z, this.world.groundHeight(p.pos.x, p.pos.z, 0));
          this.ui.toast(`${STR.cooked}: ${STR.items[cooked].name} — ${STR.cookedDropped}`);
        }
        this.audio.sEat();
        this.ui.renderHotbar(this.player.inv);
      }
    }
  }

  updateGoal() {
    const p = this.player;
    if (this.goalState === 0 && p.inv.has("knife")) { this.goalState = 1; this.ui.goal(STR.goalKnife); }
    else if (this.goalState === 1) {
      const [hx, hz] = CFG.world.hutPos;
      if (Math.hypot(p.pos.x - hx, p.pos.z - hz) < 9) {
        this.goalState = 2; this.ui.goal(STR.goalHut); this.ui.toast(STR.hutSafe);
      }
    }
    else if (this.goalState === 2 && this.dayNum >= 2) { this.goalState = 3; this.ui.goal(STR.goalSurvive); }
  }

  updateMusic() {
    if (!this.playing) return;
    const danger = this.creatures.some((c) => (c.type === "trex" && (c.state === "chase" || c.state === "window" || c.state === "foe"))
        || (c.type === "elisia" && c.state === "evil") || ((c.type === "remotus" || c.type === "altai") && c.state === "chase"))
      || this.wolves.some((w) => !w.dead && w.state === "chase");
    // update 38: the dark form has her own chase music
    const elisiaOut = this.creatures.some((c) => c.type === "elisia" && (c.state === "evil" || c.state === "eat") && !c.dead);
    // update 39: the city has its own music inside its walls
    const inCity = this.city && this.city.inside(this.player.pos.x, this.player.pos.z, this.player.pos.y);
    this.audio.music(elisiaOut && this.audio.buf.elisiaChase ? "elisiaChase" : danger ? "chase" : (inCity && this.audio.buf.eternius) ? "eternius" : "ambient");
  }

  spawnDrop(id, n, x, z, y, ttl = 0) {
    this.drops.push(new ItemDrop(id, n, x, z, y, this.scene, ttl));
  }

  // ---- right-click drop (update 23) ----
  // tap = shed ONE of the selected item at your feet; hold ~2s (a little bar
  // fills) = shed the WHOLE stack. Ten minutes to pick it back up.
  updateDropHold(dt, input) {
    const p = this.player;
    const holding = !!input.dropHold && !p.dead && !this.menuOpen;
    if (holding && p.inv.selected()) {
      this.dropT = (this.dropT || 0) + dt;
      this.ui.dropBar(Math.min(1, this.dropT / 2));
      if (this.dropT >= 2) {
        this.dropSelected(true);
        this.dropT = 0;
        input.dropHold = false;         // a full-stack drop ends the hold
        this.ui.dropBar(null);
      }
      return;
    }
    if (this.dropT > 0.03 && p.inv.selected()) this.dropSelected(false); // short press = one
    this.dropT = 0;
    this.ui.dropBar(null);
  }
  dropSelected(all) {
    const p = this.player;
    const sel = p.inv.selected();
    if (!sel) return;
    const n = all ? sel.count : 1;
    // land it just ahead of your feet, on whatever you stand on
    const dx = -Math.sin(p.yaw), dz = -Math.cos(p.yaw);
    const x = p.pos.x + dx * 0.9, z = p.pos.z + dz * 0.9;
    const y = this.world.groundHeight(x, z, p.pos.y);
    sel.count -= n;
    if (sel.count <= 0) p.inv.slots[p.inv.sel] = null;
    this.spawnDrop(sel.id, n, x, z, y, 600);
    this.audio.sPickup();
    this.ui.renderHotbar(p.inv);
  }

  // a discrete sound (twig crack, thrown noise) — every T-Rex in range hears it
  // update 36: a loud act (a swing, eating) the river's ear-hunters react to
  loudAct() {
    const p = this.player;
    this.lastLoud = { x: p.pos.x, z: p.pos.z, t: this.time };
  }
  emitNoise(x, z, r) {
    for (const c of this.creatures) {
      if (c.type !== "trex") continue;
      if (Math.hypot(c.pos.x - x, c.pos.z - z) < r) c.hearNoise(x, z, this);
    }
  }

  onDeath(source) {
    if (this.player.dead) return;
    this.player.dead = true;
    this.menuOpen = true;
    this.audio.music(null);
    // dying mid-escort sends Timo scrambling back to his hiding place
    if (this.questTimo === 2) {
      this.questTimo = 1;
      const rp = this.world.timoRuinsPos;
      if (this.timoBody) {
        this.timoBody.position.set(rp.x, this.world.groundHeight(rp.x, rp.z, 0), rp.z);
        this.timoBody.rotation.y = rp.yaw;
      }
      setTimeout(() => this.ui.toast(STR.timoDied), 1200);
    }
    // your belongings stay where you fell — 15 minutes to reclaim them.
    // The COMPASS OF DEATH (update 27) is the one thing death cannot take:
    // it stays with you, and from now on it points at this very spot.
    const p = this.player;
    this.lastDeathSpot = { x: p.pos.x, z: p.pos.z };
    // update 36: the water bottle never survives a death — Idris has another
    const kept = p.inv.slots.filter((s) => s && s.id !== "death_compass" && s.id !== "water_bottle").map((s) => ({ ...s }));
    for (let i = 0; i < p.inv.slots.length; i++) if (p.inv.slots[i] && p.inv.slots[i].id === "water_bottle") p.inv.slots[i] = null;
    this.desert.onPlayerDeath();
    this.portals.onDeath();   // update 37
    if (this.carriedEgg) { this.carriedEgg = false; this.returnEggToNest(true); }
    if (kept.length) {
      if (this.deathBag) this.scene.remove(this.deathBag.mesh); // old bag is lost
      const sack = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8),
        new THREE.MeshStandardMaterial({ color: 0x4e4030, roughness: 1 }));
      sack.scale.y = 0.75;
      const y = this.world.groundHeight(p.pos.x, p.pos.z, p.pos.y);
      sack.position.set(p.pos.x, y + 0.3, p.pos.z);
      this.scene.add(sack);
      this.deathBag = { slots: kept, x: p.pos.x, z: p.pos.z, y, mesh: sack, ttl: CFG.deathBagTtl };
      for (let i = 0; i < p.inv.slots.length; i++) {
        if (p.inv.slots[i] && p.inv.slots[i].id !== "death_compass") p.inv.slots[i] = null;
      }
    }
    this.ui.death(source, () => {
      const p = this.player;
      p.dead = false;
      // wake up where you last slept — the temple only before your first sleep
      if (this.lastSleep) p.pos.set(this.lastSleep.x, this.lastSleep.y, this.lastSleep.z);
      else p.pos.set(CFG.ruin.spawn[0], 0, CFG.ruin.spawn[1]);
      p.vel.set(0, 0, 0);
      p.yaw = 0;
      p.hp = CFG.player.respawn.hp; p.en = CFG.player.respawn.en; p.hu = CFG.player.respawn.hu;
      for (const c of this.creatures) {
        if (c.type === "trex") { c.state = "wander"; c.target = null; c.pos.set(c.spawn.x, 0, c.spawn.z); }
      }
      if (this.elisia) this.elisia.onPlayerDeath();   // update 35
      this.ui.renderHotbar(p.inv);
      this.resume();
    });
  }

  // item 5 of the perf pass: draw calls per frame, once a second so the
  // console stays readable. renderer.info resets every render, so these are
  // true per-frame numbers.
  // ---- adaptive quality (update 26) ----
  // Auto preset (first run only): probe upward from the default — hold each
  // preset ~3s of rendered frames; step up while 60fps sustains, settle when
  // it doesn't. Never runs once the user has chosen anything (gfx.userSet).
  // Dynamic resolution (opt-in): overload sustained 2s -> one scale step down;
  // solid headroom sustained 5s -> probe one step up; a failed probe reverts
  // and locks for 30s. Hysteresis + cooldowns keep it from oscillating.
  adaptive(now) {
    const dtMs = this._adLast ? now - this._adLast : 16.7;
    this._adLast = now;
    if (dtMs > 250) return;                    // tab was hidden — not a frame time
    // --- first-run auto preset ---
    if (!this.gfx.userSet && !this.gfx.autoDone) {
      const LADDER = ["low", "medium", "high", "ultra"];
      const A = this._auto || (this._auto = { skip: 90, n: 0, sum: 0, at: LADDER.indexOf(this.gfx.preset) });
      if (A.skip > 0) { A.skip--; return; }    // let shaders/clocks settle first
      A.n++; A.sum += dtMs;
      if (A.n >= 180) {                        // ~3s of rendered frames
        const avg = A.sum / A.n;
        const sustains = avg <= 17.5;          // holding 60fps at this preset
        if (sustains && A.at < LADDER.length - 1) {
          A.at++; A.n = 0; A.sum = 0; A.skip = 45;
          this._applyPreset(LADDER[A.at], false);   // probe one step up
        } else {
          if (!sustains && A.at > 0) A.at--;        // last step was too far
          this._applyPreset(LADDER[A.at], true);
          this.gfx.autoDone = true;
          localStorage.pdGfx = JSON.stringify(this.gfx);
          console.log(`[perf] auto preset: ${LADDER[A.at]} (avg ${avg.toFixed(1)} ms at probe)`);
        }
      }
      return;                                  // don't run dynres during probing
    }
    // --- dynamic resolution (opt-in) ---
    if (!this.gfx.dynres) return;
    const D = this._dyn || (this._dyn = { ema: 16.7, hot: 0, cool: 0, lockUntil: 0, probedAt: -1e9 });
    D.ema += (dtMs - D.ema) * 0.05;
    if (now < D.lockUntil) return;
    if (D.ema > 17.8) {
      D.cool = 0;
      if (++D.hot >= 120 && this.dynMult > 0.5) {        // overloaded ~2s
        // stepping down soon after a probe up = the probe failed: long lock
        const failedProbe = now - D.probedAt < 6000;
        this.dynMult = Math.max(0.5, this.dynMult - 0.125);
        this._gfxResize();
        D.hot = 0; D.ema = 16.7;
        D.lockUntil = now + (failedProbe ? 30000 : 2500);
      }
    } else if (D.ema < 16.9 && this.dynMult < 1) {
      D.hot = 0;
      if (++D.cool >= 300) {                             // headroom ~5s: probe up
        this.dynMult = Math.min(1, this.dynMult + 0.125);
        this._gfxResize();
        D.cool = 0; D.ema = 16.7; D.probedAt = now; D.lockUntil = now + 1000;
      }
    } else { D.hot = 0; D.cool = 0; }
  }

  perfLog(now) {
    this._plFrames = (this._plFrames || 0) + 1;
    if (!this._plAt) this._plAt = now;
    if (now - this._plAt < 1000) return;
    const inf = this.renderer.info.render;
    const cv = this.renderer.domElement;
    console.log(`[perf] ${this._plFrames} fps · ${inf.calls} draw calls/frame · ${(inf.triangles / 1000).toFixed(0)}k tris/frame · ${cv.width}×${cv.height} · msaa ${this.gfx.msaa ? "on" : "off"} · ${this.gpuName}`);
    this._plFrames = 0;
    this._plAt = now;
  }

  // rendering only — never touches simulation state. Anything fully swallowed
  // by the fog wall stops being drawn. Creature/NPC culling flips the INNER
  // meshes, one level below the group.visible toggles the simulation owns,
  // so the two can never fight.
  cullView() {
    const fogMax = (this.scene.fog ? this.scene.fog.far : this.camera.far) + 12;
    // by day the far plane rides the fog wall: every fragment past it is exact
    // fog color (verified 0/518400 pixel diff), so clipping there is free money.
    // At night the additive fireflies leave a 1-LSB trace through the fog, so
    // the plane goes back out to 400 the moment they can fade in (k >= 0.04).
    if (this.scene.fog) {
      const farT = (this.world.nightK || 0) < 0.04 ? this.scene.fog.far + 30 : 400;
      if (this.camera.far !== farT) {
        this.camera.far = farT;
        this.camera.updateProjectionMatrix();
      }
    }
    this.world.cullFog(this.camera.position, fogMax);
    const cullSq = fogMax * fogMax;
    const px = this.camera.position.x, pz = this.camera.position.z;
    const cullEnt = (body) => {
      if (!body) return;
      const dx = px - body.position.x, dz = pz - body.position.z;
      const show = dx * dx + dz * dz < cullSq;
      const ud = body.userData;
      if (ud.fogShow === show) return;
      ud.fogShow = show;
      if (!ud.fogMeshes) {
        ud.fogMeshes = [];
        body.traverse((o) => { if (o.isMesh || o.isSkinnedMesh) ud.fogMeshes.push(o); });
      }
      for (const m of ud.fogMeshes) m.visible = show;
    };
    for (const c of this.creatures) cullEnt(c.group);
    for (const w of this.wolves) cullEnt(w.group);
    cullEnt(this.hansBody); cullEnt(this.emilyBody); cullEnt(this.timoBody);
    cullEnt(this.jabbBody); cullEnt(this.billBody);
    this.farm.cull(cullEnt);
  }

  render(now) {
    const rdt = Math.min(0.05, (now - (this._lastRender || now)) / 1000);
    this._lastRender = now;
    this.cullView();
    this.world.flicker(now / 1000, rdt);
    // HUD minimap + compass (throttled — the world doesn't redraw that fast)
    if (this.map && now - (this._miniAt || 0) > 120) {
      this._miniAt = now;
      if (this.miniCanvas) this.map.drawMini(this.miniCanvas);
      if (this.compassEl) this.compassEl.style.transform = `rotate(${this.player.yaw}rad)`;
    }
    // visual-only camera shake (never in the simulation)
    if (this.ui.shakeV > 0.01) {
      const s = this.ui.shakeV * 0.045;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      this.ui.shakeV *= 0.88;
    }
    this.renderer.render(this.scene, this.camera);
    void now;
  }
}

window.__boot = "module-ran";
const game = new Game();
window.pd = game;   // update 29: a handle for scripted verification (harmless in play)
window.__game = game;
window.__boot = "game-created";
game.load().then(() => {
  window.__boot = "assets-loaded";
  game.ui.closeScreen();
  game.start();
  window.__boot = "started";
}).catch((e) => {
  window.__boot = "boot-error: " + (e.stack || e.message || e);
});
