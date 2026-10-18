// Поставить обычный сундук из рюкзака — на свою клетку или соседнюю.
//
// Решение за владельца (29.09, ПРАВИЛА §8.22): ставит любой игрок, правила
// клетки — как у магического сундука (на клетке один сундук или бугорок,
// мешочки не мешают). Охраны нет — ни при установке, ни потом. Клетка, сундук
// и списание штуки — один оператор (pchest-place-sql.ts); отказ приходит им же.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "@/server/db/mcpClient";
import { publishRaid } from "@/server/raidLive";
import { isPlaceDir } from "@/lib/plainChest";
import { playerCell } from "@/server/api/beta-raid/encounter-where";
import { requireNotVoid } from "@/server/api/beta-raid/voidGate";
import { resolveBackpack } from "@/server/api/beta-raid/market-backpack";
import { canonCustomMeta, refFromStackKey } from "@/server/api/beta-raid/item-alias";
import { sqlRow } from "@/server/api/beta-raid/chest/chest-row";
import {
  isPlainChestStack,
  loadOp,
  pchestActor,
} from "@/server/api/beta-raid/plain-chest/pchest-row";
import {
  opSweepSql,
  placePlainSql,
  type PlaceRow,
} from "@/server/api/beta-raid/plain-chest/pchest-place-sql";

const input = z.object({
  stackKey: z.string().min(1).max(200),
  /** Куда: 0,0 — под себя, иначе одна из шести соседних клеток. */
  dq: z.number().int().min(-1).max(1),
  dr: z.number().int().min(-1).max(1),
  /** Ключ нажатия: повтор того же нажатия второй сундук не ставит. */
  op: z.string().regex(/^[A-Za-z0-9_-]{6,64}$/),
});

export const placePlainChest = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data }): Promise<{ ok: true; q: number; r: number }> => {
    if (!isPlaceDir(data.dq, data.dr)) throw new Error("pchest.place_far");
    const a = await pchestActor("pchest-place");
    if (!(await isPlainChestStack(data.stackKey))) throw new Error("pchest.not_chest");
    const itemId = refFromStackKey(data.stackKey);
    if (!itemId) throw new Error("pchest.not_chest");
    const bp = await resolveBackpack(a.wallet);
    if (!bp) throw new Error("market.backpack_no_hero");

    const pos = await playerCell(a.wallet);
    const [q, r] = [pos.q + data.dq, pos.r + data.dr];
    await requireNotVoid(a.wallet, a.mapId, q, r);

    // Имя и картинка — у шаблона-канона: сундук на карте рисуется им.
    const meta = await canonCustomMeta(itemId);
    const op = `pcplace:${a.account}:${data.op}`;
    const sql = placePlainSql({
      mapId: a.mapId,
      q,
      r,
      account: a.account,
      heroId: bp.heroId,
      itemId,
      name: meta?.name?.trim() || itemId,
      image: meta?.image?.trim() ? meta.image : null,
      stackKey: data.stackKey,
      op,
    });
    // Ответ потерялся после коммита — судит ключ нажатия: он лёг только с сундуком.
    const res = await mcpExec(sql).then(
      (rows) => sqlRow<PlaceRow>(rows as unknown[]),
      async (e: unknown) => {
        if (await loadOp(op)) return { was: true } as PlaceRow;
        throw e;
      },
    );
    const done = res?.was || res?.placed || (!res && !!(await loadOp(op)));
    if (!done) {
      if (res && !res.box) throw new Error("market.not_found");
      throw new Error("chest.cell_busy");
    }
    // Сундук видят все: слой сундуков перечитывается по 'built'.
    publishRaid({ mapId: a.mapId, type: "built", cells: [`${q},${r}`] });
    void mcpExec(opSweepSql()).catch(() => {});
    return { ok: true as const, q, r };
  });
