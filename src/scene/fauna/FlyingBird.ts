import { AnimationMixer, Box3, Group, Vector3 } from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { Time } from '../../core/Time';
import type { Updatable } from '../Updatable';

export interface FlyingBirdOptions {
  radius: number;
  height: number;
  /** radians per second around the island; negative flies the other way */
  angularSpeed: number;
  phase?: number;
  wingspan?: number;
  /** correction if the source model's forward axis isn't -Z */
  headingOffset?: number;
}

const scratchBox = new Box3();
const scratchAhead = new Vector3();

export class FlyingBird extends Group implements Updatable {
  private readonly mixer: AnimationMixer;
  private readonly radius: number;
  private readonly height: number;
  private readonly angularSpeed: number;
  private readonly phase: number;

  constructor(gltf: GLTF, options: FlyingBirdOptions) {
    super();
    this.name = 'flying-bird';

    const model = gltf.scene.clone(true);
    scratchBox.setFromObject(model);
    const size = scratchBox.getSize(new Vector3());
    const scale = (options.wingspan ?? 1.7) / Math.max(size.x, size.y, size.z);
    model.scale.setScalar(scale);
    model.rotation.y = options.headingOffset ?? 0;
    this.add(model);

    this.mixer = new AnimationMixer(model);
    const clip = gltf.animations[0];
    if (clip) {
      const action = this.mixer.clipAction(clip);
      action.startAt(-(options.phase ?? 0) * 0.37);
      action.play();
    }

    this.radius = options.radius;
    this.height = options.height;
    this.angularSpeed = options.angularSpeed;
    this.phase = options.phase ?? 0;
  }

  update(time: Time): void {
    const angle = this.phase + time.elapsed * this.angularSpeed;
    const bob = Math.sin(time.elapsed * 0.5 + this.phase * 2.1) * 1.1;

    this.position.set(
      Math.cos(angle) * this.radius,
      this.height + bob,
      Math.sin(angle) * this.radius,
    );

    const aheadAngle = angle + Math.sign(this.angularSpeed) * 0.08;
    scratchAhead.set(
      Math.cos(aheadAngle) * this.radius,
      this.height + bob,
      Math.sin(aheadAngle) * this.radius,
    );
    this.lookAt(scratchAhead);

    this.mixer.update(time.delta);
  }
}
