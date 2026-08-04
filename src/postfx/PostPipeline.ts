import {
  HalfFloatType,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  type PerspectiveCamera,
  type Scene,
  type WebGLRenderer,
} from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { settings } from '../config/settings';
import type { Viewport } from '../core/Viewport';
import { smoothstep } from '../utils/math';
import { godRaysShader } from './godRaysShader';

const sunDirection = new Vector3(
  settings.lighting.sun.position.x,
  settings.lighting.sun.position.y,
  settings.lighting.sun.position.z,
).normalize();

const scratchSun = new Vector3();
const scratchForward = new Vector3();

export class PostPipeline {
  private readonly composer: EffectComposer;
  private readonly godRaysPass: ShaderPass;

  constructor(
    renderer: WebGLRenderer,
    scene: Scene,
    private readonly camera: PerspectiveCamera,
    antialias: boolean,
  ) {
    const target = new WebGLRenderTarget(1, 1, {
      type: HalfFloatType,
      samples: antialias ? 4 : 0,
    });

    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, this.camera));

    this.godRaysPass = new ShaderPass(godRaysShader);
    this.composer.addPass(this.godRaysPass);

    const { bloom } = settings.postfx;
    this.composer.addPass(
      new UnrealBloomPass(new Vector2(1, 1), bloom.strength, bloom.radius, bloom.threshold),
    );

    this.composer.addPass(new OutputPass());
  }

  setSize(viewport: Viewport): void {
    this.composer.setPixelRatio(viewport.pixelRatio);
    this.composer.setSize(viewport.width, viewport.height);
  }

  render(): void {
    this.updateSun();
    this.composer.render();
  }

  /**
   * Projects the (directional) sun into screen space each frame and fades
   * the shafts out as it leaves the forward hemisphere, so orbiting behind
   * the light never produces mirrored rays.
   */
  private updateSun(): void {
    scratchSun.copy(sunDirection).multiplyScalar(300).add(this.camera.position);
    scratchSun.project(this.camera);

    const uniforms = this.godRaysPass.uniforms;
    uniforms.uSunScreen!.value.set(scratchSun.x * 0.5 + 0.5, scratchSun.y * 0.5 + 0.5);

    const facing = this.camera.getWorldDirection(scratchForward).dot(sunDirection);
    uniforms.uIntensity!.value =
      settings.postfx.godRays.intensity * smoothstep(-0.05, 0.2, facing);
  }
}
