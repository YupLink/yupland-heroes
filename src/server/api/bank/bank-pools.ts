// Пулы банка (владелец, 14.10.2026): админ заводит пару и стартовый курс, без
// запаса — наполнение и обмен позже. Список пулов (только чтение) открыт игрокам
// 20.10.2026 — у кого построен банк (bank-access.ts); завести и удалить — только админ.
// С 25.10.2026 пара — любая: ресурсы игры и все монеты счёта (bank-tokens.ts); DARAI
// пишется второй стороной. Одна пара — один пул. Удалить можно только пустой пул.
// С 29.10.2026 пул можно править (updateBankPool): комиссию — всегда, курс — пока пуст.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "../../db/mcpClient";
import { isAdminWallet, requireAdmin, requireWallet } from "../../auth";
import { sqlStr } from "../raid-shared";
import {
  BANK_FEES,
  canonicalPair,
  pairProblem,
  type BankPool,
  type BankToken,
} from "@/lib/castleBank";
import { bankAccount } from "./bank-access";
import { bankTokens } from "./bank-tokens";
import { googleOnlyWallet } from "@/lib/auth/entryRules";

type Row = {
  id: string;
  token_a: BankToken;
  token_b: BankToken;
  weight_a: number | string;
  weight_b: number | string;
  reserve_a: number | string;
  reserve_b: number | string;
  fee_pct: number | string;
  created_at: string;
};

const toPool = (r: Row, dp: Map<string, number>): BankPool => ({
  id: r.id,
  tokenA: r.token_a,
  tokenB: r.token_b,
  weightA: Number(r.weight_a),
  weightB: Number(r.weight_b),
  reserveA: Number(r.reserve_a),
  reserveB: Number(r.reserve_b),
  feePct: Number(r.fee_pct),
  createdAt: String(r.created_at),
  dpA: dp.get(r.token_a),
  dpB: dp.get(r.token_b),
});

export async function listPools(): Promise<BankPool[]> {
  const [rows, tokens] = await Promise.all([
    mcpExec(
      `SELECT id, token_a, token_b, weight_a, weight_b, reserve_a, reserve_b, fee_pct, created_at
         FROM yuplink.bank_pool ORDER BY created_at;`,
      { wrapJson: true },
    ) as Promise<Row[]>,
    bankTokens(),
  ]);
  const dp = new Map(tokens.map((t) => [t.symbol, t.dp]));
  return (rows ?? []).map((r) => toPool(r, dp));
}

export const listBankPools = createServerFn({ method: "GET" }).handler(async () => {
  const wallet = requireWallet();
  // Админу пулы видны и без своего счёта (сервисный кошелёк).
  if (!isAdminWallet(wallet)) await bankAccount(wallet);
  const pools = await listPools();
  // «Только Google» (владелец, 11.11.2026, §8.127): пул USDT закрыт, DARAI — остаётся.
  return googleOnlyWallet(wallet) ? pools.filter((p) => !usdtPool(p)) : pools;
});

/** В паре есть USDT. */
export const usdtPool = (p: Pick<BankPool, "tokenA" | "tokenB">): boolean =>
  p.tokenA === "USDT" || p.tokenB === "USDT";

/** Символ ресурса или монеты; есть ли такая — сверяет обработчик со справочником. */
const token = z.string().regex(/^[A-Za-z0-9_-]{1,24}$/);
/** Вес стороны: положительное число, не больше триллиона, до 6 знаков после запятой. */
const weight = z
  .number()
  .positive()
  .max(1e12)
  .refine(
    (n) => Math.abs(n * 1e6 - Math.round(n * 1e6)) < 1e-6,
    "Не больше 6 знаков после запятой",
  );

/** Комиссия — только из списка BANK_FEES. */
const fee = z
  .number()
  .refine((f) => (BANK_FEES as readonly number[]).includes(f), "Комиссия не из списка");

const createSchema = z.object({
  tokenA: token,
  tokenB: token,
  weightA: weight,
  weightB: weight,
  feePct: fee,
});

export const createBankPool = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ data }) => {
    const wallet = requireAdmin();
    if (pairProblem(data.tokenA, data.tokenB) === "same")
      throw new Error("Выбери две разные монеты");
    const known = new Set((await bankTokens()).map((t) => t.symbol));
    for (const t of [data.tokenA, data.tokenB])
      if (!known.has(t)) throw new Error(`Такой монеты в банке нет: ${t}`);
    const p = canonicalPair(data.tokenA, data.tokenB, data.weightA, data.weightB);
    const id = `bp_${globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    try {
      await mcpExec(
        `INSERT INTO yuplink.bank_pool (id, token_a, token_b, weight_a, weight_b, fee_pct, created_by)
         VALUES (${sqlStr(id)}, ${sqlStr(p.a)}, ${sqlStr(p.b)}, ${p.wa}, ${p.wb}, ${data.feePct}, ${sqlStr(wallet)});`,
        { wrapJson: false },
      );
    } catch (e) {
      if (/bank_pool_pair_uq|duplicate key/i.test(String((e as Error).message)))
        throw new Error("Пул на эту пару уже есть");
      throw e;
    }
    return { id };
  });

export const deleteBankPool = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().min(3).max(40) }).parse(d))
  .handler(async ({ data }) => {
    requireAdmin();
    const rows = (await mcpExec(
      `DELETE FROM yuplink.bank_pool
        WHERE id = ${sqlStr(data.id)} AND reserve_a = 0 AND reserve_b = 0
        RETURNING id;`,
      { wrapJsonCte: true },
    )) as Array<{ id: string }>;
    if (!rows?.length) throw new Error("Удалить можно только пустой пул");
    return { ok: true as const };
  });

/** Правка: комиссия и/или курс (оба веса сразу); хоть что-то одно. */
const updateSchema = z
  .object({
    id: z.string().regex(/^[A-Za-z0-9_]{3,40}$/),
    feePct: fee.optional(),
    weightA: weight.optional(),
    weightB: weight.optional(),
  })
  .refine((d) => (d.weightA === undefined) === (d.weightB === undefined), "Курс — оба веса сразу")
  .refine((d) => d.feePct !== undefined || d.weightA !== undefined, "Нечего менять");

/**
 * Правка пула (владелец, 29.10.2026: «есть ли там веса — введи и дай возможность
 * вводить, и какая комса»). Комиссия — всегда; курс (веса стороны A и B в порядке
 * пула) — только пока пул пуст: у наполненного цену задают запасы. Одним UPDATE:
 * запрошен курс, а пул уже наполнен — не меняется ничего, и комиссия тоже.
 */
export const updateBankPool = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => updateSchema.parse(d))
  .handler(async ({ data }) => {
    requireAdmin();
    const rate = data.weightA !== undefined && data.weightB !== undefined;
    const set = [
      data.feePct !== undefined ? `fee_pct = ${data.feePct}` : null,
      rate ? `weight_a = ${data.weightA}, weight_b = ${data.weightB}` : null,
    ].filter((x): x is string => x !== null);
    const id = sqlStr(data.id);
    const rows = (await mcpExec(
      `UPDATE yuplink.bank_pool SET ${set.join(", ")}
        WHERE id = ${id}${rate ? " AND reserve_a = 0 AND reserve_b = 0" : ""}
        RETURNING id;`,
      { wrapJsonCte: true },
    )) as Array<{ id: string }>;
    if (rows?.length) return { ok: true as const };
    const found = rate
      ? ((await mcpExec(`SELECT id FROM yuplink.bank_pool WHERE id = ${id};`, {
          wrapJson: true,
        })) as Array<{ id: string }>)
      : [];
    throw new Error(found?.length ? "Курс меняется только у пустого пула" : "Пул не найден");
  });
