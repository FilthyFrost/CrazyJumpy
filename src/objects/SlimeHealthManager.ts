import Phaser from 'phaser';
import { GameConfig } from '../config';

/**
 * SlimeHealthManager
 * 
 * Manages the health system for the slime character:
 * - Health tracking (starts at 100 HP)
 * - Damage calculation based on fall height and landing judgment
 * - Death detection
 * - Health bar UI rendering
 */
export class SlimeHealthManager {
    private scene: Phaser.Scene;
    private invincible: boolean = false;

    // Health state
    public currentHealth: number = 100;
    public maxHealth: number = 100;
    public isDead: boolean = false;

    // UI elements
    private healthBar!: Phaser.GameObjects.Graphics;
    private healthBarBg!: Phaser.GameObjects.Graphics;
    private damageText!: Phaser.GameObjects.Text;
    private damageTextTimer: number = 0;

    // Health bar visibility (only show when health changes)
    private healthBarVisibleTimer: number = 0;
    private readonly HEALTH_BAR_SHOW_DURATION = 1.5; // seconds

    // Constants
    private readonly SAFE_ZONE_METERS = 100;
    private readonly INSTANT_DEATH_METERS = 1000;
    private readonly PIXELS_PER_METER = GameConfig.display.pixelsPerMeter;

    // Health bar dimensions (from config)
    private readonly BAR_WIDTH = GameConfig.display.healthBarWidth ?? 84;
    private readonly BAR_HEIGHT = GameConfig.display.healthBarHeight ?? 12;
    private readonly BAR_OFFSET_Y = GameConfig.display.healthBarOffsetY ?? -60;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
        this.createUI();
    }

    private createUI(): void {
        // Health bar background (border)
        this.healthBarBg = this.scene.add.graphics();
        this.healthBarBg.setDepth(99);

        // Health bar fill
        this.healthBar = this.scene.add.graphics();
        this.healthBar.setDepth(100);

        // Damage text
        this.damageText = this.scene.add.text(0, 0, '', {
            fontSize: '32px',
            fontFamily: 'Arial',
            fontStyle: 'bold',
            color: '#ff0000',
            stroke: '#000000',
            strokeThickness: 4
        }).setOrigin(0.5).setDepth(101).setAlpha(0);
    }

    /**
     * Called when the slime lands on the ground
     * @param heightPixels - Fall height in pixels (from lastApexHeight)
     * @param rating - Landing judgment: 'PERFECT' | 'NORMAL' | 'FAILED'
     * @param holdLockout - True if player held space too long (missed bounce)
     */
    public onLanding(heightPixels: number, rating: 'PERFECT' | 'NORMAL' | 'FAILED', holdLockout: boolean): void {
        if (this.isDead || this.invincible) return;

        const heightMeters = heightPixels / this.PIXELS_PER_METER;

        // Check instant death conditions
        // 1. Missed bounce timing after 100m
        if (holdLockout && heightMeters > this.SAFE_ZONE_METERS) {
            this.die('Missed bounce timing!');
            return;
        }

        // 2. Perfect judgment never takes damage
        if (rating === 'PERFECT') {
            return;
        }

        // 3. Below 100m safe zone - no damage
        if (heightMeters <= this.SAFE_ZONE_METERS) {
            return;
        }

        // 4. Calculate damage for NORMAL judgment above 100m
        if (rating === 'NORMAL') {
            const damage = this.calculateDamage(heightMeters);
            this.takeDamage(damage);
        }

        // FAILED judgment is already punished by the existing streak system
        // No additional health damage needed
    }

    /**
     * Calculate damage using exponential curve
     * 
     * Damage range:
     * - 100m: 0 damage (safe zone)
     * - 300m: ~22 damage
     * - 500m: ~44 damage  
     * - 700m: ~67 damage
     * - 1000m: 100 damage (instant death)
     * 
     * Uses linear interpolation for predictable damage scaling.
     */
    private calculateDamage(heightMeters: number): number {
        // Clamp to safe zone
        if (heightMeters <= this.SAFE_ZONE_METERS) {
            return 0;
        }

        // Instant death above 1000m
        if (heightMeters >= this.INSTANT_DEATH_METERS) {
            return this.currentHealth; // Kill instantly
        }

        // Linear damage scaling from safe zone to instant death
        // At 100m: 0 damage, at 1000m: 100 damage
        const normalizedHeight = heightMeters - this.SAFE_ZONE_METERS; // 0 at 100m
        const maxNormalizedHeight = this.INSTANT_DEATH_METERS - this.SAFE_ZONE_METERS; // 900

        // Linear interpolation: damage increases proportionally with height
        const rawDamage = 100 * (normalizedHeight / maxNormalizedHeight);

        // Clamp to valid range
        return Math.min(100, Math.max(0, rawDamage));
    }

    /**
     * Apply damage to the slime
     */
    /**
     * Apply damage to the slime
     */
    public takeDamage(damage: number): void {
        if (this.isDead || this.invincible || damage <= 0) return;

        this.currentHealth = Math.max(0, this.currentHealth - damage);

        // Show damage text
        this.showDamageText(Math.round(damage));

        // Show health bar temporarily
        this.healthBarVisibleTimer = this.HEALTH_BAR_SHOW_DURATION;

        // Check for death
        if (this.currentHealth <= 0) {
            this.die('Health depleted!');
        }
    }

    /**
     * Kill the slime
     */
    private die(reason: string): void {
        if (this.invincible) return;
        this.isDead = true;
        this.currentHealth = 0;

        if (GameConfig.debug) {
            console.log(`[DEATH] ${reason}`);
        }
    }

    /**
     * Show floating damage text
     */
    private showDamageText(damage: number): void {
        this.damageTextTimer = 1.0;
        this.damageText.setText(`-${damage}`);
        this.damageText.setAlpha(1);
        this.damageText.setScale(1.5);
    }

    /**
     * Update health UI (called every frame)
     */
    public update(dt: number, slimeX: number, slimeY: number): void {
        // Update health bar position and visibility
        this.updateHealthBar(slimeX, slimeY, dt);

        // Update damage text
        if (this.damageTextTimer > 0) {
            this.damageTextTimer -= dt;

            const t = this.damageTextTimer / 1.0;
            // Float upward and fade
            const offsetY = (1 - t) * 30; // Float up 30px
            this.damageText.setPosition(slimeX + 60, slimeY + this.BAR_OFFSET_Y - offsetY);
            this.damageText.setAlpha(t);
            this.damageText.setScale(1.5 - 0.5 * (1 - t)); // Scale down slightly
        } else {
            this.damageText.setAlpha(0);
        }
    }

    /**
     * Render health bar above slime
     */
    private updateHealthBar(slimeX: number, slimeY: number, dt: number): void {
        const barX = slimeX - this.BAR_WIDTH / 2;
        const barY = slimeY + this.BAR_OFFSET_Y;

        // Clear previous graphics
        this.healthBarBg.clear();
        this.healthBar.clear();

        // Update visibility timer
        if (this.healthBarVisibleTimer > 0) {
            this.healthBarVisibleTimer -= dt;
        }

        // Only draw if health bar is visible
        if (this.healthBarVisibleTimer <= 0) {
            return; // Health bar is hidden
        }

        // Calculate fade alpha (fade out in last 0.3 seconds)
        let alpha = 1.0;
        if (this.healthBarVisibleTimer < 0.3) {
            alpha = this.healthBarVisibleTimer / 0.3;
        }

        // Draw background (border)
        this.healthBarBg.fillStyle(0x000000, 0.6 * alpha);
        this.healthBarBg.fillRect(barX - 2, barY - 2, this.BAR_WIDTH + 4, this.BAR_HEIGHT + 4);

        // Calculate health percentage
        const healthPercent = this.currentHealth / this.maxHealth;
        const fillWidth = this.BAR_WIDTH * healthPercent;

        // Determine color based on health
        let barColor: number;
        if (healthPercent > 0.6) {
            barColor = 0x00ff00; // Green
        } else if (healthPercent > 0.3) {
            barColor = 0xffff00; // Yellow
        } else {
            barColor = 0xff0000; // Red
        }

        // Draw health bar fill
        if (fillWidth > 0) {
            this.healthBar.fillStyle(barColor, alpha);
            this.healthBar.fillRect(barX, barY, fillWidth, this.BAR_HEIGHT);
        }
    }

    /**
     * Reset health (for restart)
     */
    public reset(): void {
        this.currentHealth = this.maxHealth;
        this.isDead = false;
        this.damageTextTimer = 0;
        this.damageText.setAlpha(0);
    }

    /**
     * Enable/disable invincibility (no damage, no death).
     */
    public setInvincible(enabled: boolean): void {
        this.invincible = enabled;
        if (enabled) {
            this.isDead = false;
            this.currentHealth = this.maxHealth;
            this.damageTextTimer = 0;
            this.healthBarVisibleTimer = 0;
            this.damageText.setAlpha(0);
        }
    }

    /**
     * Apply UI scaling based on safe frame
     */
    public applyUIScale(safeWidth: number): void {
        // Scale damage text
        const damageSize = Math.min(40, Math.floor(safeWidth * 0.08));
        this.damageText.setFontSize(damageSize);
        this.damageText.setStroke('#000000', Math.max(3, damageSize * 0.1));
    }

    /**
     * Cleanup resources
     */
    public destroy(): void {
        this.healthBar.destroy();
        this.healthBarBg.destroy();
        this.damageText.destroy();
    }
}
