/**
 * Projectiles, pickups, VFX particles and UI bits.
 *
 * The particle textures are deliberately soft: the emitters tint and scale
 * them, so a hard edged square reads as a square no matter what the emitter
 * does with it.
 */
import { BRASS, IRON, OUTLINE, RUST, fillRamp, glow, roundedPath } from './palette.mjs';

export function drawShell(ctx, w, h) {
  roundedPath(ctx, 0, 0, w, h, h * 0.4);
  fillRamp(ctx, 0, h, BRASS);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 0.8;
  ctx.stroke();
  // Darker tip so direction reads in flight.
  ctx.fillStyle = RUST.dark;
  ctx.fillRect(w - 4, 0.5, 4, h - 1);
  ctx.fillStyle = BRASS.highlight;
  ctx.fillRect(1, 0.8, w - 6, 0.9);
}

export function drawFlakShell(ctx, w, h) {
  roundedPath(ctx, 0, 0, w, h, 2);
  fillRamp(ctx, 0, h, IRON);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.fillStyle = BRASS.base;
  ctx.fillRect(1, 1.2, w - 4, h - 2.4);
  ctx.fillStyle = '#ff9a3c';
  ctx.fillRect(w - 3, 1.5, 2, h - 3);
}

export function drawScrap(ctx, size) {
  const half = size / 2;
  ctx.beginPath();
  ctx.moveTo(half, 0.5);
  ctx.lineTo(size - 0.5, half);
  ctx.lineTo(half, size - 0.5);
  ctx.lineTo(0.5, half);
  ctx.closePath();
  fillRamp(ctx, 0, size, BRASS);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = BRASS.highlight;
  ctx.beginPath();
  ctx.moveTo(half, 2.5);
  ctx.lineTo(half + 2.5, half);
  ctx.lineTo(half, half);
  ctx.closePath();
  ctx.fill();
}

export function drawMuzzleFlash(ctx, w, h) {
  const midY = h / 2;
  // Three nested wedges, hottest in the middle.
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = '#ffb347';
  ctx.beginPath();
  ctx.moveTo(0, 1);
  ctx.lineTo(w, midY);
  ctx.lineTo(0, h - 1);
  ctx.closePath();
  ctx.fill();

  ctx.globalAlpha = 0.85;
  ctx.fillStyle = '#ffd75e';
  ctx.beginPath();
  ctx.moveTo(0, h * 0.2);
  ctx.lineTo(w * 0.74, midY);
  ctx.lineTo(0, h * 0.8);
  ctx.closePath();
  ctx.fill();

  ctx.globalAlpha = 1;
  ctx.fillStyle = '#fffdf0';
  ctx.beginPath();
  ctx.moveTo(0, h * 0.34);
  ctx.lineTo(w * 0.42, midY);
  ctx.lineTo(0, h * 0.66);
  ctx.closePath();
  ctx.fill();

  glow(ctx, w * 0.1, midY, h * 0.5, 'rgba(255,220,150,0.6)');
}

export function drawSpark(ctx, size) {
  const c = size / 2;
  glow(ctx, c, c, c, 'rgba(255,215,94,0.9)');
  ctx.fillStyle = '#fffdf0';
  ctx.beginPath();
  ctx.arc(c, c, size * 0.2, 0, Math.PI * 2);
  ctx.fill();
}

export function drawSmoke(ctx, size) {
  const c = size / 2;
  // Soft radial falloff so scaling it up stays believable.
  const gradient = ctx.createRadialGradient(c, c, 0, c, c, c);
  gradient.addColorStop(0, 'rgba(120,113,102,0.85)');
  gradient.addColorStop(0.5, 'rgba(88,83,76,0.5)');
  gradient.addColorStop(1, 'rgba(60,56,51,0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(c, c, c, 0, Math.PI * 2);
  ctx.fill();
}

export function drawDebris(ctx, w, h) {
  ctx.beginPath();
  ctx.moveTo(0, h * 0.3);
  ctx.lineTo(w * 0.7, 0);
  ctx.lineTo(w, h * 0.7);
  ctx.lineTo(w * 0.3, h);
  ctx.closePath();
  fillRamp(ctx, 0, h, RUST);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 0.7;
  ctx.stroke();
}

export function drawFocusMarker(ctx, size) {
  const arm = size * 0.26;
  const thickness = Math.max(3, size * 0.055);
  ctx.fillStyle = BRASS.light;
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 3;

  const corners = [
    [0, 0, 1, 1],
    [size, 0, -1, 1],
    [0, size, 1, -1],
    [size, size, -1, -1],
  ];
  for (const [cx, cy, dx, dy] of corners) {
    ctx.fillRect(dx > 0 ? cx : cx - arm, dy > 0 ? cy : cy - thickness, arm, thickness);
    ctx.fillRect(dx > 0 ? cx : cx - thickness, dy > 0 ? cy : cy - arm, thickness, arm);
  }
  ctx.shadowBlur = 0;
}

export function drawPixel(ctx) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 1, 1);
}
