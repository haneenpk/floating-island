import type { BufferGeometry } from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export function weldAndShade(geometry: BufferGeometry): BufferGeometry {
  geometry.deleteAttribute('uv');
  geometry.deleteAttribute('normal');
  const welded = mergeVertices(geometry);
  welded.computeVertexNormals();
  return welded;
}
