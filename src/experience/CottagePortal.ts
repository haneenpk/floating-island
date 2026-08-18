import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  PointLight,
  Vector3,
  type Object3D,
} from 'three';
import type { AudioSystem } from '../audio/AudioSystem';
import type { ExperienceCamera } from '../camera/ExperienceCamera';
import type { Time } from '../core/Time';
import type { InteractionManager } from '../interaction/InteractionManager';
import type { FloatingIsland } from '../scene/islands/FloatingIsland';
import type { CottageRoom } from '../scene/interior/CottageRoom';
import type { Updatable } from '../scene/Updatable';
import type { FadeOverlay } from '../ui/FadeOverlay';

// Matches the house placement in HeroIslandComposition.
const HOUSE_RADIAL = 0.44;
const HOUSE_ANGLE = 6.05;
const HOUSE_YAW = 0.67;

/**
 * The doorway between worlds: a glowing threshold on the cottage, the
 * camera approach, a breath of black, and the room on the other side.
 */
export class CottagePortal implements Updatable {
  private readonly doorWorld = new Vector3();
  private busy = false;
  private houseDoor: { pivot: Group; open: number; target: number } | null = null;
  private doorGlow!: PointLight;

  constructor(
    private readonly island: FloatingIsland,
    private readonly house: Group,
    private readonly smoke: Object3D,
    private readonly room: CottageRoom,
    private readonly experience: ExperienceCamera,
    private readonly interaction: InteractionManager,
    private readonly fade: FadeOverlay,
    // exterior objects that would clip into the room volume while inside
    private readonly alsoHide: Object3D[] = [],
    private readonly audio: AudioSystem | null = null,
    // notified behind the fades: true entering the room, false leaving
    private readonly onWorldSwap: ((inside: boolean) => void) | null = null,
    // called once the visitor is back outside and the camera has been handed
    // over, so the outdoors can pick up whatever it was doing before
    private readonly onBackOutside: (() => void) | null = null,
  ) {
    const surface = island.surface;
    const dirX = Math.cos(HOUSE_ANGLE);
    const dirZ = Math.sin(HOUSE_ANGLE);
    const planar = surface.capRadiusAt(dirX, dirZ) * HOUSE_RADIAL;
    const hx = dirX * planar;
    const hz = dirZ * planar;
    const forwardX = Math.sin(HOUSE_YAW);
    const forwardZ = Math.cos(HOUSE_YAW);
    this.doorWorld.set(
      hx + forwardX * 2.0,
      surface.getHeightAt(hx, hz) + 1.15,
      hz + forwardZ * 2.0,
    );

    // invisible hit volume over the threshold; the model's own door mesh
    // (found by name) carries the hover glow
    const hit = new Mesh(
      new BoxGeometry(1.8, 2.6, 1.4),
      new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    );
    hit.position.copy(this.doorWorld);
    island.add(hit);

    this.tryFindDoor(house);

    this.interaction.register(
      hit,
      'exterior',
      'enter the cottage',
      () => void this.enter(),
      this.houseDoor ? this.houseDoor.pivot : hit,
      true,
      // Arm's length from the threshold. This reached seventy units once,
      // from when the cottage was approached by scrolling a camera at it, then
      // five while the walk was new — but a door that offers itself from
      // halfway across the garden is a label, not an invitation. You have to
      // be standing at it.
      2.4,
      // And only from the step. Walking round the back of a cottage should
      // not offer you its front door through the wall — you have to be
      // standing where the door is, facing it.
      { x: forwardX, z: forwardZ, minDot: 0.6 },
    );

    // warmth spilling around the threshold, breathing with the same slow
    // rhythm as the door's glow — an invitation rather than a marker
    this.doorGlow = new PointLight(0xffb45c, 0, 4.6, 2);
    this.doorGlow.position.copy(this.doorWorld).add(new Vector3(0, -0.2, 0));
    island.add(this.doorGlow);

    const exitHit = new Mesh(
      new BoxGeometry(1.4, 2.4, 0.6),
      new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    );
    exitHit.position.copy(room.getExitDoorWorld());
    room.attach(exitHit);
    this.interaction.register(
      exitHit,
      'interior',
      'return outside',
      () => void this.exit(),
      exitHit,
      false,
      2.4,
    );
    this.interaction.setGroupEnabled('interior', false);
  }

  update(time: Time): void {
    if (this.houseDoor) {
      const door = this.houseDoor;
      door.open += (door.target - door.open) * (1 - Math.exp(-time.delta * 4));
      door.pivot.rotation.y = door.open * -1.7;
    }

    // lit only while the door can actually be entered
    const inviting = this.room.visible ? 0 : 1;
    const breath = 0.55 + Math.sin(time.elapsed * 1.6) * 0.45;
    this.doorGlow.intensity += (inviting * (0.9 + breath * 0.7) - this.doorGlow.intensity) * 0.05;
  }

  private async enter(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.interaction.setGroupEnabled('exterior', false);
    document.documentElement.style.overflow = 'hidden';

    if (this.houseDoor) this.houseDoor.target = 1;

    const island = this.island;
    const approach = this.doorWorld.clone().applyMatrix4(island.matrixWorld);
    const outward = new Vector3(Math.sin(HOUSE_YAW), 0, Math.cos(HOUSE_YAW));
    const from = approach.clone().add(outward.multiplyScalar(3.4)).add(new Vector3(0, 0.4, 0));

    this.experience.flyTo(from, approach, 2.6, () => {
      void (async () => {
        await this.fade.toBlack(0.65);
        // swap worlds behind the black: interior in, exterior shell out,
        // drift frozen so the room stays still underfoot
        this.island.driftPaused = true;
        this.room.visible = true;
        this.house.visible = false;
        this.smoke.visible = false;
        for (const object of this.alsoHide) object.visible = false;
        this.audio?.setIndoor(true, this.room.getWindowWorld());
        this.onWorldSwap?.(true);
        this.room.updateMatrixWorld(true);
        const pose = this.room.getCameraPose();
        this.experience.enterInterior(pose.position, pose.target, this.room.getWalkConstraint());
        this.interaction.setGroupEnabled('interior', true);
        if (this.houseDoor) this.houseDoor.target = 0;
        await this.fade.toClear(0.9);
        // long enough to read a list of four controls, twice
        this.interaction.announce(
          'move the mouse to look — w a s d to walk — E to interact — M for sound',
          6.5,
        );
        this.busy = false;
      })();
    });
  }

  private async exit(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.interaction.setGroupEnabled('interior', false);

    await this.fade.toBlack(0.6);
    this.room.visible = false;
    this.house.visible = true;
    this.smoke.visible = true;
    for (const object of this.alsoHide) object.visible = true;
    this.audio?.setIndoor(false);
    this.onWorldSwap?.(false);
    this.island.driftPaused = false;
    this.experience.resumeJourney();
    document.documentElement.style.overflow = '';
    this.interaction.setGroupEnabled('exterior', true);
    // whatever was happening out here before the door opened — the traveler's
    // walk, most likely — gets to resume before the fade lifts
    this.onBackOutside?.();
    await this.fade.toClear(0.9);
    this.busy = false;
  }

  /** If the GLB names its door, give it a hinge so it can swing open. */
  private tryFindDoor(house: Group): void {
    house.traverse((child) => {
      if (this.houseDoor || !(child instanceof Mesh)) return;
      if (!/door/i.test(child.name)) return;

      const pivot = new Group();
      child.parent?.add(pivot);
      pivot.position.copy(child.position);
      pivot.attach(child);
      this.houseDoor = { pivot, open: 0, target: 0 };
    });
  }
}
