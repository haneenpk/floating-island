import { Box3, Raycaster, Vector2, Vector3, type Object3D } from 'three';
import type { ExperienceCamera } from '../camera/ExperienceCamera';
import type { Engine } from '../core/Engine';
import type { CottageRoom } from '../scene/interior/CottageRoom';
import type { PanelContent } from '../ui/StoryPanel';
import type { StoryPanel } from '../ui/StoryPanel';

export interface DevHookContext {
  engine: Engine;
  experience: ExperienceCamera;
  room: CottageRoom;
  storyPanel: StoryPanel;
  panelContent: Record<string, PanelContent>;
  enterInside: () => void;
  walkOutside: () => void;
  /** the island's own height field, sampled in island space */
  groundAt: (x: number, z: number) => number;
}

/**
 * Scripted controls used by the screenshot/verification harness — camera
 * placement, entering the cottage, opening panels, and naming whatever sits
 * under a screen point. Only installed by the dev server; production builds
 * tree-shake the whole module away.
 */
export function installDevHooks(context: DevHookContext): void {
  const { engine, experience, room, storyPanel, panelContent, enterInside, walkOutside, groundAt } =
    context;
  const target = window as unknown as Record<string, unknown>;

  // room-local look (walk = apply the interior floor/collision constraint)
  target['__devLook'] = (
    x: number,
    y: number,
    z: number,
    tx: number,
    ty: number,
    tz: number,
    walk = false,
  ) => {
    const from = room.localToWorld(new Vector3(x, y, z));
    const to = room.localToWorld(new Vector3(tx, ty, tz));
    experience.enterInterior(from, to, walk ? room.getWalkConstraint() : undefined);
  };

  // free world-space camera, for framing anything outdoors
  target['__devCam'] = (
    x: number,
    y: number,
    z: number,
    tx: number,
    ty: number,
    tz: number,
  ) => {
    experience.enterInterior(new Vector3(x, y, z), new Vector3(tx, ty, tz), undefined);
  };

  // what is this pixel? names the visible objects under a normalised point
  target['__devPick'] = (ndcX: number, ndcY: number) => {
    const raycaster = new Raycaster();
    raycaster.setFromCamera(new Vector2(ndcX, ndcY), engine.camera);
    const isShown = (object: Object3D): boolean => {
      let node: Object3D | null = object;
      while (node) {
        if (!node.visible) return false;
        node = node.parent;
      }
      return true;
    };
    return raycaster
      .intersectObjects(engine.sceneManager.scene.children, true)
      .filter((hit) => isShown(hit.object))
      .slice(0, 10)
      .map((hit) => {
        const chain: string[] = [];
        let node: Object3D | null = hit.object;
        while (node) {
          if (node.name) chain.push(node.name);
          node = node.parent;
        }
        const p = hit.point;
        return (
          `${hit.distance.toFixed(1)}m at ${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)} ` +
          `${hit.object.type} [${chain.join(' < ')}]`
        );
      });
  };

  // where is it? world position + size of every object matching a name
  target['__devWhere'] = (name: string) => {
    const found: string[] = [];
    engine.sceneManager.scene.traverse((node) => {
      if (!node.name.includes(name)) return;
      const p = node.getWorldPosition(new Vector3());
      found.push(`${node.name} @ ${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}`);
    });
    return found;
  };

  // how big is it, really? world-space size of everything matching a name
  target['__devSize'] = (name: string) => {
    const found: string[] = [];
    engine.sceneManager.scene.traverse((node) => {
      if (!node.name.includes(name)) return;
      const box = new Box3().setFromObject(node);
      if (box.isEmpty()) return;
      const size = box.getSize(new Vector3());
      found.push(
        `${node.name}: ${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}` +
          ` (y ${box.min.y.toFixed(2)}..${box.max.y.toFixed(2)})`,
      );
    });
    return found;
  };

  // what is the camera doing, and does it still think it is out walking?
  target['__devState'] = () => {
    const camera = engine.camera.position;
    return {
      walkWasActive: experience.walkWasActive,
      pointerLocked: document.pointerLockElement !== null,
      overflow: document.documentElement.style.overflow,
      camera: [
        +camera.x.toFixed(3),
        +camera.y.toFixed(3),
        +camera.z.toFixed(3),
      ],
    };
  };

  // how high is the land here? island space, straight off the height field
  target['__devGround'] = (x: number, z: number) => groundAt(x, z);

  target['__devInside'] = enterInside;
  // take up the traveler's walk without hunting for the prompt first
  target['__devWalk'] = walkOutside;
  target['__devPanel'] = (id: string) => {
    const content = panelContent[id];
    if (content) storyPanel.show(content);
  };
  target['__devReady'] = true;
}
