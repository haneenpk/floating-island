import { DirectionalLight, Group, HemisphereLight } from 'three';
import { settings } from '../../config/settings';
import { getQuality } from '../../core/Quality';

export class Lighting extends Group {
  readonly sun: DirectionalLight;
  readonly sky: HemisphereLight;

  constructor() {
    super();
    this.name = 'lighting';

    const { sun, sky } = settings.lighting;
    const quality = getQuality();

    this.sun = new DirectionalLight(sun.color, sun.intensity);
    this.sun.position.set(sun.position.x, sun.position.y, sun.position.z);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
    this.sun.shadow.camera.left = -sun.shadowFrustum;
    this.sun.shadow.camera.right = sun.shadowFrustum;
    this.sun.shadow.camera.top = sun.shadowFrustum;
    this.sun.shadow.camera.bottom = -sun.shadowFrustum;
    this.sun.shadow.camera.near = 25;
    this.sun.shadow.camera.far = 140;
    this.sun.shadow.radius = quality.shadowRadius;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;

    this.sky = new HemisphereLight(sky.skyColor, sky.groundColor, sky.intensity);

    this.add(this.sun, this.sun.target, this.sky);
  }
}
