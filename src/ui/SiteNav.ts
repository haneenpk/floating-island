import { TOGGLE_AUDIO_EVENT } from '../audio/AudioSystem';
import { chooseQualityTier, getQuality } from '../core/Quality';

const WORDMARK = 'Aetheria';

const CREDITS = [
  'environment scans & skies — poly haven (cc0)',
  'house & interior props — quaternius (cc0)',
  'parrot — mirada, ro.me (cc-by)',
  'sound — mixkit',
  'type — cinzel by natanael gama (ofl)',
];

export class SiteNav {
  private readonly root: HTMLElement;
  private readonly panel: HTMLDivElement;
  private readonly soundButton: HTMLButtonElement;
  private soundOn = true;
  private interior = false;

  constructor() {
    this.root = document.createElement('nav');
    this.root.id = 'site-nav';
    this.root.innerHTML = `
      <span class="nav-wordmark">${WORDMARK}</span>
      <span class="nav-actions">
        <button class="nav-item nav-detail" type="button" title="richer light, sharper textures — costs frames">
          detail · ${getQuality().tier === 'medium' ? 'on' : 'off'}
        </button>
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

    this.soundButton = this.root.querySelector<HTMLButtonElement>('.nav-sound')!;
    this.soundButton.addEventListener('click', () => this.toggleSound());

    // detail decides texture sizes, model LODs and shadows at startup, so
    // switching it reloads into the other tier
    this.root.querySelector<HTMLButtonElement>('.nav-detail')!.addEventListener('click', () => {
      chooseQualityTier(getQuality().tier === 'medium' ? 'low' : 'medium');
    });

    // inside the cottage the cursor is captured — M toggles the sound
    window.addEventListener('keydown', (event) => {
      if (event.repeat || event.key.toLowerCase() !== 'm') return;
      if (!this.interior) return;
      this.toggleSound();
    });
  }

  private toggleSound(): void {
    this.soundOn = !this.soundOn;
    this.soundButton.textContent = this.soundOn ? 'sound · on' : 'sound · off';
    window.dispatchEvent(new CustomEvent(TOGGLE_AUDIO_EVENT));
  }

  /** Indoors: credits step aside; only the sound toggle remains (and M). */
  setInterior(inside: boolean): void {
    this.interior = inside;
    this.root.classList.toggle('interior', inside);
    if (inside) this.panel.classList.remove('open');
  }

  show(): void {
    this.root.classList.add('visible');
  }
}
