export class FadeOverlay {
  private readonly root: HTMLDivElement;

  constructor() {
    this.root = document.createElement('div');
    this.root.id = 'fade-overlay';
    document.body.appendChild(this.root);
  }

  /** Fade to black over `seconds`, resolving once fully dark. */
  toBlack(seconds: number): Promise<void> {
    return this.transition(seconds, '1');
  }

  /** Fade back to the world over `seconds`. */
  toClear(seconds: number): Promise<void> {
    return this.transition(seconds, '0');
  }

  private transition(seconds: number, opacity: string): Promise<void> {
    this.root.style.transitionDuration = `${seconds}s`;
    // force a style flush so the new duration applies to this transition
    void this.root.offsetHeight;
    this.root.style.opacity = opacity;
    return new Promise((resolve) => window.setTimeout(resolve, seconds * 1000));
  }
}
