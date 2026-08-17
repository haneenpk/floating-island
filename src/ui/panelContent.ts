import type { PanelContent } from './StoryPanel';

// The island map, inked from the world's real layout: the tree on its knoll
// (angle 2.4), the cottage (angle 6.05), the spring (3.05) feeding the river
// that bends and leaves over the falls (angle 1.0). SVG y-down matches world z.
const MAP_SVG = `
<svg viewBox="0 0 360 300" class="world-map" role="img" aria-label="map of the island">
  <defs>
    <radialGradient id="isle" cx="50%" cy="46%" r="60%">
      <stop offset="0%" stop-color="#8faf72"/>
      <stop offset="72%" stop-color="#7c9a62"/>
      <stop offset="100%" stop-color="#6b874f"/>
    </radialGradient>
  </defs>
  <!-- island -->
  <path d="M 180 44
           C 246 40 306 84 312 148
           C 316 206 274 254 208 262
           C 140 270 66 240 54 176
           C 44 116 106 48 180 44 Z"
        fill="url(#isle)" stroke="#4c3a24" stroke-width="3"/>
  <!-- river: spring (west) bending to the falls (south-east) -->
  <path d="M 96 190 C 150 168 176 176 200 196 C 220 213 236 232 246 254"
        fill="none" stroke="#7fc4c9" stroke-width="7" stroke-linecap="round" opacity="0.9"/>
  <path d="M 96 190 C 150 168 176 176 200 196 C 220 213 236 232 246 254"
        fill="none" stroke="#4c3a24" stroke-width="9" stroke-linecap="round" opacity="0.18"/>
  <!-- the four places, each answering to the pointer -->
  <g class="map-place" data-place="falls" tabindex="0" role="button" aria-label="the falls">
    <circle cx="249" cy="263" r="17" class="map-halo"/>
    <path d="M 246 254 L 252 272" stroke="#e8f4f5" stroke-width="6" stroke-linecap="round"/>
  </g>
  <g class="map-place" data-place="tree" tabindex="0" role="button" aria-label="the great tree">
    <circle cx="130" cy="215" r="26" class="map-halo"/>
    <circle cx="132" cy="212" r="17" fill="#4e6e3c" stroke="#3a2c1a" stroke-width="2.5"/>
    <circle cx="122" cy="202" r="11" fill="#5d8147"/>
    <rect x="129" y="224" width="6" height="9" fill="#5a4028" rx="2"/>
  </g>
  <g class="map-place" data-place="cottage" tabindex="0" role="button" aria-label="the cottage">
    <circle cx="258" cy="126" r="24" class="map-halo"/>
    <g transform="translate(258, 132)">
      <rect x="-11" y="-6" width="22" height="15" fill="#c9a06b" stroke="#3a2c1a" stroke-width="2.5"/>
      <path d="M -14 -6 L 0 -19 L 14 -6 Z" fill="#8a4a32" stroke="#3a2c1a" stroke-width="2.5"/>
    </g>
  </g>
  <g class="map-place" data-place="spring" tabindex="0" role="button" aria-label="the spring">
    <circle cx="96" cy="190" r="16" class="map-halo"/>
    <circle cx="96" cy="190" r="6" fill="#9fd4d8" stroke="#4c3a24" stroke-width="2"/>
  </g>
  <!-- labels -->
  <g class="map-label">
    <text x="128" y="252">the great tree</text>
    <text x="258" y="164">the cottage</text>
    <text x="88" y="174">the spring</text>
    <text x="252" y="290">the falls</text>
  </g>
  <!-- compass -->
  <g transform="translate(322, 52)" stroke="#4c3a24" stroke-width="2" fill="none">
    <circle r="13"/>
    <path d="M 0 -13 L 0 13 M -13 0 L 13 0"/>
    <path d="M 0 -13 L 4 -3 L 0 0 L -4 -3 Z" fill="#4c3a24" stroke="none"/>
  </g>
</svg>`;

/**
 * What the Keeper has written about each place on the map. The map is the
 * island's real layout, so these are notes about somewhere you can walk to
 * rather than labels on a drawing.
 */
const PLACES: Record<string, { title: string; note: string }> = {
  tree: {
    title: 'The Great Tree',
    note: 'Older than the floating. Its roots hold the rock together — or so the Keeper writes, and nobody has volunteered to test it.',
  },
  cottage: {
    title: "The Keeper's Cottage",
    note: 'The fire is always lit and the kettle nearly warm, whoever is or is not at home. The door has no lock on either side.',
  },
  spring: {
    title: 'The Spring',
    note: 'The river begins here, out from under a shelf of bedrock, and nobody has yet found where the water comes from before that.',
  },
  falls: {
    title: 'The Falls',
    note: 'The river reaches the rim and simply keeps going. Below a certain height it stops being water and becomes weather.',
  },
};

/**
 * What the crystal says. Each visit gets the next one, so the thing reads as
 * answering rather than repeating — and none of them explains anything, which
 * is the point of it.
 */
const WHISPERS = [
  'The island was not always flying.',
  'Something else used to keep the fire lit.',
  'There is a second door. It is not in the cottage.',
  'The river has been running for longer than the island has been here.',
  'You are not the first to stand where you are standing.',
  'Below the cloud sea the light still comes from somewhere.',
  'The tree remembers the ground it grew out of.',
];
let whisperAt = 0;

/** One framed plate in the gallery: the picture, its name, and its note. */
function plate(file: string, title: string, note: string): string {
  return `
    <figure data-plate tabindex="0" role="button" aria-label="${title}">
      <img src="/assets/gallery/${file}.jpg" alt="${title}" loading="lazy">
      <figcaption><strong>${title}</strong><span>${note}</span></figcaption>
    </figure>
  `;
}

/**
 * Step through the framed plates one at a time.
 *
 * The wall shows all six; picking one lifts it out to fill the frame, with
 * the arrow keys and the two edges of the image moving between them. Every
 * picture is a view of somewhere on this island, so the viewer is closer to
 * leaning in toward a painting than to opening a photograph.
 */
function wireGallery(body: HTMLElement): void {
  const plates = [...body.querySelectorAll<HTMLElement>('[data-plate]')];
  const viewer = body.querySelector<HTMLElement>('[data-viewer]');
  const frame = viewer?.querySelector('img');
  const label = viewer?.querySelector<HTMLElement>('[data-viewer-caption]');
  if (!viewer || !frame || !label || plates.length === 0) return;

  let at = 0;
  const open = (index: number): void => {
    at = (index + plates.length) % plates.length;
    const plate = plates[at]!;
    const source = plate.querySelector('img');
    const caption = plate.querySelector('figcaption');
    if (!source) return;
    frame.src = source.src;
    frame.alt = source.alt;
    label.replaceChildren(...(caption ? [...caption.cloneNode(true).childNodes] : []));
    viewer.classList.add('open');
  };
  const close = (): void => viewer.classList.remove('open');

  plates.forEach((plate, index) => {
    plate.addEventListener('click', () => open(index));
    plate.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        open(index);
      }
    });
  });

  viewer.querySelector('[data-step="-1"]')?.addEventListener('click', (event) => {
    event.stopPropagation();
    open(at - 1);
  });
  viewer.querySelector('[data-step="1"]')?.addEventListener('click', (event) => {
    event.stopPropagation();
    open(at + 1);
  });
  viewer.addEventListener('click', (event) => {
    if (event.target === viewer || event.target === frame) close();
  });
  // Esc already closes the whole panel, so the viewer takes the arrows only
  body.addEventListener('keydown', (event) => {
    if (!viewer.classList.contains('open')) return;
    if (event.key === 'ArrowLeft') open(at - 1);
    if (event.key === 'ArrowRight') open(at + 1);
  });
}

export function getPanelContent(): Record<string, PanelContent> {
  return {
    story: {
      title: 'The Story',
      html: `
        <p class="story-lede">Somewhere above the cloud sea, where the wind
        forgets to be in a hurry, a small island drifts.</p>
        <p>No one remembers when it slipped its moorings and rose. The river
        still runs as if nothing happened — bubbling up at the spring, bending
        through the meadow, and stepping off the rim into the sky, where it
        becomes a ribbon of falling light.</p>
        <p>At the island's heart stands the Great Tree, older than the
        floating itself. Its roots hold the rock together, or so the Keeper
        writes; its branches lean toward the cottage like an old friend
        peering in the round window.</p>
        <p>The Keeper's cottage is never empty for long. The fire is always
        lit, the kettle nearly warm, a book left open on the desk — as if
        whoever lives here has only just stepped out, and might be back before
        the next cloud passes.</p>
        <p>Perhaps they left the door unlocked for you.</p>
        <p class="story-sign">— from the Keeper's journal</p>
        <p class="story-credit">
          Built with Three.js. The birds are “Parrot” by mirada for
          <em>ro.me</em> (CC-BY); the land is scanned by Poly Haven and the
          cottage furnished by Quaternius (both CC0); sound from Mixkit; set
          in Cinzel by Natanael Gama.
        </p>
      `,
    },
    world: {
      title: 'The World',
      html: `
        ${MAP_SVG}
        <p class="map-caption">Aetheria, as surveyed from the loft window —
        the spring feeds the river, the river feeds the sky.</p>
        <div class="map-reading" data-reading>
          <strong>Four places</strong>
          <span>Point at one and the Keeper's note for it appears here.</span>
        </div>
      `,
      onShow: (body) => {
        const reading = body.querySelector<HTMLElement>('[data-reading]');
        if (!reading) return;
        const say = (title: string, note: string): void => {
          reading.replaceChildren();
          const name = document.createElement('strong');
          name.textContent = title;
          const line = document.createElement('span');
          line.textContent = note;
          reading.append(name, line);
        };
        for (const spot of body.querySelectorAll<SVGGElement>('[data-place]')) {
          const key = spot.dataset['place'] ?? '';
          const place = PLACES[key];
          if (!place) continue;
          const reveal = (): void => {
            say(place.title, place.note);
            for (const other of body.querySelectorAll('[data-place]')) {
              other.classList.toggle('reading', other === spot);
            }
          };
          spot.addEventListener('pointerenter', reveal);
          spot.addEventListener('click', reveal);
          spot.addEventListener('focus', reveal);
        }
      },
    },
    gallery: {
      title: 'The Gallery',
      wide: true,
      html: `
        <div class="gallery-grid">
          ${plate(
            'the_island',
            'the island, adrift',
            'Grown from a single number: the same seed always raises the same hill, carves the same river, and hangs the same roots beneath the rock.',
          )}
          ${plate(
            'the_doorway',
            'the doorstep',
            'Stones trodden into the grass, a lamp at the gate, and a door that is only ever unlatched — the way in is lit for you.',
          )}
          ${plate(
            'the_tree',
            'the great tree',
            'Older than the floating itself. Lanterns hang where its branches will hold them, and a sister island drifts past beyond.',
          )}
          ${plate(
            'the_falls',
            'the falls',
            'The river reaches the rim and simply keeps going, becoming weather for whatever lies below.',
          )}
          ${plate(
            'the_hearth',
            'the hearth',
            'Stacked wood over an ember bed, and a flame with real depth to it — the brightest thing in the room, as it should be.',
          )}
          ${plate(
            'the_window',
            'the round window',
            'From the loft, the tree fills the glass. A lantern sways just outside it, close enough to read by.',
          )}
        </div>
        <div class="plate-viewer" data-viewer>
          <button class="plate-step" data-step="-1" type="button" aria-label="previous">‹</button>
          <img alt="">
          <div class="plate-caption" data-viewer-caption></div>
          <button class="plate-step" data-step="1" type="button" aria-label="next">›</button>
        </div>
      `,
      onShow: wireGallery,
    },
    future: {
      title: 'Something Sleeping',
      html: `
        <div class="crystal-glyph" aria-hidden="true"></div>
        <p class="story-lede">The crystal is warm to the touch, and it hums —
        very softly, and only when it thinks no one is listening.</p>
        <p>Hold still long enough and it answers. It has never yet given the
        same answer twice, and the Keeper's journal keeps a running list.</p>
        <p class="story-quote" data-whisper>…</p>
        <p class="crystal-aside">The last line in the journal is underlined
        twice: <em>not yet</em>.</p>
      `,
      onShow: (body) => {
        const whisper = body.querySelector<HTMLElement>('[data-whisper]');
        if (!whisper) return;
        // one at a time, in a fixed order the visitor cannot quite predict —
        // it should feel answered, not shuffled
        const line = WHISPERS[whisperAt % WHISPERS.length]!;
        whisperAt += 1;
        whisper.textContent = '';
        whisper.classList.remove('settled');
        let shown = 0;
        const tick = window.setInterval(() => {
          shown += 1;
          whisper.textContent = line.slice(0, shown);
          if (shown >= line.length) {
            window.clearInterval(tick);
            whisper.classList.add('settled');
          }
        }, 42);
      },
    },
  };
}
