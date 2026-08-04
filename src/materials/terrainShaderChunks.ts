export const terrainVertexDeclarations = /* glsl */ `
  varying vec3 vTriPosition;
  varying vec3 vTriNormal;
  varying mat3 vTriNormalMatrix;
`;

export const terrainVertexAssignments = /* glsl */ `
  vTriPosition = transformed;
  vTriNormal = normalize(objectNormal);
  vTriNormalMatrix = normalMatrix;
`;

export const terrainFragmentDeclarations = /* glsl */ `
  uniform sampler2D uBaseDiff;
  uniform sampler2D uBaseNorm;
  uniform sampler2D uBaseArm;
  uniform sampler2D uAccentDiff;
  uniform sampler2D uAccentNorm;
  uniform sampler2D uAccentArm;
  uniform float uBaseScale;
  uniform float uAccentScale;
  uniform float uAccentEdge0;
  uniform float uAccentEdge1;
  uniform float uAccentOnUp;
  uniform float uAccentNoise;
  uniform float uTriSharpness;
  uniform float uVertexColorStrength;
  uniform float uAoStrength;
  uniform float uTime;

  float terrainHash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float terrainNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 s = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(terrainHash(i), terrainHash(i + vec2(1.0, 0.0)), s.x),
      mix(terrainHash(i + vec2(0.0, 1.0)), terrainHash(i + vec2(1.0, 1.0)), s.x),
      s.y
    );
  }

  varying vec3 vTriPosition;
  varying vec3 vTriNormal;
  varying mat3 vTriNormalMatrix;

  vec3 triplanarWeights(vec3 normal) {
    vec3 weights = pow(abs(normal), vec3(uTriSharpness));
    return weights / (weights.x + weights.y + weights.z);
  }

  vec4 triplanarSample(sampler2D map, vec3 p, vec3 w, float scale) {
    return texture2D(map, p.zy * scale) * w.x +
      texture2D(map, p.xz * scale) * w.y +
      texture2D(map, p.xy * scale) * w.z;
  }

  vec4 triplanarSampleDetiled(sampler2D map, vec3 p, vec3 w, float scale) {
    #ifdef TERRAIN_SIMPLE
      return triplanarSample(map, p, w, scale);
    #else
      vec4 near = triplanarSample(map, p, w, scale);
      vec4 far = triplanarSample(map, p + vec3(37.7, 17.3, -24.9), w, scale * -0.53);
      return mix(near, far, 0.5);
    #endif
  }

  vec3 triplanarNormal(sampler2D map, vec3 p, vec3 n, vec3 w, float scale) {
    vec3 tnx = texture2D(map, p.zy * scale).xyz * 2.0 - 1.0;
    vec3 tny = texture2D(map, p.xz * scale).xyz * 2.0 - 1.0;
    vec3 tnz = texture2D(map, p.xy * scale).xyz * 2.0 - 1.0;

    tnx = vec3(tnx.xy + n.zy, abs(tnx.z) * n.x);
    tny = vec3(tny.xy + n.xz, abs(tny.z) * n.y);
    tnz = vec3(tnz.xy + n.xy, abs(tnz.z) * n.z);

    return normalize(tnx.zyx * w.x + tny.xzy * w.y + tnz.xyz * w.z);
  }
`;

export const terrainMapFragment = /* glsl */ `
  vec3 terrainWeights = triplanarWeights(vTriNormal);

  float terrainUp = clamp(vTriNormal.y, -1.0, 1.0);
  float accentRamp = smoothstep(uAccentEdge0, uAccentEdge1, terrainUp);
  float terrainAccent = mix(1.0 - accentRamp, accentRamp, uAccentOnUp);

  vec4 terrainBaseDiff = triplanarSampleDetiled(uBaseDiff, vTriPosition, terrainWeights, uBaseScale);
  vec4 terrainAccentDiff = triplanarSampleDetiled(uAccentDiff, vTriPosition, terrainWeights, uAccentScale);

  float accentBreakup = (terrainAccentDiff.g - 0.42) * uAccentNoise;
  terrainAccent = clamp(terrainAccent + accentBreakup * terrainAccent * (1.0 - terrainAccent) * 4.0, 0.0, 1.0);

  vec4 terrainArm = mix(
    triplanarSample(uBaseArm, vTriPosition, terrainWeights, uBaseScale),
    triplanarSample(uAccentArm, vTriPosition, terrainWeights, uAccentScale),
    terrainAccent
  );

  diffuseColor.rgb *= mix(terrainBaseDiff.rgb, terrainAccentDiff.rgb, terrainAccent);

  // slow cloud shadows sweeping the island (skipped on the low tier)
  #ifndef TERRAIN_SIMPLE
    vec2 cloudUv = vTriPosition.xz * 0.02 + vec2(uTime * 0.010, uTime * 0.006);
    float cloudCover = terrainNoise(cloudUv) * 0.6 + terrainNoise(cloudUv * 2.3 + 7.7) * 0.4;
    diffuseColor.rgb *= 1.0 - smoothstep(0.55, 0.9, cloudCover) * 0.11;
  #endif
`;

export const terrainColorFragment = /* glsl */ `
  #if defined( USE_COLOR )
    diffuseColor.rgb *= mix(vec3(1.0), vColor.rgb, uVertexColorStrength);
  #endif
`;

export const terrainNormalFragment = /* glsl */ `
  #ifdef TERRAIN_SIMPLE
    vec3 terrainObjectNormal =
      triplanarNormal(uBaseNorm, vTriPosition, vTriNormal, terrainWeights, uBaseScale);
  #else
    vec3 terrainObjectNormal = mix(
      triplanarNormal(uBaseNorm, vTriPosition, vTriNormal, terrainWeights, uBaseScale),
      triplanarNormal(uAccentNorm, vTriPosition, vTriNormal, terrainWeights, uAccentScale),
      terrainAccent
    );
  #endif
  normal = normalize(vTriNormalMatrix * terrainObjectNormal);
  #ifdef DOUBLE_SIDED
    normal = normal * faceDirection;
  #endif
`;

export const terrainRoughnessFragment = /* glsl */ `
  float roughnessFactor = clamp(roughness * terrainArm.g * 1.4, 0.05, 1.0);
`;

export const terrainAoFragment = /* glsl */ `
  float ambientOcclusion = mix(1.0, terrainArm.r, uAoStrength);
  reflectedLight.indirectDiffuse *= ambientOcclusion;
  #if defined( USE_ENVMAP ) && defined( STANDARD )
    float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
    reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
  #endif
`;
