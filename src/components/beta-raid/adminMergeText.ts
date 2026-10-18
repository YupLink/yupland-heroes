// Тексты режима «Объединить» в режиме бога — на двух языках (как adminCellText).
import type { Lang } from "@/lib/store";
import { MERGE_MAX_CELLS, MERGE_MIN_CELLS } from "@/lib/mergeScale";

export type MergeText = ReturnType<typeof mergeText>;

export function mergeText(lang: Lang) {
  const ru = lang !== "en";
  const p = (r: string, e: string) => (ru ? r : e);
  return {
    pickHint: p(
      `Тапай ${MERGE_MIN_CELLS}–${MERGE_MAX_CELLS} соседние клетки, потом —`,
      `Tap ${MERGE_MIN_CELLS}–${MERGE_MAX_CELLS} adjacent tiles, then —`,
    ),
    mergeBtn: p("Объединить", "Merge"),
    blockHint: p(
      "Тап по готовому блоку — масштаб и разъединение.",
      "Tap a block for scale and split.",
    ),
    block: p("Блок", "Block"),
    cellsShort: p("кл.", "tiles"),
    smaller: p("Меньше на 5 %", "5 % smaller"),
    bigger: p("Больше на 5 %", "5 % bigger"),
    unmerge: p("Разъединить", "Split"),
    merged: p("Объединено — осталось выгрузить", "Merged — upload to apply"),
    tooFew: p("Выдели хотя бы две клетки", "Pick at least two tiles"),
    tooMany: p(
      `Не больше ${MERGE_MAX_CELLS} клеток в одном блоке`,
      `At most ${MERGE_MAX_CELLS} tiles per block`,
    ),
    notAdjacent: p("Клетки должны быть соседями", "Tiles must be adjacent"),
    noGround: p("В блоке есть клетка без местности", "A tile in the block has no terrain"),
    alreadyGrouped: p("Клетка уже в другом блоке", "A tile is already in another block"),
    manyBuildings: p(
      "В блоке может стоять только одна постройка",
      "A block can hold only one building",
    ),
    manyDecors: p("В блоке может стоять только один декор", "A block can hold only one decoration"),
  };
}
