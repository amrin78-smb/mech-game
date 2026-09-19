import Phaser from 'phaser';

import { cannonArtFor } from '../AssetKeys';
import { getLevelDef, getWeaponDef, levels, tuning, weapons } from '../data';
import type { Boss } from '../entities/Boss';
import type { Enemy } from '../entities/Enemy';
import { Mecha } from '../entities/Mecha';
import { AudioManager } from '../systems/AudioManager';
import { DamageSystem, type DamageResult } from '../systems/DamageSystem';
import { EconomySystem } from '../systems/EconomySystem';
import { ProjectileSystem } from '../systems/ProjectileSystem';
import { TargetingSystem } from '../systems/TargetingSystem';
import { TurretSystem } from '../systems/TurretSystem';
import { PilotSystem } from '../systems/PilotSystem';
import { SaveManager, type SaveSettings } from '../systems/SaveManager';
import { evaluateStars } from '../systems/StarRating';
import { VfxManager } from '../systems/VfxManager';
import { WaveSpawner } from '../systems/WaveSpawner';
import { WeaponSystem } from '../systems/WeaponSystem';
import type { BattleResult, LevelDef } from '../types';
import { AbilityButton } from '../ui/AbilityButton';
import { AimLine } from '../ui/AimLine';
import { BossBar } from '../ui/BossBar';
import { FocusMarker } from '../ui/FocusMarker';
import { Hud } from '../ui/Hud';
import { ParallaxBackground } from '../ui/ParallaxBackground';
import { PerfOverlay } from '../ui/PerfOverlay';
import { ScrapDrops } from '../ui/ScrapDrops';
import { TutorialHints } from '../ui/TutorialHints';
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
  private saves!: SaveManager;
  private pilotSystem!: PilotSystem;

  private hud!: Hud;
  private aimLine!: AimLine;
  private focusMarker!: FocusMarker;
  private scrapDrops!: ScrapDrops;
  private upgrades!: UpgradePanel;
  private bossBar!: BossBar;
  private abilityButton!: AbilityButton;
  private hints!: TutorialHints;
  private perf!: PerfOverlay;

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
    this.saves = new SaveManager();
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
    // Hull, loadout and mounts all come out of the save, so Hangar spending shows up here.
    this.mecha = new Mecha(
      this,
      mechaX,
      groundY,
      this.saves.hullMax(),
      cannonArtFor(this.mainWeaponId()),
    );

    this.targeting = new TargetingSystem();
    this.damage = new DamageSystem();
    this.economy = new EconomySystem(this.level);
    this.vfx = new VfxManager(this, this.saves.settings);
    this.audio = new AudioManager(this, this.saves.settings);

    this.projectiles = new ProjectileSystem({
      scene: this,
      damage: this.damage,
      onEnemyKilled: (enemy) => this.onEnemyKilled(enemy),
      onEnemyHit: (enemy, result) => this.onEnemyHit(enemy, result),
      onImpact: (x, y, heavy, hitSomething) => this.onImpact(x, y, heavy, hitSomething),
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
      onBeam: (x, y, rotation, length) => this.vfx.beam(x, y, rotation, length),
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
    const mounts = Math.min(this.saves.turretMounts, tuning.mecha.turretMountOffsets.length);
    for (let index = 0; index < mounts; index += 1) {
      this.turrets.addMount(this, index);
    }

    // Hangar weapon cards and the pilot's passive are baked in before the fight.
    this.weapon.damageMultiplier = this.weaponDamageMultiplier();
    this.weapon.fireRateMultiplier = this.weaponFireRateMultiplier();

    this.pilotSystem = new PilotSystem(
      this.saves.equippedPilot,
      this.saves.equippedPilot === null ? 0 : this.saves.pilotLevel(this.saves.equippedPilot),
      this.mecha,
      this.weapon,
      this.turrets,
    );

    this.hud = new Hud(this, baseWidth, () => this.pauseBattle());
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

    this.abilityButton = new AbilityButton(this, baseWidth, baseHeight, this.pilotSystem, () =>
      this.activateAbility(),
    );
    this.hints = new TutorialHints(this, this.level.id, baseWidth, baseHeight);
    this.perf = new PerfOverlay(this);

    this.mecha.onFootfall = (x, y) => {
      this.vfx.footfall(x, y);
      this.vfx.shake(tuning.vfx.shakeMaxIntensity * 0.12);
    };

    this.registerInput();
    this.cameras.main.setBackgroundColor(0x1a1512);
    this.audio.startDrone();

    // Leave no sound or emitter running when the scene is torn down.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.audio.destroy());
  }

  /** Whatever the Hangar has equipped, falling back to the first main slot weapon. */
  private mainWeaponId(): string {
    const equipped = this.saves.equippedMain;
    if (this.saves.ownsWeapon(equipped)) return equipped;

    const main = weapons.find((weapon) => weapon.slot === 'main');
    if (!main) throw new Error('No weapon with slot "main" in src/data/weapons.json');
    return main.id;
  }

  /**
   * Hangar card levels are cumulative: every entry up to the owned level adds
   * its bonus. The pilot's cannon passive rides on top.
   */
  private weaponDamageMultiplier(): number {
    const def = getWeaponDef(this.mainWeaponId());
    const level = this.saves.weaponLevel(def.id);
    let multiplier = 1;
    for (let i = 0; i < level && i < def.upgradeTrack.length; i += 1) {
      multiplier += def.upgradeTrack[i].damageBonus ?? 0;
    }
    return multiplier + this.saves.passiveBonus('cannon_damage');
  }

  private weaponFireRateMultiplier(): number {
    const def = getWeaponDef(this.mainWeaponId());
    const level = this.saves.weaponLevel(def.id);
    let multiplier = 1;
    for (let i = 0; i < level && i < def.upgradeTrack.length; i += 1) {
      multiplier += def.upgradeTrack[i].fireRateBonus ?? 0;
    }
    return multiplier;
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
    this.pilotSystem.update(deltaSeconds);

    this.updateBoss();
    this.updatePresentation(deltaSeconds);
    this.checkEndConditions();
  }

  private updateBoss(): void {
    const boss = this.spawner.activeBoss;
    this.bossBar.update(boss);
    if (boss !== null && boss.consumePhaseChange()) {
      this.audio.play('boss_phase');
      this.vfx.shake(tuning.boss.default.entranceShakeIntensity);
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
    this.abilityButton.update();
    this.hints.update(deltaSeconds);
    this.perf.update(deltaSeconds, {
      enemies: this.spawner.aliveCount,
      projectiles: this.projectiles.activeCount,
    });
    this.hud.update(
      this.mecha.hullHp,
      this.mecha.hullMax,
      this.economy.balance,
      this.spawner.progress,
    );
  }

  private onEnemyHit(enemy: Enemy, result: DamageResult): void {
    this.vfx.damageNumber(enemy.x, enemy.centerY, result.amount, result.multiplier);
  }

  private onImpact(x: number, y: number, heavy: boolean, hitSomething: boolean): void {
    this.vfx.impact(x, y, heavy);
    if (hitSomething) {
      this.audio.play('impact', heavy ? 0.8 : 0.45);
    }
  }

  private onEnemyAttack(enemy: Enemy): void {
    if (this.battleOver) return;
    const dealt = this.damage.applyToMecha(this.mecha, enemy.damagePerHit);

    // A boss slam is its own event, not just a bigger bite.
    if (enemy.isBoss) {
      this.vfx.shake(tuning.boss.default.slamShakeIntensity);
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
    this.vfx.shake(tuning.boss.default.entranceShakeIntensity);
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

  /**
   * Pause runs PauseScene as an overlay rather than a panel inside this scene,
   * so its buttons stay live while this scene's update loop is stopped.
   */
  private pauseBattle(): void {
    if (this.battleOver || this.scene.isPaused()) return;

    this.weapon.cancelManualAim();
    this.pointerDown = false;
    this.audio.play('ui_click', 0.5);

    this.scene.pause();
    this.scene.launch(SceneKeys.Pause, {
      resumeKey: SceneKeys.Battle,
      onSettingsChanged: (settings: SaveSettings) => {
        // Applied live; particle budgets are fixed at construction, so a
        // quality change lands on the next level rather than mid fight.
        this.audio.applySettings(settings);
        this.vfx.shakeEnabled = settings.shakeEnabled;
      },
    });
  }

  private activateAbility(): void {
    if (this.battleOver) return;
    if (this.pilotSystem.activate()) {
      this.audio.play('upgrade', 0.8, 200);
      this.vfx.shake(tuning.boss.default.slamShakeIntensity * 0.5);
      return;
    }
    this.audio.play('ui_click', 0.4, -300);
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
    this.abilityButton.setVisible(false);
    this.pilotSystem.reset();
    this.audio.stopDrone();

    const hullFraction = this.mecha.hullFraction;
    const stars = evaluateStars(this.level, won, hullFraction, this.repairsUsed);
    const coresAwarded = this.saves.recordResult(
      this.level.id,
      won,
      stars,
      hullFraction,
      this.level.rewards.firstClearCores,
      this.level.rewards.coresPerStar,
    );

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
      stars,
      coresAwarded,
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

    this.input.keyboard?.on("keydown-ESC", () => this.pauseBattle());
    this.input.keyboard?.on("keydown-P", () => this.pauseBattle());

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
