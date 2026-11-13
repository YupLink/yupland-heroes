// Окно обычного сундука: что лежит в его десяти ячейках. Рюкзак окно берёт
// общим getMyBackpack — как окно мешочка.
//
// Только вплотную и только у стоящего сундука (закопанный — бугорок, его
// содержимое не видно никому). Хозяина нет — окно одно для всех.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { stackCells } from "@/lib/warehouseCells";
import { PLAIN_CHEST_CELLS, type PlainChestSlot, type PlainChestView } from "@/lib/plainChest";
import { chestOpenPrice } from "@/lib/openPass";
import { energyMultOf, scaleEnergy } from "@/lib/raid/island/energy";
import { pchestActor, plainNear } from "@/server/api/beta-raid/plain-chest/pchest-row";
import { passOpen } from "@/server/api/beta-raid/open-pass/pass";
import { plainTarget } from "@/server/api/beta-raid/open-pass/pass-sql";

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Ячейки сундука: стеки по свежести, пустые хвосты не показываем. */
export async function loadSlots(chestId: string): Promise<PlainChestSlot[]> {
  const rows = (await mcpExec(
    `SELECT stack_key AS "stackKey", kind, ref_id AS "refId", name, image, count
       FROM yuplink.raid_plain_chest_slot
      WHERE chest_id = ${sqlStr(chestId)} AND count > 0
      ORDER BY updated_at DESC, stack_key;`,
    { wrapJson: true },
  )) as Array<Omit<PlainChestSlot, "count"> & { count: unknown }>;
  return (rows ?? []).map((s) => ({
    stackKey: String(s.stackKey),
    kind: String(s.kind),
    refId: s.refId ?? null,
    name: String(s.name ?? ""),
    image: s.image ?? null,
    count: num(s.count),
  }));
}

/** Одна ячейка-стек сундука (для «забрать») или null — такого нет. */
export async function loadSlot(chestId: string, stackKey: string): Promise<PlainChestSlot | null> {
  const rows = (await mcpExec(
    `SELECT stack_key AS "stackKey", kind, ref_id AS "refId", name, image, count
       FROM yuplink.raid_plain_chest_slot
      WHERE chest_id = ${sqlStr(chestId)} AND stack_key = ${sqlStr(stackKey)} AND count > 0
      LIMIT 1;`,
    { wrapJson: true },
  )) as Array<Omit<PlainChestSlot, "count"> & { count: unknown }>;
  const s = rows?.[0];
  if (!s) return null;
  return { ...s, refId: s.refId ?? null, image: s.image ?? null, count: num(s.count) };
}

export const getPlainChest = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ q: z.number().int(), r: z.number().int() }).parse(d))
  .handler(async ({ data }): Promise<PlainChestView> => {
    const a = await pchestActor(null);
    const chest = await plainNear(a, data.q, data.r);
    const [slots, open] = await Promise.all([
      loadSlots(chest.id),
      passOpen(a.account, plainTarget(chest.id)),
    ]);
    const used = slots.reduce((n, s) => n + stackCells(s.count), 0);
    // Без оплаченного входа (§8.23) содержимое не отдаём — только цену: занятые
    // ячейки, не меньше 1 (то же спишет «Открыть»).
    return {
      q: data.q,
      r: data.r,
      name: chest.name,
      image: chest.image,
      cells: PLAIN_CHEST_CELLS,
      used,
      slots: open ? slots : [],
      open,
      // На острове — в 10 раз дешевле (island/energy), ровно как спишет pass-price.
      price: scaleEnergy(chestOpenPrice(used), energyMultOf(a.mapId)),
    };
  });
