import { settings } from '../config/settings';
import { getQuality } from './Quality';

type ResizeListener = (viewport: Viewport) => void;

function currentPixelRatio(): number {
  return Math.min(
    window.devicePixelRatio,
    settings.renderer.maxPixelRatio,
    getQuality().pixelRatioCap,
  );
}

export class Viewport {
  private listeners = new Set<ResizeListener>();

  width = window.innerWidth;
  height = window.innerHeight;
  pixelRatio = currentPixelRatio();

  constructor() {
    window.addEventListener('resize', this.handleResize);
  }

  get aspect(): number {
    return this.width / this.height;
  }

  onResize(listener: ResizeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    window.removeEventListener('resize', this.handleResize);
    this.listeners.clear();
  }

  private handleResize = (): void => {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.pixelRatio = currentPixelRatio();
    this.listeners.forEach((listener) => listener(this));
  };
}
