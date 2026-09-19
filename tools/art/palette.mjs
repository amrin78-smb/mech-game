/**
 * Dieselpunk palette and drawing helpers for the sprite generator.
 *
 * The art is authored as code rather than painted, so it is reproducible,
 * diffable and regenerable at any size. Each material is a four step ramp:
 * shadow, base, light, highlight. Using ramps rather than flat fills is most of
 * what separates "blocks" from something that reads as metal.
 */

export const RUST = {
  shadow: '#2e1610',
  dark: '#54291a',
  base: '#8a4426',
  light: '#b26b3c',
  highlight: '#d59a63',
};

export const IRON = {
  shadow: '#15140f',
  dark: '#2b2823',
  base: '#48443a',
  light: '#6d665c',
  highlight: '#948b7d',
};

export const BRASS = {
  shadow: '#4a3a0e',
  dark: '#7d6118',
  base: '#b58c22',
  light: '#e0b43a',
  highlight: '#f7dc83',
};

export const ENEMY_LIGHT = {
  shadow: '#33100d',
  dark: '#5c1c16',
  base: '#8d2e23',
  light: '#b54a35',
  highlight: '#d47455',
};

export const ENEMY_ARMORED = {
  shadow: '#1b1a18',
  dark: '#35322d',
  base: '#565046',
  light: '#7b7264',
  highlight: '#9f9484',
};

export const ENEMY_SHIELDED = {
  shadow: '#122a33',
  dark: '#1f4c5a',
  base: '#2f778b',
  light: '#4aa3bb',
  highlight: '#83d4e4',
};

export const ENEMY_SWARM = {
  shadow: '#2b2412',
  dark: '#4d4120',
  base: '#7a6730',
  light: '#a68e45',
  highlight: '#ccb168',
};

export const OUTLINE = '#120d0a';
export const SOOT = '#1a1614';

/** Deterministic RNG, so regenerating the art produces identical bytes. */
export function makeRng(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0xffffffff;
  };
}

/** Vertical light-to-dark ramp, the base of every metal surface. */
export function shade(ctx, x, y, w, h, ramp, { flip = false } = {}) {
  const gradient = ctx.createLinearGradient(0, y, 0, y + h);
  if (flip) {
    gradient.addColorStop(0, ramp.dark);
    gradient.addColorStop(0.45, ramp.base);
    gradient.addColorStop(1, ramp.light);
  } else {
    gradient.addColorStop(0, ramp.light);
    gradient.addColorStop(0.5, ramp.base);
    gradient.addColorStop(1, ramp.dark);
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, w, h);
}

/** A lit top edge and a shadowed bottom edge: cheap, and reads as thickness. */
export function bevel(ctx, x, y, w, h, ramp, thickness = 1) {
  ctx.fillStyle = ramp.highlight;
  ctx.fillRect(x, y, w, thickness);
  ctx.fillStyle = ramp.shadow;
  ctx.fillRect(x, y + h - thickness, w, thickness);
}

/** Dark keyline around a filled shape. The single biggest readability win. */
export function outlineRect(ctx, x, y, w, h, color = OUTLINE, thickness = 1) {
  ctx.strokeStyle = color;
  ctx.lineWidth = thickness;
  ctx.strokeRect(x + thickness / 2, y + thickness / 2, w - thickness, h - thickness);
}

export function outlinePath(ctx, color = OUTLINE, thickness = 1) {
  ctx.strokeStyle = color;
  ctx.lineWidth = thickness;
  ctx.stroke();
}

/** A row of rivets along an edge. */
export function rivets(ctx, x, y, width, count, ramp, radius = 1.2) {
  if (count < 1) return;
  const step = width / count;
  for (let i = 0; i < count; i += 1) {
    const cx = x + step * (i + 0.5);
    ctx.fillStyle = ramp.shadow;
    ctx.beginPath();
    ctx.arc(cx, y + 0.4, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ramp.highlight;
    ctx.beginPath();
    ctx.arc(cx, y - 0.3, radius * 0.75, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Vertical rust weeping, which is what sells "abandoned machine". */
export function streaks(ctx, x, y, w, h, rng, { count = 6, color = RUST.dark, alpha = 0.3 } = {}) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  for (let i = 0; i < count; i += 1) {
    const sx = x + rng() * w;
    const sw = 0.7 + rng() * 1.8;
    const sh = h * (0.25 + rng() * 0.7);
    ctx.fillRect(sx, y + rng() * h * 0.3, sw, sh);
  }
  ctx.restore();
}

/** Scattered grime, breaking up flat areas without looking like noise. */
export function grime(ctx, x, y, w, h, rng, { count = 18, alpha = 0.16 } = {}) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = SOOT;
  for (let i = 0; i < count; i += 1) {
    const px = x + rng() * w;
    const py = y + rng() * h;
    const size = 0.8 + rng() * 2.2;
    ctx.fillRect(px, py, size, size * 0.7);
  }
  ctx.restore();
}

/** Recessed panel line. */
export function panelLine(ctx, x1, y1, x2, y2, ramp) {
  ctx.strokeStyle = ramp.shadow;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.strokeStyle = ramp.light;
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.moveTo(x1, y1 + 1);
  ctx.lineTo(x2, y2 + 1);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** A glowing lamp or vent, drawn as a soft radial bloom. */
export function glow(ctx, cx, cy, radius, color) {
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Soft elliptical shadow at the foot of a unit. Baked into the sprite rather
 * than drawn as a separate object, so it costs nothing at runtime and cannot
 * desync from the thing casting it.
 */
export function contactShadow(ctx, cx, cy, rx, ry, alpha = 0.42) {
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
  gradient.addColorStop(0, `rgba(0,0,0,${alpha})`);
  gradient.addColorStop(0.6, `rgba(0,0,0,${alpha * 0.45})`);
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, ry / rx);
  ctx.translate(-cx, -cy);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(cx, cy, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Fills the current path with a vertical ramp instead of a flat colour. */
export function fillRamp(ctx, y, h, ramp, { flip = false } = {}) {
  const gradient = ctx.createLinearGradient(0, y, 0, y + h);
  if (flip) {
    gradient.addColorStop(0, ramp.dark);
    gradient.addColorStop(1, ramp.light);
  } else {
    gradient.addColorStop(0, ramp.light);
    gradient.addColorStop(0.55, ramp.base);
    gradient.addColorStop(1, ramp.dark);
  }
  ctx.fillStyle = gradient;
  ctx.fill();
}

/** Rounded rectangle path helper; @napi-rs/canvas has roundRect but be explicit. */
export function roundedPath(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

export function rampFor(armorClass) {
  switch (armorClass) {
    case 'light':
      return ENEMY_LIGHT;
    case 'armored':
      return ENEMY_ARMORED;
    case 'shielded':
      return ENEMY_SHIELDED;
    case 'swarm':
      return ENEMY_SWARM;
    default:
      return ENEMY_LIGHT;
  }
}
