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
  // golden hour: deep dusty blue overhead melting into honeyed haze
  atmosphere: {
    zenithColor: 0x3c6bb4,
    skyColor: 0x8fb8d8,
    horizonColor: 0xf6c17f,
    groundColor: 0xd8b494,
    fogColor: 0xdcc3a4,
    fogNear: 70,
    fogFar: 340,
  },
  environment: {
    hdri: '/assets/hdri/evening_road_01_puresky_2k.hdr',
    intensity: 0.45,
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
      color: 0xffd9a0,
    },
  },
  lighting: {
    // low warm sun: long shadows, gilded edges
    sun: {
      color: 0xffbe78,
      intensity: 3.8,
      position: { x: -56, y: 23, z: 26 },
      shadowFrustum: 46,
    },
    sky: {
      skyColor: 0xc0a8c0,
      groundColor: 0x5c4f3e,
      intensity: 0.26,
    },
  },
} as const;
