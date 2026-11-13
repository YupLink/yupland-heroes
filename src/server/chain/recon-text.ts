// Тексты сверки индексатора: подписи видов расхождений и письма админам (рус., как
// прочие админские письма бота).
import type { ReconIssue, ReconStats } from "./recon";

export const ISSUE_TITLE: Record<string, string> = {
  deposit_not_on_chain: "Sendler зачислил пополнение, а в сети его нет",
  chain_not_credited: "В сети пришло на наш кошелёк, в игре не зачтено",
  deposit_amount_mismatch: "Сумма зачисления не совпала с сетью",
  payout_not_recorded: "С нашего кошелька ушло без записи о выплате",
  payout_not_on_chain: "Выплата отмечена, а в сети её нет",
  nft_owner_differs: "Владелец NFT у Sendler и в сети разный",
  indexer_stale: "Индексатор не опрашивает сеть",
  indexer_errors: "У индексатора много ошибок",
};

const short = (h: string) => (h.length > 16 ? `${h.slice(0, 8)}…${h.slice(-4)}` : h);

function detailLine(i: ReconIssue): string {
  const d = i.detail;
  const parts = [d.wallet ?? d.from ?? d.to, d.token, d.amount ?? d.credited, d.chain]
    .filter((x) => x !== undefined && x !== null && x !== "")
    .map(String);
  return `${short(i.key)}${parts.length ? ` · ${parts.join(" · ")}` : ""}`;
}

/** Письмо о новых тревогах (до 10 строк). */
export function alarmText(issues: readonly ReconIssue[]): string {
  const lines = issues
    .slice(0, 10)
    .map((i) => `• ${ISSUE_TITLE[i.kind] ?? i.kind}\n  ${detailLine(i)}`);
  const more = issues.length > 10 ? `\n…и ещё ${issues.length - 10}` : "";
  return `⚠️ Сверка блокчейна: новые расхождения — ${issues.length}\n\n${lines.join("\n")}${more}\n\nПодробно: «$ Экономика → Блокчейн».`;
}

const n = (v: unknown) => Number(v ?? 0).toLocaleString("ru-RU");

/** Сводка за сутки. */
export function dailyText(s: ReconStats, open: number): string {
  const h = s.health ?? {};
  return [
    `🧾 Сверка блокчейна за сутки${open ? ` — открыто расхождений: ${open}` : " — расхождений нет"}`,
    `Пополнения: Sendler ${n(s.deposits.sendler24)}, в сети ${n(s.deposits.chainIn24)}`,
    `Выплаты: в сети ${n(s.payouts.chainOut24)}`,
    `С ${String(s.since).slice(0, 10)}: пополнений ${n(s.deposits.matched)}/${n(s.deposits.sendler)} совпало, входящих зачтено ${n(s.deposits.credited)}/${n(s.deposits.chainIn)}, выплат записано ${n(s.payouts.recorded)}/${n(s.payouts.chainOut)}`,
    `NFT: совпало ${n(s.nft.same)} из ${n(s.nft.total)}; сожжено (у Sendler ещё числятся) ${n(s.nft.burnedOurs)}; перешли после снимка Sendler ${n(s.nft.movedAfterSnap)}; расходятся ${n(s.nft.differs)}`,
    `Индексатор: последний проход ${h.ok_at ? String(h.ok_at).slice(11, 19) + " UTC" : "—"}, за сутки ошибок ${n(s.day?.errors)}, отказов «часто» ${n(s.day?.rateLimited)}`,
  ].join("\n");
}
