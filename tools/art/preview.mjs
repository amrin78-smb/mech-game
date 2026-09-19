/**
 * Composes a mock battle frame from the generated art, using the same layout
 * numbers the game uses. `npm run art:preview`
 *
 * This is a proofing tool, not part of the game: it exists so the art can be
 * judged in composition, at the real sizes and positions, without booting the
 * engine. Written to tools/art/preview.png and ignored by git.
 */
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const ART = join(ROOT, 'public', 'art');

const tuning = JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'tuning.json'), 'utf8'));
const enemies = JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'enemies.json'), 'utf8'));

const W = tuning.world.baseWidth;
const H = tuning.world.baseHeight;
const MECHA_X = W * tuning.world.mechaXFraction;
const LANES = tuning.mecha.lanesY.map((f) => H * f);
const GROUND_Y = LANES[LANES.length - 1];
/** Matches TORSO_OVERLAP in Mecha.ts. */
const TORSO_OVERLAP = 14;

const theme = process.argv.includes('--furnace')
  ? 'furnace'
  : process.argv.includes('--ash')
    ? 'ash_canyons'
    : 'rust_flats';

/** Tiles a strip across the full width, as Phaser's TileSprite does. */
function tile(ctx, image) {
  for (let x = 0; x < W; x += image.width) {
    ctx.drawImage(image, x, 0);
  }
}

function frameOf(atlasJson, name) {
  const entry = atlasJson.frames[name];
  if (!entry) throw new Error(`No atlas frame "${name}"`);
  return entry.frame;
}

function drawFrame(ctx, atlas, atlasJson, name, x, y, originX, originY) {
  const f = frameOf(atlasJson, name);
  ctx.drawImage(atlas, f.x, f.y, f.w, f.h, x - f.w * originX, y - f.h * originY, f.w, f.h);
  return f;
}

async function main() {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  const atlasJson = JSON.parse(readFileSync(join(ART, 'sprites.json'), 'utf8'));
  const atlas = await loadImage(join(ART, 'sprites.png'));

  for (const layer of ['sky', 'ruins', 'ground']) {
    tile(ctx, await loadImage(join(ART, `bg_${theme}_${layer}.png`)));
  }

  // A spread of enemies across the lanes, closing on the mecha.
  const cast = [
    ['rustcrawler', 980, 2],
    ['scavenger_bike', 1180, 1],
    ['plated_hulk', 760, 2],
    ['gunner_walker', 900, 0],
    ['shield_bearer', 620, 1],
    ['drone_swarm', 1080, 0],
    ['incinerator_tank', 1230, 2],
    ['burrower', 520, 2],
    ['elite_vanguard', 430, 0],
  ];

  for (const [id, x, lane] of cast) {
    const def = enemies.find((e) => e.id === id);
    if (!def) continue;
    const flying = def.flying === true ? tuning.world.flyingYOffset : 0;
    drawFrame(ctx, atlas, atlasJson, def.spriteKey, x, LANES[lane] - flying, 0.5, 1);
  }

  // The boss of the chosen zone, sitting behind the trash.
  const boss =
    theme === 'furnace'
      ? 'boss_leviathan_engine'
      : theme === 'ash_canyons'
        ? 'boss_iron_matriarch'
        : 'boss_compactor';
  const bossDef = enemies.find((e) => e.id === boss);
  if (bossDef) drawFrame(ctx, atlas, atlasJson, bossDef.spriteKey, 1120, LANES[1], 0.5, 1);

  // Mecha, assembled exactly as Mecha.ts stacks it.
  const legs = drawFrame(ctx, atlas, atlasJson, 'mecha_legs', MECHA_X, GROUND_Y, 0.5, 1);
  const upperY = GROUND_Y - legs.h + TORSO_OVERLAP;
  const torso = drawFrame(ctx, atlas, atlasJson, 'mecha_torso', MECHA_X, upperY, 0.5, 1);

  const turret = frameOf(atlasJson, 'mecha_turret');
  const [tx, ty] = tuning.mecha.turretMountOffsets[0];
  ctx.drawImage(
    atlas,
    turret.x,
    turret.y,
    turret.w,
    turret.h,
    MECHA_X + tx - turret.w * 0.15,
    upperY + ty - turret.h * 0.5,
    turret.w,
    turret.h,
  );

  const cannon = frameOf(atlasJson, 'mecha_cannon');
  ctx.save();
  ctx.translate(MECHA_X + torso.w * 0.14, upperY + torso.h * -0.62);
  ctx.rotate(-0.12);
  ctx.drawImage(
    atlas,
    cannon.x,
    cannon.y,
    cannon.w,
    cannon.h,
    -cannon.w * 0.08,
    -cannon.h * 0.5,
    cannon.w,
    cannon.h,
  );
  ctx.restore();

  writeFileSync(join(HERE, 'preview.png'), canvas.toBuffer('image/png'));
  console.log(`preview written: tools/art/preview.png (${theme})`);
}

main();
