/**
 * Monster - 怪物基类
 * 
 * 管理单个怪物的状态、动画和移动逻辑
 */

import Phaser from 'phaser';
import { GameConfig } from '../config';

export type MonsterType = 'A01';

export interface MonsterConfig {
    type: MonsterType;
    x: number;
    y: number;          // 世界Y坐标 (越小=越高)
    heightMeters: number; // 高度 (米)
}

export class Monster {
    public scene: Phaser.Scene;
    public sprite: Phaser.GameObjects.Sprite;

    // 位置和状态
    public x: number;
    public y: number;
    public heightMeters: number;
    public type: MonsterType;
    public isAlive: boolean = true;

    // 通道系统
    public currentLane: number = 1;  // 0=左, 1=中, 2=右
    private screenWidth: number;

    // 移动AI
    private moveDirection: -1 | 1 = 1;  // -1=左, 1=右
    private moveSpeed: number = 40;
    private nextDirectionChange: number = 0;

    constructor(scene: Phaser.Scene, config: MonsterConfig, screenWidth: number) {
        this.scene = scene;
        this.x = config.x;
        this.y = config.y;
        this.heightMeters = config.heightMeters;
        this.type = config.type;
        this.screenWidth = screenWidth;

        // 创建精灵
        const size = GameConfig.monster.a01.size;
        this.sprite = scene.add.sprite(this.x, this.y, 'monster_a01_right_1')
            .setDisplaySize(size, size)
            .setDepth(5);

        // 随机初始方向
        this.moveDirection = Math.random() > 0.5 ? 1 : -1;
        this.moveSpeed = Phaser.Math.Between(
            GameConfig.monster.moveSpeedMin,
            GameConfig.monster.moveSpeedMax
        );

        // 设置下次方向改变时间
        this.scheduleDirectionChange();

        // 根据X位置计算初始通道
        this.updateCurrentLane();

        // 播放初始动画
        this.playDirectionAnimation();
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

        // 边界检查 - 不让怪物移出画布
        const margin = GameConfig.monster.a01.size / 2;
        if (this.x < margin) {
            this.x = margin;
            this.changeDirection();
        } else if (this.x > this.screenWidth - margin) {
            this.x = this.screenWidth - margin;
            this.changeDirection();
        }

        // 更新精灵位置
        this.sprite.setPosition(this.x, this.y);

        // 更新当前通道
        this.updateCurrentLane();
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
        this.moveSpeed = Phaser.Math.Between(
            GameConfig.monster.moveSpeedMin,
            GameConfig.monster.moveSpeedMax
        );
        this.scheduleDirectionChange();
        this.playDirectionAnimation();
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
        const animKey = this.moveDirection === 1 ? 'monster_a01_right' : 'monster_a01_left';
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
