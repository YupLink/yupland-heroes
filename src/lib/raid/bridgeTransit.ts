/** A bridge cell keeps water below a pedestrian deck. Axes use axial hex directions. */
export type HexCell = { q: number; r: number };
export type BridgeAxes = { deckAxis: 0 | 1 | 2; channelAxis: 0 | 1 | 2 };

const AXES = [
  { q: 1, r: 0 },
  { q: 0, r: 1 },
  { q: 1, r: -1 },
] as const;

export function bridgeAxes(value: unknown): BridgeAxes | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const deckAxis = raw.deckAxis;
  const channelAxis = raw.channelAxis;
  if (![0, 1, 2].includes(Number(deckAxis)) || ![0, 1, 2].includes(Number(channelAxis))) return null;
  if (deckAxis === channelAxis || !Number.isInteger(deckAxis) || !Number.isInteger(channelAxis)) return null;
  return { deckAxis: deckAxis as 0 | 1 | 2, channelAxis: channelAxis as 0 | 1 | 2 };
}

export function edgeAxis(from: HexCell, to: HexCell): 0 | 1 | 2 | null {
  const q = to.q - from.q;
  const r = to.r - from.r;
  for (let i = 0; i < AXES.length; i++) {
    if ((q === AXES[i].q && r === AXES[i].r) || (q === -AXES[i].q && r === -AXES[i].r)) {
      return i as 0 | 1 | 2;
    }
  }
  return null;
}

/** A walker may enter or leave the deck only along the marked deck axis. */
export function canWalkBridgeEdge(from: HexCell, to: HexCell, fromBridge: BridgeAxes | null | undefined, toBridge: BridgeAxes | null | undefined): boolean {
  const axis = edgeAxis(from, to);
  if (axis === null) return false;
  return (!fromBridge || fromBridge.deckAxis === axis) && (!toBridge || toBridge.deckAxis === axis);
}

export type WaterCell = { water: boolean; ocean: boolean; blocked: boolean; bridge: BridgeAxes | null };
export type Transit = { exit: HexCell; crossed: HexCell[]; oceanCount: number };

/** Ship skips every bridge cell in one server action; none can become a stopping point. */
export function shipTransit(
  from: HexCell,
  direction: HexCell,
  cellAt: (cell: HexCell) => WaterCell | null,
  maxSpan = 12,
): Transit | null {
  const first = { q: from.q + direction.q, r: from.r + direction.r };
  const axis = edgeAxis(from, first);
  if (axis === null || maxSpan < 1) return null;
  const crossed: HexCell[] = [];
  let oceanCount = 0;
  for (let i = 1; i <= maxSpan + 1; i++) {
    const at = { q: from.q + direction.q * i, r: from.r + direction.r * i };
    const cell = cellAt(at);
    if (!cell || !cell.water || cell.blocked) return null;
    if (cell.bridge) {
      if (cell.bridge.channelAxis !== axis || i > maxSpan) return null;
      crossed.push(at);
      if (cell.ocean) oceanCount++;
      continue;
    }
    if (crossed.length === 0) return null;
    if (cell.ocean) oceanCount++;
    return { exit: at, crossed, oceanCount };
  }
  return null;
}
