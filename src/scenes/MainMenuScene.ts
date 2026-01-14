import Phaser from 'phaser';

/**
 * MainMenuScene - 游戏主菜单
 * 像素风格的木质按钮设计
 */
export default class MainMenuScene extends Phaser.Scene {
    private buttons: Phaser.GameObjects.Container[] = [];
    private titleText!: Phaser.GameObjects.Text;

    constructor() {
        super({ key: 'MainMenuScene' });
    }

    preload() {
        // 预加载背包图标用于仓库按钮
        if (!this.textures.exists('backpack_icon')) {
            this.load.image('backpack_icon', 'assets/ui/Backpack.png');
        }
    }

    create() {
        const { width, height } = this.scale;

        // 创建深色像素风格背景
        this.createBackground(width, height);

        // 游戏标题
        this.createTitle(width);

        // 菜单按钮
        this.createMenuButtons(width, height);

        // 版本号
        this.createVersionText(width, height);

        // 装饰性火焰/粒子效果
        this.createDecorations(width);
    }

    private createBackground(width: number, height: number) {
        // 深色渐变背景
        const bg = this.add.graphics();
        
        // 绘制深色背景
        bg.fillStyle(0x1a1a2e, 1);
        bg.fillRect(0, 0, width, height);
        
        // 添加网格/砖块纹理效果
        bg.lineStyle(1, 0x252545, 0.3);
        const gridSize = 32;
        for (let x = 0; x < width; x += gridSize) {
            bg.lineBetween(x, 0, x, height);
        }
        for (let y = 0; y < height; y += gridSize) {
            bg.lineBetween(0, y, width, y);
        }

        // 添加拱门装饰
        this.createArchDecoration(width, height);
    }

    private createArchDecoration(width: number, height: number) {
        const archGraphics = this.add.graphics();
        archGraphics.fillStyle(0x0f0f1a, 0.8);
        
        // 绘制多个拱门
        const archWidth = 80;
        const archHeight = 120;
        const archSpacing = 100;
        const startX = (width % archSpacing) / 2;
        
        for (let x = startX; x < width; x += archSpacing) {
            // 拱门主体
            archGraphics.fillRect(x - archWidth/2, height - archHeight, archWidth, archHeight);
            // 拱门顶部圆弧
            archGraphics.fillCircle(x, height - archHeight, archWidth/2);
        }
    }

    private createTitle(width: number) {
        // 主标题 - 像素风格
        const titleStyle: Phaser.Types.GameObjects.Text.TextStyle = {
            fontFamily: '"Press Start 2P", "Courier New", monospace',
            fontSize: '28px',
            color: '#7cba5f',
            stroke: '#2d4a1c',
            strokeThickness: 6,
            shadow: {
                offsetX: 3,
                offsetY: 3,
                color: '#1a2e12',
                blur: 0,
                fill: true
            }
        };

        this.titleText = this.add.text(width / 2, 120, 'CRAZY', titleStyle)
            .setOrigin(0.5);
        
        const subtitleStyle: Phaser.Types.GameObjects.Text.TextStyle = {
            fontFamily: '"Press Start 2P", "Courier New", monospace',
            fontSize: '36px',
            color: '#8fd464',
            stroke: '#2d4a1c',
            strokeThickness: 8,
            shadow: {
                offsetX: 4,
                offsetY: 4,
                color: '#1a2e12',
                blur: 0,
                fill: true
            }
        };

        this.add.text(width / 2, 170, 'JUMPY', subtitleStyle)
            .setOrigin(0.5);

        // 标题呼吸动画
        this.tweens.add({
            targets: this.titleText,
            scaleX: 1.05,
            scaleY: 1.05,
            duration: 1500,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });
    }

    private createMenuButtons(width: number, _height: number) {
        const buttonConfigs = [
            { text: '进入游戏', icon: '▶', action: () => this.startGame() },
            { text: '仓  库', icon: '📦', action: () => this.openWarehouse() },
            { text: '商  店', icon: '🛒', action: () => this.openShop() },
            { text: '设  置', icon: '⚙', action: () => this.openSettings() },
            { text: '关  于', icon: '❓', action: () => this.openAbout() },
        ];

        const startY = 280;
        const spacing = 95;
        const buttonWidth = 280;
        const buttonHeight = 70;

        buttonConfigs.forEach((config, index) => {
            const y = startY + index * spacing;
            const button = this.createWoodenButton(
                width / 2,
                y,
                buttonWidth,
                buttonHeight,
                config.text,
                config.icon,
                config.action
            );
            this.buttons.push(button);

            // 入场动画 - 从左侧滑入
            button.setX(-200);
            button.setAlpha(0);
            this.tweens.add({
                targets: button,
                x: width / 2,
                alpha: 1,
                duration: 400,
                delay: index * 100,
                ease: 'Back.easeOut'
            });
        });
    }

    private createWoodenButton(
        x: number,
        y: number,
        width: number,
        height: number,
        text: string,
        icon: string,
        onClick: () => void
    ): Phaser.GameObjects.Container {
        const container = this.add.container(x, y);

        // 按钮底部阴影
        const shadow = this.add.graphics();
        shadow.fillStyle(0x1a0f05, 0.6);
        shadow.fillRoundedRect(-width/2 + 4, -height/2 + 6, width, height, 8);
        container.add(shadow);

        // 按钮主体 - 木质纹理效果
        const buttonBg = this.add.graphics();
        
        // 木头底色
        buttonBg.fillStyle(0x8b5a2b, 1);
        buttonBg.fillRoundedRect(-width/2, -height/2, width, height, 8);
        
        // 木头高光（顶部）
        buttonBg.fillStyle(0xa67c52, 1);
        buttonBg.fillRoundedRect(-width/2 + 4, -height/2 + 4, width - 8, height/3, 6);
        
        // 木头暗部（底部）
        buttonBg.fillStyle(0x6b4423, 1);
        buttonBg.fillRoundedRect(-width/2 + 4, height/6, width - 8, height/3, 6);
        
        // 边框
        buttonBg.lineStyle(3, 0x4a3219, 1);
        buttonBg.strokeRoundedRect(-width/2, -height/2, width, height, 8);
        
        // 内边框高光
        buttonBg.lineStyle(2, 0xc4956a, 0.5);
        buttonBg.strokeRoundedRect(-width/2 + 3, -height/2 + 3, width - 6, height - 6, 6);
        
        container.add(buttonBg);

        // 左右装饰钉
        this.addNail(container, -width/2 + 15, 0);
        this.addNail(container, width/2 - 15, 0);

        // 图标
        const iconText = this.add.text(-width/2 + 45, 0, icon, {
            fontSize: '24px',
            color: '#3d2817'
        }).setOrigin(0.5);
        container.add(iconText);

        // 按钮文字 - 像素风格
        const buttonText = this.add.text(15, 0, text, {
            fontFamily: '"Press Start 2P", "Microsoft YaHei", sans-serif',
            fontSize: '16px',
            color: '#3d2817',
            stroke: '#c4956a',
            strokeThickness: 1
        }).setOrigin(0.5);
        container.add(buttonText);

        // 交互区域
        const hitArea = this.add.rectangle(0, 0, width, height, 0xffffff, 0);
        hitArea.setInteractive({ useHandCursor: true });
        container.add(hitArea);

        // 悬停效果
        hitArea.on('pointerover', () => {
            this.tweens.add({
                targets: container,
                scaleX: 1.05,
                scaleY: 1.05,
                duration: 100,
                ease: 'Quad.easeOut'
            });
            buttonText.setColor('#1a0f05');
        });

        hitArea.on('pointerout', () => {
            this.tweens.add({
                targets: container,
                scaleX: 1,
                scaleY: 1,
                duration: 100,
                ease: 'Quad.easeOut'
            });
            buttonText.setColor('#3d2817');
        });

        // 点击效果 - 立即调用回调，动画只是视觉反馈
        hitArea.on('pointerdown', () => {
            // 立即调用回调
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

    private addNail(container: Phaser.GameObjects.Container, x: number, y: number) {
        const nail = this.add.graphics();
        // 钉子阴影
        nail.fillStyle(0x2a1a0a, 0.5);
        nail.fillCircle(x + 2, y + 2, 6);
        // 钉子主体
        nail.fillStyle(0x5c4033, 1);
        nail.fillCircle(x, y, 6);
        // 钉子高光
        nail.fillStyle(0x8b7355, 1);
        nail.fillCircle(x - 2, y - 2, 3);
        container.add(nail);
    }

    private createDecorations(width: number) {
        // 左侧火焰
        this.createFlameEffect(width * 0.15, 200);
        // 右侧火焰
        this.createFlameEffect(width * 0.85, 200);
    }

    private createFlameEffect(x: number, y: number) {
        // 火焰容器
        const flameContainer = this.add.container(x, y);

        // 火焰底座
        const base = this.add.graphics();
        base.fillStyle(0x4a3828, 1);
        base.fillRect(-15, 20, 30, 15);
        base.fillStyle(0x3d2817, 1);
        base.fillTriangle(-20, 35, 20, 35, 0, 20);
        flameContainer.add(base);

        // 创建多层火焰粒子效果
        const flameColors = [0x00ff88, 0x44ffaa, 0x88ffcc, 0xaaffdd];
        
        for (let i = 0; i < 8; i++) {
            const flame = this.add.graphics();
            const color = flameColors[i % flameColors.length];
            flame.fillStyle(color, 0.7 - i * 0.05);
            
            // 绘制火焰形状
            const flameWidth = 20 - i * 2;
            const flameHeight = 40 - i * 3;
            flame.fillEllipse(0, -i * 5, flameWidth, flameHeight);
            
            flameContainer.add(flame);

            // 火焰摇曳动画
            this.tweens.add({
                targets: flame,
                x: Phaser.Math.Between(-5, 5),
                scaleX: Phaser.Math.FloatBetween(0.8, 1.2),
                scaleY: Phaser.Math.FloatBetween(0.9, 1.1),
                alpha: Phaser.Math.FloatBetween(0.4, 0.8),
                duration: 200 + i * 50,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut',
                delay: i * 30
            });
        }

        // 整体轻微摆动
        this.tweens.add({
            targets: flameContainer,
            x: x + Phaser.Math.Between(-3, 3),
            duration: 500,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });
    }

    private createVersionText(width: number, height: number) {
        this.add.text(width - 20, height - 20, 'v0.1.0', {
            fontFamily: '"Press Start 2P", monospace',
            fontSize: '12px',
            color: '#4a4a6a'
        }).setOrigin(1, 1);
    }

    // ========== 按钮动作 ==========

    private startGame() {
        // 淡出动画后进入游戏
        this.cameras.main.fadeOut(300, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
            this.scene.start('GameScene');
        });
    }

    private openWarehouse() {
        this.showComingSoon('仓库功能开发中...');
    }

    private openShop() {
        this.showComingSoon('商店功能开发中...');
    }

    private openSettings() {
        this.showComingSoon('设置功能开发中...');
    }

    private openAbout() {
        this.showAboutDialog();
    }

    private showComingSoon(message: string) {
        const { width, height } = this.scale;
        
        // 创建遮罩
        const overlay = this.add.rectangle(width/2, height/2, width, height, 0x000000, 0.7)
            .setInteractive();
        
        // 提示框
        const box = this.add.graphics();
        box.fillStyle(0x2a2a4a, 1);
        box.fillRoundedRect(width/2 - 150, height/2 - 60, 300, 120, 12);
        box.lineStyle(3, 0x6a6a8a, 1);
        box.strokeRoundedRect(width/2 - 150, height/2 - 60, 300, 120, 12);

        const text = this.add.text(width/2, height/2 - 15, message, {
            fontFamily: '"Microsoft YaHei", sans-serif',
            fontSize: '18px',
            color: '#ffffff'
        }).setOrigin(0.5);

        const okText = this.add.text(width/2, height/2 + 30, '[ 确定 ]', {
            fontFamily: '"Press Start 2P", monospace',
            fontSize: '14px',
            color: '#8fd464'
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        okText.on('pointerover', () => okText.setColor('#aaffaa'));
        okText.on('pointerout', () => okText.setColor('#8fd464'));
        okText.on('pointerdown', () => {
            overlay.destroy();
            box.destroy();
            text.destroy();
            okText.destroy();
        });

        overlay.on('pointerdown', () => {
            overlay.destroy();
            box.destroy();
            text.destroy();
            okText.destroy();
        });
    }

    private showAboutDialog() {
        const { width, height } = this.scale;
        
        const overlay = this.add.rectangle(width/2, height/2, width, height, 0x000000, 0.8)
            .setInteractive();
        
        const box = this.add.graphics();
        box.fillStyle(0x1a1a2e, 1);
        box.fillRoundedRect(width/2 - 180, height/2 - 120, 360, 240, 12);
        box.lineStyle(3, 0x7cba5f, 1);
        box.strokeRoundedRect(width/2 - 180, height/2 - 120, 360, 240, 12);

        const title = this.add.text(width/2, height/2 - 85, '🎮 CRAZY JUMPY', {
            fontFamily: '"Press Start 2P", monospace',
            fontSize: '16px',
            color: '#8fd464'
        }).setOrigin(0.5);

        const content = this.add.text(width/2, height/2, 
            '一款休闲跳跃游戏\n\n' +
            '按住屏幕蓄力跳跃\n' +
            '在最高点再次按住\n' +
            '完美时机释放获得最佳效果\n\n' +
            '击杀怪物收集材料！', {
            fontFamily: '"Microsoft YaHei", sans-serif',
            fontSize: '14px',
            color: '#cccccc',
            align: 'center',
            lineSpacing: 6
        }).setOrigin(0.5);

        const closeText = this.add.text(width/2, height/2 + 85, '[ 关闭 ]', {
            fontFamily: '"Press Start 2P", monospace',
            fontSize: '14px',
            color: '#8fd464'
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        closeText.on('pointerover', () => closeText.setColor('#aaffaa'));
        closeText.on('pointerout', () => closeText.setColor('#8fd464'));
        
        const closeDialog = () => {
            overlay.destroy();
            box.destroy();
            title.destroy();
            content.destroy();
            closeText.destroy();
        };
        
        closeText.on('pointerdown', closeDialog);
        overlay.on('pointerdown', closeDialog);
    }
}
