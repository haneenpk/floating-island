/**
 * Take the face off a character model.
 *
 * The island's traveler is faceless — not shadowed, not turned away, but
 * genuinely without features. Hiding the face behind something would leave it
 * in the file, one camera angle or one lighting change away from showing; so
 * the triangles are removed instead, and what stands under the hood has no
 * eyes, nose or mouth to find.
 *
 * Which triangles those are is decided by the palette texture rather than by
 * hand: every triangle on the named mesh is sampled at its centre, and the
 * ones that come back skin, brow or eye rather than hood cloth are dropped.
 * The hood itself is unmistakable in the palette — it is the only green.
 *
 * Indices are rewritten in place and a fresh accessor is appended; the old one
 * is left for trim-glb-animations.mjs to prune, which is the step that follows.
 *
 *   node scripts/unface-model.mjs in.glb out.glb Rogue_Head_Hooded
 */
import { readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const [input, output, meshNode] = process.argv.slice(2);
if (!input || !output || !meshNode) {
  console.error('usage: unface-model.mjs <in.glb> <out.glb> <node-name>');
  process.exit(1);
}

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

const buf = readFileSync(input);
if (buf.readUInt32LE(0) !== GLB_MAGIC) throw new Error(`${input} is not a .glb`);

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

const COMPONENT = {
  5121: { size: 1, read: (b, o) => b.readUInt8(o) },
  5123: { size: 2, read: (b, o) => b.readUInt16LE(o) },
  5125: { size: 4, read: (b, o) => b.readUInt32LE(o) },
  5126: { size: 4, read: (b, o) => b.readFloatLE(o) },
};
const COUNTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function readAccessor(index) {
  const accessor = json.accessors[index];
  const view = json.bufferViews[accessor.bufferView];
  const component = COMPONENT[accessor.componentType];
  const parts = COUNTS[accessor.type];
  const stride = view.byteStride ?? parts * component.size;
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);

  const out = [];
  for (let i = 0; i < accessor.count; i++) {
    for (let part = 0; part < parts; part++) {
      out.push(component.read(bin, start + i * stride + part * component.size));
    }
  }
  return out;
}

const node = json.nodes.find((candidate) => candidate.name === meshNode);
if (!node || node.mesh === undefined) throw new Error(`no mesh node named "${meshNode}"`);
const primitive = json.meshes[node.mesh].primitives[0];

const uv = readAccessor(primitive.attributes.TEXCOORD_0);
const indices = readAccessor(primitive.indices);

// the palette, straight out of the binary chunk
const image = json.images[0];
const imageView = json.bufferViews[image.bufferView];
const imageStart = imageView.byteOffset ?? 0;
const { data, info } = await sharp(bin.subarray(imageStart, imageStart + imageView.byteLength))
  .removeAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

function sample(u, v) {
  const x = Math.min(info.width - 1, Math.max(0, Math.round(u * info.width - 0.5)));
  const y = Math.min(info.height - 1, Math.max(0, Math.round(v * info.height - 0.5)));
  const at = (y * info.width + x) * 3;
  return [data[at], data[at + 1], data[at + 2]];
}

/** Hood cloth is the only green in this character's palette. */
const isCloth = ([r, g]) => g - r > 40;

const kept = [];
let dropped = 0;
for (let t = 0; t < indices.length; t += 3) {
  const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]];
  const u = (uv[a * 2] + uv[b * 2] + uv[c * 2]) / 3;
  const v = (uv[a * 2 + 1] + uv[b * 2 + 1] + uv[c * 2 + 1]) / 3;
  if (isCloth(sample(u, v))) kept.push(a, b, c);
  else dropped++;
}
if (dropped === 0) throw new Error('nothing was removed — is the palette what it was?');

// a fresh index buffer, appended; the old accessor becomes unreferenced
const pad = (4 - (bin.length % 4)) % 4;
const facesOffset = bin.length + pad;
const faces = Buffer.alloc(kept.length * 4);
kept.forEach((value, i) => faces.writeUInt32LE(value, i * 4));

const newBin = Buffer.concat([bin, Buffer.alloc(pad), faces]);
json.bufferViews.push({
  buffer: 0,
  byteOffset: facesOffset,
  byteLength: faces.length,
  target: 34963, // ELEMENT_ARRAY_BUFFER
});
json.accessors.push({
  bufferView: json.bufferViews.length - 1,
  componentType: 5125, // UNSIGNED_INT
  count: kept.length,
  type: 'SCALAR',
});
primitive.indices = json.accessors.length - 1;
json.buffers[0].byteLength = newBin.length;

const jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
const jsonPad = (4 - (jsonBuf.length % 4)) % 4;
const binPad = (4 - (newBin.length % 4)) % 4;
const total = 12 + 8 + jsonBuf.length + jsonPad + 8 + newBin.length + binPad;

const out = Buffer.alloc(total);
out.writeUInt32LE(GLB_MAGIC, 0);
out.writeUInt32LE(2, 4);
out.writeUInt32LE(total, 8);
let at = 12;
out.writeUInt32LE(jsonBuf.length + jsonPad, at);
out.writeUInt32LE(CHUNK_JSON, at + 4);
jsonBuf.copy(out, at + 8);
out.fill(0x20, at + 8 + jsonBuf.length, at + 8 + jsonBuf.length + jsonPad);
at += 8 + jsonBuf.length + jsonPad;
out.writeUInt32LE(newBin.length + binPad, at);
out.writeUInt32LE(CHUNK_BIN, at + 4);
newBin.copy(out, at + 8);
writeFileSync(output, out);

console.log(
  `${input} -> ${output}\n` +
    `  ${meshNode}: dropped ${dropped} triangles, kept ${kept.length / 3} of hood cloth`,
);
