import * as THREE from "three";

// Animation layer for creatures.
// - Rigged GLBs (Meshy 3d_rigging output — werewolf): AnimationMixer + crossfades.
// - Non-humanoids (T-Rex, pig, chicken — the humanoid auto-rig rejects them):
//   a procedural bone chain built at load time with distance-based weights,
//   legs/neck/tail driven by sine gait in code (the verified procedural branch,
//   done in-engine).

const FADE = 0.22;

export class ClipAnimator {
  constructor(root, animations) {
    this.mixer = new THREE.AnimationMixer(root);
    this.actions = {};
    for (const clip of animations) {
      const n = clip.name.toLowerCase();
      let key = null;
      if (n.includes("sitdown") || n.includes("stand_to_sit")) key = "sitDown";
      else if (n.includes("standup") || n.includes("sit_to_stand")) key = "standUp";
      else if (n.includes("sitidle") || n.includes("chair_sit")) key = "sitIdle";
      else if (n.includes("walk")) key = "walk";
      else if (n.includes("run") || n.includes("fast")) key = "run";
      else if (n.includes("attack") || n.includes("slash") || n.includes("punch")) key = "attack";
      else if (n.includes("idle")) key = "idle";
      if (!key && !this.actions.walk) key = "walk";
      if (key && !this.actions[key]) this.actions[key] = this.mixer.clipAction(clip);
    }
    if (this.actions.attack) {
      this.actions.attack.setLoop(THREE.LoopOnce);
      this.actions.attack.clampWhenFinished = false;
    }
    this.current = null;
  }
  drive(state, speed, gait, dt) {
    let want = this.actions[state] ? state : (state === "run" ? "walk" : "idle");
    if (!this.actions[want]) want = "walk";
    const act = this.actions[want];
    if (act && this.current !== act) {
      act.reset().fadeIn(FADE).play();
      if (this.current) this.current.fadeOut(FADE);
      this.current = act;
    }
    if (act) {
      if (want === "walk" || want === "run") {
        const clipLen = act.getClip().duration;
        act.timeScale = Math.max(0.4, speed * gait * clipLen);
      } else act.timeScale = 1;
    }
    this.mixer.update(dt);
  }
  playAttack() {
    const a = this.actions.attack;
    if (!a) return false;
    a.reset().setEffectiveWeight(1).fadeIn(0.06).play();
    setTimeout(() => a.fadeOut(0.2), Math.max(200, (a.getClip().duration - 0.2) * 1000));
    return true;
  }
  // play a transition clip once and hold the final pose; returns its duration
  playOnce(key) {
    const a = this.actions[key];
    if (!a) return 0;
    if (this.current) { this.current.fadeOut(FADE); this.current = null; }
    a.reset().setLoop(THREE.LoopOnce);
    a.clampWhenFinished = true;
    a.fadeIn(0.1).play();
    this.current = a;
    return a.getClip().duration;
  }
  update(dt) { this.mixer.update(dt); }
}

// ---- procedural creature rigs (model faces +Z after normalization) ----
// Bone layout per body plan; weights assigned by vertex position.
const PLANS = {
  // theropod: two legs under the hips, long neck+head forward, heavy tail back
  trex: {
    legs: [[-0.16, 0.42], [0.16, 0.42]],   // [xFrac of width, zFrac of length]
    legR: 0.34, hipFrac: 0.52,
    head: { zFrac: 0.62, yFrac: 0.42 },    // verts beyond this are neck/head
    tail: { zFrac: 0.30 },                  // verts behind this are tail
    gait: { freq: 2.6, legAmp: 0.5, neckAmp: 0.09, tailAmp: 0.16 },
  },
  pig: {
    legs: [[-0.22, 0.72], [0.22, 0.72], [-0.22, 0.25], [0.22, 0.25]],
    legR: 0.30, hipFrac: 0.45,
    head: { zFrac: 0.80, yFrac: 0.3 },
    tail: null,
    gait: { freq: 3.4, legAmp: 0.55, neckAmp: 0.07, tailAmp: 0 },
  },
  chicken: {
    legs: [[-0.18, 0.45], [0.18, 0.45]],
    legR: 0.30, hipFrac: 0.42,
    head: { zFrac: 0.60, yFrac: 0.55 },
    tail: null,
    gait: { freq: 5.5, legAmp: 0.6, neckAmp: 0.16, tailAmp: 0 },
  },
  croc: {
    legs: [[-0.28, 0.68], [0.28, 0.68], [-0.28, 0.32], [0.28, 0.32]],
    legR: 0.30, hipFrac: 0.62,
    head: { zFrac: 0.76, yFrac: 0.2 },
    tail: { zFrac: 0.28 },
    gait: { freq: 4.2, legAmp: 0.42, neckAmp: 0.04, tailAmp: 0.34 },
  },
};
PLANS.mother = PLANS.trex; // the mother is a T-Rex, twice the size
PLANS.remotus = PLANS.trex; PLANS.altai = PLANS.trex;   // update 36: the desert's theropods walk the same way
// the guardian: theropod plan, but the long tail gets a SECOND bone so it
// bends and follows through instead of sweeping like a plank
PLANS.spino = {
  ...PLANS.trex,
  legs: [[-0.14, 0.44], [0.14, 0.44]],
  // legTight: a leg bone may only claim verts CLOSE to its anchor in x AND z.
  // The 0.45 whole-body radius was grabbing the BELLY — the split-in-two shear.
  legR: 0.3, legTight: { x: 0.4, z: 0.11, zFoot: 0.26 },
  tail: { zFrac: 0.34 }, tail2: true,
  // a giant strides SLOWLY — the old trex cadence read as puppet legs.
  // lift: the swinging foot rises off the ground — a FRACTION of body height
  // (update 23: 0.22m absolute vanished on a six-meter guardian)
  // ankle (update 24): a FOOT bone under each leg counter-rotates so the foot
  // stays FLAT on the ground through the stride.
  // knee (update 27): a SHIN bone between hip and foot flexes during the
  // swing — the leg finally folds and steps instead of swinging in one piece
  ankle: 0.1, knee: 0.3,
  gait: { freq: 1.7, legAmp: 0.55, neckAmp: 0.06, tailAmp: 0.2, lift: 0.1, kneeAmp: 0.65 },
};
PLANS.spinobaby = PLANS.trex;
// update 39: the Imperator — a T-Rex whose small arms (shrunk in the mesh) stay pinned to the body:
// the box in front of the chest is fenced off from both the neck and the legs
PLANS.imperator = { ...PLANS.trex, armFence: { y0: 0.26, y1: 0.68, z0: 0.62, z1: 0.9 } };
PLANS.goat = PLANS.pig; // the mountain herd: same four-legged plan
PLANS.trike = {         // the battering ram: quadruped with a heavy tail
  legs: [[-0.24, 0.7], [0.24, 0.7], [-0.24, 0.28], [0.24, 0.28]],
  // legTight fences each leg's claim. x must stay UNDER the leg spacing
  // (0.24) — at 0.34 the two claims met at the midline and the whole
  // underbelly swung along with the legs: the glued-together walk.
  legR: 0.26, legTight: { x: 0.14, z: 0.1, zFoot: 0.2 }, hipFrac: 0.48,
  head: { zFrac: 0.78, yFrac: 0.3 },
  tail: { zFrac: 0.22 },
  ankle: 0.12, knee: 0.28,   // flat feet + folding knees (see spino note)
  // lift (fraction of body height): each diagonal pair steps OFF the ground —
  // hip rotation alone read as four columns sliding in place
  gait: { freq: 2.4, legAmp: 0.5, neckAmp: 0.04, tailAmp: 0.15, lift: 0.08, kneeAmp: 0.28 },
};
// update 29: the dairy cow — a boxy quadruped with long legs and a thin tail
// update 30: `autoLegs` plans find their four legs IN THE MESH (k-means on the vertices
// below the knee, seeded by the nominal anchors) and fence each leg's claim by that
// leg's own measured spread — the update-29 fixed fractions missed the cow's real
// legs almost entirely (10-80 verts per leg out of 5170: the "statue" cows).
// `stride` = metres per gait cycle: the cadence follows the distance covered, so a
// trotting dog's legs actually churn instead of drifting at one slow beat.
PLANS.cow = {
  legs: [[-0.22, 0.74], [0.22, 0.74], [-0.22, 0.24], [0.22, 0.24]],
  legR: 0.3, hipFrac: 0.5, autoLegs: true,
  head: { zFrac: 0.8, yFrac: 0.35 },
  tail: { zFrac: 0.1 },
  ankle: 0.14, knee: 0.3,
  gait: { freq: 2.2, stride: 1.5, legAmp: 0.45, neckAmp: 0.06, tailAmp: 0.3, lift: 0.08, kneeAmp: 0.35 },
};
// Duco the Dutch shepherd: a lean dog, quick stride, expressive tail
PLANS.dog = {
  legs: [[-0.2, 0.75], [0.2, 0.75], [-0.2, 0.25], [0.2, 0.25]],
  // update 31: Duco was photographed with his head turned toward the camera, so the
  // MESH carried that turn. update 34: the head turn is now straightened in the model
  // file itself by tools/glb_straighten_head.py (duco.glb IS a forward-looking dog), so
  // autoHeadYaw is off and no runtime solve runs; headYaw0 stays 0 and the glance code
  // in driveCreature is all that moves the head.
  legR: 0.32, hipFrac: 0.55, autoLegs: true, autoHeadYaw: false,
  head: { zFrac: 0.78, yFrac: 0.45 },
  tail: { zFrac: 0.14 },
  ankle: 0.14, knee: 0.3,
  gait: { freq: 3.6, stride: 0.85, legAmp: 0.55, neckAmp: 0.1, tailAmp: 0.6, lift: 0.1, kneeAmp: 0.45 },
};

// k-means in the xz plane over the vertices below the knee line: returns, per leg,
// the centroid (the anchor) and the 90th-percentile half-spread in x and z
function legsFromMesh(pos, bb, size, plan, seeds) {
  const kneeY = bb.min.y + size.y * ((plan.knee || 0.3) * 1.15);
  const pts = [];
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    if (v.y < kneeY) pts.push([v.x, v.z]);
  }
  const k = seeds.length;
  const cents = seeds.map((s) => [s.x, s.z]);
  const assign = new Int8Array(pts.length);
  for (let it = 0; it < 12; it++) {
    const sum = cents.map(() => [0, 0, 0]);
    for (let i = 0; i < pts.length; i++) {
      let best = 0, bd = 1e9;
      for (let c = 0; c < k; c++) {
        const d = (pts[i][0] - cents[c][0]) ** 2 + (pts[i][1] - cents[c][1]) ** 2;
        if (d < bd) { bd = d; best = c; }
      }
      assign[i] = best;
      sum[best][0] += pts[i][0]; sum[best][1] += pts[i][1]; sum[best][2]++;
    }
    for (let c = 0; c < k; c++) if (sum[c][2] >= 12) cents[c] = [sum[c][0] / sum[c][2], sum[c][1] / sum[c][2]];
  }
  return cents.map((c, ci) => {
    const dx = [], dz = [];
    for (let i = 0; i < pts.length; i++) if (assign[i] === ci) { dx.push(Math.abs(pts[i][0] - c[0])); dz.push(Math.abs(pts[i][1] - c[1])); }
    dx.sort((a, b) => a - b); dz.sort((a, b) => a - b);
    const p90 = (a) => (a.length ? a[Math.min(a.length - 1, Math.floor(a.length * 0.9))] : 0);
    return { x: c[0], z: c[1], n: dx.length, hx: p90(dx), hz: p90(dz) };
  });
}

export function riggedCreature(sourceGroup, type) {
  const plan = PLANS[type];
  if (!plan) return null;
  let srcMesh = null;
  sourceGroup.traverse((o) => { if (o.isMesh && !srcMesh) srcMesh = o; });
  if (!srcMesh) return null;

  srcMesh.updateWorldMatrix(true, false);
  const geo = srcMesh.geometry.clone();
  geo.applyMatrix4(srcMesh.matrixWorld);
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const size = new THREE.Vector3(); bb.getSize(size);
  const cx = (bb.min.x + bb.max.x) / 2;
  const hipY = bb.min.y + size.y * plan.hipFrac;
  const legR = Math.max(size.x, size.z) * plan.legR;
  const anchors = plan.legs.map(([xf, zf]) =>
    new THREE.Vector3(cx + size.x * xf, hipY, bb.min.z + size.z * zf));
  // update 30: the mesh knows where its legs are — move the anchors onto them
  let legFence = null;
  if (plan.autoLegs) {
    const found = legsFromMesh(geo.attributes.position, bb, size, plan, anchors);
    legFence = found.map((f) => ({
      x: Math.max(size.x * 0.06, f.hx * 1.35 + size.x * 0.02),
      z: Math.max(size.z * 0.03, f.hz * 1.35 + size.z * 0.02),
    }));
    found.forEach((f, i) => { if (f.n >= 12) anchors[i].set(f.x, hipY, f.z); });
  }
  const headZ = bb.min.z + size.z * plan.head.zFrac;
  const headY = bb.min.y + size.y * plan.head.yFrac;
  const tailZ = plan.tail ? bb.min.z + size.z * plan.tail.zFrac : null;

  const spine = new THREE.Bone();
  spine.position.set(cx, hipY, (bb.min.z + bb.max.z) / 2);
  const head = new THREE.Bone();
  head.position.set(0, headY - hipY, headZ - spine.position.z);
  spine.add(head);
  const bones = [spine, head];
  let tail = null, tail2 = null, tail2Z = null;
  if (tailZ !== null) {
    tail = new THREE.Bone();
    tail.position.set(0, 0, tailZ - spine.position.z);
    spine.add(tail);
    bones.push(tail);
    if (plan.tail2) {
      // second segment halfway to the tail tip — the whip that follows through
      tail2Z = bb.min.z + (tailZ - bb.min.z) * 0.45;
      tail2 = new THREE.Bone();
      tail2.position.set(0, 0, tail2Z - tailZ);
      tail.add(tail2);
      bones.push(tail2);
    }
  }
  const legs = anchors.map((a) => {
    const b = new THREE.Bone();
    b.position.copy(a).sub(spine.position);
    spine.add(b);
    bones.push(b);
    return b;
  });
  // knee bones (update 27): a SHIN segment between hip and foot — it flexes
  // during the swing so the leg folds like a real leg instead of a pendulum
  const kneeY = plan.knee ? bb.min.y + size.y * plan.knee : null;
  const knees = plan.knee ? legs.map((leg) => {
    const b = new THREE.Bone();
    b.position.set(0, kneeY - hipY, 0);
    leg.add(b);
    bones.push(b);
    return b;
  }) : null;
  // ankle bones (update 24): one per leg, sitting at foot height — they
  // counter-rotate in driveCreature so the foot stays flat on the ground
  const ankleY = plan.ankle ? bb.min.y + size.y * plan.ankle : null;
  const ankles = plan.ankle ? legs.map((leg, i) => {
    const b = new THREE.Bone();
    const parent = knees ? knees[i] : leg;
    b.position.set(0, ankleY - (knees ? kneeY : hipY), 0);
    parent.add(b);
    bones.push(b);
    return b;
  }) : null;
  // update 31: which way does the MESH's head point? Average the head cluster's
  // offset from the neck base, weighted toward the muzzle (the far end). A head
  // scanned mid-turn reads as a yaw here, and driveCreature subtracts it.
  let headYaw0 = 0;
  let muzzle = null;                  // update 32: which vertices the muzzle owns
  if (plan.autoHeadYaw) {
    // the muzzle is the head's far end: collect the head cluster, keep the 5% that
    // reach furthest from the neck base in the ground plane, and average THEIR
    // direction. Averaging the whole head instead just re-finds the neck.
    // update 33c: the NOSE is the most forward part of a dog — take the head
    // cluster's top 5% by z. Ranking by distance from the neck base picked the
    // far edge of the SHOULDER on a wide, off-centre front, and every "head
    // forward" fix since update 31 was straightening the shoulder instead.
    // The head's direction runs from the skull top (ears — nothing else on a
    // dog is that high) to the nose; that is what gets zeroed.
    const p0 = geo.attributes.position, vv = new THREE.Vector3();
    const pts = [];
    let skx = 0, skz = 0, skn = 0;
    for (let i = 0; i < p0.count; i++) {
      vv.fromBufferAttribute(p0, i);
      if (vv.y > size.y * 0.8) { skx += vv.x; skz += vv.z; skn++; }
      if (vv.z <= headZ || vv.y <= headY - size.y * 0.1) continue;
      pts.push([vv.z, vv.x, i]);
    }
    if (pts.length > 40 && skn > 8) {
      pts.sort((a, b) => b[0] - a[0]);
      const n = Math.max(8, Math.floor(pts.length * 0.05));
      let sx = 0, sz = 0;
      for (let i = 0; i < n; i++) { sx += pts[i][1]; sz += pts[i][0]; }
      const a = Math.atan2(sx / n - skx / skn, sz / n - skz / skn);
      if (Math.abs(a) > 0.03 && Math.abs(a) < 1.2) {
        headYaw0 = a;
        muzzle = [];
        for (let i = 0; i < n; i++) muzzle.push(pts[i][2]);
      }
    }
  }
  const legBase = bones.indexOf(legs[0]);
  const tailIdx = tail ? bones.indexOf(tail) : -1;
  const tail2Idx = tail2 ? bones.indexOf(tail2) : -1;

  const pos = geo.attributes.position;
  const idx = new Uint16Array(pos.count * 4);
  const wgt = new Float32Array(pos.count * 4);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    let bone = 0, blend = 1;
    let bone2 = 0, w2 = 0;   // optional second influence (shin, across the ankle)
    const af = plan.armFence;
    const inArm = !!af && v.y > bb.min.y + size.y * af.y0 && v.y < bb.min.y + size.y * af.y1 && v.z > bb.min.z + size.z * af.z0 && v.z < bb.min.z + size.z * af.z1;
    // legs: below the hips, near a leg anchor
    if (v.y < hipY) {
      let best = -1, bd = 1e9;
      for (let l = 0; l < anchors.length; l++) {
        const d = Math.hypot(v.x - anchors[l].x, v.z - anchors[l].z);
        if (d < bd) { bd = d; best = l; }
      }
      // tight plans also fence the claim laterally and along the body axis —
      // keeps belly and arm verts on the spine where they belong.
      // Update 28: at FOOT level the claim reaches further FORWARD (zFoot) —
      // the toes. The old fence cut them off onto the spine, so the foot
      // lifted while its toes stayed nailed to the ground: the "glued foot".
      // Forward only — the tail (behind) and belly (above) keep the old fence.
      const t = plan.legTight;
      const dzz = (t || legFence) ? v.z - anchors[best].z : 0;
      const footLvl = ankleY !== null && v.y < ankleY + size.y * 0.08;
      const zLim = t ? ((footLvl && dzz > 0 && t.zFoot) ? t.zFoot : t.z) : 0;
      let tightOk = !t || (Math.abs(v.x - anchors[best].x) < size.x * t.x
        && dzz > -size.z * t.z && dzz < size.z * zLim);
      if (legFence) {
        // update 30: the leg's own measured spread, widening toward the hip where
        // the thigh flares — the toes reach a little further forward at foot level
        const f = legFence[best];
        const up = kneeY !== null ? Math.min(1, Math.max(0, (v.y - kneeY) / Math.max(0.01, hipY - kneeY))) : 0;
        const widen = 1 + 0.8 * up;
        tightOk = Math.abs(v.x - anchors[best].x) < f.x * widen
          && dzz > -f.z * widen && dzz < f.z * widen * (footLvl && dzz > 0 ? 1.4 : 1);
      }
      if (bd < legR && tightOk && !inArm) {
        blend = Math.min(1, (hipY - v.y) / (size.y * 0.12));
        const thighB = legBase + best;
        const kneeB = knees ? bones.indexOf(knees[best]) : -1;
        const ankleB = ankles ? bones.indexOf(ankles[best]) : -1;
        const fade = size.y * 0.04;
        // walk down the chain: thigh above the knee, shin between the joints,
        // foot below the ankle — fading across each joint line
        if (ankleB >= 0 && v.y < ankleY + fade) {
          const k = Math.min(1, (ankleY + fade - v.y) / (2 * fade));
          bone = ankleB;
          bone2 = kneeB >= 0 ? kneeB : thighB;
          w2 = blend * (1 - k);
          blend = blend * k;
        } else if (kneeB >= 0 && v.y < kneeY + fade) {
          const k = Math.min(1, (kneeY + fade - v.y) / (2 * fade));
          bone = kneeB;
          bone2 = thighB;
          w2 = blend * (1 - k);
          blend = blend * k;
        } else {
          bone = thighB;
        }
      }
    }
    // neck/head: forward and high. A plan that cancels a baked-in head turn hands
    // the neck a long ramp, so 45 degrees of correction bends instead of pinching.
    if (bone === 0 && !inArm && v.z > headZ && v.y > headY - size.y * 0.1) {
      bone = 1;
      blend = Math.min(1, (v.z - headZ) / (size.z * (plan.autoHeadYaw ? 0.22 : 0.08)));
    }
    // tail: rear (with the optional second segment past the halfway mark)
    if (bone === 0 && tailIdx > 0 && v.z < tailZ) {
      if (tail2Idx > 0 && v.z < tail2Z) {
        bone = tail2Idx;
        blend = Math.min(1, (tail2Z - v.z) / (size.z * 0.08));
      } else {
        bone = tailIdx;
        blend = Math.min(1, (tailZ - v.z) / (size.z * 0.1));
      }
    }
    idx[i * 4] = bone; wgt[i * 4] = blend;
    idx[i * 4 + 1] = bone2; wgt[i * 4 + 1] = w2;
    idx[i * 4 + 2] = 0; wgt[i * 4 + 2] = 1 - blend - w2;
  }
  // update 32: turning the head bone by θ does NOT turn the muzzle by θ. The long
  // ramp that stops the neck pinching shares that rotation with the body, so the
  // muzzle only takes its own share — and cancelling a baked-in turn with the raw
  // angle therefore under-corrects. Update 31 straightened Duco most of the way
  // and left him still looking slightly to his right for exactly this reason.
  // Measure the share the muzzle actually owns and divide the correction by it.
  // (update 33: the share estimate that used to live here is gone — the head
  // turn is now solved against the skinned result below, after binding.)
  let legVerts = 0;
  for (let i = 0; i < pos.count; i++) if (idx[i * 4] >= legBase && wgt[i * 4] > 0.5) legVerts++;
  geo.setAttribute("skinIndex", new THREE.BufferAttribute(idx, 4));
  geo.setAttribute("skinWeight", new THREE.BufferAttribute(wgt, 4));

  const skinned = new THREE.SkinnedMesh(geo, srcMesh.material);
  // update 41: frustum-culled with a generous sphere (the gait never leaves it) — every rigged creature used to be
  // drawn every frame wherever it stood, 100+ of them, most of them behind you
  geo.computeBoundingSphere(); skinned.boundingSphere = geo.boundingSphere.clone(); skinned.boundingSphere.radius *= 1.8;
  skinned.frustumCulled = true;
  skinned.add(spine);
  skinned.bind(new THREE.Skeleton(bones));
  // update 33: "looks forward" is MEASURED on the skinned result now, not
  // predicted. Two updates of estimating how much of the head bone's turn the
  // muzzle would take both under-corrected and left Duco looking to his right.
  // Instead: turn the head bone, push the muzzle vertices through the real
  // skeleton, read the muzzle's yaw off the result, and iterate until it is
  // zero. Whatever the skin weights do, the nose ends up where the body walks.
  if (muzzle && muzzle.length) {
    const tmp = new THREE.Vector3();
    // r151+ calls it applyBoneTransform (singular); older builds boneTransform
    const skin = skinned.applyBoneTransform ? "applyBoneTransform" : skinned.applyBoneTransforms ? "applyBoneTransforms" : "boneTransform";
    // update 33b: the target is the head's OWN axis — the line from the neck
    // base to the muzzle — not the body's centreline. Duco's scan has his
    // whole neck 7.6 cm off-centre, so aiming the nose at the body's centre
    // over-turned his head by ~23 degrees; relative to his own neck it was only
    // turned 9. Both ends are read off the skinned result every iteration.
    // the skull top (ears) is the head's own back reference: it is unmistakably
    // head, and it turns WITH the head, so nose-minus-skull is the head's axis
    const neck = [];
    {
      const p0 = geo.attributes.position, v0 = new THREE.Vector3();
      for (let i = 0; i < p0.count; i++) {
        v0.fromBufferAttribute(p0, i);
        if (v0.y > size.y * 0.8) neck.push(i);
      }
    }
    const muzzleYaw = (theta) => {
      head.rotation.y = theta;
      skinned.updateMatrixWorld(true);
      skinned.skeleton.update();
      let mx = 0, mz = 0, nx = 0, nz = 0;
      for (const i of muzzle) {
        tmp.fromBufferAttribute(geo.attributes.position, i);
        skinned[skin](i, tmp);
        mx += tmp.x; mz += tmp.z;
      }
      for (const i of neck) {
        tmp.fromBufferAttribute(geo.attributes.position, i);
        skinned[skin](i, tmp);
        nx += tmp.x; nz += tmp.z;
      }
      mx /= muzzle.length; mz /= muzzle.length;
      if (neck.length) { nx /= neck.length; nz /= neck.length; } else { nx = cx; nz = headZ; }
      return Math.atan2(mx - nx, mz - nz);
    };
    let t0 = 0, y0 = muzzleYaw(0);
    let t1 = -y0, y1 = muzzleYaw(t1);
    for (let it = 0; it < 6 && Math.abs(y1) > 0.004 && Math.abs(y1 - y0) > 1e-5; it++) {
      const t2 = t1 - y1 * (t1 - t0) / (y1 - y0);   // secant step
      t0 = t1; y0 = y1;
      t1 = Math.max(-1.3, Math.min(1.3, t2)); y1 = muzzleYaw(t1);
    }
    head.rotation.y = 0;
    headYaw0 = -t1;                                  // driveCreature applies -(headYaw0)
  }
  const g = new THREE.Group();
  g.add(skinned);
  g.userData.rig = { legs, knees, ankles, head, tail, tail2, plan, phase: Math.random() * 7, neckPitch: 0, neckExt: 0, headRestZ: head.position.z, legY: legs.map((b) => b.position.y),
    kneeRestY: knees ? knees.map((b) => b.position.y) : null,
    liftAbs: size.y * (plan.gait.lift || 0),     // step height scales WITH the animal
    legVerts, verts: pos.count,                    // update 30: QA — how much of the mesh the legs own
    headYaw0,                                      // update 31: the head turn baked into the mesh
    sit: 0, sitDrop: size.y * 0.26,                // update 32: haunches, and how far the rump falls onto them
    lie: 0, lieDrop: size.y * 0.42 };              // update 33: lying flat, and how far the body comes down
  return g;
}

// sine gait: legs stride (diagonal pairs for quadrupeds), neck bobs, tail sways
export function driveCreature(group, speed, dt, neckPitchTarget = 0, neckExtendTarget = 0, sitTarget = 0, lieTarget = 0) {
  const rig = group.userData.rig;
  if (!rig) return;
  // neck pushes forward when staring through a window
  rig.neckExt += (neckExtendTarget - rig.neckExt) * Math.min(1, dt * 3);
  rig.head.position.z = rig.headRestZ + rig.neckExt;
  const G = rig.plan.gait;
  const moving = speed > 0.15;
  // update 30: plans with a `stride` pace the cycle by distance covered (2*pi per stride)
  const rate = G.stride ? Math.max(G.freq * 0.5, (Math.PI * 2 * speed) / G.stride) : Math.max(G.freq, speed * 1.15);
  rig.phase += dt * (moving ? rate : 1.1);
  const amp = moving ? G.legAmp : 0.02;
  const s = Math.sin(rig.phase);
  const legs = rig.legs;
  // plans with `lift` raise the SWINGING foot off the ground — a leg that only
  // rotates at the hip drags its foot like it's glued down
  const lift = rig.liftAbs || 0;
  const c = Math.cos(rig.phase);
  const envA = moving ? Math.max(0, c) : 0;                  // swing envelope, phase A
  const envB = moving ? Math.max(0, -c) : 0;                 // swing envelope, phase B
  const upA = lift * envA, upB = lift * envB;
  // update 28: the lift rides the KNEE bone when the plan has one. Lifting
  // the whole hip bone stretched the thigh visibly — the partially-weighted
  // verts at the hip crease only followed a fraction of the translation.
  // Raising the knee instead tucks shin+foot up like a real stepping leg
  // while the thigh stays seated in the hip.
  const liftBone = (i, up) => {
    if (rig.knees) rig.knees[i].position.y = rig.kneeRestY[i] + up;
    else legs[i].position.y = rig.legY[i] + up;
  };
  if (legs.length === 2) {
    legs[0].rotation.x = s * amp;
    legs[1].rotation.x = -s * amp;
    if (lift) { liftBone(0, upA); liftBone(1, upB); }
  } else {
    // diagonal trot: front-left + back-right stride (and step) together
    legs[0].rotation.x = s * amp; legs[3].rotation.x = s * amp;
    legs[1].rotation.x = -s * amp; legs[2].rotation.x = -s * amp;
    if (lift) { liftBone(0, upA); liftBone(3, upA); liftBone(1, upB); liftBone(2, upB); }
  }
  // knees: the swinging leg FOLDS — shin tucks back while the foot is up,
  // extends again to plant. The stance leg stays straight and bears weight.
  if (rig.knees) {
    const K = G.kneeAmp || 0.5;
    for (let i = 0; i < legs.length; i++) {
      const env = (legs.length === 2 ? (i === 0) : (i === 0 || i === 3)) ? envA : envB;
      rig.knees[i].rotation.x = -env * K;
    }
  }
  // flat feet: the ankle counter-rotates the WHOLE chain above it so the
  // sole tracks the ground instead of plowing toe-first like a peg leg
  if (rig.ankles) for (let i = 0; i < legs.length; i++) {
    const kneeRot = rig.knees ? rig.knees[i].rotation.x : 0;
    rig.ankles[i].rotation.x = -(legs[i].rotation.x + kneeRot) * 0.85;
  }
  // neck: gait bob + smoothly-blended stare pitch (T-Rex head through a hole)
  rig.neckPitch += (neckPitchTarget - rig.neckPitch) * Math.min(1, dt * 4);
  rig.head.rotation.x = rig.neckPitch + (moving ? Math.sin(rig.phase * 2) * G.neckAmp : Math.sin(rig.phase) * G.neckAmp * 0.5);
  // update 31: -headYaw0 undoes a head the scan caught mid-turn; the idle
  // look-around then sways around straight ahead instead of around the squint
  // update 33b: standing still he looks straight ahead, and every eight seconds
  // or so glances a few degrees to one side for about a second — not the
  // continuous eight-degree sway that read as "still not looking forward".
  let glance = 0;
  if (!moving) {
    const g = Math.sin(rig.phase * 0.7);
    if (g > 0.93) glance = Math.sin(((g - 0.93) / 0.07) * Math.PI) * 0.07 * (Math.cos(rig.phase * 0.35) > 0 ? 1 : -1);
  }
  rig.head.rotation.y = -(rig.headYaw0 || 0) + glance;
  if (rig.tail) {
    const tf = moving ? 1 : 0.5;
    rig.tail.rotation.y = Math.sin(rig.phase * tf + 1.3) * G.tailAmp;
    if (rig.tail2) {
      // the tip lags the base and swings wider — a whip, not a plank
      rig.tail2.rotation.y = Math.sin(rig.phase * tf + 0.35) * G.tailAmp * 1.35;
      rig.tail2.rotation.x = Math.sin(rig.phase * tf * 0.7) * 0.04; // faint vertical ripple
    }
  }
  // update 32: sitting. A dog that has caught up with you drops onto its
  // haunches — the rear thighs swing forward under the body, the hocks fold, the
  // rump falls and the chest comes up, while the front legs stay straight and
  // planted. Blended over a beat so he settles and rises instead of snapping
  // between poses; the caller aims the head with neckPitchTarget.
  rig.sit += (Math.max(0, Math.min(1, sitTarget)) - rig.sit) * Math.min(1, dt * 4);
  const k = rig.sit;
  const SIT_PITCH = 0.5;                           // how far the chest comes up
  if (k > 0.002 && legs.length === 4) {
    for (const i of [2, 3]) {                      // haunches: thigh forward, hock folded
      legs[i].rotation.x = legs[i].rotation.x * (1 - k) + 1.15 * k;
      if (rig.knees) rig.knees[i].rotation.x = rig.knees[i].rotation.x * (1 - k) - 1.6 * k;
      if (rig.ankles) rig.ankles[i].rotation.x = rig.ankles[i].rotation.x * (1 - k) + 0.6 * k;
    }
    // The forelegs must stay STRAIGHT AND PLANTED. The body is pitching
    // nose-up beneath them, so without this counter-rotation they tip back with
    // it and the whole dog reads as standing-but-lower instead of sitting.
    for (const i of [0, 1]) {
      legs[i].rotation.x = legs[i].rotation.x * (1 - k) + SIT_PITCH * k;
      if (rig.knees) rig.knees[i].rotation.x *= 1 - k;
      if (rig.ankles) rig.ankles[i].rotation.x = rig.ankles[i].rotation.x * (1 - k) - SIT_PITCH * 0.5 * k;
    }
    if (rig.tail) rig.tail.rotation.y *= 1 - k * 0.55;
  }
  // subtle body bounce, and the rump settling as he sits. The drop is small:
  // the pitch already takes the rear down, and dropping the whole body as far
  // as the rump falls would bury the front paws in the ground with it.
  const body = group.children[0];
  body.position.y = (moving ? Math.abs(Math.sin(rig.phase)) * 0.035 * (legs.length === 2 ? 1.4 : 1) : 0) - rig.sitDrop * 0.45 * k;
  body.rotation.x = -SIT_PITCH * k;
  // update 33: lying down (asleep on the bed). Every leg folds, the forelegs
  // out ahead and the hind legs tucked, and the body comes down flat onto
  // whatever he is lying on. Blended like the sit, so he settles into it.
  rig.lie += (Math.max(0, Math.min(1, lieTarget)) - rig.lie) * Math.min(1, dt * 3);
  const L = rig.lie;
  if (L > 0.002 && legs.length === 4) {
    for (const i of [2, 3]) {                      // hind legs tucked under
      legs[i].rotation.x = legs[i].rotation.x * (1 - L) + 1.35 * L;
      if (rig.knees) rig.knees[i].rotation.x = rig.knees[i].rotation.x * (1 - L) - 1.7 * L;
      if (rig.ankles) rig.ankles[i].rotation.x = rig.ankles[i].rotation.x * (1 - L) + 0.5 * L;
    }
    for (const i of [0, 1]) {                      // forelegs stretched out ahead
      legs[i].rotation.x = legs[i].rotation.x * (1 - L) - 1.25 * L;
      if (rig.knees) rig.knees[i].rotation.x = rig.knees[i].rotation.x * (1 - L) + 0.35 * L;
      if (rig.ankles) rig.ankles[i].rotation.x = rig.ankles[i].rotation.x * (1 - L) + 0.9 * L;
    }
    if (rig.tail) rig.tail.rotation.y *= 1 - L * 0.8;
    body.position.y = body.position.y * (1 - L) - rig.lieDrop * L;
    body.rotation.x = body.rotation.x * (1 - L);
  }
}
