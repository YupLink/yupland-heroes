// Долг за дыру грядки (владелец, 13.11.2026; ПРАВИЛА §8.129): виден в Казне сверху, там
// же «Отдать» золото — сколько игрок выберет. Вывод закрыт, пока долг открыт
// (yuplink.withdraw_unlisted), половина золотой продажи уходит в долг сама (res_move).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { sb } from "../../db/pg";
import { requireWallet, getCurrentWallet } from "../../auth";
import { moneyGate } from "../../rateGate";
import { accAccountId } from "../currency/move";
import { openDebt, type DebtView } from "./debt-read";

export const getMyDebt = createServerFn({ method: "GET" }).handler(
  async (): Promise<DebtView | null> => {
    const wallet = getCurrentWallet();
    if (!wallet) return null;
    return openDebt(await accAccountId(wallet));
  },
);

export const payDebt = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        amount: z
          .number()
          .positive()
          .max(1e12)
          .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, "debt.badAmount"),
        op: z.string().regex(/^[A-Za-z0-9_-]{8,40}$/),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ taken: number; left: number }> => {
    const wallet = requireWallet();
    await moneyGate("debt-pay", wallet);
    const account = await accAccountId(wallet);
    if (!account) throw new Error("debt.none");
    const { error, data: rows } = await sb.rpc("debt_pay", {
      p_account: account,
      p_amount: data.amount,
      p_ref: `${account}:${data.op}`,
    });
    if (error) {
      const raw = String(error.message ?? "");
      if (/в минус/.test(raw)) throw new Error("debt.notEnoughGold");
      if (/debt_none/.test(raw)) throw new Error("debt.none");
      throw new Error(raw || "debt.none");
    }
    const r = (rows as Array<{ taken: number; debt_left: number }> | null)?.[0];
    return { taken: Number(r?.taken ?? 0), left: Number(r?.debt_left ?? 0) };
  });
