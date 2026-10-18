// Серверные функции экрана «Казна». Только владельцу: это деньги.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requirePayoutsAdmin } from "../../auth";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../chips-utils";
import { treasuryRows, underCovered, OPERATING_WALLET } from "./treasury";

/** Остаток NEAR на подписанте: выплаты встают из-за газа раньше, чем из-за токенов. */
async function operatingNear(): Promise<number | null> {
  try {
    const { nearRpc } = await import("../../rpc");
    const j = await nearRpc<{ amount?: string }>("query", {
      request_type: "view_account",
      finality: "final",
      account_id: OPERATING_WALLET,
    });
    const yocto = j.result?.amount;
    if (!yocto) return null;
    return Number(BigInt(yocto) / 10n ** 18n) / 1e6;
  } catch {
    return null;
  }
}

export const adminTreasury = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({ onChain: z.boolean().optional() })
      .default({})
      .parse(d ?? {}),
  )
  .handler(async ({ data }) => {
    requirePayoutsAdmin();
    const rows = await treasuryRows(data.onChain !== false);
    return {
      rows,
      alerts: underCovered(rows).map((r) => r.token),
      // Награды, которые ещё не переехали на счёт: пока их нельзя потратить,
      // только вывести. После переезда список пустеет.
      waiting: rows.filter((r) => r.unpaidRewards > 0).map((r) => r.token),
      near: await operatingNear(),
      operatingWallet: OPERATING_WALLET,
    };
  });

const LEDGER_SQL = (where: string, limit: number) => `
SELECT l.id, l.account_id, l.wallet, l.token, l.delta::text AS delta, l.kind, l.ref,
       l.balance_after::text AS balance_after, l.created_at,
       u.wallet AS owner_wallet
  FROM yuplink.acc_ledger l
  LEFT JOIN LATERAL (
    SELECT wallet FROM yuplink.users WHERE account_id = l.account_id ORDER BY wallet LIMIT 1
  ) u ON true
 ${where}
 ORDER BY l.created_at DESC, l.id DESC
 LIMIT ${limit};
`;

export const adminAccLedger = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({
        token: z.string().max(32).optional(),
        wallet: z.string().max(80).optional(),
        limit: z.number().int().min(1).max(200).optional(),
      })
      .default({})
      .parse(d ?? {}),
  )
  .handler(async ({ data }) => {
    requirePayoutsAdmin();
    const conds: string[] = [];
    if (data.token) conds.push(`l.token = ${sqlStr(data.token)}`);
    if (data.wallet) {
      // Ищем по любому кошельку аккаунта, а не только по тому, что записан в строке.
      conds.push(
        `l.account_id IN (SELECT account_id FROM yuplink.users WHERE wallet = ${sqlStr(
          data.wallet.trim().toLowerCase(),
        )} AND account_id IS NOT NULL)`,
      );
    }
    const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
    const rows = (await mcpExec(LEDGER_SQL(where, data.limit ?? 50), { wrapJson: true })) ?? [];
    return { rows: rows as Array<Record<string, string | null>> };
  });

/**
 * Ручная правка баланса. Последний рубеж, когда операция сорвалась на полпути.
 * Пояснение обязательно и уезжает в ключ операции — иначе через месяц никто
 * не вспомнит, откуда взялись эти токены.
 */
export const adminAccAdjust = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        wallet: z.string().min(2).max(80),
        token: z.string().min(1).max(32),
        delta: z.number().refine((v) => v !== 0, "Ноль двигать нечего"),
        reason: z.string().min(4).max(120),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const admin = requirePayoutsAdmin();
    // Начислить USDT — пообещать живые деньги: только из свободного с запасом (§8.49а).
    if (data.delta > 0 && data.token.trim().toLowerCase() === "usdt") {
      const { assertSpendableUsdt } = await import("../usdt-guard");
      await assertSpendableUsdt(data.delta, "начисление USDT");
    }
    const { accMove } = await import("./move");
    const { nanoid } = await import("nanoid");
    const ref = `adj:${nanoid(10)}:${data.reason.replace(/[^\p{L}\p{N} _.-]/gu, "").slice(0, 80)}`;
    const res = await accMove({
      wallet: data.wallet.trim().toLowerCase(),
      token: data.token.trim(),
      delta: data.delta,
      kind: "acc_adjust",
      ref,
    });
    console.log(
      `[acc-adjust] ${admin} → ${data.wallet} ${data.delta} ${data.token}: ${data.reason}`,
    );
    return { ok: true as const, balance: res.balance, ref };
  });
