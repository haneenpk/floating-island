import { CatmullRomCurve3, Quaternion, Vector2, Vector3, type PerspectiveCamera } from 'three';
import type { Time } from '../core/Time';
import { applyCameraBreath } from './cameraBreath';
import { CameraRig } from './CameraRig';
import { CAMERA_SHOTS } from './cameraShots';

const INTRO_DURATION = 9;
const OVERLAY_CUE = 0.72;
const FLYIN_DURATION = 7;
const ARRIVAL_PAUSE = 1.1;
const HANDOFF_SECONDS = 2.2;

type Phase = 'hold' | 'intro' | 'idle' | 'flyin' | 'pause' | 'journey' | 'transit' | 'interior';

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

  // interior first-person state: drag to look, WASD to walk
  private interiorYaw = 0;
  private interiorPitch = 0;
  private interiorConstrain: ((position: Vector3) => void) | null = null;
  private readonly keysDown = new Set<string>();
  private dragging = false;
  private lastPointerX = 0;
  private lastPointerY = 0;

  constructor(private readonly camera: PerspectiveCamera) {
    this.applyCurves(introPositions, introTargets, 0);

    window.addEventListener('pointermove', (event) => {
      this.parallax.x = (event.clientX / window.innerWidth) * 2 - 1;
      this.parallax.y = (event.clientY / window.innerHeight) * 2 - 1;

      if (this.phase === 'interior') {
        // pointer locked: the mouse steers the view directly, like a game;
        // unlocked (e.g. after Esc) falls back to drag-look
        if (document.pointerLockElement) {
          this.interiorYaw -= event.movementX * 0.0042;
          this.interiorPitch = Math.min(
            Math.max(this.interiorPitch - event.movementY * 0.0032, -0.7),
            0.7,
          );
        } else if (this.dragging) {
          this.interiorYaw -= (event.clientX - this.lastPointerX) * 0.0042;
          this.interiorPitch = Math.min(
            Math.max(this.interiorPitch - (event.clientY - this.lastPointerY) * 0.0032, -0.7),
            0.7,
          );
        }
      }
      this.lastPointerX = event.clientX;
      this.lastPointerY = event.clientY;
    });
    window.addEventListener('pointerdown', (event) => {
      this.dragging = true;
      this.lastPointerX = event.clientX;
      this.lastPointerY = event.clientY;
      // regain game-style mouse look after the browser released it (Esc)
      if (this.phase === 'interior' && !document.pointerLockElement) {
        this.requestPointerLock();
      }
    });
    window.addEventListener('pointerup', () => {
      this.dragging = false;
    });
    window.addEventListener('keydown', (event) => this.keysDown.add(event.key.toLowerCase()));
    window.addEventListener('keyup', (event) => this.keysDown.delete(event.key.toLowerCase()));
    window.addEventListener('blur', () => this.keysDown.clear());
  }

  /** Starts the descent; `onOverlayCue` fires near the end for the title. */
  beginIntro(onOverlayCue: () => void): void {
    if (this.phase !== 'hold') return;
    this.setPhase('intro');
    this.onOverlayCue = onOverlayCue;
  }

  /** The Enter interaction: one continuous fly-in toward the island. */
  enter(): void {
    if (this.phase !== 'idle') return;
    this.setPhase('flyin');
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
    this.setPhase('interior');
    this.requestPointerLock();
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
        if (t >= 1) this.setPhase('idle');
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
        const keys = this.keysDown;
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
        break;
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
