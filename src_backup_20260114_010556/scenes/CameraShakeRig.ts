import Phaser from 'phaser'; // Import for Math.Clamp if needed, or use Math
import { GameConfig } from '../config';

export class CameraShakeRig {
    // Current smoothed intensities (0..1)
    private currentChargeIntensity: number = 0;
    private currentAirIntensity: number = 0;

    // Time accumulator for sine waves
    private time: number = 0;

    // Output offsets
    public shakeX: number = 0;
    public shakeY: number = 0;

    constructor() {
    }

    public update(dt: number, targetChargeIntensity: number, targetAirIntensity: number) {
        const cfg = GameConfig.cameraShake;
        if (!cfg.enable) {
            this.shakeX = 0;
            this.shakeY = 0;
            return;
        }

        // 1. Smoothly approach target intensities
        // Distinct tau for rising vs falling edges
        const tauCharge = targetChargeIntensity > this.currentChargeIntensity ? cfg.tauIn : cfg.tauOut;
        this.currentChargeIntensity = this.approach(this.currentChargeIntensity, targetChargeIntensity, dt, tauCharge);

        const tauAir = targetAirIntensity > this.currentAirIntensity ? cfg.tauIn : cfg.tauOut;
        this.currentAirIntensity = this.approach(this.currentAirIntensity, targetAirIntensity, dt, tauAir);

        // 2. Advance time
        this.time += dt;

        // 3. Generate Noise
        // We calculate separate components and sum them up

        // --- Component A: CHARGE SHAKE ---
        let chargeX = 0;
        let chargeY = 0;

        if (this.currentChargeIntensity > 0.001) {
            const c = cfg.charge;
            // Frequency increases with intensity
            const freq = this.lerp(c.freqMin, c.freqMax, this.currentChargeIntensity);

            // Amplitude scaled by intensity
            // Non-linear amplitude response (square) feels better
            const ampFactor = this.currentChargeIntensity * this.currentChargeIntensity;
            const ampX = c.ampXMax * ampFactor;
            const ampY = c.ampYMax * ampFactor;

            // Multi-sine noise
            // X: 2 wages
            chargeX = (Math.sin(this.time * freq) + 0.5 * Math.sin(this.time * freq * 1.3 + 1.2)) * ampX;
            // Y: 2 waves (phase shifted)
            chargeY = (Math.sin(this.time * freq * 1.1 + 2.4) + 0.5 * Math.cos(this.time * freq * 0.9)) * ampY;
        }

        // --- Component B: AIR TURBULENCE ---
        let airX = 0;
        let airY = 0;

        if (this.currentAirIntensity > 0.001) {
            const a = cfg.air;
            const freq = this.lerp(a.freqMin, a.freqMax, this.currentAirIntensity);

            // Linear or powered amplitude
            const ampFactor = this.currentAirIntensity;
            const ampX = a.ampXMax * ampFactor;
            const ampY = a.ampYMax * ampFactor;

            // X turbulence (more distinct horizontal drift)
            airX = (Math.sin(this.time * freq) + 0.8 * Math.sin(this.time * freq * 0.4 + 4.1)) * ampX;
            // Y turbulence
            airY = (Math.sin(this.time * freq * 0.7 + 1.2) * 0.6) * ampY;
        }

        // 4. Sum and Clamp
        const totalX = chargeX + airX;
        const totalY = chargeY + airY;

        // Soft clamp to prevent extreme shakes
        this.shakeX = Phaser.Math.Clamp(totalX, -cfg.maxTotalAmpX, cfg.maxTotalAmpX);
        this.shakeY = Phaser.Math.Clamp(totalY, -cfg.maxTotalAmpY, cfg.maxTotalAmpY);
    }

    // Utility: Simple linear interpolation
    private lerp(a: number, b: number, t: number): number {
        return a + (b - a) * t;
    }

    // Utility: Async approach (exponential decay toward target)
    private approach(current: number, target: number, dt: number, tau: number): number {
        if (tau <= 0) return target;
        const alpha = 1.0 - Math.exp(-dt / tau);
        return current + (target - current) * alpha;
    }
}
