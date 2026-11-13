// Сломанный артефакт слетает с героя (владелец, 23.10.2026; ПРАВИЛА §8.63 п.3):
// ручки клиента — запущена ли механика для этого игрока (накладка «сломан» и
// неактивное «Надеть»), непоказанные плашки поломки и пометка «показано».
// Плашку клиент получает сразу в ответе удара (artBroken); эта ручка — для
// случая «перезагрузился, не досмотрев» и для поломок из скрипта запуска.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "@/server/db/mcpClient";
import { getCurrentWallet } from "@/server/auth";
import { raidOwner } from "@/server/api/beta-raid/owner";
import { requireBetaRaid } from "@/server/api/beta-raid/gate";
import { parseArtBreakNotes, type ArtBreakNote } from "@/lib/hero/artBroken";
import { artBrokenOn } from "./art-repair-gate";
import { breakNoticesSql, markShownSql, stripBrokenFromHeroSql } from "./art-broken-sql";

/** Запущена ли механика поломки для этого игрока: флаг запуска или админ. */
export const getArtBrokenOn = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ on: boolean }> => ({ on: await artBrokenOn(getCurrentWallet()) }),
);

/** Непоказанные плашки поломки аккаунта (механика не запущена — пусто). */
export async function breakNoticesFor(wallet: string): Promise<ArtBreakNote[]> {
  if (!(await artBrokenOn(wallet))) return [];
  const rows = await mcpExec(breakNoticesSql(await raidOwner(wallet)), { wrapJson: true });
  return parseArtBreakNotes(rows);
}

export const getArtBreakNotices = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ items: ArtBreakNote[] }> => {
    const wallet = getCurrentWallet();
    if (!wallet) return { items: [] };
    return { items: await breakNoticesFor(wallet) };
  },
);

/** Плашку показали — больше не всплывает, и после перезагрузки тоже. */
export async function markBreakShownAs(wallet: string, ids: string[]): Promise<number> {
  const sql = markShownSql(await raidOwner(wallet), ids);
  if (!sql) return 0;
  const rows = (await mcpExec(sql, { wrapJsonCte: true })) as Array<{ id: string }> | null;
  return rows?.length ?? 0;
}

export const markArtBreakShown = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ ids: z.array(z.string().min(1).max(120)).min(1).max(50) }).parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: true; marked: number }> => {
    const wallet = await requireBetaRaid();
    return { ok: true, marked: await markBreakShownAs(wallet, data.ids) };
  });

/**
 * Снять сломанное с героя вне удара (рынок героев — купленный герой). Механика
 * не запущена для этого кошелька — ничего не делаем. Сбой — в лог: покупка уже
 * прошла, а надетый сломанный — ровно то, как было до механики.
 */
export async function stripBrokenFromHero(
  wallet: string,
  heroId: string,
  key: string,
): Promise<number> {
  try {
    if (!(await artBrokenOn(wallet))) return 0;
    const rows = (await mcpExec(stripBrokenFromHeroSql(heroId, key))) as Array<{
      stripped?: unknown;
    }> | null;
    const n = Number(rows?.[0]?.stripped) || 0;
    if (n > 0) {
      const { invalidateHeroPower } = await import("@/server/api/beta-raid/hero-power");
      invalidateHeroPower(wallet);
    }
    return n;
  } catch (e) {
    console.warn("[art-broken] сломанное с героя не снялось:", e);
    return 0;
  }
}
