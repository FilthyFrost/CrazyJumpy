import Phaser from 'phaser';
import Slime from '../objects/Slime';
import Ground from '../objects/Ground';
import { GameConfig } from '../config';
import { CameraShakeRig } from './CameraShakeRig';
import SkyGradientLUT from '../objects/SkyGradientLUT';
import { GestureManager } from '../input/GestureManager';
import { MonsterManager } from '../objects/MonsterManager';
import { BulletTimeManager } from '../managers/BulletTimeManager';
import { BulletTimeHourglass } from '../ui/BulletTimeHourglass';
import { PickupManager } from '../objects/PickupManager';

export default class GameScene extends Phaser.Scene {
    private slime!: Slime;
    private ground!: Ground;
    private isSpaceDown: boolean = false;
    private pointerDownCount: number = 0;  // Track multi-touch for mobile
    private gameStarted: boolean = false;

    // Gesture Manager (三通道换道手势识别)
    private gestureManager!: GestureManager;

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



    // Monster System (怪物系统)
    private monsterManager!: MonsterManager;

    // Bullet Time System
    private bulletTimeManager!: BulletTimeManager;
    private bulletTimeHourglass!: BulletTimeHourglass;

    // Pickup System (掉落物品)
    private pickupManager!: PickupManager;

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

        // Load idle animation frames (8 frames) - right facing (default)
        for (let i = 1; i <= 8; i++) {
            const frameNum = String(i).padStart(4, '0');
            this.load.image(`idle_${i}`, `assets/HumanIdle State/HumanIdle_${frameNum}.png`);
        }

        // Load idle animation frames (8 frames) - left facing
        for (let i = 0; i < 8; i++) {
            const frameNum = String(i).padStart(2, '0');
            this.load.image(`idle_left_${i + 1}`, `assets/HumanIdle State Left/HumanIdle_row2_${frameNum}.png`);
        }

        // Load jump animation frames (4 frames) - right facing (default)
        for (let i = 1; i <= 4; i++) {
            const frameNum = String(i).padStart(4, '0');
            this.load.image(`jump_${i}`, `assets/Jump State/Jump_${frameNum}.png`);
        }

        // Load jump animation frames (4 frames) - left facing
        for (let i = 1; i <= 4; i++) {
            const frameNum = String(i).padStart(4, '0');
            this.load.image(`jump_left_${i}`, `assets/Jump State Left/Jump_Left_${frameNum}.png`);
        }

        // Load attack animation frames (4 frames) - right facing
        for (let i = 1; i <= 4; i++) {
            this.load.image(`attack_right_${i}`, `assets/Human Attack State/RIGHT/frame_${i}.png`);
        }

        // Load attack animation frames (4 frames) - left facing
        for (let i = 1; i <= 4; i++) {
            this.load.image(`attack_left_${i}`, `assets/Human Attack State/LEFT/frame_${i}.png`);
        }

        // Load Monster A01 animation frames (3 frames each direction)
        for (let i = 1; i <= 3; i++) {
            this.load.image(`monster_a01_left_${i}`, `assets/Monsters/Monster A01/left_frame_${i}.png`);
            this.load.image(`monster_a01_right_${i}`, `assets/Monsters/Monster A01/right_frame_${i}.png`);
        }

        // Load Monster A02 (Bat) animation frames (3 frames each direction)
        for (let i = 1; i <= 3; i++) {
            const frameNum = String(i).padStart(2, '0');
            this.load.image(`monster_a02_left_${i}`, `assets/Monsters/Monster A02/BatD_left_frame_${frameNum}.png`);
            this.load.image(`monster_a02_right_${i}`, `assets/Monsters/Monster A02/BatD_right_frame_${frameNum}.png`);
        }

        // Load Monster A03 (BatH/Elite) animation frames (3 frames each direction)
        for (let i = 1; i <= 3; i++) {
            const frameNum = String(i).padStart(2, '0');
            this.load.image(`monster_a03_left_${i}`, `assets/Monsters/Monster A03/BatH_left_${frameNum}.png`);
            this.load.image(`monster_a03_right_${i}`, `assets/Monsters/Monster A03/BatH_right_${frameNum}.png`);
        }

        // Load Bullet Time icon
        this.load.image('bt_icon', 'assets/ui/bt_icon.png');

        // Load Charge Effect frames (14 frames)
        for (let i = 1; i <= 14; i++) {
            const frameNum = String(i).padStart(2, '0');
            this.load.image(`charge_${i}`, `assets/effects/charge/Bubble_frame_${frameNum}.png`);
        }

        // Load Pickup items
        this.load.image('pickup_coin', 'assets/drops/CoinsCopper0.png');   // 铜币
        this.load.image('pickup_gem', 'assets/drops/A01_Wing.png');        // A01材料
        this.load.image('pickup_wing', 'assets/drops/A02_Wing.png');       // A02翅膀材料
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

        // Initialize Bullet Time System
        // Fix: Do not reset BEFORE creation on restart (logic error). 
        // Always create new manager instance, then call reset to apply initial test energy.
        this.bulletTimeManager = new BulletTimeManager(this);
        this.bulletTimeManager.reset(); // Sets initial energy to 2.0s

        // Initialize Bullet Time Hourglass UI
        this.bulletTimeHourglass = new BulletTimeHourglass(this, this.bulletTimeManager);

        // Events for Bullet Time (Sound/Visuals)
        this.events.on('bullet-time-start', () => {
            // Sound/shader effects can be added here
        });
        this.events.on('bullet-time-end', () => {
            // Remove effects here
        });
        // Manual bullet time removed - now automatic on PERFECT bounce

        // ===== HEIGHT-DRIVEN GRADIENT BACKGROUND =====
        // Initialize gradient LUT system (replaces static background images)
        this.skyGradient = new SkyGradientLUT(
            this,
            '渐变色调图',
            groundY
        );

        // ===== CHARACTER ANIMATION STATE MACHINE =====

        // Idle animation (on ground, no input) - 8 frames, looping, right facing
        this.anims.create({
            key: 'idle',
            frames: [
                { key: 'idle_1' }, { key: 'idle_2' }, { key: 'idle_3' }, { key: 'idle_4' },
                { key: 'idle_5' }, { key: 'idle_6' }, { key: 'idle_7' }, { key: 'idle_8' }
            ],
            frameRate: 8,
            repeat: -1  // Loop forever
        });

        // Idle Left animation (on ground, no input, facing left) - 8 frames, looping
        this.anims.create({
            key: 'idle_left',
            frames: [
                { key: 'idle_left_1' }, { key: 'idle_left_2' }, { key: 'idle_left_3' }, { key: 'idle_left_4' },
                { key: 'idle_left_5' }, { key: 'idle_left_6' }, { key: 'idle_left_7' }, { key: 'idle_left_8' }
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

        // LEFT-FACING ANIMATIONS (for lane switching left)
        // Jump Rise Left animation (going up, facing left)
        this.anims.create({
            key: 'jump_rise_left',
            frames: [
                { key: 'jump_left_1' }, { key: 'jump_left_2' }
            ],
            frameRate: 12,
            repeat: 0
        });

        // Jump Fall Left animation (going down, facing left)
        this.anims.create({
            key: 'jump_fall_left',
            frames: [
                { key: 'jump_left_3' }, { key: 'jump_left_4' }
            ],
            frameRate: 12,
            repeat: 0
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

        // Jump Land Left animation (on ground, charging, facing left)
        this.anims.create({
            key: 'jump_land_left',
            frames: [
                { key: 'jump_left_4' }
            ],
            frameRate: 1,
            repeat: 0
        });

        // Attack Right animation (lane switch right) - 4 frames, play once
        this.anims.create({
            key: 'attack_right',
            frames: [
                { key: 'attack_right_1' }, { key: 'attack_right_2' },
                { key: 'attack_right_3' }, { key: 'attack_right_4' }
            ],
            frameRate: 24,  // Fast attack animation
            repeat: 0
        });

        // Attack Left animation (lane switch left) - 4 frames, play once
        this.anims.create({
            key: 'attack_left',
            frames: [
                { key: 'attack_left_1' }, { key: 'attack_left_2' },
                { key: 'attack_left_3' }, { key: 'attack_left_4' }
            ],
            frameRate: 24,  // Fast attack animation
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

        // Monster A01 - Left animation
        this.anims.create({
            key: 'monster_a01_left',
            frames: [
                { key: 'monster_a01_left_1' }, { key: 'monster_a01_left_2' }, { key: 'monster_a01_left_3' }
            ],
            frameRate: GameConfig.monster.a01.frameRate,
            repeat: -1
        });

        // Monster A01 - Right animation
        this.anims.create({
            key: 'monster_a01_right',
            frames: [
                { key: 'monster_a01_right_1' }, { key: 'monster_a01_right_2' }, { key: 'monster_a01_right_3' }
            ],
            frameRate: GameConfig.monster.a01.frameRate,
            repeat: -1
        });

        // Monster A02 (Bat) - Left animation
        this.anims.create({
            key: 'monster_a02_left',
            frames: [
                { key: 'monster_a02_left_1' }, { key: 'monster_a02_left_2' }, { key: 'monster_a02_left_3' }
            ],
            frameRate: GameConfig.monster.a02.frameRate,
            repeat: -1
        });

        // Monster A02 (Bat) - Right animation
        this.anims.create({
            key: 'monster_a02_right',
            frames: [
                { key: 'monster_a02_right_1' }, { key: 'monster_a02_right_2' }, { key: 'monster_a02_right_3' }
            ],
            frameRate: GameConfig.monster.a02.frameRate,
            repeat: -1
        });

        // Monster A03 (BatH/Elite) - Left animation
        // 使用可选链确保即使资源未加载也不会崩溃
        if (this.textures.exists('monster_a03_left_1')) {
            this.anims.create({
                key: 'monster_a03_left',
                frames: [
                    { key: 'monster_a03_left_1' }, { key: 'monster_a03_left_2' }, { key: 'monster_a03_left_3' }
                ],
                frameRate: GameConfig.monster.a03?.frameRate ?? 8,
                repeat: -1
            });

            this.anims.create({
                key: 'monster_a03_right',
                frames: [
                    { key: 'monster_a03_right_1' }, { key: 'monster_a03_right_2' }, { key: 'monster_a03_right_3' }
                ],
                frameRate: GameConfig.monster.a03?.frameRate ?? 8,
                repeat: -1
            });
        } else {
            console.warn('[GameScene] A03 textures not found, using A01 as fallback');
            // 创建回退动画，使用A01的纹理
            this.anims.create({
                key: 'monster_a03_left',
                frames: [
                    { key: 'monster_a01_left_1' }, { key: 'monster_a01_left_2' }, { key: 'monster_a01_left_3' }
                ],
                frameRate: 8,
                repeat: -1
            });

            this.anims.create({
                key: 'monster_a03_right',
                frames: [
                    { key: 'monster_a01_right_1' }, { key: 'monster_a01_right_2' }, { key: 'monster_a01_right_3' }
                ],
                frameRate: 8,
                repeat: -1
            });
        }

        // 1. Create Ground
        this.ground = new Ground(this, groundY);

        // 2. Create Slime - start at ground level (center lane)
        // Player should sit ON the ground, so Y = ground.y - playerCollisionRadius
        const playerRadius = GameConfig.display.playerCollisionRadius;
        this.slime = new Slime(this, width / 2, this.ground.y - playerRadius, this.ground);

        // Initialize lane system with screen width
        this.slime.setScreenWidth(width);

        // 3. Initialize Gesture Manager for swipe/hold detection
        this.gestureManager = new GestureManager(width);

        // 3b. Initialize Pickup Manager
        this.pickupManager = new PickupManager(this);

        // 3c. Initialize Monster Manager
        this.monsterManager = new MonsterManager(this, width, groundY, this.pixelsPerMeter);
        this.monsterManager.setPickupManager(this.pickupManager);
        this.monsterManager.spawnInitialMonsters();

        // 4. Input - Keyboard (space = hold/fast-fall)
        this.input.keyboard?.on('keydown-SPACE', () => { this.isSpaceDown = true; });
        this.input.keyboard?.on('keyup-SPACE', () => { this.isSpaceDown = false; });

        // 4b. Input - Keyboard lane switching (A = left, D = right)
        this.input.keyboard?.on('keydown-A', () => {
            if (this.slime.state === 'AIRBORNE' && !this.slime.laneSwitchLocked) {
                this.slime.requestLaneChange(-1, (dir, x, y) => {
                    this.monsterManager.checkSectorCollision(dir, x, y);
                });
            }
        });
        this.input.keyboard?.on('keydown-D', () => {
            if (this.slime.state === 'AIRBORNE' && !this.slime.laneSwitchLocked) {
                this.slime.requestLaneChange(1, (dir, x, y) => {
                    this.monsterManager.checkSectorCollision(dir, x, y);
                });
            }
        });

        // 5. Input - Touch with gesture tracking (for mobile)
        this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            this.pointerDownCount++;
            this.gestureManager.onPointerDown(pointer.id, pointer.x, pointer.y, this.time.now);
        });

        this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
            this.gestureManager.onPointerMove(pointer.id, pointer.x, pointer.y);
        });

        this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
            this.pointerDownCount--;
            this.gestureManager.onPointerUp(pointer.id);
            if (this.pointerDownCount <= 0) {
                this.pointerDownCount = 0;
            }
        });

        // 6. Input Safety - Prevent stuck input on mobile/browser edge cases
        this.input.on('pointerupoutside', (pointer: Phaser.Input.Pointer) => {
            this.pointerDownCount--;
            this.gestureManager.onPointerUp(pointer.id);
            if (this.pointerDownCount <= 0) {
                this.pointerDownCount = 0;
            }
        });
        this.input.on('pointercancel', () => {
            this.pointerDownCount = 0;
            this.gestureManager.clearAll();
        });
        this.game.events.on('blur', () => {
            this.pointerDownCount = 0;
            this.isSpaceDown = false;
            this.gestureManager.clearAll();
        });
        this.game.events.on('hidden', () => {
            this.pointerDownCount = 0;
            this.isSpaceDown = false;
            this.gestureManager.clearAll();
        });

        // Meter HUD - adjusted position for mobile (using config)
        const heightFontSize = Math.min(
            GameConfig.ui.heightText.maxFontSize,
            Math.floor(width * GameConfig.ui.heightText.fontSizePercent)
        );
        // Initial position: will be updated in update() to follow player
        // Use groundY as initial reference since slime starts at ground level
        const initialGroundY = height * 0.8;
        const initialHeightY = initialGroundY + GameConfig.ui.heightText.yOffset;
        this.heightText = this.add.text(width / 2, initialHeightY, '0m', {
            fontSize: `${heightFontSize}px`,
            fontFamily: 'Arial',
            color: '#ffffff',
            align: 'center',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: Math.max(3, heightFontSize * 0.1)
        }).setOrigin(0.5, 0).setDepth(200).setVisible(false); // Hidden until game starts

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
            // Font size relative to SAFE width (using config)
            const fs = Math.min(
                GameConfig.ui.heightText.maxFontSize,
                Math.floor(sf.width * GameConfig.ui.heightText.fontSizePercent)
            );
            this.heightText.setFontSize(fs);
            this.heightText.setStroke('#000000', Math.max(4, fs * 0.1));

            // Position: Now handled in update() to follow player
            // this.heightText.setPosition(width / 2, sf.y + sf.height * 0.9);
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

        // Show UI elements that were hidden during start screen
        this.heightText.setVisible(true);

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

        // Update Bullet Time Manager (Real Time)
        // Convert y to height meters: ground.y (bottom) - slime.y (top)
        const heightM = (this.ground.y - this.slime.y) / this.pixelsPerMeter;
        const isAscending = this.slime.vy < 0;
        this.bulletTimeManager.update(clampedDelta, heightM, isAscending);

        // Update Bullet Time Manager logic (timers, auto-cancel)
        // Note: Position update moved to end of frame to match physics position
        this.bulletTimeManager.update(clampedDelta, heightM, isAscending);

        // Apply Time Scale to Physics Step Accumulator
        // FIX: Previously we multiplied accumulator by timeScale, which caused the physics loop 
        // to run fewer times per second (low FPS).
        // NOW: We accumulate real time (full FPS), but scale the DT passed to the physics engine.
        this.accumulator += clampedDelta;

        // ===== GESTURE PROCESSING =====
        // Process gesture manager once per frame (not per physics step)
        const currentTime = this.time.now;

        // ===== LANE SWITCHING LOGIC =====
        // Core rule: Lane switch is allowed ONLY during ASCENT (vy < 0)
        // IMPORTANT: Reset lock BEFORE gesture update so swipe detection sees unlocked state
        if (this.slime.state === 'AIRBORNE' && this.slime.vy < 0) {
            this.slime.resetLaneSwitchLock();
            this.gestureManager.resetLaneSwitchLock();
        }

        // Now process gestures with correct lock state
        const gesture = this.gestureManager.update(currentTime);

        // Determine if hold is active (from gesture or keyboard)
        const isHoldActive = gesture.isHoldActive || this.isSpaceDown;

        // Process lane switching (ascending + swipe detected)
        // Note: Swipe and Hold are mutually exclusive in GestureManager, so no need to check isHoldActive here
        if (this.slime.state === 'AIRBORNE' && this.slime.vy < 0 && gesture.swipeDirection !== 0) {
            const direction = gesture.swipeDirection as -1 | 1;
            // Trigger lane change with collision callback (fired on attack impact frame)
            this.slime.requestLaneChange(direction, (dir, x, y) => {
                this.monsterManager.checkSectorCollision(dir, x, y);
            });
        }

        let steps = 0;
        // Get current time scale for this frame
        const timeScale = this.bulletTimeManager.timeScale;

        while (this.accumulator >= this.FIXED_DT && steps < this.MAX_STEPS_PER_FRAME) {
            // Run physics at fixed timestep INTERVAL (e.g. 60 times/sec real time)
            // BUT simulate scaled amount of time (e.g. 0.3 * 1/60 sec game time)
            const simDt = this.FIXED_DT * timeScale;

            this.slime.update(simDt * 1000, isHoldActive);  // Slime expects ms
            this.ground.render(simDt, this.slime.getCompression(), this.slime.x);

            // Update monsters
            this.monsterManager.update(simDt);

            // Update pickups (chase player with dynamic speed)
            const playerSpeed = Math.abs(this.slime.vy);
            this.pickupManager.update(simDt, this.slime.x, this.slime.y, playerSpeed);

            // Check Collision (Player vs Monster) - REMOVED per user request
            // Monsters do not kill the player.

            this.accumulator -= this.FIXED_DT; // Consume REAL time
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

        // Update Shake Rig
        // User Request: Disable shake during bullet time for better visibility
        const isBulletTime = this.bulletTimeManager.isActive;
        const inputChargeShake = isBulletTime ? 0 : this.slime.chargeShake01;
        const inputAirShake = isBulletTime ? 0 : this.slime.airShake01;

        this.shakeRig.update(dt, inputChargeShake, inputAirShake);

        // Apply Final Camera Position (Base + Shake)
        this.cameras.main.scrollY = next + this.shakeRig.shakeY;
        this.cameras.main.scrollX = this.shakeRig.shakeX;



        // HUD Update
        // Height = Distance from ground to player's FEET (0m when standing)
        const groundLevel = this.ground.y;
        const currentFeet = this.slime.y + this.slime.radius;
        const heightPixels = Math.max(0, groundLevel - currentFeet);
        const heightMeters = heightPixels / this.pixelsPerMeter;

        this.heightText.setText(`${heightMeters.toFixed(0)}m`);

        // Make Height Text follow player (offset from config)
        const heightYOffset = GameConfig.ui.heightText.yOffset;
        this.heightText.setPosition(this.slime.x, this.slime.y + heightYOffset);

        // Update Bullet Time Hourglass UI
        this.bulletTimeHourglass.update(this.slime.x, this.slime.y);

        // ===== UPDATE GRADIENT BACKGROUND =====
        // Update background color based on player height
        this.skyGradient.update(this.slime.y);

        // Screen edge vignette disabled per user feedback
        // this.updateChargeVignette();

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

        this.milestoneText.setText(`🏆 ${meters.toFixed(0)}m`);
        this.milestoneText.setPosition(textX, lineY - 25);
    }

    /**
     * Called when player lands (from Slime state)
     * 落地时清理所有怪物，实现"一跳一舞台"机制
     */
    public onPlayerLanded() {
        // 落地清场：清理所有怪物，防止累积刷怪
        this.monsterManager.onPlayerLanded();
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
            `最高记录: ${finalHeight.toFixed(0)}m\n生命值: 0`, {
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
