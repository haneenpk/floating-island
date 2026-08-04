import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { simplify, weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import { resolve } from 'node:path';

const MODELS_ROOT = resolve(process.cwd(), 'public/assets/models');

const LOD_TARGETS = [
  { name: 'island_tree_01', lod1: 0.25, lod2: 0.12 },
  { name: 'island_tree_02', lod1: 0.25, lod2: 0.12 },
  { name: 'coast_rocks_03', lod1: 0.15, lod2: 0.05 },
  { name: 'coast_rocks_05', lod1: 0.15, lod2: 0.05 },
  { name: 'namaqualand_boulder_03', lod1: 0.5, lod2: 0.25 },
  { name: 'celandine_01', lod1: 0.4, lod2: 0.2 },
  { name: 'grass_medium_01', lod1: 0.3, lod2: 0.12 },
];

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

function countTriangles(document) {
  let triangles = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const indices = primitive.getIndices();
      if (indices) triangles += indices.getCount() / 3;
    }
  }
  return Math.round(triangles);
}

async function generateLod(name, suffix, ratio) {
  const sourcePath = resolve(MODELS_ROOT, name, `${name}_2k.gltf`);
  const document = await io.read(sourcePath);
  const before = countTriangles(document);

  await document.transform(
    weld(),
    simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.001 }),
  );

  const after = countTriangles(document);
  for (const buffer of document.getRoot().listBuffers()) {
    buffer.setURI(`${name}_${suffix}.bin`);
  }
  const outPath = resolve(MODELS_ROOT, name, `${name}_${suffix}.gltf`);
  await io.write(outPath, document);
  console.log(`${name}_${suffix}: ${before.toLocaleString()} -> ${after.toLocaleString()} tris`);
}

for (const target of LOD_TARGETS) {
  await generateLod(target.name, 'lod1', target.lod1);
  await generateLod(target.name, 'lod2', target.lod2);
}

console.log('LOD generation complete.');
