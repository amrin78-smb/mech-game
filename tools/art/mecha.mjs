/**
 * The player mecha, drawn as four separate pieces so the game can animate them
 * independently: legs, torso, main cannon, turret.
 *
 * Origins matter and are load bearing. Legs and torso are drawn to sit on the
 * bottom edge of their canvas (origin 0.5, 1 at runtime). The cannon and turret
 * are drawn horizontally with their breech at the left, because the game pivots
 * them around a point near that end.
 */
import {
  BRASS,
  IRON,
  RUST,
  OUTLINE,
  bevel,
  contactShadow,
  fillRamp,
  glow,
  grime,
  makeRng,
  panelLine,
  rivets,
  roundedPath,
  shade,
  streaks,
} from './palette.mjs';

export function drawMechaLegs(ctx, w, h) {
  const rng = makeRng(0x51e91);
  const hipH = Math.round(h * 0.22);
  const footH = Math.round(h * 0.12);
  const thighW = Math.round(w * 0.36);
  const inset = Math.round(w * 0.04);
  const thighTop = hipH - 3;
  const thighH = h - hipH - footH + 3;

  // The machine is heavy, so it gets a shadow pooled under it.
  contactShadow(ctx, w * 0.5, h - 2, w * 0.62, footH * 0.7, 0.5);

  // Hip housing: the heaviest block, carries the torso.
  roundedPath(ctx, 1, 0, w - 2, hipH, 5);
  fillRamp(ctx, 0, hipH, IRON);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 2;
  ctx.stroke();
  rivets(ctx, 8, hipH - 5, w - 16, 8, IRON);
  panelLine(ctx, 8, hipH * 0.45, w - 8, hipH * 0.45, IRON);

  for (const side of [0, 1]) {
    const x = side === 0 ? inset : w - inset - thighW;

    // Thigh: wide at the hip, narrowing to the knee.
    ctx.beginPath();
    ctx.moveTo(x, thighTop);
    ctx.lineTo(x + thighW, thighTop);
    ctx.lineTo(x + thighW - 5, thighTop + thighH * 0.5);
    ctx.lineTo(x + 5, thighTop + thighH * 0.5);
    ctx.closePath();
    fillRamp(ctx, thighTop, thighH * 0.5, RUST);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Knee block.
    const kneeY = thighTop + Math.round(thighH * 0.46);
    roundedPath(ctx, x + 2, kneeY, thighW - 4, thighH * 0.14, 3);
    fillRamp(ctx, kneeY, thighH * 0.14, IRON);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Armoured shin, slightly flared at the ankle.
    const shinTop = kneeY + thighH * 0.12;
    const shinH = h - footH - shinTop;
    ctx.beginPath();
    ctx.moveTo(x + 5, shinTop);
    ctx.lineTo(x + thighW - 5, shinTop);
    ctx.lineTo(x + thighW - 1, shinTop + shinH);
    ctx.lineTo(x + 1, shinTop + shinH);
    ctx.closePath();
    fillRamp(ctx, shinTop, shinH, RUST);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Twin hydraulic pistons running the length of the shin.
    for (const px of [thighW * 0.32, thighW * 0.62]) {
      ctx.fillStyle = BRASS.base;
      ctx.fillRect(x + px - 2.5, shinTop + 3, 5, shinH * 0.66);
      ctx.fillStyle = BRASS.highlight;
      ctx.fillRect(x + px - 2.5, shinTop + 3, 1.6, shinH * 0.66);
      ctx.fillStyle = IRON.dark;
      ctx.fillRect(x + px - 3.5, shinTop + shinH * 0.66, 7, 4);
    }

    panelLine(ctx, x + 5, shinTop + shinH * 0.82, x + thighW - 5, shinTop + shinH * 0.82, RUST);
    streaks(ctx, x, thighTop, thighW, thighH, rng, { count: 5, alpha: 0.28 });

    // Foot: a broad pad with a raised toe so it reads as planted.
    const footW = Math.round(w * 0.46);
    const footX = side === 0 ? 0 : w - footW;
    roundedPath(ctx, footX, h - footH, footW, footH, 3);
    fillRamp(ctx, h - footH, footH, IRON, { flip: true });
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = IRON.highlight;
    ctx.fillRect(footX + 3, h - footH + 2, footW - 6, 1.4);
    ctx.fillStyle = IRON.shadow;
    ctx.fillRect(footX + 2, h - 3.5, footW - 4, 2.5);
  }

  grime(ctx, 0, 0, w, h, rng, { count: 30 });
}

export function drawMechaTorso(ctx, w, h) {
  const rng = makeRng(0x7042);
  const stackW = Math.round(w * 0.085);
  const stackH = Math.round(h * 0.26);
  const bodyTop = stackH - 4;
  const bodyH = h - bodyTop;

  // Exhaust stacks, sooty at the lip.
  for (const [sx, sh] of [
    [Math.round(w * 0.17), stackH],
    [Math.round(w * 0.32), Math.round(stackH * 0.78)],
  ]) {
    const top = stackH - sh;
    ctx.fillStyle = IRON.dark;
    ctx.fillRect(sx, top, stackW, sh + 6);
    ctx.fillStyle = IRON.light;
    ctx.fillRect(sx, top, 1.6, sh + 6);
    ctx.fillStyle = BRASS.dark;
    ctx.fillRect(sx - 1, top, stackW + 2, 3);
    ctx.fillStyle = '#0d0b0a';
    ctx.fillRect(sx + 1, top + 1, stackW - 2, 2);
  }

  // Main boiler body with a chamfered top corner.
  ctx.beginPath();
  ctx.moveTo(0, bodyTop + 10);
  ctx.lineTo(12, bodyTop);
  ctx.lineTo(w - 6, bodyTop);
  ctx.lineTo(w, bodyTop + 8);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  fillRamp(ctx, bodyTop, bodyH, RUST);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Forward shoulder pauldron: breaks the slab silhouette and reads as armour
  // facing the enemy, which all come from the left.
  ctx.beginPath();
  ctx.moveTo(-1, bodyTop + 6);
  ctx.lineTo(Math.round(w * 0.3), bodyTop - 4);
  ctx.lineTo(Math.round(w * 0.34), bodyTop + Math.round(bodyH * 0.3));
  ctx.lineTo(-1, bodyTop + Math.round(bodyH * 0.36));
  ctx.closePath();
  fillRamp(ctx, bodyTop - 4, bodyH * 0.4, IRON);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 2;
  ctx.stroke();
  rivets(ctx, 6, bodyTop + Math.round(bodyH * 0.27), Math.round(w * 0.26), 5, IRON, 1.3);

  // Armour band across the middle.
  shade(ctx, 4, bodyTop + Math.round(bodyH * 0.42), w - 8, Math.round(bodyH * 0.22), IRON);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1;
  ctx.strokeRect(4, bodyTop + Math.round(bodyH * 0.42), w - 8, Math.round(bodyH * 0.22));
  rivets(ctx, 10, bodyTop + Math.round(bodyH * 0.42) + 4, w - 20, 9, IRON);

  // Brass cockpit: the eye of the machine, so it gets a glow.
  const cockX = Math.round(w * 0.58);
  const cockY = bodyTop + Math.round(bodyH * 0.14);
  const cockW = Math.round(w * 0.36);
  const cockH = Math.round(bodyH * 0.26);
  roundedPath(ctx, cockX, cockY, cockW, cockH, 3);
  fillRamp(ctx, cockY, cockH, BRASS);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = '#1b2a2e';
  ctx.fillRect(cockX + 4, cockY + 3, cockW - 8, cockH - 7);
  glow(ctx, cockX + cockW * 0.4, cockY + cockH * 0.45, cockH * 1.4, 'rgba(255,196,92,0.65)');
  ctx.fillStyle = '#ffd98a';
  ctx.fillRect(cockX + 5, cockY + 4, cockW - 10, 1.4);

  // Vents low on the hull.
  ctx.fillStyle = IRON.shadow;
  for (let i = 0; i < 5; i += 1) {
    ctx.fillRect(10 + i * 9, h - 14, 5, 8);
  }
  ctx.fillStyle = IRON.light;
  for (let i = 0; i < 5; i += 1) {
    ctx.fillRect(10 + i * 9, h - 14, 5, 1.2);
  }

  panelLine(ctx, 6, bodyTop + 12, w - 10, bodyTop + 12, RUST);
  streaks(ctx, 0, bodyTop, w, bodyH, rng, { count: 11, alpha: 0.3 });
  grime(ctx, 0, bodyTop, w, bodyH, rng, { count: 30 });
  bevel(ctx, 0, bodyTop, w, bodyH, RUST, 1);
}

export function drawMechaCannon(ctx, w, h) {
  const rng = makeRng(0x2ca9);
  const breechW = Math.round(w * 0.22);
  const barrelTop = Math.round(h * 0.28);
  const barrelH = h - barrelTop * 2;

  // Barrel first, so the breech overlaps it.
  ctx.beginPath();
  ctx.moveTo(breechW - 4, barrelTop);
  ctx.lineTo(w - 20, barrelTop - 1);
  ctx.lineTo(w - 20, barrelTop + barrelH + 1);
  ctx.lineTo(breechW - 4, barrelTop + barrelH);
  ctx.closePath();
  fillRamp(ctx, barrelTop - 1, barrelH + 2, RUST);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Cooling bands.
  for (let x = breechW + 8; x < w - 30; x += 18) {
    ctx.fillStyle = BRASS.dark;
    ctx.fillRect(x, barrelTop - 3, 5, barrelH + 6);
    ctx.fillStyle = BRASS.light;
    ctx.fillRect(x, barrelTop - 3, 1.6, barrelH + 6);
  }

  // Breech block.
  roundedPath(ctx, 0, 1, breechW, h - 2, 3);
  fillRamp(ctx, 0, h, IRON);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = IRON.highlight;
  ctx.fillRect(3, 3, breechW - 6, 1.4);
  rivets(ctx, 3, h - 5, breechW - 6, 3, IRON, 1);

  // Muzzle brake with vent slots.
  const brakeX = w - 20;
  roundedPath(ctx, brakeX, barrelTop - 5, 20, barrelH + 10, 2);
  fillRamp(ctx, barrelTop - 5, barrelH + 10, BRASS);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = BRASS.shadow;
  ctx.fillRect(brakeX + 5, barrelTop - 3, 2.5, barrelH + 6);
  ctx.fillRect(brakeX + 11, barrelTop - 3, 2.5, barrelH + 6);
  // Dark bore at the tip.
  ctx.fillStyle = '#0d0b0a';
  ctx.fillRect(w - 3, barrelTop + 1, 3, barrelH - 2);

  streaks(ctx, breechW, barrelTop, w - breechW - 24, barrelH, rng, { count: 5, alpha: 0.24 });
}

export function drawMechaTurret(ctx, w, h) {
  const housingW = Math.round(w * 0.36);
  const barrelTop = Math.round(h * 0.3);
  const barrelH = h - barrelTop * 2;

  ctx.beginPath();
  ctx.moveTo(housingW - 2, barrelTop);
  ctx.lineTo(w - 9, barrelTop);
  ctx.lineTo(w - 9, barrelTop + barrelH);
  ctx.lineTo(housingW - 2, barrelTop + barrelH);
  ctx.closePath();
  fillRamp(ctx, barrelTop, barrelH, RUST);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  roundedPath(ctx, 0, 1, housingW, h - 2, 3);
  fillRamp(ctx, 0, h, IRON);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.fillStyle = IRON.highlight;
  ctx.fillRect(2, 2.5, housingW - 4, 1.2);

  roundedPath(ctx, w - 9, barrelTop - 3, 9, barrelH + 6, 1.5);
  fillRamp(ctx, barrelTop - 3, barrelH + 6, BRASS);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.fillStyle = '#0d0b0a';
  ctx.fillRect(w - 2, barrelTop, 2, barrelH);
}
