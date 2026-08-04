import {
  BackSide,
  Color,
  Mesh,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import { settings } from '../../config/settings';

const vertexShader = /* glsl */ `
  varying vec3 vDirection;

  void main() {
    vDirection = position;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uZenithColor;
  uniform vec3 uHorizonColor;
  uniform vec3 uGroundColor;
  uniform vec3 uSunDirection;
  uniform vec3 uSunColor;

  varying vec3 vDirection;

  void main() {
    vec3 direction = normalize(vDirection);
    float height = direction.y;

    vec3 color = mix(uHorizonColor, uZenithColor, pow(clamp(height, 0.0, 1.0), 0.55));
    color = mix(color, uGroundColor, smoothstep(0.02, -0.4, height));

    float sunAmount = pow(max(dot(direction, uSunDirection), 0.0), 24.0);
    float halo = pow(max(dot(direction, uSunDirection), 0.0), 4.0);
    color += uSunColor * (sunAmount * 0.5 + halo * 0.12);

    gl_FragColor = vec4(color, 1.0);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class SkyDome extends Mesh {
  constructor() {
    const { atmosphere, lighting } = settings;
    const sunDirection = new Vector3(
      lighting.sun.position.x,
      lighting.sun.position.y,
      lighting.sun.position.z,
    ).normalize();

    const material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uZenithColor: { value: new Color(atmosphere.zenithColor) },
        uHorizonColor: { value: new Color(atmosphere.horizonColor) },
        uGroundColor: { value: new Color(atmosphere.groundColor) },
        uSunDirection: { value: sunDirection },
        uSunColor: { value: new Color(lighting.sun.color) },
      },
      side: BackSide,
      depthWrite: false,
      fog: false,
    });

    super(new SphereGeometry(340, 48, 32), material);
    this.name = 'sky-dome';
    this.frustumCulled = false;
    this.renderOrder = -1;
  }
}
