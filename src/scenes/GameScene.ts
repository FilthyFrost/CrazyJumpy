import Phaser from 'phaser';
import Slime from '../objects/Slime';
import Ground from '../objects/Ground';
import { GameConfig } from '../config';
import { CameraShakeRig } from './CameraShakeRig';
import SkyGradientLUT from '../objects/SkyGradientLUT';

export default class GameScene extends Phaser.Scene {
    private slime!: Slime;
    private ground!: Ground;
    private isSpaceDown: boolean = false;
    private pointerDownCount: number = 0;  // Track multi-touch for mobile
    private gameStarted: boolean = false;

    // Camera Shake
    private shakeRig!: CameraShakeRig;

    // Camera transition state
    private isCameraTransitioning: boolean = false;
    private cameraTransitionStartTime: number = 0;

    // Fixed timestep physics
    private accumulator: number = 0;
    private readonly FIXED_DT = 1 / 120;  // 120 Hz physics
    private readonly MAX_FRAME_DT = 0.25;  // Prevent explosion on tab switch
    private readonly MAX_STEPS_PER_FRAME = 8;  // Prevent spiral of death


    private heightText!: Phaser.GameObjects.Text;

    // Start screen elements
    private startOverlay!: Phaser.GameObjects.Container;
    private startButton!: Phaser.GameObjects.Text;

    // Milestone tracking
    private recordHeight: number = 0;  // All-time record in pixels
    private milestoneGraphics!: Phaser.GameObjects.Graphics;
    private milestoneText!: Phaser.GameObjects.Text;
    private pixelsPerMeter: number = 50;

    // Height-driven gradient background system
    private skyGradient!: SkyGradientLUT;

    // 9:16 Safe Frame
    private safeFrame!: { x: number, y: number, width: number, height: number };

    // Game over screen
    private gameOverOverlay?: Phaser.GameObjects.Container;
    private isGameOver: boolean = false;
    private isPlayingDeathAnimation: boolean = false;

    constructor() {
        super('GameScene');
    }

    preload() {
        // Load all game assets
        // Load spritesheet for player - 6 columns x 4 rows, 32x32 each
        this.load.spritesheet('cyclop', 'assets/sprites/CyclopJump.png', {
            frameWidth: 32,
            frameHeight: 32
        });
        this.load.image('ground_block', 'assets/tiles/ground_block.png');

        // Load gradient LUT for height-driven background
        this.load.image('渐变色调图', 'assets/lut/渐变色调图.png');

        // Load death animation frames (12 frames)
        for (let i = 1; i <= 12; i++) {
            const frameNum = String(i).padStart(4, '0');
            this.load.image(`die_${i}`, `assets/DIE STATE/HumanSoulDie_${frameNum}.png`);
        }

        // Load idle animation frames (8 frames)
        for (let i = 1; i <= 8; i++) {
            const frameNum = String(i).padStart(4, '0');
            this.load.image(`idle_${i}`, `assets/HumanIdle State/HumanIdle_${frameNum}.png`);
        }

        // Load jump animation frames (4 frames)
        for (let i = 1; i <= 4; i++) {
            const frameNum = String(i).padStart(4, '0');
            this.load.image(`jump_${i}`, `assets/Jump State/Jump_${frameNum}.png`);
        }

        // Create spark texture dynamically
        const sparkGraphics = this.make.graphics({ x: 0, y: 0 });
        sparkGraphics.fillStyle(0xffff00, 1);
        sparkGraphics.fillCircle(8, 8, 8);
        sparkGraphics.generateTexture('spark', 16, 16);
        sparkGraphics.destroy();
    }

    create() {
        const { width, height } = this.scale;
        const groundY = height * 0.8;

        // ===== RESET STATE ON SCENE RESTART =====
        this.isGameOver = false;
        this.isPlayingDeathAnimation = false;
        this.gameStarted = false;
        this.isSpaceDown = false;
        this.pointerDownCount = 0;
        this.recordHeight = 0;
        this.accumulator = 0;
        this.isCameraTransitioning = false;

        // Crisp rendering
        this.cameras.main.roundPixels = true;

        // ===== HEIGHT-DRIVEN GRADIENT BACKGROUND =====
        // Initialize gradient LUT system (replaces static background images)
        this.skyGradient = new SkyGradientLUT(
            this,
            '渐变色调图',
            groundY
        );

        // ===== CHARACTER ANIMATION STATE MACHINE =====

        // Idle animation (on ground, no input) - 8 frames, looping
        this.anims.create({
            key: 'idle',
            frames: [
                { key: 'idle_1' }, { key: 'idle_2' }, { key: 'idle_3' }, { key: 'idle_4' },
                { key: 'idle_5' }, { key: 'idle_6' }, { key: 'idle_7' }, { key: 'idle_8' }
            ],
            frameRate: 8,
            repeat: -1  // Loop forever
        });

        // Jump Rise animation (going up, vy < 0) - first 2 frames, play once and hold on frame 2
        this.anims.create({
            key: 'jump_rise',
            frames: [
                { key: 'jump_1' }, { key: 'jump_2' }
            ],
            frameRate: 12,
            repeat: 0  // Play once and stop at last frame
        });

        // Jump Fall animation (going down, vy > 0) - last 2 frames, play once and hold on frame 4
        this.anims.create({
            key: 'jump_fall',
            frames: [
                { key: 'jump_3' }, { key: 'jump_4' }
            ],
            frameRate: 12,
            repeat: 0  // Play once and stop at last frame
        });

        // Jump Land animation (on ground, charging) - hold last frame
        this.anims.create({
            key: 'jump_land',
            frames: [
                { key: 'jump_4' }
            ],
            frameRate: 1,
            repeat: 0
        });

        // Full jump animation (all 4 frames, for compatibility)
        this.anims.create({
            key: 'jump',
            frames: [
                { key: 'jump_1' }, { key: 'jump_2' }, { key: 'jump_3' }, { key: 'jump_4' }
            ],
            frameRate: 10,
            repeat: -1
        });

        // Create death animation from individual frames
        this.anims.create({
            key: 'die',
            frames: [
                { key: 'die_1' }, { key: 'die_2' }, { key: 'die_3' }, { key: 'die_4' },
                { key: 'die_5' }, { key: 'die_6' }, { key: 'die_7' }, { key: 'die_8' },
                { key: 'die_9' }, { key: 'die_10' }, { key: 'die_11' }, { key: 'die_12' }
            ],
            frameRate: 12,
            repeat: 0  // Play once only
        });

        // 1. Create Ground
        this.ground = new Ground(this, groundY);

        // 2. Create Slime - start at ground level
        // Player should sit ON the ground, so Y = ground.y - playerCollisionRadius
        const playerRadius = GameConfig.display.playerCollisionRadius;
        this.slime = new Slime(this, width / 2, this.ground.y - playerRadius, this.ground);

        // 3. Input - Keyboard
        this.input.keyboard?.on('keydown-SPACE', () => { this.isSpaceDown = true; });
        this.input.keyboard?.on('keyup-SPACE', () => { this.isSpaceDown = false; });

        // 4. Input - Touch (for mobile: touch = space)
        // Use pointer counter to properly handle multi-touch
        this.input.on('pointerdown', () => {
            this.pointerDownCount++;
            this.isSpaceDown = true;
        });
        this.input.on('pointerup', () => {
            this.pointerDownCount--;
            if (this.pointerDownCount <= 0) {
                this.pointerDownCount = 0;
                this.isSpaceDown = false;
            }
        });

        // 5. Input Safety - Prevent stuck input on mobile/browser edge cases
        this.input.on('pointerupoutside', () => {
            this.pointerDownCount--;
            if (this.pointerDownCount <= 0) {
                this.pointerDownCount = 0;
                this.isSpaceDown = false;
            }
        });
        this.input.on('pointercancel', () => {
            this.pointerDownCount = 0;
            this.isSpaceDown = false;
        });
        this.game.events.on('blur', () => {
            this.pointerDownCount = 0;
            this.isSpaceDown = false;
        });
        this.game.events.on('hidden', () => {
            this.pointerDownCount = 0;
            this.isSpaceDown = false;
        });

        // Meter HUD - adjusted position for mobile
        // Dynamic font size: 10% of screen width, max 64px
        const heightFontSize = Math.min(64, Math.floor(width * 0.1));
        this.heightText = this.add.text(width / 2, height * 0.9, '0.0m', {
            fontSize: `${heightFontSize}px`,
            color: '#ffffff',
            align: 'center',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: Math.max(4, heightFontSize * 0.1)
        }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(200);

        // Milestone Graphics (draws in world space)
        this.milestoneGraphics = this.add.graphics();
        // Dynamic milestone font: 5% of width
        const msFontSize = Math.min(32, Math.floor(width * 0.05));
        this.milestoneText = this.add.text(0, 0, '', {
            fontSize: `${msFontSize}px`,
            color: '#ffff00',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 4
        }).setDepth(50);

        // ===== START SCREEN OVERLAY =====
        this.createStartScreen(width, height);

        // Initialize Camera Shake Rig
        this.shakeRig = new CameraShakeRig();

        // Apply Zoom
        const zoom = GameConfig.display.zoom ?? 1.0;
        this.cameras.main.setZoom(zoom);

        // ===== 9:16 SAFE FRAME LAYOUT =====
        this.scale.on('resize', this.applyResponsiveLayout, this);
        this.applyResponsiveLayout();
    }

    private computeSafeFrame() {
        const width = this.scale.width;
        const height = this.scale.height;

        // Target Aspect Ratio: 9:16 (0.5625)
        const targetAspect = 9 / 16;
        const currentAspect = width / height;

        let safeW, safeH, safeX, safeY;

        if (currentAspect > targetAspect) {
            // Screen is wider than 9:16 (e.g. iPad, Desktop)
            // Constrain width by height
            safeH = height;
            safeW = height * targetAspect;
            safeX = (width - safeW) / 2;
            safeY = 0;
        } else {
            // Screen is taller/narrower than 9:16 (e.g. Modern Phones)
            safeW = width;
            safeH = width / targetAspect;
            safeX = 0;
            // Center vertically if screen is excessively tall
            safeY = (height - safeH) / 2;
        }

        this.safeFrame = { x: safeX, y: safeY, width: safeW, height: safeH };
    }

    private applyResponsiveLayout() {
        this.computeSafeFrame();
        const sf = this.safeFrame;
        const width = this.scale.width; // Screen width (for background)
        const height = this.scale.height;

        // 2. HUD: Bottom of Safe Frame
        if (this.heightText) {
            // Font size relative to SAFE width
            const fs = Math.min(64, Math.floor(sf.width * 0.1));
            this.heightText.setFontSize(fs);
            this.heightText.setStroke('#000000', Math.max(4, fs * 0.1));

            // Position: Bottom of Safe Frame (minus padding)
            this.heightText.setPosition(width / 2, sf.y + sf.height * 0.9);
        }

        // 3. Start Screen: Relative to Safe Frame
        if (this.startOverlay && this.startOverlay.active) {
            // Resize overlay background to full screen
            const bg = this.startOverlay.getAt(0) as Phaser.GameObjects.Rectangle;
            if (bg) {
                bg.setPosition(width / 2, height / 2);
                bg.setSize(width, height);
            }

            // Title (25% from top of safe frame)
            const title = this.startOverlay.getAt(1) as Phaser.GameObjects.Text;
            if (title) {
                const tSize = Math.floor(sf.width * 0.15);
                title.setFontSize(tSize);
                title.setStroke('#000000', Math.max(4, tSize * 0.1));
                title.setPosition(width / 2, sf.y + sf.height * 0.25);
            }

            // Instructions (45% from top)
            const instr = this.startOverlay.getAt(2) as Phaser.GameObjects.Text;
            if (instr) {
                const iSize = Math.max(16, Math.floor(sf.width * 0.045));
                instr.setFontSize(iSize);
                instr.setWordWrapWidth(sf.width * 0.9);
                instr.setPosition(width / 2, sf.y + sf.height * 0.45);
            }

            // Button (75% from top)
            if (this.startButton) {
                const bSize = Math.floor(sf.width * 0.1);
                this.startButton.setFontSize(bSize);
                this.startButton.setPosition(width / 2, sf.y + sf.height * 0.75);
            }
        }

        // 4. Milestone: Safe width scaling
        if (this.milestoneText) {
            const mSize = Math.min(32, Math.floor(sf.width * 0.05));
            this.milestoneText.setFontSize(mSize);
        }

        // 5. Slime UI (Feedback & Combo)
        if (this.slime) {
            this.slime.applyUIScale(sf.width);
        }
    }

    private createStartScreen(width: number, height: number) {
        // Dark overlay
        const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.7)
            .setScrollFactor(0);

        // Title - Initial placeholders (will be resized by applyResponsiveLayout)
        const title = this.add.text(width / 2, height * 0.3, '🟢 Slime Jump 🟢', {
            fontSize: '64px',
            fontFamily: 'Arial',
            fontStyle: 'bold',
            color: '#00ff00',
            stroke: '#000000',
            strokeThickness: 8
        }).setOrigin(0.5).setScrollFactor(0);

        // Instructions
        const instructions = this.add.text(width / 2, height * 0.5,
            '按住屏幕 或 SPACE 快速下落\n在黄色状态松开 = PERFECT\n连续 3 次 PERFECT = 2x 力量!', {
            fontSize: '32px',
            fontFamily: 'Arial',
            color: '#ffffff',
            align: 'center',
            lineSpacing: 10
        }).setOrigin(0.5).setScrollFactor(0);

        // Start Button
        this.startButton = this.add.text(width / 2, height * 0.75, '[ 点击开始 ]', {
            fontSize: '48px',
            fontFamily: 'Arial',
            fontStyle: 'bold',
            color: '#ffff00',
            stroke: '#000000',
            strokeThickness: 6
        }).setOrigin(0.5).setScrollFactor(0).setInteractive({ useHandCursor: true });

        // Hover effect
        this.startButton.on('pointerover', () => {
            this.startButton.setScale(1.1);
            this.startButton.setColor('#ffffff');
        });
        this.startButton.on('pointerout', () => {
            this.startButton.setScale(1.0);
            this.startButton.setColor('#ffff00');
        });

        // Click to start
        this.startButton.on('pointerdown', () => {
            this.startGame();
        });

        // Also allow space to start
        this.input.keyboard?.once('keydown-SPACE', () => {
            if (!this.gameStarted) {
                this.startGame();
            }
        });

        // Store in container
        this.startOverlay = this.add.container(0, 0, [overlay, title, instructions, this.startButton]);
        this.startOverlay.setDepth(1000);
    }

    private startGame() {
        this.gameStarted = true;
        this.startOverlay.destroy();

        // Reset input state to prevent start button click from causing immediate jump
        this.isSpaceDown = false;
        this.pointerDownCount = 0;

        // Start camera transition
        this.isCameraTransitioning = true;
        this.cameraTransitionStartTime = this.time.now;
    }

    update(_time: number, delta: number) {
        // Don't update game if not started
        if (!this.gameStarted) {
            return;
        }

        // Don't update if game is over
        if (this.isGameOver) {
            return;
        }

        // During death animation: skip physics but keep camera/visuals running
        if (this.isPlayingDeathAnimation) {
            const dt = delta / 1000;
            // Update ground with 0 compression so deformation recovers to normal
            this.ground.render(dt, 0, this.slime.x);

            // Move slime sprite to follow ground surface as it recovers
            // But clamp to never go above normal ground level
            const surfaceOffset = this.ground.getSurfaceOffsetAt(this.slime.x);
            const corpseYOffset = GameConfig.display.corpseYOffset ?? 80;

            // Normal ground position (feet at ground level, no deformation) + corpse offset
            const normalGroundY = this.ground.y - this.slime.radius + corpseYOffset;

            // Current deformed ground position + corpse offset
            const deformedGroundY = this.ground.y + surfaceOffset - this.slime.radius + corpseYOffset;

            // Use the lower position (higher Y value in Phaser = lower on screen)
            // This ensures corpse follows ground up but never goes above normal level
            const clampedY = Math.max(normalGroundY, deformedGroundY);

            this.slime.y = clampedY;
            this.slime.graphics.setPosition(this.slime.x, clampedY);

            // Update gradient background
            this.skyGradient.update(this.slime.y);
            return;
        }

        // ===== FIXED TIMESTEP PHYSICS =====
        // Prevents low-FPS "slow motion" exploit where players get longer reaction windows
        // Physics always runs at FIXED_DT regardless of actual framerate

        const deltaSeconds = delta / 1000;
        const clampedDelta = Math.min(deltaSeconds, this.MAX_FRAME_DT);

        this.accumulator += clampedDelta;

        let steps = 0;
        while (this.accumulator >= this.FIXED_DT && steps < this.MAX_STEPS_PER_FRAME) {
            // Run physics at fixed timestep
            this.slime.update(this.FIXED_DT * 1000, this.isSpaceDown);  // Slime expects ms
            this.ground.render(this.FIXED_DT, this.slime.getCompression(), this.slime.x);

            this.accumulator -= this.FIXED_DT;
            steps++;
        }

        // If we hit max steps, drain accumulator to prevent spiral of death
        if (steps >= this.MAX_STEPS_PER_FRAME) {
            this.accumulator = 0;
        }

        // ===== PROFESSIONAL FOLLOW CAMERA =====
        // 1. Constant Framing: Player always stays at fixed relative screen height (75%)
        //    This prevents the "reset" feeling where the camera shifts relative to the player.
        // 2. Unclamped Tracking: Camera follows player even when pushing into ground (Tension)

        const H = this.scale.height;
        const dt = delta / 1000;

        // Target: Keep player at 75% of screen height (Good balance of sky/ground)
        const targetScreenY = H * 0.75;

        // Desired Scroll = WorldY - ScreenY
        const desired = this.slime.y - targetScreenY;

        const current = this.cameras.main.scrollY;
        let next = current;

        // --- Camera Logic Selection ---
        if (this.isCameraTransitioning) {
            // SMOOTH START TRANSITION (2 seconds duration)
            const duration = 2000;
            const progress = (this.time.now - this.cameraTransitionStartTime) / duration;

            if (progress >= 1.0) {
                this.isCameraTransitioning = false; // Transition complete
                next = desired;
            } else {
                // Ease out cubic for smooth arrival
                const t = 1 - Math.pow(1 - progress, 3);
                const startScroll = 0; // Assuming menu starts at 0
                next = startScroll + (desired - startScroll) * t;
            }
        } else {
            // NORMAL GAMEPLAY TRACKING
            // Note: WE DO NOT CLAMP desired to 0 here. 
            // Allowing positive scrollY means we can track the player *into* the ground deformation,
            // which creates the "impact tension" the user wants.

            // Dynamic Catch-up Speed
            // Base speed needs to be fast enough to feel "attached" but smooth enough to absorb jitter
            const maxSpeed = Math.max(3000, Math.abs(this.slime.vy) + 1500);
            const maxStep = maxSpeed * dt;

            // Robust Move-Towards
            next = current + Phaser.Math.Clamp(desired - current, -maxStep, maxStep);
        }

        // Pixel Snapping
        next = Math.round(next);

        // Update Shake Rig
        this.shakeRig.update(dt, this.slime.chargeShake01, this.slime.airShake01);

        // Apply Final Camera Position (Base + Shake)
        this.cameras.main.scrollY = next + this.shakeRig.shakeY;
        this.cameras.main.scrollX = this.shakeRig.shakeX;



        // HUD Update
        // Height = Distance from ground to player's FEET (0m when standing)
        const groundLevel = this.ground.y;
        const currentFeet = this.slime.y + this.slime.radius;
        const heightPixels = Math.max(0, groundLevel - currentFeet);
        const heightMeters = heightPixels / this.pixelsPerMeter;

        this.heightText.setText(`${heightMeters.toFixed(1)}m`);

        // ===== UPDATE GRADIENT BACKGROUND =====
        // Update background color based on player height
        this.skyGradient.update(this.slime.y);

        // ===== MILESTONE TRACKING (tracks HEAD height) =====
        const currentHead = this.slime.y - this.slime.radius;
        const headHeightPixels = Math.max(0, groundLevel - currentHead);
        this.updateMilestone(groundLevel, headHeightPixels);

        // ===== DEATH DETECTION =====
        if (this.slime.healthManager.isDead && !this.isGameOver && !this.isPlayingDeathAnimation) {
            // Block all input immediately
            this.isPlayingDeathAnimation = true;

            // Play death animation, then show game over
            this.slime.playDeathAnimation(() => {
                this.showGameOver();
            });
        }
    }

    private updateMilestone(groundLevel: number, currentHeadHeightPixels: number) {
        const cam = this.cameras.main;
        const visibleLeft = cam.scrollX;

        // Check for new record
        if (currentHeadHeightPixels > this.recordHeight) {
            this.recordHeight = currentHeadHeightPixels;
        }

        // Always redraw to keep text at screen edge
        this.milestoneGraphics.clear();

        // Apply configurable offset for manual fine-tuning
        const milestoneOffset = GameConfig.milestone?.yOffset ?? 0;

        // Line Y: where the HEAD was at record height
        const lineY = groundLevel - this.recordHeight + milestoneOffset;

        // Draw horizontal line (very wide to cover zoom)
        this.milestoneGraphics.lineStyle(2, 0xffff00, 0.8);
        this.milestoneGraphics.beginPath();
        this.milestoneGraphics.moveTo(visibleLeft - 5000, lineY);
        this.milestoneGraphics.lineTo(visibleLeft + 15000, lineY);
        this.milestoneGraphics.strokePath();

        // Milestone text at left edge of screen
        const textX = visibleLeft + 10;
        const meters = this.recordHeight / this.pixelsPerMeter;

        this.milestoneText.setText(`🏆 ${meters.toFixed(1)}m`);
        this.milestoneText.setPosition(textX, lineY - 25);
    }

    private showGameOver() {
        this.isGameOver = true;

        const width = this.scale.width;
        const height = this.scale.height;

        // Dark overlay
        const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.8)
            .setScrollFactor(0)
            .setDepth(2000);

        // Game Over title
        const gameOverText = this.add.text(width / 2, height * 0.3, '💀 游戏结束 💀', {
            fontSize: '72px',
            fontFamily: 'Arial',
            fontStyle: 'bold',
            color: '#ff0000',
            stroke: '#000000',
            strokeThickness: 8
        }).setOrigin(0.5).setScrollFactor(0).setDepth(2001);

        // Stats
        const finalHeight = this.recordHeight / this.pixelsPerMeter;
        const statsText = this.add.text(width / 2, height * 0.5,
            `最高记录: ${finalHeight.toFixed(1)}m\n生命值: 0`, {
            fontSize: '32px',
            fontFamily: 'Arial',
            color: '#ffffff',
            align: 'center',
            lineSpacing: 10
        }).setOrigin(0.5).setScrollFactor(0).setDepth(2001);

        // Restart button
        const restartButton = this.add.text(width / 2, height * 0.7, '[ 重新开始 ]', {
            fontSize: '48px',
            fontFamily: 'Arial',
            fontStyle: 'bold',
            color: '#00ff00',
            stroke: '#000000',
            strokeThickness: 6
        }).setOrigin(0.5).setScrollFactor(0).setDepth(2001).setInteractive({ useHandCursor: true });

        // Hover effect
        restartButton.on('pointerover', () => {
            restartButton.setScale(1.1);
            restartButton.setColor('#ffffff');
        });
        restartButton.on('pointerout', () => {
            restartButton.setScale(1.0);
            restartButton.setColor('#00ff00');
        });

        // Click to restart
        restartButton.on('pointerdown', () => {
            this.scene.restart();
        });

        // Also allow space to restart
        this.input.keyboard?.once('keydown-SPACE', () => {
            this.scene.restart();
        });

        // Store in container
        this.gameOverOverlay = this.add.container(0, 0, [overlay, gameOverText, statsText, restartButton]);
        this.gameOverOverlay.setDepth(2000);
    }
}
