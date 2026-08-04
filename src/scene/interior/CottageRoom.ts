import {
  Group,
  Mesh,
  PointLight,
  RingGeometry,
  TorusGeometry,
  Vector3,
  type BufferGeometry,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Time } from '../../core/Time';
import type { Updatable } from '../Updatable';
import { Hearth } from './Hearth';
import { getInteriorMaterials, type InteriorMaterials } from './interiorMaterials';
import {
  bake,
  box,
  ROOM_D,
  ROOM_H,
  ROOM_W,
  scaleUv,
  SLAB,
  STAIR_X0,
  STAIR_X1,
  STAIR_Z0,
  STAIR_Z1,
  UPPER_H,
  UPPER_Y,
} from './roomParts';
import { buildFurniture, type RoomInteractable, type RoomProps } from './roomFurniture';

const WALL = 0.24;
const WINDOW_R = 1.15;
const TOP = UPPER_Y + UPPER_H;
const EYE = 1.62;
const STEPS = 13;

/**
 * The two-storey cottage interior. Ground floor: hearth, desk, door.
 * A solid staircase climbs the -Z wall to a loft whose round window looks
 * out over the island. Static geometry merges per material; fire flickers.
 */
export class CottageRoom extends Group implements Updatable {
  readonly interactables: RoomInteractable[];
  readonly fireLight: PointLight;

  readonly hearth: Hearth;

  constructor(origin: Vector3, props: RoomProps = {}) {
    super();
    this.name = 'cottage-room';
    this.position.copy(origin);

    const materials = getInteriorMaterials();
    const buckets: Record<keyof InteriorMaterials, BufferGeometry[]> = {
      plaster: [],
      floor: [],
      woodDark: [],
      woodWarm: [],
      stone: [],
      iron: [],
      ember: [],
    };

    this.buildShell(buckets);
    this.buildStairs(buckets);
    this.buildFireplace(buckets);

    for (const name of Object.keys(buckets) as (keyof typeof buckets)[]) {
      if (buckets[name].length === 0) continue;
      const mesh = new Mesh(mergeGeometries(buckets[name])!, materials[name]);
      mesh.name = `room-${name}`;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      this.add(mesh);
    }

    const furniture = buildFurniture(props);
    this.add(furniture.group);
    this.interactables = furniture.interactables;

    // the fire itself: firewood, embers, shader flames, smoke and sparks
    this.hearth = new Hearth();
    this.hearth.position.set(-ROOM_W / 2 + 0.59, 0.09, -0.6);
    this.add(this.hearth);
    this.fireLight = this.hearth.light;

    // candle sconce over the stairs and a soft lamp in the loft keep the
    // far corners from going pitch black
    const sconceLight = new PointLight(0xffb46a, 1.2, 7, 2);
    sconceLight.position.set(1.5, 2.7, -ROOM_D / 2 + 0.7);
    this.add(sconceLight);
    const loftLight = new PointLight(0xffc98a, 1.0, 8, 2);
    loftLight.position.set(2.4, UPPER_Y + 1.7, 1.6);
    this.add(loftLight);

    // world matrix must be valid immediately: the portal samples world-space
    // poses (camera, exit door) before the first rendered frame
    this.updateMatrixWorld(true);
  }

  /** Cinematic interior camera pose: facing the hearth, stairs to the right. */
  getCameraPose(): { position: Vector3; target: Vector3 } {
    return {
      position: this.localToWorld(new Vector3(3.8, 1.75, 0.01)),
      target: this.localToWorld(new Vector3(-4.4, 1.15, -0.3)),
    };
  }

  /** World position of the exit door (arched door on the +X wall). */
  getExitDoorWorld(): Vector3 {
    return this.localToWorld(new Vector3(ROOM_W / 2 - 0.35, 1.2, -0.25));
  }

  /** World position of the loft's round window (outside sound drifts in here). */
  getWindowWorld(): Vector3 {
    return this.localToWorld(new Vector3(0, UPPER_Y + 1.5, ROOM_D / 2));
  }

  /**
   * Floor-aware walking: walls, hearth, the staircase ramp, and the loft
   * with its stair opening. Sets Y (eye height over the current floor).
   */
  getWalkConstraint(): (position: Vector3) => void {
    const local = new Vector3();
    let lastEyeY: number | null = null;

    const floorHeightAt = (x: number, z: number, feet: number): number => {
      const inStairBand =
        z >= STAIR_Z0 - 0.1 && z <= STAIR_Z1 + 0.1 && x >= STAIR_X0 - 0.2 && x <= STAIR_X1 + 0.4;
      if (inStairBand) {
        const t = Math.min(Math.max((x - STAIR_X0) / (STAIR_X1 - STAIR_X0), 0), 1);
        return t * UPPER_Y;
      }
      // loft floor exists everywhere else; take it when already up there
      if (feet > UPPER_Y - 0.65) return UPPER_Y;
      return 0;
    };

    return (position: Vector3) => {
      this.worldToLocal(local.copy(position));

      local.x = Math.min(Math.max(local.x, -ROOM_W / 2 + 0.55), ROOM_W / 2 - 0.55);
      local.z = Math.min(Math.max(local.z, -ROOM_D / 2 + 0.55), ROOM_D / 2 - 0.55);
      // chimney breast juts from the -X wall on both storeys
      if (local.x < -ROOM_W / 2 + 1.6 && Math.abs(local.z + 0.6) < 1.35) {
        local.x = -ROOM_W / 2 + 1.6;
      }

      const feet = (lastEyeY ?? local.y) - EYE;
      const targetEye = floorHeightAt(local.x, local.z, feet) + EYE;
      lastEyeY = lastEyeY === null ? targetEye : lastEyeY + (targetEye - lastEyeY) * 0.22;
      local.y = lastEyeY;

      position.copy(this.localToWorld(local));
    };
  }

  update(time: Time): void {
    this.hearth.update(time);
  }

  private buildShell(buckets: Record<string, BufferGeometry[]>): void {
    const halfW = ROOM_W / 2;
    const halfD = ROOM_D / 2;
    const wallH = TOP;

    // ground + loft floors
    buckets.floor!.push(
      scaleUv(box(ROOM_W, 0.22, ROOM_D, { position: [0, -0.11, 0] }), ROOM_W / 2.7, ROOM_D / 2.7),
    );
    const holeX0 = STAIR_X0 - 0.1;
    const holeX1 = STAIR_X1 + 0.02; // flush with the top step
    const holeZ1 = STAIR_Z1 + 0.15;
    const mainDepth = halfD - holeZ1;
    buckets.floor!.push(
      scaleUv(
        box(ROOM_W, SLAB, mainDepth, { position: [0, ROOM_H + SLAB / 2, holeZ1 + mainDepth / 2] }),
        ROOM_W / 2.7,
        mainDepth / 2.7,
      ),
      scaleUv(
        box(holeX0 + halfW, SLAB, holeZ1 + halfD, {
          position: [(-halfW + holeX0) / 2, ROOM_H + SLAB / 2, (-halfD + holeZ1) / 2],
        }),
        (holeX0 + halfW) / 2.7,
        (holeZ1 + halfD) / 2.7,
      ),
      scaleUv(
        box(halfW - holeX1, SLAB, holeZ1 + halfD, {
          position: [(holeX1 + halfW) / 2, ROOM_H + SLAB / 2, (-halfD + holeZ1) / 2],
        }),
        (halfW - holeX1) / 2.7,
        (holeZ1 + halfD) / 2.7,
      ),
    );
    // trim around the stair opening + loft railing
    buckets.woodDark!.push(
      box(holeX1 - holeX0 + 0.3, 0.1, 0.12, {
        position: [(holeX0 + holeX1) / 2, UPPER_Y + 0.05, holeZ1 + 0.06],
      }),
      box(holeX1 - holeX0 + 0.3, 0.07, 0.07, {
        position: [(holeX0 + holeX1) / 2, UPPER_Y + 0.92, holeZ1 + 0.06],
      }),
    );
    for (let i = 0; i <= 4; i++) {
      buckets.woodDark!.push(
        box(0.06, 0.9, 0.06, {
          position: [holeX0 + ((holeX1 - holeX0) * i) / 4, UPPER_Y + 0.46, holeZ1 + 0.06],
        }),
      );
    }
    // the opening's short end (over the foot of the stairs) gets the same
    // trim + rail so the loft edge is guarded all the way to the back wall
    const endLen = holeZ1 + halfD;
    const endZ = (-halfD + holeZ1) / 2;
    buckets.woodDark!.push(
      box(0.12, 0.1, endLen, { position: [holeX0 - 0.06, UPPER_Y + 0.05, endZ] }),
      box(0.07, 0.07, endLen, { position: [holeX0 - 0.06, UPPER_Y + 0.92, endZ] }),
    );
    for (let i = 0; i <= 2; i++) {
      buckets.woodDark!.push(
        box(0.06, 0.9, 0.06, {
          position: [holeX0 - 0.06, UPPER_Y + 0.46, -halfD + (endLen * i) / 2],
        }),
      );
    }

    buckets.plaster!.push(scaleUv(box(ROOM_W, 0.18, ROOM_D, { position: [0, TOP + 0.09, 0] }), 2.4));

    // full-height side + back walls
    buckets.plaster!.push(
      scaleUv(box(WALL, wallH, ROOM_D, { position: [-halfW - WALL / 2, wallH / 2, 0] }), 2.2),
      scaleUv(box(WALL, wallH, ROOM_D, { position: [halfW + WALL / 2, wallH / 2, 0] }), 2.2),
      scaleUv(
        box(ROOM_W + WALL * 2, wallH, WALL, { position: [0, wallH / 2, -halfD - WALL / 2] }),
        2.6,
        1.8,
      ),
    );

    // +Z wall: solid on the ground floor, round window up in the loft
    buckets.plaster!.push(
      scaleUv(box(ROOM_W + WALL * 2, UPPER_Y, WALL, { position: [0, UPPER_Y / 2, halfD + WALL / 2] }), 2.6, 1.1),
    );
    const gap = WINDOW_R + 0.12;
    const sideW = (ROOM_W - gap * 2) / 2;
    const windowY = UPPER_Y + 1.5;
    const upperWallH = TOP - UPPER_Y;
    buckets.plaster!.push(
      scaleUv(
        box(sideW, upperWallH, WALL, {
          position: [-(gap + sideW / 2), UPPER_Y + upperWallH / 2, halfD + WALL / 2],
        }),
        1.4,
      ),
      scaleUv(
        box(sideW, upperWallH, WALL, {
          position: [gap + sideW / 2, UPPER_Y + upperWallH / 2, halfD + WALL / 2],
        }),
        1.4,
      ),
      box(gap * 2, windowY - gap - UPPER_Y, WALL, {
        position: [0, UPPER_Y + (windowY - gap - UPPER_Y) / 2, halfD + WALL / 2],
      }),
      box(gap * 2, TOP - windowY - gap, WALL, {
        position: [0, windowY + gap + (TOP - windowY - gap) / 2, halfD + WALL / 2],
      }),
    );
    buckets.plaster!.push(
      bake(new RingGeometry(WINDOW_R, gap * 1.45, 28), {
        position: [0, windowY, halfD + 0.02],
        rotation: [0, Math.PI, 0],
      }),
    );
    buckets.woodDark!.push(
      bake(new TorusGeometry(WINDOW_R, 0.07, 10, 28), { position: [0, windowY, halfD + 0.06] }),
      box(WINDOW_R * 2, 0.055, 0.05, { position: [0, windowY, halfD + 0.05] }),
      box(0.055, WINDOW_R * 2, 0.05, { position: [0, windowY, halfD + 0.05] }),
    );

    // beams under each ceiling
    for (const z of [0, 2.3]) {
      buckets.woodDark!.push(
        box(ROOM_W, 0.2, 0.24, { position: [0, ROOM_H - 0.1, z] }),
        box(ROOM_W, 0.2, 0.24, { position: [0, TOP - 0.1, z] }),
      );
    }

    // candle sconce on the stair wall (its light is added in the constructor)
    buckets.iron!.push(
      box(0.06, 0.3, 0.06, { position: [1.5, 2.5, -halfD + 0.15] }),
      box(0.16, 0.04, 0.16, { position: [1.5, 2.62, -halfD + 0.22] }),
    );
    buckets.ember!.push(box(0.09, 0.16, 0.09, { position: [1.5, 2.72, -halfD + 0.22] }));
  }

  private buildStairs(buckets: Record<string, BufferGeometry[]>): void {
    const run = STAIR_X1 - STAIR_X0;
    const width = STAIR_Z1 - STAIR_Z0;
    const zMid = (STAIR_Z0 + STAIR_Z1) / 2;

    for (let i = 0; i < STEPS; i++) {
      const height = ((i + 1) * UPPER_Y) / STEPS;
      buckets.woodWarm!.push(
        scaleUv(
          box(run / STEPS + 0.02, height, width, {
            position: [STAIR_X0 + ((i + 0.5) * run) / STEPS, height / 2, zMid],
          }),
          0.55,
          height / 1.6,
        ),
      );
    }

    // handrail on the open side: ascends with the steps (+X end up)
    const angle = Math.atan2(UPPER_Y, run);
    buckets.woodDark!.push(
      bake(box(Math.hypot(run, UPPER_Y) + 0.2, 0.08, 0.08), {
        position: [(STAIR_X0 + STAIR_X1) / 2, UPPER_Y / 2 + 0.95, STAIR_Z1 + 0.05],
        rotation: [0, 0, angle],
      }),
    );
    for (const t of [0.12, 0.5, 0.88]) {
      const x = STAIR_X0 + run * t;
      const stepTop = UPPER_Y * t;
      buckets.woodDark!.push(
        box(0.07, 0.95, 0.07, { position: [x, stepTop + 0.48, STAIR_Z1 + 0.05] }),
      );
    }
  }

  private buildFireplace(buckets: Record<string, BufferGeometry[]>): void {
    const x = -ROOM_W / 2 + 0.55;

    const OPEN_H = 1.15; // hearth opening height
    const OPEN_HW = 0.65; // opening half-width (around z = -0.6)

    // breast built around a real cavity: side columns, lintel mass above,
    // and a back slab — the fire burns inside the hole
    buckets.stone!.push(
      scaleUv(
        box(1.1, OPEN_H, 0.3, { position: [x - 0.18, OPEN_H / 2, -0.6 - OPEN_HW - 0.15] }),
        1.4,
      ),
      scaleUv(
        box(1.1, OPEN_H, 0.3, { position: [x - 0.18, OPEN_H / 2, -0.6 + OPEN_HW + 0.15] }),
        1.4,
      ),
      scaleUv(
        box(1.1, 2.9 - OPEN_H, 1.9, { position: [x - 0.18, OPEN_H + (2.9 - OPEN_H) / 2, -0.6] }),
        1.4,
      ),
      scaleUv(box(0.4, OPEN_H, 1.3, { position: [x - 0.53, OPEN_H / 2, -0.6] }), 1.4),
      scaleUv(box(1.3, 0.16, 2.2, { position: [x, 1.62, -0.6] }), 1.2),
      // the chimney breast continues through the loft
      scaleUv(
        box(1.0, TOP - 2.9, 1.6, { position: [x - 0.22, 2.9 + (TOP - 2.9) / 2, -0.6] }),
        1.3,
      ),
      // hearth slab in front + cavity floor
      box(1.0, 0.1, 1.7, { position: [x + 0.6, 0.05, -0.6] }),
      box(0.66, 0.08, 1.28, { position: [x + 0.04, 0.04, -0.6] }),
    );

    // dark iron lining inside the cavity
    buckets.iron!.push(
      box(0.05, 1.12, 1.28, { position: [x - 0.31, 0.56, -0.6] }),
      box(0.62, 1.12, 0.05, { position: [x + 0.02, 0.56, -0.6 - OPEN_HW + 0.03] }),
      box(0.62, 1.12, 0.05, { position: [x + 0.02, 0.56, -0.6 + OPEN_HW - 0.03] }),
      box(0.62, 0.05, 1.28, { position: [x + 0.02, OPEN_H - 0.03, -0.6] }),
      // iron lintel bar across the opening face
      box(0.06, 0.1, 1.44, { position: [x + 0.37, OPEN_H + 0.03, -0.6] }),
    );

    // (the fire itself — wood, embers, flames — lives in the Hearth)
    buckets.woodWarm!.push(box(1.24, 0.14, 2.05, { position: [x, 2.2, -0.6] }));
  }
}
