import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const SOURCE = resolve(process.cwd(), 'img&video/0b87b07ce3ee1a30880d92093883bb75.jpg');
const OUT_DIR = resolve(process.cwd(), 'public/assets/textures/clouds');
const OUT_FILE = resolve(OUT_DIR, 'cloud_billboard.png');

const WHITE_THRESHOLD = 245;
const TARGET_WIDTH = 2048;
const FEATHER_SIGMA = 2.2;

const { data, info } = await sharp(SOURCE).raw().toBuffer({ resolveWithObject: true });
const { width, height, channels } = info;

// Flood-fill the border-connected near-white background into a transparency
// mask; bright pixels inside the cloud stay opaque because they never touch
// the border region.
const background = new Uint8Array(width * height);
const queue = [];

function tryEnqueue(x, y) {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const index = y * width + x;
  if (background[index]) return;
  const p = index * channels;
  if (data[p] > WHITE_THRESHOLD && data[p + 1] > WHITE_THRESHOLD && data[p + 2] > WHITE_THRESHOLD) {
    background[index] = 1;
    queue.push(index);
  }
}

for (let x = 0; x < width; x++) {
  tryEnqueue(x, 0);
  tryEnqueue(x, height - 1);
}
for (let y = 0; y < height; y++) {
  tryEnqueue(0, y);
  tryEnqueue(width - 1, y);
}
while (queue.length > 0) {
  const index = queue.pop();
  const x = index % width;
  const y = (index - x) / width;
  tryEnqueue(x + 1, y);
  tryEnqueue(x - 1, y);
  tryEnqueue(x, y + 1);
  tryEnqueue(x, y - 1);
}

const alpha = Buffer.alloc(width * height);
for (let i = 0; i < width * height; i++) {
  alpha[i] = background[i] ? 0 : 255;
}

const feathered = await sharp(alpha, { raw: { width, height, channels: 1 } })
  .blur(FEATHER_SIGMA)
  .toColourspace('b-w')
  .raw()  
  .toBuffer({ resolveWithObject: true });
if (feathered.info.channels !== 1) {
  throw new Error(`Expected 1-channel alpha, got ${feathered.info.channels}`);
}
const featheredAlpha = feathered.data;

const rgba = Buffer.alloc(width * height * 4);
for (let i = 0; i < width * height; i++) {
  const p = i * channels;
  rgba[i * 4] = data[p];
  rgba[i * 4 + 1] = data[p + 1];
  rgba[i * 4 + 2] = data[p + 2];
  rgba[i * 4 + 3] = featheredAlpha[i];
}

await mkdir(OUT_DIR, { recursive: true });
await sharp(rgba, { raw: { width, height, channels: 4 } })
  .resize({ width: TARGET_WIDTH, kernel: 'lanczos3' })
  .png()
  .toFile(OUT_FILE);

// Dark-background composite so the (mostly white) cloud and its alpha edge
// can be inspected visually.
await sharp(OUT_FILE)
  .flatten({ background: { r: 20, g: 40, b: 80 } })
  .jpeg({ quality: 90 })
  .toFile(resolve(OUT_DIR, 'cloud_billboard_preview.jpg'));

const opaque = alpha.filter((value) => value > 0).length;
console.log(
  `cloud_billboard.png: ${width}x${height} -> ${TARGET_WIDTH} wide, ` +
    `${Math.round((opaque / alpha.length) * 100)}% cloud coverage`,
);
