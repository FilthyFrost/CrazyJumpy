import Phaser from 'phaser';
import { Pickup } from './Pickup';
import type { PickupType } from './Pickup';
import { InventoryManager } from '../managers/InventoryManager';

/**
 * PickupManager - 掉落物品管理器
 * 
 * 负责：
 * - 生成掉落物品
 * - 更新所有物品的追踪逻辑
 * - 统计玩家收集的资源
 */
export class PickupManager {
    private scene: Phaser.Scene;
    private pickups: Pickup[] = [];
    private inventory: InventoryManager | null = null;

    // Player stats (collected resources)
    public coins: number = 0;
    public gems: number = 0;      // A01材料
    public wings: number = 0;     // A02翅膀材料

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
    }

    public setInventoryManager(inventory: InventoryManager) {
        this.inventory = inventory;
    }

    /**
     * Spawn pickup at position
     * @param type Pickup type
     * @param x X position
     * @param y Y position
     */
    public spawn(type: PickupType, x: number, y: number, opts?: { 
        noAttractDelay?: number; 
        disableAttract?: boolean; 
        stayOnGround?: boolean;
        ejectVxOverride?: number;
        ejectVyOverride?: number;
        groundY?: number;
    }): void {
        // 调试日志
        if (opts?.ejectVxOverride !== undefined) {
            console.log('[PickupManager] spawn death eject:', type, 'at', x.toFixed(0), y.toFixed(0), 'vx:', opts.ejectVxOverride?.toFixed(0), 'vy:', opts.ejectVyOverride?.toFixed(0), 'groundY:', opts.groundY?.toFixed(0));
        }
        
        const pickup = new Pickup(this.scene, { 
            type, x, y, 
            noAttractDelay: opts?.noAttractDelay, 
            disableAttract: opts?.disableAttract, 
            stayOnGround: opts?.stayOnGround,
            ejectVxOverride: opts?.ejectVxOverride,
            ejectVyOverride: opts?.ejectVyOverride,
            groundY: opts?.groundY,
        });
        this.pickups.push(pickup);
    }

    // 材料掉落倍率 (NORMAL判定时设为0.5)
    public materialDropMultiplier: number = 1.0;

    /**
     * Spawn drops from monster death
     * 
     * 掉落设计：
     * - A01 (史莱姆): 100%掉1铜币，50%掉材料(gem)
     * - A02 (蝙蝠):   100%掉1铜币 + 60%额外铜币，20%掉翅膀(wing)
     * - A03 (骷髅):   100%掉2铜币，40%掉翅膀(wing)
     * - CloudA (云怪): 100%掉1铜币，35%掉材料(gem)
     * 
     * NORMAL 判定时：铜币掉率不变，材料掉率减半
     * 
     * @param x Monster death X position
     * @param y Monster death Y position
     * @param monsterType Type of monster (A01, A02, A03, CloudA, etc.)
     */
    public spawnMonsterDrops(x: number, y: number, monsterType: string = 'A01'): void {
        // 材料掉率乘以倍率 (NORMAL判定时为0.5)
        const matMult = this.materialDropMultiplier;
        
        if (monsterType === 'A01') {
            // ===== A01 史莱姆掉落 =====
            // 100% 掉落 1 个铜币
            this.spawnWithOffset('coin', x, y);
            
            // 50% × matMult 概率掉落材料 (gem)
            if (Math.random() < 0.5 * matMult) {
                this.spawnWithOffset('gem', x, y);
            }
        } else if (monsterType === 'A02') {
            // ===== A02 蝙蝠掉落 =====
            // 100% 掉落第 1 个铜币
            this.spawnWithOffset('coin', x, y);
            
            // 60% 概率掉落第 2 个铜币 (铜币不受倍率影响)
            if (Math.random() < 0.6) {
                this.spawnWithOffset('coin', x, y);
            }
            
            // 20% × matMult 概率掉落翅膀材料 (wing)
            if (Math.random() < 0.2 * matMult) {
                this.spawnWithOffset('wing', x, y);
            }
        } else if (monsterType === 'A03') {
            // ===== A03 骷髅掉落 (高空精英) =====
            // 100% 掉落 2 个铜币
            this.spawnWithOffset('coin', x, y);
            this.spawnWithOffset('coin', x, y);
            
            // 40% × matMult 概率掉落翅膀材料 (wing)
            if (Math.random() < 0.4 * matMult) {
                this.spawnWithOffset('wing', x, y);
            }
        } else if (monsterType === 'CloudA') {
            // ===== CloudA 云怪掉落 =====
            // 100% 掉落 1 个铜币
            this.spawnWithOffset('coin', x, y);
            
            // 35% × matMult 概率掉落材料 (gem)
            if (Math.random() < 0.35 * matMult) {
                this.spawnWithOffset('gem', x, y);
            }
        } else {
            // 默认掉落
            this.spawnWithOffset('coin', x, y);
        }
    }
    
    /**
     * Spawn pickup with random offset
     */
    private spawnWithOffset(type: PickupType, x: number, y: number): void {
        const offsetX = Phaser.Math.FloatBetween(-20, 20);
        const offsetY = Phaser.Math.FloatBetween(-15, 15);
        this.spawn(type, x + offsetX, y + offsetY);
    }

    /**
     * Update all pickups
     * @param dt Delta time in seconds
     * @param playerX Player X position
     * @param playerY Player Y position
     * @param playerSpeed Player current speed (absolute value, px/s)
     */
    public update(dt: number, playerX: number, playerY: number, playerSpeed: number = 0): void {
        const inv = this.inventory;

        // Update all pickups and collect dead ones
        this.pickups = this.pickups.filter(pickup => {
            if (inv) {
                const canAccept = inv.canAdd(pickup.type, 1);
                if (!canAccept) {
                    pickup.disableAttract(); // 停留地面，不再吸附
                } else {
                    pickup.enableAttract();
                }
            }

            const wasCollected = pickup.update(dt, playerX, playerY, playerSpeed);
            
            if (wasCollected) {
                if (inv) {
                    const { added } = inv.add(pickup.type, 1);
                    if (added > 0) {
                        this.applyStats(pickup.type, added);
                    }
                } else {
                    this.applyStats(pickup.type, 1);
                }
            }

            return pickup.isAlive;
        });
    }

    private applyStats(type: PickupType, count: number): void {
        switch (type) {
            case 'coin':
                this.coins += count;
                break;
            case 'gem':
                this.gems += count;
                break;
            case 'wing':
                this.wings += count;
                break;
        }
    }

    /**
     * Clear all pickups (on game reset)
     */
    public clear(): void {
        for (const pickup of this.pickups) {
            pickup.destroy();
        }
        this.pickups = [];
    }

    /**
     * Reset stats (on game restart)
     */
    public reset(): void {
        this.clear();
        this.coins = 0;
        this.gems = 0;
        this.wings = 0;
    }

    /**
     * Get pickup counts
     */
    public getStats(): { coins: number; gems: number; wings: number } {
        return { coins: this.coins, gems: this.gems, wings: this.wings };
    }
}
