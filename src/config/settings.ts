export const settings = {
  renderer: {
    maxPixelRatio: 2,
    exposure: 1.05,
  },
  camera: {
    fov: 42,
    near: 0.1,
    far: 900,
    initialPosition: { x: 31, y: 1, z: 57 },
    initialTarget: { x: 2.5, y: 8, z: 0 },
  },
  atmosphere: {
    zenithColor: 0x3a6fbd,
    skyColor: 0x8fb8d8,
    horizonColor: 0xf3e2c0,
    groundColor: 0xa8b8d0,
    fogColor: 0xc3cfdf,
    fogNear: 52,
    fogFar: 300,
  },
  environment: {
    hdri: '/assets/hdri/sunflowers_puresky_2k.hdr',
    intensity: 0.4,
  },
  postfx: {
    bloom: {
      threshold: 0.82,
      strength: 0.36,
      radius: 0.55,
    },
    godRays: {
      intensity: 0.45,
      density: 0.9,
      decay: 0.94,
      weight: 0.06,
      threshold: 0.8,
      color: 0xffe8c4,
    },
  },
  lighting: {
    sun: {
      color: 0xffd9a8,
      intensity: 3.9,
      position: { x: -56, y: 34, z: 26 },
      shadowFrustum: 46,
    },
    sky: {
      skyColor: 0x9db9e8,
      groundColor: 0x4f5c4a,
      intensity: 0.22,
    },
  },
} as const;
