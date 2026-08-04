export class ScrollController {
  private readonly spacer: HTMLDivElement;

  constructor(pageHeights = 6) {
    this.spacer = document.createElement('div');
    this.spacer.id = 'scroll-space';
    this.spacer.style.height = `${pageHeights * 100}vh`;
    this.spacer.style.pointerEvents = 'none';
    document.body.appendChild(this.spacer);
  }

  get progress(): number {
    const range = document.documentElement.scrollHeight - window.innerHeight;
    if (range <= 0) return 0;
    return Math.min(Math.max(window.scrollY / range, 0), 1);
  }

  dispose(): void {
    this.spacer.remove();
  }
}
