import { CatmullRomCurve3, Vector3, type PerspectiveCamera } from 'three';
import type { Time } from '../core/Time';
import { applyCameraBreath } from './cameraBreath';
import { CAMERA_SHOTS } from './cameraShots';
import { ScrollController } from './ScrollController';

const DAMPING = 2.6;

const scratchPosition = new Vector3();
const scratchTarget = new Vector3();

export class CameraRig {
  private readonly scroll = new ScrollController();
  private readonly positionCurve: CatmullRomCurve3;
  private readonly targetCurve: CatmullRomCurve3;
  private progress = 0;

  constructor(private readonly camera: PerspectiveCamera) {
    this.positionCurve = new CatmullRomCurve3(
      CAMERA_SHOTS.map((shot) => new Vector3(...shot.position)),
      false,
      'centripetal',
    );
    this.targetCurve = new CatmullRomCurve3(
      CAMERA_SHOTS.map((shot) => new Vector3(...shot.target)),
      false,
      'centripetal',
    );
    this.apply(0);
  }

  update(time: Time): void {
    const scrollTarget = this.scroll.progress;
    this.progress += (scrollTarget - this.progress) * (1 - Math.exp(-time.delta * DAMPING));
    this.apply(this.progress);
    applyCameraBreath(this.camera, time.elapsed);
  }

  private apply(progress: number): void {
    this.positionCurve.getPoint(progress, scratchPosition);
    this.targetCurve.getPoint(progress, scratchTarget);
    this.camera.position.copy(scratchPosition);
    this.camera.lookAt(scratchTarget);
  }
}
