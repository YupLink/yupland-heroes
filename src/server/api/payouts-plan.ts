// Расчёт «Раздачи DARAI»: от какой суммы, кому и сколько. Правило раздачи
// (по требованию):
//   50%   → darai_duplo.near (дупло)
//   25%   → поровну между держателями NFT "Yup'ik YupLink (legendary)"
//   12.5% → партнёр (TEAM_PARTNER_WALLET)
//   12.5% → владелец (TEAM_OWNER_WALLET)
// Кошельки команды — из env (server/team): в превью пустой виден как есть, а
// список перевода (distributionItems) без них не собирается.
// Чистый расчёт без проверки прав: его зовут экран раздачи (payouts.ts, там
// requireAdmin) и авторассылка (autodist/free-darai.ts).
import type { DaraiPools } from "./darai-pools";
import {
  fetchLegendaryHolders,
  LEGENDARY_NFT_NAME,
  LEGENDARY_NFT_CONTRACT,
  SYSTEM_WALLETS_EXCLUDED_FROM_HOLDERS,
} from "./payouts-legendary";
import { requireTeamWallet, teamWallet, teamWalletTag } from "../team";

export const DARAI_FT_CONTRACT = "darai.tkn.near";
export const DARAI_DECIMALS = 18;
const SOURCE_WALLET = "darai_gdrop.near";
const DUPLO_WALLET = "darai_duplo.near";

/** Делим bigint на 100 умножая на проценты (×100 чтобы поддержать половинки). */
function takePercent(totalRaw: bigint, pctTimes10: bigint): bigint {
  // pctTimes10 = % × 10, чтобы 12.5% было 125. Делим на 1000.
  return (totalRaw * pctTimes10) / 1000n;
}

function rawToHumanDarai(raw: bigint): number {
  // 2 знака после запятой достаточно для отображения.
  return Number(raw / 10n ** BigInt(DARAI_DECIMALS - 2)) / 100;
}

/** human → yocto. Копейки отбрасываем вниз, чтобы не раздать больше, чем есть. */
function humanToRawDarai(human: number): bigint {
  if (!Number.isFinite(human) || human <= 0) return 0n;
  return BigInt(Math.floor(human * 100)) * 10n ** BigInt(DARAI_DECIMALS - 2);
}

/** Превью раздачи: пусто amountHuman — от «К распределению». */
export async function distributionPreview(pools: DaraiPools, amountHuman?: number) {
  // 1) Раскладка кошелька: сколько всего, сколько под карту, сколько наше.
  const balanceRaw = humanToRawDarai(pools.walletBalance);
  const availableHuman = Math.max(0, pools.payoutAvailable);

  // 2) Сумма, от которой считаем. Пусто = доступное к раздаче (не весь
  //    баланс!). Свой объём админ может задать больше — предупредим на
  //    клиенте, но не запретим: деньги его.
  const totalRaw =
    amountHuman != null
      ? humanToRawDarai(amountHuman)
      : humanToRawDarai(availableHuman);

  // 3) Держатели legendary (Sendler API — канон, DB — fallback).
  const fetched = await fetchLegendaryHolders();
  const rawHolders = fetched.holders;
  const totalLegendaryNfts = fetched.totalFound;
  const activeHolders = rawHolders.filter(
    (h) => !SYSTEM_WALLETS_EXCLUDED_FROM_HOLDERS.has(h.wallet)
  );
  const systemHeldNfts = rawHolders
    .filter((h) => SYSTEM_WALLETS_EXCLUDED_FROM_HOLDERS.has(h.wallet))
    .reduce((s, h) => s + h.qty, 0);

  // 4) Доли (×10 чтобы поддержать половинки: 125 = 12.5%)
  const duploRaw = takePercent(totalRaw, 500n); // 50%
  const legendaryRaw = takePercent(totalRaw, 250n); // 25%
  const partnerRaw = takePercent(totalRaw, 125n); // 12.5%
  const ownerRaw = takePercent(totalRaw, 125n); // 12.5%

  // 5) Делим legendary-долю по КОЛИЧЕСТВУ NFT, не по держателям.
  //    Кто держит больше копий — получит пропорционально больше.
  //    sum(qty) у active holders (без системных кошей).
  const totalActiveNfts = activeHolders.reduce((s, h) => s + h.qty, 0);
  const perNftRaw =
    totalActiveNfts > 0 ? legendaryRaw / BigInt(totalActiveNfts) : 0n;

  // 6) Остаток от деления (может быть пара yocto) — не теряем,
  //    показываем отдельно. При реальной раздаче можно прицепить к first.
  const legendaryRemainderRaw =
    totalActiveNfts > 0
      ? legendaryRaw - perNftRaw * BigInt(totalActiveNfts)
      : legendaryRaw;

  const holdersWithAmount = activeHolders.map((h) => {
    const amountRaw = perNftRaw * BigInt(h.qty);
    return {
      wallet: h.wallet,
      qty: h.qty,
      amountRaw: amountRaw.toString(),
      amountHuman: rawToHumanDarai(amountRaw),
    };
  });

  return {
    sourceWallet: SOURCE_WALLET,
    ftContract: DARAI_FT_CONTRACT,
    decimals: DARAI_DECIMALS,
    balanceRaw: balanceRaw.toString(),
    balanceHuman: pools.walletBalance,
    // Доступное к раздаче = баланс минус всё, что уже чьё-то (darai-pools).
    availableHuman,
    pools: {
      walletBalance: pools.walletBalance,
      mapReserved: pools.mapReserved,
      payoutAvailable: pools.payoutAvailable,
      playerObligations: pools.playerObligations,
      collectionDeposited: pools.collectionDeposited,
      mapSpent: pools.mapSpent,
      // Что ещё лежит на кошельке, но уже чьё-то (в раздачу не идёт).
      onMapNow: pools.onMapNow,
      playersOnAccounts: pools.playersOnAccounts,
      rewardsQueue: pools.rewardsQueue,
      inFlight: pools.inFlight,
      giftsPending: pools.giftsPending,
      subReserve: pools.subReserve,
      unsettledDeposits: pools.unsettledDeposits,
      legacyBalances: pools.legacyBalances,
      bossRewards: pools.bossRewards,
      warehouseDarai: pools.warehouseDarai,
      pendingRequests: pools.pendingRequests,
      tournamentFunds: pools.tournamentFunds,
      bankDarai: pools.bankDarai,
    },
    totalRaw: totalRaw.toString(),
    totalHuman: rawToHumanDarai(totalRaw),
    legendary: {
      nftName: LEGENDARY_NFT_NAME,
      nftContract: LEGENDARY_NFT_CONTRACT,
      holdersSource: fetched.source, // 'sendler' | 'db-fallback'
      totalNfts: totalLegendaryNfts,
      systemHeldNfts,
      activeNftsCount: totalActiveNfts,
      activeHoldersCount: activeHolders.length,
      excludedSystemWallets: Array.from(SYSTEM_WALLETS_EXCLUDED_FROM_HOLDERS),
      sharePercent: 25,
      totalRaw: legendaryRaw.toString(),
      totalHuman: rawToHumanDarai(legendaryRaw),
      perNftRaw: perNftRaw.toString(),
      perNftHuman: rawToHumanDarai(perNftRaw),
      remainderRaw: legendaryRemainderRaw.toString(),
      remainderHuman: rawToHumanDarai(legendaryRemainderRaw),
      holders: holdersWithAmount,
    },
    duplo: {
      wallet: DUPLO_WALLET,
      sharePercent: 50,
      amountRaw: duploRaw.toString(),
      amountHuman: rawToHumanDarai(duploRaw),
    },
    partner: {
      title: teamWalletTag("partner"),
      wallet: teamWallet("partner"),
      sharePercent: 12.5,
      amountRaw: partnerRaw.toString(),
      amountHuman: rawToHumanDarai(partnerRaw),
    },
    owner: {
      title: teamWalletTag("owner"),
      wallet: teamWallet("owner"),
      sharePercent: 12.5,
      amountRaw: ownerRaw.toString(),
      amountHuman: rawToHumanDarai(ownerRaw),
    },
  };
}

export type DistributionPreview = Awaited<ReturnType<typeof distributionPreview>>;

/** Получатели батча: дупло, партнёр, владелец, держатели legendary. Кошелёк команды не задан — ошибка. */
export function distributionItems(preview: DistributionPreview) {
  const partner = requireTeamWallet("partner");
  const owner = requireTeamWallet("owner");
  return [
    { recipient: preview.duplo.wallet, amountHuman: preview.duplo.amountHuman, tag: "duplo 50%" },
    { recipient: partner, amountHuman: preview.partner.amountHuman, tag: `${preview.partner.title} 12.5%` },
    { recipient: owner, amountHuman: preview.owner.amountHuman, tag: `${preview.owner.title} 12.5%` },
    ...preview.legendary.holders.map((h) => ({
      recipient: h.wallet,
      amountHuman: h.amountHuman,
      tag: `legendary × ${h.qty} NFT`,
    })),
  ];
}
