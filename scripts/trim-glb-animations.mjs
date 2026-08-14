/**
 * Keep only the animation clips a model actually plays, and drop every scrap
 * of buffer nothing points at any more.
 *
 * The traveler arrives as a 3.6 MB character pack carrying 76 clips — attacks,
 * spellcasting, sitting, dying — of which the island plays three. Most of that
 * weight is not mesh but animation channels, and it is paid on every visit, by
 * every machine, including the ones we promise a GT 710 will manage.
 *
 * Nodes are left exactly where they are, so nothing has to be reindexed and
 * the skeleton the clips address is untouched. Only accessors and bufferViews
 * are renumbered, and the binary chunk is rebuilt from the survivors.
 *
 *   node scripts/trim-glb-animations.mjs in.glb out.glb Idle Walking_A Running_A
 */
import { readFileSync, writeFileSync } from 'node:fs';

const [input, output, ...keepNames] = process.argv.slice(2);
if (!input || !output || keepNames.length === 0) {
  console.error('usage: trim-glb-animations.mjs <in.glb> <out.glb> <clip> [clip...]');
  process.exit(1);
}

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

function readGlb(file) {
  const buf = readFileSync(file);
  if (buf.readUInt32LE(0) !== GLB_MAGIC) throw new Error(`${file} is not a .glb`);
  let offset = 12;
  let json = null;
  let bin = null;
  while (offset < buf.length) {
    const length = buf.readUInt32LE(offset);
    const type = buf.readUInt32LE(offset + 4);
    const body = buf.subarray(offset + 8, offset + 8 + length);
    if (type === CHUNK_JSON) json = JSON.parse(new TextDecoder().decode(body));
    if (type === CHUNK_BIN) bin = Buffer.from(body);
    offset += 8 + length + ((4 - (length % 4)) % 4);
  }
  if (!json || !bin) throw new Error('expected both a JSON and a BIN chunk');
  return { json, bin };
}

function writeGlb(file, json, bin) {
  const jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonPad = (4 - (jsonBuf.length % 4)) % 4;
  const binPad = (4 - (bin.length % 4)) % 4;
  const total = 12 + 8 + jsonBuf.length + jsonPad + 8 + bin.length + binPad;

  const out = Buffer.alloc(total);
  out.writeUInt32LE(GLB_MAGIC, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(total, 8);

  let at = 12;
  out.writeUInt32LE(jsonBuf.length + jsonPad, at);
  out.writeUInt32LE(CHUNK_JSON, at + 4);
  jsonBuf.copy(out, at + 8);
  out.fill(0x20, at + 8 + jsonBuf.length, at + 8 + jsonBuf.length + jsonPad); // spaces
  at += 8 + jsonBuf.length + jsonPad;

  out.writeUInt32LE(bin.length + binPad, at);
  out.writeUInt32LE(CHUNK_BIN, at + 4);
  bin.copy(out, at + 8);
  out.fill(0, at + 8 + bin.length, at + 8 + bin.length + binPad); // zeroes

  writeFileSync(file, out);
}

const { json, bin } = readGlb(input);

const wanted = new Set(keepNames);
const clipsBefore = (json.animations ?? []).length;
const kept = (json.animations ?? []).filter((clip) => wanted.has(clip.name));
const missing = keepNames.filter((name) => !kept.some((clip) => clip.name === name));
if (missing.length > 0) throw new Error(`no such clip: ${missing.join(', ')}`);
json.animations = kept;

// ---- what is still referenced ----
const usedAccessors = new Set();
for (const mesh of json.meshes ?? []) {
  for (const primitive of mesh.primitives) {
    for (const accessor of Object.values(primitive.attributes)) usedAccessors.add(accessor);
    if (primitive.indices !== undefined) usedAccessors.add(primitive.indices);
    for (const target of primitive.targets ?? []) {
      for (const accessor of Object.values(target)) usedAccessors.add(accessor);
    }
  }
}
for (const skin of json.skins ?? []) {
  if (skin.inverseBindMatrices !== undefined) usedAccessors.add(skin.inverseBindMatrices);
}
for (const clip of json.animations) {
  for (const sampler of clip.samplers) {
    usedAccessors.add(sampler.input);
    usedAccessors.add(sampler.output);
  }
}

const usedViews = new Set();
for (const index of usedAccessors) {
  const accessor = json.accessors[index];
  if (accessor.bufferView !== undefined) usedViews.add(accessor.bufferView);
  if (accessor.sparse) {
    usedViews.add(accessor.sparse.indices.bufferView);
    usedViews.add(accessor.sparse.values.bufferView);
  }
}
for (const image of json.images ?? []) {
  if (image.bufferView !== undefined) usedViews.add(image.bufferView);
}

// ---- rebuild the binary chunk from the survivors ----
const viewOrder = [...usedViews].sort((a, b) => a - b);
const viewRemap = new Map();
const pieces = [];
let cursor = 0;
const newViews = [];

for (const index of viewOrder) {
  const view = json.bufferViews[index];
  const start = view.byteOffset ?? 0;
  const slice = bin.subarray(start, start + view.byteLength);
  const pad = (4 - (cursor % 4)) % 4;
  if (pad > 0) {
    pieces.push(Buffer.alloc(pad));
    cursor += pad;
  }
  viewRemap.set(index, newViews.length);
  const rebuilt = { buffer: 0, byteOffset: cursor, byteLength: view.byteLength };
  if (view.byteStride !== undefined) rebuilt.byteStride = view.byteStride;
  if (view.target !== undefined) rebuilt.target = view.target;
  newViews.push(rebuilt);
  pieces.push(slice);
  cursor += view.byteLength;
}

const accessorOrder = [...usedAccessors].sort((a, b) => a - b);
const accessorRemap = new Map(accessorOrder.map((index, at) => [index, at]));
const newAccessors = accessorOrder.map((index) => {
  const accessor = { ...json.accessors[index] };
  if (accessor.bufferView !== undefined) accessor.bufferView = viewRemap.get(accessor.bufferView);
  if (accessor.sparse) {
    accessor.sparse = {
      ...accessor.sparse,
      indices: {
        ...accessor.sparse.indices,
        bufferView: viewRemap.get(accessor.sparse.indices.bufferView),
      },
      values: {
        ...accessor.sparse.values,
        bufferView: viewRemap.get(accessor.sparse.values.bufferView),
      },
    };
  }
  return accessor;
});

const remapAccessor = (index) => {
  const next = accessorRemap.get(index);
  if (next === undefined) throw new Error(`accessor ${index} was pruned but is still referenced`);
  return next;
};

for (const mesh of json.meshes ?? []) {
  for (const primitive of mesh.primitives) {
    for (const [key, value] of Object.entries(primitive.attributes)) {
      primitive.attributes[key] = remapAccessor(value);
    }
    if (primitive.indices !== undefined) primitive.indices = remapAccessor(primitive.indices);
    for (const target of primitive.targets ?? []) {
      for (const [key, value] of Object.entries(target)) target[key] = remapAccessor(value);
    }
  }
}
for (const skin of json.skins ?? []) {
  if (skin.inverseBindMatrices !== undefined) {
    skin.inverseBindMatrices = remapAccessor(skin.inverseBindMatrices);
  }
}
for (const clip of json.animations) {
  for (const sampler of clip.samplers) {
    sampler.input = remapAccessor(sampler.input);
    sampler.output = remapAccessor(sampler.output);
  }
}
for (const image of json.images ?? []) {
  if (image.bufferView !== undefined) image.bufferView = viewRemap.get(image.bufferView);
}

const newBin = Buffer.concat(pieces);
json.accessors = newAccessors;
json.bufferViews = newViews;
json.buffers = [{ byteLength: newBin.length }];

writeGlb(output, json, newBin);

const before = readFileSync(input).length;
const after = readFileSync(output).length;
console.log(
  `${input} -> ${output}\n` +
    `  kept ${kept.length} of ${clipsBefore} clips: ${kept.map((c) => c.name).join(', ')}\n` +
    `  ${(before / 1024 / 1024).toFixed(2)} MB -> ${(after / 1024 / 1024).toFixed(2)} MB ` +
    `(${Math.round((1 - after / before) * 100)}% smaller)`,
);
