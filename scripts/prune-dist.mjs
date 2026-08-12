/**
 * Drop from the built output the assets the site never asks for.
 *
 * public/ holds sources as well as what is served: every model that has LOD
 * variants also keeps its full-resolution original, which the quality tiers
 * never load — they choose lod1 or lod2 — and the LOD pipeline still needs
 * those originals to regenerate from. So they stay in the repo and leave the
 * deployment, rather than the other way round.
 *
 * It matters beyond weight: one of those originals is 58 MB, past the 25 MB
 * per-file ceiling on Cloudflare Pages, and would fail the upload outright.
 *
 * Run as part of `npm run build`.
 */
import { readdir, rm, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';

const DIST = 'dist/assets';
const MAX_FILE_MB = 25;

// the previous sky, kept for reference but no longer named in settings.ts
const EXPLICIT_DROPS = ['hdri/sunflowers_puresky_2k.hdr'];

// A model no composition places. It is gitignored, so a deploy built from
// the repository never sees it — dropping it here keeps a local build
// honest about what actually ships.
const DROP_DIRECTORIES = ['models/island_tree_03'];

const removed = [];
let removedBytes = 0;

async function drop(relative) {
  const path = join(DIST, relative);
  try {
    removedBytes += (await stat(path)).size;
    await unlink(path);
    removed.push(relative);
  } catch {
    // already absent: nothing to do
  }
}

// full-resolution model sources, wherever LODs exist alongside them
const modelsDir = join(DIST, 'models');
for (const entry of await readdir(modelsDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const files = await readdir(join(modelsDir, entry.name));
  const hasLods = files.some((file) => /_lod\d\.gltf$/.test(file));
  if (!hasLods) continue;

  for (const file of files) {
    if (file === `${entry.name}.bin` || file === `${entry.name}_2k.gltf`) {
      await drop(join('models', entry.name, file));
    }
  }
}

for (const relative of EXPLICIT_DROPS) await drop(relative);

for (const relative of DROP_DIRECTORIES) {
  const path = join(DIST, relative);
  try {
    for (const file of await readdir(path, { recursive: true, withFileTypes: true })) {
      if (file.isFile()) removedBytes += (await stat(join(file.parentPath, file.name))).size;
    }
    await rm(path, { recursive: true, force: true });
    removed.push(`${relative}/`);
  } catch {
    // absent, as it will be on any build from a clean checkout
  }
}

// whatever remains has to clear the host's per-file ceiling
const oversized = [];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path);
    else {
      const { size } = await stat(path);
      if (size > MAX_FILE_MB * 1048576) oversized.push(`${(size / 1048576).toFixed(1)} MB  ${path}`);
    }
  }
}
await walk('dist');

console.log(
  `pruned ${removed.length} unserved files, ${(removedBytes / 1048576).toFixed(1)} MB`,
);
if (oversized.length) {
  console.warn(`\nover ${MAX_FILE_MB} MB and may be refused by the host:`);
  for (const line of oversized) console.warn(`  ${line}`);
}
