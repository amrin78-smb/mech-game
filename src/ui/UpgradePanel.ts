import Phaser from 'phaser';

import { tuning } from '../data';
import type { EconomySystem } from '../systems/EconomySystem';
import { Depths } from './Depths';

/**
 * The mid battle spend, GAME_DESIGN section 2 and 8: three buttons, prices that
 * escalate per purchase within the run and reset next run.
 *
 * All costs and effects come from tuning.inBattleUpgrades; this file only draws
 * them and reports purchases back to BattleScene.
 */
export type UpgradeKind = 'damage' | 'fireRate' | 'repair';

const PANEL_MARGIN = 18;
const BUTTON_WIDTH = 176;
const BUTTON_HEIGHT = 56;
const BUTTON_GAP = 10;
const FILL = 0x3a2f26;
const FILL_HOVER = 0x5c4736;
const FILL_DISABLED = 0x272019;
const BORDER = 0xc9a227;
const BORDER_DISABLED = 0x4a443c;
const LABEL_COLOR = '#e8dcc6';
const LABEL_COLOR_DISABLED = '#6f6a62';
const COST_COLOR = '#c9a227';
const COST_COLOR_DISABLED = '#6f6a62';

interface UpgradeButton {
  readonly kind: UpgradeKind;
  readonly background: Phaser.GameObjects.Rectangle;
  readonly label: Phaser.GameObjects.Text;
  readonly cost: Phaser.GameObjects.Text;
  purchases: number;
  affordable: boolean;
}

const LABELS: Record<UpgradeKind, string> = {
  damage: 'DAMAGE',
  fireRate: 'FIRE RATE',
  repair: 'REPAIR',
};

export class UpgradePanel {
  private readonly buttons: UpgradeButton[] = [];
  private readonly onPurchase: (kind: UpgradeKind) => void;
  private readonly onRejected: () => void;
  private readonly economy: EconomySystem;

  constructor(
    scene: Phaser.Scene,
    height: number,
    economy: EconomySystem,
    onPurchase: (kind: UpgradeKind) => void,
    onRejected: () => void,
  ) {
    this.economy = economy;
    this.onPurchase = onPurchase;
    this.onRejected = onRejected;

    const kinds: UpgradeKind[] = ['damage', 'fireRate', 'repair'];
    const top = height - PANEL_MARGIN - BUTTON_HEIGHT;

    kinds.forEach((kind, index) => {
      const x = PANEL_MARGIN + index * (BUTTON_WIDTH + BUTTON_GAP);

      const background = scene.add
        .rectangle(x, top, BUTTON_WIDTH, BUTTON_HEIGHT, FILL)
        .setOrigin(0, 0)
        .setStrokeStyle(2, BORDER)
        .setScrollFactor(0)
        .setDepth(Depths.HUD);

      const label = scene.add
        .text(x + 12, top + 10, LABELS[kind], {
          fontFamily: 'monospace',
          fontSize: '15px',
          color: LABEL_COLOR,
        })
        .setScrollFactor(0)
        .setDepth(Depths.HUD + 1);

      const cost = scene.add
        .text(x + 12, top + 30, '', {
          fontFamily: 'monospace',
          fontSize: '14px',
          color: COST_COLOR,
        })
        .setScrollFactor(0)
        .setDepth(Depths.HUD + 1);

      const button: UpgradeButton = { kind, background, label, cost, purchases: 0, affordable: false };

      background.setInteractive({ useHandCursor: true });
      background.on('pointerover', () => {
        if (button.affordable) background.setFillStyle(FILL_HOVER);
      });
      background.on('pointerout', () => {
        background.setFillStyle(button.affordable ? FILL : FILL_DISABLED);
      });
      background.on('pointerup', () => this.tryPurchase(button));

      this.buttons.push(button);
      this.refreshButton(button);
    });
  }

  /** Cost of the next purchase of this kind, escalating within the run. */
  costOf(kind: UpgradeKind): number {
    const button = this.buttons.find((candidate) => candidate.kind === kind);
    const track = tuning.inBattleUpgrades[kind];
    const purchases = button?.purchases ?? 0;
    return Math.round(track.baseCost * Math.pow(track.costGrowth, purchases));
  }

  private tryPurchase(button: UpgradeButton): void {
    const cost = this.costOf(button.kind);
    if (!this.economy.trySpend(cost)) {
      this.onRejected();
      return;
    }
    button.purchases += 1;
    this.onPurchase(button.kind);
    this.refreshButton(button);
  }

  /** Repaint affordability. Cheap enough to call every frame. */
  update(): void {
    for (const button of this.buttons) {
      const affordable = this.economy.canAfford(this.costOf(button.kind));
      if (affordable === button.affordable) continue;
      button.affordable = affordable;
      button.background.setFillStyle(affordable ? FILL : FILL_DISABLED);
      button.background.setStrokeStyle(2, affordable ? BORDER : BORDER_DISABLED);
      button.label.setColor(affordable ? LABEL_COLOR : LABEL_COLOR_DISABLED);
      button.cost.setColor(affordable ? COST_COLOR : COST_COLOR_DISABLED);
    }
  }

  private refreshButton(button: UpgradeButton): void {
    const cost = this.costOf(button.kind);
    const suffix = button.kind === 'repair' ? '' : `  Lv${button.purchases}`;
    button.cost.setText(`${cost} scrap${suffix}`);
    button.affordable = !this.economy.canAfford(cost);
    this.update();
  }

  setVisible(visible: boolean): void {
    for (const button of this.buttons) {
      button.background.setVisible(visible);
      button.label.setVisible(visible);
      button.cost.setVisible(visible);
    }
  }
}
