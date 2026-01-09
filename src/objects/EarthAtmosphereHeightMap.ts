/**
 * EarthAtmosphereHeightMap - Logarithmic Compression Mapping
 * 
 * Maps game height (0-3500m) to virtual reality atmospheric altitude (0-120km)
 * using a logarithmic curve for progressive deceleration effect.
 * 
 * Design Philosophy:
 * - Low altitude (0-500m): Fast progression into blue sky (easy reward)
 * - Mid altitude (500-2000m): Moderate progression (steady climb feeling)
 * - High altitude (2000-3500m): Slow progression into space (hard-earned achievement)
 * 
 * Formula: virtualKm = 120 * log(1 + gameMeters / k) / log(1 + 3500 / k)
 * 
 * Where k controls the curve steepness:
 * - Smaller k = faster initial progression, slower later
 * - Larger k = more linear progression
 * 
 * Player Experience:
 * - Early game: Quick visual feedback (haze → blue sky in first few jumps)
 * - Mid game: Steady darkening (player feels progress)
 * - Late game: Diminishing returns (reaching pure black space requires mastery)
 */
export default class EarthAtmosphereHeightMap {
    // Maximum game height (meters)
    private static readonly MAX_GAME_METERS = 3500;

    // Virtual altitude ceiling (km)
    private static readonly MAX_VIRT_KM = 120;

    // Curve shape parameter (smaller = steeper early, gentler late)
    // Recommended range: 300-800
    // - 300: Very fast early progression, very slow late game
    // - 500: Balanced logarithmic feel
    // - 800: Softer curve, more uniform progression
    private static readonly CURVE_SCALE = 500;

    /**
     * Map game meters to virtual reality altitude using logarithmic curve.
     * 
     * This creates a natural "easy start, hard finish" progression where:
     * - First 500m gets you ~40% of the color journey (fast reward)
     * - Next 1500m gets you ~35% (steady progress)
     * - Final 1500m gets you last ~25% (slow grind to pure black)
     * 
     * @param gameMeters - Player height above ground in game meters
     * @returns Virtual reality altitude in kilometers (0-120 km)
     */
    static mapGameMetersToVirtualKm(gameMeters: number): number {
        // Clamp to valid range
        const clamped = Math.max(0, Math.min(this.MAX_GAME_METERS, gameMeters));

        // Logarithmic mapping with scale parameter
        // log(1 + x/k) creates smooth curve starting at 0
        const numerator = Math.log(1 + clamped / this.CURVE_SCALE);
        const denominator = Math.log(1 + this.MAX_GAME_METERS / this.CURVE_SCALE);

        const t = numerator / denominator;
        const virtKm = this.MAX_VIRT_KM * t;

        return virtKm;
    }

    /**
     * Map game meters directly to normalized LUT sample coordinate (0..1).
     * 
     * @param gameMeters - Player height above ground in game meters
     * @returns Normalized coordinate (0..1) for LUT sampling
     */
    static mapGameMetersToT(gameMeters: number): number {
        const virtKm = this.mapGameMetersToVirtualKm(gameMeters);
        const t = Math.max(0, Math.min(1, virtKm / this.MAX_VIRT_KM));
        return t;
    }

    /**
     * Get atmospheric layer name for a given game height (for debugging/UI).
     * 
     * @param gameMeters - Player height above ground in game meters
     * @returns Human-readable layer name
     */
    static getLayerName(gameMeters: number): string {
        const virtKm = this.mapGameMetersToVirtualKm(gameMeters);

        if (virtKm < 2) return 'Planetary Boundary Layer';
        if (virtKm < 12) return 'Troposphere';
        if (virtKm < 50) return 'Stratosphere';
        if (virtKm < 85) return 'Mesosphere';
        if (virtKm < 100) return 'Near Space';
        return 'Outer Space';
    }

    /**
     * Get debug info for current height mapping.
     * 
     * @param gameMeters - Player height above ground in game meters
     * @returns Debug information object
     */
    static getDebugInfo(gameMeters: number): {
        gameMeters: number;
        virtualKm: number;
        t: number;
        layer: string;
        progressPercent: number;
    } {
        const virtKm = this.mapGameMetersToVirtualKm(gameMeters);
        const t = this.mapGameMetersToT(gameMeters);

        return {
            gameMeters: Math.round(gameMeters * 10) / 10,
            virtualKm: Math.round(virtKm * 100) / 100,
            t: Math.round(t * 1000) / 1000,
            layer: this.getLayerName(gameMeters),
            progressPercent: Math.round(t * 100)
        };
    }

    /**
     * Get recommended heights for visual milestone testing.
     * Returns key heights where visual changes should be noticeable.
     */
    static getTestMilestones(): Array<{ height: number; virtKm: number; description: string }> {
        const milestones = [
            { height: 0, desc: 'Ground - hazy/warm' },
            { height: 100, desc: 'Early jump - haze clearing' },
            { height: 250, desc: 'Low altitude - entering blue' },
            { height: 500, desc: 'Quarter mark - clear blue sky' },
            { height: 1000, desc: 'Mid-low - sky darkening' },
            { height: 1500, desc: 'Mid point - deep blue' },
            { height: 2000, desc: 'Mid-high - indigo transition' },
            { height: 2500, desc: 'High - navy blue' },
            { height: 3000, desc: 'Very high - near black' },
            { height: 3500, desc: 'Maximum - pure space black' }
        ];

        return milestones.map(m => ({
            height: m.height,
            virtKm: Math.round(this.mapGameMetersToVirtualKm(m.height) * 100) / 100,
            description: m.desc
        }));
    }
}
