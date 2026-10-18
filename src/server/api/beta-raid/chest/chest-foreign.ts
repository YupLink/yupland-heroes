// Чужой сундук на карте: чей он, кто его охраняет и открыт ли он мне.
//
// Четвёртая редакция (владелец, 29.09.2026): пока охрана жива — сначала бой;
// охраны нет (или её победили — добивший удар снимает её) — чужой «Открывает»
// сундук за энергию и берёт из сети хозяина или «Забирает сундук». Захвата и
// «Разграбить» больше нет. Закопанный чужому не виден как сундук — «сундука нет».
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { ChestGuardView } from "@/lib/magicChest";
import { guardViewIfAlive, loadGuardRow } from "@/server/api/beta-raid/mine-guard-read";
import { chestActor, loadChest, requireChestNear } from "@/server/api/beta-raid/chest/chest-row";
import { ownerName } from "@/server/api/beta-raid/chest/chest-owner";

export type ForeignChestView = {
  ownerName: string | null;
  /** Живой охранник с настоящим HP; null — охраны нет или повержена. */
  guard: ChestGuardView | null;
  /** Прежнее поле «охрану победил я» (захвата больше нет) — всегда false. */
  won: boolean;
  /** Сундук открыт мне: живой охраны нет — «Открыть» и «Забрать сундук». */
  open: boolean;
};

export const getChestGuard = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ q: z.number().int(), r: z.number().int() }).parse(d))
  .handler(async ({ data }): Promise<ForeignChestView> => {
    const a = await chestActor("chest-guard");
    const chest = await loadChest(a.mapId, data.q, data.r);
    // Закопанный — бугорок: чужому не видно, что под ним сундук.
    if (!chest || chest.buried) throw new Error("chest.gone");
    if (chest.owner_account === a.account) throw new Error("chest.own_chest");
    await requireChestNear(a.wallet, a.mapId, data.q, data.r);
    const [row, name] = await Promise.all([
      loadGuardRow(a.mapId, data.q, data.r),
      ownerName(chest.owner_account),
    ]);
    const guard = guardViewIfAlive(row);
    return {
      ownerName: name,
      guard: guard
        ? {
            name: guard.name,
            image: guard.image,
            background: guard.background,
            maxHp: guard.maxHp,
            currentHp: guard.currentHp,
            damage: guard.damage,
            abilities: guard.abilities,
          }
        : null,
      won: false,
      open: !guard,
    };
  });
