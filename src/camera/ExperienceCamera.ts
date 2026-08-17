import { CatmullRomCurve3, Quaternion, Vector2, Vector3, type PerspectiveCamera } from 'three';
import type { Time } from '../core/Time';
import { applyCameraBreath } from './cameraBreath';
import { CameraRig } from './CameraRig';
import { CAMERA_SHOTS } from './cameraShots';
import { ThirdPersonView, type ExploreTarget } from './thirdPersonView';

const INTRO_DURATION = 9;
const OVERLAY_CUE = 0.72;
const FLYIN_DURATION = 7;
const ARRIVAL_PAUSE = 1.1;
const HANDOFF_SECONDS = 2.2;

// Radians of turn per pixel of mouse travel. At the old 0.0042 a sweep of a
// 1920-wide screen spun you through some 460 degrees, which reads as the
// view being thrown rather than turned; this is a little over half that.
const LOOK_SENSITIVITY_X = 0.0019;
const LOOK_SENSITIVITY_Y = 0.0015;
// how quickly the camera catches up with the mouse — high enough to feel
// direct, low enough to absorb an uneven frame
const LOOK_FOLLOW_RATE = 26;
// a single event should never turn the view more than this many pixels'
// worth; drivers occasionally emit one huge delta on pointer capture
const MAX_LOOK_STEP = 110;

type Phase =
  | 'hold'
  | 'intro'
  | 'idle'
  | 'flyin'
  | 'pause'
  | 'journey'
  | 'transit'
  | 'interior'
  | 'explore';

const arrival = CAMERA_SHOTS[0]!;

// Landing poster frame: far out and low, aimed well above the island so it
// settles into the lower third with open sky for the title.
const LANDING_POSITION = new Vector3(58, 7, 88);
const LANDING_TARGET = new Vector3(0, 26, 0);

// The pre-title descent out of the empty sky into the poster frame.
const introPositions = new CatmullRomCurve3(
  [
    new Vector3(102, 46, 148),
    new Vector3(84, 28, 120),
    LANDING_POSITION.clone(),
  ],
  false,
  'centripetal',
);
const introTargets = new CatmullRomCurve3(
  [new Vector3(0, 18, 0), new Vector3(0, 23, 0), LANDING_TARGET.clone()],
  false,
  'centripetal',
);

// The Enter fly-in: one continuous dive from the poster frame down to the
// journey's arrival shot beside the tree and cottage.
const flyinPositions = new CatmullRomCurve3(
  [
    LANDING_POSITION.clone(),
    new Vector3(38, 7, 55),
    new Vector3(23, 4.5, 30),
    new Vector3(...arrival.position),
  ],
  false,
  'centripetal',
);
const flyinTargets = new CatmullRomCurve3(
  [
    LANDING_TARGET.clone(),
    new Vector3(0, 15, 0),
    new Vector3(0, 9, 0),
    new Vector3(...arrival.target),
  ],
  false,
  'centripetal',
);

function smootherstep(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

const scratchPosition = new Vector3();
const scratchTarget = new Vector3();
const scratchQuat = new Quaternion();

export class ExperienceCamera {
  /** Fired when the fly-in has landed and the scroll journey unlocks. */
  onJourneyStart: (() => void) | null = null;

  private phase: Phase = 'hold';
  private phaseTime = 0;
  private overlayCued = false;
  private enterQueued = false;
  private onOverlayCue: (() => void) | null = null;

  private rig: CameraRig | null = null;
  private handoff = 1;
  private readonly heldPosition = new Vector3();
  private readonly heldQuaternion = new Quaternion();

  // transit (door approach etc.) and interior state
  private readonly transitFromPos = new Vector3();
  private readonly transitFromTarget = new Vector3();
  private readonly transitToPos = new Vector3();
  private readonly transitToTarget = new Vector3();
  private transitSeconds = 2;
  private onTransitDone: (() => void) | null = null;
  private readonly interiorPos = new Vector3();
  private readonly interiorTarget = new Vector3();
  private readonly parallax = new Vector2();

  // interior first-person state: drag to look, WASD to walk. The look pair
  // is where the mouse has asked to point; the interior pair is where the
  // camera has actually got to, a frame or two behind.
  private interiorYaw = 0;
  private interiorPitch = 0;
  private lookYaw = 0;
  private lookPitch = 0;
  private interiorConstrain: ((position: Vector3) => void) | null = null;

  // third-person outdoor walking
  private exploreTarget: ExploreTarget | null = null;
  private onExploreExit: (() => void) | null = null;
  private exploring = false;
  private readonly view = new ThirdPersonView();

  private readonly keysDown = new Set<string>();
  private dragging = false;
  private lastPointerX = 0;
  private lastPointerY = 0;

  constructor(private readonly camera: PerspectiveCamera) {
    this.applyCurves(introPositions, introTargets, 0);

    window.addEventListener('pointermove', (event) => {
      this.parallax.x = (event.clientX / window.innerWidth) * 2 - 1;
      this.parallax.y = (event.clientY / window.innerHeight) * 2 - 1;

      if (this.isMouseLook() && !document.body.classList.contains('overlay-open')) {
        // pointer locked: the mouse steers the view directly, like a game;
        // unlocked (e.g. after Esc) falls back to drag-look
        if (document.pointerLockElement) {
          this.aimBy(event.movementX, event.movementY);
        } else if (this.dragging) {
          this.aimBy(event.clientX - this.lastPointerX, event.clientY - this.lastPointerY);
        }
      }
      this.lastPointerX = event.clientX;
      this.lastPointerY = event.clientY;
    });
    window.addEventListener('pointerdown', (event) => {
      this.dragging = true;
      this.lastPointerX = event.clientX;
      this.lastPointerY = event.clientY;
      // regain game-style mouse look after the browser released it (Esc),
      // but not while a story panel holds the cursor
      if (
        this.isMouseLook() &&
        !document.pointerLockElement &&
        !document.body.classList.contains('overlay-open')
      ) {
        this.requestPointerLock();
      }
    });
    window.addEventListener('pointerup', () => {
      this.dragging = false;
    });
    // Letting go of the mouse is how you stop walking the island. Esc both
    // releases the pointer and ends the walk — but the browser swallows the
    // key that released it, so the lock itself is what we listen to.
    document.addEventListener('pointerlockchange', () => {
      if (this.phase !== 'explore' || document.pointerLockElement) return;
      // The lock is released on the way *in*, too: leaving the cottage hands
      // the camera back before the walk picks up again, and that release
      // arrives a moment after it has. Only a release made once the visitor
      // is already walking means they let go.
      if (this.phaseTime > 0.4) this.leaveExplore();
    });
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.phase === 'explore') this.leaveExplore();
    });
    window.addEventListener('keydown', (event) => {
      // space is the jump; left to itself it would also work the page
      if (event.key === ' ' && this.phase === 'explore') event.preventDefault();
      this.keysDown.add(event.key.toLowerCase());
    });
    window.addEventListener('keyup', (event) => this.keysDown.delete(event.key.toLowerCase()));
    window.addEventListener('blur', () => this.keysDown.clear());
  }

  /** Starts the descent; `onOverlayCue` fires near the end for the title. */
  beginIntro(onOverlayCue: () => void): void {
    if (this.phase !== 'hold') return;
    this.setPhase('intro');
    this.onOverlayCue = onOverlayCue;
  }

  /**
   * The Enter interaction: one continuous fly-in toward the island. The
   * title appears a beat before the descent finishes, so a quick visitor
   * can press Enter mid-intro — remember it and leave as soon as the
   * descent lands, rather than dropping the click and stranding them.
   */
  enter(): void {
    if (this.phase === 'idle') this.setPhase('flyin');
    else if (this.phase === 'intro') this.enterQueued = true;
  }

  /** Glide from the current pose to an arbitrary pose (door approaches…). */
  flyTo(position: Vector3, target: Vector3, seconds: number, onDone?: () => void): void {
    this.transitFromPos.copy(this.camera.position);
    this.camera.getWorldDirection(this.transitFromTarget);
    this.transitFromTarget.multiplyScalar(10).add(this.camera.position);
    this.transitToPos.copy(position);
    this.transitToTarget.copy(target);
    this.transitSeconds = seconds;
    this.onTransitDone = onDone ?? null;
    this.setPhase('transit');
  }

  /** Place the camera inside the room; drag-look and WASD walking take over. */
  enterInterior(
    position: Vector3,
    target: Vector3,
    constrain?: (walkPosition: Vector3) => void,
  ): void {
    this.interiorPos.copy(position);
    this.interiorTarget.copy(target);
    this.interiorConstrain = constrain ?? null;

    scratchTarget.copy(target).sub(position).normalize();
    this.interiorYaw = Math.atan2(scratchTarget.x, scratchTarget.z);
    this.interiorPitch = Math.asin(scratchTarget.y);
    this.lookYaw = this.interiorYaw;
    this.lookPitch = this.interiorPitch;
    this.setPhase('interior');
    this.requestPointerLock();
  }

  /**
   * Take up station behind the traveler: the mouse swings the view around
   * them, WASD walks. The opening angle is whichever way they are already
   * facing, so taking control does not spin the world.
   */
  enterExplore(target: ExploreTarget, facing: number, onExit: () => void): void {
    this.exploreTarget = target;
    this.onExploreExit = onExit;
    this.exploring = true;
    this.interiorYaw = facing;
    this.lookYaw = facing;
    // a little above their shoulder, looking down the way they are going
    this.interiorPitch = -0.16;
    this.lookPitch = -0.16;

    // start where the camera already is, looking where it was looking, and
    // travel to the shoulder from there rather than cutting to it
    this.camera.getWorldDirection(scratchTarget);
    scratchTarget.multiplyScalar(12).add(this.camera.position);
    this.view.reset(this.camera.position, scratchTarget);
    this.setPhase('explore');
    this.requestPointerLock();
  }

  /** Hand the island back to the scroll journey. */
  private leaveExplore(): void {
    if (this.phase !== 'explore') return;
    const done = this.onExploreExit;
    this.exploreTarget = null;
    this.onExploreExit = null;
    this.exploring = false;
    // and actually hand the camera over. Letting go of the walk without this
    // leaves the phase stranded with nothing to follow: the walk stops, the
    // page scrolls again, and the view sits frozen where it was abandoned.
    this.resumeJourney();
    done?.();
  }

  /**
   * Whether walking is what the outdoors was doing. Stepping into the cottage
   * suspends the walk rather than ending it, so this stays true through the
   * whole visit and the door can put the visitor back on their feet.
   */
  get walkWasActive(): boolean {
    return this.exploring;
  }

  /** Phases where the mouse turns the view rather than parallaxing it. */
  private isMouseLook(): boolean {
    return this.phase === 'interior' || this.phase === 'explore';
  }

  /**
   * Turn the head. The mouse sets where the view is *going*; update() eases
   * the camera toward it, which takes the jitter out of uneven pointer
   * deltas and stops a dropped frame from reading as a jolt. Large single
   * deltas are clipped: some drivers deliver a spike on the first event
   * after the pointer is captured, which otherwise whips the view around.
   */
  private aimBy(deltaX: number, deltaY: number): void {
    const clip = (value: number): number => Math.max(-MAX_LOOK_STEP, Math.min(MAX_LOOK_STEP, value));
    this.lookYaw -= clip(deltaX) * LOOK_SENSITIVITY_X;
    this.lookPitch = Math.min(
      Math.max(this.lookPitch - clip(deltaY) * LOOK_SENSITIVITY_Y, -0.7),
      0.7,
    );
  }

  /** Capture the mouse for game-style look (silently ignored if denied). */
  private requestPointerLock(): void {
    const canvas = document.querySelector<HTMLCanvasElement>('#webgl');
    if (!canvas || document.pointerLockElement) return;
    try {
      const result = canvas.requestPointerLock() as unknown;
      if (result instanceof Promise) result.catch(() => undefined);
    } catch {
      // pointer lock is a nicety — drag-look still works without it
    }
  }

  /** Return control to the scroll journey from wherever the camera is. */
  resumeJourney(): void {
    if (document.pointerLockElement) document.exitPointerLock();
    window.scrollTo(0, 0);
    this.heldPosition.copy(this.camera.position);
    this.heldQuaternion.copy(this.camera.quaternion);
    this.handoff = 0;
    if (!this.rig) this.rig = new CameraRig(this.camera);
    this.setPhase('journey');
  }

  update(time: Time): void {
    this.phaseTime += time.delta;

    switch (this.phase) {
      case 'hold':
        this.applyCurves(introPositions, introTargets, 0);
        break;

      case 'intro': {
        const t = Math.min(this.phaseTime / INTRO_DURATION, 1);
        this.applyCurves(introPositions, introTargets, smootherstep(t));

        if (!this.overlayCued && t >= OVERLAY_CUE) {
          this.overlayCued = true;
          this.onOverlayCue?.();
        }
        if (t >= 1) this.setPhase(this.enterQueued ? 'flyin' : 'idle');
        break;
      }

      case 'idle':
        this.applyCurves(introPositions, introTargets, 1);
        break;

      case 'flyin': {
        const t = Math.min(this.phaseTime / FLYIN_DURATION, 1);
        this.applyCurves(flyinPositions, flyinTargets, smootherstep(t));
        if (t >= 1) this.setPhase('pause');
        break;
      }

      case 'pause':
        this.applyCurves(flyinPositions, flyinTargets, 1);
        if (this.phaseTime >= ARRIVAL_PAUSE) this.beginJourney();
        break;

      case 'transit': {
        const t = smootherstep(Math.min(this.phaseTime / this.transitSeconds, 1));
        scratchPosition.lerpVectors(this.transitFromPos, this.transitToPos, t);
        scratchTarget.lerpVectors(this.transitFromTarget, this.transitToTarget, t);
        this.camera.position.copy(scratchPosition);
        this.camera.lookAt(scratchTarget);
        if (this.phaseTime >= this.transitSeconds && this.onTransitDone) {
          const done = this.onTransitDone;
          this.onTransitDone = null;
          done();
        }
        break;
      }

      case 'interior': {
        // first-person: drag to look, WASD/arrows to walk, eye height locked
        // (all input pauses while a story panel is open)
        const paused = document.body.classList.contains('overlay-open');
        const keys = paused ? new Set<string>() : this.keysDown;
        const forwardIn =
          (keys.has('w') || keys.has('arrowup') ? 1 : 0) -
          (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
        const rightIn =
          (keys.has('d') || keys.has('arrowright') ? 1 : 0) -
          (keys.has('a') || keys.has('arrowleft') ? 1 : 0);

        if (forwardIn !== 0 || rightIn !== 0) {
          // world-space speed tuned for the 0.72-scaled interior
          const speed = 1.55 * time.delta;
          const sinYaw = Math.sin(this.interiorYaw);
          const cosYaw = Math.cos(this.interiorYaw);
          this.interiorPos.x += (sinYaw * forwardIn - cosYaw * rightIn) * speed;
          this.interiorPos.z += (cosYaw * forwardIn + sinYaw * rightIn) * speed;
        }
        // constrain every frame: floor height (stairs, loft) eases toward its
        // target even while standing still
        this.interiorConstrain?.(this.interiorPos);

        // ease the head toward where the mouse asked to point, framerate
        // independent so it feels the same at 30 frames as at 60
        const follow = 1 - Math.exp(-time.delta * LOOK_FOLLOW_RATE);
        this.interiorYaw += (this.lookYaw - this.interiorYaw) * follow;
        this.interiorPitch += (this.lookPitch - this.interiorPitch) * follow;

        this.camera.position.copy(this.interiorPos);
        scratchTarget
          .set(
            Math.sin(this.interiorYaw) * Math.cos(this.interiorPitch),
            Math.sin(this.interiorPitch),
            Math.cos(this.interiorYaw) * Math.cos(this.interiorPitch),
          )
          .multiplyScalar(5)
          .add(this.interiorPos);
        this.camera.lookAt(scratchTarget);
        // no idle sway indoors: the visitor is the one standing here, and a
        // breathing camera reads as unsteadiness rather than life
        return;
      }

      case 'explore': {
        const target = this.exploreTarget;
        if (!target) return;

        // ease the view first, then walk: the keys are read against where
        // the camera has actually got to, so W goes where the screen looks
        const follow = 1 - Math.exp(-time.delta * LOOK_FOLLOW_RATE);
        this.interiorYaw += (this.lookYaw - this.interiorYaw) * follow;
        this.interiorPitch += (this.lookPitch - this.interiorPitch) * follow;

        const paused = document.body.classList.contains('overlay-open');
        const keys = paused ? new Set<string>() : this.keysDown;
        target.step(
          time.delta,
          {
            forward:
              (keys.has('w') || keys.has('arrowup') ? 1 : 0) -
              (keys.has('s') || keys.has('arrowdown') ? 1 : 0),
            right:
              (keys.has('d') || keys.has('arrowright') ? 1 : 0) -
              (keys.has('a') || keys.has('arrowleft') ? 1 : 0),
            run: keys.has('shift'),
            jump: keys.has(' '),
          },
          this.interiorYaw,
        );

        this.view.update(target, this.interiorYaw, this.interiorPitch, time.delta);
        this.camera.position.copy(this.view.position);
        this.camera.lookAt(this.view.lookAt);
        // the walk supplies all the movement this shot needs
        return;
      }

      case 'journey': {
        this.rig!.update(time);
        if (this.handoff < 1) {
          this.handoff = Math.min(this.handoff + time.delta / HANDOFF_SECONDS, 1);
          const w = smootherstep(this.handoff);
          scratchPosition.copy(this.camera.position);
          scratchQuat.copy(this.camera.quaternion);
          this.camera.position.copy(this.heldPosition).lerp(scratchPosition, w);
          this.camera.quaternion.copy(this.heldQuaternion).slerp(scratchQuat, w);
        }
        return;
      }
    }

    applyCameraBreath(this.camera, time.elapsed);
  }

  private beginJourney(): void {
    this.setPhase('journey');
    window.scrollTo(0, 0);
    this.heldPosition.copy(this.camera.position);
    this.heldQuaternion.copy(this.camera.quaternion);
    this.handoff = 0;
    this.rig = new CameraRig(this.camera);
    this.onJourneyStart?.();
  }

  private setPhase(phase: Phase): void {
    this.phase = phase;
    this.phaseTime = 0;
  }

  private applyCurves(positions: CatmullRomCurve3, targets: CatmullRomCurve3, t: number): void {
    positions.getPoint(t, scratchPosition);
    targets.getPoint(t, scratchTarget);
    this.camera.position.copy(scratchPosition);
    this.camera.lookAt(scratchTarget);
  }
}
