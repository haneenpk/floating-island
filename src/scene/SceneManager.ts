import { Color, Fog, Scene, type Object3D } from 'three';
import { settings } from '../config/settings';
import type { Time } from '../core/Time';
import { isUpdatable, type Updatable } from './Updatable';

export class SceneManager {
  readonly scene = new Scene();

  private readonly updatables: Updatable[] = [];

  constructor() {
    this.scene.background = new Color(settings.atmosphere.fogColor);
    this.scene.fog = new Fog(
      settings.atmosphere.fogColor,
      settings.atmosphere.fogNear,
      settings.atmosphere.fogFar,
    );
  }

  add(...objects: Object3D[]): void {
    for (const object of objects) {
      this.scene.add(object);
      if (isUpdatable(object)) {
        this.updatables.push(object);
      }
    }
  }

  register(updatable: Updatable): void {
    this.updatables.push(updatable);
  }

  update(time: Time): void {
    for (const updatable of this.updatables) {
      updatable.update(time);
    }
  }
}
