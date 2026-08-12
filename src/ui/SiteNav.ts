import { TOGGLE_AUDIO_EVENT } from '../audio/AudioSystem';
import { chooseQualityTier, getQuality } from '../core/Quality';

const WORDMARK = 'Aetheria';

export class SiteNav {
  private readonly root: HTMLElement;
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
      </span>
    `;

    document.body.append(this.root);

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

  /** Indoors: only the sound toggle remains (switching detail would reload). */
  setInterior(inside: boolean): void {
    this.interior = inside;
    this.root.classList.toggle('interior', inside);
  }

  show(): void {
    this.root.classList.add('visible');
  }
}
