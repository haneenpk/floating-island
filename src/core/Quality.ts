export type QualityTier = 'low' | 'medium';

export type ModelVariant = '2k' | 'lod1' | 'lod2';

export interface QualityProfile {
  tier: QualityTier;
  pixelRatioCap: number;
  antialias: boolean;
  shadowMapSize: number;
  shadowRadius: number;
  textureSuffix: '1k' | '2k';
  anisotropy: number;
  islandDetail: number;
  heroModelVariant: ModelVariant;
  foliageModelVariant: ModelVariant;
  treeBudget: number;
  grassDensity: number;
  flowerDensity: number;
  animateIsland: boolean;
  dynamicShadows: boolean;
  postProcessing: boolean;
  cloudCount: number;
  pollenCount: number;
  cottageLight: boolean;
}

const PROFILES: Record<QualityTier, QualityProfile> = {
  low: {
    tier: 'low',
    pixelRatioCap: 1,
    antialias: false,
    shadowMapSize: 1024,
    shadowRadius: 2,
    textureSuffix: '1k',
    anisotropy: 2,
    islandDetail: 0.55,
    heroModelVariant: 'lod2',
    foliageModelVariant: 'lod2',
    treeBudget: 1,
    grassDensity: 0,
    flowerDensity: 0.55,
    animateIsland: false,
    dynamicShadows: false,
    postProcessing: false,
    cloudCount: 8,
    pollenCount: 45,
    cottageLight: false,
  },
  medium: {
    tier: 'medium',
    pixelRatioCap: 1.5,
    antialias: true,
    shadowMapSize: 2048,
    shadowRadius: 3,
    textureSuffix: '2k',
    anisotropy: 4,
    islandDetail: 0.8,
    heroModelVariant: 'lod1',
    foliageModelVariant: 'lod1',
    treeBudget: 3,
    grassDensity: 0.45,
    flowerDensity: 0.7,
    animateIsland: true,
    dynamicShadows: true,
    postProcessing: true,
    cloudCount: 14,
    pollenCount: 100,
    cottageLight: true,
  },
};

const STORAGE_KEY = 'island:quality';
const TIER_ORDER: QualityTier[] = ['medium', 'low'];

function isTier(value: unknown): value is QualityTier {
  return value === 'low' || value === 'medium';
}

function detectTier(): QualityTier {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');

  let gpu = '';
  if (gl) {
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    gpu = debugInfo
      ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL))
      : String(gl.getParameter(gl.RENDERER));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }

  const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;

  const weakGpu =
    /GT ?7[0-4]0|GT ?6\d0|GT ?5\d0|GTX ?[4-6]\d0\b|Radeon ?(HD|R5)|HD Graphics|UHD Graphics 6\d\d|Mali|Adreno|SwiftShader|llvmpipe/i;

  if (weakGpu.test(gpu) || deviceMemory <= 4) return 'low';
  return 'medium';
}

export function isQualityOverridden(): boolean {
  return isTier(new URLSearchParams(window.location.search).get('quality'));
}

function resolveTier(): QualityTier {
  const fromUrl = new URLSearchParams(window.location.search).get('quality');
  if (isTier(fromUrl)) return fromUrl;

  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (isTier(stored)) return stored;

  return detectTier();
}

let activeProfile: QualityProfile | null = null;

export function getQuality(): QualityProfile {
  if (!activeProfile) {
    activeProfile = PROFILES[resolveTier()];
  }
  return activeProfile;
}

export function downgradeQuality(): boolean {
  const index = TIER_ORDER.indexOf(getQuality().tier);
  const next = TIER_ORDER[index + 1];
  if (!next) return false;

  window.localStorage.setItem(STORAGE_KEY, next);
  console.info(`[quality] sustained low fps - downgrading to "${next}" and reloading`);
  return true;
}
