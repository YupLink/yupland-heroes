import { createServerFn } from "@tanstack/react-start";
import { pg } from "../db/pg";
import { getCurrentWallet } from "../auth";
import { getSisterWallets } from "./user-claims-core";
import { resolveStuckProcessing } from "./user-payouts-resolver";

export const getPendingPayouts = createServerFn({ method: "GET" }).handler(async () => {
  const wallet = getCurrentWallet();
  if (!wallet) return [];
  await resolveStuckProcessing();
  const sisters = await getSisterWallets(wallet);

  const pendingReds = (
    await pg.redemptions
      .raw()
      .select("*")
      .in("wallet", sisters)
      .eq("status", "pending")
      .gt("amount", 0)
      .neq("contract_id", "admin_grant")
      // Заявка на вывод СО СЧЁТА — это уже списанные деньги, ждущие отправки.
      // Показать её как «доступно» значит показать одни деньги дважды, а при
      // повторном нажатии — попытаться вывести их второй раз.
      .neq("contract_id", "acct")
  ).data as Array<{
    id: string;
    amount: number;
    reward_token: string | null;
    ft_contract: string | null;
    decimals: number | null;
    campaign_id: string | null;
  }> | null;
  const reds = pendingReds ?? [];

  const campIds = Array.from(new Set(reds.map((r) => r.campaign_id).filter(Boolean))) as string[];
  const camps =
    campIds.length > 0
      ? (((await pg.campaigns.raw().select("id,reward_token").in("id", campIds)).data as Array<{
          id: string;
          reward_token: string;
        }>) ?? [])
      : [];
  const campMap = new Map(camps.map((c) => [c.id, c.reward_token]));
  const rtSymbols = Array.from(new Set(camps.map((c) => c.reward_token)));
  const rts =
    rtSymbols.length > 0
      ? (((
          await pg.rewardTokens.raw().select("symbol,ft_contract,decimals").in("symbol", rtSymbols)
        ).data as Array<{
          symbol: string;
          ft_contract: string;
          decimals: number;
        }>) ?? [])
      : [];
  const rtMap = new Map(rts.map((r) => [r.symbol, r]));

  const rows = reds.map((r) => {
    const joinTok = r.campaign_id ? (campMap.get(r.campaign_id) ?? null) : null;
    const joinRt = joinTok ? rtMap.get(joinTok) : undefined;
    return {
      id: r.id,
      amount: r.amount,
      rewardToken: r.reward_token ?? joinTok,
      ftContract: r.ft_contract ?? joinRt?.ft_contract ?? null,
      decimals: r.decimals ?? joinRt?.decimals ?? null,
    };
  });

  const byToken = new Map<
    string,
    {
      symbol: string;
      ftContract: string | null;
      decimals: number | null;
      amount: number;
      ids: string[];
    }
  >();
  for (const r of rows) {
    const symbol = r.rewardToken ?? "?";
    const cur = byToken.get(symbol);
    if (cur) {
      cur.amount += r.amount;
      cur.ids.push(r.id);
    } else {
      byToken.set(symbol, {
        symbol,
        ftContract: r.ftContract,
        decimals: r.decimals,
        amount: r.amount,
        ids: [r.id],
      });
    }
  }

  // Ресурсный счёт — те же деньги, просто в другой таблице. Награда,
  // уехавшая на счёт, обязана оставаться видимой здесь: «Мои NFT» — второй
  // терминал вывода того же баланса, а не отдельный карман.
  try {
    const { accBalances } = await import("./currency/move");
    for (const b of await accBalances(wallet)) {
      if (!(b.balance > 0)) continue;
      // STARS — внутренний невыводимый ресурс: в список «К выводу» он попадать
      // не должен (вывести звёзды нельзя, у них и ft-контракта нет).
      if (b.token.toUpperCase() === "STARS") continue;
      const cur = byToken.get(b.token);
      if (cur) cur.amount += b.balance;
      else
        byToken.set(b.token, {
          symbol: b.token,
          ftContract: null,
          decimals: null,
          amount: b.balance,
          ids: [],
        });
    }
    // Контракт и знаки для тех токенов, что пришли только со счёта.
    const need = Array.from(byToken.values())
      .filter((g) => g.ftContract == null)
      .map((g) => g.symbol);
    if (need.length > 0) {
      const { data } = await pg.rewardTokens
        .raw()
        .select("symbol,ft_contract,decimals")
        .in("symbol", need);
      for (const t of (data ?? []) as Array<{
        symbol: string;
        ft_contract: string;
        decimals: number;
      }>) {
        const g = byToken.get(t.symbol);
        if (!g) continue;
        g.ftContract = t.ft_contract;
        g.decimals = t.decimals;
      }
    }
  } catch {
    // Счёт недоступен — очередь наград показываем как раньше.
  }

  return Array.from(byToken.values()).map((g) => ({
    symbol: g.symbol,
    amount: g.amount,
    claimsCount: g.ids.length,
    payable: g.ftContract != null && g.decimals != null,
  }));
});
