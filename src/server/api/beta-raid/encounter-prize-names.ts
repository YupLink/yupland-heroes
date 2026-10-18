// Приз одной строкой: «50 GDarai», «Forest Pack», «200 энергии».
//
// Паки и предметы хранятся id-шниками, поэтому подписи тянем из базы одним
// запросом на весь список — иначе в таблице мест игрок видел бы «pack cp_…».
import { pg } from "../../db/pg";
import type { PlacePrize } from "./encounter-prizes";

// Подписи как в блоке наград боя, только без эмодзи и без склонений:
// доли мест дробные («2,5 лайка»), и склонять их — лишний шум.
export type PrizeView = {
  /** energy | likes | darai | токен (GDarai, HOPE…) | pack | item */
  kind: string;
  amount: number;
  /**
   * Для пака, предмета и своего товара — название из справочника.
   *
   * Пусто и у остальных видов, и когда справочник имени не дал (пак снят,
   * товар удалён): запасную подпись собирает КЛИЕНТ на своём языке
   * (prizeFallbackKey). Сервер языка игрока не знает, и прежний запас
   * «Пак / Предмет / Товар» приезжал английскому игроку по-русски.
   */
  name?: string;
};

/** Готовит подписи для всех призов сразу и отдаёт функцию-форматтер. */
export async function prizeNames(prizes: PlacePrize[][]): Promise<(p: PlacePrize) => PrizeView> {
  const flat = prizes.flat();
  const packIds = [...new Set(flat.filter((p) => p.kind === "pack").map((p) => p.packId!))];
  const itemIds = [...new Set(flat.filter((p) => p.kind === "item").map((p) => p.packId!))];

  const names = new Map<string, string>();
  if (packIds.length > 0) {
    const { data } = await pg.chipPacks.raw().select("id,name").in("id", packIds);
    for (const r of (data ?? []) as Array<{ id: string; name: string }>) names.set(r.id, r.name);
  }
  if (itemIds.length > 0) {
    const { data } = await pg.mysticItemTemplates.raw().select("id,name").in("id", itemIds);
    for (const r of (data ?? []) as Array<{ id: string; name: string }>) names.set(r.id, r.name);
  }
  // Свой товар живёт в другом справочнике: без этого запроса игрок читал бы
  // в таблице мест «custom cst_7ce4…» вместо «Пшеница».
  const customIds = [...new Set(flat.filter((p) => p.kind === "custom").map((p) => p.packId!))];
  if (customIds.length > 0) {
    const { mcpExec } = await import("../../db/mcpClient");
    const { sqlStr } = await import("../raid-shared");
    const rows = (await mcpExec(
      `SELECT id, name FROM yuplink.raid_custom_item
        WHERE id IN (${customIds.map((id) => sqlStr(id)).join(",")});`,
      { wrapJson: true },
    ).catch(() => [])) as Array<{ id: string; name: string }>;
    for (const r of rows ?? []) names.set(r.id, r.name);
  }

  return (p: PlacePrize): PrizeView => {
    if (p.kind === "pack" || p.kind === "item" || p.kind === "custom") {
      // Имени нет — отдаём пусто, а не русское слово: подпись по виду соберёт
      // клиент на своём языке (см. комментарий у PrizeView.name).
      return { kind: p.kind, amount: p.amount, name: names.get(p.packId ?? "") };
    }
    return { kind: p.kind, amount: p.amount };
  };
}
