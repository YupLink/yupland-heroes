// Ядро открытия мистического бокса — общее у одиночного открытия
// (openMysticBox, mystic-open.ts) и пачки Bonus Box (openMysticBoxes,
// mystic-open-batch.ts). Пачка — это то же одиночное открытие, повторённое
// подряд: каждый бокс захватывается и выдаётся отдельно.
import { secureRandomInt as randomInt } from "@/lib/secureRandom";
import { pg, sb } from "../db/pg";
import type { PgChipPack } from "../db/pg";
import { deliverMysticTier, rollAmount, type MysticPrize } from "./mystic-grant";
import { mysticTierSchema, parseMysticPool, type MysticTier } from "./mystic-pool";
import { resolveTier } from "./mystic-resolve";

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

/** Пак бокса; не мистический (или нет такого) — отказ. */
export async function loadMysticPack(packId: string): Promise<PgChipPack> {
  const pk = await pg.chipPacks.raw().select("*").eq("id", packId).maybeSingle();
  const pack = pk.data as PgChipPack | null;
  if (!pack || pack.kind !== "mystic") throw new Error("Это не мистический бокс");
  return pack;
}

/**
 * Открытие по packId (стак: клиент не держит конкретный grantId — иначе после
 * открытия одной коробки старый id повторно уходит на сервер и «уже открыт»).
 * Сервер АТОМАРНО захватывает первый свободный грант этого пака (SKIP LOCKED);
 * грант помечается opened_at внутри RPC. Свободных нет — null.
 */
export async function captureMysticGrant(
  packId: string,
  wallets: string[],
  account: string | null,
): Promise<string | null> {
  const { data: capRows, error: capErr } = await sb.rpc("capture_mystic_grant", {
    p_pack: packId,
    p_wallets: wallets,
    p_account: account,
  });
  if (capErr) throw new Error(capErr.message || "Не удалось открыть бокс");
  return ((capRows as Array<{ gid: string }>) ?? [])[0]?.gid ?? null;
}

/**
 * Захваченный бокс → приз. Приз бросается ОДИН раз и сразу записывается на
 * бокс. Сорвалась выдача (нет героя, полный рюкзак, сбой сети) — бокс снова
 * закрыт, а при следующем открытии выдаётся тот же приз: перебросить, «забив»
 * рюкзак, нельзя.
 */
export async function deliverCapturedBox(
  wallet: string,
  pack: PgChipPack,
  grantId: string,
): Promise<MysticPrize> {
  const cur = await pg.chipPackGrants.raw().select("result_chips").eq("id", grantId).maybeSingle();
  let roll = rolledOf((cur.data as { result_chips?: unknown } | null)?.result_chips);
  if (!roll) {
    const pool = parseMysticPool(pack.mystic_pool) ?? [];
    const picked = pool.length > 0 ? pickTier(pool) : null;
    // «Любой артефакт/герой этой редкости», «любой товар» — какой именно,
    // решается здесь же и пишется на бокс вместе с броском (mystic-resolve).
    const tier = picked ? await resolveTier(picked) : null;
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

  // Сохраняем приз на гранте (для показа открытого бокса).
  await pg.chipPackGrants
    .raw()
    .update({ result_chips: prize as unknown as Record<string, unknown> })
    .eq("id", grantId);
  return prize;
}

type Roll = { tier: MysticTier | null; amount: number };

/** Выпавший, но ещё не выданный приз бокса (см. deliverCapturedBox). */
function rolledOf(raw: unknown): Roll | null {
  const r = (raw as { rolled?: Roll } | null)?.rolled;
  if (!r || typeof r !== "object") return null;
  if (r.tier === null) return { tier: null, amount: 0 };
  const t = mysticTierSchema.safeParse(r.tier);
  return t.success ? { tier: t.data, amount: Number(r.amount) || 0 } : null;
}
