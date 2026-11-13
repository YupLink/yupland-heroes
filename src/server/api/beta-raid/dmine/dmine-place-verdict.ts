// Ответ оператора «Посадить» гриб DARAI (dmine-place-sql) → итог для игрока:
// "ok" (встал или повтор того же нажатия) либо ключ отказа словаря (dmine.* /
// mineplace.*). Чистая функция — гоняют тесты.

/** Ответ постановки: повтор, поставлено и почему нет. */
export type DminePlaceRow = {
  was: boolean;
  placed: boolean;
  cell: boolean;
  busy: boolean | null;
  road: boolean | null;
  taken: boolean | null;
  bag: boolean | null;
  player: boolean | null;
  /** Стопка грибов есть в рюкзаке героя. */
  box: boolean;
  /** Годного гриба нет, но есть просроченные (час вышел) — их ставит обход. */
  expired: boolean;
  /** Нашёлся гриб, который ставим (жив, ещё в рюкзаке). */
  dm: boolean;
  moved: boolean | null;
  /** Сколько энергии списано (только если встал). */
  paid?: number | string | null;
};

export function dminePlaceVerdict(row: Partial<DminePlaceRow> | null | undefined): string {
  if (row?.was || row?.placed) return "ok";
  if (!row || !row.cell) return "mineplace.busy";
  if (!row.dm) {
    if (!row.box) return "dmine.no_item";
    return row.expired ? "dmine.expired" : "dmine.gone";
  }
  if (!row.box) return "dmine.no_item";
  if (row.busy || row.taken || row.bag) return "mineplace.busy";
  if (row.road) return "mineplace.road";
  if (row.player) return "mineplace.player";
  if (row.moved) return "mineplace.retry";
  return "mineplace.busy";
}
