// Выпить зелья (одно или набор): списание и эффекты — всё или ничего.
//
// Общий путь «использовать» (boost-item.ts) и «использовать набор»
// (boost-items.ts, Алхимические карманы). Весь набор, ключ нажатия и все
// эффекты пишутся одной транзакцией (potion-drink-sql.ts), поэтому:
//  - сбой посреди записи — не списано ничего и не наложено ничего (откат базы),
//    возвращать зелья и снимать эффекты вручную не нужно;
//  - повтор моста (тот же текст, та же метка) узнаёт своё нажатие по метке
//    ключа — успех без второго списания;
//  - повтор того же нажатия из браузера (тот же ключ, другая метка) — «уже
//    выпито», без списания и без эффектов.
import { nanoid } from "nanoid";
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { rowOf } from "@/server/api/beta-raid/pay-once";
import { raidOwner } from "@/server/api/beta-raid/owner";
import { drinkEffects, drinkNeeds } from "@/server/api/beta-raid/potion-drink-plan";
import { potionDrinkSql, type DrinkSqlRow } from "@/server/api/beta-raid/potion-drink-sql";
import { satietyMax } from "@/lib/hero/satiety";
import type { BoostRoll } from "@/lib/hero/boost";

/** Строка набора: вид (ключ стопки), сколько штук и что выпало. */
export type DrinkLine = { stackKey: string; qty: number; rolls: BoostRoll[] };

export type DrinkOutcome =
  /** Выпито этим нажатием (в том числе повтором моста). */
  | { state: "done" }
  /** Это нажатие уже было: amount — что начислили тогда. */
  | { state: "repeat"; amount: number }
  /** Не хватило штук вида (null — какого, не разобрали); не списано ничего. */
  | { state: "short"; stackKey: string | null };

/** Кому сытость: выбранный герой и его потолок — как у moveSatiety. */
async function satietyHeroOf(wallet: string): Promise<{ heroId: string; max: number } | null> {
  const { loadHeroView } = await import("./hero-power");
  const info = (await loadHeroView(wallet).catch(() => null))?.info;
  return info ? { heroId: info.heroId, max: satietyMax(info.rarity, info.spec) } : null;
}

/** Ответ оператора; не разобрался — undefined (тогда решает строка ключа). */
function parsed(rows: unknown): DrinkSqlRow | undefined {
  try {
    return rowOf<DrinkSqlRow>(rows);
  } catch {
    return undefined;
  }
}

/** Строка ключа нажатия, если она уже лежит. */
async function readOp(op: string): Promise<{ source: string | null; amount: number } | null> {
  const rows = (await mcpExec(
    `SELECT source, amount::float8 AS amount FROM yuplink.hero_boost_op WHERE op = ${sqlStr(op)} LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ source: string | null; amount: number | string }>;
  const r = rows?.[0];
  return r ? { source: r.source ?? null, amount: Number(r.amount) || 0 } : null;
}

export async function drinkPotions(o: {
  wallet: string;
  heroId: string;
  /** Ключ нажатия на весь вызов. */
  op: string;
  /** Подпись в hero_boost_op (item:<канон> / items:<видов>). */
  source: string;
  lines: DrinkLine[];
}): Promise<DrinkOutcome> {
  const need = drinkNeeds(o.lines);
  if (!need.length) throw new Error("Столько штук в сумке нет");
  const rolls = o.lines.flatMap((l) => l.rolls);
  const effects = drinkEffects(rolls);
  const [account, satietyHero] = await Promise.all([
    raidOwner(o.wallet),
    effects.satiety > 0 ? satietyHeroOf(o.wallet) : Promise.resolve(null),
  ]);
  const mark = `${o.source}#${nanoid(10)}`;
  const sql = potionDrinkSql({
    op: o.op,
    mark,
    heroId: o.heroId,
    account,
    stat: rolls[0]?.stat ?? "spd",
    amount: rolls.reduce((n, r) => n + r.amount, 0),
    need,
    effects,
    satietyHero,
    newId: () => `bpe_${nanoid(10)}`,
  });
  const rows = await mcpExec(sql, { wrapJson: false }).catch((e: unknown) => {
    // Изношенный инструмент из рюкзака не уходит (CHECK, §8.19) — своя причина.
    if (/raid_hero_backpack_worn_stays/.test(String(e))) throw new Error("braid.tool_worn_stays");
    throw e;
  });
  const row = parsed(rows);
  if (row?.fresh === true) return { state: "done" };
  // Ключ уже лежит или ответ не разобрался — решает строка ключа, а не слепой
  // отказ: своя метка — это нажатие уже выпито (повтор моста), чужая — повтор
  // нажатия (в том числе параллельный, которого снимок ещё не видел).
  const prev = await readOp(o.op);
  if (prev?.source === mark) return { state: "done" };
  if (prev) return { state: "repeat", amount: prev.amount };
  return { state: "short", stackKey: row?.short ?? null };
}
