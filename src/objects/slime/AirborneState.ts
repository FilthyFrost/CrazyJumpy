
import type Slime from '../Slime';
import type { ISlimeState } from './ISlimeState';
import { GameConfig } from '../../config';

export class AirborneState implements ISlimeState {
    enter(slime: Slime): void {
        // Reset distance tracking for new airborne phase
        slime.fallDistanceSinceApex = 0;
        slime.fastFallDistance = 0;
        slime.prevYForFall = slime.y;

        // Reset energy tracking
        slime.fastFallEnergy = 0;
        slime.fastFallTime = 0;

        // Reset lane switch lock if entering airborne with upward velocity (after bounce)
        // This allows lane switching again after landing and bouncing
        if (slime.vy < 0) {
            slime.resetLaneSwitchLock();
        }
    }

    update(slime: Slime, dt: number, isSpaceDown: boolean, justPressed: boolean, _justReleased: boolean): void {
        // Reset fastFallDistance on re-press (prevents multi-tap accumulation exploit)
        if (justPressed) {
            slime.fastFallDistance = 0;
        }

        // 1) Air Control
        if (isSpaceDown) {
            slime.holdTime += dt;
            const targetA = Math.min(
                GameConfig.air.baseFastFallAccel + GameConfig.air.fastFallRamp * slime.holdTime,
                GameConfig.air.maxFastFallAccel
            );
            // Faster approach (0.05 instead of 0.1) for snappier response
            slime.userAccel = slime.approach(slime.userAccel, targetA, dt, 0.05);
        } else {
            slime.holdTime = 0;
            slime.userAccel = slime.approach(slime.userAccel, 0, dt, GameConfig.air.releaseDecay);
        }

        // 2) Integrate
        const ay = GameConfig.gravity + slime.userAccel;
        slime.vy += ay * dt;

        // Terminal velocity clamp (px/s)
        // Two-Tier System: Higher limit when "forcing" it down, lower limit for natural fall.
        // This prevents "infinite energy glitch" by capping the v term in (F * v * dt).
        const terminalNormal = (GameConfig.air as any).terminalFallSpeed ?? 6000;
        const terminalFast = (GameConfig.air as any).terminalFastFallSpeed ?? 9000;

        const terminalVy = isSpaceDown ? terminalFast : terminalNormal;

        if (slime.vy > terminalVy) {
            slime.vy = terminalVy;
        }

        slime.y += slime.vy * dt;

        // ===== SHAKE CALCULATION (Air Turbulence) =====
        const shakeCfg = GameConfig.cameraShake;
        if (shakeCfg.enable) {
            const groundYi = slime.getGroundY();
            const heightAboveGround = Math.max(0, groundYi - slime.y);
            const air = shakeCfg.air;

            if (heightAboveGround > air.refHeight) {
                // log gain
                const num = Math.log1p((heightAboveGround - air.refHeight) / air.refHeight);
                const den = Math.log1p((air.maxHeight - air.refHeight) / air.refHeight);
                const gain = Phaser.Math.Clamp(num / den, 0, 1);

                slime.airShake01 = Math.pow(gain, air.pow);
            } else {
                slime.airShake01 = 0;
            }
        } else {
            slime.airShake01 = 0;
        }

        // ===== ACCUMULATE FAST-FALL ENERGY & TIME =====
        // Work = Force * velocity * time
        // FastFallTime = Duration of active input during descent
        // CRITICAL: Only accumulate while actively holding button (isSpaceDown)
        // Post-release decay tail (userAccel > 0 but !isSpaceDown) must NOT inflate energy
        // Energy calculation uses CAPPED values to prevent extreme physics from breaking balance
        if (isSpaceDown && slime.vy > 0 && slime.userAccel > 0) {
            const vEnergyCap = (GameConfig.air as any).energyVyCap ?? 6000;
            const aEnergyCap = (GameConfig.air as any).energyAccelCap ?? 6000;

            const vEff = Math.min(slime.vy, vEnergyCap);
            const aEff = Math.min(slime.userAccel, aEnergyCap);

            slime.fastFallEnergy += aEff * vEff * dt;
            slime.fastFallTime += dt;
        }

        // ===== AUTO BULLET TIME AT APEX (from 85% until condition met) =====
        // Check during ascent only (vy < 0 means going up)
        if (slime.vy < 0 && slime.autoBTEligible) {
            // Calculate current height progress toward predicted apex
            const currentHeight = slime.launchY - slime.y;
            const progress = currentHeight / Math.max(1, slime.predictedApexHeight);
            const currentHeightM = currentHeight / (GameConfig.display.pixelsPerMeter ?? 50);

            // Activate bullet time when reaching 80% of apex
            if (!slime.autoBTActivated && progress >= 0.80) {
                slime.autoBTActivated = true;

                // Calculate dynamic duration based on apex height
                const apexHeightM = slime.predictedApexHeight / (GameConfig.display.pixelsPerMeter ?? 50);

                // Access BulletTimeManager via scene and activate (force, no energy cost)
                // Pass launchRating for NORMAL adjustments (shorter duration, faster timeScale)
                const scene = slime.scene as any;
                if (scene.bulletTimeManager && !scene.bulletTimeManager.isActive) {
                    scene.bulletTimeManager.forceActivateWithHeight(apexHeightM, slime.launchRating);
                    if (GameConfig.debug) {
                        console.log(`[AutoBT] Activated at ${Math.round(progress * 100)}% | Rating: ${slime.launchRating} | Height: ${apexHeightM.toFixed(0)}m`);
                    }
                }
            }

            // ===== 智能子弹时间结束检测 =====
            // 条件1: 砍完所有怪 → 立即结束
            // 条件2: 超过最高怪物 → 立即结束（漏怪惩罚）
            if (slime.autoBTActivated) {
                const scene = slime.scene as any;
                if (scene.bulletTimeManager?.isActive && scene.monsterManager) {
                    const aliveCount = scene.monsterManager.getAliveMonsterCount();
                    const highestMonsterHeight = scene.monsterManager.getHighestAliveMonsterHeight();

                    let shouldEnd = false;
                    let reason = '';

                    // 条件1: 所有怪都被砍了
                    if (aliveCount === 0) {
                        shouldEnd = true;
                        reason = '所有怪物已击杀';
                    }
                    // 条件2: 玩家高度超过了最高的怪物
                    else if (highestMonsterHeight > 0 && currentHeightM > highestMonsterHeight + 2) {
                        // +2米容差，避免刚好在怪物位置时误判
                        shouldEnd = true;
                        reason = `超过最高怪物 (${highestMonsterHeight.toFixed(0)}m)`;
                    }

                    if (shouldEnd) {
                        scene.bulletTimeManager.deactivate();
                        if (GameConfig.debug) {
                            console.log(`[AutoBT] 智能结束 - ${reason}`);
                        }
                        // 不重置 autoBTEligible，让下落检测仍然可以触发
                    }
                }
            }
        }

        // Deactivate when falling starts (reached apex)
        if (slime.vy > 0 && slime.autoBTActivated) {
            const scene = slime.scene as any;
            if (scene.bulletTimeManager && scene.bulletTimeManager.isActive) {
                scene.bulletTimeManager.deactivate();
                if (GameConfig.debug) {
                    console.log(`[AutoBT] Deactivated - reached apex, falling started`);
                }
            }
            slime.autoBTActivated = false;
            slime.autoBTEligible = false; // Reset for next bounce
        }

        // 3) Apex Detection - reset fastFallEnergy at apex
        if (slime.prevVyForApex < 0 && slime.vy >= 0) {
            const groundYi = slime.getGroundY();
            slime.lastApexHeight = Math.max(0, groundYi - slime.y);
            slime.fastFallEnergy = 0;  // Reset energy at apex
            slime.fastFallTime = 0;    // Reset timer at apex

            // Reset distance tracking at apex (new descent begins)
            slime.fallDistanceSinceApex = 0;
            slime.fastFallDistance = 0;
            slime.prevYForFall = slime.y;

            // Lock lane switching at apex - player can only switch lanes during ascent
            // This prevents "free" lane changes during descent without pressing input
            slime.lockLaneSwitch();
        }
        slime.prevVyForApex = slime.vy;

        // ===== ACCUMULATE DISTANCE (only during descent) =====
        const dy = slime.y - slime.prevYForFall;
        if (dy > 0) {
            slime.fallDistanceSinceApex += dy;
            if (isSpaceDown) {
                slime.fastFallDistance += dy;
            }
        }
        slime.prevYForFall = slime.y;

        // 4) Ground Contact
        const groundYi = slime.getGroundY();
        if (slime.y >= groundYi) {
            slime.y = groundYi;

            slime.impactSpeed = Math.max(0, slime.vy);

            // Snapshot distance tracking for energy calculation
            slime.landingFallDistance = slime.fallDistanceSinceApex;
            slime.landingFastFallDistance = slime.fastFallDistance;

            // Reset air stats
            slime.userAccel = 0;
            slime.holdTime = 0;

            // Setup collision params for charging state
            const rawX = GameConfig.ground.impactScale * (slime.impactSpeed * slime.impactSpeed);
            slime.targetCompression = Math.min(rawX, GameConfig.ground.maxDepth);
            slime.overflow = Math.max(0, rawX - GameConfig.ground.maxDepth);

            slime.vy = 0;

            // Calculate difficulty snapshot - use actual fall distance if available
            const actualFallDist = slime.landingFallDistance > 0 ? slime.landingFallDistance : slime.lastApexHeight;
            slime.landingApexHeight = actualFallDist;
            const g = GameConfig.ground as any;
            const Href = (g.difficultyRefHeight ?? 5000) as number;
            slime.landingDifficulty = Math.max(1, slime.landingApexHeight / Math.max(1, Href));

            // ===== GROUND IMPACT SHAKE =====
            const shakeCfg = GameConfig.groundShake;
            if (shakeCfg.enable) {
                const H = slime.landingApexHeight;
                const dist = Math.max(1, slime.landingFallDistance);
                const fast = slime.landingFastFallDistance;
                // Clamp R to 0..1
                const R = Phaser.Math.Clamp(fast / dist, 0, 1);

                // Formula: x = (H / Href) * modifier(R)
                // We ensure at least 30% shake effectiveness even without holding space
                // so that high drops still feel heavy.
                const rFactor = 0.3 + 0.7 * Math.pow(R, shakeCfg.holdGamma);
                const x = (H / shakeCfg.heightRef) * rFactor;

                // Log Gain
                const num = Math.log1p(shakeCfg.k * x);
                const den = Math.log1p(shakeCfg.k * (shakeCfg.xMax / shakeCfg.heightRef));

                // Velocity Boost (Optional: stronger impact if falling fast)
                // vRef ~ 1000, 
                const vGain = Math.min(1, Math.abs(slime.impactSpeed) / 4000);

                let intensity = Phaser.Math.Clamp(num / den, 0, 1);
                // Boost slightly by velocity
                intensity *= (0.8 + 0.2 * vGain);

                slime.ground.onLandingImpact(slime.x, Phaser.Math.Clamp(intensity, 0, 1));
            }

            // Trigger Landing Event on Scene (e.g. for clearing monsters)
            if ((slime.scene as any).onPlayerLanded) {
                (slime.scene as any).onPlayerLanded();
            }

            // Transition
            slime.transitionTo('GROUND_CHARGING');
            // We need to pass the "contactHasInput" state if they were holding space on landing
            if (isSpaceDown) {
                // If we check this in ‘enter’ of charging, it works too.
                // But ‘ChargingState’ logic handles `contactHasInput` management.
            }
        }
    }

    exit(_slime: Slime): void {
        // Cleanup if needed
    }
}
