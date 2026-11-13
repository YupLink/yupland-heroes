// Открытие Bonus Box пачкой до 50 штук (владелец, 28.10.2026). Это одиночное
// открытие (mystic-open-core.ts), повторённое подряд: каждый бокс — свой
// атомарный захват, свой честный бросок, своя выдача («рандом должен
// сохраниться» — общего броска на пачку нет). Выдача сорвалась посреди пачки —
// открытые остаются выданными, сорвавшийся бокс откатан ядром, пачка стоп.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getCurrentWallet } from "../auth";
import { getSisterWallets } from "./user";
import { accountOf } from "./user-shared";
import type { MysticPrize } from "./mystic-grant";
import { captureMysticGrant, deliverCapturedBox, loadMysticPack } from "./mystic-open-core";
import { MYSTIC_BATCH_MAX, isMysticBatchPack } from "@/lib/mysticBatch";

export type MysticBatchResult = {
  prizes: MysticPrize[];
  /** Пачка остановилась на сбое выдачи — ключ/текст ошибки для humanError. */
  stopped?: string;
};

export const openMysticBoxes = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        packId: z.string().min(1),
        count: z.number().int().min(1).max(MYSTIC_BATCH_MAX),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<MysticBatchResult> => {
    const wallet = getCurrentWallet();
    if (!wallet) throw new Error("Нет сессии");
    if (!isMysticBatchPack(data.packId)) throw new Error("chips.mystic_batch_only");
    const pack = await loadMysticPack(data.packId);
    const sisters = await getSisterWallets(wallet);
    const account = await accountOf(wallet);

    const prizes: MysticPrize[] = [];
    for (let i = 0; i < data.count; i++) {
      try {
        const gid = await captureMysticGrant(data.packId, sisters, account);
        if (!gid) break; // боксов меньше, чем просили, — открыли сколько было
        prizes.push(await deliverCapturedBox(wallet, pack, gid));
      } catch (e) {
        // Ни одного не открыли — та же ошибка, что у одиночного открытия.
        if (prizes.length === 0) throw e;
        return { prizes, stopped: e instanceof Error ? e.message : String(e) };
      }
    }
    if (prizes.length === 0) throw new Error("Нет боксов для открытия");
    return { prizes };
  });
