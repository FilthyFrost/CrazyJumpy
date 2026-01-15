import Phaser from 'phaser';
import { GameConfig } from '../config';
import { IdleState } from './slime/IdleState';
import { AirborneState } from './slime/AirborneState';
import { ChargingState } from './slime/ChargingState';
import type { ISlimeState } from './slime/ISlimeState';
import { SlimeHealthManager } from './SlimeHealthManager';
import type { MonsterType } from './Monster';

export type SlimeState = 'GROUNDED_IDLE' | 'AIRBORNE' | 'GROUND_CHARGING';

import Ground from './Ground';
import GameScene from '../scenes/GameScene';

export default class Slime {
    public graphics: Phaser.GameObjects.Sprite;

    public scene: Phaser.Scene;
    public x: number;
    public y: number;
    public vy: number = 0; // +down, -up
    public radius: number = GameConfig.display.playerCollisionRadius;  // Collision radius (separate from display size)

    public state: SlimeState = 'AIRBORNE';
    public ground: Ground;  // Reference to Ground object
    public groundLevel: number; // Keep for convenience (ground.y)

    // Air control
    public userAccel: number = 0; // extra +down accel
    public holdTime: number = 0;
    public prevSpaceDown: boolean = false;
    public fastFallEnergy: number = 0;       // Energy accumulated during fast fall
    public fastFallTime: number = 0;         // Time spent holding space during active descent (for energy multiplier)

    // Distance-based tracking (prevent "last second charge" exploit)
    public fallDistanceSinceApex: number = 0;     // Total fall distance from apex
    public fastFallDistance: number = 0;          // Distance fallen while holding space
    public prevYForFall: number = 0;              // Previous Y for calculating dy
    public landingFallDistance: number = 0;       // Snapshot: total fall distance at landing
    public landingFastFallDistance: number = 0;   // Snapshot: fast-fall distance at landing

    // Ground/compression (physics)
    public impactSpeed: number = 0;
    public targetCompression: number = 0;
    public currentCompression: number = 0;
    public reachedPeak: boolean = false;
    public chargeEfficiency: number = 1.0;
    public overflow: number = 0;

    // Contact bookkeeping
    public contactHasInput: boolean = false;

    // Peak / timing controls
    public postPeakHoldTime: number = 0; // how long we held after reaching peak
    public holdLockout: boolean = false; // if true: releasing will NOT launch (failure)

    // Apex tracking (controlled growth)
    public prevVyForApex: number = 0;
    public lastApexHeight: number = 0;

    // Difficulty snapshot (fixed at landing, avoids frame-to-frame jitter)
    public landingApexHeight: number = 0;
    public landingDifficulty: number = 1;

    // Visual ground deformation (decoupled)
    public groundDeform: number = 0;
    public groundRecoverTau: number = 0.12;

    // Yellow zone tracking for Perfect timing
    public isInYellowZone: boolean = false;
    public yellowZoneStartTime: number = 0;  // When yellow zone was entered

    // Launch feedback
    public lastLaunchRating: 'PERFECT' | 'NORMAL' | 'FAILED' | '' = '';
    public feedbackText!: Phaser.GameObjects.Text;
    public feedbackTimer: number = 0;

    // Streak and Energy tracking
    public perfectStreak: number = 0;        // Consecutive perfect count
    public comboText!: Phaser.GameObjects.Text;
    public comboTimer: number = 0;

    // Auto Bullet Time at Apex (for PERFECT bounces > 50m, or NORMAL with reduced effect)
    public predictedApexHeight: number = 0;     // Predicted apex height in pixels (calculated at launch)
    public launchY: number = 0;                 // Y position at launch (for calculating progress)
    public autoBTEligible: boolean = false;     // Whether this ascent qualifies for auto bullet time
    public autoBTActivated: boolean = false;    // Whether auto bullet time has been triggered this ascent
    public launchRating: 'PERFECT' | 'NORMAL' | 'FAILED' = 'PERFECT'; // Rating of the launch that triggered this ascent

    // DEBUFFS
    public poison1Duration: number = 0;   // 中毒I总时长
    public poison2Duration: number = 0;   // 中毒II总时长
    private poisonTickTimer: number = 0;  // 伤害tick计时
    public slowImpulseTimer: number = 0;  // 上升减速的提示持续一点点时间（仅视觉/提示用）
    private debuffGraceUntil: number = 0; // 攻击击杀后短暂无敌（防止同帧撞怪）
    private recentHitGraceUntil: number = 0; // 砍中怪物后短暂无负面（砍到必然接触）
    private swingGraceUntil: number = 0;  // 攻击挥刀窗口内免疫负面（确保先判击杀）
    public recentKilledIds: Set<number> = new Set(); // 近期被击杀的怪物ID，防止同帧撞击判负面
    private recentHitTimestamp: number = 0; // 最近一次击杀怪物的时间戳（ms）

    // Test mode: pending initial jump height (pixels) to override first idle jump
    public pendingTestJumpHeightPx: number = 0;

    // Charge Effect Animation
    public chargeEffectSprite!: Phaser.GameObjects.Sprite;
    public chargeEffectFrame: number = 0;          // Current frame (1-11)
    public chargeEffectState: 'idle' | 'charging' | 'holding' | 'releasing' = 'idle';
    public chargeEffectTimer: number = 0;          // Animation timer
    private chargeEffectDisplayScale: number = 3;  // Smoothed scale
    private chargeEffectDisplayAlpha: number = 1;  // Smoothed alpha
    // Charging frames 1-6, release frames 7-11
    private readonly RELEASE_START_FRAME = 7;      // Release starts at frame 7
    private readonly RELEASE_END_FRAME = 11;       // Release ends at frame 11
    private readonly RELEASE_FRAME_DURATION = 0.04; // Time per frame during release

    private states: Record<SlimeState, ISlimeState>;
    private currentState: ISlimeState;

    // Yellow spark particles for perfect timing
    private sparkEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;

    // Shake signals
    public chargeShake01: number = 0;       // Intensity of charge shake (0..1)
    public airShake01: number = 0;          // Intensity of air turbulence (0..1)
    public chargeProximity: number = 0;     // Debug/Feedback: How close to perfect (0..1)

    // Visual Shake (Sprite only)
    public visualShakeX: number = 0;
    public visualShakeY: number = 0;

    // Health System
    public healthManager!: SlimeHealthManager;

    // Lane System (三通道换道)
    public currentLane: number = 1;              // 0=左, 1=中, 2=右
    public targetLaneX: number = 0;              // 目标X位置
    public laneSwitchLocked: boolean = false;    // 快落时锁定换道
    private laneTween?: Phaser.Tweens.Tween;     // 换道动画
    private screenWidth: number = 540;           // 画布宽度
    public facingDirection: -1 | 1 = 1;          // 朝向: -1=左, 1=右 (默认向右)

    // Animation state tracking
    private currentAnimation: string = '';
    public isPlayingAttackAnimation: boolean = false;  // 攻击动画播放中

    constructor(scene: Phaser.Scene, x: number, y: number, ground: Ground) {
        this.scene = scene;
        this.x = x;
        this.y = y;
        this.ground = ground;
        this.groundLevel = ground.y;

        // Use animated sprite from cyclop spritesheet
        const playerSize = GameConfig.display.playerSize;
        this.graphics = scene.add.sprite(x, y, 'cyclop')
            .setDisplaySize(playerSize, playerSize)
            .setDepth(10);

        // Play idle animation initially (starts on ground)
        this.playAnimation('idle');

        // Initial velocity (don't override y position - use the passed in value)
        // Initial velocity (don't override y position - use the passed in value)
        this.vy = 0;
        this.prevVyForApex = this.vy;
        this.prevYForFall = y;  // Initialize for distance tracking

        // Feedback text for Perfect/Normal/FAILED (world space, follows slime)
        this.feedbackText = scene.add.text(x, y - 80, '', {
            fontSize: '64px', // Placeholder, updated by applyUIScale
            fontFamily: 'Arial',
            fontStyle: 'bold',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 6
        }).setOrigin(0.5).setDepth(100).setAlpha(0);

        // Combo display (world space, BELOW slime)
        this.comboText = scene.add.text(x, y + 50, '', {
            fontSize: '32px', // Placeholder, updated by applyUIScale
            fontFamily: 'Arial',
            fontStyle: 'bold',
            color: '#00ffff',
            stroke: '#000000',
            strokeThickness: 4
        }).setOrigin(0.5, 0.5).setDepth(100).setAlpha(0);

        // Yellow spark particles for perfect timing feedback
        this.sparkEmitter = scene.add.particles(x, y, 'spark', {
            speed: { min: 50, max: 150 },
            angle: { min: 0, max: 360 },
            scale: { start: 0.6, end: 0 },
            lifespan: 400,
            frequency: 30,
            quantity: 2,
            tint: 0xffff00,
            emitting: false
        }).setDepth(15);

        // Charge effect sprite (behind player, anchored在脚下)
        this.chargeEffectSprite = scene.add.sprite(x, y, 'chargeup_1');
        this.chargeEffectSprite.setOrigin(0.5, 1); // 脚底对齐
        this.chargeEffectSprite.setDepth(this.graphics.depth - 1); // Behind player
        this.chargeEffectSprite.setScale(3); // Scale up as needed
        this.chargeEffectSprite.setVisible(false);

        // Initial velocity (don't override y position - use the passed in value)
        this.vy = 0;
        this.prevVyForApex = this.vy;
        this.prevYForFall = y;  // Initialize for distance tracking

        const gcfg = GameConfig.ground as any;
        this.groundRecoverTau = (gcfg.releaseRecoverTime ?? 0.12) as number;

        // Initialize Health Manager
        this.healthManager = new SlimeHealthManager(scene);

        // Initialize States
        this.states = {
            'GROUNDED_IDLE': new IdleState(),
            'AIRBORNE': new AirborneState(),
            'GROUND_CHARGING': new ChargingState()
        };

        // Set initial state - start grounded so player doesn't fall on game start
        this.state = 'GROUNDED_IDLE';
        this.currentState = this.states['GROUNDED_IDLE'];
        this.currentState.enter(this);

        // Sync visual position with physics position after state initialization
        this.updateVisuals();
    }

    public transitionTo(newState: SlimeState) {
        this.currentState.exit(this);
        this.state = newState;
        this.currentState = this.states[newState];
        this.currentState.enter(this);
    }

    update(deltaMs: number, isSpaceDown: boolean) {
        // dt is now guaranteed to be stable by GameScene's fixed timestep loop
        // No need to clamp here - removing Math.min() improves consistency
        const dt = deltaMs / 1000;

        const justPressed = isSpaceDown && !this.prevSpaceDown;
        const justReleased = !isSpaceDown && this.prevSpaceDown;
        this.prevSpaceDown = isSpaceDown;

        this.currentState.update(this, dt, isSpaceDown, justPressed, justReleased);

        // Debuff ticking（中毒/减速）
        this.updateDebuffs(dt);

        // Hard clamp: never allow embedding when not airborne
        // This failsafe ensures player center never goes below ground level
        if (this.state !== 'AIRBORNE') {
            const gy = this.getGroundY();
            if (this.y > gy) this.y = gy;
        }

        // ===== UPDATE TEXT POSITIONS TO FOLLOW SLIME =====
        // Layout order: Player → Combo → Height → BT Icon
        // Combo text directly below slime (if visible)
        if (this.comboTimer > 0) {
            this.comboText.setPosition(this.x, this.y + 50);
            this.comboTimer -= dt;

            // Pop effect: 1.8 -> 1.0
            const t = this.comboTimer / 1.0;
            if (t > 0.8) {
                const scale = 1.0 + ((t - 0.8) / 0.2) * 0.8; // 1.0 -> 1.8
                this.comboText.setScale(scale);
                this.comboText.setAlpha(1);
            } else {
                this.comboText.setScale(1.0);
                this.comboText.setAlpha(t / 0.8);
            }
        } else {
            this.comboText.setAlpha(0);
        }

        // Feedback text above slime (if visible)
        if (this.feedbackTimer > 0) {
            this.feedbackText.setPosition(this.x, this.y - 100);
            this.feedbackTimer -= dt;

            // Explosion effect: scale down from 2.0 to 1.0 quickly, then fade
            const t = this.feedbackTimer / 0.8;  // 0.8 second total duration
            if (t > 0.7) {
                // First 0.24s: explosion scale 2.0 -> 1.0
                const scaleT = (t - 0.7) / 0.3;
                const scale = 1.0 + scaleT * 1.0;
                this.feedbackText.setScale(scale);
                this.feedbackText.setAlpha(1);
            } else if (t > 0) {
                // Remaining time: fade out
                this.feedbackText.setScale(1.0);
                this.feedbackText.setAlpha(t / 0.7);
            } else {
                this.feedbackText.setAlpha(0);
            }
        }

        // ===== YELLOW SPARK PARTICLES (DISABLED per user request) =====
        // this.sparkEmitter.setPosition(this.x, this.y);
        // if (this.isInYellowZone && this.state === 'GROUND_CHARGING') {
        //     if (!this.sparkEmitter.emitting) { this.sparkEmitter.start(); }
        // } else {
        //     if (this.sparkEmitter.emitting) { this.sparkEmitter.stop(); }
        // }

        // ===== CHARGE EFFECT ANIMATION =====
        this.updateChargeEffect(dt);

        this.updateGroundDeform(dt);
        this.updateVisuals();
        this.updateAnimation();

        // Update health manager
        this.healthManager.update(dt, this.x, this.y);
    }

    public showFeedback(rating: 'PERFECT' | 'NORMAL' | 'FAILED') {
        this.lastLaunchRating = rating;
        this.feedbackTimer = 0.8;  // Shorter duration with explosion effect
        this.feedbackText.setAlpha(1);
        this.feedbackText.setScale(2.0);  // Start big for explosion effect
        this.feedbackText.setPosition(this.x, this.y - 100);

        if (rating === 'PERFECT') {
            this.feedbackText.setText('PERFECT!');
            // User request: Change color to Yellow (like before)
            this.feedbackText.setColor('#ffff00');

            // CHARGE BULLET TIME ENERGY
            // Energy = Clamp(holdTime, 0, 5.0)
            // Use this.holdTime (which tracks hold duration active during fall)
            if (this.scene instanceof GameScene) {
                const chargeAmount = Phaser.Math.Clamp(this.holdTime, 0, 5.0);
                // Access manager via public property (we just added it)
                (this.scene as any).bulletTimeManager?.addEnergy(chargeAmount);
            }

            // Complete charge effect animation (play remaining frames)
            this.completeChargeEffect();

        } else if (rating === 'NORMAL') {
            this.feedbackText.setText('Normal');
            this.feedbackText.setColor('#ffff00');

            // Complete charge effect animation (play remaining frames)
            this.completeChargeEffect();

        } else {
            this.feedbackText.setText('FAILED');
            this.feedbackText.setColor('#ff0000');

            // Cancel charge effect animation (hide immediately)
            this.cancelChargeEffect();
        }

        // Show Combo Text if streak > 1 and Perfect
        if (rating === 'PERFECT' && this.perfectStreak > 1) {
            this.comboTimer = 1.0;
            this.comboText.setText(`${this.perfectStreak} COMBO!`);
            this.comboText.setColor('#00ffff'); // Cyan
            this.comboText.setAlpha(1);
            this.comboText.setScale(1.8); // Pop smaller (was 2.5)
        }
    }

    // ------------------------------------------------------------
    // Visual ground deformation (smooth)
    // ------------------------------------------------------------
    private updateGroundDeform(dt: number) {
        const ground = GameConfig.ground as any;

        if (this.state === 'GROUND_CHARGING') {
            const followTau = (ground.deformFollowTime ?? 0.03) as number;
            this.groundDeform = this.approach(this.groundDeform, this.currentCompression, dt, followTau);
        } else {
            this.groundDeform = this.approach(this.groundDeform, 0, dt, this.groundRecoverTau);
            if (this.groundDeform < 1e-4) this.groundDeform = 0;
        }
    }

    public getGroundY(): number {
        // groundLevel - radius = bottom of sprite touches ground
        // + playerYOffset = configurable offset (negative = higher, positive = lower)
        // + surfaceOffset = dynamic ground deformation at this X position
        const surfaceOffset = this.ground.getSurfaceOffsetAt(this.x);
        return this.groundLevel - this.radius + GameConfig.display.playerYOffset + surfaceOffset;
    }

    public approach(current: number, target: number, dt: number, tau: number): number {
        if (tau <= 0) return target;
        const alpha = 1 - Math.exp(-dt / tau);
        return current + (target - current) * alpha;
    }

    // ------------------------------------------------------------
    // Visuals (slime)
    // ------------------------------------------------------------
    private updateVisuals() {
        this.graphics.setPosition(this.x, this.y);

        if (this.state === 'AIRBORNE') {
            // Fast fall intensity: blend from white to red
            const p = Math.min(1, this.userAccel / GameConfig.air.maxFastFallAccel);
            if (p > 0.1) {
                const r = 0xff;
                const g = Math.floor(0xff * (1 - p * 0.7));
                const b = Math.floor(0xff * (1 - p * 0.7));
                this.graphics.setTint(Phaser.Display.Color.GetColor(r, g, b));
            } else {
                this.graphics.clearTint();  // Normal color
            }
        } else if (this.state === 'GROUND_CHARGING') {
            // failure = dark tint
            if (this.holdLockout) {
                this.graphics.setTint(0x333333);
            } else if (this.reachedPeak && this.postPeakHoldTime > ((GameConfig.ground as any).sweetHoldGrace ?? 0.08)) {
                // late hold = darker
                this.graphics.setTint(0x666666);
            } else {
                const proximity = this.currentCompression / (this.targetCompression + 0.1);
                if (proximity > 0.9) {
                    this.graphics.setTint(0xffff00);  // Yellow = ready to launch
                } else {
                    this.graphics.clearTint();
                }
            }
        } else {
            // GROUNDED_IDLE - normal color
            this.graphics.clearTint();
        }

        // Squash/stretch - calculate base scale from playerSize
        // The sprite is 32x32, so we need to scale it to playerSize (64 -> baseScale 2)
        const baseScale = GameConfig.display.playerSize / 32;
        let scaleX = baseScale;
        let scaleY = baseScale;

        if (this.state === 'GROUND_CHARGING' || this.state === 'GROUNDED_IDLE') {
            const factorRaw = this.currentCompression / 200;
            const factor = Phaser.Math.Clamp(factorRaw, 0, 1.8); // Prevent scaleY from being negative or too small
            scaleX = baseScale * (1 + factor);
            scaleY = baseScale * (1 - factor * 0.5);
        } else {
            const stretch = Math.min(1.5, 1 + Math.abs(this.vy) / 4000);
            scaleX = baseScale / stretch;
            scaleY = baseScale * stretch;
        }

        this.graphics.setScale(scaleX, scaleY);

        // Position logic:
        // If grounded, force sprite bottom to align with ground surface
        let gx = this.x;
        let gy = this.y;

        if (this.state === 'GROUND_CHARGING' || this.state === 'GROUNDED_IDLE') {
            const groundCenterY = this.getGroundY();        // Physics center Y (y at center of circle)
            // But wait, getGroundY() returns 'groundLevel - radius + offset + surfaceOffset'
            // which IS the physics center position.

            // We want Visual Bottom = Ground Level + Surface Offset
            // Actually simpler: physics y is center. Ground surface is y + radius.
            // groundCenterY IS (SurfaceY - Radius) ideally.
            // So SurfaceY = groundCenterY + Radius.

            const surfY = groundCenterY + this.radius;
            // Align sprite bottom (originY=0.5 means center to bottom is displayHeight/2)
            // But wait, changing scale changes displayHeight.
            // visualBottom = gy + (displayHeight * 0.5)
            // We want visualBottom = surfY
            // gy = surfY - (displayHeight * 0.5)

            gy = surfY - (scaleY * 32 * 0.5);
            // 32 is original texture height. scaleY * 32 is current displayHeight.
        }

        // Apply visual shake (if any)
        gx += this.visualShakeX;
        gy += this.visualShakeY;

        this.graphics.setPosition(gx, gy);
    }


    // Ground renderer should use this (visual deformation)
    public getCompression(): number {
        return this.groundDeform;
    }

    // Dynamic UI Scaling (9:16 Safe Frame)
    public applyUIScale(safeWidth: number) {
        // Feedback Text: 15% of safe width, max 80px
        const feedbackSize = Math.min(80, Math.floor(safeWidth * 0.15));
        this.feedbackText.setFontSize(feedbackSize);
        this.feedbackText.setStroke('#000000', Math.max(4, feedbackSize * 0.1));

        // Combo Text: 8% of safe width, max 40px
        const comboSize = Math.min(40, Math.floor(safeWidth * 0.08));
        this.comboText.setFontSize(comboSize);
        this.comboText.setStroke('#000000', Math.max(3, comboSize * 0.1));

        // Health Manager UI scaling
        this.healthManager.applyUIScale(safeWidth);
    }

    /**
     * Play death animation once, then call onComplete callback
     */
    public playDeathAnimation(onComplete: () => void): void {
        // Stop any current animation
        this.graphics.stop();
        this.currentAnimation = 'die';

        // Reset visual state for death animation
        this.graphics.clearTint();
        const playerSize = GameConfig.display.playerSize;
        this.graphics.setScale(playerSize / 32);  // Reset to base scale

        // Play death animation once
        this.graphics.play('die');

        // Listen for animation complete
        this.graphics.once('animationcomplete', () => {
            onComplete();
        });

        // Hide spark particles
        this.sparkEmitter.stop();

        // Hide combo and feedback text
        this.comboText.setAlpha(0);
        this.feedbackText.setAlpha(0);
    }

    /**
     * Play animation only if it's different from current
     * Avoids redundant play() calls that would reset the animation
     */
    private playAnimation(key: string): void {
        if (this.currentAnimation !== key) {
            this.currentAnimation = key;
            this.graphics.play(key);
        }
    }

    /**
     * Update the character animation based on current game state
     */
    public updateAnimation(): void {
        // Don't change animation if dead
        if (this.healthManager.isDead) return;

        // Don't change animation if attack is playing
        if (this.isPlayingAttackAnimation) return;

        if (this.state === 'GROUNDED_IDLE') {
            // On ground, no input - play idle animation based on facing direction
            if (this.facingDirection === -1) {
                this.playAnimation('idle_left');
            } else {
                this.playAnimation('idle');
            }
        } else if (this.state === 'AIRBORNE') {
            // In the air - check velocity direction and facing direction
            if (this.vy < 0) {
                // Going up - play rise animation based on facing direction
                if (this.facingDirection === -1) {
                    this.playAnimation('jump_rise_left');
                } else {
                    this.playAnimation('jump_rise');
                }
            } else {
                // Going down - play fall animation based on facing direction
                if (this.facingDirection === -1) {
                    this.playAnimation('jump_fall_left');
                } else {
                    this.playAnimation('jump_fall');
                }
            }
        } else if (this.state === 'GROUND_CHARGING') {
            // On ground, charging/compressing - hold land frame based on facing direction
            if (this.facingDirection === -1) {
                this.playAnimation('jump_land_left');
            } else {
                this.playAnimation('jump_land');
            }
        }
    }

    // ============================================================
    // Lane System Methods (三通道换道)
    // ============================================================

    /**
     * Set screen width and initialize lane position
     */
    public setScreenWidth(width: number): void {
        this.screenWidth = width;
        this.targetLaneX = this.getLaneCenterX(this.currentLane);
        this.x = this.targetLaneX;
    }

    /**
     * Get the center X coordinate for a given lane
     */
    public getLaneCenterX(lane: number): number {
        const laneWidth = this.screenWidth / GameConfig.lane.count;
        return (lane + 0.5) * laneWidth;
    }

    /**
     * Request a lane change. Returns true if successful.
     * @param direction -1 for left, 1 for right
     * @param onAttackHit Optional callback fired on attack hit frame
     */
    public requestLaneChange(direction: -1 | 1, onAttackHit?: (dir: -1 | 1, x: number, y: number) => void): boolean {
        // Block if not airborne
        if (this.state !== 'AIRBORNE') {
            return false;
        }

        // Block if locked (fast-fall active)
        if (this.laneSwitchLocked) {
            return false;
        }

        // Calculate new lane
        const newLane = this.currentLane + direction;

        // Boundary check
        if (newLane < 0 || newLane >= GameConfig.lane.count) {
            return false;
        }

        // Update lane and facing direction
        this.currentLane = newLane;
        this.targetLaneX = this.getLaneCenterX(newLane);
        this.facingDirection = direction;  // Update facing direction based on lane change

        // Play attack animation with hit callback
        this.playAttackAnimation(direction, onAttackHit);

        // Cancel any existing tween
        if (this.laneTween) {
            this.laneTween.stop();
        }

        // Create tween for smooth movement
        this.laneTween = this.scene.tweens.add({
            targets: this,
            x: this.targetLaneX,
            duration: GameConfig.lane.tweenDuration,
            ease: GameConfig.lane.tweenEase,
        });

        return true;
    }

    /**
     * Reset lane switch lock (called when entering AIRBORNE after bounce)
     */
    public resetLaneSwitchLock(): void {
        this.laneSwitchLocked = false;
    }

    /**
     * Lock lane switching (called when hold/fast-fall is activated)
     */
    public lockLaneSwitch(): void {
        this.laneSwitchLocked = true;
    }

    /**
     * Play attack animation on lane switch, trigger hit callback on mid-frame
     * @param direction -1 for left attack, 1 for right attack
     * @param onHit Callback fired on attack hit frame (frame 2)
     */
    public playAttackAnimation(direction: -1 | 1, onHit?: (dir: -1 | 1, x: number, y: number) => void): void {
        // Set flag to prevent normal animation updates
        this.isPlayingAttackAnimation = true;
        // 攻击开始即进入挥刀免疫窗口，确保先判击杀再判负面
        const nowMs = this.scene.time.now;
        this.addSwingGrace(250, nowMs);

        // Choose attack animation based on direction
        const attackAnim = direction === 1 ? 'attack_right' : 'attack_left';

        // Force play attack animation (bypass currentAnimation check)
        this.currentAnimation = '';
        this.graphics.play(attackAnim);

        // Trigger hit callback on frame 2 (the impact frame)
        let hitTriggered = false;
        const frameHandler = () => {
            const currentFrame = this.graphics.anims.currentFrame;
            if (currentFrame && currentFrame.index === 2 && !hitTriggered) {
                hitTriggered = true;
                if (onHit) {
                    onHit(direction, this.x, this.y);
                }
                // 命中瞬间再延长免疫，防止同帧接触判负面
                this.addSwingGrace(200, this.scene.time.now);
            }
        };
        this.graphics.on('animationupdate', frameHandler);

        // When attack animation completes, return to jump_rise frame 2
        this.graphics.once('animationcomplete', () => {
            this.isPlayingAttackAnimation = false;
            this.graphics.off('animationupdate', frameHandler);

            // Return to jump_rise frame 2 with correct facing direction
            if (this.facingDirection === -1) {
                this.graphics.setTexture('jump_left_2');
            } else {
                this.graphics.setTexture('jump_2');
            }
            this.currentAnimation = '';
        });
    }

    // ===== CHARGE EFFECT ANIMATION SYSTEM =====

    /**
     * Start the charge effect animation (called when landing)
     */
    public startChargeEffect(): void {
        this.chargeEffectState = 'charging';
        this.chargeEffectFrame = 1;
        this.chargeEffectTimer = 0;
        this.chargeEffectSprite.setTexture('chargeup_1');
        this.chargeEffectSprite.setDepth(this.graphics.depth - 1); // Keep behind player
        this.chargeEffectDisplayScale = 3;
        this.chargeEffectDisplayAlpha = 1;
        this.chargeEffectSprite.setVisible(true);
    }

    /**
     * Complete the charge effect (play remaining frames after release)
     */
    public completeChargeEffect(): void {
        if (this.chargeEffectState === 'charging' || this.chargeEffectState === 'holding') {
            this.chargeEffectState = 'releasing';
            this.chargeEffectTimer = 0;
            // Ensure release starts at frame 7+
            this.chargeEffectFrame = Math.max(this.RELEASE_START_FRAME, this.chargeEffectFrame);
            this.chargeEffectSprite.setTexture(`chargeup_${this.chargeEffectFrame}`);
        }
    }

    /**
     * Cancel the charge effect (hide immediately - for FAILED)
     */
    public cancelChargeEffect(): void {
        this.chargeEffectState = 'idle';
        this.chargeEffectSprite.setVisible(false);
    }

    /**
     * Update charge effect animation each frame
     */
    private updateChargeEffect(dt: number): void {
        // 如果不在地面蓄力且当前也不是释放动画，立即隐藏，防止空中误触显示
        if (this.state !== 'GROUND_CHARGING' && this.chargeEffectState !== 'releasing') {
            this.chargeEffectState = 'idle';
            this.chargeEffectSprite.setVisible(false);
            return;
        }

        // Anchor在脚底：跟随地面弯曲/压缩后的脚位置
        const surfaceY = this.getGroundY() + this.radius; // ground surface Y (center + radius)
        const chargeOffsetY = (GameConfig.chargeEffect as any)?.yOffset ?? 0;
        this.chargeEffectSprite.setPosition(this.graphics.x, surfaceY + chargeOffsetY);
        this.chargeEffectSprite.setDepth(this.graphics.depth - 1); // Stay behind player

        switch (this.chargeEffectState) {
            case 'idle':
                // Do nothing
                break;

            case 'charging':
            case 'holding': {
                // 火焰特效严格配合黄色区间和 Perfect 判定机制
                // 帧1-5：按 proximity 渐进（0%→90%）
                // 帧6：只在黄色区间（isInYellowZone）或满蓄（reachedPeak）时显示
                if (this.state !== 'GROUND_CHARGING') {
                    this.cancelChargeEffect();
                    break;
                }
                const pct = Phaser.Math.Clamp(this.chargeProximity ?? 0, 0, 1);
                
                // 帧1-5的阈值映射（0%→90% 对应帧1-5）
                const upThresholds = [0, 0.50, 0.65, 0.78, 0.88]; // frame 1..5
                const downBuffer = 0.03;
                
                let targetFrame = this.chargeEffectFrame || 1;
                
                // 帧6 严格配合黄色区间/满蓄（与角色闪黄同步）
                const inPerfectWindow = this.isInYellowZone || this.reachedPeak;
                
                if (inPerfectWindow) {
                    // 进入 Perfect 窗口 = 显示帧6
                    targetFrame = 6;
                } else {
                    // 未进入 Perfect 窗口：按 proximity 映射到帧1-5
                    for (let f = 1; f <= 5; f++) {
                        if (pct >= upThresholds[f - 1]) {
                            targetFrame = f;
                        }
                    }
                    // 降级滞回，避免抖动
                    const currIdx = Math.max(1, Math.min(this.chargeEffectFrame || 1, 5)) - 1;
                    if (pct < upThresholds[currIdx] - downBuffer && currIdx > 0) {
                        for (let f = 5; f >= 1; f--) {
                            if (pct >= upThresholds[f - 1] - downBuffer) {
                                targetFrame = f;
                                break;
                            }
                        }
                    }
                }
                
                if (targetFrame !== this.chargeEffectFrame) {
                    this.chargeEffectFrame = targetFrame;
                    this.chargeEffectSprite.setTexture(`chargeup_${this.chargeEffectFrame}`);
                }

                // Scale/alpha 平滑插值
                const baseScale = 3;
                const grow = 1 + 0.28 * pct * pct;
                let targetScale = baseScale * grow;
                
                // Perfect 窗口内加脉冲效果（与角色闪黄同步）
                if (inPerfectWindow) {
                    const pulse = 1 + 0.08 * Math.sin(this.scene.time.now * 0.025);
                    targetScale *= pulse;
                }
                const targetAlpha = 0.55 + 0.45 * pct;

                // Lerp 让动画更顺滑
                this.chargeEffectDisplayScale = Phaser.Math.Linear(this.chargeEffectDisplayScale, targetScale, 0.35);
                this.chargeEffectDisplayAlpha = Phaser.Math.Linear(this.chargeEffectDisplayAlpha, targetAlpha, 0.35);
                this.chargeEffectSprite.setScale(this.chargeEffectDisplayScale);
                this.chargeEffectSprite.setAlpha(this.chargeEffectDisplayAlpha);
                
                // Lock into holding when满蓄
                if (this.reachedPeak) {
                    this.chargeEffectState = 'holding';
                }
                break;
            }

            case 'releasing':
                // Play frames 7-11 on release
                this.chargeEffectTimer += dt;
                if (this.chargeEffectTimer >= this.RELEASE_FRAME_DURATION) {
                    this.chargeEffectTimer = 0;
                    if (this.chargeEffectFrame < this.RELEASE_END_FRAME) {
                        this.chargeEffectFrame++;
                        this.chargeEffectSprite.setTexture(`chargeup_${this.chargeEffectFrame}`);
                    } else {
                        // Animation complete
                        this.chargeEffectState = 'idle';
                        this.chargeEffectSprite.setVisible(false);
                    }
                }
                break;
        }
    }

    /**
     * 空中撞怪的DEBUFF入口
     * A01: 中毒I (+duration秒, tick 1hp/s, 上限5s)
     * A02: 中毒II (+duration秒, tick 2hp/s, 上限5s)
     *      - 普通碰撞: 1秒
     *      - 追踪撞击: 2秒
     * CloudA: 上升速度减缓（一次性压缩当前上升速度）
     * 
     * @param monsterType 怪物类型
     * @param duration 中毒持续时间（秒），默认1秒
     */
    public applyDebuffFromMonster(monsterType: MonsterType, duration: number = 1): void {
        // 如果刚击杀过怪物窗口内，直接忽略debuff（砍到必然接触）
        const nowMs = this.scene.time.now;
        if (this.hasRecentHitWindow(nowMs)) return;

        switch (monsterType) {
            case 'A01':
                this.poison1Duration = Math.min(5, this.poison1Duration + duration);
                break;
            case 'A02':
                this.poison2Duration = Math.min(5, this.poison2Duration + duration);
                console.log(`[Slime] 中毒II +${duration}秒, 总计${this.poison2Duration.toFixed(1)}秒`);
                break;
            case 'CloudA': {
                // 改为“沿当前运动方向减速”，不再模拟按下SPACE
                // 统一对当前速度做阻尼，避免从上方撞到时反而加速
                const damp = 0.6; // 保留40%速度
                this.vy *= damp;
                this.slowImpulseTimer = 0.4; // 短提示
                break;
            }
            default:
                break;
        }
    }

    /**
     * 每帧驱动DEBUFF（伤害tick / 计时衰减）
     */
    private updateDebuffs(dt: number): void {
        // 提前终止：无毒无减速
        if (this.poison1Duration <= 0 && this.poison2Duration <= 0 && this.slowImpulseTimer <= 0) return;

        // 计时衰减
        if (this.poison1Duration > 0) this.poison1Duration = Math.max(0, this.poison1Duration - dt);
        if (this.poison2Duration > 0) this.poison2Duration = Math.max(0, this.poison2Duration - dt);
        if (this.slowImpulseTimer > 0) this.slowImpulseTimer = Math.max(0, this.slowImpulseTimer - dt);

        // 中毒伤害tick：每秒一次
        const hasPoison = (this.poison1Duration > 0) || (this.poison2Duration > 0);
        if (!hasPoison) {
            this.poisonTickTimer = 0;
            return;
        }

        this.poisonTickTimer += dt;
        while (this.poisonTickTimer >= 1.0) {
            this.poisonTickTimer -= 1.0;
            const dmg = (this.poison1Duration > 0 ? 1 : 0) + (this.poison2Duration > 0 ? 2 : 0);
            if (dmg > 0 && this.healthManager && !(this.healthManager as any).isInfiniteHealth) {
                this.healthManager.takeDamage(dmg);
            }
        }

        // 懒清理 recentKilledIds：超过1秒的直接清掉，避免集合无限增长
        if (this.recentKilledIds.size > 0 && this.recentHitTimestamp > 0) {
            const nowEstimate = this.scene.time.now;
            if (nowEstimate - this.recentHitTimestamp > 1000) {
                this.recentKilledIds.clear();
            }
        }
    }

    // 攻击击杀后给予短暂无敌，避免同帧撞怪触发debuff
    public addDebuffGrace(durationMs: number, nowMs: number): void {
        this.debuffGraceUntil = Math.max(this.debuffGraceUntil, nowMs + durationMs);
    }

    public hasDebuffGrace(nowMs: number): boolean {
        return nowMs <= this.debuffGraceUntil;
    }

    // 砍中怪物后给予短暂无负面（砍到必定接触）
    public addRecentHitGrace(durationMs: number, nowMs: number): void {
        this.recentHitGraceUntil = Math.max(this.recentHitGraceUntil, nowMs + durationMs);
        this.recentHitTimestamp = nowMs;
    }

    public hasRecentHitGrace(nowMs: number): boolean {
        return nowMs <= this.recentHitGraceUntil;
    }

    public addSwingGrace(durationMs: number, nowMs: number): void {
        this.swingGraceUntil = Math.max(this.swingGraceUntil, nowMs + durationMs);
    }

    public hasSwingGrace(nowMs: number): boolean {
        return nowMs <= this.swingGraceUntil;
    }

    public addRecentKill(monsterId: number, nowMs: number): void {
        this.recentKilledIds.add(monsterId);
        this.recentHitTimestamp = nowMs;
        // 记录一个适度的时间窗口后清理（懒清理即可）
    }

    public hasRecentHitWindow(nowMs: number, windowMs: number = 250): boolean {
        return (nowMs - this.recentHitTimestamp) <= windowMs;
    }

    public clearOldKills(nowMs: number): void {
        if (this.recentKilledIds.size === 0) return;
        if (nowMs - this.recentHitTimestamp > 1000) {
            this.recentKilledIds.clear();
        }
    }
}

