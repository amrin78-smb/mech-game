import Phaser from 'phaser';

import { getLevelDef, levels, tuning, weapons } from '../data';
import type { Boss } from '../entities/Boss';
import type { Enemy } from '../entities/Enemy';
import { Mecha } from '../entities/Mecha';
import type { Projectile } from '../entities/Projectile';
import { AudioManager } from '../systems/AudioManager';
import { DamageSystem, type DamageResult } from '../systems/DamageSystem';
import { EconomySystem } from '../systems/EconomySystem';
import { ProjectileSystem } from '../systems/ProjectileSystem';
import { TargetingSystem } from '../systems/TargetingSystem';
import { TurretSystem } from '../systems/TurretSystem';
import { VfxManager } from '../systems/VfxManager';
import { WaveSpawner } from '../systems/WaveSpawner';
import { WeaponSystem } from '../systems/WeaponSystem';
import type { BattleResult, LevelDef } from '../types';
import { AimLine } from '../ui/AimLine';
import { BossBar } from '../ui/BossBar';
import { FocusMarker } from '../ui/FocusMarker';
import { Hud } from '../ui/Hud';
import { ParallaxBackground } from '../ui/ParallaxBackground';
import { ScrapDrops } from '../ui/ScrapDrops';
import { UpgradePanel, type UpgradeKind } from '../ui/UpgradePanel';
import { SceneKeys } from './SceneKeys';

/**
 * Hard rule 7: this scene wires systems together and owns the update order.
 * It holds no combat maths of its own; everything below delegates.
 *
 * Update order per frame:
 *   background -> mecha (recoil) -> spawner (movement and attacks) ->
 *   targeting prune -> cannon -> turrets -> projectiles and impacts ->
 *   economy -> presentation -> end check
 */

export interface BattleSceneData {
  levelId?: string;
}

/** Pointer slack when tapping an enemy to focus it, in px. */
const FOCUS_TAP_SLACK = 26;
/** Muzzle flash size relative to the firing weapon. */
const CANNON_FLASH_SCALE = 1;
const TURRET_FLASH_SCALE = 0.55;
/** Death burst size relative to the victim's body. */
const BOSS_EXPLOSION_SCALE = 3.5;

export class BattleScene extends Phaser.Scene {
  private level!: LevelDef;

  private background!: ParallaxBackground;
  private mecha!: Mecha;
  private targeting!: TargetingSystem;
  private damage!: DamageSystem;
  private economy!: EconomySystem;
  private spawner!: WaveSpawner;
  private projectiles!: ProjectileSystem;
  private weapon!: WeaponSystem;
  private turrets!: TurretSystem;
  private vfx!: VfxManager;
  private audio!: AudioManager;

  private hud!: Hud;
  private aimLine!: AimLine;
  private focusMarker!: FocusMarker;
  private scrapDrops!: ScrapDrops;
  private upgrades!: UpgradePanel;
  private bossBar!: BossBar;

  private enemiesKilled = 0;
  private repairsUsed = 0;
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
    this.repairsUsed = 0;
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
    this.vfx = new VfxManager(this);
    this.audio = new AudioManager(this);

    this.projectiles = new ProjectileSystem({
      scene: this,
      damage: this.damage,
      onEnemyKilled: (enemy) => this.onEnemyKilled(enemy),
      onEnemyHit: (enemy, result, projectile) => this.onEnemyHit(enemy, result, projectile),
      onImpact: (x, y, projectile, hitSomething) => this.onImpact(x, y, projectile, hitSomething),
    });

    this.spawner = new WaveSpawner({
      scene: this,
      level: this.level,
      laneY,
      spawnX: baseWidth * spawnXFraction,
      mechaX,
      onEnemyAttack: (enemy) => this.onEnemyAttack(enemy),
      onBossSpawned: (boss) => this.onBossSpawned(boss),
    });

    this.weapon = new WeaponSystem({
      mecha: this.mecha,
      targeting: this.targeting,
      projectiles: this.projectiles,
      weaponId: this.mainWeaponId(),
      onShotFired: (x, y, rotation, isManual) => {
        this.vfx.muzzleFlash(x, y, rotation, CANNON_FLASH_SCALE);
        this.audio.play('cannon', isManual ? 1 : 0.8, isManual ? -120 : 0);
      },
    });

    this.turrets = new TurretSystem({
      mecha: this.mecha,
      targeting: this.targeting,
      projectiles: this.projectiles,
      weaponId: this.turretWeaponId(),
      onShotFired: (x, y, rotation) => {
        this.vfx.muzzleFlash(x, y, rotation, TURRET_FLASH_SCALE);
        this.audio.play('turret', 0.5);
      },
    });
    // Phase 2 fits a single mount; the Hangar sells mounts 2 and 3 in Phase 3.
    this.turrets.addMount(this, 0);

    this.hud = new Hud(this, baseWidth);
    this.aimLine = new AimLine(this);
    this.focusMarker = new FocusMarker(this);
    this.scrapDrops = new ScrapDrops(this);
    this.bossBar = new BossBar(this, baseWidth);
    this.upgrades = new UpgradePanel(
      this,
      baseHeight,
      this.economy,
      (kind) => this.onUpgradePurchased(kind),
      () => this.audio.play('ui_click', 0.4, -300),
    );

    this.registerInput();
    this.cameras.main.setBackgroundColor(0x1a1512);
    this.audio.startDrone();

    // Leave no sound or emitter running when the scene is torn down.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.audio.destroy());
  }

  /** The Hangar picks the loadout in Phase 3; until then, the first of each slot. */
  private mainWeaponId(): string {
    const main = weapons.find((weapon) => weapon.slot === 'main');
    if (!main) throw new Error('No weapon with slot "main" in src/data/weapons.json');
    return main.id;
  }

  private turretWeaponId(): string {
    const turret = weapons.find((weapon) => weapon.slot === 'turret');
    if (!turret) throw new Error('No weapon with slot "turret" in src/data/weapons.json');
    return turret.id;
  }

  override update(_time: number, delta: number): void {
    if (this.battleOver) return;

    // Framerate independent, and a backgrounded tab must not teleport the wave.
    const deltaSeconds = Math.min(delta / 1000, tuning.world.maxFrameSeconds);
    this.elapsedSeconds += deltaSeconds;

    this.background.update(deltaSeconds, this.level.scrollSpeed);
    this.mecha.update(deltaSeconds);
    this.spawner.update(deltaSeconds);
    this.targeting.prune();

    const enemies = this.spawner.activeEnemies;
    this.weapon.update(deltaSeconds, enemies);
    this.turrets.update(deltaSeconds, enemies);
    this.projectiles.update(deltaSeconds, enemies);
    this.economy.update(deltaSeconds);

    this.updateBoss();
    this.updatePresentation(deltaSeconds);
    this.checkEndConditions();
  }

  private updateBoss(): void {
    const boss = this.spawner.activeBoss;
    this.bossBar.update(boss);
    if (boss !== null && boss.consumePhaseChange()) {
      this.audio.play('boss_phase');
      this.vfx.shake(tuning.boss.entranceShakeIntensity);
    }
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

    this.vfx.setExhaustPosition(this.mecha.exhaustX, this.mecha.exhaustY);
    this.vfx.update(deltaSeconds);
    this.focusMarker.update(this.targeting.focusTarget, deltaSeconds);
    this.scrapDrops.update(deltaSeconds);
    this.upgrades.update();
    this.hud.update(
      this.mecha.hullHp,
      this.mecha.hullMax,
      this.economy.balance,
      this.spawner.progress,
    );
  }

  private onEnemyHit(enemy: Enemy, result: DamageResult, _projectile: Projectile): void {
    this.vfx.damageNumber(enemy.x, enemy.centerY, result.amount, result.multiplier);
  }

  private onImpact(x: number, y: number, projectile: Projectile, hitSomething: boolean): void {
    this.vfx.impact(x, y, projectile.isManualShot || projectile.aoeRadius > 0);
    if (hitSomething) {
      this.audio.play('impact', projectile.isManualShot ? 0.8 : 0.45);
    }
  }

  private onEnemyAttack(enemy: Enemy): void {
    if (this.battleOver) return;
    const dealt = this.damage.applyToMecha(this.mecha, enemy.damagePerHit);

    // A boss slam is its own event, not just a bigger bite.
    if (enemy.isBoss) {
      this.vfx.shake(tuning.boss.slamShakeIntensity);
    } else {
      this.vfx.shakeFromDamage(dealt);
    }
    this.audio.play('hull_hit', enemy.isBoss ? 1 : 0.55);
  }

  private onEnemyKilled(enemy: Enemy): void {
    const payout = this.economy.awardKill(enemy.scrapReward);
    const def = enemy.definition;

    if (enemy.isBoss) {
      this.vfx.explosion(enemy.x, enemy.centerY, BOSS_EXPLOSION_SCALE);
      this.vfx.shake(tuning.vfx.shakeMaxIntensity);
      this.audio.play('boss_stinger', 1, -200);
    } else {
      // Bigger bodies throw more debris.
      this.vfx.explosion(enemy.x, enemy.centerY, Math.max(0.6, enemy.bodyWidth / 48));
      if (def !== null) {
        this.audio.play(this.audio.deathSoundFor(def.armorClass), 0.6);
      }
    }

    this.scrapDrops.spawn(enemy.x, enemy.centerY, payout);
    this.enemiesKilled += 1;
    this.spawner.despawn(enemy);
  }

  private onBossSpawned(boss: Boss): void {
    this.bossBar.show(boss);
    this.audio.play('boss_stinger');
    this.vfx.shake(tuning.boss.entranceShakeIntensity);
  }

  /** Effects come from tuning.inBattleUpgrades; the panel owns the prices. */
  private onUpgradePurchased(kind: UpgradeKind): void {
    const config = tuning.inBattleUpgrades;
    switch (kind) {
      case 'damage':
        this.weapon.damageMultiplier += config.damage.bonusPerLevel;
        this.turrets.damageMultiplier += config.damage.bonusPerLevel;
        break;
      case 'fireRate':
        this.weapon.fireRateMultiplier += config.fireRate.bonusPerLevel;
        this.turrets.fireRateMultiplier += config.fireRate.bonusPerLevel;
        break;
      case 'repair':
        this.mecha.repair(this.mecha.hullMax * config.repair.healFraction);
        this.repairsUsed += 1;
        break;
    }
    this.audio.play('upgrade', 0.7);
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
    this.turrets.reset();
    this.projectiles.reset();
    this.spawner.despawnAll();
    this.aimLine.hide();
    this.scrapDrops.reset();
    this.vfx.reset();
    this.bossBar.setVisible(false);
    this.upgrades.setVisible(false);
    this.audio.stopDrone();

    const result: BattleResult = {
      levelId: this.level.id,
      levelName: this.level.name,
      won,
      scrapEarned: this.economy.totalEarned,
      enemiesKilled: this.enemiesKilled,
      hullRemaining: this.mecha.hullHp,
      hullMax: this.mecha.hullMax,
      durationSeconds: this.elapsedSeconds,
      repairsUsed: this.repairsUsed,
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
      // A press on the upgrade panel is a purchase, never the start of an aim.
      if (this.input.hitTestPointer(pointer).length > 0) {
        this.pointerDown = false;
        this.dragOriginAllowed = false;
        return;
      }
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
      const wasDown = this.pointerDown;
      this.pointerDown = false;
      if (this.battleOver || !wasDown) return;

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
      if (picked !== null) {
        this.audio.play('ui_click', 0.5);
      }
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
