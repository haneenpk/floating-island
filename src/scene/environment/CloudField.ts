import { Group, Sprite, SpriteMaterial, type PerspectiveCamera, type Texture } from 'three';
import { SeededRandom } from '../../procgen/SeededRandom';
import type { Time } from '../../core/Time';
import { TAU } from '../../utils/math';
import type { Updatable } from '../Updatable';

// Above the island's water/creature transparents when nearer than the
// island, below them when farther — decided per cloud, per frame.
const RENDER_ORDER_FRONT = 6;
const RENDER_ORDER_BEHIND = 1;

const TEXTURE_ASPECT = 1280 / 2048;

interface CloudDrift {
  sprite: Sprite;
  radius: number;
  baseAngle: number;
  angularSpeed: number;
  baseY: number;
  bobPhase: number;
}

export class CloudField extends Group implements Updatable {
  private readonly drifts: CloudDrift[] = [];

  constructor(
    texture: Texture,
    private readonly camera: PerspectiveCamera,
    count: number,
    seed = 815,
  ) {
    super();
    this.name = 'cloud-field';

    const random = new SeededRandom(seed);
    const opacities = [0.78, 0.86, 0.93, 1];

    for (let i = 0; i < count; i++) {
      const material = new SpriteMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        opacity: opacities[random.int(0, opacities.length - 1)]!,
        fog: true,
      });

      const sprite = new Sprite(material);
      const distance01 = random.next();
      const radius = 70 + distance01 * 110;
      const width = (26 + distance01 * 44) * random.range(0.8, 1.2);
      sprite.scale.set(width, width * TEXTURE_ASPECT, 1);

      this.drifts.push({
        sprite,
        radius,
        baseAngle: random.next() * TAU,
        angularSpeed: random.range(0.003, 0.009) * (random.next() < 0.5 ? -1 : 1),
        baseY: random.range(-22, 34),
        bobPhase: random.next() * TAU,
      });
      this.add(sprite);
    }
  }

  update(time: Time): void {
    const islandDistance = this.camera.position.length();

    for (const drift of this.drifts) {
      const angle = drift.baseAngle + time.elapsed * drift.angularSpeed;
      drift.sprite.position.set(
        Math.cos(angle) * drift.radius,
        drift.baseY + Math.sin(time.elapsed * 0.08 + drift.bobPhase) * 1.6,
        Math.sin(angle) * drift.radius,
      );

      const cloudDistance = this.camera.position.distanceTo(drift.sprite.position);
      drift.sprite.renderOrder =
        cloudDistance < islandDistance - 5 ? RENDER_ORDER_FRONT : RENDER_ORDER_BEHIND;
    }
  }
}
