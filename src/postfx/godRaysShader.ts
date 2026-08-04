import { Color, Vector2 } from 'three';
import { settings } from '../config/settings';

export const godRaysShader = {
  name: 'GodRaysShader',
  uniforms: {
    tDiffuse: { value: null },
    uSunScreen: { value: new Vector2(0.5, 0.5) },
    uIntensity: { value: settings.postfx.godRays.intensity },
    uDensity: { value: settings.postfx.godRays.density },
    uDecay: { value: settings.postfx.godRays.decay },
    uWeight: { value: settings.postfx.godRays.weight },
    uThreshold: { value: settings.postfx.godRays.threshold },
    uRayColor: { value: new Color(settings.postfx.godRays.color) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    #define RAY_SAMPLES 44

    uniform sampler2D tDiffuse;
    uniform vec2 uSunScreen;
    uniform float uIntensity;
    uniform float uDensity;
    uniform float uDecay;
    uniform float uWeight;
    uniform float uThreshold;
    uniform vec3 uRayColor;

    varying vec2 vUv;

    void main() {
      vec4 base = texture2D(tDiffuse, vUv);

      vec2 delta = (vUv - uSunScreen) * (uDensity / float(RAY_SAMPLES));
      vec2 coord = vUv;
      float illumination = 1.0;
      float shafts = 0.0;

      for (int i = 0; i < RAY_SAMPLES; i++) {
        coord -= delta;
        vec3 sampleColor = texture2D(tDiffuse, clamp(coord, 0.0, 1.0)).rgb;
        float luminance = dot(sampleColor, vec3(0.2126, 0.7152, 0.0722));
        float bright = smoothstep(uThreshold, uThreshold + 0.4, luminance);
        shafts += bright * illumination * uWeight;
        illumination *= uDecay;
      }

      gl_FragColor = vec4(base.rgb + uRayColor * shafts * uIntensity, base.a);
    }
  `,
};
