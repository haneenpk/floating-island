import { PMREMGenerator } from 'three';
import { settings } from '../../config/settings';
import type { Engine } from '../../core/Engine';

export async function applyHdriEnvironment(engine: Engine): Promise<void> {
  const equirect = await engine.assets.loadEnvironment('sky-hdri', settings.environment.hdri);

  const pmrem = new PMREMGenerator(engine.renderer);
  const environment = pmrem.fromEquirectangular(equirect).texture;
  pmrem.dispose();
  equirect.dispose();

  const scene = engine.sceneManager.scene;
  scene.environment = environment;
  scene.environmentIntensity = settings.environment.intensity;
}
