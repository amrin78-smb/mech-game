import { getPilotDef } from '../data';
import type { Mecha } from '../entities/Mecha';
import type { PilotDef } from '../types';
import type { TurretSystem } from './TurretSystem';
import type { WeaponSystem } from './WeaponSystem';

/**
 * The equipped pilot's active ability, GAME_DESIGN section 9. Passives are
 * folded into the loadout before the fight starts (hull and cannon damage);
 * this only runs the cooldown ability the player fires from the HUD.
 *
 * Ability kinds come from pilot.schema.json. Vex and Mara use two of them; the
 * rest are wired so a third pilot is data alone.
 */
export class PilotSystem {
  private readonly pilot: PilotDef | null;
  private readonly mecha: Mecha;
  private readonly weapon: WeaponSystem;
  private readonly turrets: TurretSystem;
  private readonly level: number;

  private cooldownRemaining = 0;
  private activeRemaining = 0;
  private active = false;

  /** Multipliers this ability is currently contributing, so they can be undone. */
  private appliedFireRate = 0;
  private appliedDamage = 0;

  constructor(
    pilotId: string | null,
    pilotLevel: number,
    mecha: Mecha,
    weapon: WeaponSystem,
    turrets: TurretSystem,
  ) {
    this.pilot = pilotId === null ? null : getPilotDef(pilotId);
    this.level = pilotLevel;
    this.mecha = mecha;
    this.weapon = weapon;
    this.turrets = turrets;
  }

  get hasPilot(): boolean {
    return this.pilot !== null;
  }

  get pilotName(): string {
    return this.pilot?.name ?? '';
  }

  get abilityName(): string {
    return this.pilot?.ability.name ?? '';
  }

  get isActive(): boolean {
    return this.active;
  }

  get isReady(): boolean {
    return this.pilot !== null && !this.active && this.cooldownRemaining <= 0;
  }

  /** Seconds left on cooldown, 0 when ready. */
  get cooldown(): number {
    return Math.max(0, this.cooldownRemaining);
  }

  get cooldownFraction(): number {
    if (this.pilot === null) return 0;
    return Math.max(0, this.cooldownRemaining) / this.pilot.ability.cooldown;
  }

  get activeSecondsLeft(): number {
    return Math.max(0, this.activeRemaining);
  }

  /** Returns false when the ability was not ready, so the HUD can buzz. */
  activate(): boolean {
    const pilot = this.pilot;
    if (pilot === null || !this.isReady) return false;

    this.active = true;
    this.activeRemaining = pilot.ability.duration;
    this.cooldownRemaining = pilot.ability.cooldown;
    this.applyEffect(pilot);
    return true;
  }

  private applyEffect(pilot: PilotDef): void {
    const { kind, magnitude } = pilot.ability;

    switch (kind) {
      case 'fire_rate_boost':
        this.appliedFireRate = magnitude;
        this.weapon.fireRateMultiplier += magnitude;
        this.turrets.fireRateMultiplier += magnitude;
        return;
      case 'damage_boost':
        this.appliedDamage = magnitude;
        this.weapon.damageMultiplier += magnitude;
        this.turrets.damageMultiplier += magnitude;
        return;
      case 'shield':
        // Scales with pilot level so levelling the defensive pilot is felt.
        this.mecha.grantAbsorb(magnitude * (1 + this.level * 0.15));
        return;
      case 'repair_burst':
        this.mecha.repair(this.mecha.hullMax * magnitude);
        return;
      case 'slow_field':
        // No enemy speed modifier exists yet; the ability is inert until one does.
        return;
    }
  }

  private removeEffect(): void {
    if (this.appliedFireRate !== 0) {
      this.weapon.fireRateMultiplier -= this.appliedFireRate;
      this.turrets.fireRateMultiplier -= this.appliedFireRate;
      this.appliedFireRate = 0;
    }
    if (this.appliedDamage !== 0) {
      this.weapon.damageMultiplier -= this.appliedDamage;
      this.turrets.damageMultiplier -= this.appliedDamage;
      this.appliedDamage = 0;
    }
    if (this.pilot?.ability.kind === 'shield') {
      this.mecha.clearAbsorb();
    }
  }

  update(deltaSeconds: number): void {
    if (this.pilot === null) return;

    if (this.active) {
      this.activeRemaining -= deltaSeconds;
      if (this.activeRemaining <= 0) {
        this.active = false;
        this.removeEffect();
      }
    }

    if (this.cooldownRemaining > 0) {
      this.cooldownRemaining -= deltaSeconds;
    }
  }

  reset(): void {
    if (this.active) this.removeEffect();
    this.active = false;
    this.activeRemaining = 0;
    this.cooldownRemaining = 0;
  }
}
