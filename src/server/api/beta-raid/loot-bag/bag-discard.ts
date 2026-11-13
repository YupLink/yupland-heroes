// «Выбросить» из рюкзака — в мешочек на клетке героя (владелец, 29.09.2026,
// дополнение №4; ПРАВИЛА §8.21): выброшенное не пропадает, а падает мешочком —
// дальше как с любым мешочком (24 часа на порцию, «Открыть» за 1 энергию).
//
// На клетке уже есть живой незакопанный мешочек — доливаем в него новой
// порцией, нет — новый мешочек. Бесплатно. Метки происхождения едут с
// порцией; зелья — так же. Изношенная штука инструмента в мешочек не
// попадает (bag-discard-sql). Героя нет на карте — отказ, ничего не тронуто.
// Купол, туман — не помеха: мешочек ложится на клетку героя как есть.
//
// Снятие и порция — один оператор под локами рюкзака и мешочка. Ключ нажатия
// (op) — в raid_loot_bag_op: повтор после коммита отвечает прошлым итогом и
// второй раз ничего не делает; ответ потерялся — судит тот же ключ.
import { nanoid } from "nanoid";
import { mcpExec } from "@/server/db/mcpClient";
import { publishRaid } from "@/server/raidLive";
import { sqlStr } from "@/server/api/raid-shared";
import { myMapId, ownCell } from "@/server/api/beta-raid/encounter-where";
import { raidOwner } from "@/server/api/beta-raid/owner";
import { sqlRow } from "@/server/api/beta-raid/chest/chest-row";
import { noteBagPut } from "@/server/api/beta-raid/loot-bag/bag-note";
import {
  bagAtCellSql,
  discardToBagSql,
  type DiscardRow,
} from "@/server/api/beta-raid/loot-bag/bag-discard-sql";
import { isDaraiMineKey } from "@/lib/daraiMine";

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Итог: сколько осталось в рюкзаке, сколько легло в мешочек и в какой. */
export type DiscardResult = { left: number; put: number; bagId: string | null };

/** Ключ прошлого нажатия: что тогда легло и куда (строки нет — нажатия не было). */
async function priorOf(op: string): Promise<DiscardResult | null> {
  const rows = (await mcpExec(
    `SELECT o.qty, o.bag_id,
            (SELECT h.count FROM yuplink.raid_hero_backpack h
              WHERE h.hero_id = o.hero_id AND h.stack_key = o.stack_key) AS rest
       FROM yuplink.raid_loot_bag_op o WHERE o.op = ${sqlStr(op)} LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ qty: unknown; bag_id: string | null; rest: unknown }>;
  const row = rows?.[0];
  if (!row) return null;
  return { left: num(row.rest), put: num(row.qty), bagId: row.bag_id || null };
}

/**
 * Выбросить qty штук стопки (без qty — всю) из рюкзака героя heroId в мешочек
 * на клетке игрока. clientOp — ключ нажатия с клиента (окно до выката его не
 * шлёт — тогда разовый ключ: повтор моста ловит и он).
 */
export async function discardToBag(o: {
  wallet: string;
  heroId: string;
  stackKey: string;
  qty?: number;
  clientOp?: string;
}): Promise<DiscardResult> {
  // DARAI-шахту только размещают: выброс и подъём сбрасывали бы её час
  // (lib/daraiMine). Мешочка с ней нет вовсе: через час она встаёт сама
  // (dmine-autoplace).
  if (isDaraiMineKey(o.stackKey)) throw new Error("dmine.stays");
  const account = await raidOwner(o.wallet);
  const op = `bagdrop:${account}:${o.clientOp ?? nanoid(16)}`;
  const pos = await ownCell(o.wallet);
  if (!pos) throw new Error("bag.discard_off_map");
  const mapId = await myMapId(o.wallet);
  const found = (await mcpExec(`${bagAtCellSql(mapId, pos.q, pos.r)};`, {
    wrapJson: true,
  })) as Array<{ id: string }> | null;
  const sql = discardToBagSql({
    heroId: o.heroId,
    account,
    stackKey: o.stackKey,
    qty: o.qty ?? null,
    mapId,
    ...pos,
    bagId: found?.[0]?.id ?? null,
    key: op,
    op,
  });
  let row: DiscardRow | undefined;
  try {
    row = sqlRow<DiscardRow>((await mcpExec(sql)) as unknown[]);
  } catch (e) {
    // Ответ потерялся после коммита — судит ключ нажатия.
    const done = await priorOf(op).catch(() => null);
    if (!done) throw e;
    if (done.put > 0) publishRaid({ mapId, type: "bags", cells: [`${pos.q},${pos.r}`] });
    return done;
  }
  if (!row) throw new Error("chest.busy");
  if (row.was) {
    if (num(row.prior_qty) > 0) publishRaid({ mapId, type: "bags", cells: [`${pos.q},${pos.r}`] });
    return { left: num(row.rest), put: num(row.prior_qty), bagId: row.prior_bag || null };
  }
  if (row.worn) throw new Error("braid.tool_worn_stays");
  if (!row.here || row.gone == null) throw new Error("market.not_found");
  const put = num(row.put);
  const cell = `${pos.q},${pos.r}`;
  if (put > 0) {
    publishRaid({ mapId, type: "bags", cells: [cell] });
    if (row.fresh_bag) {
      void import("@/server/api/beta-raid/loot-bag/bag-sweep").then((m) => m.startLootBagSweeper());
    }
    const stack = {
      stackKey: o.stackKey,
      kind: row.kind ?? "custom",
      refId: row.ref_id,
      name: row.name ?? o.stackKey,
      image: null,
    };
    const actor = { wallet: o.wallet, mapId, account };
    void noteBagPut({ actor, bag: pos, stack, qty: put, ref: op });
  }
  return { left: num(row.rest), put, bagId: row.bag_id };
}
