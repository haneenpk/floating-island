import {
  BoxGeometry,
  Euler,
  Matrix4,
  Quaternion,
  Vector3,
  type BufferGeometry,
} from 'three';

// Room shell dimensions (local space). Two storeys: the round window lives
// on the UPPER +Z wall; stairs climb the -Z side.
export const ROOM_W = 9.6;
export const ROOM_D = 7.4;
export const ROOM_H = 3.4; // ground-storey ceiling
export const SLAB = 0.24; // first-floor slab thickness
export const UPPER_Y = ROOM_H + SLAB; // first-floor walking height
export const UPPER_H = 3.0; // loft ceiling above its floor

// staircase footprint: along the -Z wall, ascending +X
export const STAIR_X0 = -0.4;
export const STAIR_X1 = 3.4;
export const STAIR_Z0 = -ROOM_D / 2 + 0.01; // flush against the back wall
export const STAIR_Z1 = -ROOM_D / 2 + 1.55;

const scratchMatrix = new Matrix4();
const scratchQuat = new Quaternion();
const scratchEuler = new Euler();
const scratchPos = new Vector3();
const scratchScale = new Vector3();

export interface BakeTransform {
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
}

export function bake(geometry: BufferGeometry, transform: BakeTransform = {}): BufferGeometry {
  scratchPos.set(...(transform.position ?? [0, 0, 0]));
  scratchQuat.setFromEuler(scratchEuler.set(...(transform.rotation ?? [0, 0, 0])));
  scratchScale.set(...(transform.scale ?? [1, 1, 1]));
  scratchMatrix.compose(scratchPos, scratchQuat, scratchScale);
  geometry.applyMatrix4(scratchMatrix);
  return geometry;
}

export function box(
  width: number,
  height: number,
  depth: number,
  transform: BakeTransform = {},
): BufferGeometry {
  return bake(new BoxGeometry(width, height, depth), transform);
}

/**
 * Scale UVs so repeating textures tile in roughly world units. Box UVs span
 * 0..1 per face, so scaling by dimension/texelSize approximates real tiling.
 */
export function scaleUv(geometry: BufferGeometry, sx: number, sy = sx): BufferGeometry {
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * sx, uv.getY(i) * sy);
  }
  return geometry;
}
