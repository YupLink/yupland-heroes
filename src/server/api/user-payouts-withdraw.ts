import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { pg, type PgRedemption } from "../db/pg";
import { getCurrentWallet, getSessionTgId } from "../auth";
import { isWalletTg } from "@/lib/auth/googleTg";
import { assertNotMaintenance } from "../maintenance";
import { requireLinkedTelegram } from "./user-claims-inventory";
import { getSisterWallets } from "./user-claims-core";
import { resolveStuckProcessing } from "./user-payouts-resolver";
import { type RowMeta, type TokenGroup } from "./user-payouts-lock";
import { processPayment } from "./user-payouts-execute";
import { assertAccountWithdrawOpen } from "./google-login/noWithdraw";

export const withdrawTokens = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        symbol: z.string().min(1).optional(),
        recipient: z.string().min(1).optional(),
        splits: z
          .array(
            z.object({
              recipient: z.string().min(1),
              amount: z.number().int().positive(),
            }),
          )
          .min(1)
          .optional(),
        // Сколько снять со счёта. Без него со счёта уходит весь остаток по
        // этому токену — так работает кнопка «вывести всё» в «Мои NFT».
        amount: z.number().positive().optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data }) => {
    assertNotMaintenance();
    // Кошелёк со ссылки «Короны» (08.11) — только DARAI со счёта; остальным — как было.
    await assertAccountWithdrawOpen(data.symbol ?? "");
    const wallet = getCurrentWallet();
    if (!wallet) throw new Error("Кошелёк не подключён");
    await requireLinkedTelegram(wallet);
    await resolveStuckProcessing();
    const sisters = await getSisterWallets(wallet);

    if (data.splits && !data.symbol) {
      throw new Error("Для сплита укажи symbol");
    }
    if (data.splits) {
      for (const s of data.splits) {
        if (!sisters.includes(s.recipient)) {
          throw new Error(`Получатель ${s.recipient} не в твоём наборе`);
        }
      }
    }

    const recipient = data.recipient && sisters.includes(data.recipient) ? data.recipient : wallet;

    // Счёт — тот же кошелёк, просто другая таблица. Если на нём лежит этот
    // токен, заводим заявку прямо сейчас: дальше она поедет обычным
    // конвейером в этом же вызове, и оба терминала вывода — «Мои NFT» и
    // «Кошелёк» — работают с одними деньгами.
    // Счёт открыт по рубильнику раскатки: до неё — только владельцу, после —
    // всем. Гейт здесь обязателен, этот эндпоинт открыт каждому игроку.
    let accountError: string | null = null;
    const { isPayoutsAdminWallet } = await import("../auth");
    const { accountOpenToAll } = await import("./account-rollout");
    const accountOn = isPayoutsAdminWallet(wallet) || (await accountOpenToAll());
    if (data.symbol && accountOn) {
      try {
        const { accBalance } = await import("./currency/move");
        const onAccount = await accBalance(wallet, data.symbol);
        const want = data.splits
          ? data.splits.reduce((s2, x) => s2 + x.amount, 0)
          : (data.amount ?? onAccount);
        const take = Math.floor(Math.min(want, onAccount));
        if (take > 0) {
          const { draftAccountWithdrawal } = await import("./currency/withdraw");
          await draftAccountWithdrawal({
            wallet,
            token: data.symbol,
            amount: take,
            recipient,
          });
        }
      } catch (e) {
        // Со счёта не получилось — это не повод рушить вывод наград, но
        // причину надо запомнить: раньше она уходила в лог, а игрок видел
        // «нет ожидающих выплат» и не понимал, что не так. Игрок с 83 000
        // Darai упиралась в минимум вывода и читала это как поломку.
        accountError = e instanceof Error ? e.message : String(e);
        console.error("[withdraw] счёт:", accountError);
      }
    }

    const pendingReds = (
      await pg.redemptions.raw().select("*").in("wallet", sisters).eq("status", "pending")
    ).data as PgRedemption[] | null;
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
            await pg.rewardTokens
              .raw()
              .select("symbol,ft_contract,decimals")
              .in("symbol", rtSymbols)
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
        contractId: r.contract_id,
        tokenId: r.token_id,
        campaignId: r.campaign_id,
        redWallet: r.wallet,
      };
    });

    // Вход по кошельку без Telegram выводит только заявку со счёта (лимит «введённое + 10 %»).
    const own = isWalletTg(getSessionTgId()) ? rows.filter((r) => r.contractId === "acct") : rows;
    const filtered = data.symbol ? own.filter((r) => r.rewardToken === data.symbol) : own;
    const payable = filtered.filter((r) => r.ftContract != null && r.decimals != null);
    if (payable.length === 0) {
      // Если заявка со счёта не завелась — говорим ПОЧЕМУ. «Нет ожидающих
      // выплат» при полном счёте выглядит как поломка игры.
      if (accountError) throw new Error(accountError);
      throw new Error(
        data.symbol ? `Нет ожидающих выплат для ${data.symbol}` : "Нет ожидающих выплат",
      );
    }

    const payableSymbols = Array.from(
      new Set(payable.map((p) => p.rewardToken).filter(Boolean) as string[]),
    );
    const minWithdrawRows =
      payableSymbols.length > 0
        ? (((await pg.rewardTokens.raw().select("symbol,min_withdraw").in("symbol", payableSymbols))
            .data as Array<{ symbol: string; min_withdraw: number }>) ?? [])
        : [];
    const minMap = new Map(minWithdrawRows.map((r) => [r.symbol, r.min_withdraw ?? 1]));
    const totalsBySymbol = new Map<string, number>();
    for (const r of payable) {
      const key = r.rewardToken!;
      totalsBySymbol.set(key, (totalsBySymbol.get(key) ?? 0) + r.amount);
    }
    const tooSmall: string[] = [];
    for (const [sym, total] of totalsBySymbol) {
      const min = minMap.get(sym) ?? 1;
      if (total < min) tooSmall.push(`${sym}: ${total} < ${min}`);
    }
    if (tooSmall.length === totalsBySymbol.size) {
      throw new Error(`Минимум для вывода не накоплен: ${tooSmall.join(", ")}`);
    }

    const groups = new Map<string, TokenGroup>();
    for (const r of payable) {
      const key = r.rewardToken!;
      const cur = groups.get(key);
      const meta: RowMeta = {
        id: r.id,
        amount: r.amount,
        contractId: r.contractId,
        tokenId: r.tokenId,
        campaignId: r.campaignId,
        redWallet: r.redWallet,
      };
      if (cur) {
        cur.amount += r.amount;
        cur.rows.push(meta);
      } else {
        groups.set(key, {
          symbol: key,
          ftContract: r.ftContract!,
          decimals: r.decimals!,
          amount: r.amount,
          rows: [meta],
        });
      }
    }

    const results: Array<{
      symbol: string;
      amount: number;
      recipient?: string;
      txHash: string | null;
      error?: string;
    }> = [];

    for (const g of groups.values()) {
      if (!data.splits && Math.floor(g.amount) < 1) {
        results.push({
          symbol: g.symbol,
          amount: 0,
          txHash: null,
          error: `Накопилось ${g.amount} ${g.symbol} — для вывода нужно ≥1 (копится)`,
        });
        continue;
      }
      const payments = data.splits
        ? data.splits.map((s) => ({ recipient: s.recipient, amount: s.amount }))
        : [{ recipient, amount: Math.floor(g.amount) }];

      const sumSplits = payments.reduce((s, p) => s + p.amount, 0);
      if (sumSplits > g.amount) {
        results.push({
          symbol: g.symbol,
          amount: sumSplits,
          txHash: null,
          error: `Сумма сплита ${sumSplits} > доступно ${g.amount}`,
        });
        continue;
      }

      for (const pay of payments) {
        await processPayment(g, pay, results);
      }
    }

    return { results };
  });
