import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  Points,
  ShaderMaterial,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Time } from '../../core/Time';
import { SeededRandom } from '../../procgen/SeededRandom';
import { getPuffTexture } from '../atmosphere/softTextures';
import { bake } from './roomParts';

const FLAME_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying float vFacing;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    // fade the sheet out as it turns edge-on to the camera, so crossing
    // planes never show as bright hairlines
    vec3 n = normalize((modelViewMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz);
    vFacing = abs(dot(normalize(-mv.xyz), n));
    gl_Position = projectionMatrix * mv;
  }
`;

// A living flame: upward-scrolling value noise bends a teardrop body, a
// second octave ripples the edges, and a slow flicker breathes the whole
// sheet. Several of these planes cross at angles to fake volume.
const FLAME_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uIntensity;
  varying vec2 vUv;
  varying float vFacing;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  void main() {
    vec2 uv = vUv;
    float t = uTime * 1.55 + uSeed * 17.0;

    float bend = noise(vec2(uv.x * 2.5 + uSeed, uv.y * 3.0 - t)) - 0.5;
    float rip = noise(vec2(uv.x * 6.0 - uSeed, uv.y * 8.0 - t * 1.9)) - 0.5;
    uv.x += bend * 0.34 * uv.y + rip * 0.10 * uv.y;

    float halfWidth = mix(0.40, 0.06, pow(uv.y, 0.8));
    float body = 1.0 - smoothstep(halfWidth * 0.35, halfWidth, abs(uv.x - 0.5));
    float base = smoothstep(0.0, 0.06, uv.y);
    float tip = 1.0 - smoothstep(0.70, 1.0, uv.y + rip * 0.35);
    float flame = body * base * tip;
    if (flame <= 0.004) discard;

    float flicker = 0.82 + 0.28 * noise(vec2(t * 0.85, uSeed * 3.1));
    vec3 core = vec3(1.0, 0.93, 0.60);
    vec3 mid = vec3(1.0, 0.55, 0.16);
    vec3 edge = vec3(0.66, 0.16, 0.03);
    vec3 color = mix(edge, mid, smoothstep(0.05, 0.5, flame));
    color = mix(color, core, smoothstep(0.35, 0.95, flame) * (1.0 - uv.y * 0.55));
    float facing = smoothstep(0.12, 0.45, vFacing);
    gl_FragColor = vec4(color * uIntensity * flicker, flame * 0.62 * facing);
  }
`;

const SPARK_VERTEX = /* glsl */ `
  attribute float aSeed;
  uniform float uTime;
  varying float vFade;
  void main() {
    float t = fract(uTime * 0.22 + aSeed);
    vec3 p = position;
    p.x += (aSeed - 0.5) * 0.24 + sin(t * 9.0 + aSeed * 47.0) * 0.05;
    p.y += t * 0.92;
    p.z += (fract(aSeed * 7.31) - 0.5) * 0.34 + cos(t * 7.0 + aSeed * 91.0) * 0.05;
    vFade = (1.0 - t) * smoothstep(0.0, 0.08, t);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = (2.6 - t * 1.8) * (140.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const SPARK_FRAGMENT = /* glsl */ `
  varying float vFade;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = 1.0 - smoothstep(0.1, 0.5, length(c));
    gl_FragColor = vec4(vec3(1.0, 0.62, 0.22) * 1.6, d * vFade * 0.85);
  }
`;

function makeBarkTexture(charred: boolean): CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const random = new SeededRandom(charred ? 0xc4a2 : 0xba21);

  ctx.fillStyle = '#48351f';
  ctx.fillRect(0, 0, size, size);
  // vertical bark streaks (u wraps around the log)
  for (let i = 0; i < 58; i++) {
    const x = random.range(0, size);
    ctx.strokeStyle = random.next() < 0.55 ? 'rgba(28,19,12,0.75)' : 'rgba(122,94,60,0.6)';
    ctx.lineWidth = random.range(1, 3.6);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.quadraticCurveTo(x + random.range(-6, 6), size / 2, x + random.range(-4, 4), size);
    ctx.stroke();
  }
  // knots
  for (let i = 0; i < 5; i++) {
    const kx = random.range(12, size - 12);
    const ky = random.range(20, size - 20);
    ctx.fillStyle = 'rgba(24,16,10,0.85)';
    ctx.beginPath();
    ctx.ellipse(kx, ky, random.range(2.5, 5), random.range(4, 8), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(130,100,64,0.5)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }
  // charred ends (v runs along the log's length)
  const charDepth = charred ? 52 : 22;
  for (const edge of [0, 1]) {
    const grad = ctx.createLinearGradient(0, edge === 0 ? 0 : size, 0, edge === 0 ? charDepth : size - charDepth);
    grad.addColorStop(0, 'rgba(16,12,10,0.96)');
    grad.addColorStop(1, 'rgba(16,12,10,0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, edge === 0 ? 0 : size - charDepth, size, charDepth);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** Orange ember cracks for the half-burned log's emissive map. */
function makeCrackTexture(): CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const random = new SeededRandom(0xe317);

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 15; i++) {
    const y = random.range(size * 0.2, size * 0.8);
    const x = random.range(0, size);
    ctx.strokeStyle = `rgba(255, ${Math.round(random.range(90, 150))}, 30, ${random.range(0.5, 0.95)})`;
    ctx.lineWidth = random.range(0.8, 2);
    ctx.beginPath();
    ctx.moveTo(x, y);
    let px = x;
    let py = y;
    for (let s = 0; s < 4; s++) {
      px += random.range(4, 16);
      py += random.range(-7, 7);
      ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** Glowing ember bed under the wood: bright pits in a dark ash field. */
function makeEmberBedTexture(): CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const random = new SeededRandom(0xeb5e);

  ctx.fillStyle = '#0a0705';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 42; i++) {
    const x = random.range(10, size - 10);
    const y = random.range(14, size - 14);
    const r = random.range(2.5, 9);
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    const heat = random.range(0.45, 1);
    grad.addColorStop(0, `rgba(255, ${Math.round(120 + heat * 90)}, 40, ${0.85 * heat})`);
    grad.addColorStop(0.55, `rgba(230, 80, 18, ${0.5 * heat})`);
    grad.addColorStop(1, 'rgba(20, 8, 4, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/**
 * The living heart of the cottage: stacked firewood over a glowing ember
 * bed, layered shader flames, drifting smoke, rising sparks, and a calm
 * flickering warm light. Everything is procedural and GPU-light.
 */
export class Hearth extends Group {
  readonly light: PointLight;

  private readonly emberGlow: PointLight;
  private readonly flameMaterials: ShaderMaterial[] = [];
  private readonly sparkMaterial: ShaderMaterial;
  private readonly smokes: { sprite: Sprite; phase: number; speed: number }[] = [];
  private readonly emberBed: MeshStandardMaterial;
  private readonly coals: MeshStandardMaterial;
  private readonly cracks: MeshStandardMaterial;
  private readonly random = new SeededRandom(0x4ea7);
  // out at the firebox mouth so the cavity lining isn't blasted at point-blank
  private readonly lightBase = { x: 1.15, y: 0.9, z: 0 };

  constructor() {
    super();
    this.name = 'hearth';

    // ---- ash + charcoal bed ----
    const ash = new Mesh(
      new CircleGeometry(0.3, 20),
      new MeshStandardMaterial({ color: 0x5e574e, roughness: 1 }),
    );
    ash.rotation.x = -Math.PI / 2;
    ash.scale.set(1.05, 1.75, 1);
    ash.position.y = 0.006;
    this.add(ash);
    const ashDark = new Mesh(
      new CircleGeometry(0.22, 16),
      new MeshStandardMaterial({ color: 0x37322c, roughness: 1 }),
    );
    ashDark.rotation.x = -Math.PI / 2;
    ashDark.scale.set(1, 1.7, 1);
    ashDark.position.y = 0.012;
    this.add(ashDark);

    const charcoalBits: BufferGeometry[] = [];
    for (let i = 0; i < 9; i++) {
      charcoalBits.push(
        bake(new IcosahedronGeometry(this.random.range(0.028, 0.05), 0), {
          position: [
            this.random.range(-0.2, 0.2),
            0.03,
            this.random.range(-0.42, 0.42),
          ],
          rotation: [this.random.range(0, 3), this.random.range(0, 3), 0],
        }),
      );
    }
    this.add(
      new Mesh(
        mergeGeometries(charcoalBits)!,
        new MeshStandardMaterial({ color: 0x17120e, roughness: 0.95 }),
      ),
    );

    // ---- glowing ember bed beneath the wood ----
    const emberTexture = makeEmberBedTexture();
    this.emberBed = new MeshStandardMaterial({
      color: 0x000000,
      emissive: 0xffffff,
      emissiveMap: emberTexture,
      emissiveIntensity: 1.5,
      roughness: 1,
    });
    const bed = new Mesh(new PlaneGeometry(0.46, 0.86), this.emberBed);
    bed.rotation.x = -Math.PI / 2;
    bed.position.y = 0.02;
    this.add(bed);

    // ---- stacked firewood ----
    const bark = new MeshStandardMaterial({
      map: makeBarkTexture(false),
      roughness: 0.9,
    });
    this.cracks = new MeshStandardMaterial({
      map: makeBarkTexture(true),
      emissive: 0xffffff,
      emissiveMap: makeCrackTexture(),
      emissiveIntensity: 1.1,
      roughness: 0.9,
    });

    const log = (
      material: MeshStandardMaterial,
      radius: number,
      length: number,
      x: number,
      y: number,
      z: number,
      tiltX: number,
      yawY: number,
    ): void => {
      const mesh = new Mesh(new CylinderGeometry(radius, radius * 0.92, length, 9), material);
      mesh.rotation.set(Math.PI / 2 + tiltX, yawY, 0);
      mesh.position.set(x, y, z);
      this.add(mesh);
    };

    // two base logs parallel to the wall, a burned one across them,
    // a fresh one crossing back, and one leaning against the stack
    log(bark, 0.07, 0.78, -0.11, 0.075, 0.02, 0, 0.06);
    log(bark, 0.075, 0.72, 0.12, 0.078, -0.05, 0, -0.05);
    log(this.cracks, 0.062, 0.66, 0.0, 0.2, -0.02, 0, 0.42);
    log(bark, 0.058, 0.62, 0.02, 0.205, 0.06, 0, -0.38);
    const lean = new Mesh(new CylinderGeometry(0.05, 0.046, 0.5, 8), bark);
    lean.rotation.set(Math.PI / 2 - 0.55, 0.25, 0);
    lean.position.set(-0.05, 0.17, 0.3);
    this.add(lean);

    // ---- small glowing coals tucked between the logs ----
    this.coals = new MeshStandardMaterial({
      color: 0x1a0d06,
      emissive: 0xff7a28,
      emissiveIntensity: 2.0,
      roughness: 0.8,
    });
    const coalChunks: BufferGeometry[] = [];
    for (let i = 0; i < 6; i++) {
      coalChunks.push(
        bake(new IcosahedronGeometry(this.random.range(0.018, 0.034), 0), {
          position: [
            this.random.range(-0.09, 0.09),
            this.random.range(0.09, 0.15),
            this.random.range(-0.2, 0.2),
          ],
          rotation: [this.random.range(0, 3), 0, this.random.range(0, 3)],
        }),
      );
    }
    this.add(new Mesh(mergeGeometries(coalChunks)!, this.coals));

    // ---- layered flames: crossing planes fake a volume ----
    // (post-processing is suspended while indoors, so no bloom compensation)
    const flamePlane = (
      width: number,
      height: number,
      x: number,
      y: number,
      z: number,
      yaw: number,
      intensity: number,
    ): void => {
      const material = new ShaderMaterial({
        vertexShader: FLAME_VERTEX,
        fragmentShader: FLAME_FRAGMENT,
        uniforms: {
          uTime: { value: 0 },
          uSeed: { value: this.random.range(0, 10) },
          uIntensity: { value: intensity },
        },
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
      });
      this.flameMaterials.push(material);
      const mesh = new Mesh(new PlaneGeometry(width, height), material);
      mesh.position.set(x, y + height / 2, z);
      mesh.rotation.y = yaw;
      this.add(mesh);
    };
    flamePlane(0.23, 0.5, 0, 0.17, -0.06, 0.0, 0.7);
    flamePlane(0.21, 0.44, 0.03, 0.175, 0.04, 1.05, 0.65);
    flamePlane(0.21, 0.46, -0.03, 0.17, 0.05, 2.1, 0.6);
    flamePlane(0.14, 0.26, 0.03, 0.17, -0.2, 0.5, 0.6);
    flamePlane(0.13, 0.22, -0.04, 0.18, 0.22, 1.6, 0.55);
    flamePlane(0.1, 0.17, 0.05, 0.15, 0.12, 2.6, 0.5);

    // ---- smoke: soft puffs rising into the flue ----
    for (let i = 0; i < 4; i++) {
      const sprite = new Sprite(
        new SpriteMaterial({
          map: getPuffTexture(),
          color: 0x77706a,
          transparent: true,
          depthWrite: false,
          opacity: 0,
        }),
      );
      this.add(sprite);
      this.smokes.push({
        sprite,
        phase: this.random.range(0, 1),
        speed: this.random.range(0.1, 0.16),
      });
    }

    // ---- sparks ----
    const sparkCount = 22;
    const positions = new Float32Array(sparkCount * 3);
    const seeds = new Float32Array(sparkCount);
    for (let i = 0; i < sparkCount; i++) {
      positions[i * 3] = 0;
      positions[i * 3 + 1] = 0.16;
      positions[i * 3 + 2] = 0;
      seeds[i] = this.random.next();
    }
    const sparkGeometry = new BufferGeometry();
    sparkGeometry.setAttribute('position', new BufferAttribute(positions, 3));
    sparkGeometry.setAttribute('aSeed', new BufferAttribute(seeds, 1));
    this.sparkMaterial = new ShaderMaterial({
      vertexShader: SPARK_VERTEX,
      fragmentShader: SPARK_FRAGMENT,
      uniforms: { uTime: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    const sparks = new Points(sparkGeometry, this.sparkMaterial);
    sparks.frustumCulled = false;
    this.add(sparks);

    // ---- light: the room's primary warmth ----
    this.light = new PointLight(0xff9040, 2.6, 15, 2);
    this.light.position.set(this.lightBase.x, this.lightBase.y, this.lightBase.z);
    this.add(this.light);
    // a deep-orange kiss on the firebox bricks themselves
    this.emberGlow = new PointLight(0xff5a1a, 0.5, 1.7, 2);
    this.emberGlow.position.set(0.05, 0.28, 0);
    this.add(this.emberGlow);
  }

  update(time: Time): void {
    const e = time.elapsed;

    for (const material of this.flameMaterials) {
      material.uniforms['uTime']!.value = e;
    }
    this.sparkMaterial.uniforms['uTime']!.value = e;

    // calm, layered flicker — never strobing
    const flicker =
      0.88 + Math.sin(e * 6.7) * 0.05 + Math.sin(e * 15.3) * 0.035 + this.random.next() * 0.03;
    this.light.intensity = 2.6 * flicker;
    // slow drift moves the highlights across nearby wood and floor
    this.light.position.x = this.lightBase.x + Math.sin(e * 1.1) * 0.05;
    this.light.position.z = this.lightBase.z + Math.cos(e * 1.4) * 0.05;
    this.emberGlow.intensity = 0.5 + Math.sin(e * 2.3) * 0.12;

    this.emberBed.emissiveIntensity = 1.5 + Math.sin(e * 1.7) * 0.35 + Math.sin(e * 4.3) * 0.15;
    this.coals.emissiveIntensity = 2.0 + Math.sin(e * 2.9 + 1.2) * 0.55;
    this.cracks.emissiveIntensity = 1.1 + Math.sin(e * 2.1 + 0.5) * 0.3;

    for (const smoke of this.smokes) {
      const t = (e * smoke.speed + smoke.phase) % 1;
      smoke.sprite.position.set(
        Math.sin((t + smoke.phase) * 9) * 0.05,
        0.3 + t * 0.72,
        Math.cos((t + smoke.phase) * 7) * 0.05,
      );
      const scale = 0.12 + t * 0.3;
      smoke.sprite.scale.set(scale, scale, 1);
      smoke.sprite.material.opacity = 0.16 * Math.sin(Math.PI * t);
    }
  }
}
