const TITLE = 'Aetheria';
const HEADLINE = 'This little world needs a bigger window.';
const BODY =
  'Aetheria asks for a mouse to look around, a keyboard to walk its cottage, ' +
  'and a graphics card to hold up the sky — so it lives on a desktop or laptop. ' +
  'Come back from a computer and the island will be waiting, exactly as you left it.';
const FOOTNOTE = 'a little world above the clouds';

/**
 * The handheld doorway: a still of the island and an honest explanation.
 * Shown instead of booting the experience, so a phone never downloads a
 * world it could not steer anyway.
 */
export function showDesktopOnlyNotice(): void {
  const root = document.createElement('div');
  root.id = 'desktop-only';
  root.setAttribute('role', 'img');
  root.setAttribute('aria-label', 'the floating island of Aetheria');
  root.innerHTML = `
    <div class="desktop-only-copy">
      <h1>${TITLE}</h1>
      <p class="desktop-only-headline">${HEADLINE}</p>
      <p class="desktop-only-body">${BODY}</p>
      <p class="desktop-only-footnote">${FOOTNOTE}</p>
    </div>
  `;
  document.body.appendChild(root);
}
