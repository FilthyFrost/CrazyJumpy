import Phaser from 'phaser';
import EarthAtmosphereHeightMap from './EarthAtmosphereHeightMap';
import { GameConfig } from '../config';

/**
 * SkyGradientLUT - Height-Driven Background Color System
 * 
 * Maps player height (0-3500m) to background color using:
 * 1. Earth atmosphere piecewise mapping (0-3500m → 0-120km virtual)
 * 2. Vertical gradient LUT sampling
 * 
 * The gradient image is sampled once at initialization for optimal performance.
 * Background color is applied via camera.setBackgroundColor() for proper viewport coverage.
 * 
 * Features:
 * - One-time pixel read at initialization (no runtime getImageData calls)
 * - Earth atmospheric layer mapping with realistic transitions
 * - Smooth color transitions with lerp
 * - Camera background color (zoom-safe)
 */
export default class SkyGradientLUT {
    private scene: Phaser.Scene;
    private lutKey: string;
    private groundYpx: number;
    private pxPerMeter: number;
    private smoothFactor: number;

    // LUT data
    private lutColors: number[] = [];
    private lutHeight: number = 0;

    // Current background color state
    private currentColor: number = 0x87CEEB; // Default sky blue
    private targetColor: number = 0x87CEEB;

    /**
     * @param scene - Phaser scene
     * @param lutKey - Asset key for gradient LUT image
     * @param groundYpx - Ground Y position in pixels (world coordinates)
     * @param pxPerMeter - Pixels per meter conversion (default 50)
     * @param smoothFactor - Color lerp smoothing (0.05-0.12, default 0.08)
     */
    constructor(
        scene: Phaser.Scene,
        lutKey: string = "渐变色调图",
        groundYpx: number,
        pxPerMeter: number = 50,
        smoothFactor: number = 0.08
    ) {
        this.scene = scene;
        this.lutKey = lutKey;
        this.groundYpx = groundYpx;
        this.pxPerMeter = pxPerMeter;
        this.smoothFactor = smoothFactor;

        this.initialize();
    }

    /**
     * Initialize the LUT by reading and caching all pixel colors from the gradient image.
     * This is called ONCE during construction for optimal performance.
     */
    private initialize(): void {
        const texture = this.scene.textures.get(this.lutKey);
        if (!texture || texture.key === '__MISSING') {
            console.error(`[SkyGradientLUT] Texture "${this.lutKey}" not found!`);
            return;
        }

        const source = texture.getSourceImage() as HTMLImageElement;
        if (!source) {
            console.error('[SkyGradientLUT] Failed to get source image');
            return;
        }

        // Create a temporary canvas to read pixel data
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: false });
        if (!ctx) {
            console.error('[SkyGradientLUT] Failed to get canvas context');
            return;
        }

        canvas.width = source.width;
        canvas.height = source.height;
        ctx.drawImage(source, 0, 0);

        this.lutHeight = source.height;

        // Sample the center column (x = width/2) to avoid edge artifacts
        const sampleX = Math.floor(source.width / 2);

        // Read all pixels from top to bottom (y=0 is top in image coordinates)
        const imageData = ctx.getImageData(sampleX, 0, 1, this.lutHeight);
        const data = imageData.data;

        this.lutColors = [];
        for (let y = 0; y < this.lutHeight; y++) {
            const i = y * 4; // RGBA format
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];

            // Convert RGB to Phaser color integer
            const color = (r << 16) | (g << 8) | b;
            this.lutColors.push(color);
        }

        console.log(`[SkyGradientLUT] Initialized with ${this.lutColors.length} colors`);

        // Set initial color based on ground level
        this.update(this.groundYpx);
        this.currentColor = this.targetColor; // No smooth transition on first frame
        this.applyBackgroundColor();
    }

    /**
     * Update the background color based on player's current Y position.
     * Call this every frame from the scene's update() method.
     * 
     * Algorithm:
     * 1. Calculate game height in meters
     * 2. Map to virtual atmospheric altitude (0-120km) using piecewise interpolation
     * 3. Normalize to LUT coordinate (0..1)
     * 4. Sample LUT and apply smooth color transition
     * 
     * @param playerYpx - Player's current world Y position in pixels
     */
    update(playerYpx: number): void {
        if (this.lutColors.length === 0) return;

        // Calculate height above ground in game meters
        const heightPx = this.groundYpx - playerYpx;
        const baseGameMeters = heightPx / this.pxPerMeter;

        // Apply configurable height offset to shift initial color sampling
        const heightOffset = GameConfig.display.skyGradientHeightOffset ?? 0;
        const gameMeters = baseGameMeters + heightOffset;

        // Map game meters to normalized LUT coordinate using Earth atmosphere mapping
        // This compresses 0-3500m game height to 0-120km virtual reality altitude
        const t = EarthAtmosphereHeightMap.mapGameMetersToT(gameMeters);

        // Map to LUT pixel index (inverted because image y=0 is top)
        const lutY = Math.round((1 - t) * (this.lutHeight - 1));
        const clampedY = Math.max(0, Math.min(this.lutHeight - 1, lutY));

        // Get target color from LUT
        this.targetColor = this.lutColors[clampedY];

        // Smooth transition
        this.currentColor = this.lerpColor(this.currentColor, this.targetColor, this.smoothFactor);

        // Apply to background
        this.applyBackgroundColor();
    }

    /**
     * Apply the current color to the camera background.
     * This ensures full viewport coverage regardless of zoom/scale.
     */
    private applyBackgroundColor(): void {
        this.scene.cameras.main.setBackgroundColor(this.currentColor);
    }

    /**
     * Linear interpolation between two colors.
     * 
     * @param colorA - Start color (integer)
     * @param colorB - End color (integer)
     * @param t - Interpolation factor (0..1)
     * @returns Interpolated color (integer)
     */
    private lerpColor(colorA: number, colorB: number, t: number): number {
        const rA = (colorA >> 16) & 0xFF;
        const gA = (colorA >> 8) & 0xFF;
        const bA = colorA & 0xFF;

        const rB = (colorB >> 16) & 0xFF;
        const gB = (colorB >> 8) & 0xFF;
        const bB = colorB & 0xFF;

        const r = Math.round(rA + (rB - rA) * t);
        const g = Math.round(gA + (gB - gA) * t);
        const b = Math.round(bA + (bB - bA) * t);

        return (r << 16) | (g << 8) | b;
    }

    /**
     * Update ground Y position (e.g., if camera or world changes).
     */
    setGroundY(groundYpx: number): void {
        this.groundYpx = groundYpx;
    }

    /**
     * Clean up resources.
     */
    destroy(): void {
        this.lutColors = [];
    }
}
