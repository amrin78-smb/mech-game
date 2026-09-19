/**
 * Turns the raw AI output in assets/raw/ into game ready files in
 * assets/sprites/. `npm run art:process`
 *
 * Per sprite:
 *   1. If the image has no meaningful alpha, chroma-key the solid green
 *      (#00FF00) background out, with tolerance for compression fringing and a
 *      1px despill so nothing keeps a green halo. OpenAI returns real
 *      transparency so this path is currently dormant, but it is what makes
 *      the Gemini branch of generate-art.ts usable.
 *   2. Trim fully transparent borders.
 *   3. Resize to the in-game display size, doubled for crispness.
 *
 * Sizing rule: match the placeholder's DOMINANT dimension (its larger side) and
 * preserve the art's own aspect. That matters for more than looks. Enemy
 * collision radius is derived from the texture as max(w, h) / 2, so pinning the
 * dominant side keeps every hitbox byte-identical to what the balance pass was
 * tuned against, while letting a chunky AI cannon stop being squashed into the
 * thin bar the placeholder happened to be. enemies.json `scale` is untouched
 * and keeps working, because the scale is already baked into the target size.
 *
 * Backgrounds are resized to 720 tall rather than 2560 wide: ParallaxBackground
 * builds a 1280x720 TileSprite and does not set tileScale, so a texture taller
 * than the play field would simply be cropped. They are then made seamless by
 * cross-fading the last 5% of the width back into the first 5%.
 *
 * Idempotent: rerunning produces identical bytes.
 */
import sharp from 'sharp';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const RAW = join(ROOT, 'assets', 'raw');
const OUT = join(ROOT, 'assets', 'sprites');
const ATLAS_JSON = join(ROOT, 'public', 'art', 'sprites.json');

/** Sprites are exported at twice their on screen size. */
const SUPERSAMPLE = 2;
/** Play field height; background layers are sized to it. */
const BG_HEIGHT = 720;
/** Where the ground meets the sky, matching the generated strips it replaces. */
const HORIZON = 0.5;
/** Fraction of the width cross-faded to make a background tile. */
const TILE_BLEND = 0.05;
/** Below this fraction of transparent pixels, assume there is no real alpha. */
const ALPHA_PRESENT_THRESHOLD = 0.02;

interface Job {
  /** File in assets/raw, without .png */
  raw: string;
  /** Output name, which is also the AssetKeys frame name. */
  out: string;
  kind: 'sprite' | 'background';
  /** Explicit size for outputs that have no atlas frame to match. */
  target?: { w: number; h: number };
}

const JOBS: Job[] = [
  { raw: 'mecha_legs', out: 'mecha_legs', kind: 'sprite' },
  { raw: 'mecha_torso', out: 'mecha_torso', kind: 'sprite' },
  { raw: 'mecha_cannon', out: 'mecha_cannon', kind: 'sprite' },
  { raw: 'mecha_turret', out: 'mecha_turret', kind: 'sprite' },
  { raw: 'enemy_rustcrawler', out: 'enemy_rustcrawler', kind: 'sprite' },
  { raw: 'enemy_scavenger_bike', out: 'enemy_scavenger_bike', kind: 'sprite' },
  { raw: 'enemy_plated_hulk', out: 'enemy_plated_hulk', kind: 'sprite' },
  { raw: 'enemy_gunner_walker', out: 'enemy_gunner_walker', kind: 'sprite' },
  { raw: 'boss_compactor', out: 'boss_compactor', kind: 'sprite' },
  { raw: 'projectile_shell', out: 'projectile_shell', kind: 'sprite' },
  // The generator calls it pickup_scrap; AssetKeys calls it scrap_pickup.
  { raw: 'pickup_scrap', out: 'scrap_pickup', kind: 'sprite' },
  { raw: 'enemy_drone_swarm', out: 'enemy_drone_swarm', kind: 'sprite' },
  { raw: 'enemy_shield_bearer', out: 'enemy_shield_bearer', kind: 'sprite' },
  { raw: 'boss_iron_matriarch', out: 'boss_iron_matriarch', kind: 'sprite' },
  { raw: 'enemy_incinerator_tank', out: 'enemy_incinerator_tank', kind: 'sprite' },
  { raw: 'enemy_burrower', out: 'enemy_burrower', kind: 'sprite' },
  { raw: 'enemy_elite_vanguard', out: 'enemy_elite_vanguard', kind: 'sprite' },
  { raw: 'boss_leviathan_engine', out: 'boss_leviathan_engine', kind: 'sprite' },
  { raw: 'projectile_flak', out: 'projectile_flak', kind: 'sprite' },
  // Cannon variants share the main cannon's footprint.
  { raw: 'weapon_acid_spitter', out: 'weapon_acid_spitter', kind: 'sprite', target: { w: 172, h: 30 } },
  { raw: 'weapon_railgun', out: 'weapon_railgun', kind: 'sprite', target: { w: 172, h: 30 } },
  { raw: 'bg_ash_sky', out: 'bg_ash_canyons_sky', kind: 'background' },
  { raw: 'bg_ash_ruins', out: 'bg_ash_canyons_ruins', kind: 'background' },
  { raw: 'bg_ash_ground', out: 'bg_ash_canyons_ground', kind: 'background' },
  { raw: 'bg_furnace_sky', out: 'bg_furnace_sky', kind: 'background' },
  { raw: 'bg_furnace_ruins', out: 'bg_furnace_ruins', kind: 'background' },
  { raw: 'bg_furnace_ground', out: 'bg_furnace_ground', kind: 'background' },
  { raw: 'escort_scrap_hound', out: 'escort_scrap_hound', kind: 'sprite', target: { w: 62, h: 62 } },
  { raw: 'escort_bulwark', out: 'escort_bulwark', kind: 'sprite', target: { w: 78, h: 78 } },
  { raw: 'portrait_vex', out: 'portrait_vex', kind: 'sprite', target: { w: 104, h: 104 } },
  { raw: 'portrait_mara', out: 'portrait_mara', kind: 'sprite', target: { w: 104, h: 104 } },
  { raw: 'title_emblem', out: 'title_emblem', kind: 'sprite', target: { w: 190, h: 190 } },
  { raw: 'bg_sky', out: 'bg_rust_flats_sky', kind: 'background' },
  { raw: 'bg_ruins', out: 'bg_rust_flats_ruins', kind: 'background' },
  { raw: 'bg_ground', out: 'bg_rust_flats_ground', kind: 'background' },
];

/** The placeholder sizes, read from the atlas the game shipped with. */
function loadTargets(): Map<string, { w: number; h: number }> {
  const atlas = JSON.parse(readFileSync(ATLAS_JSON, 'utf8')) as {
    frames: Record<string, { frame: { w: number; h: number } }>;
  };
  const map = new Map<string, { w: number; h: number }>();
  for (const [name, entry] of Object.entries(atlas.frames)) {
    map.set(name, { w: entry.frame.w, h: entry.frame.h });
  }
  return map;
}

async function hasMeaningfulAlpha(buffer: Buffer): Promise<boolean> {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let clear = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 16) clear += 1;
  }
  return clear / (info.width * info.height) > ALPHA_PRESENT_THRESHOLD;
}

/**
 * Keys out a green screen. Anything where green clearly dominates both other
 * channels becomes transparent; partly green edge pixels get their green pulled
 * down to the average of red and blue, which is what kills the halo.
 */
async function chromaKeyGreen(buffer: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const dominance = g - Math.max(r, b);

    if (dominance > 60) {
      data[i + 3] = 0;
    } else if (dominance > 18) {
      // Fringe: keep the pixel but despill and fade it out proportionally.
      const despilled = Math.round((r + b) / 2);
      data[i + 1] = despilled;
      data[i + 3] = Math.round(data[i + 3] * (1 - (dominance - 18) / 42));
    }
  }

  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();
}

/** Cross-fades the tail of the strip back over its head so it tiles seamlessly. */
async function makeTileable(buffer: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const blend = Math.max(1, Math.round(width * TILE_BLEND));
  const outWidth = width - blend;

  const out = Buffer.alloc(outWidth * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < outWidth; x += 1) {
      const dst = (y * outWidth + x) * 4;
      const src = (y * width + x) * 4;

      if (x >= blend) {
        out[dst] = data[src];
        out[dst + 1] = data[src + 1];
        out[dst + 2] = data[src + 2];
        out[dst + 3] = data[src + 3];
        continue;
      }

      // Blend the discarded tail (which used to precede x=0 when wrapped) in.
      const tail = (y * width + (outWidth + x)) * 4;
      const t = x / blend;
      for (let c = 0; c < 4; c += 1) {
        out[dst + c] = Math.round(data[src + c] * t + data[tail + c] * (1 - t));
      }
    }
  }

  return sharp(out, { raw: { width: outWidth, height, channels: 4 } }).png().toBuffer();
}

async function processSprite(job: Job, target: { w: number; h: number }): Promise<string> {
  let buffer = readFileSync(join(RAW, `${job.raw}.png`));
  const source = await sharp(buffer).metadata();

  const keyed = !(await hasMeaningfulAlpha(buffer));
  if (keyed) buffer = await chromaKeyGreen(buffer);

  // Trim the transparent margin so the art fills its box.
  buffer = await sharp(buffer).trim({ threshold: 1 }).png().toBuffer();
  const trimmed = await sharp(buffer).metadata();
  const tw = trimmed.width ?? 1;
  const th = trimmed.height ?? 1;

  // Pin the LARGER output side to the larger placeholder side. Collision radius
  // is max(w, h) / 2, so this is what actually preserves every hitbox: matching
  // the target's dominant axis is not enough when the art is taller than the
  // placeholder was wide, which is how the shield bearer and elite vanguard
  // quietly grew by 12 and 22 percent on the first pass.
  const scale = Math.max(target.w, target.h) / Math.max(tw, th);
  const outW = Math.max(1, Math.round(tw * scale * SUPERSAMPLE));
  const outH = Math.max(1, Math.round(th * scale * SUPERSAMPLE));

  await sharp(buffer)
    .resize(outW, outH, { fit: 'fill', kernel: 'lanczos3' })
    .png({ compressionLevel: 9 })
    .toFile(join(OUT, `${job.out}.png`));

  return (
    `${job.out.padEnd(24)} src ${source.width}x${source.height}` +
    ` -> trim ${tw}x${th} -> out ${outW}x${outH}` +
    ` (display ${Math.round(outW / SUPERSAMPLE)}x${Math.round(outH / SUPERSAMPLE)})` +
    ` ${keyed ? 'chroma-keyed' : 'alpha kept'}`
  );
}

/**
 * The three layers stack sky -> ruins -> ground, all as full height tile
 * sprites, so anything opaque above the horizon in a nearer layer hides the
 * ones behind it. The generator returns the ground as a complete opaque scene,
 * which blanked the sky and skyline entirely on the first pass.
 *
 * So each layer is composed onto a transparent 720 tall canvas at the place it
 * actually belongs: ground occupies the lower half from the horizon down, with
 * a short alpha ramp so the join is not a hard line, and the skyline is dropped
 * so its silhouettes stand ON the horizon rather than floating.
 */
async function processBackground(job: Job): Promise<string> {
  const raw = readFileSync(join(RAW, `${job.raw}.png`));
  const source = await sharp(raw).metadata();
  const srcAspect = (source.width ?? 1) / (source.height ?? 1);
  const width = Math.round(BG_HEIGHT * srcAspect);
  const horizon = Math.round(BG_HEIGHT * HORIZON);

  let keyed = false;
  let buffer = raw;
  if (job.raw.endsWith('_ruins') && !(await hasMeaningfulAlpha(buffer))) {
    buffer = await chromaKeyGreen(buffer);
    keyed = true;
  }

  let note = '';

  if (job.raw.endsWith('_sky')) {
    // Backmost layer: fills the frame, stays opaque.
    buffer = await sharp(buffer)
      .resize(width, BG_HEIGHT, { fit: 'cover', kernel: 'lanczos3' })
      .png()
      .toBuffer();
    note = 'full frame';
  } else if (job.raw.endsWith('_ground')) {
    const bandHeight = BG_HEIGHT - horizon;
    const band = await sharp(buffer)
      .resize(width, bandHeight, { fit: 'cover', position: 'bottom', kernel: 'lanczos3' })
      .ensureAlpha()
      .raw()
      .toBuffer();

    // Feather the top edge so the horizon reads as haze, not a cut.
    const feather = Math.round(bandHeight * 0.06);
    for (let y = 0; y < feather; y += 1) {
      const a = y / feather;
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4 + 3;
        band[i] = Math.round(band[i] * a);
      }
    }

    buffer = await sharp({
      create: { width, height: BG_HEIGHT, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([
        {
          input: band,
          raw: { width, height: bandHeight, channels: 4 },
          top: horizon,
          left: 0,
        },
      ])
      .png()
      .toBuffer();
    note = `band ${width}x${bandHeight} at y=${horizon}`;
  } else {
    // Ruins: scale, then sit the silhouettes' feet on the horizon.
    const scaled = await sharp(buffer)
      .resize(width, BG_HEIGHT, { fit: 'inside', kernel: 'lanczos3' })
      .png()
      .toBuffer();
    const { data, info } = await sharp(scaled).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

    let bottom = 0;
    for (let y = 0; y < info.height; y += 1) {
      for (let x = 0; x < info.width; x += 1) {
        if (data[(y * info.width + x) * 4 + 3] > 40) {
          bottom = y;
          break;
        }
      }
    }
    // Tuck the feet just below the horizon so the ground overlaps them.
    const top = horizon + 12 - bottom;

    buffer = await sharp({
      create: {
        width: info.width,
        height: BG_HEIGHT,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([{ input: scaled, top, left: 0 }])
      .png()
      .toBuffer();
    note = `skyline feet at y=${horizon + 12}`;
  }

  buffer = await makeTileable(buffer);
  const final = await sharp(buffer).metadata();
  await sharp(buffer).png({ compressionLevel: 9 }).toFile(join(OUT, `${job.out}.png`));

  return (
    `${job.out.padEnd(24)} src ${source.width}x${source.height}` +
    ` -> out ${final.width}x${final.height} tileable, ${note}` +
    ` ${keyed ? 'chroma-keyed' : 'alpha kept'}`
  );
}

async function main(): Promise<void> {
  if (!existsSync(RAW)) {
    console.error(`No ${RAW}. Run the generator first.`);
    process.exit(1);
  }
  mkdirSync(OUT, { recursive: true });
  const targets = loadTargets();

  const missing = JOBS.filter((j) => !existsSync(join(RAW, `${j.raw}.png`)));
  if (missing.length) {
    console.error(`Missing raw art: ${missing.map((m) => m.raw).join(', ')}`);
    process.exit(1);
  }

  for (const job of JOBS) {
    if (job.kind === 'background') {
      console.log(await processBackground(job));
      continue;
    }
    const target = job.target ?? targets.get(job.out);
    if (target === undefined) {
      console.error(`No placeholder size for "${job.out}" in the atlas; cannot match it.`);
      process.exit(1);
    }
    console.log(await processSprite(job, target));
  }

  console.log(`\n${JOBS.length} assets written to assets/sprites/ at ${SUPERSAMPLE}x display size.`);
}

main();
