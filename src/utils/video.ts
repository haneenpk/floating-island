import { SRGBColorSpace, VideoTexture } from 'three';

export function createLoopingVideoTexture(url: string): VideoTexture {
  const video = document.createElement('video');
  video.src = url;
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.crossOrigin = 'anonymous';

  void video.play().catch(() => {
    const resume = () => {
      void video.play();
      window.removeEventListener('pointerdown', resume);
    };
    window.addEventListener('pointerdown', resume);
  });

  const texture = new VideoTexture(video);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}
