import { Timer } from 'three';

const MAX_DELTA = 1 / 20;

export class Time {
  private readonly timer = new Timer();

  private _delta = 0;
  private _rawDelta = 0;
  private _elapsed = 0;

  get delta(): number {
    return this._delta;
  }

  get rawDelta(): number {
    return this._rawDelta;
  }

  get elapsed(): number {
    return this._elapsed;
  }

  tick(): void {
    this.timer.update();
    this._rawDelta = this.timer.getDelta();
    this._delta = Math.min(this._rawDelta, MAX_DELTA);
    this._elapsed = this.timer.getElapsed();
  }
}
