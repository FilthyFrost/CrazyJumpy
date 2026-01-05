import Phaser from 'phaser';

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
    private readonly BLOCK_SIZE = 16;
    private readonly LAYERS = 8;
    private readonly BLOCKS_PER_ROW: number;

    // Spring physics state
    private yOffset: number[] = [];   // Current Y offset for each column (positive = down)
    private yVel: number[] = [];      // Velocity for each column
    private force: number[] = [];     // Cached force array (avoid per-frame allocation)

    // Physics constants (tune these for feel)
    private readonly TENSION = 180;    // kt: neighbor coupling (higher = smoother, more wave propagation)
    private readonly STIFFNESS = 90;   // ks: spring stiffness back to 0 (higher = faster rebound)
    private readonly DAMPING = 18;     // c: damping (higher = more "premium", less jitter)
    private readonly MAX_OFFSET = 60;  // Maximum deformation depth in pixels (increased for better visual feedback)

    constructor(scene: Phaser.Scene, y: number) {
        this.scene = scene;
        this.y = y;
        this.width = scene.scale.width;
        this.BLOCKS_PER_ROW = Math.ceil(this.width / this.BLOCK_SIZE) + 4;

        // Initialize physics arrays
        for (let col = 0; col < this.BLOCKS_PER_ROW; col++) {
            this.yOffset[col] = 0;
            this.yVel[col] = 0;
            this.force[col] = 0;  // Pre-allocate force array
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
     * Spring physics simulation with wave propagation
     * @param dt - Time delta in seconds (provided by fixed timestep loop)
     * @param depressionDepth - Current ground compression from player
     * @param playerX - Player's X position
     */
    render(dt: number, depressionDepth: number, playerX?: number) {
        // dt is now provided by GameScene's fixed timestep loop
        // No need to read from game.loop.delta or clamp

        const centerCol = playerX !== undefined
            ? Math.floor((playerX + this.BLOCK_SIZE) / this.BLOCK_SIZE)
            : Math.floor(this.BLOCKS_PER_ROW / 2);

        // 1) Calculate external force (pressure distribution)
        // Positive force = push DOWN (into ground)
        // Clear force array (reuse instead of allocating)
        for (let i = 0; i < this.BLOCKS_PER_ROW; i++) {
            this.force[i] = 0;
        }

        if (depressionDepth > 0) {
            const sigma = 1.6;               // Foot width (in columns)
            const P = depressionDepth * 80;  // Pressure intensity (reduced for subtler effect)
            const radius = 6;

            for (let i = Math.max(0, centerCol - radius); i <= Math.min(this.BLOCKS_PER_ROW - 1, centerCol + radius); i++) {
                const d = i - centerCol;
                const g = Math.exp(-(d * d) / (2 * sigma * sigma));
                this.force[i] += P * g;  // Positive = push down
            }
        }

        // 2) Physics update with substeps for stability
        const subSteps = 2;
        const h = dt / subSteps;

        for (let s = 0; s < subSteps; s++) {
            for (let i = 0; i < this.BLOCKS_PER_ROW; i++) {
                const y = this.yOffset[i];
                const v = this.yVel[i];

                // Get neighbor offsets (clamped to boundaries)
                const yL = this.yOffset[Math.max(0, i - 1)];
                const yR = this.yOffset[Math.min(this.BLOCKS_PER_ROW - 1, i + 1)];

                // Discrete Laplacian: neighbor coupling
                const laplacian = (yL - 2 * y + yR);

                // Acceleration from all forces
                const a =
                    this.TENSION * laplacian
                    - this.STIFFNESS * y
                    - this.DAMPING * v
                    + this.force[i];

                // Semi-implicit Euler integration
                this.yVel[i] = v + a * h;
                this.yOffset[i] = y + this.yVel[i] * h;

                // Clamp to maximum offset (prevent excessive deformation)
                this.yOffset[i] = Math.max(-this.MAX_OFFSET * 0.3, Math.min(this.MAX_OFFSET, this.yOffset[i]));
            }
        }

        // 3) Visual update: apply offsets to blocks with layer decay
        for (let row = 0; row < this.LAYERS; row++) {
            // Exponential layer decay: deeper = more stable
            // Skip last layer entirely (anchored to bedrock)
            const isBottomRow = (row === this.LAYERS - 1);
            const layerFactor = isBottomRow ? 0 : Math.exp(-row / 2.2);

            for (let col = 0; col < this.BLOCKS_PER_ROW; col++) {
                const block = this.blocks[row][col];
                const baseY = this.y + row * this.BLOCK_SIZE + this.BLOCK_SIZE / 2;
                const offsetY = this.yOffset[col] * layerFactor;

                block.setY(baseY + offsetY);
                block.setScale(1, 1);
            }
        }
    }

    /**
     * Get the surface offset at a given X position
     * Used for player collision - player should follow ground surface
     */
    public getSurfaceOffsetAt(x: number): number {
        const col = Math.floor((x + this.BLOCK_SIZE) / this.BLOCK_SIZE);
        const clampedCol = Math.max(0, Math.min(this.BLOCKS_PER_ROW - 1, col));
        // Return only top layer offset (layerFactor = 1 for row 0)
        return this.yOffset[clampedCol] || 0;
    }
}
