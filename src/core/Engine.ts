import { PerspectiveCamera, type WebGLRenderer } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { AssetManager } from '../assets/AssetManager';
import { applyCameraBreath } from '../camera/cameraBreath';
import { CameraRig } from '../camera/CameraRig';
import { ExperienceCamera } from '../camera/ExperienceCamera';
import { settings } from '../config/settings';
import { windTimeUniform } from '../materials/windMaterial';
import { PostPipeline } from '../postfx/PostPipeline';
import { SceneManager } from '../scene/SceneManager';
import { hasDebugFlag } from '../utils/debug';
import { createRenderer } from './createRenderer';
import { PerformanceWatchdog } from './PerformanceWatchdog';
import { getQuality } from './Quality';
import { Time } from './Time';
import { Viewport } from './Viewport';

interface CameraControl {
  update(time: Time): void;
}

export class Engine {
  readonly renderer: WebGLRenderer;
  readonly camera: PerspectiveCamera;
  readonly viewport: Viewport;
  readonly time: Time;
  readonly sceneManager: SceneManager;
  readonly assets: AssetManager;

  readonly cameraControl: CameraControl;
  private readonly watchdog = new PerformanceWatchdog();
  private readonly post: PostPipeline | null;
  /** the cottage interior renders plain (no bloom/postfx) on every tier */
  postSuspended = false;

  constructor(canvas: HTMLCanvasElement) {
    const quality = getQuality();

    this.viewport = new Viewport();
    this.time = new Time();
    this.assets = new AssetManager();
    this.sceneManager = new SceneManager();

    this.renderer = createRenderer(canvas, quality.antialias);
    if (!quality.dynamicShadows) {
      this.renderer.shadowMap.autoUpdate = false;
    }

    const { fov, near, far, initialPosition } = settings.camera;
    this.camera = new PerspectiveCamera(fov, this.viewport.aspect, near, far);
    this.camera.position.set(initialPosition.x, initialPosition.y, initialPosition.z);

    this.post = quality.postProcessing
      ? new PostPipeline(this.renderer, this.sceneManager.scene, this.camera, quality.antialias)
      : null;

    // The landing experience (intro -> title -> scroll journey) is the
    // default. ?debug=orbit keeps free navigation for art direction, and
    // ?debug=scroll boots straight into the raw rig for shot authoring.
    this.cameraControl = hasDebugFlag('orbit')
      ? createOrbitControl(this.camera, canvas)
      : hasDebugFlag('scroll')
        ? new CameraRig(this.camera)
        : new ExperienceCamera(this.camera);

    this.applyViewport();
    this.viewport.onResize(() => this.applyViewport());
  }

  start(): void {
    this.renderer.setAnimationLoop(() => this.frame());
  }

  stop(): void {
    this.renderer.setAnimationLoop(null);
  }

  refreshShadows(): void {
    this.renderer.shadowMap.needsUpdate = true;
  }

  private frame(): void {
    this.time.tick();
    windTimeUniform.value = this.time.elapsed;
    this.watchdog.sample(this.time.rawDelta);
    this.cameraControl.update(this.time);
    this.sceneManager.update(this.time);

    if (this.post && !this.postSuspended) {
      this.post.render();
    } else {
      this.renderer.render(this.sceneManager.scene, this.camera);
    }
  }

  private applyViewport(): void {
    this.camera.aspect = this.viewport.aspect;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.viewport.width, this.viewport.height);
    this.renderer.setPixelRatio(this.viewport.pixelRatio);
    this.post?.setSize(this.viewport);
  }
}

function createOrbitControl(camera: PerspectiveCamera, canvas: HTMLCanvasElement): CameraControl {
  const controls = new OrbitControls(camera, canvas);
  const { initialTarget } = settings.camera;
  controls.target.set(initialTarget.x, initialTarget.y, initialTarget.z);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.maxDistance = 120;

  return {
    update: (time: Time) => {
      controls.update();
      applyCameraBreath(camera, time.elapsed);
    },
  };
}
