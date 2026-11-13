// Чтения «Забрать» из мешочка (bag-take.ts, ПРАВИЛА §8.21): позиции мешочка,
// исход ключа нажатия и что осталось после «Забрать всё». Вынесено из
// bag-take.ts ради лимита ≤250 строк.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import type { LootBagTaken } from "@/lib/lootBag";
import { livePortion } from "@/server/api/beta-raid/loot-bag/bag-sql";
import type { BagStackRow } from "@/server/api/beta-raid/loot-bag/bag-note";
import { FISH_BOOT_KEY } from "@/lib/raid/dynamiteFish";
import { DIG_EMPTY_KEY } from "@/lib/digHole";

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * Позиции мешочка — живые порции по видам (и чей он — для журнала сделок). Метка
 * башмака (рыба от динамита) — не позиция: её снимает «Открыть», в рюкзак ей нельзя.
 */
export async function loadStacks(bagId: string): Promise<BagStackRow[]> {
  return ((await mcpExec(
    `SELECT i.stack_key AS "stackKey", min(i.kind) AS kind, min(i.ref_id) AS "refId",
            min(i.name) AS name, min(i.image) AS image, sum(i.count) AS count,
            min(b.dropped_by) AS "droppedBy"
       FROM yuplink.raid_loot_bag_item i
       JOIN yuplink.raid_loot_bag b ON b.id = i.bag_id
      WHERE i.bag_id = ${sqlStr(bagId)} AND ${livePortion("i")}
        AND i.stack_key NOT IN (${sqlStr(FISH_BOOT_KEY)}, ${sqlStr(DIG_EMPTY_KEY)})
      GROUP BY i.stack_key
      ORDER BY min(i.name), i.stack_key;`,
    { wrapJson: true },
  )) ?? []) as BagStackRow[];
}

/** Это нажатие по стопке уже забрало (повтор после ответа, потерянного в пути) — сколько. */
export async function doneBefore(op: string): Promise<number> {
  const rows = (await mcpExec(
    `SELECT state, qty FROM yuplink.raid_loot_bag_op WHERE op = ${sqlStr(op)};`,
    { wrapJson: true },
  )) as Array<{ state: string; qty: number | string }>;
  return rows?.[0]?.state === "done" ? num(rows[0].qty) : 0;
}

/**
 * Что лежит в мешочке после «Забрать всё» — свежим чтением, а не «было минус
 * взято»: повтор нажатия отвечает прежним taken при уже меньшем мешочке, и
 * вычитание дало бы другой ответ на то же нажатие. Пусто — забрано всё.
 */
export async function leftIn(bagId: string): Promise<NonNullable<LootBagTaken["left"]>> {
  return (await loadStacks(bagId))
    .map((s) => ({ stackKey: s.stackKey, name: s.name, qty: num(s.count) }))
    .filter((s) => s.qty > 0);
}
