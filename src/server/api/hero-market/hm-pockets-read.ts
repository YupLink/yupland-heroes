// Рынок героев: снимок карманов для раскладки (hm-pockets-plan) — карманы
// выставляемого, рюкзак основного героя и его ёмкости.
//
// Выставление: снимок и «отпечаток» (yuplink.hero_market_pockets_fp, migrations/
// hero-market-03) — одним оператором, то есть одним снимком базы. Функция
// выставления под замками рюкзаков сверяет отпечаток: совпал — раскладка
// посчитана ровно по тому, что лежит, не совпал — 'pockets_changed', код
// перечитывает и считает заново. Ёмкость основного (торговля, алхимия, баффы)
// считает код (resolveBackpack) — как у любой выдачи в рюкзак.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { resolveBackpack } from "@/server/api/beta-raid/market-backpack";
import { IS_POTION_SQL, POTION_JOIN } from "@/server/api/beta-raid/potion-bag";
import type { BagStack } from "@/server/api/beta-raid/chest/chest-loot-plan";
import type { MainBag, PocketRow } from "@/server/api/hero-market/hm-pockets-plan";

/** Основной герой глазами раскладки: id и ёмкости (стопки читаются отдельно). */
export type MainCaps = Omit<MainBag, "stacks">;

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Основной герой кошелька и его ёмкости; нет основного — null. */
export async function mainCapsOf(wallet: string): Promise<MainCaps | null> {
  const bp = await resolveBackpack(wallet);
  return bp
    ? { heroId: bp.heroId, capacity: bp.capacity, potionCapacity: bp.potionCapacity }
    : null;
}

/** Поля стопки карманов (алиас b, после POTION_JOIN). */
const POCKET_JSON = `json_build_object('stackKey', b.stack_key, 'kind', b.kind, 'refId', b.ref_id,
            'name', b.name, 'count', b.count, 'wear', b.wear, 'potion', ${IS_POTION_SQL})`;

/** Снимок для выставления копии героя: карманы, рюкзак основного, отпечаток. */
export function pocketsSnapSql(account: string, itemId: string, mainId: string | null): string {
  const main = mainId ? sqlStr(mainId) : "NULL";
  return `SELECT x.id AS "heroId",
       (SELECT COALESCE(json_agg(${POCKET_JSON} ORDER BY b.stack_key), '[]'::json)
          FROM yuplink.raid_hero_backpack b ${POTION_JOIN}
         WHERE b.hero_id = x.id AND b.count > 0) AS pockets,
       (SELECT COALESCE(json_agg(json_build_object('stackKey', b.stack_key, 'count', b.count,
                 'potion', ${IS_POTION_SQL})), '[]'::json)
          FROM yuplink.raid_hero_backpack b ${POTION_JOIN}
         WHERE b.hero_id = ${main} AND b.count > 0) AS main,
       yuplink.hero_market_pockets_fp(x.id, ${main}) AS seen
     FROM yuplink.hero_instance x
    WHERE x.item_id = ${sqlStr(itemId)} AND x.account_id = ${sqlStr(account)}`;
}

/** Стопки всех героев аккаунта (превью окна «Выставить»: карманы и рюкзак основного). */
export function accountPocketsSql(account: string): string {
  return `SELECT b.hero_id AS "heroId", ${POCKET_JSON} AS s
     FROM yuplink.raid_hero_backpack b ${POTION_JOIN}
    WHERE b.count > 0
      AND b.hero_id IN (SELECT x.id FROM yuplink.hero_instance x
                         WHERE x.account_id = ${sqlStr(account)})`;
}

type RawPocket = Record<string, unknown>;

const parsed = (v: unknown): unknown => {
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v) as unknown;
  } catch {
    return null;
  }
};

/** Строка json → стопка карманов (числа — числами, мусор — нулём). */
export function pocketOf(p: RawPocket): PocketRow {
  return {
    stackKey: String(p.stackKey ?? ""),
    kind: String(p.kind ?? ""),
    refId: typeof p.refId === "string" ? p.refId : null,
    name: String(p.name ?? ""),
    count: Math.max(0, num(p.count)),
    wear: Math.max(0, num(p.wear)),
    potion: p.potion === true,
  };
}

const listOf = (v: unknown): RawPocket[] => {
  const a = parsed(v);
  return Array.isArray(a) ? (a as RawPocket[]) : [];
};

/** Снимок к выставлению: карманы, основной с рюкзаком (null — нет основного), отпечаток. */
export type PocketsSnap = { rows: PocketRow[]; main: MainBag | null; seen: string };

export async function readPocketsSnap(
  account: string,
  itemId: string,
  caps: MainCaps | null,
): Promise<PocketsSnap> {
  const sql = pocketsSnapSql(account, itemId, caps?.heroId ?? null);
  const got = (await mcpExec(sql, { wrapJson: true })) as Array<Record<string, unknown>> | null;
  const row = got?.[0];
  const stacks: BagStack[] = listOf(row?.main).map((s) => ({
    stackKey: String(s.stackKey ?? ""),
    count: Math.max(0, num(s.count)),
    potion: s.potion === true,
  }));
  return {
    rows: listOf(row?.pockets).map(pocketOf),
    main: caps ? { ...caps, stacks } : null,
    seen: typeof row?.seen === "string" ? row.seen : "",
  };
}

/** Стопки героев аккаунта по героям (превью). */
export async function readAccountPockets(account: string): Promise<Map<string, PocketRow[]>> {
  const got = (await mcpExec(accountPocketsSql(account), { wrapJson: true })) as Array<{
    heroId: string;
    s: unknown;
  }> | null;
  const out = new Map<string, PocketRow[]>();
  for (const r of got ?? []) {
    const s = parsed(r.s);
    if (!s || typeof s !== "object") continue;
    out.set(r.heroId, [...(out.get(r.heroId) ?? []), pocketOf(s as RawPocket)]);
  }
  return out;
}
