import Phaser from 'phaser';
import { GameConfig } from '../config';
import { BulletTimeManager } from '../managers/BulletTimeManager';

/**
 * BulletTimeHourglass - 子弹时间沙漏UI
 * 
 * 设计：
 * - 子弹时间激活时显示在高度指示器下方
 * - 使用经典RPG扇形冷却效果：蓝色扇形从12点钟顺时针扫过
 * - 提前结束时加速完成动画，而不是突然消失
 * - 子弹时间结束后消失，保持极简风格
 */
export class BulletTimeHourglass {
    private scene: Phaser.Scene;
    private bulletTimeManager: BulletTimeManager;

    // Graphics
    private container: Phaser.GameObjects.Container;
    private icon: Phaser.GameObjects.Image;
    private cooldownOverlay: Phaser.GameObjects.Graphics;
    private borderRing: Phaser.GameObjects.Graphics;

    // State
    private isVisible: boolean = false;
    private iconSize: number;
    
    // Accelerated completion state
    private isAccelerating: boolean = false;
    private acceleratedProgress: number = 0;
    private lastRealProgress: number = 0;

    constructor(scene: Phaser.Scene, bulletTimeManager: BulletTimeManager) {
        this.scene = scene;
        this.bulletTimeManager = bulletTimeManager;

        this.iconSize = GameConfig.ui.bulletTimeIcon?.size ?? 48;

        // Create container for positioning
        this.container = scene.add.container(0, 0);
        this.container.setDepth(201); // Above height text (200)
        this.container.setVisible(false);

        // Create hourglass icon
        this.icon = scene.add.image(0, 0, 'bt_icon');
        this.icon.setDisplaySize(this.iconSize, this.iconSize);
        this.container.add(this.icon);

        // Create cooldown overlay (pie/wedge effect)
        this.cooldownOverlay = scene.add.graphics();
        this.container.add(this.cooldownOverlay);

        // Create border ring
        this.borderRing = scene.add.graphics();
        this.container.add(this.borderRing);
    }

    /**
     * Update position and cooldown display
     * @param playerX Player X position
     * @param playerY Player Y position
     */
    public update(playerX: number, playerY: number): void {
        const isActive = this.bulletTimeManager.isActive;

        // Show/Hide based on bullet time state
        if (isActive && !this.isVisible && !this.isAccelerating) {
            this.show();
        } else if (!isActive && this.isVisible && !this.isAccelerating) {
            // Bullet time ended - start accelerated completion
            this.startAcceleratedCompletion();
        }

        if (!this.isVisible) return;

        // Update position (follow player, below height text)
        const yOffset = GameConfig.ui.bulletTimeIcon?.yOffset ?? 80;
        this.container.setPosition(playerX, playerY + yOffset);

        // Update cooldown display
        this.updateCooldownOverlay();
    }

    /**
     * Start accelerated completion animation
     * Instead of suddenly disappearing, quickly complete the cooldown circle
     */
    private startAcceleratedCompletion(): void {
        this.isAccelerating = true;
        this.acceleratedProgress = this.lastRealProgress;

        // Animate to 100% progress then fade out
        this.scene.tweens.add({
            targets: this,
            acceleratedProgress: 1.0,
            duration: 200, // Fast completion
            ease: 'Power2',
            onComplete: () => {
                this.hide();
            }
        });
    }

    /**
     * Update the RPG-style pie/wedge cooldown overlay
     * Blue semi-transparent wedge sweeps clockwise from 12 o'clock
     */
    private updateCooldownOverlay(): void {
        this.cooldownOverlay.clear();
        this.borderRing.clear();

        // Get progress (either real or accelerated)
        let progress: number;
        if (this.isAccelerating) {
            progress = this.acceleratedProgress;
        } else {
            progress = this.bulletTimeManager.getTimeProgress();
            this.lastRealProgress = progress; // Store for acceleration
        }

        // Draw border ring (always visible when active)
        const radius = this.iconSize / 2 + 4;
        this.borderRing.lineStyle(3, 0x4488ff, 0.9);
        this.borderRing.strokeCircle(0, 0, radius);

        // No overlay needed if just started
        if (progress <= 0.001) return;

        // Calculate the sweep angle
        // progress 0 = no overlay, progress 1 = full circle overlay
        const sweepAngle = progress * Math.PI * 2;

        // Start from 12 o'clock (-90 degrees = -PI/2)
        const startAngle = -Math.PI / 2;
        const endAngle = startAngle + sweepAngle;

        // Draw pie wedge overlay (covers the "used" portion)
        const overlayRadius = this.iconSize / 2 + 2;
        
        // Blue semi-transparent overlay (brighter during acceleration)
        const alpha = this.isAccelerating ? 0.7 : 0.55;
        this.cooldownOverlay.fillStyle(0x2266cc, alpha);
        this.cooldownOverlay.beginPath();
        this.cooldownOverlay.moveTo(0, 0);
        this.cooldownOverlay.arc(0, 0, overlayRadius, startAngle, endAngle, false);
        this.cooldownOverlay.closePath();
        this.cooldownOverlay.fillPath();

        // Draw edge line at current position (the "sweep hand")
        const edgeX = Math.cos(endAngle) * overlayRadius;
        const edgeY = Math.sin(endAngle) * overlayRadius;
        this.cooldownOverlay.lineStyle(2, 0x88ccff, 1.0);
        this.cooldownOverlay.beginPath();
        this.cooldownOverlay.moveTo(0, 0);
        this.cooldownOverlay.lineTo(edgeX, edgeY);
        this.cooldownOverlay.strokePath();
    }

    private show(): void {
        this.isVisible = true;
        this.isAccelerating = false;
        this.acceleratedProgress = 0;
        this.lastRealProgress = 0;
        
        this.container.setVisible(true);
        this.container.setAlpha(0);

        // Fade in animation
        this.scene.tweens.add({
            targets: this.container,
            alpha: 1,
            duration: 150,
            ease: 'Power2'
        });
    }

    private hide(): void {
        // Fade out animation
        this.scene.tweens.add({
            targets: this.container,
            alpha: 0,
            duration: 150,
            ease: 'Power2',
            onComplete: () => {
                this.isVisible = false;
                this.isAccelerating = false;
                this.container.setVisible(false);
                this.cooldownOverlay.clear();
                this.borderRing.clear();
            }
        });
    }

    /**
     * Clean up resources
     */
    public destroy(): void {
        this.container.destroy();
    }
}
