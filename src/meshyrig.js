import * as THREE from "three";

// ============================================================================
// update 85: a LIVING driver for the Meshy-rigged humanoids (the Bone Mentor, the
// four chained prisoners, Hendrik). Their GLBs carry a real skeleton - Hips,
// Spine/Spine01/Spine02, neck, Head, Left/Right Shoulder-Arm-ForeArm-Hand,
// Left/Right UpLeg-Leg-Foot - but only a 0.03 s rest clip, so ClipAnimator loops
// a statue. This drives the named bones from the bind pose every frame, turning
// each about WORLD axes (his right, up, forward - the Eternius miner's trick), so
// the rig's own bone axes never matter.
//   at rest: breath, a weight shift every few seconds, a look at whoever is near
//   moving:  strides with folding knees, swinging arms, hips and chest counter-twist
//   asked:   hanging heads and sobs (the sad prisoners), chain tugs and a wind-up
//            and blow (the angry ones), the mentor's spear wind-up, claw and slam.
// Every pose number is eased toward its target, so moods and attacks flow instead
// of snapping. Angle rule (world axes, right-handed, verified on Tessa's arms): about
// his RIGHT, a limb that hangs down swings FORWARD with +, the trunk and head tip
// forward with -; about UP, + turns him to his LEFT; about FORWARD, + swings a hanging
// arm toward his LEFT and lifts his left shoulder (so spreadL < 0 brings the left arm
// in, spreadR > 0 the right).
// ============================================================================

const NEED = ["Hips", "Head", "LeftUpLeg", "RightUpLeg", "LeftArm", "RightArm"];

export function restOnly(anims) { return !!(anims && anims.length) && anims.every((a) => a.duration < 0.2); }

export function meshyRig(body, fwd = 1) {
  const B = {}; body.traverse((o) => { if (o.isBone && !B[o.name]) B[o.name] = o; });
  for (const n of NEED) if (!B[n]) return null;
  const Q0 = {}; for (const k in B) Q0[k] = B[k].quaternion.clone();
  const R = { B, Q0, fwd, hipsY0: B.Hips.position.y, phase: Math.random() * Math.PI * 2, shift: 0, shiftT: 1 + Math.random() * 3, shiftTarget: 0, lookT: 0, lookDir: 0, P: {} };
  body.userData.mrig = R;
  return R;
}

const qb = new THREE.Quaternion(), pw = new THREE.Quaternion(), pinv = new THREE.Quaternion(), qa = new THREE.Quaternion();
const F = new THREE.Vector3(), U = new THREE.Vector3(0, 1, 0), RT = new THREE.Vector3(), pa = new THREE.Vector3(), pb = new THREE.Vector3();
function turn(b, axis, ang) {
  if (!b || !ang) return;
  qa.setFromAxisAngle(axis, ang);
  b.parent.getWorldQuaternion(pw); pinv.copy(pw).invert();
  b.quaternion.premultiply(pw).premultiply(qa).premultiply(pinv);
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// o: { state: "idle"|"walk", speed (m/s), h (height m), headTurn (rad, + = his left), headPitch (rad, + = down),
//      mood: "calm"|"sad"|"angry", sob (0..1), tel (0..1 wind-up of a blow), fx: { kind: "spear"|"hands"|"slam", k: 0..1 },
//      style: "calm"|"busy", rate (ease speed) }
export function driveMeshy(body, dt, o = {}) {
  const Rg = body.userData.mrig; if (!Rg) return;
  const B = Rg.B, Q0 = Rg.Q0, P = Rg.P, t = performance.now() / 1000, h = o.h || 1.75;
  for (const k in Q0) B[k].quaternion.copy(Q0[k]);
  body.getWorldQuaternion(qb); F.set(0, 0, Rg.fwd).applyQuaternion(qb); F.y = 0; F.normalize(); RT.crossVectors(F, U).normalize();
  const moving = o.state === "walk" && (o.speed || 0) > 0.05;
  const ease = Math.min(1, dt * (o.rate || 6));
  const want = (k, v) => { if (P[k] === undefined) P[k] = v; P[k] += (v - P[k]) * ease; return P[k]; };

  // ---- the look: at whoever is near, else a slow glance around
  Rg.lookT -= dt; if (Rg.lookT <= 0) { Rg.lookT = 2.5 + Math.random() * 4; Rg.lookDir = (Math.random() - 0.5) * 0.9; }
  const lookY = want("lookY", o.headTurn !== undefined && o.headTurn !== null ? clamp(o.headTurn, -1.1, 1.1) : Rg.lookDir);
  const lookP = want("lookP", o.headPitch || 0);

  // ---- legs, arms, trunk
  let legL = 0, legR = 0, kneeL = 0, kneeR = 0, armL = 0, armR = 0, foreL = 0.15, foreR = 0.15, spreadL = 0, spreadR = 0;
  let lean = 0, twist = 0, hipTwist = 0, roll = 0, bob = 0, chestFwd = 0, shrugL = 0, shrugR = 0, headExtra = 0;
  if (moving) {
    const stride = 0.85 * h;
    Rg.phase += dt * Math.PI * 2 * Math.max(0.3, o.speed) / stride;
    const s = Math.sin(Rg.phase), c = Math.cos(Rg.phase);
    legL = s * 0.48; legR = -s * 0.48;
    kneeL = -Math.max(0, c) * 0.7; kneeR = -Math.max(0, -c) * 0.7;
    armL = -s * 0.32; armR = s * 0.32; foreL = 0.22 + Math.max(0, -s) * 0.15; foreR = 0.22 + Math.max(0, s) * 0.15;
    lean = -0.07; hipTwist = s * 0.07; twist = -s * 0.1; bob = Math.abs(s) * 0.03; roll = s * 0.025;
  } else {
    const breath = Math.sin(t * 1.1 + Rg.phase);
    chestFwd = -(0.015 + breath * 0.028); bob = breath * 0.005; shrugL = shrugR = 0.02 + breath * 0.03; headExtra = -breath * 0.03;
    Rg.shiftT -= dt; if (Rg.shiftT <= 0) { Rg.shiftT = 4 + Math.random() * 6; Rg.shiftTarget = (Math.random() - 0.5) * 0.06; }
    Rg.shift += (Rg.shiftTarget - Rg.shift) * Math.min(1, dt * 1.2); roll = Rg.shift;
    const sway = o.style === "busy" ? 0.06 : 0.03;
    spreadL = Math.sin(t * 0.8 + Rg.phase) * sway; spreadR = -Math.sin(t * 0.8 + Rg.phase + 1) * sway;
  }
  // ---- the Meshy rigs rest with the arms out (an A-pose, or Hendrik's full T-pose): measured once from the bind pose,
  // the arms are brought in to hang ~0.25 rad from the sides, whatever the scan's own angle
  if (Rg.armRest === undefined) { Rg.armRest = 0; if (B.LeftHand) { B.LeftArm.getWorldPosition(pa); B.LeftHand.getWorldPosition(pb); pb.sub(pa); const len = pb.length(); if (len > 1e-6) Rg.armRest = Math.acos(clamp(-pb.y / len, -1, 1)); } }
  const armIn = o.armIn === undefined ? Math.max(0, Rg.armRest - 0.25) : o.armIn; spreadL -= armIn; spreadR += armIn;
  // ---- the moods of the chained
  if (o.mood === "sad") {
    headExtra = 0.42; chestFwd -= 0.16; armL += 0.12; armR += 0.12; foreL = 0.35; foreR = 0.35; shrugL = 0.08; shrugR = 0.08; spreadL -= 0.12; spreadR += 0.12;
    const sob = o.sob || 0; if (sob > 0.01) { const j = Math.max(0, Math.sin(t * 15)); chestFwd -= 0.12 * sob * j; shrugL += 0.14 * sob * j; shrugR += 0.14 * sob * j; headExtra += 0.1 * sob * j; }
  } else if (o.mood === "angry") {
    const tug = Math.pow(Math.max(0, Math.sin(t * 2.4 + Rg.phase)), 6);
    headExtra = -0.12; lean -= 0.2 - 0.3 * tug; armL += 1.0 - 0.6 * tug; armR += 1.0 - 0.6 * tug; foreL = 0.9; foreR = 0.9; spreadL += 0.35; spreadR -= 0.35;
    roll += Math.sin(t * 2.4 + Rg.phase) * 0.03;
    const tel = o.tel || 0; if (tel > 0) { const k = tel * tel; armL += 1.6 * k; armR += 1.6 * k; lean += 0.35 * k; headExtra -= 0.2 * k; }
  }
  // ---- the mentor's attacks (laid over the gait)
  const fx = o.fx; if (fx && fx.kind) {
    const k = clamp(fx.k || 0, 0, 1), e = k * k * (3 - 2 * k);
    if (fx.kind === "spear") { armR -= 2.4 * e; foreR = 0.6; twist -= 0.45 * e; lean += 0.1 * e; armL += 0.5 * e; const sh = Math.sin(t * 42) * 0.1 * e; foreR += sh; foreL += sh * 0.6; }
    else if (fx.kind === "hands") { armL += 0.9 * e; armR += 0.9 * e; spreadL += 0.5 * e; spreadR -= 0.5 * e; foreL = 0.4; foreR = 0.4; lean -= 0.3 * e; headExtra += 0.35 * e; }
    else if (fx.kind === "slam") { armL += 2.7 * e; armR += 2.7 * e; foreL = 0.3; foreR = 0.3; lean += 0.25 * e; headExtra -= 0.25 * e; bob += 0.02 * e; }
  }

  // ---- lay it on the bones, root first (turn() reads fresh parent frames)
  B.Hips.position.y = Rg.hipsY0 * (1 + want("bob", bob));
  turn(B.Hips, U, want("hipTwist", hipTwist)); turn(B.Hips, F, want("roll", roll));
  turn(B.Spine, RT, want("lean", lean)); turn(B.Spine02 || B.Spine01 || B.Spine, F, -want("roll2", roll) * 0.7);
  turn(B.Spine01 || B.Spine, RT, want("chest", chestFwd)); turn(B.Spine02 || B.Spine01 || B.Spine, U, want("twist", twist));
  turn(B.LeftShoulder, F, want("shrugL", shrugL)); turn(B.RightShoulder, F, -want("shrugR", shrugR));
  turn(B.LeftUpLeg, RT, want("legL", legL)); turn(B.RightUpLeg, RT, want("legR", legR));
  turn(B.LeftLeg, RT, want("kneeL", kneeL)); turn(B.RightLeg, RT, want("kneeR", kneeR));
  turn(B.LeftArm, RT, want("armL", armL)); turn(B.RightArm, RT, want("armR", armR));
  turn(B.LeftArm, F, want("spreadL", spreadL)); turn(B.RightArm, F, want("spreadR", spreadR));
  turn(B.LeftForeArm, RT, want("foreL", foreL)); turn(B.RightForeArm, RT, want("foreR", foreR));
  const hp = lookP + want("headX", headExtra);
  turn(B.neck, U, lookY * 0.4); turn(B.neck, RT, -hp * 0.35);
  turn(B.Head, U, lookY * 0.6); turn(B.Head, RT, -hp * 0.65);
}
