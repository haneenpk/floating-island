import { CanvasTexture, SRGBColorSpace, type Texture } from 'three';

/**
 * Repainting the traveler.
 *
 * The character pack dresses its rogue in green over brown, and the whole
 * costume comes out of one 1024px sheet laid out as an 8 x 4 grid of flat
 * vertical gradients — one cell per material. Nothing is painted; every
 * surface just samples the cell it belongs to. That makes the costume
 * recolourable exactly, by rewriting cells rather than by tinting meshes:
 * a tint could only scale the channels it was given, and green has no blue
 * in it to scale.
 *
 * Each cell keeps its own light-to-dark ramp — the shading the model was
 * built around — and is simply moved onto a new colour.
 */

const COLUMNS = 8;
const ROWS = 4;
/** The sheet is redrawn at this size: the cells are flat, so it loses nothing. */
const CANVAS = 256;

export interface CellColour {
  /** grid column, 0-7 */
  column: number;
  /** grid row, 0-3 */
  row: number;
  /** what that surface becomes */
  colour: number;
}

function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Redraw the costume sheet with the given cells moved onto new colours.
 *
 * A cell's mean brightness is measured first, then every pixel in it is set
 * to the target colour scaled by how light or dark that pixel was against
 * the mean. The folds and the shading survive; only the hue changes.
 */
export function recolourCostume(source: Texture, cells: CellColour[]): CanvasTexture | null {
  const image = source.image as CanvasImageSource | null;
  if (!image) return null;

  const canvas = document.createElement('canvas');
  canvas.width = CANVAS;
  canvas.height = CANVAS;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;

  context.drawImage(image, 0, 0, CANVAS, CANVAS);

  const cellWidth = CANVAS / COLUMNS;
  const cellHeight = CANVAS / ROWS;

  for (const cell of cells) {
    const x = Math.round(cell.column * cellWidth);
    const y = Math.round(cell.row * cellHeight);
    const width = Math.round(cellWidth);
    const height = Math.round(cellHeight);

    const patch = context.getImageData(x, y, width, height);
    const pixels = patch.data;

    let total = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      total += luminance(pixels[i]!, pixels[i + 1]!, pixels[i + 2]!);
    }
    const mean = total / (pixels.length / 4) || 1;

    const red = (cell.colour >> 16) & 0xff;
    const green = (cell.colour >> 8) & 0xff;
    const blue = cell.colour & 0xff;

    for (let i = 0; i < pixels.length; i += 4) {
      const shade = luminance(pixels[i]!, pixels[i + 1]!, pixels[i + 2]!) / mean;
      pixels[i] = Math.min(255, red * shade);
      pixels[i + 1] = Math.min(255, green * shade);
      pixels[i + 2] = Math.min(255, blue * shade);
    }
    context.putImageData(patch, x, y);
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.flipY = source.flipY;
  texture.anisotropy = source.anisotropy;
  texture.needsUpdate = true;
  return texture;
}
