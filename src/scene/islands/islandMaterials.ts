import { MeshStandardMaterial } from 'three';
import type { AssetManager } from '../../assets/AssetManager';
import { createTerrainMaterial, type TerrainLayer } from '../../materials/TerrainMaterial';

let rockMaterial: MeshStandardMaterial | null = null;
let grassMaterial: MeshStandardMaterial | null = null;
let detailMaterial: MeshStandardMaterial | null = null;

function textureUrl(set: string, map: string): string {
  return `/assets/textures/${set}/textures/${set}_${map}_2k.jpg`;
}

async function loadTerrainLayer(
  assets: AssetManager,
  set: string,
  scale: number,
): Promise<TerrainLayer> {
  const [diffuse, normal, arm] = await Promise.all([
    assets.loadTexture(`${set}-diff`, textureUrl(set, 'diff'), { colorSpace: 'srgb' }),
    assets.loadTexture(`${set}-nor`, textureUrl(set, 'nor_gl'), { colorSpace: 'linear' }),
    assets.loadTexture(`${set}-arm`, textureUrl(set, 'arm'), { colorSpace: 'linear' }),
  ]);
  return { diffuse, normal, arm, scale };
}

export async function initIslandMaterials(assets: AssetManager): Promise<void> {
  if (rockMaterial && grassMaterial) return;

  const [rockLayer, mossOnRockLayer, meadowLayer, dirtLayer] = await Promise.all([
    loadTerrainLayer(assets, 'aerial_rocks_01', 0.12),
    loadTerrainLayer(assets, 'concrete_moss', 0.3),
    loadTerrainLayer(assets, 'concrete_moss', 0.26),
    loadTerrainLayer(assets, 'dirt', 0.2),
  ]);

  rockMaterial = createTerrainMaterial({
    name: 'island-rock',
    base: rockLayer,
    accent: mossOnRockLayer,
    accentOnUp: true,
    accentEdges: [0.62, 0.9],
    accentNoise: 0.8,
    vertexColorStrength: 0.5,
    aoStrength: 0.95,
    envMapIntensity: 0.5,
  });

  grassMaterial = createTerrainMaterial({
    name: 'island-grass',
    base: meadowLayer,
    accent: dirtLayer,
    accentOnUp: false,
    accentEdges: [0.5, 0.85],
    accentNoise: 0.6,
    vertexColorStrength: 0.55,
    aoStrength: 0.85,
    envMapIntensity: 0.6,
  });
}

export function getRockMaterial(): MeshStandardMaterial {
  if (!rockMaterial) {
    throw new Error('initIslandMaterials() must complete before island generation');
  }
  return rockMaterial;
}

export function getGrassMaterial(): MeshStandardMaterial {
  if (!grassMaterial) {
    throw new Error('initIslandMaterials() must complete before island generation');
  }
  return grassMaterial;
}

export function getDetailMaterial(): MeshStandardMaterial {
  if (!detailMaterial) {
    detailMaterial = new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.9,
      metalness: 0,
    });
    detailMaterial.name = 'island-detail';
  }
  return detailMaterial;
}
