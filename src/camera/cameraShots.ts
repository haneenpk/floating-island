export interface CameraShot {
  position: [number, number, number];
  target: [number, number, number];
}

/**
 * The scroll story, evenly spaced along scroll progress. Positions are
 * island-space (the island drifts subtly around the origin).
 *
 * 1. Arrival — where the fly-in lands: among the meadow, elder tree left,
 *    cottage right, the world at arm's length.
 * 2. The falls — drop below the rim, water pouring toward camera, cloud sea.
 * 3. The ascent — climbing the cliff wall past strata and hanging roots.
 * 4. The meadow — low over the grass, following the river upstream.
 * 5. The elder tree — under the canopy, looking up through the branches.
 * 6. The reveal — pull far back and above: one island alone in the sky.
 */
export const CAMERA_SHOTS: CameraShot[] = [
  { position: [14, 3.5, 16], target: [0, 6.5, 0] },
  { position: [17, -7, 29], target: [5, -1, 9] },
  { position: [-15, -5, 23], target: [-2, 1, 2] },
  { position: [-17, 6, 11], target: [-3, 3.5, 2.5] },
  { position: [3, 5, 9], target: [-3, 15, 2.6] },
  { position: [55, 28, 80], target: [0, 2, 0] },
];
