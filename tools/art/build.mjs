/**
 * Renders every sprite to a packed texture atlas plus the parallax strips.
 * `npm run art`
 *
 * Output lands in public/art, which Vite serves at /art, so the game loads real
 * image files instead of generating shapes at runtime. The art is still code,
 * so it is diffable and regenerable, but the cost is paid once at build time
 * rather than on every boot.
 *
 * Enemy frames are rasterised at their final on screen size (armor class base
 * times the def's `scale`). That keeps a 3.2x boss crisp instead of upscaling a
 * small frame, and it preserves the collision radii the balance pass was tuned
 * against, since radius derives from texture size.
 */
import { createCanvas } from '@napi-rs/canvas';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { THEMES, drawGround, drawRuins, drawSky } from './backgrounds.mjs';
import { drawEnemy } from './enemies.mjs';
import { drawMechaCannon, drawMechaLegs, drawMechaTorso, drawMechaTurret } from './mecha.mjs';
import {
  drawDebris,
  drawFlakShell,
  drawFocusMarker,
  drawMuzzleFlash,
  drawPixel,
  drawScrap,
  drawShell,
  drawSmoke,
  drawSpark,
} from './props.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const OUT_DIR = join(ROOT, 'public', 'art');

/** Must match ENEMY_BASE_SIZE the gameplay was balanced against. */
const ENEMY_BASE_SIZE = {
  light: { width: 48, height: 32 },
  armored: { width: 56, height: 46 },
  shielded: { width: 52, height: 50 },
  swarm: { width: 26, height: 22 },
};

const BG_WIDTH = { sky: 256, ruins: 512, ground: 512 };
const BG_HEIGHT = 720;
/** Gap between atlas frames, so bilinear sampling cannot bleed across them. */
const PADDING = 2;

function render(width, height, draw) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  draw(ctx, width, height);
  return { canvas, width, height };
}

function buildSprites(enemies) {
  const sprites = [];
  const add = (name, width, height, draw) =>
    sprites.push({ name, ...render(width, height, draw) });

  add('mecha_legs', 124, 150, drawMechaLegs);
  add('mecha_torso', 164, 132, drawMechaTorso);
  add('mecha_cannon', 172, 30, drawMechaCannon);
  add('mecha_turret', 54, 20, drawMechaTurret);

  add('projectile_shell', 16, 6, drawShell);
  add('projectile_flak', 12, 8, drawFlakShell);
  add('scrap_pickup', 16, 16, (ctx, w) => drawScrap(ctx, w));

  add('muzzle_flash', 56, 36, drawMuzzleFlash);
  add('spark', 8, 8, (ctx, w) => drawSpark(ctx, w));
  add('smoke_puff', 28, 28, (ctx, w) => drawSmoke(ctx, w));
  add('debris', 9, 6, drawDebris);
  add('focus_marker', 72, 72, (ctx, w) => drawFocusMarker(ctx, w));
  add('ui_pixel', 1, 1, drawPixel);

  for (const def of enemies) {
    const base = ENEMY_BASE_SIZE[def.armorClass];
    const width = Math.max(8, Math.round(base.width * def.scale));
    const height = Math.max(8, Math.round(base.height * def.scale));
    add(def.spriteKey, width, height, (ctx, w, h) => drawEnemy(ctx, def, w, h));
  }

  return sprites;
}

/**
 * Shelf packer: sort by height, lay rows left to right. Good enough for a few
 * dozen frames and it keeps the atlas readable when you open it.
 */
function pack(sprites) {
  const ordered = [...sprites].sort((a, b) => b.height - a.height);
  const maxWidth = 1024;

  let x = PADDING;
  let y = PADDING;
  let rowHeight = 0;
  let usedWidth = 0;

  for (const sprite of ordered) {
    if (x + sprite.width + PADDING > maxWidth) {
      x = PADDING;
      y += rowHeight + PADDING;
      rowHeight = 0;
    }
    sprite.x = x;
    sprite.y = y;
    x += sprite.width + PADDING;
    rowHeight = Math.max(rowHeight, sprite.height);
    usedWidth = Math.max(usedWidth, x);
  }

  const height = y + rowHeight + PADDING;
  return { width: nextPowerOfTwo(usedWidth), height: nextPowerOfTwo(height), sprites: ordered };
}

function nextPowerOfTwo(value) {
  let result = 1;
  while (result < value) result *= 2;
  return result;
}

function writeAtlas(packed) {
  const canvas = createCanvas(packed.width, packed.height);
  const ctx = canvas.getContext('2d');

  for (const sprite of packed.sprites) {
    ctx.drawImage(sprite.canvas, sprite.x, sprite.y);
  }

  writeFileSync(join(OUT_DIR, 'sprites.png'), canvas.toBuffer('image/png'));

  const frames = {};
  for (const sprite of packed.sprites) {
    frames[sprite.name] = {
      frame: { x: sprite.x, y: sprite.y, w: sprite.width, h: sprite.height },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: sprite.width, h: sprite.height },
      sourceSize: { w: sprite.width, h: sprite.height },
    };
  }

  writeFileSync(
    join(OUT_DIR, 'sprites.json'),
    `${JSON.stringify(
      {
        frames,
        meta: {
          app: 'tools/art/build.mjs',
          image: 'sprites.png',
          format: 'RGBA8888',
          size: { w: packed.width, h: packed.height },
          scale: '1',
        },
      },
      null,
      2,
    )}\n`,
  );

  return packed.sprites.length;
}

function writeBackgrounds() {
  let count = 0;
  for (const [theme, palette] of Object.entries(THEMES)) {
    const layers = {
      sky: (ctx, w, h) => drawSky(ctx, w, h, palette),
      ruins: (ctx, w, h) => drawRuins(ctx, w, h, palette),
      ground: (ctx, w, h) => drawGround(ctx, w, h, palette),
    };
    for (const [layer, draw] of Object.entries(layers)) {
      const { canvas } = render(BG_WIDTH[layer], BG_HEIGHT, draw);
      writeFileSync(join(OUT_DIR, `bg_${theme}_${layer}.png`), canvas.toBuffer('image/png'));
      count += 1;
    }
  }
  return count;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const { readFileSync } = await import('node:fs');
  const enemies = JSON.parse(
    readFileSync(join(ROOT, 'src', 'data', 'enemies.json'), 'utf8'),
  );

  const sprites = buildSprites(enemies);
  const packed = pack(sprites);
  const frameCount = writeAtlas(packed);
  const bgCount = writeBackgrounds();

  console.log(
    `art built\n` +
      `  atlas   public/art/sprites.png  ${packed.width}x${packed.height}, ${frameCount} frames\n` +
      `  strips  ${bgCount} parallax layers across ${Object.keys(THEMES).length} themes`,
  );
}

main();
