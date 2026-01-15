import Phaser from 'phaser';
import type { PickupType } from '../objects/Pickup';
import { PickupManager } from '../objects/PickupManager';

export interface InventorySlot {
    type: PickupType | null;
    count: number; // 0 when empty
}

/**
 * InventoryManager - 简单背包/堆叠系统
 * - 固定 8x8 = 64 格，每格同类堆叠最多 10 个
 * - add/canAdd 按堆叠逻辑尝试放入
 * - dropAll 可在角色死亡时把全部物品抛洒成掉落物
 */
export class InventoryManager {
    public readonly columns = 4;
    public readonly rows = 4;
    public readonly stackSize = 10;
    
    // 测试模式：只开放前 2 个格子
    public readonly unlockedSlots = 2;

    private slots: InventorySlot[];
    private pickupManager: PickupManager | null = null;

    constructor() {
        this.slots = Array.from({ length: this.columns * this.rows }, () => ({ type: null, count: 0 }));
    }
    
    /** 检查某个格子是否已解锁 */
    public isSlotUnlocked(index: number): boolean {
        return index < this.unlockedSlots;
    }

    public setPickupManager(manager: PickupManager) {
        this.pickupManager = manager;
    }

    public getSlots(): InventorySlot[] {
        return this.slots;
    }

    /**
     * 检查是否能完整放入 amount 个指定物品
     * 只检查已解锁的格子
     */
    public canAdd(type: PickupType, amount: number): boolean {
        let need = amount;
        // 先看已有同类堆叠的剩余空间（只看已解锁格子）
        for (let i = 0; i < this.unlockedSlots; i++) {
            const slot = this.slots[i];
            if (slot.type === type && slot.count < this.stackSize) {
                const space = this.stackSize - slot.count;
                need -= space;
                if (need <= 0) return true;
            }
        }
        // 再看空格子数量（只看已解锁格子）
        let emptyCount = 0;
        for (let i = 0; i < this.unlockedSlots; i++) {
            const slot = this.slots[i];
            if (!slot.type || slot.count === 0) {
                emptyCount++;
            }
        }
        const capacity = emptyCount * this.stackSize;
        return need <= capacity;
    }

    /**
     * 尝试放入，返回已放入数量及剩余未放入数量
     * 只使用已解锁的格子
     */
    public add(type: PickupType, amount: number): { added: number; left: number } {
        console.log('[InventoryManager] add:', type, amount);
        let left = amount;
        // 先填充已有堆叠（只看已解锁格子）
        for (let i = 0; i < this.unlockedSlots; i++) {
            if (left <= 0) break;
            const slot = this.slots[i];
            if (slot.type === type && slot.count < this.stackSize) {
                const space = this.stackSize - slot.count;
                const take = Math.min(space, left);
                slot.count += take;
                left -= take;
            }
        }
        // 再占用空格（只看已解锁格子）
        for (let i = 0; i < this.unlockedSlots; i++) {
            if (left <= 0) break;
            const slot = this.slots[i];
            if (!slot.type || slot.count === 0) {
                const take = Math.min(this.stackSize, left);
                slot.type = type;
                slot.count = take;
                left -= take;
            }
        }
        return { added: amount - left, left };
    }

    public remove(type: PickupType, amount: number): number {
        let need = amount;
        for (const slot of this.slots) {
            if (need <= 0) break;
            if (slot.type === type && slot.count > 0) {
                const take = Math.min(slot.count, need);
                slot.count -= take;
                need -= take;
                if (slot.count === 0) slot.type = null;
            }
        }
        return amount - need; // 实际移除
    }

    public clear(): void {
        for (const slot of this.slots) {
            slot.type = null;
            slot.count = 0;
        }
    }

    /**
     * 将背包所有物品抛洒到地面
     * @param scene Phaser.Scene
     * @param x 撒出位置X
     * @param y 撒出位置Y
     * @param groundY 地面Y坐标（用于落地检测）
     * @returns 所有物品落地所需的预估时间（毫秒）
     */
    public dropAll(_scene: Phaser.Scene, x: number, y: number, groundY?: number): number {
        if (!this.pickupManager) {
            console.warn('[InventoryManager] dropAll: pickupManager not set!');
            return 0;
        }
        const pm = this.pickupManager;
        
        // 计算地面Y坐标（如果未提供，使用角色位置下方一点）
        const finalGroundY = groundY ?? (y + 50);
        
        // 收集所有物品
        const allItems: { type: PickupType; count: number }[] = [];
        for (const slot of this.slots) {
            if (slot.type && slot.count > 0) {
                allItems.push({ type: slot.type, count: slot.count });
            }
        }
        
        console.log('[InventoryManager] dropAll: allItems =', allItems, 'total slots with items:', allItems.length);
        
        // 如果没有物品，直接返回
        if (allItems.length === 0) {
            console.log('[InventoryManager] dropAll: No items to drop');
            this.clear();
            return 0;
        }
        
        // 计算总物品数量
        let totalItems = 0;
        for (const item of allItems) {
            totalItems += item.count;
        }
        
        // 喷射参数 - 更短距离、更快落地
        const baseVx = 180;  // 水平基础速度 px/s（减小）
        const baseVy = -350; // 向上基础速度 px/s（减小，让物品更快落地）
        const vxVariance = 80; // 水平速度随机变化范围
        const vyVariance = 80; // 垂直速度随机变化范围
        
        console.log('[InventoryManager] dropAll: Starting to spawn', totalItems, 'items at x:', x.toFixed(0), 'y:', y.toFixed(0), 'groundY:', finalGroundY.toFixed(0));
        
        let itemIndex = 0;
        for (const item of allItems) {
            for (let i = 0; i < item.count; i++) {
                // 决定喷射方向：交替左右，让物品均匀分布
                const direction = (itemIndex % 2 === 0) ? -1 : 1;
                
                // 计算弹出速度（添加随机变化）
                const vx = direction * (baseVx + Phaser.Math.FloatBetween(-vxVariance, vxVariance));
                const vy = baseVy + Phaser.Math.FloatBetween(-vyVariance, vyVariance);
                
                // 立即生成，不使用延迟（延迟可能在某些情况下不执行）
                const itemType = item.type;
                const spawnX = x;
                const spawnY = y - 20;
                
                // 确保物品生成在地面之上，否则会立即触发落地
                // 物品需要从角色上方喷出，所以 spawnY 必须小于 groundY
                const safeSpawnY = Math.min(spawnY, finalGroundY - 100);
                
                console.log('[InventoryManager] Spawning item', itemIndex, ':', itemType, 'at y:', safeSpawnY.toFixed(0), 'vx:', vx.toFixed(0), 'vy:', vy.toFixed(0));
                
                // 直接调用 spawn，不用 delayedCall
                pm.spawn(itemType, spawnX, safeSpawnY, {
                    disableAttract: true,
                    stayOnGround: false,  // 落地后启用漂浮动画
                    ejectVxOverride: vx,
                    ejectVyOverride: vy,
                    groundY: finalGroundY,
                });
                
                itemIndex++;
            }
        }
        
        this.clear();
        
        // 计算所有物品落地所需时间
        // 最后一个物品的生成延迟 + 物理落地时间（约0.6秒）+ 安全余量
        const lastSpawnDelay = (totalItems - 1) * 8;
        const physicsLandTime = 600; // 物理落地时间（毫秒）
        const safetyMargin = 200; // 安全余量
        return lastSpawnDelay + physicsLandTime + safetyMargin;
    }
}
