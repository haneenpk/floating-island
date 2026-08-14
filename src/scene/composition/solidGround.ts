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

export type Blocker = RoundBlocker | BoxBlocker;

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
