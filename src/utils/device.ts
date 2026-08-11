/**
 * Is this a phone or tablet? Aetheria asks for a mouse to look, a keyboard
 * to walk, and a GPU to hold up the sky, so handhelds get a note instead of
 * a world that would fight them.
 *
 * Touch alone is not the test — plenty of laptops have touchscreens. A
 * device whose *primary* pointer is coarse and cannot hover is a handheld.
 */
export function isHandheld(): boolean {
  if (typeof window.matchMedia !== 'function') return false;

  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
  const cannotHover = window.matchMedia('(hover: none)').matches;
  if (coarsePointer && cannotHover) return true;

  // iPads report themselves as desktop Safari; the touch count gives them away
  const isIpad = navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent);
  return isIpad;
}
