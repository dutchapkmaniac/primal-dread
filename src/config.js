// Every balance number lives here as data (tuned one change at a time).
// Lighting/fog colors are derived from the approved STYLE FORMULA:
// desaturated mossy greens, cold grey stone, weak overcast light,
// near-black moonless night, faded safety-orange accents.
// bumped every update so returning players never load stale cached assets
export const ASSET_V = "?v=45";

const DEG = Math.PI / 180;   // update 30: model yaws are written in degrees

export const CFG = {
  seed: 20260714,

  world: {
    boundaryR: 402,          // the old circle — still the frame the rings hang on
    square: 1008,
    extraApples: 20,           // update 39: twenty more apple trees, in the emptiest forest left            // update 38: +10% — ring9 grows the frontier (916 before)
    oldBoundaryR: 150,       // the original map stays untouched inside this
    fieldR: 52,              // open field radius around the ruin
    hutPos: [-22, -128],     // tree hut, off-axis — you have to find it
    // winding forest path: ruin door -> bends -> hut clearing
    pathPoints: [
      [0, -9], [7, -26], [-8, -44], [14, -64], [2, -84],
      [-14, -98], [-26, -112], [-22, -122],
    ],
    pathWidth: 4.6,
    treeCount: 850,
    treeSpacing: 2.6,
    treeMinR: 56, treeMaxR: 146,
    pathClearance: 5,        // no trees this close to the path line
    grassCount: 4200,
    twigCount: 90,
    appleTrees: [[-13, -40], [9, -70], [-30, -104]],
    applesPerTree: 3,
    // 10 chests scattered across the WHOLE map: one on the path, one on the
    // temple's first floor, one behind the hut, the rest deep in the forest.
    // [x, z, guaranteedKnife, y]
    chests: [
      [7, -28, true, 0],        // where the path enters the forest
      [5, -5, false, 3.7],      // temple, first floor
      [-26, -139, false, 0],    // behind the hut
      [95, 62, false, 0], [-92, 78, false, 0], [58, -102, false, 0],
      [-108, -52, false, 0], [118, -18, false, 0], [-58, 34, false, 0],
      [30, 120, false, 0],
    ],
  },
  snakeChance: 0.1,            // a chest may hide a snake: ~10% hp bite
  snakeDmg: 10,

  // ---- the new area (everything beyond the old 150m boundary) ----
  newArea: {
    treeMinR: 153, treeMaxR: 250, treeCount: 780, grassCount: 2600, twigCount: 60,
    // 15 new chests scattered through the expansion [x, z]
    chests: [
      [175, -60], [238, 8], [-190, 90], [-160, -140], [60, 210],
      [-80, 195], [200, -130], [-230, -40], [120, 190], [-120, -190],
      [246, 112], [-210, 130], [30, -230], [160, -190], [-40, 235],
    ],
  },
  // ---- the deep-jungle ring (update 8): +25% map, denser and darker ----
  ring2: {
    treeMinR: 252, treeMaxR: 316, treeCount: 520, grassCount: 1300, twigCount: 40,
    chests: [[280, 30], [-270, -80], [90, 275], [-150, 250], [240, -180], [-290, 60]],
  },
  // a rusted sea container, very deep in the jungle — a safe room with a door
  container: { x: -218, z: 205, yaw: 0.55, w: 6.2, d: 2.55, h: 2.6 },

  // ---- update 10: the frontier ring — pure wild forest for future content ----
  ring3: {
    treeMinR: 318, treeMaxR: 396, treeCount: 640, grassCount: 1500, twigCount: 40,
  },
  // ---- update 23: the expansion band — the square grew 10%, forest follows
  // (the mountain corner grows MOUNTAIN instead, by its own radial profile)
  ring4: {
    treeMinR: 396, treeMaxR: 436, treeCount: 300, grassCount: 600,
  },
  // ---- update 27: +20% more — same recipe, one ring further out ----
  ring5: {
    // update 28: a tenth more wood out here, and fewer grass tufts — the
    // frontier floor reads brown (forest-floor patches), not lawn
    treeMinR: 436, treeMaxR: 524, treeCount: 682, grassCount: 700,
  },
  // ---- update 29: the third expansion band — ring5's density, one ring further out ----
  ring6: {
    treeMinR: 524, treeMaxR: 630, treeCount: 990, grassCount: 1000,
  },
  // ---- update 36: the fourth expansion band — one ring further out again ----
  ring7: {
    treeMinR: 630, treeMaxR: 757, treeCount: 1200, grassCount: 1000,
  },
  // ---- update 37: the fifth expansion band — 30 apple trees and 40 chests are
  // scattered over it at build time (seeded), clear of every landmark ----
  ring8: {
    treeMinR: 757, treeMaxR: 910, treeCount: 1500, grassCount: 1100,
    chestCount: 40, appleCount: 30,
  },
  // ---- update 38: the sixth expansion band (+10%) — forest only ----
  ring9: {
    treeMinR: 910, treeMaxR: 1002, treeCount: 1100, grassCount: 800,
  },
  // 15 extra treasure chests scattered across the WHOLE map [x, z]
  extraChests: [
    [350, 40], [-340, 120], [180, -320], [-260, -270], [60, 370],
    [-370, -60], [300, 210], [-150, 350], [250, -250], [-330, 240],
    [130, 320], [370, -120], [-80, -360], [-300, -180], [40, -150],
    // update 33: 20 more, spread over the expansion forest (beyond the original
    // 150 m map, out to the square's edge), clear of every landmark and of each
    // other. Picked once at random and fixed, like every chest above.
    [601, 54], [-34, -264], [256, -328], [433, 113], [338, -59],
    [291, -82], [-73, -331], [491, 46], [-378, 190], [73, 347],
    [256, 538], [423, 345], [-402, 483], [48, 190], [194, 463],
    [497, 197], [-330, -29], [123, 265], [424, 220], [-214, 466],
  ],
  // 15 hidden apple trees far from the beaten paths — one near the camp
  appleTrees2: [
    [-262, 30], [80, 120], [-140, 60], [200, -60], [-60, 180],
    [160, 240], [-220, -120], [290, 90], [-310, -30], [110, -240],
    [-180, 290], [340, -40], [-40, 330], [240, 300], [-350, 160],
    // update 33: 20 more, same rule as the chests above — expansion forest only
    [-612, -140], [8, -524], [-70, -378], [-283, 78], [22, 303],
    [-5, 323], [-106, 523], [-26, 231], [424, -62], [-167, -52],
    [334, -141], [119, 377], [-349, -94], [-139, 375], [-189, 63],
    [243, -67], [546, -9], [-38, -512], [226, -103], [-615, -78],
  ],

  // ---- update 9: the camping (west) and the ruined village (north-east) ----
  camp: {
    x: -252, z: 12, r: 11.5,        // fence ring radius
    gateA: 1.35, gateHalf: 0.3,     // gate arc faces the forest (east side)
    tentDist: 6.6,
    tents: [                        // red sleeps (after the rescue), rest decor
      { a: 3.55, color: 0xd8503a, id: "red" },
      { a: 4.75, color: 0xe0c052, id: "yellow" },
      { a: 2.35, color: 0x4a78c8, id: "blue" },
    ],
  },
  ruins: {
    x: 212, z: -182,
    patrolR: 33,                    // the spinosaurus circles the village here
  },
  spino: {
    height: 6.2, speed: 2.8, chaseSpeed: 10.5,  // 25% faster than a T-Rex
    investigateSpeed: 4.6, investigateTime: 3.5,
    sightR: 26, noiseMult: 2,       // spots you TWICE as easily
    twigNoiseR: 80,
    loseDist: 46, loseTime: 5,
    biteRange: 3.6, biteDmg: 45, biteCd: 1.6,   // damage equal to a T-Rex
    stepInterval: 0.8, roarCd: 7,
    babyScreamR: 6,                 // closer than this, the hatchlings shriek
  },
  spinobaby: { height: 1.15, speed: 0.8, hp: Infinity },
  wine: { hp: 20, hu: 20, drunkTime: 60, speedMult: 0.75, drainMult: 2 },
  escortSightMult: 1.5,             // walking with Timo, hunters notice you easier

  // the lake, doubled and organically shaped: a main body with two lobes.
  // You can wade in 2-3 steps (2.4m) — deeper water turns you back.
  lake: {
    x: 195, z: 42, r: 42, wade: 2.4,
    lobes: [{ x: 232, z: 68, r: 30 }, { x: 185, z: 95, r: 26 }],
    beach: 5,
  },
  croc: {
    count: 1, height: 0.72, speed: 1.4, chaseSpeed: 4.4, hp: 150, dmg: 20,
    atkRange: 1.8, atkCd: 1.4, aggroR: 18, retreatAfter: 45, giveUpDist: 52,
    // silent ambush rules: stepping into the water rolls a 20% strike;
    // wading past 30 seconds makes it certain. No timers, no warnings.
    entryChance: 0.2, guaranteedAfter: 30, nearShore: 14,
    // blows to the kill: fists 10, knife 5, machete 3 — a thrown spear 3
    hitDmg: { fists: 15, knife: 30, silver_dagger: 30, trex_dagger: 40, imp_dagger: 40, machete: 50, axe: 50, spear: 50, arrow: 30, silver_arrow: 38 },
    drops: [["croc_skin", 1], ["raw_fish", 2]],
  },
  lighthouse: { x: 143, z: 78, r: 4.3, top: 26, revs: 6, doorYaw: Math.PI },
  torch: { intensity: 10, dist: 17 },
  coffee: { regenTime: 3 },   // Bill's free daily coffee: energy to 100%
  nest: { x: 170, z: 165, r: 5, eggRespawn: 600 }, // a stolen egg regrows in 10 min
  mother: {
    height: 17.5, speed: 3.4, chaseSpeed: 9.5, sightR: 7.5,
    smellRepath: 4,            // she re-scents your position this often (s)
    biteRange: 7.5, biteDmg: 999, biteCd: 2,
    // open-field rule: if NEITHER of you is near cover, she sees you — period.
    fieldSightR: 95,           // …as long as you are in the same field (m)
    coverR: 6.5,               // a tree/boulder this close counts as cover
    grabTime: 1.7,             // the mouth-grab kill animation length (s)
  },
  fishing: { min: 4, max: 9 },       // seconds per catch
  tempFire: { ttl: 60, light: 11, dist: 9 },
  deathBagTtl: 900,                  // 15 minutes to recover your items
  branchChance: 0.65,                // knife vs tree

  // three-floor roman ruin at the origin (north = -Z, door faces north)
  ruin: {
    halfX: 12, halfZ: 7,
    floor2: 3.7, floor3: 7.4,
    wallT: 0.35,
    atrium: { x0: -3, x1: 3, z0: -2.5, z1: 2.5 },   // open light-well in floor-2 plate
    // safe alcove (sleeping bag + campfire); the WHOLE ground floor is safe now
    alcove: { x0: 6.2, x1: 11.65, z0: 2.2, z1: 6.65 },
    sleepBag: [9.6, 5.4],
    campfire: [7.6, 3.4],
    spawn: [8.6, 4.6],
    storageChest: [10.8, 3.0],       // personal storage, by the sleeping bag
    craftTable: [1.5, -5.3],         // floor 2 — dangerously near the holes
  },

  storageSlots: 24,
  // crafting recipes. `scroll` = the skill that must be LEARNED first (u27);
  // `count` = how many the craft yields (default 1)
  recipes: [
    { id: "fishing_rod", cost: { branch: 2, rope: 1 }, needs: "knife" },
    { id: "fur_cloak", cost: { wolf_fur: 4 } },
    { id: "spear", cost: { knife: 1, branch: 2, rope: 1 }, scroll: "spear" },
    { id: "thread", cost: { rope: 1 } },
    { id: "wolf_bag", cost: { thread: 1, wolf_fur: 3 }, needs: "needle" },
    { id: "arrow", count: 10, cost: { knife: 2, branch: 2, feather: 3 }, scroll: "arrows" },
    { id: "silver_arrow", count: 10, cost: { silver_dust: 1, knife: 2, branch: 2, feather: 3 }, scroll: "silver_arrows" },
    { id: "bowl", cost: { branch: 2 }, needs: "knife" },   // update 29: two branches whittled into a bowl (the knife stays)
    { id: "trex_dagger", cost: { trex_tooth: 1, branch: 1 } },   // update 38: a tooth lashed to a branch
    { id: "imp_dagger", cost: { imp_tooth: 1, branch: 1 } },
  ],
  needleBreakChance: 0.2,       // sewing gambles the needle — 20% it snaps
  wolfBagStackMax: 20,          // wearing the bag doubles every inventory slot
  storageStackMax: 100,         // storage chests hold DEEP stacks

  // ---- update 11: the T-Rex hunt ----
  // The spear is the ONLY thing that wounds a T-Rex. Thrown, not swung.
  spear: {
    throwSpeed: 28, gravity: 9, cooldown: 0.7,   // a flatter arc than a stone — it's MADE to fly
    dmg: 120, headMult: 3, headR: 1.15,   // a skull hit does TRIPLE damage
    bleedDps: 4, bleedTime: 20,           // a stuck spear keeps cutting
    recoverChance: 0.5,                   // spears pulled whole from the carcass
  },
  trexHunt: {
    hp: 800,                              // ~7 body hits, or 3 clean skull throws
    enrageFrac: 0.3, enrageSpeedMult: 1.25,
    respawn: 180,                         // update 38: a slain hunter is back 3 REAL minutes later
    drops: [],                            // update 38: Elisia eats what she kills — only a tooth may be left...
    toothChance: 0.1,                     // ...one time in ten
  },
  silverChestChance: 1 / 128,        // the silver dagger — werewolf slayer
  axeChestChance: 1 / 64,            // the axe — lumberjack's luck

  // ---- update 27: the crossbow, scrolls and the canopy ----
  crossbow: {
    chestChance: 1 / 256,            // the weapon itself — a real find
    arrowsChestChance: 1 / 32, arrowsPer: 10,
    mag: 100,                        // arrows stored INSIDE the crossbow
    dmg: 30, silverMult: 1.25,       // silver bolts bite 25% harder
    speed: 34, gravity: 6, cooldown: 0.9,
    loseChance: 0.1,                 // a landed arrow is lost 1 time in 10
  },
  featherChance: 0.25,               // chickens: feather ALONGSIDE the normal drop
  pestleChestChance: 1 / 32,
  // learning scrolls: each exists ONCE per run — found, used, gone, learned
  scrollChest: {
    scroll_spear: 1 / 64, scroll_pestle: 1 / 64,
    scroll_arrows: 1 / 128, scroll_climb: 1 / 128,
  },
  scrollSilverWolfChance: 1 / 128,   // the silver-arrows scroll: werewolf drop
  // the canopy: climbable with the scroll + two anchors
  treeClimb: {
    topY: 7.5, itemChance: 0.2, fallDmg: 20, wolfGiveup: 10,
    // the user's drop table — weights are exact 128ths (they sum to 128)
    loot: [
      ["apple", 8, 3], ["branch", 8, 6], ["axe", 8, 1], ["wine", 8, 1],
      ["energy_drink", 8, 2], ["super_energy_drink", 8, 1], ["chocolate", 8, 1],
      ["feather", 8, 6], ["tinderbox", 8, 1], ["egg", 8, 1], ["arrow", 8, 4],
      ["torch", 8, 1], ["knife", 8, 1], ["bandage", 8, 3], ["hammer", 8, 1],
      ["silver_dust", 2, 3], ["machete", 2, 1], ["silver_arrow", 2, 4],
      ["silver_dagger", 1, 1], ["death_compass", 1, 1],
    ],
  },

  bill: { height: 1.75, sitForward: 0.17 }, // sit offset keeps him OFF the backrest
  eggTrade: { eggs: 10, gives: "bandage" },
  billChestEggs: 3,                  // T-Rex eggs given to Bill unlock his chest
  hutStorageSlots: 24,

  losHideTime: 1.2,                  // hidden this long behind cover -> T-Rex loses you
  boulderCount: 22,

  time: {
    dayLen: 480, nightLen: 240,   // doubled — real time to explore, real nights to survive
    duskFrac: 0.08, dawnFrac: 0.08,
    winDay: 3,
  },

  player: {
    height: 1.65, radius: 0.35,
    walk: 4.0, sprint: 7.0, sneak: 2.0,
    accel: 30, airControl: 0.35,
    jumpVel: 4.6, gravity: 12.5,
    noiseR: { sneak: 7, walk: 14, sprint: 40 },   // running is LOUD now
    hp: 100, en: 100, hu: 100,
    hungerDrain: 100 / 480,
    hungerRunMult: 1.6,       // running makes you hungry faster
    starveHpDrain: 1.0,
    hungerWarn: 25,
    sprintDrain: 8.5, jumpCost: 5, sprintMin: 5,
    regenIdle: 5, regenMove: 3, regenSneak: 2,
    respawn: { hp: 100, en: 100, hu: 50 },
    fists: { dmg: 15, range: 1.9, arcCos: 0.45, cooldown: 0.6 },
    knife: { dmg: 25, range: 2.3, arcCos: 0.45, cooldown: 0.5 },
    silver_dagger: { dmg: 30, range: 2.2, arcCos: 0.45, cooldown: 0.45 },
    trex_dagger:   { dmg: 35, range: 2.3, arcCos: 0.45, cooldown: 0.45 },   // update 35: Elisia's gift — a blade ground from a T-Rex tooth
    et_dagger:     { dmg: 45, range: 2.3, arcCos: 0.45, cooldown: 0.45 },   // update 39: the Eternial blades — gold and green stone, sharper than iron and silver
    et_sword:      { dmg: 65, range: 2.6, arcCos: 0.40, cooldown: 0.6 },
    imp_dagger:    { dmg: 35, range: 2.3, arcCos: 0.45, cooldown: 0.45 },   // update 38: the same blade from an Imperator tooth (double on Elisia)
    machete: { dmg: 40, range: 2.5, arcCos: 0.45, cooldown: 0.55 },
    axe: { dmg: 50, range: 2.9, arcCos: 0.36, cooldown: 0.6 }, // double the knife, longer AND wider swing
    interactR: 2.6,
    stackMax: 10, slots: 8,
  },

  food: {
    apple:         { hu: 10, special: "appleEnergy" },
    cooked_pork:   { hu: 10 },
    cooked_chicken:{ hu: 10 },
    cooked_eggs:   { hu: 10, en: 5 },
    cooked_wolf:   { hu: 25 },   // update 27: the hunter's reward, buffed
    cooked_fish:   { hu: 10 },
    cooked_trex:   { hu: 25, en: 10 },   // meat of the king — the biggest meal there is
    cooked_goat:   { hu: 20 },           // mountain fare — twice the meal of common meat
    chocolate:     { hu: 15 },           // a survivor's sweet ration (update 27)
    // update 29: Dirk's farm
    cooked_beef:   { hu: 20 },           // update 30: cooked from raw_beef at a furnace or campfire
    blueberries:   { hu: 5 },            // a snack on their own — five of them crown a bowl of yogurt
    bowl_yogurt_blueberries: { hu: 20, hp: 20, special: "appleEnergy", returns: "bowl" }, // the bowl comes back
  },
  bandageHeal: 10,
  energyDrink: 20,        // rare enough to earn a real jolt
  superEnergyDrink: 40,   // the blue can — rarer, twice the kick
  axeBranches: 3,         // an axe strips three branches where a knife takes one
  cookTime: 2.5,
  cookMap: { raw_pork: "cooked_pork", raw_chicken: "cooked_chicken", egg: "cooked_eggs", raw_wolf: "cooked_wolf", raw_fish: "cooked_fish", raw_trex: "cooked_trex", raw_goat: "cooked_goat",
    bowl_milk: "bowl_yogurt",            // update 29: milk sets into yogurt (needs a lemon + the scroll, see cookExtra)
    raw_beef: "cooked_beef" },           // update 30: a cow's meat comes raw
  // the campfire has no pan — meat only, no eggs
  cookedMeat: ["cooked_pork", "cooked_chicken", "cooked_wolf", "cooked_fish", "cooked_trex", "cooked_goat", "cooked_beef"],   // update 36: what an altai steals
  campfireCooks: ["raw_pork", "raw_chicken", "raw_wolf", "raw_fish", "raw_trex", "raw_goat", "bowl_milk", "raw_beef"],
  // update 29: two-ingredient cooks — the raw item plus a SECOND item from the
  // pack, and only once the matching scroll has been studied
  cookExtra: { bowl_milk: { needs: "lemon", scroll: "yogurt" } },

  chestLoot: [
    ["bandage", 22, 1], ["energy_drink", 19, 1], ["apple", 13, 1],
    ["egg", 9, 1], ["cooked_pork", 7, 1], ["raw_pork", 6, 1],
    ["knife", 7, 1], ["wolf_fur", 4, 1],
    ["rope", 9, 1], ["tinderbox", 7, 1], ["branch", 6, 2], ["torch", 6, 1],
    ["super_energy_drink", 4, 1], ["needle", 5, 1], ["climbing_anchor", 4, 1],
    ["hammer", 3, 1], ["chocolate", 9, 1],
  ],
  // Jabb's anvil: metal work only — the smithy makes what the forest can't
  anvilRecipes: [
    { id: "climbing_anchor", cost: { broken_hook: 1 }, needs: "hammer" },
    { id: "climbing_anchor", cost: { knife: 1, rope: 1 } },
  ],

  trex: {
    count: 3, height: 5.4, speed: 2.6, chaseSpeed: 8.4, investigateSpeed: 4.2,
    sightR: 13,               // sees you this close regardless of stance
    twigNoiseR: 55,           // hears a twig crack from this far
    investigateTime: 3.5,     // sniffing around the noise spot
    loseDist: 30, loseTime: 4,
    biteRange: 3.2, biteDmg: 45, biteCd: 1.6,
    windowReach: 3.5, windowDmg: 35, windowCd: 2.2, windowTrigger: 9,
    windowStandoff: 4.0,      // stands off the wall, pushes its NECK through
    neckReachY: 6.4,          // its head reaches holes up to floor two
    elevatedGiveUp: 7,        // paces this long under an unreachable player
    stepInterval: 0.85,
    roarCd: 6,
    // hunters prowl the WHOLE map now — one can find you anywhere
    spawns: [[24, 18], [-28, -6], [2, -70], [150, -40], [-150, -150], [70, 195], [-210, 90]],
    wanderR: [14, 380],
    // update 28: the FRONTIER hunters — three more that live on the expanded
    // outer ring and pick their wander targets along it (never the mountain);
    // update 29 moved them out to the ring6 band
    // update 36: the band moved out with the map; the south-west corner is desert now and a T-Rex never enters it
    outerSpawns: [[935, 79], [-79, -935], [924, -924]],   // update 38: out with the map again
    outerBand: [869, 990],
    // update 38: ten more hunters, born and wandering OUTSIDE the old circle (r > boundaryR)
    // so the middle of the map is no busier than before; 20 T-Rexes in all
    extraCount: 20, extraMinR: 440,          // update 39: twenty outside the circle — thirty in all
    imperatorCount: 2,                       // update 39: two of the thirty, random among all
    roarRate: 1,
  },
  // ---- update 38: TYRANNOSAURUS IMPERATOR — one of the twenty hunters, chosen at random.
  // A T-Rex in every rule (type "trex", creature.imperator = true) with these differences:
  imperator: {
    biteDmgMult: 1.2,      // 20% more damage
    sizeMult: 1.1,         // 10% larger
    noiseMult: 1.25,       // hears you a little easier (the Spinosaurus is 2.0)
    twigNoiseR: 62, sightR: 15,
    roarRate: 0.8,         // a deeper roar
    toothChance: 0.2,      // one in five leaves an Imperator tooth
  },
  // update 35: Elisia — the angel of the forest. Once per full day, while you walk the
  // forest, she is put down 40-70 m away out of your sight. Within 18 m (line of sight)
  // she sees you: 50/50 she kisses you (every bar to 100%, a T-Rex dagger and holy water)
  // and rises away, or the mist turns grey and she becomes her 9-ft dark form.
  elisia: {
    height: 2.13, evilHeight: 2.74,
    speed: 1.6,            // the good form walking to you
    chaseSpeed: 5.4,       // the dark form
    hp: 600,
    seeR: 18,              // she sees you inside this, any side, with line of sight
    mistR: 90,             // update 37: doubled — the mist starts faint twice as far out and thickens toward her
    firstSpot: [-12, 275], // update 37: the first spawn of every new game (the user's X, south of the temple)
    laughEvery: [8, 20],   // update 37: seconds between her laughs while you stand in the mist
    claw: { range: 3.0, dmg: 20, cd: 1.5 },
    fire: { dmg: 25, speed: 14, cd: 3.0, minR: 6, maxR: 40, gravity: 2.0, r: 0.35 },
    daggerDmg: 50,         // a T-Rex dagger hit on her (against anything else the dagger does player.trex_dagger.dmg)
    daggerDmgImp: 100,     // update 38: the Imperator dagger hits her twice as hard
    mistFadeOut: 10,       // update 38: seconds for her mist to fade once she is gone
    // update 38: the fight is a matter of luck, decided when a hunter closes in. She wins one
    // T-Rex fight in two, one Imperator fight in four; never a fourth T-Rex, never a second Imperator.
    fight: { winRex: 0.5, winImp: 0.25, maxKills: 3, maxImpKills: 1, regenTime: 300, eatTime: 5, eatGrow: 1.5 },
    trexBite: 60,          // a T-Rex bite on her
    clawTrex: 45,          // her claws on a T-Rex
    trexHelpR: 45,         // a T-Rex this close to the dark form turns on her
    placeR: [40, 70],      // how far from you she is put down
    placeMeanWait: 90,     // seconds of forest walking, on average, before she is put down
    drops: [["unholy_water", 1]], tiaraChance: 1 / 64,
  },
  // ---- update 36: THE DESERT (south-west), its river, and everything in it ----
  desert: {
    bounds: { x1: 400, z0: 150 },          // the sand heightfield's box: west edge..x1, z0..south edge (update 38: ×1.1)
    edgePad: 260, oldSquare: 763,          // update 38: the sand runs 260 m past the edge into the mist (no 'ocean'); the desert's u36 extent for the chest split
    // the river, traced from the user's sketch and scaled to the bigger map: it enters at the
    // west edge (z ~ +355) and leaves at the south edge (x ~ -45); the desert is its south-west bank
    river: { halfW: 11, beach: 5, waterY: 0.25, bedY: -1.3,
      // update 37: the same course scaled ×1.2 with the map
      // update 38: ×1.1 again with the map
      // update 39: the user's red line — the same course ×1.353 (longer, same shape), entering the west
      // edge at z ~276 and leaving the south edge at x ~248; the ends run on past the edge into the mist
      points: [[-1180, 153], [-1128, 190], [-894, 358], [-786, 416], [-643, 464], [-556, 493], [-481, 543], [-410, 587], [-364, 620],
        [-266, 657], [-194, 692], [-122, 763], [-24, 817], [68, 861], [147, 922], [219, 977], [308, 1072], [360, 1128]] },
    bridges: [[-834, 405], [-364, 620], [68, 861], [197, 954]],   // update 39: moved with the river
    // update 37: arched decks (arch = the rise in the middle) with solid rails railT thick — enter only from the ends
    bridge: { halfWidth: 1.8, overhang: 7, deckY: 0.6, arch: 1.3, railT: 0.5, endY: 0.03 },   // update 38: endY — both ends meet the ground
    tent: { fromBridge: 32, along: 6, zoneR: 5 },        // Idris's tent: on the desert bank of the MIDDLE bridge
    oasis: { x: -352, z: 924, r: 9, palmX: -338, palmZ: 912, shadeR: 5 },   // update 40: the farthest sand from river, city and tent (the castle lake is an oasis too)   // update 39: shifted with the tent (+170, -98)   // update 38: 150 m deeper into the corner
    dune: { base: 0.35, fadeIn: 30, a1: 0.9, a2: 0.8, a3: 0.9, a4: 1.4, a5: 1.3 },   // rolling ridges, 2-5 m; a4/a5 are the crests you hide behind
    cactusCount: 60, cactusSpacing: 30, cactusFailChance: 0.2, cactusDmg: 10,   // update 37: same density over the bigger sand
    chestCount: 8, chestCountNew: 10, chestSpacing: 60,   // update 37: six more, all in the desert's new outer part
    thirst: { drainTime: 360, bottleTime: 360, drinkRate: 20 },   // 100 -> 0 in six minutes; a full bottle is six minutes of water
    thirstHungerMult: 2,                    // thirst at zero: hunger drains twice as fast
  },
  // the two Alioramus of the desert (update 36): smaller than a T-Rex, faster, and unkillable.
  // remotus hunts by EAR along the river; altai hunts by EYE deeper in and steals cooked meat.
  remotus: {
    height: 1.8, speed: 2.4, chaseSpeed: 10, biteRange: 2.6, biteDmg: 25, biteCd: 1.4, hp: Infinity,
    hear: { sneak: 5, walk: 10, run: 60, event: 45 },   // a weapon swing or eating carries 45 m
    packR: 40, loseDist: 80, loseTime: 4, riverBand: 80, count: 6, drops: [],
  },
  altai: {
    height: 1.8, speed: 2.4, chaseSpeed: 10, biteRange: 2.6, biteDmg: 25, biteCd: 1.4, hp: Infinity,
    sightR: 40, fovCos: 0.5, turnRate: 0.52, loseTime: 5,   // a 120-degree cone, 30 deg/s of turning
    stealTime: 5, stealFreeDist: 20, satedTime: 25, riverMin: 100, count: 6, drops: [],   // sated: 25 s of not caring about you
  },
  werewolf: {
    count: 2, height: 1.9, stalkSpeed: 3.2, chaseSpeed: 5.2,
    aggroR: 22, atkRange: 1.7, dmg: 7.5, atkCd: 1.2, hp: 75,  // update 27: bite halved
    silverKnockback: 2.4,   // a silver hit shoves the wolf back — room to re-aim
    drops: [["raw_wolf", 1], ["wolf_fur", 1]],
  },
  pig: {
    count: 24, height: 0.85, speed: 1.2, fleeSpeed: 4.4, fleeR: 8, hp: 40,
    drops: [["raw_pork", 1]],
    // huntable game everywhere — DOUBLED in update 16: food should find you
    spawns: [[-36, -30], [30, -48], [-16, -88], [26, -110],
      [90, 40], [-80, -70], [110, -90], [-110, 60],
      [190, -40], [-180, -100], [80, 190], [-150, 170],
      [60, 90], [-60, 120], [150, 60], [-200, -40],
      [230, -120], [-120, 230], [280, 160], [-280, 100],
      [40, -180], [-40, 250], [170, -220], [300, -60]],
  },
  // ---- update 16: the ROCKY MOUNTAIN (north-west corner) ----
  mountain: {
    cx: -402, cz: -402,      // the peak lives in the very corner of the world
    r: 300,                  // biome radius from the corner
    walkTop: 10,             // slope height you can WALK to (halfway point)
    cliffLo: 210, cliffHi: 170, // the sheer band (distance from corner): anchors only
    plateauH: 24,            // the high shelf with the goats and the cave
    wallD: 100,              // beyond this the peak is world's-end — hard stop
    hut: { x: -240, z: -240 },   // Jabb's hut on the free lower slope
    // update 22: the cave MOUTH on the high shelf — the dungeon tunnels bore
    // from here diagonally INTO the mountain's heart (see world.buildDungeon)
    cave: { x: -323, z: -323, r: 10 },
    caveWolves: 10,
    // update 28: going DOWN the sheer band without anchors — a controlled
    // fall. Press F at the edge, ride the scree, pay 30% health at the bottom.
    slideDmg: 30, slideSpeed: 13,
  },
  // the TRICERATOPS: an unkillable golden-brown battering ram. It charges
  // STRAIGHT — sidestep and it thunders past, then slowly wheels around.
  trike: {
    count: 5, height: 4.4, speed: 1.4, hp: Infinity, // nearly T-Rex-sized — the research holds up
    sightR: 26, chargeSpeed: 11.5, chargePast: 9,  // keeps going this far past the mark
    turnTime: 4.4,                                  // the slow wheel-around (+2s of breathing room)
    dmg: 42, knockback: 9, hitR: 3.1, hitCd: 1.2,
    stuckTime: 15,                                  // horns buried in dead wood — a full 15s escape window (update 24), then it ALWAYS tears free
  },
  trikeRocks: {
    count: 15, r: 2.25, respawn: 300,   // half again bigger since update 22
    chestChance: 0.2, hookChance: 0.05,
  },
  goat: {
    count: 12, height: 0.95, speed: 1.1, fleeSpeed: 5.2, fleeR: 9, hp: 40,
    respawn: 9,              // a few seconds — the herd never thins for long
    drops: [["raw_goat", 1]],
    hornChance: 0.05,
  },
  // ---- update 29: the farm animals ----
  // cows: placid, fenced, milkable — and they hit back when you start it
  cow: {
    count: 6, height: 1.45, speed: 0.65, chaseSpeed: 3.4, hp: 120,
    dmg: 18, atkRange: 2.2, atkCd: 1.5, calmTime: 5,
    // update 32: a cow has a body. This is the half-width you cannot walk
    // through, and the rate it gives ground when you lean on it.
    radius: 0.8, shoveSpeed: 1.5,
    drops: [["raw_beef", 1]],              // update 30: raw — it has to be cooked first
  },
  // Duco the Malinois: an NPC body, never a target
  dog: { height: 0.62, speed: 1.6, followSpeed: 2.7, followDist: 2.4, leash: 16 },
  climbAnchorsNeeded: 2,     // hold two, select them, and the cliff opens
  wildChickens: {  // roaming chickens outside the pen, all across the map
    count: 6,
    spawns: [[60, -60], [-70, 40], [130, 100], [-120, -120], [200, 120], [-200, 20]],
  },
  chicken: {
    count: 7, height: 0.42, speed: 0.8, fleeSpeed: 2.4, fleeR: 4, hp: 1,
    layMin: 70, layMax: 190,     // at least a minute between eggs per chicken
  },
  maxLooseEggs: 6,
  eggPickupCap: { max: 5, windowS: 60 },  // silent mechanic — no UI text
  pen: { x0: -3, x1: 3, z0: -8.7, z1: -3.7 },  // relative to hutPos
  hut: { w: 9, d: 7, wallH: 2.6, ridge: 1.5 }, // the bigger hut
  sit: { regen: 14, cap: 100 },                 // dinner-table chair: quick refill all the way (update 24)
  fireflies: { clusters: 9, per: 11, litClusters: 5 },
  respawnTime: 60,

  modelScale: { et_door: 4.0, et_fence: 1.8, et_collar: 1.0, et_vaultdoor: 6.0, et_censer: 1.4, et_bench: 2.4, et_altar: 13.5,   // update 43: fences a third taller, the giants' bench, the altar   // update 42 (Higgsfield text-to-3D)
    et_bed: 2.0, et_lamppost: 4.6, et_torchbearer: 5.2, et_chainpost: 3.6, et_ceilinglamp: 1.8, et_throne: 4.2, et_gate: 10,   // update 40
    etdagger3d: 0.95, etsword3d: 1.6, etspear3d: 2.6,   // update 40: the generated weapons (upright scans; turned to lie along -x in buildEternialWeapons)
    trex: 5.4, trexgreen: 5.4, werewolf: 1.9, pig: 0.85, chicken: 0.42, tree: 13, appletree: 6.5, chest: 0.75, statue: 2.7,
    bedroll: 0.45, hutbed: 0.95, kitchen: 1.5, bill: 1.75, storagechest: 0.8, boulder: 1.9,
    door: 2.05, table: 0.9, chair: 1.05, lantern: 0.5, croc: 0.72, dinoegg: 1.15,
    metaldoor: 2.3, beaconlamp: 2.4,
    nest: 2.4, barrel: 1.05, closet: 2.25, woodchest: 0.8, trapdoor: 0.3,
    knife3d: 0.36, machete3d: 0.72, torch3d: 0.8,
    spino: 6.2, tent: 2.0, fountain: 2.6, trexskel: 2.3, humanskel: 0.4,
    altar: 1.3, fridge: 1.75, hans: 1.78, emily: 1.68, timo: 1.75,
    fence: 1.05, campfire: 0.85, coolbox: 0.55, crafttable: 1.05, axe3d: 0.6,
    goat: 0.95, jabb: 1.35, wolfstatue: 2.1, deadtree: 6.5, anvil: 1.0, trike: 4.4,
    dagger3d: 0.48, cavearch: 11, crossbow3d: 0.62,
    // update 29: the farm
    cow: 1.45, dirk: 1.78, sofa: 1.06, sidetable: 0.62, tvset: 1.05, clock: 2.15,   // update 32: the sofa was tiny for the room, +15%
    bathtub: 0.72, toilet: 0.78, singlebed: 0.95, dresser: 1.2,
    dinetable: 0.82, dinechair: 1.0, trunk: 0.72, bush: 1.1, bench: 0.95, bcrate: 0.62,
    haybale: 0.75,
    // update 30: the farm's second pass — heights in metres (the width-critical ones are
    // re-fitted by width in farm.js); Duco grew 50% (0.62 -> 0.93); the toilet shrank to life size
    duco: 0.93, fountain2: 2.6, kingbed2: 1.35,
    k_range: 1.55, k_sink: 1.15, k_counter: 0.9, k_table: 0.78, k_chair: 1.0,
    // update 31: whole door leaves (mounted by width, so this height is only a hint),
    // the monitor-top refrigerator, the loft ladder, the attic's stores, and Dirk again
    leaf_front: 2.12, leaf_back: 2.12, leaf_balc: 2.12,
    fridge2: 1.72, ladder: 2.9, a_crates: 1.05, a_sacks: 0.6,
    // update 32: Dirk rebuilt on a real humanoid skeleton, the armchair beside
    // the sofa, Duco's proper bolster bed, and his blueberry
    armchair: 1.02, dogmat2: 0.24, bplush: 0.26,
    // update 33c: Dirk, built new — a plain farmer on Meshy's own skeleton
    dirk6: 1.78,
    elisia: 2.13, elisia_evil: 2.74,   // update 35: seven feet, and nine
    remotus: 1.8, altai: 1.8, cactus: 4.0, palm: 9.0, nomad: 1.75,   // update 36: the desert (the Alioramus stand 1.8 m, 5.5 m long)
    portal: 5.2,   // update 37: the stone portals
    imperator: 5.94, trexdagger3d: 0.4, impdagger3d: 0.4,   // update 38
    et_male: 3.1, et_female: 2.8, et_guardspear: 3.1, et_guardsword: 3.1, et_king: 3.2, et_statue: 9,   // update 39: the Eternials (3.10 m men, 2.80 m women) and the legend's statue
    k_potrack: 1.1, k_hutch: 2.0, k_basket: 0.3, k_shelf: 0.6, k_herbs: 0.7,
    b_basin: 0.88, b_towel: 0.45, b_cabinet: 0.75, b_mirror: 0.9, hall_lamp: 0.8 },
  modelYaw: { et_door: Math.PI / 2, et_fence: Math.PI / 2, et_vaultdoor: Math.PI / 2,   // update 42: these scans are thin along x — turned so the face looks along z
    et_bed: Math.PI,   // update 40: the bed scan has its headboard at -z; the city puts the head at +z
    trex: 0, werewolf: 0, pig: 0, chicken: 0, tree: 0, appletree: 0, chest: 0, statue: 0,
    bedroll: 0, hutbed: 0, kitchen: 0, bill: 0, storagechest: 0, boulder: 0,
    door: 0, table: 0, chair: 0, lantern: 0, croc: 0, dinoegg: 0,
    spino: Math.PI,    // the image_to_3d rebuild came out tail-first
    goat: Math.PI,     // same flip, same cure
    trike: Math.PI,    // image_to_3d flips them all
    cow: 0, dog: 0, dirk: 0,    // update 29 (sam_3_3d lifts keep the photo's facing)
    // update 30: Tripo lifts face +x in their own frame and carry the photo's camera azimuth as a
    // node rotation; each yaw here undoes that azimuth and turns +x into the game's +z front.
    // Duco was lifted from a side photo, so his yaw comes from the measured head direction.
    // update 34: mesh straightened by tools/glb_straighten_head.py -- the raw file now faces exactly -z,
    // so only the node matrix's -9.08 deg azimuth is left to undo on the way to +z: 180 + 9.08
    duco: -170.9 * DEG, fountain2: -90 * DEG,   // update 37: the update-30 Duco again (body along -z in the file, node yaw -9.1) — turned onto +z
    // update 31 (same rule: the lift's own azimuth, undone, then +x turned into +z)
    leaf_front: -96.1 * DEG, leaf_back: -89 * DEG, leaf_balc: -92.4 * DEG,
    fridge2: -112.6 * DEG, ladder: -80.2 * DEG, a_crates: -121.1 * DEG, a_sacks: -94.6 * DEG,
    kingbed2: -131.6 * DEG, k_range: -125.6 * DEG, k_icebox: -112.2 * DEG, k_sink: -122.1 * DEG,
    k_counter: -118.4 * DEG, k_table: -123.8 * DEG, k_chair: -58.2 * DEG, k_potrack: -86.4 * DEG,
    k_hutch: -100.6 * DEG, k_basket: -104.4 * DEG, k_shelf: -89.3 * DEG, k_herbs: -89.4 * DEG,
    b_basin: -57.5 * DEG, b_towel: -90 * DEG, b_cabinet: -90.7 * DEG, b_mirror: -79.2 * DEG, hall_lamp: -90 * DEG,
    // update 32: Tripo is gone from the catalogue, so these four come from Meshy
    // instead. Meshy hands back an IDENTITY node matrix and builds the subject
    // already facing +z — the game's own front — so unlike every Tripo asset
    // above there is no photo azimuth to undo. Confirmed model by model in the
    // QA viewer's "+z toward you" pane before it was written down.
    armchair: 0, dogmat2: 0, bplush: 0,
    // update 33c: dirk6 is Meshy-built from a photo, so like the other Meshy
    // assets his shoulders run along x and he already faces +z
    dirk6: 0,
    elisia: 0, elisia_evil: 0,   // update 35: Meshy-built, already facing +z
    // update 36: Duco built new from his two photos (front + side), and the desert's models
    remotus: 0, altai: 0, cactus: 0, palm: 0, nomad: 0, portal: 0,   // the portal's medallion face is the model's +z
    imperator: 0, trexdagger3d: 0, impdagger3d: 0,
    et_male: 0, et_female: 0, et_guardspear: 0, et_guardsword: 0, et_king: 0, et_statue: 0 },   // update 39
  // animation clip speed: clip cycles per meter moved (tuned per creature)
  animGait: { trex: 0.22, werewolf: 0.55, chicken: 1.6, croc: 0.9, cow: 0.5, dog: 0.9, elisia: 0.9 },

  // held-item viewmodels (generated GLBs): scale + mount transform per item
  held: {
    knife3d:   { s: 0.40, pos: [0.30, -0.30, -0.62], rot: [0.12, -0.3, 0] },
    machete3d: { s: 0.85, pos: [0.32, -0.32, -0.72], rot: [0.12, -0.3, 0] },
    torch3d:   { s: 0.68, pos: [-0.3, -0.30, -0.55], rot: [0.28, 0, 0] },
    axe3d:     { s: 0.70, pos: [0.32, -0.32, -0.70], rot: [0.12, -0.3, 0] },
    dagger3d:  { s: 0.48, pos: [0.30, -0.30, -0.62], rot: [-1.25, -0.3, 0.15] },
    trexdagger3d: { s: 0.46, pos: [0.28, -0.28, -0.60], rot: [0.35, -1.75, 0.25] },   // update 38: the real tooth daggers (their long axis is x, tip at -x)
    impdagger3d:  { s: 0.46, pos: [0.28, -0.28, -0.60], rot: [0.35, -1.75, 0.25] },
    crossbow3d:{ s: 0.62, pos: [0.28, -0.30, -0.66], rot: [0.05, -1.62, 0.02] },
    // update 39: the Eternial weapons (built in code: long axis x, tip at -x)
    etdagger3d: { s: 0.5, pos: [0.28, -0.28, -0.60], rot: [0.35, -1.75, 0.25] },
    etsword3d:  { s: 1.05, pos: [0.30, -0.30, -0.66], rot: [0.35, -1.75, 0.25] },
    etspear3d:  { s: 1.7, pos: [0.30, -0.26, -0.72], rot: [0.35, -1.75, 0.25] },
  },

  // ---- update 39: ETERNIUS CITY — the Eternials' golden city in the desert's south-west corner (see eternius.js) ----
  eternius: {
    cx: -885, cz: 885,                                   // the mountain's heart
    ux: 0.70710678, uz: -0.70710678, vx: -0.70710678, vz: -0.70710678, grpYaw: 2.35619449,   // a: toward the north-east, b: toward the north-west
    mountainR: 205, cliffW: 4, cliffH: 34, peakR: 40, peakH: 150,   // update 40: cliffW 4 — still far too steep to climb (8.5 m per metre)
    wallR: 118, terraceR: 92, cavernH: 46, wallTop: 22, shaftR: 14,
    // update 40: the mountain is a craggy ridge cluster now (see eternius_build.js), the shaft mouth is ragged
    peaks: [[0, 0, 150], [-48, 30, 118], [38, -52, 108], [62, 40, 92], [-70, -44, 96], [12, 78, 84]],   // [a, b, height]
    entryA: 68, entryRampA: 56, entryTh: 60,
    // update 40: real staircases — 0.3 m risers, the floor is quantized to the treads
    stairRise: 0.3,
    stairs: { up: { r0: 64, r1: 92, hw: 6 }, down: { r0: 68, r1: 92, hw: 6 } },   // update 42: the top tread meets the terrace edge (the floor used to run on over the last four treads)
    // the upper terrace runs on past the throne door to -150 deg; a grand stair drops to the lower gallery by -125 deg
    split: { stairTh0: -150, stairTh1: -125, landing: 3 },
    riverTh: { th0: -133, th1: -60.6 },   // update 44: the river runs right up to the radial wall, the culvert's face is flush with it                    // update 43: the river now runs OUT of the grand stair (an open channel through its lowest steps, then a lit arch) to one culvert
    culvert: { depth: 60, w: 8, h: 6.2, wallUp: 5.2, lit: 18 },   // update 45: 60 m, curving with the river — no end in sight   // update 44: 30 m of sandstone tunnel, lamps for the first 18 m, then the dark   // update 43: the arch springs from the water, the wall stands 5 m above the gallery; lights inside
    // enterable homes carved into the cavern wall (theta in degrees; level = the terrace they open onto)
    rooms: [{ th: 100, level: "terrace", kind: "female" }, { th: 162, level: "terrace", kind: "male" },
            { th: -108, level: "lower", kind: "male" }, { th: 38, level: "court", kind: "female" }],
    room: { depth: 9, hw: 4.5, h: 5, doorHw: 1.4 },
    facadeStep: 9, facadeH: 8,                            // house fronts every 9 m along the cavern wall
    riverR0: 104, riverR1: 112, riverBridgeHw: 3, riverBridgeArch: 2.8, riverBridgeExt: 3, riverBridgeExtOut: 0.6, riverBridgeTh: -84,   // update 43: shorter, and off the vault's axis
    riverChanDeg: 7.8,   // update 44: the open channel runs up the stair until the steps clear the tunnel's vault, the arch sits there                                   // update 43: the open channel through the grand stair's lowest steps spans this many degrees before the arch
    levels: { court: 2, plaza: -4, dais: -2.2, terrace: 8, lower: -14, riverBed: -19, water: -15.2 },   // update 40: the water within reach of the bank
    tunnel: { a0: 118, a1: 206, hw: 5, h: 9 },
    castle: { a0: 205, a1: 250, hw: 60, wallH: 14 },
    gate: { hw: 5, h: 10, openR: 16 },                   // update 40: the mountain gate's golden doors swing open within openR
    lake: { a: 280, rFar: 50, rNear: 34, rSide: 84, aFront: 246, depth: 3 },   // update 41: one organic lake hugging the castle front (see lakeR in eternius_frame.js) — still no way round the bridge
    bridge: { a0: 250, a1: 344, hw: 3, arch: 1.2 },      // update 40: the deck starts ON the castle sill
    flatA: 280, flatR: 140,                              // the dunes go flat this far around the castle
    statue: { a: 226, b: 0 },
    chainRex: { a: 227, b: -34, reach: 25.5, collarTilt: 0, collarPitch: 40 },   // update 44: the cuff's axis runs up the neck, 40 degrees off the facing   // update 43: the collar leans back along the neck
    altar: { r: 10 },
    throne: { a0: -152, a1: -116, hw: 20, doorHw: 4 },
    vault: { b0: 118, b1: 142, hw: 18, doorHw: 2.2 },
    inn: { r: 104, th: 135 }, keeper: { r: 100, th: -112 },   // update 40: the keeper moved off the grand stair
    advisor: { a: -134, b: 8.5 },   // update 43: beside the dais, not in it
    innPrice: 5, fishTime: 4, vaultTasks: 3,
    guard: { hp: 450, dmg: 14, warnDmg: 10, speed: 3.4, hitEvery: 1.3, reach: 2.6, chaseR: 45, coins: [8, 15], respawn: 20, atkDur: 0.8, beastHits: 3 },   // update 44: ten Eternal-dagger blows, back on duty after 20 s, three strikes fell a desert hunter   // update 42: strike a guard once and he warns you, twice and it is a fight
    stalls: [
      { id: "food", name: "Neferu's kitchen", kind: "female", r: 44, th: -50, limit: 5,   // update 42: five of each a day color: 0x2f7a3a, wares: 0xb0402a, blurb: "foodBlurb", lines: "foodLines",
        sells: ["apple", "egg", "blueberries", "cooked_pork", "cooked_chicken", "cooked_fish", "chocolate", "energy_drink", "fishing_rod", "fill_water"],
        buys: { apple: 1, egg: 1, blueberries: 1, lemon: 1, raw_pork: 1, raw_chicken: 1, raw_fish: 1, raw_beef: 1, raw_goat: 1, raw_wolf: 1, cooked_pork: 2, cooked_chicken: 2, cooked_fish: 2, cooked_eggs: 2, cooked_beef: 3, cooked_goat: 3, cooked_wolf: 3, cooked_trex: 5, chocolate: 2, bowl_yogurt: 3, bowl_yogurt_blueberries: 5 } },
      { id: "tools", name: "Khamet's tools", kind: "male", r: 44, th: -18, color: 0x8a5a2a, wares: 0x555a60, blurb: "toolsBlurb", lines: "toolsLines",
        sells: ["knife", "hammer", "axe", "rope", "torch", "tinderbox", "bandage", "needle", "thread", "arrow", "bowl"],   // update 40: no climbing anchor
        buys: { knife: 3, hammer: 4, axe: 10, rope: 1, torch: 1, tinderbox: 2, bandage: 1, needle: 1, thread: 1, arrow: 1, pestle: 4, spear: 6, bowl: 1, crossbow: 40 } },
      { id: "rare", name: "Sethra's rarities", kind: "female", r: 44, th: 18, color: 0x3a2a6a, wares: 0xc9a227, blurb: "rareBlurb", lines: "rareLines", rare: true, sells: [],
        buys: { silver_dagger: 100, holy_water: 250, unholy_water: 250, trex_dagger: 25, imp_dagger: 500, fossil: 750, gold_statuette: 2500, trex_tooth: 15, imp_tooth: 60, unholy_tiara: 300, silver_bar: 40, croc_skin: 20, wolf_fur: 8, goat_horn: 6, wolf_tooth: 6 } },
      { id: "smith", name: "Ankhu the smith", kind: "male", r: 44, th: 52, color: 0x6a2a1a, wares: 0xd9ad2e, blurb: "smithBlurb", lines: "smithLines",
        sells: ["et_dagger", "et_sword", "et_spear"], buys: { et_dagger: 75, et_sword: 250, et_spear: 175 } },   // update 40: dearer
    ],
    prices: { apple: 1, egg: 1, blueberries: 2, cooked_pork: 3, cooked_chicken: 3, cooked_fish: 3, chocolate: 4, energy_drink: 3, fishing_rod: 12, fill_water: 2,
      knife: 8, hammer: 10, axe: 25, rope: 4, torch: 3, tinderbox: 5, bandage: 4, needle: 3, thread: 2, arrow: 6, bowl: 3,
      et_dagger: 150, et_sword: 500, et_spear: 350 },   // update 40: the weapons take work to earn
    bundles: { arrow: 5 },
    tasks: [
      { need: [["apple", 5]], reward: 15 }, { need: [["cookedMeat", 3]], reward: 18 }, { need: [["branch", 8]], reward: 10 },
      { need: [["egg", 4]], reward: 10 }, { need: [["blueberries", 6]], reward: 12 }, { need: [["wolf_fur", 1]], reward: 30 },
      { need: [["trex_tooth", 1]], reward: 60 }, { need: [["rope", 2], ["torch", 1]], reward: 14 },
    ],
    coinsPerChest: [3, 5], fossilChance: 1 / 256, statuetteChance: 1 / 512,
  },
  etSpear: { dmgMult: 1.5 },   // update 39: the Eternial spear flies like yours and cuts half as deep again

  // named places: labeled on the map only after you have STOOD there
  // ---- update 37: THE PORTALS — see portals.js for the rules ----
  portals: {
    spots: { red: [15, -640], green: [-625, -5], yellow: [626, -10], blue: [5, 680] },   // the user's four squares
    colors: { red: 0xff3b2a, green: 0x6cff3a, yellow: 0xffd23a, blue: 0x3a8cff, white: 0xf4f6ff },
    clearR: 9,                                   // no trees this close to one
    apples: 30, appleDecay: 5, hungerDays: 5, chests: 5, beds: 5,
    useR: 4,                                     // stand this close to investigate / use one
    whiteScale: 0.78,                            // the cellar is low
    // the model's frame after normalizeModel (5.2 m tall, feet at 0, medallion face toward +z)
    geo: { ringY: 2.86, ringR: 1.26, medY: 4.7, medR: 0.37, medZF: -0.25, medZB: -1.29, bowlX: 2.48, bowlY: 2.18, bowlZ: 0.27, swirlZ: -1.5 },   // update 38: measured — the ring's top sits BEHIND the pillars (z -1.29..-0.25), the bowls' rims at y 2.18
    // the temple's cellar: the room under the ground floor, the stairs in the north-west corner
    // (top at x1, y 0 — dropping westward to x0, y), the white portal facing the stairs
    basement: { x0: -11.5, x1: 11.5, z0: -6.6, z1: 6.6, y: -4.4, stairs: { x0: -11.3, x1: -4.4, z0: -6.4, z1: -4.5 },
      portal: [3.0, 0.5], portalYaw: -Math.PI / 2 },
    // fixed landing spots for places whose marker is not a place to stand (the rest are searched)
    arrivals: { temple: [0, -12], hut: [-22, -116] },
  },

  locations: [
    { id: "temple", x: 0, z: 0, r: 26 },
    { id: "hut", x: -22, z: -128, r: 16 },
    { id: "lighthouse", x: 143, z: 78, r: 18 },
    { id: "lake", x: 195, z: 42, r: 50 },
    { id: "nest", x: 170, z: 165, r: 14 },
    { id: "container", x: -218, z: 205, r: 14 },
    { id: "camping", x: -252, z: 12, r: 18 },
    { id: "ruinsv", x: 212, z: -182, r: 34 },
    { id: "mountain", x: -262, z: -262, r: 46 },
    { id: "farm", x: 490, z: 490, r: 26 },       // update 29 (update 30: moved to the south-east corner)
    // update 36: Idris's tent and the oasis are appended by desert.js (their spots come from the river)
  ],

  // ---- update 29: DIRK'S FARM — update 30 moved it to the user's spot B, deep in the
  // south-east corner (the whole compound shifted by +259 / +266 from the update-29 site).
  // The whole compound is a safe zone. The house uses a LOCAL plan frame:
  // u = plan-right (world +z), v = plan-down/front (world -x):
  //   world x = house.x - v,  world z = house.z + u
  // so the porch faces WEST (toward the temple) and the backyard lies east.
  farm: {
    x: 490, z: 490, hw: 28, hd: 25,            // the safe rectangle: x 462..518, z 465..515
    house: { x: 474, z: 480, hw: 7.5, hd: 6, floor0: 0.45, floor1: 3.35, wallH: 2.7, T: 0.25 },
    porchDepth: 1.8, balconyDepth: 1.8,
    stairs: { u0: -1.7, u1: -0.2, vBot: -1.0, vTop: -5.0 },   // rises toward the back wall
    pasture: { x0: 473, x1: 505, z0: 492, z1: 513, gate: { x0: 487.6, x1: 490 } },
    shed: { x0: 474, x1: 480, z0: 493, z1: 497 },              // open to the south, inside the pasture
    field: { x0: 497, x1: 515, z0: 469, z1: 490, rows: 7, perRow: 8, rowX0: 498.5, rowDX: 2.4, bushZ0: 471.2, bushDZ: 2.4 },
    terrace: { x0: 481, x1: 488, z0: 478, z1: 488 },
    fountain: { x: 491.5, z: 478.5, r: 1.7 },
    hedge: { x: 495.7, z0: 469, z1: 490, gap0: 481.8, gap1: 484.6 },
    crate: { x: 497.6, z: 480.2, cap: 200 },
    dogMat: { u: -5.6, v: -3.9 },
    dirkArea: { u0: -1.5, u1: 2.6, v0: -0.6, v1: 4.4 },        // the open middle of the living room
    bushRegrow: 180,                             // a picked bush is heavy with berries again in 3 minutes
    ducoPickDelay: 2.5,                          // seconds until Duco's berry lands in the crate
    raidChance: 0.35, raidEatTime: 6,            // some nights a werewolf takes a cow
    // update 32: the herd always comes back to full. This is a floor under the
    // normal per-creature respawn, not a replacement for it — whatever took the
    // cow, and whatever went wrong with it, one is back 90 seconds later.
    cowRespawn: 90,
    tap: { energy: 10 },                         // update 30: a drink from the kitchen or bathroom tap
    shop: [                                      // give -> get, exactly the user's price list
      { id: "energy_drink", n: 1, cost: { branch: 4 } },
      { id: "cooked_beef", n: 3, cost: { knife: 1 } },
      { id: "lemon", n: 1, cost: { blueberries: 5 } },
      { id: "bowl", n: 1, cost: { hammer: 1 } },
      { id: "scroll_yogurt", n: 1, egg: true, once: true },   // one living T-Rex egg, carried in
    ],
  },

  env: {
    day:   { sky: 0x8d988c, fog: 0x8d988c, fogNear: 40, fogFar: 150,
             hemiSky: 0x9aa79b, hemiGnd: 0x3f4a3a, hemi: 0.85,
             sun: 0xc9c4b0, sunI: 0.75 },
    night: { sky: 0x0b101c, fog: 0x0b101c, fogNear: 12, fogFar: 72,
             hemiSky: 0x2c3a56, hemiGnd: 0x0c1018, hemi: 0.52,
             sun: 0x7d90b8, sunI: 0.32 },
    // update 42: the mountain's own night — warm and a little dimmer, never the blue moonlight of the desert
    cave:  { sky: 0x0b101c, fog: 0x1a1410, fogNear: 30, fogFar: 150,
             hemiSky: 0x7a6c58, hemiGnd: 0x33291f, hemi: 0.66,
             sun: 0x9a8a70, sunI: 0.52 },
    accent: 0xb06a2c,
  },

  audio: {
    music: 0.14, sfx: 0.35, thudMaxDist: 60,
  },

  perf: { dprCap: 1.5, targetFps: 60, lightPool: 12 },   // update 41: real point lights in the scene at once — every other one is virtual (see main.js initLightPool)
};
