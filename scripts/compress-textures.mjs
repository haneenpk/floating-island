/**
 * Re-encode the scanned textures for delivery.
 *
 * Poly Haven ships its JPEGs at near-lossless quality, which is right for a
 * source archive and wasteful over a network: the 2k set alone accounts for
 * most of what a visitor downloads. Real-time materials do not need that
 * headroom, so this re-encodes in place with mozjpeg at a quality that holds
 * up on screen.
 *
 * The originals are recoverable from git history if a texture ever needs to
 * be taken back to source (`git show <commit>:<path> > file.jpg`), and each
 * asset folder's SOURCE.txt records where it came from.
 *
 *   node scripts/compress-textures.mjs [--quality 80] [--dry]
 */
import { readdir, stat, rename, unlink } from 'node:fs/promises';
import { join, extname } from 'node:path';
import sharp from 'sharp';

const ROOT = 'public/assets';
const args = process.argv.slice(2);
const quality = Number(args[args.indexOf('--quality') + 1]) || 80;
const dryRun = args.includes('--dry');

async function collect(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await collect(full)));
    else if (['.jpg', '.jpeg'].includes(extname(entry.name).toLowerCase())) found.push(full);
  }
  return found;
}

const files = await collect(ROOT);
let before = 0;
let after = 0;
let rewritten = 0;

for (const file of files) {
  const originalSize = (await stat(file)).size;
  before += originalSize;

  const temporary = `${file}.tmp`;
  await sharp(file)
    .jpeg({ quality, mozjpeg: true, progressive: true, chromaSubsampling: '4:2:0' })
    .toFile(temporary);
  const newSize = (await stat(temporary)).size;

  // never trade size for nothing: keep whichever is smaller
  if (dryRun || newSize >= originalSize) {
    await unlink(temporary);
    after += originalSize;
    continue;
  }

  await rename(temporary, file);
  after += newSize;
  rewritten += 1;
}

const mb = (bytes) => (bytes / 1048576).toFixed(1);
console.log(`${files.length} textures, ${rewritten} rewritten at quality ${quality}`);
console.log(`${mb(before)} MB -> ${mb(after)} MB (${(100 - (after / before) * 100).toFixed(0)}% smaller)`);
if (dryRun) console.log('(dry run: nothing written)');
