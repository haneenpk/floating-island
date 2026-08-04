import {
  BufferAttribute,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  SphereGeometry,
  type BufferGeometry,
} from 'three';
import { PerlinNoise } from '../../procgen/PerlinNoise';
import { SeededRandom } from '../../procgen/SeededRandom';
import { weldAndShade } from '../../utils/geometry';
import { clamp, lerp, smoothstep, TAU } from '../../utils/math';
import { getGrassMaterial, getRockMaterial } from './islandMaterials';
import type { IslandParams } from './IslandParams';
import { buildIslandScatter } from './IslandScatter';
import { IslandSurface } from './IslandSurface';

const CRACK_DEPTH = 0.055;

const scratchColor = new Color();
const scratchTarget = new Color();

export interface GeneratedIsland {
  group: Group;
  surface: IslandSurface;
}

export function generateIsland(params: IslandParams): GeneratedIsland {
  return new IslandBuilder(params).build();
}

class IslandBuilder {
  private readonly noise: PerlinNoise;
  private readonly random: SeededRandom;
  private readonly surface: IslandSurface;
  private readonly halfWidth: number;
  private readonly capEmbed: number;
  private readonly tipOffsetX: number;
  private readonly tipOffsetZ: number;
  private readonly palette: Record<keyof IslandParams['colors'], Color>;

  private warpX = 0;
  private warpZ = 0;

  constructor(private readonly params: IslandParams) {
    this.random = new SeededRandom(params.seed);
    this.noise = new PerlinNoise(this.random);
    this.surface = new IslandSurface(this.noise, params);
    this.halfWidth = params.width / 2;
    this.capEmbed = params.grassThickness * 0.15;
    this.tipOffsetX = this.random.range(-0.16, 0.16) * this.halfWidth;
    this.tipOffsetZ = this.random.range(-0.16, 0.16) * this.halfWidth;
    this.palette = {
      rock: new Color(params.colors.rock),
      rockDark: new Color(params.colors.rockDark),
      strataAccent: new Color(params.colors.strataAccent),
      soil: new Color(params.colors.soil),
      grass: new Color(params.colors.grass),
      grassBright: new Color(params.colors.grassBright),
      moss: new Color(params.colors.moss),
      flowerWarm: new Color(params.colors.flowerWarm),
      flowerCool: new Color(params.colors.flowerCool),
    };
  }

  build(): GeneratedIsland {
    const group = new Group();
    group.name = `island-${this.params.seed}`;
    group.add(
      this.buildRockBody(),
      this.buildGrassCap(),
      buildIslandScatter({
        surface: this.surface,
        params: this.params,
        noise: this.noise,
        random: this.random,
      }),
    );
    return { group, surface: this.surface };
  }

  private strataCoord(v: number, dirX: number, dirZ: number): number {
    const wobble =
      this.noise.fbm(dirX * 0.9 + 2.2, 2.7, dirZ * 0.9 - 4.1, 2) * 0.75 +
      this.noise.fbm(dirX * 2.6 - 7.4, 5.1, dirZ * 2.6 + 3.9, 2) * 0.2;
    return v * this.params.terraces + wobble;
  }

  private ledge(v: number, dirX: number, dirZ: number): number {
    const { terraces, terraceStrength } = this.params;
    if (terraces < 1 || terraceStrength <= 0) return 0;

    const band = smoothstep(0.03, 0.12, v) * (1 - smoothstep(0.62, 0.88, v));
    if (band <= 0) return 0;

    const coord = this.strataCoord(v, dirX, dirZ);
    const cell = Math.floor(coord);
    const fraction = coord - cell;
    const depthVariation = 0.55 + 0.45 * this.noise.noise(cell * 5.13 + 31.7, 8.4, cell * 2.7);
    return Math.pow(fraction, 1.3) * depthVariation * terraceStrength * band;
  }

  /**
   * Angular-only noise (no vertical variation) — organic wobble layered on
   * top of the authored spires so the buttresses never look mathematical.
   */
  private buttressLobes(dirX: number, dirZ: number): number {
    return this.noise.fbm(dirX * 1.15 + 9.4, 2.2, dirZ * 1.15 - 5.8, 2);
  }

  /**
   * Authored spire field: 1 at a spire's heart, 0 in the clefts between.
   * Spire angles and relative depths come from params, so the underside
   * silhouette is art-directed rather than left to the noise.
   */
  private spireField(dirX: number, dirZ: number): number {
    let field = 0;
    for (const spire of this.params.spires) {
      const alignment = dirX * Math.cos(spire.angle) + dirZ * Math.sin(spire.angle);
      if (alignment <= 0) continue;
      field = Math.max(field, alignment ** 3 * spire.weight);
    }
    return field;
  }

  private profileRadius(v: number): number {
    const exponent = lerp(1.7, 4.6, this.params.cliffSteepness);
    const taper = Math.pow(Math.max(1 - Math.pow(v, exponent), 0.006), 1.35);
    const belly = 1 + 0.09 * Math.sin(Math.PI * Math.min(v * 2.4, 1));
    const slim = 1 - 0.24 * smoothstep(0.12, 0.7, v);
    return taper * belly * slim;
  }

  private computeWarp(dirX: number, v: number, dirZ: number): void {
    this.warpX = this.noise.fbm(dirX * 1.4 + 7.3, v * 1.1, dirZ * 1.4 - 2.6, 2);
    this.warpZ = this.noise.fbm(dirX * 1.4 - 9.8, v * 1.1 + 4.4, dirZ * 1.4 + 8.2, 2);
  }

  private striation(dirX: number, v: number, dirZ: number): number {
    return this.noise.fbm(
      (dirX + 0.6 * this.warpX) * 2.2 + 3.3,
      v * 0.85,
      (dirZ + 0.6 * this.warpZ) * 2.2 - 8.1,
      4,
    );
  }

  private crackLine(dirX: number, v: number, dirZ: number): number {
    const sample = this.noise.noise(
      (dirX + 0.5 * this.warpX) * 3.4,
      v * 2.6 + 13.7,
      (dirZ + 0.5 * this.warpZ) * 3.4,
    );
    return Math.pow(1 - Math.abs(sample), 7);
  }

  private buildRockBody(): Mesh {
    const { detail, erosion, cracks, height } = this.params;
    const radialSegments = Math.round(lerp(56, 176, detail));
    const ringSegments = Math.round(lerp(28, 80, detail));

    const geometry = new CylinderGeometry(1, 1, 1, radialSegments, ringSegments, true);
    const positions = geometry.getAttribute('position');

    for (let i = 0; i < positions.count; i++) {
      const dirX = positions.getX(i);
      const dirZ = positions.getZ(i);
      const v = clamp(0.5 - positions.getY(i), 0, 1);

      this.computeWarp(dirX, v, dirZ);
      const striation = this.striation(dirX, v, dirZ);
      const fineDetail = this.noise.fbm(dirX * 5.2 - 4.7, v * 5.5, dirZ * 5.2 + 2.9, 3);
      const crack = this.crackLine(dirX, v, dirZ);
      const erosionMask = smoothstep(0.02, 0.16, v);

      const lobes = this.buttressLobes(dirX, dirZ);
      const spire = this.spireField(dirX, dirZ);

      let radius = this.halfWidth * this.profileRadius(v) * this.surface.silhouette(dirX, dirZ);
      radius *= 1 + erosion * erosionMask * (0.32 * striation + 0.1 * fineDetail);
      radius *= 1 + (spire * 0.5 - 0.3 + lobes * 0.15) * Math.pow(v, 1.6);
      radius *= 1 - this.ledge(v, dirX, dirZ) * 0.16;
      radius -= cracks * erosionMask * crack * this.halfWidth * CRACK_DEPTH;

      const settle = this.noise.fbm(dirX * 1.7 + 20.4, v * 2.1, dirZ * 1.7 + 14.2, 2);
      const depthStretch = 1 + ((spire - 0.45) * 0.75 + lobes * 0.1) * smoothstep(0.4, 1, v);
      const y =
        -Math.pow(v, 1.05) * height * depthStretch - this.capEmbed + settle * height * 0.02 * v;

      const sway = v * v;
      positions.setXYZ(
        i,
        dirX * radius + this.tipOffsetX * sway,
        y,
        dirZ * radius + this.tipOffsetZ * sway,
      );
    }

    const welded = weldAndShade(geometry);
    this.colorRock(welded);

    const mesh = new Mesh(welded, getRockMaterial());
    mesh.name = 'rock-body';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  private colorRock(geometry: BufferGeometry): void {
    const positions = geometry.getAttribute('position');
    const normals = geometry.getAttribute('normal');
    const count = positions.count;
    const colors = new Float32Array(count * 3);
    const { rock, rockDark, strataAccent, soil, moss } = this.palette;
    const { height, cracks } = this.params;

    for (let i = 0; i < count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const z = positions.getZ(i);
      const upness = normals.getY(i);

      const rawV = clamp(-(y + this.capEmbed) / height, 0, 1.3);
      const offsetX = x - this.tipOffsetX * rawV * rawV;
      const offsetZ = z - this.tipOffsetZ * rawV * rawV;
      const horizontal = Math.hypot(offsetX, offsetZ);
      const dirX = horizontal > 1e-6 ? offsetX / horizontal : 0;
      const dirZ = horizontal > 1e-6 ? offsetZ / horizontal : 0;

      const lobes = this.buttressLobes(dirX, dirZ);
      const spire = this.spireField(dirX, dirZ);
      const depthStretch =
        1 + ((spire - 0.45) * 0.75 + lobes * 0.1) * smoothstep(0.4, 1, Math.min(rawV, 1));
      const v = clamp(rawV / depthStretch, 0, 1);

      this.computeWarp(dirX, v, dirZ);
      const striation = this.striation(dirX, v, dirZ);
      const crack = this.crackLine(dirX, v, dirZ);

      const expected =
        this.halfWidth *
        this.profileRadius(v) *
        this.surface.silhouette(dirX, dirZ) *
        (1 + (spire * 0.5 - 0.3 + lobes * 0.15) * Math.pow(v, 1.6));
      const recess =
        expected > 0.5 ? clamp((expected - horizontal) / expected, 0, 1) * (1 - v) : 0;

      const coord = this.strataCoord(v, dirX, dirZ);
      const strataMix = 0.5 + 0.5 * Math.sin(coord * TAU);
      const accentMix = Math.pow(0.5 + 0.5 * Math.sin((coord * TAU) / 3 + 1.7), 3) * 0.35;
      const ledgeShade = this.ledge(v, dirX, dirZ);

      scratchColor.copy(rock).lerp(rockDark, 0.12 + strataMix * 0.45);
      scratchColor.lerp(strataAccent, accentMix * (1 - v));
      scratchColor.lerp(soil, smoothstep(0.09, 0.02, v) * 0.85);
      scratchColor.lerp(moss, smoothstep(0.2, 0.05, v) * this.params.moss * 0.9);

      const mossNoise = this.noise.fbm(x * 0.5 + 6.1, y * 0.5, z * 0.5 - 3.8, 2);
      const mossAmount =
        this.params.moss *
        smoothstep(0.35, 0.75, upness) *
        (1 - smoothstep(0.28, 0.55, v)) *
        (0.35 + 0.65 * clamp(0.5 + mossNoise, 0, 1));
      scratchColor.lerp(moss, clamp(mossAmount, 0, 1) * 0.6);

      const crackShade = 1 - crack * cracks * 0.6;
      const cavityShade = (1 - recess * 0.4) * (1 - ledgeShade * 0.3);
      const striationShade = clamp(0.94 + striation * 0.18, 0.84, 1.05);
      const depthFade = lerp(1, 0.75, Math.pow(v, 1.5));
      scratchColor.multiplyScalar(crackShade * cavityShade * striationShade * depthFade);

      colors[i * 3] = scratchColor.r;
      colors[i * 3 + 1] = scratchColor.g;
      colors[i * 3 + 2] = scratchColor.b;
    }

    geometry.setAttribute('color', new BufferAttribute(colors, 3));
  }

  private buildGrassCap(): Mesh {
    const { detail, grassThickness } = this.params;
    const widthSegments = Math.round(lerp(48, 156, detail));
    const heightSegments = Math.round(lerp(24, 72, detail));

    const geometry = new SphereGeometry(1, widthSegments, heightSegments);
    const positions = geometry.getAttribute('position');

    const bottomHeight = grassThickness * 0.7;

    for (let i = 0; i < positions.count; i++) {
      const nx = positions.getX(i);
      const ny = positions.getY(i);
      const nz = positions.getZ(i);

      const horizontal = Math.hypot(nx, nz);
      const dirX = horizontal > 1e-6 ? nx / horizontal : 0;
      const dirZ = horizontal > 1e-6 ? nz / horizontal : 0;

      const radius = this.surface.capRadiusAt(dirX, dirZ);
      const x = nx * radius;
      const z = nz * radius;

      const y =
        ny > 0
          ? this.surface.getHeightAt(x, z)
          : ny * bottomHeight - smoothstep(0.85, 1, horizontal) * grassThickness * 0.1;

      positions.setXYZ(i, x, y, z);
    }

    const welded = weldAndShade(geometry);
    this.colorGrass(welded);

    const mesh = new Mesh(welded, getGrassMaterial());
    mesh.name = 'grass-cap';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  private colorGrass(geometry: BufferGeometry): void {
    const positions = geometry.getAttribute('position');
    const normals = geometry.getAttribute('normal');
    const count = positions.count;
    const colors = new Float32Array(count * 3);
    const { grass, grassBright, strataAccent, soil, rock } = this.palette;

    for (let i = 0; i < count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const z = positions.getZ(i);
      const upness = normals.getY(i);
      const sideness = Math.hypot(normals.getX(i), normals.getZ(i));

      const patch = this.surface.patchAt(x, z);
      const micro = this.noise.fbm(x * 0.9 - 3.1, 4.1, z * 0.9 + 6.6, 2);

      scratchColor.copy(grass).lerp(grassBright, clamp(0.5 + patch * 0.8, 0, 1) * 0.35);

      // large-scale warm/cool meadow variation — meadows are never one green
      const macro = this.noise.fbm(x * 0.045 + 51.2, 3.7, z * 0.045 - 33.8, 2);
      scratchColor.lerp(this.palette.moss, clamp(0.5 - macro, 0, 1) * 0.16);

      const rim = smoothstep(0.5, 0.92, sideness) * smoothstep(-0.2, 0.4, y);
      scratchColor.lerp(grassBright, rim * 0.4);
      scratchColor.lerp(strataAccent, rim * 0.18);

      const knoll = smoothstep(0.6, 1, upness) * smoothstep(0.2, 1.4, y);
      scratchColor.lerp(grassBright, knoll * 0.2);

      // worn, darkened earth where roots grip the knoll and along the river
      const rootShade = this.surface.moundMaskAt(x, z);
      scratchColor.lerp(soil, rootShade * 0.3);

      const riverWidth = this.params.river?.width ?? 0;
      if (riverWidth > 0) {
        const bank =
          1 - smoothstep(riverWidth * 0.9, riverWidth * 2.1, this.surface.riverDistanceAt(x, z));
        scratchColor.lerp(soil, bank * 0.42);
      }

      const soilBlend = smoothstep(0.1, -0.5, y / this.params.grassThickness);
      scratchTarget.copy(soil).lerp(rock, smoothstep(-0.35, -0.6, y / this.params.grassThickness));
      scratchColor.lerp(scratchTarget, soilBlend * clamp(1 - upness, 0, 1));

      scratchColor.multiplyScalar(clamp(0.94 + micro * 0.12, 0.85, 1));

      colors[i * 3] = scratchColor.r;
      colors[i * 3 + 1] = scratchColor.g;
      colors[i * 3 + 2] = scratchColor.b;
    }

    geometry.setAttribute('color', new BufferAttribute(colors, 3));
  }
}
