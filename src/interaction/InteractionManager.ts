import {
  Color,
  Mesh,
  MeshStandardMaterial,
  Raycaster,
  Vector2,
  Vector3,
  type Object3D,
  type PerspectiveCamera,
} from 'three';
import type { Time } from '../core/Time';
import type { Updatable } from '../scene/Updatable';

interface HighlightEntry {
  material: MeshStandardMaterial;
  baseEmissive: Color;
  baseIntensity: number;
}

interface Interactable {
  root: Object3D;
  label: string;
  onActivate: () => void;
  group: string;
  highlights: HighlightEntry[];
  pulse: number;
  /** breathes gently even when not hovered — the "you can click me" beacon */
  idlePulse: boolean;
  /** how close (world units) the camera must be to focus it */
  range: number;
}

const HIGHLIGHT_COLOR = new Color(0xffc27a);
const scratchColor = new Color();
const scratchPosition = new Vector3();

/**
 * Pointer -> world interaction: raycast hover with a soft emissive pulse and
 * a caption, click to activate. Interactables register in named groups so
 * whole sets (exterior vs interior) switch on and off together.
 */
export class InteractionManager implements Updatable {
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly caption: HTMLDivElement;
  private readonly crosshair: HTMLDivElement;
  private readonly items: Interactable[] = [];
  private readonly enabledGroups = new Set<string>(['exterior']);
  private hovered: Interactable | null = null;
  /** what E would act on: whatever is hovered, else a beacon in view */
  private beacon: Interactable | null = null;
  private prompted: Interactable | null = null;
  private pointerDirty = false;

  constructor(private readonly camera: PerspectiveCamera) {
    this.caption = document.createElement('div');
    this.caption.id = 'interact-caption';
    document.body.appendChild(this.caption);
    this.crosshair = document.createElement('div');
    this.crosshair.id = 'interact-crosshair';
    document.body.appendChild(this.crosshair);

    window.addEventListener('pointermove', (event) => {
      this.pointer.set(
        (event.clientX / window.innerWidth) * 2 - 1,
        -(event.clientY / window.innerHeight) * 2 + 1,
      );
      this.pointerDirty = true;
    });
    // game-style interaction: focus something, press E
    window.addEventListener('keydown', (event) => {
      if (event.repeat || event.key.toLowerCase() !== 'e') return;
      if (document.body.classList.contains('overlay-open')) return;
      this.beacon?.onActivate();
    });
  }

  register(
    root: Object3D,
    group: string,
    label: string,
    onActivate: () => void,
    highlightRoot: Object3D = root,
    idlePulse = false,
    range = Infinity,
  ): void {
    const highlights: HighlightEntry[] = [];
    highlightRoot.traverse((child) => {
      if (!(child instanceof Mesh)) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material, i) => {
        if (!(material instanceof MeshStandardMaterial)) return;
        // unique material per interactable so shared materials never glow
        const owned = material.clone();
        if (Array.isArray(child.material)) child.material[i] = owned;
        else child.material = owned;
        highlights.push({
          material: owned,
          baseEmissive: owned.emissive.clone(),
          baseIntensity: owned.emissiveIntensity,
        });
      });
    });

    this.items.push({ root, label, onActivate, group, highlights, pulse: 0, idlePulse, range });
  }

  setGroupEnabled(group: string, enabled: boolean): void {
    if (enabled) this.enabledGroups.add(group);
    else this.enabledGroups.delete(group);
    if (this.hovered && !this.enabledGroups.has(this.hovered.group)) {
      this.setHovered(null);
    }
  }

  update(time: Time): void {
    // pointer locked (first-person interior): aim from the screen centre,
    // re-testing every frame since the camera turns without pointer events
    const overlayOpen = document.body.classList.contains('overlay-open');
    const locked = document.pointerLockElement !== null && !overlayOpen;
    this.crosshair.classList.toggle('visible', locked);
    if (locked) this.pointer.set(0, 0);
    if (overlayOpen && this.hovered) this.setHovered(null);

    if (!overlayOpen && (this.pointerDirty || locked)) {
      this.pointerDirty = false;
      this.raycaster.setFromCamera(this.pointer, this.camera);

      let hit: Interactable | null = null;
      for (const item of this.items) {
        if (!this.enabledGroups.has(item.group)) continue;
        const intersections = this.raycaster.intersectObject(item.root, true);
        if (intersections.length > 0 && intersections[0]!.distance <= item.range) {
          hit = item;
          break;
        }
      }
      this.setHovered(hit);
    }

    // A beacon speaks for itself: once it is on screen and within reach the
    // prompt shows without hunting for it with the cursor, so the cottage
    // door reads as a way in rather than scenery.
    this.beacon = this.hovered ?? (overlayOpen ? null : this.findBeacon());
    this.setPrompt(this.beacon);

    for (const item of this.items) {
      const goal = item === this.hovered ? 1 : 0;
      item.pulse += (goal - item.pulse) * (1 - Math.exp(-time.delta * 7));

      const idleActive = item.idlePulse && this.enabledGroups.has(item.group);
      if (item.pulse < 0.005 && goal === 0 && !idleActive) continue;

      const hoverGlow = item.pulse * (0.75 + Math.sin(time.elapsed * 5) * 0.12);
      const idleGlow = idleActive
        ? (0.5 + Math.sin(time.elapsed * 2.1) * 0.5) * 0.34 * (1 - item.pulse)
        : 0;
      const glow = hoverGlow + idleGlow;

      for (const entry of item.highlights) {
        scratchColor.copy(entry.baseEmissive).lerp(HIGHLIGHT_COLOR, Math.min(glow * 0.8, 1));
        entry.material.emissive.copy(scratchColor);
        entry.material.emissiveIntensity = entry.baseIntensity + glow;
      }
    }
  }

  /** Flash a short message in the caption slot (activation feedback). */
  announce(text: string): void {
    this.caption.textContent = text;
    this.caption.classList.add('visible');
    // the prompt redraws itself on the next frame it applies to
    this.prompted = null;
    window.setTimeout(() => {
      if (!this.prompted) this.caption.classList.remove('visible');
    }, 1800);
  }

  /** The nearest marked object that is in front of the camera and in reach. */
  private findBeacon(): Interactable | null {
    let best: Interactable | null = null;
    let bestDistance = Infinity;

    for (const item of this.items) {
      if (!item.idlePulse || !this.enabledGroups.has(item.group)) continue;

      item.root.getWorldPosition(scratchPosition);
      const distance = scratchPosition.distanceTo(this.camera.position);
      if (distance > item.range || distance >= bestDistance) continue;

      // on screen, and not so near the edge that the prompt feels unmoored
      scratchPosition.project(this.camera);
      if (scratchPosition.z > 1) continue;
      if (Math.abs(scratchPosition.x) > 0.8 || Math.abs(scratchPosition.y) > 0.8) continue;

      best = item;
      bestDistance = distance;
    }
    return best;
  }

  private setPrompt(item: Interactable | null): void {
    if (item === this.prompted) return;
    this.prompted = item;
    if (item) {
      this.caption.replaceChildren();
      const key = document.createElement('span');
      key.className = 'key-hint';
      key.textContent = 'E';
      this.caption.append(key, item.label);
      this.caption.classList.add('visible');
    } else {
      this.caption.classList.remove('visible');
    }
  }

  private setHovered(item: Interactable | null): void {
    if (item === this.hovered) return;
    this.hovered = item;
    document.body.style.cursor = item ? 'pointer' : '';
  }
}
