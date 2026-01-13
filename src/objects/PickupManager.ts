import Phaser from 'phaser';
import { Pickup } from './Pickup';
import type { PickupType } from './Pickup';

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

    // Player stats (collected resources)
    public coins: number = 0;
    public gems: number = 0;      // A01材料
    public wings: number = 0;     // A02翅膀材料

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
    }

    /**
     * Spawn pickup at position
     * @param type Pickup type
     * @param x X position
     * @param y Y position
     */
    public spawn(type: PickupType, x: number, y: number): void {
        const pickup = new Pickup(this.scene, { type, x, y });
        this.pickups.push(pickup);
    }

    /**
     * Spawn drops from monster death
     * 
     * 掉落设计：
     * - A01 (史莱姆): 100%掉1铜币，50%掉材料(gem)
     * - A02 (蝙蝠):   100%掉1铜币 + 60%额外铜币，20%掉翅膀(wing)
     * - A03 (骷髅):   100%掉2铜币，40%掉翅膀(wing)
     * 
     * @param x Monster death X position
     * @param y Monster death Y position
     * @param monsterType Type of monster (A01, A02, A03, etc.)
     */
    public spawnMonsterDrops(x: number, y: number, monsterType: string = 'A01'): void {
        if (monsterType === 'A01') {
            // ===== A01 史莱姆掉落 =====
            // 100% 掉落 1 个铜币
            this.spawnWithOffset('coin', x, y);
            
            // 50% 概率掉落材料 (gem)
            if (Math.random() < 0.5) {
                this.spawnWithOffset('gem', x, y);
            }
        } else if (monsterType === 'A02') {
            // ===== A02 蝙蝠掉落 =====
            // 100% 掉落第 1 个铜币
            this.spawnWithOffset('coin', x, y);
            
            // 60% 概率掉落第 2 个铜币
            if (Math.random() < 0.6) {
                this.spawnWithOffset('coin', x, y);
            }
            
            // 20% 概率掉落翅膀材料 (wing)
            if (Math.random() < 0.2) {
                this.spawnWithOffset('wing', x, y);
            }
        } else if (monsterType === 'A03') {
            // ===== A03 骷髅掉落 (高空精英) =====
            // 100% 掉落 2 个铜币
            this.spawnWithOffset('coin', x, y);
            this.spawnWithOffset('coin', x, y);
            
            // 40% 概率掉落翅膀材料 (wing)
            if (Math.random() < 0.4) {
                this.spawnWithOffset('wing', x, y);
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
        // Update all pickups and collect dead ones
        this.pickups = this.pickups.filter(pickup => {
            const wasCollected = pickup.update(dt, playerX, playerY, playerSpeed);
            
            if (wasCollected) {
                switch (pickup.type) {
                    case 'coin':
                        this.coins++;
                        break;
                    case 'gem':
                        this.gems++;
                        break;
                    case 'wing':
                        this.wings++;
                        break;
                }
            }

            return pickup.isAlive;
        });
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
