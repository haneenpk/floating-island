import { Group, Vector3 } from 'three';
import { getQuality } from '../../core/Quality';
import type { Time } from '../../core/Time';
import { TAU } from '../../utils/math';
import type { Updatable } from '../Updatable';
import { generateIsland } from './IslandGenerator';
import { createIslandParams, type IslandParamOverrides, type IslandParams } from './IslandParams';
import type { IslandSurface } from './IslandSurface';

export class FloatingIsland extends Group implements Updatable {
  readonly params: IslandParams;
  readonly surface: IslandSurface;

  private readonly basePosition = new Vector3();
  private readonly phase: number;
  private readonly bobAmplitude: number;
  private readonly swayAmplitude: number;

  constructor(overrides: IslandParamOverrides = {}) {
    super();
    this.params = createIslandParams(overrides);
    this.name = `floating-island-${this.params.seed}`;

    const generated = generateIsland(this.params);
    this.add(generated.group);
    this.surface = generated.surface;

    this.phase = (this.params.seed % 977) * 0.618 * TAU;
    this.bobAmplitude = this.params.width * 0.018;
    this.swayAmplitude = this.params.width * 0.01;
  }

  moveTo(x: number, y: number, z: number): void {
    this.basePosition.set(x, y, z);
    this.position.copy(this.basePosition);
  }

  /** Freeze the drift (e.g. while the user stands inside the cottage). */
  driftPaused = false;

  update(time: Time): void {
    if (!getQuality().animateIsland || this.driftPaused) return;

    const t = time.elapsed;

    this.position.y =
      this.basePosition.y +
      Math.sin(t * 0.3 + this.phase) * this.bobAmplitude +
      Math.sin(t * 0.11 + this.phase * 2.3) * this.bobAmplitude * 0.4;
    this.position.x = this.basePosition.x + Math.sin(t * 0.07 + this.phase * 1.7) * this.swayAmplitude;
    this.position.z = this.basePosition.z + Math.cos(t * 0.09 + this.phase * 0.6) * this.swayAmplitude;

    this.rotation.z = Math.sin(t * 0.08 + this.phase) * 0.006;
    this.rotation.x = Math.cos(t * 0.06 + this.phase * 1.3) * 0.006;
  }
}
