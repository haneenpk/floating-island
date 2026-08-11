import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PointLight,
  Raycaster,
  Vector3,
  type BufferGeometry,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { getQuality } from '../../core/Quality';
import type { Time } from '../../core/Time';
import { SeededRandom } from '../../procgen/SeededRandom';
import type { IslandSurface } from '../islands/IslandSurface';
import type { Updatable } from '../Updatable';

const HOUSE_ANGLE = 6.05;
const HOUSE_RADIAL = 0.44;
const HOUSE_YAW = 0.67;
const TREE_ANGLE = 2.4;
const TREE_RADIAL = 0.3;

/**
 * The lived-in touches from the concept art: lanterns swinging from the
 * great tree, a lamp post by the path, wooden fences following the meadow,
 * and stepping stones leading to the door.
 *
 * Everything static merges into one mesh per material — a few dozen posts,
 * rails and slabs would otherwise cost a draw call each on weak GPUs.
 */
export class GardenDressing extends Group implements Updatable {
  private readonly swings: { pivot: Group; phase: number; speed: number }[] = [];

  constructor(surface: IslandSurface, heroTree: Object3D | null = null) {
    super();
    this.name = 'garden-dressing';

    const random = new SeededRandom(0x9a2d);
    const wood = new MeshStandardMaterial({ color: 0x6e5136, roughness: 0.9 });
    const iron = new MeshStandardMaterial({ color: 0x2e2a26, roughness: 0.6, metalness: 0.35 });
    const glow = new MeshStandardMaterial({
      color: 0x3a2c1a,
      emissive: 0xffb45c,
      emissiveIntensity: 1.7,
      roughness: 0.7,
    });
    const stone = new MeshStandardMaterial({ color: 0x6b6355, roughness: 1 });

    // static geometry buckets, merged at the end
    const woodParts: BufferGeometry[] = [];
    const stoneParts: BufferGeometry[] = [];
    // scratch object for composing a transform without touching the scene
    const placer = new Object3D();
    const placed = (geometry: BufferGeometry): BufferGeometry => {
      placer.updateMatrix();
      return geometry.applyMatrix4(placer.matrix);
    };

    const planar = (angle: number, radial: number): { x: number; z: number } => {
      const dirX = Math.cos(angle);
      const dirZ = Math.sin(angle);
      const r = surface.capRadiusAt(dirX, dirZ) * radial;
      return { x: dirX * r, z: dirZ * r };
    };
    const house = planar(HOUSE_ANGLE, HOUSE_RADIAL);
    const tree = planar(TREE_ANGLE, TREE_RADIAL);
    const forward = { x: Math.sin(HOUSE_YAW), z: Math.cos(HOUSE_YAW) };
    const side = { x: forward.z, z: -forward.x };

    // ---- a lantern that can hang from anything ----
    // an open frame of corner bars, so the glowing heart shows through
    const makeLantern = (scale = 1): Group => {
      const lantern = new Group();
      const frame: BufferGeometry[] = [];
      for (let i = 0; i < 4; i++) {
        const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
        placer.position.set(Math.cos(angle) * 0.085, 0, Math.sin(angle) * 0.085);
        placer.rotation.set(0, 0, 0);
        frame.push(placed(new BoxGeometry(0.016, 0.26, 0.016)));
      }
      placer.position.set(0, 0.16, 0);
      frame.push(placed(new CylinderGeometry(0.045, 0.13, 0.08, 6)));
      placer.position.set(0, -0.14, 0);
      frame.push(placed(new CylinderGeometry(0.11, 0.08, 0.045, 6)));
      placer.position.set(0, 0, 0);

      lantern.add(
        new Mesh(mergeGeometries(frame)!, iron),
        new Mesh(new IcosahedronGeometry(0.07, 1), glow),
      );
      lantern.scale.setScalar(scale);
      return lantern;
    };

    // a swinging lantern on a rope, pivoting from the rope's anchor
    const hangLantern = (
      x: number,
      z: number,
      anchorY: number,
      ropeLength: number,
      scale = 1,
    ): void => {
      const pivot = new Group();
      pivot.position.set(x, anchorY, z);
      const rope = new Mesh(new CylinderGeometry(0.014, 0.014, ropeLength, 4), iron);
      rope.position.y = -ropeLength / 2;
      const lantern = makeLantern(scale);
      lantern.position.y = -ropeLength - 0.14 * scale;
      pivot.add(rope, lantern);
      this.add(pivot);
      this.swings.push({
        pivot,
        phase: random.range(0, Math.PI * 2),
        speed: random.range(0.5, 0.8),
      });
    };

    // Lanterns hang from the great tree — from real branches, found by
    // raycasting up through the canopy. The tree's own placement is decided
    // by the surface placer and its canopy is lopsided, so any fixed height
    // leaves a rope tied to thin air.
    const treeGround = surface.getHeightAt(tree.x, tree.z);
    const downward = new Raycaster();
    downward.far = 40;
    /**
     * A spot worth hanging a lantern from: canopy directly overhead so the
     * rope reads as tied, and open air beneath it so the lantern dangles
     * free instead of being pinned against a limb.
     */
    const canopyAnchor = (x: number, z: number): number | null => {
      if (!heroTree) return null;
      heroTree.updateMatrixWorld(true);
      downward.set(new Vector3(x, treeGround + 24, z), new Vector3(0, -1, 0));
      const hits = downward.intersectObject(heroTree, true);
      const top = hits[0];
      if (!top || top.point.y < treeGround + 4.5) return null;

      const below = hits.find((hit) => hit.point.y < top.point.y - 0.2);
      const clearance = below ? top.point.y - below.point.y : Infinity;
      return clearance >= 2.4 ? top.point.y : null;
    };

    // Sweep the canopy's outer reaches first: a lantern out there hangs
    // clear of the branches and reads against the sky, where one tucked
    // beside the trunk disappears into the foliage.
    const spots: { x: number; z: number; y: number; front: number }[] = [];
    for (const radius of [6.6, 5.8, 5.0, 4.2]) {
      for (let step = 0; step < 12; step++) {
        const angle = (step / 12) * Math.PI * 2 + 0.4;
        const offsetX = Math.cos(angle) * radius;
        const offsetZ = Math.sin(angle) * radius;
        const x = tree.x + offsetX;
        const z = tree.z + offsetZ;
        const anchor = canopyAnchor(x, z);
        if (anchor === null) continue;
        // the journey camera meets the island from the cottage's face, so
        // that is the side worth decorating
        const front = (offsetX * forward.x + offsetZ * forward.z) / radius;
        spots.push({ x, z, y: anchor, front });
      }
    }
    // Hang the lowest boughs first — a lantern at eye level reads where one
    // in the crown does not — but work the camera-facing side before the
    // back, and keep them apart so they ring the canopy instead of pairing.
    const byHeight = (a: (typeof spots)[number], b: (typeof spots)[number]): number => a.y - b.y;
    const ordered = [
      ...spots.filter((spot) => spot.front >= 0).sort(byHeight),
      ...spots.filter((spot) => spot.front < 0).sort(byHeight),
    ];
    const chosen: typeof spots = [];
    for (const spot of ordered) {
      if (chosen.length >= 4) break;
      const apart = chosen.every(
        (picked) => Math.hypot(picked.x - spot.x, picked.z - spot.z) >= 2.4,
      );
      if (apart) chosen.push(spot);
    }
    chosen.forEach((spot, index) => {
      // the rope starts just inside the canopy so the knot reads as tied
      hangLantern(
        spot.x,
        spot.z,
        spot.y - 0.12,
        random.range(1.2, 2.1),
        index === 0 ? 1.15 : random.range(0.9, 1.05),
      );
    });
    if (chosen.length === 0) {
      // nothing overhead anywhere (the tree is culled on the lowest tier)
      hangLantern(tree.x + 2.1, tree.z + 1.1, treeGround + 7.2, 1.6, 1.1);
    }

    // ---- lamp post beside the path, out past the doorstep ----
    const postSpot = {
      x: house.x + forward.x * 4.8 - side.x * 2.1,
      z: house.z + forward.z * 4.8 - side.z * 2.1,
    };
    const postGround = surface.getHeightAt(postSpot.x, postSpot.z);
    const postYaw = HOUSE_YAW + 0.4;
    // pole and arm, baked into world space so they merge with the fences
    placer.position.set(postSpot.x, postGround - 0.05, postSpot.z);
    placer.rotation.set(0, postYaw, 0);
    placer.updateMatrix();
    const poleGeometry = new CylinderGeometry(0.07, 0.09, 2.5, 7);
    poleGeometry.translate(0, 1.25, 0);
    woodParts.push(poleGeometry.applyMatrix4(placer.matrix));
    const armGeometry = new BoxGeometry(0.66, 0.07, 0.07);
    armGeometry.translate(0.26, 2.42, 0);
    woodParts.push(armGeometry.applyMatrix4(placer.matrix));

    // the lantern hangs from the arm's end, in that same baked space
    const armEnd = new Vector3(0.55, 2.38, 0).applyMatrix4(placer.matrix);
    hangLantern(armEnd.x, armEnd.z, armEnd.y, 0.28, 1.1);

    // warm pool of light under the lamp on tiers that can afford it
    if (getQuality().cottageLight) {
      const lampLight = new PointLight(0xffb45c, 0.6, 4.5, 2);
      lampLight.position.set(armEnd.x, armEnd.y - 0.55, armEnd.z);
      this.add(lampLight);
    }

    // ---- wooden fences: posts with two rails, following the terrain ----
    const fenceRun = (points: { x: number; z: number }[]): void => {
      const tops: Vector3[] = points.map((point) => {
        const y = surface.getHeightAt(point.x, point.z);
        placer.position.set(point.x, y + 0.28, point.z);
        placer.rotation.set(0, random.range(0, Math.PI), 0);
        woodParts.push(placed(new BoxGeometry(0.09, 0.72, 0.09)));
        return new Vector3(point.x, y, point.z);
      });
      for (let i = 0; i < tops.length - 1; i++) {
        const a = tops[i]!;
        const b = tops[i + 1]!;
        for (const railY of [0.24, 0.52]) {
          const start = a.clone().setY(a.y + railY);
          const end = b.clone().setY(b.y + railY);
          const length = start.distanceTo(end);
          placer.position.copy(start).add(end).multiplyScalar(0.5);
          placer.rotation.set(0, 0, 0);
          placer.lookAt(end);
          woodParts.push(placed(new BoxGeometry(0.055, 0.075, length)));
        }
      }
    };

    // flanking the path to the door
    const pathFence = (offset: number, count: number, fromStep: number): void => {
      const points: { x: number; z: number }[] = [];
      for (let i = 0; i < count; i++) {
        const along = fromStep + i * 1.05;
        points.push({
          x: house.x + forward.x * along + side.x * offset,
          z: house.z + forward.z * along + side.z * offset,
        });
      }
      fenceRun(points);
    };
    pathFence(1.5, 4, 2.2);
    pathFence(-1.55, 3, 2.6);

    // a short run along the rim beyond the house, like the concept art
    const rimPoints: { x: number; z: number }[] = [];
    for (let i = 0; i < 5; i++) {
      rimPoints.push(planar(HOUSE_ANGLE - 0.34 - i * 0.09, 0.8));
    }
    fenceRun(rimPoints);

    // ---- stepping stones out the door, half-sunk in the turf ----
    for (let i = 0; i < 9; i++) {
      const along = 1.5 + i * 0.68;
      const sway = Math.sin(i * 0.9) * 0.26;
      const x = house.x + forward.x * along + side.x * sway;
      const z = house.z + forward.z * along + side.z * sway;
      const y = surface.getHeightAt(x, z);
      // sunk so only the crown shows, like stones trodden into the grass
      placer.position.set(x, y - 0.045, z);
      placer.rotation.set(
        random.range(-0.04, 0.04),
        random.range(0, Math.PI),
        random.range(-0.04, 0.04),
      );
      placer.scale.set(1, 1, random.range(0.75, 0.95));
      stoneParts.push(
        placed(new CylinderGeometry(random.range(0.19, 0.27), random.range(0.22, 0.3), 0.12, 7)),
      );
      placer.scale.set(1, 1, 1);
    }

    const woodMesh = new Mesh(mergeGeometries(woodParts)!, wood);
    woodMesh.name = 'garden-wood';
    const stoneMesh = new Mesh(mergeGeometries(stoneParts)!, stone);
    stoneMesh.name = 'garden-stones';
    this.add(woodMesh, stoneMesh);

    this.traverse((child) => {
      if (child instanceof Mesh) child.receiveShadow = true;
    });
  }

  update(time: Time): void {
    for (const swing of this.swings) {
      const wave = Math.sin(time.elapsed * swing.speed + swing.phase);
      swing.pivot.rotation.x = wave * 0.07;
      swing.pivot.rotation.z = Math.cos(time.elapsed * swing.speed * 0.8 + swing.phase) * 0.05;
    }
  }
}
