import { tuning } from '../data';
import type { BossPhaseConfig, EnemyDef } from '../types';
import { Enemy, type EnemyUpdateContext } from './Enemy';

/**
 * The single sanctioned Enemy subclass (hard rule 3). Everything a boss adds is
 * phase behaviour; its stats still come from enemies.json and its phase timings
 * from tuning.boss, keyed by enemy id, so a new boss is data plus a `kind`.
 *
 * The three kinds, GAME_DESIGN section 6:
 *   charger        The Compactor. Slow advance, then below half hp it charges in
 *                  bursts instead of crawling.
 *   shield_cycler  Iron Matriarch. Alternates shield up phases, which only
 *                  piercing meaningfully dents, with vulnerable vent phases.
 *                  Its drone broods come from the spawner behaviour in data.
 *   enrager        The Leviathan Engine. Steps up each time one of its
 *                  destructible vents is destroyed, getting faster and hitting
 *                  harder. With no vents mounted it falls back to hp
 *                  thresholds, so the kind still works for a plain boss.
 */
const DEFAULTS = tuning.boss.default;

export class Boss extends Enemy {
  private config: BossPhaseConfig = { kind: 'charger' };
  private phaseIndex = 1;
  private phaseChanged = false;

  /** charger */
  private charging = false;
  private chargeTimer = 0;

  /** shield_cycler */
  private venting = false;
  private cycleTimer = 0;

  /** enrager */
  private enrageStage = 0;

  /**
   * Destructible parts riding on the hull. The Boss owns placing them, so the
   * link lives here rather than being threaded through the update context.
   */
  private weakPoints: Enemy[] = [];

  override get isBoss(): boolean {
    return true;
  }

  get phase(): number {
    return this.phaseIndex;
  }

  get isCharging(): boolean {
    return this.charging;
  }

  /** shield_cycler only: true while the vents are open and it is vulnerable. */
  get isVenting(): boolean {
    return this.venting;
  }

  get kind(): BossPhaseConfig['kind'] {
    return this.config.kind;
  }

  /** Parts still standing, which the boss bar reports. */
  get weakPointsAlive(): number {
    let alive = 0;
    for (const part of this.weakPoints) {
      if (part.isAlive) alive += 1;
    }
    return alive;
  }

  get weakPointsTotal(): number {
    return this.weakPoints.length;
  }

  /**
   * The body shrugs off most of a hit while any part still lives, which is what
   * makes shooting the vents the right play rather than an optional flourish.
   */
  override get damageTakenScale(): number {
    const factor = this.def?.weakPoints?.bodyDamageFactor;
    if (factor === undefined || this.weakPointsAlive === 0) return 1;
    return factor;
  }

  /** Called by the spawner once it has pooled the parts for this boss. */
  setWeakPoints(parts: Enemy[]): void {
    this.weakPoints = parts;
    this.placeWeakPoints();
  }

  /**
   * Parts are carried, not driven: their position is the boss's, offset by a
   * fraction of its display size so art swaps keep them on the hull.
   */
  private placeWeakPoints(): void {
    const mounts = this.def?.weakPoints?.mounts;
    if (mounts === undefined) return;

    const width = this.bodyWidth;
    const height = this.bodyHeight;

    for (let i = 0; i < this.weakPoints.length && i < mounts.length; i += 1) {
      const part = this.weakPoints[i];
      if (!part.active) continue;
      part.setPosition(this.x + mounts[i].x * width, this.y + mounts[i].y * height);
    }
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
    if (this.charging) return base * DEFAULTS.chargeSpeedMultiplier;
    return base * this.enrageSpeedFactor();
  }

  override get damagePerHit(): number {
    return super.damagePerHit * this.enrageDamageFactor();
  }

  protected override onSpawned(): void {
    const def = this.def;
    this.config = (def !== null ? tuning.boss.byId[def.id] : undefined) ?? { kind: 'charger' };

    this.phaseIndex = 1;
    this.phaseChanged = false;
    this.charging = false;
    this.chargeTimer = DEFAULTS.chargeCooldown;
    this.venting = false;
    this.cycleTimer = this.config.shieldUpDuration ?? DEFAULTS.chargeCooldown;
    this.enrageStage = 0;
  }

  protected override updateBehavior(deltaSeconds: number, _ctx: EnemyUpdateContext): void {
    this.placeWeakPoints();

    switch (this.config.kind) {
      case 'charger':
        this.updateCharger(deltaSeconds);
        return;
      case 'shield_cycler':
        this.updateShieldCycler(deltaSeconds);
        return;
      case 'enrager':
        this.updateEnrager();
        return;
    }
  }

  private updateCharger(deltaSeconds: number): void {
    if (this.phaseIndex === 1 && this.healthFraction <= DEFAULTS.phase2HpFraction) {
      this.enterPhase(2);
      // Enter phase 2 already winding up, so the shift is felt immediately.
      this.chargeTimer = 0;
    }
    if (this.phaseIndex < 2) return;

    this.chargeTimer -= deltaSeconds;
    if (this.chargeTimer > 0) return;

    // Alternate: a burst of charge, then a cooldown, then charge again.
    this.charging = !this.charging;
    this.chargeTimer = this.charging ? DEFAULTS.chargeDuration : DEFAULTS.chargeCooldown;
  }

  /**
   * Shield up, then vents open. Dropping the shield during a vent is what makes
   * the window matter; it comes back when the shield phase returns.
   */
  private updateShieldCycler(deltaSeconds: number): void {
    this.cycleTimer -= deltaSeconds;
    if (this.cycleTimer > 0) return;

    this.venting = !this.venting;
    if (this.venting) {
      this.cycleTimer = this.config.ventDuration ?? DEFAULTS.chargeDuration;
      this.collapseShield();
      this.enterPhase(2);
    } else {
      this.cycleTimer = this.config.shieldUpDuration ?? DEFAULTS.chargeCooldown;
      this.restoreShield();
      this.enterPhase(1);
    }
  }

  /** Each vent destroyed is a step up: faster and angrier. */
  private updateEnrager(): void {
    if (this.weakPoints.length > 0) {
      const destroyed = this.weakPoints.length - this.weakPointsAlive;
      while (this.enrageStage < destroyed) {
        this.enrageStage += 1;
        this.enterPhase(this.enrageStage + 1);
      }
      return;
    }

    // No parts mounted: fall back to hp thresholds so the kind still works.
    const thresholds = this.config.enrageThresholds ?? [];
    const fraction = this.healthFraction;

    while (this.enrageStage < thresholds.length && fraction <= thresholds[this.enrageStage]) {
      this.enrageStage += 1;
      this.enterPhase(this.enrageStage + 1);
    }
  }

  private enterPhase(phase: number): void {
    if (this.phaseIndex === phase) return;
    this.phaseIndex = phase;
    this.phaseChanged = true;
  }

  private enrageSpeedFactor(): number {
    if (this.config.kind !== 'enrager') return 1;
    return 1 + this.enrageStage * (this.config.enrageSpeedBonus ?? 0);
  }

  private enrageDamageFactor(): number {
    if (this.config.kind !== 'enrager') return 1;
    return 1 + this.enrageStage * (this.config.enrageDamageBonus ?? 0);
  }

  protected override travelSpeed(def: EnemyDef): number {
    if (this.charging) return def.speed * DEFAULTS.chargeSpeedMultiplier;
    return def.speed * this.enrageSpeedFactor();
  }

  override deactivate(): void {
    super.deactivate();
    this.weakPoints = [];
    this.phaseIndex = 1;
    this.charging = false;
    this.venting = false;
    this.phaseChanged = false;
    this.enrageStage = 0;
  }
}
