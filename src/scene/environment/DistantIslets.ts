import {
  CanvasTexture,
  ClampToEdgeWrapping,
  ConeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
  CylinderGeometry,
  DoubleSide,
} from 'three';
import type { Time } from '../../core/Time';
import { SeededRandom } from '../../procgen/SeededRandom';
import type { Updatable } from '../Updatable';

/** Soft white streak for a faraway waterfall — feathered on every edge. */
function makeStreakTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createLinearGradient(0, 0, 0, 64);
  gradient.addColorStop(0, 'rgba(235, 244, 246, 0)');
  gradient.addColorStop(0.12, 'rgba(235, 244, 246, 0.8)');
  gradient.addColorStop(0.7, 'rgba(235, 244, 246, 0.32)');
  gradient.addColorStop(1, 'rgba(235, 244, 246, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 32, 64);
  // feather the sides so the ribbon never shows a hard rectangle edge
  ctx.globalCompositeOperation = 'destination-in';
  const sides = ctx.createLinearGradient(0, 0, 32, 0);
  sides.addColorStop(0, 'rgba(0,0,0,0)');
  sides.addColorStop(0.5, 'rgba(0,0,0,1)');
  sides.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sides;
  ctx.fillRect(0, 0, 32, 64);
  ctx.globalCompositeOperation = 'source-over';
  const texture = new CanvasTexture(canvas);
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  return texture;
}

/**
 * Faraway sister islands adrift in the haze — a rock cone, a grass cap,
 * a tiny tree or two, and a thread of falling water. Low-poly silhouettes
 * that the warm fog softens into the distance.
 */
export class DistantIslets extends Group implements Updatable {
  private readonly bobbers: { islet: Group; baseY: number; phase: number; speed: number }[] = [];

  constructor() {
    super();
    this.name = 'distant-islets';

    const random = new SeededRandom(0x151e7 & 0xffff);
    // deeper tones than they look: warm haze lightens them a lot at range
    const rock = new MeshStandardMaterial({
      color: 0x53412e,
      roughness: 1,
      fog: true,
      flatShading: true,
    });
    const grass = new MeshStandardMaterial({ color: 0x476027, roughness: 1, fog: true });
    const canopy = new MeshStandardMaterial({ color: 0x35501f, roughness: 1, fog: true });
    const trunk = new MeshStandardMaterial({ color: 0x6d5136, roughness: 1, fog: true });
    const streak = new MeshStandardMaterial({
      map: makeStreakTexture(),
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      roughness: 1,
      fog: true,
    });

    // near enough to read as islands, far enough to stay scenery
    const spots: { x: number; y: number; z: number; scale: number }[] = [
      { x: -70, y: 4, z: -38, scale: 7 },
      { x: 64, y: -14, z: 50, scale: 6 },
      { x: 26, y: 11, z: -86, scale: 9 },
      { x: -54, y: -20, z: 66, scale: 5 },
    ];

    for (const spot of spots) {
      const islet = new Group();

      // craggy inverted cone, chunky like the hero island's underside
      const coneGeometry = new ConeGeometry(1, 1.9, 9, 4);
      const positions = coneGeometry.getAttribute('position');
      for (let i = 0; i < positions.count; i++) {
        const y = positions.getY(i);
        if (y < 0.85) {
          positions.setX(i, positions.getX(i) * random.range(0.78, 1.22));
          positions.setZ(i, positions.getZ(i) * random.range(0.78, 1.22));
          positions.setY(i, y + random.range(-0.14, 0.14));
        }
      }
      coneGeometry.computeVertexNormals();
      const cone = new Mesh(coneGeometry, rock);
      cone.rotation.x = Math.PI;
      cone.rotation.y = random.range(0, Math.PI);
      cone.position.y = -0.93;
      cone.scale.set(1, 1, random.range(0.85, 1.05));
      islet.add(cone);

      // turf: one closed, flattened sphere. A hemisphere shell would show
      // its hollow underside and dark grazing facets at the rim; a solid
      // avoids both, and its lower half hides inside the rock.
      const turf = new Mesh(new SphereGeometry(1.0, 14, 8), grass);
      turf.scale.y = 0.22;
      islet.add(turf);

      // height of the turf dome at a given distance from its centre, so
      // trees and boulders stand on it instead of sinking through
      const turfY = (radius: number): number =>
        0.22 * Math.sqrt(Math.max(1 - radius * radius, 0));

      const treeCount = 1 + random.int(0, 1);
      for (let i = 0; i < treeCount; i++) {
        const tx = random.range(-0.45, 0.45);
        const tz = random.range(-0.4, 0.4);
        const ground = turfY(Math.hypot(tx, tz)) - 0.02;
        const height = random.range(0.28, 0.45);
        const stem = new Mesh(new CylinderGeometry(0.018, 0.03, height, 5), trunk);
        stem.position.set(tx, ground + height / 2, tz);
        islet.add(stem);
        // a small cluster of puffs reads as a canopy, not a lollipop
        for (let p = 0; p < 3; p++) {
          const puff = new Mesh(new SphereGeometry(random.range(0.09, 0.15), 6, 4), canopy);
          puff.position.set(
            tx + random.range(-0.1, 0.1),
            ground + height + random.range(-0.02, 0.09),
            tz + random.range(-0.1, 0.1),
          );
          puff.scale.y = 0.75;
          islet.add(puff);
        }
      }

      // the fall spills off the rim and trails into the open air below
      const fall = new Mesh(new PlaneGeometry(0.26, 2.3), streak);
      fall.position.set(random.range(-0.4, 0.4), -1.05, random.range(0.85, 1.0));
      fall.rotation.y = random.range(-0.3, 0.3);
      islet.add(fall);

      islet.position.set(spot.x, spot.y, spot.z);
      islet.scale.setScalar(spot.scale);
      islet.rotation.y = random.range(0, Math.PI * 2);
      this.add(islet);
      this.bobbers.push({
        islet,
        baseY: spot.y,
        phase: random.range(0, Math.PI * 2),
        speed: random.range(0.06, 0.11),
      });
    }
  }

  update(time: Time): void {
    for (const bobber of this.bobbers) {
      bobber.islet.position.y = bobber.baseY + Math.sin(time.elapsed * bobber.speed + bobber.phase) * 1.4;
    }
  }
}
