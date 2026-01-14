
import type Slime from '../Slime';
import type { ISlimeState } from './ISlimeState';
import { GameConfig } from '../../config';
import Phaser from 'phaser';

export class ChargingState implements ISlimeState {
    enter(slime: Slime): void {
        slime.currentCompression = 0;
        slime.reachedPeak = false;
        slime.chargeEfficiency = 1.0;
        // Reset charge visuals state to avoid carrying over high frame from上一次蓄力
        slime.chargeProximity = 0;
        slime.chargeEffectFrame = 1;
        slime.chargeEffectState = 'idle';

        slime.postPeakHoldTime = 0;
        slime.holdLockout = false;

        slime.contactHasInput = false;

        // Start charge visual effect (maps progress to frames 1-6)
        slime.startChargeEffect();

        // Check input immediately on enter (if player held space while landing)
        // We'll access the scene input or rely on the next update frame? 
        // Logic in old Slime.ts checked 'isSpaceDown' in update loop.
        // But 'contactHasInput' needs to be true if holding ON impact.
        // We can check it in update's first frame or pass it. 
        // Ideally Slime stores 'isSpaceDown' globally? 
        // Actually update() receives isSpaceDown. It's safe to check there.
        // Wait, if I land holding space, update() is called in the NEXT frame or same frame?
        // Let's assume safely that update() will catch it.

        // Actually, original code:
        // this.contactHasInput = isSpaceDown; // in handleAirborne before transition
        // So we will need Slime to handle that passing or check it in first update.
    }

    update(slime: Slime, dt: number, isSpaceDown: boolean, _justPressed: boolean, justReleased: boolean): void {
        const groundYi = slime.getGroundY();
        const ground = GameConfig.ground as any;

        if (isSpaceDown) slime.contactHasInput = true;

        // ===== DYNAMIC DIFFICULTY PARAMETERS =====
        const diff = slime.landingDifficulty ?? 1;

        // Sweet Window shrinks with difficulty
        const sweet0 = (ground.sweetHoldGrace0 ?? ground.sweetHoldGrace ?? 0.08) as number;
        const sweetMin = (ground.sweetHoldGraceMin ?? 0.02) as number;
        const sweetGraceEff = Phaser.Math.Clamp(sweet0 / diff, sweetMin, sweet0);

        // Fail Hold Time shrinks with difficulty
        const fail0 = (ground.failHoldTime0 ?? ground.failHoldTime ?? 0.12) as number;
        const failMin = (ground.failHoldTimeMin ?? 0.03) as number;
        const failHoldEff = Phaser.Math.Clamp(fail0 / diff, failMin, fail0);

        // Over Hold Penalty increases with difficulty
        const accelK0 = (ground.overHoldAccelK0 ?? ground.overHoldAccelK ?? 8.0) as number;
        const accelKGain = (ground.overHoldAccelKGain ?? 6.0) as number;
        const accelKeff = accelK0 + accelKGain * (diff - 1);

        // Phase 1: Compress to Peak
        if (!slime.reachedPeak) {
            // ===== DYNAMIC COMPRESS TIME: Log-curve based on height =====
            // Higher falls = longer time to reach yellow (more reaction time)
            // compressTimeEff = compressTime0 * (1 + compressLogScale * log2(1 + apex/Href))
            const compressTime0 = (ground.compressTime ?? 0.12) as number;
            const compressLogScale = (ground.compressLogScale ?? 0.5) as number;
            const Href = (ground.difficultyRefHeight ?? 5000) as number;

            const logFactor = 1 + compressLogScale * Math.log2(1 + slime.landingApexHeight / Math.max(1, Href));
            const compressTimeEff = compressTime0 * logFactor;

            slime.currentCompression = slime.approach(
                slime.currentCompression,
                slime.targetCompression,
                dt,
                compressTimeEff
            );

            // ===== YELLOW ZONE TRACKING =====
            // Yellow zone = proximity > 0.9 (high compression ratio)
            const proximity = slime.currentCompression / Math.max(1e-6, slime.targetCompression);

            // Check if entering yellow zone
            if (proximity > 0.9 && !slime.isInYellowZone) {
                slime.isInYellowZone = true;
                slime.yellowZoneStartTime = 0;
            }

            // Track time in yellow zone
            if (slime.isInYellowZone) {
                slime.yellowZoneStartTime += dt;

                // ===== LOG-CURVE DIFFICULTY: Yellow duration shrinks with height =====
                // yellowDuration = yellowDuration0 / (1 + difficultyLogScale * log2(1 + apex/difficultyRefHeight))
                const yellowDur0 = (ground.yellowDuration0 ?? 0.15) as number;
                const yellowDurMin = (ground.yellowDurationMin ?? 0.03) as number;
                const logScale = (ground.difficultyLogScale ?? 0.8) as number;
                const Href = (ground.difficultyRefHeight ?? 5000) as number;

                const logFactor = 1 + logScale * Math.log2(1 + slime.landingApexHeight / Math.max(1, Href));
                const yellowDurationEff = Math.max(yellowDurMin, yellowDur0 / logFactor);

                // If in yellow zone too long, auto-transition to peak
                if (slime.yellowZoneStartTime >= yellowDurationEff) {
                    slime.reachedPeak = true;
                    slime.postPeakHoldTime = 0;
                    slime.holdLockout = false;
                    slime.chargeEfficiency = 1.0;
                    slime.currentCompression = slime.targetCompression;
                    slime.isInYellowZone = false; // Exited yellow zone by reaching peak
                }
            }

            const eps = (ground.peakEps ?? 1.0) as number;
            if (Math.abs(slime.targetCompression - slime.currentCompression) <= eps && !slime.reachedPeak) {
                slime.reachedPeak = true;
                slime.postPeakHoldTime = 0;
                slime.holdLockout = false;

                slime.chargeEfficiency = 1.0;
                slime.currentCompression = slime.targetCompression;
                slime.isInYellowZone = false; // Exited by reaching peak
            }

            // ===== SHAKE CALCULATION (Visual Feel) =====
            const shakeCfg = GameConfig.cameraShake;
            if (shakeCfg.enable) {
                // 1. Inputs
                const H = slime.landingApexHeight;
                const Href = shakeCfg.charge.heightRef;

                // Hold Ratio R = fastFallDistance / totalFallDistance
                const dist = Math.max(1, slime.landingFallDistance);
                const fast = slime.landingFastFallDistance;
                const R = Phaser.Math.Clamp(fast / dist, 0, 1);

                // Proximity P
                const P = Phaser.Math.Clamp(slime.currentCompression / Math.max(1e-6, slime.targetCompression), 0, 1);
                slime.chargeProximity = P;

                // 2. Height + Hold Gain
                // x = (H / Href) * pow(R, gamma)
                const x = (H / Href) * Math.pow(R, shakeCfg.charge.holdGamma);
                // gain = log1p(k * x) / log1p(k * xMax)
                const num = Math.log1p(shakeCfg.charge.k * x);
                const den = Math.log1p(shakeCfg.charge.k * (shakeCfg.charge.xMax / Href)); // Approximate normalization
                const heightHoldGain = Phaser.Math.Clamp(num / den, 0, 1);

                // 3. Perfect Approach Tension
                // smoothstep from pStart to pPeak
                const pStart = shakeCfg.charge.pStart;
                const pPeak = shakeCfg.charge.pPeak;
                let perfectApproach = 0;

                if (P < pStart) {
                    perfectApproach = 0;
                } else if (P >= pPeak) {
                    perfectApproach = 1;
                } else {
                    const t = (P - pStart) / (pPeak - pStart);
                    perfectApproach = t * t * (3 - 2 * t); // smoothstep
                }

                // Decay after peak
                if (slime.reachedPeak) {
                    // Exponential decay
                    const decay = Math.exp(-slime.postPeakHoldTime / shakeCfg.charge.postPeakTau);
                    perfectApproach *= decay;
                }

                // 4. Final Intensity
                // chargeShake = gain * pow(approach, power)
                const rawShake = heightHoldGain * Math.pow(perfectApproach, shakeCfg.charge.approachPow);
                slime.chargeShake01 = Phaser.Math.Clamp(rawShake, 0, 1);

                // 5. Visual Character Shake (Sprite only)
                // Map 0..1 intensity to pixels
                if (slime.chargeShake01 > 0.01) {
                    // Random jitter for character (high freq)
                    const peakBoost = P > 0.95 ? (1 + (P - 0.95) * 4) : 1; // 0→1 extra when接近满蓄
                    const spriteAmpX = shakeCfg.charge.ampXMax * 0.35 * peakBoost; // 35% of camera shake
                    const spriteAmpY = shakeCfg.charge.ampYMax * 0.35 * peakBoost;

                    // Use simple random for sprite to decouple from camera
                    // scaling by intensity^2 for sharper dropoff
                    const s = slime.chargeShake01 * slime.chargeShake01;
                    slime.visualShakeX = (Math.random() - 0.5) * 2 * spriteAmpX * s;
                    slime.visualShakeY = (Math.random() - 0.5) * 2 * spriteAmpY * s;
                } else {
                    slime.visualShakeX = 0;
                    slime.visualShakeY = 0;
                }
                // Sync Ground Tremor
                slime.ground.setChargeTremor(slime.chargeShake01);
            } else {
                slime.chargeShake01 = 0;
                slime.visualShakeX = 0;
                slime.visualShakeY = 0;
            }

            // ===== COLOR FEEDBACK FOR CHARGE TIMING =====
            // Phase colors: Normal → Brightening → Golden (Yellow Zone) → Red (Overheld)
            this.updateChargeTint(slime);

            // Early Release
            if (justReleased && slime.contactHasInput) {
                this.tryLaunchActiveOrSettle(slime);
            }
            return;
        }

        // Phase 2: At Peak
        // Continue applying color feedback
        this.updateChargeTint(slime);

        // Release
        if (justReleased && slime.contactHasInput) {
            this.tryLaunchActiveOrSettle(slime);
            return;
        }

        // Case: No Input => Absorb (FAILURE - reset combo)
        if (!slime.contactHasInput && !isSpaceDown) {
            const absorbTau = (ground.absorbRelaxTime ?? 0.12) as number;
            slime.currentCompression = slime.approach(slime.currentCompression, 0, dt, absorbTau);

            const settleEps = (ground.settleEps ?? 0.5) as number;
            if (slime.currentCompression <= settleEps) {
                // ===== DEATH CHECK: No input above 100m = instant death =====
                const PIXELS_PER_METER = GameConfig.display.pixelsPerMeter ?? 50;
                const SAFE_ZONE_PX = 100 * PIXELS_PER_METER;

                if (slime.landingApexHeight > SAFE_ZONE_PX) {
                    // Player didn't participate at all - instant death
                    slime.healthManager.onLanding(slime.landingApexHeight, 'FAILED', true);
                    slime.showFeedback('FAILED');
                    if (GameConfig.debug) {
                        console.log(`[DEATH] No input fall from ${(slime.landingApexHeight / PIXELS_PER_METER).toFixed(0)}m`);
                    }
                }

                slime.perfectStreak = 0;  // Reset combo on failure
                slime.transitionTo('GROUNDED_IDLE');
            }
            return;
        }

        // Case: Holding after Peak
        if (isSpaceDown) {
            const settleEps = (ground.settleEps ?? 0.5) as number;

            // Use DYNAMIC sweet window
            slime.postPeakHoldTime += dt;

            if (slime.postPeakHoldTime <= sweetGraceEff) {
                slime.currentCompression = slime.targetCompression;
                slime.chargeEfficiency = 1.0;

                return;
            }

            // Failure Ramp with DYNAMIC penalty
            const over = slime.postPeakHoldTime - sweetGraceEff;
            const accelT = (ground.overHoldAccelTime ?? 0.25) as number;
            const accel = 1 + accelKeff * (1 - Math.exp(-over / Math.max(1e-6, accelT)));

            // Use DYNAMIC fail time
            if (over >= failHoldEff) slime.holdLockout = true;

            const relaxTau = Math.max(1e-4, GameConfig.ground.relaxTime / accel);
            const fatigueTau = Math.max(1e-4, GameConfig.ground.fatigueTime / accel);

            slime.currentCompression = slime.approach(slime.currentCompression, 0, dt, relaxTau);
            slime.chargeEfficiency = slime.approach(slime.chargeEfficiency, 0, dt, fatigueTau);

            slime.y = groundYi + slime.currentCompression;

            // Strict Fatigue Exit (FAILURE - reset combo)
            // Check for death from missed bounce timing (holdLockout above 100m)
            if (slime.currentCompression <= settleEps) {
                if (this.checkMissedBounceDeath(slime)) {
                    return; // Death occurred, already transitioned
                }
                slime.perfectStreak = 0;  // Reset combo on failure
                slime.transitionTo('GROUNDED_IDLE');
            }
            return;
        }

        // Fallthrough: Relax slowly if not holding (FAILURE - reset combo)
        const idleRelaxTau = (ground.idleRelaxAfterPeak ?? 0.18) as number;
        slime.currentCompression = slime.approach(slime.currentCompression, 0, dt, idleRelaxTau);
        slime.y = groundYi + slime.currentCompression;

        const settleEps = (ground.settleEps ?? 0.5) as number;
        if (slime.currentCompression <= settleEps) {
            slime.perfectStreak = 0;  // Reset combo on failure
            slime.transitionTo('GROUNDED_IDLE');
        }
    }

    exit(slime: Slime): void {
        // Clear charge visual effects
        slime.graphics.clearTint();
        slime.chargeShake01 = 0;
        slime.visualShakeX = 0;
        slime.visualShakeY = 0;
        slime.ground.setChargeTremor(0);
    }

    /**
     * Check if player should die due to missed bounce timing (holdLockout above 100m).
     * If death occurs, calls health manager and transitions to GROUNDED_IDLE.
     * Returns true if death occurred, false otherwise.
     */
    private checkMissedBounceDeath(slime: Slime): boolean {
        if (!slime.holdLockout) {
            return false;
        }

        // Check if landing was from above 100m (safe zone)
        const PIXELS_PER_METER = GameConfig.display.pixelsPerMeter ?? 50;
        const SAFE_ZONE_METERS = 100;
        const heightMeters = slime.landingApexHeight / PIXELS_PER_METER;

        if (heightMeters > SAFE_ZONE_METERS) {
            // Report to health manager - this will set isDead = true
            slime.healthManager.onLanding(slime.landingApexHeight, 'FAILED', true);
            slime.showFeedback('FAILED');
            slime.perfectStreak = 0;
            slime.transitionTo('GROUNDED_IDLE');
            return true;
        }

        return false;
    }

    // ----------------------------------------
    // Launch Logic (Ported exactly)
    // ----------------------------------------
    private tryLaunchActiveOrSettle(slime: Slime) {
        const ground = GameConfig.ground as any;
        const settleEps = (ground.settleEps ?? 0.5) as number;

        if (slime.currentCompression <= settleEps) {
            slime.perfectStreak = 0;  // Reset combo on failure
            slime.transitionTo('GROUNDED_IDLE');
            return;
        }

        if (slime.holdLockout) {
            // ===== DEATH CHECK: Held too long above 100m = death =====
            const PIXELS_PER_METER = GameConfig.display.pixelsPerMeter ?? 50;
            const SAFE_ZONE_METERS = 100;
            const heightMeters = slime.landingApexHeight / PIXELS_PER_METER;

            if (heightMeters > SAFE_ZONE_METERS) {
                // Player held too long - instant death
                slime.healthManager.onLanding(slime.landingApexHeight, 'FAILED', true);
                slime.showFeedback('FAILED');
                if (GameConfig.debug) {
                    console.log(`[DEATH] Held too long from ${heightMeters.toFixed(0)}m`);
                }
            }

            slime.perfectStreak = 0;  // Reset combo on failure
            slime.transitionTo('GROUNDED_IDLE');
            return;
        }

        const deadEff = (ground.deadEfficiency ?? 0.05) as number;
        if (slime.chargeEfficiency <= deadEff) {
            slime.transitionTo('GROUNDED_IDLE');
            return;
        }

        this.launchActiveControlled(slime);
    }

    private launchActiveControlled(slime: Slime) {
        const ground = GameConfig.ground as any;

        // ===== DETERMINE RATING based on when player released =====
        // Perfect = released during yellow zone (proximity > 0.9 && !reachedPeak at release time)
        // Normal = released early (before yellow) OR released slightly late (after peak but within grace)
        // Failed = holdLockout (held way too long)

        let rating: 'PERFECT' | 'NORMAL' | 'FAILED';

        // Check if released during yellow zone
        // Yellow zone = proximity > 0.9 (high compression ratio)
        const proximity = slime.currentCompression / Math.max(1e-6, slime.targetCompression);
        const wasInYellowZone = slime.isInYellowZone && !slime.reachedPeak;

        // ===== DYNAMIC DIFFICULTY FOR PERFECT JUDGMENT =====
        // Use the same dynamic window calculation as in update()
        // This ensures Perfect judgment is consistent with difficulty scaling
        const diff = slime.landingDifficulty ?? 1;
        const sweet0 = (ground.sweetHoldGrace0 ?? ground.sweetHoldGrace ?? 0.08) as number;
        const sweetMin = (ground.sweetHoldGraceMin ?? 0.02) as number;
        const sweetGraceEff = Phaser.Math.Clamp(sweet0 / diff, sweetMin, sweet0);

        // If holdLockout, it's FAILED
        if (slime.holdLockout || slime.chargeEfficiency <= (ground.deadEfficiency ?? 0.05)) {
            rating = 'FAILED';
        } else if (wasInYellowZone || (proximity > 0.9 && !slime.reachedPeak)) {
            // Released in yellow zone = PERFECT
            rating = 'PERFECT';
        } else if (slime.reachedPeak && slime.postPeakHoldTime <= sweetGraceEff) {
            // Released just after peak within DYNAMIC sweet grace = still PERFECT
            rating = 'PERFECT';
        } else {
            // Everything else = NORMAL (early release or slightly late)
            rating = 'NORMAL';
        }

        // ===== ANTI-EXPLOIT: No fast-fall = no PERFECT above safe zone =====
        // Player must actually participate in fast-fall to get PERFECT rating
        const PIXELS_PER_METER = GameConfig.display.pixelsPerMeter ?? 50;
        const SAFE_ZONE_PX = 100 * PIXELS_PER_METER;
        const fallDist = Math.max(1, slime.landingFallDistance);
        const fastDist = slime.landingFastFallDistance || 0;
        const fastFallRatio = fastDist / fallDist;

        // If above 100m and didn't fast-fall at least 30% of distance, downgrade PERFECT
        if (slime.landingApexHeight > SAFE_ZONE_PX && fastFallRatio < 0.3 && rating === 'PERFECT') {
            rating = 'NORMAL'; // Must participate to get PERFECT
            if (GameConfig.debug) {
                console.log(`[ANTI-EXPLOIT] Downgraded PERFECT to NORMAL: fastFallRatio=${fastFallRatio.toFixed(2)}`);
            }
        }

        // ===== EXPONENTIAL GROWTH based on rating =====
        const g = GameConfig.gravity;

        // Base height calculation


        let targetH: number;

        // ===== UPDATE STREAK COUNTER =====
        if (rating === 'PERFECT') {
            slime.perfectStreak++;
        } else {
            slime.perfectStreak = 0; // Reset streak on non-perfect
        }

        // ===== HEALTH SYSTEM: Report landing to health manager =====
        slime.healthManager.onLanding(slime.lastApexHeight, rating, slime.holdLockout);

        // Check if slime died from this landing
        if (slime.healthManager.isDead) {
            // Don't launch - slime is dead
            // Reset to idle state (death will be handled by GameScene)
            slime.transitionTo('GROUNDED_IDLE');
            return;
        }

        // ===== STREAK MULTIPLIER: 3+ consecutive perfects = 2x force =====
        const streakBonus = slime.perfectStreak >= 3 ? 2.0 : 1.0;

        // ===== ELASTIC ENERGY CALCULATION REMOVED (Display only) =====

        if (rating === 'PERFECT') {
            // ===== EXPONENTIAL GROWTH FOR PERFECT =====
            // Higher heights = MORE growth per Perfect (exciting exponential feel)
            // Formula: growthRate = baseRate + heightBonus * log(height)

            // ===== DISTANCE-BASED ENERGY RATIO (prevents "last second charge" exploit) =====
            // Use actual fall distance instead of just lastApexHeight
            const fallDist = Math.max(1, slime.landingFallDistance || slime.lastApexHeight);
            const fastDist = Math.max(0, slime.landingFastFallDistance || 0);
            const distFactor = Phaser.Math.Clamp(fastDist / fallDist, 0, 1);

            const potentialEnergy = GameConfig.gravity * fallDist;
            const energyRatioRaw = Phaser.Math.Clamp(slime.fastFallEnergy / Math.max(1, potentialEnergy), 0, 1);

            // Dynamic time threshold: scales with fall distance to prevent high-altitude last-0.25s exploit
            const baseNeedTime = (GameConfig.air.fastFallChargeTime ?? 0.25) as number;
            const dynamicNeedTime = Phaser.Math.Clamp(baseNeedTime + 0.00005 * fallDist, baseNeedTime, 1.25);
            const timeFactor = Phaser.Math.Clamp(slime.fastFallTime / Math.max(1e-6, dynamicNeedTime), 0, 1);

            // Final energy ratio = energyRaw * distFactor * timeFactor
            // Must hold space for significant portion of DISTANCE, not just time
            const energyRatio = Phaser.Math.Clamp(energyRatioRaw * distFactor * timeFactor, 0, 1);

            // ===== EXPONENTIAL GROWTH RATE =====
            // Base multiplier + logarithmic height bonus
            // At 500px: 1.20x, At 2500px: 1.30x, At 10000px: 1.40x, etc.
            const baseGrowthRate = 0.15;  // 15% base growth
            const heightFactor = 0.05 * Math.log10(1 + slime.lastApexHeight / 100);  // +5% per order of magnitude
            const growthRate = baseGrowthRate + heightFactor;

            // Apply energy ratio - must press space to get growth
            // Apply energy ratio - must press space to get growth
            // Logic Update: Instead of just scaling the growth rate, we interpolate the BASE multiplier.
            // energyRatio 0.0 -> 0.85x reuse (Decay)
            // energyRatio 1.0 -> 1.0 + growthRate (Growth)
            // This ensures you MUST fast fall to gain height, even with Perfect.

            // Linear Interpolation: 
            // Multiplier = Lerp(0.85, 1.0 + growthRate, energyRatio)
            const minMult = 0.85;

            // STREAK BONUS LOGIC FIX:
            // Streak boosts the GROWTH POTENTIAL, not the base result.
            // If you have streak but NO energy, you still get 0.85x (Decay).
            // If you have streak AND energy, you get massive growth.
            const streakMultiplier = (streakBonus > 1.0) ? 1.5 : 1.0;
            const maxMult = 1.0 + (growthRate * streakMultiplier);

            let targetMult = minMult + (maxMult - minMult) * energyRatio;

            // Additive bonus also scales with energy
            const dh0 = 50 + slime.lastApexHeight * 0.05;  // 50px base + 5% of height
            let growthH = slime.lastApexHeight * targetMult + (dh0 * energyRatio);

            // REMOVED: growthH *= streakBonus; (This was the bug causing infinite height)

            targetH = growthH;

            // Debug logging
            if (GameConfig.debug) {
                console.log(`[PERFECT] H:${Math.round(slime.lastApexHeight)} Rate:${((targetMult - 1) * 100).toFixed(0)}% E:${energyRatio.toFixed(2)} -> ${Math.round(targetH)}`);
            }

        } else if (rating === 'NORMAL') {
            // ===== DYNAMIC PENALTY FOR NORMAL based on press distance =====
            // Penalty scales with how much player pressed during fall
            // distFactor = 0 (no press)   → 0.50x (harsh: lose 50%)
            // distFactor = 1 (full press) → 0.80x (mild: lose 20%)
            const fallDist = Math.max(1, slime.landingFallDistance || slime.lastApexHeight);
            const fastDist = Math.max(0, slime.landingFastFallDistance || 0);
            const distFactor = Phaser.Math.Clamp(fastDist / fallDist, 0, 1);

            const normalMultMin = 0.50;  // No press = 50% height
            const normalMultMax = 0.80;  // Full press = 80% height
            const normalMult = normalMultMin + (normalMultMax - normalMultMin) * distFactor;

            targetH = slime.lastApexHeight * normalMult;

            if (GameConfig.debug) {
                console.log(`[NORMAL] Press:${(distFactor * 100).toFixed(0)}% Mult:${normalMult.toFixed(2)} -> ${Math.round(targetH)}`);
            }

        } else {
            // ===== DEVASTATING PENALTY FOR FAILED =====
            // Lose 60% of height - massive punishment
            const failedMult = 0.40;  // Was 0.70, now 0.40
            targetH = slime.lastApexHeight * failedMult;
        }

        // Ensure minimum launch
        targetH = Math.max(targetH, 50);

        const vTarget = Math.sqrt(2 * g * targetH);
        let vLaunch = vTarget;

        // ===== CAPS =====
        vLaunch = Math.max(vLaunch, Math.abs(GameConfig.ground.baseLaunchVelocity));

        // Hard cap applies to everyone
        vLaunch = Math.min(vLaunch, GameConfig.ground.hardCapVelocity);

        // ===== SHOW FEEDBACK =====
        slime.showFeedback(rating);



        // ===== DEBUG OUTPUT =====
        if (GameConfig.debug) {
            console.log(`[Launch] Rating:${rating} Streak:${slime.perfectStreak} Bonus:${streakBonus}x Apex:${Math.round(slime.lastApexHeight)}px -> TargetH:${Math.round(targetH)}px`);
        }

        // Visual
        slime.groundRecoverTau = (ground.releaseRecoverTime ?? 0.12) as number;
        slime.vy = -vLaunch;

        // ===== AUTO BULLET TIME CALCULATION =====
        // Physics: apex height = v^2 / (2g) where v = vLaunch
        const gravity = GameConfig.gravity;
        const predictedApexPx = (vLaunch * vLaunch) / (2 * gravity);
        const pxPerM = GameConfig.display.pixelsPerMeter ?? 50;
        const predictedApexMeters = predictedApexPx / pxPerM;

        // Store launch position and predicted apex
        slime.launchY = slime.getGroundY();
        slime.predictedApexHeight = predictedApexPx;
        slime.autoBTActivated = false;
        slime.launchRating = rating; // Store rating for bullet time/monster adjustments

        // Eligibility: PERFECT or NORMAL judgment AND predicted apex > 50 meters
        // NORMAL 也触发子弹时间和怪物生成，但效果减弱
        slime.autoBTEligible = (rating === 'PERFECT' || rating === 'NORMAL') && (predictedApexMeters > 50);

        if (GameConfig.debug && slime.autoBTEligible) {
            console.log(`[AutoBT] Eligible! Rating: ${rating} | Predicted apex: ${Math.round(predictedApexMeters)}m`);
        }

        // ===== 动态导演系统：在 PERFECT/NORMAL 跳跃顶点生成怪物 =====
        // PERFECT: 100% 怪物数量，100% 材料掉率
        // NORMAL: 50% 怪物数量，50% 材料掉率（惩罚但不空窗）
        if (slime.autoBTEligible) {
            const scene = slime.scene as any;
            if (scene.monsterManager) {
                const countMultiplier = (rating === 'PERFECT') ? 1.0 : 0.5; // NORMAL = 50% 怪物
                scene.monsterManager.spawnApexMonsters(predictedApexPx, slime.currentLane, countMultiplier);
            }
            // 设置材料掉落倍率 (NORMAL = 50%)
            if (scene.pickupManager) {
                scene.pickupManager.materialDropMultiplier = (rating === 'PERFECT') ? 1.0 : 0.5;
            }
        }

        slime.transitionTo('AIRBORNE');
        slime.currentCompression = 0;
        slime.y = slime.getGroundY() - 0.5;
        slime.contactHasInput = false;
        slime.reachedPeak = false;
        slime.postPeakHoldTime = 0;
        slime.holdLockout = false;
        slime.isInYellowZone = false;
        slime.prevVyForApex = slime.vy;
    }

    /**
     * Update player sprite tint based on charge phase for visual feedback
     * - Charging: Gradual brightening (white tint)
     * - Yellow Zone: Golden glow (pulsing)
     * - Overheld (holdLockout): Red warning
     */
    private updateChargeTint(slime: Slime): void {
        const proximity = slime.chargeProximity ?? 0;

        if (slime.holdLockout) {
            // FAILED: Red warning tint
            slime.graphics.setTint(0xff4444);
        } else if (slime.isInYellowZone || slime.reachedPeak) {
            // PERFECT WINDOW: Pulsing golden/green tint
            // Use time for pulsing effect
            const time = Date.now() / 1000;
            const pulse = 0.5 + 0.5 * Math.sin(time * 12); // Fast pulse

            // Interpolate between gold (0xffff00) and green (0x00ff00)
            const r = Math.floor(255 * (1 - pulse * 0.3));
            const g = 255;
            const b = Math.floor(pulse * 100);
            const color = (r << 16) | (g << 8) | b;
            slime.graphics.setTint(color);
        } else if (proximity > 0.3) {
            // CHARGING: Gradual white brightening based on proximity
            // From normal (0xffffff at 0.3) to bright (0xccffcc at 0.9)
            const t = (proximity - 0.3) / 0.6; // 0 to 1
            const brightness = Math.floor(255 - t * 50); // 255 → 205
            const green = 255;
            const blueRed = brightness;
            const color = (blueRed << 16) | (green << 8) | blueRed;
            slime.graphics.setTint(color);
        } else {
            // Normal: No tint
            slime.graphics.clearTint();
        }
    }
}
