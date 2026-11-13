// Модель базы для «выпить зелья» (potion-drink.ts) в тестах.
//
// Построитель SQL в тестах подменён: вместо текста он отдаёт свой вход JSON-ом
// (drinkSqlStub), а модель исполняет этот план так, как его исполняет оператор
// potion-drink-sql.ts, — ЦЕЛИКОМ, как одну транзакцию: ключ нажатия, списание
// и эффекты пишутся в черновик и попадают в «базу» только в конце. Сбой посреди
// эффектов (failAfter) бросает до коммита — как откат Postgres.
//
// Что сам SQL ведёт себя так же, проверено на живом Postgres в BEGIN … ROLLBACK
// (22.10.2026: успех, повтор моста, повтор нажатия, нехватка, сбой на последнем
// эффекте — потом ничего не осталось); его текст держит potion-drink-sql.test.ts.
import type { DrinkSqlInput } from "@/server/api/beta-raid/potion-drink-sql";

const TAG = "/*potion-drink*/";

/** Подмена potionDrinkSql: план вместо текста. */
export const drinkSqlStub = (o: DrinkSqlInput): string => `${TAG}${JSON.stringify(o)}`;

export type FxRow = { kind: string; value: number; minutes: number };

export const pdb = {
  /** Стопки героя: ключ → штук. */
  stock: new Map<string, number>(),
  /** Записанные строки эффектов (буст, иммунитет, забвение, сытость). */
  fx: [] as FxRow[],
  satiety: 0,
  ops: new Map<string, { source: string; amount: number }>(),
  /** Настройка буста товара по канону (raid_custom_item.boost). */
  boost: new Map<string, unknown>(),
  /** Бросить после стольких записанных эффектов (null — без сбоя). */
  failAfter: null as number | null,
  /** Изношенный инструмент: оператор падает на CHECK рюкзака. */
  worn: false,
  /** Ответ потерян после коммита: мост повторил тот же текст / сдался. */
  lose: null as "retry" | "give-up" | null,
  /** Сколько операторов «выпить» дошло до базы (с повторами моста). */
  runs: 0,
  /** Все запросы — чтобы видеть, что писем мимо оператора нет. */
  sql: [] as string[],
};

export function resetDrinkDb(stock: Record<string, number>): void {
  Object.assign(pdb, {
    fx: [],
    satiety: 0,
    failAfter: null,
    worn: false,
    lose: null,
    runs: 0,
    sql: [],
  });
  pdb.stock = new Map(Object.entries(stock));
  pdb.ops = new Map();
  pdb.boost = new Map();
}

type Row = { prior: string | null; fresh: boolean; took: number; short: string | null };

/** Один оператор «выпить»: всё или ничего. */
function run(p: DrinkSqlInput): Row {
  pdb.runs++;
  if (pdb.worn)
    throw new Error('new row violates check constraint "raid_hero_backpack_worn_stays"');
  const prior = pdb.ops.get(p.op)?.source ?? null;
  const have = (k: string, n: number) => !prior && (pdb.stock.get(k) ?? 0) >= n;
  const short = p.need.find((n) => !have(n.stackKey, n.qty))?.stackKey ?? null;
  if (short) return { prior, fresh: false, took: 0, short };
  // Черновик транзакции.
  const stock = new Map(pdb.stock);
  const fx = [...pdb.fx];
  let satiety = pdb.satiety;
  let writes = 0;
  const write = (row: FxRow) => {
    if (pdb.failAfter !== null && writes >= pdb.failAfter)
      throw new Error(`сбой базы на эффекте №${writes + 1}`);
    fx.push(row);
    writes++;
  };
  for (const n of p.need) {
    const left = (stock.get(n.stackKey) ?? 0) - n.qty;
    if (left > 0) stock.set(n.stackKey, left);
    else stock.delete(n.stackKey);
  }
  for (const b of p.effects.buffs) write({ kind: b.kind, value: b.value, minutes: b.minutes });
  for (const t of p.effects.timed) write({ kind: t.kind, value: 1, minutes: t.minutes });
  for (const o of p.effects.oblivion)
    write({ kind: `oblivion_${o.mode}`, value: o.level, minutes: o.minutes });
  if (p.effects.satiety > 0 && p.satietyHero) {
    write({ kind: "satiety", value: p.effects.satiety, minutes: 0 });
    satiety = Math.min(p.satietyHero.max, satiety + p.effects.satiety);
  }
  // Коммит.
  pdb.stock = stock;
  pdb.fx = fx;
  pdb.satiety = satiety;
  pdb.ops.set(p.op, { source: p.mark, amount: p.amount });
  return { prior: null, fresh: true, took: p.need.length, short: null };
}

/** Подмена mcpExec. */
export async function drinkExec(sql: string): Promise<unknown[]> {
  pdb.sql.push(sql);
  if (sql.startsWith(TAG)) {
    const plan = JSON.parse(sql.slice(TAG.length)) as DrinkSqlInput;
    const first = run(plan);
    if (pdb.lose === "give-up") throw new Error("MCP timeout");
    // Мост повторил вслепую тот же текст — ответ второго выполнения.
    const row = pdb.lose === "retry" ? run(plan) : first;
    return [{ _row: JSON.stringify(row) }];
  }
  const op = /FROM yuplink\.hero_boost_op WHERE op = '([^']*)'/.exec(sql)?.[1];
  if (op !== undefined) {
    const r = pdb.ops.get(op);
    return r ? [r] : [];
  }
  const cst = /FROM yuplink\.raid_custom_item WHERE id = '([^']*)'/.exec(sql)?.[1];
  if (cst !== undefined) return [{ boost: pdb.boost.get(cst) ?? null }];
  return [];
}

/** Записи «мимо» оператора: любой другой пишущий запрос — ошибка теста. */
export const strayWrites = (): string[] =>
  pdb.sql.filter((s) => !s.startsWith(TAG) && /\b(INSERT|UPDATE|DELETE)\b/i.test(s));
