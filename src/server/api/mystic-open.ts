// Открытие мистического бокса → приз. Приз бросается один раз и записывается
// на бокс; выдача — mystic-grant.ts (любой вид приза).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { secureRandomInt as randomInt } from "@/lib/secureRandom";
import { pg, sb } from "../db/pg";
import type { PgChipPack, PgChipPackGrant } from "../db/pg";
import { getCurrentWallet } from "../auth";
import { getSisterWallets } from "./user";
import { accountOf } from "./user-shared";
import { deliverMysticTier, rollAmount, type MysticPrize } from "./mystic-grant";
import { mysticTierSchema, parseMysticPool, type MysticTier } from "./mystic-pool";

// ─────────────────────── Открытие бокса → приз ───────────────────────
const SCALE = 1_000_000;
/** Взвешенный выбор тира (crypto-RNG). Хвост (sum<100) → null = «Молодец». */
export function pickTier(tiers: MysticTier[]): MysticTier | null {
  const sum = tiers.reduce((s, t) => s + t.weight, 0);
  const total = Math.max(100, sum);
  const r = randomInt(0, Math.max(1, Math.floor(total * SCALE)));
  let acc = 0;
  for (const t of tiers) {
    acc += Math.floor(t.weight * SCALE);
    if (r < acc) return t;
  }
  return null;
}

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

    // Открытие по packId (стак: клиент не держит конкретный grantId — иначе после
    // открытия одной коробки старый id повторно уходит на сервер и «уже открыт»).
    // Сервер АТОМАРНО захватывает первый свободный грант этого пака (SKIP LOCKED).
    let grantId: string;
    let pack: PgChipPack | null;
    if (data.packId) {
      const pk = await pg.chipPacks.raw().select("*").eq("id", data.packId).maybeSingle();
      pack = pk.data as PgChipPack | null;
      if (!pack || pack.kind !== "mystic") throw new Error("Это не мистический бокс");
      const { data: capRows, error: capErr } = await sb.rpc("capture_mystic_grant", {
        p_pack: data.packId,
        p_wallets: sisters,
        p_account: await accountOf(wallet),
      });
      if (capErr) throw new Error(capErr.message || "Не удалось открыть бокс");
      const gid = ((capRows as Array<{ gid: string }>) ?? [])[0]?.gid;
      if (!gid) throw new Error("Нет боксов для открытия");
      grantId = gid;
      // грант уже помечен opened_at внутри RPC (атомарный захват).
    } else {
      // 1) Грант принадлежит нашему аккаунту и это мистик-бокс?
      const gr = await pg.chipPackGrants.raw().select("*").eq("id", data.grantId!).maybeSingle();
      const grant = gr.data as PgChipPackGrant | null;
      if (!grant || grant.account_id !== (await accountOf(wallet))) throw new Error("Бокс не найден");
      const pk = await pg.chipPacks.raw().select("*").eq("id", grant.chip_pack_id).maybeSingle();
      pack = pk.data as PgChipPack | null;
      if (!pack || pack.kind !== "mystic") throw new Error("Это не мистический бокс");
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

    // 3) Приз бросается ОДИН раз и сразу записывается на бокс. Сорвалась
    //    выдача (нет героя, полный рюкзак, сбой сети) — бокс снова закрыт, а
    //    при следующем открытии выдаётся тот же приз: перебросить, «забив»
    //    рюкзак, нельзя.
    const cur = await pg.chipPackGrants.raw().select("result_chips").eq("id", grantId).maybeSingle();
    let roll = rolledOf((cur.data as { result_chips?: unknown } | null)?.result_chips);
    if (!roll) {
      const pool = parseMysticPool(pack.mystic_pool) ?? [];
      const tier = pool.length > 0 ? pickTier(pool) : null;
      roll = { tier, amount: tier ? rollAmount(tier) : 0 };
      await pg.chipPackGrants
        .raw()
        .update({ result_chips: { rolled: roll } as unknown as Record<string, unknown> })
        .eq("id", grantId);
    }

    let prize: MysticPrize = { kind: "blank" };
    try {
      if (roll.tier) prize = await deliverMysticTier(wallet, grantId, roll.tier, roll.amount);
    } catch (e) {
      // Выдача упала — бокс снова закрыт, выпавший приз остаётся за ним.
      await pg.chipPackGrants.raw().update({ opened_at: null }).eq("id", grantId);
      throw e instanceof Error ? e : new Error("Не удалось выдать приз");
    }

    // 4) Сохраняем приз на гранте (для показа открытого бокса).
    await pg.chipPackGrants
      .raw()
      .update({ result_chips: prize as unknown as Record<string, unknown> })
      .eq("id", grantId);
    return { prize };
  });

type Roll = { tier: MysticTier | null; amount: number };

/** Выпавший, но ещё не выданный приз бокса (см. шаг 3 открытия). */
function rolledOf(raw: unknown): Roll | null {
  const r = (raw as { rolled?: Roll } | null)?.rolled;
  if (!r || typeof r !== "object") return null;
  if (r.tier === null) return { tier: null, amount: 0 };
  const t = mysticTierSchema.safeParse(r.tier);
  return t.success ? { tier: t.data, amount: Number(r.amount) || 0 } : null;
}

