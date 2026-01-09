import Phaser from 'phaser';
import { GameConfig } from '../config';
import { IdleState } from './slime/IdleState';
import { AirborneState } from './slime/AirborneState';
import { ChargingState } from './slime/ChargingState';
import type { ISlimeState } from './slime/ISlimeState';
import { SlimeHealthManager } from './SlimeHealthManager';

export type SlimeState = 'GROUNDED_IDLE' | 'AIRBORNE' | 'GROUND_CHARGING';

import Ground from './Ground';

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

    // Animation state tracking
    private currentAnimation: string = '';

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

        // Hard clamp: never allow embedding when not airborne
        // This failsafe ensures player center never goes below ground level
        if (this.state !== 'AIRBORNE') {
            const gy = this.getGroundY();
            if (this.y > gy) this.y = gy;
        }

        // ===== UPDATE TEXT POSITIONS TO FOLLOW SLIME =====
        // Combo text below slime (if visible)
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

        // ===== YELLOW SPARK PARTICLES FOR PERFECT TIMING =====
        // Update particle emitter position to follow slime
        this.sparkEmitter.setPosition(this.x, this.y);

        // Emit sparks when in yellow zone (perfect timing window)
        if (this.isInYellowZone && this.state === 'GROUND_CHARGING') {
            if (!this.sparkEmitter.emitting) {
                this.sparkEmitter.start();
            }
        } else {
            if (this.sparkEmitter.emitting) {
                this.sparkEmitter.stop();
            }
        }

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
            this.feedbackText.setColor('#00ff00');
        } else if (rating === 'NORMAL') {
            this.feedbackText.setText('Normal');
            this.feedbackText.setColor('#ffff00');
        } else {
            this.feedbackText.setText('FAILED');
            this.feedbackText.setColor('#ff0000');
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

        if (this.state === 'GROUNDED_IDLE') {
            // On ground, no input - play idle animation
            this.playAnimation('idle');
        } else if (this.state === 'AIRBORNE') {
            // In the air - check velocity direction
            if (this.vy < 0) {
                // Going up - play rise animation
                this.playAnimation('jump_rise');
            } else {
                // Going down - play fall animation
                this.playAnimation('jump_fall');
            }
        } else if (this.state === 'GROUND_CHARGING') {
            // On ground, charging/compressing - hold land frame
            this.playAnimation('jump_land');
        }
    }
}
