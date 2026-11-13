// Ответ оператора постановки → итог для игрока: поставлено (или повтор того же
// нажатия) либо ключ отказа словаря (mineplace.*, lib/translations/braid-mineplace).
// Отказ «мало природы» несёт числа: «Рядом мало деревьев: 2 из 3». Золотой и
// алмазной шахте нужна жила под клеткой: «Здесь нет золотой жилы».
import {
  MINE_PLACE_NATURE,
  MINE_PLACE_NEED,
  MINE_PLACE_VEIN,
  isVeinBlueprint,
  natureCount,
  type PlaceableBlueprint,
} from "@/lib/minePlacement";
import type { PlaceMineRow } from "@/server/api/beta-raid/mine-place/mine-place-sql";

/** Не хватает места: природы вокруг или жилы под клеткой; null — хватает. */
function needVerdict(row: Partial<PlaceMineRow>, kind: PlaceableBlueprint): string | null {
  if (isVeinBlueprint(kind)) {
    return row.vein === true ? null : `mineplace.need_vein_${MINE_PLACE_VEIN[kind]}`;
  }
  const around = { trees: Number(row.trees ?? 0), mountains: Number(row.mountains ?? 0) };
  const n = natureCount(kind, around);
  if (n >= MINE_PLACE_NEED) return null;
  const key = MINE_PLACE_NATURE[kind] === "tree" ? "need_trees" : "need_mountains";
  return `mineplace.${key}|${JSON.stringify({ n, need: MINE_PLACE_NEED })}`;
}

/**
 * Почему шахту на эту клетку не поставить (без заготовки и прохода); null —
 * клетка годится. Одно правило на постановку и на кандидатов режима стройки.
 */
export function cellVerdict(
  row: Partial<PlaceMineRow> | null | undefined,
  kind: PlaceableBlueprint,
): string | null {
  if (!row || !row.cell) return "mineplace.busy";
  // Мешочек держит клетку так же, как сундук.
  if (row.busy || row.taken || row.bag) return "mineplace.busy";
  if (row.road) return "mineplace.road";
  if (row.player) return "mineplace.player";
  return needVerdict(row, kind);
}

/** "ok" — шахта стоит; иначе текст ошибки для Error (ключ или «ключ|{json}»). */
export function placeVerdict(
  row: Partial<PlaceMineRow> | null | undefined,
  kind: PlaceableBlueprint,
): "ok" | string {
  if (row?.was || row?.placed) return "ok";
  if (!row || !row.cell) return "mineplace.busy";
  if (!row.box) return "mineplace.no_blueprint";
  const bad = cellVerdict(row, kind);
  if (bad) return bad;
  // Рядом поставили шахту, пока шла проверка прохода, — повтор проверит с ней.
  if (row.moved) return "mineplace.retry";
  // Всё сошлось, а постройка не встала — клетку заняли между проверкой и записью.
  return "mineplace.busy";
}
