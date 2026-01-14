import Phaser from 'phaser';
import type { InventoryManager, InventorySlot } from '../managers/InventoryManager';

/**
 * BackpackUI - 4x4 背包界面
 * 使用 Inventory.png 右上角 4x4 网格作为背景
 */
export class BackpackUI {
    private scene: Phaser.Scene;
    private inventory: InventoryManager;
    private container: Phaser.GameObjects.Container;
    private panelBg: Phaser.GameObjects.Image | null = null;
    private slots: Phaser.GameObjects.Container[] = [];
    private icon: Phaser.GameObjects.Image;
    // 关闭按钮单独添加到场景（不在容器内），避免 Phaser 嵌套容器 + scrollFactor(0) 的输入 bug
    private closeBtn: Phaser.GameObjects.Container;
    private isOpen: boolean = false;
    private events: Phaser.Events.EventEmitter = new Phaser.Events.EventEmitter();
    private textureCreated: boolean = false;
    
    // 输入冷却 - 关闭背包后短暂阻止游戏输入
    private inputCooldownUntil: number = 0;

    // 4x4 网格配置
    private readonly cols = 4;
    private readonly rows = 4;
    
    // 原图参数
    private readonly cropX = 26;
    private readonly cropY = 0;
    private readonly cropW = 77;
    private readonly cropH = 77;
    private readonly borderRatio = 0.026;
    
    private bgScale = 4;

    constructor(scene: Phaser.Scene, inventory: InventoryManager) {
        this.scene = scene;
        this.inventory = inventory;

        // 背包主容器
        this.container = scene.add.container(0, 0).setScrollFactor(0).setDepth(1200).setVisible(false);

        // 创建裁剪纹理
        this.createCroppedTexture();

        // 背景面板
        if (scene.textures.exists('inventory_4x4')) {
            this.panelBg = scene.add.image(0, 0, 'inventory_4x4').setOrigin(0.5, 0.5);
            this.panelBg.setScale(this.bgScale);
            this.panelBg.setInteractive();
            // 点击面板不做任何事，只是阻止穿透
            this.panelBg.on('pointerdown', () => {});
            this.container.add(this.panelBg);
        }

        // 关闭按钮 - 直接添加到场景，不在容器内，避免 Phaser 的嵌套输入 bug
        this.closeBtn = this.createCloseButton();
        this.closeBtn.setScrollFactor(0).setDepth(1201).setVisible(false); // 比容器更高的深度

        // 创建物品槽
        this.createGrid();

        // 右下角背包图标
        this.icon = scene.add.image(0, 0, 'backpack_icon').setScrollFactor(0).setDepth(1100).setInteractive({ useHandCursor: true });
        this.icon.setDisplaySize(72, 72);
        this.icon.on('pointerdown', () => {
            if (!this.isOpen) {
                this.show();
            }
        });

        this.layout();
        scene.scale.on('resize', this.layout, this);
    }

    private createCloseButton(): Phaser.GameObjects.Container {
        const btnSize = 50;
        const btnContainer = this.scene.add.container(0, 0);
        
        // 背景绘制在 (0,0) 为中心
        const bg = this.scene.add.graphics();
        bg.fillStyle(0x000000, 0.9);
        bg.fillRoundedRect(-btnSize/2, -btnSize/2, btnSize, btnSize, 10);
        bg.lineStyle(3, 0xffffff, 0.8);
        bg.strokeRoundedRect(-btnSize/2, -btnSize/2, btnSize, btnSize, 10);
        btnContainer.add(bg);
        
        // X 文字居中
        const text = this.scene.add.text(0, 0, '✕', {
            fontFamily: 'Arial',
            fontSize: '32px',
            fontStyle: 'bold',
            color: '#ffffff',
        }).setOrigin(0.5, 0.5);
        btnContainer.add(text);
        
        // 点击区域：以 (0,0) 为中心的正方形
        // hitArea 坐标是相对于容器自身的，(0,0) 是容器的原点
        btnContainer.setSize(btnSize, btnSize);
        btnContainer.setInteractive({ 
            useHandCursor: true,
            hitArea: new Phaser.Geom.Rectangle(-btnSize/2, -btnSize/2, btnSize, btnSize),
            hitAreaCallback: Phaser.Geom.Rectangle.Contains
        });
        
        btnContainer.on('pointerdown', () => {
            this.hide();
        });
        
        btnContainer.on('pointerover', () => {
            text.setColor('#ff6666');
            bg.clear();
            bg.fillStyle(0x333333, 0.95);
            bg.fillRoundedRect(-btnSize/2, -btnSize/2, btnSize, btnSize, 10);
            bg.lineStyle(3, 0xff6666, 1);
            bg.strokeRoundedRect(-btnSize/2, -btnSize/2, btnSize, btnSize, 10);
        });
        
        btnContainer.on('pointerout', () => {
            text.setColor('#ffffff');
            bg.clear();
            bg.fillStyle(0x000000, 0.9);
            bg.fillRoundedRect(-btnSize/2, -btnSize/2, btnSize, btnSize, 10);
            bg.lineStyle(3, 0xffffff, 0.8);
            bg.strokeRoundedRect(-btnSize/2, -btnSize/2, btnSize, btnSize, 10);
        });
        
        return btnContainer;
    }

    private createCroppedTexture() {
        if (this.textureCreated) return;
        if (!this.scene.textures.exists('inventory_bg')) return;
        if (this.scene.textures.exists('inventory_4x4')) {
            this.textureCreated = true;
            return;
        }
        
        const rt = this.scene.add.renderTexture(0, 0, this.cropW, this.cropH);
        rt.draw('inventory_bg', -this.cropX, -this.cropY);
        rt.saveTexture('inventory_4x4');
        rt.destroy();
        this.textureCreated = true;
    }

    public toggle() {
        if (this.isOpen) {
            this.hide();
        } else {
            this.show();
        }
    }

    public show() {
        if (this.isOpen) return;
        this.isOpen = true;
        this.layout();
        this.refreshSlots();
        this.container.setVisible(true);
        this.container.setAlpha(1);
        this.closeBtn.setVisible(true);
        this.events.emit('open');
    }

    public hide() {
        if (!this.isOpen) return;
        this.isOpen = false;
        this.container.setVisible(false);
        this.closeBtn.setVisible(false);
        
        // 设置输入冷却，防止关闭时的点击被游戏处理
        this.inputCooldownUntil = this.scene.time.now + 100;
        
        this.events.emit('close');
    }
    
    /** 检查是否在输入冷却期内 */
    public isInCooldown(): boolean {
        return this.scene.time.now < this.inputCooldownUntil;
    }

    public isShown() {
        return this.isOpen;
    }

    public layout = () => {
        const w = this.scene.scale.width;
        const h = this.scene.scale.height;

        this.icon.setPosition(w - 16 - this.icon.displayWidth * 0.5, h - 16 - this.icon.displayHeight * 0.5);
        this.container.setPosition(w / 2, h / 2);

        const panelW = this.cropW * this.bgScale;
        const panelH = this.cropH * this.bgScale;

        // 关闭按钮现在是场景的直接子元素，使用屏幕坐标
        // 定位在面板右上角外侧
        const closeBtnX = w / 2 + panelW / 2 + 25;
        const closeBtnY = h / 2 - panelH / 2 - 25;
        this.closeBtn.setPosition(closeBtnX, closeBtnY);

        const cellW = panelW / this.cols;
        const cellH = panelH / this.rows;
        const borderOffset = panelW * this.borderRatio;

        let idx = 0;
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                if (idx < this.slots.length) {
                    const slot = this.slots[idx];
                    const x = -panelW / 2 + borderOffset + c * cellW + cellW / 2;
                    const y = -panelH / 2 + borderOffset + r * cellH + cellH / 2;
                    slot.setPosition(x, y);
                    
                    const icon = slot.getByName('icon') as Phaser.GameObjects.Image;
                    if (icon) {
                        icon.setDisplaySize(cellW * 0.6, cellH * 0.6);
                    }
                    idx++;
                }
            }
        }
    };

    public refreshSlots() {
        const inventorySlots = this.inventory.getSlots();
        
        for (let i = 0; i < this.slots.length; i++) {
            const slotContainer = this.slots[i];
            const data: InventorySlot = inventorySlots[i];
            const icon = slotContainer.getByName('icon') as Phaser.GameObjects.Image;
            const countText = slotContainer.getByName('count') as Phaser.GameObjects.Text;
            
            if (data && data.type && data.count > 0) {
                icon.setTexture(this.getIconKey(data.type));
                icon.setVisible(true);
                countText.setText(data.count > 1 ? String(data.count) : '');
                countText.setVisible(data.count > 1);
            } else {
                icon.setVisible(false);
                countText.setVisible(false);
            }
        }
    }

    private createGrid() {
        for (let i = 0; i < this.cols * this.rows; i++) {
            const icon = this.scene.add.image(0, 0, 'pickup_coin');
            icon.setVisible(false);
            icon.setName('icon');

            const count = this.scene.add.text(0, 0, '', {
                fontSize: '20px',
                fontFamily: 'Arial',
                fontStyle: 'bold',
                color: '#ffffff',
                stroke: '#000000',
                strokeThickness: 3,
            }).setOrigin(0.5, 0.5).setName('count');

            const slotContainer = this.scene.add.container(0, 0, [icon, count]);
            this.container.add(slotContainer);
            this.slots.push(slotContainer);
        }
    }

    private getIconKey(type: InventorySlot['type']): string {
        switch (type) {
            case 'coin': return 'pickup_coin';
            case 'gem': return 'pickup_gem';
            case 'wing': return 'pickup_wing';
            default: return 'pickup_coin';
        }
    }

    public onOpen(cb: () => void) { this.events.on('open', cb); }
    public onClose(cb: () => void) { this.events.on('close', cb); }
}
