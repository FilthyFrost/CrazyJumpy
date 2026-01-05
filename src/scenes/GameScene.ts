import Phaser from 'phaser';
import Slime from '../objects/Slime';
import Ground from '../objects/Ground';
import { GameConfig } from '../config';

export default class GameScene extends Phaser.Scene {
    private slime!: Slime;
    private ground!: Ground;
    private isSpaceDown: boolean = false;
    private pointerDownCount: number = 0;  // Track multi-touch for mobile
    private gameStarted: boolean = false;

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

    // Sky background for seamless scrolling
    private skyBg!: Phaser.GameObjects.TileSprite;

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
        this.load.image('sky', 'assets/backgrounds/sky.png');
        this.load.image('forest', 'assets/backgrounds/forest.png');

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

        // Crisp rendering
        this.cameras.main.roundPixels = true;

        // ===== BACKGROUND LAYERS =====
        // Sky background - seamless vertical scrolling (infinite loop)
        // Store reference for manual tilePosition update
        this.skyBg = this.add.tileSprite(width / 2, height / 2, width, height, 'sky')
            .setOrigin(0.5, 0.5)
            .setScrollFactor(0)  // Fixed to camera, we scroll internally
            .setDepth(-100);

        // Forest layer removed - was causing blue stripe issue

        // Create jump animation from row 3 (frames 12-17, 0-indexed)
        this.anims.create({
            key: 'jump',
            frames: this.anims.generateFrameNumbers('cyclop', { start: 12, end: 17 }),
            frameRate: 10,
            repeat: -1  // Loop the animation
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
        this.heightText = this.add.text(width / 2, height - 30, '0.0m', {
            fontSize: '48px',  // Increased from 28px for mobile visibility
            color: '#ffffff',
            align: 'center',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 6  // Increased stroke for better contrast
        }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(200);

        // Milestone Graphics (draws in world space)
        this.milestoneGraphics = this.add.graphics();
        this.milestoneText = this.add.text(0, 0, '', {
            fontSize: '32px',  // Increased from 18px for mobile visibility
            color: '#ffff00',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 5  // Increased stroke
        }).setDepth(50);

        // ===== START SCREEN OVERLAY =====
        this.createStartScreen(width, height);
    }

    private createStartScreen(width: number, height: number) {
        // Dark overlay
        const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.7)
            .setScrollFactor(0);

        // Title
        const title = this.add.text(width / 2, height * 0.3, '🟢 Slime Jump 🟢', {
            fontSize: '96px',  // Increased from 64px for mobile visibility
            fontFamily: 'Arial',
            fontStyle: 'bold',
            color: '#00ff00',
            stroke: '#000000',
            strokeThickness: 8  // Increased stroke
        }).setOrigin(0.5).setScrollFactor(0);

        // Instructions (for both desktop and mobile)
        const instructions = this.add.text(width / 2, height * 0.5,
            '按住屏幕 或 SPACE 快速下落\n在黄色状态松开 = PERFECT\n连续 3 次 PERFECT = 2x 力量!', {
            fontSize: '32px',  // Increased from 20px for mobile visibility
            fontFamily: 'Arial',
            color: '#ffffff',
            align: 'center',
            lineSpacing: 10
        }).setOrigin(0.5).setScrollFactor(0);

        // Start Button
        this.startButton = this.add.text(width / 2, height * 0.75, '[ 点击开始 ]', {
            fontSize: '72px',  // Increased from 48px for mobile visibility
            fontFamily: 'Arial',
            fontStyle: 'bold',
            color: '#ffff00',
            stroke: '#000000',
            strokeThickness: 6  // Increased stroke
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
        this.cameras.main.scrollY = next;



        // HUD Update
        // Height should be measured from player's TOP (head) to ground surface
        const groundSurface = this.ground.y;  // Actual ground surface position
        const playerTop = this.slime.y - this.slime.radius;  // Top of player's head
        const heightPixels = Math.max(0, groundSurface - playerTop);
        const heightMeters = heightPixels / this.pixelsPerMeter;

        this.heightText.setText(`${heightMeters.toFixed(1)}m`);

        // ===== SKY SEAMLESS SCROLLING =====
        // Move sky tilePosition based on camera scroll (creates infinite loop effect)
        this.skyBg.tilePositionY = Math.round(this.cameras.main.scrollY * 0.1);

        // ===== MILESTONE TRACKING =====
        // Milestone line marks the highest point the player's HEAD has reached
        this.updateMilestone(groundSurface, heightPixels);
    }

    private updateMilestone(groundSurface: number, currentHeightPixels: number) {
        // Check for new record
        if (currentHeightPixels > this.recordHeight) {
            this.recordHeight = currentHeightPixels;

            // Clear and redraw milestone line
            this.milestoneGraphics.clear();

            // Apply configurable offset for manual fine-tuning
            const milestoneOffset = GameConfig.milestone?.yOffset ?? 0;
            const lineY = groundSurface - this.recordHeight + milestoneOffset;
            const width = this.scale.width;

            // Draw horizontal line
            this.milestoneGraphics.lineStyle(2, 0xffff00, 0.8);
            this.milestoneGraphics.beginPath();
            this.milestoneGraphics.moveTo(0, lineY);
            this.milestoneGraphics.lineTo(width, lineY);
            this.milestoneGraphics.strokePath();

            // Update milestone text
            const meters = this.recordHeight / this.pixelsPerMeter;
            this.milestoneText.setText(`🏆 ${meters.toFixed(1)}m`);
            this.milestoneText.setPosition(10, lineY - 25);
        }
    }
}
