/**
 * Three layer parallax strips per zone.
 *
 * Every strip tiles horizontally, so nothing may cross the left or right edge:
 * shapes are placed inside a safe margin, and the gradients are vertical only.
 * Depth comes from atmospheric perspective, distant shapes sit closer to the
 * sky colour rather than being merely smaller.
 */
import { makeRng } from './palette.mjs';

export const THEMES = {
  rust_flats: {
    skyTop: '#241f1b',
    skyMid: '#6b5a46',
    skyBottom: '#b49a74',
    haze: 'rgba(200,170,130,0.5)',
    far: '#4a4038',
    near: '#2b241e',
    groundTop: '#5a4a39',
    groundBottom: '#2a2018',
    crack: '#1a1410',
    rubble: '#6b5a46',
  },
  ash_canyons: {
    skyTop: '#1e232b',
    skyMid: '#4d5765',
    skyBottom: '#98a2b0',
    haze: 'rgba(170,182,198,0.5)',
    far: '#4b5462',
    near: '#2a3038',
    groundTop: '#4d545e',
    groundBottom: '#22262c',
    crack: '#161a1f',
    rubble: '#616a76',
  },
  furnace: {
    skyTop: '#1c0c0a',
    skyMid: '#6e2a15',
    skyBottom: '#c96a2a',
    haze: 'rgba(230,140,60,0.45)',
    far: '#4a2418',
    near: '#20100c',
    groundTop: '#4a2a1c',
    groundBottom: '#1c0e0a',
    crack: '#c9481c',
    rubble: '#5d3320',
  },
  // Zone 4, a flooded refinery basin: cold and wet against the furnace's heat,
  // so the two zones never read as the same place. Placeholder strips until
  // this theme goes through the AI art pass like the first three.
  drowned_works: {
    skyTop: '#08161a',
    skyMid: '#1d4448',
    skyBottom: '#74a39a',
    haze: 'rgba(140,185,175,0.45)',
    far: '#24403f',
    near: '#122220',
    groundTop: '#2f4744',
    groundBottom: '#0e1a1a',
    crack: '#5fd6c2',
    rubble: '#3f5c57',
  },
};

const HORIZON = 0.5;

export function drawSky(ctx, w, h, theme) {
  const gradient = ctx.createLinearGradient(0, 0, 0, h * HORIZON + 40);
  gradient.addColorStop(0, theme.skyTop);
  gradient.addColorStop(0.62, theme.skyMid);
  gradient.addColorStop(1, theme.skyBottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);

  // Horizontal cloud banding. Full width bars tile cleanly by construction.
  const rng = makeRng(0x5c1);
  ctx.save();
  for (let i = 0; i < 14; i += 1) {
    const y = rng() * h * HORIZON;
    const bandH = 2 + rng() * 9;
    ctx.globalAlpha = 0.04 + rng() * 0.07;
    ctx.fillStyle = i % 2 === 0 ? '#000000' : '#ffffff';
    ctx.fillRect(0, y, w, bandH);
  }
  ctx.restore();

  // Haze thickening towards the horizon.
  const haze = ctx.createLinearGradient(0, h * HORIZON - 120, 0, h * HORIZON + 10);
  haze.addColorStop(0, 'rgba(0,0,0,0)');
  haze.addColorStop(1, theme.haze);
  ctx.fillStyle = haze;
  ctx.fillRect(0, h * HORIZON - 120, w, 130);
}

export function drawRuins(ctx, w, h, theme) {
  const groundY = Math.round(h * HORIZON);
  const rng = makeRng(0x9a17);

  // Far layer: washed out towards the sky colour.
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = theme.far;
  let x = 14;
  while (x < w - 60) {
    const bw = 26 + rng() * 64;
    const bh = 50 + rng() * 150;
    ctx.fillRect(x, groundY - bh, Math.min(bw, w - 20 - x), bh);
    x += bw + 8 + rng() * 26;
  }
  ctx.restore();

  // Near layer: solid, with window rows and a few chimneys.
  ctx.fillStyle = theme.near;
  x = 22;
  const blocks = [];
  while (x < w - 80) {
    const bw = 34 + rng() * 52;
    const bh = 90 + rng() * 165;
    const clamped = Math.min(bw, w - 26 - x);
    ctx.fillRect(x, groundY - bh, clamped, bh);
    blocks.push([x, bh, clamped]);
    x += clamped + 18 + rng() * 40;
  }

  for (const [bx, bh, bw] of blocks) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = theme.skyBottom;
    for (let wy = groundY - bh + 16; wy < groundY - 18; wy += 24) {
      for (let wx = bx + 6; wx < bx + bw - 10; wx += 14) {
        if (rng() > 0.45) continue;
        ctx.fillRect(wx, wy, 6, 8);
      }
    }
    ctx.restore();
    // Broken roofline.
    ctx.fillStyle = theme.near;
    ctx.fillRect(bx - 2, groundY - bh - 4, bw * 0.4, 6);
  }

  // Chimney stacks well inside the tile edges.
  ctx.fillStyle = theme.near;
  for (const [cx, ch] of [
    [Math.round(w * 0.32), 250],
    [Math.round(w * 0.71), 220],
  ]) {
    ctx.fillRect(cx, groundY - ch, 15, ch);
    ctx.fillRect(cx - 3, groundY - ch, 21, 7);
  }
}

export function drawGround(ctx, w, h, theme) {
  const groundY = Math.round(h * HORIZON);
  const groundH = h - groundY;
  const rng = makeRng(0x3f2d);

  const gradient = ctx.createLinearGradient(0, groundY, 0, h);
  gradient.addColorStop(0, theme.groundTop);
  gradient.addColorStop(1, theme.groundBottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, groundY, w, groundH);

  // A darker lip right at the horizon so the layers separate.
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, groundY, w, 6);

  // Cracks: thin tapered wedges, denser near the camera.
  for (let i = 0; i < 26; i += 1) {
    const depth = rng();
    const y = groundY + 10 + depth * depth * (groundH - 16);
    const len = 30 + rng() * 150 * (0.4 + depth);
    const x = 8 + rng() * (w - len - 16);
    ctx.save();
    ctx.globalAlpha = 0.35 + depth * 0.4;
    ctx.fillStyle = theme.crack;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len, y + (rng() - 0.5) * 6);
    ctx.lineTo(x + len * 0.5, y + 1.5 + depth * 2.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Scattered rubble, lit from above.
  for (let i = 0; i < 34; i += 1) {
    const depth = rng();
    const y = groundY + 14 + depth * depth * (groundH - 22);
    const x = 10 + rng() * (w - 26);
    const size = 3 + depth * 9;
    ctx.save();
    ctx.globalAlpha = 0.5 + depth * 0.4;
    ctx.fillStyle = theme.crack;
    ctx.fillRect(x, y, size, size * 0.5);
    ctx.fillStyle = theme.rubble;
    ctx.fillRect(x, y, size, Math.max(1, size * 0.18));
    ctx.restore();
  }

  // Vignette towards the bottom, keeping the HUD readable over it.
  const vignette = ctx.createLinearGradient(0, h - 90, 0, h);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.4)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, h - 90, w, 90);
}
