import { tuning } from '../data';
import type { Enemy } from '../entities/Enemy';
import type { TargetPriority } from '../types';

/**
 * Hard rule 9 and GAME_DESIGN section 3: one target selection rule shared by the
 * cannon and, from Phase 2, every turret mount.
 *
 * Priority comes from tuning.json targeting.priorityOrder:
 *   1. the player's focus target, if it is still alive
 *   2. ranged enemies already sitting inside their own attack range, because
 *      they chip the hull for free while the guns chase something else
 *   3. the closest enemy
 */
export class TargetingSystem {
  private focus: Enemy | null = null;
  private readonly priorityOrder: readonly TargetPriority[] = tuning.targeting.priorityOrder;

  /**
   * Enemies spawn off the right edge, and the cannon must not snipe them before
   * the player can see them: the fight happens on screen. The engagement line is
   * the right edge of the play field.
   */
  private readonly engageMaxX = tuning.world.baseWidth;

  get focusTarget(): Enemy | null {
    return this.focus !== null && this.focus.isAlive ? this.focus : null;
  }

  /** Setting the same enemy twice clears it, so a second tap unfocuses. */
  setFocus(enemy: Enemy | null): void {
    if (enemy !== null && this.focus === enemy) {
      this.focus = null;
      return;
    }
    this.focus = enemy !== null && enemy.isAlive ? enemy : null;
  }

  clearFocus(): void {
    this.focus = null;
  }

  /** Drops the focus once its target is dead or recycled. Call once per frame. */
  prune(): void {
    if (this.focus !== null && !this.focus.isAlive) {
      this.focus = null;
    }
  }

  selectTarget(enemies: readonly Enemy[], fromX: number, fromY: number): Enemy | null {
    for (const priority of this.priorityOrder) {
      const candidate = this.selectByPriority(priority, enemies, fromX, fromY);
      if (candidate !== null) return candidate;
    }
    return null;
  }

  private selectByPriority(
    priority: TargetPriority,
    enemies: readonly Enemy[],
    fromX: number,
    fromY: number,
  ): Enemy | null {
    switch (priority) {
      case 'focus':
        return this.focusTarget;
      case 'ranged_in_range':
        return this.closestMatching(enemies, fromX, fromY, true);
      case 'closest':
        return this.closestMatching(enemies, fromX, fromY, false);
    }
  }

  /** Squared distance only, no allocation and no square roots in the loop. */
  private closestMatching(
    enemies: readonly Enemy[],
    fromX: number,
    fromY: number,
    rangedInRangeOnly: boolean,
  ): Enemy | null {
    let best: Enemy | null = null;
    let bestDistanceSq = Number.POSITIVE_INFINITY;

    for (const enemy of enemies) {
      if (!enemy.isAlive) continue;
      if (enemy.x > this.engageMaxX) continue;
      if (rangedInRangeOnly && !enemy.isRangedInRange) continue;

      const dx = enemy.x - fromX;
      const dy = enemy.centerY - fromY;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq < bestDistanceSq) {
        bestDistanceSq = distanceSq;
        best = enemy;
      }
    }

    return best;
  }

  /** The enemy under a pointer, used to set the focus target on a tap or click. */
  pickAt(enemies: readonly Enemy[], worldX: number, worldY: number, slack: number): Enemy | null {
    let best: Enemy | null = null;
    let bestDistanceSq = Number.POSITIVE_INFINITY;

    for (const enemy of enemies) {
      if (!enemy.isAlive) continue;
      const dx = enemy.x - worldX;
      const dy = enemy.centerY - worldY;
      const distanceSq = dx * dx + dy * dy;
      const reach = enemy.radius + slack;
      if (distanceSq <= reach * reach && distanceSq < bestDistanceSq) {
        bestDistanceSq = distanceSq;
        best = enemy;
      }
    }

    return best;
  }
}
