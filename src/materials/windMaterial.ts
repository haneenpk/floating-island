import type { IUniform, MeshStandardMaterial } from 'three';

/** Single global wind clock, ticked once per frame by the Engine. */
export const windTimeUniform: IUniform<number> = { value: 0 };

export interface WindOptions {
  /** Horizontal sway at the top of the object, in local units. */
  amplitude: number;
  /** High-frequency along-normal flutter (leaves), in local units. */
  flutter: number;
  /** Local-space height used to keep the base anchored and the top loose. */
  height: number;
}

const windVertexChunk = /* glsl */ `
  #include <begin_vertex>
  {
    float windHeight01 = clamp(transformed.y / uWindHeight, 0.0, 1.0);
    float windBend = windHeight01 * windHeight01;
    float windPhase = transformed.x * 0.35 + transformed.z * 0.28;
    float windGust =
      sin(uWindTime * 0.9 + windPhase) * 0.6 + sin(uWindTime * 2.1 + windPhase * 1.7) * 0.4;
    transformed.x += windGust * uWindAmp * windBend;
    transformed.z += windGust * uWindAmp * windBend * 0.55;
    transformed +=
      objectNormal * (sin(uWindTime * 3.7 + windPhase * 6.0) * uWindFlutter * windHeight01);
  }
`;

export function applyWind(material: MeshStandardMaterial, options: WindOptions): void {
  if (material.userData.windApplied) return;
  material.userData.windApplied = true;

  const previousOnBeforeCompile = material.onBeforeCompile;

  material.onBeforeCompile = (shader, renderer) => {
    previousOnBeforeCompile?.(shader, renderer);

    shader.uniforms.uWindTime = windTimeUniform;
    shader.uniforms.uWindAmp = { value: options.amplitude };
    shader.uniforms.uWindFlutter = { value: options.flutter };
    shader.uniforms.uWindHeight = { value: Math.max(options.height, 0.001) };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uWindTime;
        uniform float uWindAmp;
        uniform float uWindFlutter;
        uniform float uWindHeight;`,
      )
      .replace('#include <begin_vertex>', windVertexChunk);
  };

  const previousCacheKey = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => `${previousCacheKey()}|wind-v1`;
}
