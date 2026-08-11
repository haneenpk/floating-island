import { Vector3 } from 'three';
import { AudioSystem } from './audio/AudioSystem';
import { ExperienceCamera } from './camera/ExperienceCamera';
import { Engine } from './core/Engine';
import { consumeAutoEasedNotice, getQuality } from './core/Quality';
import { InteractionManager } from './interaction/InteractionManager';
import { createPollen } from './scene/atmosphere/Pollen';
import { CottageRoom } from './scene/interior/CottageRoom';
import { initInteriorMaterials } from './scene/interior/interiorMaterials';
import { composeHeroIsland } from './scene/composition/HeroIslandComposition';
import { CloudField } from './scene/environment/CloudField';
import { CloudSea } from './scene/environment/CloudSea';
import { createDistantIslets } from './scene/environment/DistantIslets';
import { applyHdriEnvironment } from './scene/environment/EnvironmentLighting';
import { SkyDome } from './scene/environment/SkyDome';
import { Butterfly } from './scene/fauna/Butterfly';
import { FlyingBird } from './scene/fauna/FlyingBird';
import { FloatingIsland } from './scene/islands/FloatingIsland';
import { initIslandMaterials } from './scene/islands/islandMaterials';
import { Lighting } from './scene/lighting/Lighting';
import { maybeCreateWaterSystem } from './scene/water/WaterSystem';
import { getPanelContent } from './ui/panelContent';
import { StoryPanel } from './ui/StoryPanel';
import { hasDebugFlag } from './utils/debug';
import { isHandheld } from './utils/device';

const canvas = document.querySelector<HTMLCanvasElement>('#webgl');

if (!canvas) {
  throw new Error('Canvas element #webgl not found');
}

// ---- boot screen: progress while the world loads, graceful failure ----
const bootRoot = document.getElementById('boot');
const bootFill = document.querySelector<HTMLElement>('#boot .boot-fill');
const bootNote = document.querySelector<HTMLElement>('#boot .boot-note');

function bootFail(message: string): void {
  if (bootNote) bootNote.textContent = message;
  bootFill?.parentElement?.remove();
}

// if the watchdog eased the detail down last time, say so rather than
// letting the world quietly come back looking different
if (bootNote && consumeAutoEasedNotice()) {
  bootNote.textContent = 'easing the detail down for a smoother flight…';
}

function bootFinish(): void {
  if (bootFill) bootFill.style.width = '100%';
  window.setTimeout(() => {
    bootRoot?.classList.add('done');
    window.setTimeout(() => bootRoot?.remove(), 1300);
  }, 250);
}

// assigned by startExperience, which a handheld visitor may never reach
let engine!: Engine;

function startExperience(): void {
  try {
    engine = new Engine(canvas!);
  } catch (error) {
    bootFail('this little world needs WebGL — please try another browser');
    throw error;
  }

  // LoadingManager totals grow as loads enqueue, so keep the bar monotonic
  let bootProgress = 0;
  engine.assets.onProgress((_url, loaded, total) => {
    if (total > 0) bootProgress = Math.max(bootProgress, loaded / total);
    if (bootFill) bootFill.style.width = `${Math.round(bootProgress * 96)}%`;
  });

  void bootstrap().catch((error) => {
    console.error('Failed to bootstrap experience', error);
    bootFail('the island failed to load — please refresh');
  });
}

// TESTING ONLY: boot straight into the cottage interior, skipping the
// landing overlay, intro and journey. Set back to false to restore the
// normal experience.
const DEV_START_INSIDE = false;

// TESTING ONLY: hide the fantasy house and leave the interior shell visible
// from outside, to judge its size/placement on the island.
const DEV_ROOM_VISIBLE_OUTSIDE = false;

async function bootstrap(): Promise<void> {
  engine.sceneManager.add(new SkyDome(), new Lighting(), new CloudSea());
  engine.start();

  await Promise.all([applyHdriEnvironment(engine), initIslandMaterials(engine.assets)]);

  const cloudTexture = await engine.assets.loadTexture(
    'cloud-billboard',
    '/assets/textures/clouds/cloud_billboard.png',
    { colorSpace: 'srgb', repeat: false },
  );
  engine.sceneManager.add(new CloudField(cloudTexture, engine.camera, getQuality().cloudCount));

  const heroIsland = new FloatingIsland({
    seed: 1207,
    detail: getQuality().islandDetail,
    river: {
      start: { radial: 0.52, angle: 3.05 },
      bend: { radial: 0.2, angle: 1.6 },
      endAngle: 1.0,
      width: 1.7,
      depth: 1.0,
    },
    scatter: { flowers: 0, bushes: 0, rocks: 0.35, roots: 0.85 },
  });
  heroIsland.moveTo(0, 0, 0);
  engine.sceneManager.add(heroIsland);

  const water = maybeCreateWaterSystem(heroIsland.surface, heroIsland.params.river);
  if (water) {
    heroIsland.add(water);
    engine.sceneManager.register(water);
    water.addMist(cloudTexture);
  }
  engine.refreshShadows();

  const composition = await composeHeroIsland(heroIsland, engine.assets);
  for (const updatable of composition.updatables) {
    engine.sceneManager.register(updatable);
  }
  const butterfly = await addFauna(heroIsland);

  // sister islands, wearing the hero island's own scanned textures and its
  // small tree — built after the composition so both are already loaded
  const islets = await createDistantIslets(engine.assets);
  engine.sceneManager.add(islets);
  engine.sceneManager.register(islets);

  heroIsland.add(createPollen(getQuality().pollenCount, heroIsland.params.seed));
  engine.refreshShadows();

  const audio = new AudioSystem(engine.camera, engine.assets);
  engine.sceneManager.register(audio);

  // The sky's environment map lights every material in the scene, including
  // the ones under the cottage roof. Indoors it is turned down so the room
  // is lit by its own hearth and lamps rather than by the weather.
  const scene = engine.sceneManager.scene;
  const outdoorEnvironment = scene.environmentIntensity;
  const setIndoorLight = (inside: boolean): void => {
    scene.environmentIntensity = inside ? outdoorEnvironment * 0.3 : outdoorEnvironment;
  };

  // The interior room floats in the sky, its round window aimed back at the
  // living island; interactable objects inside are future navigation points.
  const interaction = new InteractionManager(engine.camera);
  engine.sceneManager.register(interaction);

  const [desk, chest, closet, book, bed, plant, chair, door] = await Promise.all([
    engine.assets.loadModel('int-desk', '/assets/models/interior/desk.glb'),
    engine.assets.loadModel('int-chest', '/assets/models/interior/chest.glb'),
    engine.assets.loadModel('int-closet', '/assets/models/interior/closet.glb'),
    engine.assets.loadModel('int-book', '/assets/models/interior/open_book.glb'),
    engine.assets.loadModel('int-bed', '/assets/models/interior/bed.glb'),
    engine.assets.loadModel('int-plant', '/assets/models/interior/plant.glb'),
    engine.assets.loadModel('int-chair', '/assets/models/interior/chair.glb'),
    engine.assets.loadModel('int-door', '/assets/models/interior/door.glb'),
    initInteriorMaterials(engine.assets),
  ]);

  // The interior lives at the house's actual spot on the island (island
  // child, so it rides the drift). Through its window: the real meadow,
  // tree and falls, seen from where the house truly stands.
  const houseDir = 6.05;
  const housePlanar =
    heroIsland.surface.capRadiusAt(Math.cos(houseDir), Math.sin(houseDir)) * 0.44;
  const houseX = Math.cos(houseDir) * housePlanar;
  const houseZ = Math.sin(houseDir) * housePlanar;
  const room = new CottageRoom(
    // at the house's exact spot; lifted just enough that the meadow's
    // rocks and mounds stay below the ground floor (the hero tree is
    // hidden while inside — its canopy overlaps the loft)
    // 0.85: the meadow crests slightly higher under medium's terrain
    // tessellation — this keeps it below the floor on every tier
    new Vector3(houseX, heroIsland.surface.getHeightAt(houseX, houseZ) + 0.85, houseZ),
    {
      plant,
      chair,
      door,
      desk,
      chest,
      closet,
      book,
      bed,
    },
  );
  // the whole pocket world scales down together, so inside it feels
  // identical while its shell hugs the house footprint outside
  room.scale.setScalar(0.72);
  // the arch-door wall (+X) faces the way the house front faces (yaw 0.67)
  room.rotation.y = 0.67 - Math.PI / 2;
  room.updateMatrixWorld(true);
  room.add(createPollen(32, 7, { radius: 3.4, yMin: 0.4, yMax: 5.8 }));
  // the interior exists only while the user is inside; the door's fades
  // cover both visibility switches (the house exterior swaps out with it)
  room.visible = false;
  if (DEV_ROOM_VISIBLE_OUTSIDE) {
    room.visible = true;
    composition.house.visible = false;
  }
  heroIsland.add(room);
  // the hearth's crackle plays from the fireplace itself
  audio.attachFire(room.hearth);
  room.updateMatrixWorld(true);
  engine.sceneManager.register(room);

  // the room's objects open the storybook panels — the cottage is the menu
  const storyPanel = new StoryPanel();
  const panelContent = getPanelContent();
  for (const item of room.interactables) {
    const content = panelContent[item.id];
    interaction.register(
      item.object,
      'interior',
      item.label,
      () => {
        if (content) storyPanel.show(content);
        else interaction.announce(`${item.label} — coming soon`);
      },
      item.object,
      false,
      // within arm's reach only — walk up to an object to read it
      2.1,
    );
  }
  interaction.setGroupEnabled('interior', false);

  if (engine.cameraControl instanceof ExperienceCamera) {
    const experience = engine.cameraControl;
    const [{ LandingOverlay }, { SiteNav }, { FadeOverlay }, { CottagePortal }] =
      await Promise.all([
        import('./ui/LandingOverlay'),
        import('./ui/SiteNav'),
        import('./ui/FadeOverlay'),
        import('./experience/CottagePortal'),
      ]);

    const nav = new SiteNav();
    // set once the landing overlay exists; indoors the scroll hint is moot
    let retireScrollHint: (() => void) | null = null;
    const portal = new CottagePortal(
      heroIsland,
      composition.house,
      composition.smoke,
      room,
      experience,
      interaction,
      new FadeOverlay(),
      [butterfly],
      audio,
      (inside) => {
        engine.postSuspended = inside;
        setIndoorLight(inside);
        nav.setInterior(inside);
        if (inside) retireScrollHint?.();
      },
    );
    engine.sceneManager.register(portal);

    // the same world-swap the portal performs, applied immediately
    const devEnterInside = (): void => {
      composition.house.visible = false;
      composition.smoke.visible = false;
      butterfly.visible = false;
      heroIsland.driftPaused = true;
      room.visible = true;
      room.updateMatrixWorld(true);
      const pose = room.getCameraPose();
      experience.enterInterior(pose.position, pose.target, room.getWalkConstraint());
      interaction.setGroupEnabled('interior', true);
      interaction.setGroupEnabled('exterior', false);
      document.documentElement.style.overflow = 'hidden';
      audio.setIndoor(true, room.getWindowWorld());
      engine.postSuspended = true;
      setIndoorLight(true);
      nav.setInterior(true);
    };
    if (import.meta.env.DEV) {
      const { installDevHooks } = await import('./utils/devHooks');
      installDevHooks({
        engine,
        experience,
        room,
        storyPanel,
        panelContent,
        enterInside: devEnterInside,
      });
    }

    if (DEV_START_INSIDE) {
      devEnterInside();
      interaction.announce(
        'move the mouse to look — w a s d to walk — E to interact — M for sound',
      );
      window.addEventListener('pointerdown', () => void audio.begin(heroIsland), { once: true });
    } else {
      const overlay = new LandingOverlay(() => {
        experience.enter();
        void audio.begin(heroIsland);
      });
      retireScrollHint = () => overlay.hideHint();
      // the cottage only invites you in once the journey has begun; during
      // the title and fly-in the prompt would be an interruption
      interaction.setGroupEnabled('exterior', false);
      experience.onJourneyStart = () => {
        nav.show();
        overlay.showHint();
        interaction.setGroupEnabled('exterior', true);
      };
      experience.beginIntro(() => overlay.show());
    }
  } else {
    // debug camera modes have no Enter gesture — wake audio on first click
    window.addEventListener('pointerdown', () => void audio.begin(heroIsland), { once: true });
  }

  if (hasDebugFlag('placement')) {
    const { buildPlacementDebugOverlay } = await import('./scene/placement/PlacementDebug');
    heroIsland.add(buildPlacementDebugOverlay());
  }

  bootFinish();
}

async function addFauna(island: FloatingIsland): Promise<Butterfly> {
  const hoverPoint = (radial: number, angle: number, lift: number) => {
    const dirX = Math.cos(angle);
    const dirZ = Math.sin(angle);
    const planar = island.surface.capRadiusAt(dirX, dirZ) * radial;
    const x = dirX * planar;
    const z = dirZ * planar;
    return { x, y: island.surface.getHeightAt(x, z) + lift, z };
  };

  // Birds: mirada's animated parrot (CC-BY, see the model's SOURCE.txt)
  // circling the island at two heights and directions.
  const parrot = await engine.assets.loadModel('parrot', '/assets/models/parrot/parrot.glb');

  // A procedural monarch dances beside the cottage, around window height.
  const butterfly = new Butterfly({ ...hoverPoint(0.62, 6.50, 5.0), scale: 0.26, phase: 1.3 });
  const creatures = [
    new FlyingBird(parrot, { radius: 17, height: 9, angularSpeed: 0.22, phase: 0.4 }),
    new FlyingBird(parrot, {
      radius: 21,
      height: 4,
      angularSpeed: -0.16,
      phase: 3.6,
      wingspan: 1.4,
    }),
    butterfly,
  ];

  for (const creature of creatures) {
    island.add(creature);
    engine.sceneManager.register(creature);
  }
  return butterfly;
}

// A phone or tablet gets the doorway instead — no renderer, no models, no
// hundreds of megabytes downloaded for a world it cannot steer.
if (isHandheld() && !hasDebugFlag('handheld-skip')) {
  bootRoot?.remove();
  void import('./ui/DesktopOnlyNotice').then(({ showDesktopOnlyNotice }) => {
    showDesktopOnlyNotice();
  });
} else {
  startExperience();
}
