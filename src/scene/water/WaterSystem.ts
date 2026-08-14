import {
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  Group,
  Mesh,
  MirroredRepeatWrapping,
  Vector3,
  type IUniform,
} from 'three';
import type { Time } from '../../core/Time';
import { lerp } from '../../utils/math';
import { createLoopingVideoTexture } from '../../utils/video';
import type { IslandRiverConfig } from '../islands/IslandParams';
import type { IslandSurface } from '../islands/IslandSurface';
import type { Updatable } from '../Updatable';
import { createRiverMaterial, createWaterfallMaterial } from './waterShaders';

const WATER_LIFT = 0.34;
const RIVER_END_U = 0.93;
const LIP_U = 0.97;

interface StripPoint {
  x: number;
  y: number;
  z: number;
  halfWidth: number;
}

export class WaterSystem extends Group implements Updatable {
  private readonly timeUniform: IUniform<number> = { value: 0 };

  constructor(
    private readonly surface: IslandSurface,
    private readonly config: IslandRiverConfig,
  ) {
    super();
    this.name = 'water-system';

    const riverPoints = this.buildRiverPoints();
    if (riverPoints.length < 2) return;

    const river = new Mesh(buildStrip(riverPoints), createRiverMaterial(this.timeUniform));
    river.name = 'river-surface';
    river.renderOrder = 2;

    const waterfall = this.buildWaterfall(riverPoints[riverPoints.length - 1]!);

    this.add(river, waterfall);
  }

  update(time: Time): void {
    this.timeUniform.value = time.elapsed;
  }

  private buildRiverPoints(): StripPoint[] {
    const path = this.surface.riverPath;
    if (!path) return [];

    const inside = path.points.filter((point) => {
      const planar = Math.hypot(point.x, point.z);
      const dirX = planar > 1e-6 ? point.x / planar : 1;
      const dirZ = planar > 1e-6 ? point.z / planar : 0;
      return planar / this.surface.capRadiusAt(dirX, dirZ) <= RIVER_END_U;
    });
    if (inside.length < 2) return [];

    const lift = this.config.depth * WATER_LIFT;
    const heights = inside.map(
      (point) => this.surface.getHeightAt(point.x, point.z) + lift,
    );
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 1; i < heights.length - 1; i++) {
        heights[i] = (heights[i - 1]! + heights[i]! * 2 + heights[i + 1]!) / 4;
      }
    }

    // The channel carve fades near the rim to keep the cap shell intact, so
    // the water backs up behind that lip and spills over its crest — raise
    // the final stretch to lip height like a real spillway pool.
    const lipY = this.lipHeight(inside[inside.length - 1]!);
    const backwater = Math.min(8, heights.length);
    for (let i = heights.length - backwater; i < heights.length; i++) {
      const t = 1 - (heights.length - 1 - i) / backwater;
      heights[i] = Math.max(heights[i]!, lerp(heights[i]!, lipY + 0.08, t));
    }

    const poolSpan = 8;
    return inside.map((point, i) => ({
      x: point.x,
      y: heights[i]!,
      z: point.z,
      halfWidth:
        this.config.width * 0.5 * (i < poolSpan ? lerp(2.1, 1.05, i / poolSpan) : 1.05),
    }));
  }

  private lipHeight(exit: { x: number; z: number }): number {
    const planar = Math.hypot(exit.x, exit.z);
    const dirX = exit.x / planar;
    const dirZ = exit.z / planar;
    const rim = this.surface.capRadiusAt(dirX, dirZ);
    return this.surface.getHeightAt(dirX * rim * LIP_U, dirZ * rim * LIP_U);
  }

  private buildWaterfall(exit: StripPoint): Mesh {
    const planar = Math.hypot(exit.x, exit.z);
    const dirX = exit.x / planar;
    const dirZ = exit.z / planar;
    const rim = this.surface.capRadiusAt(dirX, dirZ);
    const y0 = exit.y;
    const crestY = Math.max(this.lipHeight(exit) + 0.1, y0 - 0.05);

    const curve = new CatmullRomCurve3([
      new Vector3(dirX * rim * 0.93, y0 + 0.02, dirZ * rim * 0.93),
      new Vector3(dirX * rim, crestY, dirZ * rim),
      new Vector3(dirX * rim * 1.07, y0 - 2.2, dirZ * rim * 1.07),
      new Vector3(dirX * rim, y0 - 9, dirZ * rim),
      new Vector3(dirX * rim * 0.9, y0 - 18, dirZ * rim * 0.9),
      new Vector3(dirX * rim * 0.85, y0 - 28, dirZ * rim * 0.85),
    ]);

    const samples = 30;
    const across = new Vector3(-dirZ, 0, dirX);
    const points: StripPoint[] = [];
    const sample = new Vector3();

    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      curve.getPointAt(t, sample);
      points.push({
        x: sample.x,
        y: sample.y,
        z: sample.z,
        halfWidth: lerp(0.7, 2.2, t),
      });
    }

    const video = createLoopingVideoTexture('/assets/videos/waterfall.mp4');
    video.wrapT = MirroredRepeatWrapping;

    const mesh = new Mesh(
      buildStrip(points, across),
      createWaterfallMaterial(this.timeUniform, video),
    );
    mesh.name = 'waterfall';
    mesh.renderOrder = 3;
    mesh.frustumCulled = false;
    return mesh;
  }
}

/**
 * Triangle strip along a series of points. Width direction comes from
 * `fixedAcross` when given (waterfall face), otherwise from the horizontal
 * perpendicular of the local tangent (river surface).
 */
function buildStrip(points: StripPoint[], fixedAcross?: Vector3): BufferGeometry {
  const count = points.length;
  const positions = new Float32Array(count * 2 * 3);
  const uvs = new Float32Array(count * 2 * 2);
  const indices: number[] = [];

  for (let i = 0; i < count; i++) {
    const point = points[i]!;
    const previous = points[Math.max(i - 1, 0)]!;
    const next = points[Math.min(i + 1, count - 1)]!;

    let acrossX: number;
    let acrossZ: number;
    if (fixedAcross) {
      acrossX = fixedAcross.x;
      acrossZ = fixedAcross.z;
    } else {
      const tangentX = next.x - previous.x;
      const tangentZ = next.z - previous.z;
      const length = Math.hypot(tangentX, tangentZ) || 1;
      acrossX = -tangentZ / length;
      acrossZ = tangentX / length;
    }

    const v = i / (count - 1);
    const base = i * 6;
    positions[base] = point.x - acrossX * point.halfWidth;
    positions[base + 1] = point.y;
    positions[base + 2] = point.z - acrossZ * point.halfWidth;
    positions[base + 3] = point.x + acrossX * point.halfWidth;
    positions[base + 4] = point.y;
    positions[base + 5] = point.z + acrossZ * point.halfWidth;

    uvs[i * 4] = 0;
    uvs[i * 4 + 1] = v;
    uvs[i * 4 + 2] = 1;
    uvs[i * 4 + 3] = v;

    if (i < count - 1) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function maybeCreateWaterSystem(
  surface: IslandSurface,
  config: IslandRiverConfig | null,
): WaterSystem | null {
  if (!config) return null;
  const system = new WaterSystem(surface, config);
  return system.children.length > 0 ? system : null;
}
