import {
  Box3,
  CanvasTexture,
  ClampToEdgeWrapping,
  ConeGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  SphereGeometry,
  Vector2,
  type Texture,
} from 'three';
import type { AssetManager } from '../../assets/AssetManager';
import type { Time } from '../../core/Time';
import { SeededRandom } from '../../procgen/SeededRandom';
import type { Updatable } from '../Updatable';

// The island's own small tree, at its cheapest LOD — these are scenery
// hundreds of units out, so the low-poly variant is right on every tier.
const TREE_KEY = 'islet-tree';
const TREE_URL = '/assets/models/island_tree_01/island_tree_01_lod2.gltf';

/** Soft white streak for a faraway waterfall — feathered on every edge. */
function makeStreakTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createLinearGradient(0, 0, 0, 64);
  gradient.addColorStop(0, 'rgba(235, 244, 246, 0)');
  gradient.addColorStop(0.12, 'rgba(235, 244, 246, 0.8)');
  gradient.addColorStop(0.7, 'rgba(235, 244, 246, 0.32)');
  gradient.addColorStop(1, 'rgba(235, 244, 246, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 32, 64);
  // feather the sides so the ribbon never shows a hard rectangle edge
  ctx.globalCompositeOperation = 'destination-in';
  const sides = ctx.createLinearGradient(0, 0, 32, 0);
  sides.addColorStop(0, 'rgba(0,0,0,0)');
  sides.addColorStop(0.5, 'rgba(0,0,0,1)');
  sides.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sides;
  ctx.fillRect(0, 0, 32, 64);
  ctx.globalCompositeOperation = 'source-over';

  const texture = new CanvasTexture(canvas);
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  return texture;
}

function textureUrl(set: string, map: string): string {
  return `/assets/textures/${set}/textures/${set}_${map}_2k.jpg`;
}

/**
 * A tiling copy of one of the island's own Poly Haven sets. The originals are
 * already cached by the terrain, so this costs no extra download — cloning
 * only lets the islets set their own repeat without disturbing the terrain.
 */
async function tiledSet(
  assets: AssetManager,
  set: string,
  repeat: Vector2,
): Promise<{ map: Texture; normalMap: Texture; roughnessMap: Texture }> {
  const [diffuse, normal, arm] = await Promise.all([
    assets.loadTexture(`${set}-diff`, textureUrl(set, 'diff'), { colorSpace: 'srgb' }),
    assets.loadTexture(`${set}-nor`, textureUrl(set, 'nor_gl'), { colorSpace: 'linear' }),
    assets.loadTexture(`${set}-arm`, textureUrl(set, 'arm'), { colorSpace: 'linear' }),
  ]);
  const copy = (texture: Texture): Texture => {
    const clone = texture.clone();
    clone.wrapS = RepeatWrapping;
    clone.wrapT = RepeatWrapping;
    clone.repeat.copy(repeat);
    clone.needsUpdate = true;
    return clone;
  };
  return { map: copy(diffuse), normalMap: copy(normal), roughnessMap: copy(arm) };
}

export async function createDistantIslets(assets: AssetManager): Promise<DistantIslets> {
  const [turf, stone] = await Promise.all([
    tiledSet(assets, 'concrete_moss', new Vector2(3, 3)),
    tiledSet(assets, 'aerial_rocks_01', new Vector2(2, 2)),
    assets.loadModel(TREE_KEY, TREE_URL).catch(() => undefined),
  ]);

  const grass = new MeshStandardMaterial({ ...turf, color: 0x9fb277, roughness: 1, fog: true });
  const rock = new MeshStandardMaterial({
    ...stone,
    color: 0xa08f7a,
    roughness: 1,
    fog: true,
    flatShading: true,
  });
  return new DistantIslets(grass, rock, assets);
}

/**
 * Faraway sister islands adrift in the haze — a rock cone, a grassy crown,
 * a tree or two, and a thread of falling water. They wear the same scanned
 * textures as the hero island so the family resemblance holds at distance.
 */
export class DistantIslets extends Group implements Updatable {
  private readonly bobbers: { islet: Group; baseY: number; phase: number; speed: number }[] = [];

  constructor(grass: MeshStandardMaterial, rock: MeshStandardMaterial, assets: AssetManager) {
    super();
    this.name = 'distant-islets';
    // the small tree is loaded by the hero composition; skip the greenery
    // rather than throw if the islets are built before it
    const hasTree = assets.getModel(TREE_KEY) !== undefined;

    const random = new SeededRandom(0x151e7);
    const streak = new MeshStandardMaterial({
      map: makeStreakTexture(),
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      roughness: 1,
      fog: true,
    });

    // near enough to read as islands, far enough to stay scenery
    const spots: { x: number; y: number; z: number; scale: number }[] = [
      { x: -70, y: 4, z: -38, scale: 7 },
      { x: 64, y: -14, z: 50, scale: 6 },
      { x: 26, y: 11, z: -86, scale: 9 },
      { x: -54, y: -20, z: 66, scale: 5 },
    ];

    for (const spot of spots) {
      const islet = new Group();

      // craggy inverted cone, chunky like the hero island's underside
      const coneGeometry = new ConeGeometry(1, 1.9, 9, 4);
      const positions = coneGeometry.getAttribute('position');
      for (let i = 0; i < positions.count; i++) {
        const y = positions.getY(i);
        if (y < 0.85) {
          positions.setX(i, positions.getX(i) * random.range(0.78, 1.22));
          positions.setZ(i, positions.getZ(i) * random.range(0.78, 1.22));
          positions.setY(i, y + random.range(-0.14, 0.14));
        }
      }
      coneGeometry.computeVertexNormals();
      const cone = new Mesh(coneGeometry, rock);
      cone.rotation.x = Math.PI;
      cone.rotation.y = random.range(0, Math.PI);
      cone.position.y = -0.93;
      cone.scale.set(1, 1, random.range(0.85, 1.05));
      islet.add(cone);

      // turf: one closed, flattened sphere. A hemisphere shell would show
      // its hollow underside and dark grazing facets at the rim; a solid
      // avoids both, and its lower half hides inside the rock.
      const turf = new Mesh(new SphereGeometry(1.0, 14, 8), grass);
      turf.scale.y = 0.22;
      islet.add(turf);

      // height of the turf dome at a given distance from its centre, so
      // trees stand on it instead of sinking through
      const turfY = (radius: number): number =>
        0.22 * Math.sqrt(Math.max(1 - radius * radius, 0));

      // the island's own small tree, shrunk to islet scale
      if (hasTree) {
        const count = 1 + random.int(0, 1);
        for (let i = 0; i < count; i++) {
          const tree = assets.cloneModel(TREE_KEY);
          const bounds = new Box3().setFromObject(tree);
          const naturalHeight = Math.max(bounds.max.y - bounds.min.y, 0.001);
          // scale in the islet's local space, which is itself scaled up
          const local = random.range(1.7, 2.6) / (spot.scale * naturalHeight);
          tree.scale.setScalar(local);

          const offset = random.range(0.1, 0.5);
          const angle = random.range(0, Math.PI * 2);
          const tx = Math.cos(angle) * offset;
          const tz = Math.sin(angle) * offset;
          tree.position.set(tx, turfY(Math.hypot(tx, tz)) - bounds.min.y * local - 0.01, tz);
          tree.rotation.y = random.range(0, Math.PI * 2);
          islet.add(tree);
        }
      }

      // the fall spills off the rim and trails into the open air below
      const fall = new Mesh(new PlaneGeometry(0.26, 2.3), streak);
      fall.position.set(random.range(-0.4, 0.4), -1.05, random.range(0.85, 1.0));
      fall.rotation.y = random.range(-0.3, 0.3);
      islet.add(fall);

      islet.position.set(spot.x, spot.y, spot.z);
      islet.scale.setScalar(spot.scale);
      islet.rotation.y = random.range(0, Math.PI * 2);
      this.add(islet);
      this.bobbers.push({
        islet,
        baseY: spot.y,
        phase: random.range(0, Math.PI * 2),
        speed: random.range(0.06, 0.11),
      });
    }
  }

  update(time: Time): void {
    for (const bobber of this.bobbers) {
      bobber.islet.position.y =
        bobber.baseY + Math.sin(time.elapsed * bobber.speed + bobber.phase) * 1.4;
    }
  }
}
