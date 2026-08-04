import { CircleGeometry, Mesh, MeshBasicMaterial, MultiplyBlending } from 'three';
import { getWearTexture } from './softTextures';

/**
 * A soft multiply-blended patch that darkens the grass — worn earth where
 * feet pass daily. White edges make the blend a no-op at the rim.
 */
export function createWornGround(radius = 1.5): Mesh {
  const material = new MeshBasicMaterial({
    map: getWearTexture(),
    blending: MultiplyBlending,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });

  const patch = new Mesh(new CircleGeometry(radius, 24), material);
  patch.name = 'worn-ground';
  patch.rotation.x = -Math.PI / 2;
  patch.renderOrder = 1;
  return patch;
}
