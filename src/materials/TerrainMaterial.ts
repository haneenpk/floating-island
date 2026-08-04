import { MeshStandardMaterial, type Texture } from 'three';
import { getQuality } from '../core/Quality';
import { windTimeUniform } from './windMaterial';
import {
  terrainAoFragment,
  terrainColorFragment,
  terrainFragmentDeclarations,
  terrainMapFragment,
  terrainNormalFragment,
  terrainRoughnessFragment,
  terrainVertexAssignments,
  terrainVertexDeclarations,
} from './terrainShaderChunks';

export interface TerrainLayer {
  diffuse: Texture;
  normal: Texture;
  arm: Texture;
  scale: number;
}

export interface TerrainMaterialConfig {
  name: string;
  base: TerrainLayer;
  accent: TerrainLayer;
  accentOnUp: boolean;
  accentEdges: [number, number];
  accentNoise?: number;
  triSharpness?: number;
  vertexColorStrength?: number;
  aoStrength?: number;
  roughness?: number;
  envMapIntensity?: number;
}

export function createTerrainMaterial(config: TerrainMaterialConfig): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    vertexColors: true,
    roughness: config.roughness ?? 1,
    metalness: 0,
  });
  material.name = config.name;
  material.envMapIntensity = config.envMapIntensity ?? 1;

  const uniforms = {
    uBaseDiff: { value: config.base.diffuse },
    uBaseNorm: { value: config.base.normal },
    uBaseArm: { value: config.base.arm },
    uAccentDiff: { value: config.accent.diffuse },
    uAccentNorm: { value: config.accent.normal },
    uAccentArm: { value: config.accent.arm },
    uBaseScale: { value: config.base.scale },
    uAccentScale: { value: config.accent.scale },
    uAccentEdge0: { value: config.accentEdges[0] },
    uAccentEdge1: { value: config.accentEdges[1] },
    uAccentOnUp: { value: config.accentOnUp ? 1 : 0 },
    uAccentNoise: { value: config.accentNoise ?? 0.7 },
    uTriSharpness: { value: config.triSharpness ?? 4 },
    uVertexColorStrength: { value: config.vertexColorStrength ?? 0.55 },
    uAoStrength: { value: config.aoStrength ?? 0.9 },
  };

  const simpleShading = getQuality().tier === 'low';

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.uniforms.uTime = windTimeUniform;
    if (simpleShading) {
      shader.defines = { ...shader.defines, TERRAIN_SIMPLE: 1 };
    }

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${terrainVertexDeclarations}`)
      .replace('#include <fog_vertex>', `#include <fog_vertex>\n${terrainVertexAssignments}`);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${terrainFragmentDeclarations}`)
      .replace('#include <map_fragment>', terrainMapFragment)
      .replace('#include <color_fragment>', terrainColorFragment)
      .replace('#include <normal_fragment_maps>', terrainNormalFragment)
      .replace('#include <roughnessmap_fragment>', terrainRoughnessFragment)
      .replace('#include <aomap_fragment>', terrainAoFragment);
  };

  material.customProgramCacheKey = () => `island-terrain-v1|${simpleShading ? 'simple' : 'full'}`;

  return material;
}
