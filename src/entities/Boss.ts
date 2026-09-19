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
 *   enrager        The Leviathan Engine. Steps up at each hp threshold, getting
 *                  faster and hitting harder as its weak points fail.
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

  /** Each threshold crossed is another weak point gone: faster and angrier. */
  private updateEnrager(): void {
    const thresholds = this.config.enrageThresholds ?? [];
    const fraction = this.healthFraction;

    while (
      this.enrageStage < thresholds.length &&
      fraction <= thresholds[this.enrageStage]
    ) {
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
    this.phaseIndex = 1;
    this.charging = false;
    this.venting = false;
    this.phaseChanged = false;
    this.enrageStage = 0;
  }
}
