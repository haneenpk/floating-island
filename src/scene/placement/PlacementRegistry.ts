import { hasDebugFlag } from '../../utils/debug';

export interface PlacementRecord {
  x: number;
  y: number;
  z: number;
  normalX: number;
  normalY: number;
  normalZ: number;
  valid: boolean;
}

const records: PlacementRecord[] = [];
let enabled: boolean | null = null;

export function isPlacementDebugEnabled(): boolean {
  if (enabled === null) {
    enabled = hasDebugFlag('placement');
  }
  return enabled;
}

export function recordPlacement(record: PlacementRecord): void {
  if (isPlacementDebugEnabled()) {
    records.push(record);
  }
}

export function getPlacementRecords(): readonly PlacementRecord[] {
  return records;
}
