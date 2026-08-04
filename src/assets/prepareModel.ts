import { DoubleSide, Mesh, MeshStandardMaterial, type Object3D, type Texture } from 'three';
import { getQuality } from '../core/Quality';

function configureTexture(texture: Texture | null): void {
  const anisotropy = getQuality().anisotropy;
  if (texture && texture.anisotropy < anisotropy) {
    texture.anisotropy = anisotropy;
    texture.needsUpdate = true;
  }
}

function configureMaterial(material: MeshStandardMaterial): void {
  configureTexture(material.map);
  configureTexture(material.normalMap);
  configureTexture(material.roughnessMap);
  configureTexture(material.aoMap);

  const usesAlpha = material.transparent || material.alphaTest > 0;
  if (usesAlpha && material.map) {
    material.transparent = false;
    material.alphaTest = Math.max(material.alphaTest, 0.45);
    material.depthWrite = true;
    material.side = DoubleSide;
  }
}

export function prepareModelScene(scene: Object3D): Object3D {
  scene.traverse((child) => {
    if (!(child instanceof Mesh)) return;

    child.castShadow = true;
    child.receiveShadow = true;
    child.frustumCulled = true;
    child.updateMatrix();
    child.matrixAutoUpdate = false;

    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (material instanceof MeshStandardMaterial) {
        configureMaterial(material);
      }
    }
  });
  return scene;
}
