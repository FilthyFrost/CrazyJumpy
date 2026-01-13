/**
 * MonsterManager - 怪物管理器 (纯动态生成版)
 * 
 * 设计理念：怪物只在 PERFECT 跳跃后的子弹时间区域动态生成
 * - 数量与高度挂钩（对数增长）
 * - 速度与高度挂钩（线性增长）
 * - 确保每次高光时刻都有足够的挑战和爽感
 */

import Phaser from 'phaser';
import { Monster } from './Monster';
import type { MonsterType } from './Monster';
import { GameConfig } from '../config';
import GameScene from '../scenes/GameScene';
import { PickupManager } from './PickupManager';

export class MonsterManager {
    private scene: Phaser.Scene;
    private monsters: Monster[] = [];
    private screenWidth: number;
    private groundY: number;
    private pixelsPerMeter: number;
    private pickupManager: PickupManager | null = null;

    constructor(scene: Phaser.Scene, screenWidth: number, groundY: number, pixelsPerMeter: number) {
        this.scene = scene;
        this.screenWidth = screenWidth;
        this.groundY = groundY;
        this.pixelsPerMeter = pixelsPerMeter;
    }

    /**
     * Set pickup manager reference for drop spawning
     */
    public setPickupManager(manager: PickupManager): void {
        this.pickupManager = manager;
    }

    /**
     * 初始生成怪物 - 纯动态版本不需要初始生成
     * 保留空方法以保持接口兼容
     */
    public spawnInitialMonsters(): void {
        // 纯动态生成模式：游戏开始时不生成任何怪物
        // 所有怪物都在 PERFECT 跳跃后动态生成
        if (GameConfig.debug) {
            console.log('[MonsterManager] 纯动态生成模式：跳过初始生成');
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
                // Store position and type before killing (for drops)
                const deathX = monster.x;
                const deathY = monster.y;
                const monsterType = monster.type;
                
                monster.kill();
                killCount++;

                // Spawn drops (根据怪物类型)
                if (this.pickupManager) {
                    this.pickupManager.spawnMonsterDrops(deathX, deathY, monsterType);
                }

                // Trigger Bullet Time Refund (if active)
                if (this.scene instanceof GameScene) {
                    (this.scene as any).bulletTimeManager?.onKill();
                }
            }
        }

        return killCount;
    }

    /**
     * 落地时清理所有怪物 (防刷机制)
     * 
     * 设计理念："一跳一舞台"
     * - 每次落地清空所有怪物
     * - 只有下一次 PERFECT 跳跃才会生成新怪物
     * - 防止玩家通过低跳累积怪物
     */
    public onPlayerLanded(): void {
        // 清理所有怪物（带淡出效果）
        for (const monster of this.monsters) {
            if (monster.isAlive) {
                // 淡出效果
                monster.scene.tweens.add({
                    targets: monster.sprite,
                    alpha: 0,
                    duration: 150,
                    onComplete: () => {
                        monster.destroy();
                    }
                });
                monster.isAlive = false; // 立即标记为死亡，防止碰撞
            } else {
                monster.destroy();
            }
        }
        this.monsters = [];

        if (GameConfig.debug) {
            console.log('[MonsterManager] 落地清场完成');
        }
    }

    /**
     * @deprecated 使用 onPlayerLanded() 替代
     */
    public respawnAboveMilestone(_milestoneY: number): void {
        this.onPlayerLanded();
    }

    /**
     * 获取所有存活怪物
     */
    public getAliveMonsters(): Monster[] {
        return this.monsters.filter(m => m.isAlive);
    }

    /**
     * 获取最高存活怪物的高度 (米)
     * 用于智能子弹时间结束判定
     * @returns 最高怪物高度 (米)，如果没有存活怪物返回 -1
     */
    public getHighestAliveMonsterHeight(): number {
        const aliveMonsters = this.monsters.filter(m => m.isAlive);
        if (aliveMonsters.length === 0) return -1;
        
        // heightMeters 越大 = 越高
        return Math.max(...aliveMonsters.map(m => m.heightMeters));
    }

    /**
     * 获取存活怪物数量
     */
    public getAliveMonsterCount(): number {
        return this.monsters.filter(m => m.isAlive).length;
    }

    /**
     * 动态导演系统：在 PERFECT 跳跃的顶点区域动态生成怪物
     * 
     * 核心算法：
     * 1. 数量 = baseCount + log₂(height/refHeight) × growthFactor (对数增长)
     * 2. 速度倍率 = 1.0 + (height/speedRefHeight) × speedGrowthFactor (线性增长)
     * 3. 智能分布：优先在玩家不在的通道生成
     * 
     * @param predictedApexHeightPx 预测的顶点高度 (像素)
     * @param playerLane 玩家当前所在的通道 (0=左, 1=中, 2=右)
     */
    public spawnApexMonsters(predictedApexHeightPx: number, _playerLane: number): void {
        const director = GameConfig.monster.director;
        
        // 检查是否启用动态导演系统
        if (!director?.enabled) return;

        // 计算生成区域 (米)
        const apexHeightM = predictedApexHeightPx / this.pixelsPerMeter;
        const rangeStartM = apexHeightM * director.apexRangeStart;
        
        // ===== 动态计算顶部安全区 =====
        // 公式: apexRangeEnd = minEnd + (baseEnd - minEnd) × e^(-height/tau)
        // 高度越高，安全区越大，给玩家更多时间准备按 space
        const baseEnd = director.apexRangeEndBase ?? 0.98;
        const minEnd = director.apexRangeEndMin ?? 0.91;
        const tau = director.apexRangeEndTau ?? 600;
        
        const dynamicRangeEnd = minEnd + (baseEnd - minEnd) * Math.exp(-apexHeightM / tau);
        const rangeEndM = apexHeightM * dynamicRangeEnd;

        // ===== 计算怪物数量 (对数增长) =====
        // count = baseCount + log2(height/refHeight) * countGrowthFactor
        const baseCount = director.baseCount ?? 4;
        const maxCount = director.maxCount ?? 12;
        const refHeightM = director.refHeightM ?? 50;
        const countGrowthFactor = director.countGrowthFactor ?? 2.5;

        let targetCount: number;
        if (apexHeightM <= refHeightM) {
            // 低于参考高度，使用保底数量
            targetCount = baseCount;
        } else {
            // 对数增长
            const logFactor = Math.log2(apexHeightM / refHeightM);
            targetCount = Math.floor(baseCount + logFactor * countGrowthFactor);
        }
        targetCount = Phaser.Math.Clamp(targetCount, baseCount, maxCount);

        // ===== 计算速度倍率 (线性增长) =====
        // speedMult = 1.0 + (height/speedRefHeight) * speedGrowthFactor
        const speedRefHeightM = director.speedRefHeightM ?? 400;
        const speedGrowthFactor = director.speedGrowthFactor ?? 1.5;
        const maxSpeedMult = director.maxSpeedMultiplier ?? 3.0;

        let speedMultiplier = 1.0 + (apexHeightM / speedRefHeightM) * speedGrowthFactor;
        speedMultiplier = Math.min(speedMultiplier, maxSpeedMult);

        // ===== 清理该区域内的旧怪物 (避免重叠) =====
        // 只清理在生成区域内的怪物，保留其他区域的
        this.monsters = this.monsters.filter(m => {
            if (!m.isAlive) return false;
            const inRange = m.heightMeters >= rangeStartM - 5 && m.heightMeters <= rangeEndM + 5;
            if (inRange) {
                m.destroy();
                return false;
            }
            return true;
        });

        // ===== 动态间距系统 =====
        // 根据高度计算基础间距 (高度越高，间距越大)
        const dynamicSpacingCfg = director.dynamicSpacing;
        let baseSpacing = director.minSpacingMeters ?? 5;
        
        if (dynamicSpacingCfg?.enabled) {
            const baseM = dynamicSpacingCfg.baseSpacingM ?? 5;
            const refHeight = dynamicSpacingCfg.heightRefM ?? 500;
            const heightFactor = dynamicSpacingCfg.heightFactor ?? 0.5;
            const maxBonus = dynamicSpacingCfg.heightMaxBonus ?? 1.5;
            
            // 高度加成: (height / refHeight) × factor，上限 maxBonus
            const heightBonus = Math.min((apexHeightM / refHeight) * heightFactor, maxBonus);
            baseSpacing = baseM * (1 + heightBonus);
        }
        
        const rangeSpan = rangeEndM - rangeStartM;
        
        if (rangeSpan < baseSpacing) {
            if (GameConfig.debug) {
                console.log(`[Director] 区域太小，无法生成怪物: ${rangeSpan.toFixed(1)}m < ${baseSpacing.toFixed(1)}m`);
            }
            return;
        }

        // ===== 动态生成系统 =====
        // 不预先生成高度列表，而是逐只生成，确保间距正确
        // 核心原则：
        // 1. 所有通道都可以生成怪物，但中间通道要偏移避开玩家上升路径
        // 2. 每只怪物根据自己的高度判断难度
        // 3. 同侧/对角时增加Y轴间距

        const laneWidth = this.screenWidth / GameConfig.lane.count;
        const screenCenterX = this.screenWidth / 2;
        const avoidCenterRadius = laneWidth * 0.2; // 避开屏幕中心的半径
        
        // 获取配置
        const difficultyCurve = director.difficultyCurve as [number, number][] | undefined;
        const sameSideBonus = dynamicSpacingCfg?.sameSideBonus ?? 1.0;
        const diagonalBonus = dynamicSpacingCfg?.diagonalBonus ?? 1.2;
        
        // 追踪上一只怪物
        let prevLane: number | null = null;
        let lastSpawnHeightM = rangeStartM;
        
        // 根据高度获取交替概率 (分段线性插值)
        const getAlternateChance = (heightM: number): number => {
            if (!difficultyCurve || difficultyCurve.length < 2) return 0.5;
            
            // 找到当前高度所在的区间并线性插值
            for (let i = 0; i < difficultyCurve.length - 1; i++) {
                const [h1, c1] = difficultyCurve[i];
                const [h2, c2] = difficultyCurve[i + 1];
                
                if (heightM <= h2) {
                    // 在这个区间内，进行线性插值
                    if (h2 === h1) return c1; // 避免除以0
                    const t = (heightM - h1) / (h2 - h1);
                    return c1 + (c2 - c1) * t;
                }
            }
            
            // 超过最后一个点，返回最后一个值
            return difficultyCurve[difficultyCurve.length - 1][1];
        };

        let spawnedCount = 0;
        
        while (spawnedCount < targetCount && lastSpawnHeightM < rangeEndM) {
            // ===== 分层难度通道选择 =====
            let lane: number;
            const alternateChance = getAlternateChance(lastSpawnHeightM);
            
            if (prevLane === null) {
                // 第一只怪：随机三个通道
                lane = Phaser.Math.Between(0, 2);
            } else if (Math.random() < alternateChance) {
                // 交替模式：优先选择与上一只不同的通道
                const otherLanes = [0, 1, 2].filter(l => l !== prevLane);
                lane = otherLanes[Math.floor(Math.random() * otherLanes.length)];
            } else {
                // 非交替：完全随机（可能同侧）
                lane = Phaser.Math.Between(0, 2);
            }
            
            // ===== 计算当前怪物的间距 =====
            let currentSpacing = baseSpacing;
            
            if (prevLane !== null) {
                // 同侧加成 (同一通道)
                if (lane === prevLane) {
                    currentSpacing = baseSpacing * (1 + sameSideBonus);
                }
                // 对角加成 (左↔右，跨两个通道)
                else if (Math.abs(lane - prevLane) === 2) {
                    currentSpacing = baseSpacing * (1 + diagonalBonus);
                }
                // 相邻通道：基础间距
            }
            
            // 计算这只怪物的高度
            const heightM = lastSpawnHeightM + currentSpacing;
            
            // 检查是否超出范围
            if (heightM > rangeEndM) {
                break; // 区域已满，停止生成
            }
            
            prevLane = lane;
            lastSpawnHeightM = heightM;
            spawnedCount++;

            // 计算位置 - 在通道内随机偏移
            let laneOffset = Phaser.Math.FloatBetween(-laneWidth * 0.15, laneWidth * 0.15);
            let x = (lane + 0.5) * laneWidth + laneOffset;
            
            // ===== 中间通道特殊处理：避开屏幕正中心 =====
            if (lane === 1) {
                // 如果太靠近屏幕中心，随机偏向左或右
                if (Math.abs(x - screenCenterX) < avoidCenterRadius) {
                    const offsetDirection = Math.random() < 0.5 ? -1 : 1;
                    x = screenCenterX + offsetDirection * (avoidCenterRadius + laneWidth * 0.1);
                }
            }
            const worldY = this.groundY - (heightM * this.pixelsPerMeter);

            // ===== 根据高度选择怪物类型 =====
            const monsterType = this.selectMonsterType(heightM);

            // 创建怪物 (带速度倍率)
            const monster = new Monster(this.scene, {
                type: monsterType,
                x: Phaser.Math.Clamp(x, 30, this.screenWidth - 30),
                y: worldY,
                heightMeters: heightM,
                speedMultiplier: speedMultiplier,
            }, this.screenWidth);

            this.monsters.push(monster);
        }

        if (GameConfig.debug) {
            const safeZonePercent = ((1 - dynamicRangeEnd) * 100).toFixed(1);
            const alternateChance = getAlternateChance(apexHeightM);
            console.log(`[Director] ${spawnedCount}怪 | 高度:${apexHeightM.toFixed(0)}m | 交替率:${(alternateChance * 100).toFixed(0)}% | 间距:${baseSpacing.toFixed(1)}m | 安全区:${safeZonePercent}%`);
        }
    }

    /**
     * 根据高度选择怪物类型
     * 
     * 概率曲线设计（平滑过渡，无空窗期）：
     * 
     * A01 (史莱姆) - 低空基础怪:
     *   - 0-200m:   100%
     *   - 200-600m: 线性下降 100% → 0%
     *   - 600m+:    0%
     * 
     * A02 (蝙蝠) - 中空过渡怪:
     *   - 0-200m:     0%
     *   - 200-600m:   线性上升 0% → 100%
     *   - 600-1000m:  指数下降 100% → ~5%
     *   - 1000m+:     0%
     * 
     * A03 (骷髅) - 高空精英:
     *   - 0-600m:    0%
     *   - 600-1000m: 线性上升 0% → 100%
     *   - 1000m+:    100% (高空主力)
     * 
     * @param heightM 怪物生成高度 (米)
     * @returns 选中的怪物类型
     */
    private selectMonsterType(heightM: number): MonsterType {
        // ===== A01 概率计算 (0-600m) =====
        let a01Weight = 0;
        if (heightM < 200) {
            // 0-200m: 100%
            a01Weight = 1.0;
        } else if (heightM < 600) {
            // 200-600m: 线性下降 100% → 0%
            const progress = (heightM - 200) / (600 - 200);
            a01Weight = 1.0 - progress;
        }
        // 600m+: 0%

        // ===== A02 概率计算 (200-1000m) =====
        let a02Weight = 0;
        if (heightM >= 200 && heightM < 600) {
            // 200-600m: 线性上升 0% → 100%
            const progress = (heightM - 200) / (600 - 200);
            a02Weight = progress;
        } else if (heightM >= 600 && heightM < 1000) {
            // 600-1000m: 指数下降 100% → ~5%
            const progress = (heightM - 600) / (1000 - 600);
            a02Weight = Math.exp(-3 * progress);
        }
        // 1000m+: 0%

        // ===== A03 概率计算 (600m+) =====
        let a03Weight = 0;
        if (heightM >= 600 && heightM < 1000) {
            // 600-1000m: 线性上升 0% → 100%
            const progress = (heightM - 600) / (1000 - 600);
            a03Weight = progress;
        } else if (heightM >= 1000) {
            // 1000m+: 100% (高空主力)
            a03Weight = 1.0;
        }

        // ===== 收集候选者 =====
        const candidates: { type: MonsterType; weight: number }[] = [];
        
        if (a01Weight > 0.01) {
            candidates.push({ type: 'A01', weight: a01Weight });
        }
        if (a02Weight > 0.01) {
            candidates.push({ type: 'A02', weight: a02Weight });
        }
        if (a03Weight > 0.01) {
            candidates.push({ type: 'A03', weight: a03Weight });
        }

        // 如果没有候选者（边界情况），默认A03（高空应该有A03）
        if (candidates.length === 0) {
            console.log(`[Monster] No candidates at ${heightM.toFixed(0)}m, defaulting to A03`);
            return 'A03';
        }

        // ===== 根据权重随机选择 =====
        const totalWeight = candidates.reduce((sum, c) => sum + c.weight, 0);
        let random = Math.random() * totalWeight;

        for (const candidate of candidates) {
            random -= candidate.weight;
            if (random <= 0) {
                console.log(`[Monster] ${heightM.toFixed(0)}m → ${candidate.type} (A01:${(a01Weight*100).toFixed(0)}% A02:${(a02Weight*100).toFixed(0)}% A03:${(a03Weight*100).toFixed(0)}%)`);
                return candidate.type;
            }
        }

        return candidates[0].type;
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
