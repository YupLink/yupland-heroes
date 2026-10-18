// Пулы банка (владелец, 14.10.2026): админ заводит пару и стартовый курс, без
// запаса — наполнение и обмен позже. DARAI — только в паре с золотом (пишем как
// «золото → DARAI»); одна пара — один пул. Удалить можно только пустой пул.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "../../db/mcpClient";
import { requireAdmin } from "../../auth";
import { sqlStr } from "../raid-shared";
import {
  BANK_FEES,
  BANK_TOKENS,
  canonicalPair,
  pairProblem,
  type BankPool,
  type BankToken,
} from "@/lib/castleBank";

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

const toPool = (r: Row): BankPool => ({
  id: r.id,
  tokenA: r.token_a,
  tokenB: r.token_b,
  weightA: Number(r.weight_a),
  weightB: Number(r.weight_b),
  reserveA: Number(r.reserve_a),
  reserveB: Number(r.reserve_b),
  feePct: Number(r.fee_pct),
  createdAt: String(r.created_at),
});

export async function listPools(): Promise<BankPool[]> {
  const rows = (await mcpExec(
    `SELECT id, token_a, token_b, weight_a, weight_b, reserve_a, reserve_b, fee_pct, created_at
       FROM yuplink.bank_pool ORDER BY created_at;`,
    { wrapJson: true },
  )) as Row[];
  return (rows ?? []).map(toPool);
}

export const listBankPools = createServerFn({ method: "GET" }).handler(async () => {
  requireAdmin();
  return listPools();
});

const token = z.enum(BANK_TOKENS);
/** Вес стороны: положительное число, не больше триллиона, до 6 знаков после запятой. */
const weight = z
  .number()
  .positive()
  .max(1e12)
  .refine((n) => Math.abs(n * 1e6 - Math.round(n * 1e6)) < 1e-6, "Не больше 6 знаков после запятой");

const createSchema = z.object({
  tokenA: token,
  tokenB: token,
  weightA: weight,
  weightB: weight,
  feePct: z.number().refine((f) => (BANK_FEES as readonly number[]).includes(f), "Комиссия не из списка"),
});

export const createBankPool = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ data }) => {
    const wallet = requireAdmin();
    const problem = pairProblem(data.tokenA, data.tokenB);
    if (problem === "same") throw new Error("Выбери два разных ресурса");
    if (problem === "darai_only_gold") throw new Error("DARAI меняется только на золото");
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
