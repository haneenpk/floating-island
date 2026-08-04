import {
  BufferAttribute,
  CapsuleGeometry,
  CircleGeometry,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from 'three';
import type { Time } from '../../core/Time';
import type { Updatable } from '../Updatable';

const WING_COLOR = new Color(0xd96a2b);
const WING_EDGE = new Color(0x2b1d14);
const BODY_COLOR = 0x2b1d14;

let wingMaterial: MeshStandardMaterial | null = null;
let bodyMaterial: MeshStandardMaterial | null = null;

const scratchAhead = new Vector3();
const scratchColor = new Color();

function getWingMaterial(): MeshStandardMaterial {
  if (!wingMaterial) {
    wingMaterial = new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.7,
      metalness: 0,
      side: 2, // DoubleSide
    });
    wingMaterial.name = 'butterfly-wing';
  }
  return wingMaterial;
}

function getBodyMaterial(): MeshStandardMaterial {
  if (!bodyMaterial) {
    bodyMaterial = new MeshStandardMaterial({ color: BODY_COLOR, roughness: 0.8, metalness: 0 });
    bodyMaterial.name = 'butterfly-body';
  }
  return bodyMaterial;
}

/**
 * Monarch-ish wing: a half-disc lying in the XZ plane, hinged at the body,
 * orange with a dark rim baked into vertex colors.
 */
function makeWingGeometry(): CircleGeometry {
  const geometry = new CircleGeometry(1, 14);
  geometry.rotateX(-Math.PI / 2);
  geometry.scale(0.52, 1, 0.36);
  geometry.translate(0.52, 0, 0);

  const positions = geometry.getAttribute('position');
  const colors = new Float32Array(positions.count * 3);
  for (let i = 0; i < positions.count; i++) {
    const distance = Math.hypot((positions.getX(i) - 0.52) / 0.52, positions.getZ(i) / 0.36);
    scratchColor.copy(WING_COLOR).lerp(WING_EDGE, distance > 0.78 ? 0.9 : distance * 0.25);
    colors[i * 3] = scratchColor.r;
    colors[i * 3 + 1] = scratchColor.g;
    colors[i * 3 + 2] = scratchColor.b;
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  return geometry;
}

export interface ButterflyOptions {
  x: number;
  y: number;
  z: number;
  scale?: number;
  phase?: number;
}

export class Butterfly extends Group implements Updatable {
  private readonly wingLeft: Mesh;
  private readonly wingRight: Mesh;
  private readonly anchor: Vector3;
  private readonly phase: number;

  constructor(options: ButterflyOptions) {
    super();
    this.name = 'butterfly';

    const wingGeometry = makeWingGeometry();
    this.wingLeft = new Mesh(wingGeometry, getWingMaterial());
    this.wingRight = new Mesh(wingGeometry, getWingMaterial());
    this.wingRight.scale.x = -1;

    const body = new Mesh(new CapsuleGeometry(0.045, 0.34, 3, 8), getBodyMaterial());
    body.rotation.x = Math.PI / 2;

    this.add(this.wingLeft, this.wingRight, body);
    this.scale.setScalar(options.scale ?? 0.5);

    this.anchor = new Vector3(options.x, options.y, options.z);
    this.phase = options.phase ?? 0;
  }

  update(time: Time): void {
    const t = time.elapsed + this.phase;

    // wander a gentle lissajous around the anchor
    this.position.set(
      this.anchor.x + Math.sin(t * 0.5) * 1.2,
      this.anchor.y + Math.sin(t * 1.3) * 0.45 + Math.sin(t * 3.1) * 0.08,
      this.anchor.z + Math.sin(t * 0.37 + 1.4) * 0.9,
    );

    // face along the direction of travel (sampled slightly ahead)
    const dt = 0.25;
    scratchAhead.set(
      this.anchor.x + Math.sin((t + dt) * 0.5) * 1.2,
      this.position.y,
      this.anchor.z + Math.sin((t + dt) * 0.37 + 1.4) * 0.9,
    );
    this.lookAt(scratchAhead);

    const flap = 0.18 + Math.sin(t * 13) * 0.8;
    this.wingLeft.rotation.z = flap;
    this.wingRight.rotation.z = -flap;
  }
}
