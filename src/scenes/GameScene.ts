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
import { InventoryManager } from '../managers/InventoryManager';
import { BackpackUI } from '../ui/BackpackUI';

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

    // Milestone tracking
    private recordHeight: number = 0;  // All-time record in pixels
    private milestoneGraphics!: Phaser.GameObjects.Graphics;
    private milestoneText!: Phaser.GameObjects.Text;
    private pixelsPerMeter: number = 50;

    // Debuff UI
    private debuffTexts: Phaser.GameObjects.Text[] = [];

    // Inventory / Backpack
    private inventoryManager!: InventoryManager;
    private backpackUI!: BackpackUI;
    private isPausedForBackpack: boolean = false;
    private backpackKey?: Phaser.Input.Keyboard.Key;

    // Height-driven gradient background system
    private skyGradient!: SkyGradientLUT;

    // 9:16 Safe Frame
    private safeFrame!: { x: number, y: number, width: number, height: number };

    // Game over screen
    private gameOverOverlay?: Phaser.GameObjects.Container;
    private isGameOver: boolean = false;
    private isPlayingDeathAnimation: boolean = false;
    private isTestMode: boolean = false;



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

        // Load Monster CloudA (Cloud) animation frames
        for (let i = 1; i <= 4; i++) {
            const frameNum = String(i).padStart(2, '0');
            this.load.image(`monster_clouda_left_${i}`, `assets/Monsters/Monster CloudA/LEFT/CloudA_frame_${frameNum}.png`);
        }
        // Middle transition frame (turning)
        this.load.image('monster_clouda_middle', 'assets/Monsters/Monster CloudA/MIDDLE/CloudA_frame_05.png');
        // Skip frame_05 (front/middle) for now; use right-facing frames 06-09
        for (let i = 6; i <= 9; i++) {
            const frameNum = String(i).padStart(2, '0');
            const rightIndex = i - 5; // 1..4 for animation keys
            this.load.image(`monster_clouda_right_${rightIndex}`, `assets/Monsters/Monster CloudA/RIGHT/CloudA_frame_${frameNum}.png`);
        }

        // Backpack icon and inventory grid background
        this.load.image('backpack_icon', 'assets/ui/Backpack.png');
        this.load.image('inventory_bg', 'assets/ui/Inventory.png');

        // Load Bullet Time icon
        this.load.image('bt_icon', 'assets/ui/bt_icon.png');

        // Load Charge Up effect frames (1-6 charging, 7-11 release)
        for (let i = 1; i <= 11; i++) {
            this.load.image(`chargeup_${i}`, `assets/effects/ChargingUp Animation/ChargingUp_frame_${String(i).padStart(2, '0')}.png`);
        }

        // Load Pickup items
        this.load.image('pickup_coin', 'assets/drops/CoinsCopper0.png');   // 铜币
        this.load.image('pickup_gem', 'assets/drops/A01_Wing.png');        // A01材料
        this.load.image('pickup_wing', 'assets/drops/A02_Wing.png');       // A02翅膀材料
    }

    create() {
        const { width, height } = this.scale;
        const groundY = height * 0.8;

        // 从主菜单过渡的淡入效果
        this.cameras.main.fadeIn(300, 0, 0, 0);

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

        // Monster CloudA - Left/Right animations
        if (this.textures.exists('monster_clouda_left_1')) {
            this.anims.create({
                key: 'monster_clouda_left',
                frames: [
                    { key: 'monster_clouda_left_1' }, { key: 'monster_clouda_left_2' },
                    { key: 'monster_clouda_left_3' }, { key: 'monster_clouda_left_4' }
                ],
                frameRate: GameConfig.monster.cloudA?.frameRate ?? 10,
                repeat: -1
            });
            this.anims.create({
                key: 'monster_clouda_right',
                frames: [
                    { key: 'monster_clouda_right_1' }, { key: 'monster_clouda_right_2' },
                    { key: 'monster_clouda_right_3' }, { key: 'monster_clouda_right_4' }
                ],
                frameRate: GameConfig.monster.cloudA?.frameRate ?? 10,
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

        // 3c. Inventory & Backpack
        this.inventoryManager = new InventoryManager();
        this.pickupManager.setInventoryManager(this.inventoryManager);
        this.inventoryManager.setPickupManager(this.pickupManager);

        // 3d. Initialize Monster Manager
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
                    this.monsterManager.checkSectorCollision(dir, x, y, this.slime, this.time.now);
                });
            }
        });
        this.input.keyboard?.on('keydown-D', () => {
            if (this.slime.state === 'AIRBORNE' && !this.slime.laneSwitchLocked) {
                this.slime.requestLaneChange(1, (dir, x, y) => {
                    this.monsterManager.checkSectorCollision(dir, x, y, this.slime, this.time.now);
                });
            }
        });

        // 4c. Backpack key
        this.backpackKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.B);

        // 5. Input - Touch with gesture tracking (for mobile)
        this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            // 背包打开时 或 冷却期内，不处理游戏输入
            if (this.shouldBlockGameInput()) {
                return;
            }
            this.pointerDownCount++;
            this.gestureManager.onPointerDown(pointer.id, pointer.x, pointer.y, this.time.now);
        });

        this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
            if (this.shouldBlockGameInput()) return;
            this.gestureManager.onPointerMove(pointer.id, pointer.x, pointer.y);
        });

        this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
            if (this.shouldBlockGameInput()) {
                return;
            }
            this.pointerDownCount--;
            this.gestureManager.onPointerUp(pointer.id);
            if (this.pointerDownCount <= 0) {
                this.pointerDownCount = 0;
            }
        });

        // 6. Input Safety - Prevent stuck input on mobile/browser edge cases
        this.input.on('pointerupoutside', (pointer: Phaser.Input.Pointer) => {
            if (this.shouldBlockGameInput()) return;
            this.pointerDownCount--;
            this.gestureManager.onPointerUp(pointer.id);
            if (this.pointerDownCount <= 0) {
                this.pointerDownCount = 0;
            }
        });
        this.input.on('pointercancel', () => {
            if (this.shouldBlockGameInput()) return;
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

        // Debuff文本初始化（最多3个位置，居中/左右分布）
        this.debuffTexts = [0, 1, 2].map(() =>
            this.add.text(0, 0, '', {
                fontSize: '24px',
                fontFamily: 'Arial',
                fontStyle: 'bold',
                color: '#ffcc00',
                stroke: '#000000',
                strokeThickness: 4
            }).setOrigin(0.5).setDepth(201).setVisible(false)
        );

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

        // Backpack UI (4x4 网格)
        this.backpackUI = new BackpackUI(this, this.inventoryManager);
        this.backpackUI.onOpen(() => this.pauseForBackpack());
        this.backpackUI.onClose(() => this.resumeFromBackpack());
        this.input.keyboard?.on('keydown-B', () => this.toggleBackpack());

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
        // 注意：新的像素风格 UI 设计已经自包含响应式逻辑，这里只处理背景遮罩
        if (this.startOverlay && this.startOverlay.active) {
            // Resize overlay background to full screen (第一个元素是 Rectangle 遮罩)
            const bg = this.startOverlay.getAt(0);
            if (bg && bg instanceof Phaser.GameObjects.Rectangle) {
                bg.setPosition(width / 2, height / 2);
                bg.setSize(width, height);
            }
            // 其他元素（按钮等）已经在 createStartScreen 中使用固定位置创建
            // 不再需要动态调整，因为使用了新的像素风格 UI
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
        // 半透明深色遮罩
        const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x0a0a15, 0.85)
            .setScrollFactor(0);

        // 装饰性边框
        const border = this.add.graphics().setScrollFactor(0);
        const borderPadding = 40;
        border.lineStyle(4, 0x4a3828, 1);
        border.strokeRect(borderPadding, borderPadding, width - borderPadding * 2, height - borderPadding * 2);
        border.lineStyle(2, 0x7c5a3a, 0.6);
        border.strokeRect(borderPadding + 6, borderPadding + 6, width - borderPadding * 2 - 12, height - borderPadding * 2 - 12);

        // 顶部装饰横条
        const topBar = this.add.graphics().setScrollFactor(0);
        topBar.fillStyle(0x3d2817, 1);
        topBar.fillRect(60, 80, width - 120, 8);
        topBar.fillStyle(0x5c4033, 1);
        topBar.fillRect(60, 82, width - 120, 3);

        // 像素风格标题
        const titleShadow = this.add.text(width / 2 + 4, height * 0.18 + 4, 'CRAZY JUMPY', {
            fontFamily: '"Press Start 2P", "Courier New", monospace',
            fontSize: '32px',
            color: '#1a2e12'
        }).setOrigin(0.5).setScrollFactor(0);

        const title = this.add.text(width / 2, height * 0.18, 'CRAZY JUMPY', {
            fontFamily: '"Press Start 2P", "Courier New", monospace',
            fontSize: '32px',
            color: '#7cba5f',
            stroke: '#2d4a1c',
            strokeThickness: 4
        }).setOrigin(0.5).setScrollFactor(0);

        // 标题呼吸动画
        this.tweens.add({
            targets: [title, titleShadow],
            scaleX: 1.03,
            scaleY: 1.03,
            duration: 1200,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        // 说明面板背景
        const instructionBg = this.add.graphics().setScrollFactor(0);
        instructionBg.fillStyle(0x1a1a2e, 0.9);
        instructionBg.fillRoundedRect(width / 2 - 200, height * 0.28, 400, 160, 12);
        instructionBg.lineStyle(2, 0x4a4a6a, 0.8);
        instructionBg.strokeRoundedRect(width / 2 - 200, height * 0.28, 400, 160, 12);

        // 操作说明
        const instructionTitle = this.add.text(width / 2, height * 0.32, '◆ 操作指南 ◆', {
            fontFamily: '"Microsoft YaHei", sans-serif',
            fontSize: '18px',
            color: '#8fd464',
            fontStyle: 'bold'
        }).setOrigin(0.5).setScrollFactor(0);

        const instructions = this.add.text(width / 2, height * 0.42,
            '按住屏幕/SPACE → 快速下落\n黄色闪烁时松开 → PERFECT\n连续3次PERFECT → 2倍力量!', {
            fontFamily: '"Microsoft YaHei", sans-serif',
            fontSize: '16px',
            color: '#cccccc',
            align: 'center',
            lineSpacing: 12
        }).setOrigin(0.5).setScrollFactor(0);

        // 开始按钮 - 木质风格
        const startBtnContainer = this.createPixelButton(
            width / 2, height * 0.58, 260, 60,
            '▶  开始游戏', 
            () => this.startGame(false)
        );

        // 测试模式按钮 - 较小的样式
        const testBtnContainer = this.createPixelButton(
            width / 2, height * 0.68, 260, 50,
            '⚙  测试模式',
            () => this.startGame(true),
            true // isSecondary
        );

        // 提示文字
        const hint = this.add.text(width / 2, height * 0.76, '测试模式：无限血 / 初始100m', {
            fontFamily: '"Microsoft YaHei", sans-serif',
            fontSize: '12px',
            color: '#6a6a8a'
        }).setOrigin(0.5).setScrollFactor(0);

        // 底部装饰
        const bottomDecor = this.add.graphics().setScrollFactor(0);
        bottomDecor.fillStyle(0x3d2817, 1);
        bottomDecor.fillRect(60, height - 88, width - 120, 8);
        bottomDecor.fillStyle(0x5c4033, 1);
        bottomDecor.fillRect(60, height - 86, width - 120, 3);

        // 空格键也可以开始
        this.input.keyboard?.once('keydown-SPACE', () => {
            if (!this.gameStarted) {
                this.startGame(false);
            }
        });

        // Store in container
        this.startOverlay = this.add.container(0, 0, [
            overlay, border, topBar, bottomDecor,
            titleShadow, title,
            instructionBg, instructionTitle, instructions,
            startBtnContainer, testBtnContainer, hint
        ]);
        this.startOverlay.setDepth(1000);

        // 入场动画
        this.startOverlay.setAlpha(0);
        this.tweens.add({
            targets: this.startOverlay,
            alpha: 1,
            duration: 400,
            ease: 'Quad.easeOut'
        });
    }

    /**
     * 创建像素风格按钮
     */
    private createPixelButton(
        x: number, y: number, 
        btnWidth: number, btnHeight: number,
        text: string,
        onClick: () => void,
        isSecondary: boolean = false
    ): Phaser.GameObjects.Container {
        const container = this.add.container(x, y).setScrollFactor(0);

        // 按钮阴影
        const shadow = this.add.graphics();
        shadow.fillStyle(0x1a0f05, 0.7);
        shadow.fillRoundedRect(-btnWidth/2 + 4, -btnHeight/2 + 4, btnWidth, btnHeight, 8);
        container.add(shadow);

        // 按钮主体
        const btnBg = this.add.graphics();
        const mainColor = isSecondary ? 0x4a4a6a : 0x8b5a2b;
        const lightColor = isSecondary ? 0x6a6a8a : 0xa67c52;
        const darkColor = isSecondary ? 0x2a2a4a : 0x6b4423;
        const borderColor = isSecondary ? 0x3a3a5a : 0x4a3219;
        const innerBorderColor = isSecondary ? 0x7a7a9a : 0xc4956a;

        // 主体填充
        btnBg.fillStyle(mainColor, 1);
        btnBg.fillRoundedRect(-btnWidth/2, -btnHeight/2, btnWidth, btnHeight, 8);
        
        // 高光（顶部）
        btnBg.fillStyle(lightColor, 1);
        btnBg.fillRoundedRect(-btnWidth/2 + 4, -btnHeight/2 + 4, btnWidth - 8, btnHeight/3, 6);
        
        // 暗部（底部）
        btnBg.fillStyle(darkColor, 1);
        btnBg.fillRoundedRect(-btnWidth/2 + 4, btnHeight/6, btnWidth - 8, btnHeight/3, 6);
        
        // 边框
        btnBg.lineStyle(3, borderColor, 1);
        btnBg.strokeRoundedRect(-btnWidth/2, -btnHeight/2, btnWidth, btnHeight, 8);
        
        // 内边框高光
        btnBg.lineStyle(1, innerBorderColor, 0.4);
        btnBg.strokeRoundedRect(-btnWidth/2 + 3, -btnHeight/2 + 3, btnWidth - 6, btnHeight - 6, 6);
        
        container.add(btnBg);

        // 左右装饰钉
        const addNail = (nx: number, ny: number) => {
            const nail = this.add.graphics();
            nail.fillStyle(0x2a1a0a, 0.5);
            nail.fillCircle(nx + 1, ny + 1, 5);
            nail.fillStyle(isSecondary ? 0x5a5a7a : 0x5c4033, 1);
            nail.fillCircle(nx, ny, 5);
            nail.fillStyle(isSecondary ? 0x8a8aaa : 0x8b7355, 1);
            nail.fillCircle(nx - 1.5, ny - 1.5, 2);
            container.add(nail);
        };
        addNail(-btnWidth/2 + 14, 0);
        addNail(btnWidth/2 - 14, 0);

        // 按钮文字
        const textColor = isSecondary ? '#aaaacc' : '#3d2817';
        const btnText = this.add.text(0, 0, text, {
            fontFamily: '"Microsoft YaHei", sans-serif',
            fontSize: isSecondary ? '16px' : '20px',
            fontStyle: 'bold',
            color: textColor
        }).setOrigin(0.5);
        container.add(btnText);

        // 交互区域
        const hitArea = this.add.rectangle(0, 0, btnWidth, btnHeight, 0xffffff, 0);
        hitArea.setInteractive({ useHandCursor: true });
        container.add(hitArea);

        // 悬停效果
        hitArea.on('pointerover', () => {
            this.tweens.add({
                targets: container,
                scaleX: 1.05,
                scaleY: 1.05,
                duration: 80,
                ease: 'Quad.easeOut'
            });
            btnText.setColor(isSecondary ? '#ffffff' : '#1a0f05');
        });

        hitArea.on('pointerout', () => {
            this.tweens.add({
                targets: container,
                scaleX: 1,
                scaleY: 1,
                duration: 80,
                ease: 'Quad.easeOut'
            });
            btnText.setColor(textColor);
        });

        // 点击效果 - 立即调用回调，动画只是视觉反馈
        hitArea.on('pointerdown', () => {
            // 立即调用回调，不等待动画
            onClick();
            // 视觉反馈动画
            this.tweens.add({
                targets: container,
                scaleX: 0.95,
                scaleY: 0.95,
                duration: 50,
                yoyo: true,
                ease: 'Quad.easeInOut'
            });
        });

        return container;
    }

    private startGame(isTestMode: boolean = false) {
        this.isTestMode = isTestMode;
        this.gameStarted = true;
        this.startOverlay.destroy();
        this.isPausedForBackpack = false;
        this.backpackUI.hide();

        // Show UI elements that were hidden during start screen
        this.heightText.setVisible(true);

        // Reset input state to prevent start button click from causing immediate jump
        this.isSpaceDown = false;
        this.pointerDownCount = 0;

        // Start camera transition
        this.isCameraTransitioning = true;
        this.cameraTransitionStartTime = this.time.now;

        // Apply test mode overrides (无限血仅在测试模式)
        if (this.slime && this.slime.healthManager) {
            this.slime.healthManager.setInvincible(this.isTestMode);
        }
        
        // 两种模式都启用初始100m跳跃，方便测试
        const initPx = 100 * this.pixelsPerMeter;
        this.slime.lastApexHeight = initPx;
        this.slime.landingApexHeight = initPx;
        this.slime.landingFallDistance = initPx;
        this.slime.landingFastFallDistance = initPx;
        this.slime.pendingTestJumpHeightPx = initPx; // 初次起跳强制 100m
        this.recordHeight = Math.max(this.recordHeight, initPx);

        // 清空背包 & 掉落物计数
        this.inventoryManager.clear();
        this.pickupManager.reset();
    }

    /** 检查是否应该阻止游戏输入 */
    private shouldBlockGameInput(): boolean {
        // 背包打开时阻止
        if (this.isPausedForBackpack) return true;
        // 背包关闭后的冷却期内阻止
        if (this.backpackUI && this.backpackUI.isInCooldown()) return true;
        return false;
    }

    private pauseForBackpack() {
        if (this.isPausedForBackpack) return;
        this.isPausedForBackpack = true;
        this.isSpaceDown = false;
        this.pointerDownCount = 0;
        this.gestureManager.clearAll();
    }

    private resumeFromBackpack() {
        if (!this.isPausedForBackpack) return;
        this.isPausedForBackpack = false;
        // 清除输入状态，防止残留
        this.isSpaceDown = false;
        this.pointerDownCount = 0;
        this.gestureManager.clearAll();
    }

    private toggleBackpack() {
        if (this.backpackUI.isShown()) {
            this.backpackUI.hide();
            this.resumeFromBackpack();
        } else {
            this.backpackUI.show();
            this.pauseForBackpack();
        }
    }

    update(_time: number, delta: number) {
        // Don't update game if not started
        if (!this.gameStarted) {
            return;
        }

        // Backpack toggle (B key)
        if (Phaser.Input.Keyboard.JustDown(this.backpackKey!)) {
            this.toggleBackpack();
        }

        // If paused by backpack: 只更新背包UI/布局，跳过物理
        if (this.isPausedForBackpack) {
            this.backpackUI.refreshSlots();
            return;
        }

        // Don't update if game is over, but still update pickups for death drops
        if (this.isGameOver) {
            // 继续更新掉落物，让死亡喷射的物品完成落地动画
            const dt = delta / 1000;
            this.pickupManager.update(dt, this.slime.x, this.slime.y, 0);
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

            // 即使在死亡动画，也更新掉落物的物理/弹出，让喷散生效
            this.pickupManager.update(dt, this.slime.x, this.slime.y, 0);
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
                this.monsterManager.checkSectorCollision(dir, x, y, this.slime, this.time.now);
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

            // 空中撞怪：给予DEBUFF（不致死）
            if (this.slime.state === 'AIRBORNE'
                && !this.slime.hasDebuffGrace(this.time.now)
                && !this.slime.hasRecentHitGrace(this.time.now)
                && !this.slime.hasRecentHitWindow(this.time.now)
                && !this.slime.hasSwingGrace(this.time.now)) { // 挥刀窗口内直接跳过，确保先判击杀
                const hitType = this.monsterManager.checkDebuffCollision(
                    this.slime.x,
                    this.slime.y,
                    this.slime.radius,
                    this.time.now,
                    this.slime
                );
                if (hitType) {
                    this.slime.applyDebuffFromMonster(hitType);
                }
            }

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

        // Update Debuff UI (显示在角色与高度指示器之间)
        this.updateDebuffUI();

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

            // 死亡喷出背包所有道具（同步于死亡动画开始）
            // 传入地面Y坐标，让物品落地后静止
            const groundY = this.ground.y;
            const dropDuration = this.inventoryManager.dropAll(this, this.slime.x, this.slime.y, groundY);

            // Play death animation
            this.slime.playDeathAnimation(() => {
                // 死亡动画播放完毕后，等待物品落地再显示游戏结束画面
                // 如果物品落地时间比死亡动画长，需要额外等待
                const deathAnimDuration = 1200; // 死亡动画大约1.2秒
                const remainingWait = Math.max(0, dropDuration - deathAnimDuration);
                
                if (remainingWait > 0) {
                    this.time.delayedCall(remainingWait, () => {
                        this.showGameOver();
                    });
                } else {
                    this.showGameOver();
                }
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
     * 在角色与高度指示器之间显示DEBUFF图标/文本
     * 布局：1个居中，2个左右分布，3个左右+中
     */
    private updateDebuffUI(): void {
        if (!this.debuffTexts?.length) return;

        const active: { label: string; color: string }[] = [];
        if (this.slime.poison1Duration > 0) {
            active.push({ label: `毒I ${this.slime.poison1Duration.toFixed(1)}s`, color: '#55ff55' });
        }
        if (this.slime.poison2Duration > 0) {
            active.push({ label: `毒II ${this.slime.poison2Duration.toFixed(1)}s`, color: '#00ffff' });
        }
        if (this.slime.slowImpulseTimer > 0) {
            active.push({ label: `减速`, color: '#ffcc00' });
        }

        // 无debuff直接隐藏
        if (active.length === 0) {
            this.debuffTexts.forEach(t => t.setVisible(false));
            return;
        }

        // 目标Y：角色与高度文本的中点 + 少量偏移
        const midY = (this.slime.y + (this.heightText.y + this.heightText.height * this.heightText.scaleY * 0.5)) / 2;
        const baseY = midY + 10;
        const centerX = this.slime.x;

        // 布局偏移
        const offsets = [
            [0],
            [-40, 40],
            [-60, 0, 60],
        ];

        // 更新/重排
        this.debuffTexts.forEach(t => t.setVisible(false));
        const layout = offsets[Math.min(active.length, 3) - 1] ?? [];

        active.slice(0, 3).forEach((item, idx) => {
            const textObj = this.debuffTexts[idx];
            textObj.setText(item.label);
            textObj.setColor(item.color);
            textObj.setPosition(centerX + layout[idx], baseY);
            textObj.setVisible(true);
        });
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
        const restartButton = this.add.text(width / 2, height * 0.65, '[ 重新开始 ]', {
            fontSize: '42px',
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

        // Return to main menu button
        const menuButton = this.add.text(width / 2, height * 0.78, '[ 返回主菜单 ]', {
            fontSize: '32px',
            fontFamily: 'Arial',
            fontStyle: 'bold',
            color: '#8fd464',
            stroke: '#000000',
            strokeThickness: 4
        }).setOrigin(0.5).setScrollFactor(0).setDepth(2001).setInteractive({ useHandCursor: true });

        menuButton.on('pointerover', () => {
            menuButton.setScale(1.1);
            menuButton.setColor('#aaffaa');
        });
        menuButton.on('pointerout', () => {
            menuButton.setScale(1.0);
            menuButton.setColor('#8fd464');
        });
        menuButton.on('pointerdown', () => {
            this.cameras.main.fadeOut(300, 0, 0, 0);
            this.cameras.main.once('camerafadeoutcomplete', () => {
                this.scene.start('MainMenuScene');
            });
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
