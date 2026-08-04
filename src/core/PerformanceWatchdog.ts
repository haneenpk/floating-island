import { downgradeQuality, isQualityOverridden } from './Quality';

const WARMUP_SECONDS = 5;
const WINDOW_SECONDS = 6;
const MIN_AVERAGE_FPS = 22;

export class PerformanceWatchdog {
  private elapsed = 0;
  private windowTime = 0;
  private frames = 0;

  // An explicit ?quality= override is a statement of intent (testing,
  // comparison) — auto-downgrading would just reload into the same override
  // forever. The watchdog only manages automatically-chosen tiers.
  private settled = isQualityOverridden();

  sample(rawDelta: number): void {
    if (this.settled) return;

    this.elapsed += rawDelta;
    if (this.elapsed < WARMUP_SECONDS) return;

    this.windowTime += rawDelta;
    this.frames += 1;
    if (this.windowTime < WINDOW_SECONDS) return;

    this.settled = true;
    const averageFps = this.frames / this.windowTime;
    if (averageFps < MIN_AVERAGE_FPS && downgradeQuality()) {
      window.location.reload();
    }
  }
}
