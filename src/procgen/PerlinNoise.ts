import type { SeededRandom } from './SeededRandom';

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function grad(hash: number, x: number, y: number, z: number): number {
  const h = hash & 15;
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

export class PerlinNoise {
  private readonly perm: Uint8Array;

  constructor(random: SeededRandom) {
    const source = new Uint8Array(256);
    for (let i = 0; i < 256; i++) source[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = random.int(0, i);
      const swap = source[i]!;
      source[i] = source[j]!;
      source[j] = swap;
    }

    this.perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.perm[i] = source[i & 255]!;
  }

  noise(x: number, y: number, z: number): number {
    const p = this.perm;

    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;

    x -= Math.floor(x);
    y -= Math.floor(y);
    z -= Math.floor(z);

    const u = fade(x);
    const v = fade(y);
    const w = fade(z);

    const a = p[X]! + Y;
    const aa = p[a & 255]! + Z;
    const ab = p[(a + 1) & 255]! + Z;
    const b = p[X + 1]! + Y;
    const ba = p[b & 255]! + Z;
    const bb = p[(b + 1) & 255]! + Z;

    const lerp = (t: number, from: number, to: number) => from + t * (to - from);

    return lerp(
      w,
      lerp(
        v,
        lerp(u, grad(p[aa & 255]!, x, y, z), grad(p[ba & 255]!, x - 1, y, z)),
        lerp(u, grad(p[ab & 255]!, x, y - 1, z), grad(p[bb & 255]!, x - 1, y - 1, z)),
      ),
      lerp(
        v,
        lerp(u, grad(p[(aa + 1) & 255]!, x, y, z - 1), grad(p[(ba + 1) & 255]!, x - 1, y, z - 1)),
        lerp(
          u,
          grad(p[(ab + 1) & 255]!, x, y - 1, z - 1),
          grad(p[(bb + 1) & 255]!, x - 1, y - 1, z - 1),
        ),
      ),
    );
  }

  fbm(x: number, y: number, z: number, octaves: number, gain = 0.5, lacunarity = 2): number {
    let sum = 0;
    let amplitude = 1;
    let frequency = 1;
    let normalization = 0;

    for (let i = 0; i < octaves; i++) {
      sum += amplitude * this.noise(x * frequency, y * frequency, z * frequency);
      normalization += amplitude;
      amplitude *= gain;
      frequency *= lacunarity;
    }

    return sum / normalization;
  }
}
