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
  <!-- the falls leaving the rim -->
  <path d="M 246 254 L 252 272" stroke="#e8f4f5" stroke-width="6" stroke-linecap="round"/>
  <!-- the great tree -->
  <circle cx="132" cy="212" r="17" fill="#4e6e3c" stroke="#3a2c1a" stroke-width="2.5"/>
  <circle cx="122" cy="202" r="11" fill="#5d8147"/>
  <rect x="129" y="224" width="6" height="9" fill="#5a4028" rx="2"/>
  <!-- the cottage -->
  <g transform="translate(258, 132)">
    <rect x="-11" y="-6" width="22" height="15" fill="#c9a06b" stroke="#3a2c1a" stroke-width="2.5"/>
    <path d="M -14 -6 L 0 -19 L 14 -6 Z" fill="#8a4a32" stroke="#3a2c1a" stroke-width="2.5"/>
  </g>
  <!-- the spring -->
  <circle cx="96" cy="190" r="6" fill="#9fd4d8" stroke="#4c3a24" stroke-width="2"/>
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

/** One framed plate in the gallery: the picture, its name, and its note. */
function plate(file: string, title: string, note: string): string {
  return `
    <figure>
      <img src="/assets/gallery/${file}.jpg" alt="${title}" loading="lazy">
      <figcaption><strong>${title}</strong><span>${note}</span></figcaption>
    </figure>
  `;
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
      `,
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
      `,
    },
    future: {
      title: 'Something Sleeping',
      html: `
        <div class="crystal-glyph" aria-hidden="true"></div>
        <p class="story-lede">The crystal is warm to the touch, and it hums —
        very softly, and only when it thinks no one is listening.</p>
        <p>The Keeper's journal has one line about it, underlined twice:</p>
        <p class="story-quote">"Not yet."</p>
      `,
    },
  };
}
