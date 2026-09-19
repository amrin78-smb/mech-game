import type { LevelDef } from '../types';

/**
 * In-run scrap only. Cores and anything persistent are Phase 3.
 *
 * Every number comes from the level's `economy` block: starting float, the
 * per second trickle, and the reward multiplier applied to enemy rewards.
 */
export class EconomySystem {
  private scrap: number;
  private earned = 0;
  private spent = 0;
  private readonly trickle: number;
  private readonly rewardMultiplier: number;

  constructor(level: LevelDef) {
    this.scrap = level.economy.startingScrap;
    this.trickle = level.economy.trickle;
    this.rewardMultiplier = level.economy.rewardMultiplier ?? 1;
  }

  /** Whole scrap the HUD displays. The float underneath keeps the trickle smooth. */
  get balance(): number {
    return Math.floor(this.scrap);
  }

  /** Total earned across the run, which is what the results screen reports. */
  get totalEarned(): number {
    return Math.floor(this.earned);
  }

  get totalSpent(): number {
    return Math.floor(this.spent);
  }

  update(deltaSeconds: number): void {
    const income = this.trickle * deltaSeconds;
    this.scrap += income;
    this.earned += income;
  }

  awardKill(reward: number): number {
    const payout = reward * this.rewardMultiplier;
    this.scrap += payout;
    this.earned += payout;
    return payout;
  }

  canAfford(cost: number): boolean {
    return this.scrap >= cost;
  }

  /** Phase 2 spends through here; Phase 1 only ever displays the balance. */
  trySpend(cost: number): boolean {
    if (!this.canAfford(cost)) return false;
    this.scrap -= cost;
    this.spent += cost;
    return true;
  }
}
