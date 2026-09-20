import Phaser from 'phaser';

import { portraitFor } from '../AssetKeys';
import { bindArt } from '../ArtBinding';
import { pilots, tuning, weapons } from '../data';
import { SaveManager } from '../systems/SaveManager';
import type { PilotDef, WeaponDef } from '../types';
import { Depths } from '../ui/Depths';
import { createTextButton } from '../ui/TextButton';
import { SceneKeys } from './SceneKeys';

/**
 * Where cores are spent (GAME_DESIGN section 8): weapon cards and unlocks, the
 * extra turret mounts, hull upgrades and pilot levels.
 *
 * Every price comes from weapons.json, pilots.json or tuning.meta, and every
 * purchase goes straight into the save, so the next battle reads it.
 */

const CARD_WIDTH = 228;
const CARD_HEIGHT = 132;
const CARD_GAP = 14;
const COLUMN_TOP = 104;

const FILL = 0x3a2f26;
const FILL_HOVER = 0x5c4736;
const FILL_DISABLED = 0x241e18;
const FILL_EQUIPPED = 0x38452c;
const BORDER = 0xc9a227;
const BORDER_DISABLED = 0x4a443c;

interface CardAction {
  readonly label: string;
  readonly cost: number;
  readonly enabled: boolean;
  readonly run: () => void;
}

export class HangarScene extends Phaser.Scene {
  private saves!: SaveManager;

  constructor() {
    super(SceneKeys.Hangar);
  }

  create(): void {
    this.saves = new SaveManager();
    this.render();
  }

  /** Simplest correct refresh after a purchase: rebuild the screen. */
  private rebuild(): void {
    this.scene.restart();
  }

  private render(): void {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor(0x1a1512);

    this.add
      .text(width * 0.5, 40, 'HANGAR', {
        fontFamily: 'monospace',
        fontSize: '34px',
        color: '#c9a227',
      })
      .setOrigin(0.5);

    this.add
      .text(width - 24, 30, `CORES ${this.saves.cores}`, {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#e8dcc6',
      })
      .setOrigin(1, 0);

    this.renderWeapons(width);
    this.renderTurretsAndChassis(width);
    this.renderPilots(width);

    createTextButton(this, width * 0.5, height - 40, 'BACK', () => {
      this.scene.start(SceneKeys.LevelSelect);
    });
  }

  // Weapons ----------------------------------------------------------------

  private renderWeapons(width: number): void {
    const mains = weapons.filter((weapon) => weapon.slot === 'main');
    this.sectionLabel(24, COLUMN_TOP - 24, 'MAIN CANNON');

    const rowWidth = mains.length * CARD_WIDTH + (mains.length - 1) * CARD_GAP;
    const startX = (width - rowWidth) * 0.5;

    mains.forEach((weapon, index) => {
      this.weaponCard(weapon, startX + index * (CARD_WIDTH + CARD_GAP), COLUMN_TOP);
    });
  }

  private weaponCard(weapon: WeaponDef, x: number, y: number): void {
    const owned = this.saves.ownsWeapon(weapon.id);
    const level = this.saves.weaponLevel(weapon.id);
    const equipped = this.equippedIn(weapon.slot) === weapon.id;
    const maxed = level >= weapon.upgradeTrack.length;

    const lines = [
      weapon.name,
      `${weapon.damageType}  dmg ${weapon.baseDamage}`,
      owned ? `card level ${level} / ${weapon.upgradeTrack.length}` : 'locked',
    ];

    const action = this.weaponAction(weapon, owned, level, equipped, maxed);
    this.card(x, y, lines, action, equipped);
  }

  private weaponAction(
    weapon: WeaponDef,
    owned: boolean,
    level: number,
    equipped: boolean,
    maxed: boolean,
  ): CardAction {
    if (!owned) {
      const cost = tuning.meta.weaponUnlockCosts[weapon.id] ?? 0;
      return {
        label: 'UNLOCK',
        cost,
        enabled: this.saves.cores >= cost,
        run: () => {
          if (!this.saves.spendCores(cost)) return;
          this.saves.unlockWeapon(weapon.id);
          this.rebuild();
        },
      };
    }

    if (!equipped) {
      return {
        label: 'EQUIP',
        cost: 0,
        enabled: true,
        run: () => {
          this.equip(weapon);
          this.rebuild();
        },
      };
    }

    if (maxed) {
      return { label: 'MAXED', cost: 0, enabled: false, run: () => {} };
    }

    const cost = weapon.upgradeTrack[level].costCores;
    return {
      label: 'UPGRADE',
      cost,
      enabled: this.saves.cores >= cost,
      run: () => {
        if (!this.saves.spendCores(cost)) return;
        this.saves.upgradeWeapon(weapon.id);
        this.rebuild();
      },
    };
  }

  /** Which weapon is fitted in a slot, so one card renderer serves both. */
  private equippedIn(slot: WeaponDef['slot']): string {
    return slot === 'turret' ? this.saves.equippedTurret : this.saves.equippedMain;
  }

  private equip(weapon: WeaponDef): void {
    if (weapon.slot === 'turret') {
      this.saves.equipTurret(weapon.id);
      return;
    }
    this.saves.equipMain(weapon.id);
  }

  // Turrets and chassis ------------------------------------------------------

  /**
   * One row, because four sections do not fit the canvas vertically. Turret
   * weapons sit next to the mounts they are fitted to, which is also where you
   * want them when deciding what to spend on.
   */
  private renderTurretsAndChassis(width: number): void {
    const y = COLUMN_TOP + CARD_HEIGHT + 56;
    const turrets = weapons.filter((weapon) => weapon.slot === 'turret');
    const cards = turrets.length + 2;
    const rowWidth = cards * CARD_WIDTH + (cards - 1) * CARD_GAP;
    const startX = (width - rowWidth) * 0.5;

    this.sectionLabel(startX, y - 24, 'TURRET WEAPON');
    turrets.forEach((weapon, index) => {
      this.weaponCard(weapon, startX + index * (CARD_WIDTH + CARD_GAP), y);
    });

    const chassisX = startX + turrets.length * (CARD_WIDTH + CARD_GAP);
    this.sectionLabel(chassisX, y - 24, 'CHASSIS');
    this.card(chassisX, y, this.hullLines(), this.hullAction(), false);
    this.card(chassisX + CARD_WIDTH + CARD_GAP, y, this.mountLines(), this.mountAction(), false);
  }

  private hullLines(): string[] {
    const level = this.saves.hullLevel;
    return [
      'Hull Plating',
      `level ${level} / ${tuning.meta.hullUpgrade.costs.length}`,
      `hull ${this.saves.hullMax()}`,
    ];
  }

  private hullAction(): CardAction {
    const level = this.saves.hullLevel;
    const costs = tuning.meta.hullUpgrade.costs;
    if (level >= costs.length) {
      return { label: 'MAXED', cost: 0, enabled: false, run: () => {} };
    }
    const cost = costs[level];
    return {
      label: 'UPGRADE',
      cost,
      enabled: this.saves.cores >= cost,
      run: () => {
        if (!this.saves.spendCores(cost)) return;
        this.saves.upgradeHull();
        this.rebuild();
      },
    };
  }

  private mountLines(): string[] {
    const fitted = this.saves.turretMounts;
    const max = tuning.mecha.turretMountOffsets.length;
    const turret = weapons.find((weapon) => weapon.id === this.saves.equippedTurret);
    return [
      'Turret Mounts',
      `${fitted} / ${max} fitted`,
      turret ? `each: ${turret.name}` : 'no turret weapon',
    ];
  }

  private mountAction(): CardAction {
    const fitted = this.saves.turretMounts;
    const max = tuning.mecha.turretMountOffsets.length;
    if (fitted >= max) {
      return { label: 'MAXED', cost: 0, enabled: false, run: () => {} };
    }
    // Mount 1 is free, so mount 2 reads cost[0].
    const cost = tuning.meta.turretMountCosts[fitted - 1] ?? 0;
    return {
      label: 'FIT MOUNT',
      cost,
      enabled: this.saves.cores >= cost,
      run: () => {
        if (!this.saves.spendCores(cost)) return;
        this.saves.addTurretMount();
        this.rebuild();
      },
    };
  }

  // Pilots -----------------------------------------------------------------

  private renderPilots(width: number): void {
    const y = COLUMN_TOP + (CARD_HEIGHT + 56) * 2;
    this.sectionLabel(24, y - 24, 'PILOTS');

    const rowWidth = pilots.length * CARD_WIDTH + (pilots.length - 1) * CARD_GAP;
    const startX = (width - rowWidth) * 0.5;

    pilots.forEach((pilot, index) => {
      this.pilotCard(pilot, startX + index * (CARD_WIDTH + CARD_GAP), y);
    });
  }

  private pilotCard(pilot: PilotDef, x: number, y: number): void {
    const hired = this.saves.hasPilot(pilot.id);
    const level = this.saves.pilotLevel(pilot.id);
    const equipped = this.saves.equippedPilot === pilot.id;

    const lines = [
      pilot.name,
      `${pilot.ability.name}  ${pilot.ability.cooldown}s`,
      hired ? `level ${level} / ${pilot.levelCosts.length}` : 'not hired',
    ];

    this.card(x, y, lines, this.pilotAction(pilot, hired, level, equipped), equipped);

    // Portrait sits on the right of the card, dimmed until hired.
    const art = portraitFor(pilot.id);
    if (art !== null) {
      const portrait = bindArt(this, this.add.image(0, 0, art), art);
      // Sized to clear the card text rather than fill the card.
      const fit = (CARD_HEIGHT - 44) / portrait.displayHeight;
      portrait
        .setPosition(x + CARD_WIDTH - 10, y + CARD_HEIGHT - 6)
        .setOrigin(1, 1)
        .setScale(portrait.scale * fit)
        .setAlpha(hired ? 0.95 : 0.3)
        .setDepth(Depths.HUD + 1);
    }
  }

  private pilotAction(
    pilot: PilotDef,
    hired: boolean,
    level: number,
    equipped: boolean,
  ): CardAction {
    if (!hired) {
      const cost = pilot.levelCosts[0];
      return {
        label: 'HIRE',
        cost,
        enabled: this.saves.cores >= cost,
        run: () => {
          if (!this.saves.spendCores(cost)) return;
          this.saves.levelUpPilot(pilot.id);
          this.saves.equipPilot(pilot.id);
          this.rebuild();
        },
      };
    }

    if (!equipped) {
      return {
        label: 'ASSIGN',
        cost: 0,
        enabled: true,
        run: () => {
          this.saves.equipPilot(pilot.id);
          this.rebuild();
        },
      };
    }

    if (level >= pilot.levelCosts.length) {
      return { label: 'MAXED', cost: 0, enabled: false, run: () => {} };
    }

    const cost = pilot.levelCosts[level];
    return {
      label: 'LEVEL UP',
      cost,
      enabled: this.saves.cores >= cost,
      run: () => {
        if (!this.saves.spendCores(cost)) return;
        this.saves.levelUpPilot(pilot.id);
        this.rebuild();
      },
    };
  }

  // Shared drawing ---------------------------------------------------------

  private sectionLabel(x: number, y: number, text: string): void {
    this.add
      .text(x, y, text, { fontFamily: 'monospace', fontSize: '16px', color: '#9a8f7c' })
      .setOrigin(0, 0);
  }

  private card(
    x: number,
    y: number,
    lines: string[],
    action: CardAction,
    highlighted: boolean,
  ): void {
    const baseFill = highlighted ? FILL_EQUIPPED : action.enabled ? FILL : FILL_DISABLED;

    const background = this.add
      .rectangle(x, y, CARD_WIDTH, CARD_HEIGHT, baseFill)
      .setOrigin(0, 0)
      .setStrokeStyle(2, action.enabled || highlighted ? BORDER : BORDER_DISABLED)
      .setDepth(Depths.HUD);

    this.add
      .text(x + 12, y + 12, lines.join('\n'), {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: action.enabled || highlighted ? '#e8dcc6' : '#6f6a62',
        lineSpacing: 6,
      })
      .setDepth(Depths.HUD + 1);

    const costText = action.cost > 0 ? `${action.label}  ${action.cost}` : action.label;
    this.add
      .text(x + 12, y + CARD_HEIGHT - 26, costText, {
        fontFamily: 'monospace',
        fontSize: '15px',
        color: action.enabled ? '#c9a227' : '#6f6a62',
      })
      .setDepth(Depths.HUD + 1);

    if (!action.enabled) return;

    background.setInteractive({ useHandCursor: true });
    background.on('pointerover', () => background.setFillStyle(FILL_HOVER));
    background.on('pointerout', () => background.setFillStyle(baseFill));
    background.on('pointerup', action.run);
  }
}
