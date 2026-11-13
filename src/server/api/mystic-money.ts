// Бокс, который платит деньгами (аудит 11.11.2026): в пуле есть тир «token» —
// DARAI или Stars на счёт (USDT в бокс и так не кладётся, §8.49а) — сам или во
// вложенном боксе (тир «pack»). Такой бокс заводит, меняет и раздаёт только
// админ выплат (requirePayoutsAdmin), остров без денег (god-money) его не
// выдаёт. Остальное в боксах — ресурсы, вещи, паки фишек — не деньги.
import { pg } from "../db/pg";
import { parseMysticPool, type MysticTier } from "./mystic-pool";

/** Глубже не смотрим: такая вложенность считается деньгами. */
const MAX_DEPTH = 4;

async function poolOf(packId: string): Promise<MysticTier[] | null> {
  const p = await pg.chipPacks.findOne({ id: packId });
  return p?.kind === "mystic" ? parseMysticPool(p.mystic_pool) : null;
}

export async function poolPaysMoney(
  pool: readonly Pick<MysticTier, "kind" | "packId">[],
  seen: Set<string> = new Set(),
  depth = 0,
): Promise<boolean> {
  if (pool.some((t) => t.kind === "token")) return true;
  const nested = pool.filter((t) => t.kind === "pack" && t.packId && !seen.has(t.packId));
  if (nested.length > 0 && depth >= MAX_DEPTH) return true;
  for (const t of nested) {
    const id = t.packId as string;
    seen.add(id);
    const inner = await poolOf(id);
    if (inner && (await poolPaysMoney(inner, seen, depth + 1))) return true;
  }
  return false;
}

/** Бокс по id платит деньгами (не бокс или пустой пул — нет). */
export async function packPaysMoney(packId: string): Promise<boolean> {
  const pool = await poolOf(packId);
  return !!pool && (await poolPaysMoney(pool, new Set([packId])));
}

/** Пак, который платит деньгами, раздаёт (заводит в промокод, приз, лот,
 *  тариф…) только админ выплат. Пустой id и бокс без денег — без проверки. */
export async function assertPackMoneyRight(packId: string | null | undefined): Promise<void> {
  if (!packId || !(await packPaysMoney(packId))) return;
  const { requirePayoutsAdmin } = await import("../auth");
  requirePayoutsAdmin();
}
