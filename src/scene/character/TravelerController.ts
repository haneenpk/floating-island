import { Mesh, MeshStandardMaterial, Quaternion, Raycaster, Vector3, type Object3D } from 'three';
import { pushOutOf, type Blocker } from '../composition/solidGround';
import type { IslandSurface } from '../islands/IslandSurface';
import { RUN_SPEED, WALK_SPEED, type Traveler } from './Traveler';

/** What the keys are asking for this frame. */
export interface WalkInput {
  /** -1 back, +1 forward */
  forward: number;
  /** -1 left, +1 right */
  right: number;
  run: boolean;
  jump: boolean;
}

// How briskly the traveler gathers speed and gives it up again, as an
// exponential rate a second. Setting off is the quicker of the two: a walk
// that takes a beat to start reads as lag, while one that takes a beat to
// stop reads as weight.
const ACCELERATION = 11;
const DECELERATION = 9;
// Once off the ground the feet have nothing to push against, so the keys only
// nudge. Committing to a jump is most of what makes one feel like a jump.
const AIR_CONTROL = 0.28;
// Turning on the spot is quick; turning at a run is not. The body swings
// round at somewhere between these, depending on how fast it is going.
const TURN_RATE_STANDING = 16;
const TURN_RATE_RUNNING = 7.5;
// Asking for a direction the traveler is not facing costs speed until they
// have come round to it — which is why a sharp reversal pivots rather than
// skates.
const TURN_DRAG = 0.62;
// below this the walk is over and the feet should settle rather than creep
const STILL_SPEED = 0.06;
// stay this far in from the rim: the ground falls away past it
const EDGE_MARGIN = 0.9;
// How wide the traveler stands, for the purpose of not being inside a wall.
// Measured off the hood and pack rather than the waist: those are the widest
// parts of them, and it is a shoulder going into stonework that reads as
// walking through a wall, not a hip.
const BODY_RADIUS = 0.36;
// How far above and below the feet a ledge is looked for. Up has to clear the
// whole shelf — it stands well over head height in places, and a ray that
// started below its top would pass under the rock and find nothing, which is
// exactly how you end up walking about inside it.
const LEDGE_REACH_UP = 4.0;
const LEDGE_REACH_DOWN = 0.9;
// The tallest thing that can be climbed in one movement. Generous enough for
// the spring shelf, mean enough that no rooftop can ever answer.
const MAX_CLIMB = 1.15;
// how quickly the feet reach a new footing — fast enough to be invisible on
// the meadow, slow enough that climbing the shelf is a climb
const FOOTING_SETTLE = 13;
// The points the ground is asked about: the middle of the traveler and the
// four edges of them. Five samples is enough to keep a shoulder out of a
// rock without the cost of tracing a whole silhouette.
const FOOTPRINT: readonly (readonly [number, number])[] = [
  [0, 0],
  [BODY_RADIUS, 0],
  [-BODY_RADIUS, 0],
  [0, BODY_RADIUS],
  [0, -BODY_RADIUS],
];
// 0 = always upright, 1 = lie flat along the hillside
const SLOPE_LEAN = 0.45;
// how fast the ground's slope is allowed to reach the body — a hillside that
// arrives instantly reads as the model twitching rather than the land turning
const SLOPE_SETTLE = 7;

// A hop, not a leap: about a third of the traveler's own height, off the
// ground for around half a second. Gravity is tuned against that rather than
// borrowed from the world — 9.81 in a scene where a person is under a unit
// tall would snap them back down like a dropped stone.
const JUMP_SPEED = 2.8;
const GRAVITY = 10.5;
// Letting go of the key on the way up cuts the jump short, so a tap clears a
// stone and a held key clears a fence.
const JUMP_CUT = 0.45;
// Pressing jump just before landing still counts — the alternative is a key
// that silently does nothing, which reads as the game missing the input.
const JUMP_BUFFER = 0.16;

// How far from the line between camera and traveler an obstacle has to be
// before the view stops caring, and how close in the camera may be pushed.
const SIGHT_PADDING = 0.28;
const GROUND_SIGHT_MARGIN = 0.35;
const SIGHT_SAMPLES = 5;

const UP = new Vector3(0, 1, 0);

const scratchNormal = new Vector3();
const scratchGround = new Vector3();
const scratchQuat = new Quaternion();
const scratchYaw = new Quaternion();
const scratchDirection = new Vector3();
const scratchSample = new Vector3();
const sightRay = new Raycaster();
const ledgeRay = new Raycaster();
const DOWN = new Vector3(0, -1, 0);

/**
 * Walks the traveler over the island.
 *
 * Everything here happens in the island's own space, because the island
 * drifts and tilts beneath its passengers: hold a world position and the
 * traveler would slide across the meadow every time the rock swayed. Height
 * comes from `IslandSurface` on every step — the same height field the
 * terrain mesh, the cottage pad and every placed rock read from — so the feet
 * cannot part company with the ground even where the river has cut into it.
 */
export class TravelerController {
  private readonly velocity = new Vector3();
  private readonly groundNormal = new Vector3(0, 1, 0);
  private yaw = 0;
  private speed = 0;
  /** height above the ground, and how fast that is changing */
  private lift = 0;
  private rise = 0;
  /** the height the feet are actually at, easing toward whatever is underfoot */
  private footing = 0;
  private jumpHeld = false;
  private jumpBuffered = 0;
  /** how hard the last landing was, for whoever wants to react to it */
  private impact = 0;
  /** meshes solid enough to stand between the camera and the traveler */
  private obstacles: Mesh[] | null = null;
  /** the subset of those you can stand on — no trunks, no rooftops */
  private standables: Mesh[] | null = null;
  /** shapes solid enough to stop the traveler walking into them */
  private blockers: readonly Blocker[] = [];

  constructor(
    private readonly traveler: Traveler,
    private readonly island: Object3D,
    private readonly surface: IslandSurface,
  ) {}

  /** What the traveler cannot walk through. */
  setBlockers(blockers: readonly Blocker[]): void {
    this.blockers = blockers;
  }


  /** Which way the traveler is facing, in island space. */
  get facing(): number {
    return this.yaw;
  }

  /** True while there is nothing underfoot. */
  get airborne(): boolean {
    return this.lift > 0;
  }

  /** How fast the ground is going by, in world units a second. */
  get groundSpeed(): number {
    return this.speed;
  }

  /** The force of the last landing, in units a second. Reading it clears it. */
  takeLandingImpact(): number {
    const impact = this.impact;
    this.impact = 0;
    return impact;
  }

  /** Stand the traveler at a point in island space, facing `yaw`. */
  placeAt(x: number, z: number, yaw: number): void {
    this.footing = this.surface.getHeightAt(x, z);
    this.traveler.position.set(x, this.footing, z);
    this.yaw = yaw;
    this.velocity.set(0, 0, 0);
    this.speed = 0;
    this.lift = 0;
    this.rise = 0;
    this.impact = 0;
    this.surface.getNormalAt(x, z, this.groundNormal);
    this.applyPose();
    this.traveler.standStill();
  }

  /** Where the camera should look: about the height of the hood. */
  getFocus(out: Vector3): Vector3 {
    out.copy(this.traveler.position);
    out.y += this.traveler.height * 0.72;
    return this.island.localToWorld(out);
  }

  /** Ground height directly under a world point, in world units. */
  groundAtWorld(point: Vector3): number {
    scratchGround.copy(point);
    this.island.worldToLocal(scratchGround);
    scratchGround.y = this.surface.getHeightAt(scratchGround.x, scratchGround.z);
    return this.island.localToWorld(scratchGround).y;
  }

  /**
   * How far back the camera may sit before something gets in the way.
   *
   * Two things can stand between the camera and the traveler, and they are
   * worth answering differently. The land is answered arithmetically — the
   * height field is already an exact description of it, so the line is
   * sampled against it rather than traced. Everything solid enough to matter
   * — the cottage, the trunk, the boulders — is traced properly, against a
   * short list gathered once. Leaves are left out on purpose: a canopy that
   * shoved the camera forward every time the traveler walked under the tree
   * would be worse than seeing through a leaf.
   */
  clearSightLine(focus: Vector3, wanted: Vector3, nearest: number): number {
    scratchDirection.copy(wanted).sub(focus);
    const reach = scratchDirection.length();
    if (reach < 1e-4) return reach;
    scratchDirection.divideScalar(reach);

    let allowed = reach;

    // the land, sampled along the line
    for (let i = 1; i <= SIGHT_SAMPLES; i++) {
      const along = (reach * i) / SIGHT_SAMPLES;
      scratchSample.copy(focus).addScaledVector(scratchDirection, along);
      const clearance = scratchSample.y - this.groundAtWorld(scratchSample);
      if (clearance < GROUND_SIGHT_MARGIN) {
        allowed = Math.min(allowed, along - GROUND_SIGHT_MARGIN);
        break;
      }
    }

    // and everything solid, traced
    const solid = this.solidThings();
    if (solid.length > 0) {
      sightRay.set(focus, scratchDirection);
      sightRay.far = reach;
      const hits = sightRay.intersectObjects(solid, false);
      const first = hits[0];
      if (first) allowed = Math.min(allowed, first.distance - SIGHT_PADDING);
    }

    return Math.max(nearest, Math.min(reach, allowed));
  }

  /**
   * One step. `viewYaw` is where the camera is pointing, so the keys mean
   * what they look like they mean: W goes into the screen whichever way the
   * traveler happens to be facing.
   */
  step(delta: number, input: WalkInput, viewYaw: number): void {
    const grounded = this.lift <= 0;

    const sinYaw = Math.sin(viewYaw);
    const cosYaw = Math.cos(viewYaw);
    let wishX = sinYaw * input.forward - cosYaw * input.right;
    let wishZ = cosYaw * input.forward + sinYaw * input.right;

    const wishLength = Math.hypot(wishX, wishZ);
    const asked = wishLength > 0;
    if (asked) {
      wishX /= wishLength;
      wishZ /= wishLength;
    }

    // Speed is docked while the body is still coming round to the direction
    // being asked for, so a turn is a turn rather than a slide sideways.
    let wanted = asked ? (input.run ? RUN_SPEED : WALK_SPEED) : 0;
    if (asked) {
      const facing = Math.sin(this.yaw) * wishX + Math.cos(this.yaw) * wishZ;
      wanted *= 1 - TURN_DRAG * (1 - Math.max(facing, 0));
    }

    const control = grounded ? 1 : AIR_CONTROL;
    const rate = (asked ? ACCELERATION : DECELERATION) * control;
    const ease = 1 - Math.exp(-delta * rate);
    this.velocity.x += (wishX * wanted - this.velocity.x) * ease;
    this.velocity.z += (wishZ * wanted - this.velocity.z) * ease;

    this.speed = Math.hypot(this.velocity.x, this.velocity.z);
    if (!asked && this.speed < STILL_SPEED) {
      this.velocity.x = 0;
      this.velocity.z = 0;
      this.speed = 0;
    }

    const position = this.traveler.position;
    const wasX = position.x;
    const wasZ = position.z;
    const standing = this.surface.getHeightAt(wasX, wasZ) + this.lift;
    position.x += this.velocity.x * delta;
    position.z += this.velocity.z * delta;
    this.holdInsideTheRim(position);
    this.keepOutOfSolidThings(position, wasX, wasZ, delta);

    // The body turns toward where it is going, quickly when it is barely
    // moving and lazily at a run — a sprinter's turning circle is wider.
    if (this.speed > STILL_SPEED || (asked && this.speed > 0)) {
      const heading = asked
        ? Math.atan2(wishX, wishZ)
        : Math.atan2(this.velocity.x, this.velocity.z);
      const pace = Math.min(this.speed / RUN_SPEED, 1);
      const turn = TURN_RATE_STANDING + (TURN_RATE_RUNNING - TURN_RATE_STANDING) * pace;
      this.yaw = turnToward(this.yaw, heading, 1 - Math.exp(-delta * turn));
    }

    this.applyLift(delta, input.jump, grounded);

    // The ground is climbed onto rather than snapped to: stepping up onto the
    // shelf is a rise of most of the traveler's own height, and taking it in
    // one frame reads as being teleported. Eased, it reads as clambering.
    const footing = this.standOn(position.x, position.z, standing);
    this.footing += (footing - this.footing) * (1 - Math.exp(-delta * FOOTING_SETTLE));
    if (Math.abs(footing - this.footing) < 0.005) this.footing = footing;
    position.y = this.footing + this.lift;
    this.settleOnTheSlope(delta, position);
    this.applyPose();
    this.traveler.setPace(this.speed, this.lift > 0);
  }

  /**
   * Off the ground gravity has the say; on it, the ground does. The lift is
   * kept separate from the terrain height so that walking off the top of a
   * mound mid-jump does not teleport the traveler down to meet it.
   */
  private applyLift(delta: number, jump: boolean, grounded: boolean): void {
    const pressed = jump && !this.jumpHeld;
    this.jumpHeld = jump;
    if (pressed) this.jumpBuffered = JUMP_BUFFER;
    else this.jumpBuffered = Math.max(0, this.jumpBuffered - delta);

    if (!grounded) {
      // letting go on the way up ends the climb early
      if (!jump && this.rise > 0) this.rise *= JUMP_CUT;

      this.rise -= GRAVITY * delta;
      this.lift += this.rise * delta;
      if (this.lift <= 0) {
        this.impact = Math.abs(this.rise);
        this.lift = 0;
        this.rise = 0;
      }
      return;
    }

    if (this.jumpBuffered > 0) {
      this.jumpBuffered = 0;
      this.rise = JUMP_SPEED;
      this.lift = 1e-4;
    }
  }

  /**
   * The rim is a cliff, and the cap overhangs it. Rather than let the walk
   * carry on into thin air, slide along the edge: the outward part of the
   * step is dropped and the rest of it is kept.
   */
  private holdInsideTheRim(position: Vector3): void {
    const distance = Math.hypot(position.x, position.z);
    if (distance < 1e-4) return;

    const dirX = position.x / distance;
    const dirZ = position.z / distance;
    const limit = this.surface.capRadiusAt(dirX, dirZ) * EDGE_MARGIN;
    if (distance <= limit) return;

    position.x = dirX * limit;
    position.z = dirZ * limit;

    const outward = this.velocity.x * dirX + this.velocity.z * dirZ;
    if (outward > 0) {
      this.velocity.x -= dirX * outward;
      this.velocity.z -= dirZ * outward;
    }
  }

  /**
   * Stand the traveler out of anything solid.
   *
   * Each blocker is grown by the traveler's own width and the point is pushed
   * to its edge — a wall of any kind is the same problem once you are only
   * asking "how do I get out of this shape the short way". Because the push
   * is perpendicular to the surface, the part of the step running along the
   * wall survives it, so walking into the cottage slides along the wall
   * rather than sticking to it.
   *
   * The velocity is then taken from the distance actually covered, not the
   * distance asked for, which stops the walk animation sprinting on the spot
   * against a wall.
   */
  private keepOutOfSolidThings(
    position: Vector3,
    wasX: number,
    wasZ: number,
    delta: number,
  ): void {
    if (this.blockers.length === 0 || delta <= 0) return;

    let moved = false;
    for (const blocker of this.blockers) {
      const grown =
        blocker.kind === 'box'
          ? {
              ...blocker,
              halfX: blocker.halfX + BODY_RADIUS,
              halfZ: blocker.halfZ + BODY_RADIUS,
            }
          : { ...blocker, radius: blocker.radius + BODY_RADIUS };
      if (pushOutOf(grown, position)) moved = true;
    }
    if (!moved) return;

    this.velocity.x = (position.x - wasX) / delta;
    this.velocity.z = (position.z - wasZ) / delta;
    this.speed = Math.hypot(this.velocity.x, this.velocity.z);
  }

  /**
   * The height of whatever the traveler is actually standing on.
   *
   * The spring outcrop is a shelf, not a wall: its top is a surface, and
   * walking *under* it was only ever possible because the ground beneath it
   * was the only thing being asked about. A ray dropped from head height
   * finds the shelf if it is there, and the higher of the two answers wins.
   */
  private standOn(x: number, z: number, standing: number): number {
    // Sampled around the whole footprint rather than under one point, and the
    // HIGHEST answer wins. A single sample puts the feet on whatever is
    // directly below the middle of the traveler, which at the edge of a rock
    // means half the body is inside the rock beside them. Standing on the
    // highest thing under any part of you is what keeps you on top of an edge
    // instead of in it.
    // The land is sampled across the whole footprint, because asking a height
    // field five times costs nothing. The ledge is traced once, at the middle:
    // five rays against a scanned rock is thousands of triangle tests a frame,
    // which is felt as a stutter exactly where the big rocks are.
    let highest = -Infinity;
    for (const [offsetX, offsetZ] of FOOTPRINT) {
      highest = Math.max(highest, this.surface.getHeightAt(x + offsetX, z + offsetZ));
    }
    const ledge = this.ledgeUnder(x, z, standing);
    return ledge === null ? highest : Math.max(highest, ledge);
  }

  /**
   * How high the ledge is over a point, or null where there is none. The ray
   * starts above the traveler's head and stops a little below their feet, so
   * only a surface they are actually on or about to meet can answer.
   */
  private ledgeUnder(x: number, z: number, standing: number): number | null {
    // Everything solid is stood on, not only the one shelf that was handed
    // over: the same list the camera traces against is every large rock on
    // the island, and a traveler who can walk onto one of them should be able
    // to walk onto any of them. Foliage and the small scatter are not in it,
    // so nothing is gained by stepping on a fern.
    const standable = this.standableThings();
    if (standable.length === 0) return null;

    scratchGround.set(x, standing + LEDGE_REACH_UP, z);
    this.island.localToWorld(scratchGround);
    ledgeRay.set(scratchGround, DOWN);
    ledgeRay.far = LEDGE_REACH_UP + LEDGE_REACH_DOWN;

    // Raycasting does not care whether a thing is visible, and the cottage's
    // interior is a whole room parked inside the hillside, hidden until you
    // step through the door. Left in, its floor is the highest surface for
    // several units around the cottage — and the traveler walks up onto it,
    // in mid-air, outside the house.
    const hits = ledgeRay.intersectObjects(standable, true);
    const first = hits.find((hit) => isShown(hit.object));
    if (!first) return null;

    scratchSample.copy(first.point);
    const top = this.island.worldToLocal(scratchSample).y;

    // Nothing is climbed in one step that a person could not climb. Without
    // this, a surface belonging to a building's upper storey — a porch beam,
    // a balcony edge — answers the ray and the traveler is stood on it, two
    // storeys up, unable to reach the door underneath.
    return top > standing + MAX_CLIMB ? null : top;
  }

  /** Let the hillside reach the body over a moment rather than at once. */
  private settleOnTheSlope(delta: number, position: Vector3): void {
    this.surface.getNormalAt(position.x, position.z, scratchNormal);
    this.groundNormal.lerp(scratchNormal, 1 - Math.exp(-delta * SLOPE_SETTLE)).normalize();
  }

  /** Face the walk, and lean with the hillside rather than through it. */
  private applyPose(): void {
    this.traveler.quaternion
      .setFromUnitVectors(UP, this.groundNormal)
      .slerp(scratchQuat.identity(), 1 - SLOPE_LEAN)
      .multiply(scratchYaw.setFromAxisAngle(UP, this.yaw));
  }

  /**
   * The things worth tracing a sight line against, gathered once.
   *
   * The ground is not among them — it is answered by the height field, which
   * is both exact and free. Nor is anything small enough to see past, or any
   * foliage: those are the alpha-tested materials, and they are precisely the
   * ones a camera may pass through without anybody minding.
   */
  /**
   * The subset of solid things you can stand on top of.
   *
   * The tree and the cottage are struck out. A ray dropped beside a trunk
   * hits the bark two metres up and answers "the ground is here" — and the
   * traveler is suddenly standing in the branches. Anything you are meant to
   * walk *around* has no top worth finding, so it is not asked.
   */
  private standableThings(): Mesh[] {
    if (this.standables) return this.standables;

    // Trunks and walls have no top worth finding. Neither has a fence rail or
    // a lamp post: they are long and tall enough to pass the size filter, so
    // a ray dropped beside one lands on the rail and stands the traveler in
    // mid-air next to it.
    // ("dressing" alone would be too broad — every prop on the island hangs
    // under hero-dressing, the rocks included, and those are stood on.)
    const goAround = /tree|house|trunk|branch|leaves|garden|fence|lamp|post|room/i;
    this.standables = this.solidThings().filter((mesh) => {
      for (let node: Object3D | null = mesh; node; node = node.parent) {
        if (goAround.test(node.name)) return false;
      }
      return true;
    });
    return this.standables;
  }

  private solidThings(): Mesh[] {
    if (this.obstacles) return this.obstacles;

    const skip = /grass|flower|root|pollen|water|river|fall|cloud|traveler|detail|small-rock/i;
    const found: Mesh[] = [];
    this.island.traverse((node) => {
      if (!(node instanceof Mesh) || found.length >= 64) return;
      if (skip.test(node.name)) return;

      const material = Array.isArray(node.material) ? node.material[0] : node.material;
      if (material instanceof MeshStandardMaterial && material.alphaTest > 0) return;

      const geometry = node.geometry;
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      const box = geometry.boundingBox;
      if (!box) return;
      // anything you could not hide a camera behind is not worth tracing —
      // measured at the size it is actually placed at, since the island's
      // props are scaled up hard from small source meshes
      const size = box.getSize(scratchSample).multiply(node.getWorldScale(scratchNormal));
      if (Math.max(size.x, size.z) < 0.9 || size.y < 0.6) return;

      found.push(node);
    });

    this.obstacles = found;
    return found;
  }
}

/** Whether an object and everything above it in the scene is visible. */
function isShown(object: Object3D): boolean {
  for (let node: Object3D | null = object; node; node = node.parent) {
    if (!node.visible) return false;
  }
  return true;
}

/** Shortest way round from `from` to `to`, eased by `t`. */
function turnToward(from: number, to: number, t: number): number {
  let difference = (to - from) % (Math.PI * 2);
  if (difference > Math.PI) difference -= Math.PI * 2;
  if (difference < -Math.PI) difference += Math.PI * 2;
  return from + difference * t;
}
