import { ACESFilmicToneMapping, PCFShadowMap, SRGBColorSpace, WebGLRenderer } from 'three';
import { settings } from '../config/settings';

export function createRenderer(canvas: HTMLCanvasElement, antialias: boolean): WebGLRenderer {
  const renderer = new WebGLRenderer({
    canvas,
    antialias,
    powerPreference: 'high-performance',
  });

  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = settings.renderer.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;

  return renderer;
}
