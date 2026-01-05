import Phaser from 'phaser';
import { GameConfig } from '../config';

/**
 * Spring physics-based deformable ground
 * Uses discrete Laplacian for neighbor coupling, creating wave propagation effects
 * Each column is a point connected by springs
 */
export default class Ground {
    private blocks: Phaser.GameObjects.Image[][] = [];
    private scene: Phaser.Scene;
    public y: number;
    private width: number;

    // Block configuration
    private readonly BLOCK_SIZE = 64;
    private readonly LAYERS = 8;
    private readonly BLOCKS_PER_ROW: number;

    // Spring physics state
    private yOffset: number[] = [];   // Current Y offset for each column (positive = down)
    private yVel: number[] = [];      // Velocity for each column
    private force: number[] = [];     // Cached force array (avoid per-frame allocation)

    // Physics constants (tune these for feel)
    private readonly TENSION = 180;    // kt: neighbor coupling
    private readonly STIFFNESS = 90;   // ks: spring stiffness back to 0
    private readonly DAMPING = 18;     // c: damping
    private readonly MAX_OFFSET = 60;  // Maximum deformation depth

    // Impact Shake State
    private shakeStrength01: number = 0;
    private shakePhase: number = 0;
    private shakeFreqHz: number = 0;
    private shakeDecayTau: number = 0.12;

    // Charge Tremor State
    private chargeStr: number = 0; // Continuous tremor from charging

    // Ripple State
    private rippleOffset: number[] = []; // Visual offset only
    private rippleVel: number[] = [];    // Ripple velocity

    constructor(scene: Phaser.Scene, y: number) {
        this.scene = scene;
        this.y = y;
        this.width = scene.scale.width;
        this.BLOCKS_PER_ROW = Math.ceil(this.width / this.BLOCK_SIZE) + 4;

        // Initialize physics arrays
        for (let col = 0; col < this.BLOCKS_PER_ROW; col++) {
            this.yOffset[col] = 0;
            this.yVel[col] = 0;
            this.force[col] = 0;

            // Ripple arrays
            this.rippleOffset[col] = 0;
            this.rippleVel[col] = 0;
        }

        this.createBlockGrid();
    }

    private createBlockGrid() {
        for (let row = 0; row < this.LAYERS; row++) {
            this.blocks[row] = [];
            for (let col = 0; col < this.BLOCKS_PER_ROW; col++) {
                const x = col * this.BLOCK_SIZE + this.BLOCK_SIZE / 2;
                const baseY = this.y + row * this.BLOCK_SIZE + this.BLOCK_SIZE / 2;

                const block = this.scene.add.image(x, baseY, 'ground_block')
                    .setDisplaySize(this.BLOCK_SIZE, this.BLOCK_SIZE)
                    .setDepth(5 - row * 0.1);

                this.blocks[row].push(block);
            }
        }
    }

    /**
     * Triggered by player landing (Visual Impact)
     */
    public onLandingImpact(impactX: number, intensity01: number) {
        const cfg = GameConfig.groundShake;
        if (!cfg.enable) return;

        // 1. Global Shake Impulse
        this.shakeStrength01 = Math.max(this.shakeStrength01, intensity01);
        this.shakeFreqHz = Phaser.Math.Linear(cfg.freqMin, cfg.freqMax, intensity01);
        this.shakePhase = Math.random() * Math.PI * 2;
        this.shakeDecayTau = cfg.decayTau;

        // 2. Local Ripple Impulse
        if (cfg.ripple.enable) {
            const centerCol = Math.floor(impactX / this.BLOCK_SIZE);
            const r = cfg.ripple.radiusCols;

            // Apply impulse to columns
            for (let i = Math.max(0, centerCol - r); i <= Math.min(this.BLOCKS_PER_ROW - 1, centerCol + r); i++) {
                const dist = Math.abs(i - centerCol);
                const normDist = dist / r; // 0..1

                // Profile: bell curve or pow falloff
                const profile = Math.pow(1 - normDist, cfg.ripple.falloffPow);
                const impulse = intensity01 * cfg.ripple.impulseMaxPx * profile;

                if (impulse > 0.5) {
                    this.rippleVel[i] += impulse * 20; // Velocity impulse
                }
            }
        }
    }

    /**
     * Set continuous tremor intensity (from ChargingState)
     */
    public setChargeTremor(intensity01: number) {
        this.chargeStr = intensity01;
    }

    /**
     * Spring physics simulation with wave propagation
     */
    public render(dt: number, depressionDepth: number, playerX?: number) {
        const cfg = GameConfig.groundShake;

        // --- 1. Update Shake Intensity & Offsets ---
        let globalOffsetX = 0;
        let globalOffsetY = 0;

        if (cfg.enable && this.shakeStrength01 > 0.001) {
            const decay = Math.exp(-dt / this.shakeDecayTau);
            this.shakeStrength01 *= decay;

            this.shakePhase += Math.PI * 2 * this.shakeFreqHz * dt;
            globalOffsetY = Math.sin(this.shakePhase) * cfg.ampYMaxPx * this.shakeStrength01;
            globalOffsetX = Math.sin(this.shakePhase * 1.7 + 1.3) * cfg.ampXMaxPx * this.shakeStrength01;
        }

        if (this.chargeStr > 0.01) {
            globalOffsetY += (Math.random() - 0.5) * 4 * this.chargeStr;
            globalOffsetX += (Math.random() - 0.5) * 2 * this.chargeStr;
        }

        if (cfg.enable) {
            const limit = cfg.globalClamp;
            globalOffsetX = Phaser.Math.Clamp(globalOffsetX, -limit, limit);
            globalOffsetY = Phaser.Math.Clamp(globalOffsetY, -limit, limit);
        }

        // --- 2. Update Ripple Physics ---
        if (cfg.ripple.enable) {
            const k = cfg.ripple.stiffness;
            const d = cfg.ripple.damping;

            for (let i = 0; i < this.BLOCKS_PER_ROW; i++) {
                const force = -k * this.rippleOffset[i] - d * this.rippleVel[i];
                this.rippleVel[i] += force * dt;
                this.rippleOffset[i] += this.rippleVel[i] * dt;

                if (Math.abs(this.rippleOffset[i]) < 0.5 && Math.abs(this.rippleVel[i]) < 2) {
                    this.rippleOffset[i] = 0;
                    this.rippleVel[i] = 0;
                }
            }
        }

        // --- 3. Ground Physics Simulation (Real Deformation) ---
        const centerCol = playerX !== undefined
            ? Math.floor(playerX / this.BLOCK_SIZE)
            : Math.floor(this.BLOCKS_PER_ROW / 2);

        // Calculate forces
        for (let i = 0; i < this.BLOCKS_PER_ROW; i++) {
            this.force[i] = 0;
        }

        if (depressionDepth > 0) {
            const sigma = 1.6;
            const P = depressionDepth * 80;
            const radius = 6;

            for (let i = Math.max(0, centerCol - radius); i <= Math.min(this.BLOCKS_PER_ROW - 1, centerCol + radius); i++) {
                const d = i - centerCol;
                const g = Math.exp(-(d * d) / (2 * sigma * sigma));
                this.force[i] += P * g;
            }
        }

        // Integrate physics
        const subSteps = 2;
        const h = dt / subSteps;

        for (let s = 0; s < subSteps; s++) {
            for (let i = 0; i < this.BLOCKS_PER_ROW; i++) {
                const y = this.yOffset[i];
                const v = this.yVel[i];

                const yL = this.yOffset[Math.max(0, i - 1)];
                const yR = this.yOffset[Math.min(this.BLOCKS_PER_ROW - 1, i + 1)];

                const laplacian = (yL - 2 * y + yR);

                const a = this.TENSION * laplacian
                    - this.STIFFNESS * y
                    - this.DAMPING * v
                    + this.force[i];

                this.yVel[i] = v + a * h;
                this.yOffset[i] = y + this.yVel[i] * h;

                this.yOffset[i] = Math.max(-this.MAX_OFFSET * 0.3, Math.min(this.MAX_OFFSET, this.yOffset[i]));
            }
        }

        // --- 4. Apply Visual Position to Sprites ---
        for (let row = 0; row < this.LAYERS; row++) {
            const isBottomRow = (row === this.LAYERS - 1);
            const layerFactor = isBottomRow ? 0 : Math.exp(-row / 2.2);

            for (let col = 0; col < this.BLOCKS_PER_ROW; col++) {
                const block = this.blocks[row][col];
                const baseY = this.y + row * this.BLOCK_SIZE + this.BLOCK_SIZE / 2;

                // Real Deformation
                const deformY = this.yOffset[col] * layerFactor;

                // Visual Only Overlays
                const visualGlobalY = globalOffsetY * Math.max(0.2, layerFactor);
                const visualGlobalX = globalOffsetX * Math.max(0.2, layerFactor);

                const visualRippleY = (cfg.ripple.enable ? this.rippleOffset[col] : 0) * layerFactor;

                // Final Position
                const finalX = (col * this.BLOCK_SIZE + this.BLOCK_SIZE / 2) + visualGlobalX;
                const finalY = baseY + deformY + visualGlobalY + visualRippleY;

                block.setPosition(finalX, finalY);
            }
        }
    }

    /**
     * Get the surface offset at a given X position
     */
    public getSurfaceOffsetAt(x: number): number {
        const col = Math.floor(x / this.BLOCK_SIZE);
        const clampedCol = Math.max(0, Math.min(this.BLOCKS_PER_ROW - 1, col));
        return this.yOffset[clampedCol] || 0;
    }
}
