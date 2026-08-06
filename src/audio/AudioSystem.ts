import {
  Audio,
  AudioListener,
  Object3D,
  PositionalAudio,
  Vector3,
  type PerspectiveCamera,
} from 'three';
import type { AssetManager } from '../assets/AssetManager';
import type { Time } from '../core/Time';
import { SeededRandom } from '../procgen/SeededRandom';
import type { FloatingIsland } from '../scene/islands/FloatingIsland';
import type { Updatable } from '../scene/Updatable';

const ROOT = '/assets/audio';
// gentle master fade: the world's voice swells in over the fly-in rather
// than switching on at the Enter click
const FADE_RATE = 0.18;

export const TOGGLE_AUDIO_EVENT = 'island:toggle-audio';

export class AudioSystem implements Updatable {
  private readonly listener: AudioListener;
  private readonly random = new SeededRandom(0x50f7);

  private chirpBuffers: AudioBuffer[] = [];
  private chirpPlayer: Audio | null = null;
  private nextChirpIn = 7;

  private targetVolume = 0;
  private muted = false;
  private begun = false;
  private masterRate = FADE_RATE;

  // indoors the world's voice drops to a murmur; near the open round
  // window it drifts back in. The hearth's own crackle is exempt.
  private indoor = false;
  private windowWorld: Vector3 | null = null;
  private indoorFactor = 1;
  private readonly scratch = new Vector3();
  private readonly exterior: { audio: Audio | PositionalAudio; base: number }[] = [];
  private fireAnchor: Object3D | null = null;

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly assets: AssetManager,
  ) {
    this.listener = new AudioListener();
    this.listener.setMasterVolume(0);
    camera.add(this.listener);

    window.addEventListener(TOGGLE_AUDIO_EVENT, () => {
      this.muted = !this.muted;
      // the sound toggle should answer quickly; only the first swell is slow
      this.masterRate = 1.4;
    });
  }

  /**
   * Loads and starts the world's voice. Called from a user gesture (Enter),
   * which also satisfies browser autoplay policy; the master volume then
   * fades up gradually through the fly-in.
   */
  async begin(island: FloatingIsland): Promise<void> {
    if (this.begun) return;
    this.begun = true;

    await this.listener.context.resume();

    const [wind, forest, falls, river, fire, ...chirps] = await Promise.all([
      this.assets.loadAudio('wind', `${ROOT}/wind_loop.mp3`),
      this.assets.loadAudio('forest', `${ROOT}/forest_loop.mp3`),
      this.assets.loadAudio('waterfall', `${ROOT}/waterfall_loop.mp3`),
      this.assets.loadAudio('river', `${ROOT}/river_loop.mp3`),
      this.assets.loadAudio('fire', `${ROOT}/fire_loop.mp3`),
      this.assets.loadAudio('chirp-1', `${ROOT}/chirp_1.mp3`),
      this.assets.loadAudio('chirp-2', `${ROOT}/chirp_2.mp3`),
      this.assets.loadAudio('chirp-3', `${ROOT}/chirp_3.mp3`),
    ]);

    this.playAmbient(wind!, 0.5);
    this.playAmbient(forest!, 0.32);

    // The falls roar from the rim lip; the stream murmurs from mid-river.
    const surface = island.surface;
    const exitDirX = Math.cos(1.0);
    const exitDirZ = Math.sin(1.0);
    const rim = surface.capRadiusAt(exitDirX, exitDirZ);
    const fallsX = exitDirX * rim * 0.95;
    const fallsZ = exitDirZ * rim * 0.95;
    this.playPositional(island, falls!, fallsX, surface.getHeightAt(fallsX, fallsZ) - 2.5, fallsZ, {
      volume: 0.9,
      refDistance: 6,
      rolloff: 1.4,
    });

    const mid = surface.riverPath?.points[20];
    if (mid) {
      this.playPositional(island, river!, mid.x, surface.getHeightAt(mid.x, mid.z) + 0.3, mid.z, {
        volume: 0.5,
        refDistance: 3.5,
        rolloff: 1.2,
      });
    }

    // the hearth crackles from the fireplace itself: positional, so it
    // swells as you come close — and it ignores the indoor muffle
    if (this.fireAnchor && fire) {
      const crackle = new PositionalAudio(this.listener);
      crackle.setBuffer(fire);
      crackle.setLoop(true);
      crackle.setVolume(1.5);
      crackle.setRefDistance(1.8);
      crackle.setRolloffFactor(1.1);
      crackle.play();
      this.fireAnchor.add(crackle);
    }

    this.chirpBuffers = chirps as AudioBuffer[];
    this.chirpPlayer = new Audio(this.listener);

    this.targetVolume = 1;
  }

  /** Muffle the outside world while inside the cottage. */
  setIndoor(indoor: boolean, windowWorld: Vector3 | null = null): void {
    this.indoor = indoor;
    this.windowWorld = windowWorld;
  }

  /** The hearth object the fire crackle plays from (set before begin()). */
  attachFire(anchor: Object3D): void {
    this.fireAnchor = anchor;
  }

  update(time: Time): void {
    let indoorGoal = 1;
    if (this.indoor) {
      indoorGoal = 0.28;
      if (this.windowWorld) {
        const distance = this.camera.getWorldPosition(this.scratch).distanceTo(this.windowWorld);
        const near = Math.min(Math.max(1 - (distance - 1.2) / 3.2, 0), 1);
        indoorGoal += 0.37 * near;
      }
    }
    this.indoorFactor += (indoorGoal - this.indoorFactor) * (1 - Math.exp(-time.delta * 2.2));
    // the muffle lands on the outside voices only — the hearth stays crisp
    for (const entry of this.exterior) {
      entry.audio.setVolume(entry.base * this.indoorFactor);
    }

    const goal = this.muted ? 0 : this.targetVolume;
    const current = this.listener.getMasterVolume();
    this.listener.setMasterVolume(
      current + (goal - current) * (1 - Math.exp(-time.delta * this.masterRate)),
    );

    if (!this.begun || this.muted || this.chirpBuffers.length === 0) return;

    this.nextChirpIn -= time.delta;
    if (this.nextChirpIn <= 0 && this.chirpPlayer && !this.chirpPlayer.isPlaying) {
      const buffer = this.chirpBuffers[this.random.int(0, this.chirpBuffers.length - 1)]!;
      this.chirpPlayer.setBuffer(buffer);
      this.chirpPlayer.setVolume(this.random.range(0.3, 0.5) * this.indoorFactor);
      this.chirpPlayer.setPlaybackRate(this.random.range(0.92, 1.12));
      this.chirpPlayer.play();
      this.nextChirpIn = this.random.range(9, 26);
    }
  }

  private playAmbient(buffer: AudioBuffer, volume: number): void {
    const audio = new Audio(this.listener);
    audio.setBuffer(buffer);
    audio.setLoop(true);
    audio.setVolume(volume);
    audio.play();
    this.exterior.push({ audio, base: volume });
  }

  private playPositional(
    island: FloatingIsland,
    buffer: AudioBuffer,
    x: number,
    y: number,
    z: number,
    options: { volume: number; refDistance: number; rolloff: number },
  ): void {
    const holder = new Object3D();
    holder.position.set(x, y, z);
    island.add(holder);

    const audio = new PositionalAudio(this.listener);
    audio.setBuffer(buffer);
    audio.setLoop(true);
    audio.setVolume(options.volume);
    audio.setRefDistance(options.refDistance);
    audio.setRolloffFactor(options.rolloff);
    audio.play();
    holder.add(audio);
    this.exterior.push({ audio, base: options.volume });
  }
}
