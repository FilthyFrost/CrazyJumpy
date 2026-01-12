import Phaser from 'phaser';
import { GameConfig } from '../config';

/**
 * Bullet Time Manager
 * Handles the logic for slowing down time, managing energy, and checking activation conditions.
 */
export class BulletTimeManager {
    private scene: Phaser.Scene;

    // State
    public isActive: boolean = false;
    public timeScale: number = 1.0;
    private targetTimeScale: number = 1.0;  // Target for smooth lerp
    private readonly TRANSITION_SPEED: number = 8.0; // Lerp speed (higher = faster)

    // Energy
    public energy: number = 0;              // Current energy in seconds
    public energyCap: number = 5.0;         // Current energy cap (can increase)
    public killRefundAccumulated: number = 0; // Total energy gained from kills this run

    // Timers (Real Time)
    private activeTimer: number = 0;        // How long current activation has lasted
    private cooldownTimer: number = 0;      // Current cooldown remaining

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
        this.energyCap = GameConfig.bulletTime.maxEnergyBase;
    }

    /**
     * Update loop call with REAL delta time (unscaled)
     * @param realDt Real delta time in seconds
     * @param playerHeightM Current player height in meters
     * @param isAscending Whether player is moving up
     */
    public update(realDt: number, playerHeightM: number, isAscending: boolean): void {
        // Cooldown management
        if (this.cooldownTimer > 0) {
            this.cooldownTimer -= realDt;
        }

        // Active state management
        if (this.isActive) {
            this.activeTimer += realDt;

            // Auto-cancel conditions
            let shouldCancel = false;

            // 1. Duration expired
            if (this.activeTimer >= GameConfig.bulletTime.duration) {
                shouldCancel = true;
            }
            // 2. Apex reached (not ascending) or moving down
            else if (!isAscending) {
                shouldCancel = true;
            }
            // 3. Too low
            else if (playerHeightM <= GameConfig.bulletTime.minActivationHeight) {
                shouldCancel = true;
            }

            if (shouldCancel) {
                this.deactivate();
            }
        }

        // ===== SMOOTH TIME SCALE TRANSITION =====
        // Lerp toward target time scale for smooth transitions
        if (Math.abs(this.timeScale - this.targetTimeScale) > 0.001) {
            const t = 1 - Math.exp(-this.TRANSITION_SPEED * realDt);
            this.timeScale = this.timeScale + (this.targetTimeScale - this.timeScale) * t;
        } else {
            this.timeScale = this.targetTimeScale;
        }
    }

    /**
     * Attempt to activate Bullet Time
     * @param playerHeightM Current player height in meters
     * @param isAscending Whether player is moving up
     * @returns boolean Success
     */
    public activate(playerHeightM: number, isAscending: boolean): boolean {
        // Check conditions
        if (this.isActive) return false;
        if (this.cooldownTimer > 0) return false;
        if (playerHeightM <= GameConfig.bulletTime.minActivationHeight) return false;
        if (!isAscending) return false;

        // Check energy cost
        const cost = GameConfig.bulletTime.costPerUse;
        if (this.energy < cost) return false;

        // Activate (set target for smooth transition)
        this.energy -= cost;
        this.isActive = true;
        this.activeTimer = 0;
        this.targetTimeScale = GameConfig.bulletTime.timeScale;

        // Notify scene (for sound/visuals)
        this.scene.events.emit('bullet-time-start');

        return true;
    }

    /**
     * Deactivate Bullet Time (smooth transition back to normal)
     */
    public deactivate(): void {
        if (!this.isActive) return;

        this.isActive = false;
        this.targetTimeScale = 1.0;  // Smooth transition back
        this.cooldownTimer = GameConfig.bulletTime.cooldown;

        // Notify scene
        this.scene.events.emit('bullet-time-end');
    }

    /**
     * Force activate Bullet Time (for auto-trigger, bypasses energy cost)
     * Used by auto bullet time at apex
     */
    public forceActivate(): void {
        if (this.isActive) return;

        this.isActive = true;
        this.activeTimer = 0;
        this.targetTimeScale = GameConfig.bulletTime.timeScale;

        // Notify scene (for sound/visuals)
        this.scene.events.emit('bullet-time-start');
    }

    /**
     * Add energy (e.g. from Perfect landing)
     * @param amount Seconds to add
     */
    public addEnergy(amount: number): void {
        this.energy += amount;

        // Clamp to current cap
        if (this.energy > this.energyCap) {
            this.energy = this.energyCap;
        }

        console.log(`[BulletTime] Added energy: ${amount.toFixed(2)}s, Current: ${this.energy.toFixed(2)}s`);
    }

    /**
     * Handle monster kill logic (refund)
     */
    public onKill(): void {
        if (!this.isActive) return;

        // Add refill
        const refundAmount = GameConfig.bulletTime.energyPerKill;
        this.addEnergy(refundAmount);

        // Increase cap
        const maxRefund = GameConfig.bulletTime.killRefundCap;
        const potentialCap = GameConfig.bulletTime.maxEnergyBase + Math.min(this.killRefundAccumulated + refundAmount, maxRefund);
        const maxPossible = GameConfig.bulletTime.maxEnergyExtended;

        // Update accumulated refund
        if (this.killRefundAccumulated < maxRefund) {
            this.killRefundAccumulated += refundAmount;

            // Recalculate cap
            this.energyCap = Math.min(potentialCap, maxPossible);
        }
    }

    /**
     * Reset per-run stats (e.g. on death/restart)
     */
    public reset(): void {
        this.energy = 2.0; // Start with 2.0s for testing
        this.energyCap = GameConfig.bulletTime.maxEnergyBase;
        this.killRefundAccumulated = 0;
        this.isActive = false;
        this.timeScale = 1.0;
        this.cooldownTimer = 0;
    }

    public getCooldownProgress(): number {
        if (this.cooldownTimer <= 0) return 0;
        return this.cooldownTimer / GameConfig.bulletTime.cooldown;
    }
}
