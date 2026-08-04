import {
  AudioLoader,
  EquirectangularReflectionMapping,
  LoadingManager,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  type DataTexture,
  type Object3D,
  type Texture,
} from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { getQuality } from '../core/Quality';
import { prepareModelScene } from './prepareModel';

export type ProgressHandler = (url: string, loaded: number, total: number) => void;

export interface TextureOptions {
  colorSpace?: 'srgb' | 'linear';
  repeat?: boolean;
  anisotropy?: number;
}

export class AssetManager {
  private readonly manager = new LoadingManager();
  private readonly textureLoader = new TextureLoader(this.manager);
  private readonly gltfLoader = new GLTFLoader(this.manager);
  private readonly hdrLoader = new HDRLoader(this.manager);
  private readonly audioLoader = new AudioLoader(this.manager);

  private readonly textures = new Map<string, Texture>();
  private readonly models = new Map<string, GLTF>();
  private readonly environments = new Map<string, DataTexture>();
  private readonly audio = new Map<string, AudioBuffer>();

  constructor() {
    if (getQuality().textureSuffix === '1k') {
      this.manager.setURLModifier((url) => url.replace(/_2k\.(jpe?g|png)$/i, '_1k.$1'));
    }
  }

  onProgress(handler: ProgressHandler): void {
    this.manager.onProgress = handler;
  }

  async loadTexture(key: string, url: string, options: TextureOptions = {}): Promise<Texture> {
    const cached = this.textures.get(key);
    if (cached) return cached;

    const texture = await this.textureLoader.loadAsync(url);
    texture.colorSpace = options.colorSpace === 'srgb' ? SRGBColorSpace : NoColorSpace;
    if (options.repeat !== false) {
      texture.wrapS = RepeatWrapping;
      texture.wrapT = RepeatWrapping;
    }
    texture.anisotropy = options.anisotropy ?? getQuality().anisotropy;
    texture.needsUpdate = true;

    this.textures.set(key, texture);
    return texture;
  }

  async loadModel(key: string, url: string): Promise<GLTF> {
    const cached = this.models.get(key);
    if (cached) return cached;

    const gltf = await this.gltfLoader.loadAsync(url);
    prepareModelScene(gltf.scene);
    this.models.set(key, gltf);
    return gltf;
  }

  async loadEnvironment(key: string, url: string): Promise<DataTexture> {
    const cached = this.environments.get(key);
    if (cached) return cached;

    const texture = await this.hdrLoader.loadAsync(url);
    texture.mapping = EquirectangularReflectionMapping;
    this.environments.set(key, texture);
    return texture;
  }

  async loadAudio(key: string, url: string): Promise<AudioBuffer> {
    const cached = this.audio.get(key);
    if (cached) return cached;

    const buffer = await this.audioLoader.loadAsync(url);
    this.audio.set(key, buffer);
    return buffer;
  }

  getModel(key: string): GLTF | undefined {
    return this.models.get(key);
  }

  cloneModel(key: string): Object3D {
    const model = this.models.get(key);
    if (!model) {
      throw new Error(`Model "${key}" has not been loaded`);
    }
    return model.scene.clone(true);
  }
}
