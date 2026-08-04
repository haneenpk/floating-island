import { Group, Sprite, SpriteMaterial, Vector3 } from 'three';
import type { Time } from '../../core/Time';
import type { Updatable } from '../Updatable';
import { getPuffTexture } from './softTextures';

const PUFF_COUNT = 7;
const CYCLE_SECONDS = 7;
const RISE = 3.4;

interface Puff {
  sprite: Sprite;
  offset: number;
  sway: number;
}

/** A lazy ribbon of chimney smoke — sprites rising, swelling, dissolving. */
export class CottageSmoke extends Group implements Updatable {
  private readonly puffs: Puff[] = [];

  constructor(anchor: Vector3) {
    super();
    this.name = 'cottage-smoke';
    this.position.copy(anchor);

    for (let i = 0; i < PUFF_COUNT; i++) {
      const material = new SpriteMaterial({
        map: getPuffTexture(),
        color: 0xe9e4dc,
        transparent: true,
        depthWrite: false,
        opacity: 0,
      });
      const sprite = new Sprite(material);
      this.add(sprite);
      this.puffs.push({
        sprite,
        offset: i / PUFF_COUNT,
        sway: 0.55 + (i % 3) * 0.3,
      });
    }
  }

  update(time: Time): void {
    for (const puff of this.puffs) {
      const t = (time.elapsed / CYCLE_SECONDS + puff.offset) % 1;

      puff.sprite.position.set(
        Math.sin(time.elapsed * 0.35 + puff.offset * 9) * 0.22 * t * puff.sway,
        t * RISE,
        Math.cos(time.elapsed * 0.28 + puff.offset * 7) * 0.18 * t,
      );
      const scale = 0.5 + t * 1.7;
      puff.sprite.scale.set(scale, scale, 1);
      puff.sprite.material.opacity = (1 - t) * Math.min(t / 0.12, 1) * 0.42;
    }
  }
}
