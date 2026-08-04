import { Matrix4, Quaternion, Vector3 } from 'three';
import type { PerlinNoise } from '../../procgen/PerlinNoise';
import { clamp, smoothstep } from '../../utils/math';
import { RiverPath, sampleQuadraticBezier, type RiverPoint } from '../water/RiverPath';
import type { IslandParams, IslandRiverConfig } from './IslandParams';

export const CAP_OVERHANG = 1.09;

const NORMAL_EPSILON = 0.2;

const UP = new Vector3(0, 1, 0);
const scratchNormal = new Vector3();
const scratchPosition = new Vector3();
const scratchQuat = new Quaternion();
const UNIT_SCALE = new Vector3(1, 1, 1);

interface WorldMound {
  x: number;
  z: number;
  radius: number;
  height: number;
}

interface WorldPad {
  x: number;
  z: number;
  radius: number;
  blend: number;
  height: number;
}

export class IslandSurface {
  readonly riverPath: RiverPath | null;

  private readonly capRadius: number;
  private readonly topHeight: number;
  private readonly riverConfig: IslandRiverConfig | null;
  private readonly springPoint: RiverPoint | null;
  private readonly mounds: WorldMound[];
  private readonly pads: WorldPad[];

  constructor(
    private readonly noise: PerlinNoise,
    private readonly params: IslandParams,
  ) {
    this.capRadius = (params.width / 2) * CAP_OVERHANG;
    this.topHeight = params.grassThickness * 0.85;
    this.riverConfig = params.river;
    this.riverPath = params.river ? this.buildRiverPath(params.river) : null;
    this.springPoint = this.riverPath ? this.riverPath.points[0]! : null;
    this.mounds = params.mounds.map((mound) => {
      const dirX = Math.cos(mound.angle);
      const dirZ = Math.sin(mound.angle);
      const planar = this.capRadiusAt(dirX, dirZ) * mound.radial;
      return { x: dirX * planar, z: dirZ * planar, radius: mound.radius, height: mound.height };
    });
    // Pad plateau heights sample the PRE-pad terrain at each pad's center,
    // so a levelled build site sits at the natural grade of its meadow.
    this.pads = params.pads.map((pad) => {
      const dirX = Math.cos(pad.angle);
      const dirZ = Math.sin(pad.angle);
      const planar = this.capRadiusAt(dirX, dirZ) * pad.radial;
      const x = dirX * planar;
      const z = dirZ * planar;
      return { x, z, radius: pad.radius, blend: pad.blend, height: this.baseHeightAt(x, z) + 0.04 };
    });
  }

  private buildRiverPath(config: IslandRiverConfig): RiverPath {
    const polar = (radial: number, angle: number): RiverPoint => {
      const dirX = Math.cos(angle);
      const dirZ = Math.sin(angle);
      const planar = this.capRadiusAt(dirX, dirZ) * radial;
      return { x: dirX * planar, z: dirZ * planar };
    };

    const points = sampleQuadraticBezier(
      polar(config.start.radial, config.start.angle),
      polar(config.bend.radial, config.bend.angle),
      polar(1.12, config.endAngle),
      48,
    );
    return new RiverPath(points);
  }

  silhouette(dirX: number, dirZ: number): number {
    let bulge = 0;
    for (const rimBulge of this.params.rimBulges) {
      const alignment = dirX * Math.cos(rimBulge.angle) + dirZ * Math.sin(rimBulge.angle);
      if (alignment <= 0) continue;
      bulge = Math.max(bulge, alignment ** 4 * rimBulge.amount);
    }

    return (
      1 +
      bulge +
      0.21 * this.noise.fbm(dirX * 0.95 + 11.7, 3.1, dirZ * 0.95 - 6.3, 2) +
      0.07 * this.noise.fbm(dirX * 2.8 - 4.2, 1.9, dirZ * 2.8 + 7.7, 2)
    );
  }

  rimWobble(dirX: number, dirZ: number): number {
    return 1 + 0.03 * this.noise.fbm(dirX * 4.8 + 15.3, 2.4, dirZ * 4.8 - 9.6, 2);
  }

  capRadiusAt(dirX: number, dirZ: number): number {
    return this.capRadius * this.silhouette(dirX, dirZ) * this.rimWobble(dirX, dirZ);
  }

  getHeightAt(x: number, z: number): number {
    let height = this.baseHeightAt(x, z);
    for (const pad of this.pads) {
      const distance = Math.hypot(x - pad.x, z - pad.z);
      const weight = 1 - smoothstep(pad.radius - pad.blend, pad.radius, distance);
      if (weight > 0) height += (pad.height - height) * weight;
    }
    return height;
  }

  /** 0..1 — how deep inside a levelled build pad this point sits. */
  padWeightAt(x: number, z: number): number {
    let weight = 0;
    for (const pad of this.pads) {
      const distance = Math.hypot(x - pad.x, z - pad.z);
      weight = Math.max(weight, 1 - smoothstep(pad.radius - pad.blend, pad.radius, distance));
    }
    return weight;
  }

  private baseHeightAt(x: number, z: number): number {
    const { grassThickness } = this.params;

    const horizontal = Math.hypot(x, z);
    const dirX = horizontal > 1e-6 ? x / horizontal : 0;
    const dirZ = horizontal > 1e-6 ? z / horizontal : 0;

    const u = clamp(horizontal / this.capRadiusAt(dirX, dirZ), 0, 1);
    const upness = Math.sqrt(1 - u * u);

    const meadowWeight = smoothstep(0.05, 0.4, upness);
    const rolling = this.noise.fbm(x * 0.11 + 31.5, 6.2, z * 0.11 - 17.8, 3);
    const hill = this.noise.fbm(x * 0.05 - 24.2, 9.4, z * 0.05 + 12.9, 2);

    return (
      upness * this.topHeight +
      meadowWeight * ((rolling * 0.6 + hill * 0.9) * grassThickness + this.moundAt(x, z)) -
      smoothstep(0.85, 1, u) * grassThickness * 0.1 -
      this.riverCarveAt(x, z, u)
    );
  }

  private moundAt(x: number, z: number): number {
    let height = 0;
    for (const mound of this.mounds) {
      const t = Math.min(Math.hypot(x - mound.x, z - mound.z) / mound.radius, 1);
      height += (1 - t * t) ** 2 * mound.height;
    }
    return height;
  }

  /**
   * 0..1 proximity to raised mounds (the tree knoll) — used to darken the
   * soil where roots grip the ground.
   */
  moundMaskAt(x: number, z: number): number {
    let mask = 0;
    for (const mound of this.mounds) {
      if (mound.height <= 0) continue;
      const t = Math.min(Math.hypot(x - mound.x, z - mound.z) / (mound.radius * 0.7), 1);
      mask = Math.max(mask, (1 - t * t) ** 2);
    }
    return mask;
  }

  riverDistanceAt(x: number, z: number): number {
    return this.riverPath ? this.riverPath.distanceTo(x, z) : Infinity;
  }

  /**
   * Channel depression carved along the river path: a steep-banked bed, a
   * wider shallow bank dip, and a rounded spring pool at the source. Fades
   * out near the rim so the cap's thin lip stays intact — the water pours
   * OVER the lip (via the waterfall) instead of slicing through the shell.
   */
  private riverCarveAt(x: number, z: number, u: number): number {
    if (!this.riverPath || !this.riverConfig || !this.springPoint) return 0;

    const { width, depth } = this.riverConfig;
    const dist = this.riverPath.distanceTo(x, z);
    if (dist > width * 2.6) return 0;

    const rimFade = 1 - smoothstep(0.82, 0.97, u);
    if (rimFade <= 0) return 0;

    const bedT = clamp(dist / width, 0, 1);
    const bed = (1 - bedT * bedT) ** 2 * depth;

    const bankT = clamp(dist / (width * 2.6), 0, 1);
    const bank = (1 - bankT * bankT) ** 2 * depth * 0.3;

    const springDist = Math.hypot(x - this.springPoint.x, z - this.springPoint.z);
    const pool = (1 - smoothstep(0, width * 2, springDist)) * depth * 0.45;

    return (bed + bank + pool) * rimFade;
  }

  getNormalAt(x: number, z: number, out: Vector3): Vector3 {
    const left = this.getHeightAt(x - NORMAL_EPSILON, z);
    const right = this.getHeightAt(x + NORMAL_EPSILON, z);
    const back = this.getHeightAt(x, z - NORMAL_EPSILON);
    const front = this.getHeightAt(x, z + NORMAL_EPSILON);
    return out.set(left - right, 2 * NORMAL_EPSILON, back - front).normalize();
  }

  getSlopeAt(x: number, z: number): number {
    return Math.acos(clamp(this.getNormalAt(x, z, scratchNormal).y, -1, 1));
  }

  getSurfaceTransform(x: number, z: number, target: Matrix4): Matrix4 {
    scratchPosition.set(x, this.getHeightAt(x, z), z);
    scratchQuat.setFromUnitVectors(UP, this.getNormalAt(x, z, scratchNormal));
    return target.compose(scratchPosition, scratchQuat, UNIT_SCALE);
  }

  patchAt(x: number, z: number): number {
    return this.noise.fbm(x * 0.16 + 8.8, 2.2, z * 0.16 - 12.4, 3);
  }
}
