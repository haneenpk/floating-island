import {
  Color,
  DoubleSide,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  Vector3,
  type IUniform,
  type Texture,
} from 'three';
import { settings } from '../../config/settings';

const noiseGlsl = /* glsl */ `
  float hash21(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 s = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, s.x), mix(c, d, s.x), s.y);
  }
`;

const waterVertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldPosition;
  #include <fog_pars_vertex>

  void main() {
    vUv = uv;
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    vec4 mvPosition = viewMatrix * worldPosition;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const riverFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uDeepColor;
  uniform vec3 uShallowColor;
  uniform vec3 uSunDirection;

  varying vec2 vUv;
  varying vec3 vWorldPosition;
  #include <fog_pars_fragment>

  ${noiseGlsl}

  void main() {
    vec2 flow = vec2(vUv.x * 2.6, vUv.y * 7.0 - uTime * 0.75);
    float ripple = vnoise(flow) * 0.65 + vnoise(flow * 2.7 + vec2(4.2, uTime * -0.5)) * 0.35;

    float eps = 0.09;
    float rx = vnoise(flow + vec2(eps, 0.0)) - ripple;
    float ry = vnoise(flow + vec2(0.0, eps)) - ripple;
    vec3 normal = normalize(vec3(-rx * 2.6, 1.0, -ry * 2.6));

    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), 3.0);

    vec3 color = mix(uDeepColor, uShallowColor, ripple * 0.4 + fresnel * 0.35);

    // thin foam line where the water meets its banks
    float bankDistance = min(vUv.x, 1.0 - vUv.x);
    float foam = smoothstep(0.16, 0.05, bankDistance) * (0.35 + ripple * 0.3);
    color = mix(color, vec3(0.9, 0.95, 0.94), foam * 0.5);

    vec3 halfDir = normalize(uSunDirection + viewDir);
    float spec = pow(max(dot(normal, halfDir), 0.0), 140.0);
    color += vec3(1.0, 0.97, 0.9) * spec * 0.9;

    float edgeFade = smoothstep(0.0, 0.3, vUv.x) * smoothstep(1.0, 0.7, vUv.x);
    float alpha = (0.72 + fresnel * 0.22) * edgeFade;

    gl_FragColor = vec4(color, alpha);
    #include <fog_fragment>
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// The falling sheet ripples along its normal — calm at the crest, waving as
// it drops — so the video-textured ribbon reads as a 3D volume of water.
const waterfallVertexShader = /* glsl */ `
  uniform float uTime;

  varying vec2 vUv;
  varying vec3 vWorldPosition;
  #include <fog_pars_vertex>

  void main() {
    vUv = uv;
    float ripple = sin(uv.y * 18.0 - uTime * 2.4) * 0.14 * smoothstep(0.05, 0.4, uv.y);
    vec3 displaced = position + normal * ripple;
    vec4 worldPosition = modelMatrix * vec4(displaced, 1.0);
    vWorldPosition = worldPosition.xyz;
    vec4 mvPosition = viewMatrix * worldPosition;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const waterfallFragmentShader = /* glsl */ `
  uniform sampler2D uVideo;
  uniform float uTime;
  uniform vec3 uFoamColor;

  varying vec2 vUv;
  varying vec3 vWorldPosition;
  #include <fog_pars_fragment>

  ${noiseGlsl}

  void main() {
    // animated UV turbulence, growing as the water falls
    float wobble =
      (vnoise(vec2(vUv.y * 6.0 - uTime * 1.2, vUv.x * 3.0 + 2.7)) - 0.5) * 0.11 * vUv.y +
      (vnoise(vec2(vUv.y * 14.0 - uTime * 2.6, vUv.x * 7.0 - 4.4)) - 0.5) * 0.04 * vUv.y;

    // sample only the footage's main strand so the ribbon is continuous
    // water — the dark rock gap between the two filmed strands would
    // otherwise key out as a hole in the middle of our fall.
    //
    // V runs backwards: the footage falls down its own frame, but three.js
    // flips V when it uploads a texture, so reading it straight would put the
    // filmed crest at our foot and send the water up. Both ends are inset —
    // the rock lip at the very top of the frame is dark enough to key out,
    // and would tear a gap where our river breaks over the edge.
    vec2 videoUv = vec2(mix(0.06, 0.52, vUv.x + wobble), mix(0.94, 0.03, vUv.y));
    vec3 water = texture2D(uVideo, videoUv).rgb;
    float luma = dot(water, vec3(0.2126, 0.7152, 0.0722));

    float fine = vnoise(vec2(vUv.x * 20.0 + 5.3, vUv.y * 8.0 - uTime * 1.6));

    // luminance key: white water stays, the footage's dark rock drops out
    float body = smoothstep(0.14, 0.42, luma) * (0.85 + fine * 0.22);

    // edges thin into translucent spray rather than cutting off
    float centered = abs(vUv.x - 0.5) * 2.0;
    float edgeThin = 1.0 - pow(centered, 3.0) * 0.55;
    float sideFade = smoothstep(0.0, 0.14, vUv.x) * smoothstep(1.0, 0.86, vUv.x);
    float headFade = smoothstep(0.0, 0.07, vUv.y);
    float tailFade = 1.0 - smoothstep(0.55, 0.92, vUv.y);

    // churned whitewater where the river breaks over the crest
    float crestFoam = (1.0 - smoothstep(0.04, 0.22, vUv.y)) * headFade;
    vec3 color = mix(water, uFoamColor, 0.25 + crestFoam * 0.5) + uFoamColor * fine * 0.12;
    float alpha =
      clamp(body + crestFoam * 0.35, 0.0, 1.0) * sideFade * headFade * tailFade * edgeThin;

    gl_FragColor = vec4(color, alpha);
    #include <fog_fragment>
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function sunDirection(): Vector3 {
  const { x, y, z } = settings.lighting.sun.position;
  return new Vector3(x, y, z).normalize();
}

export function createRiverMaterial(timeUniform: IUniform<number>): ShaderMaterial {
  const material = new ShaderMaterial({
    vertexShader: waterVertexShader,
    fragmentShader: riverFragmentShader,
    uniforms: UniformsUtils.merge([
      UniformsLib.fog,
      {
        uDeepColor: { value: new Color(0x26454e) },
        uShallowColor: { value: new Color(0x86b3a4) },
        uSunDirection: { value: sunDirection() },
      },
    ]),
    transparent: true,
    depthWrite: false,
    fog: true,
  });
  material.uniforms.uTime = timeUniform;
  material.name = 'river-water';
  return material;
}

export function createWaterfallMaterial(
  timeUniform: IUniform<number>,
  video: Texture,
): ShaderMaterial {
  const material = new ShaderMaterial({
    vertexShader: waterfallVertexShader,
    fragmentShader: waterfallFragmentShader,
    uniforms: UniformsUtils.merge([
      UniformsLib.fog,
      {
        uVideo: { value: null },
        uFoamColor: { value: new Color(0xf4f9fc) },
      },
    ]),
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    fog: true,
  });
  material.uniforms.uTime = timeUniform;
  material.uniforms.uVideo!.value = video;
  material.name = 'waterfall';
  return material;
}
