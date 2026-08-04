import { TOGGLE_AUDIO_EVENT } from '../audio/AudioSystem';

const WORDMARK = 'Aetheria';

const CREDITS = [
  'environment scans — poly haven (cc0)',
  'fantasy house — quaternius (cc0)',
  'parrot — mirada, ro.me (cc-by)',
  'sound — mixkit',
];

export class SiteNav {
  private readonly root: HTMLElement;
  private readonly panel: HTMLDivElement;

  constructor() {
    this.root = document.createElement('nav');
    this.root.id = 'site-nav';
    this.root.innerHTML = `
      <span class="nav-wordmark">${WORDMARK}</span>
      <span class="nav-actions">
        <button class="nav-item nav-sound" type="button">sound · on</button>
        <button class="nav-item nav-credits" type="button">Credits</button>
      </span>
    `;

    this.panel = document.createElement('div');
    this.panel.id = 'credits-panel';
    this.panel.innerHTML = CREDITS.map((line) => `<p>${line}</p>`).join('');

    document.body.append(this.root, this.panel);

    this.root.querySelector<HTMLButtonElement>('.nav-credits')!.addEventListener('click', () => {
      this.panel.classList.toggle('open');
    });

    const sound = this.root.querySelector<HTMLButtonElement>('.nav-sound')!;
    let soundOn = true;
    sound.addEventListener('click', () => {
      soundOn = !soundOn;
      sound.textContent = soundOn ? 'sound · on' : 'sound · off';
      window.dispatchEvent(new CustomEvent(TOGGLE_AUDIO_EVENT));
    });
  }

  show(): void {
    this.root.classList.add('visible');
  }
}
