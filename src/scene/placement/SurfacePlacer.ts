import { Box3, Quaternion, Vector3, type Object3D } from 'three';
import type { IslandSurface } from '../islands/IslandSurface';
import { recordPlacement } from './PlacementRegistry';

export type PlacementCategory = 'tree' | 'rock' | 'outcrop' | 'foliage' | 'structure';

interface PlacementRule {
  embedFraction: number;
  alignToNormal: number;
  maxSlope: number;
  /**
   * Fraction of the object's horizontal half-extent to probe when grounding.
   * Wide objects on curved terrain seat on the LOWEST sampled point so their
   * edges never hover. Zero means center-sample only (trees ground by trunk —
   * their bbox is dominated by the canopy; foliage is too small to matter).
   */
  footprint: number;
  /** Minimum distance from the river centerline; closer placements are invalid. */
  riverClearance: number;
}

const DEG = Math.PI / 180;

const RULES: Record<PlacementCategory, PlacementRule> = {
  tree: {
    // deep enough that the root flare disappears into the meadow — an
    // ancient tree grows FROM the hill, it doesn't stand on it
    embedFraction: 0.045,
    alignToNormal: 0.12,
    maxSlope: 35 * DEG,
    footprint: 0,
    riverClearance: 2.4,
  },
  rock: {
    embedFraction: 0.1,
    alignToNormal: 0.45,
    maxSlope: 60 * DEG,
    footprint: 0.75,
    riverClearance: 1.2,
  },
  // Thin slab scans (rock faces) have jagged concave undersides that no
  // bbox-based seating can close — they are buried deep and read as bedrock
  // strata breaking through the meadow.
  outcrop: {
    embedFraction: 0.38,
    alignToNormal: 0.55,
    maxSlope: 70 * DEG,
    footprint: 0.6,
    riverClearance: 1.2,
  },
  foliage: {
    embedFraction: 0.02,
    alignToNormal: 0.65,
    maxSlope: 40 * DEG,
    footprint: 0,
    riverClearance: 1.3,
  },
  // Buildings stay perfectly upright and sit on levelled pads.
  structure: {
    embedFraction: 0.03,
    alignToNormal: 0,
    maxSlope: 30 * DEG,
    footprint: 0.4,
    riverClearance: 2.2,
  },
};

export interface SurfacePose {
  position: Vector3;
  quaternion: Quaternion;
  valid: boolean;
}

const UP = new Vector3(0, 1, 0);
const identityQuat = new Quaternion();
const scratchNormal = new Vector3();
const scratchYawQuat = new Quaternion();
const scratchBox = new Box3();

const sharedPose: SurfacePose = {
  position: new Vector3(),
  quaternion: new Quaternion(),
  valid: false,
};

export class SurfacePlacer {
  constructor(readonly surface: IslandSurface) {}

  /**
   * Ground pose for an object of the given world-space height whose lowest
   * point sits at `baseOffset` (bbox.min.y * scale) in its own space.
   * The returned pose is a shared scratch object — copy before the next call.
   */
  poseAt(
    category: PlacementCategory,
    x: number,
    z: number,
    yaw: number,
    height: number,
    baseOffset: number,
    footprintRadius = 0,
  ): SurfacePose {
    const rule = RULES[category];

    let groundY = this.surface.getHeightAt(x, z);
    if (footprintRadius > 0) {
      groundY = Math.min(
        groundY,
        this.surface.getHeightAt(x + footprintRadius, z),
        this.surface.getHeightAt(x - footprintRadius, z),
        this.surface.getHeightAt(x, z + footprintRadius),
        this.surface.getHeightAt(x, z - footprintRadius),
      );
    }
    const normal = this.surface.getNormalAt(x, z, scratchNormal);
    const slope = Math.acos(Math.min(Math.max(normal.y, -1), 1));
    const valid =
      slope <= rule.maxSlope &&
      this.surface.riverDistanceAt(x, z) >= rule.riverClearance &&
      // levelled build pads stay clear of scatter — only structures may claim them
      (category === 'structure' || this.surface.padWeightAt(x, z) < 0.55);

    sharedPose.position.set(x, groundY - baseOffset - rule.embedFraction * height, z);
    sharedPose.quaternion
      .setFromUnitVectors(UP, normal)
      .slerp(identityQuat, 1 - rule.alignToNormal)
      .multiply(scratchYawQuat.setFromAxisAngle(UP, yaw));
    sharedPose.valid = valid;

    recordPlacement({
      x,
      y: groundY,
      z,
      normalX: normal.x,
      normalY: normal.y,
      normalZ: normal.z,
      valid,
    });

    return sharedPose;
  }

  placeObject(
    object: Object3D,
    category: PlacementCategory,
    x: number,
    z: number,
    yaw: number,
    scale: number,
  ): boolean {
    scratchBox.setFromObject(object);
    const height = (scratchBox.max.y - scratchBox.min.y) * scale;
    const baseOffset = scratchBox.min.y * scale;

    const halfExtent =
      Math.max(scratchBox.max.x - scratchBox.min.x, scratchBox.max.z - scratchBox.min.z) *
      scale *
      0.5;
    const footprintRadius = RULES[category].footprint * halfExtent;

    const pose = this.poseAt(category, x, z, yaw, height, baseOffset, footprintRadius);
    object.position.copy(pose.position);
    object.quaternion.copy(pose.quaternion);
    object.scale.setScalar(scale);
    return pose.valid;
  }
}
