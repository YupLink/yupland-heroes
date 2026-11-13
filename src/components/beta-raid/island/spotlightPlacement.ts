type Rect = { x: number; y: number; w: number; h: number };
type Viewport = { left: number; top: number; width: number; height: number };
type Panel = { left: number; top: number; right: number; bottom: number };

/** The castle's skip control owns the lower lane; hints use the area above it. */
export function reserveSpotlightFooter(viewport: Viewport, footer?: Panel | null): Viewport {
  if (!footer || footer.right <= viewport.left || footer.left >= viewport.left + viewport.width ||
    footer.top >= viewport.top + viewport.height || footer.bottom <= viewport.top) return viewport;
  return { ...viewport, height: Math.max(1, footer.top - 8 - viewport.top) };
}

/** Use measured tip size; a tall target must never push the hint off screen. */
export function placeSpotlightTip(target: Rect, tip: { width: number; height: number }, viewport: Viewport, panel?: Panel) {
  const edge = 8;
  const maxWidth = Math.max(1, viewport.width - edge * 2);
  const maxHeight = Math.max(1, viewport.height - edge * 2);
  const width = Math.min(tip.width, maxWidth);
  const height = Math.min(tip.height, maxHeight);
  const leftEdge = viewport.left + Math.min(edge, viewport.width / 2);
  const topEdge = viewport.top + Math.min(edge, viewport.height / 2);
  const right = Math.max(leftEdge, viewport.left + viewport.width - edge - width);
  const bottom = Math.max(topEdge, viewport.top + viewport.height - edge - height);
  const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(value, high));
  const left = clamp(target.x + target.w / 2 - width / 2, leftEdge, right);
  const below = target.y + target.h + 10;
  const above = target.y - height - 10;
  let top = below <= bottom && below >= topEdge ? below
    : above >= topEdge && above <= bottom ? above : bottom;
  if (panel && left < panel.right && left + width > panel.left && top < panel.bottom && top + height > panel.top) {
    const underPanel = panel.bottom + edge;
    const overPanel = panel.top - height - edge;
    if (underPanel <= bottom && underPanel >= topEdge) top = underPanel;
    else if (overPanel >= topEdge && overPanel <= bottom) top = overPanel;
  }
  return { left, top: clamp(top, topEdge, bottom), maxWidth, maxHeight };
}

