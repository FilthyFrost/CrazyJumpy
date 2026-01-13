import Phaser from 'phaser';
import { GameConfig } from '../config';
import { BulletTimeManager } from '../managers/BulletTimeManager';

/**
 * Bullet Time UI - Redesigned with Icon Button
 * 
 * Design:
 * - Icon button follows player, positioned below height text
 * - Energy bar remains fixed at top-right HUD
 * - Clean, professional game feel
 */
export class BulletTimeUI {
    private scene: Phaser.Scene;
    private bulletTimeManager: BulletTimeManager;

    // Player-following icon button
    private iconButton!: Phaser.GameObjects.Image;
    private iconContainer!: Phaser.GameObjects.Container;

    // HUD Elements (fixed to screen)
    private hudContainer!: Phaser.GameObjects.Container;
    private energyBarBg!: Phaser.GameObjects.Graphics;
    private energyBarFill!: Phaser.GameObjects.Graphics;
    private energyIcon!: Phaser.GameObjects.Text;
    private energyText!: Phaser.GameObjects.Text;

    // Config
    private readonly BAR_WIDTH = 120;
    private readonly BAR_HEIGHT = 10;
    private readonly MARGIN = 15;
    private readonly ICON_SIZE = GameConfig.ui.bulletTimeIcon.size; // From config

    // Position storage
    private _barX: number = 0;
    private _barY: number = 0;

    constructor(scene: Phaser.Scene, bulletTimeManager: BulletTimeManager) {
        this.scene = scene;
        this.bulletTimeManager = bulletTimeManager;

        this.createIconButton();
        this.createEnergyBarHUD();
    }

    /**
     * Create the icon button that follows the player
     */
    private createIconButton(): void {
        // Container for the icon (follows player in world space)
        this.iconContainer = this.scene.add.container(0, 0);
        this.iconContainer.setDepth(1001);

        // Icon image
        this.iconButton = this.scene.add.image(0, 0, 'bt_icon');
        this.iconButton.setDisplaySize(this.ICON_SIZE, this.ICON_SIZE);
        this.iconButton.setOrigin(0.5);
        this.iconContainer.add(this.iconButton);

        // Make icon clickable
        this.iconButton.setInteractive({ useHandCursor: true });
        this.iconButton.on('pointerdown', () => {
            this.scene.events.emit('bullet-time-button-click');
        });
    }

    /**
     * Create the energy bar fixed to top-right of screen
     */
    private createEnergyBarHUD(): void {
        const screenW = this.scene.scale.width;

        // Position: Top right corner
        const barX = screenW - this.MARGIN - this.BAR_WIDTH;
        const barY = this.MARGIN + 10;
        this._barX = barX;
        this._barY = barY;

        // Container for HUD elements
        this.hudContainer = this.scene.add.container(0, 0);
        this.hudContainer.setScrollFactor(0);
        this.hudContainer.setDepth(2000);

        // Energy Icon
        this.energyIcon = this.scene.add.text(barX - 20, barY, '⚡', {
            fontSize: '16px',
        }).setOrigin(0.5);
        this.hudContainer.add(this.energyIcon);

        // Background bar
        this.energyBarBg = this.scene.add.graphics();
        this.energyBarBg.fillStyle(0x000000, 0.6);
        this.energyBarBg.fillRoundedRect(barX, barY - this.BAR_HEIGHT / 2, this.BAR_WIDTH, this.BAR_HEIGHT, 4);
        this.energyBarBg.lineStyle(1, 0x666666, 0.8);
        this.energyBarBg.strokeRoundedRect(barX, barY - this.BAR_HEIGHT / 2, this.BAR_WIDTH, this.BAR_HEIGHT, 4);
        this.hudContainer.add(this.energyBarBg);

        // Fill bar (dynamic)
        this.energyBarFill = this.scene.add.graphics();
        this.hudContainer.add(this.energyBarFill);

        // Energy text
        this.energyText = this.scene.add.text(barX + this.BAR_WIDTH / 2, barY + 12, '0.0s', {
            fontSize: '10px',
            fontFamily: 'Arial',
            color: '#aaaaaa',
        }).setOrigin(0.5, 0);
        this.hudContainer.add(this.energyText);
    }

    /**
     * Update icon position to follow player (below height text)
     */
    public updatePosition(x: number, y: number): void {
        // Position icon below height text (offset from config)
        const yOffset = GameConfig.ui.bulletTimeIcon.yOffset;
        this.iconContainer.setPosition(x, y + yOffset);
    }

    /**
     * Set visibility of the icon button
     */
    public setVisible(visible: boolean): void {
        this.iconContainer.setVisible(visible);
    }

    public update(): void {
        const mgr = this.bulletTimeManager;

        // === UPDATE ICON SIZE FROM CONFIG (dynamic) ===
        const iconSize = GameConfig.ui.bulletTimeIcon.size;
        this.iconButton.setDisplaySize(iconSize, iconSize);

        // === UPDATE ICON BUTTON STATE ===
        const canActivate = mgr.energy >= GameConfig.bulletTime.costPerUse &&
            mgr.getCooldownProgress() <= 0 &&
            !mgr.isActive;

        // Visual feedback on icon
        let scaleMultiplier = 1.0;
        if (mgr.isActive) {
            // Active: Cyan tint, slight scale up
            this.iconButton.setTint(0x00ffff);
            scaleMultiplier = 1.2;
            this.iconButton.setAlpha(1.0);
        } else if (canActivate) {
            // Ready: Normal, no tint
            this.iconButton.clearTint();
            scaleMultiplier = 1.0;
            this.iconButton.setAlpha(1.0);
        } else {
            // Disabled/Cooldown: Dim
            this.iconButton.setTint(0x666666);
            scaleMultiplier = 1.0;
            this.iconButton.setAlpha(0.5);
        }

        // Apply size from config with scale multiplier
        const finalSize = iconSize * scaleMultiplier;
        this.iconButton.setDisplaySize(finalSize, finalSize);

        // === UPDATE ENERGY BAR ===
        this.energyBarFill.clear();

        const fillPercent = Math.min(mgr.energy / mgr.energyCap, 1.0);
        const fillWidth = Math.max(2, this.BAR_WIDTH * fillPercent - 2);

        // Color based on state
        let fillColor = 0x00ff88; // Default green
        if (mgr.isActive) {
            fillColor = 0x00ffff; // Cyan during bullet time
        } else if (fillPercent >= 1.0) {
            fillColor = 0xffff00; // Yellow when full
        } else if (fillPercent < 0.2) {
            fillColor = 0xff4444; // Red when low
        }

        this.energyBarFill.fillStyle(fillColor, 1.0);
        this.energyBarFill.fillRoundedRect(
            this._barX + 1,
            this._barY - this.BAR_HEIGHT / 2 + 1,
            fillWidth,
            this.BAR_HEIGHT - 2,
            3
        );

        // Update text
        this.energyText.setText(`${mgr.energy.toFixed(1)}s`);
    }
}
