# Aetheria

*A little world above the clouds.*

**[Visit the island →](https://floating-island.mohdhaneenpk666.workers.dev)**

![The floating island at golden hour, its cottage lit beneath a great tree](docs/hero.jpg)

A cinematic floating island you can fly to, wander, and step inside — built with
Three.js and TypeScript, and rendered in the browser with no game engine
underneath it. The terrain is generated, the river is carved, the cottage is
enterable, and the fire in its hearth is the brightest thing in the room.

Best on a desktop or laptop: it asks for a mouse to look, a keyboard to walk,
and a graphics card to hold up the sky. Handheld visitors are met with a still
of the island and an explanation rather than a world they cannot steer.

---

## The world

|  |  |
| --- | --- |
| ![The cottage doorway, lanterns swinging from the tree](docs/cottage.jpg) | ![The hearth, alight inside the cottage](docs/hearth.jpg) |

**Generated, not modelled.** The island comes out of seeded noise — the same
seed always builds the same island — with a river carved through the meadow,
waterfalls stepping off the rim, and hanging roots beneath the rock. Every tree,
stone and flower is placed by a surface sampler with its own rules per category,
so nothing is positioned by hand and nothing floats.

**A day that behaves like one.** Golden hour is one-sided: the horizon burns
honey where the sun sits and stays dusk-blue behind you. Sister islands drift in
the haze, cloud shadows cross the grass, and pollen catches the light.

**A cottage you can enter.** Press <kbd>E</kbd> at the door and you are inside,
walking in first person: two storeys, a staircase to a loft, a round window
looking back at the great tree, and furniture that stops you walking through it.
The hearth burns with shader flames, embers, rising sparks and smoke, and
crackles louder as you approach it.

**The room is the menu.** The book, the map, the painting above the mantle and
the crystal on the chest each open a page of the site — its story, its world,
its gallery, and one thing not ready to be told.

## Controls

| | |
| --- | --- |
| Scroll | travel the island |
| <kbd>E</kbd> | enter the cottage, and read what is inside it |
| Mouse | look around, once you are indoors |
| <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> | walk |
| <kbd>M</kbd> | sound, without letting go of the mouse |
| <kbd>Esc</kbd> | release the cursor |

## Running it

```bash
npm install
npm run dev          # http://localhost:3000
npm run dev:host     # same, reachable from another machine on the network
npm run build        # type-check, bundle, and drop unserved assets
npm run preview      # serve the built output exactly as the host will
```

Node 22 or newer.

## How it is put together

```
src/
  core/         renderer, loop, quality tiers, performance watchdog
  camera/       the landing, fly-in, scroll journey and first-person interior
  scene/
    islands/    terrain generation, the height field everything is placed on
    composition/  what stands where: the tree, the cottage, the garden
    interior/   the room, its hearth, its furniture
    environment/  sky, cloud sea, distant islets
    water/      river and waterfalls
  interaction/  what the cursor is pointing at, and what E does about it
  ui/           landing, nav, storybook panels, the handheld doorway
```

**One source of truth for the ground.** `IslandSurface` answers "how high is the
land here, and which way does it face" — the river carve, the mounds and the
levelled pads included. Everything placed on the island asks it rather than
carrying a hardcoded height, which is why nothing hovers or sinks when the
terrain changes.

**Quality decides itself.** The renderer, texture sizes, model LODs, shadow maps
and post-processing are chosen from the visitor's GPU, and a frame-rate watchdog
eases the detail down within seconds if the machine cannot hold it — saying so
rather than quietly coming back different. A **detail** toggle in the nav
overrides both, and a hand-picked tier is never second-guessed.

**Weight is measured, not guessed.** Every asset the site requests is recorded
across both tiers and the whole experience; the textures are compressed against
that measurement, and the build drops what nothing asks for. A visit costs
46–73 MB depending on tier, with the returning visitor paying almost nothing.
