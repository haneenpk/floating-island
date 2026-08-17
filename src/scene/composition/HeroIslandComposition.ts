import {
  Box3,
  Group,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  PointLight,
  Raycaster,
  Vector3,
} from "three";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import type { AssetManager } from "../../assets/AssetManager";
import { getQuality } from "../../core/Quality";
import { applyWind } from "../../materials/windMaterial";
import { SeededRandom } from "../../procgen/SeededRandom";
import { TAU } from "../../utils/math";
import { CottageSmoke } from "../atmosphere/CottageSmoke";
import { createWornGround } from "../atmosphere/WornGround";
import type { FloatingIsland } from "../islands/FloatingIsland";
import {
  SurfacePlacer,
  type PlacementCategory,
} from "../placement/SurfacePlacer";
import type { Updatable } from "../Updatable";
import { GardenDressing } from "./GardenDressing";
import type { Blocker } from "./solidGround";
import { instanceModelAt, type InstancePoint } from "./instancedModelScatter";

const windBox = new Box3();

/**
 * Vegetation sways; rock does not. Trees get per-material tuning — stiff
 * bark, looser branches, fluttering leaves — while ground foliage gets one
 * gentle profile. Amplitudes are in the model's local units.
 */
function applyVegetationWind(gltf: GLTF, category: PlacementCategory): void {
  if (category !== "tree" && category !== "foliage") return;

  windBox.setFromObject(gltf.scene);
  const height = windBox.max.y - windBox.min.y;

  gltf.scene.traverse((child) => {
    if (!(child instanceof Mesh)) return;
    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material];
    for (const material of materials) {
      if (!(material instanceof MeshStandardMaterial)) continue;

      if (category === "foliage") {
        applyWind(material, {
          amplitude: height * 0.07,
          flutter: height * 0.02,
          height,
        });
      } else if (material.name.includes("leaves")) {
        applyWind(material, {
          amplitude: height * 0.012,
          flutter: height * 0.0022,
          height,
        });
      } else if (material.name.includes("branch")) {
        applyWind(material, {
          amplitude: height * 0.009,
          flutter: height * 0.0008,
          height,
        });
      } else {
        applyWind(material, { amplitude: height * 0.005, flutter: 0, height });
      }
    }
  });
}

const MODEL_FILES = {
  islandTreeLarge: {
    folder: "island_tree_02",
    kind: "hero",
    hasLods: true,
    category: "tree",
  },
  islandTreeSmall: {
    folder: "island_tree_01",
    kind: "hero",
    hasLods: true,
    category: "tree",
  },
  coastRocks: {
    folder: "coast_rocks_05",
    kind: "hero",
    hasLods: true,
    category: "rock",
  },
  springRocks: {
    folder: "coast_rocks_03",
    kind: "hero",
    hasLods: true,
    category: "outcrop",
  },
  rockFace: {
    folder: "rock_face_02",
    kind: "hero",
    hasLods: false,
    category: "outcrop",
  },
  boulder: {
    folder: "namaqualand_boulder_03",
    kind: "hero",
    hasLods: true,
    category: "rock",
  },
  celandine: {
    folder: "celandine_01",
    kind: "foliage",
    hasLods: true,
    category: "foliage",
  },
  grassClump: {
    folder: "grass_medium_01",
    kind: "foliage",
    hasLods: true,
    category: "foliage",
  },
  fern: {
    folder: "fern_02",
    kind: "foliage",
    hasLods: false,
    category: "foliage",
  },
  periwinkle: {
    folder: "periwinkle_plant",
    kind: "foliage",
    hasLods: false,
    category: "foliage",
  },
} as const satisfies Record<
  string,
  {
    folder: string;
    kind: "hero" | "foliage";
    hasLods: boolean;
    category: PlacementCategory;
  }
>;

type ModelKey = keyof typeof MODEL_FILES;

// Quaternius "Fantasy House" (CC0) — see the model folder's SOURCE.txt.
const HOUSE_KEY = "fantasyHouse";
const HOUSE_URL = "/assets/models/fantasy_house/fantasy_house.glb";
const HOUSE_TARGET_HEIGHT = 7.6;
// where the cottage stands and which way its door faces — the portal,
// garden dressing and worn path all key off these
const HOUSE_RADIAL = 0.44;
const HOUSE_ANGLE = 6.05;
const HOUSE_YAW = 0.67;

// The height band a walker's body occupies — trunk measured there, not at the
// roots where it flares nor up where it forks.
const BOLE_BAND_LOW = 0.25;
const BOLE_BAND_HIGH = 1.3;
// how far apart two pieces of wood must be to count as separate boles
const BOLE_SPREAD = 1.0;
const BOLE_MARGIN = 0.12;
// a cluster smaller than this is noise; a bole thinner than this is not a bole
const BOLE_MIN_POINTS = 8;
const BOLE_MIN_RADIUS = 0.4;

const TREE_KEYS: ReadonlySet<ModelKey> = new Set([
  "islandTreeLarge",
  "islandTreeSmall",
]);

function modelUrl(key: ModelKey): string {
  const { folder, kind, hasLods } = MODEL_FILES[key];
  const quality = getQuality();
  const variant =
    kind === "hero" ? quality.heroModelVariant : quality.foliageModelVariant;
  const suffix = hasLods ? variant : "2k";
  return `/assets/models/${folder}/${folder}_${suffix}.gltf`;
}

interface PropPlacement {
  model: ModelKey;
  radial: number;
  angle: number;
  yaw: number;
  scale: number;
  /** Extra horizontal-only scale — thickens a trunk without adding height. */
  girth?: number;
}

interface DriftZone {
  model: ModelKey;
  radial: number;
  angle: number;
  radius: number;
  count: number;
  scale: [number, number];
  castShadow?: boolean;
}

const PROPS: PropPlacement[] = [
  // The one tree. It stands alone on its authored knoll (see mounds in
  // IslandParams) — elevation, isolation, and scale make it the focal point
  // without anything else needing to point at it.
  {
    model: "islandTreeLarge",
    radial: 0.3,
    angle: 2.4,
    yaw: 2.1,
    scale: 5.1,
    girth: 1.12,
  },
  // Rock work: one cluster on the sunlit rim, one quiet companion stone.
  { model: "coastRocks", radial: 0.78, angle: 5.5, yaw: 2.1, scale: 1.05 },
  { model: "boulder", radial: 0.52, angle: 1.7, yaw: 4.6, scale: 0.75 },
  // Source rocks cradle the spring pool — the river emerges from beneath
  // them instead of starting in open grass. They sit on the rim bulge
  // authored at the same angle in the island params.
  { model: "springRocks", radial: 0.55, angle: 2.22, yaw: 0.9, scale: 0.5 },
];

// Counts are per individual clump: the scatter sources hold 17 grass / 5 flower
// variations each, and every instance is now a single grounded clump.
const DRIFTS: DriftZone[] = [
  // Flowers pool on the tree's sunlit side, thinning with distance.
  {
    model: "celandine",
    radial: 0.42,
    angle: 2.05,
    radius: 2.6,
    count: 28,
    scale: [1.6, 2.2],
  },
  {
    model: "celandine",
    radial: 0.62,
    angle: 0.7,
    radius: 2.0,
    count: 14,
    scale: [1.5, 2.0],
  },
  // A soft grass skirt grounds the trunk; fringes thicken the rim edges so the
  // meadow reads lush where it meets the cliff drop.
  {
    model: "grassClump",
    radial: 0.36,
    angle: 2.35,
    radius: 3.4,
    count: 46,
    scale: [2.0, 3.0],
  },
  {
    model: "grassClump",
    radial: 0.74,
    angle: 5.4,
    radius: 2.2,
    count: 22,
    scale: [1.8, 2.6],
  },
  {
    model: "grassClump",
    radial: 0.85,
    angle: 3.6,
    radius: 3.0,
    count: 26,
    scale: [1.8, 2.6],
  },
  {
    model: "grassClump",
    radial: 0.82,
    angle: 0.7,
    radius: 2.4,
    count: 18,
    scale: [1.8, 2.6],
  },
  // Ferns gather in the tree's shade and along the rim; periwinkle carpets
  // patch the open meadow — replacing the procedural moss mounds.
  {
    model: "fern",
    radial: 0.34,
    angle: 2.6,
    radius: 3.0,
    count: 20,
    scale: [1.6, 2.4],
  },
  {
    model: "fern",
    radial: 0.78,
    angle: 3.6,
    radius: 2.4,
    count: 12,
    scale: [1.4, 2.0],
  },
  {
    model: "periwinkle",
    radial: 0.6,
    angle: 1.5,
    radius: 2.6,
    count: 14,
    scale: [1.4, 2.0],
  },
  {
    model: "periwinkle",
    radial: 0.7,
    angle: 5.6,
    radius: 2.0,
    count: 10,
    scale: [1.3, 1.8],
  },
];

export interface HeroComposition {
  updatables: Updatable[];
  house: Group;
  smoke: CottageSmoke;
  /** the hero tree — hidden while inside the cottage (its canopy overlaps the room) */
  heroTree: Group | null;
  /** what the traveler cannot walk through, in island space */
  blockers: Blocker[];
  /** surfaces the traveler stands on top of rather than passing under */
  ledges: Object3D[];
}

export async function composeHeroIsland(
  island: FloatingIsland,
  assets: AssetManager,
): Promise<HeroComposition> {
  const quality = getQuality();
  const placer = new SurfacePlacer(island.surface);

  let treesPlaced = 0;
  const activeProps = PROPS.filter((prop) => {
    if (!TREE_KEYS.has(prop.model)) return true;
    treesPlaced += 1;
    return treesPlaced <= quality.treeBudget;
  });

  const activeZones = DRIFTS.map((zone) => ({
    ...zone,
    count: Math.round(
      zone.count *
        (zone.model === "grassClump"
          ? quality.grassDensity
          : quality.flowerDensity),
    ),
  })).filter((zone) => zone.count > 0);

  const usedModels = new Set<ModelKey>([
    ...activeProps.map((prop) => prop.model),
    ...activeZones.map((zone) => zone.model),
  ]);
  await Promise.all([
    ...[...usedModels].map(async (key) => {
      const gltf = await assets.loadModel(key, modelUrl(key));
      applyVegetationWind(gltf, MODEL_FILES[key].category);
    }),
    assets.loadModel(HOUSE_KEY, HOUSE_URL),
  ]);

  const dressing = new Group();
  dressing.name = "hero-dressing";

  const updatables: Updatable[] = [];
  const house = assets.cloneModel(HOUSE_KEY) as Group;
  let smoke: CottageSmoke;

  // Hero house: Quaternius "Fantasy House" (CC0 — provenance in the model's
  // SOURCE.txt). It claims the levelled pad authored in the island params;
  // scale is derived from its measured bounds so the ridge lands at a chosen
  // world height regardless of the model's native units.
  {
    const bounds = new Box3().setFromObject(house);
    const scale = HOUSE_TARGET_HEIGHT / (bounds.max.y - bounds.min.y);
    const { x, z } = planarPoint(island, HOUSE_RADIAL, HOUSE_ANGLE);
    placer.placeObject(house, "structure", x, z, HOUSE_YAW, scale);
    dressing.add(house);

    // signs of life: glowing windows, a warm lamp spill, chimney smoke and
    // a worn path where feet pass daily
    house.traverse((child) => {
      if (!(child instanceof Mesh)) return;
      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material];
      materials.forEach((material, i) => {
        if (!(material instanceof MeshStandardMaterial)) return;
        if (!/window|glass/i.test(`${child.name} ${material.name}`)) return;
        const lit = material.clone();
        lit.emissive.set(0xffb45c);
        lit.emissiveIntensity = 1.6;
        if (Array.isArray(child.material)) child.material[i] = lit;
        else child.material = lit;
      });
    });

    // Smoke rises from the ridge. Deriving that from world bounds after
    // placement does not work: the model's child matrices are baked
    // (matrixAutoUpdate = false), so setFromObject reports the unplaced
    // model. The pad height plus HOUSE_TARGET_HEIGHT is exact by
    // construction, so use that.
    const pad = island.surface.getHeightAt(x, z);
    smoke = new CottageSmoke(
      new Vector3(x, pad + HOUSE_TARGET_HEIGHT - 0.7, z),
    );
    dressing.add(smoke);
    updatables.push(smoke);

    if (getQuality().cottageLight) {
      // subtle: a hint of warmth at the walls, not a spotlight pool on the lawn
      const lamp = new PointLight(0xffc27a, 0.9, 7, 2);
      lamp.position.set(x, pad + 3.2, z);
      dressing.add(lamp);
    }

    // worn earth in front of the door — the door faces the house's yaw, not
    // the island's centre, so follow that same forward vector
    const wear = createWornGround(1.5);
    const wearX = x + Math.sin(HOUSE_YAW) * 2.2;
    const wearZ = z + Math.cos(HOUSE_YAW) * 2.2;
    wear.position.set(
      wearX,
      island.surface.getHeightAt(wearX, wearZ) + 0.04,
      wearZ,
    );
    dressing.add(wear);
  }

  let springSlab: Group | null = null;
  let heroTree: Group | null = null;
  for (const prop of activeProps) {
    const placed = placeProp(island, assets, placer, prop);
    if (prop.model === "springRocks") springSlab = placed;
    if (prop.model === "islandTreeLarge") heroTree = placed;
    dressing.add(placed);
  }

  const random = new SeededRandom(island.params.seed ^ 0x51ab);
  for (const zone of activeZones) {
    dressing.add(placeDrift(island, assets, placer, zone, random));
  }

  // the lived-in garden layer: lanterns, lamp post, fences, stepping stones
  // (the tree comes along so its lanterns can hang from real branches)
  const garden = new GardenDressing(island.surface, heroTree);
  dressing.add(garden);
  updatables.push(garden);

  island.add(dressing);
  island.updateMatrixWorld(true);
  if (springSlab) {
    supportSlab(island, assets, placer, dressing, springSlab);
  }
  return {
    updatables,
    house,
    smoke: smoke!,
    heroTree,
    blockers: solidThings(island, heroTree, garden.blockers),
    // the one thing on the island you stand *on* rather than beside
    ledges: springSlab ? [springSlab] : [],
  };
}

/**
 * The two things on this island you cannot walk through, worked out from the
 * same polar constants that place them.
 *
 * The rocks are deliberately absent. They were blockers once, and being
 * stopped a stride short of a boulder you can plainly see the top of felt
 * like a bug rather than a wall — worse, it made them impossible to climb,
 * since the blocker held you off the very footprint you were trying to stand
 * on. They are stood upon instead, which the ground sampling already handles.
 * Only the trunk and the cottage are things you must go around.
 */
function solidThings(
  island: FloatingIsland,
  heroTree: Group | null,
  garden: readonly Blocker[],
): Blocker[] {
  const cottage = planarPoint(island, HOUSE_RADIAL, HOUSE_ANGLE);

  return [
    ...treeBoles(island, heroTree),
    // the fence and the lamp post, as the garden itself laid them out
    ...garden,
    // The cottage, turned to face the way its door does, and sized to the
    // stone base rather than the timber storey that overhangs it. The
    // overhang begins nearly three units up and the traveler stands under
    // one — it can never touch them, so blocking out to it only stops people
    // a stride short of a wall they can see they have not reached.
    //
    // Pulled in by the traveler's own width, which the walk adds back, so
    // they come to rest with their shoulder against the stonework.
    {
      kind: "box",
      x: cottage.x,
      z: cottage.z,
      // The stone base measures 5.3 across when measured on the world axes —
      // but the cottage is turned 0.67 radians, and an axis-aligned box round
      // a rotated one is nearly half again too big. Undoing that rotation
      // puts its true half-width at about 1.89, which is what these are, less
      // the traveler's own width that the walk adds back.
      halfX: 1.62,
      halfZ: 1.62,
      yaw: HOUSE_YAW,
    },
  ];
}

/**
 * One collider per bole, measured off the tree itself.
 *
 * The hero tree is not a trunk but a handful of them, splayed out from the
 * middle. A single circle is wrong either way round: tight, and you walk
 * between the boles into the middle of the tree; wide, and you are stopped by
 * thin air where no wood is. So the wood is asked directly — every vertex
 * sitting in the band a walker's body occupies is gathered, clustered, and
 * each cluster becomes a circle around one bole. The gaps between them stay
 * open, because in the tree they are open.
 *
 * Leaves are excluded by their alpha-tested material, and this runs once at
 * generation time, never per frame.
 */
function treeBoles(island: FloatingIsland, tree: Group | null): Blocker[] {
  return uprightsIn(island, tree, {
    spread: BOLE_SPREAD,
    minPoints: BOLE_MIN_POINTS,
    minRadius: BOLE_MIN_RADIUS,
    margin: BOLE_MARGIN,
    limit: 8,
  });
}

interface ClusterRules {
  spread: number;
  minPoints: number;
  minRadius: number;
  margin: number;
  limit: number;
}

function uprightsIn(
  island: FloatingIsland,
  tree: Group | null,
  rules: ClusterRules,
): Blocker[] {
  if (!tree) return [];

  const point = new Vector3();
  const found: { x: number; z: number }[] = [];

  tree.updateMatrixWorld(true);
  tree.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    const material = Array.isArray(node.material) ? node.material[0] : node.material;
    if (material instanceof MeshStandardMaterial && material.alphaTest > 0) return;

    const position = node.geometry.getAttribute("position");
    if (!position) return;
    for (let i = 0; i < position.count; i += 1) {
      point.fromBufferAttribute(position, i).applyMatrix4(node.matrixWorld);
      island.worldToLocal(point);
      const above = point.y - island.surface.getHeightAt(point.x, point.z);
      if (above < BOLE_BAND_LOW || above > BOLE_BAND_HIGH) continue;
      found.push({ x: point.x, z: point.z });
    }
  });
  if (found.length === 0) return [];

  // greedy clustering: near an existing bole, or a new one
  const boles: { x: number; z: number; count: number; radius: number }[] = [];
  for (const spot of found) {
    let nearest: (typeof boles)[number] | null = null;
    let nearestGap = Infinity;
    for (const bole of boles) {
      const gap = Math.hypot(bole.x - spot.x, bole.z - spot.z);
      if (gap < nearestGap) {
        nearestGap = gap;
        nearest = bole;
      }
    }
    if (nearest && nearestGap < rules.spread) {
      nearest.x = (nearest.x * nearest.count + spot.x) / (nearest.count + 1);
      nearest.z = (nearest.z * nearest.count + spot.z) / (nearest.count + 1);
      nearest.count += 1;
    } else if (boles.length < rules.limit) {
      boles.push({ x: spot.x, z: spot.z, count: 1, radius: 0 });
    }
  }

  // and how wide each one actually is
  for (const spot of found) {
    let nearest: (typeof boles)[number] | null = null;
    let nearestGap = Infinity;
    for (const bole of boles) {
      const gap = Math.hypot(bole.x - spot.x, bole.z - spot.z);
      if (gap < nearestGap) {
        nearestGap = gap;
        nearest = bole;
      }
    }
    if (nearest) nearest.radius = Math.max(nearest.radius, nearestGap);
  }

  const measured = boles
    .filter((bole) => bole.count >= rules.minPoints)
    .map((bole) => ({
      kind: "round" as const,
      x: bole.x,
      z: bole.z,
      // A cluster of a few verts can measure almost nothing across, which
      // would be a collider you walk straight through. No bole is thinner
      // than this in practice, so no collider is either.
      radius: Math.max(bole.radius, rules.minRadius) + rules.margin,
    }));

  // If the mesh gave up nothing usable — a coarse LOD, a model that changed —
  // one circle at the tree's middle is worse than per-bole but far better
  // than a tree you can walk through.
  return measured;
}

/**
 * The spring slab is a scanned shelf with a concave underside — from low
 * angles daylight shows beneath its raised ends. Rather than guessing,
 * raycast the slab's underside on a grid, measure each column's gap to the
 * terrain, and pack ground-seated boulders where the gaps actually are.
 * Generation-time only; never runs per frame.
 */
function supportSlab(
  island: FloatingIsland,
  assets: AssetManager,
  placer: SurfacePlacer,
  dressing: Group,
  slab: Group,
): void {
  const bounds = new Box3().setFromObject(slab);
  const raycaster = new Raycaster();
  const down = new Vector3(0, -1, 0);
  const localPoint = new Vector3();

  const gaps: { x: number; z: number; gap: number }[] = [];
  for (let ix = 0; ix <= 7; ix++) {
    for (let iz = 0; iz <= 4; iz++) {
      const worldX = bounds.min.x + ((bounds.max.x - bounds.min.x) * ix) / 7;
      const worldZ = bounds.min.z + ((bounds.max.z - bounds.min.z) * iz) / 4;
      raycaster.set(new Vector3(worldX, bounds.max.y + 1, worldZ), down);
      const hits = raycaster.intersectObject(slab, true);
      if (hits.length === 0) continue;

      // the last (lowest) hit is the slab's underside in this column
      localPoint.copy(hits[hits.length - 1]!.point);
      island.worldToLocal(localPoint);
      const gap =
        localPoint.y - island.surface.getHeightAt(localPoint.x, localPoint.z);
      if (gap > 0.22 && gap < 2.6) {
        gaps.push({ x: localPoint.x, z: localPoint.z, gap });
      }
    }
  }

  gaps.sort((a, b) => b.gap - a.gap);
  const chosen: { x: number; z: number; gap: number }[] = [];
  for (const candidate of gaps) {
    if (chosen.length >= 6) break;
    if (
      chosen.every(
        (c) => Math.hypot(c.x - candidate.x, c.z - candidate.z) >= 0.85,
      )
    ) {
      chosen.push(candidate);
    }
  }

  chosen.forEach((support, i) => {
    const stone = assets.cloneModel("boulder") as Group;
    const scale = Math.min(Math.max(0.32 + support.gap * 0.55, 0.4), 1.0);
    placer.placeObject(stone, "rock", support.x, support.z, i * 1.7, scale);
    dressing.add(stone);
  });
}

function planarPoint(
  island: FloatingIsland,
  radial: number,
  angle: number,
): { x: number; z: number } {
  const dirX = Math.cos(angle);
  const dirZ = Math.sin(angle);
  const planar = island.surface.capRadiusAt(dirX, dirZ) * radial;
  return { x: dirX * planar, z: dirZ * planar };
}

function placeProp(
  island: FloatingIsland,
  assets: AssetManager,
  placer: SurfacePlacer,
  prop: PropPlacement,
): Group {
  const clone = assets.cloneModel(prop.model) as Group;
  const { x, z } = planarPoint(island, prop.radial, prop.angle);
  placer.placeObject(
    clone,
    MODEL_FILES[prop.model].category,
    x,
    z,
    prop.yaw,
    prop.scale,
  );
  if (prop.girth) {
    clone.scale.x *= prop.girth;
    clone.scale.z *= prop.girth;
  }
  return clone;
}

function placeDrift(
  island: FloatingIsland,
  assets: AssetManager,
  placer: SurfacePlacer,
  zone: DriftZone,
  random: SeededRandom,
): Group {
  const model = assets.getModel(zone.model);
  if (!model) {
    throw new Error(`Model "${zone.model}" has not been loaded`);
  }

  const center = planarPoint(island, zone.radial, zone.angle);
  const points: InstancePoint[] = [];

  for (let i = 0; i < zone.count; i++) {
    const theta = random.next() * TAU;
    const distance = Math.sqrt(random.next()) * zone.radius;
    const x = center.x + Math.cos(theta) * distance;
    const z = center.z + Math.sin(theta) * distance;

    const planar = Math.hypot(x, z);
    const dirX = planar > 1e-6 ? x / planar : 1;
    const dirZ = planar > 1e-6 ? z / planar : 0;
    if (planar > island.surface.capRadiusAt(dirX, dirZ) * 0.92) continue;

    points.push({
      x,
      z,
      yaw: random.next() * TAU,
      scale: random.range(zone.scale[0], zone.scale[1]),
      variant: random.int(0, 31),
    });
  }

  const group = instanceModelAt(
    model,
    points,
    zone.castShadow ?? false,
    placer,
    MODEL_FILES[zone.model].category,
  );
  group.name = `drift-${zone.model}`;
  return group;
}
