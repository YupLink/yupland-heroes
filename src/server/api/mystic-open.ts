// Открытие мистического бокса → приз. Приз бросается один раз и записывается
// на бокс; выдача — mystic-grant.ts (любой вид приза). Ядро (захват, бросок,
// выдача, откат) — mystic-open-core.ts, общее с пачкой Bonus Box.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { pg } from "../db/pg";
import type { PgChipPack, PgChipPackGrant } from "../db/pg";
import { getCurrentWallet } from "../auth";
import { getSisterWallets } from "./user";
import { accountOf } from "./user-shared";
import type { MysticPrize } from "./mystic-grant";
import { captureMysticGrant, deliverCapturedBox, loadMysticPack } from "./mystic-open-core";

// Симулятор пулов импортирует бросок отсюда (mystic-sim.ts).
export { pickTier } from "./mystic-open-core";

export const openMysticBox = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        grantId: z.string().min(1).optional(),
        packId: z.string().min(1).optional(),
      })
      .refine((v) => !!v.grantId || !!v.packId, {
        message: "Нужен grantId или packId",
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ prize: MysticPrize }> => {
    const wallet = getCurrentWallet();
    if (!wallet) throw new Error("Нет сессии");
    const sisters = await getSisterWallets(wallet);

    let grantId: string;
    let pack: PgChipPack;
    if (data.packId) {
      // Стак: сервер атомарно берёт первый свободный бокс пака (SKIP LOCKED).
      pack = await loadMysticPack(data.packId);
      const gid = await captureMysticGrant(data.packId, sisters, await accountOf(wallet));
      if (!gid) throw new Error("Нет боксов для открытия");
      grantId = gid;
    } else {
      // 1) Грант принадлежит нашему аккаунту и это мистик-бокс?
      const gr = await pg.chipPackGrants.raw().select("*").eq("id", data.grantId!).maybeSingle();
      const grant = gr.data as PgChipPackGrant | null;
      if (!grant || grant.account_id !== (await accountOf(wallet)))
        throw new Error("Бокс не найден");
      pack = await loadMysticPack(grant.chip_pack_id);
      // 2) АТОМАРНЫЙ захват: пометить открытым только если ещё не открыт (TOCTOU).
      const cap = await pg.chipPackGrants
        .raw()
        .update({ opened_at: new Date().toISOString() })
        .eq("id", data.grantId!)
        .is("opened_at", null)
        .select("id");
      if (!cap.data || (cap.data as unknown[]).length === 0) throw new Error("Бокс уже открыт");
      grantId = data.grantId!;
    }

    // 3–4) Бросок один раз на бокс, выдача, откат при сбое — общее ядро.
    return { prize: await deliverCapturedBox(wallet, pack, grantId) };
  });
