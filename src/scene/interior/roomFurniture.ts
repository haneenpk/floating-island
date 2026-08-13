import {
  Box3,
  CanvasTexture,
  CircleGeometry,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
  type BufferGeometry,
  type Object3D,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { SeededRandom } from '../../procgen/SeededRandom';
import { getInteriorMaterials } from './interiorMaterials';
import { box, ROOM_D, ROOM_W, UPPER_Y } from './roomParts';

export interface RoomProps {
  plant?: GLTF | undefined;
  chair?: GLTF | undefined;
  door?: GLTF | undefined;
  desk?: GLTF | undefined;
  chest?: GLTF | undefined;
  closet?: GLTF | undefined;
  book?: GLTF | undefined;
  bed?: GLTF | undefined;
}

export interface RoomInteractable {
  id: string;
  label: string;
  object: Object3D;
}

const scratchBox = new Box3();
const scratchSize = new Vector3();

/** Clone a GLB, scale it to a target height, and stand it on a floor. */
function place(
  gltf: GLTF,
  targetHeight: number,
  x: number,
  z: number,
  yaw: number,
  floorY = 0,
): Group {
  const model = gltf.scene.clone(true) as Group;
  scratchBox.setFromObject(model);
  scratchBox.getSize(scratchSize);
  const scale = targetHeight / scratchSize.y;
  model.scale.setScalar(scale);
  model.position.set(x, floorY - scratchBox.min.y * scale, z);
  model.rotation.y = yaw;
  return model;
}

function makeMapTexture(): CanvasTexture {
  const w = 256;
  const h = 192;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const random = new SeededRandom(0x0a97);

  ctx.fillStyle = '#d9c49a';
  ctx.fillRect(0, 0, w, h);
  // aged blotches
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(140, 110, 70, ${random.range(0.02, 0.07)})`;
    ctx.beginPath();
    ctx.arc(random.range(0, w), random.range(0, h), random.range(6, 30), 0, Math.PI * 2);
    ctx.fill();
  }
  // island blobs in brown ink
  ctx.strokeStyle = '#6b4a2f';
  ctx.lineWidth = 2;
  ctx.fillStyle = 'rgba(124, 154, 106, 0.55)';
  for (const [cx, cy, r] of [
    [86, 88, 34],
    [180, 62, 20],
    [168, 138, 15],
  ] as const) {
    ctx.beginPath();
    for (let a = 0; a <= 20; a++) {
      const theta = (a / 20) * Math.PI * 2;
      const wobble = r * (0.75 + 0.3 * Math.sin(theta * 3 + cx));
      const px = cx + Math.cos(theta) * wobble;
      const py = cy + Math.sin(theta) * wobble * 0.8;
      if (a === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  // dashed sailing route
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(86, 88);
  ctx.quadraticCurveTo(130, 110, 180, 62);
  ctx.stroke();
  ctx.setLineDash([]);
  // compass rose
  ctx.save();
  ctx.translate(224, 160);
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -16);
    ctx.rotate(Math.PI / 2);
  }
  ctx.stroke();
  ctx.restore();
  // border
  ctx.lineWidth = 4;
  ctx.strokeRect(6, 6, w - 12, h - 12);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function makeRugTexture(): CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d')!;
  const colors = ['#a34c2c', '#d9a06b', '#b8683f', '#e8d3b0', '#a34c2c'];
  colors.forEach((color, i) => {
    context.fillStyle = color;
    context.beginPath();
    context.arc(size / 2, size / 2, (size / 2) * (1 - i * 0.18), 0, Math.PI * 2);
    context.fill();
  });
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

export function buildFurniture(props: RoomProps): {
  group: Group;
  interactables: RoomInteractable[];
} {
  const materials = getInteriorMaterials();
  const random = new SeededRandom(0xbeef);
  const group = new Group();
  group.name = 'room-furniture';

  const DESK_X = 1.9;
  const DESK_Z = 1.0;
  const DESK_H = 1.0;

  // hero furniture: Quaternius CC0 pieces (see models/interior/SOURCE.txt)
  if (props.desk) group.add(place(props.desk, DESK_H, DESK_X, DESK_Z, -0.25));
  if (props.chest) group.add(place(props.chest, 0.72, -3.5, 2.4, 1.15));
  if (props.closet) group.add(place(props.closet, 2.25, ROOM_W / 2 - 0.5, 2.6, -Math.PI / 2));
  // the loft: a bed under the round window's light
  if (props.bed) group.add(place(props.bed, 1.15, ROOM_W / 2 - 1.3, 1.5, -Math.PI / 2, UPPER_Y));

  // wooden chair (Quaternius) pulled up to the desk
  if (props.chair) group.add(place(props.chair, 1.35, 0.95, 2.0, -0.4 + Math.PI));

  // the exit: an arched door on the +X wall (clicking it leads outside)
  if (props.door) group.add(place(props.door, 2.5, ROOM_W / 2 - 0.16, -0.25, -Math.PI / 2));

  // wall shelf near the fireplace with a seeded book row
  const shelf = new Mesh(
    mergeGeometries([
      box(1.3, 0.06, 0.34, { position: [-3.75, 1.9, -ROOM_D / 2 + 0.28] }),
      box(1.3, 0.06, 0.34, { position: [-3.75, 1.42, -ROOM_D / 2 + 0.28] }),
    ])!,
    materials.woodDark,
  );
  group.add(shelf);

  const bookColors = [0x9a4f39, 0x5d7a5a, 0xc7a464, 0x536a86];
  const bookBuckets = bookColors.map(() => [] as BufferGeometry[]);
  for (const shelfY of [1.93, 1.45]) {
    let x = -4.27;
    while (x < -3.27) {
      const width = random.range(0.05, 0.1);
      const height = random.range(0.24, 0.36);
      bookBuckets[random.int(0, bookColors.length - 1)]!.push(
        box(width, height, 0.26, {
          position: [x + width / 2, shelfY + height / 2, -ROOM_D / 2 + 0.28],
          rotation: [0, 0, random.next() < 0.12 ? -0.09 : 0],
        }),
      );
      x += width + random.range(0.008, 0.03);
    }
  }
  bookBuckets.forEach((bucket, i) => {
    if (bucket.length === 0) return;
    const material = new MeshStandardMaterial({ color: bookColors[i]!, roughness: 0.85 });
    group.add(new Mesh(mergeGeometries(bucket)!, material));
  });

  // rugs: one under the desk, a smaller one in the loft
  const rugMaterial = new MeshStandardMaterial({ map: makeRugTexture(), roughness: 0.95 });
  const rug = new Mesh(new CircleGeometry(1.7, 32), rugMaterial);
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(1.2, 0.012, 1.0);
  rug.receiveShadow = true;
  group.add(rug);

  const loftRug = new Mesh(new CircleGeometry(1.25, 32), rugMaterial);
  loftRug.rotation.x = -Math.PI / 2;
  loftRug.position.set(1.4, UPPER_Y + 0.012, 1.4);
  loftRug.receiveShadow = true;
  group.add(loftRug);

  // lanterns: one on the desk, one beside the loft bed
  const makeLantern = (x: number, y: number, z: number): Group => {
    const lantern = new Group();
    lantern.position.set(x, y, z);
    const cage = new Mesh(new CylinderGeometry(0.09, 0.11, 0.22, 6, 1, true), materials.iron);
    cage.position.y = 0.13;
    const core = new Mesh(new IcosahedronGeometry(0.055, 1), materials.ember);
    core.position.y = 0.13;
    const cap = new Mesh(new CylinderGeometry(0.035, 0.1, 0.05, 6), materials.iron);
    cap.position.y = 0.27;
    lantern.add(cage, core, cap);
    return lantern;
  };
  group.add(makeLantern(DESK_X - 0.45, DESK_H, DESK_Z - 0.2));
  group.add(makeLantern(1.0, UPPER_Y, 3.0));

  // plants: Quaternius houseplants (pot included in the model)
  if (props.plant) {
    // corner under the book shelves, by the fireplace
    group.add(place(props.plant, 0.7, -3.9, -ROOM_D / 2 + 0.65, 2.4));
    group.add(place(props.plant, 0.75, -3.4, 2.6, 2.3, UPPER_Y));
    // one hangs from the ceiling by the fireplace
    const rope = new Mesh(new CylinderGeometry(0.015, 0.015, 0.65, 5), materials.iron);
    rope.position.set(-1.2, 2.9, 1.7);
    group.add(rope);
    group.add(place(props.plant, 0.55, -1.2, 1.7, 1.1, 2.36));
  }

  // ---- interactable navigation points ----
  const interactables: RoomInteractable[] = [];

  // the open book (Quaternius) on the desk — Story
  if (props.book) {
    const book = place(props.book, 0.09, DESK_X + 0.25, DESK_Z + 0.1, 0.35);
    book.position.y += DESK_H;
    group.add(book);
    interactables.push({ id: 'story', label: 'the story', object: book });
  }

  // the map — World (pinned by the exit door)
  const map = new Mesh(
    new PlaneGeometry(1.05, 0.78),
    new MeshStandardMaterial({ map: makeMapTexture(), roughness: 0.95 }),
  );
  map.position.set(-1.0, 1.9, -ROOM_D / 2 + 0.13);
  group.add(map);
  interactables.push({ id: 'world', label: 'the world', object: map });

  // the painting — Gallery, hung in the loft: the island itself, framed
  const painting = new Group();
  // the chimney breast carries on up through the loft, narrower than below,
  // and its face sits at x ≈ -3.97 — hung at standing eye height up there
  painting.position.set(-3.93, UPPER_Y + 1.45, -0.6);
  painting.rotation.y = Math.PI / 2;
  const frame = new Mesh(
    box(0.78, 0.56, 0.06),
    new MeshStandardMaterial({ color: 0x6a4a2c, roughness: 0.6 }),
  );
  const art = new Mesh(
    new PlaneGeometry(0.66, 0.46),
    new MeshStandardMaterial({ color: 0x7e97ae, roughness: 0.9 }),
  );
  art.position.z = 0.035;
  // resolve art.material at load time: interactable registration clones
  // materials (for hover glow), so a captured reference would go stale
  new TextureLoader().load('/assets/textures/interior/painting.jpg', (texture) => {
    texture.colorSpace = SRGBColorSpace;
    const material = art.material as MeshStandardMaterial;
    material.map = texture;
    material.color.set(0xffffff);
    material.needsUpdate = true;
  });
  painting.add(frame, art);
  group.add(painting);
  interactables.push({ id: 'gallery', label: 'the gallery', object: painting });

  // the crystal — future feature (on the chest)
  const crystal = new Mesh(
    new IcosahedronGeometry(0.08, 0),
    new MeshStandardMaterial({
      color: 0x8fd8d2,
      roughness: 0.25,
      emissive: 0x2e8f88,
      emissiveIntensity: 0.9,
    }),
  );
  // nestled inside the open chest, glowing from within
  crystal.position.set(-3.45, 0.36, 2.36);
  crystal.rotation.set(0.4, 0.7, 0.2);
  group.add(crystal);
  interactables.push({ id: 'future', label: 'something sleeping', object: crystal });

  return { group, interactables };
}
