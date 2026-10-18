import { createServerFn } from "@tanstack/react-start";
import { pg } from "../db/pg";
import { getCurrentWallet } from "../auth";
import { mcpExec } from "../db/mcpClient";
import { getSisterWallets } from "./user-shared";

function rawToHumanLocal(raw: string, decimals: number): string {
  if (decimals === 0) return raw;
  const r = BigInt(raw);
  const divisor = 10n ** BigInt(decimals);
  const whole = r / divisor;
  const remainder = r % divisor;
  if (remainder === 0n) return whole.toString();
  const frac = remainder
    .toString()
    .padStart(decimals, "0")
    .replace(/0+$/, "")
    .slice(0, 4);
  return frac ? `${whole}.${frac}` : whole.toString();
}

function yoctoToNearHuman(y: string): string {
  return rawToHumanLocal(y, 24);
}

/**
 * Балансы всех known reward-tokens + NEAR по sister-кошелькам.
 * NEAR-баланс возвращается отдельным полем (human, e.g. "12.345").
 */
export const mySisterWalletsBalances = createServerFn({ method: "GET" })
  .handler(async () => {
    const wallet = getCurrentWallet();
    if (!wallet) return { active: null, byToken: {}, near: { totalHuman: "0" } };
    const sisters = await getSisterWallets(wallet);
    const tokens = await pg.rewardTokens.findMany();
    const tokenByContract = new Map(tokens.map((t) => [t.ft_contract, t]));

    const FASTNEAR = "https://api.fastnear.com";
    const results = await Promise.all(
      sisters.map(async (acc) => {
        let fts: Array<{ contract_id: string; balance: string }> = [];
        try {
          const r = await fetch(
            `${FASTNEAR}/v1/account/${encodeURIComponent(acc)}/ft`
          );
          if (r.ok) {
            const j = (await r.json()) as {
              tokens?: Array<{ contract_id: string; balance: string }>;
            };
            fts = (j.tokens ?? []).filter((t) => t.balance && t.balance !== "0");
          }
        } catch {
          // ignore single-wallet failure
        }
        let nearYocto = "0";
        try {
          const { nearRpc } = await import("../rpc");
          const j = await nearRpc<{ amount?: string }>("query", {
            request_type: "view_account",
            finality: "final",
            account_id: acc,
          });
          nearYocto = j.result?.amount ?? "0";
        } catch {
          // ignore
        }
        return { acc, fts, nearYocto };
      })
    );

    const byToken: Record<
      string,
      {
        symbol: string;
        ftContract: string;
        decimals: number;
        totalRaw: string;
        totalHuman: string;
        byWallet: Array<{ wallet: string; raw: string; human: string }>;
      }
    > = {};

    for (const r of results) {
      for (const t of r.fts) {
        const meta = tokenByContract.get(t.contract_id);
        if (!meta) continue;
        const cur = byToken[meta.symbol] ?? {
          symbol: meta.symbol,
          ftContract: meta.ft_contract,
          decimals: meta.decimals,
          totalRaw: "0",
          totalHuman: "0",
          byWallet: [],
        };
        cur.totalRaw = (BigInt(cur.totalRaw) + BigInt(t.balance)).toString();
        cur.byWallet.push({
          wallet: r.acc,
          raw: t.balance,
          human: rawToHumanLocal(t.balance, meta.decimals),
        });
        byToken[meta.symbol] = cur;
      }
    }
    for (const k of Object.keys(byToken)) {
      byToken[k].totalHuman = rawToHumanLocal(
        byToken[k].totalRaw,
        byToken[k].decimals
      );
    }

    const totalNearYocto = results
      .reduce((acc, r) => acc + BigInt(r.nearYocto), 0n)
      .toString();

    return {
      active: wallet,
      byToken,
      near: {
        totalYocto: totalNearYocto,
        totalHuman: yoctoToNearHuman(totalNearYocto),
        byWallet: results.map((r) => ({
          wallet: r.acc,
          yocto: r.nearYocto,
          human: yoctoToNearHuman(r.nearYocto),
        })),
      },
    };
  });

/**
 * История покупок билетов игрока (по всем sister-кошелькам аккаунта).
 */
export const getMyTicketHistory = createServerFn({ method: "GET" }).handler(
  async () => {
    const wallet = getCurrentWallet();
    if (!wallet)
      return [] as Array<{
        offerId: string;
        ticketsAdded: number;
        paymentToken: string | null;
        paymentAmount: number | null;
        energySpent: number;
        kind: "token" | "energy" | "comp";
        createdAt: string;
      }>;
    const sisters = await getSisterWallets(wallet);
    const inl = sisters.map((w) => `'${w.replace(/'/g, "''")}'`).join(",");
    const rows = (await mcpExec(
      `SELECT offer_id, tickets_added, payment_token, payment_amount, energy_spent, created_at
         FROM yuplink.ticket_purchases WHERE wallet IN (${inl})
         ORDER BY created_at DESC LIMIT 100;`,
      { wrapJson: true }
    )) as Array<{
      offer_id: string;
      tickets_added: number;
      payment_token: string | null;
      payment_amount: number | null;
      energy_spent: number;
      created_at: string;
    }>;
    return rows.map((r) => {
      const isToken = !!r.payment_token && Number(r.payment_amount) > 0;
      const isEnergy = Number(r.energy_spent) > 0;
      return {
        offerId: r.offer_id,
        ticketsAdded: Number(r.tickets_added),
        paymentToken: r.payment_token,
        paymentAmount: r.payment_amount != null ? Number(r.payment_amount) : null,
        energySpent: Number(r.energy_spent),
        kind: isToken ? ("token" as const) : isEnergy ? ("energy" as const) : ("comp" as const),
        createdAt: r.created_at,
      };
    });
  }
);
