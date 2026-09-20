/**
 * One drawing routine per enemy id, so silhouettes actually differ. The box an
 * enemy is drawn into stays keyed to its armor class, because collision radius
 * is derived from the texture size and the balance pass was tuned against it.
 *
 * Every enemy faces left, towards the mecha, and sits on the bottom edge of its
 * canvas (runtime origin 0.5, 1).
 */
import {
  BRASS,
  ENEMY_SHIELDED,
  IRON,
  OUTLINE,
  RUST,
  fillRamp,
  glow,
  grime,
  contactShadow,
  makeRng,
  rampFor,
  rivets,
  roundedPath,
  streaks,
} from './palette.mjs';

/** Treads: the default locomotion for ground trash. */
function treads(ctx, x, y, w, h, rng) {
  roundedPath(ctx, x, y, w, h, h * 0.45);
  fillRamp(ctx, y, h, IRON, { flip: true });
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  const count = Math.max(3, Math.round(w / 7));
  ctx.fillStyle = IRON.shadow;
  for (let i = 0; i < count; i += 1) {
    ctx.fillRect(x + 2 + (i * (w - 4)) / count, y + 1.5, 1.8, h - 3);
  }
  grime(ctx, x, y, w, h, rng, { count: 6, alpha: 0.25 });
}

function wheel(ctx, cx, cy, r) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = IRON.shadow;
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.45, 0, Math.PI * 2);
  ctx.fillStyle = BRASS.dark;
  ctx.fill();
  ctx.fillStyle = BRASS.light;
  ctx.fillRect(cx - r * 0.18, cy - r * 0.18, r * 0.36, r * 0.36);
}

/** A lit sensor eye, so each unit has a focal point. */
function eye(ctx, cx, cy, r, color = 'rgba(255,120,70,0.85)') {
  glow(ctx, cx, cy, r * 2.6, color.replace('0.85', '0.35'));
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
}

const DRAW = {
  // A destructible vent bolted to the Leviathan: dark housing, hot grille.
  // It has to read as a target at a glance while riding on a busy boss sprite.
  leviathan_vent(ctx, w, h, ramp, rng) {
    roundedPath(ctx, 1.5, 1.5, w - 3, h - 3, 3);
    fillRamp(ctx, 0, h, ramp);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Glowing louvres across the face.
    const slots = 4;
    const pad = w * 0.18;
    const slotW = (w - pad * 2) / slots;
    for (let i = 0; i < slots; i += 1) {
      const x = pad + i * slotW;
      const glow = ctx.createLinearGradient(0, h * 0.24, 0, h * 0.76);
      glow.addColorStop(0, 'rgba(255,190,80,0.95)');
      glow.addColorStop(1, 'rgba(226,84,20,0.9)');
      ctx.fillStyle = glow;
      ctx.fillRect(x + slotW * 0.16, h * 0.24, slotW * 0.62, h * 0.52);
    }

    // Bolted frame, so it looks attached rather than painted on.
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(pad * 0.55, h * 0.18, w - pad * 1.1, h * 0.64);
    streaks(ctx, 2, 2, w - 4, h, rng, { count: 3, alpha: 0.3 });
  },

  rustcrawler(ctx, w, h, ramp, rng) {
    const treadH = Math.round(h * 0.3);
    const bodyH = h - treadH;
    treads(ctx, 2, bodyH, w - 4, treadH, rng);

    // Wedge body, nose down towards the mecha.
    ctx.beginPath();
    ctx.moveTo(1, bodyH * 0.55);
    ctx.lineTo(w * 0.34, 2);
    ctx.lineTo(w - 3, 4);
    ctx.lineTo(w - 1, bodyH);
    ctx.lineTo(1, bodyH);
    ctx.closePath();
    fillRamp(ctx, 0, bodyH, ramp);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.fillStyle = IRON.dark;
    ctx.fillRect(w * 0.42, bodyH * 0.35, w * 0.4, bodyH * 0.2);
    rivets(ctx, 4, bodyH - 3, w - 10, 4, ramp, 0.9);
    eye(ctx, w * 0.18, bodyH * 0.62, 1.8);
    streaks(ctx, 2, 2, w - 4, bodyH, rng, { count: 4, alpha: 0.3 });
  },

  scavenger_bike(ctx, w, h, ramp, rng) {
    const r = h * 0.3;
    wheel(ctx, w * 0.78, h - r, r);
    wheel(ctx, w * 0.2, h - r * 0.9, r * 0.9);

    // Low slung frame raked forward.
    ctx.beginPath();
    ctx.moveTo(2, h * 0.62);
    ctx.lineTo(w * 0.42, h * 0.2);
    ctx.lineTo(w * 0.86, h * 0.3);
    ctx.lineTo(w * 0.9, h * 0.62);
    ctx.lineTo(2, h * 0.72);
    ctx.closePath();
    fillRamp(ctx, h * 0.2, h * 0.5, ramp);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.3;
    ctx.stroke();

    // Rider hunched over the bars.
    ctx.fillStyle = IRON.dark;
    ctx.beginPath();
    ctx.ellipse(w * 0.55, h * 0.22, w * 0.13, h * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = BRASS.base;
    ctx.fillRect(w * 0.06, h * 0.44, w * 0.26, 2.2);
    eye(ctx, w * 0.1, h * 0.5, 1.6, 'rgba(255,210,120,0.9)');
    streaks(ctx, 2, h * 0.2, w - 6, h * 0.4, rng, { count: 3, alpha: 0.26 });
  },

  plated_hulk(ctx, w, h, ramp, rng) {
    const treadH = Math.round(h * 0.24);
    const bodyH = h - treadH;
    treads(ctx, 1, bodyH, w - 2, treadH, rng);

    // Slab torso with a heavy overhanging brow plate.
    roundedPath(ctx, 3, bodyH * 0.22, w - 6, bodyH * 0.78, 3);
    fillRamp(ctx, bodyH * 0.22, bodyH * 0.78, ramp);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.6;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, bodyH * 0.3);
    ctx.lineTo(w * 0.55, bodyH * 0.05);
    ctx.lineTo(w * 0.62, bodyH * 0.34);
    ctx.lineTo(0, bodyH * 0.46);
    ctx.closePath();
    fillRamp(ctx, 0, bodyH * 0.46, IRON);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.4;
    ctx.stroke();

    rivets(ctx, 8, bodyH * 0.62, w - 18, 6, ramp, 1.1);
    ctx.fillStyle = IRON.shadow;
    ctx.fillRect(w * 0.2, bodyH * 0.72, w * 0.6, bodyH * 0.1);
    eye(ctx, w * 0.12, bodyH * 0.38, 2);
    streaks(ctx, 3, bodyH * 0.2, w - 8, bodyH * 0.7, rng, { count: 7, alpha: 0.3 });
    grime(ctx, 0, 0, w, h, rng, { count: 14 });
  },

  gunner_walker(ctx, w, h, ramp, rng) {
    // Two splayed legs, cabin slung between them.
    ctx.strokeStyle = IRON.dark;
    ctx.lineWidth = Math.max(2.5, w * 0.06);
    for (const [hx, fx] of [
      [w * 0.42, w * 0.16],
      [w * 0.58, w * 0.86],
    ]) {
      ctx.beginPath();
      ctx.moveTo(hx, h * 0.55);
      ctx.lineTo(fx, h - 2);
      ctx.stroke();
    }
    ctx.fillStyle = IRON.shadow;
    ctx.fillRect(w * 0.08, h - 4, w * 0.2, 4);
    ctx.fillRect(w * 0.76, h - 4, w * 0.2, 4);

    roundedPath(ctx, w * 0.18, h * 0.16, w * 0.64, h * 0.42, 4);
    fillRamp(ctx, h * 0.16, h * 0.42, ramp);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Long barrel: this one out-ranges everything else in the zone.
    ctx.fillStyle = IRON.dark;
    ctx.fillRect(0, h * 0.3, w * 0.34, h * 0.1);
    ctx.fillStyle = BRASS.base;
    ctx.fillRect(0, h * 0.3, w * 0.07, h * 0.1);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1;
    ctx.strokeRect(0, h * 0.3, w * 0.34, h * 0.1);

    eye(ctx, w * 0.3, h * 0.28, 2, 'rgba(255,170,80,0.9)');
    rivets(ctx, w * 0.24, h * 0.52, w * 0.52, 5, ramp, 1);
    streaks(ctx, w * 0.18, h * 0.16, w * 0.64, h * 0.4, rng, { count: 4, alpha: 0.26 });
  },

  drone_swarm(ctx, w, h, ramp, rng) {
    // Rotor bar above a small pod: reads as airborne at a glance.
    ctx.fillStyle = IRON.light;
    ctx.fillRect(w * 0.05, h * 0.1, w * 0.9, 1.6);
    ctx.fillStyle = IRON.dark;
    ctx.fillRect(w * 0.46, h * 0.12, w * 0.08, h * 0.2);

    ctx.beginPath();
    ctx.ellipse(w * 0.5, h * 0.58, w * 0.38, h * 0.3, 0, 0, Math.PI * 2);
    fillRamp(ctx, h * 0.28, h * 0.6, ramp);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    eye(ctx, w * 0.22, h * 0.58, 1.6, 'rgba(255,140,90,0.95)');
    ctx.fillStyle = BRASS.dark;
    ctx.fillRect(w * 0.3, h * 0.82, w * 0.4, 1.6);
    grime(ctx, 0, 0, w, h, rng, { count: 5, alpha: 0.2 });
  },

  shield_bearer(ctx, w, h, ramp, rng) {
    const treadH = Math.round(h * 0.2);
    const bodyH = h - treadH;
    treads(ctx, w * 0.22, bodyH, w * 0.74, treadH, rng);

    roundedPath(ctx, w * 0.26, bodyH * 0.24, w * 0.64, bodyH * 0.76, 3);
    fillRamp(ctx, bodyH * 0.24, bodyH * 0.76, ramp);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    eye(ctx, w * 0.42, bodyH * 0.44, 2, 'rgba(120,220,255,0.9)');

    // The frontal shield, angled and translucent.
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.beginPath();
    ctx.moveTo(w * 0.2, bodyH * 0.02);
    ctx.lineTo(w * 0.3, bodyH * 0.06);
    ctx.lineTo(w * 0.3, h - treadH * 0.4);
    ctx.lineTo(w * 0.2, h - treadH * 0.1);
    ctx.closePath();
    fillRamp(ctx, 0, h, ENEMY_SHIELDED);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = ENEMY_SHIELDED.highlight;
    ctx.fillRect(w * 0.21, bodyH * 0.1, 1.6, h * 0.7);
    ctx.restore();
    glow(ctx, w * 0.25, h * 0.5, h * 0.42, 'rgba(90,200,230,0.22)');
  },

  incinerator_tank(ctx, w, h, ramp, rng) {
    const treadH = Math.round(h * 0.3);
    const bodyH = h - treadH;
    treads(ctx, 2, bodyH, w - 4, treadH, rng);

    roundedPath(ctx, w * 0.12, bodyH * 0.3, w * 0.8, bodyH * 0.7, 3);
    fillRamp(ctx, bodyH * 0.3, bodyH * 0.7, ramp);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Fuel drum on the back.
    roundedPath(ctx, w * 0.62, bodyH * 0.06, w * 0.3, bodyH * 0.34, 4);
    fillRamp(ctx, bodyH * 0.06, bodyH * 0.34, RUST);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.3;
    ctx.stroke();

    // Flame nozzle, with heat glow.
    ctx.fillStyle = IRON.dark;
    ctx.fillRect(0, bodyH * 0.44, w * 0.3, h * 0.12);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1;
    ctx.strokeRect(0, bodyH * 0.44, w * 0.3, h * 0.12);
    glow(ctx, w * 0.02, bodyH * 0.5, h * 0.22, 'rgba(255,140,40,0.55)');
    ctx.fillStyle = '#ffb347';
    ctx.fillRect(0, bodyH * 0.47, 3, h * 0.06);

    rivets(ctx, w * 0.18, bodyH * 0.82, w * 0.62, 6, ramp, 1);
    streaks(ctx, w * 0.12, bodyH * 0.3, w * 0.8, bodyH * 0.6, rng, { count: 5, alpha: 0.28 });
  },

  burrower(ctx, w, h, ramp, rng) {
    // Conical drill head leading a segmented body.
    ctx.beginPath();
    ctx.moveTo(0, h * 0.62);
    ctx.lineTo(w * 0.36, h * 0.16);
    ctx.lineTo(w * 0.36, h);
    ctx.closePath();
    fillRamp(ctx, h * 0.16, h * 0.84, IRON);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.strokeStyle = BRASS.dark;
    ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i += 1) {
      ctx.beginPath();
      ctx.moveTo(w * 0.09 * i, h * (0.62 - 0.12 * i) + h * 0.12);
      ctx.lineTo(w * 0.36, h * (0.3 + 0.16 * i));
      ctx.stroke();
    }

    roundedPath(ctx, w * 0.34, h * 0.3, w * 0.62, h * 0.68, 3);
    fillRamp(ctx, h * 0.3, h * 0.68, ramp);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.fillStyle = ramp.shadow;
    for (let i = 0; i < 3; i += 1) {
      ctx.fillRect(w * (0.44 + i * 0.16), h * 0.34, 1.8, h * 0.6);
    }
    streaks(ctx, w * 0.34, h * 0.3, w * 0.6, h * 0.6, rng, { count: 3, alpha: 0.26 });
  },

  elite_vanguard(ctx, w, h, ramp, rng) {
    const treadH = Math.round(h * 0.18);
    const bodyH = h - treadH;
    treads(ctx, w * 0.14, bodyH, w * 0.78, treadH, rng);

    // Heavy torso with pauldrons.
    roundedPath(ctx, w * 0.2, bodyH * 0.26, w * 0.66, bodyH * 0.74, 4);
    fillRamp(ctx, bodyH * 0.26, bodyH * 0.74, ramp);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.8;
    ctx.stroke();

    for (const px of [w * 0.14, w * 0.68]) {
      roundedPath(ctx, px, bodyH * 0.16, w * 0.22, bodyH * 0.26, 3);
      fillRamp(ctx, bodyH * 0.16, bodyH * 0.26, IRON);
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }

    ctx.fillStyle = BRASS.base;
    ctx.fillRect(w * 0.26, bodyH * 0.5, w * 0.54, h * 0.06);
    ctx.fillStyle = BRASS.highlight;
    ctx.fillRect(w * 0.26, bodyH * 0.5, w * 0.54, 1.3);

    eye(ctx, w * 0.3, bodyH * 0.38, 2.4, 'rgba(120,220,255,0.95)');
    glow(ctx, w * 0.5, h * 0.5, h * 0.5, 'rgba(70,180,215,0.16)');
    rivets(ctx, w * 0.24, bodyH * 0.86, w * 0.58, 6, ramp, 1.1);
    streaks(ctx, w * 0.2, bodyH * 0.26, w * 0.64, bodyH * 0.7, rng, { count: 5, alpha: 0.26 });
  },

  boss_compactor(ctx, w, h, ramp, rng) {
    const treadH = Math.round(h * 0.22);
    const bodyH = h - treadH;
    treads(ctx, 2, bodyH, w - 4, treadH, rng);

    roundedPath(ctx, w * 0.1, bodyH * 0.2, w * 0.86, bodyH * 0.8, 5);
    fillRamp(ctx, bodyH * 0.2, bodyH * 0.8, ramp);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2.4;
    ctx.stroke();

    // Crusher jaws: the thing it kills you with.
    for (const [jy, dir] of [
      [bodyH * 0.3, 1],
      [bodyH * 0.72, -1],
    ]) {
      ctx.beginPath();
      ctx.moveTo(w * 0.12, jy);
      ctx.lineTo(0, jy + dir * bodyH * 0.16);
      ctx.lineTo(w * 0.14, jy + dir * bodyH * 0.24);
      ctx.closePath();
      fillRamp(ctx, jy - bodyH * 0.2, bodyH * 0.44, IRON);
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.fillStyle = IRON.dark;
    ctx.fillRect(w * 0.2, bodyH * 0.42, w * 0.66, bodyH * 0.16);
    rivets(ctx, w * 0.22, bodyH * 0.4, w * 0.62, 9, ramp, 1.8);
    rivets(ctx, w * 0.22, bodyH * 0.92, w * 0.62, 9, ramp, 1.8);

    // Furnace mouth.
    glow(ctx, w * 0.55, bodyH * 0.66, h * 0.2, 'rgba(255,120,40,0.5)');
    ctx.fillStyle = '#ff9a3c';
    ctx.fillRect(w * 0.46, bodyH * 0.6, w * 0.18, bodyH * 0.12);
    eye(ctx, w * 0.2, bodyH * 0.3, 4, 'rgba(255,90,60,0.95)');

    streaks(ctx, w * 0.1, bodyH * 0.2, w * 0.84, bodyH * 0.76, rng, { count: 14, alpha: 0.3 });
    grime(ctx, 0, 0, w, h, rng, { count: 40 });
  },

  boss_iron_matriarch(ctx, w, h, ramp, rng) {
    const treadH = Math.round(h * 0.16);
    const bodyH = h - treadH;
    treads(ctx, w * 0.1, bodyH, w * 0.82, treadH, rng);

    // Tall spire silhouette, unlike the wide Compactor.
    ctx.beginPath();
    ctx.moveTo(w * 0.28, bodyH * 0.06);
    ctx.lineTo(w * 0.72, bodyH * 0.12);
    ctx.lineTo(w * 0.88, bodyH);
    ctx.lineTo(w * 0.14, bodyH);
    ctx.closePath();
    fillRamp(ctx, bodyH * 0.06, bodyH * 0.94, ramp);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2.4;
    ctx.stroke();

    // Drone bay doors down one flank.
    ctx.fillStyle = IRON.dark;
    for (let i = 0; i < 3; i += 1) {
      ctx.fillRect(w * 0.2, bodyH * (0.42 + i * 0.16), w * 0.16, bodyH * 0.1);
    }
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 3; i += 1) {
      ctx.strokeRect(w * 0.2, bodyH * (0.42 + i * 0.16), w * 0.16, bodyH * 0.1);
    }

    // Shield emitter crown.
    for (const ex of [w * 0.34, w * 0.5, w * 0.66]) {
      ctx.fillStyle = ENEMY_SHIELDED.base;
      ctx.fillRect(ex - w * 0.02, bodyH * 0.02, w * 0.04, bodyH * 0.1);
      glow(ctx, ex, bodyH * 0.04, h * 0.09, 'rgba(120,220,255,0.6)');
    }
    glow(ctx, w * 0.5, bodyH * 0.5, h * 0.52, 'rgba(70,180,215,0.2)');

    ctx.fillStyle = BRASS.base;
    ctx.fillRect(w * 0.4, bodyH * 0.24, w * 0.34, bodyH * 0.08);
    eye(ctx, w * 0.46, bodyH * 0.28, 4, 'rgba(150,235,255,0.95)');

    rivets(ctx, w * 0.2, bodyH * 0.95, w * 0.6, 10, ramp, 1.6);
    streaks(ctx, w * 0.16, bodyH * 0.1, w * 0.68, bodyH * 0.85, rng, { count: 12, alpha: 0.26 });
  },

  boss_leviathan_engine(ctx, w, h, ramp, rng) {
    const treadH = Math.round(h * 0.2);
    const bodyH = h - treadH;
    treads(ctx, 1, bodyH, w - 2, treadH, rng);

    // Long locomotive hull.
    ctx.beginPath();
    ctx.moveTo(0, bodyH * 0.44);
    ctx.lineTo(w * 0.16, bodyH * 0.14);
    ctx.lineTo(w * 0.92, bodyH * 0.08);
    ctx.lineTo(w, bodyH * 0.3);
    ctx.lineTo(w, bodyH);
    ctx.lineTo(0, bodyH);
    ctx.closePath();
    fillRamp(ctx, bodyH * 0.08, bodyH * 0.92, ramp);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2.6;
    ctx.stroke();

    // Three weak point furnaces, which is what its phases are about.
    for (const px of [0.3, 0.52, 0.74]) {
      const cx = w * px;
      const cy = bodyH * 0.52;
      ctx.beginPath();
      ctx.arc(cx, cy, h * 0.075, 0, Math.PI * 2);
      ctx.fillStyle = IRON.shadow;
      ctx.fill();
      ctx.strokeStyle = BRASS.base;
      ctx.lineWidth = 2.4;
      ctx.stroke();
      glow(ctx, cx, cy, h * 0.14, 'rgba(255,130,40,0.6)');
      ctx.fillStyle = '#ffb04a';
      ctx.beginPath();
      ctx.arc(cx, cy, h * 0.035, 0, Math.PI * 2);
      ctx.fill();
    }

    // Smokestacks along the spine.
    for (const px of [0.36, 0.58, 0.8]) {
      ctx.fillStyle = IRON.dark;
      ctx.fillRect(w * px, bodyH * 0.0, w * 0.045, bodyH * 0.16);
      ctx.fillStyle = '#0d0b0a';
      ctx.fillRect(w * px + 1, bodyH * 0.0, w * 0.045 - 2, 2.5);
    }

    ctx.fillStyle = IRON.dark;
    ctx.fillRect(w * 0.08, bodyH * 0.74, w * 0.84, bodyH * 0.1);
    rivets(ctx, w * 0.1, bodyH * 0.72, w * 0.8, 14, ramp, 1.8);
    eye(ctx, w * 0.08, bodyH * 0.36, 4.5, 'rgba(255,90,50,0.95)');

    streaks(ctx, 0, bodyH * 0.1, w, bodyH * 0.8, rng, { count: 18, alpha: 0.3 });
    grime(ctx, 0, 0, w, h, rng, { count: 50 });
  },
};

/** Fallback for any enemy id added later without its own routine. */
function drawGeneric(ctx, w, h, ramp, rng) {
  const treadH = Math.round(h * 0.28);
  const bodyH = h - treadH;
  treads(ctx, 2, bodyH, w - 4, treadH, rng);
  roundedPath(ctx, 2, 2, w - 4, bodyH - 2, 3);
  fillRamp(ctx, 0, bodyH, ramp);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  eye(ctx, w * 0.2, bodyH * 0.5, 2);
  streaks(ctx, 2, 2, w - 4, bodyH, rng, { count: 4, alpha: 0.28 });
}

export function drawEnemy(ctx, def, w, h) {
  const ramp = rampFor(def.armorClass);
  // Flyers hover, so their shadow falls away below them rather than under foot.
  if (def.flying !== true) {
    contactShadow(ctx, w * 0.5, h - 1.5, w * 0.48, Math.max(2.5, h * 0.09), 0.45);
  }
  // Seeded from the id, so each enemy's weathering is stable across builds.
  const seed = [...def.id].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const rng = makeRng(seed);
  const draw = DRAW[def.id] ?? drawGeneric;
  draw(ctx, w, h, ramp, rng);
}
