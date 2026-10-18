// Сведение леджерных kind'ов к группам админа.
//
// Леджеры писались годами разными руками: у acc_ledger направление сделки
// живёт в префиксе ref (mkt:/town-sell:/portal:…), у res_ledger — в kind,
// у билетов — двадцать видов. Отчёты не хотят знать эти различия, поэтому
// вся таблица соответствий собрана здесь и покрыта тестом; чистая функция,
// базы не касается. Место из ref разбирает соседний ref-place.ts.
import type { EconKindGroup } from "@/lib/econ/types";

export type EconLedger = "acc" | "res" | "ticket" | "energy" | "likes" | "trade";

/** Часть ref до первого двоеточия: 'mkt:abc:...' → 'mkt'. */
export const refPrefix = (ref: string | null): string => (ref ?? "").split(":", 1)[0] ?? "";

/** Таблица «группа → её kind'ы» разворачивается в словарь kind → группа. */
function table(spec: Partial<Record<EconKindGroup, string[]>>): Record<string, EconKindGroup> {
  const out: Record<string, EconKindGroup> = {};
  for (const [group, kinds] of Object.entries(spec)) {
    for (const k of kinds ?? []) out[k] = group as EconKindGroup;
  }
  return out;
}

/** Префикс ref в acc_ledger → куда ушли/откуда пришли деньги. */
const ACC_BY_PREFIX = table({
  trade_buy: ["mkt", "shop", "cpack", "epack", "esub", "town-buy"],
  trade_sell: ["mkt-sell", "town-sell"],
  sink: [
    "portal",
    "gate",
    "build",
    "spell_learn",
    "spell_forget",
    "boost",
    "tree",
    "chambers",
    "field_recall",
    "oblivion",
    // Запись на турнир ценой в токене (tour-entry): 'tour:<турнир>:<аккаунт>:<ключ>'.
    "tour",
  ],
  reward: ["red"],
  // wdh — вывод DARAI холдеров со сроком (§8.51); bstk — вклад банка и его возврат — «прочее»
  withdraw: ["wd", "wdh"],
  mine: ["mine"],
});

const ACC_BY_KIND = table({
  reward: ["acc_reward"],
  mine: ["mine"],
  deposit: ["acc_deposit", "acc_stars"],
  withdraw: ["acc_withdraw"],
  gift: ["acc_adjust"],
});

// С 28.09 награды карты и урожай грядок пишутся своими видами (ПРАВИЛА §8.18):
// 'mob' — добыча с моба, 'reward' — прочие награды, 'field' — грядка. Прежние
// строки этих источников остались видом 'mine'.
const RES_BY_KIND = table({
  trade_buy: ["market_buy"],
  trade_sell: ["market_sell"],
  other: ["wh_take"],
  // tour_fee — плата за запись на турнир (цена у турнира своя), сгорает;
  // tour_fee_refund — её откат, когда запись сорвалась (как portal_refund).
  // bank_stake_back — золото, возвращённое за снятие вклада раньше срока (§8.51)
  sink: ["portal", "portal_refund", "tour_fee", "tour_fee_refund", "bank_stake_back"],
  gift: ["gift"],
  // bank_stake — золото стейкинга банка
  reward: ["mob", "reward", "bank_stake"],
  mine: ["mine", "mine_refund", "field"],
});

const TICKET_BY_KIND = table({
  deposit: ["purchase"],
  trade_sell: ["market_sale"],
  trade_buy: ["market_buy"],
  reward: ["raid_reward", "nft_claim", "mining", "collection_farm", "referral", "task"],
  sink: ["chip_pack", "energy_pack", "like_purchase", "craft", "building", "mint_fee"],
  gift: ["admin_grant"],
});
// Слоты и платные розыгрыши — тоже сток; отдельной строкой, чтобы читалось.
for (const k of ["university_slot", "mining_slot", "redemption"]) TICKET_BY_KIND[k] = "sink";

// currency_ledger: энергия (energy_*) и токены (deposit|reward|payout|purchase|adjust).
// Возврат траты (energy_refund) — та же группа, что трата: сальдо честное.
const ENERGY_BY_KIND = table({
  energy_regen: ["energy_regen"],
  energy_decay: ["energy_decay"],
  energy_spend: ["energy_spend", "energy_refund"],
  gift: ["energy_admin", "energy_gift", "energy_owner", "admin_grant", "energy_grant"],
  deposit: ["energy_pack", "energy_market", "energy_add", "energy_like", "deposit"],
  reward: ["energy_reward", "energy_boss", "energy_drop", "energy_mystic", "energy_opening"],
  mine: ["mine", "mine_refund"],
  withdraw: ["payout"],
  trade_buy: ["purchase"],
});
// Хвост списка подарков и токенные kind'ы без префикса energy_.
for (const k of ["energy_compensation", "energy_tester", "adjust"]) ENERGY_BY_KIND[k] = "gift";
ENERGY_BY_KIND.reward = "reward";

// use — выпил/съел из рюкзака (drink:use, 12.10.2026): товар сгорел, как плата.
// Улов (fish:take/put) — как прочие «положил/забрал» (урожай грядки field:put/take): other.
const TRADE_BY_SIDE = table({ trade_buy: ["buy"], trade_sell: ["sell"], sink: ["pay", "use"] });

/**
 * Группа движения. Для лайков kind синтетический: 'grant:<префикс ref>' и
 * 'spend:<reason>'; для сделок — '<source>:<side>'.
 */
export function groupOfKind(ledger: EconLedger, kind: string, ref: string | null): EconKindGroup {
  switch (ledger) {
    case "acc":
      return ACC_BY_KIND[kind] ?? ACC_BY_PREFIX[refPrefix(ref)] ?? "other";
    case "res":
      return RES_BY_KIND[kind] ?? "other";
    case "ticket":
      return TICKET_BY_KIND[kind] ?? "other";
    case "energy":
      // 'spend:<причина>' — строки суточного агрегата energy_spend_daily в ленте.
      if (kind.startsWith("spend:")) return "energy_spend";
      // Энергия подписки: вид подарка (тает так же), но куплена — ref 'esub:'.
      if (ref?.startsWith("esub:")) return "deposit";
      return ENERGY_BY_KIND[kind] ?? "other";
    case "likes": {
      if (kind.startsWith("spend:")) return "sink";
      const src = kind.slice("grant:".length);
      return src === "stars" ? "deposit" : src === "gift" ? "gift" : "reward";
    }
    case "trade":
      return TRADE_BY_SIDE[kind.split(":").pop() ?? ""] ?? "other";
  }
}
