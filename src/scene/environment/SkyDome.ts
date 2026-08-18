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
// The sun's angular size, as cosines: it fades in from about 3.4 degrees off
// centre and is solid within 2.2. Cosine rather than degrees because the
// shader already has the dot product in hand.
const SUN_EDGE = 0.99825;
const SUN_CORE = 0.99926;

const fragmentShader = /* glsl */ `
  #define SUN_EDGE ${SUN_EDGE}
  #define SUN_CORE ${SUN_CORE}

  uniform vec3 uZenithColor;
  uniform vec3 uHorizonWarm;
  uniform vec3 uHorizonCool;
  uniform vec3 uGroundColor;
  uniform vec3 uSunDirection;
  uniform vec3 uSunColor;

  varying vec3 vDirection;

  float hash31(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
  }

  // Stars, hashed straight out of the view direction: the sky is quantised
  // into cells, a few of them are given a star, and each star is placed
  // somewhere random inside its own cell so the field never reads as a grid.
  // No geometry, no texture, no draw call — the dome was already being shaded.
  float starField(vec3 direction, float scale, float rarity, float size) {
    vec3 p = direction * scale;
    vec3 cell = floor(p);
    float pick = hash31(cell);
    if (pick < rarity) return 0.0;

    vec3 jitter = vec3(hash31(cell + 11.0), hash31(cell + 23.0), hash31(cell + 37.0));
    float distance = length(fract(p) - 0.5 - (jitter - 0.5) * 0.55);
    // brighter stars are rarer: reuse the pick as the magnitude
    float magnitude = smoothstep(rarity, 1.0, pick);
    return smoothstep(size, 0.0, distance) * (0.35 + 0.65 * magnitude);
  }

  void main() {
    vec3 direction = normalize(vDirection);
    float height = direction.y;

    // Golden hour is one-sided: the horizon burns warm where the sun sits
    // and stays cool dusk-blue behind you. Compare azimuths (ignore height)
    // so the gradient wraps the sky rather than tinting it evenly.
    vec2 viewAzimuth = normalize(vec2(direction.x, direction.z) + vec2(1e-5));
    vec2 sunAzimuth = normalize(vec2(uSunDirection.x, uSunDirection.z) + vec2(1e-5));
    float toward = dot(viewAzimuth, sunAzimuth);
    float warmth = smoothstep(-0.25, 0.95, toward);
    // the warmth hugs the horizon; overhead stays cool in every direction
    warmth *= 1.0 - smoothstep(0.05, 0.5, height);

    vec3 horizon = mix(uHorizonCool, uHorizonWarm, warmth);
    vec3 color = mix(horizon, uZenithColor, pow(clamp(height, 0.0, 1.0), 0.55));
    color = mix(color, uGroundColor, smoothstep(0.02, -0.4, height));

    // Only where the warmth has run out. Golden hour is one-sided, so the
    // side of the sky the sun has left goes dusk-blue — and that is the side
    // the first stars come out on, high up, never down in the honey.
    float duskward = smoothstep(0.45, -0.55, toward);
    float aloft = smoothstep(0.0, 0.5, height);
    float night = duskward * aloft;
    if (night > 0.001) {
      // two layers: a scatter of faint ones, and a few brighter that carry
      // the eye. The dusk sky is still bright, so they have to be brighter
      // than a real first magnitude would be to read against it at all.
      float field = starField(direction, 165.0, 0.972, 0.135)
                  + starField(direction, 78.0, 0.986, 0.185) * 1.6;
      color += vec3(0.86, 0.90, 1.0) * field * night * 1.9;
    }

    float cosAngle = max(dot(direction, uSunDirection), 0.0);
    float sunAmount = pow(cosAngle, 24.0);
    float halo = pow(cosAngle, 4.0);
    color += uSunColor * (sunAmount * 0.5 + halo * 0.12);

    // The sun itself. Wider than the real one by some margin — an
    // astronomically correct half-degree disc is a speck at this field of
    // view — and with a soft rim, so it sits in the haze rather than being
    // stamped on it. Bright enough that the bloom finds it on the tier that
    // has bloom.
    float disc = smoothstep(SUN_EDGE, SUN_CORE, cosAngle);
    // a low sun is swallowed by its own horizon: fade the disc as it sets so
    // it never floats over the cloud sea like a lamp
    float risen = smoothstep(-0.02, 0.16, uSunDirection.y);
    color = mix(color, uSunColor * 1.9, disc * risen);

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
        uHorizonWarm: { value: new Color(atmosphere.horizonWarmColor) },
        uHorizonCool: { value: new Color(atmosphere.horizonCoolColor) },
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
