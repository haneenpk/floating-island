export interface IslandColors {
  rock: number;
  rockDark: number;
  strataAccent: number;
  soil: number;
  grass: number;
  grassBright: number;
  moss: number;
  flowerWarm: number;
  flowerCool: number;
}

export interface IslandScatterDensity {
  rocks: number;
  bushes: number;
  flowers: number;
  roots: number;
}

export interface IslandRiverConfig {
  start: { radial: number; angle: number };
  bend: { radial: number; angle: number };
  endAngle: number;
  width: number;
  depth: number;
}

export interface IslandSpire {
  angle: number;
  weight: number;
}

export interface IslandRimBulge {
  angle: number;
  amount: number;
}

export interface IslandTerrainPad {
  radial: number;
  angle: number;
  radius: number;
  blend: number;
}

export interface IslandMound {
  radial: number;
  angle: number;
  radius: number;
  height: number;
}

export interface IslandParams {
  seed: number;
  width: number;
  height: number;
  cliffSteepness: number;
  erosion: number;
  cracks: number;
  moss: number;
  grassThickness: number;
  terraces: number;
  terraceStrength: number;
  detail: number;
  river: IslandRiverConfig | null;
  spires: IslandSpire[];
  rimBulges: IslandRimBulge[];
  mounds: IslandMound[];
  pads: IslandTerrainPad[];
  scatter: IslandScatterDensity;
  colors: IslandColors;
}

export type IslandParamOverrides = Partial<
  Omit<IslandParams, "colors" | "scatter">
> & {
  colors?: Partial<IslandColors>;
  scatter?: Partial<IslandScatterDensity>;
};

const defaultParams: IslandParams = {
  seed: 1,
  width: 24,
  height: 19,
  cliffSteepness: 0.78,
  erosion: 0.85,
  cracks: 0.75,
  moss: 0.4,
  grassThickness: 2.4,
  terraces: 5,
  terraceStrength: 0.85,
  detail: 1,
  river: null,
  // Default camera looks in from azimuth ~1.0 rad; spires sit roughly
  // perpendicular to that so both tips read in profile from the first frame,
  // while the waterfall (river endAngle ~1.0) stays face-on between them.
  spires: [
    { angle: 5.75, weight: 1 },
    { angle: 2.5, weight: 0.72 },
  ],
  // Widened shoulder under the spring rocks so the source sits on land.
  rimBulges: [{ angle: 3.1, amount: 0.1 }],
  // Authored relief: the hero tree stands on a raised knoll, the open meadow
  // dips into a shallow basin, and a modest rise backs the rim rocks.
  mounds: [
    { radial: 0.3, angle: 2.4, radius: 4.6, height: 0.9 },
    { radial: 0.62, angle: 1.25, radius: 3.4, height: -0.45 },
    { radial: 0.75, angle: 5.5, radius: 3.0, height: 0.35 },
    // The spring outcrop is a wide slab, and the meadow fell away from under
    // its front edge — leaving it perched with daylight beneath, which reads
    // as a hole rather than an overhang. This carries the ground up to meet
    // it. The falloff is (1 - t^2)^2, flat at its own edge, so the rise
    // arrives as a swell in the hillside with no seam to find.
    { radial: 0.59, angle: 2.82, radius: 4.2, height: 0.5 },
    // and a smaller one further out, where the far tip of the same slab still
    // stood clear of the grass. Kept tight so it dies away before the spring,
    // which the river wants left where it is.
    { radial: 0.73, angle: 2.99, radius: 5.3, height: 0.4 },
    // The last of it: the slab's near corner cantilevers over the spring
    // hollow, where the ground sits at 0.60 and the rock's underside at 2.15.
    // A small, steep swell right there closes the 1.55 between them and
    // nothing else — kept tight so the meadow around it is left alone.
    { radial: 0.48, angle: 3.395, radius: 6.2, height: 1.8 },
  ],
  // Levelled build site for the hero cottage on the open front-right meadow.
  pads: [{ radial: 0.44, angle: 6.05, radius: 4.4, blend: 2.0 }],
  scatter: {
    rocks: 0.6,
    bushes: 0.5,
    flowers: 0.65,
    roots: 0.6,
  },
  colors: {
    rock: 0xa8a196,
    rockDark: 0x57534a,
    strataAccent: 0xb08d64,
    soil: 0x6f5138,
    grass: 0x67a047,
    grassBright: 0xb5cf67,
    moss: 0x3e7c33,
    flowerWarm: 0xf2ecd4,
    flowerCool: 0xc9849b,
  },
};

export function createIslandParams(
  overrides: IslandParamOverrides = {},
): IslandParams {
  return {
    ...defaultParams,
    ...overrides,
    scatter: { ...defaultParams.scatter, ...overrides.scatter },
    colors: { ...defaultParams.colors, ...overrides.colors },
  };
}
