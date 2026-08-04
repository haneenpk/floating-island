import { CanvasTexture, SRGBColorSpace } from 'three';

function makeRadialTexture(
  draw: (gradient: CanvasGradient) => void,
  size = 64,
): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d')!;
  const gradient = context.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  draw(gradient);
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

let puff: CanvasTexture | null = null;
let wear: CanvasTexture | null = null;

/** Soft white puff fading to transparent — motes, smoke, mist. */
export function getPuffTexture(): CanvasTexture {
  if (!puff) {
    puff = makeRadialTexture((gradient) => {
      gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
      gradient.addColorStop(0.55, 'rgba(255,255,255,0.38)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
    });
  }
  return puff;
}

/**
 * Earth-brown center fading to WHITE — designed for MultiplyBlending,
 * where white is a no-op and the center gently darkens the ground.
 */
export function getWearTexture(): CanvasTexture {
  if (!wear) {
    wear = makeRadialTexture((gradient) => {
      gradient.addColorStop(0, 'rgb(168,148,122)');
      gradient.addColorStop(0.6, 'rgb(214,204,188)');
      gradient.addColorStop(1, 'rgb(255,255,255)');
    });
  }
  return wear;
}
