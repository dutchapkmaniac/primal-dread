import { CFG } from "./config.js";

// Generated clips (manifest ids) + procedural WebAudio synth for the small
// feedback sounds. Mix per the audio reference: music quiet under sfx,
// master compressor keeps the mix ear-safe.
const GEN = {
  ambient: "./assets/audio/a_ambient.m4a",
  chase:   "./assets/audio/a_chase.m4a",
  roar:    "./assets/audio/sfx_roar.mp3",
  thud:    "./assets/audio/sfx_step.mp3",
  knife:   "./assets/audio/sfx_knife.mp3",
  howl:    "./assets/audio/sfx_howl.mp3",
  night:   "./assets/audio/sfx_night.mp3",
  stepGrass: "./assets/audio/sfx_step_grass.mp3",
  stepSand: "./assets/audio/sfx_step_sand.mp3",
  stepWater: "./assets/audio/sfx_step_water.mp3",
  // update 28: the full generated soundscape — two T-Rex voices, a spino
  // shriek, a trike bellow, real rock-break, hens, and four more floors
  roarIdle: "./assets/audio/sfx_roar_idle.mp3",
  roarAggro: "./assets/audio/sfx_roar_aggro.mp3",
  spinoCry: "./assets/audio/sfx_spino.mp3",
  trikeCry: "./assets/audio/sfx_trike.mp3",
  rockBreak: "./assets/audio/sfx_rockbreak.mp3",
  chickens: "./assets/audio/sfx_chickens.mp3",
  stepRock: "./assets/audio/sfx_step_rock.mp3",
  stepWood: "./assets/audio/sfx_step_wood.mp3",
  stepStone: "./assets/audio/sfx_step_stone.mp3",
  stepMetal: "./assets/audio/sfx_step_metal.mp3",
  // update 29: Dirk's farm
  moo: "./assets/audio/sfx_moo.mp3",
  mooAngry: "./assets/audio/sfx_moo_angry.mp3",
  mooDistress: "./assets/audio/sfx_moo_distress.mp3",
  bark: "./assets/audio/sfx_bark.mp3",
  dogHappy: "./assets/audio/sfx_dog_happy.mp3",
  milk: "./assets/audio/sfx_milk.mp3",
  gate: "./assets/audio/sfx_gate.mp3",
  berry: "./assets/audio/sfx_berry.mp3",
  fountain: "./assets/audio/sfx_fountain2.mp3",   // update 30: the restored fountain's full jet
  tap: "./assets/audio/sfx_tap.mp3",                // update 30: the kitchen and bathroom taps
  ladder: "./assets/audio/sfx_ladder.mp3",          // update 31: the attic ladder
  clock: "./assets/audio/sfx_clock.mp3",
  doorCreak: "./assets/audio/sfx_door.mp3",
  elisiaSing: "./assets/audio/sfx_elisia_sing.m4a",   // update 37: her voice in the mist (a loop)
  elisiaLaugh: "./assets/audio/sfx_elisia_laugh.mp3",  // update 37: her laugh, now and then
  elisiaLaughLoop: "./assets/audio/sfx_elisia_laughloop.mp3",   // update 38: the dark form's laughter replaces the singing
  elisiaLaughBig: "./assets/audio/sfx_elisia_laughbig.mp3",     // update 38: when she has eaten a T-Rex
  elisiaChase: "./assets/audio/a_elisia_chase.m4a",              // update 38: her own chase music
  teleport: "./assets/audio/sfx_teleport.mp3",                   // update 38: a portal takes you
};

export class AudioMan {
  constructor() {
    this.ctx = null; this.buf = {}; this.unlocked = false;
    this.musicSrc = null; this.musicGainNode = null; this.currentMusic = null;
    this.nightSrc = null;
  }
  async init() {
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -12; comp.ratio.value = 6;
    // master volume sits AFTER the compressor: one knob rules everything
    this.masterGain = this.ctx.createGain();
    this.volume = Math.min(1, Math.max(0, parseFloat(localStorage.pdVolume ?? "1")));
    this.muted = localStorage.pdMuted === "1";
    this.masterGain.gain.value = this.muted ? 0 : this.volume;
    comp.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);
    this.master = comp;
    this.musicBus = this.ctx.createGain(); this.musicBus.gain.value = CFG.audio.music; this.musicBus.connect(comp);
    this.sfxBus = this.ctx.createGain(); this.sfxBus.gain.value = CFG.audio.sfx; this.sfxBus.connect(comp);
    // load generated clips; a missing clip degrades to silence, never a crash
    await Promise.all(Object.entries(GEN).map(async ([k, url]) => {
      try {
        const r = await fetch(url);
        if (!r.ok) return;
        this.buf[k] = await this.ctx.decodeAudioData(await r.arrayBuffer());
      } catch (e) { /* clip stays silent */ }
    }));
  }
  unlock() {
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
    this.unlocked = true;
  }
  // ---- the sound button + volume rocker (start screen and pause menu) ----
  setVolume(v) {
    this.volume = Math.min(1, Math.max(0, v));
    localStorage.pdVolume = String(this.volume);
    if (this.masterGain && !this.muted) this.masterGain.gain.value = this.volume;
  }
  setMuted(m) {
    this.muted = !!m;
    localStorage.pdMuted = m ? "1" : "0";
    if (this.masterGain) this.masterGain.gain.value = m ? 0 : this.volume;
  }
  play(k, { vol = 1, rate = 1, pan = 0 } = {}) {
    if (!this.ctx || !this.buf[k]) return;
    const s = this.ctx.createBufferSource();
    s.buffer = this.buf[k]; s.playbackRate.value = rate;
    const g = this.ctx.createGain(); g.gain.value = vol;
    let node = g;
    if (pan) { const p = this.ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); node = p; }
    s.connect(g); node.connect(this.sfxBus); s.start();
    return s;
  }
  // positional helper: volume by distance, pan by lateral offset
  play3d(k, dist, side, maxDist, vol = 1, rate = 1) {
    if (dist > maxDist) return;
    const v = vol * Math.pow(1 - dist / maxDist, 1.6);
    this.play(k, { vol: v, pan: Math.max(-0.8, Math.min(0.8, side)), rate });
  }
  music(name) { // "ambient" | "chase" | null — crossfade 1s
    if (this.currentMusic === name || !this.ctx) return;
    this.currentMusic = name;
    const t = this.ctx.currentTime;
    if (this.musicSrc) {
      this.musicGainNode.gain.linearRampToValueAtTime(0, t + 1);
      const old = this.musicSrc; setTimeout(() => { try { old.stop(); } catch (e) {} }, 1200);
      this.musicSrc = null;
    }
    if (name && this.buf[name]) {
      const s = this.ctx.createBufferSource();
      s.buffer = this.buf[name]; s.loop = true;
      const g = this.ctx.createGain(); g.gain.value = 0;
      g.gain.linearRampToValueAtTime(1, t + 1);
      s.connect(g); g.connect(this.musicBus); s.start();
      this.musicSrc = s; this.musicGainNode = g;
    }
  }
  nightLoop(on) { this.nightMix(on ? 1 : 0); }
  // the night chorus rises WITH the dark: k is the darkness factor 0..1,
  // fed every frame — dusk fades the crickets in, dawn fades them out
  nightMix(k) {
    if (!this.ctx) return;
    k = Math.max(0, Math.min(1, k));
    if (k > 0.02 && !this.nightSrc && this.buf.night) {
      const s = this.ctx.createBufferSource();
      s.buffer = this.buf.night; s.loop = true;
      const g = this.ctx.createGain(); g.gain.value = 0;
      s.connect(g); g.connect(this.sfxBus); s.start();
      this.nightSrc = s; this.nightGain = g;
    }
    if (this.nightSrc && this.nightGain) {
      const t = this.ctx.currentTime;
      this.nightGain.gain.cancelScheduledValues(t);
      this.nightGain.gain.setValueAtTime(this.nightGain.gain.value, t);
      this.nightGain.gain.linearRampToValueAtTime(0.5 * k, t + 0.6);
    }
    if (this.nightSrc && k <= 0.02) {
      const src = this.nightSrc, g = this.nightGain;
      this.nightSrc = null; this.nightGain = null;
      if (g) g.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.7);
      try { src.stop(this.ctx.currentTime + 0.8); } catch (e) {}
    }
  }

  // update 28: the hen pen — a looping cluck bed whose loudness the game
  // feeds every frame (distance to the pen, hens alive, walls in between).
  // Same lifecycle as the night chorus: starts on demand, ramps smoothly,
  // stops when it fades out — silent when every hen is gone.
  chickenMix(k) {
    if (!this.ctx) return;
    k = Math.max(0, Math.min(1, k));
    if (k > 0.02 && !this.chSrc && this.buf.chickens) {
      const s = this.ctx.createBufferSource();
      s.buffer = this.buf.chickens; s.loop = true;
      const g = this.ctx.createGain(); g.gain.value = 0;
      s.connect(g); g.connect(this.sfxBus); s.start();
      this.chSrc = s; this.chGain = g;
    }
    if (this.chSrc && this.chGain) {
      const t = this.ctx.currentTime;
      this.chGain.gain.cancelScheduledValues(t);
      this.chGain.gain.setValueAtTime(this.chGain.gain.value, t);
      this.chGain.gain.linearRampToValueAtTime(0.85 * k, t + 0.5);
    }
    if (this.chSrc && k <= 0.02) {
      const src = this.chSrc, g = this.chGain;
      this.chSrc = null; this.chGain = null;
      if (g) g.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.6);
      try { src.stop(this.ctx.currentTime + 0.7); } catch (e) {}
    }
  }

  // ---- procedural feedback sounds (assets.csv row p_sfx) ----
  blip(freq, dur, type = "sine", vol = 0.4, glide = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (glide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + glide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.sfxBus); o.start(t); o.stop(t + dur + 0.02);
  }
  noise(dur, filterFreq, vol = 0.3, type = "lowpass") {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const n = this.ctx.createBufferSource();
    const b = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    n.buffer = b;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    n.connect(f); f.connect(g); g.connect(this.sfxBus); n.start();
  }
  // update 29: generic looping ambience (fountain trickle, clock tick) —
  // the chickenMix lifecycle, keyed by clip name. k = loudness 0..1 per frame.
  loopMix(key, k, peak = 0.8) {
    if (!this.ctx) return;
    k = Math.max(0, Math.min(1, k));
    this.loops = this.loops || {};
    let L = this.loops[key];
    if (k > 0.02 && !L && this.buf[key]) {
      const s = this.ctx.createBufferSource();
      s.buffer = this.buf[key]; s.loop = true;
      const g = this.ctx.createGain(); g.gain.value = 0;
      s.connect(g); g.connect(this.sfxBus); s.start();
      L = this.loops[key] = { src: s, gain: g };
    }
    if (!L) return;
    const t = this.ctx.currentTime;
    L.gain.gain.cancelScheduledValues(t);
    L.gain.gain.setValueAtTime(L.gain.gain.value, t);
    L.gain.gain.linearRampToValueAtTime(peak * k, t + 0.5);
    if (k <= 0.02) {
      this.loops[key] = null;
      L.gain.gain.linearRampToValueAtTime(0, t + 0.6);
      try { L.src.stop(t + 0.7); } catch (e) {}
    }
  }
  // update 36: the desert wind — a slow, breathing rush of filtered noise made
  // in code (no file), fading with k each frame like the night chorus
  windMix(k) {
    if (!this.ctx) return;
    k = Math.max(0, Math.min(1, k));
    if (k > 0.02 && !this.windSrc) {
      const sr = this.ctx.sampleRate, len = sr * 12;
      const b = this.ctx.createBuffer(1, len, sr), d = b.getChannelData(0);
      let v = 0;
      for (let i = 0; i < len; i++) {
        v = v * 0.985 + (Math.random() * 2 - 1) * 0.06;          // brown-ish noise
        const t = i / sr;
        const g = 0.55 + 0.45 * Math.sin(t * 0.7) * Math.sin(t * 0.23 + 1.1);   // gusts
        d[i] = v * g;
      }
      const s = this.ctx.createBufferSource(); s.buffer = b; s.loop = true;
      const f = this.ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 520;
      const g = this.ctx.createGain(); g.gain.value = 0;
      s.connect(f); f.connect(g); g.connect(this.sfxBus); s.start();
      this.windSrc = s; this.windGain = g;
    }
    if (this.windSrc && this.windGain) {
      const t = this.ctx.currentTime;
      this.windGain.gain.cancelScheduledValues(t);
      this.windGain.gain.setValueAtTime(this.windGain.gain.value, t);
      this.windGain.gain.linearRampToValueAtTime(0.9 * k, t + 0.4);
      if (k <= 0.02) { const s = this.windSrc; this.windSrc = null; this.windGain = null; try { s.stop(t + 0.6); } catch (e) {} }
    }
  }
  // positional clip with a procedural stand-in when the file is missing
  s3(key, dist, side, maxDist, vol = 1, fallback = null) {
    if (this.buf[key]) this.play3d(key, dist, side, maxDist, vol);
    else if (fallback) fallback();
  }
  sEat()    { this.noise(0.12, 900, 0.35); this.blip(220, 0.1, "triangle", 0.15, -80); setTimeout(() => this.noise(0.1, 700, 0.3), 140); }
  sDrink()  { this.blip(300, 0.08, "sine", 0.25, 140); setTimeout(() => this.blip(360, 0.08, "sine", 0.25, 120), 120); setTimeout(() => this.blip(420, 0.1, "sine", 0.2, 100), 240); }
  sChest()  { this.noise(0.5, 320, 0.3); this.blip(90, 0.4, "sawtooth", 0.12, 25); }
  sCook()   { this.noise(1.6, 2600, 0.22, "highpass"); }
  sPig()    { this.blip(240, 0.16, "sawtooth", 0.28, -90); setTimeout(() => this.blip(190, 0.12, "sawtooth", 0.22, -60), 160); }
  sChicken(){ this.blip(880, 0.07, "square", 0.16, 120); setTimeout(() => this.blip(760, 0.06, "square", 0.13, 90), 90); }
  sHit()    { this.noise(0.12, 500, 0.45); this.blip(110, 0.12, "triangle", 0.3, -50); }
  sHurt()   { this.blip(160, 0.25, "sawtooth", 0.4, -80); this.noise(0.2, 400, 0.3); }
  sPickup() { this.blip(520, 0.09, "triangle", 0.25, 160); }
  sSelect() { this.blip(340, 0.05, "triangle", 0.15, 40); }
  sGrowl()  { this.blip(70, 0.6, "sawtooth", 0.35, 18); this.noise(0.5, 250, 0.28); }
  sHeart()  { this.blip(55, 0.16, "sine", 0.5, -12); setTimeout(() => this.blip(50, 0.14, "sine", 0.4, -10), 210); }
  sStep(sneak) { this.noise(0.07, sneak ? 500 : 900, sneak ? 0.05 : 0.12); }
  // surface-aware footsteps: generated grass/sand clips, procedural stone/wood
  sStepOn(surface, sneak, running) {
    const vol = sneak ? 0.16 : running ? 0.5 : 0.32;
    const rate = 0.92 + Math.random() * 0.18;
    if (surface === "grass" && this.buf.stepGrass) return this.play("stepGrass", { vol, rate });
    if (surface === "sand" && this.buf.stepSand) return this.play("stepSand", { vol, rate });
    if (surface === "water") {
      if (this.buf.stepWater) return this.play("stepWater", { vol: vol * 1.3, rate });
      return this.noise(0.16, 1400, 0.4, "highpass"); // splash fallback
    }
    // update 28: every floor has its own voice — mountain rock, hut planks,
    // temple stone, container steel
    if (surface === "rock" && this.buf.stepRock) return this.play("stepRock", { vol, rate });
    if (surface === "wood" && this.buf.stepWood) return this.play("stepWood", { vol, rate });
    if (surface === "stone" && this.buf.stepStone) return this.play("stepStone", { vol, rate });
    if (surface === "metal" && this.buf.stepMetal) return this.play("stepMetal", { vol: vol * 1.1, rate });
    this.sStep(sneak);
  }
  sTwig() { this.noise(0.06, 2400, 0.55, "highpass"); this.blip(180, 0.08, "square", 0.3, -120); }
  sDeny()   { this.blip(140, 0.15, "square", 0.2, -40); }
}
