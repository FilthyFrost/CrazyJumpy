import Phaser from 'phaser';

export type PickupType = 'coin' | 'gem' | 'wing';

export interface PickupConfig {
    type: PickupType;
    x: number;
    y: number;
}

/**
 * Pickup - 专业掉落物品系统
 * 
 * 三阶段设计：
 * 1. 弹出期 (0.4秒)：物品向随机方向弹出，此时不可拾取
 * 2. 追踪期：物品开始追踪玩家，速度与玩家速度挂钩
 * 3. 拾取：玩家靠近或物品追上玩家时吸收
 */
export class Pickup {
    public scene: Phaser.Scene;
    public sprite: Phaser.GameObjects.Sprite;
    public type: PickupType;
    public isAlive: boolean = true;

    // Position
    public x: number;
    public y: number;

    // State machine
    private state: 'ejecting' | 'chasing' = 'ejecting';
    private stateTimer: number = 0;

    // Ejection parameters (弹出期)
    private ejectDuration: number = 0.4;   // 弹出持续时间
    private ejectVx: number = 0;           // 弹出X速度
    private ejectVy: number = 0;           // 弹出Y速度
    private ejectFriction: number = 8;     // 弹出摩擦力

    // Chase parameters (追踪期)
    private baseChaseSpeed: number = 1000;  // 基础追踪速度
    private chaseSpeedMultiplier: number = 2.0; // 玩家速度倍率
    private chaseAccel: number = 12000;    // 追踪加速度
    private currentSpeed: number = 0;
    private pickupRadius: number = 25;     // 拾取半径 (缩小，让物品更贴近玩家)

    constructor(scene: Phaser.Scene, config: PickupConfig) {
        this.scene = scene;
        this.type = config.type;
        this.x = config.x;
        this.y = config.y;

        // Create sprite - 根据类型选择纹理
        let textureKey: string;
        let size: number;
        switch (config.type) {
            case 'coin':
                textureKey = 'pickup_coin';
                size = 28;
                break;
            case 'gem':
                textureKey = 'pickup_gem';  // A01材料
                size = 32;
                break;
            case 'wing':
                textureKey = 'pickup_wing'; // A02翅膀材料
                size = 36;
                break;
        }
        this.sprite = scene.add.sprite(this.x, this.y, textureKey);
        this.sprite.setDisplaySize(size, size);
        this.sprite.setDepth(150);

        // ===== 弹出动画 =====
        // 随机方向弹出，模拟物品从怪物身上飞出的效果
        const ejectAngle = Math.random() * Math.PI * 2;
        const ejectSpeed = 200 + Math.random() * 150; // 200-350 px/s
        this.ejectVx = Math.cos(ejectAngle) * ejectSpeed;
        this.ejectVy = Math.sin(ejectAngle) * ejectSpeed - 200; // 向上偏移，有抛物线效果

        // Spawn pop animation
        this.sprite.setScale(0);
        scene.tweens.add({
            targets: this.sprite,
            scaleX: size / this.sprite.width,
            scaleY: size / this.sprite.height,
            duration: 150,
            ease: 'Back.easeOut'
        });

        // Add glow effect during ejection
        this.sprite.setTint(0xffffaa);
    }

    /**
     * Update pickup
     * @param dt Delta time in seconds
     * @param playerX Player X position
     * @param playerY Player Y position
     * @param playerSpeed Player current speed (absolute value, px/s)
     * @returns true if picked up (should be removed)
     */
    public update(dt: number, playerX: number, playerY: number, playerSpeed: number = 0): boolean {
        if (!this.isAlive) return true;

        this.stateTimer += dt;

        // State machine
        switch (this.state) {
            case 'ejecting':
                return this.updateEjecting(dt);
            
            case 'chasing':
                return this.updateChasing(dt, playerX, playerY, playerSpeed);
        }
    }

    /**
     * 弹出期：物品向外飞出，此时不可拾取
     */
    private updateEjecting(dt: number): boolean {
        // Apply velocity with friction
        this.x += this.ejectVx * dt;
        this.y += this.ejectVy * dt;

        // Apply friction
        this.ejectVx *= Math.exp(-this.ejectFriction * dt);
        this.ejectVy *= Math.exp(-this.ejectFriction * dt);

        // Add gravity effect
        this.ejectVy += 500 * dt;

        // Update sprite position
        this.sprite.x = this.x;
        this.sprite.y = this.y;

        // Rotate during ejection
        this.sprite.angle += 360 * dt;

        // Check if ejection phase is over
        if (this.stateTimer >= this.ejectDuration) {
            this.state = 'chasing';
            this.stateTimer = 0;
            
            // Remove glow, ready to be picked up
            this.sprite.clearTint();
            this.sprite.angle = 0;

            // Add subtle floating animation
            this.scene.tweens.add({
                targets: this.sprite,
                y: this.y - 6,
                duration: 400,
                yoyo: true,
                repeat: 2, // Float a bit before chasing
                ease: 'Sine.easeInOut'
            });
        }

        return false;
    }

    /**
     * 追踪期：追踪玩家，可以被拾取
     * 
     * 特殊效果：当接近玩家时会"最终冲刺"，加速飞入玩家身体
     */
    private updateChasing(dt: number, playerX: number, playerY: number, playerSpeed: number): boolean {
        // Calculate direction to player
        const dx = playerX - this.x;
        const dy = playerY - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Check if close enough to pick up
        if (dist < this.pickupRadius) {
            this.collect();
            return true;
        }

        // Dynamic chase speed
        let targetSpeed = this.baseChaseSpeed + Math.abs(playerSpeed) * this.chaseSpeedMultiplier;
        
        // ===== 最终冲刺效果 =====
        // 当物品接近玩家时（100px内），速度大幅提升
        // 让物品快速"吸入"玩家身体，视觉效果更好
        const sprintDistance = 100;
        if (dist < sprintDistance) {
            // 距离越近，速度越快 (最高3倍)
            const sprintMultiplier = 1 + 2 * (1 - dist / sprintDistance);
            targetSpeed *= sprintMultiplier;
            
            // 同时缩小物品，产生"被吸入"的效果
            const shrinkScale = 0.5 + 0.5 * (dist / sprintDistance);
            this.sprite.setScale(this.sprite.scaleX * shrinkScale);
        }
        
        // Accelerate towards target speed
        this.currentSpeed = Math.min(this.currentSpeed + this.chaseAccel * dt, targetSpeed);

        // Move towards player
        if (dist > 0) {
            const nx = dx / dist;
            const ny = dy / dist;

            this.x += nx * this.currentSpeed * dt;
            this.y += ny * this.currentSpeed * dt;

            // Kill float tween and update position directly
            this.scene.tweens.killTweensOf(this.sprite);
            this.sprite.x = this.x;
            this.sprite.y = this.y;
        }

        return false;
    }

    /**
     * Collect this pickup
     */
    private collect(): void {
        this.isAlive = false;
        this.scene.tweens.killTweensOf(this.sprite);

        // Collection effect
        this.scene.tweens.add({
            targets: this.sprite,
            scaleX: this.sprite.scaleX * 1.5,
            scaleY: this.sprite.scaleY * 1.5,
            alpha: 0,
            duration: 120,
            ease: 'Power2',
            onComplete: () => {
                this.sprite.destroy();
            }
        });
    }

    /**
     * Destroy this pickup immediately
     */
    public destroy(): void {
        this.isAlive = false;
        this.scene.tweens.killTweensOf(this.sprite);
        this.sprite.destroy();
    }
}
