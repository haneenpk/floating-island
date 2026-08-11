export const settings = {
  renderer: {
    maxPixelRatio: 2,
    // late light is not bright light: a lower exposure lets the warm tones
    // deepen instead of washing toward white
    exposure: 0.92,
  },
  camera: {
    fov: 42,
    near: 0.1,
    far: 900,
    initialPosition: { x: 31, y: 1, z: 57 },
    initialTarget: { x: 2.5, y: 8, z: 0 },
  },
  // Golden hour, and only on the sun's side: honey where the sun sits,
  // cool dusk opposite it, deep dusty blue overhead.
  atmosphere: {
    zenithColor: 0x30598f,
    skyColor: 0x8fb8d8,
    horizonWarmColor: 0xe5a468,
    horizonCoolColor: 0x8e97bb,
    groundColor: 0xa89c8a,
    // one fog colour has to serve both sides of the sky: keep it a warm
    // neutral so distance reads hazy, not grey
    fogColor: 0xc9bda9,
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
      intensity: 3.25,
      position: { x: -56, y: 23, z: 26 },
      shadowFrustum: 46,
    },
    sky: {
      skyColor: 0xc0a8c0,
      groundColor: 0x5c4f3e,
      intensity: 0.2,
    },
  },
} as const;
