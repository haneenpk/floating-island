export interface PanelContent {
  title: string;
  html: string;
  /** wide layout for image grids */
  wide?: boolean;
}

/**
 * The storybook overlay: one reusable panel that the cottage's objects open
 * onto — the story, the world map, the gallery, the crystal. Esc, the close
 * button, or a click on the dimmed backdrop returns to the room.
 */
export class StoryPanel {
  private readonly backdrop: HTMLDivElement;
  private readonly card: HTMLDivElement;
  private readonly title: HTMLHeadingElement;
  private readonly body: HTMLDivElement;

  constructor() {
    this.backdrop = document.createElement('div');
    this.backdrop.id = 'story-panel';

    this.card = document.createElement('div');
    this.card.className = 'story-card';

    const close = document.createElement('button');
    close.className = 'story-close';
    close.type = 'button';
    close.setAttribute('aria-label', 'close');
    close.textContent = '×';
    close.addEventListener('click', () => this.hide());

    this.title = document.createElement('h2');
    this.body = document.createElement('div');
    this.body.className = 'story-body';

    this.card.append(close, this.title, this.body);
    this.backdrop.appendChild(this.card);
    document.body.appendChild(this.backdrop);

    this.backdrop.addEventListener('pointerdown', (event) => {
      if (event.target === this.backdrop) this.hide();
    });
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.isOpen()) this.hide();
    });
  }

  isOpen(): boolean {
    return this.backdrop.classList.contains('visible');
  }

  show(content: PanelContent): void {
    this.title.textContent = content.title;
    this.body.innerHTML = content.html;
    this.card.classList.toggle('wide', content.wide === true);
    this.backdrop.classList.add('visible');
    // reading needs the cursor back; walking/looking pause via this class
    document.body.classList.add('overlay-open');
    if (document.pointerLockElement) document.exitPointerLock();
    this.body.scrollTop = 0;
  }

  hide(): void {
    this.backdrop.classList.remove('visible');
    document.body.classList.remove('overlay-open');
  }
}
