/**
 * Batch art generation for Scrap Titan, zone 1 asset set.
 *
 * Generates all 15 assets in one run and saves PNGs to assets/raw/.
 * Supports two providers, picked automatically from which key is set:
 *
 *   FREE:  Google Gemini (model gemini-2.5-flash-image). Get a free API key
 *          at Google AI Studio (aistudio.google.com) with any Google account,
 *          no credit card. Free tier allows hundreds of images per day.
 *            export GEMINI_API_KEY=...
 *          Gemini cannot output transparency, so sprites are generated on a
 *          solid green background and chroma-keyed later (see handoff below).
 *
 *   PAID:  OpenAI Images API (platform.openai.com, pay per use).
 *            export OPENAI_API_KEY=sk-...
 *          Sprites come back with real transparency, no keying needed.
 *
 * Run:
 *   npx tsx scripts/generate-art.ts            # generate everything missing
 *   npx tsx scripts/generate-art.ts --force    # regenerate everything
 *   npx tsx scripts/generate-art.ts enemy_rustcrawler boss_compactor   # only these
 *
 * The script skips assets whose PNG already exists (unless --force or named
 * explicitly), so: run, review assets/raw/, delete the bad ones, run again.
 *
 * After generating, tell Claude Code:
 *   "Art is in assets/raw/. Write scripts/process-art.ts using sharp that,
 *    for each sprite: if the image has no meaningful alpha, chroma-key the
 *    solid green (#00FF00) background to transparency with tolerance for
 *    edge fringing; then trim transparent borders and resize to the in-game
 *    target size derived from the placeholder dimensions in PreloadScene
 *    (keep 2x for crispness). For bg_ layers no keying (except bg_ruins sky
 *    if green), resize to 2560 wide and make them tile by cross-fading the
 *    last 5 percent into the start. Update PreloadScene to load these for
 *    the existing AssetKeys, keeping the placeholder generator behind a
 *    USE_PLACEHOLDER_ART flag. Do not change gameplay code."
 */

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const OUT_DIR = join(process.cwd(), "assets", "raw");
const OPENAI_MODEL = process.env.ART_MODEL ?? "gpt-image-1.5";
const OPENAI_QUALITY = process.env.ART_QUALITY ?? "medium";
const GEMINI_MODEL = process.env.ART_MODEL ?? "gemini-2.5-flash-image";

const STYLE = `2D game sprite for a side-scrolling dieselpunk tower defense game. Hand-painted stylized look, NOT pixel art, NOT photorealistic. Strong readable silhouette, slightly exaggerated proportions, clean dark outlines, flat cel shading with one shadow tone and one highlight tone. Palette: rust orange, oxidized brass, gunmetal grey, oil-stain brown, with small warm accents (hazard yellow, ember red). Single object centered, no ground shadow, no scenery, no text, no watermark. Crisp edges suitable for use as a game sprite.`;

const BG_STYLE = `Background layer art for a side-scrolling dieselpunk tower defense game. Hand-painted stylized look, NOT pixel art, NOT photorealistic. Muted, unsaturated dieselpunk palette: ochre, ash grey, oil-stain brown. No text, no watermark. Horizontally tileable: the left and right edges must match seamlessly.`;

const GREEN_BG = ` The entire background is a plain, flat, solid pure green (#00FF00) with nothing else on it, so the object can be cut out cleanly.`;

interface Asset {
  key: string;
  prompt: string;
  size: string; // WIDTHxHEIGHT for OpenAI; mapped to aspect ratio for Gemini
  transparent: boolean; // wants a cut-out sprite (transparent on OpenAI, green screen on Gemini)
}

const ASSETS: Asset[] = [
  // Mecha parts, face RIGHT, layered in-game
  { key: "mecha_legs", size: "1024x1024", transparent: true,
    prompt: "The LEGS AND HIP SECTION ONLY of a colossal walking war mecha, facing RIGHT. Two thick digitigrade legs with riveted armor plates, hydraulic pistons, huge flat feet. Cut off cleanly at the waist, no torso, no arms, no weapons. Battle-worn with scratches and rust streaks." },
  { key: "mecha_torso", size: "1024x1024", transparent: true,
    prompt: "The TORSO ONLY of a colossal war mecha, facing RIGHT. Boxy riveted chest armor, a small armored cockpit window glowing warm yellow, two exhaust stacks on the back, a flat mounting shoulder on top where a cannon will attach. No legs, no arms, no weapons. Dieselpunk greebles: pipes, vents, hazard stripes." },
  { key: "mecha_cannon", size: "1536x1024", transparent: true,
    prompt: "A huge detached MECHA ARM CANNON, horizontal, barrel pointing RIGHT. Long thick barrel with a muzzle brake, riveted housing, ammo drum underneath, brass pipework. Drawn so the LEFT end is the pivot point where it mounts to a shoulder. No robot attached, just the cannon." },
  { key: "mecha_turret", size: "1024x1024", transparent: true,
    prompt: "A small automated FLAK TURRET for mounting on a mecha, barrel pointing RIGHT. Stubby double-barrel gun on a round rotating base, riveted gunmetal with brass details. Simple and readable at small size." },

  // Enemies, face LEFT
  { key: "enemy_rustcrawler", size: "1024x1024", transparent: true,
    prompt: "A small scrappy CRAWLER ROBOT enemy, facing LEFT. Low, beetle-like welded scrap hull on rusty tank treads, one crude glowing red eye, a jagged cutting claw raised at the front. Looks cheap, mass-produced and expendable." },
  { key: "enemy_scavenger_bike", size: "1536x1024", transparent: true,
    prompt: "A fast RAIDER BIKE enemy, facing LEFT. A lean motorcycle-like machine with a single fat spiked wheel front and back, ram blade on the front, exhaust flames, hunched armored rider silhouette fused into the machine. Conveys speed." },
  { key: "enemy_plated_hulk", size: "1024x1024", transparent: true,
    prompt: "A heavy ARMORED WALKER enemy, facing LEFT. Slow hulking bipedal robot, extremely thick overlapping bolted armor plates like a walking bunker, tiny head slit glowing red, massive wrecking-ball fist. Conveys weight and toughness." },
  { key: "enemy_gunner_walker", size: "1024x1024", transparent: true,
    prompt: "A four-legged ARTILLERY WALKER enemy, facing LEFT. Spider-like armored chassis with a long-barreled rifle cannon mounted on top aiming LEFT, ammo belts, dish antenna. Conveys a sniper that stays at range." },
  { key: "boss_compactor", size: "1024x1024", transparent: true,
    prompt: "A BOSS: a colossal industrial COMPACTOR MACHINE enemy, facing LEFT. A rolling fortress on giant crushing treads, a huge hydraulic press jaw at the front like a crushing mouth, cranes and scrap hooks on its back, multiple glowing red sensor eyes, belching smokestacks. Twice as menacing and detailed as a normal enemy, same art style." },

  // Projectiles and pickups
  { key: "projectile_shell", size: "1024x1024", transparent: true,
    prompt: "A single stubby brass CANNON SHELL with a glowing tracer tail, pointing RIGHT. Very simple, readable at tiny size." },
  { key: "pickup_scrap", size: "1024x1024", transparent: true,
    prompt: "A small pile of glowing SALVAGE SCRAP: gears, a brass cog, twisted metal, faint warm glow. Reads as a collectible currency drop at tiny size." },

  // Parallax layers, zone 1 Rust Flats, wide strips
  { key: "bg_sky", size: "1536x1024", transparent: false,
    prompt: "Wide dieselpunk wasteland SKY ONLY: dirty ochre and ash-grey overcast sky, faint sun disc behind haze, distant smoke columns. No ground, no buildings in the lower third, muted so gameplay reads on top of it." },
  { key: "bg_ruins", size: "1536x1024", transparent: true,
    prompt: "Wide silhouette layer of a RUINED FACTORY SKYLINE: broken smokestacks, collapsed gantries, dead cranes, all as dark desaturated brown-grey silhouettes with minimal internal detail, filling only the lower half. Nothing but the silhouettes." },
  { key: "bg_ground", size: "1536x1024", transparent: false,
    prompt: "Wide strip of cracked WASTELAND GROUND seen from the side: dry fissured earth, scattered scrap, oil stains, a worn vehicle track running horizontally. Slightly darker and more detailed than a sky layer." },
];

type Provider = "gemini" | "openai";

function pickProvider(): Provider {
  const forced = process.env.ART_PROVIDER as Provider | undefined;
  if (forced === "gemini" || forced === "openai") return forced;
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.OPENAI_API_KEY) return "openai";
  console.error(
    "No API key found. Set one of:\n" +
      "  GEMINI_API_KEY   free key from aistudio.google.com (Get API key)\n" +
      "  OPENAI_API_KEY   paid key from platform.openai.com"
  );
  process.exit(1);
}

function toAspect(size: string): string {
  const [w, h] = size.split("x").map(Number);
  const r = w / h;
  if (r > 1.6) return "16:9";
  if (r > 1.2) return "3:2";
  if (r < 0.85) return "2:3";
  return "1:1";
}

function buildPrompt(asset: Asset, provider: Provider): string {
  const isBg = asset.key.startsWith("bg_");
  let p = `${isBg ? BG_STYLE : STYLE}\n\n${asset.prompt}`;
  // Gemini has no alpha channel output: green-screen anything meant to be cut out.
  if (provider === "gemini" && asset.transparent) p += GREEN_BG;
  return p;
}

async function callOpenAI(asset: Asset): Promise<Buffer> {
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      prompt: buildPrompt(asset, "openai"),
      size: asset.size,
      quality: OPENAI_QUALITY,
      background: asset.transparent ? "transparent" : "opaque",
      n: 1,
    }),
  });
  if (!res.ok) throw new HttpError(res.status, await res.text());
  const json = (await res.json()) as { data: Array<{ b64_json?: string; url?: string }> };
  const item = json.data?.[0];
  if (item?.b64_json) return Buffer.from(item.b64_json, "base64");
  if (item?.url) {
    const img = await fetch(item.url);
    return Buffer.from(await img.arrayBuffer());
  }
  throw new Error("response contained no image data");
}

async function callGemini(asset: Asset): Promise<Buffer> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildPrompt(asset, "gemini") }] }],
      generationConfig: {
        responseModalities: ["IMAGE"],
        imageConfig: { aspectRatio: toAspect(asset.size) },
      },
    }),
  });
  if (!res.ok) throw new HttpError(res.status, await res.text());
  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string } }> } }>;
  };
  const b64 = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData?.data;
  if (!b64) throw new Error("response contained no image data (possibly blocked or quota exhausted)");
  return Buffer.from(b64, "base64");
}

class HttpError extends Error {
  constructor(public status: number, body: string) {
    super(`HTTP ${status} ${body.slice(0, 300)}`);
  }
}

async function generate(provider: Provider, asset: Asset, attempt = 1): Promise<void> {
  try {
    const buffer = provider === "gemini" ? await callGemini(asset) : await callOpenAI(asset);
    writeFileSync(join(OUT_DIR, `${asset.key}.png`), buffer);
    console.log(`  saved assets/raw/${asset.key}.png (${(buffer.length / 1024).toFixed(0)} KB)`);
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 0;
    if ((status === 429 || status >= 500) && attempt <= 3) {
      const wait = attempt * 20;
      console.warn(`  ${asset.key}: HTTP ${status}, retrying in ${wait}s (attempt ${attempt}/3)`);
      await new Promise((r) => setTimeout(r, wait * 1000));
      return generate(provider, asset, attempt + 1);
    }
    throw err;
  }
}

async function main() {
  const provider = pickProvider();
  mkdirSync(OUT_DIR, { recursive: true });

  const args = process.argv.slice(2).filter((a) => a !== "--force");
  const force = process.argv.includes("--force");
  const requested = args.length > 0 ? ASSETS.filter((a) => args.includes(a.key)) : ASSETS;
  const unknown = args.filter((a) => !ASSETS.some((x) => x.key === a));
  if (unknown.length) {
    console.error(`Unknown asset keys: ${unknown.join(", ")}\nValid keys: ${ASSETS.map((a) => a.key).join(", ")}`);
    process.exit(1);
  }

  const todo = requested.filter(
    (a) => force || args.includes(a.key) || !existsSync(join(OUT_DIR, `${a.key}.png`))
  );
  const skipped = requested.length - todo.length;
  console.log(
    `Provider ${provider} (${provider === "gemini" ? GEMINI_MODEL + ", free tier, green-screen sprites" : OPENAI_MODEL + ", quality " + OPENAI_QUALITY + ", transparent sprites"}). ` +
      `Generating ${todo.length} asset(s)` + (skipped ? `, skipping ${skipped} already present` : "") + "."
  );

  const failures: string[] = [];
  for (const asset of todo) {
    console.log(`Generating ${asset.key} ...`);
    try {
      await generate(provider, asset);
    } catch (err) {
      console.error(`  FAILED ${asset.key}: ${(err as Error).message}`);
      failures.push(asset.key);
    }
    // Gentle pacing for free-tier rate limits.
    if (provider === "gemini") await new Promise((r) => setTimeout(r, 4000));
  }

  if (failures.length) {
    console.error(`\n${failures.length} failed: ${failures.join(", ")}\nRe-run with those keys as arguments to retry only them.`);
    process.exit(1);
  }
  console.log("\nAll done. Review the PNGs in assets/raw/, delete and re-run any that look off, then hand off to Claude Code per the header comment.");
}

main();
