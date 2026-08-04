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

export type IslandParamOverrides = Partial<Omit<IslandParams, 'colors' | 'scatter'>> & {
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

export function createIslandParams(overrides: IslandParamOverrides = {}): IslandParams {
  return {
    ...defaultParams,
    ...overrides,
    scatter: { ...defaultParams.scatter, ...overrides.scatter },
    colors: { ...defaultParams.colors, ...overrides.colors },
  };
}
