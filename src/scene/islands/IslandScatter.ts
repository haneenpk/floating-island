import {
  BufferAttribute,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Mesh,
  Object3D,
  TubeGeometry,
  Vector3,
  type BufferGeometry,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { PerlinNoise } from '../../procgen/PerlinNoise';
import type { SeededRandom } from '../../procgen/SeededRandom';
import { weldAndShade } from '../../utils/geometry';
import { clamp, lerp, smoothstep, TAU } from '../../utils/math';
import { SurfacePlacer } from '../placement/SurfacePlacer';
import type { IslandParams } from './IslandParams';
import { getDetailMaterial } from './islandMaterials';
import type { IslandSurface } from './IslandSurface';

export interface ScatterContext {
  surface: IslandSurface;
  params: IslandParams;
  noise: PerlinNoise;
  random: SeededRandom;
}

interface MeadowSample {
  x: number;
  z: number;
  u: number;
}

const REFERENCE_WIDTH = 24;

const dummy = new Object3D();
const scratchPoint = new Vector3();
const scratchColor = new Color();
const colorA = new Color();
const colorB = new Color();
const colorC = new Color();

export function buildIslandScatter(context: ScatterContext): Group {
  const group = new Group();
  group.name = 'island-details';

  const placer = new SurfacePlacer(context.surface);

  const rocks = scatterRocks(context, placer);
  if (rocks) group.add(rocks);

  const bushes = scatterBushes(context, placer);
  if (bushes) group.add(bushes);

  const flowers = scatterFlowers(context, placer);
  if (flowers) group.add(flowers);

  const roots = buildRoots(context);
  if (roots) group.add(roots);

  return group;
}

function sizeScale(params: IslandParams): number {
  return params.width / REFERENCE_WIDTH;
}

function scaledCount(params: IslandParams, base: number, density: number): number {
  const area = sizeScale(params) ** 2;
  return Math.round(base * density * area * params.detail);
}

function sampleMeadow(context: ScatterContext, maxU: number, out: MeadowSample): MeadowSample {
  const { surface, random } = context;
  const theta = random.next() * TAU;
  const u = Math.sqrt(random.next()) * maxU;
  const dirX = Math.cos(theta);
  const dirZ = Math.sin(theta);
  const planar = u * surface.capRadiusAt(dirX, dirZ);

  out.x = dirX * planar;
  out.z = dirZ * planar;
  out.u = u;
  return out;
}

function addUniformColor(geometry: BufferGeometry, value: number): void {
  const count = geometry.getAttribute('position').count;
  const colors = new Float32Array(count * 3).fill(value);
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
}

function makePebbleGeometry(noise: PerlinNoise): BufferGeometry {
  const geometry = new IcosahedronGeometry(1, 2);
  const positions = geometry.getAttribute('position');
  const colors = new Float32Array(positions.count * 3);

  for (let i = 0; i < positions.count; i++) {
    const nx = positions.getX(i);
    const ny = positions.getY(i);
    const nz = positions.getZ(i);

    const bump = noise.fbm(nx * 1.6 + 3.7, ny * 1.6 - 8.2, nz * 1.6 + 5.5, 3);
    const radius = 1 + 0.34 * bump;
    positions.setXYZ(i, nx * radius, ny * radius * 0.82, nz * radius);

    const shade =
      clamp(0.84 + bump * 0.3, 0.6, 1.05) * lerp(0.72, 1, smoothstep(-0.9, 0.35, ny));
    colors[i * 3] = shade;
    colors[i * 3 + 1] = shade;
    colors[i * 3 + 2] = shade;
  }

  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  return weldAndShade(geometry);
}

function makeBushGeometry(noise: PerlinNoise): BufferGeometry {
  const geometry = new IcosahedronGeometry(1, 2);
  const positions = geometry.getAttribute('position');
  const colors = new Float32Array(positions.count * 3);

  for (let i = 0; i < positions.count; i++) {
    const nx = positions.getX(i);
    const ny = positions.getY(i);
    const nz = positions.getZ(i);

    const lump = noise.fbm(nx * 2.3 - 6.4, ny * 2.3 + 12.8, nz * 2.3 - 1.9, 3);
    const radius = 1 + 0.3 * lump;
    positions.setXYZ(i, nx * radius, ny * radius * 0.75, nz * radius);

    const shade = lerp(0.52, 1.05, smoothstep(-1, 0.9, ny)) * clamp(0.92 + lump * 0.2, 0.8, 1.1);
    colors[i * 3] = shade;
    colors[i * 3 + 1] = shade;
    colors[i * 3 + 2] = shade;
  }

  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  return weldAndShade(geometry);
}

function scatterRocks(context: ScatterContext, placer: SurfacePlacer): InstancedMesh | null {
  const { params, noise, random } = context;
  const count = scaledCount(params, 42, params.scatter.rocks);
  if (count < 1) return null;

  const geometry = makePebbleGeometry(noise);
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const pebbleHeight = box.max.y - box.min.y;

  const mesh = new InstancedMesh(geometry, getDetailMaterial(), count);
  mesh.name = 'small-rocks';

  colorA.set(params.colors.rock);
  colorB.set(params.colors.rockDark);
  colorC.set(params.colors.moss);

  const sample: MeadowSample = { x: 0, z: 0, u: 0 };
  const scale = sizeScale(params);
  let placed = 0;
  let attempts = count * 12;

  while (placed < count && attempts-- > 0) {
    sampleMeadow(context, 0.86, sample);

    const cluster = noise.fbm(sample.x * 0.22 + 40.1, 3.3, sample.z * 0.22 - 27.5, 2);
    if (random.next() > 0.3 + clamp(0.5 + cluster, 0, 1) * 0.55) continue;

    const size = random.range(0.14, 0.5) * (1 + clamp(cluster, 0, 1) * 0.8) * scale;
    const sizeY = size * random.range(0.6, 1.05);
    const yaw = random.range(0, TAU);

    const pose = placer.poseAt('rock', sample.x, sample.z, yaw, pebbleHeight * sizeY, box.min.y * sizeY);
    if (!pose.valid) continue;

    dummy.position.copy(pose.position);
    dummy.quaternion.copy(pose.quaternion);
    dummy.rotateX(random.range(-0.25, 0.25));
    dummy.rotateZ(random.range(-0.25, 0.25));
    dummy.scale.set(size * random.range(0.75, 1.35), sizeY, size * random.range(0.75, 1.35));
    dummy.updateMatrix();
    mesh.setMatrixAt(placed, dummy.matrix);

    scratchColor.copy(colorA).lerp(colorB, random.range(0.05, 0.6));
    if (random.next() < 0.35) {
      scratchColor.lerp(colorC, params.moss * random.range(0.15, 0.45));
    }
    mesh.setColorAt(placed, scratchColor);
    placed++;
  }

  return finalizeInstances(mesh, placed, true);
}

function scatterBushes(context: ScatterContext, placer: SurfacePlacer): InstancedMesh | null {
  const { params, noise, random } = context;
  const count = scaledCount(params, 20, params.scatter.bushes);
  if (count < 1) return null;

  const geometry = makeBushGeometry(noise);
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const bushHeight = box.max.y - box.min.y;

  const mesh = new InstancedMesh(geometry, getDetailMaterial(), count);
  mesh.name = 'bushes';

  colorA.set(params.colors.moss);
  colorB.set(params.colors.grass);

  const sample: MeadowSample = { x: 0, z: 0, u: 0 };
  const scale = sizeScale(params);
  let placed = 0;
  let attempts = count * 12;

  while (placed < count && attempts-- > 0) {
    sampleMeadow(context, 0.8, sample);

    const cluster = noise.fbm(sample.x * 0.14 - 11.3, 7.7, sample.z * 0.14 + 19.2, 2);
    if (random.next() > 0.25 + clamp(0.5 + cluster, 0, 1) * 0.6) continue;

    const size = random.range(0.5, 1.25) * scale;
    const sizeY = size * random.range(0.65, 0.9);
    const yaw = random.range(0, TAU);

    const pose = placer.poseAt('foliage', sample.x, sample.z, yaw, bushHeight * sizeY, box.min.y * sizeY);
    if (!pose.valid) continue;

    dummy.position.copy(pose.position);
    dummy.quaternion.copy(pose.quaternion);
    dummy.scale.set(size * random.range(0.85, 1.25), sizeY, size * random.range(0.85, 1.25));
    dummy.updateMatrix();
    mesh.setMatrixAt(placed, dummy.matrix);

    scratchColor.copy(colorA).lerp(colorB, random.range(0.2, 0.65));
    scratchColor.multiplyScalar(random.range(0.85, 1.08));
    mesh.setColorAt(placed, scratchColor);
    placed++;
  }

  return finalizeInstances(mesh, placed, true);
}

function scatterFlowers(context: ScatterContext, placer: SurfacePlacer): Group | null {
  const { params, surface, random } = context;
  const count = scaledCount(params, 150, params.scatter.flowers);
  if (count < 1) return null;

  const stemGeometry = new CylinderGeometry(0.035, 0.05, 1, 5, 1);
  stemGeometry.translate(0, 0.5, 0);
  addUniformColor(stemGeometry, 1);

  const headGeometry = new IcosahedronGeometry(0.16, 0);
  addUniformColor(headGeometry, 1);

  const stems = new InstancedMesh(stemGeometry, getDetailMaterial(), count);
  stems.name = 'flower-stems';
  const heads = new InstancedMesh(headGeometry, getDetailMaterial(), count);
  heads.name = 'flower-heads';

  colorA.set(params.colors.flowerWarm);
  colorB.set(params.colors.flowerCool);
  colorC.set(params.colors.grass);

  const sample: MeadowSample = { x: 0, z: 0, u: 0 };
  const scale = sizeScale(params);
  let placed = 0;
  let attempts = count * 14;

  while (placed < count && attempts-- > 0) {
    sampleMeadow(context, 0.84, sample);

    const patch = surface.patchAt(sample.x, sample.z);
    if (random.next() > 0.15 + clamp(0.5 + patch * 1.6, 0, 1) * 0.7) continue;

    const height = random.range(0.3, 0.62) * scale;
    const yaw = random.range(0, TAU);

    const pose = placer.poseAt('foliage', sample.x, sample.z, yaw, height, 0);
    if (!pose.valid) continue;

    dummy.position.copy(pose.position);
    dummy.quaternion.copy(pose.quaternion);
    dummy.scale.set(scale, height, scale);
    dummy.updateMatrix();
    stems.setMatrixAt(placed, dummy.matrix);

    scratchColor.copy(colorC).multiplyScalar(random.range(0.62, 0.8));
    stems.setColorAt(placed, scratchColor);

    const headSize = random.range(0.7, 1.15) * scale;
    scratchPoint.set(0, height, 0).applyQuaternion(pose.quaternion).add(pose.position);
    dummy.position.copy(scratchPoint);
    dummy.rotation.set(random.range(0, TAU), random.range(0, TAU), random.range(0, TAU));
    dummy.scale.set(headSize, headSize * 0.8, headSize);
    dummy.updateMatrix();
    heads.setMatrixAt(placed, dummy.matrix);

    const hueMix = clamp(0.5 + patch * 1.2, 0, 1);
    scratchColor
      .copy(colorA)
      .lerp(colorB, clamp(hueMix + random.range(-0.15, 0.15), 0, 1))
      .multiplyScalar(random.range(0.95, 1.05));
    heads.setColorAt(placed, scratchColor);
    placed++;
  }

  const finalStems = finalizeInstances(stems, placed, false);
  const finalHeads = finalizeInstances(heads, placed, false);
  if (!finalStems || !finalHeads) return null;

  const group = new Group();
  group.name = 'flowers';
  group.add(finalStems, finalHeads);
  return group;
}

function buildRoots(context: ScatterContext): Mesh | null {
  const { params, surface, random } = context;
  const count = Math.round(lerp(0, 13, params.scatter.roots) * sizeScale(params));
  if (count < 1) return null;

  colorA.set(params.colors.soil);
  colorB.set(params.colors.rockDark);

  const scale = sizeScale(params);
  const pieces: BufferGeometry[] = [];

  for (let r = 0; r < count; r++) {
    const theta = random.next() * TAU;
    const dirX = Math.cos(theta);
    const dirZ = Math.sin(theta);

    const anchorPlanar = surface.capRadiusAt(dirX, dirZ) * random.range(0.9, 0.99);
    const x0 = dirX * anchorPlanar;
    const z0 = dirZ * anchorPlanar;
    const y0 = -params.grassThickness * random.range(0.15, 0.35);

    const length = random.range(2.2, 5.0) * scale;
    const swayX = random.range(-0.55, 0.55) * length;
    const swayZ = random.range(-0.55, 0.55) * length;

    const curve = new CatmullRomCurve3([
      new Vector3(x0, y0 + 0.3, z0),
      new Vector3(x0 + dirX * length * 0.3, y0 - length * 0.3, z0 + dirZ * length * 0.3),
      new Vector3(
        x0 + dirX * length * 0.18 + swayX * 0.5,
        y0 - length * 0.7,
        z0 + dirZ * length * 0.18 + swayZ * 0.5,
      ),
      new Vector3(x0 + swayX, y0 - length * 1.05, z0 + swayZ),
    ]);

    const tubularSegments = 12;
    const radialSegments = 5;
    const tube = new TubeGeometry(
      curve,
      tubularSegments,
      random.range(0.055, 0.11) * scale,
      radialSegments,
      false,
    );

    const positions = tube.getAttribute('position');
    const colors = new Float32Array(positions.count * 3);
    scratchColor.copy(colorA).lerp(colorB, random.range(0.2, 0.6));

    for (let ring = 0; ring <= tubularSegments; ring++) {
      const t = ring / tubularSegments;
      curve.getPointAt(t, scratchPoint);
      const pinch = 1 - 0.72 * t;
      const shade = 1 - t * 0.3;

      for (let j = 0; j <= radialSegments; j++) {
        const index = ring * (radialSegments + 1) + j;
        positions.setXYZ(
          index,
          scratchPoint.x + (positions.getX(index) - scratchPoint.x) * pinch,
          scratchPoint.y + (positions.getY(index) - scratchPoint.y) * pinch,
          scratchPoint.z + (positions.getZ(index) - scratchPoint.z) * pinch,
        );
        colors[index * 3] = scratchColor.r * shade;
        colors[index * 3 + 1] = scratchColor.g * shade;
        colors[index * 3 + 2] = scratchColor.b * shade;
      }
    }

    tube.setAttribute('color', new BufferAttribute(colors, 3));
    pieces.push(weldAndShade(tube));
  }

  const merged = mergeGeometries(pieces);
  if (!merged) return null;

  const mesh = new Mesh(merged, getDetailMaterial());
  mesh.name = 'roots';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function finalizeInstances(
  mesh: InstancedMesh,
  placed: number,
  shadows: boolean,
): InstancedMesh | null {
  if (placed < 1) {
    mesh.geometry.dispose();
    return null;
  }

  mesh.count = placed;
  mesh.castShadow = shadows;
  mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  return mesh;
}
