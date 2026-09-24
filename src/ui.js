import { STR } from "../strings.js";
import { CFG } from "./config.js";
import { iconUrl } from "./items.js";

const $ = (s) => document.querySelector(s);

// HUD + menus + all input (keyboard by physical code, touch, gamepad)
export class UI {
  constructor() {
    // update 23: touch-capable devices CHOOSE their controls (Controls menu):
    // on-screen (default) or classic keyboard+mouse. Desktops are always classic.
    this.touchCapable = "ontouchstart" in window && navigator.maxTouchPoints > 0;
    let ctl = "touch";
    try { ctl = localStorage.pdCtl || "touch"; } catch (e) { /* private mode */ }
    this.ctlMode = ctl;
    this.isTouch = this.touchCapable && ctl !== "classic";
    if (this.isTouch) document.body.classList.add("touch");
    this.input = {
      move: { x: 0, z: 0 }, look: { dx: 0, dy: 0 }, turn: 0,
      sprint: false, sneak: false, jump: false,
      interact: false, use: false,
    };
    this.shakeV = 0;
    this.toastT = null;
    this.locked = false;
    this.onSlot = null; this.onPause = null;
    this.bindKeyboard();
    this.bindMouse();
    if (this.touchCapable) this.bindTouch();   // handlers self-gate on isTouch
    $("#mSpr").textContent = STR.mobSprint;
    $("#mSnk").textContent = STR.mobSneak;
    $("#mJmp").textContent = STR.mobJump;
    $("#mAct").textContent = STR.mobAct;
  }

  // switch the controls mode live (mobile only) — persisted per device
  setCtlMode(mode) {
    this.ctlMode = mode;
    try { localStorage.pdCtl = mode; } catch (e) { /* private mode */ }
    this.isTouch = this.touchCapable && mode !== "classic";
    document.body.classList.toggle("touch", this.isTouch);
    if (!this.isTouch) {
      this.input.move.x = this.input.move.z = 0;
      this._touchSprint = false;
      this.actionBtn(null);
    }
  }

  requestLock() {
    try {
      const r = $("#c").requestPointerLock();
      if (r && r.catch) r.catch(() => {});
    } catch (e) { /* pointer lock unavailable (embedded view) — mouse look degrades gracefully */ }
  }

  // ---- input ----
  bindKeyboard() {
    const held = this.held = new Set();
    addEventListener("keydown", (e) => {
      if (e.repeat) return;
      held.add(e.code);
      // menus are fully keyboard-driven — but while PAUSED the hotbar is a
      // workbench: digits pick a slot, F lifts an item and drops it again
      if (document.getElementById("screen")) {
        if (this.keyHook && this.keyHook(e)) { e.preventDefault(); return; }   // update 38: a screen may take the keys first (the teleport map)
        if (this.pauseInv && this.invKey(e)) return;
        if (this.storeNav && this.storeKey(e)) return;
        this.navKey(e); return;
      }
      if (e.code === "KeyF") this.input.interact = true;
      if (e.code === "Space") { this.input.jump = true; e.preventDefault(); }
      if (e.code === "KeyC") this.input.sneak = !this.input.sneak;
      if (e.code === "Escape" && this.onPause) this.onPause();
      const digit = e.code.match(/^Digit([1-8])$/);
      if (digit && this.onSlot) this.onSlot(+digit[1] - 1);
      // update 33: Q/E step the hotbar selection left/right, wrapping 1 <-> 8.
      // Keyboard only — the touch build has its own controls and never gets here.
      if ((e.code === "KeyQ" || e.code === "KeyE") && this.onSlotStep) this.onSlotStep(e.code === "KeyQ" ? -1 : 1);
      if (["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
    });
    addEventListener("keyup", (e) => { held.delete(e.code); if (e.code === "KeyF") this.stopPour(); });
    addEventListener("pointerup", () => this.stopPour());
    addEventListener("blur", () => { held.clear(); this.stopPour(); });
  }
  bindMouse() {
    const canvas = $("#c");
    canvas.addEventListener("click", () => {
      if (!this.isTouch && !document.pointerLockElement && this.wantLock) {
        this.requestLock();
      }
    });
    document.addEventListener("pointerlockchange", () => {
      this.locked = document.pointerLockElement === canvas;
      // Shift+Esc: release the mouse WITHOUT opening the pause menu
      const shiftHeld = this.held.has("ShiftLeft") || this.held.has("ShiftRight");
      if (!this.locked && this.wantLock && this.onPause && !shiftHeld) this.onPause();
    });
    addEventListener("mousemove", (e) => {
      if (!this.locked) return;
      // update 28: pointer-lock can misfire a single HUGE movement delta
      // (tab refocus, compositor hitch — likeliest mid-fight when frames
      // drop). One bogus event used to whip the view a third of a turn.
      // Clamp per-event travel: real flicks arrive as a stream of small
      // deltas, never one giant one — so play feel is untouched.
      const mx = Math.max(-180, Math.min(180, e.movementX || 0));
      const my = Math.max(-180, Math.min(180, e.movementY || 0));
      this.input.look.dx += mx; this.input.look.dy += my;
    });
    addEventListener("mousedown", (e) => {
      if (this.locked && e.button === 0) { this.input.use = true; this.input.useHeld = true; }
      // right button starts a DROP hold: tap = one item, 2s = the whole stack
      if (this.locked && e.button === 2) this.input.dropHold = true;
    });
    addEventListener("mouseup", (e) => {
      if (e.button === 0) this.input.useHeld = false;
      if (e.button === 2) this.input.dropHold = false;
    });
    addEventListener("contextmenu", (e) => e.preventDefault());
  }
  bindTouch() {
    // left stick
    const stick = $("#stick"), knob = $("#knob");
    let sid = null, sx = 0, sy = 0;
    stick.addEventListener("touchstart", (e) => {
      if (!this.isTouch) return;   // classic mode ignores the (hidden) stick
      const t = e.changedTouches[0];
      sid = t.identifier;
      const r = stick.getBoundingClientRect();
      sx = r.left + r.width / 2; sy = r.top + r.height / 2;
      e.preventDefault();
    }, { passive: false });
    addEventListener("touchmove", (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === sid) {
          const dx = (t.clientX - sx) / 48, dy = (t.clientY - sy) / 48;
          const l = Math.hypot(dx, dy);
          const cx = l > 1 ? dx / l : dx, cy = l > 1 ? dy / l : dy;
          this.input.move.x = cx; this.input.move.z = cy;
          knob.style.transform = `translate(${cx * 34}px,${cy * 34}px)`;
        } else if (t.identifier === this.lookId) {
          this.input.look.dx += (t.clientX - this.lx) * 2.4;
          this.input.look.dy += (t.clientY - this.ly) * 2.4;
          this.lx = t.clientX; this.ly = t.clientY;
        }
      }
      e.preventDefault();
    }, { passive: false });
    const endTouch = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === sid) {
          sid = null; this.input.move.x = this.input.move.z = 0;
          knob.style.transform = "";
        }
        if (t.identifier === this.lookId) this.lookId = null;
      }
    };
    addEventListener("touchend", endTouch);
    addEventListener("touchcancel", endTouch);
    // right half = look
    addEventListener("touchstart", (e) => {
      if (!this.isTouch) return;   // classic mode: fingers never steer the camera
      for (const t of e.changedTouches) {
        if (t.clientX > innerWidth / 2 && this.lookId == null && !t.target.closest(".mbtn,#hotbar,#mInt,#mPause")) {
          this.lookId = t.identifier; this.lx = t.clientX; this.ly = t.clientY;
        }
      }
    }, { passive: true });
    // buttons
    const hold = (el, on, off) => {
      el.addEventListener("touchstart", (e) => { on(); el.classList.add("on"); e.preventDefault(); }, { passive: false });
      el.addEventListener("touchend", (e) => { if (off) off(); el.classList.remove("on"); e.preventDefault(); }, { passive: false });
    };
    hold($("#mSpr"), () => (this._touchSprint = true), () => (this._touchSprint = false));
    hold($("#mJmp"), () => (this.input.jump = true));
    hold($("#mAct"), () => { this.input.use = true; this.input.useHeld = true; },
      () => (this.input.useHeld = false));
    $("#mSnk").addEventListener("touchstart", (e) => {
      this.input.sneak = !this.input.sneak;
      $("#mSnk").classList.toggle("on", this.input.sneak);
      e.preventDefault();
    }, { passive: false });
    // update 23: the CONTEXT button — exactly what the F key does
    hold($("#mInt"), () => (this.input.interact = true));
    // ...and the PAUSE button — exactly what Esc does
    $("#mPause").addEventListener("touchstart", (e) => {
      e.preventDefault();
      if (!document.getElementById("screen") && this.onPause) this.onPause();
    }, { passive: false });
  }

  // the mobile context button: shown only when an interaction is in reach,
  // ONE word naming this situation (OPEN / SLEEP / COOK / TALK...)
  actionBtn(word) {
    const el = $("#mInt");
    if (!el) return;
    if (!word || !this.isTouch) {
      if (el.style.display !== "none") el.style.display = "none";
      return;
    }
    if (el.textContent !== word) el.textContent = word;
    if (el.style.display !== "flex") el.style.display = "flex";
  }

  // the right-click drop meter (pass null to hide)
  dropBar(frac) {
    const el = $("#dropBar");
    if (!el) return;
    if (frac === null || frac === undefined) {
      if (el.style.display !== "none") el.style.display = "none";
      return;
    }
    el.style.display = "block";
    el.querySelector("i").style.width = `${Math.round(frac * 100)}%`;
  }
  pollGamepad() {
    for (const gp of navigator.getGamepads?.() ?? []) {
      if (!gp) continue;
      const dz = (v) => (Math.abs(v) > 0.18 ? v : 0);
      const mx = dz(gp.axes[0]), mz = dz(gp.axes[1]);
      if (mx || mz) { this.input.move.x = mx; this.input.move.z = mz; this._padMove = true; }
      else if (this._padMove) { this.input.move.x = this.input.move.z = 0; this._padMove = false; }
      this.input.look.dx += dz(gp.axes[2] || 0) * 14;
      this.input.look.dy += dz(gp.axes[3] || 0) * 14;
      const b = (i) => gp.buttons[i]?.pressed;
      if (b(0) && !this._pA) this.input.interact = true; this._pA = b(0);        // A
      if (b(1) && !this._pB) this.input.jump = true; this._pB = b(1);            // B
      if ((b(7) || b(2)) && !this._pX) this.input.use = true; this._pX = b(7) || b(2); // RT / X
      if (b(4) && !this._pLB) { this.input.sneak = !this.input.sneak; } this._pLB = b(4); // LB
      this._padSprint = b(10);                                                   // L3 hold
      if (b(5) && !this._pRB && this.onSlotNext) this.onSlotNext(); this._pRB = b(5);
    }
  }

  // keyboard state → input vector (called each frame)
  collect() {
    if (!this.isTouch || this.held.size) {
      let x = 0, z = 0;
      if (this.held.has("KeyW") || this.held.has("ArrowUp")) z -= 1;
      if (this.held.has("KeyS") || this.held.has("ArrowDown")) z += 1;
      if (this.held.has("KeyA") || this.held.has("ArrowLeft")) x -= 1;
      if (this.held.has("KeyD") || this.held.has("ArrowRight")) x += 1;
      if (x || z || !this.isTouch) { this.input.move.x = x; this.input.move.z = z; }
    }
    // update 33: on a keyboard Q/E no longer turn the camera — they step the
    // hotbar selection (see the keydown handler). The mouse is how you turn.
    this.input.turn = 0;
    this.pollGamepad();
    // Z is the run key (Shift kept as an alias)
    this.input.sprint = this.held.has("KeyZ") || this.held.has("ShiftLeft") || this.held.has("ShiftRight")
      || !!this._touchSprint || !!this._padSprint;
    return this.input;
  }

  // ---- HUD ----
  bars(hp, en, hu) {
    const set = (sel, v, warn) => {
      const el = $(sel);
      el.querySelector("i").style.width = `${Math.round(v)}%`;
      el.querySelector("b").textContent = `${Math.round(v)}`;
      el.classList.toggle("low", warn && v < 25);
    };
    set("#hp", hp, true); set("#en", en, false); set("#hu", hu, true);
  }
  // update 36: the thirst bar — only while you are in the desert (null hides it)
  thirst(v) {
    const el = $("#th");
    if (!el) return;
    const show = v !== null && v !== undefined;
    if (el.style.display !== (show ? "flex" : "none")) el.style.display = show ? "flex" : "none";
    if (!show) return;
    el.querySelector("i").style.width = `${Math.round(v)}%`;
    el.querySelector("b").textContent = `${Math.round(v)}`;
    el.classList.toggle("low", v < 25);
  }
  keycaps(text) {
    return String(text).replace(/\[([^\]]+)\]/g, '<span class="key">$1</span>');
  }
  // the hunt HP bar (update 11) — pass frac=null to hide it
  huntBar(name, frac, enraged) {
    const el = $("#hunt");
    if (frac === null || frac === undefined) {
      if (el.style.display !== "none") el.style.display = "none";
      return;
    }
    el.style.display = "block";
    el.classList.toggle("enraged", !!enraged);
    el.querySelector(".nm").textContent = name;
    el.querySelector(".tr i").style.width = `${Math.max(0, Math.min(100, frac * 100))}%`;
  }
  // update 39: the purse of Eternial coins (shown once you have any)
  coins(n) {
    const el = $("#coins");
    if (!el) return;
    this._coins = n;
    el.hidden = !(n > 0 && this._coinsShow !== false);
    el.textContent = `\u25c8 ${n}`;
  }
  // update 44: the purse only shows in the desert, on its own island to the right of the bars
  coinsVisible(show) {
    const el = $("#coins"), bars = $("#bars");
    if (!el) return;
    this._coinsShow = show;
    el.hidden = !(this._coins > 0 && show);
    if (bars && !el.hidden) { const r = bars.getBoundingClientRect(); el.style.left = `${Math.round(r.right + 10)}px`; el.style.top = `${Math.round(r.top)}px`; }
  }
  // update 38: the second bar — the hunter Elisia's dark form is fighting
  huntBar2(name, frac) {
    const el = $("#hunt2");
    if (!el) return;
    if (frac === null || frac === undefined) { if (el.style.display !== "none") el.style.display = "none"; return; }
    el.style.display = "block";
    el.querySelector(".nm").textContent = name;
    el.querySelector(".tr i").style.width = `${Math.max(0, Math.min(100, frac * 100))}%`;
  }
  clockDisplay(day, phase, night) {
    $("#clock .day").textContent = `${STR.day} ${day}`;
    $("#clock .tod").innerHTML = `<span class="glyph">${night ? "☾" : "☀"}</span>${phase}`;
  }
  setSelHint(text) {
    const el = $("#selHint");
    if (!text) { el.style.visibility = "hidden"; return; }
    el.style.visibility = "visible";
    el.innerHTML = this.keycaps(text);
  }
  goal(text) {
    if (this._goal === text) return;
    this._goal = text;
    $("#goal").textContent = text;
  }
  prompt(text, warn = false) {
    const el = $("#prompt");
    if (!text) { el.style.display = "none"; return; }
    // on-screen controls have no F key — the trailing keycap would be a lie
    if (this.isTouch) text = String(text).replace(/\s*\[[^\]]*\]\s*$/, "");
    el.style.display = "block";
    el.innerHTML = this.keycaps(text);
    el.style.borderColor = warn ? "#a8422d" : "rgba(192,122,52,.65)";
    el.style.color = warn ? "#d86a50" : "#e8ceac";
  }
  toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.style.opacity = 1;
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => (el.style.opacity = 0), 2600);
  }
  // update 35: Elisia's kiss (a warm gold wash) and her transformation (a dark red pulse)
  bless(kind) {
    const el = $("#bless");
    if (!el) return;
    el.style.background = kind === "dark"
      ? "radial-gradient(ellipse at center, rgba(120,0,10,.55) 0%, rgba(40,0,6,.85) 100%)"
      : "radial-gradient(ellipse at center, rgba(255,236,170,.75) 0%, rgba(255,200,90,.25) 60%, rgba(255,180,60,0) 100%)";
    el.style.transitionDuration = ".15s";
    el.style.opacity = 1;
    clearTimeout(this._blessT);
    this._blessT = setTimeout(() => { el.style.transitionDuration = "1.2s"; el.style.opacity = 0; }, 220);
  }
  hurtFlash() {
    const v = $("#vig");
    v.style.opacity = 1;
    clearTimeout(this._vigT);
    this._vigT = setTimeout(() => (v.style.opacity = 0), 350);
  }
  nightVig(k) { $("#nightvig").style.opacity = k; }
  // night vision: the green phosphor wash + a brightness lift on the render
  nvgOverlay(on) {
    const el = $("#nvg");
    if (el) el.style.opacity = on ? 1 : 0;
    $("#c").style.filter = on ? "brightness(1.35) contrast(1.06) saturate(0.55)" : "";
  }
  // update 29: a status pill under the goal line (Duco helping, crate count)
  setHelper(text) {
    const el = $("#helper");
    if (!el) return;
    if (!text) { el.style.display = "none"; return; }
    el.style.display = "block";
    el.textContent = text;
  }
  setDrunk(sec) {
    const el = $("#drunk");
    if (!el) return;
    if (sec <= 0) { el.style.display = "none"; return; }
    el.style.display = "block";
    el.textContent = `${STR.drunkLabel} ${Math.ceil(sec)}s`;
  }
  shake(intensity) { this.shakeV = Math.min(2, this.shakeV + intensity); }

  renderHotbar(inv) {
    const bar = $("#hotbar");
    if (!bar.children.length) {
      for (let i = 0; i < inv.slots.length; i++) {
        const d = document.createElement("div");
        d.className = "slot";
        d.dataset.i = i;
        d.innerHTML = `<span class="k">${i + 1}</span><span class="n"></span>`;
        d.addEventListener("pointerdown", (e) => { if (this.onSlot) this.onSlot(i); e.preventDefault(); });
        bar.appendChild(d);
      }
      // drag-and-drop release: wherever the pointer lets go, that slot catches it
      document.addEventListener("pointerup", (e) => {
        if (!this.pauseInv || this.invGrab == null) return;
        const el = document.elementFromPoint(e.clientX, e.clientY)?.closest?.("#hotbar .slot");
        if (el) this.invDropAt(+el.dataset.i);
      });
    }
    for (let i = 0; i < inv.slots.length; i++) {
      const el = bar.children[i], s = inv.slots[i];
      el.classList.toggle("sel", i === inv.sel);
      el.classList.toggle("grab", this.pauseInv === inv && this.invGrab === i);
      el.style.backgroundImage = s ? `url(${iconUrl(s.id)})` : "";
      // the crossbow's badge shows what its MAGAZINE holds (update 27)
      const magN = s && s.id === "crossbow" && s.mag ? s.mag.arrow + s.mag.silver_arrow : 0;
      el.querySelector(".n").textContent = magN ? magN : (s && s.count > 1 ? s.count : "");
      el.title = s ? `${STR.items[s.id].name} — ${STR.items[s.id].desc}` : "";
    }
    this.setSelHint(this.hintFor ? this.hintFor(inv.selected()) : null);
  }

  // ---- screens (keyboard-navigable) ----
  screen(html) {
    this.closeScreen();
    const d = document.createElement("div");
    d.className = "screen"; d.id = "screen";
    d.innerHTML = html;
    $("#overlays").appendChild(d);
    this.refreshNav(d);
    return d;
  }
  closeScreen() { $("#screen")?.remove(); this.navEls = null; this.storeNav = null; this.keyHook = null; this.stopPour(); }
  // tap = one transfer, hold = keep pouring until the button lifts
  startPour(fn) {
    this.stopPour();
    fn();
    this._pourT = setTimeout(() => { this._pourI = setInterval(fn, 110); }, 380);
  }
  stopPour() {
    if (this._pourT) clearTimeout(this._pourT);
    if (this._pourI) clearInterval(this._pourI);
    this._pourT = this._pourI = null;
  }
  // storage panels navigate as a GRID: all four directions, and the Close
  // button is one step below the bottom row (or one above the top)
  storeKey(e) {
    const nav = this.storeNav;
    const dir = { ArrowLeft: -1, KeyA: -1, ArrowRight: 1, KeyD: 1 }[e.code];
    const vert = { ArrowUp: -1, KeyW: -1, ArrowDown: 1, KeyS: 1 }[e.code];
    if (dir !== undefined) { nav.move(dir, 0); e.preventDefault(); return true; }
    if (vert !== undefined) { nav.move(0, vert); e.preventDefault(); return true; }
    if (e.code === "KeyF" || e.code === "Enter" || e.code === "Space") {
      if (nav.g === 2) { nav.closeBtn.click(); }
      else this.startPour(() => nav.moveOne(nav.g, nav.i));
      e.preventDefault();
      return true;
    }
    return false;
  }
  refreshNav(scr) {
    scr = scr || $("#screen");
    if (!scr) return;
    this.navEls = [...scr.querySelectorAll("button, [data-nav]")].filter((el) => !el.disabled);
    this.navIdx = Math.min(this.navIdx || 0, Math.max(0, this.navEls.length - 1));
    this.paintNav();
  }
  paintNav() {
    if (!this.navEls) return;
    this.navEls.forEach((el, i) => el.classList.toggle("knav", i === this.navIdx));
  }
  // ---- pause-menu inventory rearranging ----
  // The paused hotbar is a workbench: [1-8] or [←][→] select, [F] lifts the
  // item; then another [1-8], arrow+[F], a click or a mouse DRAG drops it —
  // onto a filled slot the two items simply trade places.
  invKey(e) {
    const inv = this.pauseInv;
    const digit = e.code.match(/^Digit([1-8])$/);
    if (digit) {
      const i = +digit[1] - 1;
      if (this.invGrab != null && i !== this.invGrab) {
        inv.move(this.invGrab, i);       // number key while holding = it lands THERE
        this.invGrab = null;
      }
      inv.sel = i;
      this.renderHotbar(inv);
      return true;
    }
    if (e.code === "ArrowLeft" || e.code === "ArrowRight") {
      inv.sel = (inv.sel + (e.code === "ArrowRight" ? 1 : -1) + inv.slots.length) % inv.slots.length;
      this.renderHotbar(inv);
      e.preventDefault();
      return true;
    }
    if (e.code === "KeyF") {
      if (this.invGrab == null) {
        if (inv.slots[inv.sel]) this.invGrab = inv.sel;
      } else {
        inv.move(this.invGrab, inv.sel);
        this.invGrab = null;
      }
      this.renderHotbar(inv);
      return true;
    }
    return false;
  }
  // mouse on the paused hotbar: press = lift (or drop onto a new slot),
  // release over another slot = drag-and-drop
  invClickSlot(i) {
    const inv = this.pauseInv;
    if (this.invGrab != null && i !== this.invGrab) {
      inv.move(this.invGrab, i);
      this.invGrab = null;
    } else if (this.invGrab === i) {
      this.invGrab = null;               // second press on the held slot sets it down
    } else if (inv.slots[i]) {
      this.invGrab = i;                  // press lifts — release elsewhere drops
    }
    inv.sel = i;
    this.renderHotbar(inv);
  }
  invDropAt(i) {
    const inv = this.pauseInv;
    if (!inv || this.invGrab == null || i == null || i === this.invGrab) return;
    inv.move(this.invGrab, i);
    this.invGrab = null;
    inv.sel = i;
    this.renderHotbar(inv);
  }
  // while paused the hotbar rises ABOVE the menu overlay and stays clickable.
  // #hud is a fixed-position element and therefore its own stacking context —
  // a child z-index can NEVER climb over the overlay layer, so the hotbar is
  // physically reparented to <body> for the duration of the pause.
  setInvEdit(on) {
    const w = document.getElementById("hotbarWrap");
    if (!w) return;
    w.classList.toggle("invEdit", !!on);
    if (on) {
      if (w.parentElement !== document.body) document.body.appendChild(w);
    } else {
      const hud = document.getElementById("hud");
      if (hud && w.parentElement !== hud) hud.appendChild(w);
    }
  }

  navKey(e) {
    if (!this.navEls || !this.navEls.length) {
      if (e.code === "Escape") $("#screen")?.querySelector("button")?.click();
      return;
    }
    const fwd = ["ArrowDown", "ArrowRight", "KeyS", "KeyD"].includes(e.code);
    const back = ["ArrowUp", "ArrowLeft", "KeyW", "KeyA"].includes(e.code);
    if (fwd || back) {
      // update 42: inside a shop grid, up and down move by a whole row
      const vert = ["ArrowDown", "KeyS"].includes(e.code) ? 1 : ["ArrowUp", "KeyW"].includes(e.code) ? -1 : 0;
      let next = -1;
      if (vert) {
        const el = this.navEls[this.navIdx], grid = el && el.closest ? el.closest(".shopGrid") : null;
        if (grid) {
          const cards = [...grid.children].filter((c) => this.navEls.includes(c)), i = cards.indexOf(el);
          const cols = cards.filter((c) => c.offsetTop === cards[0].offsetTop).length || 1, j = i + vert * cols;
          if (j >= 0 && j < cards.length) next = this.navEls.indexOf(cards[j]);
          else if (vert > 0) next = (this.navEls.indexOf(cards[cards.length - 1]) + 1) % this.navEls.length;
          else next = (this.navEls.indexOf(cards[0]) - 1 + this.navEls.length) % this.navEls.length;
        }
      }
      this.navIdx = next >= 0 ? next : (this.navIdx + (fwd ? 1 : -1) + this.navEls.length) % this.navEls.length;
      this.paintNav();
      this.navEls[this.navIdx].scrollIntoView({ block: "nearest" });
      e.preventDefault();
    } else if (["Enter", "Space", "KeyF"].includes(e.code)) {
      this.navEls[this.navIdx]?.click();
      e.preventDefault();
    } else if (e.code === "Escape") {
      const scr = $("#screen");
      const closer = scr?.querySelector("#pnlClose") || scr?.querySelector("button:last-of-type");
      closer?.click();
      e.preventDefault();
    }
    const digit = e.code.match(/^Digit([1-9])$/);
    if (digit && this.navEls[+digit[1] - 1]) { this.navIdx = +digit[1] - 1; this.paintNav(); }
  }

  // sound button + volume rocker — lives on the start screen AND the pause menu
  soundRowHtml() {
    const a = this.audio;
    const muted = a ? a.muted : false;
    const vol = a ? Math.round(a.volume * 100) : 100;
    return `<div id="sndRow">
      <button id="muteBtn" class="miniBtn" title="${STR.soundToggle}">${muted ? "🔇" : "🔊"}</button>
      <input id="volSlider" type="range" min="0" max="100" value="${vol}" title="${STR.soundVolume}">
    </div>`;
  }
  bindSoundRow(s) {
    const a = this.audio;
    if (!a) return;
    const btn = s.querySelector("#muteBtn"), vol = s.querySelector("#volSlider");
    btn?.addEventListener("click", () => {
      a.setMuted(!a.muted);
      btn.textContent = a.muted ? "🔇" : "🔊";
    });
    vol?.addEventListener("input", () => {
      a.setVolume(vol.value / 100);
      if (a.muted && vol.value > 0) { a.setMuted(false); btn.textContent = "🔊"; }
    });
  }

  menu(onPlay, resume = false) {
    this.wantLock = false;
    // the pause menu doubles as the EXPEDITION MAP — Esc and study the land
    const mapBlock = resume
      ? `<canvas id="bigmap" width="10" height="10"></canvas>
         <p class="sub" id="mapHint">${STR.mapHint}</p>
         <p class="sub">${this.keycaps(STR.invMoveHint)}</p>`
      : `<p>${STR.intro}</p>`;
    const s = this.screen(`
      <h1 ${resume ? 'style="font-size:28px;margin-bottom:2px"' : ""}>${STR.title}</h1>
      ${resume ? "" : `<h2>${STR.subtitle}</h2>`}
      ${mapBlock}
      <div class="btnRow">
        <button id="playBtn">${resume ? STR.resume : STR.play}</button>
        <button id="ctrlBtn" style="background:linear-gradient(180deg,#3c4438,#252b21);color:#cdd3c8;border-color:#5a6350">${STR.controlsBtn}</button>
        <button id="gfxBtn" style="background:linear-gradient(180deg,#3c4438,#252b21);color:#cdd3c8;border-color:#5a6350">${STR.gfxBtn}</button>
      </div>
      ${this.soundRowHtml()}
      <p class="sub">${this.keycaps("[↑] [↓] navigate · [Enter] choose · [Esc] back")}</p>`);
    if (resume) {
      const cnv = s.querySelector("#bigmap");
      const px = Math.round(Math.min(innerWidth, innerHeight) * (innerHeight > 700 ? 0.52 : 0.46));
      cnv.width = cnv.height = px;
      cnv.style.width = cnv.style.height = px + "px";
      if (this.drawMap) this.drawMap(cnv);
    }
    this.bindSoundRow(s);
    s.querySelector("#playBtn").addEventListener("click", () => {
      this.closeScreen();
      this.wantLock = !this.isTouch;
      if (this.wantLock) this.requestLock();
      onPlay();
    });
    s.querySelector("#ctrlBtn").addEventListener("click", () => this.controlsPanel(() => this.menu(onPlay, resume)));
    s.querySelector("#gfxBtn").addEventListener("click", () => this.gfxPanel(() => this.menu(onPlay, resume)));
  }

  // Graphics settings: render scale (live) + MSAA (context flag — next load).
  // Nothing else is touched: no effects, no gameplay, only pixels.
  gfxPanel(onBack) {
    const api = this.gfxApi;
    if (!api) { onBack(); return; }
    const st = api.state();
    const opt = (key, label) =>
      `<button class="gfxOpt${st.scale === key ? " on" : ""}" data-scale="${key}">${label}<span class="gfxPx">${api.pixels(key)}</span></button>`;
    const pOpt = (key, label) =>
      `<button class="gfxOpt${st.preset === key ? " on" : ""}" data-preset="${key}">${label}</button>`;
    const s = this.screen(`
      <h1 style="font-size:26px">${STR.gfxTitle}</h1>
      <p class="sub" style="margin-bottom:2px">${STR.gfxPresetLabel}${st.preset === "custom" ? ` — ${STR.gfxPresetCustom}` : ""}</p>
      <div class="btnRow" style="flex-wrap:wrap;max-width:560px">
        ${pOpt("low", STR.gfxPresetLow)}${pOpt("medium", STR.gfxPresetMedium)}${pOpt("high", STR.gfxPresetHigh)}${pOpt("ultra", STR.gfxPresetUltra)}
      </div>
      <p class="sub" style="margin-bottom:2px">${STR.gfxResolution}</p>
      <div class="btnRow" style="flex-wrap:wrap;max-width:560px">
        ${opt("low", STR.gfxLow)}${opt("medium", STR.gfxMedium)}${opt("high", STR.gfxHigh)}${opt("native", STR.gfxNative)}
      </div>
      <p class="sub" id="gfxActive">${STR.gfxActive} ${api.active()}</p>
      <p class="sub" style="margin:10px 0 2px">${STR.gfxMsaaLabel}</p>
      <div class="btnRow"><button id="msaaBtn" class="gfxOpt">${st.msaa ? STR.gfxOn : STR.gfxOff}</button></div>
      <p class="sub" style="max-width:480px">${STR.gfxMsaaNote}</p>
      <p class="sub" style="margin:10px 0 2px">${STR.gfxDynresLabel}</p>
      <div class="btnRow"><button id="dynresBtn" class="gfxOpt">${st.dynres ? STR.gfxOn : STR.gfxOff}</button></div>
      <p class="sub" style="max-width:520px">${STR.gfxDynresNote}</p>
      ${api.dgpuShown && api.dgpuShown() ? `
      <p class="sub" style="margin:10px 0 2px">${STR.gfxDgpuLabel}</p>
      <div class="btnRow"><button id="dgpuBtn" class="gfxOpt">${st.dgpu !== false ? STR.gfxOn : STR.gfxOff}</button></div>` : ""}
      <p class="sub" style="max-width:520px">${STR.gfxGpuLabel} ${api.gpu ? api.gpu() : "?"}</p>
      <p class="sub" id="msaaNote" style="display:none;color:#e8a050">${STR.gfxReloadNote}</p>
      <button id="pnlClose">${STR.billBack || "Back"}</button>`);
    for (const b of s.querySelectorAll(".gfxOpt[data-preset]")) {
      b.addEventListener("click", () => {
        const msaaBefore = api.state().msaa;
        api.setPreset(b.dataset.preset);
        this.gfxPanel(onBack);   // redraw — scale/MSAA rows mirror the preset
        if (api.state().msaa !== msaaBefore) {
          const note = document.querySelector("#screen #msaaNote");
          if (note) note.style.display = "block";
        }
      });
    }
    for (const b of s.querySelectorAll(".gfxOpt[data-scale]")) {
      b.addEventListener("click", () => {
        api.setScale(b.dataset.scale);
        s.querySelectorAll(".gfxOpt[data-scale]").forEach((x) => x.classList.toggle("on", x === b));
        s.querySelector("#gfxActive").textContent = `${STR.gfxActive} ${api.active()}`;
      });
    }
    s.querySelector("#dynresBtn").addEventListener("click", () => {
      api.setDynres(!api.state().dynres);
      s.querySelector("#dynresBtn").textContent = api.state().dynres ? STR.gfxOn : STR.gfxOff;
    });
    const mb = s.querySelector("#msaaBtn");
    mb.addEventListener("click", () => {
      api.setMsaa(!api.state().msaa);
      mb.textContent = api.state().msaa ? STR.gfxOn : STR.gfxOff;
      s.querySelector("#msaaNote").style.display = "block";
    });
    const db = s.querySelector("#dgpuBtn");
    db?.addEventListener("click", () => {
      api.setDgpu(api.state().dgpu === false);   // context flag — reload to apply
      db.textContent = api.state().dgpu !== false ? STR.gfxOn : STR.gfxOff;
      s.querySelector("#msaaNote").style.display = "block";
    });
    s.querySelector("#pnlClose").addEventListener("click", () => onBack());
  }

  // every button in the game, explained
  controlsPanel(onBack) {
    // classic: the full key list. On-screen mode: the stick and buttons
    // explained instead — a tablet player never needs the keyboard rows.
    const rowsFor = (mode) => {
      if (mode === "touch") {
        return STR.touchControlsList.map(([k, d]) =>
          `<div class="ctrlRow"><span class="kk">${k}</span><span>${d}</span></div>`).join("");
      }
      return STR.controlsList.map(([k, d]) => {
        const caps = k.split(" ").map((p) => (p === "/" || p === "or" || p === "+" || p === "–" || p === "-" ? p : `[${p}]`)).join(" ");
        return `<div class="ctrlRow"><span class="kk">${this.keycaps(caps)}</span><span>${d}</span></div>`;
      }).join("");
    };
    const curMode = this.touchCapable && this.ctlMode !== "classic" ? "touch" : "classic";
    // update 23: MOBILE devices choose their controls here. Desktops never
    // see this block — their controls simply are the classic ones.
    const modeBlock = this.touchCapable ? `
      <p class="sub" style="margin:2px 0 0">${STR.ctlModeTitle}</p>
      <div class="btnRow">
        <button class="gfxOpt${this.ctlMode !== "classic" ? " on" : ""}" data-ctl="touch">${STR.ctlModeTouch}</button>
        <button class="gfxOpt${this.ctlMode === "classic" ? " on" : ""}" data-ctl="classic">${STR.ctlModeClassic}</button>
      </div>
      <p class="sub" id="ctlModeNote" style="max-width:560px">${this.ctlMode === "classic" ? STR.ctlModeClassicNote : STR.ctlModeTouchNote}</p>` : "";
    const s = this.screen(`
      <h1 style="font-size:26px">${STR.controlsTitle}</h1>
      ${modeBlock}
      <div id="ctrlRows" style="max-width:600px;width:92vw;max-height:${this.touchCapable ? 44 : 62}vh;overflow-y:auto;padding:4px 10px">${rowsFor(curMode)}</div>
      <button id="pnlClose">${STR.billBack || "Back"}</button>`);
    for (const b of s.querySelectorAll("[data-ctl]")) {
      b.addEventListener("click", () => {
        this.setCtlMode(b.dataset.ctl);
        s.querySelectorAll("[data-ctl]").forEach((x) => x.classList.toggle("on", x === b));
        s.querySelector("#ctlModeNote").textContent =
          b.dataset.ctl === "classic" ? STR.ctlModeClassicNote : STR.ctlModeTouchNote;
        s.querySelector("#ctrlRows").innerHTML = rowsFor(b.dataset.ctl);
      });
    }
    s.querySelector("#pnlClose").addEventListener("click", () => onBack());
  }
  death(reason, onRespawn) {
    this.wantLock = false;
    document.exitPointerLock?.();
    const flavor = { trex: STR.deadEaten, mother: STR.deadMother, werewolf: STR.deadWolf, hunger: STR.deadHunger, cow: STR.deadCow, elisia: STR.deadElisia, alio: STR.deadAlio, cactus: STR.deadCactus }[reason] || "";
    const s = this.screen(`
      <h1>${STR.dead}</h1><h2>${flavor}</h2>
      <p>${STR.deathHint}</p>
      <button id="rsBtn">${STR.respawn}</button>`);
    s.querySelector("#rsBtn").addEventListener("click", () => {
      this.closeScreen();
      this.wantLock = !this.isTouch;
      if (this.wantLock) this.requestLock();
      onRespawn();
    });
  }
  win(onContinue) {
    this.wantLock = false;
    document.exitPointerLock?.();
    const s = this.screen(`
      <h1>${STR.win}</h1>
      <p>${STR.winText}</p>
      <button id="wBtn">${STR.keepPlaying}</button>`);
    s.querySelector("#wBtn").addEventListener("click", () => {
      this.closeScreen();
      this.wantLock = !this.isTouch;
      if (this.wantLock) this.requestLock();
      onContinue();
    });
  }
  loading() {
    return this.screen(`
      <h1>${STR.title}</h1><h2>${STR.loading}</h2>
      <div id="loadbar"><i></i></div>`);
  }
  setProgress(f) {
    const el = $("#loadbar i");
    if (el) el.style.width = `${Math.round(f * 100)}%`;
  }
  fade(black, dur = 800) {
    return new Promise((res) => {
      let f = $("#fade");
      if (!f) {
        f = document.createElement("div");
        f.id = "fade";
        f.style.cssText = "position:fixed;inset:0;background:#000;opacity:0;transition:opacity .8s;pointer-events:none;z-index:15";
        $("#overlays").appendChild(f);
      }
      f.style.transitionDuration = `${dur}ms`;
      requestAnimationFrame(() => { f.style.opacity = black ? 1 : 0; });
      setTimeout(res, dur);
    });
  }
}
