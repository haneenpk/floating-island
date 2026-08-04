import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  MeshBasicMaterial,
  Object3D,
  OctahedronGeometry,
} from 'three';
import { getPlacementRecords } from './PlacementRegistry';

const NORMAL_LENGTH = 1.4;
const VALID_COLOR = new Color(0x2ee66a);
const INVALID_COLOR = new Color(0xff3b30);

const dummy = new Object3D();

export function buildPlacementDebugOverlay(): Group {
  const group = new Group();
  group.name = 'placement-debug';

  const records = getPlacementRecords();
  if (records.length === 0) return group;

  const linePositions = new Float32Array(records.length * 6);
  const lineColors = new Float32Array(records.length * 6);

  records.forEach((record, i) => {
    const color = record.valid ? VALID_COLOR : INVALID_COLOR;
    const offset = i * 6;

    linePositions[offset] = record.x;
    linePositions[offset + 1] = record.y;
    linePositions[offset + 2] = record.z;
    linePositions[offset + 3] = record.x + record.normalX * NORMAL_LENGTH;
    linePositions[offset + 4] = record.y + record.normalY * NORMAL_LENGTH;
    linePositions[offset + 5] = record.z + record.normalZ * NORMAL_LENGTH;

    for (const vertex of [0, 3]) {
      lineColors[offset + vertex] = color.r;
      lineColors[offset + vertex + 1] = color.g;
      lineColors[offset + vertex + 2] = color.b;
    }
  });

  const lineGeometry = new BufferGeometry();
  lineGeometry.setAttribute('position', new BufferAttribute(linePositions, 3));
  lineGeometry.setAttribute('color', new BufferAttribute(lineColors, 3));

  const normals = new LineSegments(
    lineGeometry,
    new LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true, opacity: 0.9 }),
  );
  normals.renderOrder = 999;

  const markers = new InstancedMesh(
    new OctahedronGeometry(0.09),
    new MeshBasicMaterial({ depthTest: false, transparent: true, opacity: 0.9 }),
    records.length,
  );
  markers.renderOrder = 999;

  records.forEach((record, i) => {
    dummy.position.set(record.x, record.y, record.z);
    dummy.updateMatrix();
    markers.setMatrixAt(i, dummy.matrix);
    markers.setColorAt(i, record.valid ? VALID_COLOR : INVALID_COLOR);
  });

  group.add(normals, markers);
  return group;
}
