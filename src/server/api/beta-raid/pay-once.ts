// Плата энергией и товаром из рюкзака ПО КЛЮЧУ операции (запись на турнир).
// Здесь — ключ, общие куски SQL и энергия; товар — pay-once-item.ts.
//
// Золото (и цена «в билетах» — золотом ×500, §8.61) и токен проводят ключ сами (res_move, acc_move),
// а энергия (touch_energy_atomic) и рюкзак (UPDATE count) ключа не помнят: мост
// повторяет запрос вслепую, и ответ, потерянный после коммита, списывал второй
// раз (а откат — возвращал второй раз, подарком). Здесь у строки цены свой ключ
// в raid_backpack_op (как в backpack-take-once): он запирается тем же
// оператором, что списывает, — нет ключа, нет и списания, а повтор видит ключ и
// второй раз не берёт. По этим ключам разбор зависшей записи видит, списана
// строка или возвращена (tour-entry-sql.evidenceSql).
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";

/** Ключ строки цены в raid_backpack_op; возврат — payOp(`${key}:back`). */
export const payOp = (key: string): string => `pay:${key}`;

/** Как в рюкзаке: до тысячных, без хвоста double. */
export const qtyNum = (qty: number): number => Math.max(0, Math.round(qty * 1000) / 1000);

export const lockOp = (op: string, from: string): string =>
  `INSERT INTO yuplink.raid_backpack_op (op) SELECT ${sqlStr(op)}${from}
  ON CONFLICT (op) DO NOTHING
  RETURNING 1`;
export const priorOp = (op: string): string =>
  `SELECT EXISTS (SELECT 1 FROM yuplink.raid_backpack_op WHERE op = ${sqlStr(op)}) AS was`;

/** Первая строка ответа с row_to_json: мост отдаёт `_row` объектом или строкой. */
export function rowOf<T>(rows: unknown): T | undefined {
  const raw = Array.isArray(rows) ? rows[0] : undefined;
  if (!raw || typeof raw !== "object") return undefined;
  const v = "_row" in raw ? (raw as { _row: unknown })._row : raw;
  return (typeof v === "string" ? JSON.parse(v) : v) as T | undefined;
}

/** Списать энергию: ключ лёг — списали; ключ уже был — списано прошлой попыткой. */
export function energySpendSql(wallet: string, amount: number, key: string): string {
  return `WITH claim AS (
  ${lockOp(payOp(key), "")}
),
spend AS (SELECT yuplink.touch_energy_atomic(${sqlStr(wallet)}, ${Number(amount)}::numeric) AS r FROM claim)
SELECT row_to_json(_t.*) AS _row FROM (
  SELECT (SELECT count(*) FROM spend)::int AS spent
) _t;`;
}

/** Вернуть энергию (вид energy_refund — восстанавливает купленный запас) — один раз на ключ. */
export function energyBackSql(wallet: string, amount: number, key: string): string {
  return `WITH claim AS (
  ${lockOp(payOp(`${key}:back`), "")}
),
g AS (
  SELECT yuplink.add_energy(${sqlStr(wallet)}, ${Number(amount)}::numeric, 'energy_refund', ${sqlStr(`${key}:back`)}) AS r
    FROM claim
)
SELECT row_to_json(_t.*) AS _row FROM (SELECT (SELECT count(*) FROM g)::int AS given) _t;`;
}

/** Нехватка энергии — понятными словами; прочие сбои базы — как есть. */
export async function spendEnergyOnce(wallet: string, amount: number, key: string): Promise<void> {
  await mcpExec(energySpendSql(wallet, amount, key)).catch((e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(/not_enough_energy/.test(msg) ? "Не хватает энергии" : msg);
  });
}

export async function refundEnergyOnce(wallet: string, amount: number, key: string): Promise<void> {
  await mcpExec(energyBackSql(wallet, amount, key));
}
