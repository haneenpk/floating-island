import {
  Group,
  InstancedMesh,
  Mesh,
  Object3D,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type Material,
} from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { PlacementCategory, SurfacePlacer } from '../placement/SurfacePlacer';

export interface InstancePoint {
  x: number;
  z: number;
  yaw: number;
  scale: number;
  variant: number;
}

interface ModelVariant {
  geometry: BufferGeometry;
  material: Material | Material[];
  restQuaternion: Quaternion;
  restScale: Vector3;
  height: number;
  baseOffset: number;
}

const dummy = new Object3D();
const discardedTranslation = new Vector3();

/**
 * Scatter-asset GLTFs (Poly Haven) arrange their clump variations in a
 * showcase row. Each mesh is treated as an independent variant: the row
 * translation is discarded and every instance is one clump, grounded by
 * its own terrain sample.
 */
function collectVariants(gltf: GLTF): ModelVariant[] {
  gltf.scene.updateMatrixWorld(true);

  const variants: ModelVariant[] = [];
  gltf.scene.traverse((child) => {
    if (!(child instanceof Mesh)) return;

    const restQuaternion = new Quaternion();
    const restScale = new Vector3();
    child.matrixWorld.decompose(discardedTranslation, restQuaternion, restScale);

    const geometry = child.geometry as BufferGeometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    if (!box) return;

    variants.push({
      geometry,
      material: child.material,
      restQuaternion,
      restScale,
      height: (box.max.y - box.min.y) * restScale.y,
      baseOffset: box.min.y * restScale.y,
    });
  });

  return variants;
}

export function instanceModelAt(
  gltf: GLTF,
  points: InstancePoint[],
  castShadow: boolean,
  placer: SurfacePlacer,
  category: PlacementCategory,
): Group {
  const group = new Group();
  const variants = collectVariants(gltf);
  if (variants.length === 0) return group;

  const buckets: InstancePoint[][] = variants.map(() => []);
  for (const point of points) {
    buckets[point.variant % variants.length]!.push(point);
  }

  for (let i = 0; i < variants.length; i++) {
    const variant = variants[i]!;
    const bucket = buckets[i]!;
    if (bucket.length === 0) continue;

    const instanced = new InstancedMesh(variant.geometry, variant.material, bucket.length);
    let written = 0;

    for (const point of bucket) {
      const pose = placer.poseAt(
        category,
        point.x,
        point.z,
        point.yaw,
        variant.height * point.scale,
        variant.baseOffset * point.scale,
      );
      if (!pose.valid) continue;

      dummy.position.copy(pose.position);
      dummy.quaternion.copy(pose.quaternion).multiply(variant.restQuaternion);
      dummy.scale.copy(variant.restScale).multiplyScalar(point.scale);
      dummy.updateMatrix();
      instanced.setMatrixAt(written, dummy.matrix);
      written += 1;
    }

    if (written === 0) continue;

    instanced.count = written;
    instanced.castShadow = castShadow;
    instanced.receiveShadow = true;
    instanced.computeBoundingSphere();
    group.add(instanced);
  }

  return group;
}
