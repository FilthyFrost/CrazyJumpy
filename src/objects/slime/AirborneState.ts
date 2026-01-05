
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
    }

    update(slime: Slime, dt: number, isSpaceDown: boolean, _justPressed: boolean, _justReleased: boolean): void {
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
