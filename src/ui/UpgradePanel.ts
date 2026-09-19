import Phaser from 'phaser';

import { escorts, tuning } from '../data';
import type { EconomySystem } from '../systems/EconomySystem';
import { Depths } from './Depths';

/**
 * The mid battle spend, GAME_DESIGN section 2 and 8.
 *
 * Bottom row: damage, fire rate, repair, priced from tuning.inBattleUpgrades.
 * Row above: escorts, priced from escorts.json. Both escalate per purchase
 * within the run and reset next run.
 *
 * Every button is the same shape, a label plus a price plus something to do, so
 * adding a fourth kind later is a list entry rather than a new branch.
 */
export type UpgradeKind = 'damage' | 'fireRate' | 'repair';

const PANEL_MARGIN = 18;
const BUTTON_WIDTH = 176;
const BUTTON_HEIGHT = 56;
const BUTTON_GAP = 10;
const ROW_GAP = 8;
const FILL = 0x3a2f26;
const FILL_HOVER = 0x5c4736;
const FILL_DISABLED = 0x272019;
const FILL_ESCORT = 0x2c3a34;
const BORDER = 0xc9a227;
const BORDER_ESCORT = 0x4a90a4;
const BORDER_DISABLED = 0x4a443c;
const LABEL_COLOR = '#e8dcc6';
const LABEL_COLOR_DISABLED = '#6f6a62';
const COST_COLOR = '#c9a227';
const COST_COLOR_ESCORT = '#7fd0e0';
const COST_COLOR_DISABLED = '#6f6a62';

interface Button {
  readonly background: Phaser.GameObjects.Rectangle;
  readonly label: Phaser.GameObjects.Text;
  readonly costText: Phaser.GameObjects.Text;
  /** Price right now, which changes as it is bought. */
  readonly price: () => number;
  /** Returns false when the purchase could not happen after all. */
  readonly buy: () => boolean;
  /** Text under the label, e.g. the current level. */
  readonly suffix: () => string;
  readonly escort: boolean;
  affordable: boolean;
  lastLabel: string;
}

const LABELS: Record<UpgradeKind, string> = {
  damage: 'DAMAGE',
  fireRate: 'FIRE RATE',
  repair: 'REPAIR',
};

export interface UpgradePanelOptions {
  readonly scene: Phaser.Scene;
  readonly height: number;
  readonly economy: EconomySystem;
  readonly onPurchase: (kind: UpgradeKind) => void;
  readonly onRejected: () => void;
  /** Current scrap price of an escort id. */
  readonly escortCost: (id: string) => number;
  /** Deploys it; returns false when there is no room. */
  readonly onDeploy: (id: string) => boolean;
}

export class UpgradePanel {
  private readonly buttons: Button[] = [];
  private readonly economy: EconomySystem;
  private readonly onRejected: () => void;
  private readonly purchases = new Map<UpgradeKind, number>();

  constructor(options: UpgradePanelOptions) {
    const { scene, height, economy, onPurchase, onRejected, escortCost, onDeploy } = options;
    this.economy = economy;
    this.onRejected = onRejected;

    const bottomRow = height - PANEL_MARGIN - BUTTON_HEIGHT;
    const escortRow = bottomRow - BUTTON_HEIGHT - ROW_GAP;

    const kinds: UpgradeKind[] = ['damage', 'fireRate', 'repair'];
    kinds.forEach((kind, index) => {
      this.addButton(scene, PANEL_MARGIN + index * (BUTTON_WIDTH + BUTTON_GAP), bottomRow, {
        label: LABELS[kind],
        escort: false,
        price: () => this.upgradeCost(kind),
        suffix: () => (kind === 'repair' ? '' : `  Lv${this.purchases.get(kind) ?? 0}`),
        buy: () => {
          this.purchases.set(kind, (this.purchases.get(kind) ?? 0) + 1);
          onPurchase(kind);
          return true;
        },
      });
    });

    escorts.forEach((def, index) => {
      this.addButton(scene, PANEL_MARGIN + index * (BUTTON_WIDTH + BUTTON_GAP), escortRow, {
        label: def.name.toUpperCase(),
        escort: true,
        price: () => escortCost(def.id),
        suffix: () => '  escort',
        buy: () => onDeploy(def.id),
      });
    });
  }

  private addButton(
    scene: Phaser.Scene,
    x: number,
    y: number,
    spec: {
      label: string;
      escort: boolean;
      price: () => number;
      suffix: () => string;
      buy: () => boolean;
    },
  ): void {
    const background = scene.add
      .rectangle(x, y, BUTTON_WIDTH, BUTTON_HEIGHT, spec.escort ? FILL_ESCORT : FILL)
      .setOrigin(0, 0)
      .setStrokeStyle(2, spec.escort ? BORDER_ESCORT : BORDER)
      .setScrollFactor(0)
      .setDepth(Depths.HUD);

    const label = scene.add
      .text(x + 12, y + 10, spec.label, {
        fontFamily: 'monospace',
        fontSize: '15px',
        color: LABEL_COLOR,
      })
      .setScrollFactor(0)
      .setDepth(Depths.HUD + 1);

    const costText = scene.add
      .text(x + 12, y + 30, '', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: spec.escort ? COST_COLOR_ESCORT : COST_COLOR,
      })
      .setScrollFactor(0)
      .setDepth(Depths.HUD + 1);

    const button: Button = {
      background,
      label,
      costText,
      price: spec.price,
      buy: spec.buy,
      suffix: spec.suffix,
      escort: spec.escort,
      affordable: false,
      lastLabel: '',
    };

    background.setInteractive({ useHandCursor: true });
    background.on('pointerover', () => {
      if (button.affordable) background.setFillStyle(FILL_HOVER);
    });
    background.on('pointerout', () => {
      background.setFillStyle(
        button.affordable ? (button.escort ? FILL_ESCORT : FILL) : FILL_DISABLED,
      );
    });
    background.on('pointerup', () => this.tryBuy(button));

    this.buttons.push(button);
  }

  /** Cost of the next purchase of this kind, escalating within the run. */
  private upgradeCost(kind: UpgradeKind): number {
    const track = tuning.inBattleUpgrades[kind];
    const bought = this.purchases.get(kind) ?? 0;
    return Math.round(track.baseCost * Math.pow(track.costGrowth, bought));
  }

  /** Public so BattleScene can report the repair price if it ever needs to. */
  costOf(kind: UpgradeKind): number {
    return this.upgradeCost(kind);
  }

  private tryBuy(button: Button): void {
    const price = button.price();
    if (!this.economy.canAfford(price)) {
      this.onRejected();
      return;
    }
    // Take the scrap only once the action has actually committed, so a full
    // escort bay does not silently eat the payment.
    if (!button.buy()) {
      this.onRejected();
      return;
    }
    this.economy.trySpend(price);
  }

  /** Repaint prices and affordability. Cheap enough to call every frame. */
  update(): void {
    for (const button of this.buttons) {
      const price = button.price();
      const text = `${price} scrap${button.suffix()}`;
      if (text !== button.lastLabel) {
        button.lastLabel = text;
        button.costText.setText(text);
      }

      const affordable = this.economy.canAfford(price);
      if (affordable === button.affordable) continue;
      button.affordable = affordable;
      button.background.setFillStyle(
        affordable ? (button.escort ? FILL_ESCORT : FILL) : FILL_DISABLED,
      );
      button.background.setStrokeStyle(
        2,
        affordable ? (button.escort ? BORDER_ESCORT : BORDER) : BORDER_DISABLED,
      );
      button.label.setColor(affordable ? LABEL_COLOR : LABEL_COLOR_DISABLED);
      button.costText.setColor(
        affordable ? (button.escort ? COST_COLOR_ESCORT : COST_COLOR) : COST_COLOR_DISABLED,
      );
    }
  }

  setVisible(visible: boolean): void {
    for (const button of this.buttons) {
      button.background.setVisible(visible);
      button.label.setVisible(visible);
      button.costText.setVisible(visible);
    }
  }
}
