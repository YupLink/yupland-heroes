// Настоящий порт обряда зачарования героев: обряды и шаблоны — rite-sql,
// журнал — общие запросы лавки артефактов (enchant-port), деньги — маркетом,
// герои — снимками ломбарда (hero-pawn-take: снятие пачкой «всё или ничего»,
// возврат; hero-pawn-drop: рюкзак и надетое ушедших — мешочком).
import { mcpExec } from "@/server/db/mcpClient";
import { secureRandomInt } from "@/lib/secureRandom";
import type { HeroRite, RiteHero } from "@/lib/enchant/heroRite";
import { dbFlowPort } from "@/server/api/beta-raid/enchant/enchant-port";
import { marketPayPort } from "@/server/api/beta-raid/enchant/enchant-pay";
import { restorePawnHeroes, spendPawnHero } from "@/server/api/beta-raid/hero-pawn-take";
import { payPawnHeroes } from "@/server/api/beta-raid/hero-pawn-drop";
import { riteOfRow } from "./rite-input";
import {
  grantHeroSql,
  makeUniqueSql,
  riteClaimSql,
  riteFreeHeroesSql,
  riteDoneSql,
  riteRef,
  riteTemplatesSql,
  ritesAtSql,
} from "./rite-sql";
import type { RitePort } from "./rite-flow";

/** Обряды клетки по порядку (битые строки пропускаются). */
export async function loadRites(mapId: string, q: number, r: number): Promise<HeroRite[]> {
  const rows = (await mcpExec(ritesAtSql(mapId, q, r), { wrapJson: true })) as Array<
    Record<string, unknown>
  >;
  return (rows ?? []).map(riteOfRow).filter((s): s is HeroRite => !!s);
}

/** Свободные герои редкости — как у ломбарда (не основной, не на грядке…), без уников. */
export async function riteHeroes(account: string, rarity: HeroRite["rarity"]): Promise<RiteHero[]> {
  const rows = ((await mcpExec(riteFreeHeroesSql(account, rarity), { wrapJson: true })) ??
    []) as RiteHero[];
  return rows.map((r) => ({ ...r, level: Math.max(0, Math.floor(Number(r.level) || 0)) }));
}

export async function dbRitePort(
  wallet: string,
  account: string,
  op: string,
  cell: { mapId: string; q: number; r: number },
): Promise<RitePort> {
  const ref = riteRef(account, op);
  const pay = await marketPayPort(wallet, account, ref);
  // Журнал попыток общий с лавкой артефактов — его запросы оттуда же.
  const journal = await dbFlowPort(wallet, account, op);
  return {
    ...pay,
    loadRite: async (mapId, q, r, riteId) =>
      (await loadRites(mapId, q, r)).find((x) => x.id === riteId) ?? null,
    freeHeroes: riteHeroes,
    templates: async (target) =>
      ((await mcpExec(riteTemplatesSql(target), { wrapJson: true })) ?? []) as Array<{
        id: string;
        name: string;
        imageUrl: string | null;
      }>,
    readAttempt: journal.readAttempt,
    clearStale: journal.clearStale,
    notePaid: journal.notePaid,
    markRefunded: journal.markRefunded,
    claim: async (c) => {
      const rows = (await mcpExec(riteClaimSql(c))) as Array<{ claimed?: unknown }>;
      return Number(rows?.[0]?.claimed) > 0;
    },
    takeHeroes: async (rarity, heroIds, payRef) => {
      const receipt = await spendPawnHero(
        wallet,
        account,
        `hero_any_${rarity}`,
        heroIds.length,
        payRef,
        { heroItemIds: heroIds },
      );
      return receipt.paidHeroes ?? [];
    },
    restoreHeroes: (refs) => restorePawnHeroes(refs, refs.length),
    makeUnique: async (itemId) => {
      const rows = (await mcpExec(makeUniqueSql(itemId, account))) as Array<{ n?: unknown }>;
      if (!(Number(rows?.[rows.length - 1]?.n) > 0)) throw new Error("herorite.hero_busy");
    },
    grantHero: async (itemId, templateId) =>
      void (await mcpExec(grantHeroSql({ itemId, account, wallet, templateId }))),
    dropGone: async (heroes) =>
      void (await payPawnHeroes({
        wallet,
        account,
        mapId: cell.mapId,
        shop: { q: cell.q, r: cell.r },
        heroes,
      })),
    done: async (acc, o, res) => void (await mcpExec(riteDoneSql(acc, o, res))),
    rnd: secureRandomInt,
  };
}
