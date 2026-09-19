import Phaser from 'phaser';

import { getLevelDef, levels, tuning, weapons } from '../data';
import type { Enemy } from '../entities/Enemy';
import { Mecha } from '../entities/Mecha';
import { DamageSystem } from '../systems/DamageSystem';
import { EconomySystem } from '../systems/EconomySystem';
import { TargetingSystem } from '../systems/TargetingSystem';
import { WaveSpawner } from '../systems/WaveSpawner';
import { WeaponSystem } from '../systems/WeaponSystem';
import type { BattleResult, LevelDef } from '../types';
import { AimLine } from '../ui/AimLine';
import { FocusMarker } from '../ui/FocusMarker';
import { Hud } from '../ui/Hud';
import { ParallaxBackground } from '../ui/ParallaxBackground';
import { ScrapDrops } from '../ui/ScrapDrops';
import { SceneKeys } from './SceneKeys';

/**
 * Hard rule 7: this scene wires systems together and owns the update order.
 * It holds no combat maths of its own; everything below delegates.
 *
 * Update order per frame:
 *   background -> spawner (enemy movement and attacks) -> targeting prune ->
 *   weapons (aim, fire, projectile impacts) -> economy -> presentation -> end check
 */

export interface BattleSceneData {
  levelId?: string;
}

/** Pointer slack when tapping an enemy to focus it, in px. */
const FOCUS_TAP_SLACK = 26;

export class BattleScene extends Phaser.Scene {
  private level!: LevelDef;

  private background!: ParallaxBackground;
  private mecha!: Mecha;
  private targeting!: TargetingSystem;
  private damage!: DamageSystem;
  private economy!: EconomySystem;
  private spawner!: WaveSpawner;
  private weapon!: WeaponSystem;

  private hud!: Hud;
  private aimLine!: AimLine;
  private focusMarker!: FocusMarker;
  private scrapDrops!: ScrapDrops;

  private enemiesKilled = 0;
  private elapsedSeconds = 0;
  private battleOver = false;

  private dragStartX = 0;
  private dragStartY = 0;
  private dragOriginAllowed = false;
  private pointerDown = false;

  constructor() {
    super(SceneKeys.Battle);
  }

  init(data: BattleSceneData): void {
    this.level = getLevelDef(data?.levelId ?? levels[0].id);
    this.enemiesKilled = 0;
    this.elapsedSeconds = 0;
    this.battleOver = false;
    this.pointerDown = false;
    this.dragOriginAllowed = false;
  }

  create(): void {
    const { baseWidth, baseHeight, mechaXFraction, spawnXFraction } = tuning.world;
    const laneY = tuning.mecha.lanesY.map((fraction) => baseHeight * fraction);
    const mechaX = baseWidth * mechaXFraction;
    const groundY = laneY[laneY.length - 1];

    this.background = new ParallaxBackground(this, this.level.background, baseWidth, baseHeight);
    this.mecha = new Mecha(this, mechaX, groundY, tuning.mecha.baseHullHp);

    this.targeting = new TargetingSystem();
    this.damage = new DamageSystem();
    this.economy = new EconomySystem(this.level);

    this.spawner = new WaveSpawner({
      scene: this,
      level: this.level,
      laneY,
      spawnX: baseWidth * spawnXFraction,
      mechaX,
      onEnemyAttack: (enemy) => this.onEnemyAttack(enemy),
    });

    this.weapon = new WeaponSystem({
      scene: this,
      mecha: this.mecha,
      targeting: this.targeting,
      damage: this.damage,
      weaponId: this.mainWeaponId(),
      onEnemyKilled: (enemy) => this.onEnemyKilled(enemy),
    });

    this.hud = new Hud(this, baseWidth);
    this.aimLine = new AimLine(this);
    this.focusMarker = new FocusMarker(this);
    this.scrapDrops = new ScrapDrops(this);

    this.registerInput();
    this.cameras.main.setBackgroundColor(0x1a1512);
  }

  /** The Hangar picks the main weapon in Phase 3; until then, the first main slot. */
  private mainWeaponId(): string {
    const main = weapons.find((weapon) => weapon.slot === 'main');
    if (!main) throw new Error('No weapon with slot "main" in src/data/weapons.json');
    return main.id;
  }

  override update(_time: number, delta: number): void {
    if (this.battleOver) return;

    // Framerate independent, and a backgrounded tab must not teleport the wave.
    const deltaSeconds = Math.min(delta / 1000, tuning.world.maxFrameSeconds);
    this.elapsedSeconds += deltaSeconds;

    this.background.update(deltaSeconds, this.level.scrollSpeed);
    this.spawner.update(deltaSeconds);
    this.targeting.prune();
    this.weapon.update(deltaSeconds, this.spawner.activeEnemies);
    this.economy.update(deltaSeconds);

    this.updatePresentation(deltaSeconds);
    this.checkEndConditions();
  }

  private updatePresentation(deltaSeconds: number): void {
    if (this.weapon.isManualAiming) {
      const muzzle = this.mecha.getMuzzle();
      this.aimLine.draw(
        muzzle.x,
        muzzle.y,
        this.weapon.manualAimPointX,
        this.weapon.manualAimPointY,
      );
    } else {
      this.aimLine.hide();
    }

    this.focusMarker.update(this.targeting.focusTarget, deltaSeconds);
    this.scrapDrops.update(deltaSeconds);
    this.hud.update(
      this.mecha.hullHp,
      this.mecha.hullMax,
      this.economy.balance,
      this.spawner.progress,
    );
  }

  private onEnemyAttack(enemy: Enemy): void {
    if (this.battleOver) return;
    this.damage.applyToMecha(this.mecha, enemy.damagePerHit);
  }

  private onEnemyKilled(enemy: Enemy): void {
    const payout = this.economy.awardKill(enemy.scrapReward);
    this.scrapDrops.spawn(enemy.x, enemy.centerY, payout);
    this.enemiesKilled += 1;
    this.spawner.despawn(enemy);
  }

  private checkEndConditions(): void {
    if (this.mecha.isDestroyed) {
      this.endBattle(false);
      return;
    }
    if (this.spawner.isTimelineComplete && this.spawner.aliveCount === 0) {
      this.endBattle(true);
    }
  }

  private endBattle(won: boolean): void {
    if (this.battleOver) return;
    this.battleOver = true;

    this.weapon.reset();
    this.spawner.despawnAll();
    this.aimLine.hide();
    this.scrapDrops.reset();

    const result: BattleResult = {
      levelId: this.level.id,
      levelName: this.level.name,
      won,
      scrapEarned: this.economy.totalEarned,
      enemiesKilled: this.enemiesKilled,
      hullRemaining: this.mecha.hullHp,
      hullMax: this.mecha.hullMax,
      durationSeconds: this.elapsedSeconds,
    };

    this.scene.start(SceneKeys.Results, result);
  }

  /**
   * Hard rule 9. A drag anywhere takes manual control of the cannon; a tap
   * instead sets the focus target. Touch drags must start on the lower half of
   * the screen, and their aim point sits above the finger so it never covers
   * what is being shot at.
   */
  private registerInput(): void {
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      if (this.battleOver) return;
      this.pointerDown = true;
      this.dragStartX = pointer.worldX;
      this.dragStartY = pointer.worldY;
      this.dragOriginAllowed = this.isDragOriginAllowed(pointer);
    });

    this.input.on(Phaser.Input.Events.POINTER_MOVE, (pointer: Phaser.Input.Pointer) => {
      if (this.battleOver || !this.pointerDown) return;

      if (this.weapon.isManualAiming) {
        this.weapon.updateManualAim(pointer.worldX, this.aimY(pointer));
        return;
      }

      if (!this.dragOriginAllowed) return;
      const travelled = Phaser.Math.Distance.Between(
        this.dragStartX,
        this.dragStartY,
        pointer.worldX,
        pointer.worldY,
      );
      if (travelled >= tuning.targeting.manualDragThreshold) {
        this.weapon.beginManualAim(pointer.worldX, this.aimY(pointer));
      }
    });

    this.input.on(Phaser.Input.Events.POINTER_UP, (pointer: Phaser.Input.Pointer) => {
      if (this.battleOver) {
        this.pointerDown = false;
        return;
      }
      this.pointerDown = false;

      if (this.weapon.isManualAiming) {
        this.weapon.updateManualAim(pointer.worldX, this.aimY(pointer));
        this.weapon.releaseManualAim();
        this.hud.hideHint();
        return;
      }

      // Not a drag, so it is a tap: pick the focus target under the pointer.
      const picked = this.targeting.pickAt(
        this.spawner.activeEnemies,
        pointer.worldX,
        pointer.worldY,
        FOCUS_TAP_SLACK,
      );
      this.targeting.setFocus(picked);
    });

    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, () => {
      this.pointerDown = false;
      this.weapon.cancelManualAim();
    });

    this.input.on(Phaser.Input.Events.GAME_OUT, () => {
      this.pointerDown = false;
      this.weapon.cancelManualAim();
    });
  }

  /** Touch drags start on the lower half so fingers do not cover the action. */
  private isDragOriginAllowed(pointer: Phaser.Input.Pointer): boolean {
    if (!pointer.wasTouch) return true;
    const minY = tuning.world.baseHeight * tuning.targeting.touchDragOriginMinYFraction;
    return pointer.worldY >= minY;
  }

  private aimY(pointer: Phaser.Input.Pointer): number {
    return pointer.wasTouch ? pointer.worldY - tuning.targeting.touchAimOffsetY : pointer.worldY;
  }
}
