import * as THREE from "three";

// ============================================================================
// update 40: a procedural rig for the Eternials (and any other unrigged, upright
// humanoid GLB): hips, chest, head, two arms, two legs with knees. The bones claim
// vertices by where they sit in the body (the same idea as skeletal.js's creature
// plans), and driveHumanoid() moves them: a calm breath, a slow look-around and a
// weight shift at rest; real strides with swinging arms on the move. Nothing here
// is meant to be lively — the Eternials are a still people.
//
// The source model must stand upright, face +Z, feet at the bottom (what
// normalizeModel() delivers).
// ============================================================================
export function riggedHumanoid(sourceGroup, opts = {}) {
  let srcMesh = null;
  sourceGroup.traverse((o) => { if (o.isMesh && !srcMesh) srcMesh = o; });
  if (!srcMesh) return null;
  srcMesh.updateWorldMatrix(true, false);
  const geo = srcMesh.geometry.clone();
  geo.applyMatrix4(srcMesh.matrixWorld);
  geo.computeBoundingBox();
  const bb = geo.boundingBox, size = new THREE.Vector3(); bb.getSize(size);
  const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
  const H = size.y;
  const hipY = bb.min.y + H * 0.50, chestY = bb.min.y + H * 0.66, neckY = bb.min.y + H * 0.86;
  // update 41: measured on the scans — the torso is 0.12 H wide at the chest, the shoulder joint sits at 0.15 H,
  // the hands hang at 0.42–0.5 H. Claims go by these, not by a share of the model's width: the old 0.21 W
  // shoulder put the hands (below hip height) on the LEG bones — they swung behind the back and stretched.
  const kneeY = bb.min.y + H * 0.27, shoulderX = H * 0.15, elbowY = bb.min.y + H * 0.62, armX = H * 0.133, armLow = bb.min.y + H * 0.36;

  const hips = new THREE.Bone(); hips.position.set(cx, hipY, cz);
  const chest = new THREE.Bone(); chest.position.set(0, chestY - hipY, 0); hips.add(chest);
  const head = new THREE.Bone(); head.position.set(0, neckY - chestY, 0); chest.add(head);
  const shoulderY = bb.min.y + H * 0.78;
  const arms = [-1, 1].map((s) => { const b = new THREE.Bone(); b.position.set(s * shoulderX, shoulderY - chestY, 0); chest.add(b); return b; });
  const fore = arms.map((a, i) => { const b = new THREE.Bone(); b.position.set(0, elbowY - shoulderY, 0); a.add(b); return b; });
  const legs = [-1, 1].map((s) => { const b = new THREE.Bone(); b.position.set(s * size.x * 0.09, 0, 0); hips.add(b); return b; });
  const knees = legs.map((l) => { const b = new THREE.Bone(); b.position.set(0, kneeY - hipY, 0); l.add(b); return b; });
  const bones = [hips, chest, head, arms[0], arms[1], fore[0], fore[1], legs[0], legs[1], knees[0], knees[1]];
  const I = { hips: 0, chest: 1, head: 2, armL: 3, armR: 4, foreL: 5, foreR: 6, legL: 7, legR: 8, kneeL: 9, kneeR: 10 };

  const pos = geo.attributes.position, n = pos.count;
  const idx = new Uint16Array(n * 4), wgt = new Float32Array(n * 4);
  const v = new THREE.Vector3();
  const fade = H * 0.035;
  const blend2 = (i, b1, w1, b2, w2) => { idx[i * 4] = b1; wgt[i * 4] = w1; idx[i * 4 + 1] = b2; wgt[i * 4 + 1] = w2; idx[i * 4 + 2] = 0; wgt[i * 4 + 2] = Math.max(0, 1 - w1 - w2); };
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pos, i);
    const x = v.x - cx, y = v.y;
    if (y > neckY - fade && Math.abs(x) < size.x * 0.2) {        // the head (and the neck ramp)
      const k = Math.min(1, (y - (neckY - fade)) / (2 * fade));
      blend2(i, I.head, k, I.chest, 1 - k);
    } else if (y > armLow && Math.abs(x) > armX && y < neckY + fade) {   // arms: out past the torso, down to the hands
      const s = x < 0 ? 0 : 1;
      // update 43: the whole arm belongs to the arm bone (a 1 cm blend, not 6 — the wide blend left the inner half of the
      // upper arm with the chest and pinched it when the arm turned in); only the shoulder cap fades into the chest
      let k = Math.min(1, (Math.abs(x) - armX) / (H * 0.012));
      if (y > shoulderY - 0.02 * H) k *= Math.max(0, Math.min(1, (neckY + fade - y) / (0.09 * H)));
      if (y < elbowY - fade) blend2(i, I.foreL + s, k, I.armL + s, 0);
      else if (y < elbowY + fade) { const q = (elbowY + fade - y) / (2 * fade); blend2(i, I.foreL + s, k * q, I.armL + s, k * (1 - q)); }
      else blend2(i, I.armL + s, k, I.chest, 1 - k);
    } else if (y < hipY + fade) {                                  // legs: below the hips, left/right by side
      const s = x < 0 ? 0 : 1;
      const k = Math.min(1, (hipY + fade - y) / (2 * fade));
      if (y < kneeY - fade) blend2(i, I.kneeL + s, k, I.legL + s, 0);
      else if (y < kneeY + fade) { const q = (kneeY + fade - y) / (2 * fade); blend2(i, I.kneeL + s, k * q, I.legL + s, k * (1 - q)); }
      else blend2(i, I.legL + s, k, I.hips, 1 - k);
    } else if (y > chestY) {                                       // the chest
      const k = Math.min(1, (y - chestY) / (2 * fade));
      blend2(i, I.chest, k, I.hips, 1 - k);
    } else blend2(i, I.hips, 1, I.hips, 0);
  }
  geo.setAttribute("skinIndex", new THREE.BufferAttribute(idx, 4));
  geo.setAttribute("skinWeight", new THREE.BufferAttribute(wgt, 4));
  const skinned = new THREE.SkinnedMesh(geo, srcMesh.material);
  // update 41: culled like any mesh — a generous sphere around the rest pose (the arms and the stride stay well inside it).
  // frustumCulled=false drew every rigged body every frame, in every direction: 2.3 M triangles that were behind you.
  geo.computeBoundingSphere(); skinned.boundingSphere = geo.boundingSphere.clone(); skinned.boundingSphere.radius *= 1.5;
  skinned.frustumCulled = true; skinned.castShadow = true;
  skinned.add(hips);
  skinned.bind(new THREE.Skeleton(bones));
  const g = new THREE.Group(); g.add(skinned);
  g.userData.hrig = { hips, chest, head, arms, fore, legs, knees, H, hipsY0: hips.position.y, phase: Math.random() * 6.28, look: 0, lookT: 0, lookTarget: 0, shift: 0, shiftT: 2 + Math.random() * 4, shiftTarget: 0, armIn: opts.armIn || 0 };
  return g;
}

// state: "idle" | "walk"; speed in m/s; `faceYaw` = an extra head turn (radians) toward whoever is close
export function driveHumanoid(group, state, speed, dt, headTurn = 0, style = "calm", fx = null) {
  const R = group.userData.hrig;
  if (!R) return;
  const moving = state === "walk" && speed > 0.05;
  const t = performance.now() / 1000;
  if (moving) {
    // strides paced by the distance covered: one full cycle per 1.5 m
    R.phase += dt * (Math.PI * 2 * Math.max(0.4, speed) / 1.5);
    const s = Math.sin(R.phase), c = Math.cos(R.phase);
    const amp = 0.42;
    R.legs[0].rotation.x = s * amp; R.legs[1].rotation.x = -s * amp;
    // the knee folds while the leg swings forward (the foot lifts off the ground)
    R.knees[0].rotation.x = -Math.max(0, c) * 0.55; R.knees[1].rotation.x = -Math.max(0, -c) * 0.55;
    R.arms[0].rotation.x = -s * 0.28; R.arms[1].rotation.x = s * 0.28;
    R.fore[0].rotation.x = -0.25 - Math.max(0, -s) * 0.2; R.fore[1].rotation.x = -0.25 - Math.max(0, s) * 0.2;
    R.hips.position.y = R.hipsY0 + Math.abs(Math.sin(R.phase)) * R.H * 0.012;
    R.hips.rotation.y = s * 0.05; R.chest.rotation.y = -s * 0.06; R.chest.rotation.x = 0.03;
    R.chest.rotation.z = 0;
    R.arms[0].rotation.z = 0.02; R.arms[1].rotation.z = -0.02;
  } else {
    // at rest: a slow breath, a small weight shift every few seconds, a look around
    const relax = Math.min(1, dt * 4);
    for (const b of [...R.legs, ...R.knees, ...R.arms]) { b.rotation.x += (0 - b.rotation.x) * relax; }
    R.fore[0].rotation.x += (-0.12 - R.fore[0].rotation.x) * relax; R.fore[1].rotation.x += (-0.12 - R.fore[1].rotation.x) * relax;
    const breath = Math.sin(t * 1.1 + R.phase);
    R.chest.rotation.x = 0.012 + breath * 0.014;
    R.chest.position.y += 0;
    R.hips.position.y = R.hipsY0 + breath * R.H * 0.003;
    R.shiftT -= dt;
    if (R.shiftT <= 0) { R.shiftT = 4 + Math.random() * 6; R.shiftTarget = (Math.random() - 0.5) * 0.05; }
    R.shift += (R.shiftTarget - R.shift) * Math.min(1, dt * 1.2);
    R.hips.rotation.z = R.shift; R.chest.rotation.z = -R.shift * 0.7;
    R.hips.rotation.y += (0 - R.hips.rotation.y) * relax; R.chest.rotation.y += (0 - R.chest.rotation.y) * relax;
    // arms: a faint sway, a little more for the busy stall keepers
    const sway = style === "busy" ? 0.06 : 0.025;
    R.arms[0].rotation.z = 0.04 + Math.sin(t * 0.8 + R.phase) * sway; R.arms[1].rotation.z = -0.04 - Math.sin(t * 0.8 + R.phase + 1) * sway;
  }
  // update 42: the citizens' scans hold their arms a little wide — armIn (set per rig, 0 for the king and the guards)
  // brings them in to the sides; it is SET on top of this frame's pose, never accumulated
  R.arms[0].rotation.z += R.armIn; R.arms[1].rotation.z -= R.armIn;
  // update 44: the guards fight — poses laid over this frame's idle/walk pose, driven by a 0..1 progress each.
  // attack: the weapon arm (right) winds up over the head, the chest coils back, then the blow sweeps down and
  // forward as the chest and hips unwind, the shield arm up; then it recovers. block: both arms snap up in front,
  // the chest leans back, the knees give a little, then it eases out.
  if (fx) {
    if (fx.attack > 0) {
      const k = fx.attack;
      let sw, ch, tw;
      if (k < 0.42) { const q = k / 0.42, e = q * q; sw = -2.6 * e; ch = -0.16 * e; tw = 0.4 * e; }
      else if (k < 0.62) { const q = (k - 0.42) / 0.2; sw = -2.6 + 2.2 * q; ch = -0.16 + 0.42 * q; tw = 0.4 - 0.85 * q; }
      else { const q = (k - 0.62) / 0.38; sw = -0.4 * (1 - q); ch = 0.26 * (1 - q); tw = -0.45 * (1 - q); }
      R.arms[1].rotation.x = sw; R.arms[1].rotation.z = -0.3 - R.armIn; R.fore[1].rotation.x = k < 0.42 ? -1.0 : -0.25;
      R.arms[0].rotation.x = -0.9; R.fore[0].rotation.x = -1.1; R.arms[0].rotation.z = 0.35 + R.armIn;
      R.chest.rotation.x = ch; R.chest.rotation.y = tw; R.hips.rotation.y = tw * 0.45;
      R.legs[0].rotation.x = -0.28; R.legs[1].rotation.x = 0.22; R.knees[0].rotation.x = -0.3;
    }
    if (fx.block > 0) {
      const e = Math.sin(Math.min(1, fx.block) * Math.PI);
      R.arms[0].rotation.x = -1.55 * e; R.fore[0].rotation.x = -1.35 * e; R.arms[0].rotation.z = 0.25 * e + R.armIn;
      R.arms[1].rotation.x = -1.25 * e; R.fore[1].rotation.x = -1.2 * e; R.arms[1].rotation.z = -0.25 * e - R.armIn;
      R.chest.rotation.x = -0.24 * e; R.hips.position.y = R.hipsY0 - R.H * 0.022 * e;
      R.knees[0].rotation.x = -0.35 * e; R.knees[1].rotation.x = -0.35 * e; R.legs[0].rotation.x = 0.18 * e; R.legs[1].rotation.x = 0.18 * e;
    }
  }
  // the head: turns toward a visitor, otherwise glances around slowly
  R.lookT -= dt;
  if (R.lookT <= 0) { R.lookT = 3 + Math.random() * 5; R.lookTarget = (Math.random() - 0.5) * 0.5; }
  R.look += (R.lookTarget - R.look) * Math.min(1, dt * 0.9);
  const want = headTurn !== 0 ? Math.max(-0.7, Math.min(0.7, headTurn)) : R.look;
  R.head.rotation.y += (want - R.head.rotation.y) * Math.min(1, dt * 3);
  R.head.rotation.x = Math.sin(t * 0.5 + R.phase) * 0.02 + (fx && fx.block > 0 ? 0.22 * Math.sin(Math.min(1, fx.block) * Math.PI) : 0);
}
