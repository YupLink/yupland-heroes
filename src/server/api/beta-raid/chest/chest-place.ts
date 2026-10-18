// Поставить магический сундук под себя или на соседнюю клетку (как обычный —
// владелец 03.10.2026) — с охраной или без.
//
// Правила владельца: ставит герой ЛЮБОЙ специализации — проверка «только
// Торговец» стоит на покупке (chest-item.ts). Третья редакция (28.09.2026):
// охрана — по желанию, босс из рюкзака. Без охраны чужой рядом сразу
// «Разграбить», с охраной — только после победы над ней.
//
// Клетка, охрана и списание сундука и босса — один оператор «всё или ничего»
// (chest-place-sql.ts): сундук с охраной ни мгновения не стоит без неё, а
// строка охраны не появляется без списанного босса. Отказ приходит из того же
// оператора: клетка занята, сундука или босса в рюкзаке нет.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nanoid } from "nanoid";
import { mcpExec } from "@/server/db/mcpClient";
import { publishRaid } from "@/server/raidLive";
import { isPlaceDir } from "@/lib/plainChest";
import { playerCell } from "@/server/api/beta-raid/encounter-where";
import { requireNotVoid } from "@/server/api/beta-raid/voidGate";
import { resolveBackpack } from "@/server/api/beta-raid/market-backpack";
import { loadEncounterTarget } from "@/server/api/beta-raid/encounter-target";
import { canonCustomMeta, refFromStackKey } from "@/server/api/beta-raid/item-alias";
import { opDone } from "@/server/api/beta-raid/backpack-take-once";
import { isMagicChestStack } from "@/server/api/beta-raid/chest/chest-item";
import { chestActor, sqlRow } from "@/server/api/beta-raid/chest/chest-row";
import {
  placeChestSql,
  type GuardPick,
  type PlaceRes,
} from "@/server/api/beta-raid/chest/chest-place-sql";

const input = z.object({
  stackKey: z.string().min(1).max(200),
  /** Босс-охранник из рюкзака: стек boss:<шаблон>. Нет — сундук без охраны. */
  guardKey: z.string().min(1).max(200).optional(),
  /** Куда: 0,0 (или нет — прежний клиент) — под себя, иначе соседняя клетка. */
  dq: z.number().int().min(-1).max(1).optional(),
  dr: z.number().int().min(-1).max(1).optional(),
});

export const placeMagicChest = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data }): Promise<{ ok: true; q: number; r: number }> => {
    const [dq, dr] = [data.dq ?? 0, data.dr ?? 0];
    if (!isPlaceDir(dq, dr)) throw new Error("pchest.place_far");
    const a = await chestActor("chest-place");
    if (!(await isMagicChestStack(data.stackKey))) throw new Error("chest.not_chest");
    const itemId = refFromStackKey(data.stackKey);
    if (!itemId) throw new Error("chest.not_chest");

    let guard: GuardPick | null = null;
    if (data.guardKey) {
      if (!data.guardKey.startsWith("boss:")) throw new Error("chest.need_guard");
      const templateId = data.guardKey.slice("boss:".length);
      const tpl = await loadEncounterTarget(`boss:${templateId}`);
      if (!tpl) throw new Error("chest.need_guard");
      guard = { stackKey: data.guardKey, templateId, tpl };
    }

    const bp = await resolveBackpack(a.wallet);
    if (!bp) throw new Error("market.backpack_no_hero");

    // Клетка — от героя: под себя или на одну из шести соседних, а не куда ткнули.
    const pos = await playerCell(a.wallet);
    const [q, r] = [pos.q + dq, pos.r + dr];
    await requireNotVoid(a.wallet, a.mapId, q, r);

    // Имя и картинка — у шаблона-канона: сундук на карте рисуется им, а не
    // подписью строки рюкзака.
    const meta = await canonCustomMeta(itemId);
    const op = `chestplace:${nanoid(12)}`;
    const sql = placeChestSql(
      {
        mapId: a.mapId,
        q,
        r,
        account: a.account,
        heroId: bp.heroId,
        itemId,
        name: meta?.name?.trim() || itemId,
        image: meta?.image?.trim() ? meta.image : null,
        stackKey: data.stackKey,
      },
      guard,
      op,
    );
    // Ошибка после коммита (мост потерял ответ) или ответ не разобрался —
    // спрашиваем ключ операции: он стоит, только если установка прошла.
    const res = await mcpExec(sql).then(
      (rows) => sqlRow<PlaceRes>(rows as unknown[]),
      async (e: unknown) => {
        if (await opDone(op)) return { was: true } as PlaceRes;
        throw e;
      },
    );
    const done = res?.was || res?.placed || (!res && (await opDone(op)));
    if (!done) {
      if (res && !res.box) throw new Error("market.not_found");
      if (res && !res.boss) throw new Error("chest.need_guard");
      throw new Error("chest.cell_busy");
    }

    // Сундук (и охрану) видят все: карта перечитывает слои по 'built'.
    publishRaid({ mapId: a.mapId, type: "built", cells: [`${q},${r}`] });
    return { ok: true as const, q, r };
  });
