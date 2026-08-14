import { Vector3 } from 'three';
import type { WalkInput } from '../scene/character/TravelerController';

/** What the third-person camera needs of whatever it is following. */
export interface ExploreTarget {
  step(delta: number, input: WalkInput, viewYaw: number): void;
  /** World point to frame — roughly the head. */
  getFocus(out: Vector3): Vector3;
  /** Ground height under a world point, in world units. */
  groundAtWorld(point: Vector3): number;
  /** How far back the camera may sit before something gets in the way. */
  clearSightLine(focus: Vector3, wanted: Vector3, nearest: number): number;
  readonly groundSpeed: number;
  readonly airborne: boolean;
  takeLandingImpact(): number;
}

// Over the shoulder: back and up from the head, and off to one side so the
// traveler sits away from the middle of the frame and the island ahead is
// not spent looking at their hood.
const DISTANCE = 3.9;
const SHOULDER = 0.58;
const LIFT = 0.4;
/** never closer than this, however tight the gap the traveler has walked into */
const NEAREST = 1.15;

// The camera follows a smoothed version of the traveler rather than being
// smoothed itself: turning the view then stays instant while walking stays
// soft. Height is slower than ground — a step up a bank should not throw the
// horizon about.
const FOLLOW_GROUND = 11;
const FOLLOW_HEIGHT = 6;
// Coming in past an obstacle has to be quick or the camera is already inside
// it; going back out can afford to be gentle.
const CLOSE_IN_RATE = 22;
const EASE_OUT_RATE = 3.5;

// A walked step is worth about this much rise and fall, and the sway is half
// of it — enough to feel like footfalls, little enough that nobody watching
// would call it a camera shake.
const BOB_HEIGHT = 0.028;
const BOB_STRIDE = 8.4;
// what a landing takes out of the knees, and how fast it comes back
const LANDING_DIP = 0.075;
const DIP_RECOVERY = 9;

const PITCH_MIN = -0.95;
const PITCH_MAX = 0.55;

const focus = new Vector3();
const wanted = new Vector3();
const forward = new Vector3();
const side = new Vector3();

/**
 * The camera that walks behind the traveler.
 *
 * It keeps its own smoothed anchor rather than smoothing its own position:
 * the anchor follows the walk, the camera hangs rigidly off the anchor at
 * whatever angle the mouse asks for. That separation is what makes looking
 * around feel immediate while walking still feels unhurried — smoothing the
 * camera itself makes both mushy at once.
 */
export class ThirdPersonView {
  readonly position = new Vector3();
  readonly lookAt = new Vector3();

  private readonly anchor = new Vector3();
  private distance = DISTANCE;
  private stride = 0;
  private dip = 0;
  private dipRate = 0;
  private settled = false;

  /** Start from wherever the camera already is, and swing round from there. */
  reset(from: Vector3): void {
    this.position.copy(from);
    this.distance = DISTANCE;
    this.stride = 0;
    this.dip = 0;
    this.dipRate = 0;
    this.settled = false;
  }

  update(target: ExploreTarget, yaw: number, pitch: number, delta: number): void {
    const clampedPitch = Math.min(Math.max(pitch, PITCH_MIN), PITCH_MAX);
    target.getFocus(focus);

    // the anchor catches up with the traveler; the camera hangs off the anchor
    if (!this.settled) {
      this.anchor.copy(focus);
      this.settled = true;
    } else {
      const ground = 1 - Math.exp(-delta * FOLLOW_GROUND);
      const height = 1 - Math.exp(-delta * FOLLOW_HEIGHT);
      this.anchor.x += (focus.x - this.anchor.x) * ground;
      this.anchor.z += (focus.z - this.anchor.z) * ground;
      this.anchor.y += (focus.y - this.anchor.y) * height;
    }

    forward.set(
      Math.sin(yaw) * Math.cos(clampedPitch),
      Math.sin(clampedPitch),
      Math.cos(yaw) * Math.cos(clampedPitch),
    );
    // the walker's right, flat on the ground
    side.set(-Math.cos(yaw), 0, Math.sin(yaw));

    wanted
      .copy(this.anchor)
      .addScaledVector(forward, -DISTANCE)
      .addScaledVector(side, SHOULDER);
    wanted.y += LIFT;

    // How far back may it actually sit? Closing the gap is urgent, opening it
    // again is not: a camera that sprang back out the instant a trunk cleared
    // would pump in and out all the way past the tree.
    const clear = target.clearSightLine(this.anchor, wanted, NEAREST);
    const reach = this.anchor.distanceTo(wanted);
    const room = reach > 1e-4 ? (clear / reach) * DISTANCE : DISTANCE;
    const rate = room < this.distance ? CLOSE_IN_RATE : EASE_OUT_RATE;
    this.distance += (room - this.distance) * (1 - Math.exp(-delta * rate));

    const pull = this.distance / DISTANCE;
    this.position
      .copy(this.anchor)
      .addScaledVector(forward, -this.distance)
      .addScaledVector(side, SHOULDER * pull);
    this.position.y += LIFT * pull;

    this.addFootfalls(target, delta);

    // never below the grass, whatever the sight line allowed
    const floor = target.groundAtWorld(this.position) + 0.35;
    if (this.position.y < floor) this.position.y = floor;

    // aim past the shoulder rather than at the hood itself
    this.lookAt.copy(this.anchor).addScaledVector(side, SHOULDER * 0.45 * pull);
  }

  /**
   * The rise and fall of walking, and the give of a landing. Both are small
   * on purpose: this is a traveler on a path, not a handheld camera.
   */
  private addFootfalls(target: ExploreTarget, delta: number): void {
    const pace = target.airborne ? 0 : target.groundSpeed;
    this.stride += delta * BOB_STRIDE * Math.max(pace, 0.0001);

    const impact = target.takeLandingImpact();
    if (impact > 0.5) {
      this.dipRate -= Math.min(impact * 0.5, 1.4) * LANDING_DIP * 12;
    }
    // a spring back to nothing, critically damped enough not to wobble
    this.dipRate += -this.dip * DIP_RECOVERY * DIP_RECOVERY * delta;
    this.dipRate *= Math.exp(-delta * DIP_RECOVERY * 1.8);
    this.dip += this.dipRate * delta;

    const swing = Math.min(pace / 2.2, 1);
    this.position.y += Math.sin(this.stride) * BOB_HEIGHT * swing + this.dip;
    this.position.addScaledVector(side, Math.sin(this.stride * 0.5) * BOB_HEIGHT * 0.5 * swing);
  }
}
