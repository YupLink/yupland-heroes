// «$ Экономика → Блокчейн»: сверка своего индексатора NEAR с Sendler и записями игры.
import type { Lang } from "../store";

export const dict: Record<string, Record<Lang, string>> = {
  "econ.tab.chain": { ru: "Блокчейн", en: "Blockchain" },
  "econ.chain.indexer": { ru: "Индексатор", en: "Indexer" },
  "econ.chain.last_pass": { ru: "Последний проход", en: "Last pass" },
  "econ.chain.ago": { ru: "{n} с назад", en: "{n}s ago" },
  "econ.chain.day_polls": { ru: "Проходов за сутки", en: "Passes in 24h" },
  "econ.chain.day_errors": { ru: "Ошибок за сутки", en: "Errors in 24h" },
  "econ.chain.day_limited": { ru: "Отказов «часто» за сутки", en: "Rate limits in 24h" },
  "econ.chain.last_error": { ru: "Последняя ошибка", en: "Last error" },
  "econ.chain.recon": { ru: "Сверка", en: "Reconciliation" },
  "econ.chain.since": { ru: "с {d}", en: "since {d}" },
  "econ.chain.day": { ru: "за сутки", en: "24h" },
  "econ.chain.deposits": {
    ru: "Пополнения Sendler — есть в сети",
    en: "Sendler deposits — on chain",
  },
  "econ.chain.incoming": {
    ru: "Входящие в сети — зачтены в игре",
    en: "Incoming on chain — credited",
  },
  "econ.chain.payouts": {
    ru: "Исходящие в сети — есть запись выплаты",
    en: "Outgoing on chain — payout recorded",
  },
  "econ.chain.nft_same": { ru: "NFT: владелец совпал", en: "NFT: same owner" },
  "econ.chain.nft_burned": {
    ru: "NFT сожжены (у Sendler ещё числятся)",
    en: "NFT burned (still listed by Sendler)",
  },
  "econ.chain.nft_moved": {
    ru: "NFT перешли после снимка Sendler",
    en: "NFT moved after Sendler snapshot",
  },
  "econ.chain.nft_differs": { ru: "NFT: владелец расходится", en: "NFT: owner differs" },
  "econ.chain.open": { ru: "Расхождения · {n}", en: "Discrepancies · {n}" },
  "econ.chain.none": { ru: "Расхождений нет", en: "No discrepancies" },
  "econ.chain.resolved": { ru: "Решено за 7 дней: {n}", en: "Resolved in 7 days: {n}" },
  "econ.chain.run_at": { ru: "Сверка: {t}", en: "Checked: {t}" },
  "econ.chain.no_run": { ru: "Сверка ещё не запускалась", en: "Not checked yet" },
  "econ.chain.kind.deposit_not_on_chain": {
    ru: "Sendler зачислил, в сети нет",
    en: "Credited by Sendler, not on chain",
  },
  "econ.chain.kind.chain_not_credited": {
    ru: "Пришло в сети, не зачтено",
    en: "Received on chain, not credited",
  },
  "econ.chain.kind.deposit_amount_mismatch": {
    ru: "Сумма не совпала с сетью",
    en: "Amount differs from chain",
  },
  "econ.chain.kind.payout_not_recorded": {
    ru: "Ушло без записи о выплате",
    en: "Sent without a payout record",
  },
  "econ.chain.kind.payout_not_on_chain": {
    ru: "Выплата отмечена, в сети нет",
    en: "Payout recorded, not on chain",
  },
  "econ.chain.kind.nft_owner_differs": { ru: "Владелец NFT расходится", en: "NFT owner differs" },
  "econ.chain.kind.indexer_stale": { ru: "Индексатор молчит", en: "Indexer is silent" },
  "econ.chain.kind.indexer_errors": {
    ru: "Много ошибок индексатора",
    en: "Too many indexer errors",
  },
};
