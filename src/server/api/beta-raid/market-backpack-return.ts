// Вернуть штуки в стек рюкзака — откат неудавшейся оплаты товаром.
//
// Вынесено из market-backpack-write.ts ради лимита ≤250 строк; вызывающие
// по-прежнему берут его из market-backpack(-write).
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import type { BackpackTakeSnapshot } from "./market-backpack-take";
import {
  originCols,
  originGrowSql,
  originLit,
  originOfTaken,
  originSetSql,
  originWithin,
} from "@/server/api/beta-raid/stack-origin";
import { exactQty } from "@/lib/warehouseCells";
import { addWearSql, backpackWhere, wearOf } from "@/server/api/beta-raid/tool-wear-move";

/** Количество для SQL: до тысячных, без мусорного хвоста double. */
const qtyNum = (qty: number): number => Math.max(0, Math.round(qty * 1000) / 1000);

/**
 * Вернуть штуки в стек рюкзака — откат неудавшейся оплаты товаром.
 *
 * Ёмкость тут НЕ проверяем: эти штуки только что лежали в этом же стеке, и
 * отказ вернуть их из-за «рюкзак полон» означал бы, что товар просто исчез.
 *
 * Снимок со списания несёт метки ушедшего (mob/mine/field/lootTaken) —
 * штуки возвращаются с ними: сорвавшаяся оплата не должна превращать добычу
 * в покупку. Меток не больше возвращаемого (stack-origin, порядок «беречь»).
 */
export async function returnToBackpackStack(
  heroId: string,
  stackKey: string,
  qty: number,
  /** Снимок вида — нужен, когда ячейка успела опустеть и удалиться. */
  snapshot?: Omit<BackpackTakeSnapshot, "mobTaken"> & { mobTaken?: number },
  /** Счёт владельца: у новой ячейки он обязателен (NOT NULL). */
  accountId?: string | null,
  /** Списано точно (склад, takeFromBackpackStack exact) — и вернуть точно. */
  opts: { exact?: boolean } = {},
): Promise<void> {
  await addCount(heroId, stackKey, qty, snapshot, accountId, opts);
  // Со стопкой ушёл износ (перенос на склад) — штуки вернулись, вернём и его.
  const wear = wearOf(snapshot?.wear);
  if (wear > 0) {
    await mcpExec(addWearSql("raid_hero_backpack", backpackWhere(heroId, stackKey), wear));
  }
}

async function addCount(
  heroId: string,
  stackKey: string,
  qty: number,
  snapshot: Parameters<typeof returnToBackpackStack>[3],
  accountId: string | null | undefined,
  opts: { exact?: boolean },
): Promise<void> {
  const n = opts.exact ? exactQty(qty) : qtyNum(qty);
  if (n <= 0) return;
  const back = originWithin(n, originOfTaken(snapshot), opts.exact ? exactQty : qtyNum);
  const add = originLit(back);
  const rows = (await mcpExec(
    `UPDATE yuplink.raid_hero_backpack
        SET count = count + ${n},
            ${originSetSql(originGrowSql(originCols(), add, `count + ${n}`))},
            updated_at = now()
      WHERE hero_id = ${sqlStr(heroId)} AND stack_key = ${sqlStr(stackKey)}
      RETURNING id;`,
    { wrapJsonCte: true },
  )) as Array<{ id: string }>;
  if (rows?.length) return;

  // Ячейки уже нет: списание опустошило её и удалило. Заводим заново по
  // снимку — иначе возврат уходил в пустоту, и товар пропадал совсем.
  if (!snapshot) return;
  // Счёт берём переданный, иначе — от кошелька героя: у ячейки он NOT NULL, и
  // без него возврат падал бы вместо того, чтобы вернуть товар.
  const own =
    accountId ??
    (
      (await mcpExec(
        // Владелец берётся у самого героя: раньше сюда шёл переход через
        // адрес, и у игрока без кошелька рюкзак оставался без хозяина.
        `SELECT h.account_id AS id FROM yuplink.hero_instance h
          WHERE h.id = ${sqlStr(heroId)} AND h.account_id IS NOT NULL LIMIT 1;`,
        { wrapJson: true },
      ).catch(() => [])) as Array<{ id: string | null }>
    )?.[0]?.id ??
    null;
  if (!own) return;
  const old = originCols("yuplink.raid_hero_backpack.");
  await mcpExec(
    `INSERT INTO yuplink.raid_hero_backpack
       (id, hero_id, account_id, kind, ref_id, item_id, stack_key, name, image, count,
        mob_count, mine_count, field_count, loot_count)
     VALUES (${sqlStr(`bp_back_${Math.random().toString(36).slice(2, 10)}`)},
             ${sqlStr(heroId)}, ${sqlStr(own)},
             ${sqlStr(snapshot.kind)}, ${snapshot.refId ? sqlStr(snapshot.refId) : "NULL"},
             ${sqlStr(stackKey)}, ${sqlStr(stackKey)}, ${sqlStr(snapshot.name)},
             ${snapshot.image ? sqlStr(snapshot.image) : "NULL"}, ${n},
             ${add.mob}, ${add.mine}, ${add.field}, ${add.loot})
     ON CONFLICT (hero_id, stack_key) DO UPDATE
       SET count = yuplink.raid_hero_backpack.count + EXCLUDED.count,
           ${originSetSql(originGrowSql(old, originCols("EXCLUDED."), `${old.count} + EXCLUDED.count`))},
           updated_at = now();`,
  );
}
