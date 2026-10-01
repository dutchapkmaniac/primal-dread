import * as THREE from "three";
import { CFG } from "./config.js?v=63";
import { STR } from "../strings.js?v=63";
import { E, D2R, cityWorld } from "./eternius_frame.js?v=63";

// ============================================================================
// update 63: the hadrosaurus line — a trained duck-bill with a keeper at four stops (the castle's flank, the throne
// room's door, the market, the deep park). 2 coins a ride, a 10-coin day ticket sold only at the market stop, and you
// can only ride to a stop you have stood at. The ride is the boat's trick: you mount, the animal walks a few metres,
// the picture fades, and you stand at the other stop beside its keeper. The model is a static Higgsfield scan; the walk
// is a bob and a sway in code. Called from eternius.js (build after the people, prompts, the ride each frame).
// ============================================================================
const LW = () => E().lower;

export function buildDino(city) {
  const C = E(), D = C.dino, S = STR.et, g = city.g, scene = g.scene, A = g.assets;
  city.dinoStops = []; city.dinoVisited = city.dinoVisited || {};
  for (const st of D.stops) {
    const a = st.r !== undefined ? st.r * Math.cos(st.th * D2R) : st.a, b = st.r !== undefined ? st.r * Math.sin(st.th * D2R) : st.b;
    const [x, z] = cityWorld(a, b);
    let y = st.y;
    if (y === undefined) {   // the castle's flank stands on the sand: find the ground under it
      const rc = new THREE.Raycaster(new THREE.Vector3(x, 400, z), new THREE.Vector3(0, -1, 0), 0, 1000);
      const hits = rc.intersectObjects(scene.children || [], true).filter((h) => h.object.visible && !(h.object.material && h.object.material.transparent));
      y = hits.length ? hits[0].point.y : 0;
    }
    const face = st.face, fx = Math.cos(face * D2R), fb = Math.sin(face * D2R);   // the way the animal looks, in the city's (a, b) frame
    const model = city.prims.prop("et_hadro", a, b, y, face, () => { const m = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3.0, 8), new THREE.MeshStandardMaterial({ color: 0x6a7a3a })); const [mx, mz] = cityWorld(a, b); m.position.set(mx, y + 1.5, mz); scene.add(m); return m; }, 1);
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
