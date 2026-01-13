/**
 * GestureManager - 手势意图判别模块
 * 
 * 区分滑动 (Swipe) 与按住 (Hold) 手势：
 * - Swipe: 快速横向移动 >= SWIPE_DIST 触发换道
 * - Hold: 稳定按住 >= HOLD_DELAY 触发快落
 * 
 * 核心规则：
 * 1. 一旦判定为 Swipe，该触摸永远不会触发 Hold
 * 2. 一旦判定为 Hold，该触摸不再响应 Swipe
 */

import { GameConfig } from '../config';

export const GestureIntent = {
    CANDIDATE: 'CANDIDATE',  // 尚未判定
    SWIPE: 'SWIPE',          // 判定为滑动
    HOLD: 'HOLD',            // 判定为按住
} as const;

export type GestureIntent = typeof GestureIntent[keyof typeof GestureIntent];

export interface GestureResult {
    isHoldActive: boolean;      // 是否处于 Hold 状态 (驱动快落)
    swipeDirection: -1 | 0 | 1; // -1=左滑, 0=无, 1=右滑
    laneSwitchLocked: boolean;  // Hold 激活后锁定换道
}

interface PointerState {
    id: number;
    startX: number;
    startY: number;
    startTime: number;
    currentX: number;
    currentY: number;
    intent: GestureIntent;
    swipeConsumed: boolean;     // 本次滑动已触发换道
    holdLocked: boolean;        // 进入 Hold 后恒为 true
}

export class GestureManager {
    private pointers: Map<number, PointerState> = new Map();
    private lastSwipeTime: number = 0;

    // Computed thresholds (based on screen width)
    private swipeDist: number = 18;
    private moveTol: number = 8;
    private holdDelay: number = 80;
    private swipeCooldown: number = 120;

    // Global lock state (persists across pointer sessions until reset)
    private _laneSwitchLocked: boolean = false;

    constructor(screenWidth: number = 540) {
        this.updateScreenWidth(screenWidth);
    }

    /**
     * Update thresholds based on screen width
     */
    updateScreenWidth(width: number): void {
        const lane = GameConfig.lane;
        this.swipeDist = Math.max(18, width * lane.swipeDistRatio);
        this.moveTol = Math.max(8, width * lane.moveTolRatio);
        this.holdDelay = lane.holdDelayMs;
        this.swipeCooldown = lane.swipeCooldownMs;
    }

    /**
     * Handle pointer down event
     */
    onPointerDown(pointerId: number, x: number, y: number, time: number): void {
        this.pointers.set(pointerId, {
            id: pointerId,
            startX: x,
            startY: y,
            startTime: time,
            currentX: x,
            currentY: y,
            intent: GestureIntent.CANDIDATE,
            swipeConsumed: false,
            holdLocked: false,
        });
    }

    /**
     * Handle pointer move event
     */
    onPointerMove(pointerId: number, x: number, y: number): void {
        const state = this.pointers.get(pointerId);
        if (state) {
            state.currentX = x;
            state.currentY = y;
        }
    }

    /**
     * Handle pointer up event
     */
    onPointerUp(pointerId: number): void {
        this.pointers.delete(pointerId);
    }

    /**
     * Clear all pointer states (used on blur/cancel events)
     */
    clearAll(): void {
        this.pointers.clear();
    }

    /**
     * Reset lane switch lock (called when entering AIRBORNE after bounce)
     */
    resetLaneSwitchLock(): void {
        this._laneSwitchLocked = false;
    }

    /**
     * Process all active pointers and return gesture result
     * @param currentTime Current time in milliseconds
     */
    update(currentTime: number): GestureResult {
        let isHoldActive = false;
        let swipeDirection: -1 | 0 | 1 = 0;

        for (const state of this.pointers.values()) {
            const dx = state.currentX - state.startX;
            const dy = state.currentY - state.startY;
            const elapsed = currentTime - state.startTime;

            // Already determined intent
            if (state.intent === GestureIntent.HOLD) {
                isHoldActive = true;
                this._laneSwitchLocked = true;
                continue;
            }

            if (state.intent === GestureIntent.SWIPE) {
                // Swipe already consumed, ignore further movement
                continue;
            }

            // CANDIDATE state - determine intent
            const absDx = Math.abs(dx);
            const absDy = Math.abs(dy);

            // DEBUG: Log pointer state
            if (absDx > 5 || absDy > 5) {
                console.log(`[Gesture] dx:${dx.toFixed(0)} dy:${dy.toFixed(0)} swipeDist:${this.swipeDist.toFixed(0)} locked:${this._laneSwitchLocked}`);
            }

            // Check for Swipe first (priority)
            if (absDx >= this.swipeDist && absDx > absDy) {
                state.intent = GestureIntent.SWIPE;

                // Only trigger if not on cooldown and not consumed
                if (!state.swipeConsumed && !this._laneSwitchLocked) {
                    const timeSinceLastSwipe = currentTime - this.lastSwipeTime;
                    if (timeSinceLastSwipe >= this.swipeCooldown) {
                        swipeDirection = dx > 0 ? 1 : -1;
                        state.swipeConsumed = true;
                        this.lastSwipeTime = currentTime;
                        console.log(`[Gesture] SWIPE DETECTED! direction:${swipeDirection}`);
                    }
                } else {
                    console.log(`[Gesture] Swipe blocked: consumed=${state.swipeConsumed} locked=${this._laneSwitchLocked}`);
                }
                continue;
            }

            // Check for Hold (requires stability)
            if (elapsed >= this.holdDelay && absDx < this.moveTol && absDy < this.moveTol) {
                state.intent = GestureIntent.HOLD;
                state.holdLocked = true;
                isHoldActive = true;
                this._laneSwitchLocked = true;
                console.log(`[Gesture] HOLD DETECTED! locking lane switch`);
            }
        }

        return {
            isHoldActive,
            swipeDirection,
            laneSwitchLocked: this._laneSwitchLocked,
        };
    }

    /**
     * Check if there are any active pointers
     */
    hasActivePointers(): boolean {
        return this.pointers.size > 0;
    }

    /**
     * Get number of active pointers
     */
    getPointerCount(): number {
        return this.pointers.size;
    }
}
