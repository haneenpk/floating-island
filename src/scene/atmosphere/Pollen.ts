import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Points,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
} from 'three';
import { windTimeUniform } from '../../materials/windMaterial';
import { SeededRandom } from '../../procgen/SeededRandom';
import { getPuffTexture } from './softTextures';

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uDrift;

  attribute vec3 aSeed;
  attribute float aSize;

  varying float vFade;
  #include <fog_pars_vertex>

  void main() {
    vec3 displaced = position;
    displaced.x += sin(uTime * (0.12 + aSeed.x * 0.1) + aSeed.y * 6.28) * 1.4 * uDrift;
    displaced.z += cos(uTime * (0.1 + aSeed.y * 0.09) + aSeed.z * 6.28) * 1.4 * uDrift;
    displaced.y += sin(uTime * (0.16 + aSeed.z * 0.12) + aSeed.x * 6.28) * 0.9 * uDrift;

    vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = aSize * (140.0 / -mvPosition.z);

    // twinkle gently so motes catch and lose the light
    vFade = 0.55 + 0.45 * sin(uTime * (0.5 + aSeed.x) + aSeed.y * 12.0);
    #include <fog_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uColor;

  varying float vFade;
  #include <fog_pars_fragment>

  void main() {
    float mask = texture2D(uMap, gl_PointCoord).a;
    gl_FragColor = vec4(uColor, mask * 0.32 * vFade);
    #include <fog_fragment>
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export interface PollenOptions {
  radius?: number;
  yMin?: number;
  yMax?: number;
}

/**
 * Drifting pollen / dust motes. Motion lives entirely in the vertex shader
 * driven by the shared wind clock — zero per-frame CPU work. Also serves as
 * interior dust with a small volume.
 */
export function createPollen(count: number, seed = 51, options: PollenOptions = {}): Points {
  const random = new SeededRandom(seed);
  const spread = options.radius ?? 13;
  const yMin = options.yMin ?? 2;
  const yMax = options.yMax ?? 9;

  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count * 3);
  const sizes = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const angle = random.next() * Math.PI * 2;
    const radius = Math.sqrt(random.next()) * spread;
    positions[i * 3] = Math.cos(angle) * radius;
    positions[i * 3 + 1] = random.range(yMin, yMax);
    positions[i * 3 + 2] = Math.sin(angle) * radius;

    seeds[i * 3] = random.next();
    seeds[i * 3 + 1] = random.next();
    seeds[i * 3 + 2] = random.next();
    sizes[i] = random.range(0.5, 1.4);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('aSeed', new BufferAttribute(seeds, 3));
  geometry.setAttribute('aSize', new BufferAttribute(sizes, 1));

  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: UniformsUtils.merge([
      UniformsLib.fog,
      {
        uMap: { value: null },
        uColor: { value: new Color(0xfff6e0) },
        uDrift: { value: spread / 13 },
      },
    ]),
    transparent: true,
    depthWrite: false,
    fog: true,
  });
  material.uniforms.uMap!.value = getPuffTexture();
  material.uniforms.uTime = windTimeUniform;
  material.name = 'pollen';

  const points = new Points(geometry, material);
  points.name = 'pollen';
  points.frustumCulled = false;
  points.renderOrder = 2;
  return points;
}
