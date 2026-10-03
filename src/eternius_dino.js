import * as THREE from "three";
import { CFG } from "./config.js?v=77";
import { STR } from "../strings.js?v=77";
import { E, D2R, cityWorld } from "./eternius_frame.js?v=77";
import { clone as skeletonClone } from "three/addons/utils/SkeletonUtils.js";   // update 65: the hadrosaur comes rigged

// ============================================================================
// update 63: the hadrosaurus line — a trained duck-bill with a keeper at four stops (the castle's flank, the throne
// room's door, the market, the deep park). 2 coins a ride, a 10-coin day ticket sold only at the market stop, and you
// can only ride to a stop you have stood at. The ride is the boat's trick: you mount, the animal walks a few metres,
// the picture fades, and you stand at the other stop beside its keeper. The model is a static Higgsfield scan; the walk
// is a bob and a sway in code. Called from eternius.js (build after the people, prompts, the ride each frame).
// ============================================================================
const LW = () => E().lower;

const depth = (o) => { let d = 0; while (o.parent) { o = o.parent; d++; } return d; };
export function buildDino(city) {
  const C = E(), D = C.dino, S = STR.et, g = city.g, scene = g.scene, A = g.assets;
  city.dinoStops = []; city.dinoVisited = city.dinoVisited || {};
  for (const st of D.stops) {
    const a = st.r !== undefined ? st.r * Math.cos(st.th * D2R) : st.a, b = st.r !== undefined ? st.r * Math.sin(st.th * D2R) : st.b;
    const [x, z] = cityWorld(a, b);
    let y = st.y;
    if (y === undefined) { let h = NaN; try { h = city.floorH(x, z, 30); } catch (e) { h = NaN; } y = Number.isFinite(h) ? h : C.levels.court; }   // update 65: the city's own floor height (the castle courtyard is at +2; a raycast found the sand under it)
    const face = st.face, fx = Math.cos(face * D2R), fb = Math.sin(face * D2R);   // the way the animal looks, in the city's (a, b) frame
    // update 65: a rigged scan is cloned with its skeleton (a plain clone shares the bones); the tail bones are kept for the idle
    let model = null; const asset = A.glb.et_hadro;
    if (asset) { let skinned = false; asset.model.traverse((o) => { if (o.isSkinnedMesh) skinned = true; }); model = skinned ? skeletonClone(asset.model) : asset.model.clone(); model.position.set(x, y, z); model.rotation.y = C.grpYaw + face * D2R; scene.add(model);
      const tail = []; model.traverse((o) => { if (o.isBone && /tail/i.test(o.name)) tail.push(o); }); tail.sort((p1, p2) => depth(p1) - depth(p2)); model.userData.tail = tail; model.userData.tailRest = tail.map((bn) => bn.quaternion.clone()); }
    else { const m = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3.0, 8), new THREE.MeshStandardMaterial({ color: 0x6a7a3a })); m.position.set(x, y + 1.5, z); scene.add(m); model = m; }
    if (model) { model.userData.home = { pos: model.position.clone(), rot: model.rotation.clone() }; if (y < -100) { city.lowerProps.push(model); model.visible = false; } }
    // the keeper, three metres to the animal's left, looking back along it
    const ka = a + 3.4 * Math.cos((face + 90) * D2R), kb = b + 3.4 * Math.sin((face + 90) * D2R);
    const keeper = city.mkNpc ? city.mkNpc("male", ka, kb, y, a - fx * 2, b - fb * 2, "dinokeeper", { name: S.dinoKeeperName, lines: S.dinoKeeperLines, style: "calm", stop: st.id }) : null;
    // the animal's body blocks you: three round posts along its length, on this floor only
    const y0 = city.wallY0, y1 = city.wallY1; city.wallY0 = y - 3; city.wallY1 = y + 8;
    for (const k of [-2.6, 0, 2.6]) city.prims.obst(a + fx * k, b + fb * k, 1.5);
    city.wallY0 = y0; city.wallY1 = y1;
    city.dinoStops.push({ id: st.id, a, b, x, z, y, face, fx, fb, model, keeper, tickets: !!st.tickets });
  }
}

export function dinoInteract(city, consider, p) {
  const g = city.g, S = STR.et;
  if (g.ride || !city.dinoStops) return;
  for (const st of city.dinoStops) {
    if (Math.abs(p.pos.y - st.y) > 3.5) continue;
    const d = Math.hypot(p.pos.x - st.x, p.pos.z - st.z); if (d > 7) continue;
    // the prompt sits on the animal's flank nearest you
    const ux = (p.pos.x - st.x) / (d || 1), uz = (p.pos.z - st.z) / (d || 1);
    consider(st.x + ux * Math.min(d, 3.0), st.z + uz * Math.min(d, 3.0), p.pos.y, `${S.dinoTalk} [${STR.interact}]`, () => openDinoMenu(city, st));
  }
}

function openDinoMenu(city, st) {
  const g = city.g, S = STR.et, C = E(), D = C.dino, day = g.dayNum;
  const hasTicket = city.dinoTicket === day;
  const rows = [];
  for (const o of city.dinoStops) {
    if (o.id === st.id) continue;
    const seen = !!city.dinoVisited[o.id];
    rows.push(`<button class="shopCard${seen ? "" : " out"}" data-ride="${o.id}"><span class="nm">${S.dinoRideTo.replace("%s", S.dinoStop[o.id])}</span><span class="pr">${seen ? (hasTicket ? S.dinoTicketed : `${D.ride} ${S.coinsShort}`) : S.dinoNotVisited}</span></button>`);
  }
  const ticketRow = st.tickets ? `<button class="shopCard" data-ticket="1"><span class="nm">${S.dinoTicket}</span><span class="pr">${hasTicket ? S.dinoTicketHave : `${D.ticket} ${S.coinsShort}`}</span></button>` : "";
  g.menuOpen = true;
  const s = g.ui.screen(`
      <h1 style="font-size:24px;margin-bottom:2px">${S.dinoKeeperName}</h1>
      <div style="font-size:13px;opacity:.85;margin-bottom:4px">${S.dinoBlurb}</div>
      <div id="purse" class="purse">${S.purse.replace("%n", city.coins)}</div>
      <div class="shopWrap"><div class="shopHead">${S.dinoHead}</div><div class="shopGrid">${rows.join("")}${ticketRow}</div></div>
      <button id="pnlClose" style="margin-top:8px">${STR.close}</button>`);
  s.querySelector("#pnlClose").addEventListener("click", () => { g.ui.closeScreen(); g.resume(); });
  s.querySelectorAll("[data-ride]").forEach((b) => b.addEventListener("click", () => {
    const dest = city.dinoStops.find((o) => o.id === b.dataset.ride); if (!dest) return;
    if (!city.dinoVisited[dest.id]) { g.ui.toast(S.dinoNotVisitedLong); g.audio.sDeny(); return; }
    const ticket = city.dinoTicket === g.dayNum;
    if (!ticket && city.coins < D.ride) { g.ui.toast(S.noCoins); g.audio.sDeny(); return; }
    if (!ticket) { city.coins -= D.ride; g.ui.coins(city.coins); }
    g.ui.closeScreen(); g.resume(); startDinoRide(city, st, dest);
  }));
  const tb = s.querySelector("[data-ticket]");
  if (tb) tb.addEventListener("click", () => {
    if (city.dinoTicket === g.dayNum) { g.ui.toast(S.dinoTicketHave); g.audio.sDeny(); return; }
    if (city.coins < D.ticket) { g.ui.toast(S.noCoins); g.audio.sDeny(); return; }
    city.coins -= D.ticket; g.ui.coins(city.coins); city.dinoTicket = g.dayNum; g.audio.sPickup(); g.ui.toast(S.dinoTicketGot);
    g.ui.closeScreen(); g.resume(); openDinoMenu(city, st);
  });
}

function startDinoRide(city, from, to) {
  const g = city.g, S = STR.et, p = g.player;
  if (g.ride) return;
  g.ride = { kind: "dino", from, to, phase: "walk", t: 0, s: 0 };
  g.menuOpen = false; g.sitting = false;
  g.ui.toast(S.dinoLeave.replace("%s", S.dinoStop[to.id])); g.audio.sSelect && g.audio.sSelect();
  // face the way the animal walks
  const q = new THREE.Quaternion(); city.grp.getWorldQuaternion(q);
  const fw = new THREE.Vector3(from.fb, 0, from.fx).applyQuaternion(q).normalize();
  g.ride.fw = fw; p.yaw = Math.atan2(-fw.x, -fw.z); p.pitch = 0.08;
}

export function dinoUpdate(city, dt, input) {
  const g = city.g, Rd = g.ride, p = g.player, D = E().dino, S = STR.et;
  // where you have been: stand within fourteen metres of a stop and it is yours to ride to
  if (city.dinoStops) for (const st of city.dinoStops) if (!city.dinoVisited[st.id] && Math.abs(p.pos.y - st.y) < 4 && Math.hypot(p.pos.x - st.x, p.pos.z - st.z) < 14) { city.dinoVisited[st.id] = true; g.ui.toast(S.dinoStopKnown.replace("%s", S.dinoStop[st.id])); }
  // update 64: alive while standing - the flanks swell with each breath, the weight shifts, the head drifts a little
  // update 65: feet planted, nothing floats - a slow breath in the flanks and a gentle sway of the tail bones, that is all
  if (city.dinoStops) { let i = 0; for (const st of city.dinoStops) { i++; const m = st.model, home = m && m.userData.home; if (!m || !home || (Rd && Rd.kind === "dino" && Rd.from === st)) continue; const t = city.t + i * 1.7; const br = 0.5 + 0.5 * Math.sin(t * 1.1); m.scale.set(1 + 0.006 * br, 1 + 0.012 * br, 1 + 0.012 * br); m.position.copy(home.pos); m.rotation.copy(home.rot);
    const tail = m.userData.tail; if (tail && tail.length) { const rest = m.userData.tailRest, q = new THREE.Quaternion(), ax = new THREE.Vector3(0, 1, 0); for (let k = 0; k < tail.length; k++) { q.setFromAxisAngle(ax, 0.028 * Math.sin(t * 0.7 - k * 0.5)); tail[k].quaternion.copy(rest[k]).multiply(q); } } } }
  if (!Rd || Rd.kind !== "dino" || !input) return;   // the city's own update passes no input: the ride is driven from updateRide
  Rd.t += dt;
  const m = Rd.from.model, home = m && m.userData.home;
  if (Rd.phase === "walk") {
    if (m && home) {
      const sp = D.walk * Math.min(1, Rd.t / 0.8); Rd.s += sp * dt;
      m.position.copy(home.pos).addScaledVector(Rd.fw, Rd.s); m.position.y = home.pos.y + Math.abs(Math.sin(Rd.t * 5.2)) * 0.14;
      m.rotation.copy(home.rot); m.rotation.z += Math.sin(Rd.t * 5.2) * 0.035; m.rotation.y += Math.sin(Rd.t * 2.6) * 0.03;
    }
    if (Rd.t >= D.walkFor) { Rd.phase = "fade"; Rd.t = 0; g.ui.fade(true, D.fade * 1000); }
  } else if (Rd.phase === "fade") {
    if (Rd.t >= D.fade + 0.25) {
      if (m && home) { m.position.copy(home.pos); m.rotation.copy(home.rot); }
      const to = Rd.to, q = new THREE.Quaternion(); city.grp.getWorldQuaternion(q);
      // you get off on the animal's right, a stride from its flank, looking at it
      const right = new THREE.Vector3(Math.sin((to.face - 90) * D2R), 0, Math.cos((to.face - 90) * D2R)).applyQuaternion(q).normalize();
      p.pos.set(to.x + right.x * 3.6, to.y + 0.1, to.z + right.z * 3.6); p.vel && p.vel.set(0, 0, 0);
      p.yaw = Math.atan2(-(to.x - p.pos.x), -(to.z - p.pos.z)); p.pitch = 0.05;
      Rd.phase = "arrive"; Rd.t = 0; g.ui.fade(false, D.fade * 1000);
      return;
    }
  } else if (Rd.phase === "arrive") {
    if (Rd.t >= D.arrive) { g.ride = null; g.ui.prompt(""); g.ui.toast(S.dinoArrive.replace("%s", S.dinoStop[Rd.to.id])); }
    return;
  }
  // in the saddle
  if (m) p.pos.set(m.position.x, m.position.y + D.saddle, m.position.z);
  p.vel && p.vel.set(0, 0, 0);
  p.yaw += (input.turn || 0) * 2.7 * dt; p.yaw -= input.look.dx * 0.0023; p.pitch = Math.max(-1.45, Math.min(1.45, p.pitch - input.look.dy * 0.0023)); input.look.dx = input.look.dy = 0;
  g.camera.position.set(p.pos.x, p.pos.y + 1.15, p.pos.z); g.camera.rotation.set(p.pitch, p.yaw, 0, "YXZ");
  g.ui.prompt(S.dinoRiding);
}
