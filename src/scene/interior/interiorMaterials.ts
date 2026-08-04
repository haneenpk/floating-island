import { Color, MeshStandardMaterial, type Texture } from 'three';
import type { AssetManager } from '../../assets/AssetManager';

export interface InteriorMaterials {
  plaster: MeshStandardMaterial;
  floor: MeshStandardMaterial;
  woodDark: MeshStandardMaterial;
  woodWarm: MeshStandardMaterial;
  stone: MeshStandardMaterial;
  iron: MeshStandardMaterial;
  ember: MeshStandardMaterial;
}

let materials: InteriorMaterials | null = null;

function textureUrl(slug: string, map: string): string {
  return `/assets/textures/interior/${slug}/${slug}_${map}_2k.jpg`;
}

async function loadPbr(
  assets: AssetManager,
  slug: string,
  color: number,
  roughness = 1,
): Promise<MeshStandardMaterial> {
  const [map, normalMap, arm] = await Promise.all([
    assets.loadTexture(`int-${slug}-diff`, textureUrl(slug, 'diff'), { colorSpace: 'srgb' }),
    assets.loadTexture(`int-${slug}-nor`, textureUrl(slug, 'nor_gl'), { colorSpace: 'linear' }),
    assets.loadTexture(`int-${slug}-arm`, textureUrl(slug, 'arm'), { colorSpace: 'linear' }),
  ]);

  const material = new MeshStandardMaterial({
    color,
    roughness,
    metalness: 1, // ARM blue channel modulates this back down
    map,
    normalMap,
    aoMap: arm as Texture,
    roughnessMap: arm as Texture,
    metalnessMap: arm as Texture,
  });
  material.name = `interior-${slug}`;
  return material;
}

/** Loads the Poly Haven PBR sets; must complete before building the room. */
export async function initInteriorMaterials(assets: AssetManager): Promise<void> {
  if (materials) return;

  const [plaster, floor, woodDark, stone] = await Promise.all([
    loadPbr(assets, 'painted_plaster_wall', 0xf5ecd9),
    loadPbr(assets, 'wood_floor', 0xc9a077),
    loadPbr(assets, 'dark_wood', 0xa98a68),
    loadPbr(assets, 'castle_brick_07', 0xcfc7b8),
  ]);

  // warm wood shares the dark_wood maps with a lighter tint — texture reuse
  const woodWarm = woodDark.clone();
  woodWarm.color = new Color(0xd9ae7e);
  woodWarm.name = 'interior-wood-warm';

  const iron = new MeshStandardMaterial({ color: 0x3c3835, roughness: 0.6, metalness: 0.2 });
  iron.name = 'interior-iron';

  const ember = new MeshStandardMaterial({ color: 0x3a2214, roughness: 0.9, metalness: 0 });
  ember.emissive = new Color(0xff8c3a);
  ember.emissiveIntensity = 1.4;
  ember.name = 'interior-ember';

  materials = { plaster, floor, woodDark, woodWarm, stone, iron, ember };
}

export function getInteriorMaterials(): InteriorMaterials {
  if (!materials) {
    throw new Error('initInteriorMaterials() must complete before building the room');
  }
  return materials;
}
