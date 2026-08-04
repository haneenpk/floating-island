import type { Time } from '../core/Time';

export interface Updatable {
  update(time: Time): void;
}

export function isUpdatable(value: unknown): value is Updatable {
  return typeof (value as Updatable)?.update === 'function';
}
