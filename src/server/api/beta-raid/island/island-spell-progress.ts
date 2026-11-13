// Credit only a successful paid learn at this island's actual pillar.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { canFundPillar, islandSpellReceiptTail } from "@/lib/raid/island/shortSpell";
import { raidOwner } from "../owner";
import { loadIsland } from "./island-row";
import type { PortalPrice } from "@/lib/portal";

const PENDING = "island_spell_pending:";
type Attempt = { mapId: string; q: number; r: number; spellId: string; prices: PortalPrice[] };

async function pillarAccount(wallet: string, mapId: string, q: number, r: number) {
  if (!mapId.startsWith("isle_")) return null;
  const account = await raidOwner(wallet), row = await loadIsland(account);
  const pillar = row?.places.lesson?.pillar;
  return row?.mapId === mapId && !row.skippedAt && pillar?.q === q && pillar.r === r ? account : null;
}

/** Attribution is recorded by the normal operation claim BEFORE book/payment. */
export async function islandPillarSource(wallet: string, a: Attempt): Promise<string | null> {
  if (!await pillarAccount(wallet, a.mapId, a.q, a.r)) return null;
  return PENDING + JSON.stringify(a);
}

async function markPillar(account: string, mapId: string, q: number, r: number) {
  await mcpExec(`UPDATE yuplink.raid_island
    SET done = (SELECT jsonb_agg(DISTINCT x) FROM jsonb_array_elements_text(done || '["spell"]'::jsonb) x)
    WHERE account_id = ${sqlStr(account)} AND map_id = ${sqlStr(mapId)}
      AND tutorial_skipped_at IS NULL AND places->'lesson'->>'version' = '1'
      AND places->'lesson'->'pillar'->>'q' = ${sqlStr(String(q))}
      AND places->'lesson'->'pillar'->>'r' = ${sqlStr(String(r))};`);
}

export async function noteIslandPillarLearn(wallet: string, mapId: string, q: number, r: number,
  heroId: string, spellId: string, op: string): Promise<void> {
  const account = await pillarAccount(wallet, mapId, q, r);
  if (!account) return;
  // This marker is written ONLY after normal payment has succeeded. The book
  // alone cannot prove at which pillar a spell was learned. Keep the receipt
  // even if the next progress write fails; factsSql can recover it on polling.
  const source = `spell_learn:${spellId}${islandSpellReceiptTail(mapId, q, r)}`;
  const receipt = await mcpExec(`UPDATE yuplink.hero_boost_op o SET source = ${sqlStr(source)}
    WHERE o.op = ${sqlStr(op)} AND o.hero_id = ${sqlStr(heroId)}
      AND (left(o.source, ${`spell_learn:${spellId}#`.length}) = ${sqlStr(`spell_learn:${spellId}#`)}
        OR left(o.source, ${PENDING.length}) = ${sqlStr(PENDING)} OR o.source = ${sqlStr(source)})
      AND EXISTS (SELECT 1 FROM yuplink.hero_instance h WHERE h.id = o.hero_id AND h.account_id = ${sqlStr(account)})
    RETURNING o.op;`, { wrapJsonCte: true }) as unknown[];
  if (!receipt?.length) return;
  await markPillar(account, mapId, q, r);
}

/** Called only after requirePillar has checked position and the ordinary offer.
 * A spell known BEFORE this island needs no second purchase. Fresh book rows
 * inserted before payment do not qualify. An interrupted post-payment note
 * is recovered from the attributed attempt and actual payment journals.
 */
export async function noteIslandPillarOffer(wallet: string, mapId: string, q: number, r: number,
  heroId: string, knownOffer: readonly string[]): Promise<void> {
  if (!knownOffer.length) return;
  const account = await pillarAccount(wallet, mapId, q, r);
  if (!account) return;
  const ids = knownOffer.map(sqlStr).join(", ");
  const old = await mcpExec(`SELECT 1 FROM yuplink.hero_spellbook b
    JOIN yuplink.hero_instance h ON h.id = b.hero_id
    JOIN yuplink.raid_island i ON i.account_id = h.account_id
    WHERE h.account_id = ${sqlStr(account)} AND h.id = ${sqlStr(heroId)}
      AND i.map_id = ${sqlStr(mapId)} AND b.spell_id IN (${ids})
      AND b.learned_at <= i.created_at LIMIT 1;`, { wrapJson: true }) as unknown[];
  if (old?.length) { await markPillar(account, mapId, q, r); return; }
  const attempts = await mcpExec(`SELECT o.op, o.source FROM yuplink.hero_boost_op o
    JOIN yuplink.hero_instance h ON h.id = o.hero_id
    WHERE h.id = ${sqlStr(heroId)} AND h.account_id = ${sqlStr(account)}
      AND left(o.source, ${PENDING.length}) = ${sqlStr(PENDING)}
    ORDER BY o.created_at DESC LIMIT 20;`, { wrapJson: true }) as Array<{op: string; source: string}>;
  for (const op of attempts ?? []) {
    let a: Attempt;
    try { a = JSON.parse(op.source.slice(PENDING.length).replace(/#[^#]*$/, "")); } catch { continue; }
    if (a.mapId !== mapId || a.q !== q || a.r !== r || !knownOffer.includes(a.spellId) || !Array.isArray(a.prices) || !canFundPillar(a.prices)) continue;
    const evidence = a.prices.map((p, i) => {
      const key = sqlStr(`spell_learn:${op.op}:${i}:${p.resource}`), back = sqlStr(`spell_learn:${op.op}:${i}:${p.resource}:back`);
      if (p.resource === "likes") return `EXISTS (SELECT 1 FROM yuplink.like_spend_log
        WHERE wallet = ${sqlStr(wallet)} AND ref = ${key} AND amount >= ${Number(p.amount)})`;
      if (p.resource === "energy") return `(EXISTS (SELECT 1 FROM yuplink.raid_backpack_op WHERE op = 'pay:' || ${key})
        AND NOT EXISTS (SELECT 1 FROM yuplink.raid_backpack_op WHERE op = 'pay:' || ${back}))`;
      if (["gold", "wood", "stone", "diamonds"].includes(p.resource)) return `(EXISTS (SELECT 1 FROM yuplink.res_ledger
        WHERE account_id = ${sqlStr(account)} AND resource = ${sqlStr(p.resource)} AND kind = 'portal' AND ref = ${key} AND delta <= -${Number(p.amount)})
        AND NOT EXISTS (SELECT 1 FROM yuplink.res_ledger WHERE account_id = ${sqlStr(account)} AND kind = 'portal_refund' AND ref = ${back}))`;
      return "false";
    });
    const rows = await mcpExec(`SELECT (${evidence.join(" AND ")}) AS paid;`, { wrapJson: true }) as Array<{paid: boolean}>;
    if (rows?.[0]?.paid) {
      await noteIslandPillarLearn(wallet, mapId, q, r, heroId, a.spellId, op.op);
      return;
    }
  }
}
