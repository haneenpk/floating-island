import {
  AnimationMixer,
  Box3,
  BoxGeometry,
  CylinderGeometry,
  Group,
  LoopOnce,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PointLight,
  Quaternion,
  SphereGeometry,
  Vector3,
  type AnimationAction,
} from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { getQuality } from '../../core/Quality';
import type { Time } from '../../core/Time';
import type { Updatable } from '../Updatable';
import { recolourCostume, type CellColour } from './travelerPalette';

/**
 * Standing height in world units.
 *
 * The cottage is the ruler: its doorway measures about 1.9, against a stone
 * base of a known 2.94. This leaves the traveler well under half that — small
 * against their own island, which is the reading the world wants. Everything
 * else here is written as a fraction of it, so the walk, the jump and the
 * camera all move with it if it changes again.
 */
export const TRAVELER_HEIGHT = 0.9;
/** Ground speed the walk cycle is authored for, in world units a second. */
export const WALK_SPEED = 1.3;
/** Ground speed at full run. */
export const RUN_SPEED = 2.5;

// The pack ships the rogue armed. None of it is wanted here: the traveler
// carries a staff, a lantern and a pack, and nothing that could be swung.
const STOWED = ['Knife', 'Knife_Offhand', '1H_Crossbow', '2H_Crossbow', 'Throwable'];

// The pack's proportions are chibi — the hood alone is nearly half the figure.
// Drawing the head bone in gives a modest, adult silhouette without touching
// the mesh or the rig.
const HEAD_SCALE = 0.74;

// The hollow left where the face was, in the model's own space. The cloth
// runs x +-0.55, y 1.20 -> 2.25, z -0.57 -> 0.59, and this sits just inside
// it: big enough that the opening is full of dark from any angle, small
// enough that it never comes through the hood.
const HOOD_CENTRE = new Vector3(0, 1.62, 0.02);
const HOOD_FILL = new Vector3(0.45, 0.42, 0.48);

/**
 * The traveler's costume, cell by cell on the character sheet.
 *
 * Which cell dresses what was read off the model rather than guessed: every
 * triangle was sampled against the sheet and counted per mesh. The hood and
 * the cloak draw from one cell alone, the tunic and sleeves from another, and
 * the leather from three more.
 */
const COSTUME: CellColour[] = [
  { column: 1, row: 1, colour: 0x3f5c93 }, // hood, cloak, shoulder mantle
  { column: 0, row: 1, colour: 0xd8ccae }, // tunic and sleeves, undyed cream
  { column: 7, row: 1, colour: 0x3b3b46 }, // trousers, near-charcoal
  { column: 3, row: 2, colour: 0x7a5334 }, // boots
  { column: 5, row: 2, colour: 0x6f4a2e }, // gloves and bracers
  { column: 5, row: 0, colour: 0x8a6039 }, // lighter straps
  { column: 6, row: 0, colour: 0x5f3f27 }, // belts
  { column: 3, row: 0, colour: 0xc9a24a }, // buckles and fittings, brass
  { column: 0, row: 0, colour: 0x6b4a30 }, // what little skin was left
];

// where the idle gives way to the walk, and how fast one gait reaches another
const STARTING_TO_WALK = 0.08;
const BLEND_RATE = 12;

const LEATHER = 0x6f4a2e;
const STRAP = 0x4a3220;
const CANVAS_CLOTH = 0xcfc3a6;
const WOOD = 0x7a5c3a;
const BRASS = 0xc9a24a;
const LANTERN_GLOW = 0xffc477;

const scratchQuat = new Quaternion();
const scratchUpright = new Quaternion();
const scratchBox = new Box3();
const scratchPoint = new Vector3();

// the staff is not held plumb — it leans back a little, as a stick does when
// it is being walked with rather than stood on
const STAFF_LEAN = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0.1);

/**
 * The one figure walking the island: a hooded traveler, faceless by
 * construction, carrying a staff, a lantern and a pack.
 *
 * The model is CC0 (see the model folder's SOURCE.txt) and arrives as a green
 * rogue with a face inside its hood. The face is gone from the file itself
 * rather than hidden — there is no lighting condition under which a feature
 * can appear, because the geometry is not there — and the costume is
 * repainted cell by cell off the character sheet.
 */
export class Traveler extends Group implements Updatable {
  /** World-space height, once scaled — the camera frames off this. */
  readonly height = TRAVELER_HEIGHT;
  /**
   * A plain column standing in for the figure when the cursor asks what it
   * is pointing at. Hovering the skinned meshes themselves means posing the
   * whole skeleton on every pointer move, for an answer no more useful.
   */
  readonly hitArea: Mesh;

  private readonly mixer: AnimationMixer;
  private readonly idle: AnimationAction | undefined;
  private readonly walk: AnimationAction | undefined;
  private readonly run: AnimationAction | undefined;
  private readonly leap: AnimationAction | undefined;
  private readonly fall: AnimationAction | undefined;
  private staff: Group | undefined;
  private pace = 0;
  private airborne = false;

  constructor(gltf: GLTF) {
    super();
    this.name = 'traveler';

    const rig = gltf.scene;
    this.add(rig);

    for (const name of STOWED) {
      const held = rig.getObjectByName(name);
      if (held) held.visible = false;
    }
    this.wearTheCostume(rig);

    // Every offset below is written in the model's own space, so the figure
    // is measured and dressed at scale 1 and only sized to the island after.
    this.updateMatrixWorld(true);

    scratchBox.makeEmpty();
    rig.traverse((child) => {
      if (child instanceof Mesh && child.name.startsWith('Rogue_')) {
        scratchBox.expandByObject(child);
      }
    });
    const crown = scratchBox.max.y;

    const head = findBone(rig, 'head');
    const chest = findBone(rig, 'chest', 'spine');
    const hips = findBone(rig, 'hips');
    const hand = findBone(rig, 'handslot.r', 'handslot.l');
    if (head) this.closeTheHood(head);
    if (chest) this.addPack(chest);
    if (hips) this.addSatchel(hips);
    if (hand) this.addStaff(hand);

    // The hood draws in about the neck joint, so everything below the head
    // bone keeps its size and everything above it shrinks — which is the
    // whole height, since the feet sit at y = 0.
    let modelHeight = crown;
    if (head) {
      const neck = head.getWorldPosition(scratchPoint).y;
      head.scale.setScalar(HEAD_SCALE);
      modelHeight = neck + (crown - neck) * HEAD_SCALE;
    }
    this.scale.setScalar(TRAVELER_HEIGHT / modelHeight);

    // sized in the model's space, so it rides the same scale as the figure
    this.hitArea = new Mesh(
      new BoxGeometry(1, modelHeight, 1),
      new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    );
    this.hitArea.name = 'traveler-hit-area';
    this.hitArea.position.y = modelHeight / 2;
    this.add(this.hitArea);

    // a moving figure needs its shadow redrawn every frame, which only the
    // tier with dynamic shadows pays for
    const casts = getQuality().dynamicShadows;
    rig.traverse((child) => {
      if (child instanceof Mesh) child.castShadow = casts;
    });

    this.mixer = new AnimationMixer(rig);
    // Idle and the walk cycle both write head.scale every frame, which would
    // undo the slimming above; the head's own animation is a constant 1.
    for (const clip of gltf.animations) {
      clip.tracks = clip.tracks.filter((track) => track.name !== 'head.scale');
    }
    this.idle = this.play(gltf, 'Idle', 1);
    this.walk = this.play(gltf, 'Walking_A', 0);
    this.run = this.play(gltf, 'Running_A', 0);
    this.fall = this.play(gltf, 'Jump_Idle', 0);
    this.leap = this.play(gltf, 'Jump_Full_Long', 0);
    if (this.leap) {
      this.leap.setLoop(LoopOnce, 1);
      this.leap.clampWhenFinished = true;
    }
  }

  /**
   * Stand still, now, with no blending from whatever was playing.
   *
   * The weights are eased toward their mark every frame, which is right while
   * walking and wrong the moment the traveler is placed: they would spend the
   * first half second of the arrival shot easing out of a leap or a stride
   * they never took. Called when they are put somewhere rather than when they
   * move.
   */
  standStill(): void {
    this.pace = 0;
    this.airborne = false;
    for (const action of [this.walk, this.run, this.leap, this.fall]) {
      if (!action) continue;
      action.weight = 0;
      action.time = 0;
    }
    if (this.idle) {
      this.idle.weight = 1;
      this.idle.time = 0;
    }
    this.mixer.update(0);
  }

  /**
   * How fast the ground is going by, in world units a second, and whether
   * there is any ground underfoot at all. The gait follows from the pair.
   */
  setPace(speed: number, airborne: boolean): void {
    if (airborne && !this.airborne) this.leap?.reset().play();
    this.airborne = airborne;
    this.pace = speed;
  }

  update(time: Time): void {
    const speed = this.pace;

    let idleWeight = 0;
    let walkWeight = 0;
    let runWeight = 0;
    let leapWeight = 0;
    let fallWeight = 0;

    if (this.airborne) {
      // the leap plays once; if the drop outlasts it, hold the falling pose
      const leapDone = !this.leap || this.leap.time >= this.leap.getClip().duration - 0.05;
      leapWeight = leapDone ? 0 : 1;
      fallWeight = leapDone ? 1 : 0;
    } else if (speed <= STARTING_TO_WALK) {
      idleWeight = 1;
    } else if (speed < WALK_SPEED) {
      // eased rather than straight: a linear ramp out of the idle makes the
      // first step read as a fade between two poses instead of a step
      walkWeight = smoothstep(STARTING_TO_WALK, WALK_SPEED, speed);
      idleWeight = 1 - walkWeight;
    } else {
      runWeight = Math.min((speed - WALK_SPEED) / (RUN_SPEED - WALK_SPEED), 1);
      walkWeight = 1 - runWeight;
    }

    // Weights are eased toward their mark rather than set to it. The speed
    // they follow is already smooth, but landing and taking off are not, and
    // an abrupt weight change shows up as the whole skeleton snapping.
    const settle = 1 - Math.exp(-time.delta * BLEND_RATE);
    this.blend(this.idle, idleWeight, settle);
    this.blend(this.leap, leapWeight, this.airborne ? 1 : settle);
    this.blend(this.fall, fallWeight, settle);
    this.blend(this.walk, walkWeight, settle);
    this.blend(this.run, runWeight, settle);

    if (this.walk) this.walk.timeScale = clamp(speed / WALK_SPEED, 0.7, 1.45);
    if (this.run) this.run.timeScale = clamp(speed / RUN_SPEED, 0.75, 1.3);
    this.matchStride();

    this.mixer.update(time.delta);
    this.steadyTheStaff();
  }

  private blend(action: AnimationAction | undefined, goal: number, ease: number): void {
    if (!action) return;
    action.weight += (goal - action.weight) * ease;
  }

  /**
   * Hold the walk and the run at the same point in their cycles.
   *
   * They are different lengths, so left over to themselves they drift apart,
   * and the moment they are both part-weighted the traveler is putting two
   * feet forward at once — which reads as a stumble every time the pace
   * crosses from one into the other. Whichever is carrying less of the pose
   * is the one moved.
   */
  private matchStride(): void {
    const walk = this.walk;
    const run = this.run;
    if (!walk || !run || walk.weight <= 0.001 || run.weight <= 0.001) return;

    const leader = walk.weight >= run.weight ? walk : run;
    const follower = leader === walk ? run : walk;
    const phase = (leader.time / leader.getClip().duration) % 1;
    follower.time = phase * follower.getClip().duration;
  }

  private play(gltf: GLTF, name: string, weight: number): AnimationAction | undefined {
    const clip = gltf.animations.find((candidate) => candidate.name === name);
    if (!clip) {
      console.warn(`[traveler] animation "${name}" is missing from the model`);
      return undefined;
    }
    const action = this.mixer.clipAction(clip);
    action.weight = weight;
    action.play();
    return action;
  }

  /** Repaint the character sheet and hand every mesh the new one. */
  private wearTheCostume(rig: Object3D): void {
    let dressed: MeshStandardMaterial | null = null;

    rig.traverse((child) => {
      if (!(child instanceof Mesh)) return;
      const worn = child.material;
      if (!(worn instanceof MeshStandardMaterial) || !worn.map) return;

      if (!dressed) {
        const repainted = recolourCostume(worn.map, COSTUME);
        if (!repainted) return;
        dressed = worn.clone();
        dressed.map = repainted;
        dressed.name = 'traveler-costume';
        // the cloth is cloth: nothing on this figure should catch a highlight
        dressed.roughness = 0.92;
        dressed.metalness = 0;
      }
      child.material = dressed;
    });
  }

  /**
   * Fill the hood with dark.
   *
   * The face is not in the model at all (see scripts/unface-model.mjs), which
   * leaves the hood an open shell — you would see the sky through it. This
   * fills the hollow with an unlit black form: not a shadow that the sun
   * could find its way into, but a surface that takes no light at any hour.
   */
  private closeTheHood(head: Object3D): void {
    const anchor = this.anchorTo(head, HOOD_CENTRE);
    const hollow = new Mesh(
      new SphereGeometry(1, 14, 10),
      new MeshBasicMaterial({ color: 0x0a0910 }),
    );
    hollow.name = 'traveler-hood-void';
    hollow.scale.copy(HOOD_FILL);
    hollow.castShadow = false;
    hollow.receiveShadow = false;
    anchor.add(hollow);
  }

  /**
   * The pack on their back, with the bedroll strapped across the top of it.
   * It rides behind the cloak rather than under it, which is both how the
   * reference wears it and the only way it can be seen at all.
   */
  private addPack(chest: Object3D): void {
    const anchor = this.anchorTo(chest, new Vector3(0, 0.92, -0.34));
    anchor.name = 'traveler-pack';
    const leather = new MeshStandardMaterial({ color: LEATHER, roughness: 0.85, metalness: 0 });
    const strap = new MeshStandardMaterial({ color: STRAP, roughness: 0.9, metalness: 0 });
    const canvas = new MeshStandardMaterial({ color: CANVAS_CLOTH, roughness: 0.95, metalness: 0 });
    const brass = new MeshStandardMaterial({ color: BRASS, roughness: 0.5, metalness: 0.6 });

    const body = new Mesh(new BoxGeometry(0.52, 0.46, 0.28), leather);
    anchor.add(body);

    // the flap over the top, a shade darker
    const flap = new Mesh(new BoxGeometry(0.54, 0.16, 0.3), strap);
    flap.position.y = 0.19;
    anchor.add(flap);

    // the bedroll, laid across the top and lashed down
    const roll = new Mesh(new CylinderGeometry(0.11, 0.11, 0.58, 8), canvas);
    roll.rotation.z = Math.PI / 2;
    roll.position.set(0, 0.33, -0.02);
    anchor.add(roll);

    for (const side of [-0.16, 0.16]) {
      const lash = new Mesh(new BoxGeometry(0.05, 0.34, 0.32), strap);
      lash.position.set(side, 0.26, 0);
      anchor.add(lash);

      // the shoulder strap, running forward over the collarbone
      const shoulder = new Mesh(new BoxGeometry(0.07, 0.44, 0.06), strap);
      shoulder.position.set(side, 0.12, 0.24);
      shoulder.rotation.x = -0.5;
      anchor.add(shoulder);

      const buckle = new Mesh(new BoxGeometry(0.07, 0.05, 0.05), brass);
      buckle.position.set(side, -0.1, 0.16);
      anchor.add(buckle);
    }

    anchor.traverse((child) => {
      if (child instanceof Mesh) child.castShadow = false;
    });
  }

  /**
   * A leather satchel on the belt. Set out past the hip rather than on it —
   * the body is nearly half a unit wide at the waist, and anything nearer the
   * middle simply hangs inside the tunic.
   */
  private addSatchel(hips: Object3D): void {
    const anchor = this.anchorTo(hips, new Vector3(0.42, 0.5, -0.08));
    anchor.name = 'traveler-satchel';
    const leather = new MeshStandardMaterial({ color: LEATHER, roughness: 0.85, metalness: 0 });
    const strap = new MeshStandardMaterial({ color: STRAP, roughness: 0.9, metalness: 0 });

    const bag = new Mesh(new BoxGeometry(0.26, 0.28, 0.19), leather);
    bag.rotation.z = -0.1;
    anchor.add(bag);

    const flap = new Mesh(new BoxGeometry(0.28, 0.12, 0.21), strap);
    flap.position.set(0.01, 0.12, 0);
    flap.rotation.z = -0.1;
    anchor.add(flap);

    const loop = new Mesh(new BoxGeometry(0.08, 0.14, 0.23), strap);
    loop.position.set(0.02, 0.23, 0);
    anchor.add(loop);

    anchor.traverse((child) => {
      if (child instanceof Mesh) child.castShadow = false;
    });
  }

  /**
   * The staff, with the lantern swinging off its crook.
   *
   * It hangs off the hand slot the pack keeps for its weapons, but unlike a
   * weapon it is not carried at whatever angle the arm happens to be at:
   * `update` keeps it upright, so it reads as something leant on rather than
   * something swung.
   */
  private addStaff(handSlot: Object3D): void {
    const wood = new MeshStandardMaterial({ color: WOOD, roughness: 0.92, metalness: 0 });
    const strap = new MeshStandardMaterial({ color: STRAP, roughness: 0.9, metalness: 0 });
    const brass = new MeshStandardMaterial({ color: BRASS, roughness: 0.45, metalness: 0.65 });

    const staff = new Group();
    staff.name = 'traveler-staff';
    handSlot.add(staff);

    // The hand falls to about 0.66 in the model's space when the traveler is
    // standing, so the shaft is hung from there: the tip a hand's breadth off
    // the ground, the head of it up around the chin.
    const shaft = new Mesh(new CylinderGeometry(0.032, 0.042, 1.45, 6), wood);
    shaft.position.y = 0.13;
    staff.add(shaft);

    const grip = new Mesh(new CylinderGeometry(0.048, 0.048, 0.15, 6), strap);
    staff.add(grip);

    // the crook at the top, which the lantern hangs from
    const crook = new Mesh(new CylinderGeometry(0.028, 0.028, 0.16, 6), wood);
    crook.position.set(0.06, 0.85, 0);
    crook.rotation.z = -1.15;
    staff.add(crook);

    const lantern = new Group();
    lantern.name = 'traveler-lantern';
    lantern.position.set(0.13, 0.72, 0);
    staff.add(lantern);

    const hoop = new Mesh(new CylinderGeometry(0.012, 0.012, 0.1, 5), brass);
    hoop.position.y = 0.11;
    lantern.add(hoop);

    const cap = new Mesh(new BoxGeometry(0.13, 0.03, 0.13), brass);
    cap.position.y = 0.06;
    lantern.add(cap);

    const flame = new Mesh(
      new BoxGeometry(0.1, 0.11, 0.1),
      new MeshBasicMaterial({ color: LANTERN_GLOW }),
    );
    lantern.add(flame);

    const base = new Mesh(new BoxGeometry(0.12, 0.02, 0.12), brass);
    base.position.y = -0.06;
    lantern.add(base);

    // A light of its own is a luxury: the same tier that can afford the
    // cottage's extra lamp can afford this one, and the plainer tier keeps
    // the glow without paying for what it casts.
    // It hangs a hand's breadth from their chest: anything bright enough to
    // light the ground would burn the tunic out entirely. This only has to
    // warm the cloth nearest it and make the flame read as a source.
    if (getQuality().cottageLight) {
      const glow = new PointLight(LANTERN_GLOW, 0.22, 1.4, 2);
      lantern.add(glow);
    }

    staff.traverse((child) => {
      if (child instanceof Mesh) child.castShadow = false;
    });
    this.staff = staff;
  }

  /**
   * Hold the staff upright in the world, whatever the arm is doing. The hand
   * still carries it about — it sways and swings with the walk — but it never
   * rolls over into a horizontal stick the way a weapon prop would.
   */
  private steadyTheStaff(): void {
    const staff = this.staff;
    if (!staff?.parent) return;
    staff.parent.getWorldQuaternion(scratchQuat).invert();
    this.getWorldQuaternion(scratchUpright);
    staff.quaternion.copy(scratchQuat).multiply(scratchUpright).multiply(STAFF_LEAN);
  }

  /**
   * A child of `bone` whose axes line up with the model's, so offsets can be
   * written in the model's own space. Because the bind rotation is cancelled
   * rather than replaced, whatever the bone does afterwards still carries the
   * attachment with it.
   */
  private anchorTo(bone: Object3D, modelSpacePosition: Vector3): Object3D {
    const anchor = new Group();
    bone.add(anchor);
    bone.updateWorldMatrix(true, false);
    anchor.position.copy(bone.worldToLocal(modelSpacePosition.clone()));
    anchor.quaternion.copy(bone.getWorldQuaternion(scratchQuat).invert());
    return anchor;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Find a bone by the name the rig gives it.
 *
 * The loader strips the characters that would break an animation path, so
 * this rig's `handslot.r` answers to `handslotr` once it is in the scene.
 * Both spellings are tried, and the first bone found wins.
 */
function findBone(rig: Object3D, ...names: string[]): Object3D | undefined {
  for (const name of names) {
    const found = rig.getObjectByName(name) ?? rig.getObjectByName(name.replace(/[.\s[\]:/]/g, ''));
    if (found) return found;
  }
  return undefined;
}
