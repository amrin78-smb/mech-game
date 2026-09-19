/** Draw order for the battle scene. Presentation only, nothing reads it as a rule. */
export const Depths = {
  BG_SKY: 0,
  BG_RUINS: 1,
  BG_GROUND: 2,
  ENEMIES: 10,
  MECHA: 20,
  PICKUPS: 28,
  PROJECTILES: 30,
  AIM_LINE: 40,
  HUD: 50,
  OVERLAY: 60,
} as const;
