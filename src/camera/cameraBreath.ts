import type { PerspectiveCamera } from 'three';

/**
 * A fraction-of-a-degree orientation drift, reapplied fresh after the
 * controller has set the camera each frame — the stillness-breaker of a
 * locked-off tripod shot, far below the threshold of "camera movement".
 */
export function applyCameraBreath(camera: PerspectiveCamera, elapsed: number): void {
  camera.rotateX(Math.sin(elapsed * 0.23) * 0.0022);
  camera.rotateY(Math.cos(elapsed * 0.17) * 0.0018);
}
