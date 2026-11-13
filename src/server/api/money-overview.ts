// Вкладка «Счета» (владелец, 03.10.2026): что где лежит сейчас, что готово к
// раздаче и кому, что уже разослано и как обернулся пул карты. Только чтение.
//
// «Готово к раздаче» — если разослать прямо сейчас по действующим правилам:
//  · «Раздача DARAI» от «К распределению»: дупло 50 %, Ярослав 12,5 %,
//    Миша 12,5 %, держатели legendary 25 %;
//  · подписки, DARAI: корзина «Сжечь» → дупло, «Разработчикам» → по долям;
//  · подписки, USDT: доля карты (30 %) меняется сразу после покупки; из
//    корзины $ — разработчикам USDT (50 из 70), обмен в дупло (20 из 70).
import { createServerFn } from "@tanstack/react-start";
import { requirePayoutsAdmin } from "../auth";
import { mcpExec } from "../db/mcpClient";
import { moneySql } from "./money-overview-sql";
import { teamOwnerWallet, teamPartnerWallet } from "../team";
import { SPLIT, USD_BUCKET_DEV_SHARE } from "@/lib/energySub";

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * darai — уйдёт DARAI; usdt — уйдёт USDT как есть (разработчикам);
 * viaSwap — USDT, которые сначала поменяются на DARAI и придут уже DARAI.
 */
export type Recipient = { key: string; name: string; wallet: string; darai: number; usdt: number; viaSwap: number };

export const adminMoneyOverview = createServerFn({ method: "GET" }).handler(async () => {
  requirePayoutsAdmin();
  const [{ daraiPools }, { freeTokenPool }, { bucketBalances }, { loadDist }, { fetchDaraiBalance }] =
    await Promise.all([
      import("./darai-pools"),
      import("./token-free-pool"),
      import("./energy-sub/buckets"),
      import("./autodist/rules"),
      import("./payouts-balance"),
    ]);
  const { firstRow } = await import("./energy-sub/grant");
  const { daraiPerUsd } = await import("./energy-sub/rate");
  const [pools, usdt, bal, dist, rows, duploRaw, rate] = await Promise.all([
    daraiPools(),
    freeTokenPool("USDT").catch(() => null),
    bucketBalances(),
    loadDist(),
    mcpExec(moneySql(teamOwnerWallet(), teamPartnerWallet())),
    fetchDaraiBalance("darai_duplo.near").catch(() => null),
    daraiPerUsd().catch(() => null),
  ]);
  const r = firstRow<Record<string, unknown>>(rows) ?? {};
  const { moneySubs } = await import("./money-subs");
  const subs = await moneySubs(bal).catch(() => null);

  const free = Math.max(0, pools.payoutAvailable);
  const share = (w: string) => (w ? (dist.devWallets.find((d) => d.wallet === w)?.share ?? 0) : 0);
  // Кошельки команды — из env (server/team); подписи экрана берутся отсюда.
  const owner = { name: "Миша", wallet: teamOwnerWallet() };
  const partner = { name: "Ярослав", wallet: teamPartnerWallet() };
  const label = (p: { name: string; wallet: string }) =>
    [p.name, p.wallet].filter(Boolean).join(" · ");
  // Корзина $ (70 % USDT-оплат): разработчикам USDT, остальное — обмен в дупло.
  // «$ → карта» (30 %) меняется сразу после покупки — здесь лишь то, что ждёт обмена.
  const devUsdt = bal.sub_usd * USD_BUCKET_DEV_SHARE;
  const swapUsdt = bal.sub_usd - devUsdt;
  const ready: Recipient[] = [
    { key: "duplo", name: "Дупло (сжигание)", wallet: "darai_duplo.near", darai: free * 0.5 + bal.sub_burn, usdt: 0, viaSwap: swapUsdt },
    // + аукционы админа: целиком разработчикам по тем же долям (14.10)
    { key: "owner", ...owner, darai: free * 0.125 + (bal.sub_dev + bal.auc_darai) * share(owner.wallet), usdt: (devUsdt + bal.auc_usd) * share(owner.wallet), viaSwap: 0 },
    { key: "partner", ...partner, darai: free * 0.125 + (bal.sub_dev + bal.auc_darai) * share(partner.wallet), usdt: (devUsdt + bal.auc_usd) * share(partner.wallet), viaSwap: 0 },
    { key: "legendary", name: "Держатели legendary", wallet: "", darai: free * 0.25, usdt: 0, viaSwap: 0 },
    { key: "map", name: "Пул карты", wallet: "", darai: 0, usdt: 0, viaSwap: bal.sub_usd_map },
  ];

  const placed = n(r.map_placed);
  return {
    now: { pools, usdt, buckets: bal },
    /** Подписки: внесено и куда ушло (money-subs.ts); null — не прочиталось. */
    subs,
    ready: {
      recipients: ready,
      /** DARAI за 1 USDT по курсу Ref (≈ $1); null — курс недоступен. */
      daraiPerUsdt: rate?.rate ?? null,
      free,
      subDarai: bal.sub_burn + bal.sub_dev,
      subUsdt: bal.sub_usd / (1 - SPLIT.USDT.map),
      /** Копилки аукционов админа (вам целиком). */
      aucDarai: bal.auc_darai,
      aucUsdt: bal.auc_usd,
      rules: dist.rules,
      /** Настройки целиком — карточка правит пороги и сохраняет их обратно. */
      dist,
    },
    sent: {
      count: n(r.dist_count),
      total: n(r.dist_total),
      duplo: n(r.dist_duplo) + n(r.sub_burned),
      owner: n(r.dist_owner) + n(r.sub_dev_darai) * share(owner.wallet),
      partner: n(r.dist_partner) + n(r.sub_dev_darai) * share(partner.wallet),
      /** Подписи строк «Имя · кошелёк» — кошельки из env сервера. */
      labels: { owner: label(owner), partner: label(partner) },
      legendary: n(r.dist_legendary),
      devUsdt: n(r.sub_dev_usdt),
      failed: n(r.dist_failed),
      /** Всего лежит в дупле — вместе с тем, что жгут другие проекты. */
      duploOnChain: duploRaw == null ? null : Number(duploRaw / 10n ** 12n) / 1e6,
    },
    players: {
      deposited: n(r.dep_legacy) + n(r.dep_acc),
      depositedLegacy: n(r.dep_legacy),
      withdrawn: n(r.withdrawn),
      inFlight: pools.inFlight,
      rewards: n(r.rewards),
      spent: n(r.spent),
      onAccounts: pools.playersOnAccounts + pools.legacyBalances,
    },
    map: {
      treasury: n(r.map_treasury),
      swaps: n(r.map_swaps),
      subs: n(r.map_subs),
      spend: n(r.map_spend),
      buyback: n(r.map_buyback),
      placed,
      onMapNow: pools.onMapNow,
      // фонд идущего турнира — бронь, а не унесённое игроками
      collected: Math.max(0, placed - pools.onMapNow - pools.tournamentFunds),
      mines: n(r.map_mines),
      fixes: n(r.map_fixes),
      balance: n(r.map_balance),
    },
  };
});

export type MoneyOverview = Awaited<ReturnType<typeof adminMoneyOverview>>;
