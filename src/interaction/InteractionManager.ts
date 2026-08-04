import {
  Color,
  Mesh,
  MeshStandardMaterial,
  Raycaster,
  Vector2,
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
}

const HIGHLIGHT_COLOR = new Color(0xffc27a);
const scratchColor = new Color();

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
    let downX = 0;
    let downY = 0;
    window.addEventListener('pointerdown', (event) => {
      downX = event.clientX;
      downY = event.clientY;
    });
    window.addEventListener('click', (event) => {
      // a drag-look release is not a click
      if (Math.hypot(event.clientX - downX, event.clientY - downY) > 6) return;
      if (this.hovered) this.hovered.onActivate();
    });
  }

  register(
    root: Object3D,
    group: string,
    label: string,
    onActivate: () => void,
    highlightRoot: Object3D = root,
    idlePulse = false,
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

    this.items.push({ root, label, onActivate, group, highlights, pulse: 0, idlePulse });
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
    const locked = document.pointerLockElement !== null;
    this.crosshair.classList.toggle('visible', locked);
    if (locked) this.pointer.set(0, 0);

    if (this.pointerDirty || locked) {
      this.pointerDirty = false;
      this.raycaster.setFromCamera(this.pointer, this.camera);

      let hit: Interactable | null = null;
      for (const item of this.items) {
        if (!this.enabledGroups.has(item.group)) continue;
        if (this.raycaster.intersectObject(item.root, true).length > 0) {
          hit = item;
          break;
        }
      }
      this.setHovered(hit);
    }

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
    window.setTimeout(() => {
      if (!this.hovered) this.caption.classList.remove('visible');
    }, 1800);
  }

  private setHovered(item: Interactable | null): void {
    if (item === this.hovered) return;
    this.hovered = item;
    document.body.style.cursor = item ? 'pointer' : '';
    if (item) {
      this.caption.textContent = item.label;
      this.caption.classList.add('visible');
    } else {
      this.caption.classList.remove('visible');
    }
  }
}
