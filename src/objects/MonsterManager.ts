/**
 * MonsterManager - 怪物管理器
 * 
 * 负责怪物的生成、更新、碰撞检测和重新刷新
 */

import Phaser from 'phaser';
import { Monster, type MonsterType } from './Monster';
import { GameConfig } from '../config';
import GameScene from '../scenes/GameScene';

export class MonsterManager {
    private scene: Phaser.Scene;
    private monsters: Monster[] = [];
    private screenWidth: number;
    private groundY: number;
    private pixelsPerMeter: number;

    constructor(scene: Phaser.Scene, screenWidth: number, groundY: number, pixelsPerMeter: number) {
        this.scene = scene;
        this.screenWidth = screenWidth;
        this.groundY = groundY;
        this.pixelsPerMeter = pixelsPerMeter;
    }

    /**
     * 初始生成怪物 (游戏开始时调用)
     */
    public spawnInitialMonsters(): void {
        this.spawnMonstersInRange(
            GameConfig.monster.a01.minHeight,
            GameConfig.monster.a01.maxHeight,
            'A01'
        );
    }

    /**
     * 在指定高度范围内生成怪物
     */
    private spawnMonstersInRange(minHeightM: number, maxHeightM: number, type: MonsterType): void {
        const minSpacingM = GameConfig.monster.minSpacing;
        const probability = GameConfig.monster.a01.spawnProbability;

        // 已占用的Y高度 (米)
        const occupiedHeights: number[] = this.monsters
            .filter(m => m.isAlive)
            .map(m => m.heightMeters);

        // 每10米检查一次是否生成
        for (let heightM = minHeightM; heightM <= maxHeightM; heightM += minSpacingM) {
            // 概率判定
            if (Math.random() > probability) continue;

            // 检查是否和已有怪物距离太近
            const tooClose = occupiedHeights.some(h => Math.abs(h - heightM) < minSpacingM);
            if (tooClose) continue;

            // 随机选择通道 (0, 1, 2)
            const lane = Phaser.Math.Between(0, GameConfig.lane.count - 1);
            const laneWidth = this.screenWidth / GameConfig.lane.count;
            const x = (lane + 0.5) * laneWidth;

            // 世界Y坐标 (向上为负)
            const worldY = this.groundY - (heightM * this.pixelsPerMeter);

            // 创建怪物
            const monster = new Monster(this.scene, {
                type,
                x,
                y: worldY,
                heightMeters: heightM,
            }, this.screenWidth);

            this.monsters.push(monster);
            occupiedHeights.push(heightM);
        }
    }

    /**
     * Update all monsters
     */
    public update(dt: number): void {
        const currentTime = this.scene.time.now;
        for (const monster of this.monsters) {
            if (monster.isAlive) {
                monster.update(dt, currentTime);
            }
        }
    }

    /**
     * Check collision between player and ANY monster
     * Returns true if collision occurred (and player should die)
     * Respetcs "Ghost Mode" (ignore collision if ascending)
     */
    public checkPlayerCollision(playerX: number, playerY: number, playerRadius: number, isAscending: boolean): boolean {
        // Ghost Mode: Player passes through monsters when ascending
        if (isAscending) return false;

        const monsterRadius = GameConfig.monster.a01.size / 1.2;
        const collisionThresholdSq = (playerRadius + monsterRadius) * (playerRadius + monsterRadius);

        for (const monster of this.monsters) {
            if (!monster.isAlive) continue;

            const dx = monster.x - playerX;
            const dy = monster.y - playerY;
            const distSq = dx * dx + dy * dy;

            if (distSq < collisionThresholdSq) {
                return true; // Collision detected
            }
        }

        return false;
    }

    /**
     * 扇形碰撞检测 - 在玩家攻击方向的扇形区域内击杀怪物
     * @param swipeDirection 滑动方向 (-1=左, 1=右)
     * @param playerX 玩家X坐标（攻击命中帧时的位置）
     * @param playerY 玩家Y坐标（攻击命中帧时的位置）
     * @returns 击杀的怪物数量
     */
    public checkSectorCollision(swipeDirection: -1 | 1, playerX: number, playerY: number): number {
        let killCount = 0;

        // 扇形范围参数
        const hitRangeYMeters = 2;   // Y轴容差：±2米
        const hitRangeXPixels = 150;  // X轴攻击范围：120像素
        const hitRangeYPixels = hitRangeYMeters * this.pixelsPerMeter;

        for (const monster of this.monsters) {
            if (!monster.isAlive) continue;

            // 检查怪物是否在滑动方向上且在X范围内
            // 改进：增加 "背身容错" (Backwards Tolerance)。
            // 在知名动作游戏中，攻击判定通常会向身后延伸一小段距离，
            // 确保与玩家重叠或刚好贴在背后的怪物也能被击中，提供更好的打击手感。

            const xDistance = monster.x - playerX;
            const backTolerance = 30; // 30px 容错距离

            // 判定逻辑：
            // 左滑 (-1): 距离应该在 [-Range, +Tolerance] 之间
            // 右滑 (+1): 距离应该在 [-Tolerance, +Range] 之间
            const isInDirection = swipeDirection === -1
                ? (xDistance > -hitRangeXPixels && xDistance < backTolerance)
                : (xDistance > -backTolerance && xDistance < hitRangeXPixels);

            if (!isInDirection) continue;

            // 检查Y轴距离是否在扇形范围内
            const yDistance = Math.abs(monster.y - playerY);
            if (yDistance < hitRangeYPixels) {
                monster.kill();
                killCount++;

                // Trigger Bullet Time Refund (if active)
                if (this.scene instanceof GameScene) {
                    (this.scene as any).bulletTimeManager?.onKill();
                }
            }
        }

        return killCount;
    }

    /**
     * Clear monsters BELOW the milestone line (keeping higher/harder ones)
     * @param milestoneY World Y coordinate of the milestone (smaller Y = higher)
     */
    public respawnAboveMilestone(milestoneY: number): void {
        // Remove monsters BELOW the milestone (Y > milestoneY means lower in world space)
        // We want to KEEP monsters ABOVE (Y < milestoneY)
        const belowMilestone = this.monsters.filter(m => m.y > milestoneY);
        for (const monster of belowMilestone) {
            monster.destroy();
        }

        // Keep monsters ABOVE the milestone line
        this.monsters = this.monsters.filter(m => m.y <= milestoneY);

        // Optionally: Spawn new monsters above if sparse? 
        // For now, just clearing old ones is enough as per requirement.
        // 计算里程碑高度 (米)
        const milestoneHeightM = (this.groundY - milestoneY) / this.pixelsPerMeter;

        // 在里程碑线以上重新生成怪物
        const maxHeightM = GameConfig.monster.a01.maxHeight;
        if (milestoneHeightM < maxHeightM) {
            this.spawnMonstersInRange(
                Math.max(GameConfig.monster.a01.minHeight, milestoneHeightM + GameConfig.monster.minSpacing),
                maxHeightM,
                'A01'
            );
        }
    }

    /**
     * 获取所有存活怪物
     */
    public getAliveMonsters(): Monster[] {
        return this.monsters.filter(m => m.isAlive);
    }

    /**
     * 清理所有怪物
     */
    public clear(): void {
        for (const monster of this.monsters) {
            monster.destroy();
        }
        this.monsters = [];
    }
}
