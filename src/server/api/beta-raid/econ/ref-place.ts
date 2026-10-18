// Клетка карты из ref леджера — чтобы в ленте игрока у порталов, ворот и
// складов было «где», а не только «сколько». Форматы ref заданы в точках
// оплаты (portal-use, gate-toll, warehouse-take, building-action, mines,
// tree-levelup, chambers, field-recall, oblivion-temple) и здесь только читаются.
export type RefPlace = { mapId: string; q: number; r: number };

function pick(
  mapId: string | undefined,
  qs: string | undefined,
  rs: string | undefined,
): RefPlace | null {
  const q = Number(qs);
  const r = Number(rs);
  return mapId && qs && rs && Number.isFinite(q) && Number.isFinite(r) ? { mapId, q, r } : null;
}

/**
 * portal/gate/wh-take/town-* несут '<map>:<q,r>', build/mine/field_recall/
 * oblivion — '<map>:<q>:<r>', tree/chambers — '<кто>:<map>:<q>:<r>'. Остальное —
 * без места.
 */
export function refPlace(ref: string | null): RefPlace | null {
  if (!ref) return null;
  const p = ref.split(":");
  switch (p[0]) {
    case "portal":
    case "gate":
    case "wh-take":
    case "town-buy":
    case "town-sell": {
      const [qs, rs] = (p[2] ?? "").split(",");
      return pick(p[1], qs, rs);
    }
    case "build":
    case "mine":
    case "field_recall":
    case "oblivion":
      return pick(p[1], p[2], p[3]);
    case "tree":
    case "chambers":
      return pick(p[2], p[3], p[4]);
    default:
      return null;
  }
}
