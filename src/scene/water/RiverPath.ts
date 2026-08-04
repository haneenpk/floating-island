export interface RiverPoint {
  x: number;
  z: number;
}

export class RiverPath {
  constructor(readonly points: ReadonlyArray<RiverPoint>) {}

  distanceTo(x: number, z: number): number {
    let best = Infinity;

    for (let i = 0; i < this.points.length - 1; i++) {
      const a = this.points[i]!;
      const b = this.points[i + 1]!;

      const abx = b.x - a.x;
      const abz = b.z - a.z;
      const lengthSq = abx * abx + abz * abz;

      let t = lengthSq > 1e-8 ? ((x - a.x) * abx + (z - a.z) * abz) / lengthSq : 0;
      t = Math.min(Math.max(t, 0), 1);

      const dx = x - (a.x + abx * t);
      const dz = z - (a.z + abz * t);
      const distSq = dx * dx + dz * dz;
      if (distSq < best) best = distSq;
    }

    return Math.sqrt(best);
  }
}

export function sampleQuadraticBezier(
  p0: RiverPoint,
  p1: RiverPoint,
  p2: RiverPoint,
  samples: number,
): RiverPoint[] {
  const points: RiverPoint[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const s = 1 - t;
    points.push({
      x: s * s * p0.x + 2 * s * t * p1.x + t * t * p2.x,
      z: s * s * p0.z + 2 * s * t * p1.z + t * t * p2.z,
    });
  }
  return points;
}
