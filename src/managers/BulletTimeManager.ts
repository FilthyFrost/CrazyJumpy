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
    private currentDuration: number = 3.0;  // Dynamic duration for current activation

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
        this.energyCap = GameConfig.bulletTime.maxEnergyBase;
        this.currentDuration = GameConfig.bulletTime.baseDuration ?? 3.0;
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

            // 1. Duration expired (use dynamic duration)
            if (this.activeTimer >= this.currentDuration) {
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
        this.targetTimeScale = GameConfig.bulletTime.timeScaleMax;

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
        this.forceActivateWithHeight(50); // Default to minimum height
    }

    /**
     * Force activate Bullet Time with dynamic duration and timeScale based on height
     * 
     * 动态时长公式: duration = baseDuration + maxExtraDuration × (1 - e^(-height/durationTau))
     * 动态速度公式: timeScale = minScale + (maxScale - minScale) × e^(-height/scaleTau)
     * 
     * 设计理念:
     * - 高度越高，绝对速度越快
     * - 需要用更低的 timeScale 来补偿，保持难度循序渐进
     * - 难度上限设在 3000m 左右，骨灰级玩家的极限挑战
     * 
     * 难度曲线 (PERFECT):
     * - 50m   → 0.42x (新手友好)
     * - 300m  → 0.38x (入门)
     * - 600m  → 0.34x (进阶)
     * - 1000m → 0.30x (高手)
     * - 1500m → 0.27x (大师)
     * - 3000m → 0.22x (极限)
     * 
     * NORMAL 判定:
     * - 时长 = PERFECT 的 55%
     * - timeScale = PERFECT 的 1.4x (更快，更难砍怪)
     * 
     * @param apexHeightM The predicted apex height in meters
     * @param rating The launch rating ('PERFECT' or 'NORMAL')
     */
    public forceActivateWithHeight(apexHeightM: number, rating: 'PERFECT' | 'NORMAL' = 'PERFECT'): void {
        if (this.isActive) return;

        // ===== 动态时长计算 =====
        const baseDuration = GameConfig.bulletTime.baseDuration ?? 3.0;
        const maxExtraDuration = GameConfig.bulletTime.maxExtraDuration ?? 20.0;
        const durationTau = GameConfig.bulletTime.durationTau ?? 800;

        const extraDuration = maxExtraDuration * (1 - Math.exp(-apexHeightM / durationTau));
        let calculatedDuration = baseDuration + extraDuration;

        // ===== 动态 timeScale 计算 (难度曲线) =====
        const maxScale = GameConfig.bulletTime.timeScaleMax ?? 0.42;
        const minScale = GameConfig.bulletTime.timeScaleMin ?? 0.20;
        const scaleTau = GameConfig.bulletTime.timeScaleTau ?? 1500;

        // 公式: timeScale = minScale + (maxScale - minScale) × e^(-height/tau)
        // 高度越高 → timeScale 越低 → 游戏速度越慢 → 补偿高绝对速度
        let dynamicTimeScale = minScale + (maxScale - minScale) * Math.exp(-apexHeightM / scaleTau);

        // ===== NORMAL 判定调整：时长缩短，速度加快（惩罚但不空窗）=====
        if (rating === 'NORMAL') {
            calculatedDuration *= 0.55;           // 时长 55%
            dynamicTimeScale *= 1.4;              // 速度 1.4x（更快更难）
            dynamicTimeScale = Math.min(dynamicTimeScale, 0.7); // 封顶防止太快
        }

        this.currentDuration = calculatedDuration;
        this.isActive = true;
        this.activeTimer = 0;
        this.targetTimeScale = dynamicTimeScale;

        if (GameConfig.debug) {
            console.log(`[BulletTime] Rating: ${rating} | Height: ${apexHeightM.toFixed(0)}m | Duration: ${this.currentDuration.toFixed(1)}s | TimeScale: ${dynamicTimeScale.toFixed(2)}x`);
        }

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

        if (GameConfig.debug) {
            console.log(`[BulletTime] Added energy: ${amount.toFixed(2)}s, Current: ${this.energy.toFixed(2)}s`);
        }
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
        this.energy = 12.0; // Start with 5.0s for testing
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

    /**
     * Get remaining time ratio for UI display
     * @returns 0 = just started (full), 1 = time expired (empty)
     */
    public getTimeProgress(): number {
        if (!this.isActive) return 0;
        return Math.min(1, this.activeTimer / this.currentDuration);
    }

    /**
     * Get current duration for this activation
     */
    public getCurrentDuration(): number {
        return this.currentDuration;
    }

    /**
     * Get active timer value
     */
    public getActiveTimer(): number {
        return this.activeTimer;
    }
}
