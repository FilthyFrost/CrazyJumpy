/**
 * Monster - 怪物基类
 * 
 * 支持多种怪物类型：
 * - A01: 史莱姆 (0-600m，基础怪物)
 * - A02: 蝙蝠 (200-1000m，中空精英)
 * - A03: 骷髅 (600m+，高空精英)
 */

import Phaser from 'phaser';
import { GameConfig } from '../config';

export type MonsterType = 'A01' | 'A02' | 'A03' | 'CloudA';

export interface MonsterConfig {
    type: MonsterType;
    x: number;
    y: number;          // 世界Y坐标 (越小=越高)
    heightMeters: number; // 高度 (米)
    speedMultiplier?: number; // 速度倍率 (默认1.0)
}

export class Monster {
    private static NEXT_ID = 1;

    public scene: Phaser.Scene;
    public sprite: Phaser.GameObjects.Sprite;
    public id: number;

    // 位置和状态
    public x: number;
    public y: number;
    public heightMeters: number;
    public type: MonsterType;
    public isAlive: boolean = true;
    // Debuff判定节流，避免同一帧/连续帧重复触发
    public nextDebuffTime: number = 0;
    // 被击杀后短暂忽略debuff检测（保险）
    public noDebuffUntil: number = 0;

    // 通道系统
    public currentLane: number = 1;  // 0=左, 1=中, 2=右 (创建时固定，不会改变)
    private screenWidth: number;

    // 移动AI
    private moveDirection: -1 | 1 = 1;  // -1=左, 1=右
    private moveSpeed: number = 40;
    private speedMultiplier: number = 1.0; // 速度倍率 (高度越高越快)
    private nextDirectionChange: number = 0;

    constructor(scene: Phaser.Scene, config: MonsterConfig, screenWidth: number) {
        this.scene = scene;
        this.id = Monster.NEXT_ID++;
        this.x = config.x;
        this.y = config.y;
        this.heightMeters = config.heightMeters;
        this.type = config.type;
        this.screenWidth = screenWidth;
        this.speedMultiplier = config.speedMultiplier ?? 1.0;

        // 根据类型获取配置
        const typeConfig = this.getTypeConfig();
        const size = typeConfig.size;

        // 创建精灵 - 根据类型选择初始纹理
        let textureKey: string;
        switch (this.type) {
            case 'A02': textureKey = 'monster_a02_right_1'; break;
            case 'A03': textureKey = 'monster_a03_right_1'; break;
            case 'CloudA': textureKey = 'monster_clouda_right_1'; break;
            default:    textureKey = 'monster_a01_right_1'; break;
        }
        this.sprite = scene.add.sprite(this.x, this.y, textureKey)
            .setDisplaySize(size, size)
            .setDepth(5);

        // 随机初始方向
        this.moveDirection = Math.random() > 0.5 ? 1 : -1;
        this.updateMoveSpeed();

        // 设置下次方向改变时间
        this.scheduleDirectionChange();

        // 根据X位置计算初始通道
        this.updateCurrentLane();

        // 播放初始动画
        this.playDirectionAnimation();
    }

    /**
     * 获取怪物类型配置
     */
    private getTypeConfig(): { size: number; frameRate: number } {
        switch (this.type) {
            case 'A02':
                return {
                    size: GameConfig.monster.a02?.size ?? 48,
                    frameRate: GameConfig.monster.a02?.frameRate ?? 10,
                };
            case 'A03':
                return {
                    size: GameConfig.monster.a03?.size ?? 48,
                    frameRate: GameConfig.monster.a03?.frameRate ?? 8,
                };
            case 'CloudA':
                return {
                    size: GameConfig.monster.cloudA?.size ?? 52,
                    frameRate: GameConfig.monster.cloudA?.frameRate ?? 10,
                };
            case 'A01':
            default:
                return {
                    size: GameConfig.monster.a01?.size ?? 48,
                    frameRate: GameConfig.monster.a01?.frameRate ?? 8,
                };
        }
    }

    /**
     * 更新移动速度 (考虑高度倍率)
     */
    private updateMoveSpeed(): void {
        const baseSpeed = Phaser.Math.Between(
            GameConfig.monster.moveSpeedMin,
            GameConfig.monster.moveSpeedMax
        );
        // A02 (蝙蝠) 移动速度稍快
        const typeBonus = this.type === 'A02' ? 1.3 : 1.0;
        this.moveSpeed = baseSpeed * this.speedMultiplier * typeBonus;
    }

    /**
     * 更新怪物状态
     */
    public update(dt: number, currentTime: number): void {
        if (!this.isAlive) return;

        // 检查是否需要改变方向
        if (currentTime >= this.nextDirectionChange) {
            this.changeDirection();
        }

        // 移动
        const moveAmount = this.moveDirection * this.moveSpeed * dt;
        this.x += moveAmount;

        // ===== 边界检查 - 怪物只能在自己通道内活动 =====
        const laneCount = GameConfig.lane.count ?? 3;
        const laneWidth = this.screenWidth / laneCount;
        
        // 计算当前通道的边界 - 25%边距确保怪物始终在攻击范围内
        const laneLeftBound = this.currentLane * laneWidth + laneWidth * 0.25;
        const laneRightBound = (this.currentLane + 1) * laneWidth - laneWidth * 0.25;
        
        if (this.x < laneLeftBound) {
            this.x = laneLeftBound;
            this.changeDirection();
        } else if (this.x > laneRightBound) {
            this.x = laneRightBound;
            this.changeDirection();
        }

        // 更新精灵位置
        this.sprite.setPosition(this.x, this.y);
    }

    /**
     * 根据X位置计算当前通道
     */
    private updateCurrentLane(): void {
        const laneWidth = this.screenWidth / GameConfig.lane.count;
        const newLane = Math.floor(this.x / laneWidth);
        this.currentLane = Phaser.Math.Clamp(newLane, 0, GameConfig.lane.count - 1);
    }

    /**
     * 改变移动方向
     */
    private changeDirection(): void {
        this.moveDirection = this.moveDirection === 1 ? -1 : 1;
        this.updateMoveSpeed();
        this.scheduleDirectionChange();
        // CloudA 使用中间过渡帧，避免左右切换过于生硬
        if (this.type === 'CloudA') {
            this.sprite.setTexture('monster_clouda_middle');
            // 短暂展示后再切换到新方向动画
            this.scene.time.delayedCall(80, () => {
                if (!this.isAlive) return;
                this.playDirectionAnimation();
            });
        } else {
            this.playDirectionAnimation();
        }
    }

    /**
     * 安排下次方向改变
     */
    private scheduleDirectionChange(): void {
        const interval = GameConfig.monster.directionChangeInterval;
        const variance = GameConfig.monster.directionChangeVariance;
        const delay = interval + Phaser.Math.Between(-variance, variance);
        this.nextDirectionChange = this.scene.time.now + Math.max(500, delay);
    }

    /**
     * 播放对应方向的动画
     */
    private playDirectionAnimation(): void {
        // 根据类型选择动画前缀
        let prefix: string;
        switch (this.type) {
            case 'A02': prefix = 'monster_a02'; break;
            case 'A03': prefix = 'monster_a03'; break;
            case 'CloudA': prefix = 'monster_clouda'; break;
            default:    prefix = 'monster_a01'; break;
        }
        const animKey = this.moveDirection === 1 ? `${prefix}_right` : `${prefix}_left`;
        
        if (this.sprite.anims.currentAnim?.key !== animKey) {
            this.sprite.play(animKey);
        }
    }

    /**
     * 击杀怪物
     */
    public kill(): void {
        if (!this.isAlive) return;
        this.isAlive = false;

        // 简单的死亡效果 - 淡出
        this.scene.tweens.add({
            targets: this.sprite,
            alpha: 0,
            scale: 1.5,
            duration: 200,
            onComplete: () => {
                this.sprite.destroy();
            }
        });
    }

    /**
     * 销毁怪物 (不播放动画)
     */
    public destroy(): void {
        this.isAlive = false;
        this.sprite.destroy();
    }
}
