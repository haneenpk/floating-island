import {
  Box3,
  Group,
  Mesh,
  MeshStandardMaterial,
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
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (!(material instanceof MeshStandardMaterial)) continue;

      if (category === "foliage") {
        applyWind(material, { amplitude: height * 0.07, flutter: height * 0.02, height });
      } else if (material.name.includes("leaves")) {
        applyWind(material, { amplitude: height * 0.012, flutter: height * 0.0022, height });
      } else if (material.name.includes("branch")) {
        applyWind(material, { amplitude: height * 0.009, flutter: height * 0.0008, height });
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
  await Promise.all(
    [
      ...[...usedModels].map(async (key) => {
        const gltf = await assets.loadModel(key, modelUrl(key));
        applyVegetationWind(gltf, MODEL_FILES[key].category);
      }),
      assets.loadModel(HOUSE_KEY, HOUSE_URL),
    ],
  );

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
      const materials = Array.isArray(child.material) ? child.material : [child.material];
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
    smoke = new CottageSmoke(new Vector3(x, pad + HOUSE_TARGET_HEIGHT - 0.7, z));
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
    wear.position.set(wearX, island.surface.getHeightAt(wearX, wearZ) + 0.04, wearZ);
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
  const garden = new GardenDressing(island.surface);
  dressing.add(garden);
  updatables.push(garden);

  island.add(dressing);
  island.updateMatrixWorld(true);
  if (springSlab) {
    supportSlab(island, assets, placer, dressing, springSlab);
  }
  return { updatables, house, smoke: smoke!, heroTree };
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
      const gap = localPoint.y - island.surface.getHeightAt(localPoint.x, localPoint.z);
      if (gap > 0.22 && gap < 2.6) {
        gaps.push({ x: localPoint.x, z: localPoint.z, gap });
      }
    }
  }

  gaps.sort((a, b) => b.gap - a.gap);
  const chosen: { x: number; z: number; gap: number }[] = [];
  for (const candidate of gaps) {
    if (chosen.length >= 6) break;
    if (chosen.every((c) => Math.hypot(c.x - candidate.x, c.z - candidate.z) >= 0.85)) {
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
