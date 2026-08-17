/**
 * What the traveler cannot walk through.
 *
 * Not physics — a handful of shapes, tested and pushed out of on foot. The
 * island's props are placed from a few polar constants, and these are derived
 * from the same ones, so a collider cannot drift away from the thing it
 * stands for. Foliage, flowers, the garden dressing and the small scatter are
 * all deliberately absent: brushing through a fern is part of walking through
 * a meadow, and a world that stops you at every leaf feels smaller, not more
 * solid.
 */

/** A round obstacle — trunks, boulders, anything roughly as deep as it is wide. */
export interface RoundBlocker {
  kind: 'round';
  x: number;
  z: number;
  radius: number;
}

/** A rectangular one, turned to face the way the building faces. */
export interface BoxBlocker {
  kind: 'box';
  x: number;
  z: number;
  halfX: number;
  halfZ: number;
  yaw: number;
}

/**
 * A run of fence, or anything else long and thin: two ends and a thickness.
 * Clustering a rail into circles puts them beside the wood rather than on it —
 * a line has to be answered as a line.
 */
export interface SegmentBlocker {
  kind: 'segment';
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  radius: number;
}

export type Blocker = RoundBlocker | BoxBlocker | SegmentBlocker;

/**
 * Push a point out of a blocker, in island space.
 *
 * Returns true if it moved. The push is always along the shortest way out,
 * which is what makes walking into a wall slide along it rather than stop
 * dead — the part of the step parallel to the surface survives.
 */
export function pushOutOf(blocker: Blocker, position: { x: number; z: number }): boolean {
  if (blocker.kind === 'round') {
    const dx = position.x - blocker.x;
    const dz = position.z - blocker.z;
    const distance = Math.hypot(dx, dz);
    if (distance >= blocker.radius) return false;
    if (distance < 1e-4) {
      position.x = blocker.x + blocker.radius;
      return true;
    }
    position.x = blocker.x + (dx / distance) * blocker.radius;
    position.z = blocker.z + (dz / distance) * blocker.radius;
    return true;
  }

  if (blocker.kind === 'segment') {
    // nearest point on the rail, then the same push as a circle around it
    const runX = blocker.x2 - blocker.x1;
    const runZ = blocker.z2 - blocker.z1;
    const lengthSquared = runX * runX + runZ * runZ;
    let along = 0;
    if (lengthSquared > 1e-8) {
      along =
        ((position.x - blocker.x1) * runX + (position.z - blocker.z1) * runZ) / lengthSquared;
      along = Math.min(Math.max(along, 0), 1);
    }
    const nearX = blocker.x1 + runX * along;
    const nearZ = blocker.z1 + runZ * along;
    const dx = position.x - nearX;
    const dz = position.z - nearZ;
    const distance = Math.hypot(dx, dz);
    if (distance >= blocker.radius) return false;
    if (distance < 1e-4) {
      // dead on the line: step off it across its own width
      position.x = nearX + (runZ / Math.sqrt(lengthSquared || 1)) * blocker.radius;
      position.z = nearZ - (runX / Math.sqrt(lengthSquared || 1)) * blocker.radius;
      return true;
    }
    position.x = nearX + (dx / distance) * blocker.radius;
    position.z = nearZ + (dz / distance) * blocker.radius;
    return true;
  }

  // into the box's own frame, where the test is two comparisons
  const sin = Math.sin(-blocker.yaw);
  const cos = Math.cos(-blocker.yaw);
  const dx = position.x - blocker.x;
  const dz = position.z - blocker.z;
  const localX = dx * cos - dz * sin;
  const localZ = dx * sin + dz * cos;

  const overX = blocker.halfX - Math.abs(localX);
  const overZ = blocker.halfZ - Math.abs(localZ);
  if (overX <= 0 || overZ <= 0) return false;

  // out by whichever wall is nearer
  let outX = localX;
  let outZ = localZ;
  if (overX < overZ) outX = Math.sign(localX || 1) * blocker.halfX;
  else outZ = Math.sign(localZ || 1) * blocker.halfZ;

  const backSin = Math.sin(blocker.yaw);
  const backCos = Math.cos(blocker.yaw);
  position.x = blocker.x + (outX * backCos - outZ * backSin);
  position.z = blocker.z + (outX * backSin + outZ * backCos);
  return true;
}
