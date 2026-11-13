/** Frame boundaries of the currently shipped PNGs whose art crosses a 128px cell.
 * Coordinates stay relative to the ORIGINAL cell origin: no scaling/recentering.
 * Left PNGs were mirrored after cutting cells, so recover from the right source
 * and mirror the complete frame at render time. Re-audit when replacing assets.
 */
const boundaries: Record<string, readonly [number, number]> = {
  'dracat/wood/down': [128, 396],
  'dragon/wood/up': [128, 387],
  'unicorn/wood/down': [128, 390],
  'unicorn/wood/up': [128, 389],
  'yupik/wood/down': [128, 397],
  'boar/stone/up': [128, 385],
  'dracat/stone/up': [128, 391],
  'dragon/stone/down': [128, 385],
  'yupik/stone/down': [128, 396],
  'bee/fish/up': [118, 384],
  'boar/fish/up': [122, 384],
  'dracat/fish/down': [125, 384],
  'yupik/fish/down': [118, 384],
  'yupik/fish/up': [120, 384],
};

export function drawActionAtlasFrame(
  g: CanvasRenderingContext2D,
  image: HTMLImageElement,
  rightImage: HTMLImageElement | undefined,
  frame: number,
  x: number, y: number, size: number,
): void {
  const match = image.src.match(/\/hero-actions\/([^/]+)\/(wood|stone|fish|hand)\/(left|right)-(up|down)\.(?:png|webp)(?:[?#]|$)/);
  const edges = match && boundaries[`${match[1]}/${match[2]}/${match[4]}`];
  const left = match?.[3] === 'left';
  const source = left ? rightImage : image;
  if (!edges || !source?.complete || source.naturalWidth !== 512 || source.naturalHeight !== 128) {
    g.drawImage(image, frame * 128, 0, 128, 128, x, y, size, size);
    return;
  }
  const cuts = [0, edges[0], 256, edges[1], 512];
  const sx = cuts[frame], sw = cuts[frame + 1] - sx;
  const offset = (sx - frame * 128) * size / 128;
  g.save();
  if (left) { g.translate(2 * x + size, 0); g.scale(-1, 1); }
  g.drawImage(source, sx, 0, sw, 128, x + offset, y, sw * size / 128, size);
  g.restore();
}
