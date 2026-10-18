// Симулятор открытия бокса (админ): N роллов пула без выдачи.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { pg } from "../db/pg";
import type { PgChipPack } from "../db/pg";
import { getCurrentWallet, isAdminWallet } from "../auth";
import { AMOUNT_KINDS } from "@/lib/mysticKinds";
import { rollAmount } from "./mystic-grant";
import { parseMysticPool, type MysticTier } from "./mystic-pool";
import { pickTier } from "./mystic-open";

function requireAdmin(): string {
  const wallet = getCurrentWallet();
  if (!wallet || !isAdminWallet(wallet)) throw new Error("Нет доступа");
  return wallet;
}

// ─────────────────────── Симулятор открытия (админ) ───────────────────────
// Прогоняет N роллов пула (та же логика pickTier/rollAmount, что и реальное
// открытие) БЕЗ выдачи — сводка: какой приз сколько раз выпал, % и суммы.
export const simulateMysticOpens = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ packId: z.string().min(1), count: z.number().int().min(1).max(200000) }).parse(d),
  )
  .handler(async ({ data }) => {
    requireAdmin();
    const pk = await pg.chipPacks.raw().select("*").eq("id", data.packId).maybeSingle();
    const pack = pk.data as PgChipPack | null;
    if (!pack || pack.kind !== "mystic") throw new Error("Это не мистический бокс");
    const pool = parseMysticPool(pack.mystic_pool) ?? [];
    const KIND_RU: Record<string, string> = {
      pack: "Пак",
      tickets: "Билеты",
      energy: "Энергия",
      likes: "Лайки",
      resource: "Ресурс",
      custom: "Товар",
      token: "Токен",
      ft: "Токен",
      artifact: "Артефакт",
      hero: "Герой",
      nft: "NFT",
    };
    const nameOf = (t: MysticTier) =>
      t.label ||
      t.itemName ||
      t.customName ||
      (t.kind === "resource" ? t.resource : t.kind === "token" || t.kind === "ft" ? t.token : null) ||
      KIND_RU[t.kind] ||
      t.kind;
    const agg = new Map<
      string,
      { kind: string; name: string; hits: number; total: number; hasAmount: boolean }
    >();
    let blanks = 0;
    for (let i = 0; i < data.count; i++) {
      const t = pool.length > 0 ? pickTier(pool) : null;
      if (!t) {
        blanks++;
        continue;
      }
      const key = `${t.kind}:${t.itemTemplateId || t.packId || t.customId || t.resource || t.token || t.label || ""}`;
      const amountKind = AMOUNT_KINDS.includes(t.kind);
      const amt = amountKind ? rollAmount(t) : 0;
      const cur = agg.get(key) ?? {
        kind: t.kind,
        name: nameOf(t),
        hits: 0,
        total: 0,
        hasAmount: amountKind,
      };
      cur.hits++;
      cur.total += amt;
      agg.set(key, cur);
    }
    const results = Array.from(agg.values())
      .map((r) => ({
        kind: r.kind,
        name: r.name,
        hits: r.hits,
        pct: Number(((r.hits / data.count) * 100).toFixed(2)),
        total: r.hasAmount ? Math.round(r.total * 100) / 100 : null,
        avg: r.hasAmount && r.hits ? Number((r.total / r.hits).toFixed(1)) : null,
      }))
      .sort((a, b) => b.hits - a.hits);
    return {
      count: data.count,
      blanks,
      blankPct: Number(((blanks / data.count) * 100).toFixed(2)),
      results,
    };
  });

