import { tuning } from '../data';
import type { EnemyDef } from '../types';
import { Enemy, type EnemyUpdateContext } from './Enemy';

/**
 * The single sanctioned Enemy subclass (hard rule 3). Everything a boss adds is
 * phase behaviour; its stats still come from enemies.json and its phase timings
 * from tuning.json.
 *
 * The Compactor, GAME_DESIGN section 6:
 *   phase 1  slow relentless advance, heavy slam attacks
 *   phase 2  below the phase2 hp fraction it charges in bursts, so the player
 *            has to deal with sudden closing speed instead of a steady crawl
 */
export class Boss extends Enemy {
  private phaseIndex = 1;
  private charging = false;
  private chargeTimer = 0;
  private phaseChanged = false;

  override get isBoss(): boolean {
    return true;
  }

  get phase(): number {
    return this.phaseIndex;
  }

  get isCharging(): boolean {
    return this.charging;
  }

  /** True exactly once per phase transition, so the scene can react and move on. */
  consumePhaseChange(): boolean {
    if (!this.phaseChanged) return false;
    this.phaseChanged = false;
    return true;
  }

  override get movementSpeed(): number {
    const base = super.movementSpeed;
    if (base === 0) return 0;
    return this.charging ? base * tuning.boss.chargeSpeedMultiplier : base;
  }

  protected override onSpawned(): void {
    this.phaseIndex = 1;
    this.charging = false;
    this.chargeTimer = tuning.boss.chargeCooldown;
    this.phaseChanged = false;
  }

  protected override updateBehavior(deltaSeconds: number, _ctx: EnemyUpdateContext): void {
    if (this.phaseIndex === 1 && this.healthFraction <= tuning.boss.phase2HpFraction) {
      this.phaseIndex = 2;
      this.phaseChanged = true;
      // Enter phase 2 already winding up, so the shift is felt immediately.
      this.chargeTimer = 0;
    }

    if (this.phaseIndex < 2) return;

    this.chargeTimer -= deltaSeconds;
    if (this.chargeTimer > 0) return;

    // Alternate: a burst of charge, then a cooldown, then charge again.
    this.charging = !this.charging;
    this.chargeTimer = this.charging ? tuning.boss.chargeDuration : tuning.boss.chargeCooldown;
  }

  protected override travelSpeed(def: EnemyDef): number {
    return this.charging ? def.speed * tuning.boss.chargeSpeedMultiplier : def.speed;
  }

  override deactivate(): void {
    super.deactivate();
    this.phaseIndex = 1;
    this.charging = false;
    this.phaseChanged = false;
  }
}
