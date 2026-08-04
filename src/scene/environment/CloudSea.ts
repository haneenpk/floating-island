import { Color, Mesh, PlaneGeometry, ShaderMaterial, type IUniform } from 'three';
import { settings } from '../../config/settings';
import type { Time } from '../../core/Time';
import { createLoopingVideoTexture } from '../../utils/video';
import type { Updatable } from '../Updatable';

const VIDEO_URL = '/assets/videos/cloud_sea.mp4';

const vertexShader = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uVideo;
  uniform float uTime;
  uniform vec3 uHazeColor;

  varying vec2 vUv;

  void main() {
    vec2 uv = vUv + vec2(uTime * 0.0012, uTime * 0.0007);
    vec3 color = texture2D(uVideo, fract(uv)).rgb;

    // unify the footage's sunset palette with the scene's atmosphere
    color = mix(color, uHazeColor, 0.34);

    float distanceFromCenter = length(vUv - 0.5);
    float alpha = (1.0 - smoothstep(0.22, 0.5, distanceFromCenter)) * 0.88;

    gl_FragColor = vec4(color, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class CloudSea extends Mesh implements Updatable {
  private readonly timeUniform: IUniform<number> = { value: 0 };

  constructor() {
    const texture = createLoopingVideoTexture(VIDEO_URL);

    const material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uVideo: { value: texture },
        uTime: { value: 0 },
        uHazeColor: { value: new Color(settings.atmosphere.fogColor) },
      },
      transparent: true,
      depthWrite: false,
      fog: false,
    });

    super(new PlaneGeometry(700, 700), material);
    this.name = 'cloud-sea';
    this.rotation.x = -Math.PI / 2;
    this.position.y = -58;
    this.renderOrder = -1;
    this.visible = false;

    material.uniforms.uTime = this.timeUniform;

    (texture.image as HTMLVideoElement).addEventListener('playing', () => {
      this.visible = true;
    });
  }

  update(time: Time): void {
    this.timeUniform.value = time.elapsed;
  }
}
