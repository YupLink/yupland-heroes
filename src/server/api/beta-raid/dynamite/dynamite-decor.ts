// Деревья и горы под взрывом динамита (lib/dynamite): что на клетках взрыва и
// что с них выпадет — то же, что дала бы рубка (decor-interact): товар шаблона,
// кость количества (amount «2-5»), метка «собрано» (loot), стопка по канону вида
// (groupItems) и срок порции мешочка. Красный — только деревья (топор), синий — только
// горы, камни, преграды (кирка): blastDecorClass + dynamiteBreaksDecor. Снимает декор и кладёт мешочек функция базы — под
// локами и только если декор всё ещё на клетке (dynamite-01).
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { amountRange, rollAmount } from "@/lib/raid/decorInteract";
import {
  blastCells,
  blastDecorClass,
  dynamiteBreaksDecor,
  type DynamiteKind,
} from "@/lib/dynamite";
import {
  loadInteractiveDecor,
  type DecorInteractView,
} from "@/server/api/beta-raid/decor-interact-load";
import { groupItems } from "@/server/api/beta-raid/loot-bag/bag-deliver-parts";
import {
  blastItemsOf,
  type BlastDecorIn,
  type BlastItem,
} from "@/server/api/beta-raid/dynamite/dynamite-bag-items";

type Hex = { q: number; r: number };

/** Декор клеток взрыва — семи у красного, одной у синего (купол и город отсеет база). */
export const blastDecorSql = (mapId: string, at: Hex, kind: DynamiteKind = "red"): string => {
  const list = blastCells(at, kind)
    .map((c) => `(${Math.trunc(c.q)}, ${Math.trunc(c.r)})`)
    .join(", ");
  return `SELECT c.q, c.r, c.decoration_id AS d
       FROM yuplink.raid_map_cells c
      WHERE c.map_id = ${sqlStr(mapId)} AND (c.q, c.r) IN (${list})
        AND c.decoration_id IS NOT NULL;`;
};

/** Рвётся ли этот декор взрывом этого вида: класс декора (дерево / гора) и годное число. */
export function blastableDecor(
  conf: DecorInteractView | undefined,
  kind: DynamiteKind = "red",
): conf is DecorInteractView {
  if (!conf || amountRange(conf.amount) === null) return false;
  const tools = [...(conf.tools ?? []).map((t) => t.name), conf.toolName];
  return dynamiteBreaksDecor(kind, blastDecorClass(conf.label, tools));
}

/** Добыча с одного декора — стопки мешочка (как выдача рубки, без героя). */
export async function decorItems(
  conf: DecorInteractView,
  rnd?: () => number,
): Promise<BlastItem[]> {
  const range = amountRange(conf.amount);
  if (!range) return [];
  const amount = rollAmount(range, rnd);
  const { groups } = await groupItems([{ itemId: conf.itemId, amount, origin: "loot" }]);
  return blastItemsOf(groups);
}

/** Декор под взрывом с выпавшей добычей — вход функции базы. */
export async function blastDecor(
  mapId: string,
  at: Hex,
  kind: DynamiteKind = "red",
): Promise<BlastDecorIn[]> {
  const rows = ((await mcpExec(blastDecorSql(mapId, at, kind), { wrapJson: true })) ??
    []) as Array<{
    q: number | string;
    r: number | string;
    d: string | null;
  }>;
  if (rows.length === 0) return [];
  const list = await loadInteractiveDecor();
  const out: BlastDecorIn[] = [];
  for (const row of rows) {
    const conf = row.d ? list[row.d] : undefined;
    if (!row.d || !blastableDecor(conf, kind)) continue;
    const items = await decorItems(conf);
    if (items.length === 0) continue;
    out.push({
      q: Number(row.q),
      r: Number(row.r),
      d: row.d,
      nm: conf.name,
      re: conf.respawnMin ?? null,
      items,
    });
  }
  return out;
}
