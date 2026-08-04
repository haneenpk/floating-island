const TITLE = 'Aetheria';
const SUBTITLE = 'a little world above the clouds';
const ENTER_LABEL = 'Enter';
const HINT_LABEL = 'scroll to explore';

export class LandingOverlay {
  private readonly root: HTMLDivElement;
  private readonly hint: HTMLDivElement;

  constructor(onEnter: () => void) {
    this.root = document.createElement('div');
    this.root.id = 'landing';
    this.root.innerHTML = `
      <h1 class="landing-title">${TITLE}</h1>
      <p class="landing-subtitle">${SUBTITLE}</p>
      <button class="landing-enter" type="button">${ENTER_LABEL}</button>
    `;

    this.hint = document.createElement('div');
    this.hint.id = 'scroll-hint';
    this.hint.textContent = HINT_LABEL;

    document.body.append(this.root, this.hint);

    const button = this.root.querySelector<HTMLButtonElement>('.landing-enter')!;
    button.addEventListener(
      'click',
      () => {
        this.root.classList.add('leaving');
        window.setTimeout(() => this.root.remove(), 900);
        onEnter();
      },
      { once: true },
    );
  }

  show(): void {
    this.root.classList.add('visible');
  }

  /** Called when the fly-in has landed and scrolling becomes possible. */
  showHint(): void {
    this.hint.classList.add('visible');
    window.addEventListener(
      'scroll',
      () => {
        this.hint.classList.remove('visible');
        window.setTimeout(() => this.hint.remove(), 1600);
      },
      { once: true, passive: true },
    );
  }
}
